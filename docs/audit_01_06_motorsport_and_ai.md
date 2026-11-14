# Phase 1–4 Studio Audit & Architecture Blueprint (A+ Edition): `@Motorsport_Researcher` & `@Godot_AI_Director`

**Agents**: `@Motorsport_Researcher` (`01`) + `@Godot_AI_Director` (`06`) — Executed by `@cpu`  
**Owned Deliverables**:
- `src/ai.js` (Live Playable WebGL 240Hz Autonomous Racecraft Engine)
- `godot_project/scripts/motorsport_telemetry_data.gd` (6-Circuit 3D Spline, Banking, Power Unit & Pacejka Telemetry Database)
- `godot_project/scripts/ai_driver_controller.gd` (Godot 4.x 15-Ray 3D Spatial Radar, Racecraft & `F1VehiclePhysics3D` Driver Controller)
- `docs/audit_01_06_motorsport_and_ai.md` (Domain Audit, Mathematical Formulations & Verification Matrix)

---

## PART I: `@Motorsport_Researcher` — Real-World Telemetry, 3D Track Geometry & Power Unit Specifications

### 1. Phase 1 Gap Analysis (`src/config.js` & `src/physics.js` vs. AAA 2026 WebGL + Godot 4 Simulation)

| Subsystem | Legacy / Baseline State | AAA A+ 2026 Motorsport & Godot 4 Upgrade |
| :--- | :--- | :--- |
| **Circuit Spline & Banking** | 2D/2.5D control points with uniform flat cross-fall (`0°` banking) | Full 3D closed Catmull-Rom spline (`1,000` baked arc-length stations, `Vector4(x, y, z, bankDeg)`) with vertical relief ($0\text{ m} \to +15\text{ m}$), superelevation banking ($\pm 7.0^\circ$), zero-curvature main-straight clamping, and O(1) 3D world-to-spline projection (`project_world_pos_to_spline`). |
| **Braking & Apex Telemetry** | Static `entryS` markers without physical deceleration distance envelopes | Exact kinematic braking envelopes across `8` lookahead horizons (`0, 15, 30, 45, 68, 95, 118, 140 m`), corner radii $R = 82.0 / |\kappa|$, geometric vs. late-apex diamond cutback lines, and wet/thermal grip scaling. |
| **Drivetrain & Torque Curve** | Linear top-speed array `[108..316]` | Authentic 2026 1.6L V6 Turbo-Hybrid + MGU-K (`350 kW` / `1,000 bhp` combined) torque LUT (`3,800–13,500 RPM`), explicit 8-speed ratios $G_1..G_8$, final drive $G_{fd} = 3.720$, loaded 18-inch tire radius $R_w = 0.360\text{ m}$, and `56.5%` front brake bias. |
| **4-Corner Tire Physics** | Scalar wear & single optimal temp band | 5-compound Pacejka Magic Formula $(B, C, D, E)$, 4-corner carcass/surface thermal window evaluation (`evaluate_tire_grip_multiplier`), non-linear `< 28% / < 25%` Pirelli degradation cliff, and `W > 0.28` wet crossover. |

---

### 2. Complete 6-Circuit 3D Spline, Curvature, Banking & Braking Telemetry

All 6 Grand Prix circuits normalize loop arc-length to $s \in [0, 1000)$ game-meters (`DEFAULT_REAL_M_PER_GAME_M = 4.25`, asphalt width $2 \times 8.4\text{ m} = 16.8\text{ m}$, beveled FIA sawtooth curb width $1.25\text{ m}$) and share a laser-straight Main Pit Straight along $Z = 0, Y = 0$ ($s \ge 945$ or $s \le 120$, clamped $\kappa \equiv 0.0$) for seamless Pit Lane (`s = 912 -> 115`, lateral offset $+15.2\text{ m}$) and Start Gantry alignment.

#### 2.1 `FUJI_1982` — Fuji Speedway '82 (🇯🇵 Japan • $4.25\text{ km}$)
- **3D Control Points $[x, y, z, \text{bankDeg}]$**:
  `[-260, 0, 0, 0.0]`, `[0, 0, 0, 0.0]`, `[300, 0, 0, 0.0]`, `[620, 0, 0, 0.0]`, `[830, 2, 95, 4.5]`, `[855, 5, 295, 6.2]` (T1 Daiichi Right, $R \approx 118\text{ m}$, $\kappa = +0.68$), `[660, 7, 380, 1.5]`, `[460, 9, 330, -5.8]` (100R Sweeper, $R \approx 195\text{ m}$, $\kappa = -0.42$), `[250, 12, 470, 3.0]`, `[60, 14, 650, 0.0]`, `[-185, 13, 665, -7.0]` (T3 Hairpin Left, $R \approx 93\text{ m}$, $\kappa = -0.88$), `[-370, 10, 480, 4.8]` (300R Panorama, $R \approx 215\text{ m}$, $\kappa = +0.38$), `[-485, 5, 240, 3.5]`, `[-430, 1, 55, 1.2]`.
