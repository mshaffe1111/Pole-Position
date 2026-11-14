// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Autonomous Spatial AI Engine: Multi-Circuit Kinematic Braking, Curvature
// Feedforward Steering, 15-Ray Radar, Clean Slingshot Racecraft & 5 Personalities
// ============================================================================

import {
  TRACK_GAME_LENGTH,
  REAL_METERS_PER_GAME_METER,
  ROAD_HALF_WIDTH,
  CAR_WIDTH,
  CAR_LENGTH,
  PIT_LANE_CONFIG,
  TIRE_COMPOUNDS,
  AI_ARCHETYPES,
} from './config.js';
import { shiftGear } from './physics.js';

// 13 full-width forward candidate lanes across the 16.8m GP asphalt + 2 sidepod overlap sensors = 15-Ray Spatial Radar!
const FORWARD_RAY_LANES = [
  -7.2, -6.0, -4.8, -3.6, -2.4, -1.2, 0.0, 1.2, 2.4, 3.6, 4.8, 6.0, 7.2,
];

// Multi-horizon spline lookahead distances in real meters (covers tight chicanes -> 325 km/h heavy braking zones)
const KINEMATIC_LOOKAHEAD_M = [15.0, 30.0, 45.0, 68.0, 95.0, 118.0, 140.0];

// Manual gearbox fallback shift points (mirrors physics.js 8-speed & 6-speed ratios with clean hysteresis)
const MANUAL_8_UPSHIFT = [102, 141, 176, 208, 237, 263, 287];
const MANUAL_8_DOWNSHIFT = [82, 118, 152, 182, 210, 236, 260];
const MANUAL_6_UPSHIFT = [110, 155, 196, 234, 268];
const MANUAL_6_DOWNSHIFT = [88, 128, 166, 202, 236];

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function forwardDistGameM(fromS, toS) {
  let d = toS - fromS;
  if (d < 0) d += TRACK_GAME_LENGTH;
  return d;
}

function signedDeltaGameM(a, b) {
  let d = a - b;
  if (d > TRACK_GAME_LENGTH * 0.5) d -= TRACK_GAME_LENGTH;
  if (d < -TRACK_GAME_LENGTH * 0.5) d += TRACK_GAME_LENGTH;
  return d;
}

export class SpatialAIController {
  constructor(track, weather, raceSystems) {
    this.track = track;
    this.weather = weather;
    this.raceSystems = raceSystems;
  }

  initAICar(car, driverDef, index) {
    const arch = AI_ARCHETYPES[driverDef?.archetype] || AI_ARCHETYPES.APEX_TACTICIAN;
    car.archetypeId = arch.id;
    car.archetype = arch;
    car.aiSlotIndex = index;

    // Evenly spaced pit stalls avoiding Player Pit Box (s = 20)
    car.assignedPitBoxS = [976, 986, 996, 6, 30, 40, 50, 60][index % 8];

    car.aiTargetLat = car.lateralOffset;
    car.aiDecisionTimer = (index * 0.011) % 0.045;
    car.aiLapBrakeJitter = 0.0;
    car.aiLastJitterKey = -1;
    car.aiPressureTimer = 0.0;
    car.aiMistakeTimer = 0.0;
    car.aiMistakeLatBias = 0.0;

    // Persistent overtake commitment to eliminate left/right oscillation behind slower traffic
    car.aiPassSide = index % 2 === 0 ? -1 : 1;
    car.aiPassLockTimer = 0.0;
    car.aiDefenseLat = null;

    // Realistic grid reaction stagger & subtle driver championship tier spread
    const baseReact = 0.05 + ((index * 37) % 17) * 0.009;
    const archReact = arch.id === 'LATE_BRAKER' || arch.id === 'DEFENSIVE_WALL'
      ? -0.02
      : (arch.id === 'ROOKIE_WILDCARD' ? 0.045 : 0.0);
    car.aiLaunchDelaySec = Math.max(0.02, baseReact + archReact);
    car.aiSkillTierOffset = clamp(0.010 - index * 0.0021, -0.018, 0.010);

    car.aiWantsToPit = false;
    car.aiPitPlan = null;
    car._aiLastPitLap = 0;
    car._aiTargetSpeedKmh = 315.0;
    car._aiBrakeAggression = 1.0;
  }

