// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Blender GLB Asset Loader, Dynamic F1 Car Visual Rig, VFX & 3D Pit Crew
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TIRE_COMPOUNDS, PIT_LANE_CONFIG } from './config.js';

export class AssetLibrary {
  constructor() {
    this.loader = new GLTFLoader();
    this.templates = {
      chassis: null,
      wheel: null,
      pitCrew: null,
      mountFuji: null,
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

    const [chassis, wheel, pitCrew, mountFuji] = await Promise.all([
      loadSafe('./assets/models/f1_car.glb'),
      loadSafe('./assets/models/f1_wheel.glb'),
      loadSafe('./assets/models/pit_crew.glb'),
      loadSafe('./assets/models/mount_fuji.glb'),
    ]);

    this.templates.chassis = chassis;
    this.templates.wheel = wheel;
    this.templates.pitCrew = pitCrew;
    this.templates.mountFuji = mountFuji;
    return this.templates;
  }

  attachMountFuji(scene) {
    let fujiObj;
    if (this.templates.mountFuji) {
      fujiObj = this.templates.mountFuji.clone(true);
      fujiObj.scale.set(3.8, 3.8, 3.8);
    } else {
      fujiObj = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.ConeGeometry(1300, 480, 32),
        new THREE.MeshStandardMaterial({ color: 0x2c3b59, roughness: 0.9 })
      );
      base.position.y = 240;
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(460, 190, 32),
        new THREE.MeshStandardMaterial({ color: 0xf6f9ff, roughness: 0.45 })
      );
      cap.position.y = 395;
      fujiObj.add(base, cap);
    }
    // Positioned prominently beyond the Fuji Main Straight / Turn 1 northern skyline
    fujiObj.position.set(2450, -8, -540);
    fujiObj.name = 'MountFujiBackdrop';
    scene.add(fujiObj);
    return fujiObj;
  }
}

export class FormulaCarRig {
  constructor(assets, livery = {}) {
    const {
      primary = 0xe41c24,
      accent = 0xffffff,
      helmet = 0x00e5ff,
      compound = 'SOFT',
    } = livery;

    this.root = new THREE.Group();
    this.chassisTiltGroup = new THREE.Group();
    this.root.add(this.chassisTiltGroup);

    this.primaryMat = new THREE.MeshStandardMaterial({
      color: primary,
      metalness: 0.52,
      roughness: 0.25,
    });
    this.accentMat = new THREE.MeshStandardMaterial({
      color: accent,
      metalness: 0.32,
      roughness: 0.30,
    });
    this.helmetMat = new THREE.MeshStandardMaterial({
      color: helmet,
      metalness: 0.40,
      roughness: 0.20,
    });
    this.compoundMat = new THREE.MeshStandardMaterial({
      color: TIRE_COMPOUNDS[compound]?.colorHex || '#ff2a2a',
      emissive: TIRE_COMPOUNDS[compound]?.colorHex || '#ff2a2a',
      emissiveIntensity: 0.35,
      roughness: 0.4,
    });
    this.brakeDiscMat = new THREE.MeshStandardMaterial({
      color: 0x3a3532,
      metalness: 0.7,
      roughness: 0.35,
      emissive: new THREE.Color(0xff4800),
      emissiveIntensity: 0.0,
    });

    this.parts = {
      fwMain: null,
      fwEndL: null,
      fwEndR: null,
      rwMain: null,
      rwEndL: null,
      rwEndR: null,
    };

    this._buildChassis(assets.templates.chassis);
    this._buildWheels(assets.templates.wheel);
    this._buildVFXAttachments();

    this.wheelSpinAngle = 0;
    this.brakeGlow = 0;
    this.backfireTimer = 0;
    this._basisMat = new THREE.Matrix4();
    this._negTangent = new THREE.Vector3();
  }

