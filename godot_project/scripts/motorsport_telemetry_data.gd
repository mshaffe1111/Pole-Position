# ============================================================================
# RACE PHANATIC F1 — POLE POSITION 2026 (GODOT 4.x AAA 3D PIPELINE)
# Agent 01 (@Motorsport_Researcher): Real-World F1 Telemetry, 6-Circuit 3D
# Catmull-Rom Spline & Banking Solver, 8-Speed Hybrid Power Unit & Pacejka Data
# ============================================================================
class_name MotorsportTelemetryData
extends RefCounted

const PHYSICS_HZ: int = 240
const PHYSICS_DT: float = 1.0 / 240.0
const TRACK_GAME_LENGTH: float = 1000.0
const DEFAULT_REAL_M_PER_GAME_M: float = 4.25
const ROAD_HALF_WIDTH: float = 8.4
const CURB_WIDTH: float = 1.25
const CAR_WIDTH: float = 1.96
const CAR_LENGTH: float = 4.75

# ----------------------------------------------------------------------------
# 1. 2026 FORMULA 1 8-SPEED SEAMLESS-SHIFT DRIVETRAIN & TORQUE CURVE
# ----------------------------------------------------------------------------
const EIGHT_SPEED_TOPS_KMH: Array[float] = [108.0, 148.0, 184.0, 216.0, 245.0, 272.0, 296.0, 316.0]
const EIGHT_SPEED_UPSHIFT_KMH: Array[float] = [102.0, 141.0, 176.0, 208.0, 237.0, 263.0, 287.0]
const EIGHT_SPEED_DOWNSHIFT_KMH: Array[float] = [82.0, 118.0, 152.0, 182.0, 210.0, 236.0, 260.0]
const EIGHT_SPEED_GEAR_RATIOS: Array[float] = [3.420, 2.495, 2.007, 1.709, 1.507, 1.357, 1.247, 1.168]
const SIX_SPEED_CLASSIC_TOPS_KMH: Array[float] = [116.0, 162.0, 204.0, 242.0, 276.0, 312.0]
const FINAL_DRIVE_RATIO: float = 3.720
const WHEEL_RADIUS_M: float = 0.360

const RPM_IDLE: float = 3800.0
const RPM_OPTIMAL_SHIFT: float = 12650.0
const RPM_REDLINE: float = 13000.0
const RPM_REV_LIMITER: float = 13500.0

const DEFAULT_BRAKE_BIAS_FRONT: float = 0.565
const PEAK_CARBON_BRAKE_DECEL_MPS2: float = 33.0

const PIT_LANE_CONFIG: Dictionary = {
	"split_start_s": 912.0,
	"speed_limit_line_s": 942.0,
	"box_zone_start_s": 975.0,
	"player_box_s": 20.0,
	"ai_box_slots_s": [976.0, 986.0, 996.0, 6.0, 30.0, 40.0, 50.0, 60.0],
	"merge_start_s": 68.0,
	"merge_end_s": 115.0,
	"lateral_offset_m": 15.2,
	"speed_limit_kmh": 80.0,
	"speeding_penalty_sec": 5.0
}

