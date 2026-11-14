class_name MobileTouchAndCamera3D
extends Node3D
## Sim-Grade 1:1 Motion-Matched Mobile Multi-Touch Controls, 1€ Adaptive Filtering,
## Tilt Gyro (0.5 deg C1 Deadzone), Tactile FFB / Flat-Spot Haptics, Cockpit Look-to-Apex,
## Double-Tap Visor Tear-Off & Critically-Damped Sim Camera Rig (Godot 4.x).
##
## Connects directly to `F1VehiclePhysics3D` (`vehicle_node`) and drives the standardized
## Blender -> Godot 4 24+ node hierarchy (`Body`, `SteeringWheel`, `DriverArms_Gloves`,
## `CockpitDash`, `DriverHelmet`, `Halo_Titanium`, `WingMirror_L`, `WingMirror_R`,
## and `CockpitVisorRainOverlay` running `windshield_rain.gdshader`).

signal camera_mode_changed(mode_index: int, mode_name: String)
signal gear_shift_requested(direction: int)
signal telemetry_hub_updated(readout_text: String, led_lit_count: int, strobe_active: bool)
signal ffb_torque_updated(ffb_torque_normalized: float, flat_spot_vibration: float, assist_brake_applied: float)
signal tilt_calibrated(center_angle_deg: float)
signal visor_tear_off_triggered(tear_off_count: int)
signal look_apex_updated(look_apex_normalized: float)

enum SteeringStyle {
	WHEEL = 0,
	BUTTONS = 1,
	TILT = 2,
	SLIDER = 3,
}

enum Handedness {
	RIGHT_HANDED = 0,
	LEFT_HANDED = 1,
}

enum BrakingAssist {
	OFF = 0,
	MIN = 1,
	FULL = 2,
}

enum TractionControl {
	OFF = 0,
	SPORT = 1,
	FULL = 2,
}

enum CameraMode {
	CHASE = 0,
	TCAM_OVERHEAD = 1,
	COCKPIT_HELMET = 2,
	BONNET_COWLING = 3,
	HOOD_NOSE = 4,
}

const DEFAULT_STEERING_LINEARITY: float = 0.35
const DEFAULT_SENSITIVITY: float = 0.90

const WHEEL_MICRO_DEADZONE_PX: float = 3.0
const WHEEL_DEADZONE_KNEE_PX: float = 3.5
const WHEEL_MAX_LOCK_DEG: float = 180.0

const TILT_DEADZONE_DEG: float = 0.8
const TILT_DEADZONE_KNEE_DEG: float = 0.8
const TILT_BASE_MAX_DEG: float = 28.0

const GAMEPAD_AXIS_DEADZONE: float = 0.22
const GAMEPAD_AXIS_KNEE: float = 0.05
const GAMEPAD_TRIGGER_DEADZONE: float = 0.08

const SAT_ACTIVE_ASSIST_BLEND: float = 0.0
const SAT_RELEASE_RETURN_GAIN: float = 0.32

const WHEEL_ONE_EURO_FC_MIN: float = 6.5
const WHEEL_ONE_EURO_BETA: float = 0.32
const TILT_ONE_EURO_FC_MIN: float = 3.2
const TILT_ONE_EURO_BETA: float = 0.25

const TIRE_OUTER_RADIUS_M: float = 0.36
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
@export var slider_zone_control: Control
@export var arrow_zone_control: Control
@export var pedal_zone_control: Control
@export var virtual_wheel_ui_graphic: Control
@export var wheel_hub_label: Label

@export_group("Ergonomics & Assists")
@export var steering_style: SteeringStyle = SteeringStyle.WHEEL
@export var handedness: Handedness = Handedness.RIGHT_HANDED
@export var braking_assist: BrakingAssist = BrakingAssist.MIN
@export var traction_control: TractionControl = TractionControl.FULL
@export_range(0.6, 1.5, 0.05) var sensitivity: float = 0.90
@export_range(0.0, 1.0, 0.01) var steering_linearity: float = 0.35
@export_range(0.65, 1.35, 0.05) var control_scale: float = 1.0
@export_range(0.25, 1.0, 0.05) var control_opacity: float = 0.92
@export var auto_throttle: bool = false
@export var haptics_enabled: bool = true

@export_group("Self-Aligning Torque (SAT) FFB & Release")
@export var sat_pneumatic_trail_gain: float = 1.85
@export var sat_oversteer_catch_gain: float = 2.40
@export var sat_active_thumb_blend: float = 0.0
@export var sat_release_return_gain: float = 0.32
@export var high_speed_steer_clamp_min: float = 1.0

@export_group("Camera Rig Tuning")
@export var camera_mode: CameraMode = CameraMode.CHASE
@export var base_fov_landscape: float = 58.0
@export var base_fov_portrait: float = 78.0
@export var max_fov_deg: float = 82.0

# Normalized real-time control & cockpit outputs
var steer_output: float = 0.0
var throttle_output: float = 0.0
var brake_output: float = 0.0
var manual_throttle_output: float = 0.0
var manual_brake_output: float = 0.0
var assist_brake_applied: float = 0.0
var road_tangent_steer_assist: float = 0.0
var _assist_smoothed_steer: float = 0.0
var self_aligning_torque: float = 0.0
var ffb_torque_normalized: float = 0.0
var tire_flat_spot_vibration: float = 0.0
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

var _slider_touch_idx: int = -1
var _slider_anchor_x: float = 0.0
var _slider_raw_steer: float = 0.0

var _arrow_touch_idx: int = -1
var _arrow_dir: int = 0
var _arrow_ramp_steer: float = 0.0

