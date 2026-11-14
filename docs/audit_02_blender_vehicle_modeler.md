# Phase 1–5 A+ Studio Audit & 3D Asset Specification — `@Blender_Vehicle_Modeler` (`@modeling`)

> **Project**: *Race Phanatic F1 — Pole Position 2026: Retro Grand Prix*  
> **Domain Lead**: `@Blender_Vehicle_Modeler` (`@modeling`)  
> **Owned Deliverables**:
> - `tools/blender_generate_vehicles_and_pit.py` (Headless Blender 5.3 `bpy` A+ 2x-Detail F1 Vehicle, First-Person Cockpit, Pit Garage & Rigged Pit Crew Generator)
> - `blender/build_assets.py` (Headless Blender 5.3 Live WebGL Asset Generator: `f1_car.glb`, `f1_wheel.glb`, `pit_crew.glb`, `mount_fuji.glb`, `yacht.glb`)
> - Dual-Engine `.glb` Exports in **BOTH** `assets/models/` and `godot_project/assets/models/`:
>   - `f1_car_2026.glb`, `f1_2026_player.glb`, `f1_2026_rival.glb` (`1,195,068 bytes` each)
>   - `pit_crew_rig.glb` (`443,416 bytes`)
> - WebGL Production `.glb` Exports in `assets/models/`:
>   - `f1_car.glb` (`468,176 bytes`), `f1_wheel.glb` (`283,228 bytes`), `pit_crew.glb` (`105,844 bytes`), `mount_fuji.glb` (`545,904 bytes`), `yacht.glb` (`84,100 bytes`)
> - `godot_project/scenes/f1_car_2026.tscn` (240Hz `RigidBody3D` F1 Vehicle + First-Person Cockpit Scene wired to `F1VehiclePhysics3D`, `MobileTouchAndCamera3D` & `GameplayHudAndAudio3D`)
> - `godot_project/scenes/pit_crew_rig.tscn` (Interactive 3D Pit Garage Bay, Pneumatic Hoses, Fuel Rig, Quick-Lift Jacks, Lollipop Sign, Spare Pirelli Set & Animated Pit Crew Scene)

---

## 1. A+ Studio Upgrade & Live WebGL Screenshot Defect Fixes (`#88` + `#89`)

### 1.1 Root-Cause Diagnosis & Surgical Fixes for Live WebGL Screenshot (`http://127.0.0.1:8765/`)
1. **Eliminated "Smooth Featureless Pink/Maroon Blob Sidepods" (`f1_car.glb` + `f1_car_2026.glb`)**:
   - **Root Cause**: Uncreased Catmull-Clark `subdiv_levels=2` on `Body_Main` in `blender/build_assets.py` melted sharp aerodynamic sidepod overbites and nose chines into a smooth pillow, while full-height painted sidepods (`z = 0.10..0.50`) lacked dark carbon undercut separation.
   - **Fix**: Removed uncreased subdivision (`subdiv_levels=0`), authored a 15-station chiseled needle nose + survival cell + razor coke-bottle spine, raised the painted `Body_Main` high-overbite sidepod inlets (`z = 0.23..0.51` with deep `58 mm` waterslide downwash trenches), carved a deep recessed **3K Carbon-Fiber lower sidepod undercut & bargeboard skirt (`z = 0.08..0.24`)** + **8 angled cooling louver gills per side** in `Carbon_Chassis`, added diagonal `Body_Accent` sidepod flank slashes, and unwrapped normalized `[0.015..0.985]` symmetric automotive livery UVs (`apply_livery_uvs`) so procedural CanvasTexture livery decals (`#1`, stripes, `PHANATIC`, `VELOCE`, `P-ZERO`) project cleanly without clamping or distortion.
2. **Eliminated "Flat Silver Pie-Plate Wheel Discs & Thick Peach/Orange Sidewall Donuts" (`f1_wheel.glb` + `f1_car_2026.glb`)**:
   - **Root Cause**: `Compound_Sidewall` had a wide `46 mm` outer band (`r = 0.232..0.278`) plus a second inner ring (`r = 0.205..0.216`) that bloomed heavily under `emissiveIntensity: 0.46`; meanwhile `Wheel_Rim` included a full-width high-reflectivity (`envMapIntensity: 2.15`) barrel right behind shallow spokes, reflecting sky light as a solid silver disc.
   - **Fix**: Narrowed `Compound_Sidewall` to a single **razor-thin `11 mm` (`r = 0.248..0.259`)** 3-arc Pirelli P-Zero sidewall pinstripe; isolated the recessed inner wheel barrel + 2026 outer aero rim-cover ring into a dedicated pitch-black matte carbon mesh (`Wheel_Aero_Drum` / `Aero_Drum_Carbon`, `(0.012, 0.014, 0.018), roughness=0.60`); sculpted **`75 mm` deep-dish concave 10-spoke Y-split forged gunmetal spokes** (`Wheel_Rim`, `#232832`) + deeply recessed anodized FIA `Center_Lock_Nut` + wide-cheek 18-slot `Brake_Disc` so the dark carbon cavity, slotted rotor, and Brembo caliper read with razor-sharp motorsport depth.

