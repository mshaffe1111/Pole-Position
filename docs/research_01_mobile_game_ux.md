# Research 01 — Great Mobile Racing UX, 1:1 Motion-Matched Controls & Clean Sim Menu/HUD Architecture

**Author:** Researcher 1 (`@res-mobile-ux`)  
**Scope:** Line-by-line UX & control-loop audit of `src/controls.js`, `src/physics.js`, `src/track.js`, `src/main.js`, `src/hud.js`, `index.html`, and `styles.css`, benchmarked against *GRID Autosport Mobile*, *Real Racing 3*, *F1 24*, and *Gran Turismo 7*.

---

## Executive Summary

A forensic audit of the current control-to-physics-to-camera pipeline and UI layer reveals **seven compounding mathematical defects** that make hard turns feel jerky/non-linear, **one critical curvature-scaling bug** that forces Brake Assist to clamp speed to a flat percentage on every curve, and **excessive arcade/emoji visual noise** across the home screen and race HUD:

1. **Stacked Non-Linear Power Curves (`|u|^1.35` × `|u|^1.32` ≈ `|u|^1.78`)**: `src/controls.js` (`L808`, `L1050`, `L1311`) applies a non-linear curve *and* `src/physics.js` (`L1093`) applies a second `|steerIn|^1.32` curve on top. Small/medium thumb or tilt motions (`0–35%`) produce only `~18%` steering response ("dead mush"), followed by a **2.9× steeper slope surge** near full lock that snaps the car violently mid-hairpin.
2. **Closed-Loop SAT Injection Fighting User Position Input (`SAT_ACTIVE_ASSIST_BLEND = 0.18`)**: `src/controls.js` (`L1444–1446`, `L1501–1512`) adds up to `±18%` (`±22.5°`) of physics `selfAligningTorque` directly into `this.steer` *while the player is actively holding the touch wheel, gyro tilt, or gamepad stick*, creating a 60Hz–240Hz control-physics oscillation whenever tires scrub or clip an apex kerb. Worse, `applyPhysicsFeedback()` is called **twice per render frame** (`src/main.js:L2210` and `src/controls.js:L1443`).
3. **Mid-Braking Gain Surges & Piecewise Rate Kinks**: Stacked speed-authority curves in both `src/controls.js` (`L1393`, `L1437–1440`) and `src/physics.js` (`L1093`, `L1102–1107`) cause steering gain to surge `+40%–65%` while braking from `160 -> 65 km/h` *even if the player holds their thumb/phone completely stationary*. Meanwhile, keyboard/arrow steering rates suffer a **37%–46% C0 step discontinuity** at `|steer| = 0.30 / 0.32` (`src/controls.js:L1455, L1468`), and touch pedals jump straight to **`60%` minimum pressure on initial touch** and **`100%` at just `22%` height** (`src/controls.js:L1090–1092`), preventing smooth trail-braking.
4. **Smoking-Gun Brake Assist Curvature Bug (`src/controls.js:L989–998` vs `src/track.js:L506`)**: `track.getPhysicsCurvature(s)` pre-multiplies `radPerMeter` (`1/R`) by **`82.0`** (`track.js:L506`), returning `0.20–0.95` on normal turns. However, `controls.js:L990` treats that value as raw `m⁻¹` and multiplies it by **`255.0`** (`296 / sqrt(1 + peakCurv * 255)`), slamming `safeSpeedKmh` to its **`108 km/h` floor on every curve including flat-out 300 km/h sweepers** and applying a constant `38% / 68% / 90%` flat brake ceiling! Meanwhile, `src/main.js:L2633` never passes `controls` into `physCtx`, leaving `src/physics.js:L823` inert.
5. **Visual Wheel Sine-Wave Buzz & Frame-Rate-Dependent Chase Camera**: `src/controls.js:L1564–1585` shakes the on-screen steering wheel with synthetic `Math.sin(nowMs * ...)` waves (`±3° to ±9.4°`) during hard turns, and `src/main.js:L3085–3105` shifts `_camDesiredPos` laterally using unsmoothed `steerInput` with `dt * 16.5` linear lerp instead of `exp(-λ·dt)` damping.
6. **Scattered Arcade Home Menu & Cluttered HUD**: `index.html` and `styles.css` mix 25+ emojis, 5 competing neon top-bar pills, moving AI traffic behind glass panels, a 10-group scrolling settings dump, a pinball `SCORE 000000` card inside `2026_UPDATED` Sim mode, an 8-pill floating toolbar, and right-edge telemetry panels that hide tire temperatures and damage on phones.

---

## 1. Line-by-Line Control & Cornering Jerk Audit (`src/controls.js`, `src/physics.js`, `src/main.js`)

### 1.1 Exact Defect Table

