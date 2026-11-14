# Phase 1–4 Technical Audit & Implementation Blueprint — `@Godot_VFX_Shaders_Lead` (`@graphics`)

**Project**: *Race Phanatic F1 — Pole Position 2026: Retro Grand Prix*  
**Domain Role**: `@Godot_VFX_Shaders_Lead` (`@graphics`)  
**Owned Deliverables**:
- `godot_project/shaders/asphalt_wet_pbr.gdshader`
- `godot_project/shaders/foliage_wind_and_crowd_vat.gdshader`
- `godot_project/shaders/windshield_rain.gdshader`
- `godot_project/scripts/weather_and_vfx_manager.gd`
- `src/weather.js` & `src/models.js` (WebGL2 Live Deployment Counterparts)

---

## Phase 1: Comprehensive Codebase Audit & Visual Gap Analysis

### 1.1 Inspection of Existing WebGL2 Architecture (`src/weather.js`, `src/models.js`, `src/track.js`)
1. **Atmospheric Sky, HDR Reflections & Fixed-Per-Race Weather (`src/weather.js`)**:
   - Implements a 6-regime fixed-per-race weather system (`HOT_SUNNY`, `GOLDEN_SUNSET`, `OVERCAST_COOL`, `LIGHT_DRIZZLE`, `MONSOON_STORM`, `NEON_NIGHT`) via `rollRegimeForRace` and `configureForSession`.
   - Uses a custom Rayleigh/Mie atmospheric sky dome shader with 4-ring solar corona, horizon solar pillar bloom, 3-layer volumetric FBM clouds (cumulus + sunlit altocumulus + cirrus), twinkling dual-scale starfield, and runtime `PMREMGenerator` HDR environment map baking (`_bakeDynamicHDREnvironment`).
   - Maintains a `2048×2048` PCF soft directional shadow frustum tightly tracking `focusTargetPos`, paired with 3-layer 3D parallax mountain/foothill rings across all 6 Grand Prix circuits (`FUJI`, `MONACO`, `SUZUKA`, `MONZA`, `SILVERSTONE`, `VEGAS`).
2. **Clearcoat PBR Formula 1 Car Rig & Motorsport VFX (`src/models.js`)**:
   - Implements `FormulaCarRig` with `MeshPhysicalMaterial` metallic-flake clearcoat (`metalness: 0.42, roughness: 0.16, clearcoat: 1.0, clearcoatRoughness: 0.025, envMapIntensity: 2.25`), procedural `256×256` 3K 2×2 twill carbon-fiber `map` + `normalMap` + `roughnessMap` + `bumpMap`, sky-reflective iridium visor, forged 10-spoke clearcoat rims, articulated `Rear_Wing_DRS_Flap`, live `Cockpit_Wheel` steering, and repairable front-wing endplate damage.
   - Drives real-time telemetry VFX: blackbody-spectrum glowing carbon-ceramic brake discs & calipers (`cherry-red #d91808 -> orange-gold #ffb82e`), continuous exhaust afterburner heat-haze + dual-core blue/orange shift-cut backfire flames, `>250 km/h` helical rear-wingtip aero condensation vortex contrails, multi-stage wet rooster-tail spray, and titanium underfloor skid-block sparks (`onCurb > 110 km/h` & `> 285 km/h` aero compression).
3. **Track Surface & Trackside Props (`src/track.js`)**:
   - Generates `1024×1024` quartz-aggregate asphalt textures with a darkened rubbered-in racing groove and wet clearcoat mirror modulation, 2-step 3D serrated kerbs, stadium floodlights with volumetric cones, and instanced grandstand spectators.

