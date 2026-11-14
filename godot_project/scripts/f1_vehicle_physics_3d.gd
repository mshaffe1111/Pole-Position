class_name F1VehiclePhysics3D
extends RigidBody3D
## ============================================================================
## RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX
## Godot 4.x 240Hz 3D Formula 1 Vehicle Physics, 4-Corner Raycast Suspension,
## Spatial Downforce & Drag, 48m Slipstream Raycast Cone, Pacejka Tire Model,
## Surface Group Detection & Seamless 8-Speed Hybrid Drivetrain
## ============================================================================

signal gear_shifted(new_gear: int, direction: String, current_rpm: float)
signal exhaust_backfire(intensity: float)
signal over_rev_warning(current_rpm: float)
signal hydroplane_triggered(speed_kmh: float)
signal tire_punctured(corner_id: String)
signal kerb_rumble_step(corner_id: String, intensity: float)
signal brake_thermal_updated(fl_glow: float, fr_glow: float, rl_glow: float, rr_glow: float)
signal wheel_rub_contact(impact_kmh: float, world_pos: Vector3)

# ----------------------------------------------------------------------------
# 1. STANDARDIZED 3D BLENDER -> GODOT 4 NODE HIERARCHY PATHS
# ----------------------------------------------------------------------------
@export_group("3D Mesh Node Bindings")
@export var body_node_path: NodePath = ^"Body"
@export var front_wing_node_path: NodePath = ^"Body/FrontWing"
@export var rear_wing_node_path: NodePath = ^"Body/RearWing"
@export var rear_wing_drs_node_path: NodePath = ^"Body/RearWing/RearWing_DRS"
@export var steering_wheel_node_path: NodePath = ^"Body/SteeringWheel"
@export var driver_arms_gloves_node_path: NodePath = ^"Body/DriverArms_Gloves"
@export var cockpit_dash_node_path: NodePath = ^"Body/CockpitDash"
@export var cockpit_tub_node_path: NodePath = ^"Body/CockpitTub_Interior"
@export var halo_titanium_node_path: NodePath = ^"Body/Halo_Titanium"
@export var wing_mirror_l_node_path: NodePath = ^"Body/WingMirror_L"
@export var wing_mirror_r_node_path: NodePath = ^"Body/WingMirror_R"
@export var driver_helmet_node_path: NodePath = ^"Body/DriverHelmet"

@export_group("Chassis & Mass Properties")
@export var dry_mass_kg: float = 798.0
@export var fuel_laps_remaining: float = 7.0
@export var max_fuel_laps: float = 15.0
@export var fuel_kg_per_lap: float = 1.45
@export var center_of_mass_local: Vector3 = Vector3(0.0, 0.27, 0.08)

@export_group("Aerodynamics (Downforce, Drag & 48m Slipstream)")
@export var air_density_rho: float = 1.225
@export var frontal_area_m2: float = 1.52
@export var lift_coeff_cl_base: float = 3.85
@export var drag_coeff_cd_base: float = 0.88
@export var drs_cd_reduction: float = 0.16
@export var drs_cl_rear_reduction: float = 0.24
@export var front_aero_balance: float = 0.42
@export var front_cop_offset: Vector3 = Vector3(0.0, 0.18, -1.65)
@export var rear_cop_offset: Vector3 = Vector3(0.0, 0.58, 1.55)
@export var slipstream_max_dist_m: float = 48.0
@export var slipstream_corridor_half_width_m: float = 2.45

@export_group("4-Wheel Raycast Suspension & Anti-Roll Bars")
@export var wheel_radius_m: float = 0.36
@export var suspension_rest_length_m: float = 0.28
@export var suspension_max_travel_m: float = 0.095
@export var front_spring_stiffness_nm: float = 165000.0
@export var rear_spring_stiffness_nm: float = 185000.0
@export var front_bump_damping_nsm: float = 7400.0
@export var front_rebound_damping_nsm: float = 9200.0
@export var rear_bump_damping_nsm: float = 8200.0
@export var rear_rebound_damping_nsm: float = 10400.0
@export var front_arb_stiffness_nm: float = 52000.0
@export var rear_arb_stiffness_nm: float = 44000.0

@export_group("Drivetrain, 8-Speed Gearbox & E-Diff")
@export_enum("AUTO_8SPD", "MANUAL_8SPD", "CLASSIC_2SPD") var gearbox_mode: String = "AUTO_8SPD"
@export var peak_engine_power_kw: float = 746.0 # ~1,000 BHP V6 Hybrid + MGU-K
@export var final_drive_ratio: float = 3.550
@export var diff_preload_nm: float = 140.0
@export var diff_power_lock: float = 0.38
@export var diff_coast_lock: float = 0.52
@export var max_brake_torque_nm: float = 15800.0
@export var brake_bias_front: float = 0.57
@export_enum("OFF", "LOW", "MEDIUM", "HIGH") var braking_assist_mode: String = "OFF"

# ----------------------------------------------------------------------------
# 2. CONSTANTS: 8-SPEED F1 RATIOS, SURFACE FRICTION GROUPS & TIRE COMPOUNDS
# ----------------------------------------------------------------------------
const EIGHT_SPEED_TOPS_KMH: Array[float] = [108.0, 148.0, 184.0, 216.0, 245.0, 272.0, 296.0, 316.0]
const EIGHT_SPEED_UPSHIFT_KMH: Array[float] = [106.8, 146.5, 182.2, 214.0, 242.8, 269.6, 293.6]
const EIGHT_SPEED_DOWNSHIFT_KMH: Array[float] = [84.0, 120.0, 154.0, 185.0, 214.0, 241.0, 266.0]
const EIGHT_SPEED_ENTRY_RPM: Array[float] = [3800.0, 8880.0, 9150.0, 9380.0, 9560.0, 9720.0, 9860.0, 9980.0]
const EIGHT_SPEED_GEAR_RATIOS: Array[float] = [3.185, 2.324, 1.869, 1.592, 1.404, 1.265, 1.162, 1.087]

const F1_IDLE_RPM: float = 3800.0
const F1_SHIFT_PEAK_RPM: float = 12960.0
const F1_TOP_GEAR_RPM: float = 12840.0
const F1_REV_LIMIT_RPM: float = 13800.0

const SURFACE_FRICTION_TABLE: Dictionary = {
	"surface_asphalt": 1.00,
	"surface_wet": 0.65,
	"surface_curb": 0.85,
	"surface_grass": 0.35,
	"surface_gravel": 0.25,
}

const TIRE_COMPOUND_SPECS: Dictionary = {
	"SOFT": {"base_grip": 1.18, "wear_rate": 1.38, "opt_min_c": 90.0, "opt_max_c": 106.0, "is_wet": false, "camber_stiffness": 1.12},
	"MEDIUM": {"base_grip": 1.10, "wear_rate": 1.00, "opt_min_c": 88.0, "opt_max_c": 104.0, "is_wet": false, "camber_stiffness": 1.08},
	"HARD": {"base_grip": 1.03, "wear_rate": 0.72, "opt_min_c": 85.0, "opt_max_c": 102.0, "is_wet": false, "camber_stiffness": 1.04},
	"INTERMEDIATE": {"base_grip": 1.06, "wear_rate": 1.15, "opt_min_c": 65.0, "opt_max_c": 88.0, "is_wet": true, "camber_stiffness": 1.00},
	"FULL_WET": {"base_grip": 0.99, "wear_rate": 1.25, "opt_min_c": 52.0, "opt_max_c": 78.0, "is_wet": true, "camber_stiffness": 0.96},
}

const CORNER_KEYS: Array[String] = ["FL", "FR", "RL", "RR"]
const CORNER_HARDPOINTS: Dictionary = {
	"FL": Vector3(-0.86, 0.32, -1.48),
	"FR": Vector3(0.86, 0.32, -1.48),
	"RL": Vector3(-0.86, 0.32, 1.42),
	"RR": Vector3(0.86, 0.32, 1.42),
}
const CORNER_CAMBER_RAD: Dictionary = {
	"FL": deg_to_rad(-3.2),
	"FR": deg_to_rad(-3.2),
	"RL": deg_to_rad(-1.8),
	"RR": deg_to_rad(-1.8),
}

# ----------------------------------------------------------------------------
# 3. LIVE TELEMETRY & SIMULATION STATE
# ----------------------------------------------------------------------------
var steer_input: float = 0.0
var throttle_input: float = 0.0
var brake_input: float = 0.0
var drs_requested: bool = false
var ers_overtake_requested: bool = false

var speed_kmh: float = 0.0
var forward_speed_mps: float = 0.0
var lateral_speed_mps: float = 0.0
var total_distance_m: float = 0.0
var rpm: float = F1_IDLE_RPM
var gear: int = 1
var shift_cooldown: float = 0.0
var rev_blip_timer: float = 0.0
var corner_exit_torque_timer: float = 0.0
var over_rev_timer: float = 0.0

# Hybrid V6 Split-Turbo (0.0..2.40 bar) & MGU-K ERS State
var turbo_boost_bar: float = 0.0
var ers_charge: float = 1.0
var ers_deploying: bool = false