var _pedal_touch_idx: int = -1
var _touch_gas: float = 0.0
var _touch_brake: float = 0.0
var _pedal_zone_state: StringName = &"NONE"
var _full_brake_lock_active: bool = false
var _last_haptic_msec: int = 0
var _last_flat_spot_haptic_msec: int = 0

# 1€ Adaptive Low-Pass Filter states (Wheel, Slider, Tilt Gyro)
var _wheel_1e_init: bool = false
var _wheel_1e_x: float = 0.0
var _wheel_1e_dx: float = 0.0

var _slider_1e_init: bool = false
var _slider_1e_x: float = 0.0
var _slider_1e_dx: float = 0.0

var _tilt_1e_init: bool = false
var _tilt_1e_x: float = 0.0
var _tilt_1e_dx: float = 0.0

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

# Keyboard / Gamepad & FFB frame-guard state
var _kb_steer: float = 0.0
var _last_gear: int = 1
var _flat_spot_phase_rad: float = 0.0
var _last_feedback_physics_frame: int = -1
var _last_feedback_usec: int = -10000

# Camera dynamical filter states
var _elapsed_sec: float = 0.0
var _cam_smoothed_pos: Vector3 = Vector3.ZERO
var _cam_smoothed_look: Vector3 = Vector3.ZERO
var _cam_initialized: bool = false
var _cam_apex_look_lat: float = 0.0
var _cam_apex_swing: float = 0.0
var _cam_roll_rad: float = 0.0
var _cam_pitch_rad: float = 0.0
var _helmet_yaw_rad: float = 0.0
var _helmet_roll_rad: float = 0.0


func _ready() -> void:
	_auto_resolve_vehicle_nodes()
	_ensure_camera_rig()
	_apply_control_visual_settings()
	_sync_cockpit_interior_visibility()


# ==============================================================================
# PURE 1:1 LINEARITY, C1 DEADZONES, BRAKE ASSIST NORMALIZATION & 1-EURO FILTER
# ==============================================================================
static func normalize_braking_assist_mode(val: Variant) -> String:
	if typeof(val) == TYPE_BOOL:
		return "FULL" if bool(val) else "OFF"
	if typeof(val) == TYPE_INT:
		var iv: int = int(val)
		if iv <= 0:
			return "OFF"
		elif iv == 1:
			return "MIN"
		return "FULL"
	var s: String = String(val).strip_edges().to_upper()
	if s == "" or s == "NULL":
		return "MIN"
	if s == "OFF" or s == "NONE" or s == "0":
		return "OFF"
	if s == "MIN" or s == "MINIMUM" or s == "LOW":
		return "MIN"
	if s == "FULL" or s == "MED" or s == "MEDIUM" or s == "HIGH":
		return "FULL"
	return "MIN"


func set_braking_assist_from_string(mode_str: Variant) -> String:
	var norm: String = normalize_braking_assist_mode(mode_str)
	if norm == "OFF":
		braking_assist = BrakingAssist.OFF
	elif norm == "FULL":
		braking_assist = BrakingAssist.FULL
	else:
		braking_assist = BrakingAssist.MIN
	return norm


func get_braking_assist_string() -> String:
	match braking_assist:
		BrakingAssist.OFF:
			return "OFF"
		BrakingAssist.FULL:
			return "FULL"
		_:
			return "MIN"


static func normalize_traction_control_mode(val: Variant) -> String:
	if typeof(val) == TYPE_BOOL:
		return "FULL" if bool(val) else "OFF"
	if typeof(val) == TYPE_INT:
		var iv: int = int(val)
		if iv <= 0:
			return "OFF"
		elif iv == 1:
			return "SPORT"
		return "FULL"
	var s: String = String(val).strip_edges().to_upper()
	if s == "" or s == "NULL":
		return "FULL"
	if s == "OFF" or s == "NONE" or s == "0" or s == "FALSE":
		return "OFF"
	if s == "SPORT" or s == "MED" or s == "MEDIUM" or s == "LOW" or s == "MIN":
		return "SPORT"
	if s == "FULL" or s == "HIGH" or s == "MAX" or s == "ON" or s == "TRUE":
		return "FULL"
	return "FULL"


func set_traction_control_from_string(mode_str: Variant) -> String:
	var norm: String = normalize_traction_control_mode(mode_str)
	if norm == "OFF":
		traction_control = TractionControl.OFF
	elif norm == "SPORT":
		traction_control = TractionControl.SPORT
	else:
		traction_control = TractionControl.FULL
	return norm


func get_traction_control_string() -> String:
	match traction_control:
		TractionControl.OFF:
			return "OFF"
		TractionControl.SPORT:
			return "SPORT"
		_:
			return "FULL"


static func apply_steering_linearity_curve(x: float, lam: float = DEFAULT_STEERING_LINEARITY) -> float:
	var cx: float = clampf(x, -1.0, 1.0)
	var clean_lam: float = clampf(lam * 0.01 if lam > 1.0001 else lam, 0.0, 1.0)
	if clean_lam <= 0.00001:
		return cx
	return (1.0 - clean_lam) * cx + clean_lam * (cx * cx * cx)


static func map_smooth_c1_deadzone(val: float, dz: float, knee: float, max_val: float) -> float:
	var abs_v: float = absf(val)
	if abs_v <= dz:
		return 0.0
	var safe_knee: float = maxf(0.00001, knee)
	var eff_max: float = maxf(dz + safe_knee + 0.0001, max_val)
	var denom: float = maxf(0.00001, eff_max - dz - 0.5 * safe_knee)
	var u: float = abs_v - dz
	var shaped: float = (u * u) / (2.0 * safe_knee) if u < safe_knee else (u - 0.5 * safe_knee)
	return clampf(signf(val) * (shaped / denom), -1.0, 1.0)


