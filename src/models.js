// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Motorsport PBR F1 Car Rig, Physical Damage & Tire Conditioning, Cosworth
// PCU-8D Cockpit OLED, Slotted Rotor Blackbody Glow, Realistic Mist/Smoke VFX
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TIRE_COMPOUNDS, PIT_LANE_CONFIG } from './config.js';

// ============================================================================
// SHARED PROCEDURAL MOTORSPORT PBR TEXTURES & UV PROJECTORS (ZERO GPU LEAKS)
// ============================================================================
let _sharedShadowTex = null;
function getFeatheredShadowTexture() {
  if (_sharedShadowTex) return _sharedShadowTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 512);

  // Deep grounding under-plank ambient-occlusion core so cars sit planted on asphalt
  ctx.save();
  ctx.scale(1.0, 2.0);
  const gCore = ctx.createRadialGradient(128, 128, 10, 128, 128, 118);
  gCore.addColorStop(0.0,  'rgba(1, 2, 5, 0.96)');
  gCore.addColorStop(0.46, 'rgba(2, 4, 9, 0.82)');
  gCore.addColorStop(0.74, 'rgba(3, 6, 12, 0.34)');
  gCore.addColorStop(1.0,  'rgba(3, 6, 12, 0.0)');
  ctx.fillStyle = gCore;
  ctx.fillRect(0, 0, 256, 256);
  ctx.restore();

  // Central flat-bottom Venturi floor plank dark spine
  const plankGrad = ctx.createLinearGradient(64, 0, 192, 0);
  plankGrad.addColorStop(0.0,  'rgba(1, 2, 6, 0.0)');
  plankGrad.addColorStop(0.25, 'rgba(1, 2, 6, 0.54)');
  plankGrad.addColorStop(0.50, 'rgba(0, 1, 4, 0.72)');
  plankGrad.addColorStop(0.75, 'rgba(1, 2, 6, 0.54)');
  plankGrad.addColorStop(1.0,  'rgba(1, 2, 6, 0.0)');
  ctx.fillStyle = plankGrad;
  ctx.fillRect(58, 92, 140, 328);

  // Four deep 18-inch tire contact-patch AO anchors
  const wheelSpots = [
    [48, 124],  [208, 124],
    [48, 384],  [208, 384],
  ];
  for (const [wx, wy] of wheelSpots) {
    const gw = ctx.createRadialGradient(wx, wy, 3, wx, wy, 42);
    gw.addColorStop(0.0,  'rgba(0, 1, 3, 0.88)');
    gw.addColorStop(0.55, 'rgba(1, 2, 6, 0.45)');
    gw.addColorStop(1.0,  'rgba(1, 2, 6, 0.0)');
    ctx.fillStyle = gw;
    ctx.fillRect(wx - 44, wy - 44, 88, 88);
  }

  _sharedShadowTex = new THREE.CanvasTexture(c);
  return _sharedShadowTex;
}

let _sharedCarbonMaps = null;
function getCarbonWeaveMaps() {
  if (_sharedCarbonMaps) return _sharedCarbonMaps;
  const size = 256;
  const diffC = document.createElement('canvas');
  diffC.width = size;
  diffC.height = size;
  const dCtx = diffC.getContext('2d');

  const normC = document.createElement('canvas');
  normC.width = size;
  normC.height = size;
  const nCtx = normC.getContext('2d');

  const roughC = document.createElement('canvas');
  roughC.width = size;
  roughC.height = size;
  const rCtx = roughC.getContext('2d');

  const bumpC = document.createElement('canvas');
  bumpC.width = size;
  bumpC.height = size;
  const bCtx = bumpC.getContext('2d');

  dCtx.fillStyle = '#0f1218';
  dCtx.fillRect(0, 0, size, size);
  nCtx.fillStyle = 'rgb(128, 128, 255)';
  nCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#686868';
  rCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#585858';
  bCtx.fillRect(0, 0, size, size);

  const step = 8;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const cellX = x / step;
      const cellY = y / step;
      const diag = ((cellX + cellY) % 4 + 4) % 4;
      const warpTow = diag < 2;

      dCtx.fillStyle = warpTow ? '#212733' : '#0c0f15';
      dCtx.fillRect(x, y, step - 1, step - 1);
      dCtx.fillStyle = warpTow ? '#2d3544' : '#141922';
      dCtx.fillRect(x + 1, y + 1, step - 2, (step / 2) - 1);

      dCtx.fillStyle = warpTow ? 'rgba(175, 192, 218, 0.12)' : 'rgba(4, 7, 12, 0.26)';
      if (warpTow) {
        dCtx.fillRect(x + 1, y + 2, step - 2, 1);
        dCtx.fillRect(x + 1, y + 5, step - 2, 1);
      } else {
        dCtx.fillRect(x + 2, y + 1, 1, step - 2);
        dCtx.fillRect(x + 5, y + 1, 1, step - 2);
      }

      const nx = warpTow ? 146 : 110;
      const ny = (diag === 0 || diag === 3) ? 146 : 110;
      nCtx.fillStyle = `rgb(${nx}, ${ny}, 246)`;
      nCtx.fillRect(x, y, step - 1, step - 1);
      nCtx.fillStyle = warpTow ? 'rgb(162, 136, 250)' : 'rgb(114, 150, 246)';
      nCtx.fillRect(x + 1, y + 1, step - 3, step - 3);

      rCtx.fillStyle = warpTow ? '#484848' : '#646464';
      rCtx.fillRect(x + 1, y + 1, step - 2, step - 2);
      rCtx.fillStyle = '#8f8f8f';
      rCtx.fillRect(x, y, step, 1);
      rCtx.fillRect(x, y, 1, step);

      bCtx.fillStyle = warpTow ? '#cccccc' : '#383838';
      bCtx.fillRect(x, y, step - 1, step - 1);
    }
  }

  const configureRepeat = (tex, repeatCount, isSRGB = false) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatCount, repeatCount);
    tex.anisotropy = 4;
    if (isSRGB) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  const map = configureRepeat(new THREE.CanvasTexture(diffC), 18, true);
  const normalMap = configureRepeat(new THREE.CanvasTexture(normC), 18, false);
  const roughnessMap = configureRepeat(new THREE.CanvasTexture(roughC), 18, false);
  const bumpMap = configureRepeat(new THREE.CanvasTexture(bumpC), 18, false);

  _sharedCarbonMaps = { map, normalMap, roughnessMap, bumpMap };
  return _sharedCarbonMaps;
}

// ============================================================================
// 5-STAGE PIRELLI P-ZERO TREAD WEAR, GRAINING & BLISTERING TEXTURE LUT
// Stage 0: Fresh mould-sheen slick (life > 0.78)
// Stage 1: Scrubbed matte working tread (0.55 < life <= 0.78)
// Stage 2: Lateral graining wavelets & wear band (0.35 < life <= 0.55)
// Stage 3: Overheated dark thermal blistering pockmarks (0.20 < life <= 0.35)
// Stage 4: Severe blistering + exposed dark carcass cord band (life <= 0.20)
// ============================================================================
let _tireWearStageMaps = null;
function getTireWearStageMaps() {
  if (_tireWearStageMaps) return _tireWearStageMaps;
  _tireWearStageMaps = [];

  const detRand = (seed) => {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  for (let stage = 0; stage < 5; stage++) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');

    const baseColors = ['#15171b', '#191c21', '#1e2127', '#1c1e23', '#1a1c20'];
    ctx.fillStyle = baseColors[stage];
    ctx.fillRect(0, 0, 128, 128);

    // Fine vulcanized rubber micro-grain
    const grainCount = 1400 + stage * 420;
    for (let i = 0; i < grainCount; i++) {
      const rx = detRand(i * 1.7 + stage * 53.0) * 128;
      const ry = detRand(i * 2.9 + stage * 91.0) * 128;
      const v = (stage === 0 ? 18 : 22 + stage * 4) + Math.floor(detRand(i * 4.3) * 18);
      ctx.fillStyle = `rgb(${v},${v + 1},${v + 2})`;
      ctx.fillRect(rx, ry, 2, stage >= 2 ? 4 : 2);
    }

    // Subtle circumferential wear-indicator grooves
    ctx.fillStyle = `rgba(8, 9, 12, ${Math.max(0.12, 0.48 - stage * 0.09)})`;
    for (const gx of [26, 54, 74, 102]) {
      ctx.fillRect(gx, 0, 2, 128);
    }

    // Stage 2+: Lateral graining shear ripples across working shoulder
    if (stage >= 2) {
      ctx.strokeStyle = 'rgba(48, 52, 60, 0.36)';
      ctx.lineWidth = 1.4;
      for (let y = 2; y < 128; y += 6) {
        ctx.beginPath();
        ctx.moveTo(14, y);
        ctx.quadraticCurveTo(42, y + 3, 68, y - 1);
        ctx.stroke();
      }
    }

    // Stage 3+: Dark thermal blistering band & crater pockmarks along loaded inner-center rib
    if (stage >= 3) {
      const blisterGrad = ctx.createLinearGradient(34, 0, 88, 0);
      blisterGrad.addColorStop(0.0, 'rgba(10, 11, 14, 0.0)');
      blisterGrad.addColorStop(0.35, 'rgba(7, 8, 10, 0.68)');
      blisterGrad.addColorStop(0.65, 'rgba(9, 10, 13, 0.72)');
      blisterGrad.addColorStop(1.0, 'rgba(10, 11, 14, 0.0)');
      ctx.fillStyle = blisterGrad;
      ctx.fillRect(32, 0, 58, 128);

      const pockCount = stage === 3 ? 42 : 85;
      for (let p = 0; p < pockCount; p++) {
        const px = 34 + detRand(p * 7.1 + stage * 19.0) * 52;
        const py = detRand(p * 11.3 + stage * 37.0) * 128;
        const pr = 1.4 + detRand(p * 5.7) * 2.4;
        ctx.fillStyle = 'rgba(5, 6, 8, 0.85)';
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(58, 61, 68, 0.42)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // Stage 4 (life <= 0.20): Subtle dark-bronze/graphite kevlar-cord wear band on inner shoulder
    if (stage >= 4) {
      const cordGrad = ctx.createLinearGradient(18, 0, 42, 0);
      cordGrad.addColorStop(0.0, 'rgba(46, 40, 34, 0.0)');
      cordGrad.addColorStop(0.45, 'rgba(68, 58, 46, 0.65)');
      cordGrad.addColorStop(0.75, 'rgba(56, 49, 40, 0.55)');
      cordGrad.addColorStop(1.0, 'rgba(46, 40, 34, 0.0)');
      ctx.fillStyle = cordGrad;
      ctx.fillRect(18, 0, 24, 128);

      ctx.fillStyle = 'rgba(92, 80, 64, 0.35)';
      for (let y = 0; y < 128; y += 3) {
        ctx.fillRect(25 + (y % 4), y, 8, 1);
      }
    }

    const map = new THREE.CanvasTexture(c);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1, 3);
    map.colorSpace = THREE.SRGBColorSpace;
    _tireWearStageMaps.push(map);
  }

  return _tireWearStageMaps;
}

let _sharedScuffTex = null;
function getCarbonScuffTexture() {
  if (_sharedScuffTex) return _sharedScuffTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 64);

  const mask = ctx.createRadialGradient(64, 32, 6, 64, 32, 58);
  mask.addColorStop(0.0, 'rgba(26, 28, 33, 0.88)');
  mask.addColorStop(0.65, 'rgba(34, 37, 43, 0.58)');
  mask.addColorStop(1.0, 'rgba(20, 22, 26, 0.0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, 128, 64);

  // Longitudinal tarmac/barrier abrasion striations + exposed pale gray carbon fibers
  for (let i = 0; i < 42; i++) {
    const y = 8 + ((i * 17) % 48);
    const x0 = 6 + ((i * 23) % 34);
    const len = 36 + ((i * 19) % 68);
    ctx.fillStyle = i % 3 === 0 ? 'rgba(148, 154, 164, 0.44)' : 'rgba(12, 14, 18, 0.55)';
    ctx.fillRect(x0, y, len, i % 4 === 0 ? 2 : 1);
  }

  _sharedScuffTex = new THREE.CanvasTexture(c);
  _sharedScuffTex.colorSpace = THREE.SRGBColorSpace;
  return _sharedScuffTex;
}

// Wispy turbulent FBM cloud puff texture for realistic wet tire mist & dry lockup smoke (zero round neon blobs!)
let _sharedMistPuffTex = null;
function getTurbulentMistTexture() {
  if (_sharedMistPuffTex) return _sharedMistPuffTex;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;

  const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vnoise = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3.0 - 2.0 * fx);
    const uy = fy * fy * (3.0 - 2.0 * fy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c0 = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return (a + (b - a) * ux) + ((c0 + (d - c0) * ux) - (a + (b - a) * ux)) * uy;
  };
  const fbm = (x, y) =>
    vnoise(x, y) * 0.52 +
    vnoise(x * 2.07 + 5.2, y * 2.07 - 3.1) * 0.28 +
    vnoise(x * 4.15 - 2.4, y * 4.15 + 7.7) * 0.14 +
    vnoise(x * 8.3 + 1.1, y * 8.3 + 2.9) * 0.06;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const nx = (px / (size - 1)) * 2.0 - 1.0;
      const ny = (py / (size - 1)) * 2.0 - 1.0;
      const r = Math.hypot(nx, ny);
      const radialFalloff = Math.max(0.0, 1.0 - r);
      const smoothFalloff = radialFalloff * radialFalloff * (3.0 - 2.0 * radialFalloff);
      const turb = fbm((nx + 1.5) * 2.4, (ny + 1.5) * 2.4);
      const density = Math.max(0.0, Math.min(1.0, smoothFalloff * (0.42 + turb * 0.92) - (1.0 - smoothFalloff) * 0.18));
      const shade = Math.round(226 + turb * 29);
      const idx = (py * size + px) * 4;
      data[idx] = shade;
      data[idx + 1] = Math.min(255, shade + 2);
      data[idx + 2] = Math.min(255, shade + 5);
      data[idx + 3] = Math.round(density * 255);
    }
  }
  ctx.putImageData(img, 0, 0);

  _sharedMistPuffTex = new THREE.CanvasTexture(c);
  _sharedMistPuffTex.colorSpace = THREE.SRGBColorSpace;
  return _sharedMistPuffTex;
}

// ============================================================================
// HIGH-RES PROCEDURAL MOTORSPORT LIVERY DECAL ATLAS (512x512, CACHED PER TEAM)
// ============================================================================
const _liveryTexCache = new Map();
function colorToHexStr(colVal, fallback = '#d40814') {
  try {
    const c = new THREE.Color(colVal);
    return '#' + c.getHexString();
  } catch {
    return fallback;
  }
}

