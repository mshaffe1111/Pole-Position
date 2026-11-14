# Engineering Specification: Authentic 1982 Namco *Pole Position* Feel, Cockpit Camera Suite & Full Sim-Feature Parity

**Document ID:** `research_02_retro_pole_position`  
**Author:** Researcher 2 (`@res-retro-namco` — 1982 Namco *Pole Position* Historian & Full-Feature Retro Parity Lead)  
**Scope:** Read-only architectural audit & concrete implementation specification covering `src/retro1982.js`, `src/config.js`, `src/main.js`, `src/physics.js`, `src/track.js`, `src/pit_damage_caution.js`, `src/ai.js`, `src/hud.js`, and `styles.css`.

---

## Executive Summary & Historical Reference Baseline

Namco’s original **1982 *Pole Position*** (designed by Toru Iwatani on Namco’s Z8002 + dual-Z80 arcade PCB, outputting **256×224 @ 60.606 Hz** progressive RGB on a 19" Electrohome G07 CRT) and **1983 *Pole Position II*** established the foundational grammar of pseudo-3D raster racing:

1. **Hardware Per-Scanline Horizontal Scroll (`H-Scroll` RAM):** Every scanline below the horizon had an exact fractional accumulator offset feeding hardware line-scroll registers—never coarse world-chunk stepping and never competing road-stripe periods. In *Pole Position II*, per-scanline vertical compression (`V-Scroll`) bent the road smoothly over crests and dips.
2. **Hardware ROM Sprite Zoomer:** Roadside billboards, turn-chevron signs, and rival Formula cars were scaled through a deterministic hardware zoom lookup table anchored cleanly at their bottom-center contact shadow, with a disciplined, readable cadence of Fuji Speedway sponsors rather than cluttered random prop spam.
3. **Pure Color-Block Clarity:** Zero rising flare smoke, zero falling confetti, zero anime speed lines, and zero glassmorphic UI cards. High-saturation 8-bit RGB primaries (`#2038EC` cobalt sky, `#00A800` / `#009400` Fuji turf, `#D82800` / `#FCFCFC` FIA kerbs, `#FCFCFC` / `#FCE400` / `#00E8D8` 8×8 bitmap HUD typography) carried 100% of the telemetry.

Our line-by-line audit of `src/retro1982.js` (4,029 lines) and its host integration reveals an impressive foundation—offscreen integer-pixel rasterizer, 9-angle sprite caches, procedural Fuji/Monaco/Silverstone/Monza/Suzuka/Vegas sky panoramas, 4 camera views, and a 6-man pixel pit crew—held back by **three systemic engineering gaps**:

- **Pillar 1 (Cornering Jitter & Visual Clutter):** Player-anchored 2 m Euler curve integration, dead elevation array (`_worldElevM` computed and never read), hard curvature deadzones (`0.015` / `0.018`), independent `Math.round` left/right road-edge snapping (`±1 px` width chatter), 4 incompatible horizon parallax wrap moduli, two beating lane-dash periods (`4.5 m` OR’d with `4.0 m`), double vignette (`_crtCanvas` + `#speed-vignette`), and non-1982 flare/confetti/wind-line clutter.
- **Pillar 2 (Cockpit & Camera Collisions):** In Cockpit View (`cameraIndex === 2`), wing mirrors (`x = 50..94, y = 164..186`) directly overlap and occlude the exposed front slick tires (`x = 44..68, y = 158..192`) and suspension wishbones; an anachronistic 2026 Titanium Halo center pillar (`y = 86..168`) slices vertically across the horizon, Mount Fuji, and every corner apex; the MOMO wheel rim and gloves (`y = 193..240`) cover the dashboard `G1` gear and `ERS` gauges (`y = 191..212`); and the high cowl consumes **60% of sub-horizon vertical road space**.
- **Pillar 3 (Mode Schism & Missing Sim Parity):** Selecting `1982_ORIGINAL` (including the 1-Tap `1982 ARCADE` button) disables tire compounds, tire wear, flat-spots, fuel mass, wing/suspension damage, pit stops, and even wet-weather grip (`rawW = 0.0`), while making a `1 km/h` sidepod brush instantly explode only the player. Meanwhile, running `2026_UPDATED` with `1982_ARCADE` visuals leaves flat-spots, broken wings, bent wishbones, fuel load, and AI wet spray invisible on the pixel canvas while floating modern glassmorphic HTML overlays over the CRT.

This specification provides exact formulas, pixel coordinate budgets, state tables, and file/line targets to resolve all three pillars cleanly at **zero per-frame GC allocation**.

---

## Section 1: Authentic 1982 Arcade Feel, Smooth Cornering & Visual De-Cluttering

### 1.1 Root-Cause Audit of Scanline Jitter, Parallax Jumps & Visual Noise

| Issue ID | File & Exact Lines | Observed Defect | Root Cause in Code |
| :--- | :--- | :--- | :--- |
| **J1** | `src/retro1982.js:25-26, 1778-1793` | Shimmering road curvature during hard corner entry/exit | `_worldCurveM` integrates 96 steps of `WORLD_STEP_M = 2.0` anchored to moving player `pS` (`pS + dGame`) via first-order Euler (`curveHeading += radPerM * 2; curveLatM += curveHeading * 2`) instead of world-locked spline tangent differences or trapezoidal integration. |
| **J2** | `src/track.js:527` & `src/physics.js:421` | Sudden lateral snap entering/exiting gentle sweepers | Hard step deadzones (`if (Math.abs(curvature) < 0.015) curvature = 0.0` in `track.js` and `< 0.018 ? 0 : rawCurvature` in `physics.js`) create a discontinuous $C^{-1}$ jump in curvature. |
| **J3** | `src/retro1982.js:1792` | Tracks feel pancake-flat despite 3D spline hills | `_worldElevM[k] = sampleElev - herePose.elev` is computed every frame at L1792 and **never read anywhere in the file** (dead write). Scanlines ignore vertical hill projection. |
| **J4** | `src/retro1982.js:1694-1699` | Whole-horizon `±1 px` vertical chatter under braking/kerbs | `pitchPx = Math.round(chassisPitch * 140) + Math.round(-roadSlope * 54)` sums two separate integer roundings without hysteresis or fractional horizon blending. |
| **J5** | `src/retro1982.js:1869-1872, 1976, 1994-1998` | Road width & kerb edges "breathe" `±1 px` per scanline in turns | `roadL = Math.round(centerX - roadHalfPx)` and `roadR = Math.round(centerX + roadHalfPx)` round independently. When `centerX = 160.5` and `roadHalfPx = 40.2`, `roadR - roadL` flips between `80` and `81` on adjacent rows. |
| **J6** | `src/retro1982.js:1818, 1839` & `src/physics.js:1248` | Horizon road tip whips sideways on counter-steer | `yawVanishShiftPx` applies raw `pYaw` (`18 Hz` step response to `lateralVel`) linearly via `(1 - v)`, fighting the integrated curve near `v → 0`. |
| **J7** | `src/retro1982.js:1540, 1671, 2625, 2659, 2672, 2683` | Background mountains, clouds, and landmarks jump/desync | Four background layers use **four incompatible wrap widths and scroll rates**: Panorama `512 px` @ `81.49 px/rad`; Stars `W` @ `80 px/rad`; Clouds `max(380, W+90)` @ `95 px/rad`; Landmarks `max(320, W+80)` @ `115 px/rad`. Non-$2\pi$ moduli jump on resize or yaw wrap, and `_readTrackElevationAndYaw` uses piecewise-linear sample tangents. |
| **C1** | `src/retro1982.js:1853, 1989-1990` | Irregular, erratic blobbing of white road lane dashes | `dashBand` (`floor(absWorldM / 4.5) % 3 === 0`, 13.5 m period) and `speedDashBand` (`floor(absWorldM / 4.0) % 3 === 0`, 12.0 m period) are **boolean OR’d together** (`if (dashBand \| speedDashBand)`), beating against each other every 108 m! |
| **C2** | `src/retro1982.js:2482, 2485, 2770-2867` | Non-authentic visual noise over the clean 1982 road | `_renderGrandstandFlaresAndConfetti` (rising colored smoke flares on every lap + 28 falling confetti rects) and `_renderSpeedWindLines` (white edge anime streaks) add modern clutter alien to 1982 Namco hardware. |
| **C3** | `src/retro1982.js:2158-2346, 2419-2420` | Overcrowded roadside sprite soup & scale popping | Simultaneously renders `track.billboards` + **50** outer-verge props + **12** grandstand flags + **6** marshals + **12** braking boards, using independent `Math.round` on `dstW`/`dstH` so aspect ratios wobble at medium distance. |
| **C4** | `src/main.js:2416`, `styles.css:93, 2319-2327` & `src/retro1982.js:1512` | Crushed dark corners at high speed & mixed HTML/CRT HUD | While `styles.css:2319` correctly disables `#arcade-scanlines` and canvas CSS `filter`, `#speed-vignette` (`opacity` up to `0.85` @ 58% dark) still stacks **on top of** `_crtCanvas`’s built-in 34% vignette (`retro1982.js:1516`), and `#right-telemetry-dock` remains visible in `2026_UPDATED + 1982_ARCADE` alongside `_renderTelemetryArcadeWidget`. |

---

### 1.2 Sub-Pixel Road-Curve Accumulation & True Vertical Hill Projection

#### A. Smooth $C^1$ Curvature Deadzone Replacement (`src/track.js:527`, `src/physics.js:421`)
Hard zero-clamping must be replaced by a smooth $C^1$ cubic soft-knee deadband so straightaways remain rock-steady without snapping at turn-in:

$$\kappa_{\text{smooth}}(\kappa) = \operatorname{sign}(\kappa) \cdot \begin{cases} 0, & |\kappa| \le \kappa_0 \\ |\kappa| \cdot t^2 (3 - 2t), \quad t = \dfrac{|\kappa| - \kappa_0}{\kappa_1 - \kappa_0}, & \kappa_0 < |\kappa| < \kappa_1 \\ |\kappa|, & |\kappa| \ge \kappa_1 \end{cases}$$

with $\kappa_0 = 0.0008\text{ m}^{-1}$ ($R = 1250\text{ m}$) and $\kappa_1 = 0.0035\text{ m}^{-1}$ ($R = 285\text{ m}$). Note: `track.js:520` stores dimensionless scaled curvature (`radPerM * ~38`); align `retro1982.js` directly to true metric signed curvature $\kappa(s)\text{ [rad/m]}$ from the $C^2$/Catmull-Rom track spline (`track.getMetricCurvatureAt(s)` or exact tangent derivative $d\psi/ds$).

#### B. Trapezoidal Sub-Meter Curve & Elevation Table (`src/retro1982.js:25-26, 1778-1793`)
Increase lookahead resolution from `96 × 2.0 m` to **`WORLD_STEPS = 160` at `WORLD_STEP_M = 1.25` (`200 m` horizon)** in pre-allocated `Float32Array(161)` buffers (`_worldCurveM`, `_worldElevM`), integrated via **2nd-order Trapezoidal Rule** seeded with the sub-step fractional phase:

```js
// Exact 2nd-order trapezoidal integration along track arc-length
let prevK = _smoothCurvature(track.getPhysicsCurvature(pS)) * CURVE_RAD_PER_M;
const herePose = this._readTrackCubicPose(track, pS); // C1 cubic Hermite yaw & elev
const sinSlope0 = Math.sin(herePose.pitchRad);

_worldCurveM[0] = 0;
_worldElevM[0] = 0;
let heading = 0;
let latM = 0;

for (let k = 1; k <= WORLD_STEPS; k++) {
  const dM = k * WORLD_STEP_M; // Real forward distance [m]
  const sSample = (pS + dM) % totalLen;
  const curK = _smoothCurvature(track.getPhysicsCurvature(sSample)) * CURVE_RAD_PER_M;
  const nextHeading = heading + 0.5 * (prevK + curK) * WORLD_STEP_M;
  latM += 0.5 * (heading + nextHeading) * WORLD_STEP_M;
  heading = nextHeading;
  prevK = curK;

  _worldCurveM[k] = latM;
  // Relative vertical height above tangent plane at player camera (fixes dead L1792!)
  const poseK = this._readTrackCubicPose(track, sSample);
  _worldElevM[k] = (poseK.elev - herePose.elev) - dM * sinSlope0;
}
```

#### C. *Pole Position II* Scanline Z-Buffer / Hill Crest Occlusion (`src/retro1982.js:1820-2006`)
To actually use `_worldElevM` cleanly without tearing scanlines on crests (e.g., Fuji Sector 3, Monaco Beau Rivage, Spa/Suzuka Esses):
1. Iterate **front-to-back** from `yScreen = drawBottomY - 1` up toward `0`, maintaining `let minRenderedY = drawBottomY`.
2. For each base perspective step `i` (`distReal` from `NEAR_DIST_M` to `FAR_DIST_M`), read interpolated `curveMeters` and `elevMeters` from `_worldCurveM` and `_worldElevM`.
3. Project vertical screen row including hill height (`CAM_EYE_HEIGHT_M = 1.05` in Chase, `0.78` in Cockpit, `0.42` in Nose):

$$y_{\text{proj}} = y_{\text{horizon,float}} + \frac{(h_{\text{cam}} - \Delta y_{\text{elev}}(d)) \cdot f_y}{d}$$

4. Span-fill integer rows from `yTop = Math.max(0, Math.floor(yProj))` to `minRenderedY - 1`, then set `minRenderedY = yTop`.
   - **Result:** Uphill sections rise naturally above the nominal horizon line; crests automatically occlude dipped asphalt behind them (*hidden-surface removal in $O(H)$ with zero overdraw*); downhill drops open panoramic road visibility!

#### D. Sub-Pixel Symmetric Scanline Quantization & 2-Pixel Namco Edge Antialiasing
Eliminate independent `Math.round` width chatter (`L1869-1872`) by locking width prior to centering and applying Namco’s authentic 1-pixel sub-alpha/dithered outer shoulder transition:

```js
// Lock integer half-width FIRST so total road pixel width NEVER chatters as centerX pans!
const halfWInt = Math.round(roadHalfPx);
const centerFixed = centerX; // float
const roadCenterInt = Math.floor(centerFixed);
const subFrac = centerFixed - roadCenterInt; // [0.0 .. 1.0)

const roadL = roadCenterInt - halfWInt;
const roadR = roadCenterInt + halfWInt;
// Optional authentic CRT 1-px edge blend at x = roadL - 1 and x = roadR:
// Blend kerb/verge border pixel by (1 - subFrac) on left and subFrac on right!
```

Apply the exact same `roadCenterInt + Math.round(relOffset)` pattern to `curbW`, racing-line rubber grooves, and lane markers so every stripe moves in rigid lockstep with the road centerline.

#### E. Sub-Pixel Horizon Pitch Stabilizer & Single-Period Lane Dashes
1. **Fractional Horizon (`L1694-1700`):** Smooth `pitchFloat = this._smoothedPitchPx` via critical damping ($\tau = 0.055\text{ s}$). Set `horizonY = Math.floor(baseHorizonY + pitchFloat)` and render a **1 px horizon-haze blend scanline** at `horizonY` weighted by `frac = (baseHorizonY + pitchFloat) - horizonY`. Whole-screen `1 px` horizon snapping disappears completely.
2. **Damped Vanishing-Point Yaw (`L1818`):** Filter `visualSlipYaw` with a `9 Hz` low-pass filter on `player.yawAngle` and attenuate near the camera (`(1 - v)^1.65`) so counter-steer snaps rotate the car sprite crisply without whipping the distant mountain apex.
3. **Fix Road Dash Beating (`L1853, 1989`):** Delete `speedDashBand` (`L1853`). Use **one** authentic Namco road-stripe cadence: `12.0 m` cycle (`5.0 m` crisp `#FCFCFC` dash, `7.0 m` asphalt gap: `(absWorldM % 12.0) < 5.0`), gated cleanly for `v > 0.04` (with `50%` faded intensity for `0.04 < v < 0.10` to prevent horizon Nyquist aliasing).

---

### 1.3 Horizon Parallax Smoothing ($2\pi$-Periodic Unified Angular Domain)

Currently, `retro1982.js:2625-2690` scrolls 4 sky layers with arbitrary pixel-per-radian constants (`81.49`, `80`, `95`, `115`) wrapped by viewport-dependent moduli (`512`, `W`, `max(380, W+90)`, `max(320, W+80)`). Whenever the browser resizes or `_unwrappedYaw` crosses a large multiple, layers jump relative to Mount Fuji.

**Exact Specification:**
1. **Cubic-Spline Track Yaw (`_readTrackCubicPose`):** Replace piecewise-linear `tangent` lerping (`L1540`) with **Catmull-Rom / Hermite tangent interpolation** across `s` and smooth `camYawRad` with a `22 Hz` angular unwrap filter (`this._smoothCamYawRad`).
2. **Harmonic $2\pi$-Locked Layer Rates:** Bake all panoramic offscreen layers against a canonical angular loop width `PANO_LOOP_W = 1024` pixels ($1024\text{ px} \equiv 2\pi\text{ rad} \implies K_{\text{yaw}} = \frac{1024}{2\pi} = 162.97466\text{ px/rad}$):
   - **Distant Stars (`L2625`):** Angular rate $0.5 \times K_{\text{yaw}}$ (`512 px` loop = $\pi$ harmonic, seamlessly tiled twice per $360^\circ$).
   - **High Cirrus / Cumulus Cloud Strip (`_cloudStripCanvas`):** Bake into a tileable `512 × 36` offscreen canvas; scroll at $0.5 \times K_{\text{yaw}} \cdot \psi_{\text{cam}} + 1.8 \cdot t_{\text{sec}} \pmod{512}$.
   - **Primary Horizon Panorama (Mount Fuji / Casino / Abbey / Vegas Sphere, `_skyPanoCanvas`):** Upgrade from `512 × 62` to **`1024 × 68`**; scroll at $1.0 \times K_{\text{yaw}} \cdot \psi_{\text{cam}} \pmod{1024}$.
   - **Midground Silhouette Landmarks (Ferris wheel, pines, viaduct):** Bake into a tileable **`1024 × 32`** foreground-horizon strip scrolling at $1.25 \times K_{\text{yaw}}$ (exact $5/4$ harmonic over a $4\pi$ wrap or $1.0 \times K_{\text{yaw}}$ with depth-layered parallax).
3. **Sub-Pixel Horizontal Blit:** Because the main canvas uses `imageSmoothingEnabled = false`, integer `Math.round(scrollPx)` moves mountains in `1 px` ticks during slow sweepers. Eliminate slow-pan ticking by keeping `scrollPx` at `0.5 px` precision via a **2-phase pre-shifted panorama pair** (`_skyPanoPhase0` and `_skyPanoPhaseHalf` shifted by `0.5 px` during track build) OR letting only the sky-strip blit run with `ctx.imageSmoothingEnabled = true` (`0.02 ms` cost on a `320×68` rect) before restoring `ctx.imageSmoothingEnabled = false` for road, cars, and HUD!

---

### 1.4 Authentic Namco Billboard/Sign Sprite Scaling & De-Cluttering

#### A. What Must Be Removed from `src/retro1982.js` & `styles.css`
1. **Remove `_renderGrandstandFlaresAndConfetti` (`L2482, 2770-2828`):** Delete rising flare smoke columns and falling confetti rectangles completely in `1982` visual mode.
2. **Remove `_renderSpeedWindLines` (`L2485, 2851-2867`):** Delete horizontal white edge streaks; speed sensation in *Pole Position* comes purely from crisp 60 Hz kerb/stripe cadence, engine pitch, and roadside billboard rush.
3. **Prevent Double Speed-Vignette (`styles.css:2322`):** Add `body.retro-1982-active #speed-vignette { display: none !important; }` so `#speed-vignette` stops compounding on top of `_crtCanvas`’s internal CRT bezel vignette (`L1512`). Reduce `_crtCanvas` scanline alpha from `0.17` to `0.12` and vignette edge alpha from `0.34` to `0.22` so outer wing mirrors and corner signs stay bright and punchy.
4. **Prune Prop Spam (`L2186-2346`):**
   - Cut procedural outer-verge random billboards from `50` (`L2186`) down to **`18–22` evenly spaced Namco-style sponsor pairs** (`>= 180 m` spacing per side, never overlapping `track.billboards` within `±35 m`).
   - Remove floating grandstand vertical-stick flags (`L2253`) that clip behind billboards; keep clean horizontal pixel crowd bands inside actual grandstand structures and 4 corner marshal posts (`L2282`) that only wave yellow/checkered flags when race state warrants.

#### B. Hardware-Accurate Namco Sprite Zoomer (`_quantizeNamcoSpriteScale`)
In 1982 Namco hardware, sprites were scaled from `32×32` / `64×32` ROM tiles using a hardware shrink accumulator that preserved exact aspect ratio and bottom-contact grounding. Currently `L2419-2420` computes `dstW = Math.max(2, Math.round(item.w * item.scale))` and `dstH = Math.max(2, Math.round(item.h * item.scale))` independently, causing billboards and rival tires to squish/stretch aspect ratio at `distReal = 45..130 m`.

**Exact Specification:**
1. Quantize continuous perspective `rawScale` through a **64-entry Precomputed Namco Hardware Zoom LUT** (`NAMCO_ZOOM_LUT`, logarithmic-linear steps from `1/32` to `2.50` matching 6-bit shrink ROM behavior without coarse 1979 popping):
   ```js
   // Maintain exact aspect lock from canonical base dimensions (w0, h0):
   const zoom = quantizeNamcoZoom(item.scale); // monotonic 64-step hardware LUT + hysteresis
   const dstW = Math.max(2, Math.round(item.w * zoom));
   const dstH = Math.max(2, Math.round(dstW * (item.h / item.w)));
   const dstX = Math.round(item.x - dstW * 0.5);
   const dstY = Math.round(item.groundY) - dstH; // Strictly grounded to scanline yProj!
   ```
2. **Authentic Period-Inspired Parody Sponsor Art (`BILLBOARD_THEMES_1982`, `L1014`):** Refresh billboard pixel art to evoke iconic 1982 Fuji Speedway *Pole Position* color blocks (100% trademark-safe original parody emblems):
   - **`NAMCO-82`** (Red `#E4002B` script on crisp `#FCFCFC` board with `#101420` 2 px frame & twin steel posts)
   - **`FUJI FILM-X` / `FUJI GP`** (Emerald `#00A844` header + `#FCFCFC` body + red corner flash)
   - **`POLE OIL 76`** (Royal blue `#1838D8` circle on `#FF7800` orange/white panel)
   - **`CENTURY TIRES`** (Yellow `#FCE400` winged tire mark on `#101420` black board)
   - **`DIG DUG` / `GALAGA` / `PAC-GP`** (Authentic Namco cabinet self-cameo billboards that famous 1982 *Pole Position* cabinets featured right along Fuji Speedway!).

---

### 1.5 Crisp 1982 Arcade Typography & HUD Banner Architecture

#### Audit Findings (`src/retro1982.js:55-109, 3773, 3863-4028`, `src/main.js:2498`, `src/hud.js:8`)
1. **Emoji-Mangled Callout Strings (`src/main.js:2498`):** `hud.el.callout.textContent.replace(/[^\x20-\x7E]/g, '')` strips emojis like `🏆` and em-dashes `—` out of `'🏆 P1 — INTO THE LEAD! (+50 PTS)'`, leaving awkward double spaces (`' P1  INTO THE LEAD! (+50 PTS)'`) rendered in a tiny `scale = 1` (`5×7 px`) box at `retro1982.js:3994`.
2. **Lap-Time Format Split:** `hud.js:8` formats `58"50` (`SS"CC`), whereas `retro1982.js:3773` formats `0'58"50` (`M'SS"CC`). Authentic Namco *Pole Position* displays **`0'58"50`** (`M'SS"CC` with single-quote minute mark and double-quote second mark, centiseconds `00..99`).
3. **Tiny Un-Iconic `PREPARE TO QUALIFY`:** In 1982 *Pole Position*, `PREPARE TO QUALIFY` (attracting into Lap 1 / Grid) and `QUALIFIED! EXTENDED PLAY` / `PASSING BONUS` are bold, unmistakable 2× pixel arcade banners—not a tiny 7 px footnote.

#### Concrete Typography Specification
1. **Upgrade Bitmap Font Renderer (`_drawText`, `L1616`):**
   - Add missing glyphs `'!'`, `'+'`, `'<'`, `'>'`, `'['`, `']'`, `'='`, `'_'` (verify 8×8 / 5×7 sharpness) and support **2-color vertical scanline gradient fills** (`topColor`, `bottomColor`) with crisp `1 px` `#000000` drop-shadow (`dx = +1, dy = +1`)—the signature 1982 Namco arcade tile-ROM look!
2. **Dedicated Clean Arcade Callout Channel (`raceState.arcadeBanner`):**
   - Pass structured arcade banner events (`{ headline, subline, palette, ttl }`) directly instead of scraping DOM `.textContent`:
     - Pre-Grid / Lights Out: **`PREPARE TO QUALIFY`** (`scale = 2` on landscape, `scale = 1` bold-wide on `196 px` portrait; `#FCE400` top / `#FF5800` bottom + `#00E8D8` border frame, accompanied by a classic pixel Goodyear-style blimp towing a `POLE POSITION` banner across the upper sky during the 5-red-light sequence!).
     - Lap Completion: **`LAP TIME  0'58"50`** (`#00FF66` if personal best, `#FCE400` otherwise, flashing 4 Hz for `1.8 s`).
     - Clean Overtake: **`PASSING BONUS  +50`** (compact floating `scale = 1` `#00FF66` popup anchored just below the top HUD bar at `y = 30`, never blocking the road horizon!).
     - Time Checkpoint / Race Extension: **`EXTENDED PLAY!`** (`#00E8D8` / `#FCFCFC`).
     - Checkered Flag: **`GOAL IN!`** (`#FCE400` / `#FF2244` classic Namco finish banner).
3. **Unified Top Namco Arcade Header (`y = 3..26`):**
   - Left Column (`x = 6`): `1UP` (`#FF2A2A`) above 6-digit zero-padded score `004250` (`#FCFCFC`), plus `TOP` (`#FCE400`) best lap `0'58"50`.
   - Center Column (`x = W/2`): Giant `scale = 2` **`TIME`** (`#FCE400`) + remaining seconds `75` (`#FCFCFC`, flashing `#FF2A2A` below `15 s`).
   - Right Column (`x = W - 6`): `POS 01/12` (`#00E8D8`), `LAP 1/3` (`#FCFCFC`), and crisp gear indicator (`LOW` `#FCE400` / `HIGH` `#00FF66` in 2-speed mode, or `GEAR 1..8` in 8-speed mode).

---

## Section 2: Polished Retro Cockpit View & Camera Suite (`cameraIndex = 0..3`)

### 2.1 Audit of Current Cockpit View (`cameraIndex === 2`, `src/retro1982.js:3343-3655`)

Evaluating the current integer-pixel math in `_renderCockpitViewForeground` and `_renderCockpitWingMirrors` exposes **four severe geometric collisions**:

1. **Collision #1 — Wing Mirrors Crush Front Slick Tires & Wishbones (`L3370-3414` vs `L3556-3652`):**
   - On standard Landscape (`W = 320, H = 240, cx = 160`):
     - Front slick tires (`wheelW = 24, wheelH = 34`): `wheelOutHalf = min(round(320 * 0.36), 116) = 115` → Left tire occupies **`x = 45..69, y = 158..192`**; Right tire occupies **`x = 251..275, y = 158..192`**.
     - Upper/lower chrome suspension wishbones span `x = 69..132` (left) and `x = 188..251` (right) at **`y = 168..184`**.
     - Wing Mirrors (`mirrorW = 40, mirrorH = 18`): `leftMirrorX = max(8, 160 - 108) = 52`, `mirrorY = 190 - 18 - 6 = 166` → Left mirror bezel occupies **`x = 50..94, y = 164..186`**; Right mirror bezel occupies **`x = 226..270, y = 164..186`**!
     - **Overlap Area:** **`21 × 22 px` (`462 px²`) per side** where the mirror housing stamps directly on top of the inner half of the spinning front tire and hides the upper suspension wishbone!
   - On Mobile Portrait (`W = 196, H = 350, refBottomY = 266, cx = 98`):
     - Left tire is at `x = 28..44`, Left mirror is at `x = 2..34` (`10 px` overlap at straight-ahead, increasing to **`16 px` collision** on left steering lock!).
2. **Collision #2 — Anachronistic 2026 Halo Slices the 1982 Horizon (`L3442-3451`):**
   - `haloArchY = max(28, horizonY - 34)` draws a solid horizontal bar across the entire sky and a `6–10 px` wide vertical center pillar from `y = 86` to `y = 168`, cutting straight across `horizonY = 117`, blocking distant rivals on straights, splitting Start Gantry lights, and violating 1982 Formula 1 history (1982 ground-effect F1 cars—Brabham BT50, Ferrari 126C2, Williams FW08, Lotus 91—were **100% open-cockpit**; the FIA Halo did not exist until **2018**).
3. **Collision #3 — MOMO Steering Wheel & Gloves Cover Dashboard Readouts (`L3486-3545`):**
   - Dashboard panel occupies `y = 191..212` (`KM/H` at `x = cx - 44, y = 199`; **`G1` gear at `x = cx + 24, y = 198`**; **`ERS` bar at `x = cx - 26..+26, y = 207..210`**).
   - Scaled MOMO wheel sprite (`59×59 px`) is blitted at **`x = cx - 29..+29, y = 196..255`**! Its top leather rim (`y = 196..204`), yellow top-center tape, and rotating red Nomex gloves (`y = 193..206` at `±35°` lock) draw **directly on top of** `G1` and the `ERS` bar!
4. **Excessive Road Occlusion (`60%` Blocked):**
   - Between `horizonY = 117` and `bottomY = 240` (`123 px` total road height), the nosecone rises to `noseTipY = 168` and tires to `158`, leaving only `41–51 px` of unobstructed center road.

---

### 2.2 Redesigned 1982 Open-Cockpit Geometry (`cameraIndex === 2`) — Zero-Overlap Pixel Spec

The redesigned 1982 Cockpit View models an authentic **1982 Ground-Effect Open-Cockpit F1 Tub** (inspired by the 1982 Brabham BT50 / Ferrari 126C2 / Namco *Pole Position* promo cab art): **zero Halo**, low riveted aluminum/red-fiberglass cowling, smoked polycarbonate windscreen lip, wide-stance exposed Goodyear/Bridgestone front slicks on chrome double-wishbones, cowling-shoulder bullet mirrors positioned cleanly *aft & inboard* (landscape) or *compactly docked on cowling ears* (portrait) with **strict mathematical non-intersection**, and an elevated **Central Steering-Column Instrument Binnacle** whose analog/LED arc sits cleanly **inside/above** a lower-mounted 3-spoke suede MOMO wheel so neither rim nor gloves ever touch a single digit!

```
LANDSCAPE 320x240 COCKPIT VIEW (cameraIndex === 2) — ZERO OVERLAP COORDINATE MAP
y=0   +-----------------------------------------------------------------------+
      | 1UP 004250      TOP 0'58"50     TIME 74      POS 01/12  LAP 1/3  HIGH | y=0..26
y=27  |                      UNOBSTRUCTED SKY & FUJI                          |
y=114 |~~~~~~~~~~~~~~~~~~~~ HORIZON LINE (y = 114, 100% HALO-FREE!) ~~~~~~~~~~|
      |                                                                       |
      |            88 PX (70%) WIDE-OPEN FORWARD ROAD SIGHTLINE!              |
      |               (Apexes, kerbs & rivals 100% visible)                   |
y=168 |  [TIRE L]                                                   [TIRE R]  |
      |  x=18..44 ====(chrome wishbones)====[NOSE]====(wishbones)=== x=276..302
y=186 |          [MIRROR L: x=54..90]   /  #1 NOSE  \  [MIRROR R: x=230..266] |
y=202 |---------/======================[WINDSCREEN LIP]======================\--|
      | COWLING |  [FUEL] [TIRE/DMG]   [RPM LED ARC 5..13k]   [294 KM/H  H ] | y=203..216
y=217 |         |                    .---(MOMO RIM)---.                      |
      |         |                  ( [GLOVE]  o  [GLOVE] )                   | y=217..240
y=240 +---------+------------------------------------------------------------+
```

#### Exact Pixel Coordinate Budget Table (Desktop/Landscape vs Mobile Portrait)

Let `B = refBottomY` (`240` on Landscape `H = 240`; `Math.round(H * 0.75)` on Portrait `W = 196`, e.g. `B = 262` for `H = 350`), and `cx = Math.floor(W * 0.5)`.

| Cockpit Element | Landscape (`W = 320..684, B = 240`) | Mobile Portrait (`W = 196, B = 262`) | Overlap Proof |
| :--- | :--- | :--- | :--- |
| **Horizon Row (`horizonY`)** | `114 + pitchInt` (`126 px` road below horizon) | `Math.round(B * 0.44)` = `115` (`147 px` road below horizon) | **Zero Halo** (`y = 27..182` center is 100% open sky + asphalt). |
| **Nosecone Tip (`noseTipY..cowlTopY`)** | `x = cx - 18 .. cx + 18`, `y = B - 50 (190) .. B - 38 (202)` (subtle `#1` nose crest) | `x = cx - 12 .. cx + 12`, `y = B - 44 (218) .. B - 34 (228)` | Low-profile ground-effect nose stays `76 px` below horizon! |
| **Smoked Windscreen Lip** | `x = cx - 48 .. cx + 48`, `y = B - 41 (199) .. B - 38 (202)` (`1 px` `#88D8FF` specular rim + `50%` smoked tint) | `x = cx - 34 .. cx + 34`, `y = B - 37 (225) .. B - 34 (228)` | Translucent polycarbonate lip frames center apex without solid block. |
| **Steered Front Slick Tires** | `wheelW = 24, wheelH = 34`, `steerPx = round(steer * 5)` (`±5 px`). Center X: `cx ± min(round(W * 0.43), 156)`. At `W=320` (`±138`): Left **`x = 10..34 ± 5` (`5..39`)**, Right **`x = 286..310 ± 5` (`281..315`)**; **`y = B - 72 (168) .. B - 38 (202)`**. | `wheelW = 15, wheelH = 26`, `steerPx = round(steer * 3)` (`±3 px`). Center X: `cx ± 84` (`14` & `182`). Left **`x = 7..22 ± 3` (`4..25`)**, Right **`x = 174..189 ± 3` (`171..192`)**; **`y = B - 62 (200) .. B - 36 (226)`**. | Pushed out to realistic wide F1 track width (`1.80 m` front track). |
| **Outboard F1 Wing Mirrors** | `mirrorW = 36, mirrorH = 15` (+ `2 px` stalk). Left **`x = cx - 106 .. cx - 70` (`54..90`)**, Right **`x = cx + 70 .. cx + 106` (`230..266`)**; **`y = B - 56 (184) .. B - 41 (199)`**. | `mirrorW = 26, mirrorH = 12`. Left **`x = 30 .. 56`**, Right **`x = 140 .. 166`**; **`y = B - 50 (212) .. B - 38 (224)`**. | **Clearance from tires:** Landscape `54 - 39 = 15 px` clear gap even at full lock! Portrait `30 - 25 = 5 px` clear gap at full lock! **0 px overlap!** |
| **Chrome Double-Wishbones & Tie-Rods** | Span from inner upright (`x = 34+steerPx` / `286+steerPx`) to tub bulkhead (`x = cx ± 22`) at `y = B - 52 (188)` and `y = B - 43 (197)`, drawn *behind* mirror stalks. | Span `x = 22+steerPx .. cx - 16` at `y = B - 44 (218)` and `B - 38 (224)`. | Connects tires mechanically to chassis with zero floating tires. |
| **Riveted Cockpit Cowling & Dash Binnacle** | `cowlTopY = B - 38 (202)`. Dash band **`y = 203 .. 216` (`14 px` tall)**: Left pod (`x = cx - 86 .. cx - 38`): `FUEL` + 4-tire mini matrix; Center pod (`x = cx - 34 .. cx + 34`): curved 13-LED `RPM` strip + shift flash; Right pod (`x = cx + 38 .. cx + 88`): `294` speed + `LOW`/`HIGH`/`G8`. | `cowlTopY = B - 34 (228)`. Dash band **`y = 229 .. 240` (`12 px` tall)**: Left (`x = 10..56`): `FUEL`/Tire pips; Center (`x = 62..134`): 11-LED `RPM` bar; Right (`x = 140..186`): `294` + `H`/`G8`. | All gauges live strictly inside `y = 203..216` (Landscape) / `y = 229..240` (Portrait). |
| **9-Angle Suede MOMO Wheel & Gloves** | Cut top-half `52 × 24 px` visible upper wheel arc anchored at hub `(cx, B + 8 = 248)`, outer rim radius `R = 30 px` → **Top of rim & yellow center stripe sit at `y = B - 22 (218) .. B (240)`**! Gloves at `10` & `2` o’clock span `y = 221..240`. | Hub at `(cx, B + 6 = 268)`, outer rim radius `R = 24 px` → **Top of rim & gloves sit at `y = B - 20 (242) .. B (262)`**! | **Clearance from dash gauges:** `218 - 216 = +2 px` vertical buffer at all 9 steering angles (`-44° .. +44°`). **0 px overlap!** |

#### Live Rear-View Mirror Rendering Upgrade (`_renderCockpitWingMirrors`, `L3556`)
- Currently `L3632` draws a tiny 4-rect placeholder car inside each mirror. Upgrade mirror glass (`34 × 13 px` Landscape / `24 × 10 px` Portrait) to:
  1. Clip strictly to inner mirror glass rect (`ctx.save(); ctx.beginPath(); ctx.rect(...); ctx.clip()`).
  2. Render mini sky, horizon, receding grey asphalt + red/white edge kerbs shifted by `+player.xOffset * 4` (horizontally flipped mirror reflection!).
  3. Blit actual cached rival `_rivalSprites[teamIdx][4]` (front-aspect car sprite!) for the **2 closest trailing cars within `45 m` behind** (`relS` in `[-45, -1.5]`), horizontally mapped so a rival diving up your inside-left appears in the **Left Mirror** and an outside-right challenger appears in the **Right Mirror**!

---

### 2.3 Complete 4-Camera Suite Calibration (`cameraIndex = 0..3`)

Currently `CAM_Z_OFFSET_M = 5.5` (`L21`) and `NEAR_DIST_M = 2.0` (`L19`) are hardcoded identically for all 4 cameras, making Nose Cam and Cockpit Cam share Chase Cam’s longitudinal origin. Each camera must bind its own physical eye offset and projection constants:

| `cameraIndex` | Camera Name (1982 Authentic) | `camZOffsetM` (rel to player CG) | `nearDistM` | `camEyeHeightM` | `camHorizonDelta` | `camRoadZoom` | Specific Visual Polish Required |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **`0`** | **1982 Arcade Chase** (Default) | `-5.5 m` (behind car) | `2.0 m` | `1.12 m` | `0 px` | `1.00` | Keep iconic #1 rear-3/4 sprite at `groundY = B - 12`; **fix Portrait apron bug**: fill `y = B .. H` cleanly with dark CRT bezel `#070A12` (or extend road perspective cleanly to `H`) instead of stretching `v > 1.0` near-field lines at `L1834`! |
| **`1`** | **1982 Roll-Hoop Onboard** (replaces anachronistic Halo T-Cam) | `-0.35 m` (above roll hoop) | `1.5 m` | `1.02 m` | `+4 px` | `1.05` | **Remove Halo bar (`L3313-3318`)** that collides with `#1` nose number! Render top of driver’s white/striped **1982 Bell Star helmet** (`cx ± 13, y = B - 16..B`) vibrating subtly (`±1 px` on kerbs), tapered red/white nosecone (`B - 46..B`), chrome wishbones, and wide steered front slicks. |
| **`2`** | **1982 Open Cockpit** | `+0.15 m` (driver eyes) | `1.25 m` | `0.78 m` | `-4 px` | `1.10` | Implement exact zero-overlap layout from **Section 2.2** (Halo-free horizon, outboard mirrors cleared of wide slicks, column binnacle above lowered MOMO rim/gloves, live rear-view rival sprites). |
| **`3`** | **Low Front-Wing Nose Cam** | `+1.85 m` (nose tip) | `0.85 m` | `0.36 m` | `-10 px` | `1.18` | Clamp steered inner tire edges (`wx = Math.max(0, ...)` on left, `Math.min(W - innerWheelW, ...)` on right) so `steerPx` never clips off-canvas (`L3674`), and reflect left/right front-wing flap damage directly on the visible endplates (`L3686`). |

---

## Section 3: True Sim-Feature Parity in 1982 Style

### 3.1 Resolving the `mode` vs `visualStyle` Architecture Schism

#### Current Broken Matrix in Codebase
- `config.mode === '1982_ORIGINAL'` (`main.js:776`, `physics.js:374, 439, 492, 672, 785, 863, 1098`, `pit_damage_caution.js:204, 491, 572`):
  - **Hard-disables** tire wear, tire thermals, flat-spots, punctures, fuel mass/burn, wing/suspension damage, pit stops, and **forces `rawW = 0.0` (dry grip even during Monsoon rain!)**, while turning any `1 km/h` rival touch into an instant player-only fireball explosion.
- `config.mode === '2026_UPDATED'` + `config.visualStyle === '1982_ARCADE'`:
  - Runs sim physics underneath, **but** leaves flat-spots, wing/suspension damage, fuel load, and AI wet spray visually unrepresented in `retro1982.js`, while leaking modern HTML `#telemetry-2026-panel`, `#pit-stop-overlay`, and `#pit-strategy-drawer` glass cards over the 1982 pixel canvas!

#### Target Unified Architecture: Full-Sim Physics Under Pure 1982 Presentation
1. **Decouple Gearbox/Aero Era Rules from Core Tire/Track Physics:**
   - **Both** `1982` and `2026` modes must run the **full physical tire, brake, fuel-mass, damage, weather-moisture, pit-service, and AI-personality simulation**!
   - What distinguishes **1982 Rules (`mode === '1982_ORIGINAL'`)** from **2026 Rules (`mode === '2026_UPDATED'`)** should be **period-authentic vehicle regulations & race structure**, NOT lobotomized physics:
     - **1982 Drivetrain & Aero:** Classic `LOW` / `HIGH` 2-speed dog-leg turbo gearbox (or optional 6-speed manual), ground-effect venturi downforce + mechanical turbo boostspool (`1.4 bar` wastegate surge instead of electric `ERS`/`DRS`), checkpoint countdown timer (`EXTENDED PLAY`) + lap race, and classic high-stakes collision threshold.
     - **2026 Drivetrain & Aero:** 8-speed seamless paddle gearbox, `MGU-K` `ERS` battery deploy/harvest + `DRS` rear-wing flap.
   - Add a clean Garage toggle `arcadeRulesPreset: 'SIM_PARITY' | 'CLASSIC_COINOP'` (defaulting **`'SIM_PARITY'`** so every player launching 1982 mode experiences rich tire wear, flat-spots, fuel weight, wet grip, pit crew stops, and repairable damage in pure 1982 pixel style, while purists who want infinite-tire coin-op sprint can still toggle `'CLASSIC_COINOP'`).
2. **100% Native 1982 HUD Discipline (`body.retro-1982-active`):**
   - When `visualStyle === '1982_ARCADE'`, hide `#telemetry-2026-panel` in CSS (`body.retro-1982-active #telemetry-2026-panel { display: none !important; }`) so there is **never** a duplicate modern HTML telemetry card next to the 1982 bitmap HUD! Keep only a compact retro-styled `[B] BOX` / `[P] PLAN` pixel button pill on touch screens (or render it cleanly inside the 1982 top-right quick strip).

---

### 3.2 Exact 1982 Translation Matrix for All 7 Simulation Systems

#### 1. Tire Wear, Compounds, Thermals & Brake-Lockup Flat-Spots
- **Physics Contract (`src/physics.js`):** Remove `mode === '1982_ORIGINAL'` bypasses on `tireWear`, `tireTemp`, and brake lockup. Track per-corner or axle `flatSpot` severity (`0.0 .. 1.0`, accumulated when `brake > 0.78 && frontSlipRatio > lockupThreshold`, scrubbed down slowly over laps or cleared to `0.0` on pit tire change).
- **1982 Pixel Visual & Tactile Translation (`src/retro1982.js`):**
  - **Sidewall Compound Ring:** Paint a crisp `1 px` sidewall stripe on player/rival slicks matching active compound (`#FF2A2A` Soft, `#FFD600` Medium, `#FCFCFC` Hard, `#00E676` Inter, `#00B0FF` Wet).
  - **Progressive Wear Tread Darkening:** As `minTireLife` drops below `0.45`, darken the light-grey tread sheen (`#3A3E4A → #1F2229`) and expose a `1 px` dark corded center band (`#5A4A42`) below `0.22` life so worn tires are visibly "grained/corded" right on the car sprite and open-cockpit front slicks!
  - **Brake Lockup Pixel Smoke & Flat-Spot Patch:**
    - During active front brake lockup (`car.isLockingBrakes`), emit crisp `2×2` / `4×3` `#DCE8FF` / `#FFFFFF` pixel smoke puffs directly from the **inside front tire contact patch** (visible in Chase, Roll-Hoop, and Cockpit views!).
    - When `car.flatSpot > 0.08`, draw an asymmetric dark flat-spotted patch (`#101218` + `#707888` scuff) rotating at wheel angular frequency $\omega_{\text{wheel}} = v / r_{\text{tire}}$ on the front tire sprites, **plus** inject a deterministic vertical `±1 px` wheel/mirror/steering-rim shudder at $f = \min(18\text{ Hz}, \frac{v}{2\pi r_{\text{tire}}})$ when `flatSpot > 0.20` and `speedKmh > 110`!
  - **1982 Audio Hook (`src/audio.js`):** Modulate `curbSubOsc` / LFSR noise thump at $\omega_{\text{wheel}}$ proportional to `flatSpot * speedNorm`—giving authentic rhythmic `thump-thump-thump` tactile feedback on the straights!

#### 2. Wing & Suspension Damage
- **Physics Contract (`src/physics.js`, `src/pit_damage_caution.js`):** Enable `damage.frontWing`, `damage.rearWing`, and `damage.suspension` (`0.0 .. 1.0`) across both modes, plus `damage.frontWingSide` (`-1` left, `+1` right, `0` both) determined by impact lateral sign.
  - `frontWing`: Progressive high-speed turn-in understeer (`up to -28%` front aero grip).
  - `rearWing`: Top-speed aero drag penalty + high-speed lift-off oversteer (`DRS` locked closed).
  - `suspension`: Asymmetric steering pull torque (`±0.08` steer bias) + increased kerb instability.
- **1982 Pixel Visual Translation (`src/retro1982.js`):**
  - **Chase Cam (`cameraIndex === 0`):** Pre-bake or overlay lightweight damage masks:
    - `damage.frontWing > 0.25`: Missing left or right front-wing endplate tip + occasional orange/white `#FFE066` titanium floor sparks when bottoming out.
    - `damage.rearWing > 0.30`: Rear wing mainplane drawn tilted `1–2 px` askew with one missing side endplate (`#111318` cutout over one side of the `#FFFFFF` / sponsor wing).
    - `damage.suspension > 0.25`: Visibly cambered/tilted front wheel (`+1 px` vertical offset on damaged corner) + faint grey mechanical smoke wisp above `0.65`.
  - **Cockpit, Roll-Hoop & Nose Cams (`cameraIndex === 1, 2, 3`):**
    - `damage.suspension > 0.20`: Bent upper chrome wishbone kink (`1 px` droop) on damaged side + **persistent steering-wheel center offset** (`steerVisual = player.steer + suspensionPullAngle`), so the driver literally holds `10°` of opposite lock on the MOMO wheel down the straight!
    - `damage.frontWing > 0.25` in Nose Cam (`camIdx === 3`): Damaged side wing flap & endplate visibly snapped off (`L3686`), accompanied by crisp pixel debris fragments flying backward on initial impact!

#### 3. Fuel Load (`kg`) & Unified 1982 Arcade Telemetry Pod
- **Physics Contract (`src/physics.js`):** Enable real fuel mass (`fuelKg = fuelLapsRemaining * kgPerLap`, e.g., `1.8 kg/lap` scaled to race length) contributing to total vehicle inertia $m_{\text{total}} = m_{\text{dry}} + m_{\text{fuel}}$ in longitudinal $F = ma$, braking distance $d \propto m_{\text{total}}$, and cornering load sensitivity in both `1982` and `2026` modes. Light low-fuel qualifying/final-lap stints feel tangibly sharper and faster!
- **1982 Bitmap Telemetry Pod (`_renderTelemetryArcadeWidget`, `src/retro1982.js:3806`):**
  - Expand the compact upper-left pixel widget (`x = 4, y = 29`, `w = 42, h = 34`, zero overlap since `.minimap-card` is hidden in `retro-1982-active`!) to show **all sim vitals in pure 1982 pixel art**:
    1. **4-Corner Tire Life + Temp Tint (`FL, FR, RL, RR`):** `6×7 px` pixel tires colored by life/temp (`#00FF66` optimal, `#FCE400` worn/hot, `#FF2A2A` critical/blistered, blinking `F` pixel dot if flat-spotted) + single-letter compound badge (`S`/`M`/`H`/`I`/`W`).
    2. **Aero/Chassis Silhouette (`FW`, `SUS`, `RW`):** Crisp `3-segment` top-down mini F1 chassis icon adjacent to the tires coloring front wing, wishbones, and rear wing `#00FF66` / `#FCE400` / `#FF2A2A`.
    3. **Pixel `FUEL` Gauge (`F` + 10-pip segmented bar):** `#00E8D8` cyan segments counting down fuel load; blinks `#FF9100` / `#FF2A2A` with `LOW FUEL` banner warning when `< 0.8 laps` remain!
    4. **Boost / ERS Bar (`BST` in 1982 Turbo mode, `ERS` in 2026 Hybrid mode):** `#FCE400` turbo boost bar in 1982 mode; `#00E5FF` battery bar in 2026 mode.

#### 4. Curvature-Accurate Braking & Authentic Namco Corner Chevron Signs
- **Physics & Assist Contract (`src/physics.js:823`):** Replace the coarse 5-point lookahead brake assist (which currently chops `throttle = 0` aggressively even on `'LOW'`) with continuous forward corner scanning over $d \in [0, 180\text{ m}]$ computing exact grip-limited corner speed $v_{\text{lim}}(s) = \sqrt{\mu_{\text{eff}} g / |\kappa(s)|}$ and required braking distance $d_{\text{req}} = \frac{v^2 - v_{\text{lim}}^2}{2 a_{\text{brake,eff}}}$:
  - `'OFF'`: 100% manual pedals (enables genuine threshold braking & lockup skill).
  - `'LOW'` (`MIN`): Gentle progressive trail-brake safety net engaging only when $d \le 1.02 \cdot d_{\text{req}}$ (`maxAssistBrake = 0.35`, smooth throttle taper instead of binary `throttle = 0` cut, never preventing late-braking overtakes).
  - `'HIGH'` (`FULL`): Smooth ideal deceleration profile matching $d_{\text{req}}$ + wet/tire-wear/fuel-mass grip scaling.
- **1982 Visual Translation — Dynamic Namco Turn Signs & Braking Markers (`src/retro1982.js:2323`):**
  - Instead of placing identical generic `150/100/50` boards at only 4 hardcoded points, scan `track` curvature peaks at track-build time to automatically place:
    1. **Authentic 1982 Namco Red-on-White Corner Chevron Signs (`>` / `>>` / `>>>` or `<` / `<<` / `<<<`):** Placed along the **outside verge** of real corners (`R < 160 m`), with single chevron for fast sweepers (`90 < R < 160 m`), double chevron for medium corners (`45 < R \le 90 m`), and flashing/bold triple chevron for hairpins/chicanes (`R \le 45 m`)—just like original *Pole Position* at Fuji Turn 1 (Hairpin) and Dunlop Corner!
    2. **150m / 100m / 50m Pixel Meter Boards** accurately positioned ahead of every corner where $v_{\text{approach}} - v_{\text{lim}} > 55\text{ km/h}$.
    3. **Rubbered Racing-Line Groove Darkening (`L1974`):** Shift the two dark asphalt tire grooves (`grooveOffset`) laterally across the road surface along the **computed geometric apex line** (`-sign(κ) * 0.58 * roadHalfWidth` at apex, transitioning to `+sign(κ) * 0.62 * roadHalfWidth` at braking entry!) so players can read the true braking/turn-in/apex line directly off the 1982 asphalt texture without immersion-breaking neon arrows!

#### 5. Competitive AI Personalities & Fair Wheel-to-Wheel Contact
- **Audit Defect (`src/pit_damage_caution.js:572` & `src/retro1982.js:2358`):**
  - Currently in `1982_ORIGINAL`, `absLongM < 4.18 && absLatM < 1.80` immediately calls `_explodeCar(player)` even if two cars gently rub sidepods at `Δv = 3 km/h`, while AI cars Cycle generic `RIVAL_PALETTES_1982` disconnected from `AI_DRIVER_ROSTER`.
- **1982 Parity Specification:**
  1. **Roster-Accurate 1982 Team Liveries & Helmet Stripes:** Bind every AI car’s `teamIdx` directly to `AI_DRIVER_ROSTER[i]` (`colorHex` primary + contrasting wing/helmet accent) and display a crisp 3-letter driver tag (`VER`, `LEC`, `NOR` or classic `'82` codes) ONLY when within `22 m` ahead if HUD tags are enabled (off by default in pure 1982 mode for clean visuals).
  2. **Visible AI Archetype Tell-Tales on the 1982 Road (`src/ai.js` + `src/retro1982.js`):**
     - `LATE_BRAKER`: Dives down the inside line into `50m` boards and puffs occasional pixel front-inside brake lockup smoke (`car.aiLockupPuffTimer > 0`).
     - `DEFENSIVE_WALL`: Moves once decisively to cover the inside lane when the player closes within `18 m` (`slipstream > 0.35`), filling the player’s forward sightline or wing mirrors.
     - `SLIPSTREAM_HUNTER`: Tucks directly behind the player’s gearbox (visible dead-center in both cockpit wing mirrors!) before popping out at `+12 km/h` tow delta.
     - `ROOKIE_WILDCARD`: Occasionally clips outer exit kerbs, kicking up 1982 pixel turf/dust particles (`#8B5A2B` / `#4CAF50`).
     - **AI Pit Strategy:** Rivals pit on worn tires or rain transitions in long/wet 1982 races, pulling into the pixel pit lane alongside the 6-man crew!
  3. **Two-Tier Arcade-Sim Collision Physics (`src/pit_damage_caution.js:572`):**
     - **Tier 1 — Wheel-to-Wheel Rubbing & Nose Taps (`closingSpeedKmh < 58`):** Elastic lateral separation + longitudinal speed transfer + bright 1982 orange/white pixel contact sparks + proportional `frontWing` / `suspension` wear (`0.08 .. 0.35`). **Never instant-explodes** on fair side-by-side racing!
     - **Tier 2 — Catastrophic High-Energy Crash (`closingSpeedKmh >= 58` rear-end shunt OR direct `> 135 km/h` roadside billboard/barrier impact):** Triggers the iconic **1982 Namco *Pole Position* Fireball Explosion** (`_renderExplosion1982`: 6-frame black/red/yellow expanding pixel fireball + 4 bouncing black pixel tires + 2.6 s flying-start rolling respawn with `PREPARE TO RACE` flash), preserving the legendary coin-op thrill without unfair 2 km/h touch deaths!

#### 6. Full 1982 Pixel Pit Stops & Native Canvas Pit/Clutch Interface
- **Audit Defect (`src/pit_damage_caution.js:204, 491`):** `if (mode === '1982_ORIGINAL') return;` completely blocks pit entry in 1982 mode, wasting the awesome `_renderPlayerPitCrew1982` (`retro1982.js:3124`) 6-man pixel crew! And in `2026_UPDATED + 1982_ARCADE`, pitting pops up modern rounded HTML `#pit-stop-overlay` (`styles.css:1391`) right over the pixel crew!
- **1982 Parity Specification:**
  1. **Enable Pit Lane in Both Modes** whenever race laps `>= 3`, tire wear/damage > 0, or weather changes.
  2. **Roadside Pixel `PIT IN` Arrow Board:** Render a crisp flashing `#00FF66` / `#101420` `PIT IN ->` pixel sign (`44×24` sprite) `220 m` and `80 m` before `track.pitEntryS`, plus painted dashed white pit-entry commitment lines right on the 1982 scanline asphalt!
  3. **Enhanced 6-Man Pixel Pit Crew (`_renderPlayerPitCrew1982`, `L3124`):**
     - Keep the 4 kneeling wheel-gun mechanics (`±35 px` front/rear) + front & rear jackmen.
     - Add **7th Overhead Fuel-Rig Mechanic** holding a heavy black/silver pixel fuel hose coupled to the sidepod filler neck when refueling, **and** animate 2 front mechanics sliding on a fresh `#FCFCFC`/`#E4002B` pixel nosecone when `damage.frontWing` is being repaired!
  4. **Native 1982 Canvas Pit Box & Clutch Launch Mini-Game (`body.retro-1982-active`):**
     - Hide `#pit-stop-overlay` visually via `opacity: 0` (keeping `#btn-clutch-release` full-width invisible touch target at bottom-center for mobile taps, or bind Throttle/Space/Tap!) and draw the **entire Pit Stop & Optimal Clutch Release bar natively on `#retro-1982-canvas`** at `y = 42..88`:
       - Pixel frame `#080C18` with `2 px` `#00FF66` border: **`PIT STOP  02"40`**
       - Service checklist icons: `TIRES [OK]  WING [OK]  FUEL [+3.2L]`
       - Crisp 1982 arcade **`CLUTCH LAUNCH`** meter (`120 × 10 px` segmented pixel bar with `#FCE400` good zone, `#00FF66` sweet-spot center, and bouncing `#FCFCFC` 2 px cursor + `PRESS GAS / SPACE!` prompt).

#### 7. Dynamic Wet Weather Parity in 1982 Style
- **Audit Defect (`src/physics.js:439`, `src/main.js:2452`, `src/retro1982.js:2445`):**
  - `physics.js:439` forces `const rawW = mode === '2026_UPDATED' ? Number(weatherState?.wetness || 0) : 0.0;`, so selecting **Monsoon Storm** in 1982 mode draws pixel raindrops (`retro1982.js:2734`) over completely dry 100%-grip physics with muted rain audio (`main.js:2452`) and zero rival rooster-tail spray!
- **1982 Parity Specification:**
  1. **Unify Wetness Physics & Rain Audio (`physics.js:439`, `main.js:2452`):** Remove the `mode === '2026_UPDATED'` ternary so `weatherState.wetness` drives real wet grip reduction, off-line wet-rubber grip advantage, Inter/Wet tire hydroplaning resistance, and rain audio bed in **both** modes!
  2. **Wet Specular 1982 Scanline Asphalt (`src/retro1982.js:1878-1984`):**
     - Blend dry asphalt `#525763` / `#4A4F5B` smoothly by `wetness` toward wet mirror-dark slate `#2B3344` / `#242B3A`, with shimmering sky-tinted puddle reflection bands (`#4A6488` modulated along `absWorldM` where `puddleMask > 0.6` so standing-water hydroplaning patches are visually readable!).
  3. **Rival Car Rooster-Tail Pixel Plumes (`src/retro1982.js:2445`):**
     - When `wetness > 0.15` and `rival.speedKmh > 70`, render a multi-tiered translucent cyan-white pixel spray plume (`#C8E6FF` / `#88B4DC` dithered blocks scaled by `item.scale * wetness * speedNorm`) billowing behind **every visible rival car**—recreating the dramatic low-visibility F1 rain battle in pure crisp 1982 pixel blocks!
  4. **Open-Cockpit Visor Rain & Tear-Off Wipe (`cameraIndex === 2`):**
     - When `wetness > 0.20` in Cockpit View, drift `8–14` tiny `1×2 px` `#D8F0FF` visor droplets outward from `(cx, horizonY)` across the upper screen, clearing with a crisp `120 ms` horizontal glint whenever the driver triggers a visor tear-off or exits the pit box.

---

## Section 4: Implementation Checklist & Verification Matrix

| Target File | Key Functions / Lines | Concrete Change Summary |
| :--- | :--- | :--- |
| `src/track.js` | `L520-532`, new `getMetricCurvatureAt(s)`, `readCubicPose(s)` | Replace hard `< 0.015` step clamp with $C^1$ cubic soft-knee deadband; expose metric $\kappa(s)$ and $C^1$ Hermite elevation/pitch/yaw pose. |
| `src/retro1982.js` | `L25-26, 1778-2006` | Upgrade to `160 × 1.25 m` trapezoidal `_worldCurveM` + active front-to-back `_worldElevM` hill-occlusion scanline loop; lock integer `halfWInt` before `centerX` rounding; smooth fractional `horizonY`; delete duplicate `speedDashBand` (`L1853`). |
| `src/retro1982.js` | `L1540, 1671, 2595-2695` | Unify all 4 sky/cloud/star/landmark layers onto harmonic `1024 px = 2π rad` angular loop (`162.97 px/rad`) + sub-pixel panorama blit. |
| `src/retro1982.js` | `L1014, 2158-2460, 2482-2485` | Delete flares/confetti (`L2482`) & anime wind lines (`L2485`); prune random outer billboards (`50 → 20`); add 64-step aspect-locked `NAMCO_ZOOM_LUT`; add curvature-driven `< / << / <<<` Namco turn signs & rival wet rooster-tail plumes. |
| `src/retro1982.js` | `L3241-3729` | Implement zero-overlap 1982 Open Cockpit (`camIdx 2`: delete Halo, widen front slicks, clear outboard mirrors with live rival reflections, elevate binnacle gauges above lowered MOMO wheel/gloves); remove Halo in Roll-Hoop (`camIdx 1`); bind per-camera `camZOffsetM`/`nearDistM`; fix Portrait bottom apron in Chase (`camIdx 0`). |
| `src/retro1982.js` | `L3124, 3773-4028` | Add 2× gradient-outlined `PREPARE TO QUALIFY` / `GOAL IN!` / `EXTENDED PLAY` / `PASSING BONUS` banners; add `FUEL` bar + flat-spot/wing/suspension indicators to pixel telemetry pod; render native 1982 canvas Pit Stop & Clutch Launch bar. |
| `src/physics.js` | `L374, 421, 439, 492, 672, 785-865, 1098` | Enable full tire wear, flat-spots, fuel mass (`kg`), wing/suspension damage, curvature-accurate brake assist, and wet-weather moisture (`rawW`) under `SIM_PARITY` in 1982 mode. |
| `src/pit_damage_caution.js` | `L204, 491, 572` | Enable 1982 pit lane entry/service; replace `1 km/h` player-only instant explosion with 2-tier contact (`< 58 km/h` sidepod rub sparks + wing wear vs `>= 58 km/h` / billboard 1982 fireball crash). |
| `styles.css` & `src/main.js` | `styles.css:2319-2328`, `main.js:2452, 2498` | Hide `#speed-vignette`, `#telemetry-2026-panel`, and HTML `#pit-stop-overlay` visuals under `body.retro-1982-active`; pass clean emoji-free `arcadeBanner` events and active rain audio moisture in 1982 mode. |