static func _one_euro_alpha(dt: float, cutoff_hz: float) -> float:
	var tau: float = 1.0 / (TAU * maxf(0.001, cutoff_hz))
	return 1.0 / (1.0 + tau / maxf(0.0001, dt))


func _filter_wheel_one_euro(x: float, dt: float) -> float:
	if not _wheel_1e_init:
		_wheel_1e_init = true
		_wheel_1e_x = x
		_wheel_1e_dx = 0.0
		return x
	var dx: float = (x - _wheel_1e_x) / dt
	var edx: float = lerpf(_wheel_1e_dx, dx, _one_euro_alpha(dt, 1.8))
	var fc: float = WHEEL_ONE_EURO_FC_MIN + WHEEL_ONE_EURO_BETA * absf(edx)
	var x_hat: float = lerpf(_wheel_1e_x, x, _one_euro_alpha(dt, fc))
	if x == 0.0 and absf(x_hat) < 0.0012:
		x_hat = 0.0
	_wheel_1e_x = x_hat
	_wheel_1e_dx = edx
	return x_hat


func _filter_slider_one_euro(x: float, dt: float) -> float:
	if not _slider_1e_init:
		_slider_1e_init = true
		_slider_1e_x = x
		_slider_1e_dx = 0.0
		return x
	var dx: float = (x - _slider_1e_x) / dt
	var edx: float = lerpf(_slider_1e_dx, dx, _one_euro_alpha(dt, 1.8))
	var fc: float = WHEEL_ONE_EURO_FC_MIN + WHEEL_ONE_EURO_BETA * absf(edx)
	var x_hat: float = lerpf(_slider_1e_x, x, _one_euro_alpha(dt, fc))
	if x == 0.0 and absf(x_hat) < 0.0012:
		x_hat = 0.0
	_slider_1e_x = x_hat
	_slider_1e_dx = edx
	return x_hat


func _filter_tilt_one_euro(x: float, dt: float) -> float:
	if not _tilt_1e_init:
		_tilt_1e_init = true
		_tilt_1e_x = x
		_tilt_1e_dx = 0.0
		return x
	var dx: float = (x - _tilt_1e_x) / dt
	var edx: float = lerpf(_tilt_1e_dx, dx, _one_euro_alpha(dt, 1.4))
	var fc: float = TILT_ONE_EURO_FC_MIN + TILT_ONE_EURO_BETA * absf(edx)
	var x_hat: float = lerpf(_tilt_1e_x, x, _one_euro_alpha(dt, fc))
	if x == 0.0 and absf(x_hat) < 0.0012:
		x_hat = 0.0
	_tilt_1e_x = x_hat
	_tilt_1e_dx = edx
	return x_hat


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
			elif steering_style == SteeringStyle.SLIDER and slider_zone_control != null and _slider_touch_idx == -1:
				_slider_touch_idx = e.index
				_slider_anchor_x = pos.x
				_slider_raw_steer = 0.0
				_slider_1e_init = true
				_slider_1e_x = 0.0
				_slider_1e_dx = 0.0
				_trigger_haptic_ms(6)
				get_viewport().set_input_as_handled()
				return
			elif _wheel_touch_idx == -1:
				_wheel_touch_idx = e.index
				_wheel_anchor_x = pos.x # Exact thumb landing spot = 0.0 deg straight ahead!
				_wheel_raw_steer = 0.0
				_wheel_1e_init = true
				_wheel_1e_x = 0.0
				_wheel_1e_dx = 0.0
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
			_wheel_1e_init = false
		if e.index == _slider_touch_idx:
			_slider_touch_idx = -1
			_slider_raw_steer = 0.0
			_slider_1e_init = false
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
	elif e.index == _slider_touch_idx:
		_update_slider_from_screen_pos(e.position)
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
	var active_ctrl: Control = wheel_zone_control
	if steering_style == SteeringStyle.BUTTONS:
		active_ctrl = arrow_zone_control
	elif steering_style == SteeringStyle.SLIDER and slider_zone_control != null:
		active_ctrl = slider_zone_control
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
	var zone_w: float = 168.0
	if wheel_zone_control != null and wheel_zone_control.size.x > 10.0:
		zone_w = wheel_zone_control.size.x
	var base_drag_px: float = clampf(zone_w * 0.46, 74.0, 116.0)
	var max_drag_px: float = base_drag_px / clampf(sensitivity, 0.6, 1.5)

	# 3.0px C1 micro-deadzone + progressive user-friendly steering curve (default λ = 0.35)
	var lin: float = map_smooth_c1_deadzone(raw_dx, WHEEL_MICRO_DEADZONE_PX, WHEEL_DEADZONE_KNEE_PX, max_drag_px)
	_wheel_raw_steer = apply_steering_linearity_curve(lin, steering_linearity)


