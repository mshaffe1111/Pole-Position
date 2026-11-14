// ============================================================================
// POLE POSITION 2026 — GRAND PRIX MOTORSPORT SIM
// Direct MSAA ACES-Filmic PBR Engine, 240Hz Interpolated Pose Pipeline,
// 5 Locked-FOV Sim Cameras, 3-Zone GT7/F1 Menu & Career R&D Integrator
// ============================================================================

import * as THREE from 'three';

import {
  PHYSICS_DT,
  TRACK_GAME_LENGTH,
  TRACK_CATALOG,
  GAME_STATES,
  QUALIFYING_RANK_A_TABLE,
  CLASSIC_1982_RULES,
  PRO_2026_LENGTHS,
  AI_DRIVER_ROSTER,
  WEATHER_REGIMES,
  PIT_LANE_CONFIG,
} from './config.js?v=20261114sim';
import { FujiTrack } from './track.js?v=20261114sim';
import * as ModelsModule from './models.js?v=20261114sim';
import { AssetLibrary, FormulaCarRig, PitCrewDiorama, EffectsManager } from './models.js?v=20261114sim';
import { WeatherSystem } from './weather.js?v=20261114sim';
import { createVehicleState, stepVehiclePhysics240Hz, shiftGear } from './physics.js?v=20261114sim';
import { RaceSystemsController } from './pit_damage_caution.js?v=20261114sim';
import { SpatialAIController } from './ai.js?v=20261114sim';
import { ProceduralAudioEngine } from './audio.js?v=20261114sim';
import { ErgonomicControls } from './controls.js?v=20261114sim';
import { TelemetryHUD, formatLapTimeArcade, formatLapTimeSim, ordinalSuffix } from './hud.js?v=20261114sim';
import { Retro1982Renderer } from './retro1982.js?v=20261114sim';
import { ReplayDirector } from './replay.js?v=20261114sim';
import {
  CareerManager,
  TEAM_CATALOG,
  CHAMPIONSHIP_CALENDAR,
  CAR_SETUP_OPTIONS,
  formatCredits,
} from './career.js?v=20261114sim';

const LIVE_CAMERA_LABELS = [
  '01 • CHASE CAM',
  '02 • FOM HALO T-CAM',
  '03 • COCKPIT HELMET CAM',
  '04 • BONNET CAM',
  '05 • NOSE WING CAM',
];

const PREFS_STORAGE_KEY = 'rp_f1_prefs_v3';