| ID | File & Lines | Current Code Behavior | Physical / Perceptual Failure on Hard Turns |
| :--- | :--- | :--- | :--- |
| **C-01** | `src/controls.js` `L806–808`, `L1048–1050`, `L1311` + `src/physics.js` `L1091–1094` | `controls.js` maps linear motion `lin` through `0.38*x + 0.62*x^1.35` (Wheel), `0.42*x + 0.58*x^1.30` (Tilt), `0.45*x + 0.55*x^1.35` (Gamepad); `physics.js` then applies `Math.pow(Math.abs(steerIn), 1.32)`. | **Double exponentiation (`~x^1.78`)**. At `35%` thumb drag, net steer output is only `18.8%` (car refuses to turn in). Pushing thumb from `50% -> 90%` triggers a **2.9× gain spike**, snapping the nose into the inside barrier or sudden understeer scrub. |
| **C-02** | `src/main.js` `L2210–2212` + `src/controls.js` `L1443–1446`, `L1499–1513` | `applyPhysicsFeedback()` runs **twice per frame**. `satAssist = selfAligningTorque * 0.18` (with a hard step gate at `|SAT| > 0.025`) is added directly to `wheelTouchSteer`, `tiltFilteredSteer`, and `gpSteer`. | **Closed-loop feedback oscillation**. When front slip saturates or `curbApexHook` (`physics.js:L1150`) triggers on an apex kerb, `selfAligningTorque` flips sign (`physics.js:L1267–1273`), injecting up to `±22.5°` of uncommanded steering against a stationary thumb/phone. |
| **C-03** | `src/controls.js` `L1393–1394`, `L1437–1440`, `L1501` + `src/physics.js` `L1093`, `L1102–1107` | Both modules damp high-speed steering (`speedSteerAuthority = 0.74` AND `(1 + 0.00015 v²)⁻¹` AND `highSpeedStability = 0.88`) and both boost low-speed steering (`hairpinAgility = 1.16` AND `hairpinTurnInBite = 1.22`). | **Mid-corner braking surge**. Trail-braking from `175 km/h` down to `68 km/h` with a *constant* thumb/tilt angle causes effective front-wheel steer angle to surge **+58%** mid-deceleration, making turn-in unpredictable. |
| **C-04** | `src/controls.js` `L1477` & `L1502` | Touch Wheel applies an extra fixed lag filter `expSmoothing(28.0 * hairpinAgility, safeDt)` (`τ ≈ 35ms`); Tilt Gyro applies a fixed `expSmoothing(14.5, safeDt)` (`τ ≈ 69ms`). | **Input latency vs. noise trade-off failure**. `69ms` lag on Tilt feels detached in fast left-right chicanes (Monaco Swimming Pool, Monza Rettifilo), while Touch Wheel does not need a `35ms` lag filter on direct 1:1 finger tracking except sub-pixel jitter suppression. |
| **C-05** | `src/controls.js` `L1453–1473`, `L1506–1520` | Keyboard rate jumps abruptly from `15.0 -> 9.5` at `|kbSteer| = 0.30`; Touch Arrow rate jumps from `18.0 -> 9.8` at `|arrowRampSteer| = 0.32`. Release path switches branches at `0.003`. | **C0 angular-rate kink**. Right as the player holds `A`/`D` or `◀`/`▶` past a gentle sweeper into a hard turn (`|steer| = 0.30`), turn-in speed suddenly drops by **38–45%**. |
| **C-06** | `src/controls.js` `L1089–1093` | `pressure = yFromBottom >= 0.22 ? 1.0 : 0.60 + 0.40 * (yFromBottom / 0.22)` on `#touch-pedal-zone`. | **Impossible analog modulation (`0.60` step jump)**. Touching the bottom pixel of the brake pedal instantly applies **60% brake**, and moving `30px` up hits **100% lockup**. Drivers cannot feather `15%–45%` trail-braking into tight hairpins. |
| **C-07** | `src/controls.js` `L976–1001` vs `src/track.js` `L506` & `src/main.js` `L2633` | `track.js:L506` stores `curvature = clamp((dPsi / (8*dsReal)) * 82.0, -0.95, 0.95)`. `controls.js:L990` computes `296 / sqrt(1 + peakCurv * 255)`, hitting the `108 km/h` clamp on every bend (`R < 5,400 m`). | **Flat-percentage speed-holding bug**. Brake Assist triggers on flat-out `300 km/h` sweepers and applies its maximum cap (`38%` LOW / `68%` MED / `90%` HIGH) regardless of true corner radius! |
| **C-08** | `src/controls.js` `L1564–1585` & `src/main.js` `L3085–3105` | Virtual wheel adds `Math.sin(nowMs * 0.085) * 4.2°` / `9.0°` + `SAT * 5.2°`. Chase cam shifts position by raw `-steerInput * 0.55` and uses frame-dependent `dt * 16.5` lerp. | **Visual & camera judder**. The HUD steering wheel buzzes asynchronously under a steady thumb, and the chase camera twitches laterally on every quick steering correction. |

---

### 1.2 Exact Continuous 1:1 Motion-to-Steering-Angle Mapping Specification

To achieve **GRID Autosport Mobile ("Wheel Touch Pro" / "Tilt Pro")** and **Gran Turismo 7** precision, **one module (`src/controls.js`) owns input normalization $u \in [-1, +1]$**, and **one module (`src/physics.js`) maps $u$ 1:1 to physical road-wheel Ackermann angle $\delta_{\text{road}}$**.

#### Rule 1 — Single-Authority 1:1 Steering Geometry Matched to Real Track Corners
Modern Formula 1 steering racks use a **12:1 steering ratio** with **$\pm 180^\circ$ ($360^\circ$ lock-to-lock)** steering-wheel travel (`WHEEL_MAX_LOCK_DEG = 180.0`), yielding a maximum front road-wheel Ackermann angle of:
$$\delta_{\max} = \frac{180^\circ}{12} = 15.0^\circ = 0.2618\text{ rad}$$

For wheelbase $L = 3.60\text{ m}$ and mild understeer gradient $K_{\text{us}} = 0.012\text{ rad/g}$, the steady-state road-wheel angle required for a corner of true radius $R = \frac{82.0}{|\kappa_{\text{track}}|}$ at speed $v\text{ (m/s)}$ is:
$$\delta_{\text{eq}}(R, v) = \arctan\!\left(\frac{L}{R}\right) + K_{\text{us}} \frac{v^2}{g R}, \qquad u_{\text{req}} = \frac{\delta_{\text{eq}}(R, v)}{\delta_{\max}}$$

