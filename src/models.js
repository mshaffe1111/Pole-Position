// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Blender GLB Asset Loader, Clearcoat PBR F1 Car Rig, Motorsport Livery Decals,
// 3D First-Person Cockpit + Live OLED Display, Aero/Gravel VFX & Rigged Pit Crew
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TIRE_COMPOUNDS, PIT_LANE_CONFIG } from './config.js';

// ============================================================================
// SHARED PROCEDURAL AAA PBR TEXTURES & UV PROJECTORS (CACHED — ZERO GPU LEAKS)
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
  gCore.addColorStop(0.0,  'rgba(1, 2, 5, 0.97)');
  gCore.addColorStop(0.46, 'rgba(2, 4, 9, 0.84)');
  gCore.addColorStop(0.74, 'rgba(3, 6, 12, 0.36)');
  gCore.addColorStop(1.0,  'rgba(3, 6, 12, 0.0)');
  ctx.fillStyle = gCore;
  ctx.fillRect(0, 0, 256, 256);
  ctx.restore();

  // Central flat-bottom Venturi floor plank dark spine
  const plankGrad = ctx.createLinearGradient(64, 0, 192, 0);
  plankGrad.addColorStop(0.0, 'rgba(1, 2, 6, 0.0)');
  plankGrad.addColorStop(0.25, 'rgba(1, 2, 6, 0.55)');
  plankGrad.addColorStop(0.50, 'rgba(0, 1, 4, 0.72)');
  plankGrad.addColorStop(0.75, 'rgba(1, 2, 6, 0.55)');
  plankGrad.addColorStop(1.0, 'rgba(1, 2, 6, 0.0)');
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
    gw.addColorStop(0.55, 'rgba(1, 2, 6, 0.46)');
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

  dCtx.fillStyle = '#0e1118';
  dCtx.fillRect(0, 0, size, size);
  nCtx.fillStyle = 'rgb(128, 128, 255)';
  nCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#5c5c5c';
  rCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#585858';
  bCtx.fillRect(0, 0, size, size);

  // High-frequency 3K 2x2 diagonal twill carbon-fiber weave (albedo + tangent normal + roughness + bump)
  const step = 8;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const cellX = x / step;
      const cellY = y / step;
      const diag = ((cellX + cellY) % 4 + 4) % 4;
      const warpTow = diag < 2;

      dCtx.fillStyle = warpTow ? '#232a38' : '#0a0d13';
      dCtx.fillRect(x, y, step - 1, step - 1);
      dCtx.fillStyle = warpTow ? '#323c4f' : '#131821';
      dCtx.fillRect(x + 1, y + 1, step - 2, (step / 2) - 1);

      dCtx.fillStyle = warpTow ? 'rgba(185, 205, 238, 0.15)' : 'rgba(4, 7, 12, 0.28)';
      if (warpTow) {
        dCtx.fillRect(x + 1, y + 2, step - 2, 1);
        dCtx.fillRect(x + 1, y + 5, step - 2, 1);
      } else {
        dCtx.fillRect(x + 2, y + 1, 1, step - 2);
        dCtx.fillRect(x + 5, y + 1, 1, step - 2);
      }

      const nx = warpTow ? 148 : 108;
      const ny = (diag === 0 || diag === 3) ? 148 : 108;
      nCtx.fillStyle = `rgb(${nx}, ${ny}, 245)`;
      nCtx.fillRect(x, y, step - 1, step - 1);
      nCtx.fillStyle = warpTow ? 'rgb(166, 136, 250)' : 'rgb(112, 152, 245)';
      nCtx.fillRect(x + 1, y + 1, step - 3, step - 3);

      rCtx.fillStyle = warpTow ? '#303030' : '#4a4a4a';
      rCtx.fillRect(x + 1, y + 1, step - 2, step - 2);
      rCtx.fillStyle = '#8e8e8e';
      rCtx.fillRect(x, y, step, 1);
      rCtx.fillRect(x, y, 1, step);

      bCtx.fillStyle = warpTow ? '#d4d4d4' : '#343434';
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

let _sharedTireMaps = null;
function getTireTreadMaps() {
  if (_sharedTireMaps) return _sharedTireMaps;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  // Rich dark vulcanized F1 racing slick rubber (#141518)
  ctx.fillStyle = '#141518';
  ctx.fillRect(0, 0, 128, 128);

  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    const v = 14 + Math.floor(Math.random() * 18);
    ctx.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
    ctx.fillRect(x, y, 2, 3);
  }
  ctx.fillStyle = 'rgba(6, 7, 10, 0.50)';
  for (const gx of [24, 52, 76, 104]) {
    ctx.fillRect(gx, 0, 2, 128);
  }
  ctx.fillStyle = 'rgba(38, 42, 50, 0.24)';
  for (let y = 0; y < 128; y += 16) {
    ctx.fillRect(10, y, 108, 2);
  }

  const map = new THREE.CanvasTexture(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 3);
  map.colorSpace = THREE.SRGBColorSpace;

  _sharedTireMaps = { map };
  return _sharedTireMaps;
}

// ============================================================================
// HIGH-RES PROCEDURAL MOTORSPORT LIVERY DECAL ATLAS (512x512, CACHED PER TEAM)
// Top planform (v=0.32..1.0): Twin Scuderia stripes, #1 Nose & Engine Roundels,
// VELOCE / P-ZERO nose badges.
// Sidepod flank (v=0.00..0.32): Exposed 3K carbon undercut skirt, diagonal slash,
// cooling gill louver accents & bold PHANATIC / MGU-K HYBRID sponsor wordmarks.
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

  // 1. Rich saturated automotive basecoat across entire atlas
  ctx.fillStyle = pHex;
  ctx.fillRect(0, 0, W, H);

  // Subtle deeper flank shading along outer edges for sculptural curvature
  const topEdgeShade = ctx.createLinearGradient(0, 0, W, 0);
  topEdgeShade.addColorStop(0.00, 'rgba(0, 0, 0, 0.22)');
  topEdgeShade.addColorStop(0.18, 'rgba(0, 0, 0, 0.00)');
  topEdgeShade.addColorStop(0.82, 'rgba(0, 0, 0, 0.00)');
  topEdgeShade.addColorStop(1.00, 'rgba(0, 0, 0, 0.22)');
  ctx.fillStyle = topEdgeShade;
  ctx.fillRect(0, 0, W, Math.floor(H * 0.68));

  // --------------------------------------------------------------------------
  // REGION A (Canvas y = 0..348 -> UV v = 1.00..0.32): TOP PLANFORM ATLAS
  // y=8 is Nose Tip (v=0.98), y=340 is Engine-Cover Tail (v=0.33)
  // --------------------------------------------------------------------------
  // Twin Scuderia Racing Stripes + Trim Pin-Stripes along Monocoque & Engine Spine
  ctx.fillStyle = aHex;
  ctx.fillRect(241, 10, 11, 332);
  ctx.fillRect(260, 10, 11, 332);
  ctx.fillStyle = tHex;
  ctx.fillRect(236, 10, 4, 332);
  ctx.fillRect(272, 10, 4, 332);

  // Swept Sidepod Shoulder Chevrons on Top Planform
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

  // Nose Cone Championship Roundel (#1 / #carNum) at y=84 (z ~ -1.35m)
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

  // Nose Tip Scuderia Crest & P-ZERO / VELOCE Nose Sponsor Wordmarks
  ctx.fillStyle = tHex;
  ctx.fillRect(244, 24, 24, 14);
  ctx.fillStyle = '#11141a';
  ctx.font = '900 10px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('F1', 256, 34);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 14px "Segoe UI", Arial, sans-serif';
  ctx.fillText('VELOCE', 256, 134);

  // Engine Cover Shark-Fin Championship Roundel at y=254
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

  // Top Sidepod Cooling Louver Gill Slats (8 dark carbon vents per side)
  ctx.fillStyle = 'rgba(10, 13, 19, 0.85)';
  for (let g = 0; g < 8; g++) {
    const gy = 188 + g * 11;
    ctx.fillRect(142, gy, 36, 5);
    ctx.fillRect(W - 178, gy, 36, 5);
  }

  // --------------------------------------------------------------------------
  // REGION B (Canvas y = 348..512 -> UV v = 0.32..0.00): SIDEPOD FLANK ATLAS
  // Bottom y = 456..512 (v = 0.00..0.11): Exposed 3K Carbon-Fiber Floor Skirt!
  // Middle y = 368..454 (v = 0.11..0.28): PHANATIC & MGU-K HYBRID Sponsor Band!
  // --------------------------------------------------------------------------
  // Exposed 3K Carbon-Fiber Lower Sidepod Undercut & Bargeboard Band
  ctx.fillStyle = '#10141d';
  ctx.fillRect(0, 454, W, 58);
  for (let y = 456; y < 512; y += 6) {
    for (let x = 0; x < W; x += 6) {
      const tw = (((x / 6 + y / 6) % 4) < 2);
      ctx.fillStyle = tw ? '#222938' : '#0b0e14';
      ctx.fillRect(x, y, 5, 5);
    }
  }
  // Crisp Trim/Accent Pinstripe separating Painted Sidepod from Carbon Undercut
  ctx.fillStyle = tHex;
  ctx.fillRect(0, 449, W, 5);
  ctx.fillStyle = aHex;
  ctx.fillRect(0, 444, W, 5);

  // Dynamic Motorsport Diagonal Sidepod Slash
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

  // Bold Sidepod Sponsor Wordmark: PHANATIC + MGU-K HYBRID + #carNum
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
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

  // Leading/trailing racing edge trim
  ctx.fillStyle = pHex;
  ctx.fillRect(0, 0, 512, 14);
  ctx.fillRect(0, 114, 512, 14);

  // Contrast wordmark color (dark charcoal on light wings, crisp white on dark wings)
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