func _update_slider_from_screen_pos(pt: Vector2) -> void:
	var raw_dx: float = pt.x - _slider_anchor_x
	var zone_w: float = 176.0
	if slider_zone_control != null and slider_zone_control.size.x > 10.0:
		zone_w = slider_zone_control.size.x
	var base_drag_px: float = clampf(zone_w * 0.48, 76.0, 122.0)
	var max_drag_px: float = base_drag_px / clampf(sensitivity, 0.6, 1.5)

	var lin: float = map_smooth_c1_deadzone(raw_dx, WHEEL_MICRO_DEADZONE_PX, WHEEL_DEADZONE_KNEE_PX, max_drag_px)
	_slider_raw_steer = apply_steering_linearity_curve(lin, steering_linearity)


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

	# Progressive 0% -> 100% analog pedal curve without any initial 60% step jump!
	var y_from_bottom: float = clampf(((rect.position.y + rect.size.y) - pt.y) / maxf(1.0, rect.size.y), 0.0, 1.0)
	var raw_travel: float = clampf((y_from_bottom - 0.04) / 0.78, 0.0, 1.0)
	var pressure: float = 0.0 if raw_travel <= 0.0 else pow(raw_travel, 1.12)

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
# 2. GUARDED PHYSICS FFB (SAT + TIRE FLAT-SPOT), 1-EURO TILT & C1 CONTROL STEP
# ==============================================================================
func _read_tire_flat_spot_severity(car_node: Node3D) -> Vector2:
	if car_node == null:
		return Vector2.ZERO
	var front: float = 0.0
	var rear: float = 0.0
	var raw_arr: Variant = null
	if &"tire_flat_spot" in car_node:
		raw_arr = car_node.get(&"tire_flat_spot")
	elif &"tireFlatSpot" in car_node:
		raw_arr = car_node.get(&"tireFlatSpot")

	if raw_arr is Array and (raw_arr as Array).size() >= 4:
		var a: Array = raw_arr as Array
		front = maxf(float(a[0]), float(a[1]))
		rear = maxf(float(a[2]), float(a[3]))
	elif raw_arr is PackedFloat32Array and (raw_arr as PackedFloat32Array).size() >= 4:
		var pa: PackedFloat32Array = raw_arr as PackedFloat32Array
		front = maxf(pa[0], pa[1])
		rear = maxf(pa[2], pa[3])
	elif typeof(raw_arr) == TYPE_FLOAT or typeof(raw_arr) == TYPE_INT:
		front = float(raw_arr)

	var eff: float = clampf(maxf(front, rear * 0.55), 0.0, 1.0)
	return Vector2(clampf(front, 0.0, 1.0), eff)


func apply_physics_feedback(car_node: Node3D, dt: float) -> float:
	# Frame timestamp / physics-frame guard so duplicate calls in one frame execute ONCE!
	var phys_frame: int = Engine.get_physics_frames()
	var now_usec: int = Time.get_ticks_usec()
	if phys_frame == _last_feedback_physics_frame and absi(now_usec - _last_feedback_usec) < 2500:
		return self_aligning_torque
	_last_feedback_physics_frame = phys_frame
	_last_feedback_usec = now_usec

	speed_steer_authority = 1.0 # Single-authority steering angle taper lives in F1VehiclePhysics3D

	if car_node == null:
		self_aligning_torque = lerpf(self_aligning_torque, 0.0, 1.0 - exp(-18.0 * dt))
		if absf(self_aligning_torque) < 0.002:
			self_aligning_torque = 0.0
		tire_flat_spot_vibration = 0.0
		ffb_torque_normalized = self_aligning_torque
		return self_aligning_torque

	var speed_kmh: float = _get_vehicle_float(&"speed_kmh", &"speedKmh", 0.0)
	var speed_mps: float = speed_kmh / 3.6
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

	var low_speed_gate: float = smoothstep(12.0, 36.0, speed_kmh)
	target_sat *= low_speed_gate
	if absf(target_sat) < 0.01:
		target_sat = 0.0

	self_aligning_torque = lerpf(self_aligning_torque, target_sat, 1.0 - exp(-24.0 * dt))
	if absf(self_aligning_torque) < 0.002:
		self_aligning_torque = 0.0

	# Wheel-frequency tire flat-spot harmonic thump (f_w = v / (2*pi*R_wheel), purely into FFB arc & haptics)
	var flat_vec: Vector2 = _read_tire_flat_spot_severity(car_node)
	var flat_front: float = flat_vec.x
	var flat_eff: float = flat_vec.y
	var flat_ripple: float = 0.0
	if flat_eff > 0.04 and speed_mps > 4.5:
		var prev_phase: float = _flat_spot_phase_rad
		var next_phase: float = prev_phase + (speed_mps / TIRE_OUTER_RADIUS_M) * dt
		var rev_crossed: bool = floori(next_phase / TAU) > floori(prev_phase / TAU)
		_flat_spot_phase_rad = fmod(next_phase, TAU)

		var thump_crest: float = pow(0.5 + 0.5 * cos(_flat_spot_phase_rad), 4.0)
		var speed_env: float = smoothstep(20.0, 165.0, speed_kmh)
		tire_flat_spot_vibration = clampf(flat_eff * speed_env * thump_crest, 0.0, 1.0)
		flat_ripple = sin(_flat_spot_phase_rad) * flat_front * speed_env * 0.22

		if rev_crossed and flat_eff > 0.20 and speed_kmh > 52.0:
			_trigger_flat_spot_haptic(flat_eff)
	else:
		tire_flat_spot_vibration = 0.0

	ffb_torque_normalized = clampf(self_aligning_torque + flat_ripple, -1.0, 1.0)
	return self_aligning_torque


func calibrate_tilt_center() -> float:
	var raw_deg: float = _read_accelerometer_tilt_deg()
	_tilt_center_deg = raw_deg
	_tilt_needs_auto_center = false
	_tilt_filtered_steer = 0.0
	_tilt_1e_init = true
	_tilt_1e_x = 0.0
	_tilt_1e_dx = 0.0
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
	var max_tilt_deg: float = maxf(8.0, TILT_BASE_MAX_DEG / clampf(sensitivity, 0.6, 1.5))

	# 0.5 deg smooth C1 micro-deadzone + pure 1:1 linear mapping across ±26 deg + 1€ Filter (4.5Hz, β=0.45)
	var lin: float = map_smooth_c1_deadzone(delta_deg, TILT_DEADZONE_DEG, TILT_DEADZONE_KNEE_DEG, max_tilt_deg)
	var raw_steer: float = apply_steering_linearity_curve(lin, steering_linearity)
	_tilt_filtered_steer = _filter_tilt_one_euro(raw_steer, dt)
	return _tilt_filtered_steer


