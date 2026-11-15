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
    this._lastWheelRubMs = 0;
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
    param._lastTarget = v;
    try {
      if (this.ctx.state !== 'running' || this.ctx.currentTime === 0) {
        param.value = v;
      }
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
      const targetMaster = this.muted ? 0.0 : 0.52 * this.mixerLevels.master;
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

    // Master Broadcast Bus: Subsonic Highpass -> Low-Mid Warmth -> Smooth High Roll-Off -> Soft Limiter
    const masterHP = this.ctx.createBiquadFilter();
    masterHP.type = 'highpass';
    masterHP.frequency.value = 30;
    masterHP.Q.value = 0.707;

    const masterWarmth = this.ctx.createBiquadFilter();
    masterWarmth.type = 'peaking';
    masterWarmth.frequency.value = 145;
    masterWarmth.Q.value = 0.75;
    masterWarmth.gain.value = 1.8;

    const masterPresence = this.ctx.createBiquadFilter();
    masterPresence.type = 'highshelf';
    masterPresence.frequency.value = 1850;
    masterPresence.gain.value = -3.5;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -12.0;
    this.compressor.knee.value = 14;
    this.compressor.ratio.value = 3.5;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.16;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0.0 : 0.52 * this.mixerLevels.master;

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

    // Precompute buffers & warm low-order harmonic PeriodicWaves
    this._noisePinkBuf = this._createNoiseBuffer(2.6, true);
    this._noiseWhiteBuf = this._createNoiseBuffer(1.4, false);
    this._noiseLfsrBuf = this._createNamcoLfsrBuffer(1.6);
    this._createPhysicalAndNamcoWaves();
    this._shaperCurveEngine = this._makeSaturationCurve(1.22, 0.02);
    this._shaperCurveTransient = this._makeSaturationCurve(1.18, 0.01);

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
      const target = this.muted ? 0.0 : 0.52 * this.mixerLevels.master;
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
    // Bypassed by design: pure, warm, phase-coherent WebAudio multi-harmonic synthesis
    // avoids looped .wav pitch-shift droning and metallic ConvolverNode comb-filtering.
    this.samplesLoaded = false;
    this._sampleLoadPromise = Promise.resolve(false);
    return this._sampleLoadPromise;
  }

  _bindImpulseResponsesIfReady() {
    // Bypassed: metallic ConvolverNode IRs disabled for warm, comb-filter-free audio.
  }

  _wireDecodedSampleLoops() {
    // Bypassed: looped .wav buffers disabled in favor of warm multi-harmonic synth.
  }

  // --------------------------------------------------------------------------
  // WARM LOW-ORDER HARMONIC & 1982 NAMCO WSG WAVETABLE BUILDERS
  // --------------------------------------------------------------------------
  _makeSaturationCurve(drive = 1.22, asym = 0.02) {
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
        data[i] = out * 0.10;
      } else {
        data[i] = white * 0.45;
      }
    }
    return buf;
  }

  _createNamcoLfsrBuffer(seconds = 1.6) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    const holdSamples = Math.max(2, Math.round(sr / 4200));
    let lfsr = 0x7fff;
    let currentOut = 0.45;
    for (let i = 0; i < len; i++) {
      if (i % holdSamples === 0) {
        const bit = ((lfsr >> 0) ^ (lfsr >> 1)) & 1;
        lfsr = ((lfsr >> 1) | (bit << 14)) & 0x7fff;
        const step4Bit = ((lfsr & 0x0f) / 7.5) - 1.0;
        currentOut = step4Bit * 0.52;
      }
      data[i] = currentOut;
    }
    return buf;
  }

  _waveFromDiscreteTable(samples, nHarmonics = 8) {
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
      // 1. Warm, smooth 6-harmonic engine purr/roar wave (steep 1/k^1.85 roll-off, zero high buzz)
      const warmReal = new Float32Array([0, 0.0, 0.12, 0.04, 0.02, 0.0, 0.0]);
      const warmImag = new Float32Array([0, 1.0, 0.44, 0.22, 0.09, 0.04, 0.015]);
      this._ottoPulseWave = this.ctx.createPeriodicWave(warmReal, warmImag);

      const warmFifthReal = new Float32Array([0, 0.0, 0.08, 0.03, 0.0, 0.0]);
      const warmFifthImag = new Float32Array([0, 1.0, 0.35, 0.14, 0.05, 0.015]);
      this._ottoV10Wave = this.ctx.createPeriodicWave(warmFifthReal, warmFifthImag);

      // 2. Smooth 8-harmonic 1982 Namco WSG waves (warm arcade tone without piercing alias buzz)
      const promEngineA4Bit = [
        15, 15, 14, 12, 9, 6, 3, 1,
        0, 0, 2, 5, 8, 6, 3, 1,
        13, 15, 13, 10, 7, 4, 2, 0,
        1, 3, 6, 9, 11, 8, 4, 1,
      ].map((v) => (v / 7.5) - 1.0);
      this._namcoWsgEngineWaveA = this._waveFromDiscreteTable(promEngineA4Bit, 6);

      const promEngineB4Bit = [
        14, 15, 15, 13, 8, 3, 1, 0,
        2, 7, 11, 12, 9, 5, 2, 0,
        0, 2, 6, 10, 13, 11, 7, 3,
        1, 0, 2, 5, 8, 10, 9, 6,
      ].map((v) => (v / 7.5) - 1.0);
      this._namcoWsgEngineWaveB = this._waveFromDiscreteTable(promEngineB4Bit, 6);

      const promBrass4Bit = [
        8, 12, 15, 15, 13, 10, 11, 14,
        15, 12, 7, 3, 1, 0, 2, 6,
        9, 11, 10, 7, 4, 2, 1, 0,
        1, 3, 5, 7, 8, 7, 6, 7,
      ].map((v) => (v / 7.5) - 1.0);
      this._namcoWsgBrassWave = this._waveFromDiscreteTable(promBrass4Bit, 6);

      const nHarm = 7;
      const pReal = new Float32Array(nHarm);
      const pImag = new Float32Array(nHarm);
      const duty = 0.35;
      for (let k = 1; k < nHarm; k++) {
        pReal[k] = (2 / (k * Math.PI)) * Math.sin(TWO_PI * k * duty) / Math.pow(k, 0.55);
        pImag[k] = (2 / (k * Math.PI)) * (1 - Math.cos(TWO_PI * k * duty)) / Math.pow(k, 0.55);
      }
      this._namcoPulse25Wave = this.ctx.createPeriodicWave(pReal, pImag);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // CONVOLUTION REVERB BUS (BYPASSED / SILENCED TO PREVENT METALLIC COMBING)
  // --------------------------------------------------------------------------
  _setupConvolutionReverbBus() {
    this.reverbSendEngine = this.ctx.createGain();
    this.reverbSendEngine.gain.value = 0.0;

    this.reverbSendSfx = this.ctx.createGain();
    this.reverbSendSfx.gain.value = 0.0;

    this.cockpitConvolver = this.ctx.createConvolver();
    this.cockpitWetGain = this.ctx.createGain();
    this.cockpitWetGain.gain.value = 0.0;

    this.valleyConvolver = this.ctx.createConvolver();
    this.valleyWetGain = this.ctx.createGain();
    this.valleyWetGain.gain.value = 0.0;
  }

  // --------------------------------------------------------------------------
  // WARM, CLEAN, PUNCHY MULTI-HARMONIC ENGINE SYNTHESIZER (65 Hz - 420 Hz BODY)
  // --------------------------------------------------------------------------
  _setupF1PowerUnit() {
    this.engineSampleBus = this.ctx.createGain();
    this.engineSampleBus.gain.value = 0.0;

    // 1. Sub-Bass Foundation (0.5x fundamental: 32.5 Hz - 210 Hz pure sine chest warmth)
    this.oscSub = this.ctx.createOscillator();
    this.oscSub.type = 'sine';
    this.oscSub.frequency.value = 34;

    // 2. Warm Fundamental Body (1.0x fundamental: 65 Hz - 420 Hz smooth 6-harmonic wave)
    this.oscFund = this.ctx.createOscillator();
    if (this._ottoPulseWave) this.oscFund.setPeriodicWave(this._ottoPulseWave);
    else this.oscFund.type = 'triangle';
    this.oscFund.frequency.value = 68;

    // 3. Smooth 2nd-Harmonic Octave (2.0x fundamental: triangle wave for warm purr)
    this.oscOct = this.ctx.createOscillator();
    this.oscOct.type = 'triangle';
    this.oscOct.detune.value = 2.5;
    this.oscOct.frequency.value = 136;

    // 4. Warm Musical 5th Growl (1.5x fundamental: pure sine/triangle power-chord warmth)
    this.oscFifth = this.ctx.createOscillator();
    this.oscFifth.type = 'sine';
    this.oscFifth.detune.value = -2.0;
    this.oscFifth.frequency.value = 102;

    // 5. High-frequency rasp permanently muted (zero buzz)
    this.oscRasp = this.ctx.createOscillator();
    this.oscRasp.type = 'sine';
    this.oscRasp.frequency.value = 204;

    // Subtle organic pitch warmth (0.7 cents max)
    this.vibratoOsc = this.ctx.createOscillator();
    this.vibratoOsc.type = 'sine';
    this.vibratoOsc.frequency.value = 18.0;
    this.vibratoDepth = this.ctx.createGain();
    this.vibratoDepth.gain.value = 0.7;
    this.vibratoOsc.connect(this.vibratoDepth);
    this.vibratoDepth.connect(this.oscFund.detune);
    this.vibratoDepth.connect(this.oscOct.detune);

    this.subGain = this.ctx.createGain();
    this.subGain.gain.value = 0.48;
    this.fundGain = this.ctx.createGain();
    this.fundGain.gain.value = 0.44;
    this.octGain = this.ctx.createGain();
    this.octGain.gain.value = 0.18;
    this.fifthGain = this.ctx.createGain();
    this.fifthGain.gain.value = 0.08;
    this.raspGain = this.ctx.createGain();
    this.raspGain.gain.value = 0.0;

    this.engineSynthMixGain = this.ctx.createGain();
    this.engineSynthMixGain.gain.value = 1.0;

    // Airbox noise permanently muted (zero background white/pink noise hiss)
    this.airboxFilter = this.ctx.createBiquadFilter();
    this.airboxFilter.type = 'lowpass';
    this.airboxFilter.frequency.value = 400;
    this.airboxGain = this.ctx.createGain();
    this.airboxGain.gain.value = 0.0;

    // Warm Low-Mid Exhaust Body EQ (no harsh peaking resonance)
    this.exhaustFormant = this.ctx.createBiquadFilter();
    this.exhaustFormant.type = 'lowshelf';
    this.exhaustFormant.frequency.value = 210;
    this.exhaustFormant.gain.value = 2.2;

    this.intakeFormant = this.ctx.createBiquadFilter();
    this.intakeFormant.type = 'peaking';
    this.intakeFormant.frequency.value = 420;
    this.intakeFormant.Q.value = 0.7;
    this.intakeFormant.gain.value = 0.0;
    this.formantFilter = this.intakeFormant;

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._shaperCurveEngine;
    shaper.oversample = '2x';

    const dcBlock = this.ctx.createBiquadFilter();
    dcBlock.type = 'highpass';
    dcBlock.frequency.value = 30;
    dcBlock.Q.value = 0.707;

    // Smooth 12 dB/oct Butterworth Low-Pass Tracking Filter (tracks 3.2x fundamental)
    this.lowpassFilter = this.ctx.createBiquadFilter();
    this.lowpassFilter.type = 'lowpass';
    this.lowpassFilter.frequency.value = 320;
    this.lowpassFilter.Q.value = 0.65;

    // Secondary Warm Roll-Off Filter (eliminates any frequency > 1,350 Hz)
    const antiHarshLp = this.ctx.createBiquadFilter();
    antiHarshLp.type = 'lowpass';
    antiHarshLp.frequency.value = 1350;
    antiHarshLp.Q.value = 0.55;

    this.shiftCutGain = this.ctx.createGain();
    this.shiftCutGain.gain.value = 1.0;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

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

    this.exhaustFormant.connect(this.intakeFormant);
    this.intakeFormant.connect(shaper);
    shaper.connect(dcBlock);
    dcBlock.connect(this.lowpassFilter);
    this.lowpassFilter.connect(antiHarshLp);
    antiHarshLp.connect(this.shiftCutGain);
    this.shiftCutGain.connect(this.engineGain);

    // Direct phase-coherent connection to engineBus (zero Haas delay comb-filtering!)
    this.engineGain.connect(this.engineBus);

    // Silent nodes retained solely for property compatibility (zero mosquito whine)
    this.oscTurbo = this.ctx.createOscillator();
    this.oscTurbo.type = 'sine';
    this.oscTurbo.frequency.value = 400;
    this.turboGain = this.ctx.createGain();
    this.turboGain.gain.value = 0.0;

    this.oscMgukInverter = this.ctx.createOscillator();
    this.oscMgukInverter.type = 'sine';
    this.oscMgukInverter.frequency.value = 400;
    this.mgukFilter = this.ctx.createBiquadFilter();
    this.mgukFilter.type = 'lowpass';
    this.mgukFilter.frequency.value = 400;
    this.mgukGain = this.ctx.createGain();
    this.mgukGain.gain.value = 0.0;

    this.oscGearbox = this.ctx.createOscillator();
    this.oscGearbox.type = 'sine';
    this.oscGearbox.frequency.value = 300;
    this.oscGearboxHarm = this.ctx.createOscillator();
    this.oscGearboxHarm.type = 'sine';
    this.oscGearboxHarm.frequency.value = 600;
    this.gbBand = this.ctx.createBiquadFilter();
    this.gbBand.type = 'lowpass';
    this.gbBand.frequency.value = 500;
    this.gearboxSynthGain = this.ctx.createGain();
    this.gearboxSynthGain.gain.value = 0.0;
    this.gearboxGain = this.ctx.createGain();
    this.gearboxGain.gain.value = 0.0;

    this.oscSub.start();
    this.oscFund.start();
    this.oscOct.start();
    this.oscFifth.start();
    this.oscRasp.start();
    this.vibratoOsc.start();
  }

  // --------------------------------------------------------------------------
  // WARM 1982 NAMCO ARCADE ENGINE (SMOOTH LOW-PASSED RETRO TONE)
  // --------------------------------------------------------------------------
  _setupNamco1982Engine() {
    this.psgOscA = this.ctx.createOscillator();
    if (this._namcoWsgEngineWaveA) this.psgOscA.setPeriodicWave(this._namcoWsgEngineWaveA);
    else this.psgOscA.type = 'triangle';
    this.psgOscA.frequency.value = 54;

    this.psgOscB = this.ctx.createOscillator();
    this.psgOscB.type = 'triangle';
    this.psgOscB.frequency.value = 81;
    this.psgOscB.detune.value = 3;

    this.psgSubOsc = this.ctx.createOscillator();
    this.psgSubOsc.type = 'sine';
    this.psgSubOsc.frequency.value = 27;

    const gainA = this.ctx.createGain();
    gainA.gain.value = 0.42;
    const gainB = this.ctx.createGain();
    gainB.gain.value = 0.22;
    const gainSub = this.ctx.createGain();
    gainSub.gain.value = 0.36;

    this.psgFilter = this.ctx.createBiquadFilter();
    this.psgFilter.type = 'lowpass';
    this.psgFilter.frequency.value = 820;
    this.psgFilter.Q.value = 0.65;

    this.psgEngineGain = this.ctx.createGain();
    this.psgEngineGain.gain.value = 0.0;

    this.psgOscA.connect(gainA);
    this.psgOscB.connect(gainB);
    this.psgSubOsc.connect(gainSub);
    gainA.connect(this.psgFilter);
    gainB.connect(this.psgFilter);
    gainSub.connect(this.psgFilter);
    this.psgFilter.connect(this.psgEngineGain);
    this.psgEngineGain.connect(this.engineBus);

    this.retroSkidOsc = this.ctx.createOscillator();
    this.retroSkidOsc.type = 'triangle';
    this.retroSkidOsc.frequency.value = 420;
    this.retroSkidLfo = this.ctx.createOscillator();
    this.retroSkidLfo.type = 'sine';
    this.retroSkidLfo.frequency.value = 14.0;
    const retroSkidLp = this.ctx.createBiquadFilter();
    retroSkidLp.type = 'lowpass';
    retroSkidLp.frequency.value = 580;
    retroSkidLp.Q.value = 0.7;

    this.retroSkidGain = this.ctx.createGain();
    this.retroSkidGain.gain.value = 0.0;

    this.retroSkidOsc.connect(retroSkidLp);
    retroSkidLp.connect(this.retroSkidGain);
    this.retroSkidGain.connect(this.sfxBus);

    this.psgOscA.start();
    this.psgOscB.start();
    this.psgSubOsc.start();
    this.retroSkidOsc.start();
    this.retroSkidLfo.start();
  }

  _setupSurfaceAndAeroLoops() {
    // 1. Aero Wind (kept at 0.0 during continuous driving so there is zero constant wind hiss)
    this.aeroFilter = this.ctx.createBiquadFilter();
    this.aeroFilter.type = 'lowpass';
    this.aeroFilter.frequency.value = 340;
    this.aeroSynthGain = this.ctx.createGain();
    this.aeroSynthGain.gain.value = 0.0;
    this.aeroGain = this.ctx.createGain();
    this.aeroGain.gain.value = 0.0;

    // 2. Subtle, Soft, Low-Passed Tire Scrub (active ONLY on heavy skids: skidIntensity > 0.65)
    const skidSrc = this.ctx.createBufferSource();
    skidSrc.buffer = this._noisePinkBuf;
    skidSrc.loop = true;

    this.skidFilter = this.ctx.createBiquadFilter();
    this.skidFilter.type = 'lowpass';
    this.skidFilter.frequency.value = 520;
    this.skidFilter.Q.value = 0.707;

    this.skidHarmFilter = this.ctx.createBiquadFilter();
    this.skidHarmFilter.type = 'lowpass';
    this.skidHarmFilter.frequency.value = 480;
    this.skidHarmFilter.Q.value = 0.707;
    this.skidHarmGain = this.ctx.createGain();
    this.skidHarmGain.gain.value = 0.0;

    this.skidGain = this.ctx.createGain();
    this.skidGain.gain.value = 0.0;
    skidSrc.connect(this.skidFilter);
    this.skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.sfxBus);
    skidSrc.start();

    // 3. Warm, Soft Low-Frequency Kerb Bass Thrum (65-120 Hz triangle/sine, low-passed at 210 Hz)
    this.curbOsc = this.ctx.createOscillator();
    this.curbOsc.type = 'triangle';
    this.curbOsc.frequency.value = 85;
    this.curbSubOsc = this.ctx.createOscillator();
    this.curbSubOsc.type = 'sine';
    this.curbSubOsc.frequency.value = 42.5;
    const curbSubGain = this.ctx.createGain();
    curbSubGain.gain.value = 0.65;

    this.curbFilter = this.ctx.createBiquadFilter();
    this.curbFilter.type = 'lowpass';
    this.curbFilter.frequency.value = 210;
    this.curbFilter.Q.value = 0.707;
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
    this.curbOsc.start();
    this.curbSubOsc.start();

    // 4. Rain, Brake & Continuous Crowd Loops Kept Silent (0.0) to Eliminate Background Noise/Hiss
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0.0;

    this.brakeSynthFilter = this.ctx.createBiquadFilter();
    this.brakeSynthFilter.type = 'lowpass';
    this.brakeSynthFilter.frequency.value = 400;
    this.brakeSynthGain = this.ctx.createGain();
    this.brakeSynthGain.gain.value = 0.0;

    this.crowdBedFilterL = this.ctx.createBiquadFilter();
    this.crowdBedFilterR = this.ctx.createBiquadFilter();
    this.crowdBedShimmer = this.ctx.createBiquadFilter();
    this.crowdBedPanner = this._createPanner(0.0);
    this.crowdSynthGain = this.ctx.createGain();
    this.crowdSynthGain.gain.value = 0.0;
    this.crowdBedGain = this.ctx.createGain();
    this.crowdBedGain.gain.value = 0.0;
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
  // CONTINUOUS REAL-TIME WARM MULTI-HARMONIC ENGINE & CLEAN SURFACE UPDATE
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

    // Crossfade Showroom Paddock Pad vs Live Race Audio
    if (this.menuPadGain) {
      this._setTarget(this.menuPadGain.gain, inShowroomMenu ? 0.055 : 0.0, now, 0.28);
    }

    // Keep all background noise & convolver sends permanently 0.0 (zero drone/hiss)
    if (this.cockpitWetGain) this._setTarget(this.cockpitWetGain.gain, 0.0, now, 0.05);
    if (this.valleyWetGain) this._setTarget(this.valleyWetGain.gain, 0.0, now, 0.05);
    if (this.turboGain) this._setTarget(this.turboGain.gain, 0.0, now, 0.04);
    if (this.mgukGain) this._setTarget(this.mgukGain.gain, 0.0, now, 0.04);
    if (this.gearboxGain) this._setTarget(this.gearboxGain.gain, 0.0, now, 0.04);
    if (this.aeroGain) this._setTarget(this.aeroGain.gain, 0.0, now, 0.04);
    if (this.rainGain) this._setTarget(this.rainGain.gain, 0.0, now, 0.04);
    if (this.brakeSynthGain) this._setTarget(this.brakeSynthGain.gain, 0.0, now, 0.04);
    if (this.crowdBedGain) this._setTarget(this.crowdBedGain.gain, 0.0, now, 0.06);

    if (!isRacingOrQuali || !playerCar || playerCar.exploded) {
      this._setTarget(this.engineGain.gain, 0.0, now, 0.045);
      this._setTarget(this.psgEngineGain.gain, 0.0, now, 0.045);
      this._setTarget(this.skidGain.gain, 0.0, now, 0.04);
      if (this.retroSkidGain) this._setTarget(this.retroSkidGain.gain, 0.0, now, 0.035);
      this._setTarget(this.curbGain.gain, 0.0, now, 0.025);
      this._turboSpool = 0;
      return;
    }

    const rpm = Math.max(3200, Math.min(14200, this._num(playerCar.rpm, 3800)));
    const rpmNorm = Math.max(0, Math.min(1.0, (rpm - 3200) / (13500 - 3200)));
    const throttle = Math.max(0, Math.min(1, this._num(playerCar.throttleInput, 0)));
    const speedKmh = Math.max(0, this._num(playerCar.speedKmh, 0));
    const speedNorm = Math.min(1, speedKmh / 320);
    const overRev = this._num(playerCar.overRevTimer, 0) > 0;

    // Smooth intake manifold load envelope
    const loadAlpha = throttle > this._manifoldLoad ? Math.min(1, dtSec * 14.0) : Math.min(1, dtSec * 8.5);
    this._manifoldLoad += (throttle - this._manifoldLoad) * loadAlpha;
    this._prevThrottle = throttle;

    const slipBoost = playerCar.inSlipstream ? 1.015 : 1.0;
    const load = 0.35 + this._manifoldLoad * 0.65;

    // ------------------------------------------------------------------------
    // 1A. WARM 1982 NAMCO ARCADE ENGINE (`isRetroMode`)
    // ------------------------------------------------------------------------
    if (isRetro) {
      const psgBase = (52 + rpmNorm * 168) * slipBoost;
      this._setTarget(this.psgOscA.frequency, this._clampFreq(psgBase), now, 0.018);
      this._setTarget(this.psgOscB.frequency, this._clampFreq(psgBase * 1.5), now, 0.018);
      this._setTarget(this.psgSubOsc.frequency, this._clampFreq(psgBase * 0.5), now, 0.018);
      this._setTarget(
        this.psgFilter.frequency,
        this._clampFreq(psgBase * 3.2 * (0.75 + 0.25 * load)),
        now,
        0.024
      );
      this._setTarget(this.psgEngineGain.gain, 0.14 + load * 0.09, now, 0.025);
      this._setTarget(this.engineGain.gain, 0.0, now, 0.03);
    } else {
      // ----------------------------------------------------------------------
      // 1B. WARM LOW-PASS FILTERED SUB-BASS + SMOOTH HARMONIC ENGINE PURR/ROAR
      //     (65 Hz - 420 Hz Fundamental Body + 12 dB/oct Filter at 3.2x f0)
      // ----------------------------------------------------------------------
      this._setTarget(this.psgEngineGain.gain, 0.0, now, 0.03);

      // Warm fundamental frequency spans 65 Hz (idle) -> 420 Hz (13,500 RPM redline)
      const f0 = (65 + Math.pow(rpmNorm, 0.96) * 355) * slipBoost;
      this._setTarget(this.oscSub.frequency, this._clampFreq(f0 * 0.5), now, 0.020);
      this._setTarget(this.oscFund.frequency, this._clampFreq(f0), now, 0.020);
      this._setTarget(this.oscOct.frequency, this._clampFreq(f0 * 2.0), now, 0.020);
      this._setTarget(this.oscFifth.frequency, this._clampFreq(f0 * 1.5), now, 0.020);
      this._setTarget(this.oscRasp.frequency, this._clampFreq(f0 * 2.0), now, 0.020);

      // Deep sub-bass purr at low/mid RPM, smooth harmonic roar under throttle load
      this._setTarget(
        this.subGain.gain,
        0.48 * (1.0 - rpmNorm * 0.18),
        now,
        0.028
      );
      this._setTarget(
        this.fundGain.gain,
        0.42 + this._manifoldLoad * 0.08,
        now,
        0.025
      );
      this._setTarget(
        this.octGain.gain,
        0.15 + this._manifoldLoad * 0.09,
        now,
        0.025
      );
      this._setTarget(
        this.fifthGain.gain,
        0.06 + this._manifoldLoad * 0.08,
        now,
        0.025
      );
      this._setTarget(this.raspGain.gain, 0.0, now, 0.025);
      this._setTarget(this.airboxGain.gain, 0.0, now, 0.025);
      this._setTarget(this.vibratoDepth.gain, overRev ? 1.8 : 0.7, now, 0.03);

      // Warm low-shelf body EQ (180-240 Hz warmth, zero nasal mid-high peaking)
      this._setTarget(this.exhaustFormant.frequency, 210, now, 0.03);
      this._setTarget(this.exhaustFormant.gain, 2.2, now, 0.03);
      this._setTarget(this.intakeFormant.gain, 0.0, now, 0.03);

      // Smooth 12 dB/oct low-pass tracking filter at 3.2x fundamental (208 Hz -> 1,344 Hz max)
      const trackCutoff = f0 * 3.2 * (0.78 + 0.22 * this._manifoldLoad) * (cockpitMode ? 0.92 : 1.0);
      this._setTarget(
        this.lowpassFilter.frequency,
        this._clampFreq(Math.min(1344, Math.max(195, trackCutoff))),
        now,
        0.025
      );

      // Gentle pit-lane limiter modulation when in pit lane
      const pitLimiterActive =
        playerCar.inPitLane &&
        playerCar.pitPhase !== 'STOPPED' &&
        speedKmh >= 76.5 &&
        throttle > 0.2;
      const pitMod = pitLimiterActive ? (Math.sin(now * 52.0) > 0 ? 1.02 : 0.72) : 1.0;

      // Balanced, pleasant engine gain suitable for hours of comfortable listening
      const baseEngGain = 0.15 + load * 0.125;
      this._setTarget(
        this.engineGain.gain,
        baseEngGain * pitMod * (cockpitMode ? 0.95 : 1.0),
        now,
        0.025
      );
    }

    // ------------------------------------------------------------------------
    // 2. SUBTLE, SOFT, LOW-PASSED TIRE SCRUB ONLY ON HEAVY SKIDS (> 0.65)
    // ------------------------------------------------------------------------
    const skidRaw = Math.max(0, this._num(playerCar.skidIntensity, 0));
    const heavySkid = speedKmh > 28 && skidRaw > 0.65
      ? this._smooth01((skidRaw - 0.65) / 0.35)
      : 0.0;

    if (isRetro) {
      this._setTarget(this.skidGain.gain, 0.0, now, 0.03);
      this._setTarget(
        this.retroSkidOsc.frequency,
        this._clampFreq(380 + speedNorm * 140),
        now,
        0.025
      );
      this._setTarget(this.retroSkidGain.gain, heavySkid * 0.038, now, 0.028);
    } else {
      if (this.retroSkidGain) this._setTarget(this.retroSkidGain.gain, 0.0, now, 0.025);
      if (playerCar.onGrass && speedKmh > 25) {
        const grassVol = Math.min(0.055, (speedKmh / 240) * 0.05);
        this._setTarget(this.skidFilter.frequency, 320, now, 0.03);
        this._setTarget(this.skidFilter.Q, 0.707, now, 0.03);
        this._setTarget(this.skidGain.gain, grassVol, now, 0.035);
      } else if (heavySkid > 0.001) {
        this._setTarget(this.skidFilter.frequency, this._clampFreq(440 + heavySkid * 140), now, 0.03);
        this._setTarget(this.skidFilter.Q, 0.75, now, 0.03);
        this._setTarget(this.skidGain.gain, heavySkid * 0.048, now, 0.03);
      } else {
        this._setTarget(this.skidGain.gain, 0.0, now, 0.03);
      }
    }

    // ------------------------------------------------------------------------
    // 3. WARM, SOFT LOW-FREQUENCY KERB BASS THRUM (ONLY WHEN RIDING CURBS)
    // ------------------------------------------------------------------------
    const onCurb = !!playerCar.onCurb && speedKmh > 20;
    const curbSpeedNorm = Math.min(1, speedKmh / 310);
    const curbFreq = 72 + curbSpeedNorm * 52;
    this._setTarget(this.curbOsc.frequency, this._clampFreq(curbFreq), now, 0.016);
    this._setTarget(this.curbSubOsc.frequency, this._clampFreq(curbFreq * 0.5), now, 0.016);
    this._setTarget(this.curbFilter.frequency, this._clampFreq(165 + curbSpeedNorm * 55), now, 0.02);
    this._setTarget(
      this.curbGain.gain,
      onCurb ? Math.min(0.065, 0.032 + curbSpeedNorm * 0.033) : 0.0,
      now,
      0.018
    );
  }

  _playFlatSpotWheelThump() {}

  _playMarbleCarbonPing() {}

  // --------------------------------------------------------------------------
  // CROWD AMBIENCE (CONTINUOUS LOOP SILENCED TO PREVENT BACKGROUND DRONE)
  // --------------------------------------------------------------------------
  updateCrowdAmbience(speedKmh = 0, nearGrandstandFactor = 0, excitement = 0) {
    if (!this.initialized || !this.ctx) return;
    this._nearGrandstandCached = Math.max(0, Math.min(1, this._num(nearGrandstandFactor, 0)));
    if (this.crowdBedGain) {
      this._setTarget(this.crowdBedGain.gain, 0.0, this.ctx.currentTime, 0.06);
    }
  }

  _applyCrowdAmbienceInternal() {
    if (this.crowdBedGain && this.ctx) {
      this._setTarget(this.crowdBedGain.gain, 0.0, this.ctx.currentTime, 0.06);
    }
  }

  // --------------------------------------------------------------------------
  // WARM, LOW-MID PUNCHY GEARSHIFTS, REV-MATCH BLIPS & DOPPLER PASSES
  // --------------------------------------------------------------------------
  playUpshiftCut(newGear = 2) {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    const gIdx = Math.max(1, Math.min(8, Math.round(this._num(newGear, 2))));

    if (this.isRetroMode) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      this._setVal(osc.frequency, 210, now);
      this._expRamp(osc.frequency, 115, now + 0.040);
      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.09, now);
      this._expRamp(g.gain, 0.001, now + 0.044);
      osc.connect(g);
      g.connect(this.engineBus);
      osc.onended = () => { try { g.disconnect(); } catch (_) {} };
      osc.start(now);
      osc.stop(now + 0.048);
      return;
    }

    // 1. Smooth 42ms seamless-shift torque dip
    if (this.shiftCutGain) {
      try {
        this.shiftCutGain.gain.cancelScheduledValues(now);
      } catch (_) {}
      const curVal = Math.max(0.2, Math.min(1.05, this._num(this.shiftCutGain.gain.value, 1.0)));
      this._setVal(this.shiftCutGain.gain, curVal, now);
      this._linRamp(this.shiftCutGain.gain, 0.28, now + 0.008);
      this._setVal(this.shiftCutGain.gain, 0.28, now + 0.036);
      this._linRamp(this.shiftCutGain.gain, 1.03, now + 0.052);
      this._linRamp(this.shiftCutGain.gain, 1.0, now + 0.078);
    }

    // 2. Pleasant, warm low-mid pneumatic exhaust thump (130 Hz -> 46 Hz, low-passed at 280 Hz)
    const thump = this.ctx.createOscillator();
    thump.type = 'triangle';
    this._setVal(thump.frequency, this._clampFreq(124 + gIdx * 5), now + 0.004);
    this._expRamp(thump.frequency, 46, now + 0.068);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    lp.Q.value = 0.707;

    const tg = this.ctx.createGain();
    this._setVal(tg.gain, 0.16, now + 0.004);
    this._expRamp(tg.gain, 0.001, now + 0.074);

    thump.connect(lp);
    lp.connect(tg);
    tg.connect(this.engineBus);
    thump.onended = () => {
      try { tg.disconnect(); } catch (_) {}
    };
    thump.start(now + 0.004);
    thump.stop(now + 0.080);
  }

  playDownshiftBlip(newGear = 2) {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    const gIdx = Math.max(1, Math.min(7, Math.round(this._num(newGear, 2))));

    if (this.isRetroMode) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      this._setVal(osc.frequency, 130, now);
      this._linRamp(osc.frequency, 185, now + 0.032);
      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.09, now);
      this._expRamp(g.gain, 0.001, now + 0.060);
      osc.connect(g);
      g.connect(this.engineBus);
      osc.onended = () => { try { g.disconnect(); } catch (_) {} };
      osc.start(now);
      osc.stop(now + 0.065);
      return;
    }

    // Warm, musical low-mid throttle rev-match purr (115 Hz -> 175 Hz through 440 Hz low-pass)
    const fStart = 112 + (8 - gIdx) * 10;
    const blipFund = this.ctx.createOscillator();
    if (this._ottoPulseWave) blipFund.setPeriodicWave(this._ottoPulseWave);
    else blipFund.type = 'triangle';
    this._setVal(blipFund.frequency, this._clampFreq(fStart), now);
    this._linRamp(blipFund.frequency, this._clampFreq(fStart * 1.32), now + 0.032);
    this._expRamp(blipFund.frequency, this._clampFreq(fStart * 0.96), now + 0.088);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 440;
    lp.Q.value = 0.707;

    const g = this.ctx.createGain();
    this._setVal(g.gain, 0.002, now);
    this._linRamp(g.gain, 0.14, now + 0.012);
    this._expRamp(g.gain, 0.001, now + 0.092);

    blipFund.connect(lp);
    lp.connect(g);
    g.connect(this.engineBus);
    blipFund.onended = () => {
      try { g.disconnect(); } catch (_) {}
    };
    blipFund.start(now);
    blipFund.stop(now + 0.098);
  }

  playWastegateFlutter(intensity = 0.6) {
    if (!this.initialized || this.muted || !this.ctx || this.isRetroMode) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    const lvl = Math.max(0.2, Math.min(1.0, this._num(intensity, 0.6)));

    // Soft, warm low-mid pressure relief sigh (no high-frequency chirp)
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    this._setVal(osc.frequency, 220, now);
    this._expRamp(osc.frequency, 95, now + 0.09);
    const g = this.ctx.createGain();
    this._setVal(g.gain, 0.001, now);
    this._linRamp(g.gain, 0.045 * lvl, now + 0.012);
    this._expRamp(g.gain, 0.0008, now + 0.095);
    osc.connect(g);
    g.connect(this.engineBus);
    osc.onended = () => { try { g.disconnect(); } catch (_) {} };
    osc.start(now);
    osc.stop(now + 0.10);
  }

  playOverrunCrackles(count = 1) {
    if (!this.initialized || this.muted || !this.ctx || this.isRetroMode) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    const safeCount = Math.max(1, Math.min(2, Math.round(this._num(count, 1))));

    for (let i = 0; i < safeCount; i++) {
      const t0 = now + 0.012 + i * 0.055;
      const popOsc = this.ctx.createOscillator();
      popOsc.type = 'triangle';
      const popStart = 135 + Math.random() * 35;
      this._setVal(popOsc.frequency, popStart, t0);
      this._expRamp(popOsc.frequency, 44, t0 + 0.052);

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      lp.Q.value = 0.707;

      const popGain = this.ctx.createGain();
      this._setVal(popGain.gain, 0.085, t0);
      this._expRamp(popGain.gain, 0.001, t0 + 0.058);

      popOsc.connect(lp);
      lp.connect(popGain);
      popGain.connect(this.engineBus);
      popOsc.onended = () => {
        try { popGain.disconnect(); } catch (_) {}
      };
      popOsc.start(t0);
      popOsc.stop(t0 + 0.062);
    }
  }

  playOvertakeWhoosh(relSpeedKmh = 45, pan = null) {
    if (!this.initialized || this.muted || !this.ctx) return;
    const nowMs = performance.now();
    if (nowMs - this._lastOvertakeMs < 380) return;
    this._lastOvertakeMs = nowMs;

    this._ensureRunning();
    const now = this.ctx.currentTime;
    const rel = Math.max(12, Math.min(180, this._num(relSpeedKmh, 45)));
    const intensity = Math.min(1.0, Math.max(0.28, rel / 85));

    let startPan;
    if (pan !== null && pan !== undefined && Number.isFinite(Number(pan))) {
      startPan = Math.max(-0.90, Math.min(0.90, Number(pan)));
      if (Math.abs(startPan) < 0.15) startPan = (startPan >= 0 ? 1 : -1) * 0.50;
    } else {
      startPan = this._overtakePanFlip * 0.65;
      this._overtakePanFlip = -this._overtakePanFlip;
    }

    const panner = this._createPanner(startPan);
    if (panner.pan) {
      this._setVal(panner.pan, startPan, now);
      this._linRamp(panner.pan, -startPan * 0.60, now + 0.34);
    }

    // Warm low-mid rival engine Doppler sweep (240 Hz -> 115 Hz through 520 Hz low-pass)
    const dopplerOsc = this.ctx.createOscillator();
    if (this._ottoPulseWave) dopplerOsc.setPeriodicWave(this._ottoPulseWave);
    else dopplerOsc.type = 'triangle';
    this._setVal(dopplerOsc.frequency, this._clampFreq(210 + rel * 0.85), now);
    this._expRamp(dopplerOsc.frequency, this._clampFreq(105 + rel * 0.25), now + 0.34);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.Q.value = 0.707;

    const g = this.ctx.createGain();
    this._setVal(g.gain, 0.002, now);
    this._linRamp(g.gain, 0.11 * intensity, now + 0.08);
    this._expRamp(g.gain, 0.001, now + 0.36);

    dopplerOsc.connect(lp);
    lp.connect(g);
    g.connect(panner);
    panner.connect(this.sfxBus);

    dopplerOsc.onended = () => {
      try { panner.disconnect(); } catch (_) {}
    };
    dopplerOsc.start(now);
    dopplerOsc.stop(now + 0.38);
  }

  // --------------------------------------------------------------------------
  // WARM TV BROADCAST TRACKSIDE DOPPLER FLY-BY
  // --------------------------------------------------------------------------
  playReplayFlyby(speedKmh = 290) {
    if (!this.initialized || this.muted || !this.ctx) return;
    const nowMs = performance.now();
    if (nowMs - this._lastFlybyMs < 240) return;
    this._lastFlybyMs = nowMs;

    this._ensureRunning();
    const now = this.ctx.currentTime;
    const vKmh = Math.max(110, Math.min(355, this._num(speedKmh, 290)));
    const vMps = vKmh / 3.6;
    const cSound = 343.0;

    const approachRatio = cSound / Math.max(210, cSound - vMps * 0.72);
    const recedeRatio = cSound / (cSound + vMps * 0.72);
    const tPass = now + 0.38;
    const tEnd = now + 0.96;

    const side = this._flybyPanFlip;
    this._flybyPanFlip = -this._flybyPanFlip;
    const panner = this._createPanner(-0.85 * side);
    if (panner.pan) {
      this._setVal(panner.pan, -0.85 * side, now);
      this._linRamp(panner.pan, 0.0, tPass);
      this._linRamp(panner.pan, 0.85 * side, tEnd);
    }

    const distLp = this.ctx.createBiquadFilter();
    distLp.type = 'lowpass';
    distLp.Q.value = 0.707;
    this._setVal(distLp.frequency, 320, now);
    this._expRamp(distLp.frequency, 920, tPass);
    this._expRamp(distLp.frequency, 280, tEnd);

    const flybyGain = this.ctx.createGain();
    this._setVal(flybyGain.gain, 0.002, now);
    this._expRamp(flybyGain.gain, 0.18, tPass - 0.015);
    this._expRamp(flybyGain.gain, 0.001, tEnd);

    const fBase = 195 + (vKmh / 330) * 85;
    const osc1 = this.ctx.createOscillator();
    if (this._ottoPulseWave) osc1.setPeriodicWave(this._ottoPulseWave);
    else osc1.type = 'triangle';
    this._setVal(osc1.frequency, this._clampFreq(fBase * approachRatio), now);
    this._expRamp(osc1.frequency, this._clampFreq(fBase * recedeRatio), tPass + 0.08);

    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    this._setVal(subOsc.frequency, this._clampFreq(fBase * 0.5 * approachRatio), now);
    this._expRamp(subOsc.frequency, this._clampFreq(fBase * 0.5 * recedeRatio), tPass + 0.08);
    const subG = this.ctx.createGain();
    subG.gain.value = 0.65;

    osc1.connect(distLp);
    subOsc.connect(subG);
    subG.connect(distLp);
    distLp.connect(flybyGain);
    flybyGain.connect(panner);
    panner.connect(this.sfxBus);

    osc1.onended = () => {
      try { panner.disconnect(); } catch (_) {}
    };
    osc1.start(now);
    subOsc.start(now);
    osc1.stop(tEnd + 0.03);
    subOsc.stop(tEnd + 0.03);
  }

  // --------------------------------------------------------------------------
  // WARM, SUBTLE STADIUM CROWD CHEERS (LOW-PASSED FORMANT SWELL)
  // --------------------------------------------------------------------------
  playCrowdCheer(intensity = 0.7) {
    if (!this.initialized || this.muted || !this.ctx || this.isRetroMode) return;
    const nowMs = performance.now();
    if (nowMs - this._lastCrowdMs < 550) return;
    this._lastCrowdMs = nowMs;

    this._ensureRunning();
    const now = this.ctx.currentTime;
    const lvl = Math.max(0.15, Math.min(1.0, this._num(intensity, 0.7)));
    const amp = lvl * (this._isCockpitView ? 0.65 : 0.85);
    const dur = 1.65;

    [-0.50, 0.50].forEach((panPos, idx) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noisePinkBuf;
      src.loop = true;
      const f1 = this.ctx.createBiquadFilter();
      f1.type = 'lowpass';
      f1.Q.value = 0.707;
      this._setVal(f1.frequency, 380 + idx * 25, now);
      this._linRamp(f1.frequency, 540, now + 0.35);
      this._expRamp(f1.frequency, 320, now + dur);
      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.002, now);
      this._linRamp(g.gain, 0.055 * amp, now + 0.25);
      this._expRamp(g.gain, 0.001, now + dur);
      const panner = this._createPanner(panPos);
      src.connect(f1);
      f1.connect(g);
      g.connect(panner);
      panner.connect(this.sfxBus);
      src.onended = () => { try { panner.disconnect(); } catch (_) {} };
      src.start(now, idx * 0.6);
      src.stop(now + dur + 0.03);
    });
  }

  playCrowdCheerSurge(intensity = 0.85) {
    this.playCrowdCheer(Math.min(1.0, this._num(intensity, 0.85)));
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

  // --------------------------------------------------------------------------
  // AAA MOBILE COCKPIT, HYBRID ERS/DRS, PROGRESSION & PHOTO MODE SOUND SUITE
  // --------------------------------------------------------------------------
  playDrsBeep(isOpen = true) {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = isOpen ? 2150 : 1900;
    lp.Q.value = 0.707;
    lp.connect(this.sfxBus);

    if (isOpen) {
      // Authentic FIA steering-wheel 2-tone cockpit pip (880 Hz -> 1175 Hz, ~55ms per pip)
      const pips = [
        { f: 880.0, tOff: 0.0, dur: 0.048, amp: 0.115 },
        { f: 1174.66, tOff: 0.044, dur: 0.056, amp: 0.13 },
      ];
      pips.forEach((p, idx) => {
        const t0 = now + p.tOff;
        const oscSin = this.ctx.createOscillator();
        oscSin.type = 'sine';
        this._setVal(oscSin.frequency, this._clampFreq(p.f), t0);

        const oscTri = this.ctx.createOscillator();
        oscTri.type = 'triangle';
        this._setVal(oscTri.frequency, this._clampFreq(p.f), t0);
        const triMix = this.ctx.createGain();
        triMix.gain.value = 0.35;

        const g = this.ctx.createGain();
        this._setVal(g.gain, 0.001, t0);
        this._linRamp(g.gain, p.amp, t0 + 0.005);
        this._expRamp(g.gain, 0.0008, t0 + p.dur);

        oscSin.connect(g);
        oscTri.connect(triMix);
        triMix.connect(g);
        g.connect(lp);

        oscSin.onended = () => {
          try { g.disconnect(); } catch (_) {}
          if (idx === pips.length - 1) {
            try { lp.disconnect(); } catch (_) {}
          }
        };
        oscSin.start(t0);
        oscTri.start(t0);
        oscSin.stop(t0 + p.dur + 0.008);
        oscTri.stop(t0 + p.dur + 0.008);
      });
    } else {
      // Soft single 988 Hz FIA DRS detection/available notification pip (~55ms)
      const oscSin = this.ctx.createOscillator();
      oscSin.type = 'sine';
      this._setVal(oscSin.frequency, 987.77, now);

      const oscTri = this.ctx.createOscillator();
      oscTri.type = 'triangle';
      this._setVal(oscTri.frequency, 987.77, now);
      const triMix = this.ctx.createGain();
      triMix.gain.value = 0.28;

      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.001, now);
      this._linRamp(g.gain, 0.095, now + 0.005);
      this._expRamp(g.gain, 0.0008, now + 0.056);

      oscSin.connect(g);
      oscTri.connect(triMix);
      triMix.connect(g);
      g.connect(lp);

      oscSin.onended = () => {
        try { g.disconnect(); } catch (_) {}
        try { lp.disconnect(); } catch (_) {}
      };
      oscSin.start(now);
      oscTri.start(now);
      oscSin.stop(now + 0.064);
      oscTri.stop(now + 0.064);
    }
  }

  playErsDeployPulse(active = true) {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = active ? 680 : 520;
    lp.Q.value = 0.75;

    const outGain = this.ctx.createGain();
    const dur = active ? 0.118 : 0.096;
    this._setVal(outGain.gain, 0.001, now);
    this._linRamp(outGain.gain, active ? 0.155 : 0.095, now + 0.016);
    this._expRamp(outGain.gain, 0.0008, now + dur);

    // Warm MGU-K electric torque swell (180 -> 360 Hz triangle when deploying)
    const oscTorque = this.ctx.createOscillator();
    oscTorque.type = 'triangle';
    this._setVal(oscTorque.frequency, active ? 180.0 : 320.0, now);
    this._expRamp(oscTorque.frequency, active ? 360.0 : 165.0, now + dur);

    const oscFifth = this.ctx.createOscillator();
    oscFifth.type = 'sine';
    this._setVal(oscFifth.frequency, active ? 270.0 : 240.0, now);
    this._expRamp(oscFifth.frequency, active ? 540.0 : 124.0, now + dur);
    const fifthGain = this.ctx.createGain();
    fifthGain.gain.value = 0.34;

    // Tactile sub-bass torque punch (94 -> 56 Hz pure sine)
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    this._setVal(subOsc.frequency, active ? 94.0 : 76.0, now);
    this._expRamp(subOsc.frequency, active ? 56.0 : 48.0, now + dur * 0.9);
    const subG = this.ctx.createGain();
    subG.gain.value = active ? 0.85 : 0.55;

    oscTorque.connect(lp);
    oscFifth.connect(fifthGain);
    fifthGain.connect(lp);
    subOsc.connect(subG);
    subG.connect(lp);
    lp.connect(outGain);
    outGain.connect(this.sfxBus);

    oscTorque.onended = () => {
      try { outGain.disconnect(); } catch (_) {}
    };
    oscTorque.start(now);
    oscFifth.start(now);
    subOsc.start(now);
    oscTorque.stop(now + dur + 0.012);
    oscFifth.stop(now + dur + 0.012);
    subOsc.stop(now + dur + 0.012);
  }

  playAchievementChime(tier = 'GOLD') {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;

    const normTier = String(tier || 'GOLD').toUpperCase().trim();
    const tierScale = normTier === 'BRONZE' ? 0.82 : (normTier === 'SILVER' ? 0.92 : 1.0);

    // Warm GT7 / F1 Mobile Cmaj9 unlock arpeggio (C5 - E5 - G5 - D6 + warm C4 foundation)
    const masterChime = this.ctx.createGain();
    masterChime.gain.value = 0.95 * tierScale;

    const warmLp = this.ctx.createBiquadFilter();
    warmLp.type = 'lowpass';
    warmLp.frequency.value = 1780;
    warmLp.Q.value = 0.707;

    masterChime.connect(warmLp);
    warmLp.connect(this.sfxBus);
    if (this.reverbSendSfx) {
      warmLp.connect(this.reverbSendSfx);
    }

    // Gentle Valley hall bloom send (clean single-shot filtered stereo reflection, zero comb-filtering)
    let bloomDelay = null;
    let bloomGain = null;
    if (typeof this.ctx.createDelay === 'function') {
      bloomDelay = this.ctx.createDelay(0.25);
      bloomDelay.delayTime.value = 0.115;
      const bloomLp = this.ctx.createBiquadFilter();
      bloomLp.type = 'lowpass';
      bloomLp.frequency.value = 980;
      bloomGain = this.ctx.createGain();
      bloomGain.gain.value = 0.22;
      warmLp.connect(bloomDelay);
      bloomDelay.connect(bloomLp);
      bloomLp.connect(bloomGain);
      bloomGain.connect(this.sfxBus);
      if (this.valleyConvolver && this.valleyWetGain) {
        bloomGain.connect(this.valleyConvolver);
      }
    }

    // Warm C4 pad root
    const padOsc = this.ctx.createOscillator();
    padOsc.type = 'sine';
    this._setVal(padOsc.frequency, 261.63, now);
    const padGain = this.ctx.createGain();
    this._setVal(padGain.gain, 0.001, now);
    this._linRamp(padGain.gain, 0.11, now + 0.035);
    this._expRamp(padGain.gain, 0.0008, now + 0.82);
    padOsc.connect(padGain);
    padGain.connect(masterChime);
    padOsc.start(now);
    padOsc.stop(now + 0.85);

    const notes = [
      { f: 523.25, tOff: 0.000, dur: 0.56, amp: 0.14, pan: -0.22 }, // C5
      { f: 659.25, tOff: 0.056, dur: 0.54, amp: 0.13, pan: -0.07 }, // E5
      { f: 783.99, tOff: 0.112, dur: 0.54, amp: 0.13, pan: 0.10 },  // G5
      { f: 1174.66, tOff: 0.172, dur: 0.66, amp: 0.145, pan: 0.24 }, // D6 (Maj9 crown!)
    ];
    if (normTier === 'GOLD') {
      notes.push({ f: 987.77, tOff: 0.142, dur: 0.58, amp: 0.075, pan: 0.16 }); // B5 lush maj7 color
    }

    notes.forEach((n, idx) => {
      const t0 = now + n.tOff;
      const oscSin = this.ctx.createOscillator();
      oscSin.type = 'sine';
      this._setVal(oscSin.frequency, this._clampFreq(n.f), t0);

      const oscTri = this.ctx.createOscillator();
      oscTri.type = 'triangle';
      this._setVal(oscTri.frequency, this._clampFreq(n.f), t0);
      oscTri.detune.value = 2.0;
      const triGain = this.ctx.createGain();
      triGain.gain.value = 0.26;

      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.001, t0);
      this._linRamp(g.gain, n.amp, t0 + 0.010);
      this._expRamp(g.gain, 0.0008, t0 + n.dur);

      const panner = this._createPanner(n.pan);
      oscSin.connect(g);
      oscTri.connect(triGain);
      triGain.connect(g);
      g.connect(panner);
      panner.connect(masterChime);

      if (idx === 3) {
        oscSin.onended = () => {
          setTimeout(() => {
            try { masterChime.disconnect(); } catch (_) {}
            try { warmLp.disconnect(); } catch (_) {}
            if (bloomGain) {
              try { bloomGain.disconnect(); } catch (_) {}
            }
          }, 180);
        };
      }
      oscSin.start(t0);
      oscTri.start(t0);
      oscSin.stop(t0 + n.dur + 0.02);
      oscTri.stop(t0 + n.dur + 0.02);
    });
  }

  playPerfectLaunchChord() {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;

    // 1. Crisp clutch-bite low-end launch punch (138 -> 46 Hz)
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    this._setVal(subOsc.frequency, 138.0, now);
    this._expRamp(subOsc.frequency, 46.0, now + 0.15);
    const subGain = this.ctx.createGain();
    this._setVal(subGain.gain, 0.002, now);
    this._linRamp(subGain.gain, 0.20, now + 0.006);
    this._expRamp(subGain.gain, 0.0008, now + 0.165);
    subOsc.connect(subGain);
    subGain.connect(this.sfxBus);
    subOsc.onended = () => {
      try { subGain.disconnect(); } catch (_) {}
    };
    subOsc.start(now);
    subOsc.stop(now + 0.175);

    // 2. Consonant Aadd9 confirmation hit (locks harmonically with 880 Hz Green Lights-Out beep!)
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1850;
    lp.Q.value = 0.707;
    lp.connect(this.sfxBus);

    const chordVoices = [
      { f: 440.00, tOff: 0.000, dur: 0.28, type: 'triangle', amp: 0.125 }, // A4
      { f: 659.25, tOff: 0.018, dur: 0.30, type: 'triangle', amp: 0.115 }, // E5
      { f: 880.00, tOff: 0.036, dur: 0.34, type: 'sine', amp: 0.130 },     // A5
      { f: 1108.73, tOff: 0.052, dur: 0.36, type: 'sine', amp: 0.095 },    // C#6
    ];
    chordVoices.forEach((v, idx) => {
      const t0 = now + v.tOff;
      const osc = this.ctx.createOscillator();
      osc.type = v.type;
      this._setVal(osc.frequency, this._clampFreq(v.f), t0);

      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.001, t0);
      this._linRamp(g.gain, v.amp, t0 + 0.008);
      this._expRamp(g.gain, 0.0008, t0 + v.dur);

      osc.connect(g);
      g.connect(lp);
      osc.onended = () => {
        try { g.disconnect(); } catch (_) {}
        if (idx === chordVoices.length - 1) {
          try { lp.disconnect(); } catch (_) {}
        }
      };
      osc.start(t0);
      osc.stop(t0 + v.dur + 0.015);
    });
  }

  playWheelRubThud(intensity = 0.5) {
    if (!this.initialized || this.muted || !this.ctx) return;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this._lastWheelRubMs && nowMs - this._lastWheelRubMs < 180) return;
    this._lastWheelRubMs = nowMs;

    this._ensureRunning();
    const now = this.ctx.currentTime;
    const lvl = Math.max(0.15, Math.min(1.0, this._num(intensity, 0.5)));

    // 1. 90 Hz bandpass rubber sidewall / carbon sidepod contact noise
    const noiseBuf = this._noisePinkBuf || this._noiseWhiteBuf;
    if (noiseBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = noiseBuf;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 90.0;
      bp.Q.value = 1.35;

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 250.0;
      lp.Q.value = 0.707;

      const ng = this.ctx.createGain();
      this._setVal(ng.gain, 0.002, now);
      this._linRamp(ng.gain, 0.28 * lvl, now + 0.009);
      this._expRamp(ng.gain, 0.001, now + 0.145);

      src.connect(bp);
      bp.connect(lp);
      lp.connect(ng);
      ng.connect(this.sfxBus);
      src.onended = () => {
        try { ng.disconnect(); } catch (_) {}
      };
      src.start(now);
      src.stop(now + 0.155);
    }

    // 2. 62 Hz sine chassis/sidepod thud transient
    const thudOsc = this.ctx.createOscillator();
    thudOsc.type = 'sine';
    this._setVal(thudOsc.frequency, 62.0, now);
    this._expRamp(thudOsc.frequency, 36.0, now + 0.13);

    const tg = this.ctx.createGain();
    this._setVal(tg.gain, 0.002, now);
    this._linRamp(tg.gain, 0.28 * lvl, now + 0.005);
    this._expRamp(tg.gain, 0.001, now + 0.138);

    thudOsc.connect(tg);
    tg.connect(this.sfxBus);
    thudOsc.onended = () => {
      try { tg.disconnect(); } catch (_) {}
    };
    thudOsc.start(now);
    thudOsc.stop(now + 0.148);
  }

  playCameraShutter() {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;

    // Two-curtain mechanical DSLR shutter click (front curtain open + mirror/rear curtain return)
    const curtains = [
      { tOff: 0.000, bpFreq: 1650, clickStart: 920, clickEnd: 260, amp: 0.17 },
      { tOff: 0.048, bpFreq: 1280, clickStart: 640, clickEnd: 150, amp: 0.14 },
    ];

    curtains.forEach((c) => {
      const t0 = now + c.tOff;
      if (this._noiseWhiteBuf) {
        const src = this.ctx.createBufferSource();
        src.buffer = this._noiseWhiteBuf;

        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = c.bpFreq;
        bp.Q.value = 1.85;

        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3100;

        const ng = this.ctx.createGain();
        this._setVal(ng.gain, 0.002, t0);
        this._linRamp(ng.gain, c.amp, t0 + 0.003);
        this._expRamp(ng.gain, 0.0008, t0 + 0.024);

        src.connect(bp);
        bp.connect(lp);
        lp.connect(ng);
        ng.connect(this.sfxBus);
        src.onended = () => {
          try { ng.disconnect(); } catch (_) {}
        };
        src.start(t0);
        src.stop(t0 + 0.028);
      }

      const detentOsc = this.ctx.createOscillator();
      detentOsc.type = 'triangle';
      this._setVal(detentOsc.frequency, c.clickStart, t0);
      this._expRamp(detentOsc.frequency, c.clickEnd, t0 + 0.020);

      const dg = this.ctx.createGain();
      this._setVal(dg.gain, c.amp * 0.85, t0);
      this._expRamp(dg.gain, 0.0008, t0 + 0.022);

      detentOsc.connect(dg);
      dg.connect(this.sfxBus);
      detentOsc.onended = () => {
        try { dg.disconnect(); } catch (_) {}
      };
      detentOsc.start(t0);
      detentOsc.stop(t0 + 0.026);
    });
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
