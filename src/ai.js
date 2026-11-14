// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Autonomous Spatial AI, Driver Personalities & Race Strategy Engine (Sim Overhaul):
// 1. Unstarved 1.00 WOT Straight/Sweeper Throttle & Unblocked <1.0s DRS Activation
// 2. Unclamped Real-Curvature (1/m) 180m Forward Corner Scanner (DeltaTheta + R_eff)
//    with Outside -> Apex -> Outside Racing Line & Dynamic-Bicycle Frenet Steering
// 3. Parabolic Sub-Ray Cost Interpolation + C^2 Quintic Lateral Trajectories
//    & Strict >= 1.28x Car-Width FIA Side-by-Side / Chicane Corridors
// 4. Distinct Competitive Personalities, <0.45s Pursuit Pressure Lockups,
//    2-Stop Soft Sprinters vs 1-Stop Whisperers & Stint-Matched Pit Fuel Strategy
// ============================================================================

import {
  TRACK_GAME_LENGTH,
  REAL_METERS_PER_GAME_METER,
  ROAD_HALF_WIDTH,
  CAR_WIDTH,
  CAR_LENGTH,
  PIT_LANE_CONFIG,
  TIRE_COMPOUNDS,
  PRO_2026_LENGTHS,
  AI_ARCHETYPES,
} from './config.js';
import { shiftGear } from './physics.js';

// 13 full-width forward candidate lanes across the 16.8m GP asphalt (delta = 1.2m)
// interpolated continuously via 3-point parabolic sub-ray cost minimization!
const FORWARD_RAY_LANES = [
  -7.2, -6.0, -4.8, -3.6, -2.4, -1.2, 0.0, 1.2, 2.4, 3.6, 4.8, 6.0, 7.2,
];
const RAY_LANE_STEP_M = 1.2;

// Forward real-curvature corner scanner constants (-72m lookback .. +180m lookahead)
const CORNER_SCAN_BACK_M = 72.0;
const CORNER_SCAN_AHEAD_M = 180.0;
const CORNER_SCAN_STEP_M = 4.0;
const CORNER_MIN_K_REAL = 0.0018; // R_center <= 555m

// Manual gearbox fallback shift points (mirrors physics.js 8-speed & 6-speed ratios with hysteresis)
const MANUAL_8_UPSHIFT = [102, 141, 176, 208, 237, 263, 287];
const MANUAL_8_DOWNSHIFT = [82, 118, 152, 182, 210, 236, 260];
const MANUAL_6_UPSHIFT = [110, 155, 196, 234, 268];
const MANUAL_6_DOWNSHIFT = [88, 128, 166, 202, 236];

// Personality composure & pressure susceptibility profiles
const PRESSURE_SUSCEPTIBILITY = {
  ROOKIE_WILDCARD: 1.64,
  LATE_BRAKER: 1.24,
  SLIPSTREAM_HUNTER: 1.02,
  DEFENSIVE_WALL: 0.56,
  CONSISTENT_PRO: 0.50,
  TIRE_WHISPERER: 0.48,
  RAIN_MASTER: 0.45,
  APEX_TACTICIAN: 0.42,
};

// Iconic per-driver motorsport nuance table (layered onto archetype baseline)
const DRIVER_TRAIT_OVERRIDES = {
  TAK: { wetMastery: 1.05, brakeAgg: 1.02, defenseCraft: 0.88, composure: 0.94, strategy: 'ONE_STOP_WHISPER' },
  VAN: { wetMastery: 0.96, brakeAgg: 1.13, defenseCraft: 0.90, composure: 0.78, strategy: 'TWO_STOP_SPRINT' },
  PRO: { wetMastery: 1.04, brakeAgg: 0.93, defenseCraft: 0.86, composure: 0.97, strategy: 'ONE_STOP_WHISPER' },
  SEN: { wetMastery: 1.14, brakeAgg: 1.08, defenseCraft: 1.08, composure: 0.93, strategy: 'TWO_STOP_SPRINT' },
  JNY: { wetMastery: 0.74, brakeAgg: 1.11, defenseCraft: 0.76, composure: 0.62, strategy: 'TWO_STOP_SPRINT' },
  LAU: { wetMastery: 1.02, brakeAgg: 1.00, defenseCraft: 0.92, composure: 0.98, strategy: 'ONE_STOP_WHISPER' },
  VIL: { wetMastery: 1.06, brakeAgg: 1.15, defenseCraft: 0.85, composure: 0.74, strategy: 'TWO_STOP_SPRINT' },
  MAN: { wetMastery: 1.03, brakeAgg: 1.07, defenseCraft: 1.10, composure: 0.88, strategy: 'ONE_STOP_WHISPER' },
  HAK: { wetMastery: 1.03, brakeAgg: 1.04, defenseCraft: 0.87, composure: 0.95, strategy: 'TWO_STOP_SPRINT' },
  ROS: { wetMastery: 0.95, brakeAgg: 1.12, defenseCraft: 0.89, composure: 0.80, strategy: 'TWO_STOP_SPRINT' },
  BUT: { wetMastery: 1.12, brakeAgg: 0.92, defenseCraft: 0.85, composure: 0.96, strategy: 'ONE_STOP_WHISPER' },
  ALO: { wetMastery: 1.09, brakeAgg: 1.05, defenseCraft: 1.14, composure: 0.96, strategy: 'ONE_STOP_WHISPER' },
  NAK: { wetMastery: 0.98, brakeAgg: 0.94, defenseCraft: 0.82, composure: 0.90, strategy: 'ONE_STOP_WHISPER' },
  SAT: { wetMastery: 0.82, brakeAgg: 1.10, defenseCraft: 0.79, composure: 0.66, strategy: 'TWO_STOP_SPRINT' },
  ARN: { wetMastery: 0.94, brakeAgg: 1.11, defenseCraft: 0.88, composure: 0.77, strategy: 'TWO_STOP_SPRINT' },
};

function finiteOr(v, fallback = 0.0) {
  return Number.isFinite(v) ? v : fallback;
}

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : (v > hi ? hi : v);
}