func _step_smooth_discrete_steer(
	current_steer: float,
	target_dir: int,
	max_target_mag: float,
	speed_kmh: float,
	fast_rate: float,
	lock_rate: float,
	counter_rate: float,
	dt: float
) -> float:
	var target: float = float(target_dir) * max_target_mag
	if target_dir != 0:
		var aligned: float = current_steer * signf(float(target_dir))
		var counter_blend: float = 1.0 - smoothstep(-0.22, 0.04, aligned)
		var lock_blend: float = smoothstep(0.14, 0.72, maxf(0.0, aligned))
		var prog_rate: float = fast_rate - (fast_rate - lock_rate) * lock_blend
		var hs_calm: float = 1.0 - 0.24 * smoothstep(140.0, 310.0, speed_kmh)
		var eff_rate: float = (prog_rate * hs_calm) * (1.0 - counter_blend) + counter_rate * counter_blend
		return clampf(lerpf(current_steer, target, 1.0 - exp(-eff_rate * dt)), -1.0, 1.0)

	if current_steer == 0.0:
		return 0.0

	var sat_guide: float = 0.0
	if absf(self_aligning_torque) > 0.04 and speed_kmh > 22.0:
		sat_guide = clampf(self_aligning_torque * sat_release_return_gain, -0.32, 0.32)
	var return_rate: float = 14.0 + 5.0 * smoothstep(0.06, 0.55, absf(current_steer))
	var next_s: float = lerpf(current_steer, sat_guide, 1.0 - exp(-return_rate * dt))
	if sat_guide == 0.0 and absf(next_s) < 0.0015:
		return 0.0
	return clampf(next_s, -1.0, 1.0)


