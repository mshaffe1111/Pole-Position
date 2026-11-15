// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// World Championship Career Mode, 6 Works Constructor Teams, 5-Branch Car R&D
// Engineering Garage, Sponsor Objectives & Team Principal Strategy System
// ============================================================================

import {
  TRACK_CATALOG,
  TIRE_COMPOUNDS,
  WEATHER_REGIMES,
  PIT_CREW_MODES,
  AI_DRIVER_ROSTER,
  PRO_2026_LENGTHS,
} from './config.js';

export const CAREER_STORAGE_KEY = 'rp_f1_career_v2';
const CAREER_SCHEMA_VERSION = 2;
const STARTING_RND_CREDITS = 150000;

export const FIA_POINTS_SYSTEM = {
  race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  pole: 2,
  fastestLap: 1,
};

// Dynamic Weekend Sponsor Bonus Objectives evaluated in `recordRaceWeekendResult`
export const SPONSOR_OBJECTIVES_CATALOG = [
  {
    id: 'PODIUM_SWEEP',
    title: 'Podium Sweep',
    shortLabel: 'PODIUM TOP-3',
    desc: 'Finish on the Grand Prix Podium (P1–P3)',
    bonus: 20000,
  },
  {
    id: 'CLEAN_CHASSIS',
    title: 'Clean Chassis Bonus',
    shortLabel: 'CLEAN CHASSIS',
    desc: 'Bring the car home cleanly in the points without heavy damage',
    bonus: 18000,
  },
  {
    id: 'OVERTAKE_HUNTER',
    title: 'Overtake Hunter (3+ Passes)',
    shortLabel: '3+ OVERTAKES',
    desc: 'Complete 3 or more on-track passes during the Grand Prix',
    bonus: 15000,
  },
  {
    id: 'FASTEST_LAP_BOUNTY',
    title: 'Fastest Lap Bounty',
    shortLabel: 'FASTEST LAP',
    desc: 'Clock the purple Fastest Lap of the race weekend',
    bonus: 15000,
  },
  {
    id: 'FRONT_ROW_QUALIFIER',
    title: 'Front-Row Qualifier (P1–P2)',
    shortLabel: 'FRONT ROW P1–P2',
    desc: 'Start on the Front Row of the grid (P1 or P2)',
    bonus: 12000,
  },
];

function clamp(val, min, max) {
  if (!Number.isFinite(val)) return min;
  return val < min ? min : (val > max ? max : val);
}

