// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Blender GLB Asset Loader, Clearcoat PBR F1 Car Rig, Aero/Exhaust VFX & Pit Crew
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TIRE_COMPOUNDS, PIT_LANE_CONFIG } from './config.js';

// ============================================================================
// SHARED PROCEDURAL AAA PBR TEXTURES (CACHED ONCE — ZERO DUPLICATE GPU MEMORY)
// ============================================================================
let _sharedShadowTex = null;
function getFeatheredShadowTexture() {
  if (_sharedShadowTex) return _sharedShadowTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 256);

  // Soft sculpted underbody ambient occlusion core
  ctx.save();
  ctx.scale(1.0, 2.0);
  const gCore = ctx.createRadialGradient(64, 64, 6, 64, 64, 58);
  gCore.addColorStop(0.0,  'rgba(2, 4, 9, 0.88)');
  gCore.addColorStop(0.48, 'rgba(3, 6, 12, 0.64)');
  gCore.addColorStop(0.78, 'rgba(3, 6, 12, 0.22)');
  gCore.addColorStop(1.0,  'rgba(3, 6, 12, 0.0)');
  ctx.fillStyle = gCore;
  ctx.fillRect(0, 0, 128, 128);
  ctx.restore();

  // Four subtle darker tire contact-patch AO anchors
  const wheelSpots = [
    [26, 64],  [102, 64],
    [26, 190], [102, 190],
  ];
  for (const [wx, wy] of wheelSpots) {
    const gw = ctx.createRadialGradient(wx, wy, 2, wx, wy, 20);
    gw.addColorStop(0.0, 'rgba(1, 2, 5, 0.55)');
    gw.addColorStop(1.0, 'rgba(1, 2, 5, 0.0)');
    ctx.fillStyle = gw;
    ctx.fillRect(wx - 22, wy - 22, 44, 44);
  }

  _sharedShadowTex = new THREE.CanvasTexture(c);
  return _sharedShadowTex;
}

let _sharedCarbonMaps = null;
function getCarbonWeaveMaps() {
  if (_sharedCarbonMaps) return _sharedCarbonMaps;
  const size = 128;
  const diffC = document.createElement('canvas');
  diffC.width = size;
  diffC.height = size;
  const dCtx = diffC.getContext('2d');

  const bumpC = document.createElement('canvas');
  bumpC.width = size;
  bumpC.height = size;
  const bCtx = bumpC.getContext('2d');

  dCtx.fillStyle = '#14171f';
  dCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#606060';
  bCtx.fillRect(0, 0, size, size);

  // Authentic 2x2 diagonal twill carbon-fiber weave pattern
  const step = 8;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const diag = ((x / step + y / step) % 4 + 4) % 4;
      const bright = diag < 2;
      dCtx.fillStyle = bright ? '#252b38' : '#0d1016';
      dCtx.fillRect(x, y, step - 1, step - 1);
      dCtx.fillStyle = bright ? '#323a4b' : '#161a24';
      dCtx.fillRect(x + 1, y + 1, step - 3, (step / 2) - 1);

      bCtx.fillStyle = bright ? '#c8c8c8' : '#383838';
      bCtx.fillRect(x, y, step - 1, step - 1);
    }
  }

  const map = new THREE.CanvasTexture(diffC);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(14, 14);
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(bumpC);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(14, 14);

  _sharedCarbonMaps = { map, bumpMap };
  return _sharedCarbonMaps;
}

let _sharedTireMaps = null;
function getTireTreadMaps() {
  if (_sharedTireMaps) return _sharedTireMaps;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#181a1f';
  ctx.fillRect(0, 0, 128, 128);

  // Scrubbed racing slick micro-grain + subtle circumferential bands so wheel spin reads clearly
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    const v = 18 + Math.floor(Math.random() * 24);
    ctx.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
    ctx.fillRect(x, y, 2, 3);
  }
  ctx.fillStyle = 'rgba(8, 10, 14, 0.42)';
  for (const gx of [26, 52, 76, 102]) {
    ctx.fillRect(gx, 0, 3, 128);
  }
  // Subtle lateral heat-cycle scrub marks for clear spin visibility
  ctx.fillStyle = 'rgba(48, 53, 64, 0.28)';
  for (let y = 0; y < 128; y += 16) {
    ctx.fillRect(8, y, 112, 3);
  }

  const map = new THREE.CanvasTexture(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 3);
  map.colorSpace = THREE.SRGBColorSpace;

  _sharedTireMaps = { map };
  return _sharedTireMaps;
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

  // Glowing radial friction ring + cross-drilled cooling holes
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

  // Ventilated carbon-ceramic drill slots
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

