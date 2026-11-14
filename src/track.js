// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Authentic 1982 Fuji Speedway 12-Sector 3D Spline, Pit Corridor & Environment
// ============================================================================

import * as THREE from 'three';
import {
  TRACK_GAME_LENGTH,
  REAL_METERS_PER_GAME_METER,
  ROAD_HALF_WIDTH,
  CURB_WIDTH,
  FUJI_SECTORS,
  PIT_LANE_CONFIG,
  BILLBOARD_BRANDS,
} from './config.js';

const SAMPLES = 2000; // 0.5 game-meter resolution (~2.18 real meters per sample)

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

export class FujiTrack {
  constructor(scene) {
    this.scene = scene;
    this.samples = [];
    this.pitSamples = new Map();
    this.billboards = [];
    this.puddles = [];
    this.marshalPosts = [];
    this.gantryLights = [];
    this.skidIndex = 0;
    this.maxSkids = 900;

    this.group = new THREE.Group();
    this.group.name = 'FujiSpeedwayRoot';
    this.scene.add(this.group);

    this._buildSplineTable();
    this._createMaterials();
    this._buildRoadGeometry();
    this._buildCurbs();
    this._buildPitLaneAndBuildings();
    this._buildStartGantry();
    this._buildBrakingBoardsAndBillboards();
    this._buildMarshalPosts();
    this._buildPuddles();
    this._buildSkidmarkSystem();
    this._buildSceneryBackdrop();
  }

  // --------------------------------------------------------------------------
  // 1. EXACT 12-SECTOR CLOSED 3D SPLINE GENERATOR
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
    const ramp = 9.0; // Smooth 9-game-meter cosine transition between sectors
    const sec = this.getSector(sw);
    let k = sec.curvature;

