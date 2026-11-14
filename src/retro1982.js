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
const MAX_SPRITE_POOL = 140;

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
    this._lineDistM = new Float32Array(240);
    this._lineScale = new Float32Array(240);
    this._lineCenterX = new Float32Array(240);
    this._lineRoadHalfPx = new Float32Array(240);

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

    // Continuous heading & explosion trackers
    this._unwrappedYaw = 0;
    this._hasPrevYaw = false;
    this._prevRawYaw = 0;
    this._lastElapsedSec = 0;
    this._playerBlastSec = 0;

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
    this._crtCanvas = null;

    const initW = (host && host.clientWidth) || (typeof window !== 'undefined' ? window.innerWidth : 426) || 426;
    const initH = (host && host.clientHeight) || (typeof window !== 'undefined' ? window.innerHeight : 240) || 240;
    this.resize(initW, initH);

    if (typeof window !== 'undefined') {
      this._onWindowResize = () => {
        const w = (host && host.clientWidth) || window.innerWidth || 426;
        const h = (host && host.clientHeight) || window.innerHeight || 240;
        this.resize(w, h);
      };
      window.addEventListener('resize', this._onWindowResize, { passive: true });
    }
  }

  setVisible(active) {
    this.active = !!active;
    if (this.canvas) {
      this.canvas.style.display = this.active ? 'block' : 'none';
    }
    if (this.active && typeof window !== 'undefined') {
      const host = this.canvas?.parentElement;
      const w = (host && host.clientWidth) || window.innerWidth || 426;
      const h = (host && host.clientHeight) || window.innerHeight || 240;
      this.resize(w, h);
    }
  }

  isVisible() {
    return this.active;
  }

  resize(width, height) {
    const safeW = Number.isFinite(width) && width > 0 ? width : 426;
    const safeH = Number.isFinite(height) && height > 0 ? height : 240;
    const aspect = clamp(safeW / safeH, 0.72, 2.35);
    const nextW = Math.round(240 * aspect);
    const nextH = 240;

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

    return { pine: pine.canvas, sakura: sakura.canvas, pitSign: pitSign.canvas };
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
    } = params;

    const nowSec = Number.isFinite(elapsedSec) ? elapsedSec : performance.now() * 0.001;
    const rawDt = clamp(nowSec - this._lastElapsedSec, 0, 0.1);
    this._lastElapsedSec = nowSec;

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

    // Compute Horizon Y with Spline Hill Pitch
    const pitchPx = clamp(Math.round(-roadSlope * 54), -11, 11);
    const horizonY = clamp(120 + pitchPx + blastShakeY, 102, 136);

    // 2. Determine Sky / Weather / Biome Palette (Fuji defaults to iconic 1982 Namco Cyan-Blue!)
    const trackTheme = track?.trackDef?.theme || 'FUJI';
    const forceNight = !!track?.trackDef?.forceNight || !!weather?.isNightActive || weather?.currentRegimeId === 'NEON_NIGHT';
    const regimeId = forceNight ? 'NEON_NIGHT' : (weather?.currentRegimeId || 'HOT_SUNNY');
    const isRainy = regimeId === 'LIGHT_DRIZZLE' || regimeId === 'MONSOON_STORM' || (weather?.grooveMoisture || 0) > 0.30;
    const isSunset = regimeId === 'GOLDEN_SUNSET';
    const isOvercast = regimeId === 'OVERCAST_COOL';

    // 3. Render 1:1 1982 Namco Sky, Clouds & Parallax Mount Fuji Panorama
    this._renderSkyAndHorizon(W, horizonY, {
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
    const roadSpanRows = Math.max(1, (H - 1) - horizonY);
    const baseRoadHalfPx = clamp(Math.round(W * 0.44), 76, 174);
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
    const yawVanishShiftPx = -pYaw * (W * 0.24);

    for (let y = H - 1; y >= horizonY; y--) {
      const v = (y - horizonY + 0.6) / (roadSpanRows + 0.6); // 1.0 at bottom -> ~0 at horizon
      const invZ = INV_Z_FAR + v * (INV_Z_NEAR - INV_Z_FAR);
      const distReal = Math.max(NEAR_DIST_M, (1.0 / invZ) - CAM_Z_OFFSET_M);
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

      // B. Pit Lane Shoulder Merge on Right (s >= 912 || s <= 110)
      if (lineS >= 912 || lineS <= 110) {
        const pitOffM = this._readPitOffsetAt(track, lineS);
        if (pitOffM > 0) {
          const pitCenterPx = centerX + pitOffM * pxPerMeter;
          const pitHalfPx = Math.max(2, 4.6 * pxPerMeter);
          const pitL = Math.min(roadR, Math.round(pitCenterPx - pitHalfPx));
          const pitR = Math.round(pitCenterPx + pitHalfPx);
          if (pitR > pitL) {
            ctx.fillStyle = grassBand ? '#586478' : '#4e586a';
            ctx.fillRect(pitL, y, pitR - pitL, 1);
            // Crisp white outer pit-lane edge line
            const linePx = Math.max(1, Math.round(0.28 * pxPerMeter));
            ctx.fillStyle = '#f8f8f8';
            ctx.fillRect(pitR - linePx, y, linePx, 1);
            // Yellow 80 km/h speed limit line at s = 942
            if (Math.abs(lineS - PIT_LANE_CONFIG.speedLimitLineS) < 0.45) {
              ctx.fillStyle = '#fcf400';
              ctx.fillRect(pitL, y, pitR - pitL, 1);
            }
            // Neon green Player #1 Pit Stop Box pad around s = 20
            if (Math.abs(lineS - PIT_LANE_CONFIG.playerBoxS) < 1.2) {
              const boxL = Math.round(pitCenterPx);
              ctx.fillStyle = '#00fc58';
              ctx.fillRect(boxL, y, Math.max(1, pitR - boxL - 1), 1);
            }
          }
          // Concrete Pit Wall separating Main Straight & Pit Lane (s in 952..1000 U 0..68)
          if (lineS >= 952 || lineS <= 68) {
            const wallX = Math.round(centerX + (ROAD_HALF_WIDTH + 1.65) * pxPerMeter);
            const wallW = Math.max(1, Math.round(0.65 * pxPerMeter));
            ctx.fillStyle = curbBand ? '#d8e0ec' : '#1858f8';
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

      // D. Two-Tone 1982 Namco Asphalt (#686868 / #5e5e5e)
      ctx.fillStyle = grassBand ? '#686868' : '#5e5e5e';
      ctx.fillRect(roadL, y, roadW, 1);

      // Subtle crisp white outer asphalt edge lines
      if (roadW >= 14) {
        const edgeW = Math.max(1, Math.round(0.24 * pxPerMeter));
        ctx.fillStyle = '#e8eef8';
        ctx.fillRect(roadL, y, edgeW, 1);
        ctx.fillRect(roadR - edgeW, y, edgeW, 1);
      }

      // E. Crisp White Dashed Lane Dividers (3-lane GP layout / Classic Namco center dashes)
      if (dashBand && roadW >= 10) {
        const dashW = Math.max(1, Math.round(0.26 * pxPerMeter));
        ctx.fillStyle = '#f8f8f8';
        // Classic center dashed line + twin outer lane dashes
        ctx.fillRect(Math.round(centerX - dashW * 0.5), y, dashW, 1);
        if (roadW >= 32) {
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

      // G. Shimmering Blue 1982 Pixel Puddles (#1868fc / #68b8ff) when active!
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
              if (px1 > px0) {
                const shimmer = ((y + ((nowSec * 14) | 0)) % 3) === 0;
                ctx.fillStyle = shimmer ? '#68b8ff' : '#1868fc';
                ctx.fillRect(px0, y, px1 - px0, 1);
                if (px1 - px0 >= 6 && ((y + pIdx) & 1) === 0) {
                  ctx.fillStyle = '#d0f0ff';
                  ctx.fillRect(px0 + 2, y, Math.max(1, ((px1 - px0) >> 2)), 1);
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
        // Outer pixel sakura / alpine pine tree
        const treeImg =
          trackTheme === 'FUJI' && slot % 4 === 1
            ? this._scenicSprites.sakura
            : this._scenicSprites.pine;
        pushSprite(dsReal, 0, treeImg, side * (ROAD_HALF_WIDTH + 14.5), 4.2, 0);
      }
    }

    // Player #1 Pit Box Beacon Sign at s = 20
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
        const tirePhase = (car.speedKmh || 0) > 1 ? (Math.floor((car.totalDistanceGameM || car.s || 0) * 3.8) & 1) : 0;

        // Perspective relative view angle (-1: left, 0: dead-ahead, +1: right)
        const relLat = (car.lateralOffset || 0) - pLat;
        const viewIdx = relLat < -2.2 ? 0 : (relLat > 2.2 ? 2 : 1);
        const rivalImg = this._rivalSprites[palIdx][viewIdx][tirePhase];

        if (car.exploded) {
          const prog = Number.isFinite(car.explodeTimer) ? clamp(1.0 - car.explodeTimer / 2.1, 0, 1) : 0.4;
          const expFrame = this._explosionFrames[Math.min(3, ((nowSec * 14) | 0) % 4)];
          pushSprite(dsReal, 2, expFrame, car.lateralOffset || 0, 6.4, 0, 0, false, prog, false);
        } else {
          const curbHop = car.onCurb ? (((nowSec * 36 + i) | 0) & 1) : 0;
          pushSprite(dsReal, 0, rivalImg, car.lateralOffset || 0, 4.35, curbHop, 0, false, 0, false);
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

    // 9. High-Speed (>280 km/h) & Slipstream Radial Pixel Wind Lines
    if (!pExploded && (pSpeed > 280 || (playerCar?.inSlipstream && pSpeed > 185))) {
      this._renderSpeedWindLines(W, H, horizonY, pSpeed, !!playerCar?.inSlipstream, nowSec);
    }

    // 10. Foreground Player #1 1982 F1 Car (or Fiery 4-Frame Explosion + 4 Bouncing Pixel Wheels!)
    this._renderPlayerForeground(W, H, playerCar, pSpeed, pSteer, pYaw, pDistGame, pExploded, isRainy, puddlesActive, nowSec);

    // 11. Diagonal Arcade Pixel Rain Streaks in Wet Regimes
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
    }

    // 12. Authentic 1:1 1982 Namco Top Arcade Bitmap HUD & Center Callout Banner
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

  _renderSkyAndHorizon(W, horizonY, { forceNight, isSunset, isRainy, isOvercast, lightningFlash, nowSec }) {
    const ctx = this.ctx;

    // Stepped 1982 Namco System-1 Sky Color Bands
    let bands;
    let panoKey = 'DAY';
    if (lightningFlash > 0.22) {
      bands = ['#b8dcff', '#d8ecff', '#f0f8ff', '#ffffff'];
      panoKey = 'STORM';
    } else if (forceNight) {
      bands = ['#040618', '#080c2c', '#121848', '#221c58'];
      panoKey = 'NIGHT';
    } else if (isSunset) {
      bands = ['#282468', '#7c3464', '#dc5438', '#fc7438', '#fcb04c'];
      panoKey = 'SUNSET';
    } else if (isRainy) {
      bands = ['#1c283c', '#2e425e', '#486284', '#6884a6'];
      panoKey = 'STORM';
    } else if (isOvercast) {
      bands = ['#284888', '#426ab4', '#648ed8', '#8ab4f4'];
      panoKey = 'DAY';
    } else {
      // Iconic 1982 Namco Fuji Cyan-Blue Arcade Sky (#1c5cf8 -> #549cff -> #7cb8ff)
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
    if (forceNight && lightningFlash <= 0.22) {
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

    // Pixel Setting Sun Disc in Sunset Regime
    if (isSunset) {
      const sunX = (((Math.round(W * 0.68 - this._unwrappedYaw * 85)) % (W + 80)) + (W + 80)) % (W + 80) - 40;
      const sunY = horizonY - 22;
      for (let dy = -11; dy <= 11; dy += 2) {
        const hw = Math.round(Math.sqrt(Math.max(0, 121 - dy * dy)));
        ctx.fillStyle = dy < -3 ? '#fcf468' : (dy < 4 ? '#fc9838' : '#fc4828');
        ctx.fillRect(sunX - hw, sunY + dy, hw * 2, 1);
      }
    }

    // Scrolling Fluffy White Pixel Clouds (Parallax 0.55x world heading + gentle wind drift)
    if (!forceNight) {
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

    // Scrolling Pixel-Art Mount Fuji Panorama (512px seamless loop anchored on horizonY)
    const pano = this._panoramas[panoKey] || this._panoramas.DAY;
    const panoW = pano.width;
    const panoH = pano.height;
    const panoY = horizonY - panoH;
    // Map full 2*PI heading rotation to 512px panorama loop
    const rawShift = Math.round((this._unwrappedYaw / (Math.PI * 2)) * panoW) % panoW;
    const scrollX = ((rawShift % panoW) + panoW) % panoW;

    let drawX = -scrollX;
    while (drawX < W) {
      ctx.drawImage(pano, drawX, panoY);
      drawX += panoW;
    }
  }

  _renderSpeedWindLines(W, H, horizonY, speedKmh, inSlipstream, nowSec) {
    const ctx = this.ctx;
    const intensity = clamp((speedKmh - 265) / 60, 0.25, 1.0);
    const count = Math.round(6 + intensity * 10);
    const tick = (nowSec * 45) | 0;

    ctx.fillStyle = inSlipstream ? '#68ecff' : '#f8f8f8';
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const phase = ((i * 19 + tick * 3) % 24) / 24;
      const y = Math.round(horizonY + 14 + phase * (H - horizonY - 22));
      const xEdge = side < 0 ? Math.round((1 - phase) * (W * 0.24)) : Math.round(W - (1 - phase) * (W * 0.24));
      const len = Math.max(3, Math.round(4 + phase * 12));
      ctx.fillRect(side < 0 ? xEdge : xEdge - len, y, len, 1);
    }
  }

  _renderPlayerForeground(W, H, playerCar, speedKmh, steerInput, relYaw, distGame, exploded, isRainy, puddlesActive, nowSec) {
    const ctx = this.ctx;
    const baseCarX = W >> 1;
    const baseCarY = H - 8;

    if (exploded) {
      // 4-Frame 1982 Fiery Pixel Fireball + 4 Bouncing Black Pixel Wheels!
      const t = this._playerBlastSec; // 0 .. 2.1s
      const frameIdx = Math.min(3, ((nowSec * 15) | 0) % 4);
      const fireImg = this._explosionFrames[frameIdx];
      const scale = W < 220 ? 1.0 : 1.25;
      const fw = Math.round(fireImg.width * scale);
      const fh = Math.round(fireImg.height * scale);

      // Scorched asphalt mark under blast
      ctx.fillStyle = 'rgba(12, 10, 12, 0.65)';
      ctx.fillRect(baseCarX - (fw >> 1) + 8, baseCarY - 8, fw - 16, 6);

      ctx.drawImage(fireImg, Math.round(baseCarX - fw * 0.5), Math.round(baseCarY - fh + 4), fw, fh);

      // 4 Flying Black Pixel Wheels Launching Outward & Bouncing on Asphalt!
      const wheelPhase = ((nowSec * 18) | 0) & 1;
      const wheelImg = this._wheelSprites[wheelPhase];
      const wheelTrajectories = [
        { vx: -118, vy: -124, bounce: 0.60 },
        { vx:  -54, vy: -162, bounce: 0.65 },
        { vx:   58, vy: -154, bounce: 0.63 },
        { vx:  124, vy: -118, bounce: 0.58 },
      ];
      const gravity = 290;
      const groundWheelY = baseCarY - 4;

      for (let i = 0; i < 4; i++) {
        const tr = wheelTrajectories[i];
        const wx = Math.round(baseCarX + tr.vx * t - wheelImg.width * 0.5);
        // Parabolic launch + second bounce after tImpact = -2 * vy / g
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
          // Small wheel shadow on road
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

    // Scale Player #1 sprite cleanly for narrow portrait vs wide arcade/desktop
    const carScale = W < 215 ? 1.0 : 1.18;
    const dstW = Math.round(carImg.width * carScale);
    const dstH = Math.round(carImg.height * carScale);

    // Authentic 1982 Kerb / Grass Bounce & High-RPM Micro-Chatter
    let bounceY = 0;
    if (playerCar?.onCurb && speedKmh > 20) {
      bounceY = (((nowSec * 42) | 0) & 1) ? -2 : 0;
    } else if (playerCar?.onGrass && speedKmh > 15) {
      bounceY = (((nowSec * 28) | 0) % 3 === 0) ? -2 : -1;
    } else if (speedKmh > 250 && (((nowSec * 30) | 0) % 5 === 0)) {
      bounceY = -1;
    }

    const dx = Math.round(baseCarX - dstW * 0.5);
    const dy = Math.round(baseCarY - dstH + bounceY);

    // Crisp Pixel Contact Shadow Oval Under Wide Slicks
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    ctx.fillRect(dx + 4, baseCarY - 3, dstW - 8, 3);
    ctx.fillRect(dx + 8, baseCarY - 5, dstW - 16, 2);

    // Draw Player #1 1982 Red/White/Blue F1 Car Sprite
    ctx.drawImage(carImg, dx, dy, dstW, dstH);

    // Twin Pixel Exhaust Shift-Cut / Downshift Backfire Flames!
    if ((playerCar?.shiftCooldown > 0.04 || playerCar?.revBlipTimer > 0.02) && speedKmh > 75) {
      const fx = baseCarX + (steerFrameIdx - 2);
      const fy = dy + Math.round(dstH * 0.78);
      ctx.fillStyle = '#fc8400';
      ctx.fillRect(fx - 6, fy, 4, 4);
      ctx.fillRect(fx + 2, fy, 4, 4);
      ctx.fillStyle = '#54ecff';
      ctx.fillRect(fx - 5, fy + 1, 2, 2);
      ctx.fillRect(fx + 3, fy + 1, 2, 2);
    }

    // Pixel Tire Smoke, Wet Rooster-Tail Spray, Grass Dirt & Titanium Kerb Sparks!
    const skid = playerCar?.skidIntensity || 0;
    const aquaplane = (playerCar?.aquaplaneTimer || 0) > 0;
    const leftTireX = dx + Math.round(dstW * 0.14);
    const rightTireX = dx + Math.round(dstW * 0.80);
    const tireBaseY = baseCarY - 3;
    const tick = (nowSec * 32) | 0;

    if (aquaplane || ((isRainy || puddlesActive) && speedKmh > 95 && (aquaplane || isRainy))) {
      // Blue/Cyan Pixel Water Spray Plumes behind Rear Slicks
      for (let p = 0; p < 6; p++) {
        const ox = (((p * 11 + tick * 3) % 9) - 4);
        const oy = -((p * 5 + tick * 2) % 12);
        ctx.fillStyle = (p & 1) === 0 ? '#68c8ff' : '#d8f4ff';
        ctx.fillRect(leftTireX + ox, tireBaseY + oy, 3, 2);
        ctx.fillRect(rightTireX + ox, tireBaseY + oy, 3, 2);
      }
    } else if (skid > 0.16 && speedKmh > 35) {
      // White/Gray Arcade Tire-Limit Smoke Puffs
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
      // Flying Green/Brown Turf Pixels
      for (let p = 0; p < 5; p++) {
        const ox = (((p * 9 + tick * 7) % 11) - 5);
        const oy = -2 - ((p * 5 + tick * 4) % 11);
        ctx.fillStyle = (p & 1) === 0 ? '#00d828' : '#9c6c34';
        ctx.fillRect(leftTireX + ox, tireBaseY + oy, 2, 2);
        ctx.fillRect(rightTireX + ox, tireBaseY + oy, 2, 2);
      }
    }

    if ((playerCar?.onCurb && speedKmh > 90) || speedKmh > 282) {
      // Bright Yellow/Orange Underbody Titanium Skid-Block Pixel Sparks!
      for (let p = 0; p < 5; p++) {
        const sx = baseCarX + (((p * 17 + tick * 9) % 28) - 14);
        const sy = tireBaseY - ((p * 7 + tick * 5) % 9);
        ctx.fillStyle = (p & 1) === 0 ? '#fcf400' : '#fc6800';
        ctx.fillRect(sx, sy, 2, 1);
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

    // Subtle top translucent scanline header shade so bitmap glyphs pop on every circuit
    ctx.fillStyle = 'rgba(0, 4, 20, 0.36)';
    ctx.fillRect(0, 0, W, W < 275 ? 25 : 27);

    if (W >= 275) {
      // Full Classic 1982 Namco 5-Column Arcade Header (4:3, 16:9 Desktop, Mobile Landscape)
      // Col 1: TOP (Red #ff2020) & SCORE (Yellow #fcf400)
      this._drawAtlasText('TOP', 4, 3, 'RED', 1, 'left');
      this._drawAtlasText(topStr, 26, 3, 'WHITE', 1, 'left');
      this._drawAtlasText('SCORE', 4, 14, 'YELLOW', 1, 'left');
      this._drawAtlasText(scoreStr, 38, 14, 'YELLOW', 1, 'left');

      // Col 2: LAP Timer (Neon Green #00fc58)
      const col2X = Math.round(W * 0.30);
      this._drawAtlasText(`LAP ${hud.currentLap}/${hud.totalLaps}`, col2X, 3, 'GREEN', 1, 'left');
      this._drawAtlasText(lapTimeStr, col2X, 14, 'GREEN', 1, 'left');

      // Col 3: Big Center TIME Countdown in Yellow (#fcf400, flashing Red <= 10s)
      const midX = W >> 1;
      this._drawAtlasText('TIME', midX, 2, 'RED', 1, 'center');
      this._drawAtlasText(timeStr, midX, 10, timeLowFlash ? 'RED' : 'YELLOW', 2, 'center', 11);

      // Col 4: POS (P1..P8)
      if (W >= 340) {
        const col4X = Math.round(W * 0.66);
        this._drawAtlasText('POS', col4X, 3, 'CYAN', 1, 'left');
        this._drawAtlasText(posStr, col4X, 14, hud.playerPos === 1 ? 'YELLOW' : 'WHITE', 1, 'left');
      }

      // Col 5: SPEED km/h & LOW/HIGH or G1-G8 Gear Badge (Right-aligned)
      this._drawAtlasText(`${spdStr}KM/H`, W - 4, 3, 'WHITE', 1, 'right');
      this._drawAtlasText(gearTxt, W - 4, 14, gearColor, 1, 'right');
      if (W < 340) {
        this._drawAtlasText(`P${hud.playerPos}`, W - 36, 14, 'CYAN', 1, 'right');
      }
    } else {
      // Compact Zero-Overlap 2-Row Arcade Header for Narrow Mobile Portrait (173..274px)
      this._drawAtlasText(`TOP ${topStr}`, 2, 2, 'RED', 1, 'left', 5);
      this._drawAtlasText(timeStr, W >> 1, 2, timeLowFlash ? 'RED' : 'YELLOW', 1, 'center', 6);
      this._drawAtlasText(`${Math.round(hud.speedKmh)}K ${gearTxt}`, W - 2, 2, gearColor, 1, 'right', 5);

      this._drawAtlasText(`SCR ${scoreStr}`, 2, 13, 'YELLOW', 1, 'left', 5);
      this._drawAtlasText(lapTimeStr, W >> 1, 13, 'GREEN', 1, 'center', 5);
      this._drawAtlasText(`P${hud.playerPos}/${hud.totalCars}`, W - 2, 13, 'CYAN', 1, 'right', 5);
    }

    // Classic 1982 Arcade Center Banner ("PREPARE TO QUALIFY", "EXTENDED PLAY!", etc.)
    let bannerText = '';
    if (typeof hud.centerCallout === 'string') {
      bannerText = hud.centerCallout.trim();
    } else if (hud.centerCallout && typeof hud.centerCallout === 'object') {
      bannerText = String(hud.centerCallout.text || hud.centerCallout.message || '').trim();
    }
    // Strip non-ASCII emojis from callout strings so bitmap font prints pure crisp letters
    if (bannerText) {
      bannerText = bannerText.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim();
    }

    if (bannerText) {
      const charStep = W < 240 ? 5 : 6;
      const maxChars = Math.max(12, Math.floor((W - 18) / charStep));
      const clipped = bannerText.length > maxChars ? bannerText.slice(0, maxChars) : bannerText;
      const boxW = clipped.length * charStep + 12;
      const boxX = (W - boxW) >> 1;
      const boxY = 33;

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
        this._drawAtlasText(cleanSession, W >> 1, 30, 'CYAN', 1, 'center', W < 240 ? 5 : 6);
      }
    }
  }
}
