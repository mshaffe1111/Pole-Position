class_name MobileTouchAndCamera3D
extends Node3D
## A+ AAA Mobile Multi-Touch Controls, Accelerometer Tilt, Physics-Driven Self-Aligning Torque (SAT),
## Cockpit Look-to-Apex, Double-Tap Visor Tear-Off Wipe & 4-Mode Broadcast / Cockpit Camera Rig (Godot 4.x).
##
## Connects directly to `F1VehiclePhysics3D` (`vehicle_node`) and drives the standardized
## Blender -> Godot 4 24+ node hierarchy (`Body`, `SteeringWheel`, `DriverArms_Gloves`,
## `CockpitDash`, `DriverHelmet`, `Halo_Titanium`, `WingMirror_L`, `WingMirror_R`,
## and `CockpitVisorRainOverlay` running `windshield_rain.gdshader`).

signal camera_mode_changed(mode_index: int, mode_name: String)
signal gear_shift_requested(direction: int)
signal telemetry_hub_updated(readout_text: String, led_lit_count: int, strobe_active: bool)
signal tilt_calibrated(center_angle_deg: float)
signal visor_tear_off_triggered(tear_off_count: int)
signal look_apex_updated(look_apex_normalized: float)

enum SteeringStyle {
	WHEEL = 0,
	BUTTONS = 1,
	TILT = 2,
}

enum Handedness {
	RIGHT_HANDED = 0,
	LEFT_HANDED = 1,
}

enum BrakingAssist {
	OFF = 0,
	LOW = 1,
	MEDIUM = 2,
	HIGH = 3,
}

enum CameraMode {
	CHASE = 0,
	TCAM_OVERHEAD = 1,
	COCKPIT_HELMET = 2,
	HOOD_NOSE = 3,
}

const WHEEL_MICRO_DEADZONE_PX: float = 4.5
const WHEEL_MAX_LOCK_DEG: float = 125.0
const TILT_DEADZONE_DEG: float = 1.6
const TILT_BASE_MAX_DEG: float = 26.0
const GAMEPAD_AXIS_DEADZONE: float = 0.22
const GAMEPAD_TRIGGER_DEADZONE: float = 0.12
const FORGIVING_HALO_PAD_PX: float = 38.0
const VISOR_WIPE_DURATION_SEC: float = 0.42
const VISOR_CLEAN_HOLD_SEC: float = 2.20

@export_group("Scene References")
@export var vehicle_node: Node3D
@export var spring_arm: SpringArm3D
@export var active_camera: Camera3D
@export var steering_wheel_mesh: Node3D
@export var driver_arms_gloves_mesh: Node3D
@export var cockpit_dash_mesh: Node3D
@export var driver_helmet_mesh: Node3D
@export var halo_titanium_mesh: Node3D
@export var cockpit_visor_rain_overlay: MeshInstance3D

@export_group("UI Touch Zone Controls")
@export var wheel_zone_control: Control
@export var arrow_zone_control: Control
@export var pedal_zone_control: Control
@export var virtual_wheel_ui_graphic: Control
@export var wheel_hub_label: Label

@export_group("Ergonomics & Assists")
@export var steering_style: SteeringStyle = SteeringStyle.WHEEL
@export var handedness: Handedness = Handedness.RIGHT_HANDED
@export var braking_assist: BrakingAssist = BrakingAssist.OFF
@export_range(0.6, 1.5, 0.05) var sensitivity: float = 1.0
@export_range(0.65, 1.35, 0.05) var control_scale: float = 1.0
@export_range(0.25, 1.0, 0.05) var control_opacity: float = 0.92
@export var auto_throttle: bool = false
@export var haptics_enabled: bool = true

@export_group("Self-Aligning Torque (SAT) & Speed Authority")
@export var sat_pneumatic_trail_gain: float = 1.85
@export var sat_oversteer_catch_gain: float = 2.40
@export var sat_active_thumb_blend: float = 0.18
@export var sat_release_return_gain: float = 0.52
@export var high_speed_steer_clamp_min: float = 0.74

@export_group("Camera Rig Tuning")
@export var camera_mode: CameraMode = CameraMode.CHASE
@export var base_fov_landscape: float = 58.0
@export var base_fov_portrait: float = 82.0
@export var max_fov_deg: float = 95.0

# Normalized real-time control & cockpit outputs
var steer_output: float = 0.0
var throttle_output: float = 0.0
var brake_output: float = 0.0
var self_aligning_torque: float = 0.0
var speed_steer_authority: float = 1.0
var look_apex_normalized: float = 0.0
var visor_wipe_progress: float = 0.0
var visor_tear_off_count: int = 0

# Multi-touch finger index tracking (-1 = inactive)
var _wheel_touch_idx: int = -1
var _wheel_anchor_x: float = 0.0
var _wheel_raw_steer: float = 0.0
var _wheel_down_time_sec: float = 0.0
var _wheel_max_move_px: float = 0.0

var _arrow_touch_idx: int = -1
var _arrow_dir: int = 0
var _arrow_ramp_steer: float = 0.0

var _pedal_touch_idx: int = -1
var _touch_gas: float = 0.0
var _touch_brake: float = 0.0
var _pedal_zone_state: StringName = &"NONE"
var _full_brake_lock_active: bool = false
var _last_haptic_msec: int = 0

# Upper-viewport cockpit gesture state (double-tap visor wipe + quick-swipe camera cycle)
var _visor_gesture_touch_idx: int = -1
var _visor_gesture_start_pos: Vector2 = Vector2.ZERO
var _visor_gesture_start_sec: float = 0.0
var _visor_last_tap_sec: float = -10.0
var _visor_last_tap_pos: Vector2 = Vector2.ZERO
var _visor_wiping_active: bool = false
var _visor_clean_hold_timer: float = 0.0

# Accelerometer / Gyro Tilt state
var _tilt_center_deg: float = 0.0
var _tilt_needs_auto_center: bool = true
var _tilt_filtered_steer: float = 0.0

# Keyboard / Gamepad smoothing state
var _kb_steer: float = 0.0
var _last_gear: int = 1