  _buildChassis(template) {
    if (template) {
      const clone = template.clone(true);
      // Blender -Y (Nose) exports to glTF +Z; rotate 180 deg around Y so Nose points -Z (forward)
      // and Rear Wing + Rain Light + Exhaust face +Z (toward chase camera)!
      clone.rotation.y = Math.PI;
      clone.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = false;
        child.receiveShadow = false;
        const n = child.name;
        if (n === 'Body_Main' || n.startsWith('Front_Wing_Endplate') || n.startsWith('Rear_Wing_Endplate')) {
          child.material = this.primaryMat;
        } else if (n === 'Body_Accent' || n === 'Front_Wing_Main' || n === 'Rear_Wing_Main') {
          child.material = this.accentMat;
        } else if (n === 'Driver_Helmet') {
          child.material = this.helmetMat;
        }
        if (n === 'Front_Wing_Main') this.parts.fwMain = child;
        if (n === 'Front_Wing_Endplate_R') this.parts.fwEndL = child;
        if (n === 'Front_Wing_Endplate_L') this.parts.fwEndR = child;
        if (n === 'Rear_Wing_Main') this.parts.rwMain = child;
        if (n === 'Rear_Wing_Endplate_R') this.parts.rwEndL = child;
        if (n === 'Rear_Wing_Endplate_L') this.parts.rwEndR = child;
      });
      this.chassisTiltGroup.add(clone);
    } else {
      // Fallback sculpted Three.js mesh if GLB unavailable
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.42, 4.2), this.primaryMat);
      body.position.set(0, 0.32, 0);
      const fw = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.08, 0.36), this.accentMat);
      fw.position.set(0, 0.12, -2.2);
      const rw = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.32, 0.30), this.accentMat);
      rw.position.set(0, 0.72, 1.95);
      this.parts.fwMain = fw;
      this.parts.rwMain = rw;
      this.chassisTiltGroup.add(body, fw, rw);
    }

    // Contact drop shadow blob under car for crisp ground anchoring at 60fps
    const shadGeo = new THREE.PlaneGeometry(2.25, 4.95);
    shadGeo.rotateX(-Math.PI / 2);
    const shadMat = new THREE.MeshBasicMaterial({
      color: 0x05070a,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
    const shadowPlane = new THREE.Mesh(shadGeo, shadMat);
    shadowPlane.position.y = 0.03;
    this.root.add(shadowPlane);
  }

  _buildWheels(wheelTemplate) {
    this.wheels = [];
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

      if (wheelTemplate) {
        const wc = wheelTemplate.clone(true);
        wc.traverse((ch) => {
          if (!ch.isMesh) return;
          if (ch.name === 'Compound_Sidewall') ch.material = this.compoundMat;
          if (ch.name === 'Brake_Disc') ch.material = this.brakeDiscMat;
        });
        spinPivot.add(wc);
      } else {
        const cyl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.34, 0.35, 20),
          new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.75 })
        );
        cyl.rotation.z = Math.PI / 2;
        spinPivot.add(cyl);
      }

      this.root.add(steerPivot);
      this.wheels.push({ ...c, steerPivot, spinPivot });
    }
  }

  _buildVFXAttachments() {
    // Exhaust Backfire Flame Cone
    const flameGeo = new THREE.ConeGeometry(0.11, 0.75, 10);
    flameGeo.rotateX(Math.PI / 2);
    this.flameMat = new THREE.MeshBasicMaterial({
      color: 0xff9d00,
      transparent: true,
      opacity: 0.9,
    });
    this.flameMesh = new THREE.Mesh(flameGeo, this.flameMat);
    this.flameMesh.position.set(0, 0.34, 2.38);
    this.flameMesh.visible = false;
    this.chassisTiltGroup.add(this.flameMesh);

    // Rooster-Tail Wet Spray Plumes (Left & Right Rear)
    this.sprayGroup = new THREE.Group();
    this.sprayPuffs = [];
    const puffGeo = new THREE.SphereGeometry(0.42, 8, 8);
    this.sprayMat = new THREE.MeshBasicMaterial({
      color: 0xdceeff,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? -0.78 : 0.78;
      const puff = new THREE.Mesh(puffGeo, this.sprayMat);
      puff.position.set(side, 0.35, 1.9 + i * 0.55);
      this.sprayGroup.add(puff);
      this.sprayPuffs.push({ mesh: puff, baseX: side, idx: i });
    }
    this.sprayGroup.visible = false;
    this.root.add(this.sprayGroup);

    // Damage / Puncture Spark Burst
    this.sparkGroup = new THREE.Group();
    const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.45);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffb300 });
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(sparkGeo, sparkMat);
      sp.position.set((Math.random() - 0.5) * 1.3, 0.08 + Math.random() * 0.16, 1.6 + Math.random() * 1.2);
      this.sparkGroup.add(sp);
    }
    this.sparkGroup.visible = false;
    this.root.add(this.sparkGroup);
  }

  setCompound(compoundId) {
    const comp = TIRE_COMPOUNDS[compoundId] || TIRE_COMPOUNDS.SOFT;
    this.compoundMat.color.setStyle(comp.colorHex);
    this.compoundMat.emissive.setStyle(comp.colorHex);
  }

  triggerBackfire(duration = 0.14) {
    this.backfireTimer = duration;
  }

  updateTransformAndVFX(carState, trackFrame, moistureW, dt, elapsedSec) {
    // Orient car 3D matrix onto track surface normal + car relative yaw
    const yaw = carState.relYaw || 0;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    // Rotate tangent & right in the track surface tangent plane by relYaw
    const fwd = trackFrame.tangent
      .clone()
      .multiplyScalar(cosY)
      .addScaledVector(trackFrame.right, sinY)
      .normalize();
    const rgt = new THREE.Vector3().crossVectors(fwd, trackFrame.normal).normalize();

    this._negTangent.copy(fwd).negate();
    this._basisMat.makeBasis(rgt, trackFrame.normal, this._negTangent);
    this.root.position.copy(trackFrame.pos);
    this.root.quaternion.setFromRotationMatrix(this._basisMat);

    // Dynamic chassis pitch (dive under braking, squat under acceleration) & corner roll
    const targetPitch = (carState.brakeInput * 0.026) - (carState.throttleInput * 0.014) + (carState.pitJackLift || 0) * 0.04;
    const targetRoll = -(carState.latG || 0) * 0.022;
    this.chassisTiltGroup.rotation.x += (targetPitch - this.chassisTiltGroup.rotation.x) * Math.min(1, dt * 14);
    this.chassisTiltGroup.rotation.z += (targetRoll - this.chassisTiltGroup.rotation.z) * Math.min(1, dt * 14);
    this.chassisTiltGroup.position.y = (carState.pitJackLift || 0) * 0.18;

    // Spin & steer wheels
    const speedMps = (carState.speedKmh || 0) / 3.6;
    this.wheelSpinAngle -= (speedMps / 0.34) * dt;
    const visualSteer = -(carState.steerAngleRad || 0) * 0.85;
    for (const w of this.wheels) {
      if (w.isFront) w.steerPivot.rotation.y = visualSteer;
      w.spinPivot.rotation.x = this.wheelSpinAngle;
    }

    // Glowing orange carbon brake discs under heavy high-speed braking
    const heatGain = carState.brakeInput > 0.25 && carState.speedKmh > 95
      ? carState.brakeInput * (carState.speedKmh / 280) * 7.5
      : 0;
    if (heatGain > 0) {
      this.brakeGlow = Math.min(4.5, this.brakeGlow + heatGain * dt);
    } else {
      this.brakeGlow = Math.max(0, this.brakeGlow - 3.2 * dt);
    }
    this.brakeDiscMat.emissiveIntensity = this.brakeGlow;

    // Exhaust backfire pop
    if (this.backfireTimer > 0) {
      this.backfireTimer -= dt;
      this.flameMesh.visible = true;
      const flick = 0.75 + Math.random() * 0.65;
      this.flameMesh.scale.set(flick, flick, 0.8 + Math.random() * 0.8);
    } else {
      this.flameMesh.visible = false;
    }

    // Rooster-tail rain spray plumes when W > 0.15 and speed > 65 km/h
    const showSpray = moistureW > 0.15 && carState.speedKmh > 65 && !carState.exploded;
    this.sprayGroup.visible = showSpray;
    if (showSpray) {
      const intensity = Math.min(1, ((carState.speedKmh - 65) / 200) * (0.4 + moistureW * 0.9));
      this.sprayMat.opacity = 0.14 + intensity * 0.34;
      for (const p of this.sprayPuffs) {
        const phase = (elapsedSec * 9.0 + p.idx * 0.37) % 1.0;
        p.mesh.position.z = 1.7 + phase * (4.5 + intensity * 5.5);
        p.mesh.position.y = 0.28 + phase * (1.2 + intensity * 1.9);
        p.mesh.position.x = p.baseX * (1 + phase * 0.85);
        const sc = 0.45 + phase * (1.4 + intensity * 1.6);
        p.mesh.scale.setScalar(sc);
      }
    }

    // Visual Wing Damage & Rim Sparks
    const dmg = carState.damage;
    if (dmg) {
      if (this.parts.fwEndL) {
        this.parts.fwEndL.visible = dmg.frontWing < 0.65;
        this.parts.fwEndL.rotation.z = dmg.frontWing > 0.25 ? 0.28 : 0;
      }
      if (this.parts.fwEndR) {
        this.parts.fwEndR.visible = dmg.frontWing < 0.82;
        this.parts.fwEndR.rotation.z = dmg.frontWing > 0.40 ? -0.32 : 0;
      }
      if (this.parts.rwMain) {
        this.parts.rwMain.rotation.z = dmg.rearWing > 0.30 ? 0.14 * Math.sin(elapsedSec * 24) + 0.12 : 0;
      }
      const sparking = (dmg.hasPuncture || dmg.frontWing > 0.55 || dmg.rearWing > 0.6) && carState.speedKmh > 45;
      this.sparkGroup.visible = sparking;
      if (sparking) {
        for (const ch of this.sparkGroup.children) {
          ch.position.z = 1.3 + Math.random() * 1.8;
          ch.position.x = (Math.random() - 0.5) * 1.5;
        }
      }
    } else {
      this.sparkGroup.visible = false;
    }
  }
}