var in_slipstream: bool = false
var slipstream_factor: float = 0.0
var tow_reservoir: float = 0.0
var drs_active: bool = false
var drs_flap_angle_rad: float = 0.0

var steer_angle_rad: float = 0.0
var self_aligning_torque_norm: float = 0.0
var self_aligning_torque: float = 0.0
var lat_g: float = 0.0
var long_g: float = 0.0

# 3D Suspension Attitude & Dual-Layer Tire Thermal Arrays (FL, FR, RL, RR)
var chassis_pitch_rad: float = 0.0
var _chassis_pitch_vel: float = 0.0
var chassis_roll_rad: float = 0.0
var _chassis_roll_vel: float = 0.0
var wheel_compression: Array[float] = [0.25, 0.25, 0.25, 0.25]
var tire_temps_c: Array[float] = [98.0, 98.0, 98.0, 98.0]
var tire_core_temps_c: Array[float] = [98.0, 98.0, 98.0, 98.0]

var skid_intensity: float = 0.0
var aquaplane_timer: float = 0.0
var _rub_cooldown: float = 0.0
var in_pit_lane: bool = false
var vsc_active: bool = false
var ambient_temp_c: float = 26.0
var global_wetness: float = 0.0
var compound_id: String = "SOFT"

var damage_state: Dictionary = {
	"front_wing": 0.0,
	"rear_wing": 0.0,
	"suspension": 0.0,
	"damaged_corner": "FL",
	"has_puncture": false,
}

var perf_mods: Dictionary = {
	"power_mult": 1.0,
	"top_speed_bonus_kmh": 0.0,
	"aero_grip_mult": 1.0,
	"brake_mult": 1.0,
	"agility_mult": 1.0,
	"tire_wear_mult": 1.0,
	"fuel_load_mult": 1.0,
	"drs_bonus_kmh": 0.0,
	"thermal_window_bonus_c": 0.0,
	"wet_grip_bonus": 0.0,
}

var wheel_states: Dictionary = {}
var _wheel_nodes: Dictionary = {}
var _susp_nodes: Dictionary = {}
var _disc_nodes: Dictionary = {}
var _caliper_nodes: Dictionary = {}
var _disc_materials: Dictionary = {}

var _body_node: Node3D = null
var _body_rest_rot: Vector3 = Vector3.ZERO
var _front_wing_node: Node3D = null
var _rear_wing_node: Node3D = null
var _rear_wing_drs_node: Node3D = null
var _steering_wheel_node: Node3D = null
var _driver_arms_gloves_node: Node3D = null
var _cockpit_dash_node: Node3D = null
var _cockpit_tub_node: Node3D = null
var _halo_titanium_node: Node3D = null
var _wing_mirror_l_node: Node3D = null
var _wing_mirror_r_node: Node3D = null
var _driver_helmet_node: Node3D = null
var _prev_linear_velocity: Vector3 = Vector3.ZERO

# ----------------------------------------------------------------------------
# 4. INITIALIZATION & NODE BINDING
# ----------------------------------------------------------------------------
func _ready() -> void:
	custom_integrator = false
	continuous_cd = true
	contact_monitor = true
	max_contacts_reported = 8
	can_sleep = false
	center_of_mass_mode = RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM
	center_of_mass = center_of_mass_local
	_update_total_vehicle_mass()
	_init_wheel_states()
	_bind_visual_hierarchy_nodes()


func _init_wheel_states() -> void:
	var comp: Dictionary = TIRE_COMPOUND_SPECS.get(compound_id, TIRE_COMPOUND_SPECS["SOFT"])
	var blanket_temp: float = (float(comp["opt_min_c"]) + float(comp["opt_max_c"])) * 0.5
	tire_temps_c = [blanket_temp, blanket_temp, blanket_temp, blanket_temp]
	tire_core_temps_c = [blanket_temp, blanket_temp, blanket_temp, blanket_temp]
	wheel_compression = [0.25, 0.25, 0.25, 0.25]
	for c_key: String in CORNER_KEYS:
		wheel_states[c_key] = {
			"compression_m": 0.0,
			"prev_compression_m": 0.0,
			"compression_norm": 0.25,
			"normal_load_n": (dry_mass_kg * 9.81) * 0.25,
			"contact_normal": Vector3.UP,
			"contact_point": Vector3.ZERO,
			"grounded": true,
			"surface_group": "surface_asphalt",
			"surface_mu": 1.0,
			"slip_angle_rad": 0.0,
			"slip_ratio": 0.0,
			"lat_force_n": 0.0,
			"long_force_n": 0.0,
			"wheel_spin_rad": 0.0,
			"angular_vel_rads": 0.0,
			"surface_temp_c": blanket_temp,
			"core_temp_c": blanket_temp,
			"temp_c": blanket_temp,
			"life": 1.0,
			"punctured": false,
			"brake_glow": 0.0,
		}


func _resolve_cockpit_subnode(primary_path: NodePath, fallback_name: String) -> Node3D:
	var node: Node3D = get_node_or_null(primary_path) as Node3D
	if node == null:
		node = get_node_or_null(NodePath(fallback_name)) as Node3D
	if node == null and _body_node != null:
		node = _body_node.find_child(fallback_name, true, false) as Node3D
	return node


func _bind_visual_hierarchy_nodes() -> void:
	_body_node = get_node_or_null(body_node_path) as Node3D
	if _body_node != null:
		_body_rest_rot = _body_node.rotation
	_front_wing_node = _resolve_cockpit_subnode(front_wing_node_path, "FrontWing")
	_rear_wing_node = _resolve_cockpit_subnode(rear_wing_node_path, "RearWing")
	_rear_wing_drs_node = _resolve_cockpit_subnode(rear_wing_drs_node_path, "RearWing_DRS")
	_steering_wheel_node = _resolve_cockpit_subnode(steering_wheel_node_path, "SteeringWheel")
	_driver_arms_gloves_node = _resolve_cockpit_subnode(driver_arms_gloves_node_path, "DriverArms_Gloves")
	_cockpit_dash_node = _resolve_cockpit_subnode(cockpit_dash_node_path, "CockpitDash")
	_cockpit_tub_node = _resolve_cockpit_subnode(cockpit_tub_node_path, "CockpitTub_Interior")
	_halo_titanium_node = _resolve_cockpit_subnode(halo_titanium_node_path, "Halo_Titanium")
	_wing_mirror_l_node = _resolve_cockpit_subnode(wing_mirror_l_node_path, "WingMirror_L")
	_wing_mirror_r_node = _resolve_cockpit_subnode(wing_mirror_r_node_path, "WingMirror_R")
	_driver_helmet_node = _resolve_cockpit_subnode(driver_helmet_node_path, "DriverHelmet")

	for c_key: String in CORNER_KEYS:
		_wheel_nodes[c_key] = get_node_or_null(NodePath("Wheel_" + c_key)) as Node3D
		if _wheel_nodes[c_key] == null:
			_wheel_nodes[c_key] = get_node_or_null(NodePath("Body/Wheel_" + c_key)) as Node3D

		_susp_nodes[c_key] = get_node_or_null(NodePath("Suspension_" + c_key)) as Node3D
		if _susp_nodes[c_key] == null:
			_susp_nodes[c_key] = get_node_or_null(NodePath("Body/Suspension_" + c_key)) as Node3D

		_disc_nodes[c_key] = get_node_or_null(NodePath("BrakeDisc_" + c_key)) as Node3D
		if _disc_nodes[c_key] == null and _wheel_nodes[c_key] != null:
			_disc_nodes[c_key] = _wheel_nodes[c_key].get_node_or_null(NodePath("BrakeDisc_" + c_key)) as Node3D

		_caliper_nodes[c_key] = get_node_or_null(NodePath("BrakeCaliper_" + c_key)) as Node3D
		if _caliper_nodes[c_key] == null and _susp_nodes[c_key] != null:
			_caliper_nodes[c_key] = _susp_nodes[c_key].get_node_or_null(NodePath("BrakeCaliper_" + c_key)) as Node3D

		if _disc_nodes[c_key] is MeshInstance3D:
			var mi: MeshInstance3D = _disc_nodes[c_key] as MeshInstance3D
			var mat: Material = mi.get_active_material(0)
			if mat is StandardMaterial3D:
				var dup_mat: StandardMaterial3D = mat.duplicate() as StandardMaterial3D
				dup_mat.emission_enabled = true
				mi.set_surface_override_material(0, dup_mat)
				_disc_materials[c_key] = dup_mat


func _update_total_vehicle_mass() -> void:
	var fuel_mult: float = clampf(float(perf_mods.get("fuel_load_mult", 1.0)), 0.65, 1.40)
	var fuel_mass: float = maxf(0.0, fuel_laps_remaining) * fuel_kg_per_lap * fuel_mult
	mass = dry_mass_kg + fuel_mass


