// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
// Master Configuration: 6 Grand Prix Circuits, Rules, Tires, Weather & AI
// ============================================================================

export const PHYSICS_HZ = 240;
export const PHYSICS_DT = 1.0 / PHYSICS_HZ;

export const TRACK_GAME_LENGTH = 1000.0;
export const REAL_METERS_PER_GAME_METER = 4.25;
export const TRACK_REAL_LENGTH = TRACK_GAME_LENGTH * REAL_METERS_PER_GAME_METER;

export const ROAD_HALF_WIDTH = 8.4; // Generous 16.8m F1 Grand Prix asphalt width for mobile racing
export const CURB_WIDTH = 1.25;
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

// ============================================================================
// 6 ICONIC GRAND PRIX CIRCUITS WITH DISTINCT BIOMES & PERSONALITIES
// All 6 circuits share a laser-straight Main Pit Straight along Z=0, Y=0
// so Start Gantry, F1 Grid Boxes, Pit Lane & Garages align with zero seams!
// ============================================================================
export const TRACK_CATALOG = {
  FUJI_1982: {
    id: 'FUJI_1982',
    name: "FUJI SPEEDWAY '82",
    country: '🇯🇵 JAPAN',
    subtitle: 'Mt. Fuji Alpine • Sakura Groves & Fast Sweepers',
    theme: 'FUJI',
    accentColor: '#e51c23',
    gantrySub: 'FUJI GRAND PRIX • SHIZUOKA CIRCUIT',
    curbColors: ['#e51c23', '#f8fafd'],
    grassColors: ['#256d2c', '#1e5c24'],
    runoffColor: '#c9b489',
    brakingZones: [
      { entryS: 162, side: -1 }, // Turn 1 Daiichi Right
      { entryS: 410, side:  1 }, // 100R Sweeper Entry
      { entryS: 618, side: -1 }, // Hairpin Approach
      { entryS: 888, side: -1 }, // Panorama Final Entry
    ],
    cornerTribunes: [
      { s: 215, side: -1, span: 120 },
      { s: 645, side:  1, span: 110 },
    ],
    // Closed loop control points [x, y, z] (Main straight runs along z=0 from x=-260 to x=+620)
    controlPoints: [
      [-260, 0,    0],
      [   0, 0,    0],
      [ 300, 0,    0],
      [ 620, 0,    0],   // End of 1.5km Main Straight -> Turn 1 Daiichi Right!
      [ 830, 2,   95],
      [ 855, 5,  295],   // Sharp Daiichi Right apex
      [ 660, 7,  380],   // Short chute heading West
      [ 460, 9,  330],   // 100R fast sweeping Left/Right S
      [ 250, 12, 470],
      [  60, 14, 650],   // Approach to Hairpin
      [-185, 13, 665],   // Tight Hairpin apex
      [-370, 10, 480],   // 300R Panorama Curve climb/descent
      [-485,  5, 240],
      [-430,  1,  55],   // Panorama Exit & Pit Split onto Main Straight
    ],
  },

  MONACO_HARBOR: {
    id: 'MONACO_HARBOR',
    name: 'MONTE CARLO HARBOR',
    country: '🇲🇨 MONACO',
    subtitle: 'Yacht Marina, Illuminated Tunnel & Tight Chicanes',
    theme: 'MONACO',
    accentColor: '#d91e2a',
    gantrySub: 'CIRCUIT DE MONACO • PORT HERCULE',
    curbColors: ['#d91e2a', '#ffffff'],
    grassColors: ['#3d4652', '#333b46'], // Riviera paved urban stone surrounds
    runoffColor: '#485260',
    tunnelRangeS: [430, 565],
    brakingZones: [
      { entryS: 154, side: -1 }, // Sainte-Devote Right
      { entryS: 304, side: -1 }, // Casino / Mirabeau Descent
      { entryS: 582, side: -1 }, // Nouvelle Harbor Chicane (after Tunnel)
      { entryS: 868, side: -1 }, // Rascasse / Anthony Noghes
    ],
    cornerTribunes: [
      { s: 625, side: -1, span: 115 }, // Harbor / Tabac Waterfront Tribune
      { s: 775, side: -1, span: 105 }, // Swimming Pool Complex Stand
    ],
    controlPoints: [
      [-250, 0,    0],
      [   0, 0,    0],
      [ 280, 0,    0],
      [ 540, 0,    0],   // Sainte-Devote Right corner
      [ 720, 6,  110],   // Beau Rivage hill climb!
      [ 690, 15, 310],   // Casino Square high terrace
      [ 470, 12, 370],   // Mirabeau / Fairmont Hairpin descent
      [ 330,  5, 250],
      [ 160,  1, 390],   // Illuminated Tunnel curving along seafront!
      [ -90,  0, 450],   // Nouvelle Harbor Chicane right beside Yacht Marina
      [-290,  0, 340],   // Tabac & Swimming Pool S-curves
      [-420,  0, 195],
      [-390,  0,  52],   // Rascasse -> Anthony Noghes onto Main Straight
    ],
  },

  VEGAS_NEON: {
    id: 'VEGAS_NEON',
    name: 'LAS VEGAS NEON STRIP',
    country: '🇺🇸 USA (NIGHT)',
    subtitle: 'Midnight Floodlights, Glowing LED Sphere & Casino Towers',
    theme: 'VEGAS',
    forceNight: true,
    accentColor: '#ff1493',
    gantrySub: 'LAS VEGAS STRIP CIRCUIT • NIGHT GP',
    curbColors: ['#ff1493', '#00f0ff'],
    grassColors: ['#151924', '#10141d'],
    runoffColor: '#1e2433',
    brakingZones: [
      { entryS: 168, side: -1 }, // Sphere Arena Turn 1
      { entryS: 445, side:  1 }, // Neon Chicane Complex
      { entryS: 685, side: -1 }, // Casino Boulevard 90
      { entryS: 882, side: -1 }, // Final Strip Corner
    ],
    cornerTribunes: [
      { s: 235, side: -1, span: 125 }, // Sphere Arena Amphitheater Stand
      { s: 735, side:  1, span: 115 }, // Casino Boulevard Neon Stand
    ],
    controlPoints: [
      [-270, 0,    0],
      [   0, 0,    0],
      [ 320, 0,    0],
      [ 660, 0,    0],   // Blistering Strip Straightaway
      [ 860, 0,  130],   // Sphere Arena sweeping carousel
      [ 810, 0,  360],
      [ 560, 0,  460],
      [ 260, 0,  420],   // Neon Chicane complex
      [  40, 0,  540],
      [-240, 0,  520],
      [-460, 0,  340],   // Casino Boulevard fast 90-degree sweeping turns
      [-450, 0,   80],
    ],
  },

  MONZA_TEMPLE: {
    id: 'MONZA_TEMPLE',
    name: 'MONZA TEMPLE OF SPEED',
    country: '🇮🇹 ITALY',
    subtitle: 'Autumn Royal Park, Tricolor Kerbs & Parabolica',
    theme: 'MONZA',
    accentColor: '#009246',
    gantrySub: 'AUTODROMO NAZIONALE MONZA • ITALIA',
    curbColors: ['#009246', '#ffffff', '#ce2b37'], // Italian Tricolor kerbs!
    grassColors: ['#2e6f28', '#245b1f'],
    runoffColor: '#bfa57a',
    brakingZones: [
      { entryS: 168, side: -1 }, // Variante del Rettifilo
      { entryS: 376, side: -1 }, // Curva di Lesmo 1
      { entryS: 598, side:  1 }, // Variante Ascari
      { entryS: 816, side: -1 }, // Curva Parabolica (Alboreto)
    ],
    cornerTribunes: [
      { s: 195, side: -1, span: 125 }, // Prima Variante Tifosi Stand
      { s: 845, side: -1, span: 130 }, // Parabolica Tifosi Tribune
    ],
    controlPoints: [
      [-280, 0,    0],
      [   0, 0,    0],
      [ 340, 0,    0],
      [ 690, 0,    0],   // Rettifilo Tribune ultra-fast straight
      [ 880, 1,   85],   // Variante del Rettifilo chicane + Curva Grande
      [ 920, 4,  310],
      [ 720, 7,  490],   // Curva di Lesmo 1 & 2 in Royal Forest
      [ 430, 6,  520],
      [ 120, 3,  430],   // Serraglio fast blast -> Variante Ascari
      [-180, 2,  460],
      [-460, 1,  330],   // Famous sweeping Parabolica (Alboreto) Right!
      [-450, 0,   68],
    ],
  },

  SUZUKA_130R: {
    id: 'SUZUKA_130R',
    name: 'SUZUKA GP CIRCUIT',
    country: '🇯🇵 JAPAN',
    subtitle: 'Figure-8 Overpass, Esses S-Curves, Ferris Wheel & 130R',
    theme: 'SUZUKA',
    accentColor: '#e60026',
    gantrySub: 'SUZUKA INTERNATIONAL RACING COURSE',
    curbColors: ['#e60026', '#ffffff'],
    grassColors: ['#266e2c', '#1e5b24'],
    runoffColor: '#c7b287',
    overpassRangeS: [665, 765],
    brakingZones: [
      { entryS: 152, side: -1 }, // First Curve Right
      { entryS: 465, side:  1 }, // Suzuka Hairpin
      { entryS: 585, side: -1 }, // Spoon Curve Entry
      { entryS: 878, side: -1 }, // Casio Triangle Chicane
    ],
    cornerTribunes: [
      { s: 192, side: -1, span: 120 }, // First Curve Grandstand
      { s: 892, side: -1, span: 115 }, // Casio / Ferris Wheel View Stand
    ],
    // Authentic Figure-8 Topology: P9->P10 passes LOW (y=0) & P13->P14 bridges OVERHEAD (y=13.5)!
    controlPoints: [
      [-260,  0,    0],
      [   0,  0,    0],
      [ 290,  0,    0],
      [ 560,  0,    0],   // Main Pit Straight -> First Curve
      [ 785,  3,   95],
      [ 810,  6,  265],   // Turn 2 into Rhythmic Esses S-Curves
      [ 630,  7,  345],
      [ 455,  4,  265],
      [ 280,  1,  330],   // Degner Curve approach
      [  95,  0,  385],   // Underpass Entry (LOW y=0)
      [ -75,  0,  515],   // Underpass Exit -> Hairpin approach
      [  35,  4,  665],   // Hairpin & 200R Southern loop
      [ 255,  9,  615],   // Sweeping Spoon Curve
      [ 145, 13.5,485],   // Figure-8 Overpass Bridge Climb (HIGH y=13.5)
      [ -45, 13.5,335],   // Overpass Bridge Exit -> 130R!
      [-335,  6,  225],   // Flat-out 130R High-Speed Sweeper
      [-415,  1,   65],   // Casio Triangle Chicane onto Main Straight
    ],
  },

  SILVERSTONE_GP: {
    id: 'SILVERSTONE_GP',
    name: 'SILVERSTONE ABBEY',
    country: '🇬🇧 GREAT BRITAIN',
    subtitle: 'Maggotts-Becketts Sweepers, Wing Paddock & Union Kerbs',
    theme: 'SILVERSTONE',
    accentColor: '#0038a8',
    gantrySub: 'SILVERSTONE CIRCUIT • BRITISH GRAND PRIX',
    curbColors: ['#0038a8', '#ffffff', '#ce1126'], // Red, White & Royal Blue Union Kerbs!
    grassColors: ['#226b30', '#1b5927'],
    runoffColor: '#697382', // Modern Silverstone painted/tarmac airfield runoff
    brakingZones: [
      { entryS: 156, side: -1 }, // Abbey / Village Entry
      { entryS: 382, side:  1 }, // Brooklands / Luffield Braking
      { entryS: 565, side: -1 }, // Maggotts-Becketts High-Speed Entry
      { entryS: 785, side: -1 }, // Stowe / Vale Braking Zone
    ],
    cornerTribunes: [
      { s: 205, side: -1, span: 120 }, // Abbey / Farm Stand
      { s: 615, side: -1, span: 125 }, // Becketts Amphitheater Stand
    ],
    controlPoints: [
      [-260, 0,    0],
      [   0, 0,    0],
      [ 295, 0,    0],
      [ 560, 0,    0],   // Hamilton / Main Straight -> Abbey Fast Right!
      [ 805, 1,   90],
      [ 775, 2,  265],   // Village & The Loop Hairpin
      [ 565, 2,  205],   // Aintree onto Wellington Straight
      [ 385, 3,  335],   // Brooklands & Luffield Complex
      [ 545, 4,  495],   // Woodcote & Copse Fast Right
      [ 320, 5,  595],   // Maggotts Fast Left!
      [ 120, 5,  505],   // Becketts Fast Right!
      [ -65, 4,  610],   // Chapel Exit onto Hangar Straight!
      [-365, 2,  495],   // Stowe Fast Right
      [-465, 1,  275],   // Vale Chicane Braking
      [-415, 0,   62],   // Club Corner onto Main Pit Straight
    ],
  },
};

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
  pointsPer5Meters: 50,
  pointsPerOvertake: 50,
  pointsPerRemainingSec: 200,
};