| Corner Archetype | Circuit Example | True Radius $R$ | Apex Speed $v$ | Required Road Angle $\delta_{\text{eq}}$ | 1:1 Normalized Input $u_{\text{req}}$ | 1:1 Virtual Wheel $\theta_{\text{wheel}}$ | 1:1 Phone Tilt $\phi_{\text{tilt}}$ (`±27°` max) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Ultra-Tight Hairpin** | Monaco Fairmont / Loews | `18 m` | `62 km/h` (`17.2 m/s`) | `0.217 rad` (`12.4°`) | **`0.83`** | **`149°`** | **`22.4°`** |
| **Standard GP Hairpin** | Fuji Hairpin / Monza T1 | `26 m` | `84 km/h` (`23.3 m/s`) | `0.163 rad` (`9.3°`) | **`0.62`** | **`112°`** | **`16.7°`** |
| **90° Medium Corner** | Monaco Rascasse / Vegas | `65 m` | `148 km/h` (`41.1 m/s`) | `0.087 rad` (`5.0°`) | **`0.33`** | **`60°`** | **`8.9°`** |
| **Fast Aero Corner** | Fuji 100R / Maggotts | `145 m` | `235 km/h` (`65.3 m/s`) | `0.061 rad` (`3.5°`) | **`0.23`** | **`42°`** | **`6.2°`** |
| **Flat-Out Sweeper** | Fuji 300R / Suzuka 130R | `285 m` | `305 km/h` (`84.7 m/s`) | `0.043 rad` (`2.5°`) | **`0.16`** | **`29°`** | **`4.3°`** |

**Why this works seamlessly without jerky speed-multipliers:**
- Because cornering speed $v_{\max}(R)$ naturally scales with $\sqrt{R}$, the dynamic slip term $K_{\text{us}} \frac{v^2}{g R}$ stays bounded (`~1.5°–2.0°`), while the kinematic Ackermann term $\arctan(L/R)$ scales smoothly from `0.7°` in 300 km/h sweepers up to `11.3°` in 60 km/h hairpins!
- Therefore, **pure 1:1 linear mapping ($\delta_{\text{road}} = u \cdot \delta_{\max}$, with zero `Math.pow(|u|, 1.35)` and zero `Math.pow(|steerIn|, 1.32)`)** places flat-out sweepers at a calm `16%` input (`~4.3°` phone tilt / `13px` thumb slide), medium corners at `33%`, and hairpins at `62%–83%` — leaving `17%–38%` of linear lock authority in reserve to catch oversteer or tighten the apex!
- High-speed aero stability above `240 km/h` requires at most a gentle, $C^1$-smooth `12%` rack-authority taper (`1.0 -> 0.88` via `smoothstep(240, 330, speedKmh)` **in `physics.js` ONLY**, completely removing duplicate damping in `controls.js`).

#### Rule 2 — Optional User Linearity Curve ($C^\infty$ Cubic Blend, Default `0.0` = Pure 1:1)
Replace all hardcoded fractional power curves (`Math.pow(absLin, 1.35)` which has an infinite second derivative at `0`) with a single $C^\infty$-continuous cubic linearity blend controlled by `linearity` $\lambda \in [0.0, 0.45]$ (**default $\lambda = 0.0$ for true 1:1 motion matching**):
$$f_{\text{lin}}(x, \lambda) = (1 - \lambda)\,x + \lambda\,x^3, \qquad x \in [-1, 1]$$
- At default $\lambda = 0.0$: **$f_{\text{lin}}(x, 0) = x$ (100% 1:1 proportional motion)**.
- Even if a player raises `Steering Linearity` in Settings ($\lambda = 0.25$), $f'_{\text{lin}}(0) = 0.75$ is analytical and infinitely differentiable across $x = 0$ (zero center-crossing kink).

#### Rule 3 — Continuous Micro-Deadzone Rescaling & Relative-Anchor Touch Wheel / Slider
In `_updateWheelFromPointer(e)`:
- Reduce `WHEEL_MICRO_DEADZONE_PX` from `4.5px` to **`2.0px`** (just enough to reject capacitive digitizer noise on a stationary thumb without creating a dead gap on direction reversal).
- Standardize full-lock drag radius to physical CSS viewport ergonomics: `baseDragPx = clamp(rect.width * 0.42, 64.0, 104.0)` divided by `sensitivity` (`0.6..1.5`), plus subtle rotational arc support when dragging along the upper rim:
  $$\Delta x_{\text{eff}} = \begin{cases} 0, & |\Delta x| \le d_0 \\ \operatorname{sign}(\Delta x)\,\dfrac{|\Delta x| - d_0}{D_{\max} - d_0}, & |\Delta x| > d_0 \end{cases}, \qquad u_{\text{wheel}} = \operatorname{clamp}\!\big(f_{\text{lin}}(\Delta x_{\text{eff}}, \lambda), -1, 1\big)$$

#### Rule 4 — 1€ Adaptive Low-Pass Filter for Gyro Tilt & Touch Drag (Zero Lag on Fast Turns, Zero Noise When Steady)
Replace fixed-rate `expSmoothing(14.5, dt)` on Tilt and `expSmoothing(28.0, dt)` on Touch Wheel with a lightweight **1€ Filter** (Casiez et al., CHI 2012):
$$f_c(\dot{x}) = f_{c,\min} + \beta\,|\dot{x}|, \qquad \alpha(\Delta t, f_c) = \frac{1}{1 + \frac{1}{2\pi f_c \Delta t}}$$
- **Touch Wheel**: $f_{c,\min} = 18\text{ Hz}$, $\beta = 0.85$ → sub-pixel digitizer tremor is smoothed when holding a steady sweeper arc, while any deliberate thumb movement (`|\dot{x}| > 0.5/s`) jumps $f_c > 40\text{ Hz}$ (`< 3.5ms` lag, indistinguishable from raw 1:1 hardware cursor!).
- **Tilt Gyro**: `TILT_DEADZONE_DEG = 0.6°` (down from `1.6°` so crossing center in S-curves has zero dead-spot), `TILT_BASE_MAX_DEG = 27.0°`, $f_{c,\min} = 4.5\text{ Hz}$, $\beta = 0.45$ → rock-steady straightaway hold with instant, lag-free `60Hz/120Hz` counter-steering in hairpins and chicanes.

