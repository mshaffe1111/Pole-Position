// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Authoritative 240Hz Dynamic Bicycle + Curvilinear Frenet Vehicle Physics,
// Real-Corner Kinematic Brake Assist (OFF | MIN | FULL), 4-Corner Axle-Split
// Pacejka Tires, Dual-Layer Thermals, Blistering, Lockup Flat-Spots,
// Fuel Mass Inertia & Asymmetric Aero/Mechanical Damage (2026 & 1982 Sim-Parity)
// ============================================================================

import {
  TRACK_GAME_LENGTH,
  REAL_METERS_PER_GAME_METER,
  ROAD_HALF_WIDTH,
  CURB_WIDTH,
  PIT_LANE_CONFIG,
  TIRE_COMPOUNDS,
  PRO_2026_LENGTHS,
} from './config.js';

// Authentic 2026 Formula 1 8-Speed Seamless-Shift Gear Ratios (km/h at 12,850 RPM)
// G8 reaches 316 km/h standalone aero equilibrium and 331 km/h in DRS / Slipstream tow!
export const EIGHT_SPEED_TOPS = [108, 148, 184, 216, 245, 272, 296, 316];

// Upshift & Downshift speed thresholds (km/h) tuned for crisp F1 seamless-shift response
// and immediate automatic downshifting whenever slowing down (braking or coasting).
export const EIGHT_SPEED_UPSHIFT = [106.8, 146.5, 182.2, 214.0, 242.8, 269.6, 293.6];
export const EIGHT_SPEED_DOWNSHIFT = [96.0, 134.0, 169.0, 200.0, 229.0, 256.0, 280.0];

// Post-upshift engagement RPM per gear (G1..G8) for crisp F1 mechanical sawtooth sweeps
const EIGHT_SPEED_ENTRY_RPM = [3800, 8880, 9150, 9380, 9560, 9720, 9860, 9980];
const F1_SHIFT_PEAK_RPM = 12960;
const F1_TOP_GEAR_RPM = 12840;

// Legacy 6-Speed sequential ratios
const SIX_SPEED_TOPS = [116, 162, 204, 242, 276, 312];
const SIX_SPEED_ENTRY_RPM = [3800, 9000, 9350, 9650, 9850, 10050];

// Physical 2026/1982 F1 Chassis, Mass & Aerodynamic Constants
const F1_DRY_MASS_KG = 798.0;
const F1_QUALIFYING_REF_MASS_KG = 810.0;
const F1_MAX_FUEL_KG = 100.0;
const F1_WHEELBASE_M = 3.60;
const F1_CG_TO_FRONT_M = 1.92; // 46.7% front / 53.3% rear static mass distribution
const F1_CG_TO_REAR_M = 1.68;
const F1_CG_HEIGHT_M = 0.29;
const F1_HALF_TRACK_M = 0.94;
const F1_WHEEL_RADIUS_M = 0.36;
const F1_GRAVITY = 9.81;

// Physical F1 slick mechanical friction scale (maps config SOFT 1.12 -> ~1.725 dry mu)
const F1_MECH_MU_SCALE = 1.54;
// Base aero downforce & drag factors: 0.5 * rho(1.225) * A(1.52) = 0.931 kg/m
const F1_BASE_DOWNFORCE_KL = 3.75; // N / (m/s)^2 -> ~24.3 kN downforce at 290 km/h
const F1_BASE_DRAG_KD = 0.96;      // N / (m/s)^2
const F1_FRONT_AERO_SHARE = 0.445; // 44.5% front / 55.5% rear CoP aero stability margin

// Pre-allocated zero-GC corner zone pool for 240Hz forward curvature scanner
const _MAX_CORNER_ZONES = 16;
const _CORNER_ZONE_POOL = Array.from({ length: _MAX_CORNER_ZONES }, () => ({
  sign: 1,
  dIn: 0,
  dOut: 0,
  dApex: 0,
  kPeak: 0,
  deltaTheta: 0,
}));

function finiteOr(val, fallback = 0) {
  return Number.isFinite(val) ? val : fallback;
}