export const PRO_2026_LENGTHS = {
  SHORT: {
    id: 'SHORT',
    label: 'SHORT GP (5 LAPS)',
    laps: 5,
    wearFuelMult: 1.0,
    pitSummary: '0–1 Pit Stop • 1.0x Tire/Fuel',
    startingFuelMax: 7.0,
  },
  MEDIUM: {
    id: 'MEDIUM',
    label: 'MEDIUM GP (12 LAPS)',
    laps: 12,
    wearFuelMult: 1.8,
    pitSummary: '1–2 Mandatory Stops • 1.8x Tire/Fuel',
    startingFuelMax: 8.5,
  },
  LONG: {
    id: 'LONG',
    label: 'LONG ENDURANCE (25 LAPS)',
    laps: 25,
    wearFuelMult: 1.2,
    pitSummary: '2–3 Mandatory Stops • 1.2x Tire/Fuel',
    startingFuelMax: 11.0,
  },
};

// 11 Logical Timing/Marshal Sectors around any 1,000m circuit
export const FUJI_SECTORS = [
  { id: 1,  name: 'Sector 1 - Pit Straight',   start: 0,   end: 160 },
  { id: 2,  name: 'Sector 2 - Turn 1 Braking', start: 160, end: 240 },
  { id: 3,  name: 'Sector 3 - Turn 1 Complex', start: 240, end: 340 },
  { id: 4,  name: 'Sector 4 - Chute',          start: 340, end: 430 },
  { id: 5,  name: 'Sector 5 - High-Speed S',   start: 430, end: 540 },
  { id: 6,  name: 'Sector 6 - Back Approach',  start: 540, end: 620 },
  { id: 7,  name: 'Sector 7 - Hairpin Zone',   start: 620, end: 720 },
  { id: 8,  name: 'Sector 8 - Back Blast',     start: 720, end: 790 },
  { id: 9,  name: 'Sector 9 - Sweeper Entry',  start: 790, end: 885 },
  { id: 10, name: 'Sector 10 - Pit Split',     start: 885, end: 948 },
  { id: 11, name: 'Sector 11 - Final Straight',start: 948, end: 1000 },
];