#### Rule 5 — Eliminate Closed-Loop SAT Injection & Double Feedback Execution
1. Delete the duplicate `this.controls.applyPhysicsFeedback(this.playerCar, rawDt)` call in `src/main.js:L2210` (keep a single call inside `controls.update()`).
2. Set **`SAT_ACTIVE_ASSIST_BLEND = 0.0` for all direct position inputs** (`WHEEL`, `TILT`, `GAMEPAD` analog stick): when the player is holding a position, `this.steer` must equal their exact filtered 1:1 input — **never** perturbed by `selfAligningTorque`!
3. Use `selfAligningTorque` strictly for:
   - **Haptic & Audio Tactile Cues** (curb pulse / oversteer scrub vibration),
   - **Passive Release Auto-Centering** when `wheelActive === false && arrowDir === 0 && kbTarget === 0` (`satReturnTarget = selfAligningTorque * 0.35`), and
   - **Optional Digital Counter-Steer Assist** (`0.12 * selfAligningTorque`) *only* when driving via binary Keyboard (`A`/`D`) or Touch Arrows (`◀`/`▶`).
4. Remove the synthetic `Math.sin(nowMs * ...)` oscillation (`ffbJitterDeg`) from `#virtual-wheel-graphic` (`src/controls.js:L1564–1585`). The on-screen wheel must rotate strictly to `this.steer * 180.0` deg so visual feedback matches thumb position 1:1; communicate kerb rumble via a subtle CSS border-glow pulse + haptics instead of shaking the wheel angle.

#### Rule 6 — $C^1$-Continuous Rate Envelope for Keyboard & Touch Arrows (Zero Step Kink)
Replace the piecewise `15.0 : 9.5` and `18.0 : 9.8` step jumps (`src/controls.js:L1455, L1468`) with a smooth continuous rate function of current deflection $|s|$ and speed $v$:
$$R_{\text{turn}}(|s|, v) = \Big(R_{\text{fast}} - (R_{\text{fast}} - R_{\text{lock}})\,\operatorname{smoothstep}(0.15, 0.75, |s|)\Big) \cdot \Big(1 - 0.22\,\operatorname{smoothstep}(140, 310, v_{\text{kmh}})\Big)$$
- With $R_{\text{fast}} = 14.0\text{ s}^{-1}$, $R_{\text{lock}} = 8.5\text{ s}^{-1}$, and continuous counter-steer rate $R_{\text{counter}} = 22.0\text{ s}^{-1}$ when $\operatorname{sign}(u_{\text{target}}) \neq \operatorname{sign}(s)$, steering angular velocity $\dot{s}$ is $C^1$-continuous everywhere on $[-1, 1]$.

#### Rule 7 — True `0% -> 100%` Progressive Analog Pedals & Real-Physics Brake Assist (`OFF | MIN | FULL`)
1. **Pedal Vertical Travel (`_updatePedalsFromPointer`, `src/controls.js:L1089–1093`)**:
   Replace the `0.60` minimum jump with a continuous analog pressure curve across the lower `82%` of the pedal card (leaving the top `18%` comfortable full-pressure lock zone):
   $$p_{\text{raw}} = \operatorname{clamp}\!\left(\frac{y_{\text{fromBottom}} - 0.04}{0.78},\, 0.0,\, 1.0\right), \qquad p = p_{\text{raw}}^{1.15}$$
   - Touching near the bottom applies `5%–25%` gentle trail-braking; middle of the pedal applies `45%–65%` threshold modulation; upper `22%` delivers `100%` full braking/full throttle. Keep the $C^1$ horizontal rollover (`xNorm` $\in [0.40, 0.60]$) for single-thumb gas-to-brake blending.
2. **Unify Brake Assist Around `OFF | MIN | FULL` Using True Unscaled Radius $R(s)$**:
   - Delete the broken `_computeDrivingAssists` curvature math in `src/controls.js:L976–1001` (which multiplied already-scaled `curvature * 82` by `255`!).
   - Normalize brake assist modes across UI, `prefs`, `controls.js`, and `physics.js` to **`'OFF' | 'MIN' | 'FULL'`** (mapping legacy `'LOW'` $\to$ `'MIN'`, `'MEDIUM'/'HIGH'` $\to$ `'FULL'`).
   - Convert `track.getPhysicsCurvature(s)` back to true physical curvature $|\kappa_{\text{real}}(s)| = \frac{|\text{getPhysicsCurvature}(s)|}{82.0}\text{ m}^{-1}$ (so $R(s) = \frac{82.0}{\max(10^{-4}, |\kappa_{\text{track}}(s)|)}\text{ m}$) when scanning `5m..180m` ahead:
     * **`OFF`**: `0%` assist brake, `100%` manual throttle/brake authority.
     * **`MIN` (Minimum Safety-Net Assist)**: **Zero throttle cut**, **zero speed holding on straights or sweepers ($R > 140\text{ m}$)**, and **zero braking** during normal driving; applies a gentle late safety-net brake (`max 0.28`, smooth ramp) *only* when approaching a genuine medium/tight corner ($R \le 140\text{ m}$) at $v > 1.10 \cdot v_{\max}(s)$ inside $0.90 \cdot d_{\text{req}}$!
     * **`FULL` (Full Threshold + Trail-Brake Assist)**: Smoothly modulates threshold braking along the true aero-augmented kinematic braking envelope $v_{\text{allow}}(d) = \sqrt{v_{\max}(s)^2 + 2 a_{\text{brake}} d}$ and tapers off cleanly past corner entry so the car rotates naturally into the apex.

