// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// AAA Master Engine: MSAA HDR + UnrealBloom Pipeline, 3D Showroom Director,
// 4 World Circuits, Locked Per-Race Random Weather & 8-Speed F1 Auto Acoustics
// ============================================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
} from './config.js';
import { FujiTrack } from './track.js';
import { AssetLibrary, FormulaCarRig, PitCrewDiorama, EffectsManager } from './models.js';
import { WeatherSystem } from './weather.js';
import { createVehicleState, stepVehiclePhysics240Hz, shiftGear } from './physics.js';
import { RaceSystemsController } from './pit_damage_caution.js';
import { SpatialAIController } from './ai.js';
import { ProceduralAudioEngine } from './audio.js';
import { ErgonomicControls } from './controls.js';
import { TelemetryHUD, formatLapTimeArcade, ordinalSuffix } from './hud.js';
import { Retro1982Renderer } from './retro1982.js';
import { ReplayDirector } from './replay.js';
import {
  CareerManager,
  TEAM_CATALOG,
  CHAMPIONSHIP_CALENDAR,
  CAR_SETUP_OPTIONS,
  formatCredits,
} from './career.js';

const PREFS_STORAGE_KEY = 'rp_f1_prefs_v3';

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
      trackId: 'FUJI_1982',          // 'FUJI_1982' | 'MONACO_HARBOR' | 'VEGAS_NEON' | 'MONZA_TEMPLE'
      mode: '2026_UPDATED',          // '1982_ORIGINAL' | '2026_UPDATED'
      gearboxMode: 'AUTO_8SPD',      // 'AUTO_8SPD' (Default!) | 'MANUAL_8SPD' | 'CLASSIC_2SPD'
      steeringStyle: 'WHEEL',        // 'WHEEL' | 'BUTTONS'
      handedness: 'RIGHT_HANDED',    // 'RIGHT_HANDED' | 'LEFT_HANDED'
      classicLaps: 4,                // 3 | 4 | 5
      raceLengthId: 'SHORT',         // 'SHORT' (5) | 'MEDIUM' (12) | 'LONG' (25)
      runQualifying2026: false,      // Instant Race by default in 2026 GP; 1982 always runs Quali
      startingCompound: 'SOFT',
      gridSize: 8,                   // 8 | 16
      weatherPreset: 'RANDOM',       // 'RANDOM' | fixed WEATHER_REGIMES key
      visualStyle: '2026_PBR',       // '2026_PBR' | '1982_ARCADE'
    };

    this.state = GAME_STATES.PRE_RACE_MENU;
    this.cameraModeIdx = 0; // 0: Chase, 1: T-Cam Cockpit, 2: 1982 High Arcade
    this.lockedRaceWeatherId = 'HOT_SUNNY';

    // Interactive Showroom Hero Orbit state
    this.showroomYawOffset = 0.42;
    this.showroomPitchOffset = 0.0;
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
    this._speedVignetteEl = null;

    // Pause, Instant Replay & Career session flags
    this.paused = false;
    this._replayFromPodium = false;
    this._replayScrubbing = false;
    this._careerRoundActive = false;
    this._lastCareerResult = null;
    this._careerTab = 'TEAMS';
    this._lastCrowdCheerSec = -10;

    // Persisted player preferences (speed unit, assists, mixer)
    this.prefs = {
      speedUnit: 'KMH',
      control: { sensitivity: 1.0, controlScale: 1.0, brakingAssist: 'OFF', autoThrottle: false, haptics: true },
      mixer: null,
    };
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          if (saved.speedUnit === 'MPH' || saved.speedUnit === 'KMH') this.prefs.speedUnit = saved.speedUnit;
          if (saved.control && typeof saved.control === 'object') Object.assign(this.prefs.control, saved.control);
          if (saved.mixer && typeof saved.mixer === 'object') this.prefs.mixer = saved.mixer;
          // Only restore a steering style the player explicitly picked; TILT needs a real touch/gyro device.
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
        control: this.prefs.control,
        mixer: this.prefs.mixer,
        steeringStyle: this._steeringUserSet ? this.config.steeringStyle : 'WHEEL',
        steeringUserSet: !!this._steeringUserSet,
      }));
    } catch (_) {}
  }

  async init() {
    this._speedVignetteEl = document.getElementById('speed-vignette');
    this._setupRendererAndPostProcessing();

    this.assets = new AssetLibrary();
    await this.assets.loadAll();

    this.track = new FujiTrack(this.scene, this.assets);
    this.effects = new EffectsManager(this.scene, this.track);
    this.weather = new WeatherSystem(this.scene, this.renderer);
    this.raceSystems = new RaceSystemsController(this.track, this.effects);
    this.aiController = new SpatialAIController(this.track, this.weather, this.raceSystems);
    this.pitCrewDiorama = new PitCrewDiorama(this.scene, this.assets, this.track);
    this.audio = new ProceduralAudioEngine();

    // Phase 2 flagship systems: Career R&D, 1:1 1982 Namco renderer & 60Hz TV replay director
    this.career = new CareerManager();
    this.retro1982 = new Retro1982Renderer(document.getElementById('webgl-container'));
    this.retro1982.setVisible(false);
    this.replay = new ReplayDirector();

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
            onOverRev: () => this.hud.showCenterCallout('OVER-REV ENGINE BRAKE!', 900, '#ff5252'),
            onBackfire: (car) => {
              this.audio.playBackfirePop();
              this.carRigs.get(car.id)?.triggerBackfire(0.16);
            },
          });
          this.controls.setGearboxUI(this._activeGearboxMode(), this.playerCar.gear);
        }
      },
      onClutchTap: () => this._handleClutchTap(),
      onToggleVisualStyle: () => this.toggleVisualStyle(),
      onCycleCamera: () => {
        if (this.replay.isPlaying) {
          this.replay.cycleCameraMode(1);
          return;
        }
        this.cameraModeIdx = (this.cameraModeIdx + 1) % 3;
        const names = ['DYNAMIC CHASE CAM', 'F1 T-CAM COCKPIT', '1982 HIGH ARCADE CAM'];
        this.hud.showCenterCallout(names[this.cameraModeIdx], 1100, '#00e5ff');
      },
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
          this.hud.showCenterCallout(`🧭 TILT CENTER SET (${d}°)`, 1200, '#00e5ff');
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

  _setupRendererAndPostProcessing() {
    const container = document.getElementById('webgl-container');
    this.renderer = new THREE.WebGLRenderer({
      antialias: window.devicePixelRatio < 2,
      powerPreference: 'high-performance',
    });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xb0dbff, 0.00014);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(aspect < 0.85 ? 70 : 60, aspect, 0.35, 7200);

    // AAA Post-Processing: WebGL2 4x MSAA HalfFloat RenderTarget + RenderPass + UnrealBloomPass + OutputPass
    const msaaSamples = this.renderer.capabilities.isWebGL2 ? 4 : 0;
    const composerTarget = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(window.innerWidth * dpr)),
      Math.max(1, Math.floor(window.innerHeight * dpr)),
      { type: THREE.HalfFloatType, samples: msaaSamples }
    );

    this.composer = new EffectComposer(this.renderer, composerTarget);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.32, // Rich neon/sun/brake-disc HDR glow without washing out UI
      0.46,
      0.84
    );
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(window.innerWidth, window.innerHeight);

    window.addEventListener('resize', () => {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      this.camera.aspect = w / h;
      this.camera.fov = this.camera.aspect < 0.85 ? 70 : 60;
      this.camera.updateProjectionMatrix();
      this.renderer.setPixelRatio(nextDpr);
      this.renderer.setSize(w, h);
      this.composer.setPixelRatio(nextDpr);
      this.composer.setSize(w, h);
      this.bloomPass.resolution.set(w, h);
    });
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
    const menuBtn = document.getElementById('btn-menu-audio');
    if (menuBtn) {
      menuBtn.innerHTML = this.audio.muted
        ? '🔇 <span class="pill-label">MUTED</span>'
        : '🔊 <span class="pill-label">SOUND ON</span>';
    }
    const liveBtn = document.getElementById('btn-live-mute');
    if (liveBtn) {
      liveBtn.textContent = this.audio.muted ? '🔇' : '🔊';
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
      if (nextGear >= 3) {
        this.carRigs.get(car.id)?.triggerBackfire(0.09);
      }
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

    const syncMenuUI = () => {
      const is2026 = this.config.mode === '2026_UPDATED';
      const tDef = TRACK_CATALOG[this.config.trackId] || TRACK_CATALOG.FUJI_1982;

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
      const ctl = this.prefs.control;
      document.querySelectorAll('[data-cfg-units]').forEach((b) =>
        b.classList.toggle('selected', b.dataset.cfgUnits === this.prefs.speedUnit)
      );
      document.querySelectorAll('[data-cfg-assist]').forEach((b) =>
        b.classList.toggle('selected', b.dataset.cfgAssist === ctl.brakingAssist)
      );
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

      // Sync Showroom Top Circuit Pill & Minimap Tag
      const subEl = document.getElementById('menu-circuit-subtitle');
      if (subEl) {
        subEl.textContent = `${tDef.country} • ${tDef.name} — ${tDef.subtitle.toUpperCase()}`;
      }
      const mapTag = document.getElementById('hud-circuit-tag');
      if (mapTag) {
        mapTag.textContent = tDef.name.split(' ').slice(0, 2).join(' ');
      }

      // Sync Bottom Launch Pod Quick-Setup Summary Pills
      const laps = this._activeTotalLaps();
      const setChip = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.textContent = txt;
      };
      setChip('sum-mode', is2026 ? `2026 GP • ${laps}L` : `1982 GP • ${laps}L`);
      setChip(
        'sum-gear',
        this.config.gearboxMode === 'AUTO_8SPD'
          ? 'AUTO 8-SPD'
          : (this.config.gearboxMode === 'CLASSIC_2SPD' ? '82 LO/HI' : 'MAN 8-SPD')
      );
      const wLabelMap = {
        RANDOM: 'RANDOM WEATHER',
        HOT_SUNNY: 'SUNNY DRY',
        GOLDEN_SUNSET: 'SUNSET',
        OVERCAST_COOL: 'COOL DRY',
        LIGHT_DRIZZLE: 'LIGHT RAIN',
        MONSOON_STORM: 'WET STORM',
      };
      setChip(
        'sum-weather',
        tDef.forceNight && this.config.weatherPreset === 'RANDOM'
          ? 'NIGHT STRIP'
          : (wLabelMap[this.config.weatherPreset] || 'RANDOM WEATHER')
      );
      setChip('sum-steer', this.config.steeringStyle === 'BUTTONS' ? 'ARROWS' : (this.config.steeringStyle === 'TILT' ? 'TILT' : 'WHEEL'));

      const liveSteerBtn = document.getElementById('btn-live-steer');
      if (liveSteerBtn) {
        liveSteerBtn.textContent = this.config.steeringStyle === 'BUTTONS' ? '◀▶' : (this.config.steeringStyle === 'TILT' ? '📱' : '🎡');
      }
      this._syncCareerBadges();
    };
    this._syncMenuUI = syncMenuUI;

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

    // Circuit Card Switching — Live transitions the 3D Showroom circuit immediately!
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
      if (this.config.mode === '2026_UPDATED' && this.config.gearboxMode === 'CLASSIC_2SPD') {
        this.config.gearboxMode = 'AUTO_8SPD'; // 2026 GP always defaults back to realistic AUTO 8-SPD
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
      this.prefs.control.brakingAssist = b.dataset.cfgAssist;
      this._applyControlSettings();
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

    // Settings Drawer Open / Close (plus Escape key close). The drawer is re-parented to <body>
    // so it is reachable from the in-race Pause Menu as well as the Showroom.
    if (garageBackdrop && garageBackdrop.parentElement !== document.body) {
      document.body.appendChild(garageBackdrop);
    }
    this._setGarageOpen = setGarageOpen;
    document.getElementById('btn-open-garage')?.addEventListener('click', () => {
      this._unlockAndSyncAudioButton();
      this.audio.playUIClick(true);
      setGarageOpen(true);
    });
    document.getElementById('btn-setup-summary')?.addEventListener('click', () => {
      this._unlockAndSyncAudioButton();
      this.audio.playUIClick(true);
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

    // Range sliders: control ergonomics + 5-channel audio mixer (live)
    const bindSlider = (id, onValue) => {
      const el = document.getElementById(id);
      const valEl = document.getElementById(`${id}-val`);
      if (!el) return;
      el.addEventListener('input', () => {
        const v = Number(el.value);
        if (valEl) valEl.textContent = `${v}%`;
        onValue(v);
      });
    };
    bindSlider('slider-ctrl-sens', (v) => {
      this.prefs.control.sensitivity = v / 100;
      this._applyControlSettings();
    });
    bindSlider('slider-ctrl-scale', (v) => {
      this.prefs.control.controlScale = v / 100;
      this._applyControlSettings();
    });
    for (const ch of ['master', 'engine', 'sfx', 'voice', 'music']) {
      bindSlider(`slider-mix-${ch}`, (v) => {
        this.prefs.mixer = { ...(this.prefs.mixer || {}), [ch]: v / 100 };
        this.audio.setMixerLevels?.({ [ch]: v / 100 });
        this._savePrefs();
      });
    }

    // Showroom Stage Interactive Touch/Mouse Low-Angle Orbit Drag
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

    // Race Launch Buttons (Bottom Dock + Inside Garage Drawer)
    const triggerLaunch = () => {
      this._unlockAndSyncAudioButton();
      this.audio.playUIClick(true);
      setGarageOpen(false);
      this._careerRoundActive = false;
      this.launchFromMenu();
    };
    document.getElementById('btn-launch-race')?.addEventListener('click', triggerLaunch);
    document.getElementById('btn-garage-race')?.addEventListener('click', triggerLaunch);

    // 1-Tap Authentic 1982 Namco "Pole Position" 1:1 Arcade Launch
    document.getElementById('btn-launch-1982-direct')?.addEventListener('click', () => {
      this._unlockAndSyncAudioButton();
      this.audio.playUIClick(true);
      setGarageOpen(false);
      this.config.mode = '1982_ORIGINAL';
      this.config.visualStyle = '1982_ARCADE';
      if (!this._userPickedGearbox) {
        this.config.gearboxMode = 'CLASSIC_2SPD'; // Authentic LO/HI shifter (user override in Settings is kept)
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
      this.config.steeringStyle = this.config.steeringStyle === 'BUTTONS' ? 'WHEEL' : 'BUTTONS';
      this._steeringUserSet = true;
      this.controls.setSteeringStyle(this.config.steeringStyle);
      this.hud.showCenterCallout(
        this.config.steeringStyle === 'BUTTONS' ? 'DUAL TOUCH ARROWS' : 'F1 STEERING WHEEL',
        1000,
        '#00e5ff'
      );
      this._savePrefs();
      syncMenuUI();
    });
    document.getElementById('btn-live-shader')?.addEventListener('click', () => this.toggleVisualStyle());
    document.getElementById('btn-live-hand')?.addEventListener('click', () => {
      this.config.handedness = this.config.handedness === 'RIGHT_HANDED' ? 'LEFT_HANDED' : 'RIGHT_HANDED';
      this.controls.setHandedness(this.config.handedness);
      this.hud.showCenterCallout(
        this.config.handedness === 'LEFT_HANDED' ? 'LEFT-HANDED HUD' : 'RIGHT-HANDED HUD',
        1000,
        '#00e5ff'
      );
      syncMenuUI();
    });
    document.getElementById('btn-live-cam')?.addEventListener('click', () => {
      this.cameraModeIdx = (this.cameraModeIdx + 1) % 3;
      const names = ['DYNAMIC CHASE CAM', 'F1 T-CAM COCKPIT', '1982 HIGH ARCADE CAM'];
      this.hud.showCenterCallout(names[this.cameraModeIdx], 1000, '#00e5ff');
    });
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
        // Championship: advance straight to the next calendar round
        const round = this.career.getCurrentRound();
        const nextTrack = round?.resolvedTrackId || round?.trackId;
        if (nextTrack && TRACK_CATALOG[nextTrack] && nextTrack !== this.config.trackId) {
          this.config.trackId = nextTrack;
          this._switchActiveCircuit(nextTrack);
        }
      }
      this.launchFromMenu(); // Rolls fresh locked random weather for the next race!
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
    c.controlScale = Math.max(0.75, Math.min(1.25, Number(c.controlScale) || 1.0));
    if (!['OFF', 'LOW', 'MEDIUM', 'HIGH'].includes(c.brakingAssist)) c.brakingAssist = 'OFF';
    this.controls?.setControlSettings?.({
      sensitivity: c.sensitivity,
      controlScale: c.controlScale,
      brakingAssist: c.brakingAssist,
      autoThrottle: !!c.autoThrottle,
      haptics: !!c.haptics,
    });
    if (save) this._savePrefs();
  }

  _syncSettingsSliders() {
    const setSlider = (id, pct) => {
      const el = document.getElementById(id);
      const valEl = document.getElementById(`${id}-val`);
      const v = Math.round(pct);
      if (el) el.value = String(v);
      if (valEl) valEl.textContent = `${v}%`;
    };
    setSlider('slider-ctrl-sens', this.prefs.control.sensitivity * 100);
    setSlider('slider-ctrl-scale', this.prefs.control.controlScale * 100);
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
      pill.textContent = `🏆 S${st.seasonNumber} • R${(round?.round || st.currentRoundIdx + 1)}/${total} • ${team?.shortName || ''}`;
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
    document.body.classList.add('replay-active');
    const ov = document.getElementById('replay-overlay');
    if (ov) ov.style.display = 'flex';
    this.retro1982.setVisible(false);
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

  _switchActiveCircuit(trackId) {
    this.track.loadCircuit(trackId);
    this.effects.clearAllDebris();
    this.pitCrewDiorama.repositionForTrack(this.track);
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
      this.config.visualStyle === '1982_ARCADE' ? '1982 NAMCO 1:1 ARCADE' : '2026 AAA HDR + BLOOM',
      1200,
      '#ffd600'
    );
  }

  _applyVisualShaderStyle() {
    const isArcade = this.config.visualStyle === '1982_ARCADE';
    document.body.classList.toggle('arcade-shader-active', isArcade);
    const shaderBtn = document.getElementById('btn-live-shader');
    if (shaderBtn) shaderBtn.textContent = isArcade ? '🕹️ 82' : '✨ 26';
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
    if (this.elapsedSec - this._lastCrowdCheerSec < 2.5) return;
    this._lastCrowdCheerSec = this.elapsedSec;
    this.audio.playCrowdCheer?.(intensity);
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
    this._refreshShowroomLighting();
    this._buildCarsForSession(8, true, this.config.startingCompound);

    // Park the gleaming #1 Hero F1 Car on Pole Position under the Start Gantry!
    if (this.playerCar) {
      this.playerCar.s = 993.5;
      this.playerCar.lateralOffset = -3.0;
      this.playerCar.speedKmh = 0;
      this.playerCar.relYaw = 0;
      const pFr = this.track.sampleAt(this.playerCar.s, this.playerCar.lateralOffset);
      this._camLook.copy(pFr.pos).add(new THREE.Vector3(0, 0.68, 0));
      this.camera.position.copy(pFr.pos).add(new THREE.Vector3(-4.6, 1.72, -4.4));
    }
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
    this.hud.setModeVisibility(this.config.mode);
    this.hud.setSpeedUnit(this.prefs.speedUnit);
    this.replay.reset();

    // Roll ONE fixed weather regime for this entire race weekend (NEVER changes mid-race!)
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
      s: isShowroom ? 993.5 : 0.4,
      lateralOffset: isShowroom ? -3.0 : -2.2,
      compound: startComp,
      gearboxMode: gbMode,
      fuelLaps: lenCfg.startingFuelMax,
      maxFuelLaps: 15.0,
    });
    this.playerCar.liveryHex = '#00ff88';

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
      this.playerCar.liveryHex = team.primaryHex;
      this.playerCar.teamName = team.shortName;
    }
    this.scene.add(playerRig.root);
    this.carRigs.set(this.playerCar.id, playerRig);
    this.allCars.push(this.playerCar);

    // Career Car R&D + Team Perks + Setup modifiers (2026 Pro GP only — 1982 stays pure arcade)
    if (!isClassic && !isShowroom && this.career) {
      const mods = this.career.getPhysicsModifiers();
      this.playerCar.perfMods = mods;
      const fuelMult = Number.isFinite(mods.fuelLoadMult) ? mods.fuelLoadMult : 1.0;
      this.playerCar.fuelLaps = Math.min(this.playerCar.maxFuelLaps, lenCfg.startingFuelMax * fuelMult);
    }

    // Rival AI Vehicles
    const rivalCount = Math.max(1, totalCars - 1);
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
        lateralOffset: isShowroom ? 3.2 : (i % 2 === 0 ? -1 : 1) * 2.8,
        compound: aiComp,
        gearboxMode: 'AUTO_8SPD',
        fuelLaps: lenCfg.startingFuelMax + 0.5,
        maxFuelLaps: 15.0,
      });
      aiCar.liveryHex = `#${def.primary.toString(16).padStart(6, '0')}`;
      this.aiController.initAICar(aiCar, def, i);

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

    this._buildCarsForSession(totalCars, false, startComp);

    this.playerCar.s = 0.5;
    this.playerCar.totalDistanceGameM = 0.5;
    this.playerCar.currentLapTime = 0;
    this.playerCar.lateralOffset = -2.4;
    this.playerCar.lateralVel = 0;
    this.playerCar.relYaw = 0;
    this.playerCar.steerInput = 0;
    this.playerCar.steerAngleRad = 0;

    this.state = GAME_STATES.QUALIFYING;
    this.masterTimerSec = CLASSIC_1982_RULES.qualifyingMasterTimer;
    this.countdownTimer = 3.2;
    this.lastBeepSecond = 4;
    this.controlsLocked = true;
    this.controls.setGearboxUI(this._activeGearboxMode(), 1);
    this._syncScreenLayers();

    this.hud.showCenterCallout('PREPARE TO QUALIFY!', 2600, '#ffd600');
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

    this.hud.showCenterCallout(
      `QUALIFIED ${ordinalSuffix(this.qualifiedGridSlot)}! +${this.qualifyingBonus} PTS`,
      2400,
      '#00ff88'
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
    this.hud.syncBoxButtonState();

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
    const qText = this.qualifyingTime
      ? `GRID ${ordinalSuffix(this.qualifiedGridSlot)} (${formatLapTimeArcade(this.qualifyingTime)})`
      : `GRID ${ordinalSuffix(this.qualifiedGridSlot)} • ${reg.icon} ${reg.label}`;
    this.hud.showCenterCallout(qText, 3000, '#00e5ff');
    this._play1982FanfareIfArcade('RACE');

    if (this.config.mode === '2026_UPDATED' && (startComp === 'INTERMEDIATE' || startComp === 'FULL_WET') && startComp !== this.config.startingCompound) {
      this.hud.showEngineerRadio(`Wet track conditions — fitted ${startComp.replace('_', ' ')} tires for launch!`);
    } else if (this.config.mode === '2026_UPDATED' && this._careerRoundActive) {
      const round = this.career.getCurrentRound();
      this.hud.showEngineerRadio(`Round ${round?.round || 1} — ${round?.gpTitle || 'Grand Prix'}. Starting on ${startComp}. Let's score big points!`);
    }
  }

  _beginGreenFlagRacing() {
    this.controlsLocked = false;
    this.state = GAME_STATES.RACING;
    this.track.setGantryLights(0, true, false);
    this.audio.playStartBeep(true);
    this.hud.showCenterCallout('LIGHTS OUT AND AWAY WE GO!', 1600, '#00ff88');
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
        this._lastCareerResult = this.career.recordRaceWeekendResult({
          trackId: this.config.trackId,
          finishPos: playerRank,
          gridPos: this.qualifiedGridSlot,
          fastestLap: !!(pBest && pBest > 0 && pBest <= bestAi),
          overtakes: this.overtakesCount,
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

    const kickerEl = document.getElementById('podium-circuit-kicker');
    if (kickerEl) {
      kickerEl.textContent = `${this.track.trackDef.name} • ${reg.icon} ${reg.label} • OFFICIAL CLASSIFICATION`;
    }

    const titleEl = document.getElementById('podium-headline');
    if (titleEl) {
      titleEl.textContent = expired
        ? '⏱️ TIME EXPIRED — GAME OVER'
        : `🏁 FINISHED ${ordinalSuffix(playerRank)} PLACE!`;
    }

    const podiumIds = ['podium-p1', 'podium-p2', 'podium-p3'];
    podiumIds.forEach((id, idx) => {
      const el = document.getElementById(id);
      const car = standings[idx];
      if (el && car) {
        const medal = idx === 0 ? '🏆 1ST' : (idx === 1 ? '🥈 2ND' : '🥉 3RD');
        el.innerHTML = `
          <div class="pod-rank">${medal}</div>
          <div class="pod-livery-bar" style="background:${car.isPlayer ? (this.playerCar.liveryHex || '#e41c24') : (car.liveryHex || '#ff9800')}"></div>
          <div class="pod-driver" style="color:${car.isPlayer ? '#00ff88' : '#ffffff'}">${car.name}</div>
          <div class="pod-meta">${car.bestLapTime ? 'BEST ' + formatLapTimeArcade(car.bestLapTime) : 'CLASSIFIED'}</div>
        `;
      }
    });

    const setTxt = (id, val) => {
      const e = document.getElementById(id);
      if (e) e.textContent = val;
    };
    setTxt('res-total-score', Math.floor(this.score).toLocaleString());
    setTxt('res-quali-bonus', `+${this.qualifyingBonus.toLocaleString()} (${ordinalSuffix(this.qualifiedGridSlot)})`);
    setTxt('res-pass-bonus', `+${this.passingBonus.toLocaleString()} (${this.overtakesCount} PASSES)`);
    setTxt('res-time-bonus', `+${this.timeBonus.toLocaleString()}`);
    setTxt('res-fastest-lap', formatLapTimeArcade(this.playerCar.bestLapTime));
    setTxt(
      'res-penalties',
      this.playerCar.timePenaltiesSec > 0 ? `+${this.playerCar.timePenaltiesSec.toFixed(1)}s` : 'NONE (0.0s)'
    );

    const stintEl = document.getElementById('res-pit-stints');
    if (stintEl) {
      if (this.config.mode === '1982_ORIGINAL') {
        stintEl.textContent = `1982 Classic Rules (No Pit Stops) • Weather: ${reg.icon} ${reg.label}`;
      } else if (this.playerCar.pitHistory.length === 0) {
        stintEl.textContent = `0 Stops (${this.playerCar.compound} Stint) • Weather: ${reg.icon} ${reg.label}`;
      } else {
        const stopsTxt = this.playerCar.pitHistory
          .map((p, i) => `Stop ${i + 1} (L${p.lap}): ${p.compound} in ${p.durationSec}s${p.stickyError ? ' [Sticky Gun]' : ''}`)
          .join(' • ');
        stintEl.textContent = `${stopsTxt} • ${reg.icon} ${reg.label}`;
      }
    }

    // Career Championship reward banner
    const banner = document.getElementById('podium-career-banner');
    const cr = this._lastCareerResult;
    if (banner) {
      if (cr) {
        const finale = cr.seasonCompleted
          ? `<div class="pcb-finale">${escapeHtml(cr.seasonFinaleBanner || (cr.crownedWorldChampion ? '👑 WORLD CHAMPION!' : 'SEASON COMPLETE'))}</div>`
          : '';
        banner.innerHTML = `
          <div class="pcb-kicker">🏆 ${escapeHtml(cr.roundTitle || cr.gpTitle || 'CHAMPIONSHIP ROUND')} • ROUND ${cr.roundNumber}/${cr.totalRounds}</div>
          <div class="pcb-row">
            <span class="pcb-chip pts">+${cr.pointsEarned} FIA PTS</span>
            <span class="pcb-chip cash">+${escapeHtml(formatCredits(cr.totalPayout ?? cr.prizeMoney))} R&amp;D</span>
            <span class="pcb-chip rank">CHAMPIONSHIP P${cr.playerChampionshipRank} • ${cr.playerSeasonPoints} PTS</span>
            ${cr.gotPole ? '<span class="pcb-chip">POLE +</span>' : ''}
            ${cr.gotFastestLap ? '<span class="pcb-chip">FASTEST LAP +</span>' : ''}
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
        againLbl.textContent = `🏁 NEXT: R${cr.nextRound.round || ''} ${String(cr.nextRound.venue || cr.nextRound.gpTitle || '').toUpperCase()}`;
      } else if (this._careerRoundActive) {
        againLbl.textContent = '🏁 NEXT CHAMPIONSHIP ROUND';
      } else {
        againLbl.textContent = '🏁 RACE AGAIN (NEW WEATHER)';
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
  // MASTER 60+ FPS RENDER & DECOUPLED 240HZ PHYSICS STEPPER
  // --------------------------------------------------------------------------
  _frameLoop(nowMs) {
    requestAnimationFrame((ts) => this._frameLoop(ts));

    const rawDt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastFrameMs) * 0.001));
    this.lastFrameMs = nowMs;
    this.elapsedSec += rawDt;

    const inReplay = !!this.replay?.isPlaying;
    const simFrozen = this.paused || inReplay;

    // 1. Poll Mobile Multi-Touch + Keyboard + Gamepad Controls
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
          this.hud.showCenterCallout(String(whole), 700, '#ff3d00');
        }
        if (this.countdownTimer <= 0) {
          this.controlsLocked = false;
          this.track.setGantryLights(0, true, false);
          this.audio.playStartBeep(true);
          this.hud.showCenterCallout('GO! FLYING LAP!', 1500, '#00ff88');
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
      this.physicsAccumulator += rawDt;
      let subSteps = 0;
      while (this.physicsAccumulator >= PHYSICS_DT && subSteps < 14) {
        this._stepSimulation240Hz(PHYSICS_DT);
        this.physicsAccumulator -= PHYSICS_DT;
        subSteps++;
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

    // 4. CAMERA FIRST (live director or TV replay director) so sky dome / weather / shadows
    //    are positioned from THIS frame's camera — zero 1-frame skybox lag.
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
      this._updateCameraDirector(rawDt);
    }

    // 5. Focus Shadow Target, Weather, Track Shaders, Marshal Flags, Pit Crew & VFX
    let focusPos = this.camera.position;
    if (inReplay && replayState?.focusWorldPos) {
      focusPos = replayState.focusWorldPos;
    } else if (this.playerCar) {
      focusPos = this.track.sampleAt(this.playerCar.s, this.playerCar.lateralOffset).pos;
    }

    this.weather.update(rawDt, this.camera.position, focusPos, this.config.visualStyle, {
      onThunder: () => this.audio.playThunderRumble(),
    });

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
      } else if (!playerServicing && this.state === GAME_STATES.PIT_STOP) {
        this.state = GAME_STATES.RACING;
      }
    }

    const pitProgress = playerServicing && this.playerCar.pitStopTotalDuration > 0
      ? Math.max(0, Math.min(1, 1 - this.playerCar.pitStopTimer / this.playerCar.pitStopTotalDuration))
      : 0;
    this.pitCrewDiorama.update(playerServicing && !inReplay, pitProgress, this.elapsedSec);
    if (!this.paused) this.effects.update(rawDt);

    // 6. Sync All 3D Car Rigs & Persistent Tire Skidmarks (replay director drives rigs itself)
    if (!inReplay) {
      const rigDt = this.paused ? 0 : rawDt;
      for (const car of this.allCars) {
        const rig = this.carRigs.get(car.id);
        if (!rig) continue;
        rig.root.visible = !car.exploded;
        const fr = this.track.sampleAt(car.s, car.lateralOffset);
        rig.updateTransformAndVFX(car, fr, this.weather.grooveMoisture, rigDt, this.elapsedSec);

        if (!this.paused && car.skidIntensity > 0.42 && car.speedKmh > 40 && !car.exploded && Math.random() < 0.45) {
          const yaw = Math.atan2(fr.tangent.z, fr.tangent.x) + car.relYaw;
          this.track.addSkidmark(fr.pos, yaw);
        }
      }
    }

    // 7. Speed Tunnel Vignette & Audio Update
    if (this._speedVignetteEl) {
      if (this.state === GAME_STATES.PRE_RACE_MENU || !this.playerCar || inReplay || this.paused) {
        this._speedVignetteEl.style.opacity = '0';
      } else {
        const vig = Math.max(0, Math.min(0.88, (this.playerCar.speedKmh - 225) / 95));
        this._speedVignetteEl.style.opacity = vig.toFixed(2);
      }
    }

    const inShowroom = this.state === GAME_STATES.PRE_RACE_MENU;
    const activePlay =
      (this.state === GAME_STATES.QUALIFYING || this.state === GAME_STATES.RACING || this.state === GAME_STATES.PIT_STOP) &&
      !this.controlsLocked && !simFrozen;
    this.audio.updateContinuous(
      this.playerCar || { rpm: 0 },
      this.config.mode === '1982_ORIGINAL' ? 0 : this.weather.grooveMoisture,
      activePlay || (this.state === GAME_STATES.GRID_LINEUP && !simFrozen),
      this.config.visualStyle,
      inShowroom || simFrozen
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
            : (isClassic ? 'TIME LEFT' : 'RACE CLOCK'),
          currentLap: this.playerCar.lap,
          totalLaps: this._activeTotalLaps(),
          playerPos,
          totalCars: this.allCars.length,
          playerCar: this.playerCar,
          allCars: this.allCars,
          weatherSummary: this.weather.getForecastSummary(),
        });
      }
    }

    // 8. Render: 1:1 1982 Namco raster renderer, or MSAA HDR Bloom Composer / direct renderer
    const retroActive = this._isRetroRendererActive();
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
      this.retro1982.renderFrame({
        track: this.track,
        playerCar: this.playerCar,
        allCars: this.allCars,
        weather: this.weather,
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
      });
    } else if (this.config.visualStyle === '2026_PBR' || inReplay) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  _stepSimulation240Hz(dt) {
    const isShowroom = this.state === GAME_STATES.PRE_RACE_MENU;
    const isQuali = this.state === GAME_STATES.QUALIFYING;
    const isRacing = this.state === GAME_STATES.RACING || this.state === GAME_STATES.PIT_STOP;
    const totalLaps = this._activeTotalLaps();

    if (this.state === GAME_STATES.RACE_RESULTS) return;

    const simCallbacks = {
      onGearShift: (car, nextGear, shiftDir) => {
        if (car.isPlayer) this._onPlayerGearShift(car, nextGear, shiftDir);
      },
      onBackfire: (car) => {
        if (car.isPlayer) this.audio.playBackfirePop();
        this.carRigs.get(car.id)?.triggerBackfire(0.14);
      },
      onHydroplane: (car) => {
        if (car.isPlayer) {
          this.audio.playHydroplaneSplash();
          this.hud.showCenterCallout('💦 AQUAPLANING!', 850, '#40c4ff');
        }
      },
      onPuncture: (car, corner) => {
        if (car.isPlayer) {
          this.audio.playWingDamageCrunch();
          this.hud.showCenterCallout(`🛞 ${corner} TIRE PUNCTURE! BOX NOW!`, 2600, '#ff1744');
          this.hud.showEngineerRadio(`We have a ${corner} puncture! Limp to the pits this lap!`);
          this.audio.speakAnnouncement('Tire puncture! Box, box this lap!', true);
        }
      },
      onExplosion: (car) => {
        if (car.isPlayer) {
          this.audio.play1982ExplosionBoom();
          this.hud.showCenterCallout('💥 CRASH!', 1600, '#ff3d00');
        }
      },
      onCollision: (car, speedKmh, part) => {
        if (car.isPlayer) {
          this.audio.playWingDamageCrunch();
          if (part === 'FRONT_WING' && car.damage.frontWing > 0.35) {
            this.hud.showEngineerRadio('Front wing damage! Expect understeer in fast corners.');
          }
        }
      },
      onLocalYellow: (sec) => {
        this.audio.playYellowFlagChime();
        const msg = `Yellow flag in Sector ${sec.id} — no overtaking!`;
        this.hud.showEngineerRadio(msg);
        this.audio.speakAnnouncement(msg, true);
      },
      onVSCDeployed: () => {
        this.audio.playYellowFlagChime();
        const msg = 'Virtual Safety Car deployed! Cheap pit window open!';
        this.hud.showEngineerRadio(msg);
        this.audio.speakAnnouncement(msg, true);
      },
      onVSCEnded: () => {
        this.hud.showCenterCallout('🟢 VSC ENDING — GREEN FLAG!', 1600, '#00ff88');
      },
      onYellowIllegalPassWarning: (rivalName) => {
        this.audio.playYellowFlagChime();
        this.hud.showEngineerRadio(`Illegal pass under yellow! Give position back to ${rivalName}!`);
      },
      onYellowPenaltyIssued: (sec) => {
        this.hud.showCenterCallout(`+${sec.toFixed(0)}s YELLOW FLAG PENALTY!`, 2000, '#ff1744');
      },
      onPlayerPitStopped: () => {
        this.audio.playWheelGunWhir();
      },
      onPlayerPitReleased: (car, sec) => {
        this.audio.playStartBeep(true);
        this.hud.showEngineerRadio(`Clean stop in ${sec.toFixed(2)}s on ${car.compound} tires — push now!`);
      },
      onPitSpeeding: (penSec) => {
        this.audio.playYellowFlagChime();
        this.hud.showCenterCallout(`PIT SPEEDING >80 KM/H! +${penSec}s PENALTY`, 2200, '#ff1744');
      },
      onCompoundVisualChanged: (car) => {
        this.carRigs.get(car.id)?.setCompound(car.compound);
      },
      onLapCrossed: (car) => this._onCarCrossedLine(car, isQuali, isRacing, totalLaps),
    };

    const physCtx = {
      track: this.track,
      weather: this.weather,
      mode: isShowroom ? '2026_UPDATED' : this.config.mode,
      raceLengthId: this.config.raceLengthId,
      isQualifying: isQuali,
      vscActive: this.raceSystems.vscActive,
      controlsLocked: isShowroom ? false : this.controlsLocked,
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
      // In Showroom Menu, keep the #1 Player Car parked majestically on Pole while AI rivals streak past on the right!
      if (isShowroom && car.isPlayer) {
        car.speedKmh = 0;
        car.rpm = 0;
        continue;
      }

      if (!car.isPlayer) {
        this.aiController.updateAI(car, this.allCars, this.playerCar, dt, physCtx);
        if (isShowroom && (car.s > 965 || car.s < 28)) {
          // Keep right-hand showroom corridor clear around parked #1 Pole car
          car.aiTargetLat = Math.max(2.6, car.aiTargetLat);
        }
      }

      if (!isShowroom && isRacing) {
        this.raceSystems.updatePitLaneForCar(car, dt, physCtx);
      }

      const lockThisCar = car.isPlayer ? physCtx.controlsLocked : (this.state === GAME_STATES.GRID_LINEUP);
      stepVehiclePhysics240Hz(car, dt, { ...physCtx, controlsLocked: lockThisCar });
    }

    if (!isShowroom && (isQuali || isRacing) && !this.controlsLocked) {
      this.raceSystems.updateCollisionsAndCautions(this.allCars, this.playerCar, dt, physCtx);

      if (this.playerCar.totalDistanceGameM - this.distanceScoredMeters >= 5.0) {
        const chunks = Math.floor((this.playerCar.totalDistanceGameM - this.distanceScoredMeters) / 5.0);
        this.distanceScoredMeters += chunks * 5.0;
        this.score += chunks * CLASSIC_1982_RULES.pointsPer5Meters;
        this._checkTopScore();
      }

      // +50 pts + Doppler Pass Whoosh when overtaking rivals!
      if (isRacing && !this.playerCar.exploded) {
        let nowRivalsAhead = 0;
        for (const c of this.allCars) {
          if (!c.isPlayer && c.totalDistanceGameM > this.playerCar.totalDistanceGameM) nowRivalsAhead++;
        }
        if (nowRivalsAhead < prevRivalsAhead) {
          const passed = prevRivalsAhead - nowRivalsAhead;
          this.overtakesCount += passed;
          const pts = passed * CLASSIC_1982_RULES.pointsPerOvertake;
          this.passingBonus += pts;
          this.score += pts;
          this._checkTopScore();
          this.audio.playOvertakeWhoosh(Math.max(36, this.playerCar.speedKmh * 0.22));
          if (nowRivalsAhead === 0) {
            this._cheerCrowd(0.95);
            this.hud.showCenterCallout('🏆 P1 — INTO THE LEAD!', 1500, '#ffd600');
          }
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
          this.hud.showEngineerRadio('Tires have hit the 25% cliff! Box, box this lap!');
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
    car.lastLapTime = completedLapSec;
    if (!car.bestLapTime || completedLapSec < car.bestLapTime) {
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
        this.masterTimerSec += CLASSIC_1982_RULES.extendedPlayBonusSec;
        this.hud.showCenterCallout(
          `EXTENDED PLAY! +58s • LAP ${formatLapTimeArcade(completedLapSec)}`,
          2200,
          '#00ff88'
        );
        this.audio.playStartBeep(true);
      } else {
        const isFinal = car.lap === totalLaps;
        this.hud.showCenterCallout(
          isFinal
            ? `🔔 FINAL LAP! (${formatLapTimeArcade(completedLapSec)})`
            : `LAP ${car.lap}/${totalLaps} • ${formatLapTimeArcade(completedLapSec)}`,
          2000,
          isFinal ? '#ffd600' : '#00e5ff'
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
  // 3D SHOWROOM HERO ORBIT, PIT BROADCAST & DYNAMIC CHASE CAMERA DIRECTOR
  // --------------------------------------------------------------------------
  _updateCameraDirector(dt) {
    if (!this.playerCar) return;
    const pFr = this.track.sampleAt(this.playerCar.s, this.playerCar.lateralOffset);

    // 1. AAA Gran Turismo / F1 Showroom Low-Angle Hero Orbit on Start Screen!
    if (this.state === GAME_STATES.PRE_RACE_MENU) {
      if (this._orbitDragPointer === null) {
        this.showroomYawOffset += dt * 0.24; // Smooth cinematic auto-orbit when not dragging
        this.showroomPitchOffset += (0.0 - this.showroomPitchOffset) * Math.min(1, dt * 1.8);
      }
      const fwdYaw = Math.atan2(pFr.tangent.z, pFr.tangent.x);
      const camAng = fwdYaw + this.showroomYawOffset;
      const isPortrait = (window.innerWidth / window.innerHeight) < 0.85;
      const radius = isPortrait ? 6.6 : 5.5;
      const height = 1.42 + this.showroomPitchOffset + Math.sin(this.elapsedSec * 0.65) * 0.24;

      const targetPos = new THREE.Vector3(
        pFr.pos.x + Math.cos(camAng) * radius,
        pFr.pos.y + height,
        pFr.pos.z + Math.sin(camAng) * radius
      );
      const lookTarget = new THREE.Vector3(pFr.pos.x, pFr.pos.y + 0.64, pFr.pos.z);

      const desiredFov = isPortrait ? 60 : 49;
      if (Math.abs(this.camera.fov - desiredFov) > 0.2) {
        this.camera.fov += (desiredFov - this.camera.fov) * Math.min(1, dt * 6);
        this.camera.updateProjectionMatrix();
      }

      this.camera.position.lerp(targetPos, Math.min(1, dt * 6.5));
      this._camLook.lerp(lookTarget, Math.min(1, dt * 8.0));
      this.camera.lookAt(this._camLook);
      return;
    }

    // 2. Post-Race Podium Orbit Camera
    if (this.state === GAME_STATES.RACE_RESULTS) {
      const ang = this.elapsedSec * 0.55;
      const target = pFr.pos.clone().add(new THREE.Vector3(Math.cos(ang) * 9.0, 3.3, Math.sin(ang) * 9.0));
      this.camera.position.lerp(target, Math.min(1, dt * 4));
      this.camera.lookAt(pFr.pos.x, pFr.pos.y + 0.85, pFr.pos.z);
      return;
    }

    // 3. Dedicated Pit Box Crew Broadcast Angle
    if (this.state === GAME_STATES.PIT_STOP) {
      const pitCamPos = pFr.pos
        .clone()
        .addScaledVector(pFr.tangent, 6.2)
        .addScaledVector(pFr.right, -4.4)
        .add(new THREE.Vector3(0, 3.2, 0));
      this.camera.position.lerp(pitCamPos, Math.min(1, dt * 6.5));
      this._camLook.lerp(pFr.pos.clone().add(new THREE.Vector3(0, 0.75, 0)), Math.min(1, dt * 8));
      this.camera.lookAt(this._camLook);
      return;
    }

    // 4. Active Racing / Qualifying Camera Modes (0: Chase, 1: T-Cam Cockpit, 2: 1982 High Arcade)
    let backDist = 6.5;
    let upHeight = 2.32;
    let lookAhead = 22.0;

    if (this.cameraModeIdx === 1) {
      backDist = 0.55;
      upHeight = 1.18;
      lookAhead = 34.0;
    } else if (this.cameraModeIdx === 2 || this.config.visualStyle === '1982_ARCADE') {
      backDist = 8.2;
      upHeight = 3.20;
      lookAhead = 26.0;
    }

    const baseFov = (window.innerWidth / window.innerHeight) < 0.85 ? 68 : 58;
    const speedFovBoost = (this.playerCar.speedKmh / 320) * (this.playerCar.inSlipstream ? 11.5 : 8.0);
    const desiredFov = baseFov + speedFovBoost;
    if (Math.abs(this.camera.fov - desiredFov) > 0.15) {
      this.camera.fov += (desiredFov - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }

    const curbShakeY = this.playerCar.onCurb && this.playerCar.speedKmh > 40
      ? (Math.random() - 0.5) * 0.08
      : 0;

    // Subtle lateral apex lean into corners for visceral chase-cam flow
    const apexSwing = -this.playerCar.steerInput * 0.55;

    const desiredPos = pFr.pos
      .clone()
      .addScaledVector(pFr.tangent, -backDist)
      .addScaledVector(pFr.right, apexSwing)
      .addScaledVector(pFr.normal, upHeight + curbShakeY);

    const desiredLook = pFr.pos
      .clone()
      .addScaledVector(pFr.tangent, lookAhead)
      .addScaledVector(pFr.normal, 1.02);

    if (this.cameraModeIdx === 1) {
      this.camera.position.copy(desiredPos);
      this.camera.lookAt(desiredLook);
    } else {
      this.camera.position.lerp(desiredPos, Math.min(1, dt * 16.5));
      this._camLook.lerp(desiredLook, Math.min(1, dt * 18.5));
      this.camera.lookAt(this._camLook);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const game = new PolePosition2026Game();
  window.__RACE_PHANATIC_GAME__ = game;
  game.init().catch((err) => {
    console.error('[PolePosition2026] Initialization error:', err);
  });
});