# ----------------------------------------------------------------------------
# 2. PIRELLI 2026 5-COMPOUND PACEJKA-LITE & THERMAL/WEAR MATRIX
# ----------------------------------------------------------------------------
const TIRE_COMPOUNDS: Dictionary = {
	"SOFT": {
		"id": "SOFT",
		"short": "S",
		"color_hex": "#ff2a2a",
		"base_grip": 1.12,
		"wear_rate": 1.55,
		"opt_temp_min": 90.0,
		"opt_temp_max": 105.0,
		"pacejka_b": 11.8,
		"pacejka_c": 1.52,
		"pacejka_d": 1.12,
		"pacejka_e": -0.35,
		"is_wet_tire": false,
		"prevents_hydroplane": false
	},
	"MEDIUM": {
		"id": "MEDIUM",
		"short": "M",
		"color_hex": "#ffd426",
		"base_grip": 1.00,
		"wear_rate": 1.00,
		"opt_temp_min": 85.0,
		"opt_temp_max": 100.0,
		"pacejka_b": 11.2,
		"pacejka_c": 1.48,
		"pacejka_d": 1.00,
		"pacejka_e": -0.30,
		"is_wet_tire": false,
		"prevents_hydroplane": false
	},
	"HARD": {
		"id": "HARD",
		"short": "H",
		"color_hex": "#f2f5fa",
		"base_grip": 0.92,
		"wear_rate": 0.62,
		"opt_temp_min": 80.0,
		"opt_temp_max": 95.0,
		"pacejka_b": 10.6,
		"pacejka_c": 1.45,
		"pacejka_d": 0.92,
		"pacejka_e": -0.25,
		"is_wet_tire": false,
		"prevents_hydroplane": false
	},
	"INTERMEDIATE": {
		"id": "INTERMEDIATE",
		"short": "I",
		"color_hex": "#28d854",
		"base_grip": 1.00,
		"wear_rate": 1.05,
		"opt_temp_min": 60.0,
		"opt_temp_max": 85.0,
		"pacejka_b": 10.4,
		"pacejka_c": 1.42,
		"pacejka_d": 1.04,
		"pacejka_e": -0.20,
		"is_wet_tire": true,
		"prevents_hydroplane": false
	},
	"FULL_WET": {
		"id": "FULL_WET",
		"short": "W",
		"color_hex": "#2490ff",
		"base_grip": 0.96,
		"wear_rate": 0.95,
		"opt_temp_min": 45.0,
		"opt_temp_max": 75.0,
		"pacejka_b": 9.8,
		"pacejka_c": 1.38,
		"pacejka_d": 1.02,
		"pacejka_e": -0.15,
		"is_wet_tire": true,
		"prevents_hydroplane": true
	}
}

# ----------------------------------------------------------------------------
# 3. 5 AUTONOMOUS AI DRIVER ARCHETYPES & RACECRAFT PROFILES
# ----------------------------------------------------------------------------
const AI_ARCHETYPES: Dictionary = {
	"APEX_TACTICIAN": {
		"id": "APEX_TACTICIAN",
		"badge": "APEX",
		"base_pace": 0.992,
		"brake_offset_m": 0.0,
		"brake_variance_m": 1.0,
		"tire_wear_mult": 0.94,
		"puddle_avoid_weight": 1.65,
		"defensive_range_m": 13.0,
		"undercut_laps_early": 1,
		"preferred_dry_tire": "MEDIUM",
		"apex_depth_m": 5.45,
		"entry_width_m": 5.10,
		"corner_speed_mod": 1.015,
		"brake_aggression": 1.00,
		"pressure_susceptibility": 0.44,
		"switchback_skill": 0.95
	},
	"LATE_BRAKER": {
		"id": "LATE_BRAKER",
		"badge": "LATE",
		"base_pace": 0.996,
		"brake_offset_m": 12.0,
		"brake_variance_m": 2.5,
		"tire_wear_mult": 1.20,
		"puddle_avoid_weight": 0.85,
		"defensive_range_m": 16.0,
		"undercut_laps_early": 0,
		"preferred_dry_tire": "SOFT",
		"apex_depth_m": 4.45,
		"entry_width_m": 4.30,
		"corner_speed_mod": 0.992,
		"brake_aggression": 1.14,
		"pressure_susceptibility": 1.26,
		"switchback_skill": 0.88
	},
	"TIRE_WHISPERER": {
		"id": "TIRE_WHISPERER",
		"badge": "SMOOTH",
		"base_pace": 0.986,
		"brake_offset_m": -3.0,
		"brake_variance_m": 0.8,
		"tire_wear_mult": 0.75,
		"puddle_avoid_weight": 1.45,
		"defensive_range_m": 10.0,
		"undercut_laps_early": -1,
		"preferred_dry_tire": "MEDIUM",
		"apex_depth_m": 4.95,
		"entry_width_m": 4.80,
		"corner_speed_mod": 1.022,
		"brake_aggression": 0.91,
		"pressure_susceptibility": 0.50,
		"switchback_skill": 0.92
	},
	"DEFENSIVE_WALL": {
		"id": "DEFENSIVE_WALL",
		"badge": "DEFEND",
		"base_pace": 0.990,
		"brake_offset_m": 4.0,
		"brake_variance_m": 1.5,
		"tire_wear_mult": 1.02,
		"puddle_avoid_weight": 1.20,
		"defensive_range_m": 26.0,
		"undercut_laps_early": 0,
		"preferred_dry_tire": "SOFT",
		"apex_depth_m": 4.75,
		"entry_width_m": 4.30,
		"corner_speed_mod": 0.996,
		"brake_aggression": 1.02,
		"pressure_susceptibility": 0.56,
		"switchback_skill": 0.75
	},
	"ROOKIE_WILDCARD": {
		"id": "ROOKIE_WILDCARD",
		"badge": "ROOKIE",
		"base_pace": 1.006,
		"brake_offset_m": 6.0,
		"brake_variance_m": 7.5,
		"tire_wear_mult": 1.26,
		"puddle_avoid_weight": 0.35,
		"defensive_range_m": 14.0,
		"undercut_laps_early": 0,
		"preferred_dry_tire": "SOFT",
		"apex_depth_m": 4.35,
		"entry_width_m": 4.20,
		"corner_speed_mod": 1.000,
		"brake_aggression": 1.08,
		"pressure_susceptibility": 1.68,
		"switchback_skill": 0.62
	}
}

