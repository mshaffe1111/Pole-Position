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
    subtitle: 'Mt. Fuji Alpine • Pink Sakura Groves, Torii Gates & Festival Wheel',
    theme: 'FUJI',
    accentColor: '#ff1828',
    gantrySub: 'FUJI GRAND PRIX • SHIZUOKA FESTIVAL CIRCUIT',
    curbColors: ['#ff1828', '#ffffff'],
    grassColors: ['#2ea844', '#38be52'],
    runoffColor: '#0068e6',
    brakingZones: [
      { entryS: 219, side: -1 }, // Turn 1 Daiichi Right (R=56m)
      { entryS: 372, side:  1 }, // 100R Sweeper Entry (R=83m)
      { entryS: 587, side: -1 }, // Hairpin Complex (R=27m)
      { entryS: 843, side: -1 }, // Panorama Final Entry
    ],
    cornerTribunes: [
      { s: 248, side: -1, span: 120 },
      { s: 625, side: -1, span: 110 },
    ],
    // Closed Periodic C2 Cubic Spline control points [x, y, z]
    controlPoints: [
      [-260,  0.0,   0],
      [   0,  0.0,   0],
      [ 295,  0.0,   0],
      [ 555,  0.0,   0],   // End of Main Pit Straight -> Turn 1 Daiichi braking!
      [ 685,  1.5,  22],
      [ 722,  4.0,  92],   // Sharp Daiichi Right apex
      [ 665,  5.8, 175],
      [ 545,  7.0, 248],   // Short chute heading West
      [ 415,  8.5, 232],   // 100R sweeping S-complex
      [ 295, 10.5, 325],
      [ 165, 12.5, 485],   // High-speed climb toward Hairpin
      [   5, 13.8, 605],
      [ -98, 13.5, 632],   // Tight Hairpin entry
      [-155, 12.5, 582],   // Tight 27m Hairpin apex
      [-138, 11.0, 498],
      [-285,  9.0, 415],   // 300R Panorama Curve descent
      [-442,  5.2, 235],
      [-448,  1.6,  78],
      [-375,  0.2,  16],   // Panorama Exit & Pit Split onto Main Straight
    ],
  },

  MONACO_HARBOR: {
    id: 'MONACO_HARBOR',
    name: 'MONTE CARLO HARBOR',
    country: '🇲🇨 MONACO',
    subtitle: 'Turquoise Marina, Superyachts, Casino Square & Glowing Tunnel',
    theme: 'MONACO',
    accentColor: '#ff1828',
    gantrySub: 'CIRCUIT DE MONACO • PORT HERCULE FESTIVAL',
    curbColors: ['#ff1828', '#ffd800', '#ffffff'],
    grassColors: ['#2ea844', '#38be52'],
    runoffColor: '#e61824',
    tunnelRangeS: [510, 620],
    brakingZones: [
      { entryS: 205, side: -1 }, // Sainte-Devote Right (R=35m)
      { entryS: 315, side: -1 }, // Casino / Mirabeau / Fairmont Descent (R=33m)
      { entryS: 648, side: -1 }, // Nouvelle Harbor Chicane after Tunnel (R=15m)
      { entryS: 832, side: -1 }, // Rascasse / Anthony Noghes
    ],
    cornerTribunes: [
      { s: 682, side: -1, span: 115 }, // Harbor / Tabac Waterfront Tribune
      { s: 785, side: -1, span: 105 }, // Swimming Pool Complex Stand
    ],
    controlPoints: [
      [-250,  0.0,   0],
      [   0,  0.0,   0],
      [ 265,  0.0,   0],
      [ 495,  0.0,   0],   // Sainte-Devote braking zone
      [ 578,  1.2,  18],   // Sainte-Devote Right apex
      [ 602,  4.0,  74],   // Beau Rivage hill climb!
      [ 648,  9.5, 185],
      [ 632, 14.2, 292],   // Massenet / Casino Square high terrace
      [ 542, 14.8, 342],
      [ 458, 11.8, 318],   // Mirabeau Haute
      [ 422,  8.8, 266],   // Fairmont Hairpin complex
      [ 368,  6.2, 268],
      [ 332,  4.2, 326],   // Portier seafront turn
      [ 238,  1.6, 382],   // Tunnel Louis II entrance
      [  85,  0.4, 418],   // Illuminated seafront tunnel curve
      [ -68,  0.0, 426],   // Tunnel exit -> Nouvelle Chicane braking!
      [-128,  0.0, 388],   // Tight Nouvelle Harbor Chicane
      [-168,  0.0, 406],
      [-275,  0.0, 332],   // Tabac & Swimming Pool S-curves
      [-368,  0.0, 225],
      [-412,  0.0, 112],   // Rascasse
      [-396,  0.0,  38],   // Anthony Noghes
      [-338,  0.0,  13],
    ],
  },

  VEGAS_NEON: {
    id: 'VEGAS_NEON',
    name: 'LAS VEGAS NEON STRIP',
    country: '🇺🇸 USA (NIGHT)',
    subtitle: '3D LED Sphere, Bellagio Dancing Fountains & Neon Casino Strip',
    theme: 'VEGAS',
    forceNight: true,
    accentColor: '#ff1493',
    gantrySub: 'LAS VEGAS STRIP CIRCUIT • NEON FESTIVAL GP',
    curbColors: ['#ff1493', '#00f5d0', '#ffffff'],
    grassColors: ['#182438', '#22324c'],
    runoffColor: '#ff1493',
    brakingZones: [
      { entryS: 242, side: -1 }, // Sphere Arena Turn 1
      { entryS: 506, side:  1 }, // Strip Chicane Complex (R=40m)
      { entryS: 716, side: -1 }, // Casino Boulevard 90 (R=51m)
      { entryS: 854, side: -1 }, // Final Strip Corner
    ],
    cornerTribunes: [
      { s: 255, side: -1, span: 125 }, // Sphere Arena Amphitheater Stand
      { s: 730, side: -1, span: 115 }, // Casino Boulevard Stand
    ],
    controlPoints: [
      [-270, 0,   0],
      [   0, 0,   0],
      [ 295, 0,   0],
      [ 565, 0,   0],   // Blistering Strip Straightaway
      [ 748, 0,  16],
      [ 815, 0,  68],   // Sphere Arena Turn 1 braking & apex
      [ 822, 0, 175],   // Sweeping around the Sphere Arena
      [ 772, 0, 345],
      [ 615, 0, 438],
      [ 375, 0, 418],
      [ 262, 0, 392],   // Technical Strip Chicane complex
      [ 215, 0, 442],
      [ 155, 0, 508],
      [ -75, 0, 518],   // Back Strip blast
      [-285, 0, 504],
      [-358, 0, 482],   // Heavy braking 90-degree Casino Blvd corner
      [-388, 0, 418],
      [-435, 0, 215],
      [-438, 0,  65],   // Final corner complex onto Pit Straight
      [-392, 0,  20],
      [-338, 0,  10],
    ],
  },

  MONZA_TEMPLE: {
    id: 'MONZA_TEMPLE',
    name: 'MONZA TEMPLE OF SPEED',
    country: '🇮🇹 ITALY',
    subtitle: 'Sea of Red Tifosi, Tricolore Smoke Flares & Banked Sopraelevata',
    theme: 'MONZA',
    accentColor: '#009e49',
    gantrySub: 'AUTODROMO NAZIONALE MONZA • FORZA TIFOSI',
    curbColors: ['#009e49', '#ffffff', '#ff1828'], // Vibrant Italian Tricolore FIA kerbs
    grassColors: ['#2ea844', '#38be52'],
    runoffColor: '#009e49',
    brakingZones: [
      { entryS: 218, side: -1 }, // Variante del Rettifilo Chicane (R=22m)
      { entryS: 390, side: -1 }, // Curva di Lesmo 1 & 2 (R=68m)
      { entryS: 605, side:  1 }, // Variante Ascari (R=29m)
      { entryS: 860, side: -1 }, // Curva Parabolica (Alboreto)
    ],
    cornerTribunes: [
      { s: 228, side: -1, span: 125 }, // Prima Variante Tifosi Stand
      { s: 862, side: -1, span: 130 }, // Parabolica Tifosi Tribune
    ],
    controlPoints: [
      [-280, 0.0,   0],
      [   0, 0.0,   0],
      [ 315, 0.0,   0],
      [ 595, 0.0,   0],   // Rettifilo ultra-fast straight -> heavy 330->85 km/h braking!
      [ 745, 0.3,  10],
      [ 778, 0.8,  48],   // Tight Variante del Rettifilo Right-Left chicane!
      [ 815, 1.5,  62],
      [ 888, 3.5, 225],   // Flat-out Curva Biassono / Grande
      [ 828, 5.2, 398],
      [ 738, 5.8, 468],   // Curva di Lesmo 1
      [ 642, 5.6, 458],
      [ 542, 5.2, 495],   // Curva di Lesmo 2
      [ 315, 4.0, 455],   // Serraglio fast forest blast
      [ 138, 2.8, 415],
      [  62, 2.4, 388],   // Variante Ascari entry
      [   2, 2.1, 438],   // Ascari S-complex
      [ -78, 1.9, 452],
      [-298, 1.3, 398],   // Back Straight into Parabolica braking
      [-428, 0.9, 322],   // Sweeping Curva Parabolica (Alboreto)
      [-462, 0.5, 168],
      [-428, 0.1,  48],
      [-358, 0.0,  14],
    ],
  },

  SUZUKA_130R: {
    id: 'SUZUKA_130R',
    name: 'SUZUKA GP CIRCUIT',
    country: '🇯🇵 JAPAN',
    subtitle: 'Illuminated Ferris Wheel, Figure-8 Overpass & Sakura-Maple Groves',
    theme: 'SUZUKA',
    accentColor: '#ff1828',
    gantrySub: 'SUZUKA INTERNATIONAL RACING COURSE • FESTIVAL GP',
    curbColors: ['#ff1828', '#ffffff'],
    grassColors: ['#2ea844', '#38be52'],
    runoffColor: '#e60026',
    overpassRangeS: [642, 802],
    brakingZones: [
      { entryS: 185, side: -1 }, // First Curve Right into Esses
      { entryS: 505, side:  1 }, // Suzuka Hairpin (R=38m)
      { entryS: 612, side:  1 }, // Spoon Curve Entry (R=34m)
      { entryS: 867, side: -1 }, // Casio Triangle Chicane (R=25m)
    ],
    cornerTribunes: [
      { s: 215, side: -1, span: 120 }, // First Curve Grandstand
      { s: 882, side: -1, span: 115 }, // Casio / Ferris Wheel View Stand
    ],
    // Authentic Figure-8 Topology: Underpass passes LOW (y=0) & Overpass bridges OVERHEAD (y=13.6m)!
    controlPoints: [
      [-260,  0.0,   0],
      [   0,  0.0,   0],
      [ 275,  0.0,   0],
      [ 515,  0.0,   0],   // Main Pit Straight -> First Curve
      [ 655,  1.2,  20],
      [ 712,  3.0,  98],   // Turn 1-2 tightening right
      [ 688,  4.2, 198],   // Rhythmic Esses S-Curves (40-50m radii)
      [ 588,  4.8, 278],
      [ 485,  4.2, 238],
      [ 388,  3.2, 298],
      [ 292,  1.8, 278],   // Dunlop / Degner approach
      [ 198,  0.6, 332],
      [  88,  0.0, 378],   // Underpass Entry (LOW y=0)
      [ -55,  0.0, 488],   // Underpass Exit -> Hairpin braking
      [ -92,  1.2, 558],   // Tight Suzuka Hairpin
      [ -38,  2.4, 615],   // 200R Southern sweep
      [  95,  4.0, 642],
      [ 228,  5.2, 612],   // Twin-apex Spoon Curve
      [ 252,  5.8, 548],
      [ 145, 13.6, 478],   // Figure-8 Overpass Bridge Climb (HIGH y=13.6)
      [ -45, 13.6, 328],   // Overpass Bridge Exit -> 130R blast!
      [-258,  5.4, 245],   // Fast 130R High-Speed Sweeper
      [-368,  2.6, 158],   // Heavy braking into Casio Triangle Chicane!
      [-405,  1.0,  74],
      [-365,  0.2,  38],
      [-332,  0.0,  12],
    ],
  },

  SILVERSTONE_GP: {
    id: 'SILVERSTONE_GP',
    name: 'SILVERSTONE ABBEY',
    country: '🇬🇧 GREAT BRITAIN',
    subtitle: 'Red Arrows Jet Flyover, Festival Stage, Wing Paddock & Union Kerbs',
    theme: 'SILVERSTONE',
    accentColor: '#0048d0',
    gantrySub: 'SILVERSTONE CIRCUIT • BRITISH GP FESTIVAL',
    curbColors: ['#0048d0', '#ffffff', '#ff1828'], // Vivid Red, White & Royal Blue Union Kerbs
    grassColors: ['#28a43e', '#34ba4c'],
    runoffColor: '#0048d0',
    brakingZones: [
      { entryS: 196, side: -1 }, // Abbey / Village / The Loop Entry (R=33m)
      { entryS: 378, side:  1 }, // Brooklands / Luffield Complex (R=20m)
      { entryS: 558, side:  1 }, // Maggotts-Becketts High-Speed S (R=69m)
      { entryS: 878, side: -1 }, // Stowe / Vale / Club Braking Zone (R=55m)
    ],
    cornerTribunes: [
      { s: 215, side: -1, span: 120 }, // Abbey / Farm Stand
      { s: 585, side: -1, span: 125 }, // Becketts Amphitheater Stand
    ],
    controlPoints: [
      [-260, 0.0,   0],
      [   0, 0.0,   0],
      [ 280, 0.0,   0],
      [ 515, 0.0,   0],   // Hamilton / Main Straight -> Abbey Fast Right!
      [ 665, 0.8,  22],
      [ 722, 1.6, 108],
      [ 695, 2.0, 212],   // Village & The Loop tight hairpin
      [ 622, 2.2, 248],
      [ 555, 2.0, 196],   // Aintree onto Wellington Straight
      [ 425, 2.6, 265],
      [ 355, 3.2, 328],   // Brooklands Left & tight 20m Luffield Right!
      [ 392, 3.6, 408],
      [ 498, 4.2, 482],   // Woodcote & Copse Fast Right
      [ 425, 4.8, 558],
      [ 295, 5.0, 578],   // Maggotts -> Becketts -> Chapel high-G sequence!
      [ 192, 5.0, 512],
      [  88, 4.8, 538],
      [ -38, 4.2, 596],   // Exit onto Hangar Straight!
      [-258, 2.8, 528],
      [-378, 1.8, 462],   // Stowe Fast Right
      [-438, 1.2, 338],
      [-452, 0.8, 198],   // Vale & Club Braking Complex
      [-408, 0.4, 112],
      [-382, 0.1,  38],
      [-332, 0.0,  11],
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
    skyZenith: 0x0654e8,
    skyMid: 0x2698ff,
    skyHorizon: 0xbef0ff,
    sunColor: 0xfff8e8,
    fogColor: 0xb4e4ff,
    fogDensity: 0.00011,
    sunIntensity: 3.95,
    ambientIntensity: 1.52,
  },
  GOLDEN_SUNSET: {
    id: 'GOLDEN_SUNSET',
    label: 'GOLDEN SUNSET',
    icon: '🌅',
    moisture: 0.00,
    rainIntensity: 0.0,
    ambientTemp: 25,
    skyZenith: 0x1d4ed8,
    skyMid: 0xf46049,
    skyHorizon: 0xffcb66,
    sunColor: 0xffc668,
    fogColor: 0xf6a66c,
    fogDensity: 0.00013,
    sunIntensity: 3.80,
    ambientIntensity: 1.48,
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
    id: 'APEX_TACTICIAN', badge: 'APEX', basePace: 1.002, brakeOffsetM: 0.0, brakeVarianceM: 1.0,
    tireWearMult: 0.94, puddleAvoidWeight: 1.65, defensiveRangeM: 12.0, undercutLapsEarly: 1, preferredDryTire: 'MEDIUM',
  },
  LATE_BRAKER: {
    id: 'LATE_BRAKER', badge: 'LATE', basePace: 1.004, brakeOffsetM: 10.0, brakeVarianceM: 2.2,
    tireWearMult: 1.18, puddleAvoidWeight: 0.85, defensiveRangeM: 15.0, undercutLapsEarly: 0, preferredDryTire: 'SOFT',
  },
  TIRE_WHISPERER: {
    id: 'TIRE_WHISPERER', badge: 'SMOOTH', basePace: 0.996, brakeOffsetM: -3.0, brakeVarianceM: 0.8,
    tireWearMult: 0.76, puddleAvoidWeight: 1.45, defensiveRangeM: 10.0, undercutLapsEarly: -1, preferredDryTire: 'MEDIUM',
  },
  DEFENSIVE_WALL: {
    id: 'DEFENSIVE_WALL', badge: 'DEFEND', basePace: 0.999, brakeOffsetM: 3.5, brakeVarianceM: 1.4,
    tireWearMult: 1.02, puddleAvoidWeight: 1.20, defensiveRangeM: 25.0, undercutLapsEarly: 0, preferredDryTire: 'SOFT',
  },
  ROOKIE_WILDCARD: {
    id: 'ROOKIE_WILDCARD', badge: 'ROOKIE', basePace: 0.994, brakeOffsetM: 5.5, brakeVarianceM: 5.5,
    tireWearMult: 1.24, puddleAvoidWeight: 0.35, defensiveRangeM: 14.0, undercutLapsEarly: 0, preferredDryTire: 'SOFT',
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
