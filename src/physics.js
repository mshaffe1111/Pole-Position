// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Decoupled 240Hz Vehicle Physics, 8-Speed Seamless F1 Automatic Transmission,
// Pacejka-Lite 4-Corner Tires, Thermal/Wear, Component Damage & Fuel Mass
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

// Upshift & Downshift speed thresholds (km/h) with generous 22-28 km/h hysteresis
// so the gearbox never hunts or chatters mid-corner.
const EIGHT_SPEED_UPSHIFT = [106.8, 146.5, 182.2, 214.0, 242.8, 269.6, 293.6];
const EIGHT_SPEED_DOWNSHIFT = [84.0, 120.0, 154.0, 185.0, 214.0, 241.0, 266.0];

// Post-upshift engagement RPM per gear (G1..G8) for crisp F1 mechanical sawtooth sweeps
const EIGHT_SPEED_ENTRY_RPM = [3800, 8880, 9150, 9380, 9560, 9720, 9860, 9980];
const F1_SHIFT_PEAK_RPM = 12960;
const F1_TOP_GEAR_RPM = 12840;

// Legacy 6-Speed sequential ratios
const SIX_SPEED_TOPS = [116, 162, 204, 242, 276, 312];
const SIX_SPEED_ENTRY_RPM = [3800, 9000, 9350, 9650, 9850, 10050];

function finiteOr(val, fallback = 0) {
  return Number.isFinite(val) ? val : fallback;
}

function clamp(val, min, max) {
  if (!Number.isFinite(val)) return min;
  return val < min ? min : (val > max ? max : val);
}

function wrapTrackS(s) {
  if (!Number.isFinite(s)) return 0;
  let r = s % TRACK_GAME_LENGTH;
  if (r < 0) r += TRACK_GAME_LENGTH;
  if (r >= TRACK_GAME_LENGTH) r = 0;
  return r;
}

// Pacejka Magic Formula y(x) = sin(C * atan(B*x - E*(B*x - atan(B*x))))
function pacejkaMagic(slip, B = 10.2, C = 1.38, E = -0.52) {
  const bx = B * slip;
  return Math.sin(C * Math.atan(bx - E * (bx - Math.atan(bx))));
}

function ensureFourArray(arr, fillVal = 0.0) {
  if (!Array.isArray(arr) || arr.length < 4) {
    return [fillVal, fillVal, fillVal, fillVal];
  }
  return arr;
}

export function createVehicleState(opts = {}) {
  const compound = TIRE_COMPOUNDS[opts.compound] ? opts.compound : 'SOFT';
  const compDef = TIRE_COMPOUNDS[compound] || TIRE_COMPOUNDS.SOFT;
  const defaultBlanketTemp = Math.round((compDef.optTempMin + compDef.optTempMax) * 0.5);
  const baseTemp = finiteOr(opts.initialTireTemp, defaultBlanketTemp);
  const validModes = ['AUTO_8SPD', 'MANUAL_8SPD', 'CLASSIC_2SPD', 'PRO_6SPD'];
  const gearboxMode = validModes.includes(opts.gearboxMode) ? opts.gearboxMode : 'AUTO_8SPD';

  return {
    id: opts.id || 'PLAYER',
    isPlayer: !!opts.isPlayer,
    name: opts.name || 'PLAYER #1',
    short: opts.short || 'PLY',
    carNum: opts.carNum || 1,

    // Spatial coordinates along 1,000 game-meter circuit spline
    s: wrapTrackS(finiteOr(opts.s, 0)),
    totalDistanceGameM: finiteOr(opts.totalDistanceGameM, 0),
    lap: opts.lap ?? 1,
    lateralOffset: finiteOr(opts.lateralOffset, 0),
    lateralVel: 0,
    relYaw: 0,

    // Kinematics & 8-Speed Seamless F1 Power Unit
    speedKmh: 0,
    rpm: 3800,
    gear: 1, // 1..8 in AUTO_8SPD / MANUAL_8SPD, or 1=LOW / 2=HIGH in CLASSIC_2SPD
    gearboxMode, // Defaults to 'AUTO_8SPD'
    shiftCooldown: 0,
    revBlipTimer: 0,
    cornerExitTorqueTimer: 0,
    overRevTimer: 0,
    turboBoostBar: 0.0, // 0.0..2.4 bar V6 split-turbo + MGU-H boost pressure
    ersCharge: 1.0,     // 0.0..1.0 MGU-K battery state of charge
    ersDeploying: false,
    inSlipstream: false,
    slipstreamFactor: 0,
    towReservoir: 0,
    drsActive: false,

    // Control inputs [0..1] / [-1..1] & Front-Axle Pneumatic-Trail SAT Feedback
    steerInput: 0,
    steerAngleRad: 0,
    selfAligningTorque: 0.0, // [-1..1] counter-steer & pneumatic-trail feedback for @controls
    throttleInput: 0,
    brakeInput: 0,

    // 3D Suspension Attitude & 4-Corner Deflection Dynamics
    chassisPitchRad: 0.0, // +0.028 rad braking nose-dive, -0.020 rad launch/ERS rear squat
    chassisPitchVel: 0.0,
    chassisRollRad: 0.0,  // Lateral G body roll + asymmetric sawtooth FIA kerb lift
    chassisRollVel: 0.0,
    chassisHeaveM: 0.0,
    wheelCompression: [0.25, 0.25, 0.25, 0.25], // [fl, fr, rl, rr] normalized [0..1]

    // Surface & Hazard state
    onCurb: false,
    onGrass: false,
    aquaplaneTimer: 0,
    latG: 0,
    longG: 0,
    skidIntensity: 0,

    // 2026 Dual-Layer (Surface + Core) Tire & Fuel Simulation
    compound,
    tireTempsC: [baseTemp, baseTemp, baseTemp, baseTemp],     // [fl, fr, rl, rr] °C
    tireCoreTempsC: [baseTemp, baseTemp, baseTemp, baseTemp], // [fl, fr, rl, rr] °C
    tires: {
      FL: { life: 1.0, temp: baseTemp, surfaceTemp: baseTemp, coreTemp: baseTemp, load: 0.25, compression: 0.25, slipAngleRad: 0.0, slipRatio: 0.0, punctured: false },
      FR: { life: 1.0, temp: baseTemp, surfaceTemp: baseTemp, coreTemp: baseTemp, load: 0.25, compression: 0.25, slipAngleRad: 0.0, slipRatio: 0.0, punctured: false },
      RL: { life: 1.0, temp: baseTemp, surfaceTemp: baseTemp, coreTemp: baseTemp, load: 0.25, compression: 0.25, slipAngleRad: 0.0, slipRatio: 0.0, punctured: false },
      RR: { life: 1.0, temp: baseTemp, surfaceTemp: baseTemp, coreTemp: baseTemp, load: 0.25, compression: 0.25, slipAngleRad: 0.0, slipRatio: 0.0, punctured: false },
    },
    fuelLaps: finiteOr(opts.fuelLaps, 7.0),
    maxFuelLaps: finiteOr(opts.maxFuelLaps, 15.0),

    // 4-Zone Component Damage (2026 Mode)
    damage: {
      frontWing: 0.0,
      rearWing: 0.0,
      suspension: 0.0,
      suspensionBias: 1,
      damagedCorner: 'FL',
      hasPuncture: false,
    },

    // Crash / Explosion state (1982 Mode & >220 km/h head-on)
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

    // Optional Career Mode R&D Parts & Garage Setup Modifiers
    perfMods: opts.perfMods || null,
  };
}

