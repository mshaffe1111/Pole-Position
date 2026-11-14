// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Broadcast-Grade 60Hz Instant Replay Recorder, Sub-Frame Spline Interpolator
// & 6-Angle FOM Television Camera Director
// ============================================================================

import * as THREE from 'three';
import { TRACK_GAME_LENGTH, ROAD_HALF_WIDTH } from './config.js';

export const REPLAY_CAMERA_MODES = [
  { idx: 0, id: 'TRACKSIDE_TV',   label: 'FOM TRACKSIDE TV CAM',      shortLabel: 'TV CAM' },
  { idx: 1, id: 'HELI_PURSUIT',   label: 'HELICOPTER AERIAL PURSUIT', shortLabel: 'HELI CAM' },
  { idx: 2, id: 'ONBOARD_TCAM',   label: 'ONBOARD HALO T-CAM',        shortLabel: 'T-CAM' },
  { idx: 3, id: 'NOSE_KERB',      label: 'NOSE WING KERB CAM',        shortLabel: 'KERB CAM' },
  { idx: 4, id: 'REAR_LOOKBACK',  label: 'REAR WING EXHAUST LOOKBACK',shortLabel: 'REAR CAM' },
  { idx: 5, id: 'HERO_ORBIT',     label: 'CINEMATIC HERO ORBIT',      shortLabel: 'ORBIT' },
];

export const REPLAY_SPEED_OPTIONS = [0.25, 0.5, 1.0, 2.0];

const NUM_TRACKSIDE_CAMERAS = 11; // ~90.9 game-meters (~95m) around the 1,000m circuit
const UP_AXIS = new THREE.Vector3(0, 1, 0);

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

