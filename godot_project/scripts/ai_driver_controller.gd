# ============================================================================
# RACE PHANATIC F1 — POLE POSITION 2026 (GODOT 4.x AAA 3D SIM PIPELINE)
# Autonomous Spatial Racecraft, Driver Personalities & Race Strategy Controller:
# 1. Unstarved 1.00 WOT Straight/Sweeper Throttle & Unblocked <1.0s DRS Activation
# 2. Unclamped Real-Curvature (1/m) 180m Forward Corner Scanner (DeltaTheta + R_eff)
#    with Outside -> Apex -> Outside Racing Line & Dynamic-Bicycle Frenet Steering
# 3. Parabolic Sub-Ray Cost Interpolation + C^2 Quintic Lateral Trajectories
#    & Strict >= 1.28x Car-Width FIA Side-by-Side / Chicane Corridors
# 4. Distinct Competitive Personalities, <0.45s Pursuit Pressure Lockups,
#    2-Stop Soft Sprinters vs 1-Stop Whisperers & Stint-Matched Pit Fuel Strategy
# ============================================================================
class_name AIDriverController
extends Node3D

signal pit_stop_requested(driver_name: String, pit_plan: Dictionary)
signal pressure_lockup_triggered(driver_name: String, wide_excursion_m: float)

const FORWARD_RAY_LANES: Array[float] = [
	-7.2, -6.0, -4.8, -3.6, -2.4, -1.2, 0.0, 1.2, 2.4, 3.6, 4.8, 6.0, 7.2
]
const RAY_LANE_STEP_M: float = 1.2
const CORNER_SCAN_BACK_M: float = 72.0
const CORNER_SCAN_AHEAD_M: float = 180.0
const CORNER_SCAN_STEP_M: float = 4.0
const CORNER_MIN_K_REAL: float = 0.0018

const KINEMATIC_LOOKAHEAD_M: Array[float] = [
	15.0, 30.0, 45.0, 68.0, 95.0, 118.0, 140.0, 180.0
]

# Full 8-archetype motorsport definitions (covers MotorsportTelemetryData + MainRaceCoordinator)
const EXTENDED_AI_ARCHETYPES: Dictionary = {
	"APEX_TACTICIAN": {
		"id": "APEX_TACTICIAN",
		"apex_depth_m": 4.95,
		"entry_width_m": 4.85,
		"brake_offset_m": 1.2,
		"brake_aggression": 1.02,
		"defensive_range_m": 15.0,
		"undercut_laps_early": 1,
		"preferred_dry_tire": "MEDIUM",
		"puddle_avoid_weight": 1.25,
		"pressure_susceptibility": 0.42,
		"base_pace": 1.000
	},
	"LATE_BRAKER": {
		"id": "LATE_BRAKER",
		"apex_depth_m": 5.20,
		"entry_width_m": 4.65,
		"brake_offset_m": 5.2,
		"brake_aggression": 1.11,
		"defensive_range_m": 15.5,
		"undercut_laps_early": 1,
		"preferred_dry_tire": "SOFT",
		"puddle_avoid_weight": 0.95,
		"pressure_susceptibility": 1.24,
		"base_pace": 0.999
	},
	"TIRE_WHISPERER": {
		"id": "TIRE_WHISPERER",
		"apex_depth_m": 4.65,
		"entry_width_m": 5.05,
		"brake_offset_m": -2.2,
		"brake_aggression": 0.93,
		"defensive_range_m": 13.0,
		"undercut_laps_early": 0,
		"preferred_dry_tire": "MEDIUM",
		"puddle_avoid_weight": 1.40,
		"pressure_susceptibility": 0.48,
		"base_pace": 0.997
	},
	"DEFENSIVE_WALL": {
		"id": "DEFENSIVE_WALL",
		"apex_depth_m": 4.85,
		"entry_width_m": 4.40,
		"brake_offset_m": 1.5,
		"brake_aggression": 1.03,
		"defensive_range_m": 22.0,
		"undercut_laps_early": 0,
		"preferred_dry_tire": "HARD",
		"puddle_avoid_weight": 1.15,
		"pressure_susceptibility": 0.56,
		"base_pace": 0.996
	},
	"ROOKIE_WILDCARD": {
		"id": "ROOKIE_WILDCARD",
		"apex_depth_m": 5.10,
		"entry_width_m": 4.35,
		"brake_offset_m": 4.2,
		"brake_aggression": 1.08,
		"defensive_range_m": 14.0,
		"undercut_laps_early": 1,
		"preferred_dry_tire": "SOFT",
		"puddle_avoid_weight": 0.80,
		"pressure_susceptibility": 1.64,
		"base_pace": 0.994
	},
	"SLIPSTREAM_HUNTER": {
		"id": "SLIPSTREAM_HUNTER",
		"apex_depth_m": 4.90,
		"entry_width_m": 4.80,
		"brake_offset_m": 3.8,
		"brake_aggression": 1.07,
		"defensive_range_m": 15.0,
		"undercut_laps_early": 1,
		"preferred_dry_tire": "SOFT",
		"puddle_avoid_weight": 1.05,
		"pressure_susceptibility": 1.02,
		"base_pace": 0.999
	},
	"RAIN_MASTER": {
		"id": "RAIN_MASTER",
		"apex_depth_m": 4.85,
		"entry_width_m": 5.00,
		"brake_offset_m": 2.4,
		"brake_aggression": 1.04,
		"defensive_range_m": 16.5,
		"undercut_laps_early": 1,
		"preferred_dry_tire": "MEDIUM",
		"puddle_avoid_weight": 1.55,
		"pressure_susceptibility": 0.45,
		"base_pace": 0.999
	},
	"CONSISTENT_PRO": {
		"id": "CONSISTENT_PRO",
		"apex_depth_m": 4.80,
		"entry_width_m": 4.95,
		"brake_offset_m": -0.8,
		"brake_aggression": 0.97,
		"defensive_range_m": 15.5,
		"undercut_laps_early": 0,
		"preferred_dry_tire": "MEDIUM",
		"puddle_avoid_weight": 1.30,
		"pressure_susceptibility": 0.50,
		"base_pace": 0.998
	}
}

# Cached 1000-sample unclamped signed real curvature tables (m^-1) per circuit_id
static var _real_curvature_tables: Dictionary = {}

@export var archetype_id: String = "APEX_TACTICIAN"
@export var driver_name: String = "K. Takahashi"
@export var car_number: int = 7
@export var slot_index: int = 0
@export var circuit_id: String = "FUJI_1982"
@export var auto_drive_parent_rigidbody: bool = false

var archetype: Dictionary = {}
var ai_personality: Dictionary = {}
var ai_strategy_type: String = "ONE_STOP_WHISPER"
var assigned_pit_box_s: float = 976.0
var ai_target_lat: float = 0.0
var ai_decision_timer: float = 0.0
var ai_lap_brake_jitter: float = 0.0
var ai_last_jitter_key: int = -1

# C^2 Quintic Lateral Trajectory State (continuous pos, vel, acc)
var _ai_quintic_p0: float = 0.0
var _ai_quintic_v0: float = 0.0
var _ai_quintic_a0: float = 0.0
var _ai_quintic_p1: float = 0.0
var _ai_quintic_elapsed: float = 0.0
var _ai_quintic_duration: float = 0.85
var _ai_prev_lat: float = 0.0
var _ai_measured_lat_vel: float = 0.0
var _ai_has_prev_lat: bool = false

# Continuous 0..1 Human Pressure Telemetry & Apex Lockup Excursion State
var ai_pressure_meter: float = 0.0
var ai_pressure_timer: float = 0.0
var ai_pressure_cooldown: float = 0.0
var ai_mistake_timer: float = 0.0
var ai_mistake_duration: float = 1.40
var ai_mistake_lat_bias: float = 0.0
var ai_mistake_peak_lat: float = 0.0
var ai_lockup_puff_timer: float = 0.0
var ai_lockup_cooldown: float = 0.0

# Multi-Car Slipstream Train, Switchback Cutback & FIA 1-Move Defense State
var ai_in_draft_train: bool = false
var ai_draft_train_count: int = 0
var ai_pass_side: int = 1
var ai_pass_lock_timer: float = 0.0
var ai_switchback_timer: float = 0.0
var ai_switchback_sign: int = 0
var ai_defense_lat: float = 999.0
var ai_defense_moves_used: int = 0
var ai_defense_committed_side: int = 0
var ai_was_in_corner: bool = false

# Launch Stagger & Skill Spread
var ai_launch_delay_sec: float = 0.06
var ai_skill_tier_offset: float = 0.0

# Real-Time Undercut / Overcut, 2-Stop vs 1-Stop & Wet Transition Pit Strategy State
var ai_wants_to_pit: bool = false
var ai_pit_plan: Dictionary = {}
var ai_pit_reason: String = "NONE"
var ai_dirty_air_stuck_timer: float = 0.0
var ai_clean_air_timer: float = 0.0
var ai_out_lap_push_timer: float = 0.0
var ai_overcut_active: bool = false
var _ai_last_pit_lap: int = 0
var _ai_prev_pit_phase: String = "NONE"
var _ai_target_speed_kmh: float = 340.0
var _ai_corner_constrained: bool = false
var _ai_hard_braking_zone: bool = false
var _ai_zone_active: bool = false
var _ai_zone_target_s: float = 0.0
var _ai_zone_vmax_mps: float = 94.0
var _ai_zone_decel_mps2: float = 26.0
var _ai_brake_aggression: float = 1.0
var _ai_closest_ahead_gap_sec: float = 99.0
var _ai_cached_eff_grip: float = 1.0
var _pit_stops_completed: int = 0
var _cached_spline_s: float = -1.0
var _lap_counter: int = 1
var _total_distance_game_m: float = 0.0

# 3D RayCast3D sensor fan nodes (13 forward rays + 2 lateral sidepod overlap rays = 15-Ray 3D Radar)
var forward_raycasts: Array[RayCast3D] = []
var left_sidepod_ray: RayCast3D = null
var right_sidepod_ray: RayCast3D = null
var _parent_vehicle: F1VehiclePhysics3D = null


func _ready() -> void:
	init_ai_profile(archetype_id, car_number, slot_index)
	_build_3d_raycast_sensor_fan()
	if get_parent() is F1VehiclePhysics3D:
		_parent_vehicle = get_parent() as F1VehiclePhysics3D
		_exclude_parent_from_raycasts(_parent_vehicle)


func _physics_process(delta: float) -> void:
	if not auto_drive_parent_rigidbody or _parent_vehicle == null:
		return
	var peer_vehicles: Array = get_tree().get_nodes_in_group("f1_vehicles")
	var player_veh: F1VehiclePhysics3D = null
	for node in peer_vehicles:
		if node is F1VehiclePhysics3D and node.is_in_group("player_vehicle"):
			player_veh = node as F1VehiclePhysics3D
			break
	var ctx: Dictionary = {
		"circuit_id": circuit_id,
		"groove_moisture": _parent_vehicle.global_wetness,
		"vsc_active": _parent_vehicle.vsc_active,
		"total_laps": 5
	}
	step_f1_rigidbody(_parent_vehicle, peer_vehicles, player_veh, delta, ctx)


func init_ai_profile(p_archetype_id: String, p_car_num: int, p_slot_index: int) -> void:
	archetype_id = p_archetype_id
	car_number = p_car_num
	slot_index = p_slot_index

	var base_arch: Dictionary = EXTENDED_AI_ARCHETYPES.get(
		archetype_id,
		EXTENDED_AI_ARCHETYPES["APEX_TACTICIAN"]
	).duplicate()
	if MotorsportTelemetryData.AI_ARCHETYPES.has(archetype_id):
		var m_arch: Dictionary = MotorsportTelemetryData.AI_ARCHETYPES[archetype_id]
		for k in m_arch.keys():
			if not base_arch.has(k):
				base_arch[k] = m_arch[k]
	archetype = base_arch

	ai_personality = _build_driver_personality(archetype_id, driver_name, slot_index)
	ai_strategy_type = String(ai_personality.get("strategy", "ONE_STOP_WHISPER"))
	_ai_brake_aggression = float(ai_personality.get("braking_aggression", 1.0))

	var box_slots: Array = MotorsportTelemetryData.PIT_LANE_CONFIG["ai_box_slots_s"]
	assigned_pit_box_s = float(box_slots[slot_index % box_slots.size()])
	ai_decision_timer = fmod(float(slot_index) * 0.009, 0.04)
	ai_pass_side = -1 if (slot_index % 2 == 0) else 1

	var base_react: float = 0.04 + float((slot_index * 37) % 15) * 0.007
	var arch_react: float = (
		-0.015 if (archetype_id == "LATE_BRAKER" or archetype_id == "DEFENSIVE_WALL")
		else (0.035 if archetype_id == "ROOKIE_WILDCARD" else 0.0)
	)
	ai_launch_delay_sec = maxf(0.018, base_react + arch_react)
	ai_skill_tier_offset = clampf(0.012 - float(slot_index) * 0.0018, -0.014, 0.012)
	ai_lockup_cooldown = fmod(float(slot_index) * 0.7, 2.5)
	ai_pressure_meter = 0.0
	ai_defense_moves_used = 0
	ai_defense_lat = 999.0
	_ai_has_prev_lat = false


