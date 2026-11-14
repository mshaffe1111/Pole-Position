// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Dynamic Procedural Weather Engine, Drying Racing Groove, Skybox & Rain VFX
// ============================================================================

import * as THREE from 'three';
import { WEATHER_REGIMES } from './config.js';

const REGIME_ORDER = [
  'HOT_SUNNY',
  'OVERCAST_COOL',
  'LIGHT_DRIZZLE',
  'HEAVY_DOWNPOUR',
  'MONSOON_STORM',
];

export class WeatherSystem {
  constructor(scene) {
    this.scene = scene;
    this.dynamicEnabled = true;
    this.currentRegimeId = 'HOT_SUNNY';
    this.nextRegimeId = 'OVERCAST_COOL';
    this.regimeTimerSec = 55;
    this.regimeDurationSec = 55;
    this.rainWarnedForNext = false;

    this.grooveMoisture = 0.0;  // Ideal rubbered-in line dries 3x faster!
    this.offLineMoisture = 0.0; // Wet off-line lane
    this.ambientTemp = 30;
    this.lightningFlash = 0.0;
    this.nextLightningSec = 6.0;

    this._buildSkyAndLighting();
    this._buildRainParticles();
  }

  _buildSkyAndLighting() {
    this.ambientLight = new THREE.HemisphereLight(0xdbeeff, 0x283828, 0.95);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfff6e5, 2.2);
    this.sunLight.position.set(420, 680, -520);
    this.scene.add(this.sunLight);