let _sharedLollipopTex = null;
function getLollipopTexture() {
  if (_sharedLollipopTex) return _sharedLollipopTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);

  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1522';
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#ffd600';
  ctx.stroke();

  ctx.fillStyle = '#00ff88';
  ctx.font = '900 54px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BOX #1', 128, 102);
  ctx.fillStyle = '#ffd600';
  ctx.font = '800 34px "Segoe UI", Arial, sans-serif';
  ctx.fillText('1ST GEAR', 128, 158);

  _sharedLollipopTex = new THREE.CanvasTexture(c);
  _sharedLollipopTex.colorSpace = THREE.SRGBColorSpace;
  return _sharedLollipopTex;
}

// ============================================================================
// ASSET LIBRARY — GLTF / GLB LOADER WITH GRACEFUL FALLBACKS
// ============================================================================
export class AssetLibrary {
  constructor() {
    this.loader = new GLTFLoader();
    this.templates = {
      chassis: null,
      wheel: null,
      pitCrew: null,
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

    const [chassis, wheel, pitCrew, mountFuji, yacht] = await Promise.all([
      loadSafe('./assets/models/f1_car.glb'),
      loadSafe('./assets/models/f1_wheel.glb'),
      loadSafe('./assets/models/pit_crew.glb'),
      loadSafe('./assets/models/mount_fuji.glb'),
      loadSafe('./assets/models/yacht.glb'),
    ]);

    this.templates.chassis = chassis;
    this.templates.wheel = wheel;
    this.templates.pitCrew = pitCrew;
    this.templates.mountFuji = mountFuji;
    this.templates.yacht = yacht;
    return this.templates;
  }
}

// ============================================================================
// FORMULA 1 CLEARCOAT PBR CAR RIG & REAL-TIME MOTORSPORT VFX
// ============================================================================
export class FormulaCarRig {
  constructor(assets, livery = {}) {
    const {
      primary = 0xe41c24,
      accent = 0xffffff,
      helmet = 0x00e5ff,
      rim = 0x3e4552,
      compound = 'SOFT',
    } = livery;

    this.root = new THREE.Group();
    this.chassisTiltGroup = new THREE.Group();
    this.root.add(this.chassisTiltGroup);

    const carbonMaps = getCarbonWeaveMaps();
    const tireMaps = getTireTreadMaps();
    const rotorTex = getBrakeRotorTexture();

    // 1. Deep Metallic Basecoat + Glass-Smooth Clearcoat Automotive Paint
    this.primaryMat = new THREE.MeshPhysicalMaterial({
      color: primary,
      metalness: 0.48,
      roughness: 0.14,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      reflectivity: 1.0,
      envMapIntensity: 1.65,
    });
    this.accentMat = new THREE.MeshPhysicalMaterial({
      color: accent,
      metalness: 0.30,
      roughness: 0.16,
      clearcoat: 0.96,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.45,
    });

    // 2. Satin-Clearcoated 2x2 Twill Carbon Fiber Weave
    this.carbonMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: carbonMaps.map,
      bumpMap: carbonMaps.bumpMap,
      bumpScale: 0.006,
      metalness: 0.36,
      roughness: 0.30,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
      envMapIntensity: 1.15,
    });

    // 3. Heat-Tempered Titanium Exhaust Alloy
    this.exhaustMat = new THREE.MeshStandardMaterial({
      color: 0xa8a29a,
      metalness: 0.96,
      roughness: 0.16,
      emissive: new THREE.Color(0xff4800),
      emissiveIntensity: 0.08,
      envMapIntensity: 1.7,
    });

    // 4. Glossy Driver Helmet & Iridium Mirror-Chrome Visor
    this.helmetMat = new THREE.MeshPhysicalMaterial({
      color: helmet,
      metalness: 0.45,
      roughness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.7,
    });
    this.visorMat = new THREE.MeshPhysicalMaterial({
      color: 0x081528,
      metalness: 1.0,
      roughness: 0.02,
      clearcoat: 1.0,
      clearcoatRoughness: 0.01,
      iridescence: 0.72,
      iridescenceIOR: 1.42,
      envMapIntensity: 2.35,
    });

    // 5. Blinking FIA Rear Rain / ERS Harvesting LED Matrix
    this.rainLightMat = new THREE.MeshStandardMaterial({
      color: 0xff1a22,
      emissive: new THREE.Color(0xff1420),
      emissiveIntensity: 2.6,
      roughness: 0.15,
    });