### 1.2 Identified Upgrade Targets for the Blender + Godot 4 Pipeline
To achieve console-grade mobile visual fidelity at a locked 60 FPS on iOS/Android GPUs (Adreno / Mali / Apple GPU) in Godot 4 while keeping 1:1 parity with our WebGL2 build:
- **Multi-Scale Asphalt & Dynamic Wetness (`asphalt_wet_pbr.gdshader`)**: Eliminate visible texture tiling across wide circuit ribbons by combining macro bitumen noise, micro quartz aggregate sparkle, UV/Vertex-Color (`COLOR.g` / `UV2.x`) rubbered racing groove smoothing, world-space standing puddle basins (`COLOR.b`), Fresnel sky reflections, and procedural concentric raindrop ripple rings (`compute_rain_ripples`).
- **Zero-CPU-Overhead Foliage Wind & 3D Crowd VAT (`foliage_wind_and_crowd_vat.gdshader`)**: Replace static or CPU-updated trees and spectators with a single unified GPU vertex shader driven by `COLOR.r` (wind bend weight) for 3D biome trees (trunk sway + leaf flutter + hemisphere canopy normals + `BACKLIGHT` subsurface transmission) and `MultiMeshInstance3D` (`INSTANCE_CUSTOM` + optional VAT texture) for 3D grandstand crowds with stadium Mexican waves, team livery colors, and HDR camera flash starbursts (`EMISSION`).
- **Onboard Cockpit Visor Rain Refraction (`windshield_rain.gdshader`)**: Provide a screen-space normal-refracting visor shader (`hint_screen_texture`) with static mist beads, gravity + aero-shear sliding raindrop rivulets (`car_speed_kmh`, `yaw_rate_rad`), and a tear-off visor clear wipe (`visor_wipe_progress`).
- **Unified Weather & GPU Particle Manager (`weather_and_vfx_manager.gd`)**: Centralize `WorldEnvironment`, mobile 2-split CSM shadows (`SHADOW_PARALLEL_2_SPLITS`), global shader uniforms (`RenderingServer.global_shader_parameter_set`), and telemetry-bound `GPUParticles3D` emitters.

---

## Phase 2: Cross-Agent Interface & Data Alignment Table

| Producer Agent | Consumer Agent | Shared Interface / Vertex / Uniform Contract | Specification & Range |
| :--- | :--- | :--- | :--- |
| `@Blender_Environment_Modeler` (`@tracks`) | `@Godot_VFX_Shaders_Lead` (`@graphics`) | Track Mesh `COLOR.g` / `UV2.x` & `COLOR.b` | `COLOR.g` (`[0..1]`): baked racing-line rubber weight; `COLOR.b` (`[0..1]`): standing puddle basin bias consumed by `asphalt_wet_pbr.gdshader`. |
| `@Blender_Environment_Modeler` (`@tracks`) | `@Godot_VFX_Shaders_Lead` (`@graphics`) | Tree Mesh `COLOR.r` & Outward Canopy Normals | `COLOR.r` (`0.0` at trunk base -> `1.0` at outer leaf tips) drives primary sway & leaf flutter in `foliage_wind_and_crowd_vat.gdshader` (`is_crowd_mode = false`). |
| `@Blender_Environment_Modeler` (`@tracks`) | `@Godot_VFX_Shaders_Lead` (`@graphics`) | Grandstand `MultiMeshInstance3D` `INSTANCE_CUSTOM` | `INSTANCE_CUSTOM.x` seeds per-spectator wave phase, team livery jersey pick (`4` F1 constructor palettes), and stochastic Xenon camera flashes (`is_crowd_mode = true`). |
| `@Godot_Physics_Engineer` (`@physics`) | `@Godot_VFX_Shaders_Lead` (`@graphics`) | `update_car_telemetry_vfx(car_id, telemetry)` | Passes `{ speed_kmh, moisture, skid_intensity, on_curb, on_grass, on_gravel, in_slipstream, drs_active }` at 60Hz to drive all 6 car `GPUParticles3D` emitters. |
| `@Godot_Controls_Camera` (`@controls`) | `@Godot_VFX_Shaders_Lead` (`@graphics`) | `windshield_rain.gdshader` uniforms | Camera rig passes `car_speed_kmh`, `yaw_rate_rad`, and `visor_wipe_progress` (`0..1`) when Cockpit / T-Cam view is active in wet regimes. |
| `@Godot_VFX_Shaders_Lead` (`@graphics`) | `@Godot_Physics_Engineer` & `@Godot_AI_Director` | `get_moisture_at(curvature, lateral_offset)` | Returns real-time local surface wetness `W in [0..1]` (accounting for the 18% drier rubbered racing groove) for Pacejka tire grip & AI wet braking points. |

---

## Phase 3: Modular Godot 4 Shader & GDScript Architecture

