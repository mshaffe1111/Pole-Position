// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Smooth, Forgiving, User-Friendly Mobile Multi-Touch, Tilt Gyro, Keyboard & Gamepad:
// - Progressive User-Friendly Steering Curve (λ = 0.35 default, ±180° F1 Wheel, ±28° Tilt)
// - Steering Assist / Traction Control ('FULL' | 'SPORT' | 'OFF', default 'FULL')
//   with Gentle Road-Tangent Centering & Anti-Twitch Smoothing
// - Casiez 1€ Adaptive Low-Pass Filters (Wheel/Slider 6.5Hz & Tilt Gyro 3.2Hz)
// - Zero Closed-Loop SAT Input Fighting (SAT + Flat-Spot -> FFB Arc & Haptics)
// - C1-Continuous Key/Arrow Rate Envelopes & Progressive 0->100% Analog Pedals
// - Unified Brake Assist ('OFF' | 'MIN' | 'FULL') Delegated to 240Hz Physics
// ============================================================================

const DEFAULT_STEERING_LINEARITY = 0.35;
const DEFAULT_SENSITIVITY = 0.90;

const WHEEL_MICRO_DEADZONE_PX = 3.0;
const WHEEL_DEADZONE_KNEE_PX = 3.5;
const WHEEL_MAX_LOCK_DEG = 180.0;

const TILT_DEADZONE_DEG = 0.8;
const TILT_DEADZONE_KNEE_DEG = 0.8;
const TILT_BASE_MAX_DEG = 28.0;

const GAMEPAD_AXIS_DEADZONE = 0.22;
const GAMEPAD_AXIS_KNEE = 0.05;
const GAMEPAD_TRIGGER_DEADZONE = 0.08;

// Position-mapped inputs NEVER add SAT into steer angle (prevents closed-loop oscillation!)
const SAT_ACTIVE_ASSIST_BLEND = 0.0;
const SAT_RELEASE_RETURN_GAIN = 0.32;

const WHEEL_ONE_EURO_FC_MIN = 6.5;
const WHEEL_ONE_EURO_BETA = 0.32;
const TILT_ONE_EURO_FC_MIN = 3.2;
const TILT_ONE_EURO_BETA = 0.25;

const TIRE_OUTER_RADIUS_M = 0.36;
const VISOR_WIPE_DURATION_SEC = 0.38;
const VIRTUAL_HID_IGNORE_RE = /vjoy|virtual\s*hid|spacemouse|3dconnexion|headtrack/i;