function clamp(val, min, max) {
  if (!Number.isFinite(val)) return min;
  return val < min ? min : (val > max ? max : val);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  if (edge1 <= edge0) return x >= edge1 ? 1.0 : 0.0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

function wrapTrackS(s) {
  if (!Number.isFinite(s)) return 0;
  let r = s % TRACK_GAME_LENGTH;
  if (r < 0) r += TRACK_GAME_LENGTH;
  if (r >= TRACK_GAME_LENGTH) r = 0;
  return r;
}

// Smooth C1 soft-knee deadband for micro spline noise on exact straightaways (< 0.00035 m^-1)
function softCurvatureDeadband(kReal) {
  const absK = Math.abs(kReal);
  const k0 = 0.00025; // R > 4000m = dead straight
  const k1 = 0.00085; // R < 1175m = full analytical curvature
  if (absK <= k0) return 0.0;
  if (absK >= k1) return kReal;
  const t = (absK - k0) / (k1 - k0);
  return kReal * t * t * (3.0 - 2.0 * t);
}

// Read unclamped signed real curvature in true m^-1 (positive = right turn, negative = left turn)
export function readRealCurvaturePerMeter(track, s, fallbackFrame = null) {
  if (!track) return 0.0;
  const sw = wrapTrackS(s);
  let kReal = NaN;
  if (typeof track.getRealCurvature === 'function') {
    kReal = track.getRealCurvature(sw);
  } else if (typeof track.getTrueCurvaturePerMeter === 'function') {
    kReal = track.getTrueCurvaturePerMeter(sw);
  } else if (typeof track.getMetricCurvatureAt === 'function') {
    kReal = track.getMetricCurvatureAt(sw);
  } else if (fallbackFrame && Number.isFinite(fallbackFrame.realCurvature)) {
    kReal = fallbackFrame.realCurvature;
  } else if (typeof track.getPhysicsCurvature === 'function') {
    kReal = finiteOr(track.getPhysicsCurvature(sw), 0.0) / 82.0;
  } else if (fallbackFrame && Number.isFinite(fallbackFrame.curvature)) {
    kReal = fallbackFrame.curvature / 82.0;
  } else {
    const smp = typeof track.sampleAt === 'function' ? track.sampleAt(sw, 0) : null;
    kReal = Number.isFinite(smp?.realCurvature)
      ? smp.realCurvature
      : (finiteOr(smp?.curvature, 0.0) / 82.0);
  }
  return softCurvatureDeadband(finiteOr(kReal, 0.0));
}

// Normalize Brake Assist setting across UI & legacy preferences ('OFF' | 'MIN' | 'FULL')
export function normalizeBrakingAssistMode(rawMode) {
  const m = String(rawMode || 'OFF').trim().toUpperCase();
  if (m === 'MIN' || m === 'LOW' || m === 'MINIMUM') return 'MIN';
  if (m === 'FULL' || m === 'MED' || m === 'MEDIUM' || m === 'HIGH') return 'FULL';
  return 'OFF';
}

// Normalize Traction & Stability Control setting ('FULL' | 'SPORT' | 'OFF', default 'FULL')
export function normalizeTractionControlMode(rawMode) {
  if (rawMode === undefined || rawMode === null || rawMode === '') return 'FULL';
  const m = String(rawMode).trim().toUpperCase();
  if (m === 'OFF' || m === 'NONE' || m === 'DISABLED' || m === 'FALSE') return 'OFF';
  if (m === 'SPORT' || m === 'MIN' || m === 'LOW' || m === 'MED' || m === 'MEDIUM' || m === 'PARTIAL') {
    return 'SPORT';
  }
  return 'FULL';
}

// Pacejka Magic Formula y(x) = sin(C * atan(B*x - E*(B*x - atan(B*x))))
function pacejkaMagic(slip, B = 10.5, C = 1.38, E = -0.35) {
  const bx = B * slip;
  return Math.sin(C * Math.atan(bx - E * (bx - Math.atan(bx))));
}

function ensureFourArray(arr, fillVal = 0.0) {
  if (!Array.isArray(arr) || arr.length < 4) {
    return [fillVal, fillVal, fillVal, fillVal];
  }
  for (let i = 0; i < 4; i++) {
    if (!Number.isFinite(arr[i])) arr[i] = fillVal;
  }
  return arr;
}

/**
 * Authoritative 240 Hz Real-Corner Kinematic Forward Scanner (5m..180m) & Brake Assist
 * Segments contiguous real turns (|kReal| >= 0.0020 m^-1), integrates turn deflection
 * angle DeltaTheta, computes racing-line effective radius R_eff, aero-augmented v_max(s),
 * and kinematic braking distance d_req.
 */
export function computeCornerPhysicsBrakeAssist(car, track, rawMode, manualThrottle, manualBrake, params) {
  const mode = normalizeBrakingAssistMode(rawMode);
  if (mode === 'OFF' || !car || !track || car.inPitLane || car.exploded || car.speedKmh < 48.0) {
    if (car) car._minAssistEngaged = false;
    return { effThrottle: manualThrottle, effBrake: manualBrake, assistBrake: 0.0, active: 0 };
  }

  const v = car.speedKmh / 3.6;
  const mPerG = Math.max(
    0.5,
    finiteOr(track.metersPerGameUnit, finiteOr(track.realMetersPerGameMeter, REAL_METERS_PER_GAME_METER))
  );
  const {
    massKg,
    muLat,
    muLong,
    kDownforce,
    kDrag,
    aeroTopMps,
    absLatAccelMps2,
    kRealHere,
    steerIn,
  } = params;

  // 1. Scan 5m..180m ahead at 3.5m resolution using unclamped real curvature kReal (m^-1)
  const STEP_M = 3.5;
  const START_DIST_M = 5.0;
  const MAX_DIST_M = 180.0;
  const K_MIN = 0.0020; // R_center <= 500m
  let zoneCount = 0;
  let activeZone = null;

  const absK0 = Math.abs(kRealHere);
  const signK0 = kRealHere >= 0 ? 1 : -1;

  for (let d = START_DIST_M; d <= MAX_DIST_M + 0.01; d += STEP_M) {
    const sSample = wrapTrackS(car.s + d / mPerG);
    const kReal = readRealCurvaturePerMeter(track, sSample, null);
    const absK = Math.abs(kReal);
    const signK = kReal >= 0 ? 1 : -1;

    if (absK >= K_MIN) {
      if (!activeZone || activeZone.sign !== signK) {
        if (activeZone) {
          activeZone = null;
        }
        if (zoneCount < _MAX_CORNER_ZONES) {
          activeZone = _CORNER_ZONE_POOL[zoneCount++];
          activeZone.sign = signK;
          // If already inside the same-direction turn at d=0, bridge [0..5m] seamlessly
          const connectedToHere = d <= START_DIST_M + 0.1 && absK0 >= K_MIN && signK0 === signK;
          activeZone.dIn = connectedToHere ? 0.0 : d;
          activeZone.dOut = d;
          activeZone.dApex = connectedToHere && absK0 > absK ? 0.0 : d;
          activeZone.kPeak = connectedToHere ? Math.max(absK0, absK) : absK;
          activeZone.deltaTheta = absK * STEP_M + (connectedToHere ? 0.5 * (absK0 + absK) * START_DIST_M : 0.0);
        }
      } else {
        const gapM = Math.max(STEP_M, d - activeZone.dOut);
        activeZone.dOut = d;
        activeZone.deltaTheta += absK * gapM;
        if (absK > activeZone.kPeak) {
          activeZone.kPeak = absK;
          activeZone.dApex = d;
        }
      }
    } else if (activeZone && (d - activeZone.dOut) > 7.5) {
      activeZone = null;
    }
  }

  if (zoneCount === 0) {
    car._minAssistEngaged = false;
    return { effThrottle: manualThrottle, effBrake: manualBrake, assistBrake: 0.0, active: 0 };
  }

  // 2. Evaluate racing-line R_eff, closed-form aero v_max(s), and kinematic d_req per turn
  let bestUrgency = -Infinity;
  let critSign = 1;
  let critDIn = 0;
  let critDApex = 0;
  let critDToCorner = 0;
  let critKPeak = 0;
  let critDeltaTheta = 0;
  let critVMax = aeroTopMps;
  let critABrake = 25.0;
  let critDReq = 0;
  let foundCrit = false;

  // Include high-speed vertical tire load sensitivity (~0.89) so FULL/MIN v_max matches true axle grip
  const loadEff = 0.89 * clamp(Math.pow(F1_QUALIFYING_REF_MASS_KG / Math.max(700.0, massKg), 0.08), 0.88, 1.04);
  const effMuLat = muLat * loadEff;
  const effMuLong = muLong * loadEff;

  for (let i = 0; i < zoneCount; i++) {
    const z = _CORNER_ZONE_POOL[i];
    const rCenter = 1.0 / Math.max(1e-4, z.kPeak);
    const insideCommit = Math.max(0.0, z.sign * car.lateralOffset) * (1.0 - clamp(z.dIn / 35.0, 0.0, 1.0));
    const wEff = clamp(5.6 - 0.38 * insideCommit, 2.4, 5.8);
    const halfDeflect = Math.min(Math.PI * 0.5, z.deltaTheta * 0.5);
    const sagittaDenom = Math.max(0.004, 1.0 - Math.cos(halfDeflect));
    const rEff = rCenter + wEff / sagittaDenom;

    // Closed-form aero-augmented max corner speed:
    // v_max = sqrt( (mu_lat * g * R_eff) / max(0.28, 1 - mu_lat * (k_L / m) * R_eff) )
    const aeroDenom = Math.max(0.28, 1.0 - effMuLat * (kDownforce / massKg) * rEff);
    const vMax = Math.min(aeroTopMps, Math.sqrt((effMuLat * F1_GRAVITY * rEff) / aeroDenom));

    if (v <= vMax) continue;

    const vRms2 = 0.5 * (v * v + vMax * vMax);
    const aBrakeEff = Math.max(
      6.5,
      effMuLong * (F1_GRAVITY + (kDownforce * vRms2) / massKg) + (kDrag * vRms2) / massKg
    );
    const dReq = Math.max(0.0, (v * v - vMax * vMax) / (2.0 * aBrakeEff));
    // Braking completion point just ahead of geometric apex (entry-to-trail zone)
    const dToCorner = Math.max(0.0, z.dIn > 0.0 ? (z.dIn + 0.35 * (z.dApex - z.dIn)) : (z.dApex * 0.82));
    const urgency = dReq - dToCorner;

    if (urgency > bestUrgency) {
      bestUrgency = urgency;
      foundCrit = true;
      critSign = z.sign;
      critDIn = z.dIn;
      critDApex = z.dApex;
      critDToCorner = dToCorner;
      critKPeak = z.kPeak;
      critDeltaTheta = z.deltaTheta;
      critVMax = vMax;
      critABrake = aBrakeEff;
      critDReq = dReq;
    }
  }

  if (!foundCrit) {
    car._minAssistEngaged = false;
    return { effThrottle: manualThrottle, effBrake: manualBrake, assistBrake: 0.0, active: 0 };
  }

  // --------------------------------------------------------------------------
  // MODE A: 'MIN' (LOW) — STRICTLY NON-INTRUSIVE LATE SAFETY NET (MAX 0.28)
  // - NEVER touches throttle (effThrottle = manualThrottle unconditionally!)
  // - NEVER holds speed down; ignores gradual sweepers (DeltaTheta < 30 deg or vMax > 245 km/h)
  // - Engages ONLY when overshooting (v > 1.10*vMax AND dToCorner <= 0.90*dReq) & manualBrake < assist
  // - Releases to 0.0 immediately once v <= 1.08*vMax OR at turn-in!
  // --------------------------------------------------------------------------
  if (mode === 'MIN') {
    const MIN_DEFLECTION_RAD = (30.0 * Math.PI) / 180.0; // 30 degrees
    const MAX_SWEEPER_MPS = 245.0 / 3.6;
    const isGradualSweeper = critDeltaTheta < MIN_DEFLECTION_RAD || critVMax > MAX_SWEEPER_MPS;

    // Release immediately at turn-in (inside corner entry or actively steering into the turn at short range)
    const turningInNow =
      critDIn <= 5.5 &&
      ((Math.abs(steerIn) > 0.16 && Math.sign(steerIn) === critSign) ||
        absK0 >= critKPeak * 0.52 ||
        critDToCorner <= 4.0);

    if (isGradualSweeper || turningInNow || v <= 1.08 * critVMax || critDReq <= 1.0) {
      car._minAssistEngaged = false;
      return { effThrottle: manualThrottle, effBrake: manualBrake, assistBrake: 0.0, active: 0 };
    }

    const wasEngaged = !!car._minAssistEngaged;
    const speedGateMet = wasEngaged ? (v > 1.08 * critVMax) : (v > 1.10 * critVMax);
    const distGateMet = wasEngaged ? (critDToCorner <= 0.94 * critDReq) : (critDToCorner <= 0.90 * critDReq);

    if (!speedGateMet || !distGateMet) {
      car._minAssistEngaged = false;
      return { effThrottle: manualThrottle, effBrake: manualBrake, assistBrake: 0.0, active: 0 };
    }

    car._minAssistEngaged = true;
    const uSpeed = smoothstep(1.08 * critVMax, 1.25 * critVMax, v);
    const uDist = smoothstep(0.0, 1.0, (0.92 * critDReq - critDToCorner) / (0.20 * critDReq + 3.0));
    const assistCand = clamp(0.28 * uSpeed * uDist, 0.0, 0.28);

    if (manualBrake >= assistCand || assistCand <= 0.002) {
      return { effThrottle: manualThrottle, effBrake: manualBrake, assistBrake: 0.0, active: 0 };
    }

    return {
      effThrottle: manualThrottle, // NEVER touches throttle!
      effBrake: assistCand,
      assistBrake: assistCand,
      active: 1,
    };
  }

  // --------------------------------------------------------------------------
  // MODE B: 'FULL' (MED / HIGH) — SMOOTH THRESHOLD-TO-TRAIL-BRAKING ENVELOPE
  // - 0.0 on flat-out kinks/sweepers
  // - Smooth threshold entry -> friction-circle trail-braking -> clean apex release
  // --------------------------------------------------------------------------
  const isFlatOutKink = critDeltaTheta < 0.22 && critVMax >= aeroTopMps * 0.95;
  if (isFlatOutKink || critDApex <= 2.0 || v <= 1.015 * critVMax || critDToCorner > 1.04 * critDReq) {
    return { effThrottle: manualThrottle, effBrake: manualBrake, assistBrake: 0.0, active: 0 };
  }

  const aNeeded = (v * v - critVMax * critVMax) / (2.0 * Math.max(3.5, critDToCorner));
  const bReq = smoothstep(0.68, 1.06, aNeeded / critABrake) * 0.92;
  const ayMax = Math.max(4.5, effMuLat * (F1_GRAVITY + (kDownforce * v * v) / massKg));
  const latRatio = clamp(absLatAccelMps2 / ayMax, 0.0, 1.0);
  const bTrailCap = 0.92 * Math.sqrt(Math.max(0.08, 1.0 - 0.82 * latRatio * latRatio));
  const assistCand = clamp(Math.min(bReq, bTrailCap), 0.0, 0.92);

  const effBrake = Math.max(manualBrake, assistCand);
  const assistApplied = effBrake > manualBrake && assistCand > 0.002 ? assistCand : 0.0;
  const effThrottle = assistCand > 0.02
    ? manualThrottle * clamp(1.0 - assistCand * 1.65, 0.0, 1.0)
    : manualThrottle;

  return {
    effThrottle,
    effBrake,
    assistBrake: assistApplied > 0 ? assistApplied : (manualBrake < assistCand ? assistCand : 0.0),
    active: assistCand > 0.005 ? 1 : 0,
  };
}

export function createVehicleState(opts = {}) {
  const compound = TIRE_COMPOUNDS[opts.compound] ? opts.compound : 'SOFT';
  const compDef = TIRE_COMPOUNDS[compound] || TIRE_COMPOUNDS.SOFT;
  const defaultBlanketTemp = Math.round((compDef.optTempMin + compDef.optTempMax) * 0.5);
  const baseTemp = finiteOr(opts.initialTireTemp, defaultBlanketTemp);
  const validModes = ['AUTO_8SPD', 'MANUAL_8SPD', 'CLASSIC_2SPD', 'AUTO_2SPD', 'PRO_6SPD'];
  const gearboxMode = validModes.includes(opts.gearboxMode) ? opts.gearboxMode : 'AUTO_8SPD';
  const tractionControl = normalizeTractionControlMode(opts.tractionControl || 'FULL');
  const startFuelLaps = finiteOr(opts.fuelLaps, 7.0);
  const maxFuelLaps = Math.max(1.0, finiteOr(opts.maxFuelLaps, 15.0));
  const kgPerLap = clamp(92.0 / maxFuelLaps, 1.8, 9.0);
  const initialFuelKg = clamp(Math.max(0.0, startFuelLaps) * kgPerLap, 0.0, F1_MAX_FUEL_KG);
  const initS = wrapTrackS(finiteOr(opts.s, 0));
  const initLat = finiteOr(opts.lateralOffset, 0);

  return {
    id: opts.id || 'PLAYER',
    isPlayer: !!opts.isPlayer,
    name: opts.name || 'PLAYER #1',
    short: opts.short || 'PLY',
    carNum: opts.carNum || 1,

    // Spatial coordinates along 1,000 game-meter circuit spline + 240Hz render interpolation state
    s: initS,
    _prevS: initS,
    totalDistanceGameM: finiteOr(opts.totalDistanceGameM, 0),
    lap: opts.lap ?? 1,
    lateralOffset: initLat,
    _prevLat: initLat,
    lateralVel: 0,
    _lastComputedLatVel: 0,
    relYaw: 0,
    _prevRelYaw: 0,
    yawAngle: 0,

    // 240Hz Dynamic Bicycle Body-Frame States
    vyBody: 0.0,            // Lateral velocity v_y in car body frame (m/s, +right)
    yawRate: 0.0,           // World yaw angular velocity r = psi_dot (rad/s, +right/CW)
    bodySlipAngleRad: 0.0,  // Chassis slip angle beta = atan2(vy, vx)

    // Kinematics & 8-Speed Seamless F1 Power Unit
    speedKmh: 0,
    rpm: 3800,
    gear: 1, // 1..8 in AUTO_8SPD / MANUAL_8SPD, or 1=LOW / 2=HIGH in CLASSIC_2SPD
    gearboxMode,
    shiftCooldown: 0,
    revBlipTimer: 0,
    cornerExitTorqueTimer: 0,
    overRevTimer: 0,
    turboBoostBar: 0.0, // 0.0..2.4 bar V6 split-turbo / 1982 twin-turbo boost pressure
    ersCharge: 1.0,     // 0.0..1.0 MGU-K battery state of charge
    ersDeploying: false,
    inSlipstream: false,
    slipstreamFactor: 0,
    towReservoir: 0,
    drsActive: false,

    // Control inputs [0..1] / [-1..1], Authoritative Brake Assist Telemetry & Pneumatic-Trail SAT
    steerInput: 0,
    steerAngleRad: 0,
    selfAligningTorque: 0.0, // [-1..1] counter-steer, pneumatic-trail & flat-spot feedback
    throttleInput: 0,
    brakeInput: 0,
    effectiveThrottle: 0,
    effectiveBrake: 0,
    assistBrakeApplied: 0.0, // [0..1] live brake assist intervention for HUD/Pedals
    brakeAssistActive: 0,    // 0 or 1
    _smoothedAssistBrake: 0.0,
    _minAssistEngaged: false,
    tractionControl,         // 'FULL' | 'SPORT' | 'OFF' active traction & stability assist

    // 3D Suspension Attitude & 4-Corner Physical Deflection Dynamics
    chassisPitchRad: 0.0,
    _prevPitch: 0.0,
    chassisPitchVel: 0.0,
    chassisRollRad: 0.0,
    _prevRoll: 0.0,
    chassisRollVel: 0.0,
    chassisHeaveM: 0.0,
    wheelCompression: [0.0, 0.0, 0.0, 0.0], // [fl, fr, rl, rr] deflection in meters around static 1G rest

    // Continuous Surface Blending & Grip Telemetry
    onCurb: false,
    onGrass: false,
    curbWeight: 0.0,
    grassWeight: 0.0,
    surfaceGrip: 1.0,
    aquaplaneTimer: 0,
    latG: 0,
    longG: 0,
    _filtLongAccel: 0,
    skidIntensity: 0,
    gripUtilization: 0,

    // Dual-Layer (Surface + Core) Tire Science, Wear, Blistering & Lockup Flat-Spots
    compound,
    tireTempsC: [baseTemp, baseTemp, baseTemp, baseTemp],     // [fl, fr, rl, rr] °C
    tireCoreTempsC: [baseTemp, baseTemp, baseTemp, baseTemp], // [fl, fr, rl, rr] °C
    tireWear: [1.0, 1.0, 1.0, 1.0],                           // [fl, fr, rl, rr] tread remaining [1..0]
    tireFlatSpot: [0.0, 0.0, 0.0, 0.0],                       // [fl, fr, rl, rr] persistent lockup flat-spot [0..1]
    flatSpot: 0.0,                                            // max corner flat-spot [0..1]
    wheelFreqHz: 0.0,                                         // physical wheel rotation frequency v / (2*pi*R_w)
    wheelSpinRad: 0.0,
    isLockingBrakes: false,
    lockupCorner: null,
    tires: {
      FL: { life: 1.0, temp: baseTemp, surfaceTemp: baseTemp, coreTemp: baseTemp, load: 0.23, compression: 0.25, slipAngleRad: 0.0, slipRatio: 0.0, graining: 0.0, blister: 0.0, flatSpot: 0.0, locking: false, punctured: false },
      FR: { life: 1.0, temp: baseTemp, surfaceTemp: baseTemp, coreTemp: baseTemp, load: 0.23, compression: 0.25, slipAngleRad: 0.0, slipRatio: 0.0, graining: 0.0, blister: 0.0, flatSpot: 0.0, locking: false, punctured: false },
      RL: { life: 1.0, temp: baseTemp, surfaceTemp: baseTemp, coreTemp: baseTemp, load: 0.27, compression: 0.25, slipAngleRad: 0.0, slipRatio: 0.0, graining: 0.0, blister: 0.0, flatSpot: 0.0, locking: false, punctured: false },
      RR: { life: 1.0, temp: baseTemp, surfaceTemp: baseTemp, coreTemp: baseTemp, load: 0.27, compression: 0.25, slipAngleRad: 0.0, slipRatio: 0.0, graining: 0.0, blister: 0.0, flatSpot: 0.0, locking: false, punctured: false },
    },

    // Physical Fuel Mass & Tank State (m = 798 kg + fuelKg)
    fuelLaps: startFuelLaps,
    maxFuelLaps,
    fuelKg: initialFuelKg,
    totalMassKg: F1_DRY_MASS_KG + initialFuelKg,

    // 4-Zone + Asymmetric Wing & Suspension Component Damage (Active in BOTH 2026 & 1982 Sim-Parity!)
    damage: {
      frontWing: 0.0,
      frontWingLeft: 0.0,
      frontWingRight: 0.0,
      frontWingSide: 0,
      rearWing: 0.0,
      suspension: 0.0,
      suspensionBias: 1,
      damagedCorner: 'FL',
      hasPuncture: false,
    },

    // Crash / Explosion state
    exploded: false,
    explodeTimer: 0,

    // Pit Lane state
    inPitLane: false,
    pitPhase: 'NONE', // 'NONE' | 'ENTRY' | 'STOPPED' | 'EXIT'
    pitSpeedingFlagged: false,
    pitStopTimer: 0,
    pitStopTotalDuration: 0,
    pitJackLift: 0,
    pitStopsCompleted: 0,
    pitHistory: [],

    // Timing & Scoring
    currentLapTime: 0,
    lastLapTime: null,
    bestLapTime: null,
    finished: false,
    finishTimeTotal: 0,
    timePenaltiesSec: 0,

    // Optional Career Mode R&D Parts & Constructor Tier Modifiers
    perfMods: opts.perfMods || null,
  };
}

export function shiftGear(car, direction, callbacks = {}) {
  if (!car || car.exploded || car.pitPhase === 'STOPPED') return;

  const spd = finiteOr(car.speedKmh, 0);

  if (car.gearboxMode === 'AUTO_8SPD') {
    if (direction === 0) return;
    const step = direction > 0 ? 1 : -1;
    const next = clamp(car.gear + step, 1, 8);
    if (next === car.gear) return;

    if (step > 0 && next >= 2 && spd < EIGHT_SPEED_DOWNSHIFT[next - 2] - 12) return;
    if (step < 0 && spd > EIGHT_SPEED_TOPS[next - 1] + 14) {
      car.overRevTimer = 0.35;
      if (callbacks.onOverRev) callbacks.onOverRev(car);
      return;
    }

    car.gear = next;
    car.shiftCooldown = 0.42;
    if (step > 0) {
      if (callbacks.onGearShift) callbacks.onGearShift(car, next, 'UP');
    } else {
      car.revBlipTimer = 0.125;
      car.cornerExitTorqueTimer = 0.28;
      if (callbacks.onGearShift) callbacks.onGearShift(car, next, 'DOWN');
      if (spd > 110 && callbacks.onBackfire) callbacks.onBackfire(car);
    }
  } else if (car.gearboxMode === 'MANUAL_8SPD') {
    const step = direction === 0 ? 1 : (direction > 0 ? 1 : -1);
    const next = clamp(car.gear + step, 1, 8);
    if (next !== car.gear) {
      const targetTop = EIGHT_SPEED_TOPS[next - 1];
      if (step < 0 && spd > targetTop + 8) {
        car.overRevTimer = 0.48;
        if (callbacks.onOverRev) callbacks.onOverRev(car);
      }
      car.gear = next;
      car.shiftCooldown = 0.14;
      if (step > 0) {
        if (callbacks.onGearShift) callbacks.onGearShift(car, next, 'UP');
      } else {
        car.revBlipTimer = 0.125;
        car.cornerExitTorqueTimer = 0.28;
        if (callbacks.onGearShift) callbacks.onGearShift(car, next, 'DOWN');
        if (spd > 110 && callbacks.onBackfire) callbacks.onBackfire(car);
      }
    }
  } else if (car.gearboxMode === 'PRO_6SPD') {
    const step = direction === 0 ? 1 : (direction > 0 ? 1 : -1);
    const next = clamp(car.gear + step, 1, 6);
    if (next !== car.gear) {
      const targetTop = SIX_SPEED_TOPS[next - 1];
      if (step < 0 && spd > targetTop + 6) {
        car.overRevTimer = 0.50;
        if (callbacks.onOverRev) callbacks.onOverRev(car);
      }
      car.gear = next;
      car.shiftCooldown = 0.14;
      if (step > 0) {
        if (callbacks.onGearShift) callbacks.onGearShift(car, next, 'UP');
      } else {
        car.revBlipTimer = 0.11;
        if (callbacks.onGearShift) callbacks.onGearShift(car, next, 'DOWN');
        if (spd > 110 && callbacks.onBackfire) callbacks.onBackfire(car);
      }
    }
  } else {
    // Classic 1982 Manual 2-Speed LOW (1) / HIGH (2)
    const next = direction > 0 ? 2 : (direction < 0 ? 1 : (car.gear === 1 ? 2 : 1));
    if (next !== car.gear) {
      if (next === 1 && spd > 172.0) {
        car.overRevTimer = 0.70;
        if (callbacks.onOverRev) callbacks.onOverRev(car);
        if (callbacks.onBackfire) callbacks.onBackfire(car);
      } else if (next === 1 && spd > 115 && callbacks.onBackfire) {
        callbacks.onBackfire(car);
      }
      car.gear = next;
      car.shiftCooldown = 0.14;
      if (callbacks.onGearShift) callbacks.onGearShift(car, next, next > 1 ? 'UP' : 'DOWN');
    }
  }
}

export function stepVehiclePhysics240Hz(car, dt, ctx) {
  if (!car || !ctx || !ctx.track) return;
  if (!Number.isFinite(dt) || dt <= 0) return;

  const safeDt = Math.min(0.05, dt);
  const {
    track,
    weather,
    mode,           // '1982_ORIGINAL' | '2026_UPDATED'
    raceLengthId,   // 'SHORT' | 'MEDIUM' | 'LONG'
    isQualifying,
    vscActive,
    controlsLocked,
    callbacks = {},
  } = ctx;

  // Snapshot previous substep pose for 240Hz render-alpha interpolation
  car.s = wrapTrackS(car.s);
  car._prevS = car.s;
  car.totalDistanceGameM = finiteOr(car.totalDistanceGameM, 0);
  car.lateralOffset = finiteOr(car.lateralOffset, 0);
  car._prevLat = car.lateralOffset;
  car.lateralVel = finiteOr(car.lateralVel, 0);
  car.relYaw = finiteOr(car.relYaw, 0);
  car._prevRelYaw = car.relYaw;
  car.chassisPitchRad = finiteOr(car.chassisPitchRad, 0);
  car._prevPitch = car.chassisPitchRad;
  car.chassisRollRad = finiteOr(car.chassisRollRad, 0);
  car._prevRoll = car.chassisRollRad;

  car.vyBody = finiteOr(car.vyBody, 0.0);
  car.yawRate = finiteOr(car.yawRate, 0.0);
  car.speedKmh = Math.max(0, finiteOr(car.speedKmh, 0));
  car.rpm = clamp(finiteOr(car.rpm, 3800), 0, 14500);
  car.slipstreamFactor = clamp(finiteOr(car.slipstreamFactor, 0), 0, 1.25);

  const throttleIn = clamp(finiteOr(car.throttleInput, 0), 0, 1);
  const brakeIn = clamp(finiteOr(car.brakeInput, 0), 0, 1);
  const rawSteerIn = clamp(finiteOr(car.steerInput, 0), -1, 1);
  // Strict micro-deadzone guarantees 0.000000 steering input when resting straight
  const steerIn = Math.abs(rawSteerIn) < 0.0015 ? 0.0 : rawSteerIn;

  car.tireTempsC = ensureFourArray(car.tireTempsC, 92.0);
  car.tireCoreTempsC = ensureFourArray(car.tireCoreTempsC, 92.0);
  car.tireWear = ensureFourArray(car.tireWear, 1.0);
  car.tireFlatSpot = ensureFourArray(car.tireFlatSpot, 0.0);
  car.wheelCompression = ensureFourArray(car.wheelCompression, 0.0);

  if (!car.damage) {
    car.damage = {
      frontWing: 0.0,
      frontWingLeft: 0.0,
      frontWingRight: 0.0,
      frontWingSide: 0,
      rearWing: 0.0,
      suspension: 0.0,
      suspensionBias: 1,
      damagedCorner: 'FL',
      hasPuncture: false,
    };
  }

  // Handle explosion respawn countdown
  if (car.exploded) {
    car.explodeTimer = finiteOr(car.explodeTimer, 0) - safeDt;
    car.speedKmh = 0;
    car.rpm = 0;
    car.turboBoostBar = 0.0;
    car.selfAligningTorque = 0.0;
    car.assistBrakeApplied = 0.0;
    car.brakeAssistActive = 0;
    car._smoothedAssistBrake = 0.0;
    car._minAssistEngaged = false;
    car.vyBody = 0.0;
    car.yawRate = 0.0;
    car.lateralVel = 0.0;
    car._lastComputedLatVel = 0.0;
    car.chassisPitchRad = 0.0;
    car.chassisPitchVel = 0.0;
    car.chassisRollRad = 0.0;
    car.chassisRollVel = 0.0;
    car.latG = 0;
    car.longG = 0;
    car.skidIntensity = 0;
    car.gripUtilization = 0;
    car.isLockingBrakes = false;
    car.drsActive = false;
    if (car.explodeTimer <= 0) {
      car.exploded = false;
      car.lateralOffset = 0;
      car._prevLat = 0;
      car.lateralVel = 0;
      car._lastComputedLatVel = 0;
      car.vyBody = 0;
      car.yawRate = 0;
      car.relYaw = 0;
      car._prevRelYaw = 0;
      car.yawAngle = 0;
      car.gear = 1;
      car.rpm = 3800;
    }
    return;
  }

  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const decayFast = 1.0 - Math.exp(-14.0 * safeDt);

  if (controlsLocked) {
    car.speedKmh = 0;
    car.gear = 1;
    car.lateralVel = 0;
    car._lastComputedLatVel = 0;
    car.vyBody = 0;
    car.yawRate = 0;
    car.latG = 0;
    car.longG = 0;
    const revIdle = 3800 + Math.sin(nowMs * 0.018) * 180;
    car.rpm += (revIdle + throttleIn * 7400 - car.rpm) * (1.0 - Math.exp(-14.0 * safeDt));
    car.turboBoostBar = clamp(throttleIn * 1.35, 0.0, 2.4);
    car.selfAligningTorque = 0.0;
    car.assistBrakeApplied = 0.0;
    car.brakeAssistActive = 0;
    car._smoothedAssistBrake = 0.0;
    car.chassisPitchRad += (0.0 - car.chassisPitchRad) * decayFast;
    car.chassisRollRad += (0.0 - car.chassisRollRad) * decayFast;
    for (let i = 0; i < 4; i++) car.wheelCompression[i] = 0.0;
    car.skidIntensity = 0;
    car.gripUtilization = 0;
    car.isLockingBrakes = false;
    car.drsActive = false;
    return;
  }

  // Stationary in Pit Box (handled by Pit System timer)
  if (car.pitPhase === 'STOPPED') {
    car.speedKmh = 0;
    car.gear = 1;
    car.rpm = 4100 + Math.sin(nowMs * 0.025) * 240;
    car.turboBoostBar = 0.12;
    car.selfAligningTorque = 0.0;
    car.assistBrakeApplied = 0.0;
    car.brakeAssistActive = 0;
    car._smoothedAssistBrake = 0.0;
    car.lateralVel = 0;
    car._lastComputedLatVel = 0;
    car.vyBody = 0;
    car.yawRate = 0;
    car.latG = 0;
    car.longG = 0;
    car.chassisPitchRad += (0.0 - car.chassisPitchRad) * decayFast;
    car.chassisRollRad += (0.0 - car.chassisRollRad) * decayFast;
    // Quick-lift pit jacks droop all 4 suspension corners smoothly (-0.035m full droop)
    const jackLift = clamp(finiteOr(car.pitJackLift, 0.0), 0.0, 1.0);
    const droopM = -0.035 * jackLift;
    const normDroop = clamp(0.25 * (1.0 - jackLift), 0.0, 1.0);
    car.wheelCompression[0] = droopM;
    car.wheelCompression[1] = droopM;
    car.wheelCompression[2] = droopM;
    car.wheelCompression[3] = droopM;
    car.tires.FL.compression = normDroop;
    car.tires.FR.compression = normDroop;
    car.tires.RL.compression = normDroop;
    car.tires.RR.compression = normDroop;
    car.skidIntensity = 0;
    car.gripUtilization = 0;
    car.isLockingBrakes = false;
    car.drsActive = false;
    return;
  }

  // 1982 Sim-Parity: BOTH 2026_UPDATED and 1982_ORIGINAL run full tire wear, thermals,
  // flat-spots, fuel mass, wet grip, damage, and pit stops (unless CLASSIC_COINOP explicitly set).
  const isClassic = mode === '1982_ORIGINAL';
  const coinOpInfinite = ctx.arcadeRulesPreset === 'CLASSIC_COINOP';
  const wearFuelMult = coinOpInfinite
    ? 0.0
    : (isQualifying
      ? 0.35
      : (isClassic
        ? (finiteOr(ctx.wearFuelMult, 1.15))
        : (PRO_2026_LENGTHS[raceLengthId]?.wearFuelMult ?? finiteOr(ctx.wearFuelMult, 1.0))));

  // Career Mode R&D Parts, Garage Setup & AI Constructor Tier modifiers
  const mods =
    car.perfMods ||
    car.physicsModifiers ||
    (car.isPlayer && !isClassic ? (ctx.perfMods || ctx.physicsModifiers) : null) ||
    null;
  const modPower = mods ? clamp(finiteOr(mods.powerMult, 1.0), 0.75, 1.25) : 1.0;
  const modTopKmh = mods ? clamp(finiteOr(mods.topSpeedBonusKmh, 0.0), -15.0, 25.0) : 0.0;
  const modAeroGrip = mods ? clamp(finiteOr(mods.aeroGripMult, 1.0), 0.80, 1.25) : 1.0;
  const modBrake = mods ? clamp(finiteOr(mods.brakeMult, 1.0), 0.80, 1.25) : 1.0;
  const modAgility = mods ? clamp(finiteOr(mods.agilityMult, 1.0), 0.85, 1.20) : 1.0;
  const modTireWear = mods ? clamp(finiteOr(mods.tireWearMult, 1.0), 0.50, 1.50) : 1.0;
  const modFuelLoad = mods ? clamp(finiteOr(mods.fuelLoadMult, 1.0), 0.65, 1.40) : 1.0;
  const modDrsBonusKmh = mods ? clamp(finiteOr(mods.drsBonusKmh, 0.0), 0.0, 8.0) : 0.0;
  const modThermalWindowC = mods ? clamp(finiteOr(mods.thermalWindowBonusC, 0.0), 0.0, 12.0) : 0.0;
  const modWetGripBonus = mods ? clamp(finiteOr(mods.wetGripBonus, 0.0), 0.0, 0.14) : 0.0;

  // Read Brake Assist setting ('OFF' | 'MIN' [LOW] | 'FULL' [MED/HIGH])
  const rawBrakingAssist = car.isPlayer
    ? (
        car.brakingAssist ||
        ctx.brakingAssist ||
        ctx.controls?.brakingAssist ||
        ctx.controls?.settings?.brakingAssist ||
        (typeof ctx.controls?.getControlSettings === 'function'
          ? ctx.controls.getControlSettings()?.brakingAssist
          : null) ||
        'OFF'
      )
    : 'OFF';
  const brakingAssistMode = car.isPlayer ? normalizeBrakingAssistMode(rawBrakingAssist) : 'OFF';

  // Read Traction Control & Stability/Steering Assist ('FULL' | 'SPORT' | 'OFF', default 'FULL')
  const rawTractionControl = car.isPlayer
    ? (
        ctx.tractionControl ||
        ctx.controls?.tractionControl ||
        ctx.controls?.settings?.tractionControl ||
        (typeof ctx.controls?.getControlSettings === 'function'
          ? ctx.controls.getControlSettings()?.tractionControl
          : null) ||
        car.tractionControl ||
        'FULL'
      )
    : (car.tractionControl || 'FULL');
  const tcsMode = normalizeTractionControlMode(rawTractionControl);
  car.tractionControl = tcsMode;
  const curvAssistFactor = car.isPlayer
    ? (tcsMode === 'FULL' ? 0.52 : (tcsMode === 'SPORT' ? 0.28 : 0.0))
    : 0.0;
  const pullSuppressMult = car.isPlayer
    ? (tcsMode === 'FULL' ? 0.0 : (tcsMode === 'SPORT' ? 0.35 : 1.0))
    : 0.0;
  const wheelspinMult = car.isPlayer
    ? (tcsMode === 'FULL' ? 0.14 : (tcsMode === 'SPORT' ? 0.48 : 1.0))
    : 0.20;
  const understeerMult = car.isPlayer
    ? (tcsMode === 'FULL' ? 0.22 : (tcsMode === 'SPORT' ? 0.52 : 0.86))
    : 0.25;

  const frame = track.sampleAt(car.s, car.lateralOffset);
  const mPerGameM = Math.max(
    0.5,
    finiteOr(track.metersPerGameUnit, finiteOr(track.realMetersPerGameMeter, REAL_METERS_PER_GAME_METER))
  );

  // Unclamped signed real curvature kReal in m^-1 (zero 0.95 saturation plateau, zero hard step deadzone!)
  const kReal = car.inPitLane ? 0.0 : readRealCurvaturePerMeter(track, car.s, frame);
  const rawScaledCurv = kReal * 82.0; // Backward-compatible scaled metric for weather/legacy hooks
  const speedMps = car.speedKmh / 3.6;

  // --------------------------------------------------------------------------
  // 1. CONTINUOUS TIRE-PATCH SURFACE BLENDING (ASPHALT -> KERB -> GRASS/GRAVEL)
  //    & ACTIVE WET-WEATHER MOISTURE (BOTH 2026 & 1982 SIM-PARITY!)
  // --------------------------------------------------------------------------
  let wKerbL = 0.0;
  let wKerbR = 0.0;
  let wGrassL = 0.0;
  let wGrassR = 0.0;

  if (!car.inPitLane) {
    const absLeftWheelD = Math.abs(car.lateralOffset - F1_HALF_TRACK_M);
    const absRightWheelD = Math.abs(car.lateralOffset + F1_HALF_TRACK_M);
    const kerbOuter = ROAD_HALF_WIDTH + CURB_WIDTH;

    wKerbL =
      smoothstep(ROAD_HALF_WIDTH - 0.38, ROAD_HALF_WIDTH + 0.06, absLeftWheelD) *
      (1.0 - smoothstep(kerbOuter - 0.10, kerbOuter + 0.30, absLeftWheelD));
    wKerbR =
      smoothstep(ROAD_HALF_WIDTH - 0.38, ROAD_HALF_WIDTH + 0.06, absRightWheelD) *
      (1.0 - smoothstep(kerbOuter - 0.10, kerbOuter + 0.30, absRightWheelD));

    wGrassL = smoothstep(kerbOuter - 0.08, kerbOuter + 0.42, absLeftWheelD);
    wGrassR = smoothstep(kerbOuter - 0.08, kerbOuter + 0.42, absRightWheelD);
  }

  const wKerbMax = Math.max(wKerbL, wKerbR);
  const wGrassMax = Math.max(wGrassL, wGrassR);
  const wGrassAvg = 0.5 * (wGrassL + wGrassR);
  car.curbWeight = wKerbMax;
  car.grassWeight = wGrassMax;
  car.onCurb = !car.inPitLane && wKerbMax > 0.25 && wGrassMax < 0.65;
  car.onGrass = !car.inPitLane && wGrassMax >= 0.50;

  // Active wet grip in BOTH 2026 & 1982 modes (NEON_NIGHT dry sheen stays 0.0 standing water)
  const isDryNight = weather?.currentRegimeId === 'NEON_NIGHT' && finiteOr(weather?.rainIntensity, 0) <= 0.01;
  const rawW = (isDryNight || !weather)
    ? 0.0
    : clamp(
        typeof weather.getMoistureAt === 'function'
          ? finiteOr(weather.getMoistureAt(rawScaledCurv, car.lateralOffset), 0.0)
          : finiteOr(weather.grooveMoisture ?? weather.wetness, 0.0),
        0.0,
        1.0
      );
  const localW = rawW;

  // In 1982_ORIGINAL wet sessions where main.js defaults starting compound to SOFT, auto-fit rain tires on grid
  if (
    isClassic &&
    car.pitStopsCompleted === 0 &&
    car.totalDistanceGameM < 8.0 &&
    car.compound === 'SOFT' &&
    localW > 0.22
  ) {
    car.compound = localW > 0.55 ? 'FULL_WET' : 'INTERMEDIATE';
    if (callbacks.onCompoundVisualChanged) callbacks.onCompoundVisualChanged(car);
  }

  const kerbGripDrop = localW > 0.30 ? 0.14 : 0.035;
  const surfMuL = clamp(1.0 - kerbGripDrop * wKerbL - 0.54 * wGrassL, 0.36, 1.0);
  const surfMuR = clamp(1.0 - kerbGripDrop * wKerbR - 0.54 * wGrassR, 0.36, 1.0);
  car.surfaceGrip = 0.5 * (surfMuL + surfMuR);

  // Standing Puddle Hydroplaning check
  let hittingPuddle = false;
  if (!car.inPitLane && Array.isArray(track.puddles) && localW > 0.22) {
    for (let i = 0; i < track.puddles.length; i++) {
      const p = track.puddles[i];
      let ds = Math.abs(car.s - p.s);
      if (ds > TRACK_GAME_LENGTH * 0.5) ds = TRACK_GAME_LENGTH - ds;
      const dReal = ds * mPerGameM;
      const dLat = Math.abs(car.lateralOffset - p.lat);
      if (dReal < p.radius + 1.3 && dLat < p.radius * 0.82) {
        hittingPuddle = true;
        break;
      }
    }
  }

  if (hittingPuddle) {
    const comp = TIRE_COMPOUNDS[car.compound] || TIRE_COMPOUNDS.SOFT;
    if (!comp.preventsHydroplane) {
      const hydroSpeedThreshold = comp.isWetTire ? 242.0 : 192.0;
      const waterDragRate = comp.isWetTire ? 14.0 : 32.0;
      if (car.speedKmh > hydroSpeedThreshold) {
        if (car.aquaplaneTimer <= 0 && callbacks.onHydroplane) callbacks.onHydroplane(car);
        car.aquaplaneTimer = comp.isWetTire ? 0.20 : 0.38;
      }
      car.speedKmh = Math.max(85, car.speedKmh - waterDragRate * safeDt);
    }
  }
  if (car.aquaplaneTimer > 0) {
    car.aquaplaneTimer = Math.max(0, car.aquaplaneTimer - safeDt);
  }

  // --------------------------------------------------------------------------
  // 2. FUEL MASS (m = 798 kg + m_fuel) & ASYMMETRIC AERO / SUSPENSION DAMAGE
  // --------------------------------------------------------------------------
  const maxFuelLapsSafe = Math.max(4.0, finiteOr(car.maxFuelLaps, 15.0));
  const kgPerLap = clamp(92.0 / maxFuelLapsSafe, 1.8, 9.0) * modFuelLoad;
  car.fuelLaps = Math.max(0.0, finiteOr(car.fuelLaps, 7.0));
  car.fuelKg = isQualifying
    ? clamp(Math.min(car.fuelLaps, 1.8) * kgPerLap, 4.0, 16.0)
    : clamp(car.fuelLaps * kgPerLap, 0.0, F1_MAX_FUEL_KG);
  const totalMassKg = F1_DRY_MASS_KG + car.fuelKg;
  car.totalMassKg = totalMassKg;
  const massInertiaRatio = F1_QUALIFYING_REF_MASS_KG / totalMassKg; // F/m longitudinal scaling

  // Reconcile symmetric + asymmetric front-wing, rear-wing, and suspension damage [0..1]
  let fwMain = clamp(finiteOr(car.damage.frontWing, 0.0), 0.0, 1.0);
  let fwLeft = clamp(finiteOr(car.damage.frontWingLeft, 0.0), 0.0, 1.0);
  let fwRight = clamp(finiteOr(car.damage.frontWingRight, 0.0), 0.0, 1.0);
  if (fwMain > 0.001 && fwLeft <= 0.001 && fwRight <= 0.001) {
    // External caller set symmetric damage.frontWing directly -> populate left/right
    if (car.damage.frontWingSide < 0) {
      fwLeft = fwMain;
      fwRight = fwMain * 0.25;
    } else if (car.damage.frontWingSide > 0) {
      fwRight = fwMain;
      fwLeft = fwMain * 0.25;
    } else {
      fwLeft = fwMain;
      fwRight = fwMain;
    }
  } else if (fwLeft > 0.001 || fwRight > 0.001) {
    fwMain = clamp(0.55 * Math.max(fwLeft, fwRight) + 0.45 * 0.5 * (fwLeft + fwRight), 0.0, 1.0);
  }
  car.damage.frontWing = fwMain;
  car.damage.frontWingLeft = fwLeft;
  car.damage.frontWingRight = fwRight;

  const rwDmg = clamp(finiteOr(car.damage.rearWing, 0.0), 0.0, 1.0);
  const suspDmg = clamp(finiteOr(car.damage.suspension, 0.0), 0.0, 1.0);
  const suspBias = finiteOr(car.damage.suspensionBias, 1) >= 0 ? 1.0 : -1.0;

  // Suspension damage compromises ride-height / rake -> up to -24% Venturi ground-effect suction loss
  const floorSuctionEff = 1.0 - 0.24 * suspDmg;
  // Front-wing damage cuts C_L,f by up to -52%; Rear-wing damage cuts C_L,r by up to -56%
  const frontAeroEff = (1.0 - 0.52 * fwMain) * floorSuctionEff;
  const drsRearTrim = car.drsActive ? 0.78 : 1.0;
  const rearAeroEff = (1.0 - 0.56 * rwDmg) * (1.0 - 0.07 * fwMain) * floorSuctionEff * drsRearTrim;

  const kDownforceFront = F1_BASE_DOWNFORCE_KL * F1_FRONT_AERO_SHARE * modAeroGrip * frontAeroEff;
  const kDownforceRear = F1_BASE_DOWNFORCE_KL * (1.0 - F1_FRONT_AERO_SHARE) * modAeroGrip * rearAeroEff;
  const kDownforceTotal = kDownforceFront + kDownforceRear;

  // --------------------------------------------------------------------------
  // 3. STEERING RACK MAPPING (SMOOTH PRECISION + HIGH-SPEED TAPER + ACKERMANN)
  // --------------------------------------------------------------------------
  const highSpeedSteerTaper = lerp(1.0, 0.86, smoothstep(235.0, 335.0, car.speedKmh));
  const lowSpeedAckermann = 1.0 + 0.20 * (1.0 - smoothstep(35.0, 130.0, car.speedKmh));
  const hydroSteerMult = car.aquaplaneTimer > 0 ? 0.42 : 1.0;
  const maxRackAngleRad = 0.285 * modAgility;

  // Gentle precision shaping near center so micro-corrections never jerk the car
  const steerCurveExp = car.isPlayer ? (tcsMode === 'FULL' ? 1.12 : 1.06) : 1.0;
  const steerFormatted = Math.sign(steerIn) * Math.pow(Math.abs(steerIn), steerCurveExp);

  // Persistent alignment toe-pull from suspension damage (suppressed in FULL Traction/Stability Control)
  const suspToeRad = suspDmg > 0.02 ? suspDmg * 0.017 * suspBias * pullSuppressMult : 0.0;
  const roadSteerRad =
    steerFormatted * maxRackAngleRad * highSpeedSteerTaper * lowSpeedAckermann * hydroSteerMult +
    suspToeRad;
  car.steerAngleRad = roadSteerRad;

  // --------------------------------------------------------------------------
  // 4. 4-CORNER AXLE-SPLIT TIRES, THERMALS (COLD / OPTIMAL / BLISTERING),
  //    <28% WEAR CLIFF & PERSISTENT LOCKUP FLAT-SPOTS
  // --------------------------------------------------------------------------
  const comp = TIRE_COMPOUNDS[car.compound] || TIRE_COMPOUNDS.SOFT;
  let baseCompoundScalar = comp.baseGrip;

  if (!comp.isWetTire) {
    const effWet = Math.max(0.0, (localW - 0.03) / 0.97);
    baseCompoundScalar = comp.baseGrip * (1.0 - 0.56 * effWet);
  } else if (comp.id === 'INTERMEDIATE') {
    if (localW < 0.08) {
      baseCompoundScalar = 0.89;
    } else if (localW <= 0.58) {
      baseCompoundScalar = 1.06;
    } else {
      baseCompoundScalar = 0.92 - (localW - 0.58) * 0.24;
    }
  } else if (comp.id === 'FULL_WET') {
    if (localW < 0.18) {
      baseCompoundScalar = 0.82;
    } else {
      baseCompoundScalar = 0.99 + Math.min(0.08, Math.max(0.0, localW - 0.42) * 0.20);
    }
  }

  const wetMasteryBoost = localW > 0.12 ? modWetGripBonus : 0.0;
  const baseMechMu = (baseCompoundScalar + wetMasteryBoost) * F1_MECH_MU_SCALE;

  // Filtered pitch/roll normal loads (N) on each axle & wheel
  const filtAx = finiteOr(car._filtLongAccel, 0.0);
  const pitchTransferN = clamp(totalMassKg * (-filtAx * 0.52) * (F1_CG_HEIGHT_M / F1_WHEELBASE_M), -1850.0, 2100.0);
  const vSq = speedMps * speedMps;
  const fzFrontAxleN = Math.max(950.0, totalMassKg * F1_GRAVITY * (F1_CG_TO_REAR_M / F1_WHEELBASE_M) + pitchTransferN + kDownforceFront * vSq);
  const fzRearAxleN = Math.max(1150.0, totalMassKg * F1_GRAVITY * (F1_CG_TO_FRONT_M / F1_WHEELBASE_M) - pitchTransferN + kDownforceRear * vSq);
  const totalFzN = fzFrontAxleN + fzRearAxleN;

  // Lateral load transfer from body lateral G (positive latG = right turn -> loads left/outside wheels FL, RL)
  const latTransferRatio = clamp(car.latG * (F1_CG_HEIGHT_M / (2.0 * F1_HALF_TRACK_M)) * 1.35, -0.38, 0.38);
  const cornerFzN = [
    Math.max(260.0, fzFrontAxleN * (0.5 + latTransferRatio)), // FL
    Math.max(260.0, fzFrontAxleN * (0.5 - latTransferRatio)), // FR
    Math.max(300.0, fzRearAxleN * (0.5 + latTransferRatio)),  // RL
    Math.max(300.0, fzRearAxleN * (0.5 - latTransferRatio)),  // RR
  ];

  // True bicycle front & rear axle slip angles from body velocities (v_x, v_y, r)
  const vxEff = Math.hypot(speedMps, 3.2);
  const frontSlipAngleRad = clamp(
    roadSteerRad - Math.atan2(car.vyBody + F1_CG_TO_FRONT_M * car.yawRate, vxEff),
    -0.42,
    0.42
  );
  const rearSlipAngleRad = clamp(
    -Math.atan2(car.vyBody - F1_CG_TO_REAR_M * car.yawRate, vxEff),
    -0.42,
    0.42
  );

  // Preliminary tire friction estimate for forward Brake Assist scanner
  const prevFrontMu = finiteOr(car._cachedMuLat, baseMechMu * car.surfaceGrip);
  const prevLongMu = finiteOr(car._cachedMuLong, baseMechMu * 0.96 * car.surfaceGrip);

  // Drag coefficient including Front-Wing vortex drag, Rear-Wing damage, Suspension toe, DRS & Slipstream
  let rawSlip = car.slipstreamFactor;
  if (Array.isArray(ctx.allCars) && !car.inPitLane && car.speedKmh > 125.0) {
    for (let i = 0; i < ctx.allCars.length; i++) {
      const other = ctx.allCars[i];
      if (!other || other === car || other.exploded || other.inPitLane || other.speedKmh < 120.0) continue;
      let dsG = other.s - car.s;
      if (dsG < -TRACK_GAME_LENGTH * 0.5) dsG += TRACK_GAME_LENGTH;
      if (dsG > TRACK_GAME_LENGTH * 0.5) dsG -= TRACK_GAME_LENGTH;
      const distAheadM = dsG * mPerGameM;
      const latSepM = Math.abs(other.lateralOffset - car.lateralOffset);
      if (distAheadM > 4.8 && distAheadM < 48.0 && latSepM < 2.45) {
        const wake = (1.0 - (distAheadM - 4.8) / 43.2) * (1.0 - latSepM / 2.45);
        if (wake > rawSlip) {
          rawSlip = wake;
          if (wake > 0.14) car.inSlipstream = true;
        }
      }
    }
  }
  const shapedWake = rawSlip > 0.01
    ? Math.pow(clamp(rawSlip, 0.0, 1.25), 0.72)
    : (car.inSlipstream ? 0.68 : 0.0);

  car.towReservoir = finiteOr(car.towReservoir, 0.0);
  if (shapedWake >= car.towReservoir) {
    car.towReservoir = Math.min(1.15, car.towReservoir + (shapedWake - car.towReservoir) * (1.0 - Math.exp(-7.5 * safeDt)));
  } else if (throttleIn > 0.60 && brakeIn < 0.08 && car.speedKmh > 170.0 && !car.inPitLane) {
    car.towReservoir = Math.max(0.0, car.towReservoir - safeDt * 0.62);
  } else {
    car.towReservoir = Math.max(0.0, car.towReservoir - safeDt * 2.8);
  }
  const activeTow = Math.max(shapedWake, car.towReservoir);
  if (activeTow > 0.16 && !car.inPitLane && car.speedKmh > 140.0) {
    car.inSlipstream = true;
  }

  const is8Speed = car.gearboxMode === 'AUTO_8SPD' || car.gearboxMode === 'MANUAL_8SPD';
  const is6Speed = car.gearboxMode === 'PRO_6SPD';
  const maxTopGear = is8Speed ? 8 : (is6Speed ? 6 : 2);
  car.gear = clamp(Math.round(finiteOr(car.gear, 1)), 1, maxTopGear);

  // Parasitic drag penalties:
  // - Front-wing torn endplate vortex drag: up to -8.5 km/h top speed
  // - Rear-wing / diffuser damage drag: up to -18.0 km/h top speed + DRS jammed if rearWing >= 0.35
  // - Suspension bent toe scrub: up to -5.5 km/h top speed
  const drsFunctional = !isClassic && rwDmg < 0.35;
  const frontWingLossKmh = fwMain * 8.5;
  const rearWingLossKmh = rwDmg * 18.0;
  const suspDragLossKmh = suspDmg * 5.5;
  const totalDamageTopLossKmh = frontWingLossKmh + rearWingLossKmh + suspDragLossKmh;

  const slingshotPulloutBonus = (car.towReservoir > shapedWake + 0.08 && Math.abs(steerIn) > 0.05) ? 2.2 : 0.0;
  const effDrsBonusKmh = drsFunctional ? modDrsBonusKmh : 0.0;
  const towGainKmh = 15.6 + slingshotPulloutBonus + effDrsBonusKmh;
  const baseTopRefKmh = is8Speed ? 316.0 : (is6Speed ? 312.0 : 308.0);
  const aeroTopKmh = Math.max(
    120.0,
    baseTopRefKmh + activeTow * towGainKmh + modTopKmh + 16.0 - totalDamageTopLossKmh
  );
  const kDragEff =
    F1_BASE_DRAG_KD *
    (1.0 + 0.095 * fwMain + 0.16 * rwDmg + 0.055 * suspDmg - (car.drsActive ? 0.14 : 0.0) - activeTow * 0.18);

  // --------------------------------------------------------------------------
  // 5. AUTHORITATIVE REAL-CORNER KINEMATIC BRAKE ASSIST (OFF | MIN | FULL)
  // --------------------------------------------------------------------------
  let effThrottleIn = throttleIn;
  let effBrakeIn = brakeIn;

  if (brakingAssistMode === 'OFF') {
    car.brakeAssistActive = 0;
    car.assistBrakeApplied = 0.0;
    car._smoothedAssistBrake = 0.0;
    car._minAssistEngaged = false;
  } else {
    const assistRes = computeCornerPhysicsBrakeAssist(
      car,
      track,
      brakingAssistMode,
      throttleIn,
      brakeIn,
      {
        massKg: totalMassKg,
        muLat: prevFrontMu,
        muLong: prevLongMu * modBrake,
        kDownforce: kDownforceTotal,
        kDrag: kDragEff,
        aeroTopMps: aeroTopKmh / 3.6,
        absLatAccelMps2: Math.abs(car.latG) * F1_GRAVITY,
        kRealHere: kReal,
        steerIn,
      }
    );

    // Smooth hydraulic pressure envelope (28 Hz engage, 42 Hz release -> zero jerky brake step!)
    const targetAssistB = assistRes.assistBrake;
    const prevSmoothB = finiteOr(car._smoothedAssistBrake, 0.0);
    const rateB = targetAssistB >= prevSmoothB ? 28.0 : 42.0;
    const smoothB = prevSmoothB + (targetAssistB - prevSmoothB) * (1.0 - Math.exp(-rateB * safeDt));
    car._smoothedAssistBrake = smoothB < 0.0015 ? 0.0 : smoothB;

    if (brakingAssistMode === 'MIN') {
      // MIN NEVER touches throttle and caps strictly at 0.28!
      const appliedMinB = clamp(car._smoothedAssistBrake, 0.0, 0.28);
      if (appliedMinB > brakeIn && appliedMinB > 0.002) {
        effBrakeIn = appliedMinB;
        car.assistBrakeApplied = appliedMinB;
        car.brakeAssistActive = 1;
      } else {
        effBrakeIn = brakeIn;
        car.assistBrakeApplied = 0.0;
        car.brakeAssistActive = 0;
      }
      effThrottleIn = throttleIn;
    } else {
      // FULL mode smooth threshold-to-trail-braking
      const appliedFullB = clamp(car._smoothedAssistBrake, 0.0, 0.92);
      effBrakeIn = Math.max(brakeIn, appliedFullB);
      car.assistBrakeApplied = appliedFullB > brakeIn && appliedFullB > 0.002 ? appliedFullB : 0.0;
      car.brakeAssistActive = car.assistBrakeApplied > 0.002 ? 1 : 0;
      effThrottleIn = appliedFullB > 0.02
        ? throttleIn * clamp(1.0 - appliedFullB * 1.65, 0.0, 1.0)
        : throttleIn;
    }
  }

  car.effectiveThrottle = effThrottleIn;
  car.effectiveBrake = effBrakeIn;

  // --------------------------------------------------------------------------
  // 6. PER-CORNER TIRE THERMAL SOLVER, WEAR CLIFF & LOCKUP FLAT-SPOTS
  // --------------------------------------------------------------------------
  const ambientTemp = finiteOr(weather?.ambientTemp, 26.0);
  // Dry slick optimal window centered around 88°C - 106°C (cold < 72°C, blistering > 112°C)
  const optMin = (comp.isWetTire ? comp.optTempMin : 88.0) - modThermalWindowC * 0.5;
  const optMax = (comp.isWetTire ? comp.optTempMax : 106.0) + modThermalWindowC * 0.5;
  const coldThresholdC = comp.isWetTire ? (optMin - 14.0) : 72.0;
  const blisterThresholdC = comp.isWetTire ? (optMax + 10.0) : 112.0;

  const lowGearTorqueExcess = (car.gear <= 3 && effThrottleIn > 0.72)
    ? (effThrottleIn - 0.68) * (4 - car.gear) * (0.050 + localW * 0.095) * wheelspinMult
    : 0.0;

  const corners = ['FL', 'FR', 'RL', 'RR'];
  let frontLatMuSum = 0.0;
  let rearLatMuSum = 0.0;
  let sumLongMu = 0.0;
  let anyPunctured = false;
  let anyLocking = false;
  let activeLockCorner = null;
  let maxFlatSpot = 0.0;

  // Advance physical wheel rotation phase at omega_w = v / R_w for flat-spot harmonic vibration
  car.wheelFreqHz = speedMps / (2.0 * Math.PI * F1_WHEEL_RADIUS_M);
  car.wheelSpinRad = (finiteOr(car.wheelSpinRad, 0.0) + (speedMps / F1_WHEEL_RADIUS_M) * safeDt) % (Math.PI * 2.0);

  for (let idx = 0; idx < 4; idx++) {
    const cKey = corners[idx];
    const isFront = idx < 2;
    const isLeft = (idx % 2) === 0;
    const t = car.tires[cKey];
    const fzCorner = cornerFzN[idx];
    t.load = fzCorner / Math.max(1.0, totalFzN);

    const surfSideMu = isLeft ? surfMuL : surfMuR;
    const cornerAlpha = isFront ? frontSlipAngleRad : rearSlipAngleRad;
    const prevFlat = clamp(finiteOr(car.tireFlatSpot[idx], 0.0), 0.0, 1.0);

    // Braking demand vs normal load on this corner (58% front brake bias -> unloaded inside front locks first!)
    const brakeBiasShare = isFront ? 0.58 : 0.42;
    const normCornerLoad = fzCorner / (totalMassKg * F1_GRAVITY * 0.25);
    const flatSpotRelockFactor = 1.0 + 0.16 * prevFlat;
    let brakeSlipMag = 0.0;
    if (effBrakeIn > 0.45 && speedMps > 4.0) {
      const demandOverGrip =
        (effBrakeIn * brakeBiasShare * 2.05 * flatSpotRelockFactor) /
        Math.max(0.32, normCornerLoad * surfSideMu * (baseCompoundScalar + 0.12));
      if (demandOverGrip > 0.78) {
        brakeSlipMag = (demandOverGrip - 0.78) * 0.48 * (1.0 + localW * 0.35);
      }
      // FULL Brake Assist includes electronic ABS slip modulation to prevent heavy lockups
      if (brakingAssistMode === 'FULL') {
        brakeSlipMag = Math.min(brakeSlipMag, 0.19);
      }
    }

    const wheelspinSlip = !isFront
      ? lowGearTorqueExcess / Math.max(0.38, normCornerLoad * surfSideMu)
      : 0.0;
    const cornerKappa = clamp(wheelspinSlip - brakeSlipMag, -0.55, 0.50);
    t.slipAngleRad = cornerAlpha;
    t.slipRatio = cornerKappa;

    // Persistent Lockup Flat-Spot Accrual (brake > 0.82 && slipRatio < -0.22)
    const isCornerLocking = effBrakeIn > 0.82 && cornerKappa < -0.22 && speedMps > 12.0 && !car.inPitLane;
    t.locking = isCornerLocking;
    if (isCornerLocking) {
      anyLocking = true;
      if (!activeLockCorner) activeLockCorner = cKey;
      if (!coinOpInfinite) {
        const lockSeverity = clamp((-cornerKappa - 0.22) / 0.28, 0.0, 1.0);
        const flatRate = 0.38 * lockSeverity * clamp(speedMps / 55.0, 0.25, 1.35);
        car.tireFlatSpot[idx] = clamp(prevFlat + flatRate * safeDt, 0.0, 1.0);
      }
    } else if (!coinOpInfinite && prevFlat > 0.0 && speedMps > 25.0) {
      // Very slight rolling rubber rounding over long stints; full reset requires pit tire swap!
      car.tireFlatSpot[idx] = Math.max(0.0, prevFlat - 0.0012 * safeDt);
    }
    const curFlat = car.tireFlatSpot[idx];
    t.flatSpot = curFlat;
    if (curFlat > maxFlatSpot) maxFlatSpot = curFlat;

    // Combined Pacejka slip utilization for thermal & tread energy dissipation
    const normAlpha = Math.abs(cornerAlpha) / 0.135;
    const normKappa = Math.abs(cornerKappa) / 0.15;
    const combinedSlipNorm = Math.hypot(normAlpha, normKappa);
    const pacejkaUtil = Math.abs(pacejkaMagic(Math.min(1.8, combinedSlipNorm * 0.12), 10.5, 1.38, -0.35));

    // Dual-Layer Tire Thermal Solver (Surface flash ~0.85s + Carcass core ~8.5s)
    const prevCore = finiteOr(t.coreTemp, finiteOr(t.temp, 92.0));
    const prevSurf = finiteOr(t.surfaceTemp, prevCore);

    if (!coinOpInfinite) {
      const suspScrubMult = (suspDmg > 0.10 && car.damage.damagedCorner === cKey) ? (1.0 + 0.45 * suspDmg) : 1.0;
      const cornerFrictionHeat =
        (Math.abs(kReal * 82.0) * speedMps * 0.40 +
          combinedSlipNorm * speedMps * 0.34 +
          (isCornerLocking ? 128.0 * Math.abs(cornerKappa) : Math.abs(brakeSlipMag) * 72.0) +
          wheelspinSlip * 88.0) *
        clamp(normCornerLoad, 0.45, 1.85) *
        suspScrubMult;

      const dryGroovedPenalty = comp.isWetTire && localW < 0.08
        ? (comp.id === 'FULL_WET' ? 32.0 : 23.0)
        : 0.0;
      const wetSprayCooling = localW * (34.0 + speedMps * 0.18);
      const airflowCooling = Math.max(0.0, speedMps - 35.0) * 0.085;

      const targetSurfTemp =
        ambientTemp + 54.0 + cornerFrictionHeat + dryGroovedPenalty - wetSprayCooling - airflowCooling;
      t.surfaceTemp = clamp(prevSurf + (targetSurfTemp - prevSurf) * (1.0 - Math.exp(-1.25 * safeDt)), 18.0, 162.0);

      const carcassHysteresis =
        (speedMps * 0.25 + effBrakeIn * speedMps * 0.19 + effThrottleIn * 7.2) *
        clamp(normCornerLoad, 0.50, 1.75);
      const targetCoreTemp =
        ambientTemp + 50.0 + carcassHysteresis + (t.surfaceTemp - prevCore) * 0.42 - localW * 24.0;
      t.coreTemp = clamp(prevCore + (targetCoreTemp - prevCore) * (1.0 - Math.exp(-0.14 * safeDt)), 20.0, 148.0);
    } else {
      t.surfaceTemp = 96.0;
      t.coreTemp = 96.0;
    }

    t.temp = t.surfaceTemp * 0.58 + t.coreTemp * 0.42;
    car.tireTempsC[idx] = t.temp;
    car.tireCoreTempsC[idx] = t.coreTemp;

    // Graining (reversible cold sliding) & Blistering (sustained overheating > 112°C)
    t.graining = finiteOr(t.graining, 0.0);
    t.blister = finiteOr(t.blister, 0.0);
    if (!coinOpInfinite && !car.inPitLane && speedMps > 8.0) {
      if (t.surfaceTemp < optMin - 5.0 && normAlpha > 0.65) {
        t.graining = clamp(t.graining + 0.028 * (normAlpha - 0.65) * safeDt, 0.0, 1.0);
      } else if (t.temp >= optMin && t.temp <= optMax) {
        t.graining = Math.max(0.0, t.graining - 0.022 * safeDt);
      }
      if (t.temp > blisterThresholdC || t.coreTemp > blisterThresholdC + 4.0) {
        const overHeat = Math.max(0.0, t.temp - blisterThresholdC);
        t.blister = clamp(t.blister + 0.0085 * (1.0 + overHeat * 0.12) * safeDt, 0.0, 1.0);
      }
    }

    // Thermal grip window: Cold (< 72°C) front turn-in understeer & slide, Optimal (88-106°C) peak bite, > 112°C blistering drop
    let tempMult = 1.0;
    const coldCeil = isFront ? 0.895 : 0.915;
    if (t.temp < coldThresholdC) {
      tempMult = clamp(coldCeil - (coldThresholdC - t.temp) * (isFront ? 0.0044 : 0.0036), 0.82, coldCeil);
    } else if (t.temp < optMin) {
      tempMult = lerp(coldCeil, 1.0, smoothstep(coldThresholdC, optMin, t.temp));
    } else if (t.temp <= optMax) {
      const midTemp = (optMin + optMax) * 0.5;
      const halfSpan = Math.max(4.0, (optMax - optMin) * 0.5);
      tempMult = 1.0 + 0.018 * (1.0 - Math.abs(t.temp - midTemp) / halfSpan);
    } else if (t.temp <= blisterThresholdC) {
      tempMult = lerp(1.0, 0.965, smoothstep(optMax, blisterThresholdC, t.temp));
    } else {
      tempMult = clamp(0.965 - (t.temp - blisterThresholdC) * 0.0052, 0.82, 0.965);
    }
    tempMult *= (1.0 - 0.055 * t.graining) * (1.0 - 0.11 * t.blister);

    // Progressive Tread Wear (accelerated by > 112°C blistering, lockups & suspension toe scrub)
    if (!coinOpInfinite && !car.inPitLane && speedMps > 2.0) {
      const blisterWearMult = t.temp > blisterThresholdC
        ? 1.25 + Math.min(0.45, (t.temp - blisterThresholdC) * 0.022)
        : 1.0;
      const lockupWearSpike = isCornerLocking ? 3.2 : 1.0;
      let wearStep =
        0.00096 *
        comp.wearRate *
        wearFuelMult *
        modTireWear *
        blisterWearMult *
        lockupWearSpike *
        clamp(normCornerLoad, 0.45, 1.85) *
        (0.50 + Math.abs(kReal * 82.0) * 0.95 + pacejkaUtil * 0.38) *
        (speedMps / 68.0) *
        safeDt;

      if (comp.isWetTire && localW < 0.08) wearStep *= 2.5;
      if (suspDmg > 0.12 && car.damage.damagedCorner === cKey) {
        wearStep *= 1.0 + suspDmg * 1.20;
      }

      t.life = Math.max(0.0, finiteOr(t.life, 1.0) - wearStep);
    }
    car.tireWear[idx] = t.life;

    // Progressive Pirelli < 28% Wear Cliff & Cord Puncture Risk
    let wearMult = 1.0;
    if (t.life >= 0.28) {
      wearMult = 0.93 + 0.07 * ((t.life - 0.28) / 0.72);
    } else {
      const ratio = clamp(t.life / 0.28, 0.0, 1.0);
      wearMult = 0.44 + 0.49 * Math.pow(ratio, 2.05);
      if (
        !coinOpInfinite &&
        !t.punctured &&
        ((car.onCurb && t.life < 0.12 && Math.random() < (1.0 - ratio) * 0.18 * safeDt) || t.life <= 0.002)
      ) {
        t.punctured = true;
        car.damage.hasPuncture = true;
        if (callbacks.onPuncture) callbacks.onPuncture(car, cKey);
      }
    }

    if (t.punctured) {
      anyPunctured = true;
      wearMult = 0.28;
    }

    // Flat-Spot Grip Penalty (reduces lateral grip up to -11% & braking longitudinal grip up to -15%)
    const flatLatMult = 1.0 - 0.11 * curFlat;
    const flatLongMult = 1.0 - 0.15 * curFlat;

    // Friction-Circle Coupling on each corner
    const ellipseLatScale = Math.sqrt(Math.max(0.32, 1.0 - Math.min(0.68, cornerKappa * cornerKappa * 3.2)));
    const ellipseLongScale = Math.sqrt(Math.max(0.45, 1.0 - Math.min(0.55, cornerAlpha * cornerAlpha * 6.5)));

    const cornerMuBase = baseMechMu * surfSideMu * tempMult * wearMult;
    const cornerLatMu = cornerMuBase * flatLatMult * ellipseLatScale;
    const cornerLongMu = cornerMuBase * 0.96 * flatLongMult * ellipseLongScale;

    if (isFront) {
      frontLatMuSum += cornerLatMu;
    } else {
      rearLatMuSum += cornerLatMu;
    }
    sumLongMu += cornerLongMu;
  }

  car.damage.hasPuncture = anyPunctured;
  car.isLockingBrakes = anyLocking;
  car.lockupCorner = activeLockCorner;
  car.flatSpot = maxFlatSpot;

  const muFrontLat = 0.5 * frontLatMuSum;
  const muRearLat = 0.5 * rearLatMuSum;
  const muLatAvg = 0.5 * (muFrontLat + muRearLat);
  const muLongPhys = sumLongMu * 0.25;
  car._cachedMuLat = muLatAvg;
  car._cachedMuLong = muLongPhys;

  // Normalized muLongFactor (~1.08 on dry Softs) for hybrid engine traction compatibility
  const muLongDriveNorm = clamp(muLongPhys / F1_MECH_MU_SCALE, 0.28, 1.28);

  // --------------------------------------------------------------------------
  // 7. SEAMLESS 8-SPEED / 6-SPEED / CLASSIC 1982 2-SPEED POWERTRAIN & BRAKING
  // --------------------------------------------------------------------------
  if (car.shiftCooldown > 0) car.shiftCooldown = Math.max(0, car.shiftCooldown - safeDt);
  if (car.revBlipTimer > 0) car.revBlipTimer = Math.max(0, car.revBlipTimer - safeDt);
  if (car.cornerExitTorqueTimer > 0) {
    car.cornerExitTorqueTimer = Math.max(0, finiteOr(car.cornerExitTorqueTimer, 0) - safeDt);
  }

  let gearTopKmh = 316.0;
  let torqueMult = 1.0;

  if (is8Speed) {
    const gIdx = car.gear - 1;
    gearTopKmh = EIGHT_SPEED_TOPS[gIdx];
    const prevTop = gIdx > 0 ? EIGHT_SPEED_TOPS[gIdx - 1] : 0;
    const exitPunch = car.cornerExitTorqueTimer > 0 ? 1.08 : 1.0;
    const ersPunch = car.ersDeploying ? 1.04 : 1.0;
    torqueMult = (1.38 - gIdx * 0.045) * exitPunch * ersPunch;
    if (car.gearboxMode === 'MANUAL_8SPD' && car.speedKmh < prevTop * 0.65 && car.gear > 1) {
      torqueMult *= 0.56;
    }
  } else if (is6Speed) {
    const gIdx = car.gear - 1;
    gearTopKmh = SIX_SPEED_TOPS[gIdx];
    const prevTop = gIdx > 0 ? SIX_SPEED_TOPS[gIdx - 1] : 0;
    torqueMult = 1.35 - gIdx * 0.060;
    if (car.speedKmh < prevTop * 0.68 && car.gear > 1) {
      torqueMult *= 0.54;
    }
  } else {
    // Classic 1982 2-Speed Twin-Turbo Ground-Effect Rules: LOW (172 km/h) / HIGH (308 km/h)
    const turboSpoolFactor = 0.88 + 0.16 * clamp(finiteOr(car.turboBoostBar, 0.0) / 2.4, 0.0, 1.0);
    if (car.gear === 1) {
      gearTopKmh = 172.0;
      torqueMult = 1.38 * turboSpoolFactor;
    } else {
      gearTopKmh = 308.0;
      torqueMult = (car.speedKmh < 130 ? 0.58 : 1.02) * turboSpoolFactor;
    }
  }

  const slipBoostKmh = car.gear >= maxTopGear - 1 ? activeTow * towGainKmh : activeTow * 6.5;
  const careerCapBonusKmh = car.gear >= maxTopGear ? modTopKmh : modTopKmh * 0.25;
  const effectiveGearCapKmh = Math.max(85.0, gearTopKmh + slipBoostKmh + careerCapBonusKmh - totalDamageTopLossKmh);

  // Fuel consumption (active in both 2026 & 1982 Sim-Parity)
  if (!coinOpInfinite && !isQualifying && !car.inPitLane && effThrottleIn > 0.02 && speedMps > 1.0) {
    const lapsPerGameMeter = 1.0 / TRACK_GAME_LENGTH;
    const dsEst = (speedMps * safeDt) / mPerGameM;
    car.fuelLaps = Math.max(0.0, car.fuelLaps - dsEst * lapsPerGameMeter * wearFuelMult * (0.78 + 0.30 * effThrottleIn));
  }

  let accelMps2 = 0.0;
  let effectiveCap = effectiveGearCapKmh;
  let hardSpeedLimited = false;

  if (!coinOpInfinite && car.fuelLaps <= 0.001) {
    effectiveCap = Math.min(effectiveCap, 88.0);
    hardSpeedLimited = true;
  }
  if (car.damage.hasPuncture) {
    effectiveCap = Math.min(effectiveCap, 95.0);
    hardSpeedLimited = true;
  }
  if (vscActive && !car.inPitLane) {
    effectiveCap = Math.min(effectiveCap, 160.0);
    hardSpeedLimited = true;
  }
  if (car.inPitLane && (car.s >= PIT_LANE_CONFIG.speedLimitLineS || car.s < PIT_LANE_CONFIG.mergeStartS)) {
    if (car.speedKmh > PIT_LANE_CONFIG.speedLimitKmh + 1.0) {
      accelMps2 -= Math.min(24.0, 6.0 + (car.speedKmh - PIT_LANE_CONFIG.speedLimitKmh) * 2.8);
    }
    effectiveCap = Math.min(effectiveCap, PIT_LANE_CONFIG.speedLimitKmh);
    hardSpeedLimited = true;
  }

  // DRS wing-flap state: disabled automatically if rearWing >= 0.35 or in 1982 mode!
  car.drsActive =
    drsFunctional &&
    !car.inPitLane &&
    !vscActive &&
    !hardSpeedLimited &&
    localW < 0.15 &&
    effThrottleIn > 0.72 &&
    effBrakeIn < 0.05 &&
    Math.abs(kReal) < 0.0012 &&
    Math.abs(steerIn) < 0.10 &&
    car.speedKmh > 195.0 &&
    (car.inSlipstream || car.slipstreamFactor > 0.12 || (!!isQualifying && car.speedKmh > 235.0));

  // Longitudinal Acceleration F_drive / m(t)
  if (effThrottleIn > 0.01) {
    if (car.speedKmh < effectiveCap) {
      const aeroRatio = car.speedKmh / aeroTopKmh;
      const aeroHeadroom = Math.max(0.08, 1.0 - Math.pow(aeroRatio, 2.25));
      const downforceTraction = 0.88 + 0.20 * Math.sin(Math.min(1.0, car.speedKmh / 210.0) * Math.PI);
      const slipstreamSurge = (car.speedKmh > 145.0 && activeTow > 0.05) ? (1.0 + activeTow * 0.22) : 1.0;

      let rawDrive =
        effThrottleIn *
        14.2 *
        torqueMult *
        modPower *
        muLongDriveNorm *
        massInertiaRatio *
        downforceTraction *
        aeroHeadroom *
        slipstreamSurge;

      const willAutoUpshift = car.gearboxMode === 'AUTO_8SPD' && car.gear < 8 && !hardSpeedLimited;
      if (!willAutoUpshift) {
        const capMargin = effectiveCap - car.speedKmh;
        if (capMargin < 5.5) {
          rawDrive *= clamp(capMargin / 5.5, 0.0, 1.0);
        }
      }
      accelMps2 += rawDrive;
    } else {
      const over = car.speedKmh - effectiveCap;
      const dragRate = hardSpeedLimited
        ? Math.min(10.5, 1.8 + over * 0.85)
        : Math.min(5.2, 0.45 + over * 0.28);
      accelMps2 -= dragRate;
    }
  } else {
    // Natural F1 engine + MGU-K regeneration braking + speed-squared aero drag (F_drag / m)
    accelMps2 -= 4.8 + (kDragEff * vSq) / totalMassKg;
  }

  // Classic 1982 HIGH -> LOW over-rev engine brake above 172 km/h
  if (car.gear === 1 && car.gearboxMode === 'CLASSIC_2SPD' && car.speedKmh > 173.0) {
    accelMps2 -= 16.5;
    car.overRevTimer = Math.max(car.overRevTimer, 0.12);
  }
  if (car.overRevTimer > 0) {
    car.overRevTimer = Math.max(0, car.overRevTimer - safeDt);
  }

  // Physical Carbon-Ceramic + Aero-Augmented F1 Braking: a_brake = F_brake / m(t)
  if (effBrakeIn > 0.005) {
    const loadSensLong = clamp(Math.pow(F1_QUALIFYING_REF_MASS_KG / totalMassKg, 0.08), 0.88, 1.04);
    const lockupBrakeLoss = anyLocking ? 0.88 : 1.0;
    const physicalBrakeDecel =
      (muLongPhys * loadSensLong * (F1_GRAVITY + (kDownforceTotal * vSq) / totalMassKg) +
        (kDragEff * vSq) / totalMassKg) *
      modBrake *
      lockupBrakeLoss;
    accelMps2 -= effBrakeIn * physicalBrakeDecel;
  }

  // Continuous Curb & Grass/Gravel Rolling Resistance (zero boolean step!)
  if (!car.inPitLane) {
    accelMps2 -= 0.38 * wKerbMax * (1.0 - wGrassMax);
    if (wGrassAvg > 0.001) {
      accelMps2 -= wGrassAvg * (5.8 + Math.max(0.0, car.speedKmh - 135.0) * 0.14);
    }
  }

  // --------------------------------------------------------------------------
  // 8. PLANTED VELOCITY-DAMPED STEERING + ACTIVE TRACTION/STABILITY CONTROL
  //    (FULL | SPORT | OFF) + CURVILINEAR FRENET CORNERING SOLVER
  // --------------------------------------------------------------------------
  const fzFrontRef = F1_QUALIFYING_REF_MASS_KG * F1_GRAVITY * (F1_CG_TO_REAR_M / F1_WHEELBASE_M);
  const fzRearRef = F1_QUALIFYING_REF_MASS_KG * F1_GRAVITY * (F1_CG_TO_FRONT_M / F1_WHEELBASE_M);
  const frontLoadSens = clamp(Math.pow(fzFrontAxleN / fzFrontRef, -0.075), 0.84, 1.06);
  const rearLoadSens = clamp(Math.pow(fzRearAxleN / fzRearRef, -0.075), 0.84, 1.06);

  const Df = muFrontLat * fzFrontAxleN * frontLoadSens;
  const Dr = muRearLat * fzRearAxleN * rearLoadSens;
  const Fyf = Df * pacejkaMagic(frontSlipAngleRad, 10.6, 1.38, -0.35);
  const Fyr = Dr * pacejkaMagic(rearSlipAngleRad, 11.8, 1.38, -0.35);

  // Subtle cornering scrub drag
  if (speedMps > 4.0) {
    const scrubRatio = Math.min(1.0, Math.abs(steerFormatted) * 0.55 + Math.abs(kReal * 82.0) * 0.25);
    accelMps2 -= scrubRatio * scrubRatio * 1.15;
  }

  const nextSpeedMps = Math.max(0.0, speedMps + accelMps2 * safeDt);
  car.speedKmh = nextSpeedMps * 3.6;
  car.longG = accelMps2 / F1_GRAVITY;
  car._filtLongAccel = filtAx + (accelMps2 - filtAx) * (1.0 - Math.exp(-18.0 * safeDt));

  const muLatNorm = clamp(muLatAvg / F1_MECH_MU_SCALE, 0.36, 1.28);
  const downforceFactor =
    1.0 +
    0.52 *
      (nextSpeedMps / 88.0) *
      (nextSpeedMps / 88.0) *
      modAeroGrip *
      (0.5 * (frontAeroEff + rearAeroEff));
  const speedFactor = clamp(nextSpeedMps / 12.0, 0.0, 1.0);

  // Direct, planted steering lateral velocity command with generous cornering authority
  const steerAuthority =
    ((25.2 + 9.4 * muLatNorm * downforceFactor) *
      modAgility *
      hydroSteerMult *
      lowSpeedAckermann) /
    (1.0 + 0.00010 * nextSpeedMps * nextSpeedMps);
  const steerLatRate = steerFormatted * steerAuthority * speedFactor;

  // Curvature-Following Assist:
  // In FULL (52%) and SPORT (28%), the stability system automatically counters a portion
  // of road centrifugal push so the car tracks naturally around sweeping and tight curves!
  const centrifugalPush =
    -rawScaledCurv *
    (nextSpeedMps * nextSpeedMps) *
    0.00425 *
    (1.0 - curvAssistFactor);

  // Smooth understeer drift only when genuinely exceeding tire + aero lateral envelope
  const maxGripSpeedMps =
    (68.0 + 18.0 * muLatNorm * downforceFactor) / Math.max(0.32, Math.abs(rawScaledCurv));
  const overSpeedMps = Math.max(0.0, nextSpeedMps - maxGripSpeedMps);
  const understeerDrift =
    -Math.sign(rawScaledCurv) *
    overSpeedMps *
    0.42 *
    (1.20 - clamp(muLatNorm * 0.72, 0.30, 1.05)) *
    understeerMult;

  // Smooth C1 inside-apex rotation hook when steering into a corner on/near the inside kerb
  const steeringIntoTurn =
    Math.abs(rawScaledCurv) > 0.14 &&
    Math.sign(steerIn) === Math.sign(rawScaledCurv) &&
    Math.abs(steerIn) > 0.12;
  const smoothApexHook = steeringIntoTurn
    ? Math.sign(rawScaledCurv) *
      (1.35 * wKerbMax * (1.0 - wGrassMax) + (tcsMode === 'FULL' ? 1.15 : (tcsMode === 'SPORT' ? 0.65 : 0.25))) *
      Math.min(1.0, nextSpeedMps / 28.0)
    : 0.0;

  // Road-Edge Keeper Assist (active in FULL & SPORT when approaching outer asphalt edge):
  // Attenuates outward centrifugal/understeer drift near road edges without ever pulling inward when centered!
  const absLat = Math.abs(car.lateralOffset);
  const edgeStart = ROAD_HALF_WIDTH * 0.65;
  let edgeOutwardDamp = 1.0;
  if (car.isPlayer && tcsMode !== 'OFF' && !car.inPitLane && absLat > edgeStart) {
    const edgeDepth = smoothstep(edgeStart, ROAD_HALF_WIDTH * 1.02, absLat);
    const maxAtten = tcsMode === 'FULL' ? 0.78 : 0.45;
    edgeOutwardDamp = 1.0 - maxAtten * edgeDepth;
  }

  // Asymmetric aero/suspension pull (0% in FULL, 35% in SPORT, 100% in OFF)
  const fwAsym = fwRight - fwLeft;
  const asymPullVel =
    (fwAsym * 0.75 * (nextSpeedMps / 75.0) + suspDmg * 0.85 * suspBias) *
    speedFactor *
    pullSuppressMult;

  // --------------------------------------------------------------------------
  // 9. CURVILINEAR FRENET PATH INTEGRATION, <0.15s ZERO-OVERSHOOT STABILIZATION,
  //    WHEEL-TO-WHEEL RUBBING & BARRIER PROTECTION
  // --------------------------------------------------------------------------
  let scrapedWall = false;
  let dsRealM = nextSpeedMps * safeDt;
  const prevRelYaw = car.relYaw;

  if (car.inPitLane) {
    const targetPitLat = finiteOr(frame?.pitOffset, PIT_LANE_CONFIG.lateralOffset);
    const pitAlpha = 1.0 - Math.exp(-6.5 * safeDt);
    const prevLat = car.lateralOffset;
    car.lateralOffset += (targetPitLat - car.lateralOffset) * pitAlpha;
    car.lateralVel = (car.lateralOffset - prevLat) / safeDt;
    car.vyBody = 0.0;
    car.yawRate = 0.0;
    car.relYaw = clamp((targetPitLat - car.lateralOffset) * 0.08, -0.30, 0.30);
    car.yawAngle = car.relYaw;
    dsRealM = nextSpeedMps * Math.cos(car.relYaw) * safeDt;
  } else {
    let envDriftVel = centrifugalPush + understeerDrift + asymPullVel;
    // If road curvature is pushing the car outward toward the track edge, Edge-Keeper damps that outward drift
    if (car.lateralOffset * envDriftVel > 0.0) {
      envDriftVel *= edgeOutwardDamp;
    }

    const targetLatVel = steerLatRate + envDriftVel + smoothApexHook;

    // Fast exponential + linear centering stabilization:
    // When steering is centered (|steerIn| < 0.02), latDampRate = 36.0/s settles lateralVel
    // and relYaw to 0 within < 0.12s (< 0.15s) with strictly ZERO overshoot or fishtailing!
    const isCentering = Math.abs(steerIn) < 0.02;
    const latDampRate = isCentering ? 36.0 : 24.5;
    car.lateralVel += (targetLatVel - car.lateralVel) * (1.0 - Math.exp(-latDampRate * safeDt));

    if (isCentering && Math.abs(targetLatVel) < 0.12) {
      const linearSettle = Math.min(Math.abs(car.lateralVel), 6.5 * safeDt);
      car.lateralVel -= Math.sign(car.lateralVel) * linearSettle;
      if (Math.abs(car.lateralVel) < 0.035) {
        car.lateralVel = 0.0;
      }
    }

    car.lateralOffset += car.lateralVel * safeDt;

    // Planted kinematic yaw follower (never feeds back into lateralOffset -> zero PIO!)
    const desiredYaw =
      isCentering && Math.abs(car.lateralVel) < 0.06 && Math.abs(kReal) < 0.0005
        ? 0.0
        : clamp(
            (car.lateralVel / Math.max(16.0, nextSpeedMps)) * 0.55 + car.steerAngleRad * 0.10,
            -0.28,
            0.28
          );
    const yawDampRate = isCentering ? 42.0 : 24.0;
    car.relYaw += (desiredYaw - car.relYaw) * (1.0 - Math.exp(-yawDampRate * safeDt));
    if (isCentering && Math.abs(desiredYaw) < 0.01) {
      const yawSettle = Math.min(Math.abs(car.relYaw), 0.12 * safeDt);
      car.relYaw -= Math.sign(car.relYaw) * yawSettle;
      if (Math.abs(car.relYaw) < 0.005) {
        car.relYaw = 0.0;
      }
    }

    // Exact Frenet Curvilinear Jacobian: J(s, d) = max(0.38, 1 - k_real(s) * d)
    const jacobian = Math.max(0.38, 1.0 - kReal * car.lateralOffset);
    dsRealM = (Math.max(0.0, nextSpeedMps * Math.cos(car.relYaw * 0.45)) / jacobian) * safeDt;

    // Non-glitchy wheel-to-wheel sidepod rubbing restitution (preserves >96% forward speed!)
    if (Array.isArray(ctx.allCars)) {
      for (let i = 0; i < ctx.allCars.length; i++) {
        const other = ctx.allCars[i];
        if (!other || other === car || other.exploded || other.inPitLane) continue;
        let dsRub = other.s - car.s;
        if (dsRub > TRACK_GAME_LENGTH * 0.5) dsRub -= TRACK_GAME_LENGTH;
        if (dsRub < -TRACK_GAME_LENGTH * 0.5) dsRub += TRACK_GAME_LENGTH;
        const absLongM = Math.abs(dsRub * mPerGameM);
        const dLat = car.lateralOffset - other.lateralOffset;
        const minSideSep = 1.92;
        if (absLongM < 4.35 && Math.abs(dLat) < minSideSep) {
          const pushSign = dLat >= 0 ? 1.0 : -1.0;
          const overlap = minSideSep - Math.abs(dLat);
          car.lateralOffset += pushSign * overlap * 0.52;
          const otherLatV = finiteOr(other.lateralVel, 0.0);
          const relLatV = car.lateralVel - otherLatV;
          if (relLatV * pushSign < 0) {
            car.lateralVel = otherLatV - relLatV * 0.16 + pushSign * 1.05;
          }
          car.speedKmh = Math.max(45.0, car.speedKmh - overlap * 8.5 * safeDt);
        }
      }
    }

    // Pit-Wall & Armco Guardrail Clamping with dt-continuous friction scrub (ZERO single-tick velocity step!)
    const inPitWallZone = car.s >= 948.0 || car.s <= 75.0;
    let maxRightBarrier = ROAD_HALF_WIDTH + 2.45;
    if (inPitWallZone) {
      maxRightBarrier = ROAD_HALF_WIDTH + 0.72;
    } else if (car.s > 936.0 && car.s < 948.0) {
      const noseBlend = smoothstep(936.0, 948.0, car.s);
      maxRightBarrier = lerp(ROAD_HALF_WIDTH + 2.45, ROAD_HALF_WIDTH + 0.72, noseBlend);
    }
    const minLeftBarrier = -(ROAD_HALF_WIDTH + 2.45);

    if (car.lateralOffset > maxRightBarrier) {
      car.lateralOffset = maxRightBarrier;
      scrapedWall = true;
      const vOutward = Math.max(0.0, car.lateralVel);
      if (vOutward > 0.0) {
        car.lateralVel = -Math.min(2.0, vOutward * 0.18);
        if (!coinOpInfinite && vOutward > 2.6) {
          const endplateHit = Math.min(0.35, (vOutward - 2.6) * 0.06);
          car.damage.frontWingRight = clamp(car.damage.frontWingRight + endplateHit, 0.0, 1.0);
          car.damage.frontWingSide = 1;
          car.damage.frontWing = clamp(
            0.55 * Math.max(car.damage.frontWingLeft, car.damage.frontWingRight) +
              0.45 * 0.5 * (car.damage.frontWingLeft + car.damage.frontWingRight),
            0.0,
            1.0
          );
        }
      }
      car.relYaw *= Math.exp(-16.0 * safeDt);
      car.speedKmh = Math.max(40.0, car.speedKmh - (36.0 + vOutward * 15.0) * safeDt);
    } else if (car.lateralOffset < minLeftBarrier) {
      car.lateralOffset = minLeftBarrier;
      scrapedWall = true;
      const vOutward = Math.max(0.0, -car.lateralVel);
      if (vOutward > 0.0) {
        car.lateralVel = Math.min(2.0, vOutward * 0.18);
        if (!coinOpInfinite && vOutward > 2.6) {
          const endplateHit = Math.min(0.35, (vOutward - 2.6) * 0.06);
          car.damage.frontWingLeft = clamp(car.damage.frontWingLeft + endplateHit, 0.0, 1.0);
          car.damage.frontWingSide = -1;
          car.damage.frontWing = clamp(
            0.55 * Math.max(car.damage.frontWingLeft, car.damage.frontWingRight) +
              0.45 * 0.5 * (car.damage.frontWingLeft + car.damage.frontWingRight),
            0.0,
            1.0
          );
        }
      }
      car.relYaw *= Math.exp(-16.0 * safeDt);
      car.speedKmh = Math.max(40.0, car.speedKmh - (36.0 + vOutward * 15.0) * safeDt);
    }

    car.yawAngle = car.relYaw;
  }

  // Synchronize body-frame telemetry (vyBody, yawRate, bodySlipAngleRad, latG, gripUtilization)
  const onStraightNeutral =
    steerIn === 0.0 &&
    Math.abs(kReal) < 0.0002 &&
    Math.abs(car.lateralVel) < 0.03 &&
    Math.abs(car.relYaw) < 0.003;

  if (onStraightNeutral) {
    car.vyBody = 0.0;
    car.yawRate = 0.0;
    car.bodySlipAngleRad = 0.0;
    car.latG = 0.0;
  } else {
    car.vyBody = clamp(car.lateralVel * 0.38, -12.0, 12.0);
    const roadYawRate = kReal * nextSpeedMps;
    const relYawVel = (car.relYaw - prevRelYaw) / safeDt;
    car.yawRate = clamp(roadYawRate + relYawVel * 0.45, -2.6, 2.6);
    car.bodySlipAngleRad = nextSpeedMps > 0.5 ? Math.atan2(car.vyBody, nextSpeedMps) : 0.0;
    const cornerLatAccel =
      (rawScaledCurv * 0.0125 * nextSpeedMps * nextSpeedMps) +
      (steerFormatted * nextSpeedMps * 0.48);
    car.latG = clamp(cornerLatAccel / F1_GRAVITY, -5.8, 5.8);
  }

  const maxLatG = Math.max(0.8, 1.95 * muLatNorm * downforceFactor);
  car.gripUtilization = clamp(Math.abs(car.latG) / maxLatG, 0.0, 1.25);
  car._lastComputedLatVel = car.lateralVel;

  // --------------------------------------------------------------------------
  // 10. AUTOMATIC SEAMLESS GEARBOX (UNCONDITIONAL DOWNSHIFT-FIRST WHEN SLOWING),
  //     SAWTOOTH RPM & TURBO / ERS HYDRAULICS
  // --------------------------------------------------------------------------
  if (car.gearboxMode === 'AUTO_8SPD' && car.shiftCooldown <= 0) {
    if (car.inPitLane && (car.s >= PIT_LANE_CONFIG.speedLimitLineS || car.s < PIT_LANE_CONFIG.mergeStartS)) {
      if (car.gear > 2 && car.speedKmh <= Math.max(96.0, EIGHT_SPEED_DOWNSHIFT[car.gear - 2])) {
        car.gear -= 1;
        car.shiftCooldown = 0.055;
        car.revBlipTimer = 0.11;
        if (callbacks.onGearShift) callbacks.onGearShift(car, car.gear, 'DOWN');
      } else if (car.gear === 2 && car.speedKmh <= 50.0) {
        car.gear = 1;
        car.shiftCooldown = 0.08;
        if (callbacks.onGearShift) callbacks.onGearShift(car, 1, 'DOWN');
      } else if (car.gear === 1 && effThrottleIn > 0.18 && car.speedKmh >= 72.0) {
        car.gear = 2;
        car.shiftCooldown = 0.14;
        if (callbacks.onGearShift) callbacks.onGearShift(car, 2, 'UP');
      }
    } else {
      // Check DOWNSHIFT FIRST on every substep regardless of whether brake or throttle is pressed!
      // Gears 8->7..3->2 use EIGHT_SPEED_DOWNSHIFT [134, 169, 200, 229, 256, 280] (+8 km/h brake bias);
      // Gear 2->1 stays in 2nd down to 66 km/h on coast/brake (or 96 km/h on throttle kickdown) so 70 km/h hairpins hold 2nd gear cleanly!
      const brakeDownshiftBias = effBrakeIn > 0.10 ? effBrakeIn * 8.0 : 0.0;
      const baseDownThresh = car.gear === 2
        ? (effThrottleIn > 0.55 && effBrakeIn < 0.10 ? EIGHT_SPEED_DOWNSHIFT[0] : 66.0)
        : (car.gear > 2 ? EIGHT_SPEED_DOWNSHIFT[car.gear - 2] : -1.0);
      const downshiftSpd = car.gear > 1 ? baseDownThresh + (car.gear > 2 ? brakeDownshiftBias : 0.0) : -1.0;

      // Also check if RPM dropped below 8500 RPM powerband floor while below the lower gear's upshift ceiling
      const rpmBogging =
        car.gear > 2 &&
        car.rpm < 8500 &&
        car.speedKmh <= EIGHT_SPEED_UPSHIFT[car.gear - 2] - 5.0;

      if (car.gear > 1 && (car.speedKmh <= downshiftSpd || rpmBogging)) {
        car.gear -= 1;
        // If speed dropped across multiple gear bands (e.g., emergency braking or off-track scrub),
        // catch up an extra gear step so the car NEVER bogs in a high gear!
        if (car.gear > 2 && car.speedKmh <= EIGHT_SPEED_DOWNSHIFT[car.gear - 2] - 8.0) {
          car.gear -= 1;
        }
        car.shiftCooldown = 0.052;
        car.revBlipTimer = 0.115;
        car.cornerExitTorqueTimer = 0.28;
        if (callbacks.onGearShift) callbacks.onGearShift(car, car.gear, 'DOWN');
        if (car.speedKmh > 110 && effBrakeIn > 0.20 && callbacks.onBackfire) {
          callbacks.onBackfire(car);
        }
      } else {
        const cornerHoldOffset = (Math.abs(steerIn) > 0.55 && effThrottleIn < 0.65) ? 3.5 : 0.0;
        const upshiftSpd = car.gear < 8 ? EIGHT_SPEED_UPSHIFT[car.gear - 1] + cornerHoldOffset : Infinity;
        if (car.gear < 8 && effThrottleIn > 0.12 && effBrakeIn < 0.25 && car.speedKmh >= upshiftSpd) {
          car.gear += 1;
          car.shiftCooldown = 0.13;
          if (callbacks.onGearShift) callbacks.onGearShift(car, car.gear, 'UP');
        }
      }
    }
  } else if (
    (car.gearboxMode === 'AUTO_2SPD' || (car.gearboxMode === 'CLASSIC_2SPD' && !ctx.manualClassicGearbox)) &&
    car.shiftCooldown <= 0
  ) {
    // Automatic shifting support for 1982 2-Speed LOW/HIGH mode when slowing down or accelerating
    if (car.gear === 2 && car.speedKmh <= 142.0) {
      car.gear = 1;
      car.shiftCooldown = 0.10;
      car.revBlipTimer = 0.11;
      if (callbacks.onGearShift) callbacks.onGearShift(car, 1, 'DOWN');
    } else if (car.gear === 1 && effThrottleIn > 0.15 && effBrakeIn < 0.20 && car.speedKmh >= 168.0) {
      car.gear = 2;
      car.shiftCooldown = 0.14;
      if (callbacks.onGearShift) callbacks.onGearShift(car, 2, 'UP');
    }
  }

  let targetRpm;
  if (car.overRevTimer > 0) {
    targetRpm = 13650 + Math.sin(nowMs * 0.12) * 240;
  } else if (is8Speed) {
    const gIdx = clamp(car.gear - 1, 0, 7);
    const gTop = EIGHT_SPEED_TOPS[gIdx];
    let mechRpm;

    if (gIdx === 0) {
      const wheelRpm = (car.speedKmh / gTop) * F1_SHIFT_PEAK_RPM;
      const launchClutchFloor = 3800 + effThrottleIn * 2700;
      mechRpm = Math.max(launchClutchFloor, wheelRpm);
    } else {
      const vEntry = EIGHT_SPEED_UPSHIFT[gIdx - 1];
      const vDown = EIGHT_SPEED_DOWNSHIFT[gIdx - 1];
      const entryRpm = EIGHT_SPEED_ENTRY_RPM[gIdx];
      const peakRpm = gIdx === 7 ? F1_TOP_GEAR_RPM : F1_SHIFT_PEAK_RPM;
      if (car.speedKmh >= gTop) {
        mechRpm = peakRpm + (car.speedKmh - gTop) * 24.0;
      } else if (car.speedKmh >= vEntry) {
        const span = Math.max(8.0, gTop - vEntry);
        mechRpm = entryRpm + ((car.speedKmh - vEntry) / span) * (peakRpm - entryRpm);
      } else if (car.speedKmh >= vDown) {
        const downSpan = Math.max(4.0, vEntry - vDown);
        mechRpm = 8480 + ((car.speedKmh - vDown) / downSpan) * (entryRpm - 8480);
      } else {
        const directWheelRpm = (car.speedKmh / gTop) * peakRpm;
        const entryMapRpm = 3800 + (car.speedKmh / Math.max(20.0, vDown)) * (8480 - 3800);
        mechRpm = Math.max(entryMapRpm, directWheelRpm * 0.94);
      }
    }

    const blipEnv = car.revBlipTimer > 0 ? Math.sin((car.revBlipTimer / 0.125) * Math.PI) : 0.0;
    const blipBoost = blipEnv * (1620 + effBrakeIn * 420);
    const atCeiling =
      car.speedKmh >= effectiveCap - 1.2 &&
      effThrottleIn > 0.5 &&
      (car.gear === 8 || car.gearboxMode !== 'AUTO_8SPD' || hardSpeedLimited);
    const limiterFlutter = atCeiling ? Math.sin(nowMs * 0.10) * 140 : 0;

    targetRpm = clamp(mechRpm + blipBoost + limiterFlutter, 3600, 13800);
  } else if (is6Speed) {
    const gIdx = clamp(car.gear - 1, 0, 5);
    const gTop = SIX_SPEED_TOPS[gIdx];
    const vEntry = gIdx > 0 ? SIX_SPEED_TOPS[gIdx - 1] * 0.94 : 0;
    const entryRpm = SIX_SPEED_ENTRY_RPM[gIdx];
    const mechRpm = gIdx === 0
      ? Math.max(3800 + effThrottleIn * 2600, (car.speedKmh / gTop) * F1_TOP_GEAR_RPM)
      : (car.speedKmh >= vEntry
        ? entryRpm + ((car.speedKmh - vEntry) / Math.max(8, gTop - vEntry)) * (F1_TOP_GEAR_RPM - entryRpm)
        : 3800 + (car.speedKmh / Math.max(20, vEntry)) * (entryRpm - 3800));
    const blipBoost = car.revBlipTimer > 0 ? Math.sin((car.revBlipTimer / 0.125) * Math.PI) * 1550 : 0;
    targetRpm = clamp(mechRpm + blipBoost, 3600, 13650);
  } else {
    const normGearRatio = Math.min(1.04, car.speedKmh / Math.max(60, gearTopKmh));
    const revBounce = car.speedKmh >= gearTopKmh - 1.0 && effThrottleIn > 0.5
      ? Math.sin(nowMs * 0.09) * 240
      : 0;
    targetRpm = clamp(3600 + normGearRatio * 9150 + revBounce, 3600, 13400);
  }

  const rpmRate = car.revBlipTimer > 0.02
    ? 78.0
    : ((targetRpm < car.rpm && car.shiftCooldown > 0.04) ? 62.0 : 52.0);
  car.rpm += (targetRpm - car.rpm) * (1.0 - Math.exp(-rpmRate * safeDt));

  // Turbo Boost (1982 mechanical spool inertia vs 2026 MGU-H anti-lag) & Hybrid ERS
  const exhaustEnthalpy = clamp((car.rpm - 4100.0) / 8300.0, 0.0, 1.06);
  const antiLagFloorBar = isClassic
    ? (effThrottleIn > 0.10 ? 0.10 : 0.0)
    : (car.revBlipTimer > 0.0 ? 0.62 : (effThrottleIn > 0.05 ? 0.18 : 0.0));
  const targetBoostBar = clamp(Math.max(antiLagFloorBar, effThrottleIn * exhaustEnthalpy * 2.40), 0.0, 2.40);
  const boostUpRate = isClassic ? 4.8 : 7.5;
  const boostRate = targetBoostBar >= finiteOr(car.turboBoostBar, 0.0) ? boostUpRate : 12.0;
  car.turboBoostBar = clamp(
    finiteOr(car.turboBoostBar, 0.0) +
      (targetBoostBar - finiteOr(car.turboBoostBar, 0.0)) * (1.0 - Math.exp(-boostRate * safeDt)),
    0.0,
    2.40
  );

  car.ersCharge = finiteOr(car.ersCharge, 1.0);
  if (!isClassic && !car.inPitLane) {
    if (effBrakeIn > 0.14 && car.speedKmh > 65.0) {
      car.ersCharge = Math.min(1.0, car.ersCharge + effBrakeIn * 0.11 * safeDt);
      car.ersDeploying = false;
    } else if (effThrottleIn > 0.78 && car.speedKmh > 85.0 && car.ersCharge > 0.02) {
      car.ersCharge = Math.max(0.0, car.ersCharge - 0.042 * safeDt);
      car.ersDeploying = true;
    } else {
      car.ersDeploying = false;
    }
  } else {
    car.ersDeploying = false;
  }

  // --------------------------------------------------------------------------
  // 11. PNEUMATIC-TRAIL SELF-ALIGNING TORQUE (SAT), FLAT-SPOT HARMONICS &
  //     2ND-ORDER SUSPENSION PITCH / ROLL / HEAVE / WHEEL DEFLECTION
  // --------------------------------------------------------------------------
  const frontFlatMax = Math.max(car.tireFlatSpot[0], car.tireFlatSpot[1]);
  const flatVibGate = smoothstep(8.0, 35.0, nextSpeedMps);
  const flatSpotWave = Math.sin(car.wheelSpinRad);
  const flatSpotSatPulse = frontFlatMax > 0.03 ? frontFlatMax * 0.18 * flatVibGate * flatSpotWave : 0.0;

  if (onStraightNeutral && Math.abs(car.vyBody) < 0.03 && frontFlatMax <= 0.03) {
    car.selfAligningTorque = 0.0;
  } else {
    // Pneumatic trail peaks at small slip angles and lightens progressively when front wing is damaged or front tires saturate!
    const pneumaticTrail = Math.cos(clamp(Math.abs(frontSlipAngleRad) * 4.2, 0.0, 1.48));
    const centeringTorque = -(Fyf / Math.max(1800.0, fzFrontAxleN * 1.65)) * 0.45 * pneumaticTrail;
    // Oversteer slide-catch cue + persistent alignment toe-pull from suspension damage
    const oversteerDelta = Math.abs(rearSlipAngleRad) > Math.abs(frontSlipAngleRad) * 1.05
      ? (frontSlipAngleRad - rearSlipAngleRad) * 1.15
      : 0.0;
    const suspSatPull = suspDmg > 0.05 ? suspDmg * 0.20 * suspBias : 0.0;
    const lowSpdGate = smoothstep(2.0, 22.0, car.speedKmh);
    car.selfAligningTorque = clamp(
      (centeringTorque + oversteerDelta + suspSatPull + flatSpotSatPulse) * lowSpdGate,
      -1.0,
      1.0
    );
  }

  // 3D Chassis Pitch Dynamics: +0.026 rad braking nose-dive, -0.018 rad launch/ERS squat
  const targetPitchFromG = car.longG < 0.0
    ? clamp((-car.longG / 4.8) * 0.026, 0.0, 0.026)
    : clamp(-(car.longG / 1.45) * 0.018, -0.018, 0.0);
  const shiftPitchNod = (car.shiftCooldown > 0.07 && car.revBlipTimer <= 0.0) ? -0.0028 : 0.0;
  const sawtoothPhase = car.totalDistanceGameM * 22.5;
  const kerbSawWave = wKerbMax > 0.05 ? Math.sin(sawtoothPhase) * wKerbMax : 0.0;
  const targetPitchRad = clamp(targetPitchFromG + shiftPitchNod + kerbSawWave * 0.0022, -0.024, 0.028);

  car.chassisPitchVel = finiteOr(car.chassisPitchVel, 0.0);
  const pitchDamp = 38.0 * (1.0 - 0.18 * suspDmg);
  const pitchAccel = 484.0 * (targetPitchRad - car.chassisPitchRad) - pitchDamp * car.chassisPitchVel;
  car.chassisPitchVel = clamp(car.chassisPitchVel + pitchAccel * safeDt, -0.80, 0.80);
  car.chassisPitchRad = clamp(car.chassisPitchRad + car.chassisPitchVel * safeDt, -0.026, 0.030);
  if (onStraightNeutral && Math.abs(targetPitchRad) < 0.0004 && Math.abs(car.chassisPitchRad) < 0.0003) {
    car.chassisPitchRad = 0.0;
    car.chassisPitchVel = 0.0;
  }

  // 3D Chassis Roll Dynamics: lateral G body roll + continuous kerb lift + asymmetric suspension damage
  const dmgKerbAmp = 1.0 + 0.75 * suspDmg;
  const kerbRollLift = (wKerbL - wKerbR) * (0.0105 + 0.0038 * Math.sin(sawtoothPhase)) * dmgKerbAmp;
  const suspStaticCant = suspDmg > 0.10 ? suspDmg * 0.008 * suspBias : 0.0;
  const targetRollRad = onStraightNeutral && wKerbMax < 0.02
    ? 0.0
    : clamp(-clamp(car.latG / 4.4, -1.0, 1.0) * 0.024 + kerbRollLift + suspStaticCant, -0.042, 0.042);

  car.chassisRollVel = finiteOr(car.chassisRollVel, 0.0);
  const rollDamp = 44.0 * (1.0 - 0.26 * suspDmg);
  const rollAccel = 676.0 * (targetRollRad - car.chassisRollRad) - rollDamp * car.chassisRollVel;
  car.chassisRollVel = clamp(car.chassisRollVel + rollAccel * safeDt, -1.05, 1.05);
  car.chassisRollRad = clamp(car.chassisRollRad + car.chassisRollVel * safeDt, -0.044, 0.044);
  if (onStraightNeutral && wKerbMax < 0.02 && Math.abs(car.chassisRollRad) < 0.0003) {
    car.chassisRollRad = 0.0;
    car.chassisRollVel = 0.0;
  }

  // Chassis Heave (m) & 4-Corner Physical Wheel Deflection (m) around 1G rest
  // Note: models.js & main.js add wheelCompression[i] directly to wheel Y in meters!
  const aeroSquatNorm = Math.min(1.15, (car.speedKmh / 316.0) * (car.speedKmh / 316.0));
  const flatSpotHeaveM = maxFlatSpot > 0.05 ? maxFlatSpot * 0.0018 * flatVibGate * Math.abs(flatSpotWave) : 0.0;
  car.chassisHeaveM =
    -aeroSquatNorm * 0.009 +
    wKerbMax * Math.abs(Math.sin(sawtoothPhase)) * 0.0065 * dmgKerbAmp -
    suspDmg * 0.006 +
    flatSpotHeaveM;

  const aeroCompM = aeroSquatNorm * 0.012;
  const pitchCompM = (car.chassisPitchRad / 0.026) * 0.014;
  const rollCompM = -(car.chassisRollRad / 0.030) * 0.013;
  const kerbBumpLM = wKerbL * (0.012 + 0.008 * Math.sin(sawtoothPhase)) * dmgKerbAmp;
  const kerbBumpRM = wKerbR * (0.012 + 0.008 * Math.sin(sawtoothPhase)) * dmgKerbAmp;

  const defFL = clamp(aeroCompM * 0.44 + pitchCompM + rollCompM + kerbBumpLM + (car.tireFlatSpot[0] * 0.0025 * flatSpotWave), -0.035, 0.048);
  const defFR = clamp(aeroCompM * 0.44 + pitchCompM - rollCompM + kerbBumpRM + (car.tireFlatSpot[1] * 0.0025 * flatSpotWave), -0.035, 0.048);
  const defRL = clamp(aeroCompM * 0.56 - pitchCompM + rollCompM + kerbBumpLM + (car.tireFlatSpot[2] * 0.0020 * flatSpotWave), -0.035, 0.048);
  const defRR = clamp(aeroCompM * 0.56 - pitchCompM - rollCompM + kerbBumpRM + (car.tireFlatSpot[3] * 0.0020 * flatSpotWave), -0.035, 0.048);

  car.wheelCompression[0] = defFL;
  car.wheelCompression[1] = defFR;
  car.wheelCompression[2] = defRL;
  car.wheelCompression[3] = defRR;
  car.tires.FL.compression = clamp(0.25 + defFL * 12.5, 0.0, 1.0);
  car.tires.FR.compression = clamp(0.25 + defFR * 12.5, 0.0, 1.0);
  car.tires.RL.compression = clamp(0.25 + defRL * 12.5, 0.0, 1.0);
  car.tires.RR.compression = clamp(0.25 + defRR * 12.5, 0.0, 1.0);

  const slipExcess = Math.max(0.0, car.gripUtilization - 0.88) * 2.8;
  const curbTactileRumble = (wKerbMax > 0.30 && car.speedKmh > 60.0) ? 0.18 * wKerbMax : 0.0;
  car.skidIntensity = clamp(
    (scrapedWall ? 0.78 : curbTactileRumble) +
      slipExcess +
      (anyLocking ? 0.86 : 0.0),
    0.0,
    1.0
  );

  // --------------------------------------------------------------------------
  // 12. ADVANCE SPLINE PROGRESS (s in 0..1000 GAME-METERS) & LAP DETECTION
  // --------------------------------------------------------------------------
  const dsGame = dsRealM / mPerGameM;
  const prevS = car.s;
  car.s = wrapTrackS(car.s + dsGame);
  if (!car.inPitLane && (car.s >= 948.0 || car.s <= 75.0) && car.lateralOffset > ROAD_HALF_WIDTH + 0.72) {
    car.lateralOffset = ROAD_HALF_WIDTH + 0.72;
  }
  car.totalDistanceGameM += dsGame;
  car.currentLapTime = finiteOr(car.currentLapTime, 0) + safeDt;

  if (dsGame > 0 && prevS > 950 && car.s < 50) {
    if (callbacks.onLapCrossed) {
      callbacks.onLapCrossed(car);
    }
  }
}
