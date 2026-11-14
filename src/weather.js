// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// AAA Fixed Per-Race Random Weather, Volumetric FBM Cloud & Corona Sky Shader,
// 3-Layer Parallax 3D Mountain Vistas, Dynamic HDR EnvMap & Real-Time Shadows
// ============================================================================

import * as THREE from 'three';
import { WEATHER_REGIMES } from './config.js';

const RANDOM_POOL_DAY = [
  { id: 'HOT_SUNNY',     weight: 0.30 },
  { id: 'GOLDEN_SUNSET', weight: 0.24 },
  { id: 'OVERCAST_COOL', weight: 0.18 },
  { id: 'LIGHT_DRIZZLE', weight: 0.16 },
  { id: 'MONSOON_STORM', weight: 0.12 },
];

const RANDOM_POOL_1982 = [
  { id: 'HOT_SUNNY',     weight: 0.55 },
  { id: 'GOLDEN_SUNSET', weight: 0.30 },
  { id: 'OVERCAST_COOL', weight: 0.15 },
];

const VISTA_CENTER_X = 210;
const VISTA_CENTER_Z = 230;

function weightedPick(pool) {
  let r = Math.random();
  for (const item of pool) {
    r -= item.weight;
    if (r <= 0) return item.id;
  }
  return pool[0].id;
}

export class WeatherSystem {
  constructor(scene, renderer = null) {
    this.scene = scene;
    this.renderer = renderer;
    this.pmremGenerator = renderer ? new THREE.PMREMGenerator(renderer) : null;
    if (this.pmremGenerator) {
      this.pmremGenerator.compileEquirectangularShader();
    }
    this._currentEnvRT = null;

    this.currentRegimeId = 'HOT_SUNNY';
    this.activeTheme = 'FUJI';
    this.isNightActive = false;
    this.grooveMoisture = 0.0;
    this.offLineMoisture = 0.0;
    this.ambientTemp = 30;
    this.lightningFlash = 0.0;
    this.nextLightningSec = 6.5;
    this.elapsedSkySec = 0.0;
    this._sunOffset = new THREE.Vector3(65, 115, 78);
    this._baseSunIntensity = 3.40;
    this._baseAmbientIntensity = 0.62;
    this._visorAccum = 0.0;
    this._visorTearOffProgress = 1.2;
    this._prevCamYaw = null;
    this._smoothedYawSlip = 0.0;

    this._buildSkyAndLighting();
    this._buildParallaxMountainVistas();
    this._buildRainParticles();
    this._buildCockpitVisorRain();
  }

  _buildSkyAndLighting() {
    // High-contrast Hemisphere Sky + Ground bounce (45% lower fill so directional sun shadows pop crisply!)
    this.ambientLight = new THREE.HemisphereLight(0xdff0ff, 0x2a332a, 0.62);
    this.scene.add(this.ambientLight);

    // Primary Golden/Daylight Sun with Tightly Framed 2048x2048 Real-Time Soft Shadows!
    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 3.40);
    this.sunLight.position.set(65, 115, 78);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 6;
    this.sunLight.shadow.camera.far = 245;
    const d = 35;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.updateProjectionMatrix();
    this.sunLight.shadow.bias = -0.00024;
    this.sunLight.shadow.normalBias = 0.016;
    this.sunLight.shadow.radius = 1.45;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Subtle Secondary Sky-Bounce Fill Light (45% lower so shadow side retains rich 3D sculpting)
    this.fillLight = new THREE.DirectionalLight(0xd6e8ff, 0.46);
    this.fillLight.position.set(-340, 360, -310);
    this.scene.add(this.fillLight);

    // Subtle Warm Rim/Cross Fill Light for architectural & bodywork edge definition
    this.rimLight = new THREE.DirectionalLight(0xffe8cc, 0.24);
    this.rimLight.position.set(-230, 185, 340);
    this.scene.add(this.rimLight);