func _build_driver_personality(p_arch_id: String, p_driver_name: String, p_index: int) -> Dictionary:
	var brake_agg: float = 1.01
	var wet_mastery: float = 1.00
	var defense_craft: float = 0.88
	var composure: float = 0.88
	var late_apex_m: float = 2.5
	var slip_cap: float = 1.0
	var switchback_skill: float = 0.85
	var strat: String = "ONE_STOP_WHISPER"

	match p_arch_id:
		"LATE_BRAKER":
			brake_agg = 1.11
			wet_mastery = 0.97
			defense_craft = 0.92
			composure = 0.78
			late_apex_m = 3.8
			switchback_skill = 0.88
			strat = "TWO_STOP_SPRINT"
		"TIRE_WHISPERER":
			brake_agg = 0.93
			wet_mastery = 1.06
			defense_craft = 0.86
			composure = 0.96
			late_apex_m = 2.5
			slip_cap = 0.94
			switchback_skill = 0.92
			strat = "ONE_STOP_WHISPER"
		"DEFENSIVE_WALL":
			brake_agg = 1.03
			wet_mastery = 1.01
			defense_craft = 1.14
			composure = 0.92
			late_apex_m = 2.2
			switchback_skill = 0.80
			strat = "ONE_STOP_WHISPER"
		"ROOKIE_WILDCARD":
			brake_agg = 1.09
			wet_mastery = 0.76
			defense_craft = 0.78
			composure = 0.62
			late_apex_m = 1.4
			switchback_skill = 0.72
			strat = "TWO_STOP_SPRINT"
		"SLIPSTREAM_HUNTER":
			brake_agg = 1.07
			wet_mastery = 0.98
			defense_craft = 0.89
			composure = 0.84
			late_apex_m = 3.4
			switchback_skill = 0.90
			strat = "TWO_STOP_SPRINT"
		"RAIN_MASTER":
			brake_agg = 1.05
			wet_mastery = 1.15
			defense_craft = 1.04
			composure = 0.95
			late_apex_m = 4.2
			switchback_skill = 0.93
			strat = "TWO_STOP_SPRINT" if (p_index % 2 == 1) else "ONE_STOP_WHISPER"
		"CONSISTENT_PRO":
			brake_agg = 0.96
			wet_mastery = 1.03
			defense_craft = 0.92
			composure = 0.97
			late_apex_m = 3.0
			slip_cap = 0.96
			switchback_skill = 0.90
			strat = "ONE_STOP_WHISPER"
		_: # APEX_TACTICIAN
			brake_agg = 1.02
			wet_mastery = 1.05
			defense_craft = 0.90
			composure = 0.95
			late_apex_m = 5.5
			switchback_skill = 0.96
			strat = "TWO_STOP_SPRINT" if (p_index % 2 == 1) else "ONE_STOP_WHISPER"

	var upper_name: String = p_driver_name.to_upper()
	if upper_name.contains("SENNA") or upper_name.contains("ROSSI"):
		wet_mastery = maxf(wet_mastery, 1.14)
		brake_agg = maxf(brake_agg, 1.08)
	elif upper_name.contains("ALONSO") or upper_name.contains("MANSELL"):
		defense_craft = maxf(defense_craft, 1.12)
	elif upper_name.contains("PROST") or upper_name.contains("LAUDA") or upper_name.contains("WEBER"):
		composure = maxf(composure, 0.97)
		strat = "ONE_STOP_WHISPER"
	elif upper_name.contains("VILLENEUVE") or upper_name.contains("VANDERBILT"):
		brake_agg = maxf(brake_agg, 1.13)
		strat = "TWO_STOP_SPRINT"

	return {
		"braking_aggression": brake_agg,
		"wet_weather_mastery": wet_mastery,
		"defensive_craft": defense_craft,
		"composure": composure,
		"strategy": strat,
		"late_apex_bias_m": late_apex_m,
		"slip_angle_cap": slip_cap,
		"switchback_skill": switchback_skill
	}


func _build_3d_raycast_sensor_fan() -> void:
	for r in forward_raycasts:
		if is_instance_valid(r):
			r.queue_free()
	forward_raycasts.clear()
	if is_instance_valid(left_sidepod_ray):
		left_sidepod_ray.queue_free()
	if is_instance_valid(right_sidepod_ray):
		right_sidepod_ray.queue_free()

	var fan_angles_deg: Array[float] = [
		-26.0, -21.0, -16.5, -12.0, -8.0, -4.0, 0.0, 4.0, 8.0, 12.0, 16.5, 21.0, 26.0
	]
	for ang_deg in fan_angles_deg:
		var ray: RayCast3D = RayCast3D.new()
		ray.position = Vector3(0.0, 0.45, -1.2)
		var rad: float = deg_to_rad(ang_deg)
		ray.target_position = Vector3(sin(rad) * 76.0, 0.0, -cos(rad) * 76.0)
		ray.collision_mask = (1 << 4) | (1 << 5)
		ray.enabled = true
		add_child(ray)
		forward_raycasts.append(ray)

	left_sidepod_ray = RayCast3D.new()
	left_sidepod_ray.position = Vector3(0.0, 0.42, 0.0)
	left_sidepod_ray.target_position = Vector3(-MotorsportTelemetryData.CAR_WIDTH * 1.35, 0.0, 0.0)
	left_sidepod_ray.collision_mask = (1 << 4)
	left_sidepod_ray.enabled = true
	add_child(left_sidepod_ray)

	right_sidepod_ray = RayCast3D.new()
	right_sidepod_ray.position = Vector3(0.0, 0.42, 0.0)
	right_sidepod_ray.target_position = Vector3(MotorsportTelemetryData.CAR_WIDTH * 1.35, 0.0, 0.0)
	right_sidepod_ray.collision_mask = (1 << 4)
	right_sidepod_ray.enabled = true
	add_child(right_sidepod_ray)


func _exclude_parent_from_raycasts(body: CollisionObject3D) -> void:
	for ray in forward_raycasts:
		ray.add_exception(body)
	if left_sidepod_ray != null:
		left_sidepod_ray.add_exception(body)
	if right_sidepod_ray != null:
		right_sidepod_ray.add_exception(body)


static func _forward_dist_game_m(from_s: float, to_s: float) -> float:
	var d: float = to_s - from_s
	if d < 0.0:
		d += MotorsportTelemetryData.TRACK_GAME_LENGTH
	return d


static func _signed_delta_game_m(a: float, b: float) -> float:
	var d: float = a - b
	var half: float = MotorsportTelemetryData.TRACK_GAME_LENGTH * 0.5
	if d > half:
		d -= MotorsportTelemetryData.TRACK_GAME_LENGTH
	if d < -half:
		d += MotorsportTelemetryData.TRACK_GAME_LENGTH
	return d


static func _smoothstepf(edge0: float, edge1: float, x: float) -> float:
	var span: float = edge1 - edge0
	if absf(span) < 0.000001:
		return 1.0 if x >= edge1 else 0.0
	var t: float = clampf((x - edge0) / span, 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)


static func _quintic01(t: float) -> float:
	var c: float = clampf(t, 0.0, 1.0)
	return c * c * c * (10.0 - 15.0 * c + 6.0 * c * c)


# Evaluates a C^2 boundary-value quintic lateral spline p(t) over [0, T]
# satisfying p(0)=p0, p'(0)=v0, p''(0)=a0 and p(T)=p1, p'(T)=0, p''(T)=0.
static func _eval_quintic_lateral_spline(
	p0: float,
	v0: float,
	a0: float,
	p1: float,
	elapsed: float,
	duration: float
) -> Vector3:
	var T: float = maxf(0.25, duration)
	if elapsed >= T:
		return Vector3(p1, 0.0, 0.0)
	var tau: float = clampf(elapsed / T, 0.0, 1.0)
	var tau2: float = tau * tau
	var tau3: float = tau2 * tau
	var tau4: float = tau3 * tau
	var tau5: float = tau4 * tau

	var dp: float = p1 - p0
	var v0_t: float = v0 * T
	var a0_t2: float = a0 * T * T

	var c0: float = p0
	var c1: float = v0_t
	var c2: float = 0.5 * a0_t2
	var c3: float = 10.0 * dp - 6.0 * v0_t - 1.5 * a0_t2
	var c4: float = -15.0 * dp + 8.0 * v0_t + 1.5 * a0_t2
	var c5: float = 6.0 * dp - 3.0 * v0_t - 0.5 * a0_t2

	var pos: float = c0 + c1 * tau + c2 * tau2 + c3 * tau3 + c4 * tau4 + c5 * tau5
	var vel: float = (c1 + 2.0 * c2 * tau + 3.0 * c3 * tau2 + 4.0 * c4 * tau3 + 5.0 * c5 * tau4) / T
	var acc: float = clampf(
		(2.0 * c2 + 6.0 * c3 * tau + 12.0 * c4 * tau2 + 20.0 * c5 * tau3) / (T * T),
		-18.0,
		18.0
	)
	return Vector3(pos, vel, acc)


# ============================================================================
# DIRECT GODOT 4 RIGIDBODY3D ADAPTER (F1VehiclePhysics3D -> 100% PHYSICS PARITY)
# ============================================================================
func step_f1_rigidbody(
	vehicle: F1VehiclePhysics3D,
	all_vehicles: Array,
	player_vehicle: F1VehiclePhysics3D,
	dt: float,
	ctx: Dictionary
) -> Dictionary:
	var active_circuit: String = String(ctx.get("circuit_id", circuit_id))
	var proj: Dictionary = MotorsportTelemetryData.project_world_pos_to_spline(
		active_circuit,
		vehicle.global_position,
		_cached_spline_s
	)
	var cur_s: float = float(proj["s"])
	if _cached_spline_s >= 0.0:
		var delta_s: float = _signed_delta_game_m(cur_s, _cached_spline_s)
		if delta_s > -50.0:
			_total_distance_game_m += maxf(0.0, delta_s)
		if _cached_spline_s > 920.0 and cur_s < 80.0:
			_lap_counter += 1
	_cached_spline_s = cur_s

	var car_dict: Dictionary = _snapshot_vehicle_to_dict(
		vehicle,
		active_circuit,
		cur_s,
		float(proj["lateral_offset"]),
		false
	)
	car_dict["lap"] = int(ctx.get("lap", _lap_counter))
	car_dict["total_distance_game_m"] = float(ctx.get("total_distance_game_m", _total_distance_game_m))

	var all_dicts: Array = [car_dict]
	var player_dict: Dictionary = {}
	for other_node in all_vehicles:
		if other_node == vehicle or not (other_node is F1VehiclePhysics3D):
			continue
		var ov: F1VehiclePhysics3D = other_node as F1VehiclePhysics3D
		var o_proj: Dictionary = MotorsportTelemetryData.project_world_pos_to_spline(active_circuit, ov.global_position, -1.0)
		var is_plr: bool = (ov == player_vehicle) or ov.is_in_group("player_vehicle")
		var od: Dictionary = _snapshot_vehicle_to_dict(ov, active_circuit, float(o_proj["s"]), float(o_proj["lateral_offset"]), is_plr)
		all_dicts.append(od)
		if is_plr:
			player_dict = od

	var enriched_ctx: Dictionary = ctx.duplicate()
	enriched_ctx["circuit_id"] = active_circuit
	enriched_ctx["real_meters_per_game_meter"] = float(proj["real_m_per_game_m"])

	update_ai_physics(car_dict, all_dicts, player_dict, dt, enriched_ctx)

	var out_steer: float = float(car_dict.get("steer_input", 0.0))
	var out_throttle: float = float(car_dict.get("throttle_input", 0.0))
	var out_brake: float = float(car_dict.get("brake_input", 0.0))
	var out_drs: bool = bool(car_dict.get("drs_active", false))
	var out_ers: bool = bool(car_dict.get("ers_overtake_requested", false))

	var ctrl_frame: Dictionary = {
		"steer": out_steer,
		"throttle": out_throttle,
		"brake": out_brake,
		"request_drs": out_drs,
		"request_ers_overtake": out_ers,
		"ai_pressure_meter": ai_pressure_meter,
		"ai_wants_to_pit": ai_wants_to_pit,
		"ai_pit_plan": ai_pit_plan
	}
	if vehicle.has_method("apply_ai_control_frame"):
		vehicle.apply_ai_control_frame(ctrl_frame)
	else:
		vehicle.set_driver_inputs(out_steer, out_throttle, out_brake, out_drs, out_ers)
	if float(car_dict.get("skid_intensity", 0.0)) > vehicle.skid_intensity:
		vehicle.skid_intensity = float(car_dict["skid_intensity"])

	return ctrl_frame


func _snapshot_vehicle_to_dict(
	veh: F1VehiclePhysics3D,
	p_circuit_id: String,
	s_val: float,
	lat_val: float,
	is_plr: bool
) -> Dictionary:
	var min_life: float = 1.0
	var avg_life: float = 0.0
	var avg_temp: float = 92.0
	var max_flat_spot: float = 0.0
	var count: int = 0
	for k in veh.wheel_states.keys():
		var ws: Dictionary = veh.wheel_states[k]
		var l: float = float(ws.get("life", 1.0))
		min_life = minf(min_life, l)
		avg_life += l
		avg_temp += float(ws.get("temp_c", 92.0))
		max_flat_spot = maxf(max_flat_spot, float(ws.get("flat_spot", 0.0)))
		count += 1
	if count > 0:
		avg_life /= float(count)
		avg_temp /= float(count)
	else:
		avg_life = 1.0

	# Compute true 3D Frenet lateral velocity d(lateral_offset)/dt along spline right vector
	var spline_frame: Dictionary = MotorsportTelemetryData.sample_circuit_3d_spline(p_circuit_id, s_val)
	var spline_right: Vector3 = spline_frame["right"] as Vector3
	var frenet_lat_vel: float = veh.linear_velocity.dot(spline_right)
	var fuel_mass_kg: float = maxf(0.0, veh.mass - veh.dry_mass_kg)

	return {
		"is_player": is_plr,
		"s": s_val,
		"lateral_offset": lat_val,
		"lateral_vel": frenet_lat_vel,
		"speed_kmh": veh.speed_kmh,
		"steer_input": veh.steer_input,
		"throttle_input": veh.throttle_input,
		"brake_input": veh.brake_input,
		"in_slipstream": veh.in_slipstream,
		"drs_active": veh.drs_active,
		"ers_charge": veh.ers_charge_j / maxf(1.0, veh.ers_max_charge_j),
		"in_pit_lane": veh.in_pit_lane,
		"pit_phase": "NONE",
		"compound": veh.compound_id,
		"min_tire_life": min_life,
		"avg_tire_life": avg_life,
		"avg_tire_temp_c": avg_temp,
		"max_flat_spot": max_flat_spot,
		"fuel_laps": veh.fuel_laps_remaining,
		"fuel_kg": fuel_mass_kg,
		"perf_mods": veh.perf_mods,
		"front_wing_damage": float(veh.damage_state.get("front_wing", 0.0)),
		"rear_wing_damage": float(veh.damage_state.get("rear_wing", 0.0)),
		"suspension_damage": float(veh.damage_state.get("suspension", 0.0)),
		"has_puncture": bool(veh.damage_state.get("has_puncture", false)),
		"aquaplane_timer": veh.aquaplane_timer,
		"skid_intensity": veh.skid_intensity,
		"exploded": false,
		"circuit_id": p_circuit_id
	}