  updateAI(car, allCars, playerCar, dt, ctx) {
    const { mode, isQualifying, controlsLocked, totalLaps = 5, callbacks = {} } = ctx;
    if (car.exploded || car.pitPhase === 'STOPPED') return;

    // Pre-start grid hold: stage throttle cleanly for F1 launch without creeping
    if (controlsLocked) {
      car.steerInput = 0.0;
      car.brakeInput = 0.0;
      car.throttleInput = 0.62;
      return;
    }

    const isClassic = mode === '1982_ORIGINAL';
    const arch = car.archetype || AI_ARCHETYPES.APEX_TACTICIAN;
    const mPerGameM = this.track.realMetersPerGameMeter || REAL_METERS_PER_GAME_METER;

    // Detect Showroom background demo mode (Player #1 parked stationary at s = 993.5)
    const isShowroomDemo = !!(
      playerCar &&
      playerCar.totalDistanceGameM === 0 &&
      playerCar.currentLapTime === 0 &&
      Math.abs(playerCar.s - 993.5) < 0.6
    );

    if (car.aiPassLockTimer > 0) {
      car.aiPassLockTimer = Math.max(0, car.aiPassLockTimer - dt);
    }
    if (car.aiMistakeTimer > 0) {
      car.aiMistakeTimer = Math.max(0, car.aiMistakeTimer - dt);
    }

    // Brief human reaction delay right off the starting grid
    if (!isShowroomDemo && !isQualifying && car.lap === 1 && car.currentLapTime < (car.aiLaunchDelaySec || 0)) {
      car.steerInput = 0.0;
      car.throttleInput = 0.45;
      car.brakeInput = 0.0;
      return;
    }

    // 25Hz Spatial Radar & Multi-Circuit Kinematic Speed Planner
    car.aiDecisionTimer -= dt;
    if (car.aiDecisionTimer <= 0) {
      car.aiDecisionTimer = 0.04;
      this._run15RaySpatialPlanner(
        car,
        allCars,
        playerCar,
        isClassic,
        isQualifying,
        isShowroomDemo,
        totalLaps,
        callbacks
      );
    }

    // ------------------------------------------------------------------------
    // 240Hz STEERING CONTROLLER: CURVATURE FEEDFORWARD + SIDEPOD RESPECT GUARD
    // ------------------------------------------------------------------------
    let desiredLat = car.aiTargetLat;

    // Smooth peel-off toward right-hand Pit Entry split (s in [865..930]) when boxing in 2026 mode
    if (!isClassic && !isShowroomDemo && car.aiWantsToPit && !car.inPitLane) {
      if (car.s >= 860 && car.s < 898) {
        const blend = (car.s - 860) / 38.0;
        desiredLat = desiredLat + (ROAD_HALF_WIDTH * 0.66 - desiredLat) * blend;
      } else if (car.s >= 898 && car.s <= 932) {
        desiredLat = ROAD_HALF_WIDTH * 0.72;
      }
    }

    // Apply wide lock-up drift if Rookie Wildcard is mid-excursion
    if (car.aiMistakeTimer > 0) {
      desiredLat = clamp(desiredLat + car.aiMistakeLatBias, -ROAD_HALF_WIDTH + 0.9, ROAD_HALF_WIDTH - 0.9);
    }

    // Real-time 240Hz Sidepod Respect Guard (1.25x+ car width) so AI never squeezes an overlapping car
    if (!car.inPitLane) {
      let rtLeftMin = -ROAD_HALF_WIDTH + 1.05;
      let rtRightMax = ROAD_HALF_WIDTH - 1.05;
      for (let i = 0; i < allCars.length; i++) {
        const other = allCars[i];
        if (other === car || other.exploded || other.inPitLane) continue;
        if (isShowroomDemo && other.isPlayer) continue;
        const dsReal = Math.abs(signedDeltaGameM(other.s, car.s)) * mPerGameM;
        const overlapZoneM = other.isPlayer ? CAR_LENGTH * 1.24 : CAR_LENGTH * 1.12;
        if (dsReal < overlapZoneM) {
          const corridor = CAR_WIDTH * (other.isPlayer ? 1.28 : 1.25);
          if (other.lateralOffset <= car.lateralOffset) {
            rtLeftMin = Math.max(rtLeftMin, other.lateralOffset + corridor);
          } else {
            rtRightMax = Math.min(rtRightMax, other.lateralOffset - corridor);
          }
        }
      }
      if (rtLeftMin <= rtRightMax) {
        desiredLat = clamp(desiredLat, rtLeftMin, rtRightMax);
      } else {
        desiredLat = clamp((rtLeftMin + rtRightMax) * 0.5, -ROAD_HALF_WIDTH + 1.0, ROAD_HALF_WIDTH - 1.0);
      }
    }

    const curK = car.inPitLane ? 0.0 : this.track.getPhysicsCurvature(car.s);
    const speedMps = car.speedKmh / 3.6;

    // Sync articulated DRS Rear Wing Flap state for 2026 3D car rigs & 60Hz Instant Replay
    car.drsActive = !isClassic && !car.inPitLane && Math.abs(curK) < 0.075 &&
      (car.inSlipstream || (car.speedKmh > 238.0 && car.brakeInput < 0.02));

    // Exact inverse-physics curvature feedforward: cancels centrifugalPush (-k * v^2 * 0.00315)
    // so AI carves tight Monaco hairpins & fast Monza sweepers without steady-state wide washout,
    // while remaining strictly 0.0 on straights (curK === 0)!
    let ffSteer = 0.0;
    if (!car.inPitLane && Math.abs(curK) > 0.005 && speedMps > 2.5) {
      const kvFactor = 1.0 + 0.00015 * speedMps * speedMps;
      const frontAeroEff = isClassic
        ? 1.0
        : (1.0 - car.damage.frontWing * 0.40 * clamp((car.speedKmh - 150) / 140, 0, 1));
      const steerAuth = (car.aquaplaneTimer > 0 ? 0.35 : 1.0) * Math.max(0.45, frontAeroEff);
      const rateDenom = Math.max(6.0, steerAuth * Math.min(28.5, speedMps * 0.60));
      const neededNonLin = clamp((curK * speedMps * speedMps * 0.00315 * kvFactor) / rateDenom, -0.95, 0.95);
      ffSteer = Math.sign(neededNonLin) * Math.pow(Math.abs(neededNonLin), 1.0 / 1.32);
    }

    const latErr = desiredLat - car.lateralOffset;
    const kp = arch.id === 'APEX_TACTICIAN' ? 0.36 : (arch.id === 'TIRE_WHISPERER' ? 0.30 : 0.33);
    const kd = arch.id === 'TIRE_WHISPERER' ? 0.068 : 0.060;
    const rawSteer = clamp(ffSteer + latErr * kp - car.lateralVel * kd, -1.0, 1.0);
    const steerRate = arch.id === 'TIRE_WHISPERER' ? 14.5 : 18.0;
    car.steerInput += (rawSteer - car.steerInput) * Math.min(1.0, dt * steerRate);

    // ------------------------------------------------------------------------
    // 240Hz THROTTLE & PROGRESSIVE TRAIL-BRAKING CONTROLLER
    // ------------------------------------------------------------------------
    const targetSpeedKmh = car._aiTargetSpeedKmh ?? 315.0;
    const speedDiff = targetSpeedKmh - car.speedKmh;
    const absCurK = Math.abs(curK);

    if (car.inPitLane && car.pitPhase === 'EXIT' && car.s >= PIT_LANE_CONFIG.mergeStartS && car.s <= PIT_LANE_CONFIG.mergeEndS) {
      car.throttleInput = 1.0;
      car.brakeInput = 0.0;
    } else if (speedDiff > 2.2) {
      // Progressive corner-exit traction modulation (especially silky for TIRE_WHISPERER)
      // while staying 100% full throttle on straightaways & fast chutes!
      let tractionCap = 1.0;
      if (absCurK > 0.32) {
        const wetW = isClassic ? 0.0 : this.weather.grooveMoisture;
        const cornerExitMod = arch.id === 'TIRE_WHISPERER' ? 0.84 : (arch.id === 'ROOKIE_WILDCARD' ? 1.0 : 0.93);
        tractionCap = clamp(cornerExitMod - wetW * 0.14, 0.62, 1.0);
      }
      car.throttleInput = clamp(0.38 + speedDiff * 0.055, 0.28, tractionCap);
      car.brakeInput = 0.0;
    } else if (speedDiff < -3.2) {
      // Trail-braking modulation: reduce peak brake pressure slightly when turning hard at high |curK|
      const overSpeed = -speedDiff;
      const brakeAgg = car._aiBrakeAggression || 1.0;
      const trailLimit = absCurK > 0.55 ? 0.86 : 1.0;
      if (overSpeed < 7.5 && absCurK < 0.20) {
        // Gentle aerodynamic lift-off for minor speed trim on fast sections (no jerky brake-check!)
        car.throttleInput = 0.06;
        car.brakeInput = 0.0;
      } else {
        car.throttleInput = 0.0;
        car.brakeInput = clamp((overSpeed / 44.0) * brakeAgg, 0.08, trailLimit);
      }
    } else {
      // Maintain speed with >0.22 throttle so AUTO_8SPD seamless upshifts stay active
      car.throttleInput = absCurK < 0.08 ? 0.92 : 0.52;
      car.brakeInput = 0.0;
    }

    // ------------------------------------------------------------------------
    // 8-SPEED AUTO / MANUAL / CLASSIC 2-SPEED TRANSMISSION COMPATIBILITY
    // ------------------------------------------------------------------------
    if (car.gearboxMode === 'AUTO_8SPD') {
      // Handled natively at 240Hz inside stepVehiclePhysics240Hz with sawtooth RPM & shift callbacks!
    } else if (car.gearboxMode === 'MANUAL_8SPD' && !isClassic) {
      if (car.shiftCooldown <= 0) {
        if (car.inPitLane && car.speedKmh <= 84.0 && car.gear > 2) {
          shiftGear(car, -1, callbacks);
        } else if (car.gear < 8 && car.throttleInput > 0.16 && car.speedKmh >= MANUAL_8_UPSHIFT[car.gear - 1]) {
          shiftGear(car, +1, callbacks);
        } else if (car.gear > 1 && car.speedKmh <= MANUAL_8_DOWNSHIFT[car.gear - 2]) {
          shiftGear(car, -1, callbacks);
        }
      }
    } else if (car.gearboxMode === 'PRO_6SPD' && !isClassic) {
      if (car.shiftCooldown <= 0) {
        if (car.gear < 6 && car.throttleInput > 0.16 && car.speedKmh >= MANUAL_6_UPSHIFT[car.gear - 1]) {
          shiftGear(car, +1, callbacks);
        } else if (car.gear > 1 && car.speedKmh <= MANUAL_6_DOWNSHIFT[car.gear - 2]) {
          shiftGear(car, -1, callbacks);
        }
      }
    } else {
      // CLASSIC_2SPD (1982 LOW / HIGH)
      if (car.shiftCooldown <= 0) {
        if (car.gear === 1 && car.speedKmh > 168.5) {
          shiftGear(car, +1, callbacks);
          car.shiftCooldown = 0.18;
        } else if (car.gear === 2 && car.speedKmh < 142.0) {
          shiftGear(car, -1, callbacks);
          car.shiftCooldown = 0.18;
        }
      }
    }

    // ------------------------------------------------------------------------
    // ROOKIE_WILDCARD MIRROR PRESSURE & WIDE LOCK-UP EXCURSIONS
    // ------------------------------------------------------------------------
    if (!isClassic && !isShowroomDemo && !isQualifying && arch.id === 'ROOKIE_WILDCARD' && !car.inPitLane && playerCar && !playerCar.exploded) {
      const gapAheadOfPlayerM = signedDeltaGameM(car.s, playerCar.s) * mPerGameM;
      // Rookie feels intense mirror pressure when directly ahead of Player within 4m..26m
      if (gapAheadOfPlayerM > 4.0 && gapAheadOfPlayerM < 26.0) {
        car.aiPressureTimer += dt * (absCurK > 0.25 ? 1.35 : 0.85);
        if (car.aiPressureTimer > 6.2 && absCurK > 0.34) {
          car.aiPressureTimer = -14.0; // Cooldown before another pressure mistake
          // Lock up front inside tire and drift wide toward outside kerb — giving Player a clean switchback pass
          // without triggering an unfair instant Yellow Flag right in front of the overtaking Player!
          const outsideDir = -Math.sign(curK || 1);
          car.aiMistakeTimer = 1.45;
          car.aiMistakeLatBias = outsideDir * 2.8;
          car.lateralVel += outsideDir * 4.2;
          car.speedKmh *= 0.84;
          car.skidIntensity = 1.0;
        }
      } else {
        car.aiPressureTimer = Math.max(0, car.aiPressureTimer - dt * 0.45);
      }
    }
  }

