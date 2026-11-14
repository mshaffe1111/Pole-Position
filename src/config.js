// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Master Configuration, Rules Tables, Tire Compounds, Weather & AI Archetypes
// ============================================================================

export const PHYSICS_HZ = 240;
export const PHYSICS_DT = 1.0 / PHYSICS_HZ;

// 1982 Fuji Speedway: 4,359 real meters mapped to 1,000 classic game-meters
export const TRACK_GAME_LENGTH = 1000.0;
export const REAL_METERS_PER_GAME_METER = 4.359;
export const TRACK_REAL_LENGTH = TRACK_GAME_LENGTH * REAL_METERS_PER_GAME_METER;

export const ROAD_HALF_WIDTH = 7.8; // 15.6m GP width (comfortable 3-wide F1 racing)
export const CURB_WIDTH = 1.15;
export const CAR_WIDTH = 1.96;
export const CAR_LENGTH = 4.75;

export const GAME_STATES = {
  PRE_RACE_MENU: 'PRE_RACE_MENU',
  QUALIFYING: 'QUALIFYING',
  GRID_LINEUP: 'GRID_LINEUP',
  RACING: 'RACING',
  PIT_STOP: 'PIT_STOP',
  RACE_RESULTS: 'RACE_RESULTS',
};

// 1982 Rank A Default Qualifying Grid & Bonus Table
export const QUALIFYING_RANK_A_TABLE = [
  { pos: 1, label: '1ST (POLE)', maxTime: 58.50, bonus: 4000 },
  { pos: 2, label: '2ND',        maxTime: 60.00, bonus: 2000 },
  { pos: 3, label: '3RD',        maxTime: 62.00, bonus: 1400 },
  { pos: 4, label: '4TH',        maxTime: 64.00, bonus: 1000 },
  { pos: 5, label: '5TH',        maxTime: 66.00, bonus: 800  },
  { pos: 6, label: '6TH',        maxTime: 68.00, bonus: 600  },
  { pos: 7, label: '7TH',        maxTime: 70.00, bonus: 400  },
  { pos: 8, label: '8TH',        maxTime: 73.00, bonus: 200  },
];

export const CLASSIC_1982_RULES = {
  qualifyingMasterTimer: 90.0,
  qualifyingCutoff: 73.0,
  initialRaceTimer: 75.0,
  extendedPlayBonusSec: 58.0,
  pointsPer5Meters: 50,     // 10,000 pts per 1,000m lap
  pointsPerOvertake: 50,
  pointsPerRemainingSec: 200,
};

export const PRO_2026_LENGTHS = {
  SHORT: {
    id: 'SHORT',
    label: 'SHORT GP (5 LAPS)',
    laps: 5,
    wearFuelMult: 1.0,
    pitSummary: '0–1 Pit Stop | 1.0x Wear/Fuel',
    startingFuelMax: 7.0,
  },
  MEDIUM: {
    id: 'MEDIUM',
    label: 'MEDIUM GP (12 LAPS)',
    laps: 12,
    wearFuelMult: 1.8,
    pitSummary: '1–2 Mandatory Stops | 1.8x Wear/Fuel',
    startingFuelMax: 8.5,
  },
  LONG: {
    id: 'LONG',
    label: 'LONG ENDURANCE (25 LAPS)',
    laps: 25,
    wearFuelMult: 1.2,
    pitSummary: '2–3 Mandatory Stops | 1.2x Wear/Fuel',
    startingFuelMax: 11.0,
  },
};