// ============================================================================
// 3D ANIMATED PIT CREW (8 CREW MEMBERS SURROUNDING PLAYER PIT BOX)
// ============================================================================
export class PitCrewDiorama {
  constructor(scene, assets, track) {
    this.group = new THREE.Group();
    this.members = [];
    this.active = false;

    const boxFrame = track.sampleAt(PIT_LANE_CONFIG.playerBoxS, PIT_LANE_CONFIG.lateralOffset + 3.2);
    this.boxPos = boxFrame.pos.clone();
    this.group.position.copy(this.boxPos);
    scene.add(this.group);

    // 8 specialized roles: Front Jack, Rear Jack, 4 Tire Gunners, Refueler, Lollipop Man
    const roles = [
      { role: 'FRONT_JACK', stand: [ 3.6, 0,  1.6], work: [ 2.55, 0,  0.0], yaw: -Math.PI / 2 },
      { role: 'REAR_JACK',  stand: [-3.6, 0,  1.6], work: [-2.55, 0,  0.0], yaw:  Math.PI / 2 },
      { role: 'GUN_FL',     stand: [ 1.5, 0, -2.4], work: [ 1.48, 0, -1.25], yaw: 0 },
      { role: 'GUN_FR',     stand: [ 1.5, 0,  2.6], work: [ 1.48, 0,  1.25], yaw: Math.PI },
      { role: 'GUN_RL',     stand: [-1.4, 0, -2.4], work: [-1.42, 0, -1.25], yaw: 0 },
      { role: 'GUN_RR',     stand: [-1.4, 0,  2.6], work: [-1.42, 0,  1.25], yaw: Math.PI },
      { role: 'REFUELER',   stand: [-0.2, 0,  2.9], work: [-0.20, 0,  1.35], yaw: Math.PI },
      { role: 'LOLLIPOP',   stand: [ 3.2, 0,  2.5], work: [ 2.95, 0,  1.15], yaw: Math.PI },
    ];

    for (const r of roles) {
      let mesh;
      if (assets.templates.pitCrew) {
        mesh = assets.templates.pitCrew.clone(true);
      } else {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 1.7, 0.35),
          new THREE.MeshStandardMaterial({ color: 0xe41c24 })
        );
        mesh.position.y = 0.85;
      }
      const holder = new THREE.Group();
      holder.add(mesh);
      holder.position.set(r.stand[0], r.stand[1], r.stand[2]);
      holder.rotation.y = r.yaw;
      this.group.add(holder);
      this.members.push({ ...r, holder });
    }
  }

  update(isServicing, progress01, elapsedSec) {
    for (const m of this.members) {
      const target = isServicing ? m.work : m.stand;
      m.holder.position.x += (target[0] - m.holder.position.x) * 0.14;
      m.holder.position.z += (target[2] - m.holder.position.z) * 0.14;

      if (isServicing && m.role.startsWith('GUN_')) {
        // Kneel & vibrate pneumatic wheel gun
        m.holder.scale.y = 0.78 + 0.03 * Math.sin(elapsedSec * 42);
      } else {
        m.holder.scale.y += (1.0 - m.holder.scale.y) * 0.15;
      }
    }
  }
}