  // ==========================================================================
  // 25HZ 15-RAY SPATIAL RADAR, MULTI-CIRCUIT RACING LINE & KINEMATIC BRAKING
  // ==========================================================================
  _run15RaySpatialPlanner(car, allCars, playerCar, isClassic, isQualifying, isShowroomDemo, totalLaps, callbacks) {
    const arch = car.archetype || AI_ARCHETYPES.APEX_TACTICIAN;
    const mPerGameM = this.track.realMetersPerGameMeter || REAL_METERS_PER_GAME_METER;
    const s = car.s;
    const curSec = this.track.getSector(s);

    // ------------------------------------------------------------------------
    // 0. PIT LANE INTERNAL SPEED & MERGE EXECUTION
    // ------------------------------------------------------------------------
    if (car.inPitLane) {
      const targetBoxS = car.assignedPitBoxS ?? 30;
      if (car.pitPhase === 'ENTRY') {
        const distToBoxM = signedDeltaGameM(targetBoxS, s) * mPerGameM;
        if (distToBoxM <= 2.0) {
          car._aiTargetSpeedKmh = 0.0;
        } else if (distToBoxM < 28.0) {
          car._aiTargetSpeedKmh = clamp(14.0 + distToBoxM * 2.2, 14.0, PIT_LANE_CONFIG.speedLimitKmh - 1.5);
        } else {
          car._aiTargetSpeedKmh = PIT_LANE_CONFIG.speedLimitKmh - 1.5;
        }
      } else if (car.pitPhase === 'EXIT') {
        if (s >= PIT_LANE_CONFIG.mergeStartS && s <= PIT_LANE_CONFIG.mergeEndS) {
          car._aiTargetSpeedKmh = 315.0;
          car.aiTargetLat = ROAD_HALF_WIDTH * 0.56;
        } else {
          car._aiTargetSpeedKmh = PIT_LANE_CONFIG.speedLimitKmh - 1.5;
        }
      }
      car._aiBrakeAggression = 1.05;
      return;
    }

    // ------------------------------------------------------------------------
    // 1. MULTI-CIRCUIT SPLINE CURVATURE SAMPLES (0m, 15m, 45m, 95m, 140m)
    // ------------------------------------------------------------------------
    const curK = this.track.getPhysicsCurvature(s);
    const lookK15 = this.track.getPhysicsCurvature(s + 15.0 / mPerGameM);
    const lookK45 = this.track.getPhysicsCurvature(s + 45.0 / mPerGameM);
    const lookK95 = this.track.getPhysicsCurvature(s + 95.0 / mPerGameM);
    const lookK140 = this.track.getPhysicsCurvature(s + 140.0 / mPerGameM);

    // Dynamically detect next meaningful corner curvature on ANY circuit (Fuji, Monaco, Vegas, Monza)
    let upcomingCornerK = 0.0;
    const horizonSamples = [curK, lookK15, lookK45, lookK95, lookK140];
    for (let i = 0; i < horizonSamples.length; i++) {
      if (Math.abs(horizonSamples[i]) > 0.16) {
        upcomingCornerK = horizonSamples[i];
        break;
      }
    }

    // Detect S-bend / Chicane rapid direction flip (Nouvelle Chicane, Swimming Pool, Neon Chicane, Ascari, Rettifilo)
    const isChicaneFlip =
      (curK * lookK15 < -0.025) ||
      (lookK15 * lookK45 < -0.035) ||
      (curK * lookK45 < -0.045 && Math.abs(curK) > 0.22 && Math.abs(lookK45) > 0.22);

    // ------------------------------------------------------------------------
    // 2. 2026 PIT STRATEGY MONITOR
    // ------------------------------------------------------------------------
    if (!isClassic && !isQualifying && !isShowroomDemo) {
      if (car.lap >= totalLaps) {
        // Never pit on the final lap unless car has an active tire puncture before pit entry
        if (!car.damage.hasPuncture) car.aiWantsToPit = false;
      } else {
        this._evaluateAIPitStrategy(car, arch, totalLaps);
      }
    } else {
      car.aiWantsToPit = false;
    }

    // ------------------------------------------------------------------------
    // 3. SIDEPOD RAYS #14 & #15: WHEEL-TO-WHEEL CORNER RIGHTS (1.25x CAR WIDTH)
    // ------------------------------------------------------------------------
    let blockedLeftMax = -ROAD_HALF_WIDTH + 1.1;
    let blockedRightMin = (s >= 946 || s <= 78) ? (ROAD_HALF_WIDTH - 1.45) : (ROAD_HALF_WIDTH - 1.1);

    for (let i = 0; i < allCars.length; i++) {
      const other = allCars[i];
      if (other === car || other.exploded || other.inPitLane) continue;
      if (isShowroomDemo && other.isPlayer) continue;

      const dsReal = Math.abs(signedDeltaGameM(other.s, s)) * mPerGameM;
      const sideOverlapWindowM = other.isPlayer ? 6.4 : 5.6;
      if (dsReal < sideOverlapWindowM) {
        const minCorridor = CAR_WIDTH * (other.isPlayer ? 1.28 : 1.25); // >= 2.45m..2.51m fair sidepod room!
        if (other.lateralOffset <= car.lateralOffset) {
          blockedLeftMax = Math.max(blockedLeftMax, other.lateralOffset + minCorridor);
        } else {
          blockedRightMin = Math.min(blockedRightMin, other.lateralOffset - minCorridor);
        }
      }
    }

    // ------------------------------------------------------------------------
    // 4. MULTI-CIRCUIT IDEAL RACING LINE, PERSONALITIES & SLIPSTREAM SLINGSHOT
    // ------------------------------------------------------------------------
    const nextSec = this.track.getSector(s + 30.0 / mPerGameM);
    const inYellow = !isShowroomDemo && (
      this.raceSystems.isSectorYellow(curSec.id) ||
      this.raceSystems.isSectorYellow(nextSec.id)
    );
    const vscActive = !isShowroomDemo && this.raceSystems.vscActive;
    const W = isClassic ? 0.0 : this.weather.grooveMoisture;

    // Choose geometric racing line from real spline curvature
    let preferredLat = 0.0;
    const cornerFocusK = Math.abs(lookK15) > Math.abs(curK) * 1.08
      ? lookK15
      : (Math.abs(lookK45) > Math.abs(curK) * 1.25 && Math.abs(curK) < 0.14 ? lookK45 : curK);

    if (Math.abs(cornerFocusK) > 0.13) {
      // Inside apex target (+k bends Right -> +lat; -k bends Left -> -lat)
      let apexDepth = 4.75;
      if (arch.id === 'APEX_TACTICIAN') apexDepth = 5.45; // Clips deep late apex
      else if (arch.id === 'TIRE_WHISPERER') apexDepth = 4.95; // Smooth wide-radius arc
      else if (arch.id === 'LATE_BRAKER') apexDepth = 4.45; // Slightly deeper entry V-line
      else if (arch.id === 'ROOKIE_WILDCARD') apexDepth = 4.35;

      if (isChicaneFlip) {
        // Moderate first apex depth so car is poised to flick cleanly through second chicane apex
        apexDepth = Math.min(apexDepth, 4.05);
      }
      preferredLat = Math.sign(cornerFocusK) * apexDepth;
    } else if (Math.abs(lookK95) > 0.22 || Math.abs(lookK140) > 0.30) {
      // Straightaway corner-entry setup: move cleanly to outside tarmac before turn-in!
      const entryCornerK = Math.abs(lookK95) >= Math.abs(lookK140) * 0.75 ? lookK95 : lookK140;
      const entryWidth = arch.id === 'APEX_TACTICIAN' ? 5.1 : (arch.id === 'TIRE_WHISPERER' ? 4.8 : 4.3);
      preferredLat = -Math.sign(entryCornerK) * entryWidth;
    } else {
      // Pure straightaway cruise: slight natural stagger off centerline
      preferredLat = (car.carNum % 2 === 0 ? 1 : -1) * 1.8;
    }

    // DEFENSIVE_WALL (Senna / Mansell / Alonso): Cover inside line on ANY circuit when pursuer closes in!
    if (!isQualifying && !isShowroomDemo && !inYellow && !vscActive && arch.id === 'DEFENSIVE_WALL' && Math.abs(curK) < 0.15) {
      let closestThreat = null;
      let closestBehindM = arch.defensiveRangeM;

      // Prioritize defending against a charging Player, or any close rival behind
      for (let i = 0; i < allCars.length; i++) {
        const other = allCars[i];
        if (other === car || other.exploded || other.inPitLane) continue;
        const behindM = signedDeltaGameM(s, other.s) * mPerGameM;
        const rangeLimit = other.isPlayer ? arch.defensiveRangeM + 4.0 : arch.defensiveRangeM * 0.8;
        if (behindM > 5.8 && behindM <= rangeLimit && other.speedKmh > car.speedKmh - 12.0) {
          if (!closestThreat || other.isPlayer || behindM < closestBehindM) {
            closestThreat = other;
            closestBehindM = behindM;
            if (other.isPlayer) break;
          }
        }
      }

      if (closestThreat) {
        const insideSign = Math.abs(upcomingCornerK) > 0.12
          ? Math.sign(upcomingCornerK)
          : (closestThreat.lateralOffset >= 0 ? 1 : -1);
        const targetDefLat = clamp(
          insideSign * 4.25 + (closestThreat.lateralOffset - insideSign * 4.25) * 0.32,
          -ROAD_HALF_WIDTH + 1.6,
          ROAD_HALF_WIDTH - 1.6
        );
        // Smooth FIA single-move defense (no erratic weaving!)
        car.aiDefenseLat = car.aiDefenseLat === null
          ? targetDefLat
          : car.aiDefenseLat + (targetDefLat - car.aiDefenseLat) * 0.28;
        preferredLat = car.aiDefenseLat;
      } else {
        car.aiDefenseLat = null;
      }
    } else {
      car.aiDefenseLat = null;
    }

    // SLIPSTREAM TOW HARVEST & COMMITTED SLINGSHOT PULL-OUT (Works on ALL 4 Circuits!)
    const onFastSection = Math.abs(curK) < 0.14 && Math.abs(lookK15) < 0.18;
    const approachingBrakingZone = Math.abs(lookK95) > 0.28 || Math.abs(lookK140) > 0.42;
    let activeSlingshotTarget = null;

    if (!isQualifying && !isShowroomDemo && !inYellow && !vscActive) {
      let leadCandidate = null;
      let leadDistM = 44.0;

      for (let i = 0; i < allCars.length; i++) {
        const other = allCars[i];
        if (other === car || other.exploded || other.inPitLane) continue;
        const aheadM = forwardDistGameM(s, other.s) * mPerGameM;
        if (aheadM > 4.8 && aheadM < leadDistM) {
          leadDistM = aheadM;
          leadCandidate = other;
        }
      }

      if (leadCandidate) {
        const closingMps = Math.max(0, (car.speedKmh - leadCandidate.speedKmh) / 3.6);
        const ttcSec = closingMps > 0.4 ? leadDistM / closingMps : 99.0;
        const pulloutDistM = arch.id === 'LATE_BRAKER' ? 23.0 : (arch.id === 'ROOKIE_WILDCARD' ? 21.0 : 19.5);

        if (onFastSection && leadDistM >= pulloutDistM && ttcSec > 2.2 && !approachingBrakingZone && leadCandidate.speedKmh > 150) {
          // Stage 1: Tuck cleanly into slipstream wake to harvest +15 km/h tow!
          preferredLat = clamp(leadCandidate.lateralOffset, -ROAD_HALF_WIDTH + 1.8, ROAD_HALF_WIDTH - 1.8);
        } else if (leadDistM < 32.0 && (leadDistM < pulloutDistM || ttcSec <= 2.4 || (approachingBrakingZone && closingMps > -1.5))) {
          // Stage 2: Commit decisively to a clean overtake lane (Left or Right) with lock hysteresis!
          activeSlingshotTarget = leadCandidate;
          if (car.aiPassLockTimer <= 0) {
            car.aiPassSide = this._chooseBestOvertakeSide(car, leadCandidate, allCars, upcomingCornerK, arch, mPerGameM);
            car.aiPassLockTimer = 1.65;
          }
          // Ensure chosen side still has physical asphalt room if leader drifted toward barrier
          const leaderLat = leadCandidate.lateralOffset;
          const roomChosen = car.aiPassSide < 0
            ? leaderLat - (-ROAD_HALF_WIDTH + 1.3)
            : (ROAD_HALF_WIDTH - 1.3) - leaderLat;
          if (roomChosen < CAR_WIDTH * 1.30) {
            car.aiPassSide = -car.aiPassSide;
            car.aiPassLockTimer = 1.4;
          }
          const passSpacing = CAR_WIDTH * (leadCandidate.isPlayer ? 1.52 : 1.44);
          preferredLat = clamp(
            leaderLat + car.aiPassSide * passSpacing,
            -ROAD_HALF_WIDTH + 1.25,
            ROAD_HALF_WIDTH - 1.25
          );
        }
      }
    }

    // Showroom Hero Stage: keep AI traffic smoothly in the right lane past the parked #1 Pole Car
    if (isShowroomDemo && (s > 955 || s < 35)) {
      preferredLat = Math.max(3.2, preferredLat);
    }

    // Lap-start 2x2 grid discipline for the first 30 game-meters so 8-16 cars launch cleanly without tangling
    if (!isShowroomDemo && !isQualifying && car.lap === 1 && car.totalDistanceGameM < 28.0) {
      preferredLat = car.lateralOffset >= 0 ? Math.max(2.2, preferredLat) : Math.min(-2.2, preferredLat);
    }

    // ------------------------------------------------------------------------
    // 5. SCORE ALL 13 FORWARD RADAR RAYS (0m -> 140m) FOR TRAFFIC & HAZARDS
    // ------------------------------------------------------------------------
    const puddles = this.track.puddles || [];
    const debrisItems = this.raceSystems?.effects?.debrisItems || [];
    const checkPuddles = (isClassic && !isQualifying) || W > 0.24;

    let bestLane = clamp(car.lateralOffset, -ROAD_HALF_WIDTH + 1.15, ROAD_HALF_WIDTH - 1.15);
    let bestScore = -1e9;
    let anyValidRay = false;

    for (let rIdx = 0; rIdx < FORWARD_RAY_LANES.length; rIdx++) {
      const laneLat = FORWARD_RAY_LANES[rIdx];
      if (blockedLeftMax <= blockedRightMin && (laneLat < blockedLeftMax || laneLat > blockedRightMin)) {
        continue;
      }
      anyValidRay = true;

      let score = -Math.abs(laneLat - preferredLat) * 2.55;
      // Smoothness penalty prevents twitchy mid-straight lane snaps while allowing decisive slingshots
      const smoothWeight = activeSlingshotTarget ? 0.85 : 1.45;
      score -= Math.abs(laneLat - car.lateralOffset) * smoothWeight;

      // Slight edge buffer penalty right near white lines unless needed for overtaking
      if (Math.abs(laneLat) > 6.4) {
        score -= (Math.abs(laneLat) - 6.4) * 1.8;
      }

      // Scan 0m -> 140m ahead along candidate lane for slower/stopped cars
      for (let i = 0; i < allCars.length; i++) {
        const other = allCars[i];
        if (other === car || other.inPitLane) continue;
        if (isShowroomDemo && other.isPlayer && (s > 955 || s < 35) && laneLat >= 2.4) continue;

        const aheadM = forwardDistGameM(s, other.s) * mPerGameM;
        if (aheadM > 0 && aheadM <= 140.0) {
          const safeLatClearance = CAR_WIDTH * (other.isPlayer ? 1.32 : 1.25);
          const latSep = Math.abs(laneLat - other.lateralOffset);
          if (latSep < safeLatClearance) {
            const closingKmh = car.speedKmh - other.speedKmh;
            if (other.exploded || other.speedKmh < 75 || closingKmh > -6.0 || aheadM < 22.0) {
              const normUrgency = (144.0 - aheadM) / 140.0;
              const overlapFactor = 1.0 - (latSep / safeLatClearance) * 0.45;
              const basePenalty = other.exploded ? 260.0 : (aheadM < 16.0 ? 155.0 : 108.0);
              score -= normUrgency * normUrgency * basePenalty * overlapFactor;
            }
          }
        }
      }

      // Standing Puddle avoidance (weighted by archetype wet-weather awareness)
      if (checkPuddles) {
        for (let i = 0; i < puddles.length; i++) {
          const p = puddles[i];
          const aheadM = forwardDistGameM(s, p.s) * mPerGameM;
          if (aheadM > 0 && aheadM <= 115.0) {
            const latSep = Math.abs(laneLat - p.lat);
            if (latSep < p.radius + 1.15) {
              const prox = (118.0 - aheadM) / 118.0;
              score -= 48.0 * arch.puddleAvoidWeight * prox;
            }
          }
        }
      }

      // Carbon Fiber Debris avoidance (2026 Mode puncture hazard!)
      if (!isClassic && debrisItems.length > 0) {
        for (let i = 0; i < debrisItems.length; i++) {
          const deb = debrisItems[i];
          const aheadM = forwardDistGameM(s, deb.s) * mPerGameM;
          if (aheadM > 0 && aheadM <= 130.0) {
            const latSep = Math.abs(laneLat - deb.lateralOffset);
            if (latSep < deb.radius + 1.25) {
              const prox = (134.0 - aheadM) / 134.0;
              score -= 92.0 * prox;
            }
          }
        }
      }

      // LATE_BRAKER & ROOKIE_WILDCARD inside-lunge bonus when attacking into a braking zone!
      if (
        !inYellow &&
        !vscActive &&
        activeSlingshotTarget &&
        approachingBrakingZone &&
        (arch.id === 'LATE_BRAKER' || arch.id === 'ROOKIE_WILDCARD') &&
        Math.abs(upcomingCornerK) > 0.22
      ) {
        const insideSign = Math.sign(upcomingCornerK);
        const lungeWeight = arch.id === 'LATE_BRAKER' ? 1.85 : 1.35;
        score += (laneLat * insideSign * 0.25) * lungeWeight;
      }

      if (score > bestScore) {
        bestScore = score;
        bestLane = laneLat;
      }
    }

    if (!anyValidRay) {
      bestLane = (blockedLeftMax + blockedRightMin) * 0.5;
    } else if (blockedLeftMax <= blockedRightMin) {
      bestLane = clamp(bestLane, blockedLeftMax, blockedRightMin);
    }

    car.aiTargetLat = clamp(bestLane, -ROAD_HALF_WIDTH + 1.05, ROAD_HALF_WIDTH - 1.05);

    // ------------------------------------------------------------------------
    // 6. MULTI-CIRCUIT KINEMATIC CORNER SPEED & BRAKING ENVELOPE SOLVER
    // ------------------------------------------------------------------------
    // In 1982 Qualifying, rival traffic cruises at authentic classic Namco speeds (208-256 km/h)
    if (isClassic && isQualifying) {
      car._aiTargetSpeedKmh = 208.0 + (car.carNum % 5) * 11.5;
      car._aiBrakeAggression = 0.9;
      return;
    }

    // Update deterministic per-sector braking jitter for ROOKIE_WILDCARD / LATE_BRAKER
    const jitterKey = car.lap * 16 + curSec.id;
    if (car.aiLastJitterKey !== jitterKey) {
      car.aiLastJitterKey = jitterKey;
      const wave = Math.sin(car.lap * 7.13 + curSec.id * 2.71 + car.carNum * 1.93);
      car.aiLapBrakeJitter = wave * arch.brakeVarianceM;
    }

    const effGrip = this._estimateEffectiveGrip(car, curK, isClassic);

    // Archetype braking personality: LATE_BRAKER dives deeper & harder; TIRE_WHISPERER brakes smoother & earlier
    const archBrakeAgg = arch.id === 'LATE_BRAKER'
      ? 1.14
      : (arch.id === 'TIRE_WHISPERER' ? 0.91 : (arch.id === 'ROOKIE_WILDCARD' ? 1.08 : 1.0));
    car._aiBrakeAggression = archBrakeAgg;

    // Planned kinematic deceleration (m/s^2), scaled accurately by current tire & wet surface grip!
    const plannedDecelMps2 = (isClassic ? 28.0 : 26.2 * clamp(effGrip, 0.42, 1.14)) * archBrakeAgg;
    const brakeLeadMarginM = clamp(7.5 - arch.brakeOffsetM * 0.58 + car.aiLapBrakeJitter * 0.45, -1.5, 16.0);

    // Immediate corner speed: unwind smoothly onto throttle as soon as lookK15 opens past peak apex!
    const absCurK = Math.abs(curK);
    const absK15 = Math.abs(lookK15);
    const immediateEffK = absK15 < absCurK * 0.88
      ? (absCurK * 0.56 + absK15 * 0.44)
      : Math.max(absCurK, absK15 * 0.92);

    let minAllowedKmh = this._cornerSpeedKmhForCurvature(immediateEffK, effGrip, arch, isClassic);
    if (isChicaneFlip && Math.max(absCurK, absK15) > 0.26) {
      minAllowedKmh *= 0.94; // Crisp S-chicane direction change stability
    }

    // Scan multi-point spline lookahead (15m, 30m, 45m, 68m, 95m, 118m, 140m) using v_allow = sqrt(v_req^2 + 2*a*d)
    for (let i = 0; i < KINEMATIC_LOOKAHEAD_M.length; i++) {
      const distRealM = KINEMATIC_LOOKAHEAD_M[i];
      const kAtDist = Math.abs(this.track.getPhysicsCurvature(s + distRealM / mPerGameM));
      if (kAtDist < 0.05) continue;

      const reqCornerKmh = this._cornerSpeedKmhForCurvature(kAtDist, effGrip, arch, isClassic);
      const reqMps = reqCornerKmh / 3.6;
      const effBrakeDistM = Math.max(0.0, distRealM - brakeLeadMarginM);
      const allowMps = Math.sqrt(reqMps * reqMps + 2.0 * plannedDecelMps2 * effBrakeDistM);
      const allowKmh = allowMps * 3.6;

      if (allowKmh < minAllowedKmh) {
        minAllowedKmh = allowKmh;
      }
    }

    // Apply balanced competitive pace & gentle elastic pack rubber-banding
    // Note: on pure straights (minAllowedKmh > 308), allow full slipstream speed up to 332 km/h!
    const racePaceMult = this._computeCompetitivePaceMultiplier(car, playerCar, arch, isClassic, isQualifying, isShowroomDemo);
    let targetKmh = minAllowedKmh * racePaceMult;
    const straightCeilingKmh = isClassic ? 310.0 : 332.0;
    targetKmh = Math.min(straightCeilingKmh, targetKmh);

    // ------------------------------------------------------------------------
    // 7. PIT ENTRY BRAKING RAMP (ZERO 80 KM/H SPEEDING PENALTIES EVEN IN WET!)
    // ------------------------------------------------------------------------
    if (!isClassic && !isShowroomDemo && car.aiWantsToPit && s >= 850) {
      const distToLimitLineM = Math.max(0, (PIT_LANE_CONFIG.speedLimitLineS - s) * mPerGameM);
      const limitMps = (PIT_LANE_CONFIG.speedLimitKmh - 2.5) / 3.6;
      const pitDecel = Math.max(11.5, plannedDecelMps2 * 0.78);
      const pitAllowKmh = Math.sqrt(limitMps * limitMps + 2.0 * pitDecel * Math.max(0, distToLimitLineM - 6.0)) * 3.6;
      targetKmh = Math.min(targetKmh, pitAllowKmh);
    }

    // ------------------------------------------------------------------------
    // 8. ANTI-REAR-END GAP CONTROL, LOCAL YELLOW FLAGS & VSC SPEED CAPS
    // ------------------------------------------------------------------------
    let directAheadCar = null;
    let directAheadDistM = 999.0;
    let anyAheadInYellowCar = null;
    let anyAheadInYellowDistM = 999.0;

    for (let i = 0; i < allCars.length; i++) {
      const other = allCars[i];
      if (other === car || other.inPitLane) continue;
      if (isShowroomDemo && other.isPlayer) continue;

      const aheadM = forwardDistGameM(s, other.s) * mPerGameM;
      if (aheadM <= 0.5 || aheadM > 46.0) continue;

      // Track closest healthy car anywhere ahead on track for strict Yellow Flag / VSC no-passing compliance
      if (!other.exploded && other.speedKmh >= 65.0 && aheadM < anyAheadInYellowDistM) {
        anyAheadInYellowDistM = aheadM;
        anyAheadInYellowCar = other;
      }

      // Track any car physically overlapping our current or target lane corridor
      const inCurrentPath = Math.abs(car.lateralOffset - other.lateralOffset) < CAR_WIDTH * 1.06;
      const inTargetPath = Math.abs(car.aiTargetLat - other.lateralOffset) < CAR_WIDTH * 1.06;
      if ((inCurrentPath && aheadM < 22.0) || (inCurrentPath && inTargetPath && aheadM < 36.0)) {
        if (aheadM < directAheadDistM) {
          directAheadDistM = aheadM;
          directAheadCar = other;
        }
      }
    }

    // Progressive kinematic anti-rear-end gap control when behind a car before lateral clearance is achieved
    if (directAheadCar && !directAheadCar.exploded) {
      const clearToPass = Math.abs(car.lateralOffset - directAheadCar.lateralOffset) >= CAR_WIDTH * 1.04;
      if (!clearToPass) {
        const followGapM = directAheadCar.isPlayer ? 8.2 : 7.4;
        if (directAheadDistM < followGapM) {
          targetKmh = Math.min(targetKmh, directAheadCar.speedKmh - 7.0);
        } else {
          const relAllowMps = Math.sqrt(2.0 * 16.0 * Math.max(0, directAheadDistM - followGapM));
          const safeFollowKmh = directAheadCar.speedKmh + relAllowMps * 3.6;
          targetKmh = Math.min(targetKmh, safeFollowKmh);
        }
      }
    }

    // If boxed in 3-wide side-by-side, ease off slightly to resolve sandwich safely
    if (blockedLeftMax > blockedRightMin) {
      targetKmh = Math.min(targetKmh, car.speedKmh - 10.0);
    }

    // Local Yellow Flag compliance: slow down cleanly & strictly hold position behind healthy cars!
    if (inYellow) {
      targetKmh = Math.min(targetKmh * 0.80, 218.0);
      if (anyAheadInYellowCar && anyAheadInYellowDistM < 34.0) {
        const yellowHoldKmh = anyAheadInYellowCar.speedKmh + clamp((anyAheadInYellowDistM - 11.5) * 1.4, -8.0, 4.0);
        targetKmh = Math.min(targetKmh, yellowHoldKmh);
      }
    }

    // Virtual Safety Car (VSC) delta limiter (physics caps at 160 km/h; AI holds crisp 156 km/h formation)
    if (vscActive) {
      targetKmh = Math.min(targetKmh, 156.5);
      if (anyAheadInYellowCar && anyAheadInYellowDistM < 24.0) {
        targetKmh = Math.min(targetKmh, anyAheadInYellowCar.speedKmh + clamp((anyAheadInYellowDistM - 10.5) * 1.2, -6.0, 2.0));
      }
    }

    // Rookie pressure mistake speed scrub
    if (car.aiMistakeTimer > 0) {
      targetKmh *= 0.82;
    }

    car._aiTargetSpeedKmh = Math.max(62.0, targetKmh);
  }

