// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Authentic 1982 Namco "Pole Position / Pole Position II" Raster-Scanline &
// Hardware-Zoom Sprite Renderer — 2nd-Order Trapezoidal Sub-Pixel Curves,
// Hill Z-Buffer, Seamless 2pi Horizon, Zero-Overlap Cockpit & 100% Sim Parity!
// ============================================================================

import {
  TRACK_GAME_LENGTH,
  REAL_METERS_PER_GAME_METER,
  ROAD_HALF_WIDTH,
  CURB_WIDTH,
  GAME_STATES,
  QUALIFYING_RANK_A_TABLE,
  CLASSIC_1982_RULES,
  PIT_LANE_CONFIG,
  AI_DRIVER_ROSTER,
} from './config.js';

// Lookahead & Perspective Constants (Real Meters)
const FAR_DIST_M = 195.0;
const WORLD_STEP_M = 1.25;
const WORLD_STEPS = 160; // 160 x 1.25m = 200.0m 2nd-order trapezoidal lookahead!
const MAX_SPRITE_POOL = 256;

// Unified 2pi Angular Horizon Constants (1024 px === 2*PI rad -> ZERO wrap jump!)
const PANO_LOOP_W = 1024;
const CLOUD_LOOP_W = 512; // Exact 0.5x harmonic (2 * 512 = 1024 px per 360 deg)
const K_YAW_PX_PER_RAD = PANO_LOOP_W / (Math.PI * 2); // 162.9746617 px/rad

// Per-Camera Physical Projection Rig (cameraIndex = 0..4)
const CAMERA_RIGS_1982 = [
  // 0: Classic 1982 Arcade Chase
  { label: 'CAM 1: 1982 CHASE',        camForwardM: 0.00, zCamBackM: 5.50, nearDistM: 2.00, eyeHeightM: 1.12, horizonDeltaPx:   0, roadZoom: 1.00 },
  // 1: 1982 Roll-Hoop Overhead T-Cam (Halo-Free!)
  { label: 'CAM 2: OVERHEAD T-CAM',    camForwardM: 0.25, zCamBackM: 2.40, nearDistM: 1.60, eyeHeightM: 1.02, horizonDeltaPx:   4, roadZoom: 1.04 },
  // 2: 1982 Ground-Effect Open Cockpit (Zero-Overlap!)
  { label: 'CAM 3: 1982 OPEN COCKPIT', camForwardM: 0.40, zCamBackM: 2.00, nearDistM: 1.35, eyeHeightM: 0.78, horizonDeltaPx:  -5, roadZoom: 1.08 },
  // 3: Bonnet / Cowling Bulkhead Cam
  { label: 'CAM 4: BONNET COWLING',    camForwardM: 0.95, zCamBackM: 1.65, nearDistM: 1.15, eyeHeightM: 0.62, horizonDeltaPx:  -7, roadZoom: 1.12 },
  // 4: Low Asphalt Nose / Front-Wing Cam
  { label: 'CAM 5: LOW NOSE WING',     camForwardM: 1.75, zCamBackM: 1.30, nearDistM: 0.95, eyeHeightM: 0.38, horizonDeltaPx: -10, roadZoom: 1.18 },
];

// 64-Step Precomputed Namco Hardware Sprite Zoom Lookup Table (6-bit shrink ROM emulation)
const NAMCO_ZOOM_LUT = (() => {
  const lut = new Float32Array(64);
  const minZ = 0.024;
  const maxZ = 2.60;
  for (let i = 0; i < 64; i++) {
    const u = i / 63;
    const zExp = minZ * Math.pow(maxZ / minZ, u);
    const zLin = minZ + (maxZ - minZ) * u;
    lut[i] = zExp * 0.65 + zLin * 0.35;
  }
  return lut;
})();

function quantizeNamcoZoom(rawZoom) {
  if (rawZoom <= NAMCO_ZOOM_LUT[0]) return NAMCO_ZOOM_LUT[0];
  if (rawZoom >= NAMCO_ZOOM_LUT[63]) return rawZoom;
  let lo = 0;
  let hi = 63;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (NAMCO_ZOOM_LUT[mid] <= rawZoom) lo = mid;
    else hi = mid;
  }
  return (rawZoom - NAMCO_ZOOM_LUT[lo]) <= (NAMCO_ZOOM_LUT[hi] - rawZoom)
    ? NAMCO_ZOOM_LUT[lo]
    : NAMCO_ZOOM_LUT[hi];
}

const COMPOUND_PIXEL_COLORS = {
  SOFT: '#ff2a2a',
  MEDIUM: '#ffd600',
  HARD: '#fcfcfc',
  INTERMEDIATE: '#00e676',
  FULL_WET: '#2898ff',
};

// Classic Fallback Namco System-1 Rival Palettes
const FALLBACK_RIVAL_PALETTES_1982 = [
  { name: 'YELLOW_BLUE', body: '#fcd800', shade: '#b89200', hi: '#fff478', trim: '#1858f8', wing: '#fcf8e0', helmet: '#fcfcfc', helmetStripe: '#1858f8' },
  { name: 'CYAN_RED',    body: '#00d8f8', shade: '#008cb0', hi: '#8cf4ff', trim: '#f82018', wing: '#fcfcfc', helmet: '#fcf400', helmetStripe: '#f82018' },
  { name: 'GREEN_WHITE', body: '#00c838', shade: '#008020', hi: '#68fc88', trim: '#fcfcfc', wing: '#fcfcfc', helmet: '#fcf400', helmetStripe: '#008020' },
  { name: 'ORANGE_BLUE', body: '#fc6800', shade: '#b03c00', hi: '#fca858', trim: '#1858f8', wing: '#fcfcfc', helmet: '#54dcff', helmetStripe: '#1858f8' },
  { name: 'VIOLET_YEL',  body: '#b838f8', shade: '#7418a8', hi: '#e090ff', trim: '#fcf400', wing: '#fcf400', helmet: '#fcfcfc', helmetStripe: '#7418a8' },
  { name: 'SILVER_RED',  body: '#d0d8e4', shade: '#8490a4', hi: '#ffffff', trim: '#f81818', wing: '#fcfcfc', helmet: '#3888ff', helmetStripe: '#f81818' },
];