function finiteOr(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function toCssHex(numHex) {
  const safe = clamp(Math.floor(finiteOr(numHex, 0xffffff)), 0, 0xffffff);
  return `#${safe.toString(16).padStart(6, '0')}`;
}

export function formatCredits(amount) {
  const safe = Math.max(0, Math.round(finiteOr(amount, 0)));
  return `$${safe.toLocaleString('en-US')}`;
}

export function formatLapTimeSec(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '--:--.---';
  const mins = Math.floor(sec / 60);
  const rem = sec - mins * 60;
  const whole = Math.floor(rem);
  const ms = Math.round((rem - whole) * 1000);
  const adjWhole = ms === 1000 ? whole + 1 : whole;
  const adjMs = ms === 1000 ? 0 : ms;
  const adjMins = adjWhole >= 60 ? mins + 1 : mins;
  const finalSec = adjWhole >= 60 ? adjWhole - 60 : adjWhole;
  return `${adjMins}:${String(finalSec).padStart(2, '0')}.${String(adjMs).padStart(3, '0')}`;
}

// ============================================================================
// 0A. DRIVER XP & 5-TIER FIA SUPER LICENSE PROGRESSION
// ============================================================================
export const DRIVER_LICENSES_CATALOG = [
  { id: 'ROOKIE_C',      minLevel: 1,  title: 'ROOKIE C',      color: '#38bdf8', shortBadge: 'C' },
  { id: 'NATIONAL_B',    minLevel: 3,  title: 'NATIONAL B',    color: '#22c55e', shortBadge: 'B' },
  { id: 'INTL_A',        minLevel: 6,  title: 'INTL A',        color: '#f59e0b', shortBadge: 'A' },
  { id: 'FIA_PRO',       minLevel: 9,  title: 'FIA PRO',       color: '#a855f7', shortBadge: 'PRO' },
  { id: 'SUPER_LICENSE', minLevel: 13, title: 'SUPER LICENSE', color: '#ffd600', shortBadge: 'SUPER' },
];

function xpStepForLevel(level) {
  const lv = Math.max(1, Math.floor(finiteOr(level, 1)));
  return 400 + (lv - 1) * 150;
}

function computeDriverLevelProfile(rawXp) {
  const xp = Math.max(0, Math.round(finiteOr(rawXp, 0)));
  let level = 1;
  let remaining = xp;
  let stepNeed = xpStepForLevel(level);
  while (remaining >= stepNeed && level < 99) {
    remaining -= stepNeed;
    level += 1;
    stepNeed = xpStepForLevel(level);
  }
  const xpIntoLevel = remaining;
  const xpForNextLevel = stepNeed;
  const progress01 = clamp(xpIntoLevel / Math.max(1, xpForNextLevel), 0, 1);

  let license = DRIVER_LICENSES_CATALOG[0];
  let nextLicense = null;
  for (let i = 0; i < DRIVER_LICENSES_CATALOG.length; i++) {
    if (level >= DRIVER_LICENSES_CATALOG[i].minLevel) {
      license = DRIVER_LICENSES_CATALOG[i];
      nextLicense = DRIVER_LICENSES_CATALOG[i + 1] || null;
    }
  }

  return {
    xp,
    level,
    xpIntoLevel,
    xpForNextLevel,
    progress01,
    licenseId: license.id,
    licenseTitle: license.title,
    rankTitle: license.title,
    licenseColor: license.color,
    licenseBadge: license.shortBadge,
    nextLicenseTitle: nextLicense ? nextLicense.title : null,
  };
}

// ============================================================================
// 0B. 12 FIA CAREER & ARCADE ACHIEVEMENT MILESTONES (+R&D CREDIT REWARDS)
// ============================================================================
export const ACHIEVEMENTS_CATALOG = [
  {
    id: 'FIRST_PODIUM',
    title: 'FIRST PODIUM',
    name: 'First Podium',
    desc: 'Finish on the Grand Prix podium (P1–P3) in any race.',
    icon: '🏆',
    bonus: 25000,
  },
  {
    id: 'FIRST_VICTORY',
    title: 'FIRST VICTORY',
    name: 'First Victory',
    desc: 'Take the checkered flag in P1 to claim a Grand Prix victory.',
    icon: '🥇',
    bonus: 50000,
  },
  {
    id: 'LIGHTNING_START',
    title: 'LIGHTNING START',
    name: 'Lightning Start',
    desc: 'Nail a <0.23s lights-out clutch reaction off the starting grid.',
    icon: '⚡',
    bonus: 20000,
  },
  {
    id: 'OVERTAKE_ACE',
    title: 'OVERTAKE ACE',
    name: 'Overtake Ace',
    desc: 'Complete 5 or more on-track passes in a single race.',
    icon: '🚀',
    bonus: 25000,
  },
  {
    id: 'CLEAN_DRIVER',
    title: 'CLEAN DRIVER',
    name: 'Clean Driver',
    desc: 'Score a top-10 points finish with zero wing or suspension damage.',
    icon: '🛡️',
    bonus: 25000,
  },
  {
    id: 'SPEED_DEMON',
    title: 'SPEED DEMON',
    name: 'Speed Demon',
    desc: 'Break the 325+ km/h slipstream/DRS speed barrier.',
    icon: '🔥',
    bonus: 20000,
  },
  {
    id: 'SUB_22_PIT',
    title: 'SUB-2.25S CREW',
    name: 'Sub-2.25s Pit Stop',
    desc: 'Execute a world-record <2.25s pit stop service.',
    icon: '🔧',
    bonus: 30000,
  },
  {
    id: 'RAIN_MASTER',
    title: 'RAIN MASTER',
    name: 'Rain Master',
    desc: 'Claim a P1–P3 podium finish in wet-weather conditions.',
    icon: '🌧️',
    bonus: 35000,
  },
  {
    id: 'TIME_TRIAL_GOLD',
    title: 'CHRONO GOLD',
    name: 'Time Trial Gold',
    desc: 'Unlock a Gold Medal lap target on any Time Trial circuit.',
    icon: '⏱️',
    bonus: 40000,
  },
  {
    id: 'RND_ENGINEER',
    title: 'CHIEF ENGINEER',
    name: 'R&D Engineer',
    desc: 'Upgrade any factory R&D engineering department to Level 3.',
    icon: '⚙️',
    bonus: 25000,
  },
  {
    id: 'POLE_SITTER',
    title: 'POLE SITTER',
    name: 'Pole Sitter',
    desc: 'Qualify P1 on Pole Position.',
    icon: '🎯',
    bonus: 20000,
  },
  {
    id: 'WORLD_CHAMPION',
    title: 'WORLD CHAMPION',
    name: 'World Champion',
    desc: 'Win the FIA Drivers World Championship trophy.',
    icon: '👑',
    bonus: 120000,
  },
];

// ============================================================================
// 0C. TIME TRIAL CIRCUIT MEDAL TARGETS (GOLD / SILVER / BRONZE) & BONUSES
// ============================================================================
export const TIME_TRIAL_MEDAL_BONUSES = {
  BRONZE: 15000,
  SILVER: 30000,
  GOLD: 60000,
};

export const TIME_TRIAL_MEDALS = {
  FUJI_1982: {
    trackId: 'FUJI_1982',
    name: "Fuji Speedway '82",
    gold: 58.50,
    silver: 62.00,
    bronze: 67.50,
    bonuses: { bronze: 15000, silver: 30000, gold: 60000 },
  },
  MONACO_HARBOR: {
    trackId: 'MONACO_HARBOR',
    name: 'Monte Carlo Harbor',
    gold: 57.80,
    silver: 61.50,
    bronze: 67.00,
    bonuses: { bronze: 15000, silver: 30000, gold: 60000 },
  },
  VEGAS_NEON: {
    trackId: 'VEGAS_NEON',
    name: 'Las Vegas Neon Strip',
    gold: 57.50,
    silver: 61.00,
    bronze: 66.50,
    bonuses: { bronze: 15000, silver: 30000, gold: 60000 },
  },
  MONZA_TEMPLE: {
    trackId: 'MONZA_TEMPLE',
    name: 'Monza Temple of Speed',
    gold: 56.80,
    silver: 60.20,
    bronze: 65.50,
    bonuses: { bronze: 15000, silver: 30000, gold: 60000 },
  },
  SUZUKA_130R: {
    trackId: 'SUZUKA_130R',
    name: 'Suzuka GP Circuit',
    gold: 66.50,
    silver: 70.50,
    bronze: 76.50,
    bonuses: { bronze: 15000, silver: 30000, gold: 60000 },
  },
  SILVERSTONE_GP: {
    trackId: 'SILVERSTONE_GP',
    name: 'Silverstone Abbey',
    gold: 60.50,
    silver: 64.20,
    bronze: 69.80,
    bonuses: { bronze: 15000, silver: 30000, gold: 60000 },
  },
};

// ============================================================================
// 1. 6 PLAYABLE CONSTRUCTOR WORKS TEAMS (LIVERIES & ENGINEERING DNA)
// ============================================================================
export const TEAM_CATALOG = {
  NAMCO_WORKS: {
    id: 'NAMCO_WORKS',
    name: "Namco Scuderia '82",
    shortName: 'NAMCO SCUDERIA',
    code: 'NAM',
    origin: '🇯🇵 Shizuoka / 🇮🇹 Maranello',
    chassisSpec: 'PP-82/26 Heritage Carbon',
    powerUnitSpec: 'Namco V6 Split-Turbo Hybrid',
    primary: 0xe6192e,
    accent: 0xffffff,
    trim: 0xffd600,
    helmet: 0x00d8ff,
    rim: 0xd8dee9,
    primaryHex: toCssHex(0xe6192e),
    accentHex: toCssHex(0xffffff),
    trimHex: toCssHex(0xffd600),
    helmetHex: toCssHex(0x00d8ff),
    rimHex: toCssHex(0xd8dee9),
    livery: {
      primary: 0xe6192e,
      accent: 0xffffff,
      trim: 0xffd600,
      helmet: 0x00d8ff,
      rim: 0xd8dee9,
    },
    perk: 'Balanced Heritage Works',
    perkSummary: '+2.0 km/h Top Speed, +1.5% Aero/Braking & -4% Pit Stop Time',
    description:
      'Flagship factory tribute blending iconic 1982 Fuji crimson-and-white colours with a rock-solid all-circuit engineering baseline.',
    modifiers: {
      powerMult: 1.015,
      topSpeedBonusKmh: 2.0,
      aeroGripMult: 1.015,
      brakeMult: 1.015,
      agilityMult: 1.015,
      tireWearMult: 0.97,
      pitStopDurationMult: 0.96,
      clutchZoneBonus: 0.015,
      wetGripBonus: 0.01,
    },
  },

  APEX_PAPAYA: {
    id: 'APEX_PAPAYA',
    name: 'McLaren-Style Papaya Apex',
    shortName: 'PAPAYA APEX',
    code: 'APX',
    origin: '🇬🇧 Woking Aero Campus',
    chassisSpec: 'APX-26 Low-Drag Carbon',
    powerUnitSpec: 'Apex HPP Twin-Plenum V6',
    primary: 0xff7a00,
    accent: 0x101824,
    trim: 0x00e5ff,
    helmet: 0xffea00,
    rim: 0x1e2634,
    primaryHex: toCssHex(0xff7a00),
    accentHex: toCssHex(0x101824),
    trimHex: toCssHex(0x00e5ff),
    helmetHex: toCssHex(0xffea00),
    rimHex: toCssHex(0x1e2634),
    livery: {
      primary: 0xff7a00,
      accent: 0x101824,
      trim: 0x00e5ff,
      helmet: 0xffea00,
      rim: 0x1e2634,
    },
    perk: 'Straight-Line Aero Slipstream',
    perkSummary: '+4.5 km/h Top Speed, +2.5% MGU-K Deployment & Slipstream DRS Efficiency',
    description:
      'Ultra-clean papaya bodywork engineered to slice down Monza, Fuji, and Las Vegas straights with ferocious DRS tow speed.',
    modifiers: {
      powerMult: 1.025,
      topSpeedBonusKmh: 4.5,
      aeroGripMult: 1.005,
      brakeMult: 1.008,
      agilityMult: 1.008,
      tireWearMult: 0.99,
      pitStopDurationMult: 0.98,
      clutchZoneBonus: 0.012,
      wetGripBonus: 0.0,
    },
  },

  SILVER_ARROW: {
    id: 'SILVER_ARROW',
    name: 'Silver Arrow Motorsport',
    shortName: 'SILVER ARROW',
    code: 'SLV',
    origin: '🇩🇪 Brackley / Stuttgart',
    chassisSpec: 'W17 Zero-Pod Silver Monocoque',
    powerUnitSpec: 'Silberpfeil EQ Power+ V6',
    primary: 0xcfd8e3,
    accent: 0x00d2be,
    trim: 0x11161f,
    helmet: 0x00f5d4,
    rim: 0x9aa6b5,
    primaryHex: toCssHex(0xcfd8e3),
    accentHex: toCssHex(0x00d2be),
    trimHex: toCssHex(0x11161f),
    helmetHex: toCssHex(0x00f5d4),
    rimHex: toCssHex(0x9aa6b5),
    livery: {
      primary: 0xcfd8e3,
      accent: 0x00d2be,
      trim: 0x11161f,
      helmet: 0x00f5d4,
      rim: 0x9aa6b5,
    },
    perk: 'Tire Thermal Whisperer',
    perkSummary: '-10% Tire Deg Rate, Wider Carcass Temp Window & +1.8% Aero Balance',
    description:
      'Precision German-British works contender famed for extending Soft and Medium tire life deep into overcut territory.',
    modifiers: {
      powerMult: 1.012,
      topSpeedBonusKmh: 2.0,
      aeroGripMult: 1.018,
      brakeMult: 1.012,
      agilityMult: 1.012,
      tireWearMult: 0.90,
      pitStopDurationMult: 0.97,
      clutchZoneBonus: 0.015,
      wetGripBonus: 0.012,
    },
  },

  MONACO_ROYALE: {
    id: 'MONACO_ROYALE',
    name: 'Equipe Bleue Royale',
    shortName: 'BLEUE ROYALE',
    code: 'ROY',
    origin: '🇫🇷 Viry-Châtillon / 🇲🇨 Riviera',
    chassisSpec: 'RB-Royale Venturi Ground-Effect',
    powerUnitSpec: 'Royale E-Tech Turbo V6',
    primary: 0x0b5cff,
    accent: 0xff3b8d,
    trim: 0xffffff,
    helmet: 0xff4da6,
    rim: 0xd0daf0,
    primaryHex: toCssHex(0x0b5cff),
    accentHex: toCssHex(0xff3b8d),
    trimHex: toCssHex(0xffffff),
    helmetHex: toCssHex(0xff4da6),
    rimHex: toCssHex(0xd0daf0),
    livery: {
      primary: 0x0b5cff,
      accent: 0xff3b8d,
      trim: 0xffffff,
      helmet: 0xff4da6,
      rim: 0xd0daf0,
    },
    perk: 'High-Downforce Cornering Bite',
    perkSummary: '+4.0% Lateral Aero Grip, -2.5m High-Speed Braking & Apex Stability',
    description:
      'Sculpted Venturi underfloor tunnels plant the front nose on rails through Monte Carlo hairpins and high-G S-curves.',
    modifiers: {
      powerMult: 1.008,
      topSpeedBonusKmh: 0.5,
      aeroGripMult: 1.040,
      brakeMult: 1.020,
      agilityMult: 1.025,
      tireWearMult: 0.98,
      pitStopDurationMult: 0.98,
      clutchZoneBonus: 0.012,
      wetGripBonus: 0.015,
    },
  },

  LOTUS_GOLD: {
    id: 'LOTUS_GOLD',
    name: 'Black & Gold Lotus Heritage',
    shortName: 'LOTUS GOLD',
    code: 'LOT',
    origin: '🇬🇧 Hethel Motorsport',
    chassisSpec: 'Type-79/26 Twin-Chunnel Tub',
    powerUnitSpec: 'Hethel Cosworth-Spec Hybrid V6',
    primary: 0x14161c,
    accent: 0xd4af37,
    trim: 0xf5d76e,
    helmet: 0xd4af37,
    rim: 0xd4af37,
    primaryHex: toCssHex(0x14161c),
    accentHex: toCssHex(0xd4af37),
    trimHex: toCssHex(0xf5d76e),
    helmetHex: toCssHex(0xd4af37),
    rimHex: toCssHex(0xd4af37),
    livery: {
      primary: 0x14161c,
      accent: 0xd4af37,
      trim: 0xf5d76e,
      helmet: 0xd4af37,
      rim: 0xd4af37,
    },
    perk: 'Featherweight Chassis Agility',
    perkSummary: '-3.6m Braking Distance (+4.0% Decel), +4.5% Turn-In & -5% Tire Deg',
    description:
      'Minimum-mass black-and-gold icon engineered for late-braking lunges, razor-sharp chicane direction changes, and nimble kerb riding.',
    modifiers: {
      powerMult: 1.010,
      topSpeedBonusKmh: 1.5,
      aeroGripMult: 1.020,
      brakeMult: 1.040,
      agilityMult: 1.045,
      tireWearMult: 0.95,
      pitStopDurationMult: 0.99,
      clutchZoneBonus: 0.015,
      wetGripBonus: 0.01,
    },
  },

  VERDE_CORSA: {
    id: 'VERDE_CORSA',
    name: 'Aston Verde Racing',
    shortName: 'ASTON VERDE',
    code: 'VRD',
    origin: '🇬🇧 Silverstone Abbey',
    chassisSpec: 'AMR-26 British Racing Green Tub',
    powerUnitSpec: 'Verde Works Turbo MGU-H',
    primary: 0x006b54,
    accent: 0xb7ff00,
    trim: 0xffffff,
    helmet: 0xc8ff00,
    rim: 0x22302c,
    primaryHex: toCssHex(0x006b54),
    accentHex: toCssHex(0xb7ff00),
    trimHex: toCssHex(0xffffff),
    helmetHex: toCssHex(0xc8ff00),
    rimHex: toCssHex(0x22302c),
    livery: {
      primary: 0x006b54,
      accent: 0xb7ff00,
      trim: 0xffffff,
      helmet: 0xc8ff00,
      rim: 0x22302c,
    },
    perk: 'Rapid Pit Crew & Wet Mastery',
    perkSummary: '-9% Pit Stop Time (-0.23s), +3.5% Clutch Sweet-Spot & Wet Grip',
    description:
      'Championship pit-wall choreography and all-weather mechanical grip turn undercut stops and sudden rainstorms into podiums.',
    modifiers: {
      powerMult: 1.010,
      topSpeedBonusKmh: 1.5,
      aeroGripMult: 1.022,
      brakeMult: 1.018,
      agilityMult: 1.018,
      tireWearMult: 0.96,
      pitStopDurationMult: 0.91,
      clutchZoneBonus: 0.035,
      wetGripBonus: 0.035,
    },
  },
};

// ============================================================================
// 2. 5 UPGRADABLE F1 ENGINEERING SUBSYSTEMS (LEVELS 1 TO 5 WITH TELEMETRY DELTAS)
// ============================================================================
export const CAR_PARTS_CATALOG = {
  powertrain: {
    id: 'powertrain',
    name: 'Hybrid Power Unit',
    label: 'POWERTRAIN & MGU-K',
    shortLabel: 'POWER',
    icon: '⚡',
    maxLevel: 5,
    description: 'Boosts V6 ICE + MGU-K acceleration torque and straight-line top speed (+km/h).',
    levels: [
      {
        level: 1,
        name: 'Homologated 1.6L V6 Hybrid ICE',
        partName: 'Homologated 1.6L V6 Hybrid ICE',
        cost: 0,
        powerMult: 1.000,
        topSpeedBonusKmh: 0.0,
        telemetryDelta: '+0.0 km/h Vmax • +0.0% Power',
        summary: '+0.0% Power • +0.0 km/h Top Speed',
      },
      {
        level: 2,
        name: 'Inconel Split-Turbo Exhaust',
        partName: 'Inconel Split-Turbo Exhaust',
        cost: 110000,
        powerMult: 1.016,
        topSpeedBonusKmh: 2.2,
        telemetryDelta: '+2.2 km/h Vmax • +1.6% Torque • -0.08s 0–200',
        summary: '+2.2 km/h Top Speed • +1.6% Power • -0.08s 0–200',
      },
      {
        level: 3,
        name: 'Turbulent Jet Pre-Chamber Ignition',
        partName: 'Turbulent Jet Pre-Chamber Ignition',
        cost: 210000,
        powerMult: 1.032,
        topSpeedBonusKmh: 4.5,
        telemetryDelta: '+4.5 km/h Vmax • +3.2% Torque • -0.16s 0–200',
        summary: '+4.5 km/h Top Speed • +3.2% Power • -0.16s 0–200',
      },
      {
        level: 4,
        name: 'Silicon-Carbide 350kW MGU-K Stator',
        partName: 'Silicon-Carbide 350kW MGU-K Stator',
        cost: 340000,
        powerMult: 1.048,
        topSpeedBonusKmh: 6.8,
        telemetryDelta: '+6.8 km/h Vmax • +4.8% Torque • -0.24s 0–200',
        summary: '+6.8 km/h Top Speed • +4.8% Power • -0.24s 0–200',
      },
      {
        level: 5,
        name: 'Works Spec-5 Cryo-Cooled Power Unit',
        partName: 'Works Spec-5 Cryo-Cooled Power Unit',
        cost: 500000,
        powerMult: 1.065,
        topSpeedBonusKmh: 9.0,
        telemetryDelta: '+9.0 km/h Vmax • +6.5% Torque • -0.32s 0–200',
        summary: '+9.0 km/h Top Speed • +6.5% Power • -0.32s 0–200',
      },
    ],
  },

  aero: {
    id: 'aero',
    name: 'Aerodynamics & Floor',
    label: 'GROUND-EFFECT AERO',
    shortLabel: 'AERO',
    icon: '🌬️',
    maxLevel: 5,
    description: 'Increases Venturi underfloor suction (+% cornering grip), DRS tow (+km/h), and high-speed braking stability (-m).',
    levels: [
      {
        level: 1,
        name: 'FIA Reference Front & Rear Wings',
        partName: 'FIA Reference Front & Rear Wings',
        cost: 0,
        aeroGripMult: 1.000,
        drsBonusKmh: 0.0,
        telemetryDelta: '+0.0% Cornering Grip • +0.0 km/h DRS',
        summary: '+0.0% Lateral Aero Grip',
      },
      {
        level: 2,
        name: 'Outwash Y250 Vortex Endplates',
        partName: 'Outwash Y250 Vortex Endplates',
        cost: 105000,
        aeroGripMult: 1.022,
        drsBonusKmh: 0.8,
        telemetryDelta: '+2.2% Aero Grip • +0.8 km/h DRS • -1.1m Aero Braking',
        summary: '+2.2% Aero Grip • +0.8 km/h DRS Tow • -1.1m Braking',
      },
      {
        level: 3,
        name: 'Ground-Effect Venturi Floor',
        partName: 'Ground-Effect Venturi Floor',
        cost: 205000,
        aeroGripMult: 1.045,
        drsBonusKmh: 1.6,
        telemetryDelta: '+4.5% Aero Grip • +1.6 km/h DRS • -2.3m Aero Braking',
        summary: '+4.5% Aero Grip • +1.6 km/h DRS Tow • -2.3m Braking',
      },
      {
        level: 4,
        name: 'Multi-Element Swan-Neck DRS Wing',
        partName: 'Multi-Element Swan-Neck DRS Wing',
        cost: 335000,
        aeroGripMult: 1.068,
        drsBonusKmh: 2.5,
        telemetryDelta: '+6.8% Aero Grip • +2.5 km/h DRS • -3.4m Aero Braking',
        summary: '+6.8% Aero Grip • +2.5 km/h DRS Tow • -3.4m Braking',
      },
      {
        level: 5,
        name: 'Active Triple-Diffuser Aero Package',
        partName: 'Active Triple-Diffuser Aero Package',
        cost: 495000,
        aeroGripMult: 1.090,
        drsBonusKmh: 3.5,
        telemetryDelta: '+9.0% Aero Grip • +3.5 km/h DRS • -4.5m Aero Braking',
        summary: '+9.0% Aero Grip • +3.5 km/h DRS Tow • -4.5m Braking',
      },
    ],
  },

  chassis: {
    id: 'chassis',
    name: 'Chassis, Suspension & Brakes',
    label: 'CHASSIS & CARBON BRAKES',
    shortLabel: 'CHASSIS',
    icon: '🛞',
    maxLevel: 5,
    description: 'Shortens 300-to-100 km/h braking distance (-m) and sharpens front-axle turn-in agility (+%).',
    levels: [
      {
        level: 1,
        name: 'Standard Carbon-Honeycomb Monocoque',
        partName: 'Standard Carbon-Honeycomb Monocoque',
        cost: 0,
        brakeMult: 1.000,
        agilityMult: 1.000,
        brakingDistDeltaM: 0.0,
        telemetryDelta: '-0.0m Braking • +0.0% Turn-In Agility',
        summary: '+0.0% Braking Decel & Agility',
      },
      {
        level: 2,
        name: 'Pull-Rod Torsion-Bar Suspension',
        partName: 'Pull-Rod Torsion-Bar Suspension',
        cost: 100000,
        brakeMult: 1.020,
        agilityMult: 1.020,
        brakingDistDeltaM: -1.8,
        telemetryDelta: '-1.8m Braking • +2.0% Braking & Kerb Agility',
        summary: '-1.8m Braking Dist • +2.0% Braking & Kerb Agility',
      },
      {
        level: 3,
        name: 'Carbon-Silicon Brake Rotors',
        partName: 'Carbon-Silicon Brake Rotors',
        cost: 195000,
        brakeMult: 1.040,
        agilityMult: 1.040,
        brakingDistDeltaM: -3.6,
        telemetryDelta: '-3.6m Braking • +4.0% Braking Decel & Apex Bite',
        summary: '-3.6m Braking Dist • +4.0% Braking & Apex Bite',
      },
      {
        level: 4,
        name: 'Titanium Heave-Damper & Brake-By-Wire',
        partName: 'Titanium Heave-Damper & Brake-By-Wire',
        cost: 320000,
        brakeMult: 1.060,
        agilityMult: 1.060,
        brakingDistDeltaM: -5.4,
        telemetryDelta: '-5.4m Braking • +6.0% Braking & Trail-Brake Rotation',
        summary: '-5.4m Braking Dist • +6.0% Braking & Trail-Brake',
      },
      {
        level: 5,
        name: 'Autoclave T1100G Ultralight Monocoque',
        partName: 'Autoclave T1100G Ultralight Monocoque',
        cost: 480000,
        brakeMult: 1.080,
        agilityMult: 1.080,
        brakingDistDeltaM: -7.2,
        telemetryDelta: '-7.2m Braking • +8.0% Braking Decel & Razor Agility',
        summary: '-7.2m Braking Dist • +8.0% Braking & Razor Agility',
      },
    ],
  },

  tires: {
    id: 'tires',
    name: 'Tire Thermal & Rim Tech',
    label: 'TIRE THERMAL MANAGEMENT',
    shortLabel: 'TIRES',
    icon: '🔥',
    maxLevel: 5,
    description: 'Cuts Pirelli tread degradation rate (-tire deg %) and widens the optimal thermal grip window (+°C).',
    levels: [
      {
        level: 1,
        name: 'Standard Alloy Rim Blankets',
        partName: 'Standard Alloy Rim Blankets',
        cost: 0,
        tireWearMult: 1.00,
        tireDegReductionPct: 0,
        thermalWindowBonusC: 0,
        telemetryDelta: '-0% Tire Deg • Baseline Thermal Window',
        summary: '1.00x Tire Wear (-0% Deg) • Baseline Temp Window',
      },
      {
        level: 2,
        name: 'Internal Drum Infrared Telemetry',
        partName: 'Internal Drum Infrared Telemetry',
        cost: 95000,
        tireWearMult: 0.94,
        tireDegReductionPct: 6,
        thermalWindowBonusC: 2,
        telemetryDelta: '-6% Tire Deg/Lap • +2°C Grip Window',
        summary: '-6% Tire Deg (0.94x Wear) • +2°C Grip Window',
      },
      {
        level: 3,
        name: 'Forged Magnesium Finned Wheel Rims',
        partName: 'Forged Magnesium Finned Wheel Rims',
        cost: 185000,
        tireWearMult: 0.88,
        tireDegReductionPct: 12,
        thermalWindowBonusC: 4,
        telemetryDelta: '-12% Tire Deg/Lap • +4°C Grip Window',
        summary: '-12% Tire Deg (0.88x Wear) • +4°C Grip Window',
      },
      {
        level: 4,
        name: 'Dual-Stage Carbon Brake-Duct Diverters',
        partName: 'Dual-Stage Carbon Brake-Duct Diverters',
        cost: 300000,
        tireWearMult: 0.82,
        tireDegReductionPct: 18,
        thermalWindowBonusC: 6,
        telemetryDelta: '-18% Tire Deg/Lap • +6°C Grip Window',
        summary: '-18% Tire Deg (0.82x Wear) • +6°C Grip Window',
      },
      {
        level: 5,
        name: 'Phase-Change Carcass Thermal Matrix',
        partName: 'Phase-Change Carcass Thermal Matrix',
        cost: 460000,
        tireWearMult: 0.76,
        tireDegReductionPct: 24,
        thermalWindowBonusC: 8,
        telemetryDelta: '-24% Tire Deg/Lap • +8°C Optimal Grip Window',
        summary: '-24% Tire Deg (0.76x Wear) • +8°C Optimal Window',
      },
    ],
  },

  pitCrew: {
    id: 'pitCrew',
    name: 'Pit Wall & Sub-2s Crew Rig',
    label: 'PIT CREW & WHEEL GUNS',
    shortLabel: 'PIT CREW',
    icon: '🔧',
    maxLevel: 5,
    description: 'Shaves stationary pit-stop duration (-s / -%) and widens the green clutch launch sweet-spot.',
    levels: [
      {
        level: 1,
        name: 'Standard Pneumatic Pit Rig',
        partName: 'Standard Pneumatic Pit Rig',
        cost: 0,
        pitStopDurationMult: 1.00,
        clutchZoneBonus: 0.00,
        errorProbMult: 1.00,
        telemetryDelta: '-0.00s Pit Stop • Standard Clutch Window',
        summary: '1.00x Stop Duration • Standard Clutch Zone',
      },
      {
        level: 2,
        name: 'Carbon Swivel Front & Rear Quick-Jacks',
        partName: 'Carbon Swivel Front & Rear Quick-Jacks',
        cost: 90000,
        pitStopDurationMult: 0.94,
        clutchZoneBonus: 0.02,
        errorProbMult: 0.85,
        telemetryDelta: '-0.15s Stop (0.94x) • +2% Clutch Sweet-Spot',
        summary: '-0.15s Pit Time (0.94x) • +2% Clutch Window',
      },
      {
        level: 3,
        name: 'Laser-Guided Pneumatic Wheel Guns',
        partName: 'Laser-Guided Pneumatic Wheel Guns',
        cost: 180000,
        pitStopDurationMult: 0.88,
        clutchZoneBonus: 0.04,
        errorProbMult: 0.70,
        telemetryDelta: '-0.30s Stop (0.88x) • +4% Clutch Sweet-Spot',
        summary: '-0.30s Pit Time (0.88x) • +4% Clutch Window',
      },
      {
        level: 4,
        name: 'RFID Auto-Drop Gantry & Dry-Break Rig',
        partName: 'RFID Auto-Drop Gantry & Dry-Break Rig',
        cost: 295000,
        pitStopDurationMult: 0.81,
        clutchZoneBonus: 0.06,
        errorProbMult: 0.52,
        telemetryDelta: '-0.48s Stop (0.81x) • +6% Clutch Sweet-Spot',
        summary: '-0.48s Pit Time (0.81x) • +6% Clutch Window',
      },
      {
        level: 5,
        name: 'Sub-2s Works Pit Choreography',
        partName: 'Sub-2s Works Pit Choreography',
        cost: 450000,
        pitStopDurationMult: 0.75,
        clutchZoneBonus: 0.08,
        errorProbMult: 0.35,
        telemetryDelta: '-0.63s Stop (0.75x) • +8% Optimal Clutch Window',
        summary: '-0.63s Pit Time (0.75x) • +8% Optimal Clutch',
      },
    ],
  },
};

// Alias `.tiers` -> `.levels` on each branch for UI convenience
for (const branch of Object.values(CAR_PARTS_CATALOG)) {
  branch.tiers = branch.levels;
}

// ============================================================================
// 3. 6-ROUND WORLD CHAMPIONSHIP CALENDAR (WITH VIVID ENGINEER METADATA)
// ============================================================================
const TRACK_FALLBACK_MAP = {
  FUJI_1982: 'FUJI_1982',
  MONACO_HARBOR: 'MONACO_HARBOR',
  SUZUKA_130R: 'FUJI_1982',
  MONZA_TEMPLE: 'MONZA_TEMPLE',
  SILVERSTONE_GP: 'MONZA_TEMPLE',
  VEGAS_NEON: 'VEGAS_NEON',
};

export function resolveCalendarTrackId(trackId) {
  if (trackId && TRACK_CATALOG && TRACK_CATALOG[trackId]) {
    return trackId;
  }
  const fallback = TRACK_FALLBACK_MAP[trackId] || 'FUJI_1982';
  return (TRACK_CATALOG && TRACK_CATALOG[fallback]) ? fallback : 'FUJI_1982';
}

export const CHAMPIONSHIP_CALENDAR = [
  {
    round: 1,
    id: 'FUJI_1982',
    trackId: 'FUJI_1982',
    fallbackTrackId: 'FUJI_1982',
    gpTitle: 'Japanese Grand Prix',
    venue: 'Mt. Fuji',
    fullLabel: 'Japanese Grand Prix — Mt. Fuji',
    country: '🇯🇵 JAPAN',
    recommendedWing: 'BALANCED',
    tireStress: 'MEDIUM',
    brakingSeverity: 'HIGH (Turn 1 Daiichi 315→115 km/h)',
    keyCorner: '100R Sweeper & Panorama Curve',
    engineerNote:
      'Alpine air boosts turbo density on the 1.5 km straight, while sweeping 100R loads the front-left carcass.',
    prestigePurseBonus: 0,
    get resolvedTrackId() {
      return resolveCalendarTrackId(this.trackId);
    },
  },
  {
    round: 2,
    id: 'MONACO_HARBOR',
    trackId: 'MONACO_HARBOR',
    fallbackTrackId: 'MONACO_HARBOR',
    gpTitle: 'Monaco Grand Prix',
    venue: 'Monte Carlo',
    fullLabel: 'Monaco Grand Prix — Monte Carlo',
    country: '🇲🇨 MONACO',
    recommendedWing: 'HIGH_DOWNFORCE',
    tireStress: 'LOW',
    brakingSeverity: 'EXTREME (Nouvelle Chicane after Tunnel)',
    keyCorner: 'Casino Descent, Tunnel & Swimming Pool',
    engineerNote:
      'Zero Armco margin in Monte Carlo — qualify on the front row and execute a crisp pit-lane undercut.',
    prestigePurseBonus: 25000,
    get resolvedTrackId() {
      return resolveCalendarTrackId(this.trackId);
    },
  },
  {
    round: 3,
    id: 'SUZUKA_130R',
    trackId: 'SUZUKA_130R',
    fallbackTrackId: 'FUJI_1982',
    gpTitle: 'Pacific Grand Prix',
    venue: 'Suzuka Figure-8',
    fullLabel: 'Pacific Grand Prix — Suzuka Figure-8',
    country: '🇯🇵 PACIFIC',
    recommendedWing: 'HIGH_DOWNFORCE',
    tireStress: 'HIGH',
    brakingSeverity: 'MEDIUM-HIGH (Casio Triangle & Hairpin)',
    keyCorner: 'S-Curves, Degner & 305 km/h 130R',
    engineerNote:
      'Suzuka Figure-8 crossovers demand rhythmic steering precision and high Venturi downforce through the Esses.',
    prestigePurseBonus: 10000,
    get resolvedTrackId() {
      return resolveCalendarTrackId(this.trackId);
    },
  },
  {
    round: 4,
    id: 'MONZA_TEMPLE',
    trackId: 'MONZA_TEMPLE',
    fallbackTrackId: 'MONZA_TEMPLE',
    gpTitle: 'Italian Grand Prix',
    venue: 'Monza Royal Park',
    fullLabel: 'Italian Grand Prix — Monza Royal Park',
    country: '🇮🇹 ITALY',
    recommendedWing: 'LOW_DRAG',
    tireStress: 'LOW',
    brakingSeverity: 'SEVERE (4.9G Rettifilo Chicane)',
    keyCorner: 'Variante Ascari & Curva Parabolica',
    engineerNote:
      'Full-throttle slipstream temple: trim out wing drag (+5 km/h) and harvest DRS tow past 330+ km/h.',
    prestigePurseBonus: 15000,
    get resolvedTrackId() {
      return resolveCalendarTrackId(this.trackId);
    },
  },
  {
    round: 5,
    id: 'SILVERSTONE_GP',
    trackId: 'SILVERSTONE_GP',
    fallbackTrackId: 'MONZA_TEMPLE',
    gpTitle: 'British Grand Prix',
    venue: 'Silverstone Abbey',
    fullLabel: 'British Grand Prix — Silverstone Abbey',
    country: '🇬🇧 GREAT BRITAIN',
    recommendedWing: 'BALANCED',
    tireStress: 'HIGH',
    brakingSeverity: 'MEDIUM (Brooklands & Vale Complex)',
    keyCorner: 'Maggotts-Becketts-Chapel Complex',
    engineerNote:
      'Sustained 4.5G lateral sweeps punish worn rubber — box before the 25% Pirelli grip cliff.',
    prestigePurseBonus: 15000,
    get resolvedTrackId() {
      return resolveCalendarTrackId(this.trackId);
    },
  },
  {
    round: 6,
    id: 'VEGAS_NEON',
    trackId: 'VEGAS_NEON',
    fallbackTrackId: 'VEGAS_NEON',
    gpTitle: 'Las Vegas Night Finale',
    venue: 'Neon Strip',
    fullLabel: 'Las Vegas Night Finale — Neon Strip',
    country: '🇺🇸 USA (NIGHT)',
    recommendedWing: 'LOW_DRAG',
    tireStress: 'MEDIUM',
    brakingSeverity: 'HIGH (Sphere Turn 1 & Strip Hairpin)',
    keyCorner: 'Neon Strip Straight & Sphere Carousel',
    engineerNote:
      'World Championship Night Finale under floodlights — cool desert tarmac extends Soft stints for late-race lunges!',
    prestigePurseBonus: 35000,
    get resolvedTrackId() {
      return resolveCalendarTrackId(this.trackId);
    },
  },
];

// ============================================================================
// 4. PRE-RACE GARAGE CAR SETUP & STINT STRATEGY OPTIONS
// ============================================================================
export const CAR_SETUP_OPTIONS = {
  wingTrim: {
    LOW_DRAG: {
      id: 'LOW_DRAG',
      label: 'LOW DRAG MONZA TRIM',
      shortLabel: 'LOW DRAG',
      desc: '+5 km/h Top Speed • -4.0% Cornering Grip',
      topSpeedBonusKmh: 5.0,
      aeroGripMult: 0.96,
      brakeTrimMult: 0.99,
    },
    BALANCED: {
      id: 'BALANCED',
      label: 'BALANCED ALL-SECTOR',
      shortLabel: 'BALANCED',
      desc: 'Neutral Top Speed & Downforce Equilibrium',
      topSpeedBonusKmh: 0.0,
      aeroGripMult: 1.00,
      brakeTrimMult: 1.00,
    },
    HIGH_DOWNFORCE: {
      id: 'HIGH_DOWNFORCE',
      label: 'HIGH DOWNFORCE MONACO TRIM',
      shortLabel: 'HIGH DF',
      desc: '-4 km/h Top Speed • +6.5% Cornering Grip',
      topSpeedBonusKmh: -4.0,
      aeroGripMult: 1.065,
      brakeTrimMult: 1.015,
    },
  },

  fuelLoad: {
    LIGHT: {
      id: 'LIGHT',
      label: 'LIGHT SPRINT (0.82x)',
      shortLabel: 'LIGHT',
      desc: '0.82x Fuel Mass • Agile Early Pace, Earlier Pit Stop',
      fuelLoadMult: 0.82,
      agilityTrimMult: 1.02,
    },
    STANDARD: {
      id: 'STANDARD',
      label: 'STANDARD GP (1.00x)',
      shortLabel: 'STANDARD',
      desc: '1.00x Balanced Grand Prix Fuel Load',
      fuelLoadMult: 1.00,
      agilityTrimMult: 1.00,
    },
    HEAVY: {
      id: 'HEAVY',
      label: 'HEAVY ENDURANCE (1.22x)',
      shortLabel: 'HEAVY',
      desc: '1.22x Fuel Buffer • Overcut & Full-Throttle Stint Margin',
      fuelLoadMult: 1.22,
      agilityTrimMult: 0.985,
    },
  },

  stintStrategy: {
    ONE_STOP_SM: {
      id: 'ONE_STOP_SM',
      label: '1-STOP: SOFT → MEDIUM',
      shortLabel: 'S → M',
      desc: 'Attack off the grid on Softs, transition to durable Mediums in pit window',
      stops: 1,
      compounds: ['SOFT', 'MEDIUM'],
      startingCompound: 'SOFT',
      nextCompound: 'MEDIUM',
      crewPushMode: 'BALANCED',
    },
    ONE_STOP_MH: {
      id: 'ONE_STOP_MH',
      label: '1-STOP: MEDIUM → HARD',
      shortLabel: 'M → H',
      desc: 'Extended opening overcut stint on Mediums, finish strong on endurance Hards',
      stops: 1,
      compounds: ['MEDIUM', 'HARD'],
      startingCompound: 'MEDIUM',
      nextCompound: 'HARD',
      crewPushMode: 'SAFE',
    },
    TWO_STOP_ATTACK: {
      id: 'TWO_STOP_ATTACK',
      label: '2-STOP ATTACK: S → S → M',
      shortLabel: 'S → S → M',
      desc: 'Twin qualifying-pace Soft sprints with 1.9s undercut crew aggression',
      stops: 2,
      compounds: ['SOFT', 'SOFT', 'MEDIUM'],
      startingCompound: 'SOFT',
      nextCompound: 'SOFT',
      finalCompound: 'MEDIUM',
      crewPushMode: 'AGGRESSIVE_UNDERCUT',
    },
    WET_ADAPTIVE: {
      id: 'WET_ADAPTIVE',
      label: 'WET ADAPTIVE: INTER / WET',
      shortLabel: 'AUTO WET',
      desc: 'Automatic Intermediate / Full Wet crossover matched to live surface moisture',
      stops: 1,
      compounds: ['INTERMEDIATE', 'FULL_WET'],
      startingCompound: 'INTERMEDIATE',
      nextCompound: 'INTERMEDIATE',
      isWetAdaptive: true,
      crewPushMode: 'BALANCED',
    },
  },
};

// Circuit-specific engineering telemetry notes for `getStrategyBriefing` / `getStrategyRecommendation`
const CIRCUIT_STRATEGY_PROFILES = {
  FUJI_1982: {
    wing: 'BALANCED',
    wingReason:
      '1.5 km Shizuoka pit straight demands 315+ km/h slipstream speed while 100R & 300R sweepers need planted mid-corner aero.',
    undercutDelta: -1,
    undercutNote:
      'Pitting 1 lap before tyre cliff unlocks clean air through 100R and strong DRS defense into Turn 1 Daiichi.',
    watchouts: [
      'Heavy 315 → 115 km/h braking into Turn 1 Daiichi Right',
      'Front-left thermal load through sweeping 100R & Panorama',
      'Pit entry splits right at Sector 10 (s = 912m, 80 km/h limit)',
    ],
  },
  MONACO_HARBOR: {
    wing: 'HIGH_DOWNFORCE',
    wingReason:
      'Track position is king in Monte Carlo — maximum +6.5% cornering bite dominates Casino, Mirabeau, and the Swimming Pool S-curves.',
    undercutDelta: -1,
    undercutNote:
      'Overtaking on-track is tight; trigger an Aggressive Undercut stop 1 lap early to leapfrog rivals in the pit lane!',
    watchouts: [
      'Zero runoff past Sainte-Devote and Nouvelle Harbor Chicane',
      'High-speed blind exit from the Illuminated Seafront Tunnel',
      'Protect front wing endplates in wheel-to-wheel hairpin packs',
    ],
  },
  SUZUKA_130R: {
    wing: 'HIGH_DOWNFORCE',
    wingReason:
      'Relentless Figure-8 Esses, Spoon Curve, and flat-out 130R reward maximum Venturi floor downforce and tire protection.',
    undercutDelta: -1,
    undercutNote:
      'High lateral G-loads chew Soft rubber quickly — undercut onto fresh Mediums before hitting the 25% Pirelli grip cliff.',
    watchouts: [
      'High lateral tire wear across consecutive S-curves',
      'Late braking stability into final chicane & Turn 1',
      'Keep two wheels inside red-and-white kerbs at >260 km/h',
    ],
  },
  MONZA_TEMPLE: {
    wing: 'LOW_DRAG',
    wingReason:
      'The Temple of Speed is 78% full throttle — Low Drag trim (+5 km/h) plus DRS tow pushes G8 past 330+ km/h on Rettifilo!',
    undercutDelta: 0,
    undercutNote:
      'Overcut works well at Monza: stay in a tow train on Mediums, then box cleanly without losing slipstream pack contact.',
    watchouts: [
      '4.8G threshold braking from 330 km/h into Prima Variante',
      'Ride tricolor kerbs cleanly through Variante Ascari',
      'Commit early to late-apex throttle out of Curva Parabolica',
    ],
  },
  SILVERSTONE_GP: {
    wing: 'BALANCED',
    wingReason:
      'Maggotts-Becketts high-speed direction changes paired with Hangar Straight require balanced aero efficiency.',
    undercutDelta: -1,
    undercutNote:
      'High-energy sweepers heat rear tires rapidly; pit at the front edge of the window to maximize fresh-rubber out-lap pace.',
    watchouts: [
      'Sustained 4G lateral tire loading in fast sweepers',
      'Watch sudden British rain radar cells & standing puddles',
      'Nail the 80 km/h speed limit line on pit lane entry',
    ],
  },
  VEGAS_NEON: {
    wing: 'LOW_DRAG',
    wingReason:
      'Blistering Las Vegas Strip midnight straightaway rewards Low Drag top speed while cool desert night air keeps brakes crisp.',
    undercutDelta: 0,
    undercutNote:
      'Cool 19°C night tarmac extends Soft stint life — push an extra lap before boxing to attack on warm tires in the final laps!',
    watchouts: [
      'Cool floodlit night asphalt requires 1 lap to peak tire temp',
      'Heavy braking into Sphere Arena Turn 1 & Casino Boulevard 90s',
      'Championship Finale double-focus: guard wings in slipstream battles',
    ],
  },
};

// Archetype strength weights for plausible AI championship standings progression
const ARCHETYPE_PACE_WEIGHT = {
  TIRE_WHISPERER: 1.06,
  APEX_TACTICIAN: 1.04,
  DEFENSIVE_WALL: 1.01,
  LATE_BRAKER: 0.99,
  ROOKIE_WILDCARD: 0.92,
};

function createSponsorBonusItem(def, isPinned = false) {
  const multiplier = isPinned ? 1.5 : 1.0;
  const payout = Math.round(def.bonus * multiplier);
  const formattedBonus = `+${formatCredits(payout)}`;
  const shortCash = `+$${Math.round(payout / 1000)}K`;
  const chipPrefix = isPinned ? '★ ' : '';
  return {
    id: def.id,
    title: isPinned ? `${def.title} (1.5x TITLE CONTRACT)` : def.title,
    name: def.title,
    label: def.title,
    shortLabel: def.shortLabel,
    chipText: `${chipPrefix}${def.shortLabel} ${shortCash}`,
    desc: def.desc,
    baseBonus: def.bonus,
    bonus: payout,
    payout,
    cash: payout,
    amount: payout,
    reward: payout,
    multiplier,
    isPinned: Boolean(isPinned),
    boosted: Boolean(isPinned),
    formattedBonus,
    achieved: true,
    earned: true,
    toString() {
      return `${def.title}${isPinned ? ' (1.5x)' : ''} ${formattedBonus}`;
    },
  };
}

function createFreshDriverPointsMap() {
  const map = { PLAYER: 0 };
  for (const drv of AI_DRIVER_ROSTER) {
    map[drv.name] = 0;
  }
  return map;
}

function createFreshMedalsByTrackMap() {
  const out = {};
  for (const trackId of Object.keys(TIME_TRIAL_MEDALS)) {
    out[trackId] = { bronze: false, silver: false, gold: false, highest: 'NONE' };
  }
  return out;
}

function createDefaultCareerState() {
  return {
    schemaVersion: CAREER_SCHEMA_VERSION,
    driverName: 'PHANATIC',
    driverNumber: 1,
    teamId: 'NAMCO_WORKS',
    seasonNumber: 1,
    currentRoundIdx: 0,
    credits: STARTING_RND_CREDITS,
    driverXp: 0,
    unlockedAchievements: {},
    bestLapByTrack: {},
    medalsByTrack: createFreshMedalsByTrackMap(),
    activeSponsorContractId: 'PODIUM_SWEEP',
    driverPoints: createFreshDriverPointsMap(),
    roundHistory: [],
    seasonHistory: [],
    stats: {
      races: 0,
      wins: 0,
      podiums: 0,
      poles: 0,
      fastestLaps: 0,
      overtakes: 0,
      championships: 0,
      totalEarnings: 0,
      bestFinish: null,
      bestLapSec: null,
    },
    partLevels: {
      powertrain: 1,
      aero: 1,
      chassis: 1,
      tires: 1,
      pitCrew: 1,
    },
    carSetup: {
      wingTrim: 'BALANCED',
      fuelLoad: 'STANDARD',
      stintStrategy: 'ONE_STOP_SM',
    },
  };
}

// ============================================================================
// 5. WORLD CHAMPIONSHIP CAREER MANAGER (PERSISTENCE, R&D, STRATEGY & SCORING)
// ============================================================================
export class CareerManager {
  constructor(storageKey = CAREER_STORAGE_KEY) {
    this.storageKey = storageKey || CAREER_STORAGE_KEY;
    this._memoryStore = null;
    this._lastCareerWeekendRecordAt = 0;
    this._lastCareerWeekendXpResult = null;
    this.state = this._loadAndMigrate();
    this._save();
  }

  // --------------------------------------------------------------------------
  // SAFE LOCALSTORAGE PERSISTENCE & SCHEMA MIGRATION
  // --------------------------------------------------------------------------
  _readRawStorage() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage !== null) {
        return localStorage.getItem(this.storageKey);
      }
    } catch (_) {
      // Ignore Safari private-mode / sandboxed iframe storage exceptions
    }
    return this._memoryStore;
  }

  _save() {
    const serialized = JSON.stringify(this.state);
    this._memoryStore = serialized;
    try {
      if (typeof localStorage !== 'undefined' && localStorage !== null) {
        localStorage.setItem(this.storageKey, serialized);
      }
    } catch (_) {
      // Graceful fallback to in-memory persistence if quota exceeded / blocked
    }
  }

  _loadAndMigrate() {
    const defaults = createDefaultCareerState();
    let parsed = null;
    try {
      const raw = this._readRawStorage();
      if (raw && typeof raw === 'string') {
        parsed = JSON.parse(raw);
      }
    } catch (_) {
      parsed = null;
    }

    if (!parsed || typeof parsed !== 'object') {
      return defaults;
    }

    const driverName =
      typeof parsed.driverName === 'string' && parsed.driverName.trim().length > 0
        ? parsed.driverName.trim().slice(0, 24)
        : defaults.driverName;

    const driverNumber = clamp(
      Math.round(finiteOr(parsed.driverNumber, defaults.driverNumber)),
      1,
      99
    );

    const teamId = TEAM_CATALOG[parsed.teamId] ? parsed.teamId : defaults.teamId;
    const seasonNumber = Math.max(1, Math.round(finiteOr(parsed.seasonNumber, 1)));
    const currentRoundIdx = clamp(
      Math.round(finiteOr(parsed.currentRoundIdx, 0)),
      0,
      CHAMPIONSHIP_CALENDAR.length - 1
    );
    const credits = Math.max(0, Math.round(finiteOr(parsed.credits, STARTING_RND_CREDITS)));

    // Migrate driverPoints while guaranteeing PLAYER + all 15 AI_DRIVER_ROSTER entries exist
    const driverPoints = createFreshDriverPointsMap();
    if (parsed.driverPoints && typeof parsed.driverPoints === 'object') {
      for (const [k, v] of Object.entries(parsed.driverPoints)) {
        if (k === 'PLAYER' || Object.prototype.hasOwnProperty.call(driverPoints, k)) {
          driverPoints[k] = Math.max(0, Math.round(finiteOr(v, 0)));
        } else {
          const matchedAi = this._matchRosterDriver({ name: k, short: k });
          if (matchedAi) {
            driverPoints[matchedAi.name] = Math.max(
              driverPoints[matchedAi.name],
              Math.round(finiteOr(v, 0))
            );
          }
        }
      }
    }

    // Migrate 5 subsystem upgrade levels (1..5)
    const partLevels = { ...defaults.partLevels };
    if (parsed.partLevels && typeof parsed.partLevels === 'object') {
      for (const branchId of Object.keys(CAR_PARTS_CATALOG)) {
        const maxLv = CAR_PARTS_CATALOG[branchId].maxLevel || 5;
        partLevels[branchId] = clamp(
          Math.round(finiteOr(parsed.partLevels[branchId], 1)),
          1,
          maxLv
        );
      }
    }

    // Migrate Car Setup options
    const rawSetup = parsed.carSetup && typeof parsed.carSetup === 'object' ? parsed.carSetup : {};
    const carSetup = {
      wingTrim: CAR_SETUP_OPTIONS.wingTrim[rawSetup.wingTrim]
        ? rawSetup.wingTrim
        : defaults.carSetup.wingTrim,
      fuelLoad: CAR_SETUP_OPTIONS.fuelLoad[rawSetup.fuelLoad]
        ? rawSetup.fuelLoad
        : defaults.carSetup.fuelLoad,
      stintStrategy: CAR_SETUP_OPTIONS.stintStrategy[rawSetup.stintStrategy]
        ? rawSetup.stintStrategy
        : defaults.carSetup.stintStrategy,
    };

    // Migrate lifetime stats
    const rawStats = parsed.stats && typeof parsed.stats === 'object' ? parsed.stats : {};
    const stats = {
      races: Math.max(0, Math.round(finiteOr(rawStats.races, 0))),
      wins: Math.max(0, Math.round(finiteOr(rawStats.wins, 0))),
      podiums: Math.max(0, Math.round(finiteOr(rawStats.podiums, 0))),
      poles: Math.max(0, Math.round(finiteOr(rawStats.poles, 0))),
      fastestLaps: Math.max(0, Math.round(finiteOr(rawStats.fastestLaps, 0))),
      overtakes: Math.max(0, Math.round(finiteOr(rawStats.overtakes, 0))),
      championships: Math.max(0, Math.round(finiteOr(rawStats.championships, 0))),
      totalEarnings: Math.max(0, Math.round(finiteOr(rawStats.totalEarnings, 0))),
      bestFinish:
        rawStats.bestFinish !== null &&
        rawStats.bestFinish !== undefined &&
        Number.isFinite(Number(rawStats.bestFinish)) &&
        Number(rawStats.bestFinish) >= 1
          ? Math.round(Number(rawStats.bestFinish))
          : null,
      bestLapSec:
        rawStats.bestLapSec !== null &&
        rawStats.bestLapSec !== undefined &&
        Number.isFinite(Number(rawStats.bestLapSec)) &&
        Number(rawStats.bestLapSec) > 10
          ? Number(rawStats.bestLapSec)
          : null,
    };

    // Migrate Driver XP (gracefully seeding veteran v2 saves that predate driverXp)
    let driverXp = 0;
    if (parsed.driverXp !== undefined && parsed.driverXp !== null && Number.isFinite(Number(parsed.driverXp))) {
      driverXp = Math.max(0, Math.round(Number(parsed.driverXp)));
    } else if (stats.races > 0) {
      driverXp =
        stats.races * 180 +
        stats.wins * 240 +
        stats.podiums * 110 +
        stats.poles * 40 +
        stats.overtakes * 12 +
        stats.championships * 800;
    }

    // Migrate Unlocked Achievements map
    const validAchIds = new Set(ACHIEVEMENTS_CATALOG.map((a) => a.id));
    const unlockedAchievements = {};
    if (parsed.unlockedAchievements && typeof parsed.unlockedAchievements === 'object') {
      for (const [achId, tsOrFlag] of Object.entries(parsed.unlockedAchievements)) {
        if (validAchIds.has(achId) && tsOrFlag) {
          unlockedAchievements[achId] =
            typeof tsOrFlag === 'number' && Number.isFinite(tsOrFlag) ? tsOrFlag : Date.now();
        }
      }
    }

    // Migrate Time Trial Personal Bests & Earned Medals per Circuit
    const bestLapByTrack = {};
    if (parsed.bestLapByTrack && typeof parsed.bestLapByTrack === 'object') {
      for (const [tId, val] of Object.entries(parsed.bestLapByTrack)) {
        const sec = Number(val);
        if (TIME_TRIAL_MEDALS[tId] && Number.isFinite(sec) && sec > 10 && sec < 600) {
          bestLapByTrack[tId] = sec;
        }
      }
    }

    const medalsByTrack = createFreshMedalsByTrackMap();
    if (parsed.medalsByTrack && typeof parsed.medalsByTrack === 'object') {
      for (const [tId, mVal] of Object.entries(parsed.medalsByTrack)) {
        if (!TIME_TRIAL_MEDALS[tId] || !mVal) continue;
        if (typeof mVal === 'string') {
          const upper = mVal.toUpperCase();
          const gold = upper === 'GOLD';
          const silver = gold || upper === 'SILVER';
          const bronze = silver || upper === 'BRONZE';
          medalsByTrack[tId] = {
            bronze,
            silver,
            gold,
            highest: gold ? 'GOLD' : (silver ? 'SILVER' : (bronze ? 'BRONZE' : 'NONE')),
          };
        } else if (typeof mVal === 'object') {
          const gold = Boolean(mVal.gold || mVal.highest === 'GOLD');
          const silver = Boolean(gold || mVal.silver || mVal.highest === 'SILVER');
          const bronze = Boolean(silver || mVal.bronze || mVal.highest === 'BRONZE');
          medalsByTrack[tId] = {
            bronze,
            silver,
            gold,
            highest: gold ? 'GOLD' : (silver ? 'SILVER' : (bronze ? 'BRONZE' : 'NONE')),
          };
        }
      }
    }

    // Migrate Active Title Sponsor Contract (1.5x payout boost)
    let activeSponsorContractId = defaults.activeSponsorContractId;
    if (parsed.activeSponsorContractId === null) {
      activeSponsorContractId = null;
    } else if (
      typeof parsed.activeSponsorContractId === 'string' &&
      SPONSOR_OBJECTIVES_CATALOG.some((o) => o.id === parsed.activeSponsorContractId)
    ) {
      activeSponsorContractId = parsed.activeSponsorContractId;
    }

    const roundHistory = Array.isArray(parsed.roundHistory) ? parsed.roundHistory.slice(0, 12) : [];
    const seasonHistory = Array.isArray(parsed.seasonHistory) ? parsed.seasonHistory.slice(-10) : [];

    return {
      schemaVersion: CAREER_SCHEMA_VERSION,
      driverName,
      driverNumber,
      teamId,
      seasonNumber,
      currentRoundIdx,
      credits,
      driverXp,
      unlockedAchievements,
      bestLapByTrack,
      medalsByTrack,
      activeSponsorContractId,
      driverPoints,
      roundHistory,
      seasonHistory,
      stats,
      partLevels,
      carSetup,
    };
  }

  // --------------------------------------------------------------------------
  // PROFILE, DRIVER XP / FIA LICENSE, ACHIEVEMENTS, TIME TRIAL & SPONSOR CONTRACTS
  // --------------------------------------------------------------------------
  getState() {
    return {
      schemaVersion: this.state.schemaVersion,
      driverName: this.state.driverName,
      driverNumber: this.state.driverNumber,
      teamId: this.state.teamId,
      seasonNumber: this.state.seasonNumber,
      currentRoundIdx: this.state.currentRoundIdx,
      credits: this.state.credits,
      driverXp: this.state.driverXp,
      unlockedAchievements: { ...this.state.unlockedAchievements },
      bestLapByTrack: { ...this.state.bestLapByTrack },
      medalsByTrack: Object.fromEntries(
        Object.entries(this.state.medalsByTrack || {}).map(([k, v]) => [k, { ...v }])
      ),
      activeSponsorContractId: this.state.activeSponsorContractId,
      driverPoints: { ...this.state.driverPoints },
      roundHistory: this.state.roundHistory.map((r) => ({ ...r })),
      seasonHistory: this.state.seasonHistory.map((s) => ({ ...s })),
      stats: { ...this.state.stats },
      partLevels: { ...this.state.partLevels },
      carSetup: { ...this.state.carSetup },
    };
  }

  getDriverProfile() {
    const base = computeDriverLevelProfile(this.state.driverXp);
    return {
      ...base,
      driverName: this.state.driverName,
      driverNumber: this.state.driverNumber,
    };
  }

  getAchievementsStatus() {
    const unlockedMap = this.state.unlockedAchievements || {};
    let unlockedCount = 0;
    let totalBonusEarned = 0;

    const list = ACHIEVEMENTS_CATALOG.map((ach) => {
      const rawUnlock = unlockedMap[ach.id];
      const unlocked = Boolean(rawUnlock);
      if (unlocked) {
        unlockedCount += 1;
        totalBonusEarned += ach.bonus;
      }
      return {
        id: ach.id,
        title: ach.title,
        name: ach.name,
        desc: ach.desc,
        description: ach.desc,
        icon: ach.icon,
        bonus: ach.bonus,
        rewardCredits: ach.bonus,
        formattedBonus: `+${formatCredits(ach.bonus)}`,
        unlocked,
        unlockedAt: typeof rawUnlock === 'number' ? rawUnlock : (unlocked ? 1 : null),
      };
    });

    const totalCount = ACHIEVEMENTS_CATALOG.length;
    const progress01 = totalCount > 0 ? clamp(unlockedCount / totalCount, 0, 1) : 0;
    const timeTrialSummary = this.getAllTimeTrialMedals();

    Object.defineProperties(list, {
      unlockedCount: { value: unlockedCount, enumerable: false },
      totalCount: { value: totalCount, enumerable: false },
      progress01: { value: progress01, enumerable: false },
      totalBonusEarned: { value: totalBonusEarned, enumerable: false },
      formattedTotalBonusEarned: { value: formatCredits(totalBonusEarned), enumerable: false },
      items: { value: list, enumerable: false },
      achievements: { value: list, enumerable: false },
      timeTrialSummary: { value: timeTrialSummary, enumerable: false },
    });

    return list;
  }

  getTimeTrialInfo(trackId = 'FUJI_1982') {
    const safeTrackId = TIME_TRIAL_MEDALS[trackId] ? trackId : 'FUJI_1982';
    const def = TIME_TRIAL_MEDALS[safeTrackId];
    const bestRaw = this.state.bestLapByTrack?.[safeTrackId];
    const bestLapSec = Number.isFinite(bestRaw) && bestRaw > 0 ? bestRaw : null;
    const storedMedals = this.state.medalsByTrack?.[safeTrackId] || {
      bronze: false,
      silver: false,
      gold: false,
      highest: 'NONE',
    };

    const gold = Boolean(storedMedals.gold);
    const silver = Boolean(gold || storedMedals.silver);
    const bronze = Boolean(silver || storedMedals.bronze);
    const highest = gold ? 'GOLD' : (silver ? 'SILVER' : (bronze ? 'BRONZE' : 'NONE'));

    const nextTargetMedal = !bronze ? 'BRONZE' : (!silver ? 'SILVER' : (!gold ? 'GOLD' : null));
    const nextTargetSec = !bronze ? def.bronze : (!silver ? def.silver : def.gold);

    return {
      trackId: safeTrackId,
      name: def.name,
      targets: {
        gold: def.gold,
        silver: def.silver,
        bronze: def.bronze,
      },
      gold: def.gold,
      silver: def.silver,
      bronze: def.bronze,
      goldSec: def.gold,
      silverSec: def.silver,
      bronzeSec: def.bronze,
      formattedTargets: {
        gold: formatLapTimeSec(def.gold),
        silver: formatLapTimeSec(def.silver),
        bronze: formatLapTimeSec(def.bronze),
      },
      bonuses: { ...def.bonuses },
      bestLapSec,
      formattedBestLap: formatLapTimeSec(bestLapSec),
      medals: { bronze, silver, gold, highest },
      medal: highest,
      highestMedal: highest,
      bestMedal: highest,
      nextTargetMedal,
      nextTargetSec,
      formattedNextTarget: formatLapTimeSec(nextTargetSec),
    };
  }

  getAllTimeTrialMedals() {
    const tracks = Object.keys(TIME_TRIAL_MEDALS).map((tId) => this.getTimeTrialInfo(tId));
    let goldCount = 0;
    let silverCount = 0;
    let bronzeCount = 0;
    for (const t of tracks) {
      if (t.medals.gold) goldCount++;
      if (t.medals.silver) silverCount++;
      if (t.medals.bronze) bronzeCount++;
    }
    return {
      tracks,
      goldCount,
      silverCount,
      bronzeCount,
      totalTracks: tracks.length,
    };
  }

  recordTimeTrialLap(trackId = 'FUJI_1982', lapSec) {
    const safeTrackId = TIME_TRIAL_MEDALS[trackId] ? trackId : 'FUJI_1982';
    const def = TIME_TRIAL_MEDALS[safeTrackId];
    const cleanLapSec = Number(lapSec);

    if (!Number.isFinite(cleanLapSec) || cleanLapSec <= 10.0 || cleanLapSec >= 600.0) {
      const curInfo = this.getTimeTrialInfo(safeTrackId);
      return {
        valid: false,
        trackId: safeTrackId,
        lapSec: cleanLapSec,
        bestLapSec: curInfo.bestLapSec,
        isPersonalBest: false,
        isNewBest: false,
        lapMedal: 'NONE',
        medal: curInfo.highestMedal,
        highestMedal: curInfo.highestMedal,
        bestMedal: curInfo.highestMedal,
        medalEarned: null,
        newMedalUnlocked: false,
        newlyUnlockedMedals: [],
        newlyEarnedMedals: [],
        medalBonusCredits: 0,
        achievementBonusCredits: 0,
        bonusCredits: 0,
        creditsAwarded: 0,
        xpGained: 0,
        leveledUp: false,
        newLevel: this.getDriverProfile().level,
        newlyUnlockedAchievements: [],
        targets: curInfo.targets,
        driverProfile: this.getDriverProfile(),
        creditsAfter: this.state.credits,
      };
    }

    if (!this.state.bestLapByTrack) this.state.bestLapByTrack = {};
    if (!this.state.medalsByTrack) this.state.medalsByTrack = createFreshMedalsByTrackMap();
    if (!this.state.medalsByTrack[safeTrackId]) {
      this.state.medalsByTrack[safeTrackId] = { bronze: false, silver: false, gold: false, highest: 'NONE' };
    }

    const prevBest = Number.isFinite(this.state.bestLapByTrack[safeTrackId])
      ? this.state.bestLapByTrack[safeTrackId]
      : null;
    const isPersonalBest = prevBest === null || cleanLapSec < prevBest;
    const deltaToPrevBest = prevBest !== null ? cleanLapSec - prevBest : null;

    if (isPersonalBest) {
      this.state.bestLapByTrack[safeTrackId] = cleanLapSec;
    }
    if (
      this.state.stats.bestLapSec === null ||
      this.state.stats.bestLapSec === undefined ||
      cleanLapSec < this.state.stats.bestLapSec
    ) {
      this.state.stats.bestLapSec = cleanLapSec;
    }

    const entry = this.state.medalsByTrack[safeTrackId];
    const newlyUnlockedMedals = [];
    let medalBonusCredits = 0;
    let rawXp = 35 + (isPersonalBest ? 25 : 0);

    let lapMedal = 'NONE';
    if (cleanLapSec <= def.gold) lapMedal = 'GOLD';
    else if (cleanLapSec <= def.silver) lapMedal = 'SILVER';
    else if (cleanLapSec <= def.bronze) lapMedal = 'BRONZE';

    if (cleanLapSec <= def.bronze && !entry.bronze) {
      entry.bronze = true;
      newlyUnlockedMedals.push('BRONZE');
      medalBonusCredits += def.bonuses.bronze;
      rawXp += 60;
    }
    if (cleanLapSec <= def.silver && !entry.silver) {
      entry.silver = true;
      newlyUnlockedMedals.push('SILVER');
      medalBonusCredits += def.bonuses.silver;
      rawXp += 110;
    }
    if (cleanLapSec <= def.gold && !entry.gold) {
      entry.gold = true;
      newlyUnlockedMedals.push('GOLD');
      medalBonusCredits += def.bonuses.gold;
      rawXp += 200;
    }

    entry.highest = entry.gold ? 'GOLD' : (entry.silver ? 'SILVER' : (entry.bronze ? 'BRONZE' : 'NONE'));

    if (medalBonusCredits > 0) {
      this.state.credits += medalBonusCredits;
      this.state.stats.totalEarnings += medalBonusCredits;
    }

    const xpRes = this._awardDriverXp(rawXp);
    const achRes = this._evaluateAndUnlockAchievements({
      mode: 'TIME_TRIAL',
      trackId: safeTrackId,
      lapSec: cleanLapSec,
      medalEarned: entry.gold ? 'GOLD' : entry.highest,
    });

    this._save();

    const highestNewMedal =
      newlyUnlockedMedals.length > 0 ? newlyUnlockedMedals[newlyUnlockedMedals.length - 1] : null;
    const totalCreditsAwarded = medalBonusCredits + achRes.bonusCredits;

    return {
      valid: true,
      trackId: safeTrackId,
      lapSec: cleanLapSec,
      formattedLap: formatLapTimeSec(cleanLapSec),
      prevBestLapSec: prevBest,
      bestLapSec: this.state.bestLapByTrack[safeTrackId],
      formattedBestLap: formatLapTimeSec(this.state.bestLapByTrack[safeTrackId]),
      deltaToPrevBest,
      isPersonalBest,
      isNewBest: isPersonalBest,
      lapMedal,
      medal: entry.highest,
      highestMedal: entry.highest,
      bestMedal: entry.highest,
      medalEarned: highestNewMedal,
      newMedal: highestNewMedal,
      newMedalUnlocked: newlyUnlockedMedals.length > 0,
      newlyUnlockedMedals,
      newlyEarnedMedals: newlyUnlockedMedals,
      medalBonusCredits,
      achievementBonusCredits: achRes.bonusCredits,
      bonusCredits: totalCreditsAwarded,
      creditsAwarded: totalCreditsAwarded,
      xpGained: xpRes.xpGained,
      leveledUp: xpRes.leveledUp,
      prevLevel: xpRes.prevLevel,
      newLevel: xpRes.newLevel,
      newlyUnlockedAchievements: achRes.unlocked,
      targets: { gold: def.gold, silver: def.silver, bronze: def.bronze },
      driverProfile: xpRes.profile,
      creditsAfter: this.state.credits,
    };
  }

  selectSponsorContract(contractId) {
    if (contractId === null || contractId === '') {
      this.state.activeSponsorContractId = null;
      this._save();
      return { ok: true, contractId: null, activeContract: null };
    }
    const found = SPONSOR_OBJECTIVES_CATALOG.find((o) => o.id === contractId);
    if (!found) {
      return {
        ok: false,
        reason: 'INVALID_CONTRACT',
        contractId: this.state.activeSponsorContractId,
        activeContract: this.getActiveSponsorContract(),
      };
    }
    this.state.activeSponsorContractId = found.id;
    this._save();
    return {
      ok: true,
      contractId: found.id,
      activeContract: this.getActiveSponsorContract(),
    };
  }

  getActiveSponsorContract() {
    const id = this.state.activeSponsorContractId;
    if (!id) return null;
    const def = SPONSOR_OBJECTIVES_CATALOG.find((o) => o.id === id);
    if (!def) return null;
    const boostedBonus = Math.round(def.bonus * 1.5);
    return {
      ...def,
      name: def.title,
      objective: def.desc,
      active: true,
      selected: true,
      isPinned: true,
      multiplier: 1.5,
      baseBonus: def.bonus,
      bonus: boostedBonus,
      bonusCredits: boostedBonus,
      payout: boostedBonus,
      amount: boostedBonus,
      boostedBonus,
      boostedAmount: boostedBonus,
      formattedBaseBonus: `+${formatCredits(def.bonus)}`,
      formattedBonus: `+${formatCredits(boostedBonus)}`,
      formattedBoostedBonus: `+${formatCredits(boostedBonus)}`,
    };
  }

  getSponsorContracts() {
    const activeId = this.state.activeSponsorContractId;
    return SPONSOR_OBJECTIVES_CATALOG.map((o) => {
      const isPinned = o.id === activeId;
      const boostedBonus = Math.round(o.bonus * 1.5);
      return {
        ...o,
        name: o.title,
        objective: o.desc,
        selected: isPinned,
        active: isPinned,
        isPinned,
        multiplier: 1.5,
        baseBonus: o.bonus,
        bonus: boostedBonus,
        bonusCredits: boostedBonus,
        payout: boostedBonus,
        amount: boostedBonus,
        boostedBonus,
        formattedBaseBonus: `+${formatCredits(o.bonus)}`,
        formattedBonus: `+${formatCredits(boostedBonus)}`,
      };
    });
  }

  getAllSponsorContracts() {
    return this.getSponsorContracts();
  }

  getSelectedTeam() {
    return TEAM_CATALOG[this.state.teamId] || TEAM_CATALOG.NAMCO_WORKS;
  }

  selectTeam(teamId) {
    if (TEAM_CATALOG[teamId]) {
      this.state.teamId = teamId;
      this._save();
    }
    return this.getSelectedTeam();
  }

  setDriverProfile(name, number) {
    if (typeof name === 'string' && name.trim().length > 0) {
      this.state.driverName = name.trim().slice(0, 24);
    }
    if (number !== undefined && number !== null && Number.isFinite(Number(number))) {
      this.state.driverNumber = clamp(Math.round(Number(number)), 1, 99);
    }
    this._save();
    return {
      driverName: this.state.driverName,
      driverNumber: this.state.driverNumber,
    };
  }

  getCurrentRound() {
    const idx = clamp(this.state.currentRoundIdx, 0, CHAMPIONSHIP_CALENDAR.length - 1);
    const entry = CHAMPIONSHIP_CALENDAR[idx];
    const resolvedTrackId = resolveCalendarTrackId(entry.trackId);
    return {
      ...entry,
      roundIndex: idx,
      resolvedTrackId,
      usedFallbackTrack: resolvedTrackId !== entry.trackId,
      sponsorObjectives: this.getWeekendSponsorObjectives(),
      activeSponsorContract: this.getActiveSponsorContract(),
    };
  }

  getWeekendSponsorObjectives() {
    const activeId = this.state.activeSponsorContractId;
    return SPONSOR_OBJECTIVES_CATALOG.map((o) => {
      const isPinned = o.id === activeId;
      const effectiveBonus = isPinned ? Math.round(o.bonus * 1.5) : o.bonus;
      return {
        ...o,
        baseBonus: o.bonus,
        bonus: effectiveBonus,
        effectiveBonus,
        isPinned,
        active: isPinned,
        multiplier: isPinned ? 1.5 : 1.0,
        formattedBaseBonus: `+${formatCredits(o.bonus)}`,
        formattedBonus: `+${formatCredits(effectiveBonus)}`,
      };
    });
  }

  // --------------------------------------------------------------------------
  // CAR PARTS R&D GARAGE (LEVELS 1 TO 5 WITH CONCRETE TELEMETRY DELTAS)
  // --------------------------------------------------------------------------
  _computeStepDeltaText(branchId, curPart, nextPart) {
    if (!nextPart) return 'MAX WORKS HOMOLOGATION SPEC';
    if (branchId === 'powertrain') {
      const dSpd = (nextPart.topSpeedBonusKmh - curPart.topSpeedBonusKmh).toFixed(1);
      const dPwr = ((nextPart.powerMult - curPart.powerMult) * 100).toFixed(1);
      return `${nextPart.name}: +${dSpd} km/h Vmax • +${dPwr}% Power (${nextPart.telemetryDelta})`;
    }
    if (branchId === 'aero') {
      const dGrip = ((nextPart.aeroGripMult - curPart.aeroGripMult) * 100).toFixed(1);
      const dDrs = (nextPart.drsBonusKmh - curPart.drsBonusKmh).toFixed(1);
      return `${nextPart.name}: +${dGrip}% Cornering Grip • +${dDrs} km/h DRS (${nextPart.telemetryDelta})`;
    }
    if (branchId === 'chassis') {
      const dBrkM = Math.abs((nextPart.brakingDistDeltaM || 0) - (curPart.brakingDistDeltaM || 0)).toFixed(1);
      const dAgil = ((nextPart.agilityMult - curPart.agilityMult) * 100).toFixed(1);
      return `${nextPart.name}: -${dBrkM}m Braking Dist • +${dAgil}% Agility (${nextPart.telemetryDelta})`;
    }
    if (branchId === 'tires') {
      const dDeg = Math.round((curPart.tireWearMult - nextPart.tireWearMult) * 100);
      const dTemp = nextPart.thermalWindowBonusC - curPart.thermalWindowBonusC;
      return `${nextPart.name}: -${dDeg}% Tire Deg/Lap • +${dTemp}°C Window (${nextPart.telemetryDelta})`;
    }
    if (branchId === 'pitCrew') {
      const dStopPct = Math.round((curPart.pitStopDurationMult - nextPart.pitStopDurationMult) * 100);
      const dClutch = Math.round((nextPart.clutchZoneBonus - curPart.clutchZoneBonus) * 100);
      return `${nextPart.name}: -${dStopPct}% Pit Stop Time • +${dClutch}% Clutch (${nextPart.telemetryDelta})`;
    }
    return nextPart.summary;
  }

  getUpgradeInfo(branchId) {
    const branch = CAR_PARTS_CATALOG[branchId];
    if (!branch) return null;

    const maxLevel = branch.maxLevel || branch.levels.length;
    const currentLevel = clamp(this.state.partLevels[branchId] || 1, 1, maxLevel);
    const isMaxed = currentLevel >= maxLevel;
    const currentPart = branch.levels[currentLevel - 1];
    const nextPart = isMaxed ? null : branch.levels[currentLevel];
    const nextCost = nextPart ? nextPart.cost : 0;
    const canAfford = !isMaxed && this.state.credits >= nextCost;
    const telemetryDelta = this._computeStepDeltaText(branchId, currentPart, nextPart);

    return {
      branchId: branch.id,
      id: branch.id,
      name: branch.name,
      label: branch.label,
      shortLabel: branch.shortLabel,
      icon: branch.icon,
      description: branch.description,
      currentLevel,
      level: currentLevel,
      maxLevel,
      isMaxed,
      maxed: isMaxed,
      currentPart: { ...currentPart },
      currentPartName: currentPart.name,
      currentSummary: currentPart.summary,
      currentDelta: currentPart.telemetryDelta || currentPart.summary,
      nextLevel: isMaxed ? null : currentLevel + 1,
      nextPart: nextPart ? { ...nextPart } : null,
      nextPartName: nextPart ? nextPart.name : 'WORKS HOMOLOGATION MAX',
      nextSummary: nextPart ? `${nextPart.name} (${nextPart.telemetryDelta || nextPart.summary})` : currentPart.summary,
      nextDelta: nextPart ? (nextPart.telemetryDelta || nextPart.summary) : 'MAX LEVEL',
      telemetryDelta,
      cost: nextCost,
      nextCost,
      canAfford,
      levels: branch.levels.map((lv) => ({ ...lv })),
    };
  }

  getAllUpgradesInfo() {
    return Object.keys(CAR_PARTS_CATALOG).map((id) => this.getUpgradeInfo(id));
  }

  canAffordUpgrade(branchId) {
    const info = this.getUpgradeInfo(branchId);
    if (!info || info.isMaxed) return false;
    return this.state.credits >= info.nextCost;
  }

  purchaseUpgrade(branchId) {
    const info = this.getUpgradeInfo(branchId);
    if (!info) {
      return {
        ok: false,
        success: false,
        reason: 'INVALID_BRANCH',
        message: `Unknown engineering branch "${branchId}".`,
      };
    }
    if (info.isMaxed) {
      return {
        ok: false,
        success: false,
        branchId,
        level: info.currentLevel,
        reason: 'MAX_LEVEL',
        message: `${info.name} is already homologated at Level ${info.maxLevel}.`,
      };
    }
    if (this.state.credits < info.nextCost) {
      return {
        ok: false,
        success: false,
        branchId,
        level: info.currentLevel,
        cost: info.nextCost,
        credits: this.state.credits,
        reason: 'INSUFFICIENT_CREDITS',
        message: `Need ${formatCredits(info.nextCost)} R&D budget (${formatCredits(this.state.credits)} available).`,
      };
    }

    this.state.credits -= info.nextCost;
    const newLevel = info.currentLevel + 1;
    this.state.partLevels[branchId] = newLevel;
    const achRes = this._evaluateAndUnlockAchievements({ upgradedBranch: branchId, upgradedLevel: newLevel });
    const xpRes = this._awardDriverXp(30 + newLevel * 15);
    this._save();

    const unlockedPart = CAR_PARTS_CATALOG[branchId].levels[newLevel - 1];
    return {
      ok: true,
      success: true,
      branchId,
      level: newLevel,
      newLevel,
      part: { ...unlockedPart },
      partName: unlockedPart.name,
      summary: unlockedPart.telemetryDelta || unlockedPart.summary,
      telemetryDelta: unlockedPart.telemetryDelta || unlockedPart.summary,
      costPaid: info.nextCost,
      credits: this.state.credits,
      remainingCredits: this.state.credits,
      newlyUnlockedAchievements: achRes.unlocked,
      achievementBonusCredits: achRes.bonusCredits,
      xpGained: xpRes.xpGained,
      driverProfile: xpRes.profile,
      ratings: this.getCarTelemetryRatings(),
      modifiers: this.getPhysicsModifiers(),
    };
  }

  // --------------------------------------------------------------------------
  // GARAGE SETUP, 0..100 TELEMETRY BARS & 240HZ PHYSICS MODIFIERS
  // --------------------------------------------------------------------------
  setCarSetup(partialSetup = {}) {
    if (partialSetup && typeof partialSetup === 'object') {
      if (partialSetup.wingTrim && CAR_SETUP_OPTIONS.wingTrim[partialSetup.wingTrim]) {
        this.state.carSetup.wingTrim = partialSetup.wingTrim;
      }
      if (partialSetup.fuelLoad && CAR_SETUP_OPTIONS.fuelLoad[partialSetup.fuelLoad]) {
        this.state.carSetup.fuelLoad = partialSetup.fuelLoad;
      }
      if (partialSetup.stintStrategy && CAR_SETUP_OPTIONS.stintStrategy[partialSetup.stintStrategy]) {
        this.state.carSetup.stintStrategy = partialSetup.stintStrategy;
      }
      this._save();
    }
    return { ...this.state.carSetup };
  }

  getPhysicsModifiers() {
    const team = this.getSelectedTeam();
    const tm = team.modifiers;

    const ptLv = clamp(this.state.partLevels.powertrain || 1, 1, 5);
    const aeroLv = clamp(this.state.partLevels.aero || 1, 1, 5);
    const chasLv = clamp(this.state.partLevels.chassis || 1, 1, 5);
    const tireLv = clamp(this.state.partLevels.tires || 1, 1, 5);
    const pitLv = clamp(this.state.partLevels.pitCrew || 1, 1, 5);

    const ptSpec = CAR_PARTS_CATALOG.powertrain.levels[ptLv - 1];
    const aeroSpec = CAR_PARTS_CATALOG.aero.levels[aeroLv - 1];
    const chasSpec = CAR_PARTS_CATALOG.chassis.levels[chasLv - 1];
    const tireSpec = CAR_PARTS_CATALOG.tires.levels[tireLv - 1];
    const pitSpec = CAR_PARTS_CATALOG.pitCrew.levels[pitLv - 1];

    const wingOpt =
      CAR_SETUP_OPTIONS.wingTrim[this.state.carSetup.wingTrim] ||
      CAR_SETUP_OPTIONS.wingTrim.BALANCED;
    const fuelOpt =
      CAR_SETUP_OPTIONS.fuelLoad[this.state.carSetup.fuelLoad] ||
      CAR_SETUP_OPTIONS.fuelLoad.STANDARD;
    const stintOpt =
      CAR_SETUP_OPTIONS.stintStrategy[this.state.carSetup.stintStrategy] ||
      CAR_SETUP_OPTIONS.stintStrategy.ONE_STOP_SM;

    // Subtle downforce vs tire-scrub interaction
    const wingWearTrim =
      wingOpt.id === 'HIGH_DOWNFORCE' ? 0.985 : (wingOpt.id === 'LOW_DRAG' ? 1.015 : 1.0);

    const powerMult = Number((tm.powerMult * ptSpec.powerMult).toFixed(4));
    const topSpeedBonusKmh = Number(
      (tm.topSpeedBonusKmh + ptSpec.topSpeedBonusKmh + wingOpt.topSpeedBonusKmh).toFixed(2)
    );
    const aeroGripMult = Number(
      (tm.aeroGripMult * aeroSpec.aeroGripMult * wingOpt.aeroGripMult).toFixed(4)
    );
    const brakeMult = Number(
      (tm.brakeMult * chasSpec.brakeMult * wingOpt.brakeTrimMult).toFixed(4)
    );
    const agilityMult = Number(
      (tm.agilityMult * chasSpec.agilityMult * fuelOpt.agilityTrimMult).toFixed(4)
    );
    const tireWearMult = Number(
      (tm.tireWearMult * tireSpec.tireWearMult * wingWearTrim).toFixed(4)
    );
    const pitStopDurationMult = Number(
      (tm.pitStopDurationMult * pitSpec.pitStopDurationMult).toFixed(4)
    );
    const clutchZoneBonus = Number(
      (tm.clutchZoneBonus + pitSpec.clutchZoneBonus).toFixed(4)
    );
    const fuelLoadMult = Number(fuelOpt.fuelLoadMult.toFixed(2));

    return {
      powerMult,
      topSpeedBonusKmh,
      aeroGripMult,
      brakeMult,
      agilityMult,
      tireWearMult,
      pitStopDurationMult,
      clutchZoneBonus,
      fuelLoadMult,
      // Additional integrated engineering parameters
      drsBonusKmh: Number(aeroSpec.drsBonusKmh.toFixed(2)),
      brakingDistDeltaM: Number((chasSpec.brakingDistDeltaM || 0).toFixed(1)),
      tireDegReductionPct: Math.round((1.0 - tireWearMult) * 100),
      thermalWindowBonusC: tireSpec.thermalWindowBonusC,
      pitErrorProbMult: Number(pitSpec.errorProbMult.toFixed(3)),
      wetGripBonus: Number((tm.wetGripBonus || 0).toFixed(3)),
      startingCompound: stintOpt.startingCompound,
      nextCompound: stintOpt.nextCompound,
      recommendedCrewPushMode: stintOpt.crewPushMode,
    };
  }

  getCarTelemetryRatings() {
    const mods = this.getPhysicsModifiers();

    // Map real physics multipliers onto satisfying 0..100 Garage UI telemetry bars
    const speedRaw = 70 + mods.topSpeedBonusKmh * 1.75 + (mods.drsBonusKmh || 0) * 1.1;
    const accelRaw =
      69 +
      (mods.powerMult - 1.0) * 330 +
      (1.0 - mods.fuelLoadMult) * 24;
    const downforceRaw =
      69 +
      (mods.aeroGripMult - 1.0) * 225 +
      (1.0 - mods.tireWearMult) * 18;
    const brakingRaw =
      69 +
      (mods.brakeMult - 1.0) * 215 +
      (mods.agilityMult - 1.0) * 95;
    const pitCrewRaw =
      68 +
      (1.0 - mods.pitStopDurationMult) * 96 +
      mods.clutchZoneBonus * 65;

    const speed = clamp(Math.round(speedRaw), 0, 100);
    const acceleration = clamp(Math.round(accelRaw), 0, 100);
    const downforce = clamp(Math.round(downforceRaw), 0, 100);
    const braking = clamp(Math.round(brakingRaw), 0, 100);
    const pitCrew = clamp(Math.round(pitCrewRaw), 0, 100);

    return {
      speed,
      acceleration,
      downforce,
      braking,
      pitCrew,
      overall: Math.round((speed + acceleration + downforce + braking + pitCrew) / 5),
    };
  }

  // --------------------------------------------------------------------------
  // TEAM PRINCIPAL PRE-RACE STRATEGY & NEMESIS BRIEFING
  // --------------------------------------------------------------------------
  _buildNemesisBriefing() {
    const standings = this.getChampionshipStandings();
    const playerRow = standings.find((r) => r.isPlayer) || standings[0];
    const nemesisRow = standings.find((r) => !r.isPlayer) || standings[1] || playerRow;
    const deltaPts = playerRow.points - nemesisRow.points;

    let summary;
    if (playerRow.points === 0 && nemesisRow.points === 0) {
      summary = `Championship Opener vs Rival ${nemesisRow.driverName}: P1 + Pole + Fastest Lap banks a 28-pt lead!`;
    } else if (deltaPts > 0) {
      summary = `Championship Leader (P1, +${deltaPts} pts ahead of #2 Nemesis ${nemesisRow.driverName}) — cover their pit stop to protect the crown!`;
    } else if (deltaPts < 0) {
      summary = `Chasing Leader ${nemesisRow.driverName} (-${Math.abs(deltaPts)} pts gap from P${playerRow.rank}) — attack with an undercut & Fastest Lap (+1 pt)!`;
    } else {
      summary = `Tied on ${playerRow.points} pts with Nemesis ${nemesisRow.driverName} — finish ahead on track to seize solo P1!`;
    }

    return {
      playerRank: playerRow.rank,
      playerPoints: playerRow.points,
      nemesisName: nemesisRow.driverName,
      nemesisPoints: nemesisRow.points,
      pointsDelta: deltaPts,
      summary,
    };
  }

  getStrategyBriefing(trackId, totalLaps = PRO_2026_LENGTHS.SHORT.laps, weatherId = 'HOT_SUNNY') {
    const currentRound = this.getCurrentRound();
    const rawTrackId = trackId || currentRound.trackId;
    const resolvedTrackId = resolveCalendarTrackId(rawTrackId);
    const trackDef = TRACK_CATALOG[resolvedTrackId] || TRACK_CATALOG.FUJI_1982;
    const calEntry =
      CHAMPIONSHIP_CALENDAR.find((r) => r.trackId === rawTrackId) ||
      CHAMPIONSHIP_CALENDAR.find((r) => r.resolvedTrackId === resolvedTrackId) ||
      currentRound;

    const laps = Math.max(1, Math.round(finiteOr(totalLaps, 5)));
    const isRandomWeather = !weatherId || weatherId === 'RANDOM';
    const effectiveWeatherId =
      !isRandomWeather && WEATHER_REGIMES[weatherId]
        ? weatherId
        : (trackDef.forceNight ? 'NEON_NIGHT' : 'HOT_SUNNY');
    const weatherDef = WEATHER_REGIMES[effectiveWeatherId] || WEATHER_REGIMES.HOT_SUNNY;

    const profile =
      CIRCUIT_STRATEGY_PROFILES[rawTrackId] ||
      CIRCUIT_STRATEGY_PROFILES[resolvedTrackId] ||
      CIRCUIT_STRATEGY_PROFILES.FUJI_1982;

    const mods = this.getPhysicsModifiers();
    const userStint =
      CAR_SETUP_OPTIONS.stintStrategy[this.state.carSetup.stintStrategy] ||
      CAR_SETUP_OPTIONS.stintStrategy.ONE_STOP_SM;

    // 1. Optimal Starting Tire & Next Pit Compound
    const isHeavyWet = effectiveWeatherId === 'MONSOON_STORM' || weatherDef.moisture >= 0.60;
    const isLightRain =
      !isHeavyWet && (effectiveWeatherId === 'LIGHT_DRIZZLE' || weatherDef.rainIntensity > 0.15);
    const isWetRace = isHeavyWet || isLightRain;

    let optimalStartingTire = 'SOFT';
    let nextPitCompound = 'MEDIUM';
    let expectedStops = 1;
    let wingRecommendation = profile.wing;

    if (isHeavyWet) {
      optimalStartingTire = 'FULL_WET';
      nextPitCompound = 'FULL_WET';
      wingRecommendation = 'HIGH_DOWNFORCE';
    } else if (isLightRain) {
      optimalStartingTire = 'INTERMEDIATE';
      nextPitCompound = 'INTERMEDIATE';
      if (wingRecommendation === 'LOW_DRAG') wingRecommendation = 'BALANCED';
    } else if (userStint.id === 'TWO_STOP_ATTACK' && laps >= 8) {
      optimalStartingTire = 'SOFT';
      nextPitCompound = 'SOFT';
      expectedStops = 2;
    } else if (
      userStint.id === 'ONE_STOP_MH' ||
      (laps >= 12 && calEntry.tireStress === 'HIGH' && mods.tireWearMult > 0.90)
    ) {
      optimalStartingTire = 'MEDIUM';
      nextPitCompound = laps >= 18 ? 'HARD' : 'SOFT';
    } else {
      optimalStartingTire = 'SOFT';
      nextPitCompound = 'MEDIUM';
    }

    // 2. Target Pit Window Lap (adjusted for Tire R&D wear bonus & circuit stress)
    const rAndDLapBonus = mods.tireWearMult <= 0.84 ? 1 : 0;
    let targetPitWindowLap;
    if (laps <= 3) {
      targetPitWindowLap = 2;
    } else if (laps <= 6) {
      targetPitWindowLap = clamp(
        Math.round(laps * 0.52) + (optimalStartingTire === 'MEDIUM' ? 1 : 0),
        2,
        laps - 1
      );
    } else if (expectedStops === 2) {
      targetPitWindowLap = clamp(Math.round(laps * 0.34) + rAndDLapBonus, 2, laps - 3);
    } else {
      const ratio = optimalStartingTire === 'MEDIUM' ? 0.56 : 0.44;
      targetPitWindowLap = clamp(
        Math.round(laps * ratio) + rAndDLapBonus + (profile.undercutDelta || 0),
        2,
        laps - 1
      );
    }

    const windowStart = Math.max(2, targetPitWindowLap - 1);
    const windowEnd = Math.min(Math.max(2, laps - 1), targetPitWindowLap + 1);
    const pitWindowLabel =
      laps <= 3
        ? `LAP ${targetPitWindowLap} SPRINT BOX`
        : `LAP ${targetPitWindowLap} (WINDOW L${windowStart}–L${windowEnd})`;

    const wingOpt =
      CAR_SETUP_OPTIONS.wingTrim[wingRecommendation] || CAR_SETUP_OPTIONS.wingTrim.BALANCED;
    const startTireDef = TIRE_COMPOUNDS[optimalStartingTire] || TIRE_COMPOUNDS.SOFT;
    const nextTireDef = TIRE_COMPOUNDS[nextPitCompound] || TIRE_COMPOUNDS.MEDIUM;

    const crewModeKey =
      mods.pitStopDurationMult <= 0.85 || rawTrackId === 'MONACO_HARBOR'
        ? 'AGGRESSIVE_UNDERCUT'
        : userStint.crewPushMode || 'BALANCED';
    const crewModeDef = PIT_CREW_MODES[crewModeKey] || PIT_CREW_MODES.BALANCED;
    const estStopSec = Number((crewModeDef.baseTireSec * mods.pitStopDurationMult).toFixed(2));

    // Team Principal Nemesis & Telemetry Delta Briefing
    const nemesis = this._buildNemesisBriefing();

    let baseAdvice = profile.undercutNote;
    if (isHeavyWet) {
      baseAdvice =
        'Standing water active! Launch on Full Wet (Blue) tread to prevent >192 km/h hydroplaning and pit under VSC if wing damage occurs.';
    } else if (isLightRain) {
      baseAdvice =
        'Damp 34% groove favours Green Intermediates (+6% wet bite). Box onto fresh Inters at mid-distance or immediately under a Virtual Safety Car.';
    } else if (isRandomWeather) {
      baseAdvice = `${profile.undercutNote} ( Pit Wall auto-fits Inters/Wets on the grid if RANDOM weather rolls rain!)`;
    }

    const undercutAdvice = `${baseAdvice} • 🏆 ${nemesis.summary}`;

    const wingReason = isHeavyWet
      ? 'Monsoon standing water overrides low-drag setups — run High Downforce (+6.5% grip) to keep the rear planted.'
      : profile.wingReason;

    const watchoutsWithNemesis = [
      nemesis.summary,
      ...profile.watchouts.slice(0, 2),
    ];

    return {
      trackId: rawTrackId,
      resolvedTrackId,
      circuitName: calEntry.fullLabel || trackDef.name,
      engineerNote: calEntry.engineerNote || profile.wingReason,
      keyCorner: calEntry.keyCorner || '',
      brakingSeverity: calEntry.brakingSeverity || '',
      weatherId: isRandomWeather ? 'RANDOM' : effectiveWeatherId,
      weatherLabel: isRandomWeather
        ? 'RANDOM RACE FORECAST'
        : `${weatherDef.icon} ${weatherDef.label}`,
      isWetRace,
      totalLaps: laps,
      // Core Engineer Strategy Fields
      optimalStartingTire,
      startingCompound: optimalStartingTire,
      nextPitCompound,
      expectedStops,
      stintPlanLabel: `${expectedStops}-STOP: ${startTireDef.name} (${startTireDef.short}) → ${nextTireDef.name} (${nextTireDef.short})`,
      targetPitWindowLap,
      pitWindowRange: [windowStart, windowEnd],
      pitWindowLabel,
      wingRecommendation,
      wingRecommendationLabel: `${wingOpt.shortLabel} (${wingOpt.desc})`,
      wingReason,
      undercutAdvice,
      nemesisBriefing: nemesis.summary,
      nemesisAnalysis: nemesis,
      sponsorObjectives: this.getWeekendSponsorObjectives(),
      recommendedFuelLoad: laps <= 5 ? 'LIGHT' : (laps >= 20 ? 'HEAVY' : 'STANDARD'),
      recommendedCrewMode: crewModeKey,
      estimatedPitStopSec: estStopSec,
      headline: `BOX LAP ${targetPitWindowLap} • START ${startTireDef.name} • ${wingOpt.shortLabel} WING`,
      keyWatchouts: watchoutsWithNemesis,
    };
  }

  // Alias `getStrategyRecommendation` -> `getStrategyBriefing`
  getStrategyRecommendation(trackId, totalLaps = PRO_2026_LENGTHS.SHORT.laps, weatherId = 'HOT_SUNNY') {
    return this.getStrategyBriefing(trackId, totalLaps, weatherId);
  }

  // --------------------------------------------------------------------------
  // CHAMPIONSHIP STANDINGS & RACE WEEKEND SCORING / SPONSOR PAYOUTS
  // --------------------------------------------------------------------------
  _matchRosterDriver(entry) {
    if (!entry) return null;
    if (entry.short) {
      const byShort = AI_DRIVER_ROSTER.find((d) => d.short === entry.short);
      if (byShort) return byShort;
    }
    if (entry.carNum !== undefined && entry.carNum !== null) {
      const byNum = AI_DRIVER_ROSTER.find((d) => d.num === Number(entry.carNum));
      if (byNum) return byNum;
    }
    if (typeof entry.name === 'string') {
      const clean = entry.name.trim().toLowerCase();
      const byName = AI_DRIVER_ROSTER.find(
        (d) =>
          clean === d.name.toLowerCase() ||
          clean.startsWith(d.name.toLowerCase()) ||
          clean === d.short.toLowerCase()
      );
      if (byName) return byName;
    }
    return null;
  }

  getChampionshipStandings(pointsMapOverride = null, roundHistoryOverride = null) {
    const ptsMap = pointsMapOverride || this.state.driverPoints;
    const history = roundHistoryOverride || this.state.roundHistory;
    const team = this.getSelectedTeam();
    const playerSeasonWins = history.filter((r) => r.finishPos === 1).length;

    const rows = [
      {
        key: 'PLAYER',
        id: 'PLAYER',
        name: `${this.state.driverName} #${this.state.driverNumber}`,
        driverName: this.state.driverName,
        short: this.state.driverName.slice(0, 3).toUpperCase(),
        number: this.state.driverNumber,
        isPlayer: true,
        teamId: team.id,
        teamName: team.name,
        primaryHex: team.primaryHex,
        accentHex: team.accentHex,
        points: Math.max(0, Math.round(finiteOr(ptsMap.PLAYER, 0))),
        seasonWins: playerSeasonWins,
      },
    ];

    for (let i = 0; i < AI_DRIVER_ROSTER.length; i++) {
      const d = AI_DRIVER_ROSTER[i];
      rows.push({
        key: d.name,
        id: `AI_${d.short}`,
        name: `${d.name} #${d.num}`,
        driverName: d.name,
        short: d.short,
        number: d.num,
        isPlayer: false,
        teamId: null,
        teamName: `${d.archetype.replace('_', ' ')}`,
        primaryHex: toCssHex(d.primary),
        accentHex: toCssHex(d.accent),
        points: Math.max(0, Math.round(finiteOr(ptsMap[d.name], 0))),
        seasonWins: 0,
        _rosterIdx: i,
      });
    }

    rows.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.seasonWins !== a.seasonWins) return b.seasonWins - a.seasonWins;
      if (a.isPlayer !== b.isPlayer) return a.isPlayer ? -1 : 1;
      return (a._rosterIdx ?? 0) - (b._rosterIdx ?? 0);
    });

    const leaderPts = rows[0]?.points || 0;
    return rows.map((row, idx) => {
      const { _rosterIdx, ...cleanRow } = row;
      return {
        ...cleanRow,
        rank: idx + 1,
        gapToLeader: idx === 0 ? 0 : leaderPts - row.points,
      };
    });
  }

  _awardDriverXp(amount) {
    const safeAdd = Math.max(0, Math.round(finiteOr(amount, 0)));
    const before = computeDriverLevelProfile(this.state.driverXp);
    this.state.driverXp = Math.max(0, Math.round(finiteOr(this.state.driverXp, 0)) + safeAdd);
    const after = computeDriverLevelProfile(this.state.driverXp);
    return {
      xpGained: safeAdd,
      prevLevel: before.level,
      newLevel: after.level,
      leveledUp: after.level > before.level,
      prevLicenseTitle: before.licenseTitle,
      newLicenseTitle: after.licenseTitle,
      licensePromoted: after.licenseId !== before.licenseId,
      profile: {
        ...after,
        driverName: this.state.driverName,
        driverNumber: this.state.driverNumber,
      },
    };
  }

  _computeSessionXp(summary = {}) {
    const mode = String(summary.mode || summary.sessionMode || '').toUpperCase();
    const isTimeTrial = mode === 'TIME_TRIAL' || Boolean(summary.isTimeTrial);
    if (isTimeTrial) {
      const laps = Math.max(1, Math.round(finiteOr(summary.lapsCompleted ?? summary.laps, 1)));
      const pbBonus = summary.isPersonalBest || summary.isNewBest ? 30 : 0;
      return 60 + Math.min(120, laps * 20) + pbBonus;
    }

    const rawPos = summary.finishPos ?? summary.playerFinishPos ?? summary.position ?? summary.pos;
    const pos = Number.isFinite(Number(rawPos)) && Number(rawPos) >= 1 ? Math.round(Number(rawPos)) : null;
    const gridRaw = summary.gridPos ?? summary.qualiPos ?? summary.qualifyingPos ?? summary.startPos;
    const grid = Number.isFinite(Number(gridRaw)) && Number(gridRaw) >= 1 ? Math.round(Number(gridRaw)) : null;
    const passes = Math.max(
      0,
      Math.round(finiteOr(summary.cleanOvertakes ?? summary.overtakes ?? summary.overtakesCount ?? summary.passes, 0))
    );
    const laps = Math.max(1, Math.round(finiteOr(summary.lapsCompleted ?? summary.totalLaps ?? summary.laps, 3)));

    let xp = 120 + Math.min(120, laps * 8);
    if (pos !== null) {
      if (pos === 1) xp += 220;
      else if (pos === 2) xp += 165;
      else if (pos === 3) xp += 130;
      else if (pos <= 10) xp += (11 - pos) * 14;
      else xp += 20;
    }
    xp += Math.min(120, passes * 15);
    if (grid === 1 || summary.gotPole) xp += 30;
    if (summary.fastestLap === true || summary.gotFastestLap === true) xp += 35;
    if (summary.cleanRace === true || summary.zeroDamage === true) xp += 40;
    return Math.max(40, Math.round(xp));
  }

  _evaluateAndUnlockAchievements(ctx = {}) {
    if (!this.state.unlockedAchievements || typeof this.state.unlockedAchievements !== 'object') {
      this.state.unlockedAchievements = {};
    }

    const rawPos = ctx.finishPos ?? ctx.playerFinishPos ?? ctx.position ?? ctx.pos;
    const pos = Number.isFinite(Number(rawPos)) && Number(rawPos) >= 1 ? Math.round(Number(rawPos)) : null;
    const rawGrid = ctx.gridPos ?? ctx.qualiPos ?? ctx.qualifyingPos ?? ctx.startPos;
    const grid = Number.isFinite(Number(rawGrid)) && Number(rawGrid) >= 1 ? Math.round(Number(rawGrid)) : null;
    const passes = Math.max(
      0,
      Math.round(finiteOr(ctx.cleanOvertakes ?? ctx.overtakes ?? ctx.overtakesCount ?? ctx.passes, 0))
    );

    // Launch reaction time in seconds (supports reactionSec, launchReactionSec, reactionMs, or PERFECT grade)
    let reactionSec = null;
    if (ctx.reactionSec !== undefined && ctx.reactionSec !== null && Number.isFinite(Number(ctx.reactionSec))) {
      reactionSec = Number(ctx.reactionSec);
    } else if (
      ctx.launchReactionSec !== undefined &&
      ctx.launchReactionSec !== null &&
      Number.isFinite(Number(ctx.launchReactionSec))
    ) {
      reactionSec = Number(ctx.launchReactionSec);
    } else if (ctx.reactionMs !== undefined && ctx.reactionMs !== null && Number.isFinite(Number(ctx.reactionMs))) {
      reactionSec = Number(ctx.reactionMs) / 1000.0;
    }

    // Damage / zero-damage check
    const rawDamage =
      ctx.maxDamage ?? ctx.totalDamage ?? ctx.wingDamage ?? ctx.damage ?? null;
    const hasNumericZeroDamage =
      rawDamage !== null && Number.isFinite(Number(rawDamage)) && Number(rawDamage) <= 0.015;
    const isZeroDamageSession =
      ctx.zeroDamage === true ||
      hasNumericZeroDamage ||
      (ctx.cleanRace === true && (rawDamage === null || Number(rawDamage) <= 0.015));

    // Peak speed km/h
    const maxSpeedKmh = finiteOr(
      ctx.maxSpeedKmh ?? ctx.topSpeedKmh ?? ctx.peakSpeedKmh ?? ctx.speedKmh,
      0
    );

    // Fastest pit stop duration in seconds
    const rawPitSec =
      ctx.bestPitStopSec ?? ctx.bestPitSec ?? ctx.fastestPitSec ?? ctx.minPitStopSec ?? ctx.pitStopSec;
    const bestPitSec =
      rawPitSec !== undefined && rawPitSec !== null && Number.isFinite(Number(rawPitSec)) && Number(rawPitSec) > 0
        ? Number(rawPitSec)
        : null;

    // Wet weather check
    const weatherId = String(ctx.weatherId ?? ctx.weatherRegime ?? ctx.weather ?? '').toUpperCase();
    const moisture = finiteOr(ctx.moisture ?? ctx.weatherMoisture ?? ctx.grooveMoisture, 0);
    const isWetConditions =
      ctx.isWet === true ||
      ctx.wetRace === true ||
      moisture >= 0.20 ||
      weatherId === 'LIGHT_DRIZZLE' ||
      weatherId === 'MONSOON_STORM';

    // Time Trial Gold check across any circuit
    const hasAnyGoldMedal =
      ctx.medalEarned === 'GOLD' ||
      Object.values(this.state.medalsByTrack || {}).some((m) => Boolean(m && m.gold));

    // R&D Level 3+ check across any engineering branch
    const hasLv3Part = Object.values(this.state.partLevels || {}).some((lv) => finiteOr(lv, 1) >= 3);

    const conditions = {
      FIRST_PODIUM: (pos !== null && pos <= 3) || (this.state.stats?.podiums || 0) >= 1,
      FIRST_VICTORY: pos === 1 || (this.state.stats?.wins || 0) >= 1,
      LIGHTNING_START:
        (reactionSec !== null && reactionSec > 0 && reactionSec < 0.23) ||
        String(ctx.launchReactionGrade || '').toUpperCase() === 'PERFECT',
      OVERTAKE_ACE: passes >= 5,
      CLEAN_DRIVER: pos !== null && pos <= 10 && isZeroDamageSession,
      SPEED_DEMON: maxSpeedKmh >= 325.0,
      SUB_22_PIT: bestPitSec !== null && bestPitSec < 2.25,
      RAIN_MASTER: pos !== null && pos <= 3 && isWetConditions,
      TIME_TRIAL_GOLD: hasAnyGoldMedal,
      RND_ENGINEER: hasLv3Part,
      POLE_SITTER: grid === 1 || ctx.gotPole === true || (this.state.stats?.poles || 0) >= 1,
      WORLD_CHAMPION:
        ctx.crownedWorldChampion === true || (this.state.stats?.championships || 0) >= 1,
    };

    const unlocked = [];
    let bonusCredits = 0;
    const nowTs = Date.now();

    for (let i = 0; i < ACHIEVEMENTS_CATALOG.length; i++) {
      const ach = ACHIEVEMENTS_CATALOG[i];
      if (this.state.unlockedAchievements[ach.id]) continue;
      if (conditions[ach.id]) {
        this.state.unlockedAchievements[ach.id] = nowTs;
        this.state.credits += ach.bonus;
        this.state.stats.totalEarnings += ach.bonus;
        bonusCredits += ach.bonus;
        unlocked.push({
          id: ach.id,
          title: ach.title,
          name: ach.name,
          desc: ach.desc,
          icon: ach.icon,
          bonus: ach.bonus,
          formattedBonus: `+${formatCredits(ach.bonus)}`,
          unlocked: true,
          unlockedAt: nowTs,
        });
      }
    }

    return { unlocked, bonusCredits };
  }

  recordSessionSummary(summary = {}) {
    const safeSummary = summary && typeof summary === 'object' ? summary : {};
    const mode = String(safeSummary.mode || safeSummary.sessionMode || '').toUpperCase();
    const isCareerLinked =
      Boolean(safeSummary.isCareerRound || safeSummary.isCareerWeekend || mode === 'CAREER') &&
      this._lastCareerWeekendRecordAt > 0 &&
      Date.now() - this._lastCareerWeekendRecordAt < 2500;

    let xpRes;
    let combinedUnlocked = [];
    let combinedBonusCredits = 0;

    if (isCareerLinked && this._lastCareerWeekendXpResult) {
      // Career weekend already awarded base race XP in recordRaceWeekendResult;
      // still evaluate rich telemetry milestones (reactionSec, maxSpeedKmh, bestPitStopSec, isWet) idempotently!
      xpRes = this._lastCareerWeekendXpResult;
      const extraAch = this._evaluateAndUnlockAchievements(safeSummary);
      const prevAch = Array.isArray(this._lastCareerWeekendAchievements)
        ? this._lastCareerWeekendAchievements
        : [];
      combinedUnlocked = [...prevAch, ...extraAch.unlocked];
      combinedBonusCredits = (this._lastCareerWeekendAchBonus || 0) + extraAch.bonusCredits;
      this._lastCareerWeekendRecordAt = 0;
    } else {
      const rawPos = safeSummary.finishPos ?? safeSummary.playerFinishPos ?? safeSummary.position ?? safeSummary.pos;
      const pos = Number.isFinite(Number(rawPos)) && Number(rawPos) >= 1 ? Math.round(Number(rawPos)) : null;

      // Update bestLapByTrack if a valid bestLapTime / bestLapSec was clocked in this session
      const rawLap = safeSummary.bestLapSec ?? safeSummary.bestLapTime;
      if (
        safeSummary.trackId &&
        TIME_TRIAL_MEDALS[safeSummary.trackId] &&
        Number.isFinite(Number(rawLap)) &&
        Number(rawLap) > 10 &&
        Number(rawLap) < 600
      ) {
        const lapVal = Number(rawLap);
        const curTrackBest = this.state.bestLapByTrack?.[safeSummary.trackId];
        if (!Number.isFinite(curTrackBest) || lapVal < curTrackBest) {
          this.state.bestLapByTrack[safeSummary.trackId] = lapVal;
        }
        if (!Number.isFinite(this.state.stats.bestLapSec) || lapVal < this.state.stats.bestLapSec) {
          this.state.stats.bestLapSec = lapVal;
        }
      }

      const sessionXp = this._computeSessionXp({ ...safeSummary, finishPos: pos });
      xpRes = this._awardDriverXp(sessionXp);
      const achRes = this._evaluateAndUnlockAchievements(safeSummary);
      combinedUnlocked = achRes.unlocked;
      combinedBonusCredits = achRes.bonusCredits;
    }

    this._save();

    return {
      xpGained: xpRes.xpGained,
      leveledUp: xpRes.leveledUp,
      prevLevel: xpRes.prevLevel,
      newLevel: xpRes.newLevel,
      licensePromoted: xpRes.licensePromoted,
      licenseTitle: xpRes.profile.licenseTitle,
      licenseColor: xpRes.profile.licenseColor,
      newlyUnlockedAchievements: combinedUnlocked,
      totalBonusCredits: combinedBonusCredits,
      driverProfile: xpRes.profile,
      creditsAfter: this.state.credits,
    };
  }

  _evaluateSponsorBonuses({ finishPos, gridPos, gotFastestLap, overtakes, cleanRace, damage }) {
    const bonuses = [];
    const pinnedId = this.state.activeSponsorContractId;

    // 1. Podium Sweep (+$20,000 base / +$30,000 if pinned 1.5x)
    if (finishPos <= 3) {
      const def = SPONSOR_OBJECTIVES_CATALOG[0];
      bonuses.push(createSponsorBonusItem(def, def.id === pinnedId));
    }

    // 2. Clean Chassis Bonus (+$18,000 base / +$27,000 if pinned 1.5x)
    const isClean =
      cleanRace !== undefined
        ? !!cleanRace
        : (damage !== undefined && Number.isFinite(Number(damage))
          ? Number(damage) <= 0.20
          : finishPos <= 8);
    if (isClean) {
      const def = SPONSOR_OBJECTIVES_CATALOG[1];
      bonuses.push(createSponsorBonusItem(def, def.id === pinnedId));
    }

    // 3. Overtake Hunter 3+ Passes (+$15,000 base / +$22,500 if pinned 1.5x)
    if (overtakes >= 3) {
      const def = SPONSOR_OBJECTIVES_CATALOG[2];
      bonuses.push(createSponsorBonusItem(def, def.id === pinnedId));
    }

    // 4. Fastest Lap Bounty (+$15,000 base / +$22,500 if pinned 1.5x)
    if (gotFastestLap) {
      const def = SPONSOR_OBJECTIVES_CATALOG[3];
      bonuses.push(createSponsorBonusItem(def, def.id === pinnedId));
    }

    // 5. Front-Row Qualifier P1–P2 (+$12,000 base / +$18,000 if pinned 1.5x)
    if (gridPos <= 2) {
      const def = SPONSOR_OBJECTIVES_CATALOG[4];
      bonuses.push(createSponsorBonusItem(def, def.id === pinnedId));
    }

    return bonuses;
  }

  recordRaceWeekendResult(result = {}) {
    const {
      trackId,
      finishPos,
      position,
      gridPos,
      qualifyingPos,
      fastestLap = false,
      overtakes,
      overtakesCount,
      arcadeScore = 0,
      standings = null,
      cleanRace,
      damage,
    } = result || {};

    const roundIdxBefore = clamp(
      this.state.currentRoundIdx,
      0,
      CHAMPIONSHIP_CALENDAR.length - 1
    );
    const roundDef = CHAMPIONSHIP_CALENDAR[roundIdxBefore];
    const effectiveTrackId = trackId || roundDef.trackId;

    const pos = clamp(Math.round(finiteOr(finishPos ?? position, 8)), 1, 20);
    const grid = clamp(Math.round(finiteOr(gridPos ?? qualifyingPos, 5)), 1, 20);
    const passes = Math.max(0, Math.round(finiteOr(overtakes ?? overtakesCount, 0)));
    const score = Math.max(0, Math.round(finiteOr(arcadeScore, 0)));
    const gotPole = grid === 1;

    // Resolve whether Player or an AI rival clocked the Fastest Lap (+1 FIA pt)
    let gotFastestLap = false;
    let fastestAiDriverName = null;

    if (typeof fastestLap === 'boolean') {
      gotFastestLap = fastestLap;
    } else if (typeof fastestLap === 'number' && Number.isFinite(fastestLap) && fastestLap > 0) {
      let bestAiTime = Infinity;
      if (Array.isArray(standings)) {
        for (const s of standings) {
          if (!s?.isPlayer && Number.isFinite(s?.bestLapTime) && s.bestLapTime > 0) {
            if (s.bestLapTime < bestAiTime) {
              bestAiTime = s.bestLapTime;
              fastestAiDriverName = this._matchRosterDriver(s)?.name || null;
            }
          }
        }
      }
      gotFastestLap = bestAiTime < Infinity ? fastestLap <= bestAiTime : pos <= 2;
    } else if (Array.isArray(standings) && standings.length > 0) {
      let bestOverall = Infinity;
      let bestIsPlayer = false;
      for (const s of standings) {
        if (Number.isFinite(s?.bestLapTime) && s.bestLapTime > 0 && s.bestLapTime < bestOverall) {
          bestOverall = s.bestLapTime;
          bestIsPlayer = !!s.isPlayer;
          if (!s.isPlayer) fastestAiDriverName = this._matchRosterDriver(s)?.name || null;
        }
      }
      gotFastestLap = bestOverall < Infinity && bestIsPlayer;
    }

    // 1. Award Player FIA Points (25-18-15-12-10-8-6-4-2-1 + 2 Pole + 1 Fastest Lap)
    const finishPts = FIA_POINTS_SYSTEM.race[pos - 1] || 0;
    const polePts = gotPole ? FIA_POINTS_SYSTEM.pole : 0;
    const fastestLapPts = gotFastestLap ? FIA_POINTS_SYSTEM.fastestLap : 0;
    const playerPointsEarned = finishPts + polePts + fastestLapPts;
    this.state.driverPoints.PLAYER =
      Math.max(0, finiteOr(this.state.driverPoints.PLAYER, 0)) + playerPointsEarned;

    // 2. Build ordered AI classification & award AI FIA Points
    const orderedAiNames = [];
    const seenAi = new Set();

    if (Array.isArray(standings) && standings.length > 0) {
      for (const car of standings) {
        if (car?.isPlayer) continue;
        const matched = this._matchRosterDriver(car);
        if (matched && !seenAi.has(matched.name)) {
          seenAi.add(matched.name);
          orderedAiNames.push(matched.name);
        }
      }
    }

    // Deterministically rank any unrepresented AI drivers so full 10-place FIA grid scores cleanly
    const remainingRoster = AI_DRIVER_ROSTER.filter((d) => !seenAi.has(d.name));
    remainingRoster.sort((a, b) => {
      const wa =
        (ARCHETYPE_PACE_WEIGHT[a.archetype] || 1.0) +
        Math.sin((roundIdxBefore + 1) * 2.1 + a.num * 0.73) * 0.045;
      const wb =
        (ARCHETYPE_PACE_WEIGHT[b.archetype] || 1.0) +
        Math.sin((roundIdxBefore + 1) * 2.1 + b.num * 0.73) * 0.045;
      return wb - wa;
    });
    for (const d of remainingRoster) {
      orderedAiNames.push(d.name);
    }

    let aiCursor = 0;
    for (let rankSlot = 1; rankSlot <= 10; rankSlot++) {
      if (rankSlot === pos) continue; // Player occupies this finishing slot
      const aiName = orderedAiNames[aiCursor++];
      if (!aiName) break;
      const pts = FIA_POINTS_SYSTEM.race[rankSlot - 1] || 0;
      this.state.driverPoints[aiName] =
        Math.max(0, finiteOr(this.state.driverPoints[aiName], 0)) + pts;
    }

    // Award AI Pole (+2) and AI Fastest Lap (+1) if Player did not claim them
    if (!gotPole && orderedAiNames.length > 0) {
      const poleAi = orderedAiNames[0];
      this.state.driverPoints[poleAi] =
        Math.max(0, finiteOr(this.state.driverPoints[poleAi], 0)) + FIA_POINTS_SYSTEM.pole;
    }
    if (!gotFastestLap && orderedAiNames.length > 0) {
      const flAi = fastestAiDriverName || orderedAiNames[Math.min(1, orderedAiNames.length - 1)];
      this.state.driverPoints[flAi] =
        Math.max(0, finiteOr(this.state.driverPoints[flAi], 0)) + FIA_POINTS_SYSTEM.fastestLap;
    }

    // 3. Calculate Weekend Prize Purse ($120,000 – $650,000) + Dynamic Sponsor Bonuses (with 1.5x Title Contract!)
    const FINISH_PURSE_TABLE = [
      480000, // P1
      370000, // P2
      300000, // P3
      245000, // P4
      205000, // P5
      175000, // P6
      155000, // P7
      140000, // P8
      130000, // P9
      120000, // P10+
    ];
    const finishPurse = FINISH_PURSE_TABLE[Math.min(pos - 1, FINISH_PURSE_TABLE.length - 1)];
    const polePurse = gotPole ? 45000 : 0;
    const flPurse = gotFastestLap ? 25000 : 0;
    const passPurse = Math.min(80000, passes * 6500);
    const prestigeAndScorePurse = Math.min(
      35000,
      (roundDef.prestigePurseBonus || 0) * (pos <= 3 ? 1.0 : 0.4) +
        Math.floor(score / 5000) * 2000
    );

    const racePrizeMoney = clamp(
      Math.round(finishPurse + polePurse + flPurse + passPurse + prestigeAndScorePurse),
      120000,
      650000
    );

    const sponsorBonuses = this._evaluateSponsorBonuses({
      finishPos: pos,
      gridPos: grid,
      gotFastestLap,
      overtakes: passes,
      cleanRace,
      damage,
    });
    const sponsorBonusTotal = sponsorBonuses.reduce((sum, b) => sum + b.bonus, 0);

    // 4. Update Lifetime Career Stats & Season Round History
    const completedSeasonNumber = this.state.seasonNumber;
    this.state.stats.races += 1;
    if (pos === 1) this.state.stats.wins += 1;
    if (pos <= 3) this.state.stats.podiums += 1;
    if (gotPole) this.state.stats.poles += 1;
    if (gotFastestLap) this.state.stats.fastestLaps += 1;
    this.state.stats.overtakes += passes;
    this.state.stats.bestFinish =
      this.state.stats.bestFinish === null
        ? pos
        : Math.min(this.state.stats.bestFinish, pos);

    const roundRecord = {
      round: roundIdxBefore + 1,
      trackId: effectiveTrackId,
      gpTitle: roundDef.gpTitle,
      finishPos: pos,
      gridPos: grid,
      gotPole,
      gotFastestLap,
      overtakes: passes,
      pointsEarned: playerPointsEarned,
      prizeMoney: racePrizeMoney,
      sponsorBonusTotal,
      arcadeScore: score,
    };
    this.state.roundHistory.push(roundRecord);

    // Capture Championship Standings snapshot right after Round points are tallied
    const standingsSnapshot = this.getChampionshipStandings();
    const playerStandingRow =
      standingsSnapshot.find((r) => r.isPlayer) || standingsSnapshot[0];
    const playerChampionshipRank = playerStandingRow.rank;
    const playerSeasonPoints = playerStandingRow.points;

    // 5. Check End of Round 6 World Championship Finale & Advance Round / Season N+1
    const seasonCompleted = roundIdxBefore >= CHAMPIONSHIP_CALENDAR.length - 1;
    let crownedWorldChampion = false;
    let trophyBonus = 0;
    let championName = null;
    let seasonFinaleBanner = null;

    if (seasonCompleted) {
      const championRow = standingsSnapshot[0];
      championName = championRow.name;
      crownedWorldChampion = !!championRow.isPlayer;

      if (crownedWorldChampion) {
        trophyBonus = 500000;
        this.state.stats.championships += 1;
        seasonFinaleBanner = `🏆 SEASON ${completedSeasonNumber} FIA WORLD CHAMPION! +${formatCredits(trophyBonus)} TROPHY BONUS`;
      } else if (playerChampionshipRank === 2) {
        trophyBonus = 250000;
        seasonFinaleBanner = `🥈 SEASON ${completedSeasonNumber} VICE-CHAMPION (2ND)! +${formatCredits(trophyBonus)} BONUS`;
      } else if (playerChampionshipRank === 3) {
        trophyBonus = 150000;
        seasonFinaleBanner = `🥉 SEASON ${completedSeasonNumber} 3RD OVERALL! +${formatCredits(trophyBonus)} BONUS`;
      } else {
        trophyBonus = 75000;
        seasonFinaleBanner = `🏁 SEASON ${completedSeasonNumber} COMPLETE (P${playerChampionshipRank}) • +${formatCredits(trophyBonus)} CONSTRUCTORS PAYOUT`;
      }

      this.state.seasonHistory.push({
        seasonNumber: completedSeasonNumber,
        teamId: this.state.teamId,
        playerRank: playerChampionshipRank,
        playerPoints: playerSeasonPoints,
        crownedWorldChampion,
        championName,
        trophyBonus,
      });
      if (this.state.seasonHistory.length > 10) {
        this.state.seasonHistory = this.state.seasonHistory.slice(-10);
      }

      // Roll over cleanly into Season N + 1 while keeping R&D upgrades, team & credits!
      this.state.seasonNumber = completedSeasonNumber + 1;
      this.state.currentRoundIdx = 0;
      this.state.driverPoints = createFreshDriverPointsMap();
      this.state.roundHistory = [];
    } else {
      this.state.currentRoundIdx = roundIdxBefore + 1;
    }

    const totalPayout = racePrizeMoney + sponsorBonusTotal + trophyBonus;
    this.state.credits += totalPayout;
    this.state.stats.totalEarnings += totalPayout;

    // 6. Award Career Weekend Driver XP & Automatically Evaluate Achievements!
    const weekendXpAmount =
      this._computeSessionXp({
        ...result,
        finishPos: pos,
        gridPos: grid,
        gotPole,
        gotFastestLap,
        overtakes: passes,
      }) + (crownedWorldChampion ? 350 : 50);
    const xpRes = this._awardDriverXp(weekendXpAmount);
    const achRes = this._evaluateAndUnlockAchievements({
      ...result,
      trackId: effectiveTrackId,
      finishPos: pos,
      gridPos: grid,
      gotPole,
      gotFastestLap,
      overtakes: passes,
      crownedWorldChampion,
    });

    this._lastCareerWeekendRecordAt = Date.now();
    this._lastCareerWeekendXpResult = xpRes;
    this._lastCareerWeekendAchievements = achRes.unlocked;
    this._lastCareerWeekendAchBonus = achRes.bonusCredits;

    this._save();

    return {
      seasonNumber: completedSeasonNumber,
      nextSeasonNumber: this.state.seasonNumber,
      roundNumber: roundIdxBefore + 1,
      totalRounds: CHAMPIONSHIP_CALENDAR.length,
      roundTitle: roundDef.fullLabel,
      gpTitle: roundDef.gpTitle,
      trackId: effectiveTrackId,
      finishPos: pos,
      gridPos: grid,
      positionsGained: grid - pos,
      gotPole,
      gotFastestLap,
      overtakes: passes,
      arcadeScore: score,
      pointsEarned: playerPointsEarned,
      pointsBreakdown: {
        finish: finishPts,
        pole: polePts,
        fastestLap: fastestLapPts,
        total: playerPointsEarned,
      },
      prizeMoney: racePrizeMoney,
      sponsorBonuses,
      sponsorBonusTotal,
      activeSponsorContract: this.getActiveSponsorContract(),
      trophyBonus,
      achievementBonusCredits: achRes.bonusCredits,
      newlyUnlockedAchievements: achRes.unlocked,
      xpGained: xpRes.xpGained,
      leveledUp: xpRes.leveledUp,
      newLevel: xpRes.newLevel,
      driverProfile: xpRes.profile,
      totalPayout: totalPayout + achRes.bonusCredits,
      payoutBreakdown: {
        finishPurse,
        poleBonus: polePurse,
        fastestLapBonus: flPurse,
        overtakeBonus: passPurse,
        prestigeBonus: racePrizeMoney - (finishPurse + polePurse + flPurse + passPurse),
        racePrizeMoney,
        sponsorBonusTotal,
        trophyBonus,
        achievementBonusCredits: achRes.bonusCredits,
        totalPayout: totalPayout + achRes.bonusCredits,
      },
      creditsAfter: this.state.credits,
      seasonCompleted,
      crownedWorldChampion,
      championName,
      seasonFinaleBanner,
      playerChampionshipRank,
      playerSeasonPoints,
      championshipStandings: standingsSnapshot,
      nextRound: this.getCurrentRound(),
      stats: { ...this.state.stats },
    };
  }

  // --------------------------------------------------------------------------
  // SEASON & FULL CAREER RESET CONTROLS
  // --------------------------------------------------------------------------
  resetSeason() {
    this.state.currentRoundIdx = 0;
    this.state.driverPoints = createFreshDriverPointsMap();
    this.state.roundHistory = [];
    this._save();
    return this.getState();
  }

  resetAllCareer() {
    this.state = createDefaultCareerState();
    this._save();
    return this.getState();
  }
}