export const PIT_LANE_CONFIG = {
  splitStartS: 912,
  speedLimitLineS: 942,
  boxZoneStartS: 975,
  playerBoxS: 20,
  mergeStartS: 68,
  mergeEndS: 115,
  lateralOffset: 15.2,
  speedLimitKmh: 80.0,
  speedingPenaltySec: 5.0,
};

export const TIRE_COMPOUNDS = {
  SOFT: {
    id: 'SOFT', short: 'S', name: 'SOFT', colorHex: '#ff2a2a',
    baseGrip: 1.12, wearRate: 1.55, optTempMin: 90, optTempMax: 105, isWetTire: false,
  },
  MEDIUM: {
    id: 'MEDIUM', short: 'M', name: 'MEDIUM', colorHex: '#ffd426',
    baseGrip: 1.00, wearRate: 1.0, optTempMin: 85, optTempMax: 100, isWetTire: false,
  },
  HARD: {
    id: 'HARD', short: 'H', name: 'HARD', colorHex: '#f2f5fa',
    baseGrip: 0.92, wearRate: 0.62, optTempMin: 80, optTempMax: 95, isWetTire: false,
  },
  INTERMEDIATE: {
    id: 'INTERMEDIATE', short: 'I', name: 'INTER', colorHex: '#28d854',
    baseGrip: 1.00, wearRate: 1.05, optTempMin: 60, optTempMax: 85, isWetTire: true,
  },
  FULL_WET: {
    id: 'FULL_WET', short: 'W', name: 'WET', colorHex: '#2490ff',
    baseGrip: 0.96, wearRate: 0.95, optTempMin: 45, optTempMax: 75, isWetTire: true, preventsHydroplane: true,
  },
};

