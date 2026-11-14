// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Master Engine, State Machine, 240Hz Loop, Camera Director & Scoring Rules
// ============================================================================

import * as THREE from 'three';
import {
  PHYSICS_DT,
  TRACK_GAME_LENGTH,
  GAME_STATES,
  QUALIFYING_RANK_A_TABLE,
  CLASSIC_1982_RULES,
  PRO_2026_LENGTHS,
  AI_DRIVER_ROSTER,
  PIT_LANE_CONFIG,
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

class PolePosition2026Game {
  constructor() {
    // Player-selected configuration
    this.config = {
      mode: '2026_UPDATED',         // '1982_ORIGINAL' | '2026_UPDATED'
      handedness: 'RIGHT_HANDED',   // 'RIGHT_HANDED' | 'LEFT_HANDED'
      classicLaps: 4,               // 3 | 4 | 5
      raceLengthId: 'SHORT',        // 'SHORT' (5) | 'MEDIUM' (12) | 'LONG' (25)
      runQualifying2026: true,
      startingCompound: 'SOFT',
      gearboxMode: 'CLASSIC_2SPD',  // 'CLASSIC_2SPD' | 'PRO_6SPD'
      gridSize: 8,                  // 8 | 16
      weatherPreset: 'DYNAMIC',
      visualStyle: '2026_PBR',      // '2026_PBR' | '1982_ARCADE'
    };

    this.state = GAME_STATES.PRE_RACE_MENU;
    this.cameraModeIdx = 0; // 0: Chase, 1: Cockpit T-Cam, 2: 1982 High Arcade

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
    this.controlsLocked = true;

    this.playerCar = null;
    this.allCars = [];
    this.carRigs = new Map();

    this.physicsAccumulator = 0.0;
    this.elapsedSec = 0.0;
    this.lastFrameMs = performance.now();

    this._camPos = new THREE.Vector3(0, 6, -12);
    this._camLook = new THREE.Vector3(10, 1.5, 0);
  }

  async init() {
    this._setupRendererAndScene();

    this.assets = new AssetLibrary();
    await this.assets.loadAll();

    this.track = new FujiTrack(this.scene);
    this.mountFuji = this.assets.attachMountFuji(this.scene);
    this.effects = new EffectsManager(this.scene, this.track);
    this.weather = new WeatherSystem(this.scene);
    this.raceSystems = new RaceSystemsController(this.track, this.effects);
    this.aiController = new SpatialAIController(this.track, this.weather, this.raceSystems);
    this.pitCrewDiorama = new PitCrewDiorama(this.scene, this.assets, this.track);
    this.audio = new ProceduralAudioEngine();

    this.hud = new TelemetryHUD(this.track, this.raceSystems, {
      onClutchButton: () => this._handleClutchTap(),
    });

    this.controls = new ErgonomicControls({
      onUserInteract: () => this.audio.unlock(),
      onShift: (dir) => {
        if (this.playerCar && !this.controlsLocked) {
          shiftGear(this.playerCar, dir, {
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
        this.cameraModeIdx = (this.cameraModeIdx + 1) % 3;
        const names = ['CHASE CAM', 'T-CAM COCKPIT', '1982 HIGH CAM'];
        this.hud.showCenterCallout(names[this.cameraModeIdx], 1100, '#00e5ff');
      },
      onTogglePitDrawer: () => {
        if (this.config.mode === '2026_UPDATED') this.hud.togglePitDrawer();
      },
    });

    this._bindMenuAndModals();
    this._applyVisualShaderStyle();
    this._spawnAttractBackgroundGrid();

    const loadingEl = document.getElementById('boot-loading');
    if (loadingEl) loadingEl.style.display = 'none';

    requestAnimationFrame((ts) => this._frameLoop(ts));
  }

  _setupRendererAndScene() {
    const container = document.getElementById('webgl-container');
    this.renderer = new THREE.WebGLRenderer({
      antialias: window.devicePixelRatio < 2,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.35, 7000);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      // Slightly widen vertical field / FOV comfort on narrow portrait mobile screens
      this.camera.fov = this.camera.aspect < 0.85 ? 72 : 62;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    // Set initial portrait/landscape FOV
    this.camera.fov = (window.innerWidth / window.innerHeight) < 0.85 ? 72 : 62;
    this.camera.updateProjectionMatrix();
  }

  _activeTotalLaps() {
    if (this.config.mode === '1982_ORIGINAL') return this.config.classicLaps;
    return PRO_2026_LENGTHS[this.config.raceLengthId]?.laps || 5;
  }

  _activeGearboxMode() {
    return this.config.mode === '1982_ORIGINAL' ? 'CLASSIC_2SPD' : this.config.gearboxMode;
  }

  // --------------------------------------------------------------------------
  // PRE-RACE MENU, TOP QUICK ACTIONS & POST-RACE MODALS
  // --------------------------------------------------------------------------
  _bindMenuAndModals() {
    const syncMenuUI = () => {
      const is2026 = this.config.mode === '2026_UPDATED';
      document.querySelectorAll('[data-cfg-mode]').forEach((b) =>
        b.classList.toggle('selected', b.dataset.cfgMode === this.config.mode)
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
      document.querySelectorAll('[data-cfg-gearbox]').forEach((b) =>
        b.classList.toggle('selected', b.dataset.cfgGearbox === this.config.gearboxMode)
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

      const box1982 = document.getElementById('cfg-section-1982');
      const box2026 = document.getElementById('cfg-section-2026');
      if (box1982) box1982.style.display = is2026 ? 'none' : 'block';
      if (box2026) box2026.style.display = is2026 ? 'block' : 'none';

      const lenDesc = document.getElementById('cfg-length-summary');
      if (lenDesc && is2026) {
        lenDesc.textContent = PRO_2026_LENGTHS[this.config.raceLengthId]?.pitSummary || '';
      }
    };

    const bindGroup = (attr, handler) => {
      document.querySelectorAll(`[${attr}]`).forEach((btn) => {
        btn.addEventListener('click', () => {
          this.audio.unlock();
          handler(btn);
          syncMenuUI();
        });
      });
    };

    bindGroup('data-cfg-mode', (b) => { this.config.mode = b.dataset.cfgMode; });
    bindGroup('data-cfg-hand', (b) => {
      this.config.handedness = b.dataset.cfgHand;
      this.controls.setHandedness(this.config.handedness);
    });
    bindGroup('data-cfg-classic-laps', (b) => { this.config.classicLaps = Number(b.dataset.cfgClassicLaps); });
    bindGroup('data-cfg-length', (b) => { this.config.raceLengthId = b.dataset.cfgLength; });
    bindGroup('data-cfg-compound', (b) => { this.config.startingCompound = b.dataset.cfgCompound; });
    bindGroup('data-cfg-gearbox', (b) => { this.config.gearboxMode = b.dataset.cfgGearbox; });
    bindGroup('data-cfg-grid', (b) => { this.config.gridSize = Number(b.dataset.cfgGrid); });
    bindGroup('data-cfg-weather', (b) => { this.config.weatherPreset = b.dataset.cfgWeather; });
    bindGroup('data-cfg-quali2026', (b) => { this.config.runQualifying2026 = b.dataset.cfgQuali2026 === 'ON'; });
    bindGroup('data-cfg-shader', (b) => {
      this.config.visualStyle = b.dataset.cfgShader;
      this._applyVisualShaderStyle();
    });

    document.getElementById('btn-launch-race')?.addEventListener('click', () => {
      this.audio.unlock();
      this.launchFromMenu();
    });

    // Live in-race quick utility pills (Shader, Handedness, Camera, Audio, Menu)
    document.getElementById('btn-live-shader')?.addEventListener('click', () => this.toggleVisualStyle());
    document.getElementById('btn-live-hand')?.addEventListener('click', () => {
      this.config.handedness = this.config.handedness === 'RIGHT_HANDED' ? 'LEFT_HANDED' : 'RIGHT_HANDED';
      this.controls.setHandedness(this.config.handedness);
      this.hud.showCenterCallout(
        this.config.handedness === 'LEFT_HANDED' ? 'LEFT-HANDED HUD' : 'RIGHT-HANDED HUD',
        1000,
        '#00e5ff'
      );
    });
    document.getElementById('btn-live-cam')?.addEventListener('click', () => {
      this.cameraModeIdx = (this.cameraModeIdx + 1) % 3;
    });
    document.getElementById('btn-live-mute')?.addEventListener('click', (e) => {
      this.audio.setMuted(!this.audio.muted);
      e.currentTarget.textContent = this.audio.muted ? '🔇' : '🔊';
    });
    document.getElementById('btn-live-menu')?.addEventListener('click', () => {
      this.returnToPreRaceMenu();
    });

    // DNQ Modal actions
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

    // Post-Race Podium Modal actions
    document.getElementById('btn-podium-again')?.addEventListener('click', () => {
      document.getElementById('podium-modal').style.display = 'none';
      this.launchFromMenu();
    });
    document.getElementById('btn-podium-menu')?.addEventListener('click', () => {
      document.getElementById('podium-modal').style.display = 'none';
      this.returnToPreRaceMenu();
    });

    syncMenuUI();
  }

  toggleVisualStyle() {
    this.config.visualStyle = this.config.visualStyle === '2026_PBR' ? '1982_ARCADE' : '2026_PBR';
    this._applyVisualShaderStyle();
    this.hud.showCenterCallout(
      this.config.visualStyle === '1982_ARCADE' ? '1982 CRISP ARCADE SHADER' : '2026 PHOTOREAL PBR SHADER',
      1200,
      '#ffd600'
    );
  }

  _applyVisualShaderStyle() {
    const isArcade = this.config.visualStyle === '1982_ARCADE';
    document.body.classList.toggle('arcade-shader-active', isArcade);
    const shaderBtn = document.getElementById('btn-live-shader');
    if (shaderBtn) shaderBtn.textContent = isArcade ? '🕹️ 82' : '✨ PBR';
  }

  // --------------------------------------------------------------------------
  // SESSION LIFECYCLE & STATE MACHINE TRANSITIONS
  // --------------------------------------------------------------------------
  _clearGridMeshes() {
    for (const rig of this.carRigs.values()) {
      this.scene.remove(rig.root);
    }
    this.carRigs.clear();
    this.allCars = [];
  }

  _spawnAttractBackgroundGrid() {
    this._clearGridMeshes();
    this.weather.configureForSession('2026_UPDATED', 'HOT_SUNNY');
    this._buildCarsForSession(8, true);
    this.state = GAME_STATES.PRE_RACE_MENU;
    this._syncScreenLayers();
  }

  returnToPreRaceMenu() {
    document.getElementById('dnq-modal').style.display = 'none';
    document.getElementById('podium-modal').style.display = 'none';
    this._spawnAttractBackgroundGrid();
  }

  launchFromMenu() {
    this.controls.setHandedness(this.config.handedness);
    this.hud.setModeVisibility(this.config.mode);

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

  _buildCarsForSession(totalCars, isAttract = false) {
    this._clearGridMeshes();
    const isClassic = this.config.mode === '1982_ORIGINAL';
    const lenCfg = PRO_2026_LENGTHS[this.config.raceLengthId] || PRO_2026_LENGTHS.SHORT;
    const startComp = isClassic ? 'SOFT' : this.config.startingCompound;
    const gbMode = this._activeGearboxMode();

    // Player Vehicle
    this.playerCar = createVehicleState({
      id: 'PLAYER',
      isPlayer: true,
      name: 'YOU (PHANATIC #1)',
      short: 'YOU',
      carNum: 1,
      s: isAttract ? 40 : 0.4,
      lateralOffset: -2.2,
      compound: startComp,
      gearboxMode: gbMode,
      fuelLaps: lenCfg.startingFuelMax,
      maxFuelLaps: 15.0,
    });
    this.playerCar.liveryHex = '#00ff88';

    const playerRig = new FormulaCarRig(this.assets, {
      primary: 0xe41c24,
      accent: 0xffffff,
      helmet: 0x00f0ff,
      compound: startComp,
    });
    this.scene.add(playerRig.root);
    this.carRigs.set(this.playerCar.id, playerRig);
    this.allCars.push(this.playerCar);

    // Rival AI Vehicles
    const rivalCount = Math.max(1, totalCars - 1);
    for (let i = 0; i < rivalCount; i++) {
      const def = AI_DRIVER_ROSTER[i % AI_DRIVER_ROSTER.length];
      const aiComp = isClassic
        ? 'SOFT'
        : (this.weather.grooveMoisture > 0.55 ? 'FULL_WET' : (this.weather.grooveMoisture > 0.20 ? 'INTERMEDIATE' : (i % 2 === 0 ? 'SOFT' : 'MEDIUM')));

      const aiCar = createVehicleState({
        id: `AI_${i + 1}`,
        isPlayer: false,
        name: `${def.name} #${def.num}`,
        short: def.short,
        carNum: def.num,
        s: (85 + i * (880 / rivalCount)) % TRACK_GAME_LENGTH,
        lateralOffset: (i % 2 === 0 ? -1 : 1) * 2.8,
        compound: aiComp,
        gearboxMode: gbMode,
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
    this.weather.configureForSession(this.config.mode, this.config.weatherPreset);
    this.raceSystems.resetForNewSession(this.config.startingCompound, 1);
    // 1982 Original: Water puddles spawn ONLY in the Grand Prix, NOT Qualifying!
    this.track.setPuddles1982Mode(false);

    this._buildCarsForSession(totalCars, false);

    // Place player right at s = 0.5 ready for 1-Lap Qualifying flyer; spread AI traffic ahead
    this.playerCar.s = 0.5;
    this.playerCar.totalDistanceGameM = 0.5;
    this.playerCar.currentLapTime = 0;
    this.playerCar.lateralOffset = -2.4;

    this.state = GAME_STATES.QUALIFYING;
    this.masterTimerSec = CLASSIC_1982_RULES.qualifyingMasterTimer; // 90.0s
    this.countdownTimer = 3.2;
    this.lastBeepSecond = 4;
    this.controlsLocked = true;
    this.controls.setGearboxUI(this._activeGearboxMode(), 1);
    this._syncScreenLayers();

    this.hud.showCenterCallout('PREPARE TO QUALIFY!', 2600, '#ffd600');
    this.audio.speakAnnouncement('Prepare to Qualify!', false, true);
  }

  _finishQualifyingLap() {
    const lapSec = this.playerCar.currentLapTime;
    this.qualifyingTime = lapSec;
    this.playerCar.bestLapTime = lapSec;

    // Evaluate against 1982 Rank A Qualifying Grid & Bonus Table
    let matched = null;
    for (const row of QUALIFYING_RANK_A_TABLE) {
      if (lapSec <= row.maxTime) {
        matched = row;
        break;
      }
    }

    if (!matched && this.config.mode === '1982_ORIGINAL') {
      // Slower than 73.00s cutoff in Classic 1982 Mode
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
      // 2026 Mode slow lap -> back of grid, 0 bonus
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

    this.weather.configureForSession(this.config.mode, this.config.weatherPreset);
    this.raceSystems.resetForNewSession(this.config.startingCompound, totalLaps);
    // 1982 Original: Enable standing water puddles in the Grand Prix!
    this.track.setPuddles1982Mode(this.config.mode === '1982_ORIGINAL');

    this._buildCarsForSession(totalCars, false);

    // Arrange staggered 2x2 F1 Starting Grid slots behind Start/Finish line (s = 997 down to 964)
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
      const sBack = 3.2 + idx * 2.1; // 2.1 game-meters (~9.15 real meters) between staggered slots!
      car.s = TRACK_GAME_LENGTH - sBack;
      car.totalDistanceGameM = -sBack;
      car.lap = 1;
      car.currentLapTime = 0;
      car.lateralOffset = idx % 2 === 0 ? -2.8 : 2.8;
      car.speedKmh = 0;
      car.gear = 1;
      car._wasAheadOfPlayer = idx < this.qualifiedGridSlot - 1;
    });

    this.distanceScoredMeters = 0;
    this.sessionElapsedSec = 0;
    this.masterTimerSec = CLASSIC_1982_RULES.initialRaceTimer; // 75.0s checkpoint timer
    this.countdownTimer = 4.2;
    this.lastBeepSecond = 5;
    this.controlsLocked = true;
    this.state = GAME_STATES.GRID_LINEUP;
    this.controls.setGearboxUI(this._activeGearboxMode(), 1);
    this._syncScreenLayers();

    const qText = this.qualifyingTime
      ? `GRID ${ordinalSuffix(this.qualifiedGridSlot)} (${formatLapTimeArcade(this.qualifyingTime)})`
      : `GRID ${ordinalSuffix(this.qualifiedGridSlot)} • LIGHTS OUT SOON`;
    this.hud.showCenterCallout(qText, 3200, '#00e5ff');
  }

  _beginGreenFlagRacing() {
    this.controlsLocked = false;
    this.state = GAME_STATES.RACING;
    this.track.setGantryLights(0, true, false);
    this.audio.playStartBeep(true);
    this.hud.showCenterCallout('GREEN! GREEN! GO!', 1600, '#00ff88');
    setTimeout(() => {
      if (this.state === GAME_STATES.RACING) {
        this.track.setGantryLights(0, false, false);
      }
    }, 3000);
  }

  _completeGrandPrix(expired1982Timer = false) {
    this.state = GAME_STATES.RACE_RESULTS;
    this.controlsLocked = true;

    const totalLaps = this._activeTotalLaps();
    const standings = this._computeStandings();
    const playerRank = standings.findIndex((c) => c.isPlayer) + 1;

    if (!expired1982Timer) {
      if (this.config.mode === '1982_ORIGINAL') {
        this.timeBonus = Math.floor(Math.max(0, this.masterTimerSec)) * CLASSIC_1982_RULES.pointsPerRemainingSec;
      } else {
        // 2026 Championship finish bonus
        const f1Pts = [10000, 7200, 6000, 4800, 4000, 3200, 2400, 1600];
        this.timeBonus = f1Pts[playerRank - 1] || 800;
      }
      this.score += this.timeBonus;
    } else {
      this.timeBonus = 0;
    }

    this._checkTopScore();
    this._populatePodiumModal(standings, playerRank, totalLaps, expired1982Timer);

    if (playerRank === 1 && !expired1982Timer) {
      this.audio.speakAnnouncement('Checkered flag! P 1! Grand Prix Victory!', true, true);
    } else if (expired1982Timer) {
      this.audio.speakAnnouncement('Time expired! Game Over.', false, true);
    } else {
      this.audio.speakAnnouncement(`Checkered flag! Finished ${ordinalSuffix(playerRank)}.`, true, true);
    }
  }

  _populatePodiumModal(standings, playerRank, totalLaps, expired) {
    const modal = document.getElementById('podium-modal');
    if (!modal) return;

    const titleEl = document.getElementById('podium-headline');
    if (titleEl) {
      titleEl.textContent = expired
        ? '⏱️ TIME EXPIRED — GAME OVER'
        : `🏁 FINISHED ${ordinalSuffix(playerRank)} PLACE!`;
    }

    // Top 3 Podium Cards
    const podiumIds = ['podium-p1', 'podium-p2', 'podium-p3'];
    podiumIds.forEach((id, idx) => {
      const el = document.getElementById(id);
      const car = standings[idx];
      if (el && car) {
        el.innerHTML = `
          <div class="pod-rank">${idx === 0 ? '🥇 1ST' : (idx === 1 ? '🥈 2ND' : '🥉 3RD')}</div>
          <div class="pod-driver" style="color:${car.isPlayer ? '#00ff88' : '#ffffff'}">${car.name}</div>
          <div class="pod-meta">${car.bestLapTime ? 'BEST ' + formatLapTimeArcade(car.bestLapTime) : 'FINISHED'}</div>
        `;
      }
    });

    // Breakdown Stats
    const setTxt = (id, val) => {
      const e = document.getElementById(id);
      if (e) e.textContent = val;
    };
    setTxt('res-total-score', Math.floor(this.score).toLocaleString());
    setTxt('res-quali-bonus', `+${this.qualifyingBonus.toLocaleString()} (${ordinalSuffix(this.qualifiedGridSlot)})`);
    setTxt('res-pass-bonus', `+${this.passingBonus.toLocaleString()} (${this.overtakesCount} PASSES)`);
    setTxt('res-time-bonus', `+${this.timeBonus.toLocaleString()}`);
    setTxt('res-fastest-lap', formatLapTimeArcade(this.playerCar.bestLapTime));
    setTxt('res-penalties', this.playerCar.timePenaltiesSec > 0 ? `+${this.playerCar.timePenaltiesSec.toFixed(1)}s` : 'NONE (0.0s)');

    const stintEl = document.getElementById('res-pit-stints');
    if (stintEl) {
      if (this.config.mode === '1982_ORIGINAL') {
        stintEl.textContent = '1982 Classic Rules (No Pit Stops)';
      } else if (this.playerCar.pitHistory.length === 0) {
        stintEl.textContent = `0 Stops (${this.playerCar.compound} Ironman Stint)`;
      } else {
        stintEl.textContent = this.playerCar.pitHistory
          .map((p, i) => `Stop ${i + 1} (L${p.lap}): ${p.compound} in ${p.durationSec}s${p.stickyError ? ' [Sticky Gun]' : ''}`)
          .join(' • ');
      }
    }

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
  }

  _handleClutchTap() {
    if (this.playerCar && this.playerCar.inPitLane && this.playerCar.pitPhase === 'STOPPED') {
      const res = this.raceSystems.attemptClutchRelease(this.playerCar);
      if (res === 'PERFECT') {
        this.audio.playStartBeep(true);
        this.hud.showCenterCallout('OPTIMAL CLUTCH! -0.35s!', 1200, '#00ff88');
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

    // 1. Poll Mobile Multi-Touch + Keyboard + Gamepad Controls
    this.controls.update(rawDt, this.playerCar);
    if (this.playerCar && this.state !== GAME_STATES.PRE_RACE_MENU) {
      this.playerCar.steerInput = this.controls.steer;
      this.playerCar.throttleInput = this.controls.throttle;
      this.playerCar.brakeInput = this.controls.brake;
    }

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
        this.hud.showCenterCallout('GO! QUALIFY <= 73"00!', 1500, '#00ff88');
      }
    } else if (this.state === GAME_STATES.GRID_LINEUP) {
      this.countdownTimer -= rawDt;
      const lightsLit = Math.min(5, Math.max(1, Math.ceil(4.2 - this.countdownTimer)));
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

    // 4. Weather, Track Shaders, Marshal Flags, Pit Crew & VFX Updates
    this.weather.update(rawDt, this.camera.position, this.config.visualStyle, {
      onThunder: () => this.audio.playThunderRumble(),
      onEngineerRadio: (msg) => {
        this.hud.showEngineerRadio(msg);
        this.audio.speakAnnouncement(msg, true);
      },
    });

    this.track.updateVisualState(this.weather.grooveMoisture, this.config.visualStyle);
    this.track.updateMarshalFlags(
      this.raceSystems.getActiveYellowSectorSet(),
      this.raceSystems.vscActive,
      this.elapsedSec
    );

    const playerServicing = !!(this.playerCar && this.playerCar.inPitLane && this.playerCar.pitPhase === 'STOPPED');
    if (playerServicing && this.state === GAME_STATES.RACING) {
      this.state = GAME_STATES.PIT_STOP;
    } else if (!playerServicing && this.state === GAME_STATES.PIT_STOP) {
      this.state = GAME_STATES.RACING;
    }

    this.pitCrewDiorama.update(playerServicing, 0.5, this.elapsedSec);
    this.effects.update(rawDt);

    // 5. Sync All 3D Car Rigs & Persistent Tire Skidmarks
    for (const car of this.allCars) {
      const rig = this.carRigs.get(car.id);
      if (!rig) continue;
      rig.root.visible = !car.exploded;
      const fr = this.track.sampleAt(car.s, car.lateralOffset);
      rig.updateTransformAndVFX(car, fr, this.weather.grooveMoisture, rawDt, this.elapsedSec);

      if (car.skidIntensity > 0.42 && car.speedKmh > 40 && !car.exploded && Math.random() < 0.45) {
        const yaw = Math.atan2(fr.tangent.z, fr.tangent.x) + car.relYaw;
        this.track.addSkidmark(fr.pos, yaw);
      }
    }

    // 6. Camera Director & HUD Update
    this._updateCameraDirector(rawDt);

    const activePlay =
      (this.state === GAME_STATES.QUALIFYING || this.state === GAME_STATES.RACING || this.state === GAME_STATES.PIT_STOP) &&
      !this.controlsLocked;
    this.audio.updateContinuous(
      this.playerCar || { rpm: 0 },
      this.config.mode === '1982_ORIGINAL' ? 0 : this.weather.grooveMoisture,
      activePlay || this.state === GAME_STATES.GRID_LINEUP,
      this.config.visualStyle
    );

    if (this.state !== GAME_STATES.PRE_RACE_MENU && this.playerCar) {
      const standings = this._computeStandings();
      const playerPos = standings.findIndex((c) => c.isPlayer) + 1;
      const isClassic = this.config.mode === '1982_ORIGINAL';

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

    this.renderer.render(this.scene, this.camera);
  }

  _stepSimulation240Hz(dt) {
    const isAttract = this.state === GAME_STATES.PRE_RACE_MENU;
    const isQuali = this.state === GAME_STATES.QUALIFYING;
    const isRacing = this.state === GAME_STATES.RACING || this.state === GAME_STATES.PIT_STOP;
    const totalLaps = this._activeTotalLaps();

    if (this.state === GAME_STATES.RACE_RESULTS) return;

    const simCallbacks = {
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
      mode: isAttract ? '2026_UPDATED' : this.config.mode,
      raceLengthId: this.config.raceLengthId,
      isQualifying: isQuali,
      vscActive: this.raceSystems.vscActive,
      controlsLocked: isAttract ? false : this.controlsLocked,
      totalLaps,
      callbacks: simCallbacks,
    };

    // Track pre-step rank for 1982 +50pt overtake scoring
    let prevRivalsAhead = 0;
    if (isRacing && !this.controlsLocked && this.playerCar) {
      for (const c of this.allCars) {
        if (!c.isPlayer && c.totalDistanceGameM > this.playerCar.totalDistanceGameM) prevRivalsAhead++;
      }
    }

    // Update AI & Physics for all vehicles
    for (const car of this.allCars) {
      if (!car.isPlayer || isAttract) {
        this.aiController.updateAI(car, this.allCars, this.playerCar, dt, physCtx);
      }
      if (!isAttract && isRacing) {
        this.raceSystems.updatePitLaneForCar(car, dt, physCtx);
      }
      // In Qualifying, lock AI until green too? No, in 1982 Pole Position traffic already rolls ahead!
      const lockThisCar = car.isPlayer ? physCtx.controlsLocked : (this.state === GAME_STATES.GRID_LINEUP);
      stepVehiclePhysics240Hz(car, dt, { ...physCtx, controlsLocked: lockThisCar });
    }

    if (!isAttract && (isQuali || isRacing) && !this.controlsLocked) {
      this.raceSystems.updateCollisionsAndCautions(this.allCars, this.playerCar, dt, physCtx);

      // 1982 Scoring: +50 pts per 5 game-meters (10,000 pts per 1,000m lap)
      if (this.playerCar.totalDistanceGameM - this.distanceScoredMeters >= 5.0) {
        const chunks = Math.floor((this.playerCar.totalDistanceGameM - this.distanceScoredMeters) / 5.0);
        this.distanceScoredMeters += chunks * 5.0;
        this.score += chunks * CLASSIC_1982_RULES.pointsPer5Meters;
        this._checkTopScore();
      }

      // +50 pts per overtaken car during Grand Prix
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
        }
      }

      // Session Master Timers
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

      // 2026 Engineer proactive tire cliff / low fuel radio warnings
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
    // Ignore initial grid roll across s=0 on Lap 1 launch (totalDistanceGameM < 500)
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
        // Extended Play +58s checkpoint award!
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
      }
    }
  }

  // --------------------------------------------------------------------------
  // 3D BROADCAST & CHASE CAMERA DIRECTOR
  // --------------------------------------------------------------------------
  _updateCameraDirector(dt) {
    // Menu flyover camera around Fuji Speedway & Mount Fuji
    if (this.state === GAME_STATES.PRE_RACE_MENU) {
      const sOrbit = (this.elapsedSec * 22) % TRACK_GAME_LENGTH;
      const fr = this.track.sampleAt(sOrbit, 0);
      const targetPos = fr.pos
        .clone()
        .addScaledVector(fr.tangent, -18)
        .add(new THREE.Vector3(0, 9.5, 8));
      const lookTarget = fr.pos.clone().addScaledVector(fr.tangent, 38).add(new THREE.Vector3(0, 3.0, -10));
      this.camera.position.lerp(targetPos, Math.min(1, dt * 3.5));
      this._camLook.lerp(lookTarget, Math.min(1, dt * 4.5));
      this.camera.lookAt(this._camLook);
      return;
    }

    if (!this.playerCar) return;
    const pFr = this.track.sampleAt(this.playerCar.s, this.playerCar.lateralOffset);

    // Podium Orbit Camera
    if (this.state === GAME_STATES.RACE_RESULTS) {
      const ang = this.elapsedSec * 0.55;
      const target = pFr.pos.clone().add(new THREE.Vector3(Math.cos(ang) * 9.5, 3.6, Math.sin(ang) * 9.5));
      this.camera.position.lerp(target, Math.min(1, dt * 4));
      this.camera.lookAt(pFr.pos.x, pFr.pos.y + 0.9, pFr.pos.z);
      return;
    }

    // Dedicated Pit Box Broadcast Angle when stationary in Pit Stop!
    if (this.state === GAME_STATES.PIT_STOP) {
      const pitCamPos = pFr.pos
        .clone()
        .addScaledVector(pFr.tangent, 6.2)
        .addScaledVector(pFr.right, -4.4)
        .add(new THREE.Vector3(0, 3.3, 0));
      this.camera.position.lerp(pitCamPos, Math.min(1, dt * 6.5));
      this._camLook.lerp(pFr.pos.clone().add(new THREE.Vector3(0, 0.75, 0)), Math.min(1, dt * 8));
      this.camera.lookAt(this._camLook);
      return;
    }

    // Active Racing / Qualifying Camera Modes (0: Chase, 1: T-Cam Cockpit, 2: 1982 High Arcade)
    let backDist = 6.8;
    let upHeight = 2.45;
    let lookAhead = 22.0;

    if (this.cameraModeIdx === 1) {
      // Close T-Cam / Nose view
      backDist = 0.55;
      upHeight = 1.18;
      lookAhead = 34.0;
    } else if (this.cameraModeIdx === 2 || this.config.visualStyle === '1982_ARCADE') {
      // Classic 1982 Pole Position High Chase Cam
      backDist = 8.4;
      upHeight = 3.25;
      lookAhead = 26.0;
    }

    // Dynamic speed FOV punch + curb micro-shake
    const baseFov = (window.innerWidth / window.innerHeight) < 0.85 ? 70 : 60;
    const speedFovBoost = (this.playerCar.speedKmh / 320) * (this.playerCar.inSlipstream ? 11 : 7.5);
    const desiredFov = baseFov + speedFovBoost;
    if (Math.abs(this.camera.fov - desiredFov) > 0.15) {
      this.camera.fov += (desiredFov - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }

    const curbShakeY = this.playerCar.onCurb && this.playerCar.speedKmh > 40
      ? (Math.random() - 0.5) * 0.09
      : 0;

    const desiredPos = pFr.pos
      .clone()
      .addScaledVector(pFr.tangent, -backDist)
      .addScaledVector(pFr.normal, upHeight + curbShakeY);

    const desiredLook = pFr.pos
      .clone()
      .addScaledVector(pFr.tangent, lookAhead)
      .addScaledVector(pFr.normal, 1.05);

    if (this.cameraModeIdx === 1) {
      this.camera.position.copy(desiredPos);
      this.camera.lookAt(desiredLook);
    } else {
      this.camera.position.lerp(desiredPos, Math.min(1, dt * 16.0));
      this._camLook.lerp(desiredLook, Math.min(1, dt * 18.0));
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
