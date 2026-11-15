// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Real Poly Haven Equirectangular .hdr Sky & PMREM IBL Environment System,
// Physical Sun/Sky Ratios, 3D Biome Vistas, Rain & Optical Visor Raindrops
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

const POLY_HAVEN_HDRI_MAP = {
  HOT_SUNNY:     './assets/hdri/syferfontein_18d_clear_puresky_1k.hdr',
  OVERCAST_COOL: './assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
  GOLDEN_SUNSET: './assets/hdri/evening_road_01_puresky_1k.hdr',
  LIGHT_DRIZZLE: './assets/hdri/kloofendal_overcast_puresky_1k.hdr',
  MONSOON_STORM: './assets/hdri/kloofendal_overcast_puresky_1k.hdr',
  NEON_NIGHT:    './assets/hdri/qwantani_night_puresky_1k.hdr',
};

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

// ============================================================================
// ZERO-DEPENDENCY RADIANCE #?RADIANCE (.hdr) RGBE EQUIRECTANGULAR DECODER
// Applies a smooth hue-preserving solar radiance shoulder (maxRadiance = 24.0)
// and packs HalfFloatType so mobile WebGL2 GPUs (iOS/Adreno/Mali) get native
// hardware LinearFilter and PMREMGenerator NEVER overflows FP16 to NaN!
// ============================================================================
const _hdrPromiseCache = new Map();
const _hdrResolvedCache = new Map();

let _placeholderHdrTex = null;
function getPlaceholderHdrTexture() {
  if (_placeholderHdrTex) return _placeholderHdrTex;
  const useHalf = typeof THREE.DataUtils?.toHalfFloat === 'function';
  if (useHalf) {
    const h = THREE.DataUtils.toHalfFloat(0.5);
    const hOne = THREE.DataUtils.toHalfFloat(1.0);
    const data = new Uint16Array([h, h, h, hOne]);
    _placeholderHdrTex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat, THREE.HalfFloatType);
  } else {
    const data = new Float32Array([0.5, 0.5, 0.5, 1.0]);
    _placeholderHdrTex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat, THREE.FloatType);
  }
  _placeholderHdrTex.colorSpace = THREE.LinearSRGBColorSpace;
  _placeholderHdrTex.needsUpdate = true;
  return _placeholderHdrTex;
}

export async function loadPolyHavenHDR(url, maxRadiance = 24.0) {
  const cacheKey = `${url}|${maxRadiance}`;
  if (_hdrResolvedCache.has(cacheKey)) {
    return _hdrResolvedCache.get(cacheKey);
  }
  if (_hdrPromiseCache.has(cacheKey)) {
    return _hdrPromiseCache.get(cacheKey);
  }

  const loadPromise = (async () => {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`HDR fetch failed (${resp.status}): ${url}`);
    }
    const bytes = new Uint8Array(await resp.arrayBuffer());
    let pos = 0;
    let header = '';
    while (pos < bytes.length) {
      header += String.fromCharCode(bytes[pos++]);
      if (header.endsWith('\n\n') || header.endsWith('\r\n\r\n')) break;
    }

    let resLine = '';
    while (pos < bytes.length) {
      const ch = String.fromCharCode(bytes[pos++]);
      if (ch === '\n') break;
      if (ch !== '\r') resLine += ch;
    }

    const m = resLine.match(/-Y\s+(\d+)\s+\+X\s+(\d+)/);
    if (!m) {
      throw new Error(`Unsupported HDR resolution header: ${resLine}`);
    }
    const height = parseInt(m[1], 10);
    const width = parseInt(m[2], 10);

    const useHalf = typeof THREE.DataUtils?.toHalfFloat === 'function';
    const toHalf = useHalf ? THREE.DataUtils.toHalfFloat : null;
    const rgba = useHalf
      ? new Uint16Array(width * height * 4)
      : new Float32Array(width * height * 4);
    const hZero = useHalf ? toHalf(0.0) : 0.0;
    const hOne = useHalf ? toHalf(1.0) : 1.0;

    const scanline = new Uint8Array(width * 4);
    const safeCeiling = Math.max(2.0, Math.min(48.0, Number(maxRadiance) || 24.0));
    const knee = safeCeiling * 0.55;
    const shoulderSpan = safeCeiling - knee;

    // Precompute exponent LUT: 2^(e - 128) / 255 for e in [0..255]
    const expLut = new Float64Array(256);
    expLut[0] = 0.0;
    for (let e = 1; e < 256; e++) {
      expLut[e] = Math.pow(2.0, e - 128.0) / 255.0;
    }

    // Track upper-hemisphere raw peak luminance to align directional shadow sun 1:1 with HDRI sun!
    let peakRawLum = -1.0;
    let bestSunX = Math.floor(width * 0.62);
    let bestSunY = Math.floor(height * 0.28);

    for (let y = 0; y < height; y++) {
      if (pos + 4 > bytes.length) {
        throw new Error(`Unexpected EOF in HDR scanline ${y}`);
      }
      const b0 = bytes[pos];
      const b1 = bytes[pos + 1];
      const b2 = bytes[pos + 2];
      const b3 = bytes[pos + 3];

      if (b0 === 2 && b1 === 2 && ((b2 << 8) | b3) === width) {
        pos += 4;
        for (let ch = 0; ch < 4; ch++) {
          let x = 0;
          const chBase = ch * width;
          while (x < width) {
            if (pos >= bytes.length) throw new Error(`Truncated RLE stream at row ${y}`);
            const code = bytes[pos++];
            if (code > 128) {
              const run = code - 128;
              const val = bytes[pos++];
              const end = Math.min(width, x + run);
              while (x < end) scanline[chBase + x++] = val;
            } else {
              const end = Math.min(width, x + code);
              while (x < end) scanline[chBase + x++] = bytes[pos++];
            }
          }
        }
      } else {
        // Uncompressed flat RGBE scanline fallback
        for (let x = 0; x < width; x++) {
          scanline[x] = bytes[pos++];
          scanline[width + x] = bytes[pos++];
          scanline[2 * width + x] = bytes[pos++];
          scanline[3 * width + x] = bytes[pos++];
        }
      }

      // Flip Y so row 0 of Radiance file (zenith) maps to Three.js UV v = 1.0
      const dstRow = (height - 1 - y) * width * 4;
      const isUpperSky = y < Math.floor(height * 0.48);

      for (let x = 0; x < width; x++) {
        const e = scanline[3 * width + x];
        const out = dstRow + x * 4;
        if (e === 0) {
          rgba[out] = hZero;
          rgba[out + 1] = hZero;
          rgba[out + 2] = hZero;
          rgba[out + 3] = hOne;
        } else {
          const scale = expLut[e];
          let r = scanline[x] * scale;
          let g = scanline[width + x] * scale;
          let b = scanline[2 * width + x] * scale;

          if (isUpperSky) {
            const rawLum = r * 0.2126 + g * 0.7152 + b * 0.0722;
            if (rawLum > peakRawLum) {
              peakRawLum = rawLum;
              bestSunX = x;
              bestSunY = y;
            }
          }

          // Smooth C1 hue-preserving FP16 radiance shoulder strictly <= safeCeiling (24.0)
          const peak = Math.max(r, g, b);
          if (peak > knee) {
            const excess = peak - knee;
            const compressed = Math.min(
              safeCeiling,
              knee + (excess * shoulderSpan) / (excess + shoulderSpan)
            );
            const k = compressed / peak;
            r *= k;
            g *= k;
            b *= k;
          }

          const sr = Number.isFinite(r) ? Math.max(0.0, Math.min(safeCeiling, r)) : 0.0;
          const sg = Number.isFinite(g) ? Math.max(0.0, Math.min(safeCeiling, g)) : 0.0;
          const sb = Number.isFinite(b) ? Math.max(0.0, Math.min(safeCeiling, b)) : 0.0;

          if (useHalf) {
            rgba[out] = toHalf(sr);
            rgba[out + 1] = toHalf(sg);
            rgba[out + 2] = toHalf(sb);
            rgba[out + 3] = hOne;
          } else {
            rgba[out] = sr;
            rgba[out + 1] = sg;
            rgba[out + 2] = sb;
            rgba[out + 3] = 1.0;
          }
        }
      }
    }

    // Convert solar peak pixel (bestSunX, bestSunY) into exact Three.js equirectUv 3D direction
    const uSun = (bestSunX + 0.5) / width;
    const vSun = (height - 1 - bestSunY + 0.5) / height;
    const elev = (vSun - 0.5) * Math.PI;
    const azim = (uSun - 0.5) * Math.PI * 2.0;
    const cosEl = Math.cos(elev);
    const sunDir = new THREE.Vector3(
      cosEl * Math.cos(azim),
      Math.max(0.18, Math.sin(elev)),
      cosEl * Math.sin(azim)
    ).normalize();

    const tex = new THREE.DataTexture(
      rgba,
      width,
      height,
      THREE.RGBAFormat,
      useHalf ? THREE.HalfFloatType : THREE.FloatType
    );
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.flipY = false;
    tex.userData = {
      url,
      sunDir,
      peakRawLum,
    };
    tex.needsUpdate = true;

    _hdrResolvedCache.set(cacheKey, tex);
    return tex;
  })().catch((err) => {
    _hdrPromiseCache.delete(cacheKey);
    throw err;
  });

  _hdrPromiseCache.set(cacheKey, loadPromise);
  return loadPromise;
}