# ----------------------------------------------------------------------------
# 5. PUBLIC CONTROL & SHIFTING API (CALLED BY CONTROLS OR AI DIRECTOR)
# ----------------------------------------------------------------------------
func set_driver_inputs(
	in_steer: float,
	in_throttle: float,
	in_brake: float,
	in_drs: bool = false,
	in_ers_overtake: bool = false
) -> void:
	steer_input = 0.0 if absf(in_steer) < 0.002 else clampf(in_steer, -1.0, 1.0)
	throttle_input = clampf(in_throttle, 0.0, 1.0)
	brake_input = clampf(in_brake, 0.0, 1.0)
	drs_requested = in_drs
	ers_overtake_requested = in_ers_overtake


func apply_ai_control_frame(ctrl: Dictionary) -> void:
	if ctrl.is_empty():
		return
	set_driver_inputs(
		float(ctrl.get("steer", 0.0)),
		float(ctrl.get("throttle", 0.0)),
		float(ctrl.get("brake", 0.0)),
		bool(ctrl.get("request_drs", false)),
		bool(ctrl.get("request_ers_overtake", false))
	)
	if gearbox_mode == "MANUAL_8SPD" and ctrl.has("target_gear"):
		var tgt_g: int = int(ctrl.get("target_gear", gear))
		if tgt_g > gear and shift_cooldown <= 0.0:
			shift_gear_manual(1)
		elif tgt_g < gear and shift_cooldown <= 0.0:
			shift_gear_manual(-1)


func shift_gear_manual(direction: int) -> void:
	if direction == 0 and gearbox_mode == "AUTO_8SPD":
		return
	var max_gear: int = 2 if gearbox_mode == "CLASSIC_2SPD" else 8
	var step: int = 1 if direction >= 0 else -1
	var next_g: int = clampi(gear + step, 1, max_gear)
	if next_g == gear:
		return

	if step < 0 and gearbox_mode != "CLASSIC_2SPD":
		var target_top: float = EIGHT_SPEED_TOPS_KMH[next_g - 1]
		if speed_kmh > target_top + 12.0:
			over_rev_timer = 0.42
			over_rev_warning.emit(rpm)
			return

	gear = next_g
	shift_cooldown = 0.38 if gearbox_mode == "AUTO_8SPD" else 0.14
	if step > 0:
		gear_shifted.emit(gear, "UP", rpm)
	else:
		rev_blip_timer = 0.125
		corner_exit_torque_timer = 0.28
		gear_shifted.emit(gear, "DOWN", rpm)
		if speed_kmh > 110.0:
			exhaust_backfire.emit(clampf(speed_kmh / 300.0, 0.4, 1.0))


func get_self_aligning_torque() -> float:
	return self_aligning_torque_norm


func get_telemetry_snapshot() -> Dictionary:
	return {
		"speed_kmh": speed_kmh,
		"rpm": rpm,
		"gear": gear,
		"gearbox_mode": gearbox_mode,
		"turbo_boost_bar": turbo_boost_bar,
		"ers_charge": ers_charge,
		"ers_deploying": ers_deploying,
		"drs_active": drs_active,
		"in_slipstream": in_slipstream,
		"slipstream_factor": maxf(slipstream_factor, tow_reservoir),
		"steer_angle_rad": steer_angle_rad,
		"self_aligning_torque": self_aligning_torque_norm,
		"front_aligning_torque": self_aligning_torque_norm,
		"chassis_pitch_rad": chassis_pitch_rad,
		"chassis_roll_rad": chassis_roll_rad,
		"wheel_compression": wheel_compression.duplicate(),
		"tire_temps_c": tire_temps_c.duplicate(),
		"tire_core_temps_c": tire_core_temps_c.duplicate(),
		"lat_g": lat_g,
		"long_g": long_g,
		"skid_intensity": skid_intensity,
		"fuel_laps": fuel_laps_remaining,
		"compound": compound_id,
		"wheels": wheel_states.duplicate(true),
		"damage": damage_state.duplicate(true),
	}


# ----------------------------------------------------------------------------
# 6. MASTER 240HZ PHYSICS STEP (_physics_process & _integrate_forces)
# ----------------------------------------------------------------------------
func _physics_process(dt: float) -> void:
	if dt <= 0.0 or is_nan(dt):
		return
	var safe_dt: float = minf(dt, 0.025)

	# 0. Basis vectors (-Z is forward in Godot 4, +X is right, +Y is up)
	var basis_xform: Basis = global_transform.basis
	var forward_dir: Vector3 = -basis_xform.z.normalized()
	var right_dir: Vector3 = basis_xform.x.normalized()
	var up_dir: Vector3 = basis_xform.y.normalized()

	forward_speed_mps = linear_velocity.dot(forward_dir)
	lateral_speed_mps = linear_velocity.dot(right_dir)
	speed_kmh = maxf(0.0, forward_speed_mps * 3.6)
	total_distance_m += maxf(0.0, forward_speed_mps) * safe_dt

	var accel_world: Vector3 = (linear_velocity - _prev_linear_velocity) / safe_dt
	_prev_linear_velocity = linear_velocity
	long_g = accel_world.dot(forward_dir) / 9.81
	lat_g = accel_world.dot(right_dir) / 9.81

	# Timers decay
	if shift_cooldown > 0.0:
		shift_cooldown = maxf(0.0, shift_cooldown - safe_dt)
	if rev_blip_timer > 0.0:
		rev_blip_timer = maxf(0.0, rev_blip_timer - safe_dt)
	if corner_exit_torque_timer > 0.0:
		corner_exit_torque_timer = maxf(0.0, corner_exit_torque_timer - safe_dt)
	if over_rev_timer > 0.0:
		over_rev_timer = maxf(0.0, over_rev_timer - safe_dt)
	if aquaplane_timer > 0.0:
		aquaplane_timer = maxf(0.0, aquaplane_timer - safe_dt)
	if _rub_cooldown > 0.0:
		_rub_cooldown = maxf(0.0, _rub_cooldown - safe_dt)

	# 1. Detect 3D Slipstream Draft Pocket (48m Forward Raycast Cone) & DRS State
	_update_slipstream_and_drs(safe_dt, forward_dir, right_dir, up_dir)

	# 2. Apply Speed-Squared Spatial Downforce (Front/Rear CoP) & Parasitic Aero Drag
	_apply_aerodynamic_forces(forward_dir, up_dir)

	# 3. Solve 4-Corner Raycast Suspension (F = -kx - cv), Sawtooth Kerbs & Anti-Roll Bars
	var space_state: PhysicsDirectSpaceState3D = get_world_3d().direct_space_state
	_solve_four_corner_suspension(space_state, safe_dt, up_dir)

	# 4. Seamless 8-Speed Auto Gearbox, Sawtooth RPM, Split-Turbo + MGU-K ERS & E-Diff
	var wheel_drive_torques: Dictionary = _solve_drivetrain_and_ediff(safe_dt)

	# 5. Solve Pacejka Combined-Slip 4-Corner Tires, Dual-Layer Surface/Core Thermals & SAT
	_solve_four_corner_tires(safe_dt, forward_dir, right_dir, up_dir, wheel_drive_torques)

	# 6. Solve 3D Chassis Pitch/Roll Attitude & Sync Visual 3D Hierarchy Nodes
	_update_chassis_attitude_and_compression(safe_dt)
	_sync_visual_hierarchy(safe_dt)


## Ultra-Clean Non-Glitchy Wheel-to-Wheel Rubbing Restitution Solver
## Prevents open-wheel rigidbodies from launching vertically or flip-spinning on sidepod/tire rubs
## while preserving >95% forward racing momentum and low-bounce lateral restitution (e = 0.16).
func _integrate_forces(state: PhysicsDirectBodyState3D) -> void:
	var contact_count: int = state.get_contact_count()
	if contact_count <= 0:
		return

	var basis_xform: Basis = state.transform.basis
	var fwd_dir: Vector3 = -basis_xform.z.normalized()
	var right_dir: Vector3 = basis_xform.x.normalized()
	var up_dir: Vector3 = basis_xform.y.normalized()

	for i: int in range(contact_count):
		var collider_obj: Object = state.get_contact_collider_object(i)
		if not (collider_obj is RigidBody3D) or collider_obj == self:
			continue

		var other_body: RigidBody3D = collider_obj as RigidBody3D
		var contact_normal: Vector3 = state.get_contact_local_normal(i).normalized()
		# Ignore ground-like normals; target side-by-side / nose-to-diffuser vehicle contacts
		if absf(contact_normal.dot(up_dir)) > 0.68:
			continue

		var contact_pos: Vector3 = state.get_contact_local_position(i)
		var other_vel: Vector3 = state.get_contact_collider_velocity_at_position(i)
		var my_vel: Vector3 = state.linear_velocity
		var rel_vel: Vector3 = my_vel - other_vel
		var normal_closing_speed: float = rel_vel.dot(contact_normal)

		# 1. Suppress open-wheel vertical vaulting & pitch/roll flip spikes on vehicle contact
		if state.linear_velocity.y > 1.35:
			state.linear_velocity.y = 1.35
		var local_ang: Vector3 = basis_xform.inverse() * state.angular_velocity
		local_ang.x = clampf(local_ang.x, -0.55, 0.55) # pitch anti-flip
		local_ang.z = clampf(local_ang.z, -0.65, 0.65) # roll anti-flip
		local_ang.y = clampf(local_ang.y, -1.25, 1.25) # yaw anti-spin-glitch
		state.angular_velocity = basis_xform * local_ang

		# 2. Apply clean low-bounce lateral rubbing restitution (e = 0.16) preserving >95% forward speed
		var lat_rel: float = rel_vel.dot(right_dir)
		var side_sign: float = signf((global_position - other_body.global_position).dot(right_dir))
		if side_sign == 0.0:
			side_sign = 1.0
		if lat_rel * side_sign < 0.0:
			var target_lat_v: float = other_vel.dot(right_dir) - lat_rel * 0.16 + side_sign * 1.15
			var cur_fwd_v: float = state.linear_velocity.dot(fwd_dir) * 0.985
			var cur_up_v: float = minf(state.linear_velocity.y, 0.85)
			state.linear_velocity = fwd_dir * cur_fwd_v + right_dir * clampf(target_lat_v, -14.0, 14.0) + Vector3.UP * cur_up_v

		if _rub_cooldown <= 0.0 and absf(normal_closing_speed) * 3.6 > 8.0:
			_rub_cooldown = 0.14
			wheel_rub_contact.emit(absf(normal_closing_speed) * 3.6, contact_pos)