# Camera dynamical filter states
var _elapsed_sec: float = 0.0
var _cam_smoothed_pos: Vector3 = Vector3.ZERO
var _cam_smoothed_look: Vector3 = Vector3.ZERO
var _cam_initialized: bool = false
var _cam_drs_fov_surge: float = 0.0
var _cam_apex_look_lat: float = 0.0
var _cam_roll_rad: float = 0.0
var _cam_pitch_rad: float = 0.0
var _helmet_yaw_rad: float = 0.0
var _helmet_roll_rad: float = 0.0


func _ready() -> void:
	_auto_resolve_vehicle_nodes()
	_ensure_camera_rig()
	_apply_control_visual_settings()
	_sync_cockpit_interior_visibility()


func _auto_resolve_vehicle_nodes() -> void:
	if vehicle_node == null and get_parent() is Node3D:
		vehicle_node = get_parent() as Node3D
	if vehicle_node == null:
		return
	if steering_wheel_mesh == null:
		steering_wheel_mesh = vehicle_node.find_child("SteeringWheel", true, false) as Node3D
	if driver_arms_gloves_mesh == null:
		driver_arms_gloves_mesh = vehicle_node.find_child("DriverArms_Gloves", true, false) as Node3D
	if cockpit_dash_mesh == null:
		cockpit_dash_mesh = vehicle_node.find_child("CockpitDash", true, false) as Node3D
	if driver_helmet_mesh == null:
		driver_helmet_mesh = vehicle_node.find_child("DriverHelmet", true, false) as Node3D
	if halo_titanium_mesh == null:
		halo_titanium_mesh = vehicle_node.find_child("Halo_Titanium", true, false) as Node3D


func _ensure_camera_rig() -> void:
	if spring_arm == null:
		spring_arm = find_child("SpringArm3D", true, false) as SpringArm3D
		if spring_arm == null:
			spring_arm = SpringArm3D.new()
			spring_arm.name = "SpringArm3D"
			spring_arm.spring_length = 6.5
			spring_arm.margin = 0.25
			add_child(spring_arm)
	if active_camera == null:
		active_camera = find_child("Camera3D", true, false) as Camera3D
		if active_camera == null:
			active_camera = Camera3D.new()
			active_camera.name = "Camera3D"
			active_camera.current = true
			active_camera.fov = base_fov_landscape
			active_camera.near = 0.06
			active_camera.far = 2500.0
			spring_arm.add_child(active_camera)
	if cockpit_visor_rain_overlay == null and active_camera != null:
		cockpit_visor_rain_overlay = active_camera.find_child("CockpitVisorRainOverlay", true, false) as MeshInstance3D


# ==============================================================================
# 1. ZERO-LATENCY HARDWARE MULTI-TOUCH & COCKPIT GESTURES
# ==============================================================================
func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		_handle_screen_touch(event as InputEventScreenTouch)
	elif event is InputEventScreenDrag:
		_handle_screen_drag(event as InputEventScreenDrag)
	elif event is InputEventKey and event.pressed and not event.echo:
		_handle_hotkey(event as InputEventKey)


func _handle_screen_touch(e: InputEventScreenTouch) -> void:
	if e.pressed:
		var pos: Vector2 = e.position
		if _is_point_in_pedal_zone(pos) and _pedal_touch_idx == -1:
			_pedal_touch_idx = e.index
			_update_pedals_from_screen_pos(pos)
			_trigger_haptic_ms(6)
			get_viewport().set_input_as_handled()
			return

		if _is_point_in_steer_zone(pos):
			if steering_style == SteeringStyle.BUTTONS and _arrow_touch_idx == -1:
				_arrow_touch_idx = e.index
				_update_arrows_from_screen_pos(pos, true)
				get_viewport().set_input_as_handled()
				return
			elif _wheel_touch_idx == -1:
				_wheel_touch_idx = e.index
				_wheel_anchor_x = pos.x # Exact thumb landing spot = 0.0 deg straight ahead!
				_wheel_raw_steer = 0.0
				_wheel_down_time_sec = _elapsed_sec
				_wheel_max_move_px = 0.0
				_trigger_haptic_ms(6)
				get_viewport().set_input_as_handled()
				return

		# Upper-center cockpit glass gesture zone: double-tap visor wipe or swipe camera cycle
		var vp: Vector2 = get_viewport().get_visible_rect().size
		if vp.y > 1.0 and pos.y > 54.0 and pos.y < vp.y * 0.48 and _visor_gesture_touch_idx == -1:
			_visor_gesture_touch_idx = e.index
			_visor_gesture_start_pos = pos
			_visor_gesture_start_sec = _elapsed_sec
	else:
		if e.index == _wheel_touch_idx:
			if steering_style == SteeringStyle.TILT and _wheel_max_move_px < 8.0 and (_elapsed_sec - _wheel_down_time_sec) < 0.35:
				calibrate_tilt_center()
			_wheel_touch_idx = -1
			_wheel_raw_steer = 0.0
		if e.index == _arrow_touch_idx:
			_arrow_touch_idx = -1
			_arrow_dir = 0
		if e.index == _pedal_touch_idx:
			_pedal_touch_idx = -1
			_touch_gas = 0.0
			_touch_brake = 0.0
			_pedal_zone_state = &"NONE"
			_full_brake_lock_active = false
		if e.index == _visor_gesture_touch_idx:
			_visor_gesture_touch_idx = -1
			var dt_gesture: float = _elapsed_sec - _visor_gesture_start_sec
			var delta_vec: Vector2 = e.position - _visor_gesture_start_pos
			if dt_gesture < 0.36 and absf(delta_vec.x) >= 54.0 and absf(delta_vec.x) > absf(delta_vec.y) * 1.6:
				cycle_camera_mode(1 if delta_vec.x > 0.0 else -1)
				_trigger_haptic_ms(9)
			elif dt_gesture < 0.28 and delta_vec.length() < 26.0:
				if (_elapsed_sec - _visor_last_tap_sec) < 0.33 and e.position.distance_to(_visor_last_tap_pos) < 42.0:
					_visor_last_tap_sec = -10.0
					trigger_visor_tear_off()
				else:
					_visor_last_tap_sec = _elapsed_sec
					_visor_last_tap_pos = e.position


