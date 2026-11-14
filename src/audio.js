// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// AAA Multi-Harmonic F1 Acoustic Synthesizer, 1:1 1982 Namco WSG/PSG Suite,
// Seamless 8-Speed Shift Cut/Blip, Broadcast Doppler Fly-By & 5-Bus Mixer
// ============================================================================

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

    // 2026 Multi-Harmonic F1 Power Unit nodes
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

    // 1:1 1982 Namco PSG Dual-Pulse Divider Engine nodes
    this.psgOscA = null;
    this.psgOscB = null;
    this.psgSubOsc = null;
    this.psgFilter = null;
    this.psgEngineGain = null;

    // Hybrid MGU-H Turbo & Straight-Cut Gearbox Whine
    this.oscTurbo = null;
    this.turboGain = null;
    this.oscGearbox = null;
    this.oscGearboxHarm = null;
    this.gbBand = null;
    this.gearboxGain = null;

    // Environmental & Surface loops
    this.aeroGain = null;
    this.aeroFilter = null;
    this.skidGain = null;
    this.skidFilter = null;
    this.skidHarmFilter = null;
    this.skidHarmGain = null;
    this.curbGain = null;
    this.curbOsc = null;
    this.curbSubOsc = null;
    this.curbFilter = null;
    this.rainGain = null;

    // Showroom Paddock Ambient Pad
    this.menuPadGain = null;
    this.menuPadOscs = [];
    this.menuPadLfo = null;

    // Cached buffers, PeriodicWaves & state trackers
    this._noisePinkBuf = null;
    this._noiseWhiteBuf = null;
    this._noiseLfsrBuf = null;
    this._namcoWsgBrassWave = null;
    this._namcoPulse25Wave = null;
    this._shaperCurveEngine = null;
    this._shaperCurveTransient = null;
    this._currentVisualStyle = '2026_PBR';
    this._prevThrottle = 0;
    this._turboSpool = 0;
    this._lastCrackleMs = 0;
    this._lastCrowdMs = 0;
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

  _clampFreq(f) {
    const maxF = this.ctx ? Math.min(19000, this.ctx.sampleRate * 0.45) : 18000;
    return Math.max(12, Math.min(maxF, this._num(f, 440)));
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
    // Strictly guard > 0.0001 so exponentialRampToValueAtTime NEVER throws RangeError
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
      const targetMaster = this.muted ? 0.0 : 0.58 * this.mixerLevels.master;
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

  unlock() {
    if (this.initialized) {
      this._ensureRunning();
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
    } catch (_) {
      this.ctx = new AudioCtx();
    }

    // Master Broadcast Bus: Subsonic Highpass -> Presence -> Limiter/Compressor
    const masterHP = this.ctx.createBiquadFilter();
    masterHP.type = 'highpass';
    masterHP.frequency.value = 28;
    masterHP.Q.value = 0.707;

    const masterPresence = this.ctx.createBiquadFilter();
    masterPresence.type = 'peaking';
    masterPresence.frequency.value = 2550;
    masterPresence.Q.value = 0.9;
    masterPresence.gain.value = 1.6;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -11.5;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 5.2;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.12;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0.0 : 0.58 * this.mixerLevels.master;

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
    masterHP.connect(masterPresence);
    masterPresence.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    this._noisePinkBuf = this._createNoiseBuffer(2.6, true);
    this._noiseWhiteBuf = this._createNoiseBuffer(1.4, false);
    this._noiseLfsrBuf = this._createNamcoLfsrBuffer(1.6);
    this._createNamcoWaves();
    this._shaperCurveEngine = this._makeSaturationCurve(2.28, 0.075);
    this._shaperCurveTransient = this._makeSaturationCurve(1.85, 0.04);

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

    if (!this._resumeBound && typeof window !== 'undefined') {
      this._resumeBound = true;
      const autoResume = () => {
        if (this.initialized && this.ctx && this.ctx.state !== 'running') {
          this.ctx.resume().catch(() => {});
        }
      };
      window.addEventListener('pointerdown', autoResume, { passive: true });
      window.addEventListener('touchstart', autoResume, { passive: true });
      window.addEventListener('keydown', autoResume, { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') autoResume();
      });
    }
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.masterGain && this.ctx) {
      const target = this.muted ? 0.0 : 0.58 * this.mixerLevels.master;
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

  _makeSaturationCurve(drive = 2.28, asym = 0.075) {
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
        // 4-bit stepped DAC level quantization
        const step4Bit = ((lfsr & 0x0f) / 7.5) - 1.0;
        currentOut = step4Bit * 0.72;
      }
      data[i] = currentOut;
    }
    return buf;
  }

  // Authentic 1982 Namco 32-Step WSG Brass Wavetable & 25%-Duty PSG Pulse Wave
  _createNamcoWaves() {
    if (typeof this.ctx.createPeriodicWave !== 'function') return;
    try {
      // Namco System-1 WSG Trumpet/Brass harmonic spectrum
      const brassImag = new Float32Array([0, 1.0, 0.54, 0.76, 0.34, 0.46, 0.18, 0.25, 0.09, 0.12, 0.05]);
      const brassReal = new Float32Array(brassImag.length);
      this._namcoWsgBrassWave = this.ctx.createPeriodicWave(brassReal, brassImag);

      // 25% Duty-Cycle Asymmetric Rectangular Pulse for 1982 Namco PSG Engine
      const nHarm = 18;
      const pReal = new Float32Array(nHarm);
      const pImag = new Float32Array(nHarm);
      const duty = 0.25;
      for (let k = 1; k < nHarm; k++) {
        pReal[k] = (2 / (k * Math.PI)) * Math.sin(2 * Math.PI * k * duty);
        pImag[k] = (2 / (k * Math.PI)) * (1 - Math.cos(2 * Math.PI * k * duty));
      }
      this._namcoPulse25Wave = this.ctx.createPeriodicWave(pReal, pImag);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 2026 SCREAMING MULTI-HARMONIC F1 POWER UNIT + DUAL FORMANT + COCKPIT SPATIAL
  // --------------------------------------------------------------------------
  _setupF1PowerUnit() {
    // 1. Cylinder-firing harmonic oscillator bank
    this.oscSub = this.ctx.createOscillator();
    this.oscSub.type = 'triangle';
    this.oscSub.frequency.value = 58;

    this.oscFund = this.ctx.createOscillator();
    this.oscFund.type = 'sawtooth';
    this.oscFund.frequency.value = 116;

    this.oscOct = this.ctx.createOscillator();
    this.oscOct.type = 'sawtooth';
    this.oscOct.detune.value = 4.5;
    this.oscOct.frequency.value = 232;

    // Exotic V10 2.5x 5th-order harmonic howl (blooms above 7,500 RPM!)
    this.oscFifth = this.ctx.createOscillator();
    this.oscFifth.type = 'sawtooth';
    this.oscFifth.detune.value = -4.0;
    this.oscFifth.frequency.value = 290;

    // 3.0x High-RPM metallic Inconel trumpet rasp
    this.oscRasp = this.ctx.createOscillator();
    this.oscRasp.type = 'square';
    this.oscRasp.detune.value = 6.5;
    this.oscRasp.frequency.value = 348;

    // Subtle mechanical combustion flutter LFO
    this.vibratoOsc = this.ctx.createOscillator();
    this.vibratoOsc.type = 'sine';
    this.vibratoOsc.frequency.value = 24.5;
    this.vibratoDepth = this.ctx.createGain();
    this.vibratoDepth.gain.value = 3.0;
    this.vibratoOsc.connect(this.vibratoDepth);
    this.vibratoDepth.connect(this.oscFund.detune);
    this.vibratoDepth.connect(this.oscOct.detune);
    this.vibratoDepth.connect(this.oscFifth.detune);
    this.vibratoDepth.connect(this.oscRasp.detune);

    this.subGain = this.ctx.createGain();
    this.subGain.gain.value = 0.42;
    this.fundGain = this.ctx.createGain();
    this.fundGain.gain.value = 0.48;
    this.octGain = this.ctx.createGain();
    this.octGain.gain.value = 0.34;
    this.fifthGain = this.ctx.createGain();
    this.fifthGain.gain.value = 0.14;
    this.raspGain = this.ctx.createGain();
    this.raspGain.gain.value = 0.05;

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

    // 2. Dynamic Dual-Peaking Exhaust Header + Carbon Intake Formant Resonators
    this.exhaustFormant = this.ctx.createBiquadFilter();
    this.exhaustFormant.type = 'peaking';
    this.exhaustFormant.frequency.value = 460;
    this.exhaustFormant.Q.value = 1.72;
    this.exhaustFormant.gain.value = 6.2;

    this.intakeFormant = this.ctx.createBiquadFilter();
    this.intakeFormant.type = 'peaking';
    this.intakeFormant.frequency.value = 1180;
    this.intakeFormant.Q.value = 2.15;
    this.intakeFormant.gain.value = 6.8;
    this.formantFilter = this.intakeFormant;

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._shaperCurveEngine;
    shaper.oversample = '4x';

    const dcBlock = this.ctx.createBiquadFilter();
    dcBlock.type = 'highpass';
    dcBlock.frequency.value = 32;

    this.lowpassFilter = this.ctx.createBiquadFilter();
    this.lowpassFilter.type = 'lowpass';
    this.lowpassFilter.frequency.value = 2200;
    this.lowpassFilter.Q.value = 0.82;

    const antiHarshShelf = this.ctx.createBiquadFilter();
    antiHarshShelf.type = 'highshelf';
    antiHarshShelf.frequency.value = 5200;
    antiHarshShelf.gain.value = -3.8;

    // Seamless 8-Speed Ignition-Cut Transient Gate
    this.shiftCutGain = this.ctx.createGain();
    this.shiftCutGain.gain.value = 1.0;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    this.oscSub.connect(this.subGain);
    this.oscFund.connect(this.fundGain);
    this.oscOct.connect(this.octGain);
    this.oscFifth.connect(this.fifthGain);
    this.oscRasp.connect(this.raspGain);

    this.subGain.connect(this.exhaustFormant);
    this.fundGain.connect(this.exhaustFormant);
    this.octGain.connect(this.exhaustFormant);
    this.fifthGain.connect(this.exhaustFormant);
    this.raspGain.connect(this.exhaustFormant);
    this.airboxGain.connect(this.exhaustFormant);

    this.exhaustFormant.connect(this.intakeFormant);
    this.intakeFormant.connect(shaper);
    shaper.connect(dcBlock);
    dcBlock.connect(this.lowpassFilter);
    this.lowpassFilter.connect(antiHarshShelf);
    antiHarshShelf.connect(this.shiftCutGain);
    this.shiftCutGain.connect(this.engineGain);

    // 3. True Stereo Cockpit Spatial Reflection -> engineBus
    const drySplit = this.ctx.createGain();
    drySplit.gain.value = 0.82;
    this.engineGain.connect(drySplit);
    drySplit.connect(this.engineBus);

    const delayL = this.ctx.createDelay(0.05);
    delayL.delayTime.value = 0.0115;
    const dampL = this.ctx.createBiquadFilter();
    dampL.type = 'lowpass';
    dampL.frequency.value = 2650;
    const panL = this._createPanner(-0.54);
    const wetL = this.ctx.createGain();
    wetL.gain.value = 0.17;
    this.engineGain.connect(delayL);
    delayL.connect(dampL);
    dampL.connect(panL);
    panL.connect(wetL);
    wetL.connect(this.engineBus);

    const delayR = this.ctx.createDelay(0.05);
    delayR.delayTime.value = 0.0168;
    const dampR = this.ctx.createBiquadFilter();
    dampR.type = 'lowpass';
    dampR.frequency.value = 2350;
    const panR = this._createPanner(0.54);
    const wetR = this.ctx.createGain();
    wetR.gain.value = 0.17;
    this.engineGain.connect(delayR);
    delayR.connect(dampR);
    dampR.connect(panR);
    panR.connect(wetR);
    wetR.connect(this.engineBus);

    // 4. Hybrid MGU-H Turbo Spool Whistle + Straight-Cut Spur Gearbox Whine -> engineBus
    this.oscTurbo = this.ctx.createOscillator();
    this.oscTurbo.type = 'sine';
    this.oscTurbo.frequency.value = 2100;
    this.turboGain = this.ctx.createGain();
    this.turboGain.gain.value = 0.0;
    this.oscTurbo.connect(this.turboGain);
    this.turboGain.connect(this.engineBus);

    this.oscGearbox = this.ctx.createOscillator();
    this.oscGearbox.type = 'triangle';
    this.oscGearbox.frequency.value = 480;
    this.oscGearboxHarm = this.ctx.createOscillator();
    this.oscGearboxHarm.type = 'sine';
    this.oscGearboxHarm.frequency.value = 960;
    const gbHarmGain = this.ctx.createGain();
    gbHarmGain.gain.value = 0.38;

    this.gbBand = this.ctx.createBiquadFilter();
    this.gbBand.type = 'bandpass';
    this.gbBand.frequency.value = 1350;
    this.gbBand.Q.value = 2.6;
    this.gearboxGain = this.ctx.createGain();
    this.gearboxGain.gain.value = 0.0;

    this.oscGearbox.connect(this.gbBand);
    this.oscGearboxHarm.connect(gbHarmGain);
    gbHarmGain.connect(this.gbBand);
    this.gbBand.connect(this.gearboxGain);
    this.gearboxGain.connect(this.engineBus);

    this.oscSub.start();
    this.oscFund.start();
    this.oscOct.start();
    this.oscFifth.start();
    this.oscRasp.start();
    this.vibratoOsc.start();
    airboxSrc.start();
    this.oscTurbo.start();
    this.oscGearbox.start();
    this.oscGearboxHarm.start();
  }

  // --------------------------------------------------------------------------
  // 1:1 1982 NAMCO POLE POSITION DUAL-PULSE PSG ENGINE SYNTHESIZER
  // --------------------------------------------------------------------------
  _setupNamco1982Engine() {
    // Primary 25%-duty pulse cylinder counter + 3/2 divider rattle + sub-counter square
    this.psgOscA = this.ctx.createOscillator();
    if (this._namcoPulse25Wave && typeof this.psgOscA.setPeriodicWave === 'function') {
      this.psgOscA.setPeriodicWave(this._namcoPulse25Wave);
    } else {
      this.psgOscA.type = 'square';
    }
    this.psgOscA.frequency.value = 54;

    this.psgOscB = this.ctx.createOscillator();
    if (this._namcoPulse25Wave && typeof this.psgOscB.setPeriodicWave === 'function') {
      this.psgOscB.setPeriodicWave(this._namcoPulse25Wave);
    } else {
      this.psgOscB.type = 'square';
    }
    this.psgOscB.frequency.value = 81.5;
    this.psgOscB.detune.value = 7;

    this.psgSubOsc = this.ctx.createOscillator();
    this.psgSubOsc.type = 'square';
    this.psgSubOsc.frequency.value = 27;

    const gainA = this.ctx.createGain();
    gainA.gain.value = 0.52;
    const gainB = this.ctx.createGain();
    gainB.gain.value = 0.34;
    const gainSub = this.ctx.createGain();
    gainSub.gain.value = 0.30;

    // Classic arcade cabinet speaker cone resonance (2.1 kHz roll-off + 420 Hz cabinet box punch)
    const cabPunch = this.ctx.createBiquadFilter();
    cabPunch.type = 'peaking';
    cabPunch.frequency.value = 420;
    cabPunch.Q.value = 1.4;
    cabPunch.gain.value = 4.5;

    this.psgFilter = this.ctx.createBiquadFilter();
    this.psgFilter.type = 'lowpass';
    this.psgFilter.frequency.value = 2150;
    this.psgFilter.Q.value = 1.25;

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

    this.psgOscA.start();
    this.psgOscB.start();
    this.psgSubOsc.start();
  }

  _setupSurfaceAndAeroLoops() {
    // 1. High-Speed Aero Wind Rush (> 120 km/h) -> sfxBus
    const aeroSrc = this.ctx.createBufferSource();
    aeroSrc.buffer = this._noisePinkBuf;
    aeroSrc.loop = true;
    this.aeroFilter = this.ctx.createBiquadFilter();
    this.aeroFilter.type = 'bandpass';
    this.aeroFilter.frequency.value = 480;
    this.aeroFilter.Q.value = 0.72;
    this.aeroGain = this.ctx.createGain();
    this.aeroGain.gain.value = 0.0;
    aeroSrc.connect(this.aeroFilter);
    this.aeroFilter.connect(this.aeroGain);
    this.aeroGain.connect(this.sfxBus);
    aeroSrc.start();

    // 2. Dual-Resonant Lateral Tire-Limit Squeal / Scrub -> sfxBus
    const skidSrc = this.ctx.createBufferSource();
    skidSrc.buffer = this._noisePinkBuf;
    skidSrc.loop = true;

    this.skidFilter = this.ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 1420;
    this.skidFilter.Q.value = 4.8;

    this.skidHarmFilter = this.ctx.createBiquadFilter();
    this.skidHarmFilter.type = 'bandpass';
    this.skidHarmFilter.frequency.value = 2380;
    this.skidHarmFilter.Q.value = 5.4;
    this.skidHarmGain = this.ctx.createGain();
    this.skidHarmGain.gain.value = 0.45;

    const skidLfo = this.ctx.createOscillator();
    skidLfo.type = 'sine';
    skidLfo.frequency.value = 7.5;
    const skidLfoGain = this.ctx.createGain();
    skidLfoGain.gain.value = 34;
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

    // 3. Speed-Modulated Serrated FIA Kerb Rumble -> sfxBus
    this.curbOsc = this.ctx.createOscillator();
    this.curbOsc.type = 'sawtooth';
    this.curbOsc.frequency.value = 74;
    this.curbSubOsc = this.ctx.createOscillator();
    this.curbSubOsc.type = 'triangle';
    this.curbSubOsc.frequency.value = 37;
    const curbSubGain = this.ctx.createGain();
    curbSubGain.gain.value = 0.55;

    this.curbFilter = this.ctx.createBiquadFilter();
    this.curbFilter.type = 'lowpass';
    this.curbFilter.frequency.value = 245;
    this.curbFilter.Q.value = 1.65;
    this.curbGain = this.ctx.createGain();
    this.curbGain.gain.value = 0.0;

    this.curbOsc.connect(this.curbFilter);
    this.curbSubOsc.connect(curbSubGain);
    curbSubGain.connect(this.curbFilter);
    this.curbFilter.connect(this.curbGain);
    this.curbGain.connect(this.sfxBus);
    this.curbOsc.start();
    this.curbSubOsc.start();

    // 4. Wet Tarmac Rooster-Tail Spray Hiss -> sfxBus
    const rainSrc = this.ctx.createBufferSource();
    rainSrc.buffer = this._noisePinkBuf;
    rainSrc.loop = true;
    const rainHP = this.ctx.createBiquadFilter();
    rainHP.type = 'highpass';
    rainHP.frequency.value = 1150;
    const rainLP = this.ctx.createBiquadFilter();
    rainLP.type = 'lowpass';
    rainLP.frequency.value = 6200;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0.0;
    rainSrc.connect(rainHP);
    rainHP.connect(rainLP);
    rainLP.connect(this.rainGain);
    this.rainGain.connect(this.sfxBus);
    rainSrc.start();
  }

  _setupShowroomPad() {
    // Refined Gran Turismo / F1 Paddock ambient Dmaj9 synth pad -> musicBus
    this.menuPadGain = this.ctx.createGain();
    this.menuPadGain.gain.value = 0.0;

    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 370;
    padFilter.Q.value = 0.85;

    this.menuPadLfo = this.ctx.createOscillator();
    this.menuPadLfo.type = 'sine';
    this.menuPadLfo.frequency.value = 0.11;
    const lfoDepth = this.ctx.createGain();
    lfoDepth.gain.value = 85;
    this.menuPadLfo.connect(lfoDepth);
    lfoDepth.connect(padFilter.frequency);
    this.menuPadLfo.start();

    const voices = [
      { f: 73.42, type: 'triangle', gain: 0.34, detune: 0, pan: 0.0 },
      { f: 110.00, type: 'sawtooth', gain: 0.14, detune: -5, pan: -0.35 },
      { f: 164.81, type: 'sawtooth', gain: 0.13, detune: 5, pan: 0.35 },
      { f: 185.00, type: 'triangle', gain: 0.16, detune: -3, pan: -0.22 },
      { f: 220.00, type: 'sine', gain: 0.12, detune: 4, pan: 0.22 },
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
  // CONTINUOUS REAL-TIME TELEMETRY SYNTHESIS UPDATE
  // --------------------------------------------------------------------------
  updateContinuous(playerCar, moistureW, isRacingOrQuali, visualStyle, inShowroomMenu = false) {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (visualStyle) this._currentVisualStyle = visualStyle;

    // Crossfade Showroom Paddock Pad vs Live Race Acoustics
    if (this.menuPadGain) {
      this._setTarget(this.menuPadGain.gain, inShowroomMenu ? 0.068 : 0.0, now, 0.28);
    }

    if (!isRacingOrQuali || !playerCar || playerCar.exploded) {
      this._setTarget(this.engineGain.gain, 0.0, now, 0.045);
      this._setTarget(this.psgEngineGain.gain, 0.0, now, 0.045);
      this._setTarget(this.turboGain.gain, 0.0, now, 0.045);
      this._setTarget(this.gearboxGain.gain, 0.0, now, 0.045);
      this._setTarget(this.aeroGain.gain, 0.0, now, 0.055);
      this._setTarget(this.skidGain.gain, 0.0, now, 0.045);
      this._setTarget(this.curbGain.gain, 0.0, now, 0.025);
      this._setTarget(this.rainGain.gain, 0.0, now, 0.075);
      this._turboSpool = 0;
      return;
    }

    const rpm = Math.max(3200, Math.min(13800, this._num(playerCar.rpm, 3800)));
    const rpmNorm = Math.max(0, (rpm - 3200) / (13000 - 3200));
    const throttle = Math.max(0, Math.min(1, this._num(playerCar.throttleInput, 0)));
    const brake = Math.max(0, Math.min(1, this._num(playerCar.brakeInput, 0)));
    const speedKmh = Math.max(0, this._num(playerCar.speedKmh, 0));
    const moisture = Math.max(0, Math.min(1, this._num(moistureW, 0)));
    const overRev = this._num(playerCar.overRevTimer, 0) > 0;
    const isArcade = this._currentVisualStyle === '1982_ARCADE';

    // Off-throttle high-RPM overrun exhaust crackles & burbles on corner entry (2026 mode)
    if (!isArcade && this._prevThrottle > 0.62 && throttle < 0.16 && rpm > 8400 && speedKmh > 110) {
      const nowMs = performance.now();
      if (nowMs - this._lastCrackleMs > 580) {
        this._lastCrackleMs = nowMs;
        this.playOverrunCrackles(rpm > 10600 ? 3 : 2);
      }
    }
    this._prevThrottle = throttle;

    const slipBoost = playerCar.inSlipstream ? 1.028 : 1.0;
    const load = 0.34 + throttle * 0.66 + (overRev ? 0.22 : 0);

    // 1A. 1982 Namco Dual-Pulse PSG Engine vs 1B. 2026 Multi-Harmonic F1 V10/Hybrid
    if (isArcade) {
      // Authentic 1982 Namco Pole Position stepped divider dual-pulse roar!
      const psgBase = (42 + rpmNorm * 196 + (overRev ? 44 : 0)) * slipBoost;
      this._setTarget(this.psgOscA.frequency, this._clampFreq(psgBase), now, 0.014);
      this._setTarget(
        this.psgOscB.frequency,
        this._clampFreq(psgBase * (overRev ? 1.66 : 1.503)),
        now,
        0.014
      );
      this._setTarget(this.psgSubOsc.frequency, this._clampFreq(psgBase * 0.5), now, 0.014);
      this._setTarget(
        this.psgFilter.frequency,
        this._clampFreq(1150 + rpmNorm * 1450 * (0.55 + throttle * 0.45)),
        now,
        0.02
      );
      this._setTarget(this.psgEngineGain.gain, 0.16 + load * 0.12, now, 0.022);
      this._setTarget(this.engineGain.gain, 0.0, now, 0.03);
      this._setTarget(this.turboGain.gain, 0.0, now, 0.035);
      this._setTarget(this.gearboxGain.gain, 0.0, now, 0.035);
    } else {
      // Fade out 1982 PSG and drive full 2026 Screaming Multi-Harmonic F1 Power Unit
      this._setTarget(this.psgEngineGain.gain, 0.0, now, 0.03);

      const f0 = (114 + Math.pow(rpmNorm, 1.04) * 326) * slipBoost;
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

      // Muscular low-end growl blooming into exotic 2.5x V10 scream > 7,500 RPM!
      const v10Bloom = Math.max(0, Math.min(1, (rpm - 7200) / 5200));
      this._setTarget(this.subGain.gain, 0.44 - v10Bloom * 0.14, now, 0.024);
      this._setTarget(
        this.fifthGain.gain,
        0.08 + v10Bloom * (0.21 + throttle * 0.07),
        now,
        0.022
      );
      this._setTarget(
        this.raspGain.gain,
        0.025 + v10Bloom * throttle * 0.11,
        now,
        0.022
      );

      // Carbon Airbox Induction Rush & Combustion Flutter LFO
      this._setTarget(this.airboxFilter.frequency, this._clampFreq(560 + rpmNorm * 1780), now, 0.025);
      this._setTarget(this.airboxGain.gain, throttle * (0.04 + rpmNorm * 0.11), now, 0.028);
      const onLimiter = rpm > 12550 && throttle > 0.6;
      this._setTarget(this.vibratoDepth.gain, overRev || onLimiter ? 10.5 : 3.2, now, 0.025);

      // Dual-Peaking Exhaust & Intake Formants + Throttle-Sensitive Lowpass Opening
      this._setTarget(
        this.exhaustFormant.frequency,
        this._clampFreq(360 + rpmNorm * 690 * load),
        now,
        0.024
      );
      this._setTarget(
        this.intakeFormant.frequency,
        this._clampFreq(860 + rpmNorm * 1940 * load),
        now,
        0.024
      );
      this._setTarget(
        this.lowpassFilter.frequency,
        this._clampFreq(1220 + rpmNorm * 4250 * (0.42 + throttle * 0.58)),
        now,
        0.024
      );

      // Authentic 80 km/h FIA Pit-Lane Limiter Ignition Stutter
      const pitLimiterActive =
        playerCar.inPitLane &&
        playerCar.pitPhase !== 'STOPPED' &&
        speedKmh >= 76.5 &&
        throttle > 0.2;
      const pitMod = pitLimiterActive ? (Math.sin(now * 72.0) > 0 ? 1.06 : 0.62) : 1.0;
      this._setTarget(this.engineGain.gain, (0.165 + load * 0.165) * pitMod, now, 0.022);

      // 2. Hybrid MGU-H Turbo Whistle + Speed-Linked Straight-Cut Gearbox Whine
      const targetSpool = throttle * (0.32 + 0.68 * Math.min(1, rpmNorm));
      const spoolRate = targetSpool > this._turboSpool ? 0.16 : 0.07;
      this._turboSpool += (targetSpool - this._turboSpool) * spoolRate;

      this._setTarget(
        this.oscTurbo.frequency,
        this._clampFreq(1820 + rpmNorm * 2450 + this._turboSpool * 520),
        now,
        0.038
      );
      this._setTarget(this.turboGain.gain, 0.008 + this._turboSpool * 0.028, now, 0.038);

      const speedNorm = Math.min(1, speedKmh / 320);
      const gbFreq = 370 + speedNorm * 1980;
      const drivetrainLoad = 0.45 + 0.55 * Math.max(throttle, brake * 0.75);
      this._setTarget(this.oscGearbox.frequency, this._clampFreq(gbFreq), now, 0.028);
      this._setTarget(this.oscGearboxHarm.frequency, this._clampFreq(gbFreq * 2.0), now, 0.028);
      this._setTarget(this.gbBand.frequency, this._clampFreq(580 + speedNorm * 2050), now, 0.032);
      this._setTarget(
        this.gearboxGain.gain,
        speedNorm * (0.022 + 0.022 * drivetrainLoad),
        now,
        0.035
      );
    }

    // 3. High-Speed Aero Wind Rush (> 120 km/h, ducks subtly in slipstream tow)
    const aeroNorm = Math.max(0, Math.min(1, (speedKmh - 116) / 204));
    const slipDuck = playerCar.inSlipstream ? 0.80 : 1.0;
    this._setTarget(
      this.aeroFilter.frequency,
      this._clampFreq(390 + aeroNorm * 740 + (playerCar.inSlipstream ? -115 : 0)),
      now,
      0.048
    );
    this._setTarget(this.aeroGain.gain, aeroNorm * aeroNorm * 0.145 * slipDuck, now, 0.048);

    // 4. Progressive Lateral Tire-Limit Squeal (+ Off-Track Grass Runoff Scrub)
    const skidRaw = Math.max(0, this._num(playerCar.skidIntensity, 0));
    if (playerCar.onGrass && speedKmh > 20) {
      const grassVol = Math.min(0.20, (speedKmh / 240) * 0.18);
      this._setTarget(this.skidFilter.frequency, 440, now, 0.03);
      this._setTarget(this.skidFilter.Q, 1.2, now, 0.03);
      this._setTarget(this.skidHarmGain.gain, 0.12, now, 0.03);
      this._setTarget(this.skidGain.gain, grassVol, now, 0.035);
    } else {
      const slipNorm = Math.max(0, Math.min(1, (skidRaw - 0.10) / 0.82));
      const skidVol = Math.pow(slipNorm, 1.25) * 0.24;
      const baseSkidFreq = 1280 + Math.min(460, speedKmh * 1.35) + slipNorm * 140;
      this._setTarget(this.skidFilter.frequency, this._clampFreq(baseSkidFreq), now, 0.028);
      this._setTarget(this.skidFilter.Q, 4.8, now, 0.03);
      this._setTarget(this.skidHarmFilter.frequency, this._clampFreq(baseSkidFreq * 1.68), now, 0.028);
      this._setTarget(this.skidHarmGain.gain, 0.44, now, 0.03);
      this._setTarget(this.skidGain.gain, skidVol, now, 0.032);
    }

    // 5. Speed-Modulated Serrated FIA Kerb Rumble
    const onCurb = !!playerCar.onCurb && speedKmh > 18;
    const curbSpeedNorm = Math.min(1, speedKmh / 310);
    const curbFreq = 46 + curbSpeedNorm * 84;
    this._setTarget(this.curbOsc.frequency, this._clampFreq(curbFreq), now, 0.015);
    this._setTarget(this.curbSubOsc.frequency, this._clampFreq(curbFreq * 0.5), now, 0.015);
    this._setTarget(this.curbFilter.frequency, this._clampFreq(185 + curbSpeedNorm * 135), now, 0.02);
    this._setTarget(
      this.curbGain.gain,
      onCurb ? Math.min(0.21, 0.085 + curbSpeedNorm * 0.125) : 0.0,
      now,
      0.016
    );

    // 6. Wet Tarmac Spray Hiss
    const rainVol = moisture > 0.08
      ? Math.min(0.165, moisture * 0.095 + (speedKmh / 320) * moisture * 0.095)
      : 0.0;
    this._setTarget(this.rainGain.gain, rainVol, now, 0.065);
  }

  // --------------------------------------------------------------------------
  // SEAMLESS 8-SPEED F1 GEARSHIFT TRANSIENTS & DOPPLER PASS WHOOSHES
  // --------------------------------------------------------------------------
  playUpshiftCut(newGear = 2) {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    const gIdx = Math.max(1, Math.min(8, Math.round(this._num(newGear, 2))));

    // 1. Crisp ~50ms F1 seamless-shift ignition torque cut + re-engagement snap!
    if (this.shiftCutGain) {
      try {
        this.shiftCutGain.gain.cancelScheduledValues(now);
      } catch (_) {}
      const curVal = Math.max(0.1, Math.min(1.1, this._num(this.shiftCutGain.gain.value, 1.0)));
      this._setVal(this.shiftCutGain.gain, curVal, now);
      this._linRamp(this.shiftCutGain.gain, 0.10, now + 0.008);
      this._setVal(this.shiftCutGain.gain, 0.10, now + 0.044);
      this._linRamp(this.shiftCutGain.gain, 1.06, now + 0.056);
      this._linRamp(this.shiftCutGain.gain, 1.0, now + 0.082);
    }

    // 2. Pneumatic gearbox barrel/dog-ring thump -> engineBus
    const thump = this.ctx.createOscillator();
    thump.type = 'triangle';
    this._setVal(thump.frequency, this._clampFreq(162 + gIdx * 7), now + 0.006);
    this._expRamp(thump.frequency, 44, now + 0.078);

    const tg = this.ctx.createGain();
    this._setVal(tg.gain, 0.28, now + 0.006);
    this._expRamp(tg.gain, 0.001, now + 0.086);

    thump.connect(tg);
    tg.connect(this.engineBus);
    thump.onended = () => {
      try { tg.disconnect(); } catch (_) {}
    };
    thump.start(now + 0.006);
    thump.stop(now + 0.092);

    // 3. Unburnt-fuel tailpipe exhaust bark on ignition cut -> engineBus
    const barkOsc = this.ctx.createOscillator();
    barkOsc.type = 'sawtooth';
    this._setVal(barkOsc.frequency, this._clampFreq(240 + gIdx * 18), now + 0.010);
    this._expRamp(barkOsc.frequency, 118, now + 0.068);
    const barkOscGain = this.ctx.createGain();
    barkOscGain.gain.value = 0.45;

    const snap = this.ctx.createBufferSource();
    snap.buffer = this._noiseWhiteBuf;

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = this._clampFreq(540 + gIdx * 24);
    flt.Q.value = 1.55;

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._shaperCurveTransient;

    const ng = this.ctx.createGain();
    this._setVal(ng.gain, 0.20, now + 0.010);
    this._expRamp(ng.gain, 0.001, now + 0.074);

    barkOsc.connect(barkOscGain);
    barkOscGain.connect(flt);
    snap.connect(flt);
    flt.connect(shaper);
    shaper.connect(ng);
    ng.connect(this.engineBus);

    snap.onended = () => {
      try { ng.disconnect(); } catch (_) {}
    };
    barkOsc.start(now + 0.010);
    snap.start(now + 0.010);
    barkOsc.stop(now + 0.078);
    snap.stop(now + 0.078);
  }

  playDownshiftBlip(newGear = 2) {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    const gIdx = Math.max(1, Math.min(7, Math.round(this._num(newGear, 2))));

    // 1. Sharp Drive-by-Wire ECU Throttle Bark (Fundamental + 2.5x V10 Harmonic) -> engineBus
    const fStart = 188 + (8 - gIdx) * 20;

    const blipFund = this.ctx.createOscillator();
    blipFund.type = 'sawtooth';
    this._setVal(blipFund.frequency, this._clampFreq(fStart), now);
    this._linRamp(blipFund.frequency, this._clampFreq(fStart * 1.46), now + 0.034);
    this._expRamp(blipFund.frequency, this._clampFreq(fStart * 0.92), now + 0.098);

    const blipFifth = this.ctx.createOscillator();
    blipFifth.type = 'sawtooth';
    this._setVal(blipFifth.frequency, this._clampFreq(fStart * 2.5), now);
    this._linRamp(blipFifth.frequency, this._clampFreq(fStart * 2.5 * 1.46), now + 0.034);
    this._expRamp(blipFifth.frequency, this._clampFreq(fStart * 2.5 * 0.92), now + 0.098);

    const fifthMix = this.ctx.createGain();
    fifthMix.gain.value = 0.42;

    const formant = this.ctx.createBiquadFilter();
    formant.type = 'peaking';
    formant.frequency.value = 1420;
    formant.Q.value = 2.0;
    formant.gain.value = 5.5;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    this._setVal(lp.frequency, 1300, now);
    this._linRamp(lp.frequency, 2850, now + 0.032);
    this._expRamp(lp.frequency, 1150, now + 0.10);

    const g = this.ctx.createGain();
    this._setVal(g.gain, 0.002, now);
    this._linRamp(g.gain, 0.21, now + 0.012);
    this._expRamp(g.gain, 0.001, now + 0.102);

    blipFund.connect(formant);
    blipFifth.connect(fifthMix);
    fifthMix.connect(formant);
    formant.connect(lp);
    lp.connect(g);
    g.connect(this.engineBus);

    // 2. Pneumatic lower-gear dog engagement click -> engineBus
    const click = this.ctx.createOscillator();
    click.type = 'triangle';
    this._setVal(click.frequency, 135, now);
    this._expRamp(click.frequency, 52, now + 0.05);
    const cg = this.ctx.createGain();
    this._setVal(cg.gain, 0.16, now);
    this._expRamp(cg.gain, 0.001, now + 0.054);
    click.connect(cg);
    cg.connect(this.engineBus);

    blipFund.onended = () => {
      try { g.disconnect(); } catch (_) {}
    };
    click.onended = () => {
      try { cg.disconnect(); } catch (_) {}
    };

    blipFund.start(now);
    blipFifth.start(now);
    click.start(now);
    blipFund.stop(now + 0.108);
    blipFifth.stop(now + 0.108);
    click.stop(now + 0.058);

    // 3. Off-throttle exhaust crackles/burbles under corner braking
    if (this._currentVisualStyle !== '1982_ARCADE') {
      this.playOverrunCrackles(gIdx <= 4 ? 2 : 1);
    }
  }

  playOverrunCrackles(count = 2) {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    const safeCount = Math.max(1, Math.min(4, Math.round(this._num(count, 2))));

    for (let i = 0; i < safeCount; i++) {
      const t0 = now + 0.025 + i * (0.048 + Math.random() * 0.046);

      const popOsc = this.ctx.createOscillator();
      popOsc.type = 'triangle';
      const popStart = 175 + Math.random() * 85;
      this._setVal(popOsc.frequency, popStart, t0);
      this._expRamp(popOsc.frequency, 46, t0 + 0.052);
      const popGain = this.ctx.createGain();
      this._setVal(popGain.gain, 0.14, t0);
      this._expRamp(popGain.gain, 0.001, t0 + 0.056);

      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseWhiteBuf;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.value = this._clampFreq(360 + Math.random() * 340);
      flt.Q.value = 1.85;

      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.15, t0);
      this._expRamp(g.gain, 0.001, t0 + 0.064);

      const pan = this._createPanner((Math.random() - 0.5) * 0.42);

      popOsc.connect(popGain);
      popGain.connect(pan);
      src.connect(flt);
      flt.connect(g);
      g.connect(pan);
      pan.connect(this.engineBus);

      src.onended = () => {
        try { pan.disconnect(); } catch (_) {}
      };
      popOsc.start(t0);
      src.start(t0);
      popOsc.stop(t0 + 0.060);
      src.stop(t0 + 0.070);
    }
  }

  playOvertakeWhoosh(relSpeedKmh = 40) {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    const rel = Math.max(10, this._num(relSpeedKmh, 40));
    const intensity = Math.min(1.0, Math.max(0.28, rel / 80));

    const side = this._overtakePanFlip;
    this._overtakePanFlip = -this._overtakePanFlip;
    const panner = this._createPanner(side * 0.65);
    if (panner.pan) {
      this._setVal(panner.pan, side * 0.68, now);
      this._linRamp(panner.pan, -side * 0.68, now + 0.36);
    }

    const src = this.ctx.createBufferSource();
    src.buffer = this._noisePinkBuf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.Q.value = 2.0;
    this._setVal(flt.frequency, 960, now);
    this._expRamp(flt.frequency, 155, now + 0.35);

    const dopplerOsc = this.ctx.createOscillator();
    dopplerOsc.type = 'sawtooth';
    this._setVal(dopplerOsc.frequency, 495, now);
    this._expRamp(dopplerOsc.frequency, 215, now + 0.35);
    const dopplerGain = this.ctx.createGain();
    dopplerGain.gain.value = 0.24;

    const g = this.ctx.createGain();
    this._setVal(g.gain, 0.002, now);
    this._linRamp(g.gain, 0.23 * intensity, now + 0.095);
    this._expRamp(g.gain, 0.001, now + 0.37);

    src.connect(flt);
    dopplerOsc.connect(dopplerGain);
    dopplerGain.connect(flt);
    flt.connect(g);
    g.connect(panner);
    panner.connect(this.sfxBus);

    src.onended = () => {
      try { panner.disconnect(); } catch (_) {}
    };
    src.start(now);
    dopplerOsc.start(now);
    src.stop(now + 0.39);
    dopplerOsc.stop(now + 0.39);
  }

  // --------------------------------------------------------------------------
  // REPLAY TV BROADCAST TRACKSIDE DOPPLER FLY-BY & GRANDSTAND CROWD ROAR
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

    // True acoustic Doppler shift ratios: approach pitch-up -> pass apex -> receding pitch-down
    const approachRatio = cSound / Math.max(185, cSound - vMps * 0.85);
    const recedeRatio = cSound / (cSound + vMps * 0.85);
    const fBase = 320 + (vKmh / 330) * 105;
    const tPass = now + 0.40;
    const tEnd = now + 1.05;

    const side = this._flybyPanFlip;
    this._flybyPanFlip = -this._flybyPanFlip;
    const panner = this._createPanner(-0.86 * side);
    if (panner.pan) {
      this._setVal(panner.pan, -0.88 * side, now);
      this._linRamp(panner.pan, 0.0, tPass);
      this._linRamp(panner.pan, 0.88 * side, tEnd);
    }

    // 1. Screaming High-RPM F1 V10 Stack (1x + 2x + 2.5x Howl)
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.detune.value = 5;
    const osc5 = this.ctx.createOscillator();
    osc5.type = 'sawtooth';
    osc5.detune.value = -4;

    const ratios = [
      { osc: osc1, mult: 1.0, gain: 0.42 },
      { osc: osc2, mult: 2.0, gain: 0.28 },
      { osc: osc5, mult: 2.5, gain: 0.30 },
    ];

    const v10Lp = this.ctx.createBiquadFilter();
    v10Lp.type = 'lowpass';
    v10Lp.Q.value = 1.1;
    // Distance air-absorption opens wide at camera apex, closes as car blasts away
    this._setVal(v10Lp.frequency, 920, now);
    this._expRamp(v10Lp.frequency, 5800, tPass);
    this._expRamp(v10Lp.frequency, 780, tEnd);

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._shaperCurveTransient;

    const v10Gain = this.ctx.createGain();
    this._setVal(v10Gain.gain, 0.002, now);
    this._expRamp(v10Gain.gain, 0.29, tPass - 0.015);
    this._expRamp(v10Gain.gain, 0.001, tEnd);

    ratios.forEach(({ osc, mult, gain }) => {
      const g = this.ctx.createGain();
      g.gain.value = gain;
      this._setVal(osc.frequency, this._clampFreq(fBase * mult * (approachRatio * 0.96)), now);
      this._linRamp(osc.frequency, this._clampFreq(fBase * mult * approachRatio), tPass - 0.055);
      this._expRamp(osc.frequency, this._clampFreq(fBase * mult * recedeRatio), tPass + 0.085);
      this._expRamp(osc.frequency, this._clampFreq(fBase * mult * (recedeRatio * 0.93)), tEnd);
      osc.connect(g);
      g.connect(shaper);
      osc.start(now);
      osc.stop(tEnd + 0.02);
    });

    shaper.connect(v10Lp);
    v10Lp.connect(v10Gain);
    v10Gain.connect(panner);

    // 2. Sub-Bass Aerodynamic Wake Shockwave & Air Tear right at camera pass
    const subShock = this.ctx.createOscillator();
    subShock.type = 'triangle';
    this._setVal(subShock.frequency, 128, tPass - 0.08);
    this._expRamp(subShock.frequency, 34, tPass + 0.18);
    const subGain = this.ctx.createGain();
    this._setVal(subGain.gain, 0.002, tPass - 0.08);
    this._linRamp(subGain.gain, 0.30, tPass);
    this._expRamp(subGain.gain, 0.001, tPass + 0.22);
    subShock.connect(subGain);
    subGain.connect(panner);

    const wakeSrc = this.ctx.createBufferSource();
    wakeSrc.buffer = this._noisePinkBuf;
    const wakeBp = this.ctx.createBiquadFilter();
    wakeBp.type = 'bandpass';
    wakeBp.Q.value = 1.6;
    this._setVal(wakeBp.frequency, 1250, tPass - 0.10);
    this._expRamp(wakeBp.frequency, 165, tPass + 0.28);
    const wakeGain = this.ctx.createGain();
    this._setVal(wakeGain.gain, 0.002, tPass - 0.10);
    this._linRamp(wakeGain.gain, 0.24, tPass + 0.01);
    this._expRamp(wakeGain.gain, 0.001, tPass + 0.30);
    wakeSrc.connect(wakeBp);
    wakeBp.connect(wakeGain);
    wakeGain.connect(panner);

    panner.connect(this.sfxBus);
    osc1.onended = () => {
      try { panner.disconnect(); } catch (_) {}
    };

    subShock.start(tPass - 0.08);
    subShock.stop(tPass + 0.24);
    wakeSrc.start(tPass - 0.10);
    wakeSrc.stop(tPass + 0.32);
  }

  playCrowdCheer(intensity = 0.8) {
    if (!this.initialized || this.muted || !this.ctx) return;
    const nowMs = performance.now();
    if (nowMs - this._lastCrowdMs < 420) return;
    this._lastCrowdMs = nowMs;

    this._ensureRunning();
    const now = this.ctx.currentTime;
    const lvl = Math.max(0.15, Math.min(1.0, this._num(intensity, 0.8)));
    const dur = 1.95;

    // Stereo decorrelated stadium crowd swell (Left + Right grandstands)
    [-0.64, 0.64].forEach((panPos, idx) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noisePinkBuf;
      src.loop = true;

      // Vowel Formant 1 ("AAAH" stadium chest roar)
      const f1 = this.ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.Q.value = 1.55;
      this._setVal(f1.frequency, 540 + idx * 35, now);
      this._linRamp(f1.frequency, 730 + idx * 30, now + 0.45);
      this._expRamp(f1.frequency, 500, now + dur);

      // Vowel Formant 2 ("YEEAH" upper grandstand cheer + chorus modulation)
      const f2 = this.ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.Q.value = 1.85;
      this._setVal(f2.frequency, 1420 - idx * 50, now);
      this._linRamp(f2.frequency, 1890, now + 0.42);
      this._expRamp(f2.frequency, 1320, now + dur);

      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 5.4 + idx * 0.9;
      const lfoDepth = this.ctx.createGain();
      lfoDepth.gain.value = 65;
      lfo.connect(lfoDepth);
      lfoDepth.connect(f2.frequency);

      const g = this.ctx.createGain();
      this._setVal(g.gain, 0.002, now);
      this._linRamp(g.gain, 0.16 * lvl, now + 0.28);
      this._linRamp(g.gain, 0.13 * lvl, now + 0.72);
      this._expRamp(g.gain, 0.001, now + dur);

      const panner = this._createPanner(panPos);
      src.connect(f1);
      src.connect(f2);
      f1.connect(g);
      f2.connect(g);
      g.connect(panner);
      panner.connect(this.sfxBus);

      src.onended = () => {
        try { panner.disconnect(); } catch (_) {}
      };
      lfo.start(now);
      src.start(now, idx * 0.85);
      lfo.stop(now + dur + 0.03);
      src.stop(now + dur + 0.03);
    });

    // High-frequency applause & stadium whistle shimmer
    const clapSrc = this.ctx.createBufferSource();
    clapSrc.buffer = this._noiseWhiteBuf;
    clapSrc.loop = true;
    const clapBp = this.ctx.createBiquadFilter();
    clapBp.type = 'bandpass';
    clapBp.frequency.value = 3300;
    clapBp.Q.value = 1.4;
    const clapGain = this.ctx.createGain();
    this._setVal(clapGain.gain, 0.001, now);
    this._linRamp(clapGain.gain, 0.048 * lvl, now + 0.25);
    this._expRamp(clapGain.gain, 0.001, now + dur * 0.92);
    clapSrc.connect(clapBp);
    clapBp.connect(clapGain);
    clapGain.connect(this.sfxBus);
    clapSrc.onended = () => {
      try { clapGain.disconnect(); } catch (_) {}
    };
    clapSrc.start(now);
    clapSrc.stop(now + dur);

    // Subtle distant grandstand air-horn / whistle on big moments
    if (lvl >= 0.65) {
      const horn = this.ctx.createOscillator();
      horn.type = 'triangle';
      const tH = now + 0.14;
      this._setVal(horn.frequency, 880, tH);
      this._linRamp(horn.frequency, 932.33, tH + 0.08);
      const hg = this.ctx.createGain();
      this._setVal(hg.gain, 0.001, tH);
      this._linRamp(hg.gain, 0.032 * lvl, tH + 0.04);
      this._expRamp(hg.gain, 0.001, tH + 0.55);
      const hp = this._createPanner(0.38);
      horn.connect(hg);
      hg.connect(hp);
      hp.connect(this.sfxBus);
      horn.onended = () => {
        try { hp.disconnect(); } catch (_) {}
      };
      horn.start(tH);
      horn.stop(tH + 0.58);
    }
  }

  // --------------------------------------------------------------------------
  // 1:1 AUTHENTIC 1982 NAMCO ARCADE WSG FANFARES & VICTORY JINGLES
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
          if (!isBass && this._namcoWsgBrassWave && typeof osc.setPeriodicWave === 'function') {
            osc.setPeriodicWave(this._namcoWsgBrassWave);
          } else {
            osc.type = isBass ? 'square' : 'sawtooth';
          }
          this._setVal(osc.frequency, this._clampFreq(freq), cursor);

          const flt = this.ctx.createBiquadFilter();
          flt.type = 'lowpass';
          flt.frequency.value = isBass ? 1400 : 3600;

          const g = this.ctx.createGain();
          const vAmp = baseGain * (voice.weight ?? 1.0);
          const noteOnDur = Math.max(0.02, d * gate);
          this._setVal(g.gain, 0.001, cursor);
          this._linRamp(g.gain, vAmp, cursor + 0.006);
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
    // Classic upbeat 1982 Namco "Prepare to Qualify!" WSG 3-voice brass fanfare
    const u = 0.115;
    this._scheduleNamcoVoices([
      {
        role: 'lead',
        weight: 1.0,
        pan: -0.12,
        notes: [
          [67, u, 0.75], [67, u, 0.75], [67, u, 0.75], // G4 triplet pickup
          [72, u * 3, 0.90],                            // C5
          [76, u * 1.5, 0.82], [79, u * 1.5, 0.82],     // E5, G5
          [84, u * 3, 0.92],                            // C6
          [79, u * 1.5, 0.80], [76, u * 1.5, 0.80],     // G5, E5
          [79, u * 2, 0.85], [83, u * 1, 0.85],         // G5, B5
          [84, u * 5, 0.95],                            // Triumphant C6!
        ],
      },
      {
        role: 'harm',
        weight: 0.68,
        pan: 0.18,
        notes: [
          [62, u, 0.75], [62, u, 0.75], [62, u, 0.75], // D4
          [64, u * 3, 0.90],                            // E4
          [67, u * 1.5, 0.82], [72, u * 1.5, 0.82],     // G4, C5
          [76, u * 3, 0.92],                            // E5
          [72, u * 1.5, 0.80], [67, u * 1.5, 0.80],     // C5, G4
          [71, u * 2, 0.85], [74, u * 1, 0.85],         // B4, D5
          [76, u * 5, 0.95],                            // E5
        ],
      },
      {
        role: 'bass',
        weight: 0.62,
        pan: 0.0,
        notes: [
          [55, u, 0.70], [55, u, 0.70], [55, u, 0.70], // G3
          [48, u * 3, 0.85],                            // C3
          [52, u * 1.5, 0.78], [55, u * 1.5, 0.78],     // E3, G3
          [60, u * 3, 0.85],                            // C4
          [55, u * 3, 0.80],                            // G3
          [55, u * 2, 0.78], [55, u * 1, 0.78],         // G3
          [48, u * 5, 0.92],                            // C3
        ],
      },
    ], 0.15);
  }

  play1982RaceStartFanfare() {
    // Iconic 1982 Namco "Grand Prix Start" heroic brass heraldry fanfare
    const u = 0.12;
    this._scheduleNamcoVoices([
      {
        role: 'lead',
        weight: 1.0,
        pan: -0.15,
        notes: [
          [72, u, 0.72], [72, u, 0.72], [72, u, 0.72], [72, u * 3, 0.90], // C5 x4
          [68, u * 2, 0.86], [70, u * 2, 0.86],                            // Ab4, Bb4
          [72, u * 2, 0.84], [70, u * 1, 0.78], [72, u * 3, 0.92],         // C5, Bb4, C5
          [74, u * 1.5, 0.84], [76, u * 1.5, 0.84], [77, u * 1.5, 0.84], [79, u * 1.5, 0.88], // D5-E5-F5-G5
          [84, u * 5.5, 0.96],                                             // C6!
        ],
      },
      {
        role: 'harm',
        weight: 0.70,
        pan: 0.18,
        notes: [
          [64, u, 0.72], [64, u, 0.72], [64, u, 0.72], [64, u * 3, 0.90], // E4
          [63, u * 2, 0.86], [65, u * 2, 0.86],                            // Eb4, F4
          [64, u * 2, 0.84], [65, u * 1, 0.78], [67, u * 3, 0.92],         // E4, F4, G4
          [67, u * 1.5, 0.84], [69, u * 1.5, 0.84], [71, u * 1.5, 0.84], [74, u * 1.5, 0.88], // G4-A4-B4-D5
          [76, u * 5.5, 0.96],                                             // E5!
        ],
      },
      {
        role: 'bass',
        weight: 0.65,
        pan: 0.0,
        notes: [
          [48, u, 0.70], [48, u, 0.70], [48, u, 0.70], [48, u * 3, 0.86], // C3
          [44, u * 2, 0.84], [46, u * 2, 0.84],                            // Ab2, Bb2
          [48, u * 2, 0.80], [46, u * 1, 0.75], [48, u * 3, 0.88],         // C3, Bb2, C3
          [50, u * 3, 0.82], [55, u * 3, 0.85],                            // D3, G3
          [48, u * 5.5, 0.94],                                             // C3!
        ],
      },
    ], 0.155);
  }

  play1982CheckeredFlagJingle() {
    // Classic 1982 Namco Victory / High-Score Checkered Flag celebration jingle
    const u = 0.105;
    this._scheduleNamcoVoices([
      {
        role: 'lead',
        weight: 1.0,
        pan: -0.14,
        notes: [
          [72, u, 0.80], [76, u, 0.80], [79, u, 0.80], [84, u * 2, 0.90], // C5 E5 G5 C6
          [81, u, 0.78], [84, u * 2, 0.88], [79, u * 2, 0.85],            // A5 C6 G5
          [77, u, 0.80], [81, u, 0.80], [79, u, 0.80], [76, u, 0.80],     // F5 A5 G5 E5
          [74, u * 2, 0.85], [79, u * 2, 0.85],                            // D5 G5
          [76, u, 0.82], [79, u, 0.82], [84, u, 0.82], [88, u * 2, 0.92], // E5 G5 C6 E6
          [86, u, 0.82], [83, u, 0.82], [79, u, 0.82], [84, u * 6, 0.96], // D6 B5 G5 -> C6!
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

  playUIClick(accent = false) {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = accent ? 'triangle' : 'sine';
    this._setVal(osc.frequency, accent ? 880 : 640, now);
    this._expRamp(osc.frequency, accent ? 1320 : 430, now + 0.045);
    const g = this.ctx.createGain();
    this._setVal(g.gain, accent ? 0.125 : 0.10, now);
    this._expRamp(g.gain, 0.001, now + 0.052);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.onended = () => {
      try { g.disconnect(); } catch (_) {}
    };
    osc.start(now);
    osc.stop(now + 0.056);
  }

  // --------------------------------------------------------------------------
  // RACE EVENTS & ONE-SHOT PROCEDURAL MOTORSPORT SOUND EFFECTS
  // --------------------------------------------------------------------------
  playStartBeep(isGreenGo = false) {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    const voices = isGreenGo
      ? [
          { f: 880.0, type: 'triangle', gain: 0.25 },
          { f: 1318.51, type: 'sine', gain: 0.17 },
          { f: 1760.0, type: 'sine', gain: 0.10 },
        ]
      : [
          { f: 440.0, type: 'triangle', gain: 0.26 },
          { f: 880.0, type: 'sine', gain: 0.11 },
        ];
    const dur = isGreenGo ? 0.58 : 0.23;

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
    this._setVal(g.gain, 0.34, now);
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

    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseWhiteBuf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'peaking';
    flt.frequency.value = 880;
    flt.Q.value = 1.6;
    flt.gain.value = 9.5;

    const impact = this.ctx.createOscillator();
    impact.type = 'triangle';
    this._setVal(impact.frequency, 140, now);
    this._expRamp(impact.frequency, 36, now + 0.16);
    const ig = this.ctx.createGain();
    this._setVal(ig.gain, 0.34, now);
    this._expRamp(ig.gain, 0.001, now + 0.18);

    const g = this.ctx.createGain();
    this._setVal(g.gain, 0.38, now);
    this._expRamp(g.gain, 0.001, now + 0.30);

    src.connect(flt);
    flt.connect(g);
    g.connect(this.sfxBus);
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
    src.stop(now + 0.32);
    impact.stop(now + 0.19);
  }

  play1982ExplosionBoom() {
    if (!this.initialized || this.muted || !this.ctx) return;
    this._ensureRunning();
    const now = this.ctx.currentTime;
    const isRetro = this._currentVisualStyle === '1982_ARCADE';

    if (isRetro && this._noiseLfsrBuf) {
      // Authentic 1982 Namco 15-bit LFSR stepped-clock explosion + square sub-rumble!
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

    // 2026 Cinematic Fireball Detonation + subtle LFSR crunch grit
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    this._setVal(osc.frequency, 142, now);
    this._expRamp(osc.frequency, 24, now + 1.25);

    const src = this.ctx.createBufferSource();
    src.buffer = this._noisePinkBuf;
    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    this._setVal(lowpass.frequency, 1180, now);
    this._expRamp(lowpass.frequency, 96, now + 1.35);

    const g = this.ctx.createGain();
    this._setVal(g.gain, 0.56, now);
    this._expRamp(g.gain, 0.001, now + 1.38);

    osc.connect(lowpass);
    src.connect(lowpass);
    lowpass.connect(g);
    g.connect(this.sfxBus);

    src.onended = () => {
      try { g.disconnect(); } catch (_) {}
    };
    osc.start(now);
    src.start(now);
    osc.stop(now + 1.41);
    src.stop(now + 1.41);
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
      this._linRamp(g.gain, 0.24, t0 + 0.008);
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
    this._expRamp(flt.frequency, 115, now + 1.80);

    const g = this.ctx.createGain();
    this._setVal(g.gain, 0.02, now);
    this._linRamp(g.gain, 0.44, now + 0.08);
    this._linRamp(g.gain, 0.28, now + 0.45);
    this._linRamp(g.gain, 0.36, now + 0.72);
    this._expRamp(g.gain, 0.001, now + 1.85);

    src.connect(flt);
    flt.connect(g);
    g.connect(this.sfxBus);
    src.onended = () => {
      try { g.disconnect(); } catch (_) {}
    };
    src.start(now);
    src.stop(now + 1.90);
  }

  // --------------------------------------------------------------------------
  // SPEECH SYNTHESIS ("Prepare to Qualify!" & FIA Race Engineer Radio Squelch)
  // --------------------------------------------------------------------------
  speakAnnouncement(text, isRadio = false, force = false) {
    if (this.muted || !text || this.mixerLevels.voice <= 0.01) return;
    const nowMs = performance.now();
    if (!force && nowMs - this.lastSpeechTime < 3200) return;
    this.lastSpeechTime = nowMs;

    // Authentic F1 pit-wall PTT digital squelch tone + micro VHF click -> voiceBus
    if (isRadio && this.initialized && this.ctx) {
      this._ensureRunning();
      const t = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      this._setVal(osc.frequency, 1520, t);
      this._setVal(osc.frequency, 2040, t + 0.052);
      this._setVal(g.gain, 0.12, t);
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
      this._setVal(sg.gain, 0.06, t);
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