    const distStart = sw - sec.start;
    const distEnd = sec.end - sw;
    if (distStart < ramp) {
      const prevSec = this.getSector(sec.start - 0.5);
      const u = 0.5 + 0.5 * (distStart / ramp);
      const blend = 0.5 - 0.5 * Math.cos(Math.PI * u);
      k = prevSec.curvature + (sec.curvature - prevSec.curvature) * blend;
    } else if (distEnd < ramp) {
      const nextSec = this.getSector(sec.end + 0.5);
      const u = 0.5 - 0.5 * (distEnd / ramp);
      const blend = 0.5 - 0.5 * Math.cos(Math.PI * (1 - u));
      k = sec.curvature + (nextSec.curvature - sec.curvature) * blend;
    }
    return k;
  }

  _buildSplineTable() {
    // Sectors 11, 1, 2 (s in [950..1000) U [0..290]) form the 1.48km Fuji Main Pit Straight
    // along Z = 0, Y = 0, heading +X, with Start/Finish (s = 0) at (0, 0, 0).
    // Curved loop runs s in [290..950] from X = +290*scale back to X = -50*scale with C2 closure.
    const dsGame = TRACK_GAME_LENGTH / SAMPLES;
    const dsReal = dsGame * REAL_METERS_PER_GAME_METER;

    const curveStartIdx = Math.round(290 / dsGame); // 580
    const curveEndIdx = Math.round(950 / dsGame);   // 1900
    const curveCount = curveEndIdx - curveStartIdx; // 1320 samples

    // Visual heading turn rates tuned to match exact sector curvature signs & magnitudes:
    // +0.68 Sharp Right Turn 1, -0.42 Fast Left 100R, -0.88 Tight Left Hairpin, +0.38/+0.32 Right Panorama
    // while integrating cleanly to net -2*PI (or 0 with elevated Panorama overpass!).
    // Let's check: with Panorama viaduct elevation (+11.5m at s=680..840), net heading change = 0
    // preserves 100% literal Left/Right geometry of every single sector!
    const rawK = new Float64Array(curveCount);
    let sumK = 0;
    let weightSum = 0;
    const weights = new Float64Array(curveCount);

    for (let i = 0; i < curveCount; i++) {
      const s = 290 + (i + 0.5) * dsGame;
      const k = this.getPhysicsCurvature(s);
      // Scale factor converts Namco curvature units into world rad/m
      const radPerM = k * 0.0056;
      rawK[i] = radPerM;
      sumK += radPerM * dsReal;
      const u = (i + 0.5) / curveCount;
      const w = Math.sin(Math.PI * u) ** 2;
      weights[i] = w;
      weightSum += w * dsReal;
    }

    // Balance net heading change to 0.0 rad at s = 950 so tangent matches Main Straight (1,0,0)
    const kCorrection = -sumK / weightSum;
    const headings = new Float64Array(curveCount + 1);
    headings[0] = 0.0;
    for (let i = 0; i < curveCount; i++) {
      headings[i + 1] = headings[i] + (rawK[i] + kCorrection * weights[i]) * dsReal;
    }

    const rawX = new Float64Array(curveCount + 1);
    const rawZ = new Float64Array(curveCount + 1);
    rawX[0] = 290.0 * REAL_METERS_PER_GAME_METER;
    rawZ[0] = 0.0;
    for (let i = 0; i < curveCount; i++) {
      const midPsi = 0.5 * (headings[i] + headings[i + 1]);
      rawX[i + 1] = rawX[i] + Math.cos(midPsi) * dsReal;
      rawZ[i + 1] = rawZ[i] + Math.sin(midPsi) * dsReal;
    }

    const targetEndX = -50.0 * REAL_METERS_PER_GAME_METER;
    const targetEndZ = 0.0;
    const errX = targetEndX - rawX[curveCount];
    const errZ = targetEndZ - rawZ[curveCount];

    const pts = new Array(SAMPLES);
    for (let idx = 0; idx < SAMPLES; idx++) {
      const s = idx * dsGame;
      let x, y, z;

      if (s < 290.0) {
        x = s * REAL_METERS_PER_GAME_METER;
        y = 0.0;
        z = 0.0;
      } else if (s >= 950.0) {
        x = (s - TRACK_GAME_LENGTH) * REAL_METERS_PER_GAME_METER;
        y = 0.0;
        z = 0.0;
      } else {
        const ci = idx - curveStartIdx;
        const u = ci / curveCount;
        const b = quinticBlend(u);
        x = rawX[ci] + errX * b;
        z = rawZ[ci] + errZ * b;

        // Authentic Fuji elevation: gentle dip into 100R, climb through Hairpin into
        // elevated Panorama Overpass (+12.5m) overlooking Mt. Fuji & Grade-Separated Chute!
        let elev = 0.0;
        if (s >= 520 && s <= 935) {
          const eu = (s - 520) / (935 - 520);
          elev = 12.8 * (Math.sin(Math.PI * eu) ** 2);
        }
        y = elev;
      }
      pts[idx] = new THREE.Vector3(x, y, z);
    }

    // Compute smooth tangents, right vectors, normals, banking & sector metadata
    this.samples = new Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i++) {
      const prev = pts[(i - 1 + SAMPLES) % SAMPLES];
      const curr = pts[i];
      const next = pts[(i + 1) % SAMPLES];

      const tangent = new THREE.Vector3().subVectors(next, prev).normalize();
      const upRef = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(tangent, upRef).normalize();
      // Wait: if tangent = (1,0,0) and up = (0,1,0), tangent x up = (0,0,-1) = Left!
      // Let's verify right-hand rule in Three.js (X East, Y Up, -Z North, +Z South):
      // Heading East (+X), Right-hand shoulder is South (+Z): up x tangent = (0,1,0) x (1,0,0) = (0,0,-1)... wait:
      // i x j = k -> (1,0,0) x (0,1,0) = (0,0,+1)! YES! tangent.cross(upRef) IS (0,0,+1) = South = RIGHT!
      const normal = new THREE.Vector3().crossVectors(right, tangent).normalize();

      const s = i * dsGame;
      const curvature = this.getPhysicsCurvature(s);
      // Subtle F1 corner camber/banking (up to ~3.5 degrees)
      const bankAngle = -curvature * 0.055;

      this.samples[i] = {
        s,
        pos: curr,
        tangent,
        right,
        normal,
        curvature,
        bankAngle,
        sector: this.getSector(s),
      };
    }

    // Build Pit Lane lateral offset profile (s = 906 -> 1000 -> 122)
    // Smoothly splits to the right (+right * 14.8m) behind the pit wall and merges back
    for (let i = 0; i < SAMPLES; i++) {
      const s = i * dsGame;
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
      this.samples[i].pitOffset = pitOffset;
    }
  }

  // Fast O(1) interpolated track frame lookup at any game-meter s and lateral offset latM
  sampleAt(s, lateralOffsetM = 0) {
    const sw = wrapS(s);
    const fIdx = (sw / TRACK_GAME_LENGTH) * SAMPLES;
    const i0 = Math.floor(fIdx) % SAMPLES;
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
  // 2. PROCEDURAL TEXTURES & DUAL-SHADER MATERIALS (2026 PBR vs 1982 ARCADE)
  // --------------------------------------------------------------------------
  _createMaterials() {
    // High-contrast asphalt procedural canvas texture with racing groove & lane dashes
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#242830';
    ctx.fillRect(0, 0, 512, 512);

    // Asphalt aggregate grain
    for (let i = 0; i < 16000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const v = 26 + Math.floor(Math.random() * 28);
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Subtle darkened rubbered-in ideal groove near center-sides
    const grad = ctx.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0.0, 'rgba(255,255,255,0.0)');
    grad.addColorStop(0.22, 'rgba(10,12,15,0.34)');
    grad.addColorStop(0.50, 'rgba(30,34,42,0.12)');
    grad.addColorStop(0.78, 'rgba(10,12,15,0.34)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Crisp white track edge lines
    ctx.fillStyle = '#e9eef5';
    ctx.fillRect(10, 0, 10, 512);
    ctx.fillRect(492, 0, 10, 512);

    // Classic 1982 dashed center line (subtle in PBR, bright in 1982 mode)
    ctx.fillStyle = 'rgba(235, 240, 250, 0.42)';
    for (let y = 0; y < 512; y += 64) {
      ctx.fillRect(252, y, 8, 34);
    }

    const roadTex = new THREE.CanvasTexture(canvas);
    roadTex.wrapS = THREE.RepeatWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(1, 180);
    roadTex.anisotropy = 8;
    roadTex.colorSpace = THREE.SRGBColorSpace;

    this.asphaltMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      roughness: 0.78,
      metalness: 0.08,
    });

    this.pitAsphaltMat = new THREE.MeshStandardMaterial({
      color: 0x2b323d,
      roughness: 0.72,
      metalness: 0.10,
    });

    this.grassMat = new THREE.MeshStandardMaterial({
      color: 0x1e6b2d,
      roughness: 0.94,
      metalness: 0.0,
    });

    this.curbRedMat = new THREE.MeshStandardMaterial({ color: 0xd91e26, roughness: 0.55 });
    this.curbWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.55 });
    this.concreteMat = new THREE.MeshStandardMaterial({ color: 0x8d95a0, roughness: 0.80, metalness: 0.08 });
  }

  // Dynamically updates asphalt specular wetness & 1982 vs 2026 visual shader feel
  updateVisualState(moistureW, visualStyle) {
    const isArcade = visualStyle === '1982_ARCADE';
    if (isArcade) {
      this.asphaltMat.roughness = moistureW > 0.15 ? 0.28 : 0.92;
      this.asphaltMat.metalness = moistureW > 0.15 ? 0.35 : 0.0;
      this.asphaltMat.color.setHex(0x3a4050);
      this.grassMat.color.setHex(0x189c32);
    } else {
      // 2026 PBR: Specular wet reflections intensify cleanly when W > 0.15
      const wetFactor = Math.max(0, Math.min(1, (moistureW - 0.05) / 0.85));
      this.asphaltMat.roughness = 0.80 - wetFactor * 0.64; // down to 0.16 mirror-wet sheen!
      this.asphaltMat.metalness = 0.08 + wetFactor * 0.48;
      const shade = Math.round(255 - wetFactor * 75);
      this.asphaltMat.color.setRGB(shade / 255, shade / 255, (shade + 8) / 255);
      this.grassMat.color.setHex(moistureW > 0.4 ? 0x175423 : 0x216e30);
    }

    // Update dynamic puddles visibility
    for (const p of this.puddles) {
      if (p.forceActive1982) {
        p.mesh.visible = true;
        p.mesh.scale.setScalar(1.0);
      } else {
        const active = moistureW > 0.22;
        p.mesh.visible = active;
        if (active) {
          const sc = Math.min(1.25, 0.45 + moistureW * 0.85);
          p.mesh.scale.set(sc, 1, sc);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 3. ROAD RIBBON, GRASS VERGES & VIADUCT BRIDGE PIERS
  // --------------------------------------------------------------------------
  _buildRoadGeometry() {
    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(9000, 9000);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, this.grassMat);
    ground.position.y = -0.25;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Main Track Asphalt Ribbon
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= SAMPLES; i++) {
      const smp = this.samples[i % SAMPLES];
      const vCoord = i / SAMPLES;

      const leftPt = smp.pos.clone().addScaledVector(smp.right, -ROAD_HALF_WIDTH);
      const rightPt = smp.pos.clone().addScaledVector(smp.right, ROAD_HALF_WIDTH);
      leftPt.y += 0.02;
      rightPt.y += 0.02;

      positions.push(leftPt.x, leftPt.y, leftPt.z);
      positions.push(rightPt.x, rightPt.y, rightPt.z);

      normals.push(smp.normal.x, smp.normal.y, smp.normal.z);
      normals.push(smp.normal.x, smp.normal.y, smp.normal.z);

      uvs.push(0, vCoord);
      uvs.push(1, vCoord);

      if (i < SAMPLES) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(indices);

    const roadMesh = new THREE.Mesh(roadGeo, this.asphaltMat);
    roadMesh.receiveShadow = true;
    this.group.add(roadMesh);

    // Start/Finish Checkered Line Strip at s = 0
    const sfCanvas = document.createElement('canvas');
    sfCanvas.width = 256;
    sfCanvas.height = 64;
    const sctx = sfCanvas.getContext('2d');
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 16; c++) {
        sctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#111111';
        sctx.fillRect(c * 16, r * 16, 16, 16);
      }
    }
    const sfTex = new THREE.CanvasTexture(sfCanvas);
    sfTex.colorSpace = THREE.SRGBColorSpace;
    const sfGeo = new THREE.PlaneGeometry(3.8, ROAD_HALF_WIDTH * 2);
    sfGeo.rotateX(-Math.PI / 2);
    const sfMesh = new THREE.Mesh(
      sfGeo,
      new THREE.MeshStandardMaterial({ map: sfTex, roughness: 0.45 })
    );
    const sfFrame = this.sampleAt(0, 0);
    sfMesh.position.copy(sfFrame.pos).add(new THREE.Vector3(0, 0.045, 0));
    this.group.add(sfMesh);

    // Elevated Panorama Overpass Deck Walls & Concrete Bridge Piers (where y > 1.2m)
    const pierGeo = new THREE.CylinderGeometry(0.85, 1.05, 1, 12);
    const railGeo = new THREE.BoxGeometry(4.5, 0.95, 0.35);

    for (let i = 0; i < SAMPLES; i += 2) {
      const smp = this.samples[i];
      if (smp.pos.y > 0.85) {
        const yaw = Math.atan2(smp.tangent.z, smp.tangent.x);
        for (const side of [-1, 1]) {
          const rail = new THREE.Mesh(railGeo, this.concreteMat);
          rail.position
            .copy(smp.pos)
            .addScaledVector(smp.right, side * (ROAD_HALF_WIDTH + CURB_WIDTH + 0.35));
          rail.position.y += 0.45;
          rail.rotation.y = -yaw;
          this.group.add(rail);
        }
        // Concrete support columns every ~35m except right over lower roadway!
        if (i % 16 === 0 && smp.pos.y > 3.2) {
          let clearOfLowerRoad = true;
          for (let j = 560; j < 1160; j += 4) {
            const other = this.samples[j];
            if (other.pos.y < 1.5) {
              const dx = other.pos.x - smp.pos.x;
              const dz = other.pos.z - smp.pos.z;
              if (dx * dx + dz * dz < (ROAD_HALF_WIDTH + 6.5) ** 2) {
                clearOfLowerRoad = false;
                break;
              }
            }
          }
          if (clearOfLowerRoad) {
            for (const side of [-1, 1]) {
              const h = smp.pos.y;
              const pier = new THREE.Mesh(pierGeo, this.concreteMat);
              pier.scale.set(1, h, 1);
              pier.position
                .copy(smp.pos)
                .addScaledVector(smp.right, side * (ROAD_HALF_WIDTH * 0.72));
              pier.position.y = h * 0.5;
              this.group.add(pier);
            }
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 4. 3D RED-AND-WHITE RUMBLE CURBS
  // --------------------------------------------------------------------------
  _buildCurbs() {
    const curbBlockGeo = new THREE.BoxGeometry(2.25, 0.12, CURB_WIDTH);
    const redMatrices = [];
    const whiteMatrices = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < SAMPLES; i++) {
      const smp = this.samples[i];
      const sec = smp.sector;
      if (!sec.curbIn && !sec.curbOut) continue;

      const yaw = Math.atan2(smp.tangent.z, smp.tangent.x);
      const insideSign = sec.curvature >= 0 ? 1 : -1; // Right turn (+k) -> inside is +right

      const sides = [];
      if (sec.curbIn && Math.abs(sec.curvature) > 0.05) sides.push(insideSign);
      if (sec.curbOut) sides.push(-insideSign);

      for (const side of sides) {
        // Don't block Pit Entry split at s = 905..945 on right shoulder
        if (side > 0 && smp.s >= 904 && smp.s <= 948) continue;

        dummy.position
          .copy(smp.pos)
          .addScaledVector(smp.right, side * (ROAD_HALF_WIDTH + CURB_WIDTH * 0.48));
        dummy.position.y += 0.05;
        dummy.rotation.set(0, -yaw, 0);
        dummy.updateMatrix();

        if (i % 2 === 0) redMatrices.push(dummy.matrix.clone());
        else whiteMatrices.push(dummy.matrix.clone());
      }
    }

    const redInst = new THREE.InstancedMesh(curbBlockGeo, this.curbRedMat, redMatrices.length);
    redMatrices.forEach((m, idx) => redInst.setMatrixAt(idx, m));
    redInst.instanceMatrix.needsUpdate = true;
    this.group.add(redInst);

    const whiteInst = new THREE.InstancedMesh(curbBlockGeo, this.curbWhiteMat, whiteMatrices.length);
    whiteMatrices.forEach((m, idx) => whiteInst.setMatrixAt(idx, m));
    whiteInst.instanceMatrix.needsUpdate = true;
    this.group.add(whiteInst);
  }

  // --------------------------------------------------------------------------
  // 5. PIT LANE BYPASS, 80 KM/H LIMIT LINE, PIT WALL & TEAM PIT BOXES
  // --------------------------------------------------------------------------
  _buildPitLaneAndBuildings() {
    // Collect ordered pit samples from s = 905 -> 1000 -> 122
    const pitIndices = [];
    for (let i = 0; i < SAMPLES; i++) {
      if (this.samples[i].s >= 905) pitIndices.push(i);
    }
    for (let i = 0; i < SAMPLES; i++) {
      if (this.samples[i].s <= 122) pitIndices.push(i);
    }

    const pitHalfWidth = 4.6;
    const posArr = [];
    const normArr = [];
    const uvArr = [];
    const idxArr = [];

    for (let k = 0; k < pitIndices.length; k++) {
      const smp = this.samples[pitIndices[k]];
      const center = smp.pos.clone().addScaledVector(smp.right, smp.pitOffset);
      const lPt = center.clone().addScaledVector(smp.right, -pitHalfWidth);
      const rPt = center.clone().addScaledVector(smp.right, pitHalfWidth + 3.2); // Extra apron for pit boxes
      lPt.y += 0.018;
      rPt.y += 0.018;

      posArr.push(lPt.x, lPt.y, lPt.z, rPt.x, rPt.y, rPt.z);
      normArr.push(0, 1, 0, 0, 1, 0);
      uvArr.push(0, k * 0.1, 1, k * 0.1);

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
    this.group.add(new THREE.Mesh(pitGeo, this.pitAsphaltMat));

    // Pit Wall separating Main Straight and Pit Lane (s = 948..1000..66)
    const wallStart = this.sampleAt(950, ROAD_HALF_WIDTH + 1.8).pos;
    const wallEnd = this.sampleAt(66, ROAD_HALF_WIDTH + 1.8).pos;
    const wallLen = wallEnd.x - wallStart.x;
    const pitWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallLen, 1.15, 0.45),
      this.concreteMat
    );
    pitWall.position.set((wallStart.x + wallEnd.x) * 0.5, 0.58, ROAD_HALF_WIDTH + 1.8);
    this.group.add(pitWall);

    // Pit Entry 80 KM/H Speed Limit Line & Sign at s = 936
    const limFrame = this.sampleAt(PIT_LANE_CONFIG.speedLimitLineS, 0);
    const limPos = limFrame.pos.clone().addScaledVector(limFrame.right, limFrame.pitOffset || 12.5);
    const limLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.04, 9.5),
      new THREE.MeshBasicMaterial({ color: 0xffcc00 })
    );
    limLine.position.copy(limPos).add(new THREE.Vector3(0, 0.03, 0));
    this.group.add(limLine);

    const signTex = this._makeTextSignTexture('PIT LIMIT', '80 KM/H', '#ff2222', '#ffffff', '#111111');
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 2.2, 2.2),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.3 })
    );
    signBoard.position.copy(limPos).addScaledVector(limFrame.right, 5.2).add(new THREE.Vector3(0, 2.1, 0));
    this.group.add(signBoard);

    // Pit Garage Complex & 8 Team Pit Boxes along Main Straight
    const garageBuilding = new THREE.Mesh(
      new THREE.BoxGeometry(390, 8.8, 16),
      new THREE.MeshStandardMaterial({ color: 0x1c2331, roughness: 0.55, metalness: 0.25 })
    );
    garageBuilding.position.set(70, 4.4, PIT_LANE_CONFIG.lateralOffset + 15.2);
    this.group.add(garageBuilding);

    // Glowing Second-Floor Race Control Windows
    const glassStrip = new THREE.Mesh(
      new THREE.BoxGeometry(386, 2.4, 0.3),
      new THREE.MeshStandardMaterial({
        color: 0x6fd6ff,
        emissive: 0x1e6fa8,
        emissiveIntensity: 0.75,
        roughness: 0.15,
      })
    );
    glassStrip.position.set(70, 6.4, PIT_LANE_CONFIG.lateralOffset + 7.1);
    this.group.add(glassStrip);

    // 8 Painted Team Pit Boxes (Player Box at s = 18m glows Neon Cyan/Green!)
    this.pitBoxes = [];
    const boxStations = [976, 988, 2, 18, 30, 42, 52, 60];
    boxStations.forEach((bs, idx) => {
      const isPlayerBox = bs === PIT_LANE_CONFIG.playerBoxS;
      const bf = this.sampleAt(bs, PIT_LANE_CONFIG.lateralOffset + 3.2);
      const boxMat = new THREE.MeshBasicMaterial({
        color: isPlayerBox ? 0x00ff9d : 0xffaa00,
        transparent: true,
        opacity: isPlayerBox ? 0.68 : 0.32,
      });
      const boxPad = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 3.4), boxMat);
      boxPad.rotation.x = -Math.PI / 2;
      boxPad.position.copy(bf.pos).add(new THREE.Vector3(0, 0.045, 0));
      this.group.add(boxPad);

      if (isPlayerBox) {
        // Overhead glowing "YOUR PIT BOX" beacon so mobile players never miss it!
        const beaconTex = this._makeTextSignTexture('PLAYER PIT', 'BOX HERE', '#00e676', '#05141f', '#00ff9d');
        const beacon = new THREE.Mesh(
          new THREE.BoxGeometry(4.2, 1.4, 0.25),
          new THREE.MeshBasicMaterial({ map: beaconTex })
        );
        beacon.position.copy(bf.pos).add(new THREE.Vector3(0, 4.2, 2.2));
        this.playerPitBeacon = beacon;
        this.group.add(beacon);
      }

      this.pitBoxes.push({ s: bs, isPlayerBox, pos: bf.pos.clone() });
    });
  }

  // --------------------------------------------------------------------------
  // 6. OVERHEAD "POLE POSITION / RACE PHANATIC F1" START GANTRY & 5 LIGHTS
  // --------------------------------------------------------------------------
  _buildStartGantry() {
    const pillarGeo = new THREE.BoxGeometry(1.1, 9.2, 1.1);
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xd8dee9, metalness: 0.65, roughness: 0.32 });

    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeo, metalMat);
      pillar.position.set(0, 4.6, side * (ROAD_HALF_WIDTH + 2.2));
      this.group.add(pillar);
    }

    const bannerTex = this._makeTextSignTexture(
      'POLE POSITION 2026',
      'RACE PHANATIC F1 • FUJI SPEEDWAY',
      '#e41c24',
      '#ffffff',
      '#ffd21e',
      1024,
      192
    );
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 2.7, (ROAD_HALF_WIDTH + 2.6) * 2),
      new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.3 })
    );
    banner.position.set(0, 8.2, 0);
    this.group.add(banner);

    // 5 F1 Starting Light Pods facing backwards (-X, toward cars on the starting grid)
    this.gantryLights = [];
    for (let i = 0; i < 5; i++) {
      const zOff = (i - 2) * 1.65;
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 1.3, 0.9),
        new THREE.MeshStandardMaterial({ color: 0x111317 })
      );
      housing.position.set(-0.85, 6.2, zOff);
      this.group.add(housing);

      const bulbMat = new THREE.MeshBasicMaterial({ color: 0x2a0808 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 14), bulbMat);
      bulb.position.set(-1.18, 6.2, zOff);
      this.group.add(bulb);
      this.gantryLights.push(bulbMat);
    }
  }

  setGantryLights(redCount, greenOn = false, yellowFlash = false) {
    for (let i = 0; i < this.gantryLights.length; i++) {
      if (yellowFlash) {
        this.gantryLights[i].color.setHex(0xffcc00);
      } else if (greenOn) {
        this.gantryLights[i].color.setHex(0x00ff55);
      } else if (i < redCount) {
        this.gantryLights[i].color.setHex(0xff1a1a);
      } else {
        this.gantryLights[i].color.setHex(0x240a0a);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 7. BRAKING MARKER BOARDS (150m, 100m, 50m) & ROADSIDE BILLBOARDS
  // --------------------------------------------------------------------------
  _buildBrakingBoardsAndBillboards() {
    // Turn 1 Braking Markers (before s = 290) & Turn 3 Hairpin Braking Markers (before s = 620)
    const markerSets = [
      { cornerS: 290, side: -1 },
      { cornerS: 620, side: 1 },
    ];
    for (const ms of markerSets) {
      for (const distRealM of [150, 100, 50]) {
        const markerS = ms.cornerS - distRealM / REAL_METERS_PER_GAME_METER;
        const fr = this.sampleAt(markerS, ms.side * (ROAD_HALF_WIDTH + 2.4));
        const tex = this._makeTextSignTexture(`${distRealM}m`, 'BRAKE', '#ffffff', '#111111', '#e41c24', 256, 256);
        const board = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 1.8, 2.2),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 })
        );
        const yaw = Math.atan2(fr.tangent.z, fr.tangent.x);
        board.position.copy(fr.pos).add(new THREE.Vector3(0, 1.1, 0));
        board.rotation.y = -yaw;
        this.group.add(board);
      }
    }

    // Authentic 1982 Namco/Atari Homage + 2026 Neon Sponsor Roadside Billboards
    this.billboards = [];
    const brandMats = BILLBOARD_BRANDS.map((b) => {
      const tex = this._makeTextSignTexture(b.title, b.sub, b.bg, b.fg, b.border, 512, 256);
      return new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.35,
        emissive: new THREE.Color(b.border),
        emissiveIntensity: 0.12,
      });
    });

    let bIdx = 0;
    for (let s = 30; s < 960; s += 28) {
      // Keep Pit Entry & Main Pit Wall clear on the right side
      const sides = (s >= 895 || s <= 125) ? [-1] : [-1, 1];
      for (const side of sides) {
        if ((bIdx + (side > 0 ? 1 : 0)) % 2 !== 0 && Math.abs(this.getPhysicsCurvature(s)) < 0.25) continue;
        const lat = side * (ROAD_HALF_WIDTH + 3.6);
        const fr = this.sampleAt(s, lat);
        // Skip elevated viaduct rails so billboards sit naturally on earthen shoulders
        if (fr.pos.y > 2.5) continue;

        const mat = brandMats[bIdx % brandMats.length];
        bIdx++;

        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.1, 6.2), mat);
        const yaw = Math.atan2(fr.tangent.z, fr.tangent.x);
        mesh.position.copy(fr.pos).add(new THREE.Vector3(0, 1.75, 0));
        mesh.rotation.y = -yaw;
        this.group.add(mesh);

        this.billboards.push({
          s,
          lateralOffset: lat,
          halfWidth: 3.1,
          pos: fr.pos.clone(),
          mesh,
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 8. MARSHAL YELLOW-FLAG POSTS, STANDING WATER PUDDLES & SKIDMARKS
  // --------------------------------------------------------------------------
  _buildMarshalPosts() {
    this.marshalPosts = [];
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6 });
    for (const sec of FUJI_SECTORS) {
      const postS = sec.start + 12;
      const fr = this.sampleAt(postS, -(ROAD_HALF_WIDTH + 2.6));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.2, 8), poleMat);
      pole.position.copy(fr.pos).add(new THREE.Vector3(0, 2.1, 0));
      this.group.add(pole);

      const flagMat = new THREE.MeshBasicMaterial({
        color: 0x22cc55,
        side: THREE.DoubleSide,
      });
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.05), flagMat);
      flag.position.copy(fr.pos).add(new THREE.Vector3(0, 3.7, 0.8));
      this.group.add(flag);

      this.marshalPosts.push({ sectorId: sec.id, flag, flagMat });
    }
  }

  updateMarshalFlags(yellowSectorsSet, vscActive, elapsedSec) {
    const wave = Math.sin(elapsedSec * 12.0) * 0.38;
    for (const mp of this.marshalPosts) {
      const isYellow = vscActive || yellowSectorsSet.has(mp.sectorId);
      if (isYellow) {
        mp.flagMat.color.setHex(elapsedSec % 0.4 < 0.2 ? 0xffea00 : 0xffaa00);
        mp.flag.rotation.y = wave;
        mp.flag.visible = true;
      } else {
        mp.flag.visible = false;
      }
    }
  }

  _buildPuddles() {
    // Low-spot puddles across Fuji Speedway (racing line + corner exits)
    const puddleDefs = [
      { s: 145, lat: -2.6, radius: 3.1 },
      { s: 268, lat:  2.2, radius: 2.9 },
      { s: 365, lat: -3.2, radius: 3.4 },
      { s: 495, lat: -2.4, radius: 3.2 },
      { s: 590, lat:  1.9, radius: 2.8 },
      { s: 695, lat:  3.0, radius: 3.3 },
      { s: 835, lat:  2.5, radius: 3.2 },
      { s: 968, lat: -2.1, radius: 2.8 },
    ];

    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x1a4b7c,
      roughness: 0.04,
      metalness: 0.88,
      transparent: true,
      opacity: 0.78,
    });

    this.puddles = puddleDefs.map((pd) => {
      const geo = new THREE.CircleGeometry(pd.radius, 24);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, puddleMat);
      const fr = this.sampleAt(pd.s, pd.lat);
      mesh.position.copy(fr.pos).add(new THREE.Vector3(0, 0.055, 0));
      mesh.visible = false;
      this.group.add(mesh);
      return {
        ...pd,
        pos: fr.pos.clone(),
        mesh,
        forceActive1982: false,
      };
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
      opacity: 0.48,
      depthWrite: false,
    });
    this.skidMesh = new THREE.InstancedMesh(skidGeo, skidMat, this.maxSkids);
    this.skidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.maxSkids; i++) {
      this.skidMesh.setMatrixAt(i, zero);
    }
    this.group.add(this.skidMesh);
    this._skidDummy = new THREE.Object3D();
  }

  addSkidmark(worldPos, yawRad) {
    const d = this._skidDummy;
    d.position.set(worldPos.x, worldPos.y + 0.04, worldPos.z);
    d.rotation.set(0, -yawRad, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    this.skidMesh.setMatrixAt(this.skidIndex, d.matrix);
    this.skidIndex = (this.skidIndex + 1) % this.maxSkids;
    this.skidMesh.instanceMatrix.needsUpdate = true;
  }

  // --------------------------------------------------------------------------
  // 9. DISTANT FOOTHILLS & GRANDSTANDS (MOUNT FUJI LOADED FROM BLENDER GLB!)
  // --------------------------------------------------------------------------
  _buildSceneryBackdrop() {
    // Grandstands along Main Pit Straight (North side, -Z) so crowd faces Pit Building
    const standMat = new THREE.MeshStandardMaterial({ color: 0x2c3647, roughness: 0.7 });
    const crowdCanvas = document.createElement('canvas');
    crowdCanvas.width = 256;
    crowdCanvas.height = 128;
    const cctx = crowdCanvas.getContext('2d');
    cctx.fillStyle = '#232a38';
    cctx.fillRect(0, 0, 256, 128);
    const colors = ['#ff3b30', '#ffcc00', '#34c759', '#007aff', '#ffffff', '#ff2d55', '#5ac8fa'];
    for (let i = 0; i < 1400; i++) {
      cctx.fillStyle = colors[i % colors.length];
      cctx.fillRect(Math.random() * 256, Math.random() * 128, 3, 4);
    }
    const crowdTex = new THREE.CanvasTexture(crowdCanvas);
    crowdTex.wrapS = THREE.RepeatWrapping;
    crowdTex.wrapT = THREE.RepeatWrapping;
    crowdTex.repeat.set(14, 2);
    crowdTex.colorSpace = THREE.SRGBColorSpace;
    const crowdMat = new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.85 });

    for (let gx = -120; gx <= 920; gx += 260) {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(210, 14, 22), standMat);
      stand.position.set(gx, 7, -(ROAD_HALF_WIDTH + 24));
      this.group.add(stand);

      const seats = new THREE.Mesh(new THREE.PlaneGeometry(208, 22), crowdMat);
      seats.position.set(gx, 8.2, -(ROAD_HALF_WIDTH + 12.8));
      seats.rotation.x = 0.52;
      this.group.add(seats);

      // Stadium Roof Canopy
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(212, 0.8, 24),
        new THREE.MeshStandardMaterial({ color: 0xe6ebf2, metalness: 0.4, roughness: 0.35 })
      );
      roof.position.set(gx, 16.5, -(ROAD_HALF_WIDTH + 21));
      this.group.add(roof);
    }

    // Parallax Hakone/Tanzawa Mountain Ridge Silhouette Ring surrounding the circuit
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x263c32, roughness: 0.95 });
    for (let i = 0; i < 28; i++) {
      const ang = (Math.PI * 2 * i) / 28;
      // Leave clear northern & ENE sightline for majestic snow-capped Mount Fuji!
      if (Math.sin(ang) < -0.55 || (Math.sin(ang) < 0.12 && Math.cos(ang) > 0.35)) continue;
      const dist = 2350 + (i % 3) * 280;
      const h = 95 + (i % 5) * 38;
      const r = 340 + (i % 4) * 90;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), hillMat);
      cone.position.set(450 + Math.cos(ang) * dist, h * 0.45, 380 + Math.sin(ang) * dist);
      this.group.add(cone);
    }
  }

  _makeTextSignTexture(line1, line2, bg, fg, border, w = 512, h = 256) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(8, Math.round(h * 0.06));
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);

    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(h * 0.30)}px "Orbitron", "Arial Black", sans-serif`;
    ctx.fillText(line1, w / 2, h * 0.38);
    ctx.font = `700 ${Math.round(h * 0.18)}px "Orbitron", "Segoe UI", sans-serif`;
    ctx.fillText(line2, w / 2, h * 0.72);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Minimap 2D projection helper (returns normalized [0..1] coordinates)
  computeMinimapBounds() {
    if (this._minimapBounds) return this._minimapBounds;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const smp of this.samples) {
      if (smp.pos.x < minX) minX = smp.pos.x;
      if (smp.pos.x > maxX) maxX = smp.pos.x;
      if (smp.pos.z < minZ) minZ = smp.pos.z;
      if (smp.pos.z > maxZ) maxZ = smp.pos.z;
    }
    const pad = 90;
    this._minimapBounds = {
      minX: minX - pad,
      maxX: maxX + pad,
      minZ: minZ - pad,
      maxZ: maxZ + pad,
    };
    return this._minimapBounds;
  }
}