function smoothstep(edge0, edge1, x) {
  const span = edge1 - edge0;
  if (Math.abs(span) < 1e-6) return x >= edge1 ? 1.0 : 0.0;
  const t = clamp((x - edge0) / span, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

function quintic01(t) {
  const c = clamp(t, 0.0, 1.0);
  return c * c * c * (10.0 - 15.0 * c + 6.0 * c * c);
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

function wrapS(s) {
  if (!Number.isFinite(s)) return 0.0;
  let r = s % TRACK_GAME_LENGTH;
  if (r < 0) r += TRACK_GAME_LENGTH;
  if (r >= TRACK_GAME_LENGTH) r = 0.0;
  return r;
}

/**
 * Evaluates a C^2 boundary-value quintic lateral spline p(t) over [0, T]
 * satisfying p(0)=p0, p'(0)=v0, p''(0)=a0 and p(T)=p1, p'(T)=0, p''(T)=0.
 */
function evalQuinticLateralSpline(p0, v0, a0, p1, elapsed, duration) {
  const T = Math.max(0.25, duration);
  if (elapsed >= T) {
    return { pos: p1, vel: 0.0, acc: 0.0 };
  }
  const tau = clamp(elapsed / T, 0.0, 1.0);
  const tau2 = tau * tau;
  const tau3 = tau2 * tau;
  const tau4 = tau3 * tau;
  const tau5 = tau4 * tau;

  const dp = p1 - p0;
  const v0T = v0 * T;
  const a0T2 = a0 * T * T;

  const c0 = p0;
  const c1 = v0T;
  const c2 = 0.5 * a0T2;
  const c3 = 10.0 * dp - 6.0 * v0T - 1.5 * a0T2;
  const c4 = -15.0 * dp + 8.0 * v0T + 1.5 * a0T2;
  const c5 = 6.0 * dp - 3.0 * v0T - 0.5 * a0T2;

  const pos = c0 + c1 * tau + c2 * tau2 + c3 * tau3 + c4 * tau4 + c5 * tau5;
  const vel = (c1 + 2.0 * c2 * tau + 3.0 * c3 * tau2 + 4.0 * c4 * tau3 + 5.0 * c5 * tau4) / T;
  const acc = clamp(
    (2.0 * c2 + 6.0 * c3 * tau + 12.0 * c4 * tau2 + 20.0 * c5 * tau3) / (T * T),
    -18.0,
    18.0
  );
  return { pos, vel, acc };
}

export class SpatialAIController {
  constructor(track, weather, raceSystems) {
    this.track = track;
    this.weather = weather;
    this.raceSystems = raceSystems;
  }

  _getMetersPerGameUnit() {
    if (Number.isFinite(this.track?.metersPerGameUnit) && this.track.metersPerGameUnit > 0.5) {
      return this.track.metersPerGameUnit;
    }
    if (Number.isFinite(this.track?.realMetersPerGameMeter) && this.track.realMetersPerGameMeter > 0.5) {
      return this.track.realMetersPerGameMeter;
    }
    if (Number.isFinite(this.track?.realLengthM) && Number.isFinite(this.track?.totalLength) && this.track.totalLength > 1.0) {
      return this.track.realLengthM / this.track.totalLength;
    }
    return REAL_METERS_PER_GAME_METER;
  }

  /**
   * Queries unclamped signed real curvature kappa_real(s) in true m^-1.
   * Positive = road bends right (+lateralOffset is inside), Negative = bends left.
   */
  _getRealCurvature(s) {
    const sw = wrapS(s);
    if (typeof this.track?.getRealCurvature === 'function') {
      const k = this.track.getRealCurvature(sw);
      if (Number.isFinite(k)) return k;
    }
    if (typeof this.track?.getTrueCurvaturePerMeter === 'function') {
      const k = this.track.getTrueCurvaturePerMeter(sw);
      if (Number.isFinite(k)) return k;
    }
    if (typeof this.track?.getPhysicsCurvature === 'function') {
      const kp = this.track.getPhysicsCurvature(sw);
      if (Number.isFinite(kp)) return kp / 82.0;
    }
    const smp = typeof this.track?.sampleAt === 'function' ? this.track.sampleAt(sw, 0) : null;
    if (smp) {
      if (Number.isFinite(smp.realCurvature)) return smp.realCurvature;
      if (Number.isFinite(smp.curvatureReal)) return smp.curvatureReal;
      if (Number.isFinite(smp.curvature)) return smp.curvature / 82.0;
    }
    return 0.0;
  }

  _buildDriverPersonality(driverDef, arch, index) {
    const shortCode = driverDef?.short || '';
    const trait = DRIVER_TRAIT_OVERRIDES[shortCode] || null;
    const archId = arch.id || 'APEX_TACTICIAN';

    const baseBrakeAgg = archId === 'LATE_BRAKER'
      ? 1.11
      : (archId === 'TIRE_WHISPERER' ? 0.93 : (archId === 'ROOKIE_WILDCARD' ? 1.08 : (archId === 'DEFENSIVE_WALL' ? 1.03 : 1.01)));
    const baseWet = archId === 'TIRE_WHISPERER'
      ? 1.06
      : (archId === 'APEX_TACTICIAN' ? 1.04 : (archId === 'ROOKIE_WILDCARD' ? 0.78 : 0.98));
    const baseDef = archId === 'DEFENSIVE_WALL'
      ? 1.12
      : (archId === 'LATE_BRAKER' ? 0.92 : (archId === 'APEX_TACTICIAN' ? 0.90 : 0.80));
    const baseComp = archId === 'APEX_TACTICIAN' || archId === 'TIRE_WHISPERER'
      ? 0.95
      : (archId === 'DEFENSIVE_WALL' ? 0.91 : (archId === 'LATE_BRAKER' ? 0.78 : 0.64));

    const defaultStrategy = (archId === 'LATE_BRAKER' || archId === 'ROOKIE_WILDCARD' || (archId === 'APEX_TACTICIAN' && index % 2 === 1))
      ? 'TWO_STOP_SPRINT'
      : 'ONE_STOP_WHISPER';

    const lateApexBiasM = archId === 'APEX_TACTICIAN'
      ? 5.5
      : (archId === 'LATE_BRAKER' ? 3.8 : (archId === 'TIRE_WHISPERER' ? 2.5 : 1.5));

    const slipAngleCap = archId === 'TIRE_WHISPERER' ? 0.94 : 1.0;

    return {
      brakingAggression: trait ? trait.brakeAgg : baseBrakeAgg,
      wetWeatherMastery: trait ? trait.wetMastery : baseWet,
      defensiveCraft: trait ? trait.defenseCraft : baseDef,
      composure: trait ? trait.composure : baseComp,
      strategy: trait ? trait.strategy : defaultStrategy,
      lateApexBiasM,
      slipAngleCap,
      switchbackSkill: archId === 'APEX_TACTICIAN' ? 0.96 : (archId === 'TIRE_WHISPERER' ? 0.92 : (archId === 'LATE_BRAKER' ? 0.88 : 0.72)),
    };
  }

  initAICar(car, driverDef, index) {
    const rawArchKey = driverDef?.archetype || 'APEX_TACTICIAN';
    const archFallbackMap = {
      SLIPSTREAM_HUNTER: AI_ARCHETYPES.LATE_BRAKER,
      RAIN_MASTER: AI_ARCHETYPES.APEX_TACTICIAN,
      CONSISTENT_PRO: AI_ARCHETYPES.TIRE_WHISPERER,
    };
    const arch = AI_ARCHETYPES[rawArchKey] || archFallbackMap[rawArchKey] || AI_ARCHETYPES.APEX_TACTICIAN;
    car.archetypeId = arch.id;
    car.archetype = arch;
    car.aiSlotIndex = index;
    car.aiPersonality = this._buildDriverPersonality(driverDef, arch, index);
    car.aiStrategyType = car.aiPersonality.strategy;

    // Evenly spaced pit stalls avoiding Player Pit Box (s = 20)
    car.assignedPitBoxS = [976, 986, 996, 6, 30, 40, 50, 60][index % 8];

    const startLat = finiteOr(car.lateralOffset, 0.0);
    car.aiTargetLat = startLat;
    car._aiGoalLat = startLat;
    car.aiDecisionTimer = (index * 0.009) % 0.04;
    car.aiLapBrakeJitter = 0.0;
    car.aiLastJitterKey = -1;

    // C^2 Quintic Lateral Trajectory State (continuous pos, vel, acc)
    car._aiQuinticP0 = startLat;
    car._aiQuinticV0 = 0.0;
    car._aiQuinticA0 = 0.0;
    car._aiQuinticP1 = startLat;
    car._aiQuinticElapsed = 0.0;
    car._aiQuinticDuration = 0.85;
    car._aiPrevLat = startLat;
    car._aiMeasuredLatVel = 0.0;

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

    // Realistic grid reaction stagger & tight competitive championship spread
    const baseReact = 0.04 + ((index * 37) % 15) * 0.007;
    const archReact = arch.id === 'LATE_BRAKER' || arch.id === 'DEFENSIVE_WALL'
      ? -0.015
      : (arch.id === 'ROOKIE_WILDCARD' ? 0.035 : 0.0);
    car.aiLaunchDelaySec = Math.max(0.018, baseReact + archReact);
    // Front-running Works contenders push 1.000..1.008x limit; tight competitive field spread
    car.aiSkillTierOffset = clamp(0.012 - index * 0.0018, -0.014, 0.012);

    // Real-Time Undercut / Overcut, 2-Stop vs 1-Stop & Wet Transition Pit Strategy State
    car.aiWantsToPit = false;
    car.aiPitPlan = null;
    car.aiPitReason = 'NONE';
    car.aiDirtyAirStuckTimer = 0.0;
    car.aiCleanAirTimer = 0.0;
    car.aiOutLapPushTimer = 0.0;
    car.aiOvercutActive = false;
    car._aiLastPitLap = 0;
    car._aiPrevPitPhase = 'NONE';
    car._aiTargetSpeedKmh = 340.0;
    car._aiCornerConstrained = false;
    car._aiBrakeAggression = car.aiPersonality.brakingAggression;
    car._aiClosestAheadGapSec = 99.0;
  }

  updateAI(car, allCars, playerCar, dt, ctx) {
    if (!car || !Number.isFinite(dt) || dt <= 0) return;
    const {
      mode,
      raceLengthId = 'SHORT',
      isQualifying,
      controlsLocked,
      totalLaps = 5,
      callbacks = {},
    } = ctx || {};

    if (car.exploded || car.pitPhase === 'STOPPED') {
      car._aiPrevPitPhase = car.pitPhase;
      car._aiPrevLat = finiteOr(car.lateralOffset, 0.0);
      car._aiMeasuredLatVel = 0.0;
      return;
    }

    // Detect fresh pit-exit out-lap so undercut/sprint strategy unleashes maximum fresh-rubber pace!
    if (car._aiPrevPitPhase === 'STOPPED' && car.pitPhase === 'EXIT') {
      car.aiOutLapPushTimer = 42.0;
      car.aiDirtyAirStuckTimer = 0.0;
      car.aiOvercutActive = false;
    }
    car._aiPrevPitPhase = car.pitPhase;

    // Pre-start grid hold: stage throttle cleanly for F1 launch & anchor quintic spline to grid slot
    if (controlsLocked) {
      const gridLat = finiteOr(car.lateralOffset, 0.0);
      car.steerInput = 0.0;
      car.brakeInput = 0.0;
      car.throttleInput = 0.65;
      car.aiTargetLat = gridLat;
      car._aiGoalLat = gridLat;
      car._aiQuinticP0 = gridLat;
      car._aiQuinticV0 = 0.0;
      car._aiQuinticA0 = 0.0;
      car._aiQuinticP1 = gridLat;
      car._aiQuinticElapsed = 0.0;
      car._aiPrevLat = gridLat;
      car._aiMeasuredLatVel = 0.0;
      return;
    }

    const safeDt = Math.min(0.05, dt);
    const isClassic = mode === '1982_ORIGINAL';
    const arch = car.archetype || AI_ARCHETYPES.APEX_TACTICIAN;
    const personality = car.aiPersonality || this._buildDriverPersonality(null, arch, car.aiSlotIndex || 0);
    const mPerGameM = this._getMetersPerGameUnit();

    // Detect Showroom background demo mode (Player #1 parked stationary at s = 993.5)
    const isShowroomDemo = !!(
      playerCar &&
      playerCar.totalDistanceGameM === 0 &&
      playerCar.currentLapTime === 0 &&
      Math.abs(playerCar.s - 993.5) < 0.6
    );

    if (car.aiPassLockTimer > 0) car.aiPassLockTimer = Math.max(0, car.aiPassLockTimer - safeDt);
    if (car.aiSwitchbackTimer > 0) car.aiSwitchbackTimer = Math.max(0, car.aiSwitchbackTimer - safeDt);
    if (car.aiMistakeTimer > 0) car.aiMistakeTimer = Math.max(0, car.aiMistakeTimer - safeDt);
    if (car.aiLockupPuffTimer > 0) car.aiLockupPuffTimer = Math.max(0, car.aiLockupPuffTimer - safeDt);
    if (car.aiLockupCooldown > 0) car.aiLockupCooldown = Math.max(0, car.aiLockupCooldown - safeDt);
    if (car.aiPressureCooldown > 0) car.aiPressureCooldown = Math.max(0, car.aiPressureCooldown - safeDt);
    if (car.aiOutLapPushTimer > 0) car.aiOutLapPushTimer = Math.max(0, car.aiOutLapPushTimer - safeDt);

    // Measure true 240Hz Frenet lateral velocity d(lateralOffset)/dt (immune to body-vy vs Frenet-ddot changes)
    const curLat = finiteOr(car.lateralOffset, 0.0);
    const prevLat = finiteOr(car._aiPrevLat, curLat);
    if (Math.abs(curLat - prevLat) < 2.2) {
      const instLatVel = (curLat - prevLat) / safeDt;
      const velAlpha = 1.0 - Math.exp(-42.0 * safeDt);
      car._aiMeasuredLatVel = finiteOr(car._aiMeasuredLatVel, 0.0) + (instLatVel - finiteOr(car._aiMeasuredLatVel, 0.0)) * velAlpha;
    } else {
      car._aiMeasuredLatVel = 0.0;
      car._aiQuinticP0 = curLat;
      car._aiQuinticP1 = curLat;
      car._aiQuinticV0 = 0.0;
      car._aiQuinticA0 = 0.0;
      car._aiQuinticElapsed = 0.0;
    }
    car._aiPrevLat = curLat;

    // Brief human reaction delay right off the starting grid
    if (!isShowroomDemo && !isQualifying && car.lap === 1 && car.currentLapTime < (car.aiLaunchDelaySec || 0)) {
      car.steerInput = 0.0;
      car.throttleInput = 0.55;
      car.brakeInput = 0.0;
      return;
    }

    // ------------------------------------------------------------------------
    // 1. UNCLAMPED REAL CURVATURE (m^-1) & HUMAN PURSUIT PRESSURE (< 0.45s)
    // ------------------------------------------------------------------------
    const curKReal = car.inPitLane ? 0.0 : this._getRealCurvature(car.s);
    const absCurKReal = Math.abs(curKReal);
    const speedKmh = Math.max(0.0, finiteOr(car.speedKmh, 0.0));
    const speedMps = speedKmh / 3.6;

    // Reset FIA 1-Move Defensive Counter upon completing each real corner onto a new straight!
    if (absCurKReal > 0.0032) {
      car.aiWasInCorner = true;
    } else if (car.aiWasInCorner && absCurKReal < 0.0012) {
      car.aiWasInCorner = false;
      car.aiDefenseMovesUsed = 0;
      car.aiDefenseCommittedSide = 0;
      car.aiDefenseLat = null;
    }

    this._updateHumanPressureAndMistakes(
      car,
      allCars,
      curKReal,
      absCurKReal,
      speedMps,
      mPerGameM,
      isClassic,
      isQualifying,
      isShowroomDemo,
      arch,
      personality,
      safeDt
    );

    // ------------------------------------------------------------------------
    // 2. 25Hz CONTINUOUS SUB-RAY SPATIAL & 180M CORNER-PHYSICS PLANNER
    // ------------------------------------------------------------------------
    car.aiDecisionTimer = finiteOr(car.aiDecisionTimer, 0.0) - safeDt;
    if (car.aiDecisionTimer <= 0) {
      car.aiDecisionTimer = 0.04;
      this._runContinuousSpatialAndCornerPlanner(
        car,
        allCars,
        playerCar,
        isClassic,
        isQualifying,
        isShowroomDemo,
        totalLaps,
        raceLengthId,
        ctx
      );
    }

    // ------------------------------------------------------------------------
    // 3. 240Hz C^2 QUINTIC LATERAL TRAJECTORY + FIA >=1.28x SIDEPOD GUARD
    // ------------------------------------------------------------------------
    car._aiQuinticElapsed = finiteOr(car._aiQuinticElapsed, 0.0) + safeDt;
    const qState = evalQuinticLateralSpline(
      finiteOr(car._aiQuinticP0, curLat),
      finiteOr(car._aiQuinticV0, 0.0),
      finiteOr(car._aiQuinticA0, 0.0),
      finiteOr(car._aiQuinticP1, curLat),
      car._aiQuinticElapsed,
      finiteOr(car._aiQuinticDuration, 0.85)
    );

    let desiredLat = qState.pos;
    let desiredLatVel = qState.vel;
    let desiredLatAcc = qState.acc;

    // Smooth C^2 quintic peel-off toward right-hand Pit Entry split (s in [856..932]) when boxing
    if (!isClassic && !isShowroomDemo && car.aiWantsToPit && !car.inPitLane) {
      if (car.s >= 856 && car.s < 898) {
        const blend = quintic01((car.s - 856) / 42.0);
        const pitEntryLat = ROAD_HALF_WIDTH * 0.68;
        desiredLat = desiredLat + (pitEntryLat - desiredLat) * blend;
        desiredLatVel *= (1.0 - blend * 0.6);
        desiredLatAcc *= (1.0 - blend * 0.8);
      } else if (car.s >= 898 && car.s <= 932) {
        desiredLat = ROAD_HALF_WIDTH * 0.72;
        desiredLatVel = 0.0;
        desiredLatAcc = 0.0;
      }
    }

    // Smooth C^2 bell wide-apex excursion (1.0m–1.6m) when pursuit pressure triggers an inside-front lockup!
    if (car.aiMistakeTimer > 0) {
      const dur = Math.max(0.45, finiteOr(car.aiMistakeDuration, 1.35));
      const phase = 1.0 - clamp(car.aiMistakeTimer / dur, 0.0, 1.0);
      // Smooth sin^2(pi * phase) bell has zero value AND zero velocity derivative at phase=0 and phase=1!
      const sBell = Math.sin(Math.PI * phase);
      const c2Bell = sBell * sBell;
      car.aiMistakeLatBias = finiteOr(car.aiMistakePeakLat, 0.0) * c2Bell;
      desiredLat = clamp(
        desiredLat + car.aiMistakeLatBias,
        -ROAD_HALF_WIDTH + 1.05,
        ROAD_HALF_WIDTH - 1.05
      );
    } else {
      car.aiMistakeLatBias = 0.0;
    }

    // 240Hz Emergency Lateral Evasion & Anti-Rear-End Braking when directly behind a braking/slower Player
    let emergencyBrakeBehindPlayer = 0.0;
    if (!car.inPitLane && !isShowroomDemo && playerCar && !playerCar.exploded && !playerCar.inPitLane) {
      const playerAheadM = forwardDistGameM(car.s, playerCar.s) * mPerGameM;
      if (playerAheadM > 1.2 && playerAheadM < 36.0) {
        const latToPlayer = Math.abs(curLat - playerCar.lateralOffset);
        const closingOnPlayer = speedKmh - playerCar.speedKmh;
        if (latToPlayer < CAR_WIDTH * 1.38 && (playerCar.brakeInput > 0.14 || closingOnPlayer > 7.0)) {
          const roomLeft = playerCar.lateralOffset - (-ROAD_HALF_WIDTH + 1.35);
          const roomRight = (ROAD_HALF_WIDTH - 1.35) - playerCar.lateralOffset;
          let evadeSide = car.aiPassSide || 1;
          if (evadeSide < 0 && roomLeft < CAR_WIDTH * 1.36) evadeSide = 1;
          else if (evadeSide > 0 && roomRight < CAR_WIDTH * 1.36) evadeSide = -1;
          const evadeLat = clamp(
            playerCar.lateralOffset + evadeSide * (CAR_WIDTH * 1.58),
            -ROAD_HALF_WIDTH + 1.15,
            ROAD_HALF_WIDTH - 1.15
          );
          const urgencyBlend = quintic01((36.0 - playerAheadM) / 24.0);
          desiredLat = desiredLat + (evadeLat - desiredLat) * Math.max(0.32, urgencyBlend);

          if (playerAheadM < 21.0 && latToPlayer < CAR_WIDTH * 1.14) {
            emergencyBrakeBehindPlayer = clamp(
              (closingOnPlayer + (playerCar.brakeInput > 0.2 ? 16.5 : 8.0)) / 34.0,
              playerCar.brakeInput * 0.86,
              1.0
            );
          }
        }
      }
    }

    // Real-time 240Hz FIA Sidepod & Chicane Corridor Guard (>= 1.28x car width whenever overlap exists!)
    if (!car.inPitLane) {
      const lookK22 = this._getRealCurvature(car.s + 22.0 / mPerGameM);
      const inRealtimeChicane =
        (curKReal * lookK22 < -0.000004) ||
        (absCurKReal > 0.0035 && Math.abs(lookK22) > 0.0035);

      let rtLeftMin = -ROAD_HALF_WIDTH + 1.05;
      let rtRightMax = (car.s >= 946 || car.s <= 78) ? (ROAD_HALF_WIDTH - 1.35) : (ROAD_HALF_WIDTH - 1.05);

      for (let i = 0; i < allCars.length; i++) {
        const other = allCars[i];
        if (!other || other === car || other.exploded || other.inPitLane) continue;
        if (isShowroomDemo && other.isPlayer) continue;

        const dsReal = Math.abs(signedDeltaGameM(other.s, car.s)) * mPerGameM;
        const overlapZoneM = (other.isPlayer ? CAR_LENGTH * 1.32 : CAR_LENGTH * 1.18) + (inRealtimeChicane ? 1.6 : 0.0);
        if (dsReal < overlapZoneM) {
          // Strict >= 1.28x car width FIA side-by-side corridor (1.32x around player, 1.30x in chicanes!)
          const corridor = CAR_WIDTH * (other.isPlayer ? 1.32 : (inRealtimeChicane ? 1.30 : 1.28));
          if (other.lateralOffset <= curLat) {
            rtLeftMin = Math.max(rtLeftMin, other.lateralOffset + corridor);
          } else {
            rtRightMax = Math.min(rtRightMax, other.lateralOffset - corridor);
          }
        }
      }

      if (rtLeftMin <= rtRightMax) {
        if (desiredLat < rtLeftMin) {
          desiredLat = rtLeftMin;
          desiredLatVel = Math.max(0.0, desiredLatVel);
        } else if (desiredLat > rtRightMax) {
          desiredLat = rtRightMax;
          desiredLatVel = Math.min(0.0, desiredLatVel);
        }
      } else {
        desiredLat = clamp((rtLeftMin + rtRightMax) * 0.5, -ROAD_HALF_WIDTH + 1.0, ROAD_HALF_WIDTH - 1.0);
        desiredLatVel = 0.0;
        desiredLatAcc = 0.0;
      }
    }

    car.aiTargetLat = desiredLat;

    // ------------------------------------------------------------------------
    // 4. 240Hz DYNAMIC-BICYCLE CURVATURE FEEDFORWARD + FRENET PATH STEERING
    //    (Zero jerky twitching in 80 km/h hairpins, 300 km/h sweepers & straights!)
    // ------------------------------------------------------------------------
    let rawSteer = 0.0;
    if (!car.inPitLane && speedMps > 0.5) {
      const previewDistM = clamp(2.8 + speedMps * 0.13, 2.8, 13.5);
      const lookKReal = this._getRealCurvature(car.s + previewDistM / mPerGameM);
      const blendKReal = curKReal * 0.45 + lookKReal * 0.55;

      // Exact Frenet arc Jacobian J(s, d) = max(0.42, 1 - k_real * d) + quintic lateral curvature
      const frenetJ = Math.max(0.42, 1.0 - blendKReal * desiredLat);
      const vRefSq = Math.max(11.0, speedMps) * Math.max(11.0, speedMps);
      const pathCurvReal = (blendKReal / frenetJ) + (desiredLatAcc / vRefSq);

      // Dynamic Bicycle Ackermann + Aerodynamic Yaw-Damping + Front-Wing Damage Understeer Compensation
      // (Exact steady-state inversion of physics.js 240Hz Newton-Euler + Frenet solver!)
      const wheelbaseM = 3.60;
      const ackermannRad = Math.atan(wheelbaseM * pathCurvReal);
      const fwDmg = clamp(finiteOr(car.damage?.frontWing, 0.0), 0.0, 1.0);
      const fastFactor = smoothstep(155.0, 295.0, speedKmh);
      const effGripEst = clamp(finiteOr(car._aiCachedEffGrip, 1.0), 0.35, 1.20);
      const latAccelMps2 = pathCurvReal * speedMps * speedMps;

      // In physics.js, cYawDamp = (1080 + 3.4 * v^2) resists steady-state yaw rate r* = k_path * v,
      // requiring extra front lateral force Delta_Fyf = (cYawDamp * v * k_path) / L
      const cYawDamp = 1080.0 + 3.4 * speedMps * speedMps;
      const dfEstN = Math.max(2600.0, (3740.0 + 1.67 * speedMps * speedMps) * 1.48 * effGripEst * (1.0 - 0.45 * fwDmg));
      const cAlphaFront = 14.6 * dfEstN;
      const yawDampCompRad = ((cYawDamp * speedMps * pathCurvReal) / wheelbaseM) / cAlphaFront;
      const understeerCompRad =
        yawDampCompRad +
        clamp(latAccelMps2 / Math.max(5.5, 9.81 * effGripEst), -1.15, 1.15) * (0.042 + 0.052 * fwDmg * fastFactor);
      const deltaFfRad = ackermannRad + understeerCompRad;

      // Critically-damped Frenet Stanley lookahead + lateral-velocity damping (never starved by 1/v^2 clamp!)
      const latErr = desiredLat - curLat;
      const latVelLive = Number.isFinite(car.lateralVel) ? car.lateralVel : finiteOr(car._aiMeasuredLatVel, 0.0);
      const latVelErr = desiredLatVel - latVelLive;
      const archGain = arch.id === 'APEX_TACTICIAN' ? 1.05 : (arch.id === 'TIRE_WHISPERER' ? 0.94 : 1.0);
      const lookDistM = clamp(5.5 + speedMps * 0.24, 6.0, 24.0);
      const crossTrackRad = Math.atan2(latErr * archGain, lookDistM);
      const dampVelRad = clamp(latVelErr / Math.max(10.0, speedMps * 0.85), -0.24, 0.24);
      const deltaFbRad = 1.15 * crossTrackRad + 0.88 * dampVelRad;

      // Match physics.js exact steering rack scale: 0.285 * modAgility * highSpeedTaper * lowSpeedAckermann
      const modAgility = clamp(finiteOr(car.perfMods?.agilityMult, 1.0), 0.85, 1.20);
      const highSpeedTaper = 1.0 - 0.14 * smoothstep(235.0, 335.0, speedKmh);
      const lowSpeedAckermann = 1.0 + 0.18 * (1.0 - smoothstep(35.0, 125.0, speedKmh));
      const maxSteerRad = 0.285 * modAgility * highSpeedTaper * lowSpeedAckermann;
      const aquaplaneBoost = car.aquaplaneTimer > 0 ? 1.45 : 1.0;
      const totalSteerRad = (deltaFfRad + deltaFbRad) * aquaplaneBoost;

      // TIRE_WHISPERER smoothly caps peak slip-angle scrub (-18% thermal wear!)
      const steerCeiling = personality.slipAngleCap < 0.98 && absCurKReal > 0.008 ? 0.94 : 1.0;
      rawSteer = clamp(totalSteerRad / Math.max(0.20, maxSteerRad), -steerCeiling, steerCeiling);

      // Clean straightaway micro-deadzone when tracking centered with zero curvature
      if (Math.abs(pathCurvReal) < 0.00025 && Math.abs(latErr) < 0.015 && Math.abs(latVelErr) < 0.04) {
        rawSteer = 0.0;
      }
    }

    const steerRate = arch.id === 'TIRE_WHISPERER' ? 18.5 : 23.0;
    const steerAlpha = 1.0 - Math.exp(-steerRate * safeDt);
    car.steerInput = finiteOr(car.steerInput, 0.0) + (rawSteer - finiteOr(car.steerInput, 0.0)) * steerAlpha;
    if (Math.abs(car.steerInput) < 0.0015 && rawSteer === 0.0) {
      car.steerInput = 0.0;
    }

    // ------------------------------------------------------------------------
    // 5. UNSTARVED 240Hz WOT THROTTLE, FRICTION-ELLIPSE TRAIL-BRAKING & DRS
    //    (Fixes L383 0.94/0.52 throttle starvation -> full 1.00 WOT on straights & sweepers!)
    // ------------------------------------------------------------------------
    let targetSpeedKmh = finiteOr(car._aiTargetSpeedKmh, 340.0);
    if (!car.inPitLane && car._aiZoneActive) {
      const dLiveM = signedDeltaGameM(finiteOr(car._aiZoneTargetS, car.s), car.s) * mPerGameM;
      const vZoneMps = finiteOr(car._aiZoneVMaxMps, targetSpeedKmh / 3.6);
      const aZoneDecel = finiteOr(car._aiZoneDecelMps2, 26.0);
      const liveAllowKmh = dLiveM > 0.25
        ? Math.sqrt(vZoneMps * vZoneMps + 2.0 * aZoneDecel * dLiveM) * 3.6
        : vZoneMps * 3.6;
      if (liveAllowKmh < targetSpeedKmh) {
        targetSpeedKmh = liveAllowKmh;
      }
    }
    const speedDiff = targetSpeedKmh - speedKmh;
    const wetW = isClassic ? 0.0 : clamp(finiteOr(this.weather?.grooveMoisture, 0.0), 0.0, 1.0);
    const wetMastery = personality.wetWeatherMastery || 1.0;

    // Progressive corner-exit traction limit ONLY in slow/medium loaded corners or rain;
    // strictly 1.00 on straights, fast aero sweepers, and once steering unwinds!
    let tractionCap = 1.0;
    const inSlowMedCornerLoad = (absCurKReal > 0.0085 && speedKmh < 185.0) || Math.abs(car.steerInput) > 0.42;
    if (inSlowMedCornerLoad || wetW > 0.08) {
      const switchbackBoost = car.aiSwitchbackTimer > 0 ? 0.05 : 0.0;
      const archExitBase = arch.id === 'TIRE_WHISPERER'
        ? 0.91
        : (arch.id === 'ROOKIE_WILDCARD' ? 1.00 : 0.96);
      const wetPenalty = wetW * Math.max(0.06, 0.24 - (wetMastery - 0.95) * 0.30);
      const steerLoad = clamp((Math.abs(car.steerInput) - 0.22) / 0.58, 0.0, 1.0);
      const cornerLoadPenalty = inSlowMedCornerLoad ? (1.0 - archExitBase) * steerLoad : 0.0;
      tractionCap = clamp(1.0 + switchbackBoost - cornerLoadPenalty - wetPenalty, 0.62, 1.0);
    }

    let desiredBrake = 0.0;
    if (car.inPitLane && car.pitPhase === 'EXIT' && car.s >= PIT_LANE_CONFIG.mergeStartS && car.s <= PIT_LANE_CONFIG.mergeEndS) {
      car.throttleInput = 1.0;
      desiredBrake = 0.0;
    } else if (!car._aiCornerConstrained && speedDiff >= -1.2) {
      // Flat-out straightaway or flat-out high-speed sweeper: FULL 1.00 WOT THROTTLE!
      car.throttleInput = tractionCap;
      desiredBrake = 0.0;
    } else if (speedDiff > 1.2) {
      // Accelerating out of apex or down straight: smooth ramp directly to full 1.00 WOT!
      const ramp = smoothstep(0.0, 9.5, speedDiff);
      car.throttleInput = clamp(0.68 + 0.32 * ramp, 0.35, tractionCap);
      desiredBrake = 0.0;
    } else if (speedDiff < -1.8) {
      // Braking / Trail-braking along the tire friction ellipse!
      const overSpeed = -speedDiff;
      const brakeAgg = finiteOr(car._aiBrakeAggression, 1.0);

      // Friction-circle trail-braking taper: smoothly bleed brake pressure as lateral G / steering rises into apex
      const latLoadNorm = clamp(Math.abs(car.steerInput) * 1.15 + absCurKReal * speedMps * speedMps / 36.0, 0.0, 1.0);
      const peakPedal = car.aiLockupPuffTimer > 0 ? 0.95 : 0.86;
      const trailCap = peakPedal * Math.sqrt(Math.max(0.24, 1.0 - 0.58 * latLoadNorm * latLoadNorm));

      if (!car._aiHardBrakingZone && overSpeed < 6.0 && absCurKReal >= 0.0020 && speedKmh > 245.0) {
        // Subtle aerodynamic lift-off trim in ultra-fast 295+ km/h sweepers (no jerky brake stab!)
        car.throttleInput = clamp(0.34 - overSpeed * 0.045, 0.05, 0.34);
        desiredBrake = 0.0;
      } else {
        car.throttleInput = 0.0;
        const basePedal = car._aiHardBrakingZone ? 0.54 : 0.14;
        desiredBrake = clamp((basePedal + overSpeed / 15.0) * brakeAgg, 0.08, trailCap);
      }
    } else {
      // Narrow mid-apex maintenance band [-1.8 .. +1.2 km/h] inside a constrained corner
      if (absCurKReal < 0.0045) {
        car.throttleInput = 1.0;
      } else {
        const maint = 0.68 + (speedDiff + 1.8) / 3.0 * 0.32;
        car.throttleInput = clamp(maint, 0.48, tractionCap);
      }
      desiredBrake = 0.0;
    }

    const prevBrake = finiteOr(car.brakeInput, 0.0);
    const brakeHydRate = desiredBrake >= prevBrake ? 38.0 : 46.0;
    const smoothBrake = prevBrake + (desiredBrake - prevBrake) * (1.0 - Math.exp(-brakeHydRate * safeDt));
    car.brakeInput = smoothBrake < 0.003 ? 0.0 : smoothBrake;

    // Override with 240Hz anti-rear-end braking respect when directly behind a braking Player
    if (emergencyBrakeBehindPlayer > 0.05) {
      car.throttleInput = 0.0;
      car.brakeInput = Math.max(car.brakeInput, emergencyBrakeBehindPlayer);
    }

    // Unblocked FIA DRS (< 1.0s detection gap + >0.95 WOT throttle + functional rear wing < 0.35) & MGU-K ERS Overtake!
    const rwDmg = isClassic ? 0.0 : finiteOr(car.damage?.rearWing, 0.0);
    const withinDrsGap = (finiteOr(car._aiClosestAheadGapSec, 99.0) < 1.0) || !!car.inSlipstream || !!isQualifying;
    const drsEligible =
      !isClassic &&
      !car.inPitLane &&
      !this.raceSystems?.vscActive &&
      rwDmg < 0.35 &&
      wetW < 0.15 &&
      absCurKReal < 0.0038 &&
      Math.abs(car.steerInput) < 0.10 &&
      car.throttleInput > 0.95 &&
      car.brakeInput < 0.02 &&
      speedKmh > 192.0 &&
      withinDrsGap;

    car.drsRequested = drsEligible;
    car.drsActive = drsEligible;

    car.ersOvertakeRequested =
      !isClassic &&
      !car.inPitLane &&
      finiteOr(car.ersCharge, 1.0) > 0.16 &&
      car.brakeInput < 0.02 &&
      absCurKReal < 0.0075 &&
      (car.aiPassLockTimer > 0 || car.aiSwitchbackTimer > 0 || car.aiOutLapPushTimer > 0 || car.aiDefenseMovesUsed > 0);
    if (car.ersOvertakeRequested && car.throttleInput > 0.78) {
      car.ersDeploying = true;
    }

    // Inside-front tire-smoke lockup puffs & flat-spot risk when diving deep into heavy braking zones under pressure!
    if (!car.inPitLane && !isShowroomDemo && car.brakeInput > 0.52 && speedKmh > 112.0) {
      if (car.aiLockupPuffTimer <= 0 && car.aiLockupCooldown <= 0) {
        const pressure = finiteOr(car.aiPressureMeter, 0.0);
        const underBattlePressure = pressure > 0.38 || car.inSlipstream || car.aiInDraftTrain;
        const composure = personality.composure || 0.85;
        const lockupChance = (
          (arch.id === 'LATE_BRAKER' ? 0.34 : (arch.id === 'ROOKIE_WILDCARD' ? 0.42 : 0.14)) +
          pressure * 0.38 * (1.35 - composure * 0.5)
        );
        if (underBattlePressure && Math.random() < lockupChance) {
          car.aiLockupPuffTimer = 0.26 + Math.random() * 0.26;
          car.aiLockupCooldown = 3.2 + Math.random() * 2.5;
          // Accrue subtle realistic inside-front tire flat-spot if physics array exists
          if (Array.isArray(car.tireFlatSpot) && car.tireFlatSpot.length >= 2) {
            const insideFrontIdx = curKReal >= 0 ? 1 : 0; // Right turn unloads FR (1), Left turn unloads FL (0)
            car.tireFlatSpot[insideFrontIdx] = clamp(
              finiteOr(car.tireFlatSpot[insideFrontIdx], 0.0) + 0.06 + pressure * 0.06,
              0.0,
              1.0
            );
          }
        } else {
          car.aiLockupCooldown = 0.90;
        }
      }
    }
    if (car.aiLockupPuffTimer > 0 && (car.brakeInput > 0.18 || car.aiMistakeTimer > 0)) {
      car.skidIntensity = Math.max(finiteOr(car.skidIntensity, 0.0), 0.92);
    }

    // ------------------------------------------------------------------------
    // 6. 8-SPEED AUTO / MANUAL / CLASSIC 2-SPEED TRANSMISSION COMPATIBILITY
    // ------------------------------------------------------------------------
    if (car.gearboxMode === 'AUTO_8SPD') {
      // Handled natively at 240Hz inside stepVehiclePhysics240Hz with sawtooth RPM & shift callbacks!
    } else if (car.gearboxMode === 'MANUAL_8SPD' && !isClassic) {
      if (car.shiftCooldown <= 0) {
        if (car.inPitLane && speedKmh <= 84.0 && car.gear > 2) {
          shiftGear(car, -1, callbacks);
        } else if (car.gear < 8 && car.throttleInput > 0.16 && speedKmh >= MANUAL_8_UPSHIFT[car.gear - 1]) {
          shiftGear(car, +1, callbacks);
        } else if (car.gear > 1 && speedKmh <= MANUAL_8_DOWNSHIFT[car.gear - 2]) {
          shiftGear(car, -1, callbacks);
        }
      }
    } else if (car.gearboxMode === 'PRO_6SPD' && !isClassic) {
      if (car.shiftCooldown <= 0) {
        if (car.gear < 6 && car.throttleInput > 0.16 && speedKmh >= MANUAL_6_UPSHIFT[car.gear - 1]) {
          shiftGear(car, +1, callbacks);
        } else if (car.gear > 1 && speedKmh <= MANUAL_6_DOWNSHIFT[car.gear - 2]) {
          shiftGear(car, -1, callbacks);
        }
      }
    } else {
      // CLASSIC_2SPD (1982 LOW / HIGH)
      if (car.shiftCooldown <= 0) {
        if (car.gear === 1 && speedKmh > 168.5) {
          shiftGear(car, +1, callbacks);
          car.shiftCooldown = 0.18;
        } else if (car.gear === 2 && speedKmh < 142.0) {
          shiftGear(car, -1, callbacks);
          car.shiftCooldown = 0.18;
        }
      }
    }
  }

  // ==========================================================================
  // PURSUIT PRESSURE (< 0.45s GAP) -> INSIDE-FRONT LOCKUP SMOKE & WIDE APEX
  // ==========================================================================
  _updateHumanPressureAndMistakes(
    car,
    allCars,
    curKReal,
    absCurKReal,
    speedMps,
    mPerGameM,
    isClassic,
    isQualifying,
    isShowroomDemo,
    arch,
    personality,
    dt
  ) {
    if (isShowroomDemo || isQualifying || car.inPitLane) {
      car.aiPressureMeter = Math.max(0, finiteOr(car.aiPressureMeter, 0.0) - dt * 0.35);
      return;
    }

    // Find closest stalking attacker behind within < 0.45s pursuit gap OR < 14.0m!
    let minStalkDistM = 999.0;
    let minStalkSec = 99.0;
    let stalkerIsPlayer = false;
    let stalkerClosingKmh = 0.0;

    for (let i = 0; i < allCars.length; i++) {
      const other = allCars[i];
      if (!other || other === car || other.exploded || other.inPitLane) continue;
      const behindM = signedDeltaGameM(car.s, other.s) * mPerGameM;
      if (behindM > 1.8 && behindM < 34.0) {
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

    const isStalkedClosely = (minStalkSec < 0.45 || minStalkDistM < 13.5) && stalkerClosingKmh > -12.0;
    const suscept = (PRESSURE_SUSCEPTIBILITY[arch.id] || 0.75) * (1.28 - (personality.composure || 0.85) * 0.42);

    if (isStalkedClosely && car.aiPressureCooldown <= 0) {
      const proximityMult = minStalkSec < 0.25 || minStalkDistM < 8.2 ? 1.45 : 1.0;
      const cornerLoadMult = absCurKReal > 0.0038 ? 1.38 : 0.80;
      const playerHeroMult = stalkerIsPlayer ? 1.20 : 0.92;
      const buildRate = 0.148 * suscept * proximityMult * cornerLoadMult * playerHeroMult;
      car.aiPressureMeter = clamp(finiteOr(car.aiPressureMeter, 0.0) + dt * buildRate, 0.0, 1.0);
      car.aiPressureTimer = finiteOr(car.aiPressureTimer, 0.0) + dt;
    } else {
      const decayRate = car.aiPressureCooldown > 0 ? 0.28 : 0.13;
      car.aiPressureMeter = clamp(finiteOr(car.aiPressureMeter, 0.0) - dt * decayRate, 0.0, 1.0);
      if (!isStalkedClosely) {
        car.aiPressureTimer = Math.max(0, finiteOr(car.aiPressureTimer, 0.0) - dt * 0.5);
      }
    }

    // Trigger realistic inside-front brake lockup smoke + smooth 1.0m–1.6m wide apex excursion under extreme pressure!
    const composure = personality.composure || 0.85;
    const triggerThreshold = clamp(0.76 + composure * 0.21, 0.80, 0.97);

    if (
      !isClassic &&
      car.aiMistakeTimer <= 0 &&
      car.aiPressureCooldown <= 0 &&
      car.aiPressureMeter >= triggerThreshold &&
      absCurKReal > 0.0055 &&
      car.speedKmh > 88.0
    ) {
      // +curKReal bends Right (+lat is inside), so -sign(curKReal) drifts cleanly toward corner outside!
      const outsideDir = -Math.sign(curKReal || 1);
      const wideMeters = 1.02 + Math.random() * 0.56; // [1.02m .. 1.58m] smooth wide apex drift
      car.aiMistakeDuration = 1.40;
      car.aiMistakeTimer = car.aiMistakeDuration;
      car.aiMistakePeakLat = outsideDir * wideMeters;
      car.aiLockupPuffTimer = 0.52 + Math.random() * 0.22;
      car.skidIntensity = 0.96;

      if (Array.isArray(car.tireFlatSpot) && car.tireFlatSpot.length >= 2) {
        const insideFrontIdx = curKReal >= 0 ? 1 : 0;
        car.tireFlatSpot[insideFrontIdx] = clamp(finiteOr(car.tireFlatSpot[insideFrontIdx], 0.0) + 0.14, 0.0, 1.0);
      }

      car.aiPressureMeter = 0.16;
      car.aiPressureTimer = 0.0;
      car.aiPressureCooldown = arch.id === 'ROOKIE_WILDCARD' ? 11.5 : 16.0;
    }
  }

  // ==========================================================================
  // 180M UNCLAMPED REAL-CURVATURE FORWARD CORNER ZONE SCANNER & RACING LINE
  // ==========================================================================
  _scanForwardCornersAndLine(car, s, mPerGameM, sideBySideInChicane, personality) {
    const zones = [];
    let active = null;

    for (let d = -CORNER_SCAN_BACK_M; d <= CORNER_SCAN_AHEAD_M; d += CORNER_SCAN_STEP_M) {
      const kReal = this._getRealCurvature(s + d / mPerGameM);
      const absK = Math.abs(kReal);
      const signK = kReal >= 0 ? 1 : -1;

      if (absK >= CORNER_MIN_K_REAL) {
        if (!active || active.sign !== signK) {
          if (active && active.dOut >= -22.0) zones.push(active);
          active = {
            sign: signK,
            dIn: d,
            dOut: d,
            kPeak: absK,
            dPeakRaw: d,
            weightedDSum: d * absK * absK,
            weightSum: absK * absK,
            deltaThetaFull: absK * CORNER_SCAN_STEP_M,
            deltaThetaAhead: d >= 0.0 ? absK * CORNER_SCAN_STEP_M : 0.0,
          };
        } else {
          active.dOut = d;
          active.deltaThetaFull += absK * CORNER_SCAN_STEP_M;
          if (d >= 0.0) active.deltaThetaAhead += absK * CORNER_SCAN_STEP_M;
          active.weightedDSum += d * absK * absK;
          active.weightSum += absK * absK;
          if (absK > active.kPeak) {
            active.kPeak = absK;
            active.dPeakRaw = d;
          }
        }
      } else if (active && (d - active.dOut) > 8.0) {
        if (active.dOut >= -22.0) zones.push(active);
        active = null;
      }
    }
    if (active && active.dOut >= -22.0) {
      zones.push(active);
    }

    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      const centroidApex = z.weightSum > 1e-9 ? (z.weightedDSum / z.weightSum) : z.dPeakRaw;
      // Curvature-squared centroid locates exact geometric midpoint even on flat-plateau hairpins/sweepers!
      z.dApex = centroidApex + (personality.lateApexBiasM || 2.0) * 0.25;
    }

    // Compute continuous geometric racing line (Outside Entry -> Inside Clipping Apex -> Outside Track-Out Exit!)
    let racingLineLat = (car.carNum % 2 === 0 ? 1 : -1) * 1.35;
    let upcomingCornerZone = null;
    let isChicaneFlip = false;

    if (zones.length >= 2) {
      const z0 = zones[0];
      const z1 = zones[1];
      if (z0.sign !== z1.sign && (z1.dIn - z0.dOut) < 42.0 && z0.dIn < 65.0) {
        isChicaneFlip = true;
      }
    }

    for (let i = 0; i < zones.length; i++) {
      if (zones[i].deltaThetaFull >= 0.24 || zones[i].kPeak >= 0.0045) {
        upcomingCornerZone = zones[i];
        break;
      }
    }
    if (!upcomingCornerZone && zones.length > 0) {
      upcomingCornerZone = zones[0];
    }

    if (upcomingCornerZone) {
      const z = upcomingCornerZone;
      const turnSeverity = smoothstep(0.18, 0.95, z.deltaThetaFull);
      const maxApexDepth = sideBySideInChicane
        ? 3.25
        : (isChicaneFlip ? 4.15 : (4.15 + 1.15 * turnSeverity));
      const maxOutsideWidth = sideBySideInChicane
        ? 3.25
        : (3.65 + 1.45 * turnSeverity);

      const outsideEntryLat = -z.sign * maxOutsideWidth;
      const insideApexLat = z.sign * maxApexDepth;
      const outsideExitLat = -z.sign * maxOutsideWidth;

      const speedMps = Math.max(12.0, finiteOr(car.speedKmh, 120.0) / 3.6);
      const baseTurnInLeadM = clamp(20.0 + speedMps * 0.34 - (personality.lateApexBiasM || 0.0), 18.0, 52.0);
      const turnInStartApexDist = Math.max(baseTurnInLeadM, Math.max(0.0, z.dApex - z.dIn) + 6.0);

      if (z.dApex > turnInStartApexDist) {
        // Approaching corner: glide smoothly onto the Outside Entry line well before braking!
        const approachBlend = 1.0 - smoothstep(55.0, 145.0, z.dIn);
        racingLineLat = racingLineLat + (outsideEntryLat - racingLineLat) * approachBlend;
      } else if (z.dApex >= 0.0) {
        // Turn-in phase: carve smoothly from Outside Entry -> Inside Clipping Apex!
        const uTurnIn = quintic01((turnInStartApexDist - z.dApex) / Math.max(8.0, turnInStartApexDist));
        racingLineLat = outsideEntryLat + (insideApexLat - outsideEntryLat) * uTurnIn;
      } else {
        // Post-apex track-out phase: unwind smoothly from Inside Apex -> Outside Exit kerb!
        const exitSpanM = Math.max(16.0, z.dOut - z.dApex + 20.0);
        const uExit = quintic01(-z.dApex / exitSpanM);
        // If an opposite-direction chicane corner follows immediately, link directly into its entry!
        let targetExitLat = outsideExitLat;
        if (zones.length >= 2 && zones[1].sign !== z.sign && (zones[1].dIn - z.dOut) < 38.0) {
          targetExitLat = -zones[1].sign * (maxOutsideWidth * 0.82);
        }
        racingLineLat = insideApexLat + (targetExitLat - insideApexLat) * uExit;
      }
    }

    return { zones, racingLineLat, upcomingCornerZone, isChicaneFlip };
  }

  // ==========================================================================
  // 25HZ CONTINUOUS SUB-RAY SPATIAL PLANNER, RACECRAFT & CORNER-PHYSICS SOLVER
  // ==========================================================================
  _runContinuousSpatialAndCornerPlanner(
    car,
    allCars,
    playerCar,
    isClassic,
    isQualifying,
    isShowroomDemo,
    totalLaps,
    raceLengthId,
    ctx
  ) {
    const arch = car.archetype || AI_ARCHETYPES.APEX_TACTICIAN;
    const personality = car.aiPersonality || this._buildDriverPersonality(null, arch, car.aiSlotIndex || 0);
    const mPerGameM = this._getMetersPerGameUnit();
    const s = car.s;
    const curSec = this.track.getSector(s);
    const plannerDt = 0.04;

    // ------------------------------------------------------------------------
    // 0. PIT LANE INTERNAL SPEED & SAFE MERGE EXECUTION
    // ------------------------------------------------------------------------
    if (car.inPitLane) {
      const targetBoxS = car.assignedPitBoxS ?? 30;
      car._aiCornerConstrained = true;
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
          car._aiTargetSpeedKmh = 340.0;
          car._aiCornerConstrained = false;
          this._commitQuinticLateralGoal(car, ROAD_HALF_WIDTH * 0.58, 0.90);
        } else {
          car._aiTargetSpeedKmh = PIT_LANE_CONFIG.speedLimitKmh - 1.5;
        }
      }
      car._aiBrakeAggression = 1.05;
      return;
    }

    const curKReal = this._getRealCurvature(s);
    const lookK20 = this._getRealCurvature(s + 20.0 / mPerGameM);
    const prelimChicane = (curKReal * lookK20 < -0.000004) || (Math.abs(curKReal) > 0.0035 && Math.abs(lookK20) > 0.0035);

    // ------------------------------------------------------------------------
    // 1. SIDEPOD OVERLAP CORRIDORS (>= 1.28x CAR WIDTH FIA RACING ROOM!)
    // ------------------------------------------------------------------------
    let blockedLeftMax = -ROAD_HALF_WIDTH + 1.08;
    let blockedRightMin = (s >= 946 || s <= 78) ? (ROAD_HALF_WIDTH - 1.42) : (ROAD_HALF_WIDTH - 1.08);
    let sideBySideInChicane = false;

    for (let i = 0; i < allCars.length; i++) {
      const other = allCars[i];
      if (!other || other === car || other.exploded || other.inPitLane) continue;
      if (isShowroomDemo && other.isPlayer) continue;

      const dsReal = Math.abs(signedDeltaGameM(other.s, s)) * mPerGameM;
      const sideOverlapWindowM = (other.isPlayer ? 6.6 : 5.8) + (prelimChicane ? 1.8 : 0.0);
      if (dsReal < sideOverlapWindowM) {
        if (prelimChicane) sideBySideInChicane = true;
        const minCorridor = CAR_WIDTH * (other.isPlayer ? 1.32 : (prelimChicane ? 1.30 : 1.28));
        if (other.lateralOffset <= car.lateralOffset) {
          blockedLeftMax = Math.max(blockedLeftMax, other.lateralOffset + minCorridor);
        } else {
          blockedRightMin = Math.min(blockedRightMin, other.lateralOffset - minCorridor);
        }
      }
    }

    // ------------------------------------------------------------------------
    // 2. SCAN 180M REAL-CURVATURE CORNER ZONES & OUTSIDE-APEX-OUTSIDE LINE
    // ------------------------------------------------------------------------
    const cornerScan = this._scanForwardCornersAndLine(car, s, mPerGameM, sideBySideInChicane, personality);
    const { zones, upcomingCornerZone, isChicaneFlip } = cornerScan;
    let preferredLat = cornerScan.racingLineLat;
    let goalHorizonSec = 0.82;

    const upcomingCornerSign = upcomingCornerZone ? upcomingCornerZone.sign : 0;
    const upcomingCornerDistM = upcomingCornerZone ? Math.max(0.0, upcomingCornerZone.dIn) : 999.0;
    const approachingHeavyBraking = !!(
      upcomingCornerZone &&
      upcomingCornerZone.dIn <= 155.0 &&
      upcomingCornerZone.dApex > 4.0 &&
      (upcomingCornerZone.deltaThetaFull > 0.62 || upcomingCornerZone.kPeak > 0.0085)
    );

    // ------------------------------------------------------------------------
    // 3. TRAFFIC / DRS WAKE TELEMETRY & DYNAMIC 2-STOP VS 1-STOP PIT STRATEGY
    // ------------------------------------------------------------------------
    let nearestAheadCar = null;
    let nearestAheadM = 999.0;
    let carsInWakeCone = 0;
    const refMps = Math.max(20.0, car.speedKmh / 3.6);

    for (let i = 0; i < allCars.length; i++) {
      const other = allCars[i];
      if (!other || other === car || other.exploded || other.inPitLane) continue;
      if (isShowroomDemo && other.isPlayer) continue;
      const aheadM = forwardDistGameM(s, other.s) * mPerGameM;
      if (aheadM > 1.4 && aheadM < 56.0) {
        if (Math.abs(other.lateralOffset - car.lateralOffset) < CAR_WIDTH * 1.65) {
          carsInWakeCone++;
        }
        if (aheadM < nearestAheadM) {
          nearestAheadM = aheadM;
          nearestAheadCar = other;
        }
      }
    }

    car._aiClosestAheadGapSec = nearestAheadM < 500.0 ? (nearestAheadM / refMps) : 99.0;
    car.aiDraftTrainCount = carsInWakeCone;
    car.aiInDraftTrain = carsInWakeCone >= 1 && nearestAheadM < 44.0;

    if (nearestAheadCar && nearestAheadM < 20.0 && car.speedKmh >= nearestAheadCar.speedKmh - 4.5) {
      car.aiDirtyAirStuckTimer = finiteOr(car.aiDirtyAirStuckTimer, 0.0) + plannerDt;
      car.aiCleanAirTimer = 0.0;
    } else if (nearestAheadM > 46.0) {
      car.aiCleanAirTimer = finiteOr(car.aiCleanAirTimer, 0.0) + plannerDt;
      car.aiDirtyAirStuckTimer = Math.max(0, finiteOr(car.aiDirtyAirStuckTimer, 0.0) - plannerDt * 1.4);
    } else {
      car.aiDirtyAirStuckTimer = Math.max(0, finiteOr(car.aiDirtyAirStuckTimer, 0.0) - plannerDt * 0.5);
    }

    const lenPreset = PRO_2026_LENGTHS[raceLengthId] || PRO_2026_LENGTHS.SHORT;
    const wearFuelMult = finiteOr(ctx?.wearFuelMult, lenPreset.wearFuelMult || 1.0);

    if (!isClassic && !isQualifying && !isShowroomDemo) {
      const W = finiteOr(this.weather?.grooveMoisture, 0.0);
      const wetCrossThresh = personality.wetWeatherMastery >= 1.04 ? 0.25 : 0.28;
      const onDrySlicksInRain = (car.compound !== 'INTERMEDIATE' && car.compound !== 'FULL_WET') && W > wetCrossThresh;
      if (car.lap >= totalLaps && !car.damage?.hasPuncture && !onDrySlicksInRain) {
        car.aiWantsToPit = false;
      } else {
        this._evaluateAIPitStrategy(car, allCars, arch, personality, totalLaps, wearFuelMult, mPerGameM);
      }
    } else {
      car.aiWantsToPit = false;
    }

    // ------------------------------------------------------------------------
    // 4. FIA 1-MOVE STRAIGHT DEFENSE, SLIPSTREAM TUCKS & LATE-APEX SWITCHBACKS
    // ------------------------------------------------------------------------
    const nextSec = this.track.getSector(s + 30.0 / mPerGameM);
    const inYellow = !isShowroomDemo && (
      this.raceSystems.isSectorYellow(curSec.id) ||
      this.raceSystems.isSectorYellow(nextSec.id)
    );
    const vscActive = !isShowroomDemo && this.raceSystems.vscActive;
    const W = isClassic ? 0.0 : finiteOr(this.weather?.grooveMoisture, 0.0);

    // Active Over-Under Exit Switchback execution!
    if (car.aiSwitchbackTimer > 0 && car.aiSwitchbackSign !== 0 && !inYellow && !vscActive) {
      preferredLat = clamp(car.aiSwitchbackSign * 4.55, -ROAD_HALF_WIDTH + 1.35, ROAD_HALF_WIDTH - 1.35);
      goalHorizonSec = 0.92;
    }

    // STRICT FIA 1-MOVE DEFENSIVE RULE ON STRAIGHTS (Early claim up to 160m before braking zone!)
    const canDefendOnStraight =
      !isQualifying &&
      !isShowroomDemo &&
      !inYellow &&
      !vscActive &&
      Math.abs(curKReal) < 0.0022 &&
      car.brakeInput < 0.08 &&
      upcomingCornerDistM <= 165.0;

    if (canDefendOnStraight && personality.defensiveCraft >= 0.85) {
      const maxDefGapSec = arch.id === 'DEFENSIVE_WALL' ? 0.72 : 0.50;
      const maxDefRangeM = Math.max(arch.defensiveRangeM || 15.0, refMps * maxDefGapSec);

      let closestThreat = null;
      let closestBehindM = maxDefRangeM;

      for (let i = 0; i < allCars.length; i++) {
        const other = allCars[i];
        if (!other || other === car || other.exploded || other.inPitLane) continue;
        const behindM = signedDeltaGameM(s, other.s) * mPerGameM;
        if (behindM > CAR_LENGTH * 1.15 && behindM <= maxDefRangeM && other.speedKmh > car.speedKmh - 8.0) {
          if (!closestThreat || other.isPlayer || behindM < closestBehindM) {
            closestThreat = other;
            closestBehindM = behindM;
            if (other.isPlayer) break;
          }
        }
      }

      if (closestThreat) {
        if (car.aiDefenseMovesUsed === 0) {
          const insideSign = upcomingCornerSign !== 0
            ? upcomingCornerSign
            : (closestThreat.lateralOffset >= 0 ? 1 : -1);
          car.aiDefenseCommittedSide = insideSign;
          car.aiDefenseMovesUsed = 1;
          car.aiDefenseLat = clamp(
            insideSign * 4.35 + (closestThreat.lateralOffset - insideSign * 4.35) * 0.22,
            -ROAD_HALF_WIDTH + 1.65,
            ROAD_HALF_WIDTH - 1.65
          );
        }

        if (car.aiDefenseLat !== null) {
          // FIA Art 33.4: leave >= 1.28x car width to the track edge if attacker overlaps on the outside flank!
          let legalDefLat = car.aiDefenseLat;
          if (closestBehindM < 15.0) {
            const minEdgeBuffer = 1.15 + CAR_WIDTH * 1.30;
            if (closestThreat.lateralOffset < car.lateralOffset - CAR_WIDTH * 0.52) {
              legalDefLat = Math.max(legalDefLat, -ROAD_HALF_WIDTH + minEdgeBuffer);
            } else if (closestThreat.lateralOffset > car.lateralOffset + CAR_WIDTH * 0.52) {
              legalDefLat = Math.min(legalDefLat, ROAD_HALF_WIDTH - minEdgeBuffer);
            }
          }
          preferredLat = legalDefLat;
          goalHorizonSec = 1.18;
        }
      }
    }

    // MULTI-CAR SLIPSTREAM TUCKS, INSIDE LATE-BRAKING LUNGES & OVER-UNDER SWITCHBACKS
    const onFastSection = Math.abs(curKReal) < 0.0025 && Math.abs(lookK20) < 0.0032;
    let activeSlingshotTarget = null;

    if (!isQualifying && !isShowroomDemo && !inYellow && !vscActive && nearestAheadCar && nearestAheadM < 50.0) {
      const leadCandidate = nearestAheadCar;
      const leadDistM = nearestAheadM;
      const closingMps = Math.max(0, (car.speedKmh - leadCandidate.speedKmh) / 3.6);
      const ttcSec = closingMps > 0.35 ? leadDistM / closingMps : 99.0;
      const pulloutDistM = arch.id === 'LATE_BRAKER' ? 25.0 : (arch.id === 'ROOKIE_WILDCARD' ? 23.0 : 20.5);

      // Avoid 3-wide pileups if leadCandidate is already side-by-side overtaking a 3rd car
      let leaderAlready2Wide = false;
      for (let i = 0; i < allCars.length; i++) {
        const third = allCars[i];
        if (!third || third === car || third === leadCandidate || third.exploded || third.inPitLane) continue;
        const aheadOfLeaderM = forwardDistGameM(leadCandidate.s, third.s) * mPerGameM;
        if (
          aheadOfLeaderM > -4.0 &&
          aheadOfLeaderM < 14.0 &&
          Math.abs(leadCandidate.lateralOffset - third.lateralOffset) > CAR_WIDTH * 0.95
        ) {
          leaderAlready2Wide = true;
          break;
        }
      }

      const insideSign = upcomingCornerSign;
      const leaderDefendingTightInside = insideSign !== 0 && (leadCandidate.lateralOffset * insideSign > 3.10);
      const leaderLockedUpWide =
        finiteOr(leadCandidate.aiMistakeTimer, 0.0) > 0 ||
        (insideSign !== 0 && Math.abs(curKReal) > 0.0045 && (leadCandidate.lateralOffset * insideSign < 1.1));

      if (leaderAlready2Wide && leadDistM > 11.0) {
        preferredLat = clamp(leadCandidate.lateralOffset, -ROAD_HALF_WIDTH + 1.6, ROAD_HALF_WIDTH - 1.6);
        goalHorizonSec = 1.20;
      } else if (onFastSection && leadDistM >= pulloutDistM && ttcSec > 2.0 && !approachingHeavyBraking && leadCandidate.speedKmh > 145) {
        // Stage 1: Smooth Slipstream Wake Tuck with subtle 0.20m visibility stagger
        const peepOffset = (car.carNum % 2 === 0) ? 0.20 : -0.20;
        preferredLat = clamp(leadCandidate.lateralOffset + peepOffset, -ROAD_HALF_WIDTH + 1.75, ROAD_HALF_WIDTH - 1.75);
        goalHorizonSec = 1.32;
      } else if (
        approachingHeavyBraking &&
        insideSign !== 0 &&
        leadDistM < 24.0 &&
        leadDistM > 6.5 &&
        leaderDefendingTightInside &&
        personality.switchbackSkill >= 0.82
      ) {
        // Stage 2A: Late-Apex Over-Under Switchback! Swing +0.9m wider on entry, square apex & launch underneath!
        preferredLat = clamp(-insideSign * 5.25, -ROAD_HALF_WIDTH + 1.30, ROAD_HALF_WIDTH - 1.30);
        car.aiSwitchbackSign = insideSign;
        car.aiSwitchbackTimer = 1.55;
        goalHorizonSec = 1.05;
      } else if (
        Math.abs(curKReal) > 0.0045 &&
        insideSign !== 0 &&
        leadDistM < 20.0 &&
        leaderLockedUpWide
      ) {
        // Stage 2B: Opportunistic Inside Apex Cutback when rival locks up & drifts wide!
        activeSlingshotTarget = leadCandidate;
        car.aiPassSide = insideSign;
        car.aiPassLockTimer = 1.45;
        preferredLat = clamp(insideSign * 4.65, -ROAD_HALF_WIDTH + 1.25, ROAD_HALF_WIDTH - 1.25);
        goalHorizonSec = 0.95;
      } else if (
        leadDistM < 34.0 &&
        (leadDistM < pulloutDistM || ttcSec <= 2.4 || (approachingHeavyBraking && leadDistM < 28.0 && closingMps > -1.2))
      ) {
        // Stage 2C: Committed Quintic Slingshot / Inside Late-Braking Dive!
        activeSlingshotTarget = leadCandidate;
        if (car.aiPassLockTimer <= 0) {
          car.aiPassSide = this._chooseBestOvertakeSide(car, leadCandidate, allCars, upcomingCornerSign, arch, mPerGameM);
          car.aiPassLockTimer = 1.65;
        }
        const leaderLat = leadCandidate.lateralOffset;
        const roomChosen = car.aiPassSide < 0
          ? leaderLat - (-ROAD_HALF_WIDTH + 1.32)
          : (ROAD_HALF_WIDTH - 1.32) - leaderLat;
        if (roomChosen < CAR_WIDTH * 1.32) {
          car.aiPassSide = -car.aiPassSide;
          car.aiPassLockTimer = 1.45;
        }
        const passSpacing = CAR_WIDTH * (leadCandidate.isPlayer ? 1.54 : 1.46);
        preferredLat = clamp(
          leaderLat + car.aiPassSide * passSpacing,
          -ROAD_HALF_WIDTH + 1.25,
          ROAD_HALF_WIDTH - 1.25
        );
        goalHorizonSec = 1.15;
      }
    }

    // Showroom Hero Stage: keep AI traffic smoothly in the right lane past the parked #1 Pole Car
    if (isShowroomDemo && (s > 955 || s < 35)) {
      preferredLat = Math.max(3.2, preferredLat);
    }

    // Lap-start 2x2 grid discipline for the first 30 game-meters so 8–16 cars launch cleanly
    if (!isShowroomDemo && !isQualifying && car.lap === 1 && car.totalDistanceGameM < 30.0) {
      preferredLat = car.lateralOffset >= 0 ? Math.max(2.2, preferredLat) : Math.min(-2.2, preferredLat);
      goalHorizonSec = 0.95;
    }

    // ------------------------------------------------------------------------
    // 5. CONTINUOUS 13-RAY QUADRATIC COST + PARABOLIC SUB-RAY INTERPOLATION
    // ------------------------------------------------------------------------
    const puddles = this.track.puddles || [];
    const debrisItems = this.raceSystems?.effects?.debrisItems || [];
    const checkPuddles = (isClassic && !isQualifying) || W > 0.20;
    const numRays = FORWARD_RAY_LANES.length;
    const rayCosts = new Float64Array(numRays);
    const rayValid = new Uint8Array(numRays);

    let bestIdx = -1;
    let minCost = 1e12;

    for (let rIdx = 0; rIdx < numRays; rIdx++) {
      const laneLat = FORWARD_RAY_LANES[rIdx];
      if (blockedLeftMax <= blockedRightMin) {
        if (laneLat < blockedLeftMax - 0.55 || laneLat > blockedRightMin + 0.55) {
          rayCosts[rIdx] = 1e9;
          continue;
        }
      }
      rayValid[rIdx] = 1;

      // Smooth quadratic C^infinity objective so 3-point parabolic fit recovers exact continuous d*!
      const dPref = laneLat - preferredLat;
      const dCur = laneLat - car.lateralOffset;
      const smoothWeight = activeSlingshotTarget ? 0.22 : 0.38;
      let cost = dPref * dPref * 1.15 + dCur * dCur * smoothWeight;

      // Soft corridor boundary repulsion near side-by-side FIA overlap bounds
      if (blockedLeftMax <= blockedRightMin) {
        if (laneLat < blockedLeftMax) {
          const pen = blockedLeftMax - laneLat;
          cost += 95.0 * pen * pen + 18.0 * pen;
        } else if (laneLat > blockedRightMin) {
          const pen = laneLat - blockedRightMin;
          cost += 95.0 * pen * pen + 18.0 * pen;
        }
      }

      if (Math.abs(laneLat) > 6.5) {
        const edgeEx = Math.abs(laneLat) - 6.5;
        cost += edgeEx * edgeEx * 2.8;
      }

      // Scan 0m -> 165m ahead along candidate lane with smooth Gaussian lateral repulsion
      for (let i = 0; i < allCars.length; i++) {
        const other = allCars[i];
        if (!other || other === car || other.inPitLane) continue;
        if (isShowroomDemo && other.isPlayer && (s > 955 || s < 35) && laneLat >= 2.4) continue;

        const aheadM = forwardDistGameM(s, other.s) * mPerGameM;
        if (aheadM > 0.0 && aheadM <= 165.0) {
          const safeSigma = CAR_WIDTH * (other.isPlayer ? 0.92 : 0.86);
          const latSep = laneLat - other.lateralOffset;
          if (Math.abs(latSep) < safeSigma * 2.35) {
            const closingKmh = car.speedKmh - other.speedKmh;
            if (other.exploded || other.speedKmh < 75 || closingKmh > -5.5 || aheadM < 22.0) {
              const normUrgency = (168.0 - aheadM) / 165.0;
              const gauss = Math.exp(-(latSep * latSep) / (2.0 * safeSigma * safeSigma));
              const basePenalty = other.exploded ? 280.0 : (aheadM < 18.0 ? 165.0 : 112.0);
              cost += normUrgency * normUrgency * basePenalty * gauss;
            }
          }
        }
      }

      // Standing Puddle avoidance (weighted by archetype + wetWeatherMastery!)
      if (checkPuddles) {
        const puddleSkill = (arch.puddleAvoidWeight || 1.1) * (personality.wetWeatherMastery || 1.0);
        for (let i = 0; i < puddles.length; i++) {
          const p = puddles[i];
          const aheadM = forwardDistGameM(s, p.s) * mPerGameM;
          if (aheadM > 0 && aheadM <= 125.0) {
            const latSep = laneLat - p.lat;
            const pSigma = Math.max(0.9, (p.radius || 1.2) * 0.85);
            if (Math.abs(latSep) < pSigma * 2.2) {
              const prox = (128.0 - aheadM) / 128.0;
              cost += 54.0 * puddleSkill * prox * Math.exp(-(latSep * latSep) / (2.0 * pSigma * pSigma));
            }
          }
        }
      }

      // Carbon Fiber Debris avoidance (2026 Mode puncture hazard!)
      if (!isClassic && debrisItems.length > 0) {
        for (let i = 0; i < debrisItems.length; i++) {
          const deb = debrisItems[i];
          const aheadM = forwardDistGameM(s, deb.s) * mPerGameM;
          if (aheadM > 0 && aheadM <= 135.0) {
            const latSep = laneLat - deb.lateralOffset;
            const dSigma = Math.max(0.85, (deb.radius || 0.9) + 0.55);
            if (Math.abs(latSep) < dSigma * 2.2) {
              const prox = (138.0 - aheadM) / 138.0;
              cost += 98.0 * prox * Math.exp(-(latSep * latSep) / (2.0 * dSigma * dSigma));
            }
          }
        }
      }

      // LATE_BRAKER & ROOKIE_WILDCARD inside-corridor preference when lunging into heavy braking zones
      if (
        !inYellow &&
        !vscActive &&
        activeSlingshotTarget &&
        approachingHeavyBraking &&
        upcomingCornerSign !== 0 &&
        (arch.id === 'LATE_BRAKER' || arch.id === 'ROOKIE_WILDCARD')
      ) {
        const lungeBias = arch.id === 'LATE_BRAKER' ? 0.42 : 0.28;
        cost -= laneLat * upcomingCornerSign * lungeBias;
      }

      rayCosts[rIdx] = cost;
      if (cost < minCost) {
        minCost = cost;
        bestIdx = rIdx;
      }
    }

    let continuousGoalLat = clamp(preferredLat, -ROAD_HALF_WIDTH + 1.08, ROAD_HALF_WIDTH - 1.08);
    if (bestIdx >= 0) {
      continuousGoalLat = FORWARD_RAY_LANES[bestIdx];
      // Exact 3-point parabolic sub-ray interpolation (#108 Section 3.2):
      // d* = d_k* + (Delta_d / 2) * (C_{k*-1} - C_{k*+1}) / (C_{k*-1} - 2*C_{k*} + C_{k*+1} + 1e-6)
      if (bestIdx > 0 && bestIdx < numRays - 1 && rayValid[bestIdx - 1] && rayValid[bestIdx + 1]) {
        const cLeft = rayCosts[bestIdx - 1];
        const cMid = rayCosts[bestIdx];
        const cRight = rayCosts[bestIdx + 1];
        const denom = cLeft - 2.0 * cMid + cRight;
        if (denom > 1e-5) {
          const subOffset = clamp(
            0.5 * RAY_LANE_STEP_M * ((cLeft - cRight) / (denom + 1e-6)),
            -0.60,
            0.60
          );
          continuousGoalLat = FORWARD_RAY_LANES[bestIdx] + subOffset;
        }
      }
    } else {
      continuousGoalLat = (blockedLeftMax + blockedRightMin) * 0.5;
    }

    if (blockedLeftMax <= blockedRightMin) {
      continuousGoalLat = clamp(continuousGoalLat, blockedLeftMax, blockedRightMin);
    }
    continuousGoalLat = clamp(continuousGoalLat, -ROAD_HALF_WIDTH + 1.05, ROAD_HALF_WIDTH - 1.05);

    this._commitQuinticLateralGoal(car, continuousGoalLat, goalHorizonSec);

    // ------------------------------------------------------------------------
    // 6. REAL-CURVATURE (180m, DeltaTheta, R_eff) AERO CORNER & BRAKING SOLVER
    // ------------------------------------------------------------------------
    if (isClassic && isQualifying) {
      car._aiTargetSpeedKmh = 212.0 + (car.carNum % 5) * 11.5;
      car._aiCornerConstrained = true;
      car._aiBrakeAggression = 0.92;
      return;
    }

    const jitterKey = car.lap * 16 + curSec.id;
    if (car.aiLastJitterKey !== jitterKey) {
      car.aiLastJitterKey = jitterKey;
      const wave = Math.sin(car.lap * 7.13 + curSec.id * 2.71 + car.carNum * 1.93);
      car.aiLapBrakeJitter = wave * (arch.brakeVarianceM || 1.0) * 0.45;
    }

    const coinOpInfinite = ctx?.arcadeRulesPreset === 'CLASSIC_COINOP';
    const effGrip = this._estimateEffectiveGrip(car, curKReal, coinOpInfinite, personality);
    car._aiCachedEffGrip = effGrip;

    const modTopKmh = isClassic ? 0.0 : clamp(finiteOr(car.perfMods?.topSpeedBonusKmh, 0.0), -15.0, 28.0);
    const modDrsKmh = isClassic ? 0.0 : clamp(finiteOr(car.perfMods?.drsBonusKmh, 0.0), 0.0, 12.0);
    const modAeroGrip = isClassic ? 1.0 : clamp(finiteOr(car.perfMods?.aeroGripMult, 1.0), 0.82, 1.25);
    const modBrake = isClassic ? 1.0 : clamp(finiteOr(car.perfMods?.brakeMult, 1.0), 0.82, 1.25);

    // Physical vehicle mass m(t) = 798 kg + fuelKg coupled into aero cornering & braking distance!
    const fuelKg = coinOpInfinite
      ? 0.0
      : (Number.isFinite(car.fuelKg) ? clamp(car.fuelKg, 0.0, 110.0) : clamp(finiteOr(car.fuelLaps, 5.0) * 6.0, 0.0, 100.0));
    const massKg = 798.0 + fuelKg;
    const loadSensMult = 0.89 * clamp(Math.pow(810.0 / massKg, 0.08), 0.88, 1.04);

    // Exact alignment with physics.js F1_MECH_MU_SCALE (1.54), F1_BASE_DOWNFORCE_KL (3.75) & F1_BASE_DRAG_KD (0.96):
    // -> Tight hairpins (R_center 20..26m, DeltaTheta 160..180 deg): 80..105 km/h
    // -> Medium 90-deg bends (R_center 42..55m): 155..182 km/h
    // -> Fast aero sweepers (130R / Copse / 100R, R_eff 125..142m): 285..315 km/h
    // -> Gradual bends & straights: 332+ km/h flat-out (1.00 WOT!)
    const muLatPhys = (coinOpInfinite ? 1.48 : 1.54 * effGrip * modAeroGrip * loadSensMult);
    const muLongPhys = (coinOpInfinite ? 1.42 : 1.54 * 0.96 * effGrip * modBrake * loadSensMult);
    const fwDmg = coinOpInfinite ? 0.0 : clamp(finiteOr(car.damage?.frontWing, 0.0), 0.0, 1.0);
    const rwDmg = coinOpInfinite ? 0.0 : clamp(finiteOr(car.damage?.rearWing, 0.0), 0.0, 1.0);
    const suspDmg = coinOpInfinite ? 0.0 : clamp(finiteOr(car.damage?.suspension, 0.0), 0.0, 1.0);
    const aeroDmgEff = Math.max(0.48, (1.0 - 0.48 * fwDmg * 0.445 - 0.52 * rwDmg * 0.555) * (1.0 - 0.24 * suspDmg));
    const kDownforce = isClassic ? (3.25 * aeroDmgEff) : (3.75 * modAeroGrip * aeroDmgEff);
    const kDrag = 0.96 * (1.0 + 0.095 * fwDmg + 0.16 * rwDmg);
    const g = 9.81;

    const straightCeilingKmh = isClassic
      ? 310.0
      : (336.0 + modTopKmh + modDrsKmh);
    const aeroTopMps = straightCeilingKmh / 3.6;

    const pressureCreepM = finiteOr(car.aiPressureMeter, 0.0) > 0.48
      ? (car.aiPressureMeter - 0.48) * 5.2
      : 0.0;
    const brakeAgg = personality.brakingAggression || 1.0;
    car._aiBrakeAggression = brakeAgg;

    // LATE_BRAKER brakes 1.04x harder & later into heavy braking zones; TIRE_WHISPERER leaves smooth margin
    const decelAggMult = arch.id === 'LATE_BRAKER'
      ? 1.04
      : (arch.id === 'TIRE_WHISPERER' ? 0.94 : (arch.id === 'ROOKIE_WILDCARD' ? 1.02 : 0.99));
    const brakeLeadMarginM = clamp(
      6.5 - ((arch.brakeOffsetM || 0.0) * 0.38 + pressureCreepM) + finiteOr(car.aiLapBrakeJitter, 0.0),
      -1.5,
      13.5
    );

    let archCornerSkill = 1.0;
    if (arch.id === 'APEX_TACTICIAN') archCornerSkill = 1.012;
    else if (arch.id === 'TIRE_WHISPERER') archCornerSkill = 1.008;
    else if (arch.id === 'LATE_BRAKER') archCornerSkill = 1.002;
    else if (arch.id === 'DEFENSIVE_WALL') archCornerSkill = 0.996;

    const racePaceMult = this._computeCompetitivePaceMultiplier(
      car,
      playerCar,
      arch,
      isClassic,
      isQualifying,
      isShowroomDemo
    );

    let minAllowedMps = aeroTopMps;
    let cornerConstrained = false;
    let hardBrakingZone = false;
    let activeZoneFound = false;
    let activeZoneTargetS = s;
    let activeZoneVMaxMps = aeroTopMps;
    let activeZoneDecelMps2 = 26.0;

    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (z.dOut <= 0.5) continue;

      let deltaThetaEff = z.deltaThetaFull;
      let kEff = z.kPeak;

      // Once past apex (dApex < -2.0m), unwind speed strictly in proportion to actual dropping curvature kNow!
      if (z.dApex < -2.0) {
        const kNow = Math.max(Math.abs(curKReal), Math.abs(this._getRealCurvature(s + 7.0 / mPerGameM)));
        const kRatio = clamp(kNow / Math.max(1e-4, z.kPeak), 0.0, 1.0);
        kEff = kNow;
        deltaThetaEff = Math.max(z.deltaThetaAhead, z.deltaThetaFull * kRatio);
      }

      if (kEff < CORNER_MIN_K_REAL || deltaThetaEff < 0.05) continue;

      const rCenter = 1.0 / kEff;
      const distInPos = Math.max(0.0, z.dIn);
      // Only penalize compromised inside entry BEFORE turn-in (z.dIn > 6m), never at the apex itself!
      const insideEntryCompromise = z.dIn > 6.0
        ? Math.max(0.0, z.sign * car.lateralOffset) * (1.0 - clamp((z.dIn - 6.0) / 38.0, 0.0, 1.0))
        : 0.0;
      let wEff = clamp(5.6 - 0.38 * insideEntryCompromise, 2.6, 5.8);
      if (sideBySideInChicane && distInPos < 35.0) {
        wEff = Math.min(wEff, 3.1); // Compromised 2-wide radius when wheel-to-wheel!
      }

      const halfDeflect = Math.min(Math.PI * 0.5, deltaThetaEff * 0.5);
      const sagittaDenom = Math.max(0.004, 1.0 - Math.cos(halfDeflect));
      // Account for physics.js front-axle load share (46.7%) & yaw damping (cYawDamp * r / l_f) in tight hairpins
      const yawDampFrontFactor = 0.85 + 0.12 * smoothstep(28.0, 92.0, rCenter);
      const muCornerEff = muLatPhys * yawDampFrontFactor;
      const wEffTightScale = smoothstep(20.0, 54.0, rCenter);
      const deltaR = Math.min(34.0, (wEff * (0.64 + 0.36 * wEffTightScale)) / sagittaDenom);
      const rEff = rCenter + deltaR;

      // Closed-form aero-augmented max corner speed (#108 Section 2 & physics.js L266):
      const aeroDenom = Math.max(0.285, 1.0 - muCornerEff * (kDownforce / massKg) * rEff);
      let vMaxZoneMps = Math.min(aeroTopMps, Math.sqrt((muCornerEff * g * rEff) / aeroDenom));

      vMaxZoneMps *= archCornerSkill;
      if (isChicaneFlip && distInPos < 45.0 && z.kPeak > 0.006) {
        vMaxZoneMps *= sideBySideInChicane ? 0.91 : 0.95;
      }
      vMaxZoneMps = Math.max(56.0 / 3.6, vMaxZoneMps);

      if (vMaxZoneMps >= aeroTopMps - 0.8) {
        continue; // Flat-out kink / ultra-wide sweeper!
      }

      // When already inside the corner (z.dIn <= 2.0), hold vMaxZoneMps directly without adding straight-line brake runway!
      const dBrakeTarget = z.dIn > 2.0
        ? (z.dIn + (z.deltaThetaFull > 0.55 ? 0.04 : 0.16) * Math.max(0.0, z.dApex - z.dIn))
        : 0.0;

      if (dBrakeTarget <= 2.0) {
        if (vMaxZoneMps < minAllowedMps) {
          minAllowedMps = vMaxZoneMps;
          cornerConstrained = true;
          activeZoneFound = false;
          if (vMaxZoneMps * 3.6 < 225.0 && z.dApex > -2.0) {
            hardBrakingZone = true;
          }
        }
      } else {
        const vCurMps = Math.max(vMaxZoneMps, car.speedKmh / 3.6);
        const vRms2 = 0.5 * (vCurMps * vCurMps + vMaxZoneMps * vMaxZoneMps);
        const aBrakeEff = (
          muLongPhys * (g + (kDownforce * vRms2) / massKg) +
          (kDrag * vRms2) / massKg
        ) * 0.74 * decelAggMult;

        const dEff = Math.max(0.0, dBrakeTarget - brakeLeadMarginM);
        const allowMps = Math.sqrt(vMaxZoneMps * vMaxZoneMps + 2.0 * aBrakeEff * dEff);
        if (allowMps < minAllowedMps) {
          minAllowedMps = allowMps;
          if (allowMps < aeroTopMps - 1.2) {
            cornerConstrained = true;
            if (vMaxZoneMps * 3.6 < 225.0) {
              hardBrakingZone = true;
            }
            activeZoneFound = true;
            activeZoneTargetS = wrapS(s + dEff / mPerGameM);
            activeZoneVMaxMps = vMaxZoneMps * racePaceMult;
            activeZoneDecelMps2 = aBrakeEff;
          }
        }
      }
    }

    car._aiHardBrakingZone = hardBrakingZone;
    car._aiZoneActive = activeZoneFound;
    car._aiZoneTargetS = activeZoneTargetS;
    car._aiZoneVMaxMps = activeZoneVMaxMps;
    car._aiZoneDecelMps2 = activeZoneDecelMps2;

    let targetKmh = cornerConstrained
      ? Math.min(straightCeilingKmh, (minAllowedMps * 3.6) * racePaceMult)
      : straightCeilingKmh;

    // ------------------------------------------------------------------------
    // 7. PIT ENTRY BRAKING RAMP (ZERO 80 KM/H SPEEDING PENALTIES EVEN IN WET!)
    // ------------------------------------------------------------------------
    if (!isClassic && !isShowroomDemo && car.aiWantsToPit && s >= 848) {
      const distToLimitLineM = Math.max(0, (PIT_LANE_CONFIG.speedLimitLineS - s) * mPerGameM);
      const limitMps = (PIT_LANE_CONFIG.speedLimitKmh - 2.5) / 3.6;
      const pitDecel = Math.max(11.5, muLongPhys * g * 0.85);
      const pitAllowKmh = Math.sqrt(limitMps * limitMps + 2.0 * pitDecel * Math.max(0, distToLimitLineM - 6.0)) * 3.6;
      if (pitAllowKmh < targetKmh) {
        targetKmh = pitAllowKmh;
        cornerConstrained = true;
      }
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
      if (!other || other === car || other.inPitLane) continue;
      if (isShowroomDemo && other.isPlayer) continue;

      const aheadM = forwardDistGameM(s, other.s) * mPerGameM;
      if (aheadM <= 0.5 || aheadM > 46.0) continue;

      if (!other.exploded && other.speedKmh >= 65.0 && aheadM < anyAheadInYellowDistM) {
        anyAheadInYellowDistM = aheadM;
        anyAheadInYellowCar = other;
      }

      const inCurrentPath = Math.abs(car.lateralOffset - other.lateralOffset) < CAR_WIDTH * 1.06;
      const inTargetPath = Math.abs(continuousGoalLat - other.lateralOffset) < CAR_WIDTH * 1.06;
      if ((inCurrentPath && aheadM < 21.0) || (inCurrentPath && inTargetPath && aheadM < 35.0)) {
        if (aheadM < directAheadDistM) {
          directAheadDistM = aheadM;
          directAheadCar = other;
        }
      }
    }

    if (directAheadCar && !directAheadCar.exploded) {
      const clearToPass = Math.abs(car.lateralOffset - directAheadCar.lateralOffset) >= CAR_WIDTH * 1.05;
      if (!clearToPass) {
        const playerBrakingHard = directAheadCar.isPlayer && directAheadCar.brakeInput > 0.15;
        const followGapM = directAheadCar.isPlayer ? (playerBrakingHard ? 11.2 : 8.8) : 7.2;
        let safeFollowKmh = targetKmh;
        if (directAheadDistM < followGapM) {
          safeFollowKmh = directAheadCar.speedKmh - (playerBrakingHard ? 12.0 : 6.5);
        } else {
          const followDecel = directAheadCar.isPlayer ? 14.0 : 16.5;
          const relAllowMps = Math.sqrt(2.0 * followDecel * Math.max(0, directAheadDistM - followGapM));
          safeFollowKmh = directAheadCar.speedKmh + relAllowMps * 3.6;
        }
        if (safeFollowKmh < targetKmh) {
          targetKmh = safeFollowKmh;
          cornerConstrained = true;
        }
      }
    }

    // If boxed in 3-wide side-by-side, ease off cleanly to resolve sandwich safely
    if (blockedLeftMax > blockedRightMin) {
      targetKmh = Math.min(targetKmh, car.speedKmh - 9.0);
      cornerConstrained = true;
    }

    // Local Yellow Flag compliance: slow down cleanly & strictly hold position!
    if (inYellow) {
      targetKmh = Math.min(targetKmh * 0.80, 218.0);
      if (anyAheadInYellowCar && anyAheadInYellowDistM < 34.0) {
        const yellowHoldKmh = anyAheadInYellowCar.speedKmh + clamp((anyAheadInYellowDistM - 11.5) * 1.4, -8.0, 4.0);
        targetKmh = Math.min(targetKmh, yellowHoldKmh);
      }
      cornerConstrained = true;
    }

    // Virtual Safety Car (VSC) delta limiter (156.5 km/h crisp formation)
    if (vscActive) {
      targetKmh = Math.min(targetKmh, 156.5);
      if (anyAheadInYellowCar && anyAheadInYellowDistM < 24.0) {
        targetKmh = Math.min(targetKmh, anyAheadInYellowCar.speedKmh + clamp((anyAheadInYellowDistM - 10.5) * 1.2, -6.0, 2.0));
      }
      cornerConstrained = true;
    }

    // Controlled apex lockup wide-excursion speed scrub
    if (car.aiMistakeTimer > 0) {
      targetKmh *= 0.91;
      cornerConstrained = true;
    }

    car._aiCornerConstrained = cornerConstrained;
    car._aiTargetSpeedKmh = Math.max(62.0, targetKmh);
  }

  /**
   * Re-anchors the C^2 quintic lateral trajectory smoothly from the current live
   * (pos, vel, acc) state whenever the continuous spatial target shifts meaningfully.
   */
  _commitQuinticLateralGoal(car, goalLat, baseHorizonSec = 0.95) {
    const curLat = finiteOr(car.lateralOffset, 0.0);
    const prevGoal = finiteOr(car._aiQuinticP1, curLat);
    car._aiGoalLat = goalLat;

    if (Math.abs(goalLat - prevGoal) <= 0.065) {
      // Micro-update endpoint smoothly without restarting quintic clock
      car._aiQuinticP1 = prevGoal + (goalLat - prevGoal) * 0.55;
      return;
    }

    const live = evalQuinticLateralSpline(
      finiteOr(car._aiQuinticP0, curLat),
      finiteOr(car._aiQuinticV0, 0.0),
      finiteOr(car._aiQuinticA0, 0.0),
      prevGoal,
      finiteOr(car._aiQuinticElapsed, 0.0),
      finiteOr(car._aiQuinticDuration, 0.85)
    );

    const deltaLat = Math.abs(goalLat - live.pos);
    const duration = clamp(baseHorizonSec * 0.44 + deltaLat * 0.065, 0.26, 1.05);

    car._aiQuinticP0 = live.pos;
    car._aiQuinticV0 = clamp(live.vel, -9.5, 9.5);
    car._aiQuinticA0 = clamp(live.acc, -16.0, 16.0);
    car._aiQuinticP1 = goalLat;
    car._aiQuinticElapsed = 0.0;
    car._aiQuinticDuration = duration;
  }

  // ==========================================================================
  // HELPER: CHOOSE CLEANEST OVERTAKE SIDE (INSIDE LUNGE VS OPEN ASPHALT)
  // ==========================================================================
  _chooseBestOvertakeSide(car, leader, allCars, upcomingCornerSign, arch, mPerGameM) {
    const spacing = CAR_WIDTH * 1.50;
    const leftCand = leader.lateralOffset - spacing;
    const rightCand = leader.lateralOffset + spacing;

    const leftValid = leftCand >= -ROAD_HALF_WIDTH + 1.25;
    const rightValid = rightCand <= ROAD_HALF_WIDTH - 1.25;
    if (leftValid && !rightValid) return -1;
    if (rightValid && !leftValid) return 1;

    let leftScore = -Math.abs(car.lateralOffset - leftCand) * 0.55;
    let rightScore = -Math.abs(car.lateralOffset - rightCand) * 0.55;

    if (upcomingCornerSign !== 0) {
      const insideBonus = arch.id === 'LATE_BRAKER' ? 4.6 : (arch.id === 'ROOKIE_WILDCARD' ? 3.4 : 2.1);
      if (upcomingCornerSign < 0) leftScore += insideBonus;
      else rightScore += insideBonus;
    }

    for (let i = 0; i < allCars.length; i++) {
      const other = allCars[i];
      if (!other || other === car || other === leader || other.inPitLane) continue;
      const aheadM = forwardDistGameM(car.s, other.s) * mPerGameM;
      if (aheadM >= -3.0 && aheadM <= 58.0) {
        if (Math.abs(other.lateralOffset - leftCand) < CAR_WIDTH * 1.25) leftScore -= 9.5;
        if (Math.abs(other.lateralOffset - rightCand) < CAR_WIDTH * 1.25) rightScore -= 9.5;
      }
    }

    return rightScore > leftScore ? 1 : -1;
  }

  // ==========================================================================
  // HELPER: REAL-TIME TIRE, THERMAL, FLAT-SPOT, WEAR, WET & DAMAGE GRIP
  // ==========================================================================
  _estimateEffectiveGrip(car, curKReal, isClassic, personality) {
    if (isClassic) return 1.06;

    const comp = TIRE_COMPOUNDS[car.compound] || TIRE_COMPOUNDS.MEDIUM;
    const scaledKForWeather = clamp(curKReal * 82.0, -0.95, 0.95);
    const localW = typeof this.weather?.getMoistureAt === 'function'
      ? this.weather.getMoistureAt(scaledKForWeather, car.lateralOffset)
      : finiteOr(this.weather?.grooveMoisture, 0.0);

    const wetMastery = personality?.wetWeatherMastery || 1.0;
    const wetModBonus = clamp(finiteOr(car.perfMods?.wetGripBonus, 0.0), 0.0, 0.20);

    let baseMu = comp.baseGrip;
    if (!comp.isWetTire) {
      const wetLoss = Math.max(0.28, 0.54 - (wetMastery - 1.0) * 0.25 - wetModBonus);
      baseMu = comp.baseGrip * (1.0 - wetLoss * localW);
    } else if (comp.id === 'INTERMEDIATE') {
      if (localW < 0.10) baseMu = 0.88;
      else if (localW <= 0.58) baseMu = 1.04 + (wetMastery - 1.0) * 0.14 + wetModBonus * 0.5;
      else baseMu = 0.89 - (localW - 0.58) * 0.24 + (wetMastery - 1.0) * 0.12;
    } else if (comp.id === 'FULL_WET') {
      baseMu = localW < 0.20
        ? 0.80
        : (0.97 + Math.min(0.09, (localW - 0.45) * 0.18) + (wetMastery - 1.0) * 0.15 + wetModBonus * 0.5);
    }

    const flLife = finiteOr(car.tires?.FL?.life, 1.0);
    const frLife = finiteOr(car.tires?.FR?.life, 1.0);
    const rlLife = finiteOr(car.tires?.RL?.life, 1.0);
    const rrLife = finiteOr(car.tires?.RR?.life, 1.0);
    const avgLife = (flLife + frLife + rlLife + rrLife) * 0.25;
    const minLife = Math.min(flLife, frLife, rlLife, rrLife);
    const effLife = avgLife * 0.65 + minLife * 0.35;

    let wearMult = 1.0;
    if (effLife >= 0.28) {
      wearMult = 0.93 + 0.07 * ((effLife - 0.28) / 0.72);
    } else {
      const ratio = Math.max(0, effLife / 0.28);
      wearMult = 0.48 + 0.45 * ratio * ratio;
    }

    // 4-Corner Tire Thermal Window Awareness
    let thermalMult = 1.0;
    const tempsArr = Array.isArray(car.tireTempsC) && car.tireTempsC.length === 4
      ? car.tireTempsC
      : [
        finiteOr(car.tires?.FL?.temp, 92),
        finiteOr(car.tires?.FR?.temp, 92),
        finiteOr(car.tires?.RL?.temp, 92),
        finiteOr(car.tires?.RR?.temp, 92),
      ];
    const avgTempC = (tempsArr[0] + tempsArr[1] + tempsArr[2] + tempsArr[3]) * 0.25;
    if (Number.isFinite(avgTempC)) {
      if (avgTempC < comp.optTempMin - 6.0) {
        thermalMult = clamp(1.0 - (comp.optTempMin - 6.0 - avgTempC) * 0.004, 0.91, 1.0);
      } else if (avgTempC > comp.optTempMax + 8.0) {
        thermalMult = clamp(1.0 - (avgTempC - (comp.optTempMax + 8.0)) * 0.005, 0.87, 1.0);
      }
    }

    // Persistent tire flat-spot awareness (if accrued from heavy lockups)
    let flatSpotMult = 1.0;
    if (Array.isArray(car.tireFlatSpot) && car.tireFlatSpot.length === 4) {
      const maxFs = Math.max(
        finiteOr(car.tireFlatSpot[0], 0),
        finiteOr(car.tireFlatSpot[1], 0),
        finiteOr(car.tireFlatSpot[2], 0),
        finiteOr(car.tireFlatSpot[3], 0)
      );
      flatSpotMult = clamp(1.0 - 0.10 * maxFs, 0.86, 1.0);
    }

    if (car.damage?.hasPuncture) wearMult = 0.34;
    const fwDmg = clamp(finiteOr(car.damage?.frontWing, 0.0), 0.0, 1.0);
    const rwDmg = clamp(finiteOr(car.damage?.rearWing, 0.0), 0.0, 1.0);
    const suspDmg = clamp(finiteOr(car.damage?.suspension, 0.0), 0.0, 1.0);
    const mechDamageMult = 1.0 - fwDmg * 0.18 - rwDmg * 0.12 - suspDmg * 0.16;

    return clamp(baseMu * wearMult * thermalMult * flatSpotMult * mechDamageMult, 0.32, 1.22);
  }

  // ==========================================================================
  // HELPER: COMPETITIVE BATTLE PACE (FRONT-RUNNERS USE FULL 1.00+ LIMIT!)
  // ==========================================================================
  _computeCompetitivePaceMultiplier(car, playerCar, arch, isClassic, isQualifying, isShowroomDemo) {
    const outLapBonus = finiteOr(car.aiOutLapPushTimer, 0.0) > 0 ? 0.011 : 0.0;
    const overcutLightFuelBonus = car.aiOvercutActive && finiteOr(car.fuelLaps, 5.0) < 3.0 ? 0.009 : 0.0;
    const sprintBonus = car.aiStrategyType === 'TWO_STOP_SPRINT' && car.compound === 'SOFT' ? 0.004 : 0.0;

    // Upgrade baseline pace (~0.996..1.008 for front-row Works contenders) so AI attacks corners competitively!
    const archBase = Math.max(0.994, finiteOr(arch.basePace, 0.996) + 0.006);
    const baseSkill = archBase + finiteOr(car.aiSkillTierOffset, 0.0) + outLapBonus + overcutLightFuelBonus + sprintBonus;

    if (isShowroomDemo || isQualifying || !playerCar || playerCar.exploded || playerCar.inPitLane) {
      return clamp(baseSkill, 0.978, 1.024);
    }

    if (playerCar.totalDistanceGameM < 30.0) {
      return clamp(baseSkill, 0.982, 1.018);
    }

    // Within [-42..+38] game-meters (~175m battle bubble!), elastic === 1.000 for 100% honest physics parity!
    const gapGameM = car.totalDistanceGameM - playerCar.totalDistanceGameM;
    let elastic = 1.0;

    if (gapGameM > 38.0) {
      const excess = Math.min(1.0, (gapGameM - 38.0) / 160.0);
      elastic = 1.0 - excess * (isClassic ? 0.038 : 0.030);
    } else if (gapGameM < -42.0 && !car.damage?.hasPuncture && finiteOr(car.fuelLaps, 1.0) > 0.2) {
      const deficit = Math.min(1.0, (-gapGameM - 42.0) / 165.0);
      elastic = 1.0 + deficit * 0.026;
    }

    return clamp(baseSkill * elastic, 0.960, 1.035);
  }

  // ==========================================================================
  // HELPER: PROJECTED PIT REJOIN CLEAN-AIR CHECK FOR UNDERCUT STRATEGY
  // ==========================================================================
  _isProjectedPitRejoinClean(car, allCars, mPerGameM) {
    let rejoinS = car.s - 195.0;
    if (rejoinS < 0) rejoinS += TRACK_GAME_LENGTH;

    for (let i = 0; i < allCars.length; i++) {
      const other = allCars[i];
      if (!other || other === car || other.exploded || other.inPitLane || other.aiWantsToPit) continue;
      const sepM = Math.abs(signedDeltaGameM(other.s, rejoinS)) * mPerGameM;
      if (sepM < 24.0) {
        return false;
      }
    }
    return true;
  }

  // ==========================================================================
  // DYNAMIC RACE STRATEGY ENGINE:
  // - 2-Stop Aggressive Soft-Tire Sprinters vs 1-Stop Medium/Hard Whisperers
  // - Stint-Matched Numeric Fuel Loads (ZERO dead-weight 'FILL' on final laps!)
  // - Smart Clean-Air Undercut / Lightweight Overcut & Immediate Wet Crossover
  // ==========================================================================
  _evaluateAIPitStrategy(car, allCars, arch, personality, totalLaps, wearFuelMult, mPerGameM) {
    if (car.aiWantsToPit) return;

    const minLife = Math.min(
      finiteOr(car.tires?.FL?.life, 1.0),
      finiteOr(car.tires?.FR?.life, 1.0),
      finiteOr(car.tires?.RL?.life, 1.0),
      finiteOr(car.tires?.RR?.life, 1.0)
    );
    const W = finiteOr(this.weather?.grooveMoisture, 0.0);
    const isWetCompound = car.compound === 'INTERMEDIATE' || car.compound === 'FULL_WET';
    const isTwoStopSprinter = car.aiStrategyType === 'TWO_STOP_SPRINT';

    // 1. Immediate Wet / Slick Crossover Calls (rain masters anticipate crossover slightly earlier!)
    const wetEntryThreshold = (personality.wetWeatherMastery || 1.0) >= 1.04 ? 0.25 : 0.28;
    const slickDryThreshold = (personality.wetWeatherMastery || 1.0) >= 1.04 ? 0.10 : 0.08;
    const wetCrossoverTriggered = !isWetCompound && W > wetEntryThreshold;
    const monsoonEscalation = car.compound === 'INTERMEDIATE' && W > 0.64;
    const drySlickCrossover = isWetCompound && W < slickDryThreshold;
    const wrongTireForWeather = wetCrossoverTriggered || monsoonEscalation || drySlickCrossover;

    // Severe flat-spot check (if locked up heavily with >= 3 laps remaining)
    let severeFlatSpot = false;
    if (Array.isArray(car.tireFlatSpot) && (totalLaps - car.lap) >= 3) {
      const maxFs = Math.max(
        finiteOr(car.tireFlatSpot[0], 0),
        finiteOr(car.tireFlatSpot[1], 0),
        finiteOr(car.tireFlatSpot[2], 0),
        finiteOr(car.tireFlatSpot[3], 0)
      );
      severeFlatSpot = maxFs > 0.68 && minLife < 0.52;
    }

    const needsDamageFix = !!(
      car.damage?.hasPuncture ||
      finiteOr(car.damage?.frontWing, 0) > 0.52 ||
      finiteOr(car.damage?.rearWing, 0) > 0.52 ||
      finiteOr(car.damage?.suspension, 0) > 0.54
    );

    if (car._aiLastPitLap === car.lap && !car.damage?.hasPuncture && !wrongTireForWeather) {
      return;
    }

    const lapsLeftAfterThis = Math.max(1, totalLaps - car.lap);
    const burnPerLap = 1.04 * clamp(wearFuelMult, 0.5, 2.5);
    const minFuelForOneLap = Math.min(burnPerLap * 1.22, (lapsLeftAfterThis + 0.25) * burnPerLap);
    const needsFuel = finiteOr(car.fuelLaps, 5.0) < minFuelForOneLap;

    // Planned total stops for dry race based on 2-Stop Sprinter vs 1-Stop Whisperer personality
    const plannedTotalStops = isTwoStopSprinter
      ? (totalLaps >= 18 ? 3 : (totalLaps >= 8 ? 2 : 1))
      : (totalLaps >= 20 ? 2 : 1);
    const stopsDone = finiteOr(car.pitStopsCompleted, 0);

    // 2. Tire Cliff & Scheduled Sprint Window Threshold
    let cliffThreshold = isTwoStopSprinter
      ? clamp(0.35 + (arch.undercutLapsEarly || 0) * 0.03, 0.30, 0.40)
      : clamp(0.25 + (arch.undercutLapsEarly || 0) * 0.025, 0.21, 0.29);

    // Cheap Virtual Safety Car (VSC) opportunistic pit window!
    if (this.raceSystems?.vscActive && lapsLeftAfterThis >= 2 && stopsDone < plannedTotalStops + 1) {
      cliffThreshold = Math.max(cliffThreshold, 0.58);
    }

    // 3. Smart Clean-Air Undercut vs Lightweight Low-Fuel Overcut
    let triggerUndercut = false;
    const undercutLifeGate = isTwoStopSprinter ? 0.48 : 0.42;
    if (
      !wrongTireForWeather &&
      lapsLeftAfterThis >= 2 &&
      minLife < undercutLifeGate &&
      finiteOr(car.aiDirtyAirStuckTimer, 0.0) > 3.6 &&
      (isTwoStopSprinter || arch.id === 'APEX_TACTICIAN' || arch.id === 'LATE_BRAKER')
    ) {
      if (this._isProjectedPitRejoinClean(car, allCars, mPerGameM)) {
        triggerUndercut = true;
      }
    }

    // Overcut: 1-Stop Whisperer / Defensive Wall in clean air on light fuel stretches stint to 20.5%!
    if (
      !wrongTireForWeather &&
      !needsFuel &&
      !needsDamageFix &&
      !isTwoStopSprinter &&
      finiteOr(car.aiCleanAirTimer, 0.0) > 4.5 &&
      finiteOr(car.fuelLaps, 5.0) < 3.4 * wearFuelMult &&
      minLife >= 0.205
    ) {
      car.aiOvercutActive = true;
      cliffThreshold = Math.min(cliffThreshold, 0.21);
    } else {
      car.aiOvercutActive = false;
    }

    const hitTireCliff = minLife < cliffThreshold || severeFlatSpot;

    if (wrongTireForWeather || needsDamageFix || needsFuel || hitTireCliff || triggerUndercut) {
      car.aiWantsToPit = true;
      car._aiLastPitLap = car.lap;

      if (wrongTireForWeather) car.aiPitReason = W > wetEntryThreshold ? 'WET_TRANSITION' : 'DRY_CROSSOVER';
      else if (this.raceSystems?.vscActive && minLife < 0.58 && !needsDamageFix) car.aiPitReason = 'VSC_OPPORTUNITY';
      else if (triggerUndercut) car.aiPitReason = 'UNDERCUT_CLEAN_AIR';
      else if (hitTireCliff) car.aiPitReason = isTwoStopSprinter ? 'SPRINT_2STOP_WINDOW' : 'TIRE_CLIFF_STINT';
      else if (needsFuel) car.aiPitReason = 'STINT_FUEL';
      else car.aiPitReason = 'DAMAGE_REPAIR';

      // Determine how many stints remain INCLUDING the upcoming stint out of the pits
      const stopsAfterThis = stopsDone + 1;
      const willStopAgainLater =
        !wrongTireForWeather &&
        isTwoStopSprinter &&
        stopsAfterThis < plannedTotalStops &&
        lapsLeftAfterThis >= 5;

      const targetStintLaps = willStopAgainLater
        ? Math.max(3, Math.ceil(lapsLeftAfterThis / (plannedTotalStops - stopsDone)))
        : lapsLeftAfterThis;

      // Choose optimal compound matched to stint length, weather & 2-Stop vs 1-Stop identity
      let nextComp = arch.preferredDryTire || 'MEDIUM';
      if (W > 0.58) {
        nextComp = 'FULL_WET';
      } else if (W > wetEntryThreshold || (W > 0.15 && isWetCompound)) {
        nextComp = 'INTERMEDIATE';
      } else if (isTwoStopSprinter) {
        // Aggressive 2-Stop Sprinters bolt on grippy Softs whenever stint <= 7 laps!
        nextComp = targetStintLaps <= 7 ? 'SOFT' : 'MEDIUM';
      } else {
        // 1-Stop Tire Whisperers run durable Medium/Hard stints, or Softs only for a <= 3-lap late dash!
        if (targetStintLaps <= 3) nextComp = 'SOFT';
        else if (targetStintLaps <= 8) nextComp = car.compound === 'MEDIUM' && targetStintLaps >= 6 ? 'HARD' : 'MEDIUM';
        else nextComp = 'HARD';
      }

      // Stint-matched fuel load (in fuelLaps units): NEVER overfill 'FILL' dead weight on final laps!
      const safetyReserveLaps = willStopAgainLater ? 0.55 : 0.48;
      const desiredFuelAfterStop = Math.min(
        finiteOr(car.maxFuelLaps, 15.0),
        (targetStintLaps + safetyReserveLaps) * burnPerLap
      );
      const exactFuelToAdd = Number(
        Math.max(0.0, desiredFuelAfterStop - finiteOr(car.fuelLaps, 0.0)).toFixed(2)
      );

      let repairOrder = 'NONE';
      if (finiteOr(car.damage?.suspension, 0) > 0.40) {
        repairOrder = 'FULL';
      } else if (finiteOr(car.damage?.frontWing, 0) > 0.36 || finiteOr(car.damage?.rearWing, 0) > 0.35) {
        repairOrder = 'WINGS';
      }

      const crewPushMode = (triggerUndercut || isTwoStopSprinter || arch.id === 'APEX_TACTICIAN')
        ? 'AGGRESSIVE_UNDERCUT'
        : (arch.id === 'TIRE_WHISPERER' ? 'SAFE' : 'BALANCED');

      car.aiPitPlan = {
        nextCompound: nextComp,
        fuelToAdd: exactFuelToAdd,
        repairOrder,
        crewPushMode,
        plannedStintLaps: targetStintLaps,
        strategyType: car.aiStrategyType,
        reason: car.aiPitReason,
      };
    }
  }
}