function normalizeAssistMode(mode, fallback = 'MIN') {
  const m = String(mode || '').toUpperCase();
  if (m === 'OFF') return 'OFF';
  if (m === 'MIN' || m === 'LOW') return 'MIN';
  if (m === 'FULL' || m === 'MEDIUM' || m === 'MED' || m === 'HIGH') return 'FULL';
  return fallback;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function compactCredits(amount) {
  const n = Math.max(0, Math.round(Number(amount) || 0));
  if (n >= 1000000) return `$${(n / 1000000).toFixed(n >= 10000000 ? 0 : 1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

class PolePosition2026Game {
  constructor() {
    this.config = {
      trackId: 'FUJI_1982',          // 'FUJI_1982' | 'MONACO_HARBOR' | 'SUZUKA_130R' | 'MONZA_TEMPLE' | 'SILVERSTONE_GP' | 'VEGAS_NEON'
      mode: '2026_UPDATED',          // '1982_ORIGINAL' | '2026_UPDATED'
      gearboxMode: 'AUTO_8SPD',      // 'AUTO_8SPD' | 'MANUAL_8SPD' | 'CLASSIC_2SPD'
      steeringStyle: 'WHEEL',        // 'WHEEL' | 'BUTTONS' | 'TILT'
      handedness: 'RIGHT_HANDED',    // 'RIGHT_HANDED' | 'LEFT_HANDED'
      classicLaps: 4,                // 3 | 4 | 5
      raceLengthId: 'SHORT',         // 'SHORT' (5) | 'MEDIUM' (12) | 'LONG' (25)
      runQualifying2026: false,      // Standing Grid P5 by default in 2026 Sim; 1982 runs Quali
      startingCompound: 'SOFT',
      gridSize: 8,                   // 8 | 16
      weatherPreset: 'RANDOM',       // 'RANDOM' | fixed WEATHER_REGIMES key
      visualStyle: '2026_PBR',       // '2026_PBR' | '1982_ARCADE'
      aiDifficulty: 'PRO',           // 'ROOKIE' | 'PRO' | 'LEGEND'
    };

    this.state = GAME_STATES.PRE_RACE_MENU;
    this.cameraModeIdx = 0; // 0: Chase, 1: Halo T-Cam, 2: Cockpit Helmet, 3: Bonnet Cam, 4: Nose Wing Cam
    this.cameraIndex = 0;
    this.lockedRaceWeatherId = 'HOT_SUNNY';
    this._settingsTab = 'CONTROLS';
    this._orbitHintTimer = null;

    // Interactive Showroom Hero Orbit state (~32° diagonal down pit straight toward Gantry & Grandstands)
    this._showroomOrbitAngle = Math.PI - 0.56;
    this.showroomYawOffset = this._showroomOrbitAngle;
    this.showroomPitchOffset = 0.0;
    this._userDraggedShowroom = false;
    this._orbitDragPointer = null;
    this._orbitLastX = 0;
    this._orbitLastY = 0;

    // Scoring & Timers
    this.score = 0;
    this.topScore = Number(localStorage.getItem('rp_f1_top_score') || 25000);
    this.qualifyingBonus = 0;
    this.qualifyingTime = null;
    this.qualifiedGridSlot = 1;
    this.passingBonus = 0;
    this.overtakesCount = 0;
    this.timeBonus = 0;
    this.distanceScoredMeters = 0;

    this.masterTimerSec = 90.0;
    this.sessionElapsedSec = 0.0;
    this.countdownTimer = 0.0;
    this.lastBeepSecond = -1;
    this._prevLightsLit = 0;
    this.controlsLocked = true;

    this.playerCar = null;
    this.allCars = [];
    this.carRigs = new Map();

    this.physicsAccumulator = 0.0;
    this.elapsedSec = 0.0;
    this.lastFrameMs = performance.now();

    this._camPos = new THREE.Vector3(0, 4, -10);
    this._camLook = new THREE.Vector3(0, 1.0, 0);
    this._camCarFwd = new THREE.Vector3(0, 0, 1);
    this._camCarRight = new THREE.Vector3(1, 0, 0);
    this._camCarUp = new THREE.Vector3(0, 1, 0);
    this._camChaseFwd = new THREE.Vector3(0, 0, 1);
    this._camChaseRight = new THREE.Vector3(1, 0, 0);
    this._camWorldUp = new THREE.Vector3(0, 1, 0);
    this._camDesiredPos = new THREE.Vector3();
    this._camDesiredLook = new THREE.Vector3();
    this._camLongG = 0;
    this._camLatG = 0;
    this._camPrevSpeedKmh = 0;
    this._camChaseYaw = 0;
    this._poseScratch = { s: 0, lat: 0, relYaw: 0, pitch: 0, roll: 0, heave: 0 };
    this._camPoseScratch = { s: 0, lat: 0, relYaw: 0, pitch: 0, roll: 0, heave: 0 };
    this._speedVignetteEl = null;

    // Pause, Instant Replay, Career, Macro Sector Splits & Living Stadium Crowd state
    this.paused = false;
    this._replayFromPodium = false;
    this._replayScrubbing = false;
    this._careerRoundActive = false;
    this._lastCareerResult = null;
    this._careerTab = 'TEAMS';
    this._lastCrowdCheerSec = -10;
    this.crowdExcitement = 0.28;
    this._prevMacroSectorIdx = 0;
    this._macroSectorStartSec = 0;
    this._pitWheelGunSoundAccum = 0;
    this._pitJackDropPlayed = false;
    this._pitCrewTeamRig = null;
    this._lastDrsCrowdBlastSec = -10;

    // Persisted player preferences (speed unit, kinematic assists, linearity, mixer)
    this.prefs = {
      speedUnit: 'KMH',
      aiDifficulty: 'PRO',
      assistUserSet: false,
      control: {
        sensitivity: 1.0,
        steeringLinearity: 0.0,
        controlScale: 1.0,
        controlOpacity: 0.88,
        brakingAssist: 'MIN',
        autoThrottle: false,
        haptics: true,
      },
      mixer: null,
    };
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          if (saved.speedUnit === 'MPH' || saved.speedUnit === 'KMH') this.prefs.speedUnit = saved.speedUnit;
          if (['ROOKIE', 'PRO', 'LEGEND'].includes(saved.aiDifficulty)) {
            this.prefs.aiDifficulty = saved.aiDifficulty;
            this.config.aiDifficulty = saved.aiDifficulty;
          }
          if (saved.control && typeof saved === 'object') {
            Object.assign(this.prefs.control, saved.control);
            if (saved.assistMigratedV4) {
              this.prefs.control.brakingAssist = normalizeAssistMode(saved.control.brakingAssist, 'MIN');
              this.prefs.assistUserSet = !!saved.assistUserSet;
            } else {
              // Migrate legacy v3 assist modes; default uncustomized legacy 'OFF' to physics 'MIN' safety net
              const rawAssist = String(saved.control.brakingAssist || '').toUpperCase();
              if (rawAssist === 'LOW') {
                this.prefs.control.brakingAssist = 'MIN';
                this.prefs.assistUserSet = true;
              } else if (rawAssist === 'MEDIUM' || rawAssist === 'HIGH') {
                this.prefs.control.brakingAssist = 'FULL';
                this.prefs.assistUserSet = true;
              } else {
                this.prefs.control.brakingAssist = 'MIN';
              }
            }
          }
          if (saved.mixer && typeof saved.mixer === 'object') this.prefs.mixer = saved.mixer;
          const touchDevice = typeof window !== 'undefined' && !!window.matchMedia &&
            window.matchMedia('(pointer: coarse)').matches && 'DeviceOrientationEvent' in window;
          if (saved.steeringUserSet === true) {
            if (saved.steeringStyle === 'BUTTONS' || saved.steeringStyle === 'WHEEL') {
              this.config.steeringStyle = saved.steeringStyle;
              this._steeringUserSet = true;
            } else if (saved.steeringStyle === 'TILT' && touchDevice) {
              this.config.steeringStyle = 'TILT';
              this._steeringUserSet = true;
            }
          }
        }
      }
    } catch (_) {}
  }

  _savePrefs() {
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
        speedUnit: this.prefs.speedUnit,
        aiDifficulty: this.config.aiDifficulty || 'PRO',
        assistMigratedV4: true,
        assistUserSet: !!this.prefs.assistUserSet,
        control: this.prefs.control,
        mixer: this.prefs.mixer,
        steeringStyle: this._steeringUserSet ? this.config.steeringStyle : 'WHEEL',
        steeringUserSet: !!this._steeringUserSet,
      }));
    } catch (_) {}
  }

  async init() {
    this._speedVignetteEl = document.getElementById('speed-vignette');
    if (this._speedVignetteEl) {
      this._speedVignetteEl.style.display = 'none';
      this._speedVignetteEl.style.opacity = '0';
    }
    this._setupRendererAndPostProcessing();

    this.assets = new AssetLibrary();
    await this.assets.loadAll();

    this.track = new FujiTrack(this.scene, this.assets);
    this.effects = new EffectsManager(this.scene, this.track);
    this.weather = new WeatherSystem(this.scene, this.renderer);
    this.raceSystems = new RaceSystemsController(this.track, this.effects);
    this.aiController = new SpatialAIController(this.track, this.weather, this.raceSystems);
    this.pitCrewDiorama = new PitCrewDiorama(this.scene, this.assets, this.track);
    this._initOrSyncPitCrewTeamRig(0xe41c24);
    this.audio = new ProceduralAudioEngine();

    // Career R&D, 1:1 1982 Namco renderer & 60Hz TV replay director
    this.career = new CareerManager();
    this.retro1982 = new Retro1982Renderer(document.getElementById('webgl-container'));
    this.retro1982.setVisible(false);
    this.replay = new ReplayDirector();
    this._syncViewportMetrics();

    this.hud = new TelemetryHUD(this.track, this.raceSystems, {
      onClutchButton: () => this._handleClutchTap(),
      onRequestBox: () => this._toggleBoxThisLap(),
    });
    this.hud.setSpeedUnit(this.prefs.speedUnit);

    this.controls = new ErgonomicControls({
      onUserInteract: () => this._unlockAndSyncAudioButton(),
      onShift: (dir) => {
        if (this.playerCar && !this.controlsLocked && !this.paused && !this.replay.isPlaying) {
          shiftGear(this.playerCar, dir, {
            onGearShift: (car, nextGear, shiftDir) => this._onPlayerGearShift(car, nextGear, shiftDir),
            onOverRev: () => this.hud.showCenterCallout('DOWNSHIFT PROTECTION', 900, '#f87171'),
            onBackfire: () => {
              this.audio.playBackfirePop();
            },
          });
          this.controls.setGearboxUI(this._activeGearboxMode(), this.playerCar.gear);
        }
      },
      onClutchTap: () => this._handleClutchTap(),
      onToggleVisualStyle: () => this.toggleVisualStyle(),
      onCycleCamera: (dir) => this._cycleLiveCamera(dir),
      onVisorTearOff: () => this._onVisorTearOff(),
      onTogglePitDrawer: () => {
        if (this.config.mode === '2026_UPDATED') this.hud.togglePitDrawer();
      },
      onToggleReplay: () => {
        if (this.replay.isPlaying) this._exitReplay();
        else this._enterReplay(this.state === GAME_STATES.RACE_RESULTS);
      },
      onRequestBox: () => this._toggleBoxThisLap(),
      onPauseMenu: () => {
        if (document.getElementById('garage-backdrop')?.classList.contains('open')) return;
        if (document.getElementById('career-backdrop')?.classList.contains('open')) return;
        if (this.replay.isPlaying) {
          this._exitReplay();
          return;
        }
        if (this.state === GAME_STATES.PRE_RACE_MENU || this.state === GAME_STATES.RACE_RESULTS) return;
        this._setPaused(!this.paused);
      },
      onTiltFallback: (msg) => {
        if (this.hud) this.hud.showEngineerRadio(msg || 'No gyro detected — drag or keys steer instead.');
      },
      onTiltCalibrated: (deg) => {
        if (this.hud) {
          const d = Number.isFinite(deg) ? deg.toFixed(1) : '0.0';
          this.hud.showCenterCallout(`TILT NEUTRAL SET (${d}°)`, 1200, '#00d2be');
        }
      },
    });

    this._applyPersistedSettings();
    this._bindShowroomMenuAndModals();
    this._bindCareerHub();
    this._bindPauseAndReplayUI();
    this._applyVisualShaderStyle();
    this.controls.setSteeringStyle(this.config.steeringStyle);
    this.controls.setHandedness(this.config.handedness);
    this._spawnShowroomScene();
    this._renderCareerHub();

    const loadingEl = document.getElementById('boot-loading');
    if (loadingEl) loadingEl.style.display = 'none';

    requestAnimationFrame((ts) => this._frameLoop(ts));
  }

  _getViewportSize() {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const w = Math.max(1, Math.round((vv && vv.width) || window.innerWidth || 1));
    const h = Math.max(1, Math.round((vv && vv.height) || window.innerHeight || 1));
    return { w, h };
  }

  _syncViewportMetrics() {
    const { w, h } = this._getViewportSize();
    const rootStyle = document.documentElement?.style;
    if (rootStyle) {
      rootStyle.setProperty('--app-w', `${w}px`);
      rootStyle.setProperty('--app-h', `${h}px`);
    }
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    const aspect = w / h;
    if (this.camera) {
      this.camera.aspect = aspect;
      if (!this.replay?.isPlaying && this.state === GAME_STATES.PRE_RACE_MENU) {
        this.camera.fov = aspect < 0.58 ? 76 : (aspect < 0.85 ? 64 : 47);
      }
      this.camera.updateProjectionMatrix();
    }
    if (this.renderer) {
      this.renderer.setPixelRatio(nextDpr);
      this.renderer.setSize(w, h);
    }
    if (this.retro1982) {
      this.retro1982.resize(w, h);
    }
  }

  _setupRendererAndPostProcessing() {
    const container = document.getElementById('webgl-container');
    const { w: initW, h: initH } = this._getViewportSize();
    // Direct crisp WebGL2 MSAA PBR pipeline (zero post-processing bloom haze)
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(initW, initH);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x88b8eb, 0.00042);

    const aspect = initW / initH;
    this.camera = new THREE.PerspectiveCamera(
      aspect < 0.58 ? 76 : (aspect < 0.85 ? 68 : 56),
      aspect,
      0.32,
      7200
    );

    this.composer = null;
    this.renderPass = null;
    this.bloomPass = null;
    this.outputPass = null;

    this._syncViewportMetrics();

    const onVpChange = () => this._syncViewportMetrics();
    window.addEventListener('resize', onVpChange, { passive: true });
    window.addEventListener('orientationchange', () => {
      onVpChange();
      setTimeout(onVpChange, 120);
      setTimeout(onVpChange, 320);
    }, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onVpChange, { passive: true });
      window.visualViewport.addEventListener('scroll', onVpChange, { passive: true });
    }
  }

  _activeTotalLaps() {
    if (this.config.mode === '1982_ORIGINAL') return this.config.classicLaps;
    return PRO_2026_LENGTHS[this.config.raceLengthId]?.laps || 5;
  }

  _activeGearboxMode() {
    return this.config.gearboxMode || 'AUTO_8SPD';
  }

  _unlockAndSyncAudioButton() {
    this.audio.unlock();
    if (this.audio.ctx && this.audio.ctx.state === 'suspended') {
      this.audio.ctx.resume().catch(() => {});
    }
    const menuLbl = document.getElementById('menu-audio-label');
    if (menuLbl) {
      menuLbl.textContent = this.audio.muted ? 'MUTE' : 'ON';
    }
    const menuBtn = document.getElementById('btn-menu-audio');
    if (menuBtn) {
      menuBtn.style.opacity = this.audio.muted ? '0.62' : '1';
    }
    const liveBtn = document.getElementById('btn-live-mute');
    if (liveBtn) {
      liveBtn.textContent = this.audio.muted ? 'MUTE' : 'SND';
    }
  }

  _toggleFullscreen() {
    const doc = document;
    const elem = doc.documentElement;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      if (elem.requestFullscreen) elem.requestFullscreen().catch(() => {});
      else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    } else {
      if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    }
  }

  _onPlayerGearShift(car, nextGear, shiftDir) {
    if (!car.isPlayer) return;
    this.hud.triggerGearShiftPulse(shiftDir);
    if (shiftDir === 'UP') {
      this.audio.playUpshiftCut(nextGear);
    } else {
      this.audio.playDownshiftBlip(nextGear);
    }
    this.controls.setGearboxUI(this._activeGearboxMode(), car.gear);
  }

  // --------------------------------------------------------------------------
  // SHOWROOM START SCREEN, SLIDE-OVER GARAGE DRAWER & CIRCUIT SWITCHING
  // --------------------------------------------------------------------------
  _bindShowroomMenuAndModals() {
    const garageBackdrop = document.getElementById('garage-backdrop');
    const setGarageOpen = (open) => {
      if (garageBackdrop) garageBackdrop.classList.toggle('open', open);
    };

    const syncSettingsTabs = () => {
      const activeTab = this._settingsTab || 'CONTROLS';
      document.querySelectorAll('[data-settings-tab]').forEach((t) =>
        t.classList.toggle('selected', t.dataset.settingsTab === activeTab)
      );
      document.querySelectorAll('[data-settings-panel]').forEach((p) => {
        p.hidden = p.dataset.settingsPanel !== activeTab;
      });
    };

    const assistDescriptions = {
      OFF: 'OFF: Pure unassisted manual braking. Full wheel-lockup & flat-spot physics active — maximum driver control.',
      MIN: 'MIN: Safety net only on tight hairpins & chicanes — never touches throttle or caps straight/sweeper speed.',
      FULL: 'FULL: Smooth kinematic corner-entry & trail-braking guidance calculated from real track curvature and grip.',
    };

    const syncMenuUI = () => {
      const is2026 = this.config.mode === '2026_UPDATED';
      const tDef = TRACK_CATALOG[this.config.trackId] || TRACK_CATALOG.FUJI_1982;
      document.body.classList.toggle('sim-2026-active', is2026);

      document.querySelectorAll('[data-cfg-track]').forEach((b) =>
        b.classList.toggle('selected', b.dataset.cfgTrack === this.config.trackId)
      );
      document.querySelectorAll('[data-cfg-mode]').forEach((b) =>
        b.classList.toggle('selected', b.dataset.cfgMode === this.config.mode)
      );
      document.querySelectorAll('[data-cfg-gearbox]').forEach((b) =>
        b.classList.toggle('selected', b.dataset.cfgGearbox === this.config.gearboxMode)
      );
      document.querySelectorAll('[data-cfg-steer]').forEach((b) =>
        b.classList.toggle('selected', b.dataset.cfgSteer === this.config.steeringStyle)
      );
      document.querySelectorAll('[data-cfg-hand]').forEach((b) =>
        b.classList.toggle('selected', b.dataset.cfgHand === this.config.handedness)
      );
      document.querySelectorAll('[data-cfg-classic-laps]').forEach((b) =>
        b.classList.toggle('selected', Number(b.dataset.cfgClassicLaps) === this.config.classicLaps)
      );
      document.querySelectorAll('[data-cfg-length]').forEach((b) =>
        b.classList.toggle('selected', b.dataset.cfgLength === this.config.raceLengthId)
      );
      document.querySelectorAll('[data-cfg-compound]').forEach((b) =>
        b.classList.toggle('selected', b.dataset.cfgCompound === this.config.startingCompound)
      );
      document.querySelectorAll('[data-cfg-grid]').forEach((b) =>
        b.classList.toggle('selected', Number(b.dataset.cfgGrid) === this.config.gridSize)
      );
      document.querySelectorAll('[data-cfg-weather]').forEach((b) =>
        b.classList.toggle('selected', b.dataset.cfgWeather === this.config.weatherPreset)
      );
      document.querySelectorAll('[data-cfg-shader]').forEach((b) =>
        b.classList.toggle('selected', b.dataset.cfgShader === this.config.visualStyle)
      );
      document.querySelectorAll('[data-cfg-quali2026]').forEach((b) =>
        b.classList.toggle('selected', (b.dataset.cfgQuali2026 === 'ON') === this.config.runQualifying2026)
      );
      document.querySelectorAll('[data-cfg-ai-diff]').forEach((b) =>
        b.classList.toggle('selected', b.dataset.cfgAiDiff === this.aiDifficulty)
      );

      const ctl = this.prefs.control;
      ctl.brakingAssist = normalizeAssistMode(ctl.brakingAssist, 'MIN');
      document.querySelectorAll('[data-cfg-units]').forEach((b) =>
        b.classList.toggle('selected', b.dataset.cfgUnits === this.prefs.speedUnit)
      );
      document.querySelectorAll('[data-cfg-assist]').forEach((b) =>
        b.classList.toggle('selected', b.dataset.cfgAssist === ctl.brakingAssist)
      );
      const assistDescEl = document.getElementById('assist-mode-desc');
      if (assistDescEl) {
        assistDescEl.textContent = assistDescriptions[ctl.brakingAssist] || assistDescriptions.MIN;
      }
      document.querySelectorAll('[data-cfg-autothrottle]').forEach((b) =>
        b.classList.toggle('selected', (b.dataset.cfgAutothrottle === 'ON') === !!ctl.autoThrottle)
      );
      document.querySelectorAll('[data-cfg-haptics]').forEach((b) =>
        b.classList.toggle('selected', (b.dataset.cfgHaptics === 'ON') === !!ctl.haptics)
      );

      const calBtn = document.getElementById('btn-calibrate-tilt');
      if (calBtn) calBtn.style.display = this.config.steeringStyle === 'TILT' ? 'block' : 'none';

      const box1982 = document.getElementById('cfg-section-1982');
      const box2026 = document.getElementById('cfg-section-2026');
      if (box1982) box1982.style.display = is2026 ? 'none' : 'block';
      if (box2026) box2026.style.display = is2026 ? 'block' : 'none';

      const lenDesc = document.getElementById('cfg-length-summary');
      if (lenDesc && is2026) {
        lenDesc.textContent = PRO_2026_LENGTHS[this.config.raceLengthId]?.pitSummary || '';
      }

      // Sync Showroom Top Circuit Subtitle & Minimap Tag (clean motorsport typography, zero emoji)
      const subEl = document.getElementById('menu-circuit-subtitle');
      if (subEl) {
        const cleanCountry = String(tDef.country || '').replace(/[^\x20-\x7E]/g, '').trim();
        subEl.textContent = `${cleanCountry ? cleanCountry + ' • ' : ''}${tDef.name} — ${String(tDef.subtitle || '').toUpperCase()}`;
      }
      const mapTag = document.getElementById('hud-circuit-tag');
      if (mapTag) {
        mapTag.textContent = tDef.name.split(' ').slice(0, 2).join(' ');
      }

      // Sync Bottom Session & Assist Bar Quick Pills
      const laps = this._activeTotalLaps();
      const setChip = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.textContent = txt;
      };
      setChip('sum-mode', is2026 ? `${laps} LAPS` : `${laps}L • 82`);
      setChip(
        'sum-gear',
        this.config.gearboxMode === 'AUTO_8SPD'
          ? 'AUTO 8 • SETUP'
          : (this.config.gearboxMode === 'CLASSIC_2SPD' ? 'LO/HI • SETUP' : 'MAN 8 • SETUP')
      );
      const wLabelMap = {
        RANDOM: 'DYNAMIC',
        HOT_SUNNY: 'DRY SUN',
        GOLDEN_SUNSET: 'SUNSET',
        OVERCAST_COOL: 'COOL DRY',
        LIGHT_DRIZZLE: 'INTER',
        MONSOON_STORM: 'WET',
      };
      setChip(
        'sum-weather',
        tDef.forceNight && this.config.weatherPreset === 'RANDOM'
          ? 'NIGHT'
          : (wLabelMap[this.config.weatherPreset] || 'DYNAMIC')
      );
      setChip(
        'sum-steer',
        this.config.steeringStyle === 'BUTTONS'
          ? 'BUTTONS'
          : (this.config.steeringStyle === 'TILT' ? 'TILT' : 'WHEEL')
      );

      const liveSteerBtn = document.getElementById('btn-live-steer');
      if (liveSteerBtn) {
        liveSteerBtn.textContent =
          this.config.steeringStyle === 'BUTTONS'
            ? 'PAD'
            : (this.config.steeringStyle === 'TILT' ? 'TLT' : 'WHL');
      }
      syncSettingsTabs();
      this._syncCareerBadges();
    };
    this._syncMenuUI = syncMenuUI;

    document.querySelectorAll('[data-settings-tab]').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        this._unlockAndSyncAudioButton();
        this.audio.playUIClick(false);
        this._settingsTab = tabBtn.dataset.settingsTab || 'CONTROLS';
        syncSettingsTabs();
      });
    });

    const bindGroup = (attr, handler) => {
      document.querySelectorAll(`[${attr}]`).forEach((btn) => {
        btn.addEventListener('click', () => {
          this._unlockAndSyncAudioButton();
          this.audio.playUIClick(false);
          handler(btn);
          syncMenuUI();
        });
      });
    };

    // Circuit Card Switching — Live transitions the 3D Showroom circuit immediately
    bindGroup('data-cfg-track', (b) => {
      const nextTrack = b.dataset.cfgTrack;
      if (nextTrack && TRACK_CATALOG[nextTrack] && nextTrack !== this.config.trackId) {
        this.config.trackId = nextTrack;
        this._switchActiveCircuit(nextTrack);
        this._spawnShowroomScene();
      }
    });

    bindGroup('data-cfg-mode', (b) => {
      this.config.mode = b.dataset.cfgMode;
      if (this.config.mode === '2026_UPDATED') {
        if (this.config.gearboxMode === 'CLASSIC_2SPD') {
          this.config.gearboxMode = 'AUTO_8SPD';
        }
        if (this.config.visualStyle === '1982_ARCADE') {
          this.config.visualStyle = '2026_PBR';
          this._applyVisualShaderStyle();
        }
      }
      this._refreshShowroomLighting();
    });
    bindGroup('data-cfg-gearbox', (b) => {
      this.config.gearboxMode = b.dataset.cfgGearbox;
      this._userPickedGearbox = true;
    });
    bindGroup('data-cfg-steer', (b) => {
      this.config.steeringStyle = b.dataset.cfgSteer;
      this._steeringUserSet = true;
      this.controls.setSteeringStyle(this.config.steeringStyle);
      this._savePrefs();
    });
    bindGroup('data-cfg-units', (b) => {
      this.prefs.speedUnit = b.dataset.cfgUnits === 'MPH' ? 'MPH' : 'KMH';
      this.hud.setSpeedUnit(this.prefs.speedUnit);
      this._savePrefs();
    });
    bindGroup('data-cfg-assist', (b) => {
      this.prefs.control.brakingAssist = normalizeAssistMode(b.dataset.cfgAssist, 'MIN');
      this._applyControlSettings();
    });
    bindGroup('data-cfg-ai-diff', (b) => {
      const nextDiff = String(b.dataset.cfgAiDiff || 'PRO').toUpperCase();
      if (['ROOKIE', 'PRO', 'LEGEND'].includes(nextDiff)) {
        this.aiDifficulty = nextDiff;
        this.prefs.aiDifficulty = nextDiff;
        this._savePrefs();
      }
    });
    bindGroup('data-cfg-autothrottle', (b) => {
      this.prefs.control.autoThrottle = b.dataset.cfgAutothrottle === 'ON';
      this._applyControlSettings();
    });
    bindGroup('data-cfg-haptics', (b) => {
      this.prefs.control.haptics = b.dataset.cfgHaptics === 'ON';
      this._applyControlSettings();
    });
    bindGroup('data-cfg-hand', (b) => {
      this.config.handedness = b.dataset.cfgHand;
      this.controls.setHandedness(this.config.handedness);
    });
    bindGroup('data-cfg-classic-laps', (b) => {
      this.config.classicLaps = Number(b.dataset.cfgClassicLaps);
    });
    bindGroup('data-cfg-length', (b) => {
      this.config.raceLengthId = b.dataset.cfgLength;
    });
    bindGroup('data-cfg-compound', (b) => {
      this.config.startingCompound = b.dataset.cfgCompound;
      if (this.playerCar && this.state === GAME_STATES.PRE_RACE_MENU) {
        this.playerCar.compound = this.config.startingCompound;
        this.carRigs.get(this.playerCar.id)?.setCompound(this.config.startingCompound);
      }
    });
    bindGroup('data-cfg-grid', (b) => {
      this.config.gridSize = Number(b.dataset.cfgGrid);
    });
    bindGroup('data-cfg-weather', (b) => {
      this.config.weatherPreset = b.dataset.cfgWeather;
      this._refreshShowroomLighting();
    });
    bindGroup('data-cfg-quali2026', (b) => {
      this.config.runQualifying2026 = b.dataset.cfgQuali2026 === 'ON';
    });
    bindGroup('data-cfg-shader', (b) => {
      this.config.visualStyle = b.dataset.cfgShader;
      this._applyVisualShaderStyle();
    });

    // Bottom Session Bar Quick-Cycle Pills (Laps, Weather, Steer)
    document.getElementById('btn-dock-laps')?.addEventListener('click', () => {
      this._unlockAndSyncAudioButton();
      this.audio.playUIClick(false);
      if (this.config.mode === '2026_UPDATED') {
        const order = ['SHORT', 'MEDIUM', 'LONG'];
        const idx = order.indexOf(this.config.raceLengthId);
        this.config.raceLengthId = order[(idx + 1) % order.length];
      } else {
        const order = [3, 4, 5];
        const idx = order.indexOf(this.config.classicLaps);
        this.config.classicLaps = order[(idx + 1) % order.length];
      }
      syncMenuUI();
    });
    document.getElementById('btn-dock-weather')?.addEventListener('click', () => {
      this._unlockAndSyncAudioButton();
      this.audio.playUIClick(false);
      const order = ['RANDOM', 'HOT_SUNNY', 'GOLDEN_SUNSET', 'OVERCAST_COOL', 'LIGHT_DRIZZLE', 'MONSOON_STORM'];
      const idx = order.indexOf(this.config.weatherPreset);
      this.config.weatherPreset = order[(idx + 1) % order.length];
      this._refreshShowroomLighting();
      syncMenuUI();
    });
    document.getElementById('btn-dock-steer')?.addEventListener('click', () => {
      this._unlockAndSyncAudioButton();
      this.audio.playUIClick(false);
      const order = ['WHEEL', 'BUTTONS', 'TILT'];
      const idx = order.indexOf(this.config.steeringStyle);
      this.config.steeringStyle = order[(idx + 1) % order.length];
      this._steeringUserSet = true;
      this.controls.setSteeringStyle(this.config.steeringStyle);
      this._savePrefs();
      syncMenuUI();
    });

    // Settings Modal Open / Close (plus Escape key close). Re-parented to <body> for in-race Pause access.
    if (garageBackdrop && garageBackdrop.parentElement !== document.body) {
      document.body.appendChild(garageBackdrop);
    }
    this._setGarageOpen = setGarageOpen;
    document.getElementById('btn-open-garage')?.addEventListener('click', () => {
      this._unlockAndSyncAudioButton();
      this.audio.playUIClick(true);
      this._syncSettingsSliders();
      syncSettingsTabs();
      setGarageOpen(true);
    });
    document.getElementById('btn-setup-summary')?.addEventListener('click', () => {
      this._unlockAndSyncAudioButton();
      this.audio.playUIClick(true);
      this._settingsTab = 'ASSISTS';
      this._syncSettingsSliders();
      syncSettingsTabs();
      setGarageOpen(true);
    });
    const closeGarage = () => {
      this.audio.playUIClick(false);
      setGarageOpen(false);
      if (this.paused && this.state !== GAME_STATES.PRE_RACE_MENU) {
        const pm = document.getElementById('pause-modal');
        if (pm) pm.style.display = 'flex';
      }
    };
    document.getElementById('btn-close-garage')?.addEventListener('click', closeGarage);
    garageBackdrop?.addEventListener('click', (e) => {
      if (e.target === garageBackdrop) closeGarage();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && garageBackdrop?.classList.contains('open')) {
        closeGarage();
      }
    });

    // Range sliders: control ergonomics + linearity + opacity + 5-channel audio mixer
    const bindSlider = (id, onValue, formatVal = null) => {
      const el = document.getElementById(id);
      const valEl = document.getElementById(`${id}-val`);
      if (!el) return;
      el.addEventListener('input', () => {
        const v = Number(el.value);
        if (valEl) valEl.textContent = formatVal ? formatVal(v) : `${v}%`;
        onValue(v);
      });
    };
    bindSlider('slider-ctrl-sens', (v) => {
      this.prefs.control.sensitivity = v / 100;
      this._applyControlSettings();
    });
    bindSlider(
      'slider-ctrl-lin',
      (v) => {
        this.prefs.control.steeringLinearity = v / 100;
        this._applyControlSettings();
      },
      (v) => (v <= 0 ? '1:1 LIN' : `+${v}% EXPO`)
    );
    bindSlider('slider-ctrl-scale', (v) => {
      this.prefs.control.controlScale = v / 100;
      this._applyControlSettings();
    });
    bindSlider('slider-ctrl-opacity', (v) => {
      this.prefs.control.controlOpacity = v / 100;
      this._applyControlSettings();
    });
    for (const ch of ['master', 'engine', 'sfx', 'voice', 'music']) {
      bindSlider(`slider-mix-${ch}`, (v) => {
        this.prefs.mixer = { ...(this.prefs.mixer || {}), [ch]: v / 100 };
        this.audio.setMixerLevels?.({ [ch]: v / 100 });
        this._savePrefs();
      });
    }

    // Showroom Stage Interactive Touch/Mouse 360° Orbit Drag
    const orbitZone = document.getElementById('showroom-orbit-zone');
    if (orbitZone) {
      orbitZone.addEventListener('pointerdown', (e) => {
        this._unlockAndSyncAudioButton();
        this._orbitDragPointer = e.pointerId;
        this._orbitLastX = e.clientX;
        this._orbitLastY = e.clientY;
        try {
          orbitZone.setPointerCapture(e.pointerId);
        } catch (_) {}
      });
      orbitZone.addEventListener('pointermove', (e) => {
        if (e.pointerId === this._orbitDragPointer) {
          const dx = e.clientX - this._orbitLastX;
          const dy = e.clientY - this._orbitLastY;
          this._orbitLastX = e.clientX;
          this._orbitLastY = e.clientY;
          if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) {
            this._userDraggedShowroom = true;
            document.getElementById('orbit-hint-chip')?.classList.add('faded-out');
          }
          this.showroomYawOffset -= dx * 0.0075;
          this.showroomPitchOffset = Math.max(-0.22, Math.min(0.55, this.showroomPitchOffset + dy * 0.004));
        }
      });
      const endOrbit = (e) => {
        if (e.pointerId === this._orbitDragPointer) {
          this._orbitDragPointer = null;
        }
      };
      orbitZone.addEventListener('pointerup', endOrbit);
      orbitZone.addEventListener('pointercancel', endOrbit);
    }

    // Menu Audio & Fullscreen Pills
    document.getElementById('btn-menu-audio')?.addEventListener('click', () => {
      if (!this.audio.initialized) {
        this._unlockAndSyncAudioButton();
      } else {
        this.audio.setMuted(!this.audio.muted);
        this._unlockAndSyncAudioButton();
      }
      this.audio.playUIClick(true);
    });
    document.getElementById('btn-menu-fullscreen')?.addEventListener('click', () => {
      this._unlockAndSyncAudioButton();
      this._toggleFullscreen();
    });

    // Race Launch Buttons (Bottom Dock + Inside Settings Modal)
    const triggerLaunch = () => {
      this._unlockAndSyncAudioButton();
      this.audio.playUIClick(true);
      setGarageOpen(false);
      this._careerRoundActive = false;
      this.launchFromMenu();
    };
    document.getElementById('btn-launch-race')?.addEventListener('click', triggerLaunch);
    document.getElementById('btn-garage-race')?.addEventListener('click', triggerLaunch);

    // Legacy 1-Tap Authentic 1982 Namco "Pole Position" Launch Hook
    document.getElementById('btn-launch-1982-direct')?.addEventListener('click', () => {
      this._unlockAndSyncAudioButton();
      this.audio.playUIClick(true);
      setGarageOpen(false);
      this.config.mode = '1982_ORIGINAL';
      this.config.visualStyle = '1982_ARCADE';
      if (!this._userPickedGearbox) {
        this.config.gearboxMode = 'CLASSIC_2SPD';
      }
      if (this.config.trackId !== 'FUJI_1982') {
        this.config.trackId = 'FUJI_1982';
        this._switchActiveCircuit('FUJI_1982');
      }
      this._applyVisualShaderStyle();
      this._careerRoundActive = false;
      syncMenuUI();
      this.launchFromMenu();
    });

    // Live In-Race Quick Action Pills
    document.getElementById('btn-live-fullscreen')?.addEventListener('click', () => this._toggleFullscreen());
    document.getElementById('btn-live-steer')?.addEventListener('click', () => {
      const order = ['WHEEL', 'BUTTONS', 'TILT'];
      const idx = order.indexOf(this.config.steeringStyle);
      this.config.steeringStyle = order[(idx + 1) % order.length];
      this._steeringUserSet = true;
      this.controls.setSteeringStyle(this.config.steeringStyle);
      const steerLabels = {
        WHEEL: 'STEERING: F1 WHEEL',
        BUTTONS: 'STEERING: TOUCH ARROWS',
        TILT: 'STEERING: TILT GYRO',
      };
      this.hud.showCenterCallout(
        steerLabels[this.config.steeringStyle] || 'STEERING: F1 WHEEL',
        950,
        '#38bdf8'
      );
      this._savePrefs();
      syncMenuUI();
    });
    document.getElementById('btn-live-shader')?.addEventListener('click', () => this.toggleVisualStyle());
    document.getElementById('btn-live-hand')?.addEventListener('click', () => {
      this.config.handedness = this.config.handedness === 'RIGHT_HANDED' ? 'LEFT_HANDED' : 'RIGHT_HANDED';
      this.controls.setHandedness(this.config.handedness);
      this.hud.showCenterCallout(
        this.config.handedness === 'LEFT_HANDED' ? 'LAYOUT: LEFT-HANDED' : 'LAYOUT: RIGHT-HANDED',
        950,
        '#38bdf8'
      );
      syncMenuUI();
    });
    document.getElementById('btn-live-cam')?.addEventListener('click', () => this._cycleLiveCamera(1));
    document.getElementById('btn-camera')?.addEventListener('click', () => this._cycleLiveCamera(1));
    window.addEventListener('f1-visor-tearoff', () => this._onVisorTearOff());
    document.getElementById('btn-live-mute')?.addEventListener('click', () => {
      this.audio.setMuted(!this.audio.muted);
      this._unlockAndSyncAudioButton();
    });
    document.getElementById('btn-live-menu')?.addEventListener('click', () => {
      if (this.state === GAME_STATES.RACE_RESULTS) return;
      this._setPaused(true);
    });
    document.getElementById('btn-live-replay')?.addEventListener('click', () => {
      this._enterReplay(false);
    });

    // DNQ Modal
    document.getElementById('btn-dnq-retry')?.addEventListener('click', () => {
      document.getElementById('dnq-modal').style.display = 'none';
      this.startQualifyingSession();
    });
    document.getElementById('btn-dnq-override')?.addEventListener('click', () => {
      document.getElementById('dnq-modal').style.display = 'none';
      this.qualifiedGridSlot = 8;
      this.qualifyingBonus = 200;
      this.startGridLineup();
    });

    // Post-Race Podium Modal
    document.getElementById('btn-podium-again')?.addEventListener('click', () => {
      document.getElementById('podium-modal').style.display = 'none';
      if (this._careerRoundActive) {
        const round = this.career.getCurrentRound();
        const nextTrack = round?.resolvedTrackId || round?.trackId;
        if (nextTrack && TRACK_CATALOG[nextTrack] && nextTrack !== this.config.trackId) {
          this.config.trackId = nextTrack;
          this._switchActiveCircuit(nextTrack);
        }
      }
      this.launchFromMenu();
    });
    document.getElementById('btn-podium-replay')?.addEventListener('click', () => {
      this._enterReplay(true);
    });
    document.getElementById('btn-podium-menu')?.addEventListener('click', () => {
      document.getElementById('podium-modal').style.display = 'none';
      const reopenCareer = this._careerRoundActive;
      this.returnToPreRaceMenu();
      if (reopenCareer) this._setCareerOpen(true);
    });

    syncMenuUI();
  }

  // --------------------------------------------------------------------------
  // PERSISTED SETTINGS: CONTROL ERGONOMICS, ASSISTS, SPEED UNIT & AUDIO MIXER
  // --------------------------------------------------------------------------
  _applyPersistedSettings() {
    this._applyControlSettings(false);
    if (this.prefs.mixer && this.audio.setMixerLevels) {
      this.audio.setMixerLevels(this.prefs.mixer);
    }
    this._syncSettingsSliders();
  }

  _applyControlSettings(save = true) {
    const c = this.prefs.control;
    c.sensitivity = Math.max(0.6, Math.min(1.5, Number(c.sensitivity) || 1.0));
    const rawLin = Number(c.steeringLinearity);
    c.steeringLinearity = Math.max(0.0, Math.min(0.45, Number.isFinite(rawLin) ? rawLin : 0.0));
    c.controlScale = Math.max(0.75, Math.min(1.25, Number(c.controlScale) || 1.0));
    const rawOp = Number(c.controlOpacity);
    c.controlOpacity = Math.max(0.40, Math.min(1.0, Number.isFinite(rawOp) ? rawOp : 0.88));
    c.brakingAssist = normalizeAssistMode(c.brakingAssist, 'MIN');

    this.controls?.setControlSettings?.({
      sensitivity: c.sensitivity,
      steeringLinearity: c.steeringLinearity,
      linearity: c.steeringLinearity,
      controlScale: c.controlScale,
      controlOpacity: c.controlOpacity,
      brakingAssist: c.brakingAssist,
      autoThrottle: !!c.autoThrottle,
      haptics: !!c.haptics,
    });
    const ctrlLayer = document.getElementById('mobile-controls-layer');
    if (ctrlLayer) {
      ctrlLayer.style.opacity = String(c.controlOpacity);
    }
    if (save) this._savePrefs();
  }

  _syncSettingsSliders() {
    const setSlider = (id, pct, customLabel = null) => {
      const el = document.getElementById(id);
      const valEl = document.getElementById(`${id}-val`);
      const v = Math.round(pct);
      if (el) el.value = String(v);
      if (valEl) valEl.textContent = customLabel !== null ? customLabel : `${v}%`;
    };
    setSlider('slider-ctrl-sens', this.prefs.control.sensitivity * 100);
    const linPct = Math.round((this.prefs.control.steeringLinearity || 0) * 100);
    setSlider('slider-ctrl-lin', linPct, linPct <= 0 ? '1:1 LIN' : `+${linPct}% EXPO`);
    setSlider('slider-ctrl-scale', this.prefs.control.controlScale * 100);
    setSlider('slider-ctrl-opacity', (this.prefs.control.controlOpacity ?? 0.88) * 100);
    const mix = this.audio.getMixerLevels ? (this.audio.getMixerLevels() || {}) : (this.prefs.mixer || {});
    for (const ch of ['master', 'engine', 'sfx', 'voice', 'music']) {
      let v = Number(mix[ch]);
      if (!Number.isFinite(v)) continue;
      if (v <= 1.0001) v *= 100;
      setSlider(`slider-mix-${ch}`, Math.max(0, Math.min(100, v)));
    }
  }

  // --------------------------------------------------------------------------
  // CAREER HUB: 6 WORKS TEAMS, CAR R&D PARTS, SETUP & STRATEGY, CHAMPIONSHIP
  // --------------------------------------------------------------------------
  _setCareerOpen(open) {
    const bd = document.getElementById('career-backdrop');
    if (bd) bd.classList.toggle('open', !!open);
    if (open) this._renderCareerHub();
  }

  _bindCareerHub() {
    const bd = document.getElementById('career-backdrop');
    document.getElementById('btn-open-career')?.addEventListener('click', () => {
      this._unlockAndSyncAudioButton();
      this.audio.playUIClick(true);
      this._setCareerOpen(true);
    });
    document.getElementById('btn-close-career')?.addEventListener('click', () => {
      this.audio.playUIClick(false);
      this._setCareerOpen(false);
    });
    bd?.addEventListener('click', (e) => {
      if (e.target === bd) {
        this.audio.playUIClick(false);
        this._setCareerOpen(false);
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && bd?.classList.contains('open')) this._setCareerOpen(false);
    });

    document.querySelectorAll('[data-career-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        this.audio.playUIClick(false);
        this._careerTab = tab.dataset.careerTab;
        this._renderCareerHub();
      });
    });

    // Delegated clicks for dynamically rendered Career content
    document.getElementById('career-drawer')?.addEventListener('click', (e) => {
      const teamBtn = e.target.closest('[data-team-id]');
      if (teamBtn) {
        this.career.selectTeam(teamBtn.dataset.teamId);
        this.audio.playUIClick(true);
        this._applyTeamLiveryToShowroom();
        this._renderCareerHub();
        return;
      }
      const buyBtn = e.target.closest('[data-buy-branch]');
      if (buyBtn) {
        const res = this.career.purchaseUpgrade(buyBtn.dataset.buyBranch);
        if (res && (res.ok || res.success)) {
          this.audio.playUIClick(true);
          this.audio.playCrowdCheer?.(0.35);
        } else {
          this.audio.playYellowFlagChime?.();
        }
        this._careerToast = res?.message || '';
        this._renderCareerHub();
        return;
      }
      const setupBtn = e.target.closest('[data-setup-key]');
      if (setupBtn) {
        this.career.setCarSetup({ [setupBtn.dataset.setupKey]: setupBtn.dataset.setupVal });
        this.audio.playUIClick(false);
        this._renderCareerHub();
      }
    });

    document.getElementById('btn-career-reset')?.addEventListener('click', () => {
      if (window.confirm('Reset the current season standings? Credits, parts & team are kept.')) {
        this.career.resetSeason();
        this._renderCareerHub();
      }
    });

    document.getElementById('btn-career-race-round')?.addEventListener('click', () => {
      this._unlockAndSyncAudioButton();
      this.audio.playUIClick(true);
      const round = this.career.getCurrentRound();
      const tId = round?.resolvedTrackId || round?.trackId || 'FUJI_1982';
      this.config.mode = '2026_UPDATED';
      if (this.config.gearboxMode === 'CLASSIC_2SPD') this.config.gearboxMode = 'AUTO_8SPD';
      if (TRACK_CATALOG[tId] && tId !== this.config.trackId) {
        this.config.trackId = tId;
        this._switchActiveCircuit(tId);
      }
      this._careerRoundActive = true;
      this._setCareerOpen(false);
      this._syncMenuUI?.();
      this.launchFromMenu();
    });

    document.getElementById('btn-career-test')?.addEventListener('click', () => {
      this._unlockAndSyncAudioButton();
      this.audio.playUIClick(true);
      this.config.mode = '2026_UPDATED';
      if (this.config.gearboxMode === 'CLASSIC_2SPD') this.config.gearboxMode = 'AUTO_8SPD';
      this._careerRoundActive = false;
      this._setCareerOpen(false);
      this._syncMenuUI?.();
      this.launchFromMenu();
    });
  }

  _applyTeamLiveryToShowroom() {
    const team = this.career.getSelectedTeam();
    if (!team) return;
    const rig = this.playerCar ? this.carRigs.get(this.playerCar.id) : null;
    if (rig?.setLivery) rig.setLivery({ ...team.livery, compound: this.playerCar?.compound || this.config.startingCompound });
    this.pitCrewDiorama?.setLivery?.(team.livery);
    this._initOrSyncPitCrewTeamRig(team.livery?.primary ?? team.primaryHex ?? 0xe41c24);
    if (this.playerCar) this.playerCar.liveryHex = team.primaryHex;
    this._syncCareerBadges();
  }

  _syncCareerBadges() {
    if (!this.career) return;
    const st = this.career.getState();
    const team = this.career.getSelectedTeam();
    const round = this.career.getCurrentRound();
    const total = CHAMPIONSHIP_CALENDAR.length;
    const badge = document.getElementById('menu-credits-badge');
    if (badge) badge.textContent = compactCredits(st.credits);
    const pill = document.getElementById('menu-career-pill');
    if (pill) {
      pill.textContent = `S${st.seasonNumber} • R${(round?.round || st.currentRoundIdx + 1)}/${total} • ${team?.shortName || 'WORKS'}`;
      pill.style.borderColor = team?.primaryHex || '';
    }
  }

  _renderCareerHub() {
    if (!this.career) return;
    const st = this.career.getState();
    const team = this.career.getSelectedTeam();
    const round = this.career.getCurrentRound();
    const total = CHAMPIONSHIP_CALENDAR.length;
    const setTxt = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };

    // Header
    setTxt('career-credits-val', formatCredits(st.credits));
    setTxt('career-team-title', team?.shortName || team?.name || '');
    setTxt('career-season-kicker', `SEASON ${st.seasonNumber} • ROUND ${round?.round || 1}/${total} • ${this._playerSeasonPoints()} PTS`);
    const crest = document.getElementById('career-team-crest');
    if (crest && team) {
      crest.textContent = team.code;
      crest.style.background = `linear-gradient(135deg, ${team.primaryHex} 0%, ${team.primaryHex} 55%, ${team.accentHex} 56%, ${team.trimHex} 100%)`;
    }
    const roundLbl = document.getElementById('career-race-round-label');
    if (roundLbl && round) {
      roundLbl.textContent = `🏁 RACE R${round.round}: ${String(round.gpTitle || '').toUpperCase().replace('GRAND PRIX', 'GP')}`;
    }

    // Tabs visibility
    document.querySelectorAll('[data-career-tab]').forEach((t) =>
      t.classList.toggle('selected', t.dataset.careerTab === this._careerTab)
    );
    document.querySelectorAll('[data-career-panel]').forEach((p) => {
      p.hidden = p.dataset.careerPanel !== this._careerTab;
    });

    // TAB 1: Works Teams
    const teamsGrid = document.getElementById('career-teams-grid');
    if (teamsGrid) {
      teamsGrid.innerHTML = Object.values(TEAM_CATALOG).map((t) => `
        <button class="team-card${t.id === st.teamId ? ' selected' : ''}" data-team-id="${escapeHtml(t.id)}" type="button">
          <span class="team-swatch" style="background:linear-gradient(135deg, ${t.primaryHex} 0%, ${t.primaryHex} 58%, ${t.accentHex} 59%, ${t.trimHex} 100%)"></span>
          <span class="team-body">
            <span class="team-name">${escapeHtml(t.name)}</span>
            <span class="team-spec">${escapeHtml(t.powerUnitSpec)}</span>
            <span class="team-perk">★ ${escapeHtml(t.perkSummary)}</span>
          </span>
          <span class="team-check">${t.id === st.teamId ? '✓' : ''}</span>
        </button>
      `).join('');
    }

    // TAB 2: R&D ratings + parts
    const ratingsEl = document.getElementById('career-ratings');
    if (ratingsEl) {
      const r = this.career.getCarTelemetryRatings();
      const rows = [
        ['SPEED', r.speed], ['ACCEL', r.acceleration], ['AERO DF', r.downforce],
        ['BRAKING', r.braking], ['PIT CREW', r.pitCrew], ['OVERALL', r.overall],
      ];
      ratingsEl.innerHTML = rows.map(([lbl, v]) => {
        const val = Math.max(0, Math.min(100, Math.round(v || 0)));
        return `<div class="rating-row${lbl === 'OVERALL' ? ' overall' : ''}"><span class="rating-lbl">${lbl}</span><span class="rating-track"><i style="width:${val}%"></i></span><span class="rating-val">${val}</span></div>`;
      }).join('');
    }
    const partsEl = document.getElementById('career-parts-list');
    if (partsEl) {
      const toast = this._careerToast ? `<div class="career-toast">${escapeHtml(this._careerToast)}</div>` : '';
      this._careerToast = '';
      partsEl.innerHTML = toast + this.career.getAllUpgradesInfo().map((u) => {
        const pips = Array.from({ length: u.maxLevel || 5 }, (_, i) =>
          `<i class="${i < u.currentLevel ? 'on' : ''}"></i>`
        ).join('');
        const btn = u.isMaxed
          ? '<button class="part-buy maxed" type="button" disabled>MAX</button>'
          : `<button class="part-buy${u.canAfford ? '' : ' poor'}" data-buy-branch="${escapeHtml(u.branchId)}" type="button"${u.canAfford ? '' : ' disabled'}>${escapeHtml(compactCredits(u.nextCost))}</button>`;
        return `
          <div class="part-row">
            <span class="part-icon">${escapeHtml(u.icon || '🔧')}</span>
            <span class="part-body">
              <span class="part-head"><b>${escapeHtml(u.shortLabel || u.label || u.name)}</b><span class="part-pips">${pips}</span><span class="part-lv">LV ${u.currentLevel}/${u.maxLevel}</span></span>
              <span class="part-name">${escapeHtml(u.currentPartName || '')}</span>
              <span class="part-next">${u.isMaxed ? 'Fully developed' : '▲ ' + escapeHtml(u.nextSummary || u.nextPartName || '')}</span>
            </span>
            ${btn}
          </div>`;
      }).join('');
    }

    // TAB 3: Setup + Strategy
    const setup = st.carSetup || {};
    const renderSetupRow = (elId, key, opts) => {
      const el = document.getElementById(elId);
      if (!el || !opts) return;
      el.innerHTML = Object.values(opts).map((o) =>
        `<button class="cfg-btn${setup[key] === o.id ? ' selected' : ''}" data-setup-key="${key}" data-setup-val="${escapeHtml(o.id)}" type="button" title="${escapeHtml(o.desc || '')}">${escapeHtml(o.shortLabel || o.label)}</button>`
      ).join('');
    };
    renderSetupRow('career-setup-wing', 'wingTrim', CAR_SETUP_OPTIONS.wingTrim);
    renderSetupRow('career-setup-fuel', 'fuelLoad', CAR_SETUP_OPTIONS.fuelLoad);
    renderSetupRow('career-setup-stint', 'stintStrategy', CAR_SETUP_OPTIONS.stintStrategy);
    const stratEl = document.getElementById('career-strategy-card');
    if (stratEl) {
      const laps = PRO_2026_LENGTHS[this.config.raceLengthId]?.laps || 5;
      const wId = this.config.weatherPreset !== 'RANDOM' ? this.config.weatherPreset : 'HOT_SUNNY';
      const b = this.career.getStrategyBriefing(round?.resolvedTrackId || this.config.trackId, laps, wId);
      const watch = Array.isArray(b.keyWatchouts) ? b.keyWatchouts.slice(0, 3) : [];
      stratEl.innerHTML = `
        <div class="strat-kicker">📻 CHIEF RACE ENGINEER • ${escapeHtml(b.circuitName || '')}</div>
        <div class="strat-headline">${escapeHtml(b.headline || '')}</div>
        <div class="strat-grid">
          <span>START TIRE</span><b>${escapeHtml(b.optimalStartingTire || '')}</b>
          <span>PIT FOR</span><b>${escapeHtml(b.nextPitCompound || '')}</b>
          <span>PIT WINDOW</span><b>${escapeHtml(b.pitWindowLabel || '')}</b>
          <span>EST. STOP</span><b>${Number.isFinite(b.estimatedPitStopSec) ? b.estimatedPitStopSec.toFixed(2) + 's' : '--'}</b>
          <span>WING</span><b>${escapeHtml(b.wingRecommendationLabel || b.wingRecommendation || '')}</b>
          <span>CREW MODE</span><b>${escapeHtml(b.recommendedCrewMode || '')}</b>
        </div>
        ${b.undercutAdvice ? `<div class="strat-note">${escapeHtml(b.undercutAdvice)}</div>` : ''}
        ${watch.length ? `<ul class="strat-watch">${watch.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` : ''}
      `;
    }

    // TAB 4: Calendar, stats & standings
    const calEl = document.getElementById('career-calendar');
    if (calEl) {
      const hist = Array.isArray(st.roundHistory) ? st.roundHistory : [];
      calEl.innerHTML = CHAMPIONSHIP_CALENDAR.map((r, idx) => {
        const res = hist.find((h) => h.round === r.round);
        const cls = res ? 'done' : (idx === st.currentRoundIdx ? 'current' : '');
        const tag = res ? `P${res.finishPos} • +${res.pointsEarned}` : (idx === st.currentRoundIdx ? 'NEXT' : '—');
        return `<div class="cal-cell ${cls}"><span class="cal-r">R${r.round}</span><span class="cal-flag">${escapeHtml(String(r.country || '').split(' ')[0])}</span><span class="cal-name">${escapeHtml(r.venue || r.gpTitle)}</span><span class="cal-tag">${escapeHtml(tag)}</span></div>`;
      }).join('');
    }
    const statsEl = document.getElementById('career-stats');
    if (statsEl) {
      const s = st.stats || {};
      statsEl.innerHTML = [
        ['RACES', s.races || 0], ['WINS', s.wins || 0], ['PODIUMS', s.podiums || 0],
        ['POLES', s.poles || 0], ['TITLES', s.championships || 0],
      ].map(([l, v]) => `<div class="stat-chip"><b>${v}</b><span>${l}</span></div>`).join('');
    }
    const standEl = document.getElementById('career-standings');
    if (standEl) {
      const rows = this.career.getChampionshipStandings().slice(0, 10);
      standEl.innerHTML = rows.map((r) => `
        <div class="stand-row${r.isPlayer ? ' player' : ''}">
          <span class="stand-pos">${r.rank}</span>
          <span class="stand-bar" style="background:${escapeHtml(r.primaryHex || '#888')}"></span>
          <span class="stand-name">${escapeHtml(r.isPlayer ? `YOU • ${r.teamName || ''}` : (r.driverName || r.name))}</span>
          <span class="stand-pts">${r.points}</span>
        </div>`).join('');
    }

    this._syncCareerBadges();
  }

  _playerSeasonPoints() {
    const row = this.career.getChampionshipStandings().find((r) => r.isPlayer);
    return row ? row.points : 0;
  }

  // --------------------------------------------------------------------------
  // PAUSE MENU, BOX-THIS-LAP RADIO & 60HZ INSTANT REPLAY BROADCAST DIRECTOR
  // --------------------------------------------------------------------------
  _bindPauseAndReplayUI() {
    const pm = document.getElementById('pause-modal');
    document.getElementById('btn-pause-resume')?.addEventListener('click', () => this._setPaused(false));
    document.getElementById('btn-pause-replay')?.addEventListener('click', () => this._enterReplay(false));
    document.getElementById('btn-pause-settings')?.addEventListener('click', () => {
      if (pm) pm.style.display = 'none';
      this._syncSettingsSliders();
      this._setGarageOpen?.(true);
    });
    document.getElementById('btn-pause-restart')?.addEventListener('click', () => {
      this._setPaused(false);
      this.launchFromMenu();
    });
    document.getElementById('btn-pause-quit')?.addEventListener('click', () => {
      this._setPaused(false);
      this.returnToPreRaceMenu();
    });

    // Replay transport bar
    document.getElementById('btn-replay-playpause')?.addEventListener('click', () => {
      this.replay.togglePause();
    });
    document.getElementById('btn-replay-cam')?.addEventListener('click', () => {
      this.replay.cycleCameraMode(1);
    });
    document.getElementById('btn-replay-focus')?.addEventListener('click', () => {
      this.replay.cycleFocusCar(1);
    });
    document.getElementById('btn-replay-exit')?.addEventListener('click', () => this._exitReplay());
    document.querySelectorAll('[data-replay-speed]').forEach((b) => {
      b.addEventListener('click', () => {
        this.replay.setSpeed(Number(b.dataset.replaySpeed));
      });
    });
    const scrub = document.getElementById('replay-scrubber');
    if (scrub) {
      scrub.addEventListener('pointerdown', () => { this._replayScrubbing = true; });
      const endScrub = () => { this._replayScrubbing = false; };
      scrub.addEventListener('pointerup', endScrub);
      scrub.addEventListener('pointercancel', endScrub);
      scrub.addEventListener('change', endScrub);
      scrub.addEventListener('input', () => {
        this.replay.seekNormalized(Number(scrub.value) / 1000);
      });
    }
  }

  _setPaused(paused) {
    const canPause = this.state !== GAME_STATES.PRE_RACE_MENU && this.state !== GAME_STATES.RACE_RESULTS;
    this.paused = !!paused && canPause;
    this.physicsAccumulator = 0;
    const pm = document.getElementById('pause-modal');
    if (pm) pm.style.display = this.paused ? 'flex' : 'none';
    if (!this.paused) this._setGarageOpen?.(false);
    const kicker = document.getElementById('pause-kicker');
    if (kicker && this.paused) {
      const lap = this.playerCar ? Math.min(this.playerCar.lap, this._activeTotalLaps()) : 1;
      kicker.textContent = `${this.track.trackDef.name} • LAP ${lap}/${this._activeTotalLaps()} • SESSION PAUSED`;
    }
  }

  _toggleBoxThisLap() {
    if (this.config.mode !== '2026_UPDATED') return;
    if (this.state !== GAME_STATES.RACING || !this.playerCar || this.playerCar.inPitLane) return;
    const armed = this.raceSystems.toggleBoxThisLap();
    this.hud.syncBoxButtonState();
    if (armed) {
      const plan = this.raceSystems.playerPitPlan;
      this.hud.showEngineerRadio(`Box, box! Copy — ${String(plan.nextCompound).replace('_', ' ')} tires ready. Keep right at the pit entry.`);
      this.audio.speakAnnouncement('Box box, this lap.', true);
    } else {
      this.hud.showEngineerRadio('Copy, stay out. Pit call cancelled.');
    }
  }

  _enterReplay(fromPodium = false) {
    if (this.replay.isPlaying) return;
    if (this.state === GAME_STATES.PRE_RACE_MENU) return;
    if (!this.replay.hasFrames()) {
      this.hud.showCenterCallout('NO REPLAY FOOTAGE YET', 1100, '#ffd600');
      return;
    }
    const pm = document.getElementById('pause-modal');
    if (pm) pm.style.display = 'none';
    const podium = document.getElementById('podium-modal');
    this._replayFromPodium = !!fromPodium || (podium && podium.style.display === 'flex');
    if (podium) podium.style.display = 'none';
    this._setGarageOpen?.(false);

    const ok = this.replay.enterReplay(this._replayFromPodium ? 15 : 12, this.camera);
    if (!ok) return;
    this.physicsAccumulator = 0;
    this.camera.up.set(0, 1, 0);
    if (Math.abs(this.camera.near - 0.32) > 0.01) {
      this.camera.near = 0.32;
      this.camera.updateProjectionMatrix();
    }
    this.weather?.updateCockpitVisorRain?.(this.camera, false, 0, 0.016);
    document.body.classList.add('replay-active');
    const ov = document.getElementById('replay-overlay');
    if (ov) ov.style.display = 'flex';
    this.retro1982.setVisible(false);
    this._syncPlayerCockpitHelmetVisibility();
  }

  _exitReplay() {
    if (!this.replay.isPlaying) return;
    this.replay.exitReplay(this.camera);
    document.body.classList.remove('replay-active');
    const ov = document.getElementById('replay-overlay');
    if (ov) ov.style.display = 'none';
    this.physicsAccumulator = 0;

    // Re-sync every rig to the live simulation state immediately (no 1-frame pop)
    for (const car of this.allCars) {
      const rig = this.carRigs.get(car.id);
      if (!rig) continue;
      rig.root.visible = !car.exploded;
      rig.setCompound?.(car.compound);
    }

    if (this._replayFromPodium || this.state === GAME_STATES.RACE_RESULTS) {
      const podium = document.getElementById('podium-modal');
      if (podium) podium.style.display = 'flex';
    } else if (this.paused) {
      const pm = document.getElementById('pause-modal');
      if (pm) pm.style.display = 'flex';
    }
    this._replayFromPodium = false;
  }

  _updateReplayOverlay(rs) {
    if (!rs) return;
    const setTxt = (id, v) => {
      const el = document.getElementById(id);
      if (el && el.textContent !== v) el.textContent = v;
    };
    setTxt('replay-cam-pill', rs.cameraLabel || '');
    const spd = this.prefs.speedUnit === 'MPH'
      ? `${Math.round((rs.focusCarSpeedKmh || 0) * 0.621371)} MPH`
      : `${Math.round(rs.focusCarSpeedKmh || 0)} KM/H`;
    const lapTxt = rs.lap ? ` • L${Math.min(rs.lap, rs.totalLaps || rs.lap)}` : '';
    setTxt('replay-car-telemetry', `${rs.focusCarName || ''} • ${spd} • G${rs.focusCarGear || 1}${lapTxt}`);
    setTxt('replay-time-label', `${(rs.currentTimeSec || 0).toFixed(1)}s / ${(rs.durationSec || 0).toFixed(1)}s`);
    setTxt('btn-replay-playpause', rs.paused ? '▶' : '⏸');
    const shortCam = this.replay.cameraModes?.[rs.cameraModeIdx]?.shortLabel || 'CAM';
    setTxt('btn-replay-cam', `🎥 ${shortCam}`);
    const focusShort = String(rs.focusCarName || 'CAR').split(' ')[0].slice(0, 10);
    setTxt('btn-replay-focus', `🏎️ ${focusShort}`);
    const scrub = document.getElementById('replay-scrubber');
    if (scrub && !this._replayScrubbing) {
      scrub.value = String(Math.round((rs.progress01 || 0) * 1000));
    }
    document.querySelectorAll('[data-replay-speed]').forEach((b) =>
      b.classList.toggle('selected', Math.abs(Number(b.dataset.replaySpeed) - (rs.speed || 1)) < 0.01)
    );
  }

  _initOrSyncPitCrewTeamRig(teamColorHex = 0xe41c24) {
    if (typeof ModelsModule.createPitCrewTeamRig === 'function') {
      if (!this._pitCrewTeamRig) {
        try {
          this._pitCrewTeamRig = ModelsModule.createPitCrewTeamRig(teamColorHex, this.assets, this.track);
          const rigNode = this._pitCrewTeamRig?.group || this._pitCrewTeamRig?.root || (this._pitCrewTeamRig?.isObject3D ? this._pitCrewTeamRig : null);
          if (rigNode && !rigNode.parent) {
            this.scene.add(rigNode);
          }
          if (rigNode && this.pitCrewDiorama?.group) {
            this.pitCrewDiorama.group.visible = false;
          }
        } catch (err) {
          console.warn('[PitCrewTeamRig] Fallback to PitCrewDiorama:', err);
          this._pitCrewTeamRig = null;
        }
      } else if (typeof this._pitCrewTeamRig.setLivery === 'function') {
        this._pitCrewTeamRig.setLivery({ primary: teamColorHex });
      } else if (typeof this._pitCrewTeamRig.setTeamColor === 'function') {
        this._pitCrewTeamRig.setTeamColor(teamColorHex);
      }
    }
    this._repositionPitCrewTeamRig();
  }

  _repositionPitCrewTeamRig() {
    if (!this._pitCrewTeamRig || !this.track) return;
    if (typeof this._pitCrewTeamRig.repositionForTrack === 'function') {
      this._pitCrewTeamRig.repositionForTrack(this.track);
      return;
    }
    const rigNode = this._pitCrewTeamRig.group || this._pitCrewTeamRig.root || (this._pitCrewTeamRig.isObject3D ? this._pitCrewTeamRig : null);
    if (rigNode) {
      const boxLat = (PIT_LANE_CONFIG.lateralOffset ?? 13.0) + 3.2;
      const bf = this.track.sampleAt(PIT_LANE_CONFIG.playerBoxS ?? 20, boxLat);
      const yaw = Math.atan2(bf.tangent.z, bf.tangent.x);
      rigNode.position.copy(bf.pos);
      rigNode.rotation.set(0, -yaw, 0);
    }
  }

  _cycleLiveCamera(direction = 1) {
    const step = Number(direction) < 0 ? -1 : 1;
    if (this.replay?.isPlaying) {
      this.replay.cycleCameraMode(step);
      return;
    }
    this.cameraModeIdx = (((this.cameraModeIdx + step) % 5) + 5) % 5;
    this.cameraIndex = this.cameraModeIdx;
    this._syncPlayerCockpitHelmetVisibility();
    const label = LIVE_CAMERA_LABELS[this.cameraModeIdx] || LIVE_CAMERA_LABELS[0];
    const liveCamBtn = document.getElementById('btn-live-cam');
    if (liveCamBtn) {
      liveCamBtn.title = `${label} — Tap or press C to cycle`;
    }
    this.hud?.showCenterCallout(label, 1050, '#38bdf8');
  }

  _onVisorTearOff() {
    if (this.state === GAME_STATES.PRE_RACE_MENU || this.paused || this.replay?.isPlaying) return;
    this.weather?.triggerVisorTearOff?.();
    if (this.cameraModeIdx === 2 && (this.weather?.grooveMoisture > 0.05 || this.lockedRaceWeatherId === 'LIGHT_DRIZZLE' || this.lockedRaceWeatherId === 'MONSOON_STORM')) {
      this.hud?.showCenterCallout('VISOR TEAR-OFF CLEAR', 850, '#38bdf8');
    }
  }

  _isLiveCockpit3DActive() {
    return (
      this.cameraModeIdx === 2 &&
      !this._isRetroRendererActive() &&
      !this.replay?.isPlaying &&
      this.state !== GAME_STATES.PRE_RACE_MENU &&
      this.state !== GAME_STATES.RACE_RESULTS &&
      this.state !== GAME_STATES.PIT_STOP
    );
  }

  _syncPlayerCockpitHelmetVisibility() {
    if (!this.playerCar) return;
    const isCockpitAny =
      this.cameraModeIdx === 2 &&
      this.state !== GAME_STATES.PRE_RACE_MENU &&
      this.state !== GAME_STATES.RACE_RESULTS &&
      this.state !== GAME_STATES.PIT_STOP &&
      !this.replay?.isPlaying;
    this.playerCar.cameraIndex = this.cameraModeIdx;
    this.playerCar.isCockpitView = isCockpitAny;

    const rig = this.carRigs.get(this.playerCar.id);
    if (!rig || !rig.root) return;

    const hideHelmet = this._isLiveCockpit3DActive();
    if (!rig._cockpitHelmetNodes) {
      const helmetNodes = [];
      rig.root.traverse((node) => {
        if (!node || node === rig.root) return;
        const nm = String(node.name || '');
        const matNm = String(node.material?.name || '');
        const combined = `${nm} ${matNm}`;
        if (
          /driverhelmet|driver_helmet|helmet|visor|driverhead|driver_head/i.test(combined) &&
          !/halo|wheel|arm|glove|dash|mirror|wing|body|chassis|crew/i.test(combined)
        ) {
          helmetNodes.push(node);
        }
      });
      rig._cockpitHelmetNodes = helmetNodes;
    }

    for (let i = 0; i < rig._cockpitHelmetNodes.length; i++) {
      rig._cockpitHelmetNodes[i].visible = !hideHelmet;
    }
  }

  _computeNearGrandstandFactor(s) {
    if (!Number.isFinite(s)) return 0;
    const sw = ((s % TRACK_GAME_LENGTH) + TRACK_GAME_LENGTH) % TRACK_GAME_LENGTH;
    // Main Straight 3-block stadium tribune spans s in [912..1000] U [0..124]
    let best = 0;
    if (sw >= 912 || sw <= 124) {
      const dEdge = sw >= 912 ? Math.min(1, (sw - 912) / 28) : Math.min(1, (124 - sw) / 28);
      best = Math.max(best, 0.35 + 0.65 * dEdge);
    }
    const cornerStands = this.track?.trackDef?.cornerTribunes;
    if (Array.isArray(cornerStands)) {
      for (let i = 0; i < cornerStands.length; i++) {
        let ds = Math.abs(sw - cornerStands[i].s);
        if (ds > TRACK_GAME_LENGTH * 0.5) ds = TRACK_GAME_LENGTH - ds;
        if (ds < 46) {
          best = Math.max(best, 1.0 - ds / 46);
        }
      }
    }
    return Math.max(0, Math.min(1, best));
  }

  _switchActiveCircuit(trackId) {
    this.track.loadCircuit(trackId);
    this.effects.clearAllDebris();
    this.pitCrewDiorama.repositionForTrack(this.track);
    this._repositionPitCrewTeamRig();
    this.hud.refreshTrackMinimap();
  }

  _refreshShowroomLighting() {
    if (this.state !== GAME_STATES.PRE_RACE_MENU) return;
    const tDef = this.track.trackDef;
    let previewRegime = 'HOT_SUNNY';
    if (tDef.forceNight) {
      previewRegime = (this.config.weatherPreset === 'LIGHT_DRIZZLE' || this.config.weatherPreset === 'MONSOON_STORM')
        ? this.config.weatherPreset
        : 'NEON_NIGHT';
    } else if (this.config.weatherPreset && this.config.weatherPreset !== 'RANDOM' && WEATHER_REGIMES[this.config.weatherPreset]) {
      previewRegime = this.config.weatherPreset;
    } else if (tDef.theme === 'MONZA') {
      previewRegime = 'GOLDEN_SUNSET';
    }
    this.weather.configureForSession(this.config.mode, previewRegime, tDef);
  }

  toggleVisualStyle() {
    this.config.visualStyle = this.config.visualStyle === '2026_PBR' ? '1982_ARCADE' : '2026_PBR';
    this._applyVisualShaderStyle();
    this._syncMenuUI?.();
    this.hud.showCenterCallout(
      this.config.visualStyle === '1982_ARCADE' ? '1982 NAMCO RASTER CRT' : '2026 PRO SIM PBR',
      1100,
      '#38bdf8'
    );
  }

  _applyVisualShaderStyle() {
    const isArcade = this.config.visualStyle === '1982_ARCADE';
    document.body.classList.toggle('arcade-shader-active', isArcade);
    const shaderBtn = document.getElementById('btn-live-shader');
    if (shaderBtn) shaderBtn.textContent = isArcade ? 'CRT' : 'PBR';
  }

  _isRetroRendererActive() {
    return (
      this.config.visualStyle === '1982_ARCADE' &&
      this.state !== GAME_STATES.PRE_RACE_MENU &&
      !this.replay?.isPlaying &&
      !!this.playerCar
    );
  }

  _play1982FanfareIfArcade(kind) {
    const classic = this.config.mode === '1982_ORIGINAL' || this.config.visualStyle === '1982_ARCADE';
    if (!classic) return false;
    if (kind === 'QUALIFY') this.audio.play1982QualifyFanfare?.();
    else if (kind === 'RACE') this.audio.play1982RaceStartFanfare?.();
    else if (kind === 'CHECKERED') this.audio.play1982CheckeredFlagJingle?.();
    return true;
  }

  _cheerCrowd(intensity = 0.8) {
    const boost = Math.max(0.2, Math.min(1.0, Number(intensity) || 0.8));
    this.crowdExcitement = Math.min(1.0, Math.max(this.crowdExcitement, 0.35 + boost * 0.65));
    this.track?.triggerCrowdExcitement?.(boost);
    if (this.elapsedSec - this._lastCrowdCheerSec < 2.2) return;
    this._lastCrowdCheerSec = this.elapsedSec;
    if (typeof this.audio.playCrowdCheerSurge === 'function') {
      this.audio.playCrowdCheerSurge(boost);
    } else {
      this.audio.playCrowdCheer?.(boost);
    }
  }

  // --------------------------------------------------------------------------
  // SESSION LIFECYCLE & LOCKED PER-RACE RANDOM WEATHER
  // --------------------------------------------------------------------------
  _clearGridMeshes() {
    for (const rig of this.carRigs.values()) {
      this.scene.remove(rig.root);
    }
    this.carRigs.clear();
    this.allCars = [];
  }

  _spawnShowroomScene() {
    this._clearGridMeshes();
    this.state = GAME_STATES.PRE_RACE_MENU;
    this._userDraggedShowroom = false;
    this.showroomYawOffset = this._showroomOrbitAngle;
    this.showroomPitchOffset = 0.0;
    this._refreshShowroomLighting();

    // Calm GT7/F1 3D Showcase: spawn ONLY the #1 Hero F1 Car (zero chaotic AI fly-by traffic behind UI)
    this._buildCarsForSession(1, true, this.config.startingCompound);

    const hintChip = document.getElementById('orbit-hint-chip');
    if (hintChip) {
      hintChip.classList.remove('faded-out');
      if (this._orbitHintTimer) clearTimeout(this._orbitHintTimer);
      this._orbitHintTimer = setTimeout(() => {
        hintChip.classList.add('faded-out');
      }, 3200);
    }

    if (this.playerCar) {
      this.playerCar.s = 992.8;
      this.playerCar.lateralOffset = -1.6;
      this.playerCar.speedKmh = 0;
      this.playerCar.relYaw = -0.22;
      this.playerCar.steerAngleRad = -0.15;
      this.playerCar.steerInput = -0.30;
      this._snapCarPrevPose(this.playerCar);

      const pFr = this.track.sampleAt(this.playerCar.s, this.playerCar.lateralOffset);
      const { w: vpW, h: vpH } = this._getViewportSize();
      const aspect = vpW / vpH;
      const baseDist = 5.15;
      const radius = aspect < 0.60 ? baseDist * 1.42 : (aspect < 0.85 ? baseDist * 1.20 : baseDist);
      const lookY = aspect < 0.60 ? 0.24 : (aspect < 0.85 ? 0.40 : 0.62);
      const fwdYaw = Math.atan2(pFr.tangent.z, pFr.tangent.x);
      const camAng = fwdYaw + this.showroomYawOffset;

      this.camera.up.set(0, 1, 0);
      this._camLook
        .copy(pFr.pos)
        .addScaledVector(pFr.tangent, 1.05)
        .addScaledVector(pFr.right, -0.35);
      this._camLook.y += lookY;

      this.camera.position.set(
        pFr.pos.x + Math.cos(camAng) * radius,
        pFr.pos.y + (aspect < 0.85 ? 1.42 : 1.24),
        pFr.pos.z + Math.sin(camAng) * radius
      );
      this.camera.lookAt(this._camLook);
    }
    this._syncPlayerCockpitHelmetVisibility();
    this._syncScreenLayers();
  }

  returnToPreRaceMenu() {
    if (this.replay?.isPlaying) this._exitReplay();
    this.paused = false;
    const pm = document.getElementById('pause-modal');
    if (pm) pm.style.display = 'none';
    document.getElementById('dnq-modal').style.display = 'none';
    document.getElementById('podium-modal').style.display = 'none';
    if (this._speedVignetteEl) this._speedVignetteEl.style.opacity = '0';
    this.retro1982?.setVisible(false);
    document.body.classList.remove('retro-1982-active');
    this._spawnShowroomScene();
    this._renderCareerHub();
  }

  launchFromMenu() {
    if (this.replay?.isPlaying) this._exitReplay();
    this.paused = false;
    const pm = document.getElementById('pause-modal');
    if (pm) pm.style.display = 'none';
    this._setGarageOpen?.(false);
    this._setCareerOpen?.(false);
    this.controls.setHandedness(this.config.handedness);
    this.controls.setSteeringStyle(this.config.steeringStyle);
    this._applyControlSettings(false);
    this.hud.setModeVisibility(this.config.mode);
    this.hud.setSpeedUnit(this.prefs.speedUnit);
    this.replay.reset();

    // Roll ONE fixed weather regime for this entire race weekend (NEVER changes mid-race)
    this.lockedRaceWeatherId = this.weather.rollRegimeForRace(
      this.config.mode,
      this.config.weatherPreset,
      this.track.trackDef
    );

    // Career stint plan sets the dry starting compound for Championship rounds
    this._sessionStartCompound = this.config.startingCompound;
    const isDryCompound = (c) => c === 'SOFT' || c === 'MEDIUM' || c === 'HARD';
    if (this.config.mode === '2026_UPDATED' && this._careerRoundActive) {
      const mods = this.career.getPhysicsModifiers();
      if (isDryCompound(mods.startingCompound)) this._sessionStartCompound = mods.startingCompound;
    }

    // Smart Race Engineer auto-tire selection when RANDOM weather rolls rain in 2026 mode
    if (
      this.config.mode === '2026_UPDATED' &&
      this.config.weatherPreset === 'RANDOM' &&
      isDryCompound(this._sessionStartCompound)
    ) {
      if (this.lockedRaceWeatherId === 'MONSOON_STORM') {
        this._sessionStartCompound = 'FULL_WET';
      } else if (this.lockedRaceWeatherId === 'LIGHT_DRIZZLE') {
        this._sessionStartCompound = 'INTERMEDIATE';
      }
    }

    this.score = 0;
    this.qualifyingBonus = 0;
    this.qualifyingTime = null;
    this.passingBonus = 0;
    this.overtakesCount = 0;
    this.timeBonus = 0;
    this.distanceScoredMeters = 0;

    if (this.config.mode === '1982_ORIGINAL' || this.config.runQualifying2026) {
      this.startQualifyingSession();
    } else {
      this.qualifiedGridSlot = Math.min(5, this.config.gridSize);
      this.startGridLineup();
    }
  }

  _buildCarsForSession(totalCars, isShowroom = false, overrideCompound = null) {
    this._clearGridMeshes();
    const isClassic = this.config.mode === '1982_ORIGINAL';
    const lenCfg = PRO_2026_LENGTHS[this.config.raceLengthId] || PRO_2026_LENGTHS.SHORT;
    const startComp = isClassic ? 'SOFT' : (overrideCompound || this.config.startingCompound);
    const gbMode = this._activeGearboxMode();

    // Player #1 Formula 1 Car
    this.playerCar = createVehicleState({
      id: 'PLAYER',
      isPlayer: true,
      name: 'YOU (PHANATIC #1)',
      short: 'YOU',
      carNum: 1,
      s: isShowroom ? 992.8 : 0.4,
      lateralOffset: isShowroom ? -1.6 : -2.2,
      compound: startComp,
      gearboxMode: gbMode,
      fuelLaps: lenCfg.startingFuelMax,
      maxFuelLaps: 15.0,
    });
    this.playerCar.liveryHex = '#00ff88';
    this._snapCarPrevPose(this.playerCar);

    // Selected Career Works Team livery on the #1 car + pit crew diorama
    const team = this.career?.getSelectedTeam?.();
    const playerRig = new FormulaCarRig(this.assets, {
      primary: team?.livery?.primary ?? 0xe41c24,
      accent: team?.livery?.accent ?? 0xffffff,
      helmet: team?.livery?.helmet ?? 0x00f0ff,
      compound: startComp,
    });
    if (team) {
      playerRig.setLivery?.({ ...team.livery, compound: startComp });
      this.pitCrewDiorama?.setLivery?.(team.livery);
      this._initOrSyncPitCrewTeamRig(team.livery?.primary ?? team.primaryHex ?? 0xe41c24);
      this.playerCar.liveryHex = team.primaryHex;
      this.playerCar.teamName = team.shortName;
    }
    this.scene.add(playerRig.root);
    this.carRigs.set(this.playerCar.id, playerRig);
    this.allCars.push(this.playerCar);

    // Career Car R&D + Team Perks + Setup modifiers (2026 Sim GP)
    let playerMods = null;
    if (!isClassic && !isShowroom && this.career) {
      playerMods = this.career.getPhysicsModifiers();
      this.playerCar.perfMods = playerMods;
      const fuelMult = Number.isFinite(playerMods.fuelLoadMult) ? playerMods.fuelLoadMult : 1.0;
      this.playerCar.fuelLaps = Math.min(this.playerCar.maxFuelLaps, lenCfg.startingFuelMax * fuelMult);
    }

    // Competitive AI Constructor Tier + Player Career R&D Progression + AI Difficulty Scaling
    const rivalCount = isShowroom ? 0 : Math.max(1, totalCars - 1);
    const diff = this.aiDifficulty || 'PRO';
    const diffPower = diff === 'LEGEND' ? 0.022 : (diff === 'ROOKIE' ? -0.028 : 0.0);
    const diffTop = diff === 'LEGEND' ? 2.8 : (diff === 'ROOKIE' ? -3.8 : 0.0);
    const diffAero = diff === 'LEGEND' ? 0.025 : (diff === 'ROOKIE' ? -0.030 : 0.0);

    const dPower = Math.max(0, (Number(playerMods?.powerMult) || 1.0) - 1.0);
    const dTop = Math.max(0, Number(playerMods?.topSpeedBonusKmh) || 0.0);
    const dAero = Math.max(0, (Number(playerMods?.aeroGripMult) || 1.0) - 1.0);
    const dBrake = Math.max(0, (Number(playerMods?.brakeMult) || 1.0) - 1.0);
    const dAgil = Math.max(0, (Number(playerMods?.agilityMult) || 1.0) - 1.0);
    const dDrs = Math.max(0, Number(playerMods?.drsBonusKmh) || 0.0);

    for (let i = 0; i < rivalCount; i++) {
      const def = AI_DRIVER_ROSTER[i % AI_DRIVER_ROSTER.length];
      const aiComp = isClassic
        ? 'SOFT'
        : (this.weather.grooveMoisture > 0.55
          ? 'FULL_WET'
          : (this.weather.grooveMoisture > 0.20 ? 'INTERMEDIATE' : (i % 2 === 0 ? 'SOFT' : 'MEDIUM')));

      const aiCar = createVehicleState({
        id: `AI_${i + 1}`,
        isPlayer: false,
        name: `${def.name} #${def.num}`,
        short: def.short,
        carNum: def.num,
        s: (85 + i * (860 / rivalCount)) % TRACK_GAME_LENGTH,
        lateralOffset: (i % 2 === 0 ? -1 : 1) * 2.8,
        compound: aiComp,
        gearboxMode: 'AUTO_8SPD',
        fuelLaps: lenCfg.startingFuelMax + 0.5,
        maxFuelLaps: 15.0,
      });
      aiCar.liveryHex = `#${def.primary.toString(16).padStart(6, '0')}`;
      this.aiController.initAICar(aiCar, def, i);

      if (!isClassic) {
        // Constructor Tiers: Front-Row Works (0.99 / 0.97), Upper Midfield (0.91..0.86), Customer Midfield (0.81..0.72)
        const tierRdnScale = i === 0
          ? 0.99
          : (i === 1
            ? 0.97
            : (i < 5 ? 0.91 - (i - 2) * 0.025 : Math.max(0.72, 0.81 - (i - 5) * 0.025)));
        const baseTier = i === 0
          ? 1.0
          : (i === 1
            ? 0.86
            : (i < 5 ? 0.56 - (i - 2) * 0.14 : Math.max(-0.35, 0.12 - (i - 5) * 0.10)));

        aiCar.perfMods = {
          powerMult: Math.max(0.92, 1.0 + baseTier * 0.012 + dPower * tierRdnScale + diffPower),
          topSpeedBonusKmh: baseTier * 1.5 + dTop * tierRdnScale + diffTop,
          aeroGripMult: Math.max(0.94, 1.0 + baseTier * 0.015 + dAero * tierRdnScale + diffAero),
          brakeMult: Math.max(0.95, 1.0 + baseTier * 0.012 + dBrake * tierRdnScale + diffPower * 0.6),
          agilityMult: Math.max(0.96, 1.0 + baseTier * 0.008 + dAgil * tierRdnScale),
          drsBonusKmh: Math.max(0, 0.6 * Math.max(0, baseTier) + dDrs * tierRdnScale),
          tireWearMult: i < 2 ? 0.95 : 1.0,
        };
      }

      this._snapCarPrevPose(aiCar);

      const rig = new FormulaCarRig(this.assets, {
        primary: def.primary,
        accent: def.accent,
        helmet: def.helmet,
        compound: aiComp,
      });
      this.scene.add(rig.root);
      this.carRigs.set(aiCar.id, rig);
      this.allCars.push(aiCar);
    }
  }

  startQualifyingSession() {
    const totalCars = this.config.mode === '1982_ORIGINAL' ? 8 : this.config.gridSize;
    const startComp = this._sessionStartCompound || this.config.startingCompound;

    this.weather.configureForSession(this.config.mode, this.lockedRaceWeatherId, this.track.trackDef);
    this.raceSystems.resetForNewSession(startComp, 1, this._sessionCareerModifiers());
    this.track.setPuddles1982Mode(false);
    this.replay.reset();
    this.hud.resetSectorSplits?.();
    this._prevMacroSectorIdx = 0;
    this._macroSectorStartSec = 0;
    this.crowdExcitement = 0.35;
    this._camChaseYaw = null;
    this._camPrevSpeedKmh = 0;

    this._buildCarsForSession(totalCars, false, startComp);

    this.playerCar.s = 0.5;
    this.playerCar.totalDistanceGameM = 0.5;
    this.playerCar.currentLapTime = 0;
    this.playerCar.lateralOffset = -2.4;
    this.playerCar.lateralVel = 0;
    this.playerCar.relYaw = 0;
    this.playerCar.steerInput = 0;
    this.playerCar.steerAngleRad = 0;
    for (const c of this.allCars) this._snapCarPrevPose(c);

    this.state = GAME_STATES.QUALIFYING;
    this.masterTimerSec = CLASSIC_1982_RULES.qualifyingMasterTimer;
    this.countdownTimer = 3.2;
    this.lastBeepSecond = 4;
    this.controlsLocked = true;
    this.controls.setGearboxUI(this._activeGearboxMode(), 1);
    this._syncScreenLayers();

    this.hud.showCenterCallout('QUALIFYING — OUT LAP', 2400, '#ffd600');
    if (!this._play1982FanfareIfArcade('QUALIFY')) {
      this.audio.speakAnnouncement('Prepare to Qualify!', false, true);
    } else {
      setTimeout(() => this.audio.speakAnnouncement('Prepare to Qualify!', false, true), 1400);
    }
  }

  _sessionCareerModifiers() {
    if (this.config.mode !== '2026_UPDATED' || !this.career) return null;
    return this.career.getPhysicsModifiers();
  }

  _finishQualifyingLap() {
    const lapSec = this.playerCar.currentLapTime;
    this.qualifyingTime = lapSec;
    this.playerCar.bestLapTime = lapSec;

    let matched = null;
    for (const row of QUALIFYING_RANK_A_TABLE) {
      if (lapSec <= row.maxTime) {
        matched = row;
        break;
      }
    }

    if (!matched && this.config.mode === '1982_ORIGINAL') {
      this.controlsLocked = true;
      const modal = document.getElementById('dnq-modal');
      const msg = document.getElementById('dnq-detail');
      if (msg) {
        msg.textContent = `Lap Time ${formatLapTimeArcade(lapSec)} exceeded the 73"00 Rank A cutoff!`;
      }
      if (modal) modal.style.display = 'flex';
      return;
    }

    if (matched) {
      this.qualifiedGridSlot = Math.min(matched.pos, this.allCars.length);
      this.qualifyingBonus = matched.bonus;
    } else {
      this.qualifiedGridSlot = this.allCars.length;
      this.qualifyingBonus = 0;
    }

    this.score += this.qualifyingBonus;
    this._checkTopScore();

    const isSim = this.config.mode === '2026_UPDATED';
    this.hud.showCenterCallout(
      isSim
        ? `QUALIFIED P${this.qualifiedGridSlot} • ${formatLapTimeSim(lapSec)}`
        : `QUALIFIED ${ordinalSuffix(this.qualifiedGridSlot)}! +${this.qualifyingBonus} PTS`,
      2400,
      '#10b981'
    );
    this.startGridLineup();
  }

  startGridLineup() {
    const totalCars = this.config.mode === '1982_ORIGINAL' ? 8 : this.config.gridSize;
    const totalLaps = this._activeTotalLaps();
    const startComp = this._sessionStartCompound || this.config.startingCompound;

    this.weather.configureForSession(this.config.mode, this.lockedRaceWeatherId, this.track.trackDef);
    this.raceSystems.resetForNewSession(startComp, totalLaps, this._sessionCareerModifiers());
    this.track.setPuddles1982Mode(this.config.mode === '1982_ORIGINAL');
    this.replay.reset();
    this.hud.resetSectorSplits?.();
    this.hud.syncBoxButtonState();
    this._prevMacroSectorIdx = 2;
    this._macroSectorStartSec = 0;
    this.crowdExcitement = 0.55;
    this._camChaseYaw = null;
    this._camPrevSpeedKmh = 0;

    this._buildCarsForSession(totalCars, false, startComp);

    const rivals = this.allCars.filter((c) => !c.isPlayer);
    const gridOrder = [];
    let rIdx = 0;
    for (let slot = 1; slot <= totalCars; slot++) {
      if (slot === this.qualifiedGridSlot) {
        gridOrder.push(this.playerCar);
      } else {
        gridOrder.push(rivals[rIdx++]);
      }
    }

    gridOrder.forEach((car, idx) => {
      const sBack = 3.2 + idx * 2.1;
      car.s = TRACK_GAME_LENGTH - sBack;
      car.totalDistanceGameM = -sBack;
      car.lap = 1;
      car.currentLapTime = 0;
      car.lateralOffset = idx % 2 === 0 ? -2.8 : 2.8;
      car.lateralVel = 0;
      car.relYaw = 0;
      car.steerInput = 0;
      car.steerAngleRad = 0;
      car.speedKmh = 0;
      car.gear = 1;
      car._wasAheadOfPlayer = idx < this.qualifiedGridSlot - 1;
      if (!car.isPlayer) {
        car.aiTargetLat = car.lateralOffset;
      }
      this._snapCarPrevPose(car);
    });

    this.distanceScoredMeters = 0;
    this.sessionElapsedSec = 0;
    this.masterTimerSec = CLASSIC_1982_RULES.initialRaceTimer;
    this.countdownTimer = 4.0;
    this.lastBeepSecond = 5;
    this._prevLightsLit = 0;
    this.controlsLocked = true;
    this.state = GAME_STATES.GRID_LINEUP;
    this.controls.setGearboxUI(this._activeGearboxMode(), 1);
    this._syncScreenLayers();

    const reg = WEATHER_REGIMES[this.lockedRaceWeatherId] || WEATHER_REGIMES.HOT_SUNNY;
    const isSim = this.config.mode === '2026_UPDATED';
    const fmtLap = isSim ? formatLapTimeSim : formatLapTimeArcade;
    const cleanRegLabel = String(reg.label || '').toUpperCase();
    const qText = this.qualifyingTime
      ? `GRID P${this.qualifiedGridSlot} • ${fmtLap(this.qualifyingTime)}`
      : `GRID P${this.qualifiedGridSlot} • ${cleanRegLabel}`;
    this.hud.showCenterCallout(qText, 2800, '#38bdf8');
    this._play1982FanfareIfArcade('RACE');

    if (this.config.mode === '2026_UPDATED' && (startComp === 'INTERMEDIATE' || startComp === 'FULL_WET') && startComp !== this.config.startingCompound) {
      this.hud.showEngineerRadio(`Wet track conditions — fitted ${startComp.replace('_', ' ')} tires for launch.`);
    } else if (this.config.mode === '2026_UPDATED' && this._careerRoundActive) {
      const round = this.career.getCurrentRound();
      this.hud.showEngineerRadio(`Round ${round?.round || 1} — ${round?.gpTitle || 'Grand Prix'}. Starting on ${startComp}. Clean getaway into Turn 1.`);
    }
  }

  _beginGreenFlagRacing() {
    this.controlsLocked = false;
    this.state = GAME_STATES.RACING;
    this.track.setGantryLights(0, true, false);
    this.audio.playStartBeep(true);
    this.hud.showCenterCallout('LIGHTS OUT AND AWAY WE GO!', 1500, '#10b981');
    setTimeout(() => {
      if (this.state === GAME_STATES.RACING) {
        this.track.setGantryLights(0, false, false);
      }
    }, 3000);
  }

  _completeGrandPrix(expired1982Timer = false) {
    this.state = GAME_STATES.RACE_RESULTS;
    this.controlsLocked = true;
    if (this._speedVignetteEl) this._speedVignetteEl.style.opacity = '0';

    const totalLaps = this._activeTotalLaps();
    const standings = this._computeStandings();
    const playerRank = standings.findIndex((c) => c.isPlayer) + 1;

    if (!expired1982Timer) {
      if (this.config.mode === '1982_ORIGINAL') {
        this.timeBonus = Math.floor(Math.max(0, this.masterTimerSec)) * CLASSIC_1982_RULES.pointsPerRemainingSec;
      } else {
        const f1Pts = [10000, 7200, 6000, 4800, 4000, 3200, 2400, 1600];
        this.timeBonus = f1Pts[playerRank - 1] || 800;
      }
      this.score += this.timeBonus;
    } else {
      this.timeBonus = 0;
    }

    this._checkTopScore();

    // Award FIA Championship points + R&D prize purse for Career rounds
    this._lastCareerResult = null;
    if (this._careerRoundActive && this.config.mode === '2026_UPDATED' && !expired1982Timer && this.career) {
      try {
        const bestAi = standings
          .filter((c) => !c.isPlayer && Number.isFinite(c.bestLapTime) && c.bestLapTime > 0)
          .reduce((m, c) => Math.min(m, c.bestLapTime), Infinity);
        const pBest = this.playerCar.bestLapTime;
        const cleanRace =
          (this.playerCar.timePenaltiesSec || 0) <= 0 &&
          (this.playerCar.damage?.frontWing || 0) < 0.25 &&
          (this.playerCar.damage?.rearWing || 0) < 0.25 &&
          (this.playerCar.damage?.suspension || 0) < 0.25;
        this._lastCareerResult = this.career.recordRaceWeekendResult({
          trackId: this.config.trackId,
          finishPos: playerRank,
          gridPos: this.qualifiedGridSlot,
          fastestLap: !!(pBest && pBest > 0 && pBest <= bestAi),
          overtakes: this.overtakesCount,
          cleanRace,
          pitStops: this.playerCar.pitStopsCompleted || 0,
          arcadeScore: Math.floor(this.score),
          standings: standings.map((c) => ({
            id: c.id, name: c.name, short: c.short, isPlayer: c.isPlayer, bestLapTime: c.bestLapTime,
          })),
        });
      } catch (err) {
        console.warn('[Career] Failed to record race result:', err);
      }
    }

    this._populatePodiumModal(standings, playerRank, totalLaps, expired1982Timer);

    const played1982 = !expired1982Timer && this._play1982FanfareIfArcade('CHECKERED');
    if (!expired1982Timer && playerRank <= 3) {
      this._cheerCrowd(playerRank === 1 ? 1.0 : 0.75);
    }
    const announceDelay = played1982 ? 1600 : 0;
    setTimeout(() => {
      if (playerRank === 1 && !expired1982Timer) {
        this.audio.speakAnnouncement('Checkered flag! P 1! Grand Prix Victory!', true, true);
      } else if (expired1982Timer) {
        this.audio.speakAnnouncement('Time expired! Game Over.', false, true);
      } else {
        this.audio.speakAnnouncement(`Checkered flag! Finished ${ordinalSuffix(playerRank)}.`, true, true);
      }
    }, announceDelay);
  }

  _populatePodiumModal(standings, playerRank, totalLaps, expired) {
    const modal = document.getElementById('podium-modal');
    if (!modal) return;

    const reg = WEATHER_REGIMES[this.lockedRaceWeatherId] || WEATHER_REGIMES.HOT_SUNNY;
    const isSim = this.config.mode === '2026_UPDATED';
    const fmtLap = isSim ? formatLapTimeSim : formatLapTimeArcade;

    const kickerEl = document.getElementById('podium-circuit-kicker');
    if (kickerEl) {
      kickerEl.textContent = `${this.track.trackDef.name} • ${String(reg.label || '').toUpperCase()} • OFFICIAL CLASSIFICATION`;
    }

    const titleEl = document.getElementById('podium-headline');
    if (titleEl) {
      titleEl.textContent = expired
        ? 'TIME EXPIRED — SESSION OVER'
        : `CLASSIFIED P${playerRank} — ${ordinalSuffix(playerRank)} PLACE`;
    }

    const podiumIds = ['podium-p1', 'podium-p2', 'podium-p3'];
    podiumIds.forEach((id, idx) => {
      const el = document.getElementById(id);
      const car = standings[idx];
      if (el && car) {
        const medal = idx === 0 ? 'P1 • 1ST' : (idx === 1 ? 'P2 • 2ND' : 'P3 • 3RD');
        el.innerHTML = `
          <div class="pod-rank">${medal}</div>
          <div class="pod-livery-bar" style="background:${car.isPlayer ? (this.playerCar.liveryHex || '#e41c24') : (car.liveryHex || '#ff9800')}"></div>
          <div class="pod-driver" style="color:${car.isPlayer ? '#10b981' : '#ffffff'}">${car.name}</div>
          <div class="pod-meta">${car.bestLapTime ? 'BEST ' + fmtLap(car.bestLapTime) : 'CLASSIFIED'}</div>
        `;
      }
    });

    const setTxt = (id, val) => {
      const e = document.getElementById(id);
      if (e) e.textContent = val;
    };
    setTxt('res-total-score', Math.floor(this.score).toLocaleString());
    setTxt('res-quali-bonus', `+${this.qualifyingBonus.toLocaleString()} (P${this.qualifiedGridSlot})`);
    setTxt('res-pass-bonus', `+${this.passingBonus.toLocaleString()} (${this.overtakesCount} PASSES)`);
    setTxt('res-time-bonus', `+${this.timeBonus.toLocaleString()}`);
    setTxt('res-fastest-lap', fmtLap(this.playerCar.bestLapTime));
    setTxt(
      'res-penalties',
      this.playerCar.timePenaltiesSec > 0 ? `+${this.playerCar.timePenaltiesSec.toFixed(1)}s` : 'NONE (0.0s)'
    );

    const stintEl = document.getElementById('res-pit-stints');
    if (stintEl) {
      if (this.config.mode === '1982_ORIGINAL') {
        stintEl.textContent = `1982 Classic Rules • Weather: ${reg.label}`;
      } else if (this.playerCar.pitHistory.length === 0) {
        stintEl.textContent = `0 Stops (${this.playerCar.compound} Stint) • Weather: ${reg.label}`;
      } else {
        const stopsTxt = this.playerCar.pitHistory
          .map((p, i) => `Stop ${i + 1} (L${p.lap}): ${p.compound} in ${p.durationSec}s${p.stickyError ? ' [Sticky Gun]' : ''}`)
          .join(' • ');
        stintEl.textContent = `${stopsTxt} • ${reg.label}`;
      }
    }

    // Career Championship reward banner
    const banner = document.getElementById('podium-career-banner');
    const cr = this._lastCareerResult;
    if (banner) {
      if (cr) {
        const sponsorChips = Array.isArray(cr.sponsorBonuses) && cr.sponsorBonuses.length > 0
          ? cr.sponsorBonuses.map((sb) => {
              if (typeof sb === 'string') return `<span class="pcb-chip cash">${escapeHtml(sb)}</span>`;
              const lbl = sb?.label || sb?.title || sb?.name || 'SPONSOR BONUS';
              const amt = sb?.bonus ?? sb?.payout ?? sb?.amount ?? 0;
              const amtStr = amt > 0 ? ` +${escapeHtml(formatCredits(amt))}` : '';
              return `<span class="pcb-chip cash">${escapeHtml(lbl)}${amtStr}</span>`;
            }).join('')
          : '';
        const finale = cr.seasonCompleted
          ? `<div class="pcb-finale">${escapeHtml(cr.seasonFinaleBanner || (cr.crownedWorldChampion ? 'WORLD CHAMPION' : 'SEASON COMPLETE'))}</div>`
          : '';
        banner.innerHTML = `
          <div class="pcb-kicker">${escapeHtml(cr.roundTitle || cr.gpTitle || 'CHAMPIONSHIP ROUND')} • ROUND ${cr.roundNumber}/${cr.totalRounds}</div>
          <div class="pcb-row">
            <span class="pcb-chip pts">+${cr.pointsEarned} FIA PTS</span>
            <span class="pcb-chip cash">+${escapeHtml(formatCredits(cr.totalPayout ?? cr.prizeMoney))} R&amp;D</span>
            <span class="pcb-chip rank">CHAMPIONSHIP P${cr.playerChampionshipRank} • ${cr.playerSeasonPoints} PTS</span>
            ${cr.gotPole ? '<span class="pcb-chip">POLE +</span>' : ''}
            ${cr.gotFastestLap ? '<span class="pcb-chip">FASTEST LAP +</span>' : ''}
            ${sponsorChips}
          </div>
          ${finale}`;
        banner.style.display = 'block';
      } else {
        banner.innerHTML = '';
        banner.style.display = 'none';
      }
    }
    const againLbl = document.getElementById('podium-again-label');
    if (againLbl) {
      if (cr && cr.nextRound) {
        againLbl.textContent = `NEXT: R${cr.nextRound.round || ''} ${String(cr.nextRound.venue || cr.nextRound.gpTitle || '').toUpperCase()}`;
      } else if (this._careerRoundActive) {
        againLbl.textContent = 'NEXT CHAMPIONSHIP ROUND';
      } else {
        againLbl.textContent = 'RACE AGAIN';
      }
    }
    const replayBtn = document.getElementById('btn-podium-replay');
    if (replayBtn) replayBtn.disabled = !this.replay.hasFrames();
    this._syncCareerBadges();

    modal.style.display = 'flex';
  }

  _syncScreenLayers() {
    const inMenu = this.state === GAME_STATES.PRE_RACE_MENU;
    const menuEl = document.getElementById('pre-race-menu');
    const hudEl = document.getElementById('race-hud');
    const ctrlEl = document.getElementById('mobile-controls-layer');

    if (menuEl) menuEl.style.display = inMenu ? 'flex' : 'none';
    if (hudEl) hudEl.style.display = inMenu ? 'none' : 'block';
    if (ctrlEl) ctrlEl.style.display = inMenu ? 'none' : 'block';
    document.body.classList.toggle('in-showroom', inMenu);
  }

  _handleClutchTap() {
    if (this.playerCar && this.playerCar.inPitLane && this.playerCar.pitPhase === 'STOPPED') {
      const res = this.raceSystems.attemptClutchRelease(this.playerCar);
      if (res === 'PERFECT') {
        this.audio.playStartBeep(true);
        this.hud.showCenterCallout('⚡ OPTIMAL CLUTCH! -0.35s!', 1200, '#00ff88');
      } else if (res === 'GOOD') {
        this.audio.playStartBeep(false);
        this.hud.showCenterCallout('CLEAN CLUTCH! -0.15s', 1000, '#ffd600');
      } else if (res === 'MISS') {
        this.audio.playYellowFlagChime();
      }
    }
  }

  _checkTopScore() {
    if (this.score > this.topScore) {
      this.topScore = Math.floor(this.score);
      try {
        localStorage.setItem('rp_f1_top_score', String(this.topScore));
      } catch (_) {}
    }
  }

  _computeStandings() {
    return [...this.allCars].sort((a, b) => {
      const effA = a.totalDistanceGameM - (a.timePenaltiesSec || 0) * 1.6;
      const effB = b.totalDistanceGameM - (b.timePenaltiesSec || 0) * 1.6;
      return effB - effA;
    });
  }

  // --------------------------------------------------------------------------
  // 240HZ RENDER-ALPHA POSE SNAPSHOT & INTERPOLATION (ZERO SUBSTEP ALIASING)
  // --------------------------------------------------------------------------
  _snapCarPrevPose(car) {
    if (!car) return;
    car._prevS = car.s;
    car._prevLat = car.lateralOffset;
    car._prevRelYaw = car.relYaw || 0;
    car._prevPitch = Number.isFinite(car.chassisPitchRad) ? car.chassisPitchRad : 0;
    car._prevRoll = Number.isFinite(car.chassisRollRad) ? car.chassisRollRad : 0;
    const wc = car.wheelCompression;
    car._prevHeave = Array.isArray(wc) && wc.length >= 4
      ? 0.25 * ((Number(wc[0]) || 0) + (Number(wc[1]) || 0) + (Number(wc[2]) || 0) + (Number(wc[3]) || 0))
      : 0;
  }

  _getInterpolatedCarPose(car, alpha, out) {
    const target = out || this._poseScratch;
    if (!car) return target;
    const a = Number.isFinite(alpha) ? Math.max(0.0, Math.min(1.0, alpha)) : 1.0;

    const prevS = Number.isFinite(car._prevS) ? car._prevS : car.s;
    let ds = car.s - prevS;
    if (ds < -TRACK_GAME_LENGTH * 0.5) ds += TRACK_GAME_LENGTH;
    else if (ds > TRACK_GAME_LENGTH * 0.5) ds -= TRACK_GAME_LENGTH;
    let sInterp = (prevS + ds * a) % TRACK_GAME_LENGTH;
    if (sInterp < 0) sInterp += TRACK_GAME_LENGTH;

    const prevLat = Number.isFinite(car._prevLat) ? car._prevLat : car.lateralOffset;
    const curYaw = car.relYaw || 0;
    const prevYaw = Number.isFinite(car._prevRelYaw) ? car._prevRelYaw : curYaw;
    let dYaw = curYaw - prevYaw;
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    else if (dYaw < -Math.PI) dYaw += Math.PI * 2;

    const curPitch = Number.isFinite(car.chassisPitchRad) ? car.chassisPitchRad : 0;
    const prevPitch = Number.isFinite(car._prevPitch) ? car._prevPitch : curPitch;
    const curRoll = Number.isFinite(car.chassisRollRad) ? car.chassisRollRad : 0;
    const prevRoll = Number.isFinite(car._prevRoll) ? car._prevRoll : curRoll;

    const wc = car.wheelCompression;
    const curHeave = Array.isArray(wc) && wc.length >= 4
      ? 0.25 * ((Number(wc[0]) || 0) + (Number(wc[1]) || 0) + (Number(wc[2]) || 0) + (Number(wc[3]) || 0))
      : 0;
    const prevHeave = Number.isFinite(car._prevHeave) ? car._prevHeave : curHeave;

    target.s = sInterp;
    target.lat = prevLat + (car.lateralOffset - prevLat) * a;
    target.relYaw = prevYaw + dYaw * a;
    target.pitch = prevPitch + (curPitch - prevPitch) * a;
    target.roll = prevRoll + (curRoll - prevRoll) * a;
    target.heave = prevHeave + (curHeave - prevHeave) * a;
    return target;
  }

  // --------------------------------------------------------------------------
  // MASTER 60+ FPS RENDER & DECOUPLED 240HZ PHYSICS STEPPER
  // --------------------------------------------------------------------------
  _frameLoop(nowMs) {
    requestAnimationFrame((ts) => this._frameLoop(ts));

    const rawDt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastFrameMs) * 0.001));
    this.lastFrameMs = nowMs;
    this.elapsedSec += rawDt;

    const inReplay = !!this.replay?.isPlaying;
    const simFrozen = this.paused || inReplay;

    // 1. Poll Mobile Multi-Touch + Keyboard + Gamepad Controls (controls.update runs SAT feedback once)
    this.controls.update(rawDt, this.playerCar);
    if (this.playerCar && this.state !== GAME_STATES.PRE_RACE_MENU && !simFrozen) {
      this.playerCar.steerInput = this.controls.steer;
      this.playerCar.throttleInput = this.controls.throttle;
      this.playerCar.brakeInput = this.controls.brake;
    }

    if (!simFrozen) {
      // 2. Countdown Sequence Handling (QUALIFYING & GRID_LINEUP)
      if (this.state === GAME_STATES.QUALIFYING && this.controlsLocked && document.getElementById('dnq-modal')?.style.display !== 'flex') {
        this.countdownTimer -= rawDt;
        const whole = Math.ceil(this.countdownTimer);
        if (whole > 0 && whole < this.lastBeepSecond) {
          this.lastBeepSecond = whole;
          this.track.setGantryLights(4 - whole, false, false);
          this.audio.playStartBeep(false);
          this.hud.showCenterCallout(String(whole), 700, '#ef4444');
        }
        if (this.countdownTimer <= 0) {
          this.controlsLocked = false;
          this.track.setGantryLights(0, true, false);
          this.audio.playStartBeep(true);
          this.hud.showCenterCallout('GREEN TRACK — FLYING LAP', 1400, '#10b981');
        }
      } else if (this.state === GAME_STATES.GRID_LINEUP) {
        this.countdownTimer -= rawDt;
        const lightsLit = Math.min(5, Math.max(1, Math.ceil(4.0 - this.countdownTimer)));
        if (lightsLit !== this._prevLightsLit && this.countdownTimer > 0.2) {
          this._prevLightsLit = lightsLit;
          this.track.setGantryLights(lightsLit, false, false);
          this.audio.playStartBeep(false);
        }
        if (this.countdownTimer <= 0) {
          this._prevLightsLit = 0;
          this._beginGreenFlagRacing();
        }
      }

      // 3. Decoupled 240Hz Physics Sub-Stepping
      if (this.state !== GAME_STATES.PRE_RACE_MENU && this.state !== GAME_STATES.RACE_RESULTS) {
        this.physicsAccumulator += rawDt;
        let subSteps = 0;
        while (this.physicsAccumulator >= PHYSICS_DT && subSteps < 14) {
          this._stepSimulation240Hz(PHYSICS_DT);
          this.physicsAccumulator -= PHYSICS_DT;
          subSteps++;
        }
      } else {
        this.physicsAccumulator = 0;
      }

      // 3b. 60Hz Instant Replay Recorder (Qualifying, Grid & Race)
      const recording =
        this.state === GAME_STATES.QUALIFYING ||
        this.state === GAME_STATES.GRID_LINEUP ||
        this.state === GAME_STATES.RACING ||
        this.state === GAME_STATES.PIT_STOP;
      if (recording && this.playerCar) {
        this.replay.recordSnapshot(rawDt, {
          allCars: this.allCars,
          sessionElapsedSec: this.sessionElapsedSec,
          currentLap: this.playerCar.lap,
          totalLaps: this._activeTotalLaps(),
          score: this.score,
          weatherMoisture: this.weather.grooveMoisture,
        });
      }
    } else {
      this.physicsAccumulator = 0;
    }

    const renderAlpha =
      simFrozen || this.state === GAME_STATES.PRE_RACE_MENU || this.state === GAME_STATES.RACE_RESULTS
        ? 1.0
        : Math.max(0.0, Math.min(1.0, this.physicsAccumulator / PHYSICS_DT));

    // 4. CAMERA FIRST (live 5-camera sim director or TV replay director) so sky dome / weather / shadows
    //    are positioned from THIS frame's interpolated camera — zero 1-frame lag or substep jitter.
    this._syncPlayerCockpitHelmetVisibility();
    let replayState = null;
    if (inReplay) {
      replayState = this.replay.updatePlayback(rawDt, {
        track: this.track,
        camera: this.camera,
        carRigs: this.carRigs,
        moisture: this.weather.grooveMoisture,
        elapsedSec: this.elapsedSec,
        callbacks: {
          onFlyby: (spd) => this.audio.playReplayFlyby?.(spd),
        },
      });
      this._updateReplayOverlay(replayState);
    } else {
      this._updateCameraDirector(rawDt, renderAlpha);
    }

    // 5. Focus Shadow Target, Weather, Cockpit Visor Rain, Track Shaders, Marshal Flags, Pit Crew & VFX
    let focusPos = this.camera.position;
    if (inReplay && replayState?.focusWorldPos) {
      focusPos = replayState.focusWorldPos;
    } else if (this.playerCar) {
      const pPose = this._getInterpolatedCarPose(this.playerCar, renderAlpha, this._camPoseScratch);
      focusPos = this.track.sampleAt(pPose.s, pPose.lat).pos;
    }

    this.weather.update(rawDt, this.camera.position, focusPos, this.config.visualStyle, {
      onThunder: () => this.audio.playThunderRumble(),
    });
    const isCockpit3D = this._isLiveCockpit3DActive();
    this.weather.updateCockpitVisorRain?.(
      this.camera,
      isCockpit3D,
      this.playerCar?.speedKmh || 0,
      rawDt
    );

    this.track.updateVisualState(this.weather.grooveMoisture, this.config.visualStyle, this.elapsedSec);
    this.track.updateMarshalFlags(
      this.raceSystems.getActiveYellowSectorSet(),
      this.raceSystems.vscActive,
      this.elapsedSec
    );

    const playerServicing = !!(this.playerCar && this.playerCar.inPitLane && this.playerCar.pitPhase === 'STOPPED');
    if (!simFrozen) {
      if (playerServicing && this.state === GAME_STATES.RACING) {
        this.state = GAME_STATES.PIT_STOP;
        this._pitWheelGunSoundAccum = 0;
        this._pitJackDropPlayed = false;
      } else if (!playerServicing && this.state === GAME_STATES.PIT_STOP) {
        this.state = GAME_STATES.RACING;
        this._pitWheelGunSoundAccum = 0;
        this._pitJackDropPlayed = false;
      }
    }

    const pitProgress = playerServicing && this.playerCar.pitStopTotalDuration > 0
      ? Math.max(0, Math.min(1, 1 - this.playerCar.pitStopTimer / this.playerCar.pitStopTotalDuration))
      : 0;
    const pitSubPhase = playerServicing
      ? (this.playerCar.pitServiceSubPhase || this.raceSystems.getPitServiceSubPhase?.(this.playerCar) || '')
      : '';
    if (playerServicing && !simFrozen && !inReplay) {
      if (pitProgress >= 0.14 && pitProgress <= 0.80) {
        this._pitWheelGunSoundAccum += rawDt;
        if (this._pitWheelGunSoundAccum >= 0.38) {
          this._pitWheelGunSoundAccum = 0;
          if (typeof this.audio.playPitWheelGunBurst === 'function') {
            this.audio.playPitWheelGunBurst();
          } else {
            this.audio.playWheelGunWhir?.();
          }
        }
      }
      if (pitProgress >= 0.84 && !this._pitJackDropPlayed) {
        this._pitJackDropPlayed = true;
        this.audio.playPitJackDrop?.();
      }
    }
    this.pitCrewDiorama.update(playerServicing && !inReplay, pitProgress, this.elapsedSec);
    if (this._pitCrewTeamRig) {
      const pitRigState = {
        active: playerServicing && !inReplay,
        progress: pitProgress,
        subPhase: pitSubPhase,
        elapsedSec: this.elapsedSec,
        car: this.playerCar,
      };
      if (typeof ModelsModule.updatePitCrewTeamRig === 'function') {
        ModelsModule.updatePitCrewTeamRig(this._pitCrewTeamRig, pitRigState, rawDt);
      } else if (typeof this._pitCrewTeamRig.update === 'function') {
        this._pitCrewTeamRig.update(playerServicing && !inReplay, pitProgress, this.elapsedSec);
      }
    }
    if (!this.paused) this.effects.update(rawDt);

    // 6. Sync All 3D Car Rigs with 240Hz Render-Alpha Pose Interpolation & Suspension Pitch/Roll/Heave
    if (!inReplay) {
      const rigDt = this.paused ? 0 : rawDt;
      for (const car of this.allCars) {
        const rig = this.carRigs.get(car.id);
        if (!rig) continue;
        rig.root.visible = !car.exploded;

        const pose = this._getInterpolatedCarPose(car, renderAlpha, this._poseScratch);
        const fr = this.track.sampleAt(pose.s, pose.lat);
        const savedRelYaw = car.relYaw;
        car.relYaw = pose.relYaw;
        rig.updateTransformAndVFX(car, fr, this.weather.grooveMoisture, rigDt, this.elapsedSec);
        car.relYaw = savedRelYaw;

        if (rig.chassisTiltGroup) {
          rig.chassisTiltGroup.rotation.x = pose.pitch + (car.pitJackLift || 0) * 0.042;
          rig.chassisTiltGroup.rotation.z = pose.roll;
        }
        if (Array.isArray(car.wheelCompression) && Array.isArray(rig.wheels)) {
          for (let wi = 0; wi < rig.wheels.length && wi < 4; wi++) {
            const wObj = rig.wheels[wi];
            if (!wObj?.steerPivot) continue;
            if (wObj.baseSteerY === undefined) wObj.baseSteerY = wObj.steerPivot.position.y;
            const compM = Math.max(-0.04, Math.min(0.055, Number(car.wheelCompression[wi]) || 0));
            wObj.steerPivot.position.y = wObj.baseSteerY + compM;
          }
        }

        if (!this.paused && car.skidIntensity > 0.42 && car.speedKmh > 40 && !car.exploded && Math.random() < 0.45) {
          const yaw = Math.atan2(fr.tangent.z, fr.tangent.x) + pose.relYaw;
          this.track.addSkidmark(fr.pos, yaw);
        }
      }
      this._syncPlayerCockpitHelmetVisibility();
    }

    // 7. Keep fake neon speed vignette permanently off; update Stadium Crowd Doppler & Cockpit Audio
    if (this._speedVignetteEl && this._speedVignetteEl.style.opacity !== '0') {
      this._speedVignetteEl.style.opacity = '0';
    }

    const inShowroom = this.state === GAME_STATES.PRE_RACE_MENU;
    const activePlay =
      (this.state === GAME_STATES.QUALIFYING || this.state === GAME_STATES.RACING || this.state === GAME_STATES.PIT_STOP) &&
      !this.controlsLocked && !simFrozen;
    const retroActive = this._isRetroRendererActive();
    const isCockpitAudio =
      this.cameraModeIdx === 2 &&
      !inShowroom &&
      !inReplay &&
      this.state !== GAME_STATES.RACE_RESULTS &&
      this.state !== GAME_STATES.PIT_STOP;

    if (!simFrozen && !inShowroom && this.playerCar) {
      const nearGrandstand = this._computeNearGrandstandFactor(this.playerCar.s);
      if (this.playerCar.speedKmh > 296 && nearGrandstand > 0.65 && this.elapsedSec - this._lastDrsCrowdBlastSec > 7.5) {
        this._lastDrsCrowdBlastSec = this.elapsedSec;
        this.crowdExcitement = Math.min(1.0, Math.max(this.crowdExcitement, 0.78));
        this.track?.triggerCrowdExcitement?.(0.55);
      } else {
        const targetBaseline = this.state === GAME_STATES.GRID_LINEUP ? 0.55 : (0.24 + Math.min(0.28, (this.playerCar.speedKmh / 330) * 0.28));
        this.crowdExcitement += (targetBaseline - this.crowdExcitement) * (1.0 - Math.exp(-0.55 * rawDt));
      }
      this.audio.updateCrowdAmbience?.(this.playerCar.speedKmh, nearGrandstand, this.crowdExcitement);
    }

    this.audio.updateContinuous(
      this.playerCar || { rpm: 0 },
      this.config.mode === '1982_ORIGINAL' ? 0 : this.weather.grooveMoisture,
      activePlay || (this.state === GAME_STATES.GRID_LINEUP && !simFrozen),
      this.config.visualStyle,
      inShowroom || simFrozen,
      isCockpitAudio
    );

    let playerPos = 1;
    if (!inShowroom && this.playerCar) {
      const standings = this._computeStandings();
      playerPos = standings.findIndex((c) => c.isPlayer) + 1;
      const isClassic = this.config.mode === '1982_ORIGINAL';

      if (!inReplay) {
        this.hud.update({
          gameMode: this.config.mode,
          sessionPhase: this.state,
          score: this.score,
          topScore: this.topScore,
          timerDisplaySec: (this.state === GAME_STATES.QUALIFYING || isClassic)
            ? this.masterTimerSec
            : this.sessionElapsedSec,
          timerLabel: this.state === GAME_STATES.QUALIFYING
            ? 'QUALI TIME'
            : (isClassic ? 'TIME LEFT' : 'LAP TIME'),
          currentLap: this.playerCar.lap,
          totalLaps: this._activeTotalLaps(),
          playerPos,
          totalCars: this.allCars.length,
          playerCar: this.playerCar,
          allCars: this.allCars,
          weatherSummary: this.weather.getForecastSummary(),
          brakingAssistMode: this.prefs.control.brakingAssist || 'MIN',
        });
      }
    }

    // 8. Render: 1:1 1982 Namco raster renderer, or Crisp MSAA ACESFilmic Direct WebGL2 Renderer (ZERO Bloom)
    if (retroActive !== this.retro1982.isVisible()) {
      this.retro1982.setVisible(retroActive);
    }
    document.body.classList.toggle('retro-1982-active', retroActive);

    if (retroActive) {
      const isClassic = this.config.mode === '1982_ORIGINAL';
      const calloutEl = this.hud.centerCalloutEl;
      const calloutTxt = calloutEl && calloutEl.classList.contains('visible')
        ? String(calloutEl.textContent || '').replace(/[^\x20-\x7E]/g, '').trim().toUpperCase()
        : '';
      let gantryLit = 0;
      if (this.state === GAME_STATES.GRID_LINEUP) gantryLit = this._prevLightsLit || 0;
      else if (this.state === GAME_STATES.QUALIFYING && this.controlsLocked) {
        gantryLit = Math.max(0, 4 - Math.ceil(this.countdownTimer));
      }
      const retroPayload = {
        track: this.track,
        playerCar: this.playerCar,
        allCars: this.allCars,
        weather: this.weather,
        raceSystems: this.raceSystems,
        state: this.state,
        score: this.score,
        topScore: this.topScore,
        timerSec: (this.state === GAME_STATES.QUALIFYING || isClassic) ? this.masterTimerSec : this.sessionElapsedSec,
        sessionLabel: this.state === GAME_STATES.QUALIFYING ? 'QUALIFY' : 'RACE',
        currentLap: this.playerCar.lap,
        totalLaps: this._activeTotalLaps(),
        playerPos,
        totalCars: this.allCars.length,
        gantryLightsLit: gantryLit,
        gantryGreen: this.state === GAME_STATES.RACING && this.sessionElapsedSec < 3.0,
        centerCallout: calloutTxt,
        elapsedSec: this.elapsedSec,
        crtScanlines: true,
        cameraIndex: this.cameraModeIdx,
        cameraModeIdx: this.cameraModeIdx,
        renderAlpha,
        pitServiceSubPhase: pitSubPhase,
        pitStopProgress: pitProgress,
        sectorDeltaPopup: this.hud.getActiveSectorDeltaPopup?.() || null,
        crowdExcitement: this.crowdExcitement,
        yellowSectors: this.raceSystems.getActiveYellowSectorSet(),
        vscActive: !!this.raceSystems.vscActive,
        lookApexNormalized: this.controls?.lookApexNormalized || 0,
      };
      if (typeof this.retro1982.renderFrame === 'function') {
        this.retro1982.renderFrame(retroPayload);
      } else if (typeof this.retro1982.render === 'function') {
        this.retro1982.render(retroPayload);
      }
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  _stepSimulation240Hz(dt) {
    const isShowroom = this.state === GAME_STATES.PRE_RACE_MENU;
    if (isShowroom || this.state === GAME_STATES.RACE_RESULTS) return;

    const isQuali = this.state === GAME_STATES.QUALIFYING;
    const isRacing = this.state === GAME_STATES.RACING || this.state === GAME_STATES.PIT_STOP;
    const isSim = this.config.mode === '2026_UPDATED';
    const totalLaps = this._activeTotalLaps();

    // Snapshot previous substep pose for butter-smooth 240Hz -> display refresh interpolation
    for (let i = 0; i < this.allCars.length; i++) {
      this._snapCarPrevPose(this.allCars[i]);
    }

    const simCallbacks = {
      onGearShift: (car, nextGear, shiftDir) => {
        if (car.isPlayer) this._onPlayerGearShift(car, nextGear, shiftDir);
      },
      onBackfire: (car) => {
        if (car.isPlayer) this.audio.playBackfirePop();
      },
      onHydroplane: (car) => {
        if (car.isPlayer) {
          this.audio.playHydroplaneSplash();
          this.hud.showCenterCallout('AQUAPLANING — REDUCE SPEED', 850, '#38bdf8');
        }
      },
      onPuncture: (car, corner) => {
        if (car.isPlayer) {
          this.audio.playWingDamageCrunch();
          this.hud.showCenterCallout(`${corner} TIRE PUNCTURE — BOX THIS LAP`, 2400, '#ef4444');
          this.hud.showEngineerRadio(`We have a ${corner} puncture. Box this lap for fresh rubber.`);
          this.audio.speakAnnouncement('Tire puncture! Box, box this lap!', true);
        }
      },
      onExplosion: (car) => {
        if (car.isPlayer) {
          this.audio.play1982ExplosionBoom();
          this.hud.showCenterCallout('HEAVY IMPACT', 1500, '#ef4444');
        }
      },
      onCollision: (car, speedKmh, part) => {
        if (car.isPlayer) {
          this.audio.playWingDamageCrunch();
          if (part === 'FRONT_WING' && car.damage.frontWing > 0.35) {
            this.hud.showEngineerRadio('Front wing endplate damage — expect high-speed understeer.');
          }
        }
      },
      onLocalYellow: (sec) => {
        this.audio.playYellowFlagChime();
        const msg = `Yellow flag in Sector ${sec.id} — no overtaking.`;
        this.hud.showEngineerRadio(msg);
        this.audio.speakAnnouncement(msg, true);
      },
      onVSCDeployed: () => {
        this.audio.playYellowFlagChime();
        const msg = 'Virtual Safety Car deployed — pit window open.';
        this.hud.showEngineerRadio(msg);
        this.audio.speakAnnouncement(msg, true);
      },
      onVSCEnded: () => {
        this.hud.showCenterCallout('VSC ENDING — GREEN FLAG', 1500, '#10b981');
      },
      onYellowIllegalPassWarning: (rivalName) => {
        this.audio.playYellowFlagChime();
        this.hud.showEngineerRadio(`Illegal pass under yellow — yield position back to ${rivalName}.`);
      },
      onYellowPenaltyIssued: (sec) => {
        this.hud.showCenterCallout(`+${sec.toFixed(0)}s YELLOW FLAG PENALTY`, 1900, '#ef4444');
      },
      onPlayerPitStopped: () => {
        this.audio.playWheelGunWhir();
      },
      onPlayerPitReleased: (car, sec) => {
        this.audio.playStartBeep(true);
        this.hud.showEngineerRadio(`Clean stop in ${sec.toFixed(2)}s on ${car.compound} tires — push now.`);
      },
      onPitSpeeding: (penSec) => {
        this.audio.playYellowFlagChime();
        this.hud.showCenterCallout(`PIT SPEEDING >80 KM/H • +${penSec}s PENALTY`, 2100, '#ef4444');
      },
      onCompoundVisualChanged: (car) => {
        this.carRigs.get(car.id)?.setCompound(car.compound);
      },
      onEngineerWarning: (msg) => {
        this.hud.showEngineerRadio(msg);
      },
      onLapCrossed: (car) => this._onCarCrossedLine(car, isQuali, isRacing, totalLaps),
    };

    const activeBrakeAssist = normalizeAssistMode(
      this.controls?.brakingAssist || this.prefs.control.brakingAssist,
      'MIN'
    );

    const physCtx = {
      track: this.track,
      weather: this.weather,
      allCars: this.allCars,
      controls: this.controls,
      brakingAssist: activeBrakeAssist,
      aiDifficulty: this.aiDifficulty || 'PRO',
      mode: this.config.mode,
      raceLengthId: this.config.raceLengthId,
      isQualifying: isQuali,
      vscActive: this.raceSystems.vscActive,
      controlsLocked: this.controlsLocked,
      totalLaps,
      callbacks: simCallbacks,
    };

    let prevRivalsAhead = 0;
    if (isRacing && !this.controlsLocked && this.playerCar) {
      for (const c of this.allCars) {
        if (!c.isPlayer && c.totalDistanceGameM > this.playerCar.totalDistanceGameM) prevRivalsAhead++;
      }
    }

    for (const car of this.allCars) {
      if (!car.isPlayer) {
        this.aiController.updateAI(car, this.allCars, this.playerCar, dt, physCtx);
      }

      if (isRacing) {
        this.raceSystems.updatePitLaneForCar(car, dt, physCtx);
      }

      const lockThisCar = car.isPlayer ? physCtx.controlsLocked : (this.state === GAME_STATES.GRID_LINEUP);
      stepVehiclePhysics240Hz(car, dt, { ...physCtx, controlsLocked: lockThisCar });
    }

    if ((isQuali || isRacing) && !this.controlsLocked) {
      this.raceSystems.updateCollisionsAndCautions(this.allCars, this.playerCar, dt, physCtx);

      if (this.playerCar.totalDistanceGameM - this.distanceScoredMeters >= 5.0) {
        const chunks = Math.floor((this.playerCar.totalDistanceGameM - this.distanceScoredMeters) / 5.0);
        this.distanceScoredMeters += chunks * 5.0;
        this.score += chunks * CLASSIC_1982_RULES.pointsPer5Meters;
        this._checkTopScore();
      }

      // Overtake tracking + Doppler Pass Whoosh
      if (isRacing && !this.playerCar.exploded) {
        const mPerGameM = this.track.metersPerGameUnit || this.track.realMetersPerGameMeter || 4.54;
        let nowRivalsAhead = 0;
        for (const c of this.allCars) {
          if (c.isPlayer) continue;
          if (c.totalDistanceGameM > this.playerCar.totalDistanceGameM) nowRivalsAhead++;
          if (c._whooshCooldown > 0) c._whooshCooldown = Math.max(0, c._whooshCooldown - dt);
          if (!c.exploded && !c.inPitLane && !this.playerCar.inPitLane && !(c._whooshCooldown > 0)) {
            let ds = c.s - this.playerCar.s;
            if (ds > TRACK_GAME_LENGTH * 0.5) ds -= TRACK_GAME_LENGTH;
            if (ds < -TRACK_GAME_LENGTH * 0.5) ds += TRACK_GAME_LENGTH;
            const absLongM = Math.abs(ds) * mPerGameM;
            const absLatM = Math.abs(c.lateralOffset - this.playerCar.lateralOffset);
            const relKmh = Math.abs(this.playerCar.speedKmh - c.speedKmh);
            if (absLongM < 4.2 && absLatM > 1.25 && absLatM < 4.4 && relKmh > 18) {
              c._whooshCooldown = 1.65;
              const pan = Math.max(-0.9, Math.min(0.9, (c.lateralOffset - this.playerCar.lateralOffset) / 3.5));
              this.audio.playOvertakeWhoosh?.(Math.max(30, relKmh), pan);
            }
          }
        }
        if (nowRivalsAhead < prevRivalsAhead) {
          const passed = prevRivalsAhead - nowRivalsAhead;
          this.overtakesCount += passed;
          const pts = passed * CLASSIC_1982_RULES.pointsPerOvertake;
          this.passingBonus += pts;
          this.score += pts;
          this._checkTopScore();
          this.audio.playOvertakeWhoosh?.(Math.max(36, this.playerCar.speedKmh * 0.22));
          if (nowRivalsAhead === 0) {
            this._cheerCrowd(0.95);
            this.hud.showCenterCallout(
              isSim ? 'P1 — RACE LEADER' : `P1 — INTO THE LEAD! (+${pts} PTS)`,
              1350,
              '#ffd600'
            );
          } else {
            this._cheerCrowd(0.68);
            const newPos = nowRivalsAhead + 1;
            this.hud.showCenterCallout(
              isSim ? `OVERTAKE • P${newPos}` : `+${pts} PTS PASS • ${ordinalSuffix(newPos)}`,
              950,
              '#10b981'
            );
          }
        }
      }

      // 3-Macro-Sector Split Delta Timing (S1: 0..333.3, S2: 333.3..666.7, S3: 666.7..1000)
      if (this.playerCar && !this.playerCar.exploded && this.playerCar.totalDistanceGameM > 2.0) {
        const pSw = ((this.playerCar.s % TRACK_GAME_LENGTH) + TRACK_GAME_LENGTH) % TRACK_GAME_LENGTH;
        const curMacroSec = pSw < 333.33 ? 0 : (pSw < 666.67 ? 1 : 2);
        if (curMacroSec !== this._prevMacroSectorIdx) {
          if (curMacroSec === (this._prevMacroSectorIdx + 1) % 3) {
            const splitDur = this.sessionElapsedSec - this._macroSectorStartSec;
            if (splitDur > 2.5 && splitDur < 95.0) {
              this.hud.recordSectorSplit?.(this._prevMacroSectorIdx + 1, splitDur);
            }
          }
          this._prevMacroSectorIdx = curMacroSec;
          this._macroSectorStartSec = this.sessionElapsedSec;
        }
      }

      this.sessionElapsedSec += dt;
      if (isQuali) {
        this.masterTimerSec -= dt;
        if (this.masterTimerSec <= 0) {
          this.masterTimerSec = 0;
          this._finishQualifyingLap();
        }
      } else if (isRacing && this.config.mode === '1982_ORIGINAL') {
        this.masterTimerSec -= dt;
        if (this.masterTimerSec <= 0) {
          this.masterTimerSec = 0;
          this._completeGrandPrix(true);
        }
      }

      if (isRacing && this.config.mode === '2026_UPDATED') {
        const minTire = Math.min(
          this.playerCar.tires.FL.life,
          this.playerCar.tires.FR.life,
          this.playerCar.tires.RL.life,
          this.playerCar.tires.RR.life
        );
        if (minTire < 0.25 && !this.playerCar._warnedCliff) {
          this.playerCar._warnedCliff = true;
          this.hud.showEngineerRadio('Tires have hit the 25% cliff — box this lap.');
          this.audio.speakAnnouncement('Box, box this lap. Tires hitting the cliff.', true);
        } else if (minTire > 0.5) {
          this.playerCar._warnedCliff = false;
        }
      }
    }
  }

  _onCarCrossedLine(car, isQuali, isRacing, totalLaps) {
    if (car.totalDistanceGameM < 500) {
      car.currentLapTime = 0;
      return;
    }

    const completedLapSec = car.currentLapTime;
    const prevBestSec = car.bestLapTime;
    const isPersonalBest = !prevBestSec || completedLapSec < prevBestSec;
    car.lastLapTime = completedLapSec;
    if (isPersonalBest) {
      car.bestLapTime = completedLapSec;
    }
    car.currentLapTime = 0;

    if (car.isPlayer && isQuali) {
      this._finishQualifyingLap();
      return;
    }

    car.lap += 1;

    if (car.isPlayer && isRacing) {
      if (car.lap > totalLaps) {
        this._completeGrandPrix(false);
        return;
      }

      if (this.config.mode === '1982_ORIGINAL') {
        const bestTag = (isPersonalBest && prevBestSec) ? ' • BEST LAP' : '';
        this.masterTimerSec += CLASSIC_1982_RULES.extendedPlayBonusSec;
        this.hud.showCenterCallout(
          `EXTENDED PLAY +58s • LAP ${formatLapTimeArcade(completedLapSec)}${bestTag}`,
          2100,
          isPersonalBest && prevBestSec ? '#a855f7' : '#10b981'
        );
        this.audio.playStartBeep(true);
      } else {
        const bestTag = (isPersonalBest && prevBestSec) ? ' • PERSONAL BEST' : '';
        const isFinal = car.lap === totalLaps;
        this.hud.showCenterCallout(
          isFinal
            ? `FINAL LAP • ${formatLapTimeSim(completedLapSec)}${bestTag}`
            : `LAP ${car.lap}/${totalLaps} • ${formatLapTimeSim(completedLapSec)}${bestTag}`,
          1900,
          isFinal ? '#ffd600' : (isPersonalBest && prevBestSec ? '#a855f7' : '#38bdf8')
        );
        if (isFinal) {
          this.audio.speakAnnouncement('Final lap! Push to the line!', true);
        }
        const posNow = this._computeStandings().findIndex((c) => c.isPlayer) + 1;
        if (posNow > 0 && posNow <= 3) this._cheerCrowd(posNow === 1 ? 0.7 : 0.5);
      }
    }
  }

  // --------------------------------------------------------------------------
  // CALM 3D SHOWROOM SHOWCASE, PIT BROADCAST & 5 LOCKED-FOV SIM DRIVING CAMERAS
  // (0: Chase Cam | 1: FOM Halo T-Cam | 2: Cockpit Helmet | 3: Bonnet Cowling | 4: Nose Wing)
  // --------------------------------------------------------------------------
  _updateCameraDirector(dt, renderAlpha = 1.0) {
    if (!this.playerCar) return;

    const expAlpha = (rate) => 1.0 - Math.exp(-rate * dt);
    const pose = this._getInterpolatedCarPose(this.playerCar, renderAlpha, this._camPoseScratch);
    const pFr = this.track.sampleAt(pose.s, pose.lat);
    const { w: vpW, h: vpH } = this._getViewportSize();
    const aspect = vpW / vpH;

    // 1. Calm Gran Turismo 7 / F1 24 3D Showcase Orbit on Home Menu (65–72% clear center stage)
    if (this.state === GAME_STATES.PRE_RACE_MENU) {
      this.camera.up.set(0, 1, 0);
      if (Math.abs(this.camera.near - 0.32) > 0.01) {
        this.camera.near = 0.32;
        this.camera.updateProjectionMatrix();
      }
      if (this._orbitDragPointer === null) {
        if (!this._userDraggedShowroom) {
          this.showroomYawOffset = this._showroomOrbitAngle + Math.sin(this.elapsedSec * 0.24) * 0.11;
        } else {
          this.showroomYawOffset += dt * 0.04;
        }
        this.showroomPitchOffset += (0.0 - this.showroomPitchOffset) * expAlpha(1.8);
      }
      const fwdYaw = Math.atan2(pFr.tangent.z, pFr.tangent.x);
      const camAng = fwdYaw + this.showroomYawOffset;
      const baseDist = 5.15;
      const radius = aspect < 0.60 ? baseDist * 1.42 : (aspect < 0.85 ? baseDist * 1.20 : baseDist);
      const height = (aspect < 0.85 ? 1.42 : 1.24) + this.showroomPitchOffset + Math.sin(this.elapsedSec * 0.45) * 0.06;

      this._camDesiredPos.set(
        pFr.pos.x + Math.cos(camAng) * radius,
        pFr.pos.y + height,
        pFr.pos.z + Math.sin(camAng) * radius
      );
      const lookY = aspect < 0.60 ? 0.24 : (aspect < 0.85 ? 0.40 : 0.62);
      const vistaBlend = this._userDraggedShowroom ? 0.20 : 1.0;
      this._camDesiredLook
        .copy(pFr.pos)
        .addScaledVector(pFr.tangent, 1.05 * vistaBlend)
        .addScaledVector(pFr.right, -0.35 * vistaBlend);
      this._camDesiredLook.y += lookY;

      const desiredFov = aspect < 0.58 ? 72 : (aspect < 0.85 ? 60 : 45);
      if (Math.abs(this.camera.fov - desiredFov) > 0.15) {
        this.camera.fov += (desiredFov - this.camera.fov) * expAlpha(6.0);
        this.camera.updateProjectionMatrix();
      }

      this.camera.position.lerp(this._camDesiredPos, expAlpha(7.0));
      this._camLook.lerp(this._camDesiredLook, expAlpha(8.5));
      this.camera.lookAt(this._camLook);
      return;
    }

    // 2. Post-Race Podium Orbit Camera
    if (this.state === GAME_STATES.RACE_RESULTS) {
      this.camera.up.set(0, 1, 0);
      if (Math.abs(this.camera.near - 0.32) > 0.01) {
        this.camera.near = 0.32;
        this.camera.updateProjectionMatrix();
      }
      const ang = this.elapsedSec * 0.50;
      const podRadius = aspect < 0.60 ? 11.6 : (aspect < 0.85 ? 10.0 : 8.8);
      this._camDesiredPos.set(
        pFr.pos.x + Math.cos(ang) * podRadius,
        pFr.pos.y + 3.2,
        pFr.pos.z + Math.sin(ang) * podRadius
      );
      this.camera.position.lerp(this._camDesiredPos, expAlpha(4.2));
      this.camera.lookAt(pFr.pos.x, pFr.pos.y + 0.85, pFr.pos.z);
      return;
    }

    // 3. Dedicated Pit Box Crew Broadcast Angle
    if (this.state === GAME_STATES.PIT_STOP) {
      this.camera.up.set(0, 1, 0);
      if (Math.abs(this.camera.near - 0.32) > 0.01) {
        this.camera.near = 0.32;
        this.camera.updateProjectionMatrix();
      }
      const pitScale = aspect < 0.65 ? 1.25 : 1.0;
      this._camDesiredPos
        .copy(pFr.pos)
        .addScaledVector(pFr.tangent, 6.2 * pitScale)
        .addScaledVector(pFr.right, -4.4 * pitScale);
      this._camDesiredPos.y += 3.2;
      this._camDesiredLook.set(pFr.pos.x, pFr.pos.y + 0.75, pFr.pos.z);
      this.camera.position.lerp(this._camDesiredPos, expAlpha(6.5));
      this._camLook.lerp(this._camDesiredLook, expAlpha(8.0));
      this.camera.lookAt(this._camLook);
      return;
    }

    // 4. Active Racing / Qualifying 5 Locked-FOV Sim Driving Cameras (cameraModeIdx = 0..4)
    const mPerG = Math.max(
      0.5,
      Number(
        this.track.metersPerGameUnit ||
        this.track.realMetersPerGameMeter ||
        ((this.track.realLengthM || 4360) / (this.track.totalLength || 1000))
      ) || 4.36
    );
    const isNarrowPortrait = aspect < 0.85;
    const isUltraNarrow = aspect < 0.58;
    const camIdx = (((this.cameraModeIdx % 5) + 5) % 5);
    const isOnboardRigid = camIdx >= 1;
    const targetNear = camIdx === 2 ? 0.08 : (isOnboardRigid ? 0.12 : 0.32);

    // Filtered longitudinal & lateral G-forces for 6-DOF Helmet Cam & chassis load cues
    const speedKmh = this.playerCar.speedKmh || 0;
    const rawLongG = Number.isFinite(this.playerCar.longG)
      ? this.playerCar.longG
      : ((speedKmh - this._camPrevSpeedKmh) / 3.6) / Math.max(0.004, dt) / 9.81;
    this._camPrevSpeedKmh = speedKmh;
    const rawLatG = Number.isFinite(this.playerCar.latG) ? this.playerCar.latG : 0.0;
    this._camLongG += (Math.max(-5.2, Math.min(2.5, rawLongG)) - this._camLongG) * expAlpha(14.0);
    this._camLatG += (Math.max(-4.8, Math.min(4.8, rawLatG)) - this._camLatG) * expAlpha(14.0);

    // Subtle physical kerb rumble + tire flat-spot wheel-harmonic vibration (millimeter-scale, zero arcade shake)
    const flatArr = this.playerCar.tireFlatSpot;
    const maxFlatSpot = Array.isArray(flatArr)
      ? Math.max(Number(flatArr[0]) || 0, Number(flatArr[1]) || 0, Number(flatArr[2]) || 0, Number(flatArr[3]) || 0)
      : 0;
    const wheelSpin = Number(this.playerCar.wheelSpinRad) || (this.elapsedSec * 42.0);
    const flatAmp = maxFlatSpot > 0.08 && speedKmh > 35
      ? maxFlatSpot * Math.min(1.0, speedKmh / 220) * (camIdx === 2 ? 0.0045 : 0.0065)
      : 0;
    const kerbAmp = this.playerCar.onCurb && speedKmh > 35
      ? (camIdx === 2 ? 0.0085 : (isOnboardRigid ? 0.011 : 0.016))
      : 0;
    const vibY = Math.sin(this.elapsedSec * 56.0) * kerbAmp + Math.sin(wheelSpin) * flatAmp;
    const vibLat = Math.cos(this.elapsedSec * 49.0) * (kerbAmp * 0.40) + Math.cos(wheelSpin) * (flatAmp * 0.35);

    if (isOnboardRigid) {
      // Exact 3D car-attached Frenet basis from 240Hz interpolated pose
      const cosY = Math.cos(pose.relYaw);
      const sinY = Math.sin(pose.relYaw);
      this._camCarFwd
        .copy(pFr.tangent)
        .multiplyScalar(cosY)
        .addScaledVector(pFr.right, sinY)
        .normalize();
      this._camCarRight.crossVectors(this._camCarFwd, pFr.normal).normalize();
      this._camCarUp.copy(pFr.normal).normalize();

      const pitchRad = pose.pitch;
      const rollRad = pose.roll;
      const heaveM = Math.max(-0.025, Math.min(0.035, pose.heave || 0));

      const rawLookApex = Number.isFinite(this.controls?.lookApexNormalized)
        ? this.controls.lookApexNormalized
        : (this.playerCar.steerInput || 0) * 0.65;
      this._camCockpitApex = (this._camCockpitApex || 0) + (rawLookApex - (this._camCockpitApex || 0)) * expAlpha(10.5);

      let desiredFov;
      if (camIdx === 1) {
        // 1: FOM HALO T-CAM — Authentic -0.085m left-offset FIA roll-hoop TV onboard pod
        desiredFov = isUltraNarrow ? 78 : (isNarrowPortrait ? 70 : 60);
        const apexYawRad = this._camCockpitApex * 0.065;
        const lookDist = 34.0;

        this._camDesiredPos
          .copy(pFr.pos)
          .addScaledVector(this._camCarFwd, -0.14)
          .addScaledVector(this._camCarRight, -0.085 + vibLat)
          .addScaledVector(this._camCarUp, 0.965 + heaveM * 0.55 + vibY);

        this._camDesiredLook
          .copy(this._camDesiredPos)
          .addScaledVector(this._camCarFwd, lookDist * Math.cos(apexYawRad))
          .addScaledVector(this._camCarRight, lookDist * Math.sin(apexYawRad))
          .addScaledVector(this._camCarUp, (isNarrowPortrait ? -0.34 : -0.26) - pitchRad * 20.0);

        this.camera.up
          .copy(this._camCarUp)
          .addScaledVector(this._camCarRight, Math.sin(rollRad * 0.85))
          .normalize();
      } else if (camIdx === 2) {
        // 2: COCKPIT HELMET CAM — Driver eye-point with 6-DOF G-force braking nod, lateral G lean,
        //    35% world-horizon lock & smooth ±6.5° (0.1134 rad) look-to-apex
        desiredFov = isUltraNarrow ? 80 : (isNarrowPortrait ? 72 : 64);
        const apexYawRad = this._camCockpitApex * 0.1134; // ±6.5 deg smooth apex look-ahead
        const brakeG = Math.max(0.0, -this._camLongG);
        const accelG = Math.max(0.0, this._camLongG);
        const headLongShift = Math.min(0.032, brakeG * 0.0085) - Math.min(0.014, accelG * 0.006);
        const headBrakeNodRad = Math.min(0.038, brakeG * 0.0095); // up to ~2.2° forward braking nod
        const headLatLean = Math.max(-0.032, Math.min(0.032, this._camLatG * 0.0085));
        const lookDist = 30.0;

        this._camDesiredPos
          .copy(pFr.pos)
          .addScaledVector(this._camCarFwd, 0.15 + headLongShift)
          .addScaledVector(this._camCarRight, headLatLean + vibLat * 0.65)
          .addScaledVector(this._camCarUp, 0.635 + heaveM * 0.45 - brakeG * 0.003 + vibY * 0.65);

        this._camDesiredLook
          .copy(this._camDesiredPos)
          .addScaledVector(this._camCarFwd, lookDist * Math.cos(apexYawRad))
          .addScaledVector(this._camCarRight, lookDist * Math.sin(apexYawRad))
          .addScaledVector(this._camCarUp, -0.055 - (pitchRad + headBrakeNodRad) * 22.0 + vibY * 0.40);

        // 35% World-Horizon Lock: blends 65% chassis roll up-vector with 35% world up
        this.camera.up
          .copy(this._camCarUp)
          .addScaledVector(this._camCarRight, Math.sin(rollRad * 0.65))
          .multiplyScalar(0.65)
          .addScaledVector(this._camWorldUp, 0.35)
          .normalize();
      } else if (camIdx === 3) {
        // 3: BONNET / COWLING CAM — Clean sim view on front bulkhead ahead of Halo pillar (+0.82m),
        //    framing #1 nose cone + working front suspension wishbones & 18-inch slicks with zero Halo obstruction
        desiredFov = isUltraNarrow ? 78 : (isNarrowPortrait ? 70 : 60);
        const apexYawRad = this._camCockpitApex * 0.060;
        const lookDist = 32.0;

        this._camDesiredPos
          .copy(pFr.pos)
          .addScaledVector(this._camCarFwd, 0.82)
          .addScaledVector(this._camCarRight, vibLat * 0.75)
          .addScaledVector(this._camCarUp, 0.605 + heaveM * 0.55 + vibY * 0.75);

        this._camDesiredLook
          .copy(this._camDesiredPos)
          .addScaledVector(this._camCarFwd, lookDist * Math.cos(apexYawRad))
          .addScaledVector(this._camCarRight, lookDist * Math.sin(apexYawRad))
          .addScaledVector(this._camCarUp, (isNarrowPortrait ? -0.22 : -0.16) - pitchRad * 21.0);

        this.camera.up
          .copy(this._camCarUp)
          .addScaledVector(this._camCarRight, Math.sin(rollRad * 0.90))
          .normalize();
      } else {
        // 4: NOSE / FRONT-WING CAM — Low asphalt ground-rush view right over the front wing (+1.76m)
        desiredFov = isUltraNarrow ? 80 : (isNarrowPortrait ? 72 : 64);
        const apexYawRad = this._camCockpitApex * 0.050;
        const lookDist = 32.0;

        this._camDesiredPos
          .copy(pFr.pos)
          .addScaledVector(this._camCarFwd, 1.76)
          .addScaledVector(this._camCarRight, vibLat * 0.80)
          .addScaledVector(this._camCarUp, 0.27 + heaveM * 0.65 + vibY * 0.85);

        this._camDesiredLook
          .copy(this._camDesiredPos)
          .addScaledVector(this._camCarFwd, lookDist * Math.cos(apexYawRad))
          .addScaledVector(this._camCarRight, lookDist * Math.sin(apexYawRad))
          .addScaledVector(this._camCarUp, 0.04 - pitchRad * 20.0);

        this.camera.up
          .copy(this._camCarUp)
          .addScaledVector(this._camCarRight, Math.sin(rollRad * 0.95))
          .normalize();
      }

      // Locked geometric FOV on all onboard sim cameras (zero arcade speed-warp distortion)
      let projDirty = false;
      if (Math.abs(this.camera.near - targetNear) > 0.005) {
        this.camera.near = targetNear;
        projDirty = true;
      }
      if (Math.abs(this.camera.fov - desiredFov) > 0.08) {
        this.camera.fov += (desiredFov - this.camera.fov) * expAlpha(12.0);
        projDirty = true;
      }
      if (projDirty) this.camera.updateProjectionMatrix();

      this.camera.position.copy(this._camDesiredPos);
      this.camera.lookAt(this._camDesiredLook);
      return;
    }

    // 0: CHASE CAM — Velocity-vector aligned critically-damped sim chase rig (zero lateral steering twitch!)
    this.camera.up.set(0, 1, 0);
    const backDist = isUltraNarrow ? 6.95 : (isNarrowPortrait ? 6.35 : 5.75);
    const upHeight = isUltraNarrow ? 2.22 : (isNarrowPortrait ? 2.08 : 1.94);
    const lookAheadM = 18.0; // True 18.0 real meters ahead along track spline (fixes 22.0 game-unit bug!)
    const lookHeight = isNarrowPortrait ? 0.66 : 0.86;

    // Locked geometric FOV (max +1.2° subtle high-speed aero pull >285 km/h — no +15.5° hyperdrive warp)
    const baseFov = isUltraNarrow ? 76 : (isNarrowPortrait ? 68 : 56);
    const subtleAeroPull = speedKmh > 260 ? Math.min(1.2, ((speedKmh - 260) / 70) * 1.2) : 0.0;
    const desiredFov = baseFov + subtleAeroPull;
    let chaseProjDirty = false;
    if (Math.abs(this.camera.near - targetNear) > 0.005) {
      this.camera.near = targetNear;
      chaseProjDirty = true;
    }
    if (Math.abs(this.camera.fov - desiredFov) > 0.08) {
      this.camera.fov += (desiredFov - this.camera.fov) * expAlpha(8.0);
      chaseProjDirty = true;
    }
    if (chaseProjDirty) this.camera.updateProjectionMatrix();

    // Velocity-vector heading: track tangent + interpolated relYaw + 65% body slip angle
    const tangentYaw = Math.atan2(pFr.tangent.z, pFr.tangent.x);
    const slipRad = speedKmh > 18 ? (Number(this.playerCar.bodySlipAngleRad) || 0) * 0.65 : 0;
    const targetVelocityYaw = tangentYaw + pose.relYaw + slipRad;

    if (!Number.isFinite(this._camChaseYaw)) {
      this._camChaseYaw = targetVelocityYaw;
    } else {
      let dy = targetVelocityYaw - this._camChaseYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this._camChaseYaw += dy * expAlpha(11.5);
    }

    this._camChaseFwd.set(Math.cos(this._camChaseYaw), 0, Math.sin(this._camChaseYaw));
    this._camChaseFwd.y = pFr.tangent.y;
    this._camChaseFwd.normalize();

    this._camDesiredPos
      .copy(pFr.pos)
      .addScaledVector(this._camChaseFwd, -backDist)
      .addScaledVector(pFr.right, vibLat)
      .addScaledVector(pFr.normal, upHeight + vibY);

    // True metric spline look-ahead at s + 18.0 / mPerG (smoothly tracks real upcoming apexes)
    const lookFr = this.track.sampleAt(pose.s + lookAheadM / mPerG, pose.lat * 0.72);
    this._camDesiredLook
      .copy(lookFr.pos)
      .addScaledVector(lookFr.normal, lookHeight);

    const posBlend = expAlpha(18.0);
    const lookBlend = expAlpha(20.0);
    if (this.camera.position.distanceToSquared(this._camDesiredPos) > 64.0) {
      this.camera.position.copy(this._camDesiredPos);
      this._camLook.copy(this._camDesiredLook);
    } else {
      this.camera.position.lerp(this._camDesiredPos, posBlend);
      this._camLook.lerp(this._camDesiredLook, lookBlend);
    }
    this.camera.lookAt(this._camLook);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const game = new PolePosition2026Game();
  window.__RACE_PHANATIC_GAME__ = game;
  game.init().catch((err) => {
    console.error('[PolePosition2026] Initialization error:', err);
  });
});
