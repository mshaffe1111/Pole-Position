# ============================================================================
# RACE PHANATIC F1 — POLE POSITION 2026 (GODOT 4.x AAA 3D PIPELINE)
# Agent 06 (@Godot_AI_Director): Autonomous Spatial Racecraft Controller (A+ Edition)
# - Zero-Cheat 240Hz Physics Parity & Multi-Car Slipstream DRS Trains
# - Coordinated Inside Late-Braking Lunges & Over-Under Exit Switchbacks
# - Strict FIA 1-Move Defensive Rule & >= 1.25x Car-Width Chicane Corridors
# - Continuous ai_pressure_meter (0..1) -> Inside-Front Lockup Smoke & 1.0–1.6m Wide Drift
# - Real-Time Clean-Air Undercut / Overcut & W > 0.28 Wet Pit Transitions
# ============================================================================
class_name AIDriverController
extends Node3D

signal pit_stop_requested(driver_name: String, pit_plan: Dictionary)
signal pressure_lockup_triggered(driver_name: String, wide_excursion_m: float)

const FORWARD_RAY_LANES: Array[float] = [
	-7.2, -6.0, -4.8, -3.6, -2.4, -1.2, 0.0, 1.2, 2.4, 3.6, 4.8, 6.0, 7.2
]
const KINEMATIC_LOOKAHEAD_M: Array[float] = [15.0, 30.0, 45.0, 68.0, 95.0, 118.0, 140.0]

@export var archetype_id: String = "APEX_TACTICIAN"
@export var driver_name: String = "K. Takahashi"
@export var car_number: int = 7
@export var slot_index: int = 0
@export var circuit_id: String = "FUJI_1982"
@export var auto_drive_parent_rigidbody: bool = false

var archetype: Dictionary = {}
var assigned_pit_box_s: float = 976.0
var ai_target_lat: float = 0.0
var ai_decision_timer: float = 0.0
var ai_lap_brake_jitter: float = 0.0
var ai_last_jitter_key: int = -1

# Continuous 0..1 Human Pressure Telemetry & Apex Lockup Excursion State
var ai_pressure_meter: float = 0.0
var ai_pressure_timer: float = 0.0
var ai_pressure_cooldown: float = 0.0
var ai_mistake_timer: float = 0.0
var ai_mistake_duration: float = 1.32
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
var ai_launch_delay_sec: float = 0.08
var ai_skill_tier_offset: float = 0.0

# Real-Time Undercut / Overcut & Wet Transition Pit Strategy State
var ai_wants_to_pit: bool = false
var ai_pit_plan: Dictionary = {}
var ai_pit_reason: String = "NONE"
var ai_dirty_air_stuck_timer: float = 0.0
var ai_clean_air_timer: float = 0.0
var ai_out_lap_push_timer: float = 0.0
var ai_overcut_active: bool = false
var _ai_last_pit_lap: int = 0
var _ai_prev_pit_phase: String = "NONE"
var _ai_target_speed_kmh: float = 315.0
var _ai_brake_aggression: float = 1.0
var _cached_spline_s: float = -1.0
var _lap_counter: int = 1
var _total_distance_game_m: float = 0.0

# 3D RayCast3D sensor fan nodes (13 forward rays + 2 lateral sidepod overlap rays = 15-Ray 3D Radar!)
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
	var archetypes: Dictionary = MotorsportTelemetryData.AI_ARCHETYPES
	archetype = archetypes.get(archetype_id, archetypes["APEX_TACTICIAN"])

	var box_slots: Array = MotorsportTelemetryData.PIT_LANE_CONFIG["ai_box_slots_s"]
	assigned_pit_box_s = float(box_slots[slot_index % box_slots.size()])
	ai_decision_timer = fmod(float(slot_index) * 0.011, 0.045)
	ai_pass_side = -1 if (slot_index % 2 == 0) else 1

	var base_react: float = 0.05 + float((slot_index * 37) % 17) * 0.009
	var arch_react: float = -0.02 if (archetype_id == "LATE_BRAKER" or archetype_id == "DEFENSIVE_WALL") else (0.045 if archetype_id == "ROOKIE_WILDCARD" else 0.0)
	ai_launch_delay_sec = maxf(0.02, base_react + arch_react)
	ai_skill_tier_offset = clampf(0.010 - float(slot_index) * 0.0021, -0.018, 0.010)
	ai_lockup_cooldown = fmod(float(slot_index) * 0.7, 2.5)
	ai_pressure_meter = 0.0
	ai_defense_moves_used = 0
	ai_defense_lat = 999.0

