# Race Phanatic F1 — Pole Position 2026: Retro Grand Prix

**Live Mobile & Desktop Web Link (GitHub Pages):**  
👉 **https://mshaffe1111.github.io/Pole-Position/**

A flagship HTML5 / WebGL (Three.js + Blender 3D `.glb` pipeline) mobile & desktop Formula racing game fusing the exact rules and 12-sector topological track geometry of Namco's 1982 *Pole Position* (Fuji Speedway, `4,359m` mapped to `1,000 game-meters`) with a decoupled `240Hz` 2026 Grand Prix simulation engine.

---

## Key Features

- **Dual Game Modes:**
  - **`1982_ORIGINAL`:** Mandatory 1-Lap Qualifying (`90s` master timer, `<= 73.00s` Rank A cutoff, `"Prepare to Qualify!"` voice synthesis, `4,000 pt` Pole bonus at `<= 58.50s`) + `3, 4, or 5 Lap` Grand Prix with `+58s` Extended Play checkpoints, `+50 pts` per 5m, `+50 pts` per overtake, `+200 pts/sec` remaining timer bonus, GP puddles, and classic fiery explosions.
  - **`2026_UPDATED` (Grand Prix Pro Sim):** `SHORT (5L)`, `MEDIUM (12L)`, and `LONG (25L)` races with 4-corner Pacejka-lite tire grip, thermal windows & wear (`SOFT`, `MEDIUM`, `HARD`, `INTERMEDIATE`, `FULL_WET`), the `25%` Tire Cliff, dynamic fuel load, 4-zone component damage (`Front Wing`, `Rear Wing`, `Suspension/Toe`, `Punctures`), Local Yellow Flags & Virtual Safety Car (`VSC`), and full 3D Pit Crew stops with an interactive **Optimal Clutch Release** mini-game.
- **Dynamic Procedural Weather & Drying Groove:** 5 weather regimes (`HOT_SUNNY` through `MONSOON_STORM` with lightning), standing puddles & aquaplaning above `200 km/h`, and a rubbered-in ideal line that dries `3x` faster than off-line tarmac.
- **Autonomous 15-Ray Spatial AI & 5 Personalities:** `APEX_TACTICIAN` (K. Takahashi), `LATE_BRAKER` (M. Vance), `TIRE_WHISPERER` (A. Prost), `DEFENSIVE_WALL` (R. Senna), and `ROOKIE_WILDCARD` (J. Johnny).
- **Ergonomic Mobile Touch Controls (`RIGHT_HANDED` & `LEFT_HANDED`):** Speed-sensitive non-linear virtual force-feedback steering wheel + dual vertical analog slide Gas/Brake pedals with horizontal trail-braking rollover + LOW/HIGH or 6-Speed Sequential shifter (plus `WASD`/Arrows + `Space`/`Q`/`E` keyboard & gamepad support).
- **Blender & Godot Integration:**
  - `blender/build_assets.py` builds and exports `assets/models/f1_car.glb`, `f1_wheel.glb`, `pit_crew.glb`, and `mount_fuji.glb` (plus `.blend` source files in `blender/`).
  - `project.godot` + `godot_showroom.tscn` opens directly in **Godot Engine 4.7+** to inspect all 3D models.