### 1.2 First-Person Cockpit View (`cameraIndex === 2` / `COCKPIT_HELMET`) 2x+ Geometric Architecture
Both `f1_car_2026.glb` (Godot + WebGL) and `f1_car.glb` (WebGL `FormulaCarRig`) now include complete First-Person Cockpit View geometry framed around driver eye-point `(0.0, 0.655, -0.21)`:
- **`CockpitTub_Interior`**: Recessed 3K carbon survival-cell floor & side walls, FIA impact-foam side headrest bolsters, carbon HANS collar, instrument dash scuttle cowling, and 6-point Sabelt racing harness with machined titanium buckle.
- **`Halo_Titanium`**: Curved Grade-5 titanium horseshoe hoop, slim `13 mm` teardrop front center V-pillar aligned cleanly on `x = 0.0` (so it splits peripheral vision naturally without blocking the apex), and swept 2026 boomerang carbon aero fairings & vortex winglets.
- **`SteeringWheel` / `Cockpit_Wheel` -> `DriverArms_Gloves`**:
  - Sculpted carbon butterfly steering wheel with 15-LED RPM shift-light brow, glowing `4.3"` `OLED_Telemetry_Mat` multi-function screen, 3 central FIA ERS/diff/brake-migration rotary dials, thumb encoders, 6 tactile buttons, and 4 rear magnetic shift/clutch paddles.
  - **Parented `DriverArms_Gloves`** (`Driver_Forearms_Wheel` + `Driver_Gloves` + `Driver_Glove_Knuckles`): Quilted fireproof Nomex sleeves, white gauntlet cuffs, moulded suede palms, 4 curled fingers gripping each butterfly horn, thumbs hooked inside the thumb cutouts, and dorsal carbon-knuckle guards — rotating 1:1 with the steering shaft in both WebGL and Godot!
- **`WingMirror_L` & `WingMirror_R`**: Twin aero stalks, vortex-shedding cowlings, and high-metallic (`metallic = 1.0, roughness = 0.015`) chrome mirror glass panes angled toward the driver eye-point.

---

## 2. Standardized Vehicle Node Hierarchy (`f1_car_2026.glb` & `f1_car_2026.tscn`)

- **Units & Scale**: `1.0 Blender Unit = 1.0 Godot Meter`, `scale = Vector3(1, 1, 1)` on every node.
- **Orientation**: `-Z` Forward (`z = -2.44 m` nose tip), `+Z` Rear (`z = +2.07 m` rain light), `+Y` Up, `+X` Right.
- **Wheelbase & Track**: Wheelbase = `2.90 m` (`z_front = -1.48 m`, `z_rear = +1.42 m`); Track Width = `1.72 m` (`x = ±0.86 m`).