func _compute_road_tangent_steer_assist(
	raw_steer_target: float,
	tc_assist_weight: float,
	speed_kmh: float,
	k_real_est: float
) -> float:
	if tc_assist_weight <= 0.0 or vehicle_node == null or speed_kmh < 12.0:
		road_tangent_steer_assist = 0.0
		return 0.0
	var rel_yaw: float = clampf(_get_vehicle_float(&"rel_yaw", &"relYaw", 0.0), -0.85, 0.85)
	var lat_offset: float = clampf(_get_vehicle_float(&"lateral_offset_norm", &"t", 0.0), -1.2, 1.2)
	var yaw_rate: float = clampf(_get_vehicle_float(&"yaw_rate", &"yawRate", 0.0), -3.5, 3.5)
	var speed_gate: float = smoothstep(12.0, 48.0, speed_kmh)

	var heading_corr: float = -rel_yaw * 0.58 - yaw_rate * 0.055
	var lane_center: float = -lat_offset * 0.06 if absf(lat_offset) > 0.35 else 0.0
	var curve_follow: float = clampf(k_real_est * 14.0, -0.26, 0.26)
	var center_window: float = 1.0 - smoothstep(0.04, 0.30, absf(raw_steer_target))
	var assist: float = clampf(
		(heading_corr + lane_center + curve_follow) * speed_gate * tc_assist_weight * center_window,
		-0.32,
		0.32
	)
	road_tangent_steer_assist = assist
	return assist


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

	# 0. Guarded physics FFB update (executes strictly once per physics frame; zero SAT input fighting!)
	apply_physics_feedback(vehicle_node, dt)
	var discrete_rate_sens: float = 0.76 + 0.24 * clampf(sensitivity, 0.6, 1.5)
	var tc_assist_weight: float = 1.0 if traction_control == TractionControl.FULL else (0.55 if traction_control == TractionControl.SPORT else 0.0)

	# 1. Gamepad Polling (strict >= 0.22 C1 deadzone + progressive user-friendly stick mapping)
	var gp_steer: float = 0.0
	var gp_gas: float = 0.0
	var gp_brake: float = 0.0
	var gp_dpad_dir: int = 0
	if Input.get_connected_joypads().size() > 0:
		var raw_ax: float = Input.get_joy_axis(0, JOY_AXIS_LEFT_X)
		if absf(raw_ax) > GAMEPAD_AXIS_DEADZONE:
			var max_span: float = maxf(GAMEPAD_AXIS_DEADZONE + GAMEPAD_AXIS_KNEE + 0.05, 1.0 / clampf(sensitivity, 0.6, 1.5))
			var lin_ax: float = map_smooth_c1_deadzone(raw_ax, GAMEPAD_AXIS_DEADZONE, GAMEPAD_AXIS_KNEE, max_span)
			gp_steer = apply_steering_linearity_curve(lin_ax, steering_linearity)
		var rt: float = Input.get_joy_axis(0, JOY_AXIS_TRIGGER_RIGHT)
		var lt: float = Input.get_joy_axis(0, JOY_AXIS_TRIGGER_LEFT)
		if rt > GAMEPAD_TRIGGER_DEADZONE:
			gp_gas = clampf((rt - GAMEPAD_TRIGGER_DEADZONE) / (1.0 - GAMEPAD_TRIGGER_DEADZONE), 0.0, 1.0)
		if lt > GAMEPAD_TRIGGER_DEADZONE:
			gp_brake = clampf((lt - GAMEPAD_TRIGGER_DEADZONE) / (1.0 - GAMEPAD_TRIGGER_DEADZONE), 0.0, 1.0)
		var d_left: int = 1 if Input.is_joy_button_pressed(0, JOY_BUTTON_DPAD_LEFT) else 0
		var d_right: int = 1 if Input.is_joy_button_pressed(0, JOY_BUTTON_DPAD_RIGHT) else 0
		gp_dpad_dir = d_right - d_left

	# 2. Smooth C1-continuous Keyboard / D-Pad & Touch-Arrow steering envelopes (calm, user-friendly rates, zero step kink!)
	var kb_left: int = 1 if (Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT) or gp_dpad_dir < 0) else 0
	var kb_right: int = 1 if (Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT) or gp_dpad_dir > 0) else 0
	var kb_dir: int = kb_right - kb_left
	_kb_steer = _step_smooth_discrete_steer(
		_kb_steer,
		kb_dir,
		clampf(sensitivity, 0.72, 1.0),
		speed_kmh,
		10.5 * discrete_rate_sens,
		6.5 * discrete_rate_sens,
		18.0 * discrete_rate_sens,
		dt
	)

	_arrow_ramp_steer = _step_smooth_discrete_steer(
		_arrow_ramp_steer,
		_arrow_dir,
		clampf(sensitivity, 0.72, 1.0),
		speed_kmh,
		11.5 * discrete_rate_sens,
		7.0 * discrete_rate_sens,
		19.5 * discrete_rate_sens,
		dt
	)

	# 3. Combine active steering source (SAT_ACTIVE_ASSIST_BLEND == 0.0 on all position-mapped inputs!)
	var raw_steer_target: float = steer_output
	var position_mapped_active: bool = false
	if _slider_touch_idx != -1:
		raw_steer_target = clampf(_filter_slider_one_euro(_slider_raw_steer, dt), -1.0, 1.0)
		position_mapped_active = true
	elif _wheel_touch_idx != -1 and (steering_style != SteeringStyle.TILT or _wheel_max_move_px > 10.0):
		raw_steer_target = clampf(_filter_wheel_one_euro(_wheel_raw_steer, dt), -1.0, 1.0)
		position_mapped_active = true
	elif absf(gp_steer) > 0.001 and absf(gp_steer) >= absf(_kb_steer):
		raw_steer_target = clampf(gp_steer, -1.0, 1.0)
		position_mapped_active = true
	elif _arrow_touch_idx != -1 or absf(_arrow_ramp_steer) > 0.001:
		raw_steer_target = clampf(_arrow_ramp_steer + SAT_ACTIVE_ASSIST_BLEND * self_aligning_torque, -1.0, 1.0)
	elif kb_dir != 0 or absf(_kb_steer) > 0.001:
		raw_steer_target = clampf(_kb_steer + SAT_ACTIVE_ASSIST_BLEND * self_aligning_torque, -1.0, 1.0)
	elif steering_style == SteeringStyle.TILT:
		raw_steer_target = clampf(_compute_tilt_steer(dt), -1.0, 1.0)
		position_mapped_active = true
	else:
		# Released wheel: smooth self-centering guided gently by pneumatic-trail SAT
		var sat_return: float = 0.0
		if absf(self_aligning_torque) > 0.04 and speed_kmh > 22.0:
			sat_return = clampf(self_aligning_torque * sat_release_return_gain, -0.32, 0.32)
		var ret_rate: float = 14.0 + 4.5 * smoothstep(0.05, 0.50, absf(steer_output))
		raw_steer_target = lerpf(steer_output, sat_return, 1.0 - exp(-ret_rate * dt))
		if absf(raw_steer_target) < 0.0015 and sat_return == 0.0:
			raw_steer_target = 0.0

	var k_real_est: float = upcoming_curv / 82.0 if absf(upcoming_curv) > 0.09 else upcoming_curv
	var road_assist: float = _compute_road_tangent_steer_assist(raw_steer_target, tc_assist_weight, speed_kmh, k_real_est)
	var assisted_target: float = clampf(raw_steer_target + road_assist, -1.0, 1.0)

	if tc_assist_weight > 0.0 and position_mapped_active:
		var is_counter: bool = (assisted_target * _assist_smoothed_steer) < -0.005
		var base_cut_rate: float = 26.0 if is_counter else ((18.5 + (1.0 - tc_assist_weight) * 10.0) * (1.0 - 0.18 * tc_assist_weight * smoothstep(110.0, 290.0, speed_kmh)))
		_assist_smoothed_steer = lerpf(_assist_smoothed_steer, assisted_target, 1.0 - exp(-base_cut_rate * dt))
		if absf(assisted_target - _assist_smoothed_steer) < 0.0005:
			_assist_smoothed_steer = assisted_target
		steer_output = clampf(_assist_smoothed_steer, -1.0, 1.0)
	else:
		_assist_smoothed_steer = assisted_target
		steer_output = assisted_target

	# 4. Smooth Cockpit Look-to-Apex Normalized Signal & Visor Tear-Off Sweep
	var curve_norm: float = tanh(k_real_est * 28.0)
	var target_look_apex: float = clampf(steer_output * 0.72 + curve_norm * 0.28, -1.0, 1.0)
	look_apex_normalized = lerpf(look_apex_normalized, target_look_apex, 1.0 - exp(-9.5 * dt))
	if absf(target_look_apex) < 0.003 and absf(look_apex_normalized) < 0.002:
		look_apex_normalized = 0.0
	look_apex_updated.emit(look_apex_normalized)

	_step_visor_tear_off_and_rain_shader(dt, speed_kmh)

	# 5. Pedals & Unified Brake Assist ('OFF' | 'MIN' | 'FULL'):
	#    Authoritative corner kinematic brake assist runs in `F1VehiclePhysics3D`;
	#    we send pure manual brake & read `assist_brake_applied` for live UI feedback!
	var kb_gas: float = 1.0 if (Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP)) else 0.0
	var kb_brake: float = 1.0 if (Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN)) else 0.0
	var manual_gas: float = clampf(maxf(_touch_gas, maxf(kb_gas, gp_gas)), 0.0, 1.0)
	var manual_brake: float = clampf(maxf(_touch_brake, maxf(kb_brake, gp_brake)), 0.0, 1.0)

	assist_brake_applied = clampf(_get_vehicle_float(&"assist_brake_applied", &"assistBrakeApplied", 0.0), 0.0, 1.0)
	manual_throttle_output = manual_gas
	manual_brake_output = manual_brake

	var auto_gas: float = 0.0
	if auto_throttle:
		var braking_now: float = maxf(manual_brake, assist_brake_applied)
		auto_gas = 1.0 if braking_now < 0.06 else clampf(1.0 - braking_now * 2.2, 0.0, 1.0)

	throttle_output = clampf(maxf(manual_gas, auto_gas), 0.0, 1.0)
	brake_output = manual_brake

	ffb_torque_updated.emit(ffb_torque_normalized, tire_flat_spot_vibration, assist_brake_applied)

	# Push normalized inputs + unified brake assist ('OFF'|'MIN'|'FULL') + traction control ('FULL'|'SPORT'|'OFF') onto F1VehiclePhysics3D
	if vehicle_node != null:
		if &"braking_assist_mode" in vehicle_node:
			vehicle_node.set(&"braking_assist_mode", get_braking_assist_string())
		if &"traction_control_mode" in vehicle_node:
			vehicle_node.set(&"traction_control_mode", get_traction_control_string())
		if &"steer_input" in vehicle_node:
			vehicle_node.set(&"steer_input", steer_output)
		if &"throttle_input" in vehicle_node:
			vehicle_node.set(&"throttle_input", throttle_output)
		if &"brake_input" in vehicle_node:
			vehicle_node.set(&"brake_input", brake_output)

	# 6. Update 3D Cockpit SteeringWheel (pure 1:1 ±180 deg, zero fake sine shake!), Arms, Helmet & MFD
	_update_3d_cockpit_and_telemetry(dt, speed_kmh, rpm, gear, lat_g, on_curb, in_slipstream, drs_active)

	# 7. Update 5-Mode Sim Camera Rig
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

	if speed_kmh > 30.0 and on_curb:
		_trigger_haptic_ms(10)

	# Strictly 1:1 visual wheel angle (±180 deg, zero fake sin() HUD/mesh wheel buzz!)
	var wheel_deg: float = steer_output * WHEEL_MAX_LOCK_DEG
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
		var target_yaw: float = deg_to_rad(-look_apex_normalized * 6.5)
		var target_roll: float = clampf(-lat_g * 0.032, -0.12, 0.12)
		_helmet_yaw_rad = lerpf(_helmet_yaw_rad, target_yaw, 1.0 - exp(-12.0 * dt))
		_helmet_roll_rad = lerpf(_helmet_roll_rad, target_roll, 1.0 - exp(-10.0 * dt))
		driver_helmet_mesh.rotation = Vector3(0.0, _helmet_yaw_rad, _helmet_roll_rad)

	# Multi-Function Display Readout (G6 • 2.4G / G8 • DRS / G1 • 0 deg)
	var g_txt: String = "G%d" % clampi(gear, 1, 8)
	var steer_deg_int: int = int(roundf(wheel_deg))
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
# 3. 5-MODE LOCKED-FOV SIM CAMERA DIRECTOR (CHASE, TCAM, COCKPIT, BONNET, NOSE)
# ==============================================================================
func cycle_camera_mode(step: int = 1) -> void:
	var count: int = 5
	var next_idx: int = posmod(int(camera_mode) + step, count)
	set_camera_mode_index(next_idx)