// Fixed Per-Race Weather Regimes (Randomly rolled before each race — NEVER changes mid-race!)
export const WEATHER_REGIMES = {
  HOT_SUNNY: {
    id: 'HOT_SUNNY',
    label: 'CLEAR SUNNY',
    icon: '☀️',
    moisture: 0.00,
    rainIntensity: 0.0,
    ambientTemp: 31,
    skyZenith: 0x0b4ec4,
    skyMid: 0x3b8ef3,
    skyHorizon: 0xbbe2ff,
    sunColor: 0xfff7e6,
    fogColor: 0xb0dbff,
    fogDensity: 0.00016,
    sunIntensity: 2.65,
    ambientIntensity: 1.25,
  },
  GOLDEN_SUNSET: {
    id: 'GOLDEN_SUNSET',
    label: 'GOLDEN SUNSET',
    icon: '🌅',
    moisture: 0.00,
    rainIntensity: 0.0,
    ambientTemp: 25,
    skyZenith: 0x2c5cb8,
    skyMid: 0xe86858,
    skyHorizon: 0xffc46b,
    sunColor: 0xffbe6b,
    fogColor: 0xf29f6d,
    fogDensity: 0.00018,
    sunIntensity: 2.55,
    ambientIntensity: 1.28,
  },
  OVERCAST_COOL: {
    id: 'OVERCAST_COOL',
    label: 'OVERCAST DRY',
    icon: '⛅',
    moisture: 0.02,
    rainIntensity: 0.0,
    ambientTemp: 20,
    skyZenith: 0x3e526a,
    skyMid: 0x768ca4,
    skyHorizon: 0xc2d0de,
    sunColor: 0xeef4fa,
    fogColor: 0xb4c4d4,
    fogDensity: 0.00024,
    sunIntensity: 1.75,
    ambientIntensity: 1.20,
  },
  LIGHT_DRIZZLE: {
    id: 'LIGHT_DRIZZLE',
    label: 'LIGHT RAIN',
    icon: '🌦️',
    moisture: 0.34,
    rainIntensity: 0.45,
    ambientTemp: 17,
    skyZenith: 0x263547,
    skyMid: 0x4f6378,
    skyHorizon: 0x8ea0b2,
    sunColor: 0xc8d8e8,
    fogColor: 0x8294a6,
    fogDensity: 0.00038,
    sunIntensity: 1.15,
    ambientIntensity: 1.05,
  },
  MONSOON_STORM: {
    id: 'MONSOON_STORM',
    label: 'HEAVY WET STORM',
    icon: '⛈️',
    moisture: 0.78,
    rainIntensity: 1.0,
    ambientTemp: 14,
    skyZenith: 0x121a28,
    skyMid: 0x2a384c,
    skyHorizon: 0x52647a,
    sunColor: 0x9cb4d0,
    fogColor: 0x46566b,
    fogDensity: 0.00052,
    sunIntensity: 0.85,
    ambientIntensity: 0.92,
    hasLightning: true,
  },
  NEON_NIGHT: {
    id: 'NEON_NIGHT',
    label: 'FLOODLIT NIGHT',
    icon: '🌙',
    moisture: 0.16, // Subtle night street sheen for gorgeous neon reflections!
    rainIntensity: 0.0,
    ambientTemp: 19,
    skyZenith: 0x040611,
    skyMid: 0x0c1229,
    skyHorizon: 0x23163d,
    sunColor: 0xd8ecff,
    fogColor: 0x121029,
    fogDensity: 0.00022,
    sunIntensity: 1.85,
    ambientIntensity: 1.15,
  },
};