# ----------------------------------------------------------------------------
# 7. SPATIAL AERODYNAMICS: DOWNFORCE, DRAG & 48M SLIPSTREAM RAYCAST CONE
# ----------------------------------------------------------------------------
func _update_slipstream_and_drs(
	dt: float,
	forward_dir: Vector3,
	right_dir: Vector3,
	up_dir: Vector3
) -> void:
	var raw_wake: float = 0.0
	if not in_pit_lane and speed_kmh > 125.0 and get_world_3d() != null:
		var space: PhysicsDirectSpaceState3D = get_world_3d().direct_space_state
		var origin: Vector3 = global_position + up_dir * 0.45 + forward_dir * 2.1
		var lateral_offsets: Array[float] = [-1.15, -0.55, 0.0, 0.55, 1.15]

		for lat_off: float in lateral_offsets:
			var ray_start: Vector3 = origin + right_dir * lat_off
			var ray_end: Vector3 = ray_start + forward_dir * slipstream_max_dist_m
			var query: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(ray_start, ray_end)
			query.exclude = [get_rid()]
			var hit: Dictionary = space.intersect_ray(query)
			if not hit.is_empty():
				var collider: Object = hit.get("collider")
				if collider is RigidBody3D:
					var dist_m: float = ray_start.distance_to(hit["position"])
					if dist_m > 4.5 and dist_m < slipstream_max_dist_m:
						var dist_factor: float = 1.0 - (dist_m - 4.5) / (slipstream_max_dist_m - 4.5)
						var align_factor: float = 1.0 - absf(lat_off) / slipstream_corridor_half_width_m
						raw_wake = maxf(raw_wake, clampf(dist_factor * align_factor, 0.0, 1.0))

	var shaped_wake: float = pow(raw_wake, 0.72) if raw_wake > 0.01 else 0.0
	slipstream_factor = shaped_wake

	if shaped_wake >= tow_reservoir:
		tow_reservoir = minf(1.15, tow_reservoir + (shaped_wake - tow_reservoir) * minf(1.0, dt * 7.5))
	elif throttle_input > 0.60 and brake_input < 0.08 and speed_kmh > 170.0 and not in_pit_lane:
		tow_reservoir = maxf(0.0, tow_reservoir - dt * 0.62)
	else:
		tow_reservoir = maxf(0.0, tow_reservoir - dt * 2.8)

	var active_tow: float = maxf(shaped_wake, tow_reservoir)
	in_slipstream = active_tow > 0.15 and speed_kmh > 140.0 and not in_pit_lane

	# DRS activation rules (dry conditions, >195 km/h, straight steering, throttle >0.72, no braking)
	var drs_allowed: bool = (
		gearbox_mode != "CLASSIC_2SPD"
		and not in_pit_lane
		and not vsc_active
		and global_wetness < 0.15
		and throttle_input > 0.72
		and brake_input < 0.05
		and absf(steer_input) < 0.10
		and speed_kmh > 195.0
		and (in_slipstream or drs_requested)
	)
	drs_active = drs_allowed


func _apply_aerodynamic_forces(forward_dir: Vector3, up_dir: Vector3) -> void:
	var v_sq: float = forward_speed_mps * absf(forward_speed_mps)
	if absf(v_sq) < 0.5:
		return

	var q_dyn: float = 0.5 * air_density_rho * v_sq * frontal_area_m2
	var fw_dmg: float = clampf(float(damage_state.get("front_wing", 0.0)), 0.0, 1.0)
	var rw_dmg: float = clampf(float(damage_state.get("rear_wing", 0.0)), 0.0, 1.0)
	var aero_grip_mod: float = clampf(float(perf_mods.get("aero_grip_mult", 1.0)), 0.80, 1.25)

	# Front & Rear Downforce: F_d = 0.5 * rho * v^2 * C_L * A
	var front_cl: float = lift_coeff_cl_base * front_aero_balance * (1.0 - fw_dmg * 0.42) * aero_grip_mod
	var rear_drs_trim: float = (1.0 - drs_cl_rear_reduction) if drs_active else 1.0
	var rear_cl: float = lift_coeff_cl_base * (1.0 - front_aero_balance) * (1.0 - rw_dmg * 0.45) * rear_drs_trim * aero_grip_mod

	var front_downforce_n: float = maxf(0.0, q_dyn * front_cl)
	var rear_downforce_n: float = maxf(0.0, q_dyn * rear_cl)

	var front_cop_world: Vector3 = global_transform.basis * front_cop_offset
	var rear_cop_world: Vector3 = global_transform.basis * rear_cop_offset
	apply_force(-up_dir * front_downforce_n, front_cop_world)
	apply_force(-up_dir * rear_downforce_n, rear_cop_world)

	# Parasitic Aerodynamic Drag: F_drag = 0.5 * rho * v^2 * C_D * A (reduced in 48m slipstream & DRS)
	var active_tow: float = maxf(slipstream_factor, tow_reservoir)
	var drs_drag_trim: float = drs_cd_reduction if drs_active else 0.0
	var tow_drag_trim: float = active_tow * 0.22
	var dmg_drag_penalty: float = (fw_dmg + rw_dmg) * 0.14
	var eff_cd: float = maxf(0.48, drag_coeff_cd_base - drs_drag_trim - tow_drag_trim + dmg_drag_penalty)

	var drag_force_n: float = q_dyn * eff_cd
	apply_central_force(-forward_dir * drag_force_n)


# ----------------------------------------------------------------------------
# 8. 4-CORNER RAYCAST SUSPENSION (F = -k*x - c*v), SAWTOOTH KERBS & ARBs
# ----------------------------------------------------------------------------
func _solve_four_corner_suspension(
	space: PhysicsDirectSpaceState3D,
	dt: float,
	up_dir: Vector3
) -> void:
	var max_ray_len: float = suspension_rest_length_m + suspension_max_travel_m + wheel_radius_m
	var kerb_saw_wave: float = sin(total_distance_m * 22.5)

	for c_key: String in CORNER_KEYS:
		var w_state: Dictionary = wheel_states[c_key]
		var local_hp: Vector3 = CORNER_HARDPOINTS[c_key]
		var world_hp: Vector3 = to_global(local_hp)
		var ray_end: Vector3 = world_hp - up_dir * max_ray_len

		var query: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(world_hp, ray_end)
		query.exclude = [get_rid()]
		var hit: Dictionary = space.intersect_ray(query) if space != null else {}

		w_state["prev_compression_m"] = w_state["compression_m"]

		if not hit.is_empty():
			var hit_pos: Vector3 = hit["position"]
			var hit_normal: Vector3 = (hit["normal"] as Vector3).normalized()
			var dist_to_ground: float = world_hp.distance_to(hit_pos)

			var collider_obj: Object = hit.get("collider")
			var surf_info: Dictionary = _sample_surface_friction(collider_obj)
			var is_curb: bool = surf_info["group"] == "surface_curb"
			var kerb_step_m: float = (0.0065 + 0.0055 * kerb_saw_wave) if is_curb else 0.0

			var susp_len: float = clampf(
				dist_to_ground - wheel_radius_m - kerb_step_m,
				suspension_rest_length_m - suspension_max_travel_m,
				suspension_rest_length_m + suspension_max_travel_m
			)
			var compression: float = suspension_rest_length_m - susp_len
			var compression_vel: float = (compression - float(w_state["prev_compression_m"])) / dt

			var is_front: bool = c_key.begins_with("F")
			var k_spring: float = front_spring_stiffness_nm if is_front else rear_spring_stiffness_nm
			var c_damp: float = (
				(front_bump_damping_nsm if compression_vel >= 0.0 else front_rebound_damping_nsm)
				if is_front
				else (rear_bump_damping_nsm if compression_vel >= 0.0 else rear_rebound_damping_nsm)
			)

			# Project along 3D track banking normal
			var banking_cos: float = maxf(0.35, hit_normal.dot(up_dir))
			var spring_force_n: float = maxf(0.0, (k_spring * compression + c_damp * compression_vel) * banking_cos)

			w_state["grounded"] = true
			w_state["compression_m"] = compression
			w_state["compression_norm"] = clampf(0.25 + (compression / maxf(0.02, suspension_max_travel_m)) * 0.75, 0.0, 1.0)
			w_state["contact_point"] = hit_pos
			w_state["contact_normal"] = hit_normal
			w_state["normal_load_n"] = spring_force_n
			w_state["surface_group"] = surf_info["group"]
			w_state["surface_mu"] = surf_info["mu"]
			if is_curb and speed_kmh > 65.0:
				kerb_rumble_step.emit(c_key, clampf(speed_kmh / 260.0, 0.25, 1.0))
		else:
			w_state["grounded"] = false
			w_state["compression_m"] = 0.0
			w_state["compression_norm"] = 0.0
			w_state["normal_load_n"] = 0.0
			w_state["contact_normal"] = up_dir

	# Apply Front & Rear Anti-Roll Bar (ARB) load transfer and commit 3D suspension forces
	_apply_anti_roll_and_commit_suspension("FL", "FR", front_arb_stiffness_nm)
	_apply_anti_roll_and_commit_suspension("RL", "RR", rear_arb_stiffness_nm)