- **Braking Zones & Target Apex Speeds**:
  1. **Turn 1 (Daiichi Right)**: `entryS = 162`, $316 \to 173\text{ km/h}$ ($4.8\text{ G}$ decel), `apexS = 282`.
  2. **Turn 2 (100R Sweeper)**: `entryS = 410`, $285 \to 242\text{ km/h}$, `apexS = 478`.
  3. **Turn 3 (Hairpin)**: `entryS = 618`, $292 \to 138\text{ km/h}$, `apexS = 668`.
  4. **Turn 4 (300R Panorama)**: `entryS = 888`, $265 \to 245\text{ km/h}$, `apexS = 842`.

#### 2.2 `MONACO_HARBOR` — Monte Carlo Harbor (🇲🇨 Monaco • Technical Street Circuit)
- **Elevation & Tunnel Profile**: Climbs from Port Hercule ($Y = 0\text{ m}$) up Beau Rivage to Casino Square ($Y = +15.0\text{ m}$), plunges into Fairmont Hairpin (`entryS = 304`, $\kappa = -0.92$, $v_{\text{apex}} = 119\text{ km/h}$, banking $-4.5^\circ$), blasts through the Seafront Tunnel (`s = 430..565`) into heavy braking at the Nouvelle Harbor Chicane (`entryS = 582`, $288 \to 136\text{ km/h}$), Swimming Pool S-complex, and Rascasse (`entryS = 868`, $132\text{ km/h}$).

#### 2.3 `VEGAS_NEON` — Las Vegas Neon Strip (🇺🇸 USA Night • High-Speed Street)
- **Profile**: $332\text{ km/h}$ DRS slipstream battles down the Strip straight into the Sphere Arena Carousel (`entryS = 168`, $+3.8^\circ$ banking, $168\text{ km/h}$), Neon Chicane (`entryS = 445`, $148\text{ km/h}$), Casino Boulevard (`entryS = 685`, $182\text{ km/h}$), and Strip Entry (`entryS = 882`, $215\text{ km/h}$).

#### 2.4 `MONZA_TEMPLE` — Monza Temple of Speed (🇮🇹 Italy • Low-Drag Autodromo)
- **Profile**: Maximum $333\text{ km/h}$ multi-car slipstream trains into Variante del Rettifilo (`entryS = 168`, $333 \to 134\text{ km/h}$), Curva Grande, cambered Curva di Lesmo (`entryS = 376`, $+4.5^\circ$ banking, $188\text{ km/h}$), Variante Ascari (`entryS = 598`, $195\text{ km/h}$), and banked Curva Parabolica (`entryS = 816`, $+5.5^\circ$ banking, $244\text{ km/h}$).

#### 2.5 `SUZUKA_130R` — Suzuka GP Circuit (🇯🇵 Japan • Grade-Separated Figure-8)
- **Profile**: First Curve (`entryS = 152`, $182\text{ km/h}$), high-rhythm Esses ($\pm 4.0^\circ$), Suzuka Hairpin (`entryS = 465`, $132\text{ km/h}$), Spoon Curve (`entryS = 585`, $Y = +9.0\text{ m}$, $196\text{ km/h}$), Overpass Bridge (`s = 665..765`, $Y = +13.5\text{ m}$), flat-out `130R`, and Casio Triangle (`entryS = 878`, $144\text{ km/h}$).

#### 2.6 `SILVERSTONE_GP` — Silverstone Abbey (🇬🇧 Great Britain • High-Speed Aero Benchmark)
- **Profile**: Abbey/Village (`entryS = 156`, $168\text{ km/h}$), Brooklands/Luffield (`entryS = 382`, $158\text{ km/h}$ — prime Over-Under Switchback zone!), high-G Maggotts-Becketts-Chapel complex (`entryS = 565`, $\pm 4.8^\circ$, $238\text{ km/h}$), and Stowe/Vale (`entryS = 785`, $192\text{ km/h}$).

---

### 3. 2026 F1 8-Speed Seamless Drivetrain, Torque Curve & 5-Compound Pacejka Matrix