export function shiftGear(car, direction, callbacks = {}) {
  if (!car || car.exploded || car.pitPhase === 'STOPPED') return;

  const spd = finiteOr(car.speedKmh, 0);

  if (car.gearboxMode === 'AUTO_8SPD') {
    // Ignore toggle-shift (Space = 0) in full AUTO_8SPD so clutch taps never bog launch;
    // still honor explicit paddle overrides (+1 / -1) within safe mechanical bounds.
    if (direction === 0) return;
    const step = direction > 0 ? 1 : -1;
    const next = clamp(car.gear + step, 1, 8);
    if (next === car.gear) return;

    // Prevent bogging upshifts at very low speed or catastrophic 3-gear money-shifts in AUTO override
    if (step > 0 && next >= 2 && spd < EIGHT_SPEED_DOWNSHIFT[next - 2] - 12) return;
    if (step < 0 && spd > EIGHT_SPEED_TOPS[next - 1] + 14) {
      car.overRevTimer = 0.35;
      if (callbacks.onOverRev) callbacks.onOverRev(car);
      return;
    }

    car.gear = next;
    car.shiftCooldown = 0.42; // Brief semi-auto paddle hold before seamless AUTO_8SPD resumes
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

  // Sanitize incoming state against any external NaN perturbation
  car.s = wrapTrackS(car.s);
  car.totalDistanceGameM = finiteOr(car.totalDistanceGameM, 0);
  car.lateralOffset = finiteOr(car.lateralOffset, 0);
  car.lateralVel = finiteOr(car.lateralVel, 0);
  car.relYaw = finiteOr(car.relYaw, 0);
  car.speedKmh = Math.max(0, finiteOr(car.speedKmh, 0));
  car.rpm = clamp(finiteOr(car.rpm, 3800), 0, 14500);
  car.slipstreamFactor = clamp(finiteOr(car.slipstreamFactor, 0), 0, 1.25);

  const throttleIn = clamp(finiteOr(car.throttleInput, 0), 0, 1);
  const brakeIn = clamp(finiteOr(car.brakeInput, 0), 0, 1);
  const rawSteerIn = clamp(finiteOr(car.steerInput, 0), -1, 1);
  // Strict micro-deadzone guarantees 0.000000 steering input when resting straight
  const steerIn = Math.abs(rawSteerIn) < 0.002 ? 0.0 : rawSteerIn;

  car.tireTempsC = ensureFourArray(car.tireTempsC, 92.0);
  car.tireCoreTempsC = ensureFourArray(car.tireCoreTempsC, 92.0);
  car.wheelCompression = ensureFourArray(car.wheelCompression, 0.25);

  // Handle explosion respawn countdown
  if (car.exploded) {
    car.explodeTimer = finiteOr(car.explodeTimer, 0) - safeDt;
    car.speedKmh = 0;
    car.rpm = 0;
    car.turboBoostBar = 0.0;
    car.selfAligningTorque = 0.0;
    car.chassisPitchRad = 0.0;
    car.chassisPitchVel = 0.0;
    car.chassisRollRad = 0.0;
    car.chassisRollVel = 0.0;
    car.latG = 0;
    car.longG = 0;
    car.skidIntensity = 0;
    car.drsActive = false;
    if (car.explodeTimer <= 0) {
      car.exploded = false;
      car.lateralOffset = 0;
      car.lateralVel = 0;
      car.relYaw = 0;
      car.gear = 1;
      car.rpm = 3800;
    }
    return;
  }

  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

  if (controlsLocked) {
    car.speedKmh = 0;
    car.gear = 1;
    car.lateralVel = clamp(car.lateralVel, -16.5, 16.5) * 0.0;
    car.latG = 0;
    car.longG = 0;
    const revIdle = 3800 + Math.sin(nowMs * 0.018) * 180;
    car.rpm += (revIdle + throttleIn * 7400 - car.rpm) * Math.min(1, safeDt * 14);
    car.turboBoostBar = clamp(throttleIn * 1.35, 0.0, 2.4);
    car.selfAligningTorque = 0.0;
    car.chassisPitchRad += (0.0 - finiteOr(car.chassisPitchRad, 0)) * Math.min(1, safeDt * 12);
    car.chassisRollRad += (0.0 - finiteOr(car.chassisRollRad, 0)) * Math.min(1, safeDt * 12);
    car.wheelCompression[0] = 0.25;
    car.wheelCompression[1] = 0.25;
    car.wheelCompression[2] = 0.25;
    car.wheelCompression[3] = 0.25;
    car.skidIntensity = 0;
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
    car.lateralVel = 0;
    car.latG = 0;
    car.longG = 0;
    car.chassisPitchRad += (0.0 - finiteOr(car.chassisPitchRad, 0)) * Math.min(1, safeDt * 14);
    car.chassisRollRad += (0.0 - finiteOr(car.chassisRollRad, 0)) * Math.min(1, safeDt * 14);
    // Quick-lift pit jacks droop all 4 suspension corners smoothly to 0.0 when car is lifted!
    const jackDroop = clamp(1.0 - finiteOr(car.pitJackLift, 0.0), 0.0, 1.0) * 0.25;
    car.wheelCompression[0] = jackDroop;
    car.wheelCompression[1] = jackDroop;
    car.wheelCompression[2] = jackDroop;
    car.wheelCompression[3] = jackDroop;
    car.skidIntensity = 0;
    car.drsActive = false;
    return;
  }

  const isClassic = mode === '1982_ORIGINAL';
  const wearFuelMult = isClassic
    ? 0.0
    : (PRO_2026_LENGTHS[raceLengthId]?.wearFuelMult ?? 1.0);

  // Optional Career Mode R&D Parts & Garage Setup modifiers (defaults to neutral 1.0 / 0.0)
  const mods = (!isClassic && (
    car.perfMods ||
    car.physicsModifiers ||
    (car.isPlayer ? (ctx.perfMods || ctx.physicsModifiers) : null)
  )) || null;
  const modPower = mods ? clamp(finiteOr(mods.powerMult, 1.0), 0.75, 1.25) : 1.0;
  const modTopKmh = mods ? clamp(finiteOr(mods.topSpeedBonusKmh, 0.0), -15.0, 25.0) : 0.0;
  const modAeroGrip = mods ? clamp(finiteOr(mods.aeroGripMult, 1.0), 0.80, 1.25) : 1.0;
  const modBrake = mods ? clamp(finiteOr(mods.brakeMult, 1.0), 0.80, 1.25) : 1.0;
  const modAgility = mods ? clamp(finiteOr(mods.agilityMult, 1.0), 0.85, 1.20) : 1.0;
  const modTireWear = mods ? clamp(finiteOr(mods.tireWearMult, 1.0), 0.50, 1.50) : 1.0;
  const modFuelLoad = mods ? clamp(finiteOr(mods.fuelLoadMult, 1.0), 0.65, 1.40) : 1.0;
  const modDrsBonusKmh = mods ? clamp(finiteOr(mods.drsBonusKmh, 0.0), 0.0, 8.0) : 0.0;
  const modThermalWindowC = mods ? clamp(finiteOr(mods.thermalWindowBonusC, 0.0), 0.0, 12.0) : 0.0;
  const modWetGripBonus = mods ? clamp(finiteOr(mods.wetGripBonus, 0.0), 0.0, 0.12) : 0.0;

  // Optional Corner-Entry Braking Assist ('OFF' | 'LOW' | 'MEDIUM' | 'HIGH') from Controls / Settings
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
  const brakingAssistMode = (
    rawBrakingAssist === 'LOW' ||
    rawBrakingAssist === 'MEDIUM' ||
    rawBrakingAssist === 'HIGH'
  )
    ? rawBrakingAssist
    : 'OFF';

  const frame = track.sampleAt(car.s, car.lateralOffset);
  const mPerGameM = Math.max(0.5, finiteOr(track.realMetersPerGameMeter, REAL_METERS_PER_GAME_METER));
  const rawCurvature = finiteOr(frame?.curvature, 0.0);
  // Clamp residual straightaway spline micro-curvature strictly to 0.0 for zero phantom pull!
  const curvature = (car.inPitLane || Math.abs(rawCurvature) < 0.018) ? 0.0 : rawCurvature;
  const speedMps = car.speedKmh / 3.6;

  // --------------------------------------------------------------------------
  // 1. SURFACE DETECTION (ASPHALT, RED/WHITE CURBS, GREEN GRASS, PUDDLES)
  // --------------------------------------------------------------------------
  const absLat = Math.abs(car.lateralOffset);
  if (!car.inPitLane) {
    car.onCurb = absLat >= ROAD_HALF_WIDTH - 0.35 && absLat <= ROAD_HALF_WIDTH + CURB_WIDTH + 0.15;
    car.onGrass = absLat > ROAD_HALF_WIDTH + CURB_WIDTH + 0.15;
  } else {
    car.onCurb = false;
    car.onGrass = false;
  }

  // NEON_NIGHT uses subtle surface sheen purely for floodlit reflections (rainIntensity = 0),
  // so treat dry night races as 0.0 standing water while keeping cool night asphalt temps!
  const isDryNight = weather?.currentRegimeId === 'NEON_NIGHT';
  const rawW = (isClassic || isDryNight || !weather)
    ? 0.0
    : clamp(finiteOr(weather.getMoistureAt(curvature, car.lateralOffset), 0.0), 0.0, 1.0);
  const localW = rawW;

  // Standing Puddle check
  let hittingPuddle = false;
  if (!car.inPitLane && Array.isArray(track.puddles)) {
    const puddlesAllowed = isClassic ? !isQualifying : localW > 0.24;
    if (puddlesAllowed) {
      for (const p of track.puddles) {
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
  }

  if (hittingPuddle) {
    if (isClassic) {
      car.speedKmh = Math.max(95, car.speedKmh - 92.0 * safeDt);
      if (car.aquaplaneTimer <= 0 && callbacks.onHydroplane) callbacks.onHydroplane(car);
      car.aquaplaneTimer = 0.18;
    } else {
      const comp = TIRE_COMPOUNDS[car.compound] || TIRE_COMPOUNDS.SOFT;
      if (!comp.preventsHydroplane) {
        const hydroSpeedThreshold = comp.isWetTire ? 242.0 : 192.0;
        const waterDragRate = comp.isWetTire ? 14.0 : 32.0;
        if (car.speedKmh > hydroSpeedThreshold) {
          if (car.aquaplaneTimer <= 0 && callbacks.onHydroplane) callbacks.onHydroplane(car);
          car.aquaplaneTimer = comp.isWetTire ? 0.22 : 0.42;
        }
        car.speedKmh = Math.max(85, car.speedKmh - waterDragRate * safeDt);
      }
    }
  }
  if (car.aquaplaneTimer > 0) {
    car.aquaplaneTimer = Math.max(0, car.aquaplaneTimer - safeDt);
  }

  // --------------------------------------------------------------------------
  // 2. PACEJKA COMBINED-SLIP 4-CORNER TIRE MODEL, SURFACE/CORE THERMALS & CLIFF
  // --------------------------------------------------------------------------
  let muLat = 1.12;
  let muLong = 1.12;
  let frontSlipAngleRad = 0.0;
  let rearSlipAngleRad = 0.0;

  if (!isClassic) {
    const comp = TIRE_COMPOUNDS[car.compound] || TIRE_COMPOUNDS.SOFT;
    let baseMu = comp.baseGrip;

    if (!comp.isWetTire) {
      // Dry slicks maintain 100% bite on dry/trace moisture (<5%), then lose grip rapidly on wet film
      const effWet = Math.max(0, (localW - 0.04) / 0.96);
      baseMu = comp.baseGrip * (1.0 - 0.56 * effWet);
    } else if (comp.id === 'INTERMEDIATE') {
      if (localW < 0.08) {
        baseMu = 0.89; // Squirming tread blocks on bone-dry tarmac
      } else if (localW <= 0.58) {
        baseMu = 1.06; // Sweet spot in light-to-moderate rain & drying groove!
      } else {
        baseMu = 0.92 - (localW - 0.58) * 0.24;
      }
    } else if (comp.id === 'FULL_WET') {
      if (localW < 0.18) {
        baseMu = 0.82;
      } else {
        baseMu = 0.99 + Math.min(0.08, Math.max(0, localW - 0.42) * 0.20);
      }
    }

    // Dynamic 4-corner vertical load transfer under braking, acceleration, aero & cornering
    const aeroLoadPerCorner = 0.09 * Math.min(1.25, (speedMps / 82.0) * (speedMps / 82.0));
    const longTransfer = clamp((brakeIn - throttleIn * 0.62) * 0.095, -0.095, 0.12);
    const latTransfer = clamp((curvature * (speedMps / 68.0) + car.latG * 0.14) * 0.11, -0.13, 0.13);
    const loads = {
      FL: Math.max(0.07, 0.25 + aeroLoadPerCorner * 0.42 + longTransfer + latTransfer),
      FR: Math.max(0.07, 0.25 + aeroLoadPerCorner * 0.42 + longTransfer - latTransfer),
      RL: Math.max(0.07, 0.25 + aeroLoadPerCorner * 0.58 - longTransfer + latTransfer),
      RR: Math.max(0.07, 0.25 + aeroLoadPerCorner * 0.58 - longTransfer - latTransfer),
    };

    // Estimate front & rear axle slip angles + longitudinal wheelspin / brake lockup slip ratios
    const vSafe = Math.max(6.0, speedMps);
    const estSteerRad = steerIn * 0.26 / (1.0 + 0.00015 * speedMps * speedMps);
    const bodyBetaRad = clamp(car.lateralVel / vSafe, -0.32, 0.32);
    frontSlipAngleRad = clamp(estSteerRad - bodyBetaRad * 0.52, -0.30, 0.30);
    const lowGearTorqueExcess = (car.gear <= 3 && throttleIn > 0.72)
      ? (throttleIn - 0.68) * (4 - car.gear) * (0.045 + localW * 0.085)
      : 0.0;
    rearSlipAngleRad = clamp(
      -bodyBetaRad * 0.48 + Math.sign(curvature || steerIn || 0) * lowGearTorqueExcess * 0.45,
      -0.34,
      0.34
    );

    const ambientTemp = finiteOr(weather?.ambientTemp, 26.0);
    const optMin = comp.optTempMin - modThermalWindowC * 0.5; // Optimal dry window ~88°C-106°C
    const optMax = comp.optTempMax + modThermalWindowC * 0.5;

    let sumLatMu = 0;
    let sumLongMu = 0;
    let anyPunctured = false;
    const corners = ['FL', 'FR', 'RL', 'RR'];

    for (let idx = 0; idx < 4; idx++) {
      const cKey = corners[idx];
      const isFront = idx < 2;
      const t = car.tires[cKey];
      t.load = loads[cKey];

      // Per-corner Pacejka slip angle (alpha) & longitudinal slip ratio (kappa)
      const cornerAlpha = isFront ? frontSlipAngleRad : rearSlipAngleRad;
      const brakeLockSlip = brakeIn > 0.72
        ? (brakeIn - 0.72) * (isFront ? 0.36 : 0.22) * (1.0 + localW * 0.55) / Math.max(0.45, t.load * 3.6)
        : 0.0;
      const wheelspinSlip = !isFront ? lowGearTorqueExcess / Math.max(0.45, t.load * 3.4) : 0.0;
      const cornerKappa = clamp(wheelspinSlip - brakeLockSlip, -0.45, 0.45);
      t.slipAngleRad = cornerAlpha;
      t.slipRatio = cornerKappa;

      // Pacejka Magic Formula combined-slip friction power
      const normAlpha = Math.abs(cornerAlpha) / 0.14;
      const normKappa = Math.abs(cornerKappa) / 0.15;
      const combinedSlipNorm = Math.hypot(normAlpha, normKappa);
      const pacejkaUtil = Math.abs(pacejkaMagic(Math.min(1.8, combinedSlipNorm * 0.12), 10.2, 1.38, -0.52));

      // Dual-Layer Tire Thermal Solver:
      // 1) Flash Surface Temperature (fast ~0.85s response to cornering scrub, lockups, wheelspin & wet spray)
      const prevCore = finiteOr(t.coreTemp, finiteOr(t.temp, 92.0));
      const prevSurf = finiteOr(t.surfaceTemp, prevCore);

      const cornerFrictionHeat =
        (Math.abs(curvature) * speedMps * 0.46 +
          combinedSlipNorm * speedMps * 0.32 +
          Math.abs(brakeLockSlip) * 105.0 +
          wheelspinSlip * 92.0 +
          car.skidIntensity * 15.0) *
        (t.load * 3.5);
      const dryGroovedPenalty = comp.isWetTire && localW < 0.08
        ? (comp.id === 'FULL_WET' ? 32.0 : 23.0)
        : 0.0;
      const wetSprayCooling = localW * (34.0 + speedMps * 0.18);
      const airflowCooling = Math.max(0, speedMps - 35.0) * 0.085;

      const targetSurfTemp =
        ambientTemp + 54.0 + cornerFrictionHeat + dryGroovedPenalty - wetSprayCooling - airflowCooling;
      t.surfaceTemp = clamp(prevSurf + (targetSurfTemp - prevSurf) * Math.min(1, safeDt * 1.25), 18.0, 158.0);

      // 2) Bulk Carcass Core Temperature (slow ~8.5s response to rolling hysteresis, brake disc heat & conduction)
      const carcassHysteresis = (speedMps * 0.26 + brakeIn * speedMps * 0.19 + throttleIn * 7.5) * (t.load * 3.6);
      const targetCoreTemp =
        ambientTemp + 50.0 + carcassHysteresis + (t.surfaceTemp - prevCore) * 0.42 - localW * 24.0;
      t.coreTemp = clamp(prevCore + (targetCoreTemp - prevCore) * Math.min(1, safeDt * 0.14), 20.0, 145.0);

      // Weighted effective contact-patch temperature (optimal grip window: 88°C-106°C on dry slicks)
      t.temp = t.surfaceTemp * 0.58 + t.coreTemp * 0.42;
      car.tireTempsC[idx] = t.temp;
      car.tireCoreTempsC[idx] = t.coreTemp;

      let tempMult = 1.0;
      if (t.temp < optMin) {
        tempMult = Math.max(0.91, 1.0 - (optMin - t.temp) * 0.0030);
      } else if (t.temp > optMax) {
        tempMult = Math.max(0.86, 1.0 - (t.temp - optMax) * 0.0042);
      } else {
        // Subtle +1.5% peak bite right in the heart of the 88°C-106°C sweet spot!
        const midTemp = (optMin + optMax) * 0.5;
        const halfSpan = Math.max(4.0, (optMax - optMin) * 0.5);
        tempMult = 1.0 + 0.015 * (1.0 - Math.abs(t.temp - midTemp) / halfSpan);
      }

      // Progressive tread degradation driven by combined Pacejka slip & thermal blistering
      if (!car.inPitLane && speedMps > 2.0) {
        const blisterPenalty = t.surfaceTemp > optMax + 10.0 ? 1.35 : 1.0;
        let wearStep =
          0.00108 *
          comp.wearRate *
          wearFuelMult *
          modTireWear *
          blisterPenalty *
          (t.load * 3.8) *
          (0.52 + Math.abs(curvature) * 1.05 + pacejkaUtil * 0.35 + car.skidIntensity * 1.20) *
          (speedMps / 68.0) *
          safeDt;

        if (comp.isWetTire && localW < 0.08) wearStep *= 2.6;
        if (car.damage.suspension > 0.15 && car.damage.damagedCorner === cKey) {
          wearStep *= 1.0 + car.damage.suspension * 1.15;
        }

        t.life = Math.max(0.0, finiteOr(t.life, 1.0) - wearStep);
      }

      // Authentic Pirelli 25% Tire Cliff & Puncture Risk
      let wearMult = 1.0;
      if (t.life >= 0.25) {
        wearMult = 0.93 + 0.07 * ((t.life - 0.25) / 0.75);
      } else {
        const ratio = Math.max(0, t.life / 0.25);
        wearMult = 0.45 + 0.48 * Math.pow(ratio, 2.15);
        if (!t.punctured && ((car.onCurb && Math.random() < (1.0 - ratio) * 0.22 * safeDt) || t.life <= 0.002)) {
          t.punctured = true;
          car.damage.hasPuncture = true;
          if (callbacks.onPuncture) callbacks.onPuncture(car, cKey);
        }
      }

      if (t.punctured) {
        anyPunctured = true;
        wearMult = 0.28;
      }

      // Friction Ellipse Coupling: heavy longitudinal lockup/wheelspin trims available lateral grip slightly
      const ellipseLatScale = clamp(1.0 - Math.max(0.0, normKappa - 0.55) * 0.18, 0.80, 1.0);
      const ellipseLongScale = clamp(1.0 - Math.max(0.0, normAlpha - 0.65) * 0.14, 0.84, 1.0);
      const cornerPeakMu = baseMu * tempMult * wearMult;

      sumLatMu += cornerPeakMu * ellipseLatScale;
      sumLongMu += cornerPeakMu * ellipseLongScale;
    }

    car.damage.hasPuncture = anyPunctured;
    const wetMasteryBoost = localW > 0.12 ? modWetGripBonus : 0.0;
    muLat = (sumLatMu * 0.25 + wetMasteryBoost) * modAeroGrip;
    muLong = sumLongMu * 0.25 + wetMasteryBoost;
  } else {
    for (let i = 0; i < 4; i++) {
      car.tireTempsC[i] = 96.0;
      car.tireCoreTempsC[i] = 96.0;
    }
  }

  if (car.onGrass) {
    muLat = Math.min(muLat, 0.44);
    muLong = Math.min(muLong, 0.54);
  } else if (car.onCurb) {
    // Tactile FIA apex kerbs: high dry mechanical grip (0.985x) so clipping kerbs never causes unfair spin-outs
    muLat *= localW > 0.32 ? 0.94 : 0.985;
  }

  // --------------------------------------------------------------------------
  // 3. SEAMLESS 8-SPEED AUTOMATIC / MANUAL GEARBOX, TORQUE & AERO DRAG
  // --------------------------------------------------------------------------
  if (car.shiftCooldown > 0) car.shiftCooldown = Math.max(0, car.shiftCooldown - safeDt);
  if (car.revBlipTimer > 0) car.revBlipTimer = Math.max(0, car.revBlipTimer - safeDt);
  if (car.cornerExitTorqueTimer > 0) {
    car.cornerExitTorqueTimer = Math.max(0, finiteOr(car.cornerExitTorqueTimer, 0) - safeDt);
  }

  const is8Speed = car.gearboxMode === 'AUTO_8SPD' || car.gearboxMode === 'MANUAL_8SPD';
  const is6Speed = car.gearboxMode === 'PRO_6SPD';
  const maxTopGear = is8Speed ? 8 : (is6Speed ? 6 : 2);
  car.gear = clamp(Math.round(finiteOr(car.gear, 1)), 1, maxTopGear);

  let gearTopKmh = 316.0;
  let torqueMult = 1.0;

  if (is8Speed) {
    const gIdx = car.gear - 1;
    gearTopKmh = EIGHT_SPEED_TOPS[gIdx];
    const prevTop = gIdx > 0 ? EIGHT_SPEED_TOPS[gIdx - 1] : 0;
    // Hybrid MGU-K + V6/V10 torque curve across G1..G8 + post-downshift corner-exit response boost
    const exitPunch = car.cornerExitTorqueTimer > 0 ? 1.08 : 1.0;
    torqueMult = (1.38 - gIdx * 0.045) * exitPunch;
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
    // Classic 1982 Manual 2-Speed: LOW (172 km/h) / HIGH (308 km/h)
    if (car.gear === 1) {
      gearTopKmh = 172.0;
      torqueMult = 1.38;
    } else {
      gearTopKmh = 308.0;
      torqueMult = car.speedKmh < 130 ? 0.58 : 1.02;
    }
  }

  // Exhilarating Slipstream Wake Drafting (within 48m) & DRS Slingshot Momentum Reservoir:
  // If ctx.allCars is provided, also detect extended 48m wake directly; shape partial wake factors
  // and sustain a 1.6s slingshot reservoir when pulling out laterally to pass!
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
    car.towReservoir = Math.min(1.15, car.towReservoir + (shapedWake - car.towReservoir) * Math.min(1.0, safeDt * 7.5));
  } else if (throttleIn > 0.60 && brakeIn < 0.08 && car.speedKmh > 170.0 && !car.inPitLane) {
    // Carry slingshot momentum for ~1.6s after pulling out of the wake to complete the pass!
    car.towReservoir = Math.max(0.0, car.towReservoir - safeDt * 0.62);
  } else {
    car.towReservoir = Math.max(0.0, car.towReservoir - safeDt * 2.8);
  }
  const activeTow = Math.max(shapedWake, car.towReservoir);
  if (activeTow > 0.16 && !car.inPitLane && car.speedKmh > 140.0) {
    car.inSlipstream = true;
  }

  // Slipstream / DRS tow reduces aero drag and raises top speed by +15..18 km/h (up to 331-334 km/h)!
  const rearWingLossKmh = isClassic ? 0.0 : clamp(finiteOr(car.damage?.rearWing, 0), 0, 1) * 22.0;
  const slingshotPulloutBonus = (car.towReservoir > shapedWake + 0.08 && Math.abs(steerIn) > 0.05) ? 2.2 : 0.0;
  const towGainKmh = 15.6 + slingshotPulloutBonus + modDrsBonusKmh;
  const slipBoostKmh = car.gear >= maxTopGear - 1 ? activeTow * towGainKmh : activeTow * 6.5;
  const careerCapBonusKmh = car.gear >= maxTopGear ? modTopKmh : modTopKmh * 0.25;
  const aeroTopKmh = Math.max(
    120.0,
    (is8Speed ? 316.0 : (is6Speed ? 312.0 : 308.0)) + activeTow * towGainKmh + modTopKmh + 16.0 - rearWingLossKmh
  );
  const effectiveGearCapKmh = Math.max(85.0, gearTopKmh + slipBoostKmh + careerCapBonusKmh - rearWingLossKmh);

  // Fuel mass & consumption
  let fuelMassMult = 1.0;
  if (!isClassic) {
    fuelMassMult = 1.0 / (1.0 + Math.max(0, car.fuelLaps) * 0.0040 * modFuelLoad);
    if (!car.inPitLane && throttleIn > 0.02 && speedMps > 1.0) {
      const lapsPerGameMeter = 1.0 / TRACK_GAME_LENGTH;
      const dsEst = (speedMps * safeDt) / mPerGameM;
      car.fuelLaps = Math.max(0, car.fuelLaps - dsEst * lapsPerGameMeter * wearFuelMult * (0.78 + 0.30 * throttleIn));
    }
  }

  // Longitudinal Acceleration & Smooth Asymptotic Aero Drag Equilibrium (Zero Limiter Jerk!)
  let accelMps2 = 0.0;
  let effectiveCap = effectiveGearCapKmh;
  let hardSpeedLimited = false;

  if (!isClassic && car.fuelLaps <= 0.001) {
    effectiveCap = Math.min(effectiveCap, 88.0);
    hardSpeedLimited = true;
  }
  if (!isClassic && car.damage.hasPuncture) {
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

  // Optional Corner-Entry Braking Assist ('LOW' | 'MEDIUM' | 'HIGH'): gently blends braking when way above apex speed
  let effThrottleIn = throttleIn;
  let effBrakeIn = brakeIn;
  if (brakingAssistMode !== 'OFF' && !car.inPitLane && car.speedKmh > 88.0) {
    const isHighAssist = brakingAssistMode === 'HIGH';
    const isMedAssist = brakingAssistMode === 'MEDIUM';
    const minTriggerK = isHighAssist ? 0.22 : (isMedAssist ? 0.27 : 0.32);
    const decelBudget = (isHighAssist ? 24.0 : (isMedAssist ? 26.5 : 29.0)) * clamp(muLong * modBrake, 0.45, 1.20);
    const overMarginKmh = isHighAssist ? 5.0 : (isMedAssist ? 9.5 : 14.0);
    const gripApexScale = Math.sqrt(clamp(muLat / 1.04, 0.38, 1.12));
    const lookDistancesM = [0.0, 22.0, 48.0, 82.0, 118.0];
    let minAllowKmh = 400.0;

    for (let i = 0; i < lookDistancesM.length; i++) {
      const distRealM = lookDistancesM[i];
      const sampleS = wrapTrackS(car.s + distRealM / mPerGameM);
      const rawK = distRealM === 0.0
        ? rawCurvature
        : (typeof track.getPhysicsCurvature === 'function'
          ? finiteOr(track.getPhysicsCurvature(sampleS), 0.0)
          : finiteOr(track.sampleAt(sampleS, 0)?.curvature, 0.0));
      const absK = Math.abs(rawK);
      if (absK < minTriggerK) continue;

      const normK = clamp((absK - 0.035) / 0.88, 0.0, 1.06);
      const apexKmh = clamp((332.0 - 210.0 * Math.pow(normK, 0.91)) * gripApexScale, 78.0, 332.0);
      const apexMps = apexKmh / 3.6;
      const allowKmh = Math.sqrt(apexMps * apexMps + 2.0 * decelBudget * distRealM) * 3.6;
      if (allowKmh < minAllowKmh) minAllowKmh = allowKmh;
    }

    const overApexKmh = car.speedKmh - (minAllowKmh + overMarginKmh);
    if (overApexKmh > 0.0) {
      const maxAssistBrake = isHighAssist ? 0.84 : (isMedAssist ? 0.70 : 0.56);
      const assistGain = isHighAssist ? 34.0 : (isMedAssist ? 39.0 : 44.0);
      const assistBrake = clamp(overApexKmh / assistGain, 0.06, maxAssistBrake);
      effBrakeIn = Math.max(effBrakeIn, assistBrake);
      effThrottleIn = effThrottleIn * clamp(1.0 - assistBrake * 2.1, 0.0, 1.0);
    }
  }

  // Live DRS wing-flap & replay telemetry state (dry straightaways in slipstream tow or Qualifying open-DRS)
  car.drsActive =
    !isClassic &&
    !car.inPitLane &&
    !vscActive &&
    !hardSpeedLimited &&
    localW < 0.15 &&
    effThrottleIn > 0.72 &&
    effBrakeIn < 0.05 &&
    Math.abs(curvature) < 0.06 &&
    Math.abs(steerIn) < 0.10 &&
    car.speedKmh > 195.0 &&
    (car.inSlipstream || car.slipstreamFactor > 0.12 || (!!isQualifying && car.speedKmh > 235.0));

  if (effThrottleIn > 0.01) {
    if (car.speedKmh < effectiveCap) {
      // True F1 aerodynamic drag envelope referenced against high-speed aero ceiling
      // so lower gears (G1..G7) pull cleanly all the way to ~12,750 RPM!
      const aeroRatio = car.speedKmh / aeroTopKmh;
      const aeroHeadroom = Math.max(0.08, 1.0 - Math.pow(aeroRatio, 2.25));

      // Mechanical rear-tire traction limit at low speed + Venturi ground-effect downforce boost at mid speed
      // + exhilarating aero-tow closing surge when drafting in slipstream wake!
      const downforceTraction = 0.88 + 0.20 * Math.sin(Math.min(1.0, car.speedKmh / 210.0) * Math.PI);
      const slipstreamSurge = (car.speedKmh > 145.0 && activeTow > 0.05) ? (1.0 + activeTow * 0.22) : 1.0;
      let rawDrive =
        effThrottleIn *
        14.0 *
        torqueMult *
        modPower *
        muLong *
        fuelMassMult *
        downforceTraction *
        aeroHeadroom *
        slipstreamSurge;

      // Smooth asymptotic soft-taper only when approaching a non-upshifting ceiling (G8, Manual cap, VSC, Pit)
      const willAutoUpshift = car.gearboxMode === 'AUTO_8SPD' && car.gear < 8 && !hardSpeedLimited;
      if (!willAutoUpshift) {
        const capMargin = effectiveCap - car.speedKmh;
        if (capMargin < 5.5) {
          rawDrive *= clamp(capMargin / 5.5, 0.0, 1.0);
        }
      }
      accelMps2 += rawDrive;
    } else {
      // Smooth aerodynamic drag equilibrium above cap (e.g. exiting slipstream 331 -> 316 km/h, or VSC delta)
      const over = car.speedKmh - effectiveCap;
      const dragRate = hardSpeedLimited
        ? Math.min(10.5, 1.8 + over * 0.85)
        : Math.min(5.2, 0.45 + over * 0.28);
      accelMps2 -= dragRate;
    }
  } else {
    // Natural F1 engine braking + quadratic aerodynamic drag when lifting off throttle
    accelMps2 -= 2.6 + 0.00118 * speedMps * speedMps;
  }

  // Classic 1982 HIGH -> LOW over-rev engine brake above 172 km/h
  if (car.gear === 1 && car.gearboxMode === 'CLASSIC_2SPD' && car.speedKmh > 173.0) {
    accelMps2 -= 16.5;
    car.overRevTimer = Math.max(car.overRevTimer, 0.12);
  }
  if (car.overRevTimer > 0) {
    car.overRevTimer = Math.max(0, car.overRevTimer - safeDt);
  }

  // Carbon-Ceramic F1 Braking (up to ~4.8G with high-speed aerodynamic downforce, smooth low-speed modulation)
  if (effBrakeIn > 0.01) {
    const aeroBrakeBoost = Math.min(1.0, (speedMps / 80.0) * (speedMps / 80.0));
    const brakePower = (31.5 + aeroBrakeBoost * 12.5) * modBrake * muLong * fuelMassMult;
    accelMps2 -= effBrakeIn * brakePower;
  }

  // Curb & Off-road Grass Drag (minimal drag on apex kerbs so corner-exit momentum stays crisp)
  if (car.onCurb) {
    accelMps2 -= 0.42;
  } else if (car.onGrass) {
    accelMps2 -= 6.0 + (car.speedKmh > 135 ? (car.speedKmh - 135) * 0.15 : 0);
  }

  const nextSpeedMps = Math.max(0, speedMps + accelMps2 * safeDt);
  car.speedKmh = nextSpeedMps * 3.6;
  car.longG = accelMps2 / 9.81;

  // --------------------------------------------------------------------------
  // AUTOMATIC F1 SEAMLESS GEAR SELECTION (AUTO_8SPD) WITH CORNER HYSTERESIS
  // --------------------------------------------------------------------------
  if (car.gearboxMode === 'AUTO_8SPD' && car.shiftCooldown <= 0) {
    if (car.inPitLane && (car.s >= PIT_LANE_CONFIG.speedLimitLineS || car.s < PIT_LANE_CONFIG.mergeStartS)) {
      // Dedicated Pit-Lane Limiter Map (80 km/h): sequential downshifts into G2, zero hunting!
      if (car.gear > 2 && car.speedKmh <= Math.max(96.0, EIGHT_SPEED_DOWNSHIFT[car.gear - 2])) {
        car.gear -= 1;
        car.shiftCooldown = 0.11;
        car.revBlipTimer = 0.11;
        if (callbacks.onGearShift) callbacks.onGearShift(car, car.gear, 'DOWN');
      } else if (car.gear === 2 && car.speedKmh <= 50.0) {
        car.gear = 1;
        car.shiftCooldown = 0.14;
        if (callbacks.onGearShift) callbacks.onGearShift(car, 1, 'DOWN');
      } else if (car.gear === 1 && throttleIn > 0.18 && car.speedKmh >= 72.0) {
        car.gear = 2;
        car.shiftCooldown = 0.18;
        if (callbacks.onGearShift) callbacks.onGearShift(car, 2, 'UP');
      }
    } else {
      // Mid-apex hold: prevent short-shifting when turning hard on partial throttle.
      // Braking downshift bias: under heavy braking, downshift slightly earlier into the 10,800-13,800 RPM peak torque band!
      const cornerHoldOffset = (Math.abs(steerIn) > 0.62 && effThrottleIn < 0.65) ? 3.0 : 0.0;
      const brakeDownshiftBias = effBrakeIn > 0.25 ? effBrakeIn * 6.5 : 0.0;
      const upshiftSpd = car.gear < 8 ? EIGHT_SPEED_UPSHIFT[car.gear - 1] + cornerHoldOffset : Infinity;
      const downshiftSpd = car.gear > 1 ? EIGHT_SPEED_DOWNSHIFT[car.gear - 2] + brakeDownshiftBias : -1;

      if (car.gear < 8 && effThrottleIn > 0.16 && effBrakeIn < 0.20 && car.speedKmh >= upshiftSpd) {
        car.gear += 1;
        car.shiftCooldown = 0.15;
        if (callbacks.onGearShift) callbacks.onGearShift(car, car.gear, 'UP');
      } else if (car.gear > 1 && car.speedKmh <= downshiftSpd) {
        car.gear -= 1;
        car.shiftCooldown = 0.11;
        car.revBlipTimer = 0.125;
        car.cornerExitTorqueTimer = 0.28;
        if (callbacks.onGearShift) callbacks.onGearShift(car, car.gear, 'DOWN');
        if (car.speedKmh > 115 && effBrakeIn > 0.25 && callbacks.onBackfire) {
          callbacks.onBackfire(car);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // REALISTIC MECHANICAL GEAR-RATIO SAWTOOTH RPM SYNTHESIS (3,800 -> 13,800 RPM)
  // --------------------------------------------------------------------------
  let targetRpm;
  if (car.overRevTimer > 0) {
    targetRpm = 13650 + Math.sin(nowMs * 0.12) * 240;
  } else if (is8Speed) {
    const gIdx = clamp(car.gear - 1, 0, 7);
    const gTop = EIGHT_SPEED_TOPS[gIdx];
    let mechRpm;

    if (gIdx === 0) {
      // G1: Launch clutch engages around 3,800..6,500 RPM then sweeps cleanly to ~12,720 RPM at upshift
      const wheelRpm = (car.speedKmh / gTop) * F1_SHIFT_PEAK_RPM;
      const launchClutchFloor = 3800 + throttleIn * 2700;
      mechRpm = Math.max(launchClutchFloor, wheelRpm);
    } else {
      // G2..G8: Crisp mechanical gear-ratio sawtooth from EIGHT_SPEED_ENTRY_RPM (8,880..9,980)
      // up to ~12,720-12,840 RPM at gTop, and up to ~13,350 RPM in G8 DRS/Slipstream tow!
      const vEntry = EIGHT_SPEED_UPSHIFT[gIdx - 1];
      const entryRpm = EIGHT_SPEED_ENTRY_RPM[gIdx];
      const peakRpm = gIdx === 7 ? F1_TOP_GEAR_RPM : F1_SHIFT_PEAK_RPM;
      if (car.speedKmh >= gTop) {
        mechRpm = peakRpm + (car.speedKmh - gTop) * 24.0;
      } else if (car.speedKmh >= vEntry) {
        const span = Math.max(8.0, gTop - vEntry);
        mechRpm = entryRpm + ((car.speedKmh - vEntry) / span) * (peakRpm - entryRpm);
      } else {
        // True mechanical gear-ratio RPM during corner braking & apex rotation (keeps revs in 9,400-11,400 RPM)
        const directWheelRpm = (car.speedKmh / gTop) * peakRpm;
        const entryMapRpm = 3800 + (car.speedKmh / Math.max(20.0, vEntry)) * (entryRpm - 3800);
        mechRpm = Math.max(entryMapRpm, directWheelRpm * 0.96);
      }
    }

    // Crisp drive-by-wire throttle blip on corner downshifts into peak torque band (10,800-13,800 RPM)!
    const blipEnv = car.revBlipTimer > 0 ? Math.sin((car.revBlipTimer / 0.125) * Math.PI) : 0.0;
    const blipBoost = blipEnv * (1620 + effBrakeIn * 420);

    // Gentle high-RPM soft flutter only when riding top-gear / limiter ceiling
    const atCeiling = car.speedKmh >= effectiveCap - 1.2 && throttleIn > 0.5 && (car.gear === 8 || car.gearboxMode !== 'AUTO_8SPD' || hardSpeedLimited);
    const limiterFlutter = atCeiling ? Math.sin(nowMs * 0.10) * 155 : 0;

    targetRpm = clamp(mechRpm + blipBoost + limiterFlutter, 3600, 13800);
  } else if (is6Speed) {
    const gIdx = clamp(car.gear - 1, 0, 5);
    const gTop = SIX_SPEED_TOPS[gIdx];
    const vEntry = gIdx > 0 ? SIX_SPEED_TOPS[gIdx - 1] * 0.94 : 0;
    const entryRpm = SIX_SPEED_ENTRY_RPM[gIdx];
    const mechRpm = gIdx === 0
      ? Math.max(3800 + throttleIn * 2600, (car.speedKmh / gTop) * F1_TOP_GEAR_RPM)
      : (car.speedKmh >= vEntry
        ? entryRpm + ((car.speedKmh - vEntry) / Math.max(8, gTop - vEntry)) * (F1_TOP_GEAR_RPM - entryRpm)
        : 3800 + (car.speedKmh / Math.max(20, vEntry)) * (entryRpm - 3800));
    const blipBoost = car.revBlipTimer > 0 ? Math.sin((car.revBlipTimer / 0.125) * Math.PI) * 1550 : 0;
    targetRpm = clamp(mechRpm + blipBoost, 3600, 13650);
  } else {
    const normGearRatio = Math.min(1.04, car.speedKmh / Math.max(60, gearTopKmh));
    const revBounce = car.speedKmh >= gearTopKmh - 1.0 && throttleIn > 0.5
      ? Math.sin(nowMs * 0.09) * 280
      : 0;
    targetRpm = clamp(3600 + normGearRatio * 9150 + revBounce, 3600, 13400);
  }

  // Instantaneous rev-match blip snap on downshifts; ~45ms seamless dog-ring drop on upshifts
  const rpmRate = car.revBlipTimer > 0.02
    ? 78.0
    : ((targetRpm < car.rpm && car.shiftCooldown > 0.04) ? 62.0 : 52.0);
  car.rpm += (targetRpm - car.rpm) * Math.min(1, safeDt * rpmRate);

  // Split-Turbo + MGU-H Boost Gauge (0.0..2.4 bar) & Hybrid MGU-K ERS State (0.0..1.0)
  const exhaustEnthalpy = clamp((car.rpm - 4100.0) / 8300.0, 0.0, 1.06);
  const antiLagFloorBar = car.revBlipTimer > 0.0 ? 0.62 : (effThrottleIn > 0.05 ? 0.18 : 0.0);
  const targetBoostBar = clamp(Math.max(antiLagFloorBar, effThrottleIn * exhaustEnthalpy * 2.40), 0.0, 2.40);
  const boostRate = targetBoostBar >= finiteOr(car.turboBoostBar, 0.0) ? 7.2 : 12.5;
  car.turboBoostBar = clamp(
    finiteOr(car.turboBoostBar, 0.0) + (targetBoostBar - finiteOr(car.turboBoostBar, 0.0)) * Math.min(1, safeDt * boostRate),
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
  // 4. PLANTED MOBILE STEERING, DOWNFORCE GRIP & ZERO STRAIGHTAWAY YANK
  // --------------------------------------------------------------------------
  const kv = 0.00015;
  const nonLinSteer = steerIn === 0.0
    ? 0.0
    : Math.sign(steerIn) * Math.pow(Math.abs(steerIn), 1.32) * (1.0 / (1.0 + kv * nextSpeedMps * nextSpeedMps));
  car.steerAngleRad = nonLinSteer * 0.46;

  const steerAuthority = car.aquaplaneTimer > 0 ? 0.35 : 1.0;
  const fastCornerFactor = clamp((car.speedKmh - 150) / 140, 0, 1);
  const frontAeroEff = isClassic ? 1.0 : (1.0 - clamp(finiteOr(car.damage?.frontWing, 0), 0, 1) * 0.40 * fastCornerFactor);

  // Low-speed Ackermann turn-in bite (< 135 km/h for hairpins/chicanes) + trail-braking front axle bite
  // + high-speed stability calm (> 250 km/h for 130R / Maggotts-Becketts / Fuji 100R) + slingshot pass authority!
  const hairpinTurnInBite = car.speedKmh < 138.0
    ? 1.0 + (1.0 - clamp(car.speedKmh / 138.0, 0.0, 1.0)) * 0.22
    : 1.0;
  const highSpeedStability = (car.isPlayer && car.speedKmh > 250.0 && Math.abs(curvature) < 0.22)
    ? 1.0 - clamp((car.speedKmh - 250.0) / 120.0, 0.0, 0.12)
    : 1.0;
  const slingshotSteerAuthority = (activeTow > 0.15 && Math.abs(steerIn) > 0.05 && Math.abs(curvature) < 0.15)
    ? 1.0 + activeTow * 0.14
    : 1.0;
  const trailBrakeBite = (effBrakeIn > 0.05 && car.speedKmh > 55 && car.speedKmh < 245)
    ? 1.0 + Math.min(0.08, effBrakeIn * 0.10)
    : 1.0;

  // Tire lateral grip factor (~1.00-1.03 on fresh dry slicks, softening progressively on wet/worn rubber)
  const tireSteerGrip = (isClassic ? 1.02 : clamp(0.68 + muLat * 0.30, 0.68, 1.04)) * modAgility;

  const suspensionPull = (!isClassic && car.damage?.suspension > 0.12)
    ? car.damage.suspension * 0.045 * (car.damage.suspensionBias || 1) * (nextSpeedMps / 55.0)
    : 0.0;

  const rearBrakeTwitch = (!isClassic && car.damage?.rearWing > 0.30 && brakeIn > 0.45)
    ? Math.sin(nowMs * 0.024) * car.damage.rearWing * 0.05 * brakeIn
    : 0.0;

  const baseSpeedSteerScale = Math.min(28.5, Math.max(13.5, nextSpeedMps * 0.60) * hairpinTurnInBite) * highSpeedStability;
  const steerLatRate =
    nonLinSteer *
    steerAuthority *
    frontAeroEff *
    trailBrakeBite *
    tireSteerGrip *
    slingshotSteerAuthority *
    baseSpeedSteerScale;

  const centrifugalPush = curvature === 0.0 ? 0.0 : -curvature * (nextSpeedMps * nextSpeedMps) * 0.00315;

  // High-speed Venturi aero downforce stabilizes fast sweepers (> 250 km/h); overspeeding tight hairpins drifts wide
  const aeroLatBonus = 1.0 + 0.32 * Math.min(1.15, (nextSpeedMps / 78.0) * (nextSpeedMps / 78.0)) * frontAeroEff;
  const latGripCeilingMps = muLat * 8.55 * aeroLatBonus;
  const rawCornerLoadMps = Math.abs(centrifugalPush) + Math.abs(steerLatRate) * 0.20;
  const slipExcessMps = Math.max(0, rawCornerLoadMps - latGripCeilingMps);
  const slipExcessG = slipExcessMps / 8.55;

  const understeerDrift = (slipExcessMps > 0 && curvature !== 0.0)
    ? Math.sign(centrifugalPush) * slipExcessMps * 0.78
    : 0.0;

  // Tactile FIA apex kerb hook: banked inside kerb gently keeps the car hooked toward the track without spin-out
  const curbApexHook = (car.onCurb && !car.onGrass && Math.abs(car.lateralOffset) > 1.0)
    ? -Math.sign(car.lateralOffset) * Math.min(1.35, nextSpeedMps * 0.020)
    : 0.0;

  const targetLatVel =
    steerLatRate +
    centrifugalPush +
    understeerDrift +
    curbApexHook +
    suspensionPull * 6.0 +
    rearBrakeTwitch * 5.0;

  // Crisp pneumatic-trail self-aligning torque:
  // - 100% zero straightaway drift when steerIn === 0 && curvature === 0
  // - Snappy counter-steer damping (24.5) when flicking L->R->L through chicanes or pulling out for a slingshot pass!
  const onStraightNeutral = steerIn === 0.0 && curvature === 0.0 && suspensionPull === 0.0 && rearBrakeTwitch === 0.0;
  const isCounterSteering = (targetLatVel * car.lateralVel) < -0.35 || (Math.abs(steerIn) < 0.05 && Math.abs(car.lateralVel) > 0.4);
  const latDampRate = onStraightNeutral
    ? 22.0
    : (isCounterSteering ? 24.5 : (activeTow > 0.15 ? 19.5 : 16.5));

  // Sanitize any external wheel-to-wheel collision impulse before integrating so sidepod rubs never glitch
  car.lateralVel = clamp(car.lateralVel, -16.5, 16.5);
  car.lateralVel += (targetLatVel - car.lateralVel) * Math.min(1, safeDt * latDampRate);

  if (onStraightNeutral && Math.abs(car.lateralVel) < 0.025) {
    car.lateralVel = 0.0;
  }

  let scrapedWall = false;
  if (car.inPitLane) {
    const targetPitLat = finiteOr(frame?.pitOffset, PIT_LANE_CONFIG.lateralOffset);
    car.lateralOffset += (targetPitLat - car.lateralOffset) * Math.min(1, safeDt * 6.5);
    car.relYaw = clamp((targetPitLat - car.lateralOffset) * 0.08, -0.30, 0.30);
  } else {
    car.lateralOffset += car.lateralVel * safeDt;

    // Ultra-clean, non-glitchy wheel-to-wheel sidepod rubbing restitution (if allCars available in ctx)
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
          // Smooth spring separation + low-bounce restitution (e = 0.16), preserving >95% forward speed!
          car.lateralOffset += pushSign * overlap * 0.52;
          const relLatV = car.lateralVel - finiteOr(other.lateralVel, 0.0);
          if (relLatV * pushSign < 0) {
            car.lateralVel = finiteOr(other.lateralVel, 0.0) - relLatV * 0.16 + pushSign * 1.15;
          }
          car.speedKmh = Math.max(45.0, car.speedKmh - overlap * 8.5 * safeDt);
        }
      }
    }

    // Pit-Wall & Armco Guardrail Clamping:
    // - Main Straight Pit Wall (s >= 948 || s <= 75): clamp right side at ROAD_HALF_WIDTH + 0.72 so cars
    //   NEVER straddle or clip through the concrete pit wall, with smooth entry funnel at s in [936..948].
    // - Rest of circuit: clamp strictly inside Armco guardrails at +/-(ROAD_HALF_WIDTH + 2.45).
    const inPitWallZone = car.s >= 948.0 || car.s <= 75.0;
    let maxRightBarrier = ROAD_HALF_WIDTH + 2.45;
    if (inPitWallZone) {
      maxRightBarrier = ROAD_HALF_WIDTH + 0.72;
    } else if (car.s > 936.0 && car.s < 948.0) {
      const noseBlend = (car.s - 936.0) / 12.0;
      maxRightBarrier = (ROAD_HALF_WIDTH + 2.45) - noseBlend * (2.45 - 0.72);
    }
    const minLeftBarrier = -(ROAD_HALF_WIDTH + 2.45);

    if (car.lateralOffset > maxRightBarrier) {
      car.lateralOffset = maxRightBarrier;
      scrapedWall = true;
      if (car.lateralVel > 0) {
        const impactScrubKmh = Math.min(22.0, car.lateralVel * 2.2);
        car.speedKmh = Math.max(40.0, car.speedKmh - impactScrubKmh);
        car.lateralVel = -Math.min(2.8, car.lateralVel * 0.24);
      }
      car.speedKmh = Math.max(40.0, car.speedKmh - (inPitWallZone ? 46.0 : 36.0) * safeDt);
    } else if (car.lateralOffset < minLeftBarrier) {
      car.lateralOffset = minLeftBarrier;
      scrapedWall = true;
      if (car.lateralVel < 0) {
        const impactScrubKmh = Math.min(22.0, Math.abs(car.lateralVel) * 2.2);
        car.speedKmh = Math.max(40.0, car.speedKmh - impactScrubKmh);
        car.lateralVel = Math.min(2.8, Math.abs(car.lateralVel) * 0.24);
      }
      car.speedKmh = Math.max(40.0, car.speedKmh - 36.0 * safeDt);
    }

    const desiredYaw = onStraightNeutral && car.lateralVel === 0.0
      ? 0.0
      : clamp((car.lateralVel / Math.max(15.0, nextSpeedMps)) * 0.76 + car.steerAngleRad * 0.12, -0.38, 0.38);
    car.relYaw += (desiredYaw - car.relYaw) * Math.min(1, safeDt * 18.0);
    if (onStraightNeutral && Math.abs(car.relYaw) < 0.002) {
      car.relYaw = 0.0;
    }
  }

  car.latG = onStraightNeutral && car.lateralVel === 0.0
    ? 0.0
    : (centrifugalPush * 0.24) + nonLinSteer * (nextSpeedMps / 38.0);

  // --------------------------------------------------------------------------
  // 4B. FRONT-AXLE SELF-ALIGNING TORQUE (SAT) & 3D SUSPENSION PITCH/ROLL/HEAVE
  // --------------------------------------------------------------------------
  if (onStraightNeutral && Math.abs(car.lateralVel) < 0.04) {
    car.selfAligningTorque = 0.0;
  } else {
    // Pneumatic trail peaks at small slip angles and fades as front tires saturate into understeer
    const pneumaticTrail = Math.cos(clamp(Math.abs(frontSlipAngleRad) * 4.0, 0.0, 1.48));
    const centeringTorque = -nonLinSteer * 0.38 * pneumaticTrail * clamp(muLat, 0.45, 1.20);
    // Rear oversteer / wet-kerb slide catch torque: steers into unexpected lateral/oversteer slide
    const slideMismatch = (car.lateralVel - steerLatRate * 0.85) / Math.max(14.0, nextSpeedMps * 0.42);
    const oversteerDelta = rearSlipAngleRad - frontSlipAngleRad;
    const catchTorque = clamp(-slideMismatch * 0.55 + oversteerDelta * 1.15, -0.75, 0.75);
    const lowSpdGate = clamp(car.speedKmh / 22.0, 0.0, 1.0);
    car.selfAligningTorque = clamp((centeringTorque + catchTorque) * lowSpdGate, -1.0, 1.0);
  }

  // 3D Chassis Pitch Dynamics: +0.028 rad nose-dive under heavy braking, -0.020 rad rear squat under launch/ERS punch
  const targetPitchFromG = car.longG < 0.0
    ? clamp((-car.longG / 4.55) * 0.028, 0.0, 0.028)
    : clamp(-(car.longG / 1.42) * 0.020, -0.020, 0.0);
  const shiftPitchNod = (car.shiftCooldown > 0.07 && car.revBlipTimer <= 0.0) ? -0.0032 : 0.0;
  const sawtoothPhase = car.totalDistanceGameM * 22.5;
  const kerbSawWave = car.onCurb ? Math.sin(sawtoothPhase) : 0.0;
  const targetPitchRad = clamp(targetPitchFromG + shiftPitchNod + kerbSawWave * 0.0024, -0.024, 0.030);

  // 2nd-order damped pitch spring (wn = 22 rad/s, zeta = 0.82)
  car.chassisPitchVel = finiteOr(car.chassisPitchVel, 0.0);
  car.chassisPitchRad = finiteOr(car.chassisPitchRad, 0.0);
  const pitchAccel = 484.0 * (targetPitchRad - car.chassisPitchRad) - 36.0 * car.chassisPitchVel;
  car.chassisPitchVel = clamp(car.chassisPitchVel + pitchAccel * safeDt, -0.85, 0.85);
  car.chassisPitchRad = clamp(car.chassisPitchRad + car.chassisPitchVel * safeDt, -0.026, 0.031);
  if (onStraightNeutral && Math.abs(targetPitchRad) < 0.0005 && Math.abs(car.chassisPitchRad) < 0.0004) {
    car.chassisPitchRad = 0.0;
    car.chassisPitchVel = 0.0;
  }

  // 3D Chassis Roll Dynamics: lateral G body roll + asymmetric sawtooth FIA kerb lift on Left or Right wheels!
  const onLeftKerb = car.onCurb && car.lateralOffset < 0;
  const onRightKerb = car.onCurb && car.lateralOffset > 0;
  const kerbRollLift = onLeftKerb
    ? (0.0115 + 0.0042 * kerbSawWave)
    : (onRightKerb ? -(0.0115 + 0.0042 * kerbSawWave) : 0.0);
  const targetRollRad = onStraightNeutral && !car.onCurb
    ? 0.0
    : clamp(-clamp(car.latG / 4.2, -1.0, 1.0) * 0.026 + kerbRollLift, -0.042, 0.042);

  car.chassisRollVel = finiteOr(car.chassisRollVel, 0.0);
  car.chassisRollRad = finiteOr(car.chassisRollRad, 0.0);
  const rollAccel = 676.0 * (targetRollRad - car.chassisRollRad) - 42.5 * car.chassisRollVel;
  car.chassisRollVel = clamp(car.chassisRollVel + rollAccel * safeDt, -1.10, 1.10);
  car.chassisRollRad = clamp(car.chassisRollRad + car.chassisRollVel * safeDt, -0.045, 0.045);
  if (onStraightNeutral && !car.onCurb && Math.abs(car.chassisRollRad) < 0.0004) {
    car.chassisRollRad = 0.0;
    car.chassisRollVel = 0.0;
  }

  // Venturi aero compression + 4-Corner Wheel Suspension Compression [fl, fr, rl, rr] in [0..1]
  const aeroSquatNorm = 0.26 * Math.min(1.15, (car.speedKmh / 316.0) * (car.speedKmh / 316.0));
  car.chassisHeaveM = -aeroSquatNorm * 0.032 + (car.onCurb ? Math.abs(kerbSawWave) * 0.006 : 0.0);
  const pitchFrontDelta = (car.chassisPitchRad / 0.028) * 0.24;
  const rollLeftDelta = -(car.chassisRollRad / 0.032) * 0.22;
  const leftKerbBump = onLeftKerb ? (0.16 + 0.11 * kerbSawWave) : 0.0;
  const rightKerbBump = onRightKerb ? (0.16 + 0.11 * kerbSawWave) : 0.0;

  const compFL = clamp(0.25 + aeroSquatNorm * 0.42 + pitchFrontDelta + rollLeftDelta + leftKerbBump, 0.0, 1.0);
  const compFR = clamp(0.25 + aeroSquatNorm * 0.42 + pitchFrontDelta - rollLeftDelta + rightKerbBump, 0.0, 1.0);
  const compRL = clamp(0.25 + aeroSquatNorm * 0.58 - pitchFrontDelta + rollLeftDelta + leftKerbBump, 0.0, 1.0);
  const compRR = clamp(0.25 + aeroSquatNorm * 0.58 - pitchFrontDelta - rollLeftDelta + rightKerbBump, 0.0, 1.0);
  car.wheelCompression[0] = compFL;
  car.wheelCompression[1] = compFR;
  car.wheelCompression[2] = compRL;
  car.wheelCompression[3] = compRR;
  car.tires.FL.compression = compFL;
  car.tires.FR.compression = compFR;
  car.tires.RL.compression = compRL;
  car.tires.RR.compression = compRR;

  const curbTactileRumble = (car.onCurb && car.speedKmh > 65.0) ? 0.22 : 0.0;
  car.skidIntensity = clamp(
    (scrapedWall ? 0.78 : curbTactileRumble) +
      slipExcessG * 0.92 +
      (effBrakeIn > 0.85 && nextSpeedMps > 25 ? Math.max(0, 1.12 - muLong) * 0.72 : 0),
    0.0,
    1.0
  );

  // --------------------------------------------------------------------------
  // 5. ADVANCE SPLINE PROGRESS (s in 0..1000 GAME-METERS) & LAP DETECTION
  // --------------------------------------------------------------------------
  const effectiveSpeedMps = car.speedKmh / 3.6;
  const radiusFactor = clamp(1.0 - curvature * car.lateralOffset * 0.022, 0.78, 1.22);
  const dsGame = ((effectiveSpeedMps * safeDt) / mPerGameM) / radiusFactor;

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