```text
F1Car2026 (RigidBody3D — script: f1_vehicle_physics_3d.gd, Layer 5: f1_vehicles, Mass: 798 kg)
├── CollisionHull (CollisionShape3D — 24-pt Beveled Ski-Ramp ConvexPolygonShape3D; CollisionHull-convcolonly in GLB)
├── Body (Node3D / MeshInstance3D — Monocoque, High-Overbite Sidepods + 8 Louvres/side, Titanium Floor Edge Strakes, 8-Strake Diffuser)
│   ├── CockpitTub_Interior (MeshInstance3D — Pivot: [0.00, 0.42, -0.35] — Carbon Survival Cell, FIA Foam Headrest & 6-Pt Harness)
│   ├── Halo_Titanium (MeshInstance3D — Pivot: [0.00, 0.68, -0.44] — Grade-5 Titanium Hoop, Slim 13mm V-Pillar & Boomerang Aero Fairings)
│   ├── WingMirror_L (MeshInstance3D — Pivot: [-0.54, 0.585, -0.50] — Twin Aero Stalks, Cowling & Chrome Mirror Face)
│   ├── WingMirror_R (MeshInstance3D — Pivot: [+0.54, 0.585, -0.50] — Twin Aero Stalks, Cowling & Chrome Mirror Face)
│   ├── FrontWing (MeshInstance3D — Pivot: [0.00, 0.10, -2.20] — 4-Element Gull-Wing Cascade, 3-Slot Endplates & Dual S-Diveplanes)
│   ├── RearWing (MeshInstance3D — Pivot: [0.00, 0.73, +1.92] — Spoon Mainplane, Dual Beam Wing, Swan-Neck Pylons & Slotted Endplates)
│   │   └── RearWing_DRS (MeshInstance3D — Hinge Pivot: [0.00, 0.84, +1.89] — Rotates X = -0.32 rad to open DRS slot)
│   ├── SteeringWheel (MeshInstance3D — Shaft Pivot: [0.00, 0.54, -0.52] — Butterfly Grips, 15-LED Brow, OLED Face, Rotaries & Paddles)
│   │   └── DriverArms_Gloves (Node3D / MeshInstance3D — Nomex Sleeves + Carbon-Knuckle Gloves rotating 1:1 with SteeringWheel)
│   ├── CockpitDash (MeshInstance3D — Pivot: [0.00, 0.59, -0.56] — Anti-Glare OLED Telemetry Display)
│   └── DriverHelmet (MeshInstance3D — Pivot: [0.00, 0.625, -0.245] — Hidden automatically in COCKPIT_HELMET mode)
├── Suspension_FL..RR (Inboard Clevis Pivots: [±0.22, 0.31, -1.48 / +1.42] — Airfoil Wishbones, Push/Pullrods)
│   └── BrakeCaliper_FL..RR (Carbon Brake Duct Drums, Cooling Scoops, Multi-Vane Wake Winglets & 6-Piston Brembo Caliper)
├── Wheel_FL..RR (Exact Hub Centers: [±0.86, 0.34, -1.48 / +1.42] — 18" Pirelli Slick, 11mm P-Zero Stripe, Dark Carbon Drum & 10-Spoke Y-Rim)
│   └── BrakeDisc_FL..RR (Co-Axial Slotted Carbon-Ceramic Rotor with Dynamic Thermal Emission)
├── CameraAndTouchRig (Node3D — script: mobile_touch_and_camera_3d.gd)
│   └── SpringArm3D -> Camera3D -> CockpitVisorRainOverlay (windshield_rain.gdshader)
└── GameplayHudAndAudio (Node — script: gameplay_hud_and_audio_3d.gd)
```

---

## 3. Pit Garage, Lollipop Sign, Quick-Lift Jacks & Skeletal Pit Crew (`pit_crew_rig.glb` & `pit_crew_rig.tscn`)

1. **`PitGarage_Bay` & `Overhead_Gantry_And_Hoses`**: Structural portal columns, recessed ceiling LED banks, pit-wall telemetry rack, red tool cabinets, twin carbon overhead swivel booms, and 4 catenary pneumatic air hoses (`Pneumatic_Hose_FL..RR`).
2. **Dedicated Pit Props**:
   - `Pressurized_Fuel_Rig` (stainless tower + dry-break coupling boom),
   - `QuickLift_FrontJack` (`[0, 0.08, -2.85]`) & `QuickLift_RearJack` (`[0, 0.08, +2.65]`) with low-profile carbon cradles,
   - `Pit_Lollipop_Sign` (`[0, 0.00, -3.55]`, `STOP / 1ST GEAR` carbon pole & sign board animated to flip `90°` on `CLEAR!`),
   - `Spare_Pirelli_Wheel_Set` (stacked & upright 18-inch Pirelli slicks + thermal tire warmers).
3. **13-Bone `PitCrew_Armature` + High-Detail Paoli Hurricane Wheel Gun + 3 Smooth NLA Clips (`24 FPS`)**:
   - `Pit_Idle_Ready` (`Frames 1–48`), `Pit_Tire_Swap` (`Frames 1–60`), and `Pit_Jack_And_Refuel` (`Frames 1–60`).

---

## 4. Dual-Engine Export Verification Manifest

| Asset Path | Engine Target | Verified Size | Status |
| :--- | :--- | :---: | :---: |
| `assets/models/f1_car_2026.glb` (+ `f1_2026_player.glb`, `f1_2026_rival.glb`) | WebGL / Shared | `1,195,068 B` | PASS |
| `godot_project/assets/models/f1_car_2026.glb` (+ `player` / `rival` aliases) | Godot 4.x | `1,195,068 B` | PASS |
| `assets/models/pit_crew_rig.glb` | WebGL / Shared | `443,416 B` | PASS |
| `godot_project/assets/models/pit_crew_rig.glb` | Godot 4.x | `443,416 B` | PASS |
| `assets/models/f1_car.glb` | Live WebGL (`src/models.js`) | `468,176 B` | PASS |
| `assets/models/f1_wheel.glb` | Live WebGL (`src/models.js`) | `283,228 B` | PASS |
| `assets/models/pit_crew.glb` | Live WebGL (`src/models.js`) | `105,844 B` | PASS |
| `assets/models/mount_fuji.glb` | Live WebGL (`src/models.js`) | `545,904 B` | PASS |
| `assets/models/yacht.glb` | Live WebGL (`src/models.js`) | `84,100 B` | PASS |
