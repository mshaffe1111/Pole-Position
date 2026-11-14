// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: STUDIO SIM & 1982 WSG AUDIO ENGINE
// Hybrid Multi-RPM Sample-Bank Engine, Dual Acoustic Convolution Reverb (IR),
// Progressive Tire Grip-Limit & Flat-Spot Physics, Carbon-Ceramic Brake Audio,
// Granular Motorsport Stadium Crowd & Hardware-Accurate 1982 Namco 4-Bit WSG
// ============================================================================

const HALF_PI = Math.PI * 0.5;
const TWO_PI = Math.PI * 2.0;

// Sample bank manifest in `assets/audio/` (44.1 kHz 16-bit PCM RIFF WAVE)
const SAMPLE_BANK_SPECS = [
  { key: 'engineIdle', file: 'engine_idle_loop.wav', baseRpm: 3500 },
  { key: 'engineMid', file: 'engine_mid_bark_loop.wav', baseRpm: 8500 },
  { key: 'engineHigh', file: 'engine_high_scream_loop.wav', baseRpm: 13500 },
  { key: 'engineOverrun', file: 'engine_offthrottle_overrun_loop.wav', baseRpm: 8500 },
  { key: 'gearboxWhine', file: 'gearbox_spur_whine_loop.wav', baseSpeedKmh: 200 },
  { key: 'tireScrub', file: 'tire_scrub_limit_loop.wav' },
  { key: 'tireScreech', file: 'tire_lockup_screech_loop.wav' },
  { key: 'curbSawtooth', file: 'curb_sawtooth_loop.wav', baseSpeedKmh: 180 },
  { key: 'aeroWind', file: 'aero_wind_cockpit_loop.wav' },
  { key: 'brakeRotor', file: 'brake_carbon_rotor_loop.wav' },
  { key: 'crowdRoar', file: 'crowd_grandstand_roar_loop.wav' },
  { key: 'irCockpit', file: 'ir_carbon_cockpit.wav', isImpulse: true },
  { key: 'irValley', file: 'ir_grand_prix_valley.wav', isImpulse: true },
];