// Authentic 1982 Fuji Speedway 12-Sector Topology (11 Main Loop Sectors + Sector 12 Pit Lane)
export const FUJI_SECTORS = [
  { id: 1,  name: 'Main Pit Straight',            start: 0,   end: 240, curvature:  0.00, curbIn: false, curbOut: false, slipstreamZone: true },
  { id: 2,  name: 'Turn 1 Braking Zone',          start: 240, end: 290, curvature:  0.00, curbIn: false, curbOut: true,  brakingMarkers: [245, 263, 280] },
  { id: 3,  name: 'Turn 1 - Daiichi Corner',      start: 290, end: 390, curvature: +0.68, curbIn: true,  curbOut: true  },
  { id: 4,  name: 'Short Chute',                  start: 390, end: 440, curvature:  0.00, curbIn: false, curbOut: false },
  { id: 5,  name: 'Turn 2 - 100R Sweeper',        start: 440, end: 560, curvature: -0.42, curbIn: true,  curbOut: true  },
  { id: 6,  name: 'Back Stretch Approach',        start: 560, end: 620, curvature:  0.00, curbIn: false, curbOut: false },
  { id: 7,  name: 'Turn 3 - Hairpin Corner',      start: 620, end: 730, curvature: -0.88, curbIn: true,  curbOut: true,  overtakeHotspot: true },
  { id: 8,  name: '300R Straight Approach',       start: 730, end: 790, curvature:  0.00, curbIn: false, curbOut: false, slipstreamZone: true },
  { id: 9,  name: 'Turn 4 - 300R Panorama Pt 1',  start: 790, end: 890, curvature: +0.38, curbIn: true,  curbOut: false },
  { id: 10, name: 'Turn 4 - Panorama & Pit Split', start: 890, end: 950, curvature: +0.32, curbIn: true,  curbOut: false, pitEntryAt: 910 },
  { id: 11, name: 'Final Blast to Line',          start: 950, end: 1000, curvature: 0.00, curbIn: false, curbOut: false },
];

export const PIT_LANE_CONFIG = {
  splitStartS: 910,       // Sector 10 right-shoulder split
  speedLimitLineS: 936,   // 80 km/h speed limit enforcement line
  boxZoneStartS: 970,     // Team pit boxes start (wraps past 1000 -> 55m)
  playerBoxS: 18,         // Player's dedicated pit box on Main Straight right behind pit wall
  mergeStartS: 68,        // Pit exit acceleration lane
  mergeEndS: 118,         // Smooth merge onto Sector 1 right lane
  lateralOffset: 14.8,    // Centerline of pit lane to the right of main straight (+X local)
  speedLimitKmh: 80.0,
  speedingPenaltySec: 5.0,
};

export const TIRE_COMPOUNDS = {
  SOFT: {
    id: 'SOFT',
    short: 'S',
    name: 'SOFT',
    colorHex: '#ff2a2a',
    rgb: [1.0, 0.16, 0.16],
    baseGrip: 1.12,
    wearRate: 1.6,
    optTempMin: 90,
    optTempMax: 105,
    isWetTire: false,
    wetOptMin: 0.0,
    wetOptMax: 0.12,
  },
  MEDIUM: {
    id: 'MEDIUM',
    short: 'M',
    name: 'MEDIUM',
    colorHex: '#ffd426',
    rgb: [1.0, 0.83, 0.15],
    baseGrip: 1.00,
    wearRate: 1.0,
    optTempMin: 85,
    optTempMax: 100,
    isWetTire: false,
    wetOptMin: 0.0,
    wetOptMax: 0.15,
  },
  HARD: {
    id: 'HARD',
    short: 'H',
    name: 'HARD',
    colorHex: '#f2f5fa',
    rgb: [0.95, 0.96, 0.98],
    baseGrip: 0.91,
    wearRate: 0.6,
    optTempMin: 80,
    optTempMax: 95,
    isWetTire: false,
    wetOptMin: 0.0,
    wetOptMax: 0.15,
  },
  INTERMEDIATE: {
    id: 'INTERMEDIATE',
    short: 'I',
    name: 'INTER',
    colorHex: '#28d854',
    rgb: [0.16, 0.85, 0.33],
    baseGrip: 0.99,
    wearRate: 1.05,
    optTempMin: 60,
    optTempMax: 85,
    isWetTire: true,
    wetOptMin: 0.15,
    wetOptMax: 0.55,
  },
  FULL_WET: {
    id: 'FULL_WET',
    short: 'W',
    name: 'WET',
    colorHex: '#2490ff',
    rgb: [0.14, 0.56, 1.0],
    baseGrip: 0.94,
    wearRate: 0.95,
    optTempMin: 45,
    optTempMax: 75,
    isWetTire: true,
    preventsHydroplane: true,
    wetOptMin: 0.55,
    wetOptMax: 1.00,
  },
};

