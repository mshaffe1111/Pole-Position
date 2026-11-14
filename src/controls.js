// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// AAA Mobile Multi-Touch, Tilt Gyro, Keyboard & Gamepad Controls:
// Relative-Anchor F1 Wheel, Dual Touch Arrows (◀/▶), Accelerometer Tilt,
// Multi-Touch Trail-Brake Pedals, Driving Assists & Custom Cockpit Layout
// ============================================================================

const WHEEL_MICRO_DEADZONE_PX = 4.5;
const WHEEL_MAX_LOCK_DEG = 125.0;
const TILT_DEADZONE_DEG = 1.6;
const TILT_BASE_MAX_DEG = 26.0;
const GAMEPAD_AXIS_DEADZONE = 0.22;
const GAMEPAD_TRIGGER_DEADZONE = 0.12;
const SAT_ACTIVE_ASSIST_BLEND = 0.18;
const SAT_RELEASE_RETURN_GAIN = 0.52;
const HIGH_SPEED_STEER_DAMP_MIN = 0.74;
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

function normalizeBrakingAssist(val) {
  if (val === true) return 'HIGH';
  if (val === false || val === null || val === undefined) return 'OFF';
  const upper = String(val).toUpperCase().trim();
  if (upper === 'LOW' || upper === 'MEDIUM' || upper === 'HIGH') return upper;
  return 'OFF';
}

export class ErgonomicControls {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.handedness = 'RIGHT_HANDED'; // 'RIGHT_HANDED' | 'LEFT_HANDED'
    this.steeringStyle = 'WHEEL';     // 'WHEEL' | 'BUTTONS' | 'TILT'

    // Active normalized outputs
    this.steer = 0.0;    // [-1..1]
    this.throttle = 0.0; // [0..1]
    this.brake = 0.0;    // [0..1]

    // Customizable Ergonomics & Driving Assists (mirrored at top-level for physics/HUD convenience)
    this.controlSettings = {
      sensitivity: 1.0,      // [0.6..1.5]
      controlScale: 1.0,     // [0.65..1.35]
      controlOpacity: 0.92,  // [0.25..1.0]
      brakingAssist: 'OFF',  // 'OFF' | 'LOW' | 'MEDIUM' | 'HIGH'
      autoThrottle: false,   // boolean
      haptics: true,         // boolean
    };
    this.sensitivity = 1.0;
    this.controlScale = 1.0;
    this.controlOpacity = 0.92;
    this.brakingAssist = 'OFF';
    this.autoThrottle = false;
    this.haptics = true;

    // Strict >= 0.22 deadzone prevents phantom pull from virtual HID controllers
    this.gamepadDeadzone = GAMEPAD_AXIS_DEADZONE;
    this._gpPrevShiftUp = false;
    this._gpPrevShiftDown = false;
    this._gpShiftInitialized = false;