function smoothstep01(t) {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function wrapTrackS(s) {
  if (!Number.isFinite(s)) return 0;
  let r = s % TRACK_GAME_LENGTH;
  if (r < 0) r += TRACK_GAME_LENGTH;
  if (r >= TRACK_GAME_LENGTH) r = 0;
  return r;
}

// Shortest signed spline distance (sTarget - sOrigin) in [-TRACK_GAME_LENGTH/2, +TRACK_GAME_LENGTH/2)
function signedWrapDeltaS(delta) {
  if (!Number.isFinite(delta)) return 0;
  let d = delta % TRACK_GAME_LENGTH;
  const half = TRACK_GAME_LENGTH * 0.5;
  if (d >= half) d -= TRACK_GAME_LENGTH;
  else if (d < -half) d += TRACK_GAME_LENGTH;
  return d;
}

function shortestAngleDelta(fromRad, toRad) {
  let d = (toRad - fromRad) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// 4-point cubic Catmull-Rom interpolation (exact at t=0 -> p1 and t=1 -> p2)
function catmullRom1D(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2.0 * p1) +
    (-p0 + p2) * t +
    (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
    (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
  );
}

// Synthesize mechanical front-wheel steerAngleRad if caller snapshot omitted it
function computeFallbackSteerAngleRad(steerInput, speedKmh) {
  const sIn = clamp(finiteOr(steerInput, 0), -1, 1);
  if (Math.abs(sIn) < 0.002) return 0;
  const speedMps = Math.max(0, finiteOr(speedKmh, 0)) / 3.6;
  const nonLin = Math.sign(sIn) * Math.pow(Math.abs(sIn), 1.35) * (1.0 / (1.0 + 0.000162 * speedMps * speedMps));
  return nonLin * 0.46;
}

export class ReplayDirector {
  static CAMERA_MODES = REPLAY_CAMERA_MODES;
  static SPEED_OPTIONS = REPLAY_SPEED_OPTIONS;

  constructor(options = {}) {
    this.maxFrames = Math.max(60, Math.floor(options.maxFrames || 7200)); // 120s @ 60Hz
    this.sampleInterval = 1 / 60;
    this.cameraModes = REPLAY_CAMERA_MODES;

    // Circular-capped chronological snapshot array (recycles oldest frame objects past maxFrames)
    this.frames = [];

    // Transport & Broadcast Director State
    this.isPlaying = false;
    this.paused = false;
    this.playbackSpeed = 1.0;
    this.cameraModeIdx = 0;
    this.focusCarIndex = 0;

    // Internal recorder & playback clocks
    this._recordAccumulator = 0;
    this._recordClockSec = 0;
    this.playheadSec = 0;
    this._prevPlayheadSec = 0;

    // Virtual Trackside Broadcast Cameras (rebuilt automatically per circuit)
    this._cachedTrackKey = null;
    this._trackCams = [];
    this._activeTrackCamIdx = -1;
    this._flybyFiredForCamId = -1;
    this._flybyBuffetTimer = 0;
    this._flybyBuffetStrength = 0;

    // Camera smoothing, cut detection & FOV restoration
    this._savedCameraFov = null;
    this._currentFov = 58;
    this._cameraJustCut = true;
    this._orbitAngle = 0.58;
    this._heliPhase = 0.0;

    // Per-car VFX continuity caches (brake rotor thermal glow, gearshift backfires, tire compounds)
    this._recBrakeGlow = new Map();
    this._prevInterpGears = new Map();
    this._preReplayCompounds = new Map();
    this._appliedReplayCompounds = new Map();
    this._lastCarRigs = null;
    this._interpCarPool = [];
    this._interpFramesScratch = [];

    // Zero-GC scratch Three.js math vectors
    this._carFwd = new THREE.Vector3();
    this._carRight = new THREE.Vector3();
    this._carUp = new THREE.Vector3();
    this._camDesiredPos = new THREE.Vector3();
    this._camDesiredLook = new THREE.Vector3();
    this._camSmoothedPos = new THREE.Vector3();
    this._camSmoothedLook = new THREE.Vector3();
    this._packBattleOffset = new THREE.Vector3();
    this._tmpVecA = new THREE.Vector3();
    this._tmpVecB = new THREE.Vector3();

    this.reset();
  }

  // --------------------------------------------------------------------------
  // 1. 60HZ CIRCULAR FRAME RECORDER (120 SECONDS = 7,200 SNAPSHOTS)
  // --------------------------------------------------------------------------
  reset() {
    this.frames.length = 0;
    this.isPlaying = false;
    this.paused = false;
    this.playbackSpeed = 1.0;
    this.cameraModeIdx = 0;
    this.focusCarIndex = 0;

    this._recordAccumulator = 0;
    this._recordClockSec = 0;
    this.playheadSec = 0;
    this._prevPlayheadSec = 0;

    this._activeTrackCamIdx = -1;
    this._flybyFiredForCamId = -1;
    this._flybyBuffetTimer = 0;
    this._flybyBuffetStrength = 0;
    this._cameraJustCut = true;
    this._orbitAngle = 0.58;
    this._heliPhase = 0.0;

    this._recBrakeGlow.clear();
    this._prevInterpGears.clear();
    this._preReplayCompounds.clear();
    this._appliedReplayCompounds.clear();
  }

  hasFrames() {
    return this.frames.length >= 15;
  }

  getDurationSec() {
    if (this.frames.length < 2) return 0;
    return Math.max(0, this.frames[this.frames.length - 1].timeSec - this.frames[0].timeSec);
  }

  getCameraLabel(idx = this.cameraModeIdx) {
    const safeIdx = ((Math.floor(finiteOr(idx, 0)) % REPLAY_CAMERA_MODES.length) + REPLAY_CAMERA_MODES.length) % REPLAY_CAMERA_MODES.length;
    return REPLAY_CAMERA_MODES[safeIdx].label;
  }

  get cameraLabel() {
    return this.getCameraLabel(this.cameraModeIdx);
  }

  recordSnapshot(dt, {
    allCars,
    sessionElapsedSec = 0,
    currentLap = 1,
    totalLaps = 5,
    score = 0,
    weatherMoisture = 0,
  } = {}) {
    // Never mutate the replay buffer while actively watching a replay
    if (this.isPlaying) return false;
    if (!Array.isArray(allCars) || allCars.length === 0) return false;

    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;

    // Always capture the initial anchor frame immediately; thereafter sample cleanly at ~60Hz
    let sampleStepDt = safeDt;
    if (this.frames.length > 0) {
      this._recordAccumulator += safeDt;
      if (this._recordAccumulator < this.sampleInterval) {
        return false;
      }
      sampleStepDt = this._recordAccumulator;
      // Preserve fractional phase for steady 60Hz cadence while preventing multi-frame burst dumps
      this._recordAccumulator = Math.min(
        this.sampleInterval * 0.99,
        this._recordAccumulator % this.sampleInterval
      );
      this._recordClockSec += Math.max(1e-4, sampleStepDt);
    } else {
      this._recordClockSec = 0;
      this._recordAccumulator = 0;
    }

    // Recycle oldest snapshot object once circular capacity (7,200 frames) is reached (zero GC!)
    let snapshot;
    if (this.frames.length >= this.maxFrames) {
      snapshot = this.frames.shift();
    } else {
      snapshot = {
        timeSec: 0,
        sessionElapsedSec: 0,
        currentLap: 1,
        totalLaps: 5,
        score: 0,
        weatherMoisture: 0,
        cars: [],
      };
    }

    snapshot.timeSec = this._recordClockSec;
    snapshot.sessionElapsedSec = finiteOr(sessionElapsedSec, this._recordClockSec);
    snapshot.currentLap = Math.max(1, Math.floor(finiteOr(currentLap, allCars[0]?.lap || 1)));
    snapshot.totalLaps = Math.max(1, Math.floor(finiteOr(totalLaps, 5)));
    snapshot.score = Math.floor(finiteOr(score, 0));
    snapshot.weatherMoisture = clamp(finiteOr(weatherMoisture, 0), 0, 1);

    const carCount = allCars.length;
    snapshot.cars.length = carCount;

    for (let i = 0; i < carCount; i++) {
      const src = allCars[i];
      const speedKmh = Math.max(0, finiteOr(src.speedKmh, 0));
      const brakeInput = clamp(finiteOr(src.brakeInput, 0), 0, 1);
      const throttleInput = clamp(finiteOr(src.throttleInput, 0), 0, 1);
      const steerInput = clamp(finiteOr(src.steerInput, 0), -1, 1);
      const inSlipstream = !!src.inSlipstream;
      const drsActive = src.drsActive !== undefined
        ? !!src.drsActive
        : (inSlipstream && speedKmh > 205 && brakeInput < 0.05 && !src.inPitLane);

      // Integrate physical brake rotor glow so scrubbing/pausing on braking zones glows accurately
      const carId = src.id || (src.isPlayer ? 'PLAYER' : `AI_${i}`);
      const prevGlow = this._recBrakeGlow.get(carId) || 0;
      const heatGain = (brakeInput > 0.22 && speedKmh > 88)
        ? brakeInput * (speedKmh / 270) * 8.4
        : 0;
      const nextGlow = heatGain > 0
        ? Math.min(5.2, prevGlow + heatGain * sampleStepDt)
        : Math.max(0, prevGlow - 3.1 * sampleStepDt);
      this._recBrakeGlow.set(carId, nextGlow);

      const steerAngleRad = Number.isFinite(src.steerAngleRad)
        ? src.steerAngleRad
        : computeFallbackSteerAngleRad(steerInput, speedKmh);

      let dst = snapshot.cars[i];
      if (!dst) {
        dst = {};
        snapshot.cars[i] = dst;
      }

      dst.id = carId;
      dst.name = src.name || (src.isPlayer ? 'YOU (PHANATIC #1)' : `RIVAL #${i + 1}`);
      dst.short = src.short || (src.isPlayer ? 'YOU' : `P${i + 1}`);
      dst.carNum = finiteOr(src.carNum, i + 1);
      dst.isPlayer = !!src.isPlayer;
      dst.s = wrapTrackS(src.s);
      dst.lateralOffset = finiteOr(src.lateralOffset, 0);
      dst.relYaw = finiteOr(src.relYaw, 0);
      dst.speedKmh = speedKmh;
      dst.rpm = clamp(finiteOr(src.rpm, 0), 0, 15000);
      dst.gear = Math.max(1, Math.round(finiteOr(src.gear, 1)));
      dst.steerInput = steerInput;
      dst.steerAngleRad = steerAngleRad;
      dst.brakeInput = brakeInput;
      dst.throttleInput = throttleInput;
      dst.inSlipstream = inSlipstream;
      dst.drsActive = drsActive;
      dst.onCurb = !!src.onCurb;
      dst.skidIntensity = clamp(finiteOr(src.skidIntensity, 0), 0, 1);
      dst.exploded = !!src.exploded;
      dst.compound = src.compound || 'SOFT';
      dst.latG = finiteOr(src.latG, 0);
      dst.inPitLane = !!src.inPitLane;
      dst.pitJackLift = clamp(finiteOr(src.pitJackLift, 0), 0, 1);
      dst.revBlipTimer = Math.max(0, finiteOr(src.revBlipTimer, 0));
      dst.brakeGlow = nextGlow;
      dst.frontWingDmg = clamp(finiteOr(src.damage?.frontWing, 0), 0, 1);
      dst.rearWingDmg = clamp(finiteOr(src.damage?.rearWing, 0), 0, 1);
      dst.hasPuncture = !!src.damage?.hasPuncture;
      dst.lap = Math.max(1, Math.floor(finiteOr(src.lap, snapshot.currentLap)));
    }

    this.frames.push(snapshot);
    return true;
  }

  // --------------------------------------------------------------------------
  // 2. INTERACTIVE PLAYBACK TRANSPORT & BROADCAST DIRECTOR CONTROLS
  // --------------------------------------------------------------------------
  enterReplay(startFromEndSeconds = 12, camera = null) {
    if (this.frames.length === 0) return false;

    if (camera && camera.isPerspectiveCamera && this._savedCameraFov === null) {
      this._savedCameraFov = camera.fov;
    }

    const firstTime = this.frames[0].timeSec;
    const lastTime = this.frames[this.frames.length - 1].timeSec;

    // `startFromEndSeconds <= 0` (e.g. `enterReplay(0)`) starts at 0s for a Full Race Highlight;
    // positive values (e.g. default `12`) start `N` seconds before the latest recorded action.
    if (
      startFromEndSeconds === 0 ||
      startFromEndSeconds === null ||
      !Number.isFinite(startFromEndSeconds) ||
      startFromEndSeconds < 0
    ) {
      this.playheadSec = firstTime;
    } else {
      this.playheadSec = Math.max(firstTime, lastTime - startFromEndSeconds);
    }
    this._prevPlayheadSec = this.playheadSec;

    // Default focus to Player #1 if focusCarIndex is out of range
    const lastCars = this.frames[this.frames.length - 1].cars;
    if (this.focusCarIndex < 0 || this.focusCarIndex >= lastCars.length) {
      const pIdx = lastCars.findIndex((c) => c.isPlayer);
      this.focusCarIndex = pIdx >= 0 ? pIdx : 0;
    }

    this.isPlaying = true;
    this.paused = false;
    this._activeTrackCamIdx = -1;
    this._flybyFiredForCamId = -1;
    this._flybyBuffetTimer = 0;
    this._cameraJustCut = true;
    this._prevInterpGears.clear();
    this._appliedReplayCompounds.clear();

    return true;
  }

  exitReplay(camera) {
    this.isPlaying = false;
    this.paused = false;
    this._activeTrackCamIdx = -1;
    this._flybyFiredForCamId = -1;
    this._flybyBuffetTimer = 0;
    this._cameraJustCut = true;

    // Restore pre-replay visibility, tire compound colors & neutral aero/wing poses on rigs
    if (this._lastCarRigs) {
      for (const [carId, origState] of this._preReplayCompounds.entries()) {
        const rig = this._resolveRig(this._lastCarRigs, carId, -1);
        if (!rig) continue;
        const origHex = typeof origState === 'object' ? origState.compoundHex : origState;
        if (rig.root && typeof origState === 'object' && origState.visible !== undefined) {
          rig.root.visible = origState.visible;
        }
        if (rig.compoundMat && origHex !== undefined) {
          rig.compoundMat.color.setHex(origHex);
          if (rig.compoundMat.emissive) rig.compoundMat.emissive.setHex(origHex);
        }
        if (rig.parts?.drsFlap) {
          rig.parts.drsFlap.rotation.x = rig.parts.drsFlap.userData?.baseRotX || 0;
        }
        if (rig.parts?.fwEndL) {
          rig.parts.fwEndL.visible = true;
          rig.parts.fwEndL.rotation.z = rig.parts.fwEndL.userData?.baseRotZ || 0;
          rig.parts.fwEndL.rotation.x = rig.parts.fwEndL.userData?.baseRotX || 0;
        }
        if (rig.parts?.fwEndR) {
          rig.parts.fwEndR.visible = true;
          rig.parts.fwEndR.rotation.z = rig.parts.fwEndR.userData?.baseRotZ || 0;
          rig.parts.fwEndR.rotation.x = rig.parts.fwEndR.userData?.baseRotX || 0;
        }
        if (rig.parts?.rwMain) {
          rig.parts.rwMain.rotation.z = rig.parts.rwMain.userData?.baseRotZ || 0;
        }
      }
    }
    this._preReplayCompounds.clear();
    this._appliedReplayCompounds.clear();
    this._prevInterpGears.clear();

    // Restore standard race camera FOV cleanly
    const targetCam = camera && camera.isPerspectiveCamera ? camera : null;
    if (targetCam) {
      const defaultFov = this._savedCameraFov !== null
        ? this._savedCameraFov
        : (targetCam.aspect < 0.85 ? 70 : 60);
      targetCam.fov = defaultFov;
      targetCam.up.set(0, 1, 0);
      targetCam.updateProjectionMatrix();
    }
    this._savedCameraFov = null;
  }

  togglePause() {
    this.paused = !this.paused;
    return this.paused;
  }

  setPaused(paused) {
    this.paused = !!paused;
    return this.paused;
  }

  setSpeed(speed) {
    const val = Number(speed);
    if (!Number.isFinite(val) || val <= 0) {
      this.playbackSpeed = 1.0;
    } else {
      this.playbackSpeed = clamp(val, 0.1, 4.0);
    }
    return this.playbackSpeed;
  }

  cycleSpeed() {
    const idx = REPLAY_SPEED_OPTIONS.findIndex((s) => Math.abs(s - this.playbackSpeed) < 0.01);
    const nextIdx = idx >= 0 ? (idx + 1) % REPLAY_SPEED_OPTIONS.length : 0;
    this.playbackSpeed = REPLAY_SPEED_OPTIONS[nextIdx];
    return this.playbackSpeed;
  }

  seekNormalized(u01) {
    if (this.frames.length === 0) return 0;
    const u = clamp(finiteOr(u01, 0), 0, 1);
    const firstTime = this.frames[0].timeSec;
    const duration = this.getDurationSec();
    const nextTime = firstTime + u * duration;
    if (Math.abs(nextTime - this.playheadSec) > 1.8) {
      this._cameraJustCut = true;
      this._activeTrackCamIdx = -1;
    }
    this.playheadSec = nextTime;
    this._flybyFiredForCamId = -1;
    this._prevInterpGears.clear();
    return u;
  }

  stepRelativeSeconds(deltaSec) {
    if (this.frames.length === 0) return 0;
    const delta = finiteOr(deltaSec, 0);
    const firstTime = this.frames[0].timeSec;
    const lastTime = this.frames[this.frames.length - 1].timeSec;
    const nextTime = clamp(this.playheadSec + delta, firstTime, lastTime);
    if (Math.abs(nextTime - this.playheadSec) > 1.8) {
      this._cameraJustCut = true;
      this._activeTrackCamIdx = -1;
    }
    this.playheadSec = nextTime;
    this._flybyFiredForCamId = -1;
    this._prevInterpGears.clear();
    return this.playheadSec - firstTime;
  }

  setCameraMode(idx) {
    const count = REPLAY_CAMERA_MODES.length;
    const next = ((Math.floor(finiteOr(idx, 0)) % count) + count) % count;
    if (next !== this.cameraModeIdx) {
      this.cameraModeIdx = next;
      this._cameraJustCut = true;
      this._activeTrackCamIdx = -1;
      this._flybyFiredForCamId = -1;
      this._flybyBuffetTimer = 0;
    }
    return this.cameraModeIdx;
  }

  cycleCameraMode(step = 1) {
    return this.setCameraMode(this.cameraModeIdx + (Number.isFinite(step) ? step : 1));
  }

  setFocusCar(idx) {
    const count = this.frames.length > 0
      ? Math.max(1, this.frames[this.frames.length - 1].cars.length)
      : 1;
    const next = ((Math.floor(finiteOr(idx, 0)) % count) + count) % count;
    if (next !== this.focusCarIndex) {
      this.focusCarIndex = next;
      this._cameraJustCut = true;
      this._activeTrackCamIdx = -1;
      this._flybyFiredForCamId = -1;
      this._flybyBuffetTimer = 0;
    }
    return this.focusCarIndex;
  }

  cycleFocusCar(step = 1) {
    return this.setFocusCar(this.focusCarIndex + (Number.isFinite(step) ? step : 1));
  }

  // --------------------------------------------------------------------------
  // 3. SUB-FRAME SPLINE INTERPOLATION, RIG VFX SYNC & 6-ANGLE CAMERA DIRECTOR
  // --------------------------------------------------------------------------
  updatePlayback(rawDt, {
    track,
    camera,
    carRigs,
    moisture,
    elapsedSec = 0,
    callbacks,
  } = {}) {
    if (!this.isPlaying || this.frames.length === 0) {
      return {
        active: false,
        paused: this.paused,
        speed: this.playbackSpeed,
        currentTimeSec: 0,
        durationSec: this.getDurationSec(),
        progress01: 0,
        cameraModeIdx: this.cameraModeIdx,
        cameraLabel: this.getCameraLabel(),
        focusCarName: '',
        focusCarSpeedKmh: 0,
        focusCarGear: 1,
        focusCarRpm: 0,
        lap: 1,
      };
    }

    if (camera && camera.isPerspectiveCamera && this._savedCameraFov === null) {
      this._savedCameraFov = camera.fov;
    }
    if (carRigs) {
      this._lastCarRigs = carRigs;
    }

    const safeRawDt = Number.isFinite(rawDt) ? clamp(rawDt, 0.0005, 0.1) : (1 / 60);
    const firstTime = this.frames[0].timeSec;
    const lastTime = this.frames[this.frames.length - 1].timeSec;
    const durationSec = Math.max(0, lastTime - firstTime);

    let playheadDelta = 0;

    if (!this.paused && durationSec > 0) {
      const stepSec = safeRawDt * this.playbackSpeed;
      const nextPlayhead = this.playheadSec + stepSec;
      if (nextPlayhead > lastTime) {
        // Seamless broadcast highlight loop back to start when reaching end of buffer
        this.playheadSec = durationSec > 0.05
          ? firstTime + ((nextPlayhead - lastTime) % durationSec)
          : lastTime;
        this._cameraJustCut = true;
        this._activeTrackCamIdx = -1;
        this._flybyFiredForCamId = -1;
        this._prevInterpGears.clear();
      } else {
        this.playheadSec = nextPlayhead;
      }
      playheadDelta = stepSec;
    } else {
      this.playheadSec = clamp(this.playheadSec, firstTime, lastTime);
      playheadDelta = this.playheadSec - this._prevPlayheadSec;
    }

    this._prevPlayheadSec = this.playheadSec;

    // O(log N) binary search for bracketing frames f0 <= playheadSec <= f1
    const i0 = this._findFrameIndex(this.playheadSec);
    const i1 = Math.min(this.frames.length - 1, i0 + 1);
    const iPrev = Math.max(0, i0 - 1);
    const iNext = Math.min(this.frames.length - 1, i1 + 1);

    const fPrev = this.frames[iPrev];
    const f0 = this.frames[i0];
    const f1 = this.frames[i1];
    const fNext = this.frames[iNext];

    const spanSec = f1.timeSec - f0.timeSec;
    const alpha = spanSec > 1e-6 ? clamp((this.playheadSec - f0.timeSec) / spanSec, 0, 1) : 0;

    const effMoisture = Number.isFinite(moisture)
      ? clamp(moisture, 0, 1)
      : clamp(lerp(f0.weatherMoisture, f1.weatherMoisture, alpha), 0, 1);

    // Effective simulation delta for wheel spin & exhaust timers:
    // Scales accurately at 0.25x Super Slow-Motion, rolls during paused timeline scrubbing, and freezes in bullet-time pause
    const scrubAbsDt = Math.min(0.05, Math.abs(playheadDelta));
    const rigDt = !this.paused
      ? safeRawDt * this.playbackSpeed
      : (scrubAbsDt > 1e-5 ? scrubAbsDt : 0);

    // Visual timeline clock drives wet rooster-tail spray, titanium sparks & vortices in true slow-mo / bullet-time!
    const rigVisualClockSec = Number.isFinite(this.playheadSec) ? this.playheadSec : elapsedSec;

    // Interpolate all cars & synchronize every 3D FormulaCarRig
    const numCars = f0.cars.length;
    this._interpFramesScratch.length = numCars;

    for (let k = 0; k < numCars; k++) {
      const c0 = f0.cars[k];
      const c1 = this._matchCarInFrame(f1, c0.id, k) || c0;
      const cPrev = this._matchCarInFrame(fPrev, c0.id, k) || c0;
      const cNext = this._matchCarInFrame(fNext, c0.id, k) || c1;

      const interpCar = this._interpolateCarSpline(k, cPrev, c0, c1, cNext, alpha);

      const trackFrame = track ? track.sampleAt(interpCar.s, interpCar.lateralOffset) : null;
      this._interpFramesScratch[k] = trackFrame;

      const rig = this._resolveRig(carRigs, interpCar.id, k);
      if (rig && trackFrame) {
        // Preserve original visibility & compound color on first touch so exitReplay restores live session state
        if (!this._preReplayCompounds.has(interpCar.id)) {
          this._preReplayCompounds.set(interpCar.id, {
            compoundHex: rig.compoundMat ? rig.compoundMat.color.getHex() : undefined,
            visible: rig.root ? rig.root.visible : true,
          });
        }
        if (rig.root) {
          rig.root.visible = !interpCar.exploded;
        }
        if (this._appliedReplayCompounds.get(interpCar.id) !== interpCar.compound) {
          rig.setCompound?.(interpCar.compound);
          this._appliedReplayCompounds.set(interpCar.id, interpCar.compound);
        }

        // Sync pre-integrated brake rotor glow so scrubbing/pausing on heavy braking glows hot orange immediately
        if (rig.brakeGlow !== undefined) {
          rig.brakeGlow = interpCar.brakeGlow;
        }

        // Fire realistic upshift cut / downshift exhaust flame cones across gear changes during playback
        const prevGear = this._prevInterpGears.get(interpCar.id);
        if (!this.paused && prevGear !== undefined && prevGear !== interpCar.gear && !interpCar.exploded) {
          if (interpCar.gear > prevGear && interpCar.gear >= 3) {
            rig.triggerBackfire?.(0.095);
          } else if (interpCar.gear < prevGear && interpCar.speedKmh > 110) {
            rig.triggerBackfire?.(0.145);
          }
        }
        this._prevInterpGears.set(interpCar.id, interpCar.gear);

        // Reverse wheel spin direction smoothly if user scrubs backward while paused
        const preSpin = rig.wheelSpinAngle || 0;
        rig.updateTransformAndVFX(interpCar, trackFrame, effMoisture, rigDt, rigVisualClockSec);
        if (this.paused && playheadDelta < -1e-5 && rig.wheels) {
          const spinStep = (rig.wheelSpinAngle || 0) - preSpin;
          rig.wheelSpinAngle = preSpin - spinStep;
          for (const w of rig.wheels) {
            if (w.spinPivot) w.spinPivot.rotation.x = rig.wheelSpinAngle;
          }
        }

        // Keep chassis pitch/roll & DRS flap responsive even while paused on a single frame (rigDt === 0)
        if (rigDt === 0) {
          const settle = Math.min(1, safeRawDt * 14);
          if (rig.chassisTiltGroup) {
            const targetPitch =
              (interpCar.brakeInput || 0) * 0.025 -
              (interpCar.throttleInput || 0) * 0.013 +
              (interpCar.pitJackLift || 0) * 0.042;
            const targetRoll = -(interpCar.latG || 0) * 0.021;
            rig.chassisTiltGroup.rotation.x += (targetPitch - rig.chassisTiltGroup.rotation.x) * settle;
            rig.chassisTiltGroup.rotation.z += (targetRoll - rig.chassisTiltGroup.rotation.z) * settle;
          }
          if (rig.parts?.drsFlap) {
            const baseX = rig.parts.drsFlap.userData?.baseRotX || 0;
            const sign = rig._drsOpenSign !== undefined ? rig._drsOpenSign : 1;
            const steerMag = Math.abs(interpCar.steerInput || 0);
            const drsOpen =
              !interpCar.exploded &&
              (interpCar.brakeInput || 0) < 0.08 &&
              (interpCar.damage?.rearWing || 0) < 0.55 &&
              !!(
                interpCar.drsActive ||
                interpCar.inSlipstream ||
                ((interpCar.speedKmh || 0) > 235 && steerMag < 0.08)
              );
            const targetDrs = baseX + (drsOpen ? 0.32 * sign : 0.0);
            rig.parts.drsFlap.rotation.x += (targetDrs - rig.parts.drsFlap.rotation.x) * settle;
          }
        }
      }
    }

    // Resolve focused car & drive the 6-angle FOM Broadcast Camera Director
    const safeFocusIdx = numCars > 0
      ? (((this.focusCarIndex % numCars) + numCars) % numCars)
      : 0;
    this.focusCarIndex = safeFocusIdx;

    const focusCar = this._interpCarPool[safeFocusIdx];
    const focusFrame = this._interpFramesScratch[safeFocusIdx];

    if (track && camera && focusCar && focusFrame) {
      this._updateBroadcastCamera(safeRawDt, {
        track,
        camera,
        focusCar,
        focusFrame,
        numCars,
        callbacks,
      });
    }

    const currentTimeSec = clamp(this.playheadSec - firstTime, 0, durationSec);
    const progress01 = durationSec > 1e-6 ? clamp(currentTimeSec / durationSec, 0, 1) : 0;
    const frameLap = alpha < 0.5 ? f0.currentLap : f1.currentLap;

    return {
      active: this.isPlaying,
      paused: this.paused,
      speed: this.playbackSpeed,
      currentTimeSec,
      durationSec,
      progress01,
      cameraModeIdx: this.cameraModeIdx,
      cameraLabel: this.getCameraLabel(),
      focusCarIndex: safeFocusIdx,
      focusCarId: focusCar ? focusCar.id : '',
      focusCarName: focusCar ? focusCar.name : '',
      focusCarSpeedKmh: focusCar ? Math.round(focusCar.speedKmh) : 0,
      focusCarGear: focusCar ? focusCar.gear : 1,
      focusCarRpm: focusCar ? Math.round(focusCar.rpm) : 0,
      lap: focusCar ? (focusCar.lap || frameLap || 1) : (frameLap || 1),
      totalLaps: alpha < 0.5 ? f0.totalLaps : f1.totalLaps,
      focusWorldPos: focusFrame ? focusFrame.pos : null,
    };
  }

  // --------------------------------------------------------------------------
  // INTERNAL: BINARY SEARCH & C1 CUBIC CATMULL-ROM SPLINE INTERPOLATION
  // --------------------------------------------------------------------------
  _findFrameIndex(targetTimeSec) {
    const n = this.frames.length;
    if (n <= 1 || targetTimeSec <= this.frames[0].timeSec) return 0;
    if (targetTimeSec >= this.frames[n - 1].timeSec) return n - 2;

    let lo = 0;
    let hi = n - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.frames[mid].timeSec <= targetTimeSec) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  _matchCarInFrame(frame, carId, hintIdx) {
    if (!frame || !frame.cars || frame.cars.length === 0) return null;
    if (hintIdx < frame.cars.length && frame.cars[hintIdx].id === carId) {
      return frame.cars[hintIdx];
    }
    for (let i = 0; i < frame.cars.length; i++) {
      if (frame.cars[i].id === carId) return frame.cars[i];
    }
    return frame.cars[Math.min(hintIdx, frame.cars.length - 1)];
  }

  _resolveRig(carRigs, carId, index) {
    if (!carRigs) return null;
    if (carRigs instanceof Map) return carRigs.get(carId) || null;
    if (Array.isArray(carRigs)) return carRigs[index] || null;
    return carRigs[carId] || null;
  }

  _interpolateCarSpline(poolIdx, cPrev, c0, c1, cNext, alpha) {
    let out = this._interpCarPool[poolIdx];
    if (!out) {
      out = { damage: { frontWing: 0, rearWing: 0, hasPuncture: false } };
      this._interpCarPool[poolIdx] = out;
    }

    // Unwrap circular track coordinate `s` across the 0 / 1000 Start/Finish boundary!
    const ds01 = signedWrapDeltaS(c1.s - c0.s);
    const hasDiscontinuity =
      c0.exploded !== c1.exploded ||
      Math.abs(ds01) > 85.0 ||
      Math.abs(c1.lateralOffset - c0.lateralOffset) > 10.0;

    let interpS;
    let interpLat;
    let interpYaw;

    if (hasDiscontinuity) {
      interpS = wrapTrackS(c0.s + ds01 * alpha);
      interpLat = lerp(c0.lateralOffset, c1.lateralOffset, alpha);
      interpYaw = c0.relYaw + shortestAngleDelta(c0.relYaw, c1.relYaw) * alpha;
    } else {
      const u0 = c0.s;
      const uPrev = u0 + signedWrapDeltaS(cPrev.s - c0.s);
      const u1 = u0 + ds01;
      const uNext = u1 + signedWrapDeltaS(cNext.s - c1.s);

      interpS = wrapTrackS(catmullRom1D(uPrev, u0, u1, uNext, alpha));
      interpLat = catmullRom1D(
        cPrev.lateralOffset,
        c0.lateralOffset,
        c1.lateralOffset,
        cNext.lateralOffset,
        alpha
      );

      const y0 = c0.relYaw;
      const yPrev = y0 + shortestAngleDelta(y0, cPrev.relYaw);
      const y1 = y0 + shortestAngleDelta(y0, c1.relYaw);
      const yNext = y1 + shortestAngleDelta(y1, cNext.relYaw);
      interpYaw = catmullRom1D(yPrev, y0, y1, yNext, alpha);
    }

    const pick = alpha < 0.5 ? c0 : c1;

    out.id = c0.id;
    out.name = c0.name;
    out.short = c0.short;
    out.carNum = c0.carNum;
    out.isPlayer = c0.isPlayer;
    out.s = interpS;
    out.lateralOffset = interpLat;
    out.relYaw = interpYaw;
    out.speedKmh = Math.max(0, lerp(c0.speedKmh, c1.speedKmh, alpha));
    out.rpm = Math.max(0, lerp(c0.rpm, c1.rpm, alpha));
    out.gear = pick.gear;
    out.steerInput = clamp(lerp(c0.steerInput, c1.steerInput, alpha), -1, 1);
    out.steerAngleRad = lerp(c0.steerAngleRad, c1.steerAngleRad, alpha);
    out.brakeInput = clamp(lerp(c0.brakeInput, c1.brakeInput, alpha), 0, 1);
    out.throttleInput = clamp(lerp(c0.throttleInput, c1.throttleInput, alpha), 0, 1);
    out.inSlipstream = pick.inSlipstream;
    out.drsActive = pick.drsActive;
    out.onCurb = pick.onCurb;
    out.skidIntensity = clamp(lerp(c0.skidIntensity, c1.skidIntensity, alpha), 0, 1);
    out.exploded = pick.exploded;
    out.compound = pick.compound;
    out.latG = lerp(c0.latG || 0, c1.latG || 0, alpha);
    out.inPitLane = pick.inPitLane;
    out.pitJackLift = clamp(lerp(c0.pitJackLift || 0, c1.pitJackLift || 0, alpha), 0, 1);
    out.revBlipTimer = Math.max(0, lerp(c0.revBlipTimer || 0, c1.revBlipTimer || 0, alpha));
    out.brakeGlow = Math.max(0, lerp(c0.brakeGlow || 0, c1.brakeGlow || 0, alpha));
    out.lap = pick.lap;

    out.damage.frontWing = clamp(lerp(c0.frontWingDmg || 0, c1.frontWingDmg || 0, alpha), 0, 1);
    out.damage.rearWing = clamp(lerp(c0.rearWingDmg || 0, c1.rearWingDmg || 0, alpha), 0, 1);
    out.damage.hasPuncture = !!pick.hasPuncture;

    return out;
  }

  // --------------------------------------------------------------------------
  // INTERNAL: VIRTUAL FOM TRACKSIDE CAMERA PLACEMENT & 6-ANGLE DIRECTOR
  // --------------------------------------------------------------------------
  _ensureTrackCameras(track) {
    const trackKey = `${track.currentTrackId || 'DEFAULT'}_${track.samples?.length || 0}`;
    if (this._cachedTrackKey === trackKey && this._trackCams.length === NUM_TRACKSIDE_CAMERAS) {
      return;
    }
    this._cachedTrackKey = trackKey;
    this._trackCams.length = 0;
    this._activeTrackCamIdx = -1;
    this._flybyFiredForCamId = -1;

    const spacing = TRACK_GAME_LENGTH / NUM_TRACKSIDE_CAMERAS; // ~90.91 game-meters
    const baseLatMag = ROAD_HALF_WIDTH + 5.8;
    const tunnelRange = track.trackDef?.tunnelRangeS || null;
    const elevationPattern = [4.55, 2.48, 4.15, 2.75, 4.45, 2.90, 3.85, 2.60, 4.72, 3.35, 2.52];

    for (let i = 0; i < NUM_TRACKSIDE_CAMERAS; i++) {
      const s = wrapTrackS(28.0 + i * spacing);
      const centerFrame = track.sampleAt(s, 0);
      const inPitStraightCorridor = s >= 900 || s <= 126;
      const inTunnel = !!(tunnelRange && s >= tunnelRange[0] - 6 && s <= tunnelRange[1] + 6);

      let side;
      if (inTunnel) {
        // Seaward open colonnade side inside Monaco's Tunnel Louis II
        side = 1;
      } else if (inPitStraightCorridor) {
        // Opposite the Pit Building so garages, pit crew & start gantry shine in background!
        side = -1;
      } else if (Math.abs(centerFrame.curvature) > 0.08) {
        // Classic FOM outside-of-corner crane box framing apex kerbs & braking zones
        side = centerFrame.curvature > 0 ? -1 : 1;
      } else {
        side = i % 2 === 0 ? -1 : 1;
      }

      const lat = side * baseLatMag;
      const height = inTunnel ? 2.88 : elevationPattern[i % elevationPattern.length];
      const camFrame = track.sampleAt(s, lat);
      const worldPos = camFrame.pos.clone().addScaledVector(UP_AXIS, height);

      this._trackCams.push({
        id: i,
        s,
        side,
        lat,
        height,
        pos: worldPos,
      });
    }
  }

  _selectActiveTracksideCamera(carS) {
    const cams = this._trackCams;
    const n = cams.length;
    if (n === 0) return null;

    // Hold current trackside camera smoothly from approach (+68m) through closest pass (0m) to exit (-28m)
    if (this._activeTrackCamIdx >= 0 && this._activeTrackCamIdx < n && !this._cameraJustCut) {
      const cur = cams[this._activeTrackCamIdx];
      const curDelta = signedWrapDeltaS(cur.s - carS);
      if (curDelta >= -28.0 && curDelta <= 68.0) {
        return { cam: cur, switched: false };
      }
    }

    // Cut to the nearest upcoming camera ahead of the focused car so it charges toward the lens!
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < n; i++) {
      const d = signedWrapDeltaS(cams[i].s - carS);
      // Prefer upcoming cameras in [+6m .. +98m]; fallback cleanly if needed
      const score = d >= -6.0 ? d : (d + TRACK_GAME_LENGTH);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const switched = bestIdx !== this._activeTrackCamIdx;
    this._activeTrackCamIdx = bestIdx;
    if (switched) {
      this._flybyFiredForCamId = -1;
      this._flybyBuffetTimer = 0;
    }
    return { cam: cams[bestIdx], switched: switched || this._cameraJustCut };
  }

  _computeCarBasis(focusCar, focusFrame) {
    const yaw = finiteOr(focusCar.relYaw, 0);
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    this._carFwd
      .copy(focusFrame.tangent)
      .multiplyScalar(cosY)
      .addScaledVector(focusFrame.right, sinY)
      .normalize();
    this._carRight.crossVectors(this._carFwd, focusFrame.normal).normalize();
    this._carUp.crossVectors(this._carRight, this._carFwd).normalize();
  }

  _updateBroadcastCamera(rawDt, { track, camera, focusCar, focusFrame, numCars, callbacks }) {
    this._computeCarBasis(focusCar, focusFrame);
    const carPos = focusFrame.pos;
    const isPortrait = (camera.aspect || 1.5) < 0.85;
    const speedNorm = clamp((focusCar.speedKmh || 0) / 320.0, 0, 1.08);
    const mode = this.cameraModeIdx;

    camera.up.set(0, 1, 0);

    // ------------------------------------------------------------------------
    // MODE 0: FOM TRACKSIDE TV CAM (Dynamic Telephoto 26°..52°..58° + Doppler Fly-By!)
    // ------------------------------------------------------------------------
    if (mode === 0) {
      this._ensureTrackCameras(track);
      const sel = this._selectActiveTracksideCamera(focusCar.s);
      if (sel && sel.cam) {
        const activeCam = sel.cam;
        const deltaS = signedWrapDeltaS(activeCam.s - focusCar.s);
        const absDeltaS = Math.abs(deltaS);

        // Reset fly-by trigger if car was scrubbed well away from this camera station
        if (this._flybyFiredForCamId === activeCam.id && absDeltaS > 18.0) {
          this._flybyFiredForCamId = -1;
        }

        // Fire screaming Doppler F1 fly-by audio callback strictly ONCE at closest pass (|deltaS| < 6m)!
        if (
          !this.paused &&
          absDeltaS < 6.0 &&
          this._flybyFiredForCamId !== activeCam.id &&
          focusCar.speedKmh > 35 &&
          !focusCar.exploded
        ) {
          this._flybyFiredForCamId = activeCam.id;
          this._flybyBuffetTimer = 0.24;
          this._flybyBuffetStrength = clamp(focusCar.speedKmh / 315, 0.2, 1.0) * 0.032;
          callbacks?.onFlyby?.(focusCar.speedKmh);
        }

        this._camDesiredPos.copy(activeCam.pos);

        // Subtle high-speed aerodynamic pressure shudder on the lens right at closest pass
        if (!this.paused && this._flybyBuffetTimer > 0) {
          this._flybyBuffetTimer = Math.max(0, this._flybyBuffetTimer - rawDt);
          const env = (this._flybyBuffetTimer / 0.24) * this._flybyBuffetStrength;
          this._camDesiredPos.y += Math.sin(this._flybyBuffetTimer * 135.0) * env;
          this._camDesiredPos.x += Math.cos(this._flybyBuffetTimer * 108.0) * env * 0.6;
        }

        // Lead the car's nose slightly like a veteran FOM broadcast cameraman
        this._camDesiredLook
          .copy(carPos)
          .addScaledVector(this._carUp, 0.68)
          .addScaledVector(this._carFwd, 1.35);

        // Dynamic Telephoto Box-Lens Zoom:
        // Widens to 58° right at closest approach (~11-18m), 52° at mid-range (~52m),
        // and narrows smoothly from 52° down to 26° at distance (~220m+)!
        const distWorldM = activeCam.pos.distanceTo(carPos);
        let targetFov;
        if (distWorldM <= 52.0) {
          const uNear = smoothstep01((distWorldM - 16.5) / (52.0 - 16.5));
          targetFov = lerp(58.0, 52.0, uNear);
        } else {
          const uFar = smoothstep01((distWorldM - 52.0) / (215.0 - 52.0));
          targetFov = lerp(52.0, 26.0, uFar);
        }

        camera.position.copy(this._camDesiredPos);

        if (sel.switched) {
          this._camSmoothedLook.copy(this._camDesiredLook);
          this._currentFov = targetFov;
        } else {
          // Faster whip-pan tracking near closest pass so the car stays framed cleanly
          const panSpeed = distWorldM < 30.0 ? 26.0 : 14.5;
          const panAlpha = 1.0 - Math.exp(-rawDt * panSpeed);
          const zoomAlpha = 1.0 - Math.exp(-rawDt * 9.5);
          this._camSmoothedLook.lerp(this._camDesiredLook, panAlpha);
          this._currentFov = lerp(this._currentFov, targetFov, zoomAlpha);
        }

        camera.lookAt(this._camSmoothedLook);
        this._applyCameraFov(camera, this._currentFov);
        this._cameraJustCut = false;
        return;
      }
    }

    // ------------------------------------------------------------------------
    // MODE 1: HELICOPTER AERIAL PURSUIT (24m above & 22m behind/beside pack!)
    // ------------------------------------------------------------------------
    if (mode === 1) {
      const heliRate = this.paused ? 0.16 : Math.max(0.28, 0.36 * Math.min(1.4, this.playbackSpeed));
      this._heliPhase = (this._heliPhase + rawDt * heliRate) % (Math.PI * 2);

      const tunnelRange = track.trackDef?.tunnelRangeS || null;
      const nearTunnel = !!(tunnelRange && focusCar.s >= tunnelRange[0] - 18 && focusCar.s <= tunnelRange[1] + 18);

      const backDist = 22.0;
      const sideDist = nearTunnel
        ? 19.5 // Bias seaward over Port Hercule superyachts along Monaco's colonnade!
        : Math.sin(this._heliPhase) * 15.5 + 4.5 * Math.cos(this._heliPhase * 0.5);
      const upHeight = 24.0 + Math.cos(this._heliPhase * 0.8) * 1.6;

      this._camDesiredPos
        .copy(carPos)
        .addScaledVector(focusFrame.tangent, -backDist)
        .addScaledVector(focusFrame.right, sideDist)
        .addScaledVector(UP_AXIS, upHeight);

      // Blend 22% toward nearest close rival battle (< 32 game-meters) so wheel-to-wheel packs stay framed!
      this._packBattleOffset.set(0, 0, 0);
      let battleWeight = 0;
      for (let i = 0; i < numCars; i++) {
        if (i === this.focusCarIndex) continue;
        const otherCar = this._interpCarPool[i];
        const otherFrame = this._interpFramesScratch[i];
        if (!otherCar || !otherFrame || otherCar.exploded) continue;
        const dS = Math.abs(signedWrapDeltaS(otherCar.s - focusCar.s));
        if (dS < 24.0) {
          const w = (1.0 - dS / 24.0) * 0.24;
          if (w > battleWeight) {
            battleWeight = w;
            this._packBattleOffset.subVectors(otherFrame.pos, carPos).multiplyScalar(w);
          }
        }
      }

      this._camDesiredLook
        .copy(carPos)
        .add(this._packBattleOffset)
        .addScaledVector(focusFrame.tangent, 11.5)
        .addScaledVector(UP_AXIS, 1.15);

      const targetFov = isPortrait ? 54.0 : 46.0;
      if (this._cameraJustCut) {
        this._camSmoothedPos.copy(this._camDesiredPos);
        this._camSmoothedLook.copy(this._camDesiredLook);
        this._currentFov = targetFov;
      } else {
        const posAlpha = 1.0 - Math.exp(-rawDt * 5.8);
        const lookAlpha = 1.0 - Math.exp(-rawDt * 8.2);
        this._camSmoothedPos.lerp(this._camDesiredPos, posAlpha);
        this._camSmoothedLook.lerp(this._camDesiredLook, lookAlpha);
        this._currentFov = lerp(this._currentFov, targetFov, posAlpha);
      }

      camera.position.copy(this._camSmoothedPos);
      camera.lookAt(this._camSmoothedLook);
      this._applyCameraFov(camera, this._currentFov);
      this._cameraJustCut = false;
      return;
    }

    // ------------------------------------------------------------------------
    // MODE 2: ONBOARD HALO T-CAM (FOM roll-hoop pod above helmet, halo & nose!)
    // ------------------------------------------------------------------------
    if (mode === 2) {
      const curbVib = (!this.paused && focusCar.onCurb && focusCar.speedKmh > 45)
        ? Math.sin(this.playheadSec * 92.0) * 0.011
        : 0;
      const brakeDive = (focusCar.brakeInput || 0) * 0.018 - (focusCar.throttleInput || 0) * 0.009;

      // Mounted at roll-hoop T-Cam (y=1.05m, 0.08m aft) — 0.42m+ clear of helmet & halo (near=0.35m)
      this._camDesiredPos
        .copy(carPos)
        .addScaledVector(this._carFwd, -0.08)
        .addScaledVector(this._carUp, 1.05 + curbVib);

      this._camDesiredLook
        .copy(carPos)
        .addScaledVector(this._carFwd, 28.0)
        .addScaledVector(this._carRight, (focusCar.steerInput || 0) * 1.95)
        .addScaledVector(this._carUp, 0.56 - brakeDive * 14.0);

      const targetFov = (isPortrait ? 67.0 : 60.0) + speedNorm * 6.5;
      this._currentFov = this._cameraJustCut ? targetFov : lerp(this._currentFov, targetFov, Math.min(1, rawDt * 10));

      camera.position.copy(this._camDesiredPos);
      camera.lookAt(this._camDesiredLook);
      this._applyCameraFov(camera, this._currentFov);
      this._cameraJustCut = false;
      return;
    }

    // ------------------------------------------------------------------------
    // MODE 3: NOSE WING KERB CAM (Razor-low 0.38m front-wing kerb-skimming cam!)
    // ------------------------------------------------------------------------
    if (mode === 3) {
      const kerbBuzz = (!this.paused && focusCar.onCurb && focusCar.speedKmh > 40)
        ? Math.sin(this.playheadSec * 115.0) * 0.013
        : 0;

      // 0.38m above tarmac & 1.72m forward on nose — frames front wing cascade & endplates cleanly (>0.48m > near=0.35m)
      this._camDesiredPos
        .copy(carPos)
        .addScaledVector(this._carFwd, 1.72)
        .addScaledVector(this._carUp, 0.38 + kerbBuzz);

      this._camDesiredLook
        .copy(carPos)
        .addScaledVector(this._carFwd, 34.0)
        .addScaledVector(this._carRight, (focusCar.steerInput || 0) * 1.65)
        .addScaledVector(this._carUp, 0.36);

      const targetFov = (isPortrait ? 71.0 : 65.0) + speedNorm * 9.0;
      this._currentFov = this._cameraJustCut ? targetFov : lerp(this._currentFov, targetFov, Math.min(1, rawDt * 10));

      camera.position.copy(this._camDesiredPos);
      camera.lookAt(this._camDesiredLook);
      this._applyCameraFov(camera, this._currentFov);
      this._cameraJustCut = false;
      return;
    }

    // ------------------------------------------------------------------------
    // MODE 4: REAR WING EXHAUST LOOKBACK (Over rear wing, rain-light & exhaust!)
    // ------------------------------------------------------------------------
    if (mode === 4) {
      const rpmVib = (!this.paused && focusCar.rpm > 10500)
        ? Math.sin(this.playheadSec * 140.0) * 0.005
        : 0;

      // Aft roll-hoop mount (-0.62m, y=1.16m) looking backward (-carFwd) over Rear Wing (y=0.90m),
      // framing spinning rear slicks, glowing brake discs, exhaust backfire flames & ruby FIA rain-light!
      this._camDesiredPos
        .copy(carPos)
        .addScaledVector(this._carFwd, -0.62)
        .addScaledVector(this._carUp, 1.16 + rpmVib);

      this._camDesiredLook
        .copy(carPos)
        .addScaledVector(this._carFwd, -26.0)
        .addScaledVector(this._carUp, 0.58);

      const targetFov = isPortrait ? 69.0 : 63.0;
      this._currentFov = this._cameraJustCut ? targetFov : lerp(this._currentFov, targetFov, Math.min(1, rawDt * 10));

      camera.position.copy(this._camDesiredPos);
      camera.lookAt(this._camDesiredLook);
      this._applyCameraFov(camera, this._currentFov);
      this._cameraJustCut = false;
      return;
    }

    // ------------------------------------------------------------------------
    // MODE 5: CINEMATIC HERO ORBIT (Slow-mo & bullet-time 360° low-angle beauty!)
    // ------------------------------------------------------------------------
    this._orbitAngle = (this._orbitAngle + rawDt * 0.52) % (Math.PI * 2);
    const carWorldYaw = Math.atan2(this._carFwd.z, this._carFwd.x);
    const worldAng = carWorldYaw + this._orbitAngle;
    const radius = isPortrait ? 6.5 : 5.35;
    const height = 1.16 + 0.52 * (0.5 + 0.5 * Math.sin(this._orbitAngle * 1.25));

    this._camDesiredPos.set(
      carPos.x + Math.cos(worldAng) * radius,
      carPos.y + height,
      carPos.z + Math.sin(worldAng) * radius
    );

    this._camDesiredLook
      .copy(carPos)
      .addScaledVector(this._carUp, 0.56);

    const targetFov = isPortrait ? 55.0 : 46.0;
    if (this._cameraJustCut) {
      this._camSmoothedPos.copy(this._camDesiredPos);
      this._camSmoothedLook.copy(this._camDesiredLook);
      this._currentFov = targetFov;
    } else {
      const orbitLerp = 1.0 - Math.exp(-rawDt * 11.0);
      this._camSmoothedPos.lerp(this._camDesiredPos, orbitLerp);
      this._camSmoothedLook.lerp(this._camDesiredLook, orbitLerp);
      this._currentFov = lerp(this._currentFov, targetFov, orbitLerp);
    }

    camera.position.copy(this._camSmoothedPos);
    camera.lookAt(this._camSmoothedLook);
    this._applyCameraFov(camera, this._currentFov);
    this._cameraJustCut = false;
  }

  _applyCameraFov(camera, desiredFov) {
    const clampedFov = clamp(desiredFov, 20.0, 92.0);
    if (Math.abs(camera.fov - clampedFov) > 0.02) {
      camera.fov = clampedFov;
      camera.updateProjectionMatrix();
    }
  }
}