# ============================================================================
# MAIN 240Hz AI RACECRAFT & KINEMATIC CONTROLLER (100% PARITY WITH src/ai.js)
# ============================================================================
func update_ai_physics(
	car: Dictionary,
	all_cars: Array,
	player_car: Dictionary,
	dt: float,
	ctx: Dictionary
) -> void:
	if dt <= 0.0 or is_nan(dt):
		return

	if archetype.is_empty():
		init_ai_profile(archetype_id, car_number, slot_index)

	var cur_pit_phase: String = String(car.get("pit_phase", "NONE"))
	if bool(car.get("exploded", false)) or cur_pit_phase == "STOPPED":
		_ai_prev_pit_phase = cur_pit_phase
		_ai_prev_lat = float(car.get("lateral_offset", 0.0))
		_ai_measured_lat_vel = 0.0
		return

	if _ai_prev_pit_phase == "STOPPED" and cur_pit_phase == "EXIT":
		ai_out_lap_push_timer = 42.0
		ai_dirty_air_stuck_timer = 0.0
		ai_overcut_active = false
		_pit_stops_completed += 1
	_ai_prev_pit_phase = cur_pit_phase

	if bool(ctx.get("controls_locked", false)):
		var grid_lat: float = float(car.get("lateral_offset", 0.0))
		car["steer_input"] = 0.0
		car["brake_input"] = 0.0
		car["throttle_input"] = 0.65
		ai_target_lat = grid_lat
		_ai_quintic_p0 = grid_lat
		_ai_quintic_v0 = 0.0
		_ai_quintic_a0 = 0.0
		_ai_quintic_p1 = grid_lat
		_ai_quintic_elapsed = 0.0
		_ai_prev_lat = grid_lat
		_ai_measured_lat_vel = 0.0
		_ai_has_prev_lat = true
		return

	var safe_dt: float = minf(0.05, dt)
	var is_classic: bool = String(ctx.get("mode", "2026_UPDATED")) == "1982_ORIGINAL"
	var is_qualifying: bool = bool(ctx.get("is_qualifying", false))
	var total_laps: int = int(ctx.get("total_laps", 5))
	var m_per_game_m: float = maxf(
		0.5,
		float(ctx.get("real_meters_per_game_meter", MotorsportTelemetryData.DEFAULT_REAL_M_PER_GAME_M))
	)

	if ai_pass_lock_timer > 0.0:
		ai_pass_lock_timer = maxf(0.0, ai_pass_lock_timer - safe_dt)
	if ai_switchback_timer > 0.0:
		ai_switchback_timer = maxf(0.0, ai_switchback_timer - safe_dt)
	if ai_mistake_timer > 0.0:
		ai_mistake_timer = maxf(0.0, ai_mistake_timer - safe_dt)
	if ai_lockup_puff_timer > 0.0:
		ai_lockup_puff_timer = maxf(0.0, ai_lockup_puff_timer - safe_dt)
	if ai_lockup_cooldown > 0.0:
		ai_lockup_cooldown = maxf(0.0, ai_lockup_cooldown - safe_dt)
	if ai_pressure_cooldown > 0.0:
		ai_pressure_cooldown = maxf(0.0, ai_pressure_cooldown - safe_dt)
	if ai_out_lap_push_timer > 0.0:
		ai_out_lap_push_timer = maxf(0.0, ai_out_lap_push_timer - safe_dt)

	var cur_lat: float = float(car.get("lateral_offset", 0.0))
	if not _ai_has_prev_lat or absf(cur_lat - _ai_prev_lat) >= 2.2:
		_ai_prev_lat = cur_lat
		_ai_measured_lat_vel = float(car.get("lateral_vel", 0.0))
		_ai_quintic_p0 = cur_lat
		_ai_quintic_p1 = cur_lat
		_ai_quintic_v0 = 0.0
		_ai_quintic_a0 = 0.0
		_ai_quintic_elapsed = 0.0
		_ai_has_prev_lat = true
	else:
		var inst_lat_vel: float = (cur_lat - _ai_prev_lat) / safe_dt
		var vel_alpha: float = 1.0 - exp(-42.0 * safe_dt)
		_ai_measured_lat_vel += (inst_lat_vel - _ai_measured_lat_vel) * vel_alpha
		_ai_prev_lat = cur_lat

	if not is_qualifying and int(car.get("lap", 1)) == 1 and float(car.get("current_lap_time", 99.0)) < ai_launch_delay_sec:
		car["steer_input"] = 0.0
		car["throttle_input"] = 0.55
		car["brake_input"] = 0.0
		return

	# ------------------------------------------------------------------------
	# 1. UNCLAMPED REAL CURVATURE (m^-1) & HUMAN PURSUIT PRESSURE (< 0.45s)
	# ------------------------------------------------------------------------
	var s: float = float(car.get("s", 0.0))
	var in_pit_lane: bool = bool(car.get("in_pit_lane", false))
	var cur_k_real: float = 0.0 if in_pit_lane else _sample_real_curvature(ctx, s)
	var abs_cur_k_real: float = absf(cur_k_real)
	var speed_kmh: float = maxf(0.0, float(car.get("speed_kmh", 0.0)))
	var speed_mps: float = speed_kmh / 3.6

	# Reset FIA 1-Move Defensive Counter upon completing each real corner onto a straight
	if abs_cur_k_real > 0.0032:
		ai_was_in_corner = true
	elif ai_was_in_corner and abs_cur_k_real < 0.0012:
		ai_was_in_corner = false
		ai_defense_moves_used = 0
		ai_defense_committed_side = 0
		ai_defense_lat = 999.0

	_update_human_pressure_and_mistakes(
		car,
		all_cars,
		cur_k_real,
		abs_cur_k_real,
		speed_mps,
		m_per_game_m,
		is_classic,
		is_qualifying,
		safe_dt
	)
	car["ai_pressure_meter"] = ai_pressure_meter

	# ------------------------------------------------------------------------
	# 2. 25Hz CONTINUOUS SUB-RAY SPATIAL & 180M CORNER-PHYSICS PLANNER
	# ------------------------------------------------------------------------
	ai_decision_timer -= safe_dt
	if ai_decision_timer <= 0.0:
		ai_decision_timer = 0.04
		_run_continuous_spatial_and_corner_planner(
			car,
			all_cars,
			player_car,
			is_classic,
			is_qualifying,
			total_laps,
			ctx
		)

	# ------------------------------------------------------------------------
	# 3. 240Hz C^2 QUINTIC LATERAL TRAJECTORY + FIA >=1.28x SIDEPOD GUARD
	# ------------------------------------------------------------------------
	_ai_quintic_elapsed += safe_dt
	var q_state: Vector3 = _eval_quintic_lateral_spline(
		_ai_quintic_p0,
		_ai_quintic_v0,
		_ai_quintic_a0,
		_ai_quintic_p1,
		_ai_quintic_elapsed,
		_ai_quintic_duration
	)
	var desired_lat: float = q_state.x
	var desired_lat_vel: float = clampf(q_state.y, -6.2, 6.2)
	var desired_lat_acc: float = clampf(q_state.z, -11.5, 11.5)

	var road_half: float = MotorsportTelemetryData.ROAD_HALF_WIDTH
	var car_w: float = MotorsportTelemetryData.CAR_WIDTH

	# Smooth C^2 quintic peel-off into right-hand Pit Entry split (s in [856..932])
	if not is_classic and ai_wants_to_pit and not in_pit_lane:
		if s >= 856.0 and s < 898.0:
			var blend: float = _quintic01((s - 856.0) / 42.0)
			desired_lat = lerpf(desired_lat, road_half * 0.68, blend)
			desired_lat_vel *= (1.0 - blend * 0.6)
			desired_lat_acc *= (1.0 - blend * 0.8)
		elif s >= 898.0 and s <= 932.0:
			desired_lat = road_half * 0.72
			desired_lat_vel = 0.0
			desired_lat_acc = 0.0

	# Smooth C^2 sin^2(pi * phase) bell wide-apex drift (1.0m-1.6m) on pursuit-pressure lockup
	if ai_mistake_timer > 0.0:
		var dur: float = maxf(0.45, ai_mistake_duration)
		var phase: float = 1.0 - clampf(ai_mistake_timer / dur, 0.0, 1.0)
		var s_bell: float = sin(PI * phase)
		ai_mistake_lat_bias = ai_mistake_peak_lat * s_bell * s_bell
		desired_lat = clampf(desired_lat + ai_mistake_lat_bias, -road_half + 1.05, road_half - 1.05)
	else:
		ai_mistake_lat_bias = 0.0

	# 240Hz Emergency Lateral Evasion & Anti-Rear-End Braking behind Player
	var emergency_brake_behind_player: float = 0.0
	if not in_pit_lane and not player_car.is_empty() and not bool(player_car.get("exploded", false)) and not bool(player_car.get("in_pit_lane", false)):
		var player_ahead_m: float = _forward_dist_game_m(s, float(player_car.get("s", 0.0))) * m_per_game_m
		if player_ahead_m > 1.2 and player_ahead_m < 36.0:
			var player_lat: float = float(player_car.get("lateral_offset", 0.0))
			var lat_to_player: float = absf(cur_lat - player_lat)
			var closing_on_player: float = speed_kmh - float(player_car.get("speed_kmh", 0.0))
			var player_brake: float = float(player_car.get("brake_input", 0.0))
			if lat_to_player < car_w * 1.38 and (player_brake > 0.14 or closing_on_player > 7.0):
				var room_left: float = player_lat - (-road_half + 1.35)
				var room_right: float = (road_half - 1.35) - player_lat
				var evade_side: int = ai_pass_side if ai_pass_side != 0 else 1
				if evade_side < 0 and room_left < car_w * 1.36:
					evade_side = 1
				elif evade_side > 0 and room_right < car_w * 1.36:
					evade_side = -1
				var evade_lat: float = clampf(player_lat + float(evade_side) * (car_w * 1.58), -road_half + 1.15, road_half - 1.15)
				var urgency_blend: float = maxf(0.32, _quintic01((36.0 - player_ahead_m) / 24.0))
				desired_lat = lerpf(desired_lat, evade_lat, urgency_blend)
				if player_ahead_m < 21.0 and lat_to_player < car_w * 1.14:
					emergency_brake_behind_player = clampf(
						(closing_on_player + (16.5 if player_brake > 0.2 else 8.0)) / 34.0,
						player_brake * 0.86,
						1.0
					)

	# 240Hz FIA Sidepod & Chicane Corridor Guard (>= 1.28x car width + 3D RayCast3D fusion)
	if not in_pit_lane:
		var look_k22: float = _sample_real_curvature(ctx, s + 22.0 / m_per_game_m)
		var in_rt_chicane: bool = (cur_k_real * look_k22 < -0.000004) or (abs_cur_k_real > 0.0035 and absf(look_k22) > 0.0035)
		var rt_left_min: float = -road_half + 1.05
		var rt_right_max: float = (road_half - 1.35) if (s >= 946.0 or s <= 78.0) else (road_half - 1.05)

		if left_sidepod_ray != null and left_sidepod_ray.is_colliding():
			rt_left_min = maxf(rt_left_min, cur_lat + 0.35)
		if right_sidepod_ray != null and right_sidepod_ray.is_colliding():
			rt_right_max = minf(rt_right_max, cur_lat - 0.35)

		for other in all_cars:
			if other == car or bool(other.get("exploded", false)) or bool(other.get("in_pit_lane", false)):
				continue
			var is_plr: bool = bool(other.get("is_player", false))
			var ds_real: float = absf(_signed_delta_game_m(float(other.get("s", 0.0)), s)) * m_per_game_m
			var overlap_zone_m: float = MotorsportTelemetryData.CAR_LENGTH * (1.32 if is_plr else 1.18) + (1.6 if in_rt_chicane else 0.0)
			if ds_real < overlap_zone_m:
				var corridor: float = car_w * (1.32 if is_plr else (1.30 if in_rt_chicane else 1.28))
				var other_lat: float = float(other.get("lateral_offset", 0.0))
				if other_lat <= cur_lat:
					rt_left_min = maxf(rt_left_min, other_lat + corridor)
				else:
					rt_right_max = minf(rt_right_max, other_lat - corridor)

		if rt_left_min <= rt_right_max:
			if desired_lat < rt_left_min:
				desired_lat = rt_left_min
				desired_lat_vel = maxf(0.0, desired_lat_vel)
			elif desired_lat > rt_right_max:
				desired_lat = rt_right_max
				desired_lat_vel = minf(0.0, desired_lat_vel)
		else:
			desired_lat = clampf((rt_left_min + rt_right_max) * 0.5, -road_half + 1.0, road_half - 1.0)
			desired_lat_vel = 0.0
			desired_lat_acc = 0.0

	ai_target_lat = desired_lat

	# ------------------------------------------------------------------------
	# 4. 240Hz DYNAMIC-BICYCLE CURVATURE FEEDFORWARD + FRENET PATH STEERING
	# ------------------------------------------------------------------------
	var raw_steer: float = 0.0
	if not in_pit_lane and speed_mps > 0.5:
		var preview_dist_m: float = clampf(2.8 + speed_mps * 0.13, 2.8, 13.5)
		var look_k_real: float = _sample_real_curvature(ctx, s + preview_dist_m / m_per_game_m)
		var blend_k_real: float = cur_k_real * 0.45 + look_k_real * 0.55

		var frenet_j: float = maxf(0.42, 1.0 - blend_k_real * desired_lat)
		var v_ref: float = maxf(11.0, speed_mps)
		var path_curv_real: float = (blend_k_real / frenet_j) + (desired_lat_acc / (v_ref * v_ref))

		var wheelbase_m: float = 3.60
		var ackermann_rad: float = atan(wheelbase_m * path_curv_real)
		var fw_dmg: float = clampf(float(car.get("front_wing_damage", 0.0)), 0.0, 1.0)
		var fast_factor: float = _smoothstepf(155.0, 295.0, speed_kmh)
		var eff_grip_est: float = clampf(_ai_cached_eff_grip, 0.35, 1.20)
		var lat_accel_mps2: float = path_curv_real * speed_mps * speed_mps

		var c_yaw_damp: float = 1080.0 + 3.4 * speed_mps * speed_mps
		var df_est_n: float = maxf(2600.0, (3740.0 + 1.67 * speed_mps * speed_mps) * 1.48 * eff_grip_est * (1.0 - 0.45 * fw_dmg))
		var yaw_damp_comp_rad: float = ((c_yaw_damp * speed_mps * path_curv_real) / wheelbase_m) / (14.6 * df_est_n)
		var understeer_comp_rad: float = (
			yaw_damp_comp_rad +
			clampf(lat_accel_mps2 / maxf(5.5, 9.81 * eff_grip_est), -1.15, 1.15) * (0.042 + 0.052 * fw_dmg * fast_factor)
		)
		var p_mods: Dictionary = car.get("perf_mods", {}) as Dictionary
		var agility_mod: float = clampf(float(p_mods.get("agility_mult", 1.0)), 0.85, 1.25)
		var hairpin_boost: float = 1.0 + 0.18 * (1.0 - _smoothstepf(35.0, 125.0, speed_kmh))
		var high_speed_calm: float = 1.0 - 0.14 * _smoothstepf(235.0, 335.0, speed_kmh)
		var max_steer_rad: float = 0.285 * hairpin_boost * high_speed_calm * agility_mod
		var bicycle_ff_steer: float = (ackermann_rad + understeer_comp_rad) / maxf(0.20, max_steer_rad)

		var cur_k_scaled: float = blend_k_real * 82.0
		var kv_factor: float = 1.0 + 0.00015 * speed_mps * speed_mps
		var front_aero_eff: float = 1.0 if is_classic else (1.0 - fw_dmg * 0.40 * fast_factor)
		var steer_auth: float = (0.35 if float(car.get("aquaplane_timer", 0.0)) > 0.0 else 1.0) * maxf(0.45, front_aero_eff)
		var rate_denom: float = maxf(8.0, steer_auth * minf(28.5, maxf(13.5, speed_mps * 0.60)))
		var needed_non_lin: float = clampf((cur_k_scaled * speed_mps * speed_mps * 0.00315 * kv_factor) / rate_denom, -0.92, 0.92)
		var planted_ff_steer: float = (
			0.0 if is_zero_approx(needed_non_lin)
			else signf(needed_non_lin) * pow(absf(needed_non_lin), 1.0 / 1.32)
		)
		var has_active_yaw: bool = absf(float(car.get("yaw_rate", 0.0))) > 0.015
		var ff_steer: float = (
			(0.78 * bicycle_ff_steer + 0.22 * planted_ff_steer)
			if has_active_yaw
			else (0.45 * bicycle_ff_steer + 0.55 * planted_ff_steer)
		)

		var lat_err: float = desired_lat - cur_lat
		var live_lat_vel: float = (
			float(car.get("lateral_vel", _ai_measured_lat_vel))
			if car.has("lateral_vel")
			else _ai_measured_lat_vel
		)
		var kp_base: float = 0.36 if archetype_id == "APEX_TACTICIAN" else (0.30 if archetype_id == "TIRE_WHISPERER" else 0.33)
		var kp: float = kp_base * (1.0 - 0.22 * _smoothstepf(180.0, 325.0, speed_kmh))
		var kd: float = (0.072 if archetype_id == "TIRE_WHISPERER" else 0.064) * (1.0 + 0.15 * _smoothstepf(180.0, 325.0, speed_kmh))
		var fb_steer: float = clampf(lat_err * kp + clampf(desired_lat_vel * 0.42 - live_lat_vel, -14.0, 14.0) * kd, -0.82, 0.82)

		var aquaplane_boost: float = 1.35 if float(car.get("aquaplane_timer", 0.0)) > 0.0 else 1.0
		var slip_cap: float = float(ai_personality.get("slip_angle_cap", 1.0))
		var steer_ceiling: float = 0.94 if (slip_cap < 0.98 and abs_cur_k_real > 0.008) else 1.0
		raw_steer = clampf((ff_steer + fb_steer) * aquaplane_boost, -steer_ceiling, steer_ceiling)

		if absf(path_curv_real) < 0.00025 and absf(lat_err) < 0.015 and absf(live_lat_vel) < 0.04:
			raw_steer = 0.0

	var steer_rate: float = 18.5 if archetype_id == "TIRE_WHISPERER" else 23.0
	var steer_alpha: float = 1.0 - exp(-steer_rate * safe_dt)
	var cur_steer: float = float(car.get("steer_input", 0.0))
	var next_steer: float = cur_steer + (raw_steer - cur_steer) * steer_alpha
	if absf(next_steer) < 0.0015 and raw_steer == 0.0:
		next_steer = 0.0
	car["steer_input"] = next_steer

	# ------------------------------------------------------------------------
	# 5. UNSTARVED 240Hz WOT THROTTLE, FRICTION-ELLIPSE TRAIL-BRAKING & DRS
	#    (Fixes L518 0.94/0.52 throttle starvation -> full 1.00 WOT on straights & sweepers!)
	# ------------------------------------------------------------------------
	var live_target_kmh: float = _ai_target_speed_kmh
	if not in_pit_lane and _ai_zone_active:
		var d_live_m: float = _signed_delta_game_m(_ai_zone_target_s, s) * m_per_game_m
		var live_allow_kmh: float = (
			sqrt(_ai_zone_vmax_mps * _ai_zone_vmax_mps + 2.0 * _ai_zone_decel_mps2 * d_live_m) * 3.6
			if d_live_m > 0.25
			else _ai_zone_vmax_mps * 3.6
		)
		if live_allow_kmh < live_target_kmh:
			live_target_kmh = live_allow_kmh

	var speed_diff: float = live_target_kmh - speed_kmh
	var wet_w: float = clampf(float(ctx.get("groove_moisture", 0.0)), 0.0, 1.0)
	var wet_mastery: float = float(ai_personality.get("wet_weather_mastery", 1.0))

	var traction_cap: float = 1.0
	var in_slow_med_corner_load: bool = (abs_cur_k_real > 0.0085 and speed_kmh < 185.0) or absf(next_steer) > 0.42
	if in_slow_med_corner_load or wet_w > 0.08:
		var switchback_boost: float = 0.05 if ai_switchback_timer > 0.0 else 0.0
		var arch_exit_base: float = (
			0.91 if archetype_id == "TIRE_WHISPERER"
			else (1.00 if archetype_id == "ROOKIE_WILDCARD" else 0.96)
		)
		var wet_penalty: float = wet_w * maxf(0.06, 0.24 - (wet_mastery - 0.95) * 0.30)
		var steer_load: float = clampf((absf(next_steer) - 0.22) / 0.58, 0.0, 1.0)
		var corner_load_pen: float = (1.0 - arch_exit_base) * steer_load if in_slow_med_corner_load else 0.0
		traction_cap = clampf(1.0 + switchback_boost - corner_load_pen - wet_penalty, 0.62, 1.0)

	var desired_brake: float = 0.0
	if in_pit_lane and cur_pit_phase == "EXIT" and s >= 68.0 and s <= 115.0:
		car["throttle_input"] = 1.0
		desired_brake = 0.0
	elif not _ai_corner_constrained and speed_diff >= -1.2:
		# Flat-out straightaway or flat-out high-speed sweeper: FULL 1.00 WOT THROTTLE!
		car["throttle_input"] = traction_cap
		desired_brake = 0.0
	elif speed_diff > 1.2:
		var ramp: float = _smoothstepf(0.0, 9.5, speed_diff)
		car["throttle_input"] = clampf(0.68 + 0.32 * ramp, 0.35, traction_cap)
		desired_brake = 0.0
	elif speed_diff < -1.8:
		var over_speed: float = -speed_diff
		var lat_load_norm: float = clampf(absf(next_steer) * 1.15 + abs_cur_k_real * speed_mps * speed_mps / 36.0, 0.0, 1.0)
		var peak_pedal: float = 0.95 if ai_lockup_puff_timer > 0.0 else 0.86
		var trail_cap: float = peak_pedal * sqrt(maxf(0.24, 1.0 - 0.58 * lat_load_norm * lat_load_norm))
		if not _ai_hard_braking_zone and over_speed < 6.0 and abs_cur_k_real >= 0.0020 and speed_kmh > 245.0:
			car["throttle_input"] = clampf(0.34 - over_speed * 0.045, 0.05, 0.34)
			desired_brake = 0.0
		else:
			car["throttle_input"] = 0.0
			var base_pedal: float = 0.54 if _ai_hard_braking_zone else 0.14
			desired_brake = clampf((base_pedal + over_speed / 15.0) * _ai_brake_aggression, 0.08, trail_cap)
	else:
		if abs_cur_k_real < 0.0045:
			car["throttle_input"] = 1.0
		else:
			var maint: float = 0.68 + ((speed_diff + 1.8) / 3.0) * 0.32
			car["throttle_input"] = clampf(maint, 0.48, traction_cap)
		desired_brake = 0.0

	var prev_brake_in: float = float(car.get("brake_input", 0.0))
	var brake_hyd_rate: float = 38.0 if desired_brake >= prev_brake_in else 46.0
	var smooth_brake_in: float = prev_brake_in + (desired_brake - prev_brake_in) * (1.0 - exp(-brake_hyd_rate * safe_dt))
	car["brake_input"] = 0.0 if smooth_brake_in < 0.003 else smooth_brake_in

	if emergency_brake_behind_player > 0.05:
		car["throttle_input"] = 0.0
		car["brake_input"] = maxf(float(car.get("brake_input", 0.0)), emergency_brake_behind_player)

	# Unblocked FIA DRS (< 1.0s detection gap + >0.95 WOT throttle + functional rear wing < 0.35)
	var rw_dmg: float = float(car.get("rear_wing_damage", 0.0))
	var vsc_now: bool = bool(ctx.get("vsc_active", false))
	var within_drs_gap: bool = (_ai_closest_ahead_gap_sec < 1.0) or bool(car.get("in_slipstream", false)) or is_qualifying
	var out_thr: float = float(car.get("throttle_input", 0.0))
	var out_brk: float = float(car.get("brake_input", 0.0))
	var drs_eligible: bool = (
		not is_classic
		and not in_pit_lane
		and not vsc_now
		and rw_dmg < 0.35
		and wet_w < 0.15
		and abs_cur_k_real < 0.0038
		and absf(next_steer) < 0.10
		and out_thr > 0.95
		and out_brk < 0.02
		and speed_kmh > 192.0
		and within_drs_gap
	)
	car["drs_active"] = drs_eligible
	car["drs_requested"] = drs_eligible

	car["ers_overtake_requested"] = (
		not is_classic
		and not in_pit_lane
		and float(car.get("ers_charge", 1.0)) > 0.16
		and out_thr > 0.78
		and out_brk < 0.02
		and abs_cur_k_real < 0.0075
		and (ai_pass_lock_timer > 0.0 or ai_switchback_timer > 0.0 or ai_out_lap_push_timer > 0.0 or ai_defense_moves_used > 0)
	)

	# Heavy-braking inside-front tire-smoke lockup puffs under battle pressure
	if not in_pit_lane and out_brk > 0.52 and speed_kmh > 112.0:
		if ai_lockup_puff_timer <= 0.0 and ai_lockup_cooldown <= 0.0:
			var pressured: bool = ai_pressure_meter > 0.38 or bool(car.get("in_slipstream", false)) or ai_in_draft_train
			var comp_val: float = float(ai_personality.get("composure", 0.85))
			var base_lock: float = 0.34 if archetype_id == "LATE_BRAKER" else (0.42 if archetype_id == "ROOKIE_WILDCARD" else 0.14)
			var chance: float = base_lock + ai_pressure_meter * 0.38 * (1.35 - comp_val * 0.5)
			if pressured and randf() < chance:
				ai_lockup_puff_timer = 0.26 + randf() * 0.26
				ai_lockup_cooldown = 3.2 + randf() * 2.5
				car["max_flat_spot"] = clampf(float(car.get("max_flat_spot", 0.0)) + 0.08, 0.0, 1.0)
			else:
				ai_lockup_cooldown = 0.90
	if ai_lockup_puff_timer > 0.0 and (out_brk > 0.18 or ai_mistake_timer > 0.0):
		car["skid_intensity"] = maxf(float(car.get("skid_intensity", 0.0)), 0.92)


