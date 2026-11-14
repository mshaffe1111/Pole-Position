// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Procedural Web Audio API Synthesizer & Voice / Race Engineer Radio Engine
// ============================================================================

export class ProceduralAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.initialized = false;
    this.lastSpeechTime = 0;

    // Continuous synthesis nodes
    this.masterGain = null;
    this.engineGain = null;
    this.oscSaw = null;
    this.oscTri = null;
    this.oscSub = null;
    this.engineFilter = null;

    this.skidGain = null;
    this.curbGain = null;
    this.curbOsc = null;
    this.rainGain = null;
  }

  unlock() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.connect(this.ctx.destination);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0.0 : 0.48;
    this.masterGain.connect(comp);

    this._setupEngineLoops();
    this._setupSurfaceNoiseLoops();
    this.initialized = true;
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0.0 : 0.48, this.ctx.currentTime, 0.04);
    }
    if (this.muted && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  _createNoiseBuffer(seconds = 2.0, pink = true) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (pink) {
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.96300 * b1 + white * 0.296516;
        b2 = 0.57000 * b2 + white * 1.052691;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.22;
      } else {
        data[i] = white * 0.6;
      }
    }
    return buf;
  }

  _setupEngineLoops() {
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'bandpass';
    this.engineFilter.frequency.value = 380;
    this.engineFilter.Q.value = 1.35;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    this.oscSaw = this.ctx.createOscillator();
    this.oscSaw.type = 'sawtooth';
    this.oscSaw.frequency.value = 95;

    this.oscTri = this.ctx.createOscillator();
    this.oscTri.type = 'triangle';
    this.oscTri.frequency.value = 190;

    this.oscSub = this.ctx.createOscillator();
    this.oscSub.type = 'square';
    this.oscSub.frequency.value = 47.5;

    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.26;

    this.oscSaw.connect(this.engineFilter);
    this.oscTri.connect(this.engineFilter);
    this.oscSub.connect(subGain);
    subGain.connect(this.engineFilter);

    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.oscSaw.start();
    this.oscTri.start();
    this.oscSub.start();
  }

  _setupSurfaceNoiseLoops() {
    const noiseBuf = this._createNoiseBuffer(2.0, true);

    // Tire Scrubbing / Skidding high-frequency filtered noise
    const skidSrc = this.ctx.createBufferSource();
    skidSrc.buffer = noiseBuf;
    skidSrc.loop = true;
    const skidFilter = this.ctx.createBiquadFilter();
    skidFilter.type = 'bandpass';
    skidFilter.frequency.value = 1550;
    skidFilter.Q.value = 3.2;
    this.skidGain = this.ctx.createGain();
    this.skidGain.gain.value = 0.0;
    skidSrc.connect(skidFilter);
    skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.masterGain);
    skidSrc.start();

    // 80Hz Square-Wave Curb Rumble Buzz
    this.curbOsc = this.ctx.createOscillator();
    this.curbOsc.type = 'square';
    this.curbOsc.frequency.value = 80;
    const curbFilter = this.ctx.createBiquadFilter();
    curbFilter.type = 'lowpass';
    curbFilter.frequency.value = 220;
    this.curbGain = this.ctx.createGain();
    this.curbGain.gain.value = 0.0;
    this.curbOsc.connect(curbFilter);
    curbFilter.connect(this.curbGain);
    this.curbGain.connect(this.masterGain);
    this.curbOsc.start();

    // Wet Rain / Spray hiss loop
    const rainSrc = this.ctx.createBufferSource();
    rainSrc.buffer = noiseBuf;
    rainSrc.loop = true;
    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 900;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0.0;
    rainSrc.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.masterGain);
    rainSrc.start();
  }

  updateContinuous(playerCar, moistureW, isRacingOrQuali, visualStyle) {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;

    if (!isRacingOrQuali || playerCar.exploded) {
      this.engineGain.gain.setTargetAtTime(0.0, now, 0.05);
      this.skidGain.gain.setTargetAtTime(0.0, now, 0.05);
      this.curbGain.gain.setTargetAtTime(0.0, now, 0.03);
      this.rainGain.gain.setTargetAtTime(0.0, now, 0.1);
      return;
    }

    const rpm = Math.max(1500, playerCar.rpm || 2000);
    const isArcade = visualStyle === '1982_ARCADE';
    const baseFreq = isArcade ? 48 + (rpm / 12500) * 235 : 58 + (rpm / 12500) * 310;
    const slipBoost = playerCar.inSlipstream ? 1.05 : 1.0;

    this.oscSaw.frequency.setTargetAtTime(baseFreq * slipBoost, now, 0.025);
    this.oscTri.frequency.setTargetAtTime(baseFreq * (playerCar.overRevTimer > 0 ? 2.65 : 2.01), now, 0.025);
    this.oscSub.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.025);

    const load = 0.45 + playerCar.throttleInput * 0.55 + (playerCar.overRevTimer > 0 ? 0.35 : 0);
    this.engineFilter.frequency.setTargetAtTime(240 + (rpm / 13000) * 1950 * load, now, 0.03);
    this.engineGain.gain.setTargetAtTime(0.18 + load * 0.14, now, 0.04);

    // Tire scrub / skid
    const skidVol = Math.min(0.28, (playerCar.skidIntensity || 0) * 0.28);
    this.skidGain.gain.setTargetAtTime(skidVol, now, 0.04);

    // 80Hz Curb Rumble
    const curbVol = playerCar.onCurb && playerCar.speedKmh > 25 ? 0.18 : 0.0;
    this.curbOsc.frequency.setTargetAtTime(72 + (playerCar.speedKmh / 300) * 24, now, 0.02);
    this.curbGain.gain.setTargetAtTime(curbVol, now, 0.02);

    // Rain / wet spray ambiance
    const rainVol = moistureW > 0.12 ? Math.min(0.16, moistureW * 0.12 + (playerCar.speedKmh / 320) * moistureW * 0.08) : 0.0;
    this.rainGain.gain.setTargetAtTime(rainVol, now, 0.08);
  }

  // --------------------------------------------------------------------------
  // ONE-SHOT PROCEDURAL SOUND EFFECTS
  // --------------------------------------------------------------------------
  playStartBeep(isGreenGo = false) {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isGreenGo ? 987.77 : 493.88, now);
    g.gain.setValueAtTime(0.32, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (isGreenGo ? 0.55 : 0.22));
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (isGreenGo ? 0.58 : 0.24));
  }

  playBackfirePop() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._createNoiseBuffer(0.12, false);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.30, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.masterGain);
    src.start(now);
  }

  playHydroplaneSplash() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._createNoiseBuffer(0.45, false);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(1900, now);
    flt.frequency.exponentialRampToValueAtTime(420, now + 0.42);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.36, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.masterGain);
    src.start(now);
  }

  playWingDamageCrunch() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._createNoiseBuffer(0.32, false);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'peaking';
    flt.frequency.value = 780;
    flt.gain.value = 10;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.42, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.masterGain);
    src.start(now);
  }

  play1982ExplosionBoom() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;

    // Low-frequency sub-bass drop + classic arcade noise blast
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(22, now + 1.25);

    const src = this.ctx.createBufferSource();
    src.buffer = this._createNoiseBuffer(1.4, true);
    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(950, now);
    lowpass.frequency.exponentialRampToValueAtTime(110, now + 1.35);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.62, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.38);

    osc.connect(lowpass);
    src.connect(lowpass);
    lowpass.connect(g);
    g.connect(this.masterGain);

    osc.start(now);
    src.start(now);
    osc.stop(now + 1.4);
  }

  playWheelGunWhir() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    for (let burst = 0; burst < 3; burst++) {
      const t0 = now + burst * 0.28;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(420, t0);
      osc.frequency.linearRampToValueAtTime(960, t0 + 0.16);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.18, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.19);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.20);
    }
  }

  playYellowFlagChime() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    [659.25, 523.25].forEach((freq, i) => {
      const t0 = now + i * 0.15;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t0);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.26, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.24);
    });
  }

  playThunderRumble() {
    if (!this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._createNoiseBuffer(1.8, true);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 180;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.75);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.masterGain);
    src.start(now);
  }

  // --------------------------------------------------------------------------
  // SPEECH SYNTHESIS ("Prepare to Qualify!" & F1 Race Engineer Radio Callouts)
  // --------------------------------------------------------------------------
  speakAnnouncement(text, isRadio = false, force = false) {
    if (this.muted) return;
    const nowMs = performance.now();
    if (!force && nowMs - this.lastSpeechTime < 3200) return;
    this.lastSpeechTime = nowMs;

    // F1 Pit-Wall Radio two-tone squelch beep before voice!
    if (isRadio && this.initialized && this.ctx) {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1480, t);
      osc.frequency.setValueAtTime(1920, t + 0.055);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.13);
    }

    if ('speechSynthesis' in window) {
      try {
        if (force) window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = isRadio ? 1.08 : 0.96;
        utter.pitch = isRadio ? 0.96 : 1.05;
        utter.volume = 0.95;
        window.speechSynthesis.speak(utter);
      } catch (_) {
        // Ignore if SpeechSynthesis restricted on device
      }
    }
  }
}