function clamp(v, min, max) {
  return v < min ? min : (v > max ? max : v);
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(1e-5, edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

function expSmoothing(rate, dt) {
  return 1.0 - Math.exp(-rate * dt);
}

/**
 * C1-continuous micro-deadzone rescaling onto [-1, +1]:
 * - Strictly 0.0 for |val| <= deadzone
 * - Smooth quadratic C1 knee on (deadzone, deadzone + kneeWidth) (f'(deadzone) = 0 -> f'(deadzone+knee) = 1)
 * - Exact 1:1 constant slope above deadzone + kneeWidth, reaching ±1.0 at ±maxVal
 */
function mapSmoothDeadzoneNormalized(val, deadzone, kneeWidth, maxVal) {
  const absV = Math.abs(val);
  if (absV <= deadzone) return 0.0;
  const knee = Math.max(1e-5, kneeWidth);
  const effectiveMax = Math.max(deadzone + knee + 1e-4, maxVal);
  const normDenom = effectiveMax - deadzone - 0.5 * knee;
  const u = absV - deadzone;
  const shaped = u < knee ? (u * u) / (2.0 * knee) : u - 0.5 * knee;
  return clamp(Math.sign(val) * (shaped / Math.max(1e-5, normDenom)), -1.0, 1.0);
}

/**
 * C-infinity analytical steering linearity curve:
 * f(x, λ) = (1 - λ)x + λx³, default λ = 0.35 (gentle, forgiving center precision + full lock authority)
 */
export function applySteeringLinearity(x, linearity = DEFAULT_STEERING_LINEARITY) {
  const cx = clamp(Number(x) || 0.0, -1.0, 1.0);
  const rawLam = (linearity === undefined || linearity === null) ? DEFAULT_STEERING_LINEARITY : Number(linearity);
  const lam = clamp(Number.isFinite(rawLam) ? rawLam : DEFAULT_STEERING_LINEARITY, 0.0, 1.0);
  if (lam <= 1e-5) return cx;
  return (1.0 - lam) * cx + lam * (cx * cx * cx);
}

function normalizeLinearitySetting(val) {
  if (val === null || val === undefined || val === '') return DEFAULT_STEERING_LINEARITY;
  let num = Number(val);
  if (!Number.isFinite(num)) return DEFAULT_STEERING_LINEARITY;
  if (num > 1.0001) num *= 0.01; // Accept 0..100% slider integers seamlessly
  return clamp(num, 0.0, 1.0);
}

/**
 * Normalize Brake Assist setting to 'OFF' | 'MIN' | 'FULL' (defaulting to 'MIN'):
 * - Legacy 'LOW' -> 'MIN'
 * - Legacy 'MED' | 'MEDIUM' | 'HIGH' | true -> 'FULL'
 * - 'OFF' | 'NONE' | false -> 'OFF'
 */
export function normalizeBrakingAssist(val) {
  if (val === false) return 'OFF';
  if (val === true) return 'FULL';
  if (val === null || val === undefined || val === '') return 'MIN';
  const upper = String(val).toUpperCase().trim();
  if (upper === 'OFF' || upper === 'NONE' || upper === '0') return 'OFF';
  if (upper === 'MIN' || upper === 'MINIMUM' || upper === 'LOW') return 'MIN';
  if (upper === 'FULL' || upper === 'MED' || upper === 'MEDIUM' || upper === 'HIGH') return 'FULL';
  return 'MIN';
}

/**
 * Normalize Steering Assist / Traction Control setting to 'FULL' | 'SPORT' | 'OFF' (defaulting to 'FULL'):
 * - 'FULL' | 'ON' | 'HIGH' | 'MAX' | true -> 'FULL'
 * - 'SPORT' | 'MED' | 'MEDIUM' | 'LOW' | 'MIN' -> 'SPORT'
 * - 'OFF' | 'NONE' | '0' | false -> 'OFF'
 */
export function normalizeTractionControl(val) {
  if (val === false) return 'OFF';
  if (val === true) return 'FULL';
  if (val === null || val === undefined || val === '') return 'FULL';
  const upper = String(val).toUpperCase().trim();
  if (upper === 'OFF' || upper === 'NONE' || upper === '0' || upper === 'FALSE') return 'OFF';
  if (upper === 'SPORT' || upper === 'MED' || upper === 'MEDIUM' || upper === 'LOW' || upper === 'MIN') return 'SPORT';
  if (upper === 'FULL' || upper === 'HIGH' || upper === 'MAX' || upper === 'ON' || upper === 'TRUE') return 'FULL';
  return 'FULL';
}

/**
 * 1€ Adaptive Low-Pass Filter (Casiez, Roussel & Vogel, CHI 2012):
 * Ultra-steady jitter suppression when holding straight or steady corner arcs,
 * with smooth adaptive tracking on deliberate corner turn-ins & counter-steer catches.
 */
export class OneEuroFilter {
  constructor(fcMin = WHEEL_ONE_EURO_FC_MIN, beta = WHEEL_ONE_EURO_BETA, dCutoff = 1.5) {
    this.fcMin = fcMin;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this._initialized = false;
    this._xPrev = 0.0;
    this._dxPrev = 0.0;
  }

  _alpha(dt, cutoffHz) {
    const safeDt = Math.max(1e-4, dt);
    const safeFc = Math.max(1e-3, cutoffHz);
    const tau = 1.0 / (2.0 * Math.PI * safeFc);
    return 1.0 / (1.0 + tau / safeDt);
  }

  reset(initialValue = 0.0) {
    this._xPrev = Number.isFinite(initialValue) ? initialValue : 0.0;
    this._dxPrev = 0.0;
    this._initialized = true;
  }

  clear() {
    this._xPrev = 0.0;
    this._dxPrev = 0.0;
    this._initialized = false;
  }

  filter(x, dt) {
    const val = Number.isFinite(x) ? x : 0.0;
    const safeDt = clamp(Number(dt) || (1.0 / 60.0), 0.0005, 0.1);
    if (!this._initialized) {
      this._initialized = true;
      this._xPrev = val;
      this._dxPrev = 0.0;
      return val;
    }

    const dx = (val - this._xPrev) / safeDt;
    const alphaD = this._alpha(safeDt, this.dCutoff);
    const edx = this._dxPrev + alphaD * (dx - this._dxPrev);

    const fc = this.fcMin + this.beta * Math.abs(edx);
    const alphaX = this._alpha(safeDt, fc);
    let xHat = this._xPrev + alphaX * (val - this._xPrev);

    if (val === 0.0 && Math.abs(xHat) < 0.0012) {
      xHat = 0.0;
    }

    this._xPrev = xHat;
    this._dxPrev = edx;
    return xHat;
  }
}

export class ErgonomicControls {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.handedness = 'RIGHT_HANDED'; // 'RIGHT_HANDED' | 'LEFT_HANDED'
    this.steeringStyle = 'WHEEL';     // 'WHEEL' | 'BUTTONS' | 'TILT' | 'SLIDER'

    // Active normalized outputs sent to vehicle physics
    this.steer = 0.0;    // [-1..1] normalized rack target
    this.throttle = 0.0; // [0..1]
    this.brake = 0.0;    // [0..1] pure manual brake (authoritative assist runs in physics.js)
    this.manualThrottle = 0.0;
    this.manualBrake = 0.0;
    this.assistBrakeApplied = 0.0;

    // Tactical F1 MGU-K ERS Overtake Boost & FIA DRS Wing Flap outputs (read directly by physics.js)
    this.ersOvertakeActive = false;
    this.drsManualOpen = false;
    this._ersTouchHeld = false;
    this._ersLatched = false;
    this._ersTouchDownMs = 0.0;
    this._ersTouchId = null;
    this._ersPointerId = null;
    this._lastErsTapEndMs = 0.0;
    this._lastDrsTapEndMs = 0.0;
    this._lastTearOffTapEndMs = 0.0;
    this._gpPrevDrsBtn = false;
    this._gpErsHeld = false;
    this._lastPlayerCarRef = null;
    this._hapticLastByKind = {};
    this.ersBtnEl = null;
    this.ersPctEl = null;
    this.drsBtnEl = null;
    this.tearOffBtnEl = null;

    // Customizable Ergonomics & Driving Assists (mirrored at top-level for physics/HUD convenience)
    this.controlSettings = {
      sensitivity: DEFAULT_SENSITIVITY,              // [0.6..1.5] default 0.90 for calm, user-friendly control
      steeringLinearity: DEFAULT_STEERING_LINEARITY, // [0.0..1.0] default 0.35 forgiving progressive center
      linearity: DEFAULT_STEERING_LINEARITY,         // alias for steeringLinearity
      controlScale: 1.0,                             // [0.65..1.35]
      controlOpacity: 0.92,                          // [0.25..1.0]
      brakingAssist: 'MIN',                          // 'OFF' | 'MIN' | 'FULL' (defaults to 'MIN')
      tractionControl: 'FULL',                       // 'FULL' | 'SPORT' | 'OFF' (defaults to 'FULL')
      autoThrottle: false,                           // boolean
      haptics: true,                                 // boolean
    };
    this.sensitivity = DEFAULT_SENSITIVITY;
    this.steeringLinearity = DEFAULT_STEERING_LINEARITY;
    this.linearity = DEFAULT_STEERING_LINEARITY;
    this.controlScale = 1.0;
    this.controlOpacity = 0.92;
    this.brakingAssist = 'MIN';
    this.tractionControl = 'FULL';
    this.autoThrottle = false;
    this.haptics = true;

    // Anti-twitch & road-tangent steering assist state
    this._assistSmoothedSteer = 0.0;
    this.roadTangentSteerAssist = 0.0;

    // Strict >= 0.22 deadzone prevents phantom pull from virtual HID controllers
    this.gamepadDeadzone = GAMEPAD_AXIS_DEADZONE;
    this._gpPrevShiftUp = false;
    this._gpPrevShiftDown = false;
    this._gpShiftInitialized = false;
    this._activeGamepad = null;

    // Native TouchEvent identifier state (isolates multi-touch thumbs on iOS Safari & Android Chrome)
    this._hasNativeTouch =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));
    this._wheelTouchId = null;
    this._sliderTouchId = null;
    this._arrowTouchId = null;
    this._pedalTouchId = null;

    // Relative-anchor F1 Wheel & Touch Slider pointer state (where thumb lands = 0.0 deg straight!)
    this.wheelPointerId = null;
    this.wheelAnchorX = 0.0;
    this.wheelTouchSteer = 0.0;
    this._wheelDownTimeMs = 0;
    this._wheelMaxMovePx = 0;

    this.sliderPointerId = null;
    this.sliderAnchorX = 0.0;
    this.sliderTouchSteer = 0.0;
    this._sliderZoneBound = false;

    // 1€ Adaptive Low-Pass Filters (Wheel/Slider: 6.5Hz, β=0.32 | Tilt Gyro: 3.2Hz, β=0.25)
    this._wheelOneEuro = new OneEuroFilter(WHEEL_ONE_EURO_FC_MIN, WHEEL_ONE_EURO_BETA, 1.5);
    this._sliderOneEuro = new OneEuroFilter(WHEEL_ONE_EURO_FC_MIN, WHEEL_ONE_EURO_BETA, 1.5);
    this._tiltOneEuro = new OneEuroFilter(TILT_ONE_EURO_FC_MIN, TILT_ONE_EURO_BETA, 1.2);

    // Dual Arrow Buttons pointer state (seamless thumb-slide between ◀ and ▶)
    this.arrowPointerId = null;
    this.arrowDir = 0; // -1 | 0 | +1
    this.arrowRampSteer = 0.0;

    // Mobile Accelerometer / DeviceOrientation Tilt Steering state
    this.tiltCenterDeg = 0.0;
    this.tiltRawSteer = 0.0;
    this.tiltFilteredSteer = 0.0;
    this.tiltSensorAvailable = false;
    this.tiltFallbackActive = false;
    this._lastRawTiltDeg = 0.0;
    this._tiltHasSensorData = false;
    this._tiltNeedsAutoCenter = true;
    this._tiltListenerBound = false;
    this._tiltPermissionRequested = false;
    this._tiltFallbackTimer = null;

    // Multi-touch Analog Pedal pointer state (with horizontal trail-brake rollover)
    this.pedalPointerId = null;
    this.touchGas = 0.0;
    this.touchBrake = 0.0;
    this._pedalZoneState = 'NONE';
    this._fullBrakeLockActive = false;
    this._lastPedalHapticMs = 0;
    this._lastCarGear = 1;

    // Physics-Driven Self-Aligning Torque (SAT), Tire Flat-Spot Vibration, Look-to-Apex & Visor Tear-Off
    this.selfAligningTorque = 0.0;     // [-1..1] pneumatic-trail + rear-oversteer counter-torque
    this.ffbTorqueNormalized = 0.0;    // [-1..1] visual FFB torque indicator arc signal
    this.tireFlatSpotVibration = 0.0;  // [0..1] wheel-frequency flat-spot harmonic thump
    this._flatSpotPhaseRad = 0.0;
    this._lastFlatSpotVibMs = 0;
    this.speedSteerAuthority = 1.0;    // Single-authority steering angle taper lives in physics.js
    this.lookApexNormalized = 0.0;     // [-1..1] smooth cockpit/chase look-to-apex yaw signal
    this.visorTearOffProgress = 1.0;   // [0..1] 0 -> 1 visor wipe sweep (1.0 = clean)
    this.visorTearOffCount = 0;
    this._visorGestureTouchId = null;
    this._visorGestureStartX = 0.0;
    this._visorGestureStartY = 0.0;
    this._visorGestureStartMs = 0.0;
    this._visorLastTapMs = 0.0;
    this._visorLastTapX = 0.0;
    this._visorLastTapY = 0.0;
    this._lastSatVibMs = 0;

    // Frame timestamp / pending-update guard so applyPhysicsFeedback executes at most ONCE per frame
    this._feedbackPendingForUpdate = false;
    this._lastFeedbackStampMs = -1.0;
    this._lastFeedbackCarRef = null;

    // Keyboard state
    this.keys = new Set();
    this.kbSteer = 0.0;

    this._lastVib = 0;
    this._brakeAssistStyled = false;

    this._bindDOM();
    this._bindKeyboard();
    this.setGearboxUI('AUTO_8SPD', 1);
    this._applyControlVisualSettings();
  }

  _bindDOM() {
    if (typeof document === 'undefined') return;

    this.hudControlsEl =
      document.getElementById('mobile-controls-layer') ||
      document.getElementById('touch-controls-layer');
    this.touchControlsLayerAltEl = document.getElementById('touch-controls-layer');

    this.wheelZoneEl = document.getElementById('touch-wheel-zone');
    this.wheelRingOuterEl = this.wheelZoneEl ? this.wheelZoneEl.querySelector('.wheel-ring-outer') : null;
    this.wheelGraphicEl = document.getElementById('virtual-wheel-graphic');
    this.wheelReadoutEl = document.getElementById('wheel-angle-readout');
    this.wheelHubEl = this.wheelReadoutEl;
    this.wheelShiftLedsWrapEl = document.getElementById('wheel-shift-leds');
    this.wheelCaptionEl = this.wheelZoneEl ? this.wheelZoneEl.querySelector('.control-caption') : null;
    this.wheelLedEls = Array.from(document.querySelectorAll('.w-led'));

    this.sliderZoneEl = document.getElementById('touch-slider-zone');
    this.sliderThumbEl =
      document.getElementById('touch-slider-thumb') ||
      (this.sliderZoneEl ? this.sliderZoneEl.querySelector('.slider-thumb, .steer-slider-thumb') : null);

    this.arrowZoneEl = document.getElementById('touch-arrow-zone');
    this.btnLeftEl = document.getElementById('btn-steer-left');
    this.btnRightEl = document.getElementById('btn-steer-right');

    this.tiltZoneEl = document.getElementById('touch-tilt-zone');
    this.btnCalibrateTiltEl = document.getElementById('btn-calibrate-tilt');

    this.pedalAssemblyEl = document.getElementById('touch-pedal-assembly');
    this.pedalZoneEl = document.getElementById('touch-pedal-zone');
    this.gasPedalEl = document.getElementById('pedal-gas-card');
    this.brakePedalEl = document.getElementById('pedal-brake-card');
    this.gasFillEl = document.getElementById('pedal-gas-fill');
    this.brakeFillEl = document.getElementById('pedal-brake-fill');
    this.gasPctEl = document.getElementById('pedal-gas-pct');
    this.brakePctEl = document.getElementById('pedal-brake-pct');

    this.shifterBtnEl = document.getElementById('touch-shifter-btn');
    this.seqShifterWrapEl = document.getElementById('seq-shifter-wrap');
    this.seqGearNumEl = document.getElementById('seq-gear-num');
    this.shiftDownBtnEl = document.getElementById('touch-shift-down-btn');
    this.shiftUpBtnEl = document.getElementById('touch-shift-up-btn');

    this._ensureFfbTorqueArc();

    // Lock touch-action and selection on all interactive cockpit surfaces for Safari/Chrome
    const touchSurfaces = [
      this.hudControlsEl,
      this.touchControlsLayerAltEl,
      this.wheelZoneEl,
      this.sliderZoneEl,
      this.arrowZoneEl,
      this.tiltZoneEl,
      this.pedalAssemblyEl,
      this.pedalZoneEl,
      this.shifterBtnEl,
      this.shiftDownBtnEl,
      this.shiftUpBtnEl,
    ];
    for (const el of touchSurfaces) {
      if (!el) continue;
      el.style.userSelect = 'none';
      el.style.webkitUserSelect = 'none';
      el.style.webkitTouchCallout = 'none';
      if (el !== this.hudControlsEl && el !== this.touchControlsLayerAltEl) {
        el.style.touchAction = 'none';
      }
    }

    if (this.hudControlsEl) {
      this.hudControlsEl.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // Ignore synthetic touch pointer events whenever native TouchEvents are active
    const ignoreTouchPointer = (e) => this._hasNativeTouch && e.pointerType === 'touch';
    this._ignoreTouchPointer = ignoreTouchPointer;

    // ------------------------------------------------------------------------
    // 1A. Relative-Anchor Virtual F1 Steering Wheel (1:1 Motion, Zero Snap!)
    // ------------------------------------------------------------------------
    const releaseWheelPointer = (pointerId) => {
      if (pointerId !== undefined && pointerId !== this.wheelPointerId) return;
      this.wheelPointerId = null;
      if (this._wheelTouchId === null) {
        this.wheelTouchSteer = 0.0;
        this._wheelOneEuro.clear();
        this.wheelZoneEl?.classList.remove('wheel-active');
      }
    };
    const releaseWheelTouch = (touchId) => {
      if (touchId !== undefined && touchId !== this._wheelTouchId) return;
      this._wheelTouchId = null;
      if (this.wheelPointerId === null) {
        this.wheelTouchSteer = 0.0;
        this._wheelOneEuro.clear();
        this.wheelZoneEl?.classList.remove('wheel-active');
      }
    };
    this._releaseWheelPointer = releaseWheelPointer;
    this._releaseWheelTouch = releaseWheelTouch;

    const beginWheelTrack = (clientX) => {
      this.wheelAnchorX = clientX; // Exact thumb landing spot = 0.0° straight ahead!
      this.wheelTouchSteer = 0.0;
      this._wheelOneEuro.reset(0.0);
      this._wheelDownTimeMs = performance.now();
      this._wheelMaxMovePx = 0.0;
      this.wheelZoneEl?.classList.add('wheel-active');
      this._vibrate(6);
    };
    this._beginWheelTrack = beginWheelTrack;

    const moveWheelTrack = (pt) => {
      this._wheelMaxMovePx = Math.max(this._wheelMaxMovePx, Math.abs(pt.clientX - this.wheelAnchorX));
      if (this.steeringStyle !== 'TILT' || !this.tiltSensorAvailable || this._wheelMaxMovePx > 10.0) {
        this._updateWheelFromPointer(pt);
      }
    };
    this._moveWheelTrack = moveWheelTrack;

    const checkTiltQuickTapRecenter = () => {
      if (
        this.steeringStyle === 'TILT' &&
        this._wheelMaxMovePx < 8.0 &&
        performance.now() - this._wheelDownTimeMs < 350
      ) {
        this.calibrateTiltCenter();
      }
    };

    if (this.wheelZoneEl) {
      // Native Multi-Touch (Phone / Tablet)
      this.wheelZoneEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        if (this.steeringStyle === 'TILT') this._requestTiltPermissionFromGesture();
        if (this._wheelTouchId === null && this.wheelPointerId === null && e.changedTouches.length > 0) {
          const t = e.changedTouches[0];
          this._wheelTouchId = t.identifier;
          beginWheelTrack(t.clientX);
        }
      }, { passive: false });

      // Desktop Mouse / Pen PointerEvents (NO setPointerCapture on touch, NO lostpointercapture!)
      this.wheelZoneEl.addEventListener('pointerdown', (e) => {
        if (ignoreTouchPointer(e)) return;
        e.preventDefault();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        if (this.steeringStyle === 'TILT') this._requestTiltPermissionFromGesture();
        if (this.wheelPointerId === null && this._wheelTouchId === null) {
          this._clearStalePointerCollision(e.pointerId, 'wheel');
          this.wheelPointerId = e.pointerId;
          beginWheelTrack(e.clientX);
          if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
            try { this.wheelZoneEl.setPointerCapture(e.pointerId); } catch (_) {}
          }
        }
      });

      this.wheelZoneEl.addEventListener('pointermove', (e) => {
        if (ignoreTouchPointer(e)) return;
        if (e.pointerId === this.wheelPointerId) {
          e.preventDefault();
          moveWheelTrack(e);
        }
      });

      const onWheelEnd = (e) => {
        if (ignoreTouchPointer(e)) return;
        if (e.pointerId === this.wheelPointerId) {
          if (e.type === 'pointerup') checkTiltQuickTapRecenter();
          releaseWheelPointer(e.pointerId);
        }
      };
      this.wheelZoneEl.addEventListener('pointerup', onWheelEnd);
      this.wheelZoneEl.addEventListener('pointercancel', onWheelEnd);
    }

    // ------------------------------------------------------------------------
    // 1A-2. Optional Dedicated Linear Touch Slider Zone (1:1 Motion Mapping)
    // ------------------------------------------------------------------------
    this._bindSliderZoneIfPresent();

    // Optional dedicated Tilt Zone / Calibrate Button
    if (this.tiltZoneEl) {
      this.tiltZoneEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        this._requestTiltPermissionFromGesture();
        this.calibrateTiltCenter();
      }, { passive: false });
      this.tiltZoneEl.addEventListener('pointerdown', (e) => {
        if (ignoreTouchPointer(e)) return;
        e.preventDefault();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        this._requestTiltPermissionFromGesture();
        this.calibrateTiltCenter();
      });
    }
    if (this.btnCalibrateTiltEl) {
      this.btnCalibrateTiltEl.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        this._requestTiltPermissionFromGesture();
        this.calibrateTiltCenter();
      });
    }

    // ------------------------------------------------------------------------
    // 1B. Ergonomic Dual Touch Steering Arrows (◀ / ▶ with seamless thumb slide!)
    // ------------------------------------------------------------------------
    const releaseArrowPointer = (pointerId) => {
      if (pointerId !== undefined && pointerId !== this.arrowPointerId) return;
      this.arrowPointerId = null;
      if (this._arrowTouchId === null) {
        this.arrowDir = 0;
        this.btnLeftEl?.classList.remove('pressed');
        this.btnRightEl?.classList.remove('pressed');
      }
    };
    const releaseArrowTouch = (touchId) => {
      if (touchId !== undefined && touchId !== this._arrowTouchId) return;
      this._arrowTouchId = null;
      if (this.arrowPointerId === null) {
        this.arrowDir = 0;
        this.btnLeftEl?.classList.remove('pressed');
        this.btnRightEl?.classList.remove('pressed');
      }
    };
    this._releaseArrowPointer = releaseArrowPointer;
    this._releaseArrowTouch = releaseArrowTouch;

    if (this.arrowZoneEl) {
      this.arrowZoneEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        if (this._arrowTouchId === null && this.arrowPointerId === null && e.changedTouches.length > 0) {
          const t = e.changedTouches[0];
          this._arrowTouchId = t.identifier;
          this._updateArrowFromPointer(t, true);
        }
      }, { passive: false });

      this.arrowZoneEl.addEventListener('pointerdown', (e) => {
        if (ignoreTouchPointer(e)) return;
        e.preventDefault();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        if (this.arrowPointerId === null && this._arrowTouchId === null) {
          this._clearStalePointerCollision(e.pointerId, 'arrow');
          this.arrowPointerId = e.pointerId;
          if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
            try { this.arrowZoneEl.setPointerCapture(e.pointerId); } catch (_) {}
          }
          this._updateArrowFromPointer(e, true);
        }
      });

      this.arrowZoneEl.addEventListener('pointermove', (e) => {
        if (ignoreTouchPointer(e)) return;
        if (e.pointerId === this.arrowPointerId) {
          e.preventDefault();
          this._updateArrowFromPointer(e, false);
        }
      });

      const onArrowEnd = (e) => {
        if (ignoreTouchPointer(e)) return;
        if (e.pointerId === this.arrowPointerId) {
          releaseArrowPointer(e.pointerId);
        }
      };
      this.arrowZoneEl.addEventListener('pointerup', onArrowEnd);
      this.arrowZoneEl.addEventListener('pointercancel', onArrowEnd);
    }

    // ------------------------------------------------------------------------
    // 2. Multi-Touch Analog Gas/Brake Pedals (Progressive 0->100% + Trail Roll!)
    // ------------------------------------------------------------------------
    const releasePedalPointer = (pointerId) => {
      if (pointerId !== undefined && pointerId !== this.pedalPointerId) return;
      this.pedalPointerId = null;
      if (this._pedalTouchId === null) {
        this.touchGas = 0.0;
        this.touchBrake = 0.0;
        this._pedalZoneState = 'NONE';
        this._fullBrakeLockActive = false;
        this.gasPedalEl?.classList.remove('active-pedal');
        this.brakePedalEl?.classList.remove('active-pedal');
      }
    };
    const releasePedalTouch = (touchId) => {
      if (touchId !== undefined && touchId !== this._pedalTouchId) return;
      this._pedalTouchId = null;
      if (this.pedalPointerId === null) {
        this.touchGas = 0.0;
        this.touchBrake = 0.0;
        this._pedalZoneState = 'NONE';
        this._fullBrakeLockActive = false;
        this.gasPedalEl?.classList.remove('active-pedal');
        this.brakePedalEl?.classList.remove('active-pedal');
      }
    };
    this._releasePedalPointer = releasePedalPointer;
    this._releasePedalTouch = releasePedalTouch;

    if (this.pedalZoneEl) {
      this.pedalZoneEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        if (this.steeringStyle === 'TILT') this._requestTiltPermissionFromGesture();
        if (this.callbacks.onClutchTap) this.callbacks.onClutchTap();
        if (this._pedalTouchId === null && this.pedalPointerId === null && e.changedTouches.length > 0) {
          const t = e.changedTouches[0];
          this._pedalTouchId = t.identifier;
          this._updatePedalsFromPointer(t);
        }
      }, { passive: false });

      this.pedalZoneEl.addEventListener('pointerdown', (e) => {
        if (ignoreTouchPointer(e)) return;
        e.preventDefault();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        if (this.steeringStyle === 'TILT') this._requestTiltPermissionFromGesture();
        if (this.callbacks.onClutchTap) this.callbacks.onClutchTap();
        if (this.pedalPointerId === null && this._pedalTouchId === null) {
          this._clearStalePointerCollision(e.pointerId, 'pedal');
          this.pedalPointerId = e.pointerId;
          if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
            try { this.pedalZoneEl.setPointerCapture(e.pointerId); } catch (_) {}
          }
          this._updatePedalsFromPointer(e);
        }
      });

      this.pedalZoneEl.addEventListener('pointermove', (e) => {
        if (ignoreTouchPointer(e)) return;
        if (e.pointerId === this.pedalPointerId) {
          e.preventDefault();
          this._updatePedalsFromPointer(e);
        }
      });

      const onPedalEnd = (e) => {
        if (ignoreTouchPointer(e)) return;
        if (e.pointerId === this.pedalPointerId) {
          releasePedalPointer(e.pointerId);
        }
      };
      this.pedalZoneEl.addEventListener('pointerup', onPedalEnd);
      this.pedalZoneEl.addEventListener('pointercancel', onPedalEnd);
    }

    // ------------------------------------------------------------------------
    // 2B. Forgiving Bottom-Corner Thumb Catcher (38px Halo + Lower-Corner Net)
    // ------------------------------------------------------------------------
    const inExpandedRect = (el, x, y, padPx) => {
      if (!el || el.style.display === 'none') return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      return x >= r.left - padPx && x <= r.right + padPx && y >= r.top - padPx && y <= r.bottom + padPx;
    };

    const handleForgivingThumbCatch = (e) => {
      const layer = this.hudControlsEl;
      if (!layer || layer.style.display === 'none') return;
      const tgt = e.target;
      if (tgt && typeof tgt.closest === 'function') {
        // Skip if already inside a primary control zone or inside any interactive HUD button/drawer/modal
        if (
          tgt.closest(
            '#touch-wheel-zone, #touch-slider-zone, #touch-arrow-zone, #touch-pedal-zone, #touch-tilt-zone, ' +
            '#touch-shifter-btn, #touch-shift-down-btn, #touch-shift-up-btn, ' +
            '#btn-touch-ers, #btn-touch-drs, #btn-touch-tearoff, #btn-toggle-mfd, #live-timing-tower, ' +
            '#touch-tactical-cluster, .touch-tactical-cluster, #proximity-radar-layer, ' +
            'button, a, input, select, textarea, .garage-drawer, .career-drawer, .modal-box, #pause-modal, ' +
            '#pit-strategy-drawer, #pit-stop-overlay, #replay-overlay, .hud-quick-actions, #right-telemetry-dock, #telemetry-2026-panel'
          )
        ) {
          return;
        }
      }

      const viewW = window.visualViewport?.width || window.innerWidth || 1;
      const viewH = window.visualViewport?.height || window.innerHeight || 1;
      const isLeftHanded = this.handedness === 'LEFT_HANDED';
      const activeSteerEl = this.steeringStyle === 'BUTTONS'
        ? this.arrowZoneEl
        : (this.steeringStyle === 'SLIDER' && this.sliderZoneEl
            ? this.sliderZoneEl
            : (this.tiltZoneEl && this.steeringStyle === 'TILT' ? this.tiltZoneEl : this.wheelZoneEl));

      let caught = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (
          t.identifier === this._wheelTouchId ||
          t.identifier === this._sliderTouchId ||
          t.identifier === this._arrowTouchId ||
          t.identifier === this._pedalTouchId ||
          t.identifier === this._ersTouchId
        ) {
          continue;
        }
        const x = t.clientX;
        const y = t.clientY;
        const onLayerOrCanvas =
          tgt === layer ||
          tgt?.tagName === 'CANVAS' ||
          tgt?.id === 'webgl-container' ||
          tgt?.id === 'race-hud';

        const nearPedal =
          inExpandedRect(this.pedalZoneEl, x, y, 38) ||
          (onLayerOrCanvas && y >= viewH * 0.54 && (isLeftHanded ? x <= viewW * 0.42 : x >= viewW * 0.58));

        const nearSteer =
          inExpandedRect(activeSteerEl, x, y, 38) ||
          (onLayerOrCanvas && y >= viewH * 0.54 && (isLeftHanded ? x >= viewW * 0.58 : x <= viewW * 0.42));

        if (nearPedal && this._pedalTouchId === null && this.pedalPointerId === null) {
          this._pedalTouchId = t.identifier;
          if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
          if (this.steeringStyle === 'TILT') this._requestTiltPermissionFromGesture();
          if (this.callbacks.onClutchTap) this.callbacks.onClutchTap();
          this._updatePedalsFromPointer(t);
          caught = true;
        } else if (nearSteer) {
          if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
          if (this.steeringStyle === 'BUTTONS') {
            if (this._arrowTouchId === null && this.arrowPointerId === null) {
              this._arrowTouchId = t.identifier;
              this._updateArrowFromPointer(t, true);
              caught = true;
            }
          } else if (this.steeringStyle === 'SLIDER' && this.sliderZoneEl && this._beginSliderTrack) {
            if (this._sliderTouchId === null && this.sliderPointerId === null) {
              this._sliderTouchId = t.identifier;
              this._beginSliderTrack(x);
              caught = true;
            }
          } else {
            if (this.steeringStyle === 'TILT') this._requestTiltPermissionFromGesture();
            if (this._wheelTouchId === null && this.wheelPointerId === null) {
              this._wheelTouchId = t.identifier;
              beginWheelTrack(x);
              caught = true;
            }
          }
        } else if (onLayerOrCanvas && y > 54 && y < viewH * 0.48 && this._visorGestureTouchId === null) {
          // Upper-center cockpit glass zone: double-tap visor tear-off wipe or swipe camera cycle
          this._visorGestureTouchId = t.identifier;
          this._visorGestureStartX = x;
          this._visorGestureStartY = y;
          this._visorGestureStartMs = performance.now();
        }
      }

      if (caught) {
        e.preventDefault();
      }
    };

    if (this.hudControlsEl) {
      this.hudControlsEl.addEventListener('touchstart', handleForgivingThumbCatch, { passive: false });
    }
    window.addEventListener('touchstart', handleForgivingThumbCatch, { passive: false });

    // Desktop double-click on upper race viewport triggers Cockpit Visor Tear-Off
    window.addEventListener('dblclick', (e) => {
      const layer = this.hudControlsEl;
      if (!layer || layer.style.display === 'none') return;
      const tgt = e.target;
      if (tgt && (tgt.tagName === 'CANVAS' || tgt.id === 'webgl-container' || tgt.id === 'race-hud')) {
        const viewH = window.visualViewport?.height || window.innerHeight || 1;
        if (e.clientY > 54 && e.clientY < viewH * 0.50) {
          this.triggerVisorTearOff();
        }
      }
    });

    // ------------------------------------------------------------------------
    // 2C. Global Window Multi-Touch & Pointer Tracking (Seamless Out-of-Box Drag!)
    // ------------------------------------------------------------------------
    window.addEventListener('touchmove', (e) => {
      let matchedActiveTouch = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this._wheelTouchId) {
          moveWheelTrack(t);
          matchedActiveTouch = true;
        } else if (t.identifier === this._sliderTouchId) {
          this._updateSliderFromPointer(t);
          matchedActiveTouch = true;
        } else if (t.identifier === this._arrowTouchId) {
          this._updateArrowFromPointer(t, false);
          matchedActiveTouch = true;
        } else if (t.identifier === this._pedalTouchId) {
          this._updatePedalsFromPointer(t);
          matchedActiveTouch = true;
        }
      }
      if (matchedActiveTouch) {
        e.preventDefault();
      }
    }, { passive: false });

    const onGlobalTouchEnd = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this._wheelTouchId) {
          if (e.type === 'touchend') checkTiltQuickTapRecenter();
          releaseWheelTouch(t.identifier);
        }
        if (t.identifier === this._sliderTouchId && this._releaseSliderTouch) {
          this._releaseSliderTouch(t.identifier);
        }
        if (t.identifier === this._arrowTouchId) {
          releaseArrowTouch(t.identifier);
        }
        if (t.identifier === this._pedalTouchId) {
          releasePedalTouch(t.identifier);
        }
        if (t.identifier === this._ersTouchId && this._releaseErsTouch) {
          this._releaseErsTouch(t.identifier, e.type === 'touchcancel');
        }
        if (t.identifier === this._visorGestureTouchId) {
          this._visorGestureTouchId = null;
          if (e.type === 'touchend') {
            const nowMs = performance.now();
            const dtMs = nowMs - this._visorGestureStartMs;
            const dx = t.clientX - this._visorGestureStartX;
            const dy = t.clientY - this._visorGestureStartY;
            if (dtMs < 360 && Math.abs(dx) >= 54 && Math.abs(dx) > Math.abs(dy) * 1.6) {
              this.triggerQuickCameraCycle(dx > 0 ? 1 : -1);
            } else if (dtMs < 280 && Math.hypot(dx, dy) < 26) {
              if (
                nowMs - this._visorLastTapMs < 330 &&
                Math.hypot(t.clientX - this._visorLastTapX, t.clientY - this._visorLastTapY) < 42
              ) {
                this._visorLastTapMs = 0;
                this.triggerVisorTearOff();
              } else {
                this._visorLastTapMs = nowMs;
                this._visorLastTapX = t.clientX;
                this._visorLastTapY = t.clientY;
              }
            }
          }
        }
      }
    };
    window.addEventListener('touchend', onGlobalTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onGlobalTouchEnd, { passive: false });

    // Global safety listeners for desktop mouse/pen uncaptured drags & tab switches
    window.addEventListener('pointermove', (e) => {
      if (ignoreTouchPointer(e)) return;
      if (e.pointerId === this.wheelPointerId) {
        moveWheelTrack(e);
      } else if (e.pointerId === this.sliderPointerId) {
        this._updateSliderFromPointer(e);
      } else if (e.pointerId === this.arrowPointerId) {
        this._updateArrowFromPointer(e, false);
      } else if (e.pointerId === this.pedalPointerId) {
        this._updatePedalsFromPointer(e);
      }
    }, { passive: true });

    const onGlobalPointerEnd = (e) => {
      if (ignoreTouchPointer(e)) return;
      if (e.pointerId === this.wheelPointerId) releaseWheelPointer(e.pointerId);
      if (e.pointerId === this.sliderPointerId && this._releaseSliderPointer) this._releaseSliderPointer(e.pointerId);
      if (e.pointerId === this.arrowPointerId) releaseArrowPointer(e.pointerId);
      if (e.pointerId === this.pedalPointerId) releasePedalPointer(e.pointerId);
      if (e.pointerId === this._ersPointerId && this._releaseErsPointer) {
        this._releaseErsPointer(e.pointerId, e.type === 'pointercancel');
      }
    };
    window.addEventListener('pointerup', onGlobalPointerEnd, { passive: true });
    window.addEventListener('pointercancel', onGlobalPointerEnd, { passive: true });

    const resetAllTransientInputs = () => {
      releaseWheelPointer();
      releaseWheelTouch();
      if (this._releaseSliderPointer) this._releaseSliderPointer();
      if (this._releaseSliderTouch) this._releaseSliderTouch();
      releaseArrowPointer();
      releaseArrowTouch();
      releasePedalPointer();
      releasePedalTouch();
      this._ersTouchId = null;
      this._ersPointerId = null;
      this._ersTouchHeld = false;
      this._gpErsHeld = false;
      this.keys.clear();
      this.ersOvertakeActive = Boolean(this._ersLatched);
    };
    window.addEventListener('blur', resetAllTransientInputs);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) resetAllTransientInputs();
    });

    // ------------------------------------------------------------------------
    // 3. Manual Shifters: 1982 LOW/HIGH Toggle & 8-Speed Sequential Paddles
    // ------------------------------------------------------------------------
    const bindShifterButton = (btnEl, kind, dir) => {
      if (!btnEl) return;
      btnEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        this.triggerHaptic(kind);
        if (this.callbacks.onShift) this.callbacks.onShift(dir);
      }, { passive: false });

      btnEl.addEventListener('pointerdown', (e) => {
        if (ignoreTouchPointer(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        this.triggerHaptic(kind);
        if (this.callbacks.onShift) this.callbacks.onShift(dir);
      });
    };

    bindShifterButton(this.shifterBtnEl, 'SHIFT_UP', 0);
    bindShifterButton(this.shiftDownBtnEl, 'SHIFT_DOWN', -1);
    bindShifterButton(this.shiftUpBtnEl, 'SHIFT_UP', +1);

    // ------------------------------------------------------------------------
    // 4. Tactical F1 Cockpit Buttons: MGU-K ERS Boost, FIA DRS Flap & Tear-Off
    // ------------------------------------------------------------------------
    this._bindTacticalButtonsIfPresent();
  }

  _triggerDrsToggle(playerCarOverride = null) {
    const car =
      playerCarOverride ||
      this._lastPlayerCarRef ||
      (typeof window !== 'undefined' ? window.__RACE_PHANATIC_GAME__?.playerCar : null);
    if (!car?.drsAvailable) {
      return false;
    }
    this.drsManualOpen = !this.drsManualOpen;
    this.triggerHaptic('DRS');
    this.callbacks.onDrsToggle?.(this.drsManualOpen);
    return this.drsManualOpen;
  }

  _bindTacticalButtonsIfPresent() {
    if (typeof document === 'undefined') return;
    const ignoreTouchPointer =
      this._ignoreTouchPointer || ((e) => this._hasNativeTouch && e.pointerType === 'touch');

    const lockButtonTouchStyle = (el) => {
      if (!el || !el.style) return;
      el.style.userSelect = 'none';
      el.style.webkitUserSelect = 'none';
      el.style.webkitTouchCallout = 'none';
      el.style.touchAction = 'none';
    };

    // 4A. #btn-touch-ers (MGU-K Overtake Boost: Hold to deploy, <230ms quick-tap toggles latch!)
    const ersBtn = document.getElementById('btn-touch-ers');
    const ersPct = document.getElementById('ers-touch-pct');
    if (ersPct) {
      this.ersPctEl = ersPct;
    } else if (ersBtn && !this.ersPctEl) {
      this.ersPctEl = ersBtn.querySelector('#ers-touch-pct, .ers-pct');
    }

    if (!this._releaseErsTouch) {
      this._releaseErsTouch = (touchId, isCancel = false) => {
        if (touchId !== undefined && touchId !== this._ersTouchId) return;
        this._ersTouchId = null;
        if (this._ersPointerId === null) {
          this._finishErsButtonHold(isCancel);
        }
      };
    }
    if (!this._releaseErsPointer) {
      this._releaseErsPointer = (pointerId, isCancel = false) => {
        if (pointerId !== undefined && pointerId !== this._ersPointerId) return;
        this._ersPointerId = null;
        if (this._ersTouchId === null) {
          this._finishErsButtonHold(isCancel);
        }
      };
    }

    if (ersBtn && this.ersBtnEl !== ersBtn) {
      this.ersBtnEl = ersBtn;
      lockButtonTouchStyle(ersBtn);

      const beginErsPress = () => {
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        this._ersTouchHeld = true;
        this._ersTouchDownMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        this.ersOvertakeActive = true;
        this.triggerHaptic('ERS', 0.85);
      };

      ersBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this._ersTouchId === null && this._ersPointerId === null && e.changedTouches.length > 0) {
          this._ersTouchId = e.changedTouches[0].identifier;
          beginErsPress();
        }
      }, { passive: false });

      ersBtn.addEventListener('touchend', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this._ersTouchId) {
            e.preventDefault();
            e.stopPropagation();
            this._releaseErsTouch(this._ersTouchId, false);
            break;
          }
        }
      }, { passive: false });

      ersBtn.addEventListener('touchcancel', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this._ersTouchId) {
            this._releaseErsTouch(this._ersTouchId, true);
            break;
          }
        }
      }, { passive: false });

      ersBtn.addEventListener('pointerdown', (e) => {
        if (ignoreTouchPointer(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (this._ersPointerId === null && this._ersTouchId === null) {
          this._ersPointerId = e.pointerId;
          beginErsPress();
          if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
            try { ersBtn.setPointerCapture(e.pointerId); } catch (_) {}
          }
        }
      });

      const onErsPtrEnd = (e) => {
        if (ignoreTouchPointer(e)) return;
        if (e.pointerId === this._ersPointerId) {
          e.preventDefault();
          e.stopPropagation();
          this._releaseErsPointer(e.pointerId, e.type === 'pointercancel');
        }
      };
      ersBtn.addEventListener('pointerup', onErsPtrEnd);
      ersBtn.addEventListener('pointercancel', onErsPtrEnd);

      ersBtn.addEventListener('click', (e) => {
        const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (nowMs - this._lastErsTapEndMs < 320) return;
        e.preventDefault();
        e.stopPropagation();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        this._ersLatched = !this._ersLatched;
        this.ersOvertakeActive = this._ersLatched;
        this.triggerHaptic('ERS', 0.85);
      });
    }

    // 4B. #btn-touch-drs (FIA DRS Wing Flap Toggle)
    const drsBtn = document.getElementById('btn-touch-drs');
    if (drsBtn && this.drsBtnEl !== drsBtn) {
      this.drsBtnEl = drsBtn;
      lockButtonTouchStyle(drsBtn);

      drsBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._lastDrsTapEndMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        this._triggerDrsToggle();
      }, { passive: false });

      drsBtn.addEventListener('pointerdown', (e) => {
        if (ignoreTouchPointer(e)) return;
        e.preventDefault();
        e.stopPropagation();
        this._lastDrsTapEndMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        this._triggerDrsToggle();
      });

      drsBtn.addEventListener('click', (e) => {
        const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (nowMs - this._lastDrsTapEndMs < 320) return;
        e.preventDefault();
        e.stopPropagation();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        this._triggerDrsToggle();
      });
    }

    // 4C. #btn-touch-tearoff (Cockpit Visor Tear-Off Wipe)
    const tearBtn = document.getElementById('btn-touch-tearoff');
    if (tearBtn && this.tearOffBtnEl !== tearBtn) {
      this.tearOffBtnEl = tearBtn;
      lockButtonTouchStyle(tearBtn);

      tearBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._lastTearOffTapEndMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        this.triggerVisorTearOff();
      }, { passive: false });

      tearBtn.addEventListener('pointerdown', (e) => {
        if (ignoreTouchPointer(e)) return;
        e.preventDefault();
        e.stopPropagation();
        this._lastTearOffTapEndMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        this.triggerVisorTearOff();
      });

      tearBtn.addEventListener('click', (e) => {
        const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (nowMs - this._lastTearOffTapEndMs < 320) return;
        e.preventDefault();
        e.stopPropagation();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        this.triggerVisorTearOff();
      });
    }
  }

  _finishErsButtonHold(isCancel = false) {
    if (!this._ersTouchHeld) return;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const heldMs = nowMs - this._ersTouchDownMs;
    this._ersTouchHeld = false;
    this._lastErsTapEndMs = nowMs;
    if (!isCancel && heldMs < 230.0) {
      this._ersLatched = !this._ersLatched;
      this.ersOvertakeActive = this._ersLatched;
      this.triggerHaptic('TAP', 0.7);
    } else {
      this._ersLatched = false;
      this.ersOvertakeActive =
        this.keys.has('KeyE') ||
        this.keys.has('ShiftLeft') ||
        this.keys.has('ShiftRight') ||
        this._gpErsHeld;
    }
  }

  _bindSliderZoneIfPresent() {
    if (this._sliderZoneBound || typeof document === 'undefined') return;
    this.sliderZoneEl = this.sliderZoneEl || document.getElementById('touch-slider-zone');
    if (!this.sliderZoneEl) return;

    this._sliderZoneBound = true;
    this.sliderThumbEl =
      this.sliderThumbEl ||
      document.getElementById('touch-slider-thumb') ||
      this.sliderZoneEl.querySelector('.slider-thumb, .steer-slider-thumb');

    this.sliderZoneEl.style.userSelect = 'none';
    this.sliderZoneEl.style.webkitUserSelect = 'none';
    this.sliderZoneEl.style.touchAction = 'none';

    const ignoreTouchPointer = this._ignoreTouchPointer || ((e) => this._hasNativeTouch && e.pointerType === 'touch');

    const releaseSliderPointer = (pointerId) => {
      if (pointerId !== undefined && pointerId !== this.sliderPointerId) return;
      this.sliderPointerId = null;
      if (this._sliderTouchId === null) {
        this.sliderTouchSteer = 0.0;
        this._sliderOneEuro.clear();
        this.sliderZoneEl?.classList.remove('slider-active');
      }
    };
    const releaseSliderTouch = (touchId) => {
      if (touchId !== undefined && touchId !== this._sliderTouchId) return;
      this._sliderTouchId = null;
      if (this.sliderPointerId === null) {
        this.sliderTouchSteer = 0.0;
        this._sliderOneEuro.clear();
        this.sliderZoneEl?.classList.remove('slider-active');
      }
    };
    this._releaseSliderPointer = releaseSliderPointer;
    this._releaseSliderTouch = releaseSliderTouch;

    const beginSliderTrack = (clientX) => {
      this.sliderAnchorX = clientX;
      this.sliderTouchSteer = 0.0;
      this._sliderOneEuro.reset(0.0);
      this.sliderZoneEl?.classList.add('slider-active');
      this._vibrate(6);
    };
    this._beginSliderTrack = beginSliderTrack;

    this.sliderZoneEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
      if (this._sliderTouchId === null && this.sliderPointerId === null && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        this._sliderTouchId = t.identifier;
        beginSliderTrack(t.clientX);
      }
    }, { passive: false });

    this.sliderZoneEl.addEventListener('pointerdown', (e) => {
      if (ignoreTouchPointer(e)) return;
      e.preventDefault();
      if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
      if (this.sliderPointerId === null && this._sliderTouchId === null) {
        this._clearStalePointerCollision(e.pointerId, 'slider');
        this.sliderPointerId = e.pointerId;
        beginSliderTrack(e.clientX);
        if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
          try { this.sliderZoneEl.setPointerCapture(e.pointerId); } catch (_) {}
        }
      }
    });

    this.sliderZoneEl.addEventListener('pointermove', (e) => {
      if (ignoreTouchPointer(e)) return;
      if (e.pointerId === this.sliderPointerId) {
        e.preventDefault();
        this._updateSliderFromPointer(e);
      }
    });

    const onSliderEnd = (e) => {
      if (ignoreTouchPointer(e)) return;
      if (e.pointerId === this.sliderPointerId) {
        releaseSliderPointer(e.pointerId);
      }
    };
    this.sliderZoneEl.addEventListener('pointerup', onSliderEnd);
    this.sliderZoneEl.addEventListener('pointercancel', onSliderEnd);
  }

  /**
   * Injects a lightweight, zero-hit-target bidirectional FFB Torque Indicator Arc
   * onto the stationary `.wheel-ring-outer` bezel so SAT & flat-spot loads are
   * clearly visible without ever shaking `#virtual-wheel-graphic` under the thumb.
   */
  _ensureFfbTorqueArc() {
    if (!this.wheelRingOuterEl || typeof document === 'undefined' || typeof document.createElementNS !== 'function') {
      return;
    }
    const existing = this.wheelRingOuterEl.querySelector('.wheel-ffb-torque-svg');
    if (existing) {
      this.ffbArcSvgEl = existing;
      this.ffbArcLeftEl = existing.querySelector('.ffb-arc-left');
      this.ffbArcRightEl = existing.querySelector('.ffb-arc-right');
      return;
    }

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'wheel-ffb-torque-svg');
    svg.setAttribute('viewBox', '0 0 120 102');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText =
      'position:absolute;inset:-4px;width:calc(100% + 8px);height:calc(100% + 8px);pointer-events:none;z-index:3;overflow:visible;opacity:0.32;transition:opacity 0.12s linear;';

    const trackArc = document.createElementNS(ns, 'path');
    trackArc.setAttribute('d', 'M 18 27.6 A 48 42 0 0 1 102 27.6');
    trackArc.setAttribute('fill', 'none');
    trackArc.setAttribute('stroke', 'rgba(255,255,255,0.12)');
    trackArc.setAttribute('stroke-width', '2.2');
    trackArc.setAttribute('stroke-linecap', 'round');

    const leftArc = document.createElementNS(ns, 'path');
    leftArc.setAttribute('class', 'ffb-arc-left');
    leftArc.setAttribute('d', 'M 60 6 A 48 42 0 0 0 18 27.6');
    leftArc.setAttribute('fill', 'none');
    leftArc.setAttribute('stroke', '#00d2be');
    leftArc.setAttribute('stroke-width', '3.0');
    leftArc.setAttribute('stroke-linecap', 'round');
    leftArc.setAttribute('pathLength', '100');
    leftArc.setAttribute('stroke-dasharray', '0 100');

    const rightArc = document.createElementNS(ns, 'path');
    rightArc.setAttribute('class', 'ffb-arc-right');
    rightArc.setAttribute('d', 'M 60 6 A 48 42 0 0 1 102 27.6');
    rightArc.setAttribute('fill', 'none');
    rightArc.setAttribute('stroke', '#00d2be');
    rightArc.setAttribute('stroke-width', '3.0');
    rightArc.setAttribute('stroke-linecap', 'round');
    rightArc.setAttribute('pathLength', '100');
    rightArc.setAttribute('stroke-dasharray', '0 100');

    svg.appendChild(trackArc);
    svg.appendChild(leftArc);
    svg.appendChild(rightArc);
    this.wheelRingOuterEl.appendChild(svg);

    this.ffbArcSvgEl = svg;
    this.ffbArcLeftEl = leftArc;
    this.ffbArcRightEl = rightArc;
  }

  // --------------------------------------------------------------------------
  // TILT (ACCELEROMETER / DEVICEORIENTATION) SENSOR PIPELINE & FALLBACK
  // --------------------------------------------------------------------------
  _ensureTiltSensorListener() {
    if (this._tiltListenerBound || typeof window === 'undefined') return;
    this._tiltListenerBound = true;

    window.addEventListener('deviceorientation', (e) => {
      if (!e || (e.beta === null && e.gamma === null) || (e.beta === undefined && e.gamma === undefined)) {
        return;
      }
      const beta = Number(e.beta);
      const gamma = Number(e.gamma);
      if (!Number.isFinite(beta) && !Number.isFinite(gamma)) return;

      const rawDeg = this._extractTiltDegrees(
        Number.isFinite(beta) ? beta : 0.0,
        Number.isFinite(gamma) ? gamma : 0.0
      );

      this._lastRawTiltDeg = rawDeg;
      this._tiltHasSensorData = true;
      this.tiltSensorAvailable = true;

      if (this.tiltFallbackActive) {
        this.tiltFallbackActive = false;
        this._syncWheelCaption();
      }
      if (this._tiltFallbackTimer) {
        clearTimeout(this._tiltFallbackTimer);
        this._tiltFallbackTimer = null;
      }

      if (this._tiltNeedsAutoCenter) {
        this.tiltCenterDeg = rawDeg;
        this._tiltNeedsAutoCenter = false;
      }

      this._recomputeTiltRawSteer();
    });
  }

  _requestTiltPermissionFromGesture() {
    if (this._tiltPermissionRequested || typeof window === 'undefined') return;
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      this._tiltPermissionRequested = true;
      DOE.requestPermission()
        .then((state) => {
          if (state === 'granted') {
            this._ensureTiltSensorListener();
          } else {
            this._triggerTiltDesktopFallback();
          }
        })
        .catch(() => {
          this._tiltPermissionRequested = false;
        });
    }
  }

  _extractTiltDegrees(beta, gamma) {
    let angle = 0;
    if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.angle === 'number') {
      angle = screen.orientation.angle;
    } else if (typeof window !== 'undefined' && typeof window.orientation === 'number') {
      angle = window.orientation;
    }
    const normAngle = ((Math.round(angle) % 360) + 360) % 360;
    if (normAngle === 90) {
      return beta;
    }
    if (normAngle === 270) {
      return -beta;
    }
    if (normAngle === 180) {
      return -gamma;
    }
    return gamma;
  }

  _recomputeTiltRawSteer() {
    const sens = clamp(this.controlSettings.sensitivity || DEFAULT_SENSITIVITY, 0.6, 1.5);
    const lam = this.controlSettings.steeringLinearity;
    const deltaDeg = clamp(this._lastRawTiltDeg - this.tiltCenterDeg, -55.0, 55.0);
    const maxTiltDeg = Math.max(8.0, TILT_BASE_MAX_DEG / sens);

    // 0.8° smooth C1 micro-deadzone + progressive user-friendly curve across ±28°
    const lin = mapSmoothDeadzoneNormalized(deltaDeg, TILT_DEADZONE_DEG, TILT_DEADZONE_KNEE_DEG, maxTiltDeg);
    this.tiltRawSteer = applySteeringLinearity(lin, lam);
  }

  calibrateTiltCenter() {
    if (this._tiltHasSensorData) {
      this.tiltCenterDeg = this._lastRawTiltDeg;
      this._tiltNeedsAutoCenter = false;
    } else {
      this.tiltCenterDeg = 0.0;
      this._tiltNeedsAutoCenter = true;
    }
    this.tiltRawSteer = 0.0;
    this.tiltFilteredSteer = 0.0;
    this._tiltOneEuro.reset(0.0);
    this._vibrate(10);
    if (this.callbacks.onTiltCalibrated) {
      this.callbacks.onTiltCalibrated(this.tiltCenterDeg);
    }
    return this.tiltCenterDeg;
  }

  _scheduleTiltAvailabilityCheck() {
    if (this._tiltFallbackTimer) {
      clearTimeout(this._tiltFallbackTimer);
      this._tiltFallbackTimer = null;
    }
    if (this.tiltSensorAvailable) {
      this.tiltFallbackActive = false;
      this._syncWheelCaption();
      return;
    }
    const noApi = typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined';
    const timeoutMs = noApi ? 40 : 850;
    this._tiltFallbackTimer = setTimeout(() => {
      this._tiltFallbackTimer = null;
      if (this.steeringStyle === 'TILT' && !this.tiltSensorAvailable) {
        this._triggerTiltDesktopFallback();
      }
    }, timeoutMs);
  }

  _triggerTiltDesktopFallback() {
    this.tiltFallbackActive = true;
    this._syncWheelCaption();
    const noticeMsg = 'Motion tilt sensor unavailable on desktop — Keyboard & Touch-Wheel active!';
    if (this.callbacks.onTiltFallback) {
      this.callbacks.onTiltFallback(noticeMsg);
    } else if (typeof document !== 'undefined') {
      const radioEl = document.getElementById('engineer-radio-toast');
      const raceHudEl = document.getElementById('race-hud');
      if (radioEl && (!raceHudEl || raceHudEl.style.display !== 'none')) {
        radioEl.innerHTML = `<span class="radio-tag">CONTROLS</span> ${noticeMsg}`;
        radioEl.classList.add('visible');
        clearTimeout(this._fallbackToastTimer);
        this._fallbackToastTimer = setTimeout(() => {
          radioEl.classList.remove('visible');
        }, 3200);
      }
    }
  }

  _syncWheelCaption() {
    const cap = this.wheelCaptionEl || (this.wheelZoneEl ? this.wheelZoneEl.querySelector('.control-caption') : null);
    if (!cap) return;
    if (this.steeringStyle === 'TILT') {
      cap.textContent = this.tiltFallbackActive
        ? 'NO GYRO • KEYS / DRAG STEER'
        : 'TILT PHONE • TAP = 0°';
    } else if (this.steeringStyle === 'SLIDER') {
      cap.textContent = '1:1 LINEAR SLIDE';
    } else {
      cap.textContent = 'SLIDE TO STEER';
    }
  }

  // --------------------------------------------------------------------------
  // CUSTOMIZABLE CONTROL SETTINGS (SENSITIVITY, LINEARITY, SCALE, ASSISTS)
  // --------------------------------------------------------------------------
  setControlSettings(opts = {}) {
    if (!opts || typeof opts !== 'object') return this.getControlSettings();

    if (opts.sensitivity !== undefined && Number.isFinite(Number(opts.sensitivity))) {
      this.controlSettings.sensitivity = clamp(Number(opts.sensitivity), 0.6, 1.5);
    }
    if (opts.steeringLinearity !== undefined || opts.linearity !== undefined) {
      const rawLin = opts.steeringLinearity !== undefined ? opts.steeringLinearity : opts.linearity;
      const cleanLin = normalizeLinearitySetting(rawLin);
      this.controlSettings.steeringLinearity = cleanLin;
      this.controlSettings.linearity = cleanLin;
    }
    if (opts.controlScale !== undefined && Number.isFinite(Number(opts.controlScale))) {
      this.controlSettings.controlScale = clamp(Number(opts.controlScale), 0.65, 1.35);
    }
    if (opts.controlOpacity !== undefined && Number.isFinite(Number(opts.controlOpacity))) {
      this.controlSettings.controlOpacity = clamp(Number(opts.controlOpacity), 0.25, 1.0);
    }
    if (opts.brakingAssist !== undefined) {
      this.controlSettings.brakingAssist = normalizeBrakingAssist(opts.brakingAssist);
    }
    if (
      opts.tractionControl !== undefined ||
      opts.steerAssist !== undefined ||
      opts.steeringAssist !== undefined ||
      opts.stabilityAssist !== undefined
    ) {
      const rawTc =
        opts.tractionControl !== undefined
          ? opts.tractionControl
          : (opts.steerAssist !== undefined
              ? opts.steerAssist
              : (opts.steeringAssist !== undefined ? opts.steeringAssist : opts.stabilityAssist));
      this.controlSettings.tractionControl = normalizeTractionControl(rawTc);
    }
    if (opts.autoThrottle !== undefined) {
      this.controlSettings.autoThrottle = !!opts.autoThrottle;
    }
    if (opts.haptics !== undefined) {
      this.controlSettings.haptics = !!opts.haptics;
    }

    this.sensitivity = this.controlSettings.sensitivity;
    this.steeringLinearity = this.controlSettings.steeringLinearity;
    this.linearity = this.controlSettings.steeringLinearity;
    this.controlScale = this.controlSettings.controlScale;
    this.controlOpacity = this.controlSettings.controlOpacity;
    this.brakingAssist = this.controlSettings.brakingAssist;
    this.tractionControl = this.controlSettings.tractionControl;
    this.autoThrottle = this.controlSettings.autoThrottle;
    this.haptics = this.controlSettings.haptics;

    this._applyControlVisualSettings();
    if (this._tiltHasSensorData) {
      this._recomputeTiltRawSteer();
    }
    return this.getControlSettings();
  }

  getControlSettings() {
    return { ...this.controlSettings };
  }

  _applyControlVisualSettings() {
    const scale = this.controlSettings.controlScale;
    const opacity = this.controlSettings.controlOpacity;

    const layers = [
      this.hudControlsEl,
      this.touchControlsLayerAltEl,
      typeof document !== 'undefined' ? document.getElementById('mobile-controls-layer') : null,
      typeof document !== 'undefined' ? document.getElementById('touch-controls-layer') : null,
    ];

    for (const layer of layers) {
      if (!layer) continue;
      if (layer.style.setProperty) {
        layer.style.setProperty('--ctrl-scale', String(scale));
        layer.style.setProperty('--ctrl-opacity', String(opacity));
      }
      layer.style.opacity = String(opacity);
      // NEVER put a transform on #mobile-controls-layer itself (preserves fixed child coordinates!)
      layer.style.transform = '';
    }

    if (typeof document !== 'undefined' && document.documentElement?.style?.setProperty) {
      document.documentElement.style.setProperty('--ctrl-scale', String(scale));
    }

    // Apply ergonomic corner-anchored scale to touch zones so scaling works with any CSS
    const isLeftHanded = this.handedness === 'LEFT_HANDED';
    const steerOrigin = isLeftHanded ? 'bottom right' : 'bottom left';
    const pedalOrigin = isLeftHanded ? 'bottom left' : 'bottom right';
    const scaleCss = Math.abs(scale - 1.0) < 0.005 ? '' : `scale(${scale.toFixed(3)})`;

    for (const z of [this.wheelZoneEl, this.sliderZoneEl, this.arrowZoneEl, this.tiltZoneEl]) {
      if (!z) continue;
      z.style.transformOrigin = steerOrigin;
      z.style.transform = scaleCss;
    }
    const pedalRoot =
      this.pedalAssemblyEl ||
      (typeof document !== 'undefined' ? document.getElementById('touch-pedal-assembly') : null);
    if (pedalRoot) {
      pedalRoot.style.transformOrigin = pedalOrigin;
      pedalRoot.style.transform = scaleCss;
    }
  }

  // --------------------------------------------------------------------------
  // POINTER & TOUCH ZONE HANDLERS (1:1 MOTION-MATCHED STEERING & PEDALS)
  // --------------------------------------------------------------------------
  _clearStalePointerCollision(pointerId, claimingZone) {
    if (claimingZone !== 'wheel' && this.wheelPointerId === pointerId && this._releaseWheelPointer) {
      this._releaseWheelPointer(pointerId);
    }
    if (claimingZone !== 'slider' && this.sliderPointerId === pointerId && this._releaseSliderPointer) {
      this._releaseSliderPointer(pointerId);
    }
    if (claimingZone !== 'arrow' && this.arrowPointerId === pointerId && this._releaseArrowPointer) {
      this._releaseArrowPointer(pointerId);
    }
    if (claimingZone !== 'pedal' && this.pedalPointerId === pointerId && this._releasePedalPointer) {
      this._releasePedalPointer(pointerId);
    }
  }

  _updateWheelFromPointer(e) {
    if (!this.wheelZoneEl) return;
    const rect = this.wheelZoneEl.getBoundingClientRect();
    const rawDx = e.clientX - this.wheelAnchorX;

    const sens = clamp(this.controlSettings.sensitivity || DEFAULT_SENSITIVITY, 0.6, 1.5);
    const lam = this.controlSettings.steeringLinearity;
    const baseDragPx = clamp((rect.width || 168.0) * 0.46, 74.0, 116.0);
    const maxDragPx = baseDragPx / sens;

    // 3.0px C1 micro-deadzone + progressive user-friendly curve (default λ = 0.35)
    const lin = mapSmoothDeadzoneNormalized(rawDx, WHEEL_MICRO_DEADZONE_PX, WHEEL_DEADZONE_KNEE_PX, maxDragPx);
    this.wheelTouchSteer = applySteeringLinearity(lin, lam);
  }

  _updateSliderFromPointer(e) {
    if (!this.sliderZoneEl) return;
    const rect = this.sliderZoneEl.getBoundingClientRect();
    const rawDx = e.clientX - this.sliderAnchorX;

    const sens = clamp(this.controlSettings.sensitivity || DEFAULT_SENSITIVITY, 0.6, 1.5);
    const lam = this.controlSettings.steeringLinearity;
    const baseDragPx = clamp((rect.width || 176.0) * 0.48, 76.0, 122.0);
    const maxDragPx = baseDragPx / sens;

    const lin = mapSmoothDeadzoneNormalized(rawDx, WHEEL_MICRO_DEADZONE_PX, WHEEL_DEADZONE_KNEE_PX, maxDragPx);
    this.sliderTouchSteer = applySteeringLinearity(lin, lam);
  }

  _updateArrowFromPointer(e, isInitialPress) {
    if (!this.arrowZoneEl) return;
    const rect = this.arrowZoneEl.getBoundingClientRect();
    let nextDir = 0;

    if (rect.width > 4) {
      const relX = (e.clientX - rect.left) / rect.width;
      if (relX < 0.48) {
        nextDir = -1;
      } else if (relX > 0.52) {
        nextDir = 1;
      } else {
        nextDir = 0;
      }
    } else if (e.target && typeof e.target.closest === 'function') {
      if (e.target.closest('#btn-steer-left')) nextDir = -1;
      else if (e.target.closest('#btn-steer-right')) nextDir = 1;
    }

    if (nextDir !== 0 && (isInitialPress || nextDir !== this.arrowDir)) {
      this._vibrate(7);
    }

    this.arrowDir = nextDir;
    this.btnLeftEl?.classList.toggle('pressed', this.arrowDir < 0);
    this.btnRightEl?.classList.toggle('pressed', this.arrowDir > 0);
  }

  _updatePedalsFromPointer(e) {
    if (!this.pedalZoneEl) return;
    const rect = this.pedalZoneEl.getBoundingClientRect();
    const height = Math.max(1.0, rect.height || 140.0);
    const width = Math.max(1.0, rect.width || 160.0);

    // Progressive 0% -> 100% analog pedal travel without any initial 60% step jump!
    // Bottom 4% resting guard -> smooth ((y - 0.04) / 0.78)^1.12 -> top 18% comfortable full-lock zone
    const yFromBottom = clamp((rect.bottom - e.clientY) / height, 0.0, 1.0);
    const rawTravel = clamp((yFromBottom - 0.04) / 0.78, 0.0, 1.0);
    const pressure = rawTravel <= 0.0 ? 0.0 : Math.pow(rawTravel, 1.12);

    let xNorm = clamp((e.clientX - rect.left) / width, 0.0, 1.0);
    if (this.handedness === 'LEFT_HANDED') {
      xNorm = 1.0 - xNorm;
    }

    // Smooth C1-continuous horizontal rollover bridge (0.40..0.60) for F1 Trail-Braking!
    let nextZone = 'ROLLOVER';
    if (xNorm <= 0.40) {
      nextZone = 'BRAKE';
      this.touchBrake = pressure;
      this.touchGas = 0.0;
    } else if (xNorm >= 0.60) {
      nextZone = 'GAS';
      this.touchGas = pressure;
      this.touchBrake = 0.0;
    } else {
      const u = (xNorm - 0.40) / 0.20;
      const s = u * u * (3.0 - 2.0 * u);
      this.touchBrake = pressure * Math.pow(1.0 - s, 0.85);
      this.touchGas = pressure * Math.pow(s, 0.85);
    }

    // Tactile pedal bite haptics: crisp micro-tick on trail-brake rollover crossing or 100% brake lock
    if (this._pedalZoneState !== 'NONE' && this._pedalZoneState !== nextZone) {
      this._vibratePedalTick(7);
    }
    this._pedalZoneState = nextZone;

    if (this.touchBrake >= 0.98 && !this._fullBrakeLockActive) {
      this._fullBrakeLockActive = true;
      this._vibratePedalTick(11);
    } else if (this.touchBrake < 0.88) {
      this._fullBrakeLockActive = false;
    }

    this.gasPedalEl?.classList.toggle('active-pedal', this.touchGas > 0.03);
    this.brakePedalEl?.classList.toggle('active-pedal', this.touchBrake > 0.03);
  }

  _bindKeyboard() {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const activeTag = typeof document !== 'undefined' ? document.activeElement?.tagName : null;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

      if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
      const code = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
        e.preventDefault();
      }
      if (!this.keys.has(code)) {
        this.keys.add(code);
        if (code === 'Space') {
          if (this.callbacks.onClutchTap) this.callbacks.onClutchTap();
          if (this.callbacks.onShift) this.callbacks.onShift(0);
        } else if (code === 'KeyE' || code === 'ShiftLeft' || code === 'ShiftRight') {
          this.ersOvertakeActive = true;
          this.triggerHaptic('ERS', 0.75);
        } else if (code === 'BracketRight' || code === 'Period') {
          if (this.callbacks.onShift) this.callbacks.onShift(+1);
        } else if (code === 'KeyQ' || code === 'BracketLeft' || code === 'Comma') {
          if (this.callbacks.onShift) this.callbacks.onShift(-1);
        } else if (code === 'KeyV') {
          if (this.callbacks.onToggleVisualStyle) this.callbacks.onToggleVisualStyle();
        } else if (code === 'KeyC') {
          if (this.callbacks.onCycleCamera) this.callbacks.onCycleCamera(1);
        } else if (code === 'KeyX' || code === 'KeyT') {
          this.triggerVisorTearOff();
        } else if (code === 'KeyR') {
          const inReplayOrResults =
            typeof window !== 'undefined' &&
            (window.__RACE_PHANATIC_GAME__?.replay?.isPlaying ||
              window.__RACE_PHANATIC_GAME__?.state === 'RACE_RESULTS');
          if (inReplayOrResults && this.callbacks.onToggleReplay) {
            this.callbacks.onToggleReplay();
          } else {
            this._triggerDrsToggle();
          }
        } else if (code === 'KeyI' || code === 'F2') {
          if (this.callbacks.onToggleReplay) this.callbacks.onToggleReplay();
        } else if (code === 'KeyB') {
          if (this.callbacks.onRequestBox) {
            this.callbacks.onRequestBox();
          } else if (this.callbacks.onTogglePitDrawer) {
            this.callbacks.onTogglePitDrawer();
          }
        } else if (code === 'Escape') {
          if (this.callbacks.onPauseMenu) this.callbacks.onPauseMenu();
        } else if (code === 'KeyP') {
          if (this.callbacks.onPauseMenu) {
            this.callbacks.onPauseMenu();
          } else if (this.callbacks.onTogglePitDrawer) {
            this.callbacks.onTogglePitDrawer();
          }
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.ersOvertakeActive = Boolean(
          this._ersTouchHeld ||
          this._ersLatched ||
          this.keys.has('KeyE') ||
          this.keys.has('ShiftLeft') ||
          this.keys.has('ShiftRight') ||
          this._gpErsHeld
        );
      }
    });
  }

  setHandedness(handedness) {
    this.handedness = handedness === 'LEFT_HANDED' ? 'LEFT_HANDED' : 'RIGHT_HANDED';
    if (this.hudControlsEl) {
      this.hudControlsEl.classList.toggle('left-handed', this.handedness === 'LEFT_HANDED');
      this.hudControlsEl.classList.toggle('right-handed', this.handedness !== 'LEFT_HANDED');
    }
    if (this.touchControlsLayerAltEl && this.touchControlsLayerAltEl !== this.hudControlsEl) {
      this.touchControlsLayerAltEl.classList.toggle('left-handed', this.handedness === 'LEFT_HANDED');
      this.touchControlsLayerAltEl.classList.toggle('right-handed', this.handedness !== 'LEFT_HANDED');
    }
    this._applyControlVisualSettings();
  }

  setSteeringStyle(style) {
    const upper = String(style || 'WHEEL').toUpperCase().trim();
    const norm =
      upper === 'BUTTONS' || upper === 'ARROWS'
        ? 'BUTTONS'
        : (upper === 'TILT' ? 'TILT' : (upper === 'SLIDER' ? 'SLIDER' : 'WHEEL'));
    this.steeringStyle = norm;

    this.tiltZoneEl = this.tiltZoneEl || (typeof document !== 'undefined' ? document.getElementById('touch-tilt-zone') : null);
    this._bindSliderZoneIfPresent();

    const useDedicatedSlider = norm === 'SLIDER' && !!this.sliderZoneEl;

    if (this.sliderZoneEl) {
      this.sliderZoneEl.style.display = useDedicatedSlider ? 'flex' : 'none';
    }

    if (this.tiltZoneEl) {
      if (this.wheelZoneEl) {
        this.wheelZoneEl.style.display = (norm === 'WHEEL' || (norm === 'SLIDER' && !useDedicatedSlider)) ? 'flex' : 'none';
      }
      if (this.arrowZoneEl) this.arrowZoneEl.style.display = norm === 'BUTTONS' ? 'flex' : 'none';
      this.tiltZoneEl.style.display = norm === 'TILT' ? 'flex' : 'none';
    } else {
      // Keep live-rotating F1 Steering Wheel telemetry hub visible in WHEEL, TILT, and fallback SLIDER!
      if (this.wheelZoneEl) {
        this.wheelZoneEl.style.display =
          (norm === 'WHEEL' || norm === 'TILT' || (norm === 'SLIDER' && !useDedicatedSlider)) ? 'flex' : 'none';
      }
      if (this.arrowZoneEl) {
        this.arrowZoneEl.style.display = norm === 'BUTTONS' ? 'flex' : 'none';
      }
    }

    this.wheelZoneEl?.classList.remove('wheel-active');
    this.sliderZoneEl?.classList.remove('slider-active');
    this.wheelPointerId = null;
    this._wheelTouchId = null;
    this.wheelTouchSteer = 0.0;
    this._wheelOneEuro.clear();

    this.sliderPointerId = null;
    this._sliderTouchId = null;
    this.sliderTouchSteer = 0.0;
    this._sliderOneEuro.clear();

    this.arrowPointerId = null;
    this._arrowTouchId = null;
    this.arrowDir = 0;
    this.arrowRampSteer = 0.0;
    this.btnLeftEl?.classList.remove('pressed');
    this.btnRightEl?.classList.remove('pressed');

    if (norm === 'TILT') {
      this._ensureTiltSensorListener();
      this._requestTiltPermissionFromGesture();
      this.calibrateTiltCenter();
      this._scheduleTiltAvailabilityCheck();
    } else {
      if (this._tiltFallbackTimer) {
        clearTimeout(this._tiltFallbackTimer);
        this._tiltFallbackTimer = null;
      }
      this.tiltFallbackActive = false;
      this.tiltRawSteer = 0.0;
      this.tiltFilteredSteer = 0.0;
      this._tiltOneEuro.clear();
    }

    this._syncWheelCaption();
  }

  setGearboxUI(gearboxMode, currentGear = 1) {
    const isAuto8 = gearboxMode === 'AUTO_8SPD';
    const isManualMulti = gearboxMode === 'MANUAL_8SPD' || gearboxMode === 'PRO_6SPD';
    const isClassic2 = gearboxMode === 'CLASSIC_2SPD';
    const safeGear = Math.max(1, Math.round(currentGear || 1));

    if (this.shifterBtnEl) {
      this.shifterBtnEl.style.display = isClassic2 ? 'flex' : 'none';
      if (isClassic2) {
        const isHigh = safeGear >= 2;
        this.shifterBtnEl.innerHTML = `<span class="shifter-label">GEAR</span><span class="shifter-val ${isHigh ? 'high' : 'low'}">${isHigh ? 'HIGH' : 'LOW'}</span>`;
      }
    }

    const seqWrap = this.seqShifterWrapEl || (typeof document !== 'undefined' ? document.getElementById('seq-shifter-wrap') : null);
    if (seqWrap) {
      // Keep cockpit clean and pedals tall in AUTO_8SPD; show paddles only in MANUAL_8SPD / PRO_6SPD
      seqWrap.style.display = isManualMulti && !isAuto8 ? 'flex' : 'none';
      const gearDisp = this.seqGearNumEl || (typeof document !== 'undefined' ? document.getElementById('seq-gear-num') : null);
      if (gearDisp) gearDisp.textContent = `G${safeGear}`;
    }
  }

  _pollGamepad() {
    let gpSteer = 0.0;
    let gpGas = 0.0;
    let gpBrake = 0.0;
    let gpDpadDir = 0;
    let gpErsHeld = false;

    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      this._activeGamepad = null;
      this._gpErsHeld = false;
      this._gpPrevDrsBtn = false;
      return { gpSteer, gpGas, gpBrake, gpDpadDir, gpErsHeld };
    }

    let pads;
    try {
      pads = navigator.getGamepads();
    } catch (_) {
      this._activeGamepad = null;
      this._gpErsHeld = false;
      this._gpPrevDrsBtn = false;
      return { gpSteer, gpGas, gpBrake, gpDpadDir, gpErsHeld };
    }
    if (!pads) {
      this._activeGamepad = null;
      this._gpErsHeld = false;
      this._gpPrevDrsBtn = false;
      return { gpSteer, gpGas, gpBrake, gpDpadDir, gpErsHeld };
    }

    // Prefer standard-mapped controllers; skip known virtual HID non-gamepad devices
    let activePad = null;
    for (let i = 0; i < pads.length; i++) {
      const candidate = pads[i];
      if (!candidate || !candidate.connected) continue;
      if (candidate.mapping === 'standard') {
        activePad = candidate;
        break;
      }
      if (typeof candidate.id === 'string' && VIRTUAL_HID_IGNORE_RE.test(candidate.id)) {
        continue;
      }
      if (!activePad) activePad = candidate;
    }

    this._activeGamepad = activePad;
    if (!activePad) {
      this._gpShiftInitialized = false;
      this._gpErsHeld = false;
      this._gpPrevDrsBtn = false;
      return { gpSteer, gpGas, gpBrake, gpDpadDir, gpErsHeld };
    }

    const sens = clamp(this.controlSettings.sensitivity || 1.0, 0.6, 1.5);
    const lam = this.controlSettings.steeringLinearity;
    const deadzone = Math.max(GAMEPAD_AXIS_DEADZONE, this.gamepadDeadzone || GAMEPAD_AXIS_DEADZONE);
    const rawAx = Number.isFinite(activePad.axes?.[0]) ? clamp(activePad.axes[0], -1.0, 1.0) : 0.0;
    if (Math.abs(rawAx) > deadzone) {
      const maxSpan = Math.max(deadzone + GAMEPAD_AXIS_KNEE + 0.05, 1.0 / sens);
      const lin = mapSmoothDeadzoneNormalized(rawAx, deadzone, GAMEPAD_AXIS_KNEE, maxSpan);
      gpSteer = applySteeringLinearity(lin, lam);
    }

    const rtVal = activePad.buttons?.[7]?.value || 0.0;
    const ltVal = activePad.buttons?.[6]?.value || 0.0;
    if (rtVal > GAMEPAD_TRIGGER_DEADZONE) {
      gpGas = clamp((rtVal - GAMEPAD_TRIGGER_DEADZONE) / (1.0 - GAMEPAD_TRIGGER_DEADZONE), 0.0, 1.0);
    }
    if (ltVal > GAMEPAD_TRIGGER_DEADZONE) {
      gpBrake = clamp((ltVal - GAMEPAD_TRIGGER_DEADZONE) / (1.0 - GAMEPAD_TRIGGER_DEADZONE), 0.0, 1.0);
    }

    // Tactical Gamepad Buttons: B/Circle (1) or LB (4) = ERS Overtake Hold, Y/Triangle (3) = DRS Toggle
    if (activePad.buttons) {
      const btnB = !!activePad.buttons[1]?.pressed;
      const btnY = !!activePad.buttons[3]?.pressed;
      const lbDown = !!activePad.buttons[4]?.pressed;
      const rbDown = !!activePad.buttons[5]?.pressed;

      gpErsHeld = btnB || lbDown;
      this._gpErsHeld = gpErsHeld;

      if (btnY && !this._gpPrevDrsBtn) {
        this._triggerDrsToggle();
      }
      this._gpPrevDrsBtn = btnY;

      if (activePad.mapping === 'standard') {
        const dLeft = !!activePad.buttons[14]?.pressed;
        const dRight = !!activePad.buttons[15]?.pressed;
        gpDpadDir = (dRight ? 1 : 0) - (dLeft ? 1 : 0);

        const manualGb =
          this._lastPlayerCarRef &&
          (this._lastPlayerCarRef.gearboxMode === 'MANUAL_8SPD' ||
            this._lastPlayerCarRef.gearboxMode === 'PRO_6SPD' ||
            this._lastPlayerCarRef.gearboxMode === 'CLASSIC_2SPD');

        if (!this._gpShiftInitialized) {
          this._gpPrevShiftDown = lbDown;
          this._gpPrevShiftUp = rbDown;
          this._gpShiftInitialized = true;
        } else {
          if (manualGb && rbDown && !this._gpPrevShiftUp && this.callbacks.onShift) {
            this.callbacks.onShift(+1);
          }
          if (manualGb && lbDown && !this._gpPrevShiftDown && this.callbacks.onShift) {
            this.callbacks.onShift(-1);
          }
          this._gpPrevShiftDown = lbDown;
          this._gpPrevShiftUp = rbDown;
        }
      }
    } else {
      this._gpErsHeld = false;
      this._gpPrevDrsBtn = false;
    }

    return { gpSteer, gpGas, gpBrake, gpDpadDir, gpErsHeld };
  }

  _readTireFlatSpotSeverity(car) {
    if (!car) return { front: 0.0, rear: 0.0, effective: 0.0 };
    let front = 0.0;
    let rear = 0.0;

    if (Array.isArray(car.tireFlatSpot)) {
      front = Math.max(Number(car.tireFlatSpot[0]) || 0.0, Number(car.tireFlatSpot[1]) || 0.0);
      rear = Math.max(Number(car.tireFlatSpot[2]) || 0.0, Number(car.tireFlatSpot[3]) || 0.0);
    } else if (Number.isFinite(car.tireFlatSpot)) {
      front = Number(car.tireFlatSpot);
    } else if (Array.isArray(car.tires)) {
      front = Math.max(Number(car.tires[0]?.flatSpot) || 0.0, Number(car.tires[1]?.flatSpot) || 0.0);
      rear = Math.max(Number(car.tires[2]?.flatSpot) || 0.0, Number(car.tires[3]?.flatSpot) || 0.0);
    }

    const effective = clamp(Math.max(front, rear * 0.55), 0.0, 1.0);
    return { front: clamp(front, 0.0, 1.0), rear: clamp(rear, 0.0, 1.0), effective };
  }

  // --------------------------------------------------------------------------
  // PHYSICS-DRIVEN SELF-ALIGNING TORQUE (SAT) & TIRE FLAT-SPOT FFB (GUARDED!)
  // --------------------------------------------------------------------------
  applyPhysicsFeedback(car, dt = 1.0 / 60.0, _calledFromUpdate = false) {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

    // Frame guard: if applyPhysicsFeedback was already called externally in this render frame,
    // skip duplicate execution so filter state & flat-spot phase integrate strictly ONCE per frame!
    if (_calledFromUpdate && this._feedbackPendingForUpdate) {
      this._feedbackPendingForUpdate = false;
      return {
        selfAligningTorque: this.selfAligningTorque,
        speedSteerAuthority: this.speedSteerAuthority,
        ffbTorqueNormalized: this.ffbTorqueNormalized,
        tireFlatSpotVibration: this.tireFlatSpotVibration,
      };
    }
    if (
      !_calledFromUpdate &&
      this._feedbackPendingForUpdate &&
      car === this._lastFeedbackCarRef &&
      Math.abs(nowMs - this._lastFeedbackStampMs) < 1.2
    ) {
      return {
        selfAligningTorque: this.selfAligningTorque,
        speedSteerAuthority: this.speedSteerAuthority,
        ffbTorqueNormalized: this.ffbTorqueNormalized,
        tireFlatSpotVibration: this.tireFlatSpotVibration,
      };
    }

    this._lastFeedbackStampMs = nowMs;
    this._lastFeedbackCarRef = car;
    this._feedbackPendingForUpdate = !_calledFromUpdate;

    const safeDt = Number.isFinite(dt) ? clamp(dt, 0.0005, 0.1) : (1.0 / 60.0);
    this.speedSteerAuthority = 1.0; // Single-authority steering angle taper lives in physics.js

    if (!car || car.exploded || car.inPitLane) {
      this.selfAligningTorque += (0.0 - this.selfAligningTorque) * expSmoothing(18.0, safeDt);
      if (Math.abs(this.selfAligningTorque) < 0.002) this.selfAligningTorque = 0.0;
      this.tireFlatSpotVibration = 0.0;
      this.ffbTorqueNormalized = this.selfAligningTorque;
      return {
        selfAligningTorque: this.selfAligningTorque,
        speedSteerAuthority: 1.0,
        ffbTorqueNormalized: this.ffbTorqueNormalized,
        tireFlatSpotVibration: 0.0,
      };
    }

    const speedKmh = Math.max(0.0, Number(car.speedKmh) || 0.0);
    const speedMps = speedKmh / 3.6;

    // 1. Read front-axle pneumatic-trail + rear-oversteer SAT from physics (purely for FFB arc, haptics & release return)
    let targetSat = 0.0;
    if (Number.isFinite(car.selfAligningTorque)) {
      targetSat = clamp(car.selfAligningTorque, -1.0, 1.0);
    } else if (speedKmh > 18.0) {
      const relYaw = Number(car.relYaw) || 0.0;
      const steerRef = Number.isFinite(car.steerInput) ? car.steerInput : this.steer;
      const skidBoost = 1.0 + clamp(Number(car.skidIntensity) || 0.0, 0.0, 1.0) * 0.45;
      const oversteerCounter = clamp(-relYaw * 2.15 * skidBoost, -0.85, 0.85);
      const pneumaticTrail = -clamp(steerRef, -1.0, 1.0) * 0.18 * clamp(speedKmh / 240.0, 0.0, 1.0);
      targetSat = clamp(oversteerCounter + pneumaticTrail, -1.0, 1.0);
    }

    const lowSpeedGate = smoothstep(12.0, 36.0, speedKmh);
    targetSat *= lowSpeedGate;
    if (Math.abs(targetSat) < 0.01) targetSat = 0.0;

    this.selfAligningTorque += (targetSat - this.selfAligningTorque) * expSmoothing(24.0, safeDt);
    if (Math.abs(this.selfAligningTorque) < 0.002) {
      this.selfAligningTorque = 0.0;
    }

    // 2. Wheel-frequency tire flat-spot vibration (f_w = v / (2*pi*R_wheel), 0..40 Hz harmonic thump)
    const flatSpot = this._readTireFlatSpotSeverity(car);
    let signedFlatSpotRipple = 0.0;
    if (flatSpot.effective > 0.04 && speedMps > 4.5) {
      const prevPhase = this._flatSpotPhaseRad;
      const nextPhase = prevPhase + (speedMps / TIRE_OUTER_RADIUS_M) * safeDt;
      const revCrossed = Math.floor(nextPhase / (Math.PI * 2.0)) > Math.floor(prevPhase / (Math.PI * 2.0));
      this._flatSpotPhaseRad = nextPhase % (Math.PI * 2.0);

      const thumpCrest = Math.pow(0.5 + 0.5 * Math.cos(this._flatSpotPhaseRad), 4.0);
      const speedEnv = smoothstep(20.0, 165.0, speedKmh);
      this.tireFlatSpotVibration = clamp(flatSpot.effective * speedEnv * thumpCrest, 0.0, 1.0);
      signedFlatSpotRipple = Math.sin(this._flatSpotPhaseRad) * flatSpot.front * speedEnv * 0.22;

      if (revCrossed && flatSpot.effective > 0.20 && speedKmh > 52.0) {
        this._vibrateFlatSpotThump(flatSpot.effective);
      }
    } else {
      this.tireFlatSpotVibration = 0.0;
    }

    this.ffbTorqueNormalized = clamp(this.selfAligningTorque + signedFlatSpotRipple, -1.0, 1.0);

    return {
      selfAligningTorque: this.selfAligningTorque,
      speedSteerAuthority: 1.0,
      ffbTorqueNormalized: this.ffbTorqueNormalized,
      tireFlatSpotVibration: this.tireFlatSpotVibration,
    };
  }

  /**
   * Smooth C1-continuous discrete button steering envelope (Keyboard & Touch Arrows):
   * Eliminates the C0 step jump at |steer| = 0.30/0.32 and across zero-crossing!
   */
  _stepSmoothDiscreteSteer(currentSteer, targetDir, maxTargetMag, speedKmh, fastRate, lockRate, counterRate, dt) {
    const target = targetDir * maxTargetMag;
    if (targetDir !== 0) {
      const aligned = currentSteer * Math.sign(targetDir); // < 0 when counter-steering, >= 0 when building lock
      const counterBlend = 1.0 - smoothstep(-0.22, 0.04, aligned);
      const lockBlend = smoothstep(0.14, 0.72, Math.max(0.0, aligned));
      const progressiveTurnRate = fastRate - (fastRate - lockRate) * lockBlend;
      const highSpeedCalm = 1.0 - 0.24 * smoothstep(140.0, 310.0, speedKmh);
      const effRate = (progressiveTurnRate * highSpeedCalm) * (1.0 - counterBlend) + counterRate * counterBlend;

      const next = currentSteer + (target - currentSteer) * expSmoothing(effRate, dt);
      return clamp(next, -1.0, 1.0);
    }

    if (currentSteer === 0.0) return 0.0;

    // Smooth C1 self-centering release envelope (guided gently by pneumatic-trail / oversteer SAT)
    const satGuide = Math.abs(this.selfAligningTorque) > 0.04 && speedKmh > 22.0
      ? clamp(this.selfAligningTorque * SAT_RELEASE_RETURN_GAIN, -0.32, 0.32)
      : 0.0;
    const absCur = Math.abs(currentSteer);
    const returnRate = 14.0 + 5.0 * smoothstep(0.06, 0.55, absCur);
    const next = currentSteer + (satGuide - currentSteer) * expSmoothing(returnRate, dt);
    if (satGuide === 0.0 && Math.abs(next) < 0.0015) return 0.0;
    return clamp(next, -1.0, 1.0);
  }

  /**
   * Gentle Road-Tangent Alignment & Curvature Steering Assist ('FULL' | 'SPORT' | 'OFF'):
   * Helps keep the car aligned with the road tangent and gently tracks upcoming road curves
   * when near center or releasing controls, without ever fighting deliberate cornering lock.
   */
  _computeRoadTangentSteerAssist(playerCar, rawSteerTarget, tcAssistWeight, speedKmhNow, kRealAhead) {
    if (tcAssistWeight <= 0.0 || !playerCar || playerCar.exploded || playerCar.inPitLane || speedKmhNow < 12.0) {
      this.roadTangentSteerAssist = 0.0;
      return 0.0;
    }

    const relYaw = clamp(Number(playerCar.relYaw) || 0.0, -0.85, 0.85);
    const latOffset = clamp(Number(playerCar.t) || 0.0, -1.2, 1.2);
    const yawRate = clamp(Number(playerCar.yawRate) || 0.0, -3.5, 3.5);
    const speedGate = smoothstep(12.0, 48.0, speedKmhNow);

    // Road-tangent heading restoration + gentle curvature lead + yaw-oscillation damping
    const headingCorrection = -relYaw * 0.58 - yawRate * 0.055;
    const laneCenterGentle = Math.abs(latOffset) > 0.35 ? -latOffset * 0.06 : 0.0;
    const curveFollow = clamp((Number(kRealAhead) || 0.0) * 14.0, -0.26, 0.26);

    // Active near center (|rawSteerTarget| < 0.30) so straights & gentle bends are effortless,
    // fading smoothly to 0.0 when the player holds a deliberate cornering angle (>= 0.30)!
    const centerWindow = 1.0 - smoothstep(0.04, 0.30, Math.abs(rawSteerTarget));
    const assist = clamp(
      (headingCorrection + laneCenterGentle + curveFollow) * speedGate * tcAssistWeight * centerWindow,
      -0.32,
      0.32
    );
    this.roadTangentSteerAssist = assist;
    return assist;
  }

  triggerVisorTearOff() {
    this.visorTearOffProgress = 0.0;
    this.visorTearOffCount += 1;
    this.triggerHaptic('TAP', 0.85);
    if (this.callbacks.onVisorTearOff) {
      this.callbacks.onVisorTearOff(this.visorTearOffCount);
    }
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      try {
        window.dispatchEvent(
          new CustomEvent('f1-visor-tearoff', {
            detail: { count: this.visorTearOffCount },
          })
        );
      } catch (_) {}
    }
    return this.visorTearOffCount;
  }

  triggerQuickCameraCycle(direction = 1) {
    this.triggerHaptic('TAP', 0.75);
    if (this.callbacks.onCycleCamera) {
      this.callbacks.onCycleCamera(direction);
    }
  }

  getLookToApexRad(maxYawDeg = 12.5) {
    return this.lookApexNormalized * ((maxYawDeg * Math.PI) / 180.0);
  }

  update(dt, playerCar) {
    const safeDt = Number.isFinite(dt) ? clamp(dt, 0.0005, 0.1) : (1.0 / 60.0);

    if (playerCar !== undefined) {
      this._lastPlayerCarRef = playerCar;
    }

    // Lazily bind tactical F1 mobile cockpit buttons if injected into DOM after construction
    if (
      typeof document !== 'undefined' &&
      (!this.ersBtnEl ||
        !this.ersBtnEl.isConnected ||
        !this.drsBtnEl ||
        !this.drsBtnEl.isConnected ||
        !this.tearOffBtnEl ||
        !this.tearOffBtnEl.isConnected ||
        !this.ersPctEl ||
        !this.ersPctEl.isConnected)
    ) {
      this._bindTacticalButtonsIfPresent();
    }

    // Sync top-level settings if mutated directly by external UI/main.js
    if (this.tractionControl !== this.controlSettings.tractionControl) {
      const normTc = normalizeTractionControl(this.tractionControl);
      this.tractionControl = normTc;
      this.controlSettings.tractionControl = normTc;
    }
    if (this.autoThrottle !== this.controlSettings.autoThrottle) {
      this.autoThrottle = Boolean(this.autoThrottle);
      this.controlSettings.autoThrottle = this.autoThrottle;
    }
    if (this.haptics !== this.controlSettings.haptics) {
      this.haptics = Boolean(this.haptics);
      this.controlSettings.haptics = this.haptics;
    }
    const tcMode = this.controlSettings.tractionControl || 'FULL';
    const tcAssistWeight = tcMode === 'FULL' ? 1.0 : (tcMode === 'SPORT' ? 0.55 : 0.0);

    const sens = clamp(this.controlSettings.sensitivity || DEFAULT_SENSITIVITY, 0.6, 1.5);
    const speedKmhNow = Math.max(0.0, Number(playerCar?.speedKmh) || 0.0);
    const discreteRateSens = 0.76 + 0.24 * sens;

    // 0. Update physics-driven SAT & tire flat-spot feedback (guarded to run at most once per frame!)
    this.applyPhysicsFeedback(playerCar, safeDt, true);

    // 1. HTML5 Gamepad polling (strict >= 0.22 C1 deadzone + progressive user-friendly stick mapping)
    const { gpSteer, gpGas, gpBrake, gpDpadDir, gpErsHeld } = this._pollGamepad();

    // 2. Smooth C1-continuous Keyboard & Gamepad D-Pad steering envelope (calm, user-friendly rates, zero step kink!)
    const leftDown = this.keys.has('KeyA') || this.keys.has('ArrowLeft') || gpDpadDir < 0;
    const rightDown = this.keys.has('KeyD') || this.keys.has('ArrowRight') || gpDpadDir > 0;
    const kbDir = (rightDown ? 1 : 0) - (leftDown ? 1 : 0);
    this.kbSteer = this._stepSmoothDiscreteSteer(
      this.kbSteer,
      kbDir,
      clamp(sens, 0.72, 1.0),
      speedKmhNow,
      10.5 * discreteRateSens,
      6.5 * discreteRateSens,
      18.0 * discreteRateSens,
      safeDt
    );

    // 3. Smooth C1-continuous Dual Touch Arrows (◀ / ▶) envelope (zero 0.32 step kink!)
    this.arrowRampSteer = this._stepSmoothDiscreteSteer(
      this.arrowRampSteer,
      this.arrowDir,
      clamp(sens, 0.72, 1.0),
      speedKmhNow,
      11.5 * discreteRateSens,
      7.0 * discreteRateSens,
      19.5 * discreteRateSens,
      safeDt
    );

    // 4. 1€ Adaptive Low-Pass Filter on Tilt Gyro (fcMin = 3.2Hz, beta = 0.25, 0.8° C1 deadzone)
    if (this.steeringStyle === 'TILT' && this.tiltSensorAvailable) {
      this.tiltFilteredSteer = this._tiltOneEuro.filter(this.tiltRawSteer, safeDt);
    } else if (this.tiltFilteredSteer !== 0.0) {
      this.tiltFilteredSteer = 0.0;
      this._tiltOneEuro.clear();
    }

    const kbGas = (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ? 1.0 : 0.0;
    const kbBrake = (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ? 1.0 : 0.0;

    // 5. Select active steering source:
    //    SAT_ACTIVE_ASSIST_BLEND === 0.0 on ALL position-mapped inputs (Wheel, Slider, Tilt, Gamepad)!
    const wheelActive = this.wheelPointerId !== null || this._wheelTouchId !== null;
    const sliderActive = this.sliderPointerId !== null || this._sliderTouchId !== null;
    const arrowActive = this.arrowPointerId !== null || this._arrowTouchId !== null;
    const wheelDraggingActively =
      wheelActive &&
      (this.steeringStyle !== 'TILT' || !this.tiltSensorAvailable || this._wheelMaxMovePx > 10.0);

    let rawSteerTarget = this.steer;
    let positionMappedActive = false;

    if (sliderActive) {
      rawSteerTarget = clamp(this._sliderOneEuro.filter(this.sliderTouchSteer, safeDt), -1.0, 1.0);
      positionMappedActive = true;
    } else if (wheelDraggingActively) {
      rawSteerTarget = clamp(this._wheelOneEuro.filter(this.wheelTouchSteer, safeDt), -1.0, 1.0);
      positionMappedActive = true;
    } else if (Math.abs(gpSteer) > 0.001 && Math.abs(gpSteer) >= Math.abs(this.kbSteer)) {
      rawSteerTarget = clamp(gpSteer, -1.0, 1.0);
      positionMappedActive = true;
    } else if (arrowActive || Math.abs(this.arrowRampSteer) > 0.001) {
      rawSteerTarget = clamp(this.arrowRampSteer + SAT_ACTIVE_ASSIST_BLEND * this.selfAligningTorque, -1.0, 1.0);
    } else if (kbDir !== 0 || Math.abs(this.kbSteer) > 0.001) {
      rawSteerTarget = clamp(this.kbSteer + SAT_ACTIVE_ASSIST_BLEND * this.selfAligningTorque, -1.0, 1.0);
    } else if (this.steeringStyle === 'TILT' && this.tiltSensorAvailable) {
      rawSteerTarget = clamp(this.tiltFilteredSteer, -1.0, 1.0);
      positionMappedActive = true;
    } else {
      // Released wheel / idle rack: smooth self-centering guided gently by pneumatic-trail SAT
      const satReturnTarget = Math.abs(this.selfAligningTorque) > 0.04 && speedKmhNow > 22.0
        ? clamp(this.selfAligningTorque * SAT_RELEASE_RETURN_GAIN, -0.32, 0.32)
        : 0.0;
      const returnRate = 14.0 + 4.5 * smoothstep(0.05, 0.50, Math.abs(this.steer));
      rawSteerTarget = this.steer + (satReturnTarget - this.steer) * expSmoothing(returnRate, safeDt);
      if (satReturnTarget === 0.0 && Math.abs(rawSteerTarget) < 0.0015) rawSteerTarget = 0.0;
    }

    // 5a. Read true road curvature ahead (1/m) for Road-Tangent Steering Assist & Look-to-Apex
    let kRealAhead = 0.0;
    let apexCurveHint = 0.0;
    if (playerCar && speedKmhNow > 12.0) {
      const track = (typeof window !== 'undefined' && window.__RACE_PHANATIC_GAME__?.track) || null;
      if (track) {
        const mPerG =
          track.metersPerGameUnit ||
          track.realMetersPerGameMeter ||
          (track.realLengthM && track.totalLength ? track.realLengthM / track.totalLength : 4.36);
        const sAhead = (playerCar.s + 22.0 / Math.max(0.5, mPerG)) % (track.totalLength || 1000);
        if (typeof track.getRealCurvature === 'function') {
          kRealAhead = Number(track.getRealCurvature(sAhead)) || 0.0;
        } else if (typeof track.getTrueCurvaturePerMeter === 'function') {
          kRealAhead = Number(track.getTrueCurvaturePerMeter(sAhead)) || 0.0;
        } else if (typeof track.getPhysicsCurvature === 'function') {
          kRealAhead = (Number(track.getPhysicsCurvature(sAhead)) || 0.0) / 82.0;
        }
        apexCurveHint = Math.tanh(kRealAhead * 28.0);
      } else if (Number.isFinite(playerCar.realCurvature)) {
        kRealAhead = Number(playerCar.realCurvature);
        apexCurveHint = Math.tanh(kRealAhead * 28.0);
      }
    }

    // 5b. Apply Traction Control / Steering Assist road-tangent centering & anti-twitch smoothing
    const roadAssist = this._computeRoadTangentSteerAssist(
      playerCar,
      rawSteerTarget,
      tcAssistWeight,
      speedKmhNow,
      kRealAhead
    );
    const assistedTarget = clamp(rawSteerTarget + roadAssist, -1.0, 1.0);

    if (tcAssistWeight > 0.0 && positionMappedActive) {
      // Smooth anti-twitch filter on position-mapped inputs (absorbs sudden thumb/wrist twitches while converging cleanly)
      const isCounter = assistedTarget * this._assistSmoothedSteer < -0.005;
      const baseCutRate = isCounter
        ? 26.0
        : (18.5 + (1.0 - tcAssistWeight) * 10.0) * (1.0 - 0.18 * tcAssistWeight * smoothstep(110.0, 290.0, speedKmhNow));
      this._assistSmoothedSteer += (assistedTarget - this._assistSmoothedSteer) * expSmoothing(baseCutRate, safeDt);
      if (Math.abs(assistedTarget - this._assistSmoothedSteer) < 0.0005) {
        this._assistSmoothedSteer = assistedTarget;
      }
      this.steer = clamp(this._assistSmoothedSteer, -1.0, 1.0);
    } else {
      this._assistSmoothedSteer = assistedTarget;
      this.steer = assistedTarget;
    }

    // 5c. Smooth Cockpit Look-to-Apex signal & Visor Tear-Off
    const targetLookApex = clamp(this.steer * 0.72 + apexCurveHint * 0.28, -1.0, 1.0);
    this.lookApexNormalized += (targetLookApex - this.lookApexNormalized) * expSmoothing(9.5, safeDt);
    if (Math.abs(targetLookApex) < 0.003 && Math.abs(this.lookApexNormalized) < 0.002) {
      this.lookApexNormalized = 0.0;
    }

    if (this.visorTearOffProgress < 1.0) {
      this.visorTearOffProgress = Math.min(1.0, this.visorTearOffProgress + safeDt / VISOR_WIPE_DURATION_SEC);
    }

    if (playerCar) {
      playerCar.tractionControl = this.tractionControl;
      playerCar.lookApexNormalized = this.lookApexNormalized;
      playerCar.visorTearOffProgress = this.visorTearOffProgress;
    }

    // 6. Pedals & Authoritative Physics Brake-Assist Readback:
    //    `physics.js` runs the 240Hz real-corner kinematic brake assist and writes `car.assistBrakeApplied`.
    //    `controls.js` sends pure manual brake so physics never latches its own assist output!
    const manualGas = clamp(Math.max(this.touchGas, kbGas, gpGas), 0.0, 1.0);
    const manualBrake = clamp(Math.max(this.touchBrake, kbBrake, gpBrake), 0.0, 1.0);
    const liveAssistBrake =
      playerCar && !playerCar.exploded && !playerCar.inPitLane
        ? clamp(Number(playerCar.assistBrakeApplied ?? playerCar.brakeAssistActive) || 0.0, 0.0, 1.0)
        : 0.0;

    this.manualThrottle = manualGas;
    this.manualBrake = manualBrake;
    this.assistBrakeApplied = liveAssistBrake;

    // Smooth AAA Mobile Auto-Throttle: cuts proportionally to manual/assist brake so hairpins never fight full gas!
    let autoGas = 0.0;
    if (this.controlSettings.autoThrottle && !playerCar?.exploded && !playerCar?.inPitLane) {
      const brakingNow = Math.max(manualBrake, liveAssistBrake);
      autoGas = clamp(1.0 - brakingNow * 2.2, 0.0, 1.0);
    }

    this.throttle = clamp(Math.max(manualGas, autoGas), 0.0, 1.0);
    this.brake = manualBrake;

    // 6b. Tactical MGU-K ERS Overtake Boost & FIA DRS Wing Flap State + Mobile HUD Sync
    const ersChargeVal = Number.isFinite(playerCar?.ersCharge)
      ? clamp(Number(playerCar.ersCharge), 0.0, 1.0)
      : 1.0;
    const carBrakeVal = Math.max(Number(playerCar?.brakeInput) || 0.0, manualBrake);

    if (
      this._ersLatched &&
      (ersChargeVal <= 0.02 || carBrakeVal > 0.20 || playerCar?.exploded || playerCar?.inPitLane)
    ) {
      this._ersLatched = false;
    }

    const kbErsHeld =
      this.keys.has('KeyE') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const rawErsHeld = Boolean(this._ersTouchHeld || this._ersLatched || kbErsHeld || gpErsHeld);
    this.ersOvertakeActive =
      rawErsHeld &&
      ersChargeVal > 0.02 &&
      carBrakeVal <= 0.20 &&
      !playerCar?.exploded &&
      !playerCar?.inPitLane;

    if (playerCar && (!playerCar.drsAvailable || carBrakeVal > 0.05)) {
      this.drsManualOpen = false;
    }

    const ersPctInt = Math.round(ersChargeVal * 100);
    const ersPctText = `${ersPctInt}%`;
    if (this.ersBtnEl) {
      this.ersBtnEl.classList.toggle('ers-active', Boolean(playerCar?.ersOvertakeActive));
      this.ersBtnEl.classList.toggle('ers-harvesting', Boolean(playerCar?.ersHarvesting));
      this.ersBtnEl.classList.toggle('ers-empty', ersChargeVal <= 0.03);
      if (this.ersBtnEl.style?.setProperty) {
        this.ersBtnEl.style.setProperty('--ers-pct', ersPctText);
      }
    }
    if (this.ersPctEl) {
      this.ersPctEl.textContent = ersPctText;
    }

    if (this.drsBtnEl) {
      const drsAvail = Boolean(playerCar?.drsAvailable);
      const drsOpen = Boolean(playerCar?.drsActive);
      this.drsBtnEl.classList.toggle('drs-available', drsAvail && !drsOpen);
      this.drsBtnEl.classList.toggle('drs-open', drsOpen);
      this.drsBtnEl.classList.toggle('drs-disabled', !drsAvail);
    }

    // 7. 1:1 Visual Steering Wheel Rotation (±180°, ZERO fake Math.sin shake!) + FFB Torque Arc + Tactile Haptics
    if (playerCar && !playerCar.exploded && speedKmhNow > 30.0) {
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (playerCar.onCurb) {
        this._vibrateCurbPulse();
      } else if (Math.abs(this.selfAligningTorque) > 0.58 && nowMs - this._lastSatVibMs > 150) {
        this._lastSatVibMs = nowMs;
        this._vibrate(8);
      }
    }

    const wheelDeg = this.steer * WHEEL_MAX_LOCK_DEG;
    if (this.wheelGraphicEl) {
      const cleanDeg = Math.abs(wheelDeg) < 0.05 ? '0.0' : wheelDeg.toFixed(1);
      this.wheelGraphicEl.style.transform = `rotate(${cleanDeg}deg)`;
    }
    if (this.sliderThumbEl && this.sliderZoneEl) {
      const sRect = this.sliderZoneEl.getBoundingClientRect();
      const maxThumbPx = Math.max(32.0, (sRect.width || 160.0) * 0.38);
      this.sliderThumbEl.style.transform = `translateX(${(this.steer * maxThumbPx).toFixed(1)}px)`;
    }

    this._updateFfbVisualArc(playerCar);

    const hubEl = this.wheelHubEl || this.wheelReadoutEl;
    if (hubEl) {
      let gTxt = 'G1';
      const curGear = playerCar ? Math.max(1, Math.round(playerCar.gear || 1)) : 1;
      if (playerCar && curGear !== this._lastCarGear) {
        const shiftKind = curGear > this._lastCarGear ? 'SHIFT_UP' : 'SHIFT_DOWN';
        this._lastCarGear = curGear;
        if (speedKmhNow > 25.0) this.triggerHaptic(shiftKind, 0.75);
      }
      if (playerCar) {
        if (playerCar.gearboxMode === 'CLASSIC_2SPD') {
          gTxt = curGear >= 2 ? 'HI' : 'LO';
        } else {
          gTxt = `G${clamp(curGear, 1, 8)}`;
        }
      }
      const steerDegInt = Math.round(wheelDeg) || 0;
      const vMs = speedKmhNow / 3.6;
      const rawLatG = Number.isFinite(playerCar?.latG)
        ? Math.abs(playerCar.latG)
        : Math.abs(this.steer) * ((vMs * vMs) / 260.0);

      if (playerCar?.inPitLane && speedKmhNow > 5) {
        hubEl.textContent = `${gTxt} • PIT`;
      } else if (
        speedKmhNow > 45 &&
        (playerCar?.inSlipstream || playerCar?.drsActive || (speedKmhNow >= 286 && Math.abs(this.steer) < 0.12))
      ) {
        hubEl.textContent = `${gTxt} • DRS`;
      } else if (speedKmhNow > 38 && Math.abs(this.steer) >= 0.12 && rawLatG >= 0.45) {
        hubEl.textContent = `${gTxt} • ${clamp(rawLatG, 0.5, 5.4).toFixed(1)}G`;
      } else {
        hubEl.textContent = `${gTxt} • ${steerDegInt}°`;
      }
    }

    // 8. Update 8-LED F1 Steering Wheel Rim RPM Shift Strip (.w-led.g -> .w-led.r -> .w-led.b)
    if (this.wheelLedEls.length && playerCar) {
      const totalLeds = this.wheelLedEls.length;
      const rpm = Number(playerCar.rpm) || 0;
      const rpmNorm = clamp((rpm - 7000.0) / 5100.0, 0.0, 1.0);
      let litCount = Math.round(rpmNorm * totalLeds);

      const highRpmStrobe = rpm >= 14300;
      const needsManualShift =
        highRpmStrobe ||
        (playerCar.gearboxMode === 'MANUAL_8SPD' && playerCar.gear < 8 && rpm >= 12350) ||
        (playerCar.gearboxMode === 'CLASSIC_2SPD' && playerCar.gear === 1 && rpm >= 12200) ||
        playerCar.overRevTimer > 0;
      const strobePhaseOff = needsManualShift && Math.floor(performance.now() / 55) % 2 === 1;
      if (strobePhaseOff) {
        litCount = 0;
      } else if (highRpmStrobe) {
        litCount = totalLeds;
      }

      if (this.wheelShiftLedsWrapEl) {
        this.wheelShiftLedsWrapEl.classList.toggle('shift-strobe', needsManualShift);
      }

      for (let i = 0; i < totalLeds; i++) {
        const led = this.wheelLedEls[i];
        led.classList.toggle('lit', i < litCount);
        led.classList.toggle('strobe-blue', highRpmStrobe && !strobePhaseOff && led.classList.contains('b'));
      }
    }

    // 9. Update analog pedal pressure bars & live physics Brake-Assist feedback readouts
    const effectiveBrakeShown = clamp(Math.max(this.brake, liveAssistBrake), 0.0, 1.0);
    const assistIntervening = liveAssistBrake > this.brake + 0.02;
    const gasPct = Math.round(this.throttle * 100);
    const brkPct = Math.round(effectiveBrakeShown * 100);

    if (this.gasFillEl) this.gasFillEl.style.height = `${gasPct}%`;
    if (this.brakeFillEl) {
      this.brakeFillEl.style.height = `${brkPct}%`;
      if (assistIntervening) {
        this.brakeFillEl.style.background =
          'linear-gradient(180deg, rgba(245, 158, 11, 0.90) 0%, rgba(217, 119, 6, 0.65) 100%)';
        this._brakeAssistStyled = true;
      } else if (this._brakeAssistStyled) {
        this.brakeFillEl.style.background = '';
        this._brakeAssistStyled = false;
      }
    }
    if (this.brakePedalEl) {
      this.brakePedalEl.classList.toggle('assist-brake-active', assistIntervening);
    }
    if (this.gasPctEl) this.gasPctEl.textContent = `${gasPct}%`;
    if (this.brakePctEl) this.brakePctEl.textContent = `${brkPct}%`;
  }

  _updateFfbVisualArc(playerCar) {
    const torque = this.ffbTorqueNormalized;
    const absTorque = Math.abs(torque);
    const flatVib = this.tireFlatSpotVibration;

    if (this.wheelZoneEl?.style?.setProperty) {
      this.wheelZoneEl.style.setProperty('--ffb-torque', torque.toFixed(3));
      this.wheelZoneEl.style.setProperty('--ffb-load', absTorque.toFixed(3));
      this.wheelZoneEl.style.setProperty('--ffb-flatspot', flatVib.toFixed(3));
    }

    if (!this.ffbArcSvgEl || !this.ffbArcLeftEl || !this.ffbArcRightEl) return;

    const pct = clamp(absTorque * 100.0, 0.0, 100.0);
    this.ffbArcLeftEl.setAttribute('stroke-dasharray', torque < -0.015 ? `${pct.toFixed(1)} 100` : '0 100');
    this.ffbArcRightEl.setAttribute('stroke-dasharray', torque > 0.015 ? `${pct.toFixed(1)} 100` : '0 100');

    let arcColor = '#00d2be';
    if (flatVib > 0.20 || (Number(playerCar?.skidIntensity) || 0.0) > 0.55) {
      arcColor = '#ef4444';
    } else if (playerCar?.onCurb || absTorque > 0.52) {
      arcColor = '#f59e0b';
    }
    const strokeW = (2.8 + flatVib * 1.3).toFixed(2);
    this.ffbArcLeftEl.setAttribute('stroke', arcColor);
    this.ffbArcRightEl.setAttribute('stroke', arcColor);
    this.ffbArcLeftEl.setAttribute('stroke-width', strokeW);
    this.ffbArcRightEl.setAttribute('stroke-width', strokeW);
    this.ffbArcSvgEl.style.opacity = absTorque > 0.015 || flatVib > 0.05 ? '0.94' : '0.28';
  }

  /**
   * Rich Mobile & Gamepad Haptics:
   * Supports 'TAP', 'SHIFT_UP', 'SHIFT_DOWN', 'DRS', 'ERS', 'OVERTAKE', 'KERB', 'RUB', and 'LAUNCH_PERFECT'.
   */
  triggerHaptic(kind = 'TAP', intensity = 1.0) {
    if (!this.haptics || !this.controlSettings.haptics) return false;

    const key = String(kind || 'TAP').toUpperCase().trim();
    const scale = clamp(Number.isFinite(Number(intensity)) ? Number(intensity) : 1.0, 0.15, 1.5);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    let vibPattern = Math.max(4, Math.round(8 * scale));
    let gpDur = 22;
    let gpWeak = 0.22 * scale;
    let gpStrong = 0.06 * scale;
    let cooldownMs = 32;

    switch (key) {
      case 'SHIFT_UP':
        vibPattern = [Math.max(5, Math.round(12 * scale)), 16, Math.max(4, Math.round(7 * scale))];
        gpDur = 42;
        gpWeak = 0.46 * scale;
        gpStrong = 0.34 * scale;
        cooldownMs = 42;
        break;
      case 'SHIFT_DOWN':
        vibPattern = Math.max(5, Math.round(10 * scale));
        gpDur = 34;
        gpWeak = 0.38 * scale;
        gpStrong = 0.20 * scale;
        cooldownMs = 42;
        break;
      case 'DRS':
        vibPattern = [10, 22, 14];
        gpDur = 55;
        gpWeak = 0.52 * scale;
        gpStrong = 0.18 * scale;
        cooldownMs = 55;
        break;
      case 'ERS':
        vibPattern = [14, 18, 24];
        gpDur = 75;
        gpWeak = 0.65 * scale;
        gpStrong = 0.42 * scale;
        cooldownMs = 55;
        break;
      case 'OVERTAKE':
        vibPattern = [12, 20, 18];
        gpDur = 68;
        gpWeak = 0.56 * scale;
        gpStrong = 0.32 * scale;
        cooldownMs = 110;
        break;
      case 'KERB':
      case 'CURB':
        vibPattern = Math.max(6, Math.round(11 * scale));
        gpDur = 32;
        gpWeak = 0.35 * scale;
        gpStrong = 0.24 * scale;
        cooldownMs = 85;
        break;
      case 'RUB':
        vibPattern = [Math.max(8, Math.round(18 * scale)), 14, Math.max(6, Math.round(12 * scale))];
        gpDur = 82;
        gpWeak = 0.60 * scale;
        gpStrong = 0.72 * scale;
        cooldownMs = 140;
        break;
      case 'LAUNCH_PERFECT':
        vibPattern = [16, 20, 28, 18, 14];
        gpDur = 125;
        gpWeak = 0.82 * scale;
        gpStrong = 0.76 * scale;
        cooldownMs = 120;
        break;
      case 'TAP':
      default:
        vibPattern = Math.max(4, Math.round(8 * scale));
        gpDur = 20;
        gpWeak = 0.22 * scale;
        gpStrong = 0.06 * scale;
        cooldownMs = 32;
        break;
    }

    const lastKindMs = this._hapticLastByKind[key] || 0;
    if (lastKindMs && now - lastKindMs < cooldownMs) {
      return false;
    }
    this._hapticLastByKind[key] = now;

    if (this._canVibrate()) {
      try {
        navigator.vibrate(vibPattern);
      } catch (_) {}
    }

    this._pulseGamepadHaptics(gpDur, gpWeak, gpStrong);
    return true;
  }

  _canVibrate() {
    if (!this.haptics || !this.controlSettings.haptics) return false;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
    // Chrome blocks native vibrate() until the user has interacted with the frame
    let isNativeVibrate = true;
    try {
      isNativeVibrate = Function.prototype.toString.call(navigator.vibrate).includes('[native code]');
    } catch (_) {}
    if (isNativeVibrate && navigator.userActivation && !navigator.userActivation.hasBeenActive) {
      return false;
    }
    return true;
  }

  _pulseGamepadHaptics(durationMs, weakMag, strongMag) {
    if (!this.haptics || !this.controlSettings.haptics) return;
    let pad = this._activeGamepad;
    if (!pad && typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      try {
        const pads = navigator.getGamepads();
        if (pads) {
          for (let i = 0; i < pads.length; i++) {
            if (pads[i] && pads[i].connected && pads[i].vibrationActuator) {
              pad = pads[i];
              break;
            }
          }
        }
      } catch (_) {}
    }
    const actuator = pad?.vibrationActuator;
    if (actuator && typeof actuator.playEffect === 'function') {
      try {
        const res = actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: Math.max(10, Math.round(durationMs)),
          weakMagnitude: clamp(weakMag, 0.0, 1.0),
          strongMagnitude: clamp(strongMag, 0.0, 1.0),
        });
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      } catch (_) {}
    }
  }

  _vibrate(ms) {
    if (this._canVibrate()) {
      try {
        navigator.vibrate(ms);
      } catch (_) {}
    }
  }

  _vibratePedalTick(ms = 8) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!this._lastPedalHapticMs || now - this._lastPedalHapticMs > 55) {
      this._lastPedalHapticMs = now;
      this._vibrate(ms);
      this._pulseGamepadHaptics(ms + 10, 0.18, 0.06);
    }
  }

  _vibrateCurbPulse() {
    this.triggerHaptic('KERB', 0.9);
  }

  _vibrateFlatSpotThump(severity = 0.35) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!this._lastFlatSpotVibMs || now - this._lastFlatSpotVibMs > 110) {
      this._lastFlatSpotVibMs = now;
      const dur = Math.round(clamp(5 + severity * 6, 5, 11));
      this._vibrate(dur);
      this._pulseGamepadHaptics(24, clamp(severity * 0.45, 0.1, 0.45), clamp(severity * 0.25, 0.05, 0.28));
    }
  }
}