    // Gradient Sky Dome Shader
    const skyGeo = new THREE.SphereGeometry(5200, 32, 20);
    this.skyUniforms = {
      topColor: { value: new THREE.Color(0x0d47a1) },
      bottomColor: { value: new THREE.Color(0x82c8ff) },
      flashBoost: { value: 0.0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float flashBoost;
        varying vec3 vWorldPos;
        void main() {
          float h = clamp(normalize(vWorldPos).y * 1.45 + 0.08, 0.0, 1.0);
          vec3 col = mix(bottomColor, topColor, pow(h, 0.72));
          col += vec3(flashBoost * 0.85, flashBoost * 0.90, flashBoost * 1.0);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    this.scene.fog = new THREE.FogExp2(0x9ad2ff, 0.00022);
    this._curTop = new THREE.Color(0x0d47a1);
    this._curBot = new THREE.Color(0x82c8ff);
    this._curFog = new THREE.Color(0x9ad2ff);
  }

  _buildRainParticles() {
    const count = 1400;
    const positions = new Float32Array(count * 6); // 2 vertices per rain streak
    this.rainDrops = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 90;
      const y = Math.random() * 34;
      const z = (Math.random() - 0.5) * 90;
      this.rainDrops.push({ x, y, z, speed: 34 + Math.random() * 16 });
      const idx = i * 6;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
      positions[idx + 3] = x + 0.3;
      positions[idx + 4] = y - 1.5;
      positions[idx + 5] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xcbe6ff,
      transparent: true,
      opacity: 0.55,
    });
    this.rainLines = new THREE.LineSegments(geo, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.scene.add(this.rainLines);
  }

  configureForSession(mode, weatherPreset) {
    this.lightningFlash = 0;
    this.rainWarnedForNext = false;

    if (mode === '1982_ORIGINAL') {
      this.dynamicEnabled = false;
      this.currentRegimeId = 'HOT_SUNNY';
      this.nextRegimeId = 'HOT_SUNNY';
      this.grooveMoisture = 0.0;
      this.offLineMoisture = 0.0;
      this.ambientTemp = 30;
      return;
    }

    if (weatherPreset === 'DYNAMIC') {
      this.dynamicEnabled = true;
      const starters = ['HOT_SUNNY', 'OVERCAST_COOL', 'LIGHT_DRIZZLE'];
      this.currentRegimeId = starters[Math.floor(Math.random() * starters.length)];
      this.nextRegimeId = this._pickNextRegime(this.currentRegimeId);
      this.regimeDurationSec = 48 + Math.random() * 24;
      this.regimeTimerSec = this.regimeDurationSec;
    } else {
      this.dynamicEnabled = false;
      this.currentRegimeId = WEATHER_REGIMES[weatherPreset] ? weatherPreset : 'HOT_SUNNY';
      this.nextRegimeId = this.currentRegimeId;
      this.regimeTimerSec = 9999;
    }

    const reg = WEATHER_REGIMES[this.currentRegimeId];
    const initW = (reg.moistureMin + reg.moistureMax) * 0.5;
    this.grooveMoisture = initW;
    this.offLineMoisture = initW;
    this.ambientTemp = reg.ambientTemp;
  }

  _pickNextRegime(curId) {
    const idx = REGIME_ORDER.indexOf(curId);
    const step = Math.random() < 0.58 ? 1 : -1;
    const nextIdx = Math.max(0, Math.min(REGIME_ORDER.length - 1, idx + step));
    if (nextIdx === idx) {
      return REGIME_ORDER[Math.min(REGIME_ORDER.length - 1, idx + 1)] || 'HOT_SUNNY';
    }
    return REGIME_ORDER[nextIdx];
  }

  // Ideal racing line lateral position for rubbered-in 3x drying calculation
  getIdealLateralOffset(curvature) {
    if (Math.abs(curvature) < 0.05) return -1.2;
    // Turn right (+k) -> apex is on +right; Turn left (-k) -> apex is on -right
    return Math.sign(curvature) * 4.8;
  }

  getMoistureAt(curvature, lateralOffset) {
    const ideal = this.getIdealLateralOffset(curvature);
    const distFromGroove = Math.abs(lateralOffset - ideal);
    const offBlend = Math.max(0, Math.min(1, (distFromGroove - 1.6) / 3.2));
    return this.grooveMoisture + (this.offLineMoisture - this.grooveMoisture) * offBlend;
  }

  update(dt, cameraPos, visualStyle, callbacks = {}) {
    const curReg = WEATHER_REGIMES[this.currentRegimeId];
    const nextReg = WEATHER_REGIMES[this.nextRegimeId];

    // Advance dynamic weather state machine
    if (this.dynamicEnabled) {
      this.regimeTimerSec -= dt;

      // Engineer forecast callout ~2 laps (~100s or 22s before transition) before rain arrives
      const curRain = curReg.rainRate > 0.005;
      const nextRain = nextReg.rainRate > 0.005;
      if (!curRain && nextRain && !this.rainWarnedForNext && this.regimeTimerSec < 28) {
        this.rainWarnedForNext = true;
        if (callbacks.onEngineerRadio) {
          callbacks.onEngineerRadio('Rain starting in 2 laps! Check Intermediates strategy.');
        }
      }

      if (this.regimeTimerSec <= 0) {
        this.currentRegimeId = this.nextRegimeId;
        this.nextRegimeId = this._pickNextRegime(this.currentRegimeId);
        this.regimeDurationSec = 46 + Math.random() * 28;
        this.regimeTimerSec = this.regimeDurationSec;
        this.rainWarnedForNext = false;
      }
    }

    const activeReg = WEATHER_REGIMES[this.currentRegimeId];
    this.ambientTemp += (activeReg.ambientTemp - this.ambientTemp) * Math.min(1, dt * 0.4);

    // Evolve Track Moisture (W): Rain wets full surface; when rain stops, ideal groove dries 3x faster!
    if (activeReg.rainRate > 0.004) {
      const targetMax = activeReg.moistureMax;
      this.grooveMoisture = Math.min(targetMax, this.grooveMoisture + activeReg.rainRate * 0.85 * dt);
      this.offLineMoisture = Math.min(targetMax, this.offLineMoisture + activeReg.rainRate * 1.05 * dt);
    } else {
      const minFloor = activeReg.moistureMin;
      const baseDry = activeReg.dryRate;
      // 3x faster drying on the rubbered-in ideal racing groove!
      this.grooveMoisture = Math.max(minFloor, this.grooveMoisture - baseDry * 3.0 * dt);
      this.offLineMoisture = Math.max(minFloor, this.offLineMoisture - baseDry * 1.0 * dt);
    }

    // Monsoon Lightning Flashes
    if (activeReg.hasLightning) {
      this.nextLightningSec -= dt;
      if (this.nextLightningSec <= 0) {
        this.lightningFlash = 1.0;
        this.nextLightningSec = 4.5 + Math.random() * 8.5;
        if (callbacks.onThunder) callbacks.onThunder();
      }
    }
    if (this.lightningFlash > 0) {
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 4.2);
    }

    // Smoothly blend Skybox, Sun & Fog colors
    const isArcade = visualStyle === '1982_ARCADE';
    const targetTop = new THREE.Color(isArcade && this.grooveMoisture < 0.2 ? 0x0038d8 : activeReg.skyTop);
    const targetBot = new THREE.Color(isArcade && this.grooveMoisture < 0.2 ? 0x68b8ff : activeReg.skyHorizon);
    const targetFog = new THREE.Color(activeReg.fogColor);

    const lerpRate = Math.min(1, dt * 1.5);
    this._curTop.lerp(targetTop, lerpRate);
    this._curBot.lerp(targetBot, lerpRate);
    this._curFog.lerp(targetFog, lerpRate);

    this.skyUniforms.topColor.value.copy(this._curTop);
    this.skyUniforms.bottomColor.value.copy(this._curBot);
    this.skyUniforms.flashBoost.value = this.lightningFlash;

    this.skyDome.position.copy(cameraPos);
    this.scene.fog.color.copy(this._curFog);
    this.scene.fog.density += (activeReg.fogDensity * 0.36 - this.scene.fog.density) * lerpRate;

    this.sunLight.intensity = activeReg.sunIntensity + this.lightningFlash * 3.5;
    this.ambientLight.intensity = activeReg.ambientIntensity + this.lightningFlash * 1.2;

    // Update 3D Rain Particles around Camera
    const raining = activeReg.rainRate > 0.005;
    this.rainLines.visible = raining;
    if (raining) {
      const intensity = Math.min(1, activeReg.rainRate / 0.05);
      this.rainMat.opacity = 0.25 + intensity * 0.55;
      const posAttr = this.rainLines.geometry.attributes.position;
      const arr = posAttr.array;

      for (let i = 0; i < this.rainDrops.length; i++) {
        const d = this.rainDrops[i];
        d.y -= d.speed * (0.75 + intensity * 0.55) * dt;
        if (d.y < -4) {
          d.y = 28 + Math.random() * 8;
          d.x = (Math.random() - 0.5) * 85;
          d.z = (Math.random() - 0.5) * 85;
        }
        const wx = cameraPos.x + d.x;
        const wy = cameraPos.y + d.y;
        const wz = cameraPos.z + d.z;
        const idx = i * 6;
        arr[idx] = wx;
        arr[idx + 1] = wy;
        arr[idx + 2] = wz;
        arr[idx + 3] = wx + 0.22;
        arr[idx + 4] = wy - (1.1 + intensity * 1.3);
        arr[idx + 5] = wz + 0.15;
      }
      posAttr.needsUpdate = true;
    }
  }

  getForecastSummary() {
    const cur = WEATHER_REGIMES[this.currentRegimeId];
    const nxt = WEATHER_REGIMES[this.nextRegimeId];
    return {
      current: cur,
      next: nxt,
      etaSec: Math.max(0, Math.round(this.regimeTimerSec)),
      grooveMoisture: this.grooveMoisture,
      offLineMoisture: this.offLineMoisture,
    };
  }
}