function getMotorsportLiveryTexture(primaryVal, accentVal = 0xffffff, trimVal = 0xffd100, carNum = 1) {
  const pHex = colorToHexStr(primaryVal, '#d40814');
  const aHex = colorToHexStr(accentVal, '#ffffff');
  const tHex = colorToHexStr(trimVal, '#ffd100');
  const num = Number(carNum) || 1;
  const cacheKey = `${pHex}_${aHex}_${tHex}_${num}`;
  if (_liveryTexCache.has(cacheKey)) return _liveryTexCache.get(cacheKey);

  const W = 512;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  ctx.fillStyle = pHex;
  ctx.fillRect(0, 0, W, H);

  const topEdgeShade = ctx.createLinearGradient(0, 0, W, 0);
  topEdgeShade.addColorStop(0.00, 'rgba(0, 0, 0, 0.20)');
  topEdgeShade.addColorStop(0.18, 'rgba(0, 0, 0, 0.00)');
  topEdgeShade.addColorStop(0.82, 'rgba(0, 0, 0, 0.00)');
  topEdgeShade.addColorStop(1.00, 'rgba(0, 0, 0, 0.20)');
  ctx.fillStyle = topEdgeShade;
  ctx.fillRect(0, 0, W, Math.floor(H * 0.68));

  // REGION A: TOP PLANFORM ATLAS
  ctx.fillStyle = aHex;
  ctx.fillRect(241, 10, 11, 332);
  ctx.fillRect(260, 10, 11, 332);
  ctx.fillStyle = tHex;
  ctx.fillRect(236, 10, 4, 332);
  ctx.fillRect(272, 10, 4, 332);

  ctx.strokeStyle = aHex;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(92, 170);
  ctx.lineTo(188, 255);
  ctx.lineTo(164, 326);
  ctx.moveTo(W - 92, 170);
  ctx.lineTo(W - 188, 255);
  ctx.lineTo(W - 164, 326);
  ctx.stroke();

  ctx.strokeStyle = tHex;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(82, 176);
  ctx.lineTo(176, 260);
  ctx.moveTo(W - 82, 176);
  ctx.lineTo(W - 176, 260);
  ctx.stroke();

  // Nose Cone Championship Roundel
  ctx.save();
  ctx.beginPath();
  ctx.arc(256, 84, 32, 0, Math.PI * 2);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = tHex;
  ctx.stroke();

  ctx.fillStyle = '#0d1118';
  ctx.font = '900 34px "Segoe UI", Impact, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 256, 86);
  ctx.restore();

  ctx.fillStyle = tHex;
  ctx.fillRect(244, 24, 24, 14);
  ctx.fillStyle = '#11141a';
  ctx.font = '900 10px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('F1', 256, 34);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 14px "Segoe UI", Arial, sans-serif';
  ctx.fillText('VELOCE', 256, 134);

  // Engine Cover Shark-Fin Roundel
  ctx.save();
  ctx.beginPath();
  ctx.arc(256, 254, 28, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(13, 17, 24, 0.90)';
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = aHex;
  ctx.stroke();
  ctx.fillStyle = tHex;
  ctx.font = '900 28px "Segoe UI", Impact, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 256, 256);
  ctx.restore();

  ctx.fillStyle = 'rgba(10, 13, 19, 0.85)';
  for (let g = 0; g < 8; g++) {
    const gy = 188 + g * 11;
    ctx.fillRect(142, gy, 36, 5);
    ctx.fillRect(W - 178, gy, 36, 5);
  }

  // REGION B: SIDEPOD FLANK ATLAS
  ctx.fillStyle = '#10141d';
  ctx.fillRect(0, 454, W, 58);
  for (let y = 456; y < 512; y += 6) {
    for (let x = 0; x < W; x += 6) {
      const tw = (((x / 6 + y / 6) % 4) < 2);
      ctx.fillStyle = tw ? '#222938' : '#0b0e14';
      ctx.fillRect(x, y, 5, 5);
    }
  }
  ctx.fillStyle = tHex;
  ctx.fillRect(0, 449, W, 5);
  ctx.fillStyle = aHex;
  ctx.fillRect(0, 444, W, 5);

  ctx.fillStyle = aHex;
  ctx.beginPath();
  ctx.moveTo(46, 444);
  ctx.lineTo(104, 362);
  ctx.lineTo(132, 362);
  ctx.lineTo(74, 444);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = tHex;
  ctx.beginPath();
  ctx.moveTo(78, 444);
  ctx.lineTo(136, 362);
  ctx.lineTo(148, 362);
  ctx.lineTo(90, 444);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.50)';
  ctx.shadowBlur = 3;
  ctx.font = 'italic 900 40px "Segoe UI", Impact, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('PHANATIC', 158, 398);

  ctx.fillStyle = tHex;
  ctx.font = '800 15px "Segoe UI", Arial, sans-serif';
  ctx.fillText('VELOCE  •  MGU-K HYBRID  •  P-ZERO', 162, 430);
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _liveryTexCache.set(cacheKey, tex);
  return tex;
}

const _wingTexCache = new Map();
function getWingSponsorTexture(accentVal = 0xffffff, primaryVal = 0xd40814) {
  const aHex = colorToHexStr(accentVal, '#ffffff');
  const pHex = colorToHexStr(primaryVal, '#d40814');
  const key = `${aHex}_${pHex}`;
  if (_wingTexCache.has(key)) return _wingTexCache.get(key);

  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = aHex;
  ctx.fillRect(0, 0, 512, 128);

  ctx.fillStyle = pHex;
  ctx.fillRect(0, 0, 512, 14);
  ctx.fillRect(0, 114, 512, 14);

  const colObj = new THREE.Color(aHex);
  const luma = colObj.r * 0.299 + colObj.g * 0.587 + colObj.b * 0.114;
  ctx.fillStyle = luma > 0.45 ? '#0e121a' : '#ffffff';
  ctx.font = 'italic 900 50px "Segoe UI", Impact, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PHANATIC', 256, 66);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _wingTexCache.set(key, tex);
  return tex;
}

function projectMotorsportBodyUVs(sourceGeo, flipLegacyAxes = false) {
  if (!sourceGeo || !sourceGeo.attributes?.position) return sourceGeo;
  const geo = sourceGeo.clone();
  const pos = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const sign = flipLegacyAxes ? -1 : 1;
    const x = pos.getX(i) * sign;
    const y = pos.getY(i);
    const z = pos.getZ(i) * sign;
    const nx = nrm.getX(i) * sign;
    const ny = nrm.getY(i);

    if (Math.abs(nx) > Math.abs(ny) * 1.18 && y < 0.56) {
      const uRaw = nx < 0
        ? (z + 1.35) / 2.95
        : (1.60 - z) / 2.95;
      const u = Math.max(0.02, Math.min(0.98, uRaw));
      const v = 0.01 + 0.30 * Math.max(0.0, Math.min(1.0, (y - 0.07) / 0.46));
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = v;
    } else {
      const u = Math.max(0.02, Math.min(0.98, x / 1.44 + 0.5));
      const v = 0.33 + 0.66 * Math.max(0.0, Math.min(1.0, (2.08 - z) / 4.38));
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

function projectWingBannerUVs(sourceGeo) {
  if (!sourceGeo || !sourceGeo.attributes?.position) return sourceGeo;
  const geo = sourceGeo.clone();
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const spanX = Math.max(0.05, bb.max.x - bb.min.x);
  const chordZ = Math.max(0.02, bb.max.z - bb.min.z);
  const pos = geo.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = Math.max(0.02, Math.min(0.98, (pos.getX(i) - bb.min.x) / spanX));
    uvs[i * 2 + 1] = Math.max(0.04, Math.min(0.96, 1.0 - (pos.getZ(i) - bb.min.z) / chordZ));
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

function projectPlanarOledUVs(sourceGeo) {
  if (!sourceGeo || !sourceGeo.attributes?.position) return sourceGeo;
  const geo = sourceGeo.clone();
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const dx = Math.max(0.005, bb.max.x - bb.min.x);
  const dy = Math.max(0.005, bb.max.y - bb.min.y);
  const pos = geo.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = Math.max(0.0, Math.min(1.0, (pos.getX(i) - bb.min.x) / dx));
    uvs[i * 2 + 1] = Math.max(0.0, Math.min(1.0, (pos.getY(i) - bb.min.y) / dy));
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

function cloneSkinnedGroup(sourceRoot) {
  const clone = sourceRoot.clone(true);
  const srcSkinned = [];
  const dstSkinned = [];
  const srcNodes = [];
  const dstNodes = [];

  sourceRoot.traverse((n) => {
    srcNodes.push(n);
    if (n.isSkinnedMesh) srcSkinned.push(n);
  });
  clone.traverse((n) => {
    dstNodes.push(n);
    if (n.isSkinnedMesh) dstSkinned.push(n);
  });

  const nodeMap = new Map();
  for (let i = 0; i < srcNodes.length; i++) {
    nodeMap.set(srcNodes[i], dstNodes[i]);
  }

  for (let i = 0; i < dstSkinned.length; i++) {
    const srcMesh = srcSkinned[i];
    const dstMesh = dstSkinned[i];
    if (srcMesh && srcMesh.skeleton) {
      const mappedBones = srcMesh.skeleton.bones.map((b) => nodeMap.get(b) || b);
      dstMesh.bind(new THREE.Skeleton(mappedBones, srcMesh.skeleton.boneInverses), dstMesh.matrixWorld);
    }
  }

  return clone;
}

let _sharedBrakeRotorTex = null;
function getBrakeRotorTexture() {
  if (_sharedBrakeRotorTex) return _sharedBrakeRotorTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#080707';
  ctx.fillRect(0, 0, 128, 128);

  // Radially banded carbon-carbon friction ring for physical blackbody incandescence
  const g = ctx.createRadialGradient(64, 64, 18, 64, 64, 61);
  g.addColorStop(0.0,  '#050404');
  g.addColorStop(0.28, '#ffb048');
  g.addColorStop(0.64, '#ff6210');
  g.addColorStop(0.92, '#cf2800');
  g.addColorStop(1.0,  '#140805');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 64, 61, 0, Math.PI * 2);
  ctx.fill();

  // Slotted & cross-drilled cooling vanes (stay darker than friction face)
  ctx.strokeStyle = '#1f0b04';
  ctx.lineWidth = 2.0;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(a) * 24, 64 + Math.sin(a) * 24);
    ctx.lineTo(64 + Math.cos(a + 0.16) * 58, 64 + Math.sin(a + 0.16) * 58);
    ctx.stroke();
  }

  _sharedBrakeRotorTex = new THREE.CanvasTexture(c);
  _sharedBrakeRotorTex.colorSpace = THREE.SRGBColorSpace;
  return _sharedBrakeRotorTex;
}

let _sharedLollipopStopTex = null;
let _sharedLollipopGoTex = null;
function getLollipopTexture(isGo = false) {
  if (!isGo && _sharedLollipopStopTex) return _sharedLollipopStopTex;
  if (isGo && _sharedLollipopGoTex) return _sharedLollipopGoTex;

  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);

  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.fillStyle = isGo ? '#082b18' : '#0f1622';
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = isGo ? '#16a34a' : '#eab308';
  ctx.stroke();

  ctx.fillStyle = isGo ? '#22c55e' : '#ef4444';
  ctx.font = '900 54px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isGo ? 'GO! GO!' : 'BOX #1', 128, 102);
  ctx.fillStyle = isGo ? '#ffffff' : '#facc15';
  ctx.font = '800 34px "Segoe UI", Arial, sans-serif';
  ctx.fillText(isGo ? 'CLEAR' : '1ST GEAR', 128, 158);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (isGo) _sharedLollipopGoTex = tex;
  else _sharedLollipopStopTex = tex;
  return tex;
}

// ============================================================================
// ASSET LIBRARY — GLTF / GLB LOADER WITH 2026 HERO ASSETS & GRACEFUL FALLBACKS
// ============================================================================
let _cachedPitCrewRigPromise = null;
function loadPitCrewRigGltfOnce(existingLoader = null) {
  if (_cachedPitCrewRigPromise) return _cachedPitCrewRigPromise;
  const loader = existingLoader || new GLTFLoader();
  _cachedPitCrewRigPromise = new Promise((resolve) => {
    loader.load(
      './assets/models/pit_crew_rig.glb',
      (gltf) => resolve(gltf),
      undefined,
      () => resolve(null)
    );
  });
  return _cachedPitCrewRigPromise;
}

export class AssetLibrary {
  constructor() {
    this.loader = new GLTFLoader();
    this.templates = {
      chassis: null,
      chassis2026: null,
      chassisLegacy: null,
      isChassis2026: false,
      wheel: null,
      pitCrew: null,
      pitCrewRigGltf: null,
      mountFuji: null,
      yacht: null,
    };
  }

  async loadAll() {
    const loadSafe = (url) =>
      new Promise((resolve) => {
        this.loader.load(
          url,
          (gltf) => resolve(gltf.scene),
          undefined,
          (err) => {
            console.warn(`[AssetLibrary] Fallback geometry used for ${url}:`, err);
            resolve(null);
          }
        );
      });

    const [chassis2026, chassisLegacy, wheel, pitCrew, pitCrewRigGltf, mountFuji, yacht] = await Promise.all([
      loadSafe('./assets/models/f1_car_2026.glb'),
      loadSafe('./assets/models/f1_car.glb'),
      loadSafe('./assets/models/f1_wheel.glb'),
      loadSafe('./assets/models/pit_crew.glb'),
      loadPitCrewRigGltfOnce(this.loader),
      loadSafe('./assets/models/mount_fuji.glb'),
      loadSafe('./assets/models/yacht.glb'),
    ]);

    this.templates.chassis2026 = chassis2026;
    this.templates.chassisLegacy = chassisLegacy;
    this.templates.chassis = chassis2026 || chassisLegacy;
    this.templates.isChassis2026 = Boolean(chassis2026);
    this.templates.wheel = wheel;
    this.templates.pitCrew = pitCrew;
    this.templates.pitCrewRigGltf = pitCrewRigGltf;
    this.templates.mountFuji = mountFuji;
    this.templates.yacht = yacht;
    return this.templates;
  }
}

