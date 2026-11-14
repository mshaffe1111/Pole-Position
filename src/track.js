// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Multi-Circuit AAA 3D Track Builder (Fuji '82, Monaco, Vegas, Monza, Suzuka, Silverstone)
// Zero-Yank Uniform Spline + Zero-Leak Disposal + High-Res Procedural PBR Art
// ============================================================================

import * as THREE from 'three';
import {
  TRACK_GAME_LENGTH,
  ROAD_HALF_WIDTH,
  CURB_WIDTH,
  TRACK_CATALOG,
  FUJI_SECTORS,
  PIT_LANE_CONFIG,
  BILLBOARD_BRANDS,
} from './config.js';

const SAMPLES = 2000;

const TEXTURE_SLOTS = [
  'map',
  'bumpMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'normalMap',
  'alphaMap',
];

function wrapS(s) {
  if (!Number.isFinite(s)) return 0;
  let r = s % TRACK_GAME_LENGTH;
  if (r < 0) r += TRACK_GAME_LENGTH;
  if (r >= TRACK_GAME_LENGTH) r = 0;
  return r;
}

function quinticBlend(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * c * (10 - 15 * c + 6 * c * c);
}

// Fast deterministic integer hash [0..1) for crisp procedural PBR grain
function fastHash2D(x, y, seed = 0) {
  let h = Math.imul(x ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(y ^ 0x85ebca6b, 0xc2b2ae35) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// Merge multiple indexed or non-indexed BufferGeometries into one single-draw-call BufferGeometry
function mergeSubGeometries(geos) {
  const posOut = [];
  const normOut = [];
  for (const g of geos) {
    const pos = g.getAttribute('position');
    const norm = g.getAttribute('normal');
    const idx = g.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        const vi = idx.getX(i);
        posOut.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
        normOut.push(norm.getX(vi), norm.getY(vi), norm.getZ(vi));
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        posOut.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        normOut.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      }
    }
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(posOut, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normOut, 3));
  return merged;
}

export class FujiTrack {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.currentTrackId = 'FUJI_1982';
    this.trackDef = TRACK_CATALOG.FUJI_1982;

    this.samples = [];
    this.realMetersPerGameMeter = 4.25;
    this.billboards = [];
    this.puddles = [];
    this.pitBoxes = [];
    this.marshalPosts = [];
    this.gantryLights = [];
    this.animatedProps = [];
    this.skidIndex = 0;
    this.maxSkids = 900;

    // Protect shared GLB template buffers/materials/textures from circuit disposal
    this._protectedGeos = new Set();
    this._protectedMats = new Set();
    this._protectedTexs = new Set();
    this._collectProtectedAssetResources();

    this.group = new THREE.Group();
    this.group.name = 'GrandPrixCircuitRoot';
    this.scene.add(this.group);