func set_camera_mode_index(mode_idx: int) -> void:
	var clamped_idx: int = posmod(mode_idx, 5)
	camera_mode = clamped_idx as CameraMode
	_sync_cockpit_interior_visibility()
	var names: Array[String] = ["CHASE", "TCAM_OVERHEAD", "COCKPIT_HELMET", "BONNET_COWLING", "HOOD_NOSE"]
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
	_in_slipstream: bool,
	_drs_active: bool
) -> void:
	if active_camera == null or vehicle_node == null:
		return

	var vp_size: Vector2 = get_viewport().get_visible_rect().size
	var aspect: float = vp_size.x / maxf(1.0, vp_size.y)
	var is_portrait: bool = aspect < 0.85

	# 1. Locked Geometric Sim FOV per Camera Mode (no arcade hyperdrive FOV warp!)
	var target_fov: float = base_fov_portrait if aspect < 0.58 else (72.0 if is_portrait else base_fov_landscape)
	match camera_mode:
		CameraMode.TCAM_OVERHEAD:
			target_fov = 74.0 if is_portrait else 62.0
		CameraMode.COCKPIT_HELMET:
			target_fov = 74.0 if is_portrait else 62.0
		CameraMode.BONNET_COWLING:
			target_fov = 72.0 if is_portrait else 60.0
		CameraMode.HOOD_NOSE:
			target_fov = 74.0 if is_portrait else 63.0
	target_fov = minf(max_fov_deg, target_fov)
	active_camera.fov = lerpf(active_camera.fov, target_fov, 1.0 - exp(-10.0 * dt))

	# 2. Subtle Kerb Sawtooth & Tire Flat-Spot Chassis Heave
	var is_onboard: bool = (camera_mode != CameraMode.CHASE)
	var kerb_amp: float = (0.014 if is_onboard else 0.024) if (on_curb and speed_kmh > 40.0) else 0.0
	var flat_heave: float = tire_flat_spot_vibration * 0.0012
	var vib_y: float = sin(_elapsed_sec * 56.0) * kerb_amp + flat_heave
	var vib_lat: float = cos(_elapsed_sec * 49.0) * (kerb_amp * 0.35)

	# 3. Critically-Damped Look-to-Apex & Chase Swing (zero raw steer_output lateral twitch!)
	var target_apex_lat: float = look_apex_normalized * (4.1 if camera_mode == CameraMode.COCKPIT_HELMET else 1.6)
	_cam_apex_look_lat = lerpf(_cam_apex_look_lat, target_apex_lat, 1.0 - exp(-9.0 * dt))
	var desired_swing: float = -steer_output * (0.20 if is_portrait else 0.24)
	_cam_apex_swing = lerpf(_cam_apex_swing, desired_swing, 1.0 - exp(-10.0 * dt))

	# 4. Mode-Specific Local Offsets (Godot -Z forward, +Y up, +X right)
	var local_offset: Vector3
	var look_ahead_m: float
	var look_height_m: float
	match camera_mode:
		CameraMode.CHASE:
			var back_d: float = (7.45 if aspect < 0.58 else 6.90) if is_portrait else 6.35
			var up_h: float = (2.48 if aspect < 0.58 else 2.36) if is_portrait else 2.24
			local_offset = Vector3(_cam_apex_swing + vib_lat, up_h + vib_y, back_d)
			look_ahead_m = 20.0 if is_portrait else 18.0
			look_height_m = 0.65 if is_portrait else 0.96
		CameraMode.TCAM_OVERHEAD:
			# Authentic FOM -0.085m left-offset roll-hoop TV onboard
			local_offset = Vector3(-0.085 + vib_lat * 0.4, 1.16 + vib_y, 0.48)
			look_ahead_m = 34.0
			look_height_m = 0.84 if is_portrait else 0.98
		CameraMode.COCKPIT_HELMET:
			local_offset = Vector3(vib_lat * 0.30, 0.655 + vib_y * 0.65, -0.21)
			look_ahead_m = 36.0
			look_height_m = 0.62
		CameraMode.BONNET_COWLING:
			# Clean sim view over front bulkhead & working front suspension without Halo
			local_offset = Vector3(vib_lat * 0.28, 0.72 + vib_y * 0.55, -0.88)
			look_ahead_m = 38.0
			look_height_m = 0.56
		CameraMode.HOOD_NOSE:
			local_offset = Vector3(vib_lat * 0.25, 0.38 + vib_y * 0.50, -1.78)
			look_ahead_m = 42.0
			look_height_m = 0.36

	var car_xform: Transform3D = vehicle_node.global_transform
	var desired_world_pos: Vector3 = car_xform * local_offset
	var desired_world_look: Vector3 = car_xform * Vector3(_cam_apex_look_lat, look_height_m, -look_ahead_m)

	if not _cam_initialized or is_onboard:
		_cam_smoothed_pos = desired_world_pos
		_cam_smoothed_look = desired_world_look
		_cam_initialized = true
	else:
		_cam_smoothed_pos = _cam_smoothed_pos.lerp(desired_world_pos, 1.0 - exp(-16.5 * dt))
		_cam_smoothed_look = _cam_smoothed_look.lerp(desired_world_look, 1.0 - exp(-19.0 * dt))

	active_camera.global_position = _cam_smoothed_pos
	active_camera.look_at(_cam_smoothed_look, car_xform.basis.y)

	# 5. Inertial Chassis Pitch/Roll, Lateral G-Force Roll & 35% Horizon Lock
	var track_bank_rad: float = _get_vehicle_float(&"track_banking_rad", &"bankingRad", 0.0)
	var chassis_pitch_rad: float = _get_vehicle_float(&"chassis_pitch_rad", &"chassisPitchRad", 0.0)
	var chassis_roll_rad: float = _get_vehicle_float(&"chassis_roll_rad", &"chassisRollRad", 0.0)
	var target_roll: float = clampf(-lat_g * 0.010 + chassis_roll_rad * 0.65, -0.058, 0.058) - (track_bank_rad * 0.35)
	var target_pitch: float = clampf(-long_g * 0.0085 + chassis_pitch_rad * 0.70, -0.045, 0.036)
	_cam_roll_rad = lerpf(_cam_roll_rad, target_roll, 1.0 - exp(-10.0 * dt))
	_cam_pitch_rad = lerpf(_cam_pitch_rad, target_pitch, 1.0 - exp(-11.0 * dt))

	active_camera.rotate_object_local(Vector3.RIGHT, _cam_pitch_rad)
	active_camera.rotate_object_local(Vector3.FORWARD, _cam_roll_rad)


func _apply_control_visual_settings() -> void:
	for ctrl: Control in [wheel_zone_control, slider_zone_control, arrow_zone_control, pedal_zone_control]:
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


func _trigger_flat_spot_haptic(severity: float) -> void:
	if not haptics_enabled:
		return
	var now: int = Time.get_ticks_msec()
	if now - _last_flat_spot_haptic_msec < 110:
		return
	_last_flat_spot_haptic_msec = now
	var dur: int = clampi(int(roundf(5.0 + severity * 6.0)), 5, 11)
	Input.vibrate_handheld(dur)


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