func _apply_anti_roll_and_commit_suspension(left_key: String, right_key: String, arb_k: float) -> void:
	var wl: Dictionary = wheel_states[left_key]
	var wr: Dictionary = wheel_states[right_key]
	var diff_comp: float = float(wl["compression_m"]) - float(wr["compression_m"])
	var arb_force_n: float = diff_comp * arb_k

	if bool(wl["grounded"]):
		var fl_n: float = maxf(0.0, float(wl["normal_load_n"]) + arb_force_n)
		wl["normal_load_n"] = fl_n
		var offset_l: Vector3 = global_transform.basis * CORNER_HARDPOINTS[left_key]
		apply_force((wl["contact_normal"] as Vector3) * fl_n, offset_l)

	if bool(wr["grounded"]):
		var fr_n: float = maxf(0.0, float(wr["normal_load_n"]) - arb_force_n)
		wr["normal_load_n"] = fr_n
		var offset_r: Vector3 = global_transform.basis * CORNER_HARDPOINTS[right_key]
		apply_force((wr["contact_normal"] as Vector3) * fr_n, offset_r)


func _sample_surface_friction(collider_obj: Object) -> Dictionary:
	if collider_obj is Node:
		var node: Node = collider_obj as Node
		for grp_name: String in SURFACE_FRICTION_TABLE.keys():
			if node.is_in_group(grp_name) or (node.get_parent() != null and node.get_parent().is_in_group(grp_name)):
				return {"group": grp_name, "mu": float(SURFACE_FRICTION_TABLE[grp_name])}
	if global_wetness > 0.25:
		return {"group": "surface_wet", "mu": float(SURFACE_FRICTION_TABLE["surface_wet"])}
	return {"group": "surface_asphalt", "mu": float(SURFACE_FRICTION_TABLE["surface_asphalt"])}


# ----------------------------------------------------------------------------
# 9. SEAMLESS 8-SPEED DRIVETRAIN, SPLIT-TURBO + MGU-K ERS & SALISBURY E-DIFF
# ----------------------------------------------------------------------------
func _solve_drivetrain_and_ediff(dt: float) -> Dictionary:
	var is_8spd: bool = gearbox_mode == "AUTO_8SPD" or gearbox_mode == "MANUAL_8SPD"
	var max_gear: int = 8 if is_8spd else 2
	gear = clampi(gear, 1, max_gear)

	# Automatic 8-Speed Seamless Shifting with Corner Hysteresis & Downshift Blips
	if gearbox_mode == "AUTO_8SPD" and shift_cooldown <= 0.0:
		if in_pit_lane:
			if gear > 2 and speed_kmh <= maxf(96.0, EIGHT_SPEED_DOWNSHIFT_KMH[gear - 2]):
				gear -= 1
				shift_cooldown = 0.11
				rev_blip_timer = 0.11
				gear_shifted.emit(gear, "DOWN", rpm)
			elif gear == 2 and speed_kmh <= 50.0:
				gear = 1
				shift_cooldown = 0.14
				gear_shifted.emit(1, "DOWN", rpm)
			elif gear == 1 and throttle_input > 0.18 and speed_kmh >= 72.0:
				gear = 2
				shift_cooldown = 0.18
				gear_shifted.emit(2, "UP", rpm)
		else:
			var corner_hold: float = 3.0 if (absf(steer_input) > 0.62 and throttle_input < 0.65) else 0.0
			var brake_downshift_bias: float = brake_input * 6.5 if brake_input > 0.25 else 0.0
			var up_spd: float = EIGHT_SPEED_UPSHIFT_KMH[gear - 1] + corner_hold if gear < 8 else INF
			var dn_spd: float = EIGHT_SPEED_DOWNSHIFT_KMH[gear - 2] + brake_downshift_bias if gear > 1 else -1.0

			if gear < 8 and throttle_input > 0.16 and brake_input < 0.20 and speed_kmh >= up_spd:
				gear += 1
				shift_cooldown = 0.15
				gear_shifted.emit(gear, "UP", rpm)
			elif gear > 1 and speed_kmh <= dn_spd:
				gear -= 1
				shift_cooldown = 0.11
				rev_blip_timer = 0.125
				corner_exit_torque_timer = 0.28
				gear_shifted.emit(gear, "DOWN", rpm)
				if speed_kmh > 115.0 and brake_input > 0.25:
					exhaust_backfire.emit(clampf(speed_kmh / 290.0, 0.45, 1.0))

	# Mechanical Gear-Ratio Sawtooth RPM Synthesis (3,800 -> 13,800 RPM)
	var target_rpm: float = F1_IDLE_RPM
	if over_rev_timer > 0.0:
		target_rpm = 13650.0
	elif is_8spd:
		var g_idx: int = clampi(gear - 1, 0, 7)
		var g_top: float = EIGHT_SPEED_TOPS_KMH[g_idx]
		var mech_rpm: float = F1_IDLE_RPM
		if g_idx == 0:
			var wheel_rpm: float = (speed_kmh / g_top) * F1_SHIFT_PEAK_RPM
			mech_rpm = maxf(F1_IDLE_RPM + throttle_input * 2700.0, wheel_rpm)
		else:
			var v_entry: float = EIGHT_SPEED_UPSHIFT_KMH[g_idx - 1]
			var entry_rpm: float = EIGHT_SPEED_ENTRY_RPM[g_idx]
			var peak_rpm: float = F1_TOP_GEAR_RPM if g_idx == 7 else F1_SHIFT_PEAK_RPM
			if speed_kmh >= g_top:
				mech_rpm = peak_rpm + (speed_kmh - g_top) * 24.0
			elif speed_kmh >= v_entry:
				mech_rpm = entry_rpm + ((speed_kmh - v_entry) / maxf(8.0, g_top - v_entry)) * (peak_rpm - entry_rpm)
			else:
				var direct_rpm: float = (speed_kmh / g_top) * peak_rpm * 0.96
				var map_rpm: float = F1_IDLE_RPM + (speed_kmh / maxf(20.0, v_entry)) * (entry_rpm - F1_IDLE_RPM)
				mech_rpm = maxf(map_rpm, direct_rpm)

		var blip_env: float = sin((rev_blip_timer / 0.125) * PI) if rev_blip_timer > 0.0 else 0.0
		var blip_boost: float = blip_env * (1620.0 + brake_input * 420.0)
		target_rpm = clampf(mech_rpm + blip_boost, 3600.0, F1_REV_LIMIT_RPM)
	else:
		var classic_top: float = 172.0 if gear == 1 else 308.0
		target_rpm = clampf(3600.0 + (speed_kmh / classic_top) * 9150.0, 3600.0, 13400.0)

	var rpm_rate: float = 78.0 if rev_blip_timer > 0.02 else (62.0 if (target_rpm < rpm and shift_cooldown > 0.04) else 52.0)
	rpm += (target_rpm - rpm) * minf(1.0, dt * rpm_rate)

	# Fuel consumption & mass update
	if not in_pit_lane and throttle_input > 0.02 and forward_speed_mps > 1.0:
		fuel_laps_remaining = maxf(0.0, fuel_laps_remaining - (forward_speed_mps * dt / 4200.0) * (0.78 + 0.30 * throttle_input))
		_update_total_vehicle_mass()

	# V6 Split-Turbo Boost (0.0..2.40 bar) with MGU-H Anti-Lag & MGU-K ERS Harvest/Deploy
	var rpm_norm: float = clampf((rpm - 3800.0) / 9200.0, 0.0, 1.0)
	var mguh_anti_lag: float = 0.54 if rev_blip_timer > 0.0 else 0.0
	var target_boost_bar: float = clampf(
		maxf(throttle_input * (0.35 + 0.65 * rpm_norm), mguh_anti_lag) * 2.40,
		0.0,
		2.40
	)
	var boost_rate: float = 9.5 if target_boost_bar >= turbo_boost_bar else 5.2
	turbo_boost_bar = clampf(turbo_boost_bar + (target_boost_bar - turbo_boost_bar) * minf(1.0, dt * boost_rate), 0.0, 2.40)

	var active_tow: float = maxf(slipstream_factor, tow_reservoir)
	if brake_input > 0.12 and speed_kmh > 55.0:
		ers_charge = minf(1.0, ers_charge + brake_input * 0.068 * dt)
		ers_deploying = false
	elif throttle_input < 0.15 and rpm > 8200.0:
		ers_charge = minf(1.0, ers_charge + 0.022 * dt)
		ers_deploying = false
	elif not in_pit_lane and ers_charge > 0.04 and (ers_overtake_requested or (throttle_input > 0.86 and (corner_exit_torque_timer > 0.0 or active_tow > 0.20 or drs_active))):
		ers_deploying = true
		ers_charge = maxf(0.0, ers_charge - (0.055 if ers_overtake_requested else 0.036) * dt)
	else:
		ers_deploying = false

	# Hybrid V6 + MGU-K Torque Curve & Soft Asymptotic Top-Speed Aero Ceiling
	var g_ratio: float = EIGHT_SPEED_GEAR_RATIOS[clampi(gear - 1, 0, 7)] if is_8spd else (2.45 if gear == 1 else 1.12)
	var torque_envelope: float = (0.80 + 0.24 * sin(rpm_norm * PI)) * (0.94 + 0.06 * (turbo_boost_bar / 2.40))
	var exit_punch: float = (1.08 if corner_exit_torque_timer > 0.0 else 1.0) * (1.06 if ers_deploying else 1.0)
	var mod_power: float = clampf(float(perf_mods.get("power_mult", 1.0)), 0.75, 1.25)

	var tow_bonus_kmh: float = active_tow * (16.0 + float(perf_mods.get("drs_bonus_kmh", 0.0)))
	var gear_cap_kmh: float = (EIGHT_SPEED_TOPS_KMH[clampi(gear - 1, 0, 7)] if is_8spd else (172.0 if gear == 1 else 308.0)) + tow_bonus_kmh + float(perf_mods.get("top_speed_bonus_kmh", 0.0))
	if in_pit_lane:
		gear_cap_kmh = minf(gear_cap_kmh, 80.0)
	elif vsc_active:
		gear_cap_kmh = minf(gear_cap_kmh, 160.0)

	var limiter_taper: float = 1.0
	if gear == max_gear or gearbox_mode != "AUTO_8SPD" or in_pit_lane or vsc_active:
		limiter_taper = clampf((gear_cap_kmh - speed_kmh) / 5.5, 0.0, 1.0)

	var engine_torque_nm: float = 0.0
	if throttle_input > 0.01:
		var max_ice_mguk_nm: float = (peak_engine_power_kw * 1000.0) / maxf(520.0, rpm * TAU / 60.0)
		engine_torque_nm = throttle_input * max_ice_mguk_nm * torque_envelope * exit_punch * mod_power * limiter_taper
	else:
		# Natural F1 engine & MGU-K regeneration braking torque on lift-off
		engine_torque_nm = -165.0 * (0.5 + 0.5 * rpm_norm)

	var total_axle_torque_nm: float = engine_torque_nm * g_ratio * final_drive_ratio

	# Salisbury Electronic Limited-Slip Differential (E-Diff) split between RL and RR
	var rl_w: float = float(wheel_states["RL"]["angular_vel_rads"])
	var rr_w: float = float(wheel_states["RR"]["angular_vel_rads"])
	var delta_w: float = rl_w - rr_w
	var lock_coeff: float = diff_power_lock if total_axle_torque_nm >= 0.0 else diff_coast_lock
	var lock_transfer_nm: float = clampf(
		delta_w * 95.0 * lock_coeff,
		-(absf(total_axle_torque_nm) * lock_coeff + diff_preload_nm),
		absf(total_axle_torque_nm) * lock_coeff + diff_preload_nm
	)

	return {
		"FL": 0.0,
		"FR": 0.0,
		"RL": total_axle_torque_nm * 0.5 - lock_transfer_nm,
		"RR": total_axle_torque_nm * 0.5 + lock_transfer_nm,
	}


