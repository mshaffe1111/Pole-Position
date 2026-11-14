# Research Report 04 — Real-Time Vehicle Dynamics, $C^2$ Track Geometry, Corner-Physics Brake Assist & Competitive AI Science

**Author:** `@res-car-science` (Researcher 4 — Vehicle Dynamics, Track Geometry, Brake-Assist Physics & Competitive AI)  
**Scope:** Read-only forensic audit of `src/track.js`, `src/physics.js`, `src/controls.js`, `src/ai.js`, `src/pit_damage_caution.js`, `src/main.js`, `src/models.js`, `src/config.js`, `src/career.js`, and `index.html`, paired with exact mathematical derivations and drop-in 240 Hz reference formulations.

---

## Executive Summary

A line-by-line audit of the simulation pipeline uncovered the exact mathematical and architectural root causes behind all three gameplay symptoms reported by the user:

1. **Why Hard Turns Feel Jerky (`src/track.js`, `src/physics.js`, `src/controls.js`, `src/main.js`):**
   - **Piecewise-Linear Polyline Discretization (`src/track.js:19, 428, 572–606`):** `SAMPLES = 2000` bakes a 2,000-segment polygon ($\Delta s_{\text{real}} \approx 2.18\text{–}3.10\text{ m}$ per chord) and linearly interpolates positions/frames (`lerpVectors`), creating discrete tangent/frame derivative kinks 10–40 times per second that amplify lateral world-space jitter on tight inside hairpin offsets (`pos.addScaledVector(right, lateralOffsetM)`).
   - **Curvature Scaling & Saturation Plateau (`src/track.js:500–507`):** True curvature $\kappa_{\text{real}} = d\psi/ds_{\text{real}}$ is multiplied by `82.0` and hard-clamped to `[-0.95, +0.95]`. **Every turn tighter than $R = 82 / 0.95 = 86.3\text{ m}$ saturates to the exact same `0.95` ceiling**—crushing $85\text{ m}$ medium bends and $14\text{ m}$ Monaco/Fuji hairpins into a flat-topped plateau with sharp $C^0$ slope corners on entry/exit.
   - **Non-Physical Lateral Velocity Relaxation & Step-Jumping Gains (`src/physics.js:1102–1174, 1246–1250, 1350`):** Instead of integrating yaw rate $r = \dot{\psi}$ and body slip angle $\beta$ from front/rear axle tire forces, the car relaxes `lateralVel` toward a synthetic `targetLatVel` whose damping rate jumps instantaneously (`16.5 / 19.5 / 22.0 / 24.5` at `physics.js:1167–1170`), injects boolean step impulses on kerbs (`curbApexHook` at `physics.js:1150–1152`), inflates low-speed lateral slew via a `13.5` floor clamp (`physics.js:1126`), distorts hairpin angular progression via a clamped `radiusFactor` (`[0.78, 1.22]` at `physics.js:1350`), and sets `relYaw` proportional to `lateralVel` (`physics.js:1248`—collapsing car slip angle to $0^\circ$ in steady-state cornering!).
   - **Chase-Cam 120 m Unit Mismatch & Uninterpolated 240 Hz Sub-Steps (`src/main.js:2250–2257, 3086–3105`):** `main.js:3086` adds `lookAhead = 22.0` **real meters** directly to `playerCar.s` (**game-meters**), sampling **96 m to 136 m ahead** (`22 * realMetersPerGameMeter`), multiplying curvature by `180`, and clamping at `±1.2`—violently whipping the camera toward distant corners before the car arrives. Simultaneously, integer `subSteps` (`3, 4, 4, 5` per frame) lack render-alpha interpolation (`physicsAccumulator / PHYSICS_DT`), producing micro-stutter in high-rate yaw transitions.

2. **Why Auto-Brake Defaults to a Constant Percentage & Drags Speed Down (`src/controls.js` vs. `src/physics.js`):**
   - **Two Conflicting Brake-Assist Implementations Exist—One Dead, One Broken by a $82\times$ Unit Mismatch:**
     - `src/physics.js:397–415, 820–859` contains a corner-entry assist, **but `src/main.js:2633–2644` (`physCtx`) never passes `controls` or `brakingAssist`**, leaving `physics.js` brake assist permanently `'OFF'` (dead code).
     - `src/controls.js:967–1014` (`_computeDrivingAssists`) is the code actually driving `playerCar.brakeInput`, and **line 990 contains a catastrophic scale mismatch**: `safeSpeedKmh = clamp(296.0 / Math.sqrt(1.0 + peakCurv * 255.0), 108.0, 315.0)`. That formula assumed `peakCurv` was in real $\text{m}^{-1}$ ($\sim 0.003\text{–}0.05$), whereas `track.getPhysicsCurvature()` returns values scaled by `82.0` (`0.018..0.95`)!
     - Consequently, **even on a flat-out $R = 1,640\text{ m}$ highway kink (`peakCurv = 0.05`), `safeSpeedKmh` collapses to the `108.0 km/h` floor clamp!** On `LOW` assist (`margin = 24`, `maxStrength = 0.38`), **any gentle bend on the circuit triggers brake assist above `132 km/h` and holds a constant `38%` (`0.38`) brake percentage (`68%` in MED, `90%` in HIGH)** while only looking `74 m` ahead (`controls.js:978`)—too late for real hairpins yet constantly dragging speed down on gradual turns!

3. **Real Car Science & Competitive AI Gaps (`src/physics.js`, `src/pit_damage_caution.js`, `src/ai.js`, `src/main.js`):**
   - **Car Science:** Front-wing damage adds zero vortex drag (`physics.js:780`); rear-wing damage never reduces rear high-speed lateral downforce and never disables functional `car.drsActive` (`physics.js:862–873`, only hidden visually in `models.js:2055`); fuel mass (`physics.js:787`) is missing from lateral cornering inertia and tire load sensitivity; 4-corner tire grip is averaged (`sumLatMu * 0.25` at `physics.js:670`) instead of split front-vs-rear axle balance; and heavy wheel lockups create zero persistent **flat-spot** vibration/grip hotspots.
   - **Competitive AI:** `src/ai.js:383` starves AI straight-line and sweeper pace by holding `throttleInput = 0.94` on straights and `0.52` whenever `|curK| >= 0.08` (also blocking AI DRS which requires `throttle > 0.72` at `physics.js:868`); `src/main.js:1756` spawns AI with `perfMods: null` so Career R&D upgrades leave AI behind; `ai.js:25` snaps lateral targets across 13 discrete `1.2 m` rays every `40 ms`; and `ai.js:1398` hardcodes `fuelToAdd: 'FILL'` on every pit stop.

---

## Pillar 1: Why Hard Turns Currently Feel Jerky — Forensic Audit & Exact $C^2$ / Slip-Angle Fixes

### 1.1 Line-by-Line Discontinuity Audit Across the Pipeline

| Subsystem & File | Exact Lines | Current Implementation | Physical & Visual Discontinuity Produced |
| :--- | :--- | :--- | :--- |
| **Polyline Discretization**<br>`src/track.js` | `L19`, `L428`, `L572–606` | `SAMPLES = 2000` ($\Delta s_{\text{real}} \approx 2.2\text{–}3.1\text{ m}$); `sampleAt` uses `lerpVectors(a.pos, b.pos, frac)` and `pos.addScaledVector(right, lateralOffsetM)`. | Position is only $C^0$ (piecewise-linear chords); tangent derivative jumps at every sample boundary (`10–40 Hz`). Offsetting by `lateralOffsetM` along linearly lerped `right` vectors magnifies vertex angle kinks on tight inside hairpins. |
| **Curvature Saturation & Deadzones**<br>`src/track.js` & `src/physics.js` | `track.js:L500–507`, `L527`<br>`physics.js:L421` | `rawCurv[i] = clamp(radPerMeter * 82.0, -0.95, 0.95)`; deadzones at `< 0.015` (`track.js:527`) and `< 0.018` (`physics.js:421`). | All turns with $R < 86.3\text{ m}$ saturate to `±0.95` (destroying hairpin vs. medium-turn differentiation and creating sharp derivative corners entering/exiting saturation). Sweeper entry jumps from `0.000` to `0.018`. |
| **Pit-Straight Seam Mismatch**<br>`src/track.js` | `L461–471` vs. `L481–485` | Position `pts` quintic-locks at `s >= 952 \|\| s <= 122`, but `tangents` hard-switches to `(1,0,0)` at `s >= 954 \|\| s <= 120` (and curvature at `950 / 126`). | Creates a 2-game-meter (~10 m) mismatch where `pts` is already curving (`s = 122..120`, `952..954`) while `tangent` is hard-clamped to `(1,0,0)`. |
| **Step-Jumping Lateral Damping**<br>`src/physics.js` | `L1165–1174` | `latDampRate` switches boolean-style among `22.0`, `24.5`, `19.5`, and `16.5` when `(targetLatVel * car.lateralVel) < -0.35` flips. | Instantaneous `48%` jump in lateral acceleration (`d(lateralVel)/dt`) mid-chicane or during small counter-steer corrections. |
| **Low-Speed Lateral Slew Inflation**<br>`src/physics.js` | `L1102–1104`, `L1126–1134` | `Math.max(13.5, nextSpeedMps * 0.60) * hairpinTurnInBite` (`1.22x` below `138 km/h`). | At hairpin apexes (`65 km/h = 18 m/s`), `13.5 * 1.22 = 16.47` over-amplifies lateral velocity slew relative to forward speed, making tight turns feel twitchy and darty instead of rotating smoothly around the car's yaw axis. |
| **Boolean Kerb & Grass Steps**<br>`src/physics.js` | `L429–430`, `L678–680`, `L938–940`, `L1150–1152` | Boolean `onCurb` injects `-sign(lat) * min(1.35, v*0.02)` into `targetLatVel`; boolean `onGrass` drops `muLat` to `0.44` and adds `-6.0 m/s²` drag in 1 tick. | Zero tire-contact-patch transition width: grazing an apex kerb by `1 mm` triggers a sudden lateral hook impulse (`curbApexHook`), yanking the nose inward. |
| **Synthetic `relYaw` & Clamped `radiusFactor`**<br>`src/physics.js` | `L1246–1250`, `L1350–1351` | `desiredYaw = clamp((lateralVel / max(15, v))*0.76 + steer*0.12, ...)`; `radiusFactor = clamp(1 - k*lat*0.022, 0.78, 1.22)`. | In a steady-state corner arc (`lateralOffset = const` $\implies$ `lateralVel = 0`), car slip angle collapses to ~0! Meanwhile inside hairpin `radiusFactor` (`0.84` vs. true `1 - 7.5/18 = 0.58`) distorts angular progression rate $\dot{s}$. |
| **Wall Scrub Impulse**<br>`src/physics.js` | `L1230–1242`, `L1355–1357` | `car.speedKmh -= impactScrubKmh` (non-`dt`-scaled step subtraction up to `-22 km/h` in a single `4.16 ms` tick). | Instantaneous longitudinal velocity step on light barrier graze + duplicate hard clamp at `L1356`. |
| **Digital Steer-Rate Step**<br>`src/controls.js` | `L1455`, `L1466–1468` | `steerRate = Math.abs(this.steer) < 0.30 ? 15.0 : 9.5` (keyboard) and `< 0.32 ? 18.0 : 9.8` (touch arrows). | `45%` instantaneous drop in steering angular velocity the moment `|steer|` crosses `0.30`, felt as a mid-turn hitch. |
| **Sub-Step Aliasing & Chase-Cam `lookAhead` Unit Bug**<br>`src/main.js` & `src/models.js` | `main.js:L2250–2257`, `L2390–2395`, `L3086–3105`<br>`models.js:L1875–1877` | Integer 240 Hz `subSteps` without render interpolation; `sampleAt(playerCar.s + 22.0)` treats `22 m` as game-meters (`~120 m` real!); `dt * 16.5` non-exponential lerp; double tilt write. | Frame-to-frame temporal aliasing (`3` vs `4` substeps at 60 Hz) + camera swinging toward corners 120 m early, saturating at `±1.2`, and whipping violently through chicanes/hairpins. |