  // ==========================================================================
  // HELPER: CHOOSE CLEANEST OVERTAKE SIDE (INSIDE LUNGE VS OPEN ASPHALT)
  // ==========================================================================
  _chooseBestOvertakeSide(car, leader, allCars, upcomingCornerK, arch, mPerGameM) {
    const spacing = CAR_WIDTH * 1.48;
    const leftCand = leader.lateralOffset - spacing;
    const rightCand = leader.lateralOffset + spacing;

    const leftValid = leftCand >= -ROAD_HALF_WIDTH + 1.25;
    const rightValid = rightCand <= ROAD_HALF_WIDTH - 1.25;
    if (leftValid && !rightValid) return -1;
    if (rightValid && !leftValid) return 1;

    let leftScore = 0.0;
    let rightScore = 0.0;

    // Prefer side closer to our current lateral offset for smoother pull-out
    leftScore -= Math.abs(car.lateralOffset - leftCand) * 0.55;
    rightScore -= Math.abs(car.lateralOffset - rightCand) * 0.55;

    // Corner inside preference (+k = Right inside +1, -k = Left inside -1)
    if (Math.abs(upcomingCornerK) > 0.16) {
      const insideSide = Math.sign(upcomingCornerK);
      const insideBonus = arch.id === 'LATE_BRAKER' ? 4.2 : (arch.id === 'ROOKIE_WILDCARD' ? 3.2 : 1.8);
      if (insideSide < 0) leftScore += insideBonus;
      else rightScore += insideBonus;
    }

    // Penalize side if another car ahead within 55m occupies that overtake lane
    for (let i = 0; i < allCars.length; i++) {
      const other = allCars[i];
      if (other === car || other === leader || other.inPitLane) continue;
      const aheadM = forwardDistGameM(car.s, other.s) * mPerGameM;
      if (aheadM >= -3.0 && aheadM <= 55.0) {
        if (Math.abs(other.lateralOffset - leftCand) < CAR_WIDTH * 1.2) leftScore -= 9.0;
        if (Math.abs(other.lateralOffset - rightCand) < CAR_WIDTH * 1.2) rightScore -= 9.0;
      }
    }

    return rightScore > leftScore ? 1 : -1;
  }