# ----------------------------------------------------------------------------
# 10. PACEJKA COMBINED-SLIP TIRES, DUAL-LAYER SURFACE/CORE THERMALS & SAT
# ----------------------------------------------------------------------------
func _pacejka_magic(slip_val: float, b_stiff: float, c_shape: float, e_curv: float) -> float:
	var bx: float = b_stiff * slip_val
	return sin(c_shape * atan(bx - e_curv * (bx - atan(bx))))


func _solve_four_corner_tires(
	dt: float,
	forward_dir: Vector3,
	right_dir: Vector3,
	up_dir: Vector3,
	drive_torques: Dictionary
) -> void:
	# Speed-sensitive steering with low-speed Ackermann turn-in (< 138 km/h) & high-speed calm (> 250 km/h)
	var kv: float = 0.00015
	var non_lin_steer: float = 0.0
	if steer_input != 0.0:
		non_lin_steer = signf(steer_input) * pow(absf(steer_input), 1.32) / (1.0 + kv * forward_speed_mps * forward_speed_mps)

	var agility_mod: float = clampf(float(perf_mods.get("agility_mult", 1.0)), 0.85, 1.25)
	var hairpin_boost: float = 1.0 + (1.0 - clampf(speed_kmh / 138.0, 0.0, 1.0)) * 0.22 if speed_kmh < 138.0 else 1.0
	var high_speed_calm: float = 1.0 - clampf((speed_kmh - 250.0) / 120.0, 0.0, 0.12) if speed_kmh > 250.0 else 1.0
	var max_steer_rad: float = deg_to_rad(24.0) * hairpin_boost * high_speed_calm * agility_mod
	steer_angle_rad = non_lin_steer * max_steer_rad

	var comp_spec: Dictionary = TIRE_COMPOUND_SPECS.get(compound_id, TIRE_COMPOUND_SPECS["SOFT"])
	var base_comp_mu: float = float(comp_spec["base_grip"])
	var is_wet_tire: bool = bool(comp_spec["is_wet"])
	var mod_brake: float = clampf(float(perf_mods.get("brake_mult", 1.0)), 0.80, 1.25)
	var mod_wear: float = clampf(float(perf_mods.get("tire_wear_mult", 1.0)), 0.50, 1.50)
	var thermal_bonus_c: float = clampf(float(perf_mods.get("thermal_window_bonus_c", 0.0)), 0.0, 12.0)
	var wet_grip_bonus: float = clampf(float(perf_mods.get("wet_grip_bonus", 0.0)), 0.0, 0.25)

	# Standing-water aquaplaning check on dry slicks in heavy rain
	if not is_wet_tire and global_wetness > 0.55 and speed_kmh > 185.0 and aquaplane_timer <= 0.0:
		aquaplane_timer = 0.55
		hydroplane_triggered.emit(speed_kmh)

	var front_sat_accum_nm: float = 0.0
	var front_slip_sum: float = 0.0
	var rear_slip_sum: float = 0.0
	var max_corner_skid: float = 0.0

	for idx: int in range(CORNER_KEYS.size()):
		var c_key: String = CORNER_KEYS[idx]
		var w_state: Dictionary = wheel_states[c_key]
		var is_front: bool = c_key.begins_with("F")
		var is_left: bool = c_key.ends_with("L")

		# Update brake disc thermal glow (cherry-red to incandescent orange-gold)
		var target_glow: float = clampf(brake_input * (speed_kmh / 295.0) * (1.15 if is_front else 0.85), 0.0, 1.0) if (brake_input > 0.15 and speed_kmh > 70.0) else 0.0
		var cur_glow: float = float(w_state["brake_glow"])
		var glow_rate: float = 7.5 if target_glow > cur_glow else 2.85
		w_state["brake_glow"] = clampf(cur_glow + (target_glow - cur_glow) * minf(1.0, dt * glow_rate), 0.0, 1.0)

		if not bool(w_state["grounded"]) or float(w_state["normal_load_n"]) <= 1.0:
			w_state["lat_force_n"] = 0.0
			w_state["long_force_n"] = 0.0
			w_state["slip_angle_rad"] = 0.0
			w_state["slip_ratio"] = 0.0
			# Air cooling while unloaded/airborne
			var cur_surf_air: float = float(w_state["surface_temp_c"])
			var cur_core_air: float = float(w_state["core_temp_c"])
			cur_surf_air += (ambient_temp_c + 18.0 - cur_surf_air) * minf(1.0, dt * 0.65)
			cur_core_air += (cur_surf_air - cur_core_air) * minf(1.0, dt * 0.10)
			w_state["surface_temp_c"] = cur_surf_air
			w_state["core_temp_c"] = cur_core_air
			w_state["temp_c"] = 0.62 * cur_surf_air + 0.38 * cur_core_air
			tire_temps_c[idx] = cur_surf_air
			tire_core_temps_c[idx] = cur_core_air
			continue

		# Ackermann inner/outer front wheel angle
		var wheel_steer: float = 0.0
		if is_front and steer_angle_rad != 0.0:
			var ackermann_mult: float = 1.08 if ((steer_angle_rad > 0.0 and is_left) or (steer_angle_rad < 0.0 and not is_left)) else 0.93
			wheel_steer = steer_angle_rad * ackermann_mult

		var wheel_fwd: Vector3 = forward_dir.rotated(up_dir, -wheel_steer).normalized()
		var wheel_right: Vector3 = right_dir.rotated(up_dir, -wheel_steer).normalized()

		var r_offset: Vector3 = global_transform.basis * CORNER_HARDPOINTS[c_key]
		var v_patch: Vector3 = linear_velocity + angular_velocity.cross(r_offset)
		var v_long: float = v_patch.dot(wheel_fwd)
		var v_lat: float = v_patch.dot(wheel_right)

		# Slip Angle (alpha) & Longitudinal Slip Ratio (kappa)
		var abs_v_long: float = maxf(1.2, absf(v_long))
		var slip_angle_rad: float = atan2(-v_lat, abs_v_long) if absf(v_lat) > 0.01 else 0.0
		w_state["slip_angle_rad"] = slip_angle_rad
		if is_front:
			front_slip_sum += slip_angle_rad * 0.5
		else:
			rear_slip_sum += slip_angle_rad * 0.5

		var corner_brake_bias: float = brake_bias_front if is_front else (1.0 - brake_bias_front)
		var brake_torque_nm: float = brake_input * max_brake_torque_nm * corner_brake_bias * mod_brake * 0.5
		var drive_torque_nm: float = float(drive_torques.get(c_key, 0.0))

		var net_wheel_torque_nm: float = drive_torque_nm - signf(v_long) * brake_torque_nm
		var fz_n: float = float(w_state["normal_load_n"])
		var desired_fx_n: float = net_wheel_torque_nm / wheel_radius_m
		var raw_slip_ratio: float = clampf(desired_fx_n / maxf(500.0, fz_n * 1.45), -1.0, 1.0)
		# Braking Assist ABS modulation prevents full -1.0 lockup when enabled
		if raw_slip_ratio < -0.16 and braking_assist_mode != "OFF":
			var abs_cap: float = -0.15 if braking_assist_mode == "HIGH" else (-0.19 if braking_assist_mode == "MEDIUM" else -0.24)
			raw_slip_ratio = maxf(raw_slip_ratio, abs_cap)
		w_state["slip_ratio"] = raw_slip_ratio

		# Surface friction group + wetness + aquaplaning
		var surf_mu: float = float(w_state["surface_mu"])
		if not is_wet_tire and global_wetness > 0.05:
			surf_mu *= maxf(0.38, 1.0 - (0.48 - wet_grip_bonus) * global_wetness)
		elif is_wet_tire and global_wetness < 0.08:
			surf_mu *= 0.86
		if aquaplane_timer > 0.0 and is_front:
			surf_mu *= 0.52

		# Dual-Layer Tire Surface (~0.85s flash) & Carcass Core (~8.5s hysteresis) Thermals around 88°C–106°C
		var load_factor: float = clampf(fz_n / 2450.0, 0.35, 2.25)
		var cornering_heat: float = absf(slip_angle_rad) * abs_v_long * 2.95 * load_factor
		var lockup_spin_heat: float = absf(raw_slip_ratio) * abs_v_long * (3.65 if raw_slip_ratio < -0.18 else 2.35) * load_factor
		var wet_spray_cooling: float = global_wetness * (24.0 + speed_kmh * 0.095)
		var airflow_cooling: float = (speed_kmh / 316.0) * 9.5

		var cur_core_c: float = float(w_state["core_temp_c"])
		var cur_surf_c: float = float(w_state["surface_temp_c"])
		var eq_surf_c: float = clampf(
			cur_core_c * 0.68 + (ambient_temp_c + 30.0) * 0.32 + cornering_heat + lockup_spin_heat - wet_spray_cooling - airflow_cooling,
			ambient_temp_c + 4.0,
			158.0
		)
		var surf_rate: float = 1.35 if eq_surf_c > cur_surf_c else (0.85 + global_wetness * 0.95)
		cur_surf_c = clampf(cur_surf_c + (eq_surf_c - cur_surf_c) * minf(1.0, dt * surf_rate), 18.0, 158.0)

		var carcass_flex_heat: float = (speed_kmh / 260.0) * 14.0 * load_factor
		var eq_core_c: float = clampf(cur_surf_c * 0.86 + (ambient_temp_c + 26.0 + carcass_flex_heat) * 0.14, ambient_temp_c + 6.0, 142.0)
		cur_core_c = clampf(cur_core_c + (eq_core_c - cur_core_c) * minf(1.0, dt * 0.12), 18.0, 142.0)

		var eff_temp_c: float = 0.62 * cur_surf_c + 0.38 * cur_core_c
		w_state["surface_temp_c"] = cur_surf_c
		w_state["core_temp_c"] = cur_core_c
		w_state["temp_c"] = eff_temp_c
		tire_temps_c[idx] = cur_surf_c
		tire_core_temps_c[idx] = cur_core_c

		var opt_min: float = float(comp_spec["opt_min_c"]) - thermal_bonus_c * 0.5
		var opt_max: float = float(comp_spec["opt_max_c"]) + thermal_bonus_c * 0.5
		var temp_mult: float = 1.0
		if eff_temp_c < opt_min:
			temp_mult = maxf(0.90, 1.0 - (opt_min - eff_temp_c) * 0.0030)
		elif eff_temp_c > opt_max:
			# Blistering penalty when surface/carcass cooks past 106°C
			temp_mult = maxf(0.84, 1.0 - (eff_temp_c - opt_max) * 0.0044)

		# Wear & 25% Cliff (accelerated when overheating > opt_max + 8°C or locking brakes)
		if not in_pit_lane and abs_v_long > 2.0:
			var blister_mult: float = 1.35 if cur_surf_c > (opt_max + 8.0) else 1.0
			var wear_step: float = 0.00018 * float(comp_spec["wear_rate"]) * mod_wear * blister_mult * (0.6 + absf(slip_angle_rad) * 3.2 + absf(raw_slip_ratio) * 2.5) * dt
			w_state["life"] = maxf(0.0, float(w_state["life"]) - wear_step)

		var life_val: float = float(w_state["life"])
		var wear_mult: float = 1.0
		if life_val >= 0.25:
			wear_mult = 0.93 + 0.07 * ((life_val - 0.25) / 0.75)
		else:
			var cliff_ratio: float = maxf(0.0, life_val / 0.25)
			wear_mult = 0.45 + 0.48 * pow(cliff_ratio, 2.15)
			if not bool(w_state["punctured"]) and life_val <= 0.002:
				w_state["punctured"] = true
				damage_state["has_puncture"] = true
				tire_punctured.emit(c_key)

		if bool(w_state["punctured"]):
			wear_mult = 0.28

		# Camber thrust & Pacejka Magic Formula Combined-Slip (Lateral + Longitudinal Friction Ellipse)
		var camber_rad: float = float(CORNER_CAMBER_RAD[c_key])
		var camber_bonus: float = 1.0 + absf(camber_rad) * 0.45 * float(comp_spec["camber_stiffness"])
		var peak_mu: float = base_comp_mu * surf_mu * temp_mult * wear_mult * camber_bonus
		var f_max_n: float = fz_n * peak_mu

		var pacejka_lat: float = _pacejka_magic(slip_angle_rad, 10.8, 1.38, -0.52)
		var pacejka_long: float = _pacejka_magic(raw_slip_ratio, 12.4, 1.58, 0.12)
		var raw_fy_n: float = f_max_n * pacejka_lat
		var raw_fx_n: float = clampf(desired_fx_n, -f_max_n * absf(pacejka_long) - 120.0, f_max_n * maxf(0.82, absf(pacejka_long)))

		# Friction Ellipse Coupling: sqrt((Fx/Fmax)^2 + (Fy/Fmax)^2) <= 1.0
		var combined_mag: float = sqrt(raw_fx_n * raw_fx_n + raw_fy_n * raw_fy_n)
		if combined_mag > f_max_n and combined_mag > 0.001:
			var scale_ellipse: float = f_max_n / combined_mag
			raw_fx_n *= scale_ellipse
			raw_fy_n *= scale_ellipse

		w_state["long_force_n"] = raw_fx_n
		w_state["lat_force_n"] = raw_fy_n

		var tire_force_world: Vector3 = wheel_fwd * raw_fx_n + wheel_right * raw_fy_n
		apply_force(tire_force_world, r_offset)

		# Wheel angular velocity & spin accumulation
		var eff_w_rads: float = (v_long + raw_slip_ratio * 4.5) / wheel_radius_m
		w_state["angular_vel_rads"] = eff_w_rads
		w_state["wheel_spin_rad"] = fmod(float(w_state["wheel_spin_rad"]) + eff_w_rads * dt, TAU)

		# Front-Axle Pneumatic Trail Self-Aligning Torque (SAT)
		if is_front:
			var pneumatic_trail_m: float = 0.038 * cos(clampf(absf(slip_angle_rad) * 4.2, 0.0, PI * 0.48))
			front_sat_accum_nm += raw_fy_n * pneumatic_trail_m * 0.5

		var corner_skid: float = clampf((absf(slip_angle_rad) - 0.09) * 3.2 + maxf(0.0, absf(raw_slip_ratio) - 0.14) * 2.4, 0.0, 1.0)
		max_corner_skid = maxf(max_corner_skid, corner_skid)

	# Combine Front Pneumatic-Trail SAT + Rear Oversteer Slide-Catch Torque (strictly 0.0 on neutral straights)
	if steer_input == 0.0 and absf(lateral_speed_mps) < 0.05 and absf(angular_velocity.y) < 0.02:
		self_aligning_torque_norm = 0.0
	else:
		var oversteer_delta: float = rear_slip_sum - front_slip_sum
		var low_spd_gate: float = clampf(speed_kmh / 22.0, 0.0, 1.0)
		var combined_sat: float = (front_sat_accum_nm / 235.0) + clampf(oversteer_delta * 1.15, -0.65, 0.65)
		self_aligning_torque_norm = clampf(combined_sat * low_spd_gate, -1.0, 1.0)
	self_aligning_torque = self_aligning_torque_norm
	skid_intensity = max_corner_skid

	# Straightaway neutral yaw/lateral stabilization so steer_input == 0 tracks 100% laser-straight
	if steer_input == 0.0 and absf(lateral_speed_mps) < 0.8 and absf(angular_velocity.y) < 0.15:
		apply_central_force(-right_dir * lateral_speed_mps * mass * 18.0)
		apply_torque(-up_dir * angular_velocity.y * mass * 6.5)