export const PIT_CREW_MODES = {
  SAFE:                { id: 'SAFE',                label: 'SAFE (3.3s)',     baseTireSec: 3.3, errorProb: 0.008, errorDelaySec: 2.0 },
  BALANCED:            { id: 'BALANCED',            label: 'BALANCED (2.5s)', baseTireSec: 2.5, errorProb: 0.045, errorDelaySec: 2.5 },
  AGGRESSIVE_UNDERCUT: { id: 'AGGRESSIVE_UNDERCUT', label: 'UNDERCUT (1.9s)', baseTireSec: 1.9, errorProb: 0.14,  errorDelaySec: 3.0 },
};

export const REPAIR_ORDERS = {
  NONE:  { id: 'NONE',  label: 'NONE (+0.0s)',  sec: 0.0 },
  WINGS: { id: 'WINGS', label: 'WINGS (+2.5s)', sec: 2.5 },
  FULL:  { id: 'FULL',  label: 'FULL (+5.5s)',  sec: 5.5 },
};

export const AI_ARCHETYPES = {
  APEX_TACTICIAN: {
    id: 'APEX_TACTICIAN', badge: 'APEX', basePace: 0.992, brakeOffsetM: 0.0, brakeVarianceM: 1.0,
    tireWearMult: 0.94, puddleAvoidWeight: 1.65, defensiveRangeM: 12.0, undercutLapsEarly: 1, preferredDryTire: 'MEDIUM',
  },
  LATE_BRAKER: {
    id: 'LATE_BRAKER', badge: 'LATE', basePace: 0.996, brakeOffsetM: 12.0, brakeVarianceM: 2.5,
    tireWearMult: 1.20, puddleAvoidWeight: 0.85, defensiveRangeM: 15.0, undercutLapsEarly: 0, preferredDryTire: 'SOFT',
  },
  TIRE_WHISPERER: {
    id: 'TIRE_WHISPERER', badge: 'SMOOTH', basePace: 0.986, brakeOffsetM: -3.0, brakeVarianceM: 0.8,
    tireWearMult: 0.75, puddleAvoidWeight: 1.45, defensiveRangeM: 10.0, undercutLapsEarly: -1, preferredDryTire: 'MEDIUM',
  },
  DEFENSIVE_WALL: {
    id: 'DEFENSIVE_WALL', badge: 'DEFEND', basePace: 0.990, brakeOffsetM: 4.0, brakeVarianceM: 1.5,
    tireWearMult: 1.02, puddleAvoidWeight: 1.20, defensiveRangeM: 25.0, undercutLapsEarly: 0, preferredDryTire: 'SOFT',
  },
  ROOKIE_WILDCARD: {
    id: 'ROOKIE_WILDCARD', badge: 'ROOKIE', basePace: 1.006, brakeOffsetM: 6.0, brakeVarianceM: 7.5,
    tireWearMult: 1.26, puddleAvoidWeight: 0.35, defensiveRangeM: 14.0, undercutLapsEarly: 0, preferredDryTire: 'SOFT',
  },
};