const AI_DRIVER_ROSTER: Array[Dictionary] = [
	{"name": "K. Takahashi", "short": "TAK", "car_num": 7, "archetype": "APEX_TACTICIAN", "team_hex": "#00d2be"},
	{"name": "M. Vance", "short": "VAN", "car_num": 33, "archetype": "LATE_BRAKER", "team_hex": "#1e41ff"},
	{"name": "L. Bellini", "short": "BEL", "car_num": 16, "archetype": "LATE_BRAKER", "team_hex": "#dc0000"},
	{"name": "A. Prost-Moreau", "short": "MOR", "car_num": 55, "archetype": "TIRE_WHISPERER", "team_hex": "#ff8700"},
	{"name": "F. Montoya-Cruz", "short": "CRU", "car_num": 14, "archetype": "DEFENSIVE_WALL", "team_hex": "#006f62"},
	{"name": "O. Lindqvist", "short": "LIN", "car_num": 81, "archetype": "ROOKIE_WILDCARD", "team_hex": "#ff8700"},
	{"name": "G. Sterling", "short": "STE", "car_num": 63, "archetype": "APEX_TACTICIAN", "team_hex": "#00d2be"},
	{"name": "Y. Sato", "short": "SAT", "car_num": 22, "archetype": "ROOKIE_WILDCARD", "team_hex": "#2b4562"}
]

# Cached baked spline lookup tables per circuit_id for O(1) 240Hz AI & Coordinator queries
static var _baked_splines: Dictionary = {}

