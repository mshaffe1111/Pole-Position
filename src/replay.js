// ============================================================================
// RACE PHANATIC F1 — 2026 PRO SIMULATION & WORLD-FEED BROADCAST REPLAY
// 60Hz Full-Fidelity Sim Frame Recorder, C1 Cubic Spline Interpolator,
// 8-Mode FOM World-Feed Camera Director & Interactive TV Broadcast Graphics
// ============================================================================

import * as THREE from 'three';
import {
  TRACK_GAME_LENGTH,
  ROAD_HALF_WIDTH,
  REAL_METERS_PER_GAME_METER,
  TIRE_COMPOUNDS,
  AI_DRIVER_ROSTER,
} from './config.js';

export const REPLAY_CAMERA_MODES = [
  { idx: 0, id: 'AUTO_DIRECTOR',    label: 'TV AUTO-DIRECTOR',              shortLabel: 'AUTO TV' },
  { idx: 1, id: 'TV_TELEPHOTO',     label: 'TRACKSIDE TELEPHOTO',           shortLabel: 'TELEPHOTO' },
  { idx: 2, id: 'APEX_KERB_CAM',    label: 'STATIC APEX KERB CAM',          shortLabel: 'KERB CAM' },
  { idx: 3, id: 'HELI_CINEFLEX',    label: 'HELICOPTER CINEFLEX',           shortLabel: 'HELI CAM' },
  { idx: 4, id: 'ONBOARD_TCAM',     label: 'FOM HALO T-CAM',                shortLabel: 'T-CAM' },
  { idx: 5, id: 'REAR_GEARBOX_CAM', label: 'REAR GEARBOX / DIFFUSER CAM',   shortLabel: 'REAR CAM' },
  { idx: 6, id: 'SUSPENSION_CAM',   label: 'FRONT WISHBONE SUSPENSION CAM', shortLabel: 'WISHBONE' },
  { idx: 7, id: 'PIT_WALL_PAN',     label: 'PIT-WALL PANORAMIC FLYBY',      shortLabel: 'PIT WALL' },
];

export const REPLAY_SPEED_OPTIONS = [0.25, 0.5, 1.0, 2.0];

const NUM_TELEPHOTO_TOWERS = 14;
const RAD2DEG = 180.0 / Math.PI;
const UP_AXIS = new THREE.Vector3(0, 1, 0);

const COMPOUND_BADGE_MAP = {
  SOFT:         { code: 'S', color: '#ff2a2a', text: '#ffffff' },
  MEDIUM:       { code: 'M', color: '#ffd426', text: '#101218' },
  HARD:         { code: 'H', color: '#f2f5fa', text: '#101218' },
  INTERMEDIATE: { code: 'I', color: '#28d854', text: '#08180d' },
  FULL_WET:     { code: 'W', color: '#2490ff', text: '#ffffff' },
};

const CONSTRUCTOR_TEAM_FALLBACKS = [
  'KAZE WORKS F1',
  'APEX MOTORSPORT',
  'BLEU GRAND PRIX',
  'AURUM RACING',
  'VELOCITY GP',
  'ROSSO CORSA F1',
  'SCUDERIA VELOCE',
  'ALBION RACING',
  'SILVER ARROW GP',
  'NORDIC RACING',
];

function finiteOr(val, fallback = 0) {
  return Number.isFinite(val) ? val : fallback;
}