func _handle_screen_drag(e: InputEventScreenDrag) -> void:
	if e.index == _wheel_touch_idx:
		_wheel_max_move_px = maxf(_wheel_max_move_px, absf(e.position.x - _wheel_anchor_x))
		_update_wheel_from_screen_pos(e.position)
		get_viewport().set_input_as_handled()
	elif e.index == _arrow_touch_idx:
		_update_arrows_from_screen_pos(e.position, false)
		get_viewport().set_input_as_handled()
	elif e.index == _pedal_touch_idx:
		_update_pedals_from_screen_pos(e.position)
		get_viewport().set_input_as_handled()


func _handle_hotkey(e: InputEventKey) -> void:
	if e.keycode == KEY_C:
		cycle_camera_mode(1)
	elif e.keycode == KEY_X or e.keycode == KEY_T:
		trigger_visor_tear_off()
	elif e.keycode == KEY_E or e.keycode == KEY_SHIFT:
		gear_shift_requested.emit(1)
	elif e.keycode == KEY_Q or e.keycode == KEY_CTRL:
		gear_shift_requested.emit(-1)


func trigger_visor_tear_off() -> int:
	visor_tear_off_count += 1
	visor_wipe_progress = 0.002
	_visor_wiping_active = true
	_visor_clean_hold_timer = VISOR_CLEAN_HOLD_SEC
	_trigger_haptic_ms(12)
	visor_tear_off_triggered.emit(visor_tear_off_count)
	return visor_tear_off_count


func _is_point_in_control_with_halo(ctrl: Control, pt: Vector2, pad: float) -> bool:
	if ctrl == null or not ctrl.is_visible_in_tree():
		return false
	var r: Rect2 = ctrl.get_global_rect().grow(pad)
	return r.has_point(pt)


func _is_point_in_pedal_zone(pt: Vector2) -> bool:
	if _is_point_in_control_with_halo(pedal_zone_control, pt, FORGIVING_HALO_PAD_PX):
		return true
	var vp: Vector2 = get_viewport().get_visible_rect().size
	if vp.x <= 1.0 or vp.y <= 1.0 or pt.y < vp.y * 0.54:
		return false
	if handedness == Handedness.LEFT_HANDED:
		return pt.x <= vp.x * 0.42
	return pt.x >= vp.x * 0.58


func _is_point_in_steer_zone(pt: Vector2) -> bool:
	var active_ctrl: Control = arrow_zone_control if steering_style == SteeringStyle.BUTTONS else wheel_zone_control
	if _is_point_in_control_with_halo(active_ctrl, pt, FORGIVING_HALO_PAD_PX):
		return true
	var vp: Vector2 = get_viewport().get_visible_rect().size
	if vp.x <= 1.0 or vp.y <= 1.0 or pt.y < vp.y * 0.54:
		return false
	if handedness == Handedness.LEFT_HANDED:
		return pt.x >= vp.x * 0.58
	return pt.x <= vp.x * 0.42


func _update_wheel_from_screen_pos(pt: Vector2) -> void:
	var raw_dx: float = pt.x - _wheel_anchor_x
	var eff_dx: float = 0.0
	if absf(raw_dx) > WHEEL_MICRO_DEADZONE_PX:
		eff_dx = raw_dx - signf(raw_dx) * WHEEL_MICRO_DEADZONE_PX

	var zone_w: float = 160.0
	if wheel_zone_control != null and wheel_zone_control.size.x > 10.0:
		zone_w = wheel_zone_control.size.x
	var base_drag_px: float = clampf(zone_w * 0.36, 54.0, 92.0)
	var max_drag_px: float = base_drag_px / clampf(sensitivity, 0.6, 1.5)
	var lin: float = clampf(eff_dx / max_drag_px, -1.0, 1.0)
	var abs_lin: float = absf(lin)

	# Non-linear progressive steering sensitivity curve: fine center control at 320 km/h, full lock in hairpins
	_wheel_raw_steer = 0.0 if abs_lin == 0.0 else signf(lin) * (0.38 * abs_lin + 0.62 * pow(abs_lin, 1.35))


func _update_arrows_from_screen_pos(pt: Vector2, is_initial: bool) -> void:
	var rect: Rect2
	if arrow_zone_control != null and arrow_zone_control.size.x > 8.0:
		rect = arrow_zone_control.get_global_rect()
	else:
		var vp: Vector2 = get_viewport().get_visible_rect().size
		var left_x: float = vp.x * 0.60 if handedness == Handedness.LEFT_HANDED else 16.0
		rect = Rect2(left_x, vp.y - 165.0, 175.0, 140.0)

	var rel_x: float = (pt.x - rect.position.x) / maxf(1.0, rect.size.x)
	var next_dir: int = 0
	if rel_x < 0.48:
		next_dir = -1
	elif rel_x > 0.52:
		next_dir = 1

	if next_dir != 0 and (is_initial or next_dir != _arrow_dir):
		_trigger_haptic_ms(7)
	_arrow_dir = next_dir