# ----------------------------------------------------------------------------
# 11. 3D CHASSIS PITCH/ROLL ATTITUDE & VISUAL HIERARCHY SYNCHRONIZATION
# ----------------------------------------------------------------------------
func _update_chassis_attitude_and_compression(dt: float) -> void:
	# Update normalized 4-corner wheel compression array [FL, FR, RL, RR]
	for idx: int in range(CORNER_KEYS.size()):
		var c_key: String = CORNER_KEYS[idx]
		wheel_compression[idx] = float(wheel_states[c_key]["compression_norm"])

	var on_left_kerb: bool = (
		str(wheel_states["FL"]["surface_group"]) == "surface_curb"
		or str(wheel_states["RL"]["surface_group"]) == "surface_curb"
	)
	var on_right_kerb: bool = (
		str(wheel_states["FR"]["surface_group"]) == "surface_curb"
		or str(wheel_states["RR"]["surface_group"]) == "surface_curb"
	)
	var kerb_saw_wave: float = sin(total_distance_m * 22.5) if (on_left_kerb or on_right_kerb) else 0.0

	# Pitch: +0.028 rad nose-dive under heavy braking, -0.020 rad rear squat under launch/ERS punch
	var target_pitch_from_g: float = (
		clampf((-long_g / 4.55) * 0.028, 0.0, 0.028)
		if long_g < 0.0
		else clampf(-(long_g / 1.42) * 0.020, -0.020, 0.0)
	)
	var shift_nod: float = -0.0032 if (shift_cooldown > 0.07 and rev_blip_timer <= 0.0) else 0.0
	var target_pitch: float = clampf(target_pitch_from_g + shift_nod + kerb_saw_wave * 0.0024, -0.024, 0.030)

	var pitch_accel: float = 484.0 * (target_pitch - chassis_pitch_rad) - 36.0 * _chassis_pitch_vel
	_chassis_pitch_vel = clampf(_chassis_pitch_vel + pitch_accel * dt, -0.85, 0.85)
	chassis_pitch_rad = clampf(chassis_pitch_rad + _chassis_pitch_vel * dt, -0.026, 0.031)

	# Roll: lateral G body roll + asymmetric sawtooth FIA kerb lift on Left or Right wheels
	var kerb_roll_lift: float = (
		(0.0115 + 0.0042 * kerb_saw_wave)
		if on_left_kerb
		else (-(0.0115 + 0.0042 * kerb_saw_wave) if on_right_kerb else 0.0)
	)
	var target_roll: float = clampf(-clampf(lat_g / 4.2, -1.0, 1.0) * 0.026 + kerb_roll_lift, -0.042, 0.042)
	var roll_accel: float = 676.0 * (target_roll - chassis_roll_rad) - 42.5 * _chassis_roll_vel
	_chassis_roll_vel = clampf(_chassis_roll_vel + roll_accel * dt, -1.10, 1.10)
	chassis_roll_rad = clampf(chassis_roll_rad + _chassis_roll_vel * dt, -0.045, 0.045)