---

### 1.2 Exact $C^2$-Continuous Periodic Cubic Spline & Arc-Length Parameterization (`src/track.js`)

#### Why Centripetal Catmull-Rom Alone Still Has $C^1$ Curvature Jumps
`THREE.CatmullRomCurve3` (`src/track.js:422`) is a cubic Hermite curve with finite-difference tangents: it is **$C^1$-continuous in tangent, NOT $C^2$-continuous in curvature**. Across every control point $\mathbf{P}_k$, $\mathbf{C}''(u)$ jumps discontinuously, meaning true curvature $\kappa(s)$ has sharp corners and $\frac{d\kappa}{ds}$ (which drives lateral jerk $j_y = v^3 \frac{d\kappa}{ds}$) contains Dirac spikes! Baking `getSpacedPoints(2000)` then degrades even $C^1$ into a $C^0$ polygon.

#### Exact $C^2$-Continuous Periodic Cubic Spline + Monotonic Arc-Length LUT
Given $M$ closed control points $\{\mathbf{P}_0, \mathbf{P}_1, \dots, \mathbf{P}_{M-1}\}$ ($\mathbf{P}_M \equiv \mathbf{P}_0$) with centripetal chord-length knots:

$$\Delta u_k = \|\mathbf{P}_{k+1} - \mathbf{P}_k\|_2^\alpha \quad (\alpha = 0.5), \qquad u_0 = 0, \quad u_{k+1} = u_k + \Delta u_k$$

Solve the cyclic tridiagonal $C^2$ continuity system once at circuit load ($O(M)$ operations via Sherman-Morrison cyclic Thomas algorithm, $M \approx 30\text{–}65$ takes $< 0.05\text{ ms}$) for knot second derivatives $\mathbf{M}_k = \mathbf{C}''(u_k)$:

$$\Delta u_{k-1}\,\mathbf{M}_{k-1} + 2(\Delta u_{k-1} + \Delta u_k)\,\mathbf{M}_k + \Delta u_k\,\mathbf{M}_{k+1} = 6\left(\frac{\mathbf{P}_{k+1} - \mathbf{P}_k}{\Delta u_k} - \frac{\mathbf{P}_k - \mathbf{P}_{k-1}}{\Delta u_{k-1}}\right), \qquad k = 0, \dots, M-1$$

For any continuous parameter $u \in [u_k, u_{k+1}]$ with local normalized $\tau = \frac{u - u_k}{h_k} \in [0, 1]$ ($h_k = \Delta u_k$), the **exact analytical position, first derivative, and second derivative** are:

$$\mathbf{C}(u) = (1 - \tau)\mathbf{P}_k + \tau\mathbf{P}_{k+1} + \frac{h_k^2}{6}\Bigl[\bigl((1 - \tau)^3 - (1 - \tau)\bigr)\mathbf{M}_k + \bigl(\tau^3 - \tau\bigr)\mathbf{M}_{k+1}\Bigr]$$

$$\mathbf{C}'(u) = \frac{\mathbf{P}_{k+1} - \mathbf{P}_k}{h_k} + \frac{h_k}{6}\Bigl[\bigl(1 - 3(1 - \tau)^2\bigr)\mathbf{M}_k + \bigl(3\tau^2 - 1\bigr)\mathbf{M}_{k+1}\Bigr]$$

$$\mathbf{C}''(u) = (1 - \tau)\mathbf{M}_k + \tau\mathbf{M}_{k+1}$$

Notice that $\mathbf{C}(u) \in C^2$, $\mathbf{C}'(u) \in C^1$, and $\mathbf{C}''(u) \in C^0$ everywhere around the closed loop with **zero polygon facets**.

#### Exact Pit-Straight $C^2$ Coherent Blending (Eliminating the `s = 120..122` / `952..954` Seam)
Instead of blending `pts`, `tangents`, and `curvature` with three mismatched hard cutoffs (`952/122`, `954/120`, `950/126`), apply a single $C^2$ quintic weight $w(s) \in [0, 1]$ ($w(t) = 6t^5 - 15t^4 + 10t^3$, where $w'(0)=w'(1)=w''(0)=w''(1)=0$) directly to the spline evaluation:

$$\tilde{\mathbf{C}}(s) = \begin{pmatrix} x(s) \\ (1 - w(s))\,y(s) \\ (1 - w(s))\,z(s) \end{pmatrix}$$