# ============================================================================
# PURSUIT PRESSURE (< 0.45s GAP) -> INSIDE-FRONT LOCKUP SMOKE & WIDE APEX
# ============================================================================
func _update_human_pressure_and_mistakes(
	car: Dictionary,
	all_cars: Array,
	cur_k_real: float,
	abs_cur_k_real: float,
	speed_mps: float,
	m_per_game_m: float,
	is_classic: bool,
	is_qualifying: bool,
	dt: float
) -> void:
	if is_qualifying or bool(car.get("in_pit_lane", false)):
		ai_pressure_meter = maxf(0.0, ai_pressure_meter - dt * 0.35)
		return

	var s: float = float(car.get("s", 0.0))
	var my_spd: float = float(car.get("speed_kmh", 0.0))
	var min_stalk_m: float = 999.0
	var min_stalk_sec: float = 99.0
	var stalker_is_plr: bool = false
	var stalker_closing_kmh: float = 0.0

	for other in all_cars:
		if other == car or bool(other.get("exploded", false)) or bool(other.get("in_pit_lane", false)):
			continue
		var behind_m: float = _signed_delta_game_m(s, float(other.get("s", 0.0))) * m_per_game_m
		if behind_m > 1.8 and behind_m < 34.0:
			var gap_sec: float = behind_m / maxf(18.0, speed_mps)
			if behind_m < min_stalk_m:
				min_stalk_m = behind_m
				min_stalk_sec = gap_sec
				stalker_is_plr = bool(other.get("is_player", false))
				stalker_closing_kmh = float(other.get("speed_kmh", 0.0)) - my_spd

	var is_stalked: bool = (min_stalk_sec < 0.45 or min_stalk_m < 13.5) and stalker_closing_kmh > -12.0
	var composure: float = float(ai_personality.get("composure", 0.85))
	var suscept: float = float(archetype.get("pressure_susceptibility", 0.75)) * (1.28 - composure * 0.42)

	if is_stalked and ai_pressure_cooldown <= 0.0:
		var prox_mult: float = 1.45 if (min_stalk_sec < 0.25 or min_stalk_m < 8.2) else 1.0
		var corner_mult: float = 1.38 if abs_cur_k_real > 0.0038 else 0.80
		var hero_mult: float = 1.20 if stalker_is_plr else 0.92
		ai_pressure_meter = clampf(ai_pressure_meter + dt * 0.148 * suscept * prox_mult * corner_mult * hero_mult, 0.0, 1.0)
		ai_pressure_timer += dt
	else:
		var decay: float = 0.28 if ai_pressure_cooldown > 0.0 else 0.13
		ai_pressure_meter = clampf(ai_pressure_meter - dt * decay, 0.0, 1.0)
		if not is_stalked:
			ai_pressure_timer = maxf(0.0, ai_pressure_timer - dt * 0.5)

	var threshold: float = clampf(0.76 + composure * 0.21, 0.80, 0.97)
	if not is_classic and ai_mistake_timer <= 0.0 and ai_pressure_cooldown <= 0.0 and ai_pressure_meter >= threshold and abs_cur_k_real > 0.0055 and my_spd > 88.0:
		var outside_dir: float = -signf(cur_k_real if absf(cur_k_real) > 0.0001 else 1.0)
		var wide_meters: float = 1.02 + randf() * 0.56 # Smooth [1.02m .. 1.58m] C^2 wide apex drift
		ai_mistake_duration = 1.40
		ai_mistake_timer = ai_mistake_duration
		ai_mistake_peak_lat = outside_dir * wide_meters
		ai_lockup_puff_timer = 0.52 + randf() * 0.22
		car["skid_intensity"] = 0.96
		car["max_flat_spot"] = clampf(float(car.get("max_flat_spot", 0.0)) + 0.14, 0.0, 1.0)
		ai_pressure_meter = 0.16
		ai_pressure_timer = 0.0
		ai_pressure_cooldown = 11.5 if archetype_id == "ROOKIE_WILDCARD" else 16.0
		pressure_lockup_triggered.emit(driver_name, wide_meters)