// Deterministic Motorsport UV Projectors (replaces scrambled smart_project islands!)
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
      // Sidepod / monocoque flank -> Region B (UV v = 0.01..0.31), non-mirrored left-to-right!
      const uRaw = nx < 0
        ? (z + 1.35) / 2.95
        : (1.60 - z) / 2.95;
      const u = Math.max(0.02, Math.min(0.98, uRaw));
      const v = 0.01 + 0.30 * Math.max(0.0, Math.min(1.0, (y - 0.07) / 0.46));
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = v;
    } else {
      // Top planform (nose, halo fairing, sidepod tops, engine cover) -> Region A (UV v = 0.33..0.99)
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

// Self-contained SkinnedMesh + Skeleton cloner (zero external SkeletonUtils dependency!)
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

  ctx.fillStyle = '#1a1614';
  ctx.fillRect(0, 0, 128, 128);

  const g = ctx.createRadialGradient(64, 64, 20, 64, 64, 60);
  g.addColorStop(0.0,  '#121010');
  g.addColorStop(0.25, '#ff9d2e');
  g.addColorStop(0.68, '#ff5500');
  g.addColorStop(0.95, '#d92600');
  g.addColorStop(1.0,  '#22120c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2b1208';
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    for (const r of [32, 42, 51]) {
      const hx = 64 + Math.cos(a + r * 0.02) * r;
      const hy = 64 + Math.sin(a + r * 0.02) * r;
      ctx.beginPath();
      ctx.arc(hx, hy, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _sharedBrakeRotorTex = new THREE.CanvasTexture(c);
  _sharedBrakeRotorTex.colorSpace = THREE.SRGBColorSpace;
  return _sharedBrakeRotorTex;
}

let _sharedSoftGlowTex = null;
function getSoftGlowTexture() {
  if (_sharedSoftGlowTex) return _sharedSoftGlowTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  g.addColorStop(0.0,  'rgba(255, 255, 255, 1.0)');
  g.addColorStop(0.32, 'rgba(255, 255, 255, 0.62)');
  g.addColorStop(0.68, 'rgba(255, 255, 255, 0.18)');
  g.addColorStop(1.0,  'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  _sharedSoftGlowTex = new THREE.CanvasTexture(c);
  return _sharedSoftGlowTex;
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
  ctx.fillStyle = isGo ? '#062b17' : '#0d1522';
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = isGo ? '#00ff88' : '#ffd600';
  ctx.stroke();

  ctx.fillStyle = isGo ? '#00ff88' : '#ff2e3b';
  ctx.font = '900 54px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isGo ? 'GO! GO!' : 'BOX #1', 128, 102);
  ctx.fillStyle = isGo ? '#ffffff' : '#ffd600';
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
// FORMULA 1 CLEARCOAT PBR CAR RIG, 3D COCKPIT INTERIOR & REAL-TIME VFX
// ============================================================================
export class FormulaCarRig {
  constructor(assets, livery = {}) {
    const {
      primary = 0xd40814,
      accent = 0xffffff,
      trim = 0xffd100,
      helmet = 0x00e5ff,
      rim = 0x22262e, // Dark satin gunmetal 10-spoke forged rim
      compound = 'SOFT',
      carNum = 1,
    } = livery;

    this._liveryState = { primary, accent, trim, helmet, rim, compound, carNum };
    this._cockpitViewActive = false;

    this.root = new THREE.Group();
    this.chassisTiltGroup = new THREE.Group();
    this.root.add(this.chassisTiltGroup);

    const carbonMaps = getCarbonWeaveMaps();
    const tireMaps = getTireTreadMaps();
    const rotorTex = getBrakeRotorTexture();
    const bodyDecalTex = getMotorsportLiveryTexture(primary, accent, trim, carNum);
    const wingDecalTex = getWingSponsorTexture(accent, primary);

    // 1. Deep Saturated Rosso Corsa / Team Clearcoat Paint (exact #89 spec: zero pink sky wash!)
    this.primaryMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, // Full saturation carried in Motorsport Livery Decal CanvasTexture!
      map: bodyDecalTex,
      metalness: 0.32,
      roughness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      clearcoatNormalMap: carbonMaps.normalMap,
      clearcoatNormalScale: new THREE.Vector2(0.04, 0.04),
      reflectivity: 0.95,
      envMapIntensity: 1.15,
    });
    // Solid saturated primary material for small trim cowlings (mirrors, brake ducts)
    this.primarySolidMat = new THREE.MeshPhysicalMaterial({
      color: primary,
      metalness: 0.32,
      roughness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      reflectivity: 0.95,
      envMapIntensity: 1.15,
    });
    this.accentMat = new THREE.MeshPhysicalMaterial({
      color: accent,
      metalness: 0.32,
      roughness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      reflectivity: 0.95,
      envMapIntensity: 1.15,
    });
    this.wingBannerMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: wingDecalTex,
      metalness: 0.30,
      roughness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      reflectivity: 0.95,
      envMapIntensity: 1.15,
    });

    // 2. High-Contrast 3K Twill Carbon-Fiber Weave (Floor, Undercut, Wings, Survival Cell)
    this.carbonMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: carbonMaps.map,
      normalMap: carbonMaps.normalMap,
      normalScale: new THREE.Vector2(0.50, 0.50),
      roughnessMap: carbonMaps.roughnessMap,
      bumpMap: carbonMaps.bumpMap,
      bumpScale: 0.008,
      metalness: 0.34,
      roughness: 0.26,
      clearcoat: 0.76,
      clearcoatRoughness: 0.12,
      reflectivity: 0.92,
      envMapIntensity: 1.15,
    });

    // 3. Cockpit Interior PBR Materials (Titanium Halo, Nomex Suit, Suede Gloves, Chrome Mirrors)
    this.titaniumMat = new THREE.MeshStandardMaterial({
      color: 0x2c323d,
      metalness: 0.86,
      roughness: 0.24,
      envMapIntensity: 1.25,
    });
    this.cockpitFoamMat = new THREE.MeshStandardMaterial({
      color: 0x161920,
      roughness: 0.84,
      metalness: 0.05,
    });
    this.nomexSuitMat = new THREE.MeshStandardMaterial({
      color: primary,
      roughness: 0.68,
      metalness: 0.06,
      envMapIntensity: 0.55,
    });
    this.gloveSuedeMat = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      roughness: 0.78,
      metalness: 0.08,
    });
    this.harnessMat = new THREE.MeshStandardMaterial({
      color: trim,
      roughness: 0.52,
      metalness: 0.15,
    });
    this.mirrorGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xeef6ff,
      metalness: 1.0,
      roughness: 0.012,
      clearcoat: 1.0,
      clearcoatRoughness: 0.008,
      reflectivity: 1.0,
      envMapIntensity: 2.35,
    });

    // 4. Live Dynamic 256x128 OLED Steering-Wheel & Dash Telemetry Display Material
    this._initOledDisplay();

    // 5. Heat-Tempered Titanium Exhaust Alloy
    this.exhaustMat = new THREE.MeshStandardMaterial({
      color: 0xa8a29a,
      metalness: 0.95,
      roughness: 0.16,
      emissive: new THREE.Color(0xff4d00),
      emissiveIntensity: 0.14,
      envMapIntensity: 1.35,
    });

    // 6. Glossy Driver Helmet & Iridium Mirror-Chrome Sky-Reflective Visor
    this.helmetMat = new THREE.MeshPhysicalMaterial({
      name: 'Driver_Helmet_Mat',
      color: helmet,
      metalness: 0.36,
      roughness: 0.14,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.25,
    });
    this.visorMat = new THREE.MeshPhysicalMaterial({
      name: 'Driver_Visor_Mat',
      color: 0x0a1c36,
      metalness: 1.0,
      roughness: 0.012,
      clearcoat: 1.0,
      clearcoatRoughness: 0.008,
      iridescence: 0.86,
      iridescenceIOR: 1.48,
      reflectivity: 1.0,
      envMapIntensity: 2.25,
    });

    // 7. Blinking FIA Rear Rain / ERS Harvesting LED Matrix
    this.rainLightMat = new THREE.MeshStandardMaterial({
      color: 0xff1a22,
      emissive: new THREE.Color(0xff1420),
      emissiveIntensity: 2.6,
      roughness: 0.15,
    });

    // 8. 18-Inch Dark Vulcanized Slick, Pirelli Sidewall Ring, Satin Gunmetal 10-Spoke Rim & Slotted Rotor
    const compHex = TIRE_COMPOUNDS[compound]?.colorHex || '#ff2a2a';
    this.tireRubberMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tireMaps.map,
      roughness: 0.72,
      metalness: 0.06,
      envMapIntensity: 0.48,
    });
    this.compoundMat = new THREE.MeshPhysicalMaterial({
      color: compHex,
      emissive: compHex,
      emissiveIntensity: 0.42,
      roughness: 0.26,
      clearcoat: 0.78,
      clearcoatRoughness: 0.10,
    });
    const safeRimColor = new THREE.Color(rim);
    // Keep forged rims satin gunmetal/metallic rather than chalky bright white/silver pie-plates
    if (safeRimColor.r > 0.65 && safeRimColor.g > 0.65 && safeRimColor.b > 0.65) {
      safeRimColor.multiplyScalar(0.38);
    }
    this.wheelRimMat = new THREE.MeshPhysicalMaterial({
      color: safeRimColor,
      metalness: 0.88,
      roughness: 0.22,
      clearcoat: 0.82,
      clearcoatRoughness: 0.08,
      reflectivity: 0.95,
      envMapIntensity: 1.20,
    });
    this.nutLeftMat = new THREE.MeshStandardMaterial({
      color: 0xff2438,
      metalness: 0.88,
      roughness: 0.18,
      envMapIntensity: 1.25,
    });
    this.nutRightMat = new THREE.MeshStandardMaterial({
      color: 0x009dff,
      metalness: 0.88,
      roughness: 0.18,
      envMapIntensity: 1.25,
    });
    this.brakeDiscMat = new THREE.MeshStandardMaterial({
      color: 0x3b3634,
      metalness: 0.78,
      roughness: 0.30,
      bumpMap: rotorTex,
      bumpScale: 0.008,
      emissive: new THREE.Color(0xd91808),
      emissiveMap: rotorTex,
      emissiveIntensity: 0.0,
    });
    this.caliperMat = new THREE.MeshPhysicalMaterial({
      color: primary,
      metalness: 0.68,
      roughness: 0.18,
      clearcoat: 0.95,
      clearcoatRoughness: 0.06,
      emissive: new THREE.Color(0xd91808),
      emissiveIntensity: 0.0,
      envMapIntensity: 1.15,
    });

    this.shiftLedMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });

    this.parts = {
      fwMain: null,
      fwEndL: null,
      fwEndR: null,
      rwMain: null,
      rwEndL: null,
      rwEndR: null,
      drsFlap: null,
      cockpitWheel: null,
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
    this._buildWheels(templates.wheel);
    this._buildVFXAttachments();

    this.wheelSpinAngle = 0;
    this.brakeGlow = 0;
    this.backfireTimer = 0;
    this._prevRpm = 3800;

    // Zero-GC scratch math objects for 60fps * 16 cars
    this._fwd = new THREE.Vector3();
    this._rgt = new THREE.Vector3();
    this._negTangent = new THREE.Vector3();
    this._basisMat = new THREE.Matrix4();
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
      emissiveIntensity: 0.92,
      roughness: 0.16,
      metalness: 0.10,
    });

    this._renderOledTelemetry(1, 0, 'SOFT', 100, 100, false, false, 0);
  }

  _renderOledTelemetry(gearLabel, speedKmh, compId, tireLifePct, ersPct, drsOpen, inPit, rpmNorm) {
    const ctx = this._oledCtx;
    if (!ctx) return;

    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, 256, 128);

    // Outer carbon-bezel telemetry frame
    ctx.strokeStyle = '#253247';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 252, 124);

    // Top DRS / PIT / RPM LED bar (y=4..28)
    if (inPit) {
      ctx.fillStyle = '#ff9100';
      ctx.fillRect(5, 5, 246, 22);
      ctx.fillStyle = '#070a10';
      ctx.font = '900 15px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PIT LIMITER ACTIVE', 128, 16);
    } else if (drsOpen) {
      ctx.fillStyle = '#00e676';
      ctx.fillRect(5, 5, 246, 22);
      ctx.fillStyle = '#04140b';
      ctx.font = '900 16px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DRS ACTIVE  >>>', 128, 16);
    } else {
      const segs = 12;
      const activeSegs = Math.round(Math.max(0, Math.min(1, rpmNorm)) * segs);
      for (let i = 0; i < segs; i++) {
        const col = i < 5 ? '#00ff88' : (i < 9 ? '#ff3d3d' : '#00e5ff');
        ctx.fillStyle = i < activeSegs ? col : '#141c29';
        ctx.fillRect(8 + i * 20, 7, 16, 16);
      }
    }

    // Center Gear Box (x=94..162, y=32..100)
    ctx.fillStyle = '#0d1524';
    ctx.fillRect(94, 32, 68, 68);
    ctx.strokeStyle = drsOpen ? '#00e676' : '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(94, 32, 68, 68);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '900 54px "Segoe UI", Impact, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(gearLabel), 128, 68);

    // Left Column: Speed km/h
    ctx.fillStyle = '#7dd3fc';
    ctx.font = '700 11px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SPD KMH', 10, 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 30px "Segoe UI", Arial, sans-serif';
    ctx.fillText(String(Math.round(speedKmh)), 10, 72);

    // Right Column: Tire Compound & Life %
    const compColor = TIRE_COMPOUNDS[compId]?.colorHex || '#ff2a2a';
    const compShort = (compId || 'S').charAt(0);
    ctx.fillStyle = compColor;
    ctx.beginPath();
    ctx.arc(182, 52, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#080b10';
    ctx.font = '900 15px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(compShort, 182, 53);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '800 20px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.max(0, Math.min(100, Math.round(tireLifePct)))}%`, 246, 56);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 11px "Segoe UI", Arial, sans-serif';
    ctx.fillText('TYRE LIFE', 246, 82);

    // Bottom ERS Hybrid Battery Bar (y=105..121)
    ctx.fillStyle = '#111927';
    ctx.fillRect(8, 106, 240, 15);
    const ersW = Math.round(236 * Math.max(0.02, Math.min(1.0, ersPct / 100)));
    ctx.fillStyle = ersPct > 25 ? '#00e5ff' : '#ff5252';
    ctx.fillRect(10, 108, ersW, 11);
    ctx.fillStyle = '#041019';
    ctx.font = '900 10px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`ERS ${Math.round(ersPct)}%`, 128, 114);

    this._oledTex.needsUpdate = true;
  }

  _buildChassis(template, is2026Glb = false) {
    if (template) {
      const clone = template.clone(true);
      // Verify orientation automatically: f1_car_2026.glb already faces -Z forward; legacy f1_car.glb faces +Z!
      let detected2026 = is2026Glb;
      clone.traverse((n) => {
        if (n.name === 'FrontWing' || n.name === 'SteeringWheel' || n.name === 'CockpitTub_Interior') {
          detected2026 = true;
        }
      });

      const flipLegacy = !detected2026;
      clone.rotation.y = flipLegacy ? Math.PI : 0;

      // Hide physics collision debug hulls immediately & capture high-level node references
      const toDetachWheels = [];
      clone.traverse((obj) => {
        const oname = obj.name || '';
        if (oname.includes('CollisionHull') || oname.endsWith('-convcolonly')) {
          obj.visible = false;
          return;
        }
        if (oname === 'SteeringWheel') this.parts.steeringWheel = obj;
        if (oname === 'Cockpit_Wheel') this.parts.cockpitWheel = obj;
        if (oname === 'DriverArms_Gloves' || oname === 'Driver_Gloves') this.parts.driverArms = obj;
        if (oname === 'Halo_Titanium') this.parts.haloMesh = obj;
        if (oname === 'WingMirror_L') this.parts.wingMirrorL = obj;
        if (oname === 'WingMirror_R') this.parts.wingMirrorR = obj;
        if (oname === 'CockpitTub_Interior') this.parts.cockpitTub = obj;
        if (oname === 'Roll_Hoop_TCam') this.parts.rollHoopTCam = obj;
        if (oname === 'FrontWing' || oname === 'Front_Wing_Main') this.parts.fwMain = obj;
        if (oname === 'Front_Wing_Endplate_R') this.parts.fwEndL = obj;
        if (oname === 'Front_Wing_Endplate_L') this.parts.fwEndR = obj;
        if (oname === 'RearWing' || oname === 'Rear_Wing_Main') this.parts.rwMain = obj;
        if (oname === 'Rear_Wing_Endplate_R') this.parts.rwEndL = obj;
        if (oname === 'Rear_Wing_Endplate_L') this.parts.rwEndR = obj;
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
        }
        if (oname === 'Wheel_FL' || oname === 'Wheel_FR' || oname === 'Wheel_RL' || oname === 'Wheel_RR') {
          toDetachWheels.push(obj);
        }
      });

      // Detach embedded 18-inch GLB wheels so _buildWheels wraps them in steerPivot + spinPivot
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
        child.userData.baseRotX = child.rotation.x;
        child.userData.baseRotY = child.rotation.y;
        child.userData.baseRotZ = child.rotation.z;

        const contextName = `${pName}/${n}`;

        if (mName === 'F1_Cockpit_OLED') {
          child.geometry = projectPlanarOledUVs(child.geometry);
          child.material = this.oledMat;
        } else if (mName === 'F1_Shift_LED') {
          child.material = this.shiftLedMat;
        } else if (mName === 'F1_Mirror_Chrome') {
          child.material = this.mirrorGlassMat;
        } else if (mName === 'F1_Titanium_Aero' || n === 'Halo_Titanium') {
          child.material = this.titaniumMat;
        } else if (mName === 'F1_Cockpit_Foam') {
          child.material = this.cockpitFoamMat;
        } else if (mName === 'F1_Driver_Nomex' || n === 'Driver_Shoulders') {
          child.material = this.nomexSuitMat;
        } else if (mName === 'F1_Glove_Suede' || n === 'Driver_Gloves') {
          child.material = this.gloveSuedeMat;
        } else if (mName === 'F1_Harness_Belt') {
          child.material = this.harnessMat;
        } else if (mName === 'F1_Caliper_Alloy' || contextName.includes('BrakeCaliper')) {
          child.material = this.caliperMat;
        } else if (mName === 'F1_Brake_Rotor' || contextName.includes('BrakeDisc')) {
          child.material = this.brakeDiscMat;
        } else if (
          n === 'Carbon_Chassis' ||
          n === 'Suspension_Arms' ||
          n === 'Cockpit_Wheel' ||
          n === 'Roll_Hoop_TCam' ||
          n.startsWith('Front_Wing_Endplate') ||
          n.startsWith('Rear_Wing_Endplate') ||
          n.includes('Floor') ||
          n.includes('Diffuser') ||
          mName.startsWith('Carbon_Fiber') ||
          mName === 'F1_Carbon_Weave'
        ) {
          child.material = this.carbonMat;
        } else if (
          n === 'Body_Main' ||
          pName === 'Body' && mName === 'F1_Livery_Primary' ||
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
        } else if (
          n === 'Body_Accent' ||
          n === 'Front_Wing_Main' ||
          mName === 'F1_Livery_Accent' ||
          mName.startsWith('Livery_Accent')
        ) {
          child.material = this.accentMat;
        } else if (n === 'Driver_Helmet' || mName.startsWith('Driver_Helmet') || mName === 'F1_Helmet_Shell') {
          child.material = this.helmetMat;
        } else if (n === 'Driver_Visor' || mName.startsWith('Driver_Visor') || mName === 'F1_Visor_Chrome') {
          child.material = this.visorMat;
        } else if (n === 'Exhaust_Pipe' || n.includes('Exhaust') || mName.startsWith('Titanium_Exhaust') || mName === 'F1_Titanium_Exhaust') {
          child.material = this.exhaustMat;
        } else if (n === 'Rear_Rain_Light' || n === 'Rain_Light' || n.includes('Rain_Light') || mName.startsWith('Rain_Light') || mName === 'F1_Rain_Light') {
          child.material = this.rainLightMat;
        }
      });

      for (const obj of [this.parts.drsFlap, this.parts.cockpitWheel, this.parts.steeringWheel, this.parts.fwEndL, this.parts.fwEndR, this.parts.rwMain]) {
        if (obj && obj.userData.baseRotX === undefined) {
          obj.userData.baseRotX = obj.rotation.x;
          obj.userData.baseRotY = obj.rotation.y;
          obj.userData.baseRotZ = obj.rotation.z;
        }
      }

      this.chassisTiltGroup.add(clone);
    } else {
      const bodyGeo = projectMotorsportBodyUVs(new THREE.BoxGeometry(1.4, 0.42, 4.2), false);
      const body = new THREE.Mesh(bodyGeo, this.primaryMat);
      body.position.set(0, 0.32, 0);
      body.castShadow = true;
      const fw = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.08, 0.36), this.accentMat);
      fw.position.set(0, 0.12, -2.2);
      fw.castShadow = true;
      const rwGeo = projectWingBannerUVs(new THREE.BoxGeometry(1.1, 0.32, 0.30));
      const rw = new THREE.Mesh(rwGeo, this.wingBannerMat);
      rw.position.set(0, 0.72, 1.95);
      rw.castShadow = true;
      this.parts.fwMain = fw;
      this.parts.rwMain = rw;
      this.chassisTiltGroup.add(body, fw, rw);
    }

    // Deep Soft-Feathered Grounding Contact Shadow (opacity: 0.88 grounds plank & all 4 tires!)
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
    shadowPlane.position.y = 0.028;
    this.root.add(shadowPlane);
  }

  _buildCockpitAndAeroDetails() {
    // 1. FIA Roll-Hoop Overhead T-Cam Pod fallback
    if (!this.parts.rollHoopTCam && !this._embeddedGlbWheels.FL) {
      const tCamGroup = new THREE.Group();
      tCamGroup.position.set(0, 0.825, 0.17);
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.08, 0.07), this.carbonMat);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.026, 0.065), this.carbonMat);
      bar.position.y = 0.042;
      const lens = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.03, 0.072),
        new THREE.MeshBasicMaterial({ color: 0xffea00 })
      );
      lens.position.set(0, 0.044, -0.004);
      tCamGroup.add(mast, bar, lens);
      this.chassisTiltGroup.add(tCamGroup);
    }

    // 2. Cockpit Rim & Titanium Halo fallback (when using legacy f1_car.glb or procedural chassis)
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
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.020, 0.19, 10), this.titaniumMat);
      pillar.position.set(0, 0.61, -0.69);
      pillar.rotation.x = 0.22;
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.021, 10, 24, Math.PI), this.titaniumMat);
      hoop.rotation.x = Math.PI / 2 + 0.08;
      hoop.rotation.z = Math.PI;
      hoop.position.set(0, 0.685, -0.43);
      haloGroup.add(pillar, hoop);
      this.parts.haloMesh = haloGroup;
      this.chassisTiltGroup.add(haloGroup);
    }

    // 3. Dual Aero Wing Mirrors fallback (WingMirror_L / WingMirror_R)
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

    // 4. Butterfly F1 Steering Wheel + Live 256x128 OLED Display + Articulated Driver Forearms & Gloves
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
      this.parts.steeringWheel = swGroup;
      this.chassisTiltGroup.add(swGroup);
    }

    // Attach articulated 3D Driver Forearms & Nomex Gloves to steering wheel if not already in GLB
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

    // 5. Articulated Rear-Wing DRS Flap fallback
    if (!this.parts.drsFlap) {
      const flapGeo = projectWingBannerUVs(new THREE.BoxGeometry(1.04, 0.022, 0.16));
      flapGeo.translate(0, 0, -0.08);
      const fallbackFlap = new THREE.Mesh(flapGeo, this.wingBannerMat);
      fallbackFlap.position.set(0, 0.865, 2.04);
      fallbackFlap.userData.baseRotX = 0;
      this.chassisTiltGroup.add(fallbackFlap);
      this.parts.drsFlap = fallbackFlap;
      this._drsOpenSign = 1;
    }
  }

  _buildWheels(wheelTemplate) {
    this.wheels = [];
    this.brakeHaloMats = [];
    const glowTex = getSoftGlowTexture();

    const coords = [
      { id: 'FL', x: -0.86, y: 0.34, z: -1.48, isFront: true },
      { id: 'FR', x:  0.86, y: 0.34, z: -1.48, isFront: true },
      { id: 'RL', x: -0.86, y: 0.34, z:  1.42, isFront: false },
      { id: 'RR', x:  0.86, y: 0.34, z:  1.42, isFront: false },
    ];

    for (const c of coords) {
      const steerPivot = new THREE.Group();
      steerPivot.position.set(c.x, c.y, c.z);
      const spinPivot = new THREE.Group();
      steerPivot.add(spinPivot);

      const isLeft = c.x < 0;
      let hasGlbCaliper = Boolean(this.suspensionNodes[c.id]);

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
          } else if (cm === 'F1_Brake_Rotor' || cn.includes('BrakeDisc')) {
            ch.material = this.brakeDiscMat;
          } else if (cm === 'F1_Livery_Primary' || cm === 'F1_Helmet_Shell' || cn.includes('Nut')) {
            ch.material = isLeft ? this.nutLeftMat : this.nutRightMat;
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
          } else if (cn === 'Brake_Disc' || cm.startsWith('Brake_Disc')) {
            ch.material = this.brakeDiscMat;
          } else if (cn.includes('Caliper')) {
            ch.material = this.caliperMat;
            hasGlbCaliper = true;
          }
        });
        spinPivot.add(wc);
      } else {
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.35, 24), this.tireRubberMat);
        cyl.rotation.z = Math.PI / 2;
        cyl.castShadow = true;
        const rimCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.355, 16), this.wheelRimMat);
        rimCyl.rotation.z = Math.PI / 2;
        const ringOut = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.010, 8, 24), this.compoundMat);
        ringOut.rotation.y = Math.PI / 2;
        ringOut.position.x = isLeft ? -0.176 : 0.176;
        spinPivot.add(cyl, rimCyl, ringOut);
      }

      if (!hasGlbCaliper) {
        const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.13, 0.095), this.caliperMat);
        caliper.position.set(isLeft ? 0.02 : -0.02, 0.06, c.isFront ? 0.11 : -0.11);
        steerPivot.add(caliper);
      }

      // Soft Incandescent Brake Thermal Glow Disc visible through 10-spoke forged rims!
      const haloMat = new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0xff5a00,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const haloPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), haloMat);
      haloPlane.rotation.y = Math.PI / 2;
      haloPlane.position.x = isLeft ? -0.14 : 0.14;
      steerPivot.add(haloPlane);
      this.brakeHaloMats.push(haloMat);

      this.root.add(steerPivot);
      this.wheels.push({ ...c, baseY: c.y, baseSteerY: c.y, steerPivot, spinPivot });
    }
  }

  _buildVFXAttachments() {
    const glowTex = getSoftGlowTexture();

    // 1. FIA Rear Rain-Light Soft Ruby Halo Sprite
    this.rainHaloMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: 0xff1728,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.rainHaloMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), this.rainHaloMat);
    this.rainHaloMesh.position.set(0, 0.21, 2.085);
    this.chassisTiltGroup.add(this.rainHaloMesh);

    // 2. Dual-Core Blue Plasma + Fiery Orange Exhaust Shift-Cut / Backfire Flame Assembly
    this.exhaustFlameGroup = new THREE.Group();
    this.exhaustFlameGroup.position.set(0, 0.35, 2.13);
    this.exhaustFlameGroup.visible = false;

    const coreConeGeo = new THREE.ConeGeometry(0.050, 0.52, 12, 1, true);
    coreConeGeo.translate(0, 0.26, 0);
    coreConeGeo.rotateX(Math.PI / 2);
    this.flameCoreMat = new THREE.MeshBasicMaterial({
      color: 0x62f0ff,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.flameCoreMesh = new THREE.Mesh(coreConeGeo, this.flameCoreMat);

    const outerConeGeo = new THREE.ConeGeometry(0.105, 0.96, 12, 1, true);
    outerConeGeo.translate(0, 0.48, 0);
    outerConeGeo.rotateX(Math.PI / 2);
    this.flameOuterMat = new THREE.MeshBasicMaterial({
      color: 0xff7b00,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.flameOuterMesh = new THREE.Mesh(outerConeGeo, this.flameOuterMat);

    const wgGeo = new THREE.ConeGeometry(0.026, 0.34, 8, 1, true);
    wgGeo.translate(0, 0.17, 0);
    wgGeo.rotateX(Math.PI / 2);
    const wgLeft = new THREE.Mesh(wgGeo, this.flameOuterMat);
    wgLeft.position.set(-0.072, -0.02, 0.02);
    const wgRight = new THREE.Mesh(wgGeo, this.flameOuterMat);
    wgRight.position.set(0.072, -0.02, 0.02);

    this.flameFlashMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: 0xffaa33,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flashSprite = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), this.flameFlashMat);
    flashSprite.position.z = 0.04;

    this.exhaustFlameGroup.add(this.flameOuterMesh, this.flameCoreMesh, wgLeft, wgRight, flashSprite);
    this.chassisTiltGroup.add(this.exhaustFlameGroup);

    // Continuous Exhaust Afterburner Core Glow & Shimmering Heat-Haze Plume
    this.afterburnerMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: 0xff6a1a,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.afterburnerMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), this.afterburnerMat);
    this.afterburnerMesh.position.set(0, 0.35, 2.115);
    this.chassisTiltGroup.add(this.afterburnerMesh);

    const hazeGeo = new THREE.ConeGeometry(0.14, 0.78, 10, 1, true);
    hazeGeo.translate(0, 0.39, 0);
    hazeGeo.rotateX(Math.PI / 2);
    this.heatHazeMat = new THREE.MeshBasicMaterial({
      color: 0xffb870,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.heatHazeMesh = new THREE.Mesh(hazeGeo, this.heatHazeMat);
    this.heatHazeMesh.position.set(0, 0.35, 2.12);
    this.chassisTiltGroup.add(this.heatHazeMesh);

    // 3. High-Speed (>250 km/h) Rear-Wingtip Aero Condensation Vortex Ribbons
    this.vortexGroup = new THREE.Group();
    this.vortexTrails = [];
    const vortexOuterGeo = new THREE.ConeGeometry(0.052, 4.6, 10, 1, true);
    vortexOuterGeo.translate(0, 2.3, 0);
    vortexOuterGeo.rotateX(Math.PI / 2);

    const vortexCoreGeo = new THREE.ConeGeometry(0.020, 3.8, 8, 1, true);
    vortexCoreGeo.translate(0, 1.9, 0);
    vortexCoreGeo.rotateX(Math.PI / 2);

    this.vortexOuterMat = new THREE.MeshBasicMaterial({
      color: 0x9cefff,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.vortexCoreMat = new THREE.MeshBasicMaterial({
      color: 0xe8fcff,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (const side of [-1, 1]) {
      const tipPivot = new THREE.Group();
      tipPivot.position.set(side * 0.535, 0.895, 2.13);
      const outerTube = new THREE.Mesh(vortexOuterGeo, this.vortexOuterMat);
      const coreTube = new THREE.Mesh(vortexCoreGeo, this.vortexCoreMat);
      tipPivot.add(outerTube, coreTube);
      this.vortexGroup.add(tipPivot);
      this.vortexTrails.push({ side, tipPivot, outerTube, coreTube });
    }
    this.vortexGroup.visible = false;
    this.chassisTiltGroup.add(this.vortexGroup);

    // 4. Multi-Stage Wet Rooster-Tail Spray
    this.sprayGroup = new THREE.Group();
    this.sprayPuffs = [];
    const puffGeo = new THREE.PlaneGeometry(1.05, 1.05);
    this.sprayMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: 0xdff0ff,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < 16; i++) {
      const isCenterPlume = i >= 8;
      const side = isCenterPlume ? ((i % 2 === 0 ? -1 : 1) * 0.16) : (i % 2 === 0 ? -0.84 : 0.84);
      const puff = new THREE.Mesh(puffGeo, this.sprayMat);
      puff.position.set(side, 0.35, 1.85 + (i % 8) * 0.65);
      this.sprayGroup.add(puff);
      this.sprayPuffs.push({ mesh: puff, baseX: side, idx: i, isCenterPlume });
    }
    this.sprayGroup.visible = false;
    this.root.add(this.sprayGroup);

    // 5. Titanium Underfloor Skid-Block & Damage Spark Shower
    this.sparkGroup = new THREE.Group();
    this.sparks = [];
    const sparkGeo = new THREE.BoxGeometry(0.026, 0.026, 0.52);
    const sparkGoldMat = new THREE.MeshBasicMaterial({
      color: 0xffe57f,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const sparkOrangeMat = new THREE.MeshBasicMaterial({
      color: 0xff8c00,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });

    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Mesh(sparkGeo, i % 2 === 0 ? sparkGoldMat : sparkOrangeMat);
      const spreadX = (Math.random() - 0.5) * 1.15;
      sp.position.set(spreadX, 0.06, 1.2 + (i / 14) * 2.4);
      this.sparkGroup.add(sp);
      this.sparks.push({ mesh: sp, seed: i * 0.618, spreadX });
    }
    this.sparkGroup.visible = false;
    this.root.add(this.sparkGroup);

    // 6. Off-Track Gravel & Turf Clod Kick-Up VFX (active on grass / gravel traps!)
    this.gravelGroup = new THREE.Group();
    this.gravelParticles = [];
    const clodGeo = new THREE.DodecahedronGeometry(0.052, 0);
    this.gravelClodMat = new THREE.MeshStandardMaterial({
      color: 0x8a7254,
      roughness: 0.92,
      metalness: 0.02,
    });
    this.turfClodMat = new THREE.MeshStandardMaterial({
      color: 0x3b5c2c,
      roughness: 0.88,
      metalness: 0.02,
    });
    this.gravelDustMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: 0xc2aa88,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < 16; i++) {
      const isDust = i >= 10;
      const wheelSide = i % 2 === 0 ? -0.86 : 0.86;
      const isFrontOrigin = (i % 4) < 2;
      const mesh = isDust
        ? new THREE.Mesh(puffGeo, this.gravelDustMat)
        : new THREE.Mesh(clodGeo, i % 3 === 0 ? this.turfClodMat : this.gravelClodMat);
      this.gravelGroup.add(mesh);
      this.gravelParticles.push({
        mesh,
        isDust,
        baseX: wheelSide,
        baseZ: isFrontOrigin ? -1.15 : 1.65,
        seed: i * 0.417,
      });
    }
    this.gravelGroup.visible = false;
    this.root.add(this.gravelGroup);

    // 7. Dry Tire Lock-Up & Heavy Slip White-Blue Pirelli Smoke Puffs
    this.lockupSmokeGroup = new THREE.Group();
    this.lockupSmokePuffs = [];
    this.lockupSmokeMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: 0xeaf2ff,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 8; i++) {
      const puff = new THREE.Mesh(puffGeo, this.lockupSmokeMat);
      const side = i % 2 === 0 ? -0.86 : 0.86;
      const isFront = i < 6;
      this.lockupSmokeGroup.add(puff);
      this.lockupSmokePuffs.push({
        mesh: puff,
        baseX: side,
        baseZ: isFront ? -1.32 : 1.55,
        seed: i * 0.37,
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
    this.compoundMat.color.setStyle(comp.colorHex);
    this.compoundMat.emissive.setStyle(comp.colorHex);
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

  triggerBackfire(duration = 0.14) {
    this.backfireTimer = Math.max(this.backfireTimer, duration);
  }

  updateTransformAndVFX(carState, trackFrame, moistureW, dt, elapsedSec) {
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

    // Auto-hide player's own helmet mesh in Cockpit View (cameraIndex === 2) so view is 100% clear
    if (carState.isCockpitView !== undefined || carState.cameraIndex !== undefined || carState.cameraModeIdx !== undefined) {
      const wantHide = Boolean(
        carState.isCockpitView ||
        (carState.isPlayer && (carState.cameraIndex === 2 || carState.cameraModeIdx === 2))
      );
      this.setCockpitViewActive(wantHide);
    }

    // Dynamic 3D suspension pitch, roll & pit-jack lift (uses @physics chassisPitchRad/chassisRollRad when present!)
    const targetPitch =
      (carState.chassisPitchRad !== undefined
        ? carState.chassisPitchRad
        : (carState.brakeInput || 0) * 0.025 - (carState.throttleInput || 0) * 0.013) +
      (carState.pitJackLift || 0) * 0.042;
    const targetRoll =
      carState.chassisRollRad !== undefined
        ? carState.chassisRollRad
        : -(carState.latG || 0) * 0.021;
    const tiltLerp = Math.min(1, dt * 15);
    this.chassisTiltGroup.rotation.x += (targetPitch - this.chassisTiltGroup.rotation.x) * tiltLerp;
    this.chassisTiltGroup.rotation.z += (targetRoll - this.chassisTiltGroup.rotation.z) * tiltLerp;
    this.chassisTiltGroup.position.y = (carState.pitJackLift || 0) * 0.18;

    // Effective steering angle & cockpit steering-wheel + gloved hands rotation
    const effSteerRad =
      carState.steerAngleRad !== undefined
        ? carState.steerAngleRad
        : (carState.steerInput || 0) * 0.42;
    const wheelTurnRad =
      carState.steerInput !== undefined
        ? carState.steerInput * 0.96
        : effSteerRad * 2.15;

    const rpm = carState.rpm || 0;
    if (this.parts.steeringWheel) {
      const baseZ = this.parts.steeringWheel.userData.baseRotZ || 0;
      this.parts.steeringWheel.rotation.z = baseZ - wheelTurnRad;
    } else if (this.parts.cockpitWheel) {
      const baseZ = this.parts.cockpitWheel.userData.baseRotZ || 0;
      this.parts.cockpitWheel.rotation.z = baseZ + wheelTurnRad;
    }

    if (this.shiftLedMat) {
      if (rpm > 12250) this.shiftLedMat.color.setHex(0x00e5ff);
      else if (rpm > 10900) this.shiftLedMat.color.setHex(0xff2438);
      else if (rpm > 9000) this.shiftLedMat.color.setHex(0xffd600);
      else this.shiftLedMat.color.setHex(0x00ff88);
    }

    // Wet Tire Sheen, Exhaust Thermal Glow & Continuous Afterburner Heat-Haze
    this.tireRubberMat.roughness = moistureW > 0.12 ? Math.max(0.22, 0.72 - moistureW * 0.48) : 0.72;
    const rpmNorm = Math.max(0, Math.min(1, (rpm - 4500) / 8500));
    const throttleIn = carState.throttleInput || 0;
    this.exhaustMat.emissiveIntensity = 0.10 + rpmNorm * 0.55;
    if (this.afterburnerMat && this.heatHazeMesh) {
      const abPulse = 0.85 + 0.15 * Math.sin(elapsedSec * 42.0);
      this.afterburnerMat.opacity = (0.18 + rpmNorm * 0.52 + throttleIn * 0.18) * abPulse;
      const abScale = 0.82 + rpmNorm * 0.55;
      this.afterburnerMesh.scale.setScalar(abScale);
      this.heatHazeMat.opacity = (0.06 + rpmNorm * 0.16 + throttleIn * 0.08) * abPulse;
      this.heatHazeMesh.scale.set(
        0.9 + 0.18 * Math.sin(elapsedSec * 31.0),
        0.9 + 0.18 * Math.cos(elapsedSec * 27.0),
        0.75 + rpmNorm * 0.85
      );
      this.heatHazeMesh.rotation.z = elapsedSec * 9.5;
    }

    // Blinking FIA Rear Rain / ERS Light
    const speedKmh = carState.speedKmh || 0;
    const flashRainLight = moistureW > 0.12 || carState.inPitLane || (speedKmh > 60 && throttleIn < 0.22);
    const pulseOn = ((elapsedSec * 8.5 + (carState.carNum || 0) * 0.31) % 1.0) < 0.52;
    const rainInt = flashRainLight ? (pulseOn ? 5.6 : 0.26) : 1.50;
    this.rainLightMat.emissiveIntensity = rainInt;
    this.rainHaloMat.opacity = flashRainLight ? (pulseOn ? 0.90 : 0.06) : 0.34;

    // Spin, steer & compress all 4 18-inch wheels (supports @physics wheelCompression = [fl, fr, rl, rr])
    const speedMps = speedKmh / 3.6;
    this.wheelSpinAngle -= (speedMps / 0.34) * dt;
    const visualSteer = -effSteerRad * 0.88;
    const wComp = Array.isArray(carState.wheelCompression) ? carState.wheelCompression : null;
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      if (w.isFront) w.steerPivot.rotation.y = visualSteer;
      w.spinPivot.rotation.x = this.wheelSpinAngle;
      const compOffset = wComp ? THREE.MathUtils.clamp(Number(wComp[i]) || 0, -0.06, 0.08) : 0;
      w.steerPivot.position.y = w.baseY + compOffset;
      const susp = this.suspensionNodes[w.id];
      if (susp && wComp) {
        susp.rotation.z = (w.x < 0 ? -1 : 1) * compOffset * 1.15;
      }
    }

    // Glowing Carbon-Ceramic Brake Discs & Calipers
    const brakeIn = carState.brakeInput || 0;
    const heatGain = brakeIn > 0.20 && speedKmh > 80
      ? brakeIn * (speedKmh / 300.0) * 9.6
      : 0;
    if (heatGain > 0) {
      this.brakeGlow = Math.min(5.6, this.brakeGlow + heatGain * dt);
    } else {
      this.brakeGlow = Math.max(0, this.brakeGlow - 2.85 * dt);
    }
    const heatNorm = Math.min(1.0, this.brakeGlow / 5.2);
    const thR = 0.85 + 0.15 * Math.min(1.0, heatNorm * 1.8);
    const thG = 0.08 + 0.64 * Math.pow(heatNorm, 1.35);
    const thB = 0.02 + 0.18 * Math.pow(heatNorm, 2.2);
    this.brakeDiscMat.emissive.setRGB(thR, thG, thB);
    this.brakeDiscMat.emissiveIntensity = this.brakeGlow;
    this.caliperMat.emissive.setRGB(thR * 0.92, thG * 0.65, thB * 0.45);
    this.caliperMat.emissiveIntensity = Math.min(1.4, this.brakeGlow * 0.25);
    const haloAlpha = Math.min(0.64, this.brakeGlow * 0.13);
    for (const hm of this.brakeHaloMats) {
      hm.color.setRGB(thR, thG * 0.92 + 0.08, thB);
      hm.opacity = haloAlpha;
    }

    if ((carState.revBlipTimer || 0) > 0.06 && speedKmh > 135 && this.backfireTimer <= 0) {
      this.backfireTimer = 0.085;
    }

    if (this.backfireTimer > 0 && !carState.exploded) {
      this.backfireTimer -= dt;
      this.exhaustFlameGroup.visible = true;
      const flick = 0.78 + Math.random() * 0.58;
      const lenZ = 0.72 + Math.random() * 0.85;
      this.flameCoreMesh.scale.set(flick * 0.92, flick * 0.92, lenZ * 1.08);
      this.flameOuterMesh.scale.set(flick * 1.08, flick * 1.08, lenZ);
      this.exhaustFlameGroup.rotation.z = Math.random() * Math.PI * 2;
      this.flameFlashMat.opacity = 0.55 + Math.random() * 0.40;
    } else {
      this.exhaustFlameGroup.visible = false;
    }

    // High-Speed (>250 km/h) Rear-Wingtip Aero Condensation Vortex Contrails
    const vortexThreshold = 250.0;
    if (speedKmh > vortexThreshold && !carState.exploded) {
      this.vortexGroup.visible = true;
      const speedNorm = Math.min(1.0, (speedKmh - vortexThreshold) / 58.0);
      const towBoost = (carState.inSlipstream || carState.drsActive) ? 0.55 : 0.0;
      const humidBoost = 1.0 + moistureW * 1.45 + towBoost;
      const vAlpha = Math.min(0.54, (0.06 + speedNorm * 0.20) * humidBoost);
      this.vortexOuterMat.opacity = vAlpha;
      this.vortexCoreMat.opacity = Math.min(0.76, vAlpha * 1.62);

      const slipYaw = -(carState.latG || 0) * 0.038;
      const lenScale = 0.72 + speedNorm * 0.72 + towBoost * 0.28;
      for (const vt of this.vortexTrails) {
        const flutter = Math.sin(elapsedSec * 30.0 + vt.side * 1.7) * 0.014;
        const pulseR = 0.92 + 0.14 * Math.sin(elapsedSec * 24.0 - vt.side * 1.1);
        vt.tipPivot.rotation.y = slipYaw + flutter;
        vt.tipPivot.rotation.x = -0.024 + Math.cos(elapsedSec * 22.0 + vt.side) * 0.008;
        vt.outerTube.scale.set(pulseR, pulseR, lenScale);
        vt.coreTube.scale.set(1.0, 1.0, lenScale * 0.96);
        vt.outerTube.rotation.z = elapsedSec * 14.0 * vt.side;
        vt.coreTube.rotation.z = -elapsedSec * 18.0 * vt.side;
      }
    } else {
      this.vortexGroup.visible = false;
    }

    // Multi-Stage Wet Rooster-Tail Spray Plumes
    const showSpray = moistureW > 0.12 && speedKmh > 58 && !carState.exploded;
    this.sprayGroup.visible = showSpray;
    if (showSpray) {
      const intensity = Math.min(1.0, ((speedKmh - 58) / 195) * (0.42 + moistureW * 0.92));
      this.sprayMat.opacity = 0.15 + intensity * 0.36;
      for (const p of this.sprayPuffs) {
        const rate = p.isCenterPlume ? 7.8 : 9.6;
        const phase = (elapsedSec * rate + p.idx * 0.29) % 1.0;
        if (p.isCenterPlume) {
          p.mesh.position.z = 2.0 + phase * (5.5 + intensity * 6.8);
          p.mesh.position.y = 0.42 + phase * (1.85 + intensity * 2.45);
          p.mesh.position.x = p.baseX + Math.sin(elapsedSec * 6.0 + p.idx) * phase * 0.55;
          p.mesh.scale.setScalar(0.65 + phase * (1.9 + intensity * 2.1));
        } else {
          p.mesh.position.z = 1.65 + phase * (3.8 + intensity * 4.5);
          p.mesh.position.y = 0.24 + phase * (0.95 + intensity * 1.25);
          p.mesh.position.x = p.baseX * (1.0 + phase * 0.68);
          p.mesh.scale.setScalar(0.48 + phase * (1.35 + intensity * 1.45));
        }
        p.mesh.rotation.z = elapsedSec * 1.8 + p.idx;
      }
    }

    // Articulated DRS Flap & Wing Damage
    const fwDmg = carState.damage?.frontWing || 0;
    const rwDmg = carState.damage?.rearWing || 0;
    const hasPunc = !!carState.damage?.hasPuncture;

    const steerMag = Math.abs(
      carState.steerInput !== undefined
        ? carState.steerInput
        : (carState.steerAngleRad || 0) * 2.4
    );
    const drsOpen =
      !carState.exploded &&
      brakeIn < 0.08 &&
      rwDmg < 0.55 &&
      !!(
        carState.drsActive ||
        carState.inSlipstream ||
        (speedKmh > 235 && steerMag < 0.08)
      );
    if (this.parts.drsFlap) {
      const baseX = this.parts.drsFlap.userData.baseRotX || 0;
      const targetDrs = baseX + (drsOpen ? 0.32 * this._drsOpenSign : 0.0);
      this.parts.drsFlap.rotation.x += (targetDrs - this.parts.drsFlap.rotation.x) * Math.min(1, dt * 16);
    }

    // Throttled ~15Hz Live OLED Steering-Wheel & Dash Telemetry Redraw (Player / Cockpit Car)
    const shouldRefreshOled =
      (carState.isPlayer !== false && (carState.isPlayer || this._cockpitViewActive || carState.carNum === 1)) &&
      (elapsedSec - this._oledLastDrawSec >= 0.066 ||
        carState.gear !== this._oledLastGear ||
        drsOpen !== this._oledLastDrs);
    if (shouldRefreshOled) {
      this._oledLastDrawSec = elapsedSec;
      this._oledLastGear = carState.gear;
      this._oledLastDrs = drsOpen;
      const gearLabel = speedKmh < 3 && !carState.gear ? 'N' : (carState.gear || Math.max(1, Math.min(8, Math.ceil(speedKmh / 42))));
      const compId = carState.tireCompound || this._liveryState.compound || 'SOFT';
      const tireWear = carState.tireWear !== undefined ? carState.tireWear : 0;
      const tireLifePct = tireWear <= 1.05 ? (1.0 - tireWear) * 100 : tireWear;
      const rawErs =
        carState.ersCharge !== undefined
          ? carState.ersCharge
          : (carState.ersSoc !== undefined ? carState.ersSoc : carState.ersEnergy);
      const ersPct =
        rawErs !== undefined
          ? (rawErs <= 1.05 ? rawErs * 100 : rawErs)
          : Math.max(18, 96 - rpmNorm * 28);
      this._renderOledTelemetry(gearLabel, speedKmh, compId, tireLifePct, ersPct, drsOpen, !!carState.inPitLane, rpmNorm);
    }

    if (this.parts.fwEndL) {
      const bZ = this.parts.fwEndL.userData.baseRotZ || 0;
      const bX = this.parts.fwEndL.userData.baseRotX || 0;
      if (fwDmg > 0.72) {
        this.parts.fwEndL.visible = false;
      } else {
        this.parts.fwEndL.visible = true;
        this.parts.fwEndL.rotation.z = bZ + (fwDmg > 0.48 ? 0.30 : (fwDmg > 0.26 ? 0.12 : 0.0));
        this.parts.fwEndL.rotation.x = bX + (fwDmg > 0.48 ? 0.12 : 0.0);
      }
    }
    if (this.parts.fwEndR) {
      const bZ = this.parts.fwEndR.userData.baseRotZ || 0;
      const bX = this.parts.fwEndR.userData.baseRotX || 0;
      if (fwDmg > 0.84) {
        this.parts.fwEndR.visible = false;
      } else {
        this.parts.fwEndR.visible = true;
        this.parts.fwEndR.rotation.z = bZ + (fwDmg > 0.48 ? -0.32 : (fwDmg > 0.34 ? -0.14 : 0.0));
        this.parts.fwEndR.rotation.x = bX + (fwDmg > 0.48 ? 0.10 : 0.0);
      }
    }
    if (this.parts.rwMain) {
      const bZ = this.parts.rwMain.userData.baseRotZ || 0;
      this.parts.rwMain.rotation.z = bZ + (rwDmg > 0.30 ? 0.14 * Math.sin(elapsedSec * 24) + 0.12 : 0.0);
    }

    // Off-Track Gravel & Turf Clod Kick-Up VFX
    const offTrackActive = !carState.exploded && speedKmh > 30 && Boolean(carState.onGrass || carState.onGravel || carState.offTrack);
    this.gravelGroup.visible = offTrackActive;
    if (offTrackActive) {
      const gPower = Math.min(1.0, (speedKmh - 28) / 145);
      this.gravelDustMat.color.setHex(carState.onGravel ? 0xcab08a : 0x8fa078);
      this.gravelDustMat.opacity = 0.14 + gPower * 0.24;
      for (const gp of this.gravelParticles) {
        const ph = (elapsedSec * (gp.isDust ? 4.8 : 7.4) + gp.seed) % 1.0;
        gp.mesh.position.z = gp.baseZ + ph * (2.6 + gPower * 3.4);
        gp.mesh.position.x = gp.baseX + Math.sin(ph * 6.2 + gp.seed * 8.0) * 0.28;
        if (gp.isDust) {
          gp.mesh.position.y = 0.18 + ph * (0.85 + gPower * 0.95);
          gp.mesh.scale.setScalar(0.35 + ph * (1.15 + gPower * 0.95));
          gp.mesh.rotation.z = elapsedSec * 2.1 + gp.seed;
        } else {
          gp.mesh.position.y = 0.06 + Math.sin(ph * Math.PI) * (0.48 + gPower * 0.62);
          gp.mesh.rotation.x = elapsedSec * 14.0 + gp.seed * 5.0;
          gp.mesh.rotation.y = elapsedSec * 11.0;
        }
      }
    }

    // Dry Tire Lock-Up & Cornering Slip Smoke Puffs (Player & @cpu aiLockupPuffTimer!)
    const skidInt = Math.max(carState.skidIntensity || 0, (carState.aiLockupPuffTimer || 0) > 0 ? 0.92 : 0);
    const showLockupSmoke = !carState.exploded && moistureW < 0.22 && speedKmh > 42 && skidInt > 0.48;
    this.lockupSmokeGroup.visible = showLockupSmoke;
    if (showLockupSmoke) {
      const smokePow = Math.min(1.0, (skidInt - 0.45) * 1.8);
      this.lockupSmokeMat.opacity = 0.14 + smokePow * 0.28;
      for (const sp of this.lockupSmokePuffs) {
        const ph = (elapsedSec * 6.8 + sp.seed) % 1.0;
        sp.mesh.position.x = sp.baseX + Math.sin(ph * 5.0 + sp.seed * 6.0) * 0.20;
        sp.mesh.position.y = 0.16 + ph * (0.55 + smokePow * 0.55);
        sp.mesh.position.z = sp.baseZ + ph * (2.2 + smokePow * 2.4);
        sp.mesh.scale.setScalar(0.38 + ph * (1.05 + smokePow * 0.85));
        sp.mesh.rotation.z = elapsedSec * 2.4 + sp.seed;
      }
    }

    // Titanium Skid-Block & Damage Spark Shower
    const damageSpark = (hasPunc || fwDmg > 0.55 || rwDmg > 0.60) && speedKmh > 45;
    const curbSpark = !!carState.onCurb && speedKmh > 110;
    const highSpeedSpark = speedKmh > 285;
    const aeroPlankSpark =
      highSpeedSpark ||
      (speedKmh > 268 && Math.sin(elapsedSec * 13.5 + (carState.carNum || 1) * 1.9) > 0.32);

    const showSparks = !carState.exploded && (damageSpark || curbSpark || aeroPlankSpark);
    this.sparkGroup.visible = showSparks;
    if (showSparks) {
      const sparkPower = damageSpark
        ? 1.0
        : (curbSpark ? 0.92 : (highSpeedSpark ? 0.96 : Math.min(1.0, (speedKmh - 265) / 45)));
      for (let i = 0; i < this.sparks.length; i++) {
        const sObj = this.sparks[i];
        const ph = (elapsedSec * (16.0 + (i % 4) * 2.8) + sObj.seed) % 1.0;
        sObj.mesh.visible = ph < (0.40 + sparkPower * 0.58);
        if (sObj.mesh.visible) {
          sObj.mesh.position.z = 0.95 + ph * (2.8 + sparkPower * 2.2);
          sObj.mesh.position.x = sObj.spreadX * (0.45 + ph * 1.02);
          sObj.mesh.position.y = 0.045 + Math.abs(Math.sin(ph * Math.PI * 2.2)) * (0.18 + sparkPower * 0.21);
          sObj.mesh.rotation.x = -0.08 * Math.cos(ph * Math.PI * 2.2);
          sObj.mesh.scale.z = 0.72 + sparkPower * 1.05;
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
// Supports both `PitCrewDiorama` AND standalone `createPitCrewTeamRig` /
// `updatePitCrewTeamRig` with `pit_crew_rig.glb` SkinnedMesh + AnimationMixer!
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
    this.wheelGunFlashes = [];
    this.active = false;
    this._prevElapsedSec = 0;

    this._buildCrewMaterialsAndGantry(assets);
    if (track) this.repositionForTrack(track);
    if (scene) scene.add(this.group);
  }

  _buildCrewMaterialsAndGantry(assets) {
    this.suitMat = new THREE.MeshStandardMaterial({ color: 0xd40814, roughness: 0.48, metalness: 0.12 });
    this.stripeMat = new THREE.MeshStandardMaterial({ color: 0xf7f9fc, roughness: 0.35, metalness: 0.20 });
    this.helmMat = new THREE.MeshPhysicalMaterial({ color: 0xf5f8ff, roughness: 0.14, metalness: 0.32, clearcoat: 1.0 });
    this.visorMat = new THREE.MeshPhysicalMaterial({ color: 0x0a1628, roughness: 0.03, metalness: 0.96, clearcoat: 1.0 });
    this.gearMat = new THREE.MeshStandardMaterial({ color: 0x1b2029, roughness: 0.30, metalness: 0.76 });
    this.hoseMat = new THREE.MeshStandardMaterial({ color: 0xffb300, roughness: 0.42, metalness: 0.25 });
    const glowTex = getSoftGlowTexture();

    // Overhead Carbon Pit-Box Pneumatic Boom Rig + Coiled Air Hoses
    const boomGroup = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 3.85, 12), this.gearMat);
    post.position.set(0.2, 1.92, 4.15);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 4.5), this.gearMat);
    arm.position.set(0.2, 3.78, 2.05);
    boomGroup.add(post, arm);

    // 4 Overhead Pneumatic Air Whip Hoses dropping toward wheel-gunner stations
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
    for (let t = 0; t < 4; t++) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.32, 20), new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.72 }));
      tire.position.set(0, 0.17 + t * 0.33, 0);
      tire.castShadow = true;
      spareStack.add(tire);
    }
    this.group.add(spareStack);

    // Local frame: +X is car nose forward, -X is car rear, z=0 is car centerline, +Z is Pit Garage apron!
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
        flashMat = new THREE.MeshBasicMaterial({
          map: glowTex,
          color: 0x80e8ff,
          transparent: true,
          opacity: 0.0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const flashPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.44), flashMat);
        flashPlane.position.set(0, 0.44, 0.52);
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

    // Bind 13-Bone Skeletal PitCrew_Armature + NLA Animations from pit_crew_rig.glb!
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
      // In pit_crew_rig.glb, PitCrew_Armature faces -X; +PI/2 turns -X into +Z (holder forward!)
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
          const burst = !isReleasePhase && Math.sin(elapsedSec * 38 + i * 1.7) > 0.15;
          m.flashMat.opacity = burst ? 0.86 : 0.08;
          m.flashMat.color.setHex(i % 2 === 0 ? 0x66e6ff : 0xffd54f);
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
  rig.group = rig; // Self-alias so both `scene.add(rig)` and `scene.add(rig.group)` work!
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
// 1982 / 2026 FIERY EXPLOSION & SHATTERED CARBON FIBER TRACK DEBRIS POOL
// ============================================================================
export class EffectsManager {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.explosions = [];
    this.debrisItems = [];

    this._fireSphereGeo = new THREE.SphereGeometry(0.48, 10, 10);
    this._shardBoxGeo = new THREE.BoxGeometry(0.36, 0.05, 0.24);
    this._shockRingGeo = new THREE.RingGeometry(0.45, 0.95, 28);
    this._shockRingGeo.rotateX(-Math.PI / 2);

    const carbonMaps = getCarbonWeaveMaps();
    this._debrisCarbonMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: carbonMaps.map,
      bumpMap: carbonMaps.bumpMap,
      bumpScale: 0.006,
      roughness: 0.34,
      metalness: 0.35,
    });
    this._debrisPaintRedMat = new THREE.MeshStandardMaterial({
      color: 0xd40814,
      roughness: 0.20,
      metalness: 0.32,
    });
    this._debrisWarnMat = new THREE.MeshBasicMaterial({
      color: 0xff6d00,
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

    const blastLight = new THREE.PointLight(0xff6d00, 7.5, 28, 1.6);
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
      const isEmber = i % 3 === 0;
      const mat = new THREE.MeshBasicMaterial({
        color: isEmber ? 0xffab00 : 0x1a1e26,
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
        ? this._debrisWarnMat
        : (i === 1 ? this._debrisPaintRedMat : this._debrisCarbonMat);
      const shard = new THREE.Mesh(this._shardBoxGeo, mat);
      shard.scale.set(0.9 + (i % 3) * 0.45, 1.0 + (i % 2) * 0.8, 0.85 + ((i + 1) % 3) * 0.4);
      shard.position.set(
        (Math.random() - 0.5) * 2.3,
        0.055 + (i % 2) * 0.03,
        (Math.random() - 0.5) * 2.3
      );
      shard.rotation.set(
        (Math.random() - 0.5) * 0.28,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.32
      );
      shard.castShadow = true;
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
    const nowSec = performance.now() * 0.001;

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

      ex.blastLight.intensity = Math.max(0, 7.5 * Math.pow(1.0 - Math.min(1.0, ex.age / 0.75), 2.0));

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
          if (p.mesh.position.y < 0.06) {
            p.mesh.position.y = 0.06;
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

    this._debrisWarnMat.color.setHex(Math.sin(nowSec * 9.0) > 0 ? 0xff7b00 : 0xff2a00);

    for (let i = this.debrisItems.length - 1; i >= 0; i--) {
      this.debrisItems[i].ttl -= dt;
      if (this.debrisItems[i].ttl <= 0) {
        this.scene.remove(this.debrisItems[i].group);
        this.debrisItems.splice(i, 1);
      }
    }
  }
}