| Gear | Ratio $G_k$ | Redline Top Speed ($\text{km/h}$) | Upshift ($\text{km/h}$) | Downshift ($\text{km/h}$) |
| :---: | :---: | :---: | :---: | :---: |
| **G1** | `3.420` | `108.0` | `102.0` | — |
| **G2** | `2.495` | `148.0` | `141.0` | `82.0` |
| **G3** | `2.007` | `184.0` | `176.0` | `118.0` |
| **G4** | `1.709` | `216.0` | `208.0` | `152.0` |
| **G5** | `1.507` | `245.0` | `237.0` | `182.0` |
| **G6** | `1.357` | `272.0` | `263.0` | `210.0` |
| **G7** | `1.247` | `296.0` | `287.0` | `236.0` |
| **G8** | `1.168` | `316.0` (`332+` DRS/Tow) | — | `260.0` |

- **Combined ICE + MGU-K (`350 kW`) Torque Curve (`sample_engine_torque_nm`)**: `540 Nm` @ `3,800 RPM` $\to$ `760 Nm` @ `6,500 RPM` $\to$ `965 Nm` plateau across `9,200–11,400 RPM` $\to$ `865 Nm` @ `13,000 RPM` (`1,000 bhp` peak power) $\to$ FIA fuel-flow soft-cut @ `13,500 RPM`.
- **5-Compound Pacejka $(B, C, D, E)$ & Thermal Windows**:
  - **SOFT**: $\mu_0 = 1.12$, $(11.8, 1.52, 1.12, -0.35)$, `90°C–105°C`, `1.55x` wear.
  - **MEDIUM**: $\mu_0 = 1.00$, $(11.2, 1.48, 1.00, -0.30)$, `85°C–100°C`, `1.00x` wear.
  - **HARD**: $\mu_0 = 0.92$, $(10.6, 1.45, 0.92, -0.25)$, `80°C–95°C`, `0.62x` wear.
  - **INTERMEDIATE**: $\mu_0 = 1.00$, $(10.4, 1.42, 1.04, -0.20)$, `60°C–85°C`, optimal across $0.28 < W \le 0.58$.
  - **FULL WET**: $\mu_0 = 0.96$, $(9.8, 1.38, 1.02, -0.15)$, `45°C–75°C`, optimal for $W > 0.58$ + hydroplane immunity.

---

## PART II: `@Godot_AI_Director` — A+ Wheel-to-Wheel Racecraft, Pressure Mistakes & Pit Strategy

### 1. Zero-Cheat 240Hz Physics Parity & Direct `F1VehiclePhysics3D` Binding
In both WebGL (`src/ai.js` $\to$ `stepVehiclePhysics240Hz`) and Godot 4 (`ai_driver_controller.gd` $\to$ `F1VehiclePhysics3D.set_driver_inputs`), AI cars obey **100% identical physics equations** as the Player:
- Within the `±165m` real-world battle bubble (`[-40..+36]` game-meters), `elastic === 1.000` — zero rubber-band speed cheats, zero rail-clamping, and full 4-corner tire wear, thermal grip loss, fuel mass penalty, aero wing damage, and slipstream physics.
- `AIDriverController.step_f1_rigidbody(...)` projects any Godot 4 `F1VehiclePhysics3D` `RigidBody3D` onto the 3D circuit spline via `MotorsportTelemetryData.project_world_pos_to_spline(...)`, fuses 15 live 3D `RayCast3D` beams (`13` forward fan angles `[-26°..+26°]` + `2` lateral sidepod sensors) with spline lookahead, and calls `vehicle.set_driver_inputs(steer, throttle, brake, drs)`.

### 2. Multi-Car Slipstream Trains, Over-Under Switchbacks & FIA 1-Move Rule
1. **Multi-Car Slipstream DRS Trains (`aiInDraftTrain`, `aiDraftTrainCount`)**:
   - Scans the entire `48m` forward wake cone. Cars 2nd, 3rd, and 4th in line tuck cleanly into the slipstream wake with a `±0.22m` staggered peep-out offset (preserving sightlines to braking boards!) to harvest `+14–16 km/h` aerodynamic tow.
   - **Anti-3-Wide Discipline**: If the car immediately ahead is *already* side-by-side overtaking a 3rd car (`leaderAlready2Wide`), the trailing AI tucks behind the faster overtaking lane ("tandem draft pass") rather than forcing a 3-wide chicane pileup.