export const AI_DRIVER_ROSTER = [
  { name: 'K. Takahashi', short: 'TAK', num: 7,  archetype: 'APEX_TACTICIAN', primary: 0xe8edf5, accent: 0xd91424, helmet: 0xffffff },
  { name: 'M. Vance',     short: 'VAN', num: 27, archetype: 'LATE_BRAKER',    primary: 0x181a20, accent: 0xf2c12e, helmet: 0xf5c400 },
  { name: 'A. Prost',     short: 'PRO', num: 2,  archetype: 'TIRE_WHISPERER', primary: 0x0e58c8, accent: 0xf4f7fc, helmet: 0x1d6ff2 },
  { name: 'R. Senna',     short: 'SEN', num: 12, archetype: 'DEFENSIVE_WALL', primary: 0xffcf14, accent: 0x0b9e43, helmet: 0xf7d117 },
  { name: 'J. Johnny',    short: 'JNY', num: 99, archetype: 'ROOKIE_WILDCARD',primary: 0x00d9f5, accent: 0xff1ea8, helmet: 0x00f0ff },
  { name: 'N. Lauda',     short: 'LAU', num: 8,  archetype: 'APEX_TACTICIAN', primary: 0xc9141c, accent: 0xf6f6f6, helmet: 0xd91818 },
  { name: 'G. Villeneuve',short: 'VIL', num: 28, archetype: 'LATE_BRAKER',    primary: 0xe02424, accent: 0x1f242d, helmet: 0xeb5e28 },
  { name: 'N. Mansell',   short: 'MAN', num: 5,  archetype: 'DEFENSIVE_WALL', primary: 0xf4f6fa, accent: 0x1464c4, helmet: 0xe01b24 },
  { name: 'M. Hakkinen',  short: 'HAK', num: 9,  archetype: 'APEX_TACTICIAN', primary: 0xaab4c0, accent: 0x1e2229, helmet: 0x3584e4 },
  { name: 'K. Rosberg',   short: 'ROS', num: 6,  archetype: 'LATE_BRAKER',    primary: 0xf6f7f9, accent: 0x26a269, helmet: 0xf8e45c },
  { name: 'J. Button',    short: 'BUT', num: 22, archetype: 'TIRE_WHISPERER', primary: 0xf4f7f5, accent: 0xb8f229, helmet: 0xd8ff29 },
  { name: 'F. Alonso',    short: 'ALO', num: 14, archetype: 'DEFENSIVE_WALL', primary: 0x24b6ff, accent: 0xffd21f, helmet: 0x33c4ff },
  { name: 'S. Nakajima',  short: 'NAK', num: 11, archetype: 'TIRE_WHISPERER', primary: 0xffb400, accent: 0x11151c, helmet: 0xffffff },
  { name: 'T. Sato',      short: 'SAT', num: 10, archetype: 'ROOKIE_WILDCARD',primary: 0xfafafa, accent: 0xe6192e, helmet: 0xe6192e },
  { name: 'R. Arnoux',    short: 'ARN', num: 16, archetype: 'LATE_BRAKER',    primary: 0xf7d019, accent: 0x171717, helmet: 0x2e77d0 },
];