export const WEATHER_REGIMES = {
  HOT_SUNNY: {
    id: 'HOT_SUNNY',
    label: 'HOT SUNNY',
    icon: '☀️',
    moistureMin: 0.00,
    moistureMax: 0.00,
    rainRate: 0.0,
    dryRate: 0.022,
    ambientTemp: 33,
    skyTop: 0x0d47a1,
    skyHorizon: 0x82c8ff,
    fogColor: 0x9ad2ff,
    fogDensity: 0.00055,
    sunIntensity: 2.35,
    ambientIntensity: 0.95,
  },
  OVERCAST_COOL: {
    id: 'OVERCAST_COOL',
    label: 'OVERCAST COOL',
    icon: '⛅',
    moistureMin: 0.02,
    moistureMax: 0.04,
    rainRate: 0.001,
    dryRate: 0.014,
    ambientTemp: 21,
    skyTop: 0x455a64,
    skyHorizon: 0xaabac4,
    fogColor: 0x9aaab6,
    fogDensity: 0.00085,
    sunIntensity: 1.45,
    ambientIntensity: 0.88,
  },
  LIGHT_DRIZZLE: {
    id: 'LIGHT_DRIZZLE',
    label: 'LIGHT DRIZZLE',
    icon: '🌦️',
    moistureMin: 0.10,
    moistureMax: 0.35,
    rainRate: 0.016,
    dryRate: 0.004,
    ambientTemp: 17,
    skyTop: 0x32424f,
    skyHorizon: 0x7e909e,
    fogColor: 0x7b8c9a,
    fogDensity: 0.00135,
    sunIntensity: 0.95,
    ambientIntensity: 0.75,
  },
  HEAVY_DOWNPOUR: {
    id: 'HEAVY_DOWNPOUR',
    label: 'HEAVY DOWNPOUR',
    icon: '🌧️',
    moistureMin: 0.40,
    moistureMax: 0.75,
    rainRate: 0.036,
    dryRate: 0.0,
    ambientTemp: 14,
    skyTop: 0x1d2733,
    skyHorizon: 0x526170,
    fogColor: 0x536270,
    fogDensity: 0.0021,
    sunIntensity: 0.58,
    ambientIntensity: 0.62,
  },
  MONSOON_STORM: {
    id: 'MONSOON_STORM',
    label: 'MONSOON STORM',
    icon: '⛈️',
    moistureMin: 0.80,
    moistureMax: 1.00,
    rainRate: 0.058,
    dryRate: 0.0,
    ambientTemp: 12,
    skyTop: 0x0d121c,
    skyHorizon: 0x2c3747,
    fogColor: 0x2d3847,
    fogDensity: 0.0029,
    sunIntensity: 0.35,
    ambientIntensity: 0.48,
    hasLightning: true,
  },
};

export const PIT_CREW_MODES = {
  SAFE: {
    id: 'SAFE',
    label: 'SAFE (3.3s)',
    baseTireSec: 3.3,
    errorProb: 0.008,
    errorDelaySec: 2.0,
  },
  BALANCED: {
    id: 'BALANCED',
    label: 'BALANCED (2.5s)',
    baseTireSec: 2.5,
    errorProb: 0.045,
    errorDelaySec: 2.5,
  },
  AGGRESSIVE_UNDERCUT: {
    id: 'AGGRESSIVE_UNDERCUT',
    label: 'UNDERCUT (1.9s)',
    baseTireSec: 1.9,
    errorProb: 0.14,
    errorDelaySec: 3.0,
  },
};