func _sync_visual_hierarchy(dt: float) -> void:
	# 0. Subtle Body chassis pitch/roll micro-attitude (complements physical suspension compression)
	if _body_node != null:
		_body_node.rotation.x = _body_rest_rot.x + chassis_pitch_rad * 0.45
		_body_node.rotation.z = _body_rest_rot.z + chassis_roll_rad * 0.45

	# 1. Articulated RearWing_DRS flap (-0.32 rad open when DRS active)
	var target_drs_rad: float = -0.32 if drs_active else 0.0
	drs_flap_angle_rad = lerpf(drs_flap_angle_rad, target_drs_rad, minf(1.0, dt * 16.0))
	if _rear_wing_drs_node != null:
		_rear_wing_drs_node.rotation.x = drs_flap_angle_rad

	# 2. Cockpit SteeringWheel, DriverArms_Gloves, WingMirrors & DriverHelmet G-force tilt
	var steer_wheel_rot_z: float = -steer_input * deg_to_rad(125.0)
	if _steering_wheel_node != null:
		_steering_wheel_node.rotation.z = steer_wheel_rot_z
	if _driver_arms_gloves_node != null and _driver_arms_gloves_node.get_parent() != _steering_wheel_node:
		_driver_arms_gloves_node.rotation.z = steer_wheel_rot_z
	if _driver_helmet_node != null:
		_driver_helmet_node.rotation.z = lerpf(_driver_helmet_node.rotation.z, clampf(-lat_g * 0.045, -0.16, 0.16), minf(1.0, dt * 12.0))
		_driver_helmet_node.rotation.x = lerpf(_driver_helmet_node.rotation.x, clampf(long_g * 0.035, -0.12, 0.12), minf(1.0, dt * 12.0))

	# High-RPM / kerb micro-buzz on WingMirrors for cockpit immersion
	var mirror_buzz: float = sin(total_distance_m * 48.0) * 0.0035 * clampf(speed_kmh / 280.0, 0.0, 1.0)
	if _wing_mirror_l_node != null:
		_wing_mirror_l_node.rotation.z = mirror_buzz
	if _wing_mirror_r_node != null:
		_wing_mirror_r_node.rotation.z = -mirror_buzz

	# 3. 4-Corner Suspension Arms, Wheels, Calipers & Glowing Carbon-Ceramic Brake Discs
	for c_key: String in CORNER_KEYS:
		var w_state: Dictionary = wheel_states[c_key]
		var comp_m: float = float(w_state["compression_m"])
		var is_front: bool = c_key.begins_with("F")
		var is_left: bool = c_key.ends_with("L")
		var wheel_steer: float = steer_angle_rad if is_front else 0.0

		var susp_node: Node3D = _susp_nodes.get(c_key) as Node3D
		if susp_node != null:
			var wishbone_angle: float = clampf(comp_m / suspension_max_travel_m, -1.0, 1.0) * 0.18
			susp_node.rotation.z = wishbone_angle if is_left else -wishbone_angle

		var wheel_node: Node3D = _wheel_nodes.get(c_key) as Node3D
		if wheel_node != null:
			var hp: Vector3 = CORNER_HARDPOINTS[c_key]
			wheel_node.position.y = hp.y - suspension_rest_length_m + comp_m
			wheel_node.rotation.y = -wheel_steer
			wheel_node.rotation.x = -float(w_state["wheel_spin_rad"])

		var caliper_node: Node3D = _caliper_nodes.get(c_key) as Node3D
		if caliper_node != null:
			caliper_node.rotation.y = -wheel_steer

		if _disc_materials.has(c_key):
			var mat: StandardMaterial3D = _disc_materials[c_key] as StandardMaterial3D
			var glow: float = float(w_state["brake_glow"])
			mat.emission = Color(0.85, 0.09, 0.03).lerp(Color(1.0, 0.72, 0.18), glow)
			mat.emission_energy_multiplier = glow * 4.2

	brake_thermal_updated.emit(
		float(wheel_states["FL"]["brake_glow"]),
		float(wheel_states["FR"]["brake_glow"]),
		float(wheel_states["RL"]["brake_glow"]),
		float(wheel_states["RR"]["brake_glow"])
	)