export const BILLBOARD_BRANDS = [
  { title: 'NAMCO 82',      sub: 'FUJI GRAND PRIX',    bg1: '#d91424', bg2: '#8a0812', fg: '#ffffff', stripe: '#ffd600', badge: '82' },
  { title: 'PIRELLI ZERO',  sub: 'ULTRA GRIP RADIAL',  bg1: '#ffd200', bg2: '#e5a800', fg: '#111111', stripe: '#d91424', badge: 'PZ' },
  { title: 'RACE PHANATIC', sub: 'WORLD CHAMPIONSHIP', bg1: '#071a36', bg2: '#0d3266', fg: '#00f0ff', stripe: '#ff2468', badge: 'F1' },
  { title: 'TAG CHRONO',    sub: 'OFFICIAL TIMING',    bg1: '#0a5c36', bg2: '#063b22', fg: '#ffffff', stripe: '#eb212e', badge: 'TC' },
  { title: 'BREMBO CARBON', sub: 'CERAMIC BRAKES',     bg1: '#1b1f29', bg2: '#0e1117', fg: '#ffffff', stripe: '#ff2a2a', badge: 'BC' },
  { title: 'SHELL V-TURBO', sub: 'RACING SYNTHETIC',   bg1: '#f7f9fc', bg2: '#dfe6f0', fg: '#c8102e', stripe: '#ffcd00', badge: 'SV' },
  { title: 'ATARI POLE',    sub: 'ARCADE LEGENDS',     bg1: '#231642', bg2: '#120a26', fg: '#ff9e1b', stripe: '#00e5ff', badge: 'AP' },
  { title: 'GULF RACING',   sub: 'HERITAGE LUBRICANTS',bg1: '#59b5f7', bg2: '#2f8fd8', fg: '#0a1829', stripe: '#ff671f', badge: 'GR' },
  { title: 'MAGNETI PRO',   sub: 'HYBRID TELEMETRY',   bg1: '#0c2340', bg2: '#061426', fg: '#ffe600', stripe: '#00d4ff', badge: 'MP' },
  { title: 'BBS FORGED',    sub: 'MAGNESIUM WHEELS',   bg1: '#212631', bg2: '#12151c', fg: '#f5d061', stripe: '#e51c23', badge: 'BB' },
];