# ============================================================================
# 180M UNCLAMPED REAL-CURVATURE FORWARD CORNER ZONE SCANNER & RACING LINE
# ============================================================================
func _scan_forward_corners_and_line(
	car: Dictionary,
	s: float,
	m_per_game_m: float,
	side_by_side_in_chicane: bool,
	ctx: Dictionary
) -> Dictionary:
	var zones: Array[Dictionary] = []
	var active: Dictionary = {}
	var has_active: bool = false

	var d: float = -CORNER_SCAN_BACK_M
	while d <= CORNER_SCAN_AHEAD_M + 0.001:
		var k_real: float = _sample_real_curvature(ctx, s + d / m_per_game_m)
		var abs_k: float = absf(k_real)
		var sign_k: int = 1 if k_real >= 0.0 else -1

		if abs_k >= CORNER_MIN_K_REAL:
			if not has_active or int(active["sign"]) != sign_k:
				if has_active and float(active["d_out"]) >= -22.0:
					zones.append(active)
				active = {
					"sign": sign_k,
					"d_in": d,
					"d_out": d,
					"k_peak": abs_k,
					"d_peak_raw": d,
					"weighted_d_sum": d * abs_k * abs_k,
					"weight_sum": abs_k * abs_k,
					"delta_theta_full": abs_k * CORNER_SCAN_STEP_M,
					"delta_theta_ahead": (abs_k * CORNER_SCAN_STEP_M) if d >= 0.0 else 0.0,
					"d_apex": d
				}
				has_active = true
			else:
				active["d_out"] = d
				active["delta_theta_full"] = float(active["delta_theta_full"]) + abs_k * CORNER_SCAN_STEP_M
				if d >= 0.0:
					active["delta_theta_ahead"] = float(active["delta_theta_ahead"]) + abs_k * CORNER_SCAN_STEP_M
				active["weighted_d_sum"] = float(active["weighted_d_sum"]) + d * abs_k * abs_k
				active["weight_sum"] = float(active["weight_sum"]) + abs_k * abs_k
				if abs_k > float(active["k_peak"]):
					active["k_peak"] = abs_k
					active["d_peak_raw"] = d
		elif has_active and (d - float(active["d_out"])) > 8.0:
			if float(active["d_out"]) >= -22.0:
				zones.append(active)
			active = {}
			has_active = false

		d += CORNER_SCAN_STEP_M

	if has_active and float(active["d_out"]) >= -22.0:
		zones.append(active)

	var late_apex_bias: float = float(ai_personality.get("late_apex_bias_m", 2.0))
	for i in range(zones.size()):
		var z: Dictionary = zones[i]
		var w_sum: float = float(z["weight_sum"])
		var d_peak_raw: float = float(z["d_peak_raw"])
		var centroid_apex: float = (float(z["weighted_d_sum"]) / w_sum) if w_sum > 1.0e-9 else d_peak_raw
		z["d_apex"] = centroid_apex + late_apex_bias * 0.25

	var racing_line_lat: float = (1.0 if (car_number % 2 == 0) else -1.0) * 1.35
	var upcoming_zone: Dictionary = {}
	var is_chicane_flip: bool = false

	if zones.size() >= 2:
		var z0: Dictionary = zones[0]
		var z1: Dictionary = zones[1]
		if int(z0["sign"]) != int(z1["sign"]) and (float(z1["d_in"]) - float(z0["d_out"])) < 42.0 and float(z0["d_in"]) < 65.0:
			is_chicane_flip = true

	for i in range(zones.size()):
		var cand: Dictionary = zones[i]
		if float(cand["delta_theta_full"]) >= 0.24 or float(cand["k_peak"]) >= 0.0045:
			upcoming_zone = cand
			break
	if upcoming_zone.is_empty() and not zones.is_empty():
		upcoming_zone = zones[0]

	if not upcoming_zone.is_empty():
		var z_sign: float = float(upcoming_zone["sign"])
		var d_in: float = float(upcoming_zone["d_in"])
		var d_out: float = float(upcoming_zone["d_out"])
		var d_apex: float = float(upcoming_zone["d_apex"])
		var d_theta: float = float(upcoming_zone["delta_theta_full"])

		var turn_severity: float = _smoothstepf(0.18, 0.95, d_theta)
		var max_apex_depth: float = (
			3.25 if side_by_side_in_chicane
			else (4.15 if is_chicane_flip else (4.15 + 1.15 * turn_severity))
		)
		var max_outside_width: float = (
			3.25 if side_by_side_in_chicane
			else (3.65 + 1.45 * turn_severity)
		)

		var outside_entry_lat: float = -z_sign * max_outside_width
		var inside_apex_lat: float = z_sign * max_apex_depth
		var outside_exit_lat: float = -z_sign * max_outside_width

		var spd_mps: float = maxf(12.0, float(car.get("speed_kmh", 120.0)) / 3.6)
		var base_turn_in_lead_m: float = clampf(20.0 + spd_mps * 0.34 - late_apex_bias, 18.0, 52.0)
		var turn_in_start_apex_dist: float = maxf(base_turn_in_lead_m, maxf(0.0, d_apex - d_in) + 6.0)

		if d_apex > turn_in_start_apex_dist:
			var approach_blend: float = 1.0 - _smoothstepf(55.0, 145.0, d_in)
			racing_line_lat = lerpf(racing_line_lat, outside_entry_lat, approach_blend)
		elif d_apex >= 0.0:
			var u_turn_in: float = _quintic01((turn_in_start_apex_dist - d_apex) / maxf(8.0, turn_in_start_apex_dist))
			racing_line_lat = lerpf(outside_entry_lat, inside_apex_lat, u_turn_in)
		else:
			var exit_span_m: float = maxf(16.0, d_out - d_apex + 20.0)
			var u_exit: float = _quintic01(-d_apex / exit_span_m)
			var target_exit_lat: float = outside_exit_lat
			if zones.size() >= 2 and int(zones[1]["sign"]) != int(upcoming_zone["sign"]) and (float(zones[1]["d_in"]) - d_out) < 38.0:
				target_exit_lat = -float(zones[1]["sign"]) * (max_outside_width * 0.82)
			racing_line_lat = lerpf(inside_apex_lat, target_exit_lat, u_exit)

	return {
		"zones": zones,
		"racing_line_lat": racing_line_lat,
		"upcoming_zone": upcoming_zone,
		"is_chicane_flip": is_chicane_flip
	}