export const REPAIR_ORDERS = {
  NONE:  { id: 'NONE',  label: 'NONE (+0.0s)',  sec: 0.0 },
  WINGS: { id: 'WINGS', label: 'WINGS (+2.5s)', sec: 2.5 },
  FULL:  { id: 'FULL',  label: 'FULL (+5.5s)',  sec: 5.5 },
};

// Five Distinct AI Driver Archetypes & Full 15-Rival Roster (supports 8-car & 16-car grids)
export const AI_ARCHETYPES = {
  APEX_TACTICIAN: {
    id: 'APEX_TACTICIAN',
    badge: 'APEX',
    basePace: 0.992,
    brakeOffsetM: 0.0,
    brakeVarianceM: 1.0,
    tireWearMult: 0.94,
    puddleAvoidWeight: 1.65,
    defensiveRangeM: 12.0,
    undercutLapsEarly: 1,
    preferredDryTire: 'MEDIUM',
    errorRate: 0.001,
  },
  LATE_BRAKER: {
    id: 'LATE_BRAKER',
    badge: 'LATE',
    basePace: 0.996,
    brakeOffsetM: 12.5, // Brakes 10m-14m deeper into Turn 1 & Hairpin!
    brakeVarianceM: 2.8,
    tireWearMult: 1.22,
    puddleAvoidWeight: 0.85,
    defensiveRangeM: 15.0,
    undercutLapsEarly: 0,
    preferredDryTire: 'SOFT',
    errorRate: 0.018,
  },
  TIRE_WHISPERER: {
    id: 'TIRE_WHISPERER',
    badge: 'SMOOTH',
    basePace: 0.985,
    brakeOffsetM: -3.5, // Early smooth turn-in
    brakeVarianceM: 0.8,
    tireWearMult: 0.75, // Preserves tire life +25%+ longer!
    puddleAvoidWeight: 1.45,
    defensiveRangeM: 10.0,
    undercutLapsEarly: -1, // Overcuts late in stint
    preferredDryTire: 'MEDIUM',
    errorRate: 0.002,
  },
  DEFENSIVE_WALL: {
    id: 'DEFENSIVE_WALL',
    badge: 'DEFEND',
    basePace: 0.990,
    brakeOffsetM: 4.0,
    brakeVarianceM: 1.5,
    tireWearMult: 1.02,
    puddleAvoidWeight: 1.20,
    defensiveRangeM: 26.0, // Covers inside lane immediately when player is within 25m!
    undercutLapsEarly: 0,
    preferredDryTire: 'SOFT',
    errorRate: 0.006,
  },
  ROOKIE_WILDCARD: {
    id: 'ROOKIE_WILDCARD',
    badge: 'ROOKIE',
    basePace: 1.008, // Blistering straight-line raw speed
    brakeOffsetM: 6.0,
    brakeVarianceM: 8.0, // +-8m erratic braking points!
    tireWearMult: 1.28,
    puddleAvoidWeight: 0.30, // Prone to clipping puddles & triggering Local Yellows!
    defensiveRangeM: 14.0,
    undercutLapsEarly: 0,
    preferredDryTire: 'SOFT',
    errorRate: 0.042,
  },
};