// ============================================================================
// FORMULA 1 PHYSICAL PBR CAR RIG, COSWORTH PCU-8D OLED & SIM-REALISM VFX
// ============================================================================
export class FormulaCarRig {
  constructor(assets, livery = {}) {
    const {
      primary = 0xd40814,
      accent = 0xffffff,
      trim = 0xffd100,
      helmet = 0x00e5ff,
      rim = 0x22262e,
      compound = 'SOFT',
      carNum = 1,
    } = livery;

    this._liveryState = { primary, accent, trim, helmet, rim, compound, carNum };
    this._cockpitViewActive = false;

    this.root = new THREE.Group();
    this.chassisTiltGroup = new THREE.Group();
    this.root.add(this.chassisTiltGroup);

    const carbonMaps = getCarbonWeaveMaps();
    const tireStages = getTireWearStageMaps();
    const rotorTex = getBrakeRotorTexture();
    const bodyDecalTex = getMotorsportLiveryTexture(primary, accent, trim, carNum);
    const wingDecalTex = getWingSponsorTexture(accent, primary);

    // 1. Physical Automotive Basecoat + Clearcoat Paint (emissiveIntensity = 0.0!)
    this.primaryMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: bodyDecalTex,
      metalness: 0.36,
      roughness: 0.16,
      clearcoat: 1.0,
      clearcoatRoughness: 0.038,
      clearcoatNormalMap: carbonMaps.normalMap,
      clearcoatNormalScale: new THREE.Vector2(0.03, 0.03),
      reflectivity: 0.94,
      envMapIntensity: 1.10,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });
    this.primarySolidMat = new THREE.MeshPhysicalMaterial({
      color: primary,
      metalness: 0.36,
      roughness: 0.16,
      clearcoat: 1.0,
      clearcoatRoughness: 0.038,
      reflectivity: 0.94,
      envMapIntensity: 1.10,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });
    this.accentMat = new THREE.MeshPhysicalMaterial({
      color: accent,
      metalness: 0.34,
      roughness: 0.16,
      clearcoat: 1.0,
      clearcoatRoughness: 0.038,
      reflectivity: 0.94,
      envMapIntensity: 1.10,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });
    this.wingBannerMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: wingDecalTex,
      metalness: 0.30,
      roughness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.042,
      reflectivity: 0.94,
      envMapIntensity: 1.10,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });

    // 2. Satin Autoclave Pre-Preg 3K Twill Carbon-Fiber Weave (zero mirror plastic / zero glow)
    this.carbonMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: carbonMaps.map,
      normalMap: carbonMaps.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughnessMap: carbonMaps.roughnessMap,
      bumpMap: carbonMaps.bumpMap,
      bumpScale: 0.006,
      metalness: 0.16,
      roughness: 0.36,
      clearcoat: 0.22,
      clearcoatRoughness: 0.16,
      reflectivity: 0.85,
      envMapIntensity: 0.96,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });

    // 3. Cockpit Interior PBR Materials (Titanium Halo, Nomex Suit, Alcantara Gloves, Chrome Mirrors)
    this.titaniumMat = new THREE.MeshStandardMaterial({
      color: 0x2c323d,
      metalness: 0.84,
      roughness: 0.28,
      envMapIntensity: 1.05,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });
    this.cockpitFoamMat = new THREE.MeshStandardMaterial({
      color: 0x15181f,
      roughness: 0.86,
      metalness: 0.04,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });
    this.nomexSuitMat = new THREE.MeshStandardMaterial({
      color: primary,
      roughness: 0.74,
      metalness: 0.04,
      envMapIntensity: 0.45,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });
    this.gloveSuedeMat = new THREE.MeshStandardMaterial({
      color: 0x171b22,
      roughness: 0.82,
      metalness: 0.05,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });
    this.harnessMat = new THREE.MeshStandardMaterial({
      color: trim,
      roughness: 0.62,
      metalness: 0.10,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });
    this.mirrorGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xeef6ff,
      metalness: 1.0,
      roughness: 0.015,
      clearcoat: 1.0,
      clearcoatRoughness: 0.01,
      reflectivity: 1.0,
      envMapIntensity: 1.85,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });

    // 4. Live Cosworth / McLaren PCU-8D 256x128 OLED Cockpit Display
    this._initOledDisplay();

    // 5. Heat-Tempered Inconel / Titanium Tailpipe Alloy (zero fake orange daylight emissive!)
    this.exhaustMat = new THREE.MeshStandardMaterial({
      color: 0x8a8279,
      metalness: 0.92,
      roughness: 0.24,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
      envMapIntensity: 1.10,
    });

    // 6. Glossy Driver Helmet & Iridium Visor
    this.helmetMat = new THREE.MeshPhysicalMaterial({
      name: 'Driver_Helmet_Mat',
      color: helmet,
      metalness: 0.34,
      roughness: 0.14,
      clearcoat: 1.0,
      clearcoatRoughness: 0.035,
      envMapIntensity: 1.12,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });
    this.visorMat = new THREE.MeshPhysicalMaterial({
      name: 'Driver_Visor_Mat',
      color: 0x0a1c36,
      metalness: 1.0,
      roughness: 0.015,
      clearcoat: 1.0,
      clearcoatRoughness: 0.01,
      iridescence: 0.82,
      iridescenceIOR: 1.48,
      reflectivity: 1.0,
      envMapIntensity: 1.85,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });

    // 7. True LED: FIA Rear Wet Rain / ERS Harvesting LED Matrix
    this.rainLightMat = new THREE.MeshStandardMaterial({
      color: 0x52080e,
      emissive: new THREE.Color(0xff1420),
      emissiveIntensity: 0.0,
      roughness: 0.18,
      metalness: 0.10,
    });

    // 8. 18-Inch Pirelli Slick, Non-Emissive Satin Sidewall Stripe, Forged Rim & Slotted Rotor
    const compHex = TIRE_COMPOUNDS[compound]?.colorHex || '#ff2a2a';
    this._baseCompoundColor = new THREE.Color(compHex);
    this._activeTireWearStage = 0;

    this.tireRubberMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tireStages[0],
      roughness: 0.72,
      metalness: 0.04,
      envMapIntensity: 0.38,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });
    this.compoundMat = new THREE.MeshPhysicalMaterial({
      color: compHex,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
      roughness: 0.48,
      metalness: 0.02,
      clearcoat: 0.16,
      clearcoatRoughness: 0.32,
    });

    const safeRimColor = new THREE.Color(rim);
    if (safeRimColor.r > 0.65 && safeRimColor.g > 0.65 && safeRimColor.b > 0.65) {
      safeRimColor.multiplyScalar(0.38);
    }
    this.wheelRimMat = new THREE.MeshPhysicalMaterial({
      color: safeRimColor,
      metalness: 0.88,
      roughness: 0.24,
      clearcoat: 0.55,
      clearcoatRoughness: 0.10,
      reflectivity: 0.92,
      envMapIntensity: 1.05,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });
    this.nutLeftMat = new THREE.MeshStandardMaterial({
      color: 0xd91e30,
      metalness: 0.86,
      roughness: 0.22,
      envMapIntensity: 1.05,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });
    this.nutRightMat = new THREE.MeshStandardMaterial({
      color: 0x0082db,
      metalness: 0.86,
      roughness: 0.22,
      envMapIntensity: 1.05,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });

    // True Blackbody Thermal Emitter: Internal Slotted Carbon-Ceramic BrakeDisc ONLY!
    this.brakeDiscMat = new THREE.MeshStandardMaterial({
      color: 0x2f2b2a,
      metalness: 0.68,
      roughness: 0.38,
      bumpMap: rotorTex,
      bumpScale: 0.008,
      emissive: new THREE.Color(0x000000),
      emissiveMap: rotorTex,
      emissiveIntensity: 0.0,
    });
    this.caliperMat = new THREE.MeshPhysicalMaterial({
      color: primary,
      metalness: 0.72,
      roughness: 0.22,
      clearcoat: 0.75,
      clearcoatRoughness: 0.08,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
      envMapIntensity: 1.05,
    });

    // True Cockpit Shift-Strip LEDs
    this.shiftLedMat = new THREE.MeshBasicMaterial({ color: 0x00e676 });

    this.parts = {
      fwMain: null,
      fwEndL: null,
      fwEndR: null,
      fwFlapL: null,
      fwFlapR: null,
      rwMain: null,
      rwEndL: null,
      rwEndR: null,
      drsFlap: null,
      cockpitWheel: null,
      cockpitDash: null,
      rollHoopTCam: null,
      steeringWheel: null,
      driverArms: null,
      haloMesh: null,
      wingMirrorL: null,
      wingMirrorR: null,
      cockpitTub: null,
    };
    this.driverHeadNodes = [];
    this.suspensionNodes = {};
    this._embeddedGlbWheels = {};
    this._drsOpenSign = 1;

    const templates = assets?.templates || {};
    this._buildChassis(templates.chassis, Boolean(templates.isChassis2026));
    this._buildCockpitAndAeroDetails();
    this._buildDamageScuffOverlays();
    this._buildWheels(templates.wheel);
    this._buildVFXAttachments();

    this.wheelSpinAngle = 0;
    this._brakeThermal = 0;
    this.brakeGlow = 0;
    this.backfireTimer = 0;
    this._prevRpm = 3800;

    // Zero-GC scratch math objects for 60fps * 16 cars
    this._fwd = new THREE.Vector3();
    this._rgt = new THREE.Vector3();
    this._negTangent = new THREE.Vector3();
    this._basisMat = new THREE.Matrix4();
    this._tmpColor = new THREE.Color();
  }

  _initOledDisplay() {
    this._oledCanvas = document.createElement('canvas');
    this._oledCanvas.width = 256;
    this._oledCanvas.height = 128;
    this._oledCtx = this._oledCanvas.getContext('2d');
    this._oledTex = new THREE.CanvasTexture(this._oledCanvas);
    this._oledTex.colorSpace = THREE.SRGBColorSpace;
    this._oledLastDrawSec = -10;
    this._oledLastGear = null;
    this._oledLastDrs = null;

    this.oledMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this._oledTex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: this._oledTex,
      emissiveIntensity: 0.88,
      roughness: 0.18,
      metalness: 0.08,
    });

    this._renderOledTelemetry({
      gearLabel: '1',
      rpm: 4000,
      rpmNorm: 0.0,
      speedKmh: 0,
      compId: 'SOFT',
      tireLifePct: 100,
      tireTemps: [90, 90, 90, 90],
      brakeBiasPct: 56.5,
      fuelLaps: 7.0,
      ersPct: 100,
      ersDeploying: false,
      ersHarvesting: false,
      drsState: 'STBY',
      inPit: false,
    });
  }

  // Authentic Cosworth CCW Mk3 / McLaren Applied PCU-8D 256x128 Steering-Wheel OLED Layout
  _renderOledTelemetry(d) {
    const ctx = this._oledCtx;
    if (!ctx) return;

    // Deep OLED black canvas + crisp anodized carbon bezel grid
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#263346';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 254, 126);

    // Technical column & row dividers
    ctx.fillStyle = '#182232';
    ctx.fillRect(2, 21, 252, 1);
    ctx.fillRect(2, 103, 252, 1);
    ctx.fillRect(88, 22, 1, 81);
    ctx.fillRect(168, 22, 1, 81);

    // 1. TOP BAR (y = 3..19): 15-LED RPM Shift Array or Pit-Limiter Strobe Banner
    if (d.inPit) {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(4, 3, 248, 16);
      ctx.fillStyle = '#06080d';
      ctx.font = '900 12px "Segoe UI", Consolas, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PIT LIMITER  •  80 KM/H', 128, 11);
    } else {
      const segs = 15;
      const activeSegs = Math.round(Math.max(0, Math.min(1, d.rpmNorm)) * segs);
      const shiftFlash = d.rpm > 12350;
      for (let i = 0; i < segs; i++) {
        let onCol = '#22c55e';
        if (i >= 10) onCol = '#38bdf8';
        else if (i >= 5) onCol = '#ef4444';
        if (shiftFlash) onCol = '#38bdf8';
        ctx.fillStyle = i < activeSegs ? onCol : '#111824';
        ctx.fillRect(5 + i * 16.4, 5, 13, 12);
      }
    }

    // 2. CENTER COLUMN (x = 89..167, y = 22..102): GEAR, RPM & SPEED KM/H
    ctx.fillStyle = '#0b111c';
    ctx.fillRect(90, 23, 77, 79);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 9px Consolas, "Segoe UI", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(d.rpm)} RPM`, 128, 30);

    ctx.fillStyle = d.drsState === 'OPEN' ? '#4ade80' : '#f8fafc';
    ctx.font = '900 42px "Segoe UI", Impact, Arial, sans-serif';
    ctx.fillText(String(d.gearLabel), 128, 57);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '900 18px Consolas, "Segoe UI", sans-serif';
    ctx.fillText(`${Math.round(d.speedKmh)}`, 119, 90);
    ctx.fillStyle = '#64748b';
    ctx.font = '800 8px "Segoe UI", Arial, sans-serif';
    ctx.fillText('KMH', 152, 91);

    // 3. LEFT COLUMN (x = 3..87, y = 22..102): 4-CORNER TIRE TEMPS (°C FL/FR/RL/RR) + COMPOUND & LIFE
    const compColor = TIRE_COMPOUNDS[d.compId]?.colorHex || '#ff2a2a';
    const compShort = TIRE_COMPOUNDS[d.compId]?.short || (d.compId || 'S').charAt(0);

    ctx.fillStyle = compColor;
    ctx.fillRect(6, 25, 15, 13);
    ctx.fillStyle = '#05070b';
    ctx.font = '900 10px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(compShort, 13.5, 32);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '800 10px Consolas, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.max(0, Math.min(100, Math.round(d.tireLifePct)))}%`, 25, 32);
    ctx.fillStyle = '#64748b';
    ctx.font = '700 8px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('°C', 84, 32);

    const tempColorFor = (tc) => {
      if (tc < 74) return '#38bdf8';  // Cold out-lap
      if (tc <= 108) return '#22c55e'; // Optimal grip window
      if (tc <= 118) return '#f59e0b'; // Overheating
      return '#ef4444';                // Blistering
    };

    const corners = [
      { lbl: 'FL', val: d.tireTemps[0], x: 6,  y: 42 },
      { lbl: 'FR', val: d.tireTemps[1], x: 47, y: 42 },
      { lbl: 'RL', val: d.tireTemps[2], x: 6,  y: 72 },
      { lbl: 'RR', val: d.tireTemps[3], x: 47, y: 72 },
    ];
    for (const c of corners) {
      const tc = Math.round(Number(c.val) || 90);
      const col = tempColorFor(tc);
      ctx.fillStyle = '#0d1522';
      ctx.fillRect(c.x, c.y, 37, 26);
      ctx.fillStyle = col;
      ctx.fillRect(c.x, c.y, 3, 26);

      ctx.fillStyle = '#64748b';
      ctx.font = '700 7px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(c.lbl, c.x + 5, c.y + 7);

      ctx.fillStyle = '#f1f5f9';
      ctx.font = '900 12px Consolas, "Segoe UI", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${tc}°`, c.x + 35, c.y + 19);
    }

    // 4. RIGHT COLUMN (x = 170..253, y = 22..102): DRS STATUS, BRAKE BIAS & FUEL LAPS
    let drsBg = '#141d2b';
    let drsFg = '#64748b';
    let drsTxt = 'DRS STBY';
    if (d.drsState === 'OPEN') {
      drsBg = '#16a34a';
      drsFg = '#04130a';
      drsTxt = 'DRS OPEN';
    } else if (d.drsState === 'AVAIL') {
      drsBg = '#854d0e';
      drsFg = '#fef08a';
      drsTxt = 'DRS AVAIL';
    } else if (d.drsState === 'FAIL') {
      drsBg = '#7f1d1d';
      drsFg = '#fecaca';
      drsTxt = 'DRS FAIL';
    }
    ctx.fillStyle = drsBg;
    ctx.fillRect(173, 25, 77, 17);
    ctx.fillStyle = drsFg;
    ctx.font = '900 10px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(drsTxt, 211.5, 34);

    // Brake Bias row
    ctx.fillStyle = '#64748b';
    ctx.font = '700 8px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('BBAL', 173, 55);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '900 13px Consolas, "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${d.brakeBiasPct.toFixed(1)}%`, 250, 56);

    ctx.fillStyle = '#182232';
    ctx.fillRect(173, 67, 77, 1);

    // Fuel Laps row
    const fuelVal = Math.max(0, Number(d.fuelLaps) || 0);
    const fuelCol = fuelVal <= 1.1 ? '#ef4444' : (fuelVal <= 2.2 ? '#f59e0b' : '#4ade80');
    ctx.fillStyle = '#64748b';
    ctx.font = '700 8px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('FUEL', 173, 84);
    ctx.fillStyle = fuelCol;
    ctx.font = '900 13px Consolas, "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${fuelVal.toFixed(1)}L`, 250, 85);

    // 5. BOTTOM BAR (y = 106..123): MGU-K ERS BATTERY SOC & DEPLOY / HARVEST MODE
    ctx.fillStyle = '#0e1624';
    ctx.fillRect(5, 107, 246, 16);
    const ersClamped = Math.max(0, Math.min(100, d.ersPct));
    const ersBarW = Math.round(242 * (ersClamped / 100));
    ctx.fillStyle = d.ersDeploying ? '#22c55e' : (d.ersHarvesting ? '#f59e0b' : (ersClamped < 20 ? '#ef4444' : '#eab308'));
    ctx.fillRect(7, 109, Math.max(3, ersBarW), 12);

    const modeTag = d.ersDeploying ? 'DEPLOY' : (d.ersHarvesting ? 'HARVEST' : 'MGU-K');
    ctx.fillStyle = '#f8fafc';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 2;
    ctx.font = '900 10px Consolas, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`ERS ${Math.round(ersClamped)}%  •  ${modeTag}`, 128, 115.5);
    ctx.shadowBlur = 0;

    this._oledTex.needsUpdate = true;
  }

  _captureBaseTransform(obj) {
    if (!obj) return;
    if (obj.userData.baseRotX === undefined) {
      obj.userData.baseRotX = obj.rotation.x;
      obj.userData.baseRotY = obj.rotation.y;
      obj.userData.baseRotZ = obj.rotation.z;
    }
    if (obj.userData.basePosX === undefined) {
      obj.userData.basePosX = obj.position.x;
      obj.userData.basePosY = obj.position.y;
      obj.userData.basePosZ = obj.position.z;
    }
  }

  _buildChassis(template, is2026Glb = false) {
    if (template) {
      const clone = template.clone(true);
      let detected2026 = is2026Glb;
      clone.traverse((n) => {
        if (n.name === 'FrontWing' || n.name === 'SteeringWheel' || n.name === 'CockpitTub_Interior') {
          detected2026 = true;
        }
      });

      const flipLegacy = !detected2026;
      clone.rotation.y = flipLegacy ? Math.PI : 0;

      const toDetachWheels = [];
      clone.traverse((obj) => {
        const oname = obj.name || '';
        if (oname.includes('CollisionHull') || oname.endsWith('-convcolonly')) {
          obj.visible = false;
          return;
        }
        if (oname === 'SteeringWheel') this.parts.steeringWheel = obj;
        if (oname === 'Cockpit_Wheel') this.parts.cockpitWheel = obj;
        if (oname === 'CockpitDash') this.parts.cockpitDash = obj;
        if (oname === 'DriverArms_Gloves' || oname === 'Driver_Gloves') this.parts.driverArms = obj;
        if (oname === 'Halo_Titanium') this.parts.haloMesh = obj;
        if (oname === 'WingMirror_L') this.parts.wingMirrorL = obj;
        if (oname === 'WingMirror_R') this.parts.wingMirrorR = obj;
        if (oname === 'CockpitTub_Interior') this.parts.cockpitTub = obj;
        if (oname === 'Roll_Hoop_TCam') this.parts.rollHoopTCam = obj;
        if (oname === 'FrontWing' || oname === 'Front_Wing_Main') this.parts.fwMain = obj;

        // Handle both 2026 (-Z forward) and legacy (+Z forward rotated PI) endplate L/R conventions
        if (oname === 'FrontWing_Endplate_L') {
          this.parts.fwEndL = obj;
        } else if (oname === 'FrontWing_Endplate_R') {
          this.parts.fwEndR = obj;
        } else if (oname === 'Front_Wing_Endplate_L') {
          if (flipLegacy) this.parts.fwEndR = obj;
          else this.parts.fwEndL = obj;
        } else if (oname === 'Front_Wing_Endplate_R') {
          if (flipLegacy) this.parts.fwEndL = obj;
          else this.parts.fwEndR = obj;
        }

        if (oname === 'FrontWing_Flap_L') this.parts.fwFlapL = obj;
        if (oname === 'FrontWing_Flap_R') this.parts.fwFlapR = obj;

        if (oname === 'RearWing' || oname === 'Rear_Wing_Main') this.parts.rwMain = obj;
        if (oname === 'RearWing_Endplate_L') {
          this.parts.rwEndL = obj;
        } else if (oname === 'RearWing_Endplate_R') {
          this.parts.rwEndR = obj;
        } else if (oname === 'Rear_Wing_Endplate_L') {
          if (flipLegacy) this.parts.rwEndR = obj;
          else this.parts.rwEndL = obj;
        } else if (oname === 'Rear_Wing_Endplate_R') {
          if (flipLegacy) this.parts.rwEndL = obj;
          else this.parts.rwEndR = obj;
        }

        if (oname === 'RearWing_DRS') {
          this.parts.drsFlap = obj;
          this._drsOpenSign = 1;
        } else if (oname === 'Rear_Wing_DRS_Flap') {
          this.parts.drsFlap = obj;
          this._drsOpenSign = -1;
        }
        if (oname === 'DriverHelmet' || oname === 'Driver_Helmet' || oname === 'Driver_Visor') {
          this.driverHeadNodes.push(obj);
        }
        if (oname.startsWith('Suspension_')) {
          this.suspensionNodes[oname.slice('Suspension_'.length)] = obj;
          this._captureBaseTransform(obj);
        }
        if (oname === 'Wheel_FL' || oname === 'Wheel_FR' || oname === 'Wheel_RL' || oname === 'Wheel_RR') {
          toDetachWheels.push(obj);
        }
      });

      for (const wObj of toDetachWheels) {
        const id = wObj.name.slice('Wheel_'.length);
        if (wObj.parent) wObj.parent.remove(wObj);
        this._embeddedGlbWheels[id] = wObj;
      }

      clone.traverse((child) => {
        if (!child.isMesh) return;
        const n = child.name || '';
        const pName = child.parent?.name || '';
        const mName = child.material?.name || '';

        if (n.includes('CollisionHull') || pName.includes('CollisionHull') || mName === 'F1_Collision_Debug') {
          child.visible = false;
          return;
        }

        child.castShadow = true;
        child.receiveShadow = true;
        this._captureBaseTransform(child);

        const contextName = `${pName}/${n}`;

        if (mName === 'F1_Cockpit_OLED') {
          child.geometry = projectPlanarOledUVs(child.geometry);
          child.material = this.oledMat;
        } else if (mName === 'F1_Shift_LED') {
          child.material = this.shiftLedMat;
        } else if (mName === 'F1_Rain_Light' || mName.startsWith('Rain_Light')) {
          child.material = this.rainLightMat;
        } else if (mName === 'F1_Mirror_Chrome') {
          child.material = this.mirrorGlassMat;
        } else if (mName === 'F1_Titanium_Aero') {
          child.material = this.titaniumMat;
        } else if (mName === 'F1_Titanium_Exhaust' || mName.startsWith('Titanium_Exhaust')) {
          child.material = this.exhaustMat;
        } else if (mName === 'F1_Cockpit_Foam') {
          child.material = this.cockpitFoamMat;
        } else if (mName === 'F1_Driver_Nomex') {
          child.material = this.nomexSuitMat;
        } else if (mName === 'F1_Glove_Suede') {
          child.material = this.gloveSuedeMat;
        } else if (mName === 'F1_Harness_Belt') {
          child.material = this.harnessMat;
        } else if (mName === 'F1_Helmet_Shell' || mName.startsWith('Driver_Helmet')) {
          child.material = this.helmetMat;
        } else if (mName === 'F1_Visor_Chrome' || mName.startsWith('Driver_Visor')) {
          child.material = this.visorMat;
        } else if (mName === 'F1_Caliper_Alloy' || contextName.includes('BrakeCaliper')) {
          child.material = this.caliperMat;
        } else if (mName === 'F1_Brake_Rotor' || contextName.includes('BrakeDisc')) {
          child.material = this.brakeDiscMat;
        } else if (mName === 'F1_Carbon_Weave' || mName.startsWith('Carbon_Fiber')) {
          child.material = this.carbonMat;
        } else if (
          (pName === 'Body' && mName === 'F1_Livery_Primary') ||
          n === 'Body_Main' ||
          (mName.startsWith('Livery_Primary') && !contextName.includes('WingMirror'))
        ) {
          child.geometry = projectMotorsportBodyUVs(child.geometry, flipLegacy);
          child.material = this.primaryMat;
        } else if (mName === 'F1_Livery_Primary') {
          child.material = this.primarySolidMat;
        } else if (
          (pName === 'RearWing' || pName === 'RearWing_DRS' || n === 'Rear_Wing_Main' || n === 'Rear_Wing_DRS_Flap') &&
          (mName === 'F1_Livery_Accent' || mName.startsWith('Livery_Accent'))
        ) {
          child.geometry = projectWingBannerUVs(child.geometry);
          child.material = this.wingBannerMat;
        } else if (mName === 'F1_Livery_Accent' || mName.startsWith('Livery_Accent')) {
          child.material = this.accentMat;
        } else if (n === 'Halo_Titanium') {
          child.material = this.titaniumMat;
        } else if (n === 'Driver_Shoulders') {
          child.material = this.nomexSuitMat;
        } else if (n === 'Driver_Gloves') {
          child.material = this.gloveSuedeMat;
        } else if (
          n === 'Carbon_Chassis' ||
          n === 'Suspension_Arms' ||
          n === 'Cockpit_Wheel' ||
          n === 'Roll_Hoop_TCam' ||
          n.includes('Endplate') ||
          n.includes('Floor') ||
          n.includes('Diffuser')
        ) {
          child.material = this.carbonMat;
        } else if (n === 'Body_Accent' || n === 'Front_Wing_Main') {
          child.material = this.accentMat;
        } else if (n === 'Driver_Helmet') {
          child.material = this.helmetMat;
        } else if (n === 'Driver_Visor') {
          child.material = this.visorMat;
        } else if (n === 'Exhaust_Pipe' || n.includes('Exhaust')) {
          child.material = this.exhaustMat;
        } else if (n === 'Rear_Rain_Light' || n === 'Rain_Light' || n.includes('Rain_Light')) {
          child.material = this.rainLightMat;
        }
      });

      for (const obj of Object.values(this.parts)) {
        if (obj) this._captureBaseTransform(obj);
      }

      this.chassisTiltGroup.add(clone);
    } else {
      const bodyGeo = projectMotorsportBodyUVs(new THREE.BoxGeometry(1.4, 0.42, 4.2), false);
      const body = new THREE.Mesh(bodyGeo, this.primaryMat);
      body.position.set(0, 0.32, 0);
      body.castShadow = true;

      const fwGroup = new THREE.Group();
      fwGroup.position.set(0, 0.12, -2.2);
      const fwMainMesh = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.06, 0.34), this.accentMat);
      fwMainMesh.castShadow = true;
      const endGeo = new THREE.BoxGeometry(0.03, 0.18, 0.40);
      const endL = new THREE.Mesh(endGeo, this.carbonMat);
      endL.position.set(-0.90, 0.05, 0);
      const endR = new THREE.Mesh(endGeo, this.carbonMat);
      endR.position.set(0.90, 0.05, 0);
      fwGroup.add(fwMainMesh, endL, endR);

      const rwGeo = projectWingBannerUVs(new THREE.BoxGeometry(1.06, 0.30, 0.28));
      const rw = new THREE.Mesh(rwGeo, this.wingBannerMat);
      rw.position.set(0, 0.72, 1.95);
      rw.castShadow = true;

      this.parts.fwMain = fwGroup;
      this.parts.fwEndL = endL;
      this.parts.fwEndR = endR;
      this.parts.rwMain = rw;
      for (const obj of [fwGroup, endL, endR, rw]) this._captureBaseTransform(obj);
      this.chassisTiltGroup.add(body, fwGroup, rw);
    }

    // Grounding under-plank & 4-wheel contact shadow
    const shadGeo = new THREE.PlaneGeometry(2.62, 5.48);
    shadGeo.rotateX(-Math.PI / 2);
    const shadMat = new THREE.MeshBasicMaterial({
      map: getFeatheredShadowTexture(),
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    const shadowPlane = new THREE.Mesh(shadGeo, shadMat);
    shadowPlane.position.y = 0.026;
    this.root.add(shadowPlane);
  }

  _buildCockpitAndAeroDetails() {
    if (!this.parts.rollHoopTCam && !this._embeddedGlbWheels.FL) {
      const tCamGroup = new THREE.Group();
      tCamGroup.position.set(0, 0.825, 0.17);
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.08, 0.07), this.carbonMat);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.026, 0.065), this.carbonMat);
      bar.position.y = 0.042;
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.03, 0.072),
        new THREE.MeshStandardMaterial({ color: 0x11151d, roughness: 0.35, metalness: 0.4 })
      );
      housing.position.set(-0.085, 0.044, -0.004);
      tCamGroup.add(mast, bar, housing);
      this.chassisTiltGroup.add(tCamGroup);
    }

    if (!this.parts.cockpitTub) {
      const tubGroup = new THREE.Group();
      const sillGeo = new THREE.BoxGeometry(0.055, 0.045, 0.82);
      const sillL = new THREE.Mesh(sillGeo, this.carbonMat);
      sillL.position.set(-0.25, 0.54, -0.38);
      const sillR = new THREE.Mesh(sillGeo, this.carbonMat);
      sillR.position.set(0.25, 0.54, -0.38);
      const dashCowling = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.24), this.carbonMat);
      dashCowling.position.set(0, 0.56, -0.68);
      tubGroup.add(sillL, sillR, dashCowling);
      this.parts.cockpitTub = tubGroup;
      this.chassisTiltGroup.add(tubGroup);
    }

    if (!this.parts.haloMesh) {
      const haloGroup = new THREE.Group();
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.019, 0.19, 10), this.titaniumMat);
      pillar.position.set(0, 0.61, -0.69);
      pillar.rotation.x = 0.22;
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.020, 10, 24, Math.PI), this.titaniumMat);
      hoop.rotation.x = Math.PI / 2 + 0.08;
      hoop.rotation.z = Math.PI;
      hoop.position.set(0, 0.685, -0.43);
      haloGroup.add(pillar, hoop);
      this.parts.haloMesh = haloGroup;
      this.chassisTiltGroup.add(haloGroup);
    }

    if (!this.parts.wingMirrorL || !this.parts.wingMirrorR) {
      for (const side of [-1, 1]) {
        const mGroup = new THREE.Group();
        mGroup.position.set(side * 0.52, 0.59, -0.50);
        const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.014, 0.04), this.carbonMat);
        stalk.position.set(-side * 0.06, -0.02, 0);
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.058, 0.065), this.primarySolidMat);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.044), this.mirrorGlassMat);
        glass.position.z = 0.034;
        mGroup.add(stalk, housing, glass);
        mGroup.rotation.y = side * -0.14;
        this.chassisTiltGroup.add(mGroup);
        if (side < 0) this.parts.wingMirrorL = mGroup;
        else this.parts.wingMirrorR = mGroup;
      }
    }

    if (!this.parts.steeringWheel) {
      const swGroup = new THREE.Group();
      swGroup.position.set(0, 0.545, -0.51);
      swGroup.rotation.x = -0.24;

      const swBody = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.135, 0.024), this.carbonMat);
      const swLed = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.016, 0.028), this.shiftLedMat);
      swLed.position.set(0, 0.054, 0.004);

      const oledScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.115, 0.058), this.oledMat);
      oledScreen.position.set(0, 0.006, 0.014);

      swGroup.add(swBody, swLed, oledScreen);
      this._captureBaseTransform(swGroup);
      this.parts.steeringWheel = swGroup;
      this.chassisTiltGroup.add(swGroup);
    }

    if (!this.parts.driverArms && this.parts.steeringWheel) {
      const armsGroup = new THREE.Group();
      armsGroup.name = 'DriverArms_Gloves_Procedural';
      for (const side of [-1, 1]) {
        const gripGlove = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.068, 0.062), this.gloveSuedeMat);
        gripGlove.position.set(side * 0.118, -0.005, 0.018);

        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.07, 10), this.accentMat);
        cuff.rotation.x = Math.PI / 2;
        cuff.position.set(side * 0.126, -0.012, 0.065);

        const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.048, 0.24, 12), this.nomexSuitMat);
        forearm.rotation.x = Math.PI / 2 + 0.18;
        forearm.rotation.z = side * -0.18;
        forearm.position.set(side * 0.150, -0.042, 0.175);

        armsGroup.add(gripGlove, cuff, forearm);
      }
      this.parts.steeringWheel.add(armsGroup);
      this.parts.driverArms = armsGroup;
    }

    if (!this.parts.drsFlap) {
      const flapGeo = projectWingBannerUVs(new THREE.BoxGeometry(1.04, 0.022, 0.16));
      flapGeo.translate(0, 0, -0.08);
      const fallbackFlap = new THREE.Mesh(flapGeo, this.wingBannerMat);
      fallbackFlap.position.set(0, 0.865, 2.04);
      this._captureBaseTransform(fallbackFlap);
      this.chassisTiltGroup.add(fallbackFlap);
      this.parts.drsFlap = fallbackFlap;
      this._drsOpenSign = 1;
    }
  }

  // Subtle physical abraded carbon-fiber scuff decals revealed progressively under wing/body/wheel contact damage
  _buildDamageScuffOverlays() {
    const scuffTex = getCarbonScuffTexture();
    this._scuffFrontMat = new THREE.MeshStandardMaterial({
      map: scuffTex,
      transparent: true,
      opacity: 0.0,
      roughness: 0.92,
      metalness: 0.08,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this._scuffSideMat = this._scuffFrontMat.clone();
    this._scuffRearMat = this._scuffFrontMat.clone();

    this.scuffGroup = new THREE.Group();
    this.scuffGroup.visible = false;

    const patchGeo = new THREE.PlaneGeometry(0.42, 0.18);

    const noseScuffL = new THREE.Mesh(patchGeo, this._scuffFrontMat);
    noseScuffL.position.set(-0.56, 0.155, -2.14);
    noseScuffL.rotation.set(-Math.PI / 2 + 0.18, 0, 0.08);

    const noseScuffR = new THREE.Mesh(patchGeo, this._scuffFrontMat);
    noseScuffR.position.set(0.56, 0.155, -2.14);
    noseScuffR.rotation.set(-Math.PI / 2 + 0.18, 0, -0.08);

    const sideScuffL = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.22), this._scuffSideMat);
    sideScuffL.position.set(-0.695, 0.26, -0.18);
    sideScuffL.rotation.y = -Math.PI / 2;

    const sideScuffR = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.22), this._scuffSideMat);
    sideScuffR.position.set(0.695, 0.26, -0.18);
    sideScuffR.rotation.y = Math.PI / 2;

    const rearScuff = new THREE.Mesh(patchGeo, this._scuffRearMat);
    rearScuff.position.set(0, 0.78, 2.09);

    this.scuffGroup.add(noseScuffL, noseScuffR, sideScuffL, sideScuffR, rearScuff);
    this.chassisTiltGroup.add(this.scuffGroup);
  }

  _buildWheels(wheelTemplate) {
    this.wheels = [];

    const coords = [
      { id: 'FL', x: -0.86, y: 0.34, z: -1.48, isFront: true },
      { id: 'FR', x:  0.86, y: 0.34, z: -1.48, isFront: true },
      { id: 'RL', x: -0.86, y: 0.34, z:  1.42, isFront: false },
      { id: 'RR', x:  0.86, y: 0.34, z:  1.42, isFront: false },
    ];

    const flatPatchGeo = new THREE.CylinderGeometry(0.342, 0.342, 0.30, 12, 1, true, -0.22, 0.44);
    flatPatchGeo.rotateZ(Math.PI / 2);

    for (const c of coords) {
      const steerPivot = new THREE.Group();
      steerPivot.position.set(c.x, c.y, c.z);

      // Camber/damage pivot sits inside steerPivot so suspension damage tilts wheel camber cleanly
      const camberPivot = new THREE.Group();
      steerPivot.add(camberPivot);

      const spinPivot = new THREE.Group();
      camberPivot.add(spinPivot);

      const isLeft = c.x < 0;
      let hasGlbCaliper = Boolean(this.suspensionNodes[c.id]);
      let hasGlbRotor = false;

      const embeddedWheel = this._embeddedGlbWheels[c.id];
      if (embeddedWheel) {
        embeddedWheel.position.set(0, 0, 0);
        embeddedWheel.rotation.set(0, 0, 0);
        embeddedWheel.traverse((ch) => {
          if (!ch.isMesh) return;
          ch.castShadow = true;
          ch.receiveShadow = true;
          const cn = ch.name || '';
          const cm = ch.material?.name || '';
          if (cm === 'F1_Tire_Rubber' || cn.includes('Tire')) {
            ch.material = this.tireRubberMat;
          } else if (cm === 'F1_Compound_Stripe' || cn.includes('Compound')) {
            ch.material = this.compoundMat;
          } else if (cm === 'F1_Wheel_Rim' || cn.includes('Wheel_Rim')) {
            ch.material = this.wheelRimMat;
          } else if (cm === 'F1_Brake_Rotor' || cn.includes('BrakeDisc') || cn.includes('Brake_Disc')) {
            ch.material = this.brakeDiscMat;
            hasGlbRotor = true;
          } else if (cm === 'F1_Livery_Primary' || cm === 'F1_Helmet_Shell' || cn.includes('Nut')) {
            ch.material = isLeft ? this.nutLeftMat : this.nutRightMat;
          } else if (cm === 'F1_Carbon_Weave') {
            ch.material = this.carbonMat;
          }
        });
        spinPivot.add(embeddedWheel);
      } else if (wheelTemplate) {
        const wc = wheelTemplate.clone(true);
        wc.traverse((ch) => {
          if (!ch.isMesh) return;
          ch.castShadow = true;
          ch.receiveShadow = true;
          const cn = ch.name || '';
          const cm = ch.material?.name || '';
          if (cn === 'Tire_Tread' || cn === 'Tire_Rubber' || cm.startsWith('Tire_Rubber')) {
            ch.material = this.tireRubberMat;
          } else if (cn === 'Compound_Sidewall' || cn.includes('Compound') || cm.startsWith('Compound_Stripe')) {
            ch.material = this.compoundMat;
          } else if (cn === 'Wheel_Rim' || cm.startsWith('Wheel_Rim')) {
            ch.material = this.wheelRimMat;
          } else if (cn === 'Center_Lock_Nut' || cn.includes('Nut') || cm.startsWith('Center_Nut')) {
            ch.material = isLeft ? this.nutLeftMat : this.nutRightMat;
          } else if (cn === 'Brake_Disc' || cn.includes('BrakeDisc') || cm.startsWith('Brake_Disc')) {
            ch.material = this.brakeDiscMat;
            hasGlbRotor = true;
          } else if (cn.includes('Caliper')) {
            ch.material = this.caliperMat;
            hasGlbCaliper = true;
          }
        });
        spinPivot.add(wc);
      } else {
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.35, 28), this.tireRubberMat);
        cyl.rotation.z = Math.PI / 2;
        cyl.castShadow = true;
        const rimCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.355, 16), this.wheelRimMat);
        rimCyl.rotation.z = Math.PI / 2;
        const ringOut = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.009, 8, 24), this.compoundMat);
        ringOut.rotation.y = Math.PI / 2;
        ringOut.position.x = isLeft ? -0.176 : 0.176;
        spinPivot.add(cyl, rimCyl, ringOut);
      }

      // Ensure physical inboard slotted carbon-ceramic rotor mesh exists inside wheel spokes
      if (!hasGlbRotor) {
        const rotorMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.032, 24), this.brakeDiscMat);
        rotorMesh.rotation.z = Math.PI / 2;
        rotorMesh.position.x = isLeft ? 0.05 : -0.05;
        spinPivot.add(rotorMesh);
      }

      if (!hasGlbCaliper) {
        const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.13, 0.095), this.caliperMat);
        caliper.position.set(isLeft ? 0.03 : -0.03, 0.06, c.isFront ? 0.11 : -0.11);
        camberPivot.add(caliper);
      }

      // Rotating flat-spot rubber abrasion patch (only visible when corner has a real lockup flat-spot!)
      const flatPatchMat = new THREE.MeshStandardMaterial({
        color: 0x3b3f47,
        roughness: 0.94,
        metalness: 0.02,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      });
      const flatPatchMesh = new THREE.Mesh(flatPatchGeo, flatPatchMat);
      flatPatchMesh.visible = false;
      spinPivot.add(flatPatchMesh);

      this.root.add(steerPivot);
      this.wheels.push({
        ...c,
        baseY: c.y,
        baseSteerY: c.y,
        steerPivot,
        camberPivot,
        spinPivot,
        flatPatchMesh,
        flatPatchMat,
      });
    }
  }

  _buildVFXAttachments() {
    const mistTex = getTurbulentMistTexture();
    const puffGeo = new THREE.PlaneGeometry(1.0, 1.0);

    // 1. Realistic Atomized Wet Tire Mist & Venturi Diffuser Rooster-Tail Spray
    // Per-puff opacity lifecycle prevents wrap-around popping!
    this.sprayGroup = new THREE.Group();
    this.sprayPuffs = [];
    for (let i = 0; i < 20; i++) {
      const isCenterPlume = i >= 10;
      const wheelIdx = i % 4;
      const side = isCenterPlume
        ? ((i % 2 === 0 ? -1 : 1) * 0.18)
        : (wheelIdx % 2 === 0 ? -0.86 : 0.86);
      const baseZ = isCenterPlume
        ? 2.05
        : (wheelIdx < 2 ? -1.25 : 1.62);

      const mat = new THREE.MeshBasicMaterial({
        map: mistTex,
        color: 0xd6e4f0,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const puff = new THREE.Mesh(puffGeo, mat);
      this.sprayGroup.add(puff);
      this.sprayPuffs.push({
        mesh: puff,
        mat,
        baseX: side,
        baseZ,
        idx: i,
        isCenterPlume,
      });
    }
    this.sprayGroup.visible = false;
    this.root.add(this.sprayGroup);

    // 2. Grade-5 Titanium Skid-Block Micro-Sparks (Bottoming / Sawtooth Kerbs / Dragging ONLY!)
    this.sparkGroup = new THREE.Group();
    this.sparks = [];
    const sparkGeo = new THREE.BoxGeometry(0.007, 0.007, 0.22);
    const sparkWhiteGoldMat = new THREE.MeshBasicMaterial({
      color: 0xffe8b3,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const sparkAmberMat = new THREE.MeshBasicMaterial({
      color: 0xff9e2c,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });

    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Mesh(sparkGeo, i % 2 === 0 ? sparkWhiteGoldMat : sparkAmberMat);
      const spreadX = (((i * 0.618034) % 1.0) - 0.5) * 0.72;
      sp.position.set(spreadX, 0.03, 0.8 + (i / 12) * 2.1);
      this.sparkGroup.add(sp);
      this.sparks.push({ mesh: sp, seed: i * 0.618, spreadX });
    }
    this.sparkGroup.visible = false;
    this.root.add(this.sparkGroup);

    // 3. Off-Track Gravel & Turf Clod Kick-Up VFX
    this.gravelGroup = new THREE.Group();
    this.gravelParticles = [];
    const clodGeo = new THREE.DodecahedronGeometry(0.044, 0);
    this.gravelClodMat = new THREE.MeshStandardMaterial({
      color: 0x8a7458,
      roughness: 0.94,
      metalness: 0.01,
    });
    this.turfClodMat = new THREE.MeshStandardMaterial({
      color: 0x355228,
      roughness: 0.90,
      metalness: 0.01,
    });

    for (let i = 0; i < 16; i++) {
      const isDust = i >= 10;
      const wheelSide = i % 2 === 0 ? -0.86 : 0.86;
      const isFrontOrigin = (i % 4) < 2;
      const dustMat = isDust
        ? new THREE.MeshBasicMaterial({
            map: mistTex,
            color: 0xbda786,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        : null;
      const mesh = isDust
        ? new THREE.Mesh(puffGeo, dustMat)
        : new THREE.Mesh(clodGeo, i % 3 === 0 ? this.turfClodMat : this.gravelClodMat);
      this.gravelGroup.add(mesh);
      this.gravelParticles.push({
        mesh,
        dustMat,
        isDust,
        baseX: wheelSide,
        baseZ: isFrontOrigin ? -1.20 : 1.62,
        seed: i * 0.417,
      });
    }
    this.gravelGroup.visible = false;
    this.root.add(this.gravelGroup);

    // 4. Realistic Unloaded-Front Lockup & Heavy Slip Pirelli Rubber Smoke Puffs
    this.lockupSmokeGroup = new THREE.Group();
    this.lockupSmokePuffs = [];
    for (let i = 0; i < 12; i++) {
      const cornerIdx = i < 8 ? (i % 2) : (2 + (i % 2)); // 8 front puffs (FL/FR), 4 rear puffs (RL/RR)
      const side = cornerIdx % 2 === 0 ? -0.86 : 0.86;
      const isFront = cornerIdx < 2;
      const mat = new THREE.MeshBasicMaterial({
        map: mistTex,
        color: 0xdce4ee,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const puff = new THREE.Mesh(puffGeo, mat);
      this.lockupSmokeGroup.add(puff);
      this.lockupSmokePuffs.push({
        mesh: puff,
        mat,
        cornerIdx,
        baseX: side,
        baseZ: isFront ? -1.36 : 1.54,
        seed: i * 0.293,
      });
    }
    this.lockupSmokeGroup.visible = false;
    this.root.add(this.lockupSmokeGroup);
  }

  setCockpitViewActive(isCockpit) {
    const active = Boolean(isCockpit);
    if (this._cockpitViewActive === active) return;
    this._cockpitViewActive = active;
    for (const headNode of this.driverHeadNodes) {
      headNode.visible = !active;
    }
  }

  setCompound(compoundId) {
    const comp = TIRE_COMPOUNDS[compoundId] || TIRE_COMPOUNDS.SOFT;
    this._liveryState.compound = compoundId || 'SOFT';
    this._baseCompoundColor.setStyle(comp.colorHex);
    this.compoundMat.color.copy(this._baseCompoundColor);
    // Strictly zero emissive on painted tire rubber stripes
    this.compoundMat.emissive.setHex(0x000000);
    this.compoundMat.emissiveIntensity = 0.0;
  }

  setLivery(livery = {}) {
    let rebuildDecals = false;
    if (livery.primary !== undefined) {
      this._liveryState.primary = livery.primary;
      this.primarySolidMat.color.set(livery.primary);
      this.nomexSuitMat.color.set(livery.primary);
      if (livery.trim === undefined) {
        this.caliperMat.color.set(livery.primary);
      }
      rebuildDecals = true;
    }
    if (livery.trim !== undefined) {
      this._liveryState.trim = livery.trim;
      this.caliperMat.color.set(livery.trim);
      this.harnessMat.color.set(livery.trim);
      rebuildDecals = true;
    }
    if (livery.accent !== undefined) {
      this._liveryState.accent = livery.accent;
      this.accentMat.color.set(livery.accent);
      rebuildDecals = true;
    }
    if (livery.carNum !== undefined) {
      this._liveryState.carNum = livery.carNum;
      rebuildDecals = true;
    }
    if (rebuildDecals) {
      this.primaryMat.map = getMotorsportLiveryTexture(
        this._liveryState.primary,
        this._liveryState.accent,
        this._liveryState.trim,
        this._liveryState.carNum
      );
      this.primaryMat.needsUpdate = true;
      this.wingBannerMat.map = getWingSponsorTexture(
        this._liveryState.accent,
        this._liveryState.primary
      );
      this.wingBannerMat.needsUpdate = true;
    }
    if (livery.helmet !== undefined) {
      this._liveryState.helmet = livery.helmet;
      this.helmetMat.color.set(livery.helmet);
    }
    if (livery.rim !== undefined) {
      const cRim = new THREE.Color(livery.rim);
      if (cRim.r > 0.65 && cRim.g > 0.65 && cRim.b > 0.65) {
        cRim.multiplyScalar(0.38);
      }
      this.wheelRimMat.color.copy(cRim);
    }
    if (livery.compound !== undefined) {
      this.setCompound(livery.compound);
    }
  }

  // Modern 1.6L V6 turbo-hybrid F1 cars do not shoot external shift flames: clean no-ops
  triggerShiftFlame() {}
  triggerBackfire() {}

  updateVisuals(carState, trackFrame, moistureW, dt, elapsedSec) {
    this.updateTransformAndVFX(carState, trackFrame, moistureW, dt, elapsedSec);
  }

  updateTransformAndVFX(carState, trackFrame, moistureW, dt, elapsedSec) {
    const safeDt = Math.max(0.0, Math.min(0.1, Number(dt) || 0.0));
    const yaw = carState.relYaw || 0;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    this._fwd
      .copy(trackFrame.tangent)
      .multiplyScalar(cosY)
      .addScaledVector(trackFrame.right, sinY)
      .normalize();
    this._rgt.crossVectors(this._fwd, trackFrame.normal).normalize();

    this._negTangent.copy(this._fwd).negate();
    this._basisMat.makeBasis(this._rgt, trackFrame.normal, this._negTangent);
    this.root.position.copy(trackFrame.pos);
    this.root.quaternion.setFromRotationMatrix(this._basisMat);

    // Hide player's own helmet mesh in Cockpit Eye-Point View so sightline is 100% clear
    if (carState.isCockpitView !== undefined || carState.cameraIndex !== undefined || carState.cameraModeIdx !== undefined) {
      const wantHide = Boolean(
        carState.isCockpitView ||
        (carState.isPlayer && (carState.cameraIndex === 2 || carState.cameraModeIdx === 2))
      );
      this.setCockpitViewActive(wantHide);
    }

    // Authoritative 240Hz suspension pitch, roll, Venturi heave & pit-jack lift
    const jackLift = carState.pitJackLift || 0;
    const heaveM = THREE.MathUtils.clamp(Number(carState.chassisHeaveM) || 0, -0.028, 0.024);
    if (Number.isFinite(carState.chassisPitchRad) && Number.isFinite(carState.chassisRollRad)) {
      this.chassisTiltGroup.rotation.x = carState.chassisPitchRad + jackLift * 0.042;
      this.chassisTiltGroup.rotation.z = carState.chassisRollRad;
    } else {
      const targetPitch = (carState.brakeInput || 0) * 0.024 - (carState.throttleInput || 0) * 0.012 + jackLift * 0.042;
      const targetRoll = -(carState.latG || 0) * 0.020;
      const tiltAlpha = safeDt > 0 ? (1.0 - Math.exp(-safeDt * 18.0)) : 0.25;
      this.chassisTiltGroup.rotation.x += (targetPitch - this.chassisTiltGroup.rotation.x) * tiltAlpha;
      this.chassisTiltGroup.rotation.z += (targetRoll - this.chassisTiltGroup.rotation.z) * tiltAlpha;
    }
    this.chassisTiltGroup.position.y = jackLift * 0.18 + heaveM;

    const speedKmh = Math.max(0, Number(carState.speedKmh) || 0);
    const speedMps = speedKmh / 3.6;
    const rpm = carState.rpm || 0;
    const rpmNorm = Math.max(0, Math.min(1, (rpm - 4500) / 8200));
    const throttleIn = carState.throttleInput || 0;
    const brakeIn = carState.brakeInput || 0;

    // Extract 4-corner flat-spot array [fl, fr, rl, rr] & tire wear / thermals
    const flatArr = Array.isArray(carState.tireFlatSpot) ? carState.tireFlatSpot : null;
    const scalarFlat = typeof carState.tireFlatSpot === 'number' ? carState.tireFlatSpot : 0;
    const cornerIds = ['FL', 'FR', 'RL', 'RR'];

    let minTireLife = 1.0;
    let sumTireLife = 0.0;
    let tireCount = 0;
    let maxTireTempC = 90.0;
    const tempsOut = [90, 90, 90, 90];

    for (let i = 0; i < 4; i++) {
      const cid = cornerIds[i];
      const tObj = carState.tires?.[cid];
      if (tObj && Number.isFinite(tObj.life)) {
        const lf = THREE.MathUtils.clamp(tObj.life, 0, 1);
        minTireLife = Math.min(minTireLife, lf);
        sumTireLife += lf;
        tireCount++;
      }
      const tc = Array.isArray(carState.tireTempsC) && Number.isFinite(carState.tireTempsC[i])
        ? carState.tireTempsC[i]
        : (tObj?.surfaceTemp ?? tObj?.temp ?? 90);
      tempsOut[i] = tc;
      if (tc > maxTireTempC) maxTireTempC = tc;
    }

    if (tireCount === 0) {
      if (Number.isFinite(carState.tireLife)) {
        minTireLife = THREE.MathUtils.clamp(carState.tireLife <= 1.05 ? carState.tireLife : carState.tireLife / 100, 0, 1);
      } else if (Number.isFinite(carState.tireWear)) {
        minTireLife = THREE.MathUtils.clamp(carState.tireWear <= 1.05 ? 1.0 - carState.tireWear : 1.0 - carState.tireWear / 100, 0, 1);
      }
      sumTireLife = minTireLife * 4;
    }
    const avgTireLife = tireCount > 0 ? sumTireLife / tireCount : minTireLife;

    // Update Pirelli Tread Wear / Graining / Blistering Texture Stage & Dynamic Roughness
    let targetStage = 0;
    if (minTireLife <= 0.20) targetStage = 4;
    else if (minTireLife <= 0.35 || (maxTireTempC > 120 && minTireLife < 0.65)) targetStage = 3;
    else if (minTireLife <= 0.55) targetStage = 2;
    else if (minTireLife <= 0.78) targetStage = 1;

    if (targetStage !== this._activeTireWearStage) {
      const stages = getTireWearStageMaps();
      this._activeTireWearStage = targetStage;
      this.tireRubberMat.map = stages[targetStage];
      this.tireRubberMat.needsUpdate = true;
    }

    const wearFactor = THREE.MathUtils.clamp((1.0 - minTireLife) / 0.85, 0, 1);
    if (moistureW > 0.08) {
      // Wet water sheen on rubber tread
      this.tireRubberMat.roughness = Math.max(0.22, 0.70 - moistureW * 0.46);
    } else if (maxTireTempC > 112) {
      // Overheated thermal blistering glaze
      const heatGlaze = THREE.MathUtils.clamp((maxTireTempC - 112) / 22, 0, 1);
      this.tireRubberMat.roughness = THREE.MathUtils.lerp(0.76, 0.50, heatGlaze);
    } else {
      // Dry slick: fresh 0.68 -> scrubbed/grained matte 0.82
      this.tireRubberMat.roughness = 0.68 + wearFactor * 0.14;
    }

    // Subtle rubber dust patina on sidewall stripe as tire wears down (zero emissive!)
    this._tmpColor.copy(this._baseCompoundColor).multiplyScalar(1.0 - wearFactor * 0.26);
    this.compoundMat.color.copy(this._tmpColor);
    this.compoundMat.roughness = 0.48 + wearFactor * 0.24;

    // Spin, steer, compress & apply suspension damage / flat-spot judder across all 4 wheels
    this.wheelSpinAngle -= (speedMps / 0.34) * safeDt;

    const dmg = carState.damage || {};
    const fwDmg = THREE.MathUtils.clamp(Number(dmg.frontWing) || 0, 0, 1);
    const fwLeftDmg = THREE.MathUtils.clamp(Number(dmg.frontWingLeft ?? fwDmg) || 0, 0, 1);
    const fwRightDmg = THREE.MathUtils.clamp(Number(dmg.frontWingRight ?? fwDmg) || 0, 0, 1);
    const rwDmg = THREE.MathUtils.clamp(Number(dmg.rearWing) || 0, 0, 1);
    const suspDmg = THREE.MathUtils.clamp(Number(dmg.suspension) || 0, 0, 1);
    const suspBias = dmg.suspensionBias || 1;
    const damagedCorner = dmg.damagedCorner || (suspBias < 0 ? 'FL' : 'FR');
    const hasPunc = Boolean(dmg.hasPuncture);

    const effSteerRad =
      carState.steerAngleRad !== undefined
        ? carState.steerAngleRad
        : (carState.steerInput || 0) * 0.42;
    const visualSteer = -effSteerRad * 0.88;
    const wComp = Array.isArray(carState.wheelCompression) ? carState.wheelCompression : null;
    const flatSpeedEnv = THREE.MathUtils.clamp((speedKmh - 18.0) / 140.0, 0.0, 1.0);
    let maxFrontFlat = 0.0;

    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      const isLeft = w.x < 0;
      const tCorner = carState.tires?.[w.id];
      const cornerFlat = THREE.MathUtils.clamp(
        flatArr ? (Number(flatArr[i]) || 0) : (Number(tCorner?.flatSpot) || scalarFlat),
        0,
        1
      );
      if (w.isFront && cornerFlat > maxFrontFlat) maxFrontFlat = cornerFlat;

      const isDamagedSuspCorner = suspDmg > 0.08 && w.id === damagedCorner;
      const isSameSideSusp = suspDmg > 0.25 && ((suspBias < 0 && isLeft) || (suspBias > 0 && !isLeft));
      const cornerSusp = isDamagedSuspCorner ? suspDmg : (isSameSideSusp ? suspDmg * 0.32 : 0.0);

      // Wheel rotation-frequency flat-spot harmonic judder (1x + 2x wheel revolution pulse)
      const flatPulse = cornerFlat > 0.03 && flatSpeedEnv > 0
        ? (Math.sin(this.wheelSpinAngle + i * 1.3) + 0.45 * Math.sin(this.wheelSpinAngle * 2.0 + i)) * cornerFlat * flatSpeedEnv
        : 0.0;

      // Steer + bent tie-rod toe offset + flat-spot knuckle shimmy
      const toeDmgOffset = cornerSusp > 0 ? (isLeft ? 1 : -1) * cornerSusp * 0.11 : 0.0;
      const shimmyYaw = w.isFront ? flatPulse * 0.015 : 0.0;
      w.steerPivot.rotation.y = (w.isFront ? visualSteer : 0.0) + toeDmgOffset + shimmyYaw;

      // Bent wishbone camber cant + punctured tire radial squat
      const cornerPunctured = Boolean(tCorner?.punctured || (hasPunc && w.id === damagedCorner));
      w.camberPivot.rotation.z = (isLeft ? 1 : -1) * cornerSusp * 0.19;
      if (cornerPunctured) {
        w.camberPivot.scale.set(1.07, 0.83, 0.88);
      } else {
        w.camberPivot.scale.set(1.0, 1.0, 1.0);
      }

      w.spinPivot.rotation.x = this.wheelSpinAngle;

      const rawComp = wComp ? (Number(wComp[i]) || 0) : 0;
      const compOffset = Math.abs(rawComp) > 0.10
        ? THREE.MathUtils.clamp((rawComp - 0.25) * 0.068, -0.045, 0.058)
        : THREE.MathUtils.clamp(rawComp, -0.045, 0.058);
      const puncDrop = cornerPunctured ? -0.044 : 0;
      const suspSag = -cornerSusp * 0.018;
      w.steerPivot.position.y = w.baseY + compOffset;
      w.camberPivot.position.y = puncDrop + suspSag + flatPulse * 0.009;

      // Show rotating flat-spot tread scuff patch when flat-spotted
      if (w.flatPatchMesh) {
        if (cornerFlat > 0.10) {
          w.flatPatchMesh.visible = true;
          w.flatPatchMat.opacity = Math.min(0.78, cornerFlat * 0.85);
        } else {
          w.flatPatchMesh.visible = false;
        }
      }

      const susp = this.suspensionNodes[w.id];
      if (susp) {
        const baseZ = susp.userData.baseRotZ || 0;
        susp.rotation.z = baseZ + (isLeft ? -1 : 1) * (compOffset * 1.15 - cornerSusp * 0.14 + flatPulse * 0.012);
      }
    }

    // Steering wheel & gloved hands rotation (+ subtle flat-spot buzz & suspension pull offset)
    const wheelTurnRad =
      (carState.steerInput !== undefined ? carState.steerInput * 0.96 : effSteerRad * 2.15) +
      (suspDmg > 0.10 ? suspDmg * 0.09 * suspBias : 0.0) +
      (maxFrontFlat > 0.05 ? Math.sin(this.wheelSpinAngle) * maxFrontFlat * flatSpeedEnv * 0.022 : 0.0);

    if (this.parts.steeringWheel) {
      const baseZ = this.parts.steeringWheel.userData.baseRotZ || 0;
      this.parts.steeringWheel.rotation.z = baseZ - wheelTurnRad;
    } else if (this.parts.cockpitWheel) {
      const baseZ = this.parts.cockpitWheel.userData.baseRotZ || 0;
      this.parts.cockpitWheel.rotation.z = baseZ + wheelTurnRad;
    }

    if (this.shiftLedMat) {
      if (rpm > 12250) this.shiftLedMat.color.setHex(0x38bdf8);
      else if (rpm > 10900) this.shiftLedMat.color.setHex(0xef4444);
      else if (rpm > 9000) this.shiftLedMat.color.setHex(0xf59e0b);
      else this.shiftLedMat.color.setHex(0x22c55e);
    }

    // FIA Rear Wet / ERS Harvesting LED Matrix (true LED emitter; off in dry full-throttle)
    const harvesting = speedKmh > 65 && throttleIn < 0.18;
    const flashRainLight = moistureW > 0.08 || carState.inPitLane || harvesting;
    if (flashRainLight) {
      const pulseOn = ((elapsedSec * 4.5 + (carState.carNum || 0) * 0.27) % 1.0) < 0.50;
      this.rainLightMat.emissiveIntensity = pulseOn ? 3.2 : 0.08;
    } else {
      this.rainLightMat.emissiveIntensity = 0.0;
    }

    // Physical Slotted Carbon-Ceramic BrakeDisc Blackbody Thermal Integrator (zero floating halo quads!)
    if (Number.isFinite(carState.brakeThermal)) {
      this._brakeThermal = THREE.MathUtils.clamp(carState.brakeThermal, 0, 1);
      this.brakeGlow = this._brakeThermal * 1.85;
    } else if (safeDt > 0) {
      const brakePower = brakeIn > 0.08 && speedMps > 12.0
        ? brakeIn * (speedMps / 88.0) * 2.75
        : 0.0;
      const airCooling = (0.52 + speedMps / 74.0) * 1.28;
      this._brakeThermal = THREE.MathUtils.clamp(
        this._brakeThermal + (brakePower - airCooling * this._brakeThermal) * safeDt,
        0.0,
        1.0
      );
      this.brakeGlow = this._brakeThermal * 1.85;
      carState.brakeThermal = this._brakeThermal;
    } else {
      this._brakeThermal = THREE.MathUtils.clamp((this.brakeGlow || 0) / 1.85, 0, 1);
    }

    const glow = this._brakeThermal > 0.08 ? (this._brakeThermal - 0.08) / 0.92 : 0.0;
    if (glow > 0.001) {
      this.brakeDiscMat.emissive.setRGB(
        Math.min(1.0, glow * 1.15),
        0.28 * glow * glow,
        0.03 * glow * glow * glow
      );
      this.brakeDiscMat.emissiveIntensity = glow * 1.85;
    } else {
      this.brakeDiscMat.emissiveIntensity = 0.0;
    }

    // Visible Physical Wing Damage, DRS Jamming & Carbon Scuffing
    const aeroFlutter = (speedKmh / 310.0) * Math.sin(elapsedSec * 34.0 + (carState.carNum || 1));

    if (this.parts.fwEndL) {
      const o = this.parts.fwEndL;
      if (fwLeftDmg > 0.70) {
        o.visible = false;
      } else {
        o.visible = true;
        o.rotation.z = (o.userData.baseRotZ || 0) + (fwLeftDmg > 0.12 ? fwLeftDmg * 0.42 + aeroFlutter * fwLeftDmg * 0.03 : 0);
        o.rotation.x = (o.userData.baseRotX || 0) + (fwLeftDmg > 0.12 ? fwLeftDmg * 0.20 : 0);
        o.position.y = (o.userData.basePosY || 0) - (fwLeftDmg > 0.12 ? fwLeftDmg * 0.024 : 0);
      }
    }
    if (this.parts.fwEndR) {
      const o = this.parts.fwEndR;
      if (fwRightDmg > 0.70) {
        o.visible = false;
      } else {
        o.visible = true;
        o.rotation.z = (o.userData.baseRotZ || 0) - (fwRightDmg > 0.12 ? fwRightDmg * 0.42 + aeroFlutter * fwRightDmg * 0.03 : 0);
        o.rotation.x = (o.userData.baseRotX || 0) + (fwRightDmg > 0.12 ? fwRightDmg * 0.20 : 0);
        o.position.y = (o.userData.basePosY || 0) - (fwRightDmg > 0.12 ? fwRightDmg * 0.024 : 0);
      }
    }
    if (this.parts.fwMain) {
      const o = this.parts.fwMain;
      const maxFw = Math.max(fwLeftDmg, fwRightDmg, fwDmg);
      const asymTilt = (fwLeftDmg - fwRightDmg) * 0.14 + (Math.abs(fwLeftDmg - fwRightDmg) < 0.04 && maxFw > 0.18 ? maxFw * 0.075 : 0);
      o.rotation.z = (o.userData.baseRotZ || 0) + asymTilt;
      o.rotation.x = (o.userData.baseRotX || 0) + (maxFw > 0.15 ? maxFw * 0.11 + aeroFlutter * maxFw * 0.015 : 0);
      o.position.y = (o.userData.basePosY || 0) - (maxFw > 0.15 ? maxFw * 0.026 : 0);
    }

    if (this.parts.rwMain) {
      const o = this.parts.rwMain;
      if (rwDmg > 0.12) {
        o.rotation.z = (o.userData.baseRotZ || 0) + rwDmg * 0.13 * suspBias + aeroFlutter * rwDmg * 0.018;
        o.rotation.y = (o.userData.baseRotY || 0) + rwDmg * 0.06 * suspBias;
        o.rotation.x = (o.userData.baseRotX || 0) - rwDmg * 0.05;
      } else {
        o.rotation.z = o.userData.baseRotZ || 0;
        o.rotation.y = o.userData.baseRotY || 0;
        o.rotation.x = o.userData.baseRotX || 0;
      }
    }

    // Subtle carbon abrasion scuff decals & paint clearcoat wear
    const maxAnyDmg = Math.max(fwDmg, fwLeftDmg, fwRightDmg, rwDmg, suspDmg);
    if (this.scuffGroup) {
      this.scuffGroup.visible = maxAnyDmg > 0.12;
      if (this.scuffGroup.visible) {
        this._scuffFrontMat.opacity = Math.min(0.82, Math.max(fwDmg, fwLeftDmg, fwRightDmg) * 0.90);
        this._scuffSideMat.opacity = Math.min(0.78, Math.max(suspDmg, maxAnyDmg * 0.55) * 0.85);
        this._scuffRearMat.opacity = Math.min(0.80, rwDmg * 0.88);
      }
    }
    this.primaryMat.clearcoatRoughness = 0.038 + maxAnyDmg * 0.18;

    // Articulated DRS Flap (functionally & visually disabled when rwDmg >= 0.35!)
    const steerMag = Math.abs(
      carState.steerInput !== undefined
        ? carState.steerInput
        : (carState.steerAngleRad || 0) * 2.4
    );
    const drsBroken = rwDmg >= 0.35;
    const drsOpen =
      !carState.exploded &&
      !drsBroken &&
      brakeIn < 0.08 &&
      Boolean(carState.drsActive);

    if (this.parts.drsFlap) {
      const o = this.parts.drsFlap;
      const baseX = o.userData.baseRotX || 0;
      const targetDrs = baseX + (drsOpen ? 0.32 * this._drsOpenSign : 0.0);
      const flapAlpha = safeDt > 0 ? (1.0 - Math.exp(-safeDt * 18.0)) : 0.3;
      o.rotation.x += (targetDrs - o.rotation.x) * flapAlpha;
      o.rotation.z = (o.userData.baseRotZ || 0) + (rwDmg > 0.50 ? rwDmg * 0.08 * suspBias : 0.0);
    }

    // Throttled ~15Hz Cosworth PCU-8D Cockpit OLED Telemetry Update (supports Player + Replay T-Cam AI focus & backward scrubs!)
    const isHeroOled = Boolean(carState.isPlayer || carState.isReplayFocus || this._cockpitViewActive || carState.carNum === 1);
    const oledInterval = isHeroOled ? 0.066 : (0.18 + ((carState.carNum || 0) % 5) * 0.015);
    const shouldRefreshOled =
      Math.abs(elapsedSec - this._oledLastDrawSec) >= oledInterval ||
      carState.gear !== this._oledLastGear ||
      drsOpen !== this._oledLastDrs;

    if (shouldRefreshOled) {
      this._oledLastDrawSec = elapsedSec;
      this._oledLastGear = carState.gear;
      this._oledLastDrs = drsOpen;

      const gearLabel = speedKmh < 3 && !carState.gear
        ? 'N'
        : (carState.gear || Math.max(1, Math.min(8, Math.ceil(speedKmh / 42))));
      const compId = carState.compound || carState.tireCompound || this._liveryState.compound || 'SOFT';
      const rawErs =
        carState.ersCharge !== undefined
          ? carState.ersCharge
          : (carState.ersSoc !== undefined ? carState.ersSoc : carState.ersEnergy);
      const ersPct =
        rawErs !== undefined
          ? (rawErs <= 1.05 ? rawErs * 100 : rawErs)
          : Math.max(18, 96 - rpmNorm * 28);
      const rawBias = Number(carState.brakeBias ?? carState.perfMods?.brakeBias ?? 56.5);
      const brakeBiasPct = rawBias <= 1.0 ? rawBias * 100 : rawBias;
      const drsState = drsBroken
        ? 'FAIL'
        : (drsOpen ? 'OPEN' : ((carState.inSlipstream || (speedKmh > 210 && steerMag < 0.12)) ? 'AVAIL' : 'STBY'));

      this._renderOledTelemetry({
        gearLabel,
        rpm,
        rpmNorm,
        speedKmh,
        compId,
        tireLifePct: avgTireLife * 100,
        tireTemps: tempsOut,
        brakeBiasPct,
        fuelLaps: carState.fuelLaps ?? 7.0,
        ersPct,
        ersDeploying: Boolean(carState.ersDeploying || (throttleIn > 0.88 && speedKmh > 120 && ersPct > 5)),
        ersHarvesting: Boolean(brakeIn > 0.25 && speedKmh > 60),
        drsState,
        inPit: Boolean(carState.inPitLane),
      });
    }

    // Realistic Wet Tire Mist & Venturi Diffuser Rooster-Tail Spray (zero popping!)
    const showSpray = moistureW > 0.06 && speedKmh > 48 && !carState.exploded;
    this.sprayGroup.visible = showSpray;
    if (showSpray) {
      const intensity = Math.min(1.0, ((speedKmh - 48) / 210) * (0.35 + moistureW * 0.95));
      for (const p of this.sprayPuffs) {
        const rate = p.isCenterPlume ? 3.8 : 5.4;
        const phase = (elapsedSec * rate + p.idx * 0.213) % 1.0;
        // Smooth bell envelope: 0 at birth, peaks mid-wake, fades cleanly to 0 before wrapping
        const lifeEnv = Math.sin(Math.PI * Math.pow(phase, 0.68));
        p.mat.opacity = lifeEnv * (p.isCenterPlume ? 0.30 : 0.22) * intensity;

        if (p.isCenterPlume) {
          p.mesh.position.z = p.baseZ + phase * (6.2 + intensity * 8.5);
          p.mesh.position.y = 0.28 + phase * (1.55 + intensity * 2.15);
          p.mesh.position.x = p.baseX + Math.sin(elapsedSec * 3.5 + p.idx * 1.7) * phase * 0.72;
          p.mesh.scale.setScalar(0.55 + phase * (2.2 + intensity * 2.6));
        } else {
          p.mesh.position.z = p.baseZ + phase * (3.2 + intensity * 4.8);
          p.mesh.position.y = 0.16 + phase * (0.72 + intensity * 1.05);
          p.mesh.position.x = p.baseX * (1.0 + phase * 0.45);
          p.mesh.scale.setScalar(0.36 + phase * (1.15 + intensity * 1.35));
        }
        p.mesh.rotation.z = elapsedSec * 1.1 + p.idx * 0.9;
      }
    }

    // Off-Track Gravel & Turf Clod Kick-Up VFX
    const offTrackActive = !carState.exploded && speedKmh > 28 && Boolean(carState.onGrass || carState.onGravel || carState.offTrack);
    this.gravelGroup.visible = offTrackActive;
    if (offTrackActive) {
      const gPower = Math.min(1.0, (speedKmh - 26) / 145);
      const dustHex = carState.onGravel ? 0xc4ad8c : 0x889674;
      for (const gp of this.gravelParticles) {
        const ph = (elapsedSec * (gp.isDust ? 4.2 : 6.8) + gp.seed) % 1.0;
        gp.mesh.position.z = gp.baseZ + ph * (2.5 + gPower * 3.4);
        gp.mesh.position.x = gp.baseX + Math.sin(ph * 5.8 + gp.seed * 8.0) * 0.26;
        if (gp.isDust && gp.dustMat) {
          gp.dustMat.color.setHex(dustHex);
          gp.dustMat.opacity = Math.sin(Math.PI * Math.pow(ph, 0.7)) * (0.10 + gPower * 0.20);
          gp.mesh.position.y = 0.16 + ph * (0.78 + gPower * 0.88);
          gp.mesh.scale.setScalar(0.32 + ph * (1.05 + gPower * 0.95));
          gp.mesh.rotation.z = elapsedSec * 1.8 + gp.seed;
        } else {
          gp.mesh.position.y = 0.05 + Math.sin(ph * Math.PI) * (0.42 + gPower * 0.56);
          gp.mesh.rotation.x = elapsedSec * 13.0 + gp.seed * 5.0;
          gp.mesh.rotation.y = elapsedSec * 10.0;
        }
      }
    }

    // Realistic Dry Lockup & Unloaded-Inside-Front Tire Smoke Puffs
    const flSlip = Math.abs(carState.tires?.FL?.slipRatio || 0);
    const frSlip = Math.abs(carState.tires?.FR?.slipRatio || 0);
    const rlSlip = Math.abs(carState.tires?.RL?.slipRatio || 0);
    const rrSlip = Math.abs(carState.tires?.RR?.slipRatio || 0);
    const maxLockSlip = Math.max(flSlip, frSlip, rlSlip, rrSlip);
    const skidInt = Math.max(
      carState.skidIntensity || 0,
      maxLockSlip > 0.20 ? Math.min(1.0, (maxLockSlip - 0.16) * 2.4) : 0,
      (carState.aiLockupPuffTimer || 0) > 0 ? 0.88 : 0
    );

    const showLockupSmoke = !carState.exploded && moistureW < 0.24 && speedKmh > 40 && skidInt > 0.44;
    this.lockupSmokeGroup.visible = showLockupSmoke;
    if (showLockupSmoke) {
      const smokePow = Math.min(1.0, (skidInt - 0.42) * 1.75);
      // Weight front lockup smoke toward the unloaded inside front wheel when turning in under braking!
      const steerSign = effSteerRad;
      const cornerWeights = [
        flSlip > 0.18 ? Math.min(1.0, flSlip * 2.5) : (steerSign < -0.025 ? 1.0 : (steerSign > 0.025 ? 0.22 : 0.75)),
        frSlip > 0.18 ? Math.min(1.0, frSlip * 2.5) : (steerSign >  0.025 ? 1.0 : (steerSign < -0.025 ? 0.22 : 0.75)),
        rlSlip > 0.20 ? Math.min(1.0, rlSlip * 2.2) : (throttleIn > 0.75 ? 0.65 : 0.15),
        rrSlip > 0.20 ? Math.min(1.0, rrSlip * 2.2) : (throttleIn > 0.75 ? 0.65 : 0.15),
      ];

      for (const sp of this.lockupSmokePuffs) {
        const wgt = cornerWeights[sp.cornerIdx];
        const ph = (elapsedSec * 5.2 + sp.seed) % 1.0;
        const lifeEnv = Math.sin(Math.PI * Math.pow(ph, 0.62));
        sp.mat.opacity = lifeEnv * smokePow * wgt * 0.34;
        sp.mesh.visible = sp.mat.opacity > 0.012;
        if (sp.mesh.visible) {
          sp.mesh.position.x = sp.baseX + Math.sin(ph * 4.5 + sp.seed * 6.0) * 0.18;
          sp.mesh.position.y = 0.08 + ph * (0.48 + smokePow * 0.52);
          sp.mesh.position.z = sp.baseZ + ph * (2.4 + smokePow * 2.8);
          sp.mesh.scale.setScalar(0.26 + ph * (0.95 + smokePow * 0.85));
          sp.mesh.rotation.z = elapsedSec * 1.9 + sp.seed;
        }
      }
    }

    // Titanium Plank Sparks — STRICTLY on real high-load bottoming, sawtooth kerb strikes, or dragging damage!
    // NEVER continuous sparks just for driving > 285 km/h on smooth tarmac!
    const bottomingStrike = Math.abs(carState.chassisHeaveM || 0) > 0.014 && speedKmh > 140;
    const kerbStrike = Boolean(carState.onCurb) && speedKmh > 120;
    const damageDragging = (hasPunc || suspDmg > 0.42 || fwDmg > 0.58 || rwDmg > 0.62) && speedKmh > 45;

    const showSparks = !carState.exploded && (bottomingStrike || kerbStrike || damageDragging);
    this.sparkGroup.visible = showSparks;
    if (showSparks) {
      const heaveExcess = Math.max(0, (Math.abs(carState.chassisHeaveM || 0) - 0.014) / 0.012);
      const sparkPower = damageDragging
        ? 0.92
        : (kerbStrike ? Math.min(1.0, (speedKmh - 110) / 160) : Math.min(1.0, 0.45 + heaveExcess * 0.55));
      const biasX = kerbStrike
        ? Math.sign(carState.lateralOffset || 0) * 0.28
        : (damageDragging && suspDmg > 0.42 ? (suspBias < 0 ? -0.55 : 0.55) : 0.0);

      for (let i = 0; i < this.sparks.length; i++) {
        const sObj = this.sparks[i];
        const ph = (elapsedSec * (18.0 + (i % 4) * 3.1) + sObj.seed) % 1.0;
        sObj.mesh.visible = ph < (0.28 + sparkPower * 0.52);
        if (sObj.mesh.visible) {
          sObj.mesh.position.z = 0.65 + ph * (2.4 + sparkPower * 1.9);
          sObj.mesh.position.x = biasX + sObj.spreadX * (0.35 + ph * 0.85);
          sObj.mesh.position.y = 0.025 + Math.abs(Math.sin(ph * Math.PI * 2.4)) * (0.11 + sparkPower * 0.14);
          sObj.mesh.rotation.x = -0.06 * Math.cos(ph * Math.PI * 2.4);
          sObj.mesh.scale.z = 0.65 + sparkPower * 0.85;
        }
      }
    }

    this._prevRpm = rpm;
  }
}

export function createCarRig(assets, livery = {}) {
  return new FormulaCarRig(assets, livery);
}

// ============================================================================
// ARTICULATED / SKELETAL PIT CREW BUILDER & ANIMATOR
// ============================================================================
function buildArticulatedFallbackMechanic(suitMat, stripeMat, helmMat, visorMat, gearMat, withWheelGun = false) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.44, 0.24), suitMat);
  torso.position.y = 1.10;
  torso.castShadow = true;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.09, 0.25), stripeMat);
  stripe.position.y = 1.16;
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.20, 0.22), suitMat);
  pelvis.position.y = 0.80;
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.060, 0.74, 10), suitMat);
  legL.position.set(-0.11, 0.38, 0);
  legL.castShadow = true;
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.060, 0.74, 10), suitMat);
  legR.position.set(0.11, 0.38, 0);
  legR.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 12), helmMat);
  head.position.set(0, 1.48, 0.02);
  head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.140, 14, 10, 0, Math.PI * 2, 0.32, 0.62), visorMat);
  visor.position.set(0, 1.48, 0.045);

  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.045, 0.52, 10), suitMat);
  armL.position.set(-0.22, 1.04, 0.16);
  armL.rotation.x = 0.85;
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.045, 0.52, 10), suitMat);
  armR.position.set(0.22, 1.04, 0.16);
  armR.rotation.x = 0.85;

  g.add(torso, stripe, pelvis, legL, legR, head, visor, armL, armR);
  if (withWheelGun) {
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.42, 12), gearMat);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(0, 0.88, 0.44);
    g.add(gun);
  }
  return g;
}