#### Rule 8 — Frame-Rate-Independent Camera Damping (`src/main.js:L3084–3106`)
- Replace `Math.min(1, dt * 16.5)` with true exponential decay `1 - Math.exp(-16.5 * dt)`.
- Low-pass filter `apexSwing` (`expSmoothing(10.0, dt)`) instead of feeding raw `-this.playerCar.steerInput * 0.55` directly into `_camDesiredPos`, and blend chase-camera forward basis `75%` track tangent + `25%` car heading (`pFr.tangent` rotated by `car.relYaw`) so hard hairpin rotation feels fluid and planted.

---

## 2. Clean, Organized Motorsport Sim Menu Redesign (`index.html` & `styles.css`)

### 2.1 Audit of Why the Current Home Screen Feels Cluttered & Scattered

1. **Competing Visual Hierarchy & Emoji Overload (`index.html:L41–64`, `L177–385`)**:
   - `.showroom-topbar` crams a 3-stripe speed mark, `F1` badge, cyan uppercase kicker, metallic-fire `POLE POSITION '26` title, cyan circuit pill, gold career pill, and **5 differently colored glass pills** (`retro-pill`, `career-pill`, `accent-pill`, default white, `gold-pill`) using 25+ emojis across the menu and drawers.
   - Visually, five saturated accent colors (`#ff1e38`, `#ffd600`, `#00e5ff`, `#ff80ab`, `#00e676`) compete simultaneously at equal weight.
2. **Fragmented Pre-Race Workflow**:
   - Essential pre-race choices (Brake Assist `OFF | MIN | FULL`, Session Length, Weather, Tire Compound) are hidden behind a tiny static-looking `.setup-summary-bar` (`9px` text chips) that opens `#garage-drawer` — where race rules are mixed together with 5-channel audio sliders, UI scale sliders, handedness toggles, and render shaders in a single 10-group vertical scroll list (`index.html:L204–376`).
3. **Cramped 6-Across Track Strip & Busy Background**:
   - `.circuit-showcase-strip` squeezes 6 cards horizontally on desktop/landscape (`14px` tall SVGs on landscape phones, `styles.css:L3943`) or stacks a `3×2` grid on portrait that eats `34%` of screen height. Meanwhile, 7 AI cars continuously race past the parked #1 car at 300 km/h (`src/main.js:L2654`), creating constant motion flicker behind translucent UI text.

---

### 2.2 Target Sim Menu Architecture (*Gran Turismo 7* / *F1 24* / *GRID Autosport* Benchmark)

#### Design Tokens (`styles.css` `:root`)
```css
:root {
  --sim-bg-panel: rgba(10, 14, 22, 0.84);
  --sim-bg-elevated: rgba(16, 22, 34, 0.94);
  --sim-border: rgba(255, 255, 255, 0.10);
  --sim-border-active: rgba(255, 255, 255, 0.34);
  --sim-accent-primary: #e10600;   /* FIA Motorsport Crimson — Primary CTA & active stripe */
  --sim-accent-telemetry: #00d2be; /* Precision Telemetry Cyan-Teal — Selected state */
  --sim-accent-gold: #f5b700;      /* Championship / PB accent only */
  --sim-text-primary: #f3f6fb;
  --sim-text-secondary: #94a3b8;
  --sim-text-muted: #64748b;
  --sim-radius-lg: 12px;
  --sim-radius-md: 8px;
  --sim-radius-sm: 6px;
}
```
*Typography & Iconography Rule:* Zero emojis in buttons, headers, or HUD telemetry. Use crisp inline 16×16 stroke SVG icons (`stroke-width="1.75"`), geometric sans-serif labels (`font-weight: 600–700`, `letter-spacing: 0.06em`), and `font-variant-numeric: tabular-nums` on all numbers/lap times.

#### Spatial Layout Blueprint (3 Clean Zones)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [POLE POSITION]  [ 2026 SIM GP | 1982 CLASSIC ]     [CAREER: S1 R1 • $150K] [⚙] [🔊] [⛶] │ ← Zone 1: 48px Unified Top Bar
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                                                                              │
│                    UNOBSTRUCTED 3D HERO CAR SHOWCASE                         │ ← Zone 2: 68%–74% Clear Stage
│               (Calm Pit-Straight Lighting • Drag to Orbit)                   │   (Pause AI fly-bys in menu;
│                                                                              │    auto-fade orbit hint in 3s)
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────┬────────────────────────────┬───────────────┐ │
│ │ CIRCUIT SELECTOR            │ SESSION & QUICK ASSISTS    │ LAUNCH POD    │ │ ← Zone 3: Structured Bottom Dock
│ │ ◀ [SVG] FUJI SPEEDWAY '82 ▶ │ LAPS: [5L|12L|25L] WTH: ☀  │  4.36 KM • P5 │
│ │   JPN • 4.36 KM • BEST --   │ BRAKE ASSIST: [OFF|MIN|FULL]│ [ START RACE ]│
│ └─────────────────────────────┴────────────────────────────┴───────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### Zone-by-Zone DOM & Interaction Specification

1. **Zone 1 — Minimal Unified Top Bar (`header.showroom-topbar`, height `48px` desktop / `40px` mobile)**:
   - **Left (`brand + mode switch`)**: Clean motorsport wordmark `POLE POSITION` + inline 2-segment mode switch `[ 2026 SIM | 1982 ARCADE ]` (`data-cfg-mode="2026_UPDATED"` / `"1982_ORIGINAL"`). Switching to `1982 ARCADE` updates the Session module to Classic 1982 Qualifying + Laps (`3L|4L|5L`) in-place (replacing the awkward separate pink `🕹️ 1982 1:1` pill).
   - **Right (`career + utilities`)**:
     * **Career Button (`#btn-open-career`)**: Clean team color bar + `NAMCO SCUDERIA • R1/6 • $150K` pill.
     * **System Icon Cluster**: Uniform monochrome SVG icon buttons (`36×36px` hit target, `44×44px` touch halo) for **Settings (`#btn-open-garage`)**, **Audio Mute (`#btn-menu-audio`)**, and **Fullscreen (`#btn-menu-fullscreen`)**.