export const AI_DRIVER_ROSTER = [
  { name: 'K. Takahashi', short: 'TAK', num: 7,  archetype: 'APEX_TACTICIAN', primary: 0xd8dde6, accent: 0xd91424, helmet: 0xffffff },
  { name: 'M. Vance',     short: 'VAN', num: 27, archetype: 'LATE_BRAKER',    primary: 0x17181c, accent: 0xe5b822, helmet: 0xf5c400 },
  { name: 'A. Prost',     short: 'PRO', num: 2,  archetype: 'TIRE_WHISPERER', primary: 0x0e4da4, accent: 0xf4f7fc, helmet: 0x1d6ff2 },
  { name: 'R. Senna',     short: 'SEN', num: 12, archetype: 'DEFENSIVE_WALL', primary: 0xf5c71a, accent: 0x0f8f3e, helmet: 0xf7d117 },
  { name: 'J. Johnny',    short: 'JNY', num: 99, archetype: 'ROOKIE_WILDCARD',primary: 0x00d9e8, accent: 0xff1ea8, helmet: 0x00f0ff },
  { name: 'N. Lauda',     short: 'LAU', num: 8,  archetype: 'APEX_TACTICIAN', primary: 0xb81414, accent: 0xf2f2f2, helmet: 0xd91818 },
  { name: 'G. Villeneuve',short: 'VIL', num: 28, archetype: 'LATE_BRAKER',    primary: 0xd62828, accent: 0x1f242d, helmet: 0xeb5e28 },
  { name: 'N. Mansell',   short: 'MAN', num: 5,  archetype: 'DEFENSIVE_WALL', primary: 0xf2f4f8, accent: 0x1a5fb4, helmet: 0xe01b24 },
  { name: 'M. Hakkinen',  short: 'HAK', num: 9,  archetype: 'APEX_TACTICIAN', primary: 0x9aa3ad, accent: 0x1e2229, helmet: 0x3584e4 },
  { name: 'K. Rosberg',   short: 'ROS', num: 6,  archetype: 'LATE_BRAKER',    primary: 0xf6f7f9, accent: 0x26a269, helmet: 0xf8e45c },
  { name: 'J. Button',    short: 'BUT', num: 22, archetype: 'TIRE_WHISPERER', primary: 0xf4f7f5, accent: 0xb8f229, helmet: 0xd8ff29 },
  { name: 'F. Alonso',    short: 'ALO', num: 14, archetype: 'DEFENSIVE_WALL', primary: 0x24b6ff, accent: 0xffd21f, helmet: 0x33c4ff },
  { name: 'S. Nakajima',  short: 'NAK', num: 11, archetype: 'TIRE_WHISPERER', primary: 0xffb400, accent: 0x11151c, helmet: 0xffffff },
  { name: 'T. Sato',      short: 'SAT', num: 10, archetype: 'ROOKIE_WILDCARD',primary: 0xfafafa, accent: 0xe6192e, helmet: 0xe6192e },
  { name: 'R. Arnoux',    short: 'ARN', num: 16, archetype: 'LATE_BRAKER',    primary: 0xf7d019, accent: 0x171717, helmet: 0x2e77d0 },
];

export const BILLBOARD_BRANDS = [
  { title: 'NAMCO 82',    sub: 'FUJI GRAND PRIX', bg: '#e41c24', fg: '#ffffff', border: '#ffd21e' },
  { title: 'RACE PHANATIC',sub: 'F1 TELEMETRY',   bg: '#0b192e', fg: '#00f0ff', border: '#ff2e93' },
  { title: 'ATARI ARCADE',sub: 'POLE POSITION',   bg: '#1c2430', fg: '#ff9e1b', border: '#ffffff' },
  { title: 'CENTIPEDE OIL',sub: 'TURBO SYNTH',    bg: '#0e6938', fg: '#f8e71c', border: '#ffffff' },
  { title: 'DIG DUG TIRE',sub: 'ULTRA GRIP',      bg: '#f5f7fa', fg: '#0d47a1', border: '#e53935' },
  { title: 'GALAGA AERO', sub: 'CARBON WING',     bg: '#1c1038', fg: '#ff3898', border: '#00e5ff' },
  { title: 'PAC-TURBO',   sub: '2026 HYBRID',     bg: '#ffcc00', fg: '#111111', border: '#d50000' },
  { title: 'FUJI SPEEDWAY',sub: '4.359 KM',       bg: '#0a3d91', fg: '#ffffff', border: '#ff3b30' },
];