func _build_3d_raycast_sensor_fan() -> void:
	for r in forward_raycasts:
		if is_instance_valid(r):
			r.queue_free()
	forward_raycasts.clear()
	if is_instance_valid(left_sidepod_ray):
		left_sidepod_ray.queue_free()
	if is_instance_valid(right_sidepod_ray):
		right_sidepod_ray.queue_free()

	# 13 forward 3D RayCast3D beams spanning [-26° .. +26°] + 2 lateral sidepod sensors = 15-Ray 3D Spatial Radar!
	var fan_angles_deg: Array[float] = [
		-26.0, -21.0, -16.5, -12.0, -8.0, -4.0, 0.0, 4.0, 8.0, 12.0, 16.5, 21.0, 26.0
	]
	for ang_deg in fan_angles_deg:
		var ray := RayCast3D.new()
		ray.position = Vector3(0.0, 0.45, -1.2)
		var rad: float = deg_to_rad(ang_deg)
		ray.target_position = Vector3(sin(rad) * 72.0, 0.0, -cos(rad) * 72.0)
		ray.collision_mask = (1 << 4) | (1 << 5) # Layer 5: f1_vehicles, Layer 6: carbon_debris
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

	var car_dict: Dictionary = _snapshot_vehicle_to_dict(vehicle, active_circuit, cur_s, float(proj["lateral_offset"]), false)
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

	# Feed pure normalized driver commands directly into F1VehiclePhysics3D via apply_ai_control_frame (Zero-Cheat Parity!)
	var out_steer: float = float(car_dict.get("steer_input", 0.0))
	var out_throttle: float = float(car_dict.get("throttle_input", 0.0))
	var out_brake: float = float(car_dict.get("brake_input", 0.0))
	var out_drs: bool = bool(car_dict.get("drs_active", false))
	var out_ers: bool = (
		not vehicle.in_pit_lane and out_throttle > 0.78 and out_brake < 0.02 and
		(ai_pass_lock_timer > 0.0 or ai_switchback_timer > 0.0 or ai_out_lap_push_timer > 0.0 or ai_defense_moves_used > 0)
	)
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
		vehicle.set_driver_inputs(out_steer, out_throttle, out_brake, out_drs)
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
	var count: int = 0
	for k in veh.wheel_states.keys():
		var ws: Dictionary = veh.wheel_states[k]
		var l: float = float(ws.get("life", 1.0))
		min_life = minf(min_life, l)
		avg_life += l
		avg_temp += float(ws.get("temp_c", 92.0))
		count += 1
	if count > 0:
		avg_life /= float(count)
		avg_temp /= float(count)
	else:
		avg_life = 1.0

	return {
		"is_player": is_plr,
		"s": s_val,
		"lateral_offset": lat_val,
		"lateral_vel": veh.lateral_speed_mps,
		"speed_kmh": veh.speed_kmh,
		"steer_input": veh.steer_input,
		"throttle_input": veh.throttle_input,
		"brake_input": veh.brake_input,
		"in_slipstream": veh.in_slipstream,
		"drs_active": veh.drs_active,
		"in_pit_lane": veh.in_pit_lane,
		"pit_phase": "NONE",
		"compound": veh.compound_id,
		"min_tire_life": min_life,
		"avg_tire_life": avg_life,
		"avg_tire_temp_c": avg_temp,
		"fuel_laps": veh.fuel_laps_remaining,
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
func update_ai_physics(car: Dictionary, all_cars: Array, player_car: Dictionary, dt: float, ctx: Dictionary) -> void:
	if bool(car.get("exploded", false)) or String(car.get("pit_phase", "NONE")) == "STOPPED":
		_ai_prev_pit_phase = String(car.get("pit_phase", "NONE"))
		return

	var cur_pit_phase: String = String(car.get("pit_phase", "NONE"))
	if _ai_prev_pit_phase == "STOPPED" and cur_pit_phase == "EXIT":
		ai_out_lap_push_timer = 38.0
		ai_dirty_air_stuck_timer = 0.0
		ai_overcut_active = false
	_ai_prev_pit_phase = cur_pit_phase

	if bool(ctx.get("controls_locked", false)):
		car["steer_input"] = 0.0
		car["brake_input"] = 0.0
		car["throttle_input"] = 0.62
		return

	var is_classic: bool = String(ctx.get("mode", "2026_UPDATED")) == "1982_ORIGINAL"
	var is_qualifying: bool = bool(ctx.get("is_qualifying", false))
	var total_laps: int = int(ctx.get("total_laps", 5))
	var m_per_game_m: float = float(ctx.get("real_meters_per_game_meter", MotorsportTelemetryData.DEFAULT_REAL_M_PER_GAME_M))

	if ai_pass_lock_timer > 0.0:
		ai_pass_lock_timer = maxf(0.0, ai_pass_lock_timer - dt)
	if ai_switchback_timer > 0.0:
		ai_switchback_timer = maxf(0.0, ai_switchback_timer - dt)
	if ai_mistake_timer > 0.0:
		ai_mistake_timer = maxf(0.0, ai_mistake_timer - dt)
	if ai_lockup_puff_timer > 0.0:
		ai_lockup_puff_timer = maxf(0.0, ai_lockup_puff_timer - dt)
	if ai_lockup_cooldown > 0.0:
		ai_lockup_cooldown = maxf(0.0, ai_lockup_cooldown - dt)
	if ai_pressure_cooldown > 0.0:
		ai_pressure_cooldown = maxf(0.0, ai_pressure_cooldown - dt)
	if ai_out_lap_push_timer > 0.0:
		ai_out_lap_push_timer = maxf(0.0, ai_out_lap_push_timer - dt)

	if not is_qualifying and int(car.get("lap", 1)) == 1 and float(car.get("current_lap_time", 99.0)) < ai_launch_delay_sec:
		car["steer_input"] = 0.0
		car["throttle_input"] = 0.45
		car["brake_input"] = 0.0
		return

	var s: float = float(car.get("s", 0.0))
	var in_pit_lane: bool = bool(car.get("in_pit_lane", false))
	var cur_k: float = 0.0 if in_pit_lane else _sample_curvature(ctx, s)
	var abs_cur_k: float = absf(cur_k)
	var speed_kmh: float = float(car.get("speed_kmh", 0.0))
	var speed_mps: float = speed_kmh / 3.6

	# Reset FIA 1-Move Defensive Counter upon completing each corner onto a new straight!
	if abs_cur_k > 0.22:
		ai_was_in_corner = true
	elif ai_was_in_corner and abs_cur_k < 0.10:
		ai_was_in_corner = false
		ai_defense_moves_used = 0
		ai_defense_committed_side = 0
		ai_defense_lat = 999.0

	# Continuous 240Hz Human Pressure Meter (0..1) & Inside-Front Lockup Excursion
	_update_human_pressure_and_mistakes(car, all_cars, cur_k, abs_cur_k, speed_mps, m_per_game_m, is_classic, is_qualifying, dt)
	car["ai_pressure_meter"] = ai_pressure_meter

	ai_decision_timer -= dt
	if ai_decision_timer <= 0.0:
		ai_decision_timer = 0.04
		_run_15_ray_spatial_planner(car, all_cars, player_car, is_classic, is_qualifying, total_laps, ctx)

	var desired_lat: float = ai_target_lat
	var road_half: float = MotorsportTelemetryData.ROAD_HALF_WIDTH
	var car_w: float = MotorsportTelemetryData.CAR_WIDTH

	# Smooth peel-off into right-hand Pit Entry split (s in [860..932])
	if not is_classic and ai_wants_to_pit and not in_pit_lane:
		if s >= 860.0 and s < 898.0:
			var blend: float = (s - 860.0) / 38.0
			desired_lat = lerpf(desired_lat, road_half * 0.66, blend)
		elif s >= 898.0 and s <= 932.0:
			desired_lat = road_half * 0.72

	# Apply smooth 1.0m–1.6m bell-curve wide drift when pressure induces an apex lockup!
	if ai_mistake_timer > 0.0:
		var dur: float = maxf(0.35, ai_mistake_duration)
		var phase: float = 1.0 - clampf(ai_mistake_timer / dur, 0.0, 1.0)
		ai_mistake_lat_bias = ai_mistake_peak_lat * sin(PI * phase)
		desired_lat = clampf(desired_lat + ai_mistake_lat_bias, -road_half + 1.05, road_half - 1.05)
	else:
		ai_mistake_lat_bias = 0.0

	# 240Hz Emergency Player-Braking Respect & Smooth Lateral Evasion
	var emergency_brake_behind_player: float = 0.0
	if not in_pit_lane and not player_car.is_empty() and not bool(player_car.get("exploded", false)) and not bool(player_car.get("in_pit_lane", false)):
		var player_ahead_m: float = _forward_dist_game_m(s, float(player_car.get("s", 0.0))) * m_per_game_m
		if player_ahead_m > 1.2 and player_ahead_m < 34.0:
			var player_lat: float = float(player_car.get("lateral_offset", 0.0))
			var lat_to_player: float = absf(float(car.get("lateral_offset", 0.0)) - player_lat)
			var closing_on_player: float = speed_kmh - float(player_car.get("speed_kmh", 0.0))
			var player_brake: float = float(player_car.get("brake_input", 0.0))
			if lat_to_player < car_w * 1.36 and (player_brake > 0.15 or closing_on_player > 7.5):
				var room_left: float = player_lat - (-road_half + 1.35)
				var room_right: float = (road_half - 1.35) - player_lat
				var evade_side: int = ai_pass_side if ai_pass_side != 0 else 1
				if evade_side < 0 and room_left < car_w * 1.35:
					evade_side = 1
				elif evade_side > 0 and room_right < car_w * 1.35:
					evade_side = -1
				var evade_lat: float = clampf(player_lat + float(evade_side) * (car_w * 1.56), -road_half + 1.15, road_half - 1.15)
				var urgency_blend: float = clampf((34.0 - player_ahead_m) / 22.0, 0.35, 1.0)
				desired_lat = lerpf(desired_lat, evade_lat, urgency_blend)
				if player_ahead_m < 20.0 and lat_to_player < car_w * 1.12:
					emergency_brake_behind_player = clampf(
						(closing_on_player + (16.0 if player_brake > 0.2 else 8.0)) / 34.0,
						player_brake * 0.85,
						1.0
					)

	# 240Hz Sidepod Respect Guard (>= 1.25x car width + 3D RayCast3D sidepod fusion + Chicane corridor!)
	if not in_pit_lane:
		var look_k20: float = _sample_curvature(ctx, s + 20.0 / m_per_game_m)
		var in_rt_chicane: bool = (cur_k * look_k20 < -0.025) or (abs_cur_k > 0.28 and absf(look_k20) > 0.28)
		var rt_left_min: float = -road_half + 1.05
		var rt_right_max: float = road_half - 1.05
		var my_lat: float = float(car.get("lateral_offset", 0.0))

		# Fuse live 3D RayCast3D sidepod sensors if colliding in physics world
		if left_sidepod_ray != null and left_sidepod_ray.is_colliding():
			rt_left_min = maxf(rt_left_min, my_lat + 0.35)
		if right_sidepod_ray != null and right_sidepod_ray.is_colliding():
			rt_right_max = minf(rt_right_max, my_lat - 0.35)

		for other in all_cars:
			if other == car or bool(other.get("exploded", false)) or bool(other.get("in_pit_lane", false)):
				continue
			var is_plr: bool = bool(other.get("is_player", false))
			var ds_real: float = absf(_signed_delta_game_m(float(other.get("s", 0.0)), s)) * m_per_game_m
			var overlap_zone_m: float = MotorsportTelemetryData.CAR_LENGTH * (1.30 if is_plr else 1.18) + (1.4 if in_rt_chicane else 0.0)
			if ds_real < overlap_zone_m:
				var corridor: float = car_w * (1.30 if is_plr else (1.28 if in_rt_chicane else 1.25))
				var other_lat: float = float(other.get("lateral_offset", 0.0))
				if other_lat <= my_lat:
					rt_left_min = maxf(rt_left_min, other_lat + corridor)
				else:
					rt_right_max = minf(rt_right_max, other_lat - corridor)
		if rt_left_min <= rt_right_max:
			desired_lat = clampf(desired_lat, rt_left_min, rt_right_max)
		else:
			desired_lat = clampf((rt_left_min + rt_right_max) * 0.5, -road_half + 1.0, road_half - 1.0)

	car["drs_active"] = not is_classic and not in_pit_lane and abs_cur_k < 0.075 and (
		bool(car.get("in_slipstream", false)) or (speed_kmh > 238.0 and float(car.get("brake_input", 0.0)) < 0.02)
	)

	# Inverse-physics curvature feedforward steering (0.0 on straights; cancels centrifugal washout in corners)
	var ff_steer: float = 0.0
	if not in_pit_lane and abs_cur_k > 0.005 and speed_mps > 2.5:
		var kv_factor: float = 1.0 + 0.00015 * speed_mps * speed_mps
		var fw_dmg: float = float(car.get("front_wing_damage", 0.0))
		var front_aero_eff: float = 1.0 if is_classic else (1.0 - fw_dmg * 0.40 * clampf((speed_kmh - 150.0) / 140.0, 0.0, 1.0))
		var steer_auth: float = (0.35 if float(car.get("aquaplane_timer", 0.0)) > 0.0 else 1.0) * maxf(0.45, front_aero_eff)
		var rate_denom: float = maxf(6.0, steer_auth * minf(28.5, speed_mps * 0.60))
		var needed_non_lin: float = clampf((cur_k * speed_mps * speed_mps * 0.00315 * kv_factor) / rate_denom, -0.95, 0.95)
		ff_steer = signf(needed_non_lin) * pow(absf(needed_non_lin), 1.0 / 1.32)

	var lat_err: float = desired_lat - float(car.get("lateral_offset", 0.0))
	var kp: float = 0.36 if archetype_id == "APEX_TACTICIAN" else (0.30 if archetype_id == "TIRE_WHISPERER" else 0.33)
	var kd: float = 0.068 if archetype_id == "TIRE_WHISPERER" else 0.060
	var raw_steer: float = clampf(ff_steer + lat_err * kp - float(car.get("lateral_vel", 0.0)) * kd, -1.0, 1.0)
	var steer_rate: float = 14.5 if archetype_id == "TIRE_WHISPERER" else 18.0
	var cur_steer: float = float(car.get("steer_input", 0.0))
	car["steer_input"] = cur_steer + (raw_steer - cur_steer) * minf(1.0, dt * steer_rate)

	# Throttle & Progressive Trail-Braking Controller
	var speed_diff: float = _ai_target_speed_kmh - speed_kmh

	if in_pit_lane and cur_pit_phase == "EXIT" and s >= 68.0 and s <= 115.0:
		car["throttle_input"] = 1.0
		car["brake_input"] = 0.0
	elif speed_diff > 2.2:
		var traction_cap: float = 1.0
		if abs_cur_k > 0.32:
			var wet_w: float = 0.0 if is_classic else float(ctx.get("groove_moisture", 0.0))
			var switchback_boost: float = 0.05 if ai_switchback_timer > 0.0 else 0.0
			var exit_mod: float = 0.85 if archetype_id == "TIRE_WHISPERER" else (1.0 if archetype_id == "ROOKIE_WILDCARD" else 0.93)
			traction_cap = clampf(exit_mod + switchback_boost - wet_w * 0.14, 0.62, 1.0)
		car["throttle_input"] = clampf(0.38 + speed_diff * 0.055, 0.28, traction_cap)
		car["brake_input"] = 0.0
	elif speed_diff < -3.2:
		var over_speed: float = -speed_diff
		var trail_limit: float = 0.86 if abs_cur_k > 0.55 else 1.0
		if over_speed < 7.5 and abs_cur_k < 0.20:
			car["throttle_input"] = 0.06
			car["brake_input"] = 0.0
		else:
			car["throttle_input"] = 0.0
			car["brake_input"] = clampf((over_speed / 44.0) * _ai_brake_aggression, 0.08, trail_limit)
	else:
		car["throttle_input"] = 0.94 if abs_cur_k < 0.08 else 0.52
		car["brake_input"] = 0.0

	if emergency_brake_behind_player > 0.05:
		car["throttle_input"] = 0.0
		car["brake_input"] = maxf(float(car.get("brake_input", 0.0)), emergency_brake_behind_player)

	# Heavy-braking inside-front tire-smoke lockup puffs under battle pressure
	if not in_pit_lane and float(car.get("brake_input", 0.0)) > 0.44 and speed_kmh > 110.0:
		if ai_lockup_puff_timer <= 0.0 and ai_lockup_cooldown <= 0.0:
			var pressured: bool = ai_pressure_meter > 0.42 or bool(car.get("in_slipstream", false)) or ai_in_draft_train
			var chance: float = (0.40 if archetype_id == "LATE_BRAKER" else (0.46 if archetype_id == "ROOKIE_WILDCARD" else 0.20)) + ai_pressure_meter * 0.35
			if pressured and randf() < chance:
				ai_lockup_puff_timer = 0.28 + randf() * 0.26
				ai_lockup_cooldown = 3.0 + randf() * 2.4
			else:
				ai_lockup_cooldown = 0.85
	if ai_lockup_puff_timer > 0.0 and (float(car.get("brake_input", 0.0)) > 0.18 or ai_mistake_timer > 0.0):
		car["skid_intensity"] = maxf(float(car.get("skid_intensity", 0.0)), 0.90)

# ============================================================================
# HUMAN MISTAKES UNDER PRESSURE (ai_pressure_meter 0..1 -> Lockup & 1.0–1.6m Wide)
# ============================================================================
func _update_human_pressure_and_mistakes(
	car: Dictionary,
	all_cars: Array,
	cur_k: float,
	abs_cur_k: float,
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
		if behind_m > 1.8 and behind_m < 22.0:
			var gap_sec: float = behind_m / maxf(18.0, speed_mps)
			if behind_m < min_stalk_m:
				min_stalk_m = behind_m
				min_stalk_sec = gap_sec
				stalker_is_plr = bool(other.get("is_player", false))
				stalker_closing_kmh = float(other.get("speed_kmh", 0.0)) - my_spd

	var is_stalked: bool = (min_stalk_m < 14.0 or min_stalk_sec < 0.45) and stalker_closing_kmh > -14.0
	var suscept: float = float(archetype.get("pressure_susceptibility", 0.75))

	if is_stalked and ai_pressure_cooldown <= 0.0:
		var prox_mult: float = 1.42 if (min_stalk_m < 8.5 or min_stalk_sec < 0.26) else 1.0
		var corner_mult: float = 1.38 if abs_cur_k > 0.24 else 0.78
		var hero_mult: float = 1.18 if stalker_is_plr else 0.92
		ai_pressure_meter = clampf(ai_pressure_meter + dt * 0.145 * suscept * prox_mult * corner_mult * hero_mult, 0.0, 1.0)
		ai_pressure_timer += dt
	else:
		var decay: float = 0.28 if ai_pressure_cooldown > 0.0 else 0.13
		ai_pressure_meter = clampf(ai_pressure_meter - dt * decay, 0.0, 1.0)
		if not is_stalked:
			ai_pressure_timer = maxf(0.0, ai_pressure_timer - dt * 0.5)

	var threshold: float = 0.82 if archetype_id == "ROOKIE_WILDCARD" else (0.88 if archetype_id == "LATE_BRAKER" else 0.96)
	if not is_classic and ai_mistake_timer <= 0.0 and ai_pressure_cooldown <= 0.0 and ai_pressure_meter >= threshold and abs_cur_k > 0.28 and my_spd > 92.0:
		var outside_dir: float = -signf(cur_k if absf(cur_k) > 0.001 else 1.0)
		var wide_meters: float = 1.02 + randf() * 0.56 # [1.02m .. 1.58m] wide apex drift!
		ai_mistake_duration = 1.32
		ai_mistake_timer = ai_mistake_duration
		ai_mistake_peak_lat = outside_dir * wide_meters
		ai_lockup_puff_timer = 0.48 + randf() * 0.20
		car["lateral_vel"] = float(car.get("lateral_vel", 0.0)) + outside_dir * 2.35
		car["speed_kmh"] = my_spd * 0.925
		car["skid_intensity"] = 0.96
		ai_pressure_meter = 0.18
		ai_pressure_timer = 0.0
		ai_pressure_cooldown = 11.5 if archetype_id == "ROOKIE_WILDCARD" else 15.5
		pressure_lockup_triggered.emit(driver_name, wide_meters)

# ============================================================================
# 25HZ 15-RAY RADAR, SLIPSTREAM TRAINS, FIA 1-MOVE & SWITCHBACK SOLVER
# ============================================================================
func _run_15_ray_spatial_planner(
	car: Dictionary,
	all_cars: Array,
	player_car: Dictionary,
	is_classic: bool,
	is_qualifying: bool,
	total_laps: int,
	ctx: Dictionary
) -> void:
	var m_per_game_m: float = float(ctx.get("real_meters_per_game_meter", MotorsportTelemetryData.DEFAULT_REAL_M_PER_GAME_M))
	var s: float = float(car.get("s", 0.0))
	var road_half: float = MotorsportTelemetryData.ROAD_HALF_WIDTH
	var car_w: float = MotorsportTelemetryData.CAR_WIDTH
	var planner_dt: float = 0.04

	if bool(car.get("in_pit_lane", false)):
		var phase: String = String(car.get("pit_phase", "ENTRY"))
		if phase == "ENTRY":
			var dist_box_m: float = _signed_delta_game_m(assigned_pit_box_s, s) * m_per_game_m
			if dist_box_m <= 2.0:
				_ai_target_speed_kmh = 0.0
			elif dist_box_m < 28.0:
				_ai_target_speed_kmh = clampf(14.0 + dist_box_m * 2.2, 14.0, 78.5)
			else:
				_ai_target_speed_kmh = 78.5
		else:
			_ai_target_speed_kmh = 320.0 if (s >= 68.0 and s <= 115.0) else 78.5
		return

	var cur_k: float = _sample_curvature(ctx, s)
	var look_k15: float = _sample_curvature(ctx, s + 15.0 / m_per_game_m)
	var look_k45: float = _sample_curvature(ctx, s + 45.0 / m_per_game_m)
	var look_k95: float = _sample_curvature(ctx, s + 95.0 / m_per_game_m)
	var look_k140: float = _sample_curvature(ctx, s + 140.0 / m_per_game_m)

	var upcoming_corner_k: float = 0.0
	for k_val in [cur_k, look_k15, look_k45, look_k95, look_k140]:
		if absf(k_val) > 0.16:
			upcoming_corner_k = k_val
			break

	var is_chicane_flip: bool = (
		(cur_k * look_k15 < -0.025) or
		(look_k15 * look_k45 < -0.035) or
		(cur_k * look_k45 < -0.045 and absf(cur_k) > 0.22 and absf(look_k45) > 0.22)
	)

	# Multi-car slipstream wake scan & clean-air / dirty-air stint tracking
	var nearest_ahead: Dictionary = {}
	var nearest_ahead_m: float = 999.0
	var wake_count: int = 0
	var my_lat: float = float(car.get("lateral_offset", 0.0))
	var my_spd: float = float(car.get("speed_kmh", 0.0))

	for other in all_cars:
		if other == car or bool(other.get("exploded", false)) or bool(other.get("in_pit_lane", false)):
			continue
		var ahead_m: float = _forward_dist_game_m(s, float(other.get("s", 0.0))) * m_per_game_m
		if ahead_m > 1.5 and ahead_m < 48.0:
			if absf(float(other.get("lateral_offset", 0.0)) - my_lat) < car_w * 1.65:
				wake_count += 1
			if ahead_m < nearest_ahead_m:
				nearest_ahead_m = ahead_m
				nearest_ahead = other

	ai_draft_train_count = wake_count
	ai_in_draft_train = wake_count >= 1 and nearest_ahead_m < 42.0

	if not nearest_ahead.is_empty() and nearest_ahead_m < 17.5 and my_spd >= float(nearest_ahead.get("speed_kmh", 0.0)) - 4.0:
		ai_dirty_air_stuck_timer += planner_dt
		ai_clean_air_timer = 0.0
	elif nearest_ahead_m > 46.0:
		ai_clean_air_timer += planner_dt
		ai_dirty_air_stuck_timer = maxf(0.0, ai_dirty_air_stuck_timer - planner_dt * 1.4)
	else:
		ai_dirty_air_stuck_timer = maxf(0.0, ai_dirty_air_stuck_timer - planner_dt * 0.5)

	var w_moist: float = float(ctx.get("groove_moisture", 0.0))
	var comp_now: String = String(car.get("compound", "MEDIUM"))
	var on_dry_in_rain: bool = (comp_now != "INTERMEDIATE" and comp_now != "FULL_WET") and w_moist > 0.28
	if not is_classic and not is_qualifying:
		if int(car.get("lap", 1)) >= total_laps and not bool(car.get("has_puncture", false)) and not on_dry_in_rain:
			ai_wants_to_pit = false
		else:
			_evaluate_pit_strategy(car, all_cars, total_laps, m_per_game_m, ctx)

	# Sidepod overlap corridor (#14 & #15) + >= 1.25x car width Chicane protection
	var blocked_left_max: float = -road_half + 1.1
	var blocked_right_min: float = (road_half - 1.45) if (s >= 946.0 or s <= 78.0) else (road_half - 1.1)
	var side_by_side_in_chicane: bool = false

	for other in all_cars:
		if other == car or bool(other.get("exploded", false)) or bool(other.get("in_pit_lane", false)):
			continue
		var ds_real: float = absf(_signed_delta_game_m(float(other.get("s", 0.0)), s)) * m_per_game_m
		var is_plr: bool = bool(other.get("is_player", false))
		var win_m: float = (6.6 if is_plr else 5.8) + (1.8 if is_chicane_flip else 0.0)
		if ds_real < win_m:
			if is_chicane_flip:
				side_by_side_in_chicane = true
			var corr: float = car_w * (1.30 if is_plr else (1.28 if is_chicane_flip else 1.25))
			var o_lat: float = float(other.get("lateral_offset", 0.0))
			if o_lat <= my_lat:
				blocked_left_max = maxf(blocked_left_max, o_lat + corr)
			else:
				blocked_right_min = minf(blocked_right_min, o_lat - corr)

	var in_yellow: bool = bool(ctx.get("sector_yellow", false))
	var vsc_active: bool = bool(ctx.get("vsc_active", false))

	# Geometric Racing Line
	var preferred_lat: float = 0.0
	var focus_k: float = look_k15 if absf(look_k15) > absf(cur_k) * 1.08 else cur_k
	if absf(focus_k) > 0.13:
		var apex_depth: float = float(archetype.get("apex_depth_m", 4.75))
		if is_chicane_flip:
			apex_depth = 3.25 if side_by_side_in_chicane else minf(apex_depth, 4.05)
		preferred_lat = signf(focus_k) * apex_depth
	elif absf(look_k95) > 0.22 or absf(look_k140) > 0.30:
		var entry_k: float = look_k95 if absf(look_k95) >= absf(look_k140) * 0.75 else look_k140
		preferred_lat = -signf(entry_k) * float(archetype.get("entry_width_m", 4.5))
	else:
		preferred_lat = (1.0 if (car_number % 2 == 0) else -1.0) * 1.8

	# Active Over-Under Exit Switchback execution
	if ai_switchback_timer > 0.0 and ai_switchback_sign != 0 and not in_yellow and not vsc_active:
		preferred_lat = clampf(float(ai_switchback_sign) * 4.35, -road_half + 1.35, road_half - 1.35)

	# STRICT FIA 1-MOVE DEFENSIVE RULE ON STRAIGHTS
	var can_defend: bool = (
		not is_qualifying and not in_yellow and not vsc_active and
		absf(cur_k) < 0.14 and float(car.get("brake_input", 0.0)) < 0.08
	)
	if can_defend and (archetype_id == "DEFENSIVE_WALL" or archetype_id == "LATE_BRAKER" or archetype_id == "APEX_TACTICIAN"):
		var def_range: float = float(archetype.get("defensive_range_m", 14.0))
		if archetype_id == "DEFENSIVE_WALL":
			def_range += 4.0
		else:
			def_range *= 0.72

		var closest_threat: Dictionary = {}
		var closest_behind_m: float = def_range
		for other in all_cars:
			if other == car or bool(other.get("exploded", false)) or bool(other.get("in_pit_lane", false)):
				continue
			var behind_m: float = _signed_delta_game_m(s, float(other.get("s", 0.0))) * m_per_game_m
			if behind_m > MotorsportTelemetryData.CAR_LENGTH * 1.12 and behind_m <= def_range and float(other.get("speed_kmh", 0.0)) > my_spd - 10.0:
				var is_plr: bool = bool(other.get("is_player", false))
				if closest_threat.is_empty() or is_plr or behind_m < closest_behind_m:
					closest_threat = other
					closest_behind_m = behind_m
					if is_plr:
						break

		if not closest_threat.is_empty():
			var t_lat: float = float(closest_threat.get("lateral_offset", 0.0))
			if ai_defense_moves_used == 0:
				var inside_s: float = signf(upcoming_corner_k) if absf(upcoming_corner_k) > 0.12 else (1.0 if t_lat >= 0.0 else -1.0)
				ai_defense_committed_side = int(inside_s)
				ai_defense_moves_used = 1
				ai_defense_lat = clampf(inside_s * 4.20 + (t_lat - inside_s * 4.20) * 0.25, -road_half + 1.65, road_half - 1.65)
			if ai_defense_lat < 900.0:
				var legal_def: float = ai_defense_lat
				if closest_behind_m < 14.0:
					var min_edge_buf: float = 1.15 + car_w * 1.28
					if t_lat < my_lat - car_w * 0.55:
						legal_def = maxf(legal_def, -road_half + min_edge_buf)
					elif t_lat > my_lat + car_w * 0.55:
						legal_def = minf(legal_def, road_half - min_edge_buf)
				preferred_lat = legal_def

	# MULTI-CAR SLIPSTREAM TRAINS, INSIDE LATE-BRAKING LUNGES & OVER-UNDER SWITCHBACKS
	var on_fast_sec: bool = absf(cur_k) < 0.14 and absf(look_k15) < 0.18
	var appr_braking: bool = absf(look_k95) > 0.28 or absf(look_k140) > 0.42
	var active_slingshot: bool = false

	if not is_qualifying and not in_yellow and not vsc_active and not nearest_ahead.is_empty() and nearest_ahead_m < 46.0:
		var lead_spd: float = float(nearest_ahead.get("speed_kmh", 0.0))
		var lead_lat: float = float(nearest_ahead.get("lateral_offset", 0.0))
		var lead_s: float = float(nearest_ahead.get("s", 0.0))
		var closing_mps: float = maxf(0.0, (my_spd - lead_spd) / 3.6)
		var ttc_sec: float = (nearest_ahead_m / closing_mps) if closing_mps > 0.4 else 99.0
		var pullout_m: float = 23.5 if archetype_id == "LATE_BRAKER" else (21.5 if archetype_id == "ROOKIE_WILDCARD" else 19.5)

		var leader_already_2wide: bool = false
		for third in all_cars:
			if third == car or third == nearest_ahead or bool(third.get("exploded", false)) or bool(third.get("in_pit_lane", false)):
				continue
			var ahead_lead_m: float = _forward_dist_game_m(lead_s, float(third.get("s", 0.0))) * m_per_game_m
			if ahead_lead_m > -4.0 and ahead_lead_m < 14.0 and absf(lead_lat - float(third.get("lateral_offset", 0.0))) > car_w * 0.95:
				leader_already_2wide = true
				break

		var inside_sign: int = int(signf(upcoming_corner_k)) if absf(upcoming_corner_k) > 0.16 else 0
		var leader_tight_inside: bool = inside_sign != 0 and (lead_lat * float(inside_sign) > 3.15)
		var leader_wide_lockup: bool = inside_sign != 0 and absf(cur_k) > 0.25 and (lead_lat * float(inside_sign) < 1.2)

		if leader_already_2wide and nearest_ahead_m > 11.0:
			preferred_lat = clampf(lead_lat, -road_half + 1.6, road_half - 1.6)
		elif on_fast_sec and nearest_ahead_m >= pullout_m and ttc_sec > 2.1 and not appr_braking and lead_spd > 145.0:
			var peep: float = 0.22 if (car_number % 2 == 0) else -0.22
			preferred_lat = clampf(lead_lat + peep, -road_half + 1.75, road_half - 1.75)
		elif appr_braking and inside_sign != 0 and nearest_ahead_m < 22.0 and nearest_ahead_m > 6.5 and leader_tight_inside and (archetype_id == "APEX_TACTICIAN" or archetype_id == "TIRE_WHISPERER" or archetype_id == "LATE_BRAKER"):
			# Over-Under Switchback Setup!
			preferred_lat = clampf(float(-inside_sign) * 4.95, -road_half + 1.35, road_half - 1.35)
			ai_switchback_sign = inside_sign
			ai_switchback_timer = 1.45
		elif absf(cur_k) > 0.24 and inside_sign != 0 and nearest_ahead_m < 19.0 and leader_wide_lockup:
			active_slingshot = true
			ai_pass_side = inside_sign
			ai_pass_lock_timer = 1.4
			preferred_lat = clampf(float(inside_sign) * 4.55, -road_half + 1.25, road_half - 1.25)
		elif nearest_ahead_m < 33.0 and (nearest_ahead_m < pullout_m or ttc_sec <= 2.4 or (appr_braking and closing_mps > -1.5)):
			active_slingshot = true
			if ai_pass_lock_timer <= 0.0:
				ai_pass_side = _choose_best_overtake_side(car, nearest_ahead, all_cars, upcoming_corner_k, m_per_game_m)
				ai_pass_lock_timer = 1.65
			var room_chosen: float = (lead_lat - (-road_half + 1.3)) if ai_pass_side < 0 else ((road_half - 1.3) - lead_lat)
			if room_chosen < car_w * 1.30:
				ai_pass_side = -ai_pass_side
				ai_pass_lock_timer = 1.4
			var spacing: float = car_w * (1.52 if bool(nearest_ahead.get("is_player", false)) else 1.44)
			preferred_lat = clampf(lead_lat + float(ai_pass_side) * spacing, -road_half + 1.25, road_half - 1.25)

	# Score all 13 forward rays + 3D RayCast3D obstacle fusion
	var best_lane: float = clampf(my_lat, -road_half + 1.15, road_half - 1.15)
	var best_score: float = -1.0e9
	var any_valid: bool = false

	for r_idx in range(FORWARD_RAY_LANES.size()):
		var lane_lat: float = FORWARD_RAY_LANES[r_idx]
		if blocked_left_max <= blocked_right_min and (lane_lat < blocked_left_max or lane_lat > blocked_right_min):
			continue
		any_valid = true
		var smooth_w: float = 0.85 if active_slingshot else 1.45
		var score: float = -absf(lane_lat - preferred_lat) * 2.55 - absf(lane_lat - my_lat) * smooth_w
		if absf(lane_lat) > 6.4:
			score -= (absf(lane_lat) - 6.4) * 1.8

		# Direct 3D RayCast3D sensor fusion if active in physics scene
		if r_idx < forward_raycasts.size() and forward_raycasts[r_idx] != null and forward_raycasts[r_idx].is_colliding():
			var hit_pt: Vector3 = forward_raycasts[r_idx].get_collision_point()
			var hit_dist: float = global_position.distance_to(hit_pt)
			if hit_dist < 68.0:
				var ray_prox: float = (70.0 - hit_dist) / 70.0
				score -= ray_prox * ray_prox * 85.0

		for other in all_cars:
			if other == car or bool(other.get("in_pit_lane", false)):
				continue
			var ahead_m: float = _forward_dist_game_m(s, float(other.get("s", 0.0))) * m_per_game_m
			if ahead_m > 0.0 and ahead_m <= 140.0:
				var safe_clr: float = car_w * (1.32 if bool(other.get("is_player", false)) else 1.25)
				var lat_sep: float = absf(lane_lat - float(other.get("lateral_offset", 0.0)))
				if lat_sep < safe_clr:
					var closing_kmh: float = my_spd - float(other.get("speed_kmh", 0.0))
					if bool(other.get("exploded", false)) or float(other.get("speed_kmh", 0.0)) < 75.0 or closing_kmh > -6.0 or ahead_m < 22.0:
						var urgency: float = (144.0 - ahead_m) / 140.0
						score -= urgency * urgency * (240.0 if bool(other.get("exploded", false)) else 115.0)

		if not in_yellow and not vsc_active and active_slingshot and appr_braking and (archetype_id == "LATE_BRAKER" or archetype_id == "ROOKIE_WILDCARD") and absf(upcoming_corner_k) > 0.22:
			var lunge_w: float = 1.85 if archetype_id == "LATE_BRAKER" else 1.35
			score += (lane_lat * signf(upcoming_corner_k) * 0.25) * lunge_w

		if score > best_score:
			best_score = score
			best_lane = lane_lat

	if not any_valid:
		best_lane = (blocked_left_max + blocked_right_min) * 0.5
	elif blocked_left_max <= blocked_right_min:
		best_lane = clampf(best_lane, blocked_left_max, blocked_right_min)

	ai_target_lat = clampf(best_lane, -road_half + 1.05, road_half - 1.05)

	# Multi-horizon kinematic braking solver with pressure creep & chicane safety
	var eff_grip: float = _estimate_effective_grip(car, is_classic, ctx)
	_ai_brake_aggression = float(archetype.get("brake_aggression", 1.0))
	var planned_decel: float = (28.0 if is_classic else 26.2 * clampf(eff_grip, 0.42, 1.14)) * _ai_brake_aggression
	var pressure_creep_m: float = (ai_pressure_meter - 0.52) * 5.8 if ai_pressure_meter > 0.52 else 0.0
	var brake_margin_m: float = clampf(7.5 - (float(archetype.get("brake_offset_m", 0.0)) + pressure_creep_m) * 0.58, -2.2, 16.0)

	var min_allow_kmh: float = _corner_speed_for_curvature(absf(cur_k), eff_grip, is_classic)
	if is_chicane_flip and maxf(absf(cur_k), absf(look_k15)) > 0.26:
		min_allow_kmh *= 0.91 if side_by_side_in_chicane else 0.94

	for dist_m in KINEMATIC_LOOKAHEAD_M:
		var k_ahead: float = absf(_sample_curvature(ctx, s + dist_m / m_per_game_m))
		if k_ahead < 0.05:
			continue
		var req_mps: float = _corner_speed_for_curvature(k_ahead, eff_grip, is_classic) / 3.6
		var d_eff: float = maxf(0.0, dist_m - brake_margin_m)
		var allow_kmh: float = sqrt(req_mps * req_mps + 2.0 * planned_decel * d_eff) * 3.6
		if allow_kmh < min_allow_kmh:
			min_allow_kmh = allow_kmh

	var out_lap_bonus: float = 0.009 if ai_out_lap_push_timer > 0.0 else 0.0
	var overcut_bonus: float = 0.007 if (ai_overcut_active and float(car.get("fuel_laps", 5.0)) < 3.0) else 0.0
	var base_pace: float = float(archetype.get("base_pace", 0.992)) + ai_skill_tier_offset + out_lap_bonus + overcut_bonus
	var target_kmh: float = minf(310.0 if is_classic else 333.0, min_allow_kmh * base_pace)

	# Pit-entry speed-limit braking ramp
	if not is_classic and ai_wants_to_pit and s >= 850.0:
		var dist_lim_m: float = maxf(0.0, (942.0 - s) * m_per_game_m)
		var lim_mps: float = 77.5 / 3.6
		var pit_decel: float = maxf(11.5, planned_decel * 0.78)
		var pit_allow: float = sqrt(lim_mps * lim_mps + 2.0 * pit_decel * maxf(0.0, dist_lim_m - 6.0)) * 3.6
		target_kmh = minf(target_kmh, pit_allow)

	if in_yellow:
		target_kmh = minf(target_kmh * 0.80, 218.0)
	if vsc_active:
		target_kmh = minf(target_kmh, 156.5)
	if ai_mistake_timer > 0.0:
		target_kmh *= 0.90

	_ai_target_speed_kmh = maxf(62.0, target_kmh)

func _choose_best_overtake_side(car: Dictionary, leader: Dictionary, all_cars: Array, upcoming_k: float, m_per_game_m: float) -> int:
	var road_half: float = MotorsportTelemetryData.ROAD_HALF_WIDTH
	var car_w: float = MotorsportTelemetryData.CAR_WIDTH
	var spacing: float = car_w * 1.48
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

	if absf(upcoming_k) > 0.16:
		var bonus: float = 4.4 if archetype_id == "LATE_BRAKER" else (3.3 if archetype_id == "ROOKIE_WILDCARD" else 1.9)
		if upcoming_k < 0.0:
			left_score += bonus
		else:
			right_score += bonus

	for other in all_cars:
		if other == car or other == leader or bool(other.get("in_pit_lane", false)):
			continue
		var ahead_m: float = _forward_dist_game_m(s, float(other.get("s", 0.0))) * m_per_game_m
		if ahead_m >= -3.0 and ahead_m <= 55.0:
			var o_lat: float = float(other.get("lateral_offset", 0.0))
			if absf(o_lat - left_cand) < car_w * 1.2:
				left_score -= 9.0
			if absf(o_lat - right_cand) < car_w * 1.2:
				right_score -= 9.0

	return 1 if right_score > left_score else -1

func _corner_speed_for_curvature(abs_k: float, eff_grip: float, is_classic: bool) -> float:
	var max_straight: float = 310.0 if is_classic else 333.0
	if abs_k <= 0.035:
		return max_straight
	var norm_k: float = clampf((abs_k - 0.035) / 0.88, 0.0, 1.06)
	var dry_apex_kmh: float = 332.0 - 210.0 * pow(norm_k, 0.91)
	var grip_scale: float = sqrt(clampf(eff_grip / 1.04, 0.36, 1.10))
	var mod: float = float(archetype.get("corner_speed_mod", 1.0))
	return clampf(dry_apex_kmh * grip_scale * mod, 78.0, max_straight)

func _estimate_effective_grip(car: Dictionary, is_classic: bool, ctx: Dictionary) -> float:
	if is_classic:
		return 1.06
	var comp_id: String = String(car.get("compound", "MEDIUM"))
	var w: float = float(ctx.get("groove_moisture", 0.0))
	var min_life: float = float(car.get("min_tire_life", 1.0))
	var temp_c: float = float(car.get("avg_tire_temp_c", 92.0))
	var punc: bool = bool(car.get("has_puncture", false))
	var tire_mu: float = MotorsportTelemetryData.evaluate_tire_grip_multiplier(comp_id, min_life, temp_c, w, punc)
	var aero_dmg_mult: float = 1.0 - float(car.get("front_wing_damage", 0.0)) * 0.22 - float(car.get("suspension_damage", 0.0)) * 0.16
	return clampf(tire_mu * aero_dmg_mult, 0.30, 1.18)

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
# 2026 PIT STRATEGY: TIRE CLIFF (<28%), CLEAN-AIR UNDERCUT/OVERCUT & WET (W > 0.28)
# ============================================================================
func _evaluate_pit_strategy(car: Dictionary, all_cars: Array, total_laps: int, m_per_game_m: float, ctx: Dictionary) -> void:
	if ai_wants_to_pit:
		return
	var min_life: float = float(car.get("min_tire_life", 1.0))
	var w: float = float(ctx.get("groove_moisture", 0.0))
	var comp_id: String = String(car.get("compound", "MEDIUM"))
	var is_wet: bool = comp_id == "INTERMEDIATE" or comp_id == "FULL_WET"
	var cur_lap: int = int(car.get("lap", 1))
	var laps_left: int = maxi(1, total_laps - cur_lap)

	# Immediate INTER / WET pit call when track wetness crosses 0.28!
	var wet_crossover: bool = (not is_wet and w > 0.28)
	var monsoon_esc: bool = (comp_id == "INTERMEDIATE" and w > 0.65)
	var dry_crossover: bool = (is_wet and w < 0.08)
	var wrong_weather_tire: bool = wet_crossover or monsoon_esc or dry_crossover

	var has_punc: bool = bool(car.get("has_puncture", false))
	var needs_dmg: bool = (
		has_punc or
		float(car.get("front_wing_damage", 0.0)) > 0.55 or
		float(car.get("rear_wing_damage", 0.0)) > 0.58 or
		float(car.get("suspension_damage", 0.0)) > 0.58
	)

	if _ai_last_pit_lap == cur_lap and not has_punc and not wrong_weather_tire:
		return

	var fuel_laps: float = float(car.get("fuel_laps", 5.0))
	var needs_fuel: bool = fuel_laps < minf(1.32, float(laps_left) + 0.22)

	var undercut_early: int = int(archetype.get("undercut_laps_early", 0))
	var cliff_threshold: float = clampf(0.28 + float(undercut_early) * 0.035, 0.22, 0.33)
	if bool(ctx.get("vsc_active", false)) and laps_left >= 2:
		cliff_threshold = 0.56

	var trigger_undercut: bool = false
	if not wrong_weather_tire and laps_left >= 2 and min_life < 0.42 and ai_dirty_air_stuck_timer > 4.2 and (archetype_id == "APEX_TACTICIAN" or archetype_id == "LATE_BRAKER" or archetype_id == "ROOKIE_WILDCARD"):
		if _is_projected_pit_rejoin_clean(car, all_cars, m_per_game_m):
			trigger_undercut = true

	if not wrong_weather_tire and not needs_fuel and not needs_dmg and ai_clean_air_timer > 5.0 and fuel_laps < 3.2 and min_life >= 0.22 and (archetype_id == "TIRE_WHISPERER" or archetype_id == "DEFENSIVE_WALL"):
		ai_overcut_active = true
		cliff_threshold = minf(cliff_threshold, 0.225)
	else:
		ai_overcut_active = false

	var hit_cliff: bool = min_life < cliff_threshold
	if wrong_weather_tire or needs_dmg or needs_fuel or hit_cliff or trigger_undercut:
		ai_wants_to_pit = true
		_ai_last_pit_lap = cur_lap
		if wrong_weather_tire:
			ai_pit_reason = "WET_TRANSITION" if w > 0.28 else "DRY_CROSSOVER"
		elif trigger_undercut:
			ai_pit_reason = "UNDERCUT_CLEAN_AIR"
		elif hit_cliff:
			ai_pit_reason = "TIRE_CLIFF_28"
		elif needs_fuel:
			ai_pit_reason = "LOW_FUEL"
		else:
			ai_pit_reason = "DAMAGE_REPAIR"

		var laps_rem: int = maxi(2, total_laps - cur_lap + 1)
		var next_comp: String = String(archetype.get("preferred_dry_tire", "MEDIUM"))
		if w > 0.58:
			next_comp = "FULL_WET"
		elif w > 0.28 or (w > 0.16 and is_wet):
			next_comp = "INTERMEDIATE"
		elif laps_rem <= 4:
			next_comp = "SOFT"
		elif laps_rem <= 9:
			next_comp = "SOFT" if (next_comp == "SOFT" and laps_rem <= 6) else "MEDIUM"
		else:
			next_comp = "MEDIUM" if archetype_id == "LATE_BRAKER" else "HARD"

		var repair_ord: String = "NONE"
		if float(car.get("suspension_damage", 0.0)) > 0.42:
			repair_ord = "FULL"
		elif float(car.get("front_wing_damage", 0.0)) > 0.40 or float(car.get("rear_wing_damage", 0.0)) > 0.42:
			repair_ord = "WINGS"

		ai_pit_plan = {
			"next_compound": next_comp,
			"fuel_to_add": "FILL",
			"repair_order": repair_ord,
			"crew_push_mode": "AGGRESSIVE_UNDERCUT" if (trigger_undercut or archetype_id == "APEX_TACTICIAN") else ("SAFE" if archetype_id == "TIRE_WHISPERER" else "BALANCED"),
			"reason": ai_pit_reason
		}
		pit_stop_requested.emit(driver_name, ai_pit_plan)

func _sample_curvature(ctx: Dictionary, s: float) -> float:
	var track_ref: Object = ctx.get("track_ref", null)
	if track_ref != null and track_ref.has_method("get_physics_curvature"):
		return float(track_ref.call("get_physics_curvature", s))
	var active_circuit: String = String(ctx.get("circuit_id", circuit_id))
	return MotorsportTelemetryData.sample_circuit_curvature(active_circuit, s)