2. **Zone 2 — Unobstructed 3D Car Showcase (`#showroom-orbit-zone`)**:
   - **Calm Showroom Rule**: In `PRE_RACE_MENU`, keep the player's #1 car parked on Pole with subtle ambient mechanics/lighting, and **do not run 7 AI cars streaking past the camera** (eliminates distracting background motion behind UI text).
   - Fade `.orbit-hint-chip` (`DRAG TO ORBIT`) to `opacity: 0` after `3.0s` or upon first pointer drag.

3. **Zone 3 — Structured Bottom Race Dock (`footer.showroom-bottom-dock`)**:
   - **Module A — Clean Track Picker (`.dock-track-module`)**:
     * **Desktop (`>= 1024px`)**: Clean horizontal scrollable/selectable 6-circuit strip with crisp `1px` active teal border, clean country code (`JPN`, `MON`, `ITA`, `GBR`, `USA`), proportional circuit SVG outline, Circuit Name, and `km` length.
     * **Mobile Portrait & Landscape (`< 1024px`)**: Compact **Prev `‹` / Active Circuit Card (with SVG map + Name + Length) / Next `›` stepper + tap-to-expand Circuit Sheet** (or smooth horizontal `scroll-snap-type: x mandatory` carousel showing 2.5 cards with zero text truncation), reclaiming `70px+` of vertical 3D showcase height!
   - **Module B — Session Config & Assist Quick-Selector (`.dock-session-module`)**:
     * **Row 1 (Session Quick-Pills)**: `Length (5L / 12L / 25L)`, `Weather (Random / Dry / Wet)`, `Tire (Soft / Med / Hard)`, and `Format (Race / Quali+Race)` — tappable segmented controls or clean popover triggers.
     * **Row 2 (Direct Pre-Race Assist Strip)**:
       ```html
       <div class="quick-assist-row" role="group" aria-label="Brake Assist">
         <span class="qa-label">BRAKE ASSIST</span>
         <div class="segmented-control" id="menu-brake-assist-seg">
           <button type="button" class="seg-btn selected" data-cfg-assist="OFF">OFF</button>
           <button type="button" class="seg-btn" data-cfg-assist="MIN">MIN</button>
           <button type="button" class="seg-btn" data-cfg-assist="FULL">FULL</button>
         </div>
         <span class="qa-sep"></span>
         <span class="qa-label">GEARBOX</span>
         <div class="segmented-control">
           <button type="button" class="seg-btn selected" data-cfg-gearbox="AUTO_8SPD">AUTO</button>
           <button type="button" class="seg-btn" data-cfg-gearbox="MANUAL_8SPD">MANUAL</button>
         </div>
       </div>
       ```
       *UX Payoff:* Players can switch `Brake Assist: OFF | MIN | FULL` and `Gearbox: AUTO | MANUAL` in **1 tap right from the home dock** (and from the Pause Menu!) with a clear 1-line micro-tooltip (`MIN: Late safety-net only on tight corners; zero speed cap`).
   - **Module C — Race Launch Pod (`.dock-launch-module`)**:
     * Clean summary line (`FUJI '82 • 5 LAPS • P5 GRID`) above a solid, high-contrast `#e10600` **`START RACE`** button (`#btn-launch-race`, `min-height: 48px`, crisp geometric typography, no cartoon sheen animation).

4. **Clean Tabbed Modals (`#garage-drawer` -> 3-Tab Settings Modal & `#career-drawer` -> 4-Tab Garage/Career Hub)**:
   - Convert `#garage-drawer` from an endless 10-group scroll list into **3 clean, non-scrolling (or minimal-scroll) tabs**:
     1. **`CONTROLS`**: Steering Input (`Touch Wheel | Touch Slider/Arrows | Tilt Gyro`), Handedness (`Right | Left`), `Calibrate 0° Tilt`, `Steering Sensitivity (60–150%)`, `Steering Linearity (0% = 1:1 Linear .. 45%)`, `Touch Control Size & Opacity`.
     2. **`ASSISTS & RULES`**: `Brake Assist (OFF | MIN | FULL)` with clear physics description, `Auto-Throttle (OFF | ON)`, `Session Qualifying (Instant Grid | 1-Lap Quali)`, `AI Grid Size (8 | 16)`.
     3. **`AUDIO & DISPLAY`**: 5-Channel Mixer (`Master`, `Engine`, `Tires/SFX`, `Engineer Radio`, `Music`), `Speed Unit (KM/H | MPH)`, `Haptics (ON | OFF)`, `HUD Mode (Full Sim | Minimal | Off)`.
   - Keep all existing DOM IDs (`#btn-launch-race`, `#btn-open-garage`, `#btn-open-career`, `[data-cfg-*]`, `#slider-*`) backward-compatible so `src/main.js` bindings remain 100% solid.

#### Responsive Viewport Budgets (`styles.css`)

| Viewport Class | Top Bar | 3D Hero Stage | Bottom Race Dock | Touch Target Minimum |
| :--- | :---: | :---: | :---: | :---: |
| **Desktop (`>= 1100px`)** | `48px` (1 row) | `~74% vh` | `116px` (3-column grid: `1.4fr 1.2fr 240px`) | `38×38px` |
| **Mobile Landscape (`<= 500px` h, e.g. `844×390`, `915×335`)** | `36px` (1 row) | `~66% dvh` | `78px` (3-column compact: Track Carousel + Assist/Session + Launch) | `34×44px` |
| **Mobile Portrait (`<= 640px` w, e.g. `390×844`, `412×915`)** | `42px` (1 row) | `~64% dvh` | `168px` (Stacked: Horizontal Track Snap Strip + Assist/Session Row + Full-Width Start Button) | `42×44px` |

