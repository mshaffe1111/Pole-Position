// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// True 1:1 1982 Namco "Pole Position" (System-1) Raster-Scanline & Pixel-Sprite
// Arcade Renderer — Live-Synced to 240Hz Spline Physics (Zero GC Allocations!)
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
} from './config.js';

// Camera & Scanline Perspective Constants (Real Meters)
const NEAR_DIST_M = 2.0;
const FAR_DIST_M = 185.0;
const CAM_Z_OFFSET_M = 5.5;
const INV_Z_NEAR = 1.0 / (NEAR_DIST_M + CAM_Z_OFFSET_M);
const INV_Z_FAR = 1.0 / (FAR_DIST_M + CAM_Z_OFFSET_M);

const WORLD_STEP_M = 2.0;
const WORLD_STEPS = 96; // Covers 0m .. 190m ahead in 2m increments
const MAX_SPRITE_POOL = 240;

const COMPOUND_PIXEL_COLORS = {
  SOFT: '#ff2020',
  MEDIUM: '#fcf400',
  HARD: '#f8f8f8',
  INTERMEDIATE: '#00fc58',
  FULL_WET: '#2898ff',
};

const CAMERA_MODE_LABELS_1982 = [
  'CAM: 1982 CHASE',
  'CAM: HALO T-CAM',
  'CAM: 1ST-PERSON COCKPIT',
  'CAM: NOSE WING CAM',
];