# ----------------------------------------------------------------------------
# 4. 6 GRAND PRIX CIRCUITS WITH 3D SPLINE CONTROL POINTS & BANKING ANGLES
# Format of control_points: Vector4(x, y, z, bank_angle_deg)
# ----------------------------------------------------------------------------
static func get_circuit_catalog() -> Dictionary:
	return {
		"FUJI_1982": {
			"id": "FUJI_1982",
			"name": "FUJI SPEEDWAY '82",
			"country": "JAPAN",
			"theme": "FUJI",
			"braking_zones": [
				{"entry_s": 162.0, "apex_s": 282.0, "side": -1, "target_kmh": 173.0, "name": "Turn 1 Daiichi Right"},
				{"entry_s": 410.0, "apex_s": 478.0, "side": 1, "target_kmh": 242.0, "name": "100R Sweeper"},
				{"entry_s": 618.0, "apex_s": 668.0, "side": -1, "target_kmh": 138.0, "name": "Turn 3 Hairpin"},
				{"entry_s": 888.0, "apex_s": 842.0, "side": -1, "target_kmh": 245.0, "name": "300R Panorama"}
			],
			"control_points": [
				Vector4(-260.0, 0.0, 0.0, 0.0),
				Vector4(0.0, 0.0, 0.0, 0.0),
				Vector4(300.0, 0.0, 0.0, 0.0),
				Vector4(620.0, 0.0, 0.0, 0.0),
				Vector4(830.0, 2.0, 95.0, 4.5),
				Vector4(855.0, 5.0, 295.0, 6.2),
				Vector4(660.0, 7.0, 380.0, 1.5),
				Vector4(460.0, 9.0, 330.0, -5.8),
				Vector4(250.0, 12.0, 470.0, 3.0),
				Vector4(60.0, 14.0, 650.0, 0.0),
				Vector4(-185.0, 13.0, 665.0, -7.0),
				Vector4(-370.0, 10.0, 480.0, 4.8),
				Vector4(-485.0, 5.0, 240.0, 3.5),
				Vector4(-430.0, 1.0, 55.0, 1.2)
			]
		},
		"MONACO_HARBOR": {
			"id": "MONACO_HARBOR",
			"name": "MONTE CARLO HARBOR",
			"country": "MONACO",
			"theme": "MONACO",
			"tunnel_range_s": Vector2(430.0, 565.0),
			"braking_zones": [
				{"entry_s": 154.0, "apex_s": 210.0, "side": -1, "target_kmh": 152.0, "name": "Sainte-Devote"},
				{"entry_s": 304.0, "apex_s": 365.0, "side": -1, "target_kmh": 119.0, "name": "Fairmont Hairpin"},
				{"entry_s": 582.0, "apex_s": 618.0, "side": -1, "target_kmh": 136.0, "name": "Nouvelle Chicane"},
				{"entry_s": 868.0, "apex_s": 902.0, "side": -1, "target_kmh": 132.0, "name": "Rascasse"}
			],
			"control_points": [
				Vector4(-250.0, 0.0, 0.0, 0.0),
				Vector4(0.0, 0.0, 0.0, 0.0),
				Vector4(280.0, 0.0, 0.0, 0.0),
				Vector4(540.0, 0.0, 0.0, 0.0),
				Vector4(720.0, 6.0, 110.0, 2.5),
				Vector4(690.0, 15.0, 310.0, 3.0),
				Vector4(470.0, 12.0, 370.0, -4.5),
				Vector4(330.0, 5.0, 250.0, -5.5),
				Vector4(160.0, 1.0, 390.0, 2.5),
				Vector4(-90.0, 0.0, 450.0, -2.0),
				Vector4(-290.0, 0.0, 340.0, -3.5),
				Vector4(-420.0, 0.0, 195.0, 3.0),
				Vector4(-390.0, 0.0, 52.0, 2.0)
			]
		},
		"VEGAS_NEON": {
			"id": "VEGAS_NEON",
			"name": "LAS VEGAS NEON STRIP",
			"country": "USA",
			"theme": "VEGAS",
			"braking_zones": [
				{"entry_s": 168.0, "apex_s": 240.0, "side": -1, "target_kmh": 168.0, "name": "Sphere Carousel"},
				{"entry_s": 445.0, "apex_s": 495.0, "side": 1, "target_kmh": 148.0, "name": "Neon Chicane"},
				{"entry_s": 685.0, "apex_s": 740.0, "side": -1, "target_kmh": 182.0, "name": "Casino Boulevard"},
				{"entry_s": 882.0, "apex_s": 920.0, "side": -1, "target_kmh": 215.0, "name": "Strip Entry"}
			],
			"control_points": [
				Vector4(-270.0, 0.0, 0.0, 0.0),
				Vector4(0.0, 0.0, 0.0, 0.0),
				Vector4(320.0, 0.0, 0.0, 0.0),
				Vector4(660.0, 0.0, 0.0, 0.0),
				Vector4(860.0, 0.0, 130.0, 3.8),
				Vector4(810.0, 0.0, 360.0, 4.0),
				Vector4(560.0, 0.0, 460.0, -2.5),
				Vector4(260.0, 0.0, 420.0, -3.5),
				Vector4(40.0, 0.0, 540.0, 3.0),
				Vector4(-240.0, 0.0, 520.0, -2.5),
				Vector4(-460.0, 0.0, 340.0, 3.5),
				Vector4(-450.0, 0.0, 80.0, 2.0)
			]
		},
		"MONZA_TEMPLE": {
			"id": "MONZA_TEMPLE",
			"name": "MONZA TEMPLE OF SPEED",
			"country": "ITALY",
			"theme": "MONZA",
			"braking_zones": [
				{"entry_s": 168.0, "apex_s": 215.0, "side": -1, "target_kmh": 134.0, "name": "Variante del Rettifilo"},
				{"entry_s": 376.0, "apex_s": 430.0, "side": -1, "target_kmh": 188.0, "name": "Curva di Lesmo"},
				{"entry_s": 598.0, "apex_s": 648.0, "side": 1, "target_kmh": 195.0, "name": "Variante Ascari"},
				{"entry_s": 816.0, "apex_s": 872.0, "side": -1, "target_kmh": 244.0, "name": "Curva Parabolica"}
			],
			"control_points": [
				Vector4(-280.0, 0.0, 0.0, 0.0),
				Vector4(0.0, 0.0, 0.0, 0.0),
				Vector4(340.0, 0.0, 0.0, 0.0),
				Vector4(690.0, 0.0, 0.0, 0.0),
				Vector4(880.0, 1.0, 85.0, 2.5),
				Vector4(920.0, 4.0, 310.0, 4.2),
				Vector4(720.0, 7.0, 490.0, 4.5),
				Vector4(430.0, 6.0, 520.0, 3.5),
				Vector4(120.0, 3.0, 430.0, -3.5),
				Vector4(-180.0, 2.0, 460.0, 3.2),
				Vector4(-460.0, 1.0, 330.0, 5.5),
				Vector4(-450.0, 0.0, 68.0, 2.5)
			]
		},
		"SUZUKA_130R": {
			"id": "SUZUKA_130R",
			"name": "SUZUKA GP CIRCUIT",
			"country": "JAPAN",
			"theme": "SUZUKA",
			"overpass_range_s": Vector2(665.0, 765.0),
			"braking_zones": [
				{"entry_s": 152.0, "apex_s": 215.0, "side": -1, "target_kmh": 182.0, "name": "First Curve"},
				{"entry_s": 465.0, "apex_s": 518.0, "side": 1, "target_kmh": 132.0, "name": "Suzuka Hairpin"},
				{"entry_s": 585.0, "apex_s": 635.0, "side": -1, "target_kmh": 196.0, "name": "Spoon Curve"},
				{"entry_s": 878.0, "apex_s": 918.0, "side": -1, "target_kmh": 144.0, "name": "Casio Triangle"}
			],
			"control_points": [
				Vector4(-260.0, 0.0, 0.0, 0.0),
				Vector4(0.0, 0.0, 0.0, 0.0),
				Vector4(290.0, 0.0, 0.0, 0.0),
				Vector4(560.0, 0.0, 0.0, 0.0),
				Vector4(785.0, 3.0, 95.0, 4.5),
				Vector4(810.0, 6.0, 265.0, 5.0),
				Vector4(630.0, 7.0, 345.0, -4.0),
				Vector4(455.0, 4.0, 265.0, 4.0),
				Vector4(280.0, 1.0, 330.0, -3.5),
				Vector4(95.0, 0.0, 385.0, 2.0),
				Vector4(-75.0, 0.0, 515.0, -5.5),
				Vector4(35.0, 4.0, 665.0, 5.0),
				Vector4(255.0, 9.0, 615.0, 4.8),
				Vector4(145.0, 13.5, 485.0, 0.0),
				Vector4(-45.0, 13.5, 335.0, 0.0),
				Vector4(-335.0, 6.0, 225.0, -5.2),
				Vector4(-415.0, 1.0, 65.0, 2.5)
			]
		},
		"SILVERSTONE_GP": {
			"id": "SILVERSTONE_GP",
			"name": "SILVERSTONE ABBEY",
			"country": "GREAT BRITAIN",
			"theme": "SILVERSTONE",
			"braking_zones": [
				{"entry_s": 156.0, "apex_s": 212.0, "side": -1, "target_kmh": 168.0, "name": "Abbey / Village"},
				{"entry_s": 382.0, "apex_s": 438.0, "side": 1, "target_kmh": 158.0, "name": "Brooklands / Luffield"},
				{"entry_s": 565.0, "apex_s": 612.0, "side": -1, "target_kmh": 238.0, "name": "Maggotts-Becketts"},
				{"entry_s": 785.0, "apex_s": 838.0, "side": -1, "target_kmh": 192.0, "name": "Stowe / Vale"}
			],
			"control_points": [
				Vector4(-260.0, 0.0, 0.0, 0.0),
				Vector4(0.0, 0.0, 0.0, 0.0),
				Vector4(295.0, 0.0, 0.0, 0.0),
				Vector4(560.0, 0.0, 0.0, 0.0),
				Vector4(805.0, 1.0, 90.0, 4.0),
				Vector4(775.0, 2.0, 265.0, -4.5),
				Vector4(565.0, 2.0, 205.0, 3.0),
				Vector4(385.0, 3.0, 335.0, -4.0),
				Vector4(545.0, 4.0, 495.0, 4.5),
				Vector4(320.0, 5.0, 595.0, -4.8),
				Vector4(120.0, 5.0, 505.0, 4.8),
				Vector4(-65.0, 4.0, 610.0, -3.5),
				Vector4(-365.0, 2.0, 495.0, 4.2),
				Vector4(-465.0, 1.0, 275.0, -3.5),
				Vector4(-415.0, 0.0, 62.0, 3.0)
			]
		}
	}