func _update_pedals_from_screen_pos(pt: Vector2) -> void:
	var rect: Rect2
	if pedal_zone_control != null and pedal_zone_control.size.x > 8.0:
		rect = pedal_zone_control.get_global_rect()
	else:
		var vp: Vector2 = get_viewport().get_visible_rect().size
		var left_x: float = 16.0 if handedness == Handedness.LEFT_HANDED else vp.x - 190.0
		rect = Rect2(left_x, vp.y - 170.0, 174.0, 150.0)

	var y_from_bottom: float = clampf(((rect.position.y + rect.size.y) - pt.y) / maxf(1.0, rect.size.y), 0.0, 1.0)
	# Forgiving phone pedal pressure curve: comfortable lower-thumb press (>= 22% height) delivers 100%
	var pressure: float = 1.0 if y_from_bottom >= 0.22 else (0.60 + 0.40 * (y_from_bottom / 0.22))

	var x_norm: float = clampf((pt.x - rect.position.x) / maxf(1.0, rect.size.x), 0.0, 1.0)
	if handedness == Handedness.LEFT_HANDED:
		x_norm = 1.0 - x_norm

	# Smooth C1-continuous horizontal trail-braking rollover bridge (0.40..0.60)
	var next_zone: StringName = &"ROLLOVER"
	if x_norm <= 0.40:
		next_zone = &"BRAKE"
		_touch_brake = pressure
		_touch_gas = 0.0
	elif x_norm >= 0.60:
		next_zone = &"GAS"
		_touch_gas = pressure
		_touch_brake = 0.0
	else:
		var u: float = (x_norm - 0.40) / 0.20
		var s: float = u * u * (3.0 - 2.0 * u)
		_touch_brake = pressure * pow(1.0 - s, 0.85)
		_touch_gas = pressure * pow(s, 0.85)

	if _pedal_zone_state != &"NONE" and _pedal_zone_state != next_zone:
		_trigger_haptic_ms(7)
	_pedal_zone_state = next_zone

	if _touch_brake >= 0.98 and not _full_brake_lock_active:
		_full_brake_lock_active = true
		_trigger_haptic_ms(11)
	elif _touch_brake < 0.88:
		_full_brake_lock_active = false


# ==============================================================================
# 2. PHYSICS-DRIVEN SELF-ALIGNING TORQUE (SAT), TILT & CONTROL STEP
# ==============================================================================
func apply_physics_feedback(car_node: Node3D, dt: float) -> float:
	if car_node == null:
		self_aligning_torque = lerpf(self_aligning_torque, 0.0, 1.0 - exp(-18.0 * dt))
		speed_steer_authority = 1.0
		return self_aligning_torque

	var speed_kmh: float = _get_vehicle_float(&"speed_kmh", &"speedKmh", 0.0)
	var target_sat: float = 0.0

	if car_node.has_method(&"get_self_aligning_torque"):
		target_sat = clampf(float(car_node.call(&"get_self_aligning_torque")), -1.0, 1.0)
	elif &"self_aligning_torque" in car_node:
		target_sat = clampf(float(car_node.get(&"self_aligning_torque")), -1.0, 1.0)
	elif &"selfAligningTorque" in car_node:
		target_sat = clampf(float(car_node.get(&"selfAligningTorque")), -1.0, 1.0)
	else:
		var front_slip_rad: float = _get_vehicle_float(&"front_slip_angle_rad", &"frontSlipAngle", 0.0)
		var rear_slip_rad: float = _get_vehicle_float(&"rear_slip_angle_rad", &"rearSlipAngle", 0.0)
		var oversteer_slip: float = rear_slip_rad - front_slip_rad
		target_sat = clampf(
			(-front_slip_rad * sat_pneumatic_trail_gain) + (oversteer_slip * sat_oversteer_catch_gain),
			-0.85,
			0.85
		)

	var low_speed_gate: float = clampf((speed_kmh - 14.0) / 24.0, 0.0, 1.0)
	target_sat *= low_speed_gate
	if absf(target_sat) < 0.012:
		target_sat = 0.0

	self_aligning_torque = lerpf(self_aligning_torque, target_sat, 1.0 - exp(-24.0 * dt))
	if absf(self_aligning_torque) < 0.002:
		self_aligning_torque = 0.0

	# Speed-sensitive steering lock damping at 300+ km/h (full 1.00 authority in <125 km/h hairpins!)
	var hs_blend: float = smoothstep(225.0, 335.0, speed_kmh)
	speed_steer_authority = lerpf(1.0, high_speed_steer_clamp_min, hs_blend)
	return self_aligning_torque


func calibrate_tilt_center() -> float:
	var raw_deg: float = _read_accelerometer_tilt_deg()
	_tilt_center_deg = raw_deg
	_tilt_needs_auto_center = false
	_tilt_filtered_steer = 0.0
	_trigger_haptic_ms(10)
	tilt_calibrated.emit(_tilt_center_deg)
	return _tilt_center_deg


func _read_accelerometer_tilt_deg() -> float:
	var acc: Vector3 = Input.get_accelerometer()
	if acc.length_squared() < 0.01:
		return 0.0
	var norm_acc: Vector3 = acc.normalized()
	return rad_to_deg(asin(clampf(norm_acc.x, -1.0, 1.0)))


func _compute_tilt_steer(dt: float) -> float:
	var raw_deg: float = _read_accelerometer_tilt_deg()
	if _tilt_needs_auto_center and absf(raw_deg) > 0.001:
		_tilt_center_deg = raw_deg
		_tilt_needs_auto_center = false

	var delta_deg: float = clampf(raw_deg - _tilt_center_deg, -55.0, 55.0)
	var eff_deg: float = 0.0
	if absf(delta_deg) > TILT_DEADZONE_DEG:
		eff_deg = delta_deg - signf(delta_deg) * TILT_DEADZONE_DEG

	var max_tilt_deg: float = TILT_BASE_MAX_DEG / clampf(sensitivity, 0.6, 1.5)
	var lin: float = clampf(eff_deg / maxf(8.0, max_tilt_deg), -1.0, 1.0)
	var abs_lin: float = absf(lin)
	var raw_steer: float = 0.0 if abs_lin == 0.0 else signf(lin) * (0.42 * abs_lin + 0.58 * pow(abs_lin, 1.30))

	var alpha: float = 1.0 - exp(-14.5 * dt)
	_tilt_filtered_steer = lerpf(_tilt_filtered_steer, raw_steer, alpha)
	if raw_steer == 0.0 and absf(_tilt_filtered_steer) < 0.002:
		_tilt_filtered_steer = 0.0
	return _tilt_filtered_steer


