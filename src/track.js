// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Multi-Circuit AAA 3D Track Builder (Fuji '82, Monaco, Vegas, Monza, Suzuka, Silverstone)
// Zero-Yank Uniform Spline + Zero-Leak Disposal + High-Res Procedural PBR Art
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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

// Merge multiple indexed or non-indexed BufferGeometries (preserving UVs & vertex colors when present)
function mergeSubGeometries(geos) {
  const posOut = [];
  const normOut = [];
  const uvOut = [];
  const colOut = [];
  let hasAllUv = geos.length > 0;
  let hasAllCol = geos.length > 0;
  for (const g of geos) {
    if (!g.getAttribute('uv')) hasAllUv = false;
    if (!g.getAttribute('color')) hasAllCol = false;
  }

  for (const g of geos) {
    const pos = g.getAttribute('position');
    const norm = g.getAttribute('normal');
    const uv = hasAllUv ? g.getAttribute('uv') : null;
    const col = hasAllCol ? g.getAttribute('color') : null;
    const idx = g.getIndex();
    const pushVert = (vi) => {
      posOut.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
      if (norm) normOut.push(norm.getX(vi), norm.getY(vi), norm.getZ(vi));
      else normOut.push(0, 1, 0);
      if (uv) uvOut.push(uv.getX(vi), uv.getY(vi));
      if (col) colOut.push(col.getX(vi), col.getY(vi), col.getZ(vi));
    };
    if (idx) {
      for (let i = 0; i < idx.count; i++) pushVert(idx.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) pushVert(i);
    }
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(posOut, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normOut, 3));
  if (hasAllUv && uvOut.length) {
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvOut, 2));
  }
  if (hasAllCol && colOut.length) {
    merged.setAttribute('color', new THREE.Float32BufferAttribute(colOut, 3));
  }
  return merged;
}

// Extract sub-mesh BufferGeometries from a named glTF node, baking node-local transforms
function extractNamedGlbMeshes(gltfScene, nodeName, rotateYRad = 0) {
  if (!gltfScene) return [];
  const target = gltfScene.getObjectByName(nodeName);
  if (!target) return [];
  target.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(target.matrixWorld).invert();
  const rotM = rotateYRad !== 0 ? new THREE.Matrix4().makeRotationY(rotateYRad) : null;
  const parts = [];
  target.traverse((ch) => {
    if (!ch.isMesh || !ch.geometry) return;
    const g = ch.geometry.clone();
    const rel = new THREE.Matrix4().multiplyMatrices(invRoot, ch.matrixWorld);
    g.applyMatrix4(rel);
    if (rotM) g.applyMatrix4(rotM);
    parts.push({
      geometry: g,
      material: ch.material,
      matName: (ch.material?.name || '').toLowerCase(),
    });
  });
  return parts;
}

function mergeGlbMeshList(parts) {
  if (!parts || !parts.length) return null;
  if (parts.length === 1) return parts[0].geometry.clone();
  return mergeSubGeometries(parts.map((p) => p.geometry.clone()));
}

export class FujiTrack {
  static _envGlbCache = null;
  static _envGlbPromise = null;

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

    // Live stadium crowd excitement state (0..2) & shared GPU vertex-animation uniforms
    this.crowdExcitement = 0.22;
    this._lastElapsedSec = 0;
    this._checkeredFlagActive = false;
    this._lastGantryState = { redCount: 0, greenOn: false, yellowFlash: false };
    this._forcePuddles1982 = false;
    this._loadGeneration = 0;
    this._crowdUniforms = {
      uTime: { value: 0 },
      uExcitement: { value: 0.22 },
    };

    // Protect shared GLB template buffers/materials/textures from circuit disposal
    this._protectedGeos = new Set();
    this._protectedMats = new Set();
    this._protectedTexs = new Set();
    this._collectProtectedAssetResources();

    this.group = new THREE.Group();
    this.group.name = 'GrandPrixCircuitRoot';
    this.scene.add(this.group);