function clamp(val, min, max) {
  if (!Number.isFinite(val)) return min;
  return val < min ? min : (val > max ? max : val);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function wrapTrackS(s) {
  if (!Number.isFinite(s)) return 0;
  let r = s % TRACK_GAME_LENGTH;
  if (r < 0) r += TRACK_GAME_LENGTH;
  if (r >= TRACK_GAME_LENGTH) r = 0;
  return r;
}

// Shortest signed spline distance (sTarget - sOrigin) in [-TRACK_GAME_LENGTH/2, +TRACK_GAME_LENGTH/2)
function signedWrapDeltaS(delta) {
  if (!Number.isFinite(delta)) return 0;
  let d = delta % TRACK_GAME_LENGTH;
  const half = TRACK_GAME_LENGTH * 0.5;
  if (d >= half) d -= TRACK_GAME_LENGTH;
  else if (d < -half) d += TRACK_GAME_LENGTH;
  return d;
}

function shortestAngleDelta(fromRad, toRad) {
  let d = (toRad - fromRad) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// 4-point cubic Catmull-Rom interpolation (exact at t=0 -> p1 and t=1 -> p2)
function catmullRom1D(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2.0 * p1) +
    (-p0 + p2) * t +
    (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
    (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
  );
}

function computeFallbackSteerAngleRad(steerInput, speedKmh) {
  const sIn = clamp(finiteOr(steerInput, 0), -1, 1);
  if (Math.abs(sIn) < 0.002) return 0;
  const speedMps = Math.max(0, finiteOr(speedKmh, 0)) / 3.6;
  const nonLin = Math.sign(sIn) * Math.pow(Math.abs(sIn), 1.35) * (1.0 / (1.0 + 0.000162 * speedMps * speedMps));
  return nonLin * 0.46;
}

function getMetersPerGameUnit(track) {
  if (track && Number.isFinite(track.metersPerGameUnit) && track.metersPerGameUnit > 0.5) {
    return track.metersPerGameUnit;
  }
  if (track && Number.isFinite(track.realLengthM) && track.realLengthM > 500) {
    const total = Number.isFinite(track.totalLength) && track.totalLength > 10 ? track.totalLength : TRACK_GAME_LENGTH;
    return track.realLengthM / total;
  }
  return REAL_METERS_PER_GAME_METER || 4.25;
}

function deriveDriverCode(car, idx) {
  if (car?.short && String(car.short).trim().length > 0) {
    return String(car.short).trim().toUpperCase().slice(0, 3);
  }
  if (car?.isPlayer) return 'YOU';
  const nm = String(car?.name || '').replace(/#\d+/g, '').trim();
  if (nm.length >= 3) {
    const parts = nm.split(/\s+/);
    const surname = parts[parts.length - 1].replace(/[^A-Za-z]/g, '');
    if (surname.length >= 3) return surname.slice(0, 3).toUpperCase();
  }
  return `P${String(idx + 1).padStart(2, '0')}`.slice(0, 3);
}

function deriveTeamHex(car, idx) {
  if (typeof car?.liveryHex === 'string' && car.liveryHex.startsWith('#')) {
    return car.liveryHex;
  }
  if (typeof car?.primaryHex === 'string' && car.primaryHex.startsWith('#')) {
    return car.primaryHex;
  }
  if (car?.isPlayer) return '#e10600';
  const rosterEntry = Array.isArray(AI_DRIVER_ROSTER) && AI_DRIVER_ROSTER.length > 0
    ? AI_DRIVER_ROSTER[Math.max(0, idx - 1) % AI_DRIVER_ROSTER.length]
    : null;
  if (rosterEntry && typeof rosterEntry.primary === 'number') {
    return `#${rosterEntry.primary.toString(16).padStart(6, '0')}`;
  }
  return '#24b6ff';
}

function deriveTeamName(car, idx) {
  if (car?.teamName && String(car.teamName).trim()) {
    return String(car.teamName).trim().toUpperCase();
  }
  if (car?.isPlayer) return 'SCUDERIA PHANATIC';
  return CONSTRUCTOR_TEAM_FALLBACKS[Math.max(0, idx - 1) % CONSTRUCTOR_TEAM_FALLBACKS.length];
}

function formatCircuitBroadcastTitle(track) {
  const id = track?.currentTrackId || track?.trackDef?.id || '';
  if (id === 'FUJI_1982') return 'FUJI GP';
  if (id === 'MONACO_HARBOR') return 'MONACO GP';
  if (id === 'VEGAS_NEON') return 'LAS VEGAS GP';
  if (id === 'MONZA_TEMPLE') return 'ITALIAN GP • MONZA';
  if (id === 'SUZUKA_130R') return 'JAPANESE GP • SUZUKA';
  if (id === 'SILVERSTONE_GP') return 'BRITISH GP • SILVERSTONE';
  const raw = String(track?.trackDef?.name || 'GRAND PRIX').toUpperCase();
  return raw.length > 22 ? raw.slice(0, 22) : raw;
}

// ============================================================================
// SELF-CONTAINED FOM WORLD-FEED BROADCAST GRAPHICS CSS
// ============================================================================
const FOM_BROADCAST_CSS = `
#replay-overlay {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background:
    linear-gradient(180deg, rgba(6, 8, 13, 0.46) 0%, rgba(6, 8, 13, 0.0) 16%),
    linear-gradient(0deg, rgba(6, 8, 13, 0.62) 0%, rgba(6, 8, 13, 0.0) 24%);
}

#replay-overlay .replay-top-row {
  display: flex;
  align-items: center;
  gap: 6px;
  transition: opacity 0.22s ease, transform 0.22s ease;
}

#replay-overlay .replay-live-badge {
  background: #e10600;
  border-radius: 3px;
  padding: 4px 10px;
  font-size: 0.68rem;
  font-weight: 900;
  font-style: italic;
  letter-spacing: 0.10em;
  box-shadow: 0 4px 14px rgba(225, 6, 0, 0.42);
}

#replay-overlay #fom-circuit-lap-pill {
  padding: 4px 10px;
  border-radius: 3px;
  background: rgba(11, 14, 21, 0.90);
  border-left: 3px solid #e10600;
  border-top: 1px solid rgba(255, 255, 255, 0.14);
  border-right: 1px solid rgba(255, 255, 255, 0.14);
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
  color: #f4f7fb;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  backdrop-filter: blur(8px);
}

#replay-overlay .replay-cam-pill {
  border-radius: 3px;
  background: rgba(14, 18, 26, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #d7e2f0;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.07em;
}

/* Keep legacy #replay-car-telemetry live in DOM for backward-compat while rich FOM pod displays full telemetry */
#replay-overlay.fom-enhanced #replay-car-telemetry {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}

#fom-tv-hud-root {
  position: relative;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 0;
  margin: 8px 0;
  pointer-events: none;
  transition: opacity 0.22s ease, transform 0.22s ease;
}

/* --- FOM World-Feed Left Timing Tower (P1..P8) --- */
#fom-timing-tower {
  pointer-events: auto;
  width: 204px;
  background: rgba(10, 13, 20, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-top: 3px solid #e10600;
  border-radius: 4px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(10px);
  overflow: hidden;
  user-select: none;
}

.fom-tower-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px;
  background: linear-gradient(90deg, rgba(225, 6, 0, 0.22) 0%, rgba(18, 22, 32, 0.94) 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.10);
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.10em;
  color: #ffffff;
}

.fom-tower-header .fom-tag {
  font-style: italic;
  color: #ff3b30;
  font-weight: 900;
}

.fom-tower-header .fom-lap {
  color: #cdd8e8;
  font-variant-numeric: tabular-nums;
}

.fom-tower-rows {
  display: flex;
  flex-direction: column;
}

.fom-tower-row {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  display: grid;
  grid-template-columns: 22px 4px 44px 1fr 20px;
  align-items: center;
  gap: 6px;
  padding: 4px 7px;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: transparent;
  color: #eef3fa;
  font-family: inherit;
  font-size: 0.70rem;
  font-weight: 800;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;
}

.fom-tower-row:last-child {
  border-bottom: none;
}

.fom-tower-row:hover {
  background: rgba(255, 255, 255, 0.10);
}

.fom-tower-row.focused {
  background: linear-gradient(90deg, rgba(225, 6, 0, 0.34) 0%, rgba(255, 255, 255, 0.14) 100%);
  box-shadow: inset 2px 0 0 #ffffff;
}

.fom-tower-row.separated {
  border-top: 1px dashed rgba(255, 255, 255, 0.25);
}

.fom-row-pos {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.09);
  color: #ffffff;
  font-size: 0.66rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.fom-tower-row.focused .fom-row-pos {
  background: #ffffff;
  color: #0b0e14;
}

.fom-row-team-bar {
  width: 4px;
  height: 16px;
  border-radius: 1px;
  background: #e10600;
}

.fom-row-code {
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  color: #ffffff;
}

.fom-tower-row.is-player .fom-row-code {
  color: #ffd84d;
}

.fom-row-gap {
  justify-self: end;
  font-size: 0.65rem;
  font-weight: 700;
  color: #c5d1e2;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
}

.fom-row-gap.in-pit {
  color: #ffb300;
  font-weight: 900;
}

.fom-row-gap.retired {
  color: #ff5252;
  font-weight: 900;
}

.fom-row-tire {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  font-size: 0.60rem;
  font-weight: 900;
  border: 1.5px solid #ff2a2a;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.45);
}

/* --- FOM Bottom Driver Telemetry Bug --- */
#fom-telemetry-wrap {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  width: 100%;
  margin-top: auto;
  pointer-events: none;
}

#fom-telemetry-bug {
  pointer-events: auto;
  display: grid;
  grid-template-columns: minmax(168px, 1.1fr) auto minmax(186px, 1.15fr);
  align-items: center;
  gap: 14px;
  padding: 8px 16px;
  border-radius: 6px;
  background: linear-gradient(180deg, rgba(13, 17, 26, 0.92) 0%, rgba(7, 10, 16, 0.95) 100%);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-left: 4px solid #e10600;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(12px);
  max-width: min(720px, 96vw);
}

.fom-tel-driver {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.fom-tel-top-line {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.fom-tel-pos-badge {
  padding: 1px 6px;
  border-radius: 2px;
  background: #ffffff;
  color: #0a0d14;
  font-size: 0.66rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.fom-tel-num {
  font-size: 0.98rem;
  font-weight: 900;
  font-style: italic;
  color: #e10600;
  font-variant-numeric: tabular-nums;
}

.fom-tel-name {
  font-size: 0.84rem;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fom-tel-team {
  font-size: 0.60rem;
  font-weight: 800;
  letter-spacing: 0.09em;
  color: #9fb0c7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fom-tel-cam-feed {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #e2e9f3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fom-tel-cam-feed::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #e10600;
  flex: 0 0 auto;
}

/* Center FOM Halo Dial (SVG RPM Arc + Speed + Gear) */
.fom-tel-dial {
  position: relative;
  width: 126px;
  height: 68px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
}

.fom-tel-dial svg {
  position: absolute;
  inset: 0;
  width: 126px;
  height: 68px;
  overflow: visible;
}

.fom-dial-readout {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 1px;
}

.fom-dial-speed-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1;
}

.fom-dial-speed {
  font-size: 1.24rem;
  font-weight: 900;
  font-style: italic;
  color: #ffffff;
  font-variant-numeric: tabular-nums;
}

.fom-dial-unit {
  font-size: 0.50rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #9fb0c7;
}

.fom-dial-gear-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-left: 7px;
  border-left: 1px solid rgba(255, 255, 255, 0.16);
  line-height: 1;
}

.fom-dial-gear-lbl {
  font-size: 0.46rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #9fb0c7;
}

.fom-dial-gear {
  font-size: 1.28rem;
  font-weight: 900;
  color: #ffd84d;
  font-variant-numeric: tabular-nums;
}

/* Right Telemetry Pedals + DRS + Tire Temps */
.fom-tel-gauges {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.fom-pedal-row {
  display: grid;
  grid-template-columns: 28px 1fr 30px;
  align-items: center;
  gap: 6px;
}

.fom-pedal-lbl {
  font-size: 0.56rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: #b4c3d8;
}

.fom-pedal-track {
  height: 7px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.10);
  overflow: hidden;
}

.fom-pedal-fill {
  height: 100%;
  width: 100%;
  transform-origin: left center;
  transform: scaleX(0);
  transition: transform 0.04s linear;
}

.fom-pedal-fill.thr {
  background: linear-gradient(90deg, #00c853 0%, #00e676 100%);
}

.fom-pedal-fill.brk {
  background: linear-gradient(90deg, #d50000 0%, #ff1744 100%);
}

.fom-pedal-pct {
  font-size: 0.58rem;
  font-weight: 800;
  color: #dce6f5;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.fom-tel-badges {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 1px;
}

.fom-drs-pill {
  padding: 2px 8px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #78879c;
  font-size: 0.58rem;
  font-weight: 900;
  letter-spacing: 0.10em;
}

.fom-drs-pill.active {
  background: #00e676;
  border-color: #69f0ae;
  color: #04160b;
  box-shadow: 0 0 10px rgba(0, 230, 118, 0.45);
}

.fom-tire-temp-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.58rem;
  font-weight: 800;
  color: #d0dced;
  font-variant-numeric: tabular-nums;
}

.fom-tire-temp-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff2a2a;
}

/* Clean Feed Toggle Button & Clean-Feed Active State */
#btn-replay-cleanfeed.clean-on {
  border-color: rgba(255, 216, 77, 0.75);
  background: rgba(255, 216, 77, 0.16);
  color: #ffd84d;
}

#replay-overlay.fom-clean-feed .replay-top-row,
#replay-overlay.fom-clean-feed #fom-tv-hud-root {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-4px);
}

#replay-overlay.fom-clean-feed {
  background: none;
}

#replay-overlay.fom-clean-feed #replay-transport-bar {
  opacity: 0.34;
  transition: opacity 0.2s ease;
}

#replay-overlay.fom-clean-feed #replay-transport-bar:hover,
#replay-overlay.fom-clean-feed #replay-transport-bar:focus-within {
  opacity: 0.96;
}

/* Responsive Compact Layouts for Mobile Portrait & Mobile Landscape */
@media (max-width: 720px) {
  #fom-timing-tower {
    width: 162px;
  }
  .fom-tower-row {
    grid-template-columns: 18px 3px 36px 1fr 16px;
    gap: 4px;
    padding: 3px 5px;
    font-size: 0.62rem;
  }
  #fom-telemetry-bug {
    grid-template-columns: 1fr auto;
    gap: 8px;
    padding: 6px 10px;
  }
  .fom-tel-driver {
    grid-column: 1 / -1;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .fom-tel-team {
    display: none;
  }
  #replay-transport-bar {
    flex-wrap: wrap;
    gap: 4px;
  }
}

@media (max-height: 480px) {
  #fom-tv-hud-root {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
    margin: 4px 0;
  }
  #fom-timing-tower {
    align-self: flex-start;
    width: 166px;
  }
  .fom-tower-header {
    padding: 3px 6px;
    font-size: 0.56rem;
  }
  .fom-tower-row {
    grid-template-columns: 18px 3px 36px 1fr 15px;
    gap: 4px;
    padding: 2px 5px;
    font-size: 0.60rem;
  }
  .fom-row-pos {
    height: 15px;
    font-size: 0.58rem;
  }
  .fom-row-tire {
    width: 14px;
    height: 14px;
    font-size: 0.52rem;
  }
  #fom-telemetry-wrap {
    width: auto;
    margin-left: auto;
  }
  #fom-telemetry-bug {
    gap: 10px;
    padding: 5px 11px;
    grid-template-columns: minmax(130px, 0.95fr) auto minmax(145px, 1fr);
  }
  .fom-tel-dial {
    width: 108px;
    height: 56px;
  }
  .fom-tel-dial svg {
    width: 108px;
    height: 56px;
  }
  .fom-dial-speed {
    font-size: 1.05rem;
  }
  .fom-dial-gear {
    font-size: 1.08rem;
  }
}
`;

export class ReplayDirector {
  static CAMERA_MODES = REPLAY_CAMERA_MODES;
  static SPEED_OPTIONS = REPLAY_SPEED_OPTIONS;

  constructor(options = {}) {
    this.maxFrames = Math.max(60, Math.floor(options.maxFrames || 7200)); // 120s @ 60Hz
    this.sampleInterval = 1 / 60;
    this.cameraModes = REPLAY_CAMERA_MODES;

    // Circular-capped chronological snapshot array (recycles oldest frame objects past maxFrames)
    this.frames = [];

    // Transport & Broadcast Director State
    this.isPlaying = false;
    this.paused = false;
    this.playbackSpeed = 1.0;
    this.cameraModeIdx = 0; // 0 = TV AUTO-DIRECTOR by default
    this.focusCarIndex = 0;
    this.cleanFeed = false;

    // Internal recorder & playback clocks
    this._recordAccumulator = 0;
    this._recordClockSec = 0;
    this.playheadSec = 0;
    this._prevPlayheadSec = 0;

    // Curated Circuit Broadcast Camera Stations (rebuilt automatically per circuit)
    this._cachedTrackKey = null;
    this._telephotoCams = [];
    this._apexKerbCams = [];
    this._pitWallCams = [];
    this._activeTelephotoIdx = -1;
    this._activeKerbCamIdx = -1;
    this._activePitWallIdx = -1;
    this._flybyFiredKey = '';
    this._flybyBuffetTimer = 0;
    this._flybyBuffetStrength = 0;

    // Critically-damped 2nd-order human camera-operator pan/tilt state
    this._opAimDir = new THREE.Vector3(1, 0, 0);
    this._opAimVel = new THREE.Vector3(0, 0, 0);
    this._opInitialized = false;

    // Camera FOV / near-plane restoration & TV Auto-Director state
    this._savedCameraFov = null;
    this._savedCameraNear = null;
    this._currentFov = 58;
    this._cameraJustCut = true;
    this._heliPhase = 0.0;

    this.autoDirector = options.autoDirector !== undefined ? !!options.autoDirector : true;
    this._directorActiveMode = 1; // Concrete active camera mode in [1..7] when cameraModeIdx === 0
    this._directorCutHoldTimer = 0;
    this._directorShotElapsed = 0;
    this._lastActionEval = {
      score: 0,
      recommendedMode: 1,
      holdDurationSec: 3.4,
      reason: 'TELEPHOTO_TRACKING',
      nearestRivalDistM: Infinity,
      rivalBehind: false,
    };

    // Per-car VFX continuity & zero-GC scratch pools
    this._recBrakeGlow = new Map();
    this._preReplayRigState = new Map();
    this._appliedReplayCompounds = new Map();
    this._lastCarRigs = null;
    this._interpCarPool = [];
    this._interpFramesScratch = [];
    this._standingsIdxScratch = [];
    this._liveStandingsScratch = [];

    // Zero-GC scratch Three.js math objects
    this._carFwd = new THREE.Vector3();
    this._carRight = new THREE.Vector3();
    this._carUp = new THREE.Vector3();
    this._sprungPos = new THREE.Vector3();
    this._sprungQuat = new THREE.Quaternion();
    this._sprungBasisMat = new THREE.Matrix4();
    this._sprungTiltEuler = new THREE.Euler(0, 0, 0, 'XYZ');
    this._sprungTiltQuat = new THREE.Quaternion();
    this._negFwd = new THREE.Vector3();
    this._camDesiredPos = new THREE.Vector3();
    this._camDesiredLook = new THREE.Vector3();
    this._camSmoothedPos = new THREE.Vector3();
    this._camSmoothedLook = new THREE.Vector3();
    this._packBattleOffset = new THREE.Vector3();
    this._tmpVecA = new THREE.Vector3();
    this._tmpVecB = new THREE.Vector3();

    // Self-contained FOM Broadcast DOM state
    this._domRefs = null;
    this._keyHandlerBound = null;

    this.reset();
  }

  // --------------------------------------------------------------------------
  // 1. 60HZ FULL-FIDELITY SIM FRAME RECORDER (120 SECONDS = 7,200 SNAPSHOTS)
  // --------------------------------------------------------------------------
  reset() {
    this.frames.length = 0;
    this.isPlaying = false;
    this.paused = false;
    this.playbackSpeed = 1.0;
    this.cameraModeIdx = 0;
    this.focusCarIndex = 0;

    this._recordAccumulator = 0;
    this._recordClockSec = 0;
    this.playheadSec = 0;
    this._prevPlayheadSec = 0;

    this._activeTelephotoIdx = -1;
    this._activeKerbCamIdx = -1;
    this._activePitWallIdx = -1;
    this._flybyFiredKey = '';
    this._flybyBuffetTimer = 0;
    this._flybyBuffetStrength = 0;
    this._opInitialized = false;
    this._cameraJustCut = true;
    this._heliPhase = 0.0;

    this.autoDirector = true;
    this._directorActiveMode = 1;
    this._directorCutHoldTimer = 0;
    this._directorShotElapsed = 0;
    this._lastActionEval = {
      score: 0,
      recommendedMode: 1,
      holdDurationSec: 3.4,
      reason: 'TELEPHOTO_TRACKING',
      nearestRivalDistM: Infinity,
      rivalBehind: false,
    };

    this._recBrakeGlow.clear();
    this._preReplayRigState.clear();
    this._appliedReplayCompounds.clear();
  }

  hasFrames() {
    return this.frames.length >= 15;
  }

  getDurationSec() {
    if (this.frames.length < 2) return 0;
    return Math.max(0, this.frames[this.frames.length - 1].timeSec - this.frames[0].timeSec);
  }

  getCameraLabel(idx = this.cameraModeIdx) {
    const count = REPLAY_CAMERA_MODES.length;
    const safeIdx = ((Math.floor(finiteOr(idx, 0)) % count) + count) % count;
    return REPLAY_CAMERA_MODES[safeIdx].label;
  }

  get cameraLabel() {
    if (this.cameraModeIdx === 0 && this.autoDirector) {
      const subIdx = clamp(Math.floor(finiteOr(this._directorActiveMode, 1)), 1, REPLAY_CAMERA_MODES.length - 1);
      return `TV AUTO • ${REPLAY_CAMERA_MODES[subIdx].label}`;
    }
    return this.getCameraLabel(this.cameraModeIdx);
  }

  // Alias for external callers expecting recordTick
  recordTick(dt, payload) {
    return this.recordSnapshot(dt, payload);
  }

  recordSnapshot(dt, {
    allCars,
    sessionElapsedSec = 0,
    currentLap = 1,
    totalLaps = 5,
    score = 0,
    weatherMoisture = 0,
  } = {}) {
    if (this.isPlaying) return false;
    if (!Array.isArray(allCars) || allCars.length === 0) return false;

    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;

    let sampleStepDt = safeDt;
    if (this.frames.length > 0) {
      this._recordAccumulator += safeDt;
      if (this._recordAccumulator < this.sampleInterval) {
        return false;
      }
      sampleStepDt = this._recordAccumulator;
      this._recordAccumulator = Math.min(
        this.sampleInterval * 0.99,
        this._recordAccumulator % this.sampleInterval
      );
      this._recordClockSec += Math.max(1e-4, sampleStepDt);
    } else {
      this._recordClockSec = 0;
      this._recordAccumulator = 0;
    }

    // Recycle oldest snapshot object once circular capacity (7,200 frames) is reached (zero GC!)
    let snapshot;
    if (this.frames.length >= this.maxFrames) {
      snapshot = this.frames.shift();
    } else {
      snapshot = {
        timeSec: 0,
        sessionElapsedSec: 0,
        currentLap: 1,
        totalLaps: 5,
        score: 0,
        weatherMoisture: 0,
        cars: [],
      };
    }

    snapshot.timeSec = this._recordClockSec;
    snapshot.sessionElapsedSec = finiteOr(sessionElapsedSec, this._recordClockSec);
    snapshot.currentLap = Math.max(1, Math.floor(finiteOr(currentLap, allCars[0]?.lap || 1)));
    snapshot.totalLaps = Math.max(1, Math.floor(finiteOr(totalLaps, 5)));
    snapshot.score = Math.floor(finiteOr(score, 0));
    snapshot.weatherMoisture = clamp(finiteOr(weatherMoisture, 0), 0, 1);

    const carCount = allCars.length;
    snapshot.cars.length = carCount;

    // Zero-GC live race standings sort (position 1..N + gapToLeader in seconds)
    const order = this._standingsIdxScratch;
    order.length = carCount;
    for (let i = 0; i < carCount; i++) order[i] = i;
    order.sort((ia, ib) => {
      const ca = allCars[ia];
      const cb = allCars[ib];
      const effA = finiteOr(ca?.totalDistanceGameM, ca?.s || 0) - finiteOr(ca?.timePenaltiesSec, 0) * 1.6;
      const effB = finiteOr(cb?.totalDistanceGameM, cb?.s || 0) - finiteOr(cb?.timePenaltiesSec, 0) * 1.6;
      return effB - effA;
    });

    const leaderCar = allCars[order[0]];
    const leaderEffDist = finiteOr(leaderCar?.totalDistanceGameM, leaderCar?.s || 0) - finiteOr(leaderCar?.timePenaltiesSec, 0) * 1.6;
    // Reference lap pace (~64.5s per 1,000 game-units) yields rock-steady, non-oscillating FOM timing intervals
    const secPerGameUnit = 0.0645;

    for (let rankIdx = 0; rankIdx < carCount; rankIdx++) {
      const i = order[rankIdx];
      const src = allCars[i];
      const speedKmh = Math.max(0, finiteOr(src.speedKmh, 0));
      const brake = clamp(finiteOr(src.brakeInput !== undefined ? src.brakeInput : src.brake, 0), 0, 1);
      const throttle = clamp(finiteOr(src.throttleInput !== undefined ? src.throttleInput : src.throttle, 0), 0, 1);
      const steerInput = clamp(finiteOr(src.steerInput, 0), -1, 1);
      const inSlipstream = !!src.inSlipstream;
      const drsActive = src.drsActive !== undefined
        ? !!src.drsActive
        : (inSlipstream && speedKmh > 205 && brake < 0.05 && !src.inPitLane);

      // Physical carbon-ceramic rotor thermal integration (0..1.85 sim thermal range)
      const carId = src.id || (src.isPlayer ? 'PLAYER' : `AI_${i}`);
      const prevGlow = this._recBrakeGlow.get(carId) || 0;
      const heatGain = (brake > 0.18 && speedKmh > 75)
        ? brake * (speedKmh / 290) * 5.2
        : 0;
      const nextGlow = heatGain > 0
        ? Math.min(3.6, prevGlow + heatGain * sampleStepDt)
        : Math.max(0, prevGlow - (1.4 + speedKmh / 240) * sampleStepDt);
      this._recBrakeGlow.set(carId, nextGlow);

      const steerAngleRad = Number.isFinite(src.steerAngleRad)
        ? src.steerAngleRad
        : computeFallbackSteerAngleRad(steerInput, speedKmh);

      const effDist = finiteOr(src.totalDistanceGameM, src.s || 0) - finiteOr(src.timePenaltiesSec, 0) * 1.6;
      const distBehindLeader = Math.max(0, leaderEffDist - effDist);
      const computedGapSec = rankIdx === 0 ? 0 : distBehindLeader * secPerGameUnit;
      const explicitPos = Number.isFinite(src.position) ? src.position : (Number.isFinite(src.racePos) ? src.racePos : (rankIdx + 1));
      const explicitGap = Number.isFinite(src.gapToLeader)
        ? src.gapToLeader
        : (Number.isFinite(src.gapToLeaderSec) ? src.gapToLeaderSec : computedGapSec);

      let prevEffDist = leaderEffDist;
      if (rankIdx > 0) {
        const aheadCar = allCars[order[rankIdx - 1]];
        prevEffDist = finiteOr(aheadCar?.totalDistanceGameM, aheadCar?.s || 0) - finiteOr(aheadCar?.timePenaltiesSec, 0) * 1.6;
      }
      const intervalAheadSec = rankIdx === 0 ? 0 : Math.max(0, (prevEffDist - effDist) * secPerGameUnit);

      let dst = snapshot.cars[i];
      if (!dst) {
        dst = {
          wheelCompression: [0, 0, 0, 0],
          tireTempsC: [90, 90, 90, 90],
          tireFlatSpot: [0, 0, 0, 0],
        };
        snapshot.cars[i] = dst;
      } else {
        if (!Array.isArray(dst.wheelCompression)) dst.wheelCompression = [0, 0, 0, 0];
        if (!Array.isArray(dst.tireTempsC)) dst.tireTempsC = [90, 90, 90, 90];
        if (!Array.isArray(dst.tireFlatSpot)) dst.tireFlatSpot = [0, 0, 0, 0];
      }

      dst.id = carId;
      dst.name = src.name || (src.isPlayer ? 'YOU (PHANATIC #1)' : `RIVAL #${i + 1}`);
      dst.short = deriveDriverCode(src, i);
      dst.teamName = deriveTeamName(src, i);
      dst.liveryHex = deriveTeamHex(src, i);
      dst.carNum = finiteOr(src.carNum, i + 1);
      dst.isPlayer = !!src.isPlayer;

      // Spatial & Kinematics
      dst.s = wrapTrackS(src.s);
      dst.totalDistanceGameM = finiteOr(src.totalDistanceGameM, dst.s);
      dst.lateralOffset = finiteOr(src.lateralOffset, 0);
      dst.relYaw = finiteOr(src.relYaw, 0);
      dst.speedKmh = speedKmh;
      dst.latG = finiteOr(src.latG, 0);
      dst.longG = finiteOr(src.longG, 0);

      // Powertrain & Controls
      dst.rpm = clamp(finiteOr(src.rpm, 0), 0, 15000);
      dst.gear = Math.max(1, Math.round(finiteOr(src.gear, 1)));
      dst.throttle = throttle;
      dst.throttleInput = throttle;
      dst.brake = brake;
      dst.brakeInput = brake;
      dst.steerInput = steerInput;
      dst.steerAngleRad = steerAngleRad;
      dst.inSlipstream = inSlipstream;
      dst.drsActive = drsActive;
      dst.ersCharge = clamp(finiteOr(src.ersCharge, 1.0), 0, 1);

      // Full 6-DOF Suspension & 4-Corner Wheel Compression (m) / Tire Thermal (°C) State
      dst.chassisPitchRad = finiteOr(src.chassisPitchRad, 0);
      dst.chassisRollRad = finiteOr(src.chassisRollRad, 0);
      dst.chassisHeaveM = finiteOr(src.chassisHeaveM, 0);

      const srcWc = src.wheelCompression;
      if (Array.isArray(srcWc) && srcWc.length >= 4) {
        dst.wheelCompression[0] = finiteOr(srcWc[0], 0);
        dst.wheelCompression[1] = finiteOr(srcWc[1], 0);
        dst.wheelCompression[2] = finiteOr(srcWc[2], 0);
        dst.wheelCompression[3] = finiteOr(srcWc[3], 0);
      } else {
        dst.wheelCompression[0] = (finiteOr(src.tires?.FL?.compression, 0.25) - 0.25) / 12.5;
        dst.wheelCompression[1] = (finiteOr(src.tires?.FR?.compression, 0.25) - 0.25) / 12.5;
        dst.wheelCompression[2] = (finiteOr(src.tires?.RL?.compression, 0.25) - 0.25) / 12.5;
        dst.wheelCompression[3] = (finiteOr(src.tires?.RR?.compression, 0.25) - 0.25) / 12.5;
      }

      const srcTemps = src.tireTempsC;
      if (Array.isArray(srcTemps) && srcTemps.length >= 4) {
        dst.tireTempsC[0] = finiteOr(srcTemps[0], 90);
        dst.tireTempsC[1] = finiteOr(srcTemps[1], 90);
        dst.tireTempsC[2] = finiteOr(srcTemps[2], 90);
        dst.tireTempsC[3] = finiteOr(srcTemps[3], 90);
      } else {
        dst.tireTempsC[0] = finiteOr(src.tires?.FL?.surfaceTemp ?? src.tires?.FL?.temp, 90);
        dst.tireTempsC[1] = finiteOr(src.tires?.FR?.surfaceTemp ?? src.tires?.FR?.temp, 90);
        dst.tireTempsC[2] = finiteOr(src.tires?.RL?.surfaceTemp ?? src.tires?.RL?.temp, 90);
        dst.tireTempsC[3] = finiteOr(src.tires?.RR?.surfaceTemp ?? src.tires?.RR?.temp, 90);
      }

      const srcFlat = src.tireFlatSpot;
      if (Array.isArray(srcFlat) && srcFlat.length >= 4) {
        dst.tireFlatSpot[0] = clamp(finiteOr(srcFlat[0], 0), 0, 1);
        dst.tireFlatSpot[1] = clamp(finiteOr(srcFlat[1], 0), 0, 1);
        dst.tireFlatSpot[2] = clamp(finiteOr(srcFlat[2], 0), 0, 1);
        dst.tireFlatSpot[3] = clamp(finiteOr(srcFlat[3], 0), 0, 1);
      } else {
        const scalarFlat = typeof srcFlat === 'number' ? clamp(srcFlat, 0, 1) : (srcFlat ? 0.45 : 0);
        dst.tireFlatSpot[0] = clamp(finiteOr(src.tires?.FL?.flatSpot, scalarFlat), 0, 1);
        dst.tireFlatSpot[1] = clamp(finiteOr(src.tires?.FR?.flatSpot, scalarFlat), 0, 1);
        dst.tireFlatSpot[2] = clamp(finiteOr(src.tires?.RL?.flatSpot, scalarFlat), 0, 1);
        dst.tireFlatSpot[3] = clamp(finiteOr(src.tires?.RR?.flatSpot, scalarFlat), 0, 1);
      }

      const flLife = finiteOr(src.tires?.FL?.life, 1.0);
      const frLife = finiteOr(src.tires?.FR?.life, 1.0);
      const rlLife = finiteOr(src.tires?.RL?.life, 1.0);
      const rrLife = finiteOr(src.tires?.RR?.life, 1.0);
      dst.tireLife = clamp((flLife + frLife + rlLife + rrLife) * 0.25, 0, 1);
      dst.compound = src.compound || 'SOFT';

      // Component Damage & Surface Contact
      dst.onCurb = !!src.onCurb;
      dst.onGrass = !!src.onGrass;
      dst.skidIntensity = clamp(finiteOr(src.skidIntensity, 0), 0, 1);
      dst.exploded = !!src.exploded;
      dst.inPitLane = !!src.inPitLane;
      dst.pitJackLift = clamp(finiteOr(src.pitJackLift, 0), 0, 1);
      dst.brakeGlow = nextGlow;
      dst.brakeThermal = Number.isFinite(src.brakeThermal)
        ? clamp(src.brakeThermal, 0, 1)
        : clamp(nextGlow / 2.2, 0, 1);

      dst.frontWingDmg = clamp(finiteOr(src.damage?.frontWing, 0), 0, 1);
      dst.frontWingLeftDmg = clamp(finiteOr(src.damage?.frontWingLeft, dst.frontWingDmg), 0, 1);
      dst.frontWingRightDmg = clamp(finiteOr(src.damage?.frontWingRight, dst.frontWingDmg), 0, 1);
      dst.rearWingDmg = clamp(finiteOr(src.damage?.rearWing, 0), 0, 1);
      dst.suspensionDmg = clamp(finiteOr(src.damage?.suspension, 0), 0, 1);
      dst.suspensionBias = finiteOr(src.damage?.suspensionBias, 1);
      dst.damagedCorner = src.damage?.damagedCorner || '';
      dst.hasPuncture = !!src.damage?.hasPuncture;

      // Live Race Classification
      dst.position = Math.max(1, Math.round(explicitPos));
      dst.gapToLeader = Math.max(0, explicitGap);
      dst.intervalAhead = intervalAheadSec;
      dst.lapsDown = Math.max(0, Math.floor(distBehindLeader / TRACK_GAME_LENGTH));
      dst.lap = Math.max(1, Math.floor(finiteOr(src.lap, snapshot.currentLap)));
    }

    this.frames.push(snapshot);
    return true;
  }

  // --------------------------------------------------------------------------
  // 2. INTERACTIVE PLAYBACK TRANSPORT & FOM BROADCAST CONTROLS
  // --------------------------------------------------------------------------
  enterReplay(startFromEndSeconds = 12, camera = null) {
    if (this.frames.length === 0) return false;

    if (camera && camera.isPerspectiveCamera) {
      if (this._savedCameraFov === null) this._savedCameraFov = camera.fov;
      if (this._savedCameraNear === null) this._savedCameraNear = camera.near;
    }

    const firstTime = this.frames[0].timeSec;
    const lastTime = this.frames[this.frames.length - 1].timeSec;

    if (
      startFromEndSeconds === 0 ||
      startFromEndSeconds === null ||
      !Number.isFinite(startFromEndSeconds) ||
      startFromEndSeconds < 0
    ) {
      this.playheadSec = firstTime;
    } else {
      this.playheadSec = Math.max(firstTime, lastTime - startFromEndSeconds);
    }
    this._prevPlayheadSec = this.playheadSec;

    const lastCars = this.frames[this.frames.length - 1].cars;
    if (this.focusCarIndex < 0 || this.focusCarIndex >= lastCars.length) {
      const pIdx = lastCars.findIndex((c) => c.isPlayer);
      this.focusCarIndex = pIdx >= 0 ? pIdx : 0;
    }

    this.isPlaying = true;
    this.paused = false;
    this._activeTelephotoIdx = -1;
    this._activeKerbCamIdx = -1;
    this._activePitWallIdx = -1;
    this._flybyFiredKey = '';
    this._flybyBuffetTimer = 0;
    this._opInitialized = false;
    this._cameraJustCut = true;
    this._directorCutHoldTimer = 0;
    this._directorShotElapsed = 0;
    this._appliedReplayCompounds.clear();

    this._ensureBroadcastDOM();
    this._syncCleanFeedDOM();

    return true;
  }

  exitReplay(camera) {
    this.isPlaying = false;
    this.paused = false;
    this._activeTelephotoIdx = -1;
    this._activeKerbCamIdx = -1;
    this._activePitWallIdx = -1;
    this._flybyFiredKey = '';
    this._flybyBuffetTimer = 0;
    this._opInitialized = false;
    this._cameraJustCut = true;

    // Restore pre-replay visibility, tire compound colors & neutral aero/wing poses on rigs
    if (this._lastCarRigs) {
      for (const [carId, origState] of this._preReplayRigState.entries()) {
        const rig = this._resolveRig(this._lastCarRigs, carId, -1);
        if (!rig) continue;
        if (rig.root && origState.visible !== undefined) {
          rig.root.visible = origState.visible;
        }
        if (rig.compoundMat && origState.compoundHex !== undefined) {
          rig.compoundMat.color.setHex(origState.compoundHex);
        }
        if (rig.chassisTiltGroup && origState.tiltY !== undefined) {
          rig.chassisTiltGroup.position.y = origState.tiltY;
        }
        if (rig.parts?.drsFlap) {
          rig.parts.drsFlap.rotation.x = rig.parts.drsFlap.userData?.baseRotX || 0;
          rig.parts.drsFlap.rotation.z = rig.parts.drsFlap.userData?.baseRotZ || 0;
        }
        if (rig.parts?.fwEndL) {
          rig.parts.fwEndL.visible = true;
          rig.parts.fwEndL.rotation.z = rig.parts.fwEndL.userData?.baseRotZ || 0;
          rig.parts.fwEndL.rotation.x = rig.parts.fwEndL.userData?.baseRotX || 0;
          if (rig.parts.fwEndL.userData?.basePosY !== undefined) {
            rig.parts.fwEndL.position.y = rig.parts.fwEndL.userData.basePosY;
          }
        }
        if (rig.parts?.fwEndR) {
          rig.parts.fwEndR.visible = true;
          rig.parts.fwEndR.rotation.z = rig.parts.fwEndR.userData?.baseRotZ || 0;
          rig.parts.fwEndR.rotation.x = rig.parts.fwEndR.userData?.baseRotX || 0;
          if (rig.parts.fwEndR.userData?.basePosY !== undefined) {
            rig.parts.fwEndR.position.y = rig.parts.fwEndR.userData.basePosY;
          }
        }
        if (rig.parts?.fwMain) {
          rig.parts.fwMain.rotation.z = rig.parts.fwMain.userData?.baseRotZ || 0;
          rig.parts.fwMain.rotation.x = rig.parts.fwMain.userData?.baseRotX || 0;
          if (rig.parts.fwMain.userData?.basePosY !== undefined) {
            rig.parts.fwMain.position.y = rig.parts.fwMain.userData.basePosY;
          }
        }
        if (rig.parts?.rwMain) {
          rig.parts.rwMain.rotation.z = rig.parts.rwMain.userData?.baseRotZ || 0;
          rig.parts.rwMain.rotation.y = rig.parts.rwMain.userData?.baseRotY || 0;
          rig.parts.rwMain.rotation.x = rig.parts.rwMain.userData?.baseRotX || 0;
        }
        if (rig.scuffGroup) {
          rig.scuffGroup.visible = false;
        }
      }
    }
    this._preReplayRigState.clear();
    this._appliedReplayCompounds.clear();

    // Restore standard race camera FOV & near-plane cleanly
    const targetCam = camera && camera.isPerspectiveCamera ? camera : null;
    if (targetCam) {
      targetCam.fov = this._savedCameraFov !== null
        ? this._savedCameraFov
        : (targetCam.aspect < 0.85 ? 70 : 60);
      targetCam.near = this._savedCameraNear !== null ? this._savedCameraNear : 0.32;
      targetCam.up.set(0, 1, 0);
      targetCam.updateProjectionMatrix();
    }
    this._savedCameraFov = null;
    this._savedCameraNear = null;
  }

  togglePause() {
    this.paused = !this.paused;
    return this.paused;
  }

  setPaused(paused) {
    this.paused = !!paused;
    return this.paused;
  }

  setSpeed(speed) {
    const val = Number(speed);
    this.playbackSpeed = (!Number.isFinite(val) || val <= 0) ? 1.0 : clamp(val, 0.1, 4.0);
    return this.playbackSpeed;
  }

  cycleSpeed() {
    const idx = REPLAY_SPEED_OPTIONS.findIndex((s) => Math.abs(s - this.playbackSpeed) < 0.01);
    const nextIdx = idx >= 0 ? (idx + 1) % REPLAY_SPEED_OPTIONS.length : 0;
    this.playbackSpeed = REPLAY_SPEED_OPTIONS[nextIdx];
    return this.playbackSpeed;
  }

  seekNormalized(u01) {
    if (this.frames.length === 0) return 0;
    const u = clamp(finiteOr(u01, 0), 0, 1);
    const firstTime = this.frames[0].timeSec;
    const duration = this.getDurationSec();
    const nextTime = firstTime + u * duration;
    if (Math.abs(nextTime - this.playheadSec) > 1.8) {
      this._cameraJustCut = true;
      this._opInitialized = false;
      this._activeTelephotoIdx = -1;
      this._activeKerbCamIdx = -1;
      this._activePitWallIdx = -1;
    }
    this.playheadSec = nextTime;
    this._flybyFiredKey = '';
    return u;
  }

  stepRelativeSeconds(deltaSec) {
    if (this.frames.length === 0) return 0;
    const delta = finiteOr(deltaSec, 0);
    const firstTime = this.frames[0].timeSec;
    const lastTime = this.frames[this.frames.length - 1].timeSec;
    const nextTime = clamp(this.playheadSec + delta, firstTime, lastTime);
    if (Math.abs(nextTime - this.playheadSec) > 1.8) {
      this._cameraJustCut = true;
      this._opInitialized = false;
      this._activeTelephotoIdx = -1;
      this._activeKerbCamIdx = -1;
      this._activePitWallIdx = -1;
    }
    this.playheadSec = nextTime;
    this._flybyFiredKey = '';
    return this.playheadSec - firstTime;
  }

  setCameraMode(idx) {
    if (typeof idx === 'string') {
      const upper = idx.trim().toUpperCase();
      if (upper === 'TV_DIRECTOR' || upper === 'AUTO' || upper === 'AUTO_DIRECTOR') {
        idx = 0;
      } else {
        const found = REPLAY_CAMERA_MODES.findIndex((m) => m.id === upper);
        idx = found >= 0 ? found : 0;
      }
    }
    const count = REPLAY_CAMERA_MODES.length;
    const next = ((Math.floor(finiteOr(idx, 0)) % count) + count) % count;
    const changed = next !== this.cameraModeIdx;

    this.cameraModeIdx = next;
    this.autoDirector = next === 0;

    if (changed) {
      this._directorCutHoldTimer = 0;
      this._directorShotElapsed = 0;
      if (next !== 0) {
        this._directorActiveMode = next;
      }
      this._cameraJustCut = true;
      this._opInitialized = false;
      this._activeTelephotoIdx = -1;
      this._activeKerbCamIdx = -1;
      this._activePitWallIdx = -1;
      this._flybyFiredKey = '';
      this._flybyBuffetTimer = 0;
    }
    return this.cameraModeIdx;
  }

  cycleCameraMode(step = 1) {
    return this.setCameraMode(this.cameraModeIdx + (Number.isFinite(step) ? step : 1));
  }

  setAutoDirector(enabled = true) {
    this.autoDirector = !!enabled;
    this._directorCutHoldTimer = 0;
    this._directorShotElapsed = 0;
    if (this.autoDirector) {
      this.cameraModeIdx = 0;
    } else if (this.cameraModeIdx === 0) {
      this.cameraModeIdx = clamp(this._directorActiveMode || 1, 1, REPLAY_CAMERA_MODES.length - 1);
    }
    return this.autoDirector;
  }

  toggleAutoDirector() {
    return this.setAutoDirector(!this.autoDirector);
  }

  setCleanFeed(clean = false) {
    this.cleanFeed = !!clean;
    this._syncCleanFeedDOM();
    return this.cleanFeed;
  }

  toggleCleanFeed() {
    return this.setCleanFeed(!this.cleanFeed);
  }

  setFocusCar(idx) {
    const count = this.frames.length > 0
      ? Math.max(1, this.frames[this.frames.length - 1].cars.length)
      : 1;
    const next = ((Math.floor(finiteOr(idx, 0)) % count) + count) % count;
    if (next !== this.focusCarIndex) {
      this.focusCarIndex = next;
      this._cameraJustCut = true;
      this._opInitialized = false;
      this._activeTelephotoIdx = -1;
      this._activeKerbCamIdx = -1;
      this._activePitWallIdx = -1;
      this._flybyFiredKey = '';
      this._flybyBuffetTimer = 0;
    }
    return this.focusCarIndex;
  }

  setFocusCarById(carId) {
    if (!carId || this.frames.length === 0) return this.focusCarIndex;
    const i0 = this._findFrameIndex(this.playheadSec);
    const frame = this.frames[i0] || this.frames[this.frames.length - 1];
    const idx = frame.cars.findIndex((c) => c.id === carId);
    if (idx >= 0) {
      return this.setFocusCar(idx);
    }
    return this.focusCarIndex;
  }

  cycleFocusCar(step = 1) {
    return this.setFocusCar(this.focusCarIndex + (Number.isFinite(step) ? step : 1));
  }

  // --------------------------------------------------------------------------
  // 3. INTELLIGENT FOM BROADCAST PRODUCER ACTION SCORER
  // --------------------------------------------------------------------------
  scoreActionIntensity(focusCar, focusFrame = null, allCars = this._interpCarPool, track = null) {
    const res = this._lastActionEval;
    if (!focusCar || focusCar.exploded) {
      res.score = 10;
      res.recommendedMode = 1;
      res.holdDurationSec = 3.5;
      res.reason = 'INCIDENT_TRACKSIDE';
      res.nearestRivalDistM = Infinity;
      res.rivalBehind = false;
      return res;
    }

    const mPerS = getMetersPerGameUnit(track);
    let nearestRivalDistM = Infinity;
    let nearestLongDeltaM = Infinity;
    let packCountWithin35M = 0;

    const carsArr = Array.isArray(allCars) ? allCars : this._interpCarPool;
    const n = carsArr.length;

    for (let i = 0; i < n; i++) {
      const other = carsArr[i];
      if (!other || other === focusCar || other.id === focusCar.id || other.exploded) continue;

      const dLongM = signedWrapDeltaS(other.s - focusCar.s) * mPerS;
      const dLatM = (other.lateralOffset || 0) - (focusCar.lateralOffset || 0);
      let distM = Math.hypot(dLongM, dLatM);

      const otherFrame = (carsArr === this._interpCarPool) ? this._interpFramesScratch[i] : null;
      if (focusFrame?.pos && otherFrame?.pos) {
        distM = focusFrame.pos.distanceTo(otherFrame.pos);
      }

      if (distM < 35.0) packCountWithin35M++;
      if (distM < nearestRivalDistM) {
        nearestRivalDistM = distM;
        nearestLongDeltaM = dLongM;
      }
    }

    const speedKmh = focusCar.speedKmh || 0;
    const brake = focusCar.brake || 0;
    const skid = focusCar.skidIntensity || 0;
    const onCurb = !!focusCar.onCurb;
    const s = focusCar.s || 0;
    const nearStartFinish = s >= 942.0 || s <= 58.0;

    // Check if an embedded FIA Apex Kerb Box-Cam lies 10m..52m upstream ahead
    let upcomingKerbDistM = Infinity;
    if (this._apexKerbCams.length > 0) {
      for (let i = 0; i < this._apexKerbCams.length; i++) {
        const dM = signedWrapDeltaS(this._apexKerbCams[i].s - s) * mPerS;
        if (dM >= -8.0 && dM <= 54.0 && Math.abs(dM) < upcomingKerbDistM) {
          upcomingKerbDistM = dM;
        }
      }
    }

    let score = 24;
    let recommendedMode = 1; // Default: 1 = TRACKSIDE TELEPHOTO
    let holdDurationSec = 3.6;
    let reason = 'TELEPHOTO_TRACKING';

    // 1. < 10m Wheel-to-Wheel Battle or Side-by-Side Overtake (Highest FOM Priority!)
    if (nearestRivalDistM < 10.0) {
      const closeness01 = clamp(1.0 - nearestRivalDistM / 10.0, 0, 1);
      score = 82 + closeness01 * 18;
      const sideBySide = Math.abs(nearestLongDeltaM) < 5.2;
      if (nearestLongDeltaM < -1.2 && !sideBySide) {
        // Rival tucked right under our rear wing / diffuser in slipstream -> REAR GEARBOX CAM!
        recommendedMode = 5;
        holdDurationSec = 3.1;
        reason = 'SLIPSTREAM_DEFENSE';
      } else if (sideBySide && packCountWithin35M >= 2) {
        // Multi-car side-by-side battle -> HELICOPTER CINEFLEX or HALO T-CAM!
        recommendedMode = this._directorActiveMode === 4 ? 3 : 4;
        holdDurationSec = 3.4;
        reason = 'WHEEL_TO_WHEEL_OVERTAKE';
      } else {
        // Diving inside / attacking rival right ahead -> FOM HALO T-CAM!
        recommendedMode = 4;
        holdDurationSec = 3.3;
        reason = 'WHEEL_TO_WHEEL_ATTACK';
      }
    } else if (focusCar.inPitLane) {
      // 2. Pit Lane Entry / Service / Pit Exit
      score = 72;
      recommendedMode = s >= 45.0 && s <= 125.0 ? 4 : 7;
      holdDurationSec = 3.2;
      reason = 'PIT_EXIT_WATCH';
    } else if (nearStartFinish && speedKmh >= 295.0) {
      // 3. 300+ km/h Main Straight Start/Finish Scream -> PIT-WALL PANORAMIC FLYBY!
      score = 68 + clamp((speedKmh - 295) / 35, 0, 1) * 10;
      recommendedMode = 7;
      holdDurationSec = 3.2;
      reason = 'START_FINISH_300KMH_FLYBY';
    } else if ((brake > 0.62 && speedKmh > 110) || skid > 0.36) {
      // 4. Heavy 5G Braking Zone / Inside-Front Lockup -> WISHBONE SUSPENSION CAM or APEX KERB CAM!
      score = 60 + Math.max(brake, skid) * 18;
      if (upcomingKerbDistM <= 48.0) {
        recommendedMode = 2;
        holdDurationSec = 2.6;
        reason = 'APEX_KERB_STRIKE';
      } else {
        recommendedMode = 6;
        holdDurationSec = 2.8;
        reason = 'BRAKE_LOCKUP_SUSPENSION';
      }
    } else if (upcomingKerbDistM >= 6.0 && upcomingKerbDistM <= 46.0 && speedKmh > 85) {
      // 5. Approaching Corner Inside Kerb -> STATIC APEX KERB CAM (y = 0.22m)!
      score = 55;
      recommendedMode = 2;
      holdDurationSec = 2.6;
      reason = 'CORNER_APEX_KERB';
    } else if (onCurb && speedKmh > 115) {
      // 6. Riding Sawtooth Exit Kerbs -> FRONT WISHBONE SUSPENSION CAM!
      score = 52;
      recommendedMode = 6;
      holdDurationSec = 2.7;
      reason = 'WISHBONE_KERB_LOAD';
    } else if (packCountWithin35M >= 2 || (speedKmh >= 300.0 && !nearStartFinish)) {
      // 7. Multi-Car Pack or 300+ km/h Back-Straight Blast -> Alternate TELEPHOTO & HELI CINEFLEX!
      score = 48 + Math.min(12, packCountWithin35M * 4);
      recommendedMode = packCountWithin35M >= 2 ? 3 : 1;
      holdDurationSec = recommendedMode === 3 ? 3.9 : 3.7;
      reason = recommendedMode === 3 ? 'HELI_PACK_PURSUIT' : 'HIGH_SPEED_TELEPHOTO';
    } else {
      score = 32;
      recommendedMode = 1;
      holdDurationSec = 3.8;
      reason = 'TELEPHOTO_TRACKING';
    }

    res.score = Math.round(score);
    res.recommendedMode = recommendedMode;
    res.holdDurationSec = clamp(holdDurationSec, 2.4, 4.2);
    res.reason = reason;
    res.nearestRivalDistM = nearestRivalDistM;
    res.rivalBehind = nearestLongDeltaM < -1.0;
    return res;
  }

  // --------------------------------------------------------------------------
  // 4. SUB-FRAME SPLINE INTERPOLATION, FULL SIM RIG SYNC & 8-CAMERA DIRECTOR
  // --------------------------------------------------------------------------
  updatePlayback(rawDt, {
    track,
    camera,
    carRigs,
    moisture,
    elapsedSec = 0,
    callbacks,
  } = {}) {
    if (!this.isPlaying || this.frames.length === 0) {
      return {
        active: false,
        paused: this.paused,
        speed: this.playbackSpeed,
        cleanFeed: this.cleanFeed,
        currentTimeSec: 0,
        durationSec: this.getDurationSec(),
        progress01: 0,
        cameraModeIdx: this.cameraModeIdx,
        directorCameraIdx: this._directorActiveMode,
        cameraLabel: this.cameraLabel,
        focusCarName: '',
        focusCarSpeedKmh: 0,
        focusCarGear: 1,
        focusCarRpm: 0,
        lap: 1,
      };
    }

    if (camera && camera.isPerspectiveCamera) {
      if (this._savedCameraFov === null) this._savedCameraFov = camera.fov;
      if (this._savedCameraNear === null) this._savedCameraNear = camera.near;
    }
    if (carRigs) {
      this._lastCarRigs = carRigs;
    }

    const safeRawDt = Number.isFinite(rawDt) ? clamp(rawDt, 0.0005, 0.1) : (1 / 60);
    const firstTime = this.frames[0].timeSec;
    const lastTime = this.frames[this.frames.length - 1].timeSec;
    const durationSec = Math.max(0, lastTime - firstTime);

    let playheadDelta = 0;

    if (!this.paused && durationSec > 0) {
      const stepSec = safeRawDt * this.playbackSpeed;
      const nextPlayhead = this.playheadSec + stepSec;
      if (nextPlayhead > lastTime) {
        this.playheadSec = durationSec > 0.05
          ? firstTime + ((nextPlayhead - lastTime) % durationSec)
          : lastTime;
        this._cameraJustCut = true;
        this._opInitialized = false;
        this._activeTelephotoIdx = -1;
        this._activeKerbCamIdx = -1;
        this._activePitWallIdx = -1;
        this._flybyFiredKey = '';
      } else {
        this.playheadSec = nextPlayhead;
      }
      playheadDelta = stepSec;
    } else {
      this.playheadSec = clamp(this.playheadSec, firstTime, lastTime);
      playheadDelta = this.playheadSec - this._prevPlayheadSec;
    }

    this._prevPlayheadSec = this.playheadSec;

    // O(log N) binary search for bracketing frames f0 <= playheadSec <= f1
    const i0 = this._findFrameIndex(this.playheadSec);
    const i1 = Math.min(this.frames.length - 1, i0 + 1);
    const iPrev = Math.max(0, i0 - 1);
    const iNext = Math.min(this.frames.length - 1, i1 + 1);

    const fPrev = this.frames[iPrev];
    const f0 = this.frames[i0];
    const f1 = this.frames[i1];
    const fNext = this.frames[iNext];

    const spanSec = f1.timeSec - f0.timeSec;
    const alpha = spanSec > 1e-6 ? clamp((this.playheadSec - f0.timeSec) / spanSec, 0, 1) : 0;

    const effMoisture = Number.isFinite(moisture)
      ? clamp(moisture, 0, 1)
      : clamp(lerp(f0.weatherMoisture, f1.weatherMoisture, alpha), 0, 1);

    const scrubAbsDt = Math.min(0.05, Math.abs(playheadDelta));
    const rigDt = !this.paused
      ? safeRawDt * this.playbackSpeed
      : (scrubAbsDt > 1e-5 ? scrubAbsDt : 0);

    const rigVisualClockSec = Number.isFinite(this.playheadSec) ? this.playheadSec : elapsedSec;

    // Interpolate all cars & synchronize every 3D FormulaCarRig with full 60Hz suspension/thermal state
    const numCars = f0.cars.length;
    const safeFocusIdx = numCars > 0
      ? (((this.focusCarIndex % numCars) + numCars) % numCars)
      : 0;
    this.focusCarIndex = safeFocusIdx;
    this._interpFramesScratch.length = numCars;

    for (let k = 0; k < numCars; k++) {
      const c0 = f0.cars[k];
      const c1 = this._matchCarInFrame(f1, c0.id, k) || c0;
      const cPrev = this._matchCarInFrame(fPrev, c0.id, k) || c0;
      const cNext = this._matchCarInFrame(fNext, c0.id, k) || c1;

      const interpCar = this._interpolateCarSpline(k, cPrev, c0, c1, cNext, alpha);
      const trackFrame = track ? track.sampleAt(interpCar.s, interpCar.lateralOffset) : null;
      this._interpFramesScratch[k] = trackFrame;

      const rig = this._resolveRig(carRigs, interpCar.id, k);
      if (rig && trackFrame) {
        if (!this._preReplayRigState.has(interpCar.id)) {
          this._preReplayRigState.set(interpCar.id, {
            compoundHex: rig.compoundMat ? rig.compoundMat.color.getHex() : undefined,
            visible: rig.root ? rig.root.visible : true,
            tiltY: rig.chassisTiltGroup ? rig.chassisTiltGroup.position.y : 0,
          });
        }
        if (rig.root) {
          rig.root.visible = !interpCar.exploded;
        }
        // Always show driver helmet inside Halo on TV cameras & Onboard T-Cam
        rig.setCockpitViewActive?.(false);

        if (this._appliedReplayCompounds.get(interpCar.id) !== interpCar.compound) {
          rig.setCompound?.(interpCar.compound);
          this._appliedReplayCompounds.set(interpCar.id, interpCar.compound);
        }

        // Sync pre-integrated slotted brake rotor thermal state across timeline scrubs
        if (rig.brakeGlow !== undefined) {
          rig.brakeGlow = interpCar.brakeGlow;
        }
        if (rig._brakeThermal !== undefined) {
          rig._brakeThermal = interpCar.brakeThermal;
        }

        const preSpin = rig.wheelSpinAngle || 0;
        const origIsPlayer = interpCar.isPlayer;
        // Ensure focused car (even an AI rival selected via Timing Tower!) refreshes its 3D OLED wheel on T-Cam
        if (k === safeFocusIdx) interpCar.isPlayer = true;
        rig.updateTransformAndVFX(interpCar, trackFrame, effMoisture, rigDt, rigVisualClockSec);
        interpCar.isPlayer = origIsPlayer;

        // Reverse wheel spin cleanly if user scrubs backward while paused
        if (this.paused && playheadDelta < -1e-5 && rig.wheels) {
          const spinStep = (rig.wheelSpinAngle || 0) - preSpin;
          rig.wheelSpinAngle = preSpin - spinStep;
          for (const w of rig.wheels) {
            if (w.spinPivot) w.spinPivot.rotation.x = rig.wheelSpinAngle;
          }
        }

        if (rigDt === 0 && rig.parts?.drsFlap) {
          const settle = Math.min(1, safeRawDt * 16);
          const baseX = rig.parts.drsFlap.userData?.baseRotX || 0;
          const sign = rig._drsOpenSign !== undefined ? rig._drsOpenSign : 1;
          const drsOpen = !interpCar.exploded && interpCar.brake < 0.08 && interpCar.damage.rearWing < 0.35 && !!interpCar.drsActive;
          const targetDrs = baseX + (drsOpen ? 0.32 * sign : 0.0);
          rig.parts.drsFlap.rotation.x += (targetDrs - rig.parts.drsFlap.rotation.x) * settle;
        }
      }
    }

    const focusCar = this._interpCarPool[safeFocusIdx];
    const focusFrame = this._interpFramesScratch[safeFocusIdx];
    const focusRig = focusCar ? this._resolveRig(carRigs, focusCar.id, safeFocusIdx) : null;

    if (track && camera && focusCar && focusFrame) {
      this._updateBroadcastCamera(safeRawDt, {
        track,
        camera,
        focusCar,
        focusFrame,
        focusRig,
        numCars,
        callbacks,
      });
    }

    const currentTimeSec = clamp(this.playheadSec - firstTime, 0, durationSec);
    const progress01 = durationSec > 1e-6 ? clamp(currentTimeSec / durationSec, 0, 1) : 0;
    const frameLap = alpha < 0.5 ? f0.currentLap : f1.currentLap;
    const totalLaps = alpha < 0.5 ? f0.totalLaps : f1.totalLaps;
    const activeLap = focusCar ? (focusCar.lap || frameLap || 1) : (frameLap || 1);
    const activeCamLabel = this.cameraLabel;

    // Update Self-Contained FOM World-Feed Broadcast Graphics Layer
    this._updateBroadcastHUD({
      track,
      numCars,
      focusCar,
      activeCamLabel,
      lap: activeLap,
      totalLaps,
    });

    return {
      active: this.isPlaying,
      paused: this.paused,
      speed: this.playbackSpeed,
      cleanFeed: this.cleanFeed,
      currentTimeSec,
      durationSec,
      progress01,
      cameraModeIdx: this.cameraModeIdx,
      directorCameraIdx: this._directorActiveMode,
      cameraLabel: activeCamLabel,
      actionScore: this._lastActionEval.score,
      actionReason: this._lastActionEval.reason,
      focusCarIndex: safeFocusIdx,
      focusCarId: focusCar ? focusCar.id : '',
      focusCarName: focusCar ? focusCar.name : '',
      focusCarSpeedKmh: focusCar ? Math.round(focusCar.speedKmh) : 0,
      focusCarGear: focusCar ? focusCar.gear : 1,
      focusCarRpm: focusCar ? Math.round(focusCar.rpm) : 0,
      focusCarThrottle: focusCar ? focusCar.throttle : 0,
      focusCarBrake: focusCar ? focusCar.brake : 0,
      focusCarDrs: focusCar ? !!focusCar.drsActive : false,
      focusCarCompound: focusCar ? focusCar.compound : 'SOFT',
      focusCarPosition: focusCar ? focusCar.position : 1,
      focusCarGapToLeader: focusCar ? focusCar.gapToLeader : 0,
      lap: activeLap,
      totalLaps,
      focusWorldPos: focusFrame ? focusFrame.pos : null,
    };
  }

  // --------------------------------------------------------------------------
  // 5. BINARY SEARCH & C1 CUBIC CATMULL-ROM SPLINE INTERPOLATION
  // --------------------------------------------------------------------------
  _findFrameIndex(targetTimeSec) {
    const n = this.frames.length;
    if (n <= 1 || targetTimeSec <= this.frames[0].timeSec) return 0;
    if (targetTimeSec >= this.frames[n - 1].timeSec) return n - 2;

    let lo = 0;
    let hi = n - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.frames[mid].timeSec <= targetTimeSec) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  _matchCarInFrame(frame, carId, hintIdx) {
    if (!frame || !frame.cars || frame.cars.length === 0) return null;
    if (hintIdx < frame.cars.length && frame.cars[hintIdx].id === carId) {
      return frame.cars[hintIdx];
    }
    for (let i = 0; i < frame.cars.length; i++) {
      if (frame.cars[i].id === carId) return frame.cars[i];
    }
    return frame.cars[Math.min(hintIdx, frame.cars.length - 1)];
  }

  _resolveRig(carRigs, carId, index) {
    if (!carRigs) return null;
    if (carRigs instanceof Map) return carRigs.get(carId) || null;
    if (Array.isArray(carRigs)) return carRigs[index] || null;
    return carRigs[carId] || null;
  }

  _interpolateCarSpline(poolIdx, cPrev, c0, c1, cNext, alpha) {
    let out = this._interpCarPool[poolIdx];
    if (!out) {
      out = {
        wheelCompression: [0, 0, 0, 0],
        tireTempsC: [90, 90, 90, 90],
        tireFlatSpot: [0, 0, 0, 0],
        damage: {
          frontWing: 0,
          frontWingLeft: 0,
          frontWingRight: 0,
          rearWing: 0,
          suspension: 0,
          suspensionBias: 1,
          damagedCorner: '',
          hasPuncture: false,
        },
      };
      this._interpCarPool[poolIdx] = out;
    }

    const ds01 = signedWrapDeltaS(c1.s - c0.s);
    const hasDiscontinuity =
      c0.exploded !== c1.exploded ||
      Math.abs(ds01) > 85.0 ||
      Math.abs(c1.lateralOffset - c0.lateralOffset) > 10.0;

    let interpS;
    let interpLat;
    let interpYaw;
    let interpPitch;
    let interpRoll;
    let interpHeave;

    if (hasDiscontinuity) {
      interpS = wrapTrackS(c0.s + ds01 * alpha);
      interpLat = lerp(c0.lateralOffset, c1.lateralOffset, alpha);
      interpYaw = c0.relYaw + shortestAngleDelta(c0.relYaw, c1.relYaw) * alpha;
      interpPitch = lerp(c0.chassisPitchRad || 0, c1.chassisPitchRad || 0, alpha);
      interpRoll = lerp(c0.chassisRollRad || 0, c1.chassisRollRad || 0, alpha);
      interpHeave = lerp(c0.chassisHeaveM || 0, c1.chassisHeaveM || 0, alpha);
    } else {
      const u0 = c0.s;
      const uPrev = u0 + signedWrapDeltaS(cPrev.s - c0.s);
      const u1 = u0 + ds01;
      const uNext = u1 + signedWrapDeltaS(cNext.s - c1.s);

      interpS = wrapTrackS(catmullRom1D(uPrev, u0, u1, uNext, alpha));
      interpLat = catmullRom1D(cPrev.lateralOffset, c0.lateralOffset, c1.lateralOffset, cNext.lateralOffset, alpha);

      const y0 = c0.relYaw;
      const yPrev = y0 + shortestAngleDelta(y0, cPrev.relYaw);
      const y1 = y0 + shortestAngleDelta(y0, c1.relYaw);
      const yNext = y1 + shortestAngleDelta(y1, cNext.relYaw);
      interpYaw = catmullRom1D(yPrev, y0, y1, yNext, alpha);

      interpPitch = catmullRom1D(
        cPrev.chassisPitchRad || 0,
        c0.chassisPitchRad || 0,
        c1.chassisPitchRad || 0,
        cNext.chassisPitchRad || 0,
        alpha
      );
      interpRoll = catmullRom1D(
        cPrev.chassisRollRad || 0,
        c0.chassisRollRad || 0,
        c1.chassisRollRad || 0,
        cNext.chassisRollRad || 0,
        alpha
      );
      interpHeave = catmullRom1D(
        cPrev.chassisHeaveM || 0,
        c0.chassisHeaveM || 0,
        c1.chassisHeaveM || 0,
        cNext.chassisHeaveM || 0,
        alpha
      );
    }

    const pick = alpha < 0.5 ? c0 : c1;
    const thr = clamp(lerp(c0.throttle ?? c0.throttleInput ?? 0, c1.throttle ?? c1.throttleInput ?? 0, alpha), 0, 1);
    const brk = clamp(lerp(c0.brake ?? c0.brakeInput ?? 0, c1.brake ?? c1.brakeInput ?? 0, alpha), 0, 1);

    out.id = c0.id;
    out.name = c0.name;
    out.short = c0.short || 'DRV';
    out.teamName = c0.teamName || 'GRAND PRIX';
    out.liveryHex = c0.liveryHex || '#e10600';
    out.carNum = c0.carNum;
    out.isPlayer = c0.isPlayer;

    out.s = interpS;
    out.totalDistanceGameM = lerp(c0.totalDistanceGameM || 0, c1.totalDistanceGameM || 0, alpha);
    out.lateralOffset = interpLat;
    out.relYaw = interpYaw;
    out.speedKmh = Math.max(0, lerp(c0.speedKmh, c1.speedKmh, alpha));
    out.rpm = Math.max(0, lerp(c0.rpm, c1.rpm, alpha));
    out.gear = pick.gear;

    out.throttle = thr;
    out.throttleInput = thr;
    out.brake = brk;
    out.brakeInput = brk;
    out.steerInput = clamp(lerp(c0.steerInput, c1.steerInput, alpha), -1, 1);
    out.steerAngleRad = lerp(c0.steerAngleRad, c1.steerAngleRad, alpha);
    out.inSlipstream = pick.inSlipstream;
    out.drsActive = pick.drsActive;
    out.ersCharge = clamp(lerp(c0.ersCharge ?? 1, c1.ersCharge ?? 1, alpha), 0, 1);

    out.chassisPitchRad = interpPitch;
    out.chassisRollRad = interpRoll;
    out.chassisHeaveM = interpHeave;

    for (let w = 0; w < 4; w++) {
      out.wheelCompression[w] = lerp(
        c0.wheelCompression ? c0.wheelCompression[w] : 0,
        c1.wheelCompression ? c1.wheelCompression[w] : 0,
        alpha
      );
      out.tireTempsC[w] = lerp(
        c0.tireTempsC ? c0.tireTempsC[w] : 90,
        c1.tireTempsC ? c1.tireTempsC[w] : 90,
        alpha
      );
      out.tireFlatSpot[w] = clamp(
        lerp(
          Array.isArray(c0.tireFlatSpot) ? c0.tireFlatSpot[w] : (c0.tireFlatSpot ? 0.45 : 0),
          Array.isArray(c1.tireFlatSpot) ? c1.tireFlatSpot[w] : (c1.tireFlatSpot ? 0.45 : 0),
          alpha
        ),
        0,
        1
      );
    }

    out.compound = pick.compound || 'SOFT';
    out.tireCompound = out.compound;
    out.tireLife = clamp(lerp(c0.tireLife ?? 1, c1.tireLife ?? 1, alpha), 0, 1);
    out.tireWear = 1.0 - out.tireLife;

    out.onCurb = pick.onCurb;
    out.onGrass = !!pick.onGrass;
    out.skidIntensity = clamp(lerp(c0.skidIntensity, c1.skidIntensity, alpha), 0, 1);
    out.exploded = pick.exploded;
    out.latG = lerp(c0.latG || 0, c1.latG || 0, alpha);
    out.longG = lerp(c0.longG || 0, c1.longG || 0, alpha);
    out.inPitLane = pick.inPitLane;
    out.pitJackLift = clamp(lerp(c0.pitJackLift || 0, c1.pitJackLift || 0, alpha), 0, 1);
    out.brakeGlow = Math.max(0, lerp(c0.brakeGlow || 0, c1.brakeGlow || 0, alpha));
    out.brakeThermal = clamp(
      lerp(
        c0.brakeThermal ?? clamp((c0.brakeGlow || 0) / 2.2, 0, 1),
        c1.brakeThermal ?? clamp((c1.brakeGlow || 0) / 2.2, 0, 1),
        alpha
      ),
      0,
      1
    );

    out.position = pick.position || 1;
    out.gapToLeader = Math.max(0, lerp(c0.gapToLeader || 0, c1.gapToLeader || 0, alpha));
    out.intervalAhead = Math.max(0, lerp(c0.intervalAhead || 0, c1.intervalAhead || 0, alpha));
    out.lapsDown = pick.lapsDown || 0;
    out.lap = pick.lap || 1;

    out.damage.frontWing = clamp(lerp(c0.frontWingDmg || 0, c1.frontWingDmg || 0, alpha), 0, 1);
    out.damage.frontWingLeft = clamp(lerp(c0.frontWingLeftDmg ?? c0.frontWingDmg ?? 0, c1.frontWingLeftDmg ?? c1.frontWingDmg ?? 0, alpha), 0, 1);
    out.damage.frontWingRight = clamp(lerp(c0.frontWingRightDmg ?? c0.frontWingDmg ?? 0, c1.frontWingRightDmg ?? c1.frontWingDmg ?? 0, alpha), 0, 1);
    out.damage.rearWing = clamp(lerp(c0.rearWingDmg || 0, c1.rearWingDmg || 0, alpha), 0, 1);
    out.damage.suspension = clamp(lerp(c0.suspensionDmg || 0, c1.suspensionDmg || 0, alpha), 0, 1);
    out.damage.suspensionBias = pick.suspensionBias ?? 1;
    out.damage.damagedCorner = pick.damagedCorner || '';
    out.damage.hasPuncture = !!pick.hasPuncture;

    return out;
  }

  // --------------------------------------------------------------------------
  // 6. CURATED FOM CIRCUIT CAMERA STATIONS (TELEPHOTO, APEX KERB & PIT-WALL)
  // --------------------------------------------------------------------------
  _ensureBroadcastStations(track) {
    const trackKey = `${track.currentTrackId || track.trackDef?.id || 'DEFAULT'}_${track.samples?.length || 0}`;
    if (this._cachedTrackKey === trackKey && this._telephotoCams.length === NUM_TELEPHOTO_TOWERS) {
      return;
    }
    this._cachedTrackKey = trackKey;
    this._telephotoCams.length = 0;
    this._apexKerbCams.length = 0;
    this._pitWallCams.length = 0;
    this._activeTelephotoIdx = -1;
    this._activeKerbCamIdx = -1;
    this._activePitWallIdx = -1;
    this._flybyFiredKey = '';

    const mPerS = getMetersPerGameUnit(track);
    const tunnelRange = track.trackDef?.tunnelRangeS || null;

    // A. 14 Curated FOM Trackside Telephoto Camera Towers (close barrier pods + hydraulic cranes)
    const spacing = TRACK_GAME_LENGTH / NUM_TELEPHOTO_TOWERS;
    const setbackPattern = [3.8, 9.2, 4.3, 12.5, 3.6, 10.4, 4.5, 13.8, 3.9, 8.8, 4.2, 11.6, 3.7, 9.5];
    const heightPattern  = [1.95, 5.4, 2.25, 6.8, 1.85, 4.9, 2.35, 7.2, 2.05, 4.6, 2.15, 6.2, 1.90, 5.1];

    for (let i = 0; i < NUM_TELEPHOTO_TOWERS; i++) {
      const s = wrapTrackS(24.0 + i * spacing);
      const centerFrame = track.sampleAt(s, 0);
      const inPitStraightCorridor = s >= 895 || s <= 130;
      const inTunnel = !!(tunnelRange && s >= tunnelRange[0] - 8 && s <= tunnelRange[1] + 8);
      const curv = centerFrame.realCurvature !== undefined
        ? centerFrame.realCurvature * 82.0
        : (centerFrame.curvature || 0);

      let side;
      if (inTunnel) {
        side = 1; // Open seaward colonnade in Monaco tunnel
      } else if (inPitStraightCorridor) {
        side = -1; // Opposite Pit Garages so paddock & gantry frame background
      } else if (Math.abs(curv) > 0.05) {
        side = curv > 0 ? -1 : 1; // Classic FOM outside-of-corner telephoto crane
      } else {
        side = i % 2 === 0 ? -1 : 1;
      }

      const setback = inTunnel ? 3.2 : setbackPattern[i % setbackPattern.length];
      const lat = side * (ROAD_HALF_WIDTH + setback);
      const height = inTunnel ? 2.55 : heightPattern[i % heightPattern.length];
      const camFrame = track.sampleAt(s, lat);
      const worldPos = camFrame.pos.clone().addScaledVector(camFrame.normal || UP_AXIS, height);

      this._telephotoCams.push({
        id: i,
        s,
        side,
        lat,
        height,
        pos: worldPos,
      });
    }

    // B. Curated Static FIA Apex Kerb Box-Cams (ultra-low y = 0.22m on inside corner kerbs!)
    const candidateApices = [];
    const scanSteps = 200;
    const stepS = TRACK_GAME_LENGTH / scanSteps;
    for (let i = 0; i < scanSteps; i++) {
      const sPrev = wrapTrackS((i - 1) * stepS);
      const sCur = wrapTrackS(i * stepS);
      const sNext = wrapTrackS((i + 1) * stepS);
      if (sCur >= 952 || sCur <= 118) continue; // Skip flat pit straight

      const fPrev = track.sampleAt(sPrev, 0);
      const fCur = track.sampleAt(sCur, 0);
      const fNext = track.sampleAt(sNext, 0);

      const cPrev = Math.abs(fPrev.realCurvature !== undefined ? fPrev.realCurvature * 82.0 : (fPrev.curvature || 0));
      const cCurRaw = fCur.realCurvature !== undefined ? fCur.realCurvature * 82.0 : (fCur.curvature || 0);
      const cCur = Math.abs(cCurRaw);
      const cNext = Math.abs(fNext.realCurvature !== undefined ? fNext.realCurvature * 82.0 : (fNext.curvature || 0));

      if (cCur > 0.08 && cCur >= cPrev && cCur >= cNext) {
        candidateApices.push({ s: sCur, signedCurv: cCurRaw, mag: cCur });
      }
    }

    // Sort strongest corners first & enforce minimum 72 s-unit spacing around loop
    candidateApices.sort((a, b) => b.mag - a.mag);
    const chosenApices = [];
    for (const cand of candidateApices) {
      const tooClose = chosenApices.some((ex) => Math.abs(signedWrapDeltaS(ex.s - cand.s)) < 72.0);
      if (!tooClose) {
        chosenApices.push(cand);
        if (chosenApices.length >= 9) break;
      }
    }

    // Also add 1 chicane/Turn-1 entry kerb cam at s=156 if none near [120..210], plus 1 final-corner exit kerb cam at s=932
    const ensureKerbNear = (sTarget, fallbackSign) => {
      if (!chosenApices.some((ex) => Math.abs(signedWrapDeltaS(ex.s - sTarget)) < 68.0)) {
        const fr = track.sampleAt(sTarget, 0);
        const cRaw = fr.realCurvature !== undefined ? fr.realCurvature * 82.0 : (fr.curvature || fallbackSign * 0.12);
        chosenApices.push({ s: sTarget, signedCurv: Math.abs(cRaw) > 0.02 ? cRaw : fallbackSign * 0.12, mag: 0.12 });
      }
    };
    ensureKerbNear(162.0, 1);
    ensureKerbNear(924.0, 1);
    chosenApices.sort((a, b) => a.s - b.s);

    for (let i = 0; i < chosenApices.length; i++) {
      const ap = chosenApices[i];
      // Positive curvature bends RIGHT (+right = inside apex kerb); Negative bends LEFT (-right = inside apex kerb)
      const insideSign = ap.signedCurv >= 0 ? 1 : -1;
      const kerbLat = insideSign * (ROAD_HALF_WIDTH + 0.36);
      const kerbFrame = track.sampleAt(ap.s, kerbLat);
      const upVec = kerbFrame.normal || UP_AXIS;
      const worldPos = kerbFrame.pos.clone().addScaledVector(upVec, 0.22); // Exact y = 0.22m armoured kerb box-cam!

      // Fixed wide-angle upstream gaze toward turn-in braking zone (~26m real meters upstream)
      const upstreamS = wrapTrackS(ap.s - (26.0 / mPerS));
      const upstreamLat = -insideSign * (ROAD_HALF_WIDTH * 0.28);
      const upstreamFrame = track.sampleAt(upstreamS, upstreamLat);
      const fixedLook = upstreamFrame.pos.clone().addScaledVector(upstreamFrame.normal || UP_AXIS, 0.46);

      this._apexKerbCams.push({
        id: i,
        s: ap.s,
        insideSign,
        pos: worldPos,
        fixedLook,
      });
    }

    // C. Elevated Pit-Wall & Sector Gantry Panoramic Cranes (Mode 7)
    const pitStraightFrame = track.sampleAt(996.0, ROAD_HALF_WIDTH + 2.35);
    this._pitWallCams.push({
      id: 0,
      s: 996.0,
      isMainPitWall: true,
      pos: pitStraightFrame.pos.clone().addScaledVector(UP_AXIS, 3.35),
    });
    for (const secS of [365.0, 685.0]) {
      const cf = track.sampleAt(secS, 0);
      const cRaw = cf.realCurvature !== undefined ? cf.realCurvature * 82.0 : (cf.curvature || 0);
      const side = cRaw >= 0 ? -1 : 1;
      const gf = track.sampleAt(secS, side * (ROAD_HALF_WIDTH + 2.65));
      this._pitWallCams.push({
        id: this._pitWallCams.length,
        s: secS,
        isMainPitWall: false,
        pos: gf.pos.clone().addScaledVector(gf.normal || UP_AXIS, 3.55),
      });
    }
  }

  _selectActiveTelephotoTower(carS, mPerS) {
    const cams = this._telephotoCams;
    const n = cams.length;
    if (n === 0) return null;

    const holdAheadS = 240.0 / mPerS;
    const holdBehindS = -105.0 / mPerS;

    if (this._activeTelephotoIdx >= 0 && this._activeTelephotoIdx < n && !this._cameraJustCut) {
      const cur = cams[this._activeTelephotoIdx];
      const curDelta = signedWrapDeltaS(cur.s - carS);
      if (curDelta >= holdBehindS && curDelta <= holdAheadS) {
        return { cam: cur, switched: false };
      }
    }

    let bestIdx = 0;
    let bestScore = Infinity;
    const minLeadS = -18.0 / mPerS;
    for (let i = 0; i < n; i++) {
      const d = signedWrapDeltaS(cams[i].s - carS);
      const score = d >= minLeadS ? d : (d + TRACK_GAME_LENGTH);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const switched = bestIdx !== this._activeTelephotoIdx || this._cameraJustCut;
    this._activeTelephotoIdx = bestIdx;
    if (switched) {
      this._flybyFiredKey = '';
      this._flybyBuffetTimer = 0;
      this._opInitialized = false;
    }
    return { cam: cams[bestIdx], switched };
  }

  _selectActiveApexKerbCam(carS, mPerS) {
    const cams = this._apexKerbCams;
    const n = cams.length;
    if (n === 0) return null;

    // Hold static kerb cam while car approaches from upstream and screams up to 16m past the lens!
    const pastLimitS = -16.0 / mPerS;
    const aheadLimitS = 145.0 / mPerS;

    if (this._activeKerbCamIdx >= 0 && this._activeKerbCamIdx < n && !this._cameraJustCut) {
      const cur = cams[this._activeKerbCamIdx];
      const curDelta = signedWrapDeltaS(cur.s - carS);
      if (curDelta >= pastLimitS && curDelta <= aheadLimitS) {
        return { cam: cur, switched: false };
      }
    }

    let bestIdx = 0;
    let bestScore = Infinity;
    const minAheadS = -6.0 / mPerS;
    for (let i = 0; i < n; i++) {
      const d = signedWrapDeltaS(cams[i].s - carS);
      const score = d >= minAheadS ? d : (d + TRACK_GAME_LENGTH);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const switched = bestIdx !== this._activeKerbCamIdx || this._cameraJustCut;
    this._activeKerbCamIdx = bestIdx;
    if (switched) {
      this._flybyFiredKey = '';
      this._flybyBuffetTimer = 0;
    }
    return { cam: cams[bestIdx], switched };
  }

  // --------------------------------------------------------------------------
  // 7. SPRUNG CHASSIS BASIS & CRITICALLY-DAMPED CAMERA-OPERATOR PHYSICS
  // --------------------------------------------------------------------------
  _computeCarAndSprungBasis(focusCar, focusFrame, focusRig) {
    const yaw = finiteOr(focusCar.relYaw, 0);
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    this._carFwd
      .copy(focusFrame.tangent)
      .multiplyScalar(cosY)
      .addScaledVector(focusFrame.right, sinY)
      .normalize();
    this._carRight.crossVectors(this._carFwd, focusFrame.normal).normalize();
    this._carUp.crossVectors(this._carRight, this._carFwd).normalize();

    if (focusRig?.chassisTiltGroup && focusRig?.root) {
      focusRig.root.updateMatrixWorld(true);
      this._sprungBasisMat.copy(focusRig.chassisTiltGroup.matrixWorld);
      return;
    }

    // Analytical sprung-chassis matrix matching FormulaCarRig.chassisTiltGroup (+X=Right, +Y=Up, -Z=Forward)
    this._negFwd.copy(this._carFwd).negate();
    this._sprungBasisMat.makeBasis(this._carRight, this._carUp, this._negFwd);
    this._sprungQuat.setFromRotationMatrix(this._sprungBasisMat);

    const pitch = finiteOr(focusCar.chassisPitchRad, 0) + finiteOr(focusCar.pitJackLift, 0) * 0.042;
    const roll = finiteOr(focusCar.chassisRollRad, 0);
    this._sprungTiltEuler.set(pitch, 0, roll, 'XYZ');
    this._sprungTiltQuat.setFromEuler(this._sprungTiltEuler);
    this._sprungQuat.multiply(this._sprungTiltQuat);

    const heave = finiteOr(focusCar.chassisHeaveM, 0) + finiteOr(focusCar.pitJackLift, 0) * 0.18;
    this._sprungPos.copy(focusFrame.pos).addScaledVector(this._carUp, heave);
    this._sprungBasisMat.compose(this._sprungPos, this._sprungQuat, this._tmpVecA.set(1, 1, 1));
  }

  _sprungLocalToWorld(lx, ly, lz, outVec) {
    return outVec.set(lx, ly, lz).applyMatrix4(this._sprungBasisMat);
  }

  // 2nd-order critically-damped human camera-operator pan/tilt tracking filter
  _stepOperatorAim(rawDt, camPos, desiredLook, omega = 14.5, zeta = 0.94, snap = false) {
    this._tmpVecA.subVectors(desiredLook, camPos);
    const dist = Math.max(0.5, this._tmpVecA.length());
    this._tmpVecA.multiplyScalar(1.0 / dist);

    if (snap || !this._opInitialized) {
      this._opAimDir.copy(this._tmpVecA);
      this._opAimVel.set(0, 0, 0);
      this._opInitialized = true;
    } else if (!this.paused) {
      const stepDt = Math.min(0.05, rawDt);
      const w2 = omega * omega;
      const damp = 2.0 * zeta * omega;
      // Spring-damper in tangent direction space
      const ax = (this._tmpVecA.x - this._opAimDir.x) * w2 - this._opAimVel.x * damp;
      const ay = (this._tmpVecA.y - this._opAimDir.y) * w2 - this._opAimVel.y * damp;
      const az = (this._tmpVecA.z - this._opAimDir.z) * w2 - this._opAimVel.z * damp;

      this._opAimVel.x += ax * stepDt;
      this._opAimVel.y += ay * stepDt;
      this._opAimVel.z += az * stepDt;

      this._opAimDir.x += this._opAimVel.x * stepDt;
      this._opAimDir.y += this._opAimVel.y * stepDt;
      this._opAimDir.z += this._opAimVel.z * stepDt;
      this._opAimDir.normalize();
    } else {
      // Smooth scrub responsiveness while paused
      this._opAimDir.lerp(this._tmpVecA, Math.min(1, rawDt * 18.0)).normalize();
    }

    return this._camSmoothedLook.copy(camPos).addScaledVector(this._opAimDir, dist);
  }

  // Trigger aerodynamic wake blast shudder + Doppler audio on < 14m close flybys
  _computeAeroBlastShudder(rawDt, stationKey, distWorldM, speedKmh, exploded, maxBlastM, maxAmpM, callbacks) {
    if (this._flybyFiredKey === stationKey && distWorldM > maxBlastM * 1.45) {
      this._flybyFiredKey = '';
    }

    if (
      !this.paused &&
      !exploded &&
      distWorldM < Math.min(9.5, maxBlastM * 0.72) &&
      speedKmh > 55 &&
      this._flybyFiredKey !== stationKey
    ) {
      this._flybyFiredKey = stationKey;
      this._flybyBuffetTimer = 0.28;
      this._flybyBuffetStrength = clamp(speedKmh / 310.0, 0.28, 1.15) * maxAmpM;
      callbacks?.onFlyby?.(speedKmh);
    }

    let sx = 0;
    let sy = 0;
    if (!this.paused && !exploded && distWorldM < maxBlastM && speedKmh > 55) {
      const prox = clamp(1.0 - distWorldM / maxBlastM, 0, 1);
      const spdScale = clamp(speedKmh / 305.0, 0.25, 1.2);
      const amp = prox * prox * spdScale * maxAmpM * 0.85;
      const ph = this.playheadSec * 132.0;
      sy += Math.sin(ph) * amp;
      sx += Math.cos(ph * 0.83) * amp * 0.62;
    }
    if (!this.paused && this._flybyBuffetTimer > 0) {
      this._flybyBuffetTimer = Math.max(0, this._flybyBuffetTimer - rawDt);
      const env = (this._flybyBuffetTimer / 0.28) * this._flybyBuffetStrength;
      sy += Math.sin(this._flybyBuffetTimer * 142.0) * env;
      sx += Math.cos(this._flybyBuffetTimer * 112.0) * env * 0.58;
    }
    return { sx, sy };
  }

  // --------------------------------------------------------------------------
  // 8. 8-MODE FOM WORLD-FEED BROADCAST CAMERA DIRECTOR
  // --------------------------------------------------------------------------
  _updateBroadcastCamera(rawDt, { track, camera, focusCar, focusFrame, focusRig, numCars, callbacks }) {
    this._ensureBroadcastStations(track);
    this._computeCarAndSprungBasis(focusCar, focusFrame, focusRig);

    const mPerS = getMetersPerGameUnit(track);
    const carPos = focusFrame.pos;
    const isPortrait = (camera.aspect || 1.5) < 0.85;
    const actionEval = this.scoreActionIntensity(focusCar, focusFrame, this._interpCarPool, track);

    // Resolve active concrete camera rig [1..7]
    let mode = this.cameraModeIdx;
    if (this.cameraModeIdx === 0 && this.autoDirector) {
      if (!this.paused) {
        this._directorCutHoldTimer = Math.max(0, this._directorCutHoldTimer - rawDt);
        this._directorShotElapsed += rawDt;
      }

      // Never cut away mid-flyby if currently on Trackside Telephoto within 22m of tower!
      let midTelephotoFlyby = false;
      if (this._directorActiveMode === 1 && this._activeTelephotoIdx >= 0 && this._activeTelephotoIdx < this._telephotoCams.length) {
        const curTower = this._telephotoCams[this._activeTelephotoIdx];
        if (curTower.pos.distanceTo(carPos) < 22.0) midTelephotoFlyby = true;
      }

      if (this._directorCutHoldTimer <= 0 && !midTelephotoFlyby) {
        let nextMode = actionEval.recommendedMode;
        // Broadcast variety: if a passive shot has held > 7.2s, cut cleanly to an alternate FOM angle
        if (nextMode === this._directorActiveMode && this._directorShotElapsed > 7.2 && actionEval.score < 70) {
          nextMode = this._directorActiveMode === 1 ? 4 : 1;
        }
        if (nextMode < 1 || nextMode >= REPLAY_CAMERA_MODES.length) nextMode = 1;

        if (nextMode !== this._directorActiveMode || this._directorShotElapsed === 0) {
          this._directorActiveMode = nextMode;
          this._directorShotElapsed = 0.001;
          this._cameraJustCut = true;
          this._opInitialized = false;
        }
        // Strictly enforce 2.4s - 4.2s minimum broadcast shot hold — zero frantic rapid cuts!
        this._directorCutHoldTimer = clamp(actionEval.holdDurationSec, 2.4, 4.2);
      }

      mode = clamp(this._directorActiveMode, 1, REPLAY_CAMERA_MODES.length - 1);
    } else {
      mode = clamp(this.cameraModeIdx === 0 ? 1 : this.cameraModeIdx, 1, REPLAY_CAMERA_MODES.length - 1);
      this._directorActiveMode = mode;
    }

    camera.up.set(0, 1, 0);

    // ------------------------------------------------------------------------
    // MODE 1: TRACKSIDE TELEPHOTO (70-400mm Optical Zoom FOV 15°-34° + Operator Inertia + <14m Shudder)
    // ------------------------------------------------------------------------
    if (mode === 1) {
      const sel = this._selectActiveTelephotoTower(focusCar.s, mPerS);
      if (sel && sel.cam) {
        const tower = sel.cam;
        const distWorldM = tower.pos.distanceTo(carPos);
        const deltaLongM = signedWrapDeltaS(tower.s - focusCar.s) * mPerS;

        const { sx, sy } = this._computeAeroBlastShudder(
          rawDt,
          `TELE_${tower.id}`,
          distWorldM,
          focusCar.speedKmh,
          focusCar.exploded,
          14.0,
          0.042,
          callbacks
        );

        // Subtle long-lens monopod micro-breathing at extreme telephoto (< 20° FOV)
        const teleBreath = !this.paused
          ? Math.sin(this.playheadSec * 2.35) * 0.012 * clamp((22.0 - this._currentFov) / 8.0, 0, 1)
          : 0;

        this._camDesiredPos.copy(tower.pos);
        this._camDesiredPos.x += sx;
        this._camDesiredPos.y += sy;

        // Lead car nose slightly on approach (+deltaLongM), settle onto rear wing/diffuser on exit
        const leadM = clamp(deltaLongM * 0.032, -0.9, 1.5);
        this._camDesiredLook
          .copy(carPos)
          .addScaledVector(this._carUp, 0.56 + teleBreath + sy * 0.35)
          .addScaledVector(this._carFwd, leadM);

        // True 70-400mm optical focal-length zoom: 15° tight compression afar -> 34° wide at closest pass!
        const minFov = isPortrait ? 18.0 : 15.0;
        const maxFov = isPortrait ? 38.0 : 34.0;
        const rawOpticalFov = 2.0 * Math.atan2(5.2, Math.max(9.5, distWorldM)) * RAD2DEG;
        const targetFov = clamp(rawOpticalFov, minFov, maxFov);

        camera.position.copy(this._camDesiredPos);
        const aimTarget = this._stepOperatorAim(
          rawDt,
          camera.position,
          this._camDesiredLook,
          distWorldM < 22.0 ? 15.5 : 12.8,
          0.93,
          sel.switched
        );

        if (sel.switched) {
          this._currentFov = targetFov;
        } else {
          const zoomAlpha = 1.0 - Math.exp(-rawDt * 8.5);
          this._currentFov = lerp(this._currentFov, targetFov, zoomAlpha);
        }

        camera.lookAt(aimTarget);
        this._applyCameraLens(camera, this._currentFov, 0.32);
        this._cameraJustCut = false;
        return;
      }
    }

    // ------------------------------------------------------------------------
    // MODE 2: STATIC APEX KERB CAM (Ultra-Low y = 0.22m Fixed Inside-Kerb Box-Cam!)
    // ------------------------------------------------------------------------
    if (mode === 2) {
      const sel = this._selectActiveApexKerbCam(focusCar.s, mPerS);
      if (sel && sel.cam) {
        const kerbCam = sel.cam;
        const distWorldM = kerbCam.pos.distanceTo(carPos);

        // Violent ground-level aerodynamic blast shudder as car screams inches past the y=0.22m lens!
        const { sx, sy } = this._computeAeroBlastShudder(
          rawDt,
          `KERB_${kerbCam.id}`,
          distWorldM,
          focusCar.speedKmh,
          focusCar.exploded,
          9.5,
          0.032,
          callbacks
        );

        this._camDesiredPos.copy(kerbCam.pos);
        this._camDesiredPos.x += sx * 0.7;
        this._camDesiredPos.y = Math.max(0.16, kerbCam.pos.y + sy);

        // Fixed armoured kerb box-cam orientation with subtle 18% gaze bias so car stays centered on approach
        this._camDesiredLook.copy(kerbCam.fixedLook);
        if (distWorldM < 65.0 && signedWrapDeltaS(kerbCam.s - focusCar.s) >= -2.5 / mPerS) {
          this._tmpVecB.copy(carPos).addScaledVector(this._carUp, 0.44);
          this._camDesiredLook.lerp(this._tmpVecB, 0.22);
        }

        const targetFov = isPortrait ? 70.0 : 62.0;
        if (sel.switched) {
          this._camSmoothedLook.copy(this._camDesiredLook);
          this._currentFov = targetFov;
        } else {
          this._camSmoothedLook.lerp(this._camDesiredLook, 1.0 - Math.exp(-rawDt * 9.0));
          this._currentFov = targetFov;
        }

        camera.position.copy(this._camDesiredPos);
        camera.lookAt(this._camSmoothedLook);
        this._applyCameraLens(camera, this._currentFov, 0.10);
        this._cameraJustCut = false;
        return;
      }
    }

    // ------------------------------------------------------------------------
    // MODE 3: HELICOPTER CINEFLEX (High-Altitude Gyro-Stabilized Orbital Aerial Pursuit)
    // ------------------------------------------------------------------------
    if (mode === 3) {
      const heliRate = this.paused ? 0.08 : Math.max(0.18, 0.24 * Math.min(1.35, this.playbackSpeed));
      this._heliPhase = (this._heliPhase + rawDt * heliRate) % (Math.PI * 2);

      const tunnelRange = track.trackDef?.tunnelRangeS || null;
      const nearTunnel = !!(tunnelRange && focusCar.s >= tunnelRange[0] - 20 && focusCar.s <= tunnelRange[1] + 20);

      const backDist = 34.0;
      const sideDist = nearTunnel
        ? 28.0
        : Math.sin(this._heliPhase) * 26.0 + 6.0 * Math.cos(this._heliPhase * 0.5);
      const upHeight = 42.0 + Math.cos(this._heliPhase * 0.7) * 3.5;

      this._camDesiredPos
        .copy(carPos)
        .addScaledVector(focusFrame.tangent, -backDist)
        .addScaledVector(focusFrame.right, sideDist)
        .addScaledVector(UP_AXIS, upHeight);

      // Frame multi-car battle packs cleanly (weighted centroid of rivals within 42m)
      this._packBattleOffset.set(0, 0, 0);
      let totalWeight = 0;
      let maxSpreadM = 0;
      for (let i = 0; i < numCars; i++) {
        if (i === this.focusCarIndex) continue;
        const otherCar = this._interpCarPool[i];
        const otherFrame = this._interpFramesScratch[i];
        if (!otherCar || !otherFrame || otherCar.exploded) continue;
        const dM = otherFrame.pos.distanceTo(carPos);
        if (dM < 44.0) {
          const w = (1.0 - dM / 44.0) * 0.35;
          this._tmpVecA.subVectors(otherFrame.pos, carPos).multiplyScalar(w);
          this._packBattleOffset.add(this._tmpVecA);
          totalWeight += w;
          if (dM > maxSpreadM) maxSpreadM = dM;
        }
      }
      if (totalWeight > 0.45) {
        this._packBattleOffset.multiplyScalar(0.45 / totalWeight);
      }

      this._camDesiredLook
        .copy(carPos)
        .add(this._packBattleOffset)
        .addScaledVector(focusFrame.tangent, 12.5)
        .addScaledVector(UP_AXIS, 0.95);

      const packZoomOut = clamp(maxSpreadM / 42.0, 0, 1) * 4.5;
      const targetFov = (isPortrait ? 33.0 : 26.5) + packZoomOut;

      if (this._cameraJustCut) {
        this._camSmoothedPos.copy(this._camDesiredPos);
        this._camSmoothedLook.copy(this._camDesiredLook);
        this._currentFov = targetFov;
      } else {
        const posAlpha = 1.0 - Math.exp(-rawDt * 4.6);
        const lookAlpha = 1.0 - Math.exp(-rawDt * 6.8);
        this._camSmoothedPos.lerp(this._camDesiredPos, posAlpha);
        this._camSmoothedLook.lerp(this._camDesiredLook, lookAlpha);
        this._currentFov = lerp(this._currentFov, targetFov, posAlpha);
      }

      camera.position.copy(this._camSmoothedPos);
      camera.lookAt(this._camSmoothedLook);
      this._applyCameraLens(camera, this._currentFov, 0.32);
      this._cameraJustCut = false;
      return;
    }

    // ------------------------------------------------------------------------
    // MODE 4: FOM HALO T-CAM (-8.5cm Left-Offset Broadcast Roll-Hoop Onboard!)
    // ------------------------------------------------------------------------
    if (mode === 4) {
      const curbVib = (!this.paused && focusCar.onCurb && focusCar.speedKmh > 45)
        ? Math.sin(this.playheadSec * 84.0) * 0.0045
        : 0;

      // Exact -8.5cm left-offset FOM roll-hoop pod bolted to sprung chassis:
      // Shows Halo hoop, driver helmet, live OLED steering wheel, and both front wishbones/slicks!
      this._sprungLocalToWorld(-0.085, 0.935 + curbVib, 0.16, this._camDesiredPos);
      this._sprungLocalToWorld(
        -0.04 + (focusCar.steerInput || 0) * 0.75,
        -0.62,
        -15.0,
        this._camDesiredLook
      );

      // Couple camera up-axis to sprung chassis roll for true onboard broadcast horizon tilt
      this._sprungLocalToWorld(-0.085, 1.935, 0.16, this._tmpVecA);
      camera.up.subVectors(this._tmpVecA, this._camDesiredPos).normalize();

      const targetFov = isPortrait ? 72.0 : 64.5;
      this._currentFov = targetFov;

      camera.position.copy(this._camDesiredPos);
      camera.lookAt(this._camDesiredLook);
      this._applyCameraLens(camera, this._currentFov, 0.12);
      this._cameraJustCut = false;
      return;
    }

    // ------------------------------------------------------------------------
    // MODE 5: REAR GEARBOX / DIFFUSER CAM (Low Rear-Facing Slipstream Battle Cam!)
    // ------------------------------------------------------------------------
    if (mode === 5) {
      const kerbVib = (!this.paused && focusCar.onCurb && focusCar.speedKmh > 45)
        ? Math.sin(this.playheadSec * 96.0) * 0.004
        : 0;
      const rpmVib = (!this.paused && focusCar.rpm > 10500)
        ? Math.sin(this.playheadSec * 135.0) * 0.0018
        : 0;

      // Subtle lateral gaze tracking toward closest pursuing rival weaving in slipstream
      let rivalLookX = 0.0;
      let bestBehindDist = 36.0;
      for (let i = 0; i < numCars; i++) {
        if (i === this.focusCarIndex) continue;
        const other = this._interpCarPool[i];
        if (!other || other.exploded) continue;
        const dLongM = signedWrapDeltaS(other.s - focusCar.s) * mPerS;
        if (dLongM < -1.5 && Math.abs(dLongM) < bestBehindDist) {
          bestBehindDist = Math.abs(dLongM);
          const dLat = clamp((other.lateralOffset || 0) - (focusCar.lateralOffset || 0), -4.5, 4.5);
          // Note: looking backward (+Z), +X in chassis frame is driver's right (screen left)
          rivalLookX = dLat * 0.32;
        }
      }

      // Mounted in coke-bottle channel above diffuser beside FIA rear rain-light, looking straight back (+Z)
      this._sprungLocalToWorld(0.22, 0.50 + kerbVib + rpmVib, 1.88, this._camDesiredPos);
      this._sprungLocalToWorld(rivalLookX, 0.44, 22.0, this._camDesiredLook);

      this._sprungLocalToWorld(0.22, 1.50, 1.88, this._tmpVecA);
      camera.up.subVectors(this._tmpVecA, this._camDesiredPos).normalize();

      const targetFov = isPortrait ? 68.0 : 60.0;
      this._currentFov = targetFov;

      camera.position.copy(this._camDesiredPos);
      camera.lookAt(this._camDesiredLook);
      this._applyCameraLens(camera, this._currentFov, 0.10);
      this._cameraJustCut = false;
      return;
    }

    // ------------------------------------------------------------------------
    // MODE 6: FRONT WISHBONE SUSPENSION CAM (Close-Up Inboard Double-Wishbone & Brake Duct Cam!)
    // ------------------------------------------------------------------------
    if (mode === 6) {
      const microVib = (!this.paused && focusCar.onCurb && focusCar.speedKmh > 40)
        ? Math.sin(this.playheadSec * 108.0) * 0.0035
        : 0;

      // Mounted on left monocoque/bargeboard shoulder ahead of sidepod & mirror (-0.43, 0.46, -0.58),
      // framing front-left carbon double-wishbones, pushrod, glowing slotted brake rotor & slick tire!
      this._sprungLocalToWorld(-0.43, 0.46 + microVib, -0.58, this._camDesiredPos);
      this._sprungLocalToWorld(-0.76, 0.30, -2.65, this._camDesiredLook);

      this._sprungLocalToWorld(-0.43, 1.46, -0.58, this._tmpVecA);
      camera.up.subVectors(this._tmpVecA, this._camDesiredPos).normalize();

      const targetFov = isPortrait ? 62.0 : 54.0;
      this._currentFov = targetFov;

      camera.position.copy(this._camDesiredPos);
      camera.lookAt(this._camDesiredLook);
      this._applyCameraLens(camera, this._currentFov, 0.10);
      this._cameraJustCut = false;
      return;
    }

    // ------------------------------------------------------------------------
    // MODE 7: PIT-WALL PANORAMIC FLYBY (Elevated Pit-Wall Broadcast Crane Across Start/Finish!)
    // ------------------------------------------------------------------------
    const onMainPitStraight = focusCar.s >= 862.0 || focusCar.s <= 158.0;
    let pitStation = this._pitWallCams[0];
    if (!onMainPitStraight && this._pitWallCams.length > 1) {
      let bestGantry = this._pitWallCams[1];
      let bestDist = Infinity;
      for (let i = 1; i < this._pitWallCams.length; i++) {
        const d = Math.abs(signedWrapDeltaS(this._pitWallCams[i].s - focusCar.s));
        if (d < bestDist) {
          bestDist = d;
          bestGantry = this._pitWallCams[i];
        }
      }
      pitStation = bestGantry;
    }

    if (pitStation) {
      const switchedStation = pitStation.id !== this._activePitWallIdx || this._cameraJustCut;
      this._activePitWallIdx = pitStation.id;
      if (switchedStation) {
        this._opInitialized = false;
        this._flybyFiredKey = '';
      }

      const distWorldM = pitStation.pos.distanceTo(carPos);
      const deltaLongM = signedWrapDeltaS(pitStation.s - focusCar.s) * mPerS;

      const { sx, sy } = this._computeAeroBlastShudder(
        rawDt,
        `PITWALL_${pitStation.id}`,
        distWorldM,
        focusCar.speedKmh,
        focusCar.exploded,
        15.0,
        0.036,
        callbacks
      );

      this._camDesiredPos.copy(pitStation.pos);
      this._camDesiredPos.x += sx;
      this._camDesiredPos.y += sy;

      const whipLeadM = clamp(deltaLongM * 0.038, -1.1, 1.8);
      this._camDesiredLook
        .copy(carPos)
        .addScaledVector(this._carUp, 0.62 + sy * 0.3)
        .addScaledVector(this._carFwd, whipLeadM);

      // Panoramic crane optical zoom: tight 18° down the straight -> 44° whip-pan across Start/Finish -> 18° into Turn 1
      const minFov = isPortrait ? 22.0 : 18.0;
      const maxFov = isPortrait ? 50.0 : 44.0;
      const rawFov = 2.0 * Math.atan2(6.8, Math.max(9.0, distWorldM)) * RAD2DEG;
      const targetFov = clamp(rawFov, minFov, maxFov);

      camera.position.copy(this._camDesiredPos);
      const aimTarget = this._stepOperatorAim(
        rawDt,
        camera.position,
        this._camDesiredLook,
        distWorldM < 26.0 ? 18.0 : 13.5,
        0.92,
        switchedStation
      );

      if (switchedStation) {
        this._currentFov = targetFov;
      } else {
        this._currentFov = lerp(this._currentFov, targetFov, 1.0 - Math.exp(-rawDt * 9.5));
      }

      camera.lookAt(aimTarget);
      this._applyCameraLens(camera, this._currentFov, 0.32);
      this._cameraJustCut = false;
    }
  }

  _applyCameraLens(camera, desiredFov, desiredNear = 0.32) {
    const clampedFov = clamp(desiredFov, 12.0, 90.0);
    let dirty = false;
    if (Math.abs(camera.fov - clampedFov) > 0.02) {
      camera.fov = clampedFov;
      dirty = true;
    }
    if (Math.abs(camera.near - desiredNear) > 0.005) {
      camera.near = desiredNear;
      dirty = true;
    }
    if (dirty) {
      camera.updateProjectionMatrix();
    }
  }

  // --------------------------------------------------------------------------
  // 9. SELF-CONTAINED FOM WORLD-FEED TV GRAPHICS LAYER (#replay-overlay)
  // --------------------------------------------------------------------------
  _ensureBroadcastDOM() {
    if (typeof document === 'undefined') return null;

    const overlay = document.getElementById('replay-overlay');
    if (!overlay) return null;

    if (!document.getElementById('fom-replay-tv-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'fom-replay-tv-styles';
      styleEl.textContent = FOM_BROADCAST_CSS;
      document.head.appendChild(styleEl);
    }

    if (this._domRefs && this._domRefs.overlay === overlay && overlay.contains(this._domRefs.root)) {
      return this._domRefs;
    }

    overlay.classList.add('fom-enhanced');

    // 1. Top-Left Official Broadcast Circuit & Lap Pill inside .replay-top-row
    const topRow = overlay.querySelector('.replay-top-row');
    const liveBadge = overlay.querySelector('.replay-live-badge');
    if (liveBadge) {
      liveBadge.innerHTML = '<i></i> F1 REPLAY';
    }

    let circuitLapPill = document.getElementById('fom-circuit-lap-pill');
    if (!circuitLapPill && topRow) {
      circuitLapPill = document.createElement('span');
      circuitLapPill.id = 'fom-circuit-lap-pill';
      circuitLapPill.textContent = 'GRAND PRIX • LAP 1/5';
      if (liveBadge && liveBadge.nextSibling) {
        topRow.insertBefore(circuitLapPill, liveBadge.nextSibling);
      } else {
        topRow.appendChild(circuitLapPill);
      }
    }

    // 2. Main FOM TV HUD Root (Left Timing Tower + Bottom Driver Telemetry Bug)
    let hudRoot = document.getElementById('fom-tv-hud-root');
    if (hudRoot) hudRoot.remove();

    hudRoot = document.createElement('div');
    hudRoot.id = 'fom-tv-hud-root';

    // 2A. FOM Left Timing Tower (P1..P8 clickable driver rows)
    const tower = document.createElement('aside');
    tower.id = 'fom-timing-tower';
    tower.setAttribute('aria-label', 'FOM Live Timing Tower');

    const towerHeader = document.createElement('div');
    towerHeader.className = 'fom-tower-header';
    const headerTag = document.createElement('span');
    headerTag.className = 'fom-tag';
    headerTag.textContent = 'F1 STANDINGS';
    const headerLap = document.createElement('span');
    headerLap.className = 'fom-lap';
    headerLap.textContent = 'L1/5';
    towerHeader.append(headerTag, headerLap);

    const rowsContainer = document.createElement('div');
    rowsContainer.className = 'fom-tower-rows';

    const towerRows = [];
    for (let r = 0; r < 8; r++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fom-tower-row';
      btn.title = 'Click to switch TV Broadcast focus to this driver';

      const posEl = document.createElement('span');
      posEl.className = 'fom-row-pos';
      posEl.textContent = String(r + 1);

      const barEl = document.createElement('span');
      barEl.className = 'fom-row-team-bar';

      const codeEl = document.createElement('span');
      codeEl.className = 'fom-row-code';
      codeEl.textContent = '---';

      const gapEl = document.createElement('span');
      gapEl.className = 'fom-row-gap';
      gapEl.textContent = r === 0 ? 'LEADER' : '+0.000';

      const tireEl = document.createElement('span');
      tireEl.className = 'fom-row-tire';
      tireEl.textContent = 'S';

      btn.append(posEl, barEl, codeEl, gapEl, tireEl);

      const rowRef = {
        btn,
        posEl,
        barEl,
        codeEl,
        gapEl,
        tireEl,
        carId: '',
        lastPos: '',
        lastHex: '',
        lastCode: '',
        lastGap: '',
        lastGapCls: '',
        lastTire: '',
        lastFocused: false,
        lastPlayer: false,
        lastSep: false,
        visible: true,
      };

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (rowRef.carId) {
          this.setFocusCarById(rowRef.carId);
        }
      });

      rowsContainer.appendChild(btn);
      towerRows.push(rowRef);
    }

    tower.append(towerHeader, rowsContainer);

    // 2B. FOM Bottom Driver Telemetry Bug (Driver/Team + RPM Arc/Speed/Gear + Throttle/Brake/DRS)
    const telWrap = document.createElement('div');
    telWrap.id = 'fom-telemetry-wrap';

    const telBug = document.createElement('div');
    telBug.id = 'fom-telemetry-bug';

    // Left Driver Identity Block
    const telDriver = document.createElement('div');
    telDriver.className = 'fom-tel-driver';

    const telTopLine = document.createElement('div');
    telTopLine.className = 'fom-tel-top-line';
    const telPosBadge = document.createElement('span');
    telPosBadge.className = 'fom-tel-pos-badge';
    telPosBadge.textContent = 'P1';
    const telNum = document.createElement('span');
    telNum.className = 'fom-tel-num';
    telNum.textContent = '#1';
    const telName = document.createElement('span');
    telName.className = 'fom-tel-name';
    telName.textContent = 'YOU';
    telTopLine.append(telPosBadge, telNum, telName);

    const telTeam = document.createElement('div');
    telTeam.className = 'fom-tel-team';
    telTeam.textContent = 'SCUDERIA PHANATIC';

    const telCamFeed = document.createElement('div');
    telCamFeed.className = 'fom-tel-cam-feed';
    telCamFeed.textContent = 'TV AUTO • TRACKSIDE TELEPHOTO';

    telDriver.append(telTopLine, telTeam, telCamFeed);

    // Center SVG RPM Arc + Speed + Gear Dial
    const telDial = document.createElement('div');
    telDial.className = 'fom-tel-dial';
    const arcLen = 152.0;
    telDial.innerHTML = `
      <svg viewBox="0 0 126 68" aria-hidden="true">
        <path d="M 13 61 A 50 50 0 0 1 113 61" fill="none" stroke="rgba(255,255,255,0.13)" stroke-width="6.5" stroke-linecap="round"></path>
        <path id="fom-rpm-arc-path" d="M 13 61 A 50 50 0 0 1 113 61" fill="none" stroke="#00e676" stroke-width="6.5" stroke-linecap="round" stroke-dasharray="${arcLen}" stroke-dashoffset="${arcLen}"></path>
      </svg>
    `;
    const dialReadout = document.createElement('div');
    dialReadout.className = 'fom-dial-readout';

    const speedWrap = document.createElement('div');
    speedWrap.className = 'fom-dial-speed-wrap';
    const speedValEl = document.createElement('span');
    speedValEl.className = 'fom-dial-speed';
    speedValEl.textContent = '0';
    const speedUnitEl = document.createElement('span');
    speedUnitEl.className = 'fom-dial-unit';
    speedUnitEl.textContent = 'KM/H';
    speedWrap.append(speedValEl, speedUnitEl);

    const gearWrap = document.createElement('div');
    gearWrap.className = 'fom-dial-gear-wrap';
    const gearLblEl = document.createElement('span');
    gearLblEl.className = 'fom-dial-gear-lbl';
    gearLblEl.textContent = 'GEAR';
    const gearValEl = document.createElement('span');
    gearValEl.className = 'fom-dial-gear';
    gearValEl.textContent = '1';
    gearWrap.append(gearLblEl, gearValEl);

    dialReadout.append(speedWrap, gearWrap);
    telDial.appendChild(dialReadout);

    const rpmArcPath = telDial.querySelector('#fom-rpm-arc-path');

    // Right Throttle / Brake / DRS / Tire Temp Gauges
    const telGauges = document.createElement('div');
    telGauges.className = 'fom-tel-gauges';

    const makePedalRow = (label, cls) => {
      const row = document.createElement('div');
      row.className = 'fom-pedal-row';
      const lbl = document.createElement('span');
      lbl.className = 'fom-pedal-lbl';
      lbl.textContent = label;
      const trackEl = document.createElement('div');
      trackEl.className = 'fom-pedal-track';
      const fillEl = document.createElement('div');
      fillEl.className = `fom-pedal-fill ${cls}`;
      trackEl.appendChild(fillEl);
      const pctEl = document.createElement('span');
      pctEl.className = 'fom-pedal-pct';
      pctEl.textContent = '0%';
      row.append(lbl, trackEl, pctEl);
      return { row, fillEl, pctEl };
    };

    const thrRow = makePedalRow('THR', 'thr');
    const brkRow = makePedalRow('BRK', 'brk');

    const badgesRow = document.createElement('div');
    badgesRow.className = 'fom-tel-badges';
    const drsPill = document.createElement('span');
    drsPill.className = 'fom-drs-pill';
    drsPill.textContent = 'DRS';

    const tireTempChip = document.createElement('span');
    tireTempChip.className = 'fom-tire-temp-chip';
    const tireTempDot = document.createElement('span');
    tireTempDot.className = 'fom-tire-temp-dot';
    const tireTempTxt = document.createElement('span');
    tireTempTxt.textContent = 'S • 92°C';
    tireTempChip.append(tireTempDot, tireTempTxt);

    badgesRow.append(drsPill, tireTempChip);
    telGauges.append(thrRow.row, brkRow.row, badgesRow);

    telBug.append(telDriver, telDial, telGauges);
    telWrap.appendChild(telBug);

    hudRoot.append(tower, telWrap);

    const transportBar = document.getElementById('replay-transport-bar');
    if (transportBar && transportBar.parentElement === overlay) {
      overlay.insertBefore(hudRoot, transportBar);
    } else {
      overlay.appendChild(hudRoot);
    }

    // 3. Clean-Feed Toggle Button ("TV HUD: ON/OFF") inside #replay-transport-bar + 'H' hotkey
    let cleanBtn = document.getElementById('btn-replay-cleanfeed');
    if (!cleanBtn && transportBar) {
      cleanBtn = document.createElement('button');
      cleanBtn.id = 'btn-replay-cleanfeed';
      cleanBtn.className = 'replay-btn';
      cleanBtn.type = 'button';
      cleanBtn.title = 'Toggle TV Broadcast Graphics Clean Feed (Shortcut: H)';
      cleanBtn.textContent = '📺 TV HUD: ON';
      cleanBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCleanFeed();
      });
      const exitBtn = document.getElementById('btn-replay-exit');
      if (exitBtn && exitBtn.parentElement === transportBar) {
        transportBar.insertBefore(cleanBtn, exitBtn);
      } else {
        transportBar.appendChild(cleanBtn);
      }
    }

    if (!this._keyHandlerBound && typeof window !== 'undefined') {
      this._keyHandlerBound = (e) => {
        if (!this.isPlaying) return;
        const tag = e.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.code === 'KeyH' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          this.toggleCleanFeed();
        }
      };
      window.addEventListener('keydown', this._keyHandlerBound);
    }

    this._domRefs = {
      overlay,
      root: hudRoot,
      circuitLapPill,
      headerLap,
      towerRows,
      telBug,
      telPosBadge,
      telNum,
      telName,
      telTeam,
      telCamFeed,
      rpmArcPath,
      arcLen,
      speedValEl,
      speedUnitEl,
      gearValEl,
      thrFill: thrRow.fillEl,
      thrPct: thrRow.pctEl,
      brkFill: brkRow.fillEl,
      brkPct: brkRow.pctEl,
      drsPill,
      tireTempDot,
      tireTempTxt,
      cleanBtn,
      cache: {},
    };

    this._syncCleanFeedDOM();
    return this._domRefs;
  }

  _syncCleanFeedDOM() {
    if (typeof document === 'undefined') return;
    const overlay = document.getElementById('replay-overlay');
    if (overlay) {
      overlay.classList.toggle('fom-clean-feed', this.cleanFeed);
    }
    const cleanBtn = document.getElementById('btn-replay-cleanfeed');
    if (cleanBtn) {
      cleanBtn.textContent = this.cleanFeed ? '📺 TV HUD: OFF' : '📺 TV HUD: ON';
      cleanBtn.classList.toggle('clean-on', this.cleanFeed);
    }
  }

  _updateBroadcastHUD({ track, numCars, focusCar, activeCamLabel, lap, totalLaps }) {
    const dom = this._ensureBroadcastDOM();
    if (!dom || !focusCar) return;

    const c = dom.cache;
    const clampedLap = Math.min(lap || 1, totalLaps || lap || 1);

    // 1. Top Circuit & Lap Pill + Tower Header
    const circuitTitle = `${formatCircuitBroadcastTitle(track)} • LAP ${clampedLap}/${totalLaps || 5}`;
    if (dom.circuitLapPill && c.circuitTitle !== circuitTitle) {
      dom.circuitLapPill.textContent = circuitTitle;
      c.circuitTitle = circuitTitle;
    }
    const lapShort = `LAP ${clampedLap}/${totalLaps || 5}`;
    if (c.lapShort !== lapShort) {
      dom.headerLap.textContent = lapShort;
      c.lapShort = lapShort;
    }

    // 2. Sort active interpolated cars by recorded race position (1..N)
    const sorted = this._liveStandingsScratch;
    sorted.length = numCars;
    for (let i = 0; i < numCars; i++) {
      sorted[i] = this._interpCarPool[i];
    }
    sorted.sort((a, b) => {
      if ((a.position || 99) !== (b.position || 99)) {
        return (a.position || 99) - (b.position || 99);
      }
      return (b.totalDistanceGameM || 0) - (a.totalDistanceGameM || 0);
    });

    const focusRankIdx = sorted.findIndex((car) => car && car.id === focusCar.id);

    // Render up to 8 rows (P1..P8, or P1..P7 + focused driver if focused driver > P8)
    for (let r = 0; r < 8; r++) {
      const row = dom.towerRows[r];
      let carIdxInSorted = r;
      let separated = false;
      if (r === 7 && focusRankIdx >= 8) {
        carIdxInSorted = focusRankIdx;
        separated = true;
      }

      const car = carIdxInSorted < sorted.length ? sorted[carIdxInSorted] : null;
      if (!car) {
        if (row.visible) {
          row.btn.style.display = 'none';
          row.visible = false;
        }
        continue;
      }
      if (!row.visible) {
        row.btn.style.display = 'grid';
        row.visible = true;
      }

      row.carId = car.id;
      const dispPos = String(carIdxInSorted + 1);
      if (row.lastPos !== dispPos) {
        row.posEl.textContent = dispPos;
        row.lastPos = dispPos;
      }

      const hex = car.liveryHex || '#e10600';
      if (row.lastHex !== hex) {
        row.barEl.style.background = hex;
        row.lastHex = hex;
      }

      const code = car.short || 'DRV';
      if (row.lastCode !== code) {
        row.codeEl.textContent = code;
        row.lastCode = code;
      }

      let gapStr = 'LEADER';
      let gapCls = 'fom-row-gap';
      if (car.exploded) {
        gapStr = 'OUT';
        gapCls = 'fom-row-gap retired';
      } else if (car.inPitLane) {
        gapStr = 'IN PIT';
        gapCls = 'fom-row-gap in-pit';
      } else if (carIdxInSorted > 0) {
        const gap = Math.max(0, car.gapToLeader || 0);
        if (car.lapsDown >= 1) {
          gapStr = `+${car.lapsDown}L`;
        } else if (gap >= 10.0) {
          gapStr = `+${gap.toFixed(2)}`;
        } else {
          gapStr = `+${gap.toFixed(3)}`;
        }
      }
      if (row.lastGap !== gapStr) {
        row.gapEl.textContent = gapStr;
        row.lastGap = gapStr;
      }
      if (row.lastGapCls !== gapCls) {
        row.gapEl.className = gapCls;
        row.lastGapCls = gapCls;
      }

      const compMeta = COMPOUND_BADGE_MAP[car.compound] || COMPOUND_BADGE_MAP.SOFT;
      if (row.lastTire !== compMeta.code) {
        row.tireEl.textContent = compMeta.code;
        row.tireEl.style.borderColor = compMeta.color;
        row.tireEl.style.color = compMeta.color;
        row.lastTire = compMeta.code;
      }

      const isFocused = car.id === focusCar.id;
      if (row.lastFocused !== isFocused) {
        row.btn.classList.toggle('focused', isFocused);
        row.lastFocused = isFocused;
      }
      if (row.lastPlayer !== !!car.isPlayer) {
        row.btn.classList.toggle('is-player', !!car.isPlayer);
        row.lastPlayer = !!car.isPlayer;
      }
      if (row.lastSep !== separated) {
        row.btn.classList.toggle('separated', separated);
        row.lastSep = separated;
      }
    }

    // 3. Bottom FOM Driver Telemetry Bug
    const focusHex = focusCar.liveryHex || '#e10600';
    if (c.focusHex !== focusHex) {
      dom.telBug.style.borderLeftColor = focusHex;
      dom.telNum.style.color = focusHex;
      c.focusHex = focusHex;
    }

    const posTxt = `P${focusRankIdx >= 0 ? focusRankIdx + 1 : (focusCar.position || 1)}`;
    if (c.posTxt !== posTxt) {
      dom.telPosBadge.textContent = posTxt;
      c.posTxt = posTxt;
    }

    const numTxt = `#${focusCar.carNum || 1}`;
    if (c.numTxt !== numTxt) {
      dom.telNum.textContent = numTxt;
      c.numTxt = numTxt;
    }

    const cleanDriverName = String(focusCar.name || 'DRIVER')
      .replace(/\s*#\d+\s*/g, '')
      .replace(/\(.*?\)/g, '')
      .trim()
      .toUpperCase();
    if (c.driverName !== cleanDriverName) {
      dom.telName.textContent = cleanDriverName;
      c.driverName = cleanDriverName;
    }

    const teamTxt = focusCar.teamName || 'GRAND PRIX';
    if (c.teamTxt !== teamTxt) {
      dom.telTeam.textContent = teamTxt;
      c.teamTxt = teamTxt;
    }

    if (c.camFeed !== activeCamLabel) {
      dom.telCamFeed.textContent = activeCamLabel;
      c.camFeed = activeCamLabel;
    }

    const useMph = typeof window !== 'undefined' && window.__RACE_PHANATIC_GAME__?.prefs?.speedUnit === 'MPH';
    const dispSpeed = useMph
      ? String(Math.round((focusCar.speedKmh || 0) * 0.621371))
      : String(Math.round(focusCar.speedKmh || 0));
    const unitLbl = useMph ? 'MPH' : 'KM/H';

    if (c.dispSpeed !== dispSpeed) {
      dom.speedValEl.textContent = dispSpeed;
      c.dispSpeed = dispSpeed;
    }
    if (c.unitLbl !== unitLbl) {
      dom.speedUnitEl.textContent = unitLbl;
      c.unitLbl = unitLbl;
    }

    const gearTxt = focusCar.speedKmh < 2 && focusCar.throttle < 0.05 ? 'N' : String(focusCar.gear || 1);
    if (c.gearTxt !== gearTxt) {
      dom.gearValEl.textContent = gearTxt;
      c.gearTxt = gearTxt;
    }

    // RPM Arc (0..13,000 RPM)
    const rpmNorm = clamp((focusCar.rpm || 0) / 13000.0, 0, 1);
    const dashOffset = (dom.arcLen * (1.0 - rpmNorm)).toFixed(1);
    const rpmColor = focusCar.rpm > 11900 ? '#00e5ff' : (focusCar.rpm > 9800 ? '#ff1e2d' : '#00e676');
    if (dom.rpmArcPath && c.dashOffset !== dashOffset) {
      dom.rpmArcPath.setAttribute('stroke-dashoffset', dashOffset);
      c.dashOffset = dashOffset;
    }
    if (dom.rpmArcPath && c.rpmColor !== rpmColor) {
      dom.rpmArcPath.setAttribute('stroke', rpmColor);
      c.rpmColor = rpmColor;
    }

    // Green Throttle & Red Brake Gauges
    const thr01 = clamp(focusCar.throttle || 0, 0, 1);
    const brk01 = clamp(focusCar.brake || 0, 0, 1);
    const thrPctTxt = `${Math.round(thr01 * 100)}%`;
    const brkPctTxt = `${Math.round(brk01 * 100)}%`;

    dom.thrFill.style.transform = `scaleX(${thr01.toFixed(3)})`;
    dom.brkFill.style.transform = `scaleX(${brk01.toFixed(3)})`;
    if (c.thrPctTxt !== thrPctTxt) {
      dom.thrPct.textContent = thrPctTxt;
      c.thrPctTxt = thrPctTxt;
    }
    if (c.brkPctTxt !== brkPctTxt) {
      dom.brkPct.textContent = brkPctTxt;
      c.brkPctTxt = brkPctTxt;
    }

    // DRS Badge + Tire Compound & Live Average Surface Temp (°C)
    const drsOpen = !focusCar.exploded && focusCar.brake < 0.08 && focusCar.damage.rearWing < 0.35 && !!focusCar.drsActive;
    if (c.drsOpen !== drsOpen) {
      dom.drsPill.classList.toggle('active', drsOpen);
      dom.drsPill.textContent = drsOpen ? 'DRS OPEN' : 'DRS';
      c.drsOpen = drsOpen;
    }

    const temps = focusCar.tireTempsC;
    const avgTempC = Math.round(((temps[0] || 90) + (temps[1] || 90) + (temps[2] || 90) + (temps[3] || 90)) * 0.25);
    const compBadge = COMPOUND_BADGE_MAP[focusCar.compound] || COMPOUND_BADGE_MAP.SOFT;
    const tireSummary = `${compBadge.code} • ${avgTempC}°C`;
    if (c.tireSummary !== tireSummary) {
      dom.tireTempDot.style.background = compBadge.color;
      dom.tireTempTxt.textContent = tireSummary;
      c.tireSummary = tireSummary;
    }
  }
}