  // ==========================================================================
  // HELPER: REAL-TIME TIRE, WEAR, WET & DAMAGE GRIP ESTIMATOR
  // ==========================================================================
  _estimateEffectiveGrip(car, curK, isClassic) {
    if (isClassic) return 1.06;

    const comp = TIRE_COMPOUNDS[car.compound] || TIRE_COMPOUNDS.MEDIUM;
    const localW = this.weather.getMoistureAt
      ? this.weather.getMoistureAt(curK, car.lateralOffset)
      : this.weather.grooveMoisture;

    let baseMu = comp.baseGrip;
    if (!comp.isWetTire) {
      baseMu = comp.baseGrip * (1.0 - 0.54 * localW);
    } else if (comp.id === 'INTERMEDIATE') {
      if (localW < 0.10) baseMu = 0.88;
      else if (localW <= 0.58) baseMu = 1.04;
      else baseMu = 0.89 - (localW - 0.58) * 0.24;
    } else if (comp.id === 'FULL_WET') {
      baseMu = localW < 0.20 ? 0.80 : (0.97 + Math.min(0.08, (localW - 0.45) * 0.18));
    }

    const avgLife = (car.tires.FL.life + car.tires.FR.life + car.tires.RL.life + car.tires.RR.life) * 0.25;
    const minLife = Math.min(car.tires.FL.life, car.tires.FR.life, car.tires.RL.life, car.tires.RR.life);
    const effLife = avgLife * 0.65 + minLife * 0.35;

    let wearMult = 1.0;
    if (effLife >= 0.25) {
      wearMult = 0.93 + 0.07 * ((effLife - 0.25) / 0.75);
    } else {
      const ratio = Math.max(0, effLife / 0.25);
      wearMult = 0.48 + 0.45 * Math.pow(ratio, 2.0);
    }

    if (car.damage.hasPuncture) wearMult = 0.34;
    const aeroDamageMult = 1.0 - car.damage.frontWing * 0.22 - car.damage.suspension * 0.16;

    return clamp(baseMu * wearMult * aeroDamageMult, 0.32, 1.18);
  }

