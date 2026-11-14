// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Decoupled 240Hz Vehicle Physics, Pacejka-Lite 4-Corner Tires, Damage & Fuel
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

const SIX_SPEED_TOPS = [116, 162, 204, 242, 276, 307];

export function createVehicleState(opts = {}) {
  const compound = opts.compound || 'SOFT';
  const baseTemp = opts.initialTireTemp ?? 88;
  return {
    id: opts.id || 'PLAYER',
    isPlayer: !!opts.isPlayer,
    name: opts.name || 'PLAYER #1',
    short: opts.short || 'PLY',
    carNum: opts.carNum || 1,

    // Spatial coordinates along 1,000m Fuji spline
    s: opts.s ?? 0,
    totalDistanceGameM: opts.totalDistanceGameM ?? 0,
    lap: opts.lap ?? 1,
    lateralOffset: opts.lateralOffset ?? 0,
    lateralVel: 0,
    relYaw: 0,

    // Kinematics
    speedKmh: 0,
    rpm: 1800,
    gear: 1, // 1=LOW, 2=HIGH (or 1..6 in 6-speed sequential)
    gearboxMode: opts.gearboxMode || 'CLASSIC_2SPD', // 'CLASSIC_2SPD' | 'PRO_6SPD'
    overRevTimer: 0,
    inSlipstream: false,
    slipstreamFactor: 0,

    // Control inputs [0..1] / [-1..1]
    steerInput: 0,      // raw wheel [-1..1] (negative = left, positive = right)
    steerAngleRad: 0,   // post non-linear speed-sensitive curve
    throttleInput: 0,
    brakeInput: 0,

    // Surface & Hazard state
    onCurb: false,
    onGrass: false,
    aquaplaneTimer: 0,
    latG: 0,
    skidIntensity: 0,

    // 2026 Tire & Fuel Simulation
    compound,
    tires: {
      FL: { life: 1.0, temp: baseTemp, load: 0.25, punctured: false },
      FR: { life: 1.0, temp: baseTemp, load: 0.25, punctured: false },
      RL: { life: 1.0, temp: baseTemp, load: 0.25, punctured: false },
      RR: { life: 1.0, temp: baseTemp, load: 0.25, punctured: false },
    },
    fuelLaps: opts.fuelLaps ?? 7.0,
    maxFuelLaps: opts.maxFuelLaps ?? 14.0,

    // 4-Zone Component Damage (2026 Mode)
    damage: {
      frontWing: 0.0,       // 0..1: reduces fast-corner front downforce -> understeer
      rearWing: 0.0,        // 0..1: up to -22 km/h straight drag + braking instability
      suspension: 0.0,      // 0..1: persistent steering bias + 2.2x corner tire wear
      suspensionBias: 1,    // -1 left pull, +1 right pull
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
  };
}

export function shiftGear(car, direction, callbacks = {}) {
  if (car.exploded || car.pitPhase === 'STOPPED') return;

  if (car.gearboxMode === 'PRO_6SPD') {
    const next = Math.max(1, Math.min(6, car.gear + direction));
    if (next !== car.gear) {
      const prevTop = SIX_SPEED_TOPS[ next - 1 ];
      if (direction < 0 && car.speedKmh > prevTop + 6) {
        car.overRevTimer = 0.55;
        if (callbacks.onOverRev) callbacks.onOverRev(car);
      }
      if (direction < 0 && car.speedKmh > 110 && callbacks.onBackfire) {
        callbacks.onBackfire(car);
      }
      car.gear = next;
    }
  } else {
    // Classic 2-Speed LOW (1) / HIGH (2)
    const next = direction > 0 ? 2 : (direction < 0 ? 1 : (car.gear === 1 ? 2 : 1));
    if (next !== car.gear) {
      // Shifting HIGH -> LOW above 172 km/h triggers immediate rear-axle engine braking + over-rev!
      if (next === 1 && car.speedKmh > 172.0) {
        car.overRevTimer = 0.75;
        if (callbacks.onOverRev) callbacks.onOverRev(car);
        if (callbacks.onBackfire) callbacks.onBackfire(car);
      } else if (next === 1 && car.speedKmh > 115 && callbacks.onBackfire) {
        callbacks.onBackfire(car);
      }
      car.gear = next;
    }
  }
}

export function stepVehiclePhysics240Hz(car, dt, ctx) {
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

  // Handle explosion respawn countdown
  if (car.exploded) {
    car.explodeTimer -= dt;
    car.speedKmh = 0;
    car.rpm = 0;
    car.skidIntensity = 0;
    if (car.explodeTimer <= 0) {
      car.exploded = false;
      car.lateralOffset = 0;
      car.lateralVel = 0;
      car.relYaw = 0;
      car.gear = 1;
      car.rpm = 1800;
    }
    return;
  }

  if (controlsLocked) {
    car.speedKmh = 0;
    car.rpm = 2200 + car.throttleInput * 6800;
    car.skidIntensity = 0;
    return;
  }

  // Stationary in Pit Box (handled by Pit System timer)
  if (car.pitPhase === 'STOPPED') {
    car.speedKmh = 0;
    car.rpm = 2800 + Math.sin(performance.now() * 0.02) * 350;
    car.lateralVel = 0;
    car.skidIntensity = 0;
    return;
  }

  const isClassic = mode === '1982_ORIGINAL';
  const wearFuelMult = isClassic
    ? 0.0
    : (PRO_2026_LENGTHS[raceLengthId]?.wearFuelMult ?? 1.0);

  const frame = track.sampleAt(car.s, car.lateralOffset);
  const curvature = car.inPitLane ? 0.0 : frame.curvature;
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

  // Track Moisture W at car's exact lateral line
  const localW = isClassic ? 0.0 : weather.getMoistureAt(curvature, car.lateralOffset);

  // Standing Puddle check
  let hittingPuddle = false;
  if (!car.inPitLane) {
    const puddlesAllowed = isClassic ? !isQualifying : localW > 0.22;
    if (puddlesAllowed) {
      for (const p of track.puddles) {
        let ds = Math.abs(car.s - p.s);
        if (ds > 500) ds = TRACK_GAME_LENGTH - ds;
        const dReal = ds * REAL_METERS_PER_GAME_METER;
        const dLat = Math.abs(car.lateralOffset - p.lat);
        if (dReal < p.radius + 1.4 && dLat < p.radius * 0.85) {
          hittingPuddle = true;
          break;
        }
      }
    }
  }

  if (hittingPuddle) {
    if (isClassic) {
      // 1982 Original: rapid hydroplane drag in Grand Prix puddles
      car.speedKmh = Math.max(95, car.speedKmh - 105.0 * dt);
      if (car.aquaplaneTimer <= 0 && callbacks.onHydroplane) callbacks.onHydroplane(car);
      car.aquaplaneTimer = 0.18;
    } else {
      const comp = TIRE_COMPOUNDS[car.compound];
      if (!comp.preventsHydroplane && car.speedKmh > 200.0) {
        if (car.aquaplaneTimer <= 0 && callbacks.onHydroplane) callbacks.onHydroplane(car);
        car.aquaplaneTimer = 0.52;
      } else if (!comp.preventsHydroplane) {
        car.speedKmh = Math.max(80, car.speedKmh - 38.0 * dt);
      }
    }
  }
  if (car.aquaplaneTimer > 0) {
    car.aquaplaneTimer = Math.max(0, car.aquaplaneTimer - dt);
  }

  // --------------------------------------------------------------------------
  // 2. PACEJKA-LITE 4-CORNER TIRE GRIP, THERMAL & WEAR SOLVER
  // --------------------------------------------------------------------------
  let muLat = 1.10;
  let muLong = 1.10;

  if (!isClassic) {
    const comp = TIRE_COMPOUNDS[car.compound] || TIRE_COMPOUNDS.SOFT;
    let baseMu = comp.baseGrip;

    // Moisture interaction
    if (!comp.isWetTire) {
      // Dry slicks lose up to 55% grip in monsoon: mu_eff = mu_dry * (1 - 0.55 * W)
      baseMu = comp.baseGrip * (1.0 - 0.55 * localW);
    } else if (comp.id === 'INTERMEDIATE') {
      if (localW < 0.10) {
        baseMu = 0.86; // Squirmy & overheating on dry tarmac
      } else if (localW <= 0.58) {
        baseMu = 1.03; // Sweet spot!
      } else {
        baseMu = 0.88 - (localW - 0.58) * 0.25;
      }
    } else if (comp.id === 'FULL_WET') {
      if (localW < 0.20) {
        baseMu = 0.78;
      } else {
        baseMu = 0.96 + Math.min(0.08, (localW - 0.45) * 0.18);
      }
    }

    // Corner weight transfer & per-corner wear/temperature update
    const longTransfer = (car.brakeInput - car.throttleInput * 0.65) * 0.08;
    const latTransfer = Math.max(-0.12, Math.min(0.12, curvature * (speedMps / 75.0) * 0.12));
    // Turning Right (+curvature) loads Left-side tires (FL, RL)!
    const loads = {
      FL: Math.max(0.08, 0.25 + longTransfer + latTransfer),
      FR: Math.max(0.08, 0.25 + longTransfer - latTransfer),
      RL: Math.max(0.08, 0.25 - longTransfer + latTransfer),
      RR: Math.max(0.08, 0.25 - longTransfer - latTransfer),
    };

    let sumCornerMu = 0;
    let anyPunctured = false;
    const corners = ['FL', 'FR', 'RL', 'RR'];

    for (const cKey of corners) {
      const t = car.tires[cKey];
      t.load = loads[cKey];

      // Thermal evolution
      const workEnergy =
        (Math.abs(curvature) * speedMps * 0.52 + car.brakeInput * speedMps * 0.28 + car.throttleInput * 12.0) *
        (t.load * 4.0);
      const dryInterPenalty = comp.id === 'INTERMEDIATE' && localW < 0.10 ? 28.0 : 0.0;
      const wetCooling = localW * 26.0;
      const targetTemp = weather.ambientTemp + 34.0 + workEnergy + dryInterPenalty - wetCooling;
      t.temp += (targetTemp - t.temp) * Math.min(1, dt * 0.42);

      // Thermal multiplier
      let tempMult = 1.0;
      if (t.temp < comp.optTempMin) {
        tempMult = Math.max(0.90, 1.0 - (comp.optTempMin - t.temp) * 0.0032);
      } else if (t.temp > comp.optTempMax) {
        tempMult = Math.max(0.86, 1.0 - (t.temp - comp.optTempMax) * 0.0045);
      }

      // Wear degradation (calibrated so SHORT=5L Soft lasts ~5-6 laps, MEDIUM=12L needs 1-2 stops)
      if (!car.inPitLane && speedMps > 2.0) {
        let wearStep =
          0.00115 *
          comp.wearRate *
          wearFuelMult *
          (t.load * 4.0) *
          (0.55 + Math.abs(curvature) * 1.15 + car.skidIntensity * 1.4) *
          (speedMps / 68.0) *
          dt;

        if (comp.id === 'INTERMEDIATE' && localW < 0.10) wearStep *= 2.8; // Rapid dry blistering!
        if (car.damage.suspension > 0.15 && car.damage.damagedCorner === cKey) {
          wearStep *= 1.0 + car.damage.suspension * 1.2; // Up to 2.2x wear on damaged suspension corner!
        }

        t.life = Math.max(0.0, t.life - wearStep);
      }

      // 25% "Tire Cliff" exponential grip decay + curb puncture hazard!
      let wearMult = 1.0;
      if (t.life >= 0.25) {
        wearMult = 0.93 + 0.07 * ((t.life - 0.25) / 0.75);
      } else {
        const ratio = t.life / 0.25;
        wearMult = 0.42 + 0.51 * Math.pow(ratio, 2.2);
        // Puncture risk when riding curbs on cliffed tires or running 0% life!
        if (!t.punctured && ((car.onCurb && Math.random() < (1.0 - ratio) * 0.22 * dt) || t.life <= 0.002)) {
          t.punctured = true;
          car.damage.hasPuncture = true;
          if (callbacks.onPuncture) callbacks.onPuncture(car, cKey);
        }
      }

      if (t.punctured) {
        anyPunctured = true;
        wearMult = 0.28;
      }

      sumCornerMu += baseMu * tempMult * wearMult;
    }

    car.damage.hasPuncture = anyPunctured;
    muLat = sumCornerMu * 0.25;
    muLong = sumCornerMu * 0.25;
  }

  // Off-road Green Grass drops local wheel grip to mu = 0.40!
  if (car.onGrass) {
    muLat = Math.min(muLat, 0.40);
    muLong = Math.min(muLong, 0.48);
  } else if (car.onCurb) {
    muLat *= 0.94;
  }

  // --------------------------------------------------------------------------
  // 3. GEARBOX, TORQUE CURVE, FUEL MASS, DRAG & BRAKING
  // --------------------------------------------------------------------------
  let gearTopKmh = 307.0;
  let torqueMult = 1.0;

  if (car.gearboxMode === 'PRO_6SPD' && !isClassic) {
    gearTopKmh = SIX_SPEED_TOPS[car.gear - 1] || 307.0;
    const prevTop = car.gear > 1 ? SIX_SPEED_TOPS[car.gear - 2] : 0;
    torqueMult = 1.38 - (car.gear - 1) * 0.085;
    if (car.speedKmh < prevTop * 0.68 && car.gear > 1) {
      torqueMult *= 0.52; // Bogged down if in too high a gear out of Hairpin!
    }
  } else {
    // Classic 2-Speed: LOW caps at 172 km/h (107 mph); HIGH pulls 172 -> 307 km/h (322 in tow)
    if (car.gear === 1) {
      gearTopKmh = 172.0;
      torqueMult = 1.36;
    } else {
      gearTopKmh = 307.0;
      torqueMult = car.speedKmh < 135 ? 0.56 : 0.98;
    }
  }

  // Slipstream tow adds up to +15 km/h (307 -> 322 km/h!)
  const maxTopGear = car.gearboxMode === 'PRO_6SPD' && !isClassic ? 6 : 2;
  const slipBoostKmh = car.gear === maxTopGear ? car.slipstreamFactor * 15.0 : 0.0;

  // Rear Wing damage aero drag penalty (up to -22 km/h on straight)
  const rearWingLossKmh = isClassic ? 0.0 : car.damage.rearWing * 22.0;
  const effectiveGearCapKmh = Math.max(85.0, gearTopKmh + slipBoostKmh - rearWingLossKmh);

  // Fuel mass penalty & out-of-fuel sputter (2026 Mode)
  let fuelMassMult = 1.0;
  if (!isClassic) {
    fuelMassMult = 1.0 / (1.0 + Math.max(0, car.fuelLaps) * 0.0045);
    if (!car.inPitLane && car.throttleInput > 0.02 && speedMps > 1.0) {
      const lapsPerGameMeter = 1.0 / TRACK_GAME_LENGTH;
      const dsEst = (speedMps * dt) / REAL_METERS_PER_GAME_METER;
      car.fuelLaps = Math.max(0, car.fuelLaps - dsEst * lapsPerGameMeter * wearFuelMult * (0.78 + 0.32 * car.throttleInput));
    }
  }

  // Acceleration
  let accelMps2 = 0.0;
  let effectiveCap = effectiveGearCapKmh;
  if (!isClassic && car.fuelLaps <= 0.001) {
    effectiveCap = Math.min(effectiveCap, 88.0); // Out-of-fuel limp mode
  }
  if (!isClassic && car.damage.hasPuncture) {
    effectiveCap = Math.min(effectiveCap, 95.0); // Punctured tire limp cap (95 km/h)!
  }
  if (vscActive && !car.inPitLane) {
    effectiveCap = Math.min(effectiveCap, 160.0); // VSC 160 km/h delta cap!
  }
  if (car.inPitLane && car.s >= PIT_LANE_CONFIG.speedLimitLineS || (car.inPitLane && car.s < PIT_LANE_CONFIG.mergeStartS)) {
    // Enforce 80 km/h Pit Lane Limiter once past speed limit line
    if (car.speedKmh > PIT_LANE_CONFIG.speedLimitKmh + 1.5) {
      accelMps2 -= 22.0;
    }
    effectiveCap = Math.min(effectiveCap, PIT_LANE_CONFIG.speedLimitKmh);
  }

  if (car.throttleInput > 0.01) {
    if (car.speedKmh < effectiveCap) {
      const headroom = 1.0 - Math.pow(car.speedKmh / Math.max(120, effectiveCap + 18), 2.1);
      accelMps2 += car.throttleInput * 15.8 * torqueMult * muLong * fuelMassMult * Math.max(0.16, headroom);
    } else {
      // Rev limiter bounce at 172 km/h in LOW gear (or current cap)
      accelMps2 -= 8.5;
    }
  } else {
    // Coasting aero & rolling resistance
    accelMps2 -= 2.4 + 0.0011 * speedMps * speedMps;
  }

  // Downshift Engine Braking when in LOW gear above 172 km/h!
  if (car.gear === 1 && car.gearboxMode === 'CLASSIC_2SPD' && car.speedKmh > 172.5) {
    accelMps2 -= 17.5;
    car.overRevTimer = Math.max(car.overRevTimer, 0.12);
  }
  if (car.overRevTimer > 0) {
    car.overRevTimer = Math.max(0, car.overRevTimer - dt);
  }

  // Braking deceleration (lengthens up to ~1.95x in heavy rain when muLong drops!)
  if (car.brakeInput > 0.01) {
    const brakePower = 31.5 * muLong * fuelMassMult;
    accelMps2 -= car.brakeInput * brakePower;
  }

  // Off-road grass & curb drag
  if (car.onCurb) {
    accelMps2 -= 1.8;
  } else if (car.onGrass) {
    accelMps2 -= 8.5 + (car.speedKmh > 130 ? (car.speedKmh - 130) * 0.18 : 0);
  }

  const nextSpeedMps = Math.max(0, speedMps + accelMps2 * dt);
  car.speedKmh = nextSpeedMps * 3.6;

  // Engine RPM synthesis value
  const normGearRatio = Math.min(1.06, car.speedKmh / Math.max(60, gearTopKmh));
  const revBounce = car.speedKmh >= gearTopKmh - 1.2 && car.throttleInput > 0.5
    ? Math.sin(performance.now() * 0.09) * 420
    : 0;
  car.rpm = car.overRevTimer > 0
    ? 13600 + Math.sin(performance.now() * 0.12) * 350
    : 2200 + normGearRatio * 9800 + revBounce;

  // --------------------------------------------------------------------------
  // 4. NON-LINEAR STEERING, CENTRIFUGAL FORCE & ACTIVE ARCADE-SIM ASSIST
  // --------------------------------------------------------------------------
  // Exact spec formula: sign(theta) * |theta|^1.45 * (1 / (1 + k_v * v^2))
  const theta = Math.max(-1, Math.min(1, car.steerInput));
  const kv = 0.00017;
  const nonLinSteer =
    Math.sign(theta) * Math.pow(Math.abs(theta), 1.45) * (1.0 / (1.0 + kv * nextSpeedMps * nextSpeedMps));
  car.steerAngleRad = nonLinSteer * 0.48;

  // Aquaplaning temporarily drops steering torque authority
  const steerAuthority = car.aquaplaneTimer > 0 ? 0.22 : 1.0;

  // Front Wing damage reduces front downforce in fast corners (Turn 2 100R & Turn 4 300R)
  const fastCornerFactor = Math.max(0, Math.min(1, (car.speedKmh - 150) / 140));
  const frontAeroEff = isClassic ? 1.0 : (1.0 - car.damage.frontWing * 0.42 * fastCornerFactor);

  // Suspension / Toe damage persistent lateral pull
  const suspensionPull = (!isClassic && car.damage.suspension > 0.05)
    ? car.damage.suspension * 0.09 * car.damage.suspensionBias * (nextSpeedMps / 50.0)
    : 0.0;

  // Rear Wing damage braking instability wiggle
  const rearBrakeTwitch = (!isClassic && car.damage.rearWing > 0.25 && car.brakeInput > 0.4)
    ? Math.sin(performance.now() * 0.025) * car.damage.rearWing * 0.08 * car.brakeInput
    : 0.0;

  // Desired lateral velocity from player steering vs outward centrifugal drift
  // Note: curvature > 0 is Right turn (+lateralOffset is Right), so centrifugal pushes Left (-lateralOffset)!
  const steerLatRate = nonLinSteer * steerAuthority * frontAeroEff * Math.min(26.0, nextSpeedMps * 0.56);
  const centrifugalPush = -curvature * (nextSpeedMps * nextSpeedMps) * 0.00335;

  // Active Arcade-Sim Steering Assist: smooth lateral damping + excess slip slide when exceeding muLat
  const rawDemandG = Math.abs(centrifugalPush - steerLatRate * 0.35) / 9.81;
  const gripBudget = muLat * 1.45;
  const slipExcess = Math.max(0, rawDemandG - gripBudget);

  // When exceeding tire lateral grip (entering Hairpin too hot or slicks in rain), car drifts wide!
  const understeerDrift = slipExcess > 0 ? Math.sign(centrifugalPush) * slipExcess * 8.5 : 0.0;

  const targetLatVel = steerLatRate + centrifugalPush + understeerDrift + suspensionPull * 8.0 + rearBrakeTwitch * 6.0;
  car.lateralVel += (targetLatVel - car.lateralVel) * Math.min(1, dt * 11.5);

  if (car.inPitLane) {
    // Gently guide car along the Pit Lane corridor centerline
    const targetPitLat = frame.pitOffset ?? PIT_LANE_CONFIG.lateralOffset;
    car.lateralOffset += (targetPitLat - car.lateralOffset) * Math.min(1, dt * 6.5);
    car.relYaw = (targetPitLat - car.lateralOffset) * 0.08;
  } else {
    car.lateralOffset += car.lateralVel * dt;
    // Clamp outer barrier limits at +-13.2m
    const maxBarrier = ROAD_HALF_WIDTH + 5.2;
    if (Math.abs(car.lateralOffset) > maxBarrier) {
      car.lateralOffset = Math.sign(car.lateralOffset) * maxBarrier;
      car.lateralVel *= -0.25;
      car.speedKmh *= 0.88;
    }
    car.relYaw = Math.max(-0.42, Math.min(0.42, (car.lateralVel / Math.max(14.0, nextSpeedMps)) * 0.85));
  }

  car.latG = (centrifugalPush * 0.25) + nonLinSteer * (nextSpeedMps / 38.0);
  car.skidIntensity = Math.min(
    1.0,
    slipExcess * 0.9 + (car.brakeInput > 0.82 && nextSpeedMps > 25 ? (1.15 - muLong) * 0.75 : 0)
  );

  // --------------------------------------------------------------------------
  // 5. ADVANCE SPLINE PROGRESS (s in 0..1000 GAME-METERS) & LAP DETECTION
  // --------------------------------------------------------------------------
  // Effective corner arc radius slightly shortens inside apex & lengthens outside!
  const radiusFactor = Math.max(0.78, Math.min(1.22, 1.0 - curvature * car.lateralOffset * 0.022));
  const dsGame = ((nextSpeedMps * dt) / REAL_METERS_PER_GAME_METER) / radiusFactor;

  const prevS = car.s;
  car.s = (car.s + dsGame) % TRACK_GAME_LENGTH;
  car.totalDistanceGameM += dsGame;
  car.currentLapTime += dt;

  // Checkered / Lap Line Crossing (prevS > 970 -> car.s < 30)
  if (prevS > 960 && car.s < 40) {
    if (callbacks.onLapCrossed) {
      callbacks.onLapCrossed(car);
    }
  }
}