# ----------------------------------------------------------------------------
# 5. FAST O(1) BAKED 3D CATMULL-ROM SPLINE, CURVATURE & PROJECTION SOLVER
# ----------------------------------------------------------------------------
static func _catmull_rom_v4(p0: Vector4, p1: Vector4, p2: Vector4, p3: Vector4, t: float) -> Vector4:
	var t2: float = t * t
	var t3: float = t2 * t
	return 0.5 * (
		(2.0 * p1) +
		(-p0 + p2) * t +
		(2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
		(-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
	)

static func _ensure_baked_circuit(circuit_id: String) -> Dictionary:
	if _baked_splines.has(circuit_id):
		return _baked_splines[circuit_id]
	var cat: Dictionary = get_circuit_catalog()
	var def: Dictionary = cat.get(circuit_id, cat["FUJI_1982"])
	var pts: Array = def["control_points"]
	var n_ctrl: int = pts.size()
	var sample_count: int = 1000
	var raw_pos: Array[Vector3] = []
	var raw_bank: Array[float] = []

	for i in range(sample_count):
		var u_global: float = (float(i) / float(sample_count)) * float(n_ctrl)
		var seg: int = int(floor(u_global)) % n_ctrl
		var local_t: float = u_global - floor(u_global)
		var p0: Vector4 = pts[(seg - 1 + n_ctrl) % n_ctrl]
		var p1: Vector4 = pts[seg]
		var p2: Vector4 = pts[(seg + 1) % n_ctrl]
		var p3: Vector4 = pts[(seg + 2) % n_ctrl]
		var interp: Vector4 = _catmull_rom_v4(p0, p1, p2, p3, local_t)
		raw_pos.append(Vector3(interp.x, interp.y, interp.z))
		raw_bank.append(deg_to_rad(interp.w))

	var tangents: Array[Vector3] = []
	var curvatures: Array[float] = []
	var total_world_len: float = 0.0
	for i in range(sample_count):
		var prev_p: Vector3 = raw_pos[(i - 1 + sample_count) % sample_count]
		var cur_p: Vector3 = raw_pos[i]
		var next_p: Vector3 = raw_pos[(i + 1) % sample_count]
		total_world_len += cur_p.distance_to(next_p)
		var tang: Vector3 = (next_p - prev_p).normalized()
		tangents.append(tang)

	for i in range(sample_count):
		var t_prev: Vector3 = tangents[(i - 4 + sample_count) % sample_count]
		var t_next: Vector3 = tangents[(i + 4) % sample_count]
		var cross_y: float = t_prev.cross(t_next).y
		# Clamp main straight (s >= 945 or s <= 120) strictly to 0.0 curvature
		var k_val: float = 0.0 if (i >= 945 or i <= 120) else clampf(-cross_y * 3.2, -1.05, 1.05)
		curvatures.append(k_val)

	var baked: Dictionary = {
		"positions": raw_pos,
		"tangents": tangents,
		"banks": raw_bank,
		"curvatures": curvatures,
		"real_m_per_game_m": maxf(3.2, total_world_len / TRACK_GAME_LENGTH)
	}
	_baked_splines[circuit_id] = baked
	return baked

static func sample_circuit_3d_spline(circuit_id: String, s_game_m: float) -> Dictionary:
	var baked: Dictionary = _ensure_baked_circuit(circuit_id)
	var positions: Array = baked["positions"]
	var tangents: Array = baked["tangents"]
	var banks: Array = baked["banks"]
	var curvatures: Array = baked["curvatures"]
	var count: int = positions.size()

	var wrapped_s: float = fposmod(s_game_m, TRACK_GAME_LENGTH)
	var idx0: int = int(floor(wrapped_s)) % count
	var idx1: int = (idx0 + 1) % count
	var frac: float = wrapped_s - floor(wrapped_s)

	var pos: Vector3 = (positions[idx0] as Vector3).lerp(positions[idx1] as Vector3, frac)
	var tang: Vector3 = ((tangents[idx0] as Vector3).lerp(tangents[idx1] as Vector3, frac)).normalized()
	var flat_right: Vector3 = tang.cross(Vector3.UP).normalized()
	if flat_right.length_squared() < 0.001:
		flat_right = Vector3.RIGHT
	var bank_rad: float = lerpf(float(banks[idx0]), float(banks[idx1]), frac)
	var banked_right: Vector3 = flat_right.rotated(tang, bank_rad).normalized()
	var banked_up: Vector3 = banked_right.cross(tang).normalized()
	var k_val: float = lerpf(float(curvatures[idx0]), float(curvatures[idx1]), frac)

	return {
		"position": pos,
		"tangent": tang,
		"right": banked_right,
		"normal": banked_up,
		"bank_rad": bank_rad,
		"curvature": k_val,
		"real_m_per_game_m": float(baked["real_m_per_game_m"])
	}

static func sample_circuit_curvature(circuit_id: String, s_game_m: float) -> float:
	var baked: Dictionary = _ensure_baked_circuit(circuit_id)
	var curvatures: Array = baked["curvatures"]
	var wrapped_s: float = fposmod(s_game_m, TRACK_GAME_LENGTH)
	var idx0: int = int(floor(wrapped_s)) % curvatures.size()
	var idx1: int = (idx0 + 1) % curvatures.size()
	var frac: float = wrapped_s - floor(wrapped_s)
	return lerpf(float(curvatures[idx0]), float(curvatures[idx1]), frac)

static func project_world_pos_to_spline(circuit_id: String, world_pos: Vector3, hint_s: float = -1.0) -> Dictionary:
	var baked: Dictionary = _ensure_baked_circuit(circuit_id)
	var positions: Array = baked["positions"]
	var count: int = positions.size()
	var best_idx: int = 0
	var best_dist_sq: float = 1.0e18

	if hint_s >= 0.0:
		var center_idx: int = int(floor(fposmod(hint_s, TRACK_GAME_LENGTH))) % count
		for offset in range(-32, 33):
			var c_idx: int = (center_idx + offset + count) % count
			var d_sq: float = world_pos.distance_squared_to(positions[c_idx] as Vector3)
			if d_sq < best_dist_sq:
				best_dist_sq = d_sq
				best_idx = c_idx
	else:
		for i in range(count):
			var d_sq: float = world_pos.distance_squared_to(positions[i] as Vector3)
			if d_sq < best_dist_sq:
				best_dist_sq = d_sq
				best_idx = i

	var sample: Dictionary = sample_circuit_3d_spline(circuit_id, float(best_idx))
	var rel: Vector3 = world_pos - (sample["position"] as Vector3)
	var lat_offset: float = rel.dot(sample["right"] as Vector3)
	var along_m: float = rel.dot(sample["tangent"] as Vector3)
	var m_per_game: float = float(sample["real_m_per_game_m"])
	var refined_s: float = fposmod(float(best_idx) + along_m / maxf(1.0, m_per_game), TRACK_GAME_LENGTH)

	return {
		"s": refined_s,
		"lateral_offset": lat_offset,
		"curvature": float(sample["curvature"]),
		"bank_rad": float(sample["bank_rad"]),
		"real_m_per_game_m": m_per_game
	}

# ----------------------------------------------------------------------------
# 6. ENGINE TORQUE & PACEJKA TIRE / THERMAL / CLIFF EVALUATION HELPERS
# ----------------------------------------------------------------------------
static func sample_engine_torque_nm(rpm: float, throttle: float) -> float:
	var clamped_rpm: float = clampf(rpm, RPM_IDLE, RPM_REV_LIMITER)
	var base_nm: float = 540.0
	if clamped_rpm < 6500.0:
		var u: float = (clamped_rpm - RPM_IDLE) / (6500.0 - RPM_IDLE)
		base_nm = lerpf(540.0, 760.0, u)
	elif clamped_rpm < 9200.0:
		var u: float = (clamped_rpm - 6500.0) / (9200.0 - 6500.0)
		base_nm = lerpf(760.0, 965.0, u)
	elif clamped_rpm <= 11400.0:
		base_nm = 965.0
	elif clamped_rpm <= RPM_REDLINE:
		var u: float = (clamped_rpm - 11400.0) / (RPM_REDLINE - 11400.0)
		base_nm = lerpf(965.0, 865.0, u)
	else:
		var over: float = (clamped_rpm - RPM_REDLINE) / (RPM_REV_LIMITER - RPM_REDLINE)
		base_nm = lerpf(865.0, 180.0, clampf(over, 0.0, 1.0))
	return base_nm * clampf(throttle, 0.0, 1.0)

static func evaluate_pacejka_magic_formula(slip: float, compound_id: String, effective_grip_mult: float = 1.0) -> float:
	var comp: Dictionary = TIRE_COMPOUNDS.get(compound_id, TIRE_COMPOUNDS["MEDIUM"])
	var b: float = float(comp["pacejka_b"])
	var c: float = float(comp["pacejka_c"])
	var d: float = float(comp["pacejka_d"]) * effective_grip_mult
	var e: float = float(comp["pacejka_e"])
	var bx: float = b * slip
	return d * sin(c * atan(bx - e * (bx - atan(bx))))

static func evaluate_tire_wear_cliff_multiplier(tire_life_01: float, punctured: bool = false) -> float:
	if punctured:
		return 0.28
	var life: float = clampf(tire_life_01, 0.0, 1.0)
	if life >= 0.25:
		return 0.93 + 0.07 * ((life - 0.25) / 0.75)
	var ratio: float = life / 0.25
	return 0.44 + 0.49 * pow(ratio, 2.2)

static func evaluate_tire_grip_multiplier(
	compound_id: String,
	tire_life_01: float,
	temp_c: float,
	local_wetness: float,
	punctured: bool = false
) -> float:
	var comp: Dictionary = TIRE_COMPOUNDS.get(compound_id, TIRE_COMPOUNDS["MEDIUM"])
	var base_mu: float = float(comp["base_grip"])
	var is_wet: bool = bool(comp["is_wet_tire"])

	if not is_wet:
		base_mu *= (1.0 - 0.54 * clampf(local_wetness, 0.0, 1.0))
	elif compound_id == "INTERMEDIATE":
		if local_wetness < 0.10:
			base_mu = 0.88
		elif local_wetness <= 0.58:
			base_mu = 1.04
		else:
			base_mu = 0.89 - (local_wetness - 0.58) * 0.24
	elif compound_id == "FULL_WET":
		base_mu = 0.80 if local_wetness < 0.20 else (0.97 + minf(0.08, (local_wetness - 0.45) * 0.18))

	var wear_mult: float = evaluate_tire_wear_cliff_multiplier(tire_life_01, punctured)
	var opt_min: float = float(comp["opt_temp_min"])
	var opt_max: float = float(comp["opt_temp_max"])
	var thermal_mult: float = 1.0
	if temp_c < opt_min - 6.0:
		thermal_mult = clampf(1.0 - (opt_min - 6.0 - temp_c) * 0.004, 0.91, 1.0)
	elif temp_c > opt_max + 8.0:
		thermal_mult = clampf(1.0 - (temp_c - (opt_max + 8.0)) * 0.005, 0.88, 1.0)

	return clampf(base_mu * wear_mult * thermal_mult, 0.30, 1.18)