function intHexToCss(numHex, brightScale = 1.0, addLift = 0) {
  const n = Number.isFinite(numHex) ? (numHex | 0) : 0xd0d8e4;
  const r = clamp(Math.round(((n >> 16) & 255) * brightScale + addLift), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * brightScale + addLift), 0, 255);
  const b = clamp(Math.round((n & 255) * brightScale + addLift), 0, 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function lerpRgbHex(r0, g0, b0, r1, g1, b1, t) {
  const u = clamp(t, 0, 1);
  const r = Math.round(r0 + (r1 - r0) * u);
  const g = Math.round(g0 + (g1 - g0) * u);
  const b = Math.round(b0 + (b1 - b0) * u);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Smooth C1 cubic soft-knee curvature filter (eliminates hard C^-1 deadzone snaps!)
function smoothCurvatureSoftKnee(kRadPerM) {
  const absK = Math.abs(kRadPerM);
  const k0 = 0.00045; // Dead-steady straight threshold (R > 2200m)
  const k1 = 0.00280; // Full curvature authority (R < 357m)
  if (absK <= k0) return 0.0;
  if (absK >= k1) return kRadPerM;
  const t = (absK - k0) / (k1 - k0);
  const s = t * t * (3.0 - 2.0 * t);
  return kRadPerM * s;
}

function quinticStep01(u) {
  const t = clamp(u, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Crisp 5x7 1982 Namco Arcade Bitmap Font (Each row is a 5-bit mask, MSB on left)
const FONT_5X7 = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11100, 0b10010, 0b10001, 0b10001, 0b10001, 0b10010, 0b11100],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'Q': [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '.': [0, 0, 0, 0, 0, 0b01100, 0b01100],
  ',': [0, 0, 0, 0, 0b00100, 0b00100, 0b01000],
  ':': [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
  '\'': [0b00100, 0b00100, 0b01000, 0, 0, 0, 0],
  '"': [0b01010, 0b01010, 0b01010, 0, 0, 0, 0],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  '?': [0b01110, 0b10001, 0b00010, 0b00100, 0b00100, 0, 0b00100],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  '=': [0, 0, 0b11111, 0, 0b11111, 0, 0],
  '_': [0, 0, 0, 0, 0, 0, 0b11111],
  '*': [0, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0],
  '<': [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010],
  '>': [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0],
  '#': [0b01010, 0b11111, 0b01010, 0b01010, 0b11111, 0b01010, 0],
  '%': [0b11001, 0b11010, 0b00100, 0b00100, 0b01011, 0b10011, 0],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
};

const FONT_CHARS = Object.keys(FONT_5X7);
const SPACE_GLYPH_IDX = FONT_CHARS.indexOf(' ');
const CHAR_TO_IDX = new Uint8Array(128);
CHAR_TO_IDX.fill(255);
for (let i = 0; i < FONT_CHARS.length; i++) {
  const code = FONT_CHARS[i].charCodeAt(0);
  if (code < 128) CHAR_TO_IDX[code] = i;
}

const HUD_FONT_COLORS = {
  RED:    '#ff2828',
  YELLOW: '#fce400',
  GREEN:  '#00fc58',
  WHITE:  '#fcfcfc',
  CYAN:   '#00e8d8',
  ORANGE: '#fc8418',
  SILVER: '#b8c4d8',
};

function clamp(v, min, max) {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : (v > max ? max : v);
}

function wrapS(s) {
  if (!Number.isFinite(s)) return 0;
  let r = s % TRACK_GAME_LENGTH;
  if (r < 0) r += TRACK_GAME_LENGTH;
  if (r >= TRACK_GAME_LENGTH) r = 0;
  return r;
}

function forwardDeltaS(fromS, toS) {
  let d = wrapS(toS) - wrapS(fromS);
  if (d < 0) d += TRACK_GAME_LENGTH;
  return d;
}

function signedDeltaS(a, b) {
  let d = wrapS(a) - wrapS(b);
  if (d > TRACK_GAME_LENGTH * 0.5) d -= TRACK_GAME_LENGTH;
  if (d < -TRACK_GAME_LENGTH * 0.5) d += TRACK_GAME_LENGTH;
  return d;
}

function makeOffscreenCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas: c, ctx };
}

function drawRawPixelText(ctx, text, x, y, color, scale = 1, shadowColor = '#000000') {
  const str = String(text || '').toUpperCase();
  const s = Math.max(1, scale | 0);
  let cx = x | 0;
  const cy = y | 0;

  for (let i = 0; i < str.length; i++) {
    const glyph = FONT_5X7[str[i]] || FONT_5X7[' '];
    if (shadowColor) {
      ctx.fillStyle = shadowColor;
      for (let r = 0; r < 7; r++) {
        const rowBits = glyph[r];
        if (!rowBits) continue;
        for (let col = 0; col < 5; col++) {
          if ((rowBits >> (4 - col)) & 1) {
            ctx.fillRect(cx + col * s + s, cy + r * s + s, s, s);
          }
        }
      }
    }
    ctx.fillStyle = color;
    for (let r = 0; r < 7; r++) {
      const rowBits = glyph[r];
      if (!rowBits) continue;
      for (let col = 0; col < 5; col++) {
        if ((rowBits >> (4 - col)) & 1) {
          ctx.fillRect(cx + col * s, cy + r * s, s, s);
        }
      }
    }
    cx += 6 * s;
  }
}

export class Retro1982Renderer {
  constructor(containerEl) {
    const host =
      containerEl ||
      (typeof document !== 'undefined'
        ? document.getElementById('webgl-container') || document.body
        : null);

    let existing = null;
    if (containerEl && typeof containerEl.querySelector === 'function') {
      existing = containerEl.querySelector('#retro-1982-canvas');
    } else if (typeof document !== 'undefined') {
      existing = document.getElementById('retro-1982-canvas');
    }
    if (existing && existing.tagName === 'CANVAS') {
      this.canvas = existing;
      if (host && this.canvas.parentElement !== host) {
        host.appendChild(this.canvas);
      }
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'retro-1982-canvas';
      if (host) host.appendChild(this.canvas);
    }

    this.canvas.style.cssText =
      'position:absolute; inset:0; width:100%; height:100%; z-index:4; pointer-events:none; display:none; image-rendering:pixelated; image-rendering:crisp-edges;';

    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.active = false;

    this.bufH = 240;
    this.bufW = 320;

    // Pre-allocated 160-step world curvature/elevation & scanline Z-buffers (Zero GC!)
    this._worldCurveM = new Float32Array(WORLD_STEPS + 1);
    this._worldElevM = new Float32Array(WORLD_STEPS + 1);
    this._worldCurvK = new Float32Array(WORLD_STEPS + 1);
    this._lineDistM = new Float32Array(512);
    this._lineScale = new Float32Array(512);
    this._lineCenterX = new Float32Array(512);
    this._lineRoadHalfPx = new Float32Array(512);
    this._minRoadY = 240;
    this._lastHostW = 0;
    this._lastHostH = 0;

    // Reusable scalar pose & telemetry scratch outputs (Zero per-frame object allocations!)
    this._poseElev = 0;
    this._poseYaw = 0;
    this._poseSlope = 0;
    this._flatSpotScratch = { fl: 0, fr: 0, rl: 0, rr: 0, maxFlat: 0 };
    this._dmgScratch = { fw: 0, fwLeftOut: false, fwRightOut: false, rw: 0, rwAskew: false, susp: 0, suspSide: 1 };
    this._fuelScratch = { frac: 1.0, lowFuel: false, fuelKg: 42.0 };
    this._pitScratch = { prog: 0, remSec: 0, sub: '' };

    // Per-circuit cached unclamped curvature, corner chevrons & clean 22-sign layout
    this._cachedTrackRef = null;
    this._cachedTrackId = '';
    this._cachedSampleCurvRadM = null;
    this._cachedCornerSigns = [];
    this._cachedBillboards = [];

    // Pre-allocated depth-sort sprite pool
    this._spritePool = new Array(MAX_SPRITE_POOL);
    for (let i = 0; i < MAX_SPRITE_POOL; i++) {
      this._spritePool[i] = {
        distReal: 0,
        kind: 0, // 0 = roadside sprite, 1 = gantry, 2 = rival explosion, 3 = rival F1 car
        img: null,
        worldLatM: 0,
        widthMeters: 1,
        yLiftPx: 0,
        lightsLit: 0,
        lightsGreen: false,
        blastProgress: 0,
        anchorCenter: false,
        compHex: '#ff2a2a',
        tireWearLow: false,
        lockupSide: 0,
        wetSprayLevel: 0,
        onGrassDirt: false,
        rubSparks: false,
        rearWingAskew: false,
        drsOpen: false,
      };
    }

    // Critically-damped camera/horizon/yaw trackers & arcade callout timers
    this._unwrappedYaw = 0;
    this._smoothCamYawRad = 0;
    this._hasPrevYaw = false;
    this._prevRawYaw = 0;
    this._smoothPitchPx = 0;
    this._smoothSlipYaw = 0;
    this._smoothApexPan = 0;
    this._smoothRollPanPx = 0;
    this._hasSmoothInit = false;

    this._lastElapsedSec = 0;
    this._playerBlastSec = 0;
    this._lastCamIdx = 0;
    this._camBannerTimer = 0;
    this._prevPlayerPos = 0;
    this._passingBonusTimer = 0;
    this._prevLapNum = 1;
    this._lapCompleteBanner = '';
    this._lapCompleteTimer = 0;
    this._lapCompleteBest = false;
    this._bestLapSeen = Infinity;
    this._crowdExcitement = 0;
    this._prevSectorIdx = 0;
    this._sectorStartSec = 0;
    this._bestSectorTimes = [null, null, null];
    this._autoSectorPopup = '';
    this._autoSectorTimer = 0;
    this._autoSectorGreen = true;
    this._visorWipeTimer = 0;
    this._wasInPitStop = false;

    // Pre-generate all pixel-art sprite sheets & bitmap font atlases ONCE
    this._fontAtlases = this._buildBitmapFontAtlases();
    this._panoramas = this._buildHorizonPanoramas();
    this._cloudStrips = this._buildCloudStrips();
    this._blimpSprite = this._buildNamcoBlimpSprite();
    this._playerSprites = this._buildPlayerCarSprites();
    this._rivalPaletteList = [];
    this._rivalNumToPalIdx = new Map();
    this._rivalSprites = this._buildRivalCarSprites();
    this._explosionFrames = this._buildExplosionSprites();
    this._wheelSprites = this._buildFlyingWheelSprites();
    this._billboardSprites = this._buildBillboardSprites();
    this._chevronSprites = this._buildChevronSprites();
    this._pitInSprites = this._buildPitInSignSprites();
    this._brakingSprites = this._buildBrakingBoardSprites();
    this._scenicSprites = this._buildScenicPropSprites();
    this._gantrySprites = this._buildGantrySprites();
    this._momoWheelSprites = this._buildMomoWheelSprites();
    this._crtCanvas = null;

    const readHostSize = () => {
      const vp = typeof window !== 'undefined' ? window.visualViewport : null;
      const w =
        (host && host.clientWidth) ||
        (vp && vp.width) ||
        (typeof window !== 'undefined' ? window.innerWidth : 426) ||
        426;
      const h =
        (host && host.clientHeight) ||
        (vp && vp.height) ||
        (typeof window !== 'undefined' ? window.innerHeight : 240) ||
        240;
      return { w, h };
    };
    this._readHostSize = readHostSize;

    const initSz = readHostSize();
    this.resize(initSz.w, initSz.h);

    if (typeof window !== 'undefined') {
      this._onWindowResize = () => {
        const sz = this._readHostSize();
        this.resize(sz.w, sz.h);
      };
      this._onVisorTearOff = () => {
        this._visorWipeTimer = 0.22;
      };
      window.addEventListener('resize', this._onWindowResize, { passive: true });
      window.addEventListener('orientationchange', this._onWindowResize, { passive: true });
      window.addEventListener('f1-visor-tearoff', this._onVisorTearOff, { passive: true });
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', this._onWindowResize, { passive: true });
      }
    }
  }

  setVisible(active) {
    this.active = !!active;
    if (this.canvas) {
      this.canvas.style.display = this.active ? 'block' : 'none';
    }
    if (this.active && typeof window !== 'undefined' && this._readHostSize) {
      const sz = this._readHostSize();
      this.resize(sz.w, sz.h);
    }
  }

  isVisible() {
    return this.active;
  }

  _probeSafeAreaInsets() {
    const fallback = { top: 0, right: 0, bottom: 0, left: 0 };
    if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) {
      this._safeAreaCss = fallback;
      return fallback;
    }
    try {
      if (!this._safeAreaProbeEl) {
        const el = document.createElement('div');
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText = [
          'position:fixed',
          'top:0',
          'left:0',
          'width:0',
          'height:0',
          'pointer-events:none',
          'visibility:hidden',
          'z-index:-1',
          'padding-top:env(safe-area-inset-top, 0px)',
          'padding-right:env(safe-area-inset-right, 0px)',
          'padding-bottom:env(safe-area-inset-bottom, 0px)',
          'padding-left:env(safe-area-inset-left, 0px)',
        ].join(';');
        document.body.appendChild(el);
        this._safeAreaProbeEl = el;
      }
      const cs = window.getComputedStyle(this._safeAreaProbeEl);
      const safe = {
        top: Math.max(0, parseFloat(cs.paddingTop) || 0),
        right: Math.max(0, parseFloat(cs.paddingRight) || 0),
        bottom: Math.max(0, parseFloat(cs.paddingBottom) || 0),
        left: Math.max(0, parseFloat(cs.paddingLeft) || 0),
      };
      this._safeAreaCss = safe;
      return safe;
    } catch (_) {
      this._safeAreaCss = fallback;
      return fallback;
    }
  }

  _computeHudSafePadding(W, H) {
    const aspect = W / Math.max(1, H);
    const isNarrowPortrait = aspect < 0.65;
    const isNotchedLandscape = aspect > 1.85;
    const sa = this._safeAreaCss || { top: 0, right: 0, bottom: 0, left: 0 };
    const scaleX = W / Math.max(1, this._lastHostW || W);
    const scaleY = H / Math.max(1, this._lastHostH || H);

    const cssPadL = sa.left > 0.5 ? Math.ceil(sa.left * scaleX) + 3 : 0;
    const cssPadR = sa.right > 0.5 ? Math.ceil(sa.right * scaleX) + 3 : 0;
    const cssPadTop = sa.top > 0.5 ? Math.ceil(sa.top * scaleY) + 3 : 0;

    const minPadX = isNarrowPortrait ? 6 : (isNotchedLandscape ? 12 : 4);
    const minTopY = isNarrowPortrait ? 8 : (H > 275 ? 5 : (isNotchedLandscape ? 4 : 3));
    const maxPadX = Math.max(minPadX, Math.floor(W * 0.11));
    const maxTopY = Math.max(minTopY, Math.floor(H * 0.08));

    return {
      aspect,
      isNarrowPortrait,
      isNotchedLandscape,
      padL: clamp(Math.max(minPadX, cssPadL), 4, maxPadX),
      padR: clamp(Math.max(minPadX, cssPadR), 4, maxPadX),
      topY: clamp(Math.max(minTopY, cssPadTop), 3, maxTopY),
    };
  }

  _formatArcadeSixDigitScore(rawVal) {
    const v = Math.max(0, Math.floor(Number.isFinite(rawVal) ? rawVal : 0));
    if (v <= 999999) return String(v).padStart(6, '0');
    const k = Math.min(99999, Math.floor(v / 1000));
    return `${k}K`.padStart(6, '0');
  }

  resize(width, height) {
    const safeW = Number.isFinite(width) && width > 0 ? width : 426;
    const safeH = Number.isFinite(height) && height > 0 ? height : 240;
    this._lastHostW = safeW;
    this._lastHostH = safeH;
    this._probeSafeAreaInsets();

    const rawAspect = safeW / safeH;
    let nextW;
    let nextH;
    if (rawAspect >= 0.85) {
      nextH = 240;
      nextW = Math.round(240 * clamp(rawAspect, 0.85, 2.85));
    } else {
      nextW = 196;
      nextH = Math.round(nextW / clamp(rawAspect, 0.40, 0.85));
    }

    if (nextH > this._lineDistM.length) {
      const cap = nextH + 32;
      this._lineDistM = new Float32Array(cap);
      this._lineScale = new Float32Array(cap);
      this._lineCenterX = new Float32Array(cap);
      this._lineRoadHalfPx = new Float32Array(cap);
    }

    if (this.canvas.width !== nextW || this.canvas.height !== nextH || !this._crtCanvas) {
      this.bufW = nextW;
      this.bufH = nextH;
      this.canvas.width = nextW;
      this.canvas.height = nextH;
      this._rebuildCrtOverlay(nextW, nextH);
    }
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = false;
    }
  }

  // ==========================================================================
  // OFFSCREEN PIXEL-ART SPRITE SHEET GENERATORS (CALLED ONCE IN CONSTRUCTOR)
  // ==========================================================================

  _buildBitmapFontAtlases() {
    const cellW = 7;
    const count = FONT_CHARS.length;
    const atlases = {};

    for (const [key, hex] of Object.entries(HUD_FONT_COLORS)) {
      const { canvas, ctx } = makeOffscreenCanvas(cellW * count, 16);
      for (let idx = 0; idx < count; idx++) {
        const glyph = FONT_5X7[FONT_CHARS[idx]];
        const ox = idx * cellW + 1;

        ctx.fillStyle = '#000000';
        for (let r = 0; r < 7; r++) {
          const bits = glyph[r];
          if (!bits) continue;
          for (let c = 0; c < 5; c++) {
            if ((bits >> (4 - c)) & 1) {
              ctx.fillRect(ox + c - 1, 1 + r - 1, 3, 3);
            }
          }
        }

        ctx.fillStyle = hex;
        for (let r = 0; r < 7; r++) {
          const bits = glyph[r];
          if (!bits) continue;
          for (let c = 0; c < 5; c++) {
            if ((bits >> (4 - c)) & 1) {
              ctx.fillRect(ox + c, 9 + r, 1, 1);
            }
          }
        }
      }
      atlases[key] = canvas;
    }
    return atlases;
  }

  _drawAtlasText(text, x, y, colorKey = 'WHITE', scale = 1, align = 'left', spacingOverride = null) {
    const atlas = this._fontAtlases[colorKey] || this._fontAtlases.WHITE;
    const str = String(text ?? '');
    const len = str.length;
    if (len === 0) return;

    const s = Math.max(1, scale | 0);
    const step = spacingOverride !== null ? spacingOverride : 6 * s;
    const totalW = len * step;
    let drawX = x;
    if (align === 'center') drawX = x - (totalW >> 1);
    else if (align === 'right') drawX = x - totalW;
    drawX |= 0;
    const drawY = y | 0;

    const ctx = this.ctx;
    const outW = 7 * s;
    const outH = 9 * s;
    const fgW = 5 * s;
    const fgH = 7 * s;

    for (let i = 0; i < len; i++) {
      let code = str.charCodeAt(i);
      if (code >= 97 && code <= 122) code -= 32;
      const glyphIdx = code < 128 ? CHAR_TO_IDX[code] : 255;
      if (glyphIdx !== 255 && glyphIdx !== SPACE_GLYPH_IDX) {
        ctx.drawImage(atlas, glyphIdx * 7, 0, 7, 9, drawX + i * step, drawY, outW, outH);
      }
    }
    for (let i = 0; i < len; i++) {
      let code = str.charCodeAt(i);
      if (code >= 97 && code <= 122) code -= 32;
      const glyphIdx = code < 128 ? CHAR_TO_IDX[code] : 255;
      if (glyphIdx !== 255 && glyphIdx !== SPACE_GLYPH_IDX) {
        ctx.drawImage(atlas, glyphIdx * 7 + 1, 9, 5, 7, drawX + i * step + s, drawY + s, fgW, fgH);
      }
    }
  }

  // Authentic 1982 Namco 2-Tone / 3-Tone Scanline Gradient Arcade Banner Text + 1px Drop Shadow
  _drawNamcoBannerText(text, x, y, topHex, midHex, botHex, scale = 2, align = 'center', spacingOverride = null) {
    const str = String(text || '').toUpperCase();
    const len = str.length;
    if (!len) return;
    const s = Math.max(1, scale | 0);
    const step = spacingOverride !== null ? spacingOverride : 6 * s;
    const totalW = len * step;
    let drawX = x;
    if (align === 'center') drawX = x - (totalW >> 1);
    else if (align === 'right') drawX = x - totalW;
    drawX |= 0;
    const drawY = y | 0;
    const ctx = this.ctx;

    // Pass 1: Crisp solid black arcade outline + drop shadow
    ctx.fillStyle = '#000000';
    for (let i = 0; i < len; i++) {
      const glyph = FONT_5X7[str[i]];
      if (!glyph) continue;
      const gx = drawX + i * step;
      for (let r = 0; r < 7; r++) {
        const bits = glyph[r];
        if (!bits) continue;
        for (let c = 0; c < 5; c++) {
          if ((bits >> (4 - c)) & 1) {
            ctx.fillRect(gx + c * s - 1, drawY + r * s - 1, s + 2, s + 2);
            ctx.fillRect(gx + c * s + s, drawY + r * s + s, s, s);
          }
        }
      }
    }
    // Pass 2: 3-band scanline gradient foreground
    for (let r = 0; r < 7; r++) {
      ctx.fillStyle = r <= 1 ? topHex : (r <= 4 ? midHex : botHex);
      for (let i = 0; i < len; i++) {
        const glyph = FONT_5X7[str[i]];
        if (!glyph) continue;
        const bits = glyph[r];
        if (!bits) continue;
        const gx = drawX + i * step;
        for (let c = 0; c < 5; c++) {
          if ((bits >> (4 - c)) & 1) {
            ctx.fillRect(gx + c * s, drawY + r * s, s, s);
          }
        }
      }
    }
  }

  _buildHorizonPanoramas() {
    // Seamless 1024x68 (2*PI angular loop!) horizon strip featuring iconic snow-capped Mount Fuji
    // All ridge frequencies are exact integer harmonics of W=1024 so f(0) === f(1024) with ZERO seam!
    const W = PANO_LOOP_W; // 1024
    const H = 68;
    const variants = {
      DAY:    { slope: '#2c4c78', slopeHi: '#426a9e', snow: '#fcfcfc', snowShade: '#b8d8f8', hill1: '#249434', hill2: '#187828', base: '#0e581b', nightCity: false },
      SUNSET: { slope: '#3b3566', slopeHi: '#6c497a', snow: '#ffe8d8', snowShade: '#f49c84', hill1: '#285c30', hill2: '#184422', base: '#102e18', nightCity: false },
      STORM:  { slope: '#263850', slopeHi: '#38506e', snow: '#dce8f4', snowShade: '#94acc8', hill1: '#1c5c28', hill2: '#14481e', base: '#0c3414', nightCity: false },
      NIGHT:  { slope: '#14203c', slopeHi: '#1e3058', snow: '#cfdcf0', snowShade: '#7894c0', hill1: '#0c3418', hill2: '#082410', base: '#05180a', nightCity: true },
    };

    const out = {};
    for (const [key, pal] of Object.entries(variants)) {
      const { canvas, ctx } = makeOffscreenCanvas(W, H);

      // 1. Distant Secondary Alpine Range across entire 1024px 2pi loop (integer harmonics 2, 5, 11, 19)
      for (let x = 0; x < W; x++) {
        const theta = (x / W) * Math.PI * 2;
        const ridge =
          14 +
          Math.sin(theta * 3) * 6.5 +
          Math.cos(theta * 7 + 0.8) * 3.8 +
          Math.sin(theta * 15) * 1.8 +
          Math.cos(theta * 27) * 0.9;
        const ry = (H - (ridge | 0)) | 0;
        ctx.fillStyle = pal.slope;
        ctx.fillRect(x, ry, 1, H - ry);
      }

      // 2. Iconic Symmetrical Mount Fuji Centered at x = 512 (Base span ~284px, Peak height 60px)
      const fujiCx = 512;
      const fujiPeakY = 6;
      const fujiBaseY = H - 7;
      for (let dx = -142; dx <= 142; dx++) {
        const ax = Math.abs(dx);
        let hNorm;
        if (ax <= 16) {
          hNorm = 1.0 - (ax === 5 || ax === 11 ? 0.02 : 0.0);
        } else {
          const u = (ax - 16) / 126;
          hNorm = Math.pow(Math.max(0, 1.0 - u), 1.68);
        }
        const topY = Math.round(fujiBaseY - hNorm * (fujiBaseY - fujiPeakY));
        const px = (fujiCx + dx + W) % W;

        if (topY < fujiBaseY) {
          ctx.fillStyle = dx < -4 ? pal.slopeHi : pal.slope;
          ctx.fillRect(px, topY, 1, fujiBaseY - topY);

          const gullyJag =
            ((Math.sin(dx * 0.34) * 3.4 + Math.cos(dx * 0.78) * 2.2) | 0) +
            (ax % 11 < 3 ? 3 : 0);
          const snowBottomY = Math.min(fujiBaseY - 5, fujiPeakY + 20 + gullyJag);
          if (topY < snowBottomY) {
            const isShadowFacet = dx > 4 || (dx > -12 && (Math.abs(dx) % 7 < 2));
            ctx.fillStyle = isShadowFacet ? pal.snowShade : pal.snow;
            ctx.fillRect(px, topY, 1, snowBottomY - topY);
          }

          if (ax > 14 && ax < 58 && (ax % 13 === 0 || ax % 13 === 1)) {
            const streakEnd = Math.min(fujiBaseY - 7, snowBottomY + 7 - (ax >> 3));
            if (streakEnd > snowBottomY) {
              ctx.fillStyle = pal.snowShade;
              ctx.fillRect(px, snowBottomY, 1, streakEnd - snowBottomY);
            }
          }
        }
      }

      // 3. Night Skyline Towers & Neon Sphere Silhouette on opposite azimuth (for Vegas / Night)
      if (pal.nightCity) {
        const towers = [
          [72, 28, 14, '#ff1493'],
          [96, 36, 16, '#00f0ff'],
          [122, 24, 12, '#fcf400'],
          [860, 30, 15, '#00f0ff'],
          [886, 38, 17, '#ff1493'],
          [914, 26, 13, '#00fc58'],
        ];
        for (const [tx, th, tw, neon] of towers) {
          const ty = H - 7 - th;
          ctx.fillStyle = '#0c1028';
          ctx.fillRect(tx, ty, tw, th);
          ctx.fillStyle = neon;
          ctx.fillRect(tx, ty, tw, 2);
          for (let wy = ty + 4; wy < H - 9; wy += 3) {
            for (let wx = tx + 2; wx < tx + tw - 2; wx += 3) {
              if (((wx + wy) & 3) !== 0) {
                ctx.fillStyle = ((wx ^ wy) & 2) ? '#fcf488' : neon;
                ctx.fillRect(wx, wy, 1, 1);
              }
            }
          }
        }
        for (let dy = -11; dy <= 0; dy++) {
          const half = Math.round(Math.sqrt(Math.max(0, 121 - dy * dy)));
          ctx.fillStyle = dy % 3 === 0 ? '#ff1493' : (dy % 2 === 0 ? '#00f0ff' : '#301868');
          ctx.fillRect(172 - half, H - 7 + dy, half * 2, 1);
        }
      }

      // 4. Rolling Shizuoka Foothills (exact integer harmonics 4, 9, 16)
      for (let x = 0; x < W; x++) {
        const theta = (x / W) * Math.PI * 2;
        const fh1 = 10 + Math.sin(theta * 4 + 0.4) * 4.0 + Math.cos(theta * 11) * 1.9;
        const y1 = H - (fh1 | 0);
        ctx.fillStyle = pal.hill1;
        ctx.fillRect(x, y1, 1, H - y1);

        const fh2 = 6 + Math.cos(theta * 6 + 1.9) * 2.8 + ((x & 3) === 0 ? 1 : 0);
        const y2 = H - (fh2 | 0);
        ctx.fillStyle = pal.hill2;
        ctx.fillRect(x, y2, 1, H - y2);

        ctx.fillStyle = pal.base;
        ctx.fillRect(x, H - 3, 1, 3);
      }

      out[key] = canvas;
    }
    return out;
  }

  _buildCloudStrips() {
    // Tileable 512x38 offscreen cloud strip (0.5x harmonic of 1024px 2pi loop -> zero resize/wrap jump!)
    const W = CLOUD_LOOP_W; // 512
    const H = 38;
    const cloudSpecs = [
      { ox: 24, oy: 12, w: 54, h: 16, puffs: [[12, 10, 8], [22, 7, 10], [34, 8, 9], [43, 11, 7]] },
      { ox: 148, oy: 18, w: 38, h: 13, puffs: [[10, 8, 6], [19, 6, 8], [28, 9, 6]] },
      { ox: 266, oy: 8, w: 66, h: 18, puffs: [[13, 12, 8], [24, 8, 10], [36, 7, 11], [48, 9, 9], [56, 12, 6]] },
      { ox: 404, oy: 16, w: 46, h: 14, puffs: [[11, 9, 7], [22, 6, 9], [34, 9, 7]] },
    ];
    const palettes = {
      DAY:    { hi: '#fcfcfc', mid: '#e0f0ff', lo: '#98c0f8' },
      SUNSET: { hi: '#fff0dc', mid: '#fcc49c', lo: '#c87068' },
      STORM:  { hi: '#b8c8dc', mid: '#889cb4', lo: '#586c84' },
    };
    const out = {};
    for (const [k, pal] of Object.entries(palettes)) {
      const { canvas, ctx } = makeOffscreenCanvas(W, H);
      for (const sp of cloudSpecs) {
        for (const [cx, cy, r] of sp.puffs) {
          for (let py = 0; py < sp.h - 2; py++) {
            for (let px = 0; px < sp.w; px++) {
              const dx = px - cx;
              const dy = (py - cy) * 1.25;
              if (dx * dx + dy * dy <= r * r) {
                ctx.fillStyle = py < cy - 2 ? pal.hi : (py < cy + 2 ? pal.mid : pal.lo);
                ctx.fillRect((sp.ox + px) % W, sp.oy + py, 1, 1);
              }
            }
          }
        }
        ctx.fillStyle = pal.mid;
        for (let px = 6; px < sp.w - 6; px++) ctx.fillRect((sp.ox + px) % W, sp.oy + sp.h - 5, 1, 2);
        ctx.fillStyle = pal.lo;
        for (let px = 4; px < sp.w - 4; px++) ctx.fillRect((sp.ox + px) % W, sp.oy + sp.h - 3, 1, 2);
      }
      out[k] = canvas;
    }
    return out;
  }

  _buildNamcoBlimpSprite() {
    // Classic 1982 Fuji Speedway Pixel Blimp towing "NAMCO 82" banner during Qualifying & Grid Lineup!
    const { canvas, ctx } = makeOffscreenCanvas(96, 18);
    // Tow cable + trailing banner on right (blimp flies leftward across sky)
    ctx.fillStyle = '#dce4f2';
    ctx.fillRect(42, 8, 8, 1);
    ctx.fillStyle = '#0c1018';
    ctx.fillRect(50, 3, 44, 11);
    ctx.fillStyle = '#fcf400';
    ctx.fillRect(51, 4, 42, 9);
    drawRawPixelText(ctx, 'NAMCO 82', 53, 5, '#d8181c', 1, null);
    // Silver/Blue Blimp Envelope & Gondola
    for (let y = 1; y <= 13; y++) {
      const dy = (y - 7) / 6.0;
      const hw = Math.round(Math.sqrt(Math.max(0, 1 - dy * dy)) * 19);
      ctx.fillStyle = y < 5 ? '#fcfcfc' : (y < 9 ? '#c8d8ec' : '#7890b4');
      ctx.fillRect(21 - hw, y, hw * 2, 1);
    }
    ctx.fillStyle = '#1858f8';
    ctx.fillRect(5, 6, 32, 2);
    ctx.fillStyle = '#d8181c';
    ctx.fillRect(35, 2, 5, 4);
    ctx.fillRect(35, 9, 5, 4);
    ctx.fillStyle = '#242c3c';
    ctx.fillRect(16, 14, 10, 3);
    return canvas;
  }

  _buildPlayerCarSprites() {
    const frames = [];
    const steers = [-2, -1, 0, 1, 2];
    for (let sIdx = 0; sIdx < steers.length; sIdx++) {
      const steer = steers[sIdx];
      const pal = {
        body: '#ec1c18',
        shade: '#9c0808',
        hi: '#ff7060',
        trim: '#1850e8',
        wing: '#fcfcfc',
        helmet: '#fcfcfc',
        helmetStripe: '#1850e8',
      };
      frames.push([
        this._paintF1CarSprite({ w: 68, h: 38, steer, tirePhase: 0, isPlayer: true, pal }),
        this._paintF1CarSprite({ w: 68, h: 38, steer, tirePhase: 1, isPlayer: true, pal }),
      ]);
    }
    return frames;
  }

  _buildRivalCarSprites() {
    // Build roster-authentic 1982 pixel liveries for every AI driver in AI_DRIVER_ROSTER + classic Namco fallbacks!
    const palettes = [];
    this._rivalNumToPalIdx.clear();
    if (Array.isArray(AI_DRIVER_ROSTER)) {
      for (let i = 0; i < AI_DRIVER_ROSTER.length; i++) {
        const def = AI_DRIVER_ROSTER[i];
        const idx = palettes.length;
        this._rivalNumToPalIdx.set(def.num, idx);
        palettes.push({
          name: def.short || `AI_${i}`,
          carNum: def.num,
          body: intHexToCss(def.primary, 1.0, 0),
          shade: intHexToCss(def.primary, 0.64, 0),
          hi: intHexToCss(def.primary, 1.15, 28),
          trim: intHexToCss(def.accent, 1.0, 0),
          wing: def.primary > 0xd0d0d0 ? intHexToCss(def.accent, 1.0, 0) : '#fcfcfc',
          helmet: intHexToCss(def.helmet, 1.0, 0),
          helmetStripe: intHexToCss(def.accent, 1.0, 0),
        });
      }
    }
    for (let f = 0; f < FALLBACK_RIVAL_PALETTES_1982.length; f++) {
      palettes.push(FALLBACK_RIVAL_PALETTES_1982[f]);
    }
    this._rivalPaletteList = palettes;

    return palettes.map((pal) => {
      return [-1, 0, 1].map((steer) => [
        this._paintF1CarSprite({ w: 64, h: 36, steer, tirePhase: 0, isPlayer: false, pal }),
        this._paintF1CarSprite({ w: 64, h: 36, steer, tirePhase: 1, isPlayer: false, pal }),
      ]);
    });
  }

  _paintF1CarSprite({ w, h, steer, tirePhase, isPlayer, pal }) {
    const { canvas, ctx } = makeOffscreenCanvas(w, h);
    const cx = w >> 1;
    const noseShift = steer * 2;
    const bodyShift = steer;

    const drawSlickTire = (tx, ty, tw, th, phase, turnShift = 0) => {
      const x0 = (tx + turnShift) | 0;
      const y0 = ty | 0;
      ctx.fillStyle = '#0c0c10';
      ctx.fillRect(x0 + 1, y0, tw - 2, th);
      ctx.fillRect(x0, y0 + 1, tw, th - 2);
      ctx.fillStyle = '#1c1e26';
      ctx.fillRect(x0 + 1, y0 + 1, tw - 2, th - 2);
      ctx.fillStyle = '#323846';
      ctx.fillRect(x0 + 1, y0 + 2, 1, th - 4);
      ctx.fillRect(x0 + tw - 2, y0 + 2, 1, th - 4);

      const period = 5;
      const offset = phase === 0 ? 1 : 3;
      for (let ry = 2; ry < th - 2; ry++) {
        if ((ry + offset) % period === 0) {
          ctx.fillStyle = '#f0f4fc';
          ctx.fillRect(x0 + 2, y0 + ry, tw - 4, 1);
        } else if ((ry + offset) % period === 1) {
          ctx.fillStyle = '#7c889c';
          ctx.fillRect(x0 + 2, y0 + ry, tw - 4, 1);
        }
      }
    };

    // 1. Forward Front Wing & Nose Cone
    const noseX = cx + noseShift;
    ctx.fillStyle = pal.wing;
    ctx.fillRect(noseX - 15, 11, 30, 3);
    ctx.fillStyle = pal.body;
    ctx.fillRect(noseX - 16, 10, 3, 4);
    ctx.fillRect(noseX + 13, 10, 3, 4);
    ctx.fillStyle = '#fcfcfc';
    ctx.fillRect(noseX - 4, 8, 8, 6);
    ctx.fillStyle = pal.trim;
    ctx.fillRect(noseX - 2, 8, 4, 2);
    if (isPlayer) {
      ctx.fillStyle = '#ec1c18';
      ctx.fillRect(noseX, 10, 1, 3);
    }

    // 2. Exposed Front Slicks & Chrome Suspension Wishbones
    ctx.fillStyle = '#9aa6ba';
    ctx.fillRect(noseX - 18, 15, 36, 1);
    ctx.fillStyle = '#505868';
    ctx.fillRect(noseX - 18, 16, 36, 1);
    drawSlickTire(cx - 25 + (noseShift >> 1), 11, 9, 10, tirePhase, steer);
    drawSlickTire(cx + 16 + (noseShift >> 1), 11, 9, 10, tirePhase, steer);

    // 3. 1982 Ground-Effect Sidepods & Engine Cowl
    const bx = cx + bodyShift;
    ctx.fillStyle = '#0c0e14';
    ctx.fillRect(bx - 18, 28, 36, 3);
    ctx.fillStyle = pal.shade;
    ctx.fillRect(bx - 18, 19, 36, 9);
    ctx.fillStyle = pal.body;
    ctx.fillRect(bx - 17, 17, 34, 9);
    ctx.fillStyle = '#fcfcfc';
    ctx.fillRect(bx - 15, 16, 30, 4);
    ctx.fillStyle = pal.trim;
    ctx.fillRect(bx - 14, 19, 28, 2);
    ctx.fillStyle = '#12141c';
    ctx.fillRect(bx - 16, 17, 5, 3);
    ctx.fillRect(bx + 11, 17, 5, 3);
    ctx.fillStyle = pal.hi;
    ctx.fillRect(bx - 4, 15, 8, 9);
    ctx.fillStyle = '#fcfcfc';
    ctx.fillRect(bx - 6, 16, 2, 8);
    ctx.fillRect(bx + 4, 16, 2, 8);

    // 4. Open Cockpit, Chrome Roll-Hoop & Driver Helmet
    const hx = bx + (steer > 0 ? 1 : (steer < 0 ? -1 : 0));
    ctx.fillStyle = '#141820';
    ctx.fillRect(hx - 6, 12, 12, 5);
    ctx.fillStyle = '#dce4f2';
    ctx.fillRect(hx - 2, 6, 4, 3);
    ctx.fillStyle = '#7c889c';
    ctx.fillRect(hx - 3, 8, 1, 3);
    ctx.fillRect(hx + 2, 8, 1, 3);
    ctx.fillStyle = pal.helmet;
    ctx.fillRect(hx - 4, 8, 8, 6);
    ctx.fillRect(hx - 3, 7, 6, 1);
    ctx.fillStyle = pal.helmetStripe;
    ctx.fillRect(hx - 1, 7, 2, 3);
    ctx.fillStyle = '#10182c';
    ctx.fillRect(hx - 3, 10, 6, 2);
    ctx.fillStyle = '#68e0ff';
    ctx.fillRect(hx - 2, 10, 2, 1);

    // 5. Rear Slicks + Axle Shafts
    ctx.fillStyle = '#8894a8';
    ctx.fillRect(cx - 20, 26, 40, 2);
    ctx.fillStyle = '#384050';
    ctx.fillRect(cx - 20, 28, 40, 2);

    const rearW = isPlayer ? 13 : 12;
    const rearH = isPlayer ? 16 : 15;
    const rearY = h - rearH - 1;
    drawSlickTire(cx - 17 - rearW, rearY, rearW, rearH, tirePhase, 0);
    drawSlickTire(cx + 17, rearY, rearW, rearH, tirePhase, 0);

    ctx.fillStyle = '#b8c4d8';
    ctx.fillRect(cx - 18, rearY + 5, 2, 6);
    ctx.fillRect(cx + 16, rearY + 5, 2, 6);

    // 6. 1982 Rear Wing + Gearbox Diffuser & Twin Exhausts
    const wx = cx + (steer > 0 ? 1 : (steer < 0 ? -1 : 0));
    ctx.fillStyle = pal.body;
    ctx.fillRect(wx - 15, 12, 2, 12);
    ctx.fillRect(wx + 13, 12, 2, 12);
    ctx.fillStyle = '#fcfcfc';
    ctx.fillRect(wx - 15, 12, 2, 4);
    ctx.fillRect(wx + 13, 12, 2, 4);

    ctx.fillStyle = pal.wing;
    ctx.fillRect(wx - 13, 13, 26, 4);
    ctx.fillStyle = pal.trim;
    ctx.fillRect(wx - 13, 17, 26, 2);
    ctx.fillStyle = '#181c28';
    ctx.fillRect(wx - 13, 19, 26, 1);

    if (isPlayer) {
      ctx.fillStyle = '#ec1c18';
      ctx.fillRect(wx - 5, 14, 10, 2);
      ctx.fillStyle = '#fcf400';
      ctx.fillRect(wx, 13, 1, 4);
      ctx.fillRect(wx - 1, 14, 1, 1);
    }

    ctx.fillStyle = '#202430';
    ctx.fillRect(wx - 5, 24, 10, 9);
    ctx.fillStyle = '#3c4456';
    ctx.fillRect(wx - 4, 25, 8, 5);
    ctx.fillStyle = '#c8d4e8';
    ctx.fillRect(wx - 4, 29, 3, 3);
    ctx.fillRect(wx + 1, 29, 3, 3);
    ctx.fillStyle = '#08080c';
    ctx.fillRect(wx - 3, 30, 1, 1);
    ctx.fillRect(wx + 2, 30, 1, 1);
    ctx.fillStyle = '#ff2020';
    ctx.fillRect(wx - 1, 26, 2, 2);
    ctx.fillStyle = '#ff9898';
    ctx.fillRect(wx - 1, 26, 1, 1);

    return canvas;
  }

  _buildExplosionSprites() {
    const W = 76;
    const H = 56;
    const frames = [];
    for (let f = 0; f < 4; f++) {
      const { canvas, ctx } = makeOffscreenCanvas(W, H);
      const cx = W >> 1;
      const cy = H - 18 - f * 2;
      const baseRad = 15 + f * 5;
      for (let by = 0; by < H; by += 2) {
        for (let bx = 0; bx < W; bx += 2) {
          const dx = bx - cx;
          const dy = (by - cy) * 1.22;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);
          const lobe =
            Math.sin(angle * 5.0 + f * 1.9) * 4.5 +
            Math.cos(angle * 9.0 - f * 2.4) * 3.0 +
            (((bx * 13 + by * 7 + f * 19) % 5) - 2);
          const effR = baseRad + lobe;
          if (dist <= effR) {
            const ratio = dist / Math.max(1, effR);
            if (f === 3 && ratio > 0.55 && ((bx + by) & 2) === 0) continue;
            if (ratio < 0.28 && f < 3) ctx.fillStyle = '#ffffff';
            else if (ratio < 0.52) ctx.fillStyle = '#fcf400';
            else if (ratio < 0.74) ctx.fillStyle = '#fc7800';
            else if (ratio < 0.90) ctx.fillStyle = '#fc1800';
            else ctx.fillStyle = f >= 2 ? '#3c3438' : '#a80800';
            ctx.fillRect(bx, by, 2, 2);
          }
        }
      }
      const shardAngles = [0.3, 0.85, 1.4, 1.95, 2.5, 2.9, -0.4, -2.7];
      for (let i = 0; i < shardAngles.length; i++) {
        const a = shardAngles[i];
        const r = 12 + f * 7 + (i % 3) * 3;
        const sx = Math.round(cx + Math.cos(a) * r);
        const sy = Math.round(cy - Math.abs(Math.sin(a)) * r * 0.85);
        if (sx >= 2 && sx < W - 4 && sy >= 2 && sy < H - 4) {
          ctx.fillStyle = i % 3 === 0 ? '#fcfcfc' : (i % 2 === 0 ? '#fcf400' : '#fc2018');
          ctx.fillRect(sx, sy, 3, 2);
        }
      }
      frames.push(canvas);
    }
    return frames;
  }

  _buildFlyingWheelSprites() {
    return [0, 1].map((phase) => {
      const { canvas, ctx } = makeOffscreenCanvas(14, 16);
      ctx.fillStyle = '#08080c';
      ctx.fillRect(2, 0, 10, 16);
      ctx.fillRect(0, 2, 14, 12);
      ctx.fillStyle = '#181c24';
      ctx.fillRect(2, 2, 10, 12);
      ctx.fillStyle = '#2e3442';
      ctx.fillRect(2, 3, 1, 10);
      ctx.fillRect(11, 3, 1, 10);
      ctx.fillStyle = '#9aa6ba';
      ctx.fillRect(6, 6, 2, 4);
      ctx.fillStyle = '#e8f0fc';
      if (phase === 0) {
        ctx.fillRect(3, 3, 8, 1);
        ctx.fillRect(3, 12, 8, 1);
      } else {
        ctx.fillRect(3, 6, 8, 1);
        ctx.fillRect(3, 10, 8, 1);
      }
      return canvas;
    });
  }

  _buildBillboardSprites() {
    // 10 Authentic 1982 Fuji Speedway & Namco Cabinet Parody Billboards (144x92 px)
    const defs = [
      { id: 'NAMCO',         bg: '#fcfcfc', border: '#e4002b', accent: '#1850e8', top: 'NAMCO-82',  bot: 'ORIGINAL 1982', fg: '#e4002b' },
      { id: 'FUJI_FILM',     bg: '#fcfcfc', border: '#00a844', accent: '#e4002b', top: 'FUJI GP',   bot: 'FILM-X SPEED',  fg: '#008c38' },
      { id: 'POLE_OIL',      bg: '#ff7800', border: '#1838d8', accent: '#fcfcfc', top: 'POLE 76',   bot: 'RACING TURBO',  fg: '#1838d8' },
      { id: 'CENTURY_TIRE',  bg: '#101420', border: '#fce400', accent: '#e4002b', top: 'CENTURY',   bot: 'RADIAL SLICKS', fg: '#fce400' },
      { id: 'POLE_POSITION', bg: '#1038a8', border: '#fce400', accent: '#e4002b', top: 'POLE POS',  bot: 'GRAND PRIX',    fg: '#fce400' },
      { id: 'PAC_MAN',       bg: '#080c24', border: '#2048f8', accent: '#fce400', top: 'PAC-MAN',   bot: 'NAMCO ARCADE',  fg: '#fce400' },
      { id: 'DIG_DUG',       bg: '#e8f4ff', border: '#1868fc', accent: '#fc3800', top: 'DIG DUG',   bot: 'NAMCO 1982',    fg: '#1850e8' },
      { id: 'GALAGA',        bg: '#081030', border: '#e4002b', accent: '#00d8f8', top: 'GALAGA',    bot: 'SPACE FIGHTER', fg: '#00fc58' },
      { id: 'XEVIOUS',       bg: '#1c283c', border: '#d0dce8', accent: '#00d8f8', top: 'XEVIOUS',   bot: 'SOLVALOU 82',   fg: '#fcfcfc' },
      { id: 'MAPPY',         bg: '#fff4d8', border: '#fc2818', accent: '#1868fc', top: 'MAPPY',     bot: 'MICRO POLICE',  fg: '#fc2018' },
    ];

    return defs.map((d) => {
      const W = 144;
      const H = 92;
      const bH = 72;
      const { canvas, ctx } = makeOffscreenCanvas(W, H);

      ctx.fillStyle = '#384050';
      ctx.fillRect(26, bH, 9, H - bH);
      ctx.fillRect(W - 35, bH, 9, H - bH);
      ctx.fillStyle = '#aeb8cc';
      ctx.fillRect(28, bH, 3, H - bH);
      ctx.fillRect(W - 33, bH, 3, H - bH);

      ctx.fillStyle = '#0c1018';
      ctx.fillRect(0, 0, W, bH);
      ctx.fillStyle = d.border;
      ctx.fillRect(2, 2, W - 4, bH - 4);
      ctx.fillStyle = d.bg;
      ctx.fillRect(7, 7, W - 14, bH - 14);

      ctx.fillStyle = d.accent;
      ctx.fillRect(7, bH - 22, W - 14, 15);

      if (d.id === 'PAC_MAN') {
        ctx.fillStyle = '#fce400';
        ctx.fillRect(12, 15, 16, 16);
        ctx.fillStyle = d.bg;
        ctx.fillRect(21, 20, 8, 6);
        ctx.fillRect(24, 18, 5, 10);
        ctx.fillStyle = '#fc1800';
        ctx.fillRect(116, 15, 16, 16);
        ctx.fillStyle = '#fcfcfc';
        ctx.fillRect(118, 18, 4, 5);
        ctx.fillRect(125, 18, 4, 5);
        ctx.fillStyle = '#1850e8';
        ctx.fillRect(119, 20, 2, 3);
        ctx.fillRect(126, 20, 2, 3);
        drawRawPixelText(ctx, 'PAC-MAN', 33, 17, d.fg, 2, '#000000');
      } else if (d.id === 'DIG_DUG') {
        ctx.fillStyle = '#fc2818';
        ctx.fillRect(12, 15, 18, 16);
        ctx.fillStyle = '#fce400';
        ctx.fillRect(14, 19, 14, 6);
        ctx.fillStyle = '#10141c';
        ctx.fillRect(16, 21, 3, 2);
        ctx.fillRect(23, 21, 3, 2);
        drawRawPixelText(ctx, 'DIG DUG', 36, 17, d.fg, 2, null);
      } else if (d.id === 'GALAGA') {
        ctx.fillStyle = '#fcfcfc';
        ctx.fillRect(19, 14, 4, 18);
        ctx.fillRect(13, 22, 16, 7);
        ctx.fillStyle = '#fc1800';
        ctx.fillRect(11, 19, 4, 12);
        ctx.fillRect(27, 19, 4, 12);
        drawRawPixelText(ctx, 'GALAGA', 42, 17, d.fg, 2, '#000000');
      } else if (d.id === 'FUJI_FILM') {
        ctx.fillStyle = '#00a844';
        ctx.fillRect(7, 7, W - 14, 8);
        ctx.fillStyle = '#e4002b';
        ctx.fillRect(13, 18, 16, 14);
        ctx.fillStyle = '#fcfcfc';
        ctx.fillRect(16, 24, 10, 4);
        drawRawPixelText(ctx, 'FUJI GP', 38, 19, d.fg, 2, null);
      } else if (d.id === 'POLE_OIL') {
        ctx.fillStyle = '#1838d8';
        ctx.fillRect(12, 14, 20, 18);
        drawRawPixelText(ctx, '76', 16, 19, '#fcfcfc', 1, null);
        drawRawPixelText(ctx, 'POLE 76', 38, 17, '#fcfcfc', 2, '#1838d8');
      } else if (d.id === 'CENTURY_TIRE') {
        ctx.fillStyle = '#fce400';
        ctx.fillRect(12, 20, 18, 6);
        ctx.fillRect(16, 16, 14, 4);
        drawRawPixelText(ctx, 'CENTURY', 36, 17, d.fg, 2, '#000000');
      } else if (d.id === 'POLE_POSITION') {
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? '#fcfcfc' : '#101010';
            ctx.fillRect(12 + c * 4, 15 + r * 4, 4, 4);
          }
        }
        drawRawPixelText(ctx, 'POLE POS', 34, 17, d.fg, 2, '#000000');
      } else {
        const stepW = d.top.length * 12;
        const tx = Math.max(10, ((W - stepW) >> 1));
        drawRawPixelText(ctx, d.top, tx, 17, d.fg, 2, d.bg === '#fcfcfc' ? null : '#000000');
      }

      const subFg = (d.accent === '#fce400' || d.accent === '#fcfcfc') ? '#10141c' : '#fcfcfc';
      const bx = Math.max(10, ((W - d.bot.length * 6) >> 1));
      drawRawPixelText(ctx, d.bot, bx, bH - 18, subFg, 1, null);

      return canvas;
    });
  }

  _buildChevronSprites() {
    // Authentic 1982 Namco Red-on-White Corner Chevron Signboards: < / << / <<< and > / >> / >>>
    const buildSign = (dir, count, flashYellow = false) => {
      const W = 72;
      const H = 52;
      const bH = 36;
      const { canvas, ctx } = makeOffscreenCanvas(W, H);

      // Twin steel signposts
      ctx.fillStyle = '#384050';
      ctx.fillRect(14, bH, 6, H - bH);
      ctx.fillRect(W - 20, bH, 6, H - bH);
      ctx.fillStyle = '#b8c4d8';
      ctx.fillRect(16, bH, 2, H - bH);
      ctx.fillRect(W - 18, bH, 2, H - bH);

      // Outer dark frame + reflective white/yellow face
      ctx.fillStyle = '#0c1018';
      ctx.fillRect(1, 1, W - 2, bH - 1);
      ctx.fillStyle = flashYellow ? '#fce400' : '#e4002b';
      ctx.fillRect(3, 3, W - 6, bH - 5);
      ctx.fillStyle = flashYellow ? '#fff8c8' : '#fcfcfc';
      ctx.fillRect(6, 6, W - 12, bH - 11);

      // Bold pixel chevrons (< or >)
      const chevSpacing = count === 1 ? 0 : (count === 2 ? 18 : 15);
      const startCx = (W >> 1) - Math.round(((count - 1) * chevSpacing) * 0.5);
      const midY = 18;
      const armH = 10;
      const strokeW = count === 3 ? 5 : 6;

      for (let i = 0; i < count; i++) {
        const cx = startCx + i * chevSpacing;
        for (let dy = -armH; dy <= armH; dy++) {
          const indent = armH - Math.abs(dy);
          const xTip = dir > 0 ? (cx - 4 + indent) : (cx + 4 - indent);
          ctx.fillStyle = '#101420';
          ctx.fillRect(xTip - (dir > 0 ? strokeW : 0) - 1, midY + dy, strokeW + 2, 1);
          ctx.fillStyle = '#e4002b';
          ctx.fillRect(xTip - (dir > 0 ? strokeW : 0), midY + dy, strokeW, 1);
        }
      }
      return canvas;
    };

    return {
      L1: buildSign(-1, 1, false),
      L2: buildSign(-1, 2, false),
      L3: buildSign(-1, 3, false),
      L3F: buildSign(-1, 3, true),
      R1: buildSign(1, 1, false),
      R2: buildSign(1, 2, false),
      R3: buildSign(1, 3, false),
      R3F: buildSign(1, 3, true),
    };
  }

  _buildPitInSignSprites() {
    return [false, true].map((alt) => {
      const { canvas, ctx } = makeOffscreenCanvas(56, 46);
      ctx.fillStyle = '#384050';
      ctx.fillRect(25, 30, 6, 16);
      ctx.fillStyle = '#081018';
      ctx.fillRect(1, 1, 54, 30);
      ctx.fillStyle = alt ? '#fce400' : '#00fc58';
      ctx.fillRect(3, 3, 50, 26);
      ctx.fillStyle = '#082c18';
      ctx.fillRect(5, 5, 46, 22);
      drawRawPixelText(ctx, 'PIT IN', 10, 7, '#00fc58', 1, '#000000');
      drawRawPixelText(ctx, '>>>', 19, 17, alt ? '#fcfcfc' : '#fce400', 1, '#000000');
      return canvas;
    });
  }

  _buildBrakingBoardSprites() {
    const map = {};
    for (const dist of [150, 100, 50]) {
      const { canvas, ctx } = makeOffscreenCanvas(46, 60);
      ctx.fillStyle = '#8894a8';
      ctx.fillRect(20, 40, 6, 20);
      ctx.fillStyle = '#0c1018';
      ctx.fillRect(1, 1, 44, 40);
      ctx.fillStyle = '#fcfcfc';
      ctx.fillRect(3, 3, 40, 36);
      ctx.fillStyle = '#086c24';
      ctx.fillRect(6, 6, 34, 30);

      const txt = String(dist);
      const tx = Math.max(5, ((46 - txt.length * 12) >> 1));
      drawRawPixelText(ctx, txt, tx, 9, '#fcfcfc', 2, '#000000');
      drawRawPixelText(ctx, 'METERS', 6, 26, '#fce400', 1, null);
      map[dist] = canvas;
    }
    return map;
  }

  _buildScenicPropSprites() {
    const pine = makeOffscreenCanvas(28, 44);
    pine.ctx.fillStyle = '#5c3818';
    pine.ctx.fillRect(12, 32, 4, 12);
    const tiers = [[14, 6, 7], [14, 15, 10], [14, 25, 13]];
    for (const [cx, topY, halfW] of tiers) {
      for (let r = 0; r < 11; r++) {
        const hw = Math.max(1, Math.round((r / 10) * halfW));
        pine.ctx.fillStyle = r < 4 ? '#28a438' : '#147020';
        pine.ctx.fillRect(cx - hw, topY + r, hw * 2, 1);
      }
    }

    const sakura = makeOffscreenCanvas(30, 42);
    sakura.ctx.fillStyle = '#58341c';
    sakura.ctx.fillRect(13, 28, 4, 14);
    const blobs = [[15, 14, 9], [9, 18, 7], [21, 18, 7], [15, 21, 8]];
    for (const [bx, by, br] of blobs) {
      for (let y = 2; y < 30; y++) {
        for (let x = 2; x < 28; x++) {
          if ((x - bx) * (x - bx) + (y - by) * (y - by) <= br * br) {
            sakura.ctx.fillStyle = y < by - 2 ? '#ffd0e4' : '#f888b8';
            sakura.ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    }

    const pitSign = makeOffscreenCanvas(36, 44);
    pitSign.ctx.fillStyle = '#98a4b8';
    pitSign.ctx.fillRect(16, 26, 4, 18);
    pitSign.ctx.fillStyle = '#081810';
    pitSign.ctx.fillRect(1, 1, 34, 26);
    pitSign.ctx.fillStyle = '#00fc58';
    pitSign.ctx.fillRect(2, 2, 32, 24);
    pitSign.ctx.fillStyle = '#083c1c';
    pitSign.ctx.fillRect(4, 4, 28, 20);
    drawRawPixelText(pitSign.ctx, 'PIT', 9, 6, '#00fc58', 1, '#000000');
    drawRawPixelText(pitSign.ctx, '#1', 12, 15, '#fce400', 1, '#000000');

    const palm = makeOffscreenCanvas(30, 46);
    for (let y = 16; y < 46; y++) {
      const curveX = Math.round(Math.sin((46 - y) * 0.08) * 2);
      palm.ctx.fillStyle = (y & 1) === 0 ? '#8c5828' : '#643c18';
      palm.ctx.fillRect(13 + curveX, y, 4, 1);
    }
    const fronds = [[-11, -2], [-9, 4], [11, -2], [9, 4], [0, -6]];
    for (const [fx, fy] of fronds) {
      palm.ctx.fillStyle = '#18b848';
      palm.ctx.fillRect(15 + Math.min(0, fx), 14 + Math.min(0, fy), Math.max(3, Math.abs(fx)), 3);
      palm.ctx.fillStyle = '#0c8430';
      palm.ctx.fillRect(15 + Math.min(0, fx), 16 + Math.min(0, fy), Math.max(3, Math.abs(fx)), 2);
    }

    const autumnPine = makeOffscreenCanvas(28, 44);
    autumnPine.ctx.fillStyle = '#543018';
    autumnPine.ctx.fillRect(12, 32, 4, 12);
    for (const [cx, topY, halfW] of tiers) {
      for (let r = 0; r < 11; r++) {
        const hw = Math.max(1, Math.round((r / 10) * halfW));
        autumnPine.ctx.fillStyle = r < 4 ? '#fca028' : (r < 8 ? '#e45818' : '#9c3010');
        autumnPine.ctx.fillRect(cx - hw, topY + r, hw * 2, 1);
      }
    }

    const neonSign = makeOffscreenCanvas(34, 48);
    neonSign.ctx.fillStyle = '#242c40';
    neonSign.ctx.fillRect(15, 32, 4, 16);
    neonSign.ctx.fillStyle = '#120828';
    neonSign.ctx.fillRect(2, 2, 30, 30);
    neonSign.ctx.fillStyle = '#ff28a8';
    neonSign.ctx.fillRect(3, 3, 28, 28);
    neonSign.ctx.fillStyle = '#180c38';
    neonSign.ctx.fillRect(5, 5, 24, 24);
    drawRawPixelText(neonSign.ctx, '777', 8, 8, '#fce400', 1, '#000000');
    drawRawPixelText(neonSign.ctx, 'VIP', 8, 18, '#00f4ff', 1, '#000000');

    const buildPitCrew = (waveUp) => {
      const pc = makeOffscreenCanvas(28, 34);
      const c = pc.ctx;
      c.fillStyle = '#141820';
      c.fillRect(2, 22, 8, 11);
      c.fillStyle = '#d8e0ec';
      c.fillRect(4, 25, 4, 5);
      c.fillStyle = '#fcfcfc';
      c.fillRect(12, 16, 8, 10);
      c.fillStyle = '#e4181c';
      c.fillRect(12, 20, 8, 3);
      c.fillRect(12, 26, 3, 7);
      c.fillRect(17, 26, 3, 7);
      c.fillStyle = '#fce400';
      c.fillRect(13, 10, 6, 6);
      c.fillStyle = '#1858f8';
      c.fillRect(14, 12, 4, 2);
      const armY = waveUp ? 4 : 7;
      c.fillStyle = '#dce4f0';
      c.fillRect(21, armY + 6, 2, 14);
      c.fillStyle = '#fc1800';
      c.fillRect(18, armY, 8, 7);
      c.fillStyle = '#fce400';
      c.fillRect(20, armY + 2, 4, 3);
      return pc.canvas;
    };

    const buildMarshal = (flagType, waveAlt) => {
      const m = makeOffscreenCanvas(30, 38);
      const c = m.ctx;
      c.fillStyle = '#dce4f2';
      c.fillRect(2, 24, 10, 13);
      c.fillStyle = '#1858f8';
      c.fillRect(2, 24, 10, 3);
      c.fillStyle = '#fc6800';
      c.fillRect(10, 18, 7, 11);
      c.fillRect(10, 29, 3, 8);
      c.fillRect(14, 29, 3, 8);
      c.fillStyle = '#fcfcfc';
      c.fillRect(11, 13, 5, 5);
      c.fillRect(10, 22, 7, 2);
      const fy = waveAlt ? 3 : 6;
      c.fillStyle = '#d8e0ec';
      c.fillRect(17, fy, 2, 20);
      const fw = 11;
      const fh = 8;
      if (flagType === 'CHECKERED') {
        for (let r = 0; r < 4; r++) {
          for (let col = 0; col < 5; col++) {
            c.fillStyle = ((r + col + (waveAlt ? 1 : 0)) & 1) === 0 ? '#fcfcfc' : '#101010';
            c.fillRect(19 + col * 2, fy + r * 2 + ((col & 1) && waveAlt ? 1 : 0), 2, 2);
          }
        }
      } else {
        const hex = flagType === 'YELLOW' ? '#fce400' : (flagType === 'BLUE' ? '#2888ff' : '#00fc58');
        const shade = flagType === 'YELLOW' ? '#d8a800' : (flagType === 'BLUE' ? '#1450b8' : '#00a838');
        c.fillStyle = '#0c1018';
        c.fillRect(18, fy - 1, fw + 2, fh + 2);
        c.fillStyle = hex;
        c.fillRect(19, fy, fw, fh);
        c.fillStyle = shade;
        c.fillRect(22, fy + (waveAlt ? 1 : 3), 5, 4);
      }
      return m.canvas;
    };

    const torii = makeOffscreenCanvas(38, 46);
    {
      const c = torii.ctx;
      // Stone pedestal bases
      c.fillStyle = '#18202c';
      c.fillRect(5, 39, 6, 7);
      c.fillRect(27, 39, 6, 7);
      // Crimson pillars (hashira)
      c.fillStyle = '#e41820';
      c.fillRect(6, 10, 4, 30);
      c.fillRect(28, 10, 4, 30);
      c.fillStyle = '#ff3840';
      c.fillRect(7, 10, 1, 29);
      c.fillRect(29, 10, 1, 29);
      // Lower tie beam (nuki)
      c.fillStyle = '#d8141c';
      c.fillRect(3, 16, 32, 3);
      c.fillStyle = '#18202c';
      c.fillRect(3, 15, 32, 1);
      // Upper lintel (kasagi) with upturned wing tips
      c.fillStyle = '#141824';
      c.fillRect(1, 5, 36, 3);
      c.fillRect(0, 3, 4, 3);
      c.fillRect(34, 3, 4, 3);
      c.fillStyle = '#e41820';
      c.fillRect(2, 8, 34, 3);
      // Center gold tablet (gakuzuka)
      c.fillStyle = '#141824';
      c.fillRect(16, 10, 6, 7);
      c.fillStyle = '#fce400';
      c.fillRect(17, 11, 4, 5);
      // Hanging festival chochin lanterns
      c.fillStyle = '#ff2830';
      c.fillRect(11, 20, 3, 4);
      c.fillRect(24, 20, 3, 4);
      c.fillStyle = '#fcfcfc';
      c.fillRect(11, 21, 3, 1);
      c.fillRect(24, 21, 3, 1);
    }

    const buildFanTribune = (waveUp) => {
      const ft = makeOffscreenCanvas(46, 40);
      const c = ft.ctx;
      // Bleacher structural frame
      c.fillStyle = '#1c2434';
      c.fillRect(2, 14, 42, 25);
      c.fillStyle = '#2c3850';
      c.fillRect(3, 16, 40, 20);
      // Festival canopy roof stripes
      for (let rx = 2; rx < 44; rx += 4) {
        c.fillStyle = ((rx >> 2) & 1) === 0 ? '#ff1828' : '#fcfcfc';
        c.fillRect(rx, 9, 4, 4);
      }
      c.fillStyle = '#ffd800';
      c.fillRect(2, 13, 42, 1);
      // Packed jumping fans in 3 rows (Ferrari Red, Papaya, Cyan, Yellow, Pink, White)
      const fanPalette = ['#ff1828', '#ff8000', '#00f5d0', '#ffd800', '#ff48b0', '#fcfcfc'];
      for (let row = 0; row < 3; row++) {
        const baseY = 17 + row * 5;
        for (let col = 0; col < 9; col++) {
          const fx = 5 + col * 4;
          const jump = ((col + row + (waveUp ? 1 : 0)) & 1) === 0 ? -1 : 0;
          const shirtHex = fanPalette[(col + row * 2) % fanPalette.length];
          c.fillStyle = '#ffcc98';
          c.fillRect(fx + 1, baseY + jump, 2, 1);
          c.fillStyle = shirtHex;
          c.fillRect(fx, baseY + 1 + jump, 3, 3);
          if (jump < 0) {
            // Raised cheering arms
            c.fillRect(fx - 1, baseY + jump, 1, 2);
            c.fillRect(fx + 3, baseY + jump, 1, 2);
          }
        }
      }
      // Front cheer banner rail
      c.fillStyle = waveUp ? '#ff1828' : '#101828';
      c.fillRect(3, 31, 40, 8);
      c.fillStyle = '#ffd800';
      c.fillRect(4, 32, 38, 1);
      drawRawPixelText(c, waveUp ? 'VAMOS!' : 'GO #1!', 6, 33, '#fcfcfc', 1, '#000000');
      // Giant waving checkered & team flags above the roof
      const poleY = waveUp ? 1 : 2;
      c.fillStyle = '#dce4f0';
      c.fillRect(7, poleY, 1, 9);
      c.fillRect(36, poleY, 1, 9);
      for (let r = 0; r < 3; r++) {
        for (let col = 0; col < 4; col++) {
          c.fillStyle = ((r + col + (waveUp ? 1 : 0)) & 1) === 0 ? '#fcfcfc' : '#101010';
          c.fillRect(8 + col * 2, poleY + r * 2, 2, 2);
        }
      }
      c.fillStyle = '#ff8000';
      c.fillRect(37, poleY, 7, 5);
      c.fillStyle = '#00f5d0';
      c.fillRect(38, poleY + 2, 5, 2);
      // Camera flash sparkle
      if (waveUp) {
        c.fillStyle = '#ffffff';
        c.fillRect(21, 18, 2, 2);
      }
      return ft.canvas;
    };

    const buildTifosiFlare = (alt) => {
      const tf = makeOffscreenCanvas(34, 46);
      const c = tf.ctx;
      // Cheering Tifosi fan at base
      c.fillStyle = '#ff1828';
      c.fillRect(13, 32, 8, 9);
      c.fillStyle = '#182030';
      c.fillRect(13, 41, 3, 5);
      c.fillRect(18, 41, 3, 5);
      c.fillStyle = '#ffd800';
      c.fillRect(14, 27, 6, 5);
      // Rising Italian Tricolore & Rosso smoke flare puffs
      const shift = alt ? 2 : -1;
      const puffs = [
        [16, 23, 4, '#ff2830'],
        [15 + shift, 17, 6, '#ff3830'],
        [17 - shift, 11, 7, '#fcfcfc'],
        [15 + shift, 6, 6, '#00c850'],
      ];
      for (const [px, py, pr, hex] of puffs) {
        c.fillStyle = hex;
        c.fillRect(px - pr, py - (pr >> 1), pr * 2, pr);
      }
      return tf.canvas;
    };

    return {
      pine: pine.canvas,
      sakura: sakura.canvas,
      palm: palm.canvas,
      autumnPine: autumnPine.canvas,
      neonSign: neonSign.canvas,
      pitSign: pitSign.canvas,
      torii: torii.canvas,
      fanTribune0: buildFanTribune(false),
      fanTribune1: buildFanTribune(true),
      tifosiFlare0: buildTifosiFlare(false),
      tifosiFlare1: buildTifosiFlare(true),
      pitCrew0: buildPitCrew(false),
      pitCrew1: buildPitCrew(true),
      marshalGreen0: buildMarshal('GREEN', false),
      marshalGreen1: buildMarshal('GREEN', true),
      marshalYellow0: buildMarshal('YELLOW', false),
      marshalYellow1: buildMarshal('YELLOW', true),
      marshalBlue0: buildMarshal('BLUE', false),
      marshalBlue1: buildMarshal('BLUE', true),
      marshalCheck0: buildMarshal('CHECKERED', false),
      marshalCheck1: buildMarshal('CHECKERED', true),
    };
  }

  _buildGantrySprites() {
    const buildBanner = (headline, subline, bgHex, accentHex, hasLightPods) => {
      const W = 320;
      const H = 148;
      const { canvas, ctx } = makeOffscreenCanvas(W, H);

      for (const lx of [6, W - 22]) {
        ctx.fillStyle = '#485468';
        ctx.fillRect(lx, 6, 16, H - 6);
        ctx.fillStyle = '#dce4f2';
        ctx.fillRect(lx + 2, 6, 3, H - 6);
        ctx.fillRect(lx + 11, 6, 3, H - 6);
        for (let y = 12; y < H - 6; y += 12) {
          ctx.fillRect(lx + 2, y, 12, 3);
          ctx.fillRect(lx + 5, y + 5, 6, 3);
        }
      }

      ctx.fillStyle = '#c8d4e8';
      ctx.fillRect(16, 6, W - 32, 4);
      ctx.fillRect(16, 48, W - 32, 4);

      ctx.fillStyle = '#10141c';
      ctx.fillRect(22, 10, W - 44, 40);
      ctx.fillStyle = accentHex;
      ctx.fillRect(24, 12, W - 48, 36);
      ctx.fillStyle = bgHex;
      ctx.fillRect(28, 15, W - 56, 30);

      for (const fx of [31, W - 51]) {
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 4; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? '#fcfcfc' : '#101010';
            ctx.fillRect(fx + c * 5, 17 + r * 5, 5, 5);
          }
        }
      }

      const hScale = headline.length <= 16 ? 2 : 1;
      const hStep = headline.length * (6 * hScale);
      const hx = Math.max(54, ((W - hStep) >> 1));
      drawRawPixelText(ctx, headline, hx, hScale === 2 ? 17 : 20, '#fce400', hScale, '#000000');

      const sx = Math.max(54, ((W - subline.length * 6) >> 1));
      drawRawPixelText(ctx, subline, sx, 34, '#fcfcfc', 1, '#000000');

      if (hasLightPods) {
        for (let i = 0; i < 5; i++) {
          const px = 90 + i * 31;
          ctx.fillStyle = '#10141c';
          ctx.fillRect(px, 52, 18, 18);
          ctx.fillStyle = '#384050';
          ctx.fillRect(px + 2, 54, 14, 14);
          ctx.fillStyle = '#300c0c';
          ctx.fillRect(px + 4, 56, 10, 10);
        }
      }

      return canvas;
    };

    return {
      race: buildBanner('POLE POSITION', 'NAMCO FUJI GP 1982', '#c8141c', '#fce400', true),
      qualify: buildBanner('QUALIFYING LAP', 'PREPARE TO QUALIFY!', '#1444b8', '#fce400', true),
      bridge: buildBanner('NAMCO FUJI GP', 'SECTOR CHECKPOINT', '#0c5c34', '#fcfcfc', false),
    };
  }

  _buildMomoWheelSprites() {
    // 9 Pre-Baked Angles (-4..+4, +-48 deg) of a 3-Spoke Suede MOMO Wheel + Nomex Gloves.
    // Strictly bounded y >= 10 in 72x56 sprite so top rim/glove NEVER crosses above y_top!
    const sprites = [];
    const W = 72;
    const H = 56;
    const cx = 36;
    const cy = 33;
    const outerR = 22;
    const innerR = 17;
    const minAllowY = 10; // cy - outerR - 1 = 10 -> mathematically bounded top pixel!

    for (let step = -4; step <= 4; step++) {
      const ang = (step / 4) * 0.82; // +-47 deg visual lock (keeps hands on rim without blocking binnacle!)
      const { canvas, ctx } = makeOffscreenCanvas(W, H);

      // 1. Brushed Aluminum 3-Spoke Core
      const spokeAngles = [Math.PI, 0, Math.PI * 0.5];
      for (let s = 0; s < 3; s++) {
        const sa = spokeAngles[s] + ang;
        const ux = Math.cos(sa);
        const uy = Math.sin(sa);
        const px = -uy;
        const py = ux;
        for (let r = 5; r <= innerR + 1; r++) {
          for (let w = -2; w <= 2; w++) {
            const x = Math.round(cx + ux * r + px * w);
            const y = Math.round(cy + uy * r + py * w);
            if (y >= minAllowY && y < H) {
              ctx.fillStyle = Math.abs(w) === 2 ? '#181c24' : (w === 0 ? '#dce6f4' : '#8c98ac');
              ctx.fillRect(x, y, 1, 1);
            }
          }
        }
      }

      // 2. Stitched Black Suede MOMO Rim + Yellow 12-o'clock Top Centering Tape
      const topX = cx + Math.sin(ang) * ((outerR + innerR) * 0.5);
      const topY = cy - Math.cos(ang) * ((outerR + innerR) * 0.5);
      for (let y = Math.max(minAllowY, cy - outerR - 1); y <= cy + outerR + 1 && y < H; y++) {
        for (let x = cx - outerR - 1; x <= cx + outerR + 1; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= innerR - 0.5 && dist <= outerR + 0.5) {
            if (dist < innerR + 0.6 || dist > outerR - 0.6) {
              ctx.fillStyle = '#080a10';
            } else if (Math.hypot(x - topX, y - topY) <= 2.6) {
              ctx.fillStyle = '#fce400';
            } else {
              ctx.fillStyle = (dx + dy < 0) ? '#323846' : '#1c202a';
            }
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }

      // 3. Center MOMO Hub Boss + #1 Horn Button
      for (let y = cy - 6; y <= cy + 6 && y < H; y++) {
        for (let x = cx - 6; x <= cx + 6; x++) {
          const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
          if (d2 <= 38) {
            ctx.fillStyle = d2 > 26 ? '#0c1018' : (d2 > 12 ? '#283040' : '#e4181c');
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
      ctx.fillStyle = '#fce400';
      ctx.fillRect(cx - 1, cy - 2, 2, 4);

      // 4. Left & Right Nomex Racing Gloves at 9 & 3 o'clock (strictly >= minAllowY!)
      const gripAngles = [Math.PI + ang, 0 + ang];
      for (let g = 0; g < 2; g++) {
        const ga = gripAngles[g];
        const gx = Math.round(cx + Math.cos(ga) * 19.5);
        const gy = Math.max(minAllowY + 5, Math.round(cy + Math.sin(ga) * 19.5));

        const cuffBaseX = g === 0 ? cx - 21 : cx + 21;
        for (let t = 0; t <= 10; t++) {
          const u = t / 10;
          const sx = Math.round(gx + (cuffBaseX - gx) * u);
          const sy = Math.round(gy + 4 + (H - 1 - (gy + 4)) * u);
          if (sy >= minAllowY && sy < H) {
            ctx.fillStyle = '#10141c';
            ctx.fillRect(sx - 5, sy, 10, 2);
            ctx.fillStyle = t < 3 ? '#fcfcfc' : '#d8181c';
            ctx.fillRect(sx - 4, sy, 8, 2);
          }
        }

        const gTop = Math.max(minAllowY, gy - 4);
        const gH = Math.min(9, (gy + 5) - gTop);
        ctx.fillStyle = '#080c14';
        ctx.fillRect(gx - 5, gTop, 10, gH);
        ctx.fillStyle = '#e4181c';
        ctx.fillRect(gx - 4, gTop + 1, 8, Math.max(1, gH - 2));
        ctx.fillStyle = '#fcfcfc';
        ctx.fillRect(gx - 3, gTop + 2, 6, 2);
        const thumbDir = g === 0 ? 3 : -5;
        ctx.fillStyle = '#181c24';
        ctx.fillRect(gx + thumbDir, Math.max(minAllowY + 1, gy - 1), 2, 3);
      }

      sprites.push(canvas);
    }
    return sprites;
  }

  _rebuildCrtOverlay(w, h) {
    // Clean, non-crushing 1982 Electrohome G07 CRT scanlines (12% alpha) & subtle 22% tube bezel vignette
    const { canvas, ctx } = makeOffscreenCanvas(w, h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    for (let y = 1; y < h; y += 2) {
      ctx.fillRect(0, y, w, 1);
    }
    const grad = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.42,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.78
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    this._crtCanvas = canvas;
  }

  // ==========================================================================
  // ZERO-ALLOCATION C1 CUBIC TRACK POSE, UNCLAMPED CURVATURE & SIGN CACHE
  // ==========================================================================

  _ensureTrackCache(track, mPerGameM) {
    const tid = track?.trackId || track?.trackDef?.id || 'FUJI_1982';
    if (this._cachedTrackRef === track && this._cachedTrackId === tid && this._cachedSampleCurvRadM) {
      return;
    }
    this._cachedTrackRef = track;
    this._cachedTrackId = tid;
    this._hasPrevYaw = false;
    this._hasSmoothInit = false;

    // 1. Pre-compute unclamped C1-smooth metric curvature (rad/m) directly from track.samples tangents!
    const samples = track?.samples;
    if (Array.isArray(samples) && samples.length > 16) {
      const N = samples.length;
      const dsReal = (TRACK_GAME_LENGTH / N) * mPerGameM;
      const rawK = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const tPrev = samples[(i - 4 + N) % N].tangent;
        const tNext = samples[(i + 4) % N].tangent;
        const rgt = samples[i].right;
        const dPsi = (tNext.x - tPrev.x) * rgt.x + (tNext.y - tPrev.y) * rgt.y + (tNext.z - tPrev.z) * rgt.z;
        rawK[i] = clamp(dPsi / Math.max(0.01, 8.0 * dsReal), -0.045, 0.045);
      }
      const smoothK = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        let sum = 0;
        let wSum = 0;
        for (let j = -6; j <= 6; j++) {
          const w = 7 - Math.abs(j);
          sum += rawK[(i + j + N) % N] * w;
          wSum += w;
        }
        let kVal = sum / wSum;
        const s = (i / N) * TRACK_GAME_LENGTH;
        if (s >= 950.0 || s <= 126.0) {
          kVal = 0.0;
        } else if (s > 934.0 && s < 950.0) {
          kVal *= 1.0 - quinticStep01((s - 934.0) / 16.0);
        } else if (s > 126.0 && s < 142.0) {
          kVal *= quinticStep01((s - 126.0) / 16.0);
        }
        smoothK[i] = kVal;
      }
      this._cachedSampleCurvRadM = smoothK;
    } else {
      this._cachedSampleCurvRadM = null;
    }

    // 2. Scan circuit corners to generate authentic 1982 Namco < / << / <<< Corner Chevron Signs!
    const cornerSigns = [];
    const scanSteps = 500;
    let inCorner = false;
    let segStartS = 0;
    let peakAbsK = 0;
    let peakSign = 1;
    let peakS = 0;

    for (let i = 0; i <= scanSteps; i++) {
      const s = (i / scanSteps) * TRACK_GAME_LENGTH;
      const k = this._readUnclampedCurvatureRadM(track, s, mPerGameM);
      const ak = Math.abs(k);
      if (ak >= 0.0052 && s > 132 && s < 942) {
        if (!inCorner) {
          inCorner = true;
          segStartS = s;
          peakAbsK = ak;
          peakSign = k >= 0 ? 1 : -1;
          peakS = s;
        } else if (ak > peakAbsK) {
          peakAbsK = ak;
          peakSign = k >= 0 ? 1 : -1;
          peakS = s;
        }
      } else if (inCorner) {
        inCorner = false;
        const rMin = 1.0 / Math.max(0.001, peakAbsK);
        const sev = rMin <= 54.0 ? 3 : (rMin <= 102.0 ? 2 : 1);
        // Outside verge of turn: if road turns RIGHT (peakSign > 0), outside verge is LEFT (-1) pointing RIGHT ('R')!
        const vergeSide = peakSign > 0 ? -1 : 1;
        const dirChar = peakSign > 0 ? 'R' : 'L';
        const stations = sev === 3
          ? [segStartS - 5.0, (segStartS + peakS) * 0.5, peakS + 2.0]
          : [segStartS - 3.0, peakS];
        for (let st = 0; st < stations.length; st++) {
          const signS = wrapS(stations[st]);
          if (vergeSide > 0 && (signS >= 906 || signS <= 122)) continue;
          cornerSigns.push({
            s: signS,
            latM: vergeSide * (ROAD_HALF_WIDTH + 3.5),
            dir: dirChar,
            sev,
          });
        }
      }
    }
    this._cachedCornerSigns = cornerSigns;

    // 3. Build disciplined 22-billboard 1982 Namco trackside sponsor layout (pruned from 50+ spam!)
    const billboards = [];
    const tunnelRange = track?.trackDef?.tunnelRangeS || null;
    const rawBB = Array.isArray(track?.billboards) ? track.billboards : null;

    if (rawBB && rawBB.length > 0) {
      const stride = Math.max(1, Math.ceil(rawBB.length / 22));
      for (let i = 0; i < rawBB.length && billboards.length < 22; i += stride) {
        const bb = rawBB[i];
        if (!bb) continue;
        const bs = wrapS(bb.s);
        if (tunnelRange && bs >= tunnelRange[0] && bs <= tunnelRange[1]) continue;
        billboards.push({
          s: bs,
          latM: bb.lateralOffset || ((i % 2 === 0 ? -1 : 1) * (ROAD_HALF_WIDTH + 7.4)),
          spriteIdx: i % this._billboardSprites.length,
        });
      }
    }

    // Fill up to 22 clean outer-verge iconic Namco sponsor boards (>= 42 game-m apart per side)
    const targetCount = 22;
    for (let slot = 0; slot < targetCount && billboards.length < targetCount; slot++) {
      const s = wrapS(26 + slot * (940 / targetCount));
      if (tunnelRange && s >= tunnelRange[0] && s <= tunnelRange[1]) continue;
      const side = slot % 2 === 0 ? -1 : 1;
      if (side > 0 && (s >= 900 || s <= 124)) continue;

      let tooClose = false;
      for (let j = 0; j < billboards.length; j++) {
        if (Math.abs(signedDeltaS(s, billboards[j].s)) < 16.0 && Math.sign(billboards[j].latM) === side) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        billboards.push({
          s,
          latM: side * (ROAD_HALF_WIDTH + 8.4),
          spriteIdx: (slot * 3 + 1) % this._billboardSprites.length,
        });
      }
    }
    this._cachedBillboards = billboards;
  }

  _readUnclampedCurvatureRadM(track, s, mPerGameM) {
    if (track && typeof track.getRealCurvature === 'function') {
      const kr = track.getRealCurvature(s);
      if (Number.isFinite(kr)) return kr;
    }
    if (track && typeof track.getMetricCurvatureAt === 'function') {
      const km = track.getMetricCurvatureAt(s);
      if (Number.isFinite(km)) return km;
    }
    const arr = this._cachedSampleCurvRadM;
    if (arr && arr.length > 8) {
      const N = arr.length;
      const sw = wrapS(s);
      const fIdx = (sw / TRACK_GAME_LENGTH) * N;
      const i0 = Math.floor(fIdx) % N;
      const i1 = (i0 + 1) % N;
      const frac = fIdx - Math.floor(fIdx);
      return arr[i0] + (arr[i1] - arr[i0]) * frac;
    }
    if (track && typeof track.getPhysicsCurvature === 'function') {
      return track.getPhysicsCurvature(s) / 82.0;
    }
    return 0.0;
  }

  // C1 Catmull-Rom cubic Hermite spline evaluation of elevation & heading yaw (zero allocations!)
  _evalTrackCubicPose(track, s) {
    const samples = track?.samples;
    if (Array.isArray(samples) && samples.length > 8) {
      const len = samples.length;
      const sw = wrapS(s);
      const fIdx = (sw / TRACK_GAME_LENGTH) * len;
      const base = Math.floor(fIdx);
      const t = fIdx - base;
      const t2 = t * t;
      const t3 = t2 * t;

      const i0 = ((base - 1) % len + len) % len;
      const i1 = ((base) % len + len) % len;
      const i2 = (i1 + 1) % len;
      const i3 = (i1 + 2) % len;

      // Catmull-Rom basis weights
      const w0 = -0.5 * t3 + t2 - 0.5 * t;
      const w1 =  1.5 * t3 - 2.5 * t2 + 1.0;
      const w2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
      const w3 =  0.5 * t3 - 0.5 * t2;

      const s0 = samples[i0];
      const s1 = samples[i1];
      const s2 = samples[i2];
      const s3 = samples[i3];

      const elev = s0.pos.y * w0 + s1.pos.y * w1 + s2.pos.y * w2 + s3.pos.y * w3;
      const tx = s0.tangent.x * w0 + s1.tangent.x * w1 + s2.tangent.x * w2 + s3.tangent.x * w3;
      const ty = s0.tangent.y * w0 + s1.tangent.y * w1 + s2.tangent.y * w2 + s3.tangent.y * w3;
      const tz = s0.tangent.z * w0 + s1.tangent.z * w1 + s2.tangent.z * w2 + s3.tangent.z * w3;
      const horiz = Math.sqrt(tx * tx + tz * tz) || 1.0;

      this._poseElev = elev;
      this._poseYaw = Math.atan2(tx, tz);
      this._poseSlope = ty / horiz;
      return;
    }
    if (track && typeof track.sampleAt === 'function') {
      const smp = track.sampleAt(s, 0);
      this._poseElev = smp?.pos?.y || 0;
      this._poseYaw = smp?.headingYaw || 0;
      this._poseSlope = smp?.tangent?.y || 0;
      return;
    }
    this._poseElev = 0;
    this._poseYaw = 0;
    this._poseSlope = 0;
  }

  _readPitOffsetAt(track, s) {
    const sw = wrapS(s);
    if (sw < 912 && sw > 110) return -1;
    const samples = track?.samples;
    if (Array.isArray(samples) && samples.length > 4) {
      const idx = Math.floor((sw / TRACK_GAME_LENGTH) * samples.length) % samples.length;
      const po = samples[idx]?.pitOffset;
      if (po !== null && po !== undefined) return po;
    }
    if (sw >= 912 && sw < 946) {
      const u = (sw - 912) / 34.0;
      return ROAD_HALF_WIDTH * 0.6 + (PIT_LANE_CONFIG.lateralOffset - ROAD_HALF_WIDTH * 0.6) * u;
    }
    if (sw >= 946 || sw <= 68) return PIT_LANE_CONFIG.lateralOffset;
    const u = (sw - 68) / 42.0;
    return PIT_LANE_CONFIG.lateralOffset + (ROAD_HALF_WIDTH * 0.6 - PIT_LANE_CONFIG.lateralOffset) * u;
  }

  // ==========================================================================
  // SIM-PARITY VEHICLE TELEMETRY EXTRACTORS (ZERO ALLOCATIONS)
  // ==========================================================================

  _readCornerTireLife(car, key, idx) {
    const objLife = car?.tires?.[key]?.life;
    if (Number.isFinite(objLife)) return clamp(objLife, 0, 1);
    const arrLife = car?.tireWear?.[idx];
    if (Number.isFinite(arrLife)) return clamp(arrLife, 0, 1);
    return 1.0;
  }

  _readWheelRotPhase(car, distGame, mPerGameM) {
    if (Number.isFinite(car?.wheelSpinRad) && car.wheelSpinRad > 0) {
      return car.wheelSpinRad / (Math.PI * 2);
    }
    return (distGame * mPerGameM) / 2.073;
  }

  _readFlatSpotInfo(car) {
    const out = this._flatSpotScratch;
    const arr = car?.tireFlatSpot;
    let fl = 0;
    let fr = 0;
    let rl = 0;
    let rr = 0;
    if (Array.isArray(arr) && arr.length >= 2) {
      fl = clamp(arr[0] || 0, 0, 1);
      fr = clamp(arr[1] || 0, 0, 1);
      rl = clamp(arr[2] || 0, 0, 1);
      rr = clamp(arr[3] || 0, 0, 1);
    } else if (Number.isFinite(car?.flatSpot) && car.flatSpot > 0) {
      fl = clamp(car?.tires?.FL?.flatSpot ?? car.flatSpot, 0, 1);
      fr = clamp(car?.tires?.FR?.flatSpot ?? car.flatSpot, 0, 1);
      rl = clamp(car?.tires?.RL?.flatSpot || 0, 0, 1);
      rr = clamp(car?.tires?.RR?.flatSpot || 0, 0, 1);
    } else {
      fl = clamp(car?.tires?.FL?.flatSpot || 0, 0, 1);
      fr = clamp(car?.tires?.FR?.flatSpot || 0, 0, 1);
      rl = clamp(car?.tires?.RL?.flatSpot || 0, 0, 1);
      rr = clamp(car?.tires?.RR?.flatSpot || 0, 0, 1);
    }
    out.fl = fl;
    out.fr = fr;
    out.rl = rl;
    out.rr = rr;
    out.maxFlat = Math.max(fl, fr, rl, rr);
    return out;
  }

  _computeWheelFreqShudder(maxFlat, speedKmh, nowSec, car = null) {
    if (maxFlat <= 0.16 || speedKmh <= 80) return 0;
    // Physical wheel rotation frequency f = v / (2*pi*R_w), capped at 18 Hz Nyquist
    const rawHz = Number.isFinite(car?.wheelFreqHz) && car.wheelFreqHz > 0.1
      ? car.wheelFreqHz
      : (speedKmh / 3.6) / 2.073;
    const freqHz = Math.min(18.0, rawHz);
    const wave = Math.sin(nowSec * freqHz * Math.PI * 2);
    const thresh = maxFlat > 0.45 ? 0.22 : 0.42;
    return wave > thresh ? 1 : (wave < -thresh ? -1 : 0);
  }

  _readFrontLockupSide(car) {
    if (!car) return 0;
    const spd = car.speedKmh || 0;
    if (spd < 42) return 0;
    const flLockObj = !!car.tires?.FL?.locking;
    const frLockObj = !!car.tires?.FR?.locking;
    if (flLockObj && frLockObj) return 2;
    if (flLockObj) return -1;
    if (frLockObj) return 1;
    if (car.lockupCorner === 'BOTH') return 2;
    if (car.lockupCorner === 'FL') return -1;
    if (car.lockupCorner === 'FR') return 1;

    const explicitLock = !!(car.isLockingBrakes || (car.aiLockupPuffTimer || 0) > 0);
    const flSlip = car.tires?.FL?.slipRatio ?? 0;
    const frSlip = car.tires?.FR?.slipRatio ?? 0;
    const heavyBrakeLock =
      (car.brakeInput || 0) > 0.76 &&
      (flSlip < -0.18 || frSlip < -0.18 || (car.skidIntensity || 0) > 0.44);

    if (!explicitLock && !heavyBrakeLock) return 0;
    const steer = car.steerInput || 0;
    if (steer < -0.06 || flSlip < frSlip - 0.04) return -1; // Inside-left front lockup
    if (steer > 0.06 || frSlip < flSlip - 0.04) return 1;   // Inside-right front lockup
    return 2; // Both front wheels locking!
  }

  _readDamageProfile(car) {
    const out = this._dmgScratch;
    const dmg = car?.damage;
    if (!dmg) {
      out.fw = 0;
      out.fwLeftOut = false;
      out.fwRightOut = false;
      out.rw = 0;
      out.rwAskew = false;
      out.susp = 0;
      out.suspSide = 1;
      return out;
    }
    const fw = clamp(dmg.frontWing || 0, 0, 1);
    const rw = clamp(dmg.rearWing || 0, 0, 1);
    const susp = clamp(dmg.suspension || 0, 0, 1);
    const fwL = Number.isFinite(dmg.frontWingLeft) ? dmg.frontWingLeft : (dmg.frontWingSide > 0 ? fw * 0.35 : fw);
    const fwR = Number.isFinite(dmg.frontWingRight) ? dmg.frontWingRight : (dmg.frontWingSide < 0 ? fw * 0.35 : fw);
    const cornerLeft = dmg.damagedCorner === 'FL' || dmg.damagedCorner === 'RL' || (dmg.suspensionBias ?? 1) < 0;
    out.fw = fw;
    out.fwLeftOut = fwL > 0.25 || (fw > 0.28 && cornerLeft && !Number.isFinite(dmg.frontWingLeft));
    out.fwRightOut = fwR > 0.25 || (fw > 0.28 && !cornerLeft && !Number.isFinite(dmg.frontWingRight));
    out.rw = rw;
    out.rwAskew = rw > 0.28;
    out.susp = susp;
    out.suspSide = cornerLeft ? -1 : 1;
    return out;
  }

  _readFuelProfile(car) {
    const out = this._fuelScratch;
    if (!car) {
      out.frac = 1.0;
      out.lowFuel = false;
      out.fuelKg = 42.0;
      return out;
    }
    if (Number.isFinite(car.fuelLaps)) {
      const laps = Math.max(0, car.fuelLaps);
      const maxLaps = Math.max(1.0, Number.isFinite(car.maxFuelLaps) ? car.maxFuelLaps : 15.0);
      const frac = clamp(laps / maxLaps, 0, 1);
      const kg = Number.isFinite(car.fuelKg) ? Math.max(0, car.fuelKg) : laps * 1.85;
      out.frac = frac;
      out.lowFuel = laps < 1.5 || kg < 3.2 || frac < 0.12;
      out.fuelKg = kg;
      return out;
    }
    if (Number.isFinite(car.fuelKg)) {
      const maxKg = Number.isFinite(car.maxFuelKg) && car.maxFuelKg > 1 ? car.maxFuelKg : 92.0;
      const frac = clamp(car.fuelKg / maxKg, 0, 1);
      out.frac = frac;
      out.lowFuel = car.fuelKg < 4.5 || frac < 0.13;
      out.fuelKg = Math.max(0, car.fuelKg);
      return out;
    }
    out.frac = 0.5;
    out.lowFuel = false;
    out.fuelKg = 30.0;
    return out;
  }

  // ==========================================================================
  // MAIN 60FPS ARCADE RASTER-SCANLINE & SPRITE FRAME RENDERER
  // ==========================================================================

  render(params = {}) {
    return this.renderFrame(params);
  }

  renderFrame(params = {}) {
    if (!this.ctx) return;

    const {
      track = null,
      playerCar = null,
      allCars = [],
      weather = null,
      state = GAME_STATES.RACING,
      score = 0,
      topScore = 25000,
      timerSec = CLASSIC_1982_RULES.initialRaceTimer,
      sessionLabel = '',
      currentLap,
      totalLaps = 4,
      playerPos,
      totalCars,
      gantryLightsLit,
      gantryGreen,
      centerCallout = '',
      arcadeBanner = null,
      elapsedSec,
      crtScanlines = true,
      cameraIndex,
      cameraModeIdx,
      pitServiceSubPhase = '',
      sectorDeltaPopup = null,
      crowdExcitement,
      raceSystems = null,
      lookApexNormalized = 0,
    } = params;

    const nowSec = Number.isFinite(elapsedSec) ? elapsedSec : performance.now() * 0.001;
    const rawDt = clamp(nowSec - this._lastElapsedSec, 0.001, 0.1);
    this._lastElapsedSec = nowSec;

    // Support all 5 camera indices (0..4)!
    const rawCamVal = Number.isFinite(cameraIndex)
      ? cameraIndex
      : (Number.isFinite(cameraModeIdx) ? cameraModeIdx : (params.state?.cameraIndex ?? 0));
    const camIdx = clamp(Math.round(rawCamVal), 0, 4);
    const camRig = CAMERA_RIGS_1982[camIdx] || CAMERA_RIGS_1982[0];

    if (camIdx !== this._lastCamIdx) {
      this._lastCamIdx = camIdx;
      this._camBannerTimer = 1.85;
    } else if (this._camBannerTimer > 0) {
      this._camBannerTimer = Math.max(0, this._camBannerTimer - rawDt);
    }
    if (this._visorWipeTimer > 0) {
      this._visorWipeTimer = Math.max(0, this._visorWipeTimer - rawDt);
    }

    const host = this.canvas?.parentElement;
    const liveW = host ? host.clientWidth : 0;
    const liveH = host ? host.clientHeight : 0;
    if (
      liveW > 0 &&
      liveH > 0 &&
      (Math.abs(liveW - this._lastHostW) > 1 || Math.abs(liveH - this._lastHostH) > 1)
    ) {
      this.resize(liveW, liveH);
    }

    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    const W = this.bufW;
    const H = this.bufH;

    // Safe Player Vehicle State
    const pSRaw = wrapS(playerCar?.s ?? 0);
    const pLat = Number.isFinite(playerCar?.lateralOffset) ? playerCar.lateralOffset : 0;
    const pSpeed = Math.max(0, Number.isFinite(playerCar?.speedKmh) ? playerCar.speedKmh : 0);
    const pYaw = Number.isFinite(playerCar?.relYaw) ? playerCar.relYaw : 0;
    const pSteer = Number.isFinite(playerCar?.steerInput) ? playerCar.steerInput : 0;
    const pDistGame = Number.isFinite(playerCar?.totalDistanceGameM) ? playerCar.totalDistanceGameM : pSRaw;
    const pExploded = !!playerCar?.exploded;

    if (pExploded) {
      if (Number.isFinite(playerCar?.explodeTimer) && playerCar.explodeTimer > 0) {
        this._playerBlastSec = clamp(2.1 - playerCar.explodeTimer, 0, 2.1);
      } else {
        this._playerBlastSec = Math.min(2.1, this._playerBlastSec + rawDt);
      }
    } else {
      this._playerBlastSec = 0;
    }

    const mPerGameM =
      track && Number.isFinite(track.realMetersPerGameMeter) && track.realMetersPerGameMeter > 0.5
        ? track.realMetersPerGameMeter
        : REAL_METERS_PER_GAME_METER;

    this._ensureTrackCache(track, mPerGameM);

    // Camera longitudinal origin along spline
    const camS = wrapS(pSRaw + camRig.camForwardM / mPerGameM);

    // 1. Sample C1 Cubic Spline Elevation, Slope & Continuous Unwrapped Heading
    this._evalTrackCubicPose(track, camS);
    const hereElev = this._poseElev;
    const hereYaw = this._poseYaw;
    const sinSlope0 = clamp(this._poseSlope, -0.35, 0.35);

    const totalYaw = hereYaw - pYaw * 0.62;
    if (!this._hasPrevYaw) {
      this._unwrappedYaw = totalYaw;
      this._smoothCamYawRad = totalYaw;
      this._prevRawYaw = totalYaw;
      this._hasPrevYaw = true;
    } else {
      let dYaw = totalYaw - this._prevRawYaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      this._unwrappedYaw += dYaw;
      this._prevRawYaw = totalYaw;
      const yawAlpha = 1.0 - Math.exp(-22.0 * rawDt);
      this._smoothCamYawRad += (this._unwrappedYaw - this._smoothCamYawRad) * yawAlpha;
    }

    // Critically damped pitch, slip-yaw, apex-look & roll stabilizers (zero 1px horizon chatter!)
    const chassisPitch = Number.isFinite(playerCar?.chassisPitchRad) ? playerCar.chassisPitchRad : 0;
    const chassisRoll = Number.isFinite(playerCar?.chassisRollRad) ? playerCar.chassisRollRad : 0;
    const apexTarget = Number.isFinite(lookApexNormalized) ? lookApexNormalized : (playerCar?.lookApexNormalized || 0);
    const pitchTargetPx = clamp(-sinSlope0 * 52.0 + clamp(chassisPitch * 135.0, -6.5, 6.5) + camRig.horizonDeltaPx, -16, 16);
    const rollTargetPx = camIdx >= 1 ? clamp(chassisRoll * 145.0, -6.5, 6.5) : 0;

    if (!this._hasSmoothInit) {
      this._smoothPitchPx = pitchTargetPx;
      this._smoothSlipYaw = pYaw;
      this._smoothApexPan = apexTarget;
      this._smoothRollPanPx = rollTargetPx;
      this._hasSmoothInit = true;
    } else {
      const pitchAlpha = 1.0 - Math.exp(-rawDt / 0.055);
      const slipAlpha = 1.0 - Math.exp(-9.0 * rawDt);
      const apexAlpha = 1.0 - Math.exp(-10.5 * rawDt);
      const rollAlpha = 1.0 - Math.exp(-14.0 * rawDt);
      this._smoothPitchPx += (pitchTargetPx - this._smoothPitchPx) * pitchAlpha;
      this._smoothSlipYaw += (pYaw - this._smoothSlipYaw) * slipAlpha;
      this._smoothApexPan += (apexTarget - this._smoothApexPan) * apexAlpha;
      this._smoothRollPanPx += (rollTargetPx - this._smoothRollPanPx) * rollAlpha;
    }

    const blastShakeY =
      pExploded && this._playerBlastSec < 0.55
        ? (((nowSec * 60) | 0) % 2 === 0 ? -2 : 2)
        : 0;

    const isPortrait = H > 275;
    const baseHorizon = isPortrait ? Math.round(H * 0.36) : 118;
    const minHoriz = isPortrait ? Math.round(H * 0.28) : 94;
    const maxHoriz = isPortrait ? Math.round(H * 0.44) : 138;
    const horizonFloat = clamp(baseHorizon + this._smoothPitchPx + blastShakeY, minHoriz, maxHoriz);
    const horizonY = Math.floor(horizonFloat);
    const horizonFrac = horizonFloat - horizonY;

    // Overtake Passing Bonus & Lap-Time Banner Tracking
    const resolvedPosEarly = this._resolvePlayerPosition(playerPos, playerCar, allCars);
    if (state === GAME_STATES.RACING && this._prevPlayerPos > 0 && resolvedPosEarly < this._prevPlayerPos) {
      this._passingBonusTimer = 2.1;
      this._crowdExcitement = 1.0;
    }
    this._prevPlayerPos = resolvedPosEarly;
    if (this._passingBonusTimer > 0) {
      this._passingBonusTimer = Math.max(0, this._passingBonusTimer - rawDt);
    }

    const resolvedLapNow = Number.isFinite(currentLap) && currentLap > 0 ? currentLap : (playerCar?.lap || 1);
    if (state === GAME_STATES.RACING && resolvedLapNow > this._prevLapNum) {
      const lastLap = playerCar?.lastLapTime;
      if (Number.isFinite(lastLap) && lastLap > 8.0) {
        this._lapCompleteBest = lastLap <= this._bestLapSeen + 0.001;
        if (lastLap < this._bestLapSeen) this._bestLapSeen = lastLap;
        this._lapCompleteBanner = `LAP TIME ${this._formatArcadeLapTime(lastLap)}`;
        this._lapCompleteTimer = 2.4;
      }
      this._prevLapNum = resolvedLapNow;
    } else if (state !== GAME_STATES.RACING) {
      this._prevLapNum = resolvedLapNow;
    }
    if (this._lapCompleteTimer > 0) {
      this._lapCompleteTimer = Math.max(0, this._lapCompleteTimer - rawDt);
    }

    if (Number.isFinite(crowdExcitement) && crowdExcitement > this._crowdExcitement) {
      this._crowdExcitement = clamp(crowdExcitement, 0, 1);
    } else if (pSpeed > 295 || playerCar?.drsActive) {
      this._crowdExcitement = Math.max(this._crowdExcitement, 0.55);
    } else {
      this._crowdExcitement = Math.max(0, this._crowdExcitement - rawDt * 0.35);
    }

    // Autonomous Sector Split Deltas (S1/S2/S3)
    const curSectorIdx = pSRaw < 333.3 ? 0 : (pSRaw < 666.6 ? 1 : 2);
    if (state === GAME_STATES.RACING || state === GAME_STATES.QUALIFYING) {
      if (curSectorIdx !== this._prevSectorIdx) {
        const expectedPrev = (curSectorIdx + 2) % 3;
        const splitDur = nowSec - this._sectorStartSec;
        if (curSectorIdx === (this._prevSectorIdx + 1) % 3 && splitDur > 3.0 && splitDur < 90.0) {
          const prevBest = this._bestSectorTimes[expectedPrev];
          if (prevBest === null) {
            this._bestSectorTimes[expectedPrev] = splitDur;
            this._autoSectorPopup = `S${expectedPrev + 1} ${splitDur.toFixed(2)}S`;
            this._autoSectorGreen = true;
          } else {
            const diff = splitDur - prevBest;
            if (splitDur < prevBest) this._bestSectorTimes[expectedPrev] = splitDur;
            const sign = diff <= 0 ? '' : '+';
            this._autoSectorPopup = `S${expectedPrev + 1} ${sign}${diff.toFixed(2)}S`;
            this._autoSectorGreen = diff <= 0.001;
          }
          this._autoSectorTimer = 2.5;
        }
        this._prevSectorIdx = curSectorIdx;
        this._sectorStartSec = nowSec;
      }
    } else {
      this._prevSectorIdx = curSectorIdx;
      this._sectorStartSec = nowSec;
    }
    if (this._autoSectorTimer > 0) {
      this._autoSectorTimer = Math.max(0, this._autoSectorTimer - rawDt);
    }

    // 2. Determine Sky / Weather / Wetness State
    const trackId = track?.trackId || track?.trackDef?.id || 'FUJI_1982';
    const trackTheme = track?.trackDef?.theme || 'FUJI';
    const forceNight = !!track?.trackDef?.forceNight || trackId === 'VEGAS_NEON' || !!weather?.isNightActive || weather?.currentRegimeId === 'NEON_NIGHT';
    const regimeId = forceNight ? 'NEON_NIGHT' : (weather?.currentRegimeId || 'HOT_SUNNY');
    const rawWetness = Math.max(
      Number(weather?.wetness || 0),
      Number(weather?.grooveMoisture || 0),
      regimeId === 'MONSOON_STORM' ? 0.78 : (regimeId === 'LIGHT_DRIZZLE' ? 0.36 : 0)
    );
    const wetness = clamp(rawWetness, 0, 1);
    const isRainy = regimeId === 'LIGHT_DRIZZLE' || regimeId === 'MONSOON_STORM' || wetness > 0.25;
    const isSunset = regimeId === 'GOLDEN_SUNSET' || (!forceNight && !isRainy && trackId === 'MONZA_TEMPLE' && weather?.currentRegimeId === 'GOLDEN_SUNSET');
    const isOvercast = regimeId === 'OVERCAST_COOL' || (!forceNight && !isRainy && trackId === 'SILVERSTONE_GP');

    // 3. Render Seamless 1024px = 2*PI Sky, Clouds, Mount Fuji & Landmarks
    const showBlimp = state === GAME_STATES.GRID_LINEUP || state === GAME_STATES.QUALIFYING || (state === GAME_STATES.RACING && resolvedLapNow === 1 && pSRaw < 170);
    this._renderSkyAndHorizon(W, Math.min(H, horizonY + 24), horizonY, {
      trackId,
      trackTheme,
      forceNight,
      isSunset,
      isRainy,
      isOvercast,
      showBlimp,
      lightningFlash: weather?.lightningFlash || 0,
      nowSec,
    });

    // 4. Integrate World Curvature & Hill Elevation Forward via 2nd-Order Trapezoidal Rule (160 x 1.25m = 200m!)
    let prevK = smoothCurvatureSoftKnee(this._readUnclampedCurvatureRadM(track, camS, mPerGameM)) * 1.10;
    let heading = 0.0;
    let latM = 0.0;
    this._worldCurveM[0] = 0.0;
    this._worldElevM[0] = 0.0;
    this._worldCurvK[0] = prevK;

    for (let k = 1; k <= WORLD_STEPS; k++) {
      const dReal = k * WORLD_STEP_M;
      const sSample = camS + dReal / mPerGameM;
      const curK = smoothCurvatureSoftKnee(this._readUnclampedCurvatureRadM(track, sSample, mPerGameM)) * 1.10;

      // Exact 2nd-order trapezoidal curvature -> heading -> lateral offset integration!
      const nextHeading = heading + 0.5 * (prevK + curK) * WORLD_STEP_M;
      latM += 0.5 * (heading + nextHeading) * WORLD_STEP_M;
      heading = nextHeading;
      prevK = curK;

      this._worldCurveM[k] = latM;
      this._worldCurvK[k] = curK;

      this._evalTrackCubicPose(track, sSample);
      this._worldElevM[k] = (this._poseElev - hereElev) - dReal * sinSlope0;
    }

    // 5. Pole Position II Front-to-Back Scanline Z-Buffer Road Renderer (Activates _worldElevM Crests & Dips!)
    // Fix Portrait apron bug: in Portrait (H > 275), road stops cleanly at drawBottomY (B), filling B..H with CRT bezel!
    const drawBottomY = isPortrait ? Math.round(H * 0.75) : H;
    const roadSpanRows = Math.max(16, (drawBottomY - 1) - horizonFloat);
    const baseRoadHalfPx = Math.round(
      (isPortrait ? W * 0.46 : clamp(W * 0.42, 76, 212)) * camRig.roadZoom
    );

    const invZNear = 1.0 / (camRig.nearDistM + camRig.zCamBackM);
    const invZFar = 1.0 / (FAR_DIST_M + camRig.zCamBackM);
    const zNearNumer = camRig.nearDistM + camRig.zCamBackM;

    const puddles = Array.isArray(track?.puddles) ? track.puddles : null;
    const puddlesActive = !!(
      wetness > 0.22 ||
      (puddles && puddles.length > 0 && (puddles[0].forceActive1982 || puddles[0].mesh?.visible))
    );
    const tunnelRange = track?.trackDef?.tunnelRangeS || null;
    const isMonza = trackTheme === 'MONZA';

    // Blend dry Namco asphalt (#686868 / #5e5e5e) -> wet mirror-slate (#2b3344 / #242b3a) once per frame
    const asphLightHex = wetness > 0.03 ? lerpRgbHex(0x68, 0x68, 0x68, 0x2b, 0x33, 0x44, wetness) : '#686868';
    const asphDarkHex = wetness > 0.03 ? lerpRgbHex(0x5e, 0x5e, 0x5e, 0x24, 0x2b, 0x3a, wetness) : '#5e5e5e';
    const grooveLightHex = wetness > 0.03 ? lerpRgbHex(0x55, 0x57, 0x60, 0x36, 0x46, 0x5e, wetness) : '#555760';
    const grooveDarkHex = wetness > 0.03 ? lerpRgbHex(0x4d, 0x4f, 0x58, 0x2e, 0x3c, 0x52, wetness) : '#4d4f58';

    const playerWorldMeters = pDistGame * mPerGameM + camRig.camForwardM;
    const dampedVanishShiftPx =
      -(this._smoothSlipYaw + this._smoothApexPan * 0.16) * (W * 0.22) + this._smoothRollPanPx;

    let minRenderedY = drawBottomY;
    const minAllowRoadY = isPortrait ? 32 : 28;
    const depthSamples = Math.max(180, Math.round(roadSpanRows * 1.45));

    // Initialize scanline depth buffer above road to Infinity so sprite hill-occlusion knows sky rows
    for (let ry = 0; ry < H; ry++) {
      this._lineDistM[ry] = 9999.0;
    }

    for (let sIdx = 0; sIdx <= depthSamples; sIdx++) {
      const u = sIdx / depthSamples; // 0.0 at bottom near plane -> 1.0 at far horizon
      const v = 1.0 - u;
      const invZ = invZFar + v * (invZNear - invZFar);
      const distReal = Math.max(0.30, (1.0 / invZ) - camRig.zCamBackM);
      const scale = zNearNumer * invZ;

      const fStep = clamp(distReal / WORLD_STEP_M, 0, WORLD_STEPS - 0.001);
      const idx0 = fStep | 0;
      const idx1 = Math.min(WORLD_STEPS, idx0 + 1);
      const frac = fStep - idx0;

      const worldCurveX = this._worldCurveM[idx0] + (this._worldCurveM[idx1] - this._worldCurveM[idx0]) * frac;
      const elevRelM = this._worldElevM[idx0] + (this._worldElevM[idx1] - this._worldElevM[idx0]) * frac;
      const localCurvK = this._worldCurvK[idx0] + (this._worldCurvK[idx1] - this._worldCurvK[idx0]) * frac;

      const roadHalfPx = Math.max(2.0, baseRoadHalfPx * scale);
      const pxPerMeter = roadHalfPx / ROAD_HALF_WIDTH;

      // Project vertical row including real spline hill elevation!
      const hillLiftPx = clamp(elevRelM * pxPerMeter * 0.90, -38.0, 44.0);
      const yProj = horizonFloat + v * roadSpanRows - hillLiftPx;
      const yTop = clamp(Math.floor(yProj), minAllowRoadY, minRenderedY);
      if (yTop >= minRenderedY) continue;

      const vanishAtten = Math.pow(Math.max(0, 1.0 - v), 1.55);
      const playerShiftPx = -(pLat / ROAD_HALF_WIDTH) * roadHalfPx;
      const curveShiftPx = worldCurveX * pxPerMeter;
      const centerX = W * 0.5 + playerShiftPx + curveShiftPx + dampedVanishShiftPx * vanishAtten;

      // Lock integer half-width FIRST before centering -> eliminates +-1px road-width chatter!
      const halfWInt = Math.max(2, Math.round(roadHalfPx));
      const roadCenterInt = Math.floor(centerX);
      const subFrac = centerX - roadCenterInt;
      const roadL = roadCenterInt - halfWInt;
      const roadR = roadCenterInt + halfWInt;
      const roadW = halfWInt * 2;
      const curbPx = Math.max(1, Math.round((CURB_WIDTH * 1.12) * pxPerMeter));

      const dGame = distReal / mPerGameM;
      const lineS = wrapS(camS + dGame);
      const absWorldM = playerWorldMeters + distReal;

      // Single crisp world-space cadences (NO beating dual dash OR!)
      const grassBand = (Math.floor(absWorldM / 6.0) & 1) === 0;
      const curbBand = (Math.floor(absWorldM / 3.0) & 1) === 0;
      const dashCycleM = ((absWorldM % 12.0) + 12.0) % 12.0;
      const dashBand = v > 0.042 && dashCycleM < 5.0;

      const inTunnel = tunnelRange && lineS >= tunnelRange[0] && lineS <= tunnelRange[1];

      for (let y = minRenderedY - 1; y >= yTop; y--) {
        this._lineDistM[y] = distReal;
        this._lineScale[y] = scale;
        this._lineCenterX[y] = centerX;
        this._lineRoadHalfPx[y] = roadHalfPx;

        // A. Full-width Vibrant Mowed Emerald Stadium Turf / Verge / Tunnel Scanline
        if (inTunnel) {
          ctx.fillStyle = grassBand ? '#242838' : '#1c202c';
        } else if (forceNight || trackId === 'VEGAS_NEON') {
          ctx.fillStyle = grassBand ? '#0e9c32' : '#088026';
        } else {
          ctx.fillStyle = grassBand ? '#28cf47' : '#1eb83a';
        }
        ctx.fillRect(0, y, W, 1);

        // A2. Packed Multi-Colored Jumping Grandstands (Mexican Wave, Fan Banners, Waving Flags & Camera Flashes!)
        const hasLeftGrandstand =
          !inTunnel &&
          ((lineS >= 885 || lineS <= 215) ||
            (lineS >= 310 && lineS <= 395) ||
            (lineS >= 565 && lineS <= 685));
        const hasRightGrandstand =
          !inTunnel &&
          ((lineS >= 210 && lineS <= 305) ||
            (lineS >= 365 && lineS <= 485) ||
            (lineS >= 710 && lineS <= 825));
        if ((hasLeftGrandstand || hasRightGrandstand) && scale > 0.055) {
          const crowdTick = ((nowSec * 9) | 0) + (y >> 1);
          const crowdCols = isMonza
            ? ['#ff1828', '#ff1828', '#fcfcfc', '#00d858', '#ffd800', '#ff8000']
            : ['#ff1828', '#ff8000', '#00f5d0', '#ffd800', '#ff48b0', '#fcfcfc', '#00e868'];
          const stepDot = Math.max(2, Math.round(1.25 * pxPerMeter));
          const waveJump = Math.sin(absWorldM * 0.14 - nowSec * 6.5) > 0.25 ? 1 : 0;
          const flagBand = (Math.floor(absWorldM / 5.0) & 3) === 0;
          const bannerColors = ['#ff1828', '#ffd800', '#00f5d0', '#ff8000'];
          const bannerHex = bannerColors[Math.floor(absWorldM / 8.0) % bannerColors.length];

          if (hasLeftGrandstand) {
            const standInL = roadCenterInt - Math.round((ROAD_HALF_WIDTH + 4.4) * pxPerMeter);
            const standOutL = Math.max(0, roadCenterInt - Math.round((ROAD_HALF_WIDTH + 14.4) * pxPerMeter));
            if (standInL > standOutL + 2) {
              ctx.fillStyle = grassBand ? '#2c3850' : '#1e283a';
              ctx.fillRect(standOutL, y, standInL - standOutL, 1);
              // Front fan-club cheer banner rail
              const railW = Math.max(1, Math.round(0.65 * pxPerMeter));
              ctx.fillStyle = curbBand ? bannerHex : '#fcfcfc';
              ctx.fillRect(standInL - railW, y, railW, 1);
              // Packed jumping fan-club color blocks
              const fanY = Math.max(minAllowRoadY, y - waveJump);
              let colIdx = 0;
              for (let cx = standOutL + 1; cx < standInL - railW; cx += stepDot, colIdx++) {
                ctx.fillStyle = crowdCols[(colIdx + crowdTick) % crowdCols.length];
                ctx.fillRect(cx, fanY, Math.max(1, stepDot - 1), 1 + waveJump);
              }
              // Waving team & checkered flags above top bleacher tier
              if (flagBand && scale > 0.11 && y > minAllowRoadY + 3) {
                const flagX = standOutL + ((crowdTick * 3) % Math.max(3, standInL - standOutL - 3));
                ctx.fillStyle = ((crowdTick & 1) === 0) ? '#fcfcfc' : '#ff1828';
                ctx.fillRect(flagX, y - 3, 3, 2);
              }
              // Sparkling white camera flash pops
              if (((standInL * 13 + ((nowSec * 16) | 0) + y * 7) % 47) === 0) {
                const flashX = standOutL + ((y * 19) % Math.max(2, standInL - standOutL - 2));
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(flashX, Math.max(minAllowRoadY, y - 1), 2, 2);
              }
            }
          }
          if (hasRightGrandstand) {
            const standInR = roadCenterInt + Math.round((ROAD_HALF_WIDTH + 4.4) * pxPerMeter);
            const standOutR = Math.min(W, roadCenterInt + Math.round((ROAD_HALF_WIDTH + 14.4) * pxPerMeter));
            if (standOutR > standInR + 2) {
              ctx.fillStyle = grassBand ? '#2c3850' : '#1e283a';
              ctx.fillRect(standInR, y, standOutR - standInR, 1);
              const railW = Math.max(1, Math.round(0.65 * pxPerMeter));
              ctx.fillStyle = curbBand ? bannerHex : '#fcfcfc';
              ctx.fillRect(standInR, y, railW, 1);
              const fanY = Math.max(minAllowRoadY, y - waveJump);
              let colIdx = 0;
              for (let cx = standInR + railW + 1; cx < standOutR - 1; cx += stepDot, colIdx++) {
                ctx.fillStyle = crowdCols[(colIdx + crowdTick + 2) % crowdCols.length];
                ctx.fillRect(cx, fanY, Math.max(1, stepDot - 1), 1 + waveJump);
              }
              if (flagBand && scale > 0.11 && y > minAllowRoadY + 3) {
                const flagX = standInR + ((crowdTick * 5) % Math.max(3, standOutR - standInR - 3));
                ctx.fillStyle = ((crowdTick & 1) === 0) ? '#ffd800' : '#00f5d0';
                ctx.fillRect(flagX, y - 3, 3, 2);
              }
              if (((standInR * 11 + ((nowSec * 16) | 0) + y * 5) % 49) === 0) {
                const flashX = standInR + ((y * 23) % Math.max(2, standOutR - standInR - 2));
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(flashX, Math.max(minAllowRoadY, y - 1), 2, 2);
              }
            }
          }
        }

        // B. Pit Lane Shoulder Merge, Pit-Box Pad & Pit Wall on Right (s >= 905 || s <= 180)
        if (lineS >= 895 || lineS <= 180) {
          // Dashed white pit-entry commitment line ahead of split (s in 895..914)
          if (lineS >= 895 && lineS < 914 && dashBand) {
            const commitX = roadR - Math.max(2, Math.round(1.8 * pxPerMeter));
            ctx.fillStyle = '#00fc58';
            ctx.fillRect(commitX, y, Math.max(1, Math.round(0.32 * pxPerMeter)), 1);
          }
          const pitOffM = this._readPitOffsetAt(track, lineS <= 110 || lineS >= 912 ? lineS : 108);
          if (pitOffM > 0 && (lineS >= 912 || lineS <= 110)) {
            const pitCenterPx = roadCenterInt + Math.round(pitOffM * pxPerMeter);
            const pitHalfInt = Math.max(2, Math.round(4.6 * pxPerMeter));
            const pitL = Math.min(roadR, pitCenterPx - pitHalfInt);
            const pitR = pitCenterPx + pitHalfInt;
            if (pitR > pitL) {
              ctx.fillStyle = grassBand ? '#546074' : '#4a5466';
              ctx.fillRect(pitL, y, pitR - pitL, 1);
              const linePx = Math.max(1, Math.round(0.28 * pxPerMeter));
              ctx.fillStyle = curbBand ? '#fce400' : '#fcfcfc';
              ctx.fillRect(pitR - linePx, y, linePx, 1);
              if (Math.abs(lineS - PIT_LANE_CONFIG.speedLimitLineS) < 0.45) {
                ctx.fillStyle = '#fce400';
                ctx.fillRect(pitL, y, pitR - pitL, 1);
              }
              if (Math.abs(lineS - PIT_LANE_CONFIG.playerBoxS) < 1.35) {
                ctx.fillStyle = curbBand ? '#00fc58' : '#fce400';
                ctx.fillRect(pitCenterPx, y, Math.max(1, pitR - pitCenterPx - 1), 1);
              } else if (Math.abs(lineS - 35) < 1.1 || Math.abs(lineS - 50) < 1.1) {
                ctx.fillStyle = '#fc2818';
                ctx.fillRect(pitCenterPx, y, Math.max(1, pitR - pitCenterPx - 1), 1);
              }
            }
            if (lineS >= 948 || lineS <= 76) {
              const wallX = roadCenterInt + Math.round((ROAD_HALF_WIDTH + 1.65) * pxPerMeter);
              const wallW = Math.max(1, Math.round(0.75 * pxPerMeter));
              const signPulse = (Math.floor(absWorldM / 9.0) % 3) === 0;
              ctx.fillStyle = signPulse ? '#fce400' : (curbBand ? '#d8e0ec' : '#1858f8');
              ctx.fillRect(wallX, y, wallW, 1);
            }
          }
        }

        // C. Circuit-Colored FIA Runoff Shoulder Stripes + Crisp 1982 Namco Rumble Kerbs
        const hasRightCurb = !(lineS >= 912 && lineS <= 948) && !(lineS >= 68 && lineS <= 112);
        const runoffPx = Math.max(1, Math.round((CURB_WIDTH * 1.75) * pxPerMeter));
        if (runoffPx >= 1 && !inTunnel) {
          const runTri = Math.floor(absWorldM / 4.5) % 3;
          let runoffHex;
          if (isMonza || trackId === 'MONZA_TEMPLE') {
            runoffHex = runTri === 0 ? '#00a848' : (runTri === 1 ? '#fcfcfc' : '#e42018');
          } else if (trackId === 'MONACO_HARBOR') {
            runoffHex = runTri === 0 ? '#e41820' : (runTri === 1 ? '#fce400' : '#fcfcfc');
          } else if (trackId === 'SILVERSTONE_GP') {
            runoffHex = runTri === 0 ? '#1448d8' : (runTri === 1 ? '#fcfcfc' : '#e01824');
          } else if (trackId === 'SUZUKA_130R') {
            runoffHex = runTri === 0 ? '#e41828' : (runTri === 1 ? '#fcfcfc' : '#ff88b8');
          } else if (trackId === 'VEGAS_NEON') {
            runoffHex = runTri === 0 ? '#ff28b8' : (runTri === 1 ? '#00f4ff' : '#fce400');
          } else {
            runoffHex = runTri === 0 ? '#1878fc' : (runTri === 1 ? '#fcfcfc' : '#ff2838');
          }
          ctx.fillStyle = runoffHex;
          ctx.fillRect(roadL - curbPx - runoffPx, y, runoffPx, 1);
          if (hasRightCurb) {
            ctx.fillRect(roadR + curbPx, y, runoffPx, 1);
          }
        }

        let curbHex;
        if (isMonza) {
          const tri = Math.floor(absWorldM / 2.5) % 3;
          curbHex = tri === 0 ? '#00a848' : (tri === 1 ? '#fcfcfc' : '#d82800');
        } else {
          curbHex = curbBand ? '#d82800' : '#fcfcfc';
        }
        ctx.fillStyle = curbHex;
        ctx.fillRect(roadL - curbPx, y, curbPx, 1);
        if (hasRightCurb) {
          ctx.fillRect(roadR, y, curbPx, 1);
        }
        if (subFrac < 0.35 && roadL - curbPx - 1 >= 0) {
          ctx.fillStyle = 'rgba(220, 228, 240, 0.35)';
          ctx.fillRect(roadL - curbPx - 1, y, 1, 1);
        } else if (subFrac > 0.65 && hasRightCurb && roadR + curbPx < W) {
          ctx.fillStyle = 'rgba(220, 228, 240, 0.35)';
          ctx.fillRect(roadR + curbPx, y, 1, 1);
        }

        // D. Two-Tone 1982 Namco Asphalt + Apex-Following Rubbered Racing-Line Grooves!
        ctx.fillStyle = grassBand ? asphLightHex : asphDarkHex;
        ctx.fillRect(roadL, y, roadW, 1);

        if (roadW >= 22) {
          const grooveW = Math.max(2, Math.round(1.15 * pxPerMeter));
          // Shift rubbered grooves smoothly toward inside apex (-sign(k)) in turns!
          const apexBiasFrac = clamp(localCurvK * 38.0, -0.52, 0.52);
          const gCenterInt = roadCenterInt + Math.round(apexBiasFrac * halfWInt);
          const gSpreadInt = Math.max(2, Math.round(halfWInt * 0.20));
          ctx.fillStyle = grassBand ? grooveLightHex : grooveDarkHex;
          ctx.fillRect(gCenterInt - gSpreadInt - (grooveW >> 1), y, grooveW, 1);
          ctx.fillRect(gCenterInt + gSpreadInt - (grooveW >> 1), y, grooveW, 1);
        }

        // Wet Specular Standing-Water Sheen Bands (when wetness > 0.30)
        if (wetness > 0.30 && roadW >= 18) {
          const puddleWave = Math.sin(absWorldM * 0.085) * Math.cos(absWorldM * 0.031 + 1.2);
          if (puddleWave > 0.48) {
            const sheenW = Math.max(3, Math.round(halfWInt * 0.45));
            const sheenOff = Math.round(Math.sin(absWorldM * 0.04) * halfWInt * 0.35);
            ctx.fillStyle = (((y + ((nowSec * 14) | 0)) & 1) === 0) ? '#4a6488' : '#3a5070';
            ctx.fillRect(roadCenterInt + sheenOff - (sheenW >> 1), y, sheenW, 1);
          }
        }

        // Crisp white outer asphalt edge lines
        if (roadW >= 14) {
          const edgeW = Math.max(1, Math.round(0.24 * pxPerMeter));
          ctx.fillStyle = '#e8eef8';
          ctx.fillRect(roadL, y, edgeW, 1);
          ctx.fillRect(roadR - edgeW, y, edgeW, 1);
        }

        // E. Single Crisp 12.0m Period Namco Road Lane Dashes (5m dash / 7m gap, anti-aliased near horizon!)
        if (dashBand && roadW >= 10) {
          const dashW = Math.max(1, Math.round(0.28 * pxPerMeter));
          ctx.fillStyle = v < 0.10 ? '#aeb8cc' : '#fcfcfc';
          ctx.fillRect(roadCenterInt - (dashW >> 1), y, dashW, 1);
          if (roadW >= 34) {
            const laneOffInt = Math.round(halfWInt * 0.36);
            ctx.fillStyle = v < 0.10 ? '#9ca8bc' : '#dce8ff';
            ctx.fillRect(roadCenterInt - laneOffInt, y, dashW, 1);
            ctx.fillRect(roadCenterInt + laneOffInt - dashW, y, dashW, 1);
          }
        }

        // F. Checkered Start/Finish Line & Starting Grid Brackets
        if (lineS >= 999.15 || lineS <= 0.85) {
          const numChecks = 12;
          const cellW = roadW / numChecks;
          const rowParity = lineS < 0.85 ? 0 : 1;
          for (let c = 0; c < numChecks; c++) {
            const x0 = Math.round(roadL + c * cellW);
            const x1 = Math.round(roadL + (c + 1) * cellW);
            if (x1 > x0) {
              ctx.fillStyle = ((c + rowParity) & 1) === 0 ? '#fcfcfc' : '#101010';
              ctx.fillRect(x0, y, x1 - x0, 1);
            }
          }
        } else if (lineS >= 963.5 && lineS <= 997.3 && roadW >= 18) {
          const sBack = TRACK_GAME_LENGTH - lineS;
          const slotIdx = Math.round((sBack - 3.0) / 2.1);
          if (slotIdx >= 0 && slotIdx < 16) {
            const dsSlot = sBack - (3.2 + slotIdx * 2.1 - 0.55);
            if (dsSlot >= 0 && dsSlot <= 0.95) {
              const stallLatM = slotIdx % 2 === 0 ? -2.8 : 2.8;
              const stallCx = roadCenterInt + Math.round(stallLatM * pxPerMeter);
              const stallHalfW = Math.max(2, Math.round(1.15 * pxPerMeter));
              ctx.fillStyle = '#fcfcfc';
              if (dsSlot < 0.24) {
                ctx.fillRect(stallCx - stallHalfW, y, stallHalfW * 2, 1);
              } else {
                const lw = Math.max(1, Math.round(0.22 * pxPerMeter));
                ctx.fillRect(stallCx - stallHalfW, y, lw, 1);
                ctx.fillRect(stallCx + stallHalfW - lw, y, lw, 1);
              }
            }
          }
        }

        // G. Explicit Track Puddles
        if (puddlesActive && puddles) {
          for (let pIdx = 0; pIdx < puddles.length; pIdx++) {
            const pud = puddles[pIdx];
            const dsPudReal = Math.abs(signedDeltaS(lineS, pud.s)) * mPerGameM;
            const pRad = pud.radius || 3.0;
            if (dsPudReal <= pRad) {
              const spanFrac = Math.sqrt(Math.max(0, 1.0 - (dsPudReal / pRad) * (dsPudReal / pRad)));
              const pudHalfPx = Math.round(pRad * spanFrac * pxPerMeter);
              if (pudHalfPx >= 1) {
                const pudCx = roadCenterInt + Math.round((pud.lat || 0) * pxPerMeter);
                const px0 = Math.max(roadL, pudCx - pudHalfPx);
                const px1 = Math.min(roadR, pudCx + pudHalfPx);
                const pw = px1 - px0;
                if (pw > 0) {
                  const shimmerPhase = (y + ((nowSec * 14) | 0) + pIdx * 3) % 4;
                  ctx.fillStyle = shimmerPhase === 0 ? '#68b8ff' : (shimmerPhase === 2 ? '#3488fc' : '#1868fc');
                  ctx.fillRect(px0, y, pw, 1);
                }
              }
            }
          }
        }

        // H. Monaco Tunnel Sodium Lamp Ribs
        if (inTunnel && ((Math.floor(absWorldM / 12.0) % 2) === 0) && y < yTop + 18) {
          ctx.fillStyle = '#ffd258';
          const lampW = Math.max(2, Math.round(roadW * 0.25));
          ctx.fillRect(roadCenterInt - (lampW >> 1), y, lampW, 1);
        }
      }

      minRenderedY = yTop;
    }
    this._minRoadY = minRenderedY;

    // Subtle 1px fractional horizon haze blend along top road crest row so 1px pitch never snaps!
    if (minRenderedY >= minAllowRoadY && minRenderedY < drawBottomY && Math.abs(minRenderedY - horizonY) <= 1) {
      ctx.fillStyle = `rgba(140, 190, 255, ${(0.22 * (1.0 - horizonFrac)).toFixed(2)})`;
      ctx.fillRect(0, minRenderedY, W, 1);
    }

    // Fill Portrait Lower Touch-Control Apron cleanly with Dark CRT Bezel (Fixes stretched road apron!)
    if (isPortrait && drawBottomY < H) {
      ctx.fillStyle = '#070a12';
      ctx.fillRect(0, drawBottomY, W, H - drawBottomY);
    }

    // 6. Collect & Depth-Sort World Sprites (Gantry, 22 Namco Billboards, Corner Chevrons, PIT IN, Rivals)
    let spriteCount = 0;
    const pushSprite = (distReal, kind, img, worldLatM, widthMeters, yLiftPx = 0, lightsLit = 0, lightsGreen = false, blastProgress = 0, anchorCenter = false) => {
      if (spriteCount >= MAX_SPRITE_POOL || !img) return null;
      if (distReal <= 0.75 || distReal >= FAR_DIST_M - 4.0) return null;
      const slot = this._spritePool[spriteCount++];
      slot.distReal = distReal;
      slot.kind = kind;
      slot.img = img;
      slot.worldLatM = worldLatM;
      slot.widthMeters = widthMeters;
      slot.yLiftPx = yLiftPx;
      slot.lightsLit = lightsLit;
      slot.lightsGreen = lightsGreen;
      slot.blastProgress = blastProgress;
      slot.anchorCenter = anchorCenter;
      slot.compHex = '#ff2a2a';
      slot.tireWearLow = false;
      slot.lockupSide = 0;
      slot.wetSprayLevel = 0;
      slot.onGrassDirt = false;
      slot.rubSparks = false;
      slot.rearWingAskew = false;
      slot.drsOpen = false;
      return slot;
    };

    // Resolve Gantry Start Light State
    let resolvedLightsLit = Number.isFinite(gantryLightsLit) ? gantryLightsLit : -1;
    let resolvedGreen = typeof gantryGreen === 'boolean' ? gantryGreen : null;
    if ((resolvedLightsLit < 0 || resolvedGreen === null) && Array.isArray(track?.gantryLights)) {
      let litCnt = 0;
      let anyGreen = false;
      for (let i = 0; i < track.gantryLights.length; i++) {
        const col = track.gantryLights[i]?.color;
        if (col) {
          if (col.g > 0.65 && col.r < 0.4) anyGreen = true;
          else if (col.r > 0.65 && col.g < 0.4) litCnt++;
        }
      }
      if (resolvedLightsLit < 0) resolvedLightsLit = litCnt;
      if (resolvedGreen === null) resolvedGreen = anyGreen;
    }
    if (resolvedLightsLit < 0) resolvedLightsLit = 0;
    resolvedGreen = !!resolvedGreen;

    // 6A. Start/Finish Gantry & Sector Checkpoint Bridge
    const sfDistReal = forwardDeltaS(camS, 0) * mPerGameM;
    if (sfDistReal > 1.1 && sfDistReal < 185.0) {
      const gantryImg = state === GAME_STATES.QUALIFYING ? this._gantrySprites.qualify : this._gantrySprites.race;
      pushSprite(sfDistReal, 1, gantryImg, 0, ROAD_HALF_WIDTH * 2.42, 0, resolvedLightsLit, resolvedGreen, 0, true);
    }
    const midDistReal = forwardDeltaS(camS, 500) * mPerGameM;
    if (midDistReal > 1.5 && midDistReal < 182.0 && !(tunnelRange && 500 >= tunnelRange[0] && 500 <= tunnelRange[1])) {
      pushSprite(midDistReal, 0, this._gantrySprites.bridge, 0, ROAD_HALF_WIDTH * 2.42, 0, 0, false, 0, true);
    }

    // 6B. Disciplined 22-Sign Namco Roadside Sponsor Billboards + Sparse Biome Trees
    for (let i = 0; i < this._cachedBillboards.length; i++) {
      const bb = this._cachedBillboards[i];
      const dsReal = forwardDeltaS(camS, bb.s) * mPerGameM;
      if (dsReal > 1.2 && dsReal < 182.0) {
        pushSprite(dsReal, 0, this._billboardSprites[bb.spriteIdx], bb.latM, 7.2, 0);
      }
    }

    const fanWaveAlt = (((nowSec * 7) | 0) & 1) === 1;
    for (let slot = 0; slot < 20; slot++) {
      const s = slot * 50 + 28;
      if (tunnelRange && s >= tunnelRange[0] && s <= tunnelRange[1]) continue;
      const dsReal = forwardDeltaS(camS, s) * mPerGameM;
      if (dsReal <= 1.8 || dsReal >= 178.0) continue;
      const side = slot % 2 === 0 ? -1 : 1;
      if (side > 0 && (s >= 900 || s <= 124)) continue;

      let propImg = this._scenicSprites.pine;
      let propWidthM = 4.0;
      if (trackId === 'VEGAS_NEON') {
        propImg = slot % 2 === 0 ? this._scenicSprites.neonSign : this._scenicSprites.palm;
      } else if (trackId === 'MONACO_HARBOR') {
        propImg = slot % 2 === 0 ? this._scenicSprites.palm : this._scenicSprites.pine;
      } else if (trackId === 'MONZA_TEMPLE') {
        if (slot % 3 === 0) {
          propImg = fanWaveAlt ? this._scenicSprites.tifosiFlare1 : this._scenicSprites.tifosiFlare0;
        } else {
          propImg = slot % 2 === 0 ? this._scenicSprites.autumnPine : this._scenicSprites.pine;
        }
      } else if (trackId === 'SUZUKA_130R') {
        if (slot % 4 === 0) {
          propImg = this._scenicSprites.torii;
          propWidthM = 5.2;
        } else {
          propImg = slot % 3 === 1 ? this._scenicSprites.autumnPine : this._scenicSprites.sakura;
        }
      } else if (trackTheme === 'FUJI' || trackId === 'FUJI_1982') {
        if (slot % 4 === 0) {
          propImg = this._scenicSprites.torii;
          propWidthM = 5.2;
        } else if (slot % 2 === 1) {
          propImg = this._scenicSprites.sakura;
        }
      }
      pushSprite(dsReal, 0, propImg, side * (ROAD_HALF_WIDTH + 14.2), propWidthM, 0);
    }

    // 6B1. Animated 2.5D Cheering Fan-Club Tribunes with Waving Flags & Cheer Banners!
    const tribunePosts = [
      { s: 36, latM: -(ROAD_HALF_WIDTH + 10.6) },
      { s: 92, latM: -(ROAD_HALF_WIDTH + 10.6) },
      { s: 156, latM: -(ROAD_HALF_WIDTH + 10.6) },
      { s: 252, latM: ROAD_HALF_WIDTH + 10.6 },
      { s: 348, latM: -(ROAD_HALF_WIDTH + 10.6) },
      { s: 422, latM: ROAD_HALF_WIDTH + 10.6 },
      { s: 615, latM: -(ROAD_HALF_WIDTH + 10.6) },
      { s: 765, latM: ROAD_HALF_WIDTH + 10.6 },
      { s: 942, latM: -(ROAD_HALF_WIDTH + 10.6) },
    ];
    for (let tIdx = 0; tIdx < tribunePosts.length; tIdx++) {
      const tp = tribunePosts[tIdx];
      if (tunnelRange && tp.s >= tunnelRange[0] && tp.s <= tunnelRange[1]) continue;
      const dsReal = forwardDeltaS(camS, tp.s) * mPerGameM;
      if (dsReal > 2.2 && dsReal < 168.0) {
        const tribWave = ((((nowSec * 6) | 0) + tIdx) & 1) === 1;
        const tribImg = tribWave ? this._scenicSprites.fanTribune1 : this._scenicSprites.fanTribune0;
        pushSprite(dsReal, 0, tribImg, tp.latM, 6.2, 0);
      }
    }

    // 6B2. Dynamic < / << / <<< (and > / >> / >>>) 1982 Namco Corner Chevron Signs!
    const chevFlash = (((nowSec * 6) | 0) & 1) === 1;
    for (let c = 0; c < this._cachedCornerSigns.length; c++) {
      const cs = this._cachedCornerSigns[c];
      if (tunnelRange && cs.s >= tunnelRange[0] && cs.s <= tunnelRange[1]) continue;
      const dsReal = forwardDeltaS(camS, cs.s) * mPerGameM;
      if (dsReal > 1.2 && dsReal < 176.0) {
        let cImg;
        if (cs.dir === 'L') {
          cImg = cs.sev === 3 ? (chevFlash ? this._chevronSprites.L3F : this._chevronSprites.L3) : (cs.sev === 2 ? this._chevronSprites.L2 : this._chevronSprites.L1);
        } else {
          cImg = cs.sev === 3 ? (chevFlash ? this._chevronSprites.R3F : this._chevronSprites.R3) : (cs.sev === 2 ? this._chevronSprites.R2 : this._chevronSprites.R1);
        }
        pushSprite(dsReal, 0, cImg, cs.latM, 3.8, 0);
      }
    }

    // 6B3. Roadside "PIT IN >>>" Flashing Pixel Arrow Boards + Pit Lane Crew!
    const pitInFlash = this._pitInSprites[(((nowSec * 5) | 0) & 1)];
    for (const leadM of [190, 72]) {
      const signS = wrapS(PIT_LANE_CONFIG.splitStartS - leadM / mPerGameM);
      const dsReal = forwardDeltaS(camS, signS) * mPerGameM;
      if (dsReal > 1.4 && dsReal < 175.0) {
        pushSprite(dsReal, 0, pitInFlash, ROAD_HALF_WIDTH + 3.4, 3.2, 0);
      }
    }
    const pitBeaconDist = forwardDeltaS(camS, PIT_LANE_CONFIG.playerBoxS) * mPerGameM;
    if (pitBeaconDist > 1.5 && pitBeaconDist < 165.0) {
      pushSprite(pitBeaconDist, 0, this._scenicSprites.pitSign, PIT_LANE_CONFIG.lateralOffset + 5.8, 3.2, 0);
    }
    const crewStations = [18.5, 22.0, 35.0, 50.0];
    for (let cIdx = 0; cIdx < crewStations.length; cIdx++) {
      const crewDist = forwardDeltaS(camS, crewStations[cIdx]) * mPerGameM;
      if (crewDist > 1.5 && crewDist < 145.0) {
        const waveFrame = (((nowSec * 6 + cIdx) | 0) & 1) === 0 ? this._scenicSprites.pitCrew0 : this._scenicSprites.pitCrew1;
        pushSprite(crewDist, 0, waveFrame, PIT_LANE_CONFIG.lateralOffset + 4.4, 2.2, 0);
      }
    }

    // 6B4. 4 Clean FIA Marshal Posts (Green / Yellow / Blue / Checkered)
    const marshalPosts = [
      { s: 6, side: -1, sec: 0 },
      { s: 248, side: 1, sec: 0 },
      { s: 520, side: -1, sec: 1 },
      { s: 790, side: -1, sec: 2 },
    ];
    const vscNow = !!(raceSystems?.vscActive || playerCar?.vscActive);
    for (let m = 0; m < marshalPosts.length; m++) {
      const mp = marshalPosts[m];
      if (tunnelRange && mp.s >= tunnelRange[0] && mp.s <= tunnelRange[1]) continue;
      const dsReal = forwardDeltaS(camS, mp.s) * mPerGameM;
      if (dsReal <= 1.4 || dsReal >= 165.0) continue;

      let crashedNear = false;
      let blueFlagNear = false;
      if (Array.isArray(allCars)) {
        for (let ci = 0; ci < allCars.length; ci++) {
          const c = allCars[ci];
          if (!c) continue;
          const dPost = Math.abs(signedDeltaS(c.s || 0, mp.s)) * mPerGameM;
          if (c.exploded && dPost < 65.0) crashedNear = true;
          if (!c.isPlayer && (c.lap || 1) < resolvedLapNow && dPost < 45.0) blueFlagNear = true;
        }
      }
      const sectorYellow = !!(raceSystems?.yellowSectors && typeof raceSystems.yellowSectors.get === 'function' && raceSystems.yellowSectors.get(mp.sec) > 0);
      const isCheckered = mp.s === 6 && (state === GAME_STATES.RACE_RESULTS || (state === GAME_STATES.RACING && resolvedLapNow >= totalLaps));
      const isYellow = !isCheckered && (vscNow || sectorYellow || crashedNear);
      const isBlue = !isCheckered && !isYellow && blueFlagNear;
      const waveAlt = (((nowSec * 8 + m) | 0) & 1) === 1;

      let mImg = waveAlt ? this._scenicSprites.marshalGreen1 : this._scenicSprites.marshalGreen0;
      if (isCheckered) mImg = waveAlt ? this._scenicSprites.marshalCheck1 : this._scenicSprites.marshalCheck0;
      else if (isYellow) mImg = waveAlt ? this._scenicSprites.marshalYellow1 : this._scenicSprites.marshalYellow0;
      else if (isBlue) mImg = waveAlt ? this._scenicSprites.marshalBlue1 : this._scenicSprites.marshalBlue0;
      pushSprite(dsReal, 0, mImg, mp.side * (ROAD_HALF_WIDTH + 2.85), 2.4, 0);
    }

    // 6C. 150m / 100m / 50m Corner Braking Distance Meter Boards
    const brakingZones = track?.trackDef?.brakingZones || [
      { entryS: 162, side: -1 },
      { entryS: 410, side: 1 },
      { entryS: 618, side: -1 },
      { entryS: 888, side: -1 },
    ];
    for (let z = 0; z < brakingZones.length; z++) {
      const bz = brakingZones[z];
      const side = bz.side || -1;
      for (const distMarker of [150, 100, 50]) {
        const markerS = wrapS(bz.entryS - distMarker / mPerGameM);
        const dsReal = forwardDeltaS(camS, markerS) * mPerGameM;
        if (dsReal > 1.2 && dsReal < 175.0) {
          pushSprite(dsReal, 0, this._brakingSprites[distMarker], side * (ROAD_HALF_WIDTH + 3.5), 2.2, 0);
        }
      }
    }

    // 6D. Competitive AI Rival 1982 F1 Cars (Roster Liveries + Sim-Parity Lockups, Wet Spray, Damage & Rub Sparks!)
    if (Array.isArray(allCars)) {
      for (let i = 0; i < allCars.length; i++) {
        const car = allCars[i];
        if (!car || car.isPlayer) continue;

        const dsGame = signedDeltaS(car.s, camS);
        const dsReal = dsGame * mPerGameM;
        if (dsReal <= 0.65 || dsReal >= 182.0) continue;

        const mappedIdx = this._rivalNumToPalIdx.get(car.carNum);
        const palIdx = mappedIdx !== undefined ? mappedIdx : (Math.abs((car.carNum || i) + i) % this._rivalSprites.length);
        const cSpeed = Math.max(0, car.speedKmh || 0);
        const tirePhase = cSpeed > 1 ? ((Math.floor((car.totalDistanceGameM || car.s || 0) * 4.8) + ((nowSec * 18) | 0)) & 1) : 0;

        const relLat = (car.lateralOffset || 0) - pLat;
        const kRival = this._readUnclampedCurvatureRadM(track, car.s || 0, mPerGameM) * 82.0;
        const bankSignal = relLat * 0.35 + kRival * 2.2 + (car.steerInput || 0) * 1.5;
        const viewIdx = bankSignal < -0.65 ? 0 : (bankSignal > 0.65 ? 2 : 1);
        const rivalImg = this._rivalSprites[palIdx][viewIdx][tirePhase];

        if (car.exploded) {
          const prog = Number.isFinite(car.explodeTimer) ? clamp(1.0 - car.explodeTimer / 2.1, 0, 1) : 0.4;
          const expFrame = this._explosionFrames[Math.min(3, ((nowSec * 14) | 0) % 4)];
          pushSprite(dsReal, 2, expFrame, car.lateralOffset || 0, 6.4, 0, 0, false, prog, false);
        } else {
          const curbHop = car.onCurb && cSpeed > 30 ? (((nowSec * 36 + i) | 0) & 1) : 0;
          const slot = pushSprite(dsReal, 3, rivalImg, car.lateralOffset || 0, 4.35, curbHop, 0, false, 0, false);
          if (slot) {
            slot.compHex = this._resolveCompoundColor(car.compound || 'SOFT');
            const minRivalLife = Math.min(car.tires?.FL?.life ?? 1, car.tires?.FR?.life ?? 1, car.tires?.RL?.life ?? 1);
            slot.tireWearLow = minRivalLife < 0.22;
            slot.lockupSide = this._readFrontLockupSide(car);
            slot.wetSprayLevel = wetness > 0.15 && cSpeed > 68 ? clamp(wetness * (cSpeed / 250.0), 0.12, 1.0) : 0;
            slot.onGrassDirt = !!(car.onGrass && cSpeed > 30);
            slot.rubSparks = Math.abs(signedDeltaS(car.s, pSRaw) * mPerGameM) < 4.9 && Math.abs(relLat) < 2.25 && cSpeed > 60;
            slot.rearWingAskew = (car.damage?.rearWing || 0) > 0.30;
            slot.drsOpen = !!car.drsActive;
          }
        }
      }
    }

    // 7. In-Place Insertion Sort Back-to-Front (Descending distReal — Zero Allocations!)
    for (let i = 1; i < spriteCount; i++) {
      const cur = this._spritePool[i];
      const curD = cur.distReal;
      let j = i - 1;
      while (j >= 0 && this._spritePool[j].distReal < curD) {
        this._spritePool[j + 1] = this._spritePool[j];
        j--;
      }
      this._spritePool[j + 1] = cur;
    }

    // 8. Project & Draw Sorted Sprites via 64-Step NAMCO_ZOOM_LUT & Hill-Crest Occlusion!
    for (let i = 0; i < spriteCount; i++) {
      const sp = this._spritePool[i];
      const d = sp.distReal;
      const invZ = 1.0 / (d + camRig.zCamBackM);
      const v = (invZ - invZFar) / (invZNear - invZFar);
      if (v < -0.05) continue;

      const scale = zNearNumer * invZ;
      const roadHalfPx = baseRoadHalfPx * scale;
      const pxPerMeter = roadHalfPx / ROAD_HALF_WIDTH;

      const fStep = clamp(d / WORLD_STEP_M, 0, WORLD_STEPS - 0.001);
      const idx0 = fStep | 0;
      const idx1 = Math.min(WORLD_STEPS, idx0 + 1);
      const frac = fStep - idx0;
      const worldCurveX = this._worldCurveM[idx0] + (this._worldCurveM[idx1] - this._worldCurveM[idx0]) * frac;
      const elevRelM = this._worldElevM[idx0] + (this._worldElevM[idx1] - this._worldElevM[idx0]) * frac;
      const hillLiftPx = clamp(elevRelM * pxPerMeter * 0.90, -38.0, 44.0);

      const groundY = Math.round(horizonFloat + v * roadSpanRows - hillLiftPx) - sp.yLiftPx;
      const vanishAtten = Math.pow(Math.max(0, 1.0 - clamp(v, 0, 1)), 1.55);
      const roadCenterX =
        W * 0.5 - (pLat / ROAD_HALF_WIDTH) * roadHalfPx + worldCurveX * pxPerMeter + dampedVanishShiftPx * vanishAtten;
      const screenX = sp.anchorCenter ? roadCenterX : roadCenterX + sp.worldLatM * pxPerMeter;

      const img = sp.img;
      if (!img) continue;

      // Hardware-accurate Namco 64-step aspect-locked sprite zoom!
      const rawZoom = (sp.widthMeters * pxPerMeter) / img.width;
      const zoom = sp.kind === 1 ? rawZoom : quantizeNamcoZoom(rawZoom);
      const dstW = Math.max(2, Math.round(img.width * zoom));
      const dstH = Math.max(2, Math.round(dstW * (img.height / img.width)));
      const dx = Math.round(screenX - dstW * 0.5);
      const dy = groundY - dstH;

      if (dx + dstW < 0 || dx >= W) continue;

      // Pole Position II Hill-Crest Occlusion: walk up from groundY if nearer hillside scanlines block this sprite!
      let clipBottomY = Math.min(drawBottomY, groundY);
      while (clipBottomY > dy && clipBottomY > 0 && clipBottomY < H && this._lineDistM[clipBottomY - 1] < d - 2.4) {
        clipBottomY--;
      }
      const visH = clipBottomY - dy;
      if (visH <= 0) continue;

      // Grounded contact shadow beneath rival F1 cars
      if (sp.kind === 3 && clipBottomY >= groundY - 1 && groundY < drawBottomY) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.46)';
        ctx.fillRect(dx + 2, groundY - 1, Math.max(2, dstW - 4), 2);
      }

      if (visH >= dstH) {
        ctx.drawImage(img, dx, dy, dstW, dstH);
      } else {
        const srcH = Math.max(1, Math.round((visH / dstH) * img.height));
        ctx.drawImage(img, 0, 0, img.width, srcH, dx, dy, dstW, visH);
      }

      // Rival F1 Car Sim-Parity Overlays (Compound Stripes, Corded Wear, Lockup Smoke, Wet Rooster-Tail, Damage)
      if (sp.kind === 3 && dstW >= 10 && visH >= (dstH >> 1)) {
        const sc = dstW / img.width;
        // Sidewall compound ticks on rear slicks
        if (dstW >= 16 && visH >= dstH - 2) {
          ctx.fillStyle = sp.compHex;
          const rwH = Math.max(1, Math.round(6 * sc));
          ctx.fillRect(dx + Math.round(5 * sc), groundY - rwH - Math.round(2 * sc), Math.max(1, Math.round(1.5 * sc)), rwH);
          ctx.fillRect(dx + dstW - Math.round(6.5 * sc), groundY - rwH - Math.round(2 * sc), Math.max(1, Math.round(1.5 * sc)), rwH);
        }
        // Dark corded center tread on heavily worn rival tires (<22%)
        if (sp.tireWearLow && dstW >= 18 && visH >= dstH - 1) {
          ctx.fillStyle = '#5a4638';
          const bandH = Math.max(1, Math.round(8 * sc));
          ctx.fillRect(dx + Math.round(7 * sc), groundY - bandH - 1, Math.max(1, Math.round(2 * sc)), bandH);
          ctx.fillRect(dx + dstW - Math.round(9 * sc), groundY - bandH - 1, Math.max(1, Math.round(2 * sc)), bandH);
        }
        // Tilted rear wing damage
        if (sp.rearWingAskew && dstW >= 16) {
          ctx.fillStyle = '#141822';
          ctx.fillRect(dx + Math.round(dstW * 0.62), dy + Math.round(dstH * 0.32), Math.max(2, Math.round(dstW * 0.16)), Math.max(1, Math.round(2 * sc)));
        } else if (sp.drsOpen && dstW >= 18) {
          ctx.fillStyle = '#00fc58';
          ctx.fillRect(dx + Math.round(dstW * 0.26), dy + Math.round(dstH * 0.34), 2, 2);
          ctx.fillRect(dx + Math.round(dstW * 0.72), dy + Math.round(dstH * 0.34), 2, 2);
        }
        // Inside-front pixel brake lockup smoke puffs!
        if (sp.lockupSide !== 0) {
          const puffTick = (nowSec * 28 + i) | 0;
          const pSz = Math.max(2, Math.round(3.5 * sc));
          for (let side of [-1, 1]) {
            if (sp.lockupSide !== 2 && sp.lockupSide !== side) continue;
            const lx = side < 0 ? dx + Math.round(8 * sc) : dx + dstW - Math.round(10 * sc);
            const ly = dy + Math.round(16 * sc);
            for (let p = 0; p < 3; p++) {
              ctx.fillStyle = (p & 1) === 0 ? '#ffffff' : '#dce8ff';
              ctx.fillRect(lx + ((puffTick + p) % 3) - 1, ly - p * pSz, pSz, Math.max(1, pSz - 1));
            }
          }
        }
        // Multi-tiered wet-weather pixel rooster-tail spray plume behind rival car!
        if (sp.wetSprayLevel > 0.08 && clipBottomY >= groundY - 2) {
          const plumeW = Math.max(4, Math.round(dstW * (0.48 + sp.wetSprayLevel * 0.42)));
          const plumeH = Math.max(3, Math.round(dstH * (0.42 + sp.wetSprayLevel * 0.55)));
          const sTick = (nowSec * 26 + i * 5) | 0;
          for (let py = 0; py < plumeH; py += 2) {
            const fracY = py / Math.max(1, plumeH);
            const rowSpan = Math.round(plumeW * (0.45 + fracY * 0.65));
            const rowY = groundY - 2 - py;
            if (rowY < minAllowRoadY) break;
            for (let px = -rowSpan >> 1; px <= rowSpan >> 1; px += 2) {
              if (((px + py + sTick) & 2) === 0) {
                ctx.fillStyle = fracY > 0.55 ? '#dcefff' : '#88bce8';
                ctx.fillRect(Math.round(screenX + px), rowY, 2, 2);
              }
            }
          }
        }
        // Off-track rookie dirt kick-up or wheel-to-wheel rub sparks
        if (sp.onGrassDirt && clipBottomY >= groundY - 1) {
          ctx.fillStyle = (((nowSec * 24 + i) | 0) & 1) ? '#9c6c34' : '#28c838';
          ctx.fillRect(dx + 2, groundY - 4, 2, 2);
          ctx.fillRect(dx + dstW - 4, groundY - 5, 2, 2);
        }
        if (sp.rubSparks) {
          ctx.fillStyle = (((nowSec * 36) | 0) & 1) ? '#fce400' : '#ff6800';
          ctx.fillRect(Math.round(screenX - 3), groundY - 4, 2, 2);
          ctx.fillRect(Math.round(screenX + 2), groundY - 6, 2, 1);
        }
      }

      // Live glowing 5 red / green start lamps on Overhead Start Gantry
      if (sp.kind === 1 && dstW >= 18) {
        const sxRatio = dstW / img.width;
        const syRatio = dstH / img.height;
        const bulbW = Math.max(1, Math.round(10 * sxRatio));
        const bulbH = Math.max(1, Math.round(10 * syRatio));
        const bulbY = Math.round(dy + 56 * syRatio);
        if (bulbY + bulbH <= clipBottomY) {
          for (let l = 0; l < 5; l++) {
            const bx = Math.round(dx + (94 + l * 31) * sxRatio);
            if (sp.lightsGreen) {
              ctx.fillStyle = '#00fc48';
              ctx.fillRect(bx, bulbY, bulbW, bulbH);
              ctx.fillStyle = '#b8ffcc';
              ctx.fillRect(bx, bulbY, Math.max(1, bulbW >> 1), Math.max(1, bulbH >> 1));
            } else if (l < sp.lightsLit) {
              ctx.fillStyle = '#ff1c1c';
              ctx.fillRect(bx, bulbY, bulbW, bulbH);
              ctx.fillStyle = '#ffa0a0';
              ctx.fillRect(bx, bulbY, Math.max(1, bulbW >> 1), Math.max(1, bulbH >> 1));
            }
          }
        }
      }
    }

    // NOTE: Non-1982 smoke flares, confetti, and anime wind lines are intentionally REMOVED for pure 1982 Namco clarity!

    // 9. Foreground Camera Suite (0: Chase + 7-Man Pit Crew, 1: Roll-Hoop T-Cam, 2: Zero-Overlap Open Cockpit, 3: Bonnet Cam, 4: Low Nose Cam)
    const isPitServiceActive = !!(
      state === GAME_STATES.PIT_STOP ||
      playerCar?.pitPhase === 'STOPPED' ||
      (playerCar?.inPitLane && pSpeed < 9.0 && Math.abs(signedDeltaS(pSRaw, PIT_LANE_CONFIG.playerBoxS)) < 4.8)
    );
    if (this._wasInPitStop && !isPitServiceActive) {
      this._visorWipeTimer = 0.22; // Exiting pit box wipes helmet visor clean!
    }
    this._wasInPitStop = isPitServiceActive;

    if (pExploded || camIdx === 0) {
      this._renderPlayerForeground(
        W, H, drawBottomY, playerCar, pSpeed, pSteer, pYaw, pDistGame, mPerGameM, pExploded,
        isRainy, wetness, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
      );
    } else if (camIdx === 1) {
      this._renderTCamForeground(
        W, H, drawBottomY, playerCar, pSpeed, pSteer, pDistGame, mPerGameM,
        isRainy, wetness, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
      );
    } else if (camIdx === 2) {
      this._renderCockpitViewForeground(
        W, H, drawBottomY, horizonY, playerCar, allCars, pSRaw, pLat, mPerGameM, pSpeed, pSteer, pDistGame,
        isRainy, wetness, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
      );
    } else if (camIdx === 3) {
      this._renderBonnetCamForeground(
        W, H, drawBottomY, playerCar, pSpeed, pSteer, pDistGame, mPerGameM,
        isRainy, wetness, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
      );
    } else {
      this._renderNoseCamForeground(
        W, H, drawBottomY, playerCar, pSpeed, pSteer, pDistGame, mPerGameM,
        isRainy, wetness, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
      );
    }

    // 10. Diagonal 1982 Arcade Pixel Rain + Open-Cockpit Visor Droplets & Tear-Off Glint!
    if (isRainy) {
      const rainIntensity = regimeId === 'MONSOON_STORM' ? 40 : 20;
      ctx.fillStyle = regimeId === 'MONSOON_STORM' ? '#a8d8ff' : '#88b8ec';
      const tick = (nowSec * 85) | 0;
      for (let i = 0; i < rainIntensity; i++) {
        const rx = ((i * 53 + tick * 5) % (W + 16)) - 8;
        const ry = (i * 37 + tick * 13) % drawBottomY;
        ctx.fillRect(rx, ry, 1, 5);
        ctx.fillRect(rx - 1, ry + 4, 1, 2);
      }
      if (camIdx === 2 && !pExploded) {
        this._renderVisorRaindrops(W, drawBottomY, horizonY, pSpeed, regimeId === 'MONSOON_STORM', nowSec);
      }
    }

    // 11. Authentic 1982 Namco Top Header, Full Sim-Parity Pixel Telemetry Pod, Native Pit/Clutch Bar & 2x Banners!
    if (state !== GAME_STATES.PRE_RACE_MENU) {
      const resolvedPos = this._resolvePlayerPosition(playerPos, playerCar, allCars);
      const resolvedTotal = Number.isFinite(totalCars) && totalCars > 0 ? totalCars : Math.max(1, allCars?.length || 8);

      this._renderArcadeTopHUD(W, H, {
        score,
        topScore,
        timerSec,
        sessionLabel,
        state,
        currentLap: resolvedLapNow,
        totalLaps,
        lapTimeSec: playerCar?.currentLapTime || 0,
        playerPos: resolvedPos,
        totalCars: resolvedTotal,
        speedKmh: pSpeed,
        gear: playerCar?.gear || 1,
        gearboxMode: playerCar?.gearboxMode || 'AUTO_8SPD',
        rpm: playerCar?.rpm || 3800,
        drsActive: !!playerCar?.drsActive,
        playerS: pSRaw,
        playerCar,
        raceSystems,
        isPitServiceActive,
        pitServiceSubPhase,
        sectorDeltaPopup,
        camIdx,
        camLabel: camRig.label,
        centerCallout,
        arcadeBanner,
        gantryLightsLit: resolvedLightsLit,
        nowSec,
      });
    }

    // 12. Clean 1982 CRT Scanline & Subtle Bezel Vignette Pass
    if (crtScanlines && this._crtCanvas) {
      ctx.drawImage(this._crtCanvas, 0, 0);
    }
  }

  // ==========================================================================
  // SEAMLESS 2PI SKY, CLOUDS & HORIZON LANDMARKS (1024px = 2*PI RAD)
  // ==========================================================================

  _renderSkyAndHorizon(W, fillBottomY, horizonY, { trackId = 'FUJI_1982', forceNight, isSunset, isRainy, isOvercast, showBlimp, lightningFlash, nowSec }) {
    const ctx = this.ctx;

    let bands;
    let panoKey = 'DAY';
    let cloudKey = 'DAY';
    if (lightningFlash > 0.22) {
      bands = ['#b8dcff', '#d8ecff', '#f0f8ff', '#ffffff'];
      panoKey = 'STORM';
      cloudKey = 'STORM';
    } else if (forceNight || trackId === 'VEGAS_NEON') {
      bands = ['#040618', '#080c2c', '#141244', '#281458'];
      panoKey = 'NIGHT';
    } else if (isSunset) {
      bands = ['#282468', '#7c3464', '#dc5438', '#fc7438', '#fcb04c'];
      panoKey = 'SUNSET';
      cloudKey = 'SUNSET';
    } else if (isRainy) {
      bands = ['#1c283c', '#2e425e', '#486284', '#6884a6'];
      panoKey = 'STORM';
      cloudKey = 'STORM';
    } else if (trackId === 'MONZA_TEMPLE') {
      bands = ['#1848d0', '#346ce8', '#5894f8', '#98bcf8', '#fcd088'];
      panoKey = 'SUNSET';
      cloudKey = 'SUNSET';
    } else if (trackId === 'SILVERSTONE_GP' || isOvercast) {
      bands = ['#284888', '#426ab4', '#648ed8', '#8ab4f4', '#b4d0f8'];
      panoKey = 'DAY';
    } else if (trackId === 'MONACO_HARBOR') {
      bands = ['#1054ec', '#2474fc', '#4498ff', '#6cc0ff', '#9ce0ff'];
      panoKey = 'DAY';
    } else {
      // Iconic 1982 Namco Fuji Speedway Cobalt-to-Cyan Sky
      bands = ['#2038ec', '#2c5cfc', '#4084fc', '#58a0ff', '#7cbcff'];
      panoKey = 'DAY';
    }

    const bCount = bands.length;
    for (let i = 0; i < bCount; i++) {
      const y0 = Math.floor((i * fillBottomY) / bCount);
      const y1 = Math.floor(((i + 1) * fillBottomY) / bCount);
      ctx.fillStyle = bands[i];
      ctx.fillRect(0, y0, W, Math.max(1, y1 - y0));
    }

    const yawRad = this._smoothCamYawRad;

    // 1. Twinkling Night Stars on Exact 0.5x Harmonic Loop (512px = PI rad, tiled seamlessly!)
    if ((forceNight || trackId === 'VEGAS_NEON') && lightningFlash <= 0.22) {
      const starShift = ((yawRad * (K_YAW_PX_PER_RAD * 0.5)) % CLOUD_LOOP_W + CLOUD_LOOP_W) % CLOUD_LOOP_W;
      for (let i = 0; i < 40; i++) {
        const baseSx = ((i * 73) % CLOUD_LOOP_W) - starShift;
        const sy = 6 + ((i * 29) % Math.max(12, horizonY - 42));
        const blink = ((i + ((nowSec * 5) | 0)) % 7) !== 0;
        if (blink) {
          ctx.fillStyle = i % 5 === 0 ? '#54dcff' : (i % 7 === 0 ? '#fcf488' : '#fcfcfc');
          for (let sx = baseSx; sx < W; sx += CLOUD_LOOP_W) {
            if (sx >= 0) ctx.fillRect(Math.round(sx), sy, 1, 1);
          }
        }
      }
    }

    // 2. Setting Sun Disc on Exact 1.0x 1024px = 2*PI Loop
    if (isSunset || trackId === 'MONZA_TEMPLE') {
      const sunBase = ((740 - yawRad * K_YAW_PX_PER_RAD) % PANO_LOOP_W + PANO_LOOP_W) % PANO_LOOP_W;
      for (let sunX = sunBase - PANO_LOOP_W; sunX < W + 20; sunX += PANO_LOOP_W) {
        if (sunX > -20 && sunX < W + 20) {
          const sxInt = Math.round(sunX);
          const sunY = horizonY - 24;
          for (let dy = -11; dy <= 11; dy += 2) {
            const hw = Math.round(Math.sqrt(Math.max(0, 121 - dy * dy)));
            ctx.fillStyle = dy < -3 ? '#fcf468' : (dy < 4 ? '#fc9838' : '#fc4828');
            ctx.fillRect(sxInt - hw, sunY + dy, hw * 2, 1);
          }
        }
      }
    }

    // 3. Sub-Pixel Filtered Blit for Cloud Strip (512px = 0.5x harmonic) & Mount Fuji Panorama (1024px = 1.0x harmonic)
    ctx.imageSmoothingEnabled = true;

    if (!forceNight && trackId !== 'VEGAS_NEON') {
      const cloudStrip = this._cloudStrips[cloudKey] || this._cloudStrips.DAY;
      const rawCloudX = (yawRad * (K_YAW_PX_PER_RAD * 0.5) + nowSec * 1.8) % CLOUD_LOOP_W;
      const cloudScroll = ((rawCloudX % CLOUD_LOOP_W) + CLOUD_LOOP_W) % CLOUD_LOOP_W;
      const cloudY = Math.max(24, Math.round(horizonY * 0.30));
      if (cloudY + cloudStrip.height < horizonY - 2) {
        for (let cx = -cloudScroll; cx < W; cx += CLOUD_LOOP_W) {
          ctx.drawImage(cloudStrip, cx, cloudY);
        }
      }
    }

    const pano = this._panoramas[panoKey] || this._panoramas.DAY;
    const panoY = horizonY - pano.height + 2;
    const rawPanoX = (yawRad * K_YAW_PX_PER_RAD) % PANO_LOOP_W;
    const panoScroll = ((rawPanoX % PANO_LOOP_W) + PANO_LOOP_W) % PANO_LOOP_W;
    for (let dx = -panoScroll; dx < W; dx += PANO_LOOP_W) {
      ctx.drawImage(pano, dx, panoY);
    }

    ctx.imageSmoothingEnabled = false;

    // 4. Circling 1982 Namco / Goodyear Blimp + Floating Colorful Festival Hot-Air Balloons (0.5x harmonic = 512px loop!)
    if (!forceNight && this._blimpSprite) {
      const blimpBase = ((280 - yawRad * (K_YAW_PX_PER_RAD * 0.5) - nowSec * 9.5) % CLOUD_LOOP_W + CLOUD_LOOP_W) % CLOUD_LOOP_W;
      const blimpY = Math.max(24, horizonY - 58);
      for (let bx = blimpBase - CLOUD_LOOP_W; bx < W; bx += CLOUD_LOOP_W) {
        if (bx + 96 > 0 && bx < W) {
          ctx.drawImage(this._blimpSprite, Math.round(bx), blimpY);
        }
      }
    }

    if (lightningFlash <= 0.22 && horizonY > 44) {
      const balloonShift = ((yawRad * (K_YAW_PX_PER_RAD * 0.5)) % CLOUD_LOOP_W + CLOUD_LOOP_W) % CLOUD_LOOP_W;
      const balloonThemes = [
        ['#ff1828', '#ffd800', '#fcfcfc'],
        ['#ff8000', '#00f5d0', '#fcfcfc'],
        ['#ff28b8', '#54dcff', '#ffd800'],
        ['#00e868', '#1868ff', '#fcfcfc'],
        ['#e41828', '#00a848', '#fcfcfc'],
      ];
      for (let bIdx = 0; bIdx < 5; bIdx++) {
        const bColors = balloonThemes[bIdx];
        const driftX = nowSec * (1.2 + (bIdx & 1) * 0.6);
        const rawBx = ((bIdx * 103 + 38 + driftX - balloonShift) % CLOUD_LOOP_W + CLOUD_LOOP_W) % CLOUD_LOOP_W;
        const bobY = Math.round(Math.sin(nowSec * 1.9 + bIdx * 1.4) * 3);
        const by = Math.max(16, horizonY - 46 - (bIdx % 3) * 11 + bobY);
        for (let bx = rawBx - CLOUD_LOOP_W; bx < W + 14; bx += CLOUD_LOOP_W) {
          if (bx > -14 && bx < W + 14) {
            const xInt = Math.round(bx);
            // Hot-air balloon envelope (3-stripe dome + tapered lower cone)
            ctx.fillStyle = bColors[0];
            ctx.fillRect(xInt - 5, by - 5, 10, 6);
            ctx.fillStyle = bColors[1];
            ctx.fillRect(xInt - 4, by - 7, 8, 2);
            ctx.fillRect(xInt - 2, by - 5, 4, 6);
            ctx.fillStyle = bColors[2];
            ctx.fillRect(xInt - 4, by + 1, 8, 2);
            ctx.fillStyle = bColors[0];
            ctx.fillRect(xInt - 2, by + 3, 4, 2);
            // Burner flame pulse
            if ((((nowSec * 8) | 0) + bIdx) % 3 !== 0) {
              ctx.fillStyle = '#fce400';
              ctx.fillRect(xInt - 1, by + 5, 2, 2);
            }
            // Wicker gondola basket
            ctx.fillStyle = '#8c5828';
            ctx.fillRect(xInt - 2, by + 7, 4, 2);
          }
        }
      }
    }

    // 5. Circuit-Specific Horizon Festival Landmarks Locked to Exact 1024px (1.0x harmonic) 2*PI Domain!
    const lmScroll = ((Math.round(yawRad * K_YAW_PX_PER_RAD) % PANO_LOOP_W) + PANO_LOOP_W) % PANO_LOOP_W;

    const drawFestivalFerrisWheel = (centerBase, wheelRadius, hubYOffset) => {
      for (let fwX = centerBase - PANO_LOOP_W; fwX < W + 32; fwX += PANO_LOOP_W) {
        if (fwX > -32 && fwX < W + 32) {
          const fwY = horizonY - hubYOffset;
          // Illuminated A-frame support legs
          ctx.fillStyle = '#dce8f8';
          for (let leg = 0; leg < hubYOffset; leg++) {
            ctx.fillRect(fwX - Math.round(leg * 0.46), fwY + leg, 2, 1);
            ctx.fillRect(fwX + Math.round(leg * 0.46), fwY + leg, 2, 1);
          }
          // Rotating neon spokes & 12 rainbow gondolas
          const gondolaPalette = ['#ff1828', '#ffd800', '#00f5d0', '#ff48b0', '#00fc58', '#ff8000'];
          for (let g = 0; g < 12; g++) {
            const ang = (g / 12) * Math.PI * 2 + nowSec * 0.65;
            const cAng = Math.cos(ang);
            const sAng = Math.sin(ang);
            // Inner spoke dots
            ctx.fillStyle = (g & 1) === 0 ? '#fce400' : '#54dcff';
            ctx.fillRect(fwX + Math.round(cAng * (wheelRadius * 0.5)), fwY + Math.round(sAng * (wheelRadius * 0.5)), 1, 1);
            // Outer gondola cabin
            const gx = fwX + Math.round(cAng * wheelRadius);
            const gy = fwY + Math.round(sAng * wheelRadius);
            ctx.fillStyle = gondolaPalette[g % gondolaPalette.length];
            ctx.fillRect(gx - 1, gy - 1, 3, 3);
          }
          // Center illuminated hub
          ctx.fillStyle = '#fcfcfc';
          ctx.fillRect(fwX - 2, fwY - 2, 4, 4);
          ctx.fillStyle = '#ff1828';
          ctx.fillRect(fwX - 1, fwY - 1, 2, 2);
        }
      }
    };

    const drawHorizonTorii = (toriiBase) => {
      for (let tx = toriiBase - PANO_LOOP_W; tx < W + 28; tx += PANO_LOOP_W) {
        if (tx > -28 && tx < W + 28) {
          const ty = horizonY - 18;
          ctx.fillStyle = '#18202c';
          ctx.fillRect(tx - 12, ty, 24, 2);
          ctx.fillStyle = '#e41820';
          ctx.fillRect(tx - 11, ty + 2, 22, 2);
          ctx.fillRect(tx - 10, ty + 6, 20, 2);
          ctx.fillRect(tx - 7, ty + 2, 3, 16);
          ctx.fillRect(tx + 4, ty + 2, 3, 16);
          ctx.fillStyle = '#fce400';
          ctx.fillRect(tx - 1, ty + 3, 2, 3);
        }
      }
    };

    const drawSakuraPetals = () => {
      const petalShift = ((yawRad * (K_YAW_PX_PER_RAD * 0.5)) % CLOUD_LOOP_W + CLOUD_LOOP_W) % CLOUD_LOOP_W;
      for (let p = 0; p < 18; p++) {
        const pxBase = ((p * 59 + nowSec * 14 - petalShift) % CLOUD_LOOP_W + CLOUD_LOOP_W) % CLOUD_LOOP_W;
        const py = 12 + ((p * 19 + Math.round(nowSec * 9)) % Math.max(16, horizonY - 16));
        ctx.fillStyle = (p & 1) === 0 ? '#ffd0e4' : '#ff80b8';
        for (let px = pxBase - CLOUD_LOOP_W; px < W; px += CLOUD_LOOP_W) {
          if (px >= 0 && px < W) {
            ctx.fillRect(Math.round(px), py, 2, 1);
          }
        }
      }
    };

    if (trackId === 'MONACO_HARBOR') {
      // Sparkling Turquoise-Azure Mediterranean Sea + Sun-Glint Ripples + Fleet of Superyachts!
      ctx.fillStyle = '#0078d4';
      ctx.fillRect(0, horizonY - 8, W, 3);
      ctx.fillStyle = '#00a8e8';
      ctx.fillRect(0, horizonY - 5, W, 3);
      ctx.fillStyle = '#18dcff';
      ctx.fillRect(0, horizonY - 2, W, 3);
      // Animated sun-glint water sparkles
      for (let sIdx = 0; sIdx < 24; sIdx++) {
        const glintBase = ((sIdx * 43 + ((nowSec * 12) | 0) - lmScroll) % PANO_LOOP_W + PANO_LOOP_W) % PANO_LOOP_W;
        const glintY = horizonY - 7 + (sIdx % 6);
        ctx.fillStyle = (sIdx & 1) === 0 ? '#fcfcfc' : '#fce400';
        for (let gx = glintBase - PANO_LOOP_W; gx < W; gx += PANO_LOOP_W) {
          if (gx >= 0 && gx < W) ctx.fillRect(gx, glintY, 3, 1);
        }
      }
      // Luxury Superyachts with Party Canopies & Golden Deck Lights
      const canopyColors = ['#ff1828', '#00f5d0', '#ff8000', '#ffd800', '#ff48b0', '#1868fc'];
      for (let yIdx = 0; yIdx < 6; yIdx++) {
        const baseYx = ((yIdx * 170 + 64 - lmScroll) % PANO_LOOP_W + PANO_LOOP_W) % PANO_LOOP_W;
        for (let yx = baseYx - PANO_LOOP_W; yx < W; yx += PANO_LOOP_W) {
          if (yx > -34 && yx < W) {
            // Superyacht multi-deck white hull
            ctx.fillStyle = '#fcfcfc';
            ctx.fillRect(yx, horizonY - 10, 26, 4);
            ctx.fillRect(yx + 4, horizonY - 14, 16, 4);
            ctx.fillRect(yx + 7, horizonY - 17, 10, 3);
            // Gold hull trim stripe
            ctx.fillStyle = '#ffd800';
            ctx.fillRect(yx + 1, horizonY - 8, 24, 1);
            // Azure tinted salon windows
            ctx.fillStyle = '#00d8ff';
            ctx.fillRect(yx + 5, horizonY - 12, 12, 1);
            // Aft party canopy & radar mast
            ctx.fillStyle = canopyColors[yIdx % canopyColors.length];
            ctx.fillRect(yx + 16, horizonY - 16, 7, 2);
            ctx.fillStyle = '#fce400';
            ctx.fillRect(yx + 11, horizonY - 22, 1, 5);
          }
        }
      }
    } else if (trackId === 'SUZUKA_130R') {
      drawFestivalFerrisWheel(((340 - lmScroll) % PANO_LOOP_W + PANO_LOOP_W) % PANO_LOOP_W, 17, 23);
      drawHorizonTorii(((690 - lmScroll) % PANO_LOOP_W + PANO_LOOP_W) % PANO_LOOP_W);
      drawSakuraPetals();
    } else if (trackId === 'SILVERSTONE_GP') {
      // Iconic Silverstone Wing Pit Complex + Festival Ferris Wheel
      const twBase = ((680 - lmScroll) % PANO_LOOP_W + PANO_LOOP_W) % PANO_LOOP_W;
      for (let twX = twBase - PANO_LOOP_W; twX < W + 40; twX += PANO_LOOP_W) {
        if (twX > -50 && twX < W + 20) {
          ctx.fillStyle = '#48586c';
          ctx.fillRect(twX, horizonY - 18, 10, 18);
          ctx.fillStyle = '#98d8ff';
          ctx.fillRect(twX - 2, horizonY - 22, 14, 4);
          ctx.fillStyle = (((nowSec * 6) | 0) & 1) === 0 ? '#00fc58' : '#fcfcfc';
          ctx.fillRect(twX + 4, horizonY - 25, 2, 3);
          ctx.fillStyle = '#dce4f0';
          ctx.fillRect(twX + 18, horizonY - 10, 28, 3);
          ctx.fillStyle = '#ce1126';
          ctx.fillRect(twX + 20, horizonY - 7, 24, 2);
        }
      }
      drawFestivalFerrisWheel(((240 - lmScroll) % PANO_LOOP_W + PANO_LOOP_W) % PANO_LOOP_W, 14, 19);

      // RAF Red Arrows 3-Jet V-Formation Flyover Trailing Red, White & Blue Smoke Ribbons!
      const jetBase = ((Math.round(nowSec * 36) + 520 - lmScroll) % PANO_LOOP_W + PANO_LOOP_W) % PANO_LOOP_W;
      const jetY = Math.max(14, horizonY - 52);
      const ribbonPalette = ['#ff1828', '#fcfcfc', '#1868ff'];
      for (let jx = jetBase - PANO_LOOP_W; jx < W + 70; jx += PANO_LOOP_W) {
        if (jx > -70 && jx < W + 70) {
          for (let j = 0; j < 3; j++) {
            const jy = jetY + (j === 1 ? -4 : 2) + j * 3;
            const leadOffset = j === 1 ? 6 : 0;
            // Smoke ribbon trail behind jet
            ctx.fillStyle = ribbonPalette[j];
            ctx.fillRect(jx - 44 + leadOffset, jy + 1, 42, 2);
            // Hawk trainer crimson jet fuselage & delta wing
            ctx.fillStyle = '#e41820';
            ctx.fillRect(jx + leadOffset, jy, 6, 3);
            ctx.fillStyle = '#fcfcfc';
            ctx.fillRect(jx + 2 + leadOffset, jy - 1, 2, 5);
          }
        }
      }
    } else if (trackId === 'MONZA_TEMPLE') {
      // Sea of Ferrari Rosso Red Tifosi Horizon Banners & Billowing Italian Tricolore Smoke Flare Plumes!
      for (let fIdx = 0; fIdx < 8; fIdx++) {
        const fBase = ((fIdx * 128 + 48 - lmScroll) % PANO_LOOP_W + PANO_LOOP_W) % PANO_LOOP_W;
        const flareHex = fIdx % 3 === 0 ? '#ff1828' : (fIdx % 3 === 1 ? '#fcfcfc' : '#00c850');
        for (let fx = fBase - PANO_LOOP_W; fx < W + 24; fx += PANO_LOOP_W) {
          if (fx > -24 && fx < W + 24) {
            // Tifosi horizon tribune banner
            ctx.fillStyle = '#e41820';
            ctx.fillRect(fx - 10, horizonY - 6, 20, 6);
            ctx.fillStyle = '#ffd800';
            ctx.fillRect(fx - 8, horizonY - 4, 16, 2);
            // Rising smoke plume puffs
            for (let p = 0; p < 4; p++) {
              const sway = Math.round(Math.sin(nowSec * 3.2 + fIdx + p * 0.9) * (2 + p));
              const pw = 6 + p * 3;
              const ph = 4 + p;
              ctx.fillStyle = p === 0 ? '#ff2828' : flareHex;
              ctx.fillRect(fx + sway - (pw >> 1), horizonY - 10 - p * 4, pw, ph);
            }
          }
        }
      }
    } else if (trackId === 'VEGAS_NEON') {
      // Glowing 3D LED Vegas Sphere (Exosphere) + Bellagio Dancing Water Fountains!
      const spBase = ((420 - lmScroll) % PANO_LOOP_W + PANO_LOOP_W) % PANO_LOOP_W;
      for (let sx = spBase - PANO_LOOP_W; sx < W + 32; sx += PANO_LOOP_W) {
        if (sx > -32 && sx < W + 32) {
          const sy = horizonY - 15;
          const R = 15;
          for (let dy = -R; dy <= R; dy++) {
            const hw = Math.round(Math.sqrt(Math.max(0, R * R - dy * dy)));
            const ringPulse = ((dy + ((nowSec * 10) | 0)) & 3);
            ctx.fillStyle = ringPulse === 0 ? '#ff28b8' : (ringPulse === 1 ? '#00f4ff' : (ringPulse === 2 ? '#fce400' : '#6818f8'));
            ctx.fillRect(sx - hw, sy + dy, hw * 2, 1);
          }
          // Exosphere glowing eyes & smile
          ctx.fillStyle = '#fcfcfc';
          ctx.fillRect(sx - 6, sy - 4, 3, 3);
          ctx.fillRect(sx + 3, sy - 4, 3, 3);
          ctx.fillRect(sx - 5, sy + 3, 10, 2);
        }
      }
      // Bellagio Dancing Fountains
      const fnBase = ((780 - lmScroll) % PANO_LOOP_W + PANO_LOOP_W) % PANO_LOOP_W;
      for (let fx = fnBase - PANO_LOOP_W; fx < W + 48; fx += PANO_LOOP_W) {
        if (fx > -48 && fx < W + 48) {
          for (let j = -5; j <= 5; j++) {
            const jx = fx + j * 6;
            const jetH = Math.max(4, Math.round(12 + Math.sin(nowSec * 5.5 + j * 0.7) * 10));
            ctx.fillStyle = (j & 1) === 0 ? '#00f4ff' : '#fce400';
            ctx.fillRect(jx, horizonY - jetH, 2, jetH);
            ctx.fillStyle = '#fcfcfc';
            ctx.fillRect(jx - 1, horizonY - jetH - 2, 4, 2);
          }
        }
      }
    } else {
      // FUJI_1982 Default: Festival Ferris Wheel + Crimson Shinto Torii Gate + Drifting Pink Sakura Petals!
      drawFestivalFerrisWheel(((260 - lmScroll) % PANO_LOOP_W + PANO_LOOP_W) % PANO_LOOP_W, 15, 20);
      drawHorizonTorii(((620 - lmScroll) % PANO_LOOP_W + PANO_LOOP_W) % PANO_LOOP_W);
      drawSakuraPetals();
    }
  }

  _resolveCompoundColor(compoundName) {
    return COMPOUND_PIXEL_COLORS[compoundName] || COMPOUND_PIXEL_COLORS.SOFT;
  }

  _resolvePitProgressAndLabel(playerCar, pitServiceSubPhase, nowSec) {
    const out = this._pitScratch;
    const totalDur = Math.max(1.2, Number.isFinite(playerCar?.pitStopTotalDuration) ? playerCar.pitStopTotalDuration : 2.8);
    const remSec = Number.isFinite(playerCar?.pitStopTimer) && playerCar.pitStopTimer > 0
      ? playerCar.pitStopTimer
      : (totalDur * (1.0 - ((nowSec * 0.38) % 1.0)));
    const prog = clamp(1.0 - remSec / totalDur, 0, 1);
    let sub = typeof pitServiceSubPhase === 'string' && pitServiceSubPhase ? pitServiceSubPhase : (playerCar?.pitServiceSubPhase || '');
    if (!sub) {
      if (prog < 0.18) sub = 'JACK UP';
      else if (prog < 0.50) sub = 'WHEELS OFF';
      else if (prog < 0.82) sub = 'TIRES + FUEL';
      else if (prog < 0.92) sub = 'DROP JACK';
      else sub = 'GO! GO! GO!';
    }
    out.prog = prog;
    out.remSec = remSec;
    out.sub = sub;
    return out;
  }

  // Helper: Draw exposed pixel front slick tire with compound stripe, <22% dark corded wear, flat-spot scuff & lockup smoke!
  _drawExposedFrontSlick(wx, wy, wheelW, wheelH, side, tirePhase, compHex, tireLife, flatSpotSev, wheelRotPhase, brakingHot, isLockingThisWheel, wetness, speedKmh, nowSec) {
    const ctx = this.ctx;
    ctx.fillStyle = '#0e1016';
    ctx.fillRect(wx, wy, wheelW, wheelH);

    // Progressive rubber darkening as tire wears
    const rubberHex = tireLife < 0.22 ? '#191b22' : (tireLife < 0.48 ? '#1f242e' : '#262c38');
    ctx.fillStyle = rubberHex;
    ctx.fillRect(wx + 2, wy + 2, wheelW - 4, wheelH - 4);

    // Spinning horizontal tread highlight bars (dimmed when worn)
    const barShift = tirePhase ? 4 : 0;
    ctx.fillStyle = tireLife < 0.22 ? '#383e4c' : (tireLife < 0.48 ? '#4c5668' : '#6a768c');
    for (let ty = wy + 3 + barShift; ty < wy + wheelH - 4; ty += 8) {
      ctx.fillRect(wx + 3, ty, wheelW - 6, 2);
    }

    // < 22% Life: Dark Corded / Grained Center Tread Belt!
    if (tireLife < 0.22) {
      const cordW = Math.max(2, Math.round(wheelW * 0.24));
      const cordX = wx + ((wheelW - cordW) >> 1);
      ctx.fillStyle = '#5c4638';
      ctx.fillRect(cordX, wy + 2, cordW, wheelH - 4);
      ctx.fillStyle = '#3c2c22';
      for (let cy = wy + 3 + (tirePhase ? 2 : 0); cy < wy + wheelH - 3; cy += 4) {
        ctx.fillRect(cordX, cy, cordW, 1);
      }
    }

    // Rotating Tire Flat-Spot Scuff Patch (sweeps down tread at exact wheel rotation frequency!)
    if (flatSpotSev > 0.08) {
      const rotFrac = ((wheelRotPhase % 1.0) + 1.0) % 1.0;
      const patchH = Math.max(3, Math.round(3 + flatSpotSev * 4));
      const patchY = wy + 3 + Math.round(rotFrac * Math.max(2, wheelH - 6 - patchH));
      ctx.fillStyle = '#0a0c10';
      ctx.fillRect(wx + 2, patchY, wheelW - 4, patchH);
      ctx.fillStyle = '#8c7868';
      ctx.fillRect(wx + 3, patchY + 1, wheelW - 6, Math.max(1, patchH - 2));
    }

    // Sidewall Compound Stripe on Inner Edge
    ctx.fillStyle = compHex;
    const stripeX = side < 0 ? wx + wheelW - 3 : wx + 1;
    ctx.fillRect(stripeX, wy + 4, 2, wheelH - 8);

    // Carbon Brake Disc Thermal Glow on Inner Rim Lip (strictly bounded within [wx .. wx + wheelW]!)
    if (brakingHot) {
      ctx.fillStyle = '#ff4200';
      ctx.fillRect(side < 0 ? wx + wheelW - 2 : wx, wy + Math.round(wheelH * 0.28), 2, Math.round(wheelH * 0.44));
    }

    // Inside-Front Brake Lockup Pixel Smoke (rises off top tread, strictly bounded within [wx .. wx + wheelW]!)
    if (isLockingThisWheel) {
      const pTick = (nowSec * 30) | 0;
      const puffW = Math.min(4, wheelW - 2);
      const maxOx = Math.max(1, wheelW - puffW);
      for (let p = 0; p < 5; p++) {
        const ox = ((p * 5 + pTick * 3) % maxOx);
        const oy = wy - 2 - p * 3 - (pTick % 2);
        ctx.fillStyle = (p & 1) === 0 ? '#ffffff' : '#dce8ff';
        ctx.fillRect(wx + ox, oy, puffW, 3);
      }
    } else if (wetness > 0.20 && speedKmh > 75) {
      ctx.fillStyle = '#98dcff';
      ctx.fillRect(wx + (((nowSec * 33) | 0) % Math.max(2, wheelW - 3)), wy - 3, 3, 2);
    }
  }

  // Helper: Draw chrome double-wishbones with visible bent kink when suspension is damaged!
  _drawChromeWishbones(x0, x1, upperY, lowerY, isBent) {
    const ctx = this.ctx;
    const left = Math.min(x0, x1);
    const span = Math.abs(x1 - x0);
    if (span <= 2) return;

    if (!isBent) {
      ctx.fillStyle = '#b4c0d4';
      ctx.fillRect(left, upperY, span, 2);
      ctx.fillStyle = '#7c889c';
      ctx.fillRect(left, lowerY, span, 2);
    } else {
      // Bent suspension wishbone kink (+2px mid-arm buckle & warning dark fracture tint)
      const half = span >> 1;
      ctx.fillStyle = '#98a4b8';
      ctx.fillRect(left, upperY, half, 2);
      ctx.fillRect(left + half, upperY + 2, span - half, 2);
      ctx.fillStyle = '#687284';
      ctx.fillRect(left, lowerY + 1, half, 2);
      ctx.fillRect(left + half, lowerY + 3, span - half, 2);
    }
  }

  // ==========================================================================
  // CAMERA 0: CLASSIC 1982 CHASE VIEW + 7-MAN PIT CREW + SIM DAMAGE & TIRES
  // ==========================================================================
  _renderPlayerForeground(
    W, H, drawBottomY, playerCar, speedKmh, steerInput, relYaw, distGame, mPerGameM, exploded,
    isRainy, wetness, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
  ) {
    const ctx = this.ctx;
    const baseCarX = W >> 1;
    const baseCarY = H > 275 ? drawBottomY - 2 : H - 8;

    if (exploded) {
      const t = this._playerBlastSec;
      const frameIdx = Math.min(3, ((nowSec * 15) | 0) % 4);
      const fireImg = this._explosionFrames[frameIdx];
      const scale = W < 220 ? 0.92 : 1.25;
      const fw = Math.round(fireImg.width * scale);
      const fh = Math.round(fireImg.height * scale);

      ctx.fillStyle = 'rgba(12, 10, 12, 0.65)';
      ctx.fillRect(baseCarX - (fw >> 1) + 8, baseCarY - 8, fw - 16, 6);
      ctx.drawImage(fireImg, Math.round(baseCarX - fw * 0.5), Math.round(baseCarY - fh + 4), fw, fh);

      // 4 Bouncing Black Pixel Slick Tires!
      const wheelImg = this._wheelSprites[((nowSec * 18) | 0) & 1];
      const vxScale = W < 220 ? 0.72 : 1.0;
      const wheelTrajectories = [
        { vx: -118 * vxScale, vy: -124, bounce: 0.60 },
        { vx:  -54 * vxScale, vy: -162, bounce: 0.65 },
        { vx:   58 * vxScale, vy: -154, bounce: 0.63 },
        { vx:  124 * vxScale, vy: -118, bounce: 0.58 },
      ];
      const gravity = 290;
      const groundWheelY = baseCarY - 4;
      for (let i = 0; i < 4; i++) {
        const tr = wheelTrajectories[i];
        const wx = Math.round(baseCarX + tr.vx * t - wheelImg.width * 0.5);
        const tImpact1 = (-2.0 * tr.vy) / gravity;
        let yOff;
        if (t <= tImpact1) {
          yOff = tr.vy * t + 0.5 * gravity * t * t;
        } else {
          const tb = t - tImpact1;
          const vy2 = tr.vy * tr.bounce;
          const tImpact2 = (-2.0 * vy2) / gravity;
          if (tb <= tImpact2) yOff = vy2 * tb + 0.5 * gravity * tb * tb;
          else {
            const tb2 = tb - tImpact2;
            yOff = Math.min(0, (vy2 * tr.bounce) * tb2 + 0.5 * gravity * tb2 * tb2);
          }
        }
        const wy = Math.round(groundWheelY + yOff - wheelImg.height);
        if (wx > -20 && wx < W + 20) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.fillRect(wx + 2, groundWheelY - 2, wheelImg.width - 4, 2);
          ctx.drawImage(wheelImg, wx, wy);
        }
      }
      return;
    }

    const dmg = this._readDamageProfile(playerCar);
    const flatInfo = this._readFlatSpotInfo(playerCar);
    const flatShudder = this._computeWheelFreqShudder(flatInfo.maxFlat, speedKmh, nowSec);
    const lockSide = this._readFrontLockupSide(playerCar);

    const combinedSteer = steerInput * 0.85 + clamp(relYaw * 1.6, -0.5, 0.5);
    let steerFrameIdx = 2;
    if (combinedSteer < -0.52) steerFrameIdx = 0;
    else if (combinedSteer < -0.15) steerFrameIdx = 1;
    else if (combinedSteer > 0.52) steerFrameIdx = 4;
    else if (combinedSteer > 0.15) steerFrameIdx = 3;

    const tirePhase = speedKmh > 1.0 ? (Math.floor(distGame * 4.4) & 1) : 0;
    const carImg = this._playerSprites[steerFrameIdx][tirePhase];
    const carScale = W < 215 ? 0.90 : 1.18;
    const dstW = Math.round(carImg.width * carScale);
    const dstH = Math.round(carImg.height * carScale);

    let pitProg = 0;
    let pitSub = '';
    let jackLiftPx = 0;
    if (isPitServiceActive) {
      const pitInfo = this._resolvePitProgressAndLabel(playerCar, pitServiceSubPhase, nowSec);
      pitProg = pitInfo.prog;
      pitSub = pitInfo.sub;
      const rawJack = Number.isFinite(playerCar?.pitJackLift)
        ? playerCar.pitJackLift
        : (pitProg > 0.12 && pitProg < 0.86 ? 1.0 : 0.0);
      jackLiftPx = Math.round(clamp(rawJack, 0, 1) * 4);
    }

    let bounceY = -jackLiftPx + flatShudder;
    if (!isPitServiceActive) {
      if (playerCar?.onCurb && speedKmh > 20) {
        bounceY += (((nowSec * 42) | 0) & 1) ? -2 : 0;
      } else if (playerCar?.onGrass && speedKmh > 15) {
        bounceY += (((nowSec * 28) | 0) % 3 === 0) ? -2 : -1;
      }
    }

    const dx = Math.round(baseCarX - dstW * 0.5);
    const dy = Math.round(baseCarY - dstH + bounceY);

    // Asphalt tire-mark streaks under hard cornering slip
    const skidVal = playerCar?.skidIntensity || 0;
    if (!isPitServiceActive && skidVal > 0.32 && speedKmh > 35 && !playerCar?.onGrass) {
      const markL = dx + Math.round(dstW * 0.12);
      const markR = dx + Math.round(dstW * 0.78);
      const driftSkew = Math.round(clamp(combinedSteer * 5, -4, 4));
      ctx.fillStyle = 'rgba(20, 22, 28, 0.70)';
      for (let m = 0; m < 6; m++) {
        const my = baseCarY - 1 + m;
        if (my < drawBottomY) {
          ctx.fillRect(markL + Math.round((driftSkew * m) / 5), my, 5, 1);
          ctx.fillRect(markR + Math.round((driftSkew * m) / 5), my, 5, 1);
        }
      }
    }

    // Back Pass of 7-Man 1982 Pit Crew
    if (isPitServiceActive) {
      this._renderPitStopCrewChase(W, H, dx, dy, dstW, dstH, baseCarX, baseCarY, pitProg, pitSub, playerCar, raceSystems, true, nowSec);
    }

    // Grounded Contact Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.50)';
    ctx.fillRect(dx + 4, baseCarY - 3, dstW - 8, 3);
    ctx.fillRect(dx + 8, baseCarY - 5, dstW - 16, 2);

    // Draw Player #1 1982 F1 Car Sprite
    ctx.drawImage(carImg, dx, dy, dstW, dstH);

    const shiftX = (steerFrameIdx - 2) * Math.round(carScale * 2);

    // Sim-Parity Damage Masks on Chase Sprite:
    // 1) Missing Left / Right Front-Wing Endplates
    if (dmg.fwLeftOut && (!isPitServiceActive || pitProg < 0.65)) {
      ctx.fillStyle = '#383c46';
      ctx.fillRect(dx + Math.round(16 * carScale) + shiftX, dy + Math.round(10 * carScale), Math.max(3, Math.round(4 * carScale)), Math.max(3, Math.round(4 * carScale)));
    }
    if (dmg.fwRightOut && (!isPitServiceActive || pitProg < 0.65)) {
      ctx.fillStyle = '#383c46';
      ctx.fillRect(dx + dstW - Math.round(20 * carScale) + shiftX, dy + Math.round(10 * carScale), Math.max(3, Math.round(4 * carScale)), Math.max(3, Math.round(4 * carScale)));
    }
    // 2) Tilted / Askew Rear Wing + Missing Endplate
    if (dmg.rwAskew && (!isPitServiceActive || pitProg < 0.72)) {
      ctx.fillStyle = '#202430';
      ctx.fillRect(dx + Math.round(dstW * 0.58), dy + Math.round(12 * carScale), Math.round(dstW * 0.22), Math.max(2, Math.round(3 * carScale)));
      ctx.fillStyle = '#fcfcfc';
      ctx.fillRect(dx + Math.round(dstW * 0.56), dy + Math.round(15 * carScale), Math.round(dstW * 0.18), Math.max(2, Math.round(3 * carScale)));
    }
    // 3) Bent Suspension Camber / Droop on Damaged Front Corner
    if (dmg.susp > 0.22 && (!isPitServiceActive || pitProg < 0.75)) {
      const sCornerX = dmg.suspSide < 0 ? dx + Math.round(10 * carScale) + shiftX : dx + dstW - Math.round(19 * carScale) + shiftX;
      ctx.fillStyle = '#181a22';
      ctx.fillRect(sCornerX, dy + Math.round(13 * carScale), Math.round(8 * carScale), Math.round(10 * carScale));
      if (dmg.susp > 0.60 && (((nowSec * 18) | 0) & 1) === 0) {
        ctx.fillStyle = '#9aa4b4';
        ctx.fillRect(sCornerX + 2, dy + Math.round(9 * carScale), 3, 3);
      }
    }

    // Live Tire Compound Stripes + <22% Dark Corded Tread + Rotating Flat-Spot Scuff!
    const activeCompName = (isPitServiceActive && pitProg >= 0.52 && raceSystems?.playerPitPlan?.nextCompound)
      ? raceSystems.playerPitPlan.nextCompound
      : (playerCar?.compound || 'SOFT');
    const compHex = this._resolveCompoundColor(activeCompName);
    const stripeOffY = tirePhase ? 1 : 0;
    ctx.fillStyle = compHex;
    ctx.fillRect(dx + Math.round(5 * carScale), dy + Math.round((27 + stripeOffY) * carScale), Math.max(2, Math.round(2 * carScale)), Math.round(9 * carScale));
    ctx.fillRect(dx + dstW - Math.round(7 * carScale), dy + Math.round((27 + (1 - stripeOffY)) * carScale), Math.max(2, Math.round(2 * carScale)), Math.round(9 * carScale));
    ctx.fillRect(dx + Math.round(13 * carScale) + shiftX, dy + Math.round(12 * carScale), Math.max(1, Math.round(2 * carScale)), Math.round(6 * carScale));
    ctx.fillRect(dx + dstW - Math.round(15 * carScale) + shiftX, dy + Math.round(12 * carScale), Math.max(1, Math.round(2 * carScale)), Math.round(6 * carScale));

    // < 22% Worn Tire Dark Corded Center Belts on Rear & Front Slicks
    const rlLife = playerCar?.tires?.RL?.life ?? 1;
    const rrLife = playerCar?.tires?.RR?.life ?? 1;
    const flLife = playerCar?.tires?.FL?.life ?? 1;
    const frLife = playerCar?.tires?.FR?.life ?? 1;
    if (!isPitServiceActive || pitProg < 0.50) {
      ctx.fillStyle = '#5c4638';
      if (rlLife < 0.22) ctx.fillRect(dx + Math.round(10 * carScale), dy + Math.round(23 * carScale), Math.max(2, Math.round(3 * carScale)), Math.round(12 * carScale));
      if (rrLife < 0.22) ctx.fillRect(dx + dstW - Math.round(13 * carScale), dy + Math.round(23 * carScale), Math.max(2, Math.round(3 * carScale)), Math.round(12 * carScale));
      if (flLife < 0.22) ctx.fillRect(dx + Math.round(11 * carScale) + shiftX, dy + Math.round(12 * carScale), 2, Math.round(8 * carScale));
      if (frLife < 0.22) ctx.fillRect(dx + dstW - Math.round(13 * carScale) + shiftX, dy + Math.round(12 * carScale), 2, Math.round(8 * carScale));
    }

    // Rotating Flat-Spot Scuff Flash on Front Tires in Chase Cam
    const wheelRotPhase = (distGame * mPerGameM) / 2.073;
    const rotBand = Math.round(((wheelRotPhase % 1.0 + 1.0) % 1.0) * 6);
    if (flatInfo.fl > 0.10) {
      ctx.fillStyle = '#8c7868';
      ctx.fillRect(dx + Math.round(9 * carScale) + shiftX, dy + Math.round((12 + rotBand) * carScale), Math.round(5 * carScale), 2);
    }
    if (flatInfo.fr > 0.10) {
      ctx.fillStyle = '#8c7868';
      ctx.fillRect(dx + dstW - Math.round(14 * carScale) + shiftX, dy + Math.round((12 + rotBand) * carScale), Math.round(5 * carScale), 2);
    }

    // Active DRS Rear-Wing Slot Indicator (if Rear Wing intact)
    if (playerCar?.drsActive && !dmg.rwAskew) {
      const wingX = dx + Math.round(dstW * 0.25);
      const wingW = Math.round(dstW * 0.50);
      const wingY = dy + Math.round(dstH * 0.36);
      ctx.fillStyle = '#182438';
      ctx.fillRect(wingX + 2, wingY, wingW - 4, 2);
      ctx.fillStyle = '#00fc58';
      ctx.fillRect(wingX, wingY - 1, 2, 4);
      ctx.fillRect(wingX + wingW - 2, wingY - 1, 2, 4);
    }

    // Foreground Pass of 7-Man 1982 Pit Crew!
    if (isPitServiceActive) {
      this._renderPitStopCrewChase(W, H, dx, dy, dstW, dstH, baseCarX, baseCarY, pitProg, pitSub, playerCar, raceSystems, false, nowSec);
      return;
    }

    // Launch Reaction Boost Afterburner Plume + Crisp 'TURBO!' Car Accent OR Brief Shift-Cut Pop
    const launchBoostRem = Number.isFinite(playerCar?.launchBoostTimer) ? playerCar.launchBoostTimer : 0;
    if (launchBoostRem > 0 && !isPitServiceActive) {
      const fx = baseCarX + (steerFrameIdx - 2);
      const fy = dy + Math.round(dstH * 0.78);
      const boostPulse = (((nowSec * 24) | 0) & 1) === 0;
      const flameLen = boostPulse ? 6 : 4;
      ctx.fillStyle = boostPulse ? '#00f4ff' : '#fce400';
      ctx.fillRect(fx - 6, fy, 4, flameLen);
      ctx.fillRect(fx + 2, fy, 4, flameLen);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(fx - 5, fy, 2, 2);
      ctx.fillRect(fx + 3, fy, 2, 2);
      if (dy >= 12) {
        this._drawAtlasText('TURBO!', baseCarX, dy - 10, boostPulse ? 'CYAN' : 'YELLOW', 1, 'center', 5);
      }
    } else if ((playerCar?.shiftCooldown > 0.05 || playerCar?.revBlipTimer > 0.03) && speedKmh > 95) {
      const fx = baseCarX + (steerFrameIdx - 2);
      const fy = dy + Math.round(dstH * 0.78);
      ctx.fillStyle = '#fce400';
      ctx.fillRect(fx - 5, fy, 3, 2);
      ctx.fillRect(fx + 2, fy, 3, 2);
    }

    // Inside-Front Brake Lockup Pixel Smoke!
    const tick = (nowSec * 32) | 0;
    if (lockSide !== 0) {
      for (const side of [-1, 1]) {
        if (lockSide !== 2 && lockSide !== side) continue;
        const lx = side < 0 ? dx + Math.round(10 * carScale) + shiftX : dx + dstW - Math.round(14 * carScale) + shiftX;
        const ly = dy + Math.round(15 * carScale);
        for (let p = 0; p < 5; p++) {
          ctx.fillStyle = (p & 1) === 0 ? '#ffffff' : '#dce8ff';
          ctx.fillRect(lx + ((p * 5 + tick) % 5) - 2, ly - 2 - p * 3, 4, 3);
        }
      }
    }

    // Wet Rooster-Tail Spray, Cornering Tire Smoke, Off-Track Grass Clods & Real Kerb/Bottoming Sparks!
    const leftTireX = dx + Math.round(dstW * 0.14);
    const rightTireX = dx + Math.round(dstW * 0.80);
    const tireBaseY = baseCarY - 3;
    const aquaplane = (playerCar?.aquaplaneTimer || 0) > 0;

    if (aquaplane || (wetness > 0.18 && speedKmh > 80)) {
      for (let p = 0; p < 7; p++) {
        const ox = (((p * 11 + tick * 3) % 11) - 5);
        const oy = -((p * 5 + tick * 2) % 14);
        ctx.fillStyle = (p & 1) === 0 ? '#78ccff' : '#e0f4ff';
        ctx.fillRect(leftTireX + ox, tireBaseY + oy, 3, 2);
        ctx.fillRect(rightTireX + ox, tireBaseY + oy, 3, 2);
      }
    } else if (skidVal > 0.24 && speedKmh > 40) {
      const puffs = Math.min(6, Math.ceil(skidVal * 6));
      for (let p = 0; p < puffs; p++) {
        const ox = (((p * 13 + tick * 5) % 9) - 4);
        const oy = -((p * 4 + tick * 3) % 8);
        ctx.fillStyle = (p & 1) === 0 ? '#f0f4fc' : '#b0bccf';
        ctx.fillRect(leftTireX + ox, tireBaseY + oy, 3, 2);
        ctx.fillRect(rightTireX + ox, tireBaseY + oy, 3, 2);
      }
    }

    if (playerCar?.onGrass && speedKmh > 25) {
      for (let p = 0; p < 5; p++) {
        const ox = (((p * 9 + tick * 7) % 11) - 5);
        const oy = -2 - ((p * 5 + tick * 4) % 11);
        ctx.fillStyle = (p & 1) === 0 ? '#00d828' : '#9c6c34';
        ctx.fillRect(leftTireX + ox, tireBaseY + oy, 2, 2);
        ctx.fillRect(rightTireX + ox, tireBaseY + oy, 2, 2);
      }
    }

    // Real Bottoming / Kerb / Wing-Drag Titanium Sparks ONLY (never fake constant >282 km/h sparks!)
    const bottomingOut = Math.abs(playerCar?.chassisHeaveM || 0) > 0.014 || ((dmg.fw > 0.35 || dmg.susp > 0.35) && speedKmh > 145);
    if ((playerCar?.onCurb && speedKmh > 105) || bottomingOut) {
      for (let p = 0; p < 5; p++) {
        const sx = baseCarX + (((p * 17 + tick * 9) % 26) - 13);
        const sy = tireBaseY - ((p * 7 + tick * 5) % 8);
        ctx.fillStyle = (p & 1) === 0 ? '#fce400' : '#ff6800';
        ctx.fillRect(sx, sy, 2, 1);
      }
    }
  }

  // Enhanced 7-Man 1982 Pixel Pit Crew (4 Wheel Gunners + Front/Rear Jacks + Overhead Fuel-Rig Mechanic + Nosecone Swap + Lollipop!)
  _renderPitStopCrewChase(W, H, dx, dy, dstW, dstH, baseCarX, baseCarY, pitProg, pitSub, playerCar, raceSystems, isBackPass, nowSec) {
    const ctx = this.ctx;
    const rushIn = pitProg < 0.14 ? (1.0 - pitProg / 0.14) : (pitProg > 0.88 ? (pitProg - 0.88) / 0.12 : 0.0);
    const rushPx = Math.round(clamp(rushIn, 0, 1) * 14);
    const gunActive = pitProg >= 0.16 && pitProg <= 0.80;
    const oldCompHex = this._resolveCompoundColor(playerCar?.compound || 'SOFT');
    const newCompHex = this._resolveCompoundColor(raceSystems?.playerPitPlan?.nextCompound || playerCar?.compound || 'MEDIUM');
    const repairingWing = (playerCar?.damage?.frontWing || 0) > 0.15 || (raceSystems?.playerPitPlan?.repairOrder && raceSystems.playerPitPlan.repairOrder !== 'NONE');

    if (isBackPass) {
      // Painted FIA Yellow Pit Stall Box
      ctx.fillStyle = '#fce400';
      ctx.fillRect(dx - 8, dy - 3, dstW + 16, 2);
      ctx.fillRect(dx - 8, dy - 3, 2, dstH + 6);
      ctx.fillRect(dx + dstW + 6, dy - 3, 2, dstH + 6);

      // Overhead Pit-Gantry Boom Arm & Compressed Air / Fuel Hoses
      const boomY = Math.max(32, dy - 18);
      ctx.fillStyle = '#dce4f2';
      ctx.fillRect(baseCarX - 18, boomY, Math.max(24, W - (baseCarX - 18)), 3);
      ctx.fillStyle = '#fc2818';
      ctx.fillRect(baseCarX - 16, boomY + 3, 36, 2);
      ctx.fillStyle = '#fce400';
      ctx.fillRect(dx - 3, boomY + 3, 1, Math.max(4, dy + 8 - boomY));
      ctx.fillRect(dx + dstW + 2, boomY + 3, 1, Math.max(4, dy + 8 - boomY));

      // Crew #5: Front Jack Man (+ Fresh Nosecone Slide-On when repairing Front Wing!)
      const fjX = baseCarX - 4;
      const fjY = dy - 14 - Math.round(rushPx * 0.5);
      ctx.fillStyle = '#fcfcfc';
      ctx.fillRect(fjX + 2, fjY, 5, 4);
      ctx.fillStyle = '#1858f8';
      ctx.fillRect(fjX + 2, fjY + 1, 5, 2);
      ctx.fillStyle = '#e01818';
      ctx.fillRect(fjX + 1, fjY + 4, 7, 8);
      ctx.fillStyle = '#fc2818';
      ctx.fillRect(baseCarX - 1, fjY + 8, 2, Math.max(3, dy + 4 - (fjY + 8)));

      if (repairingWing && pitProg >= 0.22 && pitProg <= 0.72) {
        const slideY = dy + Math.round((1.0 - clamp((pitProg - 0.22) / 0.45, 0, 1)) * -8);
        ctx.fillStyle = '#fcfcfc';
        ctx.fillRect(baseCarX - 12, slideY + 4, 24, 3);
        ctx.fillStyle = '#e4181c';
        ctx.fillRect(baseCarX - 4, slideY + 2, 8, 5);
      }

      // Lollipop Marshal (STOP -> 1ST -> GO!)
      const lolX = Math.max(4, dx - 22);
      const lolY = dy - 18;
      ctx.fillStyle = '#fce400';
      ctx.fillRect(lolX + 2, lolY + 6, 5, 4);
      ctx.fillStyle = '#1858f8';
      ctx.fillRect(lolX + 1, lolY + 10, 7, 10);
      const signX = baseCarX - 13;
      const signY = dy - 14 - (pitProg > 0.90 ? 6 : 0);
      ctx.fillStyle = '#dce4f2';
      ctx.fillRect(lolX + 7, lolY + 10, Math.max(4, signX - (lolX + 7)), 2);
      const isGo = pitProg > 0.88;
      const isGear1 = !isGo && pitProg > 0.68;
      ctx.fillStyle = '#0c1018';
      ctx.fillRect(signX, signY, 26, 10);
      ctx.fillStyle = isGo ? '#00fc58' : (isGear1 ? '#fce400' : '#ff2020');
      ctx.fillRect(signX + 1, signY + 1, 24, 8);
      this._drawAtlasText(isGo ? 'GO!' : (isGear1 ? '1ST' : 'STOP'), signX + 13, signY + 2, isGo || isGear1 ? 'WHITE' : 'YELLOW', 1, 'center', 5);
      return;
    }

    // Foreground Pass: Crew #1..4 Corner Wheel Gunners + Crew #6 Rear Jack Man + Crew #7 Overhead Refueler Mechanic!
    const wheelCorners = [
      { side: -1, wy: dy + Math.round(dstH * 0.18) },
      { side:  1, wy: dy + Math.round(dstH * 0.18) },
      { side: -1, wy: dy + Math.round(dstH * 0.68) },
      { side:  1, wy: dy + Math.round(dstH * 0.68) },
    ];
    const sparkTick = (nowSec * 36) | 0;
    for (let c = 0; c < 4; c++) {
      const wc = wheelCorners[c];
      const outward = rushPx * wc.side;
      const gx = wc.side < 0 ? (dx - 11 + outward) : (dx + dstW + 3 + outward);
      const gy = wc.wy;
      if (gx < -8 || gx > W + 8) continue;

      const spareX = wc.side < 0 ? gx - 6 : gx + 8;
      ctx.fillStyle = '#14161c';
      ctx.fillRect(spareX, gy + 2, 5, 8);
      ctx.fillStyle = pitProg < 0.50 ? newCompHex : oldCompHex;
      ctx.fillRect(spareX + 1, gy + 3, 3, 6);

      ctx.fillStyle = '#fcfcfc';
      ctx.fillRect(gx + 1, gy - 3, 5, 4);
      ctx.fillStyle = '#1858f8';
      ctx.fillRect(gx + 1, gy - 2, 5, 1);
      ctx.fillStyle = '#d8181c';
      ctx.fillRect(gx, gy + 1, 7, 8);
      ctx.fillStyle = '#202634';
      ctx.fillRect(wc.side < 0 ? gx + 5 : gx - 3, gy + 3, 5, 2);

      if (gunActive && ((sparkTick + c) & 1) === 0) {
        const spX = wc.side < 0 ? dx + 1 : dx + dstW - 3;
        ctx.fillStyle = ((sparkTick + c) % 4 === 0) ? '#54ecff' : '#fce400';
        ctx.fillRect(spX, gy + 2, 3, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(spX + (wc.side < 0 ? -2 : 2), gy + 4, 2, 1);
      }
    }

    // Crew #7: Dedicated Fuel-Rig Mechanic on Right Sidepod with Heavy Pressurized Fuel Hose!
    const refuelActive = pitProg >= 0.14 && pitProg <= 0.84;
    const rfX = dx + dstW + 10 + rushPx;
    const rfY = dy + Math.round(dstH * 0.42);
    if (rfX < W - 4) {
      // Silver fire-resistant hood + white/red Nomex suit
      ctx.fillStyle = '#dce4f2';
      ctx.fillRect(rfX + 1, rfY - 4, 6, 5);
      ctx.fillStyle = '#101828';
      ctx.fillRect(rfX + 1, rfY - 2, 4, 2);
      ctx.fillStyle = '#fcfcfc';
      ctx.fillRect(rfX, rfY + 1, 8, 9);
      ctx.fillStyle = '#e4181c';
      ctx.fillRect(rfX, rfY + 4, 8, 3);
      // Heavy black & silver pressurized fuel hose coupled to right sidepod filler neck!
      const neckX = dx + Math.round(dstW * 0.68);
      const neckY = dy + Math.round(dstH * 0.46);
      ctx.fillStyle = '#181c24';
      ctx.fillRect(neckX, neckY, Math.max(4, rfX + 2 - neckX), 3);
      ctx.fillStyle = '#b8c4d8';
      ctx.fillRect(neckX, neckY, 4, 3);
      if (refuelActive) {
        const pulseOff = ((nowSec * 24) | 0) % Math.max(3, rfX - neckX);
        ctx.fillStyle = '#00e8d8';
        ctx.fillRect(rfX - pulseOff, neckY + 1, 3, 1);
      }
    }

    // Crew #6: Rear Jack Man behind Diffuser
    const rjX = baseCarX - 4;
    const rjY = Math.min(H - 12, baseCarY - 4 + Math.round(rushPx * 0.4));
    ctx.fillStyle = '#fce400';
    ctx.fillRect(rjX + 2, rjY, 5, 4);
    ctx.fillStyle = '#d8181c';
    ctx.fillRect(rjX + 1, rjY + 4, 7, 6);
    ctx.fillStyle = '#dce4f2';
    ctx.fillRect(baseCarX - 1, baseCarY - 4, 2, 5);
  }

  // ==========================================================================
  // CAMERA 1: 1982 ROLL-HOOP OVERHEAD T-CAM (HALO-FREE + BELL STAR HELMET!)
  // ==========================================================================
  _renderTCamForeground(
    W, H, drawBottomY, playerCar, speedKmh, steerInput, distGame, mPerGameM,
    isRainy, wetness, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
  ) {
    const ctx = this.ctx;
    const bottomY = drawBottomY;
    const cx = W >> 1;
    const isNarrow = W < 245;
    const steerPx = Math.round(clamp(steerInput, -1, 1) * (isNarrow ? 5 : 7));
    const tirePhase = speedKmh > 1.0 ? (Math.floor(distGame * 4.6) & 1) : 0;
    const compHex = this._resolveCompoundColor(playerCar?.compound || 'SOFT');
    const dmg = this._readDamageProfile(playerCar);
    const flatInfo = this._readFlatSpotInfo(playerCar);
    const flatShudder = this._computeWheelFreqShudder(flatInfo.maxFlat, speedKmh, nowSec);
    const lockSide = this._readFrontLockupSide(playerCar);
    const wheelRotPhase = (distGame * mPerGameM) / 2.073;

    const wComp = Array.isArray(playerCar?.wheelCompression) ? playerCar.wheelCompression : null;
    const curbJolt = (playerCar?.onCurb && speedKmh > 25 && (((nowSec * 40) | 0) & 1)) ? -2 : 0;
    const flBounce = curbJolt + flatShudder - Math.round(clamp(wComp ? wComp[0] : 0, -0.5, 0.8) * 4) + (dmg.susp > 0.20 && dmg.suspSide < 0 ? 2 : 0);
    const frBounce = -curbJolt + flatShudder - Math.round(clamp(wComp ? wComp[1] : 0, -0.5, 0.8) * 4) + (dmg.susp > 0.20 && dmg.suspSide > 0 ? 2 : 0);

    const spanHalf = isNarrow ? 74 : Math.min(Math.round(W * 0.36), 124);
    const wheelW = isNarrow ? 17 : 24;
    const wheelH = isNarrow ? 30 : 38;
    const wheelBaseY = bottomY - wheelH - 6;

    // Chrome Double-Wishbones (with bent kink when suspension damaged)
    this._drawChromeWishbones(cx - spanHalf + wheelW - 1 + steerPx, cx - 10, wheelBaseY + 11 + flBounce, wheelBaseY + 22 + flBounce, dmg.susp > 0.20 && dmg.suspSide < 0);
    this._drawChromeWishbones(cx + 10, cx + spanHalf - wheelW + 1 + steerPx, wheelBaseY + 11 + frBounce, wheelBaseY + 22 + frBounce, dmg.susp > 0.20 && dmg.suspSide > 0);

    // Exposed Steered/Spinning Front Slicks
    const brakingHot = (playerCar?.brakeInput || 0) > 0.18 && speedKmh > 65;
    const flLife = playerCar?.tires?.FL?.life ?? 1;
    const frLife = playerCar?.tires?.FR?.life ?? 1;
    this._drawExposedFrontSlick(
      cx - spanHalf + steerPx, wheelBaseY + flBounce, wheelW, wheelH, -1,
      tirePhase, compHex, flLife, flatInfo.fl, wheelRotPhase, brakingHot,
      lockSide === -1 || lockSide === 2, wetness, speedKmh, nowSec
    );
    this._drawExposedFrontSlick(
      cx + spanHalf - wheelW + steerPx, wheelBaseY + frBounce, wheelW, wheelH, 1,
      tirePhase, compHex, frLife, flatInfo.fr, wheelRotPhase + 0.35, brakingHot,
      lockSide === 1 || lockSide === 2, wetness, speedKmh, nowSec
    );

    // Tapered Crimson/White/Blue #1 Nosecone (100% HALO-FREE!)
    const noseTopY = bottomY - (isNarrow ? 46 : 54);
    for (let row = 0; row < bottomY - noseTopY; row++) {
      const t = row / Math.max(1, bottomY - noseTopY);
      const halfW = Math.round(5 + t * (isNarrow ? 14 : 20));
      const ny = noseTopY + row;
      const nx = cx + Math.round((1.0 - t) * steerPx * 0.35);
      ctx.fillStyle = '#a40c14';
      ctx.fillRect(nx - halfW, ny, halfW * 2, 1);
      ctx.fillStyle = '#e81c24';
      ctx.fillRect(nx - halfW + 2, ny, Math.max(2, (halfW - 2) * 2), 1);
      if (t > 0.16 && t < 0.70) {
        ctx.fillStyle = '#fcfcfc';
        ctx.fillRect(nx - 4, ny, 8, 1);
      }
    }
    this._drawAtlasText('1', cx, noseTopY + 12, 'RED', 1, 'center', 5);

    // Classic 1982 White/Royal-Blue Bell Star Driver Helmet Crown at Bottom Center (vibrates subtly on kerbs!)
    const helmVibY = curbJolt ? 1 : 0;
    const helmLeanX = Math.round(clamp(steerInput, -1, 1) * 2);
    ctx.fillStyle = '#10141e';
    ctx.fillRect(cx - 14 + helmLeanX, bottomY - 16 + helmVibY, 28, 16);
    ctx.fillStyle = '#fcfcfc';
    ctx.fillRect(cx - 12 + helmLeanX, bottomY - 15 + helmVibY, 24, 15);
    ctx.fillRect(cx - 9 + helmLeanX, bottomY - 17 + helmVibY, 18, 2);
    ctx.fillStyle = '#1858f8';
    ctx.fillRect(cx - 12 + helmLeanX, bottomY - 11 + helmVibY, 24, 3);
    ctx.fillStyle = '#e4181c';
    ctx.fillRect(cx - 2 + helmLeanX, bottomY - 17 + helmVibY, 4, 17);

    if (isPitServiceActive) {
      const pitInfo = this._resolvePitProgressAndLabel(playerCar, pitServiceSubPhase, nowSec);
      const isGo = pitInfo.prog > 0.88;
      ctx.fillStyle = isGo ? '#00fc58' : '#ff2020';
      ctx.fillRect(cx - 14, noseTopY - 14, 28, 10);
      this._drawAtlasText(isGo ? 'GO!' : 'PIT', cx, noseTopY - 12, 'WHITE', 1, 'center', 5);
    }
  }

  // ==========================================================================
  // CAMERA 2: ZERO-OVERLAP 1982 OPEN COCKPIT VIEW (NO HALO, CLEAR MIRRORS & DASH!)
  // ==========================================================================
  _renderCockpitViewForeground(
    W, H, drawBottomY, horizonY, playerCar, allCars, pS, pLat, mPerGameM, speedKmh, steerInput, distGame,
    isRainy, wetness, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
  ) {
    const ctx = this.ctx;
    const B = drawBottomY; // 240 on Landscape; round(H*0.75) e.g. 262 on Portrait!
    const isNarrow = W < 256; // Portrait W=196 & narrow square viewports
    const tubCx = W >> 1;

    let pitProg = 0;
    if (isPitServiceActive) {
      pitProg = this._resolvePitProgressAndLabel(playerCar, pitServiceSubPhase, nowSec).prog;
    }
    const activeCompName = (isPitServiceActive && pitProg >= 0.52 && raceSystems?.playerPitPlan?.nextCompound)
      ? raceSystems.playerPitPlan.nextCompound
      : (playerCar?.compound || 'SOFT');
    const compHex = this._resolveCompoundColor(activeCompName);

    const dmg = this._readDamageProfile(playerCar);
    const flatInfo = this._readFlatSpotInfo(playerCar);
    const flatShudder = this._computeWheelFreqShudder(flatInfo.maxFlat, speedKmh, nowSec, playerCar);
    const lockSide = this._readFrontLockupSide(playerCar);
    const fuelInfo = this._readFuelProfile(playerCar);
    const wheelRotPhase = this._readWheelRotPhase(playerCar, distGame, mPerGameM);
    const tirePhase = speedKmh > 1.0 ? (Math.floor(distGame * 4.8) & 1) : 0;

    const wComp = Array.isArray(playerCar?.wheelCompression) ? playerCar.wheelCompression : null;
    const curbShake = (playerCar?.onCurb && speedKmh > 20) ? ((((nowSec * 44) | 0) & 1) ? -1 : 1) : 0;
    const flBounce = clamp(curbShake + flatShudder - Math.round(clamp(wComp ? wComp[0] : 0, -0.5, 0.8) * 3) + (dmg.susp > 0.20 && dmg.suspSide < 0 ? 2 : 0), -3, 3);
    const frBounce = clamp(-curbShake + flatShudder - Math.round(clamp(wComp ? wComp[1] : 0, -0.5, 0.8) * 3) + (dmg.susp > 0.20 && dmg.suspSide > 0 ? 2 : 0), -3, 3);

    // ------------------------------------------------------------------------
    // 1. Wide-Stance Exposed Front Slicks & Chrome Double-Wishbones
    //    Landscape W=320: x = 10..34 +- 5 -> [5..39] & [281..315], y = B-72..B-38 (168..202)
    //    Portrait  W=196: x =  7..22 +- 3 -> [4..25] & [171..192], y = B-62..B-36 (200..226)
    // ------------------------------------------------------------------------
    const cowlTopY = B - (isNarrow ? 34 : 38); // 202 Landscape / 228 Portrait
    const wheelW = isNarrow ? 15 : 24;
    const wheelH = isNarrow ? 26 : 34;
    const steerMax = isNarrow ? 3 : 5;
    const steerPx = clamp(Math.round(clamp(steerInput, -1, 1) * steerMax), -steerMax, steerMax);

    const leftWheelBaseX = isNarrow
      ? 7
      : Math.max(10, tubCx - Math.min(Math.round(W * 0.43125), 156) - (wheelW >> 1));
    const rightWheelBaseX = W - leftWheelBaseX - wheelW;
    const leftWx = leftWheelBaseX + steerPx;
    const rightWx = rightWheelBaseX + steerPx;
    const wheelBaseY = B - (isNarrow ? 62 : 72);

    // Chrome Double-Wishbones & Tie-Rods (drawn behind mirror stalks!)
    const armUpperY = B - (isNarrow ? 44 : 52);
    const armLowerY = B - (isNarrow ? 38 : 43);
    this._drawChromeWishbones(
      leftWx + wheelW - 1,
      tubCx - (isNarrow ? 15 : 22),
      armUpperY + flBounce,
      armLowerY + flBounce,
      dmg.susp > 0.20 && dmg.suspSide < 0
    );
    this._drawChromeWishbones(
      tubCx + (isNarrow ? 15 : 22),
      rightWx + 1,
      armUpperY + frBounce,
      armLowerY + frBounce,
      dmg.susp > 0.20 && dmg.suspSide > 0
    );

    const brakingHot = (playerCar?.brakeInput || 0) > 0.18 && speedKmh > 65;
    const flLife = (isPitServiceActive && pitProg >= 0.52) ? 1.0 : this._readCornerTireLife(playerCar, 'FL', 0);
    const frLife = (isPitServiceActive && pitProg >= 0.52) ? 1.0 : this._readCornerTireLife(playerCar, 'FR', 1);

    this._drawExposedFrontSlick(
      leftWx, wheelBaseY + flBounce, wheelW, wheelH, -1,
      tirePhase, compHex, flLife, isPitServiceActive && pitProg >= 0.52 ? 0 : flatInfo.fl,
      wheelRotPhase, brakingHot, lockSide === -1 || lockSide === 2, wetness, speedKmh, nowSec
    );
    this._drawExposedFrontSlick(
      rightWx, wheelBaseY + frBounce, wheelW, wheelH, 1,
      tirePhase, compHex, frLife, isPitServiceActive && pitProg >= 0.52 ? 0 : flatInfo.fr,
      wheelRotPhase + 0.35, brakingHot, lockSide === 1 || lockSide === 2, wetness, speedKmh, nowSec
    );

    // ------------------------------------------------------------------------
    // 2. Low-Profile 1982 #1 Nosecone Crest & Smoked Windscreen Lip (ZERO HALO!)
    //    Opens >= 70% completely unobstructed forward road & horizon sightline!
    // ------------------------------------------------------------------------
    const noseTipY = cowlTopY - (isNarrow ? 10 : 12); // 190 Landscape / 218 Portrait
    for (let y = noseTipY; y <= cowlTopY; y++) {
      const frac = (y - noseTipY) / Math.max(1, cowlTopY - noseTipY);
      const halfW = Math.round((isNarrow ? 9 : 13) + frac * (isNarrow ? 14 : 22));
      ctx.fillStyle = '#9c0c14';
      ctx.fillRect(tubCx - halfW, y, halfW * 2, 1);
      ctx.fillStyle = '#e41820';
      ctx.fillRect(tubCx - halfW + 2, y, Math.max(2, (halfW - 2) * 2), 1);
      const stripeHalf = Math.max(2, Math.round(2 + frac * 3));
      ctx.fillStyle = '#fcfcfc';
      ctx.fillRect(tubCx - stripeHalf, y, stripeHalf * 2, 1);
      ctx.fillStyle = '#1858f8';
      ctx.fillRect(tubCx - stripeHalf - 1, y, 1, 1);
      ctx.fillRect(tubCx + stripeHalf, y, 1, 1);
    }
    this._drawAtlasText('1', tubCx, cowlTopY - 9, 'RED', 1, 'center', 5);

    // Translucent smoked polycarbonate windscreen lip + cyan specular top rim
    const lipHalfW = isNarrow ? 34 : 48;
    ctx.fillStyle = 'rgba(20, 40, 72, 0.52)';
    ctx.fillRect(tubCx - lipHalfW, cowlTopY - 3, lipHalfW * 2, 3);
    ctx.fillStyle = '#88d8ff';
    ctx.fillRect(tubCx - lipHalfW + 2, cowlTopY - 3, (lipHalfW - 2) * 2, 1);

    // Pit Crew Lollipop & Air-Gun Sparks visible outside open cockpit during Pit Service!
    if (isPitServiceActive) {
      const isGo = pitProg > 0.88;
      const isGear1 = !isGo && pitProg > 0.68;
      const signY = noseTipY - 15 - (isGo ? 4 : 0);
      ctx.fillStyle = '#0c1018';
      ctx.fillRect(tubCx - 16, signY, 32, 11);
      ctx.fillStyle = isGo ? '#00fc58' : (isGear1 ? '#fce400' : '#ff2020');
      ctx.fillRect(tubCx - 15, signY + 1, 30, 9);
      this._drawAtlasText(isGo ? 'GO!' : (isGear1 ? '1ST' : 'STOP'), tubCx, signY + 2, 'WHITE', 1, 'center', 5);
      if (pitProg >= 0.16 && pitProg <= 0.80 && (((nowSec * 32) | 0) & 1) === 0) {
        ctx.fillStyle = '#54ecff';
        ctx.fillRect(leftWx + wheelW + 1, wheelBaseY + 12, 4, 3);
        ctx.fillRect(rightWx - 5, wheelBaseY + 12, 4, 3);
      }
    }

    // ------------------------------------------------------------------------
    // 3. Inboard Cowling-Shoulder Bullet Wing Mirrors (>= 8px Clear Gap at Full Lock!)
    //    Landscape W=320: x = 54..90 & 230..266 (15px gap from tires 39 & 281!)
    //    Portrait  W=196: x = 34..59 & 137..162 ( 9px gap from tires 25 & 171!)
    // ------------------------------------------------------------------------
    const maxLeftTireRightX = leftWheelBaseX + wheelW + steerMax;
    this._renderCockpitWingMirrors(
      W, tubCx, cowlTopY, maxLeftTireRightX, flatShudder,
      allCars, pS, pLat, mPerGameM, isNarrow, isRainy, nowSec
    );

    // ------------------------------------------------------------------------
    // 4. Riveted Aluminum/Carbon Cowling & Elevated Pixel Instrument Binnacle
    //    Strictly inside y = [cowlTopY+1 .. B-24] (203..216 Landscape / 229..240 Portrait)
    // ------------------------------------------------------------------------
    ctx.fillStyle = '#10141e';
    ctx.fillRect(0, cowlTopY, W, B - cowlTopY);
    ctx.fillStyle = '#c8141c';
    ctx.fillRect(0, cowlTopY, W, 2);
    // Riveted brushed-aluminum center coaming surround
    const coamHalfW = isNarrow ? 94 : 104;
    ctx.fillStyle = '#1e2534';
    ctx.fillRect(tubCx - coamHalfW, cowlTopY + 2, coamHalfW * 2, B - cowlTopY - 2);
    ctx.fillStyle = '#b8c4d8';
    for (let rx = -coamHalfW + 6; rx <= coamHalfW - 6; rx += (isNarrow ? 28 : 32)) {
      if (Math.abs(rx) > 16) ctx.fillRect(tubCx + rx, cowlTopY + 3, 1, 1);
    }

    const dashTopY = cowlTopY + 1;               // 203 Landscape / 229 Portrait
    const dashH = isNarrow ? 11 : 13;            // Bottom at 216 Landscape / 240 Portrait!
    const dashHalfW = isNarrow ? 92 : 98;
    const dashX = tubCx - dashHalfW;
    const dashW = dashHalfW * 2;

    ctx.fillStyle = '#060810';
    ctx.fillRect(dashX, dashTopY, dashW, dashH);
    ctx.fillStyle = '#44526a';
    ctx.fillRect(dashX, dashTopY, dashW, 1);
    ctx.fillRect(dashX, dashTopY + dashH - 1, dashW, 1);

    // Center Pod: 13-LED F1 RPM Shift-Light Strip (5..13k RPM -> Blue Strobe!)
    const rpm = playerCar?.rpm || 4000;
    const rpmFrac = clamp((rpm - 4200) / (12200 - 4200), 0, 1);
    const ledsLit = Math.round(rpmFrac * 13);
    const blueStrobe = rpm >= 11500 && (((nowSec * 24) | 0) & 1) === 0;
    const ledStep = isNarrow ? 5 : 5;
    const ledTotalW = 13 * ledStep - 1;
    const ledStartX = tubCx - (ledTotalW >> 1);
    const ledY = dashTopY + 2;
    for (let l = 0; l < 13; l++) {
      let lCol = '#18202e';
      if (l < ledsLit) {
        if (blueStrobe) lCol = '#38e0ff';
        else if (l < 5) lCol = '#00fc58';
        else if (l < 9) lCol = '#fce400';
        else lCol = '#ff2020';
      }
      ctx.fillStyle = lCol;
      ctx.fillRect(ledStartX + l * ledStep, ledY, 4, 3);
    }

    // Left Pod: Segmented FUEL Bar + 4-Corner Tire Wear/Temp/Flat-Spot Mini Matrix!
    const leftPodX = dashX + 3;
    const fuelPips = isNarrow ? 6 : 8;
    const litFuel = Math.ceil(fuelInfo.frac * fuelPips);
    const lowFuelBlink = fuelInfo.lowFuel && (((nowSec * 8) | 0) & 1) === 0;
    for (let fp = 0; fp < fuelPips; fp++) {
      let fCol = '#182230';
      if (fp < litFuel) {
        fCol = fuelInfo.lowFuel ? (lowFuelBlink ? '#ff2020' : '#501010') : (fuelInfo.frac < 0.26 ? '#fc8418' : '#00e8d8');
      } else if (fuelInfo.lowFuel && lowFuelBlink) {
        fCol = '#ff2020';
      }
      ctx.fillStyle = fCol;
      ctx.fillRect(leftPodX + fp * 4, dashTopY + 2, 3, 3);
    }
    // 4-Tire Mini Matrix + Wing Status Bar (strictly inside dashTopY + 6 .. dashTopY + dashH - 2)
    const tires = playerCar?.tires || null;
    const tempsArr = Array.isArray(playerCar?.tireTempsC) ? playerCar.tireTempsC : null;
    const mtxX = leftPodX + (isNarrow ? 26 : 35);
    const mtxY = dashTopY + 2;
    ctx.fillStyle = this._resolveTirePixelColor(tires?.FL, tempsArr ? tempsArr[0] : undefined, nowSec);
    ctx.fillRect(mtxX, mtxY, 4, 4);
    ctx.fillStyle = this._resolveTirePixelColor(tires?.FR, tempsArr ? tempsArr[1] : undefined, nowSec);
    ctx.fillRect(mtxX + 7, mtxY, 4, 4);
    ctx.fillStyle = this._resolveTirePixelColor(tires?.RL, tempsArr ? tempsArr[2] : undefined, nowSec);
    ctx.fillRect(mtxX, mtxY + 5, 4, 4);
    ctx.fillStyle = this._resolveTirePixelColor(tires?.RR, tempsArr ? tempsArr[3] : undefined, nowSec);
    ctx.fillRect(mtxX + 7, mtxY + 5, 4, 4);
    // Wing integrity spine between mini tires
    ctx.fillStyle = (dmg.fwLeftOut || dmg.fwRightOut) ? '#ff2020' : '#00fc58';
    ctx.fillRect(mtxX + 4, mtxY, 3, 2);
    ctx.fillStyle = dmg.rwAskew ? '#ff2020' : (playerCar?.drsActive ? '#00e8d8' : '#00fc58');
    ctx.fillRect(mtxX + 4, mtxY + 7, 3, 2);
    if (!isNarrow) {
      this._drawAtlasText(fuelInfo.lowFuel && lowFuelBlink ? 'LOW' : 'FUL', leftPodX, dashTopY + 5, fuelInfo.lowFuel ? 'RED' : 'CYAN', 1, 'left', 5);
    }

    // Right Pod: Digital KM/H Speed + Gear (L/H or G1..G8) strictly inside dashTopY..dashTopY+dashH!
    const is2Spd = (playerCar?.gearboxMode || '') === 'CLASSIC_2SPD';
    const gStr = is2Spd ? ((playerCar?.gear || 1) > 1 ? 'H' : 'L') : `${playerCar?.gear || 1}`;
    const spdTxt = String(Math.round(speedKmh)).padStart(3, ' ');
    const textRowY = isNarrow ? (dashTopY + 2) : (dashTopY + 4);
    const rightPodRight = dashX + dashW - 3;
    this._drawAtlasText(gStr, rightPodRight, textRowY, 'YELLOW', 1, 'right', 5);
    this._drawAtlasText(spdTxt, rightPodRight - (gStr.length * 5 + 3), textRowY, 'WHITE', 1, 'right', 5);

    // Center-bottom mini Boost / ERS bar inside binnacle (y = dashTopY + dashH - 3)
    const boostVal = is2Spd
      ? clamp((playerCar?.turboBoostBar || 0) / 1.8, 0, 1)
      : clamp(Number.isFinite(playerCar?.ersCharge) ? playerCar.ersCharge : 0.85, 0, 1);
    ctx.fillStyle = '#141c2c';
    ctx.fillRect(ledStartX, dashTopY + dashH - 4, ledTotalW, 2);
    ctx.fillStyle = is2Spd ? '#fce400' : (playerCar?.ersDeploying ? '#ffffff' : '#00e8d8');
    ctx.fillRect(ledStartX, dashTopY + dashH - 4, Math.round(ledTotalW * boostVal), 2);

    // ------------------------------------------------------------------------
    // 5. Lowered 9-Angle 3-Spoke Suede MOMO Wheel & Nomex Gloves (0 px Overlap!)
    //    Landscape B=240: top painted rim/glove sits at y = 218..240 (Dash ends at 216!)
    //    Portrait  B=262: top painted rim/glove sits at y = 242..262 (Dash ends at 240!)
    //    Includes persistent steering-wheel pull offset when suspension is bent!
    // ------------------------------------------------------------------------
    const suspPullOffset = dmg.susp > 0.20 ? (-dmg.suspSide * clamp(dmg.susp * 0.48, 0.14, 0.45)) : 0;
    const visualWheelSteer = clamp(steerInput + suspPullOffset, -1, 1);
    const wheelAngleIdx = clamp(Math.round(visualWheelSteer * 4) + 4, 0, 8);
    const wheelSprite = this._momoWheelSprites[wheelAngleIdx];
    if (wheelSprite) {
      const wScale = isNarrow ? 0.78 : 0.92;
      const sw = Math.round(wheelSprite.width * wScale);
      // Crop from srcTop = 10 (exact top of MOMO rim) so visible height fits B-22..B (Landscape) / B-20..B (Portrait)!
      const srcTop = 10;
      const visTargetH = clamp((isNarrow ? 20 : 22) - flatShudder, 18, 23); // symmetric +-1px flat-spot shudder, strictly > dash bottom!
      const srcVisH = Math.min(wheelSprite.height - srcTop, Math.round(visTargetH / wScale));
      const dstWheelY = B - visTargetH; // 217..219 Landscape (dash ends 215!) / 241..243 Portrait (dash ends 239!)
      ctx.drawImage(
        wheelSprite,
        0, srcTop, wheelSprite.width, srcVisH,
        Math.round(tubCx - sw * 0.5), dstWheelY, sw, visTargetH
      );
    }

    // Re-seal Portrait lower touch-control apron cleanly below B
    if (H > 275 && B < H) {
      ctx.fillStyle = '#070a12';
      ctx.fillRect(0, B, W, H - B);
      ctx.fillStyle = '#1c2434';
      ctx.fillRect(0, B, W, 2);
    }
  }

  _renderCockpitWingMirrors(W, tubCx, cowlTopY, maxLeftTireRightX, flatShudder, allCars, pS, pLat, mPerGameM, isNarrow, isRainy, nowSec) {
    const ctx = this.ctx;
    const housingW = isNarrow ? 25 : 36;
    const housingH = isNarrow ? 12 : 15;
    const housingY = cowlTopY - housingH - (isNarrow ? 4 : 3) + flatShudder; // 184..199 Landscape / 212..224 Portrait

    // Strictly enforce >= 8px clear gap from full-lock front slicks on EVERY viewport!
    const leftHousingX = isNarrow
      ? Math.max(maxLeftTireRightX + 9, tubCx - 64)
      : Math.max(maxLeftTireRightX + 8, tubCx - 106);
    const rightHousingX = W - leftHousingX - housingW;

    // Select up to 2 closest trailing rivals within 55m behind (zero-alloc scalar slots!)
    let d0 = 999, lat0 = 0, pal0 = 0;
    let d1 = 999, lat1 = 0, pal1 = 0;
    if (Array.isArray(allCars)) {
      for (let i = 0; i < allCars.length; i++) {
        const c = allCars[i];
        if (!c || c.isPlayer || c.exploded) continue;
        const behindReal = forwardDeltaS(c.s || 0, pS) * mPerGameM;
        if (behindReal <= 0.6 || behindReal >= 55.0) continue;
        const rLat = (c.lateralOffset || 0) - pLat;
        const mapped = this._rivalNumToPalIdx.get(c.carNum);
        const pIdx = mapped !== undefined ? mapped : (Math.abs((c.carNum || i) + i) % this._rivalSprites.length);
        if (behindReal < d0) {
          d1 = d0; lat1 = lat0; pal1 = pal0;
          d0 = behindReal; lat0 = rLat; pal0 = pIdx;
        } else if (behindReal < d1) {
          d1 = behindReal; lat1 = rLat; pal1 = pIdx;
        }
      }
    }

    const tirePhase = ((nowSec * 16) | 0) & 1;

    for (let m = 0; m < 2; m++) {
      const isLeft = m === 0;
      const hx = isLeft ? leftHousingX : rightHousingX;

      // Inboard aerodynamic bullet stalk mounting cleanly to cowling shoulder
      ctx.fillStyle = '#202634';
      const stalkX = isLeft ? hx + housingW - 6 : hx + 2;
      ctx.fillRect(stalkX, housingY + housingH, 4, Math.max(2, cowlTopY - (housingY + housingH) + 2));

      // Crimson bullet mirror shell + 1px black inner bezel
      ctx.fillStyle = '#c8141c';
      ctx.fillRect(hx, housingY, housingW, housingH);
      ctx.fillStyle = '#ff6860';
      ctx.fillRect(hx + 1, housingY, housingW - 2, 1);
      ctx.fillStyle = '#0a0e16';
      ctx.fillRect(hx + 1, housingY + 1, housingW - 2, housingH - 2);

      const gx = hx + 2;
      const gy = housingY + 2;
      const gw = housingW - 4;
      const gh = housingH - 4;
      const midGy = gy + (gh >> 1);

      // Hardware-clipped optical rear-view reflection!
      ctx.save();
      ctx.beginPath();
      ctx.rect(gx, gy, gw, gh);
      ctx.clip();

      ctx.fillStyle = isRainy ? '#3e5878' : '#4890fc';
      ctx.fillRect(gx, gy, gw, gh >> 1);
      ctx.fillStyle = '#00981c';
      ctx.fillRect(gx, midGy, gw, gh - (gh >> 1));

      // Receding reflected grey tarmac + red/white kerbs shifted by player's lateral offset
      const roadShiftPx = Math.round(clamp(pLat / ROAD_HALF_WIDTH, -1, 1) * (gw * 0.25));
      const mRoadL = gx + 3 + roadShiftPx;
      const mRoadW = Math.max(6, gw - 6);
      ctx.fillStyle = isRainy ? '#323c4e' : '#5e626c';
      ctx.fillRect(mRoadL, midGy, mRoadW, gh - (gh >> 1));
      ctx.fillStyle = (((nowSec * 14) | 0) & 1) === 0 ? '#d82800' : '#fcfcfc';
      ctx.fillRect(mRoadL - 1, midGy, 1, gh - (gh >> 1));
      ctx.fillRect(mRoadL + mRoadW, midGy, 1, gh - (gh >> 1));

      // Blit actual cached rival car sprites inside mirror glass!
      let closeAlert = false;
      for (let slot = 1; slot >= 0; slot--) {
        const dist = slot === 1 ? d1 : d0;
        if (dist >= 55.0) continue;
        const rLat = slot === 1 ? lat1 : lat0;
        const pIdx = slot === 1 ? pal1 : pal0;
        if (isLeft && rLat > 3.8) continue;
        if (!isLeft && rLat < -3.8) continue;
        if (dist < 13.0) closeAlert = true;

        const rivalSprite = this._rivalSprites[pIdx]?.[1]?.[tirePhase];
        const mScale = clamp(10.5 / (dist + 3.5), 0.22, 0.92);
        const cw = Math.max(5, Math.round(gw * 0.62 * mScale));
        const ch = Math.max(3, Math.round(cw * 0.55));
        const biasLat = isLeft ? (rLat + 2.0) : (rLat - 2.0);
        const carCx = Math.round(gx + gw * 0.5 + (biasLat / 7.2) * (gw * 0.42));
        const carBot = Math.round(midGy + 2 + mScale * ((gh >> 1) - 1));
        if (rivalSprite) {
          ctx.drawImage(rivalSprite, Math.round(carCx - cw * 0.5), carBot - ch, cw, ch);
        }
      }
      ctx.restore();

      if (closeAlert && (((nowSec * 14) | 0) & 1) === 0) {
        ctx.fillStyle = '#fce400';
        ctx.fillRect(isLeft ? hx + 1 : hx + housingW - 3, housingY + 1, 2, 2);
      }
    }
  }

  // ==========================================================================
  // CAMERA 3: BONNET / COWLING BULKHEAD CAM (CLEAN WORKING SUSPENSION & NOSE!)
  // ==========================================================================
  _renderBonnetCamForeground(
    W, H, drawBottomY, playerCar, speedKmh, steerInput, distGame, mPerGameM,
    isRainy, wetness, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
  ) {
    const ctx = this.ctx;
    const B = drawBottomY;
    const isNarrow = W < 256;
    const cx = W >> 1;
    const steerPx = Math.round(clamp(steerInput, -1, 1) * (isNarrow ? 4 : 6));
    const tirePhase = speedKmh > 1.0 ? (Math.floor(distGame * 4.8) & 1) : 0;
    const compHex = this._resolveCompoundColor(playerCar?.compound || 'SOFT');
    const dmg = this._readDamageProfile(playerCar);
    const flatInfo = this._readFlatSpotInfo(playerCar);
    const flatShudder = this._computeWheelFreqShudder(flatInfo.maxFlat, speedKmh, nowSec);
    const lockSide = this._readFrontLockupSide(playerCar);
    const wheelRotPhase = (distGame * mPerGameM) / 2.073;

    const wComp = Array.isArray(playerCar?.wheelCompression) ? playerCar.wheelCompression : null;
    const curbShake = (playerCar?.onCurb && speedKmh > 22 && (((nowSec * 42) | 0) & 1)) ? -2 : 0;
    const flBounce = curbShake + flatShudder - Math.round(clamp(wComp ? wComp[0] : 0, -0.5, 0.8) * 4) + (dmg.susp > 0.20 && dmg.suspSide < 0 ? 2 : 0);
    const frBounce = -curbShake + flatShudder - Math.round(clamp(wComp ? wComp[1] : 0, -0.5, 0.8) * 4) + (dmg.susp > 0.20 && dmg.suspSide > 0 ? 2 : 0);

    const wheelW = isNarrow ? 16 : 26;
    const wheelH = isNarrow ? 28 : 36;
    const leftBaseX = isNarrow ? 6 : Math.max(8, cx - Math.min(Math.round(W * 0.42), 152) - (wheelW >> 1));
    const rightBaseX = W - leftBaseX - wheelW;
    const wheelBaseY = B - wheelH - 4;

    // Front Wing Endplate Tips Peeking Ahead of Front Wheels (reflects L/R wing damage!)
    const fwY = wheelBaseY + wheelH - 10;
    if (!dmg.fwLeftOut) {
      ctx.fillStyle = '#fcfcfc';
      ctx.fillRect(Math.max(1, leftBaseX + steerPx - 4), fwY + flBounce, 6, 6);
      ctx.fillStyle = '#e41820';
      ctx.fillRect(Math.max(1, leftBaseX + steerPx - 4), fwY - 2 + flBounce, 3, 8);
    }
    if (!dmg.fwRightOut) {
      ctx.fillStyle = '#fcfcfc';
      ctx.fillRect(Math.min(W - 7, rightBaseX + wheelW + steerPx - 2), fwY + frBounce, 6, 6);
      ctx.fillStyle = '#e41820';
      ctx.fillRect(Math.min(W - 4, rightBaseX + wheelW + steerPx + 1), fwY - 2 + frBounce, 3, 8);
    }

    // Working Chrome Double-Wishbones & Pushrods
    this._drawChromeWishbones(
      leftBaseX + wheelW - 1 + steerPx, cx - (isNarrow ? 14 : 20),
      wheelBaseY + 10 + flBounce, wheelBaseY + 21 + flBounce,
      dmg.susp > 0.20 && dmg.suspSide < 0
    );
    this._drawChromeWishbones(
      cx + (isNarrow ? 14 : 20), rightBaseX + 1 + steerPx,
      wheelBaseY + 10 + frBounce, wheelBaseY + 21 + frBounce,
      dmg.susp > 0.20 && dmg.suspSide > 0
    );

    const brakingHot = (playerCar?.brakeInput || 0) > 0.18 && speedKmh > 65;
    const flLife = playerCar?.tires?.FL?.life ?? 1;
    const frLife = playerCar?.tires?.FR?.life ?? 1;
    this._drawExposedFrontSlick(
      leftBaseX + steerPx, wheelBaseY + flBounce, wheelW, wheelH, -1,
      tirePhase, compHex, flLife, flatInfo.fl, wheelRotPhase, brakingHot,
      lockSide === -1 || lockSide === 2, wetness, speedKmh, nowSec
    );
    this._drawExposedFrontSlick(
      rightBaseX + steerPx, wheelBaseY + frBounce, wheelW, wheelH, 1,
      tirePhase, compHex, frLife, flatInfo.fr, wheelRotPhase + 0.35, brakingHot,
      lockSide === 1 || lockSide === 2, wetness, speedKmh, nowSec
    );

    // Clean Forward Bulkhead & Tapered #1 Nosecone (Zero Halo, Zero Mirrors, Zero Wheel!)
    const noseTipY = B - (isNarrow ? 38 : 44);
    for (let y = noseTipY; y < B; y++) {
      const frac = (y - noseTipY) / Math.max(1, B - noseTipY);
      const halfW = Math.round((isNarrow ? 8 : 11) + frac * (isNarrow ? 22 : 32));
      ctx.fillStyle = '#9c0c14';
      ctx.fillRect(cx - halfW, y, halfW * 2, 1);
      ctx.fillStyle = '#e41820';
      ctx.fillRect(cx - halfW + 2, y, Math.max(2, (halfW - 2) * 2), 1);
      const sHalf = Math.max(2, Math.round(2 + frac * 5));
      ctx.fillStyle = '#fcfcfc';
      ctx.fillRect(cx - sHalf, y, sHalf * 2, 1);
      ctx.fillStyle = '#1858f8';
      ctx.fillRect(cx - sHalf - 1, y, 1, 1);
      ctx.fillRect(cx + sHalf, y, 1, 1);
    }
    this._drawAtlasText('1', cx, B - 22, 'RED', 1, 'center', 5);
  }

  // ==========================================================================
  // CAMERA 4: LOW ASPHALT NOSE / FRONT-WING CAM (CLAMPED TIRES + WING DAMAGE!)
  // ==========================================================================
  _renderNoseCamForeground(
    W, H, drawBottomY, playerCar, speedKmh, steerInput, distGame, mPerGameM,
    isRainy, wetness, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
  ) {
    const ctx = this.ctx;
    const B = drawBottomY;
    const isNarrow = W < 256;
    const steerPx = Math.round(clamp(steerInput, -1, 1) * 5);
    const tirePhase = speedKmh > 1.0 ? (Math.floor(distGame * 5.0) & 1) : 0;
    const compHex = this._resolveCompoundColor(playerCar?.compound || 'SOFT');
    const dmg = this._readDamageProfile(playerCar);
    const flatInfo = this._readFlatSpotInfo(playerCar);
    const flatShudder = this._computeWheelFreqShudder(flatInfo.maxFlat, speedKmh, nowSec);
    const lockSide = this._readFrontLockupSide(playerCar);
    const wheelRotPhase = (distGame * mPerGameM) / 2.073;
    const brakingHot = (playerCar?.brakeInput || 0) > 0.18 && speedKmh > 65;

    const wingH = isNarrow ? 20 : 26;
    const wingW = isNarrow ? 46 : 72;
    const innerWheelW = isNarrow ? 12 : 16;
    const innerWheelH = isNarrow ? 28 : 34;

    for (let side = -1; side <= 1; side += 2) {
      // Clamp steered inner wheel edge so steerPx NEVER clips off-canvas!
      const rawWx = side < 0 ? (2 + steerPx) : (W - innerWheelW - 2 + steerPx);
      const wx = clamp(rawWx, 0, W - innerWheelW);
      const wy = B - innerWheelH - 4 + flatShudder;
      const life = side < 0 ? (playerCar?.tires?.FL?.life ?? 1) : (playerCar?.tires?.FR?.life ?? 1);
      const flat = side < 0 ? flatInfo.fl : flatInfo.fr;

      this._drawExposedFrontSlick(
        wx, wy, innerWheelW, innerWheelH, side,
        tirePhase, compHex, life, flat, wheelRotPhase + (side > 0 ? 0.35 : 0),
        brakingHot, lockSide === side || lockSide === 2, wetness, speedKmh, nowSec
      );

      // Multi-Element Front-Wing Flaps & Endplates (Visibly Snapped Off when Damaged!)
      const wingBroken = side < 0 ? dmg.fwLeftOut : dmg.fwRightOut;
      const effWingW = wingBroken ? Math.round(wingW * 0.55) : wingW;
      const fx = side < 0
        ? wx + innerWheelW + (wingBroken ? Math.round(wingW * 0.42) : 1)
        : wx - effWingW - 1;
      const fy = B - wingH + flatShudder;

      ctx.fillStyle = '#c8141c';
      ctx.fillRect(fx, fy + 6, effWingW, wingH - 6);
      ctx.fillStyle = '#fcfcfc';
      ctx.fillRect(fx + 2, fy + 9, Math.max(2, effWingW - 4), 3);
      ctx.fillRect(fx + 4, fy + 15, Math.max(2, effWingW - 8), 3);

      if (!wingBroken) {
        const epX = side < 0 ? fx : fx + effWingW - 4;
        ctx.fillStyle = '#e81c24';
        ctx.fillRect(epX, fy, 4, wingH);
        ctx.fillStyle = '#fce400';
        ctx.fillRect(epX, fy, 4, 3);
      } else {
        // Jagged dark carbon fracture edge where endplate snapped off!
        const jagX = side < 0 ? fx : fx + effWingW - 3;
        ctx.fillStyle = '#181c24';
        ctx.fillRect(jagX, fy + 6, 3, wingH - 6);
        ctx.fillStyle = '#505868';
        ctx.fillRect(jagX + 1, fy + 8, 1, 6);
      }
    }

    // Center Nose Tip Lip + Real Kerb/Bottoming Titanium Sparks!
    const cx = W >> 1;
    ctx.fillStyle = '#e41820';
    ctx.fillRect(cx - 14, B - 7, 28, 7);
    ctx.fillStyle = '#fcfcfc';
    ctx.fillRect(cx - 5, B - 7, 10, 7);

    const bottomingOut = Math.abs(playerCar?.chassisHeaveM || 0) > 0.014 || (dmg.fw > 0.30 && speedKmh > 140);
    if ((playerCar?.onCurb && speedKmh > 85) || bottomingOut) {
      const tick = (nowSec * 36) | 0;
      for (let s = 0; s < 6; s++) {
        ctx.fillStyle = (s & 1) === 0 ? '#fce400' : '#ff6800';
        ctx.fillRect(cx + (((s * 19 + tick * 7) % 60) - 30), B - 4 - ((s * 5 + tick * 3) % 10), 2, 1);
      }
    }

    if (isPitServiceActive) {
      const pitInfo = this._resolvePitProgressAndLabel(playerCar, pitServiceSubPhase, nowSec);
      const isGo = pitInfo.prog > 0.88;
      ctx.fillStyle = isGo ? '#00fc58' : '#ff2020';
      ctx.fillRect(cx - 16, B - 36, 32, 10);
      this._drawAtlasText(isGo ? 'GO!' : 'STOP', cx, B - 34, 'WHITE', 1, 'center', 5);
    }
  }

  _renderVisorRaindrops(W, maxVisorBottomY, horizonY, speedKmh, isMonsoon, nowSec) {
    const ctx = this.ctx;
    if (this._visorWipeTimer > 0) {
      // Crisp 120ms horizontal tear-off glint sweeping across open-cockpit visor!
      const prog = 1.0 - clamp(this._visorWipeTimer / 0.22, 0, 1);
      const glintY = Math.round(28 + prog * Math.max(24, maxVisorBottomY - 68));
      ctx.fillStyle = 'rgba(200, 240, 255, 0.55)';
      ctx.fillRect(0, glintY, W, 2);
      return;
    }

    const dropCount = isMonsoon ? 14 : 9;
    const cx = W >> 1;
    const cy = Math.max(36, horizonY);
    const maxY = maxVisorBottomY - 42;
    const streakBoost = clamp(speedKmh / 280, 0, 1);

    for (let i = 0; i < dropCount; i++) {
      const life = ((nowSec * (1.1 + streakBoost * 2.0) + i * 0.37) % 1.0);
      const baseAng = (i * 2.39996) % (Math.PI * 2);
      const rad = (12 + (i % 6) * 14) + life * (18 + streakBoost * 40);
      const dx = Math.round(cx + Math.cos(baseAng) * rad * 1.35);
      const dy = Math.round(cy + Math.sin(baseAng) * rad * 0.72);
      if (dx < 3 || dx >= W - 3 || dy < 28 || dy >= maxY) continue;
      ctx.fillStyle = '#d8f0ff';
      ctx.fillRect(dx, dy, 1, 2);
      if (streakBoost > 0.35) {
        ctx.fillStyle = 'rgba(168, 228, 255, 0.70)';
        ctx.fillRect(dx - Math.round(Math.cos(baseAng) * 2), dy - Math.round(Math.sin(baseAng) * 2), 1, 1);
      }
    }
  }

  _resolvePlayerPosition(explicitPos, playerCar, allCars) {
    if (Number.isFinite(explicitPos) && explicitPos >= 1) return explicitPos | 0;
    if (!playerCar || !Array.isArray(allCars) || allCars.length === 0) return 1;
    const pEff = (playerCar.totalDistanceGameM || 0) - (playerCar.timePenaltiesSec || 0) * 1.6;
    let rank = 1;
    for (let i = 0; i < allCars.length; i++) {
      const c = allCars[i];
      if (!c || c.isPlayer) continue;
      const cEff = (c.totalDistanceGameM || 0) - (c.timePenaltiesSec || 0) * 1.6;
      if (cEff > pEff) rank++;
    }
    return rank;
  }

  _formatArcadeLapTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0\'00"00';
    const totalCs = Math.floor(sec * 100);
    const mins = Math.floor(totalCs / 6000);
    const secs = Math.floor((totalCs % 6000) / 100);
    const cs = totalCs % 100;
    const sStr = secs < 10 ? `0${secs}` : `${secs}`;
    const cStr = cs < 10 ? `0${cs}` : `${cs}`;
    return `${mins}'${sStr}"${cStr}`;
  }

  _ordinal(n) {
    const v = n % 100;
    if (v >= 11 && v <= 13) return `${n}TH`;
    const d = n % 10;
    if (d === 1) return `${n}ST`;
    if (d === 2) return `${n}ND`;
    if (d === 3) return `${n}RD`;
    return `${n}TH`;
  }

  _resolveTirePixelColor(tireObj, tempOverrideC, nowSec) {
    if (tireObj?.punctured) {
      return (((nowSec * 12) | 0) & 1) === 0 ? '#ff1818' : '#200808';
    }
    const life = Number.isFinite(tireObj?.life) ? tireObj.life : 1.0;
    const temp = Number.isFinite(tempOverrideC) ? tempOverrideC : (Number.isFinite(tireObj?.temp) ? tireObj.temp : 88);
    if (life < 0.22 || temp > 114) return '#ff2418';
    if (life < 0.50 || temp > 104) return '#fce400';
    if (temp < 68) return '#48d4ff';
    return '#00fc58';
  }

  // Unified 1982 Sim-Parity Arcade Telemetry Pod (4-Corner Tires + Flat-Spot Dot + L/R Wing & Susp + FUEL Gauge + Boost/ERS!)
  _renderTelemetryArcadeWidget(W, wy, playerCar, drsActive, nowSec, padL = 4) {
    const ctx = this.ctx;
    const wx = Math.max(4, padL | 0);
    const podW = 44;
    const podH = 34;

    ctx.fillStyle = 'rgba(4, 8, 22, 0.72)';
    ctx.fillRect(wx, wy, podW, podH);
    ctx.fillStyle = '#283854';
    ctx.fillRect(wx, wy, podW, 1);
    ctx.fillRect(wx, wy + podH - 1, podW, 1);

    const dmg = this._readDamageProfile(playerCar);
    const flatInfo = this._readFlatSpotInfo(playerCar);
    const fuelInfo = this._readFuelProfile(playerCar);
    const launchBoostActive = (playerCar?.launchBoostTimer || 0) > 0;
    const launchBlink = (((nowSec * 14) | 0) & 1) === 0;

    // 1. Top-Down Aero / Suspension Silhouette + 4 Corner Tires (x = wx+2 .. wx+21, y = wy+2 .. wy+22)
    // Split Left/Right Front Wing Endplates
    ctx.fillStyle = dmg.fwLeftOut ? '#ff2020' : (dmg.fw > 0.15 ? '#fce400' : '#00fc58');
    ctx.fillRect(wx + 5, wy + 2, 6, 2);
    ctx.fillStyle = dmg.fwRightOut ? '#ff2020' : (dmg.fw > 0.15 ? '#fce400' : '#00fc58');
    ctx.fillRect(wx + 12, wy + 2, 6, 2);

    // Suspension crossbeam + Chassis spine
    ctx.fillStyle = dmg.susp > 0.25 ? '#ff2020' : (dmg.susp > 0.10 ? '#fce400' : '#9aa8bc');
    ctx.fillRect(wx + 7, wy + 7, 9, 1);
    ctx.fillStyle = '#c8141c';
    ctx.fillRect(wx + 10, wy + 4, 3, 14);

    // 4 Corner Tires (5x6 px) + Blinking Flat-Spot Pip!
    const tires = playerCar?.tires || null;
    const tempsArr = Array.isArray(playerCar?.tireTempsC) ? playerCar.tireTempsC : null;
    const blinkFlat = (((nowSec * 10) | 0) & 1) === 0;

    const corners = [
      { key: 'FL', tIdx: 0, cx: wx + 2,  cy: wy + 5,  flat: flatInfo.fl },
      { key: 'FR', tIdx: 1, cx: wx + 16, cy: wy + 5,  flat: flatInfo.fr },
      { key: 'RL', tIdx: 2, cx: wx + 2,  cy: wy + 13, flat: flatInfo.rl },
      { key: 'RR', tIdx: 3, cx: wx + 16, cy: wy + 13, flat: flatInfo.rr },
    ];
    for (let c = 0; c < 4; c++) {
      const cn = corners[c];
      ctx.fillStyle = this._resolveTirePixelColor(tires?.[cn.key], tempsArr ? tempsArr[cn.tIdx] : undefined, nowSec);
      ctx.fillRect(cn.cx, cn.cy, 5, 6);
      if (cn.flat > 0.12 && blinkFlat) {
        ctx.fillStyle = '#101218';
        ctx.fillRect(cn.cx + 1, cn.cy + 2, 3, 2);
      }
    }

    // Rear Wing / DRS Bar
    ctx.fillStyle = drsActive ? '#00e8d8' : (dmg.rwAskew ? '#ff2020' : (dmg.rw > 0.15 ? '#fce400' : '#00fc58'));
    ctx.fillRect(wx + 5, wy + 20, 13, 2);

    // 2. Vertical FUEL Bar (`F`) & Boost/ERS Bar (`E`/`B`) on Right Half of Pod
    const is2Spd = (playerCar?.gearboxMode || '') === 'CLASSIC_2SPD';
    const lowBlink = fuelInfo.lowFuel && (((nowSec * 8) | 0) & 1) === 0;
    const fuelBarH = Math.round(16 * fuelInfo.frac);
    ctx.fillStyle = '#141e30';
    ctx.fillRect(wx + 25, wy + 4, 6, 16);
    ctx.fillStyle = fuelInfo.lowFuel ? (lowBlink ? '#ff2020' : '#fc8418') : (fuelInfo.frac < 0.25 ? '#fc8418' : '#00e8d8');
    if (fuelBarH > 0) {
      ctx.fillRect(wx + 25, wy + 4 + (16 - fuelBarH), 6, fuelBarH);
    } else if (lowBlink) {
      ctx.fillRect(wx + 25, wy + 17, 6, 3);
    }

    const boostVal = launchBoostActive
      ? 1.0
      : (is2Spd
        ? clamp((playerCar?.turboBoostBar || 0) / 1.8, 0, 1)
        : clamp(Number.isFinite(playerCar?.ersCharge) ? playerCar.ersCharge : 0.85, 0, 1));
    const bstBarH = Math.round(16 * boostVal);
    ctx.fillStyle = '#141e30';
    ctx.fillRect(wx + 34, wy + 4, 6, 16);
    ctx.fillStyle = launchBoostActive
      ? (launchBlink ? '#00f4ff' : '#fce400')
      : (is2Spd ? '#fce400' : (playerCar?.ersDeploying ? '#ffffff' : '#38b8ff'));
    ctx.fillRect(wx + 34, wy + 4 + (16 - bstBarH), 6, bstBarH);

    // 3. Bottom Badge Row: Compound Letter + F (Fuel) + B/E (Boost/ERS)
    const compName = String(playerCar?.compound || 'SOFT');
    const compChar = compName.charAt(0) === 'F' ? 'W' : (compName.charAt(0) || 'S');
    const compPalette = compChar === 'S' ? 'RED' : (compChar === 'M' ? 'YELLOW' : (compChar === 'I' ? 'GREEN' : (compChar === 'W' ? 'CYAN' : 'WHITE')));
    this._drawAtlasText(compChar, wx + 2, wy + 24, compPalette, 1, 'left', 5);
    if (drsActive) {
      this._drawAtlasText('DRS', wx + 9, wy + 24, 'GREEN', 1, 'left', 5);
    } else if (launchBoostActive) {
      this._drawAtlasText('TRB', wx + 9, wy + 24, launchBlink ? 'CYAN' : 'YELLOW', 1, 'left', 5);
    } else if (flatInfo.maxFlat > 0.16 && blinkFlat) {
      this._drawAtlasText('FLT', wx + 9, wy + 24, 'ORANGE', 1, 'left', 5);
    }
    this._drawAtlasText('F', wx + 25, wy + 24, fuelInfo.lowFuel ? 'RED' : 'CYAN', 1, 'left', 5);
    this._drawAtlasText(is2Spd ? 'B' : 'E', wx + 34, wy + 24, 'YELLOW', 1, 'left', 5);

    // Blinking LOW FUEL Warning OR Crisp Launch Boost 'TURBO!' Badge below Pod!
    if (fuelInfo.lowFuel && lowBlink) {
      this._drawAtlasText('LOW FUEL!', wx, wy + podH + 2, 'RED', 1, 'left', 5);
    } else if (launchBoostActive) {
      ctx.fillStyle = 'rgba(0, 12, 28, 0.82)';
      ctx.fillRect(wx, wy + podH + 1, 36, 10);
      ctx.fillStyle = launchBlink ? '#00f4ff' : '#fce400';
      ctx.fillRect(wx, wy + podH + 1, 36, 1);
      this._drawAtlasText('TURBO!', wx + 3, wy + podH + 2, launchBlink ? 'CYAN' : 'YELLOW', 1, 'left', 5);
    }
  }

  // Native 1982 Canvas Pit-Box Service & Optimal Clutch Launch Mini-Game Bar
  _renderNativePitStopAndClutchHUD(W, baseY, playerCar, pitServiceSubPhase, raceSystems, nowSec) {
    const ctx = this.ctx;
    const pitInfo = this._resolvePitProgressAndLabel(playerCar, pitServiceSubPhase, nowSec);
    const clutch = raceSystems?.clutchGame;
    const boxW = Math.min(W - 12, 184);
    const boxH = clutch?.active || clutch?.resultText ? 38 : 24;
    const boxX = (W - boxW) >> 1;
    const boxY = baseY;

    ctx.fillStyle = '#080c1c';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.fillStyle = pitInfo.prog > 0.88 ? '#00fc58' : '#fce400';
    ctx.fillRect(boxX + 1, boxY + 1, boxW - 2, 1);
    ctx.fillRect(boxX + 1, boxY + boxH - 2, boxW - 2, 1);
    ctx.fillRect(boxX + 1, boxY + 1, 1, boxH - 2);
    ctx.fillRect(boxX + boxW - 2, boxY + 1, 1, boxH - 2);

    const timerFmt = this._formatArcadeLapTime(pitInfo.remSec).slice(2); // SS"CC
    this._drawAtlasText(`PIT STOP ${timerFmt}`, W >> 1, boxY + 3, 'YELLOW', 1, 'center', 5);
    const nextComp = (raceSystems?.playerPitPlan?.nextCompound || 'MED').slice(0, 3);
    this._drawAtlasText(`${pitInfo.sub.slice(0, 14)} [${nextComp}]`, W >> 1, boxY + 13, 'GREEN', 1, 'center', 5);

    if (clutch && (clutch.active || clutch.resultText)) {
      const barW = boxW - 24;
      const barX = boxX + 12;
      const barY = boxY + 24;
      const bounds = typeof raceSystems?.getClutchZoneBounds === 'function'
        ? raceSystems.getClutchZoneBounds()
        : { sweetMin: 0.38, sweetMax: 0.64, goodMin: 0.28, goodMax: 0.74 };

      ctx.fillStyle = '#1c2438';
      ctx.fillRect(barX, barY, barW, 8);
      ctx.fillStyle = '#fce400';
      ctx.fillRect(barX + Math.round(bounds.goodMin * barW), barY + 1, Math.round((bounds.goodMax - bounds.goodMin) * barW), 6);
      ctx.fillStyle = '#00fc58';
      ctx.fillRect(barX + Math.round(bounds.sweetMin * barW), barY + 1, Math.round((bounds.sweetMax - bounds.sweetMin) * barW), 6);

      const curX = barX + Math.round(clamp(clutch.cursor || 0, 0, 1) * (barW - 2));
      ctx.fillStyle = '#fcfcfc';
      ctx.fillRect(curX, barY - 1, 3, 10);

      if (clutch.resolved && clutch.resultText) {
        const cleanRes = String(clutch.resultText).replace(/[^\x20-\x7E]/g, '').trim();
        this._drawAtlasText(cleanRes.slice(0, 26), W >> 1, boxY + boxH + 2, clutch.bonusApplied ? 'GREEN' : 'ORANGE', 1, 'center', 5);
      }
    }
  }

  _renderArcadeTopHUD(W, H, hud) {
    const ctx = this.ctx;
    const safePad = this._computeHudSafePadding(W, H);
    const { padL, padR, topY, isNarrowPortrait } = safePad;
    const usableW = Math.max(120, W - padL - padR);
    const midX = padL + (usableW >> 1);
    const rightX = W - padR;

    const scoreStr = this._formatArcadeSixDigitScore(hud.score || 0);
    const topStr = this._formatArcadeSixDigitScore(hud.topScore || 25000);
    const timeInt = Math.max(0, Math.ceil(Number.isFinite(hud.timerSec) ? hud.timerSec : 0));
    const timeStr = String(timeInt).padStart(2, '0');
    const timeLowFlash = timeInt <= 15 && (((hud.nowSec * 6) | 0) & 1) === 0;
    const lapTimeStr = this._formatArcadeLapTime(hud.lapTimeSec);
    const spdStr = String(Math.round(hud.speedKmh)).padStart(3, ' ');
    const isClassic2Spd = hud.gearboxMode === 'CLASSIC_2SPD';
    const gearTxt = isClassic2Spd ? (hud.gear > 1 ? 'HIGH' : 'LOW') : `G${hud.gear}`;
    const gearShort = isClassic2Spd ? (hud.gear > 1 ? 'HI' : 'LO') : `G${hud.gear}`;
    const gearColor = isClassic2Spd
      ? (hud.gear > 1 ? 'GREEN' : 'YELLOW')
      : (hud.gear >= 7 ? 'CYAN' : 'YELLOW');
    const posStr = `${String(hud.playerPos).padStart(2, '0')}/${String(hud.totalCars).padStart(2, '0')}`;

    const isPortraitHud = H > 275 || usableW < 268;
    const barBottomY = isPortraitHud ? topY + 23 : topY + 24;

    // Clean top arcade scanline bar (expands cleanly around mobile safe-area top inset)
    ctx.fillStyle = 'rgba(0, 4, 20, 0.48)';
    ctx.fillRect(0, 0, W, barBottomY);

    if (!isPortraitHud) {
      const step = usableW < 316 ? 5 : 6;
      const row2Y = topY + 11;
      this._drawAtlasText('1UP', padL, topY, 'RED', 1, 'left', step);
      this._drawAtlasText(scoreStr, padL + step * 4, topY, 'WHITE', 1, 'left', step);
      this._drawAtlasText('TOP', padL, row2Y, 'YELLOW', 1, 'left', step);
      this._drawAtlasText(topStr, padL + step * 4, row2Y, 'YELLOW', 1, 'left', step);

      const col2X = Math.max(padL + step * 11, padL + Math.round(usableW * 0.27));
      this._drawAtlasText(`LAP ${hud.currentLap}/${hud.totalLaps}`, col2X, topY, 'WHITE', 1, 'left', step);
      this._drawAtlasText(lapTimeStr, col2X, row2Y, 'GREEN', 1, 'left', step);

      this._drawAtlasText('TIME', midX, Math.max(1, topY - 1), 'YELLOW', 1, 'center', step);
      this._drawAtlasText(timeStr, midX, topY + 7, timeLowFlash ? 'RED' : 'WHITE', 2, 'center', 11);

      if (usableW >= 322) {
        const col4X = padL + Math.round(usableW * 0.65);
        this._drawAtlasText('POS', col4X, topY, 'CYAN', 1, 'left', step);
        this._drawAtlasText(posStr, col4X, row2Y, hud.playerPos === 1 ? 'YELLOW' : 'CYAN', 1, 'left', step);
      }

      this._drawAtlasText(`${spdStr}KM/H`, rightX, topY, 'WHITE', 1, 'right', step);
      this._drawAtlasText(gearTxt, rightX, row2Y, gearColor, 1, 'right', step);
      if (usableW < 322) {
        this._drawAtlasText(`P${hud.playerPos}`, rightX - 30, row2Y, 'CYAN', 1, 'right', step);
      }
    } else {
      const compactSpeedGear = isNarrowPortrait || usableW < 192
        ? `${Math.round(hud.speedKmh)}K ${gearShort}`
        : `${Math.round(hud.speedKmh)}K ${gearTxt}`;
      const compactPosLap = isNarrowPortrait || usableW < 192
        ? `P${hud.playerPos}/${hud.totalCars} L${hud.currentLap}`
        : `P${posStr} L${hud.currentLap}`;

      this._drawAtlasText(`1UP ${scoreStr}`, padL, topY, 'RED', 1, 'left', 5);
      this._drawAtlasText(`TIME ${timeStr}`, midX, topY, timeLowFlash ? 'RED' : 'YELLOW', 1, 'center', 5);
      this._drawAtlasText(compactSpeedGear, rightX, topY, gearColor, 1, 'right', 5);

      const row2Y = topY + 11;
      this._drawAtlasText(`TOP ${topStr}`, padL, row2Y, 'YELLOW', 1, 'left', 5);
      this._drawAtlasText(lapTimeStr, midX, row2Y, 'GREEN', 1, 'center', 5);
      this._drawAtlasText(compactPosLap, rightX, row2Y, 'CYAN', 1, 'right', 5);
    }

    // Unified 1982 Sim-Parity Telemetry Pod at Upper-Left (respecting padL & topY)
    const podY = barBottomY + 2;
    this._renderTelemetryArcadeWidget(W, podY, hud.playerCar, hud.drsActive, hud.nowSec, padL);

    // Camera Mode Switch Toast
    if (this._camBannerTimer > 0) {
      this._drawAtlasText(hud.camLabel || CAMERA_RIGS_1982[0].label, rightX, podY + 1, 'CYAN', 1, 'right', 5);
    }

    // Sector Split Delta Popup
    let sectorTxt = '';
    let sectorGreen = true;
    if (typeof hud.sectorDeltaPopup === 'string' && hud.sectorDeltaPopup.trim()) {
      sectorTxt = hud.sectorDeltaPopup.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
      sectorGreen = !sectorTxt.includes('+');
    } else if (hud.sectorDeltaPopup && typeof hud.sectorDeltaPopup === 'object') {
      const rawLbl = String(hud.sectorDeltaPopup.text || hud.sectorDeltaPopup.label || '').replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
      if (rawLbl) {
        sectorTxt = rawLbl;
        sectorGreen = hud.sectorDeltaPopup.improved !== undefined ? !!hud.sectorDeltaPopup.improved : !rawLbl.includes('+');
      } else if (Number.isFinite(hud.sectorDeltaPopup.deltaSec)) {
        const d = hud.sectorDeltaPopup.deltaSec;
        const secNum = hud.sectorDeltaPopup.sector || 1;
        sectorTxt = `S${secNum} ${d <= 0 ? '' : '+'}${d.toFixed(2)}S`;
        sectorGreen = d <= 0.001;
      }
    } else if (this._autoSectorTimer > 0 && this._autoSectorPopup) {
      sectorTxt = this._autoSectorPopup;
      sectorGreen = this._autoSectorGreen;
    }
    if (sectorTxt) {
      this._drawAtlasText(sectorTxt, rightX, podY + 12, sectorGreen ? 'GREEN' : 'RED', 1, 'right', 5);
    }

    // Compact Floating "PASSING BONUS +50" Popup (never blocks road horizon!)
    if (this._passingBonusTimer > 0 && (((hud.nowSec * 10) | 0) & 1) === 0) {
      this._drawNamcoBannerText('PASSING BONUS +50', midX, isPortraitHud ? podY + 23 : podY + 1, '#b8ffb8', '#00fc58', '#00a838', 1, 'center', 5);
    }

    const bannerBaseY = H > 275 ? Math.min(Math.round(H * 0.21), 88) : Math.max(38, barBottomY + 11);

    // Native 1982 Pit Stop & Clutch Launch Bar takes priority when Stopped in Pit Box!
    if (hud.isPitServiceActive) {
      this._renderNativePitStopAndClutchHUD(W, bannerBaseY, hud.playerCar, hud.pitServiceSubPhase, hud.raceSystems, hud.nowSec);
      return;
    }

    // Structured / Sanitized Iconic 1982 Namco 2x Gradient Arcade Banners!
    let headline = '';
    let bannerKind = 'GOLD'; // 'GOLD' | 'CYAN' | 'GREEN' | 'GOAL'
    const launchBoostRem = Number.isFinite(hud.playerCar?.launchBoostTimer) ? hud.playerCar.launchBoostTimer : 0;
    const isPerfectLaunch = hud.playerCar?.launchReactionGrade === 'PERFECT' || launchBoostRem > 1.05;

    if (hud.arcadeBanner && typeof hud.arcadeBanner === 'object' && hud.arcadeBanner.headline) {
      headline = String(hud.arcadeBanner.headline).toUpperCase().trim();
      bannerKind = hud.arcadeBanner.palette || 'GOLD';
    } else if (hud.state === GAME_STATES.RACE_RESULTS) {
      headline = 'GOAL IN!';
      bannerKind = 'GOAL';
    } else if (hud.state === GAME_STATES.GRID_LINEUP && hud.gantryLightsLit > 0) {
      headline = 'PREPARE TO RACE';
      bannerKind = 'GOLD';
    } else if (hud.state === GAME_STATES.QUALIFYING && hud.speedKmh < 5.0 && hud.lapTimeSec < 1.5) {
      headline = 'PREPARE TO QUALIFY';
      bannerKind = 'GOLD';
    } else if (launchBoostRem > 0) {
      headline = isPerfectLaunch
        ? (usableW >= 260 ? 'PERFECT START! TURBO!' : 'PERFECT START!')
        : (usableW >= 240 ? 'TURBO LAUNCH BOOST!' : 'TURBO START!');
      bannerKind = (((hud.nowSec * 12) | 0) & 1) === 0 ? 'CYAN' : 'GOLD';
    } else {
      let rawCall = '';
      if (typeof hud.centerCallout === 'string') rawCall = hud.centerCallout;
      else if (hud.centerCallout && typeof hud.centerCallout === 'object') rawCall = String(hud.centerCallout.text || hud.centerCallout.message || '');

      // Clean emoji-stripped artifacts (" P1  INTO THE LEAD!") into crisp Namco arcade phrases!
      rawCall = rawCall.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
      if (rawCall) {
        if (rawCall.includes('EXTENDED')) {
          headline = 'EXTENDED PLAY!';
          bannerKind = 'CYAN';
        } else if (rawCall.includes('PREPARE TO QUALIFY')) {
          headline = 'PREPARE TO QUALIFY';
          bannerKind = 'GOLD';
        } else if (rawCall.includes('GOAL') || rawCall.includes('FINISH') || rawCall.includes('CHECKERED')) {
          headline = 'GOAL IN!';
          bannerKind = 'GOAL';
        } else if (rawCall.includes('QUALIFIED')) {
          headline = rawCall;
          bannerKind = 'GREEN';
        } else {
          headline = rawCall;
          bannerKind = rawCall.includes('GO') || rawCall.includes('LIGHTS OUT') ? 'GREEN' : 'GOLD';
        }
      } else if (this._lapCompleteTimer > 0 && this._lapCompleteBanner && (((hud.nowSec * 8) | 0) % 4 !== 0)) {
        headline = this._lapCompleteBanner;
        bannerKind = this._lapCompleteBest ? 'GREEN' : 'GOLD';
      } else if (hud.raceSystems?.vscActive || hud.playerCar?.vscActive) {
        headline = 'SAFETY CAUTION - SLOW';
        bannerKind = 'GOLD';
      }
    }

    if (headline) {
      const canScale2 = !isPortraitHud && headline.length * 12 <= usableW - 56;
      const bScale = canScale2 ? 2 : 1;
      const cStep = bScale === 2 ? 12 : (usableW < 216 ? 5 : 6);
      const maxChars = Math.max(12, Math.floor((usableW - 8) / cStep));
      const clipped = headline.length > maxChars ? headline.slice(0, maxChars) : headline;

      let topC = '#fff878', midC = '#fce400', botC = '#fc5800';
      if (bannerKind === 'CYAN') {
        topC = '#d8ffff'; midC = '#00e8d8'; botC = '#1878ff';
      } else if (bannerKind === 'GREEN') {
        topC = '#c8ffc8'; midC = '#00fc58'; botC = '#009830';
      } else if (bannerKind === 'GOAL') {
        topC = '#fff878'; midC = '#fce400'; botC = '#ff1c38';
      }

      this._drawNamcoBannerText(clipped, midX, bannerBaseY, topC, midC, botC, bScale, 'center', cStep);
    }

    // 1982 Checkered-Flag Top Border Flash on Finish Crossing
    const onFinishZone = hud.playerS >= 972 || hud.playerS <= 24;
    if (hud.state === GAME_STATES.RACE_RESULTS || (hud.state === GAME_STATES.RACING && hud.currentLap >= hud.totalLaps && onFinishZone)) {
      const parity = ((hud.nowSec * 10) | 0) & 1;
      const cell = 6;
      const cols = Math.ceil(W / cell);
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = ((c + parity) & 1) === 0 ? '#fcfcfc' : '#101010';
        ctx.fillRect(c * cell, 0, cell, 2);
      }
    }
  }
}