    // AAA Atmospheric Rayleigh/Mie Sky Dome Shader
    // (Anisotropic Sun Horizon Blush + 3-Ring Solar Corona + Domain-Warped FBM Clouds + Anti-Aliased Stars)
    const skyGeo = new THREE.SphereGeometry(5600, 64, 40);
    this.skyUniforms = {
      zenithColor:      { value: new THREE.Color(0x0e5ce0) },
      midColor:         { value: new THREE.Color(0x459bf7) },
      horizonColor:     { value: new THREE.Color(0xc7e8ff) },
      antiHorizonColor: { value: new THREE.Color(0x9bd2ff) },
      groundFogColor:   { value: new THREE.Color(0xb0dbff) },
      sunColor:         { value: new THREE.Color(0xfff7e6) },
      themeHorizonTint: { value: new THREE.Color(0xd8eeff) },
      sunDir:           { value: new THREE.Vector3(0.42, 0.48, 0.77).normalize() },
      uTime:            { value: 0.0 },
      cloudCover:       { value: 0.30 },
      stormDarkness:    { value: 0.0 },
      sunsetAmount:     { value: 0.0 },
      nightAmount:      { value: 0.0 },
      skyRadianceBoost: { value: 1.20 },
      flashBoost:       { value: 0.0 },
      retroMode:        { value: 0.0 },
    };

    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = position;
          // Lock sky sphere strictly to camera eye in rotation-only view space at safe mid-frustum radius
          // so it NEVER lags camera movement and NEVER clips near/far planes!
          vec4 mvPos = vec4(mat3(viewMatrix) * (position * 0.1), 1.0);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 zenithColor;
        uniform vec3 midColor;
        uniform vec3 horizonColor;
        uniform vec3 antiHorizonColor;
        uniform vec3 groundFogColor;
        uniform vec3 sunColor;
        uniform vec3 themeHorizonTint;
        uniform vec3 sunDir;
        uniform float uTime;
        uniform float cloudCover;
        uniform float stormDarkness;
        uniform float sunsetAmount;
        uniform float nightAmount;
        uniform float skyRadianceBoost;
        uniform float flashBoost;
        uniform float retroMode;
        varying vec3 vLocalPos;

        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }

        vec2 hash22(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.xx + p3.yz) * p3.zy);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.52;
          mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
          for (int i = 0; i < 5; i++) {
            v += a * noise2(p);
            p = rot * p * 2.06;
            a *= 0.5;
          }
          return v;
        }

        float starLayer(vec2 uv, float timeSec, float densityThresh, out vec3 tint) {
          vec2 cell = floor(uv);
          vec2 gv = fract(uv) - 0.5;
          vec2 rnd = hash22(cell);
          tint = mix(vec3(0.76, 0.88, 1.0), vec3(1.0, 0.91, 0.76), rnd.y);
          if (rnd.x < densityThresh) return 0.0;
          vec2 offset = (rnd - 0.5) * 0.56;
          float dist = length(gv - offset);
          float core = smoothstep(0.16, 0.015, dist);
          float twinkle = 0.64 + 0.36 * sin(timeSec * (2.2 + rnd.y * 3.8) + rnd.x * 95.0);
          return core * twinkle;
        }

        void main() {
          vec3 d = normalize(vLocalPos);
          vec3 sDir = normalize(sunDir);
          float h = clamp(d.y, 0.0, 1.0);

          // Azimuthal alignment toward solar direction for anisotropic Mie horizon blush
          vec2 horizD = normalize(d.xz + vec2(1e-5));
          vec2 horizS = normalize(sDir.xz + vec2(1e-5));
          float sunAzimuth = clamp(dot(horizD, horizS) * 0.5 + 0.5, 0.0, 1.0);
          vec3 dirHorizon = mix(antiHorizonColor, horizonColor, pow(sunAzimuth, 1.28));
          dirHorizon = mix(dirHorizon, themeHorizonTint, 0.18);

          // 3-stop Rayleigh vertical sky gradient with HDR luminance boost (prevents sRGB->Linear ACES toe crush!)
          vec3 col = mix(dirHorizon, midColor, smoothstep(0.0, 0.34, h));
          col = mix(col, zenithColor, smoothstep(0.24, 0.88, h));
          col *= skyRadianceBoost;

          // Warm Mie atmospheric horizon scattering, twilight golden-rose band & solar horizon pillar bloom
          float horizonBand = pow(1.0 - abs(d.y), 4.8);
          vec3 mieTint = mix(dirHorizon * 1.24, sunColor * 1.18, 0.34 + sunsetAmount * 0.44);
          col = mix(col, mieTint, horizonBand * (0.50 + sunsetAmount * 0.30) * (1.0 - stormDarkness * 0.38));
          float horizonPillar = pow(sunAzimuth, 6.5) * pow(1.0 - h, 3.6) * (0.36 + sunsetAmount * 0.48) * (1.0 - cloudCover * 0.65);
          col += sunColor * horizonPillar * (1.0 - nightAmount * 0.55);

          // Crisp Dual-Scale Anti-Aliased Twinkling Starfield + Galactic Band at Night / Dusk
          if (nightAmount > 0.04 && d.y > 0.015) {
            float skyFade = smoothstep(0.015, 0.24, d.y) * nightAmount * (1.0 - cloudCover * 0.82);
            vec2 starProj = d.xz / (d.y + 0.36);

            vec3 tintA;
            float stA = starLayer(starProj * 78.0, uTime, 0.976, tintA);
            vec3 tintB;
            float stB = starLayer(starProj * 148.0 + vec2(19.3, -7.1), uTime * 0.8, 0.984, tintB);

            col += (tintA * stA * 1.35 + tintB * stB * 0.80) * skyFade;

            // Subtle night Milky Way dust glow & urban neon horizon wash
            float galaxy = fbm(starProj * 1.85 + vec2(1.4, -0.8));
            col += vec3(0.20, 0.14, 0.38) * galaxy * nightAmount * 0.16 * smoothstep(0.04, 0.55, d.y);
          }

          // Solar / Lunar Disc + 4-Ring Anisotropic Mie Corona & HDR Bloom Halo
          float sunDot = max(0.0, dot(d, sDir));
          float coronaHalo  = pow(sunDot, 2.8) * (0.10 + sunsetAmount * 0.12);
          float coronaWide  = pow(sunDot, 6.0) * (0.22 + sunsetAmount * 0.16);
          float coronaMid   = pow(sunDot, 38.0) * 0.48;
          float coronaTight = pow(sunDot, 210.0) * 0.88;
          float disc        = smoothstep(0.99900, 0.99968, sunDot);
          float clearVis    = max(0.08, 1.0 - cloudCover * 0.76);
          float nightSunDim = mix(1.0, 0.34, nightAmount);
          col += sunColor * (coronaHalo + coronaWide + coronaMid + coronaTight + disc * 2.55) * clearVis * nightSunDim;

          // Multi-Layer Volumetric Domain-Warped Cumulus & High Cirrus Cloud Deck
          if (d.y > 0.008 && cloudCover > 0.02) {
            vec2 windLow = vec2(uTime * 0.0044, uTime * 0.0021);
            vec2 baseUv = (d.xz / (d.y + 0.165)) * 1.18 + windLow;

            // Organic domain warp for billowing cumulus edges
            float warpX = noise2(baseUv * 1.6 + vec2(4.2, 1.3));
            float warpY = noise2(baseUv * 1.6 + vec2(-2.7, 5.1));
            vec2 cloudUv = baseUv + (vec2(warpX, warpY) - 0.5) * 0.24;

            float n = fbm(cloudUv);
            float detail = fbm(cloudUv * 2.85 - windLow * 0.6);
            float billow = mix(n, n * 0.74 + detail * 0.34, 0.65);

            float thresh = mix(0.65, 0.24, cloudCover);
            float cMask = smoothstep(thresh, thresh + 0.24, billow) * smoothstep(0.008, 0.12, d.y);

            // Directional sunward self-shadowing & Henyey-Greenstein silver/gold rim lining
            vec2 sunStep = normalize(sDir.xz + vec2(0.001)) * 0.082;
            float nLit = fbm(cloudUv + sunStep);
            float lightGrad = clamp((billow - nLit) * 3.8 + 0.56, 0.0, 1.0);
            float hgForward = pow(sunDot, 4.0) * (0.68 + sunsetAmount * 0.44);
            float silverRim = smoothstep(thresh + 0.16, thresh + 0.008, billow) * (0.28 + pow(sunDot, 2.2) * 0.78);

            vec3 cloudBright = mix(vec3(0.98, 0.99, 1.0), sunColor, 0.46 + sunsetAmount * 0.40) * (1.12 + hgForward);
            vec3 cloudDark   = mix(midColor * 0.72, vec3(0.18, 0.23, 0.34), clamp(cloudCover * 0.55 + stormDarkness * 0.42, 0.0, 1.0));

            if (sunsetAmount > 0.15) {
              cloudDark = mix(cloudDark, vec3(0.58, 0.32, 0.52), sunsetAmount * 0.62);
            }
            if (nightAmount > 0.4) {
              cloudBright = vec3(0.36, 0.26, 0.58);
              cloudDark   = vec3(0.08, 0.10, 0.20);
            }

            vec3 cloudCol = mix(cloudDark, cloudBright, lightGrad) + sunColor * silverRim * (1.0 - nightAmount * 0.65);

            // Internal storm sheet-lightning veins illuminating storm clouds!
            if (flashBoost > 0.005) {
              float vein = pow(clamp(1.0 - abs(billow - 0.54) * 4.5, 0.0, 1.0), 2.0);
              cloudCol += vec3(0.75, 0.86, 1.0) * flashBoost * (0.65 + vein * 1.55);
            }

            col = mix(col, cloudCol, cMask * 0.93);

            // Mid-altitude sunlit Altocumulus deck with crisp golden/silver rim-lighting
            vec2 altoUv = (d.xz / (d.y + 0.22)) * 1.95 + vec2(-uTime * 0.0032, uTime * 0.0026);
            float altoN = fbm(altoUv);
            float altoMask = smoothstep(thresh + 0.06, thresh + 0.28, altoN) * smoothstep(0.04, 0.26, d.y) * (1.0 - cMask * 0.72);
            float altoRim = smoothstep(thresh + 0.18, thresh + 0.05, altoN) * (0.35 + pow(sunDot, 2.0) * 0.65);
            vec3 altoCol = mix(cloudDark * 1.08, cloudBright * 1.06, 0.68) + sunColor * altoRim * 0.55;
            col = mix(col, altoCol, altoMask * 0.56);

            // High-altitude wispy Cirrus layer + sunlit ice-crystal rim sheen
            vec2 cirrusUv = (d.xz / (d.y + 0.28)) * vec2(2.4, 0.95) + vec2(uTime * 0.0068, -uTime * 0.0018);
            float cirrus = smoothstep(0.54, 0.85, fbm(cirrusUv));
            col += cloudBright * cirrus * (1.0 - cloudCover * 0.55) * smoothstep(0.08, 0.55, d.y) * 0.26;
          }

          // Smooth lower-hemisphere ground haze skirt so zero horizon seam ever appears
          if (d.y < 0.0) {
            col = mix(col, groundFogColor, smoothstep(0.0, -0.14, d.y));
          }

          // Optional 1982 Namco Arcade subtle vibrant sky punch
          if (retroMode > 0.5) {
            float luma = dot(col, vec3(0.299, 0.587, 0.114));
            col = mix(vec3(luma), col, 1.22);
          }

          // Ambient atmospheric flash during Monsoon lightning
          col += vec3(flashBoost * 0.52, flashBoost * 0.62, flashBoost * 0.78);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.skyDome.renderOrder = -1000;
    this.skyDome.frustumCulled = false;
    this.scene.add(this.skyDome);

    // Ultra-clear 75%-reduced atmospheric fog so pit garages, grandstands & alpine vistas stay vibrant!
    this.scene.fog = new THREE.FogExp2(0xb0dbff, 0.00004);
  }

  // --------------------------------------------------------------------------
  // DYNAMIC OUTDOOR HDR ENVIRONMENT MAP GENERATOR (PMREM)
  // Crisp overhead clearcoat specular ribbons + dark charcoal tarmac bounce so
  // crimson/team car paint stays deeply saturated (zero milky sky bleach!).
  // Disposes all temporary studio geometries/materials immediately (zero leaks).
  // --------------------------------------------------------------------------
  _bakeDynamicHDREnvironment(skyReg, theme, isNight) {
    if (!this.pmremGenerator) return;

    const envScene = new THREE.Scene();
    const disposables = [];
    const trackDisp = (obj) => {
      disposables.push(obj);
      return obj;
    };

    const isSunset = skyReg.id === 'GOLDEN_SUNSET';
    const isStorm = skyReg.id === 'MONSOON_STORM' || skyReg.id === 'LIGHT_DRIZZLE';
    const sunDir = this.skyUniforms.sunDir.value.clone().normalize();

    // Dark charcoal asphalt ground bounce prevents diffuse sky bleach on lower bodywork & sidepods!
    let groundBounceHex = 0x0a0d12;
    if (isNight || theme === 'VEGAS') groundBounceHex = 0x05070e;
    else if (theme === 'MONACO') groundBounceHex = 0x091620;
    else if (theme === 'MONZA') groundBounceHex = 0x0d0f0c;
    else if (theme === 'SUZUKA' || theme === 'SILVERSTONE') groundBounceHex = 0x0b0f14;

    // 1. Controlled-Irradiance Sky Dome + Sharp Horizon Crease + Dark Asphalt Ground Bounce
    const domeGeo = trackDisp(new THREE.SphereGeometry(42, 32, 20));
    const domeMat = trackDisp(new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        cTop:    { value: new THREE.Color(skyReg.skyZenith) },
        cMid:    { value: new THREE.Color(skyReg.skyMid) },
        cBot:    { value: new THREE.Color(skyReg.skyHorizon).multiplyScalar(isNight ? 1.24 : 1.04) },
        cSun:    { value: new THREE.Color(skyReg.sunColor) },
        cGround: { value: new THREE.Color(groundBounceHex) },
        uSunDir: { value: sunDir },
        uBoost:  { value: isNight ? 1.18 : (isSunset ? 1.10 : (isStorm ? 1.06 : 1.04)) },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 cTop;
        uniform vec3 cMid;
        uniform vec3 cBot;
        uniform vec3 cSun;
        uniform vec3 cGround;
        uniform vec3 uSunDir;
        uniform float uBoost;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          if (d.y < 0.0) {
            // Sharp automotive horizon reflection crease fading rapidly into dark charcoal asphalt
            float roadGrad = pow(clamp(-d.y * 5.2, 0.0, 1.0), 0.72);
            vec3 gCol = mix(cBot * 0.48, cGround, roadGrad);
            gl_FragColor = vec4(gCol, 1.0);
          } else {
            vec3 c = mix(cBot, cMid, smoothstep(0.0, 0.30, d.y));
            c = mix(c, cTop, smoothstep(0.26, 0.92, d.y));
            float sDot = max(0.0, dot(d, normalize(uSunDir)));
            float horizonSheen = pow(1.0 - d.y, 8.0) * 0.24;
            c += cSun * (pow(sDot, 9.0) * 0.58 + horizonSheen);
            gl_FragColor = vec4(c * uBoost, 1.0);
          }
        }
      `,
    }));
    envScene.add(new THREE.Mesh(domeGeo, domeMat));

    // 2. Solar / Lunar Primary Specular Emitter aligned with true Sun Direction
    const sunInt = isNight ? 2.4 : (isSunset ? 4.2 : (isStorm ? 2.6 : 3.9));
    const sunDiscGeo = trackDisp(new THREE.SphereGeometry(4.2, 16, 16));
    const sunDiscMat = trackDisp(new THREE.MeshBasicMaterial({
      color: new THREE.Color(skyReg.sunColor).multiplyScalar(sunInt),
    }));
    const sunDisc = new THREE.Mesh(sunDiscGeo, sunDiscMat);
    sunDisc.position.copy(sunDir).multiplyScalar(32);
    envScene.add(sunDisc);

    // 3. Narrow High-Contrast Automotive Specular Softbox Ribbons (crisp clearcoat highlights, low diffuse area)
    const addRibbon = (w, h, d, hex, mult, x, y, z, ry = 0) => {
      const g = trackDisp(new THREE.BoxGeometry(w, h, d));
      const m = trackDisp(new THREE.MeshBasicMaterial({
        color: new THREE.Color(hex).multiplyScalar(mult),
      }));
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      envScene.add(mesh);
    };

    if (isNight || theme === 'VEGAS') {
      addRibbon(28, 1.6, 0.9, 0xff1493, 3.0,   0,  8,  26);
      addRibbon(28, 1.6, 0.9, 0x00f0ff, 3.0,   0, 10, -26);
      addRibbon(22, 1.5, 0.9, 0xffb300, 2.5, -25,  7,   0, Math.PI / 2);
      addRibbon(22, 1.4, 2.4, 0xf0f6ff, 2.6,   4, 28,   0);
    } else if (isSunset) {
      addRibbon(28, 1.8, 1.2, 0xff8c42, 2.6,  18,  7,  22, -0.6);
      addRibbon(24, 1.5, 2.6, 0xffe4c4, 2.2, -10, 26, -12,  0.3);
      addRibbon(20, 1.5, 1.0, 0x6f8eff, 1.7, -20, 12, -20,  0.7);
    } else {
      addRibbon(28, 1.5, 2.8, 0xffffff, isStorm ? 2.1 : 2.25, -10, 27, -12, 0.25);
      addRibbon(22, 1.3, 1.8, 0xe8f4ff, isStorm ? 1.8 : 1.85,  14, 18, -22, -0.4);
      addRibbon(22, 1.1, 1.6, 0xfff8eb, 1.75, -18, 14,  20,  0.5);
      if (theme === 'MONACO') {
        addRibbon(30, 1.8, 1.0, 0x00c8ff, 1.85, 0, 2.5, 28);
      }
    }

    const nextRT = this.pmremGenerator.fromScene(envScene, 0.024);
    for (const item of disposables) {
      item.dispose();
    }
    if (this._currentEnvRT) this._currentEnvRT.dispose();
    this._currentEnvRT = nextRT;
    this.scene.environment = nextRT.texture;
  }

  // --------------------------------------------------------------------------
  // 3-LAYER PARALLAX 3D MOUNTAIN & FOOTHILL VISTAS (360° AAA BIOME BACKDROP)
  // Layer 1: Rolling Foothills & Forest/Coastal Bluffs (r=1340..1920m)
  // Layer 2: Sculpted 3D Ridged Alpine Range with Snow/Rock Strata (r=2060..2960m)
  // Layer 3: Distant Atmospheric Horizon Peaks (r=3060..4020m)
  // --------------------------------------------------------------------------
  _buildParallaxMountainVistas() {
    this.vistaGroup = new THREE.Group();
    this.vistaGroup.name = 'ParallaxMountainVistas';
    this.scene.add(this.vistaGroup);

    this.vistaLayers = [
      this._create3DMountainRing({
        innerR: 1340,
        peakR: 1630,
        outerR: 1930,
        segs: 156,
        minH: 24,
        maxH: 118,
        freqSeed: 1.0,
        parallax: 0.06,
      }),
      this._create3DMountainRing({
        innerR: 2060,
        peakR: 2540,
        outerR: 2960,
        segs: 180,
        minH: 72,
        maxH: 305,
        freqSeed: 2.35,
        parallax: 0.20,
      }),
      this._create3DMountainRing({
        innerR: 3060,
        peakR: 3580,
        outerR: 4020,
        segs: 156,
        minH: 135,
        maxH: 445,
        freqSeed: 4.15,
        parallax: 0.38,
      }),
    ];

    for (const layer of this.vistaLayers) {
      this.vistaGroup.add(layer.mesh);
    }
  }

  _create3DMountainRing({ innerR, peakR, outerR, segs, minH, maxH, freqSeed, parallax }) {
    // 5-ring cross-section (inner skirt -> lower foothills -> upper crag -> ridged summit crest -> back-skirt)
    // Produces crisp sunlit & shadowed 3D alpine facets and realistic snow gullies!
    const positions = [];
    const basePositions = [];
    const colors = [];
    const normHeights = [];
    const vertAngles = [];
    const indices = [];

    const ringStride = 5;

    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * Math.PI * 2;
      // Ridged multifractal alpine profile for authentic sharp peaks & U-shaped valleys
      const broad = Math.sin(ang * 4.0 + freqSeed) * 0.30 + Math.cos(ang * 7.0 - freqSeed * 1.4) * 0.22;
      const ridge1 = (1.0 - Math.abs(Math.sin(ang * 13.0 + freqSeed * 2.1))) * 0.32;
      const ridge2 = (1.0 - Math.abs(Math.cos(ang * 25.0 - freqSeed * 0.9))) * 0.16;
      const micro = Math.sin(ang * 41.0 + 0.7) * 0.06;

      const u = Math.max(0.06, Math.min(1.0, 0.30 + broad + ridge1 + ridge2 + micro));
      const peakH = minH + u * (maxH - minH);

      const footR = innerR + (peakR - innerR) * 0.36 + Math.sin(ang * 11.0 + freqSeed) * 28;
      const footH = peakH * (0.28 + 0.08 * Math.cos(ang * 17.0));

      const cragR = innerR + (peakR - innerR) * 0.74 + Math.cos(ang * 19.0 - freqSeed) * 32;
      const cragH = peakH * (0.68 + 0.09 * Math.sin(ang * 23.0));

      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);

      const ringPts = [
        [VISTA_CENTER_X + cosA * innerR, -32,   VISTA_CENTER_Z + sinA * innerR, 0.0],
        [VISTA_CENTER_X + cosA * footR,  footH, VISTA_CENTER_Z + sinA * footR,  u * 0.32],
        [VISTA_CENTER_X + cosA * cragR,  cragH, VISTA_CENTER_Z + sinA * cragR,  u * 0.72],
        [VISTA_CENTER_X + cosA * peakR,  peakH, VISTA_CENTER_Z + sinA * peakR,  u],
        [VISTA_CENTER_X + cosA * outerR, -48,   VISTA_CENTER_Z + sinA * outerR, 0.0],
      ];

      for (const p of ringPts) {
        positions.push(p[0], p[1], p[2]);
        basePositions.push(p[0], p[1], p[2]);
        colors.push(0.2, 0.35, 0.5);
        normHeights.push(p[3]);
        vertAngles.push(ang);
      }

      if (i < segs) {
        const b = i * ringStride;
        for (let r = 0; r < ringStride - 1; r++) {
          const a0 = b + r;
          const a1 = b + r + 1;
          const c0 = b + ringStride + r;
          const c1 = b + ringStride + r + 1;
          indices.push(a0, c0, a1, a1, c0, c1);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.05,
      flatShading: true, // Crisp sunlit/shadowed alpine rock & forest facets!
    });

    const mesh = new THREE.Mesh(geo, mat);
    return {
      mesh,
      geo,
      mat,
      basePositions: new Float32Array(basePositions),
      normHeights,
      vertAngles,
      parallax,
    };
  }

  _tintVistaLayersForBiome(theme, isNight, skyReg) {
    const palettes = {
      FUJI: [
        { low: 0x1c4d2c, mid: 0x2e6146, crag: 0x4c6278, snow: 0xe6f0fc }, // Lush Japanese cedar foothills
        { low: 0x223854, mid: 0x3f5b7d, crag: 0x627d9e, snow: 0xf6faff }, // Snow-capped Japanese Alps
        { low: 0x486991, mid: 0x6f90b8, crag: 0x8eabcc, snow: 0xf2f8ff }, // Misty distant alpine horizon
      ],
      MONACO: [
        { low: 0x36543a, mid: 0x7a7464, crag: 0xa69b88, snow: 0xe3d8c6 }, // Tête de Chien limestone cliffs & maquis
        { low: 0x3a5166, mid: 0x6d7d8f, crag: 0x93a1b0, snow: 0xe6edf5 }, // Côte d'Azur Maritime Alps
        { low: 0x587896, mid: 0x86a1bd, crag: 0xa7bfd6, snow: 0xebf4fc },
      ],
      MONZA: [
        { low: 0x2b5225, mid: 0x8c5626, crag: 0xa86f38, snow: 0xd9ad73 }, // Autumn Royal Park & Brianza hills
        { low: 0x2d425c, mid: 0x58708c, crag: 0x7b92ad, snow: 0xf4f8ff }, // Lombardy Pre-Alps (Resegone / Grigna)
        { low: 0x547294, mid: 0x829eba, crag: 0xa3bcd6, snow: 0xf5f9ff },
      ],
      VEGAS: [
        { low: 0x100d1b, mid: 0x261738, crag: 0x3b2252, snow: 0x563270 }, // Night Red Rock Canyon / Spring Mtns
        { low: 0x0b0b18, mid: 0x1a1430, crag: 0x291e46, snow: 0x3f2b63 },
        { low: 0x070813, mid: 0x141028, crag: 0x1f183b, snow: 0x30214f },
      ],
      SUZUKA: [
        { low: 0x1f5230, mid: 0x34694a, crag: 0x526b82, snow: 0xe8f2fc }, // Lush Suzuka Mie cedar hills & Suzuka Range
        { low: 0x263f5c, mid: 0x466487, crag: 0x6b87a8, snow: 0xf4f9ff },
        { low: 0x4c6e96, mid: 0x7697bd, crag: 0x96b3d4, snow: 0xf2f8ff },
      ],
      SILVERSTONE: [
        { low: 0x235929, mid: 0x3b7338, crag: 0x607a62, snow: 0xcfe0d8 }, // Lush British Northamptonshire green hills
        { low: 0x2e4c59, mid: 0x526e7d, crag: 0x7892a1, snow: 0xe6eff5 },
        { low: 0x55738c, mid: 0x809cb3, crag: 0xa1bbd1, snow: 0xeef5fc },
      ],
    };

    const activePal = isNight ? palettes.VEGAS : (palettes[theme] || palettes.FUJI);
    const hz = new THREE.Color(skyReg.skyHorizon);
    const sunTint = new THREE.Color(skyReg.sunColor);
    const isSunset = skyReg.id === 'GOLDEN_SUNSET';
    const isStorm = skyReg.id === 'MONSOON_STORM' || skyReg.id === 'LIGHT_DRIZZLE';

    this.vistaLayers.forEach((layer, idx) => {
      const p = activePal[idx];
      const cLow = new THREE.Color(p.low);
      const cMid = new THREE.Color(p.mid);
      const cCrag = new THREE.Color(p.crag);
      const cSnow = new THREE.Color(p.snow);

      // Sunset alpenglow warms snow caps & upper rock faces into rose-amber!
      if (isSunset && !isNight) {
        cCrag.lerp(sunTint, 0.30);
        cSnow.lerp(new THREE.Color(0xffb88c), 0.42);
      } else if (isStorm && !isNight) {
        const slate = new THREE.Color(skyReg.fogColor);
        cLow.lerp(slate, 0.25);
        cMid.lerp(slate, 0.32);
        cCrag.lerp(slate, 0.35);
      }

      const hazeBlend = idx === 2 ? (isStorm ? 0.36 : 0.22) : (idx === 1 ? (isStorm ? 0.16 : 0.08) : 0.02);

      const posAttr = layer.geo.attributes.position;
      const colAttr = layer.geo.attributes.color;
      const basePos = layer.basePositions;
      const tmp = new THREE.Color();

      for (let i = 0; i < layer.normHeights.length; i++) {
        const ang = layer.vertAngles[i];
        const by = basePos[i * 3 + 1];

        // Biome-specific horizon sculpting:
        // 1. MONACO: Open the southern +Z arc onto the sparkling Mediterranean Sea!
        // 2. FUJI: Carve a scenic alpine saddle along the iconic Mount Fuji sightline (-0.38 rad)
        //    on inner/mid rings so Mount Fuji towers unobstructed above cedar foothills!
        let heightScale = 1.0;
        if (theme === 'MONACO') {
          const seaOpen = Math.sin(ang);
          if (seaOpen > 0.22) {
            const t = Math.min(1.0, (seaOpen - 0.22) / 0.34);
            heightScale = 1.0 - t * t * (3.0 - 2.0 * t);
          } else if (seaOpen < -0.15) {
            heightScale = 1.18; // Dramatic Maritime Alps rising behind Casino Square!
          }
        } else if (theme === 'FUJI' && idx < 2) {
          const dAng = Math.atan2(Math.sin(ang + 0.38), Math.cos(ang + 0.38));
          const saddle = Math.exp(-(dAng * dAng) / 0.14);
          heightScale = 1.0 - saddle * (idx === 1 ? 0.72 : 0.38);
        }

        const sculptedY = by > 0 ? (by * heightScale - (1.0 - heightScale) * 26.0) : by;
        posAttr.setXYZ(i, basePos[i * 3], sculptedY, basePos[i * 3 + 2]);

        const u = layer.normHeights[i] * heightScale;
        if (u < 0.36) {
          tmp.copy(cLow).lerp(cMid, u / 0.36);
        } else if (u < 0.68) {
          tmp.copy(cMid).lerp(cCrag, (u - 0.36) / 0.32);
        } else {
          tmp.copy(cCrag).lerp(cSnow, Math.min(1.0, (u - 0.68) / 0.26));
        }

        if (hazeBlend > 0) tmp.lerp(hz, hazeBlend);
        colAttr.setXYZ(i, tmp.r, tmp.g, tmp.b);
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      layer.geo.computeVertexNormals();

      // Subtle night skyline horizon emissive lift so mountains frame the stars cleanly
      layer.mat.emissive.setHex(isNight ? 0x110b24 : (isSunset ? 0x241018 : 0x060a10));
      layer.mat.emissiveIntensity = isNight ? 0.38 : (isSunset ? 0.14 : 0.08);
    });
  }

  _buildRainParticles() {
    // 1. Slanted Wind-Driven Rain Streaks around Camera
    const count = 1800;
    const positions = new Float32Array(count * 6);
    this.rainDrops = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 92;
      const y = Math.random() * 36;
      const z = (Math.random() - 0.5) * 92;
      const speed = 38 + Math.random() * 18;
      const lenScale = 0.85 + Math.random() * 0.55;
      this.rainDrops.push({ x, y, z, speed, lenScale });
      const idx = i * 6;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
      positions[idx + 3] = x + 0.22;
      positions[idx + 4] = y - 1.6 * lenScale;
      positions[idx + 5] = z + 0.14;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xd8eeff,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
    });
    this.rainLines = new THREE.LineSegments(geo, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.scene.add(this.rainLines);

    // 2. Ground Raindrop Splash Glints dancing across wet tarmac near focus target
    const splashCount = 120;
    const splashPos = new Float32Array(splashCount * 6);
    this.rainSplashes = [];
    for (let i = 0; i < splashCount; i++) {
      this.rainSplashes.push({
        ox: (Math.random() - 0.5) * 44,
        oz: (Math.random() - 0.5) * 44,
        phase: Math.random(),
        rate: 3.8 + Math.random() * 3.2,
      });
    }
    const splashGeo = new THREE.BufferGeometry();
    splashGeo.setAttribute('position', new THREE.BufferAttribute(splashPos, 3));
    this.splashMat = new THREE.LineBasicMaterial({
      color: 0xe6f4ff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.splashLines = new THREE.LineSegments(splashGeo, this.splashMat);
    this.splashLines.frustumCulled = false;
    this.splashLines.visible = false;
    this.scene.add(this.splashLines);
  }

  // --------------------------------------------------------------------------
  // 3D COCKPIT HELMET VISOR RAINDROPS, RADIAL AERO-SHEAR STREAKS & TEAR-OFF
  // Clip-space shader quad rendered only when Cockpit Camera (cameraIndex===2)
  // is active in wet/rainy sessions. Zero occlusion of center apex sightline!
  // --------------------------------------------------------------------------
  _buildCockpitVisorRain() {
    this.visorUniforms = {
      uTime:       { value: 0.0 },
      uWetness:    { value: 0.0 },
      uSpeedNorm:  { value: 0.0 },
      uSteerSlip:  { value: 0.0 },
      uTearOff:    { value: 1.2 },
      uLightning:  { value: 0.0 },
      uSkyTint:    { value: new THREE.Color(0xd8eeff) },
    };

    const visorGeo = new THREE.PlaneGeometry(2, 2);
    this.visorRainMat = new THREE.ShaderMaterial({
      uniforms: this.visorUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uWetness;
        uniform float uSpeedNorm;
        uniform float uSteerSlip;
        uniform float uTearOff;
        uniform float uLightning;
        uniform vec3 uSkyTint;
        varying vec2 vUv;

        float vHash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        // Low-speed 3D spherical water beads with gravity crawl
        vec3 dropletLayer(vec2 uv, float scale, float seed, float speedFade) {
          vec2 aspectUv = vec2(uv.x * 1.72, uv.y);
          vec2 gv = aspectUv * scale;
          gv.y += uTime * (0.12 + uSpeedNorm * 0.25);
          vec2 id = floor(gv);
          vec2 f = fract(gv) - 0.5;

          float n = vHash21(id + seed);
          if (n < 0.42) return vec3(0.0);

          vec2 offs = vec2((n - 0.5) * 0.52, (fract(n * 31.7) - 0.5) * 0.44);
          vec2 p = f - offs;
          float rad = (0.11 + fract(n * 17.3) * 0.13) * speedFade;
          float d = length(p);

          // Trailing micro-bead wake above crawling drop
          float trailW = rad * 0.34;
          float trail = smoothstep(trailW, 0.0, abs(p.x))
                      * smoothstep(0.0, 0.36, p.y)
                      * smoothstep(0.42, 0.04, p.y) * 0.45;

          float drop = smoothstep(rad, rad * 0.55, d);
          vec2 nrm = p / max(rad, 0.001);
          float spec = pow(max(0.0, -nrm.x * 0.35 + nrm.y * 0.85), 5.0) * drop;
          float rim = smoothstep(rad * 0.50, rad * 0.96, d) * drop;
          float alpha = max(drop * 0.55, trail * 0.32);
          return vec3(spec + trail * 0.25, rim, alpha);
        }

        // High-speed radial aero-sheared water rivulets streaming outward from visor stagnation center
        vec2 aeroStreaks(vec2 uv) {
          vec2 center = vec2(0.50 + uSteerSlip * 0.09, 0.43);
          vec2 rel = (uv - center) * vec2(1.68, 1.0);
          float r = length(rel);
          float ang = atan(rel.y, rel.x);

          // Keep dead-center apex sightline crystal clear at speed!
          float peripheryMask = smoothstep(0.14, 0.52, r);

          float angCells = floor((ang + 3.14159265) * 28.0);
          float h1 = vHash21(vec2(angCells, 11.7));
          float angFrac = fract((ang + 3.14159265) * 28.0) - 0.5;

          float streamSpeed = (1.4 + h1 * 1.9) * (0.45 + uSpeedNorm * 2.35);
          float rFlow = fract(r * (3.2 + h1 * 2.4) - uTime * streamSpeed + h1 * 7.0);

          float width = 0.10 + (1.0 - rFlow) * 0.14;
          float head = smoothstep(width, 0.0, abs(angFrac)) * smoothstep(0.06, 0.42, rFlow) * smoothstep(0.96, 0.52, rFlow);

          // Secondary fine mist streaks
          float angCells2 = floor((ang + 3.14159265) * 54.0);
          float h2 = vHash21(vec2(angCells2, 43.1));
          float angFrac2 = fract((ang + 3.14159265) * 54.0) - 0.5;
          float rFlow2 = fract(r * 5.6 - uTime * (2.2 + h2 * 2.4) * (0.5 + uSpeedNorm * 2.6) + h2 * 13.0);
          float fine = smoothstep(0.14, 0.0, abs(angFrac2)) * smoothstep(0.15, 0.75, rFlow2) * smoothstep(0.98, 0.72, rFlow2);

          float total = (head * 0.85 + fine * 0.55) * peripheryMask * smoothstep(0.12, 0.65, uSpeedNorm);
          float glint = pow(max(0.0, head), 2.0) * peripheryMask;
          return vec2(total, glint);
        }

        void main() {
          if (uWetness <= 0.01) discard;

          // Visor tear-off wipe clears accumulated droplets behind sweeping film edge
          float wipeMask = uTearOff < 1.05 ? smoothstep(uTearOff - 0.06, uTearOff + 0.04, vUv.x) : 1.0;
          float wipeLine = uTearOff < 1.02 ? exp(-pow((vUv.x - uTearOff) * 42.0, 2.0)) * 0.65 : 0.0;

          float lowSpeedFade = mix(1.0, 0.38, clamp(uSpeedNorm, 0.0, 1.0));
          vec3 d1 = dropletLayer(vUv, 14.0, 3.1, lowSpeedFade);
          vec3 d2 = dropletLayer(vUv + vec2(0.17, 0.31), 26.0, 19.7, lowSpeedFade * 0.88);
          vec2 aero = aeroStreaks(vUv);

          // Keep immediate center focal circle subtle so driving precision is never compromised
          float centerClear = mix(0.45, 1.0, smoothstep(0.08, 0.34, length((vUv - vec2(0.5, 0.46)) * vec2(1.4, 1.0))));

          float spec = (d1.x + d2.x * 0.85 + aero.y * 0.95) * wipeMask * centerClear;
          float rim  = (d1.y + d2.y * 0.75) * wipeMask * centerClear;
          float dropAlpha = (d1.z + d2.z * 0.75 + aero.x * 0.72) * uWetness * wipeMask * centerClear;

          // Subtle FIA Zylon top visor strip & corner gasket framing
          float topBrow = smoothstep(0.955, 0.992, vUv.y + pow(vUv.x - 0.5, 2.0) * 0.08);
          vec3 waterCol = uSkyTint * (0.78 + spec * 1.65 + uLightning * 0.85) - vec3(rim * 0.16);
          vec3 finalCol = mix(waterCol, vec3(0.03, 0.04, 0.06), topBrow * 0.75) + vec3(wipeLine);
          float finalAlpha = clamp(dropAlpha * 0.68 + topBrow * 0.28 + wipeLine * 0.55, 0.0, 0.76);

          gl_FragColor = vec4(finalCol, finalAlpha);
        }
      `,
    });

    this.visorRainMesh = new THREE.Mesh(visorGeo, this.visorRainMat);
    this.visorRainMesh.name = 'CockpitVisorRainOverlay';
    this.visorRainMesh.renderOrder = 950;
    this.visorRainMesh.frustumCulled = false;
    this.visorRainMesh.visible = false;
    this.scene.add(this.visorRainMesh);

    if (typeof window !== 'undefined' && window.addEventListener) {
      this._onVisorTearOffEvent = () => this.triggerVisorTearOff();
      window.addEventListener('f1-visor-tearoff', this._onVisorTearOffEvent);
    }
  }

  triggerVisorTearOff() {
    this._visorTearOffProgress = -0.05;
    this._visorAccum *= 0.15;
  }

  // Supports both (camera, isCockpitView, speedKmh, dt) and (isCockpitView, speedKmh, dt)
  updateCockpitVisorRain(cameraOrFlag, isCockpitView = false, speedKmh = 0, dt = 0.016, yawSlipOverride = null) {
    if (!this.visorRainMesh) return;

    let camera = null;
    let cockpitActive = false;
    let spd = 0;
    let stepDt = 0.016;

    if (typeof cameraOrFlag === 'object' && cameraOrFlag !== null && ('isCamera' in cameraOrFlag || 'rotation' in cameraOrFlag)) {
      camera = cameraOrFlag;
      cockpitActive = Boolean(isCockpitView);
      spd = Number(speedKmh) || 0;
      stepDt = Number(dt) || 0.016;
    } else {
      cockpitActive = Boolean(cameraOrFlag);
      spd = Number(isCockpitView) || 0;
      stepDt = Number(speedKmh) || 0.016;
    }

    const activeReg = WEATHER_REGIMES[this.currentRegimeId] || WEATHER_REGIMES.HOT_SUNNY;
    const rainInt = activeReg.rainIntensity || 0.0;
    const surfaceWet = Math.max(0, this.offLineMoisture || 0);
    const targetWet = Math.min(1.0, rainInt * 0.92 + (rainInt > 0.02 ? surfaceWet * 0.28 : 0.0));

    if (!cockpitActive || targetWet <= 0.02) {
      this.visorRainMesh.visible = false;
      this._prevCamYaw = null;
      return;
    }

    this._visorAccum = THREE.MathUtils.lerp(this._visorAccum, targetWet, Math.min(1.0, stepDt * 2.2));
    if (this._visorTearOffProgress < 1.15) {
      this._visorTearOffProgress += stepDt * 2.8;
    }

    let yawRate = Number(yawSlipOverride) || 0;
    if (camera && camera.rotation && yawSlipOverride === null) {
      const curYaw = camera.rotation.y || 0;
      if (this._prevCamYaw !== null && stepDt > 0.0005) {
        let dy = curYaw - this._prevCamYaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        yawRate = THREE.MathUtils.clamp(dy / stepDt, -2.5, 2.5);
      }
      this._prevCamYaw = curYaw;
    }
    this._smoothedYawSlip = THREE.MathUtils.lerp(this._smoothedYawSlip, THREE.MathUtils.clamp(yawRate * 0.45, -1, 1), Math.min(1, stepDt * 8.0));

    this.visorUniforms.uTime.value = this.elapsedSkySec;
    this.visorUniforms.uWetness.value = Math.max(0.12, this._visorAccum);
    this.visorUniforms.uSpeedNorm.value = THREE.MathUtils.clamp(spd / 320.0, 0.0, 1.25);
    this.visorUniforms.uSteerSlip.value = this._smoothedYawSlip;
    this.visorUniforms.uTearOff.value = this._visorTearOffProgress;
    this.visorUniforms.uLightning.value = this.lightningFlash;
    this.visorRainMesh.visible = true;
  }

  // Roll ONE single fixed weather regime for an entire race weekend (NEVER changes mid-race!)
  rollRegimeForRace(mode, weatherPreset, trackDef) {
    if (trackDef?.forceNight) {
      if (weatherPreset === 'LIGHT_DRIZZLE' || weatherPreset === 'MONSOON_STORM') {
        return weatherPreset;
      }
      if (weatherPreset === 'RANDOM') {
        return Math.random() < 0.80 ? 'NEON_NIGHT' : 'LIGHT_DRIZZLE';
      }
      return 'NEON_NIGHT';
    }

    if (mode === '1982_ORIGINAL') {
      if (weatherPreset && weatherPreset !== 'RANDOM' && WEATHER_REGIMES[weatherPreset]) {
        return weatherPreset;
      }
      return weightedPick(RANDOM_POOL_1982);
    }

    if (!weatherPreset || weatherPreset === 'RANDOM' || weatherPreset === 'DYNAMIC') {
      return weightedPick(RANDOM_POOL_DAY);
    }

    return WEATHER_REGIMES[weatherPreset] ? weatherPreset : 'HOT_SUNNY';
  }

  configureForSession(mode, regimeOrPreset, trackDef = null) {
    this.lightningFlash = 0;

    let chosenId = regimeOrPreset;
    if (!WEATHER_REGIMES[chosenId]) {
      chosenId = this.rollRegimeForRace(mode, regimeOrPreset, trackDef);
    }
    const forceNightSky = !!trackDef?.forceNight;

    this.currentRegimeId = chosenId;
    const reg = WEATHER_REGIMES[this.currentRegimeId] || WEATHER_REGIMES.HOT_SUNNY;

    if (mode === '1982_ORIGINAL') {
      this.grooveMoisture = 0.0;
      this.offLineMoisture = 0.0;
    } else {
      this.grooveMoisture = reg.moisture > 0.05 ? Number((reg.moisture * 0.82).toFixed(3)) : reg.moisture;
      this.offLineMoisture = reg.moisture;
    }

    this.ambientTemp = reg.ambientTemp;

    const skyReg = forceNightSky ? WEATHER_REGIMES.NEON_NIGHT : reg;
    const isSunset = skyReg.id === 'GOLDEN_SUNSET';
    const isNight = skyReg.id === 'NEON_NIGHT';
    const isStorm = reg.id === 'MONSOON_STORM';
    const isDrizzle = reg.id === 'LIGHT_DRIZZLE';

    this.isNightActive = isNight;
    this.activeTheme = trackDef?.theme || 'FUJI';

    if (isSunset) {
      this._sunOffset.set(98, 50, 72);
      this.skyUniforms.sunDir.value.set(0.73, 0.21, 0.65).normalize();
    } else if (isNight) {
      this._sunOffset.set(55, 112, 76);
      this.skyUniforms.sunDir.value.set(0.38, 0.52, 0.76).normalize();
    } else {
      this._sunOffset.set(66, 118, 82);
      this.skyUniforms.sunDir.value.set(0.42, 0.56, 0.71).normalize();
    }

    // High-contrast Directional Sun (3.4 in sunny/golden-hour) + 45%-lower Fill/Hemisphere lighting
    // so crisp real-time directional shadows ground every car, pit garage, barrier, and tree!
    const sunIntensityMap = {
      HOT_SUNNY:     3.40,
      GOLDEN_SUNSET: 3.40,
      OVERCAST_COOL: 2.25,
      LIGHT_DRIZZLE: 1.65,
      MONSOON_STORM: 1.32,
      NEON_NIGHT:    1.20,
    };
    const ambientIntensityMap = {
      HOT_SUNNY:     0.64,
      GOLDEN_SUNSET: 0.66,
      OVERCAST_COOL: 0.62,
      LIGHT_DRIZZLE: 0.54,
      MONSOON_STORM: 0.48,
      NEON_NIGHT:    0.52,
    };
    this._baseSunIntensity = sunIntensityMap[skyReg.id] ?? 3.40;
    this._baseAmbientIntensity = ambientIntensityMap[skyReg.id] ?? ((skyReg.ambientIntensity || 1.15) * 0.52);

    this.sunLight.color.setHex(skyReg.sunColor);
    this.sunLight.intensity = this._baseSunIntensity;

    const hemiSkyMap = {
      HOT_SUNNY:     0xdff2ff,
      GOLDEN_SUNSET: 0xffcfb3,
      OVERCAST_COOL: 0xd8e4f0,
      LIGHT_DRIZZLE: 0xb8cade,
      MONSOON_STORM: 0x8fa4bd,
      NEON_NIGHT:    0x88a8ff,
    };
    const hemiGroundMap = {
      HOT_SUNNY:     0x2b3429,
      GOLDEN_SUNSET: 0x36241d,
      OVERCAST_COOL: 0x282e34,
      LIGHT_DRIZZLE: 0x20262d,
      MONSOON_STORM: 0x181e26,
      NEON_NIGHT:    0x181228,
    };
    this.ambientLight.color.setHex(hemiSkyMap[skyReg.id] || 0xdff0ff);
    this.ambientLight.groundColor.setHex(hemiGroundMap[skyReg.id] || 0x2a332a);
    this.ambientLight.intensity = this._baseAmbientIntensity;

    this.fillLight.color.setHex(isNight ? 0x9ec4ff : (isSunset ? 0xc9d8ff : 0xd8e9ff));
    this.fillLight.intensity = isNight ? 0.52 : (isSunset ? 0.47 : 0.45);

    this.rimLight.color.setHex(isNight ? 0xff6bd6 : (isSunset ? 0xffb070 : 0xffe9cf));
    this.rimLight.intensity = isNight ? 0.28 : (isSunset ? 0.29 : 0.23);

    // Rich 360-degree sky palettes tuned cleanly below UnrealBloomPass threshold (zero milky bloom wash!)
    const skyPaletteOverrides = {
      HOT_SUNNY: {
        zenith: 0x0b52d4, mid: 0x3c91f2, horizon: 0xb8e0ff, antiHorizon: 0x8cc8fc, sun: 0xfff5e0, boost: 1.05,
      },
      GOLDEN_SUNSET: {
        zenith: 0x254fa6, mid: 0xdc5f4e, horizon: 0xf7b65c, antiHorizon: 0x7c4e98, sun: 0xffb85c, boost: 1.10,
      },
      OVERCAST_COOL: {
        zenith: 0x425b78, mid: 0x7991ab, horizon: 0xbfd0e0, antiHorizon: 0xa8bcd0, sun: 0xeef4fa, boost: 1.04,
      },
      LIGHT_DRIZZLE: {
        zenith: 0x2e4359, mid: 0x566e87, horizon: 0x91a6ba, antiHorizon: 0x7d92a8, sun: 0xc8d8e8, boost: 1.06,
      },
      MONSOON_STORM: {
        zenith: 0x1a283d, mid: 0x344761, horizon: 0x5c728c, antiHorizon: 0x4b607a, sun: 0xa4bcd8, boost: 1.08,
      },
      NEON_NIGHT: {
        zenith: 0x070f28, mid: 0x13204a, horizon: 0x331e59, antiHorizon: 0x201742, sun: 0xd8ecff, boost: 1.14,
      },
    };

    const pal = skyPaletteOverrides[skyReg.id] || {
      zenith: skyReg.skyZenith,
      mid: skyReg.skyMid,
      horizon: skyReg.skyHorizon,
      antiHorizon: skyReg.skyHorizon,
      sun: skyReg.sunColor,
      boost: 1.05,
    };

    const themeHorizonMap = {
      FUJI:        isSunset ? 0xffb88c : 0xcbe8ff,
      MONACO:      isSunset ? 0xffc680 : 0x9ee8ff,
      SUZUKA:      isSunset ? 0xffb094 : 0xc2e4ff,
      MONZA:       isSunset ? 0xffba70 : 0xffe4b8,
      SILVERSTONE: isSunset ? 0xf2b49b : 0xd4e4f4,
      VEGAS:       0x9b38ff,
    };

    this.skyUniforms.zenithColor.value.setHex(pal.zenith);
    this.skyUniforms.midColor.value.setHex(pal.mid);
    this.skyUniforms.horizonColor.value.setHex(pal.horizon);
    this.skyUniforms.antiHorizonColor.value.setHex(pal.antiHorizon);
    this.skyUniforms.groundFogColor.value.setHex(isSunset ? 0xe89668 : skyReg.fogColor);
    this.skyUniforms.sunColor.value.setHex(pal.sun);
    this.skyUniforms.themeHorizonTint.value.setHex(
      isNight ? 0x7c2ae8 : (themeHorizonMap[this.activeTheme] || pal.horizon)
    );
    this.skyUniforms.skyRadianceBoost.value = pal.boost;

    this.skyUniforms.nightAmount.value = isNight ? 1.0 : (isSunset ? 0.18 : 0.0);
    this.skyUniforms.sunsetAmount.value = isSunset ? 1.0 : 0.0;
    this.skyUniforms.stormDarkness.value = isStorm ? 1.0 : (isDrizzle ? 0.55 : 0.0);

    const cloudMap = {
      HOT_SUNNY:     0.25,
      GOLDEN_SUNSET: 0.42,
      OVERCAST_COOL: 0.72,
      LIGHT_DRIZZLE: 0.86,
      MONSOON_STORM: 0.96,
      NEON_NIGHT:    0.16,
    };
    this.skyUniforms.cloudCover.value = cloudMap[reg.id] ?? 0.30;

    if (this.visorUniforms) {
      this.visorUniforms.uSkyTint.value.setHex(isNight ? 0xa8dcff : (isSunset ? 0xffcfa8 : 0xdcf0ff));
      this._visorAccum = 0.0;
    }

    const effectiveSkyReg = {
      ...skyReg,
      skyZenith: pal.zenith,
      skyMid: pal.mid,
      skyHorizon: pal.horizon,
      sunColor: pal.sun,
    };

    // 75% cut to FogExp2 density so garages 20m away & alpine vistas remain vivid and razor-sharp!
    this.scene.fog.color.setHex(isSunset ? 0xe89668 : skyReg.fogColor);
    this.scene.fog.density = Math.min(0.00028, (skyReg.fogDensity || 0.00016) * 0.25);

    this._tintVistaLayersForBiome(this.activeTheme, isNight, effectiveSkyReg);
    this._bakeDynamicHDREnvironment(effectiveSkyReg, this.activeTheme, isNight);

    return this.currentRegimeId;
  }

  getIdealLateralOffset(curvature) {
    if (Math.abs(curvature) < 0.05) return -1.2;
    return Math.sign(curvature) * 4.8;
  }

  getMoistureAt(curvature, lateralOffset) {
    const ideal = this.getIdealLateralOffset(curvature);
    const distFromGroove = Math.abs(lateralOffset - ideal);
    const offBlend = Math.max(0, Math.min(1, (distFromGroove - 1.6) / 3.2));
    return this.grooveMoisture + (this.offLineMoisture - this.grooveMoisture) * offBlend;
  }

  update(dt, cameraPos, focusTargetPos, visualStyle, callbacks = {}) {
    this.elapsedSkySec += dt;
    this.skyUniforms.uTime.value = this.elapsedSkySec;
    this.skyUniforms.retroMode.value = visualStyle === '1982_ARCADE' ? 1.0 : 0.0;

    // Weather regime is strictly locked per race — never mutate currentRegimeId or moisture here!
    const activeReg = WEATHER_REGIMES[this.currentRegimeId] || WEATHER_REGIMES.HOT_SUNNY;
    const skyReg = this.isNightActive ? WEATHER_REGIMES.NEON_NIGHT : activeReg;

    // Keep 2048x2048 soft shadow frustum tightly centered on the focus car!
    if (focusTargetPos) {
      this.sunLight.target.position.set(focusTargetPos.x, focusTargetPos.y, focusTargetPos.z);
      this.sunLight.position.set(
        focusTargetPos.x + this._sunOffset.x,
        focusTargetPos.y + this._sunOffset.y,
        focusTargetPos.z + this._sunOffset.z
      );
      this.sunLight.target.updateMatrixWorld();
    }

    // Subtle 3-Layer 3D Mountain Parallax relative to circuit center
    if (cameraPos && this.vistaLayers) {
      const dx = cameraPos.x - VISTA_CENTER_X;
      const dz = cameraPos.z - VISTA_CENTER_Z;
      for (const layer of this.vistaLayers) {
        layer.mesh.position.x = dx * layer.parallax;
        layer.mesh.position.z = dz * layer.parallax;
      }
    }

    if (activeReg.hasLightning) {
      this.nextLightningSec -= dt;
      if (this.nextLightningSec <= 0) {
        this.lightningFlash = 1.0;
        this.nextLightningSec = 5.5 + Math.random() * 9.0;
        if (callbacks.onThunder) callbacks.onThunder();
      }
    }
    if (this.lightningFlash > 0) {
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 4.2);
    }

    this.skyUniforms.flashBoost.value = this.lightningFlash;
    this.skyDome.position.copy(cameraPos);

    this.sunLight.intensity = this._baseSunIntensity + this.lightningFlash * 2.8;
    this.ambientLight.intensity = this._baseAmbientIntensity + this.lightningFlash * 0.65;

    // Wind-driven rain streaks + wet surface splash micro-glints
    const rainInt = activeReg.rainIntensity || 0.0;
    const raining = rainInt > 0.05;
    this.rainLines.visible = raining;
    this.splashLines.visible = raining && !!focusTargetPos;

    if (raining) {
      this.rainMat.opacity = Math.min(0.88, 0.30 + rainInt * 0.44 + this.lightningFlash * 0.25);
      this.rainMat.color.setHex(this.isNightActive ? 0xbbe8ff : 0xd8eeff);

      const posAttr = this.rainLines.geometry.attributes.position;
      const arr = posAttr.array;
      const slantX = 0.22 + rainInt * 0.16;
      const slantZ = 0.14 + rainInt * 0.10;

      for (let i = 0; i < this.rainDrops.length; i++) {
        const d = this.rainDrops[i];
        d.y -= d.speed * (0.82 + rainInt * 0.46) * dt;
        d.x += slantX * 9.0 * dt;
        if (d.y < -4) {
          d.y = 28 + Math.random() * 9;
          d.x = (Math.random() - 0.5) * 88;
          d.z = (Math.random() - 0.5) * 88;
        }
        const wx = cameraPos.x + d.x;
        const wy = cameraPos.y + d.y;
        const wz = cameraPos.z + d.z;
        const len = (1.15 + rainInt * 1.35) * d.lenScale;
        const idx = i * 6;
        arr[idx]     = wx;
        arr[idx + 1] = wy;
        arr[idx + 2] = wz;
        arr[idx + 3] = wx + slantX;
        arr[idx + 4] = wy - len;
        arr[idx + 5] = wz + slantZ;
      }
      posAttr.needsUpdate = true;

      if (focusTargetPos) {
        this.splashMat.opacity = 0.22 + rainInt * 0.36;
        const spAttr = this.splashLines.geometry.attributes.position;
        const spArr = spAttr.array;
        const baseY = focusTargetPos.y + 0.05;

        for (let i = 0; i < this.rainSplashes.length; i++) {
          const sp = this.rainSplashes[i];
          sp.phase += sp.rate * dt;
          if (sp.phase >= 1.0) {
            sp.phase -= 1.0;
            sp.ox = (Math.random() - 0.5) * 42;
            sp.oz = (Math.random() - 0.5) * 42;
          }
          const crown = Math.sin(sp.phase * Math.PI);
          const sx = focusTargetPos.x + sp.ox;
          const sz = focusTargetPos.z + sp.oz;
          const spread = (0.06 + sp.phase * 0.18) * (0.7 + rainInt * 0.5);
          const height = crown * (0.14 + rainInt * 0.16);
          const idx = i * 6;
          spArr[idx]     = sx - spread * 0.5;
          spArr[idx + 1] = baseY;
          spArr[idx + 2] = sz;
          spArr[idx + 3] = sx + spread * 0.5;
          spArr[idx + 4] = baseY + height;
          spArr[idx + 5] = sz;
        }
        spAttr.needsUpdate = true;
      }
    }
  }

  getForecastSummary() {
    const cur = WEATHER_REGIMES[this.currentRegimeId] || WEATHER_REGIMES.HOT_SUNNY;
    return {
      current: cur,
      next: cur,
      etaSec: 0,
      isFixedPerRace: true,
      grooveMoisture: this.grooveMoisture,
      offLineMoisture: this.offLineMoisture,
    };
  }
}