  // ==========================================================================
  // HELPER: CONTINUOUS SPLINE CURVATURE -> APEX TARGET SPEED (ALL 4 CIRCUITS)
  // ==========================================================================
  _cornerSpeedKmhForCurvature(absK, effGrip, arch, isClassic) {
    const maxStraightKmh = isClassic ? 310.0 : 332.0;
    if (absK <= 0.035) return maxStraightKmh;

    // Continuous aerodynamic + mechanical F1 cornering curve:
    // k=0.12 -> ~307 km/h | k=0.25 -> ~274 km/h | k=0.38 -> ~242 km/h (100R/Parabolica)
    // k=0.55 -> ~202 km/h | k=0.68 -> ~173 km/h (Daiichi/Sainte-Devote) | k=0.85 -> ~136 km/h (Hairpins/Chicanes)
    const normK = clamp((absK - 0.035) / 0.88, 0.0, 1.06);
    const dryApexKmh = 332.0 - 210.0 * Math.pow(normK, 0.91);

    // Physical lateral grip scaling (v proportional to sqrt(mu))
    const gripScale = Math.sqrt(clamp(effGrip / 1.04, 0.36, 1.10));

    // Subtle personality cornering traits
    let archCornerMod = 1.0;
    if (arch.id === 'TIRE_WHISPERER') archCornerMod = 1.022; // Carries silky mid-corner rolling speed
    else if (arch.id === 'APEX_TACTICIAN') archCornerMod = 1.015;
    else if (arch.id === 'DEFENSIVE_WALL') archCornerMod = 0.996;
    else if (arch.id === 'LATE_BRAKER') archCornerMod = 0.992; // V-shapes apex slightly slower after deep lunge

    return clamp(dryApexKmh * gripScale * archCornerMod, 78.0, maxStraightKmh);
  }