func _physics_process(delta: float) -> void:
	var dt: float = clampf(delta, 0.0005, 0.05)
	_elapsed_sec += dt

	var speed_kmh: float = _get_vehicle_float(&"speed_kmh", &"speedKmh", 0.0)
	var rpm: float = _get_vehicle_float(&"rpm", &"rpm", 4000.0)
	var gear: int = int(_get_vehicle_float(&"gear", &"gear", 1.0))
	var lat_g: float = _get_vehicle_float(&"lateral_g", &"latG", 0.0)
	var long_g: float = _get_vehicle_float(&"longitudinal_g", &"longG", 0.0)
	var on_curb: bool = _get_vehicle_bool(&"on_curb", &"onCurb", false)
	var in_slipstream: bool = _get_vehicle_bool(&"in_slipstream", &"inSlipstream", false)
	var drs_active: bool = _get_vehicle_bool(&"drs_active", &"drsActive", false)
	var upcoming_curv: float = _get_vehicle_float(&"upcoming_apex_curvature", &"curvature", 0.0)

	# 0. Physics-driven SAT & hairpin turn-in agility
	apply_physics_feedback(vehicle_node, dt)
	var sat_assist: float = (self_aligning_torque * sat_active_thumb_blend) if absf(self_aligning_torque) > 0.025 else 0.0
	var hairpin_agility: float = 1.0
	if speed_kmh > 12.0 and speed_kmh < 125.0:
		hairpin_agility = 1.0 + 0.16 * (1.0 - smoothstep(45.0, 125.0, speed_kmh))

	# 1. Keyboard & Gamepad Polling (with strict >= 0.22 deadzone)
	var kb_left: float = 1.0 if (Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT)) else 0.0
	var kb_right: float = 1.0 if (Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT)) else 0.0
	var target_kb: float = (kb_right - kb_left) * clampf(sensitivity, 0.75, 1.0)
	if target_kb != 0.0:
		var counter: bool = _kb_steer != 0.0 and signf(target_kb) != signf(_kb_steer)
		var kb_rate: float = (22.0 if counter else (15.0 if absf(_kb_steer) < 0.30 else 9.5)) * hairpin_agility
		_kb_steer = lerpf(_kb_steer, target_kb, 1.0 - exp(-kb_rate * dt))
	else:
		_kb_steer = lerpf(_kb_steer, 0.0, 1.0 - exp(-16.5 * dt))
		if absf(_kb_steer) < 0.003:
			_kb_steer = 0.0

	var gp_steer: float = 0.0
	var gp_gas: float = 0.0
	var gp_brake: float = 0.0
	if Input.get_connected_joypads().size() > 0:
		var raw_ax: float = Input.get_joy_axis(0, JOY_AXIS_LEFT_X)
		if absf(raw_ax) > GAMEPAD_AXIS_DEADZONE:
			var norm_ax: float = clampf(((absf(raw_ax) - GAMEPAD_AXIS_DEADZONE) / (1.0 - GAMEPAD_AXIS_DEADZONE)) * sensitivity, 0.0, 1.0)
			gp_steer = signf(raw_ax) * (0.45 * norm_ax + 0.55 * pow(norm_ax, 1.35))
		var rt: float = Input.get_joy_axis(0, JOY_AXIS_TRIGGER_RIGHT)
		var lt: float = Input.get_joy_axis(0, JOY_AXIS_TRIGGER_LEFT)
		if rt > GAMEPAD_TRIGGER_DEADZONE:
			gp_gas = clampf((rt - GAMEPAD_TRIGGER_DEADZONE) / (1.0 - GAMEPAD_TRIGGER_DEADZONE), 0.0, 1.0)
		if lt > GAMEPAD_TRIGGER_DEADZONE:
			gp_brake = clampf((lt - GAMEPAD_TRIGGER_DEADZONE) / (1.0 - GAMEPAD_TRIGGER_DEADZONE), 0.0, 1.0)

	# 2. Dual Touch Arrow ramp
	var target_arrow: float = float(_arrow_dir) * clampf(sensitivity, 0.72, 1.0)
	if _arrow_dir != 0:
		var counter_arr: bool = _arrow_ramp_steer != 0.0 and signf(float(_arrow_dir)) != signf(_arrow_ramp_steer)
		var arr_rate: float = (24.0 if counter_arr else (18.0 if absf(_arrow_ramp_steer) < 0.32 else 9.8)) * hairpin_agility
		_arrow_ramp_steer = lerpf(_arrow_ramp_steer, target_arrow, 1.0 - exp(-arr_rate * dt))
	else:
		_arrow_ramp_steer = lerpf(_arrow_ramp_steer, 0.0, 1.0 - exp(-17.5 * dt))
		if absf(_arrow_ramp_steer) < 0.003:
			_arrow_ramp_steer = 0.0

	# 3. Combine active steering source + 18% SAT counter-steer help + 300+ km/h lock damping
	var desired_steer: float = 0.0
	if _wheel_touch_idx != -1 and (steering_style != SteeringStyle.TILT or _wheel_max_move_px > 10.0):
		desired_steer = (_wheel_raw_steer * speed_steer_authority) + sat_assist
		steer_output = lerpf(steer_output, desired_steer, 1.0 - exp(-28.0 * hairpin_agility * dt))
	elif _arrow_touch_idx != -1 or absf(_arrow_ramp_steer) > 0.003:
		desired_steer = (_arrow_ramp_steer * speed_steer_authority) + sat_assist
		steer_output = desired_steer
	elif absf(_kb_steer) > 0.003 or absf(gp_steer) > 0.01:
		var base_in: float = gp_steer if absf(gp_steer) > absf(_kb_steer) else _kb_steer
		desired_steer = (base_in * speed_steer_authority) + sat_assist
		steer_output = desired_steer
	elif steering_style == SteeringStyle.TILT:
		var tilt_in: float = _compute_tilt_steer(dt)
		steer_output = (tilt_in * speed_steer_authority) + sat_assist
	else:
		# Released wheel: return to center guided by SAT pneumatic trail + self-centering rack spring
		var sat_return: float = clampf(self_aligning_torque * sat_release_return_gain, -0.65, 0.65) if absf(self_aligning_torque) > 0.04 else 0.0
		steer_output = lerpf(steer_output, sat_return, 1.0 - exp(-15.5 * dt))
		if absf(steer_output) < 0.002 and sat_return == 0.0:
			steer_output = 0.0

	steer_output = clampf(steer_output, -1.0, 1.0)

	# 4. Smooth Cockpit Look-to-Apex Normalized Signal & Visor Tear-Off Sweep
	var curve_norm: float = clampf(upcoming_curv * 165.0, -1.0, 1.0)
	var target_look_apex: float = clampf(
		steer_output * 0.68 + curve_norm * 0.32 - self_aligning_torque * 0.14,
		-1.0,
		1.0
	)
	look_apex_normalized = lerpf(look_apex_normalized, target_look_apex, 1.0 - exp(-9.5 * dt))
	if absf(target_look_apex) < 0.003 and absf(look_apex_normalized) < 0.002:
		look_apex_normalized = 0.0
	look_apex_updated.emit(look_apex_normalized)

	_step_visor_tear_off_and_rain_shader(dt, speed_kmh)

	# 5. Combine Pedals + Corner Braking Assist & Auto-Throttle
	var kb_gas: float = 1.0 if (Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP)) else 0.0
	var kb_brake: float = 1.0 if (Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN)) else 0.0
	var manual_gas: float = maxf(_touch_gas, maxf(kb_gas, gp_gas))
	var manual_brake: float = maxf(_touch_brake, maxf(kb_brake, gp_brake))

	var assist_brake: float = 0.0
	var throttle_cap: float = 1.0
	if braking_assist != BrakingAssist.OFF and speed_kmh > 92.0 and absf(upcoming_curv) >= 0.0026:
		var safe_speed_kmh: float = clampf(296.0 / sqrt(1.0 + absf(upcoming_curv) * 255.0), 108.0, 315.0)
		var margin: float = 24.0 if braking_assist == BrakingAssist.LOW else (10.0 if braking_assist == BrakingAssist.MEDIUM else 0.0)
		var max_str: float = 0.38 if braking_assist == BrakingAssist.LOW else (0.68 if braking_assist == BrakingAssist.MEDIUM else 0.90)
		var overspeed: float = speed_kmh - (safe_speed_kmh + margin)
		if overspeed > 0.0:
			assist_brake = clampf((overspeed / 42.0) * max_str, 0.0, max_str)
			if braking_assist == BrakingAssist.HIGH and overspeed > 8.0:
				throttle_cap = clampf(1.0 - overspeed / 36.0, 0.0, 1.0)

	var auto_gas: float = 0.0
	if auto_throttle:
		var braking_now: float = maxf(manual_brake, assist_brake)
		auto_gas = throttle_cap if braking_now < 0.08 else clampf(1.0 - braking_now * 2.4, 0.0, throttle_cap)

	throttle_output = clampf(maxf(manual_gas * throttle_cap, auto_gas), 0.0, 1.0)
	brake_output = clampf(maxf(manual_brake, assist_brake), 0.0, 1.0)

	# Push normalized inputs onto F1VehiclePhysics3D node
	if vehicle_node != null:
		if &"steer_input" in vehicle_node:
			vehicle_node.set(&"steer_input", steer_output)
		if &"throttle_input" in vehicle_node:
			vehicle_node.set(&"throttle_input", throttle_output)
		if &"brake_input" in vehicle_node:
			vehicle_node.set(&"brake_input", brake_output)

	# 6. Update 3D Cockpit SteeringWheel, DriverArms_Gloves, DriverHelmet IK & MFD Telemetry
	_update_3d_cockpit_and_telemetry(dt, speed_kmh, rpm, gear, lat_g, on_curb, in_slipstream, drs_active)

	# 7. Update 4-Mode Dynamic Camera Rig
	_update_camera_rig_3d(dt, speed_kmh, lat_g, long_g, on_curb, in_slipstream, drs_active)