export class PitCrewDiorama {
  constructor(scene, assets, track) {
    this.group = new THREE.Group();
    this.members = [];
    this.active = false;
    this._prevElapsedSec = 0;

    this._buildCrewMaterialsAndGantry(assets);
    if (track) this.repositionForTrack(track);
    if (scene) scene.add(this.group);
  }

  _buildCrewMaterialsAndGantry(assets) {
    this.suitMat = new THREE.MeshStandardMaterial({ color: 0xd40814, roughness: 0.68, metalness: 0.06, emissiveIntensity: 0.0 });
    this.stripeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.55, metalness: 0.08, emissiveIntensity: 0.0 });
    this.helmMat = new THREE.MeshPhysicalMaterial({ color: 0xf5f8ff, roughness: 0.16, metalness: 0.28, clearcoat: 0.9, emissiveIntensity: 0.0 });
    this.visorMat = new THREE.MeshPhysicalMaterial({ color: 0x0a1628, roughness: 0.03, metalness: 0.96, clearcoat: 1.0, emissiveIntensity: 0.0 });
    this.gearMat = new THREE.MeshStandardMaterial({ color: 0x1b2029, roughness: 0.34, metalness: 0.76, emissiveIntensity: 0.0 });
    this.hoseMat = new THREE.MeshStandardMaterial({ color: 0xd99b00, roughness: 0.52, metalness: 0.18, emissiveIntensity: 0.0 });
    const mistTex = getTurbulentMistTexture();

    // Overhead Carbon Pit-Box Pneumatic Boom Rig + Air Hoses
    const boomGroup = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 3.85, 12), this.gearMat);
    post.position.set(0.2, 1.92, 4.15);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 4.5), this.gearMat);
    arm.position.set(0.2, 3.78, 2.05);
    boomGroup.add(post, arm);

    this.airHoses = [];
    const hoseAnchors = [
      [ 1.48, -1.10],
      [ 1.48,  1.10],
      [-1.42, -1.10],
      [-1.42,  1.10],
    ];
    for (const [hx, hz] of hoseAnchors) {
      const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 2.45, 8), this.hoseMat);
      hose.position.set(hx, 2.62, hz + 0.55);
      boomGroup.add(hose);
      this.airHoses.push({ mesh: hose, baseX: hx, workZ: hz, standZ: 3.1 });
    }
    this.group.add(boomGroup);

    // Staged Spare Pirelli Slick Stack on Garage Apron
    const spareStack = new THREE.Group();
    spareStack.position.set(-2.35, 0.0, 3.85);
    const spareRubberMat = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.72, metalness: 0.04 });
    for (let t = 0; t < 4; t++) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.32, 20), spareRubberMat);
      tire.position.set(0, 0.17 + t * 0.33, 0);
      tire.castShadow = true;
      spareStack.add(tire);
    }
    this.group.add(spareStack);

    const roles = [
      { role: 'FRONT_JACK', stand: [ 2.9, 0, 3.15], work: [ 2.62, 0,  0.00], standYaw: Math.PI, workYaw: -Math.PI / 2 },
      { role: 'REAR_JACK',  stand: [-2.9, 0, 3.15], work: [-2.50, 0,  0.00], standYaw: Math.PI, workYaw:  Math.PI / 2 },
      { role: 'GUN_FL',     stand: [ 1.6, 0, 3.55], work: [ 1.48, 0, -1.32], standYaw: Math.PI, workYaw: 0 },
      { role: 'GUN_FR',     stand: [ 1.1, 0, 3.10], work: [ 1.48, 0,  1.32], standYaw: Math.PI, workYaw: Math.PI },
      { role: 'GUN_RL',     stand: [-1.6, 0, 3.55], work: [-1.42, 0, -1.32], standYaw: Math.PI, workYaw: 0 },
      { role: 'GUN_RR',     stand: [-1.1, 0, 3.10], work: [-1.42, 0,  1.32], standYaw: Math.PI, workYaw: Math.PI },
      { role: 'REFUELER',   stand: [-0.1, 0, 3.45], work: [-0.18, 0,  1.38], standYaw: Math.PI, workYaw: Math.PI },
      { role: 'LOLLIPOP',   stand: [ 3.6, 0, 3.25], work: [ 2.95, 0,  1.22], standYaw: Math.PI, workYaw: Math.PI },
    ];

    for (const r of roles) {
      const holder = new THREE.Group();
      const bodySlot = new THREE.Group();
      holder.add(bodySlot);

      const fallbackMesh = assets?.templates?.pitCrew
        ? this._cloneLegacyCrewMesh(assets.templates.pitCrew)
        : buildArticulatedFallbackMechanic(
            this.suitMat,
            this.stripeMat,
            this.helmMat,
            this.visorMat,
            this.gearMat,
            r.role.startsWith('GUN_')
          );
      bodySlot.add(fallbackMesh);

      let flashMat = null;
      let lollipopSignMat = null;
      let jackMesh = null;

      if (r.role.startsWith('GUN_')) {
        // Subtle compressed nitrogen exhaust puff from Paoli pneumatic gun (no neon cyan glow!)
        flashMat = new THREE.MeshBasicMaterial({
          map: mistTex,
          color: 0xe2eaf2,
          transparent: true,
          opacity: 0.0,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const flashPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), flashMat);
        flashPlane.position.set(0, 0.44, 0.50);
        holder.add(flashPlane);
      } else if (r.role === 'FRONT_JACK' || r.role === 'REAR_JACK') {
        jackMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.10, 0.88), this.stripeMat);
        jackMesh.position.set(0, 0.08, 0.56);
        holder.add(jackMesh);
      } else if (r.role === 'LOLLIPOP') {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.85, 8), this.gearMat);
        pole.rotation.x = Math.PI / 2;
        pole.position.set(-0.15, 1.32, 0.65);
        lollipopSignMat = new THREE.MeshBasicMaterial({
          map: getLollipopTexture(false),
          transparent: true,
          side: THREE.DoubleSide,
        });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.68), lollipopSignMat);
        sign.position.set(-0.15, 1.32, 1.52);
        sign.rotation.y = Math.PI / 2;
        holder.add(pole, sign);
      }

      holder.position.set(r.stand[0], r.stand[1], r.stand[2]);
      holder.rotation.y = r.standYaw;
      this.group.add(holder);
      this.members.push({
        ...r,
        holder,
        bodySlot,
        mesh: fallbackMesh,
        flashMat,
        lollipopSignMat,
        jackMesh,
        mixer: null,
        actions: null,
        activeClipName: null,
      });
    }

    const preloadedGltf = assets?.templates?.pitCrewRigGltf;
    if (preloadedGltf) {
      this._bindRiggedCrewFromGltf(preloadedGltf);
    } else {
      loadPitCrewRigGltfOnce(assets?.loader).then((gltf) => {
        if (gltf) this._bindRiggedCrewFromGltf(gltf);
      });
    }
  }

  _cloneLegacyCrewMesh(template) {
    const mesh = template.clone(true);
    mesh.traverse((ch) => {
      if (!ch.isMesh) return;
      ch.castShadow = true;
      const cn = ch.name || '';
      const cm = ch.material?.name || '';
      if (cn === 'Crew_Suit' || cm.startsWith('Crew_Suit')) ch.material = this.suitMat;
      else if (cn === 'Crew_Chest_Stripe' || cm.startsWith('Crew_Stripe')) ch.material = this.stripeMat;
      else if (cn === 'Crew_Helmet' || cm.startsWith('Crew_Helmet')) ch.material = this.helmMat;
      else if (cn === 'Crew_Visor' || cm.startsWith('Crew_Visor')) ch.material = this.visorMat;
      else if (cn === 'Crew_Equipment' || cn.includes('Equip') || cm.startsWith('Crew_Equip') || cm.startsWith('Crew_Gear')) {
        ch.material = this.gearMat;
      }
    });
    return mesh;
  }

  _bindRiggedCrewFromGltf(gltf) {
    if (!gltf?.scene) return;
    let srcArmature = null;
    gltf.scene.traverse((n) => {
      if (n.name === 'PitCrew_Armature') srcArmature = n;
    });
    if (!srcArmature) return;

    const clips = gltf.animations || [];
    const findClip = (sub) => clips.find((c) => c.name && c.name.includes(sub)) || null;
    const idleClip = findClip('Pit_Idle_Ready') || clips[0] || null;
    const swapClip = findClip('Pit_Tire_Swap') || idleClip;
    const jackClip = findClip('Pit_Jack_And_Refuel') || swapClip;

    for (let i = 0; i < this.members.length; i++) {
      const m = this.members[i];
      const armClone = cloneSkinnedGroup(srcArmature);
      armClone.position.set(0, 0, 0);
      armClone.rotation.set(0, Math.PI / 2, 0);

      armClone.traverse((ch) => {
        if (!ch.isMesh) return;
        ch.castShadow = true;
        ch.frustumCulled = false;
        const mName = ch.material?.name || '';
        const applySlotMat = (origMat) => {
          const mn = origMat?.name || '';
          if (mn === 'Crew_Nomex_Suit') return this.suitMat;
          if (mn === 'Crew_Suit_Stripe') return this.stripeMat;
          if (mn === 'Crew_Carbon_Helmet') return this.helmMat;
          if (mn === 'Crew_Iridium_Visor') return this.visorMat;
          if (mn === 'Crew_Paoli_Gun') return this.gearMat;
          return origMat;
        };
        if (Array.isArray(ch.material)) {
          ch.material = ch.material.map(applySlotMat);
        } else if (mName) {
          ch.material = applySlotMat(ch.material);
        }
      });

      while (m.bodySlot.children.length > 0) {
        m.bodySlot.remove(m.bodySlot.children[0]);
      }
      m.bodySlot.add(armClone);
      m.mesh = armClone;

      if (idleClip) {
        const mixer = new THREE.AnimationMixer(armClone);
        const actions = {
          idle: mixer.clipAction(idleClip),
          work: mixer.clipAction(m.role.startsWith('GUN_') ? swapClip : jackClip),
        };
        actions.idle.play();
        mixer.update((i * 0.19) % 1.2);
        m.mixer = mixer;
        m.actions = actions;
        m.activeClipName = 'idle';
      }
    }
  }

  setLivery(livery = {}) {
    if (livery.primary !== undefined && this.suitMat) this.suitMat.color.set(livery.primary);
    if (livery.accent !== undefined && this.stripeMat) this.stripeMat.color.set(livery.accent);
  }

  repositionForTrack(track) {
    if (!track?.sampleAt) return;
    const boxFrame = track.sampleAt(PIT_LANE_CONFIG.playerBoxS, PIT_LANE_CONFIG.lateralOffset);
    this.boxPos = boxFrame.pos.clone();
    this.group.position.copy(this.boxPos);
    const trackYaw = Math.atan2(boxFrame.tangent.z, boxFrame.tangent.x);
    this.group.rotation.y = -trackYaw;

    if (this.members) {
      for (const m of this.members) {
        m.holder.position.set(m.stand[0], m.stand[1], m.stand[2]);
        m.holder.rotation.y = m.standYaw;
      }
    }
  }

  update(isServicing, progress01 = 0, elapsedSec = 0, explicitDt = null) {
    this.active = Boolean(isServicing);
    const dt = explicitDt !== null
      ? Math.max(0.001, Math.min(0.1, Number(explicitDt) || 0.016))
      : Math.max(0.001, Math.min(0.1, elapsedSec > this._prevElapsedSec ? elapsedSec - this._prevElapsedSec : 0.016));
    this._prevElapsedSec = elapsedSec;

    const isReleasePhase = this.active && progress01 >= 0.82;

    if (this.airHoses) {
      for (const h of this.airHoses) {
        const tz = this.active ? h.workZ + 0.35 : h.standZ;
        h.mesh.position.z += (tz - h.mesh.position.z) * 0.14;
      }
    }

    for (let i = 0; i < this.members.length; i++) {
      const m = this.members[i];
      const target = this.active ? m.work : m.stand;
      const targetYaw = this.active ? m.workYaw : m.standYaw;

      m.holder.position.x += (target[0] - m.holder.position.x) * 0.16;
      m.holder.position.z += (target[2] - m.holder.position.z) * 0.16;

      let dy = targetYaw - m.holder.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      m.holder.rotation.y += dy * 0.18;

      if (m.mixer && m.actions) {
        const desiredClip = this.active ? 'work' : 'idle';
        if (m.activeClipName !== desiredClip) {
          const prevAct = m.actions[m.activeClipName];
          const nextAct = m.actions[desiredClip];
          if (prevAct) prevAct.fadeOut(0.18);
          if (nextAct) nextAct.reset().fadeIn(0.18).play();
          m.activeClipName = desiredClip;
        }
        m.mixer.update(dt);
      }

      if (this.active && m.role.startsWith('GUN_')) {
        if (!m.mixer) m.holder.scale.y = 0.72 + 0.035 * Math.sin(elapsedSec * 46 + i);
        if (m.flashMat) {
          const burst = !isReleasePhase && Math.sin(elapsedSec * 32 + i * 1.7) > 0.35;
          m.flashMat.opacity = burst ? 0.34 : 0.0;
        }
      } else if (this.active && (m.role === 'FRONT_JACK' || m.role === 'REAR_JACK')) {
        if (!m.mixer) m.holder.scale.y = 0.88 + 0.02 * Math.sin(elapsedSec * 12);
        if (m.jackMesh) {
          m.jackMesh.rotation.x = isReleasePhase ? 0.0 : -0.18;
        }
      } else {
        m.holder.scale.y += (1.0 - m.holder.scale.y) * 0.16;
        if (m.flashMat) m.flashMat.opacity = 0.0;
        if (m.jackMesh) m.jackMesh.rotation.x = 0.0;
      }

      if (m.lollipopSignMat) {
        m.lollipopSignMat.map = getLollipopTexture(isReleasePhase);
        m.holder.position.y = isReleasePhase ? 0.55 : 0.0;
      }
    }
  }
}