# ============================================================================
# 25HZ CONTINUOUS SUB-RAY SPATIAL PLANNER, RACECRAFT & CORNER-PHYSICS SOLVER
# ============================================================================
func _run_continuous_spatial_and_corner_planner(
	car: Dictionary,
	all_cars: Array,
	player_car: Dictionary,
	is_classic: bool,
	is_qualifying: bool,
	total_laps: int,
	ctx: Dictionary
) -> void:
	var m_per_game_m: float = maxf(
		0.5,
		float(ctx.get("real_meters_per_game_meter", MotorsportTelemetryData.DEFAULT_REAL_M_PER_GAME_M))
	)
	var s: float = float(car.get("s", 0.0))
	var road_half: float = MotorsportTelemetryData.ROAD_HALF_WIDTH
	var car_w: float = MotorsportTelemetryData.CAR_WIDTH
	var planner_dt: float = 0.04

	# 0. Pit-Lane Internal Speed & Merge Execution
	if bool(car.get("in_pit_lane", false)):
		var phase: String = String(car.get("pit_phase", "ENTRY"))
		_ai_corner_constrained = true
		if phase == "ENTRY":
			var dist_box_m: float = _signed_delta_game_m(assigned_pit_box_s, s) * m_per_game_m
			if dist_box_m <= 2.0:
				_ai_target_speed_kmh = 0.0
			elif dist_box_m < 28.0:
				_ai_target_speed_kmh = clampf(14.0 + dist_box_m * 2.2, 14.0, 78.5)
			else:
				_ai_target_speed_kmh = 78.5
		else:
			if s >= 68.0 and s <= 115.0:
				_ai_target_speed_kmh = 340.0
				_ai_corner_constrained = false
				_commit_quintic_lateral_goal(float(car.get("lateral_offset", 0.0)), road_half * 0.58, 0.90)
			else:
				_ai_target_speed_kmh = 78.5
		_ai_brake_aggression = 1.05
		return

	var cur_k_real: float = _sample_real_curvature(ctx, s)
	var look_k20: float = _sample_real_curvature(ctx, s + 20.0 / m_per_game_m)
	var prelim_chicane: bool = (cur_k_real * look_k20 < -0.000004) or (absf(cur_k_real) > 0.0035 and absf(look_k20) > 0.0035)
	var my_lat: float = float(car.get("lateral_offset", 0.0))
	var my_spd: float = maxf(0.0, float(car.get("speed_kmh", 0.0)))
	var ref_mps: float = maxf(20.0, my_spd / 3.6)

	# 1. Sidepod Overlap Corridors (>= 1.28x Car Width FIA Racing Room)
	var blocked_left_max: float = -road_half + 1.08
	var blocked_right_min: float = (road_half - 1.42) if (s >= 946.0 or s <= 78.0) else (road_half - 1.08)
	var side_by_side_in_chicane: bool = false

	for other in all_cars:
		if other == car or bool(other.get("exploded", false)) or bool(other.get("in_pit_lane", false)):
			continue
		var ds_real: float = absf(_signed_delta_game_m(float(other.get("s", 0.0)), s)) * m_per_game_m
		var is_plr: bool = bool(other.get("is_player", false))
		var win_m: float = (6.6 if is_plr else 5.8) + (1.8 if prelim_chicane else 0.0)
		if ds_real < win_m:
			if prelim_chicane:
				side_by_side_in_chicane = true
			var corr: float = car_w * (1.32 if is_plr else (1.30 if prelim_chicane else 1.28))
			var o_lat: float = float(other.get("lateral_offset", 0.0))
			if o_lat <= my_lat:
				blocked_left_max = maxf(blocked_left_max, o_lat + corr)
			else:
				blocked_right_min = minf(blocked_right_min, o_lat - corr)

	# 2. Scan 180m Real-Curvature Corner Zones & Outside -> Apex -> Outside Line
	var corner_scan: Dictionary = _scan_forward_corners_and_line(car, s, m_per_game_m, side_by_side_in_chicane, ctx)
	var zones: Array = corner_scan["zones"]
	var upcoming_zone: Dictionary = corner_scan["upcoming_zone"]
	var is_chicane_flip: bool = bool(corner_scan["is_chicane_flip"])
	var preferred_lat: float = float(corner_scan["racing_line_lat"])
	var goal_horizon_sec: float = 0.82

	var upcoming_corner_sign: int = int(upcoming_zone["sign"]) if not upcoming_zone.is_empty() else 0
	var upcoming_corner_dist_m: float = maxf(0.0, float(upcoming_zone["d_in"])) if not upcoming_zone.is_empty() else 999.0
	var appr_heavy_braking: bool = (
		not upcoming_zone.is_empty()
		and float(upcoming_zone["d_in"]) <= 155.0
		and float(upcoming_zone["d_apex"]) > 4.0
		and (float(upcoming_zone["delta_theta_full"]) > 0.62 or float(upcoming_zone["k_peak"]) > 0.0085)
	)

	# 3. Multi-Car Slipstream Wake Telemetry & Dynamic 2-Stop vs 1-Stop Pit Strategy
	var nearest_ahead: Dictionary = {}
	var nearest_ahead_m: float = 999.0
	var wake_count: int = 0

	for other in all_cars:
		if other == car or bool(other.get("exploded", false)) or bool(other.get("in_pit_lane", false)):
			continue
		var ahead_m: float = _forward_dist_game_m(s, float(other.get("s", 0.0))) * m_per_game_m
		if ahead_m > 1.4 and ahead_m < 56.0:
			if absf(float(other.get("lateral_offset", 0.0)) - my_lat) < car_w * 1.65:
				wake_count += 1
			if ahead_m < nearest_ahead_m:
				nearest_ahead_m = ahead_m
				nearest_ahead = other

	_ai_closest_ahead_gap_sec = (nearest_ahead_m / ref_mps) if nearest_ahead_m < 500.0 else 99.0
	ai_draft_train_count = wake_count
	ai_in_draft_train = wake_count >= 1 and nearest_ahead_m < 44.0

	if not nearest_ahead.is_empty() and nearest_ahead_m < 20.0 and my_spd >= float(nearest_ahead.get("speed_kmh", 0.0)) - 4.5:
		ai_dirty_air_stuck_timer += planner_dt
		ai_clean_air_timer = 0.0
	elif nearest_ahead_m > 46.0:
		ai_clean_air_timer += planner_dt
		ai_dirty_air_stuck_timer = maxf(0.0, ai_dirty_air_stuck_timer - planner_dt * 1.4)
	else:
		ai_dirty_air_stuck_timer = maxf(0.0, ai_dirty_air_stuck_timer - planner_dt * 0.5)

	var w_moist: float = float(ctx.get("groove_moisture", 0.0))
	var comp_now: String = String(car.get("compound", "MEDIUM"))
	var wet_cross_thresh: float = 0.25 if float(ai_personality.get("wet_weather_mastery", 1.0)) >= 1.04 else 0.28
	var on_dry_in_rain: bool = (comp_now != "INTERMEDIATE" and comp_now != "FULL_WET") and w_moist > wet_cross_thresh
	if not is_classic and not is_qualifying:
		if int(car.get("lap", 1)) >= total_laps and not bool(car.get("has_puncture", false)) and not on_dry_in_rain:
			ai_wants_to_pit = false
		else:
			_evaluate_pit_strategy(car, all_cars, total_laps, m_per_game_m, ctx)
	else:
		ai_wants_to_pit = false

	# 4. FIA 1-Move Straight Defense, Slipstream Tucks & Late-Apex Switchbacks
	var in_yellow: bool = bool(ctx.get("sector_yellow", false))
	var vsc_active: bool = bool(ctx.get("vsc_active", false))

	if ai_switchback_timer > 0.0 and ai_switchback_sign != 0 and not in_yellow and not vsc_active:
		preferred_lat = clampf(float(ai_switchback_sign) * 4.55, -road_half + 1.35, road_half - 1.35)
		goal_horizon_sec = 0.92

	var can_defend: bool = (
		not is_qualifying
		and not in_yellow
		and not vsc_active
		and absf(cur_k_real) < 0.0022
		and float(car.get("brake_input", 0.0)) < 0.08
		and upcoming_corner_dist_m <= 165.0
	)
	if can_defend and float(ai_personality.get("defensive_craft", 0.88)) >= 0.85:
		var max_def_gap_sec: float = 0.72 if archetype_id == "DEFENSIVE_WALL" else 0.50
		var def_range: float = maxf(float(archetype.get("defensive_range_m", 15.0)), ref_mps * max_def_gap_sec)

		var closest_threat: Dictionary = {}
		var closest_behind_m: float = def_range
		for other in all_cars:
			if other == car or bool(other.get("exploded", false)) or bool(other.get("in_pit_lane", false)):
				continue
			var behind_m: float = _signed_delta_game_m(s, float(other.get("s", 0.0))) * m_per_game_m
			if behind_m > MotorsportTelemetryData.CAR_LENGTH * 1.15 and behind_m <= def_range and float(other.get("speed_kmh", 0.0)) > my_spd - 8.0:
				var is_plr: bool = bool(other.get("is_player", false))
				if closest_threat.is_empty() or is_plr or behind_m < closest_behind_m:
					closest_threat = other
					closest_behind_m = behind_m
					if is_plr:
						break

		if not closest_threat.is_empty():
			var t_lat: float = float(closest_threat.get("lateral_offset", 0.0))
			if ai_defense_moves_used == 0:
				var inside_s: float = float(upcoming_corner_sign) if upcoming_corner_sign != 0 else (1.0 if t_lat >= 0.0 else -1.0)
				ai_defense_committed_side = int(inside_s)
				ai_defense_moves_used = 1
				ai_defense_lat = clampf(inside_s * 4.35 + (t_lat - inside_s * 4.35) * 0.22, -road_half + 1.65, road_half - 1.65)
			if ai_defense_lat < 900.0:
				var legal_def: float = ai_defense_lat
				if closest_behind_m < 15.0:
					var min_edge_buf: float = 1.15 + car_w * 1.30
					if t_lat < my_lat - car_w * 0.52:
						legal_def = maxf(legal_def, -road_half + min_edge_buf)
					elif t_lat > my_lat + car_w * 0.52:
						legal_def = minf(legal_def, road_half - min_edge_buf)
				preferred_lat = legal_def
				goal_horizon_sec = 1.18

	var on_fast_sec: bool = absf(cur_k_real) < 0.0025 and absf(look_k20) < 0.0032
	var active_slingshot: bool = false

	if not is_qualifying and not in_yellow and not vsc_active and not nearest_ahead.is_empty() and nearest_ahead_m < 50.0:
		var lead_spd: float = float(nearest_ahead.get("speed_kmh", 0.0))
		var lead_lat: float = float(nearest_ahead.get("lateral_offset", 0.0))
		var lead_s: float = float(nearest_ahead.get("s", 0.0))
		var closing_mps: float = maxf(0.0, (my_spd - lead_spd) / 3.6)
		var ttc_sec: float = (nearest_ahead_m / closing_mps) if closing_mps > 0.35 else 99.0
		var pullout_m: float = 25.0 if archetype_id == "LATE_BRAKER" else (23.0 if archetype_id == "ROOKIE_WILDCARD" else 20.5)

		var leader_already_2wide: bool = false
		for third in all_cars:
			if third == car or third == nearest_ahead or bool(third.get("exploded", false)) or bool(third.get("in_pit_lane", false)):
				continue
			var ahead_lead_m: float = _forward_dist_game_m(lead_s, float(third.get("s", 0.0))) * m_per_game_m
			if ahead_lead_m > -4.0 and ahead_lead_m < 14.0 and absf(lead_lat - float(third.get("lateral_offset", 0.0))) > car_w * 0.95:
				leader_already_2wide = true
				break

		var leader_tight_inside: bool = upcoming_corner_sign != 0 and (lead_lat * float(upcoming_corner_sign) > 3.10)
		var leader_wide_lockup: bool = upcoming_corner_sign != 0 and absf(cur_k_real) > 0.0045 and (lead_lat * float(upcoming_corner_sign) < 1.1)

		if leader_already_2wide and nearest_ahead_m > 11.0:
			preferred_lat = clampf(lead_lat, -road_half + 1.6, road_half - 1.6)
			goal_horizon_sec = 1.20
		elif on_fast_sec and nearest_ahead_m >= pullout_m and ttc_sec > 2.0 and not appr_heavy_braking and lead_spd > 145.0:
			var peep: float = 0.20 if (car_number % 2 == 0) else -0.20
			preferred_lat = clampf(lead_lat + peep, -road_half + 1.75, road_half - 1.75)
			goal_horizon_sec = 1.32
		elif appr_heavy_braking and upcoming_corner_sign != 0 and nearest_ahead_m < 24.0 and nearest_ahead_m > 6.5 and leader_tight_inside and float(ai_personality.get("switchback_skill", 0.85)) >= 0.82:
			preferred_lat = clampf(float(-upcoming_corner_sign) * 5.25, -road_half + 1.30, road_half - 1.30)
			ai_switchback_sign = upcoming_corner_sign
			ai_switchback_timer = 1.55
			goal_horizon_sec = 1.05
		elif absf(cur_k_real) > 0.0045 and upcoming_corner_sign != 0 and nearest_ahead_m < 20.0 and leader_wide_lockup:
			active_slingshot = true
			ai_pass_side = upcoming_corner_sign
			ai_pass_lock_timer = 1.45
			preferred_lat = clampf(float(upcoming_corner_sign) * 4.65, -road_half + 1.25, road_half - 1.25)
			goal_horizon_sec = 0.95
		elif nearest_ahead_m < 34.0 and (nearest_ahead_m < pullout_m or ttc_sec <= 2.4 or (appr_heavy_braking and nearest_ahead_m < 28.0 and closing_mps > -1.2)):
			active_slingshot = true
			if ai_pass_lock_timer <= 0.0:
				ai_pass_side = _choose_best_overtake_side(car, nearest_ahead, all_cars, upcoming_corner_sign, m_per_game_m)
				ai_pass_lock_timer = 1.65
			var room_chosen: float = (lead_lat - (-road_half + 1.32)) if ai_pass_side < 0 else ((road_half - 1.32) - lead_lat)
			if room_chosen < car_w * 1.32:
				ai_pass_side = -ai_pass_side
				ai_pass_lock_timer = 1.45
			var spacing: float = car_w * (1.54 if bool(nearest_ahead.get("is_player", false)) else 1.46)
			preferred_lat = clampf(lead_lat + float(ai_pass_side) * spacing, -road_half + 1.25, road_half - 1.25)
			goal_horizon_sec = 1.15

	# Lap-start 2x2 grid discipline for the first 30 game-meters
	if not is_qualifying and int(car.get("lap", 1)) == 1 and float(car.get("total_distance_game_m", 99.0)) < 30.0:
		preferred_lat = maxf(2.2, preferred_lat) if my_lat >= 0.0 else minf(-2.2, preferred_lat)
		goal_horizon_sec = 0.95

	# 5. Continuous 13-Ray Quadratic Cost + 3D RayCast3D Fusion + Parabolic Sub-Ray Interpolation
	var num_rays: int = FORWARD_RAY_LANES.size()
	var ray_costs: PackedFloat64Array = PackedFloat64Array()
	ray_costs.resize(num_rays)
	var ray_valid: PackedByteArray = PackedByteArray()
	ray_valid.resize(num_rays)

	var best_idx: int = -1
	var min_cost: float = 1.0e12

	for r_idx in range(num_rays):
		var lane_lat: float = FORWARD_RAY_LANES[r_idx]
		if blocked_left_max <= blocked_right_min and (lane_lat < blocked_left_max - 0.55 or lane_lat > blocked_right_min + 0.55):
			ray_costs[r_idx] = 1.0e9
			ray_valid[r_idx] = 0
			continue
		ray_valid[r_idx] = 1

		var d_pref: float = lane_lat - preferred_lat
		var d_cur: float = lane_lat - my_lat
		var smooth_w: float = 0.22 if active_slingshot else 0.38
		var cost: float = d_pref * d_pref * 1.15 + d_cur * d_cur * smooth_w

		if blocked_left_max <= blocked_right_min:
			if lane_lat < blocked_left_max:
				var pen_l: float = blocked_left_max - lane_lat
				cost += 95.0 * pen_l * pen_l + 18.0 * pen_l
			elif lane_lat > blocked_right_min:
				var pen_r: float = lane_lat - blocked_right_min
				cost += 95.0 * pen_r * pen_r + 18.0 * pen_r

		if absf(lane_lat) > 6.5:
			var edge_ex: float = absf(lane_lat) - 6.5
			cost += edge_ex * edge_ex * 2.8

		if r_idx < forward_raycasts.size() and forward_raycasts[r_idx] != null and forward_raycasts[r_idx].is_colliding():
			var hit_pt: Vector3 = forward_raycasts[r_idx].get_collision_point()
			var hit_dist: float = global_position.distance_to(hit_pt)
			if hit_dist < 72.0:
				var ray_prox: float = (74.0 - hit_dist) / 74.0
				cost += ray_prox * ray_prox * 88.0

		for other in all_cars:
			if other == car or bool(other.get("in_pit_lane", false)):
				continue
			var ahead_m: float = _forward_dist_game_m(s, float(other.get("s", 0.0))) * m_per_game_m
			if ahead_m > 0.0 and ahead_m <= 165.0:
				var safe_sigma: float = car_w * (0.92 if bool(other.get("is_player", false)) else 0.86)
				var lat_sep: float = lane_lat - float(other.get("lateral_offset", 0.0))
				if absf(lat_sep) < safe_sigma * 2.35:
					var closing_kmh: float = my_spd - float(other.get("speed_kmh", 0.0))
					var o_exploded: bool = bool(other.get("exploded", false))
					if o_exploded or float(other.get("speed_kmh", 0.0)) < 75.0 or closing_kmh > -5.5 or ahead_m < 22.0:
						var urgency: float = (168.0 - ahead_m) / 165.0
						var gauss: float = exp(-(lat_sep * lat_sep) / (2.0 * safe_sigma * safe_sigma))
						var base_pen: float = 280.0 if o_exploded else (165.0 if ahead_m < 18.0 else 112.0)
						cost += urgency * urgency * base_pen * gauss

		if not in_yellow and not vsc_active and active_slingshot and appr_heavy_braking and upcoming_corner_sign != 0 and (archetype_id == "LATE_BRAKER" or archetype_id == "ROOKIE_WILDCARD"):
			var lunge_bias: float = 0.42 if archetype_id == "LATE_BRAKER" else 0.28
			cost -= lane_lat * float(upcoming_corner_sign) * lunge_bias

		ray_costs[r_idx] = cost
		if cost < min_cost:
			min_cost = cost
			best_idx = r_idx

	var continuous_goal_lat: float = clampf(preferred_lat, -road_half + 1.08, road_half - 1.08)
	if best_idx >= 0:
		continuous_goal_lat = FORWARD_RAY_LANES[best_idx]
		# Exact 3-point parabolic sub-ray interpolation (#108 Section 3.2)
		if best_idx > 0 and best_idx < num_rays - 1 and ray_valid[best_idx - 1] == 1 and ray_valid[best_idx + 1] == 1:
			var c_left: float = ray_costs[best_idx - 1]
			var c_mid: float = ray_costs[best_idx]
			var c_right: float = ray_costs[best_idx + 1]
			var denom: float = c_left - 2.0 * c_mid + c_right
			if denom > 0.00001:
				var sub_offset: float = clampf(
					0.5 * RAY_LANE_STEP_M * ((c_left - c_right) / (denom + 0.000001)),
					-0.60,
					0.60
				)
				continuous_goal_lat = FORWARD_RAY_LANES[best_idx] + sub_offset
	else:
		continuous_goal_lat = (blocked_left_max + blocked_right_min) * 0.5

	if blocked_left_max <= blocked_right_min:
		continuous_goal_lat = clampf(continuous_goal_lat, blocked_left_max, blocked_right_min)
	continuous_goal_lat = clampf(continuous_goal_lat, -road_half + 1.05, road_half - 1.05)

	_commit_quintic_lateral_goal(my_lat, continuous_goal_lat, goal_horizon_sec)

	# 6. Real-Curvature (180m, DeltaTheta, R_eff) Aero Corner & Braking Solver
	var sector_idx: int = int(floor(s / 100.0)) % 10
	var cur_lap_i: int = int(car.get("lap", 1))
	var jitter_key: int = cur_lap_i * 16 + sector_idx
	if ai_last_jitter_key != jitter_key:
		ai_last_jitter_key = jitter_key
		ai_lap_brake_jitter = sin(float(cur_lap_i) * 7.13 + float(sector_idx) * 2.71 + float(car_number) * 1.93) * 0.45

	var eff_grip: float = _estimate_effective_grip(car, is_classic, ctx)
	_ai_cached_eff_grip = eff_grip

	var p_mods_dict: Dictionary = car.get("perf_mods", {}) as Dictionary
	var mod_top_kmh: float = 0.0 if is_classic else clampf(float(p_mods_dict.get("top_speed_bonus_kmh", 0.0)), -15.0, 28.0)
	var mod_drs_kmh: float = 0.0 if is_classic else clampf(float(p_mods_dict.get("drs_bonus_kmh", 0.0)), 0.0, 12.0)
	var mod_aero_grip: float = 1.0 if is_classic else clampf(float(p_mods_dict.get("aero_grip_mult", 1.0)), 0.82, 1.25)
	var mod_brake: float = 1.0 if is_classic else clampf(float(p_mods_dict.get("brake_mult", 1.0)), 0.82, 1.25)

	var fuel_kg: float = (
		clampf(float(car["fuel_kg"]), 0.0, 110.0)
		if car.has("fuel_kg")
		else clampf(float(car.get("fuel_laps", 5.0)) * 6.0, 0.0, 100.0)
	)
	var mass_kg: float = 798.0 + fuel_kg
	var load_sens_mult: float = 0.89 * clampf(pow(810.0 / mass_kg, 0.08), 0.88, 1.04)

	var fw_dmg: float = clampf(float(car.get("front_wing_damage", 0.0)), 0.0, 1.0)
	var rw_dmg: float = clampf(float(car.get("rear_wing_damage", 0.0)), 0.0, 1.0)
	var susp_dmg: float = clampf(float(car.get("suspension_damage", 0.0)), 0.0, 1.0)
	var aero_dmg_eff: float = maxf(0.48, (1.0 - 0.48 * fw_dmg * 0.445 - 0.52 * rw_dmg * 0.555) * (1.0 - 0.24 * susp_dmg))

	var mu_lat_phys: float = 1.54 * eff_grip * mod_aero_grip * load_sens_mult
	var mu_long_phys: float = 1.54 * 0.96 * eff_grip * mod_brake * load_sens_mult
	var k_downforce: float = (3.25 * aero_dmg_eff) if is_classic else (3.75 * mod_aero_grip * aero_dmg_eff)
	var k_drag: float = 0.96 * (1.0 + 0.095 * fw_dmg + 0.16 * rw_dmg)
	var g: float = 9.81

	var straight_ceiling_kmh: float = 310.0 if is_classic else (336.0 + mod_top_kmh + mod_drs_kmh)
	var aero_top_mps: float = straight_ceiling_kmh / 3.6

	var pressure_creep_m: float = (ai_pressure_meter - 0.48) * 5.2 if ai_pressure_meter > 0.48 else 0.0
	_ai_brake_aggression = float(ai_personality.get("braking_aggression", 1.0))

	var decel_agg_mult: float = (
		1.04 if archetype_id == "LATE_BRAKER"
		else (0.94 if archetype_id == "TIRE_WHISPERER" else (1.02 if archetype_id == "ROOKIE_WILDCARD" else 0.99))
	)
	var brake_lead_margin_m: float = clampf(
		6.5 - (float(archetype.get("brake_offset_m", 0.0)) * 0.38 + pressure_creep_m) + ai_lap_brake_jitter,
		-1.5,
		13.5
	)

	var arch_corner_skill: float = 1.0
	if archetype_id == "APEX_TACTICIAN":
		arch_corner_skill = 1.012
	elif archetype_id == "TIRE_WHISPERER" or archetype_id == "RAIN_MASTER":
		arch_corner_skill = 1.008
	elif archetype_id == "LATE_BRAKER" or archetype_id == "SLIPSTREAM_HUNTER":
		arch_corner_skill = 1.002

	var out_lap_bonus: float = 0.011 if ai_out_lap_push_timer > 0.0 else 0.0
	var overcut_bonus: float = 0.009 if (ai_overcut_active and float(car.get("fuel_laps", 5.0)) < 3.0) else 0.0
	var sprint_bonus: float = 0.004 if (ai_strategy_type == "TWO_STOP_SPRINT" and comp_now == "SOFT") else 0.0
	var arch_base: float = maxf(0.994, float(archetype.get("base_pace", 0.998)) + 0.004)
	var pace_mult: float = clampf(arch_base + ai_skill_tier_offset + out_lap_bonus + overcut_bonus + sprint_bonus, 0.975, 1.030)

	var min_allowed_mps: float = aero_top_mps
	var corner_constrained: bool = false
	var hard_braking_zone: bool = false
	var active_zone_found: bool = false
	var active_zone_target_s: float = s
	var active_zone_vmax_mps: float = aero_top_mps
	var active_zone_decel_mps2: float = 26.0

	for z_var in zones:
		var z: Dictionary = z_var as Dictionary
		var d_out: float = float(z["d_out"])
		if d_out <= 0.5:
			continue

		var d_theta_eff: float = float(z["delta_theta_full"])
		var k_eff: float = float(z["k_peak"])
		var d_apex: float = float(z["d_apex"])
		var d_in: float = float(z["d_in"])
		var z_sign_f: float = float(z["sign"])

		if d_apex < -2.0:
			var k_now: float = maxf(absf(cur_k_real), absf(_sample_real_curvature(ctx, s + 7.0 / m_per_game_m)))
			var k_ratio: float = clampf(k_now / maxf(0.0001, float(z["k_peak"])), 0.0, 1.0)
			k_eff = k_now
			d_theta_eff = maxf(float(z["delta_theta_ahead"]), float(z["delta_theta_full"]) * k_ratio)

		if k_eff < CORNER_MIN_K_REAL or d_theta_eff < 0.05:
			continue

		var r_center: float = 1.0 / k_eff
		var dist_in_pos: float = maxf(0.0, d_in)
		var inside_entry_compromise: float = (
			maxf(0.0, z_sign_f * my_lat) * (1.0 - clampf((d_in - 6.0) / 38.0, 0.0, 1.0))
			if d_in > 6.0
			else 0.0
		)
		var w_eff: float = clampf(5.6 - 0.38 * inside_entry_compromise, 2.6, 5.8)
		if side_by_side_in_chicane and dist_in_pos < 35.0:
			w_eff = minf(w_eff, 3.1)

		var half_deflect: float = minf(PI * 0.5, d_theta_eff * 0.5)
		var sagitta_denom: float = maxf(0.004, 1.0 - cos(half_deflect))
		var yaw_damp_front_factor: float = 0.85 + 0.12 * _smoothstepf(28.0, 92.0, r_center)
		var mu_corner_eff: float = mu_lat_phys * yaw_damp_front_factor
		var w_eff_tight_scale: float = _smoothstepf(20.0, 54.0, r_center)
		var delta_r: float = minf(34.0, (w_eff * (0.64 + 0.36 * w_eff_tight_scale)) / sagitta_denom)
		var r_eff: float = r_center + delta_r

		var aero_denom: float = maxf(0.285, 1.0 - mu_corner_eff * (k_downforce / mass_kg) * r_eff)
		var v_max_zone_mps: float = minf(aero_top_mps, sqrt((mu_corner_eff * g * r_eff) / aero_denom))
		v_max_zone_mps *= arch_corner_skill
		if is_chicane_flip and dist_in_pos < 45.0 and float(z["k_peak"]) > 0.006:
			v_max_zone_mps *= (0.91 if side_by_side_in_chicane else 0.95)
		v_max_zone_mps = maxf(56.0 / 3.6, v_max_zone_mps)

		if v_max_zone_mps >= aero_top_mps - 0.8:
			continue

		var turn_lead_frac: float = 0.04 if float(z["delta_theta_full"]) > 0.55 else 0.16
		var d_brake_target: float = (
			(d_in + turn_lead_frac * maxf(0.0, d_apex - d_in))
			if d_in > 2.0
			else 0.0
		)
		if d_brake_target <= 2.0:
			if v_max_zone_mps < min_allowed_mps:
				min_allowed_mps = v_max_zone_mps
				corner_constrained = true
				active_zone_found = false
				if v_max_zone_mps * 3.6 < 225.0 and d_apex > -2.0:
					hard_braking_zone = true
		else:
			var v_cur_mps: float = maxf(v_max_zone_mps, my_spd / 3.6)
			var v_rms2: float = 0.5 * (v_cur_mps * v_cur_mps + v_max_zone_mps * v_max_zone_mps)
			var a_brake_eff: float = (
				mu_long_phys * (g + (k_downforce * v_rms2) / mass_kg) +
				(k_drag * v_rms2) / mass_kg
			) * 0.74 * decel_agg_mult
			var d_eff: float = maxf(0.0, d_brake_target - brake_lead_margin_m)
			var allow_mps: float = sqrt(v_max_zone_mps * v_max_zone_mps + 2.0 * a_brake_eff * d_eff)
			if allow_mps < min_allowed_mps:
				min_allowed_mps = allow_mps
				if allow_mps < aero_top_mps - 1.2:
					corner_constrained = true
					if v_max_zone_mps * 3.6 < 225.0:
						hard_braking_zone = true
					active_zone_found = true
					active_zone_target_s = fposmod(s + d_eff / m_per_game_m, MotorsportTelemetryData.TRACK_GAME_LENGTH)
					active_zone_vmax_mps = v_max_zone_mps * pace_mult
					active_zone_decel_mps2 = a_brake_eff

	_ai_hard_braking_zone = hard_braking_zone
	_ai_zone_active = active_zone_found
	_ai_zone_target_s = active_zone_target_s
	_ai_zone_vmax_mps = active_zone_vmax_mps
	_ai_zone_decel_mps2 = active_zone_decel_mps2

	var target_kmh: float = (
		minf(straight_ceiling_kmh, (min_allowed_mps * 3.6) * pace_mult)
		if corner_constrained
		else straight_ceiling_kmh
	)

	# 7. Pit-Entry Braking Ramp (Zero 80 km/h Speeding Penalties)
	if not is_classic and ai_wants_to_pit and s >= 848.0:
		var dist_lim_m: float = maxf(0.0, (942.0 - s) * m_per_game_m)
		var lim_mps: float = 77.5 / 3.6
		var pit_decel: float = maxf(11.5, mu_long_phys * g * 0.85)
		var pit_allow: float = sqrt(lim_mps * lim_mps + 2.0 * pit_decel * maxf(0.0, dist_lim_m - 6.0)) * 3.6
		if pit_allow < target_kmh:
			target_kmh = pit_allow
			corner_constrained = true

	# 8. Anti-Rear-End Gap Control, Local Yellow Flags & VSC Speed Caps
	var direct_ahead: Dictionary = {}
	var direct_ahead_dist_m: float = 999.0
	for other in all_cars:
		if other == car or bool(other.get("in_pit_lane", false)):
			continue
		var ahead_m: float = _forward_dist_game_m(s, float(other.get("s", 0.0))) * m_per_game_m
		if ahead_m <= 0.5 or ahead_m > 42.0:
			continue
		var o_lat: float = float(other.get("lateral_offset", 0.0))
		var in_cur_path: bool = absf(my_lat - o_lat) < car_w * 1.06
		var in_tgt_path: bool = absf(continuous_goal_lat - o_lat) < car_w * 1.06
		if (in_cur_path and ahead_m < 21.0) or (in_cur_path and in_tgt_path and ahead_m < 35.0):
			if ahead_m < direct_ahead_dist_m:
				direct_ahead_dist_m = ahead_m
				direct_ahead = other

	if not direct_ahead.is_empty() and not bool(direct_ahead.get("exploded", false)):
		var d_lat: float = float(direct_ahead.get("lateral_offset", 0.0))
		if absf(my_lat - d_lat) < car_w * 1.05:
			var is_plr_ahead: bool = bool(direct_ahead.get("is_player", false))
			var plr_braking: bool = is_plr_ahead and float(direct_ahead.get("brake_input", 0.0)) > 0.15
			var follow_gap_m: float = (11.2 if plr_braking else 8.8) if is_plr_ahead else 7.2
			var d_spd: float = float(direct_ahead.get("speed_kmh", 0.0))
			var safe_follow_kmh: float = target_kmh
			if direct_ahead_dist_m < follow_gap_m:
				safe_follow_kmh = d_spd - (12.0 if plr_braking else 6.5)
			else:
				var follow_decel: float = 14.0 if is_plr_ahead else 16.5
				var rel_allow_mps: float = sqrt(2.0 * follow_decel * maxf(0.0, direct_ahead_dist_m - follow_gap_m))
				safe_follow_kmh = d_spd + rel_allow_mps * 3.6
			if safe_follow_kmh < target_kmh:
				target_kmh = safe_follow_kmh
				corner_constrained = true

	if blocked_left_max > blocked_right_min:
		target_kmh = minf(target_kmh, my_spd - 9.0)
		corner_constrained = true

	if in_yellow:
		target_kmh = minf(target_kmh * 0.80, 218.0)
		corner_constrained = true
	if vsc_active:
		target_kmh = minf(target_kmh, 156.5)
		corner_constrained = true
	if ai_mistake_timer > 0.0:
		target_kmh *= 0.91
		corner_constrained = true

	_ai_corner_constrained = corner_constrained
	_ai_target_speed_kmh = maxf(62.0, target_kmh)