func _step_visor_tear_off_and_rain_shader(dt: float, speed_kmh: float) -> void:
	if _visor_wiping_active:
		visor_wipe_progress += dt / VISOR_WIPE_DURATION_SEC
		if visor_wipe_progress >= 0.998:
			visor_wipe_progress = 0.0
			_visor_wiping_active = false
	if _visor_clean_hold_timer > 0.0:
		_visor_clean_hold_timer = maxf(0.0, _visor_clean_hold_timer - dt)

	if cockpit_visor_rain_overlay == null:
		return
	var in_cockpit: bool = (camera_mode == CameraMode.COCKPIT_HELMET)
	cockpit_visor_rain_overlay.visible = in_cockpit
	if not in_cockpit:
		return

	var mat: ShaderMaterial = cockpit_visor_rain_overlay.get_active_material(0) as ShaderMaterial
	if mat != null:
		mat.set_shader_parameter(&"car_speed_kmh", speed_kmh)
		mat.set_shader_parameter(&"yaw_rate_rad", clampf(steer_output * 1.35, -2.0, 2.0))
		mat.set_shader_parameter(&"visor_wipe_progress", visor_wipe_progress)
		if _visor_clean_hold_timer > 0.0 and not _visor_wiping_active:
			var regrow: float = 1.0 - (_visor_clean_hold_timer / VISOR_CLEAN_HOLD_SEC)
			var wet: float = _get_vehicle_float(&"surface_wetness", &"moisture", 0.0)
			mat.set_shader_parameter(&"rain_intensity_override", wet * regrow * regrow)
		else:
			mat.set_shader_parameter(&"rain_intensity_override", -1.0)