    this.loadCircuit('FUJI_1982');
    this._ensureBlenderEnvAssetsLoaded();
  }

  triggerCrowdExcitement(boost = 1.0) {
    const add = Number.isFinite(boost) ? Math.max(0.15, boost) : 1.0;
    this.crowdExcitement = Math.min(2.2, this.crowdExcitement + add);
    this._crowdUniforms.uExcitement.value = this.crowdExcitement;
  }

  setCheckeredFlag(active = false) {
    this._checkeredFlagActive = Boolean(active);
    if (active) this.triggerCrowdExcitement(1.5);
  }

  _ensureBlenderEnvAssetsLoaded() {
    if (FujiTrack._envGlbCache) return;
    if (!FujiTrack._envGlbPromise) {
      if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
      const loader = new GLTFLoader();
      const loadOne = (url) =>
        new Promise((resolve) => {
          loader.load(
            url,
            (gltf) => resolve(gltf?.scene || null),
            undefined,
            () => resolve(null)
          );
        });

      FujiTrack._envGlbPromise = Promise.all([
        loadOne('./assets/models/env_trees_biome.glb'),
        loadOne('./assets/models/env_signs_gantries_billboards.glb'),
        loadOne('./assets/models/env_barriers_fencing.glb'),
        loadOne('./assets/models/env_grandstands_crowds.glb'),
      ]).then(([treesScene, signsScene, barriersScene, crowdsScene]) => {
        if (!treesScene && !signsScene && !barriersScene && !crowdsScene) return null;
        const cache = {};

        // 1. Biome Trees (Deciduous / Sakura / Maple, Pine / Cedar, Palm)
        const decParts = extractNamedGlbMeshes(treesScene, 'Tree_Deciduous_LOD0');
        cache.deciduousTrunk = decParts.find((p) => p.matName.includes('bark'))?.geometry || decParts[0]?.geometry || null;
        cache.deciduousCanopy = decParts.find((p) => p.matName.includes('foliage'))?.geometry || decParts[1]?.geometry || null;
        cache.barkMap = decParts.find((p) => p.matName.includes('bark'))?.material?.map || null;
        cache.foliageMap = decParts.find((p) => p.matName.includes('foliage'))?.material?.map || null;

        const pineParts = extractNamedGlbMeshes(treesScene, 'Tree_Pine_LOD0');
        cache.pineTrunk = pineParts.find((p) => p.matName.includes('bark'))?.geometry || pineParts[0]?.geometry || null;
        cache.pineCanopy = pineParts.find((p) => p.matName.includes('foliage'))?.geometry || pineParts[1]?.geometry || null;

        const palmParts = extractNamedGlbMeshes(treesScene, 'Tree_Palm_LOD0');
        cache.palmTrunk = palmParts.find((p) => p.matName.includes('bark'))?.geometry || palmParts[0]?.geometry || null;
        cache.palmCanopy = palmParts.find((p) => p.matName.includes('foliage'))?.geometry || palmParts[1]?.geometry || null;

        // 2. Signs, Start Gantry & Sponsor Billboards (rotated -PI/2 around Y so +Z faces -X oncoming traffic!)
        const flipGlbUvY = (geo) => {
          const uv = geo?.getAttribute('uv');
          if (!uv) return geo;
          for (let i = 0; i < uv.count; i++) uv.setY(i, 1.0 - uv.getY(i));
          uv.needsUpdate = true;
          return geo;
        };
        const brkParts = extractNamedGlbMeshes(signsScene, 'BrakeBoard_300m-convcolonly', -Math.PI * 0.5);
        cache.brakeFrameGeo = mergeGlbMeshList(brkParts.filter((p) => !p.matName.includes('face')));
        cache.brakeFaceGeo = flipGlbUvY(brkParts.find((p) => p.matName.includes('face'))?.geometry || null);

        const bbParts = extractNamedGlbMeshes(signsScene, 'Sponsor_Billboard_Rig-convcolonly', -Math.PI * 0.5);
        cache.billboardFrameGeo = mergeGlbMeshList(bbParts.filter((p) => !p.matName.includes('sponsor_face')));
        cache.billboardFaceGeo = flipGlbUvY(bbParts.find((p) => p.matName.includes('sponsor_face'))?.geometry || null);

        const ganParts = extractNamedGlbMeshes(signsScene, 'Start_Gantry_Truss-col', -Math.PI * 0.5);
        cache.gantryTrussGeo = ganParts.find((p) => p.matName.includes('spaceframe'))?.geometry || null;

        // 3. Trackside Barriers & Debris Catch-Fencing
        const armParts = extractNamedGlbMeshes(barriersScene, 'Barrier_Armco-col');
        cache.armcoRailGeo = armParts.find((p) => p.matName.includes('armco'))?.geometry || null;
        cache.armcoPostGeo = armParts.find((p) => p.matName.includes('post'))?.geometry || null;

        const tireParts = extractNamedGlbMeshes(barriersScene, 'Barrier_TireWall-col');
        cache.tireRedGeo = tireParts.find((p) => p.matName.includes('fiared'))?.geometry || null;
        cache.tireWhiteGeo = tireParts.find((p) => p.matName.includes('fiawhite'))?.geometry || null;
        cache.tireStrapGeo = tireParts.find((p) => p.matName.includes('rubber'))?.geometry || null;

        const fenceParts = extractNamedGlbMeshes(barriersScene, 'Barrier_CatchFence');
        cache.catchFencePostGeo = fenceParts.find((p) => p.matName.includes('post'))?.geometry || null;
        cache.catchFenceWireGeo = fenceParts.find((p) => p.matName.includes('wire'))?.geometry || null;

        // 4. Grandstands, Articulated 3D Cheering Spectators, Flag Wavers & Trackside Marshals
        const gsParts = extractNamedGlbMeshes(crowdsScene, 'Grandstand_Tribune-col');
        cache.grandstandStructGeo = mergeGlbMeshList(gsParts.filter((p) => !p.matName.includes('roof')));
        cache.grandstandRoofGeo = gsParts.find((p) => p.matName.includes('roof'))?.geometry || null;

        const fanParts = extractNamedGlbMeshes(crowdsScene, 'Spectator_Cheering');
        cache.spectatorGeo = mergeGlbMeshList(fanParts);

        const fwParts = extractNamedGlbMeshes(crowdsScene, 'Spectator_FlagWaver');
        cache.flagWaverBodyGeo = mergeGlbMeshList(fwParts.filter((p) => !p.matName.includes('flag')));
        cache.flagWaverClothGeo = fwParts.find((p) => p.matName.includes('flag'))?.geometry || null;

        const marParts = extractNamedGlbMeshes(crowdsScene, 'Marshal_FlagWaver');
        cache.marshalBodyGeo = mergeGlbMeshList(marParts.filter((p) => !p.matName.includes('flag')));
        cache.marshalClothGeo = marParts.find((p) => p.matName.includes('flag'))?.geometry || null;

        FujiTrack._envGlbCache = cache;
        return cache;
      });
    }

    const genAtBoot = this._loadGeneration;
    FujiTrack._envGlbPromise.then((cache) => {
      if (!cache || !this.group) return;
      this._collectProtectedAssetResources();
      if (this._loadGeneration === genAtBoot) {
        const savedGantry = { ...this._lastGantryState };
        const savedPuddles1982 = this._forcePuddles1982;
        this.loadCircuit(this.currentTrackId);
        this.setGantryLights(savedGantry.redCount, savedGantry.greenOn, savedGantry.yellowFlash);
        if (savedPuddles1982) this.setPuddles1982Mode(true);
      }
    });
  }

  _collectProtectedAssetResources() {
    const templates = this.assets?.templates;
    if (templates) {
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
    const envCache = FujiTrack._envGlbCache;
    if (envCache) {
      for (const val of Object.values(envCache)) {
        if (!val) continue;
        if (val.isBufferGeometry) this._protectedGeos.add(val);
        else if (val.isTexture) this._protectedTexs.add(val);
        else if (val.isMaterial) this._protectedMats.add(val);
      }
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
    this._loadGeneration = (this._loadGeneration || 0) + 1;
    this.currentTrackId = TRACK_CATALOG[trackId] ? trackId : 'FUJI_1982';
    this.trackDef = TRACK_CATALOG[this.currentTrackId];
    this._minimapBounds = null;
    this._checkeredFlagActive = false;

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
    this._buildMainStraightScenicVistaTrees();
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
  // 2. HIGH-RESOLUTION 1024x1024 DARK BASALT ASPHALT PBR, NORMAL & ROUGHNESS MAPS
  // --------------------------------------------------------------------------
  _createRichMaterials() {
    const isVegas = this.trackDef.theme === 'VEGAS';
    const isMonaco = this.trackDef.theme === 'MONACO';

    // A. Deep Dark Charcoal Basalt Asphalt (#1b1d21) + 512x512 Tangent Normal & Roughness Maps
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 1024;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(1024, 1024);
    const data = img.data;

    const normC = document.createElement('canvas');
    normC.width = 512;
    normC.height = 512;
    const nctx = normC.getContext('2d');
    const nImg = nctx.createImageData(512, 512);
    const nData = nImg.data;

    const roughC = document.createElement('canvas');
    roughC.width = 512;
    roughC.height = 512;
    const rghCtx = roughC.getContext('2d');
    const rghImg = rghCtx.createImageData(512, 512);
    const rghData = rghImg.data;

    // Deep dark charcoal tarmac (#1b1d21 — ZERO icy blue tint!)
    const baseR = isVegas ? 22 : (isMonaco ? 30 : 27);
    const baseG = isVegas ? 24 : (isMonaco ? 32 : 29);
    const baseB = isVegas ? 29 : (isMonaco ? 36 : 33);

    const grooveFactorX = new Float32Array(1024);
    for (let x = 0; x < 1024; x++) {
      const u = x / 1023;
      const leftGroove = Math.exp(-((u - 0.27) * (u - 0.27)) / 0.015);
      const rightGroove = Math.exp(-((u - 0.73) * (u - 0.73)) / 0.015);
      const midGroove = Math.exp(-((u - 0.50) * (u - 0.50)) / 0.030) * 0.42;
      grooveFactorX[x] = Math.min(1.0, Math.max(leftGroove, rightGroove) * 0.96 + midGroove);
    }

    const heightGrid = new Float32Array(512 * 512);
    for (let y = 0; y < 1024; y++) {
      const streak = (fastHash2D(0, y >> 3, 19) - 0.5) * 9.5;
      for (let x = 0; x < 1024; x++) {
        const g = grooveFactorX[x];
        const grainFine = fastHash2D(x, y, 7);
        const grainCoarse = fastHash2D(x >> 1, y >> 1, 31);
        const macroStone = fastHash2D(x >> 2, y >> 2, 107);
        const quartzSparkle = grainFine > 0.962 ? 32 : (grainFine > 0.925 ? 15 : 0);

        const delta =
          (grainFine - 0.5) * 26.0 +
          (grainCoarse - 0.5) * 18.0 +
          (macroStone - 0.5) * 11.0 +
          streak * g +
          quartzSparkle * (1.0 - g * 0.55);
        const rubberDarken = g * 13.5;

        const idx = (y * 1024 + x) * 4;
        data[idx]     = Math.max(7, Math.min(255, Math.round(baseR + delta - rubberDarken)));
        data[idx + 1] = Math.max(8, Math.min(255, Math.round(baseG + delta - rubberDarken)));
        data[idx + 2] = Math.max(9, Math.min(255, Math.round(baseB + delta - rubberDarken)));
        data[idx + 3] = 255;

        if ((x & 1) === 0 && (y & 1) === 0) {
          const hx = x >> 1;
          const hy = y >> 1;
          heightGrid[hy * 512 + hx] = (grainFine * 0.55 + grainCoarse * 0.30 + macroStone * 0.15) * (1.0 - g * 0.36);

          const bIdx = (hy * 512 + hx) * 4;
          const rghVal = Math.max(115, Math.min(252, Math.round(244 - g * 62 + (grainCoarse - 0.5) * 26)));
          rghData[bIdx] = rghVal;
          rghData[bIdx + 1] = rghVal;
          rghData[bIdx + 2] = rghVal;
          rghData[bIdx + 3] = 255;
        }
      }
    }

    // Build crisp 512x512 tangent-space stone-aggregate normal map
    for (let hy = 0; hy < 512; hy++) {
      const yPrev = ((hy - 1) & 511) * 512;
      const yNext = ((hy + 1) & 511) * 512;
      const yRow = hy * 512;
      for (let hx = 0; hx < 512; hx++) {
        const dx = (heightGrid[yRow + ((hx + 1) & 511)] - heightGrid[yRow + ((hx - 1) & 511)]) * 2.45;
        const dy = (heightGrid[yNext + hx] - heightGrid[yPrev + hx]) * 2.45;
        const invLen = 1.0 / Math.sqrt(dx * dx + dy * dy + 1.0);
        const nIdx = (yRow + hx) * 4;
        nData[nIdx]     = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
        nData[nIdx + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
        nData[nIdx + 2] = Math.round((invLen * 0.5 + 0.5) * 255);
        nData[nIdx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    nctx.putImageData(nImg, 0, 0);
    rghCtx.putImageData(rghImg, 0, 0);

    // Longitudinal paver joints + heavy black vulcanized rubbered-in twin tire grooves & braking skids
    ctx.fillStyle = 'rgba(6, 7, 10, 0.42)';
    ctx.fillRect(340, 0, 3, 1024);
    ctx.fillRect(682, 0, 3, 1024);

    for (let i = 0; i < 110; i++) {
      const laneCenter = i % 2 === 0 ? 276 : 748;
      const sx = laneCenter + (fastHash2D(i, 3, 99) - 0.5) * 118;
      const sy = fastHash2D(i, 9, 99) * 880;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(5, 6, 8, 0.34)' : 'rgba(8, 9, 12, 0.24)';
      ctx.fillRect(sx, sy, 4.5 + (i % 3) * 1.5, 110 + fastHash2D(i, 15, 99) * 145);
      ctx.fillRect(sx + 26, sy, 4.5 + (i % 3) * 1.5, 110 + fastHash2D(i, 15, 99) * 145);
    }

    // Off-line dark tire marble specks near track edges
    ctx.fillStyle = 'rgba(8, 9, 11, 0.55)';
    for (let m = 0; m < 420; m++) {
      const mx = m % 2 === 0 ? 58 + fastHash2D(m, 1, 211) * 95 : 870 + fastHash2D(m, 2, 211) * 95;
      const my = fastHash2D(m, 3, 211) * 1020;
      ctx.fillRect(mx, my, 3, 4);
    }

    // Crisp painted FIA double track-edge boundary lines (white outer + yellow/cyan inner contrast line)
    ctx.fillStyle = 'rgba(8, 10, 14, 0.52)';
    ctx.fillRect(14, 0, 40, 1024);
    ctx.fillRect(970, 0, 40, 1024);

    ctx.fillStyle = '#f8fbff';
    ctx.fillRect(18, 0, 22, 1024);
    ctx.fillRect(984, 0, 22, 1024);

    ctx.fillStyle = isVegas ? '#00f0ff' : '#ffd600';
    ctx.fillRect(44, 0, 7, 1024);
    ctx.fillRect(973, 0, 7, 1024);

    const roadTex = new THREE.CanvasTexture(c);
    roadTex.wrapS = THREE.RepeatWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(1, 145);
    roadTex.anisotropy = 8;
    roadTex.colorSpace = THREE.SRGBColorSpace;

    const roadNormTex = new THREE.CanvasTexture(normC);
    roadNormTex.wrapS = THREE.RepeatWrapping;
    roadNormTex.wrapT = THREE.RepeatWrapping;
    roadNormTex.repeat.set(3, 435);

    const roughTex = new THREE.CanvasTexture(roughC);
    roughTex.wrapS = THREE.RepeatWrapping;
    roughTex.wrapT = THREE.RepeatWrapping;
    roughTex.repeat.set(1, 145);

    // Dry tarmac: deep dark charcoal, roughness 0.86, metalness 0.04, clearcoat 0.0!
    this.asphaltMat = new THREE.MeshPhysicalMaterial({
      map: roadTex,
      normalMap: roadNormTex,
      normalScale: new THREE.Vector2(1.35, 1.35),
      roughnessMap: roughTex,
      roughness: 0.86,
      metalness: 0.04,
      clearcoat: 0.0,
      clearcoatRoughness: 0.42,
      reflectivity: 0.28,
      envMapIntensity: isVegas ? 0.46 : 0.28,
    });

    this.pitAsphaltMat = new THREE.MeshPhysicalMaterial({
      map: roadTex,
      normalMap: roadNormTex,
      normalScale: new THREE.Vector2(1.15, 1.15),
      color: isVegas ? 0x8ea0b8 : 0xb8c0cc,
      roughness: 0.82,
      metalness: 0.05,
      clearcoat: 0.0,
      clearcoatRoughness: 0.38,
      reflectivity: 0.30,
      envMapIntensity: isVegas ? 0.48 : 0.30,
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

    // D. Serrated 3D Beveled & Tire-Scuffed Kerb Materials + Corrugated Steel Armco Material
    const curbBevelTex = this._makeSerratedCurbTexture();
    this.curbMats = this.trackDef.curbColors.map(
      (hex) => new THREE.MeshStandardMaterial({
        color: hex,
        map: curbBevelTex,
        bumpMap: curbBevelTex,
        bumpScale: 0.024,
        roughness: 0.30,
        metalness: 0.14,
        emissive: new THREE.Color(hex),
        emissiveIntensity: isVegas ? 0.52 : 0.08,
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

  _makeSerratedCurbTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0.00, '#ffffff'); // Crisp sunlit bevel edge
    g.addColorStop(0.18, '#f0f4fa');
    g.addColorStop(0.78, '#d5dde8');
    g.addColorStop(1.00, '#9aa6b8'); // Outer shadow bevel
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);

    // 3D serrated sawtooth step highlights & recessed shadow grooves
    for (let y = 0; y < 256; y += 32) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.36)';
      ctx.fillRect(0, y, 256, 5);
      ctx.fillStyle = 'rgba(12, 16, 24, 0.34)';
      ctx.fillRect(0, y + 27, 256, 5);
    }

    // Authentic dark Pirelli tire-rubber scuff marks along the inner apex edge
    ctx.fillStyle = 'rgba(18, 22, 28, 0.26)';
    for (let i = 0; i < 28; i++) {
      const sy = fastHash2D(i, 1, 613) * 230;
      ctx.fillRect(8 + fastHash2D(i, 2, 613) * 55, sy, 18 + fastHash2D(i, 3, 613) * 32, 8);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  updateVisualState(moistureW, visualStyle, elapsedSec = 0) {
    const dt = Math.max(0, Math.min(0.1, elapsedSec - (this._lastElapsedSec || elapsedSec)));
    this._lastElapsedSec = elapsedSec;
    if (this.crowdExcitement > 0.22) {
      this.crowdExcitement = Math.max(0.22, this.crowdExcitement - dt * 0.36);
    }
    this._crowdUniforms.uTime.value = elapsedSec;
    this._crowdUniforms.uExcitement.value = this.crowdExcitement;

    const isArcade = visualStyle === '1982_ARCADE';
    const isVegas = this.trackDef.theme === 'VEGAS';
    if (isArcade) {
      this.asphaltMat.roughness = moistureW > 0.15 ? 0.14 : 0.86;
      this.asphaltMat.metalness = moistureW > 0.15 ? 0.56 : 0.04;
      this.asphaltMat.clearcoat = 0.0;
    } else {
      // Dry tarmac stays deep matte dark charcoal (roughness 0.86, metalness 0.04, clearcoat 0.0)!
      // ONLY raise clearcoat & mirror sky reflection when moistureW > 0.15!
      const wetFactor = moistureW > 0.15
        ? Math.max(0, Math.min(1, (moistureW - 0.15) / 0.50))
        : 0.0;
      this.asphaltMat.roughness = 0.86 - wetFactor * 0.76;
      this.asphaltMat.metalness = 0.04 + wetFactor * 0.60;
      this.asphaltMat.clearcoat = wetFactor * 1.0;
      this.asphaltMat.clearcoatRoughness = 0.42 - wetFactor * 0.37;
      this.asphaltMat.envMapIntensity = (isVegas ? 0.46 : 0.28) + wetFactor * 1.75;
      if (this.pitAsphaltMat) {
        this.pitAsphaltMat.roughness = 0.82 - wetFactor * 0.72;
        this.pitAsphaltMat.metalness = 0.05 + wetFactor * 0.56;
        this.pitAsphaltMat.clearcoat = wetFactor * 0.96;
        this.pitAsphaltMat.clearcoatRoughness = 0.38 - wetFactor * 0.33;
        this.pitAsphaltMat.envMapIntensity = (isVegas ? 0.48 : 0.30) + wetFactor * 1.65;
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
  // 4. SERRATED 3D RUMBLE KERBS, BLENDER .GLB STEEL ARMCO & FIA TIRE BARRIERS
  // --------------------------------------------------------------------------
  _buildCurbsAndArmcoBarriers() {
    const envCache = FujiTrack._envGlbCache;

    // 2-Step Beveled & Serrated 3D FIA Rumble Kerb Geometry
    const curbBase = new THREE.BoxGeometry(2.38, 0.11, CURB_WIDTH);
    const curbRidge = new THREE.BoxGeometry(1.78, 0.062, CURB_WIDTH * 0.58);
    curbRidge.translate(0.18, 0.068, 0);
    const curbBlockGeo = mergeSubGeometries([curbBase, curbRidge]);
    const matBuckets = this.curbMats.map(() => []);
    const armcoMatrices = [];
    const armcoPostMatrices = [];
    const tireWallMatrices = [];
    const tireRedMatrices = [];
    const tireWhiteMatrices = [];
    const dummy = new THREE.Object3D();

    const useGlbArmco = Boolean(envCache?.armcoRailGeo);
    const useGlbTires = Boolean(envCache?.tireRedGeo && envCache?.tireWhiteGeo);

    for (let i = 0; i < SAMPLES; i++) {
      const smp = this.samples[i];
      const yaw = Math.atan2(smp.tangent.z, smp.tangent.x);
      const absK = Math.abs(smp.curvature);

      // Serrated FIA rumble kerbs on ALL corners AND framing the Main Straight / Showroom vista!
      const isMainStraightLeft = smp.s >= 942 || smp.s <= 128;
      const isMainStraightRight = smp.s >= 956 || smp.s <= 66;
      if (absK > 0.045 || isMainStraightLeft || isMainStraightRight) {
        for (const side of [-1, 1]) {
          if (absK <= 0.045) {
            if (side < 0 && !isMainStraightLeft) continue;
            if (side > 0 && !isMainStraightRight) continue;
          } else if (side > 0 && (smp.s >= 902 && smp.s < 956)) {
            continue;
          } else if (side > 0 && (smp.s > 66 && smp.s <= 122)) {
            continue;
          }
          dummy.position
            .copy(smp.pos)
            .addScaledVector(smp.right, side * (ROAD_HALF_WIDTH + CURB_WIDTH * 0.45));
          dummy.position.y += 0.038;
          dummy.rotation.set(side * 0.038, -yaw, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          matBuckets[i % matBuckets.length].push(dummy.matrix.clone());
        }
      }

      // Continuous 3-Wave Steel Armco Guardrails + I-Posts + Bolted FIA Tire Wall Stacks
      if (i % 2 === 0) {
        for (const side of [-1, 1]) {
          if (side > 0 && (smp.s >= 902 || smp.s <= 124)) continue;
          const barrierDist = ROAD_HALF_WIDTH + 5.85;
          const faceTrackRotY = -yaw + (side > 0 ? Math.PI : 0);

          dummy.position.copy(smp.pos).addScaledVector(smp.right, side * barrierDist);
          dummy.position.y += useGlbArmco ? 0.0 : 0.52;
          dummy.rotation.set(0, useGlbArmco ? faceTrackRotY : -yaw, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          armcoMatrices.push(dummy.matrix.clone());

          if (!useGlbArmco) {
            dummy.position.copy(smp.pos).addScaledVector(smp.right, side * (barrierDist + 0.18));
            dummy.position.y += 0.50;
            dummy.updateMatrix();
          }
          armcoPostMatrices.push(dummy.matrix.clone());

          // Bolted FIA 3-High Tire Barrier bundles on high-speed corner outsides
          const outsideSign = -Math.sign(smp.curvature);
          if (absK > 0.26 && side === outsideSign && (i % 4 === 0)) {
            dummy.position.copy(smp.pos).addScaledVector(smp.right, side * (barrierDist - 0.92));
            dummy.position.y += useGlbTires ? 0.02 : 0.46;
            dummy.rotation.set(0, faceTrackRotY, 0);
            dummy.updateMatrix();
            tireWallMatrices.push(dummy.matrix.clone());
            if ((i / 4) % 2 === 0) tireRedMatrices.push(dummy.matrix.clone());
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

    const armcoGeo = useGlbArmco ? envCache.armcoRailGeo : new THREE.BoxGeometry(4.5, 0.94, 0.22);
    const armcoInst = new THREE.InstancedMesh(armcoGeo, this.armcoMat, armcoMatrices.length);
    armcoMatrices.forEach((m, k) => armcoInst.setMatrixAt(k, m));
    armcoInst.instanceMatrix.needsUpdate = true;
    armcoInst.castShadow = true;
    armcoInst.receiveShadow = true;
    this.group.add(armcoInst);

    const postGeo = (useGlbArmco && envCache.armcoPostGeo)
      ? envCache.armcoPostGeo
      : new THREE.BoxGeometry(0.18, 1.08, 0.18);
    const postInst = new THREE.InstancedMesh(postGeo, this.darkFrameMat, armcoPostMatrices.length);
    armcoPostMatrices.forEach((m, k) => postInst.setMatrixAt(k, m));
    postInst.instanceMatrix.needsUpdate = true;
    this.group.add(postInst);

    if (useGlbTires && tireWallMatrices.length > 0) {
      const redMat = new THREE.MeshStandardMaterial({ color: 0xd91e26, roughness: 0.65 });
      const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f7fc, roughness: 0.65 });
      const strapMat = new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.82 });
      const rInst = new THREE.InstancedMesh(envCache.tireRedGeo, redMat, tireWallMatrices.length);
      const wInst = new THREE.InstancedMesh(envCache.tireWhiteGeo, whiteMat, tireWallMatrices.length);
      tireWallMatrices.forEach((m, k) => {
        rInst.setMatrixAt(k, m);
        wInst.setMatrixAt(k, m);
      });
      rInst.instanceMatrix.needsUpdate = true;
      wInst.instanceMatrix.needsUpdate = true;
      this.group.add(rInst, wInst);
      if (envCache.tireStrapGeo) {
        const sInst = new THREE.InstancedMesh(envCache.tireStrapGeo, strapMat, tireWallMatrices.length);
        tireWallMatrices.forEach((m, k) => sInst.setMatrixAt(k, m));
        sInst.instanceMatrix.needsUpdate = true;
        this.group.add(sInst);
      }
    } else {
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
  }

  // --------------------------------------------------------------------------
  // 5. ARCHITECTURAL DARK-CARBON 3D OPEN-BAY PIT GARAGES & VIP ROOFTOP CROWD
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
      rPt.y += yLiftPit(k);
      posArr.push(lPt.x, lPt.y, lPt.z, rPt.x, rPt.y, rPt.z);
      normArr.push(0, 1, 0, 0, 1, 0);
      uvArr.push(0, k * 0.08, 1, k * 0.08);
      if (k < pitIndices.length - 1) {
        const b = k * 2;
        idxArr.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    function yLiftPit() { return 0.020; }
    const pitGeo = new THREE.BufferGeometry();
    pitGeo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    pitGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normArr, 3));
    pitGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
    pitGeo.setIndex(idxArr);
    const pitRoadMesh = new THREE.Mesh(pitGeo, this.pitAsphaltMat);
    pitRoadMesh.receiveShadow = true;
    this.group.add(pitRoadMesh);

    // Dark Architectural Concrete Pit Wall + FIA Championship Stripe + Engineer Telemetry Perch
    const wallStart = this.sampleAt(954, ROAD_HALF_WIDTH + 1.8).pos;
    const wallEnd = this.sampleAt(68, ROAD_HALF_WIDTH + 1.8).pos;
    const wallLen = Math.max(120, wallEnd.x - wallStart.x);
    const wallCenterX = (wallStart.x + wallEnd.x) * 0.5;
    const wallZ = wallStart.z;
    const isVegas = this.trackDef.theme === 'VEGAS';

    const darkPitWallMat = new THREE.MeshStandardMaterial({
      color: 0x242a36,
      roughness: 0.62,
      metalness: 0.18,
    });
    const pitWall = new THREE.Mesh(new THREE.BoxGeometry(wallLen, 1.16, 0.48), darkPitWallMat);
    pitWall.position.set(wallCenterX, 0.58, wallZ);
    pitWall.castShadow = true;
    pitWall.receiveShadow = true;
    this.group.add(pitWall);

    // Pit-wall debris catch glass & FIA accent stripe
    const wallStripe = new THREE.Mesh(
      new THREE.BoxGeometry(wallLen + 0.1, 0.22, 0.52),
      new THREE.MeshStandardMaterial({
        color: isVegas ? 0x00f0ff : 0xe41c24,
        emissive: isVegas ? 0x00f0ff : 0x5c080c,
        emissiveIntensity: isVegas ? 0.50 : 0.24,
        roughness: 0.28,
      })
    );
    wallStripe.position.set(wallCenterX, 1.06, wallZ);
    this.group.add(wallStripe);

    // Architectural F1 Pit-Wall Team Telemetry Perch
    const perchGroup = new THREE.Group();
    perchGroup.position.set(wallCenterX + 8, 1.16, wallZ);
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
      new THREE.BoxGeometry(26, 0.26, 2.3),
      new THREE.MeshStandardMaterial({ color: 0x1e2533, metalness: 0.68, roughness: 0.24 })
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

    // Sleek Dark-Carbon & Smoked-Glass 2-Story F1 Paddock Complex (NO flat pale white boxes!)
    const garX = wallCenterX + 18;
    const garZ = PIT_LANE_CONFIG.lateralOffset + 14.5;

    const carbonFasciaMat = new THREE.MeshStandardMaterial({
      color: isVegas ? 0x121828 : 0x181d27,
      roughness: 0.34,
      metalness: 0.58,
    });
    const gunmetalTrimMat = new THREE.MeshStandardMaterial({
      color: 0x2c3546,
      roughness: 0.28,
      metalness: 0.72,
    });
    const crimsonAccentMat = new THREE.MeshStandardMaterial({
      color: isVegas ? 0x00f0ff : 0xd91424,
      roughness: 0.26,
      metalness: 0.35,
      emissive: new THREE.Color(isVegas ? 0x00a8c8 : 0x45050b),
      emissiveIntensity: 0.32,
    });

    // Upper Paddock Club Dark-Carbon Volume + Cantilevered Titanium Louvered Canopy
    const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(342, 4.6, 14.4), carbonFasciaMat);
    upperDeck.position.set(garX, 7.6, garZ);
    upperDeck.castShadow = true;
    upperDeck.receiveShadow = true;
    this.group.add(upperDeck);

    const midBeltTrim = new THREE.Mesh(new THREE.BoxGeometry(344, 0.34, 15.2), crimsonAccentMat);
    midBeltTrim.position.set(garX, 5.32, garZ - 0.3);
    this.group.add(midBeltTrim);

    const roofOverhang = new THREE.Mesh(new THREE.BoxGeometry(348, 0.58, 17.8), gunmetalTrimMat);
    roofOverhang.position.set(garX, 10.22, garZ - 0.8);
    roofOverhang.castShadow = true;
    this.group.add(roofOverhang);

    // Smoked Reflective Floor-to-Ceiling VIP Paddock Club Glass Curtain Wall
    const clubTex = this._makePaddockGlassTexture(isVegas);
    const clubGlassMat = new THREE.MeshStandardMaterial({
      map: clubTex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: clubTex,
      emissiveIntensity: isVegas ? 0.78 : 0.42,
      roughness: 0.10,
      metalness: 0.84,
    });
    const clubGlass = new THREE.Mesh(
      new THREE.BoxGeometry(338, 3.2, 14.72),
      [this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, clubGlassMat, clubGlassMat]
    );
    clubGlass.position.set(garX, 7.58, garZ);
    this.group.add(clubGlass);

    // Architectural Vertical Steel Fins framing the VIP Paddock Glass every 17m
    const finGeo = new THREE.BoxGeometry(0.42, 4.7, 0.85);
    const finCount = 21;
    const finInst = new THREE.InstancedMesh(finGeo, gunmetalTrimMat, finCount);
    const finDummy = new THREE.Object3D();
    for (let fi = 0; fi < finCount; fi++) {
      finDummy.position.set(garX - 165 + fi * 16.5, 7.62, garZ - 7.35);
      finDummy.updateMatrix();
      finInst.setMatrixAt(fi, finDummy.matrix);
    }
    finInst.instanceMatrix.needsUpdate = true;
    this.group.add(finInst);

    // Rooftop Championship Signboard + Smoked-Glass VIP Hospitality Terrace Balustrade
    const roofBannerTex = this._makeMotorsportBanner(
      'F1 PADDOCK CLUB',
      `${this.trackDef.name} • WORLD CHAMPIONSHIP GARAGES`,
      '#0b1324',
      '#162848',
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
      emissiveIntensity: isVegas ? 0.52 : 0.26,
      roughness: 0.26,
    });
    const roofSign = new THREE.Mesh(
      new THREE.BoxGeometry(118, 2.15, 0.55),
      [this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, roofBannerMat, roofBannerMat]
    );
    roofSign.position.set(garX - 35, 12.15, garZ + 2.8);
    this.group.add(roofSign);

    const terraceRailMat = new THREE.MeshStandardMaterial({
      color: 0x88c8ff,
      roughness: 0.12,
      metalness: 0.75,
      transparent: true,
      opacity: 0.46,
    });
    const terraceRail = new THREE.Mesh(new THREE.BoxGeometry(336, 1.15, 0.14), terraceRailMat);
    terraceRail.position.set(garX, 11.08, garZ - 8.8);
    this.group.add(terraceRail);

    // Colorful 3D VIP Rooftop Hospitality Parasols & Umbrellas overlooking the Main Straight!
    const parasolCols = [0xd91424, 0xff8000, 0x00b0ff, 0xffd600, 0xf8fbff];
    const parasolPoleGeo = new THREE.CylinderGeometry(0.06, 0.07, 2.7, 8);
    const parasolCanopyGeo = new THREE.ConeGeometry(2.35, 0.72, 10);
    for (let pi = 0; pi < 13; pi++) {
      const px = garX - 144 + pi * 24;
      const pz = garZ - 5.2 - (pi % 2) * 1.8;
      const pStem = new THREE.Mesh(parasolPoleGeo, gunmetalTrimMat);
      pStem.position.set(px, 11.85, pz);
      const pTop = new THREE.Mesh(
        parasolCanopyGeo,
        new THREE.MeshStandardMaterial({ color: parasolCols[pi % parasolCols.length], roughness: 0.42 })
      );
      pTop.position.set(px, 13.25, pz);
      this.group.add(pStem, pTop);
    }

    // Recessed Dark Interior Garage Wall + High-Contrast Checkered Epoxy Floor
    const garageIntTex = this._makeGarageInteriorTexture();
    const garageIntMat = new THREE.MeshStandardMaterial({
      map: garageIntTex,
      emissive: new THREE.Color(0xffe8c2),
      emissiveMap: garageIntTex,
      emissiveIntensity: 0.72,
      roughness: 0.38,
    });
    const backStructure = new THREE.Mesh(
      new THREE.BoxGeometry(340, 5.2, 2.2),
      [carbonFasciaMat, carbonFasciaMat, carbonFasciaMat, carbonFasciaMat, carbonFasciaMat, garageIntMat]
    );
    backStructure.position.set(garX, 2.6, garZ + 5.6);
    this.group.add(backStructure);

    const garageFloorTex = this._makeCheckeredFloorTexture();
    const garageFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(340, 13.8),
      new THREE.MeshStandardMaterial({ map: garageFloorTex, roughness: 0.32, metalness: 0.18 })
    );
    garageFloor.rotation.x = -Math.PI / 2;
    garageFloor.position.set(garX, 0.032, garZ - 0.2);
    garageFloor.receiveShadow = true;
    this.group.add(garageFloor);

    // Individual Deep 3D Open Garage Bays with 3D Stacked Pirelli Tire Racks, Tool Chests & Overhead Trusses!
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
        emissiveIntensity: 0.36,
        roughness: 0.28,
      });
    });

    const ceilingPanelMat = new THREE.MeshBasicMaterial({ color: 0xfff5dc });
    const bayTireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.32, 12);
    bayTireGeo.rotateZ(Math.PI * 0.5);
    const bayTireMat = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.78 });
    const toolCabinetGeo = new THREE.BoxGeometry(2.6, 1.35, 0.95);
    const toolCabinetMat = new THREE.MeshStandardMaterial({ color: 0xc91622, roughness: 0.34, metalness: 0.38 });
    const bayTrussGeo = new THREE.BoxGeometry(20.5, 0.28, 0.32);

    const tireRackMatrices = [];
    const toolChestMatrices = [];
    const bayTrussMatrices = [];
    const bayDummy = new THREE.Object3D();

    let bayIdx = 0;
    for (let bx = garX - 150; bx <= garX + 150; bx += 25) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 5.2, 14.0), carbonFasciaMat);
      pillar.position.set(bx, 2.6, garZ);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.group.add(pillar);

      if (bx < garX + 150) {
        const lightPanel = new THREE.Mesh(new THREE.PlaneGeometry(18.5, 4.2), ceilingPanelMat);
        lightPanel.rotation.x = Math.PI / 2;
        lightPanel.position.set(bx + 12.5, 5.05, garZ - 1.5);
        this.group.add(lightPanel);

        // Overhead 3D garage gantry beam inside each open bay
        bayDummy.position.set(bx + 12.5, 4.45, garZ - 3.2);
        bayDummy.rotation.set(0, 0, 0);
        bayDummy.scale.set(1, 1, 1);
        bayDummy.updateMatrix();
        bayTrussMatrices.push(bayDummy.matrix.clone());

        // 3D Red mechanic tool chest inside bay
        bayDummy.position.set(bx + 5.8, 0.68, garZ + 2.6);
        bayDummy.updateMatrix();
        toolChestMatrices.push(bayDummy.matrix.clone());

        // 2-tier x 4-tire 3D Pirelli tire rack inside bay
        for (let rowT = 0; rowT < 2; rowT++) {
          for (let colT = 0; colT < 4; colT++) {
            bayDummy.position.set(bx + 17.2 + colT * 0.44, 0.46 + rowT * 0.82, garZ + 1.8);
            bayDummy.updateMatrix();
            tireRackMatrices.push(bayDummy.matrix.clone());
          }
        }

        const hMat = teamHeaderMats[bayIdx % teamHeaderMats.length];
        const hdr = new THREE.Mesh(
          new THREE.BoxGeometry(22.8, 1.12, 0.58),
          [this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, hMat]
        );
        hdr.position.set(bx + 12.5, 4.72, garZ - 7.05);
        this.group.add(hdr);
        bayIdx++;
      }
    }

    if (tireRackMatrices.length) {
      const trInst = new THREE.InstancedMesh(bayTireGeo, bayTireMat, tireRackMatrices.length);
      tireRackMatrices.forEach((m, k) => trInst.setMatrixAt(k, m));
      trInst.instanceMatrix.needsUpdate = true;
      this.group.add(trInst);
    }
    if (toolChestMatrices.length) {
      const tcInst = new THREE.InstancedMesh(toolCabinetGeo, toolCabinetMat, toolChestMatrices.length);
      toolChestMatrices.forEach((m, k) => tcInst.setMatrixAt(k, m));
      tcInst.instanceMatrix.needsUpdate = true;
      this.group.add(tcInst);
    }
    if (bayTrussMatrices.length) {
      const btInst = new THREE.InstancedMesh(bayTrussGeo, gunmetalTrimMat, bayTrussMatrices.length);
      bayTrussMatrices.forEach((m, k) => btInst.setMatrixAt(k, m));
      btInst.instanceMatrix.needsUpdate = true;
      this.group.add(btInst);
    }

    // Save VIP rooftop terrace bounds so _buildGrandstands populates it with animated 3D cheering crowds!
    this._paddockTerraceBounds = { centerX: garX, zFront: garZ - 7.8, width: 316, yBase: 10.52 };

    // 80 KM/H Pit Speed Limit Line + Grounded FIA 80 Limit Signpost + High-Vis Pit-Entry Chevron Gore Strip!
    const chevronCanvas = document.createElement('canvas');
    chevronCanvas.width = 256;
    chevronCanvas.height = 512;
    const cctx = chevronCanvas.getContext('2d');
    cctx.fillStyle = '#0d1726';
    cctx.fillRect(0, 0, 256, 512);
    cctx.fillStyle = isVegas ? '#00f0ff' : '#ffd600';
    for (let y = -128; y < 512; y += 64) {
      cctx.beginPath();
      cctx.moveTo(16, y + 44);
      cctx.lineTo(128, y);
      cctx.lineTo(240, y + 44);
      cctx.lineTo(240, y + 72);
      cctx.lineTo(128, y + 28);
      cctx.lineTo(16, y + 72);
      cctx.closePath();
      cctx.fill();
    }
    cctx.fillStyle = '#ffffff';
    cctx.fillRect(6, 0, 8, 512);
    cctx.fillRect(242, 0, 8, 512);
    const chevronTex = new THREE.CanvasTexture(chevronCanvas);
    chevronTex.wrapS = THREE.RepeatWrapping;
    chevronTex.wrapT = THREE.RepeatWrapping;
    chevronTex.repeat.set(1, 5);
    chevronTex.colorSpace = THREE.SRGBColorSpace;

    const goreFrame = this.sampleAt(928, ROAD_HALF_WIDTH + 2.1);
    const goreYaw = Math.atan2(goreFrame.tangent.z, goreFrame.tangent.x);
    const goreStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(58, 3.2),
      new THREE.MeshStandardMaterial({
        map: chevronTex,
        roughness: 0.4,
        emissive: new THREE.Color(0xffffff),
        emissiveMap: chevronTex,
        emissiveIntensity: isVegas ? 0.55 : 0.26,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    goreStrip.rotation.x = -Math.PI / 2;
    goreStrip.rotation.z = -goreYaw;
    goreStrip.position.copy(goreFrame.pos).add(new THREE.Vector3(0, 0.031, 0));
    this.group.add(goreStrip);

    // Pit Entry Directional Signpost at s = 914
    const pitInTex = this._makeMotorsportBanner('PIT ENTRY ❯❯', 'BOX LANE RIGHT', '#ffd600', '#e09e00', '#0b1018', '#d91424', 'IN', 512, 160);
    const pitInMat = new THREE.MeshStandardMaterial({
      map: pitInTex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: pitInTex,
      emissiveIntensity: 0.42,
      roughness: 0.25,
    });
    const pitInPos = this.sampleAt(914, ROAD_HALF_WIDTH + 4.4).pos;
    const pitInBoard = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 1.05, 2.5),
      [pitInMat, pitInMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat]
    );
    pitInBoard.position.copy(pitInPos).add(new THREE.Vector3(0, 1.05, 0));
    this.group.add(pitInBoard);

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
    g.addColorStop(0.0, '#07111f');
    g.addColorStop(0.45, isNight ? '#1c3b63' : '#122b46');
    g.addColorStop(1.0, isNight ? '#ffca6b' : '#2a5680');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 128);

    // Warm lounge ceiling lights + dark structural curtain-wall mullions
    ctx.fillStyle = 'rgba(255, 232, 176, 0.85)';
    for (let x = 10; x < 512; x += 32) {
      ctx.fillRect(x, 18, 20, 8);
    }
    ctx.fillStyle = '#0c111a';
    for (let x = 0; x < 512; x += 32) {
      ctx.fillRect(x, 0, 5, 128);
    }
    ctx.fillRect(0, 0, 512, 10);
    ctx.fillRect(0, 90, 512, 6);
    ctx.fillRect(0, 118, 512, 10);

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
    ctx.fillStyle = '#181e29';
    ctx.fillRect(0, 0, 512, 128);

    // High-tech dark carbon F1 garage wall with glowing FOM telemetry screens & Snap-On cabinets
    for (let bx = 0; bx < 512; bx += 128) {
      ctx.fillStyle = '#232c3b';
      ctx.fillRect(bx + 5, 6, 118, 116);
      ctx.fillStyle = '#d91424';
      ctx.fillRect(bx + 5, 6, 118, 8);
      // Red tool cabinet
      ctx.fillStyle = '#c81622';
      ctx.fillRect(bx + 12, 66, 44, 52);
      ctx.fillStyle = '#dce4ef';
      for (let ry = 73; ry < 114; ry += 9) ctx.fillRect(bx + 16, ry, 36, 3);
      // Multi-screen FOM telemetry wall
      ctx.fillStyle = '#050d1a';
      ctx.fillRect(bx + 62, 20, 52, 34);
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(bx + 66, 25, 44, 6);
      ctx.fillStyle = '#00e676';
      ctx.fillRect(bx + 66, 35, 30, 7);
      ctx.fillStyle = '#ffd600';
      ctx.fillRect(bx + 66, 45, 38, 5);
      // Pirelli tire rack graphic
      ctx.fillStyle = '#0e1116';
      for (let tx = 0; tx < 3; tx++) {
        ctx.fillRect(bx + 64 + tx * 16, 70, 13, 44);
        ctx.fillStyle = tx === 0 ? '#ff1e28' : (tx === 1 ? '#ffd600' : '#ffffff');
        ctx.fillRect(bx + 66 + tx * 16, 76, 9, 4);
        ctx.fillStyle = '#0e1116';
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
        ctx.fillStyle = (x + y) % 2 === 0 ? '#2b3342' : '#171c26';
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

  _makeShowroomGridSlotTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 512, 256);

    // Twin dark vulcanized Pirelli launch burnout rubber streaks!
    const burnGrad = ctx.createLinearGradient(0, 0, 420, 0);
    burnGrad.addColorStop(0.0, 'rgba(6, 7, 10, 0.0)');
    burnGrad.addColorStop(0.25, 'rgba(6, 7, 10, 0.72)');
    burnGrad.addColorStop(0.85, 'rgba(6, 7, 10, 0.82)');
    burnGrad.addColorStop(1.0, 'rgba(6, 7, 10, 0.15)');
    ctx.fillStyle = burnGrad;
    ctx.fillRect(20, 34, 410, 44);
    ctx.fillRect(20, 178, 410, 44);

    // Crisp FIA White Grid U-Bracket + Red/Yellow Wheel-Stop Chevrons
    ctx.fillStyle = '#f8fbff';
    ctx.fillRect(458, 16, 22, 224);
    ctx.fillRect(180, 16, 298, 14);
    ctx.fillRect(180, 226, 298, 14);

    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#ffd600' : '#e41c24';
      ctx.fillRect(428, 32 + i * 32, 22, 28);
    }

    // Stenciled "P1" FIA Grid Slot Designation on tarmac
    ctx.save();
    ctx.translate(335, 128);
    ctx.rotate(-Math.PI * 0.5);
    ctx.font = '900 italic 54px "Segoe UI", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 214, 0, 0.88)';
    ctx.fillText('P1 • FIA', 0, 0);
    ctx.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // --------------------------------------------------------------------------
  // 6. BLENDER .GLB SPACE-FRAME START GANTRY, 5 START LIGHTS & FIA GRID STALLS
  // --------------------------------------------------------------------------
  _buildStartGantryAndGridBoxes() {
    const envCache = FujiTrack._envGlbCache;
    const trussMat = new THREE.MeshStandardMaterial({ color: 0xdce4f0, metalness: 0.82, roughness: 0.22 });
    const spanZ = ROAD_HALF_WIDTH + 4.3;

    if (envCache?.gantryTrussGeo) {
      const glbGantry = new THREE.Mesh(envCache.gantryTrussGeo, trussMat);
      glbGantry.castShadow = true;
      glbGantry.receiveShadow = true;
      this.group.add(glbGantry);
    } else {
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
        for (let yR = 2.0; yR <= 8.5; yR += 2.1) {
          const rung = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.14, 1.12), trussMat);
          rung.position.set(0, yR, side * spanZ);
          this.group.add(rung);
        }
      }
      for (const yOff of [7.35, 9.65]) {
        for (const xOff of [-0.55, 0.55]) {
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, spanZ * 2.06, 10), trussMat);
          beam.rotation.x = Math.PI / 2;
          beam.position.set(xOff, yOff, 0);
          this.group.add(beam);
        }
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
      new THREE.BoxGeometry(1.18, 2.25, spanZ * 1.94),
      [bannerFaceMat, bannerFaceMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat]
    );
    banner.castShadow = true;
    banner.position.set(0, 8.52, 0);
    this.group.add(banner);

    const timingCrownTex = this._makeMotorsportBanner(
      'FIA WORLD CHAMPIONSHIP • POLE POSITION 2026',
      'START / FINISH • SECTOR 1 LIVE TIMING',
      '#08111f',
      '#0d1f38',
      '#00f0ff',
      '#ffd600',
      'FIA',
      1024,
      128
    );
    const timingCrownMat = new THREE.MeshStandardMaterial({
      map: timingCrownTex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: timingCrownTex,
      emissiveIntensity: 0.55,
      roughness: 0.22,
    });
    const timingCrown = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 1.05, spanZ * 1.42),
      [timingCrownMat, timingCrownMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat]
    );
    timingCrown.position.set(0, 10.35, 0);
    this.group.add(timingCrown);

    // Checkered Start/Finish Line
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

    // Hero Showroom #1 Grid Pad (s = 993.5, lat = -3.0) with Burnout Streaks & Yellow/Red FIA Chevrons!
    const heroPadTex = this._makeShowroomGridSlotTexture();
    const heroPadMat = new THREE.MeshStandardMaterial({
      map: heroPadTex,
      transparent: true,
      roughness: 0.68,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const heroFrame = this.sampleAt(993.5, -3.0);
    const heroPad = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 3.6), heroPadMat);
    heroPad.rotation.x = -Math.PI / 2;
    heroPad.position.set(heroFrame.pos.x - 0.6, 0.031, heroFrame.pos.z);
    heroPad.receiveShadow = true;
    this.group.add(heroPad);

    // Full FIA U-Bracket Starting Grid Stalls + Yellow/Red Wheel-Stop Lines for all 16 slots!
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
    const redAlignMat = new THREE.MeshBasicMaterial({
      color: 0xe41c24,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const burnoutMat = new THREE.MeshBasicMaterial({
      color: 0x090a0d,
      transparent: true,
      opacity: 0.58,
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

      const frontBar = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 2.56), stallMat);
      frontBar.rotation.x = -Math.PI / 2;
      frontBar.position.set(2.48, 0, 0);
      stallGroup.add(frontBar);

      for (const zSide of [-1.20, 1.20]) {
        const wingBar = new THREE.Mesh(new THREE.PlaneGeometry(2.65, 0.16), stallMat);
        wingBar.rotation.x = -Math.PI / 2;
        wingBar.position.set(1.28, 0, zSide);
        stallGroup.add(wingBar);
      }

      for (const zTire of [-0.76, 0.76]) {
        const burn = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.42), burnoutMat);
        burn.rotation.x = -Math.PI / 2;
        burn.position.set(-0.4, -0.001, zTire);
        stallGroup.add(burn);
      }

      const axStrip = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.92), yellowAlignMat);
      axStrip.rotation.x = -Math.PI / 2;
      axStrip.position.set(1.55, 0, slot % 2 === 0 ? -1.44 : 1.44);
      stallGroup.add(axStrip);

      const redStop = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 1.85), redAlignMat);
      redStop.rotation.x = -Math.PI / 2;
      redStop.position.set(2.24, 0, 0);
      stallGroup.add(redStop);

      this.group.add(stallGroup);
    }

    // 5 FIA Twin-Lens Start Light Pods with Sun-Visor Hoods
    this.gantryLights = [];
    const podMat = new THREE.MeshStandardMaterial({ color: 0x10141c, metalness: 0.55, roughness: 0.35 });
    for (let i = 0; i < 5; i++) {
      const zOff = (i - 2) * 1.78;
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.68, 0.96), podMat);
      pod.position.set(-0.74, 6.32, zOff);
      this.group.add(pod);

      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 1.02), podMat);
      visor.position.set(-1.12, 7.10, zOff);
      this.group.add(visor);

      const bulbMat = new THREE.MeshBasicMaterial({ color: 0x2b0a0a });
      for (const yLens of [6.66, 5.98]) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 14), bulbMat);
        bulb.scale.set(0.55, 1.0, 1.0);
        bulb.position.set(-1.04, yLens, zOff);
        this.group.add(bulb);
      }
      this.gantryLights.push(bulbMat);
    }
  }

  setGantryLights(redCount, greenOn = false, yellowFlash = false) {
    this._lastGantryState = { redCount, greenOn, yellowFlash };
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

      // Top LED floodlight brow + twin underside volumetric downlight cones illuminating the track
      const bridgeLampMat = new THREE.MeshBasicMaterial({
        color: this.trackDef.theme === 'VEGAS' ? 0x00f0ff : 0xfff8e6,
      });
      const topLightBar = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.16, span * 1.92), bridgeLampMat);
      topLightBar.position.set(0, 9.42, 0);
      gGroup.add(topLightBar);

      const bridgeConeMat = new THREE.MeshBasicMaterial({
        color: this.trackDef.theme === 'VEGAS' ? 0x80f8ff : 0xfff3d1,
        transparent: true,
        opacity: this.trackDef.theme === 'VEGAS' ? 0.085 : 0.045,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      for (const zCone of [-3.6, 3.6]) {
        const downCone = new THREE.Mesh(new THREE.ConeGeometry(5.2, 6.9, 14, 1, true), bridgeConeMat);
        downCone.position.set(0, 3.5, zCone);
        gGroup.add(downCone);
      }

      this.group.add(gGroup);
    }

    // Trackside Stadium Floodlight Poles + Volumetric Light-Cones & Asphalt Light Pools across all 6 circuits!
    const isVegas = this.trackDef.theme === 'VEGAS';
    const floodPoleMat = new THREE.MeshStandardMaterial({ color: 0xaab6c8, metalness: 0.80, roughness: 0.24 });
    const floodBulbMat = new THREE.MeshBasicMaterial({ color: isVegas ? 0xe6fcff : 0xfff9e6 });
    const floodConeMat = new THREE.MeshBasicMaterial({
      color: isVegas ? 0x70f4ff : 0xfff2cc,
      transparent: true,
      opacity: isVegas ? 0.095 : 0.048,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const floodPoolMat = new THREE.MeshBasicMaterial({
      color: isVegas ? 0x40e8ff : 0xfff0c2,
      transparent: true,
      opacity: isVegas ? 0.14 : 0.065,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const floodConeGeo = new THREE.ConeGeometry(8.2, 13.4, 14, 1, true);
    const floodPoolGeo = new THREE.CircleGeometry(7.2, 18);
    floodPoolGeo.rotateX(-Math.PI / 2);

    const floodStep = isVegas ? 44 : 62;
    for (let s = 22; s < 978; s += floodStep) {
      if (this.trackDef.tunnelRangeS && s >= this.trackDef.tunnelRangeS[0] - 8 && s <= this.trackDef.tunnelRangeS[1] + 8) {
        continue;
      }
      if (this.trackDef.overpassRangeS && s >= this.trackDef.overpassRangeS[0] - 10 && s <= this.trackDef.overpassRangeS[1] + 10) {
        continue;
      }
      const fr = this.sampleAt(s, -(ROAD_HALF_WIDTH + 6.5));
      if (this.trackDef.overpassRangeS && fr.pos.y > 6.5) continue;
      const yaw = Math.atan2(fr.tangent.z, fr.tangent.x);

      const rig = new THREE.Group();
      rig.position.copy(fr.pos);
      rig.rotation.y = -yaw;

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.24, 12.8, 8), floodPoleMat);
      mast.position.set(0, 6.4, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 3.6), floodPoleMat);
      arm.position.set(0, 12.6, 1.7);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 2.6), this.darkFrameMat);
      head.position.set(0, 12.45, 2.9);
      head.rotation.x = 0.32;
      const lens = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.18, 2.42), floodBulbMat);
      lens.position.set(0, 12.28, 2.95);
      lens.rotation.x = 0.32;

      const cone = new THREE.Mesh(floodConeGeo, floodConeMat);
      cone.position.set(0, 6.1, 5.2);
      cone.rotation.x = -0.34;

      const pool = new THREE.Mesh(floodPoolGeo, floodPoolMat);
      pool.position.set(0, 0.035, 6.8);

      rig.add(mast, arm, head, lens, cone, pool);
      this.group.add(rig);
    }

    // FIA Grade-1 Wire Catch-Fencing along Main Straight Spectator Corridor (Blender .glb or fallback)
    const envCache = FujiTrack._envGlbCache;
    const fencePostMat = new THREE.MeshStandardMaterial({ color: 0xa2afc2, metalness: 0.78, roughness: 0.28 });
    const meshFenceMat = new THREE.MeshBasicMaterial({
      color: 0xc2d2e8,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const dummy = new THREE.Object3D();
    if (envCache?.catchFencePostGeo && envCache?.catchFenceWireGeo) {
      const cfMatrices = [];
      for (let x = -224; x <= 524; x += 12.4) {
        dummy.position.set(x, 0.0, -(ROAD_HALF_WIDTH + 5.88));
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        cfMatrices.push(dummy.matrix.clone());
      }
      const cfPostInst = new THREE.InstancedMesh(envCache.catchFencePostGeo, fencePostMat, cfMatrices.length);
      const cfWireInst = new THREE.InstancedMesh(envCache.catchFenceWireGeo, meshFenceMat, cfMatrices.length);
      cfMatrices.forEach((m, i) => {
        cfPostInst.setMatrixAt(i, m);
        cfWireInst.setMatrixAt(i, m);
      });
      cfPostInst.instanceMatrix.needsUpdate = true;
      cfWireInst.instanceMatrix.needsUpdate = true;
      this.group.add(cfPostInst, cfWireInst);
    } else {
      const fencePostGeo = new THREE.CylinderGeometry(0.06, 0.075, 4.3, 6);
      const postMatrices = [];
      for (let x = -225; x <= 525; x += 12.5) {
        dummy.position.set(x, 2.65, -(ROAD_HALF_WIDTH + 5.88));
        dummy.rotation.set(0.11, 0, 0);
        dummy.updateMatrix();
        postMatrices.push(dummy.matrix.clone());
      }
      const postInst = new THREE.InstancedMesh(fencePostGeo, fencePostMat, postMatrices.length);
      postMatrices.forEach((m, i) => postInst.setMatrixAt(i, m));
      this.group.add(postInst);

      const fencePanel = new THREE.Mesh(new THREE.PlaneGeometry(750, 3.45), meshFenceMat);
      fencePanel.position.set(150, 2.7, -(ROAD_HALF_WIDTH + 5.84));
      this.group.add(fencePanel);
    }

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
  // 7. BLENDER .GLB FIA 300m/200m/100m/50m BRAKING BOARDS & SPONSOR BILLBOARDS
  // --------------------------------------------------------------------------
  _buildBrakingBoardsAndBillboards() {
    this.billboards = [];
    const envCache = FujiTrack._envGlbCache;
    const isVegas = this.trackDef.theme === 'VEGAS';
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x647082, metalness: 0.75, roughness: 0.3 });

    // A. Grounded FIA 300m / 200m / 100m / 50m Braking Marker Boards + Apex Turn-In Chevrons & Bollards
    const brakeDistances = [300, 200, 100, 50];
    const brakeMats = new Map();
    for (const distM of brakeDistances) {
      const tex = this._makeBrakingBoardTexture(distM, isVegas);
      brakeMats.set(
        distM,
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.22,
          emissive: new THREE.Color(0xffffff),
          emissiveMap: tex,
          emissiveIntensity: isVegas ? 0.78 : 0.38,
        })
      );
    }

    const apexChevronLeftTex = this._makeApexChevronTexture(false, isVegas);
    const apexChevronRightTex = this._makeApexChevronTexture(true, isVegas);
    const chevronMatLeft = new THREE.MeshStandardMaterial({
      map: apexChevronLeftTex,
      roughness: 0.25,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: apexChevronLeftTex,
      emissiveIntensity: isVegas ? 0.68 : 0.30,
    });
    const chevronMatRight = new THREE.MeshStandardMaterial({
      map: apexChevronRightTex,
      roughness: 0.25,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: apexChevronRightTex,
      emissiveIntensity: isVegas ? 0.68 : 0.30,
    });
    const apexBollardMat = new THREE.MeshStandardMaterial({
      color: 0xff5500,
      roughness: 0.3,
      emissive: new THREE.Color(0xff4400),
      emissiveIntensity: 0.42,
    });
    const bollardBandMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const markerFloodMat = new THREE.MeshBasicMaterial({ color: isVegas ? 0x00f0ff : 0xfff8e6 });

    const zones = this.trackDef.brakingZones || [
      { entryS: 162, side: -1 },
      { entryS: 610, side: -1 },
    ];

    const glbBrakeFrameMatrices = [];
    const glbBrakeDummy = new THREE.Object3D();

    for (const bz of zones) {
      for (const distM of brakeDistances) {
        const ms = wrapS(bz.entryS - distM / this.realMetersPerGameMeter);
        if (this.trackDef.tunnelRangeS && ms >= this.trackDef.tunnelRangeS[0] && ms <= this.trackDef.tunnelRangeS[1]) {
          continue;
        }
        const side = (bz.side > 0 && (ms >= 898 || ms <= 126)) ? -1 : bz.side;
        const fr = this.sampleAt(ms, side * (ROAD_HALF_WIDTH + 3.45));
        const yaw = Math.atan2(fr.tangent.z, fr.tangent.x);
        const rotY = -yaw + (side > 0 ? -0.16 : 0.16);
        const bMat = brakeMats.get(distM);

        if (envCache?.brakeFrameGeo && envCache?.brakeFaceGeo) {
          glbBrakeDummy.position.copy(fr.pos);
          glbBrakeDummy.rotation.set(0, rotY, 0);
          glbBrakeDummy.scale.set(1, 1, 1);
          glbBrakeDummy.updateMatrix();
          glbBrakeFrameMatrices.push(glbBrakeDummy.matrix.clone());

          const signFace = new THREE.Mesh(envCache.brakeFaceGeo, bMat);
          signFace.position.copy(fr.pos);
          signFace.rotation.y = rotY;
          signFace.castShadow = true;
          this.group.add(signFace);
        } else {
          const markerGroup = new THREE.Group();
          markerGroup.position.copy(fr.pos);
          markerGroup.rotation.y = rotY;

          const sign = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 1.54, 2.18),
            [bMat, bMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat]
          );
          sign.position.y = 1.62;
          sign.castShadow = true;
          markerGroup.add(sign);

          const hood = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.10, 2.02), markerFloodMat);
          hood.position.set(-0.12, 2.44, 0);
          markerGroup.add(hood);

          for (const zLeg of [-0.66, 0.66]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.62, 8), strutMat);
            leg.position.set(0.08, 0.81, zLeg);
            markerGroup.add(leg);
          }
          this.group.add(markerGroup);
        }
      }

      // High-Visibility FIA Turn-In Chevron Boards + Inside Apex Marker Bollard at Corner Entry!
      const apexS = wrapS(bz.entryS + 14);
      if (!(this.trackDef.tunnelRangeS && apexS >= this.trackDef.tunnelRangeS[0] && apexS <= this.trackDef.tunnelRangeS[1])) {
        const kApex = this.getPhysicsCurvature(apexS);
        const turnRight = kApex >= 0;
        const outsideSide = (bz.side > 0 && (apexS >= 898 || apexS <= 126)) ? -1 : bz.side;
        const cMat = turnRight ? chevronMatRight : chevronMatLeft;

        for (let ci = 0; ci < 2; ci++) {
          const cs = wrapS(bz.entryS + 6 + ci * 10);
          const cfr = this.sampleAt(cs, outsideSide * (ROAD_HALF_WIDTH + 5.15));
          const cyaw = Math.atan2(cfr.tangent.z, cfr.tangent.x);
          const chev = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 1.12, 2.35),
            [cMat, cMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat]
          );
          chev.position.copy(cfr.pos).add(new THREE.Vector3(0, 1.38, 0));
          chev.rotation.y = -cyaw + (outsideSide > 0 ? -0.24 : 0.24);
          this.group.add(chev);
        }

        // Fluorescent Orange/White FIA Inside Apex Bollard on inner kerb shoulder
        const insideSide = -outsideSide;
        if (!(insideSide > 0 && (apexS >= 900 || apexS <= 124))) {
          const ifr = this.sampleAt(apexS, insideSide * (ROAD_HALF_WIDTH + CURB_WIDTH + 0.65));
          const bollard = new THREE.Group();
          bollard.position.copy(ifr.pos);
          const bCore = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.21, 0.96, 10), apexBollardMat);
          bCore.position.y = 0.48;
          const bBand = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.185, 0.26, 10), bollardBandMat);
          bBand.position.y = 0.62;
          bollard.add(bCore, bBand);
          this.group.add(bollard);
        }
      }
    }

    if (glbBrakeFrameMatrices.length && envCache?.brakeFrameGeo) {
      const bfInst = new THREE.InstancedMesh(envCache.brakeFrameGeo, strutMat, glbBrakeFrameMatrices.length);
      glbBrakeFrameMatrices.forEach((m, i) => bfInst.setMatrixAt(i, m));
      bfInst.instanceMatrix.needsUpdate = true;
      bfInst.castShadow = true;
      this.group.add(bfInst);
    }

    // B. Blender .glb Sponsor Billboard Rigs (Steel A-Frame Bracing, Catwalk, Floodlights & Vector Sponsor Banners)
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
      if (envCache?.billboardFrameGeo && envCache?.billboardFaceGeo) {
        const frameMesh = new THREE.Mesh(envCache.billboardFrameGeo, this.darkFrameMat);
        frameMesh.castShadow = true;
        frameMesh.receiveShadow = true;
        const bannerFace = new THREE.Mesh(envCache.billboardFaceGeo, faceMat);
        bannerFace.castShadow = true;
        bannerFace.receiveShadow = true;
        const lightHood = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 7.1), lightBarMat);
        lightHood.position.set(-0.48, 3.56, 0);
        holder.add(frameMesh, bannerFace, lightHood);
      } else {
        const board = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 2.68, 7.7),
          [faceMat, faceMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat]
        );
        board.castShadow = true;
        board.receiveShadow = true;
        board.position.y = 2.12;
        holder.add(board);

        const lightHood = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 7.2), lightBarMat);
        lightHood.position.set(-0.18, 3.52, 0);
        holder.add(lightHood);

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

  _makeApexChevronTexture(turnRight, isNight) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0e131d';
    ctx.fillRect(0, 0, 512, 256);

    ctx.fillStyle = isNight ? '#00f0ff' : '#ffd600';
    const dir = turnRight ? 1 : -1;
    for (let i = -1; i < 4; i++) {
      const cx = 96 + i * 118;
      ctx.beginPath();
      ctx.moveTo(cx - dir * 36, 20);
      ctx.lineTo(cx + dir * 24, 20);
      ctx.lineTo(cx + dir * 72, 128);
      ctx.lineTo(cx + dir * 24, 236);
      ctx.lineTo(cx - dir * 36, 236);
      ctx.lineTo(cx + dir * 12, 128);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, 500, 244);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _makeBrakingBoardTexture(distM, isNight) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 384;
    const ctx = c.getContext('2d');

    // Deep high-contrast backing with luminous outer + inner FIA border
    const bg = ctx.createLinearGradient(0, 0, 0, 384);
    bg.addColorStop(0.0, isNight ? '#061c36' : '#064e22');
    bg.addColorStop(1.0, isNight ? '#030e1c' : '#032b12');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 384);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.strokeRect(10, 10, 492, 364);

    ctx.strokeStyle = isNight ? '#00f0ff' : '#ffd600';
    ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, 464, 336);

    // FIA Braking Countdown Bars (300m = 3 bars, 200m = 2 bars, 150m = 3 bars, 100m = 1 bar, 50m = twin chevrons)
    ctx.fillStyle = isNight ? '#ff1493' : '#ffd600';
    if (distM === 50) {
      ctx.fillRect(42, 44, 428, 36);
    } else {
      const bars = distM >= 250 || distM === 150 ? 3 : (distM >= 180 ? 2 : 1);
      for (let i = 0; i < bars; i++) {
        ctx.fillRect(42 + i * 48, 38, 32, 54);
      }
    }

    // High-contrast dark numeral badge + ultra-bold outlined distance numerals for 300+ km/h mobile readability
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fillRect(36, 104, 440, 186);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 italic 176px "Segoe UI", "Arial Black", sans-serif';
    ctx.lineWidth = 16;
    ctx.strokeStyle = '#05080f';
    ctx.strokeText(`${distM}`, 256, 202);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${distM}`, 256, 202);

    // High-visibility footer ribbon
    ctx.fillStyle = isNight ? '#00f0ff' : '#ffd600';
    ctx.fillRect(28, 302, 456, 52);
    ctx.fillStyle = '#08101c';
    ctx.font = '900 36px "Segoe UI", "Arial Black", sans-serif';
    ctx.fillText('BRAKE • METERS', 256, 329);

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
  // 8. BLENDER .GLB 3D GRANDSTANDS + LIVING MEXICAN-WAVE CROWDS, 3D FLAGS, SMOKE FLARES & CONFETTI
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

  _makeFlareSmokeTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
    g.addColorStop(0.00, 'rgba(255, 255, 255, 0.62)');
    g.addColorStop(0.38, 'rgba(245, 248, 255, 0.36)');
    g.addColorStop(0.72, 'rgba(220, 228, 240, 0.12)');
    g.addColorStop(1.00, 'rgba(200, 210, 225, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _applyCrowdWaveShader(mat) {
    const uniforms = this._crowdUniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCrowdTime = uniforms.uTime;
      shader.uniforms.uCrowdExcitement = uniforms.uExcitement;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uCrowdTime;
          uniform float uCrowdExcitement;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 instPos = instanceMatrix[3].xyz;
            float fanSeed = fract(sin(dot(instPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
            float stadiumWave = pow(max(0.0, sin(uCrowdTime * 4.6 - instPos.x * 0.055 - instPos.z * 0.025)), 6.0);
            float cheerBounce = abs(sin(uCrowdTime * (5.4 + fanSeed * 2.8) + fanSeed * 6.2831));
            float jumpAmp = (0.12 + uCrowdExcitement * 0.16) * cheerBounce + (0.42 + uCrowdExcitement * 0.22) * stadiumWave;
            float upperW = clamp(position.y / 1.45, 0.0, 1.0);
            transformed.y += jumpAmp * (0.35 + 0.65 * upperW);
            transformed.x += sin(uCrowdTime * 6.6 + fanSeed * 6.2831) * (0.05 + 0.08 * stadiumWave) * upperW;
          #endif`
        );
    };
    mat.customProgramCacheKey = () => 'f1_crowd_wave_v2';
    return mat;
  }

  _applyFlagRippleShader(mat, flagSpanX = 2.25) {
    const uniforms = this._crowdUniforms;
    const spanStr = flagSpanX.toFixed(2);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCrowdTime = uniforms.uTime;
      shader.uniforms.uCrowdExcitement = uniforms.uExcitement;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uCrowdTime;
          uniform float uCrowdExcitement;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float clothU = clamp(position.x / ${spanStr}, 0.0, 1.0);
          float fSeed = 0.0;
          #ifdef USE_INSTANCING
            vec3 fInst = instanceMatrix[3].xyz;
            fSeed = fract(sin(dot(fInst.xz, vec2(19.19, 47.73))) * 29143.17) * 6.2831;
          #endif
          float ripplePhase = uCrowdTime * (7.8 + uCrowdExcitement * 3.4) + fSeed;
          transformed.z += sin(clothU * 5.6 - ripplePhase) * (0.28 + uCrowdExcitement * 0.15) * clothU;
          transformed.y += cos(clothU * 3.9 - ripplePhase * 0.84) * 0.09 * clothU;`
        );
    };
    mat.customProgramCacheKey = () => `f1_flag_ripple_${spanStr}`;
    return mat;
  }

  _buildGrandstands() {
    const envCache = FujiTrack._envGlbCache;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#485364';
    ctx.fillRect(0, 0, 512, 256);

    const theme = this.trackDef.theme;
    const shirtColors = theme === 'MONZA'
      ? ['#e41c24', '#ff2a2a', '#ffffff', '#009246', '#ffd600', '#ff6d00', '#d90429']
      : (theme === 'VEGAS'
        ? ['#ff1493', '#00f0ff', '#ffd600', '#ffffff', '#b388ff', '#00e676', '#ff6d00']
        : (theme === 'SILVERSTONE'
          ? ['#ff6d00', '#00f0ff', '#0038a8', '#ce1126', '#ffffff', '#ffd600', '#009246']
          : ['#e41c24', '#ff6d00', '#00d2be', '#ffd600', '#ffffff', '#1e41ff', '#00e676']));

    for (let row = 0; row < 16; row++) {
      const y = row * 16;
      ctx.fillStyle = '#6c7a8e';
      ctx.fillRect(0, y, 512, 5);
      ctx.fillStyle = '#323b4a';
      ctx.fillRect(0, y + 14, 512, 2);
      for (let col = 4; col < 508; col += 7) {
        const h = fastHash2D(col, row, 401);
        if (h < 0.88) {
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
      roughness: 0.64,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: crowdTex,
      emissiveIntensity: theme === 'VEGAS' ? 0.50 : 0.26,
    });

    // Architectural dark gunmetal/ribbed exterior cladding texture
    const extC = document.createElement('canvas');
    extC.width = 256;
    extC.height = 128;
    const ectx = extC.getContext('2d');
    ectx.fillStyle = theme === 'VEGAS' ? '#182236' : '#2b3444';
    ectx.fillRect(0, 0, 256, 128);
    ectx.fillStyle = theme === 'VEGAS' ? '#00f0ff' : '#4a586e';
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
      roughness: 0.44,
      metalness: 0.32,
      emissive: new THREE.Color(theme === 'VEGAS' ? 0x152238 : 0x0d121a),
      emissiveIntensity: 0.22,
    });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xf4f8ff,
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

    // Articulated 3D Spectator & 3D Flag-Waver Geometries (Blender .glb or rich procedural fallback)
    let spectatorGeo = envCache?.spectatorGeo;
    if (!spectatorGeo) {
      const torsoG = new THREE.BoxGeometry(0.56, 0.76, 0.34);
      torsoG.translate(0, 0.48, 0);
      const headG = new THREE.SphereGeometry(0.20, 8, 6);
      headG.translate(0, 1.06, 0);
      const armLG = new THREE.BoxGeometry(0.14, 0.58, 0.14);
      armLG.rotateZ(0.38);
      armLG.translate(-0.36, 0.98, 0.05);
      const armRG = new THREE.BoxGeometry(0.14, 0.58, 0.14);
      armRG.rotateZ(-0.38);
      armRG.translate(0.36, 0.98, 0.05);
      spectatorGeo = mergeSubGeometries([torsoG, headG, armLG, armRG]);
    }

    let flagWaverBodyGeo = envCache?.flagWaverBodyGeo;
    if (!flagWaverBodyGeo) {
      const poleG = new THREE.CylinderGeometry(0.035, 0.045, 2.85, 6);
      poleG.translate(0, 2.27, 0.34);
      flagWaverBodyGeo = mergeSubGeometries([spectatorGeo.clone(), poleG]);
    }

    let flagWaverClothGeo = envCache?.flagWaverClothGeo;
    if (!flagWaverClothGeo) {
      const fg = new THREE.PlaneGeometry(2.25, 1.28, 8, 3);
      fg.translate(1.125, 2.98, 0.34);
      flagWaverClothGeo = fg;
    }

    const crowdInstMat = this._applyCrowdWaveShader(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.56,
        metalness: 0.04,
        emissive: new THREE.Color(theme === 'VEGAS' ? 0x222838 : 0x141820),
        emissiveIntensity: theme === 'VEGAS' ? 0.38 : 0.16,
      })
    );
    const flagBodyMat = this._applyCrowdWaveShader(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.52,
      })
    );
    const flagClothMat = this._applyFlagRippleShader(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.38,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(0x222222),
        emissiveIntensity: theme === 'VEGAS' ? 0.45 : 0.20,
      }),
      2.25
    );

    const supporterFlagCols = theme === 'MONZA'
      ? [0xe41c24, 0x009246, 0xffffff, 0xffd600]
      : (theme === 'SILVERSTONE'
        ? [0xff6d00, 0x00f0ff, 0x0038a8, 0xce1126]
        : (theme === 'VEGAS'
          ? [0xff1493, 0x00f0ff, 0xffd600, 0x00e676]
          : [0xe51c23, 0xff6d00, 0x00e5ff, 0xffd600, 0xffffff]));
    const shirtPaletteCols = shirtColors.map((hex) => new THREE.Color(hex));
    const flagPaletteCols = supporterFlagCols.map((hex) => new THREE.Color(hex));

    const flashTex = this._makeCameraFlashTexture();
    const flashMat = new THREE.MeshBasicMaterial({
      map: flashTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const flashGeo = new THREE.PlaneGeometry(1.85, 1.85);

    const allFanInstances = [];
    const allFlagInstances = [];
    const allCameraFlashes = [];
    const allFlareSources = [];
    const glbStructMatrices = [];
    const glbRoofMatrices = [];
    let standSeed = 0;

    const worldDummy = new THREE.Object3D();
    const localPos = new THREE.Vector3();
    const standQuat = new THREE.Quaternion();
    const fanQuat = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);

    const spawnStandAndCrowd = (spanW, worldPos, worldYawRad, isMainStraight = false) => {
      const standGroup = new THREE.Group();
      standGroup.position.copy(worldPos);
      standGroup.rotation.y = worldYawRad;
      standQuat.setFromAxisAngle(yAxis, worldYawRad);
      const mySeed = standSeed++;
      const useGlbTribune = Boolean(envCache?.grandstandStructGeo && envCache?.grandstandRoofGeo);

      if (useGlbTribune) {
        const modCount = Math.max(2, Math.round(spanW / 28.0));
        const modW = spanW / modCount;
        const scaleX = modW / 28.0;
        for (let m = 0; m < modCount; m++) {
          const lx = -spanW * 0.5 + (m + 0.5) * modW;
          localPos.set(lx, 0, 0).applyQuaternion(standQuat).add(worldPos);
          worldDummy.position.copy(localPos);
          worldDummy.rotation.set(0, worldYawRad, 0);
          worldDummy.scale.set(scaleX, 1.0, 1.0);
          worldDummy.updateMatrix();
          glbStructMatrices.push(worldDummy.matrix.clone());
          glbRoofMatrices.push(worldDummy.matrix.clone());
        }
        // Subtle populated step backing plane so zero sky gaps ever peek between seats
        const tier = new THREE.Mesh(new THREE.PlaneGeometry(spanW - 2.2, 17.6), crowdMat);
        tier.position.set(0, 8.5, 0.1);
        tier.rotation.x = -0.64;
        standGroup.add(tier);
      } else {
        const base = new THREE.Mesh(new THREE.BoxGeometry(spanW, 3.4, 19.5), structMat);
        base.position.set(0, 1.7, 0);
        base.castShadow = true;
        base.receiveShadow = true;
        standGroup.add(base);

        const rearWall = new THREE.Mesh(new THREE.BoxGeometry(spanW, 16.6, 2.4), structMat);
        rearWall.position.set(0, 8.3, -8.5);
        rearWall.castShadow = true;
        standGroup.add(rearWall);

        for (const sx of [-spanW * 0.5 + 0.6, spanW * 0.5 - 0.6]) {
          const sideCheek = new THREE.Mesh(new THREE.BoxGeometry(1.2, 11.2, 16.5), structMat);
          sideCheek.position.set(sx, 7.2, -1.2);
          standGroup.add(sideCheek);
        }

        const tier = new THREE.Mesh(new THREE.PlaneGeometry(spanW - 2.4, 19.8), crowdMat);
        tier.position.set(0, 9.3, 1.3);
        tier.rotation.x = -0.62;
        standGroup.add(tier);

        const roof = new THREE.Mesh(new THREE.BoxGeometry(spanW + 3.0, 0.82, 23.0), canopyMat);
        roof.position.set(0, 17.6, 1.2);
        roof.rotation.x = 0.08;
        roof.castShadow = true;
        standGroup.add(roof);

        const step = spanW / 4;
        for (let px = -spanW * 0.44; px <= spanW * 0.45; px += step) {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 17.4, 8), this.darkFrameMat);
          col.position.set(px, 8.7, -7.2);
          standGroup.add(col);
        }
      }

      // Framed Front Sponsor Fascia Wall & Under-Canopy Broadcast Spotlights
      const fascia = new THREE.Mesh(
        new THREE.BoxGeometry(spanW + 0.4, 2.25, 0.65),
        [this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, this.darkFrameMat, fasciaMat, this.darkFrameMat]
      );
      fascia.position.set(0, 2.95, useGlbTribune ? 8.85 : 9.8);
      standGroup.add(fascia);

      const lightStrip = new THREE.Mesh(new THREE.BoxGeometry(spanW - 8.0, 0.22, 0.85), underLightMat);
      lightStrip.position.set(0, 16.55, 9.8);
      standGroup.add(lightStrip);

      // Populate Dense 3D Cheering Fans across 8 Stepped Stadium Rows!
      const usableW = spanW - 5.0;
      const cols = Math.max(18, Math.floor(usableW / 3.1));
      const rowCount = 8;
      for (let r = 0; r < rowCount; r++) {
        const rowY = useGlbTribune ? (3.96 + r * 1.24) : (3.90 + r * 1.48);
        const rowZ = useGlbTribune ? (6.55 - r * 1.65) : (5.20 - r * 1.12);
        for (let cIdx = 0; cIdx < cols; cIdx++) {
          const h = fastHash2D(cIdx, r, mySeed * 31 + 17);
          if (h > 0.84) continue;
          const fx = -usableW * 0.5 + (cIdx + 0.5) * (usableW / cols) + (h - 0.42) * 0.75;
          localPos.set(fx, rowY, rowZ).applyQuaternion(standQuat).add(worldPos);
          fanQuat.setFromAxisAngle(yAxis, worldYawRad + (h - 0.5) * 0.36);
          const sc = 0.94 + h * 0.26;
          worldDummy.position.copy(localPos);
          worldDummy.quaternion.copy(fanQuat);
          worldDummy.scale.setScalar(sc);
          worldDummy.updateMatrix();
          const shirtCol = shirtPaletteCols[(cIdx * 5 + r * 3 + mySeed) % shirtPaletteCols.length];
          allFanInstances.push({ matrix: worldDummy.matrix.clone(), color: shirtCol });
        }
      }

      // Populate 3D Flag-Waving Ultras across Lower, Mid & Upper Rows!
      const flagCount = Math.max(6, Math.floor(spanW / 18));
      for (let fi = 0; fi < flagCount; fi++) {
        const rSlot = (fi * 3 + mySeed) % rowCount;
        const fy = useGlbTribune ? (3.96 + rSlot * 1.24) : (3.90 + rSlot * 1.48);
        const fz = (useGlbTribune ? (6.55 - rSlot * 1.65) : (5.20 - rSlot * 1.12)) + 0.18;
        const fx = -usableW * 0.45 + (fi / Math.max(1, flagCount - 1)) * (usableW * 0.90);
        localPos.set(fx, fy, fz).applyQuaternion(standQuat).add(worldPos);
        worldDummy.position.copy(localPos);
        worldDummy.rotation.set(0, worldYawRad, 0);
        worldDummy.scale.setScalar(1.02);
        worldDummy.updateMatrix();
        allFlagInstances.push({
          matrix: worldDummy.matrix.clone(),
          bodyCol: shirtPaletteCols[(fi + mySeed * 2) % shirtPaletteCols.length],
          flagCol: flagPaletteCols[(fi + mySeed) % flagPaletteCols.length],
        });
      }

      // Team-Colored Motorsport Smoke Flare Ultra-Sections!
      const flareCount = isMainStraight ? 2 : 1;
      const flarePalette = theme === 'MONZA'
        ? [0xff1744, 0x00e676, 0xffffff, 0xffd600]
        : [0xff6d00, 0xff1744, 0x00e5ff, 0xffd600];
      for (let fl = 0; fl < flareCount; fl++) {
        const frac = flareCount === 1 ? 0.5 : (0.28 + fl * 0.44);
        const fx = -usableW * 0.42 + frac * usableW * 0.84;
        const fy = (useGlbTribune ? 6.45 : 6.85) + (fl % 2) * 2.2;
        const fz = (useGlbTribune ? 3.25 : 2.95) - (fl % 2) * 1.8;
        localPos.set(fx, fy, fz).applyQuaternion(standQuat).add(worldPos);
        allFlareSources.push({
          pos: localPos.clone(),
          color: new THREE.Color(flarePalette[(mySeed + fl) % flarePalette.length]),
          seed: mySeed * 2.3 + fl * 3.1,
        });
      }

      // Strobing HDR Camera Flashes across the crowd bowl
      const flashCount = isMainStraight ? 22 : Math.max(10, Math.floor(spanW / 12));
      for (let k = 0; k < flashCount; k++) {
        const h1 = fastHash2D(k, 1, mySeed * 53 + 9);
        const h2 = fastHash2D(k, 2, mySeed * 53 + 9);
        const rF = h2 * (rowCount - 1);
        const fx = (h1 - 0.5) * usableW;
        const fy = (useGlbTribune ? (3.96 + rF * 1.24) : (3.90 + rF * 1.48)) + 1.15;
        const fz = (useGlbTribune ? (6.55 - rF * 1.65) : (5.20 - rF * 1.12)) + 0.45;
        const flashMesh = new THREE.Mesh(flashGeo, flashMat);
        flashMesh.position.set(fx, fy, fz);
        flashMesh.visible = false;
        standGroup.add(flashMesh);
        allCameraFlashes.push({
          mesh: flashMesh,
          seed: mySeed * 19 + k * 3.7,
          isMainStraight,
          standIdx: mySeed,
        });
      }

      this.group.add(standGroup);
    };

    // 1. Main Straight 3-Block Grandstand Complex
    for (const gx of [-82, 172, 426]) {
      const gz = -(ROAD_HALF_WIDTH + 23.0);
      spawnStandAndCrowd(192, new THREE.Vector3(gx, 0, gz), 0, true);
    }

    // 2. Secondary Circuit-Specific Iconic Corner Tribunes
    const cornerStands = this.trackDef.cornerTribunes || [];
    for (const cs of cornerStands) {
      const dist = ROAD_HALF_WIDTH + 24.5;
      const fr = this.sampleAt(cs.s, cs.side * dist);
      const yaw = Math.atan2(fr.tangent.z, fr.tangent.x);
      const standYaw = -yaw + (cs.side < 0 ? 0 : Math.PI);
      spawnStandAndCrowd(cs.span || 115, fr.pos, standYaw, false);
    }

    // 3. Populate VIP Paddock Club Rooftop Terrace (facing -Z toward Pit Lane & Main Straight!)
    if (this._paddockTerraceBounds) {
      const tb = this._paddockTerraceBounds;
      const vipCount = 96;
      for (let i = 0; i < vipCount; i++) {
        const h1 = fastHash2D(i, 1, 887);
        const h2 = fastHash2D(i, 2, 887);
        const vx = tb.centerX - tb.width * 0.47 + (i / vipCount) * (tb.width * 0.94) + (h1 - 0.5) * 1.6;
        const vz = tb.zFront + 0.85 + h2 * 3.8;
        worldDummy.position.set(vx, tb.yBase, vz);
        worldDummy.rotation.set(0, Math.PI + (h1 - 0.5) * 0.45, 0);
        worldDummy.scale.setScalar(0.96 + h2 * 0.18);
        worldDummy.updateMatrix();
        allFanInstances.push({
          matrix: worldDummy.matrix.clone(),
          color: shirtPaletteCols[i % shirtPaletteCols.length],
        });

        if (i % 12 === 4) {
          worldDummy.position.set(vx, tb.yBase, vz - 0.25);
          worldDummy.rotation.set(0, Math.PI, 0);
          worldDummy.scale.setScalar(0.95);
          worldDummy.updateMatrix();
          allFlagInstances.push({
            matrix: worldDummy.matrix.clone(),
            bodyCol: shirtPaletteCols[(i + 2) % shirtPaletteCols.length],
            flagCol: flagPaletteCols[(i >> 2) % flagPaletteCols.length],
          });
        }
      }
    }

    // Flush Batched Blender .glb Grandstand Structures & Roofs
    if (glbStructMatrices.length && envCache?.grandstandStructGeo && envCache?.grandstandRoofGeo) {
      const gsStructInst = new THREE.InstancedMesh(envCache.grandstandStructGeo, structMat, glbStructMatrices.length);
      const gsRoofInst = new THREE.InstancedMesh(envCache.grandstandRoofGeo, canopyMat, glbRoofMatrices.length);
      glbStructMatrices.forEach((m, i) => {
        gsStructInst.setMatrixAt(i, m);
        gsRoofInst.setMatrixAt(i, m);
      });
      gsStructInst.instanceMatrix.needsUpdate = true;
      gsRoofInst.instanceMatrix.needsUpdate = true;
      gsStructInst.castShadow = true;
      gsStructInst.receiveShadow = true;
      gsRoofInst.castShadow = true;
      this.group.add(gsStructInst, gsRoofInst);
    }

    // Single GPU-Instanced Cheering Stadium Crowd (Mexican Wave + Individual Jumping!)
    if (allFanInstances.length) {
      const fanInst = new THREE.InstancedMesh(spectatorGeo, crowdInstMat, allFanInstances.length);
      allFanInstances.forEach((item, i) => {
        fanInst.setMatrixAt(i, item.matrix);
        fanInst.setColorAt(i, item.color);
      });
      fanInst.instanceMatrix.needsUpdate = true;
      if (fanInst.instanceColor) fanInst.instanceColor.needsUpdate = true;
      this.group.add(fanInst);
    }

    // Single GPU-Instanced 3D Flag-Waving Supporters (Rippling 3D Team Banners!)
    if (allFlagInstances.length) {
      const fwBodyInst = new THREE.InstancedMesh(flagWaverBodyGeo, flagBodyMat, allFlagInstances.length);
      const fwClothInst = new THREE.InstancedMesh(flagWaverClothGeo, flagClothMat, allFlagInstances.length);
      allFlagInstances.forEach((item, i) => {
        fwBodyInst.setMatrixAt(i, item.matrix);
        fwBodyInst.setColorAt(i, item.bodyCol);
        fwClothInst.setMatrixAt(i, item.matrix);
        fwClothInst.setColorAt(i, item.flagCol);
      });
      fwBodyInst.instanceMatrix.needsUpdate = true;
      fwClothInst.instanceMatrix.needsUpdate = true;
      if (fwBodyInst.instanceColor) fwBodyInst.instanceColor.needsUpdate = true;
      if (fwClothInst.instanceColor) fwClothInst.instanceColor.needsUpdate = true;
      this.group.add(fwBodyInst, fwClothInst);
    }

    // 4. Billowing Team-Colored Motorsport Smoke Flares above Grandstands!
    let smokeInst = null;
    const puffsPerFlare = 14;
    if (allFlareSources.length) {
      const smokeTex = this._makeFlareSmokeTexture();
      const p1 = new THREE.PlaneGeometry(1.0, 1.0);
      const p2 = new THREE.PlaneGeometry(1.0, 1.0);
      p2.rotateY(Math.PI * 0.5);
      const smokePuffGeo = mergeSubGeometries([p1, p2]);
      const smokeMat = new THREE.MeshBasicMaterial({
        map: smokeTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      smokeInst = new THREE.InstancedMesh(smokePuffGeo, smokeMat, allFlareSources.length * puffsPerFlare);
      smokeInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      const sparkGeo = new THREE.SphereGeometry(0.24, 8, 6);
      for (let sIdx = 0; sIdx < allFlareSources.length; sIdx++) {
        const src = allFlareSources[sIdx];
        const spark = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: src.color }));
        spark.position.copy(src.pos).add(new THREE.Vector3(0, 1.25, 0));
        this.group.add(spark);
        for (let p = 0; p < puffsPerFlare; p++) {
          smokeInst.setColorAt(sIdx * puffsPerFlare + p, src.color);
        }
      }
      if (smokeInst.instanceColor) smokeInst.instanceColor.needsUpdate = true;
      this.group.add(smokeInst);
    }

    // 5. Celebratory Stadium Confetti & Foil Streamer Cascades (Start/Finish & VIP Terrace!)
    const confettiCount = 240;
    const confettiGeo = new THREE.PlaneGeometry(0.28, 0.15);
    const confettiMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    const confettiInst = new THREE.InstancedMesh(confettiGeo, confettiMat, confettiCount);
    confettiInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const confettiPalette = [
      new THREE.Color(0xffd600),
      new THREE.Color(0xff1744),
      new THREE.Color(0x00e5ff),
      new THREE.Color(0xffffff),
      new THREE.Color(0xff6d00),
      new THREE.Color(0x00e676),
    ];
    const confettiSeeds = [];
    for (let i = 0; i < confettiCount; i++) {
      const h1 = fastHash2D(i, 1, 941);
      const h2 = fastHash2D(i, 2, 941);
      const h3 = fastHash2D(i, 3, 941);
      const onPaddockSide = i % 3 === 0;
      const baseX = -115 + h1 * 285; // Spans Showroom #1 Grid Slot (-27.6m) through Start Gantry (0m) & T1 approach!
      const baseZ = onPaddockSide
        ? (PIT_LANE_CONFIG.lateralOffset + 4.5 + h2 * 5.0)
        : -(ROAD_HALF_WIDTH + 15.5 + h2 * 11.0);
      const baseY = onPaddockSide ? 14.5 : 16.2;
      confettiSeeds.push({ baseX, baseY, baseZ, phase: h3, drift: (h1 - 0.5) * 4.5, spin: 2.5 + h2 * 5.5 });
      confettiInst.setColorAt(i, confettiPalette[i % confettiPalette.length]);
    }
    if (confettiInst.instanceColor) confettiInst.instanceColor.needsUpdate = true;
    this.group.add(confettiInst);

    const animDummy = new THREE.Object3D();
    this.animatedProps.push((t) => {
      const excite = this.crowdExcitement || 0.22;

      // Update rising & swirling motorsport flare smoke plumes
      if (smokeInst) {
        let idx = 0;
        for (let sIdx = 0; sIdx < allFlareSources.length; sIdx++) {
          const src = allFlareSources[sIdx];
          for (let p = 0; p < puffsPerFlare; p++) {
            const age = (t * (0.30 + excite * 0.12) + p / puffsPerFlare + src.seed * 0.17) % 1.0;
            const liftY = 1.35 + age * (10.5 + excite * 3.5);
            const driftX = age * age * 6.8 + Math.sin(t * 1.9 + p + src.seed) * (0.45 + age * 0.9);
            const driftZ = Math.cos(t * 1.5 + p * 0.7 + src.seed) * (0.35 + age * 0.8);
            const sc = (1.15 + age * 4.8) * Math.sin(Math.min(1.0, age * 4.2) * Math.PI * 0.5) * (1.0 - age * 0.55);
            animDummy.position.set(src.pos.x + driftX, src.pos.y + liftY, src.pos.z + driftZ);
            animDummy.rotation.set(0, t * 0.65 + p * 0.8, Math.sin(t + p) * 0.25);
            animDummy.scale.setScalar(Math.max(0.05, sc));
            animDummy.updateMatrix();
            smokeInst.setMatrixAt(idx++, animDummy.matrix);
          }
        }
        smokeInst.instanceMatrix.needsUpdate = true;
      }

      // Update tumbling celebratory stadium confetti
      const confettiScale = 0.72 + Math.min(1.2, excite * 0.55);
      for (let i = 0; i < confettiCount; i++) {
        const cs = confettiSeeds[i];
        const fall = (t * (0.24 + excite * 0.12) + cs.phase) % 1.0;
        const y = cs.baseY - fall * 13.8;
        const x = cs.baseX + Math.sin(t * 2.1 + cs.phase * 12.0) * 1.35 + fall * cs.drift;
        const z = cs.baseZ + Math.cos(t * 1.8 + cs.phase * 9.0) * 0.95;
        animDummy.position.set(x, y, z);
        animDummy.rotation.set(t * cs.spin + i, t * (cs.spin * 0.8) + cs.phase * 6.0, t * 2.2);
        animDummy.scale.setScalar(confettiScale);
        animDummy.updateMatrix();
        confettiInst.setMatrixAt(i, animDummy.matrix);
      }
      confettiInst.instanceMatrix.needsUpdate = true;

      // Update strobing HDR camera flashes
      for (let i = 0; i < allCameraFlashes.length; i++) {
        const cf = allCameraFlashes[i];
        const straightWave = cf.isMainStraight
          ? Math.max(0, Math.sin(t * 7.2 - cf.standIdx * 1.15)) * (0.14 + excite * 0.08)
          : 0.0;
        const pulse = Math.sin(t * 5.2 + cf.seed) * Math.sin(t * 14.1 + cf.seed * 1.9) + straightWave;
        const threshold = (cf.isMainStraight ? 0.70 : 0.80) - Math.min(0.18, excite * 0.10);
        if (pulse > threshold) {
          cf.mesh.visible = true;
          const s = 0.85 + (pulse - threshold) * 8.5;
          cf.mesh.scale.setScalar(s);
          cf.mesh.rotation.z = t * 2.8 + cf.seed;
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
    // 1. Majestic 3-Strata Mount Fuji aligned down the Main Straight Showroom Vista (>200m clear of Turn 1, fog-immune alpine clarity!)
    const fujiPos = new THREE.Vector3(1680, -10, -135);
    const slopeTex = this._makeFujiVolcanicSlopeTexture();
    const snowTex = this._makeFujiSnowCrownTexture();

    const forestBaseMat = new THREE.MeshStandardMaterial({
      color: 0x1e4a2b,
      roughness: 0.88,
      metalness: 0.02,
      emissive: new THREE.Color(0x0c2415),
      emissiveIntensity: 0.18,
      fog: false,
    });
    const slopeMat = new THREE.MeshStandardMaterial({
      map: slopeTex,
      roughness: 0.82,
      metalness: 0.05,
      emissive: new THREE.Color(0x16294a),
      emissiveIntensity: 0.22,
      fog: false,
    });
    const snowMat = new THREE.MeshStandardMaterial({
      map: snowTex,
      roughness: 0.34,
      metalness: 0.04,
      emissive: new THREE.Color(0xe6f2ff),
      emissiveIntensity: 0.26,
      fog: false,
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
      // Normalize GLB bounds to 1420m base diameter x 615m height so the snow crown towers above the Start Gantry!
      fuji.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(fuji);
      const sz = new THREE.Vector3();
      box.getSize(sz);
      const spanXZ = Math.max(sz.x, sz.z);
      const sxz = spanXZ > 1 ? 1420 / spanXZ : 1.45;
      const sy = sz.y > 1 ? 615 / sz.y : 3.45;
      fuji.scale.set(sxz, sy, sxz);
    } else {
      fuji = new THREE.Group();
      const forestSkirt = new THREE.Mesh(new THREE.CylinderGeometry(450, 710, 145, 48, 1, false), forestBaseMat);
      forestSkirt.position.y = 72.5;
      const rockMid = new THREE.Mesh(new THREE.CylinderGeometry(180, 470, 285, 48, 1, false), slopeMat);
      rockMid.position.y = 285;
      const snowCrown = new THREE.Mesh(new THREE.CylinderGeometry(64, 205, 195, 48, 1, false), snowMat);
      snowCrown.position.y = 520;
      fuji.add(forestSkirt, rockMid, snowCrown);
      hasForestMesh = true;
    }
    fuji.position.copy(fujiPos);
    this.group.add(fuji);

    // Ensure lush cedar-forested Shizuoka foothill ridge ring hugs Mount Fuji's base
    if (!hasForestMesh) {
      const foothillSkirt = new THREE.Mesh(
        new THREE.CylinderGeometry(500, 730, 120, 48, 1, true),
        forestBaseMat
      );
      foothillSkirt.position.set(fujiPos.x, fujiPos.y + 58, fujiPos.z);
      this.group.add(foothillSkirt);
    }

    // Flanking Shizuoka Alpine Foothill Ridges framing the Main Straight horizon left & right of Mount Fuji
    const ridgeSpecs = [
      { x: 1240, z: -435, rTop: 95, rBot: 310, h: 148 },
      { x: 1090, z: -620, rTop: 75, rBot: 265, h: 118 },
      { x: 1360, z:  590, rTop: 105, rBot: 330, h: 156 },
    ];
    for (const rs of ridgeSpecs) {
      const ridge = new THREE.Mesh(new THREE.CylinderGeometry(rs.rTop, rs.rBot, rs.h, 24), forestBaseMat);
      ridge.position.set(rs.x, rs.h * 0.5 - 8, rs.z);
      ridge.scale.set(1.0, 1.0, 1.35);
      this.group.add(ridge);
    }

    // Sculpted Atmospheric Mist & Lenticular Cloud Collar around Mount Fuji's mid-flanks
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xf4f9ff,
      transparent: true,
      opacity: 0.54,
      depthWrite: false,
      fog: false,
    });
    for (let i = 0; i < 18; i++) {
      const ang = (Math.PI * 2 * i) / 18;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(76 + (i % 3) * 26, 16, 12), cloudMat);
      puff.scale.set(2.4, 0.32, 1.35);
      puff.position.set(
        fujiPos.x + Math.cos(ang) * 565,
        185 + (i % 4) * 24,
        fujiPos.z + Math.sin(ang) * 565
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

  _applyTreeWindShader(mat, maxHeight = 9.5) {
    const uniforms = this._crowdUniforms;
    const hStr = maxHeight.toFixed(1);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uWindTime;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float hFrac = clamp(position.y / ${hStr}, 0.0, 1.0);
          float swayWeight = hFrac * hFrac;
          float tSeed = 0.0;
          #ifdef USE_INSTANCING
            vec3 tInst = instanceMatrix[3].xyz;
            tSeed = fract(sin(dot(tInst.xz, vec2(14.37, 61.91))) * 35713.11) * 6.2831;
          #endif
          transformed.x += sin(uWindTime * 1.65 + tSeed + position.y * 0.35) * 0.24 * swayWeight;
          transformed.z += cos(uWindTime * 1.28 + tSeed * 1.3 + position.x * 0.4) * 0.18 * swayWeight;`
        );
    };
    mat.customProgramCacheKey = () => `f1_tree_wind_${hStr}`;
    return mat;
  }

  _getTreeGeometriesAndMaterials() {
    const envCache = FujiTrack._envGlbCache;
    let decTrunkGeo = envCache?.deciduousTrunk;
    let decCrownGeo = envCache?.deciduousCanopy;
    let pineTrunkGeo = envCache?.pineTrunk;
    let pineCrownGeo = envCache?.pineCanopy;

    if (!decTrunkGeo) {
      const mainStem = new THREE.CylinderGeometry(0.28, 0.52, 4.1, 8);
      mainStem.translate(0, 2.05, 0);
      const limbL = new THREE.CylinderGeometry(0.13, 0.24, 2.3, 6);
      limbL.rotateZ(0.56); limbL.rotateX(0.18); limbL.translate(-0.62, 3.85, 0.18);
      const limbR = new THREE.CylinderGeometry(0.12, 0.22, 2.2, 6);
      limbR.rotateZ(-0.54); limbR.rotateX(-0.20); limbR.translate(0.60, 3.95, -0.18);
      const limbB = new THREE.CylinderGeometry(0.11, 0.20, 2.0, 6);
      limbB.rotateX(0.52); limbB.translate(0.06, 4.05, 0.56);
      decTrunkGeo = mergeSubGeometries([mainStem, limbL, limbR, limbB]);
    }
    if (!pineTrunkGeo) {
      const pStem = new THREE.CylinderGeometry(0.18, 0.46, 7.2, 8);
      pStem.translate(0, 3.6, 0);
      pineTrunkGeo = pStem;
    }
    if (!decCrownGeo) {
      const bough1 = new THREE.DodecahedronGeometry(2.55, 1);
      bough1.scale(1.24, 0.74, 1.14); bough1.translate(-1.68, 4.95, 0.42);
      const bough2 = new THREE.DodecahedronGeometry(2.45, 1);
      bough2.scale(1.18, 0.72, 1.16); bough2.translate(1.72, 5.12, -0.38);
      const bough3 = new THREE.DodecahedronGeometry(2.35, 1);
      bough3.scale(1.14, 0.74, 1.22); bough3.translate(0.15, 5.05, 1.55);
      const bough4 = new THREE.DodecahedronGeometry(2.28, 1);
      bough4.scale(1.16, 0.76, 1.12); bough4.translate(-0.24, 5.58, -1.38);
      const bough5 = new THREE.DodecahedronGeometry(2.68, 1);
      bough5.scale(1.20, 0.82, 1.18); bough5.translate(0.08, 6.55, 0.06);
      decCrownGeo = mergeSubGeometries([bough1, bough2, bough3, bough4, bough5]);
    }
    if (!pineCrownGeo) {
      const pineT1 = new THREE.ConeGeometry(3.35, 4.6, 9); pineT1.translate(0, 4.85, 0);
      const pineT2 = new THREE.ConeGeometry(2.68, 4.4, 9); pineT2.translate(0, 7.35, 0);
      const pineT3 = new THREE.ConeGeometry(1.88, 4.2, 9); pineT3.translate(0, 9.75, 0);
      pineCrownGeo = mergeSubGeometries([pineT1, pineT2, pineT3]);
    }

    const trunkMat = new THREE.MeshStandardMaterial({
      color: envCache?.barkMap ? 0xd8c6b4 : 0x4a3423,
      map: envCache?.barkMap || null,
      roughness: 0.90,
    });
    return { envCache, decTrunkGeo, decCrownGeo, pineTrunkGeo, pineCrownGeo, trunkMat };
  }

  _scatterForestTrees({ count, foliageColors, spruceRatio, blossomPetals = false }) {
    const { envCache, decTrunkGeo, decCrownGeo, pineTrunkGeo, pineCrownGeo, trunkMat } = this._getTreeGeometriesAndMaterials();

    const decTrunks = [];
    const pineTrunks = [];
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
      const cIdx = i % foliageColors.length;
      const isSpruce = fastHash2D(i, 5, 91) < spruceRatio;

      if (isSpruce) {
        const slim = this.trackDef.theme === 'MONZA' ? 0.58 : 0.96;
        dummy.position.set(fr.pos.x, fr.pos.y, fr.pos.z);
        dummy.rotation.set(0, rotY, 0);
        dummy.scale.set(sc * slim, sc * 1.08, sc * slim);
        dummy.updateMatrix();
        pineTrunks.push(dummy.matrix.clone());
        pineBuckets[cIdx].push(dummy.matrix.clone());
      } else {
        dummy.position.set(fr.pos.x, fr.pos.y, fr.pos.z);
        dummy.rotation.set(0, rotY, 0);
        dummy.scale.set(sc * 1.08, sc * 0.98, sc * 1.08);
        dummy.updateMatrix();
        decTrunks.push(dummy.matrix.clone());
        roundBuckets[cIdx].push(dummy.matrix.clone());

        if (blossomPetals && cIdx <= 2 && petalRings.length < 75) {
          dummy.position.set(fr.pos.x, fr.pos.y + 0.04, fr.pos.z);
          dummy.rotation.set(-Math.PI / 2, 0, 0);
          dummy.scale.setScalar(sc * 3.8);
          dummy.updateMatrix();
          petalRings.push(dummy.matrix.clone());
        }
      }
    }

    if (decTrunks.length) {
      const dtInst = new THREE.InstancedMesh(decTrunkGeo, trunkMat, decTrunks.length);
      decTrunks.forEach((m, k) => dtInst.setMatrixAt(k, m));
      dtInst.instanceMatrix.needsUpdate = true;
      this.group.add(dtInst);
    }
    if (pineTrunks.length) {
      const ptInst = new THREE.InstancedMesh(pineTrunkGeo, trunkMat, pineTrunks.length);
      pineTrunks.forEach((m, k) => ptInst.setMatrixAt(k, m));
      ptInst.instanceMatrix.needsUpdate = true;
      this.group.add(ptInst);
    }

    foliageColors.forEach((col, idx) => {
      const isSakura = blossomPetals && idx <= 2;
      const mat = this._applyTreeWindShader(
        new THREE.MeshStandardMaterial({
          color: col,
          map: envCache?.foliageMap || null,
          roughness: 0.72,
          emissive: new THREE.Color(col),
          emissiveIntensity: isSakura ? 0.15 : 0.05,
        }),
        9.5
      );
      if (roundBuckets[idx].length) {
        const inst = new THREE.InstancedMesh(decCrownGeo, mat, roundBuckets[idx].length);
        roundBuckets[idx].forEach((m, k) => inst.setMatrixAt(k, m));
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = true;
        this.group.add(inst);
      }
      if (pineBuckets[idx].length) {
        const inst = new THREE.InstancedMesh(pineCrownGeo, mat, pineBuckets[idx].length);
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

  _scatterPalmTrees(count, extraPositions = null) {
    const envCache = FujiTrack._envGlbCache;
    let trunkGeo = envCache?.palmTrunk;
    let frondGeo = envCache?.palmCanopy;

    if (!trunkGeo) {
      const seg1 = new THREE.CylinderGeometry(0.32, 0.42, 3.5, 8);
      seg1.rotateZ(-0.04); seg1.translate(0.07, 1.72, 0);
      const seg2 = new THREE.CylinderGeometry(0.25, 0.33, 3.5, 8);
      seg2.rotateZ(-0.09); seg2.translate(0.30, 5.10, 0);
      const seg3 = new THREE.CylinderGeometry(0.19, 0.26, 3.3, 8);
      seg3.rotateZ(-0.14); seg3.translate(0.68, 8.38, 0);
      trunkGeo = mergeSubGeometries([seg1, seg2, seg3]);
    }

    if (!frondGeo) {
      const frondParts = [];
      const crownHeart = new THREE.DodecahedronGeometry(0.62, 0);
      crownHeart.translate(0.90, 9.85, 0);
      frondParts.push(crownHeart);
      for (let f = 0; f < 7; f++) {
        const az = (Math.PI * 2 * f) / 7;
        const innerBlade = new THREE.BoxGeometry(2.35, 0.14, 0.72);
        innerBlade.rotateZ(0.28); innerBlade.translate(1.15, 0.28, 0);
        innerBlade.rotateY(az); innerBlade.translate(0.90, 9.95, 0);
        const outerTip = new THREE.ConeGeometry(0.48, 2.55, 5);
        outerTip.scale(1.0, 1.0, 0.26); outerTip.rotateZ(-1.92);
        outerTip.translate(3.25, -0.05, 0); outerTip.rotateY(az);
        outerTip.translate(0.90, 9.95, 0);
        frondParts.push(innerBlade, outerTip);
      }
      frondGeo = mergeSubGeometries(frondParts);
    }

    const trunkMat = new THREE.MeshStandardMaterial({
      color: envCache?.barkMap ? 0xd9c2a8 : 0x735338,
      map: envCache?.barkMap || null,
      roughness: 0.86,
    });
    const frondMat = this._applyTreeWindShader(
      new THREE.MeshStandardMaterial({
        color: this.trackDef.theme === 'VEGAS' ? 0x1e824c : 0x278042,
        map: envCache?.foliageMap || null,
        roughness: 0.66,
        emissive: new THREE.Color(this.trackDef.theme === 'VEGAS' ? 0x0a3822 : 0x061f10),
        emissiveIntensity: 0.22,
      }),
      11.5
    );

    const palmMatrices = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const s = (i * (TRACK_GAME_LENGTH / Math.max(1, count))) % TRACK_GAME_LENGTH;
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

    if (Array.isArray(extraPositions)) {
      for (let i = 0; i < extraPositions.length; i++) {
        const ep = extraPositions[i];
        if (this._minDistToTrack(ep.x, ep.z) < ROAD_HALF_WIDTH + 11.5) continue;
        dummy.position.set(ep.x, ep.y || 0, ep.z);
        dummy.rotation.set(0, ep.rotY || i * 1.7, 0);
        dummy.scale.setScalar(ep.scale || 1.05);
        dummy.updateMatrix();
        palmMatrices.push(dummy.matrix.clone());
      }
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

  // Dedicated 3D Blender Scenic Vista Groves along the Main Straight & Showroom Horizon!
  _buildMainStraightScenicVistaTrees() {
    const theme = this.trackDef.theme;
    const spots = [];

    // 1. Courtyard Groves in the open plazas between Main Straight Grandstand Blocks (X in [22..68] & [276..322])!
    for (const gapCenterX of [45, 299]) {
      for (let k = 0; k < 10; k++) {
        const h1 = fastHash2D(k, 1, gapCenterX);
        const h2 = fastHash2D(k, 2, gapCenterX);
        spots.push({
          x: gapCenterX + (h1 - 0.5) * 38,
          z: -(ROAD_HALF_WIDTH + 14.5 + h2 * 22.0),
          scale: 1.02 + h2 * 0.42,
          rotY: h1 * Math.PI * 2,
        });
      }
    }

    // 2. Tall Horizon Parkland Groves rising behind the Main Straight Grandstands & framing Turn 1!
    for (let i = 0; i < 68; i++) {
      const h1 = fastHash2D(i, 1, 512);
      const h2 = fastHash2D(i, 2, 512);
      const x = -185 + (i / 68) * 820 + (h1 - 0.5) * 10;
      const z = x > 528 ? -(ROAD_HALF_WIDTH + 16.0 + h2 * 52.0) : -(ROAD_HALF_WIDTH + 43.0 + h2 * 48.0);
      spots.push({ x, z, scale: 1.15 + h2 * 0.62, rotY: h1 * Math.PI * 2 });
    }

    // 3. Paddock Parkland & Turn 1 Right-Side Vista Groves behind the Pit Garages!
    for (let i = 0; i < 46; i++) {
      const h1 = fastHash2D(i, 1, 733);
      const h2 = fastHash2D(i, 2, 733);
      const x = -175 + (i / 46) * 760 + (h1 - 0.5) * 12;
      const z = x > 345 ? (ROAD_HALF_WIDTH + 17.5 + h2 * 48.0) : (PIT_LANE_CONFIG.lateralOffset + 25.0 + h2 * 44.0);
      spots.push({ x, z, scale: 1.12 + h2 * 0.58, rotY: h1 * Math.PI * 2 });
    }

    if (theme === 'MONACO' || theme === 'VEGAS') {
      this._scatterPalmTrees(0, spots);
      return;
    }

    const palette = theme === 'FUJI'
      ? { cols: [0xff9ec6, 0xffb7d5, 0x1d5932, 0x276e3f], spruce: 0.46 }
      : (theme === 'MONZA'
        ? { cols: [0xd97706, 0xdc2626, 0xeab308, 0x1e5631], spruce: 0.36 }
        : (theme === 'SUZUKA'
          ? { cols: [0xdc2626, 0xea580c, 0xf59e0b, 0x1e5631], spruce: 0.40 }
          : { cols: [0x1f6332, 0x29753e, 0x358244, 0x4d7c2b], spruce: 0.32 }));

    const { envCache, decTrunkGeo, decCrownGeo, pineTrunkGeo, pineCrownGeo, trunkMat } = this._getTreeGeometriesAndMaterials();
    const decTrunks = [];
    const pineTrunks = [];
    const decCrowns = palette.cols.map(() => []);
    const pineCrowns = palette.cols.map(() => []);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i];
      if (this._minDistToTrack(sp.x, sp.z) < ROAD_HALF_WIDTH + 13.0) continue;
      const cIdx = i % palette.cols.length;
      const isPine = fastHash2D(i, 4, 619) < palette.spruce;
      const slim = theme === 'MONZA' && isPine ? 0.62 : 1.0;

      dummy.position.set(sp.x, 0, sp.z);
      dummy.rotation.set(0, sp.rotY, 0);
      dummy.scale.set(sp.scale * slim, sp.scale * (isPine ? 1.12 : 1.02), sp.scale * slim);
      dummy.updateMatrix();
      if (isPine) {
        pineTrunks.push(dummy.matrix.clone());
        pineCrowns[cIdx].push(dummy.matrix.clone());
      } else {
        decTrunks.push(dummy.matrix.clone());
        decCrowns[cIdx].push(dummy.matrix.clone());
      }
    }

    if (decTrunks.length) {
      const inst = new THREE.InstancedMesh(decTrunkGeo, trunkMat, decTrunks.length);
      decTrunks.forEach((m, k) => inst.setMatrixAt(k, m));
      inst.instanceMatrix.needsUpdate = true;
      this.group.add(inst);
    }
    if (pineTrunks.length) {
      const inst = new THREE.InstancedMesh(pineTrunkGeo, trunkMat, pineTrunks.length);
      pineTrunks.forEach((m, k) => inst.setMatrixAt(k, m));
      inst.instanceMatrix.needsUpdate = true;
      this.group.add(inst);
    }

    palette.cols.forEach((col, idx) => {
      const isSakura = theme === 'FUJI' && idx <= 1;
      const mat = this._applyTreeWindShader(
        new THREE.MeshStandardMaterial({
          color: col,
          map: envCache?.foliageMap || null,
          roughness: 0.72,
          emissive: new THREE.Color(col),
          emissiveIntensity: isSakura ? 0.16 : 0.05,
        }),
        9.5
      );
      if (decCrowns[idx].length) {
        const inst = new THREE.InstancedMesh(decCrownGeo, mat, decCrowns[idx].length);
        decCrowns[idx].forEach((m, k) => inst.setMatrixAt(k, m));
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = true;
        this.group.add(inst);
      }
      if (pineCrowns[idx].length) {
        const inst = new THREE.InstancedMesh(pineCrownGeo, mat, pineCrowns[idx].length);
        pineCrowns[idx].forEach((m, k) => inst.setMatrixAt(k, m));
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = true;
        this.group.add(inst);
      }
    });
  }

  // --------------------------------------------------------------------------
  // 10. FIA MARSHAL BOOTHS + 3D ANIMATED TRACKSIDE FLAG MARSHALS, PUDDLES & SKIDMARKS
  // --------------------------------------------------------------------------
  _makeCheckeredMarshalFlagTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    for (let r = 0; r < 4; r++) {
      for (let col = 0; col < 4; col++) {
        ctx.fillStyle = (r + col) % 2 === 0 ? '#ffffff' : '#11141a';
        ctx.fillRect(col * 32, r * 32, 32, 32);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildMarshalPosts() {
    this.marshalPosts = [];
    const envCache = FujiTrack._envGlbCache;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xd0d8e4, metalness: 0.68, roughness: 0.3 });
    const boothMat = new THREE.MeshStandardMaterial({ color: 0xf2f6fc, roughness: 0.45 });
    const orangeMat = new THREE.MeshStandardMaterial({
      color: 0xff6d00,
      roughness: 0.38,
      emissive: new THREE.Color(0xff5500),
      emissiveIntensity: 0.22,
    });
    const checkeredTex = this._makeCheckeredMarshalFlagTexture();

    let marshalBodyGeo = envCache?.marshalBodyGeo;
    if (!marshalBodyGeo) {
      const torso = new THREE.BoxGeometry(0.52, 0.78, 0.32); torso.translate(0, 0.78, 0);
      const legs = new THREE.BoxGeometry(0.42, 0.56, 0.26); legs.translate(0, 0.28, 0);
      const head = new THREE.SphereGeometry(0.18, 8, 6); head.translate(0, 1.38, 0);
      const staff = new THREE.CylinderGeometry(0.03, 0.035, 2.15, 6); staff.translate(0, 1.98, 0.36);
      marshalBodyGeo = mergeSubGeometries([legs, torso, head, staff]);
    }
    let marshalClothGeo = envCache?.marshalClothGeo;
    if (!marshalClothGeo) {
      const fg = new THREE.PlaneGeometry(1.65, 1.05, 7, 3);
      fg.translate(0.825, 2.52, 0.36);
      marshalClothGeo = fg;
    }

    const spawnMarshalStation = (postS, sectorId, isStartStand = false) => {
      const lat = -(ROAD_HALF_WIDTH + (isStartStand ? 4.85 : 6.9));
      const fr = this.sampleAt(postS, lat);
      const yaw = Math.atan2(fr.tangent.z, fr.tangent.x);

      const mGroup = new THREE.Group();
      mGroup.position.copy(fr.pos);
      mGroup.rotation.y = -yaw;

      if (isStartStand) {
        // Elevated Start/Finish FIA Starter's Rostrum Platform right beside the Start Gantry!
        const rostrum = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.55, 2.0), this.darkFrameMat);
        rostrum.position.set(0, 0.775, -0.35);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(2.48, 0.92, 0.10), orangeMat);
        rail.position.set(0, 1.98, 0.62);
        mGroup.add(rostrum, rail);
      } else {
        const booth = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.2, 1.65), boothMat);
        booth.position.set(0, 1.1, -0.8);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.42, 1.72), orangeMat);
        stripe.position.set(0, 0.55, -0.8);
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.16, 2.15), this.darkFrameMat);
        canopy.position.set(0, 2.26, -0.68);
        mGroup.add(booth, stripe, canopy);
      }

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.095, 4.7, 8), poleMat);
      pole.position.set(-0.85, 2.35, 0.25);
      const ledHousing = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.05, 1.15), this.darkFrameMat);
      ledHousing.position.set(-0.85, 4.15, 0.88);
      const ledMat = new THREE.MeshBasicMaterial({ color: 0x00c853 });
      const ledScreen = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.82, 0.92), ledMat);
      ledScreen.position.set(-0.85, 4.15, 0.88);
      mGroup.add(pole, ledHousing, ledScreen);

      // Articulated 3D Trackside Marshal waving rippled 3D Signal Flag!
      const marshalRig = new THREE.Group();
      marshalRig.position.set(0.45, isStartStand ? 1.55 : 0.0, 0.15);

      const mBody = new THREE.Mesh(marshalBodyGeo, orangeMat);
      mBody.castShadow = true;
      const flagMat = this._applyFlagRippleShader(
        new THREE.MeshStandardMaterial({
          color: 0x00e676,
          roughness: 0.38,
          side: THREE.DoubleSide,
          emissive: new THREE.Color(0x00a854),
          emissiveIntensity: 0.28,
        }),
        1.65
      );
      const flag = new THREE.Mesh(marshalClothGeo, flagMat);
      flag.castShadow = true;
      marshalRig.add(mBody, flag);
      mGroup.add(marshalRig);

      this.group.add(mGroup);
      this.marshalPosts.push({
        sectorId,
        isStartStand,
        marshalRig,
        flag,
        flagMat,
        ledMat,
        checkeredTex,
      });
    };

    // Dedicated Start/Finish Flag Marshal Rostrum at s = 2.4 (visible from Showroom #1 Grid Slot!)
    spawnMarshalStation(2.4, FUJI_SECTORS[0]?.id || 'S1', true);

    for (const sec of FUJI_SECTORS) {
      const postS = sec.start + 12;
      if (this.trackDef.tunnelRangeS && postS >= this.trackDef.tunnelRangeS[0] && postS <= this.trackDef.tunnelRangeS[1]) {
        continue;
      }
      if (this.trackDef.overpassRangeS && postS >= this.trackDef.overpassRangeS[0] - 8 && postS <= this.trackDef.overpassRangeS[1] + 8) {
        continue;
      }
      spawnMarshalStation(postS, sec.id, false);
    }
  }

  updateMarshalFlags(yellowSectorsSet, vscActive, elapsedSec) {
    const flashOn = elapsedSec % 0.36 < 0.18;
    for (let i = 0; i < this.marshalPosts.length; i++) {
      const mp = this.marshalPosts[i];
      const isYellow = Boolean(vscActive || yellowSectorsSet?.has(mp.sectorId));
      const isCheckered = Boolean(this._checkeredFlagActive && mp.isStartStand);

      mp.flag.visible = true;
      const swayRate = isYellow || isCheckered ? 9.5 : 4.2;
      const swayAmp = isYellow || isCheckered ? 0.32 : 0.14;
      if (mp.marshalRig) {
        mp.marshalRig.rotation.y = Math.sin(elapsedSec * swayRate + i * 1.3) * swayAmp;
      }

      if (isCheckered) {
        if (mp.flagMat.map !== mp.checkeredTex) {
          mp.flagMat.map = mp.checkeredTex;
          mp.flagMat.needsUpdate = true;
        }
        mp.flagMat.color.setHex(0xffffff);
        mp.flagMat.emissive?.setHex(0x444444);
        if (mp.ledMat) mp.ledMat.color.setHex(flashOn ? 0xffffff : 0x00e676);
      } else if (isYellow) {
        if (mp.flagMat.map !== null) {
          mp.flagMat.map = null;
          mp.flagMat.needsUpdate = true;
        }
        const col = flashOn ? 0xffea00 : 0xffab00;
        mp.flagMat.color.setHex(col);
        mp.flagMat.emissive?.setHex(0x805500);
        if (mp.ledMat) mp.ledMat.color.setHex(flashOn ? 0xffe600 : 0x594300);
      } else {
        if (mp.flagMat.map !== null) {
          mp.flagMat.map = null;
          mp.flagMat.needsUpdate = true;
        }
        mp.flagMat.color.setHex(0x00e676);
        mp.flagMat.emissive?.setHex(0x006937);
        if (mp.ledMat) mp.ledMat.color.setHex(0x00c853);
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
    this._forcePuddles1982 = Boolean(activeInGrandPrix);
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