2. **Coordinated Over-Under Exit Switchbacks (`aiSwitchbackTimer`, `aiSwitchbackSign`)**:
   - When attacking a defender (`DEFENSIVE_WALL` or Player) who has parked tightly on the compromised inside line (`leaderDefendingTightInside` at `< 22m`), `APEX_TACTICIAN`, `TIRE_WHISPERER`, and `LATE_BRAKER` swing **wide on corner entry** (`-insideSign * 4.95m`), square off the apex early, and execute an **Over-Under Switchback** onto the inside exit (`+insideSign * 4.35m` with `+5%` cleaner exit traction cap) to pass cleanly on corner exit!
3. **Strict FIA 1-Move Defensive Rule (`aiDefenseMovesUsed`, Article 33.4)**:
   - Resets `aiDefenseMovesUsed = 0` upon exiting every corner (`|\kappa| > 0.22 \to |\kappa| < 0.10`).
   - On straights (`|\kappa| < 0.14`, `brakeInput < 0.08`), before sidepod overlap (`behindM > 1.12 * CAR_LENGTH`), a defending AI may commit **at most ONE (`1`) defensive move** (`aiDefenseMovesUsed = 1`) to cover the inside line.
   - Reactive double-weaving is strictly prohibited, and when returning toward the racing line before turn-in with an attacker within `14m`, the defender leaves **`>= 1.28x` car width** to the track edge!
4. **Side-by-Side Chicane Corridor (`>= 1.25x` Car Width)**:
   - Through rapid direction-flipping chicanes (`isChicaneFlip`), overlapping cars (`dsReal < 7.6m`) enforce parallel left/right chicane lanes (`apexDepth = 3.25m`, `minCorridor = 1.28x–1.30x CAR_WIDTH`), preventing apex squeezing over sausage kerbs.

### 3. Human Mistakes Under Pressure (`car.aiPressureMeter` $\in [0, 1]$)
- Continuously tracks stalking pressure whenever the **Player OR a faster rival** closes within **`< 14.0m` OR `< 0.45s` time gap**:
  $$\frac{dP}{dt} = 0.145 \cdot S_{\text{arch}} \cdot M_{\text{prox}} \cdot M_{\text{corner}} \cdot M_{\text{hero}}$$
  where $S_{\text{arch}}$ is `1.68` (`ROOKIE_WILDCARD`), `1.26` (`LATE_BRAKER`), `0.56` (`DEFENSIVE_WALL`), `0.50` (`TIRE_WHISPERER`), and `0.44` (`APEX_TACTICIAN`).
- **Pre-Break Brake Creep (`P > 0.52`)**: Driver stares in mirrors and creeps braking point up to `+2.8m` deeper.
- **Apex Inside-Front Lockup & `1.0m–1.6m` Wide Excursion ($P \ge 0.82$ Rookie / $0.88$ Late-Braker in corners $|\kappa| > 0.28$)**:
  - Triggers visible inside-front tire-smoke lockup puffs (`aiLockupPuffTimer = 0.48–0.68s`, `skidIntensity = 0.96`).
  - Applies a smooth $\sin(\pi \cdot \tau)$ bell-curve lateral excursion of **`1.02m–1.58m` wide** toward the outer kerb (`aiMistakePeakLat`) with a `7.5%` mid-corner speed scrub — opening a thrilling, organic inside switchback lane for the player without spinning out or causing an unfair Yellow Flag!

### 4. Real-Time Undercut / Overcut & Wet Transition Pit Strategy
- **Immediate Wet Transition (`W > 0.28`)**: Crossing `grooveMoisture > 0.28` on dry slicks immediately triggers `aiWantsToPit = true` (`reason = 'WET_TRANSITION'`) for `INTERMEDIATE` (`0.28 < W <= 0.58`) or `FULL_WET` (`W > 0.58`), plus dry slick crossover when `W < 0.08`.
- **Tire Cliff (`tireLife < 28%`) + Clean-Air Undercut / Lightweight Overcut**:
  - **Undercut (`UNDERCUT_CLEAN_AIR`)**: If bottled up `< 17.5m` in dirty air for `> 4.2s` (`aiDirtyAirStuckTimer`) with `minLife < 42%` and `_isProjectedPitRejoinClean(...) == true` (no traffic within `±24m` of the `-195` game-meter pit-loss rejoin point), `APEX_TACTICIAN` / `LATE_BRAKER` boxes early on `AGGRESSIVE_UNDERCUT` crew mode and unleashes a `38s` fresh-tire out-lap push!
  - **Overcut (`aiOvercutActive`)**: If `TIRE_WHISPERER` / `DEFENSIVE_WALL` has `> 5s` of clean air (`> 46m` clear ahead) and low fuel mass (`fuelLaps < 3.2`), stretches the stint down to `22.5%` tire life to jump pitted rivals in traffic!