export class WeatherSystem {
  constructor(scene, renderer = null) {
    this.scene = scene;
    this.renderer = renderer;
    this.pmremGenerator = renderer ? new THREE.PMREMGenerator(renderer) : null;
    if (this.pmremGenerator) {
      this.pmremGenerator.compileEquirectangularShader();
    }
    this._currentFallbackEnvRT = null;
    this._pmremByUrl = new Map();
    this._envRequestSeq = 0;
    this.activeHdrTexture = null;

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
    this._baseSunIntensity = 4.25;
    this._baseAmbientIntensity = 0.78;
    this._targetHdrMix = 0.0;
    this._currentHdrMix = 0.0;
    this._visorAccum = 0.0;
    this._visorTearOffProgress = 1.2;
    this._prevCamYaw = null;
    this._smoothedYawSlip = 0.0;
    this.graphicsQuality = 'ULTRA';
    this._maxRainDrops = 1800;
    this._activeRainCount = 1800;
    this._maxRainSplashes = 140;
    this._activeSplashCount = 140;
    this._maxFestivalParticles = 320;
    this._activeFestivalCount = 320;

    this._buildSkyAndLighting();
    this._buildParallaxMountainVistas();
    this._buildRainParticles();
    this._buildFestivalSkyParticles();
    this._buildCockpitVisorRain();
  }

  setGraphicsQuality(tier = 'HIGH') {
    const raw = String(tier || 'HIGH').trim().toUpperCase();
    let q = 'HIGH';
    if (raw === 'ULTRA' || raw === 'MAX') {
      q = 'ULTRA';
    } else if (raw === 'PERFORMANCE' || raw === '60FPS' || raw === 'LOW' || raw === 'FAST') {
      q = 'PERFORMANCE';
    }

    const prevQ = this.graphicsQuality;
    this.graphicsQuality = q;

    const rainTarget = q === 'ULTRA' ? 1800 : (q === 'HIGH' ? 1120 : 520);
    const splashTarget = q === 'ULTRA' ? 140 : (q === 'HIGH' ? 88 : 0);
    const festivalTarget = q === 'ULTRA' ? 320 : (q === 'HIGH' ? 220 : 110);
    this._activeRainCount = Math.min(this._maxRainDrops, rainTarget);
    this._activeSplashCount = Math.min(this._maxRainSplashes, splashTarget);
    this._activeFestivalCount = Math.min(this._maxFestivalParticles, festivalTarget);

    if (this.rainLines?.geometry) {
      this.rainLines.geometry.setDrawRange(0, this._activeRainCount * 2);
    }
    if (this.splashLines?.geometry) {
      this.splashLines.geometry.setDrawRange(0, this._activeSplashCount * 2);
      if (this._activeSplashCount === 0) {
        this.splashLines.visible = false;
      }
    }
    if (this.festivalPoints?.geometry) {
      this.festivalPoints.geometry.setDrawRange(0, this._activeFestivalCount);
    }

    if (this.sunLight?.shadow) {
      const targetMapSize = q === 'ULTRA' ? 2048 : (q === 'HIGH' ? 1024 : 512);
      this.sunLight.shadow.bias = q === 'ULTRA' ? -0.00022 : (q === 'HIGH' ? -0.00030 : -0.00044);
      this.sunLight.shadow.normalBias = q === 'ULTRA' ? 0.015 : (q === 'HIGH' ? 0.021 : 0.030);
      this.sunLight.shadow.radius = q === 'ULTRA' ? 1.35 : (q === 'HIGH' ? 1.15 : 1.0);

      if (
        prevQ !== q &&
        (this.sunLight.shadow.mapSize.width !== targetMapSize ||
          this.sunLight.shadow.mapSize.height !== targetMapSize)
      ) {
        this.sunLight.shadow.mapSize.set(targetMapSize, targetMapSize);
        if (this.sunLight.shadow.map) {
          this.sunLight.shadow.map.dispose();
          this.sunLight.shadow.map = null;
        }
      }
    }

    if (this.visorUniforms?.uQualityLevel) {
      this.visorUniforms.uQualityLevel.value = q === 'ULTRA' ? 2.0 : (q === 'HIGH' ? 1.0 : 0.0);
    }

    return this.graphicsQuality;
  }