and differentiate $\tilde{\mathbf{C}}(s)$ analytically using the product rule ($\tilde{z}' = (1-w)z' - w' z$, $\tilde{z}'' = (1-w)z'' - 2w'z' - w''z$). Position, tangent, normal, and curvature remain **100% mathematically consistent** across the entire pit straight and transition zones with zero seam kinks.

#### Analytical Tangent, Frame, and Unclamped True Curvature $\kappa_{\text{real}}(s)$ in $\text{m}^{-1}$
Build an 8,192-entry monotonic arc-length table $s_{\text{real}}(u)$ via 5-point Gauss-Legendre quadrature on each span:

$$L_k = \int_{u_k}^{u_{k+1}} \|\mathbf{C}'(u)\|_2\,du, \qquad m_{\text{perGameM}} = \frac{L_{\text{total}}}{1000}$$

To query any continuous $s \in [0, 1000)$ at 240 Hz:
1. Map $s_{\text{target}} = \operatorname{wrapS}(s) \cdot m_{\text{perGameM}}$, locate LUT bracket in $O(1)$ uniform-arc-index + 1 Newton step $u \leftarrow u - \frac{s(u) - s_{\text{target}}}{\|\mathbf{C}'(u)\|}$ (machine-precision arc-length parameterization!).
2. Evaluate exact orthonormal track frame (matching Three.js `+X` pit-straight forward, `+Y` up, `+Z` right):

$$\mathbf{T}(s) = \frac{\tilde{\mathbf{C}}'(u)}{\|\tilde{\mathbf{C}}'(u)\|_2}, \qquad \mathbf{R}(s) = \frac{\mathbf{T}(s) \times \hat{\mathbf{y}}}{\|\mathbf{T}(s) \times \hat{\mathbf{y}}\|_2} = \frac{(-T_z,\, 0,\, T_x)}{\sqrt{T_x^2 + T_z^2}}, \qquad \mathbf{N}(s) = \mathbf{R}(s) \times \mathbf{T}(s)$$

3. Evaluate **exact signed horizontal curvature $\kappa_{\text{real}}(s)$ in true $\text{m}^{-1}$** (positive = bends right toward $+\mathbf{R}$, negative = bends left toward $-\mathbf{R}$, **with NO `82.0` scale factor and NO `±0.95` clamp**, and NO deadzone step):

$$\kappa_{\text{real}}(s) = \frac{\tilde{x}'(u)\,\tilde{z}''(u) - \tilde{z}'(u)\,\tilde{x}''(u)}{\bigl(\tilde{x}'(u)^2 + \tilde{y}'(u)^2 + \tilde{z}'(u)^2\bigr)\sqrt{\tilde{x}'(u)^2 + \tilde{z}'(u)^2}} \quad \left[\text{units: }\text{m}^{-1} = \frac{1}{R_{\text{center}}(s)}\right]$$

4. Offset world position smoothly along the analytical $C^2$-continuous unit right vector:

$$\mathbf{P}_{\text{world}}(s, d) = \tilde{\mathbf{C}}(u(s)) + d \cdot \mathbf{R}(s)$$

Because $\tilde{\mathbf{C}}(u(s))$ is $C^2$ and $\mathbf{R}(s)$ is $C^1$ with continuous derivative $\frac{d\mathbf{R}}{ds_{\text{real}}} = -\kappa_{\text{real}}(s)\,\mathbf{T}_{\text{horiz}}(s)$, **every chordal kink and inside-hairpin lateral jitter disappears completely**.

---

### 1.3 Continuous Dynamic Bicycle / Slip-Angle Vehicle Yaw & Curvilinear Kinematics (`src/physics.js`)

To eliminate jerky lateral translation and fake zero-steady-state `relYaw`, replace the boolean-damped `targetLatVel` relaxation (`src/physics.js:1126–1253, 1350–1352`) with a **240 Hz Semi-Implicit Dynamic Bicycle + Curvilinear Frenet Solver**.

#### State Variables (Body & Curvilinear Frame)
- $v_x$: Longitudinal speed in car body frame ($\text{m/s}$)
- $v_y$: Lateral slip velocity in car body frame ($\text{m/s}$, positive = right)
- $r = \dot{\psi}$: World yaw angular velocity ($\text{rad/s}$, positive = clockwise / right turn when viewed from $+Y$ top-down, matching $\kappa_{\text{real}} > 0$)
- $\Delta\psi = \psi - \psi_{\text{track}}(s)$: True heading angle relative to track centerline tangent (`car.relYaw`, radians)
- $d$: Lateral offset from centerline (`car.lateralOffset`, meters, positive = right)
- $s$: Spline progress (`0..1000` game-meters)

#### Geometric & Inertial Parameters (2026 F1 Spec)
- Wheelbase $L = l_f + l_r = 3.60\text{ m}$ ($l_f = 1.66\text{ m}$ CG-to-front-axle, $l_r = 1.94\text{ m}$ CG-to-rear-axle; 46% / 54% static weight distribution)
- Total instant mass $m(t) = m_{\text{dry}} + m_{\text{fuel}}(t)$ ($m_{\text{dry}} = 798\text{ kg}$)
- Yaw moment of inertia $I_z(t) = 1,120 + 0.45\,m_{\text{fuel}}(t)\;\text{kg}\cdot\text{m}^2$

#### Continuous Tire Slip Angles & Smooth Nonlinear Axle Forces
With front road-wheel steer angle $\delta$ (`car.steerAngleRad`, positive = steer right) and regularized speed $v_{x,\text{eff}} = \sqrt{v_x^2 + 3.0^2}$ (preventing $0/0$ near standstill without any `Math.max` slope kink):

$$\alpha_f = \delta - \arctan\!\left(\frac{v_y + l_f\,r}{v_{x,\text{eff}}}\right), \qquad \alpha_r = -\arctan\!\left(\frac{v_y - l_r\,r}{v_{x,\text{eff}}}\right)$$

Normal axle loads including longitudinal load transfer ($h_{\text{cg}} = 0.31\text{ m}$) and aero downforce split ($F_{\text{df},f}, F_{\text{df},r}$):

$$F_{zf} = m g \frac{l_r}{L} - m a_x \frac{h_{\text{cg}}}{L} + F_{\text{df},f}(v_x), \qquad F_{zr} = m g \frac{l_f}{L} + m a_x \frac{h_{\text{cg}}}{L} + F_{\text{df},r}(v_x)$$

Smooth Pacejka-inspired Magic-Formula lateral axle forces (strictly $C^\infty$ across grip peak and saturation—zero `Math.max(0, slipExcess)` kink!):

$$F_{y,i}(\alpha_i) = D_i \sin\!\Bigl(C \arctan\bigl(B_i \alpha_i - E(B_i \alpha_i - \arctan(B_i \alpha_i))\bigr)\Bigr), \qquad i \in \{f, r\}$$

where peak axle capacity $D_i = \mu_i F_{zi} \bigl(F_{zi} / F_{z0}\bigr)^{-0.08} \cdot \eta_{\text{ellipse},i}$ incorporates tire load sensitivity and longitudinal-lateral friction-circle coupling $\eta_{\text{ellipse},i} = \sqrt{\max\bigl(0.12,\, 1 - (F_{x,i} / (\mu_{\text{long},i} F_{zi}))^2\bigr)}$, with shape factors $C = 1.38$, $E = -0.35$ (gentle progressive F1 slick plateau rather than snap spin!), and normalized cornering stiffness $B_f = \frac{C_{\alpha f}}{C D_f} \approx 10.5$, $B_r = \frac{C_{\alpha r}}{C D_r} \approx 11.2$.

#### Continuous Tire-Patch Surface Blending (Eliminating Boolean Kerb/Grass Jumps)
Given tire contact width $w_{\text{tire}} = 0.36\text{ m}$, compute smooth surface weights on each left/right wheel lateral coordinate $d_w = d \pm 0.96\text{ m}$ using $C^1$ `smoothstep`:

$$w_{\text{kerb}}(d_w) = \operatorname{smoothstep}(W_h - 0.50,\, W_h - 0.14,\, |d_w|) \cdot \bigl(1 - \operatorname{smoothstep}(W_h + W_{\text{curb}} - 0.05,\, W_h + W_{\text{curb}} + 0.31,\, |d_w|)\bigr)$$

$$w_{\text{grass}}(d_w) = \operatorname{smoothstep}(W_h + W_{\text{curb}} - 0.05,\, W_h + W_{\text{curb}} + 0.35,\, |d_w|)$$

$$\mu_{\text{surface}}(d_w) = 1.0 - 0.07\,w_{\text{kerb}}(d_w) - 0.56\,w_{\text{grass}}(d_w)$$

And replace the discontinuous `curbApexHook` impulse with gentle physical kerb camber gravity $a_{y,\text{camber}} = -\operatorname{sign}(d)\,g\sin(3.5^\circ)\,w_{\text{kerb,avg}}$ ($\approx 0.60\text{ m/s}^2$ continuous force, not a velocity step!).

#### 240 Hz Semi-Implicit Yaw & Slip-Velocity Integration + Low-Speed Ackermann Blend
At high and medium speeds ($v_x \ge 8\text{ m/s}$), Newton-Euler equations in the rotating body frame give:

$$\dot{v}_y = \frac{F_{yf}\cos\delta + F_{yr}}{m(t)} - v_x\,r + a_{y,\text{camber}}$$

$$\dot{r} = \frac{l_f\,F_{yf}\cos\delta - l_r\,F_{yr} - c_{\text{yaw}}\,r}{I_z(t)}$$

where gentle aerodynamic/stability yaw damping $c_{\text{yaw}} = 950 + 3.2\,v_x^2\;\text{N}\cdot\text{m}\cdot\text{s/rad}$ gives crisp, non-oscillatory chicane transitions on gamepad, touch, and keyboard without ever feeling numb.

To guarantee unconditional stability at `0..25 km/h` (standing start / pit box), smoothly blend with exact kinematic Ackermann yaw rate $r_{\text{kin}} = \frac{v_x}{L}\tan\delta$, $v_{y,\text{kin}} = l_r\,r_{\text{kin}}$ via $w_{\text{dyn}} = \operatorname{smoothstep}(2.0,\, 8.5,\, v_x)$:

$$v_y(t + \Delta t) = w_{\text{dyn}}\bigl(v_y + \dot{v}_y\,\Delta t\bigr) + (1 - w_{\text{dyn}})\,v_{y,\text{kin}}$$

$$r(t + \Delta t) = w_{\text{dyn}}\bigl(r + \dot{r}\,\Delta t\bigr) + (1 - w_{\text{dyn}})\,r_{\text{kin}}$$

#### Exact Curvilinear Frenet Progression (Fixing Tight Hairpins vs. Sweepers)
Advance track progress $s$, lateral offset $d$, and relative heading $\Delta\psi$ (`car.relYaw`) simultaneously via exact Frenet kinematics:

$$J(s, d) = \max\bigl(0.35,\; 1 - \kappa_{\text{real}}(s)\cdot d\bigr)$$

$$\dot{s}_{\text{real}} = \frac{v_x\cos\Delta\psi - v_y\sin\Delta\psi}{J(s, d)}, \qquad \dot{d} = v_x\sin\Delta\psi + v_y\cos\Delta\psi$$

$$\frac{d(\Delta\psi)}{dt} = r - \kappa_{\text{real}}(s)\,\dot{s}_{\text{real}}$$

**Why this completely transforms cornering feel:**
1. **Steady-State Body Slip Angle $\beta = \arctan(v_y / v_x)$ Is Real:** In a corner, $\dot{d} = 0 \implies \Delta\psi = -\beta \ne 0$! The nose visibly points `2°–6°` into the apex while the rear tires work at their slip angle, giving natural visual rotation instead of crabbing flat along the track tangent!
2. **True Hairpin Inside Radius Geometry:** On the inside of an $R = 18\text{ m}$ hairpin ($d = +7.5\text{ m}$, $\kappa_{\text{real}} = +0.0556\text{ m}^{-1}$), $J = 1 - 0.0556(7.5) = 0.583$, advancing angularly around the tight inside apex at the **exact geometric rate** instead of hitting the `0.78` clamp!
3. **Zero Gain-Switching Jerk:** Every function ($F_{yf}, F_{yr}, w_{\text{dyn}}, w_{\text{kerb}}, J$) is continuously differentiable ($C^1/C^\infty$). Also replace the step-rate in `src/controls.js:1455, 1466` with smooth $r_{\text{steer}}(|\text{steer}|) = 15.0 - 5.5\cdot\operatorname{smoothstep}(0.15, 0.55, |\text{steer}|)$.

---

### 1.4 240 Hz Render-Alpha Interpolation & Chase-Cam Fix (`src/main.js` & `src/models.js`)

1. **Snapshot Previous 240 Hz Pose & Interpolate by $\alpha_{\text{render}}$ (`src/main.js:2250–2260`):**
   Before each `stepVehiclePhysics240Hz` sub-step, store `car._prevS = car.s`, `car._prevLat = car.lateralOffset`, `car._prevRelYaw = car.relYaw`, `car._prevPitch = car.chassisPitchRad`, `car._prevRoll = car.chassisRollRad`. After the `while (this.physicsAccumulator >= PHYSICS_DT)` loop finishes, compute:

   $$\alpha_{\text{render}} = \operatorname{clamp}\!\left(\frac{\text{physicsAccumulator}}{\text{PHYSICS\_DT}},\, 0,\, 1\right)$$

   and render every car + camera at `sRender = wrapDeltaInterp(car._prevS, car.s, alpha)`, `latRender = lerp(car._prevLat, car.lateralOffset, alpha)`, `yawRender = lerp(car._prevRelYaw, car.relYaw, alpha)`. This eliminates 100% of `3-vs-4` sub-step frame aliasing!

2. **Fix Chase-Cam `lookAhead` Unit Bug & Time-Invariant Damping (`src/main.js:3086–3105`):**
   - Convert `lookAhead` (`22.0 m` real) to **game-meters** when sampling the spline:
     ```js
     const mPerG = this.track.realMetersPerGameMeter || 4.36;
     const lookAheadFr = this.track.sampleAt(
       this.playerCar.s + lookAhead / mPerG,
       this.playerCar.lateralOffset
     );
     ```
   - With true curvature $\kappa_{\text{real}} \in [-0.085, +0.085]\;\text{m}^{-1}$, compute smooth apex look offset `curveHint = Math.tanh(lookAheadFr.curvatureReal * 24.0) * 1.15` (no hard `±1.2` corner clamp!).
   - Blend camera forward axis `28%` toward the car's actual body heading (`pFr.tangent` rotated by `0.28 * car.relYaw`) so the camera subtly feels chassis slip angle without oscillating, and replace `Math.min(1, dt * 16.5)` with **frame-rate-invariant exponential decay**:

     $$\lambda(\Delta t, k) = 1 - e^{-k\,\Delta t} \qquad (k_{\text{pos}} = 16.5\text{ s}^{-1},\; k_{\text{look}} = 19.0\text{ s}^{-1})$$

   - Remove the duplicate tilt assignment in `src/models.js:1875–1877` so `physics.js`'s 2nd-order damped suspension spring (`chassisPitchRad`, `chassisRollRad`) is the single authoritative source.

---

## Pillar 2: Fixing Auto-Braking & Minimum Brake Assist Using Real Corner Physics

### 2.1 Audit of Why Current Brake Assist Defaults to a Constant Percentage

Our audit uncovered **two separate brake-assist implementations** in the codebase whose interaction directly produces the exact defect reported by the user:

1. **Dead Code in `src/physics.js:397–415, 820–859`:**
   `stepVehiclePhysics240Hz` checks `car.brakingAssist || ctx.brakingAssist || ctx.controls?.brakingAssist`. However, `src/main.js:2633–2644` constructs `physCtx` with `{ mode, weather, vscActive, isQualifying, wearFuelMult, allCars, callbacks }`—**never passing `controls` or `brakingAssist`!** Thus `brakingAssistMode` in `physics.js` always evaluates to `'OFF'`.
2. **Active Buggy Assist in `src/controls.js:967–1014` (`_computeDrivingAssists`):**
   `ErgonomicControls.update()` runs every render frame and injects `this.brake = Math.max(manualBrake, assistBrake)` (`controls.js:1561`). Look at lines `978–995`:
   ```js
   // src/controls.js:978-995
   const distsM = [0, 22, 46, 74];
   ...
   if (peakCurv >= 0.0026) {
     const safeSpeedKmh = clamp(296.0 / Math.sqrt(1.0 + peakCurv * 255.0), 108.0, 315.0);
     const margin = assistMode === 'LOW' ? 24.0 : (assistMode === 'MEDIUM' ? 10.0 : 0.0);
     const maxStrength = assistMode === 'LOW' ? 0.38 : (assistMode === 'MEDIUM' ? 0.68 : 0.90);
     const overspeed = playerCar.speedKmh - (safeSpeedKmh + margin);
     if (overspeed > 0) {
       assistBrake = clamp((overspeed / 42.0) * maxStrength, 0.0, maxStrength);
   ```
   **Four compounding physics failures occur right here:**
   - **$82\times$ Curvature Scale Mismatch:** `track.getPhysicsCurvature()` returns curvature already multiplied by `82.0` (`0.018..0.95`), yet `peakCurv * 255.0` multiplies it by `255` *again* (`82 * 255 = 20,910`!). Even on a **gentle flat-out highway bend** of radius $R = 2,800\text{ m}$ (`peakCurv = 0.029`), `296 / sqrt(1 + 0.029 * 255) = 102.2` $\to$ **clamped to the `108.0 km/h` floor!**
   - **Constant Percentage Saturation (`38% / 68% / 90%`):** Because `safeSpeedKmh` is stuck at `108.0 km/h` for *every* non-zero curve on the circuit, whenever the player exceeds `174 km/h` (`108 + 24 + 42`), `assistBrake` pins solidly at **`maxStrength = 0.38` (`38%`) in `LOW`**, **`0.68` (`68%`) in `MEDIUM`**, or **`0.90` (`90%`) in `HIGH`**—literally defaulting to a flat percentage and dragging speed down on gradual flat-out turns!
   - **Zero Kinematic Distance Law (`d_req` Missing):** `controls.js` compares current speed directly against `safeSpeedKmh` up to `74 m` early without computing $d_{\text{req}} = (v^2 - v_{\max}^2)/(2a)$, braking way too early for medium bends while `74 m` is *too short* to stop from `330 km/h` (`91.7 m/s`) to a `75 km/h` (`20.8 m/s`) hairpin ($d_{\text{req}} \approx 92\text{ m}$ dry, $155\text{ m}$ wet)!
   - **Zero Turn-Deflection Angle ($\Delta\theta$) Awareness:** A $10^\circ$ chicane kink or highway bend can be straight-lined across the `16.8 m` track width at `330 km/h`, whereas a $165^\circ$ hairpin cannot. Pointwise curvature alone cannot tell them apart!

> [!IMPORTANT]
> **Architectural Rule:** Delete the duplicate brake-assist calculation in `src/controls.js:971–1001` completely so `controls.js` passes pure player `manualThrottle` and `manualBrake` inputs, pass `brakingAssist` cleanly in `physCtx` from `src/main.js:2633`, and run the single authoritative **240 Hz Real Corner-Physics Forward Scanner** inside `src/physics.js` (also normalizing legacy settings `'LOW' -> 'MIN'`, `'MEDIUM' | 'HIGH' -> 'FULL'` while updating `index.html:252–256` to `OFF | MIN | FULL`).

---

### 2.2 Exact Forward Corner Scanner (`5 m .. 180 m` Ahead) & Racing-Line Physics

At 240 Hz (for the single player car, 45 LUT curvature reads take $< 3\,\mu\text{s}$), scan forward distances $d_j = 5 + 4j\;\text{m}$ for $j = 0, 1, \dots, 44$ ($d \in [5\text{ m},\, 181\text{ m}]$, plus $d_{-1} = 0\text{ m}$ at the front axle):

#### Step 1 — Contiguous Corner Segmentation & Turn Deflection Angle $\Delta\theta$
Group contiguous forward samples where $|\kappa_{\text{real}}(d_j)| \ge \kappa_{\min}$ ($\kappa_{\min} = 0.0020\;\text{m}^{-1}$, corresponding to $R_{\text{center}} \le 500\text{ m}$) with consistent sign into discrete **Corner Zones** $Z_m = [d_{\text{in},m},\, d_{\text{out},m}]$ (bridging single-sample gaps $\le 8\text{ m}$ of same sign):

1. **Peak Centerline Curvature & True Centerline Radius:**
   $$\kappa_{\text{peak},m} = \max_{d_j \in Z_m} |\kappa_{\text{real}}(d_j)|, \qquad R_{\text{center},m} = \frac{1}{\kappa_{\text{peak},m}}, \qquad d_{\text{apex},m} = \arg\max_{d_j \in Z_m} |\kappa_{\text{real}}(d_j)|$$

2. **Total Corner Deflection Angle $\Delta\theta_m$ (in radians):**
   $$\Delta\theta_m = \left|\sum_{d_j \in Z_m} \kappa_{\text{real}}(d_j)\,\Delta d\right|$$
   *(Note: If the car is already inside the corner zone, $d_{\text{in},m} = 0$, integrate $\Delta\theta_{\text{rem},m}$ from $d = 0$ to $d_{\text{out},m}$ so the required turn deflection naturally shrinks to $0$ as the car passes the apex and unwinds toward corner exit!)*

#### Step 2 — Effective Racing-Line Radius $R_{\text{eff},m}$ (Tight Hairpins vs. Gradual Turns)
A racing car does not follow the painted centerline on shallow bends: it uses usable road width $W_{\text{usable}}$ to maximize arc radius (outside $\to$ inside apex $\to$ outside). Given `ROAD_HALF_WIDTH = 8.4 m` and car half-width margin `1.9 m`, baseline full-width excursion is $W_{\text{full}} = 2(8.4 - 1.9) = 13.0\text{ m}$, modulated slightly if the car is already committed to the inside lane at short range ($d_{\text{in},m} < 35\text{ m}$):

$$W_{\text{eff},m} = \operatorname{clamp}\!\Bigl(13.0 - 0.55\max\bigl(0,\, \operatorname{sign}(\kappa_{\text{apex},m})\cdot d_{\text{car}}\bigr)\cdot\bigl(1 - \operatorname{clamp}(d_{\text{in},m}/35, 0, 1)\bigr),\; 4.5,\; 13.0\Bigr)$$

By exact circular chord-sagitta geometry through deflection angle $\Delta\theta_m$, the **true racing-line apex radius** is:

$$R_{\text{eff},m} = R_{\text{center},m} + \frac{W_{\text{eff},m}}{\max\bigl(0.004,\; 1 - \cos(\min(\pi,\, \Delta\theta_m) / 2)\bigr)}$$

#### Step 3 — Aero-Augmented Cornering Speed Limit $v_{\max}(s)$
Balancing centrifugal demand $\frac{m v^2}{R_{\text{eff},m}}$ against tire lateral grip $\mu_{\text{tire}}\bigl(m g + F_{\text{downforce}}(v)\bigr)$ where $F_{\text{downforce}}(v) = k_L v^2$ ($k_L = \frac{1}{2}\rho C_L A \cdot \eta_{\text{aero\_dmg}}$):

$$v_{\max}(s_m) = \sqrt{\mu_{\text{tire}}\left(g + \frac{F_{\text{downforce}}(v_{\max})}{m(t)}\right) R_{\text{eff},m}}$$

Solving explicitly for $v_{\max}(s_m)$ in closed form (with $\gamma_m = \mu_{\text{tire}} \frac{k_L}{m(t)} R_{\text{eff},m}$):

$$v_{\max}(s_m) = \begin{cases} v_{\text{aeroTop}}, & \text{if } \gamma_m \ge 0.96 \quad \text{(Aero-locked flat-out corner!)}, \\[8pt] \min\!\left(v_{\text{aeroTop}},\; \sqrt{\dfrac{\mu_{\text{tire}}\,g\,R_{\text{eff},m}}{1 - \gamma_m}}\right), & \text{if } \gamma_m < 0.96. \end{cases}$$

#### Step 4 — Kinematic & Aero-Assisted Braking Distance $d_{\text{req}}(s_m)$
With mean squared speed $v_{\text{rms}}^2 = \frac{1}{2}\bigl(v^2 + v_{\max}(s_m)^2\bigr)$ over the braking zone, effective threshold deceleration (tire friction on gravity + aero downforce + parasitic drag $k_D v^2$) is:

$$a_{\text{brake},m} = \mu_{\text{long}}\left(g + \frac{k_L\,v_{\text{rms}}^2}{m(t)}\right) + \frac{k_D\,v_{\text{rms}}^2}{m(t)}$$

And the exact required braking distance to hit $v_{\max}(s_m)$ cleanly by the effective brake-completion point $d_{\text{target},m} = \max\bigl(0,\, d_{\text{apex},m} - 0.18(d_{\text{apex},m} - d_{\text{in},m})\bigr)$ is:

$$d_{\text{req},m} = \max\!\left(0,\; \frac{v^2 - v_{\max}(s_m)^2}{2\,a_{\text{brake},m}}\right)$$

#### Numerical Proof Across Real Turn Geometries (Dry Slicks: $\mu_{\text{lat}} = 1.72$, $\mu_{\text{long}} = 1.65$, $m = 830\text{ kg}$, $k_L = 3.75$, $v_0 = 324\text{ km/h} = 90\text{ m/s}$)

| Corner Type | $R_{\text{center}}$ | Turn Angle $\Delta\theta$ | $R_{\text{eff}}$ (Racing Line) | $v_{\max}$ Limit | $d_{\text{req}}$ from $324\text{ km/h}$ | `MIN` Assist Action | `FULL` Assist Action |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| **Highway Kink** | $110\text{ m}$ | $9^\circ$ ($0.16\text{ rad}$) | $3,360\text{ m}$ | **$330\text{ km/h}$ (Flat)** | **$0.0\text{ m}$** | `0%` brake, `100%` gas | `0%` brake, `100%` gas |
| **Gradual Sweeper** | $135\text{ m}$ | $26^\circ$ ($0.45\text{ rad}$) | $643\text{ m}$ | **$330\text{ km/h}$ (Flat)** | **$0.0\text{ m}$** | `0%` brake, `100%` gas | `0%` brake, `100%` gas |
| **Fast Aero (130R / Copse)** | $105\text{ m}$ | $68^\circ$ ($1.19\text{ rad}$) | $180.4\text{ m}$ | **$284\text{ km/h}$** | **$16.8\text{ m}$** | `0%` (ignored: gradual/high-$v_{\max}$) | Gentle lift / `28%` brush at `18 m` |
| **Medium $90^\circ$ Bend** | $44\text{ m}$ | $90^\circ$ ($1.57\text{ rad}$) | $88.4\text{ m}$ | **$171\text{ km/h}$** | **$64.2\text{ m}$** | `0%` unless player misses brake inside `57.8 m` at `>188 km/h` (max `28%`) | Smooth `88%` threshold at `66 m` $\to$ trail-brake to apex |
| **Tight Fuji Hairpin** | $20\text{ m}$ | $165^\circ$ ($2.88\text{ rad}$) | $34.9\text{ m}$ | **$101\text{ km/h}$** | **$85.4\text{ m}$** | Late `25–28%` safety cushion ONLY inside `76.9 m` if $v > 111\text{ km/h}$ & unbraked | Smooth `92%` threshold at `88 m` $\to$ trail-brake to `101 km/h` |
| **Monaco Loews Hairpin** | $12\text{ m}$ | $180^\circ$ ($3.14\text{ rad}$) | $25.0\text{ m}$ | **$83\text{ km/h}$** | **$89.6\text{ m}$** | Late `28%` safety cushion ONLY inside `80.6 m` if $v > 91\text{ km/h}$ & unbraked | Smooth `92%` threshold at `92 m` $\to$ trail-brake to `83 km/h` |

---

### 2.3 Exact Assist Mode Definitions: `OFF`, `MIN`, and `FULL`

Select the most urgent forward corner $m^* = \arg\max_m \bigl(d_{\text{req},m} - d_{\text{target},m}\bigr)$.

#### Mode 1: `OFF`
- `effThrottleIn = manualThrottle`, `effBrakeIn = manualBrake`. Zero intervention under all conditions.

#### Mode 2: `MIN` (Minimum Safety-Net Brake Assist — Strictly Non-Intrusive)
Designed specifically around the user's requirement: *"Minimum brake assistance should only have very minor affect only when brakes are needed. It should not keep speed down."*

1. **Hard Exclusions (100% Zero Effect on Straights, Sweepers & Corner Exits):**
   `assistBrake = 0` and `effThrottleIn = manualThrottle` unconditionally whenever ANY of the following holds:
   - No corner zone ahead, OR $\Delta\theta_{m^*} < 32^\circ$ ($0.56\text{ rad}$, gradual turn/kink), OR $v_{\max,m^*} > 245\text{ km/h}$ ($68.0\text{ m/s}$, fast aero sweeper).
   - Car has already reached/passed the apex ($d_{\text{target},m^*} < 2.5\text{ m}$ and $|\kappa_{\text{real}}(0)|$ is decreasing — **never drags speed on corner exit!**).
   - Current speed is within $+10\%$ of true corner speed: $v \le 1.10\,v_{\max,m^*}$.
   - Remaining distance to target is still outside $90\%$ of required braking distance: $d_{\text{target},m^*} > 0.90\,d_{\text{req},m^*}$ (gives the player full freedom to brake late on their own!).

2. **Subtle `25%–30%` Late Safety Cushion When Both Gates Trigger ($v > 1.10\,v_{\max}$ AND $d_{\text{target}} \le 0.90\,d_{\text{req}}$):**
   $$u_v = \operatorname{clamp}\!\left(\frac{v - 1.10\,v_{\max,m^*}}{0.20\,v_{\max,m^*}},\; 0,\; 1\right), \qquad u_d = \operatorname{clamp}\!\left(\frac{0.90\,d_{\text{req},m^*} - d_{\text{target},m^*}}{0.22\,d_{\text{req},m^*} + 3.5},\; 0,\; 1\right)$$
   $$b_{\text{MIN}} = 0.28 \cdot \operatorname{smoothstep}(0, 1, u_v) \cdot \operatorname{smoothstep}(0, 1, u_d) \qquad \bigl(\text{strict ceiling: } \mathbf{b_{\text{MIN}} \le 0.28 = 28\%}\bigr)$$
   - **Pedal Mixing:** `effBrakeIn = Math.max(manualBrake, b_MIN)`. If the player is already pressing the brake $\ge 28\%$, `MIN` adds **zero** additional force.
   - **Zero Throttle Holding:** `effThrottleIn = manualThrottle` is **never** reduced on straights, sweepers, mid-corner maintenance throttle, or exits. Only during an active unbraked overshoot (`b_MIN > 0.15` while `manualBrake < 0.05`) does engine torque gently yield by `1 - 0.35 * b_MIN` ($\ge 90\%$ throttle authority preserved!) so the `28%` safety net isn't completely cancelled by full ERS power, restoring `100%` throttle the instant $v \le 1.10\,v_{\max}$!

#### Mode 3: `FULL` (Smooth Threshold-to-Trail-Braking Envelope)
Designed for accessibility / one-handed touch play while driving like a real pro racing instructor rather than a dumb speed cap:

1. **Progressive Threshold Entry:** Activates when $v > v_{\max,m^*} + 0.8\text{ m/s}$ and $d_{\text{target},m^*} \le 1.04\,d_{\text{req},m^*}$. Computes exact instantaneous deceleration demand:
   $$a_{\text{needed}} = \frac{v^2 - v_{\max,m^*}^2}{2\,\max(3.5,\, d_{\text{target},m^*})}, \qquad r_{\text{decel}} = \frac{a_{\text{needed}}}{a_{\text{brake},m^*}}$$
   $$b_{\text{req}} = \operatorname{clamp}\!\bigl(\operatorname{smoothstep}(0.72,\, 1.08,\, r_{\text{decel}}) \cdot 0.92,\; 0,\; 0.92\bigr)$$

2. **Authentic Friction-Circle Trail-Braking Taper:** As the player turns into the corner and lateral acceleration $|a_y|$ rises toward tire limit $a_{y,\max} = \mu_{\text{lat}}(g + k_L v^2 / m)$, `FULL` progressively bleeds off brake pressure along the tire friction ellipse so the front axle never washes out:
   $$b_{\text{trail\_cap}} = 0.92 \sqrt{\max\!\left(0.08,\; 1 - 0.82\left(\frac{|a_y|}{a_{y,\max}}\right)^2\right)}, \qquad b_{\text{FULL}} = \min(b_{\text{req}},\, b_{\text{trail\_cap}})$$

3. **Crisp Apex Release:** `effBrakeIn = Math.max(manualBrake, b_FULL)`, and `effThrottleIn = manualThrottle * clamp(1.0 - b_FULL * 1.65, 0.0, 1.0)`. The instant $v \le 1.015\,v_{\max,m^*}$ or the car passes the apex ($d_{\text{target},m^*} \le 1.5\text{ m}$), $b_{\text{FULL}} \to 0$ cleanly so full corner-exit throttle is immediately available.

---

## Pillar 3: Real Car Science (Aero, Tires, Fuel Mass, Damage) & Competitive AI

### 3.1 Real Car Science Audit & Physics Formulations (Deep Simulation + High Fun Factor)

#### 1. Fuel Mass Physics (`kg` Coupling into Braking, Acceleration, Cornering & Tire Wear)
- **Audit Gap (`src/physics.js:785–793, 892, 931, 1136–1143`):** Currently `fuelMassMult = 1 / (1 + fuelLaps * 0.004)` (~`2.8%` longitudinal scaling for 7 laps) is completely omitted from cornering lateral dynamics (`1136–1143`) and vertical tire loads (`520–525`).
- **Exact Formulation:** Map `car.fuelLaps` to physical fuel mass $m_{\text{fuel}}(t)$ so a full race tank carries ~`75–100 kg` ($m_{\text{dry}} = 798\text{ kg}$, `kgPerLap = clamp(85.0 / maxFuelLaps, 1.7, 8.5)` scaled to session length so short 5–10 lap arcade-sim races feel genuine full-to-light weight evolution!):
  $$m(t) = m_{\text{dry}} + m_{\text{fuel}}(t), \qquad \eta_{\text{mass}}(t) = \frac{m_{\text{ref}}}{m(t)} \quad (m_{\text{ref}} = 812\text{ kg qualifying weight})$$
  - **Longitudinal Drive & Braking:** $a_x = F_x / m(t)$ ($\sim 9\text{–}10\%$ heavier at race start $\implies$ $+7\text{ m}$ longer braking zone into Turn 1 on Lap 1!).
  - **Cornering Tire Load Sensitivity:** Because racing slick friction coefficient decreases slightly with vertical load ($\mu(F_z) = \mu_0 (F_z / F_{z0})^{-0.08}$), increasing mass $m$ without increasing aero downforce $F_{\text{df}}$ lowers peak lateral acceleration:
    $$a_{y,\max}(m) = \mu_0 \left(\frac{m g + F_{\text{df}}}{m_{\text{ref}} g + F_{\text{df}}}\right)^{-0.08} \left(g + \frac{F_{\text{df}}}{m}\right)$$
  - **Gameplay Payoff:** Early laps feel noticeably heavier under Turn 1 braking; burning down to `< 2 laps` of fuel unlocks visceral Qualifying/Overcut purple-sector agility (`~0.30s–0.45s/lap` faster!), making short-fuel 2-stop sprints a genuinely viable race-winning tactic!

#### 2. Front-Wing Damage (High-Speed Aero Understeer + Vortex Drag)
- **Audit Gap (`src/physics.js:780, 1098`):** `frontWing` damage (`0..1`) reduces `frontAeroEff` by `40%` above `150 km/h` (`L1098`), **but adds zero straight-line drag (`L780`)** and doesn't decouple front vs. rear axle downforce!
- **Exact Formulation:** Let $d_{\text{fw}} \in [0, 1]$ (`car.damage.frontWing`):
  - **Front Axle Downforce Loss:** $F_{\text{df},f}(v) = k_{Lf}\,(1 - 0.52\,d_{\text{fw}})\,v^2$, while rear downforce $F_{\text{df},r}(v)$ remains intact (save ~`8%` front-wake disturbance).
  - **Speed-Squared High-Speed Understeer:** At slow hairpins ($75\text{ km/h}$, mechanical grip dominant), the car still turns in decently (`>90%` grip) so it remains **fun and driveable back to the pits**; in `240+ km/h` sweepers (130R, Maggotts), missing front downforce causes progressive, unmistakable front-axle push ($\alpha_f$ saturates early while rear stays planted) + pneumatic-trail SAT lightening in the steering wheel!
  - **Torn Endplate Vortex Drag:** Increases drag coefficient $k_D \leftarrow k_D (1 + 0.09\,d_{\text{fw}})$, costing up to **`-8.5 km/h`** on long straights (`aeroTopKmh -= d_fw * 8.5`).

#### 3. Rear-Wing / Diffuser Damage (High-Speed Entry Oversteer + Functional DRS Loss)
- **Audit Gap (`src/physics.js:773, 862–873, 1122–1124` & `src/models.js:2055`):** Subtracts `22 km/h` from top speed and injects a synthetic `Math.sin(nowMs * 0.024)` twitch under braking, **but never reduces rear cornering downforce and still grants full `car.drsActive` physics speed boost (`physics.js:862`) even when `models.js:2055` hides the broken flap!**
- **Exact Formulation:** Let $d_{\text{rw}} \in [0, 1]$ (`car.damage.rearWing`):
  - **Rear Axle Downforce Loss:** $F_{\text{df},r}(v) = k_{Lr}\,(1 - 0.56\,d_{\text{rw}})\,v^2$. Under high-speed braking and fast turn-in (`> 180 km/h`), forward pitch load transfer + lost rear aero makes $F_{zr}$ light, producing thrilling, **catchable high-speed oversteer** (backed by counter-steer `selfAligningTorque` catch cues rather than an artificial sine wave!).
  - **Functional DRS Jam / Disable (`src/physics.js:862`):** Require `(car.damage?.rearWing || 0) < 0.35` inside `car.drsActive` AND scale `modDrsBonusKmh` to `0` when $d_{\text{rw}} \ge 0.35$ (jammed actuator / broken flap!).
  - **Diffuser/Beam-Wing Drag Penalty:** `rearWingLossKmh = d_rw * 18.0`.

#### 4. Suspension Damage (Bent Toe Alignment Pull + Ride-Height Venturi Loss + Kerb Instability)
- **Audit Gap (`src/physics.js:632, 1118–1120`):** Only adds a tiny constant lateral drift and extra wear on one tire; zero Venturi floor ride-height loss or kerb bump asymmetry.
- **Exact Formulation:** Let $d_{\text{susp}} \in [0, 1]$, bias $b_s \in \{-1, +1\}$ (`damagedCorner`):
  - **Bent Toe-Link Alignment Torque:** Feeds into `selfAligningTorque` (`+0.22 * d_susp * b_s`) and adds a mild toe-drag penalty (`-5.5 * d_susp km/h`) plus `1.45x` scrub heating/wear on `damagedCorner`—the player feels the off-center steering rack without making straightaways frustratingly unplayable.
  - **Rake / Ride-Height Floor-Seal Loss:** Asymmetric corner droop compromises ground-effect Venturi suction, reducing total underfloor downforce by `1 - 0.24 * d_susp`.
  - **Kerb Bump Instability:** Riding a sawtooth kerb on the damaged corner amplifies roll impulse by `1 + 0.85 * d_susp`, rewarding the driver for staying off tall kerbs until pitting for `'FULL'` repair (`pit_damage_caution.js:420`).

#### 5. 4-Corner Axle-Split Tires, Graining vs. Blistering & Persistent Wheel Flat-Spots
- **Audit Gap (`src/physics.js:550–670`):** Averages all 4 tires equally (`sumLatMu * 0.25`), losing front-vs-rear thermal/wear balance, and never tracks **flat-spots** from brake lockups.
- **Exact Formulation:**
  - **Front vs. Rear Axle Grip Split:** Compute $\mu_f = \frac{1}{2}(\mu_{\text{FL}} + \mu_{\text{FR}})$ and $\mu_r = \frac{1}{2}(\mu_{\text{RL}} + \mu_{\text{RR}})$ separately! Aggressive rear wheelspin cooks $\mu_r$ $\to$ progressive corner-exit oversteer; diving too hot into corners cooks $\mu_f$ $\to$ progressive mid-corner understeer!
  - **Graining vs. Blistering:** Cold sliding ($T_{\text{surf}} < T_{\text{opt,min}}$ with high $|\alpha|$) builds reversible `t.graining` (`0..1`, up to `-7%` grip, clears over `~1.5 laps` of smooth driving once up to temp). Sustained core overheating ($T_{\text{core}} > 118^\circ\text{C}$) accumulates irreversible `t.blister` (`0..1`, up to `-14%` carcass grip + accelerated wear).
  - **Persistent Tire Flat-Spots (`t.flatSpot` in `[0..1]`):** When heavy braking (`effBrakeIn > 0.82` without `FULL` ABS) locks the unloaded inside front wheel ($F_{z,\text{inside}}$ lightened by roll + pitch transfer, wheel slip ratio $|\kappa_{\text{long}}| > 0.22$ at $v > 22\text{ m/s}$):
    $$\frac{d(\text{flatSpot}_i)}{dt} = 0.42\,\operatorname{clamp}\!\left(\frac{|\kappa_{\text{long},i}| - 0.22}{0.35},\, 0,\, 1\right)\left(\frac{v}{55}\right)$$
    **Tactile & Physics Consequence:**
    1. Generates speed-synchronous wheel-rotation vibration at exact physical wheel frequency $f_w = \frac{v}{2\pi R_{\text{wheel}}}$ ($R_{\text{wheel}} = 0.36\text{ m}$, so `0..40 Hz` harmonic thump in `selfAligningTorque`, controller rumble, and subtle `0.8 mm` cockpit heave!).
    2. Reduces that corner's peak $\mu_i$ by `1 - 0.11 * flatSpot` and lowers its lockup threshold by `15%` (making the flat-spotted patch want to "re-catch" under heavy braking—classic real-world F1 physics!), completely cured to `0.0` upon a fresh 4-tire pit stop (`pit_damage_caution.js:405–409`).

---

### 3.2 Competitive, Spatially Aware & Strategically Smart CPU AI (`src/ai.js` & `src/main.js`)

#### Audit of Why Current CPU AI Lacks Pace & Spatial Realism

| Defect in Current Code | Exact Location | Quantitative Impact on AI Competitiveness |
| :--- | :--- | :--- |
| **1. Straight & Sweeper Throttle Starvation + Blocked DRS** | `src/ai.js:382–384` | Whenever `\|speedDiff\| <= 2.2 km/h` (which happens constantly near target speed!), AI sets `throttleInput = absCurK < 0.08 ? 0.94 : 0.52`! `0.94` cuts straight-line power by `6%`, and `0.52` in flat-out sweepers (`absCurK >= 0.08`) dumps `48%` of engine power AND **disables AI DRS** (`physics.js:868` requires `effThrottleIn > 0.72`)! |
| **2. Missing Career R&D Constructor Scaling** | `src/main.js:1748–1778` | Player gets `career.getPhysicsModifiers()` (`+13.5 km/h` top speed, `+10%` power, `+11%` aero), while every AI rival spawns with `perfMods: null`! Upgraded player cars effortlessly blow past the entire field. |
| **3. Saturated `0.95` Curvature Blindness** | `src/ai.js:1226–1241` | `_cornerSpeedKmhForCurvature` reads clamped `0.95` curvature (`dryApexKmh ≈ 122 km/h`), over-estimating speed in `15 m` hairpins (washing wide) while under-driving `180 m` aero sweepers, and only looks `140 m` ahead (`ai.js:29`), short of wet braking zones (`160 m`). |
| **4. Discrete 13-Ray `1.2 m` Lane Snapping** | `src/ai.js:25–26, 211, 900–960` | Planner evaluates 13 discrete offsets (`-7.2, -6.0, ..., +7.2 m`) every `40 ms`. Switching winning ray steps `_aiDesiredLat` by `1.2 m` at once, causing visible lateral hesitation/weaving in packs. |
| **5. Hardcoded `'FILL'` Pit Fuel & Passive Battle Pace** | `src/ai.js:1246–1271, 1398` | `fuelToAdd: 'FILL'` loads heavy fuel even when a light-fuel sprint is optimal; `basePace` (`0.986..0.996` in `config.js:485`) + negative `aiSkillTierOffset` leaves front-runners `1–2%` off real physics limit inside the battle bubble. |

#### Exact AI Upgrades for Pace, Personality, Spatial Awareness & Pit Strategy

1. **Unleash Full `1.00` Straight/Sweeper Throttle & True Corner-Physics Speed Planner (`src/ai.js:356–385, 1226`):**
   - Replace `ai.js:383` (`0.94 / 0.52`) so whenever `speedDiff >= -1.0 km/h` (i.e. `targetSpeedKmh >= aeroTopKmh - 2` or accelerating out of an apex), AI applies **`car.throttleInput = tractionCap` (`1.0` on dry straights and flat-out sweepers!)**, immediately restoring `100%` straight-line acceleration and full AI DRS deployment!
   - Feed AI the **exact same analytical $R_{\text{eff}}(s)$ & aero-augmented $v_{\max}(s)$ solver** derived in Section 2.2 with `180 m` lookahead (`KINEMATIC_LOOKAHEAD_M = 180.0`), modulated cleanly by archetype limit usage (`0.985` for midfielders up to `1.005` for front-row Works contenders).

2. **Constructor Tier + Career R&D Progression Parity (`src/main.js:1756`):**
   - Assign realistic **Constructor Performance Tiers** (`perfMods`) to AI teams (`Front-Row Works` = `95–102%` of player's current season R&D level, `Upper Midfield` = `80–90%`, `Backmarkers` = `65–75%`), plus an explicit **AI Difficulty Scalar** (`ROOKIE 0.94` | `PRO 1.00` | `LEGEND 1.03`) in Settings so both newcomers and hardcore sim-racers get thrilling wheel-to-wheel fights throughout Career Mode.

3. **Continuous Parabolic Sub-Ray Interpolation & Minimum-Jerk Quintic Overtake Trajectories (`src/ai.js:950`):**
   - After scoring the 13 spatial rays $C_k = \text{cost}(d_k)$, fit a 3-point parabola through $(C_{k^*-1}, C_{k^*}, C_{k^*+1})$ to find the **continuous sub-ray minimum**:
     $$d^* = d_{k^*} + \frac{\Delta d_{\text{ray}}}{2} \cdot \frac{C_{k^*-1} - C_{k^*+1}}{C_{k^*-1} - 2C_{k^*} + C_{k^*+1} + 10^{-6}}$$
   - Commit overtaking / defensive lane changes along a $C^2$ quintic lateral spline $d_{\text{plan}}(\tau)$ over horizon $T_{\text{pass}} \in [1.1\text{ s},\, 1.8\text{ s}]$, and enforce **FIA Side-by-Side Racing Room** (`|dsReal| < 4.8 m` $\implies$ reserve `2.15 m` corridor for any car with front-axle overlap, preventing AI from chopping across the player's nose mid-apex while squeezing hard up to that boundary!).

4. **Distinct Archetype Personalities & Stint-Matched Pit Strategy (`src/ai.js:1296–1404`):**
   - **Archetype Signatures:**
     - `LATE_BRAKER`: `1.04x` braking deceleration target, dives down the inside corridor when within `0.45 s` (`12–28 m`) entering heavy braking zones (`DeltaTheta > 75°`), slightly higher front-inside flat-spot risk under pressure.
     - `APEX_TACTICIAN`: Prioritizes wide entry (`+0.8 m` late-apex line) for earlier throttle cutback (`switchback`), triggers clean-air undercut `1–2 laps` early.
     - `TIRE_WHISPERER`: Smooth slip-angle cap (`0.94x` peak slip $\implies$ `-18%` thermal wear), stretches stints for lightweight low-fuel overcuts.
     - `DEFENSIVE_WALL`: Claims inside defensive line early (`160 m` before heavy braking zone when rival is within `0.65 s` in slipstream, strictly obeying the **one-move defensive rule** so it never weaves on straights!).
   - **Smart Fuel & 2-Stop Sprint Strategy (`src/ai.js:1398`):** Replace hardcoded `fuelToAdd: 'FILL'` with exact stint fuel calculation:
     - If `stintLapsRemaining > 8` and `arch.id` is `LATE_BRAKER` or `APEX_TACTICIAN` on a high-wear track, split into an aggressive **light-fuel Soft/Soft 2-stop** (`fuelToAdd = Math.ceil(stintLapsRemaining * 0.52) + 0.6`), capitalizing on the new `kg` fuel-mass physics! Otherwise load exact `stintLapsRemaining * wearFuelMult + 0.45` laps instead of over-filling.

---

## Drop-In 240 Hz Reference Module Specifications

### Reference Snippet A — Forward Corner Scanner & `OFF | MIN | FULL` Brake Assist (`src/physics.js`)

```js
/**
 * 240 Hz Real Corner-Physics Forward Scanner (5m..180m) & Brake Assist
 * Replaces controls.js:_computeDrivingAssists and physics.js:820-859.
 */
export function computeCornerPhysicsBrakeAssist(car, track, rawMode, manualThrottle, manualBrake, params) {
  const mode = rawMode === 'LOW' ? 'MIN'
    : (rawMode === 'MEDIUM' || rawMode === 'HIGH' ? 'FULL' : rawMode);

  if (mode === 'OFF' || car.inPitLane || car.exploded || car.speedKmh < 55.0) {
    return { effThrottle: manualThrottle, effBrake: manualBrake, assistBrake: 0.0 };
  }

  const v = car.speedKmh / 3.6;
  const mPerG = Math.max(0.5, track.realMetersPerGameMeter || 4.36);
  const { massKg, muLat, muLong, kDownforce, kDrag, aeroTopMps, absLatAccelMps2 } = params;
  const g = 9.81;

  // 1. Scan 0..180m ahead at ds = 4.0m resolution using true unclamped curvature (1/m)
  const STEP_M = 4.0;
  const MAX_DIST_M = 180.0;
  const K_MIN = 0.0020; // R <= 500m
  const zones = [];
  let active = null;

  for (let d = 0.0; d <= MAX_DIST_M; d += STEP_M) {
    const sSample = (car.s + d / mPerG) % 1000;
    const kReal = track.getTrueCurvaturePerMeter(sSample); // Exact signed 1/m (unclamped!)
    const absK = Math.abs(kReal);
    const signK = kReal >= 0 ? 1 : -1;

    if (absK >= K_MIN) {
      if (!active || active.sign !== signK) {
        if (active) zones.push(active);
        active = { sign: signK, dIn: d, dOut: d, dApex: d, kPeak: absK, deltaTheta: absK * STEP_M };
      } else {
        active.dOut = d;
        active.deltaTheta += absK * STEP_M;
        if (absK > active.kPeak) {
          active.kPeak = absK;
          active.dApex = d;
        }
      }
    } else if (active && (d - active.dOut) > 8.0) {
      zones.push(active);
      active = null;
    }
  }
  if (active) zones.push(active);
  if (zones.length === 0) {
    return { effThrottle: manualThrottle, effBrake: manualBrake, assistBrake: 0.0 };
  }

  // 2. Evaluate R_eff, aero-augmented v_max(s), and kinematic d_req(s) per real corner zone
  let bestUrgency = -Infinity;
  let crit = null;

  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const rCenter = 1.0 / z.kPeak;
    const insideCommit = Math.max(0.0, z.sign * car.lateralOffset) * (1.0 - Math.min(1.0, z.dIn / 35.0));
    const wEff = Math.max(4.5, Math.min(13.0, 13.0 - 0.55 * insideCommit));
    const sagittaDenom = Math.max(0.004, 1.0 - Math.cos(Math.min(Math.PI, z.deltaTheta) * 0.5));
    const rEff = rCenter + wEff / sagittaDenom;

    // Aero-augmented cornering limit: v_max = sqrt(mu_lat * g * R_eff / (1 - mu_lat*(k_L/m)*R_eff))
    const aeroLock = muLat * (kDownforce / massKg) * rEff;
    const vMax = aeroLock >= 0.96
      ? aeroTopMps
      : Math.min(aeroTopMps, Math.sqrt((muLat * g * rEff) / (1.0 - aeroLock)));

    if (v <= vMax) continue;

    const vRms2 = 0.5 * (v * v + vMax * vMax);
    const aBrakeEff = muLong * (g + (kDownforce * vRms2) / massKg) + (kDrag * vRms2) / massKg;
    const dReq = Math.max(0.0, (v * v - vMax * vMax) / (2.0 * aBrakeEff));
    const dTarget = Math.max(0.0, z.dApex - 0.18 * (z.dApex - z.dIn));
    const urgency = dReq - dTarget;

    if (urgency > bestUrgency) {
      bestUrgency = urgency;
      crit = { ...z, rEff, vMax, aBrakeEff, dReq, dTarget };
    }
  }

  if (!crit) {
    return { effThrottle: manualThrottle, effBrake: manualBrake, assistBrake: 0.0 };
  }

  const smooth01 = (x) => {
    const t = Math.max(0.0, Math.min(1.0, x));
    return t * t * (3.0 - 2.0 * t);
  };

  // 3A. MINIMUM BRAKE ASSIST ('MIN'):
  // Zero speed-holding, ignores gradual turns (<32 deg or vMax > 245 km/h),
  // fires ONLY when v > 1.10 * vMax AND dTarget <= 0.90 * dReq, capped strictly at 28%!
  if (mode === 'MIN') {
    const isGradualOrFast = crit.deltaTheta < 0.56 || crit.vMax > (245.0 / 3.6);
    const pastApex = crit.dTarget < 2.5 && crit.dIn === 0.0;
    if (isGradualOrFast || pastApex || v <= 1.10 * crit.vMax || crit.dTarget > 0.90 * crit.dReq) {
      return { effThrottle: manualThrottle, effBrake: manualBrake, assistBrake: 0.0 };
    }

    const uSpeed = smooth01((v - 1.10 * crit.vMax) / (0.20 * crit.vMax));
    const uDist = smooth01((0.90 * crit.dReq - crit.dTarget) / (0.22 * crit.dReq + 3.5));
    const assistBrake = 0.28 * uSpeed * uDist; // Strictly <= 0.28 (28%)
    const effBrake = Math.max(manualBrake, assistBrake);
    // Never hold speed down; only soften full-gas brake fighting slightly if player hasn't touched brake
    const effThrottle = (assistBrake > 0.15 && manualBrake < 0.05)
      ? manualThrottle * (1.0 - 0.35 * assistBrake)
      : manualThrottle;
    return { effThrottle, effBrake, assistBrake };
  }

  // 3B. FULL BRAKE ASSIST ('FULL'):
  // Smooth threshold entry -> friction-ellipse trail-braking -> crisp apex release
  if (crit.dTarget <= 1.5 || v <= 1.015 * crit.vMax || crit.dTarget > 1.04 * crit.dReq) {
    return { effThrottle: manualThrottle, effBrake: manualBrake, assistBrake: 0.0 };
  }

  const aNeeded = (v * v - crit.vMax * crit.vMax) / (2.0 * Math.max(3.5, crit.dTarget));
  const bReq = smooth01((aNeeded / crit.aBrakeEff - 0.72) / 0.36) * 0.92;
  const ayMax = Math.max(4.0, muLat * (g + (kDownforce * v * v) / massKg));
  const latRatio = Math.min(1.0, absLatAccelMps2 / ayMax);
  const bTrailCap = 0.92 * Math.sqrt(Math.max(0.08, 1.0 - 0.82 * latRatio * latRatio));
  const assistBrake = Math.min(bReq, bTrailCap);

  const effBrake = Math.max(manualBrake, assistBrake);
  const effThrottle = manualThrottle * Math.max(0.0, Math.min(1.0, 1.0 - assistBrake * 1.65));
  return { effThrottle, effBrake, assistBrake };
}
```

---

## Implementation Checklist for Downstream Engineering Agents

1. **`src/track.js`:**
   - Replace `getSpacedPoints(2000)` linear chord `lerpVectors` (`L428, 572–606`) with the **Periodic $C^2$ Cubic Spline + 8,192-entry Arc-Length LUT** and unified quintic pit-straight blend.
   - Expose `getTrueCurvaturePerMeter(s)` returning **unclamped signed $\kappa_{\text{real}}(s)$ in $\text{m}^{-1}$** (eliminating the `82.0` scale factor, `±0.95` saturation clamp at `L506`, and `0.015` step deadzone at `L527`).
2. **`src/physics.js` & `src/controls.js`:**
   - Delete duplicate brake assist in `src/controls.js:971–1001` (fixing the `peakCurv * 255` unit bug that pinned `safeSpeedKmh` to `108 km/h` and held `38%` brake on gradual bends) and smooth the digital steer-rate step (`controls.js:1455, 1466`).
   - Wire `brakingAssist` into `physCtx` (`src/main.js:2633`, mapping `OFF | MIN | FULL` + legacy aliases) and integrate `computeCornerPhysicsBrakeAssist` (`5m..180m` forward scanner with $\Delta\theta$, $R_{\text{eff}}$, aero $v_{\max}$, and $d_{\text{req}}$).
   - Replace boolean `latDampRate` / `curbApexHook` / `lateralVel`-based `relYaw` (`physics.js:1126–1253, 1350`) with the **240 Hz Semi-Implicit Dynamic Bicycle + Curvilinear Frenet Solver** and continuous tire-width kerb/grass blending.
   - Add physical `kg` fuel-mass inertia/load-sensitivity, front-wing vortex drag + high-speed understeer, rear-wing high-speed oversteer + functional `drsActive` disable (`rwDmg >= 0.35`), suspension Venturi loss, front/rear axle tire split, and wheel-frequency `flatSpot` physics.
3. **`src/main.js`, `src/models.js` & `src/ai.js`:**
   - Add 240 Hz render-alpha pose interpolation (`physicsAccumulator / PHYSICS_DT`), fix `main.js:3086` (`s + lookAhead / mPerG`), use `1 - Math.exp(-k * dt)` camera damping, and remove duplicate tilt overwrite in `models.js:1875–1877`.
   - Fix AI straight/sweeper throttle starvation (`ai.js:383`: `1.0` instead of `0.94 / 0.52`), scale AI `perfMods` with Career R&D (`main.js:1756`), upgrade AI speed planner to unclamped $\kappa_{\text{real}}(s)$ + `180 m` lookahead, add parabolic sub-ray lateral smoothing (`ai.js:950`), and compute stint-matched fuel loads (`ai.js:1398`).