### 3.1 `godot_project/shaders/asphalt_wet_pbr.gdshader`
- **Macro/Micro Mineral Aggregate**: Evaluates 4-octave rotated FBM (`macro_uv_scale = 12.0`) and high-frequency quartz grit (`micro_uv_scale = 96.0`) to eliminate tiling while producing realistic grazing-angle specular sparkle.
- **Rubbered Racing Groove**: Blends spline lateral coordinate `lat_coord` around `groove_center_u` with vertex-baked `COLOR.g` / `UV2.x` and longitudinal tire-marbling noise, darkening albedo to `#131418`, lowering roughness from `0.78 -> 0.36`, and attenuating micro-bump depth by `58%`.
- **Dynamic Wetness & Puddle Ripples**: Reads global shader uniforms `global_wetness` and `groove_wetness`. Darkens porous wet bitumen by `44%`, activates `CLEARCOAT` (`up to 0.95`) and `METALLIC` Fresnel sky reflections in puddle basins, and perturbs `NORMAL_MAP` with 3×3 neighborhood expanding sinusoidal raindrop ripple rings (`compute_rain_ripples`).

### 3.2 `godot_project/shaders/foliage_wind_and_crowd_vat.gdshader`
- **Mode A (`is_crowd_mode = false` — 3D Biome Trees)**: Uses `COLOR.r` flex weight to apply quadratic trunk bending along `wind_direction * wind_speed` plus 3-axis high-frequency leaf flutter, blends canopy normals toward a hemisphere crown vector (`hemisphere_normal_blend = 0.65`), and outputs `BACKLIGHT` subsurface transmission for warm golden-hour foliage glow.
- **Mode B (`is_crowd_mode = true` — 3D Grandstand Spectators)**: Supports both baked Vertex Animation Textures (`use_vat_texture`) and procedural Mexican-wave vertical jump + arm/flag sway, colors spectator jerseys across 4 Works Team palettes (`Namco Crimson`, `Papaya Orange`, `Silver Arrow Teal`, `Royale Blue`), and triggers HDR camera flash bursts (`EMISSION = vec3(3.8, 4.2, 5.0) * v_camera_flash`).

### 3.3 `godot_project/shaders/windshield_rain.gdshader`
- **Aero-Sheared Sliding Rivulets**: Combines a static micro-condensation layer (`static_mist_beads`) with two multi-scale sliding droplet layers (`sliding_rain_layer`) whose trajectories deflect radially outward from the visor stagnation point proportional to `car_speed_kmh / 320.0` and curve laterally with `yaw_rate_rad`.
- **Screen-Space Meniscus Refraction**: Samples `hint_screen_texture` at `SCREEN_UV + total_normal * refraction_strength` with top-edge specular rim glints and a left-to-right tear-off visor clear sweep (`visor_wipe_progress`).

### 3.4 `godot_project/scripts/weather_and_vfx_manager.gd`
- **Mobile-Safe Lighting & Shadows**: Configures `WorldEnvironment` (`TONE_MAPPER_ACES`, `exposure = 1.06`, softlight HDR glow, exponential horizon fog) and `DirectionalLight3D` (`SHADOW_PARALLEL_2_SPLITS`, `max_distance = 165.0m`, `shadow_blur = 1.35`).
- **Telemetry-Driven `GPUParticles3D` Suite**: Registers 6 GPU emitters per car (`WetRoosterSprayGPU`, `WingtipVortexLeftGPU`, `WingtipVortexRightGPU`, `TitaniumSkidSparksGPU`, `GravelKickUpGPU`, `LockupTireSmokeGPU`) updated every frame from vehicle physics telemetry with zero GDScript heap allocations.

---

## Phase 4: Verification & Mobile GPU Stress-Testing Checklist

- [x] **Shader Compilation & Uniform Type Safety**: Verified all 3 `.gdshader` files use strict Godot 4 spatial syntax (`source_color`, `hint_range`, `hint_screen_texture`, `MODEL_NORMAL_MATRIX`, `BACKLIGHT`, `CLEARCOAT`, `CLEARCOAT_ROUGHNESS`, `NORMAL_MAP`).
- [x] **60 FPS Mobile Tile-Based GPU Budget**:
  - Zero dynamic branching inside inner noise loops; all FBM loops use fixed compile-time bounds (`4` octaves).
  - `DirectionalLight3D` restricted to `SHADOW_PARALLEL_2_SPLITS` (`165m` max distance) to conserve mobile tile bandwidth.
  - All `GPUParticles3D` emitters have explicit `visibility_aabb` bounds to prevent frustum culling pops and cap overdraw.