    // 6. Pirelli-Style Tire Rubber, Sidewall Compound Ring, Forged Rim & Slotted Carbon Rotor
    const compHex = TIRE_COMPOUNDS[compound]?.colorHex || '#ff2a2a';
    this.tireRubberMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tireMaps.map,
      roughness: 0.64,
      metalness: 0.08,
      envMapIntensity: 0.75,
    });
    this.compoundMat = new THREE.MeshPhysicalMaterial({
      color: compHex,
      emissive: compHex,
      emissiveIntensity: 0.46,
      roughness: 0.28,
      clearcoat: 0.75,
      clearcoatRoughness: 0.12,
    });
    this.wheelRimMat = new THREE.MeshStandardMaterial({
      color: rim,
      metalness: 0.92,
      roughness: 0.18,
      envMapIntensity: 1.70,
    });
    this.nutLeftMat = new THREE.MeshStandardMaterial({
      color: 0xff2438,
      metalness: 0.88,
      roughness: 0.18,
      envMapIntensity: 1.4,
    });
    this.nutRightMat = new THREE.MeshStandardMaterial({
      color: 0x009dff,
      metalness: 0.88,
      roughness: 0.18,
      envMapIntensity: 1.4,
    });
    this.brakeDiscMat = new THREE.MeshStandardMaterial({
      color: 0x3b3634,
      metalness: 0.78,
      roughness: 0.30,
      bumpMap: rotorTex,
      bumpScale: 0.008,
      emissive: new THREE.Color(0xff5200),
      emissiveMap: rotorTex,
      emissiveIntensity: 0.0,
    });
    this.caliperMat = new THREE.MeshPhysicalMaterial({
      color: primary,
      metalness: 0.65,
      roughness: 0.22,
      clearcoat: 0.85,
    });

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
    };
    this._drsOpenSign = -1;

    this._buildChassis(assets.templates.chassis);
    this._buildCockpitAndAeroDetails();
    this._buildWheels(assets.templates.wheel);
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

  _buildChassis(template) {
    if (template) {
      const clone = template.clone(true);
      // Blender -Y (Nose) exports to glTF +Z; rotate 180 deg around Y so Nose points -Z (forward)
      // and Rear Wing + Rain Light + Exhaust face +Z (toward chase camera)!
      clone.rotation.y = Math.PI;
      clone.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        child.userData.baseRotX = child.rotation.x;
        child.userData.baseRotY = child.rotation.y;
        child.userData.baseRotZ = child.rotation.z;

        const n = child.name || '';
        const mName = child.material?.name || '';

        if (
          n === 'Body_Main' ||
          n.startsWith('Front_Wing_Endplate') ||
          n.startsWith('Rear_Wing_Endplate') ||
          mName.startsWith('Livery_Primary')
        ) {
          child.material = this.primaryMat;
        } else if (
          n === 'Body_Accent' ||
          n === 'Front_Wing_Main' ||
          n === 'Rear_Wing_Main' ||
          n === 'Rear_Wing_DRS_Flap' ||
          mName.startsWith('Livery_Accent')
        ) {
          child.material = this.accentMat;
        } else if (n === 'Driver_Helmet' || mName.startsWith('Driver_Helmet')) {
          child.material = this.helmetMat;
        } else if (n === 'Driver_Visor' || mName.startsWith('Driver_Visor')) {
          child.material = this.visorMat;
        } else if (
          n === 'Carbon_Chassis' ||
          n === 'Suspension_Arms' ||
          n === 'Cockpit_Wheel' ||
          n === 'Roll_Hoop_TCam' ||
          n === 'Halo_Titanium' ||
          mName.startsWith('Carbon_Fiber')
        ) {
          child.material = this.carbonMat;
        } else if (n === 'Exhaust_Pipe' || n.includes('Exhaust') || mName.startsWith('Titanium_Exhaust')) {
          child.material = this.exhaustMat;
        } else if (n === 'Rear_Rain_Light' || n === 'Rain_Light' || n.includes('Rain_Light') || mName.startsWith('Rain_Light')) {
          child.material = this.rainLightMat;
        }

        if (n === 'Front_Wing_Main') this.parts.fwMain = child;
        if (n === 'Front_Wing_Endplate_R') this.parts.fwEndL = child;
        if (n === 'Front_Wing_Endplate_L') this.parts.fwEndR = child;
        if (n === 'Rear_Wing_Main') this.parts.rwMain = child;
        if (n === 'Rear_Wing_Endplate_R') this.parts.rwEndL = child;
        if (n === 'Rear_Wing_Endplate_L') this.parts.rwEndR = child;
        if (n === 'Rear_Wing_DRS_Flap') {
          this.parts.drsFlap = child;
          this._drsOpenSign = -1; // In glTF clone space, -0.32 rad lifts flap leading edge upward!
        }
        if (n === 'Cockpit_Wheel') this.parts.cockpitWheel = child;
        if (n === 'Roll_Hoop_TCam') this.parts.rollHoopTCam = child;
      });
      this.chassisTiltGroup.add(clone);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.42, 4.2), this.primaryMat);
      body.position.set(0, 0.32, 0);
      body.castShadow = true;
      const fw = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.08, 0.36), this.accentMat);
      fw.position.set(0, 0.12, -2.2);
      fw.castShadow = true;
      const rw = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.32, 0.30), this.accentMat);
      rw.position.set(0, 0.72, 1.95);
      rw.castShadow = true;
      this.parts.fwMain = fw;
      this.parts.rwMain = rw;
      this.chassisTiltGroup.add(body, fw, rw);
    }

    // Soft Feathered Contact Drop Shadow under car (polygonOffset prevents any Z-fighting!)
    const shadGeo = new THREE.PlaneGeometry(2.58, 5.42);
    shadGeo.rotateX(-Math.PI / 2);
    const shadMat = new THREE.MeshBasicMaterial({
      map: getFeatheredShadowTexture(),
      transparent: true,
      opacity: 0.80,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    const shadowPlane = new THREE.Mesh(shadGeo, shadMat);
    shadowPlane.position.y = 0.032;
    this.root.add(shadowPlane);
  }

  _buildCockpitAndAeroDetails() {
    // 1. FIA Roll-Hoop Overhead T-Cam Pod (only built procedurally if not already in f1_car.glb)
    if (!this.parts.rollHoopTCam) {
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

    // 2. Cockpit Steering Wheel + Live RPM Shift-Light Strip (uses GLB Cockpit_Wheel when present!)
    this.shiftLedMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    if (this.parts.cockpitWheel) {
      const dashLed = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.016, 0.022), this.shiftLedMat);
      dashLed.position.set(0, 0.605, -0.525);
      this.chassisTiltGroup.add(dashLed);
    } else {
      const swGroup = new THREE.Group();
      swGroup.position.set(0, 0.555, -0.50);
      swGroup.rotation.x = -0.26;
      const swBody = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.135, 0.024), this.carbonMat);
      const swLed = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.028), this.shiftLedMat);
      swLed.position.set(0, 0.052, 0.003);
      swGroup.add(swBody, swLed);
      this.parts.steeringWheel = swGroup;
      this.chassisTiltGroup.add(swGroup);
    }

    // 3. Articulated Rear-Wing DRS Flap fallback if not separated in GLB
    if (!this.parts.drsFlap) {
      const flapGeo = new THREE.BoxGeometry(1.04, 0.022, 0.16);
      flapGeo.translate(0, 0, -0.08);
      const fallbackFlap = new THREE.Mesh(flapGeo, this.accentMat);
      fallbackFlap.position.set(0, 0.865, 2.04);
      fallbackFlap.userData.baseRotX = 0;
      this.chassisTiltGroup.add(fallbackFlap);
      this.parts.drsFlap = fallbackFlap;
      this._drsOpenSign = 1; // In chassisTiltGroup (-Z forward), +0.32 rad lifts flap leading edge upward!
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

      let hasGlbCaliper = false;
      if (wheelTemplate) {
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
        spinPivot.add(cyl);
      }

      // Non-spinning Brembo Brake Caliper mounted inside upright (if not already inside GLB)
      if (!hasGlbCaliper) {
        const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.13, 0.095), this.caliperMat);
        caliper.position.set(isLeft ? 0.02 : -0.02, 0.06, c.isFront ? 0.11 : -0.11);
        steerPivot.add(caliper);
      }

      // Soft Incandescent Brake Thermal Glow Disc visible through wheel spokes under heavy braking!
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
      this.wheels.push({ ...c, steerPivot, spinPivot });
    }
  }

  _buildVFXAttachments() {
    const glowTex = getSoftGlowTexture();

    // 1. FIA Rear Rain-Light Soft Ruby Halo Sprite (blooms cleanly through wet spray!)
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

    // Twin wastegate micro-flame tongues + radial muzzle flash
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

    // 3. High-Speed (>250 km/h) Rear-Wingtip Aero Condensation Vortex Ribbons!
    this.vortexGroup = new THREE.Group();
    this.vortexTrails = [];
    const vortexOuterGeo = new THREE.ConeGeometry(0.052, 4.6, 10, 1, true);
    vortexOuterGeo.translate(0, 2.3, 0);
    vortexOuterGeo.rotateX(Math.PI / 2);

    const vortexCoreGeo = new THREE.ConeGeometry(0.020, 3.8, 8, 1, true);
    vortexCoreGeo.translate(0, 1.9, 0);
    vortexCoreGeo.rotateX(Math.PI / 2);

    this.vortexOuterMat = new THREE.MeshBasicMaterial({
      color: 0xdff4ff,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.vortexCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
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

    // 4. Multi-Stage Wet Rooster-Tail Spray (Twin Rear Tire Jets + High Central Venturi Plume!)
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
      // First 8 puffs: RL & RR tire wake jets; next 8 puffs: towering central Venturi diffuser plume!
      const isCenterPlume = i >= 8;
      const side = isCenterPlume ? ((i % 2 === 0 ? -1 : 1) * 0.16) : (i % 2 === 0 ? -0.84 : 0.84);
      const puff = new THREE.Mesh(puffGeo, this.sprayMat);
      puff.position.set(side, 0.35, 1.85 + (i % 8) * 0.65);
      this.sprayGroup.add(puff);
      this.sprayPuffs.push({ mesh: puff, baseX: side, idx: i, isCenterPlume });
    }
    this.sprayGroup.visible = false;
    this.root.add(this.sprayGroup);

    // 5. Titanium Underfloor Skid-Block & Damage Spark Shower (Curbs, >268 km/h Aero Compression & Damage)
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
      this.sparks.push({
        mesh: sp,
        seed: i * 0.618,
        spreadX,
      });
    }
    this.sparkGroup.visible = false;
    this.root.add(this.sparkGroup);
  }

  setCompound(compoundId) {
    const comp = TIRE_COMPOUNDS[compoundId] || TIRE_COMPOUNDS.SOFT;
    this.compoundMat.color.setStyle(comp.colorHex);
    this.compoundMat.emissive.setStyle(comp.colorHex);
  }

  setLivery(livery = {}) {
    if (livery.primary !== undefined) {
      this.primaryMat.color.set(livery.primary);
      if (livery.trim === undefined) {
        this.caliperMat.color.set(livery.primary);
      }
    }
    if (livery.trim !== undefined) {
      this.caliperMat.color.set(livery.trim);
    }
    if (livery.accent !== undefined) {
      this.accentMat.color.set(livery.accent);
    }
    if (livery.helmet !== undefined) {
      this.helmetMat.color.set(livery.helmet);
    }
    if (livery.rim !== undefined) {
      this.wheelRimMat.color.set(livery.rim);
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

    // Dynamic chassis brake dive, squat & cornering roll
    const targetPitch =
      (carState.brakeInput || 0) * 0.025 -
      (carState.throttleInput || 0) * 0.013 +
      (carState.pitJackLift || 0) * 0.042;
    const targetRoll = -(carState.latG || 0) * 0.021;
    const tiltLerp = Math.min(1, dt * 14);
    this.chassisTiltGroup.rotation.x += (targetPitch - this.chassisTiltGroup.rotation.x) * tiltLerp;
    this.chassisTiltGroup.rotation.z += (targetRoll - this.chassisTiltGroup.rotation.z) * tiltLerp;
    this.chassisTiltGroup.position.y = (carState.pitJackLift || 0) * 0.18;

    // Effective steering angle (supports both 240Hz steerAngleRad & 60Hz Replay steerInput!)
    const effSteerRad =
      carState.steerAngleRad !== undefined
        ? carState.steerAngleRad
        : (carState.steerInput || 0) * 0.42;
    const wheelTurnRad =
      carState.steerInput !== undefined
        ? carState.steerInput * 0.92
        : effSteerRad * 2.0;

    // Cockpit Steering Wheel Live Rotation & RPM Shift-Light LEDs
    const rpm = carState.rpm || 0;
    if (this.parts.cockpitWheel) {
      const baseZ = this.parts.cockpitWheel.userData.baseRotZ || 0;
      this.parts.cockpitWheel.rotation.z = baseZ + wheelTurnRad;
    } else if (this.parts.steeringWheel) {
      this.parts.steeringWheel.rotation.z = -wheelTurnRad;
    }
    if (this.shiftLedMat) {
      if (rpm > 12250) this.shiftLedMat.color.setHex(0x00e5ff);
      else if (rpm > 10900) this.shiftLedMat.color.setHex(0xff2438);
      else if (rpm > 9000) this.shiftLedMat.color.setHex(0xffd600);
      else this.shiftLedMat.color.setHex(0x00ff88);
    }

    // Subtle Wet Tire Sheen & Exhaust Pipe Thermal Glow
    this.tireRubberMat.roughness = moistureW > 0.12 ? Math.max(0.22, 0.64 - moistureW * 0.45) : 0.64;
    this.exhaustMat.emissiveIntensity = 0.06 + Math.max(0, (rpm - 9500) / 3500) * 0.45;

    // Blinking FIA Rear Rain / ERS Light when wet, in pit lane, or harvesting off-throttle
    const speedKmh = carState.speedKmh || 0;
    const flashRainLight = moistureW > 0.10 || carState.inPitLane || (speedKmh > 60 && (carState.throttleInput || 0) < 0.22);
    const pulseOn = ((elapsedSec * 7.5 + (carState.carNum || 0) * 0.31) % 1.0) < 0.54;
    const rainInt = flashRainLight ? (pulseOn ? 4.8 : 0.32) : 1.45;
    this.rainLightMat.emissiveIntensity = rainInt;
    this.rainHaloMat.opacity = flashRainLight ? (pulseOn ? 0.82 : 0.08) : 0.32;

    // Spin & steer all 4 wheels
    const speedMps = speedKmh / 3.6;
    this.wheelSpinAngle -= (speedMps / 0.34) * dt;
    const visualSteer = -effSteerRad * 0.88;
    for (const w of this.wheels) {
      if (w.isFront) w.steerPivot.rotation.y = visualSteer;
      w.spinPivot.rotation.x = this.wheelSpinAngle;
    }

    // Glowing hot carbon-ceramic brake discs + inner wheel thermal halo under heavy braking
    const brakeIn = carState.brakeInput || 0;
    const heatGain = brakeIn > 0.22 && speedKmh > 88
      ? brakeIn * (speedKmh / 270) * 8.4
      : 0;
    if (heatGain > 0) {
      this.brakeGlow = Math.min(5.2, this.brakeGlow + heatGain * dt);
    } else {
      this.brakeGlow = Math.max(0, this.brakeGlow - 3.1 * dt);
    }
    this.brakeDiscMat.emissiveIntensity = this.brakeGlow;
    const haloAlpha = Math.min(0.58, this.brakeGlow * 0.12);
    for (const hm of this.brakeHaloMats) {
      hm.opacity = haloAlpha;
    }

    // Automatic off-throttle overrun micro-pop on aggressive high-RPM downshifts/braking
    if ((carState.revBlipTimer || 0) > 0.06 && speedKmh > 135 && this.backfireTimer <= 0) {
      this.backfireTimer = 0.085;
    }

    // Dual-Stage Blue-Core + Orange-Outer Exhaust Shift-Cut / Backfire Flame
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

    // High-Speed (>250 km/h) Rear-Wingtip Aero Condensation Vortex Ribbons!
    const vortexThreshold = 250.0;
    if (speedKmh > vortexThreshold && !carState.exploded) {
      this.vortexGroup.visible = true;
      const speedNorm = Math.min(1.0, (speedKmh - vortexThreshold) / 64.0);
      const humidBoost = 1.0 + moistureW * 1.35 + (carState.inSlipstream ? 0.35 : 0.0);
      const vAlpha = Math.min(0.46, speedNorm * 0.19 * humidBoost);
      this.vortexOuterMat.opacity = vAlpha;
      this.vortexCoreMat.opacity = Math.min(0.68, vAlpha * 1.55);

      const slipYaw = -(carState.latG || 0) * 0.038;
      const lenScale = 0.65 + speedNorm * 0.65;
      for (const vt of this.vortexTrails) {
        const flutter = Math.sin(elapsedSec * 28.0 + vt.side * 1.7) * 0.012;
        vt.tipPivot.rotation.y = slipYaw + flutter;
        vt.tipPivot.rotation.x = -0.025 + Math.cos(elapsedSec * 22.0 + vt.side) * 0.008;
        vt.outerTube.scale.set(1.0, 1.0, lenScale);
        vt.coreTube.scale.set(1.0, 1.0, lenScale * 0.95);
      }
    } else {
      this.vortexGroup.visible = false;
    }

    // Multi-Stage Wet Rooster-Tail Spray Plumes when W > 0.12 and speed > 58 km/h
    const showSpray = moistureW > 0.12 && speedKmh > 58 && !carState.exploded;
    this.sprayGroup.visible = showSpray;
    if (showSpray) {
      const intensity = Math.min(1.0, ((speedKmh - 58) / 195) * (0.42 + moistureW * 0.92));
      this.sprayMat.opacity = 0.15 + intensity * 0.36;
      for (const p of this.sprayPuffs) {
        const rate = p.isCenterPlume ? 7.8 : 9.6;
        const phase = (elapsedSec * rate + p.idx * 0.29) % 1.0;
        if (p.isCenterPlume) {
          // Towering central ground-effect diffuser rooster-tail plume
          p.mesh.position.z = 2.0 + phase * (5.5 + intensity * 6.8);
          p.mesh.position.y = 0.42 + phase * (1.85 + intensity * 2.45);
          p.mesh.position.x = p.baseX + Math.sin(elapsedSec * 6.0 + p.idx) * phase * 0.55;
          const sc = 0.65 + phase * (1.9 + intensity * 2.1);
          p.mesh.scale.setScalar(sc);
        } else {
          // Low dense rear-tire wake jets
          p.mesh.position.z = 1.65 + phase * (3.8 + intensity * 4.5);
          p.mesh.position.y = 0.24 + phase * (0.95 + intensity * 1.25);
          p.mesh.position.x = p.baseX * (1.0 + phase * 0.68);
          const sc = 0.48 + phase * (1.35 + intensity * 1.45);
          p.mesh.scale.setScalar(sc);
        }
        p.mesh.rotation.z = elapsedSec * 1.8 + p.idx;
      }
    }

    // Articulated Rear_Wing_DRS_Flap (~0.32 rad open in slipstream / DRS / fast straight)
    // & Front-Wing Endplate Damage (>0.48 tilt/hide, 100% restored when repaired!)
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

    const damageSpark = (hasPunc || fwDmg > 0.55 || rwDmg > 0.60) && speedKmh > 45;

    const curbSpark = !!carState.onCurb && speedKmh > 118;
    // Intermittent aero-compression plank bottoming above 268 km/h!
    const aeroPlankSpark =
      speedKmh > 268 &&
      Math.sin(elapsedSec * 13.5 + (carState.carNum || 1) * 1.9) > 0.32;

    const showSparks = !carState.exploded && (damageSpark || curbSpark || aeroPlankSpark);
    this.sparkGroup.visible = showSparks;
    if (showSparks) {
      const sparkPower = damageSpark ? 1.0 : (curbSpark ? 0.85 : Math.min(1.0, (speedKmh - 265) / 45));
      for (let i = 0; i < this.sparks.length; i++) {
        const sObj = this.sparks[i];
        const ph = (elapsedSec * (15.0 + (i % 4) * 2.5) + sObj.seed) % 1.0;
        sObj.mesh.visible = ph < (0.35 + sparkPower * 0.60);
        if (sObj.mesh.visible) {
          sObj.mesh.position.z = 0.95 + ph * (2.6 + sparkPower * 1.9);
          sObj.mesh.position.x = sObj.spreadX * (0.45 + ph * 0.95);
          // Skittering bounce arc off the asphalt!
          sObj.mesh.position.y = 0.045 + Math.abs(Math.sin(ph * Math.PI * 2.2)) * (0.16 + sparkPower * 0.18);
          sObj.mesh.rotation.x = -0.08 * Math.cos(ph * Math.PI * 2.2);
          sObj.mesh.scale.z = 0.65 + sparkPower * 0.85;
        }
      }
    }

    this._prevRpm = rpm;
  }
}