func _commit_quintic_lateral_goal(cur_lat: float, goal_lat: float, base_horizon_sec: float = 0.95) -> void:
	if absf(goal_lat - _ai_quintic_p1) <= 0.065:
		_ai_quintic_p1 = lerpf(_ai_quintic_p1, goal_lat, 0.55)
		return

	var live: Vector3 = _eval_quintic_lateral_spline(
		_ai_quintic_p0 if _ai_has_prev_lat else cur_lat,
		_ai_quintic_v0,
		_ai_quintic_a0,
		_ai_quintic_p1 if _ai_has_prev_lat else cur_lat,
		_ai_quintic_elapsed,
		_ai_quintic_duration
	)
	var delta_lat: float = absf(goal_lat - live.x)
	_ai_quintic_p0 = live.x
	_ai_quintic_v0 = clampf(live.y, -9.5, 9.5)
	_ai_quintic_a0 = clampf(live.z, -16.0, 16.0)
	_ai_quintic_p1 = goal_lat
	_ai_quintic_elapsed = 0.0
	_ai_quintic_duration = clampf(base_horizon_sec * 0.44 + delta_lat * 0.065, 0.26, 1.05)


func _choose_best_overtake_side(
	car: Dictionary,
	leader: Dictionary,
	all_cars: Array,
	upcoming_corner_sign: int,
	m_per_game_m: float
) -> int:
	var road_half: float = MotorsportTelemetryData.ROAD_HALF_WIDTH
	var car_w: float = MotorsportTelemetryData.CAR_WIDTH
	var spacing: float = car_w * 1.50
	var lead_lat: float = float(leader.get("lateral_offset", 0.0))
	var left_cand: float = lead_lat - spacing
	var right_cand: float = lead_lat + spacing

	var left_ok: bool = left_cand >= -road_half + 1.25
	var right_ok: bool = right_cand <= road_half - 1.25
	if left_ok and not right_ok:
		return -1
	if right_ok and not left_ok:
		return 1

	var my_lat: float = float(car.get("lateral_offset", 0.0))
	var s: float = float(car.get("s", 0.0))
	var left_score: float = -absf(my_lat - left_cand) * 0.55
	var right_score: float = -absf(my_lat - right_cand) * 0.55

	if upcoming_corner_sign != 0:
		var bonus: float = 4.6 if archetype_id == "LATE_BRAKER" else (3.4 if archetype_id == "ROOKIE_WILDCARD" else 2.1)
		if upcoming_corner_sign < 0:
			left_score += bonus
		else:
			right_score += bonus

	for other in all_cars:
		if other == car or other == leader or bool(other.get("in_pit_lane", false)):
			continue
		var ahead_m: float = _forward_dist_game_m(s, float(other.get("s", 0.0))) * m_per_game_m
		if ahead_m >= -3.0 and ahead_m <= 58.0:
			var o_lat: float = float(other.get("lateral_offset", 0.0))
			if absf(o_lat - left_cand) < car_w * 1.25:
				left_score -= 9.5
			if absf(o_lat - right_cand) < car_w * 1.25:
				right_score -= 9.5

	return 1 if right_score > left_score else -1