func _update_3d_cockpit_and_telemetry(
	dt: float,
	speed_kmh: float,
	rpm: float,
	gear: int,
	lat_g: float,
	on_curb: bool,
	in_slipstream: bool,
	drs_active: bool
) -> void:
	if gear != _last_gear:
		_last_gear = gear
		if speed_kmh > 25.0:
			_trigger_haptic_ms(9)

	var ffb_jitter_deg: float = self_aligning_torque * 5.2
	if speed_kmh > 30.0 and on_curb:
		ffb_jitter_deg += sin(_elapsed_sec * 85.0) * 4.2
		_trigger_haptic_ms(10)

	var wheel_deg: float = steer_output * WHEEL_MAX_LOCK_DEG + ffb_jitter_deg
	var wheel_rad_z: float = deg_to_rad(-wheel_deg)
	if steering_wheel_mesh != null:
		var rot: Vector3 = steering_wheel_mesh.rotation
		rot.z = wheel_rad_z
		steering_wheel_mesh.rotation = rot

	# Rotate articulated Nomex DriverArms_Gloves in sync if not already childed under SteeringWheel
	if driver_arms_gloves_mesh != null and driver_arms_gloves_mesh.get_parent() != steering_wheel_mesh:
		var arm_rot: Vector3 = driver_arms_gloves_mesh.rotation
		arm_rot.z = wheel_rad_z
		driver_arms_gloves_mesh.rotation = arm_rot

	if virtual_wheel_ui_graphic != null:
		virtual_wheel_ui_graphic.rotation = deg_to_rad(wheel_deg)

	# Driver helmet look-to-apex yaw & lateral G-force lean
	if driver_helmet_mesh != null:
		var target_yaw: float = deg_to_rad(-look_apex_normalized * 13.5)
		var target_roll: float = clampf(-lat_g * 0.035, -0.14, 0.14)
		_helmet_yaw_rad = lerpf(_helmet_yaw_rad, target_yaw, 1.0 - exp(-12.0 * dt))
		_helmet_roll_rad = lerpf(_helmet_roll_rad, target_roll, 1.0 - exp(-10.0 * dt))
		driver_helmet_mesh.rotation = Vector3(0.0, _helmet_yaw_rad, _helmet_roll_rad)

	# Multi-Function Display Readout (G6 • 2.4G / G8 • DRS / G1 • 0°)
	var g_txt: String = "G%d" % clampi(gear, 1, 8)
	var steer_deg_int: int = int(roundf(steer_output * WHEEL_MAX_LOCK_DEG))
	var abs_lat_g: float = absf(lat_g)
	if abs_lat_g < 0.05 and speed_kmh > 15.0:
		var v_ms: float = speed_kmh / 3.6
		abs_lat_g = absf(steer_output) * ((v_ms * v_ms) / 260.0)

	var readout: String
	if speed_kmh > 45.0 and (in_slipstream or drs_active or (speed_kmh >= 286.0 and absf(steer_output) < 0.12)):
		readout = "%s • DRS" % g_txt
	elif speed_kmh > 38.0 and absf(steer_output) >= 0.12 and abs_lat_g >= 0.45:
		readout = "%s • %.1fG" % [g_txt, clampf(abs_lat_g, 0.5, 5.4)]
	else:
		readout = "%s • %d°" % [g_txt, steer_deg_int]

	if wheel_hub_label != null:
		wheel_hub_label.text = readout

	# 8-LED RPM Tachometer Strip & >= 14,300 RPM Blue Shift Strobe
	var rpm_norm: float = clampf((rpm - 7000.0) / 5100.0, 0.0, 1.0)
	var lit_count: int = int(roundf(rpm_norm * 8.0))
	var high_rpm_strobe: bool = rpm >= 14300.0
	if high_rpm_strobe and (int(Time.get_ticks_msec() / 55) % 2 == 1):
		lit_count = 0
	elif high_rpm_strobe:
		lit_count = 8

	telemetry_hub_updated.emit(readout, lit_count, high_rpm_strobe)


# ==============================================================================
# 3. 4-MODE DYNAMIC CAMERA DIRECTOR (CHASE, TCAM, COCKPIT HELMET, HOOD)
# ==============================================================================
func cycle_camera_mode(step: int = 1) -> void:
	var count: int = 4
	var next_idx: int = posmod(int(camera_mode) + step, count)
	set_camera_mode_index(next_idx)


func set_camera_mode_index(mode_idx: int) -> void:
	var clamped_idx: int = posmod(mode_idx, 4)
	camera_mode = clamped_idx as CameraMode
	_sync_cockpit_interior_visibility()
	var names: Array[String] = ["CHASE", "TCAM_OVERHEAD", "COCKPIT_HELMET", "HOOD_NOSE"]
	camera_mode_changed.emit(clamped_idx, names[clamped_idx])


func _sync_cockpit_interior_visibility() -> void:
	var in_cockpit: bool = (camera_mode == CameraMode.COCKPIT_HELMET)
	if driver_helmet_mesh != null:
		driver_helmet_mesh.visible = not in_cockpit
	if cockpit_visor_rain_overlay != null:
		cockpit_visor_rain_overlay.visible = in_cockpit