  // ==========================================================================
  // HELPER: BALANCED PACE & FAIR ELASTIC PACK RUBBER-BANDING (P8 -> P1 BATTLES)
  // ==========================================================================
  _computeCompetitivePaceMultiplier(car, playerCar, arch, isClassic, isQualifying, isShowroomDemo) {
    const baseSkill = (arch.basePace || 0.992) + (car.aiSkillTierOffset || 0.0);
    if (isShowroomDemo || isQualifying || !playerCar || playerCar.exploded || playerCar.inPitLane) {
      return clamp(baseSkill, 0.965, 1.015);
    }

    // Do not rubber-band during initial standing-start sprint
    if (playerCar.totalDistanceGameM < 30.0) {
      return clamp(baseSkill, 0.97, 1.012);
    }

    // Gap in game-meters (>0 means AI is ahead of Player; <0 means AI is behind Player)
    const gapGameM = car.totalDistanceGameM - playerCar.totalDistanceGameM;
    let elastic = 1.0;

    if (gapGameM > 32.0) {
      // AI is >135m ahead of Player: gently temper runaway leaders so clean mobile laps can reel in P1!
      const excess = Math.min(1.0, (gapGameM - 32.0) / 145.0);
      elastic = 1.0 - excess * (isClassic ? 0.048 : 0.042);
    } else if (gapGameM < -36.0 && !car.damage.hasPuncture && car.fuelLaps > 0.2) {
      // AI is >150m behind Player: subtle catch-up tow keeps midfield pack competitive
      const deficit = Math.min(1.0, (-gapGameM - 36.0) / 160.0);
      elastic = 1.0 + deficit * 0.028;
    }
    // Note: Within [-36..+32] game-meters (~140m battle bubble!), elastic === 1.0 for 100% pure honest racing!

    return clamp(baseSkill * elastic, 0.942, 1.032);
  }