---

## 3. Immersive, Uncluttered Motorsport Sim HUD (`src/hud.js`, `index.html`, `styles.css`)

### 3.1 Audit of Current HUD Clutter & Missing Sim Feedback

1. **Arcade Score Card Shown in Sim Mode (`index.html:L460–464`)**: `.stat-score` (`SCORE 000000 / TOP 025000`) occupies prime top-left space even in `2026_UPDATED` Sim GP.
2. **Top-Right Congestion (`index.html:L487–564`)**: `.speed-cluster`, `.hud-quick-actions` (8 buttons!), and `#right-telemetry-dock` stack three separate UI blocks down the right side of the screen.
3. **Critical Sim Data Hidden on Phones (`styles.css:L3625–3637`)**: `.t-temp` (tire temperatures) and `.dmg-row` (aero/suspension damage) are hidden via `display: none` on mobile viewports, leaving mobile sim players blind to tire overheating (`>106°C`) and front-wing damage!
4. **No Continuous Live Lap Delta & No Pedal Input Trace**: Sector splits only flash every 333m (`src/hud.js:L139`), with no continuous `±0.00s` live delta bar, and no live throttle/brake input trace to visualize trail-braking or `MIN` Brake Assist engagement.

---

### 3.2 Clean Sim HUD Layout & Telemetry Specification

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [P3/16] [LAP 4/12]                [ 1:18.42  |  -0.24s ▓▓▓░░ ]     [🎥] [⏸] │ ← Top Perimeter (36px)
│ ┌──────────────┐                  [ 🟨 S2 YELLOW — NO PASSING ]              │
│ │  TRACK MAP   │  INT -0.48s                                                 │
│ │  (Clean Vec) │  GAP +1.12s                                                 │
│ └──────────────┘                                                             │
│                                                                              │
│                     100% UNOBSTRUCTED DRIVING SIGHTLINE                      │ ← Center 78% Sacred Zone
│                (Horizon, Braking Markers, Mirrors, Apex Kerbs)               │   (Zero score popups!)
│                                                                              │
│                                                                 ┌──────────┐ │
│  ┌─────────────────┐               ┌───────────────────┐        │ [S] FUEL │ │
│  │  TOUCH WHEEL /  │               │ ●●●●●●●●●○○○○○○   │        │ 94° [██] │ │ ← Compact Car MFD
│  │  LINEAR SLIDER  │               │  B ▓  [ 4 ]  ▓ T  │        │ 96° [██] │ │   (4-Tire Temp+Wear
│  │  (Translucent)  │               │       218 KM/H    │        │ [📻 BOX] │ │    + Damage Vector)
│  └─────────────────┘               └───────────────────┘        └──────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
*(Note: On Mobile Touch mode, the right-hand Analog Pedals occupy the bottom-right corner while the compact **Car MFD** docks cleanly above the pedals at `right: 10px, top: 48px`, `width: 112px`, keeping zero overlap on `335px`-tall landscape and `390px`-wide portrait screens!)*

#### 1. Mode-Pure Visibility (`2026_UPDATED` Sim vs `1982_ORIGINAL` Arcade)
- **Hide `.stat-score` completely in `2026_UPDATED`** (`scoreEl.closest('.stat-score').style.display = isClassic ? 'flex' : 'none'`). Show `SCORE / TOP` and `+50 PTS PASS` callouts *exclusively* in `1982_ORIGINAL` mode.
- Reduce `.hud-quick-actions` from 8 buttons to **2 minimal corner icons**: **Camera Cycle (`#btn-live-cam`)** and **Pause (`#btn-live-menu`)** (all layout/shader/audio toggles remain 1 tap away inside Pause $\to$ Settings).

#### 2. Continuous `s`-Indexed Live Lap Delta (`src/hud.js`)
Sample cumulative lap time into a 100-bucket ring array `currentLapBins[0..99]` (`bin = Math.floor((car.s / 1000) * 100)`) and compare linearly against `bestLapBins[0..99]`:
$$\Delta t(s) = t_{\text{current}}(s) - t_{\text{best}}(s)$$
- Render in a sleek top-center pill (`168px × 28px`): current lap time (`1:14.82` in standard `M:SS.cc` motorsport format for 2026 Sim mode; `74"82` kept for 1982 mode) + numeric delta (`-0.24s` emerald `#10b981` when ahead, `+0.18s` coral `#ef4444` when behind) + a thin `3px` center-origin horizontal delta bar (`clamp(-delta / 1.0, -1, 1)`).

#### 3. Integrated Sim Tachometer, Gear, Speed & Pedal Telemetry Pod
- **15-Segment F1 Shift-Light Strip**: Smoothly lights Green (`LEDs 1–5`: `9,500–10,800 RPM`), Red (`LEDs 6–10`: `10,800–12,100 RPM`), and Blue (`LEDs 11–15`: `12,100–12,850 RPM`), flashing cyan/blue at exact upshift point (`>= 12,850 RPM`).
- **Central Gear & Tabular Speed**: High-contrast Gear (`1`–`8`, `28px` bold) flanked by tabular Speed (`294` + small `KM/H` or `MPH`) and thin `DRS` / `ERS` indicator bars.
- **Dual Live Input Bars (`Throttle` & `Brake` + Assist Split)**: Two crisp `5px`-wide vertical bars alongside the gear digit:
  * **Green Bar**: `car.throttleInput` (`0–100%`).
  * **Red/Amber Bar**: Manual `brake` in solid crimson `#ef4444`, with any active Brake Assist contribution (`assistBrake - manualBrake`) shown in amber `#f59e0b` so the player has **transparent, non-intrusive visual feedback** whenever `MIN` or `FULL` Brake Assist intervenes!