func _update_camera_rig_3d(
	dt: float,
	speed_kmh: float,
	lat_g: float,
	long_g: float,
	on_curb: bool,
	in_slipstream: bool,
	drs_active: bool
) -> void:
	if active_camera == null or vehicle_node == null:
		return

	var vp_size: Vector2 = get_viewport().get_visible_rect().size
	var aspect: float = vp_size.x / maxf(1.0, vp_size.y)
	var is_portrait: bool = aspect < 0.85

	# 1. Speed & DRS Dynamic FOV Scaling (aspect-aware for portrait phones)
	var base_fov: float = base_fov_portrait if aspect < 0.58 else (74.0 if is_portrait else base_fov_landscape)
	if camera_mode == CameraMode.COCKPIT_HELMET:
		base_fov = 76.0 if is_portrait else 64.0
	var drs_surge_target: float = (3.2 if in_slipstream else 0.0) + (1.8 if (drs_active or speed_kmh > 285.0) else 0.0)
	_cam_drs_fov_surge = lerpf(_cam_drs_fov_surge, drs_surge_target, 1.0 - exp(-5.5 * dt))
	var speed_fov_boost: float = (speed_kmh / 320.0) * (10.5 if in_slipstream else 7.5) + _cam_drs_fov_surge
	var desired_fov: float = minf(max_fov_deg, base_fov + speed_fov_boost)
	active_camera.fov = lerpf(active_camera.fov, desired_fov, 1.0 - exp(-6.0 * dt))

	# 2. High-Frequency Kerb Sawtooth Vibration & > 240 km/h Aero Buffeting
	var spd_norm: float = clampf((speed_kmh - 240.0) / 110.0, 0.0, 1.0)
	var is_onboard: bool = (camera_mode != CameraMode.CHASE)
	var kerb_amp: float = (0.022 if is_onboard else 0.045) if (on_curb and speed_kmh > 40.0) else 0.0
	var aero_amp: float = spd_norm * (0.008 if is_onboard else 0.015)
	var vib_y: float = sin(_elapsed_sec * 58.0) * kerb_amp + cos(_elapsed_sec * 43.0) * aero_amp
	var vib_lat: float = cos(_elapsed_sec * 51.0) * (kerb_amp * 0.45 + aero_amp * 0.35)

	# 3. Look-to-Apex Lateral Target Offset driven by `look_apex_normalized`
	var target_apex_lat: float = look_apex_normalized * (6.8 if camera_mode == CameraMode.COCKPIT_HELMET else 2.2)
	_cam_apex_look_lat = lerpf(_cam_apex_look_lat, target_apex_lat, 1.0 - exp(-8.5 * dt))

	# 4. Mode-Specific Local Offsets (Godot -Z forward, +Y up, +X right)
	var local_offset: Vector3
	var look_ahead_m: float
	var look_height_m: float
	match camera_mode:
		CameraMode.CHASE:
			var back_d: float = (7.65 if aspect < 0.58 else 7.05) if is_portrait else 6.50
			var up_h: float = (2.58 if aspect < 0.58 else 2.45) if is_portrait else 2.32
			var apex_swing: float = -steer_output * (0.44 if is_portrait else 0.55)
			local_offset = Vector3(apex_swing + vib_lat, up_h + vib_y, back_d)
			look_ahead_m = 24.0 if is_portrait else 22.0
			look_height_m = 0.62 if is_portrait else 1.02
		CameraMode.TCAM_OVERHEAD:
			local_offset = Vector3(vib_lat * 0.5, 1.18 + vib_y, 0.55)
			look_ahead_m = 34.0
			look_height_m = 0.82 if is_portrait else 1.02
		CameraMode.COCKPIT_HELMET:
			# Eye point inside cockpit tub looking past DriverArms_Gloves, SteeringWheel, CockpitDash, Halo & WingMirrors
			local_offset = Vector3(vib_lat * 0.32, 0.655 + vib_y * 0.65, -0.21)
			look_ahead_m = 36.0
			look_height_m = 0.62
		CameraMode.HOOD_NOSE:
			local_offset = Vector3(vib_lat * 0.3, 0.48 + vib_y * 0.6, -1.35)
			look_ahead_m = 42.0
			look_height_m = 0.45

	var car_xform: Transform3D = vehicle_node.global_transform
	var desired_world_pos: Vector3 = car_xform * local_offset
	var desired_world_look: Vector3 = car_xform * Vector3(_cam_apex_look_lat, look_height_m, -look_ahead_m)

	if not _cam_initialized or is_onboard:
		_cam_smoothed_pos = desired_world_pos
		_cam_smoothed_look = desired_world_look
		_cam_initialized = true
	else:
		_cam_smoothed_pos = _cam_smoothed_pos.lerp(desired_world_pos, 1.0 - exp(-16.5 * dt))
		_cam_smoothed_look = _cam_smoothed_look.lerp(desired_world_look, 1.0 - exp(-18.5 * dt))

	active_camera.global_position = _cam_smoothed_pos
	active_camera.look_at(_cam_smoothed_look, car_xform.basis.y)

	# 5. Inertial Chassis Pitch/Roll, Lateral G-Force Roll & Banking Horizon Compensation
	var track_bank_rad: float = _get_vehicle_float(&"track_banking_rad", &"bankingRad", 0.0)
	var chassis_pitch_rad: float = _get_vehicle_float(&"chassis_pitch_rad", &"chassisPitchRad", 0.0)
	var chassis_roll_rad: float = _get_vehicle_float(&"chassis_roll_rad", &"chassisRollRad", 0.0)
	var target_roll: float = clampf(-lat_g * 0.011 + chassis_roll_rad * 0.65, -0.065, 0.065) - (track_bank_rad * 0.35)
	var target_pitch: float = clampf(-long_g * 0.0085 + chassis_pitch_rad * 0.70, -0.048, 0.038)
	_cam_roll_rad = lerpf(_cam_roll_rad, target_roll, 1.0 - exp(-10.0 * dt))
	_cam_pitch_rad = lerpf(_cam_pitch_rad, target_pitch, 1.0 - exp(-11.0 * dt))

	active_camera.rotate_object_local(Vector3.RIGHT, _cam_pitch_rad)
	active_camera.rotate_object_local(Vector3.FORWARD, _cam_roll_rad)


func _apply_control_visual_settings() -> void:
	for ctrl: Control in [wheel_zone_control, arrow_zone_control, pedal_zone_control]:
		if ctrl == null:
			continue
		ctrl.scale = Vector2.ONE * control_scale
		ctrl.modulate.a = control_opacity


func _trigger_haptic_ms(duration_ms: int) -> void:
	if not haptics_enabled:
		return
	var now: int = Time.get_ticks_msec()
	if now - _last_haptic_msec < 55:
		return
	_last_haptic_msec = now
	Input.vibrate_handheld(duration_ms)


func _get_vehicle_float(snake_prop: StringName, camel_prop: StringName, fallback: float) -> float:
	if vehicle_node == null:
		return fallback
	if snake_prop in vehicle_node:
		return float(vehicle_node.get(snake_prop))
	if camel_prop in vehicle_node:
		return float(vehicle_node.get(camel_prop))
	return fallback


func _get_vehicle_bool(snake_prop: StringName, camel_prop: StringName, fallback: bool) -> bool:
	if vehicle_node == null:
		return fallback
	if snake_prop in vehicle_node:
		return bool(vehicle_node.get(snake_prop))
	if camel_prop in vehicle_node:
		return bool(vehicle_node.get(camel_prop))
	return fallback
