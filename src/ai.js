// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Autonomous Spatial AI Engine (A+ Edition):
// - Zero-Cheat 240Hz Physics Parity & Multi-Car Slipstream DRS Trains
// - Coordinated Inside Late-Braking Lunges & Over-Under Exit Switchbacks
// - Strict FIA 1-Move Defensive Rule & >=1.25x Car-Width Chicane Corridors
// - Continuous car.aiPressureMeter (0..1) -> Inside-Front Lockup Smoke & 1.0–1.6m Wide Apex Drift
// - Real-Time Undercut / Overcut Clean-Air Solver & W > 0.28 Wet Pit Transitions
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

// Multi-horizon spline lookahead distances in real meters (covers tight chicanes -> 331 km/h heavy braking zones)
const KINEMATIC_LOOKAHEAD_M = [15.0, 30.0, 45.0, 68.0, 95.0, 118.0, 140.0];

// Manual gearbox fallback shift points (mirrors physics.js 8-speed & 6-speed ratios with clean hysteresis)
const MANUAL_8_UPSHIFT = [102, 141, 176, 208, 237, 263, 287];
const MANUAL_8_DOWNSHIFT = [82, 118, 152, 182, 210, 236, 260];
const MANUAL_6_UPSHIFT = [110, 155, 196, 234, 268];
const MANUAL_6_DOWNSHIFT = [88, 128, 166, 202, 236];

