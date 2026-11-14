# Research 03 — Motorsport Simulation Visual Realism, Broadcast Camera & CC0 Asset Pack Blueprint

**Author**: `@res-sim-realism` (Researcher 3 — Motorsport Simulation Visual Realism, Broadcast Camera & Open-Source Asset Pack Researcher)  
**Scope**: Complete arcade-to-sim visual audit across [src/main.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/main.js), [src/models.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/models.js), [src/weather.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/weather.js), [src/track.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js), [src/replay.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/replay.js), [index.html](file:///c:/Users/mshaf/Downloads/AntiGravity/index.html), [styles.css](file:///c:/Users/mshaf/Downloads/AntiGravity/styles.css), and Blender generators ([blender_generate_vehicles_and_pit.py](file:///c:/Users/mshaf/Downloads/AntiGravity/tools/blender_generate_vehicles_and_pit.py), [blender_generate_track_and_environment.py](file:///c:/Users/mshaf/Downloads/AntiGravity/tools/blender_generate_track_and_environment.py)), plus **29 real CC0 Poly Haven HDRI & 1K PBR texture assets** downloaded and binary-verified on disk in `assets/hdri/` and `assets/textures/`.

---

## 1. Executive Diagnosis: Why the Current Render Feels "Arcade" Instead of Sim

1. **Fullscreen `UnrealBloomPass` + Fake Daylight Self-Illumination (`emissiveIntensity`)**:
   - [src/main.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/main.js#L352-L377) runs every frame through an `EffectComposer` + `UnrealBloomPass(0.28, 0.35, 1.08)`. Worse, dozens of non-light-emitting materials across [src/track.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js) and [src/models.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/models.js) (concrete kerbs, rubber tire stripes, foam brake boards, printed PVC billboards, cloth flags, crowd shirts, tree leaves, and Mount Fuji rock/snow) carry `emissiveIntensity: 0.08–0.52` in broad daylight. Combined with bloom, this flattens shadow contrast and washes surfaces in a soft neon haze.
2. **Sci-Fi Exhaust & Aero Gimmicks on Modern V6 Hybrid F1 Cars**:
   - [src/models.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/models.js#L1519-L1640) attaches **five separate fake VFX rigs** to every car: a continuous orange `afterburnerMesh` sprite, a continuously spinning `0.78m` translucent orange `heatHazeMesh` cone (`ConeGeometry`), a `0.96m` outer orange + `0.52m` cyan plasma `exhaustFlameGroup` firing on every gearshift, **two `4.6m`-long spinning cyan rear-wing `vortexGroup` cones**, and floating `0.42m` additive `haloPlane` discs outside the wheels. Modern 1.6L V6 turbo-hybrid F1 cars produce **zero** external exhaust flames and **zero** glowing cyan wingtip tubes.
3. **Synthetic Softbox Cube Reflections & Flat Procedural Canvas Surfaces**:
   - [src/weather.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/weather.js#L353-L470) bakes `scene.environment` from floating procedural `BoxGeometry` strips instead of real outdoor sky photography, while tarmac, grass, concrete, and runoff rely on tiny `256x256`–`512x512` 2D canvas noise without real scanned aggregate normal/roughness/AO maps.
4. **Trackside Carnival Clutter**:
   - [src/track.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L3363-L3471) spawns **240 nonstop falling neon confetti rectangles**, **continuous multi-colored smoke flares** on every grandstand, **toy-like neon hot-air balloons**, and **additive volumetric floodlight cones in broad daylight**.
5. **Arcade Hyperdrive Camera FOV Warp & Basic Replay Framing**:
   - [src/main.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/main.js#L3045-L3071) stretches camera FOV by up to `+15.5°` (`95°` fish-eye!) at top speed and adds a neon-cyan `#speed-vignette` tunnel border ([styles.css](file:///c:/Users/mshaf/Downloads/AntiGravity/styles.css#L66-L79)), destroying sim braking-point depth perception. Meanwhile, [src/replay.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/replay.js#L998-L1047) uses 11 uniformly spaced medium-FOV cameras without FOM long-lens telephoto compression, apex kerb box-cams, suspension pitch/roll playback, or broadcast timing tower graphics.

---

## 2. Complete Line-by-Line Arcade Removal & De-Neon Manifest

Every item below must be removed or recalibrated in `2026_PBR` Simulation mode (while keeping `1982_ARCADE` retro pixel/scanline mode intact when explicitly toggled):

| Subsystem | File & Exact Lines | Current Unrealistic / Arcade Element | Exact Simulation Fix |
| :--- | :--- | :--- | :--- |
| **Post-Processing Bloom** | [src/main.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/main.js#L10), [#L312-L318](file:///c:/Users/mshaf/Downloads/AntiGravity/src/main.js#L312-L318), [#L352-L377](file:///c:/Users/mshaf/Downloads/AntiGravity/src/main.js#L352-L377), [#L1534](file:///c:/Users/mshaf/Downloads/AntiGravity/src/main.js#L1534), [#L2540-L2544](file:///c:/Users/mshaf/Downloads/AntiGravity/src/main.js#L2540-L2544) & [index.html](file:///c:/Users/mshaf/Downloads/AntiGravity/index.html#L372) | `EffectComposer` + `UnrealBloomPass(0.28, 0.35, 1.08)` + UI label `2026 AAA HDR + BLOOM` | Remove `EffectComposer`/`UnrealBloomPass`. Render directly via `this.renderer.render(this.scene, this.camera)` with hardware WebGL2 MSAA (`antialias: true`), `ACESFilmicToneMapping` (`toneMappingExposure = 0.96`), and rename UI label to `2026 PRO SIM PBR`. Saves 3 fullscreen render passes/frame! |
| **Neon Speed Vignette** | [index.html](file:///c:/Users/mshaf/Downloads/AntiGravity/index.html#L33), [styles.css](file:///c:/Users/mshaf/Downloads/AntiGravity/styles.css#L66-L79), [src/main.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/main.js#L193), [#L2416-L2423](file:///c:/Users/mshaf/Downloads/AntiGravity/src/main.js#L2416-L2423) | `#speed-vignette` darkens peripheral vision up to `0.88` with a cyan ring (`rgba(0,215,255,0.14)`) above `225 km/h` | Force `speedVignette.style.opacity = '0'` and `display: none` in Sim mode so braking markers and mirrors remain 100% crisp at 330 km/h. |
| **Continuous Flame & Heat Cone** | [src/models.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/models.js#L1572-L1599), [#L1911-L1923](file:///c:/Users/mshaf/Downloads/AntiGravity/src/models.js#L1911-L1923) | `this.afterburnerMesh` (always-on orange sprite) + `this.heatHazeMesh` (`0.78m` spinning orange `ConeGeometry` behind tailpipe) | Delete `this.afterburnerMesh` and `this.heatHazeMesh` completely. Replace with subtle internal titanium tailpipe inner-wall thermal glow (`exhaustMat.emissive = 0x8c2204`, `emissiveIntensity = 0.0..0.14` scaled by sustained full-load RPM). |
| **Shift Backfire Flame Cones** | [src/models.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/models.js#L1519-L1570), [#L1974-L1989](file:///c:/Users/mshaf/Downloads/AntiGravity/src/models.js#L1974-L1989); [src/main.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/main.js#L230), [#L437](file:///c:/Users/mshaf/Downloads/AntiGravity/src/main.js#L437), [#L2561](file:///c:/Users/mshaf/Downloads/AntiGravity/src/main.js#L2561); [src/replay.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/replay.js#L770-L777) | `this.exhaustFlameGroup`: `0.96m` outer orange cone + `0.52m` cyan plasma cone + twin wastegate cones + `0.46m` flash plane on every shift | Remove `this.exhaustFlameGroup` meshes completely and make `triggerBackfire()` a clean no-op on 2026 F1 V6 turbo-hybrid cars (audio gearshift cut/blip remains). |
| **Fake Wingtip Aero Cones** | [src/models.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/models.js#L1601-L1640), [#L1991-L2016](file:///c:/Users/mshaf/Downloads/AntiGravity/src/models.js#L1991-L2016) | `this.vortexGroup`: twin **4.6-meter** spinning cyan `ConeGeometry` tubes (`0x9cefff`) behind rear wing above `250 km/h` | Delete `this.vortexGroup` completely. (In wet/humid weather only, `waterSpray` fine mist droplets handle wake naturally without solid cones.) |
| **Floating Brake Glow Discs** | [src/models.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/models.js#L1482-L1497), [#L1943-L1972](file:///c:/Users/mshaf/Downloads/AntiGravity/src/models.js#L1943-L1972) | `haloPlane` / `brakeHaloMats`: `0.42m` additive orange billboard planes floating outside the wheel hubs + `emissiveIntensity: 5.6` | Remove `haloPlane` / `brakeHaloMats`. Apply thermal incandescence **strictly** to the physical slotted `BrakeDisc_<C>` carbon-ceramic rotor mesh inside the wheel spokes, using a thermal integrator (`brakeTemp` rises with `brake * speedKmh` and cools exponentially) peaking at `emissive: 0xff4800`, `emissiveIntensity: 1.85`. |
| **Constant Straight-Line Box Sparks** | [src/models.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/models.js#L2112-L2205) | `highSpeedSpark = speedKmh > 285` continuously spawns 14 chunky `0.025 x 0.025 x 0.52m` yellow boxes down every straight | Remove unconditional `speedKmh > 285` continuous stream. Trigger razor-thin titanium skid-block micro-sparks (`0.008 x 0.008 x 0.24m`, warm white-gold `0xffe4a8`) **only** on bottoming compression peaks (`chassisHeaveM < -0.010 && speedKmh > 245`), sawtooth kerb strikes (`onCurb && speedKmh > 135`), or barrier graze. |
| **Glowing Tire Sidewall Paint** | [src/models.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/models.js#L874-L875), [#L1859-L1860](file:///c:/Users/mshaf/Downloads/AntiGravity/src/models.js#L1859-L1860) | Pirelli compound stripe has `emissive: compHex, emissiveIntensity: 0.42` (glows in tunnels/shadows) | Set `emissive: 0x000000, emissiveIntensity: 0.0`, `roughness: 0.48` satin rubber ink. |
| **24/7 Falling Neon Confetti** | [src/track.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L3397-L3429), [#L3456-L3471](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L3456-L3471) | `confettiInst`: 240 neon pink/cyan/gold/green rectangles raining continuously over the main straight | Delete `confettiInst` and its per-frame matrix loop completely. |
| **Constant Stadium Smoke Flares** | [src/track.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L3228-L3245), [#L3363-L3395](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L3363-L3395), [#L3435-L3454](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L3435-L3454) | `allFlareSources` + glowing `MeshBasicMaterial` flare orbs + 128 colored smoke puffs billowing nonstop | Delete grandstand flare orbs and continuous colored smoke plumes completely. |
| **Daytime Volumetric Light Cones** | [src/track.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L2163-L2175), [#L2184-L2243](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L2184-L2243) | `floodConeMat`, `floodPoolMat`, `bridgeConeMat`: additive light cones & ground pools visible on sunny circuits | Gate strictly on `const isNight = (this.trackDef.theme === 'VEGAS');` — zero light cones or fake ground pools in daytime circuits; reduce night cone opacity from `0.11` to `0.032`. |
| **Toy Hot-Air Balloons** | [src/track.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L2348-L2375) | 5 primary-colored spheres (`0xff2a4b`, `0x00d2ff`, `0xbc13fe`) bobbing around circuit | Remove toy balloons; replace with 1 realistic distant dark-graphite TV broadcast helicopter (`Cineflex` nose camera gimbal + spinning rotor blur disc) patrolling at `y = 82m`. |
| **Glowing Daylight Kerbs, Signs, Crowds, Flags & Mountains** | [src/track.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L887-L888), [#L2398-L2425](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L2398-L2425), [#L2540-L2542](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L2540-L2542), [#L2953-L2955](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L2953-L2955), [#L3015-L3017](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L3015-L3017), [#L3055-L3071](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L3055-L3071), [#L3571-L3589](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L3571-L3589), [#L4557-L4559](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L4557-L4559), [#L4756-L4758](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L4756-L4758), [#L4824-L4825](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L4824-L4825), [#L4876-L4877](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L4876-L4877), [#L5063-L5064](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L5063-L5064), [#L5249-L5250](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L5249-L5250), [#L5329-L5330](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L5329-L5330), [#L5480-L5481](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L5480-L5481), [#L5531-L5532](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L5531-L5532), [#L5597-L5598](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L5597-L5598) | Painted concrete kerbs, brake boards, sponsor banners, crowd shirts, flags, foliage, marshal suits, and Mt. Fuji rock/snow all set `emissiveIntensity: 0.08–0.52` | Set `emissiveIntensity = 0.0` (remove `emissive`/`emissiveMap`) on **all** painted/cloth/natural materials in daylight, and re-enable `fog: true` on Mt. Fuji so atmospheric aerial perspective grounds it in the horizon. Keep self-emission **only** on real LEDs/lamps and Vegas night signage! |

---

## 3. Downloaded & Binary-Verified CC0 Asset Pack Inventory (`assets/hdri/` & `assets/textures/`)

All 29 files below were downloaded directly from the **Poly Haven Official CC0 Public Domain API** (`https://polyhaven.com/license` — **CC0 1.0 Universal Public Domain Dedication**, zero restrictions) and verified on disk for exact RLE scanline integrity (`#?RADIANCE` `1024x512` EOF match) and `1024x1024` JPEG SOI/image decode validity.

### 3.1 Real Equirectangular 32-Bit Radiance HDRIs (`assets/hdri/`)

| File Path | Bytes | Resolution | Avg Lum | Raw Peak RGB | Target Weather / Circuit Mapping |
| :--- | ---: | :---: | ---: | ---: | :--- |
| `assets/hdri/syferfontein_18d_clear_puresky_1k.hdr` | `1,107,348` | `1024×512` | `0.8918` | `157,286.4` | `HOT_SUNNY` (Fuji, Monaco, Monza clear race sky) |
| `assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr` | `1,435,119` | `1024×512` | `0.6767` | `61,423.9` | `OVERCAST_COOL` / Dynamic GP afternoon clouds (Silverstone, Suzuka) |
| `assets/hdri/evening_road_01_puresky_1k.hdr` | `1,309,268` | `1024×512` | `0.7767` | `25.1` | `GOLDEN_SUNSET` (Warm low-sun twilight reflections & sky) |
| `assets/hdri/kloofendal_overcast_puresky_1k.hdr` | `1,174,053` | `1024×512` | `0.8605` | `6.6` | `LIGHT_DRIZZLE` & `MONSOON_STORM` (Soft diffuse wet-track sky) |
| `assets/hdri/qwantani_night_puresky_1k.hdr` | `1,389,258` | `1024×512` | `0.5786` | `155.6` | `VEGAS_NEON` Night GP sky dome & base night IBL |

> [!IMPORTANT]
> **Critical Mobile WebGL2 `FP16` (`HalfFloatType`) Overflow Guard**:
> Notice our binary Radiance audit above: `syferfontein_18d_clear_puresky_1k.hdr` has a raw solar disc pixel of **`157,286.4`** and `kloofendal_48d_partly_cloudy_puresky_1k.hdr` peaks at **`61,423.9`**. Because mobile GPUs (iOS Safari / Android Adreno & Mali) compile Three.js `PMREMGenerator` into `THREE.HalfFloatType` (`FP16` max finite value = `65,504.0`), feeding unclamped `> 65,504` pixels overflows `PMREM` mipmaps to `Infinity`/`NaN` (causing black/magenta square artifacts on glossy clearcoat car bodywork!). Our zero-dependency `.hdr` loader in **Section 4.1** applies a **hue-preserving solar radiance shoulder (`maxRadiance = 24.0`)** during RGBE decode so `PMREMGenerator` produces silky, artifact-free clearcoat reflections on 100% of phones and desktops while `this.sunLight` (`DirectionalLight`) provides crisp direct solar specular & shadows.

### 3.2 Real Scanned 1K Motorsport PBR Texture Sets (`assets/textures/`)

Every material family includes **4 matched `1024×1024` seamless maps**:
- `*_diff_1k.jpg` — Albedo / BaseColor (`THREE.SRGBColorSpace`)
- `*_nor_gl_1k.jpg` — OpenGL Tangent-Space Normal Map (`THREE.NoColorSpace`, `Y+` native to Three.js & glTF2)
- `*_arm_1k.jpg` — Channel-Packed **A**mbient Occlusion (`R`), **R**oughness (`G`), **M**etalness (`B`) (`THREE.NoColorSpace` — binds simultaneously to `aoMap`, `roughnessMap`, and `metalnessMap` in 1 single VRAM texture!)
- `*_rough_1k.jpg` — Standalone Grayscale Roughness (`THREE.NoColorSpace`)

| Surface Family | Files in `assets/textures/` | Total Size | Engine Target |
| :--- | :--- | ---: | :--- |
| **`asphalt_02`** (Main Circuit Tarmac) | `asphalt_02_{diff,nor_gl,arm,rough}_1k.jpg` | `2.81 MB` | Main circuit racing surface (`FujiTrack._buildRoadAndCurbs` + rubbered racing-line groove shader) |
| **`asphalt_pit_lane`** (Pit Lane & Paved Aprons) | `asphalt_pit_lane_{diff,nor_gl,arm,rough}_1k.jpg` | `3.18 MB` | Pit lane ribbon, grid boxes, tarmac runoff aprons & paddock ground |
| **`leafy_grass`** (Trackside Turf & Verges) | `leafy_grass_{diff,nor_gl,arm,rough}_1k.jpg` | `4.18 MB` | Trackside grass verges & outer terrain (`dual-scale` macro+micro UV anti-tiling) |
| **`gravel`** (FIA Aggregate Gravel Traps) | `gravel_{diff,nor_gl,arm,rough}_1k.jpg` | `3.86 MB` | Recessed FIA gravel trap beds outside high-speed corners & braking zones |
| **`brushed_concrete`** (Kerbs & Concrete Walls) | `brushed_concrete_{diff,nor_gl,arm,rough}_1k.jpg` | `3.18 MB` | FIA 3D sawtooth kerbs, pit wall, Jersey barriers, grandstand risers & Monza Sopraelevata banking |
| **`bark_brown_02`** (Botanical Tree Trunks) | `bark_brown_02_{diff,nor_gl,arm,rough}_1k.jpg` | `2.25 MB` | Deciduous, pine, cypress & palm tree trunks (`_getTreeGeometriesAndMaterials`) |

---

## 4. Pure Physical PBR Lighting & Zero-Dependency `.hdr` IBL Architecture

### 4.1 Zero-Dependency Radiance `.hdr` (RGBE) Decoder (`src/weather.js`)
`vendor/addons/loaders/` contains **only** `GLTFLoader.js` (`RGBELoader.js` is not bundled). Rather than adding fragile external CDN imports, drop this exact **self-contained, RLE-verified ~60-line Radiance `#?RADIANCE` decoder** directly into [src/weather.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/weather.js):

```javascript
export async function loadPolyHavenHDR(url, maxRadiance = 24.0) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HDR fetch failed (${resp.status}): ${url}`);
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
  if (!m) throw new Error(`Unsupported HDR resolution header: ${resLine}`);
  const height = parseInt(m[1], 10);
  const width = parseInt(m[2], 10);

  const rgba = new Float32Array(width * height * 4);
  const scanline = new Uint8Array(width * 4);

  for (let y = 0; y < height; y++) {
    const b0 = bytes[pos++], b1 = bytes[pos++], b2 = bytes[pos++], b3 = bytes[pos++];
    if (b0 !== 2 || b1 !== 2 || ((b2 << 8) | b3) !== width) {
      throw new Error(`Invalid RLE scanline at row ${y}`);
    }
    for (let ch = 0; ch < 4; ch++) {
      let x = 0;
      while (x < width) {
        const code = bytes[pos++];
        if (code > 128) {
          const run = code - 128;
          const val = bytes[pos++];
          for (let k = 0; k < run; k++) scanline[ch * width + x++] = val;
        } else {
          for (let k = 0; k < code; k++) scanline[ch * width + x++] = bytes[pos++];
        }
      }
    }
    const dstRow = (height - 1 - y) * width * 4; // Flip Y to Three.js UV convention
    for (let x = 0; x < width; x++) {
      const e = scanline[3 * width + x];
      const out = dstRow + x * 4;
      if (e === 0) {
        rgba[out] = 0; rgba[out + 1] = 0; rgba[out + 2] = 0; rgba[out + 3] = 1;
      } else {
        const scale = Math.pow(2.0, e - 128.0) / 255.0;
        let r = scanline[x] * scale;
        let g = scanline[width + x] * scale;
        let b = scanline[2 * width + x] * scale;
        // Hue-preserving FP16-safe radiance ceiling for mobile PMREMGenerator
        const peak = Math.max(r, g, b);
        if (peak > maxRadiance) {
          const k = maxRadiance / peak;
          r *= k; g *= k; b *= k;
        }
        rgba[out] = r; rgba[out + 1] = g; rgba[out + 2] = b; rgba[out + 3] = 1.0;
      }
    }
  }

  const tex = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
```

### 4.2 Wiring Real HDRIs into `WeatherSystem` (`src/weather.js`) & Renderer (`src/main.js`)
1. **Direct Physical Rendering (`src/main.js`)**:
   - Configure `WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })` with:
     - `renderer.outputColorSpace = THREE.SRGBColorSpace;`
     - `renderer.toneMapping = THREE.ACESFilmicToneMapping;`
     - `renderer.toneMappingExposure = 0.96;` (eliminates blown-out white concrete/kerbs without bloom).
   - Delete `EffectComposer`, `RenderPass`, `UnrealBloomPass`, and `OutputPass`. Call `this.renderer.render(this.scene, this.camera)` directly in `animate()`.
2. **Real Sky + Real IBL Reflections (`src/weather.js`)**:
   - Map each weather/biome preset to its downloaded `.hdr`:
     - `VEGAS` theme -> `./assets/hdri/qwantani_night_puresky_1k.hdr` (`environmentIntensity = 0.72`)
     - `HOT_SUNNY` -> `./assets/hdri/syferfontein_18d_clear_puresky_1k.hdr` (`environmentIntensity = 1.0`)
     - `OVERCAST_COOL` (or `SILVERSTONE` / `SUZUKA` default) -> `./assets/hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr` (`environmentIntensity = 0.95`)
     - `GOLDEN_SUNSET` -> `./assets/hdri/evening_road_01_puresky_1k.hdr` (`environmentIntensity = 0.92`)
     - `LIGHT_DRIZZLE` / `MONSOON_STORM` -> `./assets/hdri/kloofendal_overcast_puresky_1k.hdr` (`environmentIntensity = 0.85`)
   - Cache each compiled `pmremGenerator.fromEquirectangular(hdrTex).texture` by URL so switching tracks/weather reuses GPU cubemaps in `0 ms`, and bind `hdrTex` directly to the sky dome (`MeshBasicMaterial({ map: hdrTex, side: THREE.BackSide, fog: false })`) or `scene.background = hdrTex` so real volumetric horizon clouds appear in the sky **and** match the car's clearcoat reflections 1:1!
   - Keep procedural `_bakeDynamicHDREnvironment` solely as an instant synchronous fallback during the ~80ms async fetch of the `.hdr` file.

---

## 5. Across-the-Board 3D Model & Track Realism Enhancements

### 5.1 Shared PBR Texture Loader (`FujiTrack._loadPbrMaterialSet` in `src/track.js`)
Load each `assets/textures/<name>_{diff,nor_gl,arm}_1k.jpg` set once into a static cache `FujiTrack._pbrTexCache`:
- `diff`: `tex.colorSpace = THREE.SRGBColorSpace`, `wrapS = wrapT = THREE.RepeatWrapping`, `anisotropy = maxAniso`.
- `nor_gl`: `tex.colorSpace = THREE.NoColorSpace`, `wrapS = wrapT = THREE.RepeatWrapping`, `anisotropy = maxAniso`.
- `arm`: `tex.colorSpace = THREE.NoColorSpace`, `wrapS = wrapT = THREE.RepeatWrapping`, `anisotropy = maxAniso`.
- Note on `aoMap`: Three.js r160+ reads `aoMap` from UV channel 0 by default (`aoMapIntensity = 0.85`), `roughnessMap` from `.g`, and `metalnessMap` from `.b`!

### 5.2 Track Ribbon, Rubbered Racing Groove, 3D Kerbs & Gravel Traps (`src/track.js`)
1. **Main Circuit Asphalt (`asphalt_02` + Rubbered Racing-Line Shader)**:
   - Replace the 256px procedural canvas road map ([src/track.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L502-L560)) with `asphalt_02_{diff,nor_gl,arm}_1k.jpg` (`normalScale: new THREE.Vector2(1.15, 1.15)`, `roughness: 0.92`, `metalness: 0.0`).
   - Subdivide the road cross-section laterally (`6` slices across `[-ROAD_HALF_WIDTH, +ROAD_HALF_WIDTH]` instead of 1 flat quad) with subtle `3.5cm` drainage crown (`y += (1 - uNorm*uNorm) * 0.035`) and bake a per-vertex `aGroove` weight (`0..1`) peaking along the ideal racing line (outside on corner entry -> inside apex at curvature peak -> outside on corner exit).
   - In `roadMat.onBeforeCompile`, modulate albedo & roughness by `vGroove` + wet-track moisture:
     - **Ideal Racing Groove (`vGroove -> 1`)**: darkens aggregate by `18%` (laid-down Pirelli rubber) and polishes roughness (`roughness *= mix(1.0, 0.68, vGroove)`).
     - **Off-Line Marbles (`abs(uNorm) > 0.72` in corners)**: slightly dustier gray-charcoal micro-grain (`roughness *= 1.08`).
2. **Pit Lane & Paved Aprons (`asphalt_pit_lane`)**:
   - Bind `asphalt_pit_lane_{diff,nor_gl,arm}_1k.jpg` to the pit lane strip, start/finish grid apron, and paved runoff verges so pit asphalt has distinct finer-grain concrete/bitumen texture and oil/tire patina.
3. **3D Beveled FIA Sawtooth Kerbs (`brushed_concrete`)**:
   - Upgrade `_buildRoadAndCurbs` ([src/track.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js#L868-L960)): set `emissiveIntensity = 0`, bind `brushed_concrete_nor_gl_1k.jpg` + `brushed_concrete_arm_1k.jpg` (`roughness: 0.78`), use natural FIA pigments (matte traffic red `#c81d25`, off-white `#e9edf2`, Monaco yellow `#e0a800`, Silverstone slate/white), and bake dark rubber tire-scrub marks onto apex kerb inner bevels.
4. **Recessed 3D FIA Gravel Traps (`gravel`) & Dual-Scale Grass (`leafy_grass`)**:
   - Add curved exterior **FIA Gravel Trap beds** (`width = 5.8m` outside high-curvature corners `|curv| > 0.012`) textured with `gravel_{diff,nor_gl,arm}_1k.jpg` (`normalScale: (1.35, 1.35)`, warm limestone/silica tint `#d8cdb8`), bordered by a white painted track-limits line (`0.18m` crisp white stripe along both road edges!).
   - Replace flat green ground planes with `leafy_grass_{diff,nor_gl,arm}_1k.jpg` + a **dual-scale macro noise modulation** in `onBeforeCompile` (`uv * 0.07` blended with `uv * 1.0`) so large parkland fields have organic mowed-turf tonal variation with zero visible grid repetition!

### 5.3 F1 Cars & Pit Crew Realism (`src/models.js` + `tools/blender_generate_vehicles_and_pit.py`)
1. **Physical Automotive Paint & Raw Carbon Fiber (`src/models.js`)**:
   - Livery bodywork: `roughness: 0.16`, `metalness: 0.38`, `clearcoat: 1.0`, `clearcoatRoughness: 0.038`, `envMapIntensity: 1.1` (reflecting the real Poly Haven `.hdr` horizon cleanly with zero bloom halo).
   - Carbon survival cell, Venturi floor, diffuser strakes, wishbones, brake ducts & inner Halo: `roughness: 0.36`, `metalness: 0.16`, `clearcoat: 0.22` (satin autoclave pre-preg carbon, not mirror-gloss plastic).
2. **Dynamic Pirelli Tire Surface Conditioning (`src/models.js:updateVisuals`)**:
   - Modulate `tireRubberMat.roughness` dynamically from `0.74` (fresh/scrubbed dry slick) -> `0.52` (overheated/blistered > 115°C) -> `0.22` (wet surface sheen in rain), with subtle graining/wear band tinting and **zero** sidewall emissive glow.
3. **Live Functional Cockpit Steering Wheel OLED (`src/models.js`)**:
   - On the player's car (`isPlayer`), bind a lightweight `256×128` `CanvasTexture` to `CockpitDash` / `SteeringWheel` OLED screen updating every `4` frames (`15 Hz`) with crisp real-time **Gear (`1–8` / `N`), Speed (`KM/H`), Lap Delta (`-0.14s`), Tire Temps, and DRS/Flag status** — transforming first-person Helmet Cam immersion!
4. **Physical Slotted Carbon-Ceramic Brake Rotor Glow (`BrakeDisc_<C>`)**:
   - Add per-car scalar `this._brakeThermal = 0..1` (`+= brake * (speedKmh / 300) * dt * 2.8`, `-= (0.65 + speedKmh / 260) * dt * 1.35`). Drive `brakeDiscMat.emissive.setRGB(1.0 * glow, 0.24 * glow * glow, 0.02 * glow * glow * glow)` and `emissiveIntensity = glow * 1.85` strictly on the internal `BrakeDisc` mesh behind the Y-spoke rims.

### 5.4 Spectators, Grandstands, Signage, Barriers & Background (`src/track.js`)
1. **Spectators (`_buildGrandstandsAndCrowds`, lines `2985–3225`)**:
   - **Color Desaturation & Realistic Wardrobe**: Replace neon primary colors with an authentic motorsport crowd distribution: `38%` dark casual outerwear (charcoal `#232832`, navy `#1d2d44`, slate `#3b4454`, black `#181b20`), `26%` white/cream/heather gray (`#e6ebf0`, `#cfd6df`), and `36%` realistic muted team merchandise caps/polos (Scuderia crimson `#b81d24`, Papaya `#d96b18`, Mercedes teal `#0f8a7e`, Aston racing green `#14523d`, Red Bull navy `#1a2642`).
   - **Natural Seating Density & Subtle Motion**: Leave `~18%` of stadium bench slots unoccupied (exposing dark-blue/slate molded stadium seats underneath so stands read as architectural seating rather than solid pixel blocks) and reduce crowd vertex bounce amplitude by **75%** (`0.16m -> 0.035m` asynchronous upper-body sway + gentle arm raise only when lead cars pass within `90m`, `emissiveIntensity: 0`).
2. **Signage, Brake Boards & Overpass Bridges (`_buildTrackside Furniture`, lines `2377–2620`)**:
   - **FIA Brake Distance Boards (`300m`, `200m`, `150m`, `100m`, `50m`)**: Replace glowing cyan/yellow floating boxes with authentic FIA breakaway ground boards (`1.35m × 0.85m` matte dark-green/black or white polystyrene panels with bold DIN condensed `300` / `200` / `150` / `100` / `50` typography, `roughness: 0.62`, `emissiveIntensity: 0.0`).
   - **Trackside Sponsor Barriers & Gantry Bridges**: Add rear steel Lattice/I-beam diagonal support struts behind billboards, satin extruded aluminum frames (`metalness: 0.72, roughness: 0.34`), and non-emissive matte vinyl banners (`roughness: 0.54`, `emissiveIntensity: 0` in day; `0.55` backlit in `VEGAS` night only).
3. **Botanical Trees & Horizon Depth (`_getTreeGeometriesAndMaterials`, lines `5124–5499`, & `_buildFujiBackdrop`, lines `3560–3640`)**:
   - Bind `bark_brown_02_{diff,nor_gl,arm}_1k.jpg` to all tree trunks (`decTrunkGeo`, `pineTrunkGeo`, `palmTrunk`).
   - Replace neon/pastel foliage colors and `emissiveIntensity: 0.05–0.22` with natural botanical chlorophyll hues (Fuji/Silverstone oaks & pines: `#2c4a24`, `#385a2c`, `#1f381b`, `#466333`; muted natural Yoshino cherry `#e6b8c6` with `emissiveIntensity: 0.0`; Monza/Suzuka autumn `#9e3b1c`, `#b86b19`, `#284723`). Bias canopy vertex normals `35%` toward `(0, 1, 0)` (`normal = normalize(mix(normal, vec3(0,1,0), 0.35))`) so foliage clusters shade softly like real sunlit leaf crowns without harsh dark polygon facets.
   - Re-enable `fog: true` on Mount Fuji and distant skyline meshes so atmospheric perspective blends distant landmarks naturally into the Poly Haven sky horizon.

---

## 6. Immersive Sim Driving Camera Suite (5 Views in `src/main.js`)

Replace `CAMERA_MODES` ([src/main.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/main.js#L45-L50)) and `_updateCamera(dt)` ([#L2930-L3106](file:///c:/Users/mshaf/Downloads/AntiGravity/src/main.js#L2930-L3106)) with **5 authentic motorsport simulation cameras** cycled via `C` / `🎥`:

### 6.1 Core Sim Camera Rules
1. **Zero Arcade Hyperdrive FOV Distortion**:
   - Delete `const speedFovBoost = THREE.MathUtils.clamp((p.speedKmh - 95) / 235, 0, 1) * 15.5;`!
   - Keep **100% locked geometric FOV** in all 4 onboard cameras (`Cockpit`, `Bonnet`, `Halo T-Cam`, `Nose`) so apex geometry and braking markers never warp with speed. Allow at most `+1.8°` subtle aerodynamic pull in `Chase` cam only.
2. **6-DOF Driver Head & Chassis Coupling State (`this._camPhys`)**:
   - Compute longitudinal acceleration `longG = ((p.speed - prevSpeed) / Math.max(0.008, dt)) / 9.81` (clamped `[-5.5, +2.5]`) and lateral centripetal load `latG = (p.speed * yawRate) / 9.81` (clamped `[-5.0, +5.0]`).
   - Critically damp `headPitch`, `headRoll`, `headYawLook`, and `headHeave` (`1 - Math.exp(-dt * 14.0)`):
     - **Braking / Shift Pitch Nod**: Helmet pitches subtly forward `-longG * 0.0045 rad` under `5G` braking and kicks `+0.008 rad` for `90ms` on full-throttle upshift torque cut.
     - **Horizon Stabilization (`35%`)**: In Helmet Cam, apply `65%` of track bank/chassis roll to camera roll so the driver's inner ear keeps eyes partially level with the horizon while the carbon cockpit tub & Halo tilt dynamically around you!
     - **Apex Look-Ahead (`±6.5°`)**: Smoothly yaw gaze `+steerNorm * 0.11 rad` toward the corner apex in Helmet Cam.
     - **High-Frequency Road Texture (`14–22 Hz`)**: Couple `p.chassisHeaveM` + tiny `(speedKmh / 320) * 0.0018m` high-frequency road grain + sawtooth kerb rumble (`onCurb ? sin(t * 58) * 0.0045 : 0`) so the car feels bolted to real asphalt.

### 6.2 Exact 5-Camera Rig Table

| # | ID | HUD Label | Mount Offset `(x, y, z)` in Car Frame | Base FOV (Land / Port) | Key Sim Framing & Behavior |
| :-: | :--- | :--- | :---: | :---: | :--- |
| **1** | `COCKPIT` | `HELMET CAM (EYE-POINT)` | `(0.00, 0.655, -0.29)` | `64° / 72°` | True driver eye-point inside `CockpitTub_Interior`: frames live OLED steering wheel, gloved hands, slim central Halo V-pillar, both wing mirrors, and both front Pirelli tires + suspension wishbones. Full 6-DOF head physics + `±6.5°` apex look-ahead + `35%` horizon stabilization. |
| **2** | `BONNET` | `BONNET / COWLING CAM` *(NEW)* | `(0.00, 0.615, -0.78)` | `62° / 70°` | Mounted on front survival-cell bulkhead **ahead of the Halo**: unobstructed sim-rig view over the sculpted nosecone, live working front double-wishbones/pushrods, and front tire contact patches kissing apex kerbs. |
| **3** | `TCAM` | `FOM HALO T-CAM` | `(-0.085, 0.965, -0.08)` | `65° / 73°` | Authentic **left-offset (`-8.5cm`)** FOM broadcast roll-hoop onboard pod (`pitch = -5.5°`), showing Halo hoop, driver helmet visor, steering wheel inputs, and wide track ahead. |
| **4** | `NOSE` | `FRONT WING CAM` | `(0.00, 0.245, -1.96)` | `68° / 76°` | Mounted beside the front wing mainplane (`24cm` above tarmac) for pure ground-effect speed sensation and millimeter kerb placement. |
| **5** | `CHASE` | `SIM PURSUIT CHASE` | `(0.00, 1.82, +5.35)` look `(0, 0.58, -6.5)` | `58° / 68°` (`+1.8°` max) | **Velocity-aligned spring-damper pursuit rig**: follows `normalize(mix(carForward, velocityDir, 0.28))` with critically damped spring (`omega = 11.5`) instead of snapping rigidly to track centerline `pFr.tangent`, letting rear slip angles and overtakes read naturally! |

---

## 7. Authentic FOM World-Feed TV Broadcast Replay Presentation (`src/replay.js`, `index.html`, `styles.css`)

### 7.1 Upgrade 60Hz Replay Recorder Snapshot (`src/replay.js:recordTick`)
Add suspension & race-context telemetry to each car's recorded frame in [src/replay.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/replay.js#L277-L340) (interpolated smoothly in `_applyInterpolatedFrame`):
- `chassisPitchRad`, `chassisRollRad`, `chassisHeaveM`, `wheelCompression: [fl, fr, rl, rr]` -> Cars visibly dive under `5G` braking, roll onto outside suspension in 130R/Parabolica, and bounce over sawtooth kerbs during `¼×` / `½×` slow-motion TV replays!
- `drsOpen`, `brakeThermal`, `racePos` (`1..N`), `lap`, `gapToLeaderSec` -> Powers the live FOM Broadcast Timing Tower & Onboard Telemetry HUD at any scrubbed point on the timeline!

### 7.2 8-Mode FOM Broadcast Camera Architecture (`REPLAY_CAM_MODES`)

Replace the uniform 11-point camera loop ([src/replay.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/replay.js#L998-L1047)) with **8 authentic FOM World-Feed modes** (defaulting to **`AUTO_DIRECTOR`**):

1. **`AUTO_DIRECTOR` (`FOM WORLD FEED • AUTO`)** *(Default)*:
   - Live broadcast director state machine with minimum cut hold (`3.8s` normal, `2.4s` static kerb cut) so cuts feel like a human FOM TV gallery:
     - **Close Battle (`gap < 0.55s` to rival ahead/behind)**: 35% chance to cut to **`REAR_GEARBOX_CAM`** (from lead car looking back at attacker's front wing!) or **`ONBOARD_TCAM`** (from attacker diving inside!).
     - **Chicane / Hairpin Apex Window (`|curv| > 0.022` and car within `38m` of apex)**: cuts to **`APEX_KERB_CAM`** (`2.5s` dramatic ground-level pass) or **`TV_TELEPHOTO`** tight zoom!
     - **High-Speed Esses / Pack Spread**: cuts between **`TV_TELEPHOTO`** crane shots and **`HELI_CINEFLEX`** aerial tracking.
     - **Main Straight Finish / Start**: cuts to **`PIT_WALL_PAN`** whip-pan or **`TV_TELEPHOTO`** head-on long lens!
2. **`TV_TELEPHOTO` (`FOM LONG-LENS TRACKSIDE`)**:
   - **14 Curated Circuit Camera Towers** positioned along straight sightlines and corner exits (`setback = 16m–42m` from track edge, `height = 2.8m–9.5m` crane elevation).
   - **Real Optical Telephoto Zoom (`FOV = 14°..34°`)**: Dynamically racks focal length (`fov = clamp(2.2 * atan(targetFrameSpan / dist) * RAD2DEG, 14, 34)`) so a car `160m` up the straight is framed tightly at `14°` FOV (compressing perspective so heat-shimmering tarmac, undulating kerbs, and trailing rivals stack dramatically like real 1000mm Canon broadcast box lenses!), smoothly zooming out to `32°` as the car sweeps past, then zooming back in on its rear diffuser!
   - **Human Camera-Operator Pan Inertia**: Track target using a 2nd-order angular velocity damper (`panOmega = 13.5`, `damping = 0.88`) so 320 km/h fly-bys exhibit authentic micro-lag at closest approach (`dist < 18m`) before catching back up, plus `0.0012 rad` handheld/wind micro-breathing at `< 18°` telephoto FOV.
3. **`APEX_KERB_CAM` (`FIA APEX KERB BOX-CAM`)** *(NEW)*:
   - Static armoured housing embedded right inside the apex kerb (`lat = apexSign * (ROAD_HALF_WIDTH + 0.55)`, `y = 0.24m`, fixed `FOV = 64°`) aimed `28m` upstream toward the braking turn-in point, holding static or doing a snap cut as cars scream `0.8m` past the lens with an aerodynamic **wind-buffet camera shudder** (`exp(-passDist / 6.0) * 0.018m`) and stereo Doppler whoosh!
4. **`HELI_CINEFLEX` (`CINEFLEX HELICOPTER`)**:
   - Smooth high-altitude orbital path (`height = 58m–82m`, `radius = 65m` lead/lag spline offset) with gyro-stabilized medium-telephoto zoom (`FOV = 22°–30°`), framing 3–5 cars snaking through corners together.
5. **`ONBOARD_TCAM` (`FOM ROLL-HOOP ONBOARD`)**:
   - Authentic left-offset (`[-0.085, 0.965, -0.08]`, `FOV = 65°`) broadcast onboard pod on whichever car is selected in the Timing Tower.
6. **`REAR_GEARBOX_CAM` (`REAR WING / RIVAL CAM`)** *(NEW)*:
   - Mounted on rear crash-structure / rear wing endplate (`[0.24, 0.66, +1.96]`, looking **backward** `+Z` at `(0.0, 0.48, +18.0)`, `FOV = 62°`) showing the rear rain light, working rear pushrod suspension, tire squirt, and the pursuing car lunging out of the slipstream!
7. **`SUSPENSION_CAM` (`FRONT WISHBONE CAM`)** *(NEW)*:
   - Mounted on left sidepod leading edge (`[-0.50, 0.44, -0.58]`, looking forward-left at `(-0.86, 0.32, -1.55)`, `FOV = 58°`) showcasing the working carbon double-wishbones, steering tie-rod, glowing slotted brake rotor inside the wheel, and Pirelli slick riding sawtooth kerbs!
8. **`PIT_WALL_PAN` (`FIA PIT-WALL WHIP-PAN`)** *(NEW)*:
   - Positioned on the pit-wall signalling gantry (`s = 985`, `lat = ROAD_HALF_WIDTH + 1.15`, `y = 1.95m`, `FOV = 42°`) tracking cars down the pit straight and executing a dramatic `180°` whip-pan as they blast across the start/finish line!

### 7.3 Authentic FOM World-Feed TV Graphics Package (`index.html` & `styles.css`)

Enhance `#replay-overlay` ([index.html](file:///c:/Users/mshaf/Downloads/AntiGravity/index.html#L810-L832), [styles.css](file:///c:/Users/mshaf/Downloads/AntiGravity/styles.css#L3077-L3220)) with authentic F1 TV broadcast typography & layout (plus a `👁 CLEAN` 1-tap toggle button & `H` hotkey that hides all overlays for pure 3D capture):

1. **Top-Left Official Broadcast Bug (`#replay-fom-bug`)**:
   - Sleek dark-obsidian translucent bar (`rgba(10, 12, 18, 0.86)`, crisp `2px` F1 crimson `#e10600` left accent): **`F1 REPLAY`** badge + Circuit Short Name (`SUZUKA GP`) + **`LAP 3 / 5`**.
2. **Left-Edge FOM Vertical Timing Tower (`#replay-timing-tower`)**:
   - Compact `148px`-wide broadcast standings tower showing `P1`–`P8`:
     - Position box (`1`..`8`) | `3px` Team Color Bar | `3-Char Driver Code` (`YOU`, `VER`, `NOR`, `LEC`, `HAM`, `PIA`, `RUS`, `ALO`) | Interval (`LEADER` / `+0.384`) | Tire Compound Dot (`S` red, `M` yellow, `H` white, `I` green, `W` blue).
     - **Interactive**: Tapping any driver row in the Timing Tower immediately focuses the TV cameras / Onboard T-Cam on that car!
3. **Bottom-Left FOM Driver Telemetry Lower-Third (`#replay-fom-telemetry`)**:
   - Crisp F1 broadcast telemetry pod showing focused driver's **Car Number + Name + Team**, live **Speed (`KM/H`)**, **Gear (`1–8`)**, **RPM shift-light arc**, dual live **Throttle (emerald) & Brake (crimson) progress bars**, and **`DRS` pill** (lit bright green when rear flap is open).
4. **Compact Bottom-Right / Bottom-Center Director Transport Bar (`#replay-transport-bar`)**:
   - Play/Pause, 60Hz smooth timeline scrubber, `¼× / ½× / 1× / 2×` slow-mo selectors, `🎥 AUTO TV` mode selector pill, `👁 CLEAN` clean-feed toggle, and `✕ EXIT`.

---

## 8. Implementation Checklist & File Ownership Handoff

1. **[src/weather.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/weather.js)**:
   - Add `loadPolyHavenHDR()` (Section 4.1) with `maxRadiance = 24.0` `FP16` guard; load the 5 verified `assets/hdri/*_1k.hdr` sky maps into `PMREMGenerator` + sky dome; calibrate sun/ambient ratios for zero-bloom `ACESFilmicToneMapping`.
2. **[src/main.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/main.js) + [index.html](file:///c:/Users/mshaf/Downloads/AntiGravity/index.html) + [styles.css](file:///c:/Users/mshaf/Downloads/AntiGravity/styles.css)**:
   - Remove `UnrealBloomPass` & `EffectComposer` in 2026 Sim mode; disable `#speed-vignette`; remove shift backfire triggers; implement the **5-Camera Sim Suite** (`COCKPIT` 6-DOF Helmet Cam, `BONNET` Cowling Cam, `TCAM` Offset Roll-Hoop, `NOSE` Wing Cam, `CHASE` Velocity-Aligned Spring Cam) with locked geometric FOV.
3. **[src/models.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/models.js)**:
   - Remove `afterburnerMesh`, `heatHazeMesh`, `exhaustFlameGroup`, `vortexGroup` (4.6m cyan cones), `haloPlane` brake billboards, glowing tire sidewall emissive, and continuous straight-line box sparks. Add integrated thermal glow strictly on slotted `BrakeDisc_<C>`, bottoming-only micro-sparks, dynamic Pirelli rubber roughness, and live Cockpit OLED canvas telemetry.
4. **[src/track.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/track.js)**:
   - Remove 24/7 falling confetti, constant stadium smoke flares, toy hot-air balloons, daytime floodlight cones, and all daylight `emissiveIntensity` on kerbs, signs, crowds, flags, trees, and Mt. Fuji. Wire the 24 verified `assets/textures/*_1k.jpg` PBR maps (`asphalt_02` + rubbered racing-line groove shader, `asphalt_pit_lane`, `brushed_concrete`, `gravel` traps + track-limit lines, `leafy_grass` dual-scale anti-tiling, `bark_brown_02`), natural motorsport spectator wardrobe/motion, and matte FIA brake boards.
5. **[src/replay.js](file:///c:/Users/mshaf/Downloads/AntiGravity/src/replay.js) + [index.html](file:///c:/Users/mshaf/Downloads/AntiGravity/index.html) + [styles.css](file:///c:/Users/mshaf/Downloads/AntiGravity/styles.css)**:
   - Record suspension `chassisPitchRad`/`chassisRollRad`/`chassisHeaveM`/`wheelCompression` & race standings at 60Hz; implement all **8 FOM Broadcast Camera Modes** (`AUTO_DIRECTOR`, `TV_TELEPHOTO` `14°–34°` zoom + operator pan inertia, `APEX_KERB_CAM`, `HELI_CINEFLEX`, `ONBOARD_TCAM`, `REAR_GEARBOX_CAM`, `SUSPENSION_CAM`, `PIT_WALL_PAN`) + clickable **FOM Timing Tower** & **Driver Telemetry Lower-Third** + `CLEAN FEED` toggle.