export class ProceduralAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.initialized = false;
    this.lastSpeechTime = 0;

    // 5-Channel Live Audio Mixer Levels (0.0 .. 1.0)
    this.mixerLevels = {
      master: 1.0,
      engine: 1.0,
      sfx: 1.0,
      voice: 1.0,
      music: 1.0,
    };

    // Master & Sub-Bus Gain Nodes
    this.masterGain = null;
    this.engineBus = null;
    this.sfxBus = null;
    this.voiceBus = null;
    this.musicBus = null;
    this.compressor = null;

    // Dual Real Acoustic Convolution Reverb Architecture (`ConvolverNode`)
    this.reverbSendEngine = null;
    this.reverbSendSfx = null;
    this.cockpitConvolver = null;
    this.valleyConvolver = null;
    this.cockpitWetGain = null;
    this.valleyWetGain = null;

    // Async Sample-Bank State (`assets/audio/*.wav`)
    this.sampleBuffers = {};
    this.samplesLoaded = false;
    this._sampleLoadPromise = null;
    this._sampleGraphWired = false;
    this._sampleBankBlend = 0.0;

    // 4-Layer Loop-Locked Engine Sample Nodes
    this.engineSampleBus = null;
    this.sampleIdleSrc = null;
    this.sampleMidSrc = null;
    this.sampleHighSrc = null;
    this.sampleOverrunSrc = null;
    this.sampleIdleGain = null;
    this.sampleMidGain = null;
    this.sampleHighGain = null;
    this.sampleOverrunGain = null;

    // Drivetrain, Surface & Crowd Sample Loop Nodes
    this.gearboxSampleSrc = null;
    this.gearboxSampleGain = null;
    this.tireScrubSrc = null;
    this.tireScrubFilter = null;
    this.tireScrubGain = null;
    this.tireScreechSrc = null;
    this.tireScreechGain = null;
    this.curbSampleSrc = null;
    this.curbSampleGain = null;
    this.aeroSampleSrc = null;
    this.aeroSampleFilter = null;
    this.aeroSampleGain = null;
    this.brakeRotorSrc = null;
    this.brakeRotorSquealFilter = null;
    this.brakeRotorGain = null;
    this.crowdSampleSrc = null;
    this.crowdSampleFilter = null;
    this.crowdSamplePanner = null;
    this.crowdSampleGain = null;

    // Physical-Modeled F1 Power Unit Synth Nodes (Instant <80ms Fallback + Sub/ERS Reinforcement)
    this.engineSynthMixGain = null;
    this.engineGain = null;
    this.shiftCutGain = null;
    this.oscSub = null;
    this.oscFund = null;
    this.oscOct = null;
    this.oscFifth = null;
    this.oscRasp = null;
    this.subGain = null;
    this.fundGain = null;
    this.octGain = null;
    this.fifthGain = null;
    this.raspGain = null;
    this.airboxFilter = null;
    this.airboxGain = null;
    this.vibratoOsc = null;
    this.vibratoDepth = null;
    this.exhaustFormant = null;
    this.intakeFormant = null;
    this.formantFilter = null; // Alias kept for diagnostic compatibility
    this.lowpassFilter = null;

    // Authentic 1982 Namco WSG 4-Bit PROM Wavetable Arcade Engine Nodes
    this.psgOscA = null;
    this.psgOscB = null;
    this.psgSubOsc = null;
    this.psgFilter = null;
    this.psgEngineGain = null;
    this.retroSkidOsc = null;
    this.retroSkidLfo = null;
    this.retroSkidGain = null;

    // Hybrid MGU-H Turbo, Silicon-Carbide MGU-K Inverter & Gearbox Synth Fallback
    this.oscTurbo = null;
    this.turboGain = null;
    this.oscMgukInverter = null;
    this.mgukFilter = null;
    this.mgukGain = null;
    this.oscGearbox = null;
    this.oscGearboxHarm = null;
    this.gbBand = null;
    this.gearboxSynthGain = null;
    this.gearboxGain = null;

    // Environmental, Surface & Fallback Crowd Synth Loops
    this.aeroSynthGain = null;
    this.aeroGain = null;
    this.aeroFilter = null;
    this.skidSynthGain = null;
    this.skidGain = null;
    this.skidFilter = null;
    this.skidHarmFilter = null;
    this.skidHarmGain = null;
    this.curbSynthGain = null;
    this.curbGain = null;
    this.curbOsc = null;
    this.curbSubOsc = null;
    this.curbFilter = null;
    this.rainGain = null;
    this.brakeSynthGain = null;
    this.brakeSynthFilter = null;
    this.crowdBedFilterL = null;
    this.crowdBedFilterR = null;
    this.crowdBedShimmer = null;
    this.crowdBedPanner = null;
    this.crowdSynthGain = null;
    this.crowdBedGain = null;

    // Calm Gran Turismo / Paddock Showroom Ambient Pad
    this.menuPadGain = null;
    this.menuPadOscs = [];
    this.menuPadLfo = null;

    // Cached Procedural Buffers, Physical/Namco PeriodicWaves & Telemetry State
    this._noisePinkBuf = null;
    this._noiseWhiteBuf = null;
    this._noiseLfsrBuf = null;
    this._ottoPulseWave = null;
    this._ottoV10Wave = null;
    this._namcoWsgBrassWave = null;
    this._namcoWsgEngineWaveA = null;
    this._namcoWsgEngineWaveB = null;
    this._namcoPulse25Wave = null;
    this._shaperCurveEngine = null;
    this._shaperCurveTransient = null;

    this._currentVisualStyle = '2026_PBR';
    this.isRetroMode = false;
    this._isCockpitView = false;
    this._manifoldLoad = 0.25;
    this._prevThrottle = 0;
    this._prevSlipstream = false;
    this._turboSpool = 0;
    this._brakeRotorTemp = 0.15;
    this._nearGrandstandCached = 0.0;
    this._lastUpdateMs = 0;
    this._flatSpotWheelPhase = 0.0;
    this._lastFlatSpotThumpMs = 0;
    this._lastCrackleMs = 0;
    this._lastOvertakeMs = 0;
    this._lastCrowdMs = 0;
    this._lastCrowdSurgeMs = 0;
    this._lastExplicitCrowdUpdateMs = 0;
    this._lastCrowdTickMs = 0;
    this._crowdDopplerPhase = 0;
    this._lastMarblePingMs = 0;
    this._lastWheelGunBurstMs = 0;
    this._wheelGunPanIdx = 0;
    this._lastJackDropMs = 0;
    this._lastFlybyMs = 0;
    this._overtakePanFlip = 1;
    this._flybyPanFlip = 1;
    this._activeFanfareNodes = [];
    this._resumeBound = false;
  }

  // --------------------------------------------------------------------------
  // SAFE WEB AUDIO PARAMETER AUTOMATION HELPERS (ZERO DOMEXCEPTIONS)
  // --------------------------------------------------------------------------
  _num(v, fallback = 0) {
    return Number.isFinite(v) ? v : fallback;
  }

  _smooth01(x) {
    const t = Math.max(0.0, Math.min(1.0, this._num(x, 0)));
    return t * t * (3.0 - 2.0 * t);
  }

  _clampFreq(f) {
    const maxF = this.ctx ? Math.min(19000, this.ctx.sampleRate * 0.45) : 18000;
    return Math.max(12, Math.min(maxF, this._num(f, 440)));
  }

  _clampRate(r, minR = 0.25, maxR = 3.5) {
    return Math.max(minR, Math.min(maxR, this._num(r, 1.0)));
  }

  _setTarget(param, value, startTime, timeConstant = 0.025) {
    if (!param || !this.ctx) return;
    const t = Math.max(0, this._num(startTime, this.ctx.currentTime));
    const tc = Math.max(0.002, this._num(timeConstant, 0.025));
    const v = this._num(value, 0);
    try {
      param.setTargetAtTime(v, t, tc);
    } catch (_) {}
  }

  _setVal(param, value, time) {
    if (!param || !this.ctx) return;
    const t = Math.max(0, this._num(time, this.ctx.currentTime));
    const v = this._num(value, 0);
    try {
      param.setValueAtTime(v, t);
    } catch (_) {}
  }

  _linRamp(param, value, endTime) {
    if (!param || !this.ctx) return;
    const t = Math.max(this.ctx.currentTime + 0.001, this._num(endTime, this.ctx.currentTime + 0.01));
    const v = this._num(value, 0);
    try {
      param.linearRampToValueAtTime(v, t);
    } catch (_) {}
  }

  _expRamp(param, value, endTime) {
    if (!param || !this.ctx) return;
    const t = Math.max(this.ctx.currentTime + 0.001, this._num(endTime, this.ctx.currentTime + 0.01));
    const v = Math.max(0.0002, this._num(value, 0.001));
    try {
      param.exponentialRampToValueAtTime(v, t);
    } catch (_) {}
  }

  _createPanner(panValue = 0) {
    if (this.ctx && typeof this.ctx.createStereoPanner === 'function') {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, this._num(panValue, 0)));
      return p;
    }
    const fallback = this.ctx.createGain();
    fallback.gain.value = 1.0;
    return fallback;
  }

  _ensureRunning() {
    if (this.ctx && this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
    }
    if (this.initialized && !this._sampleLoadPromise) {
      this._loadSampleBanksAsync();
    }
  }

  _normMixerVal(val, fallback) {
    if (val === undefined || val === null) return fallback;
    let n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    if (n > 1.5) n /= 100;
    return Math.max(0.0, Math.min(1.0, n));
  }

  // --------------------------------------------------------------------------
  // LIVE 5-CHANNEL AUDIO MIXER CONTROLS (MASTER, ENGINE, SFX, VOICE, MUSIC)
  // --------------------------------------------------------------------------
  setMixerLevels(levels = {}) {
    if (levels && typeof levels === 'object') {
      this.mixerLevels.master = this._normMixerVal(levels.master, this.mixerLevels.master);
      this.mixerLevels.engine = this._normMixerVal(levels.engine, this.mixerLevels.engine);
      this.mixerLevels.sfx = this._normMixerVal(levels.sfx, this.mixerLevels.sfx);
      this.mixerLevels.voice = this._normMixerVal(levels.voice, this.mixerLevels.voice);
      this.mixerLevels.music = this._normMixerVal(levels.music, this.mixerLevels.music);
    }

    if (this.initialized && this.ctx) {
      const now = this.ctx.currentTime;
      const targetMaster = this.muted ? 0.0 : 0.62 * this.mixerLevels.master;
      this._setTarget(this.masterGain?.gain, targetMaster, now, 0.03);
      this._setTarget(this.engineBus?.gain, this.mixerLevels.engine, now, 0.03);
      this._setTarget(this.sfxBus?.gain, this.mixerLevels.sfx, now, 0.03);
      this._setTarget(this.voiceBus?.gain, this.mixerLevels.voice, now, 0.03);
      this._setTarget(this.musicBus?.gain, this.mixerLevels.music, now, 0.03);
    }
    return this.getMixerLevels();
  }

  getMixerLevels() {
    return {
      master: this.mixerLevels.master,
      engine: this.mixerLevels.engine,
      sfx: this.mixerLevels.sfx,
      voice: this.mixerLevels.voice,
      music: this.mixerLevels.music,
    };
  }

  init() {
    this.unlock();
    return this._sampleLoadPromise;
  }

  resume() {
    if (!this.initialized) {
      this.unlock();
    } else {
      this._ensureRunning();
    }
    return this._sampleLoadPromise;
  }

  unlock() {
    if (this.initialized) {
      this._ensureRunning();
      return;
    }

    const AudioCtx = (typeof window !== 'undefined')
      ? (window.AudioContext || window.webkitAudioContext)
      : null;
    if (!AudioCtx) return;

    try {
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
    } catch (_) {
      this.ctx = new AudioCtx();
    }

    // Master Broadcast Bus: Subsonic Highpass -> Low-Mid Warmth -> Presence -> Bus Limiter
    const masterHP = this.ctx.createBiquadFilter();
    masterHP.type = 'highpass';
    masterHP.frequency.value = 28;
    masterHP.Q.value = 0.707;

    const masterWarmth = this.ctx.createBiquadFilter();
    masterWarmth.type = 'peaking';
    masterWarmth.frequency.value = 138;
    masterWarmth.Q.value = 0.85;
    masterWarmth.gain.value = 1.4;

    const masterPresence = this.ctx.createBiquadFilter();
    masterPresence.type = 'peaking';
    masterPresence.frequency.value = 2480;
    masterPresence.Q.value = 0.9;
    masterPresence.gain.value = 1.3;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -10.5;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 4.8;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.12;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0.0 : 0.62 * this.mixerLevels.master;

    // Dedicated Mixer Sub-Buses
    this.engineBus = this.ctx.createGain();
    this.engineBus.gain.value = this.mixerLevels.engine;
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.mixerLevels.sfx;
    this.voiceBus = this.ctx.createGain();
    this.voiceBus.gain.value = this.mixerLevels.voice;
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.mixerLevels.music;

    this.engineBus.connect(this.masterGain);
    this.sfxBus.connect(this.masterGain);
    this.voiceBus.connect(this.masterGain);
    this.musicBus.connect(this.masterGain);

    this.masterGain.connect(masterHP);
    masterHP.connect(masterWarmth);
    masterWarmth.connect(masterPresence);
    masterPresence.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    // Precompute buffers & physical/arcade PeriodicWaves
    this._noisePinkBuf = this._createNoiseBuffer(2.6, true);
    this._noiseWhiteBuf = this._createNoiseBuffer(1.4, false);
    this._noiseLfsrBuf = this._createNamcoLfsrBuffer(1.6);
    this._createPhysicalAndNamcoWaves();
    this._shaperCurveEngine = this._makeSaturationCurve(2.05, 0.07);
    this._shaperCurveTransient = this._makeSaturationCurve(1.80, 0.04);

    // Build Convolution Reverb Sends, Engine Power Unit, 1982 Namco WSG, Surface & Pad
    this._setupConvolutionReverbBus();
    this._setupF1PowerUnit();
    this._setupNamco1982Engine();
    this._setupSurfaceAndAeroLoops();
    this._setupShowroomPad();

    this.initialized = true;

    // iOS / Android Mobile WebKit hardware unlock pulse + resume
    try {
      const silentBuf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const silentSrc = this.ctx.createBufferSource();
      silentSrc.buffer = silentBuf;
      silentSrc.connect(this.ctx.destination);
      silentSrc.start(0);
    } catch (_) {}
    this._ensureRunning();

    // Kick off non-blocking <80ms async fetch + decodeAudioData of `assets/audio/*.wav`
    this._loadSampleBanksAsync();

    if (!this._resumeBound && typeof window !== 'undefined') {
      this._resumeBound = true;
      const autoResume = () => {
        if (this.initialized && this.ctx && this.ctx.state !== 'running') {
          this.ctx.resume().catch(() => {});
        }
        if (this.initialized && !this._sampleLoadPromise) {
          this._loadSampleBanksAsync();
        }
      };
      if (typeof window.addEventListener === 'function') {
        window.addEventListener('pointerdown', autoResume, { passive: true });
        window.addEventListener('touchstart', autoResume, { passive: true });
        window.addEventListener('keydown', autoResume, { passive: true });
      }
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') autoResume();
        });
      }
    }
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.masterGain && this.ctx) {
      const target = this.muted ? 0.0 : 0.62 * this.mixerLevels.master;
      this._setTarget(this.masterGain.gain, target, this.ctx.currentTime, 0.035);
    }
    if (this.muted) {
      this._stopActiveFanfare();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch (_) {}
      }
    }
  }

  // --------------------------------------------------------------------------
  // ASYNC `.WAV` SAMPLE BANK & CONVOLUTION IR DECODER (`< 80ms` HOT-SWAP)
  // --------------------------------------------------------------------------
  _resolveAudioUrl(filename) {
    try {
      return new URL(`../assets/audio/${filename}`, import.meta.url).href;
    } catch (_) {
      return `./assets/audio/${filename}`;
    }
  }

  _decodeAudioBufferCompat(arrayBuffer) {
    return new Promise((resolve, reject) => {
      if (!this.ctx) {
        reject(new Error('AudioContext not initialized'));
        return;
      }
      try {
        const p = this.ctx.decodeAudioData(
          arrayBuffer,
          (decoded) => resolve(decoded),
          (err) => reject(err || new Error('decodeAudioData failed'))
        );
        if (p && typeof p.then === 'function') {
          p.then(resolve).catch(reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  _loadSampleBanksAsync() {
    if (!this.ctx || typeof fetch !== 'function') return Promise.resolve(false);
    if (this._sampleLoadPromise) return this._sampleLoadPromise;

    this._sampleLoadPromise = Promise.allSettled(
      SAMPLE_BANK_SPECS.map(async (spec) => {
        const url = this._resolveAudioUrl(spec.file);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${spec.file}`);
        const buf = await resp.arrayBuffer();
        const audioBuf = await this._decodeAudioBufferCompat(buf);
        this.sampleBuffers[spec.key] = audioBuf;
        return spec.key;
      })
    )
      .then(() => {
        const hasCoreEngine = Boolean(
          this.sampleBuffers.engineIdle &&
          this.sampleBuffers.engineMid &&
          this.sampleBuffers.engineHigh &&
          this.sampleBuffers.engineOverrun
        );
        if (hasCoreEngine && !this._sampleGraphWired) {
          this._wireDecodedSampleLoops();
        } else {
          this._bindImpulseResponsesIfReady();
        }
        this.samplesLoaded = hasCoreEngine;
        return this.samplesLoaded;
      })
      .catch(() => false);

    return this._sampleLoadPromise;
  }

  _bindImpulseResponsesIfReady() {
    if (!this.ctx) return;
    if (this.cockpitConvolver && this.sampleBuffers.irCockpit && !this.cockpitConvolver.buffer) {
      try {
        this.cockpitConvolver.buffer = this.sampleBuffers.irCockpit;
      } catch (_) {}
    }
    if (this.valleyConvolver && this.sampleBuffers.irValley && !this.valleyConvolver.buffer) {
      try {
        this.valleyConvolver.buffer = this.sampleBuffers.irValley;
      } catch (_) {}
    }
  }

  _wireDecodedSampleLoops() {
    if (!this.ctx || this._sampleGraphWired) return;
    this._sampleGraphWired = true;
    const now = this.ctx.currentTime;

    this._bindImpulseResponsesIfReady();

    // 1. 4-Layer Loop-Locked Engine Sample Bank -> exhaustFormant -> shiftCutGain -> engineGain
    const makeLoopSrc = (buf, offsetSec = 0) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const safeOff = buf.duration > 0.05 ? offsetSec % buf.duration : 0;
      src.start(now, safeOff);
      return src;
    };

    if (
      this.sampleBuffers.engineIdle &&
      this.sampleBuffers.engineMid &&
      this.sampleBuffers.engineHigh &&
      this.sampleBuffers.engineOverrun &&
      this.engineSampleBus
    ) {
      this.sampleIdleGain = this.ctx.createGain();
      this.sampleIdleGain.gain.value = 0.0;
      this.sampleMidGain = this.ctx.createGain();
      this.sampleMidGain.gain.value = 0.0;
      this.sampleHighGain = this.ctx.createGain();
      this.sampleHighGain.gain.value = 0.0;
      this.sampleOverrunGain = this.ctx.createGain();
      this.sampleOverrunGain.gain.value = 0.0;

      this.sampleIdleSrc = makeLoopSrc(this.sampleBuffers.engineIdle, 0.0);
      this.sampleMidSrc = makeLoopSrc(this.sampleBuffers.engineMid, 0.12);
      this.sampleHighSrc = makeLoopSrc(this.sampleBuffers.engineHigh, 0.24);
      this.sampleOverrunSrc = makeLoopSrc(this.sampleBuffers.engineOverrun, 0.36);

      this.sampleIdleSrc.connect(this.sampleIdleGain);
      this.sampleMidSrc.connect(this.sampleMidGain);
      this.sampleHighSrc.connect(this.sampleHighGain);
      this.sampleOverrunSrc.connect(this.sampleOverrunGain);

      this.sampleIdleGain.connect(this.engineSampleBus);
      this.sampleMidGain.connect(this.engineSampleBus);
      this.sampleHighGain.connect(this.engineSampleBus);
      this.sampleOverrunGain.connect(this.engineSampleBus);

      // Smoothly crossfade from procedural startup fallback into Studio Sample-Bank Engine!
      this._sampleBankBlend = 1.0;
      this._setTarget(this.engineSampleBus.gain, 1.0, now, 0.055);
      // Retain subtle 18% phase-coherent sub-fundamental + overhead airbox reinforcement
      if (this.engineSynthMixGain) {
        this._setTarget(this.engineSynthMixGain.gain, 0.18, now, 0.055);
      }
    }

    // 2. Straight-Cut / Helical Dog-Engagement Gearbox Sample Loop
    if (this.sampleBuffers.gearboxWhine && this.gearboxGain) {
      this.gearboxSampleGain = this.ctx.createGain();
      this.gearboxSampleGain.gain.value = 0.42;
      this.gearboxSampleSrc = makeLoopSrc(this.sampleBuffers.gearboxWhine, 0.05);
      const gbSampleFilter = this.ctx.createBiquadFilter();
      gbSampleFilter.type = 'bandpass';
      gbSampleFilter.frequency.value = 1650;
      gbSampleFilter.Q.value = 1.35;
      this.gearboxSampleSrc.connect(gbSampleFilter);
      gbSampleFilter.connect(this.gearboxSampleGain);
      this.gearboxSampleGain.connect(this.gearboxGain);
      if (this.gearboxSynthGain) {
        this._setTarget(this.gearboxSynthGain.gain, 0.15, now, 0.05);
      }
    }

    // 3. Progressive Tire Grip-Limit Scrub (`65-95%`) & Full Lockup Screech (`>95%`) Loops
    if (this.sampleBuffers.tireScrub) {
      this.tireScrubFilter = this.ctx.createBiquadFilter();
      this.tireScrubFilter.type = 'lowpass';
      this.tireScrubFilter.frequency.value = 2600;
      this.tireScrubGain = this.ctx.createGain();
      this.tireScrubGain.gain.value = 0.0;
      this.tireScrubSrc = makeLoopSrc(this.sampleBuffers.tireScrub, 0.1);
      this.tireScrubSrc.connect(this.tireScrubFilter);
      this.tireScrubFilter.connect(this.tireScrubGain);
      this.tireScrubGain.connect(this.sfxBus);
      if (this.reverbSendSfx) this.tireScrubGain.connect(this.reverbSendSfx);
    }

    if (this.sampleBuffers.tireScreech) {
      this.tireScreechGain = this.ctx.createGain();
      this.tireScreechGain.gain.value = 0.0;
      this.tireScreechSrc = makeLoopSrc(this.sampleBuffers.tireScreech, 0.25);
      this.tireScreechSrc.connect(this.tireScreechGain);
      this.tireScreechGain.connect(this.sfxBus);
      if (this.reverbSendSfx) this.tireScreechGain.connect(this.reverbSendSfx);
    }

    // 4. Concrete FIA Serrated Sawtooth Kerb Loop
    if (this.sampleBuffers.curbSawtooth && this.curbGain) {
      this.curbSampleGain = this.ctx.createGain();
      this.curbSampleGain.gain.value = 0.92;
      this.curbSampleSrc = makeLoopSrc(this.sampleBuffers.curbSawtooth, 0.0);
      this.curbSampleSrc.connect(this.curbSampleGain);
      this.curbSampleGain.connect(this.curbGain);
      if (this.curbSynthGain) {
        this._setTarget(this.curbSynthGain.gain, 0.18, now, 0.04);
      }
    }

    // 5. Stereo Binaural Cockpit & Boundary-Layer Aero Wind Loop
    if (this.sampleBuffers.aeroWind && this.aeroGain) {
      this.aeroSampleFilter = this.ctx.createBiquadFilter();
      this.aeroSampleFilter.type = 'lowpass';
      this.aeroSampleFilter.frequency.value = 2200;
      this.aeroSampleGain = this.ctx.createGain();
      this.aeroSampleGain.gain.value = 0.95;
      this.aeroSampleSrc = makeLoopSrc(this.sampleBuffers.aeroWind, 0.18);
      this.aeroSampleSrc.connect(this.aeroSampleFilter);
      this.aeroSampleFilter.connect(this.aeroSampleGain);
      this.aeroSampleGain.connect(this.aeroGain);
      if (this.aeroSynthGain) {
        this._setTarget(this.aeroSynthGain.gain, 0.12, now, 0.05);
      }
    }

    // 6. 900C Carbon-Ceramic Slotted Brake Rotor Pad Hiss & Brembo Squeal Loop
    if (this.sampleBuffers.brakeRotor) {
      this.brakeRotorSquealFilter = this.ctx.createBiquadFilter();
      this.brakeRotorSquealFilter.type = 'peaking';
      this.brakeRotorSquealFilter.frequency.value = 3210;
      this.brakeRotorSquealFilter.Q.value = 4.2;
      this.brakeRotorSquealFilter.gain.value = 0.0;
      this.brakeRotorGain = this.ctx.createGain();
      this.brakeRotorGain.gain.value = 0.0;
      this.brakeRotorSrc = makeLoopSrc(this.sampleBuffers.brakeRotor, 0.07);
      this.brakeRotorSrc.connect(this.brakeRotorSquealFilter);
      this.brakeRotorSquealFilter.connect(this.brakeRotorGain);
      this.brakeRotorGain.connect(this.sfxBus);
      if (this.reverbSendSfx) this.brakeRotorGain.connect(this.reverbSendSfx);
    }

    // 7. Granular 4,000-Voice Motorsport Grandstand Crowd Swell Loop
    if (this.sampleBuffers.crowdRoar && this.crowdBedGain) {
      this.crowdSampleFilter = this.ctx.createBiquadFilter();
      this.crowdSampleFilter.type = 'lowpass';
      this.crowdSampleFilter.frequency.value = 2800;
      this.crowdSamplePanner = this._createPanner(0.0);
      this.crowdSampleGain = this.ctx.createGain();
      this.crowdSampleGain.gain.value = 1.0;
      this.crowdSampleSrc = makeLoopSrc(this.sampleBuffers.crowdRoar, 0.4);
      this.crowdSampleSrc.connect(this.crowdSampleFilter);
      this.crowdSampleFilter.connect(this.crowdSamplePanner);
      this.crowdSamplePanner.connect(this.crowdSampleGain);
      this.crowdSampleGain.connect(this.crowdBedGain);
      if (this.crowdSynthGain) {
        this._setTarget(this.crowdSynthGain.gain, 0.0, now, 0.08);
      }
    }
  }

  // --------------------------------------------------------------------------
  // PHYSICAL OTTO-CYCLE & 1982 NAMCO 4-BIT WSG WAVETABLE BUILDERS
  // --------------------------------------------------------------------------
  _makeSaturationCurve(drive = 2.05, asym = 0.07) {
    const n = 2048;
    const curve = new Float32Array(n);
    const norm = Math.tanh(drive);
    const dcOffset = Math.tanh(asym * 0.25 * drive);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      const shaped = Math.tanh((x + asym * x * x - 0.02 * x * x * x) * drive) - dcOffset * (1 - x * x);
      curve[i] = Math.max(-1, Math.min(1, shaped / norm));
    }
    return curve;
  }

  _createNoiseBuffer(seconds = 2.0, pink = true) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (pink) {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        data[i] = out * 0.11;
      } else {
        data[i] = white * 0.62;
      }
    }
    return buf;
  }

  // Authentic 1982 Namco 06xx/54xx 15-Bit LFSR Sample-and-Hold Crunchy Explosion Buffer
  _createNamcoLfsrBuffer(seconds = 1.6) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    const holdSamples = Math.max(2, Math.round(sr / 5800));
    let lfsr = 0x7fff;
    let currentOut = 0.65;
    for (let i = 0; i < len; i++) {
      if (i % holdSamples === 0) {
        const bit = ((lfsr >> 0) ^ (lfsr >> 1)) & 1;
        lfsr = ((lfsr >> 1) | (bit << 14)) & 0x7fff;
        const step4Bit = ((lfsr & 0x0f) / 7.5) - 1.0;
        currentOut = step4Bit * 0.72;
      }
      data[i] = currentOut;
    }
    return buf;
  }

  _waveFromDiscreteTable(samples, nHarmonics = 16) {
    const N = samples.length;
    const real = new Float32Array(nHarmonics + 1);
    const imag = new Float32Array(nHarmonics + 1);
    for (let k = 1; k <= nHarmonics; k++) {
      let re = 0;
      let im = 0;
      for (let n = 0; n < N; n++) {
        const angle = (TWO_PI * k * n) / N;
        re += samples[n] * Math.cos(angle);
        im -= samples[n] * Math.sin(angle);
      }
      real[k] = (2 * re) / N;
      imag[k] = -(2 * im) / N;
    }
    return this.ctx.createPeriodicWave(real, imag);
  }

  _createPhysicalAndNamcoWaves() {
    if (typeof this.ctx.createPeriodicWave !== 'function') return;
    try {
      // 1. Physical Otto-Cycle Asymmetric Blowdown Pressure Pulse Waveform (64-pt cycle)
      const otto64 = new Float32Array(64);
      for (let i = 0; i < 64; i++) {
        const u = i / 64;
        const tr = u / 0.095;
        const blowdown = tr < 9.0 ? (tr * tr) * Math.exp(2.0 - 2.0 * Math.pow(tr, 0.85)) : 0.0;
        const scav = -0.36 * Math.exp(-u / 0.28) * Math.sin(TWO_PI * 3.0 * u);
        otto64[i] = blowdown + scav;
      }
      this._ottoPulseWave = this._waveFromDiscreteTable(otto64, 22);

      // Uneven V10 collector interference wave
      const ottoV10 = new Float32Array(64);
      for (let i = 0; i < 64; i++) {
        ottoV10[i] = otto64[i] + 0.72 * otto64[(i + 25) % 64];
      }
      this._ottoV10Wave = this._waveFromDiscreteTable(ottoV10, 20);

      // 2. Authentic 1982 Namco Pole Position 32-Step x 4-Bit (0..15) PROM Wavetables!
      // PROM Wave A: Asymmetric 4-bit stepped cylinder pulse counter
      const promEngineA4Bit = [
        15, 15, 14, 12, 9, 6, 3, 1,
        0, 0, 2, 5, 8, 6, 3, 1,
        13, 15, 13, 10, 7, 4, 2, 0,
        1, 3, 6, 9, 11, 8, 4, 1,
      ].map((v) => (v / 7.5) - 1.0);
      this._namcoWsgEngineWaveA = this._waveFromDiscreteTable(promEngineA4Bit, 16);

      // PROM Wave B: 4-bit hollow exhaust divider harmonic
      const promEngineB4Bit = [
        14, 15, 15, 13, 8, 3, 1, 0,
        2, 7, 11, 12, 9, 5, 2, 0,
        0, 2, 6, 10, 13, 11, 7, 3,
        1, 0, 2, 5, 8, 10, 9, 6,
      ].map((v) => (v / 7.5) - 1.0);
      this._namcoWsgEngineWaveB = this._waveFromDiscreteTable(promEngineB4Bit, 16);

      // PROM Wave C: 1982 Namco WSG Brass / Heraldry Trumpet 4-bit PROM
      const promBrass4Bit = [
        8, 12, 15, 15, 13, 10, 11, 14,
        15, 12, 7, 3, 1, 0, 2, 6,
        9, 11, 10, 7, 4, 2, 1, 0,
        1, 3, 5, 7, 8, 7, 6, 7,
      ].map((v) => (v / 7.5) - 1.0);
      this._namcoWsgBrassWave = this._waveFromDiscreteTable(promBrass4Bit, 14);

      // 25% Duty-Cycle Rectangular Pulse for Sub-Divider
      const nHarm = 18;
      const pReal = new Float32Array(nHarm);
      const pImag = new Float32Array(nHarm);
      const duty = 0.25;
      for (let k = 1; k < nHarm; k++) {
        pReal[k] = (2 / (k * Math.PI)) * Math.sin(TWO_PI * k * duty);
        pImag[k] = (2 / (k * Math.PI)) * (1 - Math.cos(TWO_PI * k * duty));
      }
      this._namcoPulse25Wave = this.ctx.createPeriodicWave(pReal, pImag);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // DUAL CONVOLUTION REVERB ARCHITECTURE (`ir_carbon_cockpit` & `ir_grand_prix_valley`)
  // --------------------------------------------------------------------------
  _setupConvolutionReverbBus() {
    this.reverbSendEngine = this.ctx.createGain();
    this.reverbSendEngine.gain.value = 1.0;

    this.reverbSendSfx = this.ctx.createGain();
    this.reverbSendSfx.gain.value = 0.85;

    this.cockpitConvolver = this.ctx.createConvolver();
    this.cockpitConvolver.normalize = true;
    const cockpitIrLp = this.ctx.createBiquadFilter();
    cockpitIrLp.type = 'lowpass';
    cockpitIrLp.frequency.value = 3400;
    this.cockpitWetGain = this.ctx.createGain();
    this.cockpitWetGain.gain.value = 0.0;

    this.valleyConvolver = this.ctx.createConvolver();
    this.valleyConvolver.normalize = true;
    const valleyPreDelay = this.ctx.createDelay(0.05);
    valleyPreDelay.delayTime.value = 0.012;
    const valleyHp = this.ctx.createBiquadFilter();
    valleyHp.type = 'highpass';
    valleyHp.frequency.value = 115;
    this.valleyWetGain = this.ctx.createGain();
    this.valleyWetGain.gain.value = 0.0;

    // Cockpit Convolver Chain -> engineBus
    this.reverbSendEngine.connect(this.cockpitConvolver);
    this.reverbSendSfx.connect(this.cockpitConvolver);
    this.cockpitConvolver.connect(cockpitIrLp);
    cockpitIrLp.connect(this.cockpitWetGain);
    this.cockpitWetGain.connect(this.engineBus);

    // Grand Prix Valley Slapback Convolver Chain -> sfxBus & engineBus blend
    this.reverbSendEngine.connect(valleyPreDelay);
    this.reverbSendSfx.connect(valleyPreDelay);
    valleyPreDelay.connect(valleyHp);
    valleyHp.connect(this.valleyConvolver);
    this.valleyConvolver.connect(this.valleyWetGain);
    this.valleyWetGain.connect(this.sfxBus);
  }

  // --------------------------------------------------------------------------
  // 2026 STUDIO HYBRID F1 POWER UNIT (4-LAYER SAMPLES + PHYSICAL SYNTH/ERS)
  // --------------------------------------------------------------------------
  _setupF1PowerUnit() {
    // 1. Sample-Bank Mix Bus (receives idle / mid / high / overrun .wav loops once decoded)
    this.engineSampleBus = this.ctx.createGain();
    this.engineSampleBus.gain.value = 0.0;

    // 2. Physical Otto-Cycle PeriodicWave Synth Bank (instant <80ms startup + sub-bass weight)
    this.oscSub = this.ctx.createOscillator();
    this.oscSub.type = 'triangle';
    this.oscSub.frequency.value = 58;

    this.oscFund = this.ctx.createOscillator();
    if (this._ottoPulseWave) this.oscFund.setPeriodicWave(this._ottoPulseWave);
    else this.oscFund.type = 'sawtooth';
    this.oscFund.frequency.value = 116;

    this.oscOct = this.ctx.createOscillator();
    if (this._ottoPulseWave) this.oscOct.setPeriodicWave(this._ottoPulseWave);
    else this.oscOct.type = 'sawtooth';
    this.oscOct.detune.value = 4.5;
    this.oscOct.frequency.value = 232;

    this.oscFifth = this.ctx.createOscillator();
    if (this._ottoV10Wave) this.oscFifth.setPeriodicWave(this._ottoV10Wave);
    else this.oscFifth.type = 'sawtooth';
    this.oscFifth.detune.value = -4.0;
    this.oscFifth.frequency.value = 290;

    this.oscRasp = this.ctx.createOscillator();
    if (this._ottoV10Wave) this.oscRasp.setPeriodicWave(this._ottoV10Wave);
    else this.oscRasp.type = 'sawtooth';
    this.oscRasp.detune.value = 6.0;
    this.oscRasp.frequency.value = 348;

    this.vibratoOsc = this.ctx.createOscillator();
    this.vibratoOsc.type = 'sine';
    this.vibratoOsc.frequency.value = 24.5;
    this.vibratoDepth = this.ctx.createGain();
    this.vibratoDepth.gain.value = 2.8;
    this.vibratoOsc.connect(this.vibratoDepth);
    this.vibratoDepth.connect(this.oscFund.detune);
    this.vibratoDepth.connect(this.oscOct.detune);
    this.vibratoDepth.connect(this.oscFifth.detune);
    this.vibratoDepth.connect(this.oscRasp.detune);

    this.subGain = this.ctx.createGain();
    this.subGain.gain.value = 0.44;
    this.fundGain = this.ctx.createGain();
    this.fundGain.gain.value = 0.46;
    this.octGain = this.ctx.createGain();
    this.octGain.gain.value = 0.30;
    this.fifthGain = this.ctx.createGain();
    this.fifthGain.gain.value = 0.14;
    this.raspGain = this.ctx.createGain();
    this.raspGain.gain.value = 0.04;

    this.engineSynthMixGain = this.ctx.createGain();
    this.engineSynthMixGain.gain.value = 1.0;

    // Overhead Carbon Airbox Induction Rush
    const airboxSrc = this.ctx.createBufferSource();
    airboxSrc.buffer = this._noisePinkBuf;
    airboxSrc.loop = true;
    this.airboxFilter = this.ctx.createBiquadFilter();
    this.airboxFilter.type = 'bandpass';
    this.airboxFilter.frequency.value = 950;
    this.airboxFilter.Q.value = 2.4;
    this.airboxGain = this.ctx.createGain();
    this.airboxGain.gain.value = 0.0;
    airboxSrc.connect(this.airboxFilter);
    this.airboxFilter.connect(this.airboxGain);

    // 3. Dynamic Dual-Peaking Exhaust Collector + Carbon Intake Formants
    this.exhaustFormant = this.ctx.createBiquadFilter();
    this.exhaustFormant.type = 'peaking';
    this.exhaustFormant.frequency.value = 460;
    this.exhaustFormant.Q.value = 1.55;
    this.exhaustFormant.gain.value = 4.2;

    this.intakeFormant = this.ctx.createBiquadFilter();
    this.intakeFormant.type = 'peaking';
    this.intakeFormant.frequency.value = 1180;
    this.intakeFormant.Q.value = 1.85;
    this.intakeFormant.gain.value = 4.5;
    this.formantFilter = this.intakeFormant;

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._shaperCurveEngine;
    shaper.oversample = '2x';

    const dcBlock = this.ctx.createBiquadFilter();
    dcBlock.type = 'highpass';
    dcBlock.frequency.value = 32;

    this.lowpassFilter = this.ctx.createBiquadFilter();
    this.lowpassFilter.type = 'lowpass';
    this.lowpassFilter.frequency.value = 3600;
    this.lowpassFilter.Q.value = 0.75;

    const antiHarshShelf = this.ctx.createBiquadFilter();
    antiHarshShelf.type = 'highshelf';
    antiHarshShelf.frequency.value = 5600;
    antiHarshShelf.gain.value = -2.8;

    this.shiftCutGain = this.ctx.createGain();
    this.shiftCutGain.gain.value = 1.0;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    // Synth oscillators -> engineSynthMixGain; sub-bass + airbox + sampleBus -> formant chain
    this.oscSub.connect(this.subGain);
    this.oscFund.connect(this.fundGain);
    this.oscOct.connect(this.octGain);
    this.oscFifth.connect(this.fifthGain);
    this.oscRasp.connect(this.raspGain);

    this.fundGain.connect(this.engineSynthMixGain);
    this.octGain.connect(this.engineSynthMixGain);
    this.fifthGain.connect(this.engineSynthMixGain);
    this.raspGain.connect(this.engineSynthMixGain);

    this.subGain.connect(this.exhaustFormant);
    this.engineSynthMixGain.connect(this.exhaustFormant);
    this.engineSampleBus.connect(this.exhaustFormant);
    this.airboxGain.connect(this.exhaustFormant);

    this.exhaustFormant.connect(this.intakeFormant);
    this.intakeFormant.connect(shaper);
    shaper.connect(dcBlock);
    dcBlock.connect(this.lowpassFilter);
    this.lowpassFilter.connect(antiHarshShelf);
    antiHarshShelf.connect(this.shiftCutGain);
    this.shiftCutGain.connect(this.engineGain);

    // Dry center + Haas micro-width + Convolution Reverb Send
    const drySplit = this.ctx.createGain();
    drySplit.gain.value = 0.88;
    this.engineGain.connect(drySplit);
    drySplit.connect(this.engineBus);

    if (this.reverbSendEngine) {
      this.engineGain.connect(this.reverbSendEngine);
    }

    // Subtle stereo chassis/exhaust width (active even before IR finishes decoding)
    const delayL = this.ctx.createDelay(0.05);
    delayL.delayTime.value = 0.0095;
    const panL = this._createPanner(-0.46);
    const wetL = this.ctx.createGain();
    wetL.gain.value = 0.11;
    this.engineGain.connect(delayL);
    delayL.connect(panL);
    panL.connect(wetL);
    wetL.connect(this.engineBus);

    const delayR = this.ctx.createDelay(0.05);
    delayR.delayTime.value = 0.0142;
    const panR = this._createPanner(0.46);
    const wetR = this.ctx.createGain();
    wetR.gain.value = 0.11;
    this.engineGain.connect(delayR);
    delayR.connect(panR);
    panR.connect(wetR);
    wetR.connect(this.engineBus);

    // 4. Hybrid MGU-H Turbo, Silicon-Carbide MGU-K Inverter & Gearbox Whine
    this.oscTurbo = this.ctx.createOscillator();
    this.oscTurbo.type = 'sine';
    this.oscTurbo.frequency.value = 2100;
    this.turboGain = this.ctx.createGain();
    this.turboGain.gain.value = 0.0;
    this.oscTurbo.connect(this.turboGain);
    this.turboGain.connect(this.engineBus);

    this.oscMgukInverter = this.ctx.createOscillator();
    this.oscMgukInverter.type = 'triangle';
    this.oscMgukInverter.frequency.value = 2200;
    this.mgukFilter = this.ctx.createBiquadFilter();
    this.mgukFilter.type = 'bandpass';
    this.mgukFilter.frequency.value = 2200;
    this.mgukFilter.Q.value = 4.6;
    this.mgukGain = this.ctx.createGain();
    this.mgukGain.gain.value = 0.0;
    this.oscMgukInverter.connect(this.mgukFilter);
    this.mgukFilter.connect(this.mgukGain);
    this.mgukGain.connect(this.engineBus);

    this.oscGearbox = this.ctx.createOscillator();
    this.oscGearbox.type = 'triangle';
    this.oscGearbox.frequency.value = 800;
    this.oscGearboxHarm = this.ctx.createOscillator();
    this.oscGearboxHarm.type = 'sine';
    this.oscGearboxHarm.frequency.value = 1600;
    const gbHarmGain = this.ctx.createGain();
    gbHarmGain.gain.value = 0.40;

    this.gbBand = this.ctx.createBiquadFilter();
    this.gbBand.type = 'bandpass';
    this.gbBand.frequency.value = 1350;
    this.gbBand.Q.value = 2.8;
    this.gearboxSynthGain = this.ctx.createGain();
    this.gearboxSynthGain.gain.value = 1.0;

    this.gearboxGain = this.ctx.createGain();
    this.gearboxGain.gain.value = 0.0;

    this.oscGearbox.connect(this.gbBand);
    this.oscGearboxHarm.connect(gbHarmGain);
    gbHarmGain.connect(this.gbBand);
    this.gbBand.connect(this.gearboxSynthGain);
    this.gearboxSynthGain.connect(this.gearboxGain);
    this.gearboxGain.connect(this.engineBus);
    if (this.reverbSendEngine) {
      const gbRevSend = this.ctx.createGain();
      gbRevSend.gain.value = 0.25;
      this.gearboxGain.connect(gbRevSend);
      gbRevSend.connect(this.reverbSendEngine);
    }

    this.oscSub.start();
    this.oscFund.start();
    this.oscOct.start();
    this.oscFifth.start();
    this.oscRasp.start();
    this.vibratoOsc.start();
    airboxSrc.start();
    this.oscTurbo.start();
    this.oscMgukInverter.start();
    this.oscGearbox.start();
    this.oscGearboxHarm.start();
  }

  // --------------------------------------------------------------------------
  // 1:1 1982 NAMCO POLE POSITION 4-BIT WSG PROM WAVETABLE ENGINE & SKID CHIRP
  // --------------------------------------------------------------------------
  _setupNamco1982Engine() {
    this.psgOscA = this.ctx.createOscillator();
    if (this._namcoWsgEngineWaveA) this.psgOscA.setPeriodicWave(this._namcoWsgEngineWaveA);
    else this.psgOscA.type = 'square';
    this.psgOscA.frequency.value = 54;

    this.psgOscB = this.ctx.createOscillator();
    if (this._namcoWsgEngineWaveB) this.psgOscB.setPeriodicWave(this._namcoWsgEngineWaveB);
    else this.psgOscB.type = 'square';
    this.psgOscB.frequency.value = 81.5;
    this.psgOscB.detune.value = 6;

    this.psgSubOsc = this.ctx.createOscillator();
    if (this._namcoPulse25Wave) this.psgSubOsc.setPeriodicWave(this._namcoPulse25Wave);
    else this.psgSubOsc.type = 'square';
    this.psgSubOsc.frequency.value = 27;

    const gainA = this.ctx.createGain();
    gainA.gain.value = 0.54;
    const gainB = this.ctx.createGain();
    gainB.gain.value = 0.35;
    const gainSub = this.ctx.createGain();
    gainSub.gain.value = 0.30;

    // Authentic 1982 upright arcade wooden cabinet 6.5" full-range speaker box EQ
    const cabPunch = this.ctx.createBiquadFilter();
    cabPunch.type = 'peaking';
    cabPunch.frequency.value = 390;
    cabPunch.Q.value = 1.35;
    cabPunch.gain.value = 4.2;

    this.psgFilter = this.ctx.createBiquadFilter();
    this.psgFilter.type = 'lowpass';
    this.psgFilter.frequency.value = 2250;
    this.psgFilter.Q.value = 1.2;

    this.psgEngineGain = this.ctx.createGain();
    this.psgEngineGain.gain.value = 0.0;

    this.psgOscA.connect(gainA);
    this.psgOscB.connect(gainB);
    this.psgSubOsc.connect(gainSub);
    gainA.connect(cabPunch);
    gainB.connect(cabPunch);
    gainSub.connect(cabPunch);
    cabPunch.connect(this.psgFilter);
    this.psgFilter.connect(this.psgEngineGain);
    this.psgEngineGain.connect(this.engineBus);

    // 1982 Namco Pole Position FM Square Tire-Chirp Synthesizer (active in isRetroMode!)
    this.retroSkidOsc = this.ctx.createOscillator();
    if (this._namcoPulse25Wave) this.retroSkidOsc.setPeriodicWave(this._namcoPulse25Wave);
    else this.retroSkidOsc.type = 'square';
    this.retroSkidOsc.frequency.value = 1280;

    this.retroSkidLfo = this.ctx.createOscillator();
    this.retroSkidLfo.type = 'square';
    this.retroSkidLfo.frequency.value = 21.5;
    const retroLfoDepth = this.ctx.createGain();
    retroLfoDepth.gain.value = 185;
    this.retroSkidLfo.connect(retroLfoDepth);
    retroLfoDepth.connect(this.retroSkidOsc.frequency);

    const retroSkidBp = this.ctx.createBiquadFilter();
    retroSkidBp.type = 'bandpass';
    retroSkidBp.frequency.value = 1350;
    retroSkidBp.Q.value = 2.4;

    this.retroSkidGain = this.ctx.createGain();
    this.retroSkidGain.gain.value = 0.0;

    this.retroSkidOsc.connect(retroSkidBp);
    retroSkidBp.connect(this.retroSkidGain);
    this.retroSkidGain.connect(this.sfxBus);

    this.psgOscA.start();
    this.psgOscB.start();
    this.psgSubOsc.start();
    this.retroSkidOsc.start();
    this.retroSkidLfo.start();
  }

  _setupSurfaceAndAeroLoops() {
    // 1. Aero Wind Rush (`aero_wind_cockpit_loop.wav` + procedural fallback) -> sfxBus
    const aeroSrc = this.ctx.createBufferSource();
    aeroSrc.buffer = this._noisePinkBuf;
    aeroSrc.loop = true;
    this.aeroFilter = this.ctx.createBiquadFilter();
    this.aeroFilter.type = 'bandpass';
    this.aeroFilter.frequency.value = 480;
    this.aeroFilter.Q.value = 0.72;
    this.aeroSynthGain = this.ctx.createGain();
    this.aeroSynthGain.gain.value = 1.0;
    this.aeroGain = this.ctx.createGain();
    this.aeroGain.gain.value = 0.0;
    aeroSrc.connect(this.aeroFilter);
    this.aeroFilter.connect(this.aeroSynthGain);
    this.aeroSynthGain.connect(this.aeroGain);
    this.aeroGain.connect(this.sfxBus);
    aeroSrc.start();

    // 2. Grass / Gravel Runoff & Procedural Tire Fallback -> sfxBus
    const skidSrc = this.ctx.createBufferSource();
    skidSrc.buffer = this._noisePinkBuf;
    skidSrc.loop = true;

    this.skidFilter = this.ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 980;
    this.skidFilter.Q.value = 3.8;

    this.skidHarmFilter = this.ctx.createBiquadFilter();
    this.skidHarmFilter.type = 'bandpass';
    this.skidHarmFilter.frequency.value = 1880;
    this.skidHarmFilter.Q.value = 4.4;
    this.skidHarmGain = this.ctx.createGain();
    this.skidHarmGain.gain.value = 0.35;

    const skidLfo = this.ctx.createOscillator();
    skidLfo.type = 'sine';
    skidLfo.frequency.value = 7.5;
    const skidLfoGain = this.ctx.createGain();
    skidLfoGain.gain.value = 28;
    skidLfo.connect(skidLfoGain);
    skidLfoGain.connect(this.skidFilter.frequency);
    skidLfo.start();

    this.skidGain = this.ctx.createGain();
    this.skidGain.gain.value = 0.0;
    skidSrc.connect(this.skidFilter);
    skidSrc.connect(this.skidHarmFilter);
    this.skidHarmFilter.connect(this.skidHarmGain);
    this.skidFilter.connect(this.skidGain);
    this.skidHarmGain.connect(this.skidGain);
    this.skidGain.connect(this.sfxBus);
    skidSrc.start();

    // 3. Serrated FIA Kerb Sawtooth Rumble (`curb_sawtooth_loop.wav` + chassis sub-osc) -> sfxBus
    this.curbOsc = this.ctx.createOscillator();
    this.curbOsc.type = 'sawtooth';
    this.curbOsc.frequency.value = 120;
    this.curbSubOsc = this.ctx.createOscillator();
    this.curbSubOsc.type = 'triangle';
    this.curbSubOsc.frequency.value = 60;
    const curbSubGain = this.ctx.createGain();
    curbSubGain.gain.value = 0.65;

    this.curbFilter = this.ctx.createBiquadFilter();
    this.curbFilter.type = 'lowpass';
    this.curbFilter.frequency.value = 340;
    this.curbFilter.Q.value = 2.0;
    this.curbSynthGain = this.ctx.createGain();
    this.curbSynthGain.gain.value = 1.0;

    this.curbGain = this.ctx.createGain();
    this.curbGain.gain.value = 0.0;

    this.curbOsc.connect(this.curbFilter);
    this.curbSubOsc.connect(curbSubGain);
    curbSubGain.connect(this.curbFilter);
    this.curbFilter.connect(this.curbSynthGain);
    this.curbSynthGain.connect(this.curbGain);
    this.curbGain.connect(this.sfxBus);
    if (this.reverbSendSfx) {
      const curbRev = this.ctx.createGain();
      curbRev.gain.value = 0.35;
      this.curbGain.connect(curbRev);
      curbRev.connect(this.reverbSendSfx);
    }
    this.curbOsc.start();
    this.curbSubOsc.start();

    // 4. Wet Tarmac Rooster-Tail Spray & Hydroplane Sizzle -> sfxBus
    const rainSrc = this.ctx.createBufferSource();
    rainSrc.buffer = this._noisePinkBuf;
    rainSrc.loop = true;
    const rainHP = this.ctx.createBiquadFilter();
    rainHP.type = 'highpass';
    rainHP.frequency.value = 680;
    const rainSizzle = this.ctx.createBiquadFilter();
    rainSizzle.type = 'peaking';
    rainSizzle.frequency.value = 2150;
    rainSizzle.Q.value = 1.25;
    rainSizzle.gain.value = 4.5;
    const rainLP = this.ctx.createBiquadFilter();
    rainLP.type = 'lowpass';
    rainLP.frequency.value = 6800;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0.0;
    rainSrc.connect(rainHP);
    rainHP.connect(rainSizzle);
    rainSizzle.connect(rainLP);
    rainLP.connect(this.rainGain);
    this.rainGain.connect(this.sfxBus);
    rainSrc.start();

    // 5. Carbon-Ceramic Brake Rotor Procedural Fallback (until `brake_carbon_rotor_loop.wav` decodes)
    const brakeSrc = this.ctx.createBufferSource();
    brakeSrc.buffer = this._noiseWhiteBuf;
    brakeSrc.loop = true;
    this.brakeSynthFilter = this.ctx.createBiquadFilter();
    this.brakeSynthFilter.type = 'bandpass';
    this.brakeSynthFilter.frequency.value = 2950;
    this.brakeSynthFilter.Q.value = 1.8;
    this.brakeSynthGain = this.ctx.createGain();
    this.brakeSynthGain.gain.value = 0.0;
    brakeSrc.connect(this.brakeSynthFilter);
    this.brakeSynthFilter.connect(this.brakeSynthGain);
    this.brakeSynthGain.connect(this.sfxBus);
    brakeSrc.start();

    // 6. Stadium Grandstand Crowd Bed (`crowd_grandstand_roar_loop.wav` + startup fallback)
    const crowdSrcL = this.ctx.createBufferSource();
    crowdSrcL.buffer = this._noisePinkBuf;
    crowdSrcL.loop = true;
    const crowdSrcR = this.ctx.createBufferSource();
    crowdSrcR.buffer = this._noisePinkBuf;
    crowdSrcR.loop = true;

    this.crowdBedFilterL = this.ctx.createBiquadFilter();
    this.crowdBedFilterL.type = 'bandpass';
    this.crowdBedFilterL.frequency.value = 580;
    this.crowdBedFilterL.Q.value = 1.45;

    this.crowdBedFilterR = this.ctx.createBiquadFilter();
    this.crowdBedFilterR.type = 'bandpass';
    this.crowdBedFilterR.frequency.value = 1320;
    this.crowdBedFilterR.Q.value = 1.65;

    const crowdTierPanL = this._createPanner(-0.38);
    const crowdTierPanR = this._createPanner(0.38);

    const crowdShimmerSrc = this.ctx.createBufferSource();
    crowdShimmerSrc.buffer = this._noisePinkBuf;
    crowdShimmerSrc.loop = true;
    this.crowdBedShimmer = this.ctx.createBiquadFilter();
    this.crowdBedShimmer.type = 'bandpass';
    this.crowdBedShimmer.frequency.value = 2650;
    this.crowdBedShimmer.Q.value = 1.35;
    const crowdShimmerGain = this.ctx.createGain();
    crowdShimmerGain.gain.value = 0.18;

    this.crowdBedPanner = this._createPanner(0.0);
    this.crowdSynthGain = this.ctx.createGain();
    this.crowdSynthGain.gain.value = 1.0;
    this.crowdBedGain = this.ctx.createGain();
    this.crowdBedGain.gain.value = 0.0;

    crowdSrcL.connect(this.crowdBedFilterL);
    this.crowdBedFilterL.connect(crowdTierPanL);
    crowdTierPanL.connect(this.crowdBedPanner);

    crowdSrcR.connect(this.crowdBedFilterR);
    this.crowdBedFilterR.connect(crowdTierPanR);
    crowdTierPanR.connect(this.crowdBedPanner);

    crowdShimmerSrc.connect(this.crowdBedShimmer);
    this.crowdBedShimmer.connect(crowdShimmerGain);
    crowdShimmerGain.connect(this.crowdBedPanner);

    this.crowdBedPanner.connect(this.crowdSynthGain);
    this.crowdSynthGain.connect(this.crowdBedGain);
    this.crowdBedGain.connect(this.sfxBus);

    crowdSrcL.start(0, 0.0);
    crowdSrcR.start(0, Math.min(1.15, (this._noisePinkBuf?.duration || 2.0) * 0.44));
    crowdShimmerSrc.start(0, 0.25);
  }

  _setupShowroomPad() {
    // Calm Gran Turismo 7 / F1 Paddock ambient Dmaj9 warm pad -> musicBus
    this.menuPadGain = this.ctx.createGain();
    this.menuPadGain.gain.value = 0.0;

    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 350;
    padFilter.Q.value = 0.80;

    this.menuPadLfo = this.ctx.createOscillator();
    this.menuPadLfo.type = 'sine';
    this.menuPadLfo.frequency.value = 0.09;
    const lfoDepth = this.ctx.createGain();
    lfoDepth.gain.value = 72;
    this.menuPadLfo.connect(lfoDepth);
    lfoDepth.connect(padFilter.frequency);
    this.menuPadLfo.start();

    const voices = [
      { f: 73.42, type: 'triangle', gain: 0.34, detune: 0, pan: 0.0 },
      { f: 110.00, type: 'sine', gain: 0.20, detune: -4, pan: -0.35 },
      { f: 164.81, type: 'triangle', gain: 0.15, detune: 4, pan: 0.35 },
      { f: 185.00, type: 'sine', gain: 0.16, detune: -3, pan: -0.22 },
      { f: 220.00, type: 'sine', gain: 0.12, detune: 3, pan: 0.22 },
    ];
    voices.forEach((v) => {
      const o = this.ctx.createOscillator();
      o.type = v.type;
      o.frequency.value = v.f;
      o.detune.value = v.detune;
      const g = this.ctx.createGain();
      g.gain.value = v.gain;
      const panner = this._createPanner(v.pan);
      o.connect(g);
      g.connect(panner);
      panner.connect(padFilter);
      o.start();
      this.menuPadOscs.push(o);
    });

    padFilter.connect(this.menuPadGain);
    this.menuPadGain.connect(this.musicBus);
  }

  // --------------------------------------------------------------------------
  // CONTINUOUS REAL-TIME TELEMETRY HYBRID SAMPLE + CONVOLUTION REVERB UPDATE
  // --------------------------------------------------------------------------
  updateContinuous(
    playerCar,
    moistureW,
    isRacingOrQuali,
    visualStyle,
    inShowroomMenu = false,
    isCockpitView = false
  ) {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    const nowMs = performance.now();
    const wallDt = this._lastUpdateMs > 0 ? (nowMs - this._lastUpdateMs) * 0.001 : 0.016;
    const ctxDt = this._lastCtxTime > 0 ? Math.max(0, now - this._lastCtxTime) : 0.016;
    const dtSec = Math.min(0.08, Math.max(0.001, Math.max(wallDt, ctxDt)));
    this._lastUpdateMs = nowMs;
    this._lastCtxTime = now;

    if (visualStyle && typeof visualStyle === 'string') {
      this._currentVisualStyle = visualStyle;
    }

    const isRetro =
      this._currentVisualStyle === '1982_ARCADE' ||
      this._currentVisualStyle === '1982_RETRO' ||
      visualStyle === true ||
      Boolean(visualStyle && typeof visualStyle === 'object' && visualStyle.isRetroMode) ||
      Boolean(playerCar && playerCar.isRetroMode);
    this.isRetroMode = isRetro;

    // Resolve Cockpit View (`cameraIndex === 2` or boolean/object flag)
    const cockpitMode =
      isCockpitView === true ||
      isCockpitView === 2 ||
      Boolean(
        isCockpitView &&
          typeof isCockpitView === 'object' &&
          (isCockpitView.isCockpitView || isCockpitView.cameraIndex === 2)
      ) ||
      Boolean(playerCar && (playerCar.isCockpitView || playerCar.cameraIndex === 2));
    this._isCockpitView = cockpitMode;

    // Crossfade Showroom Paddock Pad vs Live Race Acoustics
    if (this.menuPadGain) {
      this._setTarget(this.menuPadGain.gain, inShowroomMenu ? 0.062 : 0.0, now, 0.28);
    }

    if (!isRacingOrQuali || !playerCar || playerCar.exploded) {
      this._setTarget(this.engineGain.gain, 0.0, now, 0.045);
      this._setTarget(this.psgEngineGain.gain, 0.0, now, 0.045);
      this._setTarget(this.turboGain.gain, 0.0, now, 0.045);
      if (this.mgukGain) this._setTarget(this.mgukGain.gain, 0.0, now, 0.045);
      this._setTarget(this.gearboxGain.gain, 0.0, now, 0.045);
      this._setTarget(this.aeroGain.gain, 0.0, now, 0.055);
      this._setTarget(this.skidGain.gain, 0.0, now, 0.045);
      if (this.tireScrubGain) this._setTarget(this.tireScrubGain.gain, 0.0, now, 0.04);
      if (this.tireScreechGain) this._setTarget(this.tireScreechGain.gain, 0.0, now, 0.04);
      if (this.retroSkidGain) this._setTarget(this.retroSkidGain.gain, 0.0, now, 0.035);
      if (this.brakeRotorGain) this._setTarget(this.brakeRotorGain.gain, 0.0, now, 0.045);
      if (this.brakeSynthGain) this._setTarget(this.brakeSynthGain.gain, 0.0, now, 0.045);
      this._setTarget(this.curbGain.gain, 0.0, now, 0.025);
      this._setTarget(this.rainGain.gain, 0.0, now, 0.075);
      if (this.cockpitWetGain) this._setTarget(this.cockpitWetGain.gain, 0.0, now, 0.08);
      if (this.valleyWetGain) this._setTarget(this.valleyWetGain.gain, 0.0, now, 0.08);
      if (this.crowdBedGain && nowMs - this._lastExplicitCrowdUpdateMs > 180) {
        this._setTarget(this.crowdBedGain.gain, 0.0, now, 0.12);
      }
      this._turboSpool = 0;
      return;
    }

    const rpm = Math.max(3200, Math.min(14600, this._num(playerCar.rpm, 3800)));
    const rpmNorm = Math.max(0, Math.min(1.08, (rpm - 3200) / (13500 - 3200)));
    const throttle = Math.max(0, Math.min(1, this._num(playerCar.throttleInput, 0)));
    const brake = Math.max(0, Math.min(1, Math.max(
      this._num(playerCar.brakeInput, 0),
      this._num(playerCar.assistBrakeApplied, 0)
    )));
    const speedKmh = Math.max(0, this._num(playerCar.speedKmh, 0));
    const speedNorm = Math.min(1, speedKmh / 320);
    const moisture = Math.max(0, Math.min(1, this._num(moistureW, 0)));
    const overRev = this._num(playerCar.overRevTimer, 0) > 0;

    // Smooth intake manifold load envelope (fast throttle-on bite, crisp butterfly vacuum snap on lift-off)
    const loadAlpha = throttle > this._manifoldLoad ? Math.min(1, dtSec * 18.0) : Math.min(1, dtSec * 11.5);
    this._manifoldLoad += (throttle - this._manifoldLoad) * loadAlpha;

    // Off-throttle high-RPM MGU-H waste-gate flutter & extra unburnt-fuel exhaust crackle accent
    if (!isRetro && this._prevThrottle > 0.62 && throttle < 0.18 && rpm > 8400 && speedKmh > 95) {
      if (nowMs - this._lastCrackleMs > 480) {
        this._lastCrackleMs = nowMs;
        if (rpm > 9400) {
          this.playWastegateFlutter(Math.min(1.0, (rpm - 8800) / 4000));
        }
        this.playOverrunCrackles(rpm > 10000 ? 3 : 2);
      }
    }
    this._prevThrottle = throttle;

    // Automatic side-by-side slingshot pass-by Doppler whoosh when pulling out of a close draft tow
    const inSlip = !!playerCar.inSlipstream || this._num(playerCar.slipstreamFactor, 0) > 0.55;
    if (this._prevSlipstream && !inSlip && speedKmh > 175 && throttle > 0.5) {
      const sidePan = playerCar.steerInput ? Math.sign(playerCar.steerInput) * 0.72 : null;
      this.playOvertakeWhoosh(Math.max(38, speedKmh * 0.22), sidePan);
    }
    this._prevSlipstream = inSlip;

    const slipBoost = playerCar.inSlipstream ? 1.024 : 1.0;
    const load = 0.34 + this._manifoldLoad * 0.66 + (overRev ? 0.20 : 0);

    // ------------------------------------------------------------------------
    // 1. DUAL CONVOLUTION REVERB VIEW ROUTING (`ir_carbon_cockpit` vs `ir_grand_prix_valley`)
    // ------------------------------------------------------------------------
    if (this.cockpitWetGain && this.valleyWetGain) {
      if (isRetro) {
        this._setTarget(this.cockpitWetGain.gain, 0.0, now, 0.05);
        this._setTarget(this.valleyWetGain.gain, 0.0, now, 0.05);
      } else if (cockpitMode) {
        // Tight early-reflection 3K carbon survival cell & helmet space + faint exterior bleed
        this._setTarget(this.cockpitWetGain.gain, 0.28, now, 0.06);
        this._setTarget(this.valleyWetGain.gain, 0.045, now, 0.06);
      } else {
        // Outdoor Grand Prix pit-wall & valley slapback echo (boosted near concrete grandstands!)
        const valleySend = 0.19 + this._nearGrandstandCached * 0.14;
        this._setTarget(this.cockpitWetGain.gain, 0.0, now, 0.06);
        this._setTarget(this.valleyWetGain.gain, valleySend, now, 0.06);
      }
    }

    // ------------------------------------------------------------------------
    // 2A. 1982 NAMCO 4-BIT WSG PROM ARCADE ENGINE (`isRetroMode`)
    // ------------------------------------------------------------------------
    if (isRetro) {
      const rawPsg = (42 + rpmNorm * 198 + (overRev ? 42 : 0)) * slipBoost;
      // Authentic Namco WSG frequency-accumulator register quantization
      const psgBase = Math.round(rawPsg * 2.0) * 0.5;
      this._setTarget(this.psgOscA.frequency, this._clampFreq(psgBase), now, 0.012);
      this._setTarget(
        this.psgOscB.frequency,
        this._clampFreq(psgBase * (overRev ? 1.66 : 1.502)),
        now,
        0.012
      );
      this._setTarget(this.psgSubOsc.frequency, this._clampFreq(psgBase * 0.5), now, 0.012);
      this._setTarget(
        this.psgFilter.frequency,
        this._clampFreq(1200 + rpmNorm * 1500 * (0.55 + throttle * 0.45)),
        now,
        0.018
      );
      this._setTarget(this.psgEngineGain.gain, 0.17 + load * 0.125, now, 0.02);

      // Silence 2026 sample/hybrid nodes cleanly
      this._setTarget(this.engineGain.gain, 0.0, now, 0.03);
      this._setTarget(this.turboGain.gain, 0.0, now, 0.03);
      if (this.mgukGain) this._setTarget(this.mgukGain.gain, 0.0, now, 0.03);
      this._setTarget(this.gearboxGain.gain, 0.0, now, 0.03);
      if (this.tireScrubGain) this._setTarget(this.tireScrubGain.gain, 0.0, now, 0.03);
      if (this.tireScreechGain) this._setTarget(this.tireScreechGain.gain, 0.0, now, 0.03);
      if (this.brakeRotorGain) this._setTarget(this.brakeRotorGain.gain, 0.0, now, 0.03);
      if (this.brakeSynthGain) this._setTarget(this.brakeSynthGain.gain, 0.0, now, 0.03);
    } else {
      // ----------------------------------------------------------------------
      // 2B. 2026 STUDIO 4-LAYER ENGINE `.WAV` CROSSFADE + PHYSICAL RESONATORS
      // ----------------------------------------------------------------------
      this._setTarget(this.psgEngineGain.gain, 0.0, now, 0.03);

      // Drive 4 loop-locked engine `.wav` AudioBufferSourceNodes by exact RPM ratio & throttle load!
      if (
        this.sampleIdleSrc &&
        this.sampleMidSrc &&
        this.sampleHighSrc &&
        this.sampleOverrunSrc
      ) {
        const rateIdle = this._clampRate((rpm / 3500) * slipBoost, 0.52, 2.55);
        const rateMid = this._clampRate((rpm / 8500) * slipBoost, 0.38, 1.75);
        const rateHigh = this._clampRate((rpm / 13500) * slipBoost, 0.46, 1.22);
        const rateOverrun = this._clampRate((rpm / 8500) * slipBoost, 0.40, 1.72);

        this._setTarget(this.sampleIdleSrc.playbackRate, rateIdle, now, 0.015);
        this._setTarget(this.sampleMidSrc.playbackRate, rateMid, now, 0.015);
        this._setTarget(this.sampleHighSrc.playbackRate, rateHigh, now, 0.015);
        this._setTarget(this.sampleOverrunSrc.playbackRate, rateOverrun, now, 0.015);

        // Equal-power RPM band crossfade: Idle (3.5k) <-> Mid Bark (8.5k) <-> High Scream (13.5k)
        const uIdleToMid = this._smooth01((rpm - 4100) / (7700 - 4100));
        const uMidToHigh = this._smooth01((rpm - 9100) / (12500 - 9100));

        const wIdleRpm = Math.cos(uIdleToMid * HALF_PI);
        const wMidRpm = Math.sin(uIdleToMid * HALF_PI) * Math.cos(uMidToHigh * HALF_PI);
        const wHighRpm = Math.sin(uMidToHigh * HALF_PI);

        // Separate On-Throttle Induction Bark from Off-Throttle Overrun Crackle/Vacuum!
        const overrunBlend =
          (1.0 - this._smooth01(this._manifoldLoad / 0.56)) *
          this._smooth01((rpm - 4300) / 3500) *
          this._smooth01((speedKmh - 32) / 55);

        const onThrottleDrive = (1.0 - overrunBlend * 0.72) * (0.48 + 0.52 * this._manifoldLoad);

        this._setTarget(
          this.sampleIdleGain.gain,
          wIdleRpm * (0.82 + 0.22 * this._manifoldLoad),
          now,
          0.022
        );
        this._setTarget(
          this.sampleMidGain.gain,
          wMidRpm * onThrottleDrive * 1.05,
          now,
          0.020
        );
        this._setTarget(
          this.sampleHighGain.gain,
          wHighRpm * onThrottleDrive * (0.80 + 0.28 * this._manifoldLoad),
          now,
          0.020
        );
        this._setTarget(
          this.sampleOverrunGain.gain,
          overrunBlend * 0.88,
          now,
          0.024
        );
      }

      // Phase-coherent sub-fundamental + Physical Otto fallback tracking
      const f0 = (114 + Math.pow(Math.min(1.1, rpmNorm), 1.03) * 336) * slipBoost;
      this._setTarget(this.oscSub.frequency, this._clampFreq(f0 * 0.5), now, 0.016);
      this._setTarget(this.oscFund.frequency, this._clampFreq(f0), now, 0.016);
      this._setTarget(this.oscOct.frequency, this._clampFreq(f0 * 2.0), now, 0.016);
      this._setTarget(
        this.oscFifth.frequency,
        this._clampFreq(f0 * (overRev ? 2.66 : 2.5)),
        now,
        0.016
      );
      this._setTarget(this.oscRasp.frequency, this._clampFreq(f0 * 3.0), now, 0.016);

      const v10Bloom = Math.max(0, Math.min(1, (rpm - 7200) / 5200));
      const subChestScale = this.samplesLoaded ? 0.22 : 0.44;
      this._setTarget(
        this.subGain.gain,
        subChestScale * (1.0 - v10Bloom * 0.22) * (cockpitMode ? 1.15 : 1.0),
        now,
        0.024
      );
      this._setTarget(this.fifthGain.gain, 0.08 + v10Bloom * (0.20 + throttle * 0.06), now, 0.022);
      this._setTarget(
        this.raspGain.gain,
        (0.02 + v10Bloom * throttle * 0.09) * (cockpitMode ? 0.82 : 1.0),
        now,
        0.022
      );

      // Overhead Carbon Airbox Induction Rush (prominent right above driver's helmet!)
      this._setTarget(this.airboxFilter.frequency, this._clampFreq(580 + rpmNorm * 1820), now, 0.025);
      this._setTarget(
        this.airboxGain.gain,
        this._manifoldLoad * (0.032 + rpmNorm * 0.095) * (cockpitMode ? 1.45 : 0.90),
        now,
        0.026
      );
      const onLimiter = rpm > 12850 && throttle > 0.65;
      this._setTarget(this.vibratoDepth.gain, overRev || onLimiter ? 9.5 : 2.6, now, 0.025);

      // Dynamic Exhaust & Intake Formant Sculpting + Helmet Shell Acoustic Filtering
      this._setTarget(
        this.exhaustFormant.frequency,
        this._clampFreq(340 + rpmNorm * 660 * load),
        now,
        0.024
      );
      this._setTarget(
        this.exhaustFormant.gain,
        this.samplesLoaded ? (cockpitMode ? 4.4 : 3.2) : (cockpitMode ? 7.0 : 5.8),
        now,
        0.03
      );
      this._setTarget(
        this.intakeFormant.frequency,
        this._clampFreq(860 + rpmNorm * 1920 * load),
        now,
        0.024
      );
      this._setTarget(
        this.intakeFormant.gain,
        this.samplesLoaded ? (2.2 + this._manifoldLoad * 2.6) : 5.6,
        now,
        0.03
      );

      const helmetShellLpMul = cockpitMode ? 0.78 : 1.0;
      const baseCut = this.samplesLoaded ? 2150 : 1280;
      const spanCut = this.samplesLoaded ? 6800 : 4400;
      this._setTarget(
        this.lowpassFilter.frequency,
        this._clampFreq((baseCut + rpmNorm * spanCut * (0.38 + this._manifoldLoad * 0.62)) * helmetShellLpMul),
        now,
        0.022
      );

      // Authentic 80 km/h FIA Pit-Lane Limiter Ignition Stutter
      const pitLimiterActive =
        playerCar.inPitLane &&
        playerCar.pitPhase !== 'STOPPED' &&
        speedKmh >= 76.5 &&
        throttle > 0.2;
      const pitMod = pitLimiterActive ? (Math.sin(now * 72.0) > 0 ? 1.08 : 0.54) : 1.0;
      const baseEngGain = this.samplesLoaded ? (0.24 + load * 0.21) : (0.165 + load * 0.165);
      this._setTarget(
        this.engineGain.gain,
        baseEngGain * pitMod * (cockpitMode ? 0.94 : 1.0),
        now,
        0.022
      );

      // 3. Hybrid MGU-H Turbo, Silicon-Carbide MGU-K Inverter & Spur-Gear Transmission Whine
      const targetSpool = throttle * (0.32 + 0.68 * Math.min(1, rpmNorm));
      const spoolRate = targetSpool > this._turboSpool ? 0.16 : 0.07;
      this._turboSpool += (targetSpool - this._turboSpool) * spoolRate;

      this._setTarget(
        this.oscTurbo.frequency,
        this._clampFreq(1860 + rpmNorm * 2550 + this._turboSpool * 540),
        now,
        0.038
      );
      this._setTarget(
        this.turboGain.gain,
        (0.005 + this._turboSpool * 0.018) * (cockpitMode ? 1.25 : 0.85),
        now,
        0.038
      );

      if (this.oscMgukInverter && this.mgukFilter && this.mgukGain) {
        const regenBrake = brake > 0.20 && speedKmh > 52 ? brake : 0.0;
        const ersLoad = Math.max(throttle * 0.92, regenBrake * 0.96);
        const mgukFreq = regenBrake > throttle
          ? 1520 + speedNorm * 3080
          : 1640 + rpmNorm * 2820 + throttle * 520;
        this._setTarget(this.oscMgukInverter.frequency, this._clampFreq(mgukFreq), now, 0.026);
        this._setTarget(this.mgukFilter.frequency, this._clampFreq(mgukFreq), now, 0.026);
        const mgukMotionGate = Math.min(1, speedKmh / 42);
        const mgukTargetGain = cockpitMode
          ? mgukMotionGate * (0.012 + ersLoad * 0.030)
          : mgukMotionGate * (0.002 + ersLoad * 0.006);
        this._setTarget(this.mgukGain.gain, mgukTargetGain, now, 0.03);
      }

      // Straight-Cut / Helical Dog-Ring Gearbox Whine (`gearbox_spur_whine_loop.wav` + harmonic)
      const drivetrainLoad = 0.42 + 0.58 * Math.max(this._manifoldLoad, brake * 0.82);
      if (this.gearboxSampleSrc) {
        const gbRate = this._clampRate(0.42 + (speedKmh / 200) * 0.96, 0.35, 2.25);
        this._setTarget(this.gearboxSampleSrc.playbackRate, gbRate, now, 0.024);
      }
      const gbFreq = cockpitMode ? 800 + speedNorm * 2600 : 420 + speedNorm * 1980;
      this._setTarget(this.oscGearbox.frequency, this._clampFreq(gbFreq), now, 0.025);
      this._setTarget(this.oscGearboxHarm.frequency, this._clampFreq(gbFreq * 2.0), now, 0.025);
      this._setTarget(this.gbBand.frequency, this._clampFreq(gbFreq * 1.05), now, 0.028);
      this._setTarget(this.gbBand.Q, cockpitMode ? 4.0 : 2.6, now, 0.03);
      const gbTargetGain = cockpitMode
        ? speedNorm * (0.055 + 0.055 * drivetrainLoad)
        : speedNorm * (0.020 + 0.024 * drivetrainLoad);
      this._setTarget(this.gearboxGain.gain, gbTargetGain, now, 0.032);
    }

    // ------------------------------------------------------------------------
    // 4. HIGH-SPEED BINAURAL AERO WIND RUSH (`aero_wind_cockpit_loop.wav`)
    // ------------------------------------------------------------------------
    const aeroNorm = Math.max(0, Math.min(1, (speedKmh - (cockpitMode ? 85 : 108)) / (cockpitMode ? 220 : 208)));
    const slipDuck = playerCar.inSlipstream ? 0.78 : 1.0;
    if (this.aeroSampleSrc && this.aeroSampleFilter) {
      const aeroRate = this._clampRate(0.72 + speedNorm * 0.62 + (playerCar.inSlipstream ? -0.08 : 0), 0.55, 1.55);
      this._setTarget(this.aeroSampleSrc.playbackRate, aeroRate, now, 0.045);
      this._setTarget(
        this.aeroSampleFilter.frequency,
        this._clampFreq(cockpitMode ? 980 + aeroNorm * 2600 : 760 + aeroNorm * 1900),
        now,
        0.045
      );
    }
    const aeroCenter = cockpitMode
      ? 490 + aeroNorm * 1060 + (playerCar.inSlipstream ? -130 : 0)
      : 390 + aeroNorm * 740 + (playerCar.inSlipstream ? -115 : 0);
    this._setTarget(this.aeroFilter.frequency, this._clampFreq(aeroCenter), now, 0.045);
    const aeroTargetGain = isRetro
      ? aeroNorm * aeroNorm * 0.05
      : (cockpitMode ? Math.pow(aeroNorm, 1.50) * 0.25 * slipDuck : aeroNorm * aeroNorm * 0.165 * slipDuck);
    this._setTarget(this.aeroGain.gain, aeroTargetGain, now, 0.048);

    // ------------------------------------------------------------------------
    // 5. PROGRESSIVE TIRE GRIP-LIMIT AUDIO (`65% -> 95%` GROAN, `>95%` SCREECH)
    //    + WHEEL-FREQUENCY `tireFlatSpot` THUMP + CARBON BRAKE ROTOR SQUEAL
    // ------------------------------------------------------------------------
    const skidRaw = Math.max(0, this._num(playerCar.skidIntensity, 0));
    let peakTireSlipUtil = 0;
    let peakBrakeLockRatio = 0;
    if (playerCar.tires && typeof playerCar.tires === 'object') {
      const cKeys = ['FL', 'FR', 'RL', 'RR'];
      for (let i = 0; i < 4; i++) {
        const t = playerCar.tires[cKeys[i]];
        if (t) {
          const alphaNorm = Math.abs(this._num(t.slipAngleRad, 0)) / 0.115;
          const kappaVal = this._num(t.slipRatio, 0);
          const kappaNorm = Math.abs(kappaVal) / 0.145;
          peakTireSlipUtil = Math.max(peakTireSlipUtil, Math.hypot(alphaNorm, kappaNorm));
          if (kappaVal < -0.14) {
            peakBrakeLockRatio = Math.max(peakBrakeLockRatio, (-kappaVal - 0.14) / 0.22);
          }
        }
      }
    }
    const explicitGripUtil = Math.max(
      this._num(playerCar.gripUtilization, 0),
      this._num(playerCar.lateralGripUtil, 0),
      Math.abs(this._num(playerCar.latG, 0)) / 4.25
    );
    const skidMappedUtil = skidRaw > 0.02 ? 0.62 + skidRaw * 0.48 : 0;
    const gripUtil = speedKmh > 22
      ? Math.max(peakTireSlipUtil, explicitGripUtil, skidMappedUtil)
      : 0;

    if (isRetro) {
      // Authentic 1982 Namco Arcade FM Square Tire-Chirp on hard slides + grass buzz
      if (playerCar.onGrass && speedKmh > 18) {
        this._setTarget(this.skidFilter.frequency, 310, now, 0.025);
        this._setTarget(this.skidFilter.Q, 1.4, now, 0.025);
        this._setTarget(this.skidGain.gain, Math.min(0.18, (speedKmh / 240) * 0.16), now, 0.03);
        this._setTarget(this.retroSkidGain.gain, 0.0, now, 0.025);
      } else {
        this._setTarget(this.skidGain.gain, 0.0, now, 0.03);
        const retroSlide = this._smooth01((gripUtil - 0.78) / 0.24);
        this._setTarget(
          this.retroSkidOsc.frequency,
          this._clampFreq(1180 + speedNorm * 320),
          now,
          0.02
        );
        this._setTarget(this.retroSkidGain.gain, retroSlide * 0.095, now, 0.022);
      }
    } else {
      if (this.retroSkidGain) this._setTarget(this.retroSkidGain.gain, 0.0, now, 0.025);

      if (playerCar.onGrass && speedKmh > 18) {
        // Coarse grass/gravel aggregate scrub
        const grassVol = Math.min(0.22, (speedKmh / 240) * 0.20);
        this._setTarget(this.skidFilter.frequency, 420, now, 0.03);
        this._setTarget(this.skidFilter.Q, 1.15, now, 0.03);
        this._setTarget(this.skidHarmGain.gain, 0.14, now, 0.03);
        this._setTarget(this.skidGain.gain, grassVol, now, 0.035);
        if (this.tireScrubGain) this._setTarget(this.tireScrubGain.gain, 0.04, now, 0.04);
        if (this.tireScreechGain) this._setTarget(this.tireScreechGain.gain, 0.0, now, 0.03);
      } else if (this.tireScrubGain && this.tireScreechGain) {
        // Studio Progressive Tire Grip-Limit Sample Architecture (Assetto Corsa / iRacing style!):
        // Stage 1 (65% -> 95% grip): warm Pirelli rubber hysteresis scrub groan builds smoothly
        const scrubRise = this._smooth01((gripUtil - 0.65) / 0.28);
        const screechRise = Math.max(
          this._smooth01((gripUtil - 0.94) / 0.22),
          brake > 0.76 ? Math.min(1.0, peakBrakeLockRatio) : 0.0
        );
        const helmetTireScale = cockpitMode ? 0.90 : 1.0;

        const scrubVol = scrubRise * (1.0 - screechRise * 0.52) * 0.30 * helmetTireScale;
        const screechVol = screechRise * 0.27 * helmetTireScale;

        if (this.tireScrubSrc && this.tireScrubFilter) {
          const scrubRate = this._clampRate(0.84 + speedNorm * 0.26 + scrubRise * 0.14, 0.65, 1.45);
          this._setTarget(this.tireScrubSrc.playbackRate, scrubRate, now, 0.028);
          this._setTarget(
            this.tireScrubFilter.frequency,
            this._clampFreq(1450 + scrubRise * 1650),
            now,
            0.03
          );
        }
        if (this.tireScreechSrc) {
          const screechRate = this._clampRate(0.90 + speedNorm * 0.22 + screechRise * 0.08, 0.72, 1.38);
          this._setTarget(this.tireScreechSrc.playbackRate, screechRate, now, 0.025);
        }

        this._setTarget(this.tireScrubGain.gain, scrubVol, now, 0.028);
        this._setTarget(this.tireScreechGain.gain, screechVol, now, 0.024);
        this._setTarget(this.skidGain.gain, 0.0, now, 0.03);
      } else {
        // Pre-decode procedural progressive scrub/squeal fallback
        const scrubRise = this._smooth01((gripUtil - 0.65) / 0.32);
        const baseSkidFreq = 780 + scrubRise * 620 + Math.min(340, speedKmh * 1.1);
        this._setTarget(this.skidFilter.frequency, this._clampFreq(baseSkidFreq), now, 0.028);
        this._setTarget(this.skidFilter.Q, 3.6 + scrubRise * 1.4, now, 0.03);
        this._setTarget(this.skidHarmFilter.frequency, this._clampFreq(baseSkidFreq * 1.65), now, 0.028);
        this._setTarget(this.skidGain.gain, scrubRise * 0.20, now, 0.03);
      }

      // Rhythmic Wheel-Rotation-Frequency `thump-thump-thump` when `car.tireFlatSpot` is active!
      let flFlat = 0;
      let frFlat = 0;
      let rlFlat = 0;
      let rrFlat = 0;
      if (Array.isArray(playerCar.tireFlatSpot)) {
        flFlat = this._num(playerCar.tireFlatSpot[0], 0);
        frFlat = this._num(playerCar.tireFlatSpot[1], 0);
        rlFlat = this._num(playerCar.tireFlatSpot[2], 0);
        rrFlat = this._num(playerCar.tireFlatSpot[3], 0);
      } else if (typeof playerCar.tireFlatSpot === 'number') {
        flFlat = playerCar.tireFlatSpot;
        frFlat = playerCar.tireFlatSpot;
      } else if (playerCar.tires && typeof playerCar.tires === 'object') {
        flFlat = this._num(playerCar.tires.FL?.flatSpot, 0);
        frFlat = this._num(playerCar.tires.FR?.flatSpot, 0);
        rlFlat = this._num(playerCar.tires.RL?.flatSpot, 0);
        rrFlat = this._num(playerCar.tires.RR?.flatSpot, 0);
      }
      const maxFlatSpot = Math.max(0, Math.min(1, Math.max(flFlat, frFlat, rlFlat, rrFlat)));
      if (maxFlatSpot > 0.045 && speedKmh > 18 && !playerCar.inPitLane && !this.muted) {
        const speedMps = speedKmh / 3.6;
        // Exact 18-inch F1 Pirelli wheel rotation frequency: f_w = v / (2 * pi * 0.36m)
        const wheelHz = speedMps / (TWO_PI * 0.36);
        this._flatSpotWheelPhase += dtSec * wheelHz;
        if (this._flatSpotWheelPhase >= 1.0) {
          this._flatSpotWheelPhase %= 1.0;
          if (nowMs - this._lastFlatSpotThumpMs >= 23) {
            this._lastFlatSpotThumpMs = nowMs;
            const leftMax = Math.max(flFlat, rlFlat);
            const rightMax = Math.max(frFlat, rrFlat);
            const flatPan = Math.max(-0.55, Math.min(0.55, (rightMax - leftMax) * 1.4));
            this._playFlatSpotWheelThump(maxFlatSpot, flatPan, speedNorm, brake, cockpitMode);
          }
        }
      }

      // Authentic 900C Carbon-Ceramic Slotted Brake Rotor Pad Hiss & Brembo Squeal
      const heatIn = brake * speedNorm * dtSec * 2.35;
      const coolOut = (0.42 + speedNorm * 0.85) * dtSec * 0.52;
      this._brakeRotorTemp = Math.max(0.08, Math.min(1.0, this._brakeRotorTemp + heatIn - coolOut));

      const brakeGate = brake > 0.18 && speedKmh > 36 && !playerCar.inPitLane
        ? this._smooth01((brake - 0.18) / 0.62) * this._smooth01((speedKmh - 34) / 72)
        : 0.0;

      // High-temp carbon brake squeal bites hardest in medium-low hairpin deceleration (55..185 km/h)
      const squealSpeedWindow =
        this._smooth01((speedKmh - 42) / 38) * (1.0 - 0.65 * this._smooth01((speedKmh - 195) / 85));
      const hotSquealDb = brakeGate * this._smooth01((this._brakeRotorTemp - 0.32) / 0.55) * squealSpeedWindow * 9.5;

      if (this.brakeRotorGain) {
        if (this.brakeRotorSrc) {
          this._setTarget(
            this.brakeRotorSrc.playbackRate,
            this._clampRate(0.82 + speedNorm * 0.38, 0.70, 1.35),
            now,
            0.03
          );
        }
        if (this.brakeRotorSquealFilter) {
          this._setTarget(this.brakeRotorSquealFilter.gain, hotSquealDb, now, 0.035);
        }
        const rotorVol = brakeGate * (0.14 + 0.08 * this._brakeRotorTemp) * (cockpitMode ? 1.15 : 0.88);
        this._setTarget(this.brakeRotorGain.gain, rotorVol, now, 0.028);
        if (this.brakeSynthGain) this._setTarget(this.brakeSynthGain.gain, 0.0, now, 0.03);
      } else if (this.brakeSynthGain) {
        this._setTarget(this.brakeSynthGain.gain, brakeGate * 0.055, now, 0.03);
      }
    }

    // ------------------------------------------------------------------------
    // 6. SPEED-MODULATED SERRATED FIA KERB SAWTOOTH RUMBLE (`curb_sawtooth_loop.wav`)
    // ------------------------------------------------------------------------
    const onCurb = !!playerCar.onCurb && speedKmh > 16;
    const curbSpeedNorm = Math.min(1, speedKmh / 310);
    const curbFreq = 115 + curbSpeedNorm * 145;
    if (this.curbSampleSrc) {
      const curbRate = this._clampRate(0.55 + (speedKmh / 180) * 0.72, 0.45, 1.85);
      this._setTarget(this.curbSampleSrc.playbackRate, curbRate, now, 0.015);
    }
    this._setTarget(this.curbOsc.frequency, this._clampFreq(curbFreq), now, 0.014);
    this._setTarget(this.curbSubOsc.frequency, this._clampFreq(curbFreq * 0.5), now, 0.014);
    this._setTarget(this.curbFilter.frequency, this._clampFreq(240 + curbSpeedNorm * 240), now, 0.018);
    this._setTarget(
      this.curbGain.gain,
      onCurb ? Math.min(0.30, (0.11 + curbSpeedNorm * 0.16) * (cockpitMode ? 1.18 : 1.0)) : 0.0,
      now,
      0.014
    );

    // ------------------------------------------------------------------------
    // 7. WET TARMAC WATER-SPRAY HISS & COCKPIT CARBON-FLOOR MARBLE PINGS
    // ------------------------------------------------------------------------
    const hydroBoost = this._num(playerCar.aquaplaneTimer, 0) > 0 ? 0.075 : 0.0;
    const rainVol = !isRetro && moisture > 0.06
      ? Math.min(0.22, moisture * 0.11 + (speedKmh / 310) * moisture * 0.12 + hydroBoost)
      : 0.0;
    this._setTarget(this.rainGain.gain, rainVol, now, 0.055);

    if (cockpitMode && !isRetro && !this.muted && speedKmh > 92 && nowMs - this._lastMarblePingMs > 72) {
      const absLat = Math.abs(this._num(playerCar.lateralOffset, 0));
      const offLineFactor = absLat > 3.0 ? Math.min(1.0, (absLat - 3.0) / 2.2) : 0.0;
      const marbleProbPerFrame =
        speedNorm * 0.016 +
        offLineFactor * 0.080 +
        (onCurb ? 0.050 : 0.0) +
        (gripUtil > 0.85 ? 0.035 : 0.0);
      if (Math.random() < marbleProbPerFrame) {
        this._lastMarblePingMs = nowMs;
        this._playMarbleCarbonPing(speedNorm, this._num(playerCar.lateralOffset, 0));
      }
    }

    // ------------------------------------------------------------------------
    // 8. AUTOMATIC GRANDSTAND CROWD AMBIENCE FALLBACK
    // ------------------------------------------------------------------------
    if (!isRetro && nowMs - this._lastExplicitCrowdUpdateMs > 180 && Number.isFinite(playerCar.s)) {
      const sMod = ((playerCar.s % 1000) + 1000) % 1000;
      const distMainStraight = Math.min(sMod, 1000 - sMod);
      const mainGrandstand = Math.max(0, 1 - distMainStraight / 145);
      const stadiumComplex = Math.max(0, 1 - Math.abs(sMod - 495) / 75) * 0.72;
      const autoNear = Math.max(mainGrandstand, stadiumComplex);
      const autoExcite = Math.min(
        1.0,
        0.25 + throttle * 0.30 + (inSlip ? 0.25 : 0) + (speedKmh > 280 ? 0.25 : 0)
      );
      this._applyCrowdAmbienceInternal(speedKmh, autoNear, autoExcite, now, nowMs);
    }
  }

  _playFlatSpotWheelThump(flatSeverity = 0.5, panPos = 0.0, speedNorm = 0.5, brake = 0.0, cockpitMode = false) {
    if (!this.initialized || this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const sev = Math.max(0.05, Math.min(1.0, flatSeverity));
    const loadBoost = 1.0 + brake * 0.62;
    const helmetScale = cockpitMode ? 1.22 : 0.90;
    const amp = Math.min(0.28, (0.045 + sev * 0.145) * loadBoost * helmetScale);

    const panner = this._createPanner(panPos);
    panner.connect(this.sfxBus);

    // Physical rubber carcass flat-spot thump (damped 98 -> 42 Hz carcass drum + 215 Hz carbon wishbone tap)
    const carcassOsc = this.ctx.createOscillator();
    carcassOsc.type = 'sine';
    const fStart = 88 + speedNorm * 34;
    this._setVal(carcassOsc.frequency, this._clampFreq(fStart), now);
    this._expRamp(carcassOsc.frequency, 38, now + 0.034);

    const wishboneOsc = this.ctx.createOscillator();
    wishboneOsc.type = 'triangle';
    this._setVal(wishboneOsc.frequency, this._clampFreq(195 + speedNorm * 65), now);
    this._expRamp(wishboneOsc.frequency, 74, now + 0.022);
    const wbGain = this.ctx.createGain();
    wbGain.gain.value = 0.28;

    const g = this.ctx.createGain();
    this._setVal(g.gain, 0.002, now);
    this._linRamp(g.gain, amp, now + 0.004);
    this._expRamp(g.gain, 0.0008, now + 0.038);

    carcassOsc.connect(g);
    wishboneOsc.connect(wbGain);
    wbGain.connect(g);
    g.connect(panner);

    carcassOsc.onended = () => {
      try { panner.disconnect(); } catch (_) {}
    };
    carcassOsc.start(now);
    wishboneOsc.start(now);
    carcassOsc.stop(now + 0.042);
    wishboneOsc.stop(now + 0.026);
  }

  _playMarbleCarbonPing(speedNorm = 0.6, lateralOffset = 0) {
    if (!this.initialized || this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const sideBias = lateralOffset !== 0 ? Math.sign(lateralOffset) * 0.25 : 0;
    const panVal = Math.max(-0.88, Math.min(0.88, sideBias + (Math.random() * 1.3 - 0.65)));
    const panner = this._createPanner(panVal);
    panner.connect(this.sfxBus);

    const pingFreq = 1920 + Math.random() * 2350;
    const pingOsc = this.ctx.createOscillator();
    pingOsc.type = 'triangle';
    this._setVal(pingOsc.frequency, this._clampFreq(pingFreq), now);
    this._expRamp(pingOsc.frequency, this._clampFreq(pingFreq * 0.56), now + 0.032);

    const tubBp = this.ctx.createBiquadFilter();
    tubBp.type = 'bandpass';
    tubBp.frequency.value = this._clampFreq(pingFreq * 0.92);
    tubBp.Q.value = 6.2;

    const amp = (0.030 + speedNorm * 0.044) * (0.7 + Math.random() * 0.45);
    const g = this.ctx.createGain();
    this._setVal(g.gain, amp, now);
    this._expRamp(g.gain, 0.0005, now + 0.036);

    pingOsc.connect(tubBp);
    tubBp.connect(g);
    g.connect(panner);

    pingOsc.onended = () => {
      try { panner.disconnect(); } catch (_) {}
    };
    pingOsc.start(now);
    pingOsc.stop(now + 0.040);
  }

  // --------------------------------------------------------------------------
  // NATURAL GRANULAR MOTORSPORT GRANDSTAND CROWD & DOPPLER PASS-BY
  // --------------------------------------------------------------------------
  updateCrowdAmbience(speedKmh = 0, nearGrandstandFactor = 0, excitement = 0) {
    if (!this.initialized || !this.ctx) return;
    const nowMs = performance.now();
    this._lastExplicitCrowdUpdateMs = nowMs;
    this._applyCrowdAmbienceInternal(
      speedKmh,
      nearGrandstandFactor,
      excitement,
      this.ctx.currentTime,
      nowMs
    );
  }

  _applyCrowdAmbienceInternal(speedKmh, nearGrandstandFactor, excitement, now, nowMs) {
    if (!this.crowdBedGain) return;
    const spd = Math.max(0, this._num(speedKmh, 0));
    const near = Math.max(0, Math.min(1, this._num(nearGrandstandFactor, 0)));
    const excite = Math.max(0, Math.min(1, this._num(excitement, 0)));
    this._nearGrandstandCached = near;

    const dtSec = this._lastCrowdTickMs > 0
      ? Math.min(0.1, Math.max(0.001, (nowMs - this._lastCrowdTickMs) * 0.001))
      : 0.016;
    this._lastCrowdTickMs = nowMs;

    if (near <= 0.015 || this.muted || this.isRetroMode) {
      this._setTarget(this.crowdBedGain.gain, 0.0, now, 0.09);
      return;
    }

    const passRateHz = (0.16 + (spd / 330) * 1.25) * (0.35 + near * 0.65);
    this._crowdDopplerPhase = (this._crowdDopplerPhase + dtSec * passRateHz * TWO_PI) % TWO_PI;

    const panSweep = Math.cos(this._crowdDopplerPhase) * (0.26 + near * 0.42);
    const dopplerVelocity = -Math.sin(this._crowdDopplerPhase) * Math.min(1, spd / 320) * near;
    const dopplerMul = 1.0 + dopplerVelocity * 0.085;

    if (this.crowdSampleSrc && this.crowdSampleFilter) {
      this._setTarget(
        this.crowdSampleSrc.playbackRate,
        this._clampRate((0.96 + excite * 0.10) * dopplerMul, 0.78, 1.25),
        now,
        0.05
      );
      this._setTarget(
        this.crowdSampleFilter.frequency,
        this._clampFreq((1650 + near * 1450 + excite * 1250) * (this._isCockpitView ? 0.74 : 1.0)),
        now,
        0.05
      );
      if (this.crowdSamplePanner && this.crowdSamplePanner.pan) {
        this._setTarget(this.crowdSamplePanner.pan, Math.max(-0.85, Math.min(0.85, panSweep)), now, 0.05);
      }
    }

    if (this.crowdBedPanner && this.crowdBedPanner.pan) {
      this._setTarget(this.crowdBedPanner.pan, Math.max(-0.85, Math.min(0.85, panSweep)), now, 0.05);
    }
    if (this.crowdBedFilterL && this.crowdBedFilterR) {
      const f1 = (510 + near * 190 + excite * 150) * dopplerMul;
      const f2 = (1240 + near * 410 + excite * 300) * dopplerMul;
      this._setTarget(this.crowdBedFilterL.frequency, this._clampFreq(f1), now, 0.05);
      this._setTarget(this.crowdBedFilterR.frequency, this._clampFreq(f2), now, 0.05);
    }

    const helmetCrowdScale = this._isCockpitView ? 0.68 : 1.0;
    const baseMax = this.crowdSampleSrc ? 0.26 : 0.20;
    const targetVol = Math.min(
      baseMax,
      (0.015 + Math.pow(near, 1.15) * 0.165) * (0.60 + excite * 0.58) * helmetCrowdScale
    );
    this._setTarget(this.crowdBedGain.gain, targetVol, now, 0.06);
  }

  // --------------------------------------------------------------------------
  // SEAMLESS 8-SPEED PNEUMATIC GEARSHIFTS, REV-MATCH BLIPS & DOPPLER PASSES
  // --------------------------------------------------------------------------
  playUpshiftCut(newGear = 2) {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    const gIdx = Math.max(1, Math.min(8, Math.round(this._num(newGear, 2))));

    if (this.isRetroMode) {
      // Crisp 1982 Namco LOW -> HIGH gear register step click
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      this._setVal(osc.frequency, 280, now);
      this._expRamp(osc.frequency, 140, now + 0.042);
      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.14, now);
      this._expRamp(g.gain, 0.001, now + 0.046);
      osc.connect(g);
      g.connect(this.engineBus);
      osc.onended = () => { try { g.disconnect(); } catch (_) {} };
      osc.start(now);
      osc.stop(now + 0.050);
      return;
    }

    // 1. Crisp ~44ms FIA seamless-shift ignition torque cut + re-engagement snap!
    if (this.shiftCutGain) {
      try {
        this.shiftCutGain.gain.cancelScheduledValues(now);
      } catch (_) {}
      const curVal = Math.max(0.1, Math.min(1.1, this._num(this.shiftCutGain.gain.value, 1.0)));
      this._setVal(this.shiftCutGain.gain, curVal, now);
      this._linRamp(this.shiftCutGain.gain, 0.08, now + 0.007);
      this._setVal(this.shiftCutGain.gain, 0.08, now + 0.042);
      this._linRamp(this.shiftCutGain.gain, 1.08, now + 0.054);
      this._linRamp(this.shiftCutGain.gain, 1.0, now + 0.080);
    }

    // 2. Pneumatic actuator & dog-ring mechanical thump -> engineBus + reverbSendEngine
    const thump = this.ctx.createOscillator();
    thump.type = 'triangle';
    this._setVal(thump.frequency, this._clampFreq(172 + gIdx * 8), now + 0.005);
    this._expRamp(thump.frequency, 44, now + 0.072);

    const tg = this.ctx.createGain();
    this._setVal(tg.gain, 0.28, now + 0.005);
    this._expRamp(tg.gain, 0.001, now + 0.080);

    thump.connect(tg);
    tg.connect(this.engineBus);
    if (this.reverbSendEngine) tg.connect(this.reverbSendEngine);
    thump.onended = () => {
      try { tg.disconnect(); } catch (_) {}
    };
    thump.start(now + 0.005);
    thump.stop(now + 0.086);

    // 3. Unburnt-fuel collector ignition-cut bark
    const snap = this.ctx.createBufferSource();
    snap.buffer = this.sampleBuffers.engineOverrun || this._noiseWhiteBuf;
    if (this.sampleBuffers.engineOverrun && snap.playbackRate) {
      this._setVal(snap.playbackRate, 1.05 + gIdx * 0.04, now + 0.008);
    }

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = this._clampFreq(560 + gIdx * 28);
    flt.Q.value = 1.45;

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._shaperCurveTransient;

    const ng = this.ctx.createGain();
    this._setVal(ng.gain, 0.22, now + 0.008);
    this._expRamp(ng.gain, 0.001, now + 0.074);

    snap.connect(flt);
    flt.connect(shaper);
    shaper.connect(ng);
    ng.connect(this.engineBus);
    if (this.reverbSendEngine) ng.connect(this.reverbSendEngine);

    snap.onended = () => {
      try { ng.disconnect(); } catch (_) {}
    };
    const off = this.sampleBuffers.engineOverrun ? (gIdx * 0.27) % 1.8 : 0;
    snap.start(now + 0.008, off);
    snap.stop(now + 0.080);
  }

  playDownshiftBlip(newGear = 2) {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    const gIdx = Math.max(1, Math.min(7, Math.round(this._num(newGear, 2))));

    if (this.isRetroMode) {
      const osc = this.ctx.createOscillator();
      if (this._namcoWsgEngineWaveA) osc.setPeriodicWave(this._namcoWsgEngineWaveA);
      else osc.type = 'square';
      this._setVal(osc.frequency, 155, now);
      this._linRamp(osc.frequency, 235, now + 0.035);
      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.14, now);
      this._expRamp(g.gain, 0.001, now + 0.065);
      osc.connect(g);
      g.connect(this.engineBus);
      osc.onended = () => { try { g.disconnect(); } catch (_) {} };
      osc.start(now);
      osc.stop(now + 0.070);
      return;
    }

    // 1. Studio Drive-by-Wire ECU Throttle Rev-Match Bark (Real Sample Grain + Physical Harmonic!)
    if (this.sampleBuffers.engineMid) {
      const blipSrc = this.ctx.createBufferSource();
      blipSrc.buffer = this.sampleBuffers.engineMid;
      blipSrc.loop = true;
      const baseRate = 0.88 + (8 - gIdx) * 0.085;
      this._setVal(blipSrc.playbackRate, this._clampRate(baseRate, 0.6, 2.0), now);
      this._linRamp(blipSrc.playbackRate, this._clampRate(baseRate * 1.28, 0.6, 2.2), now + 0.034);
      this._expRamp(blipSrc.playbackRate, this._clampRate(baseRate * 0.98, 0.6, 2.0), now + 0.105);

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'peaking';
      bp.frequency.value = 1280;
      bp.Q.value = 1.6;
      bp.gain.value = 4.2;

      const bg = this.ctx.createGain();
      this._setVal(bg.gain, 0.002, now);
      this._linRamp(bg.gain, 0.28, now + 0.014);
      this._expRamp(bg.gain, 0.001, now + 0.112);

      blipSrc.connect(bp);
      bp.connect(bg);
      bg.connect(this.engineBus);
      if (this.reverbSendEngine) bg.connect(this.reverbSendEngine);
      blipSrc.onended = () => {
        try { bg.disconnect(); } catch (_) {}
      };
      blipSrc.start(now, (gIdx * 0.31) % 1.9);
      blipSrc.stop(now + 0.118);
    } else {
      const fStart = 188 + (8 - gIdx) * 20;
      const blipFund = this.ctx.createOscillator();
      if (this._ottoPulseWave) blipFund.setPeriodicWave(this._ottoPulseWave);
      else blipFund.type = 'sawtooth';
      this._setVal(blipFund.frequency, this._clampFreq(fStart), now);
      this._linRamp(blipFund.frequency, this._clampFreq(fStart * 1.44), now + 0.034);
      this._expRamp(blipFund.frequency, this._clampFreq(fStart * 0.94), now + 0.098);

      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.002, now);
      this._linRamp(g.gain, 0.22, now + 0.012);
      this._expRamp(g.gain, 0.001, now + 0.102);

      blipFund.connect(g);
      g.connect(this.engineBus);
      blipFund.onended = () => {
        try { g.disconnect(); } catch (_) {}
      };
      blipFund.start(now);
      blipFund.stop(now + 0.108);
    }

    // 2. Pneumatic lower-gear dog engagement snick
    const click = this.ctx.createOscillator();
    click.type = 'triangle';
    this._setVal(click.frequency, 155, now);
    this._expRamp(click.frequency, 52, now + 0.048);
    const cg = this.ctx.createGain();
    this._setVal(cg.gain, 0.18, now);
    this._expRamp(cg.gain, 0.001, now + 0.052);
    click.connect(cg);
    cg.connect(this.engineBus);
    click.onended = () => {
      try { cg.disconnect(); } catch (_) {}
    };
    click.start(now);
    click.stop(now + 0.056);

    // 3. Off-throttle overrun crackle under corner braking
    this.playOverrunCrackles(gIdx <= 4 ? 2 : 1);
  }

  playWastegateFlutter(intensity = 0.85) {
    if (!this.initialized || this.muted || !this.ctx || this.isRetroMode) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    const lvl = Math.max(0.25, Math.min(1.0, this._num(intensity, 0.85)));

    for (let p = 0; p < 4; p++) {
      const t0 = now + p * 0.044;
      const decay = Math.pow(0.76, p);

      const chirp = this.ctx.createOscillator();
      chirp.type = 'sine';
      const fBase = 2850 - p * 240;
      this._setVal(chirp.frequency, this._clampFreq(fBase), t0);
      this._expRamp(chirp.frequency, this._clampFreq(fBase * 0.72), t0 + 0.040);

      const cg = this.ctx.createGain();
      this._setVal(cg.gain, 0.001, t0);
      this._linRamp(cg.gain, 0.052 * lvl * decay, t0 + 0.008);
      this._expRamp(cg.gain, 0.0008, t0 + 0.042);

      chirp.connect(cg);
      cg.connect(this.engineBus);
      chirp.onended = () => {
        try { cg.disconnect(); } catch (_) {}
      };
      chirp.start(t0);
      chirp.stop(t0 + 0.046);
    }

    const sighSrc = this.ctx.createBufferSource();
    sighSrc.buffer = this._noiseWhiteBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.2;
    this._setVal(bp.frequency, 2550, now);
    this._expRamp(bp.frequency, 920, now + 0.21);
    const sg = this.ctx.createGain();
    this._setVal(sg.gain, 0.001, now);
    this._linRamp(sg.gain, 0.082 * lvl, now + 0.02);
    this._expRamp(sg.gain, 0.0008, now + 0.22);
    sighSrc.connect(bp);
    bp.connect(sg);
    sg.connect(this.engineBus);
    sighSrc.onended = () => {
      try { sg.disconnect(); } catch (_) {}
    };
    sighSrc.start(now);
    sighSrc.stop(now + 0.23);
  }

  playOverrunCrackles(count = 2) {
    if (!this.initialized || this.muted || !this.ctx || this.isRetroMode) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    const safeCount = Math.max(1, Math.min(5, Math.round(this._num(count, 2))));

    for (let i = 0; i < safeCount; i++) {
      const t0 = now + 0.018 + i * (0.045 + Math.random() * 0.045);

      const popOsc = this.ctx.createOscillator();
      popOsc.type = 'triangle';
      const popStart = 185 + Math.random() * 95;
      this._setVal(popOsc.frequency, popStart, t0);
      this._expRamp(popOsc.frequency, 42, t0 + 0.056);
      const popGain = this.ctx.createGain();
      this._setVal(popGain.gain, 0.16, t0);
      this._expRamp(popGain.gain, 0.001, t0 + 0.060);

      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseWhiteBuf;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.value = this._clampFreq(390 + Math.random() * 390);
      flt.Q.value = 1.85;

      const shaper = this.ctx.createWaveShaper();
      shaper.curve = this._shaperCurveTransient;

      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.17, t0);
      this._expRamp(g.gain, 0.001, t0 + 0.068);

      const pan = this._createPanner((Math.random() - 0.5) * 0.44);

      popOsc.connect(popGain);
      popGain.connect(pan);
      src.connect(flt);
      flt.connect(shaper);
      shaper.connect(g);
      g.connect(pan);
      pan.connect(this.engineBus);
      if (this.reverbSendEngine) pan.connect(this.reverbSendEngine);

      src.onended = () => {
        try { pan.disconnect(); } catch (_) {}
      };
      popOsc.start(t0);
      src.start(t0);
      popOsc.stop(t0 + 0.064);
      src.stop(t0 + 0.072);
    }
  }

  playOvertakeWhoosh(relSpeedKmh = 45, pan = null) {
    if (!this.initialized || this.muted || !this.ctx) return;
    const nowMs = performance.now();
    if (nowMs - this._lastOvertakeMs < 240) return;
    this._lastOvertakeMs = nowMs;

    this._ensureRunning();
    const now = this.ctx.currentTime;
    const rel = Math.max(12, Math.min(180, this._num(relSpeedKmh, 45)));
    const intensity = Math.min(1.0, Math.max(0.32, rel / 75));

    let startPan;
    if (pan !== null && pan !== undefined && Number.isFinite(Number(pan))) {
      startPan = Math.max(-0.95, Math.min(0.95, Number(pan)));
      if (Math.abs(startPan) < 0.15) startPan = (startPan >= 0 ? 1 : -1) * 0.55;
    } else {
      startPan = this._overtakePanFlip * 0.72;
      this._overtakePanFlip = -this._overtakePanFlip;
    }

    const panner = this._createPanner(startPan);
    if (panner.pan) {
      this._setVal(panner.pan, startPan, now);
      this._linRamp(panner.pan, -startPan * 0.65, now + 0.38);
    }

    if (this.isRetroMode) {
      // Authentic 1982 Namco rival pass Doppler WSG tone!
      const rivalOsc = this.ctx.createOscillator();
      if (this._namcoWsgEngineWaveB) rivalOsc.setPeriodicWave(this._namcoWsgEngineWaveB);
      else rivalOsc.type = 'square';
      this._setVal(rivalOsc.frequency, this._clampFreq(245 + rel * 1.4), now);
      this._expRamp(rivalOsc.frequency, this._clampFreq(105 + rel * 0.35), now + 0.34);
      const rg = this.ctx.createGain();
      this._setVal(rg.gain, 0.002, now);
      this._linRamp(rg.gain, 0.16 * intensity, now + 0.08);
      this._expRamp(rg.gain, 0.001, now + 0.36);
      rivalOsc.connect(rg);
      rg.connect(panner);
      panner.connect(this.sfxBus);
      rivalOsc.onended = () => { try { panner.disconnect(); } catch (_) {} };
      rivalOsc.start(now);
      rivalOsc.stop(now + 0.38);
      return;
    }

    // 1. Aerodynamic sidepod air-shear wake
    const aeroBuf = this.sampleBuffers.aeroWind || this._noisePinkBuf;
    const src = this.ctx.createBufferSource();
    src.buffer = aeroBuf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.Q.value = 1.75;
    this._setVal(flt.frequency, this._clampFreq(1040 + rel * 4.6), now);
    this._expRamp(flt.frequency, 155, now + 0.38);

    const g = this.ctx.createGain();
    this._setVal(g.gain, 0.002, now);
    this._linRamp(g.gain, 0.25 * intensity, now + 0.09);
    this._expRamp(g.gain, 0.001, now + 0.40);

    // 2. Rival High-RPM Engine Sample Snarl with Doppler Pitch Drop!
    if (this.sampleBuffers.engineHigh) {
      const rivalSrc = this.ctx.createBufferSource();
      rivalSrc.buffer = this.sampleBuffers.engineHigh;
      rivalSrc.loop = true;
      const rStart = this._clampRate(0.96 + (rel / 220) * 0.28, 0.65, 1.45);
      const rEnd = this._clampRate(0.66 + (rel / 400) * 0.12, 0.45, 1.15);
      this._setVal(rivalSrc.playbackRate, rStart, now);
      this._expRamp(rivalSrc.playbackRate, rEnd, now + 0.38);
      const rg = this.ctx.createGain();
      rg.gain.value = 0.48;
      rivalSrc.connect(rg);
      rg.connect(flt);
      rivalSrc.start(now, Math.random() * 1.4);
      rivalSrc.stop(now + 0.42);
    } else {
      const dopplerOsc = this.ctx.createOscillator();
      if (this._ottoV10Wave) dopplerOsc.setPeriodicWave(this._ottoV10Wave);
      else dopplerOsc.type = 'sawtooth';
      this._setVal(dopplerOsc.frequency, this._clampFreq(460 + rel * 1.6), now);
      this._expRamp(dopplerOsc.frequency, this._clampFreq(205 + rel * 0.4), now + 0.38);
      const dg = this.ctx.createGain();
      dg.gain.value = 0.32;
      dopplerOsc.connect(dg);
      dg.connect(flt);
      dopplerOsc.start(now);
      dopplerOsc.stop(now + 0.42);
    }

    src.connect(flt);
    flt.connect(g);
    g.connect(panner);
    panner.connect(this.sfxBus);
    if (this.reverbSendSfx) panner.connect(this.reverbSendSfx);

    src.onended = () => {
      try { panner.disconnect(); } catch (_) {}
    };
    src.start(now);
    src.stop(now + 0.42);
  }

  // --------------------------------------------------------------------------
  // FOM WORLD-FEED TV BROADCAST TRACKSIDE DOPPLER FLY-BY + VALLEY REVERB
  // --------------------------------------------------------------------------
  playReplayFlyby(speedKmh = 290) {
    if (!this.initialized || this.muted || !this.ctx) return;
    const nowMs = performance.now();
    if (nowMs - this._lastFlybyMs < 180) return;
    this._lastFlybyMs = nowMs;

    this._ensureRunning();
    const now = this.ctx.currentTime;
    const vKmh = Math.max(110, Math.min(355, this._num(speedKmh, 290)));
    const vMps = vKmh / 3.6;
    const cSound = 343.0;

    // Exact physical acoustic Doppler ratios: approach compression -> camera apex -> receding expansion
    const approachRatio = cSound / Math.max(195, cSound - vMps * 0.82);
    const recedeRatio = cSound / (cSound + vMps * 0.82);
    const tPass = now + 0.42;
    const tEnd = now + 1.12;

    const side = this._flybyPanFlip;
    this._flybyPanFlip = -this._flybyPanFlip;
    const panner = this._createPanner(-0.88 * side);
    if (panner.pan) {
      this._setVal(panner.pan, -0.90 * side, now);
      this._linRamp(panner.pan, 0.0, tPass);
      this._linRamp(panner.pan, 0.90 * side, tEnd);
    }

    // Distance atmospheric air-absorption filter opens wide right at camera pass
    const distLp = this.ctx.createBiquadFilter();
    distLp.type = 'lowpass';
    distLp.Q.value = 1.05;
    this._setVal(distLp.frequency, 980, now);
    this._expRamp(distLp.frequency, 6800, tPass);
    this._expRamp(distLp.frequency, 820, tEnd);

    const flybyGain = this.ctx.createGain();
    this._setVal(flybyGain.gain, 0.002, now);
    this._expRamp(flybyGain.gain, 0.34, tPass - 0.015);
    this._expRamp(flybyGain.gain, 0.001, tEnd);

    // 1. Screaming High-RPM `.wav` Engine Sample (or Physical Otto fallback) Doppler Sweep!
    let cleanupRef = null;
    if (this.sampleBuffers.engineHigh) {
      const engSrc = this.ctx.createBufferSource();
      engSrc.buffer = this.sampleBuffers.engineHigh;
      engSrc.loop = true;
      const baseRate = 0.82 + (vKmh / 335) * 0.24;
      this._setVal(engSrc.playbackRate, this._clampRate(baseRate * approachRatio * 0.96, 0.4, 2.4), now);
      this._linRamp(engSrc.playbackRate, this._clampRate(baseRate * approachRatio, 0.4, 2.4), tPass - 0.05);
      this._expRamp(engSrc.playbackRate, this._clampRate(baseRate * recedeRatio, 0.35, 2.2), tPass + 0.085);
      this._expRamp(engSrc.playbackRate, this._clampRate(baseRate * recedeRatio * 0.93, 0.35, 2.2), tEnd);
      engSrc.connect(distLp);
      engSrc.start(now, Math.random() * 1.6);
      engSrc.stop(tEnd + 0.03);
      cleanupRef = engSrc;
    } else {
      const fBase = 320 + (vKmh / 330) * 105;
      const osc1 = this.ctx.createOscillator();
      if (this._ottoV10Wave) osc1.setPeriodicWave(this._ottoV10Wave);
      else osc1.type = 'sawtooth';
      this._setVal(osc1.frequency, this._clampFreq(fBase * approachRatio), now);
      this._expRamp(osc1.frequency, this._clampFreq(fBase * recedeRatio), tPass + 0.085);
      osc1.connect(distLp);
      osc1.start(now);
      osc1.stop(tEnd + 0.03);
      cleanupRef = osc1;
    }

    distLp.connect(flybyGain);
    flybyGain.connect(panner);

    // 2. Sub-Bass Aerodynamic Wake Shockwave & Air Tear right at lens pass
    const subShock = this.ctx.createOscillator();
    subShock.type = 'triangle';
    this._setVal(subShock.frequency, 124, tPass - 0.08);
    this._expRamp(subShock.frequency, 34, tPass + 0.19);
    const subGain = this.ctx.createGain();
    this._setVal(subGain.gain, 0.002, tPass - 0.08);
    this._linRamp(subGain.gain, 0.30, tPass);
    this._expRamp(subGain.gain, 0.001, tPass + 0.23);
    subShock.connect(subGain);
    subGain.connect(panner);

    const wakeSrc = this.ctx.createBufferSource();
    wakeSrc.buffer = this.sampleBuffers.aeroWind || this._noisePinkBuf;
    const wakeBp = this.ctx.createBiquadFilter();
    wakeBp.type = 'bandpass';
    wakeBp.Q.value = 1.5;
    this._setVal(wakeBp.frequency, 1280, tPass - 0.10);
    this._expRamp(wakeBp.frequency, 165, tPass + 0.30);
    const wakeGain = this.ctx.createGain();
    this._setVal(wakeGain.gain, 0.002, tPass - 0.10);
    this._linRamp(wakeGain.gain, 0.25, tPass + 0.01);
    this._expRamp(wakeGain.gain, 0.001, tPass + 0.32);
    wakeSrc.connect(wakeBp);
    wakeBp.connect(wakeGain);
    wakeGain.connect(panner);

    panner.connect(this.sfxBus);
    // Send TV fly-by into Grand Prix Valley IR so the pass echoes naturally across the valley!
    if (this.valleyConvolver && this.valleyConvolver.buffer) {
      const tvEchoSend = this.ctx.createGain();
      tvEchoSend.gain.value = 0.38;
      panner.connect(tvEchoSend);
      tvEchoSend.connect(this.valleyConvolver);
      cleanupRef.onended = () => {
        try { panner.disconnect(); } catch (_) {}
        try { tvEchoSend.disconnect(); } catch (_) {}
      };
    } else if (cleanupRef) {
      cleanupRef.onended = () => {
        try { panner.disconnect(); } catch (_) {}
      };
    }

    subShock.start(tPass - 0.08);
    subShock.stop(tPass + 0.25);
    wakeSrc.start(tPass - 0.10);
    wakeSrc.stop(tPass + 0.34);
  }

  // --------------------------------------------------------------------------
  // NATURAL NON-CHEESY STADIUM CROWD CHEERS (GRANULAR VOCAL ROAR + APPLAUSE)
  // --------------------------------------------------------------------------
  playCrowdCheer(intensity = 0.8) {
    if (!this.initialized || this.muted || !this.ctx || this.isRetroMode) return;
    const nowMs = performance.now();
    if (nowMs - this._lastCrowdMs < 420) return;
    this._lastCrowdMs = nowMs;

    this._ensureRunning();
    const now = this.ctx.currentTime;
    const lvl = Math.max(0.15, Math.min(1.0, this._num(intensity, 0.8)));
    const helmetAtten = this._isCockpitView ? 0.74 : 1.0;
    const amp = lvl * helmetAtten;
    const dur = 2.05;

    if (this.sampleBuffers.crowdRoar) {
      // Wide-stereo decorrelated granular stadium crowd swell (zero synth buzzer horns!)
      [-0.62, 0.62].forEach((panSide, idx) => {
        const src = this.ctx.createBufferSource();
        src.buffer = this.sampleBuffers.crowdRoar;
        src.loop = true;
        const baseRate = idx === 0 ? 1.02 : 0.97;
        this._setVal(src.playbackRate, baseRate, now);
        this._linRamp(src.playbackRate, baseRate * 1.06, now + 0.38);
        this._linRamp(src.playbackRate, baseRate * 0.98, now + dur);

        const swellEq = this.ctx.createBiquadFilter();
        swellEq.type = 'peaking';
        swellEq.frequency.value = 1350 + idx * 180;
        swellEq.Q.value = 1.25;
        this._setVal(swellEq.gain, 1.0, now);
        this._linRamp(swellEq.gain, 5.5, now + 0.35);
        this._linRamp(swellEq.gain, 0.5, now + dur);

        const g = this.ctx.createGain();
        this._setVal(g.gain, 0.002, now);
        this._linRamp(g.gain, 0.22 * amp, now + 0.28);
        this._linRamp(g.gain, 0.16 * amp, now + 0.82);
        this._expRamp(g.gain, 0.001, now + dur);

        const panner = this._createPanner(panSide);
        src.connect(swellEq);
        swellEq.connect(g);
        g.connect(panner);
        panner.connect(this.sfxBus);
        if (this.reverbSendSfx) panner.connect(this.reverbSendSfx);

        src.onended = () => {
          try { panner.disconnect(); } catch (_) {}
        };
        src.start(now, (idx * 1.15) % Math.max(0.5, this.sampleBuffers.crowdRoar.duration));
        src.stop(now + dur + 0.04);
      });
      return;
    }

    // Fallback formant swell if triggered in <80ms before buffer decode
    [-0.60, 0.60].forEach((panPos, idx) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noisePinkBuf;
      src.loop = true;
      const f1 = this.ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.Q.value = 1.5;
      this._setVal(f1.frequency, 560 + idx * 35, now);
      this._linRamp(f1.frequency, 760, now + 0.42);
      this._expRamp(f1.frequency, 510, now + dur);
      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.002, now);
      this._linRamp(g.gain, 0.15 * amp, now + 0.28);
      this._expRamp(g.gain, 0.001, now + dur);
      const panner = this._createPanner(panPos);
      src.connect(f1);
      f1.connect(g);
      g.connect(panner);
      panner.connect(this.sfxBus);
      src.onended = () => { try { panner.disconnect(); } catch (_) {} };
      src.start(now, idx * 0.8);
      src.stop(now + dur + 0.03);
    });
  }

  playCrowdCheerSurge(intensity = 1.0) {
    if (!this.initialized || this.muted || !this.ctx || this.isRetroMode) return;
    const nowMs = performance.now();
    if (nowMs - this._lastCrowdSurgeMs < 360) return;
    this._lastCrowdSurgeMs = nowMs;

    this._ensureRunning();
    const now = this.ctx.currentTime;
    const lvl = Math.max(0.20, Math.min(1.15, this._num(intensity, 1.0)));
    const helmetAtten = this._isCockpitView ? 0.76 : 1.0;
    const amp = lvl * helmetAtten;
    const dur = 2.45;

    if (this.sampleBuffers.crowdRoar) {
      // Natural packed grandstand roar surge + organic open-air applause shimmer (zero cartoon horns!)
      [-0.74, 0.74].forEach((panSide, idx) => {
        const src = this.ctx.createBufferSource();
        src.buffer = this.sampleBuffers.crowdRoar;
        src.loop = true;
        const baseRate = idx === 0 ? 1.04 : 0.99;
        this._setVal(src.playbackRate, baseRate * 0.96, now);
        this._linRamp(src.playbackRate, baseRate * 1.10, now + 0.34);
        this._linRamp(src.playbackRate, baseRate * 0.97, now + dur);

        const crestEq = this.ctx.createBiquadFilter();
        crestEq.type = 'peaking';
        crestEq.frequency.value = 1520 + idx * 190;
        crestEq.Q.value = 1.2;
        this._setVal(crestEq.gain, 1.5, now);
        this._linRamp(crestEq.gain, 6.8, now + 0.32);
        this._linRamp(crestEq.gain, 0.8, now + dur);

        const g = this.ctx.createGain();
        this._setVal(g.gain, 0.002, now);
        this._linRamp(g.gain, 0.25 * amp, now + 0.24);
        this._linRamp(g.gain, 0.19 * amp, now + 0.92);
        this._expRamp(g.gain, 0.001, now + dur);

        const panner = this._createPanner(panSide);
        if (panner.pan) {
          this._setVal(panner.pan, panSide, now);
          this._linRamp(panner.pan, panSide * -0.35, now + dur);
        }

        src.connect(crestEq);
        crestEq.connect(g);
        g.connect(panner);
        panner.connect(this.sfxBus);
        if (this.reverbSendSfx) panner.connect(this.reverbSendSfx);

        src.onended = () => {
          try { panner.disconnect(); } catch (_) {}
        };
        src.start(now, (0.35 + idx * 1.25) % Math.max(0.5, this.sampleBuffers.crowdRoar.duration));
        src.stop(now + dur + 0.04);
      });

      // Soft natural stadium applause air shimmer
      const clapSrc = this.ctx.createBufferSource();
      clapSrc.buffer = this._noisePinkBuf;
      clapSrc.loop = true;
      const clapBp = this.ctx.createBiquadFilter();
      clapBp.type = 'bandpass';
      clapBp.frequency.value = 2650;
      clapBp.Q.value = 1.4;
      const clapGain = this.ctx.createGain();
      this._setVal(clapGain.gain, 0.001, now);
      this._linRamp(clapGain.gain, 0.042 * amp, now + 0.22);
      this._expRamp(clapGain.gain, 0.0008, now + dur * 0.90);
      clapSrc.connect(clapBp);
      clapBp.connect(clapGain);
      clapGain.connect(this.sfxBus);
      clapSrc.onended = () => { try { clapGain.disconnect(); } catch (_) {} };
      clapSrc.start(now);
      clapSrc.stop(now + dur);
      return;
    }

    this.playCrowdCheer(lvl);
  }

  // --------------------------------------------------------------------------
  // 1:1 AUTHENTIC 1982 NAMCO ARCADE 4-BIT WSG FANFARES & VICTORY JINGLES
  // --------------------------------------------------------------------------
  _stopActiveFanfare() {
    while (this._activeFanfareNodes.length > 0) {
      const item = this._activeFanfareNodes.pop();
      try { item.osc.stop(); } catch (_) {}
      try { item.out.disconnect(); } catch (_) {}
    }
  }

  _scheduleNamcoVoices(voices, baseGain = 0.16) {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    this._stopActiveFanfare();

    const tStart = this.ctx.currentTime + 0.015;
    voices.forEach((voice) => {
      let cursor = tStart;
      const isBass = voice.role === 'bass';
      const pan = this._createPanner(voice.pan || 0);
      pan.connect(this.musicBus);

      voice.notes.forEach(([midiOrZero, durSec, gate = 0.86]) => {
        const d = Math.max(0.03, durSec);
        if (midiOrZero > 0) {
          const freq = 440 * Math.pow(2, (midiOrZero - 69) / 12);
          const osc = this.ctx.createOscillator();
          if (!isBass && this._namcoWsgBrassWave) {
            osc.setPeriodicWave(this._namcoWsgBrassWave);
          } else if (isBass && this._namcoPulse25Wave) {
            osc.setPeriodicWave(this._namcoPulse25Wave);
          } else {
            osc.type = isBass ? 'square' : 'sawtooth';
          }
          this._setVal(osc.frequency, this._clampFreq(freq), cursor);

          const flt = this.ctx.createBiquadFilter();
          flt.type = 'lowpass';
          flt.frequency.value = isBass ? 1450 : 3400;

          const g = this.ctx.createGain();
          const vAmp = baseGain * (voice.weight ?? 1.0);
          const noteOnDur = Math.max(0.02, d * gate);
          this._setVal(g.gain, 0.001, cursor);
          this._linRamp(g.gain, vAmp, cursor + 0.005);
          this._linRamp(g.gain, vAmp * 0.78, cursor + noteOnDur * 0.75);
          this._expRamp(g.gain, 0.0008, cursor + noteOnDur + 0.018);

          osc.connect(flt);
          flt.connect(g);
          g.connect(pan);

          const rec = { osc, out: g };
          this._activeFanfareNodes.push(rec);
          osc.onended = () => {
            try { g.disconnect(); } catch (_) {}
            const idx = this._activeFanfareNodes.indexOf(rec);
            if (idx !== -1) this._activeFanfareNodes.splice(idx, 1);
          };
          osc.start(cursor);
          osc.stop(cursor + noteOnDur + 0.024);
        }
        cursor += d;
      });
    });
  }

  play1982QualifyFanfare() {
    const u = 0.115;
    this._scheduleNamcoVoices([
      {
        role: 'lead',
        weight: 1.0,
        pan: -0.12,
        notes: [
          [67, u, 0.75], [67, u, 0.75], [67, u, 0.75],
          [72, u * 3, 0.90],
          [76, u * 1.5, 0.82], [79, u * 1.5, 0.82],
          [84, u * 3, 0.92],
          [79, u * 1.5, 0.80], [76, u * 1.5, 0.80],
          [79, u * 2, 0.85], [83, u * 1, 0.85],
          [84, u * 5, 0.95],
        ],
      },
      {
        role: 'harm',
        weight: 0.68,
        pan: 0.18,
        notes: [
          [62, u, 0.75], [62, u, 0.75], [62, u, 0.75],
          [64, u * 3, 0.90],
          [67, u * 1.5, 0.82], [72, u * 1.5, 0.82],
          [76, u * 3, 0.92],
          [72, u * 1.5, 0.80], [67, u * 1.5, 0.80],
          [71, u * 2, 0.85], [74, u * 1, 0.85],
          [76, u * 5, 0.95],
        ],
      },
      {
        role: 'bass',
        weight: 0.62,
        pan: 0.0,
        notes: [
          [55, u, 0.70], [55, u, 0.70], [55, u, 0.70],
          [48, u * 3, 0.85],
          [52, u * 1.5, 0.78], [55, u * 1.5, 0.78],
          [60, u * 3, 0.85],
          [55, u * 3, 0.80],
          [55, u * 2, 0.78], [55, u * 1, 0.78],
          [48, u * 5, 0.92],
        ],
      },
    ], 0.15);
  }

  play1982RaceStartFanfare() {
    const u = 0.12;
    this._scheduleNamcoVoices([
      {
        role: 'lead',
        weight: 1.0,
        pan: -0.15,
        notes: [
          [72, u, 0.72], [72, u, 0.72], [72, u, 0.72], [72, u * 3, 0.90],
          [68, u * 2, 0.86], [70, u * 2, 0.86],
          [72, u * 2, 0.84], [70, u * 1, 0.78], [72, u * 3, 0.92],
          [74, u * 1.5, 0.84], [76, u * 1.5, 0.84], [77, u * 1.5, 0.84], [79, u * 1.5, 0.88],
          [84, u * 5.5, 0.96],
        ],
      },
      {
        role: 'harm',
        weight: 0.70,
        pan: 0.18,
        notes: [
          [64, u, 0.72], [64, u, 0.72], [64, u, 0.72], [64, u * 3, 0.90],
          [63, u * 2, 0.86], [65, u * 2, 0.86],
          [64, u * 2, 0.84], [65, u * 1, 0.78], [67, u * 3, 0.92],
          [67, u * 1.5, 0.84], [69, u * 1.5, 0.84], [71, u * 1.5, 0.84], [74, u * 1.5, 0.88],
          [76, u * 5.5, 0.96],
        ],
      },
      {
        role: 'bass',
        weight: 0.65,
        pan: 0.0,
        notes: [
          [48, u, 0.70], [48, u, 0.70], [48, u, 0.70], [48, u * 3, 0.86],
          [44, u * 2, 0.84], [46, u * 2, 0.84],
          [48, u * 2, 0.80], [46, u * 1, 0.75], [48, u * 3, 0.88],
          [50, u * 3, 0.82], [55, u * 3, 0.85],
          [48, u * 5.5, 0.94],
        ],
      },
    ], 0.155);
  }

  play1982CheckeredFlagJingle() {
    const u = 0.105;
    this._scheduleNamcoVoices([
      {
        role: 'lead',
        weight: 1.0,
        pan: -0.14,
        notes: [
          [72, u, 0.80], [76, u, 0.80], [79, u, 0.80], [84, u * 2, 0.90],
          [81, u, 0.78], [84, u * 2, 0.88], [79, u * 2, 0.85],
          [77, u, 0.80], [81, u, 0.80], [79, u, 0.80], [76, u, 0.80],
          [74, u * 2, 0.85], [79, u * 2, 0.85],
          [76, u, 0.82], [79, u, 0.82], [84, u, 0.82], [88, u * 2, 0.92],
          [86, u, 0.82], [83, u, 0.82], [79, u, 0.82], [84, u * 6, 0.96],
        ],
      },
      {
        role: 'harm',
        weight: 0.68,
        pan: 0.18,
        notes: [
          [64, u, 0.80], [67, u, 0.80], [72, u, 0.80], [76, u * 2, 0.90],
          [72, u, 0.78], [76, u * 2, 0.88], [72, u * 2, 0.85],
          [69, u, 0.80], [72, u, 0.80], [72, u, 0.80], [67, u, 0.80],
          [67, u * 2, 0.85], [71, u * 2, 0.85],
          [67, u, 0.82], [72, u, 0.82], [76, u, 0.82], [79, u * 2, 0.92],
          [77, u, 0.82], [74, u, 0.82], [71, u, 0.82], [76, u * 6, 0.96],
        ],
      },
      {
        role: 'bass',
        weight: 0.62,
        pan: 0.0,
        notes: [
          [48, u * 3, 0.82], [52, u * 2, 0.82],
          [53, u * 3, 0.82], [55, u * 2, 0.82],
          [53, u * 2, 0.82], [52, u * 2, 0.82],
          [50, u * 2, 0.82], [55, u * 2, 0.82],
          [48, u * 3, 0.82], [52, u * 2, 0.82],
          [55, u * 3, 0.82], [48, u * 6, 0.95],
        ],
      },
    ], 0.15);
  }

  // --------------------------------------------------------------------------
  // UI, RACE EVENTS, PIT CREW SUITE & FIA RADIO SYNTHESIS
  // --------------------------------------------------------------------------
  playUIClick(accent = false) {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    // Refined tactile carbon/anodized switch micro-detent (subtle Gran Turismo / F1 MFD feel)
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    this._setVal(osc.frequency, accent ? 960 : 720, now);
    this._expRamp(osc.frequency, accent ? 1340 : 440, now + 0.036);
    const g = this.ctx.createGain();
    this._setVal(g.gain, accent ? 0.095 : 0.075, now);
    this._expRamp(g.gain, 0.0008, now + 0.042);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.onended = () => {
      try { g.disconnect(); } catch (_) {}
    };
    osc.start(now);
    osc.stop(now + 0.046);
  }

  playStartBeep(isGreenGo = false) {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;

    if (this.isRetroMode) {
      // Authentic 1982 Namco Pole Position 4-bit WSG Countdown Beep (440 Hz -> 880 Hz GO!)
      const osc = this.ctx.createOscillator();
      if (this._namcoWsgBrassWave) osc.setPeriodicWave(this._namcoWsgBrassWave);
      else osc.type = 'square';
      const durRetro = isGreenGo ? 0.62 : 0.24;
      this._setVal(osc.frequency, isGreenGo ? 880.0 : 440.0, now);
      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.002, now);
      this._linRamp(g.gain, 0.22, now + 0.005);
      this._expRamp(g.gain, 0.001, now + durRetro);
      osc.connect(g);
      g.connect(this.sfxBus);
      osc.onended = () => { try { g.disconnect(); } catch (_) {} };
      osc.start(now);
      osc.stop(now + durRetro + 0.02);
      return;
    }

    const voices = isGreenGo
      ? [
          { f: 880.0, type: 'triangle', gain: 0.24 },
          { f: 1318.51, type: 'sine', gain: 0.16 },
          { f: 1760.0, type: 'sine', gain: 0.09 },
        ]
      : [
          { f: 440.0, type: 'triangle', gain: 0.24 },
          { f: 880.0, type: 'sine', gain: 0.10 },
        ];
    const dur = isGreenGo ? 0.56 : 0.22;

    voices.forEach((v) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = v.type;
      this._setVal(osc.frequency, v.f, now);
      this._setVal(g.gain, 0.002, now);
      this._linRamp(g.gain, v.gain, now + 0.006);
      this._expRamp(g.gain, 0.001, now + dur);
      osc.connect(g);
      g.connect(this.sfxBus);
      osc.onended = () => {
        try { g.disconnect(); } catch (_) {}
      };
      osc.start(now);
      osc.stop(now + dur + 0.02);
    });
  }

  playBackfirePop() {
    this.playOverrunCrackles(2);
  }

  playHydroplaneSplash() {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseWhiteBuf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.Q.value = 1.4;
    this._setVal(flt.frequency, 2400, now);
    this._expRamp(flt.frequency, 380, now + 0.42);

    const thud = this.ctx.createOscillator();
    thud.type = 'sine';
    this._setVal(thud.frequency, 115, now);
    this._expRamp(thud.frequency, 42, now + 0.18);
    const tg = this.ctx.createGain();
    this._setVal(tg.gain, 0.22, now);
    this._expRamp(tg.gain, 0.001, now + 0.20);

    const g = this.ctx.createGain();
    this._setVal(g.gain, 0.32, now);
    this._expRamp(g.gain, 0.001, now + 0.44);

    src.connect(flt);
    flt.connect(g);
    g.connect(this.sfxBus);
    thud.connect(tg);
    tg.connect(this.sfxBus);

    src.onended = () => {
      try { g.disconnect(); } catch (_) {}
    };
    thud.onended = () => {
      try { tg.disconnect(); } catch (_) {}
    };
    src.start(now);
    thud.start(now);
    src.stop(now + 0.46);
    thud.stop(now + 0.21);
  }

  playWingDamageCrunch() {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;

    // Autoclave 3K carbon-fiber composite crack + chassis thud
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseWhiteBuf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'peaking';
    flt.frequency.value = 1120;
    flt.Q.value = 1.8;
    flt.gain.value = 8.5;

    const impact = this.ctx.createOscillator();
    impact.type = 'triangle';
    this._setVal(impact.frequency, 148, now);
    this._expRamp(impact.frequency, 36, now + 0.16);
    const ig = this.ctx.createGain();
    this._setVal(ig.gain, 0.34, now);
    this._expRamp(ig.gain, 0.001, now + 0.18);

    const g = this.ctx.createGain();
    this._setVal(g.gain, 0.36, now);
    this._expRamp(g.gain, 0.001, now + 0.28);

    src.connect(flt);
    flt.connect(g);
    g.connect(this.sfxBus);
    if (this.reverbSendSfx) g.connect(this.reverbSendSfx);
    impact.connect(ig);
    ig.connect(this.sfxBus);

    src.onended = () => {
      try { g.disconnect(); } catch (_) {}
    };
    impact.onended = () => {
      try { ig.disconnect(); } catch (_) {}
    };
    src.start(now);
    impact.start(now);
    src.stop(now + 0.30);
    impact.stop(now + 0.19);
  }

  play1982ExplosionBoom() {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;

    if (this.isRetroMode && this._noiseLfsrBuf) {
      // Authentic 1982 Namco 54xx 15-bit LFSR stepped-clock explosion + square sub-rumble!
      const lfsrSrc = this.ctx.createBufferSource();
      lfsrSrc.buffer = this._noiseLfsrBuf;
      if (lfsrSrc.playbackRate) {
        this._setVal(lfsrSrc.playbackRate, 1.32, now);
        this._expRamp(lfsrSrc.playbackRate, 0.25, now + 1.32);
      }

      const sqSub = this.ctx.createOscillator();
      sqSub.type = 'square';
      this._setVal(sqSub.frequency, 118, now);
      this._expRamp(sqSub.frequency, 22, now + 1.25);
      const sqGain = this.ctx.createGain();
      sqGain.gain.value = 0.42;

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      this._setVal(lp.frequency, 2600, now);
      this._expRamp(lp.frequency, 210, now + 1.35);

      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.54, now);
      this._expRamp(g.gain, 0.001, now + 1.38);

      lfsrSrc.connect(lp);
      sqSub.connect(sqGain);
      sqGain.connect(lp);
      lp.connect(g);
      g.connect(this.sfxBus);

      lfsrSrc.onended = () => {
        try { g.disconnect(); } catch (_) {}
      };
      lfsrSrc.start(now);
      sqSub.start(now);
      lfsrSrc.stop(now + 1.40);
      sqSub.stop(now + 1.40);
      return;
    }

    // 2026 Heavy Barrier Impact & Composite Crash Detonation
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    this._setVal(osc.frequency, 138, now);
    this._expRamp(osc.frequency, 24, now + 1.15);

    const src = this.ctx.createBufferSource();
    src.buffer = this._noisePinkBuf;
    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    this._setVal(lowpass.frequency, 1350, now);
    this._expRamp(lowpass.frequency, 95, now + 1.25);

    const g = this.ctx.createGain();
    this._setVal(g.gain, 0.54, now);
    this._expRamp(g.gain, 0.001, now + 1.28);

    osc.connect(lowpass);
    src.connect(lowpass);
    lowpass.connect(g);
    g.connect(this.sfxBus);
    if (this.reverbSendSfx) g.connect(this.reverbSendSfx);

    src.onended = () => {
      try { g.disconnect(); } catch (_) {}
    };
    osc.start(now);
    src.start(now);
    osc.stop(now + 1.32);
    src.stop(now + 1.32);
  }

  playWheelGunWhir() {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;

    for (let burst = 0; burst < 3; burst++) {
      const t0 = now + burst * 0.24;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      this._setVal(osc.frequency, 520, t0);
      this._linRamp(osc.frequency, 1480, t0 + 0.11);
      this._expRamp(osc.frequency, 880, t0 + 0.19);

      const rattleLfo = this.ctx.createOscillator();
      rattleLfo.type = 'square';
      rattleLfo.frequency.value = 38;
      const rattleDepth = this.ctx.createGain();
      rattleDepth.gain.value = 180;
      rattleLfo.connect(rattleDepth);
      rattleDepth.connect(osc.frequency);

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1350;
      bp.Q.value = 1.5;

      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.20, t0);
      this._expRamp(g.gain, 0.001, t0 + 0.195);

      const pan = this._createPanner(burst === 0 ? -0.45 : (burst === 1 ? 0.45 : 0.0));

      osc.connect(bp);
      bp.connect(g);
      g.connect(pan);
      pan.connect(this.sfxBus);

      osc.onended = () => {
        try { pan.disconnect(); } catch (_) {}
      };
      rattleLfo.start(t0);
      osc.start(t0);
      rattleLfo.stop(t0 + 0.20);
      osc.stop(t0 + 0.20);
    }
  }

  playPitWheelGunBurst(pan = null) {
    if (!this.initialized || this.muted || !this.ctx) return;
    const nowMs = performance.now();
    if (nowMs - this._lastWheelGunBurstMs < 145) return;
    this._lastWheelGunBurstMs = nowMs;

    this._ensureRunning();
    const now = this.ctx.currentTime;
    const cornerPans = [-0.58, 0.58, -0.38, 0.38];
    const resolvedPan = Number.isFinite(pan)
      ? Math.max(-0.92, Math.min(0.92, pan))
      : cornerPans[this._wheelGunPanIdx++ % cornerPans.length];

    const panner = this._createPanner(resolvedPan);
    panner.connect(this.sfxBus);
    if (this.reverbSendSfx && !this.isRetroMode) panner.connect(this.reverbSendSfx);

    const stages = [
      { tOff: 0.0, dur: 0.135, fStart: 1080, fPeak: 2740, fEnd: 1580, rattleHz: 46, amp: 0.22 },
      { tOff: 0.162, dur: 0.148, fStart: 1260, fPeak: 2960, fEnd: 1420, rattleHz: 52, amp: 0.24 },
    ];

    stages.forEach((st) => {
      const t0 = now + st.tOff;
      const oscMain = this.ctx.createOscillator();
      oscMain.type = 'sawtooth';
      this._setVal(oscMain.frequency, this._clampFreq(st.fStart), t0);
      this._linRamp(oscMain.frequency, this._clampFreq(st.fPeak), t0 + st.dur * 0.52);
      this._expRamp(oscMain.frequency, this._clampFreq(st.fEnd), t0 + st.dur);

      const oscHarm = this.ctx.createOscillator();
      oscHarm.type = 'triangle';
      this._setVal(oscHarm.frequency, this._clampFreq(st.fStart * 1.5), t0);
      this._linRamp(oscHarm.frequency, this._clampFreq(st.fPeak * 1.5), t0 + st.dur * 0.52);
      this._expRamp(oscHarm.frequency, this._clampFreq(st.fEnd * 1.5), t0 + st.dur);
      const harmGain = this.ctx.createGain();
      harmGain.gain.value = 0.42;

      const hammerLfo = this.ctx.createOscillator();
      hammerLfo.type = 'square';
      hammerLfo.frequency.value = st.rattleHz;
      const hammerDepth = this.ctx.createGain();
      hammerDepth.gain.value = 240;
      hammerLfo.connect(hammerDepth);
      hammerDepth.connect(oscMain.frequency);

      const alloyBp = this.ctx.createBiquadFilter();
      alloyBp.type = 'bandpass';
      alloyBp.frequency.value = 2050;
      alloyBp.Q.value = 1.65;

      const shaper = this.ctx.createWaveShaper();
      shaper.curve = this._shaperCurveTransient;

      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.002, t0);
      this._linRamp(g.gain, st.amp, t0 + 0.012);
      this._linRamp(g.gain, st.amp * 0.85, t0 + st.dur * 0.72);
      this._expRamp(g.gain, 0.001, t0 + st.dur);

      oscMain.connect(shaper);
      oscHarm.connect(harmGain);
      harmGain.connect(shaper);
      shaper.connect(alloyBp);
      alloyBp.connect(g);
      g.connect(panner);

      hammerLfo.start(t0);
      oscMain.start(t0);
      oscHarm.start(t0);
      hammerLfo.stop(t0 + st.dur + 0.015);
      oscMain.stop(t0 + st.dur + 0.015);
      oscHarm.stop(t0 + st.dur + 0.015);
    });

    const airSrc = this.ctx.createBufferSource();
    airSrc.buffer = this._noiseWhiteBuf;
    const airBp = this.ctx.createBiquadFilter();
    airBp.type = 'bandpass';
    airBp.Q.value = 1.4;
    this._setVal(airBp.frequency, 3800, now);
    this._expRamp(airBp.frequency, 1450, now + 0.34);

    const airGain = this.ctx.createGain();
    this._setVal(airGain.gain, 0.002, now);
    this._linRamp(airGain.gain, 0.085, now + 0.015);
    this._linRamp(airGain.gain, 0.045, now + 0.16);
    this._linRamp(airGain.gain, 0.105, now + 0.29);
    this._expRamp(airGain.gain, 0.0008, now + 0.36);

    airSrc.connect(airBp);
    airBp.connect(airGain);
    airGain.connect(panner);
    airSrc.onended = () => {
      try { panner.disconnect(); } catch (_) {}
    };
    airSrc.start(now);
    airSrc.stop(now + 0.37);
  }

  playPitJackDrop() {
    if (!this.initialized || this.muted || !this.ctx) return;
    const nowMs = performance.now();
    if (nowMs - this._lastJackDropMs < 240) return;
    this._lastJackDropMs = nowMs;

    this._ensureRunning();
    const now = this.ctx.currentTime;

    const latchOsc = this.ctx.createOscillator();
    latchOsc.type = 'triangle';
    this._setVal(latchOsc.frequency, 1520, now);
    this._expRamp(latchOsc.frequency, 460, now + 0.036);
    const latchGain = this.ctx.createGain();
    this._setVal(latchGain.gain, 0.20, now);
    this._expRamp(latchGain.gain, 0.001, now + 0.040);
    latchOsc.connect(latchGain);
    latchGain.connect(this.sfxBus);
    latchOsc.onended = () => {
      try { latchGain.disconnect(); } catch (_) {}
    };
    latchOsc.start(now);
    latchOsc.stop(now + 0.045);

    const hissSrc = this.ctx.createBufferSource();
    hissSrc.buffer = this._noiseWhiteBuf;
    const hissBp = this.ctx.createBiquadFilter();
    hissBp.type = 'bandpass';
    hissBp.Q.value = 1.5;
    this._setVal(hissBp.frequency, 2850, now + 0.01);
    this._expRamp(hissBp.frequency, 520, now + 0.23);
    const hissGain = this.ctx.createGain();
    this._setVal(hissGain.gain, 0.002, now);
    this._linRamp(hissGain.gain, 0.14, now + 0.022);
    this._expRamp(hissGain.gain, 0.0008, now + 0.24);
    hissSrc.connect(hissBp);
    hissBp.connect(hissGain);
    hissGain.connect(this.sfxBus);
    hissSrc.onended = () => {
      try { hissGain.disconnect(); } catch (_) {}
    };
    hissSrc.start(now);
    hissSrc.stop(now + 0.25);

    const tDrop = now + 0.048;
    const thudOsc = this.ctx.createOscillator();
    thudOsc.type = 'sine';
    this._setVal(thudOsc.frequency, 126, tDrop);
    this._expRamp(thudOsc.frequency, 33, tDrop + 0.21);

    const clunkOsc = this.ctx.createOscillator();
    clunkOsc.type = 'triangle';
    this._setVal(clunkOsc.frequency, 275, tDrop);
    this._expRamp(clunkOsc.frequency, 84, tDrop + 0.11);
    const clunkGain = this.ctx.createGain();
    this._setVal(clunkGain.gain, 0.18, tDrop);
    this._expRamp(clunkGain.gain, 0.001, tDrop + 0.12);

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._shaperCurveTransient;

    const thudGain = this.ctx.createGain();
    this._setVal(thudGain.gain, 0.002, tDrop);
    this._linRamp(thudGain.gain, 0.35, tDrop + 0.008);
    this._expRamp(thudGain.gain, 0.001, tDrop + 0.23);

    thudOsc.connect(shaper);
    clunkOsc.connect(clunkGain);
    clunkGain.connect(shaper);
    shaper.connect(thudGain);
    thudGain.connect(this.sfxBus);

    thudOsc.onended = () => {
      try { thudGain.disconnect(); } catch (_) {}
    };
    thudOsc.start(tDrop);
    clunkOsc.start(tDrop);
    thudOsc.stop(tDrop + 0.24);
    clunkOsc.stop(tDrop + 0.13);
  }

  playYellowFlagChime() {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    [659.25, 523.25].forEach((freq, i) => {
      const t0 = now + i * 0.145;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      this._setVal(osc.frequency, freq, t0);
      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.002, t0);
      this._linRamp(g.gain, 0.22, t0 + 0.008);
      this._expRamp(g.gain, 0.001, t0 + 0.23);
      osc.connect(g);
      g.connect(this.sfxBus);
      osc.onended = () => {
        try { g.disconnect(); } catch (_) {}
      };
      osc.start(t0);
      osc.stop(t0 + 0.25);
    });
  }

  playThunderRumble() {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this._noisePinkBuf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    this._setVal(flt.frequency, 280, now);
    this._expRamp(flt.frequency, 110, now + 1.80);

    const g = this.ctx.createGain();
    this._setVal(g.gain, 0.02, now);
    this._linRamp(g.gain, 0.44, now + 0.08);
    this._linRamp(g.gain, 0.28, now + 0.45);
    this._linRamp(g.gain, 0.36, now + 0.72);
    this._expRamp(g.gain, 0.001, now + 1.85);

    src.connect(flt);
    flt.connect(g);
    g.connect(this.sfxBus);
    if (this.reverbSendSfx) g.connect(this.reverbSendSfx);
    src.onended = () => {
      try { g.disconnect(); } catch (_) {}
    };
    src.start(now);
    src.stop(now + 1.90);
  }

  speakAnnouncement(text, isRadio = false, force = false) {
    if (this.muted || !text || this.mixerLevels.voice <= 0.01) return;
    const nowMs = performance.now();
    if (!force && nowMs - this.lastSpeechTime < 3200) return;
    this.lastSpeechTime = nowMs;

    // Authentic FIA pit-wall PTT digital squelch tone + VHF carrier click -> voiceBus
    if (isRadio && this.initialized && this.ctx) {
      this._ensureRunning();
      const t = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      this._setVal(osc.frequency, 1520, t);
      this._setVal(osc.frequency, 2040, t + 0.052);
      this._setVal(g.gain, 0.11, t);
      this._expRamp(g.gain, 0.001, t + 0.115);
      osc.connect(g);
      g.connect(this.voiceBus);
      osc.onended = () => {
        try { g.disconnect(); } catch (_) {}
      };
      osc.start(t);
      osc.stop(t + 0.125);

      const staticSrc = this.ctx.createBufferSource();
      staticSrc.buffer = this._noiseWhiteBuf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1850;
      bp.Q.value = 2.2;
      const sg = this.ctx.createGain();
      this._setVal(sg.gain, 0.055, t);
      this._expRamp(sg.gain, 0.001, t + 0.035);
      staticSrc.connect(bp);
      bp.connect(sg);
      sg.connect(this.voiceBus);
      staticSrc.onended = () => {
        try { sg.disconnect(); } catch (_) {}
      };
      staticSrc.start(t);
      staticSrc.stop(t + 0.04);
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (force) window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(String(text));
        utter.rate = isRadio ? 1.08 : 0.96;
        utter.pitch = isRadio ? 0.95 : 1.04;
        utter.volume = Math.max(0, Math.min(1, 0.95 * this.mixerLevels.voice));
        window.speechSynthesis.speak(utter);
      } catch (_) {}
    }
  }
}