// ============================================================================
// 3D ANIMATED PIT CREW DIORAMA (8 CREW MEMBERS + GANTRY BOOM + LOLLIPOP + JACKS)
// Centered directly on Player Pit Box so all 8 crew swarm cleanly around #1 Car!
// ============================================================================
export class PitCrewDiorama {
  constructor(scene, assets, track) {
    this.group = new THREE.Group();
    this.members = [];
    this.wheelGunFlashes = [];
    this.active = false;

    this._buildCrewMaterialsAndGantry(assets);
    this.repositionForTrack(track);
    scene.add(this.group);
  }

  _buildCrewMaterialsAndGantry(assets) {
    this.suitMat = new THREE.MeshStandardMaterial({ color: 0xe41c24, roughness: 0.48, metalness: 0.15 });
    this.stripeMat = new THREE.MeshStandardMaterial({ color: 0xf7f9fc, roughness: 0.35, metalness: 0.2 });
    const suitMat = this.suitMat;
    const stripeMat = this.stripeMat;
    const helmMat = new THREE.MeshPhysicalMaterial({ color: 0xf5f8ff, roughness: 0.14, metalness: 0.35, clearcoat: 1.0 });
    const visorMat = new THREE.MeshPhysicalMaterial({ color: 0x0a1628, roughness: 0.04, metalness: 0.96, clearcoat: 1.0 });
    const gearMat = new THREE.MeshStandardMaterial({ color: 0x1b2029, roughness: 0.32, metalness: 0.72 });
    const glowTex = getSoftGlowTexture();

    // Overhead Carbon Pit-Box Pneumatic Boom Rig (sits safely on garage apron z = +4.1m)
    const boomGroup = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 3.85, 12), gearMat);
    post.position.set(0.2, 1.92, 4.15);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 4.4), gearMat);
    arm.position.set(0.2, 3.78, 2.05);
    boomGroup.add(post, arm);
    this.group.add(boomGroup);

    // Local frame: +X is car nose forward, -X is car rear, z=0 is car centerline, +Z is Pit Garage apron!
    // Idle `stand` positions stay at z >= +3.1m so pit lane fast-corridor is 100% unobstructed!
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
      let mesh;
      if (assets.templates.pitCrew) {
        mesh = assets.templates.pitCrew.clone(true);
        mesh.traverse((ch) => {
          if (!ch.isMesh) return;
          ch.castShadow = true;
          const cn = ch.name || '';
          const cm = ch.material?.name || '';
          if (cn === 'Crew_Suit' || cm.startsWith('Crew_Suit')) ch.material = suitMat;
          else if (cn === 'Crew_Chest_Stripe' || cm.startsWith('Crew_Stripe')) ch.material = stripeMat;
          else if (cn === 'Crew_Helmet' || cm.startsWith('Crew_Helmet')) ch.material = helmMat;
          else if (cn === 'Crew_Visor' || cm.startsWith('Crew_Visor')) ch.material = visorMat;
          else if (cn === 'Crew_Equipment' || cn.includes('Equip') || cm.startsWith('Crew_Equip') || cm.startsWith('Crew_Gear')) {
            ch.material = gearMat;
          }
        });
      } else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.7, 0.35), suitMat);
        mesh.position.y = 0.85;
        mesh.castShadow = true;
      }
      holder.add(mesh);

      // Role-specific 3D Pit Props!
      let flashMat = null;
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
        const flashPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), flashMat);
        flashPlane.position.set(0, 0.42, 0.46);
        holder.add(flashPlane);
      } else if (r.role === 'FRONT_JACK' || r.role === 'REAR_JACK') {
        const jack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.10, 0.85), stripeMat);
        jack.position.set(0, 0.08, 0.55);
        holder.add(jack);
      } else if (r.role === 'LOLLIPOP') {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.85, 8), gearMat);
        pole.rotation.x = Math.PI / 2;
        pole.position.set(-0.15, 1.32, 0.65);
        const signMat = new THREE.MeshBasicMaterial({
          map: getLollipopTexture(),
          transparent: true,
          side: THREE.DoubleSide,
        });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.68), signMat);
        sign.position.set(-0.15, 1.32, 1.52);
        sign.rotation.y = Math.PI / 2;
        holder.add(pole, sign);
      }

      holder.position.set(r.stand[0], r.stand[1], r.stand[2]);
      holder.rotation.y = r.standYaw;
      this.group.add(holder);
      this.members.push({ ...r, holder, mesh, flashMat });
    }
  }

  setLivery(livery = {}) {
    if (livery.primary !== undefined && this.suitMat) this.suitMat.color.set(livery.primary);
    if (livery.accent !== undefined && this.stripeMat) this.stripeMat.color.set(livery.accent);
  }

  repositionForTrack(track) {
    // Center directly on the exact pit-lane stop coordinate (lateralOffset = 15.2m)!
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

  update(isServicing, progress01, elapsedSec) {
    this.active = isServicing;
    for (let i = 0; i < this.members.length; i++) {
      const m = this.members[i];
      const target = isServicing ? m.work : m.stand;
      const targetYaw = isServicing ? m.workYaw : m.standYaw;

      m.holder.position.x += (target[0] - m.holder.position.x) * 0.16;
      m.holder.position.z += (target[2] - m.holder.position.z) * 0.16;

      // Shortest-angle yaw interpolation
      let dy = targetYaw - m.holder.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      m.holder.rotation.y += dy * 0.18;

      if (isServicing && m.role.startsWith('GUN_')) {
        // Energetic kneeling crouch + pneumatic impact-wrench vibration & blue/gold sparks!
        m.holder.scale.y = 0.72 + 0.035 * Math.sin(elapsedSec * 46 + i);
        if (m.flashMat) {
          const burst = Math.sin(elapsedSec * 38 + i * 1.7) > 0.15;
          m.flashMat.opacity = burst ? 0.85 : 0.10;
          m.flashMat.color.setHex(i % 2 === 0 ? 0x66e6ff : 0xffd54f);
        }
      } else if (isServicing && (m.role === 'FRONT_JACK' || m.role === 'REAR_JACK')) {
        m.holder.scale.y = 0.88 + 0.02 * Math.sin(elapsedSec * 12);
      } else {
        m.holder.scale.y += (1.0 - m.holder.scale.y) * 0.16;
        if (m.flashMat) m.flashMat.opacity = 0.0;
      }
    }
  }
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

    // Shared pooled geometries (zero per-crash BufferGeometry leaks!)
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
      color: 0xe41c24,
      roughness: 0.22,
      metalness: 0.35,
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

    // 1. Incandescent Core Flash Sphere
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

    // 2. Expanding Ground Shockwave Ring
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

    // 3. Dynamic Blast PointLight illuminating track & rival clearcoat!
    const blastLight = new THREE.PointLight(0xff6d00, 7.5, 28, 1.6);
    blastLight.position.set(0, 1.8, 0);
    group.add(blastLight);

    // 4. Volumetric Fireball-to-Smoke Plume Spheres (24 puffs)
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

    // 5. Tumbling Carbon-Fiber & Incandescent Ember Shards (16 fragments)
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

    // Scatter 7 realistic broken carbon front-wing & livery endplate fragments
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

      // Core flash & ground shockwave ring expansion
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
          p.vy -= 4.5 * dt; // Rising hot-smoke buoyancy
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
          // Tumbling physical carbon shards bouncing off tarmac
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

    // Subtle amber hazard glint on carbon debris so drivers can spot shards ahead
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