// Iconic 1982 Namco System-1 Rival Palettes
const RIVAL_PALETTES_1982 = [
  { name: 'YELLOW_BLUE', body: '#fcd800', shade: '#b89200', hi: '#fff478', trim: '#1858f8', wing: '#fcf8e0', helmet: '#f8f8f8' },
  { name: 'CYAN_RED',    body: '#00d8f8', shade: '#008cb0', hi: '#8cf4ff', trim: '#f82018', wing: '#f8f8f8', helmet: '#fcf400' },
  { name: 'GREEN_WHITE', body: '#00c838', shade: '#008020', hi: '#68fc88', trim: '#f8f8f8', wing: '#f8f8f8', helmet: '#fcf400' },
  { name: 'ORANGE_BLUE', body: '#fc6800', shade: '#b03c00', hi: '#fca858', trim: '#1858f8', wing: '#f8f8f8', helmet: '#54dcff' },
  { name: 'VIOLET_YEL',  body: '#b838f8', shade: '#7418a8', hi: '#e090ff', trim: '#fcf400', wing: '#fcf400', helmet: '#f8f8f8' },
  { name: 'SILVER_RED',  body: '#d0d8e4', shade: '#8490a4', hi: '#ffffff', trim: '#f81818', wing: '#f8f8f8', helmet: '#3888ff' },
];

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
  RED:    '#ff2020',
  YELLOW: '#fcf400',
  GREEN:  '#00fc58',
  WHITE:  '#f8f8f8',
  CYAN:   '#54dcff',
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

    // Pre-allocated scanline & world curve buffers (Zero per-frame allocations!)
    this._worldCurveM = new Float32Array(WORLD_STEPS);
    this._worldElevM = new Float32Array(WORLD_STEPS);
    this._lineDistM = new Float32Array(512);
    this._lineScale = new Float32Array(512);
    this._lineCenterX = new Float32Array(512);
    this._lineRoadHalfPx = new Float32Array(512);
    this._lastHostW = 0;
    this._lastHostH = 0;

    // Pre-allocated depth-sort sprite pool
    this._spritePool = new Array(MAX_SPRITE_POOL);
    for (let i = 0; i < MAX_SPRITE_POOL; i++) {
      this._spritePool[i] = {
        distReal: 0,
        kind: 0, // 0 = sprite image, 1 = start/finish gantry, 2 = rival explosion
        img: null,
        worldLatM: 0,
        widthMeters: 1,
        yLiftPx: 0,
        lightsLit: 0,
        lightsGreen: false,
        blastProgress: 0,
        anchorCenter: false,
      };
    }

    // Continuous heading, explosion, camera, crowd & sector-split trackers
    this._unwrappedYaw = 0;
    this._hasPrevYaw = false;
    this._prevRawYaw = 0;
    this._lastElapsedSec = 0;
    this._playerBlastSec = 0;
    this._lastCamIdx = 0;
    this._camBannerTimer = 0;
    this._prevPlayerPos = 0;
    this._crowdRoarTimer = 0;
    this._crowdExcitement = 0;
    this._prevSectorIdx = 0;
    this._sectorStartSec = 0;
    this._bestSectorTimes = [null, null, null];
    this._autoSectorPopup = '';
    this._autoSectorTimer = 0;
    this._autoSectorGreen = true;

    // Pre-generate all pixel-art sprite sheets & bitmap font atlases ONCE
    this._fontAtlases = this._buildBitmapFontAtlases();
    this._panoramas = this._buildHorizonPanoramas();
    this._clouds = this._buildCloudSprites();
    this._playerSprites = this._buildPlayerCarSprites();
    this._rivalSprites = this._buildRivalCarSprites();
    this._explosionFrames = this._buildExplosionSprites();
    this._wheelSprites = this._buildFlyingWheelSprites();
    this._billboardSprites = this._buildBillboardSprites();
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
      window.addEventListener('resize', this._onWindowResize, { passive: true });
      window.addEventListener('orientationchange', this._onWindowResize, { passive: true });
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

  resize(width, height) {
    const safeW = Number.isFinite(width) && width > 0 ? width : 426;
    const safeH = Number.isFinite(height) && height > 0 ? height : 240;
    this._lastHostW = safeW;
    this._lastHostH = safeH;

    const rawAspect = safeW / safeH;
    let nextW;
    let nextH;
    if (rawAspect >= 0.85) {
      // Landscape / Desktop (up to 20:9+ Pixel 11 Pro Chrome-cropped 915x335)
      nextH = 240;
      nextW = Math.round(240 * clamp(rawAspect, 0.85, 2.85));
    } else {
      // Portrait Phone (Pixel 11 Pro 412x915 full & 412x765 Chrome): 100% square pixels, zero vertical stretch!
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
    // Upper strip (y=0..8): 7x9 black arcade outline; Lower strip (y=9..15): pure 5x7 colored glyph
    // 2-pass blitting guarantees tight kerning on mobile portrait NEVER clips adjacent characters!
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

    // Pass 1: Continuous black arcade outline
    for (let i = 0; i < len; i++) {
      let code = str.charCodeAt(i);
      if (code >= 97 && code <= 122) code -= 32;
      const glyphIdx = code < 128 ? CHAR_TO_IDX[code] : 255;
      if (glyphIdx !== 255 && glyphIdx !== SPACE_GLYPH_IDX) {
        ctx.drawImage(atlas, glyphIdx * 7, 0, 7, 9, drawX + i * step, drawY, outW, outH);
      }
    }
    // Pass 2: Razor-sharp colored foreground glyphs
    for (let i = 0; i < len; i++) {
      let code = str.charCodeAt(i);
      if (code >= 97 && code <= 122) code -= 32;
      const glyphIdx = code < 128 ? CHAR_TO_IDX[code] : 255;
      if (glyphIdx !== 255 && glyphIdx !== SPACE_GLYPH_IDX) {
        ctx.drawImage(atlas, glyphIdx * 7 + 1, 9, 5, 7, drawX + i * step + s, drawY + s, fgW, fgH);
      }
    }
  }

  _buildHorizonPanoramas() {
    // Seamless 512x60 wrapping horizon strip featuring iconic pixel-art Mount Fuji
    const W = 512;
    const H = 60;
    const variants = {
      DAY:    { slope: '#2c4c78', slopeHi: '#426a9e', snow: '#f8f8f8', snowShade: '#b8d8f8', hill1: '#249434', hill2: '#187828', base: '#0e581b', nightCity: false },
      SUNSET: { slope: '#3b3566', slopeHi: '#6c497a', snow: '#ffe8d8', snowShade: '#f49c84', hill1: '#285c30', hill2: '#184422', base: '#102e18', nightCity: false },
      STORM:  { slope: '#263850', slopeHi: '#38506e', snow: '#dce8f4', snowShade: '#94acc8', hill1: '#1c5c28', hill2: '#14481e', base: '#0c3414', nightCity: false },
      NIGHT:  { slope: '#14203c', slopeHi: '#1e3058', snow: '#cfdcf0', snowShade: '#7894c0', hill1: '#0c3418', hill2: '#082410', base: '#05180a', nightCity: true },
    };

    const out = {};
    for (const [key, pal] of Object.entries(variants)) {
      const { canvas, ctx } = makeOffscreenCanvas(W, H);

      // 1. Distant Secondary Alpine Range across entire 512px loop
      for (let x = 0; x < W; x++) {
        const ridge =
          12 +
          Math.sin((x / W) * Math.PI * 4) * 5.5 +
          Math.cos((x / W) * Math.PI * 10 + 0.8) * 3.0 +
          Math.sin((x / W) * Math.PI * 22) * 1.4;
        const ry = (H - (ridge | 0)) | 0;
        ctx.fillStyle = pal.slope;
        ctx.fillRect(x, ry, 1, H - ry);
      }

      // 2. Iconic Symmetrical Mount Fuji Centered at x = 256 (Base span ~210px, Peak height 54px)
      const fujiCx = 256;
      const fujiPeakY = 5;
      const fujiBaseY = H - 6;
      for (let dx = -112; dx <= 112; dx++) {
        const ax = Math.abs(dx);
        let hNorm;
        if (ax <= 13) {
          // Flat volcanic crater rim with subtle jagged notch
          hNorm = 1.0 - (ax === 4 || ax === 9 ? 0.02 : 0.0);
        } else {
          // Authentic concave logarithmic volcanic slope curve of Mt. Fuji!
          const u = (ax - 13) / 99;
          hNorm = Math.pow(Math.max(0, 1.0 - u), 1.68);
        }
        const topY = Math.round(fujiBaseY - hNorm * (fujiBaseY - fujiPeakY));
        const px = (fujiCx + dx + W) % W;

        if (topY < fujiBaseY) {
          // Volcanic rock body (#2c4c78 + sunlit left ridge facet)
          ctx.fillStyle = dx < -4 ? pal.slopeHi : pal.slope;
          ctx.fillRect(px, topY, 1, fujiBaseY - topY);

          // Jagged Snowcap (#f8f8f8 sunlit left / #b8d8f8 shadow facets on right & gullies)
          const gullyJag =
            ((Math.sin(dx * 0.42) * 3.2 + Math.cos(dx * 0.95) * 2.1) | 0) +
            (ax % 9 < 3 ? 3 : 0);
          const snowBottomY = Math.min(fujiBaseY - 4, fujiPeakY + 17 + gullyJag);
          if (topY < snowBottomY) {
            const isShadowFacet = dx > 3 || (dx > -10 && (Math.abs(dx) % 7 < 2));
            ctx.fillStyle = isShadowFacet ? pal.snowShade : pal.snow;
            ctx.fillRect(px, topY, 1, snowBottomY - topY);
          }

          // Extra volcanic snow-gully streaks extending down the mid-slope
          if (ax > 12 && ax < 46 && (ax % 11 === 0 || ax % 11 === 1)) {
            const streakEnd = Math.min(fujiBaseY - 6, snowBottomY + 6 - (ax >> 3));
            if (streakEnd > snowBottomY) {
              ctx.fillStyle = pal.snowShade;
              ctx.fillRect(px, snowBottomY, 1, streakEnd - snowBottomY);
            }
          }
        }
      }

      // 3. Optional Night Skyline Towers & Neon Sphere Silhouette on opposite azimuth (for Vegas / Night)
      if (pal.nightCity) {
        const towers = [
          [38, 26, 12, '#ff1493'],
          [54, 32, 14, '#00f0ff'],
          [72, 22, 10, '#fcf400'],
          [422, 28, 13, '#00f0ff'],
          [440, 34, 15, '#ff1493'],
          [460, 24, 11, '#00fc58'],
        ];
        for (const [tx, th, tw, neon] of towers) {
          const ty = H - 6 - th;
          ctx.fillStyle = '#0c1028';
          ctx.fillRect(tx, ty, tw, th);
          ctx.fillStyle = neon;
          ctx.fillRect(tx, ty, tw, 2);
          for (let wy = ty + 4; wy < H - 8; wy += 3) {
            for (let wx = tx + 2; wx < tx + tw - 2; wx += 3) {
              if (((wx + wy) & 3) !== 0) {
                ctx.fillStyle = ((wx ^ wy) & 2) ? '#fcf488' : neon;
                ctx.fillRect(wx, wy, 1, 1);
              }
            }
          }
        }
        // Pixel Neon Sphere Dome at x = 96
        for (let dy = -9; dy <= 0; dy++) {
          const half = Math.round(Math.sqrt(Math.max(0, 81 - dy * dy)));
          ctx.fillStyle = dy % 3 === 0 ? '#ff1493' : (dy % 2 === 0 ? '#00f0ff' : '#301868');
          ctx.fillRect(98 - half, H - 6 + dy, half * 2, 1);
        }
      }

      // 4. Lush Rolling Shizuoka Foothills (#187828 / #249434) & Pine Treeline Base
      for (let x = 0; x < W; x++) {
        const fh1 =
          9 +
          Math.sin((x / W) * Math.PI * 6 + 0.4) * 3.8 +
          Math.cos((x / W) * Math.PI * 16) * 1.8;
        const y1 = H - (fh1 | 0);
        ctx.fillStyle = pal.hill1;
        ctx.fillRect(x, y1, 1, H - y1);

        const fh2 =
          6 +
          Math.cos((x / W) * Math.PI * 8 + 1.9) * 2.6 +
          ((x * 7) % 5 === 0 ? 1 : 0);
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

  _buildCloudSprites() {
    // 3 fluffy 1982 Namco arcade pixel clouds with flat bottom shadow
    const specs = [
      { w: 54, h: 16, puffs: [[12, 10, 8], [22, 7, 10], [34, 8, 9], [43, 11, 7]] },
      { w: 38, h: 13, puffs: [[10, 8, 6], [19, 6, 8], [28, 9, 6]] },
      { w: 66, h: 18, puffs: [[13, 12, 8], [24, 8, 10], [36, 7, 11], [48, 9, 9], [56, 12, 6]] },
    ];
    return specs.map((sp) => {
      const { canvas, ctx } = makeOffscreenCanvas(sp.w, sp.h);
      for (const [cx, cy, r] of sp.puffs) {
        for (let py = 0; py < sp.h - 2; py++) {
          for (let px = 0; px < sp.w; px++) {
            const dx = px - cx;
            const dy = (py - cy) * 1.25;
            if (dx * dx + dy * dy <= r * r) {
              ctx.fillStyle = py < cy - 2 ? '#f8f8f8' : (py < cy + 2 ? '#e0f0ff' : '#a8ccf8');
              ctx.fillRect(px, py, 1, 1);
            }
          }
        }
      }
      // Crisp flat arcade cloud base
      ctx.fillStyle = '#e0f0ff';
      ctx.fillRect(6, sp.h - 5, sp.w - 12, 2);
      ctx.fillStyle = '#98c0f8';
      ctx.fillRect(4, sp.h - 3, sp.w - 8, 2);
      return canvas;
    });
  }

  _buildPlayerCarSprites() {
    // 5 steering frames: [-2: hard-left, -1: slight-left, 0: straight, +1: slight-right, +2: hard-right]
    // x 2 tire-spin animation phases = 10 pre-generated 68x38 pixel canvases!
    const frames = [];
    const steers = [-2, -1, 0, 1, 2];
    for (let sIdx = 0; sIdx < steers.length; sIdx++) {
      const steer = steers[sIdx];
      const pair = [
        this._paintF1CarSprite({
          w: 68,
          h: 38,
          steer,
          tirePhase: 0,
          isPlayer: true,
          pal: {
            body: '#ec1c18',
            shade: '#9c0808',
            hi: '#ff7060',
            trim: '#1850e8',
            wing: '#f8f8f8',
            helmet: '#f8f8f8',
            helmetStripe: '#1850e8',
          },
        }),
        this._paintF1CarSprite({
          w: 68,
          h: 38,
          steer,
          tirePhase: 1,
          isPlayer: true,
          pal: {
            body: '#ec1c18',
            shade: '#9c0808',
            hi: '#ff7060',
            trim: '#1850e8',
            wing: '#f8f8f8',
            helmet: '#f8f8f8',
            helmetStripe: '#1850e8',
          },
        }),
      ];
      frames.push(pair);
    }
    return frames;
  }

  _buildRivalCarSprites() {
    // 6 Namco 1982 palettes x 3 view angles (-1, 0, +1) x 2 tire phases = 36 sprites
    return RIVAL_PALETTES_1982.map((pal) => {
      const views = [-1, 0, 1].map((steer) => [
        this._paintF1CarSprite({
          w: 64,
          h: 36,
          steer,
          tirePhase: 0,
          isPlayer: false,
          pal: { ...pal, helmetStripe: pal.trim },
        }),
        this._paintF1CarSprite({
          w: 64,
          h: 36,
          steer,
          tirePhase: 1,
          isPlayer: false,
          pal: { ...pal, helmetStripe: pal.trim },
        }),
      ]);
      return views;
    });
  }

  _paintF1CarSprite({ w, h, steer, tirePhase, isPlayer, pal }) {
    const { canvas, ctx } = makeOffscreenCanvas(w, h);
    const cx = w >> 1;
    const noseShift = steer * 2; // Front nose & wheels shift into turn
    const bodyShift = steer;     // Mid-chassis leans subtly

    // Helper for drawing a chunky 1982 slick tire with rotating white tread highlight bars
    const drawSlickTire = (tx, ty, tw, th, phase, turnShift = 0) => {
      const x0 = (tx + turnShift) | 0;
      const y0 = ty | 0;
      // Outer rounded tire silhouette
      ctx.fillStyle = '#0c0c10';
      ctx.fillRect(x0 + 1, y0, tw - 2, th);
      ctx.fillRect(x0, y0 + 1, tw, th - 2);

      // Tire rubber face
      ctx.fillStyle = '#1c1e26';
      ctx.fillRect(x0 + 1, y0 + 1, tw - 2, th - 2);

      // Sidewall vertical bevel
      ctx.fillStyle = '#323846';
      ctx.fillRect(x0 + 1, y0 + 2, 1, th - 4);
      ctx.fillRect(x0 + tw - 2, y0 + 2, 1, th - 4);

      // Classic 1982 Pole Position spinning white/silver horizontal tread highlight bars!
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

    // 1. Forward Front Wing Tips & Nose Cone (#1 Nose Emblem when turning or peeking ahead)
    const noseX = cx + noseShift;
    ctx.fillStyle = pal.wing;
    ctx.fillRect(noseX - 15, 11, 30, 3);
    ctx.fillStyle = pal.body;
    ctx.fillRect(noseX - 16, 10, 3, 4);
    ctx.fillRect(noseX + 13, 10, 3, 4);
    // Nose cone spine + #1 micro-stripe
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(noseX - 4, 8, 8, 6);
    ctx.fillStyle = pal.trim;
    ctx.fillRect(noseX - 2, 8, 4, 2);
    if (isPlayer) {
      // Tiny red #1 mark on forward nose deck
      ctx.fillStyle = '#ec1c18';
      ctx.fillRect(noseX, 10, 1, 3);
    }

    // 2. Exposed Front Slick Tires & Steel Suspension Wishbones
    ctx.fillStyle = '#9aa6ba';
    ctx.fillRect(noseX - 18, 15, 36, 1);
    ctx.fillStyle = '#505868';
    ctx.fillRect(noseX - 18, 16, 36, 1);
    drawSlickTire(cx - 25 + (noseShift >> 1), 11, 9, 10, tirePhase, steer);
    drawSlickTire(cx + 16 + (noseShift >> 1), 11, 9, 10, tirePhase, steer);

    // 3. Wide Sculpted 1982 Ground-Effect Sidepods & Engine Cowl
    const bx = cx + bodyShift;
    // Black rubber ground-effect side skirts
    ctx.fillStyle = '#0c0e14';
    ctx.fillRect(bx - 18, 28, 36, 3);

    // Main sidepod body (Red for Player #1, Palette body for Rivals)
    ctx.fillStyle = pal.shade;
    ctx.fillRect(bx - 18, 19, 36, 9);
    ctx.fillStyle = pal.body;
    ctx.fillRect(bx - 17, 17, 34, 9);

    // Crisp White & Royal-Blue 1982 Brabham/Namco Upper Racing Deck
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(bx - 15, 16, 30, 4);
    ctx.fillStyle = pal.trim;
    ctx.fillRect(bx - 14, 19, 28, 2);

    // Dark front radiator ducts inside sidepods
    ctx.fillStyle = '#12141c';
    ctx.fillRect(bx - 16, 17, 5, 3);
    ctx.fillRect(bx + 11, 17, 5, 3);

    // Sculpted central engine cover spine
    ctx.fillStyle = pal.hi;
    ctx.fillRect(bx - 4, 15, 8, 9);
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(bx - 6, 16, 2, 8);
    ctx.fillRect(bx + 4, 16, 2, 8);

    // 4. Open Cockpit, Chrome Roll-Hoop & Driver Helmet (Tilts into turn!)
    const hx = bx + (steer > 0 ? 1 : (steer < 0 ? -1 : 0));
    // Cockpit surround
    ctx.fillStyle = '#141820';
    ctx.fillRect(hx - 6, 12, 12, 5);
    // Chrome roll-hoop arch
    ctx.fillStyle = '#dce4f2';
    ctx.fillRect(hx - 2, 6, 4, 3);
    ctx.fillStyle = '#7c889c';
    ctx.fillRect(hx - 3, 8, 1, 3);
    ctx.fillRect(hx + 2, 8, 1, 3);
    // Driver Helmet (White/Blue for Player #1!)
    ctx.fillStyle = pal.helmet;
    ctx.fillRect(hx - 4, 8, 8, 6);
    ctx.fillRect(hx - 3, 7, 6, 1);
    ctx.fillStyle = pal.helmetStripe;
    ctx.fillRect(hx - 1, 7, 2, 3);
    // Dark visor + cyan reflection pixel
    ctx.fillStyle = '#10182c';
    ctx.fillRect(hx - 3, 10, 6, 2);
    ctx.fillStyle = '#68e0ff';
    ctx.fillRect(hx - 2, 10, 2, 1);

    // 5. Massive Exposed Black Rear Slicks + Silver Inner Axle Shafts
    ctx.fillStyle = '#8894a8';
    ctx.fillRect(cx - 20, 26, 40, 2);
    ctx.fillStyle = '#384050';
    ctx.fillRect(cx - 20, 28, 40, 2);

    const rearW = isPlayer ? 13 : 12;
    const rearH = isPlayer ? 16 : 15;
    const rearY = h - rearH - 1;
    drawSlickTire(cx - 17 - rearW, rearY, rearW, rearH, tirePhase, 0);
    drawSlickTire(cx + 17, rearY, rearW, rearH, tirePhase, 0);

    // Inner Metallic Wheel Rim Hubs
    ctx.fillStyle = '#b8c4d8';
    ctx.fillRect(cx - 18, rearY + 5, 2, 6);
    ctx.fillRect(cx + 16, rearY + 5, 2, 6);

    // 6. Towering 1982 Rear Wing + "#1" Emblem + Gearbox Diffuser & Twin Exhausts
    const wx = cx + (steer > 0 ? 1 : (steer < 0 ? -1 : 0));
    // Rear wing endplates
    ctx.fillStyle = pal.body;
    ctx.fillRect(wx - 15, 12, 2, 12);
    ctx.fillRect(wx + 13, 12, 2, 12);
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(wx - 15, 12, 2, 4);
    ctx.fillRect(wx + 13, 12, 2, 4);

    // Main horizontal airfoil plane
    ctx.fillStyle = pal.wing;
    ctx.fillRect(wx - 13, 13, 26, 4);
    ctx.fillStyle = pal.trim;
    ctx.fillRect(wx - 13, 17, 26, 2);
    ctx.fillStyle = '#181c28';
    ctx.fillRect(wx - 13, 19, 26, 1);

    // Crisp "#1" pixel badge on Player's rear wing chord
    if (isPlayer) {
      ctx.fillStyle = '#ec1c18';
      ctx.fillRect(wx - 5, 14, 10, 2);
      ctx.fillStyle = '#fcf400';
      ctx.fillRect(wx, 13, 1, 4);
      ctx.fillRect(wx - 1, 14, 1, 1);
    }

    // Central Gearbox Housing, Twin Exhaust Pipes & Red Rain Light
    ctx.fillStyle = '#202430';
    ctx.fillRect(wx - 5, 24, 10, 9);
    ctx.fillStyle = '#3c4456';
    ctx.fillRect(wx - 4, 25, 8, 5);

    // Twin chrome megaphone exhausts
    ctx.fillStyle = '#c8d4e8';
    ctx.fillRect(wx - 4, 29, 3, 3);
    ctx.fillRect(wx + 1, 29, 3, 3);
    ctx.fillStyle = '#08080c';
    ctx.fillRect(wx - 3, 30, 1, 1);
    ctx.fillRect(wx + 2, 30, 1, 1);

    // Glowing Ruby FIA Rain/Tail Lamp
    ctx.fillStyle = '#ff2020';
    ctx.fillRect(wx - 1, 26, 2, 2);
    ctx.fillStyle = '#ff9898';
    ctx.fillRect(wx - 1, 26, 1, 1);

    return canvas;
  }

  _buildExplosionSprites() {
    // 4-Frame Fiery Blocky 1982 Namco Pixel Fireball (76x56 px, 2x2 arcade pixel blocks!)
    const W = 76;
    const H = 56;
    const frames = [];

    for (let f = 0; f < 4; f++) {
      const { canvas, ctx } = makeOffscreenCanvas(W, H);
      const cx = W >> 1;
      const cy = H - 18 - f * 2;
      const baseRad = 15 + f * 5;

      // Deterministic pseudo-random blocky explosion lobes
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
            if (f === 3 && ratio > 0.55 && ((bx + by) & 2) === 0) continue; // Dissipating outer smoke gaps
            if (ratio < 0.28 && f < 3) {
              ctx.fillStyle = '#ffffff';
            } else if (ratio < 0.52) {
              ctx.fillStyle = '#fcf400';
            } else if (ratio < 0.74) {
              ctx.fillStyle = '#fc7800';
            } else if (ratio < 0.90) {
              ctx.fillStyle = '#fc1800';
            } else {
              ctx.fillStyle = f >= 2 ? '#3c3438' : '#a80800';
            }
            ctx.fillRect(bx, by, 2, 2);
          }
        }
      }

      // Flying fiery pixel sparks & red/white wing shards
      const shardAngles = [0.3, 0.85, 1.4, 1.95, 2.5, 2.9, -0.4, -2.7];
      for (let i = 0; i < shardAngles.length; i++) {
        const a = shardAngles[i];
        const r = 12 + f * 7 + (i % 3) * 3;
        const sx = Math.round(cx + Math.cos(a) * r);
        const sy = Math.round(cy - Math.abs(Math.sin(a)) * r * 0.85);
        if (sx >= 2 && sx < W - 4 && sy >= 2 && sy < H - 4) {
          ctx.fillStyle = i % 3 === 0 ? '#f8f8f8' : (i % 2 === 0 ? '#fcf400' : '#fc2018');
          ctx.fillRect(sx, sy, 3, 2);
        }
      }

      frames.push(canvas);
    }
    return frames;
  }

  _buildFlyingWheelSprites() {
    // 2 rotating phases of a flying black F1 slick wheel (14x16 px — bold dark rubber + subtle silver hub + tread glint)
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
      // Compact metallic wheel hub & rotating white tread highlight bar
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
    // 10 Authentic 1982 Roadside Arcade Billboards (144x92 px with bold 2x pixel strokes so downscaling stays razor-legible!)
    const defs = [
      { id: 'NAMCO',         bg: '#f8f8f8', border: '#fc1800', accent: '#1850e8', top: 'NAMCO',     bot: 'ORIGINAL 1982', fg: '#fc1800' },
      { id: 'POLE_POSITION', bg: '#1038a8', border: '#fcf400', accent: '#fc1800', top: 'POLE POS',  bot: 'GRAND PRIX',    fg: '#fcf400' },
      { id: 'PAC_MAN',       bg: '#080c24', border: '#2048f8', accent: '#fcf400', top: 'PAC-MAN',   bot: 'NAMCO ARCADE',  fg: '#fcf400' },
      { id: 'DIG_DUG',       bg: '#e8f4ff', border: '#1868fc', accent: '#fc3800', top: 'DIG DUG',   bot: 'NAMCO 1982',    fg: '#1850e8' },
      { id: 'GALAGA',        bg: '#081030', border: '#fc1800', accent: '#00d8f8', top: 'GALAGA',    bot: 'SPACE FIGHTER', fg: '#00fc58' },
      { id: 'XEVIOUS',       bg: '#1c283c', border: '#d0dce8', accent: '#00d8f8', top: 'XEVIOUS',   bot: 'SOLVALOU',      fg: '#f8f8f8' },
      { id: 'MAPPY',         bg: '#fff4d8', border: '#fc2818', accent: '#1868fc', top: 'MAPPY',     bot: 'MICRO POLICE',  fg: '#fc2018' },
      { id: 'FUJI',          bg: '#f8f8f8', border: '#1850e8', accent: '#fc1800', top: 'FUJI GP',   bot: 'SPEEDWAY 82',   fg: '#102040' },
      { id: 'CENTIPEDE',     bg: '#280c3c', border: '#00fc58', accent: '#fc2868', top: 'CENTIPEDE', bot: 'ARCADE 1982',   fg: '#00fc58' },
      { id: 'CHAMPION',      bg: '#f8f8f8', border: '#141820', accent: '#fc1800', top: 'CHAMPION',  bot: 'SPARK PLUGS',   fg: '#10141c' },
    ];

    return defs.map((d) => {
      const W = 144;
      const H = 92;
      const bH = 72;
      const { canvas, ctx } = makeOffscreenCanvas(W, H);

      // Steel support legs & highlights
      ctx.fillStyle = '#384050';
      ctx.fillRect(26, bH, 9, H - bH);
      ctx.fillRect(W - 35, bH, 9, H - bH);
      ctx.fillStyle = '#aeb8cc';
      ctx.fillRect(28, bH, 3, H - bH);
      ctx.fillRect(W - 33, bH, 3, H - bH);

      // Outer cabinet frame + bold arcade border + inner fill
      ctx.fillStyle = '#0c1018';
      ctx.fillRect(0, 0, W, bH);
      ctx.fillStyle = d.border;
      ctx.fillRect(2, 2, W - 4, bH - 4);
      ctx.fillStyle = d.bg;
      ctx.fillRect(7, 7, W - 14, bH - 14);

      // Bottom racing stripe bar
      ctx.fillStyle = d.accent;
      ctx.fillRect(7, bH - 22, W - 14, 15);

      // Custom Bold 1982 Pixel-Art Character / Emblem + 2x Headline!
      if (d.id === 'PAC_MAN') {
        // Big Yellow Pac-Man + Pellet + Blinky Red Ghost
        ctx.fillStyle = '#fcf400';
        ctx.fillRect(12, 15, 16, 16);
        ctx.fillStyle = d.bg;
        ctx.fillRect(21, 20, 8, 6);
        ctx.fillRect(24, 18, 5, 10);
        // Blinky Ghost on Right
        ctx.fillStyle = '#fc1800';
        ctx.fillRect(116, 15, 16, 16);
        ctx.fillStyle = '#f8f8f8';
        ctx.fillRect(118, 18, 4, 5);
        ctx.fillRect(125, 18, 4, 5);
        ctx.fillStyle = '#1850e8';
        ctx.fillRect(119, 20, 2, 3);
        ctx.fillRect(126, 20, 2, 3);
        drawRawPixelText(ctx, 'PAC-MAN', 33, 17, d.fg, 2, '#000000');
      } else if (d.id === 'DIG_DUG') {
        // Bold Red Pooka with Yellow Goggles
        ctx.fillStyle = '#fc2818';
        ctx.fillRect(12, 15, 18, 16);
        ctx.fillStyle = '#fcf400';
        ctx.fillRect(14, 19, 14, 6);
        ctx.fillStyle = '#10141c';
        ctx.fillRect(16, 21, 3, 2);
        ctx.fillRect(23, 21, 3, 2);
        drawRawPixelText(ctx, 'DIG DUG', 36, 17, d.fg, 2, null);
      } else if (d.id === 'GALAGA') {
        // Galaga Dual-Wing Starfighter
        ctx.fillStyle = '#f8f8f8';
        ctx.fillRect(19, 14, 4, 18);
        ctx.fillRect(13, 22, 16, 7);
        ctx.fillStyle = '#fc1800';
        ctx.fillRect(11, 19, 4, 12);
        ctx.fillRect(27, 19, 4, 12);
        drawRawPixelText(ctx, 'GALAGA', 42, 17, d.fg, 2, '#000000');
      } else if (d.id === 'FUJI') {
        // Red Sun Disc + Mini Mt. Fuji Cone
        ctx.fillStyle = '#fc1800';
        ctx.fillRect(15, 13, 14, 14);
        ctx.fillStyle = '#2c4c78';
        ctx.fillRect(11, 25, 24, 7);
        ctx.fillRect(16, 20, 14, 5);
        ctx.fillStyle = '#f8f8f8';
        ctx.fillRect(18, 20, 10, 3);
        drawRawPixelText(ctx, 'FUJI GP', 42, 17, d.fg, 2, null);
      } else if (d.id === 'POLE_POSITION') {
        // Checkered Flag Emblem on Left
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? '#f8f8f8' : '#101010';
            ctx.fillRect(12 + c * 4, 15 + r * 4, 4, 4);
          }
        }
        drawRawPixelText(ctx, 'POLE POS', 34, 17, d.fg, 2, '#000000');
      } else if (d.id === 'CHAMPION') {
        ctx.fillStyle = '#fc1800';
        ctx.fillRect(10, 11, W - 20, 6);
        drawRawPixelText(ctx, 'CHAMPION', 24, 21, d.fg, 2, null);
      } else {
        const scale = d.top.length >= 9 ? 2 : 2;
        const stepW = d.top.length * 12;
        const tx = Math.max(10, ((W - stepW) >> 1));
        drawRawPixelText(ctx, d.top, tx, 17, d.fg, scale, d.bg === '#f8f8f8' ? null : '#000000');
      }

      // Crisp Bottom Subtitle Bar
      const subFg = d.accent === '#fcf400' ? '#10141c' : '#f8f8f8';
      const bx = Math.max(10, ((W - d.bot.length * 6) >> 1));
      drawRawPixelText(ctx, d.bot, bx, bH - 18, subFg, 1, null);

      return canvas;
    });
  }

  _buildBrakingBoardSprites() {
    // FIA 150m / 100m / 50m Roadside Braking Distance Marker Boards (46x60 px with 2x numerals!)
    const map = {};
    for (const dist of [150, 100, 50]) {
      const { canvas, ctx } = makeOffscreenCanvas(46, 60);
      ctx.fillStyle = '#8894a8';
      ctx.fillRect(20, 40, 6, 20);
      ctx.fillStyle = '#0c1018';
      ctx.fillRect(1, 1, 44, 40);
      ctx.fillStyle = '#f8f8f8';
      ctx.fillRect(3, 3, 40, 36);
      ctx.fillStyle = '#086c24';
      ctx.fillRect(6, 6, 34, 30);

      const txt = String(dist);
      const tx = Math.max(5, ((46 - txt.length * 12) >> 1));
      drawRawPixelText(ctx, txt, tx, 9, '#f8f8f8', 2, '#000000');
      drawRawPixelText(ctx, 'METERS', 6, 26, '#fcf400', 1, null);
      map[dist] = canvas;
    }
    return map;
  }

  _buildScenicPropSprites() {
    // Non-collidable outer pixel trees & #1 PIT box sign for lush 1982 roadside motion
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
    drawRawPixelText(pitSign.ctx, '#1', 12, 15, '#fcf400', 1, '#000000');

    const palm = makeOffscreenCanvas(30, 46);
    palm.ctx.fillStyle = '#7c4c24';
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
    drawRawPixelText(neonSign.ctx, '777', 8, 8, '#fcf400', 1, '#000000');
    drawRawPixelText(neonSign.ctx, 'VIP', 8, 18, '#00f4ff', 1, '#000000');

    // 2-Frame Animated 1982 Pixel Pit-Crew Mechanic with Lollipop Sign & Spare Slick!
    const buildPitCrew = (waveUp) => {
      const pc = makeOffscreenCanvas(28, 34);
      const c = pc.ctx;
      // Spare black slick tire beside mechanic
      c.fillStyle = '#141820';
      c.fillRect(2, 22, 8, 11);
      c.fillStyle = '#d8e0ec';
      c.fillRect(4, 25, 4, 5);
      // Mechanic white/red F1 overalls + yellow helmet
      c.fillStyle = '#f8f8f8';
      c.fillRect(12, 16, 8, 10);
      c.fillStyle = '#e4181c';
      c.fillRect(12, 20, 8, 3);
      c.fillRect(12, 26, 3, 7);
      c.fillRect(17, 26, 3, 7);
      c.fillStyle = '#fcf400';
      c.fillRect(13, 10, 6, 6);
      c.fillStyle = '#1858f8';
      c.fillRect(14, 12, 4, 2);
      // Waving lollipop / pit board arm
      const armY = waveUp ? 4 : 7;
      c.fillStyle = '#dce4f0';
      c.fillRect(21, armY + 6, 2, 14);
      c.fillStyle = '#fc1800';
      c.fillRect(18, armY, 8, 7);
      c.fillStyle = '#fcf400';
      c.fillRect(20, armY + 2, 4, 3);
      return pc.canvas;
    };

    // Animated Trackside FIA Marshal Post + Waving Flag Marshal (Green, Yellow, Blue, Checkered)
    const buildMarshal = (flagType, waveAlt) => {
      const m = makeOffscreenCanvas(30, 38);
      const c = m.ctx;
      // White/blue marshal post shelter box at base
      c.fillStyle = '#dce4f2';
      c.fillRect(2, 24, 10, 13);
      c.fillStyle = '#1858f8';
      c.fillRect(2, 24, 10, 3);
      // Marshal in orange safety suit + white helmet
      c.fillStyle = '#fc6800';
      c.fillRect(10, 18, 7, 11);
      c.fillRect(10, 29, 3, 8);
      c.fillRect(14, 29, 3, 8);
      c.fillStyle = '#f8f8f8';
      c.fillRect(11, 13, 5, 5);
      c.fillRect(10, 22, 7, 2);
      // Flagpole + waving flag
      const fy = waveAlt ? 3 : 6;
      c.fillStyle = '#d8e0ec';
      c.fillRect(17, fy, 2, 20);
      const fw = 11;
      const fh = 8;
      if (flagType === 'CHECKERED') {
        for (let r = 0; r < 4; r++) {
          for (let col = 0; col < 5; col++) {
            c.fillStyle = ((r + col + (waveAlt ? 1 : 0)) & 1) === 0 ? '#f8f8f8' : '#101010';
            c.fillRect(19 + col * 2, fy + r * 2 + ((col & 1) && waveAlt ? 1 : 0), 2, 2);
          }
        }
      } else {
        const hex =
          flagType === 'YELLOW' ? '#fcf400' : (flagType === 'BLUE' ? '#2888ff' : '#00fc58');
        const shade =
          flagType === 'YELLOW' ? '#d8a800' : (flagType === 'BLUE' ? '#1450b8' : '#00a838');
        c.fillStyle = '#0c1018';
        c.fillRect(18, fy - 1, fw + 2, fh + 2);
        c.fillStyle = hex;
        c.fillRect(19, fy, fw, fh);
        c.fillStyle = shade;
        c.fillRect(22, fy + (waveAlt ? 1 : 3), 5, 4);
      }
      return m.canvas;
    };

    // Giant Waving Grandstand Supporter Team Flags (Red, Papaya, Cyan, Gold)
    const buildGrandstandFlag = (primaryHex, accentHex, waveAlt) => {
      const gf = makeOffscreenCanvas(34, 42);
      const c = gf.ctx;
      c.fillStyle = '#dce4f2';
      c.fillRect(5, 4, 2, 37);
      const waveOff = waveAlt ? 2 : 0;
      c.fillStyle = '#0c1018';
      c.fillRect(7, 4 + waveOff, 24, 15);
      c.fillStyle = primaryHex;
      c.fillRect(8, 5 + waveOff, 22, 13);
      c.fillStyle = accentHex;
      c.fillRect(8, 10 + waveOff, 22, 3);
      c.fillStyle = '#f8f8f8';
      c.fillRect(11, 7 + waveOff, 4, 4);
      return gf.canvas;
    };

    return {
      pine: pine.canvas,
      sakura: sakura.canvas,
      palm: palm.canvas,
      autumnPine: autumnPine.canvas,
      neonSign: neonSign.canvas,
      pitSign: pitSign.canvas,
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
      flagRed0: buildGrandstandFlag('#e4181c', '#fcf400', false),
      flagRed1: buildGrandstandFlag('#e4181c', '#fcf400', true),
      flagPapaya0: buildGrandstandFlag('#ff7800', '#1858f8', false),
      flagPapaya1: buildGrandstandFlag('#ff7800', '#1858f8', true),
      flagCyan0: buildGrandstandFlag('#00e4dc', '#101824', false),
      flagCyan1: buildGrandstandFlag('#00e4dc', '#101824', true),
      flagGold0: buildGrandstandFlag('#fcf400', '#10141c', false),
      flagGold1: buildGrandstandFlag('#fcf400', '#10141c', true),
    };
  }

  _buildGantrySprites() {
    // Overhead Start/Finish Gantry ("POLE POSITION" & "PREPARE TO QUALIFY") + Mid-Lap Bridge (320x148 px bold 2x typography!)
    const buildBanner = (headline, subline, bgHex, accentHex, hasLightPods) => {
      const W = 320;
      const H = 148;
      const { canvas, ctx } = makeOffscreenCanvas(W, H);

      // Left & Right Pixel Lattice Truss Towers
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

      // Overhead Steel Space-Frame Crossbeams
      ctx.fillStyle = '#c8d4e8';
      ctx.fillRect(16, 6, W - 32, 4);
      ctx.fillRect(16, 48, W - 32, 4);

      // Wide Arcade Overhead Signboard
      ctx.fillStyle = '#10141c';
      ctx.fillRect(22, 10, W - 44, 40);
      ctx.fillStyle = accentHex;
      ctx.fillRect(24, 12, W - 48, 36);
      ctx.fillStyle = bgHex;
      ctx.fillRect(28, 15, W - 56, 30);

      // Left & Right Checkered Flag End-Caps
      for (const fx of [31, W - 51]) {
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 4; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? '#f8f8f8' : '#101010';
            ctx.fillRect(fx + c * 5, 17 + r * 5, 5, 5);
          }
        }
      }

      // Crisp 2x Bold Headline & Subline
      const hScale = headline.length <= 16 ? 2 : 1;
      const hStep = headline.length * (6 * hScale);
      const hx = Math.max(54, ((W - hStep) >> 1));
      drawRawPixelText(ctx, headline, hx, hScale === 2 ? 17 : 20, '#fcf400', hScale, '#000000');

      const sx = Math.max(54, ((W - subline.length * 6) >> 1));
      drawRawPixelText(ctx, subline, sx, 34, '#f8f8f8', 1, '#000000');

      // 5 Suspended Start-Lamp Housings (Unlit base; lit bulbs overlaid live!)
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
      race: buildBanner('POLE POSITION', 'NAMCO FUJI GP 1982', '#c8141c', '#fcf400', true),
      qualify: buildBanner('QUALIFYING LAP', 'PREPARE TO QUALIFY!', '#1444b8', '#fcf400', true),
      bridge: buildBanner('NAMCO FUJI GP', 'SECTOR CHECKPOINT', '#0c5c34', '#f8f8f8', false),
    };
  }

  _buildMomoWheelSprites() {
    // 9 Pre-Baked Pixel-Art Angles (-4..+4, -64 deg .. +64 deg) of a 3-Spoke MOMO Leather Wheel + Nomex Racing Gloves!
    const sprites = [];
    const W = 76;
    const H = 64;
    const cx = 38;
    const cy = 34;
    const outerR = 23;
    const innerR = 18;

    for (let step = -4; step <= 4; step++) {
      const ang = (step / 4) * 1.12; // +-64 deg max visual lock
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const { canvas, ctx } = makeOffscreenCanvas(W, H);

      // 1. Brushed Aluminum 3-Spoke Core (9 o'clock, 3 o'clock, 6 o'clock rotated by ang)
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
            ctx.fillStyle = Math.abs(w) === 2 ? '#181c24' : (w === 0 ? '#dce6f4' : '#8c98ac');
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }

      // 2. Stitched Black MOMO Perforated Leather Rim + Yellow 12-o'clock Top Centering Stripe
      const topX = cx + Math.sin(ang) * ((outerR + innerR) * 0.5);
      const topY = cy - Math.cos(ang) * ((outerR + innerR) * 0.5);
      for (let y = cy - outerR - 1; y <= cy + outerR + 1; y++) {
        for (let x = cx - outerR - 1; x <= cx + outerR + 1; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= innerR - 0.5 && dist <= outerR + 0.5) {
            if (dist < innerR + 0.6 || dist > outerR - 0.6) {
              ctx.fillStyle = '#080a10';
            } else {
              const dTop = Math.hypot(x - topX, y - topY);
              if (dTop <= 2.7) {
                ctx.fillStyle = '#fcf400';
              } else {
                ctx.fillStyle = (dx + dy < 0) ? '#323846' : '#1c202a';
              }
            }
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }

      // 3. Center MOMO Hub Boss + Red/Gold #1 Horn Emblem
      for (let y = cy - 7; y <= cy + 7; y++) {
        for (let x = cx - 7; x <= cx + 7; x++) {
          const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
          if (d2 <= 49) {
            ctx.fillStyle = d2 > 34 ? '#0c1018' : (d2 > 16 ? '#283040' : '#e4181c');
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
      ctx.fillStyle = '#fcf400';
      ctx.fillRect(cx - 1, cy - 2, 2, 5);

      // 4. Left & Right Nomex Racing Gloves + Moulded Carbon Knuckles + Forearm Cuffs at 9 & 3 o'clock!
      const gripAngles = [Math.PI + ang, 0 + ang];
      for (let g = 0; g < 2; g++) {
        const ga = gripAngles[g];
        const gx = Math.round(cx + Math.cos(ga) * 20.5);
        const gy = Math.round(cy + Math.sin(ga) * 20.5);

        // White/Red Nomex Forearm Sleeve extending down into cockpit
        const cuffBaseX = g === 0 ? cx - 22 : cx + 22;
        for (let t = 0; t <= 12; t++) {
          const u = t / 12;
          const sx = Math.round(gx + (cuffBaseX - gx) * u);
          const sy = Math.round(gy + 5 + (H - 1 - (gy + 5)) * u);
          if (sy < H) {
            ctx.fillStyle = '#10141c';
            ctx.fillRect(sx - 6, sy, 12, 2);
            ctx.fillStyle = t < 3 ? '#f8f8f8' : '#d8181c';
            ctx.fillRect(sx - 5, sy, 10, 2);
            if (t >= 4 && t <= 6) {
              ctx.fillStyle = '#fcf400';
              ctx.fillRect(sx - 4, sy, 8, 1);
            }
          }
        }

        // Nomex Glove Fist + Carbon Knuckle Guard gripping rim
        ctx.fillStyle = '#080c14';
        ctx.fillRect(gx - 6, gy - 5, 12, 11);
        ctx.fillStyle = '#e4181c';
        ctx.fillRect(gx - 5, gy - 4, 10, 9);
        ctx.fillStyle = '#f8f8f8';
        ctx.fillRect(gx - 4, gy - 3, 8, 3);
        // Thumb wrapping inward over spoke
        const thumbDir = g === 0 ? 4 : -6;
        ctx.fillStyle = '#181c24';
        ctx.fillRect(gx + thumbDir, gy - 2, 3, 4);
      }

      sprites.push(canvas);
    }
    return sprites;
  }

  _rebuildCrtOverlay(w, h) {
    const { canvas, ctx } = makeOffscreenCanvas(w, h);
    // Subtle 1982 CRT horizontal scanline shadow every 2nd pixel row
    ctx.fillStyle = 'rgba(0, 0, 0, 0.17)';
    for (let y = 1; y < h; y += 2) {
      ctx.fillRect(0, y, w, 1);
    }
    // Subtle arcade tube corner vignette
    const grad = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.36,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.74
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    this._crtCanvas = canvas;
  }

  // ==========================================================================
  // ZERO-ALLOCATION TRACK SPLINE HELPERS
  // ==========================================================================

  _readTrackElevationAndYaw(track, s) {
    const samples = track?.samples;
    if (Array.isArray(samples) && samples.length > 4) {
      const len = samples.length;
      const sw = wrapS(s);
      const fIdx = (sw / TRACK_GAME_LENGTH) * len;
      const i0 = ((Math.floor(fIdx) % len) + len) % len;
      const i1 = (i0 + 1) % len;
      const frac = fIdx - Math.floor(fIdx);
      const a = samples[i0];
      const b = samples[i1];
      const elev = a.pos.y + (b.pos.y - a.pos.y) * frac;
      const tx = a.tangent.x + (b.tangent.x - a.tangent.x) * frac;
      const tz = a.tangent.z + (b.tangent.z - a.tangent.z) * frac;
      return { elev, yaw: Math.atan2(tx, tz) };
    }
    if (track && typeof track.sampleAt === 'function') {
      const smp = track.sampleAt(s, 0);
      return { elev: smp?.pos?.y || 0, yaw: smp?.headingYaw || 0 };
    }
    return { elev: 0, yaw: 0 };
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
    // Smooth analytic fallback matching PIT_LANE_CONFIG
    if (sw >= 912 && sw < 946) {
      const u = (sw - 912) / 34.0;
      return ROAD_HALF_WIDTH * 0.6 + (PIT_LANE_CONFIG.lateralOffset - ROAD_HALF_WIDTH * 0.6) * u;
    }
    if (sw >= 946 || sw <= 68) return PIT_LANE_CONFIG.lateralOffset;
    const u = (sw - 68) / 42.0;
    return PIT_LANE_CONFIG.lateralOffset + (ROAD_HALF_WIDTH * 0.6 - PIT_LANE_CONFIG.lateralOffset) * u;
  }

  // ==========================================================================
  // MAIN 60FPS ARCADE RASTER-SCANLINE & SPRITE FRAME RENDERER
  // ==========================================================================

  // Alias `render` -> `renderFrame` so callers using either `retro1982.render(...)` or `retro1982.renderFrame(...)` work seamlessly!
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
      elapsedSec,
      crtScanlines = true,
      cameraIndex,
      pitServiceSubPhase = '',
      sectorDeltaPopup = null,
      crowdExcitement,
      raceSystems = null,
      lookApexNormalized = 0,
    } = params;

    const nowSec = Number.isFinite(elapsedSec) ? elapsedSec : performance.now() * 0.001;
    const rawDt = clamp(nowSec - this._lastElapsedSec, 0, 0.1);
    this._lastElapsedSec = nowSec;

    const camIdx = clamp(
      Math.round(Number.isFinite(cameraIndex) ? cameraIndex : (params.state?.cameraIndex ?? 0)),
      0,
      3
    );
    if (camIdx !== this._lastCamIdx) {
      this._lastCamIdx = camIdx;
      this._camBannerTimer = 1.85;
    } else if (this._camBannerTimer > 0) {
      this._camBannerTimer = Math.max(0, this._camBannerTimer - (rawDt || 0.016));
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
    const pS = wrapS(playerCar?.s ?? 0);
    const pLat = Number.isFinite(playerCar?.lateralOffset) ? playerCar.lateralOffset : 0;
    const pSpeed = Math.max(0, Number.isFinite(playerCar?.speedKmh) ? playerCar.speedKmh : 0);
    const pYaw = Number.isFinite(playerCar?.relYaw) ? playerCar.relYaw : 0;
    const pSteer = Number.isFinite(playerCar?.steerInput) ? playerCar.steerInput : 0;
    const pDistGame = Number.isFinite(playerCar?.totalDistanceGameM) ? playerCar.totalDistanceGameM : pS;
    const pExploded = !!playerCar?.exploded;

    if (pExploded) {
      if (Number.isFinite(playerCar?.explodeTimer) && playerCar.explodeTimer > 0) {
        this._playerBlastSec = clamp(2.1 - playerCar.explodeTimer, 0, 2.1);
      } else {
        this._playerBlastSec = Math.min(2.1, this._playerBlastSec + (rawDt || 0.016));
      }
    } else {
      this._playerBlastSec = 0;
    }

    const mPerGameM =
      track && Number.isFinite(track.realMetersPerGameMeter) && track.realMetersPerGameMeter > 0.5
        ? track.realMetersPerGameMeter
        : REAL_METERS_PER_GAME_METER;

    // 1. Sample Local Elevation Slope & Unwrapped World Heading for Smooth Parallax
    const herePose = this._readTrackElevationAndYaw(track, pS);
    const aheadPose = this._readTrackElevationAndYaw(track, pS + 14.0 / mPerGameM);
    const roadSlope = (aheadPose.elev - herePose.elev) / 14.0;

    const totalYaw = herePose.yaw - pYaw * 0.65;
    if (!this._hasPrevYaw) {
      this._unwrappedYaw = totalYaw;
      this._prevRawYaw = totalYaw;
      this._hasPrevYaw = true;
    } else {
      let dYaw = totalYaw - this._prevRawYaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      this._unwrappedYaw += dYaw;
      this._prevRawYaw = totalYaw;
    }

    // Explosion screen-shake micro-jolt during initial blast impact
    const blastShakeY =
      pExploded && this._playerBlastSec < 0.55
        ? (((nowSec * 60) | 0) % 2 === 0 ? -2 : 2)
        : 0;

    // Compute Horizon Y, 3D Suspension Pitch/Roll & Camera-Mode Perspective (Pixel 11 Pro Portrait H > 275 lifts cockpit/car above touch controls!)
    const isPortrait = H > 275;
    const chassisPitch = Number.isFinite(playerCar?.chassisPitchRad) ? playerCar.chassisPitchRad : 0;
    const chassisRoll = Number.isFinite(playerCar?.chassisRollRad) ? playerCar.chassisRollRad : 0;
    const suspPitchPx = Math.round(clamp(chassisPitch * 140, -6, 6));
    const camHorizonDelta = camIdx === 1 ? 6 : (camIdx === 2 ? -3 : (camIdx === 3 ? -8 : 0));
    const pitchPx = clamp(Math.round(-roadSlope * 54) + suspPitchPx + camHorizonDelta, -15, 15);
    const baseHorizon = isPortrait ? Math.round(H * 0.36) : 120;
    const horizonY = isPortrait
      ? clamp(baseHorizon + pitchPx + blastShakeY, Math.round(H * 0.28), Math.round(H * 0.44))
      : clamp(120 + pitchPx + blastShakeY, 96, 140);

    // Track Crowd Excitement & Overtake "CROWD ROAR!" + Autonomous Sector Split Deltas (S1/S2/S3)
    const resolvedPosEarly = this._resolvePlayerPosition(playerPos, playerCar, allCars);
    if (state === GAME_STATES.RACING && this._prevPlayerPos > 0 && resolvedPosEarly < this._prevPlayerPos) {
      this._crowdRoarTimer = 2.4;
      this._crowdExcitement = 1.0;
    }
    this._prevPlayerPos = resolvedPosEarly;
    if (this._crowdRoarTimer > 0) {
      this._crowdRoarTimer = Math.max(0, this._crowdRoarTimer - (rawDt || 0.016));
    }
    if (Number.isFinite(crowdExcitement) && crowdExcitement > this._crowdExcitement) {
      this._crowdExcitement = clamp(crowdExcitement, 0, 1);
    } else if (pSpeed > 295 || playerCar?.drsActive) {
      this._crowdExcitement = Math.max(this._crowdExcitement, 0.55);
    } else {
      this._crowdExcitement = Math.max(0, this._crowdExcitement - (rawDt || 0.016) * 0.35);
    }

    const curSectorIdx = pS < 333.3 ? 0 : (pS < 666.6 ? 1 : 2);
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
          this._autoSectorTimer = 2.6;
        }
        this._prevSectorIdx = curSectorIdx;
        this._sectorStartSec = nowSec;
      }
    } else {
      this._prevSectorIdx = curSectorIdx;
      this._sectorStartSec = nowSec;
    }
    if (this._autoSectorTimer > 0) {
      this._autoSectorTimer = Math.max(0, this._autoSectorTimer - (rawDt || 0.016));
    }

    // 2. Determine Sky / Weather / Biome Palette (Fuji defaults to iconic 1982 Namco Cyan-Blue!)
    const trackId = track?.trackId || track?.trackDef?.id || 'FUJI_1982';
    const trackTheme = track?.trackDef?.theme || 'FUJI';
    const forceNight = !!track?.trackDef?.forceNight || trackId === 'VEGAS_NEON' || !!weather?.isNightActive || weather?.currentRegimeId === 'NEON_NIGHT';
    const regimeId = forceNight ? 'NEON_NIGHT' : (weather?.currentRegimeId || 'HOT_SUNNY');
    const isRainy = regimeId === 'LIGHT_DRIZZLE' || regimeId === 'MONSOON_STORM' || (weather?.grooveMoisture || 0) > 0.30;
    const isSunset = regimeId === 'GOLDEN_SUNSET' || (!forceNight && !isRainy && trackId === 'MONZA_TEMPLE' && weather?.currentRegimeId === 'GOLDEN_SUNSET');
    const isOvercast = regimeId === 'OVERCAST_COOL' || (!forceNight && !isRainy && trackId === 'SILVERSTONE_GP');

    // 3. Render 1:1 1982 Namco Sky, Clouds, Parallax Mount Fuji & Circuit-Specific Horizon Landmarks
    this._renderSkyAndHorizon(W, horizonY, {
      trackId,
      trackTheme,
      forceNight,
      isSunset,
      isRainy,
      isOvercast,
      lightningFlash: weather?.lightningFlash || 0,
      nowSec,
    });

    // 4. Integrate World Curvature & Hill Elevation Forward (0 .. 190m in 2m steps)
    let curveHeading = 0.0;
    let curveLatM = 0.0;
    this._worldCurveM[0] = 0.0;
    this._worldElevM[0] = 0.0;

    for (let k = 1; k < WORLD_STEPS; k++) {
      const dReal = k * WORLD_STEP_M;
      const dGame = dReal / mPerGameM;
      const kPhys = track && typeof track.getPhysicsCurvature === 'function'
        ? track.getPhysicsCurvature(pS + dGame)
        : 0.0;
      // In FujiTrack, rawCurv = radPerMeter * 82.0; scale slightly for exhilarating 1982 Namco corner sweep!
      const radPerM = (kPhys / 82.0) * 1.12;
      curveHeading += radPerM * WORLD_STEP_M;
      curveLatM += curveHeading * WORLD_STEP_M;
      this._worldCurveM[k] = curveLatM;

      // Subtle rolling crest/dip relative to local tangent plane
      const stepPose = this._readTrackElevationAndYaw(track, pS + dGame);
      this._worldElevM[k] = (stepPose.elev - herePose.elev) - roadSlope * dReal;
    }

    // 5. Render Perspective Scanline Road (From Bottom y = H - 1 up to y = horizonY)
    // In Portrait (H > 275), anchor NEAR_DIST_M right under the lifted Player #1 car / cockpit cowling so rivals & road width match 1:1!
    const refBottomY = isPortrait ? H - Math.round(H * 0.25) + 4 : H - 1;
    const roadSpanRows = Math.max(1, refBottomY - horizonY);
    const camRoadZoom = camIdx === 3 ? 1.12 : (camIdx === 2 ? 1.06 : 1.0);
    const baseRoadHalfPx = Math.round(
      (isPortrait ? W * 0.46 : clamp(W * 0.42, 76, 212)) * camRoadZoom
    );
    const puddles = Array.isArray(track?.puddles) ? track.puddles : null;
    const puddlesActive = !!(
      puddles &&
      puddles.length > 0 &&
      (puddles[0].forceActive1982 ||
        puddles[0].mesh?.visible ||
        (weather?.grooveMoisture || 0) > 0.22 ||
        (weather?.offLineMoisture || 0) > 0.22)
    );
    const tunnelRange = track?.trackDef?.tunnelRangeS || null;
    const isMonza = trackTheme === 'MONZA';

    const playerWorldMeters = pDistGame * mPerGameM;
    const apexPan = Number.isFinite(lookApexNormalized) ? lookApexNormalized : (playerCar?.lookApexNormalized || 0);
    const rollPanPx = camIdx >= 2 ? clamp(chassisRoll * 160, -7, 7) : 0;
    const yawVanishShiftPx = -(pYaw + apexPan * 0.18) * (W * 0.24) + rollPanPx;

    for (let y = H - 1; y >= horizonY; y--) {
      const v = (y - horizonY + 0.6) / (roadSpanRows + 0.6); // 1.0 at player axle -> ~0 at horizon
      const invZ = INV_Z_FAR + v * (INV_Z_NEAR - INV_Z_FAR);
      const distReal = Math.max(0.35, (1.0 / invZ) - CAM_Z_OFFSET_M);
      const scale = (NEAR_DIST_M + CAM_Z_OFFSET_M) * invZ; // 1.0 at NEAR_DIST_M -> ~0.04 at FAR_DIST_M

      // Interpolate integrated world curve at distReal
      const fStep = clamp(distReal / WORLD_STEP_M, 0, WORLD_STEPS - 1.001);
      const idx0 = fStep | 0;
      const frac = fStep - idx0;
      const worldCurveX =
        this._worldCurveM[idx0] + (this._worldCurveM[idx0 + 1] - this._worldCurveM[idx0]) * frac;

      const roadHalfPx = Math.max(2.5, baseRoadHalfPx * scale);
      const pxPerMeter = roadHalfPx / ROAD_HALF_WIDTH;

      // Shift road center opposite to playerCar.lateralOffset, plus integrated corner bend & yaw pan
      const playerShiftPx = -(pLat / ROAD_HALF_WIDTH) * roadHalfPx;
      const curveShiftPx = worldCurveX * pxPerMeter;
      const centerX = W * 0.5 + playerShiftPx + curveShiftPx + yawVanishShiftPx * (1.0 - v);

      this._lineDistM[y] = distReal;
      this._lineScale[y] = scale;
      this._lineCenterX[y] = centerX;
      this._lineRoadHalfPx[y] = roadHalfPx;

      const dGame = distReal / mPerGameM;
      const lineS = wrapS(pS + dGame);
      const absWorldM = playerWorldMeters + distReal;

      // Alternating world-space bands for 1982 Namco speed sensation!
      const grassBand = (Math.floor(absWorldM / 6.0) & 1) === 0;
      const curbBand = (Math.floor(absWorldM / 3.0) & 1) === 0;
      const dashBand = (Math.floor(absWorldM / 4.5) % 3) === 0;

      const inTunnel =
        tunnelRange && lineS >= tunnelRange[0] && lineS <= tunnelRange[1];

      // A. Full-width Grass / Tunnel Wall Scanline
      if (inTunnel) {
        ctx.fillStyle = grassBand ? '#242838' : '#1c202c';
      } else if (forceNight) {
        ctx.fillStyle = grassBand ? '#008c24' : '#00701c';
      } else {
        // Authentic vibrant 1982 Namco arcade green grass!
        ctx.fillStyle = grassBand ? '#00b800' : '#009c00';
      }
      ctx.fillRect(0, y, W, 1);

      const roadL = Math.round(centerX - roadHalfPx);
      const roadR = Math.round(centerX + roadHalfPx);
      const roadW = Math.max(2, roadR - roadL);
      const curbPx = Math.max(1, Math.round((CURB_WIDTH * 1.15) * pxPerMeter));

      // A2. Animated Pixel Grandstands with Rolling Mexican Stadium Wave! (Main Straight + Mid-Circuit Tribunes)
      const hasLeftGrandstand = !inTunnel && ((lineS >= 910 || lineS <= 190) || (lineS >= 590 && lineS <= 650));
      const hasRightGrandstand = !inTunnel && (lineS >= 380 && lineS <= 445);
      if ((hasLeftGrandstand || hasRightGrandstand) && scale > 0.055) {
        const waveSpeed = 6.5 + this._crowdExcitement * 7.5;
        const mexicanWave = Math.sin(absWorldM * 0.15 - nowSec * waveSpeed);
        const isWaveCrest = mexicanWave > 0.42;
        const crowdTick = ((nowSec * (9 + Math.round(this._crowdExcitement * 6))) | 0) + (y >> 1);
        const crowdCols = ['#fc2818', '#fcf400', '#00fc58', '#54dcff', '#ff58c8', '#f8f8f8'];
        const stepDot = Math.max(2, Math.round(1.3 * pxPerMeter));
        const standH = isWaveCrest ? 2 : 1;

        if (hasLeftGrandstand) {
          const standInL = Math.round(centerX - (ROAD_HALF_WIDTH + 4.8) * pxPerMeter);
          const standOutL = Math.max(0, Math.round(centerX - (ROAD_HALF_WIDTH + 14.2) * pxPerMeter));
          if (standInL > standOutL + 2) {
            ctx.fillStyle = grassBand ? '#344056' : '#283244';
            ctx.fillRect(standOutL, y, standInL - standOutL, 1);
            for (let cx = standOutL + 1; cx < standInL - 1; cx += stepDot) {
              const cIdx = (cx + crowdTick) % crowdCols.length;
              const isFlash = ((cx * 17 + ((nowSec * 16) | 0) * 7) % 47) === 0;
              ctx.fillStyle = isFlash ? '#ffffff' : (isWaveCrest && (cIdx & 1) === 0 ? '#fcf400' : crowdCols[cIdx]);
              ctx.fillRect(cx, y - (standH - 1), Math.max(1, stepDot - 1), standH);
            }
          }
        }
        if (hasRightGrandstand) {
          const standInR = Math.round(centerX + (ROAD_HALF_WIDTH + 4.8) * pxPerMeter);
          const standOutR = Math.min(W, Math.round(centerX + (ROAD_HALF_WIDTH + 14.2) * pxPerMeter));
          if (standOutR > standInR + 2) {
            ctx.fillStyle = grassBand ? '#344056' : '#283244';
            ctx.fillRect(standInR, y, standOutR - standInR, 1);
            for (let cx = standInR + 1; cx < standOutR - 1; cx += stepDot) {
              const cIdx = (cx + crowdTick + 2) % crowdCols.length;
              const isFlash = ((cx * 19 + ((nowSec * 16) | 0) * 5) % 49) === 0;
              ctx.fillStyle = isFlash ? '#ffffff' : (isWaveCrest && (cIdx & 1) === 0 ? '#fcf400' : crowdCols[cIdx]);
              ctx.fillRect(cx, y - (standH - 1), Math.max(1, stepDot - 1), standH);
            }
          }
        }
      }

      // B. Pit Lane Shoulder Merge, Pit-Box Markers & Pit-Wall Signboards on Right (s >= 912 || s <= 180)
      if (lineS >= 912 || lineS <= 180) {
        const pitOffM = this._readPitOffsetAt(track, lineS <= 110 || lineS >= 912 ? lineS : 108);
        if (pitOffM > 0 && (lineS >= 912 || lineS <= 110)) {
          const pitCenterPx = centerX + pitOffM * pxPerMeter;
          const pitHalfPx = Math.max(2, 4.6 * pxPerMeter);
          const pitL = Math.min(roadR, Math.round(pitCenterPx - pitHalfPx));
          const pitR = Math.round(pitCenterPx + pitHalfPx);
          if (pitR > pitL) {
            ctx.fillStyle = grassBand ? '#586478' : '#4e586a';
            ctx.fillRect(pitL, y, pitR - pitL, 1);
            // Crisp white outer pit-lane edge line + team pit-box stall hash marks
            const linePx = Math.max(1, Math.round(0.28 * pxPerMeter));
            ctx.fillStyle = curbBand ? '#fcf400' : '#f8f8f8';
            ctx.fillRect(pitR - linePx, y, linePx, 1);
            // Yellow 80 km/h speed limit line at s = 942
            if (Math.abs(lineS - PIT_LANE_CONFIG.speedLimitLineS) < 0.45) {
              ctx.fillStyle = '#fcf400';
              ctx.fillRect(pitL, y, pitR - pitL, 1);
            }
            // Neon green Player #1 Pit Stop Box pad around s = 20 + Red/White Team Pit Stalls at s = 34, 48
            if (Math.abs(lineS - PIT_LANE_CONFIG.playerBoxS) < 1.35) {
              const boxL = Math.round(pitCenterPx);
              ctx.fillStyle = curbBand ? '#00fc58' : '#fcf400';
              ctx.fillRect(boxL, y, Math.max(1, pitR - boxL - 1), 1);
            } else if (Math.abs(lineS - 35) < 1.1 || Math.abs(lineS - 50) < 1.1) {
              const boxL = Math.round(pitCenterPx);
              ctx.fillStyle = '#fc2818';
              ctx.fillRect(boxL, y, Math.max(1, pitR - boxL - 1), 1);
            }
          }
          // Concrete Pit Wall + Pit-Wall Team Signboards separating Main Straight & Pit Lane (s in 948..1000 U 0..76)
          if (lineS >= 948 || lineS <= 76) {
            const wallX = Math.round(centerX + (ROAD_HALF_WIDTH + 1.65) * pxPerMeter);
            const wallW = Math.max(1, Math.round(0.75 * pxPerMeter));
            const signPulse = (Math.floor(absWorldM / 9.0) % 3) === 0;
            ctx.fillStyle = signPulse ? '#fcf400' : (curbBand ? '#d8e0ec' : '#1858f8');
            ctx.fillRect(wallX, y, wallW, 1);
          }
        }
      }

      // C. Bold Red / White Striped 1982 Namco Rumble Curbs (#fc1800 / #f8f8f8)
      if (isMonza) {
        const tri = Math.floor(absWorldM / 2.5) % 3;
        ctx.fillStyle = tri === 0 ? '#00a848' : (tri === 1 ? '#f8f8f8' : '#fc1800');
      } else {
        ctx.fillStyle = curbBand ? '#fc1800' : '#f8f8f8';
      }
      ctx.fillRect(roadL - curbPx, y, curbPx, 1);
      if (!(lineS >= 912 && lineS <= 948) && !(lineS >= 68 && lineS <= 112)) {
        ctx.fillRect(roadR, y, curbPx, 1);
      }

      // D. Two-Tone 1982 Namco Asphalt (#686868 / #5e5e5e) + Subtle Rubbered Racing Groove
      ctx.fillStyle = grassBand ? '#686868' : '#5e5e5e';
      ctx.fillRect(roadL, y, roadW, 1);
      if (roadW >= 24) {
        const grooveW = Math.max(2, Math.round(1.15 * pxPerMeter));
        ctx.fillStyle = grassBand ? '#585a62' : '#50525a';
        ctx.fillRect(Math.round(centerX - roadHalfPx * 0.22 - grooveW * 0.5), y, grooveW, 1);
        ctx.fillRect(Math.round(centerX + roadHalfPx * 0.22 - grooveW * 0.5), y, grooveW, 1);
      }

      // Subtle crisp white outer asphalt edge lines
      if (roadW >= 14) {
        const edgeW = Math.max(1, Math.round(0.24 * pxPerMeter));
        ctx.fillStyle = '#e8eef8';
        ctx.fillRect(roadL, y, edgeW, 1);
        ctx.fillRect(roadR - edgeW, y, edgeW, 1);
      }

      // E. Speed-Synchronized Crisp White & Yellow Dashed Lane Dividers (3-lane GP layout / Classic Namco center dashes)
      const speedDashBand = (Math.floor(absWorldM / 4.0) % 3) === 0;
      if ((dashBand || speedDashBand) && roadW >= 10) {
        const dashW = Math.max(1, Math.round(0.28 * pxPerMeter));
        ctx.fillStyle = '#f8f8f8';
        // Classic center dashed line + twin outer lane dashes
        ctx.fillRect(Math.round(centerX - dashW * 0.5), y, dashW, 1);
        if (roadW >= 30) {
          ctx.fillStyle = curbBand ? '#f8f8f8' : '#dce8ff';
          ctx.fillRect(Math.round(centerX - roadHalfPx * 0.36), y, dashW, 1);
          ctx.fillRect(Math.round(centerX + roadHalfPx * 0.36), y, dashW, 1);
        }
      }

      // F. Checkered Start/Finish Line at s = 0 & White Starting Grid Boxes (s in 964..997.5)
      if (lineS >= 999.15 || lineS <= 0.85) {
        const numChecks = 12;
        const cellW = roadW / numChecks;
        const rowParity = lineS < 0.85 ? 0 : 1;
        for (let c = 0; c < numChecks; c++) {
          const x0 = Math.round(roadL + c * cellW);
          const x1 = Math.round(roadL + (c + 1) * cellW);
          if (x1 > x0) {
            ctx.fillStyle = ((c + rowParity) & 1) === 0 ? '#f8f8f8' : '#101010';
            ctx.fillRect(x0, y, x1 - x0, 1);
          }
        }
      } else if (lineS >= 963.5 && lineS <= 997.3 && roadW >= 18) {
        // 16 F1 Starting Grid Stall Brackets matching main.js sBack = 3.2 + idx * 2.1
        const sBack = TRACK_GAME_LENGTH - lineS;
        const relSlot = (sBack - 3.0) / 2.1;
        const slotIdx = Math.round(relSlot);
        if (slotIdx >= 0 && slotIdx < 16) {
          const slotFrontBack = 3.2 + slotIdx * 2.1 - 0.55;
          const dsSlot = sBack - slotFrontBack;
          if (dsSlot >= 0 && dsSlot <= 0.95) {
            const stallLatM = slotIdx % 2 === 0 ? -2.8 : 2.8;
            const stallCx = centerX + stallLatM * pxPerMeter;
            const stallHalfW = Math.max(2, Math.round(1.15 * pxPerMeter));
            ctx.fillStyle = '#f8f8f8';
            if (dsSlot < 0.24) {
              // Front horizontal grid stop bar
              ctx.fillRect(Math.round(stallCx - stallHalfW), y, stallHalfW * 2, 1);
            } else {
              // Side wings of the grid box
              const lw = Math.max(1, Math.round(0.22 * pxPerMeter));
              ctx.fillRect(Math.round(stallCx - stallHalfW), y, lw, 1);
              ctx.fillRect(Math.round(stallCx + stallHalfW - lw), y, lw, 1);
            }
          }
        }
      }

      // G. Shimmering Blue 1982 Pixel Puddles (#1868fc / #68b8ff) with Sky-Reflection Shimmer Scanlines!
      if (puddlesActive) {
        for (let pIdx = 0; pIdx < puddles.length; pIdx++) {
          const pud = puddles[pIdx];
          const dsPudReal = Math.abs(signedDeltaS(lineS, pud.s)) * mPerGameM;
          const pRad = pud.radius || 3.0;
          if (dsPudReal <= pRad) {
            const spanFrac = Math.sqrt(Math.max(0, 1.0 - (dsPudReal / pRad) * (dsPudReal / pRad)));
            const pudHalfPx = Math.round(pRad * spanFrac * pxPerMeter);
            if (pudHalfPx >= 1) {
              const pudCx = Math.round(centerX + (pud.lat || 0) * pxPerMeter);
              const px0 = Math.max(roadL, pudCx - pudHalfPx);
              const px1 = Math.min(roadR, pudCx + pudHalfPx);
              const pw = px1 - px0;
              if (pw > 0) {
                const shimmerPhase = (y + ((nowSec * 16) | 0) + pIdx * 3) % 4;
                ctx.fillStyle = shimmerPhase === 0 ? '#68b8ff' : (shimmerPhase === 2 ? '#3488fc' : '#1868fc');
                ctx.fillRect(px0, y, pw, 1);
                // Specular sky-reflection ripple bars across puddle interior
                if (pw >= 5) {
                  const ripOff = ((y * 3 + ((nowSec * 20) | 0)) % Math.max(2, pw >> 1));
                  ctx.fillStyle = shimmerPhase === 0 ? '#f0fcff' : '#b8e8ff';
                  ctx.fillRect(px0 + 1 + ripOff, y, Math.max(1, pw >> 2), 1);
                }
              }
            }
          }
        }
      }

      // H. Optional Tunnel Overhead Sodium Pixel Lamp Ribs (Monaco Tunnel)
      if (inTunnel && ((Math.floor(absWorldM / 12.0) % 2) === 0) && y < horizonY + 26) {
        ctx.fillStyle = '#ffd258';
        const lampW = Math.max(2, Math.round(roadW * 0.25));
        ctx.fillRect(Math.round(centerX - lampW * 0.5), y, lampW, 1);
      }
    }

    // 6. Collect & Depth-Sort Back-to-Front World Sprites (Billboards, Braking Signs, Gantry, Rivals)
    let spriteCount = 0;
    const pushSprite = (
      distReal,
      kind,
      img,
      worldLatM,
      widthMeters,
      yLiftPx = 0,
      lightsLit = 0,
      lightsGreen = false,
      blastProgress = 0,
      anchorCenter = false
    ) => {
      if (spriteCount >= MAX_SPRITE_POOL) return;
      if (distReal <= 0.8 || distReal >= 178.0) return;
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
    };

    // Resolve Gantry Start Light State (explicit params or automatic FujiTrack material fallback)
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

    // 6A. Overhead Start/Finish Gantry at s = 0 + Halfway Checkpoint Bridge at s = 500
    const sfDistReal = forwardDeltaS(pS, 0) * mPerGameM;
    if (sfDistReal > 1.2 && sfDistReal < 176.0) {
      const gantryImg =
        state === GAME_STATES.QUALIFYING ? this._gantrySprites.qualify : this._gantrySprites.race;
      pushSprite(
        sfDistReal,
        1,
        gantryImg,
        0,
        ROAD_HALF_WIDTH * 2.42,
        0,
        resolvedLightsLit,
        resolvedGreen,
        0,
        true
      );
    }

    const midDistReal = forwardDeltaS(pS, 500) * mPerGameM;
    if (
      midDistReal > 1.5 &&
      midDistReal < 175.0 &&
      !(tunnelRange && 500 >= tunnelRange[0] && 500 <= tunnelRange[1])
    ) {
      pushSprite(midDistReal, 0, this._gantrySprites.bridge, 0, ROAD_HALF_WIDTH * 2.42, 0, 0, false, 0, true);
    }

    // 6B. Roadside 1982 Namco Billboards (Exact Track Billboards + Classic Namco Trackside Cadence)
    const trackBillboards = Array.isArray(track?.billboards) ? track.billboards : null;
    const bbSprites = this._billboardSprites;
    if (trackBillboards && trackBillboards.length > 0) {
      for (let i = 0; i < trackBillboards.length; i++) {
        const bb = trackBillboards[i];
        const dsReal = forwardDeltaS(pS, bb.s) * mPerGameM;
        if (dsReal > 1.2 && dsReal < 175.0) {
          pushSprite(
            dsReal,
            0,
            bbSprites[i % bbSprites.length],
            bb.lateralOffset,
            7.4,
            0
          );
        }
      }
    } else {
      // Fallback billboard cadence if track.billboards is absent
      for (let s = 30, idx = 0; s < 965; s += 25, idx++) {
        const dsReal = forwardDeltaS(pS, s) * mPerGameM;
        if (dsReal > 1.2 && dsReal < 175.0) {
          const side = idx % 2 === 0 ? -1 : 1;
          if (side > 0 && (s >= 900 || s <= 120)) continue;
          pushSprite(dsReal, 0, bbSprites[idx % bbSprites.length], side * (ROAD_HALF_WIDTH + 7.2), 7.4, 0);
        }
      }
    }

    // Supplementary Outer-Verge Classic 1982 Billboards & Trees (well outside collision envelope!)
    for (let slot = 0; slot < 50; slot++) {
      const s = slot * 20 + 12;
      if (tunnelRange && s >= tunnelRange[0] && s <= tunnelRange[1]) continue;
      const dsReal = forwardDeltaS(pS, s) * mPerGameM;
      if (dsReal <= 1.5 || dsReal >= 175.0) continue;

      const side = slot % 2 === 0 ? -1 : 1;
      if (side > 0 && (s >= 900 || s <= 124)) continue;

      if (slot % 3 === 0) {
        // Outer classic 1982 Namco arcade billboard
        pushSprite(
          dsReal,
          0,
          bbSprites[(slot * 3 + 2) % bbSprites.length],
          side * (ROAD_HALF_WIDTH + 12.6),
          7.6,
          0
        );
      } else {
        // Circuit-Specific Outer Pixel Scenic Props (Sakura, Autumn Maple, Palm, Vegas Neon Sign, Alpine Pine)
        let propImg = this._scenicSprites.pine;
        if (trackId === 'VEGAS_NEON') {
          propImg = slot % 3 === 1 ? this._scenicSprites.neonSign : this._scenicSprites.palm;
        } else if (trackId === 'MONACO_HARBOR') {
          propImg = slot % 2 === 0 ? this._scenicSprites.palm : this._scenicSprites.pine;
        } else if (trackId === 'MONZA_TEMPLE') {
          propImg = slot % 2 === 0 ? this._scenicSprites.autumnPine : this._scenicSprites.pine;
        } else if (trackId === 'SUZUKA_130R') {
          propImg = slot % 3 === 1 ? this._scenicSprites.autumnPine : (slot % 3 === 2 ? this._scenicSprites.sakura : this._scenicSprites.pine);
        } else if (trackTheme === 'FUJI' && slot % 4 === 1) {
          propImg = this._scenicSprites.sakura;
        }
        pushSprite(dsReal, 0, propImg, side * (ROAD_HALF_WIDTH + 14.5), 4.2, 0);
      }
    }

    // Player #1 Pit Box Beacon Sign at s = 20 + Animated 1982 Pit-Crew Mechanics along Pit Lane!
    const pitBeaconDist = forwardDeltaS(pS, PIT_LANE_CONFIG.playerBoxS) * mPerGameM;
    if (pitBeaconDist > 1.5 && pitBeaconDist < 165.0) {
      pushSprite(
        pitBeaconDist,
        0,
        this._scenicSprites.pitSign,
        PIT_LANE_CONFIG.lateralOffset + 5.8,
        3.2,
        0
      );
    }
    const crewStations = [18.5, 22.0, 35.0, 50.0];
    for (let cIdx = 0; cIdx < crewStations.length; cIdx++) {
      const crewDist = forwardDeltaS(pS, crewStations[cIdx]) * mPerGameM;
      if (crewDist > 1.5 && crewDist < 145.0) {
        const waveFrame = (((nowSec * 6 + cIdx) | 0) & 1) === 0 ? this._scenicSprites.pitCrew0 : this._scenicSprites.pitCrew1;
        pushSprite(
          crewDist,
          0,
          waveFrame,
          PIT_LANE_CONFIG.lateralOffset + 4.4,
          2.2,
          0
        );
      }
    }

    // 6B2. Giant Waving Grandstand Supporter Team Flags & 6 FIA Trackside Flag Marshal Posts!
    const flagWaveSpeed = 7.0 + this._crowdExcitement * 6.0;
    const grandstandFlagPosts = [
      { s: 932, side: -1, kind: 0 },
      { s: 958, side: -1, kind: 1 },
      { s: 984, side: -1, kind: 2 },
      { s: 14, side: -1, kind: 3 },
      { s: 44, side: -1, kind: 0 },
      { s: 76, side: -1, kind: 1 },
      { s: 112, side: -1, kind: 2 },
      { s: 152, side: -1, kind: 3 },
      { s: 396, side: 1, kind: 0 },
      { s: 426, side: 1, kind: 3 },
      { s: 606, side: -1, kind: 1 },
      { s: 636, side: -1, kind: 2 },
    ];
    for (let f = 0; f < grandstandFlagPosts.length; f++) {
      const fp = grandstandFlagPosts[f];
      if (tunnelRange && fp.s >= tunnelRange[0] && fp.s <= tunnelRange[1]) continue;
      const dsReal = forwardDeltaS(pS, fp.s) * mPerGameM;
      if (dsReal > 1.8 && dsReal < 168.0) {
        const alt = (((nowSec * flagWaveSpeed + f) | 0) & 1) === 1;
        let fImg = alt ? this._scenicSprites.flagRed1 : this._scenicSprites.flagRed0;
        if (fp.kind === 1) fImg = alt ? this._scenicSprites.flagPapaya1 : this._scenicSprites.flagPapaya0;
        else if (fp.kind === 2) fImg = alt ? this._scenicSprites.flagCyan1 : this._scenicSprites.flagCyan0;
        else if (fp.kind === 3) fImg = alt ? this._scenicSprites.flagGold1 : this._scenicSprites.flagGold0;
        pushSprite(dsReal, 0, fImg, fp.side * (ROAD_HALF_WIDTH + 6.2), 3.6, 0);
      }
    }

    const resolvedLapForFlags = Number.isFinite(currentLap) && currentLap > 0 ? currentLap : (playerCar?.lap || 1);
    const marshalPosts = [
      { s: 6, side: -1, sec: 0 },
      { s: 156, side: 1, sec: 0 },
      { s: 333, side: -1, sec: 1 },
      { s: 498, side: 1, sec: 1 },
      { s: 666, side: -1, sec: 2 },
      { s: 882, side: -1, sec: 2 },
    ];
    const vscNow = !!(raceSystems?.vscActive || playerCar?.vscActive);
    for (let m = 0; m < marshalPosts.length; m++) {
      const mp = marshalPosts[m];
      if (tunnelRange && mp.s >= tunnelRange[0] && mp.s <= tunnelRange[1]) continue;
      const dsReal = forwardDeltaS(pS, mp.s) * mPerGameM;
      if (dsReal <= 1.4 || dsReal >= 165.0) continue;

      let crashedNear = false;
      let blueFlagNear = false;
      if (Array.isArray(allCars)) {
        for (let ci = 0; ci < allCars.length; ci++) {
          const c = allCars[ci];
          if (!c) continue;
          const dPost = Math.abs(signedDeltaS(c.s || 0, mp.s)) * mPerGameM;
          if (c.exploded && dPost < 65.0) crashedNear = true;
          if (!c.isPlayer && (c.lap || 1) < resolvedLapForFlags && dPost < 45.0) blueFlagNear = true;
        }
      }
      const sectorYellow = !!(raceSystems?.yellowSectors && typeof raceSystems.yellowSectors.get === 'function' && raceSystems.yellowSectors.get(mp.sec) > 0);
      const isCheckered = mp.s === 6 && (state === GAME_STATES.PODIUM || (state === GAME_STATES.RACING && resolvedLapForFlags >= totalLaps));
      const isYellow = !isCheckered && (vscNow || sectorYellow || crashedNear);
      const isBlue = !isCheckered && !isYellow && blueFlagNear;
      const waveAlt = (((nowSec * 9 + m) | 0) & 1) === 1;

      let mImg = waveAlt ? this._scenicSprites.marshalGreen1 : this._scenicSprites.marshalGreen0;
      if (isCheckered) mImg = waveAlt ? this._scenicSprites.marshalCheck1 : this._scenicSprites.marshalCheck0;
      else if (isYellow) mImg = waveAlt ? this._scenicSprites.marshalYellow1 : this._scenicSprites.marshalYellow0;
      else if (isBlue) mImg = waveAlt ? this._scenicSprites.marshalBlue1 : this._scenicSprites.marshalBlue0;

      pushSprite(dsReal, 0, mImg, mp.side * (ROAD_HALF_WIDTH + 2.85), 2.5, 0);
    }

    // 6C. 150m / 100m / 50m Corner Braking Distance Pixel Boards
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
        const dsReal = forwardDeltaS(pS, markerS) * mPerGameM;
        if (dsReal > 1.2 && dsReal < 175.0) {
          pushSprite(
            dsReal,
            0,
            this._brakingSprites[distMarker],
            side * (ROAD_HALF_WIDTH + 3.6),
            2.3,
            0
          );
        }
      }
    }

    // 6D. All Visible AI Rival 1982 F1 Cars (deltaS_real in (0, 175m))
    if (Array.isArray(allCars)) {
      for (let i = 0; i < allCars.length; i++) {
        const car = allCars[i];
        if (!car || car.isPlayer) continue;

        const dsGame = signedDeltaS(car.s, pS);
        const dsReal = dsGame * mPerGameM;
        if (dsReal <= 0.6 || dsReal >= 175.0) continue;

        const palIdx = Math.abs((car.carNum || i) + i) % this._rivalSprites.length;
        const cSpeed = Math.max(0, car.speedKmh || 0);
        const tirePhase = cSpeed > 1 ? ((Math.floor((car.totalDistanceGameM || car.s || 0) * 4.8) + ((nowSec * 18) | 0)) & 1) : 0;

        // Perspective relative view angle + active corner banking lean (-1: left, 0: straight, +1: right)
        const relLat = (car.lateralOffset || 0) - pLat;
        const kRival = track && typeof track.getPhysicsCurvature === 'function' ? track.getPhysicsCurvature(car.s || 0) : 0;
        const bankSignal = relLat * 0.35 + kRival * 2.4 + (car.steerInput || 0) * 1.5;
        const viewIdx = bankSignal < -0.65 ? 0 : (bankSignal > 0.65 ? 2 : 1);
        const rivalImg = this._rivalSprites[palIdx][viewIdx][tirePhase];

        if (car.exploded) {
          const prog = Number.isFinite(car.explodeTimer) ? clamp(1.0 - car.explodeTimer / 2.1, 0, 1) : 0.4;
          const expFrame = this._explosionFrames[Math.min(3, ((nowSec * 14) | 0) % 4)];
          pushSprite(dsReal, 2, expFrame, car.lateralOffset || 0, 6.4, 0, 0, false, prog, false);
        } else {
          const curbHop = (car.onCurb || Math.abs(kRival) > 0.32) ? (((nowSec * 36 + i) | 0) & 1) : 0;
          const rivalFx = (cSpeed > 245 || (car.skidIntensity || 0) > 0.18) ? 1 : 0;
          pushSprite(dsReal, 0, rivalImg, car.lateralOffset || 0, 4.35, curbHop, rivalFx, false, 0, false);
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

    // 8. Project & Draw Sorted Sprites with Clean Horizon Clipping
    for (let i = 0; i < spriteCount; i++) {
      const sp = this._spritePool[i];
      const d = sp.distReal;
      const invZ = 1.0 / (d + CAM_Z_OFFSET_M);
      const v = (invZ - INV_Z_FAR) / (INV_Z_NEAR - INV_Z_FAR);
      if (v < 0.0) continue;

      const groundY = Math.round(horizonY + v * roadSpanRows) - sp.yLiftPx;
      const scale = (NEAR_DIST_M + CAM_Z_OFFSET_M) * invZ;
      const roadHalfPx = baseRoadHalfPx * scale;
      const pxPerMeter = roadHalfPx / ROAD_HALF_WIDTH;

      const fStep = clamp(d / WORLD_STEP_M, 0, WORLD_STEPS - 1.001);
      const idx0 = fStep | 0;
      const frac = fStep - idx0;
      const worldCurveX =
        this._worldCurveM[idx0] + (this._worldCurveM[idx0 + 1] - this._worldCurveM[idx0]) * frac;

      const roadCenterX =
        W * 0.5 - (pLat / ROAD_HALF_WIDTH) * roadHalfPx + worldCurveX * pxPerMeter + yawVanishShiftPx * (1.0 - clamp(v, 0, 1));
      const screenX = sp.anchorCenter ? roadCenterX : roadCenterX + sp.worldLatM * pxPerMeter;

      const img = sp.img;
      if (!img) continue;

      const dstW = Math.max(2, Math.round(sp.widthMeters * pxPerMeter));
      const dstH = Math.max(2, Math.round(dstW * (img.height / img.width)));
      const dx = Math.round(screenX - dstW * 0.5);
      const dy = groundY - dstH;

      if (dx + dstW < 0 || dx >= W) continue;

      // Subtle pixel contact shadow beneath rival F1 cars
      if (sp.kind === 0 && sp.widthMeters > 4.0 && sp.widthMeters < 5.0 && groundY > horizonY && groundY < H) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
        ctx.fillRect(dx + 2, groundY - 1, Math.max(2, dstW - 4), 2);
      }

      // Clip bottom cleanly against horizonY if needed
      const maxVisibleBottom = Math.min(H, Math.max(horizonY + 1, groundY));
      const visH = maxVisibleBottom - dy;
      if (visH <= 0) continue;

      if (visH >= dstH) {
        ctx.drawImage(img, dx, dy, dstW, dstH);
      } else {
        const srcH = Math.max(1, Math.round((visH / dstH) * img.height));
        ctx.drawImage(img, 0, 0, img.width, srcH, dx, dy, dstW, visH);
      }

      // Rival F1 car exhaust backfire & rear-tire spark/smoke pixels when charging hard!
      if (sp.kind === 0 && sp.lightsLit > 0 && sp.widthMeters > 4.0 && sp.widthMeters < 5.0 && dstW >= 12 && groundY <= H) {
        const sparkOn = (((nowSec * 30 + i * 3) | 0) & 1) === 0;
        if (sparkOn) {
          ctx.fillStyle = '#fcf400';
          ctx.fillRect(Math.round(screenX - 2), groundY - 2, 2, 1);
          ctx.fillStyle = '#fc6800';
          ctx.fillRect(Math.round(screenX + 1), groundY - 3, 2, 1);
        }
      }

      // Overlay live glowing 5 red / green start lamps on Overhead Start Gantry!
      if (sp.kind === 1 && dstW >= 18) {
        const sxRatio = dstW / img.width;
        const syRatio = dstH / img.height;
        const bulbW = Math.max(1, Math.round(10 * sxRatio));
        const bulbH = Math.max(1, Math.round(10 * syRatio));
        const bulbY = Math.round(dy + 56 * syRatio);
        if (bulbY + bulbH <= maxVisibleBottom) {
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

    // 8B. Billowing Colored Grandstand Smoke Flares & Final-Lap Celebratory Pixel Confetti!
    this._renderGrandstandFlaresAndConfetti(W, H, horizonY, pS, state, resolvedLapForFlags, totalLaps, nowSec);

    // 9. High-Speed (>280 km/h) & Slipstream Radial Pixel Wind Lines
    if (!pExploded && (pSpeed > 280 || ((playerCar?.inSlipstream || playerCar?.drsActive) && pSpeed > 185))) {
      this._renderSpeedWindLines(W, H, horizonY, pSpeed, !!(playerCar?.inSlipstream || playerCar?.drsActive), nowSec);
    }

    // 10. Foreground Camera View (0: 1982 Chase + 6-Man Pit Stop, 1: Halo T-Cam, 2: 1st-Person Cockpit + Mirrors, 3: Nose Wing Cam)
    const isPitServiceActive = !!(
      state === GAME_STATES.PIT_STOP ||
      playerCar?.pitPhase === 'STOPPED' ||
      (playerCar?.inPitLane && pSpeed < 9.0 && Math.abs(signedDeltaS(pS, PIT_LANE_CONFIG.playerBoxS)) < 4.8)
    );
    if (pExploded || camIdx === 0) {
      this._renderPlayerForeground(
        W, H, playerCar, pSpeed, pSteer, pYaw, pDistGame, pExploded,
        isRainy, puddlesActive, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
      );
    } else if (camIdx === 1) {
      this._renderTCamForeground(
        W, H, horizonY, playerCar, pSpeed, pSteer, pDistGame, rollPanPx,
        isRainy, puddlesActive, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
      );
    } else if (camIdx === 2) {
      this._renderCockpitViewForeground(
        W, H, horizonY, playerCar, allCars, pS, pLat, mPerGameM, pSpeed, pSteer, pDistGame, rollPanPx,
        isRainy, puddlesActive, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
      );
    } else {
      this._renderNoseCamForeground(
        W, H, horizonY, playerCar, pSpeed, pSteer, pDistGame, rollPanPx,
        isRainy, puddlesActive, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
      );
    }

    // 11. Diagonal Arcade Pixel Rain Streaks + Onboard Helmet Visor Raindrops in Wet Regimes!
    if (isRainy) {
      const rainIntensity = regimeId === 'MONSOON_STORM' ? 46 : 24;
      ctx.fillStyle = regimeId === 'MONSOON_STORM' ? '#a8d8ff' : '#88b8ec';
      const tick = (nowSec * 90) | 0;
      for (let i = 0; i < rainIntensity; i++) {
        const rx = ((i * 53 + tick * 5) % (W + 16)) - 8;
        const ry = (i * 37 + tick * 13) % H;
        ctx.fillRect(rx, ry, 1, 5);
        ctx.fillRect(rx - 1, ry + 4, 1, 3);
      }
      if (camIdx >= 1 && !pExploded) {
        this._renderVisorRaindrops(W, H, pSpeed, regimeId === 'MONSOON_STORM', nowSec);
      }
    }

    // 12. Authentic 1:1 1982 Namco Top Arcade Bitmap HUD, Full-Game Telemetry Widget & Sector/Pit Popups
    if (state !== GAME_STATES.PRE_RACE_MENU) {
      const resolvedPos = this._resolvePlayerPosition(playerPos, playerCar, allCars);
      const resolvedTotal = Number.isFinite(totalCars) && totalCars > 0 ? totalCars : Math.max(1, allCars?.length || 8);
      const resolvedLap = Number.isFinite(currentLap) && currentLap > 0 ? currentLap : (playerCar?.lap || 1);

      this._renderArcadeTopHUD(W, H, {
        score,
        topScore,
        timerSec,
        sessionLabel,
        state,
        currentLap: resolvedLap,
        totalLaps,
        lapTimeSec: playerCar?.currentLapTime || 0,
        playerPos: resolvedPos,
        totalCars: resolvedTotal,
        speedKmh: pSpeed,
        gear: playerCar?.gear || 1,
        gearboxMode: playerCar?.gearboxMode || 'AUTO_8SPD',
        rpm: playerCar?.rpm || 3800,
        inSlipstream: !!playerCar?.inSlipstream,
        drsActive: !!playerCar?.drsActive,
        playerS: pS,
        playerCar,
        raceSystems,
        isPitServiceActive,
        pitServiceSubPhase,
        sectorDeltaPopup,
        camIdx,
        centerCallout,
        nowSec,
      });
    }

    // 13. Subtle Optional 1982 CRT Scanline & Tube Corner Vignette Pass
    if (crtScanlines && this._crtCanvas) {
      ctx.drawImage(this._crtCanvas, 0, 0);
    }
  }

  // ==========================================================================
  // SKY, CLOUDS, FOREGROUND FX & BITMAP HUD SUB-RENDERERS
  // ==========================================================================

  _renderSkyAndHorizon(W, horizonY, { trackId = 'FUJI_1982', trackTheme = 'FUJI', forceNight, isSunset, isRainy, isOvercast, lightningFlash, nowSec }) {
    const ctx = this.ctx;

    // Stepped 1982 Namco System-1 Sky Color Bands (Circuit-Flavored!)
    let bands;
    let panoKey = 'DAY';
    if (lightningFlash > 0.22) {
      bands = ['#b8dcff', '#d8ecff', '#f0f8ff', '#ffffff'];
      panoKey = 'STORM';
    } else if (forceNight || trackId === 'VEGAS_NEON') {
      bands = ['#040618', '#080c2c', '#141244', '#281458'];
      panoKey = 'NIGHT';
    } else if (isSunset) {
      bands = ['#282468', '#7c3464', '#dc5438', '#fc7438', '#fcb04c'];
      panoKey = 'SUNSET';
    } else if (isRainy) {
      bands = ['#1c283c', '#2e425e', '#486284', '#6884a6'];
      panoKey = 'STORM';
    } else if (trackId === 'MONZA_TEMPLE') {
      // Warm Italian Brianza Late-Summer Golden-Amber Horizon Glow
      bands = ['#1848d0', '#346ce8', '#5894f8', '#98bcf8', '#fcd088'];
      panoKey = 'SUNSET';
    } else if (trackId === 'SILVERSTONE_GP' || isOvercast) {
      // Classic British GP Silver-Blue Overcast Sky
      bands = ['#284888', '#426ab4', '#648ed8', '#8ab4f4', '#b4d0f8'];
      panoKey = 'DAY';
    } else if (trackId === 'MONACO_HARBOR') {
      // Côte d'Azur Riviera Azure Sky
      bands = ['#1054ec', '#2474fc', '#4498ff', '#6cc0ff', '#9ce0ff'];
      panoKey = 'DAY';
    } else {
      // Iconic 1982 Namco Fuji & Suzuka Cyan-Blue Arcade Sky (#1c5cf8 -> #549cff -> #7cb8ff)
      bands = ['#1c5cf8', '#2c6cfc', '#4084fc', '#549cff', '#7cb8ff'];
      panoKey = 'DAY';
    }

    const bCount = bands.length;
    for (let i = 0; i < bCount; i++) {
      const y0 = Math.floor((i * horizonY) / bCount);
      const y1 = Math.floor(((i + 1) * horizonY) / bCount);
      ctx.fillStyle = bands[i];
      ctx.fillRect(0, y0, W, Math.max(1, y1 - y0));
    }

    // Twinkling Arcade Pixel Stars at Night
    if ((forceNight || trackId === 'VEGAS_NEON') && lightningFlash <= 0.22) {
      for (let i = 0; i < 36; i++) {
        const sx = ((i * 73 + Math.round(this._unwrappedYaw * 80)) % W + W) % W;
        const sy = 6 + ((i * 29) % Math.max(12, horizonY - 42));
        const blink = ((i + ((nowSec * 5) | 0)) % 7) !== 0;
        if (blink) {
          ctx.fillStyle = i % 5 === 0 ? '#54dcff' : (i % 7 === 0 ? '#fcf488' : '#f8f8f8');
          ctx.fillRect(sx, sy, 1, 1);
        }
      }
    }

    // Pixel Setting Sun Disc in Sunset / Monza Golden Regime
    if (isSunset || trackId === 'MONZA_TEMPLE') {
      const sunX = (((Math.round(W * 0.68 - this._unwrappedYaw * 85)) % (W + 80)) + (W + 80)) % (W + 80) - 40;
      const sunY = horizonY - 22;
      for (let dy = -11; dy <= 11; dy += 2) {
        const hw = Math.round(Math.sqrt(Math.max(0, 121 - dy * dy)));
        ctx.fillStyle = dy < -3 ? '#fcf468' : (dy < 4 ? '#fc9838' : '#fc4828');
        ctx.fillRect(sunX - hw, sunY + dy, hw * 2, 1);
      }
    }

    // Scrolling Fluffy White Pixel Clouds (Parallax 0.55x world heading + gentle wind drift)
    if (!forceNight && trackId !== 'VEGAS_NEON') {
      const cloudLoopW = Math.max(380, W + 90);
      const cloudScroll = this._unwrappedYaw * 95 + nowSec * 2.4;
      const cloudDefs = [
        { sprite: 0, baseX: 34, yFrac: 0.34 },
        { sprite: 1, baseX: 142, yFrac: 0.48 },
        { sprite: 2, baseX: 248, yFrac: 0.30 },
        { sprite: 1, baseX: 342, yFrac: 0.44 },
      ];
      for (let i = 0; i < cloudDefs.length; i++) {
        const cd = cloudDefs[i];
        const img = this._clouds[cd.sprite];
        const cx = (((Math.round(cd.baseX - cloudScroll)) % cloudLoopW) + cloudLoopW) % cloudLoopW - 68;
        const cy = Math.round(horizonY * cd.yFrac);
        if (cy + img.height < horizonY - 4) {
          ctx.drawImage(img, cx, cy);
        }
      }
    }

    // Scrolling Pixel-Art Mount Fuji / Alpine Panorama (512px seamless loop anchored on horizonY)
    const pano = this._panoramas[panoKey] || this._panoramas.DAY;
    const panoW = pano.width;
    const panoH = pano.height;
    const panoY = horizonY - panoH;
    const rawShift = Math.round((this._unwrappedYaw / (Math.PI * 2)) * panoW) % panoW;
    const scrollX = ((rawShift % panoW) + panoW) % panoW;

    let drawX = -scrollX;
    while (drawX < W) {
      ctx.drawImage(pano, drawX, panoY);
      drawX += panoW;
    }

    // Circuit-Specific 1982 Pixel Horizon Landmarks!
    const landmarkLoopW = Math.max(320, W + 80);
    const landmarkScroll = Math.round(this._unwrappedYaw * 115);

    if (trackId === 'MONACO_HARBOR') {
      // Mediterranean Azure Sea Strip + Animated White Wave Crests + Superyachts on Horizon!
      ctx.fillStyle = '#0848b8';
      ctx.fillRect(0, horizonY - 7, W, 4);
      ctx.fillStyle = '#1878e8';
      ctx.fillRect(0, horizonY - 3, W, 3);
      ctx.fillStyle = '#d8f4ff';
      const waveTick = (nowSec * 12) | 0;
      for (let wx = (waveTick % 14); wx < W; wx += 14) {
        ctx.fillRect(wx, horizonY - 5, 4, 1);
      }
      for (let yIdx = 0; yIdx < 3; yIdx++) {
        const yx = (((yIdx * 112 + 48 - landmarkScroll) % landmarkLoopW) + landmarkLoopW) % landmarkLoopW - 30;
        ctx.fillStyle = '#f8f8f8';
        ctx.fillRect(yx, horizonY - 10, 22, 4);
        ctx.fillRect(yx + 4, horizonY - 13, 12, 3);
        ctx.fillStyle = '#1868fc';
        ctx.fillRect(yx + 5, horizonY - 12, 9, 1);
        ctx.fillStyle = '#fcf400';
        ctx.fillRect(yx + 10, horizonY - 18, 1, 5);
      }
    } else if (trackId === 'SUZUKA_130R') {
      // Iconic Suzuka Giant Ferris Wheel Silhouette with Rotating Illuminated Gondolas!
      const fwX = (((Math.round(W * 0.28 - landmarkScroll)) % landmarkLoopW) + landmarkLoopW) % landmarkLoopW - 24;
      const fwY = horizonY - 22;
      const rad = 16;
      // A-frame support legs
      ctx.fillStyle = '#dce8f8';
      for (let leg = 0; leg < 20; leg++) {
        ctx.fillRect(fwX - Math.round(leg * 0.45), fwY + leg, 2, 1);
        ctx.fillRect(fwX + Math.round(leg * 0.45), fwY + leg, 2, 1);
      }
      // 12 Rotating Pixel Gondolas + Neon Rim
      for (let g = 0; g < 12; g++) {
        const ang = (g / 12) * Math.PI * 2 + nowSec * 0.55;
        const gx = fwX + Math.round(Math.cos(ang) * rad);
        const gy = fwY + Math.round(Math.sin(ang) * rad);
        ctx.fillStyle = g % 3 === 0 ? '#00fc58' : (g % 3 === 1 ? '#fcf400' : '#ff28a8');
        ctx.fillRect(gx - 1, gy - 1, 3, 3);
      }
      ctx.fillStyle = '#fcf400';
      ctx.fillRect(fwX - 1, fwY - 1, 3, 3);
    } else if (trackId === 'SILVERSTONE_GP') {
      // WWII RAF Airfield Control Tower + Cantilevered Silverstone Wing Roofline!
      const twX = (((Math.round(W * 0.72 - landmarkScroll)) % landmarkLoopW) + landmarkLoopW) % landmarkLoopW - 24;
      ctx.fillStyle = '#48586c';
      ctx.fillRect(twX, horizonY - 18, 10, 18);
      ctx.fillStyle = '#98d8ff';
      ctx.fillRect(twX - 2, horizonY - 22, 14, 4);
      // Rotating green/white airfield beacon
      ctx.fillStyle = (((nowSec * 6) | 0) & 1) === 0 ? '#00fc58' : '#f8f8f8';
      ctx.fillRect(twX + 4, horizonY - 25, 2, 3);
      // Silverstone Wing angled blade roof
      ctx.fillStyle = '#dce4f0';
      ctx.fillRect(twX + 18, horizonY - 10, 28, 3);
      ctx.fillStyle = '#ce1126';
      ctx.fillRect(twX + 20, horizonY - 7, 24, 2);
    } else if (trackId === 'VEGAS_NEON') {
      // Las Vegas Strip Neon Casino Skyline Silhouette with Glowing Pixel Windows!
      const towers = [
        { off: 28, w: 18, h: 28, neon: '#ff28a8' },
        { off: 86, w: 22, h: 34, neon: '#00f4ff' },
        { off: 158, w: 16, h: 24, neon: '#fcf400' },
        { off: 224, w: 24, h: 30, neon: '#00fc58' },
      ];
      for (let t = 0; t < towers.length; t++) {
        const td = towers[t];
        const tx = (((td.off - landmarkScroll) % landmarkLoopW) + landmarkLoopW) % landmarkLoopW - 24;
        const ty = horizonY - td.h;
        ctx.fillStyle = '#0c0820';
        ctx.fillRect(tx, ty, td.w, td.h);
        ctx.fillStyle = td.neon;
        ctx.fillRect(tx, ty, td.w, 2);
        ctx.fillRect(tx, ty, 1, td.h);
        ctx.fillRect(tx + td.w - 1, ty, 1, td.h);
        for (let wy = ty + 4; wy < horizonY - 3; wy += 4) {
          for (let wx = tx + 3; wx < tx + td.w - 3; wx += 4) {
            ctx.fillStyle = ((wx + wy + ((nowSec * 4) | 0)) % 3 === 0) ? '#fcf400' : td.neon;
            ctx.fillRect(wx, wy, 2, 2);
          }
        }
      }
    }
  }

  _renderGrandstandFlaresAndConfetti(W, H, horizonY, pS, state, currentLap, totalLaps, nowSec) {
    const ctx = this.ctx;
    // Billowing Team-Colored Motorsport Smoke Flares rising directly from Grandstand Bleachers!
    const nearMainStand = pS >= 895 || pS <= 185;
    const nearMidStand = (pS >= 365 && pS <= 445) || (pS >= 575 && pS <= 650);
    if (nearMainStand || nearMidStand) {
      const flareDefs = [
        { rowFrac: 0.16, col: '#ff3818', hi: '#ffa088' },
        { rowFrac: 0.28, col: '#ff8400', hi: '#ffd288' },
        { rowFrac: 0.42, col: '#00e0dc', hi: '#a8ffff' },
      ];
      const rightSide = pS >= 365 && pS <= 445;
      const span = Math.max(24, (H > 275 ? H - Math.round(H * 0.25) : H - 1) - horizonY);
      for (let f = 0; f < flareDefs.length; f++) {
        const fd = flareDefs[f];
        const scanY = Math.min(H - 6, Math.round(horizonY + span * fd.rowFrac));
        const rCx = this._lineCenterX[scanY] || (W * 0.5);
        const rHalf = this._lineRoadHalfPx[scanY] || 40;
        const standX = rightSide
          ? Math.round(rCx + rHalf * 1.85)
          : Math.round(rCx - rHalf * 1.85);
        if (standX < 2 || standX > W - 6) continue;

        // Glowing handheld flare spark at bleacher rail
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(standX, scanY - 1, 2, 2);
        // 6 billowing pixel smoke puffs expanding & drifting windward as they rise!
        for (let p = 0; p < 6; p++) {
          const age = ((nowSec * 1.35 + f * 0.31 + p * 0.165) % 1.0);
          const risePx = Math.round(2 + age * 18);
          const driftPx = Math.round((rightSide ? -1 : 1) * age * 7 + Math.sin(nowSec * 4 + f + p) * 1.5);
          const pw = Math.round(3 + age * 6);
          const ph = Math.round(2 + age * 4);
          const px = standX + driftPx - (pw >> 1);
          const py = scanY - risePx - ph;
          if (px >= 0 && px + pw <= W && py > 28) {
            ctx.fillStyle = age < 0.28 ? fd.hi : fd.col;
            ctx.fillRect(px, py, pw, ph);
          }
        }
      }
    }

    // Celebratory Multi-Color Pixel Confetti on Final Lap Start/Finish Zone or Podium!
    const isFinalCelebration =
      state === GAME_STATES.PODIUM ||
      (state === GAME_STATES.RACING && currentLap >= totalLaps && (pS >= 948 || pS <= 42));
    if (isFinalCelebration) {
      const confCols = ['#fcf400', '#ff2828', '#00fc58', '#54dcff', '#ff58d8', '#ffffff'];
      const maxConfY = H > 275 ? H - Math.round(H * 0.26) : H - 12;
      const tick = (nowSec * 28) | 0;
      for (let c = 0; c < 28; c++) {
        const cx = ((c * 37 + tick * ((c % 3) + 1) + Math.round(Math.sin(nowSec * 4 + c) * 6)) % W + W) % W;
        const cy = 28 + ((c * 23 + tick * 2) % Math.max(24, maxConfY - 28));
        ctx.fillStyle = confCols[c % confCols.length];
        ctx.fillRect(cx, cy, (c & 1) === 0 ? 2 : 1, 2);
      }
    }
  }

  _resolveCompoundColor(compoundName) {
    return COMPOUND_PIXEL_COLORS[compoundName] || COMPOUND_PIXEL_COLORS.SOFT;
  }

  _resolvePitProgressAndLabel(playerCar, pitServiceSubPhase, nowSec) {
    const totalDur = Math.max(1.2, Number.isFinite(playerCar?.pitStopTotalDuration) ? playerCar.pitStopTotalDuration : 2.8);
    const remSec = Number.isFinite(playerCar?.pitStopTimer) && playerCar.pitStopTimer > 0
      ? playerCar.pitStopTimer
      : (totalDur * (1.0 - ((nowSec * 0.38) % 1.0)));
    const prog = clamp(1.0 - remSec / totalDur, 0, 1);
    let sub = typeof pitServiceSubPhase === 'string' && pitServiceSubPhase ? pitServiceSubPhase : (playerCar?.pitServiceSubPhase || '');
    if (!sub) {
      if (prog < 0.16) sub = 'JACK UP';
      else if (prog < 0.48) sub = 'WHEELS OFF';
      else if (prog < 0.80) sub = 'NEW TIRES ON';
      else if (prog < 0.92) sub = 'DROP JACK';
      else sub = 'GO! GO! GO!';
    }
    return { prog, remSec, sub };
  }

  _renderSpeedWindLines(W, H, horizonY, speedKmh, inSlipstream, nowSec) {
    const ctx = this.ctx;
    const intensity = clamp((speedKmh - 265) / 60, 0.25, 1.0);
    const count = Math.round(6 + intensity * 10);
    const tick = (nowSec * 45) | 0;
    const maxWindY = H > 275 ? H - Math.round(H * 0.25) - 4 : H - 8;

    ctx.fillStyle = inSlipstream ? '#68ecff' : '#f8f8f8';
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const phase = ((i * 19 + tick * 3) % 24) / 24;
      const y = Math.round(horizonY + 14 + phase * Math.max(16, maxWindY - horizonY - 14));
      const xEdge = side < 0 ? Math.round((1 - phase) * (W * 0.24)) : Math.round(W - (1 - phase) * (W * 0.24));
      const len = Math.max(3, Math.round(4 + phase * 12));
      ctx.fillRect(side < 0 ? xEdge : xEdge - len, y, len, 1);
    }
  }

  _renderPlayerForeground(
    W, H, playerCar, speedKmh, steerInput, relYaw, distGame, exploded,
    isRainy, puddlesActive, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
  ) {
    const ctx = this.ctx;
    const baseCarX = W >> 1;
    // Portrait phone (H > 275): lift Player #1 car above lower ~25% touch wheel & pedals!
    const baseCarY = H > 275 ? H - Math.round(H * 0.25) : H - 8;

    if (exploded) {
      // 4-Frame 1982 Fiery Pixel Fireball + 4 Bouncing Black Pixel Wheels!
      const t = this._playerBlastSec; // 0 .. 2.1s
      const frameIdx = Math.min(3, ((nowSec * 15) | 0) % 4);
      const fireImg = this._explosionFrames[frameIdx];
      const scale = W < 220 ? 0.92 : 1.25;
      const fw = Math.round(fireImg.width * scale);
      const fh = Math.round(fireImg.height * scale);

      // Scorched asphalt mark under blast
      ctx.fillStyle = 'rgba(12, 10, 12, 0.65)';
      ctx.fillRect(baseCarX - (fw >> 1) + 8, baseCarY - 8, fw - 16, 6);

      ctx.drawImage(fireImg, Math.round(baseCarX - fw * 0.5), Math.round(baseCarY - fh + 4), fw, fh);

      // 4 Flying Black Pixel Wheels Launching Outward & Bouncing on Asphalt!
      const wheelPhase = ((nowSec * 18) | 0) & 1;
      const wheelImg = this._wheelSprites[wheelPhase];
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
          if (tb <= tImpact2) {
            yOff = vy2 * tb + 0.5 * gravity * tb * tb;
          } else {
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

    // Choose 1 of 5 steering sprite frames (-2..+2) + 2 tire-spin phases
    const combinedSteer = steerInput * 0.85 + clamp(relYaw * 1.6, -0.5, 0.5);
    let steerFrameIdx = 2; // straight
    if (combinedSteer < -0.52) steerFrameIdx = 0;
    else if (combinedSteer < -0.15) steerFrameIdx = 1;
    else if (combinedSteer > 0.52) steerFrameIdx = 4;
    else if (combinedSteer > 0.15) steerFrameIdx = 3;

    const tirePhase = speedKmh > 1.0 ? (Math.floor(distGame * 4.4) & 1) : 0;
    const carImg = this._playerSprites[steerFrameIdx][tirePhase];

    // Scale Player #1 sprite cleanly for square-pixel portrait (W=196) vs wide arcade/desktop
    const carScale = W < 215 ? 0.90 : 1.18;
    const dstW = Math.round(carImg.width * carScale);
    const dstH = Math.round(carImg.height * carScale);

    // Pit-Stop Hydraulic Jack Lift + Authentic 1982 Kerb / Grass Bounce
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

    let bounceY = -jackLiftPx;
    if (!isPitServiceActive) {
      if (playerCar?.onCurb && speedKmh > 20) {
        bounceY = (((nowSec * 42) | 0) & 1) ? -2 : 0;
      } else if (playerCar?.onGrass && speedKmh > 15) {
        bounceY = (((nowSec * 28) | 0) % 3 === 0) ? -2 : -1;
      } else if (speedKmh > 250 && (((nowSec * 30) | 0) % 5 === 0)) {
        bounceY = -1;
      }
    }

    const dx = Math.round(baseCarX - dstW * 0.5);
    const dy = Math.round(baseCarY - dstH + bounceY);

    // Crisp Pixel-Art Tire-Mark Streaks on Asphalt Under Hard Cornering (skidIntensity > 0.3)
    const skidVal = playerCar?.skidIntensity || 0;
    if (!isPitServiceActive && skidVal > 0.30 && speedKmh > 35 && !playerCar?.onGrass) {
      const markL = dx + Math.round(dstW * 0.12);
      const markR = dx + Math.round(dstW * 0.78);
      const driftSkew = Math.round(clamp(combinedSteer * 5, -4, 4));
      ctx.fillStyle = 'rgba(22, 24, 30, 0.72)';
      for (let m = 0; m < 6; m++) {
        const my = baseCarY - 1 + m;
        if (my < H) {
          ctx.fillRect(markL + Math.round((driftSkew * m) / 5), my, 5, 1);
          ctx.fillRect(markR + Math.round((driftSkew * m) / 5), my, 5, 1);
        }
      }
    }

    // If Pit Stop Active, Draw Painted Pit-Stall Stop Box, Overhead Rig & Front Jack Man Behind Car First!
    if (isPitServiceActive) {
      this._renderPitStopCrewChase(W, H, dx, dy, dstW, dstH, baseCarX, baseCarY, pitProg, pitSub, playerCar, raceSystems, true, nowSec);
    }

    // Crisp Pixel Contact Shadow Oval Under Wide Slicks
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    ctx.fillRect(dx + 4, baseCarY - 3, dstW - 8, 3);
    ctx.fillRect(dx + 8, baseCarY - 5, dstW - 16, 2);

    // Draw Player #1 1982 Red/White/Blue F1 Car Sprite
    ctx.drawImage(carImg, dx, dy, dstW, dstH);

    // Live Pirelli Tire Compound Sidewall Color Stripes on Front & Rear Slicks (Swaps Live Mid-Pit-Stop!)
    const activeCompName = (isPitServiceActive && pitProg >= 0.52 && raceSystems?.playerPitPlan?.nextCompound)
      ? raceSystems.playerPitPlan.nextCompound
      : (playerCar?.compound || 'SOFT');
    const compHex = this._resolveCompoundColor(activeCompName);
    const shiftX = (steerFrameIdx - 2) * Math.round(carScale * 2);
    ctx.fillStyle = compHex;
    const stripeOffY = tirePhase ? 1 : 0;
    // Rear left & right slick sidewall compound bands
    ctx.fillRect(dx + Math.round(5 * carScale), dy + Math.round((27 + stripeOffY) * carScale), Math.max(2, Math.round(2 * carScale)), Math.round(9 * carScale));
    ctx.fillRect(dx + dstW - Math.round(7 * carScale), dy + Math.round((27 + (1 - stripeOffY)) * carScale), Math.max(2, Math.round(2 * carScale)), Math.round(9 * carScale));
    // Front left & right slick sidewall compound dots
    ctx.fillRect(dx + Math.round(13 * carScale) + shiftX, dy + Math.round(9 * carScale), Math.max(1, Math.round(2 * carScale)), Math.round(5 * carScale));
    ctx.fillRect(dx + dstW - Math.round(15 * carScale) + shiftX, dy + Math.round(9 * carScale), Math.max(1, Math.round(2 * carScale)), Math.round(5 * carScale));

    // Active DRS Open Rear-Wing Slot + Glowing Neon-Green Endplate Indicators!
    if (playerCar?.drsActive) {
      const wingX = dx + Math.round(dstW * 0.25);
      const wingW = Math.round(dstW * 0.50);
      const wingY = dy + Math.round(dstH * 0.55);
      ctx.fillStyle = '#182438';
      ctx.fillRect(wingX + 2, wingY, wingW - 4, 2);
      ctx.fillStyle = '#00fc58';
      ctx.fillRect(wingX, wingY - 1, 2, 4);
      ctx.fillRect(wingX + wingW - 2, wingY - 1, 2, 4);
    }

    // Foreground 6-Man Pit Crew (4 Wheel Gunners + Pneumatic Sparks + Rear Jack Man + Lollipop Marshal)!
    if (isPitServiceActive) {
      this._renderPitStopCrewChase(W, H, dx, dy, dstW, dstH, baseCarX, baseCarY, pitProg, pitSub, playerCar, raceSystems, false, nowSec);
      return;
    }

    // Twin Pixel Exhaust Shift-Cut Flames & Electric-Blue Hybrid ERS Plasma Arcs!
    const ersOn = !!(playerCar?.ersDeploying || (playerCar?.drsActive && speedKmh > 235) || (playerCar?.throttleInput > 0.92 && speedKmh > 265));
    if (((playerCar?.shiftCooldown > 0.04 || playerCar?.revBlipTimer > 0.02) && speedKmh > 75) || ersOn) {
      const fx = baseCarX + (steerFrameIdx - 2);
      const fy = dy + Math.round(dstH * 0.78);
      if (ersOn && (((nowSec * 24) | 0) & 1) === 0) {
        ctx.fillStyle = '#00e8ff';
        ctx.fillRect(fx - 6, fy, 4, 3);
        ctx.fillRect(fx + 2, fy, 4, 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(fx - 1, fy + 1, 2, 3);
      } else {
        ctx.fillStyle = '#fc8400';
        ctx.fillRect(fx - 6, fy, 4, 4);
        ctx.fillRect(fx + 2, fy, 4, 4);
        ctx.fillStyle = '#54ecff';
        ctx.fillRect(fx - 5, fy + 1, 2, 2);
        ctx.fillRect(fx + 3, fy + 1, 2, 2);
      }
    }

    // Pixel Tire Smoke, Wet Rooster-Tail Spray, Grass Dirt & Titanium Kerb Sparks!
    const skid = playerCar?.skidIntensity || 0;
    const aquaplane = (playerCar?.aquaplaneTimer || 0) > 0;
    const leftTireX = dx + Math.round(dstW * 0.14);
    const rightTireX = dx + Math.round(dstW * 0.80);
    const tireBaseY = baseCarY - 3;
    const tick = (nowSec * 32) | 0;

    if (aquaplane || ((isRainy || puddlesActive) && speedKmh > 95 && (aquaplane || isRainy))) {
      for (let p = 0; p < 6; p++) {
        const ox = (((p * 11 + tick * 3) % 9) - 4);
        const oy = -((p * 5 + tick * 2) % 12);
        ctx.fillStyle = (p & 1) === 0 ? '#68c8ff' : '#d8f4ff';
        ctx.fillRect(leftTireX + ox, tireBaseY + oy, 3, 2);
        ctx.fillRect(rightTireX + ox, tireBaseY + oy, 3, 2);
      }
    } else if (skid > 0.16 && speedKmh > 35) {
      const puffs = Math.min(8, Math.ceil(skid * 8));
      for (let p = 0; p < puffs; p++) {
        const ox = (((p * 13 + tick * 5) % 11) - 5);
        const oy = -((p * 4 + tick * 3) % 9);
        ctx.fillStyle = (p & 1) === 0 ? '#f0f4fc' : '#b0bccf';
        ctx.fillRect(leftTireX + ox, tireBaseY + oy, 3, 3);
        ctx.fillRect(rightTireX + ox, tireBaseY + oy, 3, 3);
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

    if ((playerCar?.onCurb && speedKmh > 90) || speedKmh > 282) {
      for (let p = 0; p < 5; p++) {
        const sx = baseCarX + (((p * 17 + tick * 9) % 28) - 14);
        const sy = tireBaseY - ((p * 7 + tick * 5) % 9);
        ctx.fillStyle = (p & 1) === 0 ? '#fcf400' : '#fc6800';
        ctx.fillRect(sx, sy, 2, 1);
      }
    }

    // Dual Rear-Wingtip Aero Vortex Pixel Contrails + 1982 Slipstream/DRS Speed-Flash Badge!
    if ((playerCar?.inSlipstream || playerCar?.drsActive) && speedKmh > 185) {
      const wingY = dy + Math.round(dstH * 0.24);
      const wingL = dx + Math.round(dstW * 0.22);
      const wingR = dx + Math.round(dstW * 0.78);
      for (let v = 0; v < 4; v++) {
        const vy = wingY - v * 3 - (tick % 3);
        ctx.fillStyle = (v & 1) === 0 ? '#54ecff' : '#f8f8f8';
        ctx.fillRect(wingL - v, vy, 2, 2);
        ctx.fillRect(wingR + v - 1, vy, 2, 2);
      }
      const flashCol = (((nowSec * 12) | 0) & 1) === 0 ? 'CYAN' : 'YELLOW';
      const boostTxt = playerCar?.drsActive ? 'DRS BOOST!' : 'SLIPSTREAM!';
      this._drawAtlasText(boostTxt, baseCarX, Math.max(48, dy - 11), flashCol, 1, 'center', 5);
    }
  }

  _renderPitStopCrewChase(W, H, dx, dy, dstW, dstH, baseCarX, baseCarY, pitProg, pitSub, playerCar, raceSystems, isBackPass, nowSec) {
    const ctx = this.ctx;
    const rushIn = pitProg < 0.14 ? (1.0 - pitProg / 0.14) : (pitProg > 0.88 ? (pitProg - 0.88) / 0.12 : 0.0);
    const rushPx = Math.round(clamp(rushIn, 0, 1) * 14);
    const gunActive = pitProg >= 0.16 && pitProg <= 0.80;
    const oldCompHex = this._resolveCompoundColor(playerCar?.compound || 'SOFT');
    const newCompHex = this._resolveCompoundColor(raceSystems?.playerPitPlan?.nextCompound || playerCar?.compound || 'MEDIUM');

    if (isBackPass) {
      // Painted FIA Yellow/Red Pit Stop Stall Lines on Tarmac
      ctx.fillStyle = '#fcf400';
      ctx.fillRect(dx - 8, dy - 3, dstW + 16, 2);
      ctx.fillRect(dx - 8, dy - 3, 2, dstH + 6);
      ctx.fillRect(dx + dstW + 6, dy - 3, 2, dstH + 6);

      // Overhead Pit-Gantry Boom Arm & Compressed Air Hoses Extending from Right Pit Wall
      const boomY = Math.max(32, dy - 16);
      ctx.fillStyle = '#dce4f2';
      ctx.fillRect(baseCarX - 18, boomY, Math.max(24, W - (baseCarX - 18)), 3);
      ctx.fillStyle = '#fc2818';
      ctx.fillRect(baseCarX - 16, boomY + 3, 34, 2);
      // Coiled overhead air-gun hoses dropping to FL/FR/RL/RR
      ctx.fillStyle = '#fcf400';
      ctx.fillRect(dx - 3, boomY + 3, 1, Math.max(4, dy + 8 - boomY));
      ctx.fillRect(dx + dstW + 2, boomY + 3, 1, Math.max(4, dy + 8 - boomY));

      // Crew #1: Front Jack Man (Ahead of Nosecone lifting front wing!)
      const fjX = baseCarX - 4;
      const fjY = dy - 14 - Math.round(rushPx * 0.5);
      ctx.fillStyle = '#f8f8f8'; // White/Blue helmet
      ctx.fillRect(fjX + 2, fjY, 5, 4);
      ctx.fillStyle = '#1858f8';
      ctx.fillRect(fjX + 2, fjY + 1, 5, 2);
      ctx.fillStyle = '#e01818'; // Red fireproof suit
      ctx.fillRect(fjX + 1, fjY + 4, 7, 8);
      ctx.fillStyle = '#fc2818'; // Hydraulic front jack pole
      ctx.fillRect(baseCarX - 1, fjY + 8, 2, Math.max(3, dy + 4 - (fjY + 8)));

      // Lollipop Marshal with Live STOP / 1ST / GO! Pixel Signboard!
      const lolX = Math.max(4, dx - 22);
      const lolY = dy - 18;
      ctx.fillStyle = '#fcf400'; // Marshal helmet
      ctx.fillRect(lolX + 2, lolY + 6, 5, 4);
      ctx.fillStyle = '#1858f8'; // Marshal suit
      ctx.fillRect(lolX + 1, lolY + 10, 7, 10);
      // Pole + Sign disc
      const signX = baseCarX - 13;
      const signY = dy - 14 - (pitProg > 0.90 ? 6 : 0);
      ctx.fillStyle = '#dce4f2';
      ctx.fillRect(lolX + 7, lolY + 10, Math.max(4, signX - (lolX + 7)), 2);
      const isGo = pitProg > 0.88;
      const isGear1 = !isGo && pitProg > 0.68;
      ctx.fillStyle = '#0c1018';
      ctx.fillRect(signX, signY, 26, 10);
      ctx.fillStyle = isGo ? '#00fc58' : (isGear1 ? '#fcf400' : '#ff2020');
      ctx.fillRect(signX + 1, signY + 1, 24, 8);
      const lolTxt = isGo ? 'GO!' : (isGear1 ? '1ST' : 'STOP');
      this._drawAtlasText(lolTxt, signX + 13, signY + 2, isGo || isGear1 ? 'WHITE' : 'YELLOW', 1, 'center', 5);
      return;
    }

    // Foreground Pass — 4 Corner Wheel Gunners (FL, FR, RL, RR) + Crew #2 Rear Jack Man!
    const wheelCorners = [
      { side: -1, wy: dy + Math.round(dstH * 0.18) }, // FL
      { side:  1, wy: dy + Math.round(dstH * 0.18) }, // FR
      { side: -1, wy: dy + Math.round(dstH * 0.68) }, // RL
      { side:  1, wy: dy + Math.round(dstH * 0.68) }, // RR
    ];
    const sparkTick = (nowSec * 36) | 0;
    for (let c = 0; c < 4; c++) {
      const wc = wheelCorners[c];
      const outward = rushPx * wc.side;
      const gx = wc.side < 0 ? (dx - 11 + outward) : (dx + dstW + 3 + outward);
      const gy = wc.wy;
      if (gx < -8 || gx > W + 8) continue;

      // Spare / Removed Pirelli Wheel next to Mechanic
      const spareX = wc.side < 0 ? gx - 6 : gx + 8;
      ctx.fillStyle = '#14161c';
      ctx.fillRect(spareX, gy + 2, 5, 8);
      ctx.fillStyle = pitProg < 0.50 ? newCompHex : oldCompHex;
      ctx.fillRect(spareX + 1, gy + 3, 3, 6);

      // Kneeling Mechanic (White Helmet + Crimson Team Suit + Pneumatic Air Gun)
      ctx.fillStyle = '#f8f8f8';
      ctx.fillRect(gx + 1, gy - 3, 5, 4);
      ctx.fillStyle = '#1858f8';
      ctx.fillRect(gx + 1, gy - 2, 5, 1);
      ctx.fillStyle = '#d8181c';
      ctx.fillRect(gx, gy + 1, 7, 8);
      ctx.fillStyle = '#202634';
      ctx.fillRect(wc.side < 0 ? gx + 5 : gx - 3, gy + 3, 5, 2);

      // Pneumatic Wheel-Gun High-RPM Cyan/Yellow Sparks!
      if (gunActive && ((sparkTick + c) & 1) === 0) {
        const spX = wc.side < 0 ? dx + 1 : dx + dstW - 3;
        ctx.fillStyle = ((sparkTick + c) % 4 === 0) ? '#54ecff' : '#fcf400';
        ctx.fillRect(spX, gy + 2, 3, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(spX + (wc.side < 0 ? -2 : 2), gy + 4, 2, 1);
      }
    }

    // Crew #2: Rear Jack Man behind Diffuser
    const rjX = baseCarX - 4;
    const rjY = Math.min(H - 12, baseCarY - 4 + Math.round(rushPx * 0.4));
    ctx.fillStyle = '#fcf400';
    ctx.fillRect(rjX + 2, rjY, 5, 4);
    ctx.fillStyle = '#d8181c';
    ctx.fillRect(rjX + 1, rjY + 4, 7, 6);
    ctx.fillStyle = '#dce4f2';
    ctx.fillRect(baseCarX - 1, baseCarY - 4, 2, 5);
  }

  // ==========================================================================
  // CAMERA 1: 1982 OVERHEAD HALO T-CAM PIXEL FOREGROUND
  // ==========================================================================
  _renderTCamForeground(
    W, H, horizonY, playerCar, speedKmh, steerInput, distGame, rollPanPx,
    isRainy, puddlesActive, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
  ) {
    const ctx = this.ctx;
    const bottomY = H > 275 ? H - Math.round(H * 0.24) : H;
    const cx = (W >> 1) + Math.round(rollPanPx * 0.5);
    const steerPx = Math.round(clamp(steerInput, -1, 1) * 7);
    const tirePhase = speedKmh > 1.0 ? (Math.floor(distGame * 4.6) & 1) : 0;
    const compHex = this._resolveCompoundColor(playerCar?.compound || 'SOFT');
    const wComp = Array.isArray(playerCar?.wheelCompression) ? playerCar.wheelCompression : null;
    const curbJolt = (playerCar?.onCurb && speedKmh > 25 && (((nowSec * 40) | 0) & 1)) ? -2 : 0;
    const flBounce = curbJolt - Math.round(clamp(wComp ? wComp[0] : 0, -0.5, 0.8) * 4);
    const frBounce = -curbJolt - Math.round(clamp(wComp ? wComp[1] : 0, -0.5, 0.8) * 4);

    const spanHalf = W < 220 ? 64 : 92;
    const wheelW = W < 220 ? 18 : 24;
    const wheelH = W < 220 ? 32 : 38;
    const wheelBaseY = bottomY - wheelH - 6;

    // Chrome Double-Wishbone Suspension Arms connecting Chassis to Front Uprights
    ctx.fillStyle = '#9aa8bc';
    ctx.fillRect(cx - spanHalf + wheelW - 2, wheelBaseY + 11 + flBounce, spanHalf - wheelW - 8, 2);
    ctx.fillRect(cx - spanHalf + wheelW - 2, wheelBaseY + 22 + flBounce, spanHalf - wheelW - 6, 2);
    ctx.fillRect(cx + 10, wheelBaseY + 11 + frBounce, spanHalf - wheelW - 8, 2);
    ctx.fillRect(cx + 8, wheelBaseY + 22 + frBounce, spanHalf - wheelW - 6, 2);

    // Left & Right Exposed Steering/Spinning Pixel Front Slicks + Brake Glow!
    const brakingHot = (playerCar?.brakeInput || 0) > 0.18 && speedKmh > 65;
    for (let s = -1; s <= 1; s += 2) {
      const bY = s < 0 ? flBounce : frBounce;
      const wx = (s < 0 ? cx - spanHalf : cx + spanHalf - wheelW) + steerPx;
      const wy = wheelBaseY + bY;
      ctx.fillStyle = '#12141a';
      ctx.fillRect(wx, wy, wheelW, wheelH);
      ctx.fillStyle = '#282e3a';
      ctx.fillRect(wx + 2, wy + 2, wheelW - 4, wheelH - 4);
      // Spinning tread highlight bars
      const barOff = tirePhase ? 5 : 0;
      ctx.fillStyle = '#5c667a';
      for (let by = wy + 3 + barOff; by < wy + wheelH - 4; by += 10) {
        ctx.fillRect(wx + 3, by, wheelW - 6, 2);
      }
      // Pirelli Compound Sidewall Stripe on Inner Edge
      ctx.fillStyle = compHex;
      ctx.fillRect(s < 0 ? wx + wheelW - 3 : wx + 1, wy + 4, 2, wheelH - 8);
      // Glowing Orange/Red Carbon Brake Duct when Braking Hard!
      if (brakingHot) {
        ctx.fillStyle = '#ff4800';
        ctx.fillRect(s < 0 ? wx + wheelW : wx - 2, wy + 9, 2, wheelH - 18);
      }
    }

    // Sleek Tapered Crimson/White/Gold #1 Nosecone Pointing Forward from T-Cam!
    const noseTopY = bottomY - (W < 220 ? 52 : 62);
    for (let row = 0; row < bottomY - noseTopY; row++) {
      const t = row / Math.max(1, bottomY - noseTopY);
      const halfW = Math.round(5 + t * (W < 220 ? 15 : 21));
      const ny = noseTopY + row;
      const nx = cx + Math.round((1.0 - t) * steerPx * 0.4);
      ctx.fillStyle = '#a40c14';
      ctx.fillRect(nx - halfW, ny, halfW * 2, 1);
      ctx.fillStyle = '#e81c24';
      ctx.fillRect(nx - halfW + 2, ny, Math.max(2, (halfW - 2) * 2), 1);
      if (t > 0.18 && t < 0.72) {
        ctx.fillStyle = '#f8f8f8';
        ctx.fillRect(nx - 3, ny, 6, 1);
      }
    }
    this._drawAtlasText('1', cx, noseTopY + 18, 'RED', 1, 'center', 5);

    // Titanium Halo Center Strut & Curved Top Hoop Arch + Driver Helmet Crown!
    const haloY = bottomY - 22;
    ctx.fillStyle = '#1c222e';
    ctx.fillRect(cx - (W < 220 ? 28 : 38), haloY, (W < 220 ? 56 : 76), 5);
    ctx.fillRect(cx - 2, noseTopY + 28, 4, Math.max(4, haloY - (noseTopY + 28)));
    ctx.fillStyle = '#4c586e';
    ctx.fillRect(cx - (W < 220 ? 24 : 34), haloY + 1, (W < 220 ? 48 : 68), 2);
    // Driver White/Blue Helmet Crown under Halo
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(cx - 8, bottomY - 15, 16, 12);
    ctx.fillStyle = '#1858f8';
    ctx.fillRect(cx - 8, bottomY - 12, 16, 3);

    // Pit Crew Lollipop & Gunners Visible in T-Cam During Pit Stop!
    if (isPitServiceActive) {
      const pitInfo = this._resolvePitProgressAndLabel(playerCar, pitServiceSubPhase, nowSec);
      const isGo = pitInfo.prog > 0.88;
      ctx.fillStyle = isGo ? '#00fc58' : '#ff2020';
      ctx.fillRect(cx - 14, noseTopY - 14, 28, 10);
      this._drawAtlasText(isGo ? 'GO!' : 'PIT', cx, noseTopY - 12, 'WHITE', 1, 'center', 5);
    }

    if (H > 275 && bottomY < H) {
      ctx.fillStyle = '#0c1018';
      ctx.fillRect(0, bottomY, W, H - bottomY);
    }
  }

  // ==========================================================================
  // CAMERA 2: 1982 FIRST-PERSON PIXEL COCKPIT VIEW (LIVE MIRRORS + MOMO WHEEL!)
  // ==========================================================================
  _renderCockpitViewForeground(
    W, H, horizonY, playerCar, allCars, pS, pLat, mPerGameM, speedKmh, steerInput, distGame, rollPanPx,
    isRainy, puddlesActive, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
  ) {
    const ctx = this.ctx;
    // Anchor entire cockpit above bottom touch controls in portrait (H > 275)!
    const bottomY = H > 275 ? H - Math.round(H * 0.23) : H;
    const isNarrow = W < 225;
    const cx = (W >> 1) + Math.round(rollPanPx * 0.6);
    const steerPx = Math.round(clamp(steerInput, -1, 1) * (isNarrow ? 6 : 9));
    const tirePhase = speedKmh > 1.0 ? (Math.floor(distGame * 4.8) & 1) : 0;

    let pitProg = 0;
    if (isPitServiceActive) {
      pitProg = this._resolvePitProgressAndLabel(playerCar, pitServiceSubPhase, nowSec).prog;
    }
    const activeCompName = (isPitServiceActive && pitProg >= 0.52 && raceSystems?.playerPitPlan?.nextCompound)
      ? raceSystems.playerPitPlan.nextCompound
      : (playerCar?.compound || 'SOFT');
    const compHex = this._resolveCompoundColor(activeCompName);

    const wComp = Array.isArray(playerCar?.wheelCompression) ? playerCar.wheelCompression : null;
    const curbShake = (playerCar?.onCurb && speedKmh > 20) ? ((((nowSec * 44) | 0) & 1) ? -2 : 1) : 0;
    const flBounce = curbShake - Math.round(clamp(wComp ? wComp[0] : 0, -0.5, 0.8) * 5);
    const frBounce = -curbShake - Math.round(clamp(wComp ? wComp[1] : 0, -0.5, 0.8) * 5);

    // 1. Exposed Left & Right Open-Wheel Pixel Front Slicks + Chrome Double-Wishbones (Positioned Ahead of Mirrors & Cowling!)
    const cowlTopY = bottomY - (isNarrow ? 44 : 50);
    const wheelW = isNarrow ? 16 : 24;
    const wheelH = isNarrow ? 28 : 34;
    const wheelOutHalf = isNarrow ? 66 : Math.min(Math.round(W * 0.36), 116);
    const wheelBaseY = cowlTopY - (isNarrow ? 26 : 32);
    const brakingHot = (playerCar?.brakeInput || 0) > 0.18 && speedKmh > 65;

    // Chrome suspension upper/lower wishbones + pushrod extending from nosecone to front uprights
    ctx.fillStyle = '#acb8cc';
    ctx.fillRect(cx - wheelOutHalf + wheelW - 1, wheelBaseY + 10 + flBounce, Math.max(6, wheelOutHalf - wheelW - 12), 2);
    ctx.fillRect(cx - wheelOutHalf + wheelW - 1, wheelBaseY + 21 + flBounce, Math.max(6, wheelOutHalf - wheelW - 9), 2);
    ctx.fillRect(cx + 13, wheelBaseY + 10 + frBounce, Math.max(6, wheelOutHalf - wheelW - 12), 2);
    ctx.fillRect(cx + 10, wheelBaseY + 21 + frBounce, Math.max(6, wheelOutHalf - wheelW - 9), 2);

    for (let side = -1; side <= 1; side += 2) {
      const bY = side < 0 ? flBounce : frBounce;
      const wx = (side < 0 ? cx - wheelOutHalf : cx + wheelOutHalf - wheelW) + steerPx;
      const wy = wheelBaseY + bY;

      // Vulcanized dark slick tire block + shoulder bevel
      ctx.fillStyle = '#0e1016';
      ctx.fillRect(wx, wy, wheelW, wheelH);
      ctx.fillStyle = '#242a36';
      ctx.fillRect(wx + 2, wy + 2, wheelW - 4, wheelH - 4);
      // Spinning 1982 pixel tread highlight bars
      const barShift = tirePhase ? 5 : 0;
      ctx.fillStyle = '#68748a';
      for (let ty = wy + 4 + barShift; ty < wy + wheelH - 4; ty += 9) {
        ctx.fillRect(wx + 3, ty, wheelW - 6, 2);
      }
      // Live Pirelli Compound Sidewall Stripe!
      ctx.fillStyle = compHex;
      const stripeX = side < 0 ? wx + wheelW - 4 : wx + 2;
      ctx.fillRect(stripeX, wy + 4, 2, wheelH - 8);
      // Carbon brake disc thermal glow on heavy braking
      if (brakingHot) {
        ctx.fillStyle = '#ff3c00';
        ctx.fillRect(side < 0 ? wx + wheelW : wx - 2, wy + 10, 2, wheelH - 20);
      }
      // Wet spray / kerb sparks off exposed front tires!
      if ((isRainy || puddlesActive) && speedKmh > 80) {
        ctx.fillStyle = '#8ce0ff';
        ctx.fillRect(wx + (((nowSec * 33) | 0) % wheelW), wy - 3, 3, 2);
      }
    }

    // 2. Riveted Crimson/White/Blue #1 Nosecone Extending Forward Toward Horizon!
    const noseTipY = cowlTopY - (isNarrow ? 18 : 22);
    for (let y = noseTipY; y <= cowlTopY; y++) {
      const frac = (y - noseTipY) / Math.max(1, cowlTopY - noseTipY);
      const halfW = Math.round((isNarrow ? 9 : 12) + frac * (isNarrow ? 26 : 38));
      const rowCx = cx + Math.round((1.0 - frac) * steerPx * 0.35);
      ctx.fillStyle = '#9c0c14';
      ctx.fillRect(rowCx - halfW, y, halfW * 2, 1);
      ctx.fillStyle = '#e41820';
      ctx.fillRect(rowCx - halfW + 3, y, Math.max(2, (halfW - 3) * 2), 1);
      // Center white championship stripe + twin blue pinstripes
      const stripeHalf = Math.max(2, Math.round(2 + frac * 5));
      ctx.fillStyle = '#f8f8f8';
      ctx.fillRect(rowCx - stripeHalf, y, stripeHalf * 2, 1);
      ctx.fillStyle = '#1858f8';
      ctx.fillRect(rowCx - stripeHalf - 1, y, 1, 1);
      ctx.fillRect(rowCx + stripeHalf, y, 1, 1);
    }
    // Riveted aluminum panel dots along aero cowling
    ctx.fillStyle = '#dce4f2';
    for (let r = -3; r <= 3; r++) {
      if (r === 0) continue;
      ctx.fillRect(cx + r * (isNarrow ? 7 : 10), cowlTopY - 3, 1, 1);
    }
    this._drawAtlasText('1', cx, cowlTopY - 12, 'RED', 1, 'center', 5);

    // 3. Titanium Halo Center Pillar & Upper Halo Arch Framing the Track!
    const haloArchY = Math.max(isNarrow ? 30 : 28, horizonY - (isNarrow ? 30 : 34));
    ctx.fillStyle = '#181e2a';
    // Curved upper Halo arch
    ctx.fillRect(0, haloArchY, W, 3);
    ctx.fillRect(cx - 24, haloArchY + 3, 48, 2);
    // Slim Halo center pillar (2px wide so forward apex visibility stays crystal-clear!)
    ctx.fillRect(cx - 1, haloArchY + 4, 3, Math.max(4, noseTipY - (haloArchY + 4)));
    ctx.fillStyle = '#3c485e';
    ctx.fillRect(cx, haloArchY + 4, 1, Math.max(4, noseTipY - (haloArchY + 4)));

    // Pit Crew Visible Right Outside the Cockpit During Pit Service!
    if (isPitServiceActive) {
      const isGo = pitProg > 0.88;
      const isGear1 = !isGo && pitProg > 0.68;
      const signY = noseTipY - 16 - (isGo ? 5 : 0);
      ctx.fillStyle = '#0c1018';
      ctx.fillRect(cx - 16, signY, 32, 11);
      ctx.fillStyle = isGo ? '#00fc58' : (isGear1 ? '#fcf400' : '#ff2020');
      ctx.fillRect(cx - 15, signY + 1, 30, 9);
      this._drawAtlasText(isGo ? 'GO!' : (isGear1 ? '1ST' : 'STOP'), cx, signY + 2, 'WHITE', 1, 'center', 5);
      // FL & FR Wheel Gunners beside front slicks firing air-gun sparks
      if (pitProg >= 0.16 && pitProg <= 0.80 && (((nowSec * 32) | 0) & 1) === 0) {
        ctx.fillStyle = '#54ecff';
        ctx.fillRect(cx - wheelOutHalf + wheelW + 1, wheelBaseY + 14, 4, 3);
        ctx.fillRect(cx + wheelOutHalf - wheelW - 5, wheelBaseY + 14, 4, 3);
      }
    }

    // 4. Live Left & Right Pixel Wing Mirrors (Dynamically Rendering Trailing Rivals 0 < deltaS_behind < 65m!)
    this._renderCockpitWingMirrors(W, cx, cowlTopY, horizonY, allCars, pS, pLat, mPerGameM, isNarrow, nowSec);

    // 5. Molded Carbon Cockpit Surround, Windscreen Lip & Digital F1 LED Dashboard!
    // Windscreen smoked polycarbonate lip
    ctx.fillStyle = 'rgba(24, 44, 76, 0.55)';
    ctx.fillRect(cx - (isNarrow ? 36 : 48), cowlTopY - 4, isNarrow ? 72 : 96, 4);
    // Dark carbon cockpit coaming & side bolsters
    ctx.fillStyle = '#121620';
    ctx.fillRect(0, cowlTopY, W, bottomY - cowlTopY);
    ctx.fillStyle = '#c8141c';
    ctx.fillRect(0, cowlTopY, W, 2);
    ctx.fillStyle = '#242c3c';
    ctx.fillRect(cx - (isNarrow ? 44 : 58), cowlTopY + 2, isNarrow ? 88 : 116, bottomY - cowlTopY - 2);

    // Digital Dashboard Binnacle (10-LED RPM Shift Strip, Gear, KM/H, ERS Bar & DRS Lamp — 100% Unobstructed!)
    const dashW = isNarrow ? 82 : 102;
    const dashH = 21;
    const dashX = cx - (dashW >> 1);
    const dashY = cowlTopY + 1;
    ctx.fillStyle = '#060810';
    ctx.fillRect(dashX, dashY, dashW, dashH);
    ctx.fillStyle = '#485670';
    ctx.fillRect(dashX, dashY, dashW, 1);

    // 10-LED F1 Shift-Light Strip (Green -> Red -> Flashing Blue Strobe >= 11,400 RPM!)
    const rpm = playerCar?.rpm || 4000;
    const rpmFrac = clamp((rpm - 4200) / (12000 - 4200), 0, 1);
    const ledsLit = Math.round(rpmFrac * 10);
    const blueStrobe = rpm >= 11450 && (((nowSec * 24) | 0) & 1) === 0;
    const ledStart = dashX + Math.round((dashW - 40) * 0.5);
    for (let l = 0; l < 10; l++) {
      let lCol = '#1c2230';
      if (l < ledsLit) {
        if (blueStrobe) lCol = '#38d8ff';
        else if (l < 4) lCol = '#00fc58';
        else if (l < 7) lCol = '#fcf400';
        else lCol = '#ff2020';
      }
      ctx.fillStyle = lCol;
      ctx.fillRect(ledStart + l * 4, dashY + 2, 3, 3);
    }

    // Dashboard Digital Readouts: Gear (center), KM/H (left), DRS + ERS Bar (right)
    const is2Spd = (playerCar?.gearboxMode || '') === 'CLASSIC_2SPD';
    const gStr = is2Spd ? ((playerCar?.gear || 1) > 1 ? 'H' : 'L') : `G${playerCar?.gear || 1}`;
    this._drawAtlasText(String(Math.round(speedKmh)).padStart(3, ' '), dashX + 3, dashY + 7, 'CYAN', 1, 'left', 5);
    this._drawAtlasText(gStr, cx, dashY + 7, 'YELLOW', 1, 'center', 5);
    const drsOn = !!playerCar?.drsActive;
    ctx.fillStyle = drsOn ? '#00fc58' : '#1e2834';
    ctx.fillRect(dashX + dashW - 20, dashY + 7, 17, 6);
    if (drsOn) {
      this._drawAtlasText('DRS', dashX + dashW - 11, dashY + 7, 'WHITE', 1, 'center', 5);
    }
    // Electric-Blue ERS Charge Bar along bottom of dashboard
    const ersVal = clamp(
      Number.isFinite(playerCar?.ersCharge) ? playerCar.ersCharge : (1.0 - (playerCar?.throttleInput || 0) * 0.18),
      0,
      1
    );
    ctx.fillStyle = '#182234';
    ctx.fillRect(dashX + 4, dashY + 16, dashW - 8, 3);
    ctx.fillStyle = playerCar?.ersDeploying ? '#ffffff' : '#00e4ff';
    ctx.fillRect(dashX + 4, dashY + 16, Math.round((dashW - 8) * ersVal), 3);

    // 6. Animated 9-Angle 3-Spoke MOMO Leather Pixel Steering Wheel + Red/White Nomex Gloves!
    const wheelAngleIdx = clamp(Math.round(clamp(steerInput, -1, 1) * 4) + 4, 0, 8);
    const wheelSprite = this._momoWheelSprites[wheelAngleIdx];
    if (wheelSprite) {
      const wScale = isNarrow ? 0.80 : 0.92;
      const sw = Math.round(wheelSprite.width * wScale);
      const sh = Math.round(wheelSprite.height * wScale);
      const vibY = (speedKmh > 220 && (((nowSec * 35) | 0) & 1)) ? -1 : 0;
      ctx.drawImage(wheelSprite, Math.round(cx - sw * 0.5), bottomY - sh + 15 + vibY, sw, sh);
    }

    // Portrait bottom tub apron so no background leaks behind lower touch controls
    if (H > 275 && bottomY < H) {
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, bottomY, W, H - bottomY);
      ctx.fillStyle = '#1c2434';
      ctx.fillRect(0, bottomY, W, 2);
    }
  }

  _renderCockpitWingMirrors(W, cx, cowlTopY, horizonY, allCars, pS, pLat, mPerGameM, isNarrow, nowSec) {
    const ctx = this.ctx;
    const mirrorW = isNarrow ? 28 : 40;
    const mirrorH = isNarrow ? 14 : 18;
    const mirrorY = cowlTopY - mirrorH - (isNarrow ? 4 : 6);
    const leftMirrorX = isNarrow ? 4 : Math.max(8, cx - 108);
    const rightMirrorX = isNarrow ? (W - mirrorW - 4) : Math.min(W - mirrorW - 8, cx + 108 - mirrorW);

    // Select up to 3 closest trailing rival cars (0.6m < dBehind < 65.0m) in Zero-Allocation Scalar Slots!
    let d0 = 999, lat0 = 0, pal0 = 0;
    let d1 = 999, lat1 = 0, pal1 = 0;
    let d2 = 999, lat2 = 0, pal2 = 0;
    if (Array.isArray(allCars)) {
      for (let i = 0; i < allCars.length; i++) {
        const c = allCars[i];
        if (!c || c.isPlayer || c.exploded) continue;
        // Trailing distance behind player: forwardDeltaS(c.s, pS) is how far c must travel forward to reach pS!
        const behindGame = forwardDeltaS(c.s || 0, pS);
        const behindReal = behindGame * mPerGameM;
        if (behindReal <= 0.6 || behindReal >= 65.0) continue;
        const rLat = (c.lateralOffset || 0) - pLat;
        const pIdx = Math.abs((c.carNum || i) + i) % RIVAL_PALETTES_1982.length;
        if (behindReal < d0) {
          d2 = d1; lat2 = lat1; pal2 = pal1;
          d1 = d0; lat1 = lat0; pal1 = pal0;
          d0 = behindReal; lat0 = rLat; pal0 = pIdx;
        } else if (behindReal < d1) {
          d2 = d1; lat2 = lat1; pal2 = pal1;
          d1 = behindReal; lat1 = rLat; pal1 = pIdx;
        } else if (behindReal < d2) {
          d2 = behindReal; lat2 = rLat; pal2 = pIdx;
        }
      }
    }

    for (let m = 0; m < 2; m++) {
      const isLeft = m === 0;
      const mx = isLeft ? leftMirrorX : rightMirrorX;
      // Carbon stalk connecting mirror housing to cockpit coaming
      ctx.fillStyle = '#202634';
      ctx.fillRect(isLeft ? mx + mirrorW - 6 : mx + 2, mirrorY + mirrorH, 4, cowlTopY - (mirrorY + mirrorH) + 2);
      // Crimson aerodynamic outer shell + dark bezel
      ctx.fillStyle = '#c8141c';
      ctx.fillRect(mx - 2, mirrorY - 2, mirrorW + 4, mirrorH + 4);
      ctx.fillStyle = '#0c1018';
      ctx.fillRect(mx - 1, mirrorY - 1, mirrorW + 2, mirrorH + 2);

      // Mirror Glass Interior: Reflected Sky + Green Verge + Rear Tarmac + Curbs!
      const midMy = mirrorY + (mirrorH >> 1);
      ctx.fillStyle = '#4894fc';
      ctx.fillRect(mx, mirrorY, mirrorW, mirrorH >> 1);
      ctx.fillStyle = '#00a820';
      ctx.fillRect(mx, midMy, mirrorW, mirrorH - (mirrorH >> 1));
      ctx.fillStyle = '#60646e';
      ctx.fillRect(mx + 3, midMy, mirrorW - 6, mirrorH - (mirrorH >> 1));
      ctx.fillStyle = (((nowSec * 14) | 0) & 1) === 0 ? '#fc2818' : '#f8f8f8';
      ctx.fillRect(mx + 2, midMy, 1, mirrorH - (mirrorH >> 1));
      ctx.fillRect(mx + mirrorW - 3, midMy, 1, mirrorH - (mirrorH >> 1));

      // Draw up to 3 trailing rivals back-to-front (d2 -> d1 -> d0) inside mirror glass!
      let closeAlert = false;
      for (let slot = 2; slot >= 0; slot--) {
        const dist = slot === 2 ? d2 : (slot === 1 ? d1 : d0);
        if (dist >= 65.0) continue;
        const rLat = slot === 2 ? lat2 : (slot === 1 ? lat1 : lat0);
        const pal = RIVAL_PALETTES_1982[slot === 2 ? pal2 : (slot === 1 ? pal1 : pal0)];
        // Left mirror frames left/center (-9m..+3.5m); Right mirror frames center/right (-3.5m..+9m)
        if (isLeft && rLat > 4.2) continue;
        if (!isLeft && rLat < -4.2) continue;
        if (dist < 14.0) closeAlert = true;

        const mScale = clamp(12.0 / (dist + 4.0), 0.18, 0.95);
        const carW = Math.max(3, Math.round((mirrorW * 0.52) * mScale));
        const carH = Math.max(2, Math.round(carW * 0.52));
        const biasLat = isLeft ? (rLat + 2.2) : (rLat - 2.2);
        const carCx = Math.round(mx + mirrorW * 0.5 + (biasLat / 7.5) * (mirrorW * 0.42));
        const carBottom = Math.round(midMy + 2 + mScale * ((mirrorH >> 1) - 2));
        const cx0 = clamp(carCx - (carW >> 1), mx + 1, mx + mirrorW - carW - 1);
        const cy0 = clamp(carBottom - carH, mirrorY + 1, mirrorY + mirrorH - carH - 1);

        // Mini pixel F1 rival silhouette: black front slicks + vibrant team nose/wings + helmet dot!
        ctx.fillStyle = '#101218';
        ctx.fillRect(cx0, cy0 + 1, Math.max(1, carW >> 2), carH - 1);
        ctx.fillRect(cx0 + carW - Math.max(1, carW >> 2), cy0 + 1, Math.max(1, carW >> 2), carH - 1);
        ctx.fillStyle = pal.body;
        ctx.fillRect(cx0 + 1, cy0, Math.max(1, carW - 2), carH);
        ctx.fillStyle = pal.wing;
        ctx.fillRect(cx0, cy0 + carH - 1, carW, 1);
      }

      // Flashing Amber/Red Proximity Warning LED on Mirror Bezel when Rival < 14m Behind!
      if (closeAlert && (((nowSec * 16) | 0) & 1) === 0) {
        ctx.fillStyle = '#fcf400';
        ctx.fillRect(isLeft ? mx : mx + mirrorW - 3, mirrorY, 3, 3);
      }
    }
  }

  // ==========================================================================
  // CAMERA 3: 1982 LOW ASPHALT NOSE / FRONT-WING PIXEL CAM
  // ==========================================================================
  _renderNoseCamForeground(
    W, H, horizonY, playerCar, speedKmh, steerInput, distGame, rollPanPx,
    isRainy, puddlesActive, isPitServiceActive, pitServiceSubPhase, raceSystems, nowSec
  ) {
    const ctx = this.ctx;
    const bottomY = H > 275 ? H - Math.round(H * 0.24) : H;
    const isNarrow = W < 225;
    const steerPx = Math.round(clamp(steerInput, -1, 1) * 5);
    const tirePhase = speedKmh > 1.0 ? (Math.floor(distGame * 5.0) & 1) : 0;
    const compHex = this._resolveCompoundColor(playerCar?.compound || 'SOFT');
    const wingH = isNarrow ? 20 : 26;
    const wingW = isNarrow ? 48 : 74;

    // Left & Right Multi-Element Cascade Front-Wing Flaps, Endplates & Inner Spinning Slicks!
    for (let side = -1; side <= 1; side += 2) {
      const innerWheelW = isNarrow ? 12 : 16;
      const innerWheelH = isNarrow ? 28 : 34;
      const wx = side < 0 ? steerPx : (W - innerWheelW + steerPx);
      const wy = bottomY - innerWheelH - 4;
      ctx.fillStyle = '#101218';
      ctx.fillRect(wx, wy, innerWheelW, innerWheelH);
      ctx.fillStyle = compHex;
      ctx.fillRect(side < 0 ? wx + innerWheelW - 2 : wx, wy + 3, 2, innerWheelH - 6);
      if (tirePhase) {
        ctx.fillStyle = '#606c82';
        ctx.fillRect(wx + 2, wy + 8, innerWheelW - 4, 2);
        ctx.fillRect(wx + 2, wy + 20, innerWheelW - 4, 2);
      }

      // Multi-plane Crimson & White Front Wing Cascade Flaps + Endplate Diveplane
      const fx = side < 0 ? innerWheelW + steerPx : W - innerWheelW - wingW + steerPx;
      const fy = bottomY - wingH;
      ctx.fillStyle = '#c8141c';
      ctx.fillRect(fx, fy + 6, wingW, wingH - 6);
      ctx.fillStyle = '#f8f8f8';
      ctx.fillRect(fx + 2, fy + 9, wingW - 4, 3);
      ctx.fillRect(fx + 4, fy + 15, wingW - 8, 3);
      // Tall Endplate Fence
      const epX = side < 0 ? fx : fx + wingW - 4;
      ctx.fillStyle = '#e81c24';
      ctx.fillRect(epX, fy, 4, wingH);
      ctx.fillStyle = '#fcf400';
      ctx.fillRect(epX, fy, 4, 3);
    }

    // Center Nose Tip Lip + Titanium Kerb Sparks at Ground Level!
    const cx = (W >> 1) + Math.round(rollPanPx * 0.5);
    ctx.fillStyle = '#e41820';
    ctx.fillRect(cx - 14, bottomY - 7, 28, 7);
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(cx - 5, bottomY - 7, 10, 7);

    if ((playerCar?.onCurb && speedKmh > 80) || speedKmh > 285) {
      const tick = (nowSec * 36) | 0;
      for (let s = 0; s < 6; s++) {
        ctx.fillStyle = (s & 1) === 0 ? '#fcf400' : '#ff6800';
        ctx.fillRect(cx + (((s * 19 + tick * 7) % 60) - 30), bottomY - 4 - ((s * 5 + tick * 3) % 10), 2, 1);
      }
    }

    if (isPitServiceActive) {
      const pitInfo = this._resolvePitProgressAndLabel(playerCar, pitServiceSubPhase, nowSec);
      const isGo = pitInfo.prog > 0.88;
      ctx.fillStyle = isGo ? '#00fc58' : '#ff2020';
      ctx.fillRect(cx - 16, bottomY - 36, 32, 10);
      this._drawAtlasText(isGo ? 'GO!' : 'STOP', cx, bottomY - 34, 'WHITE', 1, 'center', 5);
    }

    if (H > 275 && bottomY < H) {
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, bottomY, W, H - bottomY);
    }
  }

  _renderVisorRaindrops(W, H, speedKmh, isMonsoon, nowSec) {
    const ctx = this.ctx;
    const maxVisorY = H > 275 ? H - Math.round(H * 0.25) : H - 18;
    const dropCount = isMonsoon ? 22 : 12;
    const cx = W >> 1;
    const cy = Math.round(maxVisorY * 0.45);
    const streakBoost = clamp(speedKmh / 280, 0, 1);

    for (let i = 0; i < dropCount; i++) {
      const life = ((nowSec * (1.2 + streakBoost * 2.2) + i * 0.37) % 1.0);
      const baseAng = (i * 2.39996) % (Math.PI * 2);
      const rad = (10 + (i % 7) * 14) + life * (16 + streakBoost * 42);
      const dx = Math.round(cx + Math.cos(baseAng) * rad * 1.35);
      const dy = Math.round(cy + Math.sin(baseAng) * rad * 0.75);
      if (dx < 3 || dx >= W - 3 || dy < 28 || dy >= maxVisorY) continue;
      ctx.fillStyle = '#88dcff';
      ctx.fillRect(dx, dy, 2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(dx, dy, 1, 1);
      if (streakBoost > 0.35) {
        const sx = Math.round(Math.cos(baseAng) * 3);
        const sy = Math.round(Math.sin(baseAng) * 2);
        ctx.fillStyle = 'rgba(168, 228, 255, 0.75)';
        ctx.fillRect(dx - sx, dy - sy, 1, 1);
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
    if (life < 0.25 || temp > 114) return '#ff2418';
    if (life < 0.52 || temp > 103) return '#fcf400';
    if (temp < 64) return '#48d4ff';
    return '#00fc58';
  }

  _renderTelemetryArcadeWidget(W, wy, playerCar, drsActive, nowSec) {
    const ctx = this.ctx;
    const wx = 4;
    // Compact 28x24 translucent dark arcade telemetry pod (4-Tire Thermal/Wear + Wing Damage + ERS + DRS)
    ctx.fillStyle = 'rgba(4, 8, 22, 0.58)';
    ctx.fillRect(wx, wy, 30, 25);

    const dmg = playerCar?.damage || null;
    const fwHealth = clamp(1.0 - (dmg?.frontWing || 0), 0, 1);
    const rwHealth = clamp(1.0 - (dmg?.rearWing || 0), 0, 1);

    // Front Wing Damage Bar
    ctx.fillStyle = fwHealth > 0.7 ? '#00fc58' : (fwHealth > 0.35 ? '#fcf400' : '#ff2020');
    ctx.fillRect(wx + 5, wy + 2, 12, 2);

    // Mini Chassis Spine
    ctx.fillStyle = '#c8141c';
    ctx.fillRect(wx + 9, wy + 4, 4, 14);

    // 4 Corner Tire Thermal / Wear Blocks (FL, FR, RL, RR)
    const tires = playerCar?.tires || null;
    const tempsArr = Array.isArray(playerCar?.tireTempsC) ? playerCar.tireTempsC : null;
    ctx.fillStyle = this._resolveTirePixelColor(tires?.FL, tempsArr ? tempsArr[0] : undefined, nowSec);
    ctx.fillRect(wx + 3, wy + 5, 4, 5);
    ctx.fillStyle = this._resolveTirePixelColor(tires?.FR, tempsArr ? tempsArr[1] : undefined, nowSec);
    ctx.fillRect(wx + 15, wy + 5, 4, 5);
    ctx.fillStyle = this._resolveTirePixelColor(tires?.RL, tempsArr ? tempsArr[2] : undefined, nowSec);
    ctx.fillRect(wx + 3, wy + 12, 4, 6);
    ctx.fillStyle = this._resolveTirePixelColor(tires?.RR, tempsArr ? tempsArr[3] : undefined, nowSec);
    ctx.fillRect(wx + 15, wy + 12, 4, 6);

    // Rear Wing / Active DRS Bar
    ctx.fillStyle = drsActive ? '#54ecff' : (rwHealth > 0.7 ? '#00fc58' : (rwHealth > 0.35 ? '#fcf400' : '#ff2020'));
    ctx.fillRect(wx + 5, wy + 19, 12, 2);

    // Vertical Electric-Blue Hybrid ERS Charge Bar on Right Edge of Pod + Compound Letter!
    const ersVal = clamp(
      Number.isFinite(playerCar?.ersCharge) ? playerCar.ersCharge : (1.0 - (playerCar?.throttleInput || 0) * 0.16),
      0,
      1
    );
    const barH = Math.round(18 * ersVal);
    ctx.fillStyle = '#182438';
    ctx.fillRect(wx + 23, wy + 3, 4, 18);
    ctx.fillStyle = playerCar?.ersDeploying ? '#ffffff' : '#00e4ff';
    ctx.fillRect(wx + 23, wy + 3 + (18 - barH), 4, barH);

    // Compound 1-letter pill (S/M/H/I/W)
    const compName = String(playerCar?.compound || 'SOFT');
    const compChar = compName.charAt(0) || 'S';
    const compPalette = compChar === 'S' ? 'RED' : (compChar === 'M' ? 'YELLOW' : (compChar === 'I' ? 'GREEN' : (compChar === 'F' || compChar === 'W' ? 'CYAN' : 'WHITE')));
    this._drawAtlasText(compChar === 'F' ? 'W' : compChar, wx + 2, wy + 23, compPalette, 1, 'left', 5);
    if (drsActive) {
      this._drawAtlasText('DRS', wx + 10, wy + 23, 'GREEN', 1, 'left', 5);
    }
  }

  _renderArcadeTopHUD(W, H, hud) {
    const ctx = this.ctx;
    const scoreStr = String(Math.max(0, Math.floor(hud.score || 0))).padStart(6, '0');
    const topStr = String(Math.max(0, Math.floor(hud.topScore || 25000))).padStart(6, '0');
    const timeInt = Math.max(0, Math.ceil(Number.isFinite(hud.timerSec) ? hud.timerSec : 0));
    const timeStr = String(timeInt).padStart(2, '0');
    const timeLowFlash = timeInt <= 10 && (((hud.nowSec * 6) | 0) & 1) === 0;
    const lapTimeStr = this._formatArcadeLapTime(hud.lapTimeSec);
    const spdStr = String(Math.round(hud.speedKmh)).padStart(3, ' ');
    const isClassic2Spd = hud.gearboxMode === 'CLASSIC_2SPD';
    const gearTxt = isClassic2Spd ? (hud.gear > 1 ? 'HIGH' : 'LOW') : `G${hud.gear}`;
    const gearColor = isClassic2Spd
      ? (hud.gear > 1 ? 'ORANGE' : 'GREEN')
      : (hud.gear >= 7 ? 'CYAN' : 'YELLOW');
    const posStr = `${this._ordinal(hud.playerPos)}/${hud.totalCars}`;

    const isPortraitHud = H > 275 || W < 275;
    const topY = H > 275 ? 5 : 3;

    // Subtle top translucent scanline header shade so bitmap glyphs pop on every circuit
    ctx.fillStyle = 'rgba(0, 4, 20, 0.42)';
    ctx.fillRect(0, 0, W, isPortraitHud ? topY + 23 : 27);

    if (!isPortraitHud) {
      // Full Classic 1982 Namco 5-Column Arcade Header (4:3, 16:9 Desktop, 20:9 Pixel 11 Pro Landscape)
      const step = W < 320 ? 5 : 6;
      this._drawAtlasText('TOP', 4, 3, 'RED', 1, 'left', step);
      this._drawAtlasText(topStr, 4 + step * 4, 3, 'WHITE', 1, 'left', step);
      this._drawAtlasText('SCORE', 4, 14, 'YELLOW', 1, 'left', step);
      this._drawAtlasText(scoreStr, 4 + step * 6, 14, 'YELLOW', 1, 'left', step);

      const col2X = Math.max(4 + step * 13, Math.round(W * 0.28));
      this._drawAtlasText(`LAP ${hud.currentLap}/${hud.totalLaps}`, col2X, 3, 'GREEN', 1, 'left', step);
      this._drawAtlasText(lapTimeStr, col2X, 14, 'GREEN', 1, 'left', step);

      const midX = W >> 1;
      this._drawAtlasText('TIME', midX, 2, 'RED', 1, 'center', step);
      this._drawAtlasText(timeStr, midX, 10, timeLowFlash ? 'RED' : 'YELLOW', 2, 'center', 11);

      if (W >= 340) {
        const col4X = Math.round(W * 0.66);
        this._drawAtlasText('POS', col4X, 3, 'CYAN', 1, 'left', step);
        this._drawAtlasText(posStr, col4X, 14, hud.playerPos === 1 ? 'YELLOW' : 'WHITE', 1, 'left', step);
      }

      this._drawAtlasText(`${spdStr}KM/H`, W - 4, 3, 'WHITE', 1, 'right', step);
      this._drawAtlasText(gearTxt, W - 4, 14, gearColor, 1, 'right', step);
      if (W < 340) {
        this._drawAtlasText(`P${hud.playerPos}`, W - 36, 14, 'CYAN', 1, 'right', step);
      }
    } else {
      // Square-Pixel Portrait 2-Row Arcade Header (W = 196): >=26px clear column gaps + top safe padding!
      this._drawAtlasText(`TOP ${topStr}`, 4, topY, 'RED', 1, 'left', 5);
      this._drawAtlasText(`TIME ${timeStr}`, W >> 1, topY, timeLowFlash ? 'RED' : 'YELLOW', 1, 'center', 5);
      this._drawAtlasText(`${Math.round(hud.speedKmh)}K ${gearTxt}`, W - 4, topY, gearColor, 1, 'right', 5);

      const row2Y = topY + 11;
      this._drawAtlasText(`SCR ${scoreStr}`, 4, row2Y, 'YELLOW', 1, 'left', 5);
      this._drawAtlasText(lapTimeStr, W >> 1, row2Y, 'GREEN', 1, 'center', 5);
      this._drawAtlasText(`P${hud.playerPos}/${hud.totalCars} L${hud.currentLap}`, W - 4, row2Y, 'CYAN', 1, 'right', 5);
    }

    // Compact 4-Tire Thermal/Wear + Wing Damage + ERS/DRS Arcade Widget at Upper-Left!
    this._renderTelemetryArcadeWidget(W, isPortraitHud ? topY + 25 : 29, hud.playerCar, hud.drsActive, hud.nowSec);

    // Camera Mode Switch Toast ("CAM: 1ST-PERSON COCKPIT", etc.)
    if (this._camBannerTimer > 0) {
      const camLabel = CAMERA_MODE_LABELS_1982[hud.camIdx] || CAMERA_MODE_LABELS_1982[0];
      this._drawAtlasText(camLabel, W - 4, isPortraitHud ? topY + 26 : 30, 'CYAN', 1, 'right', 5);
    }

    // Sector Split Delta Popup ("S1 -0.24S" Green / "+0.15S" Red)
    let sectorTxt = '';
    let sectorGreen = true;
    if (typeof hud.sectorDeltaPopup === 'string' && hud.sectorDeltaPopup.trim()) {
      sectorTxt = hud.sectorDeltaPopup.replace(/[^\x20-\x7E]/g, '').trim().toUpperCase();
      sectorGreen = !sectorTxt.includes('+');
    } else if (hud.sectorDeltaPopup && typeof hud.sectorDeltaPopup === 'object') {
      const rawLbl = String(hud.sectorDeltaPopup.text || hud.sectorDeltaPopup.label || '').replace(/[^\x20-\x7E]/g, '').trim().toUpperCase();
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
      const sy = isPortraitHud ? topY + 37 : 40;
      this._drawAtlasText(sectorTxt, W - 4, sy, sectorGreen ? 'GREEN' : 'RED', 1, 'right', 5);
    }

    // Overtake Excitement Surge Badge ("CROWD ROAR!")
    if (this._crowdRoarTimer > 0 && (((hud.nowSec * 10) | 0) & 1) === 0) {
      this._drawAtlasText('CROWD ROAR!', W >> 1, isPortraitHud ? topY + 48 : 50, 'YELLOW', 1, 'center', 5);
    }

    // Live 6-Man Pit Service Banner when Pitting!
    let bannerText = '';
    if (typeof hud.centerCallout === 'string') {
      bannerText = hud.centerCallout.trim();
    } else if (hud.centerCallout && typeof hud.centerCallout === 'object') {
      bannerText = String(hud.centerCallout.text || hud.centerCallout.message || '').trim();
    }
    if (!bannerText && hud.isPitServiceActive) {
      const pitInfo = this._resolvePitProgressAndLabel(hud.playerCar, hud.pitServiceSubPhase, hud.nowSec);
      bannerText = `PIT CREW: ${pitInfo.sub} ${pitInfo.remSec.toFixed(1)}S`;
    } else if (!bannerText && (hud.raceSystems?.vscActive || hud.playerCar?.vscActive)) {
      bannerText = 'VIRTUAL SAFETY CAR - SLOW';
    }
    if (bannerText) {
      bannerText = bannerText.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim();
    }

    // On portrait phones (H > 275), place callout banner cleanly below quick-action pills & above Mt. Fuji
    const bannerBaseY = H > 275 ? Math.min(Math.round(H * 0.22), 90) : 33;

    if (bannerText) {
      const charStep = W < 240 ? 5 : 6;
      const maxChars = Math.max(12, Math.floor((W - 18) / charStep));
      const clipped = bannerText.length > maxChars ? bannerText.slice(0, maxChars) : bannerText;
      const boxW = clipped.length * charStep + 12;
      const boxX = (W - boxW) >> 1;
      const boxY = bannerBaseY;

      ctx.fillStyle = '#080c24';
      ctx.fillRect(boxX, boxY, boxW, 15);
      ctx.fillStyle = (((hud.nowSec * 8) | 0) & 1) === 0 ? '#fcf400' : '#fc2818';
      ctx.fillRect(boxX + 1, boxY + 1, boxW - 2, 1);
      ctx.fillRect(boxX + 1, boxY + 13, boxW - 2, 1);
      ctx.fillRect(boxX + 1, boxY + 1, 1, 13);
      ctx.fillRect(boxX + boxW - 2, boxY + 1, 1, 13);

      const isGreenMsg =
        clipped.includes('EXTENDED') ||
        clipped.includes('QUALIFIED') ||
        clipped.includes('LIGHTS OUT') ||
        clipped.includes('GO');
      this._drawAtlasText(clipped, W >> 1, boxY + 3, isGreenMsg ? 'GREEN' : 'YELLOW', 1, 'center', charStep);
    } else if (hud.state === GAME_STATES.QUALIFYING && hud.sessionLabel) {
      const cleanSession = String(hud.sessionLabel).replace(/[^\x20-\x7E]/g, '').trim();
      if (cleanSession) {
        this._drawAtlasText(cleanSession, W >> 1, bannerBaseY, 'CYAN', 1, 'center', W < 240 ? 5 : 6);
      }
    }

    // 1982 Checkered-Flag Pixel Border Flash on Final-Lap Start/Finish Crossing or Podium!
    const onFinishZone = hud.playerS >= 972 || hud.playerS <= 24;
    const showCheckeredBorder =
      hud.state === GAME_STATES.PODIUM ||
      (hud.state === GAME_STATES.RACING && hud.currentLap >= hud.totalLaps && onFinishZone);
    if (showCheckeredBorder) {
      const parity = ((hud.nowSec * 10) | 0) & 1;
      const cell = 6;
      const cols = Math.ceil(W / cell);
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = ((c + parity) & 1) === 0 ? '#f8f8f8' : '#101010';
        ctx.fillRect(c * cell, 0, cell, 2);
      }
    }
  }
}