  // ==========================================================================
  // 2026 F1 PIT STOP STRATEGY ENGINE (TIRE CLIFF, FUEL, WEATHER & UNDERCUTS)
  // ==========================================================================
  _evaluateAIPitStrategy(car, arch, totalLaps) {
    if (car.aiWantsToPit) return;

    const minLife = Math.min(car.tires.FL.life, car.tires.FR.life, car.tires.RL.life, car.tires.RR.life);
    const W = this.weather.grooveMoisture;
    const isWetCompound = car.compound === 'INTERMEDIATE' || car.compound === 'FULL_WET';

    const wrongTireForRain =
      (!isWetCompound && W > 0.28) ||
      (car.compound === 'INTERMEDIATE' && W > 0.66) ||
      (isWetCompound && W < 0.07);

    const needsDamageFix =
      car.damage.hasPuncture ||
      car.damage.frontWing > 0.55 ||
      car.damage.rearWing > 0.58 ||
      car.damage.suspension > 0.58;

    // Prevent back-to-back lap pit stops unless emergency puncture or sudden weather mismatch
    if (car._aiLastPitLap === car.lap && !car.damage.hasPuncture && !wrongTireForRain) {
      return;
    }

    // APEX_TACTICIAN undercuts 1 lap before the 25% tire cliff (~33% life);
    // TIRE_WHISPERER stretches stint for an overcut (~22% life);
    // VSC active opens an opportunistic "cheap pit stop" window if tires < 56%!
    const lapsLeft = Math.max(1, totalLaps - car.lap);
    const lifeThreshold = (this.raceSystems.vscActive && lapsLeft >= 2)
      ? 0.56
      : clamp(0.265 + arch.undercutLapsEarly * 0.06, 0.21, 0.34);

    const needsFuel = car.fuelLaps < Math.min(1.32, lapsLeft + 0.22);

    if (minLife < lifeThreshold || needsFuel || wrongTireForRain || needsDamageFix) {
      car.aiWantsToPit = true;
      car._aiLastPitLap = car.lap;

      const stintLapsRemaining = Math.max(2, totalLaps - car.lap + 1);
      let nextComp = arch.preferredDryTire || 'MEDIUM';

      if (W > 0.56) {
        nextComp = 'FULL_WET';
      } else if (W > 0.18) {
        nextComp = 'INTERMEDIATE';
      } else if (stintLapsRemaining <= 4) {
        nextComp = 'SOFT'; // Final sprint on red-walled Softs!
      } else if (stintLapsRemaining <= 9) {
        nextComp = (arch.preferredDryTire === 'SOFT' && stintLapsRemaining <= 6) ? 'SOFT' : 'MEDIUM';
      } else {
        nextComp = arch.id === 'LATE_BRAKER' ? 'MEDIUM' : 'HARD';
      }

      let repairOrder = 'NONE';
      if (car.damage.suspension > 0.42) {
        repairOrder = 'FULL';
      } else if (car.damage.frontWing > 0.40 || car.damage.rearWing > 0.42) {
        repairOrder = 'WINGS';
      }

      const crewPushMode = arch.id === 'APEX_TACTICIAN'
        ? 'AGGRESSIVE_UNDERCUT'
        : (arch.id === 'TIRE_WHISPERER' ? 'SAFE' : 'BALANCED');

      car.aiPitPlan = {
        nextCompound: nextComp,
        fuelToAdd: 'FILL',
        repairOrder,
        crewPushMode,
      };
    }
  }
}