export function createPitCrewTeamRig(teamColorHex = 0xd40814, assets = null, track = null) {
  const diorama = new PitCrewDiorama(null, assets, track);
  diorama.setLivery({ primary: teamColorHex });

  const rig = diorama.group;
  rig.name = 'PitCrewTeamRig';
  rig.group = rig;
  rig.userData.diorama = diorama;
  rig._elapsedSec = 0;

  rig.setTeamColor = (hex) => diorama.setLivery({ primary: hex });
  rig.setLivery = (liv) => diorama.setLivery(liv);
  rig.repositionForTrack = (trk) => diorama.repositionForTrack(trk);
  rig.update = (pitState, dt = 0.016) => updatePitCrewTeamRig(rig, pitState, dt);

  return rig;
}

export function updatePitCrewTeamRig(rig, pitState = {}, dt = 0.016) {
  if (!rig) return;
  const diorama = rig instanceof PitCrewDiorama ? rig : rig.userData?.diorama;
  if (!diorama) return;

  const stepDt = Math.max(0.001, Math.min(0.1, Number(dt) || 0.016));
  rig._elapsedSec = (rig._elapsedSec || 0) + stepDt;

  let isServicing = false;
  let progress01 = 0;
  let elapsedSec = rig._elapsedSec;

  if (typeof pitState === 'boolean') {
    isServicing = pitState;
  } else if (pitState && typeof pitState === 'object') {
    if (pitState.teamColorHex !== undefined) {
      diorama.setLivery({ primary: pitState.teamColorHex });
    }
    isServicing = Boolean(
      pitState.isServicing ??
      pitState.active ??
      pitState.inPitStop ??
      (pitState.pitStopTimer !== undefined && pitState.pitStopTimer > 0)
    );
    progress01 = Number(pitState.progress01 ?? pitState.progress ?? 0) || 0;
    if (pitState.elapsedSec !== undefined) elapsedSec = Number(pitState.elapsedSec) || elapsedSec;
  }

  diorama.update(isServicing, progress01, elapsedSec, stepDt);
}