#### 4. Ultra-Clean Car Silhouette + 4-Tire Temp/Wear MFD (`#telemetry-2026-panel`)
Replace verbose multi-row text labels (`W: 0% LINE / 0% OFF`, `LOCKED`, 4 full-width `FW/SUSP/RW/TIRE` pills) with a compact **`116px`-wide F1 MFD pod** that fits on **every** desktop and phone viewport without hiding data:
- **Top Header**: Compound badge (`S` red / `M` yellow / `H` white / `I` green / `W` blue) + Fuel remaining (`6.4 LAPS`, turning amber `< 1.8L` and red `< 1.0L`).
- **Center 2×2 Tire + Chassis Silhouette Matrix**:
  * **Central SVG Top-Down F1 Chassis (`28×52px`)**: Separate `<path>` zones for **Front Wing**, **FL/FR/RL/RR Suspension**, and **Rear Wing**. Healthy parts render in subtle `rgba(255,255,255,0.18)` (zero visual clutter!); damaged parts shift to `#f59e0b` (`>15%`) and `#ef4444` (`>50%`).
  * **4 Flanking Tire Cells (`FL`, `FR`, `RL`, `RR`)**:
    - Core fill tint encodes **Tire Temperature Window** (`<75°C` cold blue `#38bdf8`, `85–106°C` optimal green `#10b981`, `>112°C` overheating orange/red `#f97316` / `#ef4444`) with compact `96°` readout **kept visible on mobile**.
    - Outer `3px` vertical bar encodes **Tread Life %** (`100% -> 0%`, pulsing red below the `25%` cliff).
- **Bottom Action**: Single compact **`BOX` (`#btn-request-box`) + Strategy (`M +5L`)** pill row; tapping Strategy opens the clean Pre-Pit popover without blocking the central road.

#### 5. Clean Vector Track Minimap (`#gps-minimap`)
- Remove the tactical cyan grid lines (`src/hud.js:L746–760`), the `GPS` text badge, and the expanding radar halo (`L889–895`).
- Render a clean **FOM Broadcast Track Outline** (`rgba(10,14,22,0.45)` subtle backdrop or borderless floating vector): dark `5.5px` casing + `2.5px` crisp white/slate road ribbon, subtle S1/S2/S3 tick marks, yellow sector highlight only during active cautions, high-contrast rival dots (`P1` leader outlined in gold), and a sharp emerald player chevron.

---

## 4. Exact Implementation Checklist for Engineering Pass

1. **`src/controls.js`**:
   - Set default `linearity = 0.0` (1:1 linear mapping) with optional user cubic curve $f_{\text{lin}}(x,\lambda) = (1-\lambda)x + \lambda x^3$; remove `0.38*x + 0.62*x^1.35`, `0.42*x + 0.58*x^1.30`, and `0.45*x + 0.55*x^1.35`.
   - Implement the **1€ Adaptive Low-Pass Filter** for `WHEEL` (`fcMin=18Hz, beta=0.85`, `deadzone=2.0px`) and `TILT` (`fcMin=4.5Hz, beta=0.45`, `deadzone=0.6°`, `maxTilt=27°`).
   - Set `WHEEL_MAX_LOCK_DEG = 180.0`; remove `SAT_ACTIVE_ASSIST_BLEND` (`0.0`) from active `WHEEL`/`TILT`/`GAMEPAD` inputs; remove `speedSteerAuthority` duplication and `hairpinAgility` surge; remove `Math.sin` `ffbJitterDeg` wheel shake.
   - Replace Keyboard/Arrow `0.30/0.32` step kinks with $C^1$ `smoothstep` rate envelope; fix `_updatePedalsFromPointer` so analog travel spans `0% -> 100%` continuously (`((yFromBottom - 0.04) / 0.78)^1.15`).
   - Delete broken `_computeDrivingAssists` (`peakCurv * 255` bug) or delegate to unified real-radius (`R = 82 / |k|`) `OFF | MIN | FULL` brake assist shared with `src/physics.js`.
2. **`src/physics.js` & `src/main.js`**:
   - Remove second `Math.pow(Math.abs(steerIn), 1.32)` in `src/physics.js:L1093` so `steerAngleRad` is 1:1 linear with `steerIn` (`steerIn * 0.2618 * highSpeedTaper`).
   - Remove duplicate `applyPhysicsFeedback()` call in `src/main.js:L2210`; pass `controls: this.controls` and `brakingAssist` into `physCtx` (`src/main.js:L2633`); convertchase-cam `dt * 16.5` lerps and `apexSwing` to frame-rate-independent `1 - Math.exp(-rate * dt)` filters; freeze background AI fly-bys while `state === PRE_RACE_MENU`.
3. **`index.html`, `styles.css`, & `src/hud.js`**:
   - Restructure `#pre-race-menu` into the 3-zone motorsport layout (Unified 48px Top Bar with `2026 SIM | 1982 CLASSIC` toggle, calm 3D Hero Stage, and 3-module Bottom Race Dock featuring inline `BRAKE ASSIST: OFF | MIN | FULL` segmented control + responsive Track Picker + 3-Tab Settings Modal).
   - Remove emojis and multi-neon pill clutter; hide `.stat-score` in `2026_UPDATED` mode; add continuous `s`-indexed live lap delta pill, throttle/brake/assist bars, clean borderless vector minimap, and compact Car Silhouette + 4-Tire Temp/Wear MFD visible across Desktop, Mobile Landscape, and Mobile Portrait.