// ============================================================================
// 1982 FIERY EXPLOSION & CARBON FIBER TRACK DEBRIS POOL
// ============================================================================
export class EffectsManager {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.explosions = [];
    this.debrisItems = [];
  }

  spawnExplosion(worldPos) {
    const group = new THREE.Group();
    group.position.copy(worldPos);
    const colors = [0xff2a00, 0xff7b00, 0xffd000, 0xffffff, 0x222222];
    const particles = [];

    for (let i = 0; i < 28; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length],
        transparent: true,
        opacity: 1.0,
      });
      const box = new THREE.Mesh(new THREE.SphereGeometry(0.45 + Math.random() * 0.55, 8, 8), mat);
      const ang = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 16;
      const vy = 5 + Math.random() * 14;
      group.add(box);
      particles.push({
        mesh: box,
        mat,
        vx: Math.cos(ang) * spd,
        vy,
        vz: Math.sin(ang) * spd,
      });
    }

    this.scene.add(group);
    this.explosions.push({ group, particles, age: 0, maxAge: 1.75 });
  }

  spawnCarbonDebris(s, lateralOffset, sectorId) {
    const fr = this.track.sampleAt(s, lateralOffset);
    const group = new THREE.Group();
    group.position.copy(fr.pos);

    const carbonMat = new THREE.MeshStandardMaterial({ color: 0x15181e, roughness: 0.4, metalness: 0.3 });
    const warnMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

    for (let i = 0; i < 5; i++) {
      const shard = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.08, 0.38),
        i === 0 ? warnMat : carbonMat
      );
      shard.position.set((Math.random() - 0.5) * 2.2, 0.08, (Math.random() - 0.5) * 2.2);
      shard.rotation.set(0.15, Math.random() * Math.PI, 0.2);
      group.add(shard);
    }

    this.scene.add(group);
    const item = {
      s,
      lateralOffset,
      radius: 1.85,
      sectorId,
      group,
      ttl: 52.0, // Marshals clear debris after ~52s (or 1-2 laps)
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
      const u = ex.age / ex.maxAge;
      for (const p of ex.particles) {
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vy -= 18.0 * dt;
        if (p.mesh.position.y < 0.2) p.mesh.position.y = 0.2;
        p.mesh.scale.setScalar(1.0 + u * 1.8);
        p.mat.opacity = Math.max(0, 1.0 - u);
      }
      if (ex.age >= ex.maxAge) {
        this.scene.remove(ex.group);
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