    this.loadCircuit('FUJI_1982');
  }

  _collectProtectedAssetResources() {
    const templates = this.assets?.templates;
    if (!templates) return;
    for (const root of Object.values(templates)) {
      if (!root || typeof root.traverse !== 'function') continue;
      root.traverse((node) => {
        if (node.geometry) this._protectedGeos.add(node.geometry);
        if (node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          for (const m of mats) {
            if (!m) continue;
            this._protectedMats.add(m);
            for (const slot of TEXTURE_SLOTS) {
              if (m[slot]) this._protectedTexs.add(m[slot]);
            }
          }
        }
      });
    }
  }

  _disposeCircuitGroup() {
    if (!this.group) return;
    this._collectProtectedAssetResources();

    const geosToDispose = new Set();
    const matsToDispose = new Set();
    const texsToDispose = new Set();

    this.group.traverse((obj) => {
      if (obj === this.group) return;
      if (obj.geometry && !this._protectedGeos.has(obj.geometry)) {
        geosToDispose.add(obj.geometry);
      }
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (!m || this._protectedMats.has(m)) continue;
          matsToDispose.add(m);
          for (const slot of TEXTURE_SLOTS) {
            if (m[slot] && !this._protectedTexs.has(m[slot])) {
              texsToDispose.add(m[slot]);
            }
          }
        }
      }
    });

    for (const tex of texsToDispose) {
      tex.dispose();
    }
    for (const mat of matsToDispose) {
      mat.dispose();
    }
    for (const geo of geosToDispose) {
      geo.dispose();
    }

    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[this.group.children.length - 1]);
    }
  }

  loadCircuit(trackId) {
    this.currentTrackId = TRACK_CATALOG[trackId] ? trackId : 'FUJI_1982';
    this.trackDef = TRACK_CATALOG[this.currentTrackId];
    this._minimapBounds = null;

    // Cleanly dispose all GPU geometries, materials & procedural textures from previous circuit
    this._disposeCircuitGroup();

    this.billboards = [];
    this.puddles = [];
    this.pitBoxes = [];
    this.marshalPosts = [];
    this.gantryLights = [];
    this.animatedProps = [];
    this.skidIndex = 0;

    this._buildTrueCatmullSpline();
    this._createRichMaterials();
    this._buildRoadAndRunoff();
    this._buildCurbsAndArmcoBarriers();
    this._buildPitLaneAndGarages();
    this._buildStartGantryAndGridBoxes();
    this._buildMidLapGantriesAndSkyAtmosphere();
    this._buildBrakingBoardsAndBillboards();
    this._buildMarshalPosts();
    this._buildPuddles();
    this._buildSkidmarkSystem();
    this._buildGrandstands();
    this._buildBiomeLandmarks();
  }

  // --------------------------------------------------------------------------
  // 1. TRUE CATMULL-ROM 3D SPLINE + LASER-STRAIGHT PIT STRAIGHT (ZERO YANK!)
  // --------------------------------------------------------------------------
  getSector(s) {
    const sw = wrapS(s);
    for (let i = 0; i < FUJI_SECTORS.length; i++) {
      const sec = FUJI_SECTORS[i];
      if (sw >= sec.start && sw < sec.end) return sec;
    }
    return FUJI_SECTORS[0];
  }

  getPhysicsCurvature(s) {
    const sw = wrapS(s);
    const fIdx = (sw / TRACK_GAME_LENGTH) * SAMPLES;
    const i0 = ((Math.floor(fIdx) % SAMPLES) + SAMPLES) % SAMPLES;
    const i1 = (i0 + 1) % SAMPLES;
    const frac = fIdx - Math.floor(fIdx);
    return this.samples[i0].curvature + (this.samples[i1].curvature - this.samples[i0].curvature) * frac;
  }

  _buildTrueCatmullSpline() {
    const ctrlVecs = this.trackDef.controlPoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(ctrlVecs, true, 'centripetal', 0.35);

    const totalLen = curve.getLength();
    this.realMetersPerGameMeter = totalLen / TRACK_GAME_LENGTH;

    // Uniform arc-length points around the entire closed circuit
    const rawPts = curve.getSpacedPoints(SAMPLES);
    rawPts.pop(); // getSpacedPoints(N) returns N+1 points where last == first

    // Rotate array so s = 0 sits right at (0, 0, 0) on the Main Pit Straight heading +X!
    let startIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < SAMPLES; i++) {
      const p = rawPts[i];
      const nextP = rawPts[(i + 1) % SAMPLES];
      if (nextP.x > p.x) {
        const d = p.x * p.x + p.z * p.z * 4.0;
        if (d < bestDist) {
          bestDist = d;
          startIdx = i;
        }
      }
    }

    const pts = new Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i++) {
      pts[i] = rawPts[(startIdx + i) % SAMPLES].clone();
    }

    const dsGame = TRACK_GAME_LENGTH / SAMPLES;
    const dsReal = totalLen / SAMPLES;

    // Anchor s = 0 precisely at X = 0 and quintic-flatten Y=0, Z=0 along Main Pit Straight
    // so Pit Wall, Garages, Grid Boxes & Start Gantry align with zero seam & zero lateral drift!
    const xOriginShift = pts[0].x;
    for (let i = 0; i < SAMPLES; i++) {
      pts[i].x -= xOriginShift;
      const s = i * dsGame;
      let lockWeight = 0.0;
      if (s >= 952.0 || s <= 122.0) {
        lockWeight = 1.0;
      } else if (s > 926.0 && s < 952.0) {
        lockWeight = quinticBlend((s - 926.0) / 26.0);
      } else if (s > 122.0 && s < 148.0) {
        lockWeight = 1.0 - quinticBlend((s - 122.0) / 26.0);
      }
      if (lockWeight > 0.0) {
        pts[i].y *= 1.0 - lockWeight;
        pts[i].z *= 1.0 - lockWeight;
      }
    }

    const upRef = new THREE.Vector3(0, 1, 0);
    const tangents = new Array(SAMPLES);
    const rights = new Array(SAMPLES);
    const normals = new Array(SAMPLES);

    for (let i = 0; i < SAMPLES; i++) {
      const s = i * dsGame;
      if (s >= 954.0 || s <= 120.0) {
        tangents[i] = new THREE.Vector3(1, 0, 0);
        rights[i] = new THREE.Vector3(0, 0, 1);
        normals[i] = new THREE.Vector3(0, 1, 0);
      } else {
        const prev = pts[(i - 2 + SAMPLES) % SAMPLES];
        const next = pts[(i + 2) % SAMPLES];
        const tan = new THREE.Vector3().subVectors(next, prev).normalize();
        const rgt = new THREE.Vector3().crossVectors(tan, upRef).normalize();
        const nrm = new THREE.Vector3().crossVectors(rgt, tan).normalize();
        tangents[i] = tan;
        rights[i] = rgt;
        normals[i] = nrm;
      }
    }

    // Compute exact signed geometric curvature directly from 3D tangent rotation!
    // Positive = road bends RIGHT (+right), Negative = road bends LEFT (-right), 0 = Straight!
    const rawCurv = new Float64Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i++) {
      const tPrev = tangents[(i - 4 + SAMPLES) % SAMPLES];
      const tNext = tangents[(i + 4) % SAMPLES];
      const dTan = new THREE.Vector3().subVectors(tNext, tPrev);
      const dPsi = dTan.dot(rights[i]);
      const radPerMeter = dPsi / (8.0 * dsReal);
      rawCurv[i] = Math.max(-0.95, Math.min(0.95, radPerMeter * 82.0));
    }

    // Smooth curvature over an 11-sample window + strictly clamp Main Pit Straight to 0.0!
    this.samples = new Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i++) {
      let cSum = 0;
      for (let k = -5; k <= 5; k++) {
        cSum += rawCurv[(i + k + SAMPLES) % SAMPLES];
      }
      let curvature = cSum / 11.0;

      const s = i * dsGame;
      if (s >= 950.0 || s <= 126.0) {
        curvature = 0.0; // Strictly dead-zero along entire Main Pit Straight!
      } else if (s > 934.0 && s < 950.0) {
        curvature *= 1.0 - quinticBlend((s - 934.0) / 16.0);
      } else if (s > 126.0 && s < 142.0) {
        curvature *= quinticBlend((s - 126.0) / 16.0);
      }

      if (Math.abs(curvature) < 0.015) curvature = 0.0;

      let pitOffset = null;
      if (s >= 905 || s <= 122) {
        if (s >= 905 && s < 946) {
          const u = (s - 905) / (946 - 905);
          pitOffset = ROAD_HALF_WIDTH * 0.55 + (PIT_LANE_CONFIG.lateralOffset - ROAD_HALF_WIDTH * 0.55) * quinticBlend(u);
        } else if (s >= 946 || s <= 68) {
          pitOffset = PIT_LANE_CONFIG.lateralOffset;
        } else if (s > 68 && s <= 122) {
          const u = (s - 68) / (122 - 68);
          pitOffset = PIT_LANE_CONFIG.lateralOffset + (ROAD_HALF_WIDTH * 0.55 - PIT_LANE_CONFIG.lateralOffset) * quinticBlend(u);
        }
      }

      this.samples[i] = {
        s,
        pos: pts[i],
        tangent: tangents[i],
        right: rights[i],
        normal: normals[i],
        curvature,
        sector: this.getSector(s),
        pitOffset,
      };
    }
  }

  // Minimum horizontal clearance from any road/pit/grandstand corridor
  _minDistToTrack(worldX, worldZ) {
    // Also protect Main Straight Pit Building (+Z) and Grandstand (-Z) architectural footprint
    if (worldX >= -220 && worldX <= 545 && worldZ >= -46 && worldZ <= 46) {
      return 0;
    }
    let minD2 = Infinity;
    for (let i = 0; i < SAMPLES; i += 8) {
      const p = this.samples[i].pos;
      const dx = worldX - p.x;
      const dz = worldZ - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD2) minD2 = d2;
    }
    return Math.sqrt(minD2);
  }

  sampleAt(s, lateralOffsetM = 0) {
    const sw = wrapS(s);
    const fIdx = (sw / TRACK_GAME_LENGTH) * SAMPLES;
    const i0 = ((Math.floor(fIdx) % SAMPLES) + SAMPLES) % SAMPLES;
    const i1 = (i0 + 1) % SAMPLES;
    const frac = fIdx - Math.floor(fIdx);

    const a = this.samples[i0];
    const b = this.samples[i1];

    const pos = new THREE.Vector3().lerpVectors(a.pos, b.pos, frac);
    const tangent = new THREE.Vector3().lerpVectors(a.tangent, b.tangent, frac).normalize();
    const right = new THREE.Vector3().lerpVectors(a.right, b.right, frac).normalize();
    const normal = new THREE.Vector3().lerpVectors(a.normal, b.normal, frac).normalize();
    const curvature = a.curvature + (b.curvature - a.curvature) * frac;

    if (lateralOffsetM !== 0) {
      pos.addScaledVector(right, lateralOffsetM);
    }

    const headingYaw = Math.atan2(tangent.x, tangent.z);
    return {
      s: sw,
      pos,
      tangent,
      right,
      normal,
      curvature,
      headingYaw,
      sector: a.sector,
      pitOffset: a.pitOffset !== null && b.pitOffset !== null
        ? a.pitOffset + (b.pitOffset - a.pitOffset) * frac
        : a.pitOffset,
    };
  }

  // --------------------------------------------------------------------------
  // 2. HIGH-RESOLUTION 1024x1024 PROCEDURAL PBR TEXTURES, ROUGHNESS & BUMP MAPS
  // --------------------------------------------------------------------------
  _createRichMaterials() {
    const isVegas = this.trackDef.theme === 'VEGAS';
    const isMonaco = this.trackDef.theme === 'MONACO';

    // A. Fast Per-Pixel 1024x1024 Asphalt Diffuse + 512x512 Bump & Roughness Maps
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 1024;
    const ctx = c.getContext('2d');

    const img = ctx.createImageData(1024, 1024);
    const data = img.data;

    const bumpC = document.createElement('canvas');
    bumpC.width = 512;
    bumpC.height = 512;
    const bctx = bumpC.getContext('2d');
    const bImg = bctx.createImageData(512, 512);
    const bData = bImg.data;

    const roughC = document.createElement('canvas');
    roughC.width = 512;
    roughC.height = 512;
    const rghCtx = roughC.getContext('2d');
    const rghImg = rghCtx.createImageData(512, 512);
    const rghData = rghImg.data;

    const baseR = isVegas ? 25 : (isMonaco ? 40 : 35);
    const baseG = isVegas ? 29 : (isMonaco ? 45 : 40);
    const baseB = isVegas ? 40 : (isMonaco ? 54 : 48);

    // Precompute across-track rubbered-in racing groove & off-line marble profile
    const grooveFactorX = new Float32Array(1024);
    for (let x = 0; x < 1024; x++) {
      const u = x / 1023;
      // Dual racing line rubbering bands centered around u = 0.27 and u = 0.73 + center blend
      const leftGroove = Math.exp(-((u - 0.27) * (u - 0.27)) / 0.016);
      const rightGroove = Math.exp(-((u - 0.73) * (u - 0.73)) / 0.016);
      const midGroove = Math.exp(-((u - 0.50) * (u - 0.50)) / 0.032) * 0.45;
      grooveFactorX[x] = Math.min(1.0, Math.max(leftGroove, rightGroove) * 0.92 + midGroove);
    }

    for (let y = 0; y < 1024; y++) {
      const streak = (fastHash2D(0, y >> 3, 19) - 0.5) * 6.0;
      for (let x = 0; x < 1024; x++) {
        const g = grooveFactorX[x];
        const grainFine = fastHash2D(x, y, 7);
        const grainCoarse = fastHash2D(x >> 1, y >> 1, 31);
        const sparkle = grainFine > 0.965 ? 16 : 0;

        const delta = (grainFine - 0.5) * 20.0 + (grainCoarse - 0.5) * 14.0 + streak * g + sparkle;
        const rubberDarken = g * 11.5;

        const idx = (y * 1024 + x) * 4;
        data[idx]     = Math.max(10, Math.min(255, Math.round(baseR + delta - rubberDarken)));
        data[idx + 1] = Math.max(12, Math.min(255, Math.round(baseG + delta - rubberDarken)));
        data[idx + 2] = Math.max(16, Math.min(255, Math.round(baseB + delta - rubberDarken * 0.92)));
        data[idx + 3] = 255;

        if ((x & 1) === 0 && (y & 1) === 0) {
          const bIdx = ((y >> 1) * 512 + (x >> 1)) * 4;
          const bVal = Math.max(0, Math.min(255, Math.round(128 + (grainFine - 0.5) * 115 + (grainCoarse - 0.5) * 65)));
          bData[bIdx] = bVal;
          bData[bIdx + 1] = bVal;
          bData[bIdx + 2] = bVal;
          bData[bIdx + 3] = 255;

          // Rubbered-in groove has lower roughness (satin tire sheen) than coarse aggregate shoulder!
          const rghVal = Math.max(70, Math.min(248, Math.round(228 - g * 74 + (grainCoarse - 0.5) * 26)));
          rghData[bIdx] = rghVal;
          rghData[bIdx + 1] = rghVal;
          rghData[bIdx + 2] = rghVal;
          rghData[bIdx + 3] = 255;
        }
      }
    }

    ctx.putImageData(img, 0, 0);
    bctx.putImageData(bImg, 0, 0);
    rghCtx.putImageData(rghImg, 0, 0);

    // Subtle longitudinal paver joints & rubber tire streaks
    ctx.fillStyle = 'rgba(8, 10, 15, 0.28)';
    ctx.fillRect(341, 0, 3, 1024);
    ctx.fillRect(682, 0, 3, 1024);

    for (let i = 0; i < 48; i++) {
      const sx = (i % 2 === 0 ? 225 : 705) + (fastHash2D(i, 3, 99) - 0.5) * 130;
      const sy = fastHash2D(i, 9, 99) * 900;
      ctx.fillStyle = 'rgba(8, 10, 14, 0.16)';
      ctx.fillRect(sx, sy, 3.5, 90 + fastHash2D(i, 15, 99) * 120);
    }

    // Crisp painted FIA white track-edge boundary lines + subtle inner contrast trim
    ctx.fillStyle = 'rgba(10, 12, 18, 0.35)';
    ctx.fillRect(18, 0, 28, 1024);
    ctx.fillRect(978, 0, 28, 1024);

    ctx.fillStyle = '#f5f8ff';
    ctx.fillRect(22, 0, 20, 1024);
    ctx.fillRect(982, 0, 20, 1024);

    // Subtle center speed reference dashes
    ctx.fillStyle = isVegas ? 'rgba(0, 240, 255, 0.42)' : 'rgba(245, 248, 255, 0.24)';
    for (let y = 0; y < 1024; y += 128) {
      ctx.fillRect(508, y, 8, 48);
    }

    const roadTex = new THREE.CanvasTexture(c);
    roadTex.wrapS = THREE.RepeatWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(1, 145);
    roadTex.anisotropy = 8;
    roadTex.colorSpace = THREE.SRGBColorSpace;

    const bumpTex = new THREE.CanvasTexture(bumpC);
    bumpTex.wrapS = THREE.RepeatWrapping;
    bumpTex.wrapT = THREE.RepeatWrapping;
    bumpTex.repeat.set(2, 290);

    const roughTex = new THREE.CanvasTexture(roughC);
    roughTex.wrapS = THREE.RepeatWrapping;
    roughTex.wrapT = THREE.RepeatWrapping;
    roughTex.repeat.set(1, 145);

    this.asphaltMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      bumpMap: bumpTex,
      bumpScale: 0.032,
      roughnessMap: roughTex,
      roughness: 0.72,
      metalness: 0.14,
    });

    this.pitAsphaltMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      bumpMap: bumpTex,
      bumpScale: 0.025,
      color: isVegas ? 0x7694c4 : 0x93a9cc,
      roughness: 0.60,
      metalness: 0.16,
    });

    // B. Mowed Two-Tone Stadium Turf / Riviera Stone / Vegas Midnight Ground (512x512)
    const gc = document.createElement('canvas');
    gc.width = 512;
    gc.height = 512;
    const gctx = gc.getContext('2d');
    const [gCol1, gCol2] = this.trackDef.grassColors;
    gctx.fillStyle = gCol1;
    gctx.fillRect(0, 0, 512, 512);
    gctx.fillStyle = gCol2;
    for (let y = 0; y < 512; y += 64) {
      gctx.fillRect(0, y, 512, 32);
    }

    if (isMonaco) {
      // Crisp Riviera travertine/granite paver grid lines
      gctx.strokeStyle = 'rgba(255,255,255,0.06)';
      gctx.lineWidth = 2;
      for (let k = 0; k < 512; k += 32) {
        gctx.beginPath(); gctx.moveTo(k, 0); gctx.lineTo(k, 512); gctx.stroke();
        gctx.beginPath(); gctx.moveTo(0, k); gctx.lineTo(512, k); gctx.stroke();
      }
    } else if (this.trackDef.theme === 'MONZA' || this.trackDef.theme === 'SUZUKA') {
      // Subtle golden/crimson fallen autumn leaf speckles on Monza & Suzuka turf
      const leafPalette = ['rgba(234,179,8,0.28)', 'rgba(217,119,6,0.26)', 'rgba(220,38,38,0.24)'];
      for (let i = 0; i < 950; i++) {
        gctx.fillStyle = leafPalette[i % 3];
        gctx.fillRect(fastHash2D(i, 1, 55) * 510, fastHash2D(i, 2, 55) * 510, 3, 2);
      }
    }

    for (let i = 0; i < 4500; i++) {
      gctx.fillStyle = (i & 1) === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
      gctx.fillRect(fastHash2D(i, 4, 71) * 510, fastHash2D(i, 5, 71) * 510, 3, 3);
    }

    const grassTex = new THREE.CanvasTexture(gc);
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(115, 115);
    grassTex.anisotropy = 4;
    grassTex.colorSpace = THREE.SRGBColorSpace;

    this.grassMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      roughness: isMonaco ? 0.76 : 0.88,
      metalness: isMonaco ? 0.08 : 0.02,
    });

    // C. raked FIA Gravel Trap / Paved Runoff Apron Texture (256x256)
    const rc = document.createElement('canvas');
    rc.width = 256;
    rc.height = 256;
    const rctx = rc.getContext('2d');
    rctx.fillStyle = this.trackDef.runoffColor;
    rctx.fillRect(0, 0, 256, 256);

    // Raked FIA gravel furrows / street runoff grip lines
    if (this.trackDef.theme === 'SILVERSTONE') {
      rctx.fillStyle = 'rgba(0, 56, 168, 0.24)';
      for (let y = 0; y < 256; y += 32) {
        rctx.fillRect(0, y, 256, 10);
      }
      rctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      rctx.fillRect(14, 0, 10, 256);
    } else {
      rctx.fillStyle = isVegas ? 'rgba(0, 240, 255, 0.08)' : 'rgba(0, 0, 0, 0.065)';
      for (let x = 0; x < 256; x += 16) {
        rctx.fillRect(x, 0, 5, 256);
      }
    }
    for (let i = 0; i < 3200; i++) {
      rctx.fillStyle = (i & 1) === 0 ? 'rgba(255,255,255,0.085)' : 'rgba(0,0,0,0.095)';
      rctx.fillRect(fastHash2D(i, 7, 83) * 254, fastHash2D(i, 8, 83) * 254, 2, 2);
    }

    const runoffTex = new THREE.CanvasTexture(rc);
    runoffTex.wrapS = THREE.RepeatWrapping;
    runoffTex.wrapT = THREE.RepeatWrapping;
    runoffTex.repeat.set(2, 165);
    runoffTex.colorSpace = THREE.SRGBColorSpace;

    this.runoffMat = new THREE.MeshStandardMaterial({
      map: runoffTex,
      roughness: isVegas ? 0.68 : 0.90,
      metalness: isVegas ? 0.12 : 0.03,
    });

    // D. Serrated 3D Kerb Materials & Corrugated Steel Armco Material
    this.curbMats = this.trackDef.curbColors.map(
      (hex) => new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.36,
        metalness: 0.10,
        emissive: isVegas ? new THREE.Color(hex) : new THREE.Color(hex),
        emissiveIntensity: isVegas ? 0.48 : 0.05,
      })
    );

    // Corrugated W-beam Armco texture
    const ac = document.createElement('canvas');
    ac.width = 128;
    ac.height = 128;
    const actx = ac.getContext('2d');
    const aGrad = actx.createLinearGradient(0, 0, 0, 128);
    aGrad.addColorStop(0.00, '#eef3fa');
    aGrad.addColorStop(0.22, '#aab5c6');
    aGrad.addColorStop(0.42, '#f5f8fd');
    aGrad.addColorStop(0.55, '#7e8a9c');
    aGrad.addColorStop(0.76, '#eef3fa');
    aGrad.addColorStop(1.00, '#96a3b5');
    actx.fillStyle = aGrad;
    actx.fillRect(0, 0, 128, 128);
    if (isVegas) {
      actx.fillStyle = '#00f0ff';
      actx.fillRect(0, 8, 128, 8);
    }
    const armcoTex = new THREE.CanvasTexture(ac);
    armcoTex.colorSpace = THREE.SRGBColorSpace;

    this.armcoMat = new THREE.MeshStandardMaterial({
      map: armcoTex,
      metalness: 0.78,
      roughness: 0.26,
    });

    this.concreteMat = new THREE.MeshStandardMaterial({
      color: 0xc2ccd9,
      roughness: 0.68,
      metalness: 0.08,
    });

    this.darkFrameMat = new THREE.MeshStandardMaterial({
      color: 0x1a202c,
      metalness: 0.72,
      roughness: 0.28,
    });
  }

  updateVisualState(moistureW, visualStyle, elapsedSec = 0) {
    const isArcade = visualStyle === '1982_ARCADE';
    if (isArcade) {
      this.asphaltMat.roughness = moistureW > 0.15 ? 0.22 : 0.85;
      this.asphaltMat.metalness = moistureW > 0.15 ? 0.42 : 0.05;
    } else {
      const wetFactor = Math.max(0, Math.min(1, moistureW / 0.75));
      this.asphaltMat.roughness = 0.72 - wetFactor * 0.58;
      this.asphaltMat.metalness = 0.14 + wetFactor * 0.52;
      if (this.pitAsphaltMat) {
        this.pitAsphaltMat.roughness = 0.62 - wetFactor * 0.46;
        this.pitAsphaltMat.metalness = 0.16 + wetFactor * 0.44;
      }
    }

    for (const p of this.puddles) {
      p.mesh.visible = p.forceActive1982 || moistureW > 0.22;
    }

    for (const anim of this.animatedProps) {
      anim(elapsedSec);
    }
  }

  // --------------------------------------------------------------------------
  // 3. ROAD RIBBON + GRAVEL / URBAN RUNOFF APRON
  // --------------------------------------------------------------------------
  _buildRoadAndRunoff() {
    const groundGeo = new THREE.PlaneGeometry(9200, 9200);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, this.grassMat);
    ground.position.y = -0.38;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Continuous Runoff Shoulder Ribbon + Main PBR Asphalt Ribbon
    this._buildRibbonMesh(ROAD_HALF_WIDTH + 6.4, -0.02, this.runoffMat);
    this._buildRibbonMesh(ROAD_HALF_WIDTH, 0.028, this.asphaltMat);
  }

  _buildRibbonMesh(halfW, yLift, material) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= SAMPLES; i++) {
      const smp = this.samples[i % SAMPLES];
      const vCoord = i / SAMPLES;
      const lPt = smp.pos.clone().addScaledVector(smp.right, -halfW);
      const rPt = smp.pos.clone().addScaledVector(smp.right, halfW);
      lPt.y += yLift;
      rPt.y += yLift;

      positions.push(lPt.x, lPt.y, lPt.z, rPt.x, rPt.y, rPt.z);
      normals.push(smp.normal.x, smp.normal.y, smp.normal.z, smp.normal.x, smp.normal.y, smp.normal.z);
      uvs.push(0, vCoord, 1, vCoord);

      if (i < SAMPLES) {
        const b = i * 2;
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const ribbonMesh = new THREE.Mesh(geo, material);
    ribbonMesh.receiveShadow = true;
    this.group.add(ribbonMesh);
  }

  // --------------------------------------------------------------------------
  // 4. SERRATED 3D RUMBLE KERBS, STEEL ARMCO + POSTS & FIA TIRE BARRIERS
  // --------------------------------------------------------------------------
  _buildCurbsAndArmcoBarriers() {
    const curbBlockGeo = new THREE.BoxGeometry(2.38, 0.11, CURB_WIDTH);
    const matBuckets = this.curbMats.map(() => []);
    const armcoMatrices = [];
    const armcoPostMatrices = [];
    const tireRedMatrices = [];
    const tireWhiteMatrices = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < SAMPLES; i++) {
      const smp = this.samples[i];
      const yaw = Math.atan2(smp.tangent.z, smp.tangent.x);
      const absK = Math.abs(smp.curvature);

      // Serrated FIA rumble kerbs on all corners & braking approaches
      if (absK > 0.055) {
        for (const side of [-1, 1]) {
          if (side > 0 && (smp.s >= 902 || smp.s <= 122)) continue;
          dummy.position
            .copy(smp.pos)
            .addScaledVector(smp.right, side * (ROAD_HALF_WIDTH + CURB_WIDTH * 0.45));
          dummy.position.y += 0.036;
          dummy.rotation.set(side * 0.035, -yaw, 0);
          dummy.updateMatrix();
          matBuckets[i % matBuckets.length].push(dummy.matrix.clone());
        }
      }

      // Continuous Double-Wave Steel Armco Guardrails + Steel Support Posts
      if (i % 2 === 0) {
        for (const side of [-1, 1]) {
          if (side > 0 && (smp.s >= 902 || smp.s <= 124)) continue;
          const barrierDist = ROAD_HALF_WIDTH + 5.85;
          dummy.position.copy(smp.pos).addScaledVector(smp.right, side * barrierDist);
          dummy.position.y += 0.52;
          dummy.rotation.set(0, -yaw, 0);
          dummy.updateMatrix();
          armcoMatrices.push(dummy.matrix.clone());

          // Grounded steel I-beam support post behind Armco
          dummy.position.copy(smp.pos).addScaledVector(smp.right, side * (barrierDist + 0.18));
          dummy.position.y += 0.50;
          dummy.updateMatrix();
          armcoPostMatrices.push(dummy.matrix.clone());

          // Double-stacked Red/White FIA Tire Barrier bundles on high-speed corner outsides
          const outsideSign = -Math.sign(smp.curvature);
          if (absK > 0.28 && side === outsideSign) {
            dummy.position.copy(smp.pos).addScaledVector(smp.right, side * (barrierDist - 0.88));
            dummy.position.y += 0.46;
            dummy.updateMatrix();
            if ((i / 2) % 2 === 0) tireRedMatrices.push(dummy.matrix.clone());
            else tireWhiteMatrices.push(dummy.matrix.clone());
          }
        }
      }
    }

    matBuckets.forEach((list, idx) => {
      if (!list.length) return;
      const inst = new THREE.InstancedMesh(curbBlockGeo, this.curbMats[idx], list.length);
      list.forEach((m, k) => inst.setMatrixAt(k, m));
      inst.instanceMatrix.needsUpdate = true;
      inst.receiveShadow = true;
      this.group.add(inst);
    });

    const armcoGeo = new THREE.BoxGeometry(4.5, 0.94, 0.22);
    const armcoInst = new THREE.InstancedMesh(armcoGeo, this.armcoMat, armcoMatrices.length);
    armcoMatrices.forEach((m, k) => armcoInst.setMatrixAt(k, m));
    armcoInst.instanceMatrix.needsUpdate = true;
    armcoInst.castShadow = true;
    armcoInst.receiveShadow = true;
    this.group.add(armcoInst);

    const postGeo = new THREE.BoxGeometry(0.18, 1.08, 0.18);
    const postInst = new THREE.InstancedMesh(postGeo, this.darkFrameMat, armcoPostMatrices.length);
    armcoPostMatrices.forEach((m, k) => postInst.setMatrixAt(k, m));
    postInst.instanceMatrix.needsUpdate = true;
    this.group.add(postInst);

    const tireGeo = new THREE.CylinderGeometry(0.56, 0.56, 0.96, 14);
    if (tireRedMatrices.length > 0) {
      const redTireInst = new THREE.InstancedMesh(
        tireGeo,
        new THREE.MeshStandardMaterial({ color: 0xd91e26, roughness: 0.65 }),
        tireRedMatrices.length
      );
      tireRedMatrices.forEach((m, k) => redTireInst.setMatrixAt(k, m));
      redTireInst.instanceMatrix.needsUpdate = true;
      this.group.add(redTireInst);
    }
    if (tireWhiteMatrices.length > 0) {
      const whiteTireInst = new THREE.InstancedMesh(
        tireGeo,
        new THREE.MeshStandardMaterial({ color: 0xf4f7fc, roughness: 0.65 }),
        tireWhiteMatrices.length
      );
      tireWhiteMatrices.forEach((m, k) => whiteTireInst.setMatrixAt(k, m));
      whiteTireInst.instanceMatrix.needsUpdate = true;
      this.group.add(whiteTireInst);
    }
  }

  // --------------------------------------------------------------------------
  // 5. ILLUMINATED OPEN-BAY F1 PIT GARAGES, PIT WALL CANOPY & TEAM BOXES
  // --------------------------------------------------------------------------
  _buildPitLaneAndGarages() {
    const pitIndices = [];
    for (let i = 0; i < SAMPLES; i++) if (this.samples[i].s >= 905) pitIndices.push(i);
    for (let i = 0; i < SAMPLES; i++) if (this.samples[i].s <= 122) pitIndices.push(i);

    const pitHalfWidth = 4.8;
    const posArr = [], normArr = [], uvArr = [], idxArr = [];
    for (let k = 0; k < pitIndices.length; k++) {
      const smp = this.samples[pitIndices[k]];
      const center = smp.pos.clone().addScaledVector(smp.right, smp.pitOffset);
      const lPt = center.clone().addScaledVector(smp.right, -pitHalfWidth);
      const rPt = center.clone().addScaledVector(smp.right, pitHalfWidth + 4.8);
      lPt.y += 0.020;
      rPt.y += 0.020;
      posArr.push(lPt.x, lPt.y, lPt.z, rPt.x, rPt.y, rPt.z);
      normArr.push(0, 1, 0, 0, 1, 0);
      uvArr.push(0, k * 0.08, 1, k * 0.08);
      if (k < pitIndices.length - 1) {
        const b = k * 2;
        idxArr.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const pitGeo = new THREE.BufferGeometry();
    pitGeo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    pitGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normArr, 3));
    pitGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
    pitGeo.setIndex(idxArr);
    const pitRoadMesh = new THREE.Mesh(pitGeo, this.pitAsphaltMat);
    pitRoadMesh.receiveShadow = true;
    this.group.add(pitRoadMesh);

    // Concrete Pit Wall + FIA Blue Accent Stripe + Pit Wall Engineer Telemetry Canopy
    const wallStart = this.sampleAt(954, ROAD_HALF_WIDTH + 1.8).pos;
    const wallEnd = this.sampleAt(68, ROAD_HALF_WIDTH + 1.8).pos;
    const wallLen = Math.max(120, wallEnd.x - wallStart.x);
    const wallCenterX = (wallStart.x + wallEnd.x) * 0.5;
    const wallZ = wallStart.z;

    const pitWall = new THREE.Mesh(new THREE.BoxGeometry(wallLen, 1.18, 0.48), this.concreteMat);
    pitWall.position.set(wallCenterX, 0.59, wallZ);
    pitWall.castShadow = true;
    pitWall.receiveShadow = true;
    this.group.add(pitWall);

    const wallStripe = new THREE.Mesh(
      new THREE.BoxGeometry(wallLen + 0.1, 0.24, 0.52),
      new THREE.MeshStandardMaterial({
        color: this.trackDef.theme === 'VEGAS' ? 0x00f0ff : 0x0e58c8,
        emissive: this.trackDef.theme === 'VEGAS' ? 0x00f0ff : 0x062963,
        emissiveIntensity: this.trackDef.theme === 'VEGAS' ? 0.45 : 0.2,
        roughness: 0.3,
      })
    );
    wallStripe.position.set(wallCenterX, 1.08, wallZ);
    this.group.add(wallStripe);

    // Architectural F1 Pit-Wall Team Telemetry Perch (replaces plain untextured box!)
    const perchGroup = new THREE.Group();
    perchGroup.position.set(wallCenterX + 8, 1.18, wallZ);
    const screenTex = this._makeMotorsportBanner(
      'RACE CONTROL • LIVE TELEMETRY',
      'FIA TIMING • SECTOR DELTA • WEATHER RADAR',
      '#081d38',
      '#041022',
      '#00f0ff',
      '#ff2468',
      'F1',
      512,
      128
    );
    const screenMat = new THREE.MeshStandardMaterial({
      map: screenTex,
      emissive: new THREE.Color(0x88e5ff),
      emissiveMap: screenTex,
      emissiveIntensity: 0.55,
      roughness: 0.2,
    });
    const perchRoof = new THREE.Mesh(
      new THREE.BoxGeometry(26, 0.28, 2.3),
      new THREE.MeshStandardMaterial({ color: 0xe8eef6, metalness: 0.45, roughness: 0.25 })
    );
    perchRoof.position.set(0, 2.55, 0.15);
    perchGroup.add(perchRoof);

    const screenBank = new THREE.Mesh(
      new THREE.BoxGeometry(24, 1.15, 0.36),
      [this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, screenMat, screenMat]
    );
    screenBank.position.set(0, 1.55, 0.1);
    perchGroup.add(screenBank);

    for (const px of [-11.5, -3.8, 3.8, 11.5]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.55, 8), this.darkFrameMat);
      strut.position.set(px, 1.28, -0.35);
      perchGroup.add(strut);
    }
    this.group.add(perchGroup);

    // 2-Story Architectural F1 Paddock Club & 3D Open-Bay Illuminated Garages
    const garX = wallCenterX + 18;
    const garZ = PIT_LANE_CONFIG.lateralOffset + 14.5;
    const isVegas = this.trackDef.theme === 'VEGAS';

    const claddingMat = new THREE.MeshStandardMaterial({
      color: isVegas ? 0xd8e4f8 : 0xedf2f9,
      roughness: 0.32,
      metalness: 0.28,
      emissive: new THREE.Color(isVegas ? 0x1a2845 : 0x161c26),
      emissiveIntensity: 0.22,
    });

    // Upper Paddock Club VIP Volume + Cantilevered Louvered Roof Canopy
    const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(342, 4.8, 14.4), claddingMat);
    upperDeck.position.set(garX, 7.6, garZ);
    upperDeck.castShadow = true;
    upperDeck.receiveShadow = true;
    this.group.add(upperDeck);

    const roofOverhang = new THREE.Mesh(
      new THREE.BoxGeometry(348, 0.65, 17.6),
      new THREE.MeshStandardMaterial({ color: 0xf7faff, metalness: 0.35, roughness: 0.24 })
    );
    roofOverhang.position.set(garX, 10.25, garZ - 0.8);
    this.group.add(roofOverhang);

    // Paddock Club VIP Glass Curtain Wall Texture (front & rear so never blank from any orbit!)
    const clubTex = this._makePaddockGlassTexture(isVegas);
    const clubGlassMat = new THREE.MeshStandardMaterial({
      map: clubTex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: clubTex,
      emissiveIntensity: isVegas ? 0.85 : 0.48,
      roughness: 0.12,
      metalness: 0.78,
    });
    const clubGlass = new THREE.Mesh(
      new THREE.BoxGeometry(338, 3.1, 14.65),
      [this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, clubGlassMat, clubGlassMat]
    );
    clubGlass.position.set(garX, 7.55, garZ);
    this.group.add(clubGlass);

    // Rooftop Championship Signboard facing the Main Straight & Showroom Camera!
    const roofBannerTex = this._makeMotorsportBanner(
      'F1 PADDOCK CLUB',
      `${this.trackDef.name} • WORLD CHAMPIONSHIP GARAGES`,
      '#0b1d3a',
      '#133463',
      '#ffffff',
      isVegas ? '#00f0ff' : '#e41c24',
      'GP',
      1024,
      160
    );
    const roofBannerMat = new THREE.MeshStandardMaterial({
      map: roofBannerTex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: roofBannerTex,
      emissiveIntensity: isVegas ? 0.52 : 0.24,
      roughness: 0.28,
    });
    const roofSign = new THREE.Mesh(
      new THREE.BoxGeometry(118, 2.2, 0.55),
      [this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, roofBannerMat, roofBannerMat]
    );
    roofSign.position.set(garX - 35, 11.65, garZ - 7.1);
    this.group.add(roofSign);

    // Continuous Ground-Floor Recessed Back Wall + Checkered Garage Epoxy Floor (enclosed 3D bays!)
    const garageIntTex = this._makeGarageInteriorTexture();
    const garageIntMat = new THREE.MeshStandardMaterial({
      map: garageIntTex,
      emissive: new THREE.Color(0xfff4dc),
      emissiveMap: garageIntTex,
      emissiveIntensity: 0.78,
      roughness: 0.4,
    });
    const backStructure = new THREE.Mesh(
      new THREE.BoxGeometry(340, 5.2, 2.2),
      [claddingMat, claddingMat, claddingMat, claddingMat, claddingMat, garageIntMat]
    );
    backStructure.position.set(garX, 2.6, garZ + 5.6);
    this.group.add(backStructure);

    const garageFloorTex = this._makeCheckeredFloorTexture();
    const garageFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(340, 13.6),
      new THREE.MeshStandardMaterial({ map: garageFloorTex, roughness: 0.35, metalness: 0.15 })
    );
    garageFloor.rotation.x = -Math.PI / 2;
    garageFloor.position.set(garX, 0.032, garZ - 0.2);
    this.group.add(garageFloor);

    // Individual Open Garage Bays with Glowing Ceiling Light Panels & Team Livery Headers
    const teamDefs = [
      { name: 'PHANATIC RACING #1', bg: '#d91424', stripe: '#ffd600' },
      { name: 'TAKAHASHI MOTORSPORT', bg: '#103468', stripe: '#00f0ff' },
      { name: 'SCUDERIA VELOCE', bg: '#b80d18', stripe: '#ffffff' },
      { name: 'GULF HERITAGE GP', bg: '#1e6eb8', stripe: '#ff671f' },
      { name: 'APEX HYBRID F1', bg: '#0c4f30', stripe: '#ffd600' },
      { name: 'ATARI FACTORY TEAM', bg: '#2c1654', stripe: '#ff9e1b' },
    ];
    const teamHeaderMats = teamDefs.map((td) => {
      const t = this._makeMotorsportBanner(td.name, 'OFFICIAL PIT GARAGE', td.bg, '#0b101a', '#ffffff', td.stripe, 'F1', 512, 96);
      return new THREE.MeshStandardMaterial({
        map: t,
        emissive: new THREE.Color(0xffffff),
        emissiveMap: t,
        emissiveIntensity: 0.32,
        roughness: 0.3,
      });
    });

    const ceilingPanelMat = new THREE.MeshBasicMaterial({ color: 0xfff8e8 });
    let bayIdx = 0;
    for (let bx = garX - 150; bx <= garX + 150; bx += 25) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.1, 5.2, 13.8), claddingMat);
      pillar.position.set(bx, 2.6, garZ);
      pillar.castShadow = true;
      this.group.add(pillar);

      if (bx < garX + 150) {
        // Illuminated LED ceiling light strip inside open bay
        const lightPanel = new THREE.Mesh(new THREE.PlaneGeometry(18.5, 4.2), ceilingPanelMat);
        lightPanel.rotation.x = Math.PI / 2;
        lightPanel.position.set(bx + 12.5, 5.05, garZ - 1.5);
        this.group.add(lightPanel);

        // Framed Team Livery Header Fascia above open bay
        const hMat = teamHeaderMats[bayIdx % teamHeaderMats.length];
        const hdr = new THREE.Mesh(
          new THREE.BoxGeometry(22.9, 1.05, 0.55),
          [this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, hMat]
        );
        hdr.position.set(bx + 12.5, 4.72, garZ - 6.95);
        this.group.add(hdr);
        bayIdx++;
      }
    }

    // 80 KM/H Pit Speed Limit Line + Grounded FIA 80 Limit Signpost
    const limFrame = this.sampleAt(PIT_LANE_CONFIG.speedLimitLineS, 0);
    const limPos = limFrame.pos.clone().addScaledVector(limFrame.right, limFrame.pitOffset || 13.0);
    const limLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.04, 9.6),
      new THREE.MeshBasicMaterial({ color: 0xffd600 })
    );
    limLine.position.copy(limPos).add(new THREE.Vector3(0, 0.032, 0));
    this.group.add(limLine);

    const limSignTex = this._makeMotorsportBanner('80', 'PIT LIMIT', '#ffffff', '#e6ecf5', '#111111', '#e51c23', '80', 256, 256);
    const limSignMat = new THREE.MeshStandardMaterial({
      map: limSignTex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: limSignTex,
      emissiveIntensity: 0.28,
      roughness: 0.3,
    });
    const limPostPos = this.sampleAt(PIT_LANE_CONFIG.speedLimitLineS, ROAD_HALF_WIDTH + 2.2).pos;
    const limPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.5, 8), this.darkFrameMat);
    limPost.position.copy(limPostPos).add(new THREE.Vector3(0, 1.25, 0));
    const limBoard = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 1.15, 1.15),
      [limSignMat, limSignMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat]
    );
    limBoard.position.copy(limPostPos).add(new THREE.Vector3(0, 2.35, 0));
    this.group.add(limPost, limBoard);

    // 8 Painted Pit Boxes (Player Box at s = 20m)
    this.pitBoxes = [];
    const boxStations = [978, 990, 4, PIT_LANE_CONFIG.playerBoxS, 32, 44, 54, 62];
    boxStations.forEach((bs) => {
      const isPlayerBox = bs === PIT_LANE_CONFIG.playerBoxS;
      const bf = this.sampleAt(bs, PIT_LANE_CONFIG.lateralOffset + 3.2);
      const boxPad = new THREE.Mesh(
        new THREE.PlaneGeometry(7.6, 3.6),
        new THREE.MeshBasicMaterial({
          color: isPlayerBox ? 0x00ff88 : 0xffab00,
          transparent: true,
          opacity: isPlayerBox ? 0.72 : 0.36,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        })
      );
      boxPad.rotation.x = -Math.PI / 2;
      boxPad.position.copy(bf.pos).add(new THREE.Vector3(0, 0.029, 0));
      this.group.add(boxPad);

      if (isPlayerBox) {
        const signTex = this._makeMotorsportBanner('PIT BOX #1', 'STOP IN GREEN ZONE', '#00c853', '#053b1c', '#ffffff', '#ffd600', 'P1', 512, 192);
        const signMat = new THREE.MeshStandardMaterial({
          map: signTex,
          emissive: new THREE.Color(0xffffff),
          emissiveMap: signTex,
          emissiveIntensity: 0.45,
          roughness: 0.25,
        });
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 4.4, 10), this.darkFrameMat);
        mast.position.copy(bf.pos).add(new THREE.Vector3(0, 2.2, 2.55));
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 2.4), this.darkFrameMat);
        arm.position.copy(bf.pos).add(new THREE.Vector3(0, 4.25, 1.45));
        const beacon = new THREE.Mesh(
          new THREE.BoxGeometry(0.26, 1.45, 4.6),
          [signMat, signMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat]
        );
        beacon.position.copy(bf.pos).add(new THREE.Vector3(0, 4.15, 0.5));
        this.group.add(mast, arm, beacon);
      }
      this.pitBoxes.push({ s: bs, isPlayerBox, pos: bf.pos.clone() });
    });
  }

  _makePaddockGlassTexture(isNight) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0.0, isNight ? '#0e284d' : '#1b4b7a');
    g.addColorStop(0.55, isNight ? '#ffe39f' : '#8ed6ff');
    g.addColorStop(1.0, isNight ? '#ffb84d' : '#d6f0ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 128);

    // Warm lounge ceiling lights + vertical curtain-wall mullions
    ctx.fillStyle = 'rgba(255, 250, 224, 0.72)';
    for (let x = 12; x < 512; x += 32) {
      ctx.fillRect(x, 16, 18, 10);
    }
    ctx.fillStyle = '#182230';
    for (let x = 0; x < 512; x += 32) {
      ctx.fillRect(x, 0, 4, 128);
    }
    ctx.fillRect(0, 0, 512, 8);
    ctx.fillRect(0, 92, 512, 5);
    ctx.fillRect(0, 120, 512, 8);

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _makeGarageInteriorTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f2ede2';
    ctx.fillRect(0, 0, 512, 128);

    // Upper telemetry screens + red/blue tool chests + tire racks inside garage bays
    for (let bx = 0; bx < 512; bx += 128) {
      ctx.fillStyle = '#dce4ef';
      ctx.fillRect(bx + 6, 8, 116, 112);
      // Red Snap-On style tool cabinet
      ctx.fillStyle = '#d91c24';
      ctx.fillRect(bx + 14, 68, 42, 48);
      ctx.fillStyle = '#cfd8e3';
      for (let ry = 74; ry < 112; ry += 9) ctx.fillRect(bx + 18, ry, 34, 3);
      // Telemetry monitor wall
      ctx.fillStyle = '#0d1b2e';
      ctx.fillRect(bx + 64, 24, 46, 28);
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(bx + 68, 28, 38, 6);
      ctx.fillStyle = '#00e676';
      ctx.fillRect(bx + 68, 38, 26, 8);
      // Tire rack
      ctx.fillStyle = '#1c2026';
      for (let tx = 0; tx < 3; tx++) {
        ctx.fillRect(bx + 66 + tx * 15, 72, 12, 40);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _makeCheckeredFloorTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#dde4ee' : '#8a99ad';
        ctx.fillRect(x * 32, y * 32, 32, 32);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(42, 2);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // --------------------------------------------------------------------------
  // 6. OVERHEAD F1 SPACE-FRAME GANTRY, 5 START LIGHTS & FULL FIA GRID STALLS
  // --------------------------------------------------------------------------
  _buildStartGantryAndGridBoxes() {
    const trussMat = new THREE.MeshStandardMaterial({ color: 0xe4eaf4, metalness: 0.78, roughness: 0.22 });
    const spanZ = ROAD_HALF_WIDTH + 4.3;

    // Grounded Concrete Plinths + 4-Chord Lattice Truss Towers on both sides
    for (const side of [-1, 1]) {
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.85, 2.1), this.concreteMat);
      plinth.position.set(0, 0.42, side * spanZ);
      this.group.add(plinth);

      for (const xOff of [-0.68, 0.68]) {
        for (const zSub of [-0.52, 0.52]) {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 9.8, 10), trussMat);
          col.position.set(xOff, 4.9, side * spanZ + zSub);
          col.castShadow = true;
          this.group.add(col);
        }
      }
      // Horizontal tower cross-rungs
      for (let yR = 2.0; yR <= 8.5; yR += 2.1) {
        const rung = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.14, 1.12), trussMat);
        rung.position.set(0, yR, side * spanZ);
        this.group.add(rung);
      }
    }

    // Overhead Space-Frame Chord Beams
    for (const yOff of [7.35, 9.65]) {
      for (const xOff of [-0.55, 0.55]) {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, spanZ * 2.06, 10), trussMat);
        beam.rotation.x = Math.PI / 2;
        beam.position.set(xOff, yOff, 0);
        this.group.add(beam);
      }
    }

    const accentHex = this.trackDef.accentColor || '#e41c24';
    const bannerTex = this._makeMotorsportBanner(
      this.trackDef.name,
      this.trackDef.gantrySub || 'RACE PHANATIC F1 • OFFICIAL GRAND PRIX',
      accentHex,
      '#111827',
      '#ffffff',
      '#ffd600',
      'F1',
      1024,
      192
    );
    const bannerFaceMat = new THREE.MeshStandardMaterial({
      map: bannerTex,
      roughness: 0.25,
      metalness: 0.12,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: bannerTex,
      emissiveIntensity: this.trackDef.theme === 'VEGAS' ? 0.45 : 0.18,
    });
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 2.25, spanZ * 1.94),
      [bannerFaceMat, bannerFaceMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat]
    );
    banner.castShadow = true;
    banner.position.set(0, 8.5, 0);
    this.group.add(banner);

    // Checkered Start/Finish Line (polygonOffset avoids Z-fighting with asphalt & car shadow!)
    const sfCanvas = document.createElement('canvas');
    sfCanvas.width = 512;
    sfCanvas.height = 128;
    const sctx = sfCanvas.getContext('2d');
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 16; c++) {
        sctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#101318';
        sctx.fillRect(c * 32, r * 32, 32, 32);
      }
    }
    const sfTex = new THREE.CanvasTexture(sfCanvas);
    sfTex.anisotropy = 4;
    sfTex.colorSpace = THREE.SRGBColorSpace;
    const sfMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, ROAD_HALF_WIDTH * 1.94),
      new THREE.MeshStandardMaterial({
        map: sfTex,
        roughness: 0.42,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    sfMesh.rotation.x = -Math.PI / 2;
    sfMesh.position.set(0, 0.033, 0);
    sfMesh.receiveShadow = true;
    this.group.add(sfMesh);

    // Full FIA U-Bracket Starting Grid Stalls + Yellow Wheel-Stop Line for all 16 slots!
    const stallMat = new THREE.MeshBasicMaterial({
      color: 0xf4f8ff,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const yellowAlignMat = new THREE.MeshBasicMaterial({
      color: 0xffd600,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    for (let slot = 0; slot < 16; slot++) {
      const sBack = 3.2 + slot * 2.1;
      const lat = slot % 2 === 0 ? -2.8 : 2.8;
      const fr = this.sampleAt(TRACK_GAME_LENGTH - sBack, lat);
      const stallGroup = new THREE.Group();
      stallGroup.position.set(fr.pos.x, 0.032, fr.pos.z);

      // Front transverse white bracket line
      const frontBar = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 2.52), stallMat);
      frontBar.rotation.x = -Math.PI / 2;
      frontBar.position.set(2.48, 0, 0);
      stallGroup.add(frontBar);

      // Left & right longitudinal side wing lines forming the FIA U-box
      for (const zSide of [-1.20, 1.20]) {
        const wingBar = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.16), stallMat);
        wingBar.rotation.x = -Math.PI / 2;
        wingBar.position.set(1.28, 0, zSide);
        stallGroup.add(wingBar);
      }

      // FIA Yellow Front-Axle Registration Strip
      const axStrip = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.85), yellowAlignMat);
      axStrip.rotation.x = -Math.PI / 2;
      axStrip.position.set(1.55, 0, slot % 2 === 0 ? -1.42 : 1.42);
      stallGroup.add(axStrip);

      this.group.add(stallGroup);
    }

    // 5 FIA Twin-Lens Start Light Pods with Sun-Visor Hoods
    this.gantryLights = [];
    const podMat = new THREE.MeshStandardMaterial({ color: 0x10141c, metalness: 0.55, roughness: 0.35 });
    for (let i = 0; i < 5; i++) {
      const zOff = (i - 2) * 1.78;
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.68, 0.96), podMat);
      pod.position.set(-0.72, 6.32, zOff);
      this.group.add(pod);

      // Visor brow hood
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 1.02), podMat);
      visor.position.set(-1.12, 7.10, zOff);
      this.group.add(visor);

      // Shared bulbMat for upper & lower twin lenses so setGantryLights drives both cleanly!
      const bulbMat = new THREE.MeshBasicMaterial({ color: 0x2b0a0a });
      for (const yLens of [6.66, 5.98]) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 14), bulbMat);
        bulb.scale.set(0.55, 1.0, 1.0);
        bulb.position.set(-1.02, yLens, zOff);
        this.group.add(bulb);
      }
      this.gantryLights.push(bulbMat);
    }
  }

  setGantryLights(redCount, greenOn = false, yellowFlash = false) {
    for (let i = 0; i < this.gantryLights.length; i++) {
      if (yellowFlash) this.gantryLights[i].color.setHex(0xffe600);
      else if (greenOn) this.gantryLights[i].color.setHex(0x00ff66);
      else if (i < redCount) this.gantryLights[i].color.setHex(0xff1e28);
      else this.gantryLights[i].color.setHex(0x280909);
    }
  }

  // --------------------------------------------------------------------------
  // 6B. MID-LAP OVERHEAD SPONSOR BRIDGES, CATCH FENCING & SKY ATMOSPHERE
  // --------------------------------------------------------------------------
  _buildMidLapGantriesAndSkyAtmosphere() {
    const trussMat = new THREE.MeshStandardMaterial({ color: 0xd8e1ee, metalness: 0.78, roughness: 0.24 });
    const bridgeDefs = [
      { s: 332, title: 'PIRELLI ZERO',  sub: 'OFFICIAL TIRE SUPPLIER',   bg1: '#ffd200', bg2: '#e0a200', fg: '#111111', stripe: '#d91424', badge: 'PZ' },
      { s: 604, title: 'TAG CHRONO',    sub: 'PRECISION SECTOR TIMING',  bg1: '#0a5c36', bg2: '#063b22', fg: '#ffffff', stripe: '#eb212e', badge: 'TC' },
      { s: 792, title: 'RACE PHANATIC', sub: 'WORLD CHAMPIONSHIP TOUR',  bg1: '#071a36', bg2: '#0d3266', fg: '#00f0ff', stripe: '#ff2468', badge: 'F1' },
    ];

    for (const bd of bridgeDefs) {
      if (this.trackDef.tunnelRangeS && bd.s >= this.trackDef.tunnelRangeS[0] - 10 && bd.s <= this.trackDef.tunnelRangeS[1] + 10) {
        continue;
      }
      if (this.trackDef.overpassRangeS && bd.s >= this.trackDef.overpassRangeS[0] - 18 && bd.s <= this.trackDef.overpassRangeS[1] + 18) {
        continue;
      }
      const fr = this.sampleAt(bd.s, 0);
      const yaw = Math.atan2(fr.tangent.z, fr.tangent.x);
      const span = ROAD_HALF_WIDTH + 6.4;

      const gGroup = new THREE.Group();
      gGroup.position.copy(fr.pos);
      gGroup.rotation.y = -yaw;

      for (const side of [-1, 1]) {
        const footing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 1.9), this.concreteMat);
        footing.position.set(0, 0.45, side * span);
        gGroup.add(footing);

        // Twin angled A-frame steel legs
        for (const xLeg of [-0.55, 0.55]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 8.9, 8), trussMat);
          leg.position.set(xLeg, 4.5, side * span);
          leg.rotation.z = xLeg * 0.08;
          leg.castShadow = true;
          gGroup.add(leg);
        }
      }

      const tex = this._makeMotorsportBanner(bd.title, bd.sub, bd.bg1, bd.bg2, bd.fg, bd.stripe, bd.badge, 1024, 192);
      const faceMat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.26,
        emissive: new THREE.Color(0xffffff),
        emissiveMap: tex,
        emissiveIntensity: this.trackDef.theme === 'VEGAS' ? 0.48 : 0.16,
      });
      const spanBox = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 2.35, span * 2.04),
        [faceMat, faceMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat]
      );
      spanBox.position.set(0, 8.15, 0);
      spanBox.castShadow = true;
      gGroup.add(spanBox);
      this.group.add(gGroup);
    }

    // FIA Grade-1 Wire Catch-Fencing along Main Straight Spectator Corridor
    const fencePostGeo = new THREE.CylinderGeometry(0.06, 0.075, 4.3, 6);
    const fencePostMat = new THREE.MeshStandardMaterial({ color: 0xa2afc2, metalness: 0.78, roughness: 0.28 });
    const postMatrices = [];
    const dummy = new THREE.Object3D();
    for (let x = -225; x <= 525; x += 12.5) {
      dummy.position.set(x, 2.65, -(ROAD_HALF_WIDTH + 5.88));
      dummy.rotation.set(0.11, 0, 0);
      dummy.updateMatrix();
      postMatrices.push(dummy.matrix.clone());
    }
    const postInst = new THREE.InstancedMesh(fencePostGeo, fencePostMat, postMatrices.length);
    postMatrices.forEach((m, i) => postInst.setMatrixAt(i, m));
    this.group.add(postInst);

    const meshFenceMat = new THREE.MeshBasicMaterial({
      color: 0xc2d2e8,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const fencePanel = new THREE.Mesh(new THREE.PlaneGeometry(750, 3.45), meshFenceMat);
    fencePanel.position.set(150, 2.7, -(ROAD_HALF_WIDTH + 5.84));
    this.group.add(fencePanel);

    // Aerial Race-Day Atmosphere: Sweeping Vegas Sky Searchlights OR Broadcast Blimp & Festival Balloons
    if (this.trackDef.theme === 'VEGAS') {
      const beamGeo = new THREE.ConeGeometry(20, 380, 18, 1, true);
      beamGeo.translate(0, 190, 0);
      const beamColors = [0x00f0ff, 0xff1493, 0xffd600, 0x9d00ff, 0x00ffaa];
      for (let i = 0; i < 10; i++) {
        const beamMat = new THREE.MeshBasicMaterial({
          color: beamColors[i % beamColors.length],
          transparent: true,
          opacity: 0.088,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        const bx = -210 + i * 115;
        const bz = i % 2 === 0 ? -155 - (i % 3) * 45 : 495 + (i % 3) * 55;
        beam.position.set(bx, 0, bz);
        this.group.add(beam);
        this.animatedProps.push((t) => {
          beam.rotation.z = Math.sin(t * 0.72 + i * 1.15) * 0.38;
          beam.rotation.x = Math.cos(t * 0.54 + i * 0.85) * 0.30;
        });
      }
    } else {
      // Orbiting Championship Broadcast Blimp
      const blimp = new THREE.Group();
      const hull = new THREE.Mesh(
        new THREE.SphereGeometry(14, 24, 16),
        new THREE.MeshStandardMaterial({ color: 0xf6f9ff, roughness: 0.25, metalness: 0.2 })
      );
      hull.scale.set(2.85, 0.86, 0.86);
      const stripe = new THREE.Mesh(
        new THREE.SphereGeometry(14.18, 24, 12),
        new THREE.MeshStandardMaterial({ color: 0x0d3b8c, roughness: 0.3 })
      );
      stripe.scale.set(2.82, 0.24, 0.88);
      const finV = new THREE.Mesh(
        new THREE.BoxGeometry(8.5, 11.5, 0.6),
        new THREE.MeshStandardMaterial({ color: 0xe41c24, roughness: 0.35 })
      );
      finV.position.set(-32, 2.5, 0);
      const gondola = new THREE.Mesh(
        new THREE.BoxGeometry(9.5, 2.6, 3.0),
        new THREE.MeshStandardMaterial({ color: 0x1e2532 })
      );
      gondola.position.set(0, -12.2, 0);
      blimp.add(hull, stripe, finV, gondola);
      blimp.position.set(220, 185, 240);
      this.group.add(blimp);
      this.animatedProps.push((t) => {
        const a = t * 0.045;
        blimp.position.set(220 + Math.cos(a) * 420, 188 + Math.sin(t * 0.4) * 3, 240 + Math.sin(a) * 320);
        blimp.rotation.y = -a + Math.PI / 2;
      });

      // Colorful Race-Festival Hot-Air Balloons drifting above distant hills
      const balloonCols = [0xff2a38, 0xffb300, 0x00b0ff, 0x00e676, 0xab47bc];
      for (let i = 0; i < 5; i++) {
        const bg = new THREE.Group();
        const env = new THREE.Mesh(
          new THREE.SphereGeometry(15, 20, 16),
          new THREE.MeshStandardMaterial({ color: balloonCols[i], roughness: 0.42 })
        );
        env.scale.set(1.0, 1.26, 1.0);
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(14.8, 13.6, 4.2, 20),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
        );
        band.position.y = 1.5;
        const basket = new THREE.Mesh(
          new THREE.BoxGeometry(3.2, 2.8, 3.2),
          new THREE.MeshStandardMaterial({ color: 0x6d4c3d })
        );
        basket.position.y = -21;
        bg.add(env, band, basket);
        const ang = 0.55 + i * 1.15;
        const baseY = 148 + (i % 3) * 32;
        bg.position.set(200 + Math.cos(ang) * 980, baseY, 220 + Math.sin(ang) * 880);
        this.group.add(bg);
        this.animatedProps.push((t) => {
          bg.position.y = baseY + Math.sin(t * 0.5 + i * 1.7) * 6.5;
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 7. FIA 150m/100m/50m BRAKING BOARDS & FRAMED VECTOR SPONSOR BILLBOARDS
  // --------------------------------------------------------------------------
  _buildBrakingBoardsAndBillboards() {
    this.billboards = [];
    const isVegas = this.trackDef.theme === 'VEGAS';
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x647082, metalness: 0.75, roughness: 0.3 });

    // A. Grounded FIA 150m / 100m / 50m Braking Marker Boards at all circuit braking zones
    const brakeMats = new Map();
    for (const distM of [150, 100, 50]) {
      const tex = this._makeBrakingBoardTexture(distM, isVegas);
      brakeMats.set(
        distM,
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.28,
          emissive: new THREE.Color(0xffffff),
          emissiveMap: tex,
          emissiveIntensity: isVegas ? 0.52 : 0.18,
        })
      );
    }

    const zones = this.trackDef.brakingZones || [
      { entryS: 162, side: -1 },
      { entryS: 610, side: -1 },
    ];

    for (const bz of zones) {
      for (const distM of [150, 100, 50]) {
        const ms = wrapS(bz.entryS - distM / this.realMetersPerGameMeter);
        if (this.trackDef.tunnelRangeS && ms >= this.trackDef.tunnelRangeS[0] && ms <= this.trackDef.tunnelRangeS[1]) {
          continue;
        }
        const side = (bz.side > 0 && (ms >= 898 || ms <= 126)) ? -1 : bz.side;
        const fr = this.sampleAt(ms, side * (ROAD_HALF_WIDTH + 3.45));
        const yaw = Math.atan2(fr.tangent.z, fr.tangent.x);

        const markerGroup = new THREE.Group();
        markerGroup.position.copy(fr.pos);
        markerGroup.rotation.y = -yaw + (side > 0 ? -0.14 : 0.14);

        const bMat = brakeMats.get(distM);
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 1.38, 1.86),
          [bMat, bMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat]
        );
        sign.position.y = 1.52;
        sign.castShadow = true;
        markerGroup.add(sign);

        // Twin grounded breakaway steel posts (never floating!)
        for (const zLeg of [-0.58, 0.58]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 1.55, 8), strutMat);
          leg.position.set(0.08, 0.77, zLeg);
          markerGroup.add(leg);
        }
        this.group.add(markerGroup);
      }
    }

    // B. Vector-Art Motorsport Sponsor Billboards with 6-Face Frame, Top Light Hood & Steel A-Frame Struts
    const brandMats = BILLBOARD_BRANDS.map((b) => {
      const tex = this._makeMotorsportBanner(b.title, b.sub, b.bg1, b.bg2, b.fg, b.stripe, b.badge, 1024, 256);
      return new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.28,
        metalness: 0.12,
        emissive: new THREE.Color(0xffffff),
        emissiveMap: tex,
        emissiveIntensity: isVegas ? 0.52 : 0.16,
      });
    });

    const lightBarMat = new THREE.MeshBasicMaterial({ color: isVegas ? 0x00f0ff : 0xfff8e6 });
    let bIdx = 0;

    for (let s = 34; s < 956; s += 33) {
      if (this.trackDef.tunnelRangeS && s >= this.trackDef.tunnelRangeS[0] - 4 && s <= this.trackDef.tunnelRangeS[1] + 4) {
        continue;
      }
      if (this.trackDef.overpassRangeS && s >= this.trackDef.overpassRangeS[0] - 12 && s <= this.trackDef.overpassRangeS[1] + 12) {
        continue;
      }

      const k = this.getPhysicsCurvature(s);
      const side = Math.abs(k) > 0.15 ? -Math.sign(k) : (bIdx % 2 === 0 ? -1 : 1);
      if (side > 0 && (s >= 898 || s <= 128)) continue;

      const lat = side * (ROAD_HALF_WIDTH + 7.55);
      const fr = this.sampleAt(s, lat);
      if (this.trackDef.overpassRangeS && fr.pos.y > 6.5) continue;
      const yaw = Math.atan2(fr.tangent.z, fr.tangent.x);

      const holder = new THREE.Group();
      holder.position.copy(fr.pos);
      holder.rotation.y = -yaw + (side > 0 ? -0.20 : 0.20);

      const faceMat = brandMats[bIdx % brandMats.length];
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 2.68, 7.7),
        [faceMat, faceMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat]
      );
      board.castShadow = true;
      board.receiveShadow = true;
      board.position.y = 2.12;
      holder.add(board);

      // Top architectural floodlight brow bar
      const lightHood = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 7.2), lightBarMat);
      lightHood.position.set(-0.18, 3.52, 0);
      holder.add(lightHood);

      // Grounded concrete ballast footings + vertical steel posts + angled rear A-frame diagonal struts
      for (const zPost of [-2.75, 0, 2.75]) {
        const ballast = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.36, 0.55), this.concreteMat);
        ballast.position.set(0.32, 0.18, zPost);
        holder.add(ballast);

        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 3.3, 8), strutMat);
        post.position.set(0.24, 1.65, zPost);
        holder.add(post);

        const diag = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 2.45, 6), strutMat);
        diag.position.set(0.76, 1.18, zPost);
        diag.rotation.z = -0.46;
        holder.add(diag);
      }

      this.group.add(holder);
      this.billboards.push({
        s,
        lateralOffset: lat,
        halfWidth: 3.85,
        pos: fr.pos.clone(),
        mesh: holder,
      });
      bIdx++;
    }
  }

  _makeBrakingBoardTexture(distM, isNight) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');

    ctx.fillStyle = isNight ? '#061a2e' : '#0a5c28';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = isNight ? '#00f0ff' : '#ffffff';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, 240, 240);

    // FIA Braking Countdown Bars (3 bars = 150m, 2 bars = 100m, 1 bar = 50m)
    const bars = distM === 150 ? 3 : (distM === 100 ? 2 : 1);
    ctx.fillStyle = isNight ? '#ff1493' : '#ffd600';
    for (let i = 0; i < bars; i++) {
      ctx.fillRect(28 + i * 26, 24, 16, 40);
    }

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 italic 96px "Segoe UI", "Arial Black", sans-serif';
    ctx.fillText(`${distM}`, 128, 134);

    ctx.fillStyle = isNight ? '#00f0ff' : '#ffd600';
    ctx.font = '800 30px "Segoe UI", Arial, sans-serif';
    ctx.fillText('METERS', 128, 212);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _makeMotorsportBanner(title, subtitle, bg1, bg2, fg, stripe, badgeTxt, w = 1024, h = 256) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');

    // Rich directional gradient background
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, bg1);
    grad.addColorStop(1, bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle brushed diagonal carbon/metallic texture sheen
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillRect(0, 0, w, h * 0.36);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let x = -h; x < w; x += 28) {
      ctx.fillRect(x, 0, 2, h);
    }

    // Racing diagonal accent chevrons on right end
    ctx.fillStyle = stripe;
    ctx.beginPath();
    ctx.moveTo(w * 0.81, 0);
    ctx.lineTo(w * 0.885, 0);
    ctx.lineTo(w * 0.805, h);
    ctx.lineTo(w * 0.73, h);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(w * 0.905, 0);
    ctx.lineTo(w * 0.962, 0);
    ctx.lineTo(w * 0.882, h);
    ctx.lineTo(w * 0.825, h);
    ctx.closePath();
    ctx.fill();

    // Left circular motorsport crest medallion badge
    if (w >= 512) {
      const cx = h * 0.54;
      const cy = h * 0.50;
      const r = h * 0.33;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = stripe;
      ctx.fill();
      ctx.lineWidth = Math.max(3, h * 0.025);
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.fillStyle = '#0b1018';
      ctx.font = `900 ${Math.round(h * 0.25)}px "Segoe UI", "Arial Black", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeTxt, cx, cy + 1);
    }

    // Crisp outer metallic/accent border frame
    ctx.strokeStyle = stripe;
    ctx.lineWidth = Math.max(6, h * 0.045);
    ctx.strokeRect(4, 4, w - 8, h - 8);

    // Drop-shadowed Main Headline & Subtitle (auto-fitted so text never clips!)
    const textX = w >= 512 ? w * 0.455 : w * 0.5;
    const maxTextW = w >= 512 ? w * 0.54 : w * 0.82;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.48)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;

    ctx.fillStyle = fg;
    ctx.font = `900 italic ${Math.round(h * 0.33)}px "Segoe UI", "Arial Black", sans-serif`;
    ctx.fillText(title, textX, h * 0.40, maxTextW);

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.font = `800 ${Math.round(h * 0.155)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(subtitle, textX, h * 0.75, maxTextW);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // --------------------------------------------------------------------------
  // 8. CLOSED-BOWL SUNLIT/ILLUMINATED 3D GRANDSTANDS + ANIMATED CROWDS, FLAGS & FLASHES
  // --------------------------------------------------------------------------
  _makeCameraFlashTexture() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
    g.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    g.addColorStop(0.28, 'rgba(205, 245, 255, 0.85)');
    g.addColorStop(0.65, 'rgba(120, 215, 255, 0.22)');
    g.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);

    // 4-point optical camera starburst rays
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillRect(4, 30, 56, 4);
    ctx.fillRect(30, 4, 4, 56);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildGrandstands() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#525e70';
    ctx.fillRect(0, 0, 512, 256);

    const theme = this.trackDef.theme;
    const shirtColors = theme === 'MONZA'
      ? ['#e41c24', '#ff2a2a', '#ffffff', '#009246', '#ffd600', '#d90429']
      : (theme === 'VEGAS'
        ? ['#ff1493', '#00f0ff', '#ffd600', '#ffffff', '#b388ff', '#00e676']
        : (theme === 'SILVERSTONE'
          ? ['#0038a8', '#ce1126', '#ffffff', '#00b0ff', '#ffd600', '#e51c23']
          : ['#ff3b30', '#00b0ff', '#ffd600', '#ffffff', '#00e676', '#ff9500']));

    for (let row = 0; row < 16; row++) {
      const y = row * 16;
      ctx.fillStyle = '#7c8a9e';
      ctx.fillRect(0, y, 512, 5); // Sunlit concrete riser step
      ctx.fillStyle = '#3c4656';
      ctx.fillRect(0, y + 14, 512, 2); // Step shadow
      for (let col = 4; col < 508; col += 7) {
        const h = fastHash2D(col, row, 401);
        if (h < 0.86) {
          ctx.fillStyle = shirtColors[Math.floor(h * 97) % shirtColors.length];
          ctx.fillRect(col, y + 5, 5, 9);
          ctx.fillStyle = h < 0.3 ? '#ffffff' : '#f1c27d';
          ctx.fillRect(col + 1, y + 3, 3, 3);
        }
      }
    }
    const crowdTex = new THREE.CanvasTexture(c);
    crowdTex.wrapS = THREE.RepeatWrapping;
    crowdTex.wrapT = THREE.RepeatWrapping;
    crowdTex.repeat.set(8, 1);
    crowdTex.colorSpace = THREE.SRGBColorSpace;

    const crowdMat = new THREE.MeshStandardMaterial({
      map: crowdTex,
      roughness: 0.62,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: crowdTex,
      emissiveIntensity: theme === 'VEGAS' ? 0.55 : 0.34,
    });

    // Architectural ribbed exterior cladding texture so stand backs/sides look rich from every angle
    const extC = document.createElement('canvas');
    extC.width = 256;
    extC.height = 128;
    const ectx = extC.getContext('2d');
    ectx.fillStyle = theme === 'VEGAS' ? '#1c263b' : '#dce4f0';
    ectx.fillRect(0, 0, 256, 128);
    ectx.fillStyle = theme === 'VEGAS' ? '#00f0ff' : '#9aa8bc';
    for (let x = 0; x < 256; x += 16) {
      ectx.fillRect(x, 0, 3, 128);
    }
    ectx.fillStyle = this.trackDef.accentColor || '#e41c24';
    ectx.fillRect(0, 14, 256, 14);
    const extTex = new THREE.CanvasTexture(extC);
    extTex.wrapS = THREE.RepeatWrapping;
    extTex.wrapT = THREE.RepeatWrapping;
    extTex.repeat.set(6, 1);
    extTex.colorSpace = THREE.SRGBColorSpace;

    const structMat = new THREE.MeshStandardMaterial({
      map: extTex,
      roughness: 0.42,
      metalness: 0.26,
      emissive: new THREE.Color(theme === 'VEGAS' ? 0x152238 : 0x11161f),
      emissiveIntensity: 0.25,
    });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xf6f9ff,
      roughness: 0.28,
      metalness: 0.24,
      side: THREE.DoubleSide,
    });
    const underLightMat = new THREE.MeshBasicMaterial({
      color: theme === 'VEGAS' ? 0xdff8ff : 0xfff7e2,
    });

    const fasciaTitle = theme === 'MONZA'
      ? 'AUTODROMO MONZA • FORZA TIFOSI'
      : (theme === 'SUZUKA'
        ? 'SUZUKA CIRCUIT • NIPPON GRAND PRIX'
        : (theme === 'SILVERSTONE'
          ? 'SILVERSTONE • HOME OF BRITISH GP'
          : this.trackDef.name));
    const fasciaTex = this._makeMotorsportBanner(
      fasciaTitle,
      `${this.trackDef.country} • GRANDSTAND TRIBUNE`,
      theme === 'MONZA' ? '#b80d18' : (theme === 'SILVERSTONE' ? '#002b7f' : '#0b2244'),
      theme === 'MONZA' ? '#7a060e' : (theme === 'SILVERSTONE' ? '#081b4b' : '#133a70'),
      '#ffffff',
      theme === 'VEGAS' ? '#00f0ff' : (theme === 'SILVERSTONE' ? '#ce1126' : '#ffd600'),
      'GP',
      1024,
      128
    );
    const fasciaMat = new THREE.MeshStandardMaterial({
      map: fasciaTex,
      roughness: 0.30,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: fasciaTex,
      emissiveIntensity: theme === 'VEGAS' ? 0.48 : 0.20,
    });

    // Shared 3D Cheering Spectator Mesh (Torso + Head + Raised Cheering Arms)
    const torsoG = new THREE.BoxGeometry(0.62, 0.78, 0.38);
    torsoG.translate(0, 0.39, 0);
    const headG = new THREE.SphereGeometry(0.22, 8, 6);
    headG.translate(0, 0.98, 0);
    const armLG = new THREE.BoxGeometry(0.15, 0.62, 0.15);
    armLG.rotateZ(0.36);
    armLG.translate(-0.38, 0.88, 0.05);
    const armRG = new THREE.BoxGeometry(0.15, 0.62, 0.15);
    armRG.rotateZ(-0.36);
    armRG.translate(0.38, 0.88, 0.05);
    const spectatorGeo = mergeSubGeometries([torsoG, headG, armLG, armRG]);

    const fanMats = shirtColors.slice(0, 4).map(
      (hex) => new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.55,
        emissive: new THREE.Color(hex),
        emissiveIntensity: theme === 'VEGAS' ? 0.35 : 0.14,
      })
    );

    const supporterFlagCols = theme === 'MONZA'
      ? [0xe41c24, 0x009246, 0xffd600]
      : (theme === 'SILVERSTONE'
        ? [0x0038a8, 0xce1126, 0xffffff]
        : (theme === 'VEGAS'
          ? [0xff1493, 0x00f0ff, 0xffd600]
          : [0xe51c23, 0xffffff, 0x00b0ff]));
    const supporterFlagMats = supporterFlagCols.map(
      (hex) => new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.4,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(hex),
        emissiveIntensity: theme === 'VEGAS' ? 0.45 : 0.18,
      })
    );
    const flagClothGeo = new THREE.PlaneGeometry(2.35, 1.35);
    flagClothGeo.translate(1.18, 0, 0); // Hinge directly on flagpole axis!
    const flagPoleGeo = new THREE.CylinderGeometry(0.045, 0.055, 3.2, 6);

    const flashTex = this._makeCameraFlashTexture();
    const flashMat = new THREE.MeshBasicMaterial({
      map: flashTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const flashGeo = new THREE.PlaneGeometry(1.85, 1.85);

    const allWaveCohorts = [];
    const allSupporterFlags = [];
    const allCameraFlashes = [];
    let standSeed = 0;

    const buildTribuneGroup = (spanW) => {
      const standGroup = new THREE.Group();
      const mySeed = standSeed++;

      // Enclosed 3D stadium base concourse + full-height rear architectural wall
      const base = new THREE.Mesh(new THREE.BoxGeometry(spanW, 3.4, 19.5), structMat);
      base.position.set(0, 1.7, 0);
      base.castShadow = true;
      base.receiveShadow = true;
      standGroup.add(base);

      const rearWall = new THREE.Mesh(new THREE.BoxGeometry(spanW, 16.6, 2.4), structMat);
      rearWall.position.set(0, 8.3, -8.5);
      rearWall.castShadow = true;
      standGroup.add(rearWall);

      // Enclosed side gable cheek walls so stand never looks paper-thin from oblique angles!
      for (const sx of [-spanW * 0.5 + 0.6, spanW * 0.5 - 0.6]) {
        const sideCheek = new THREE.Mesh(new THREE.BoxGeometry(1.2, 11.2, 16.5), structMat);
        sideCheek.position.set(sx, 7.2, -1.2);
        standGroup.add(sideCheek);
      }

      // Sloped populated crowd bowl facing +Z toward the track
      const tier = new THREE.Mesh(new THREE.PlaneGeometry(spanW - 2.4, 19.8), crowdMat);
      tier.position.set(0, 9.3, 1.3);
      tier.rotation.x = -0.62;
      standGroup.add(tier);

      // 3D Animated Cheering Crowd Wave Cohorts seated along the sloped bowl!
      // Tier plane equation: y = 9.3 + 0.8139 * u, z = 1.3 - 0.5810 * u (u in [-7.6..+7.6])
      const dummy = new THREE.Object3D();
      const cohortBuckets = [
        fanMats.map(() => []),
        fanMats.map(() => []),
        fanMats.map(() => []),
      ];
      const usableW = spanW - 6.0;
      const cols = Math.max(14, Math.floor(usableW / 4.2));
      for (let r = 0; r < 6; r++) {
        const u = -6.8 + r * 2.72;
        const rowY = 9.3 + 0.8139 * u + 0.14;
        const rowZ = 1.3 - 0.5810 * u + 0.22;
        for (let cIdx = 0; cIdx < cols; cIdx++) {
          const h = fastHash2D(cIdx, r, mySeed * 31 + 17);
          if (h > 0.82) continue;
          const fx = -usableW * 0.5 + (cIdx + 0.5) * (usableW / cols) + (h - 0.4) * 0.8;
          dummy.position.set(fx, rowY, rowZ);
          dummy.rotation.set(0, (h - 0.5) * 0.35, 0);
          const sc = 0.92 + (h * 0.28);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          const waveCohort = (cIdx + r) % 3;
          const colorBucket = (cIdx * 3 + r) % fanMats.length;
          cohortBuckets[waveCohort][colorBucket].push(dummy.matrix.clone());
        }
      }

      for (let wIdx = 0; wIdx < 3; wIdx++) {
        const waveGroup = new THREE.Group();
        for (let mIdx = 0; mIdx < fanMats.length; mIdx++) {
          const list = cohortBuckets[wIdx][mIdx];
          if (!list.length) continue;
          const inst = new THREE.InstancedMesh(spectatorGeo, fanMats[mIdx], list.length);
          list.forEach((mat4, k) => inst.setMatrixAt(k, mat4));
          inst.instanceMatrix.needsUpdate = true;
          waveGroup.add(inst);
        }
        standGroup.add(waveGroup);
        allWaveCohorts.push({ group: waveGroup, phase: mySeed * 1.3 + wIdx * 2.09 });
      }

      // Waving 3D Grandstand Supporter Flags across mid & upper rows
      const flagCount = Math.max(5, Math.floor(spanW / 24));
      for (let fi = 0; fi < flagCount; fi++) {
        const u = fi % 2 === 0 ? -1.8 : 4.6;
        const fx = -usableW * 0.44 + (fi / Math.max(1, flagCount - 1)) * (usableW * 0.88);
        const fy = 9.3 + 0.8139 * u;
        const fz = 1.3 - 0.5810 * u + 0.35;

        const pole = new THREE.Mesh(flagPoleGeo, this.armcoMat);
        pole.position.set(fx, fy + 1.55, fz);
        standGroup.add(pole);

        const flg = new THREE.Mesh(flagClothGeo, supporterFlagMats[(fi + mySeed) % supporterFlagMats.length]);
        flg.position.set(fx, fy + 2.55, fz);
        standGroup.add(flg);
        allSupporterFlags.push({ mesh: flg, phase: mySeed * 0.9 + fi * 1.45 });
      }

      // Strobing Stadium Camera Flashes sparkling across the crowd bowl
      const flashCount = Math.max(8, Math.floor(spanW / 14));
      for (let k = 0; k < flashCount; k++) {
        const h1 = fastHash2D(k, 1, mySeed * 53 + 9);
        const h2 = fastHash2D(k, 2, mySeed * 53 + 9);
        const u = -6.5 + h2 * 13.0;
        const fx = (h1 - 0.5) * usableW;
        const fy = 9.3 + 0.8139 * u + 0.85;
        const fz = 1.3 - 0.5810 * u + 0.65;
        const flashMesh = new THREE.Mesh(flashGeo, flashMat);
        flashMesh.position.set(fx, fy, fz);
        flashMesh.visible = false;
        standGroup.add(flashMesh);
        allCameraFlashes.push({ mesh: flashMesh, seed: mySeed * 19 + k * 3.7 });
      }

      // Framed Front Sponsor Fascia Wall
      const fascia = new THREE.Mesh(
        new THREE.BoxGeometry(spanW + 0.4, 2.35, 0.65),
        [this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, fasciaMat, this.darkFrameMat]
      );
      fascia.position.set(0, 3.15, 9.8);
      standGroup.add(fascia);

      // Cantilevered Stadium Roof Canopy + Under-Canopy Broadcast Spotlights
      const roof = new THREE.Mesh(new THREE.BoxGeometry(spanW + 3.0, 0.82, 23.0), canopyMat);
      roof.position.set(0, 17.6, 1.2);
      roof.rotation.x = 0.08;
      roof.castShadow = true;
      standGroup.add(roof);

      const lightStrip = new THREE.Mesh(new THREE.BoxGeometry(spanW - 8.0, 0.22, 0.85), underLightMat);
      lightStrip.position.set(0, 16.55, 10.8);
      standGroup.add(lightStrip);

      const step = spanW / 4;
      for (let px = -spanW * 0.44; px <= spanW * 0.45; px += step) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 17.4, 8), this.darkFrameMat);
        col.position.set(px, 8.7, -7.2);
        standGroup.add(col);
      }

      return standGroup;
    };

    // Main Straight 3-Block Grandstand Complex
    for (const gx of [-82, 172, 426]) {
      const gz = -(ROAD_HALF_WIDTH + 23.0);
      const sg = buildTribuneGroup(192);
      sg.position.set(gx, 0, gz);
      this.group.add(sg);
    }

    // Secondary Circuit-Specific Iconic Corner Tribunes
    const cornerStands = this.trackDef.cornerTribunes || [];
    for (const cs of cornerStands) {
      const dist = ROAD_HALF_WIDTH + 24.5;
      const fr = this.sampleAt(cs.s, cs.side * dist);
      const yaw = Math.atan2(fr.tangent.z, fr.tangent.x);
      const sg = buildTribuneGroup(cs.span || 115);
      sg.position.copy(fr.pos);
      // Orient +Z face of tribune directly toward the track centerline!
      sg.rotation.y = -yaw + (cs.side < 0 ? 0 : Math.PI);
      this.group.add(sg);
    }

    // Single high-efficiency animation driver for all cheering crowds, flags & camera flashes!
    this.animatedProps.push((t) => {
      for (let i = 0; i < allWaveCohorts.length; i++) {
        const cw = allWaveCohorts[i];
        cw.group.position.y = Math.abs(Math.sin(t * 6.4 + cw.phase)) * 0.28;
      }
      for (let i = 0; i < allSupporterFlags.length; i++) {
        const sf = allSupporterFlags[i];
        sf.mesh.rotation.y = Math.sin(t * 6.2 + sf.phase) * 0.40;
      }
      for (let i = 0; i < allCameraFlashes.length; i++) {
        const cf = allCameraFlashes[i];
        const pulse = Math.sin(t * 4.7 + cf.seed) * Math.sin(t * 13.3 + cf.seed * 1.9);
        if (pulse > 0.84) {
          cf.mesh.visible = true;
          const s = 0.75 + (pulse - 0.84) * 7.5;
          cf.mesh.scale.setScalar(s);
          cf.mesh.rotation.z = t * 2.5 + cf.seed;
        } else {
          cf.mesh.visible = false;
        }
      }
    });
  }

  // --------------------------------------------------------------------------
  // 9. UNMISTAKABLE AAA BIOME LANDMARKS FOR ALL 6 WORLD CHAMPIONSHIP CIRCUITS
  // --------------------------------------------------------------------------
  _buildBiomeLandmarks() {
    const theme = this.trackDef.theme;
    if (theme === 'FUJI') this._buildFujiBiome();
    else if (theme === 'MONACO') this._buildMonacoBiome();
    else if (theme === 'VEGAS') this._buildVegasBiome();
    else if (theme === 'MONZA') this._buildMonzaBiome();
    else if (theme === 'SUZUKA') this._buildSuzukaBiome();
    else if (theme === 'SILVERSTONE') this._buildSilverstoneBiome();
  }

  _makeFujiVolcanicSlopeTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(256, 256, 18, 256, 256, 260);
    g.addColorStop(0.00, '#3a557e'); // Frost-chilled upper volcanic basalt
    g.addColorStop(0.55, '#2b4166'); // Deep blue-slate volcanic rock
    g.addColorStop(1.00, '#223452'); // Shadowed lower basalt ridges
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);

    // Radial & vertical basalt erosion gullies (works cleanly for both planar & cylindrical UVs!)
    for (let i = 0; i < 72; i++) {
      const ang = (Math.PI * 2 * i) / 72;
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(15, 24, 44, 0.42)' : 'rgba(92, 122, 168, 0.24)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(256 + Math.cos(ang) * 16, 256 + Math.sin(ang) * 16);
      ctx.lineTo(256 + Math.cos(ang) * 255, 256 + Math.sin(ang) * 255);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _makeFujiSnowCrownTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.0, '#ffffff');
    g.addColorStop(0.7, '#eef6ff');
    g.addColorStop(1.0, '#cbdcf2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);

    // Exposed dark volcanic basalt ribs & sunlit glacial snow flutes (never a flat white cone!)
    for (let i = 0; i < 48; i++) {
      const x = (i / 48) * 512;
      const ribH = 55 + fastHash2D(i, 3, 709) * 140;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(43, 63, 99, 0.52)' : 'rgba(165, 196, 235, 0.42)';
      ctx.fillRect(x, 256 - ribH, 4, ribH);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(3, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildFujiBiome() {
    // 1. Majestic 3-Strata Mount Fuji at authentic alpine vista distance (~1550m ahead of straight, >385m clear of Turn 1!)
    const fujiPos = new THREE.Vector3(1860, -14, -195);
    const slopeTex = this._makeFujiVolcanicSlopeTexture();
    const snowTex = this._makeFujiSnowCrownTexture();

    const forestBaseMat = new THREE.MeshStandardMaterial({
      color: 0x1e4a2b,
      roughness: 0.88,
      metalness: 0.02,
      emissive: new THREE.Color(0x091c10),
      emissiveIntensity: 0.14,
    });
    const slopeMat = new THREE.MeshStandardMaterial({
      map: slopeTex,
      roughness: 0.84,
      metalness: 0.05,
      emissive: new THREE.Color(0x101e38),
      emissiveIntensity: 0.16,
    });
    const snowMat = new THREE.MeshStandardMaterial({
      map: snowTex,
      roughness: 0.36,
      metalness: 0.04,
      emissive: new THREE.Color(0xdbeafe),
      emissiveIntensity: 0.18,
    });

    let fuji;
    let hasForestMesh = false;
    if (this.assets?.templates?.mountFuji) {
      fuji = this.assets.templates.mountFuji.clone(true);
      fuji.traverse((ch) => {
        if (!ch.isMesh) return;
        const tag = `${ch.name || ''} ${ch.material?.name || ''}`.toLowerCase();
        if (tag.includes('snow')) {
          ch.material = snowMat;
        } else if (tag.includes('forest') || tag.includes('foothill')) {
          ch.material = forestBaseMat;
          hasForestMesh = true;
        } else {
          ch.material = slopeMat;
        }
      });
      // Normalize GLB bounds precisely to 1320m base diameter (r=660m) x 435m height!
      fuji.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(fuji);
      const sz = new THREE.Vector3();
      box.getSize(sz);
      const spanXZ = Math.max(sz.x, sz.z);
      const sxz = spanXZ > 1 ? 1320 / spanXZ : 1.35;
      const sy = sz.y > 1 ? 435 / sz.y : 2.55;
      fuji.scale.set(sxz, sy, sxz);
    } else {
      fuji = new THREE.Group();
      const forestSkirt = new THREE.Mesh(new THREE.CylinderGeometry(420, 680, 115, 48, 1, false), forestBaseMat);
      forestSkirt.position.y = 57.5;
      const rockMid = new THREE.Mesh(new THREE.CylinderGeometry(165, 445, 205, 48, 1, false), slopeMat);
      rockMid.position.y = 212;
      const snowCrown = new THREE.Mesh(new THREE.CylinderGeometry(58, 188, 135, 48, 1, false), snowMat);
      snowCrown.position.y = 372;
      fuji.add(forestSkirt, rockMid, snowCrown);
      hasForestMesh = true;
    }
    fuji.position.copy(fujiPos);
    this.group.add(fuji);

    // Ensure lush cedar-forested Shizuoka foothill ridge ring hugs Mount Fuji's base
    if (!hasForestMesh) {
      const foothillSkirt = new THREE.Mesh(
        new THREE.CylinderGeometry(480, 710, 96, 48, 1, true),
        forestBaseMat
      );
      foothillSkirt.position.set(fujiPos.x, fujiPos.y + 46, fujiPos.z);
      this.group.add(foothillSkirt);
    }

    // Sculpted Atmospheric Mist & Lenticular Cloud Collar around Mount Fuji's mid-flanks
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xf4f9ff,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    });
    for (let i = 0; i < 18; i++) {
      const ang = (Math.PI * 2 * i) / 18;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(72 + (i % 3) * 24, 16, 12), cloudMat);
      puff.scale.set(2.4, 0.32, 1.35);
      puff.position.set(
        fujiPos.x + Math.cos(ang) * 545,
        132 + (i % 4) * 20,
        fujiPos.z + Math.sin(ang) * 545
      );
      this.group.add(puff);
    }

    // 2. Iconic Vermilion Shinto Torii Gates (Turn 1 Vista Knoll + 100R Sakura Shrine)
    const buildShintoTorii = (scale = 1.0) => {
      const vermilionMat = new THREE.MeshStandardMaterial({
        color: 0xd91b1b,
        roughness: 0.32,
        metalness: 0.12,
        emissive: new THREE.Color(0x3a0505),
        emissiveIntensity: 0.2,
      });
      const lacquerMat = new THREE.MeshStandardMaterial({ color: 0x181a22, roughness: 0.35, metalness: 0.25 });
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xf5c438, metalness: 0.75, roughness: 0.25 });

      const tg = new THREE.Group();
      for (const x of [-6.8, 6.8]) {
        const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 1.4, 12), lacquerMat);
        pedestal.position.set(x, 0.7, 0);
        const hashira = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.82, 15.6, 16), vermilionMat);
        hashira.position.set(x, 8.1, 0);
        hashira.rotation.z = x > 0 ? 0.035 : -0.035;
        hashira.castShadow = true;
        tg.add(pedestal, hashira);
      }
      // Curved Kasagi upper lintel + upturned wing tips + Shimaki + Nuki crossbeam + Gakuzuka tablet
      const kasagi = new THREE.Mesh(new THREE.BoxGeometry(20.4, 1.05, 1.65), lacquerMat);
      kasagi.position.set(0, 16.0, 0);
      for (const xTip of [-9.8, 9.8]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.05, 1.68), lacquerMat);
        wing.position.set(xTip, 16.32, 0);
        wing.rotation.z = xTip > 0 ? 0.22 : -0.22;
        tg.add(wing);
      }
      const shimaki = new THREE.Mesh(new THREE.BoxGeometry(18.8, 0.88, 1.28), vermilionMat);
      shimaki.position.set(0, 15.05, 0);
      const nuki = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.82, 0.96), vermilionMat);
      nuki.position.set(0, 11.9, 0);
      const gakuzuka = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3.2, 1.05), goldMat);
      gakuzuka.position.set(0, 13.5, 0);

      // Stone Toro Lanterns flanking the Torii
      for (const lx of [-10.8, 10.8]) {
        const lantern = new THREE.Group();
        lantern.position.set(lx, 0, 2.2);
        const lBase = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 2.2, 8), this.concreteMat);
        lBase.position.y = 1.1;
        const lBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.85, 0.85, 0.85),
          new THREE.MeshBasicMaterial({ color: 0xffe8a3 })
        );
        lBox.position.y = 2.55;
        const lCap = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.75, 4), this.concreteMat);
        lCap.position.y = 3.3;
        lCap.rotation.y = Math.PI / 4;
        lantern.add(lBase, lBox, lCap);
        tg.add(lantern);
      }

      tg.add(kasagi, shimaki, nuki, gakuzuka);
      tg.scale.setScalar(scale);
      return tg;
    };

    const t1Frame = this.sampleAt(146, -(ROAD_HALF_WIDTH + 19.5));
    const torii1 = buildShintoTorii(1.05);
    torii1.position.copy(t1Frame.pos);
    torii1.rotation.y = -0.45;
    this.group.add(torii1);

    const t2Frame = this.sampleAt(585, -(ROAD_HALF_WIDTH + 21.0));
    const torii2 = buildShintoTorii(0.92);
    torii2.position.copy(t2Frame.pos);
    torii2.rotation.y = 0.85;
    this.group.add(torii2);

    // 3. 4-Tier Japanese Pagoda Race Control Tower near Paddock (visible in Showroom Hero Orbit!)
    const pagoda = new THREE.Group();
    pagoda.position.set(-138, 0, PIT_LANE_CONFIG.lateralOffset + 29);
    const wallM = new THREE.MeshStandardMaterial({ color: 0xf7f9fc, roughness: 0.36 });
    const roofM = new THREE.MeshStandardMaterial({ color: 0x222936, roughness: 0.42, metalness: 0.32 });
    const redRailM = new THREE.MeshStandardMaterial({ color: 0xd91b1b, roughness: 0.35 });
    const warmWinM = new THREE.MeshBasicMaterial({ color: 0xffe8a8 });

    for (let lvl = 0; lvl < 4; lvl++) {
      const w = 13.5 - lvl * 2.1;
      const y = lvl * 6.3;
      const core = new THREE.Mesh(new THREE.BoxGeometry(w, 5.5, w), wallM);
      core.position.y = y + 2.75;
      core.castShadow = true;
      const winBand = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 1.5, w + 0.14), warmWinM);
      winBand.position.y = y + 3.4;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 0.42, w + 1.4), redRailM);
      rail.position.y = y + 0.4;
      const eave = new THREE.Mesh(new THREE.ConeGeometry(w * 0.98, 2.35, 4), roofM);
      eave.rotation.y = Math.PI / 4;
      eave.position.y = y + 6.15;
      pagoda.add(core, winBand, rail, eave);
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 7.5, 8), roofM);
    spire.position.y = 28.5;
    pagoda.add(spire);
    this.group.add(pagoda);

    // 4. Lush Pink Sakura Cherry Blossom Groves + Alpine Japanese Cedar Pines
    this._scatterForestTrees({
      count: 340,
      foliageColors: [0xff9ec6, 0xffb7d5, 0xffd1e6, 0x1d5932, 0x276e3f],
      spruceRatio: 0.42,
      blossomPetals: true,
    });
  }

  _buildMonacoBiome() {
    // Procedural Shimmering Turquoise Mediterranean Water Texture (animated UV drift!)
    const waterTex = this._makeMediterraneanWaterTexture();
    const seaMat = new THREE.MeshStandardMaterial({
      map: waterTex,
      color: 0x14a8d8,
      roughness: 0.08,
      metalness: 0.78,
      emissive: new THREE.Color(0x004d73),
      emissiveIntensity: 0.42,
    });
    this.animatedProps.push((t) => {
      waterTex.offset.x = (t * 0.014) % 1;
      waterTex.offset.y = Math.sin(t * 0.35) * 0.025;
    });

    // 1A. Outer Mediterranean Harbor along Tunnel Exit & Nouvelle Harbor Chicane (z >= 474 — zero overlap with road!)
    const outerSea = new THREE.Mesh(new THREE.PlaneGeometry(3600, 2200), seaMat);
    outerSea.rotation.x = -Math.PI / 2;
    outerSea.position.set(100, -0.18, 1574);
    this.group.add(outerSea);

    // Crisp Stone Quay Wall + White Promenade Railing along Outer Harbor Edge (z = 473)
    const quayOuter = new THREE.Mesh(new THREE.BoxGeometry(1500, 1.2, 2.4), this.concreteMat);
    quayOuter.position.set(40, 0.05, 473.2);
    this.group.add(quayOuter);

    // 1B. Port Hercule Inner Marina Basin tucked cleanly behind Pit Building (x in [-185..+215], z in [58..212])
    //     Completely clear of all track splines and visible from Showroom Start Screen & Main Straight!
    const basinW = 400;
    const basinD = 152;
    const basinCx = 15;
    const basinCz = 135;

    const innerBasin = new THREE.Mesh(new THREE.PlaneGeometry(basinW, basinD), seaMat);
    innerBasin.rotation.x = -Math.PI / 2;
    innerBasin.position.set(basinCx, -0.14, basinCz);
    this.group.add(innerBasin);

    // Stone Marina Quay Coping Framing Port Hercule Inner Basin
    const quayMat = new THREE.MeshStandardMaterial({ color: 0xd8dee8, roughness: 0.55 });
    const qNorth = new THREE.Mesh(new THREE.BoxGeometry(basinW + 4, 0.85, 2.6), quayMat);
    qNorth.position.set(basinCx, 0.08, basinCz - basinD * 0.5);
    const qSouth = new THREE.Mesh(new THREE.BoxGeometry(basinW + 4, 0.85, 2.6), quayMat);
    qSouth.position.set(basinCx, 0.08, basinCz + basinD * 0.5);
    const qWest = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.85, basinD), quayMat);
    qWest.position.set(basinCx - basinW * 0.5, 0.08, basinCz);
    const qEast = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.85, basinD), quayMat);
    qEast.position.set(basinCx + basinW * 0.5, 0.08, basinCz);
    this.group.add(qNorth, qSouth, qWest, qEast);

    // Floating White Timber/Concrete Yacht Pontoons & Moored 3D Luxury Superyachts!
    const pontoonMat = new THREE.MeshStandardMaterial({ color: 0xeef3f9, roughness: 0.45 });
    const placeSuperyacht = (x, z, yaw, scale = 1.25) => {
      const yg = new THREE.Group();
      if (this.assets?.templates?.yacht) {
        const yClone = this.assets.templates.yacht.clone(true);
        yClone.scale.setScalar(scale);
        yg.add(yClone);
      } else {
        const hull = new THREE.Mesh(
          new THREE.BoxGeometry(6.8 * scale, 4.2 * scale, 26 * scale),
          new THREE.MeshStandardMaterial({ color: 0xf8fbff, roughness: 0.18, metalness: 0.2 })
        );
        hull.position.y = 2.0 * scale;
        yg.add(hull);
      }
      // Warm illuminated salon deck ribbon + underwater turquoise transom LED glow!
      const salonGlow = new THREE.Mesh(
        new THREE.BoxGeometry(4.4 * scale, 0.55 * scale, 14 * scale),
        new THREE.MeshBasicMaterial({ color: 0xffe6a3 })
      );
      salonGlow.position.set(0, 3.8 * scale, 1.5 * scale);
      const radarMast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.22, 4.5 * scale, 8),
        pontoonMat
      );
      radarMast.position.set(0, 8.5 * scale, 1.0 * scale);
      yg.add(salonGlow, radarMast);

      yg.position.set(x, -0.12, z);
      yg.rotation.y = yaw;
      this.group.add(yg);
    };

    // 5 Superyachts moored in Port Hercule Inner Basin (visible across Paddock & Showroom!)
    for (let i = 0; i < 5; i++) {
      const px = -125 + i * 72;
      const pier = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, 52), pontoonMat);
      pier.position.set(px - 12, 0.02, 86);
      this.group.add(pier);
      placeSuperyacht(px, 108 + (i % 2) * 28, Math.PI * 0.5 + (i % 2 === 0 ? 0.08 : -0.08), 1.18 + (i % 3) * 0.16);
    }

    // 8 Mega-Yachts moored along Outer Mediterranean Harbor beside Nouvelle Chicane & Tunnel Exit!
    for (let i = 0; i < 8; i++) {
      const yx = -360 + i * 86;
      if (i % 2 === 0) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.38, 68), pontoonMat);
        pier.position.set(yx - 14, 0.02, 508);
        this.group.add(pier);
      }
      placeSuperyacht(yx, 514 + (i % 2) * 44, 0.22 + (i % 3) * 0.18, 1.28 + (i % 3) * 0.22);
    }

    // 3. Illuminated Seafront Tunnel (s = 430..565) with Entrance/Exit Portals & Ceiling LED Strips
    const [tStart, tEnd] = this.trackDef.tunnelRangeS;
    const tunnelWallMat = new THREE.MeshStandardMaterial({
      color: 0x566173,
      roughness: 0.58,
      metalness: 0.12,
      emissive: new THREE.Color(0x1e2430),
      emissiveIntensity: 0.32,
      side: THREE.DoubleSide,
    });
    const lightStripMat = new THREE.MeshBasicMaterial({ color: 0xffe094 });
    const reflectorMat = new THREE.MeshBasicMaterial({ color: 0xff9100 });

    for (let s = tStart; s <= tEnd; s += 3.5) {
      const fr = this.sampleAt(s, 0);
      const yaw = Math.atan2(fr.tangent.z, fr.tangent.x);
      const arch = new THREE.Group();
      arch.position.copy(fr.pos);
      arch.rotation.y = -yaw;

      const spanHalf = ROAD_HALF_WIDTH + 6.45;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.95, spanHalf * 2), tunnelWallMat);
      roof.position.y = 7.5;
      roof.castShadow = true;

      const innerWall = new THREE.Mesh(new THREE.BoxGeometry(8.4, 7.6, 0.95), tunnelWallMat);
      innerWall.position.set(0, 3.8, -spanHalf);

      // Twin continuous ceiling LED light strips
      const ledL = new THREE.Mesh(new THREE.BoxGeometry(8.45, 0.20, 0.62), lightStripMat);
      ledL.position.set(0, 6.96, -4.1);
      const ledR = new THREE.Mesh(new THREE.BoxGeometry(8.45, 0.20, 0.62), lightStripMat);
      ledR.position.set(0, 6.96, 4.1);

      arch.add(roof, innerWall, ledL, ledR);

      // Seaward open colonnade pillars + amber wall safety reflectors
      if (Math.round(s * 2) % 14 === 0) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(2.35, 7.6, 1.05), tunnelWallMat);
        col.position.set(0, 3.8, spanHalf);
        col.castShadow = true;
        const refl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.18), reflectorMat);
        refl.position.set(0, 1.35, -(spanHalf - 0.55));
        arch.add(col, refl);
      }
      this.group.add(arch);
    }

    // Tunnel Entrance & Exit Architectural Fascia Portals ("TUNNEL LOUIS II • MONTE CARLO")
    const portalTex = this._makeMotorsportBanner(
      'TUNNEL LOUIS II',
      'PRINCIPAUTÉ DE MONACO • MONTE CARLO',
      '#d91e2a',
      '#8f0d16',
      '#ffffff',
      '#ffd600',
      'MC',
      1024,
      160
    );
    const portalMat = new THREE.MeshStandardMaterial({
      map: portalTex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: portalTex,
      emissiveIntensity: 0.28,
      roughness: 0.3,
    });
    for (const ps of [tStart, tEnd]) {
      const pf = this.sampleAt(ps, 0);
      const pyaw = Math.atan2(pf.tangent.z, pf.tangent.x);
      const portal = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 2.4, (ROAD_HALF_WIDTH + 6.6) * 2),
        [portalMat, portalMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat]
      );
      portal.position.copy(pf.pos).add(new THREE.Vector3(0, 8.65, 0));
      portal.rotation.y = -pyaw;
      this.group.add(portal);
    }

    // 4. Warm Terracotta / Cream Riviera Hillside Apartments + Belle Époque Casino Rotunda!
    const facadePalette = ['#f6ead7', '#f0cfa8', '#f2d3c4', '#edf2f8', '#e5c49f'];
    const rivieraMats = facadePalette.map((stuccoHex, idx) => {
      const tex = this._makeRivieraFacadeTexture(stuccoHex, idx);
      return new THREE.MeshStandardMaterial({
        map: tex,
        emissive: new THREE.Color(0xffffff),
        emissiveMap: tex,
        emissiveIntensity: 0.22,
        roughness: 0.54,
        metalness: 0.08,
      });
    });
    const terracottaRoofMat = new THREE.MeshStandardMaterial({ color: 0xb84a32, roughness: 0.72 });
    const verdigrisDomeMat = new THREE.MeshStandardMaterial({ color: 0x3b8c7a, roughness: 0.38, metalness: 0.35 });

    const placeRivieraBuilding = (cx, cz, w, h, d, yaw, matIdx, baseY = 0) => {
      if (this._minDistToTrack(cx, cz) < Math.max(w, d) * 0.65 + ROAD_HALF_WIDTH + 10) return;
      const bldg = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        rivieraMats[matIdx % rivieraMats.length]
      );
      bldg.position.set(cx, baseY + h * 0.5, cz);
      bldg.rotation.y = yaw;
      bldg.castShadow = true;
      bldg.receiveShadow = true;
      this.group.add(bldg);

      const crown = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.64, 6.2, 4), terracottaRoofMat);
      crown.position.set(cx, baseY + h + 3.0, cz);
      crown.rotation.y = yaw + Math.PI * 0.25;
      this.group.add(crown);
    };

    // Terraced Riviera Backdrop right behind the Main Straight Grandstands (gorgeous in Showroom!)
    for (let i = 0; i < 12; i++) {
      const bx = -210 + i * 64;
      const bz = -78 - (i % 2) * 26;
      const bh = 38 + (i % 4) * 12;
      placeRivieraBuilding(bx, bz, 46, bh, 34, 0, i);
    }

    // Surrounding Monte Carlo Amphitheater Ring (leaving Mediterranean oceanfront z > 440 wide open!)
    for (let i = 0; i < 34; i++) {
      const ang = (Math.PI * 2 * i) / 34;
      if (Math.sin(ang) > 0.40) continue;
      const dist = 515 + (i % 3) * 78;
      const h = 38 + (i % 5) * 15;
      const cx = 160 + Math.cos(ang) * dist;
      const cz = 185 + Math.sin(ang) * dist;
      placeRivieraBuilding(cx, cz, 48, h, 38, -ang + Math.PI * 0.5, i);
    }

    // Iconic Belle Époque Casino de Monte-Carlo Twin-Domed Palace above Casino Square (s = 265)
    const casFr = this.sampleAt(265, -(ROAD_HALF_WIDTH + 38));
    if (this._minDistToTrack(casFr.pos.x, casFr.pos.z) > 28) {
      const casino = new THREE.Group();
      casino.position.set(casFr.pos.x, casFr.pos.y, casFr.pos.z);
      casino.rotation.y = -Math.atan2(casFr.tangent.z, casFr.tangent.x);
      const mainHall = new THREE.Mesh(new THREE.BoxGeometry(54, 24, 30), rivieraMats[0]);
      mainHall.position.y = 12;
      mainHall.castShadow = true;
      casino.add(mainHall);
      for (const dx of [-18, 0, 18]) {
        const domeR = dx === 0 ? 9.5 : 6.8;
        const dome = new THREE.Mesh(new THREE.SphereGeometry(domeR, 20, 14), verdigrisDomeMat);
        dome.position.set(dx, 24.5, 0);
        casino.add(dome);
      }
      this.group.add(casino);
    }

    this._scatterPalmTrees(155);
  }

  _makeMediterraneanWaterTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0884b8';
    ctx.fillRect(0, 0, 256, 256);

    for (let y = 0; y < 256; y += 4) {
      for (let x = 0; x < 256; x += 4) {
        const w1 = Math.sin((x / 256) * Math.PI * 6 + Math.sin((y / 256) * Math.PI * 4) * 1.5);
        const w2 = Math.cos((y / 256) * Math.PI * 8 + (x / 256) * Math.PI * 2);
        const glint = (w1 + w2) * 0.5;
        if (glint > 0.35) {
          ctx.fillStyle = glint > 0.72 ? 'rgba(210, 252, 255, 0.55)' : 'rgba(56, 212, 245, 0.35)';
          ctx.fillRect(x, y, 5, 3);
        } else if (glint < -0.4) {
          ctx.fillStyle = 'rgba(2, 64, 98, 0.35)';
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(36, 24);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _makeRivieraFacadeTexture(stuccoHex, seed = 0) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = stuccoHex;
    ctx.fillRect(0, 0, 256, 512);

    // Classical stone cornice bands + warm Riviera balconies, louvered shutters & striped awnings
    for (let fl = 0; fl < 8; fl++) {
      const y = fl * 64;
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(0, y + 52, 256, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, y + 47, 256, 5);

      // Wrought-iron balcony railing verticals
      ctx.fillStyle = '#2d3748';
      ctx.fillRect(6, y + 38, 244, 2);
      for (let rx = 10; rx < 248; rx += 8) {
        ctx.fillRect(rx, y + 38, 2, 10);
      }

      for (let col = 0; col < 4; col++) {
        const x = 14 + col * 60;
        // French louvered shutters
        ctx.fillStyle = seed % 2 === 0 ? '#4e7385' : '#4d6b57';
        ctx.fillRect(x - 5, y + 10, 42, 37);
        // Warm illuminated or sunlit glass panes (zero pitch-black holes!)
        const h = fastHash2D(col, fl, seed + 17);
        ctx.fillStyle = h > 0.42 ? '#ffe59e' : '#4a6b8a';
        ctx.fillRect(x + 3, y + 12, 26, 35);

        // Ground & 1st floor Monaco red/white striped sun awnings
        if (fl >= 6 || (fl + col) % 4 === 0) {
          ctx.fillStyle = '#d91e2a';
          ctx.fillRect(x - 4, y + 8, 40, 8);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + 4, y + 8, 8, 8);
          ctx.fillRect(x + 20, y + 8, 8, 8);
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _makeVegasSkyscraperTexture(accentHex, seed = 0) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 1024;
    const ctx = c.getContext('2d');

    // Deep sapphire glass curtain-wall reflection gradient (NEVER pitch-black!)
    const bgGrad = ctx.createLinearGradient(0, 0, 512, 1024);
    bgGrad.addColorStop(0.0, '#101d38');
    bgGrad.addColorStop(0.5, '#16284c');
    bgGrad.addColorStop(1.0, '#221b47');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 512, 1024);

    const accentStr = `#${accentHex.toString(16).padStart(6, '0')}`;
    for (let row = 0; row < 48; row++) {
      const y = row * 20 + 28;
      if (y > 980) break;
      const floorBand = (row % 12 === 0);
      for (let col = 0; col < 20; col++) {
        const x = col * 25 + 8;
        const r = fastHash2D(col, row, seed * 37 + 101);
        if (floorBand) {
          ctx.fillStyle = accentStr;
          ctx.fillRect(x, y + 3, 20, 10);
        } else if (r > 0.24) {
          // 76% lit luxury hotel rooms: warm champagne gold, cyan glass, magenta suites
          ctx.fillStyle = r > 0.86 ? accentStr : (r > 0.48 ? '#ffe7a0' : '#7ae2ff');
          ctx.fillRect(x, y + 2, 19, 13);
        } else {
          // Moonlit reflective glass pane (never unlit black!)
          ctx.fillStyle = '#243b66';
          ctx.fillRect(x, y + 2, 19, 13);
        }
      }
    }

    // Metallic curtain-wall mullions + bright street-level illuminated casino atrium band at bottom!
    ctx.fillStyle = accentStr;
    ctx.fillRect(0, 0, 512, 22);
    ctx.fillRect(0, 984, 512, 40);
    ctx.fillStyle = '#fff5cc';
    for (let ax = 12; ax < 500; ax += 32) {
      ctx.fillRect(ax, 990, 22, 28);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildVegasBiome() {
    // 1. Giant Animated Geodesic LED Sphere Landmark + Outer Neon Halo & Plaza Ring!
    const sphereCanvas = document.createElement('canvas');
    sphereCanvas.width = 1024;
    sphereCanvas.height = 512;
    const sctx = sphereCanvas.getContext('2d');

    const sGrad = sctx.createLinearGradient(0, 0, 1024, 512);
    sGrad.addColorStop(0.00, '#ff007f');
    sGrad.addColorStop(0.32, '#7a00ff');
    sGrad.addColorStop(0.66, '#00c8ff');
    sGrad.addColorStop(1.00, '#ff1493');
    sctx.fillStyle = sGrad;
    sctx.fillRect(0, 0, 1024, 512);

    // Glowing plasma equator waves & F1 pulse bands
    for (let band = 0; band < 5; band++) {
      sctx.strokeStyle = band % 2 === 0 ? '#ffd600' : '#00ffcc';
      sctx.lineWidth = 8;
      sctx.beginPath();
      for (let x = 0; x <= 1024; x += 16) {
        const y = 110 + band * 72 + Math.sin((x / 1024) * Math.PI * 6 + band) * 26;
        if (x === 0) sctx.moveTo(x, y);
        else sctx.lineTo(x, y);
      }
      sctx.stroke();
    }

    // Crisp geodesic triangulated exoskeleton lattice
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    sctx.lineWidth = 2.5;
    for (let x = -512; x < 1536; x += 48) {
      sctx.beginPath(); sctx.moveTo(x, 0); sctx.lineTo(x + 256, 512); sctx.stroke();
      sctx.beginPath(); sctx.moveTo(x + 256, 0); sctx.lineTo(x, 512); sctx.stroke();
    }
    for (let y = 0; y < 512; y += 48) {
      sctx.beginPath(); sctx.moveTo(0, y); sctx.lineTo(1024, y); sctx.stroke();
    }

    const sphereTex = new THREE.CanvasTexture(sphereCanvas);
    sphereTex.wrapS = THREE.RepeatWrapping;
    sphereTex.wrapT = THREE.RepeatWrapping;
    sphereTex.colorSpace = THREE.SRGBColorSpace;

    const spherePos = new THREE.Vector3(648, 74, 218);
    const vegasSphere = new THREE.Mesh(
      new THREE.SphereGeometry(94, 48, 32),
      new THREE.MeshBasicMaterial({ map: sphereTex })
    );
    vegasSphere.position.copy(spherePos);
    this.group.add(vegasSphere);

    // Subtle additive atmospheric neon corona around the LED Sphere
    const sphereHalo = new THREE.Mesh(
      new THREE.SphereGeometry(102, 32, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff1493,
        transparent: true,
        opacity: 0.16,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    sphereHalo.position.copy(spherePos);
    this.group.add(sphereHalo);

    // Illuminated Sphere Arena Ground Ring
    const arenaRing = new THREE.Mesh(
      new THREE.TorusGeometry(98, 2.2, 12, 64),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    arenaRing.rotation.x = Math.PI / 2;
    arenaRing.position.set(spherePos.x, 1.8, spherePos.z);
    this.group.add(arenaRing);

    this.animatedProps.push((t) => {
      vegasSphere.rotation.y = t * 0.24;
      sphereTex.offset.x = (t * 0.035) % 1;
      sphereHalo.material.color.setHSL(((t * 0.08) % 1), 1.0, 0.58);
    });

    // 2. Iconic Neon Strip Boulevard Portal Arches + Diamond "WELCOME TO LAS VEGAS GP" Landmark!
    const buildNeonStripArch = (sStation, headline, subline) => {
      const fr = this.sampleAt(sStation, 0);
      const yaw = Math.atan2(fr.tangent.z, fr.tangent.x);
      const span = ROAD_HALF_WIDTH + 6.8;
      const archG = new THREE.Group();
      archG.position.copy(fr.pos);
      archG.rotation.y = -yaw;

      const pinkTube = new THREE.MeshBasicMaterial({ color: 0xff1493 });
      const cyanTube = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
      const goldTube = new THREE.MeshBasicMaterial({ color: 0xffd600 });

      for (const side of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(1.3, 10.5, 1.3), this.darkFrameMat);
        col.position.set(0, 5.25, side * span);
        const neonEdge = new THREE.Mesh(new THREE.BoxGeometry(1.42, 10.2, 0.28), pinkTube);
        neonEdge.position.set(0, 5.25, side * (span - 0.65));
        archG.add(col, neonEdge);
      }

      const signTex = this._makeMotorsportBanner(headline, subline, '#16082e', '#081838', '#00f0ff', '#ff1493', 'LV', 1024, 192);
      const signMat = new THREE.MeshStandardMaterial({
        map: signTex,
        emissive: new THREE.Color(0xffffff),
        emissiveMap: signTex,
        emissiveIntensity: 0.82,
        roughness: 0.2,
      });
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 2.5, span * 2.04),
        [signMat, signMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat]
      );
      beam.position.set(0, 9.4, 0);
      archG.add(beam);

      // Glowing neon crown tubes + diamond starburst crest on top
      const topNeon = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, span * 2.08), cyanTube);
      topNeon.position.set(0, 10.8, 0);
      const botNeon = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, span * 2.08), pinkTube);
      botNeon.position.set(0, 8.0, 0);
      const diamond = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.8, 2.8), goldTube);
      diamond.rotation.x = Math.PI / 4;
      diamond.position.set(0, 12.2, 0);
      archG.add(topNeon, botNeon, diamond);

      this.group.add(archG);
    };

    buildNeonStripArch(112, 'FABULOUS LAS VEGAS', 'NEON STRIP NIGHT GRAND PRIX');
    buildNeonStripArch(608, 'CASINO BOULEVARD', 'RACE PHANATIC WORLD TOUR');

    // Classic Diamond Vegas Neon Welcome Sign near Start/Showroom (-116, 0, -18) so Showroom sparkles!
    const welcomeGroup = new THREE.Group();
    welcomeGroup.position.set(-116, 0, -(ROAD_HALF_WIDTH + 9.2));
    welcomeGroup.rotation.y = 0.35;
    for (const pz of [-1.4, 1.4]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 9.5, 10), this.armcoMat);
      p.position.set(0, 4.75, pz);
      welcomeGroup.add(p);
    }
    const wTex = this._makeMotorsportBanner('WELCOME TO VEGAS', 'FABULOUS F1 NIGHT STRIP', '#ff1493', '#28064d', '#ffd600', '#00f0ff', '77', 512, 256);
    const wMat = new THREE.MeshStandardMaterial({
      map: wTex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: wTex,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });
    const wBoard = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 4.2, 8.2),
      [wMat, wMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat]
    );
    wBoard.position.set(0, 6.8, 0);
    welcomeGroup.add(wBoard);
    this.group.add(welcomeGroup);

    // 3. Illuminated High-Rise Glass Curtain-Wall Casino Resort Towers (ZERO Pitch-Black Boxes!)
    const neonColors = [0xff1493, 0x00f0ff, 0xffd600, 0xb517ff, 0x00ff9d];
    const casinoNames = ['BELLAGIO GP', 'MIRAGE NEON', 'APEX PALACE', 'FLAMINGO STRIP', 'ROYALE CASINO'];
    const towerMats = neonColors.map((nc, idx) => {
      const winTex = this._makeVegasSkyscraperTexture(nc, idx + 1);
      return new THREE.MeshStandardMaterial({
        map: winTex,
        emissive: new THREE.Color(0xffffff),
        emissiveMap: winTex,
        emissiveIntensity: 0.96,
        metalness: 0.72,
        roughness: 0.16,
      });
    });

    const crownSignMats = casinoNames.map((nm, idx) => {
      const hex = `#${neonColors[idx].toString(16).padStart(6, '0')}`;
      const ct = this._makeMotorsportBanner(nm, 'RESORT & CASINO', '#0b0e1f', '#1a0b2e', hex, '#ffd600', 'LV', 512, 128);
      return new THREE.MeshBasicMaterial({ map: ct });
    });

    const placeCasinoTower = (cx, cz, w, h, d, idx) => {
      if (this._minDistToTrack(cx, cz) < Math.max(w, d) * 0.68 + ROAD_HALF_WIDTH + 12) return;

      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), towerMats[idx % towerMats.length]);
      tower.position.set(cx, h * 0.5, cz);
      this.group.add(tower);

      // Illuminated street-level resort marquee podium canopy (eliminates dark building bases!)
      const podium = new THREE.Mesh(
        new THREE.BoxGeometry(w + 8, 6.5, d + 8),
        towerMats[(idx + 1) % towerMats.length]
      );
      podium.position.set(cx, 3.25, cz);
      this.group.add(podium);

      const podiumRim = new THREE.Mesh(
        new THREE.BoxGeometry(w + 9.2, 0.75, d + 9.2),
        new THREE.MeshBasicMaterial({ color: neonColors[(idx + 1) % neonColors.length] })
      );
      podiumRim.position.set(cx, 6.65, cz);
      this.group.add(podiumRim);

      // Rooftop neon crown cornice + vertical corner neon fins + resort sign
      const neonTrim = new THREE.Mesh(
        new THREE.BoxGeometry(w + 1.4, 3.2, d + 1.4),
        new THREE.MeshBasicMaterial({ color: neonColors[idx % neonColors.length] })
      );
      neonTrim.position.set(cx, h - 2.2, cz);
      this.group.add(neonTrim);

      const vertNeon = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, h * 0.92, d + 1.3),
        new THREE.MeshBasicMaterial({ color: neonColors[(idx + 2) % neonColors.length] })
      );
      vertNeon.position.set(cx, h * 0.48, cz);
      this.group.add(vertNeon);

      const crownSign = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.82, 5.8, d * 0.82),
        crownSignMats[idx % crownSignMats.length]
      );
      crownSign.position.set(cx, h + 2.9, cz);
      this.group.add(crownSign);
    };

    // Close-up Las Vegas Strip Boulevard Resort Corridor flanking Main Straight & Showroom!
    for (let i = 0; i < 9; i++) {
      const bx = -205 + i * 86;
      placeCasinoTower(bx, -92 - (i % 2) * 24, 42, 92 + (i % 4) * 28, 38, i);
      placeCasinoTower(bx + 32, 88 + (i % 2) * 26, 40, 86 + ((i + 2) % 4) * 26, 36, i + 2);
    }

    // Outer Las Vegas Skyline Ring around the entire circuit
    for (let i = 0; i < 36; i++) {
      const ang = (Math.PI * 2 * i) / 36;
      const dist = 565 + (i % 4) * 95;
      const h = 95 + (i % 6) * 32;
      const w = 46 + (i % 3) * 14;
      const cx = 210 + Math.cos(ang) * dist;
      const cz = 240 + Math.sin(ang) * dist;
      placeCasinoTower(cx, cz, w, h, w, i);
    }

    // 4. Overhead F1 Night Floodlight Rigs every 36 game-meters
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x9aa8bd, metalness: 0.78, roughness: 0.25 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xf4fcff });
    for (let s = 16; s < 984; s += 36) {
      const fr = this.sampleAt(s, -(ROAD_HALF_WIDTH + 6.6));
      const yaw = Math.atan2(fr.tangent.z, fr.tangent.x);
      const rig = new THREE.Group();
      rig.position.copy(fr.pos);
      rig.rotation.y = -yaw;

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 13.2, 8), poleMat);
      pole.position.set(0, 6.6, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 3.2), poleMat);
      arm.position.set(0, 13.0, 1.5);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.42, 2.8), bulbMat);
      head.position.set(0, 12.75, 2.4);
      rig.add(pole, arm, head);
      this.group.add(rig);
    }

    this._scatterPalmTrees(125);
  }

  _buildMonzaBiome() {
    // 1. Historic Monza High-Speed Concrete Banking ("Sopraelevata" 1955 Oval) on Concrete Trestle Piers!
    //    Sweeps outside the North / Rettifilo vista (z = -74..-110) so it's iconic in Showroom & down Rettifilo!
    const bankConcreteTex = this._makeVintageConcreteTexture();
    const bankMat = new THREE.MeshStandardMaterial({
      map: bankConcreteTex,
      roughness: 0.84,
      metalness: 0.05,
    });
    const whiteRailMat = new THREE.MeshStandardMaterial({ color: 0xf2f5fa, roughness: 0.45 });

    const bankGroup = new THREE.Group();
    const bankPos = [];
    const bankNorm = [];
    const bankUv = [];
    const bankIdx = [];
    const segs = 44;

    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      // Gentle sweeping curve from x = -340 to x = +720 behind the Main Straight grandstands
      const bx = -340 + u * 1060;
      const curveBow = Math.pow(Math.abs(u - 0.45) * 2.0, 2.2) * 48;
      const bz = -78 - curveBow;
      // Classic 30-degree concave Monza banking cross-section: low inner edge -> steep high outer rim!
      const pLow = new THREE.Vector3(bx, 4.5, bz + 8.5);
      const pHigh = new THREE.Vector3(bx, 14.8, bz - 9.5);

      bankPos.push(pLow.x, pLow.y, pLow.z, pHigh.x, pHigh.y, pHigh.z);
      bankNorm.push(0, 0.85, 0.52, 0, 0.62, 0.78);
      bankUv.push(0, u * 28, 1, u * 28);

      if (i < segs) {
        const b = i * 2;
        bankIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }

      // Concrete trestle support piers beneath the Sopraelevata banking every 2nd segment
      if (i % 2 === 0) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(2.4, 14.2, 16.5), this.concreteMat);
        pier.position.set(bx, 7.1, bz - 0.5);
        bankGroup.add(pier);

        const railPost = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.45), whiteRailMat);
        railPost.position.set(bx, 15.4, bz - 9.5);
        bankGroup.add(railPost);
      }
    }

    const bankGeo = new THREE.BufferGeometry();
    bankGeo.setAttribute('position', new THREE.Float32BufferAttribute(bankPos, 3));
    bankGeo.setAttribute('normal', new THREE.Float32BufferAttribute(bankNorm, 3));
    bankGeo.setAttribute('uv', new THREE.Float32BufferAttribute(bankUv, 2));
    bankGeo.setIndex(bankIdx);
    bankGeo.computeVertexNormals();
    const bankMesh = new THREE.Mesh(bankGeo, bankMat);
    bankMesh.material.side = THREE.DoubleSide;
    bankMesh.castShadow = true;
    bankMesh.receiveShadow = true;
    bankGroup.add(bankMesh);
    this.group.add(bankGroup);

    // 2. Historic Serraglio Red-Brick & Limestone Arch Overpass Bridge at s = 500
    const brFrame = this.sampleAt(500, 0);
    const yaw = Math.atan2(brFrame.tangent.z, brFrame.tangent.x);
    const brickMat = new THREE.MeshStandardMaterial({ color: 0x9c3828, roughness: 0.78 });
    const stoneTrimMat = new THREE.MeshStandardMaterial({ color: 0xe6dfd3, roughness: 0.62 });

    const bridge = new THREE.Group();
    bridge.position.copy(brFrame.pos);
    bridge.rotation.y = -yaw;
    const span = ROAD_HALF_WIDTH + 7.4;

    for (const side of [-1, 1]) {
      const abutment = new THREE.Mesh(new THREE.BoxGeometry(9.4, 9.6, 4.8), brickMat);
      abutment.position.set(0, 4.8, side * span);
      abutment.castShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.65, 5.2), stoneTrimMat);
      cap.position.set(0, 9.65, side * span);
      bridge.add(abutment, cap);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(8.8, 2.4, (span + 2.2) * 2), brickMat);
    deck.position.y = 9.5;
    deck.castShadow = true;
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(9.1, 0.55, (span + 2.4) * 2), stoneTrimMat);
    parapet.position.y = 10.9;
    bridge.add(deck, parapet);

    const monzaBrTex = this._makeMotorsportBanner(
      'TEMPIO DELLA VELOCITÀ',
      'AUTODROMO NAZIONALE MONZA • 1922',
      '#009246',
      '#006830',
      '#ffffff',
      '#ce2b37',
      'IT',
      1024,
      160
    );
    const monzaBrMat = new THREE.MeshStandardMaterial({ map: monzaBrTex, roughness: 0.32 });
    const brBanner = new THREE.Mesh(
      new THREE.BoxGeometry(9.05, 1.65, ROAD_HALF_WIDTH * 1.85),
      [monzaBrMat, monzaBrMat, stoneTrimMat, stoneTrimMat, stoneTrimMat, stoneTrimMat]
    );
    brBanner.position.y = 9.55;
    bridge.add(brBanner);
    this.group.add(bridge);

    // 3. Waving Italian Tricolor & Scarlet Tifosi Flagpoles along Main Straight & Parabolica!
    const tricolorTex = this._makeItalianTricolorFlagTexture();
    const flagMat = new THREE.MeshStandardMaterial({
      map: tricolorTex,
      roughness: 0.45,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: tricolorTex,
      emissiveIntensity: 0.18,
    });
    const flagMeshes = [];
    for (let i = 0; i < 18; i++) {
      const sPos = i < 10 ? (965 + i * 16) % 1000 : 795 + (i - 10) * 14;
      const fr = this.sampleAt(sPos, -(ROAD_HALF_WIDTH + 9.8));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 8.8, 8), this.armcoMat);
      pole.position.copy(fr.pos).add(new THREE.Vector3(0, 4.4, 0));
      const flg = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.9), flagMat);
      flg.position.copy(fr.pos).add(new THREE.Vector3(1.6, 7.7, 0));
      this.group.add(pole, flg);
      flagMeshes.push(flg);
    }
    this.animatedProps.push((t) => {
      for (let i = 0; i < flagMeshes.length; i++) {
        flagMeshes[i].rotation.y = Math.sin(t * 4.5 + i * 0.8) * 0.26;
      }
    });

    // 4. Dense Royal Park of Monza Autumn Gold/Crimson/Emerald Canopy + Stately Italian Cypress Avenues
    this._scatterForestTrees({
      count: 460,
      foliageColors: [0xd97706, 0xeab308, 0xdc2626, 0xb45309, 0x246334, 0x1b4d28],
      spruceRatio: 0.36,
      blossomPetals: false,
    });
  }

  _makeVintageConcreteTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#aeb6c2';
    ctx.fillRect(0, 0, 256, 256);

    // Concrete slab expansion joints + weathered banking tire patina
    ctx.fillStyle = 'rgba(30, 36, 46, 0.26)';
    ctx.fillRect(72, 0, 84, 256);
    ctx.strokeStyle = 'rgba(40, 46, 56, 0.45)';
    ctx.lineWidth = 3;
    for (let y = 0; y < 256; y += 64) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
    }
    for (let i = 0; i < 2000; i++) {
      ctx.fillStyle = (i & 1) === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(fastHash2D(i, 1, 303) * 254, fastHash2D(i, 2, 303) * 254, 2, 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _makeItalianTricolorFlagTexture() {
    const c = document.createElement('canvas');
    c.width = 192;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#009246';
    ctx.fillRect(0, 0, 64, 128);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(64, 0, 64, 128);
    ctx.fillStyle = '#ce2b37';
    ctx.fillRect(128, 0, 64, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _makeBritishGPFlagTexture() {
    const c = document.createElement('canvas');
    c.width = 192;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#00247d';
    ctx.fillRect(0, 0, 192, 128);

    // Crisp Union diagonal saltires + St George cross
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(192, 128);
    ctx.moveTo(192, 0); ctx.lineTo(0, 128);
    ctx.stroke();

    ctx.strokeStyle = '#cf142b';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(192, 128);
    ctx.moveTo(192, 0); ctx.lineTo(0, 128);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 44, 192, 40);
    ctx.fillRect(76, 0, 40, 128);

    ctx.fillStyle = '#cf142b';
    ctx.fillRect(0, 52, 192, 24);
    ctx.fillRect(84, 0, 24, 128);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildSuzukaBiome() {
    // 1. Structural 3D Figure-8 Overpass Box-Girder Deck, Flank Bridge Piers & Fascia Banner!
    const girderMat = new THREE.MeshStandardMaterial({ color: 0xd4dde8, roughness: 0.48, metalness: 0.28 });
    const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x263244, roughness: 0.36, metalness: 0.68 });
    const lowerSamples = this.samples.filter((smp) => smp.pos.y < 3.8);

    const deckMatrices = [];
    const railMatrices = [];
    const dummy = new THREE.Object3D();
    let peakSample = this.samples[0];

    for (let i = 0; i < SAMPLES; i += 2) {
      const smp = this.samples[i];
      if (smp.pos.y > peakSample.pos.y) peakSample = smp;
      if (smp.pos.y < 2.2) continue;

      const yaw = Math.atan2(smp.tangent.z, smp.tangent.x);
      dummy.position.set(smp.pos.x, smp.pos.y - 0.86, smp.pos.z);
      dummy.rotation.set(0, -yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      deckMatrices.push(dummy.matrix.clone());

      for (const side of [-1, 1]) {
        const pEdge = smp.pos.clone().addScaledVector(smp.right, side * (ROAD_HALF_WIDTH + 6.35));
        dummy.position.set(pEdge.x, pEdge.y + 0.68, pEdge.z);
        dummy.rotation.set(0, -yaw, 0);
        dummy.updateMatrix();
        railMatrices.push(dummy.matrix.clone());
      }

      // Grounded concrete bridge piers every 16 samples ONLY where clear of lower underpass road!
      if (i % 16 === 0 && smp.pos.y > 4.2) {
        for (const side of [-1, 1]) {
          const pierPos = smp.pos.clone().addScaledVector(smp.right, side * (ROAD_HALF_WIDTH + 4.8));
          let clearOfUnderpass = true;
          for (let k = 0; k < lowerSamples.length; k += 3) {
            const lp = lowerSamples[k].pos;
            const dx = pierPos.x - lp.x;
            const dz = pierPos.z - lp.z;
            if (dx * dx + dz * dz < (ROAD_HALF_WIDTH + 8.2) * (ROAD_HALF_WIDTH + 8.2)) {
              clearOfUnderpass = false;
              break;
            }
          }
          if (clearOfUnderpass) {
            const h = smp.pos.y - 1.2;
            const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 1.12, h, 12), this.concreteMat);
            pier.position.set(pierPos.x, h * 0.5, pierPos.z);
            pier.castShadow = true;
            this.group.add(pier);
          }
        }
      }
    }

    if (deckMatrices.length) {
      const deckGeo = new THREE.BoxGeometry(5.2, 1.55, (ROAD_HALF_WIDTH + 6.55) * 2);
      const deckInst = new THREE.InstancedMesh(deckGeo, girderMat, deckMatrices.length);
      deckMatrices.forEach((m, k) => deckInst.setMatrixAt(k, m));
      deckInst.instanceMatrix.needsUpdate = true;
      deckInst.castShadow = true;
      deckInst.receiveShadow = true;
      this.group.add(deckInst);
    }

    if (railMatrices.length) {
      const railGeo = new THREE.BoxGeometry(5.2, 1.35, 0.42);
      const railInst = new THREE.InstancedMesh(railGeo, darkSteelMat, railMatrices.length);
      railMatrices.forEach((m, k) => railInst.setMatrixAt(k, m));
      railInst.instanceMatrix.needsUpdate = true;
      this.group.add(railInst);
    }

    // Iconic Overpass Bridge Fascia Signboard directly above the Figure-8 Crossover!
    if (peakSample && peakSample.pos.y > 8.0) {
      const overTex = this._makeMotorsportBanner(
        'SUZUKA CIRCUIT',
        'FIGURE-8 OVERPASS • 130R APPROACH',
        '#e60026',
        '#111827',
        '#ffffff',
        '#ffd600',
        'JP',
        1024,
        160
      );
      const overMat = new THREE.MeshStandardMaterial({
        map: overTex,
        roughness: 0.28,
        emissive: new THREE.Color(0xffffff),
        emissiveMap: overTex,
        emissiveIntensity: 0.24,
      });
      const pyaw = Math.atan2(peakSample.tangent.z, peakSample.tangent.x);
      const fasciaBeam = new THREE.Mesh(
        new THREE.BoxGeometry(22.0, 2.05, (ROAD_HALF_WIDTH + 6.85) * 2),
        [this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, overMat, overMat]
      );
      fasciaBeam.position.set(peakSample.pos.x, peakSample.pos.y - 0.65, peakSample.pos.z);
      fasciaBeam.rotation.y = -pyaw;
      this.group.add(fasciaBeam);
    }

    // 2. Iconic Giant Rotating Illuminated Suzuka Circuit Ferris Wheel (96m tall!)
    const ferrisRoot = new THREE.Group();
    ferrisRoot.position.set(-195, 0, 175);
    ferrisRoot.rotation.y = 0.42;

    const whiteSteelMat = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, metalness: 0.48, roughness: 0.26 });
    const ledEmeraldMat = new THREE.MeshBasicMaterial({ color: 0x00ff9d });
    const ledGoldMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    const hubY = 52.0;
    const wheelR = 44.0;

    // Twin Heavy A-Frame Steel Support Towers anchored on concrete plinths
    for (const zSide of [-5.2, 5.2]) {
      for (const xSpread of [-22.0, 22.0]) {
        const legLen = Math.hypot(xSpread, hubY);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.15, legLen, 10), whiteSteelMat);
        leg.position.set(xSpread * 0.5, hubY * 0.5, zSide);
        leg.rotation.z = xSpread > 0 ? 0.40 : -0.40;
        leg.castShadow = true;
        ferrisRoot.add(leg);

        const pad = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.6, 4.6), this.concreteMat);
        pad.position.set(xSpread, 0.8, zSide);
        ferrisRoot.add(pad);
      }
    }

    const axle = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 13.5, 16), whiteSteelMat);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(0, hubY, 0);
    ferrisRoot.add(axle);

    const wheelRotor = new THREE.Group();
    wheelRotor.position.set(0, hubY, 0);
    ferrisRoot.add(wheelRotor);

    for (const zRim of [-2.8, 2.8]) {
      const outerRim = new THREE.Mesh(new THREE.TorusGeometry(wheelR, 0.68, 10, 48), whiteSteelMat);
      outerRim.position.z = zRim;
      const innerRim = new THREE.Mesh(new THREE.TorusGeometry(wheelR * 0.72, 0.42, 8, 48), whiteSteelMat);
      innerRim.position.z = zRim;
      wheelRotor.add(outerRim, innerRim);
    }

    const neonRingOuter = new THREE.Mesh(new THREE.TorusGeometry(wheelR - 0.9, 0.34, 8, 48), ledEmeraldMat);
    const neonRingInner = new THREE.Mesh(new THREE.TorusGeometry(wheelR * 0.46, 0.30, 8, 36), ledGoldMat);
    wheelRotor.add(neonRingOuter, neonRingInner);

    const gondolaColors = [0xe60026, 0x00b0ff, 0xffb300, 0x00e676, 0xff4081, 0xffffff];
    const gondolaMats = gondolaColors.map(
      (hex) => new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.28,
        metalness: 0.2,
        emissive: new THREE.Color(hex),
        emissiveIntensity: 0.22,
      })
    );
    const cabinWinMat = new THREE.MeshBasicMaterial({ color: 0xfff5cc });
    const gondolaPivots = [];

    for (let i = 0; i < 16; i++) {
      const ang = (Math.PI * 2 * i) / 16;
      // Twin radial spokes + illuminated LED light bar
      for (const zSpoke of [-2.6, 2.6]) {
        const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, wheelR, 6), whiteSteelMat);
        spoke.position.set(Math.cos(ang) * wheelR * 0.5, Math.sin(ang) * wheelR * 0.5, zSpoke);
        spoke.rotation.z = ang - Math.PI * 0.5;
        wheelRotor.add(spoke);
      }
      const ledRay = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, wheelR * 0.88, 0.26),
        i % 2 === 0 ? ledEmeraldMat : ledGoldMat
      );
      ledRay.position.set(Math.cos(ang) * wheelR * 0.46, Math.sin(ang) * wheelR * 0.46, 0);
      ledRay.rotation.z = ang - Math.PI * 0.5;
      wheelRotor.add(ledRay);

      // Gravity-stabilized 3D passenger gondola cabin at rim
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(ang) * wheelR, Math.sin(ang) * wheelR, 0);
      const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 2.2, 6), whiteSteelMat);
      hanger.position.y = -1.1;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.8, 2.6), gondolaMats[i % gondolaMats.length]);
      cabin.position.y = -2.6;
      const cabinGlass = new THREE.Mesh(new THREE.BoxGeometry(3.48, 1.05, 2.68), cabinWinMat);
      cabinGlass.position.y = -2.35;
      pivot.add(hanger, cabin, cabinGlass);
      wheelRotor.add(pivot);
      gondolaPivots.push(pivot);
    }

    this.group.add(ferrisRoot);
    this.animatedProps.push((t) => {
      const rot = t * 0.18;
      wheelRotor.rotation.z = rot;
      for (let i = 0; i < gondolaPivots.length; i++) {
        gondolaPivots[i].rotation.z = -rot;
      }
    });

    // 3. Waving Suzuka Crimson & White Circuit Flags along Main Straight & Esses
    const jpFlagMat = new THREE.MeshStandardMaterial({
      color: 0xe60026,
      roughness: 0.42,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0xe60026),
      emissiveIntensity: 0.16,
    });
    const flagClothG = new THREE.PlaneGeometry(3.0, 1.8);
    flagClothG.translate(1.5, 0, 0);
    const suzukaFlags = [];
    for (let i = 0; i < 18; i++) {
      const sPos = i < 9 ? (966 + i * 16) % 1000 : 210 + (i - 9) * 18;
      const fr = this.sampleAt(sPos, -(ROAD_HALF_WIDTH + 9.6));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 8.6, 8), this.armcoMat);
      pole.position.copy(fr.pos).add(new THREE.Vector3(0, 4.3, 0));
      const flg = new THREE.Mesh(flagClothG, jpFlagMat);
      flg.position.copy(fr.pos).add(new THREE.Vector3(0, 7.6, 0));
      this.group.add(pole, flg);
      suzukaFlags.push(flg);
    }
    this.animatedProps.push((t) => {
      for (let i = 0; i < suzukaFlags.length; i++) {
        suzukaFlags[i].rotation.y = Math.sin(t * 4.8 + i * 0.9) * 0.28;
      }
    });

    // 4. Multi-Cluster Japanese Momiji Crimson/Amber Autumn Maples & Cedar Pines
    this._scatterForestTrees({
      count: 410,
      foliageColors: [0xdc2626, 0xea580c, 0xf59e0b, 0x1e5631, 0x266b3c],
      spruceRatio: 0.38,
      blossomPetals: false,
    });
  }

  _buildSilverstoneBiome() {
    // 1. Iconic Futuristic "Silverstone Wing" Cantilevered Aerodynamic Paddock Blades!
    const wingGroup = new THREE.Group();
    const garZ = PIT_LANE_CONFIG.lateralOffset + 14.5;
    const silverBladeMat = new THREE.MeshStandardMaterial({
      color: 0xf2f6fc,
      metalness: 0.56,
      roughness: 0.22,
    });
    const unionBlueTrim = new THREE.MeshBasicMaterial({ color: 0x0038a8 });
    const unionRedTrim = new THREE.MeshBasicMaterial({ color: 0xce1126 });

    for (let i = 0; i < 4; i++) {
      const bx = -48 + i * 82;
      const by = 13.8 + i * 1.9;
      const blade = new THREE.Group();
      blade.position.set(bx, by, garZ - 1.5);
      blade.rotation.set(-0.09, 0, 0.125);

      const mainFin = new THREE.Mesh(new THREE.BoxGeometry(92, 0.78, 22.0), silverBladeMat);
      mainFin.castShadow = true;
      const leadingEdge = new THREE.Mesh(
        new THREE.BoxGeometry(92.4, 0.42, 0.85),
        i % 2 === 0 ? unionRedTrim : unionBlueTrim
      );
      leadingEdge.position.set(0, 0.12, -11.1);
      blade.add(mainFin, leadingEdge);

      // Angled tubular steel V-struts anchoring the cantilevered wing down to the Paddock roof
      for (const sx of [-26, 4, 34]) {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.30, 7.5, 8), this.darkFrameMat);
        strut.position.set(sx, -3.5, 1.2);
        strut.rotation.z = -0.24;
        blade.add(strut);
      }
      wingGroup.add(blade);
    }
    this.group.add(wingGroup);

    // 2. Historic WWII RAF Silverstone Airfield Control Tower & Curved Steel Hangar!
    const rafGroup = new THREE.Group();
    rafGroup.position.set(-168, 0, PIT_LANE_CONFIG.lateralOffset + 34);
    rafGroup.rotation.y = 0.25;

    const brickMat = new THREE.MeshStandardMaterial({ color: 0x9e4737, roughness: 0.78 });
    const whitewashMat = new THREE.MeshStandardMaterial({ color: 0xedf2f7, roughness: 0.48 });
    const cabGlassMat = new THREE.MeshStandardMaterial({
      color: 0x7be0d6,
      roughness: 0.15,
      metalness: 0.65,
      emissive: new THREE.Color(0x1f6e66),
      emissiveIntensity: 0.35,
    });

    const towerBase = new THREE.Mesh(new THREE.BoxGeometry(14.5, 9.2, 12.5), brickMat);
    towerBase.position.y = 4.6;
    towerBase.castShadow = true;
    const watchDeck = new THREE.Mesh(new THREE.BoxGeometry(16.2, 3.4, 14.2), whitewashMat);
    watchDeck.position.y = 10.8;
    const glassCab = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.6, 3.6, 8), cabGlassMat);
    glassCab.position.y = 14.3;
    const cabRoof = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 0.45, 8), this.darkFrameMat);
    cabRoof.position.y = 16.3;

    const radarSpin = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.48, 0.55), whitewashMat);
    radarSpin.position.y = 17.6;
    rafGroup.add(towerBase, watchDeck, glassCab, cabRoof, radarSpin);
    this.animatedProps.push((t) => {
      radarSpin.rotation.y = t * 1.8;
    });

    // Historic Curved Corrugated-Steel RAF Hangar beside Watch Tower
    const hangarMat = new THREE.MeshStandardMaterial({ color: 0x5c6878, metalness: 0.52, roughness: 0.44 });
    const hangarVault = new THREE.Mesh(
      new THREE.CylinderGeometry(14.5, 14.5, 44, 20, 1, false, 0, Math.PI),
      hangarMat
    );
    hangarVault.rotation.z = Math.PI / 2;
    hangarVault.rotation.y = Math.PI / 2;
    hangarVault.position.set(-32, 0.2, 4);
    hangarVault.castShadow = true;
    rafGroup.add(hangarVault);

    const rafBannerTex = this._makeMotorsportBanner(
      'SILVERSTONE 1948',
      'HOME OF BRITISH MOTORSPORT • RAF AIRFIELD',
      '#00247d',
      '#0a1938',
      '#ffffff',
      '#cf142b',
      'UK',
      1024,
      160
    );
    const rafBanner = new THREE.Mesh(
      new THREE.BoxGeometry(24, 2.4, 0.5),
      new THREE.MeshStandardMaterial({ map: rafBannerTex, roughness: 0.3 })
    );
    rafBanner.position.set(-32, 8.2, -18.2);
    rafGroup.add(rafBanner);
    this.group.add(rafGroup);

    // 3. Spinning Northamptonshire Horizon Wind Turbines (4 Sleek 76m 3-Bladed Turbines!)
    const turbineMat = new THREE.MeshStandardMaterial({ color: 0xf5f9ff, roughness: 0.26, metalness: 0.22 });
    const turbineSites = [
      [710, -155],
      [980, 415],
      [-185, 770],
      [-655, 385],
    ];
    const turbineRotors = [];
    for (let i = 0; i < turbineSites.length; i++) {
      const [tx, tz] = turbineSites[i];
      if (this._minDistToTrack(tx, tz) < 75) continue;
      const tg = new THREE.Group();
      tg.position.set(tx, 0, tz);
      tg.rotation.y = -0.55 + i * 0.4;

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 2.65, 76, 12), turbineMat);
      mast.position.y = 38;
      const nacelle = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.8, 8.6), turbineMat);
      nacelle.position.set(0, 76.5, 1.2);
      tg.add(mast, nacelle);

      const rotor = new THREE.Group();
      rotor.position.set(0, 76.5, 5.8);
      const hubCone = new THREE.Mesh(new THREE.ConeGeometry(1.65, 3.4, 12), turbineMat);
      hubCone.rotation.x = Math.PI / 2;
      rotor.add(hubCone);

      for (let b = 0; b < 3; b++) {
        const bAng = (Math.PI * 2 * b) / 3;
        const bladeHolder = new THREE.Group();
        bladeHolder.rotation.z = bAng;
        const blade = new THREE.Mesh(new THREE.ConeGeometry(1.35, 27.5, 6), turbineMat);
        blade.scale.set(0.55, 1.0, 0.18);
        blade.position.y = 13.8;
        bladeHolder.add(blade);
        rotor.add(bladeHolder);
      }
      tg.add(rotor);
      this.group.add(tg);
      turbineRotors.push({ rotor, phase: i * 1.2 });
    }
    this.animatedProps.push((t) => {
      for (let i = 0; i < turbineRotors.length; i++) {
        turbineRotors[i].rotor.rotation.z = -(t * 1.15 + turbineRotors[i].phase);
      }
    });

    // 4. Waving British GP Union Flags along Hamilton/Main Straight, Abbey & Maggotts-Becketts
    const ukTex = this._makeBritishGPFlagTexture();
    const ukFlagMat = new THREE.MeshStandardMaterial({
      map: ukTex,
      roughness: 0.44,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: ukTex,
      emissiveIntensity: 0.16,
    });
    const ukFlagGeo = new THREE.PlaneGeometry(3.2, 1.9);
    ukFlagGeo.translate(1.6, 0, 0);
    const ukFlags = [];
    for (let i = 0; i < 20; i++) {
      const sPos = i < 10 ? (964 + i * 16) % 1000 : 565 + (i - 10) * 14;
      const fr = this.sampleAt(sPos, -(ROAD_HALF_WIDTH + 9.8));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 8.8, 8), this.armcoMat);
      pole.position.copy(fr.pos).add(new THREE.Vector3(0, 4.4, 0));
      const flg = new THREE.Mesh(ukFlagGeo, ukFlagMat);
      flg.position.copy(fr.pos).add(new THREE.Vector3(0, 7.7, 0));
      this.group.add(pole, flg);
      ukFlags.push(flg);
    }
    this.animatedProps.push((t) => {
      for (let i = 0; i < ukFlags.length; i++) {
        ukFlags[i].rotation.y = Math.sin(t * 5.1 + i * 0.85) * 0.28;
      }
    });

    // 5. Lush Multi-Cluster English Countryside Oaks & Scots Pines
    this._scatterForestTrees({
      count: 390,
      foliageColors: [0x1f6332, 0x29753e, 0x358244, 0x184d27, 0x4d7c2b],
      spruceRatio: 0.30,
      blossomPetals: false,
    });
  }

  _scatterForestTrees({ count, foliageColors, spruceRatio, blossomPetals = false }) {
    // Organic Multi-Branch Forked Bark Trunk (grounded at y=0, zero lollipop stick!)
    const mainStem = new THREE.CylinderGeometry(0.28, 0.52, 4.1, 8);
    mainStem.translate(0, 2.05, 0);
    const limbL = new THREE.CylinderGeometry(0.13, 0.24, 2.3, 6);
    limbL.rotateZ(0.56);
    limbL.rotateX(0.18);
    limbL.translate(-0.62, 3.85, 0.18);
    const limbR = new THREE.CylinderGeometry(0.12, 0.22, 2.2, 6);
    limbR.rotateZ(-0.54);
    limbR.rotateX(-0.20);
    limbR.translate(0.60, 3.95, -0.18);
    const limbB = new THREE.CylinderGeometry(0.11, 0.20, 2.0, 6);
    limbB.rotateX(0.52);
    limbB.translate(0.06, 4.05, 0.56);
    const trunkGeo = mergeSubGeometries([mainStem, limbL, limbR, limbB]);

    // 5-Cluster Asymmetrical Spreading Broadleaf / Sakura / Maple / Oak Canopy (ZERO single-sphere lollipop!)
    const bough1 = new THREE.DodecahedronGeometry(2.55, 1);
    bough1.scale(1.24, 0.74, 1.14);
    bough1.translate(-1.68, 4.95, 0.42);
    const bough2 = new THREE.DodecahedronGeometry(2.45, 1);
    bough2.scale(1.18, 0.72, 1.16);
    bough2.translate(1.72, 5.12, -0.38);
    const bough3 = new THREE.DodecahedronGeometry(2.35, 1);
    bough3.scale(1.14, 0.74, 1.22);
    bough3.translate(0.15, 5.05, 1.55);
    const bough4 = new THREE.DodecahedronGeometry(2.28, 1);
    bough4.scale(1.16, 0.76, 1.12);
    bough4.translate(-0.24, 5.58, -1.38);
    const bough5 = new THREE.DodecahedronGeometry(2.68, 1);
    bough5.scale(1.20, 0.82, 1.18);
    bough5.translate(0.08, 6.55, 0.06);
    const crownRoundGeo = mergeSubGeometries([bough1, bough2, bough3, bough4, bough5]);

    // 3-Tiered Layered Evergreen Cedar / Pine / Cypress Canopy
    const pineT1 = new THREE.ConeGeometry(3.35, 4.6, 9);
    pineT1.translate(0, 4.85, 0);
    const pineT2 = new THREE.ConeGeometry(2.68, 4.4, 9);
    pineT2.translate(0, 7.35, 0);
    const pineT3 = new THREE.ConeGeometry(1.88, 4.2, 9);
    pineT3.translate(0, 9.75, 0);
    const crownPineGeo = mergeSubGeometries([pineT1, pineT2, pineT3]);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 0.9 });

    const trunks = [];
    const roundBuckets = foliageColors.map(() => []);
    const pineBuckets = foliageColors.map(() => []);
    const petalRings = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const s = (i * (TRACK_GAME_LENGTH / count) + fastHash2D(i, 1, 91) * 7.5) % TRACK_GAME_LENGTH;
      const side = i % 2 === 0 ? -1 : 1;

      if (s >= 920 || s <= 158) {
        if (side > 0 || s <= 138) continue;
      }

      const dist = ROAD_HALF_WIDTH + 15.0 + fastHash2D(i, 2, 91) * 72.0;
      const fr = this.sampleAt(s, side * dist);
      if (this.trackDef.overpassRangeS && fr.pos.y > 6.0) continue;
      if (this._minDistToTrack(fr.pos.x, fr.pos.z) < ROAD_HALF_WIDTH + 12.5) continue;

      const sc = 0.88 + fastHash2D(i, 3, 91) * 0.68;
      const rotY = fastHash2D(i, 4, 91) * Math.PI * 2;

      dummy.position.set(fr.pos.x, fr.pos.y, fr.pos.z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      trunks.push(dummy.matrix.clone());

      const cIdx = i % foliageColors.length;
      const isSpruce = fastHash2D(i, 5, 91) < spruceRatio;
      if (isSpruce) {
        // Tall slender cypress (Monza) or layered alpine cedar / pine proportions
        const slim = this.trackDef.theme === 'MONZA' ? 0.58 : 0.96;
        dummy.position.set(fr.pos.x, fr.pos.y, fr.pos.z);
        dummy.scale.set(sc * slim, sc * 1.08, sc * slim);
        dummy.updateMatrix();
        pineBuckets[cIdx].push(dummy.matrix.clone());
      } else {
        dummy.position.set(fr.pos.x, fr.pos.y, fr.pos.z);
        dummy.scale.set(sc * 1.08, sc * 0.98, sc * 1.08);
        dummy.updateMatrix();
        roundBuckets[cIdx].push(dummy.matrix.clone());

        if (blossomPetals && cIdx <= 2 && petalRings.length < 70) {
          dummy.position.set(fr.pos.x, fr.pos.y + 0.04, fr.pos.z);
          dummy.rotation.set(-Math.PI / 2, 0, 0);
          dummy.scale.setScalar(sc * 3.8);
          dummy.updateMatrix();
          petalRings.push(dummy.matrix.clone());
        }
      }
    }

    if (trunks.length) {
      const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, trunks.length);
      trunks.forEach((m, k) => trunkInst.setMatrixAt(k, m));
      trunkInst.instanceMatrix.needsUpdate = true;
      this.group.add(trunkInst);
    }

    foliageColors.forEach((col, idx) => {
      const isSakura = blossomPetals && idx <= 2;
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.74,
        emissive: new THREE.Color(col),
        emissiveIntensity: isSakura ? 0.14 : 0.05,
      });
      if (roundBuckets[idx].length) {
        const inst = new THREE.InstancedMesh(crownRoundGeo, mat, roundBuckets[idx].length);
        roundBuckets[idx].forEach((m, k) => inst.setMatrixAt(k, m));
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = true;
        this.group.add(inst);
      }
      if (pineBuckets[idx].length) {
        const inst = new THREE.InstancedMesh(crownPineGeo, mat, pineBuckets[idx].length);
        pineBuckets[idx].forEach((m, k) => inst.setMatrixAt(k, m));
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = true;
        this.group.add(inst);
      }
    });

    if (petalRings.length) {
      const petalGeo = new THREE.CircleGeometry(1.0, 12);
      const petalMat = new THREE.MeshBasicMaterial({
        color: 0xffb7d5,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      });
      const pInst = new THREE.InstancedMesh(petalGeo, petalMat, petalRings.length);
      petalRings.forEach((m, k) => pInst.setMatrixAt(k, m));
      pInst.instanceMatrix.needsUpdate = true;
      this.group.add(pInst);
    }
  }

  _scatterPalmTrees(count) {
    // Gracefully Curved 3-Segment Riviera / Strip Palm Trunk
    const seg1 = new THREE.CylinderGeometry(0.32, 0.42, 3.5, 8);
    seg1.rotateZ(-0.04);
    seg1.translate(0.07, 1.72, 0);
    const seg2 = new THREE.CylinderGeometry(0.25, 0.33, 3.5, 8);
    seg2.rotateZ(-0.09);
    seg2.translate(0.30, 5.10, 0);
    const seg3 = new THREE.CylinderGeometry(0.19, 0.26, 3.3, 8);
    seg3.rotateZ(-0.14);
    seg3.translate(0.68, 8.38, 0);
    const trunkGeo = mergeSubGeometries([seg1, seg2, seg3]);

    // 7-Frond Arched Radiating Palm Crown (Inner Ascending Petiole + Outer Drooping Frond Tip)
    const frondParts = [];
    const crownHeart = new THREE.DodecahedronGeometry(0.62, 0);
    crownHeart.translate(0.90, 9.85, 0);
    frondParts.push(crownHeart);

    for (let f = 0; f < 7; f++) {
      const az = (Math.PI * 2 * f) / 7;
      const innerBlade = new THREE.BoxGeometry(2.35, 0.14, 0.72);
      innerBlade.rotateZ(0.28);
      innerBlade.translate(1.15, 0.28, 0);
      innerBlade.rotateY(az);
      innerBlade.translate(0.90, 9.95, 0);

      const outerTip = new THREE.ConeGeometry(0.48, 2.55, 5);
      outerTip.scale(1.0, 1.0, 0.26);
      outerTip.rotateZ(-1.92);
      outerTip.translate(3.25, -0.05, 0);
      outerTip.rotateY(az);
      outerTip.translate(0.90, 9.95, 0);

      frondParts.push(innerBlade, outerTip);
    }
    const frondGeo = mergeSubGeometries(frondParts);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x735338, roughness: 0.86 });
    const frondMat = new THREE.MeshStandardMaterial({
      color: this.trackDef.theme === 'VEGAS' ? 0x1e824c : 0x278042,
      roughness: 0.68,
      emissive: new THREE.Color(this.trackDef.theme === 'VEGAS' ? 0x0a3822 : 0x061f10),
      emissiveIntensity: 0.22,
    });

    const palmMatrices = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const s = (i * (TRACK_GAME_LENGTH / count)) % TRACK_GAME_LENGTH;
      if (this.trackDef.tunnelRangeS && s >= this.trackDef.tunnelRangeS[0] - 5 && s <= this.trackDef.tunnelRangeS[1] + 5) {
        continue;
      }
      if (s >= 932 || s <= 136) continue;
      const side = i % 2 === 0 ? -1 : 1;
      const fr = this.sampleAt(s, side * (ROAD_HALF_WIDTH + 12.2 + (i % 3) * 7.2));
      if (this._minDistToTrack(fr.pos.x, fr.pos.z) < ROAD_HALF_WIDTH + 10.5) continue;
      const sc = 0.92 + (i % 4) * 0.14;

      dummy.position.set(fr.pos.x, fr.pos.y, fr.pos.z);
      dummy.rotation.set(0, i * 1.35, 0);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      palmMatrices.push(dummy.matrix.clone());
    }

    if (palmMatrices.length) {
      const tInst = new THREE.InstancedMesh(trunkGeo, trunkMat, palmMatrices.length);
      const fInst = new THREE.InstancedMesh(frondGeo, frondMat, palmMatrices.length);
      palmMatrices.forEach((m, k) => {
        tInst.setMatrixAt(k, m);
        fInst.setMatrixAt(k, m);
      });
      tInst.instanceMatrix.needsUpdate = true;
      fInst.instanceMatrix.needsUpdate = true;
      fInst.castShadow = true;
      this.group.add(tInst, fInst);
    }
  }

  // --------------------------------------------------------------------------
  // 10. FIA MARSHAL BOOTHS + DIGITAL LED FLAG PANELS, PUDDLES & SKIDMARKS
  // --------------------------------------------------------------------------
  _buildMarshalPosts() {
    this.marshalPosts = [];
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xd0d8e4, metalness: 0.68, roughness: 0.3 });
    const boothMat = new THREE.MeshStandardMaterial({ color: 0xf2f6fc, roughness: 0.45 });
    const orangeMat = new THREE.MeshStandardMaterial({
      color: 0xff6d00,
      roughness: 0.35,
      emissive: new THREE.Color(0xff5500),
      emissiveIntensity: 0.22,
    });

    for (const sec of FUJI_SECTORS) {
      const postS = sec.start + 10;
      if (this.trackDef.tunnelRangeS && postS >= this.trackDef.tunnelRangeS[0] && postS <= this.trackDef.tunnelRangeS[1]) {
        continue;
      }
      if (this.trackDef.overpassRangeS && postS >= this.trackDef.overpassRangeS[0] - 8 && postS <= this.trackDef.overpassRangeS[1] + 8) {
        continue;
      }

      const fr = this.sampleAt(postS, -(ROAD_HALF_WIDTH + 6.9));
      const yaw = Math.atan2(fr.tangent.z, fr.tangent.x);

      const mGroup = new THREE.Group();
      mGroup.position.copy(fr.pos);
      mGroup.rotation.y = -yaw;

      // FIA White & Safety-Orange Trackside Marshal Hut
      const booth = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.2, 1.65), boothMat);
      booth.position.set(0, 1.1, -0.8);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.42, 1.72), orangeMat);
      stripe.position.set(0, 0.55, -0.8);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.16, 2.15), this.darkFrameMat);
      canopy.position.set(0, 2.26, -0.68);
      mGroup.add(booth, stripe, canopy);

      // Cantilevered Mast + FIA Digital LED Matrix Flag Panel + Waving Yellow Flag
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.095, 4.7, 8), poleMat);
      pole.position.set(0, 2.35, 0.25);
      mGroup.add(pole);

      const ledHousing = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.05, 1.15), this.darkFrameMat);
      ledHousing.position.set(0, 4.15, 0.88);
      const ledMat = new THREE.MeshBasicMaterial({ color: 0x0b3d1e });
      const ledScreen = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.82, 0.92), ledMat);
      ledScreen.position.set(0, 4.15, 0.88);
      mGroup.add(ledHousing, ledScreen);

      const flagMat = new THREE.MeshBasicMaterial({ color: 0xffea00, side: THREE.DoubleSide });
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.05), flagMat);
      flag.position.set(0, 3.35, 1.08);
      flag.visible = false;
      mGroup.add(flag);

      this.group.add(mGroup);
      this.marshalPosts.push({ sectorId: sec.id, flag, flagMat, ledMat });
    }
  }

  updateMarshalFlags(yellowSectorsSet, vscActive, elapsedSec) {
    const wave = Math.sin(elapsedSec * 12.0) * 0.38;
    const flashOn = elapsedSec % 0.36 < 0.18;
    for (const mp of this.marshalPosts) {
      const isYellow = vscActive || yellowSectorsSet.has(mp.sectorId);
      mp.flag.visible = isYellow;
      if (isYellow) {
        const col = flashOn ? 0xffea00 : 0xff9d00;
        mp.flagMat.color.setHex(col);
        mp.flag.rotation.y = wave;
        if (mp.ledMat) mp.ledMat.color.setHex(flashOn ? 0xffe600 : 0x594300);
      } else if (mp.ledMat) {
        mp.ledMat.color.setHex(0x093b1e);
      }
    }
  }

  _buildPuddles() {
    const puddleDefs = [
      { s: 130, lat: -2.5, radius: 3.1 },
      { s: 270, lat:  2.2, radius: 2.9 },
      { s: 380, lat: -3.0, radius: 3.3 },
      { s: 510, lat: -2.2, radius: 3.1 },
      { s: 640, lat:  2.0, radius: 2.9 },
      { s: 760, lat:  2.8, radius: 3.2 },
      { s: 865, lat: -2.4, radius: 3.0 },
    ];
    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x154675,
      roughness: 0.03,
      metalness: 0.92,
      transparent: true,
      opacity: 0.76,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });

    this.puddles = puddleDefs.map((pd) => {
      const geo = new THREE.CircleGeometry(pd.radius, 24);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, puddleMat);
      const fr = this.sampleAt(pd.s, pd.lat);
      mesh.position.copy(fr.pos).add(new THREE.Vector3(0, 0.042, 0));
      mesh.visible = false;
      this.group.add(mesh);
      return { ...pd, pos: fr.pos.clone(), mesh, forceActive1982: false };
    });
  }

  setPuddles1982Mode(activeInGrandPrix) {
    for (const p of this.puddles) {
      p.forceActive1982 = activeInGrandPrix;
      p.mesh.visible = activeInGrandPrix;
    }
  }

  _buildSkidmarkSystem() {
    const skidGeo = new THREE.PlaneGeometry(1.6, 0.42);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x0b0c0e,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.skidMesh = new THREE.InstancedMesh(skidGeo, skidMat, this.maxSkids);
    this.skidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.maxSkids; i++) this.skidMesh.setMatrixAt(i, zero);
    this.group.add(this.skidMesh);
    this._skidDummy = new THREE.Object3D();
  }

  addSkidmark(worldPos, yawRad) {
    const d = this._skidDummy;
    d.position.set(worldPos.x, worldPos.y + 0.034, worldPos.z);
    d.rotation.set(0, -yawRad, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    this.skidMesh.setMatrixAt(this.skidIndex, d.matrix);
    this.skidIndex = (this.skidIndex + 1) % this.maxSkids;
    this.skidMesh.instanceMatrix.needsUpdate = true;
  }

  computeMinimapBounds() {
    if (this._minimapBounds) return this._minimapBounds;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const smp of this.samples) {
      if (smp.pos.x < minX) minX = smp.pos.x;
      if (smp.pos.x > maxX) maxX = smp.pos.x;
      if (smp.pos.z < minZ) minZ = smp.pos.z;
      if (smp.pos.z > maxZ) maxZ = smp.pos.z;
    }
    const pad = 75;
    this._minimapBounds = { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
    return this._minimapBounds;
  }
}