- [x] **WebGL2 Live Counterpart Parity (`src/weather.js` & `src/models.js`)**: Verified in headless Chromium WebGL2 (`EffectComposer` + `UnrealBloomPass` + `OutputPass`) with all `.glb` assets (`f1_car_2026.glb`, `pit_crew_rig.glb`, `f1_car.glb`, `f1_wheel.glb`, `pit_crew.glb`, `mount_fuji.glb`, `yacht.glb`) and all 6 weather regimes (`{"ok":true,"errors":[]}`).

## 4. A+ Studio Upgrade & Live Screenshot Diagnostic Fixes (`#88` + `#89`)

- **Anti-Haze & High-Contrast Key-to-Fill Lighting (`src/weather.js`, `weather_and_vfx_manager.gd`)**:
  - Reduced `FogExp2` / environment fog density by **75%** (`0.00004`–`0.00013` across sunny/sunset/wet regimes) so pit garages, grandstands, and alpine mountain vistas render crystal-clear with zero milky wash.
  - Boosted clear/golden-hour `DirectionalLight` sunlight to **`3.40`** with a tightly framed `±35m` `2048×2048` soft-shadow frustum while cutting `HemisphereLight` (`~0.52–0.64`), `fillLight` (`0.45`), and `rimLight` (`0.23`) by **45%** and preserving `_baseSunIntensity` / `_baseAmbientIntensity` inside `update()` for crisp grounding shadows.
  - Toned down `_bakeDynamicHDREnvironment` diffuse sky bounce (`uBoost = 1.04`, dark `#0a0d12` asphalt ground bounce) and sky radiance boost (`1.05`) so `UnrealBloomPass` never bleaches horizon or red car paint.
- **Saturated Rosso Corsa PBR, Motorsport Livery Decals & 18-Inch Forged Wheels (`src/models.js`)**:
  - Tuned car clearcoat PBR to `metalness: 0.32, roughness: 0.18, clearcoat: 1.0, clearcoatRoughness: 0.05, envMapIntensity: 1.15` paired with a cached `512×512` `CanvasTexture` Motorsport Livery Decal Atlas (`#1` Championship Nose & Engine-Cover Roundels, twin Scuderia stripes, `PHANATIC` / `VELOCE` / `MGU-K HYBRID` / `P-ZERO` wordmarks, cooling gill slats, and exposed `3K` carbon sidepod undercuts) + deterministic `projectMotorsportBodyUVs` / `projectWingBannerUVs`.
  - Upgraded 18-inch wheel visuals (`0x22262e` dark satin gunmetal 10-spoke forged rims, `#141518` vulcanized slick rubber, anodized red/blue center-lock nuts) and deep soft-feathered grounding contact shadow (`opacity: 0.88`).
- **3D First-Person Cockpit Interior, Visor Rain & Skeletal Pit Crew (`src/models.js`, `src/weather.js`)**:
  - Bound `f1_car_2026.glb` (`CockpitTub_Interior`, `Halo_Titanium`, `SteeringWheel` + `DriverArms_Gloves`, `CockpitDash`, `WingMirror_L/R`, `RearWing_DRS`, `Wheel_FL..RR`, hidden `CollisionHull-convcolonly`), live ~15Hz `256×128` OLED telemetry `CanvasTexture` (Gear, Speed, Compound/Life, ERS%, `DRS ACTIVE`), automatic driver-helmet hiding in Cockpit View (`cameraIndex === 2`), 3D suspension pitch/roll/wheel-compression, and off-track gravel/turf clod kick-up VFX.
  - Added `updateCockpitVisorRain(camera, isCockpitView, speedKmh, dt)` + `triggerVisorTearOff()` (wired to `'f1-visor-tearoff'`) and exported `createCarRig`, `createPitCrewTeamRig`, and `updatePitCrewTeamRig` with `pit_crew_rig.glb` skeletal cloning & `THREE.AnimationMixer` clip cross-fading.