    // Native TouchEvent identifier state (isolates multi-touch thumbs on iOS Safari & Android Chrome)
    this._hasNativeTouch =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));
    this._wheelTouchId = null;
    this._arrowTouchId = null;
    this._pedalTouchId = null;

    // Relative-anchor F1 Wheel pointer state (where thumb lands = 0.0 deg straight!)
    this.wheelPointerId = null;
    this.wheelAnchorX = 0.0;
    this.wheelTouchSteer = 0.0;
    this._wheelDownTimeMs = 0;
    this._wheelMaxMovePx = 0;

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

    // Physics-Driven Self-Aligning Torque (SAT), Speed Damping, Look-to-Apex & Visor Tear-Off
    this.selfAligningTorque = 0.0;    // [-1..1] pneumatic-trail + rear-oversteer counter-steer torque
    this.speedSteerAuthority = 1.0;   // [0.74..1.0] 300+ km/h lock damping factor
    this.lookApexNormalized = 0.0;    // [-1..1] smooth cockpit/chase look-to-apex yaw signal
    this.visorTearOffProgress = 1.0;  // [0..1] 0 -> 1 visor wipe sweep (1.0 = clean)
    this.visorTearOffCount = 0;
    this._visorGestureTouchId = null;
    this._visorGestureStartX = 0.0;
    this._visorGestureStartY = 0.0;
    this._visorGestureStartMs = 0.0;
    this._visorLastTapMs = 0.0;
    this._visorLastTapX = 0.0;
    this._visorLastTapY = 0.0;
    this._lastSatVibMs = 0;

    // Keyboard state
    this.keys = new Set();
    this.kbSteer = 0.0;

    this._lastVib = 0;

    this._bindDOM();
    this._bindKeyboard();
    this.setGearboxUI('AUTO_8SPD', 1);
    this._applyControlVisualSettings();
  }

  _bindDOM() {
    this.hudControlsEl =
      document.getElementById('mobile-controls-layer') ||
      document.getElementById('touch-controls-layer');
    this.touchControlsLayerAltEl = document.getElementById('touch-controls-layer');

    this.wheelZoneEl = document.getElementById('touch-wheel-zone');
    this.wheelGraphicEl = document.getElementById('virtual-wheel-graphic');
    this.wheelReadoutEl = document.getElementById('wheel-angle-readout');
    this.wheelHubEl = this.wheelReadoutEl;
    this.wheelShiftLedsWrapEl = document.getElementById('wheel-shift-leds');
    this.wheelCaptionEl = this.wheelZoneEl ? this.wheelZoneEl.querySelector('.control-caption') : null;
    this.wheelLedEls = Array.from(document.querySelectorAll('.w-led'));

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

    // Lock touch-action and selection on all interactive cockpit surfaces for Safari/Chrome
    const touchSurfaces = [
      this.hudControlsEl,
      this.touchControlsLayerAltEl,
      this.wheelZoneEl,
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

    // ------------------------------------------------------------------------
    // 1A. Relative-Anchor Virtual F1 Steering Wheel (Zero Initial Snap!)
    // ------------------------------------------------------------------------
    const releaseWheelPointer = (pointerId) => {
      if (pointerId !== undefined && pointerId !== this.wheelPointerId) return;
      this.wheelPointerId = null;
      if (this._wheelTouchId === null) {
        this.wheelTouchSteer = 0.0;
        this.wheelZoneEl?.classList.remove('wheel-active');
      }
    };
    const releaseWheelTouch = (touchId) => {
      if (touchId !== undefined && touchId !== this._wheelTouchId) return;
      this._wheelTouchId = null;
      if (this.wheelPointerId === null) {
        this.wheelTouchSteer = 0.0;
        this.wheelZoneEl?.classList.remove('wheel-active');
      }
    };
    this._releaseWheelPointer = releaseWheelPointer;
    this._releaseWheelTouch = releaseWheelTouch;

    const beginWheelTrack = (clientX) => {
      this.wheelAnchorX = clientX; // Exact thumb landing spot = 0.0° straight ahead!
      this.wheelTouchSteer = 0.0;
      this._wheelDownTimeMs = performance.now();
      this._wheelMaxMovePx = 0.0;
      this.wheelZoneEl?.classList.add('wheel-active');
      this._vibrate(6);
    };

    const moveWheelTrack = (pt) => {
      this._wheelMaxMovePx = Math.max(this._wheelMaxMovePx, Math.abs(pt.clientX - this.wheelAnchorX));
      if (this.steeringStyle !== 'TILT' || !this.tiltSensorAvailable || this._wheelMaxMovePx > 10.0) {
        this._updateWheelFromPointer(pt);
      }
    };

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
    // 2. Multi-Touch Analog Gas/Brake Pedals (with Horizontal Trail-Brake Roll!)
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
            '#touch-wheel-zone, #touch-arrow-zone, #touch-pedal-zone, #touch-tilt-zone, ' +
            '#touch-shifter-btn, #touch-shift-down-btn, #touch-shift-up-btn, ' +
            'button, a, input, select, textarea, .garage-drawer, .career-drawer, .modal-box, ' +
            '#pit-strategy-drawer, #pit-stop-overlay, #replay-overlay, .hud-quick-actions, #right-telemetry-dock'
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
        : (this.tiltZoneEl && this.steeringStyle === 'TILT' ? this.tiltZoneEl : this.wheelZoneEl);

      let caught = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this._wheelTouchId || t.identifier === this._arrowTouchId || t.identifier === this._pedalTouchId) {
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
        if (t.identifier === this._arrowTouchId) {
          releaseArrowTouch(t.identifier);
        }
        if (t.identifier === this._pedalTouchId) {
          releasePedalTouch(t.identifier);
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
      } else if (e.pointerId === this.arrowPointerId) {
        this._updateArrowFromPointer(e, false);
      } else if (e.pointerId === this.pedalPointerId) {
        this._updatePedalsFromPointer(e);
      }
    }, { passive: true });

    const onGlobalPointerEnd = (e) => {
      if (ignoreTouchPointer(e)) return;
      if (e.pointerId === this.wheelPointerId) releaseWheelPointer(e.pointerId);
      if (e.pointerId === this.arrowPointerId) releaseArrowPointer(e.pointerId);
      if (e.pointerId === this.pedalPointerId) releasePedalPointer(e.pointerId);
    };
    window.addEventListener('pointerup', onGlobalPointerEnd, { passive: true });
    window.addEventListener('pointercancel', onGlobalPointerEnd, { passive: true });

    const resetAllTransientInputs = () => {
      releaseWheelPointer();
      releaseWheelTouch();
      releaseArrowPointer();
      releaseArrowTouch();
      releasePedalPointer();
      releasePedalTouch();
      this.keys.clear();
    };
    window.addEventListener('blur', resetAllTransientInputs);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) resetAllTransientInputs();
    });

    // ------------------------------------------------------------------------
    // 3. Manual Shifters: 1982 LOW/HIGH Toggle & 8-Speed Sequential Paddles
    // ------------------------------------------------------------------------
    const bindShifterButton = (btnEl, vibMs, dir) => {
      if (!btnEl) return;
      btnEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        this._vibrate(vibMs);
        if (this.callbacks.onShift) this.callbacks.onShift(dir);
      }, { passive: false });

      btnEl.addEventListener('pointerdown', (e) => {
        if (ignoreTouchPointer(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (this.callbacks.onUserInteract) this.callbacks.onUserInteract();
        this._vibrate(vibMs);
        if (this.callbacks.onShift) this.callbacks.onShift(dir);
      });
    };

    bindShifterButton(this.shifterBtnEl, 16, 0);
    bindShifterButton(this.shiftDownBtnEl, 14, -1);
    bindShifterButton(this.shiftUpBtnEl, 14, +1);
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
    const sens = clamp(this.controlSettings.sensitivity || 1.0, 0.6, 1.5);
    const deltaDeg = clamp(this._lastRawTiltDeg - this.tiltCenterDeg, -55.0, 55.0);
    const effDeg = Math.abs(deltaDeg) <= TILT_DEADZONE_DEG
      ? 0.0
      : deltaDeg - Math.sign(deltaDeg) * TILT_DEADZONE_DEG;

    const maxTiltDeg = TILT_BASE_MAX_DEG / sens;
    const lin = clamp(effDeg / Math.max(8.0, maxTiltDeg), -1.0, 1.0);
    const absLin = Math.abs(lin);

    this.tiltRawSteer = absLin === 0.0
      ? 0.0
      : Math.sign(lin) * (0.42 * absLin + 0.58 * Math.pow(absLin, 1.30));
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
        radioEl.innerHTML = `<span class="radio-tag">🧭 CONTROLS</span> ${noticeMsg}`;
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
    } else {
      cap.textContent = 'SLIDE TO STEER';
    }
  }

  // --------------------------------------------------------------------------
  // CUSTOMIZABLE CONTROL SETTINGS (SENSITIVITY, SCALE, OPACITY, ASSISTS)
  // --------------------------------------------------------------------------
  setControlSettings(opts = {}) {
    if (!opts || typeof opts !== 'object') return this.getControlSettings();

    if (opts.sensitivity !== undefined && Number.isFinite(Number(opts.sensitivity))) {
      this.controlSettings.sensitivity = clamp(Number(opts.sensitivity), 0.6, 1.5);
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
    if (opts.autoThrottle !== undefined) {
      this.controlSettings.autoThrottle = !!opts.autoThrottle;
    }
    if (opts.haptics !== undefined) {
      this.controlSettings.haptics = !!opts.haptics;
    }

    this.sensitivity = this.controlSettings.sensitivity;
    this.controlScale = this.controlSettings.controlScale;
    this.controlOpacity = this.controlSettings.controlOpacity;
    this.brakingAssist = this.controlSettings.brakingAssist;
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

    for (const z of [this.wheelZoneEl, this.arrowZoneEl, this.tiltZoneEl]) {
      if (!z) continue;
      z.style.transformOrigin = steerOrigin;
      z.style.transform = scaleCss;
    }
    const pedalRoot = this.pedalAssemblyEl || (typeof document !== 'undefined' ? document.getElementById('touch-pedal-assembly') : null);
    if (pedalRoot) {
      pedalRoot.style.transformOrigin = pedalOrigin;
      pedalRoot.style.transform = scaleCss;
    }
  }

  _computeDrivingAssists(playerCar, manualBrake) {
    let assistBrake = 0.0;
    let throttleCap = 1.0;

    const assistMode = this.controlSettings.brakingAssist;
    if (assistMode !== 'OFF' && playerCar && !playerCar.exploded && !playerCar.inPitLane && playerCar.speedKmh > 92) {
      const track = (typeof window !== 'undefined' && window.__RACE_PHANATIC_GAME__?.track) || null;
      let peakCurv = 0.0;

      if (track && typeof track.getPhysicsCurvature === 'function') {
        const mPerG = track.realMetersPerGameMeter || 4.36;
        const distsM = [0, 22, 46, 74];
        for (let i = 0; i < distsM.length; i++) {
          const sAhead = (playerCar.s + distsM[i] / mPerG) % 1000;
          const k = Math.abs(track.getPhysicsCurvature(sAhead) || 0);
          if (k > peakCurv) peakCurv = k;
        }
      } else if (Math.abs(this.steer) > 0.55) {
        peakCurv = Math.abs(this.steer) * 0.012;
      }

      // Only assist when genuine corner curvature lies ahead — NEVER slow down on straights!
      if (peakCurv >= 0.0026) {
        const safeSpeedKmh = clamp(296.0 / Math.sqrt(1.0 + peakCurv * 255.0), 108.0, 315.0);
        const margin = assistMode === 'LOW' ? 24.0 : (assistMode === 'MEDIUM' ? 10.0 : 0.0);
        const maxStrength = assistMode === 'LOW' ? 0.38 : (assistMode === 'MEDIUM' ? 0.68 : 0.90);
        const overspeed = playerCar.speedKmh - (safeSpeedKmh + margin);
        if (overspeed > 0) {
          assistBrake = clamp((overspeed / 42.0) * maxStrength, 0.0, maxStrength);
          if (assistMode === 'HIGH' && overspeed > 8.0) {
            throttleCap = clamp(1.0 - overspeed / 36.0, 0.0, 1.0);
          }
        }
      }
    }

    let autoGas = 0.0;
    if (this.controlSettings.autoThrottle) {
      const brakingNow = Math.max(manualBrake, assistBrake);
      if (brakingNow < 0.08) {
        autoGas = throttleCap;
      } else {
        autoGas = clamp(1.0 - brakingNow * 2.4, 0.0, throttleCap);
      }
    }

    return { assistBrake, autoGas, throttleCap };
  }

  // --------------------------------------------------------------------------
  // POINTER & TOUCH ZONE HANDLERS
  // --------------------------------------------------------------------------
  _clearStalePointerCollision(pointerId, claimingZone) {
    if (claimingZone !== 'wheel' && this.wheelPointerId === pointerId && this._releaseWheelPointer) {
      this._releaseWheelPointer(pointerId);
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

    // 4.5px comfort micro-deadzone: resting a thumb holds strictly 0.000 (0° straight ahead!)
    const effDx = Math.abs(rawDx) <= WHEEL_MICRO_DEADZONE_PX
      ? 0.0
      : rawDx - Math.sign(rawDx) * WHEEL_MICRO_DEADZONE_PX;

    const sens = clamp(this.controlSettings.sensitivity || 1.0, 0.6, 1.5);
    const baseDragPx = Math.max(54.0, Math.min(92.0, (rect.width || 160.0) * 0.36));
    const maxDragPx = baseDragPx / sens;
    const lin = clamp(effDx / maxDragPx, -1.0, 1.0);
    const absLin = Math.abs(lin);

    // Progressive F1 steering sensitivity: fine center control at 300+ km/h, full authority at lock
    this.wheelTouchSteer = absLin === 0.0
      ? 0.0
      : Math.sign(lin) * (0.38 * absLin + 0.62 * Math.pow(absLin, 1.35));
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

    // Forgiving phone pedal modulation: comfortable lower-thumb press (>= 22% height) delivers full 100%,
    // while bottom edge smoothly feathers 60%..100% for wet traction exits
    const yFromBottom = clamp((rect.bottom - e.clientY) / height, 0.0, 1.0);
    const pressure = yFromBottom >= 0.22
      ? 1.0
      : 0.60 + 0.40 * (yFromBottom / 0.22);

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

    this.gasPedalEl?.classList.toggle('active-pedal', this.touchGas > 0.05);
    this.brakePedalEl?.classList.toggle('active-pedal', this.touchBrake > 0.05);
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const activeTag = document.activeElement?.tagName;
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
        } else if (code === 'KeyE' || code === 'ShiftRight') {
          if (this.callbacks.onShift) this.callbacks.onShift(+1);
        } else if (code === 'KeyQ' || code === 'ShiftLeft') {
          if (this.callbacks.onShift) this.callbacks.onShift(-1);
        } else if (code === 'KeyV') {
          if (this.callbacks.onToggleVisualStyle) this.callbacks.onToggleVisualStyle();
        } else if (code === 'KeyC') {
          if (this.callbacks.onCycleCamera) this.callbacks.onCycleCamera(1);
        } else if (code === 'KeyX' || code === 'KeyT') {
          this.triggerVisorTearOff();
        } else if (code === 'KeyR') {
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
    const norm = style === 'BUTTONS' ? 'BUTTONS' : (style === 'TILT' ? 'TILT' : 'WHEEL');
    this.steeringStyle = norm;

    this.tiltZoneEl = this.tiltZoneEl || (typeof document !== 'undefined' ? document.getElementById('touch-tilt-zone') : null);

    if (this.tiltZoneEl) {
      if (this.wheelZoneEl) this.wheelZoneEl.style.display = norm === 'WHEEL' ? 'flex' : 'none';
      if (this.arrowZoneEl) this.arrowZoneEl.style.display = norm === 'BUTTONS' ? 'flex' : 'none';
      this.tiltZoneEl.style.display = norm === 'TILT' ? 'flex' : 'none';
    } else {
      // Keep live-rotating F1 Steering Wheel telemetry hub visible in both WHEEL and TILT modes!
      if (this.wheelZoneEl) {
        this.wheelZoneEl.style.display = (norm === 'WHEEL' || norm === 'TILT') ? 'flex' : 'none';
      }
      if (this.arrowZoneEl) {
        this.arrowZoneEl.style.display = norm === 'BUTTONS' ? 'flex' : 'none';
      }
    }

    this.wheelZoneEl?.classList.remove('wheel-active');
    this.wheelPointerId = null;
    this._wheelTouchId = null;
    this.wheelTouchSteer = 0.0;
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

    const seqWrap = this.seqShifterWrapEl || document.getElementById('seq-shifter-wrap');
    if (seqWrap) {
      // Keep cockpit clean and pedals tall in AUTO_8SPD; show paddles only in MANUAL_8SPD / PRO_6SPD
      seqWrap.style.display = isManualMulti && !isAuto8 ? 'flex' : 'none';
      const gearDisp = this.seqGearNumEl || document.getElementById('seq-gear-num');
      if (gearDisp) gearDisp.textContent = `G${safeGear}`;
    }
  }

  _pollGamepad() {
    let gpSteer = 0.0;
    let gpGas = 0.0;
    let gpBrake = 0.0;

    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return { gpSteer, gpGas, gpBrake };
    }

    let pads;
    try {
      pads = navigator.getGamepads();
    } catch (_) {
      return { gpSteer, gpGas, gpBrake };
    }
    if (!pads) return { gpSteer, gpGas, gpBrake };

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

    if (!activePad) {
      this._gpShiftInitialized = false;
      return { gpSteer, gpGas, gpBrake };
    }

    const sens = clamp(this.controlSettings.sensitivity || 1.0, 0.6, 1.5);
    const deadzone = Math.max(GAMEPAD_AXIS_DEADZONE, this.gamepadDeadzone || GAMEPAD_AXIS_DEADZONE);
    const rawAx = Number.isFinite(activePad.axes?.[0]) ? clamp(activePad.axes[0], -1.0, 1.0) : 0.0;
    if (Math.abs(rawAx) > deadzone) {
      const norm = clamp(((Math.abs(rawAx) - deadzone) / Math.max(0.01, 1.0 - deadzone)) * sens, 0.0, 1.0);
      gpSteer = Math.sign(rawAx) * (0.45 * norm + 0.55 * Math.pow(norm, 1.35));
    }

    const rtVal = activePad.buttons?.[7]?.value || 0.0;
    const ltVal = activePad.buttons?.[6]?.value || 0.0;
    if (rtVal > GAMEPAD_TRIGGER_DEADZONE) {
      gpGas = clamp((rtVal - GAMEPAD_TRIGGER_DEADZONE) / (1.0 - GAMEPAD_TRIGGER_DEADZONE), 0.0, 1.0);
    }
    if (ltVal > GAMEPAD_TRIGGER_DEADZONE) {
      gpBrake = clamp((ltVal - GAMEPAD_TRIGGER_DEADZONE) / (1.0 - GAMEPAD_TRIGGER_DEADZONE), 0.0, 1.0);
    }

    // Standard-layout D-Pad steering & LB/RB paddle shifters
    if (activePad.mapping === 'standard' && activePad.buttons) {
      const dLeft = !!activePad.buttons[14]?.pressed;
      const dRight = !!activePad.buttons[15]?.pressed;
      const dDir = (dRight ? 1 : 0) - (dLeft ? 1 : 0);
      if (dDir !== 0 && Math.abs(gpSteer) < 0.1) {
        gpSteer = clamp(dDir * 0.88 * sens, -1.0, 1.0);
      }

      const lbDown = !!activePad.buttons[4]?.pressed;
      const rbDown = !!activePad.buttons[5]?.pressed;
      if (!this._gpShiftInitialized) {
        this._gpPrevShiftDown = lbDown;
        this._gpPrevShiftUp = rbDown;
        this._gpShiftInitialized = true;
      } else {
        if (rbDown && !this._gpPrevShiftUp && this.callbacks.onShift) {
          this.callbacks.onShift(+1);
        }
        if (lbDown && !this._gpPrevShiftDown && this.callbacks.onShift) {
          this.callbacks.onShift(-1);
        }
        this._gpPrevShiftDown = lbDown;
        this._gpPrevShiftUp = rbDown;
      }
    }

    return { gpSteer, gpGas, gpBrake };
  }

  // --------------------------------------------------------------------------
  // PHYSICS-DRIVEN SELF-ALIGNING TORQUE (SAT), LOOK-TO-APEX & VISOR TEAR-OFF
  // --------------------------------------------------------------------------
  applyPhysicsFeedback(car, dt = 1.0 / 60.0) {
    const safeDt = Number.isFinite(dt) ? clamp(dt, 0.0005, 0.1) : (1.0 / 60.0);
    if (!car || car.exploded || car.inPitLane) {
      this.selfAligningTorque += (0.0 - this.selfAligningTorque) * expSmoothing(18.0, safeDt);
      if (Math.abs(this.selfAligningTorque) < 0.002) this.selfAligningTorque = 0.0;
      this.speedSteerAuthority = 1.0;
      return {
        selfAligningTorque: this.selfAligningTorque,
        speedSteerAuthority: this.speedSteerAuthority,
      };
    }

    const speedKmh = Math.max(0.0, Number(car.speedKmh) || 0.0);

    // 1. Read front-axle pneumatic-trail + rear-oversteer SAT from physics (or synthesize cleanly)
    let targetSat = 0.0;
    if (Number.isFinite(car.selfAligningTorque)) {
      targetSat = clamp(car.selfAligningTorque, -1.0, 1.0);
    } else if (speedKmh > 18.0) {
      const relYaw = Number(car.relYaw) || 0.0;
      const steerRef = Number.isFinite(car.steerInput) ? car.steerInput : this.steer;
      const skidBoost = 1.0 + clamp(Number(car.skidIntensity) || 0.0, 0.0, 1.0) * 0.45;
      const oversteerCounter = clamp(-relYaw * 2.15 * skidBoost, -0.85, 0.85);
      const pneumaticTrail = -clamp(steerRef, -1.0, 1.0) * 0.16 * clamp(speedKmh / 240.0, 0.0, 1.0);
      targetSat = clamp(oversteerCounter + pneumaticTrail, -1.0, 1.0);
    }

    const lowSpeedGate = clamp((speedKmh - 14.0) / 24.0, 0.0, 1.0);
    targetSat *= lowSpeedGate;
    if (Math.abs(targetSat) < 0.012) targetSat = 0.0;

    this.selfAligningTorque += (targetSat - this.selfAligningTorque) * expSmoothing(24.0, safeDt);
    if (Math.abs(this.selfAligningTorque) < 0.002) {
      this.selfAligningTorque = 0.0;
    }

    // 2. Speed-sensitive steering lock damping above 225..335 km/h (full 1.00 lock in <125 km/h hairpins!)
    const highSpeedBlend = smoothstep(225.0, 335.0, speedKmh);
    this.speedSteerAuthority = 1.0 - (1.0 - HIGH_SPEED_STEER_DAMP_MIN) * highSpeedBlend;

    return {
      selfAligningTorque: this.selfAligningTorque,
      speedSteerAuthority: this.speedSteerAuthority,
    };
  }

  triggerVisorTearOff() {
    this.visorTearOffProgress = 0.0;
    this.visorTearOffCount += 1;
    this._vibratePedalTick(12);
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
    this._vibratePedalTick(9);
    if (this.callbacks.onCycleCamera) {
      this.callbacks.onCycleCamera(direction);
    }
  }

  getLookToApexRad(maxYawDeg = 12.5) {
    return this.lookApexNormalized * ((maxYawDeg * Math.PI) / 180.0);
  }

  update(dt, playerCar) {
    const safeDt = Number.isFinite(dt) ? clamp(dt, 0.0, 0.1) : (1.0 / 60.0);
    const sens = clamp(this.controlSettings.sensitivity || 1.0, 0.6, 1.5);
    const speedKmhNow = Math.max(0.0, Number(playerCar?.speedKmh) || 0.0);
    // Extra front-end turn-in agility in tight hairpins (<125 km/h: Monaco Loews, Fuji Hairpin)
    const hairpinAgility = speedKmhNow > 12.0 && speedKmhNow < 125.0
      ? 1.0 + 0.16 * (1.0 - smoothstep(45.0, 125.0, speedKmhNow))
      : 1.0;
    const rateScale = (0.72 + 0.28 * sens) * hairpinAgility;

    // 0. Update physics-driven Self-Aligning Torque (SAT) & 300+ km/h speed lock damping
    this.applyPhysicsFeedback(playerCar, safeDt);
    const satAssist = Math.abs(this.selfAligningTorque) > 0.025
      ? this.selfAligningTorque * SAT_ACTIVE_ASSIST_BLEND
      : 0.0;
    const authClamp = this.speedSteerAuthority;

    // 1. Keyboard progressive turn-in, rapid counter-steer & fast recentering
    const leftDown = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const rightDown = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    const targetKbSteer = ((rightDown ? 1 : 0) - (leftDown ? 1 : 0)) * clamp(sens, 0.75, 1.0);
    if (targetKbSteer !== 0) {
      const counterSteer = this.kbSteer !== 0 && Math.sign(targetKbSteer) !== Math.sign(this.kbSteer);
      const kbRate = (counterSteer ? 22.0 : (Math.abs(this.kbSteer) < 0.30 ? 15.0 : 9.5)) * rateScale;
      this.kbSteer += (targetKbSteer - this.kbSteer) * expSmoothing(kbRate, safeDt);
    } else if (this.kbSteer !== 0) {
      this.kbSteer += (0.0 - this.kbSteer) * expSmoothing(16.5, safeDt);
      if (Math.abs(this.kbSteer) < 0.003) this.kbSteer = 0.0;
    }

    // 2. Dual Touch Arrows (◀ / ▶): crisp corner-tap bite, smooth hold & fast recentering
    const targetArrowSteer = this.arrowDir * clamp(sens, 0.72, 1.0);
    if (this.arrowDir !== 0) {
      const counterSteer = this.arrowRampSteer !== 0 && Math.sign(this.arrowDir) !== Math.sign(this.arrowRampSteer);
      const arrowRate = (counterSteer
        ? 24.0
        : (Math.abs(this.arrowRampSteer) < 0.32 ? 18.0 : 9.8)) * rateScale;
      this.arrowRampSteer += (targetArrowSteer - this.arrowRampSteer) * expSmoothing(arrowRate, safeDt);
    } else if (this.arrowRampSteer !== 0) {
      this.arrowRampSteer += (0.0 - this.arrowRampSteer) * expSmoothing(17.5, safeDt);
      if (Math.abs(this.arrowRampSteer) < 0.003) this.arrowRampSteer = 0.0;
    }

    // 3. Mobile Accelerometer Tilt low-pass filter
    if (this.steeringStyle === 'TILT' && this.tiltSensorAvailable) {
      this.tiltFilteredSteer += (this.tiltRawSteer - this.tiltFilteredSteer) * expSmoothing(14.5, safeDt);
      if (this.tiltRawSteer === 0.0 && Math.abs(this.tiltFilteredSteer) < 0.002) {
        this.tiltFilteredSteer = 0.0;
      }
    } else if (this.tiltFilteredSteer !== 0.0) {
      this.tiltFilteredSteer = 0.0;
    }

    const kbGas = (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ? 1.0 : 0.0;
    const kbBrake = (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ? 1.0 : 0.0;

    // 4. HTML5 Gamepad polling (strict >= 0.22 deadzone prevents virtual HID drift!)
    const { gpSteer, gpGas, gpBrake } = this._pollGamepad();

    // 5. Combine active steering source with SAT counter-steer help & 300+ km/h lock damping
    const wheelActive = this.wheelPointerId !== null || this._wheelTouchId !== null;
    const arrowActive = this.arrowPointerId !== null || this._arrowTouchId !== null;
    const wheelDraggingActively =
      wheelActive &&
      (this.steeringStyle !== 'TILT' || !this.tiltSensorAvailable || this._wheelMaxMovePx > 10.0);

    if (wheelDraggingActively) {
      const targetWheel = this.wheelTouchSteer === 0.0 && Math.abs(satAssist) < 0.02
        ? 0.0
        : clamp(this.wheelTouchSteer * authClamp + satAssist, -1.0, 1.0);
      this.steer += (targetWheel - this.steer) * expSmoothing(28.0 * hairpinAgility, safeDt);
      if (targetWheel === 0.0 && Math.abs(this.steer) < 0.002) {
        this.steer = 0.0;
      }
    } else if (arrowActive || Math.abs(this.arrowRampSteer) > 0.003) {
      this.steer = clamp(this.arrowRampSteer * authClamp + satAssist, -1.0, 1.0);
    } else if (Math.abs(this.kbSteer) > 0.003 || Math.abs(gpSteer) > 0.01) {
      const baseStick = Math.abs(gpSteer) > Math.abs(this.kbSteer) ? gpSteer : this.kbSteer;
      this.steer = clamp(baseStick * authClamp + satAssist, -1.0, 1.0);
    } else if (this.steeringStyle === 'TILT' && this.tiltSensorAvailable) {
      this.steer = clamp(this.tiltFilteredSteer * authClamp + satAssist, -1.0, 1.0);
    } else {
      const satReturnTarget = Math.abs(this.selfAligningTorque) > 0.04
        ? clamp(this.selfAligningTorque * SAT_RELEASE_RETURN_GAIN, -0.65, 0.65)
        : 0.0;
      if (this.steer !== 0.0 || satReturnTarget !== 0.0) {
        this.steer += (satReturnTarget - this.steer) * expSmoothing(15.5, safeDt);
        if (satReturnTarget === 0.0 && Math.abs(this.steer) < 0.002) this.steer = 0.0;
      }
    }

    this.steer = clamp(this.steer, -1.0, 1.0);

    // 5b. Smooth Cockpit Look-to-Apex signal & Visor Tear-Off wipe progression
    let apexCurveHint = 0.0;
    if (playerCar && speedKmhNow > 18.0) {
      const track = (typeof window !== 'undefined' && window.__RACE_PHANATIC_GAME__?.track) || null;
      if (track && typeof track.getPhysicsCurvature === 'function') {
        const mPerG = track.realMetersPerGameMeter || 4.36;
        const sAhead = (playerCar.s + 28.0 / mPerG) % 1000;
        apexCurveHint = clamp((track.getPhysicsCurvature(sAhead) || 0.0) * 165.0, -1.0, 1.0);
      }
    }
    const targetLookApex = clamp(
      this.steer * 0.68 + apexCurveHint * 0.32 - this.selfAligningTorque * 0.14,
      -1.0,
      1.0
    );
    this.lookApexNormalized += (targetLookApex - this.lookApexNormalized) * expSmoothing(9.5, safeDt);
    if (Math.abs(targetLookApex) < 0.003 && Math.abs(this.lookApexNormalized) < 0.002) {
      this.lookApexNormalized = 0.0;
    }

    if (this.visorTearOffProgress < 1.0) {
      this.visorTearOffProgress = Math.min(1.0, this.visorTearOffProgress + safeDt / VISOR_WIPE_DURATION_SEC);
    }

    if (playerCar) {
      playerCar.lookApexNormalized = this.lookApexNormalized;
      playerCar.visorTearOffProgress = this.visorTearOffProgress;
    }

    // 6. Combine Pedals + Optional Auto-Throttle & Corner Braking Assist
    const manualGas = Math.max(this.touchGas, kbGas, gpGas);
    const manualBrake = Math.max(this.touchBrake, kbBrake, gpBrake);
    const { assistBrake, autoGas, throttleCap } = this._computeDrivingAssists(playerCar, manualBrake);

    const rawGas = Math.max(manualGas * throttleCap, autoGas);
    this.throttle = clamp(rawGas, 0.0, 1.0);
    this.brake = clamp(Math.max(manualBrake, assistBrake), 0.0, 1.0);

    // 7. Visual Force-Feedback Steering Wheel rotation + SAT torque cue + curb haptic rumble
    let ffbJitterDeg = this.selfAligningTorque * 5.2;
    if (playerCar && !playerCar.exploded && playerCar.speedKmh > 30) {
      const nowMs = performance.now();
      if (playerCar.onCurb) {
        ffbJitterDeg += Math.sin(nowMs * 0.085) * 4.2;
        this._vibrateCurbPulse();
      } else if (playerCar.aquaplaneTimer > 0) {
        ffbJitterDeg += Math.sin(nowMs * 0.06) * 9.0;
      } else if (playerCar.skidIntensity > 0.35 || Math.abs(this.selfAligningTorque) > 0.52) {
        ffbJitterDeg += Math.sin(nowMs * 0.05) * 2.8;
        if (Math.abs(this.selfAligningTorque) > 0.55 && nowMs - this._lastSatVibMs > 140) {
          this._lastSatVibMs = nowMs;
          this._vibrate(8);
        }
      }
    }

    const wheelDeg = this.steer * WHEEL_MAX_LOCK_DEG + ffbJitterDeg;
    if (this.wheelGraphicEl) {
      const cleanDeg = Math.abs(wheelDeg) < 0.05 ? '0.0' : wheelDeg.toFixed(1);
      this.wheelGraphicEl.style.transform = `rotate(${cleanDeg}deg)`;
    }

    const hubEl = this.wheelHubEl || this.wheelReadoutEl;
    if (hubEl) {
      let gTxt = 'G1';
      const curGear = playerCar ? Math.max(1, Math.round(playerCar.gear || 1)) : 1;
      if (playerCar && curGear !== this._lastCarGear) {
        this._lastCarGear = curGear;
        if (playerCar.speedKmh > 25) this._vibratePedalTick(9);
      }
      if (playerCar) {
        if (playerCar.gearboxMode === 'CLASSIC_2SPD') {
          gTxt = curGear >= 2 ? 'HI' : 'LO';
        } else {
          gTxt = `G${clamp(curGear, 1, 8)}`;
        }
      }
      const steerDegInt = Math.round(this.steer * WHEEL_MAX_LOCK_DEG) || 0;
      const speedKmh = Number(playerCar?.speedKmh) || 0;
      const vMs = speedKmh / 3.6;
      const rawLatG = Number.isFinite(playerCar?.latG)
        ? Math.abs(playerCar.latG)
        : Math.abs(this.steer) * ((vMs * vMs) / 260.0);

      if (playerCar?.inPitLane && speedKmh > 5) {
        hubEl.textContent = `${gTxt} • PIT`;
      } else if (
        speedKmh > 45 &&
        (playerCar?.inSlipstream || playerCar?.drsActive || (speedKmh >= 286 && Math.abs(this.steer) < 0.12))
      ) {
        hubEl.textContent = `${gTxt} • DRS`;
      } else if (speedKmh > 38 && Math.abs(this.steer) >= 0.12 && rawLatG >= 0.45) {
        hubEl.textContent = `${gTxt} • ${clamp(rawLatG, 0.5, 5.4).toFixed(1)}G`;
      } else {
        hubEl.textContent = `${gTxt} • ${steerDegInt}°`;
      }
    }

    // 8. Update 8-LED F1 Steering Wheel Rim RPM Shift Strip (.w-led.g -> .w-led.r -> .w-led.b)
    if (this.wheelLedEls.length && playerCar) {
      const totalLeds = this.wheelLedEls.length;
      const rpm = Number(playerCar.rpm) || 0;
      // Progressive F1 tachometer sweep across Green (1-3), Red (4-6), and Blue (7-8) LEDs
      const rpmNorm = clamp((rpm - 7000.0) / 5100.0, 0.0, 1.0);
      let litCount = Math.round(rpmNorm * totalLeds);

      // Rapid blue/full shift-light strobe above 14,300 RPM or at manual redline
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

    // 9. Update analog pedal pressure bars & percentage readouts
    const gasPct = Math.round(this.throttle * 100);
    const brkPct = Math.round(this.brake * 100);
    if (this.gasFillEl) this.gasFillEl.style.height = `${gasPct}%`;
    if (this.brakeFillEl) this.brakeFillEl.style.height = `${brkPct}%`;
    if (this.gasPctEl) this.gasPctEl.textContent = `${gasPct}%`;
    if (this.brakePctEl) this.brakePctEl.textContent = `${brkPct}%`;
  }

  _canVibrate() {
    if (!this.controlSettings.haptics) return false;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
    // Chrome blocks vibrate() until the user has interacted with the frame
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
    return true;
  }

  _vibrate(ms) {
    if (!this._canVibrate()) return;
    try {
      navigator.vibrate(ms);
    } catch (_) {}
  }

  _vibratePedalTick(ms = 8) {
    if (!this._canVibrate()) return;
    const now = performance.now();
    if (!this._lastPedalHapticMs || now - this._lastPedalHapticMs > 55) {
      this._lastPedalHapticMs = now;
      this._vibrate(ms);
    }
  }

  _vibrateCurbPulse() {
    if (!this._canVibrate()) return;
    const now = performance.now();
    if (!this._lastVib || now - this._lastVib > 90) {
      this._lastVib = now;
      this._vibrate(12);
    }
  }
}