  _buildSkyAndLighting() {
    // Vibrant Hemisphere Sky + Lush Emerald Turf Bounce (#2e8b40) so foliage, crowds & cars pop with color!
    this.ambientLight = new THREE.HemisphereLight(0xe6f6ff, 0x2e8b40, 0.78);
    this.scene.add(this.ambientLight);

    // Sun-Drenched Warm Golden-White Solar Directional Light (3.8-4.4 intensity) with 2048x2048 Soft Shadows
    this.sunLight = new THREE.DirectionalLight(0xfff4d6, 4.25);
    this.sunLight.position.set(65, 115, 78);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 6;
    this.sunLight.shadow.camera.far = 260;
    const d = 38;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.updateProjectionMatrix();
    this.sunLight.shadow.bias = -0.00022;
    this.sunLight.shadow.normalBias = 0.015;
    this.sunLight.shadow.radius = 1.35;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Warm Sky-Bounce Fill Light (lifts grandstand & tree shadow side with crisp azure clarity)
    this.fillLight = new THREE.DirectionalLight(0xd8ecff, 0.48);
    this.fillLight.position.set(-340, 360, -310);
    this.scene.add(this.fillLight);

    // Golden-Warm Horizon Rim Light
    this.rimLight = new THREE.DirectionalLight(0xffe6b8, 0.32);
    this.rimLight.position.set(-230, 185, 340);
    this.scene.add(this.rimLight);

    // Dual-Mode Sky Dome:
    // Samples real Poly Haven 32-bit Equirectangular .hdr sky (matching PMREM clearcoat IBL 1:1!)
    // with instant non-blocking procedural Rayleigh/Mie fallback during initial ~60ms async fetch.
    const skyGeo = new THREE.SphereGeometry(5600, 64, 40);
    this.skyUniforms = {
      uHdrMap:          { value: getPlaceholderHdrTexture() },
      uHdrMix:          { value: 0.0 },
      uHdrExposure:     { value: 1.0 },
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
      skyRadianceBoost: { value: 1.00 },
      flashBoost:       { value: 0.0 },
      retroMode:        { value: 0.0 },
    };

    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: true,
      vertexShader: `
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = position;
          // Lock sky sphere strictly to camera eye in rotation-only view space
          vec4 mvPos = vec4(mat3(viewMatrix) * (position * 0.1), 1.0);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D uHdrMap;
        uniform float uHdrMix;
        uniform float uHdrExposure;
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

        const float INV_PI = 0.3183098861837907;
        const float INV_TWO_PI = 0.15915494309189535;

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
          for (int i = 0; i < 4; i++) {
            v += a * noise2(p);
            p = rot * p * 2.05;
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
          float twinkle = 0.72 + 0.28 * sin(timeSec * (2.0 + rnd.y * 3.0) + rnd.x * 95.0);
          return core * twinkle;
        }

        vec3 evalProceduralSky(vec3 d, vec3 sDir) {
          float h = clamp(d.y, 0.0, 1.0);
          vec2 horizD = normalize(d.xz + vec2(1e-5));
          vec2 horizS = normalize(sDir.xz + vec2(1e-5));
          float sunAzimuth = clamp(dot(horizD, horizS) * 0.5 + 0.5, 0.0, 1.0);
          vec3 dirHorizon = mix(antiHorizonColor, horizonColor, pow(sunAzimuth, 1.28));
          dirHorizon = mix(dirHorizon, themeHorizonTint, 0.14);

          vec3 col = mix(dirHorizon, midColor, smoothstep(0.0, 0.34, h));
          col = mix(col, zenithColor, smoothstep(0.24, 0.88, h));
          col *= skyRadianceBoost;

          float horizonBand = pow(1.0 - abs(d.y), 4.8);
          vec3 mieTint = mix(dirHorizon * 1.12, sunColor * 1.08, 0.30 + sunsetAmount * 0.42);
          col = mix(col, mieTint, horizonBand * (0.42 + sunsetAmount * 0.28) * (1.0 - stormDarkness * 0.42));

          if (nightAmount > 0.04 && d.y > 0.015) {
            float skyFade = smoothstep(0.015, 0.24, d.y) * nightAmount * (1.0 - cloudCover * 0.82);
            vec2 starProj = d.xz / (d.y + 0.36);
            vec3 tintA;
            float stA = starLayer(starProj * 78.0, uTime, 0.978, tintA);
            col += tintA * stA * 1.15 * skyFade;
          }

          float sunDot = max(0.0, dot(d, sDir));
          float coronaWide  = pow(sunDot, 7.0) * (0.16 + sunsetAmount * 0.14);
          float coronaMid   = pow(sunDot, 42.0) * 0.36;
          float coronaTight = pow(sunDot, 220.0) * 0.75;
          float disc        = smoothstep(0.99905, 0.99968, sunDot);
          float clearVis    = max(0.06, 1.0 - cloudCover * 0.78);
          col += sunColor * (coronaWide + coronaMid + coronaTight + disc * 2.2) * clearVis * mix(1.0, 0.25, nightAmount);

          if (d.y > 0.008 && cloudCover > 0.02) {
            vec2 windLow = vec2(uTime * 0.0032, uTime * 0.0016);
            vec2 cloudUv = (d.xz / (d.y + 0.18)) * 1.15 + windLow;
            float billow = fbm(cloudUv);
            float thresh = mix(0.66, 0.24, cloudCover);
            float cMask = smoothstep(thresh, thresh + 0.25, billow) * smoothstep(0.008, 0.12, d.y);
            vec3 cloudBright = mix(vec3(0.94, 0.96, 0.99), sunColor, 0.38 + sunsetAmount * 0.38);
            vec3 cloudDark = mix(midColor * 0.68, vec3(0.16, 0.20, 0.28), clamp(cloudCover * 0.55 + stormDarkness * 0.42, 0.0, 1.0));
            if (nightAmount > 0.4) {
              cloudBright = vec3(0.18, 0.22, 0.34);
              cloudDark = vec3(0.05, 0.07, 0.12);
            }
            col = mix(col, mix(cloudDark, cloudBright, clamp(billow * 1.15, 0.0, 1.0)), cMask * 0.90);
          }

          if (d.y < 0.0) {
            col = mix(col, groundFogColor, smoothstep(0.0, -0.14, d.y));
          }
          return col;
        }

        void main() {
          vec3 d = normalize(vLocalPos);
          vec3 sDir = normalize(sunDir);

          // Sun-drenched procedural azure/cerulean/sunset base blended with Poly Haven HDRI cloud detail
          float effHdrMix = uHdrMix * (1.0 - step(0.5, retroMode)) * mix(0.38, 0.72, stormDarkness);
          vec3 procCol = evalProceduralSky(d, sDir);
          vec3 col = procCol;

          if (effHdrMix > 0.001) {
            // Exact Three.js equirectUv mapping so sky dome matches PMREM clearcoat reflections 1:1
            vec2 eqUv = vec2(
              atan(d.z, d.x) * INV_TWO_PI + 0.5,
              asin(clamp(d.y, -1.0, 1.0)) * INV_PI + 0.5
            );
            vec3 hdrCol = texture2D(uHdrMap, eqUv).rgb * uHdrExposure;

            // Smooth horizon ground-haze skirt below y = 0 so dark puresky nadir never peeks under terrain
            if (d.y < 0.015) {
              vec2 horizonUv = vec2(eqUv.x, 0.506);
              vec3 horizonSample = texture2D(uHdrMap, horizonUv).rgb * uHdrExposure;
              vec3 lowerTarget = mix(horizonSample * 0.88, groundFogColor, 0.55);
              hdrCol = mix(hdrCol, lowerTarget, smoothstep(0.015, -0.11, d.y));
            }

            // Color-grade HDRI sample toward rich azure/golden sky palette so clear skies stay vibrant!
            hdrCol = mix(hdrCol, procCol * max(0.85, length(hdrCol) * 0.68), 0.35 * (1.0 - stormDarkness));
            col = mix(procCol, hdrCol, effHdrMix);
          }

          // Boost sky chroma saturation in sun-drenched clear/sunset modes
          float skyLuma = dot(col, vec3(0.299, 0.587, 0.114));
          float satBoost = retroMode > 0.5 ? 1.28 : mix(1.24, 1.05, stormDarkness);
          col = max(vec3(0.0), mix(vec3(skyLuma), col, satBoost));

          // Monsoon sheet-lightning cloud illumination
          if (flashBoost > 0.004) {
            float cloudGlow = smoothstep(-0.04, 0.45, d.y);
            col += vec3(0.52, 0.62, 0.78) * flashBoost * (0.35 + cloudGlow * 0.75);
          }

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });

    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.skyDome.renderOrder = -1000;
    this.skyDome.frustumCulled = false;
    this.scene.add(this.skyDome);

    // Natural outdoor aerial perspective fog
    this.scene.fog = new THREE.FogExp2(0xb0dbff, 0.00005);
  }

  // --------------------------------------------------------------------------
  // REAL POLY HAVEN .HDR -> PMREM ENVIRONMENT + SKY DOME BINDER
  // Instant procedural fallback on cold start; 0ms GPU cache hit thereafter!
  // --------------------------------------------------------------------------
  _resolveHdrConfigForSession(skyRegId, theme, isNight) {
    if (isNight || theme === 'VEGAS' || skyRegId === 'NEON_NIGHT') {
      return {
        url: POLY_HAVEN_HDRI_MAP.NEON_NIGHT,
        envIntensity: 0.92,
        skyExposure: 1.04,
      };
    }
    if (skyRegId === 'GOLDEN_SUNSET') {
      return {
        url: POLY_HAVEN_HDRI_MAP.GOLDEN_SUNSET,
        envIntensity: 1.16,
        skyExposure: 1.14,
      };
    }
    if (skyRegId === 'LIGHT_DRIZZLE' || skyRegId === 'MONSOON_STORM') {
      return {
        url: POLY_HAVEN_HDRI_MAP.LIGHT_DRIZZLE,
        envIntensity: skyRegId === 'MONSOON_STORM' ? 0.78 : 0.90,
        skyExposure: skyRegId === 'MONSOON_STORM' ? 0.68 : 0.88,
      };
    }
    if (skyRegId === 'OVERCAST_COOL') {
      return {
        url: POLY_HAVEN_HDRI_MAP.OVERCAST_COOL,
        envIntensity: 1.08,
        skyExposure: 1.08,
      };
    }
    return {
      url: POLY_HAVEN_HDRI_MAP.HOT_SUNNY,
      envIntensity: 1.22,
      skyExposure: 1.16,
    };
  }

  _applyLoadedPolyHavenHDR(hdrTex, hdrCfg, isSunset, isNight) {
    this.activeHdrTexture = hdrTex;
    this.skyUniforms.uHdrMap.value = hdrTex;
    this.skyUniforms.uHdrExposure.value = hdrCfg.skyExposure;
    this._targetHdrMix = 1.0;

    // Align directional shadow caster 1:1 with the real sun position in the Poly Haven HDRI!
    if (hdrTex.userData?.sunDir && !isNight) {
      const sd = hdrTex.userData.sunDir;
      const clampedY = isSunset
        ? THREE.MathUtils.clamp(sd.y, 0.22, 0.45)
        : THREE.MathUtils.clamp(sd.y, 0.36, 0.84);
      const horizLen = Math.hypot(sd.x, sd.z) || 1.0;
      const targetHoriz = Math.sqrt(Math.max(0.04, 1.0 - clampedY * clampedY));
      const alignedDir = new THREE.Vector3(
        (sd.x / horizLen) * targetHoriz,
        clampedY,
        (sd.z / horizLen) * targetHoriz
      ).normalize();

      this.skyUniforms.sunDir.value.copy(alignedDir);
      this._sunOffset.copy(alignedDir).multiplyScalar(155.0);
    }

    if (this.pmremGenerator) {
      let pmremRT = this._pmremByUrl.get(hdrCfg.url);
      if (!pmremRT) {
        pmremRT = this.pmremGenerator.fromEquirectangular(hdrTex);
        this._pmremByUrl.set(hdrCfg.url, pmremRT);
      }
      this.scene.environment = pmremRT.texture;
      if ('environmentIntensity' in this.scene) {
        this.scene.environmentIntensity = hdrCfg.envIntensity;
      }
      if (this._currentFallbackEnvRT) {
        this._currentFallbackEnvRT.dispose();
        this._currentFallbackEnvRT = null;
      }
    }
  }

  _bindPolyHavenOrFallbackEnvironment(effectiveSkyReg, theme, isNight) {
    const hdrCfg = this._resolveHdrConfigForSession(effectiveSkyReg.id, theme, isNight);
    const isSunset = effectiveSkyReg.id === 'GOLDEN_SUNSET';
    const cacheKey = `${hdrCfg.url}|24`;
    const reqSeq = ++this._envRequestSeq;

    // Fast synchronous path if HDRI is already decoded in memory
    if (_hdrResolvedCache.has(cacheKey)) {
      const cachedTex = _hdrResolvedCache.get(cacheKey);
      this._applyLoadedPolyHavenHDR(cachedTex, hdrCfg, isSunset, isNight);
      this._currentHdrMix = 1.0;
      this.skyUniforms.uHdrMix.value = 1.0;
      return;
    }

    // Non-blocking startup fallback: immediately bake lightweight procedural sky IBL while .hdr fetches
    this._targetHdrMix = 0.0;
    this._currentHdrMix = 0.0;
    this.skyUniforms.uHdrMix.value = 0.0;
    if ('environmentIntensity' in this.scene) {
      this.scene.environmentIntensity = hdrCfg.envIntensity;
    }
    this._bakeProceduralFallbackEnvironment(effectiveSkyReg, theme, isNight);

    loadPolyHavenHDR(hdrCfg.url, 24.0)
      .then((hdrTex) => {
        if (reqSeq !== this._envRequestSeq) {
          // Pre-compile PMREM into cache even if user already switched presets
          if (this.pmremGenerator && !this._pmremByUrl.has(hdrCfg.url)) {
            this._pmremByUrl.set(hdrCfg.url, this.pmremGenerator.fromEquirectangular(hdrTex));
          }
          return;
        }
        this._applyLoadedPolyHavenHDR(hdrTex, hdrCfg, isSunset, isNight);
      })
      .catch((err) => {
        console.warn(`[WeatherSystem] Using procedural sky fallback for ${hdrCfg.url}:`, err);
      });
  }

  // Synchronous lightweight outdoor sky/ground dome fallback used ONLY during initial ~60ms .hdr fetch
  _bakeProceduralFallbackEnvironment(skyReg, theme, isNight) {
    if (!this.pmremGenerator) return;

    const envScene = new THREE.Scene();
    const sunDir = this.skyUniforms.sunDir.value.clone().normalize();
    const groundHex = isNight || theme === 'VEGAS' ? 0x060810 : 0x12151a;

    const domeGeo = new THREE.SphereGeometry(40, 24, 16);
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        cTop:    { value: new THREE.Color(skyReg.skyZenith) },
        cMid:    { value: new THREE.Color(skyReg.skyMid) },
        cBot:    { value: new THREE.Color(skyReg.skyHorizon) },
        cSun:    { value: new THREE.Color(skyReg.sunColor) },
        cGround: { value: new THREE.Color(groundHex) },
        uSunDir: { value: sunDir },
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
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          if (d.y < 0.0) {
            float roadGrad = pow(clamp(-d.y * 4.5, 0.0, 1.0), 0.75);
            gl_FragColor = vec4(mix(cBot * 0.45, cGround, roadGrad), 1.0);
          } else {
            vec3 c = mix(cBot, cMid, smoothstep(0.0, 0.32, d.y));
            c = mix(c, cTop, smoothstep(0.28, 0.92, d.y));
            float sDot = max(0.0, dot(d, normalize(uSunDir)));
            c += cSun * (pow(sDot, 12.0) * 0.65 + pow(sDot, 160.0) * 2.4);
            gl_FragColor = vec4(c, 1.0);
          }
        }
      `,
    });
    envScene.add(new THREE.Mesh(domeGeo, domeMat));

    const nextRT = this.pmremGenerator.fromScene(envScene, 0.02);
    domeGeo.dispose();
    domeMat.dispose();

    if (this._currentFallbackEnvRT) {
      this._currentFallbackEnvRT.dispose();
    }
    this._currentFallbackEnvRT = nextRT;
    this.scene.environment = nextRT.texture;
  }

  // Keep alias for backward compatibility
  _bakeDynamicHDREnvironment(skyReg, theme, isNight) {
    this._bindPolyHavenOrFallbackEnvironment(skyReg, theme, isNight);
  }

  // --------------------------------------------------------------------------
  // 3-LAYER PARALLAX 3D MOUNTAIN & FOOTHILL VISTAS (NATURAL MATTE ALBEDO + FOG)
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
    const positions = [];
    const basePositions = [];
    const colors = [];
    const normHeights = [];
    const vertAngles = [];
    const indices = [];

    const ringStride = 5;

    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * Math.PI * 2;
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
      roughness: 0.92,
      metalness: 0.02,
      flatShading: false,
      fog: true,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
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
        { low: 0x267d39, mid: 0x38964e, crag: 0x5c7894, snow: 0xffffff },
        { low: 0x285678, mid: 0x46749c, crag: 0x6e92b8, snow: 0xf8fbff },
        { low: 0x4c78a6, mid: 0x729bc4, crag: 0x9ab8d8, snow: 0xffffff },
      ],
      MONACO: [
        { low: 0x2d8a42, mid: 0x7c745e, crag: 0xa89b84, snow: 0xf0e4d2 },
        { low: 0x346482, mid: 0x688298, crag: 0x94a8bc, snow: 0xecf3fa },
        { low: 0x547ea3, mid: 0x82a2c0, crag: 0xa8c2db, snow: 0xf4f9ff },
      ],
      MONZA: [
        { low: 0x288438, mid: 0x8a582b, crag: 0xa87442, snow: 0xe2bc88 },
        { low: 0x2c5674, mid: 0x567898, crag: 0x7e9ab8, snow: 0xf5f9ff },
        { low: 0x52789e, mid: 0x7c9ec0, crag: 0xa2bedb, snow: 0xf7fbff },
      ],
      VEGAS: [
        { low: 0x121528, mid: 0x22203b, crag: 0x352f54, snow: 0x4e4275 },
        { low: 0x0e1222, mid: 0x1a1e38, crag: 0x2a2c4f, snow: 0x3d3e6b },
        { low: 0x0a0d1a, mid: 0x14182e, crag: 0x222642, snow: 0x32365c },
      ],
      SUZUKA: [
        { low: 0x28843b, mid: 0x3c9c54, crag: 0x5c7c96, snow: 0xf7fbff },
        { low: 0x2b5678, mid: 0x4c7498, crag: 0x7092b4, snow: 0xf5f9ff },
        { low: 0x4e78a2, mid: 0x769ec2, crag: 0x9abadd, snow: 0xf8fcff },
      ],
      SILVERSTONE: [
        { low: 0x2b8c3e, mid: 0x42a452, crag: 0x648674, snow: 0xdcf0e6 },
        { low: 0x2e5e6e, mid: 0x547e8e, crag: 0x7ca2b2, snow: 0xebf5fa },
        { low: 0x547c96, mid: 0x7ca2ba, crag: 0x9ec0d6, snow: 0xf2f8fc },
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

      if (isSunset && !isNight) {
        cCrag.lerp(sunTint, 0.26);
        cSnow.lerp(new THREE.Color(0xf5b287), 0.36);
      } else if (isStorm && !isNight) {
        const slate = new THREE.Color(skyReg.fogColor);
        cLow.lerp(slate, 0.28);
        cMid.lerp(slate, 0.35);
        cCrag.lerp(slate, 0.38);
      }

      const hazeBlend = idx === 2 ? (isStorm ? 0.42 : 0.28) : (idx === 1 ? (isStorm ? 0.20 : 0.12) : 0.04);

      const posAttr = layer.geo.attributes.position;
      const colAttr = layer.geo.attributes.color;
      const basePos = layer.basePositions;
      const tmp = new THREE.Color();

      for (let i = 0; i < layer.normHeights.length; i++) {
        const ang = layer.vertAngles[i];
        const by = basePos[i * 3 + 1];

        let heightScale = 1.0;
        if (theme === 'MONACO') {
          const seaOpen = Math.sin(ang);
          if (seaOpen > 0.22) {
            const t = Math.min(1.0, (seaOpen - 0.22) / 0.34);
            heightScale = 1.0 - t * t * (3.0 - 2.0 * t);
          } else if (seaOpen < -0.15) {
            heightScale = 1.18;
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

      // Strictly zero daylight emissive glow so real sun/IBL & aerial fog shade vistas physically
      layer.mat.emissive.setHex(0x000000);
      layer.mat.emissiveIntensity = 0.0;
    });
  }

  _buildRainParticles() {
    const count = 1800;
    const positions = new Float32Array(count * 6);
    this.rainDrops = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 92;
      const y = Math.random() * 36;
      const z = (Math.random() - 0.5) * 92;
      const speed = 40 + Math.random() * 18;
      const lenScale = 0.80 + Math.random() * 0.55;
      this.rainDrops.push({ x, y, z, speed, lenScale });
      const idx = i * 6;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
      positions[idx + 3] = x + 0.18;
      positions[idx + 4] = y - 1.45 * lenScale;
      positions[idx + 5] = z + 0.12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xcfe2f2,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.rainLines = new THREE.LineSegments(geo, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.scene.add(this.rainLines);

    // Fine wet-tarmac crown micro-splashes
    const splashCount = 140;
    const splashPos = new Float32Array(splashCount * 6);
    this.rainSplashes = [];
    for (let i = 0; i < splashCount; i++) {
      this.rainSplashes.push({
        ox: (Math.random() - 0.5) * 44,
        oz: (Math.random() - 0.5) * 44,
        phase: Math.random(),
        rate: 4.2 + Math.random() * 3.4,
      });
    }
    const splashGeo = new THREE.BufferGeometry();
    splashGeo.setAttribute('position', new THREE.BufferAttribute(splashPos, 3));
    this.splashMat = new THREE.LineBasicMaterial({
      color: 0xdcebf7,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.splashLines = new THREE.LineSegments(splashGeo, this.splashMat);
    this.splashLines.frustumCulled = false;
    this.splashLines.visible = false;
    this.scene.add(this.splashLines);
  }

  // --------------------------------------------------------------------------
  // FESTIVAL SKY / BLOSSOM / CONFETTI / NEON SPARKLE PARTICLE SYSTEM
  // Drifting Pink Sakura Petals on Fuji/Suzuka, Gold/Tricolore Festival Confetti
  // on Monza/Monaco/Silverstone, and Electric Neon Sparkle Motes on Las Vegas!
  // --------------------------------------------------------------------------
  _createFestivalParticleTexture() {
    if (this._festivalTex) return this._festivalTex;
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);

    const grad = ctx.createRadialGradient(32, 30, 2, 32, 32, 28);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.55, 'rgba(255, 250, 252, 0.92)');
    grad.addColorStop(0.85, 'rgba(255, 240, 248, 0.38)');
    grad.addColorStop(1.0, 'rgba(255, 240, 248, 0.0)');
    ctx.fillStyle = grad;

    // Sculpted Sakura cherry-blossom petal / festival confetti silhouette
    ctx.beginPath();
    ctx.moveTo(32, 56);
    ctx.bezierCurveTo(10, 46, 8, 18, 25, 10);
    ctx.lineTo(32, 18);
    ctx.lineTo(39, 10);
    ctx.bezierCurveTo(56, 18, 54, 46, 32, 56);
    ctx.closePath();
    ctx.fill();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._festivalTex = tex;
    return tex;
  }

  _buildFestivalSkyParticles() {
    const count = this._maxFestivalParticles || 320;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this.festivalParticles = [];

    for (let i = 0; i < count; i++) {
      const ox = (Math.random() - 0.5) * 96;
      const oy = 1.2 + Math.random() * 24;
      const oz = (Math.random() - 0.5) * 96;
      const fallSpeed = 1.6 + Math.random() * 2.2;
      const swayAmp = 1.4 + Math.random() * 2.6;
      const swayFreq = 1.1 + Math.random() * 1.8;
      const phase = Math.random() * Math.PI * 2;
      this.festivalParticles.push({ ox, oy, oz, fallSpeed, swayAmp, swayFreq, phase });

      const idx = i * 3;
      positions[idx] = ox;
      positions[idx + 1] = oy;
      positions[idx + 2] = oz;
      colors[idx] = 1.0;
      colors[idx + 1] = 0.72;
      colors[idx + 2] = 0.86;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.festivalMat = new THREE.PointsMaterial({
      size: 0.62,
      map: this._createFestivalParticleTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.90,
      alphaTest: 0.04,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.festivalPoints = new THREE.Points(geo, this.festivalMat);
    this.festivalPoints.name = 'FestivalSkyBlossomParticles';
    this.festivalPoints.frustumCulled = false;
    this.festivalPoints.visible = true;
    this.scene.add(this.festivalPoints);
  }

  _configureFestivalParticlesForSession(theme, skyRegId, isNight) {
    if (!this.festivalPoints) return;

    const paletteByTheme = {
      // Pink Sakura Cherry Blossom Petals + Warm Sun-Motes (Fuji & Suzuka)
      FUJI:        [0xff9ec6, 0xff6ba8, 0xffd6e8, 0xff82b2, 0xffe8a3],
      SUZUKA:      [0xff8ebc, 0xff5c9e, 0xffd2e6, 0xff9ec6, 0xffdf78],
      // Italian Tricolore (Green/White/Red) + Championship Gold Festival Confetti (Monza)
      MONZA:       [0x00d45a, 0xffffff, 0xff1828, 0xffd700, 0xff6e26],
      // Monte Carlo Riviera Champagne Gold, Crimson & Turquoise Confetti / Sun-Motes (Monaco)
      MONACO:      [0xffdf4f, 0xff2a3a, 0xffffff, 0x26e6ff, 0xff9d3b],
      // British GP Union Jack Red/White/Blue & Festival Gold Confetti (Silverstone)
      SILVERSTONE: [0xff2438, 0xffffff, 0x1e78ff, 0xffd53d, 0xff7a00],
      // Las Vegas Strip Electric Neon Sparkle Motes
      VEGAS:       [0xff2ae6, 0x00f5ff, 0xffd93b, 0xb84dff, 0x00ff9d],
    };

    const pal = (isNight || theme === 'VEGAS')
      ? paletteByTheme.VEGAS
      : (paletteByTheme[theme] || paletteByTheme.FUJI);

    const colAttr = this.festivalPoints.geometry.attributes.color;
    const tmp = new THREE.Color();
    const isSunset = skyRegId === 'GOLDEN_SUNSET';
    const sunsetGold = new THREE.Color(0xffc86b);

    for (let i = 0; i < this.festivalParticles.length; i++) {
      tmp.setHex(pal[i % pal.length]);
      if (isSunset && !isNight && i % 3 === 0) {
        tmp.lerp(sunsetGold, 0.35);
      }
      colAttr.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    colAttr.needsUpdate = true;

    const isSakura = (theme === 'FUJI' || theme === 'SUZUKA') && !isNight;
    this.festivalMat.size = isSakura ? 0.68 : (isNight ? 0.56 : 0.60);
    this.festivalMat.blending = (isNight || isSunset)
      ? THREE.AdditiveBlending
      : THREE.NormalBlending;
    this.festivalMat.opacity = isNight ? 0.88 : 0.92;
    this.festivalMat.needsUpdate = true;
  }

  // --------------------------------------------------------------------------
  // NATURAL OPTICAL COCKPIT HELMET VISOR RAINDROPS, AERO RIVULETS & TEAR-OFF
  // Glassy meniscus refraction + sky-matched glints; center sightline stays clear!
  // --------------------------------------------------------------------------
  _buildCockpitVisorRain() {
    this.visorUniforms = {
      uTime:         { value: 0.0 },
      uWetness:      { value: 0.0 },
      uSpeedNorm:    { value: 0.0 },
      uSteerSlip:    { value: 0.0 },
      uTearOff:      { value: 1.2 },
      uLightning:    { value: 0.0 },
      uQualityLevel: { value: 2.0 },
      uSkyTint:      { value: new THREE.Color(0xd2e4f4) },
    };

    const visorGeo = new THREE.PlaneGeometry(2, 2);
    this.visorRainMat = new THREE.ShaderMaterial({
      uniforms: this.visorUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
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
        uniform float uQualityLevel;
        uniform vec3 uSkyTint;
        varying vec2 vUv;

        float vHash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        vec2 vHash22(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.xx + p3.yz) * p3.zy);
        }

        // Natural 3D surface-tension water beads with asymmetric gravity/wind teardrop profile
        vec3 dropletLayer(vec2 uv, float scale, float seed, float speedFade) {
          vec2 aspectUv = vec2(uv.x * 1.76, uv.y);
          vec2 gv = aspectUv * scale;
          // At pit/hairpin speeds gravity pulls drops down; above 110 km/h aero lift pushes beads upward/outward
          float windLift = mix(0.14, -0.34, smoothstep(0.22, 0.78, uSpeedNorm));
          gv.y += uTime * windLift;
          gv.x -= uTime * uSteerSlip * 0.18;

          vec2 id = floor(gv);
          vec2 f = fract(gv) - 0.5;

          vec2 rnd = vHash22(id + seed);
          if (rnd.x < 0.48) return vec3(0.0);

          float wobble = sin(uTime * (2.2 + rnd.y * 2.5) + rnd.x * 24.0) * 0.035;
          vec2 offs = (rnd - 0.5) * vec2(0.54, 0.46) + vec2(wobble, 0.0);
          vec2 p = f - offs;

          // Subtle teardrop elongation along airflow
          p.x *= 1.0 + clamp(p.y * 0.55, -0.18, 0.25);
          float rad = (0.085 + rnd.y * 0.115) * speedFade;
          float d = length(p);

          // Micro condensation wake behind sliding bead
          float trailW = rad * 0.28;
          float trail = smoothstep(trailW, 0.0, abs(p.x))
                      * smoothstep(0.0, 0.34, p.y * sign(windLift))
                      * smoothstep(0.40, 0.05, abs(p.y)) * 0.35;

          float drop = smoothstep(rad, rad * 0.62, d);
          vec2 nrm = p / max(rad, 0.001);
          // Dual optical caustic + top-sky specular crescent
          float specMain = pow(max(0.0, -nrm.x * 0.28 + nrm.y * 0.88), 7.0) * drop;
          float caustic = pow(max(0.0, nrm.x * 0.22 - nrm.y * 0.76), 5.0) * drop * 0.45;
          float meniscus = smoothstep(rad * 0.56, rad * 0.96, d) * drop;
          float alpha = max(drop * 0.42, trail * 0.24);
          return vec3(specMain + caustic + trail * 0.18, meniscus, alpha);
        }

        // High-speed radial aerodynamic boundary-layer rivulets streaming toward visor edges
        vec2 aeroStreaks(vec2 uv) {
          vec2 center = vec2(0.50 + uSteerSlip * 0.08, 0.44);
          vec2 rel = (uv - center) * vec2(1.70, 1.0);
          float r = length(rel);
          float ang = atan(rel.y, rel.x);

          // Clear aerodynamic stagnation zone in center apex sightline
          float peripheryMask = smoothstep(0.18, 0.56, r);

          float angCells = floor((ang + 3.14159265) * 32.0);
          float h1 = vHash21(vec2(angCells, 11.7));
          float angFrac = fract((ang + 3.14159265) * 32.0) - 0.5;

          float streamSpeed = (1.2 + h1 * 1.7) * (0.40 + uSpeedNorm * 2.15);
          float rFlow = fract(r * (3.4 + h1 * 2.2) - uTime * streamSpeed + h1 * 7.0);

          float width = 0.08 + (1.0 - rFlow) * 0.11;
          float head = smoothstep(width, 0.0, abs(angFrac))
                     * smoothstep(0.08, 0.44, rFlow)
                     * smoothstep(0.96, 0.56, rFlow);

          float fine = 0.0;
          if (uQualityLevel > 0.5) {
            float angCells2 = floor((ang + 3.14159265) * 62.0);
            float h2 = vHash21(vec2(angCells2, 43.1));
            float angFrac2 = fract((ang + 3.14159265) * 62.0) - 0.5;
            float rFlow2 = fract(r * 5.8 - uTime * (1.9 + h2 * 2.1) * (0.45 + uSpeedNorm * 2.3) + h2 * 13.0);
            fine = smoothstep(0.11, 0.0, abs(angFrac2))
                 * smoothstep(0.18, 0.76, rFlow2)
                 * smoothstep(0.98, 0.74, rFlow2);
          }

          float total = (head * 0.78 + fine * 0.48) * peripheryMask * smoothstep(0.16, 0.68, uSpeedNorm);
          float glint = pow(max(0.0, head), 2.2) * peripheryMask;
          return vec2(total, glint);
        }

        void main() {
          if (uWetness <= 0.01) discard;

          float wipeMask = uTearOff < 1.05 ? smoothstep(uTearOff - 0.05, uTearOff + 0.04, vUv.x) : 1.0;
          float wipeLine = uTearOff < 1.02 ? exp(-pow((vUv.x - uTearOff) * 46.0, 2.0)) * 0.50 : 0.0;

          float lowSpeedFade = mix(1.0, 0.42, clamp(uSpeedNorm, 0.0, 1.0));
          vec3 d1 = dropletLayer(vUv, 15.0, 3.1, lowSpeedFade);
          vec3 d2 = uQualityLevel > 0.5
            ? dropletLayer(vUv + vec2(0.19, 0.33), 28.0, 19.7, lowSpeedFade * 0.86)
            : vec3(0.0);
          vec3 dMicro = uQualityLevel > 1.5
            ? dropletLayer(vUv + vec2(0.41, 0.13), 46.0, 37.3, 0.68)
            : vec3(0.0);
          vec2 aero = aeroStreaks(vUv);

          // Keep central braking-marker & apex focal zone crisp and unobstructed
          float centerClear = mix(0.28, 1.0, smoothstep(0.09, 0.38, length((vUv - vec2(0.5, 0.46)) * vec2(1.42, 1.0))));

          float spec = (d1.x + d2.x * 0.82 + dMicro.x * 0.45 + aero.y * 0.88) * wipeMask * centerClear;
          float rim  = (d1.y + d2.y * 0.72 + dMicro.y * 0.38) * wipeMask * centerClear;
          float dropAlpha = (d1.z + d2.z * 0.72 + dMicro.z * 0.35 + aero.x * 0.65) * uWetness * wipeMask * centerClear;

          // Authentic FIA Zylon top visor strip & dark rubber seal edge
          float topBrow = smoothstep(0.958, 0.994, vUv.y + pow(vUv.x - 0.5, 2.0) * 0.08);
          vec3 waterCol = uSkyTint * (0.68 + spec * 1.45 + uLightning * 0.75) - vec3(rim * 0.22);
          vec3 finalCol = mix(clamp(waterCol, 0.0, 1.0), vec3(0.03, 0.04, 0.05), topBrow * 0.78) + vec3(wipeLine);
          float finalAlpha = clamp(dropAlpha * 0.58 + topBrow * 0.24 + wipeLine * 0.45, 0.0, 0.68);

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
    const targetWet = Math.min(1.0, rainInt * 0.90 + (surfaceWet > 0.08 ? surfaceWet * 0.30 : 0.0));

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
    this._smoothedYawSlip = THREE.MathUtils.lerp(
      this._smoothedYawSlip,
      THREE.MathUtils.clamp(yawRate * 0.45, -1, 1),
      Math.min(1, stepDt * 8.0)
    );

    this.visorUniforms.uTime.value = this.elapsedSkySec;
    this.visorUniforms.uWetness.value = Math.max(0.10, this._visorAccum);
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

    // Preserve real surface moisture across BOTH 2026 Sim and 1982 Sim-Parity wet sessions
    this.grooveMoisture = reg.moisture > 0.05 ? Number((reg.moisture * 0.82).toFixed(3)) : reg.moisture;
    this.offLineMoisture = reg.moisture;
    this.ambientTemp = reg.ambientTemp;

    const skyReg = forceNightSky ? WEATHER_REGIMES.NEON_NIGHT : reg;
    const isSunset = skyReg.id === 'GOLDEN_SUNSET';
    const isNight = skyReg.id === 'NEON_NIGHT';
    const isStorm = reg.id === 'MONSOON_STORM';
    const isDrizzle = reg.id === 'LIGHT_DRIZZLE';

    this.isNightActive = isNight;
    this.activeTheme = trackDef?.theme || 'FUJI';

    if (isSunset) {
      this._sunOffset.set(108, 48, 76);
      this.skyUniforms.sunDir.value.set(0.76, 0.24, 0.60).normalize();
    } else if (isNight) {
      this._sunOffset.set(55, 112, 76);
      this.skyUniforms.sunDir.value.set(0.38, 0.52, 0.76).normalize();
    } else {
      this._sunOffset.set(66, 118, 82);
      this.skyUniforms.sunDir.value.set(0.42, 0.56, 0.71).normalize();
    }

    // Sun-Drenched Vibrant Lighting (3.8-4.4 directional sun + #2e8b40 emerald ground bounce)
    const sunIntensityMap = {
      HOT_SUNNY:     4.25,
      GOLDEN_SUNSET: 3.95,
      OVERCAST_COOL: 2.85,
      LIGHT_DRIZZLE: 1.70,
      MONSOON_STORM: 1.18,
      NEON_NIGHT:    1.50,
    };
    const ambientIntensityMap = {
      HOT_SUNNY:     0.78,
      GOLDEN_SUNSET: 0.72,
      OVERCAST_COOL: 0.70,
      LIGHT_DRIZZLE: 0.54,
      MONSOON_STORM: 0.45,
      NEON_NIGHT:    0.58,
    };
    this._baseSunIntensity = sunIntensityMap[skyReg.id] ?? 4.25;
    this._baseAmbientIntensity = ambientIntensityMap[skyReg.id] ?? 0.78;

    const sunColorMap = {
      HOT_SUNNY:     0xfff4d6,
      GOLDEN_SUNSET: 0xffb858,
      OVERCAST_COOL: 0xfff8eb,
      LIGHT_DRIZZLE: 0xdce8f5,
      MONSOON_STORM: 0xb4cae0,
      NEON_NIGHT:    0xd8e8ff,
    };
    this.sunLight.color.setHex(sunColorMap[skyReg.id] || skyReg.sunColor);
    this.sunLight.intensity = this._baseSunIntensity;

    const hemiSkyMap = {
      HOT_SUNNY:     0xe6f6ff,
      GOLDEN_SUNSET: 0xffd2a6,
      OVERCAST_COOL: 0xdeecfa,
      LIGHT_DRIZZLE: 0xc2d4e8,
      MONSOON_STORM: 0x98b0c8,
      NEON_NIGHT:    0x8cb0ff,
    };
    // Vibrant #2e8b40 emerald stadium turf bounce so foliage, cars & fan-club crowds shine with rich color!
    const hemiGroundMap = {
      HOT_SUNNY:     0x2e8b40,
      GOLDEN_SUNSET: 0x3b8c3c,
      OVERCAST_COOL: 0x2a7d3b,
      LIGHT_DRIZZLE: 0x225834,
      MONSOON_STORM: 0x1a3c28,
      NEON_NIGHT:    0x1c2848,
    };
    this.ambientLight.color.setHex(hemiSkyMap[skyReg.id] || 0xe6f6ff);
    this.ambientLight.groundColor.setHex(hemiGroundMap[skyReg.id] || 0x2e8b40);
    this.ambientLight.intensity = this._baseAmbientIntensity;

    this.fillLight.color.setHex(isNight ? 0x9ec2ff : (isSunset ? 0xffd6b8 : 0xd8ecff));
    this.fillLight.intensity = isNight ? 0.42 : (isSunset ? 0.46 : 0.48);

    this.rimLight.color.setHex(isNight ? 0x94c4ff : (isSunset ? 0xffa858 : 0xffe6b8));
    this.rimLight.intensity = isNight ? 0.28 : (isSunset ? 0.36 : 0.32);

    const skyPaletteOverrides = {
      HOT_SUNNY: {
        zenith: 0x004ce8, mid: 0x1e8eff, horizon: 0x9ee6ff, antiHorizon: 0x68c4ff, sun: 0xfff5d6, boost: 1.22,
      },
      GOLDEN_SUNSET: {
        zenith: 0x1e3fa8, mid: 0xf25c3d, horizon: 0xffc24b, antiHorizon: 0x8e48a8, sun: 0xffbe55, boost: 1.24,
      },
      OVERCAST_COOL: {
        zenith: 0x2462b8, mid: 0x5c9ce6, horizon: 0xbce0fa, antiHorizon: 0x98c6ed, sun: 0xfff6e6, boost: 1.08,
      },
      LIGHT_DRIZZLE: {
        zenith: 0x2e4866, mid: 0x5a7896, horizon: 0x9ab2c8, antiHorizon: 0x849cb4, sun: 0xd2e2f2, boost: 0.96,
      },
      MONSOON_STORM: {
        zenith: 0x1c2c44, mid: 0x384e6b, horizon: 0x627a96, antiHorizon: 0x506682, sun: 0xaec6e2, boost: 0.92,
      },
      NEON_NIGHT: {
        zenith: 0x060c24, mid: 0x122048, horizon: 0x242c56, antiHorizon: 0x181e3e, sun: 0xd6e6ff, boost: 1.04,
      },
    };

    const pal = skyPaletteOverrides[skyReg.id] || {
      zenith: skyReg.skyZenith,
      mid: skyReg.skyMid,
      horizon: skyReg.skyHorizon,
      antiHorizon: skyReg.skyHorizon,
      sun: skyReg.sunColor,
      boost: 1.16,
    };

    const themeHorizonMap = {
      FUJI:        isSunset ? 0xffb480 : 0xb8e8ff,
      MONACO:      isSunset ? 0xffc478 : 0x98e4ff,
      SUZUKA:      isSunset ? 0xffae88 : 0xb2e4ff,
      MONZA:       isSunset ? 0xffba68 : 0xffe4bc,
      SILVERSTONE: isSunset ? 0xffb492 : 0xc4e4fa,
      VEGAS:       0x2e3462,
    };

    this.skyUniforms.zenithColor.value.setHex(pal.zenith);
    this.skyUniforms.midColor.value.setHex(pal.mid);
    this.skyUniforms.horizonColor.value.setHex(pal.horizon);
    this.skyUniforms.antiHorizonColor.value.setHex(pal.antiHorizon);
    this.skyUniforms.groundFogColor.value.setHex(isSunset ? 0xe89b68 : (isNight ? 0x0d1326 : 0xa8dcff));
    this.skyUniforms.sunColor.value.setHex(pal.sun);
    this.skyUniforms.themeHorizonTint.value.setHex(
      isNight ? 0x2c3462 : (themeHorizonMap[this.activeTheme] || pal.horizon)
    );
    this.skyUniforms.skyRadianceBoost.value = pal.boost;

    this.skyUniforms.nightAmount.value = isNight ? 1.0 : (isSunset ? 0.14 : 0.0);
    this.skyUniforms.sunsetAmount.value = isSunset ? 1.0 : 0.0;
    this.skyUniforms.stormDarkness.value = isStorm ? 1.0 : (isDrizzle ? 0.50 : 0.0);

    const cloudMap = {
      HOT_SUNNY:     0.18,
      GOLDEN_SUNSET: 0.34,
      OVERCAST_COOL: 0.55,
      LIGHT_DRIZZLE: 0.84,
      MONSOON_STORM: 0.95,
      NEON_NIGHT:    0.12,
    };
    this.skyUniforms.cloudCover.value = cloudMap[reg.id] ?? 0.22;

    if (this.visorUniforms) {
      this.visorUniforms.uSkyTint.value.setHex(isNight ? 0x9ec4e8 : (isSunset ? 0xf5c49e : 0xd2e4f4));
      this._visorAccum = 0.0;
    }

    const effectiveSkyReg = {
      ...skyReg,
      skyZenith: pal.zenith,
      skyMid: pal.mid,
      skyHorizon: pal.horizon,
      sunColor: pal.sun,
    };

    this.scene.fog.color.setHex(isSunset ? 0xe89b68 : (isNight ? 0x0d1326 : (isStorm || isDrizzle ? skyReg.fogColor : 0xa8dcff)));
    this.scene.fog.density = Math.min(0.00026, (skyReg.fogDensity || 0.00014) * (isStorm ? 0.38 : 0.20));

    this._tintVistaLayersForBiome(this.activeTheme, isNight, effectiveSkyReg);
    this._configureFestivalParticlesForSession(this.activeTheme, skyReg.id, isNight);
    this._bindPolyHavenOrFallbackEnvironment(effectiveSkyReg, this.activeTheme, isNight);

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
    const safeDt = Math.max(0.0, Math.min(0.1, Number(dt) || 0.016));
    this.elapsedSkySec += safeDt;
    this.skyUniforms.uTime.value = this.elapsedSkySec;
    this.skyUniforms.retroMode.value = visualStyle === '1982_ARCADE' ? 1.0 : 0.0;

    if (this._currentHdrMix !== this._targetHdrMix) {
      const blendStep = 1.0 - Math.exp(-safeDt * 8.0);
      this._currentHdrMix += (this._targetHdrMix - this._currentHdrMix) * blendStep;
      if (Math.abs(this._targetHdrMix - this._currentHdrMix) < 0.004) {
        this._currentHdrMix = this._targetHdrMix;
      }
      this.skyUniforms.uHdrMix.value = this._currentHdrMix;
    }

    const activeReg = WEATHER_REGIMES[this.currentRegimeId] || WEATHER_REGIMES.HOT_SUNNY;

    if (focusTargetPos) {
      this.sunLight.target.position.set(focusTargetPos.x, focusTargetPos.y, focusTargetPos.z);
      this.sunLight.position.set(
        focusTargetPos.x + this._sunOffset.x,
        focusTargetPos.y + this._sunOffset.y,
        focusTargetPos.z + this._sunOffset.z
      );
      this.sunLight.target.updateMatrixWorld();
    }

    if (cameraPos && this.vistaLayers) {
      const dx = cameraPos.x - VISTA_CENTER_X;
      const dz = cameraPos.z - VISTA_CENTER_Z;
      for (const layer of this.vistaLayers) {
        layer.mesh.position.x = dx * layer.parallax;
        layer.mesh.position.z = dz * layer.parallax;
      }
    }

    if (activeReg.hasLightning) {
      this.nextLightningSec -= safeDt;
      if (this.nextLightningSec <= 0) {
        this.lightningFlash = 1.0;
        this.nextLightningSec = 5.5 + Math.random() * 9.0;
        if (callbacks.onThunder) callbacks.onThunder();
      }
    }
    if (this.lightningFlash > 0) {
      this.lightningFlash = Math.max(0, this.lightningFlash - safeDt * 4.2);
    }

    this.skyUniforms.flashBoost.value = this.lightningFlash;
    if (cameraPos) {
      this.skyDome.position.copy(cameraPos);
    }

    this.sunLight.intensity = this._baseSunIntensity + this.lightningFlash * 2.2;
    this.ambientLight.intensity = this._baseAmbientIntensity + this.lightningFlash * 0.48;

    const rainInt = activeReg.rainIntensity || 0.0;
    const raining = rainInt > 0.05 && this._activeRainCount > 0;
    this.rainLines.visible = raining;
    this.splashLines.visible = raining && !!focusTargetPos && this._activeSplashCount > 0;

    // Animate Festival Sky Blossoms / Tricolore Confetti / Neon Sparkle Motes in Clear/Sunset/Night Weather
    const showFestival = !raining && visualStyle !== '1982_ARCADE' && this.festivalPoints && this._activeFestivalCount > 0;
    if (this.festivalPoints) {
      this.festivalPoints.visible = Boolean(showFestival);
      if (showFestival && cameraPos) {
        const fAttr = this.festivalPoints.geometry.attributes.position;
        const fArr = fAttr.array;
        const fCount = Math.min(this._activeFestivalCount, this.festivalParticles.length);
        const t = this.elapsedSkySec;
        const isVegas = this.isNightActive || this.activeTheme === 'VEGAS';

        for (let i = 0; i < fCount; i++) {
          const p = this.festivalParticles[i];
          if (isVegas) {
            p.oy += p.fallSpeed * 0.45 * safeDt;
            if (p.oy > 25) {
              p.oy = 1.0 + Math.random() * 3.0;
              p.ox = (Math.random() - 0.5) * 92;
              p.oz = (Math.random() - 0.5) * 92;
            }
          } else {
            p.oy -= p.fallSpeed * safeDt;
            p.ox += Math.cos(t * 0.7 + p.phase) * 1.35 * safeDt;
            if (p.oy < -1.5) {
              p.oy = 21 + Math.random() * 6;
              p.ox = (Math.random() - 0.5) * 92;
              p.oz = (Math.random() - 0.5) * 92;
            }
          }

          const swirlX = Math.sin(t * p.swayFreq + p.phase) * p.swayAmp;
          const swirlZ = Math.cos(t * (p.swayFreq * 0.85) + p.phase * 1.3) * p.swayAmp;
          const idx = i * 3;
          fArr[idx]     = cameraPos.x + p.ox + swirlX;
          fArr[idx + 1] = cameraPos.y + p.oy;
          fArr[idx + 2] = cameraPos.z + p.oz + swirlZ;
        }
        fAttr.needsUpdate = true;
      }
    }

    if (raining && cameraPos) {
      this.rainMat.opacity = Math.min(0.68, 0.22 + rainInt * 0.34 + this.lightningFlash * 0.18);
      this.rainMat.color.setHex(this.isNightActive ? 0xaecae8 : 0xcfe2f2);

      const posAttr = this.rainLines.geometry.attributes.position;
      const arr = posAttr.array;
      const slantX = 0.20 + rainInt * 0.15;
      const slantZ = 0.12 + rainInt * 0.09;
      const rainCount = Math.min(this._activeRainCount, this.rainDrops.length);

      for (let i = 0; i < rainCount; i++) {
        const d = this.rainDrops[i];
        d.y -= d.speed * (0.85 + rainInt * 0.45) * safeDt;
        d.x += slantX * 8.5 * safeDt;
        if (d.y < -4) {
          d.y = 28 + Math.random() * 9;
          d.x = (Math.random() - 0.5) * 88;
          d.z = (Math.random() - 0.5) * 88;
        }
        const wx = cameraPos.x + d.x;
        const wy = cameraPos.y + d.y;
        const wz = cameraPos.z + d.z;
        const len = (1.05 + rainInt * 1.25) * d.lenScale;
        const idx = i * 6;
        arr[idx]     = wx;
        arr[idx + 1] = wy;
        arr[idx + 2] = wz;
        arr[idx + 3] = wx + slantX;
        arr[idx + 4] = wy - len;
        arr[idx + 5] = wz + slantZ;
      }
      posAttr.needsUpdate = true;

      if (focusTargetPos && this._activeSplashCount > 0) {
        this.splashMat.opacity = 0.18 + rainInt * 0.28;
        const spAttr = this.splashLines.geometry.attributes.position;
        const spArr = spAttr.array;
        const baseY = focusTargetPos.y + 0.04;
        const splashCount = Math.min(this._activeSplashCount, this.rainSplashes.length);

        for (let i = 0; i < splashCount; i++) {
          const sp = this.rainSplashes[i];
          sp.phase += sp.rate * safeDt;
          if (sp.phase >= 1.0) {
            sp.phase -= 1.0;
            sp.ox = (Math.random() - 0.5) * 42;
            sp.oz = (Math.random() - 0.5) * 42;
          }
          const crown = Math.sin(sp.phase * Math.PI);
          const sx = focusTargetPos.x + sp.ox;
          const sz = focusTargetPos.z + sp.oz;
          const spread = (0.05 + sp.phase * 0.16) * (0.7 + rainInt * 0.45);
          const height = crown * (0.11 + rainInt * 0.13);
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