// ============================================================================
// HIGH-SPEED CRASH EXPLOSION & SHATTERED CARBON FIBER TRACK DEBRIS POOL
// ============================================================================
export class EffectsManager {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.explosions = [];
    this.debrisItems = [];

    this._fireSphereGeo = new THREE.SphereGeometry(0.48, 10, 10);
    this._shardBoxGeo = new THREE.BoxGeometry(0.34, 0.032, 0.22);
    this._shockRingGeo = new THREE.RingGeometry(0.45, 0.95, 28);
    this._shockRingGeo.rotateX(-Math.PI / 2);

    const carbonMaps = getCarbonWeaveMaps();
    this._debrisCarbonMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: carbonMaps.map,
      bumpMap: carbonMaps.bumpMap,
      bumpScale: 0.006,
      roughness: 0.38,
      metalness: 0.16,
      emissiveIntensity: 0.0,
    });
    this._debrisPaintRedMat = new THREE.MeshStandardMaterial({
      color: 0xc8161d,
      roughness: 0.22,
      metalness: 0.30,
      emissiveIntensity: 0.0,
    });
    // Matte fractured Kevlar/Zylon composite shard (zero fake blinking neon!)
    this._debrisKevlarMat = new THREE.MeshStandardMaterial({
      color: 0x8c7332,
      roughness: 0.78,
      metalness: 0.06,
      emissiveIntensity: 0.0,
    });
  }

  spawnExplosion(worldPos) {
    const group = new THREE.Group();
    group.position.copy(worldPos);

    const particles = [];
    const disposables = [];

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xfff3b0,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(flashMat);
    const coreFlash = new THREE.Mesh(this._fireSphereGeo, flashMat);
    coreFlash.position.y = 0.65;
    coreFlash.scale.setScalar(1.8);
    group.add(coreFlash);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff9100,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    disposables.push(ringMat);
    const shockRing = new THREE.Mesh(this._shockRingGeo, ringMat);
    shockRing.position.y = 0.12;
    group.add(shockRing);

    const blastLight = new THREE.PointLight(0xff6d00, 6.0, 26, 1.8);
    blastLight.position.set(0, 1.8, 0);
    group.add(blastLight);

    const firePalette = [0xfff176, 0xff9800, 0xff3d00, 0xd84315, 0x262930, 0x1b1d22];
    for (let i = 0; i < 24; i++) {
      const isSmoke = i >= 14;
      const mat = new THREE.MeshBasicMaterial({
        color: firePalette[i % firePalette.length],
        transparent: true,
        opacity: 0.96,
        blending: isSmoke ? THREE.NormalBlending : THREE.AdditiveBlending,
        depthWrite: false,
      });
      disposables.push(mat);
      const puff = new THREE.Mesh(this._fireSphereGeo, mat);
      puff.scale.setScalar(0.55 + Math.random() * 0.65);
      const ang = Math.random() * Math.PI * 2;
      const spd = (isSmoke ? 2.5 : 4.5) + Math.random() * 13.5;
      const vy = (isSmoke ? 7.0 : 4.5) + Math.random() * 13.0;
      group.add(puff);
      particles.push({
        mesh: puff,
        mat,
        kind: isSmoke ? 'SMOKE' : 'FIRE',
        vx: Math.cos(ang) * spd,
        vy,
        vz: Math.sin(ang) * spd,
        rx: 0,
        ry: 0,
        rz: 0,
      });
    }

    for (let i = 0; i < 16; i++) {
      const isEmber = i % 4 === 0;
      const mat = new THREE.MeshBasicMaterial({
        color: isEmber ? 0xff9800 : 0x1a1e26,
        transparent: true,
        opacity: 1.0,
      });
      disposables.push(mat);
      const shard = new THREE.Mesh(this._shardBoxGeo, mat);
      shard.scale.setScalar(0.7 + Math.random() * 0.9);
      const ang = Math.random() * Math.PI * 2;
      const spd = 6.0 + Math.random() * 18.0;
      const vy = 6.5 + Math.random() * 15.0;
      group.add(shard);
      particles.push({
        mesh: shard,
        mat,
        kind: 'SHARD',
        vx: Math.cos(ang) * spd,
        vy,
        vz: Math.sin(ang) * spd,
        rx: (Math.random() - 0.5) * 16,
        ry: (Math.random() - 0.5) * 16,
        rz: (Math.random() - 0.5) * 16,
      });
    }

    this.scene.add(group);
    this.explosions.push({
      group,
      particles,
      coreFlash,
      flashMat,
      shockRing,
      ringMat,
      blastLight,
      disposables,
      age: 0,
      maxAge: 1.95,
    });
  }

  spawnCarbonDebris(s, lateralOffset, sectorId) {
    const fr = this.track.sampleAt(s, lateralOffset);
    const group = new THREE.Group();
    group.position.copy(fr.pos);

    for (let i = 0; i < 7; i++) {
      const mat = i === 0
        ? this._debrisKevlarMat
        : (i === 1 ? this._debrisPaintRedMat : this._debrisCarbonMat);
      const shard = new THREE.Mesh(this._shardBoxGeo, mat);
      shard.scale.set(0.85 + (i % 3) * 0.42, 0.8 + (i % 2) * 0.6, 0.80 + ((i + 1) % 3) * 0.38);
      shard.position.set(
        (Math.random() - 0.5) * 2.2,
        0.042 + (i % 2) * 0.022,
        (Math.random() - 0.5) * 2.2
      );
      shard.rotation.set(
        (Math.random() - 0.5) * 0.24,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.28
      );
      shard.castShadow = true;
      shard.receiveShadow = true;
      group.add(shard);
    }

    this.scene.add(group);
    const item = {
      s,
      lateralOffset,
      radius: 1.85,
      sectorId,
      group,
      ttl: 52.0,
    };
    this.debrisItems.push(item);
    return item;
  }

  clearAllDebris() {
    for (const d of this.debrisItems) {
      this.scene.remove(d.group);
    }
    this.debrisItems.length = 0;
  }

  update(dt) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.age += dt;
      const u = Math.min(1.0, ex.age / ex.maxAge);

      const flashU = Math.min(1.0, ex.age / 0.36);
      ex.coreFlash.scale.setScalar(1.8 + flashU * 5.2);
      ex.flashMat.opacity = Math.max(0, 1.0 - flashU);

      const ringU = Math.min(1.0, ex.age / 0.65);
      ex.shockRing.scale.setScalar(1.0 + ringU * 9.5);
      ex.ringMat.opacity = Math.max(0, (1.0 - ringU) * 0.9);

      ex.blastLight.intensity = Math.max(0, 6.0 * Math.pow(1.0 - Math.min(1.0, ex.age / 0.75), 2.0));

      for (const p of ex.particles) {
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;

        if (p.kind === 'SMOKE') {
          p.vx *= 1.0 - 1.6 * dt;
          p.vz *= 1.0 - 1.6 * dt;
          p.vy -= 4.5 * dt;
          if (p.mesh.position.y < 0.35) p.mesh.position.y = 0.35;
          p.mesh.scale.setScalar(0.9 + u * 2.8);
          p.mat.opacity = Math.max(0, (1.0 - u) * 0.78);
        } else if (p.kind === 'FIRE') {
          p.vx *= 1.0 - 1.2 * dt;
          p.vz *= 1.0 - 1.2 * dt;
          p.vy -= 14.5 * dt;
          if (p.mesh.position.y < 0.25) {
            p.mesh.position.y = 0.25;
            p.vy *= -0.25;
          }
          p.mesh.scale.setScalar(0.8 + u * 2.1);
          p.mat.opacity = Math.max(0, 1.0 - Math.pow(u, 0.82));
        } else {
          p.vy -= 22.0 * dt;
          if (p.mesh.position.y < 0.05) {
            p.mesh.position.y = 0.05;
            p.vy = -p.vy * 0.42;
            p.vx *= 0.78;
            p.vz *= 0.78;
          }
          p.mesh.rotation.x += p.rx * dt;
          p.mesh.rotation.y += p.ry * dt;
          p.mesh.rotation.z += p.rz * dt;
          p.mat.opacity = u > 0.7 ? Math.max(0, (1.0 - u) / 0.3) : 1.0;
        }
      }

      if (ex.age >= ex.maxAge) {
        this.scene.remove(ex.group);
        for (const d of ex.disposables) d.dispose();
        this.explosions.splice(i, 1);
      }
    }

    for (let i = this.debrisItems.length - 1; i >= 0; i--) {
      this.debrisItems[i].ttl -= dt;
      if (this.debrisItems[i].ttl <= 0) {
        this.scene.remove(this.debrisItems[i].group);
        this.debrisItems.splice(i, 1);
      }
    }
  }
}