// Personality composure & pressure susceptibility profiles
const PRESSURE_SUSCEPTIBILITY = {
  ROOKIE_WILDCARD: 1.68,
  LATE_BRAKER: 1.26,
  DEFENSIVE_WALL: 0.56,
  TIRE_WHISPERER: 0.50,
  APEX_TACTICIAN: 0.44,
};

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

    // Continuous 0..1 Human Pressure Telemetry & Apex Lockup Excursion State
    car.aiPressureMeter = 0.0;
    car.aiPressureTimer = 0.0;
    car.aiPressureCooldown = 0.0;
    car.aiMistakeTimer = 0.0;
    car.aiMistakeDuration = 1.35;
    car.aiMistakeLatBias = 0.0;
    car.aiMistakePeakLat = 0.0;
    car.aiLockupPuffTimer = 0.0;
    car.aiLockupCooldown = (index * 0.7) % 2.5;

    // Multi-Car Slipstream Train, Switchback Cutback & FIA 1-Move Defense State
    car.aiInDraftTrain = false;
    car.aiDraftTrainCount = 0;
    car.aiPassSide = index % 2 === 0 ? -1 : 1;
    car.aiPassLockTimer = 0.0;
    car.aiSwitchbackTimer = 0.0;
    car.aiSwitchbackSign = 0;
    car.aiDefenseLat = null;
    car.aiDefenseMovesUsed = 0;
    car.aiDefenseCommittedSide = 0;
    car.aiWasInCorner = false;

    // Realistic grid reaction stagger & subtle driver championship tier spread
    const baseReact = 0.05 + ((index * 37) % 17) * 0.009;
    const archReact = arch.id === 'LATE_BRAKER' || arch.id === 'DEFENSIVE_WALL'
      ? -0.02
      : (arch.id === 'ROOKIE_WILDCARD' ? 0.045 : 0.0);
    car.aiLaunchDelaySec = Math.max(0.02, baseReact + archReact);
    car.aiSkillTierOffset = clamp(0.010 - index * 0.0021, -0.018, 0.010);

    // Real-Time Undercut / Overcut & Wet Transition Pit Strategy State
    car.aiWantsToPit = false;
    car.aiPitPlan = null;
    car.aiPitReason = 'NONE';
    car.aiDirtyAirStuckTimer = 0.0;
    car.aiCleanAirTimer = 0.0;
    car.aiOutLapPushTimer = 0.0;
    car.aiOvercutActive = false;
    car._aiLastPitLap = 0;
    car._aiPrevPitPhase = 'NONE';
    car._aiTargetSpeedKmh = 315.0;
    car._aiBrakeAggression = 1.0;
  }

  updateAI(car, allCars, playerCar, dt, ctx) {
    const { mode, isQualifying, controlsLocked, totalLaps = 5, callbacks = {} } = ctx;
    if (car.exploded || car.pitPhase === 'STOPPED') return;

    // Detect fresh pit-exit out-lap so undercut strategy unleashes maximum fresh-rubber pace!
    if (car._aiPrevPitPhase === 'STOPPED' && car.pitPhase === 'EXIT') {
      car.aiOutLapPushTimer = 38.0;
      car.aiDirtyAirStuckTimer = 0.0;
      car.aiOvercutActive = false;
    }
    car._aiPrevPitPhase = car.pitPhase;

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

    if (car.aiPassLockTimer > 0) car.aiPassLockTimer = Math.max(0, car.aiPassLockTimer - dt);
    if (car.aiSwitchbackTimer > 0) car.aiSwitchbackTimer = Math.max(0, car.aiSwitchbackTimer - dt);
    if (car.aiMistakeTimer > 0) car.aiMistakeTimer = Math.max(0, car.aiMistakeTimer - dt);
    if (car.aiLockupPuffTimer > 0) car.aiLockupPuffTimer = Math.max(0, car.aiLockupPuffTimer - dt);
    if (car.aiLockupCooldown > 0) car.aiLockupCooldown = Math.max(0, car.aiLockupCooldown - dt);
    if (car.aiPressureCooldown > 0) car.aiPressureCooldown = Math.max(0, car.aiPressureCooldown - dt);
    if (car.aiOutLapPushTimer > 0) car.aiOutLapPushTimer = Math.max(0, car.aiOutLapPushTimer - dt);

    // Brief human reaction delay right off the starting grid
    if (!isShowroomDemo && !isQualifying && car.lap === 1 && car.currentLapTime < (car.aiLaunchDelaySec || 0)) {
      car.steerInput = 0.0;
      car.throttleInput = 0.45;
      car.brakeInput = 0.0;
      return;
    }

    // ------------------------------------------------------------------------
    // CONTINUOUS 240Hz HUMAN PRESSURE TELEMETRY (car.aiPressureMeter in 0..1)
    // ------------------------------------------------------------------------
    const curK = car.inPitLane ? 0.0 : this.track.getPhysicsCurvature(car.s);
    const absCurK = Math.abs(curK);
    const speedMps = car.speedKmh / 3.6;

    // Reset FIA 1-Move Defensive Counter upon completing each corner onto a new straight!
    if (absCurK > 0.22) {
      car.aiWasInCorner = true;
    } else if (car.aiWasInCorner && absCurK < 0.10) {
      car.aiWasInCorner = false;
      car.aiDefenseMovesUsed = 0;
      car.aiDefenseCommittedSide = 0;
      car.aiDefenseLat = null;
    }

    this._updateHumanPressureAndMistakes(
      car,
      allCars,
      playerCar,
      curK,
      absCurK,
      speedMps,
      mPerGameM,
      isClassic,
      isQualifying,
      isShowroomDemo,
      arch,
      dt
    );

    // 25Hz 15-Ray Spatial Radar, Multi-Car Slipstream Train & Kinematic Speed Planner
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

    // Smooth peel-off toward right-hand Pit Entry split (s in [860..932]) when boxing in 2026 mode
    if (!isClassic && !isShowroomDemo && car.aiWantsToPit && !car.inPitLane) {
      if (car.s >= 860 && car.s < 898) {
        const blend = (car.s - 860) / 38.0;
        desiredLat = desiredLat + (ROAD_HALF_WIDTH * 0.66 - desiredLat) * blend;
      } else if (car.s >= 898 && car.s <= 932) {
        desiredLat = ROAD_HALF_WIDTH * 0.72;
      }
    }

    // Apply smooth 1.0m–1.6m wide apex lockup drift envelope when pressure triggers a mistake!
    if (car.aiMistakeTimer > 0) {
      const dur = Math.max(0.35, car.aiMistakeDuration || 1.35);
      const phase = 1.0 - clamp(car.aiMistakeTimer / dur, 0.0, 1.0);
      const bell = Math.sin(Math.PI * phase);
      car.aiMistakeLatBias = (car.aiMistakePeakLat || 0.0) * bell;
      desiredLat = clamp(
        desiredLat + car.aiMistakeLatBias,
        -ROAD_HALF_WIDTH + 1.05,
        ROAD_HALF_WIDTH - 1.05
      );
    } else {
      car.aiMistakeLatBias = 0.0;
    }

    // 240Hz Emergency Lateral Evasion when directly behind a braking/slower Player in braking zones
    let emergencyBrakeBehindPlayer = 0.0;
    if (!car.inPitLane && !isShowroomDemo && playerCar && !playerCar.exploded && !playerCar.inPitLane) {
      const playerAheadM = forwardDistGameM(car.s, playerCar.s) * mPerGameM;
      if (playerAheadM > 1.2 && playerAheadM < 34.0) {
        const latToPlayer = Math.abs(car.lateralOffset - playerCar.lateralOffset);
        const closingOnPlayer = car.speedKmh - playerCar.speedKmh;
        if (latToPlayer < CAR_WIDTH * 1.36 && (playerCar.brakeInput > 0.15 || closingOnPlayer > 7.5)) {
          const roomLeft = playerCar.lateralOffset - (-ROAD_HALF_WIDTH + 1.35);
          const roomRight = (ROAD_HALF_WIDTH - 1.35) - playerCar.lateralOffset;
          let evadeSide = car.aiPassSide || 1;
          if (evadeSide < 0 && roomLeft < CAR_WIDTH * 1.35) evadeSide = 1;
          else if (evadeSide > 0 && roomRight < CAR_WIDTH * 1.35) evadeSide = -1;
          const evadeLat = clamp(
            playerCar.lateralOffset + evadeSide * (CAR_WIDTH * 1.56),
            -ROAD_HALF_WIDTH + 1.15,
            ROAD_HALF_WIDTH - 1.15
          );
          const urgencyBlend = clamp((34.0 - playerAheadM) / 22.0, 0.35, 1.0);
          desiredLat = desiredLat + (evadeLat - desiredLat) * urgencyBlend;

          if (playerAheadM < 20.0 && latToPlayer < CAR_WIDTH * 1.12) {
            emergencyBrakeBehindPlayer = clamp(
              (closingOnPlayer + (playerCar.brakeInput > 0.2 ? 16.0 : 8.0)) / 34.0,
              playerCar.brakeInput * 0.85,
              1.0
            );
          }
        }
      }
    }

    // Real-time 240Hz Sidepod Respect Guard (>= 1.25x car width, widened slightly in chicanes!)
    if (!car.inPitLane) {
      const lookK20 = this.track.getPhysicsCurvature(car.s + 20.0 / mPerGameM);
      const inRealtimeChicane = (curK * lookK20 < -0.025) || (absCurK > 0.28 && Math.abs(lookK20) > 0.28);
      let rtLeftMin = -ROAD_HALF_WIDTH + 1.05;
      let rtRightMax = ROAD_HALF_WIDTH - 1.05;
      for (let i = 0; i < allCars.length; i++) {
        const other = allCars[i];
        if (other === car || other.exploded || other.inPitLane) continue;
        if (isShowroomDemo && other.isPlayer) continue;
        const dsReal = Math.abs(signedDeltaGameM(other.s, car.s)) * mPerGameM;
        const overlapZoneM = (other.isPlayer ? CAR_LENGTH * 1.30 : CAR_LENGTH * 1.18) + (inRealtimeChicane ? 1.4 : 0.0);
        if (dsReal < overlapZoneM) {
          const corridor = CAR_WIDTH * (other.isPlayer ? 1.30 : (inRealtimeChicane ? 1.28 : 1.25));
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

    // Sync articulated DRS Rear Wing Flap & MGU-K ERS Overtake state for 2026 3D rigs & 60Hz Replay
    car.drsActive = !isClassic && !car.inPitLane && absCurK < 0.075 &&
      (car.inSlipstream || (car.speedKmh > 238.0 && car.brakeInput < 0.02));
    car.ersOvertakeRequested = !isClassic && !car.inPitLane && (car.ersCharge ?? 1.0) > 0.18 &&
      car.brakeInput < 0.02 && absCurK < 0.22 &&
      (car.aiPassLockTimer > 0 || car.aiSwitchbackTimer > 0 || car.aiOutLapPushTimer > 0 || car.aiDefenseMovesUsed > 0);
    if (car.ersOvertakeRequested && car.throttleInput > 0.78) {
      car.ersDeploying = true;
    }

    // Exact inverse-physics curvature feedforward: cancels centrifugalPush (-k * v^2 * 0.00315)
    // so AI carves tight Monaco hairpins & fast Monza sweepers without steady-state wide washout,
    // while remaining strictly 0.0 on straights (curK === 0)!
    let ffSteer = 0.0;
    if (!car.inPitLane && absCurK > 0.005 && speedMps > 2.5) {
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

    if (car.inPitLane && car.pitPhase === 'EXIT' && car.s >= PIT_LANE_CONFIG.mergeStartS && car.s <= PIT_LANE_CONFIG.mergeEndS) {
      car.throttleInput = 1.0;
      car.brakeInput = 0.0;
    } else if (speedDiff > 2.2) {
      // Progressive corner-exit traction modulation (especially silky for TIRE_WHISPERER;
      // sharper launch on switchback exit cutbacks!)
      let tractionCap = 1.0;
      if (absCurK > 0.32) {
        const wetW = isClassic ? 0.0 : this.weather.grooveMoisture;
        const switchbackBoost = car.aiSwitchbackTimer > 0 ? 0.05 : 0.0;
        const cornerExitMod = arch.id === 'TIRE_WHISPERER' ? 0.85 : (arch.id === 'ROOKIE_WILDCARD' ? 1.0 : 0.93);
        tractionCap = clamp(cornerExitMod + switchbackBoost - wetW * 0.14, 0.62, 1.0);
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
      car.throttleInput = absCurK < 0.08 ? 0.94 : 0.52;
      car.brakeInput = 0.0;
    }

    // Override with 240Hz anti-rear-end braking respect when directly behind a braking Player
    if (emergencyBrakeBehindPlayer > 0.05) {
      car.throttleInput = 0.0;
      car.brakeInput = Math.max(car.brakeInput, emergencyBrakeBehindPlayer);
    }

    // Inside-front tire-smoke lockup puffs when diving deep into heavy braking zones or under high pressure!
    if (!car.inPitLane && !isShowroomDemo && car.brakeInput > 0.44 && car.speedKmh > 110.0) {
      if (car.aiLockupPuffTimer <= 0 && car.aiLockupCooldown <= 0) {
        const underBattlePressure = (car.aiPressureMeter || 0) > 0.42 || car.inSlipstream || car.aiInDraftTrain;
        const pressureBonus = (car.aiPressureMeter || 0) * 0.35;
        const lockupChance = (arch.id === 'LATE_BRAKER'
          ? 0.40
          : (arch.id === 'ROOKIE_WILDCARD' ? 0.46 : (underBattlePressure ? 0.20 : 0.08))) + pressureBonus;
        if (underBattlePressure && Math.random() < lockupChance) {
          car.aiLockupPuffTimer = 0.28 + Math.random() * 0.26;
          car.aiLockupCooldown = 3.0 + Math.random() * 2.4;
        } else {
          car.aiLockupCooldown = 0.85;
        }
      }
    }
    if (car.aiLockupPuffTimer > 0 && (car.brakeInput > 0.18 || car.aiMistakeTimer > 0)) {
      car.skidIntensity = Math.max(car.skidIntensity || 0, 0.90);
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
  }

  // ==========================================================================
  // HUMAN MISTAKES UNDER PRESSURE (car.aiPressureMeter in 0..1 -> Lockup & 1.0–1.6m Wide)
  // ==========================================================================
  _updateHumanPressureAndMistakes(
    car,
    allCars,
    playerCar,
    curK,
    absCurK,
    speedMps,
    mPerGameM,
    isClassic,
    isQualifying,
    isShowroomDemo,
    arch,
    dt
  ) {
    if (isShowroomDemo || isQualifying || car.inPitLane) {
      car.aiPressureMeter = Math.max(0, (car.aiPressureMeter || 0) - dt * 0.35);
      return;
    }

    // Find closest stalking attacker behind within < 14.0m OR < 0.45s time gap!
    let minStalkDistM = 999.0;
    let minStalkSec = 99.0;
    let stalkerIsPlayer = false;
    let stalkerClosingKmh = 0.0;

    for (let i = 0; i < allCars.length; i++) {
      const other = allCars[i];
      if (other === car || other.exploded || other.inPitLane) continue;
      const behindM = signedDeltaGameM(car.s, other.s) * mPerGameM;
      if (behindM > 1.8 && behindM < 22.0) {
        const refMps = Math.max(18.0, speedMps);
        const gapSec = behindM / refMps;
        if (behindM < minStalkDistM) {
          minStalkDistM = behindM;
          minStalkSec = gapSec;
          stalkerIsPlayer = !!other.isPlayer;
          stalkerClosingKmh = other.speedKmh - car.speedKmh;
        }
      }
    }

    const isStalkedClosely = (minStalkDistM < 14.0 || minStalkSec < 0.45) && stalkerClosingKmh > -14.0;
    const suscept = PRESSURE_SUSCEPTIBILITY[arch.id] || 0.75;

    if (isStalkedClosely && car.aiPressureCooldown <= 0) {
      const proximityMult = minStalkDistM < 8.5 || minStalkSec < 0.26 ? 1.42 : 1.0;
      const cornerLoadMult = absCurK > 0.24 ? 1.38 : 0.78;
      const playerHeroMult = stalkerIsPlayer ? 1.18 : 0.92;
      const buildRate = 0.145 * suscept * proximityMult * cornerLoadMult * playerHeroMult;
      car.aiPressureMeter = clamp((car.aiPressureMeter || 0) + dt * buildRate, 0.0, 1.0);
      car.aiPressureTimer = (car.aiPressureTimer || 0) + dt;
    } else {
      const decayRate = car.aiPressureCooldown > 0 ? 0.28 : 0.13;
      car.aiPressureMeter = clamp((car.aiPressureMeter || 0) - dt * decayRate, 0.0, 1.0);
      if (!isStalkedClosely) {
        car.aiPressureTimer = Math.max(0, (car.aiPressureTimer || 0) - dt * 0.5);
      }
    }

    // Trigger inside-front lockup smoke + 1.0m–1.6m wide apex drift when pressure boils over in a corner!
    const triggerThreshold = arch.id === 'ROOKIE_WILDCARD'
      ? 0.82
      : (arch.id === 'LATE_BRAKER' ? 0.88 : 0.96);

    if (
      !isClassic &&
      car.aiMistakeTimer <= 0 &&
      car.aiPressureCooldown <= 0 &&
      car.aiPressureMeter >= triggerThreshold &&
      absCurK > 0.28 &&
      car.speedKmh > 92.0
    ) {
      // Outside direction of current corner: +curK bends Right (+lat is inside), so -sign(curK) is outside!
      const outsideDir = -Math.sign(curK || 1);
      // Deterministic-feeling organic wide excursion strictly within 1.0m..1.6m!
      const wideMeters = 1.02 + Math.random() * 0.56; // [1.02m .. 1.58m]
      car.aiMistakeDuration = 1.32;
      car.aiMistakeTimer = car.aiMistakeDuration;
      car.aiMistakePeakLat = outsideDir * wideMeters;
      car.aiLockupPuffTimer = 0.48 + Math.random() * 0.20;
      car.lateralVel += outsideDir * 2.35;
      car.speedKmh *= 0.925;
      car.skidIntensity = 0.96;

      // Reset pressure meter & set recovery cooldown so mistakes feel authentic & earned
      car.aiPressureMeter = 0.18;
      car.aiPressureTimer = 0.0;
      car.aiPressureCooldown = arch.id === 'ROOKIE_WILDCARD' ? 11.5 : 15.5;
    }
  }

  // ==========================================================================
  // 25HZ 15-RAY SPATIAL RADAR, SLIPSTREAM TRAINS, SWITCHBACKS & KINEMATIC BRAKING
  // ==========================================================================
  _run15RaySpatialPlanner(car, allCars, playerCar, isClassic, isQualifying, isShowroomDemo, totalLaps, callbacks) {
    const arch = car.archetype || AI_ARCHETYPES.APEX_TACTICIAN;
    const mPerGameM = this.track.realMetersPerGameMeter || REAL_METERS_PER_GAME_METER;
    const s = car.s;
    const curSec = this.track.getSector(s);
    const plannerDt = 0.04;

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
          car._aiTargetSpeedKmh = 320.0;
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

    // Dynamically detect next meaningful corner curvature on ANY of the 6 circuits
    let upcomingCornerK = 0.0;
    const horizonSamples = [curK, lookK15, lookK45, lookK95, lookK140];
    for (let i = 0; i < horizonSamples.length; i++) {
      if (Math.abs(horizonSamples[i]) > 0.16) {
        upcomingCornerK = horizonSamples[i];
        break;
      }
    }

    // Detect S-bend / Chicane rapid direction flip (Nouvelle, Neon, Rettifilo, Ascari, Maggotts-Becketts, Casio)
    const isChicaneFlip =
      (curK * lookK15 < -0.025) ||
      (lookK15 * lookK45 < -0.035) ||
      (curK * lookK45 < -0.045 && Math.abs(curK) > 0.22 && Math.abs(lookK45) > 0.22);

    // ------------------------------------------------------------------------
    // 2. TRAFFIC / CLEAN-AIR TELEMETRY & 2026 UNDERCUT/OVERCUT/WET PIT STRATEGY
    // ------------------------------------------------------------------------
    let nearestAheadCar = null;
    let nearestAheadM = 999.0;
    let carsInWakeCone = 0;

    for (let i = 0; i < allCars.length; i++) {
      const other = allCars[i];
      if (other === car || other.exploded || other.inPitLane) continue;
      if (isShowroomDemo && other.isPlayer) continue;
      const aheadM = forwardDistGameM(s, other.s) * mPerGameM;
      if (aheadM > 1.5 && aheadM < 48.0) {
        if (Math.abs(other.lateralOffset - car.lateralOffset) < CAR_WIDTH * 1.65) {
          carsInWakeCone++;
        }
        if (aheadM < nearestAheadM) {
          nearestAheadM = aheadM;
          nearestAheadCar = other;
        }
      }
    }

    car.aiDraftTrainCount = carsInWakeCone;
    car.aiInDraftTrain = carsInWakeCone >= 1 && nearestAheadM < 42.0;

    // Track dirty-air bottle-necking vs clean-air lightweight stint running for Undercut / Overcut calls
    if (nearestAheadCar && nearestAheadM < 17.5 && car.speedKmh >= nearestAheadCar.speedKmh - 4.0) {
      car.aiDirtyAirStuckTimer = (car.aiDirtyAirStuckTimer || 0) + plannerDt;
      car.aiCleanAirTimer = 0.0;
    } else if (nearestAheadM > 46.0) {
      car.aiCleanAirTimer = (car.aiCleanAirTimer || 0) + plannerDt;
      car.aiDirtyAirStuckTimer = Math.max(0, (car.aiDirtyAirStuckTimer || 0) - plannerDt * 1.4);
    } else {
      car.aiDirtyAirStuckTimer = Math.max(0, (car.aiDirtyAirStuckTimer || 0) - plannerDt * 0.5);
    }

    if (!isClassic && !isQualifying && !isShowroomDemo) {
      const W = this.weather.grooveMoisture;
      const onDrySlicksInRain = (car.compound !== 'INTERMEDIATE' && car.compound !== 'FULL_WET') && W > 0.28;
      if (car.lap >= totalLaps && !car.damage.hasPuncture && !onDrySlicksInRain) {
        car.aiWantsToPit = false;
      } else {
        this._evaluateAIPitStrategy(car, allCars, arch, totalLaps, mPerGameM);
      }
    } else {
      car.aiWantsToPit = false;
    }

    // ------------------------------------------------------------------------
    // 3. SIDEPOD RAYS #14 & #15: WHEEL-TO-WHEEL & CHICANE CORRIDORS (>= 1.25x WIDTH)
    // ------------------------------------------------------------------------
    let blockedLeftMax = -ROAD_HALF_WIDTH + 1.1;
    let blockedRightMin = (s >= 946 || s <= 78) ? (ROAD_HALF_WIDTH - 1.45) : (ROAD_HALF_WIDTH - 1.1);
    let sideBySideInChicane = false;

    for (let i = 0; i < allCars.length; i++) {
      const other = allCars[i];
      if (other === car || other.exploded || other.inPitLane) continue;
      if (isShowroomDemo && other.isPlayer) continue;

      const dsReal = Math.abs(signedDeltaGameM(other.s, s)) * mPerGameM;
      const sideOverlapWindowM = (other.isPlayer ? 6.6 : 5.8) + (isChicaneFlip ? 1.8 : 0.0);
      if (dsReal < sideOverlapWindowM) {
        if (isChicaneFlip) sideBySideInChicane = true;
        const minCorridor = CAR_WIDTH * (other.isPlayer ? 1.30 : (isChicaneFlip ? 1.28 : 1.25));
        if (other.lateralOffset <= car.lateralOffset) {
          blockedLeftMax = Math.max(blockedLeftMax, other.lateralOffset + minCorridor);
        } else {
          blockedRightMin = Math.min(blockedRightMin, other.lateralOffset - minCorridor);
        }
      }
    }

    // ------------------------------------------------------------------------
    // 4. RACING LINE, FIA 1-MOVE DEFENSE, SLIPSTREAM TRAINS & EXIT SWITCHBACKS
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
      let apexDepth = 4.75;
      if (arch.id === 'APEX_TACTICIAN') apexDepth = 5.45;
      else if (arch.id === 'TIRE_WHISPERER') apexDepth = 4.95;
      else if (arch.id === 'LATE_BRAKER') apexDepth = 4.45;
      else if (arch.id === 'ROOKIE_WILDCARD') apexDepth = 4.35;

      if (isChicaneFlip) {
        // When 2-wide in a chicane, hold clean parallel left/right lanes instead of cutting across rival's nose!
        apexDepth = sideBySideInChicane ? 3.25 : Math.min(apexDepth, 4.05);
      }
      preferredLat = Math.sign(cornerFocusK) * apexDepth;
    } else if (Math.abs(lookK95) > 0.22 || Math.abs(lookK140) > 0.30) {
      const entryCornerK = Math.abs(lookK95) >= Math.abs(lookK140) * 0.75 ? lookK95 : lookK140;
      const entryWidth = arch.id === 'APEX_TACTICIAN' ? 5.1 : (arch.id === 'TIRE_WHISPERER' ? 4.8 : 4.3);
      preferredLat = -Math.sign(entryCornerK) * entryWidth;
    } else {
      preferredLat = (car.carNum % 2 === 0 ? 1 : -1) * 1.8;
    }

    // Active Over-Under Exit Switchback execution!
    if (car.aiSwitchbackTimer > 0 && car.aiSwitchbackSign !== 0 && !inYellow && !vscActive) {
      preferredLat = clamp(car.aiSwitchbackSign * 4.35, -ROAD_HALF_WIDTH + 1.35, ROAD_HALF_WIDTH - 1.35);
    }

    // STRICT FIA 1-MOVE DEFENSIVE RULE ON STRAIGHTS (Zero reactive weaving or late braking blocks!)
    const canDefendOnStraight = !isQualifying && !isShowroomDemo && !inYellow && !vscActive &&
      Math.abs(curK) < 0.14 && car.brakeInput < 0.08;

    if (canDefendOnStraight && (arch.id === 'DEFENSIVE_WALL' || arch.id === 'LATE_BRAKER' || arch.id === 'APEX_TACTICIAN')) {
      const defRange = arch.id === 'DEFENSIVE_WALL'
        ? arch.defensiveRangeM + 4.0
        : arch.defensiveRangeM * 0.72;

      let closestThreat = null;
      let closestBehindM = defRange;

      for (let i = 0; i < allCars.length; i++) {
        const other = allCars[i];
        if (other === car || other.exploded || other.inPitLane) continue;
        const behindM = signedDeltaGameM(s, other.s) * mPerGameM;
        // Must be behind front-wing overlap zone (> CAR_LENGTH * 1.12) to legally initiate defensive block
        if (behindM > CAR_LENGTH * 1.12 && behindM <= defRange && other.speedKmh > car.speedKmh - 10.0) {
          if (!closestThreat || other.isPlayer || behindM < closestBehindM) {
            closestThreat = other;
            closestBehindM = behindM;
            if (other.isPlayer) break;
          }
        }
      }

      if (closestThreat) {
        if (car.aiDefenseMovesUsed === 0) {
          // Commit ONE legal defensive move toward the inside of the upcoming corner!
          const insideSign = Math.abs(upcomingCornerK) > 0.12
            ? Math.sign(upcomingCornerK)
            : (closestThreat.lateralOffset >= 0 ? 1 : -1);
          car.aiDefenseCommittedSide = insideSign;
          car.aiDefenseMovesUsed = 1;
          car.aiDefenseLat = clamp(
            insideSign * 4.20 + (closestThreat.lateralOffset - insideSign * 4.20) * 0.25,
            -ROAD_HALF_WIDTH + 1.65,
            ROAD_HALF_WIDTH - 1.65
          );
        }

        if (car.aiDefenseLat !== null) {
          // FIA Art 33.4: if approaching turn-in and drifting back toward outside racing line,
          // MUST leave >= 1.25x car width to the track edge if attacker is on that outside flank!
          let legalDefLat = car.aiDefenseLat;
          if (closestBehindM < 14.0) {
            const minEdgeBuffer = 1.15 + CAR_WIDTH * 1.28;
            if (closestThreat.lateralOffset < car.lateralOffset - CAR_WIDTH * 0.55) {
              legalDefLat = Math.max(legalDefLat, -ROAD_HALF_WIDTH + minEdgeBuffer);
            } else if (closestThreat.lateralOffset > car.lateralOffset + CAR_WIDTH * 0.55) {
              legalDefLat = Math.min(legalDefLat, ROAD_HALF_WIDTH - minEdgeBuffer);
            }
          }
          preferredLat = legalDefLat;
        }
      }
    }

    // MULTI-CAR SLIPSTREAM TRAINS, COORDINATED LATE-BRAKING LUNGES & OVER-UNDER SWITCHBACKS
    const onFastSection = Math.abs(curK) < 0.14 && Math.abs(lookK15) < 0.18;
    const approachingBrakingZone = Math.abs(lookK95) > 0.28 || Math.abs(lookK140) > 0.42;
    let activeSlingshotTarget = null;

    if (!isQualifying && !isShowroomDemo && !inYellow && !vscActive && nearestAheadCar && nearestAheadM < 46.0) {
      const leadCandidate = nearestAheadCar;
      const leadDistM = nearestAheadM;
      const closingMps = Math.max(0, (car.speedKmh - leadCandidate.speedKmh) / 3.6);
      const ttcSec = closingMps > 0.4 ? leadDistM / closingMps : 99.0;
      const pulloutDistM = arch.id === 'LATE_BRAKER' ? 23.5 : (arch.id === 'ROOKIE_WILDCARD' ? 21.5 : 19.5);

      // Check if leadCandidate is ITSELF already side-by-side overtaking a 3rd car right ahead (avoid 3-wide crash!)
      let leaderAlready2Wide = false;
      for (let i = 0; i < allCars.length; i++) {
        const third = allCars[i];
        if (third === car || third === leadCandidate || third.exploded || third.inPitLane) continue;
        const aheadOfLeaderM = forwardDistGameM(leadCandidate.s, third.s) * mPerGameM;
        if (aheadOfLeaderM > -4.0 && aheadOfLeaderM < 14.0 && Math.abs(leadCandidate.lateralOffset - third.lateralOffset) > CAR_WIDTH * 0.95) {
          leaderAlready2Wide = true;
          break;
        }
      }

      const insideSign = Math.abs(upcomingCornerK) > 0.16 ? Math.sign(upcomingCornerK) : 0;
      const leaderDefendingTightInside = insideSign !== 0 && (leadCandidate.lateralOffset * insideSign > 3.15);
      const leaderLockedUpWide = (leadCandidate.aiMistakeTimer || 0) > 0 || (insideSign !== 0 && Math.abs(curK) > 0.25 && (leadCandidate.lateralOffset * insideSign < 1.2));

      if (leaderAlready2Wide && leadDistM > 11.0) {
        // Tandem Slipstream Train Discipline: tuck cleanly behind the faster overtaking lane rather than forcing 3-wide!
        preferredLat = clamp(leadCandidate.lateralOffset, -ROAD_HALF_WIDTH + 1.6, ROAD_HALF_WIDTH - 1.6);
      } else if (onFastSection && leadDistM >= pulloutDistM && ttcSec > 2.1 && !approachingBrakingZone && leadCandidate.speedKmh > 145) {
        // Stage 1: Multi-Car Slipstream Train — tuck into the aerodynamic wake with tiny 0.22m visibility stagger!
        const peepOffset = ((car.carNum % 2 === 0) ? 0.22 : -0.22);
        preferredLat = clamp(leadCandidate.lateralOffset + peepOffset, -ROAD_HALF_WIDTH + 1.75, ROAD_HALF_WIDTH - 1.75);
      } else if (
        approachingBrakingZone &&
        insideSign !== 0 &&
        leadDistM < 22.0 &&
        leadDistM > 6.5 &&
        leaderDefendingTightInside &&
        (arch.id === 'APEX_TACTICIAN' || arch.id === 'TIRE_WHISPERER' || arch.id === 'LATE_BRAKER')
      ) {
        // Stage 2A: Coordinated Over-Under Switchback Setup!
        // Defender parked on the compromised tight inside -> swing wide on entry, square the apex & cut underneath on exit!
        preferredLat = clamp(-insideSign * 4.95, -ROAD_HALF_WIDTH + 1.35, ROAD_HALF_WIDTH - 1.35);
        car.aiSwitchbackSign = insideSign;
        car.aiSwitchbackTimer = 1.45;
      } else if (
        Math.abs(curK) > 0.24 &&
        insideSign !== 0 &&
        leadDistM < 19.0 &&
        leaderLockedUpWide
      ) {
        // Stage 2B: Opportunistic Apex Cutback when rival locks up & drifts 1.0–1.6m wide!
        activeSlingshotTarget = leadCandidate;
        car.aiPassSide = insideSign;
        car.aiPassLockTimer = 1.4;
        preferredLat = clamp(insideSign * 4.55, -ROAD_HALF_WIDTH + 1.25, ROAD_HALF_WIDTH - 1.25);
      } else if (leadDistM < 33.0 && (leadDistM < pulloutDistM || ttcSec <= 2.4 || (approachingBrakingZone && closingMps > -1.5))) {
        // Stage 2C: Committed Slingshot / Inside Late-Braking Dive!
        activeSlingshotTarget = leadCandidate;
        if (car.aiPassLockTimer <= 0) {
          car.aiPassSide = this._chooseBestOvertakeSide(car, leadCandidate, allCars, upcomingCornerK, arch, mPerGameM);
          car.aiPassLockTimer = 1.65;
        }
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

    // Showroom Hero Stage: keep AI traffic smoothly in the right lane past the parked #1 Pole Car
    if (isShowroomDemo && (s > 955 || s < 35)) {
      preferredLat = Math.max(3.2, preferredLat);
    }

    // Lap-start 2x2 grid discipline for the first 28 game-meters so 8-16 cars launch cleanly without tangling
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
      const smoothWeight = activeSlingshotTarget ? 0.85 : 1.45;
      score -= Math.abs(laneLat - car.lateralOffset) * smoothWeight;

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
    if (isClassic && isQualifying) {
      car._aiTargetSpeedKmh = 208.0 + (car.carNum % 5) * 11.5;
      car._aiBrakeAggression = 0.9;
      return;
    }

    const jitterKey = car.lap * 16 + curSec.id;
    if (car.aiLastJitterKey !== jitterKey) {
      car.aiLastJitterKey = jitterKey;
      const wave = Math.sin(car.lap * 7.13 + curSec.id * 2.71 + car.carNum * 1.93);
      car.aiLapBrakeJitter = wave * arch.brakeVarianceM;
    }

    const effGrip = this._estimateEffectiveGrip(car, curK, isClassic);

    // Archetype braking personality + subtle late-braking creep when car.aiPressureMeter is high!
    const pressureCreepM = (car.aiPressureMeter || 0) > 0.52 ? ((car.aiPressureMeter - 0.52) * 5.8) : 0.0;
    const archBrakeAgg = arch.id === 'LATE_BRAKER'
      ? 1.14
      : (arch.id === 'TIRE_WHISPERER' ? 0.91 : (arch.id === 'ROOKIE_WILDCARD' ? 1.08 : 1.0));
    car._aiBrakeAggression = archBrakeAgg;

    const plannedDecelMps2 = (isClassic ? 28.0 : 26.2 * clamp(effGrip, 0.42, 1.14)) * archBrakeAgg;
    const brakeLeadMarginM = clamp(
      7.5 - (arch.brakeOffsetM + pressureCreepM) * 0.58 + car.aiLapBrakeJitter * 0.45,
      -2.2,
      16.0
    );

    const absCurK = Math.abs(curK);
    const absK15 = Math.abs(lookK15);
    const immediateEffK = absK15 < absCurK * 0.88
      ? (absCurK * 0.56 + absK15 * 0.44)
      : Math.max(absCurK, absK15 * 0.92);

    let minAllowedKmh = this._cornerSpeedKmhForCurvature(immediateEffK, effGrip, arch, isClassic);
    if (isChicaneFlip && Math.max(absCurK, absK15) > 0.26) {
      minAllowedKmh *= sideBySideInChicane ? 0.91 : 0.94;
    }

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

    const racePaceMult = this._computeCompetitivePaceMultiplier(car, playerCar, arch, isClassic, isQualifying, isShowroomDemo);
    let targetKmh = minAllowedKmh * racePaceMult;
    const straightCeilingKmh = isClassic ? 310.0 : 333.0;
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

      if (!other.exploded && other.speedKmh >= 65.0 && aheadM < anyAheadInYellowDistM) {
        anyAheadInYellowDistM = aheadM;
        anyAheadInYellowCar = other;
      }

      const inCurrentPath = Math.abs(car.lateralOffset - other.lateralOffset) < CAR_WIDTH * 1.06;
      const inTargetPath = Math.abs(car.aiTargetLat - other.lateralOffset) < CAR_WIDTH * 1.06;
      if ((inCurrentPath && aheadM < 22.0) || (inCurrentPath && inTargetPath && aheadM < 36.0)) {
        if (aheadM < directAheadDistM) {
          directAheadDistM = aheadM;
          directAheadCar = other;
        }
      }
    }

    if (directAheadCar && !directAheadCar.exploded) {
      const clearToPass = Math.abs(car.lateralOffset - directAheadCar.lateralOffset) >= CAR_WIDTH * 1.04;
      if (!clearToPass) {
        const playerBrakingHard = directAheadCar.isPlayer && directAheadCar.brakeInput > 0.15;
        const followGapM = directAheadCar.isPlayer ? (playerBrakingHard ? 11.4 : 9.0) : 7.4;
        if (directAheadDistM < followGapM) {
          targetKmh = Math.min(targetKmh, directAheadCar.speedKmh - (playerBrakingHard ? 12.0 : 7.0));
        } else {
          const followDecel = directAheadCar.isPlayer ? 13.5 : 16.0;
          const relAllowMps = Math.sqrt(2.0 * followDecel * Math.max(0, directAheadDistM - followGapM));
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

    // Controlled apex lockup wide-excursion speed scrub
    if (car.aiMistakeTimer > 0) {
      targetKmh *= 0.90;
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

    leftScore -= Math.abs(car.lateralOffset - leftCand) * 0.55;
    rightScore -= Math.abs(car.lateralOffset - rightCand) * 0.55;

    if (Math.abs(upcomingCornerK) > 0.16) {
      const insideSide = Math.sign(upcomingCornerK);
      const insideBonus = arch.id === 'LATE_BRAKER' ? 4.4 : (arch.id === 'ROOKIE_WILDCARD' ? 3.3 : 1.9);
      if (insideSide < 0) leftScore += insideBonus;
      else rightScore += insideBonus;
    }

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
  // HELPER: REAL-TIME TIRE, THERMAL, WEAR, WET & DAMAGE GRIP ESTIMATOR
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

    // 4-Corner Tire Thermal Window Awareness (syncs with @physics 4-corner tireTempsC / tires.*.temp)
    let thermalMult = 1.0;
    const tempsArr = Array.isArray(car.tireTempsC) && car.tireTempsC.length === 4
      ? car.tireTempsC
      : [car.tires.FL.temp, car.tires.FR.temp, car.tires.RL.temp, car.tires.RR.temp];
    const avgTempC = (tempsArr[0] + tempsArr[1] + tempsArr[2] + tempsArr[3]) * 0.25;
    if (Number.isFinite(avgTempC)) {
      if (avgTempC < comp.optTempMin - 6.0) {
        thermalMult = clamp(1.0 - (comp.optTempMin - 6.0 - avgTempC) * 0.004, 0.91, 1.0);
      } else if (avgTempC > comp.optTempMax + 8.0) {
        thermalMult = clamp(1.0 - (avgTempC - (comp.optTempMax + 8.0)) * 0.005, 0.88, 1.0);
      }
    }

    if (car.damage.hasPuncture) wearMult = 0.34;
    const aeroDamageMult = 1.0 - car.damage.frontWing * 0.22 - car.damage.suspension * 0.16;

    return clamp(baseMu * wearMult * thermalMult * aeroDamageMult, 0.32, 1.18);
  }

  // ==========================================================================
  // HELPER: CONTINUOUS SPLINE CURVATURE -> APEX TARGET SPEED (ALL 6 CIRCUITS)
  // ==========================================================================
  _cornerSpeedKmhForCurvature(absK, effGrip, arch, isClassic) {
    const maxStraightKmh = isClassic ? 310.0 : 333.0;
    if (absK <= 0.035) return maxStraightKmh;

    const normK = clamp((absK - 0.035) / 0.88, 0.0, 1.06);
    const dryApexKmh = 332.0 - 210.0 * Math.pow(normK, 0.91);
    const gripScale = Math.sqrt(clamp(effGrip / 1.04, 0.36, 1.10));

    let archCornerMod = 1.0;
    if (arch.id === 'TIRE_WHISPERER') archCornerMod = 1.022;
    else if (arch.id === 'APEX_TACTICIAN') archCornerMod = 1.015;
    else if (arch.id === 'DEFENSIVE_WALL') archCornerMod = 0.996;
    else if (arch.id === 'LATE_BRAKER') archCornerMod = 0.992;

    return clamp(dryApexKmh * gripScale * archCornerMod, 78.0, maxStraightKmh);
  }

  // ==========================================================================
  // HELPER: ZERO-CHEAT PACE & SUBTLE PACK COHESION (100% HONEST BATTLE BUBBLE!)
  // ==========================================================================
  _computeCompetitivePaceMultiplier(car, playerCar, arch, isClassic, isQualifying, isShowroomDemo) {
    const outLapBonus = (car.aiOutLapPushTimer || 0) > 0 ? 0.009 : 0.0;
    const overcutLightFuelBonus = car.aiOvercutActive && car.fuelLaps < 3.0 ? 0.007 : 0.0;
    const baseSkill = (arch.basePace || 0.992) + (car.aiSkillTierOffset || 0.0) + outLapBonus + overcutLightFuelBonus;

    if (isShowroomDemo || isQualifying || !playerCar || playerCar.exploded || playerCar.inPitLane) {
      return clamp(baseSkill, 0.965, 1.018);
    }

    if (playerCar.totalDistanceGameM < 30.0) {
      return clamp(baseSkill, 0.97, 1.014);
    }

    // Within [-40..+36] game-meters (~165m real battle zone!), elastic === 1.000 for 100% zero-cheat physics parity!
    const gapGameM = car.totalDistanceGameM - playerCar.totalDistanceGameM;
    let elastic = 1.0;

    if (gapGameM > 36.0) {
      const excess = Math.min(1.0, (gapGameM - 36.0) / 150.0);
      elastic = 1.0 - excess * (isClassic ? 0.044 : 0.038);
    } else if (gapGameM < -40.0 && !car.damage.hasPuncture && car.fuelLaps > 0.2) {
      const deficit = Math.min(1.0, (-gapGameM - 40.0) / 165.0);
      elastic = 1.0 + deficit * 0.025;
    }

    return clamp(baseSkill * elastic, 0.945, 1.032);
  }

  // ==========================================================================
  // HELPER: PROJECTED PIT REJOIN CLEAN-AIR CHECK FOR UNDERCUT STRATEGY
  // ==========================================================================
  _isProjectedPitRejoinClean(car, allCars, mPerGameM) {
    // Typical green-flag 2026 pit stop delta (~195 game-meters along the 1,000m loop)
    let rejoinS = car.s - 195.0;
    if (rejoinS < 0) rejoinS += TRACK_GAME_LENGTH;

    for (let i = 0; i < allCars.length; i++) {
      const other = allCars[i];
      if (other === car || other.exploded || other.inPitLane || other.aiWantsToPit) continue;
      const sepM = Math.abs(signedDeltaGameM(other.s, rejoinS)) * mPerGameM;
      if (sepM < 24.0) {
        return false; // Traffic congestion in projected rejoin window!
      }
    }
    return true;
  }

  // ==========================================================================
  // 2026 PIT STRATEGY ENGINE: TIRE CLIFF (<28%), CLEAN-AIR UNDERCUT/OVERCUT & WET (W > 0.28)
  // ==========================================================================
  _evaluateAIPitStrategy(car, allCars, arch, totalLaps, mPerGameM) {
    if (car.aiWantsToPit) return;

    const minLife = Math.min(car.tires.FL.life, car.tires.FR.life, car.tires.RL.life, car.tires.RR.life);
    const W = this.weather.grooveMoisture;
    const isWetCompound = car.compound === 'INTERMEDIATE' || car.compound === 'FULL_WET';

    // Immediate Wet / Dry Crossover Trigger: instant INTER/WET pit call when track wetness crosses 0.28!
    const wetCrossoverTriggered = (!isWetCompound && W > 0.28);
    const monsoonEscalation = (car.compound === 'INTERMEDIATE' && W > 0.65);
    const drySlickCrossover = (isWetCompound && W < 0.08);
    const wrongTireForWeather = wetCrossoverTriggered || monsoonEscalation || drySlickCrossover;

    const needsDamageFix =
      car.damage.hasPuncture ||
      car.damage.frontWing > 0.55 ||
      car.damage.rearWing > 0.58 ||
      car.damage.suspension > 0.58;

    if (car._aiLastPitLap === car.lap && !car.damage.hasPuncture && !wrongTireForWeather) {
      return;
    }

    const lapsLeft = Math.max(1, totalLaps - car.lap);
    const needsFuel = car.fuelLaps < Math.min(1.32, lapsLeft + 0.22);

    // 1. Baseline Tire Cliff Alert (tireLife < 28%, modulated slightly by archetype)
    let cliffThreshold = clamp(0.28 + arch.undercutLapsEarly * 0.035, 0.22, 0.33);
    if (this.raceSystems.vscActive && lapsLeft >= 2) {
      cliffThreshold = 0.56; // Cheap VSC pit-stop opportunity!
    }

    // 2. Real-Time Undercut vs Overcut Evaluation (Fuel Weight vs Dirty Air vs Clean Rejoin Air)
    let triggerUndercut = false;
    if (
      !wrongTireForWeather &&
      lapsLeft >= 2 &&
      minLife < 0.42 &&
      (car.aiDirtyAirStuckTimer || 0) > 4.2 &&
      (arch.id === 'APEX_TACTICIAN' || arch.id === 'LATE_BRAKER' || arch.id === 'ROOKIE_WILDCARD')
    ) {
      if (this._isProjectedPitRejoinClean(car, allCars, mPerGameM)) {
        triggerUndercut = true;
      }
    }

    // Overcut: lightweight low-fuel car (< 3.2 laps fuel) running in 100% clean air stretches stint to 22%!
    if (
      !wrongTireForWeather &&
      !needsFuel &&
      !needsDamageFix &&
      (car.aiCleanAirTimer || 0) > 5.0 &&
      car.fuelLaps < 3.2 &&
      minLife >= 0.22 &&
      (arch.id === 'TIRE_WHISPERER' || arch.id === 'DEFENSIVE_WALL')
    ) {
      car.aiOvercutActive = true;
      cliffThreshold = Math.min(cliffThreshold, 0.225);
    } else {
      car.aiOvercutActive = false;
    }

    const hitTireCliff = minLife < cliffThreshold;

    if (wrongTireForWeather || needsDamageFix || needsFuel || hitTireCliff || triggerUndercut) {
      car.aiWantsToPit = true;
      car._aiLastPitLap = car.lap;

      if (wrongTireForWeather) car.aiPitReason = W > 0.28 ? 'WET_TRANSITION' : 'DRY_CROSSOVER';
      else if (triggerUndercut) car.aiPitReason = 'UNDERCUT_CLEAN_AIR';
      else if (hitTireCliff) car.aiPitReason = 'TIRE_CLIFF_28';
      else if (needsFuel) car.aiPitReason = 'LOW_FUEL';
      else car.aiPitReason = 'DAMAGE_REPAIR';

      const stintLapsRemaining = Math.max(2, totalLaps - car.lap + 1);
      let nextComp = arch.preferredDryTire || 'MEDIUM';

      if (W > 0.58) {
        nextComp = 'FULL_WET';
      } else if (W > 0.28 || (W > 0.16 && isWetCompound)) {
        nextComp = 'INTERMEDIATE';
      } else if (stintLapsRemaining <= 4) {
        nextComp = 'SOFT'; // Lightweight final sprint on red-walled Softs!
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

      const crewPushMode = (triggerUndercut || arch.id === 'APEX_TACTICIAN')
        ? 'AGGRESSIVE_UNDERCUT'
        : (arch.id === 'TIRE_WHISPERER' ? 'SAFE' : 'BALANCED');

      car.aiPitPlan = {
        nextCompound: nextComp,
        fuelToAdd: 'FILL',
        repairOrder,
        crewPushMode,
        reason: car.aiPitReason,
      };
    }
  }
}