func _estimate_effective_grip(car: Dictionary, is_classic: bool, ctx: Dictionary) -> float:
	if is_classic and String(ctx.get("arcade_rules_preset", "")) == "CLASSIC_COINOP":
		return 1.06
	var comp_id: String = String(car.get("compound", "MEDIUM"))
	var w: float = clampf(float(ctx.get("groove_moisture", 0.0)), 0.0, 1.0)
	var min_life: float = float(car.get("min_tire_life", 1.0))
	var avg_life: float = float(car.get("avg_tire_life", min_life))
	var eff_life: float = avg_life * 0.65 + min_life * 0.35
	var temp_c: float = float(car.get("avg_tire_temp_c", 92.0))
	var punc: bool = bool(car.get("has_puncture", false))

	var tire_mu: float = MotorsportTelemetryData.evaluate_tire_grip_multiplier(comp_id, eff_life, temp_c, w, punc)
	var wet_mastery: float = float(ai_personality.get("wet_weather_mastery", 1.0))
	if w > 0.08:
		tire_mu *= 1.0 + (wet_mastery - 1.0) * 0.22 * w

	var flat_spot_mult: float = clampf(1.0 - 0.10 * float(car.get("max_flat_spot", 0.0)), 0.86, 1.0)
	var mech_dmg_mult: float = (
		1.0
		- float(car.get("front_wing_damage", 0.0)) * 0.18
		- float(car.get("rear_wing_damage", 0.0)) * 0.12
		- float(car.get("suspension_damage", 0.0)) * 0.16
	)
	return clampf(tire_mu * flat_spot_mult * mech_dmg_mult, 0.32, 1.22)


func _is_projected_pit_rejoin_clean(car: Dictionary, all_cars: Array, m_per_game_m: float) -> bool:
	var rejoin_s: float = float(car.get("s", 0.0)) - 195.0
	if rejoin_s < 0.0:
		rejoin_s += MotorsportTelemetryData.TRACK_GAME_LENGTH
	for other in all_cars:
		if other == car or bool(other.get("exploded", false)) or bool(other.get("in_pit_lane", false)):
			continue
		var sep_m: float = absf(_signed_delta_game_m(float(other.get("s", 0.0)), rejoin_s)) * m_per_game_m
		if sep_m < 24.0:
			return false
	return true


# ============================================================================
# DYNAMIC RACE STRATEGY ENGINE:
# - 2-Stop Aggressive Soft-Tire Sprinters vs 1-Stop Medium/Hard Whisperers
# - Stint-Matched Numeric Fuel Loads (ZERO dead-weight 'FILL' on final laps!)
# - Smart Clean-Air Undercut / Lightweight Overcut & Immediate Wet Crossover
# ============================================================================
func _evaluate_pit_strategy(
	car: Dictionary,
	all_cars: Array,
	total_laps: int,
	m_per_game_m: float,
	ctx: Dictionary
) -> void:
	if ai_wants_to_pit:
		return

	var min_life: float = float(car.get("min_tire_life", 1.0))
	var w: float = float(ctx.get("groove_moisture", 0.0))
	var comp_id: String = String(car.get("compound", "MEDIUM"))
	var is_wet: bool = comp_id == "INTERMEDIATE" or comp_id == "FULL_WET"
	var cur_lap: int = int(car.get("lap", 1))
	var laps_left: int = maxi(1, total_laps - cur_lap)
	var is_two_stop_sprinter: bool = ai_strategy_type == "TWO_STOP_SPRINT"

	var wet_mastery: float = float(ai_personality.get("wet_weather_mastery", 1.0))
	var wet_entry_thresh: float = 0.25 if wet_mastery >= 1.04 else 0.28
	var slick_dry_thresh: float = 0.10 if wet_mastery >= 1.04 else 0.08
	var wet_crossover: bool = (not is_wet and w > wet_entry_thresh)
	var monsoon_esc: bool = (comp_id == "INTERMEDIATE" and w > 0.64)
	var dry_crossover: bool = (is_wet and w < slick_dry_thresh)
	var wrong_weather_tire: bool = wet_crossover or monsoon_esc or dry_crossover

	var severe_flat_spot: bool = laps_left >= 3 and float(car.get("max_flat_spot", 0.0)) > 0.68 and min_life < 0.52

	var has_punc: bool = bool(car.get("has_puncture", false))
	var needs_dmg: bool = (
		has_punc
		or float(car.get("front_wing_damage", 0.0)) > 0.52
		or float(car.get("rear_wing_damage", 0.0)) > 0.52
		or float(car.get("suspension_damage", 0.0)) > 0.54
	)

	if _ai_last_pit_lap == cur_lap and not has_punc and not wrong_weather_tire:
		return

	var wear_fuel_mult: float = clampf(float(ctx.get("wear_fuel_mult", 1.0)), 0.5, 2.5)
	var burn_per_lap: float = 1.04 * wear_fuel_mult
	var fuel_laps: float = float(car.get("fuel_laps", 5.0))
	var needs_fuel: bool = fuel_laps < minf(burn_per_lap * 1.22, (float(laps_left) + 0.25) * burn_per_lap)

	var planned_total_stops: int = (
		(3 if total_laps >= 18 else (2 if total_laps >= 8 else 1))
		if is_two_stop_sprinter
		else (2 if total_laps >= 20 else 1)
	)
	var stops_done: int = int(car.get("pit_stops_completed", _pit_stops_completed))

	var undercut_early: int = int(archetype.get("undercut_laps_early", 0))
	var cliff_threshold: float = (
		clampf(0.35 + float(undercut_early) * 0.03, 0.30, 0.40)
		if is_two_stop_sprinter
		else clampf(0.25 + float(undercut_early) * 0.025, 0.21, 0.29)
	)
	if bool(ctx.get("vsc_active", false)) and laps_left >= 2 and stops_done < planned_total_stops + 1:
		cliff_threshold = maxf(cliff_threshold, 0.58)

	var trigger_undercut: bool = false
	var undercut_life_gate: float = 0.48 if is_two_stop_sprinter else 0.42
	if (
		not wrong_weather_tire
		and laps_left >= 2
		and min_life < undercut_life_gate
		and ai_dirty_air_stuck_timer > 3.6
		and (is_two_stop_sprinter or archetype_id == "APEX_TACTICIAN" or archetype_id == "LATE_BRAKER")
	):
		if _is_projected_pit_rejoin_clean(car, all_cars, m_per_game_m):
			trigger_undercut = true

	if (
		not wrong_weather_tire
		and not needs_fuel
		and not needs_dmg
		and not is_two_stop_sprinter
		and ai_clean_air_timer > 4.5
		and fuel_laps < 3.4 * wear_fuel_mult
		and min_life >= 0.205
	):
		ai_overcut_active = true
		cliff_threshold = minf(cliff_threshold, 0.21)
	else:
		ai_overcut_active = false

	var hit_cliff: bool = min_life < cliff_threshold or severe_flat_spot
	if wrong_weather_tire or needs_dmg or needs_fuel or hit_cliff or trigger_undercut:
		ai_wants_to_pit = true
		_ai_last_pit_lap = cur_lap
		if wrong_weather_tire:
			ai_pit_reason = "WET_TRANSITION" if w > wet_entry_thresh else "DRY_CROSSOVER"
		elif bool(ctx.get("vsc_active", false)) and min_life < 0.58 and not needs_dmg:
			ai_pit_reason = "VSC_OPPORTUNITY"
		elif trigger_undercut:
			ai_pit_reason = "UNDERCUT_CLEAN_AIR"
		elif hit_cliff:
			ai_pit_reason = "SPRINT_2STOP_WINDOW" if is_two_stop_sprinter else "TIRE_CLIFF_STINT"
		elif needs_fuel:
			ai_pit_reason = "STINT_FUEL"
		else:
			ai_pit_reason = "DAMAGE_REPAIR"

		var stops_after_this: int = stops_done + 1
		var will_stop_again_later: bool = (
			not wrong_weather_tire
			and is_two_stop_sprinter
			and stops_after_this < planned_total_stops
			and laps_left >= 5
		)
		var target_stint_laps: int = (
			maxi(3, int(ceil(float(laps_left) / float(maxi(1, planned_total_stops - stops_done)))))
			if will_stop_again_later
			else laps_left
		)

		var next_comp: String = String(archetype.get("preferred_dry_tire", "MEDIUM"))
		if w > 0.58:
			next_comp = "FULL_WET"
		elif w > wet_entry_thresh or (w > 0.15 and is_wet):
			next_comp = "INTERMEDIATE"
		elif is_two_stop_sprinter:
			next_comp = "SOFT" if target_stint_laps <= 7 else "MEDIUM"
		else:
			if target_stint_laps <= 3:
				next_comp = "SOFT"
			elif target_stint_laps <= 8:
				next_comp = "HARD" if (comp_id == "MEDIUM" and target_stint_laps >= 6) else "MEDIUM"
			else:
				next_comp = "HARD"

		# Stint-matched numeric fuel load (fuel_laps): NEVER overfill 'FILL' dead weight on final laps!
		var safety_reserve_laps: float = 0.55 if will_stop_again_later else 0.48
		var max_fuel_cap: float = float(car.get("max_fuel_laps", 15.0))
		var desired_fuel_after_stop: float = minf(
			max_fuel_cap,
			(float(target_stint_laps) + safety_reserve_laps) * burn_per_lap
		)
		var exact_fuel_to_add: float = snappedf(maxf(0.0, desired_fuel_after_stop - fuel_laps), 0.01)

		var repair_ord: String = "NONE"
		if float(car.get("suspension_damage", 0.0)) > 0.40:
			repair_ord = "FULL"
		elif float(car.get("front_wing_damage", 0.0)) > 0.36 or float(car.get("rear_wing_damage", 0.0)) > 0.35:
			repair_ord = "WINGS"

		var crew_mode: String = (
			"AGGRESSIVE_UNDERCUT"
			if (trigger_undercut or is_two_stop_sprinter or archetype_id == "APEX_TACTICIAN")
			else ("SAFE" if archetype_id == "TIRE_WHISPERER" else "BALANCED")
		)

		ai_pit_plan = {
			"next_compound": next_comp,
			"fuel_to_add": exact_fuel_to_add,
			"repair_order": repair_ord,
			"crew_push_mode": crew_mode,
			"planned_stint_laps": target_stint_laps,
			"strategy_type": ai_strategy_type,
			"reason": ai_pit_reason
		}
		pit_stop_requested.emit(driver_name, ai_pit_plan)


# ============================================================================
# UNCLAMPED REAL-CURVATURE SAMPLER (m^-1) + CACHED 1000-SAMPLE CIRCUIT TABLES
# ============================================================================
static func _ensure_real_curvature_table(p_circuit_id: String) -> PackedFloat32Array:
	if _real_curvature_tables.has(p_circuit_id):
		return _real_curvature_tables[p_circuit_id] as PackedFloat32Array

	var sample_count: int = 1000
	var table: PackedFloat32Array = PackedFloat32Array()
	table.resize(sample_count)

	for i in range(sample_count):
		if i >= 945 or i <= 120:
			table[i] = 0.0
			continue
		var s_prev: float = float((i - 2 + sample_count) % sample_count)
		var s_next: float = float((i + 2) % sample_count)
		var f_prev: Dictionary = MotorsportTelemetryData.sample_circuit_3d_spline(p_circuit_id, s_prev)
		var f_next: Dictionary = MotorsportTelemetryData.sample_circuit_3d_spline(p_circuit_id, s_next)
		var p_prev: Vector3 = f_prev["position"] as Vector3
		var p_next: Vector3 = f_next["position"] as Vector3
		var t_prev_raw: Vector3 = f_prev["tangent"] as Vector3
		var t_next_raw: Vector3 = f_next["tangent"] as Vector3

		var t_prev: Vector3 = Vector3(t_prev_raw.x, 0.0, t_prev_raw.z)
		var t_next: Vector3 = Vector3(t_next_raw.x, 0.0, t_next_raw.z)
		if t_prev.length_squared() < 0.0001 or t_next.length_squared() < 0.0001:
			table[i] = 0.0
			continue
		t_prev = t_prev.normalized()
		t_next = t_next.normalized()

		var chord_m: float = maxf(4.0, Vector2(p_prev.x, p_prev.z).distance_to(Vector2(p_next.x, p_next.z)))
		var turn_rad: float = atan2(-t_prev.cross(t_next).y, clampf(t_prev.dot(t_next), -1.0, 1.0))
		table[i] = turn_rad / chord_m

	_real_curvature_tables[p_circuit_id] = table
	return table


func _sample_real_curvature(ctx: Dictionary, s: float) -> float:
	var track_ref: Object = ctx.get("track_ref", null)
	if track_ref != null:
		if track_ref.has_method("get_real_curvature"):
			return float(track_ref.call("get_real_curvature", s))
		if track_ref.has_method("get_true_curvature_per_meter"):
			return float(track_ref.call("get_true_curvature_per_meter", s))
		if track_ref.has_method("get_physics_curvature"):
			return float(track_ref.call("get_physics_curvature", s)) / 82.0

	var active_circuit: String = String(ctx.get("circuit_id", circuit_id))
	var table: PackedFloat32Array = _ensure_real_curvature_table(active_circuit)
	var count: int = table.size()
	var wrapped_s: float = fposmod(s, MotorsportTelemetryData.TRACK_GAME_LENGTH)
	var idx0: int = int(floor(wrapped_s)) % count
	var idx1: int = (idx0 + 1) % count
	var frac: float = wrapped_s - floor(wrapped_s)
	return lerpf(table[idx0], table[idx1], frac)


func _sample_curvature(ctx: Dictionary, s: float) -> float:
	var track_ref: Object = ctx.get("track_ref", null)
	if track_ref != null and track_ref.has_method("get_physics_curvature"):
		return float(track_ref.call("get_physics_curvature", s))
	return _sample_real_curvature(ctx, s) * 82.0
