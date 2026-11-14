class_name Retro1982Mode
extends CanvasLayer
## ==============================================================================
## RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX (GODOT 4.3)
## Agent: @retro1982 (1982 Namco Original 1:1 Engine Lead)
## File: godot_project/scripts/retro_1982_mode.gd
##
## Complete Godot 4.3 1982 Namco System-1 Mode & Procedural Pixel-Art Overlay:
## 1. Live Hot-Swap (`V` key or `toggle_retro_mode()`) between 2026 AAA 3D PBR
##    and 1982 Namco Arcade Raster-Scanline & Trinitron CRT Quantizer.
## 2. Full 4-Camera Parity (`0`: Chase, `1`: Halo T-Cam, `2`: 1st-Person Pixel
##    Cockpit with Live Rear-View Wing Mirrors, 10-LED Dash & Rotating MOMO
##    Leather Wheel + Nomex Gloves, `3`: Low Asphalt Nose / Front-Wing Cam).
## 3. Built-in 5x7 1982 Namco Arcade Bitmap Font Renderer (TOP, SCORE, TIME,
##    LAP, POS, KM/H, Gear, 4-Tire Thermal/Wear + Wing Damage + ERS/DRS Pod,
##    Sector Split Popups, "CROWD ROAR!", and 6-Man Animated Pixel Pit Stop!).
## ==============================================================================

signal retro_mode_changed(enabled: bool)
signal retro_camera_changed(camera_mode: int)

enum CameraView1982 {
	CHASE = 0,
	TCAM_OVERHEAD = 1,
	COCKPIT_FIRST_PERSON = 2,
	NOSE_WING = 3,
}

@export_group("1982 Arcade Mode Settings")
@export var start_in_retro_1982: bool = false
@export var allow_keyboard_toggle_v: bool = true
@export var crt_scanline_strength: float = 0.22
@export var crt_curvature: float = 0.020
@export var palette_levels: float = 8.0

@export_group("Optional Scene Node Bindings")
@export var player_vehicle_path: NodePath
@export var camera_rig_path: NodePath
@export var weather_manager_path: NodePath

const CRT_SHADER_RES_PATH: String = "res://shaders/crt_1982_arcade.gdshader"

const COMPOUND_COLORS: Dictionary = {
	"SOFT": Color(1.0, 0.125, 0.125, 1.0),
	"MEDIUM": Color(0.988, 0.957, 0.0, 1.0),
	"HARD": Color(0.973, 0.973, 0.973, 1.0),
	"INTERMEDIATE": Color(0.0, 0.988, 0.345, 1.0),
	"FULL_WET": Color(0.157, 0.596, 1.0, 1.0),
}

const RIVAL_MIRROR_PALETTES: Array[Color] = [
	Color(0.988, 0.847, 0.0, 1.0),
	Color(0.0, 0.847, 0.973, 1.0),
	Color(0.0, 0.784, 0.220, 1.0),
	Color(0.988, 0.408, 0.0, 1.0),
	Color(0.722, 0.220, 0.973, 1.0),
	Color(0.816, 0.847, 0.894, 1.0),
]

const CAMERA_LABELS_1982: Array[String] = [
	"CAM: 1982 CHASE",
	"CAM: HALO T-CAM",
	"CAM: 1ST-PERSON COCKPIT",
	"CAM: NOSE WING CAM",
]

# Authentic 5x7 1982 Namco Arcade Bitmap Font (7 rows per glyph, 5-bit row mask)
const FONT_5X7: Dictionary = {
	" ": [0, 0, 0, 0, 0, 0, 0],
	"0": [14, 17, 19, 21, 25, 17, 14],
	"1": [4, 12, 4, 4, 4, 4, 14],
	"2": [14, 17, 1, 6, 8, 16, 31],
	"3": [30, 1, 1, 14, 1, 1, 30],
	"4": [2, 6, 10, 18, 31, 2, 2],
	"5": [31, 16, 30, 1, 1, 17, 14],
	"6": [6, 8, 16, 30, 17, 17, 14],
	"7": [31, 1, 2, 4, 8, 8, 8],
	"8": [14, 17, 17, 14, 17, 17, 14],
	"9": [14, 17, 17, 15, 1, 2, 12],
	"A": [14, 17, 17, 31, 17, 17, 17],
	"B": [30, 17, 17, 30, 17, 17, 30],
	"C": [14, 17, 16, 16, 16, 17, 14],
	"D": [28, 18, 17, 17, 17, 18, 28],
	"E": [31, 16, 16, 30, 16, 16, 31],
	"F": [31, 16, 16, 30, 16, 16, 16],
	"G": [14, 17, 16, 23, 17, 17, 15],
	"H": [17, 17, 17, 31, 17, 17, 17],
	"I": [14, 4, 4, 4, 4, 4, 14],
	"J": [7, 2, 2, 2, 18, 18, 12],
	"K": [17, 18, 20, 24, 20, 18, 17],
	"L": [16, 16, 16, 16, 16, 16, 31],
	"M": [17, 27, 21, 21, 17, 17, 17],
	"N": [17, 25, 21, 19, 17, 17, 17],
	"O": [14, 17, 17, 17, 17, 17, 14],
	"P": [30, 17, 17, 30, 16, 16, 16],
	"Q": [14, 17, 17, 17, 21, 18, 13],
	"R": [30, 17, 17, 30, 20, 18, 17],
	"S": [15, 16, 16, 14, 1, 1, 30],
	"T": [31, 4, 4, 4, 4, 4, 4],
	"U": [17, 17, 17, 17, 17, 17, 14],
	"V": [17, 17, 17, 17, 17, 10, 4],
	"W": [17, 17, 17, 21, 21, 27, 17],
	"X": [17, 17, 10, 4, 10, 17, 17],
	"Y": [17, 17, 10, 4, 4, 4, 4],
	"Z": [31, 1, 2, 4, 8, 16, 31],
	".": [0, 0, 0, 0, 0, 12, 12],
	":": [0, 12, 12, 0, 12, 12, 0],
	"'": [4, 4, 8, 0, 0, 0, 0],
	"\"": [10, 10, 10, 0, 0, 0, 0],
	"!": [4, 4, 4, 4, 4, 0, 4],
	"-": [0, 0, 0, 31, 0, 0, 0],
	"+": [0, 4, 4, 31, 4, 4, 0],
	"/": [1, 2, 4, 4, 8, 16, 0],
	"#": [10, 31, 10, 10, 31, 10, 0],
}

var _retro_enabled: bool = false
var _camera_mode: int = CameraView1982.CHASE
var _cam_toast_timer: float = 0.0
var _elapsed_sec: float = 0.0
var _wheel_spin_dist: float = 0.0

var _back_buffer: BackBufferCopy
var _crt_rect: ColorRect
var _shader_mat: ShaderMaterial
var _pixel_canvas: _RetroPixelOverlayControl

var _player_node: Node3D
var _camera_rig_node: Node
var _weather_node: Node
var _rival_nodes: Array[Node3D] = []

# Live Telemetry State (Updated via Scene Auto-Sync OR `update_telemetry(...)`)
var _speed_kmh: float = 0.0
var _rpm: float = 4000.0
var _gear: int = 1
var _gearbox_mode: String = "AUTO_8SPD"
var _steer_input: float = 0.0
var _throttle_input: float = 0.0
var _brake_input: float = 0.0
var _drs_active: bool = false
var _in_slipstream: bool = false
var _ers_charge: float = 1.0
var _ers_deploying: bool = false
var _on_curb: bool = false
var _compound: String = "SOFT"
var _next_pit_compound: String = "MEDIUM"
var _tire_temps_c: Array[float] = [88.0, 88.0, 90.0, 90.0]
var _tire_life_01: Array[float] = [1.0, 1.0, 1.0, 1.0]
var _wheel_comp: Array[float] = [0.0, 0.0, 0.0, 0.0]
var _front_wing_damage: float = 0.0
var _rear_wing_damage: float = 0.0
var _chassis_roll_rad: float = 0.0

var _score: int = 0
var _top_score: int = 25000
var _timer_sec: float = 75.0
var _lap_time_sec: float = 0.0
var _current_lap: int = 1
var _total_laps: int = 4
var _player_pos: int = 1
var _total_cars: int = 8
var _prev_pos: int = 0
var _center_callout: String = ""
var _sector_popup_text: String = ""
var _sector_popup_green: bool = true
var _sector_popup_timer: float = 0.0
var _crowd_roar_timer: float = 0.0
var _crowd_excitement: float = 0.0

var _in_pit_stop: bool = false
var _pit_progress_01: float = 0.0
var _pit_remaining_sec: float = 0.0
var _pit_sub_phase: String = ""

var _is_rainy: bool = false
var _is_monsoon: bool = false
var _lightning_flash: float = 0.0
var _checkered_border: bool = false


func _ready() -> void:
	layer = 18
	process_mode = Node.PROCESS_MODE_ALWAYS
	_build_post_fx_and_overlay()
	_resolve_scene_nodes()
	set_retro_enabled(start_in_retro_1982)


func _build_post_fx_and_overlay() -> void:
	_back_buffer = BackBufferCopy.new()
	_back_buffer.name = "Retro1982BackBuffer"
	_back_buffer.copy_mode = BackBufferCopy.COPY_MODE_VIEWPORT
	add_child(_back_buffer)

	_crt_rect = ColorRect.new()
	_crt_rect.name = "CRT1982PostRect"
	_crt_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_crt_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_crt_rect.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST

	_shader_mat = ShaderMaterial.new()
	if ResourceLoader.exists(CRT_SHADER_RES_PATH):
		var sh: Shader = load(CRT_SHADER_RES_PATH) as Shader
		if sh != null:
			_shader_mat.shader = sh
	_crt_rect.material = _shader_mat
	add_child(_crt_rect)

	_pixel_canvas = _RetroPixelOverlayControl.new()
	_pixel_canvas.name = "Retro1982PixelCanvas"
	_pixel_canvas.owner_mode = self
	_pixel_canvas.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_pixel_canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pixel_canvas.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	add_child(_pixel_canvas)


func _resolve_scene_nodes() -> void:
	if not player_vehicle_path.is_empty():
		_player_node = get_node_or_null(player_vehicle_path) as Node3D
	if not camera_rig_path.is_empty():
		_camera_rig_node = get_node_or_null(camera_rig_path)
	if not weather_manager_path.is_empty():
		_weather_node = get_node_or_null(weather_manager_path)

	var root: Node = get_tree().current_scene
	if root == null:
		return
	if _player_node == null:
		_player_node = _find_node_by_script_class(root, "F1VehiclePhysics3D") as Node3D
	if _camera_rig_node == null:
		_camera_rig_node = _find_node_by_script_class(root, "MobileTouchAndCamera3D")
	if _weather_node == null:
		_weather_node = _find_node_by_script_class(root, "WeatherAndVFXManager")

	_rival_nodes.clear()
	_collect_rival_vehicles(root)


func _find_node_by_script_class(node: Node, target_name: String) -> Node:
	var scr: Script = node.get_script() as Script
	if scr != null and scr.get_global_name() == target_name:
		return node
	for child in node.get_children():
		var found: Node = _find_node_by_script_class(child, target_name)
		if found != null:
			return found
	return null


func _collect_rival_vehicles(node: Node) -> void:
	if node is Node3D and node != _player_node:
		var scr: Script = node.get_script() as Script
		if scr != null and (scr.get_global_name() == "AIDriverController" or node.name.begins_with("Rival") or node.is_in_group("ai_cars")):
			_rival_nodes.append(node as Node3D)
	for child in node.get_children():
		_collect_rival_vehicles(child)


func _unhandled_input(event: InputEvent) -> void:
	if not allow_keyboard_toggle_v:
		return
	if event is InputEventKey:
		var key_ev: InputEventKey = event as InputEventKey
		if key_ev.pressed and not key_ev.echo and key_ev.keycode == KEY_V:
			toggle_retro_mode()
			get_viewport().set_input_as_handled()


# ==============================================================================
# PUBLIC API FOR MAIN_RACE_COORDINATOR & UI BUTTONS
# ==============================================================================
func set_retro_enabled(active: bool) -> void:
	_retro_enabled = active
	visible = _retro_enabled
	if _crt_rect != null:
		_crt_rect.visible = _retro_enabled
	if _pixel_canvas != null:
		_pixel_canvas.visible = _retro_enabled
	if _shader_mat != null:
		_shader_mat.set_shader_parameter("retro_enabled", _retro_enabled)
		_shader_mat.set_shader_parameter("scanline_strength", crt_scanline_strength)
		_shader_mat.set_shader_parameter("crt_curvature", crt_curvature)
		_shader_mat.set_shader_parameter("palette_levels", palette_levels)
	retro_mode_changed.emit(_retro_enabled)


func toggle_retro_mode() -> bool:
	set_retro_enabled(not _retro_enabled)
	return _retro_enabled


func is_retro_enabled() -> bool:
	return _retro_enabled


func set_camera_mode(mode_idx: int) -> void:
	var clamped: int = clampi(mode_idx, 0, 3)
	if clamped != _camera_mode:
		_camera_mode = clamped
		_cam_toast_timer = 1.85
		retro_camera_changed.emit(_camera_mode)


func show_sector_delta(label: String, is_improvement: bool = true) -> void:
	_sector_popup_text = label.strip_edges().to_upper()
	_sector_popup_green = is_improvement
	_sector_popup_timer = 2.6


func trigger_crowd_roar(excitement_boost: float = 1.0) -> void:
	_crowd_excitement = clampf(excitement_boost, 0.0, 1.0)
	_crowd_roar_timer = 2.4


func update_telemetry(state: Dictionary) -> void:
	if state.has("camera_mode"):
		set_camera_mode(int(state["camera_mode"]))
	elif state.has("cameraIndex"):
		set_camera_mode(int(state["cameraIndex"]))

	if state.has("speed_kmh"):
		_speed_kmh = float(state["speed_kmh"])
	if state.has("rpm"):
		_rpm = float(state["rpm"])
	if state.has("gear"):
		_gear = int(state["gear"])
	if state.has("gearbox_mode"):
		_gearbox_mode = String(state["gearbox_mode"])
	if state.has("steer_input"):
		_steer_input = float(state["steer_input"])
	if state.has("brake_input"):
		_brake_input = float(state["brake_input"])
	if state.has("drs_active"):
		_drs_active = bool(state["drs_active"])
	if state.has("in_slipstream"):
		_in_slipstream = bool(state["in_slipstream"])
	if state.has("ers_charge"):
		_ers_charge = clampf(float(state["ers_charge"]), 0.0, 1.0)
	if state.has("ers_deploying"):
		_ers_deploying = bool(state["ers_deploying"])
	if state.has("compound"):
		_compound = String(state["compound"])
	if state.has("next_pit_compound"):
		_next_pit_compound = String(state["next_pit_compound"])
	if state.has("score"):
		_score = int(state["score"])
	if state.has("top_score"):
		_top_score = int(state["top_score"])
	if state.has("timer_sec"):
		_timer_sec = float(state["timer_sec"])
	if state.has("lap_time_sec"):
		_lap_time_sec = float(state["lap_time_sec"])
	if state.has("current_lap"):
		_current_lap = int(state["current_lap"])
	if state.has("total_laps"):
		_total_laps = int(state["total_laps"])
	if state.has("player_pos"):
		var new_pos: int = int(state["player_pos"])
		if _prev_pos > 0 and new_pos < _prev_pos:
			trigger_crowd_roar(1.0)
		_player_pos = new_pos
		_prev_pos = new_pos
	if state.has("total_cars"):
		_total_cars = int(state["total_cars"])
	if state.has("center_callout"):
		_center_callout = String(state["center_callout"])
	if state.has("in_pit_stop"):
		_in_pit_stop = bool(state["in_pit_stop"])
	if state.has("pit_progress_01"):
		_pit_progress_01 = clampf(float(state["pit_progress_01"]), 0.0, 1.0)
	if state.has("pit_remaining_sec"):
		_pit_remaining_sec = float(state["pit_remaining_sec"])
	if state.has("pit_sub_phase"):
		_pit_sub_phase = String(state["pit_sub_phase"])
	if state.has("is_rainy"):
		_is_rainy = bool(state["is_rainy"])
	if state.has("lightning_flash"):
		_lightning_flash = clampf(float(state["lightning_flash"]), 0.0, 1.0)
	if state.has("checkered_border"):
		_checkered_border = bool(state["checkered_border"])


# ==============================================================================
# LIVE PER-FRAME SCENE TELEMETRY SYNC & CRT UNIFORM UPDATES
# ==============================================================================
func _process(delta: float) -> void:
	if not _retro_enabled:
		return

	_elapsed_sec += delta
	_cam_toast_timer = maxf(0.0, _cam_toast_timer - delta)
	_sector_popup_timer = maxf(0.0, _sector_popup_timer - delta)
	_crowd_roar_timer = maxf(0.0, _crowd_roar_timer - delta)
	_crowd_excitement = maxf(0.0, _crowd_excitement - delta * 0.35)

	_auto_sync_from_scene_nodes()
	_wheel_spin_dist += (_speed_kmh / 3.6) * delta

	if _shader_mat != null:
		var boost_amt: float = 1.0 if (_drs_active or _in_slipstream) and _speed_kmh > 185.0 else 0.0
		_shader_mat.set_shader_parameter("drs_boost_flash", boost_amt)
		_shader_mat.set_shader_parameter("lightning_flash", _lightning_flash)
		_shader_mat.set_shader_parameter("checkered_border_active", _checkered_border)

	if _pixel_canvas != null:
		_pixel_canvas.queue_redraw()


func _auto_sync_from_scene_nodes() -> void:
	if _camera_rig_node != null and "current_camera_mode" in _camera_rig_node:
		set_camera_mode(int(_camera_rig_node.get("current_camera_mode")))

	if _player_node != null:
		if _player_node is RigidBody3D:
			var rb: RigidBody3D = _player_node as RigidBody3D
			_speed_kmh = rb.linear_velocity.length() * 3.6
		if "current_rpm" in _player_node:
			_rpm = float(_player_node.get("current_rpm"))
		if "current_gear" in _player_node:
			_gear = int(_player_node.get("current_gear"))
		if "gearbox_mode" in _player_node:
			_gearbox_mode = String(_player_node.get("gearbox_mode"))
		if "steer_input" in _player_node:
			_steer_input = float(_player_node.get("steer_input"))
		if "brake_input" in _player_node:
			_brake_input = float(_player_node.get("brake_input"))
		if "drs_active" in _player_node:
			_drs_active = bool(_player_node.get("drs_active"))
		if "in_slipstream" in _player_node:
			_in_slipstream = bool(_player_node.get("in_slipstream"))
		if "ers_charge" in _player_node:
			_ers_charge = clampf(float(_player_node.get("ers_charge")), 0.0, 1.0)
		_chassis_roll_rad = clampf(_player_node.rotation.z, -0.15, 0.15)

	if _weather_node != null:
		if "wetness_intensity" in _weather_node:
			var wet: float = float(_weather_node.get("wetness_intensity"))
			_is_rainy = wet > 0.25
			_is_monsoon = wet > 0.72
		if "lightning_flash_alpha" in _weather_node:
			_lightning_flash = clampf(float(_weather_node.get("lightning_flash_alpha")), 0.0, 1.0)


# ==============================================================================
# PROCEDURAL 1982 PIXEL-ART FOREGROUND & BITMAP HUD PAINTER
# ==============================================================================
func _paint_retro_overlay(ctrl: Control) -> void:
	var vp_size: Vector2 = ctrl.size
	if vp_size.x < 16.0 or vp_size.y < 16.0:
		return

	var aspect: float = vp_size.x / maxf(vp_size.y, 1.0)
	var is_portrait: bool = aspect < 0.85
	var vw: float = 196.0 if is_portrait else clampf(round(240.0 * aspect), 240.0, 560.0)
	var vh: float = clampf(round(196.0 / maxf(aspect, 0.35)), 240.0, 500.0) if is_portrait else 240.0
	var sx: float = vp_size.x / vw
	var sy: float = vp_size.y / vh
	ctrl.draw_set_transform(Vector2.ZERO, 0.0, Vector2(sx, sy))

	var W: int = int(vw)
	var H: int = int(vh)
	# Keep foreground cars/cockpits above lower ~24% mobile portrait touch controls!
	var safe_bottom_y: int = (H - int(round(float(H) * 0.24))) if is_portrait else H

	# 1. High-Speed (>280 km/h) or DRS Radial Pixel Speed Lines
	if _speed_kmh > 280.0 or ((_drs_active or _in_slipstream) and _speed_kmh > 185.0):
		_draw_speed_wind_lines(ctrl, W, H, safe_bottom_y)

	# 2. Camera-Specific 1982 Pixel Foreground (Cockpit, T-Cam, Nose Wing, or Pit Crew!)
	if _camera_mode == CameraView1982.COCKPIT_FIRST_PERSON:
		_draw_cockpit_first_person(ctrl, W, H, safe_bottom_y, is_portrait)
	elif _camera_mode == CameraView1982.TCAM_OVERHEAD:
		_draw_tcam_foreground(ctrl, W, H, safe_bottom_y, is_portrait)
	elif _camera_mode == CameraView1982.NOSE_WING:
		_draw_nose_wing_foreground(ctrl, W, H, safe_bottom_y, is_portrait)
	elif _in_pit_stop:
		_draw_chase_pit_crew_overlay(ctrl, W, safe_bottom_y)

	# 3. Wet-Weather Onboard Visor Pixel Raindrops
	if _is_rainy and _camera_mode >= CameraView1982.TCAM_OVERHEAD:
		_draw_visor_raindrops(ctrl, W, safe_bottom_y)

	# 4. Authentic 1:1 1982 Namco Top Arcade Bitmap HUD & Telemetry Pod
	_draw_arcade_top_hud(ctrl, W, H, is_portrait)


func _px_rect(ctrl: Control, x: int, y: int, w: int, h: int, col: Color) -> void:
	if w > 0 and h > 0:
		ctrl.draw_rect(Rect2(float(x), float(y), float(w), float(h)), col)


func _draw_pixel_text(ctrl: Control, txt: String, x: int, y: int, col: Color, scale_px: int = 1, align_mode: int = 0, step_px: int = 6) -> void:
	var upper: String = txt.to_upper()
	var n: int = upper.length()
	if n == 0:
		return
	var step: int = step_px * scale_px if scale_px > 1 else step_px
	var total_w: int = (n - 1) * step + 5 * scale_px
	var start_x: int = x
	if align_mode == 1:
		start_x = x - (total_w >> 1)
	elif align_mode == 2:
		start_x = x - total_w

	var shadow: Color = Color(0.0, 0.0, 0.0, 0.92)
	# Pass 1: 1px black arcade drop-outline
	for i in range(n):
		var ch: String = upper.substr(i, 1)
		if ch == " " or not FONT_5X7.has(ch):
			continue
		var rows: Array = FONT_5X7[ch]
		var gx: int = start_x + i * step
		for r in range(7):
			var mask: int = int(rows[r])
			if mask == 0:
				continue
			for c in range(5):
				if (mask & (1 << (4 - c))) != 0:
					_px_rect(ctrl, gx + c * scale_px - 1, y + r * scale_px, scale_px + 2, scale_px + 1, shadow)

	# Pass 2: Foreground crisp bitmap glyph pixels
	for i in range(n):
		var ch: String = upper.substr(i, 1)
		if ch == " " or not FONT_5X7.has(ch):
			continue
		var rows: Array = FONT_5X7[ch]
		var gx: int = start_x + i * step
		for r in range(7):
			var mask: int = int(rows[r])
			if mask == 0:
				continue
			for c in range(5):
				if (mask & (1 << (4 - c))) != 0:
					_px_rect(ctrl, gx + c * scale_px, y + r * scale_px, scale_px, scale_px, col)


func _draw_speed_wind_lines(ctrl: Control, W: int, _H: int, safe_bottom_y: int) -> void:
	var col: Color = Color(0.41, 0.93, 1.0, 0.9) if (_drs_active or _in_slipstream) else Color(0.97, 0.97, 0.97, 0.85)
	var tick: int = int(_elapsed_sec * 42.0)
	for i in range(10):
		var side: int = -1 if (i % 2 == 0) else 1
		var phase: float = float((i * 19 + tick * 3) % 24) / 24.0
		var y: int = int(96.0 + phase * float(max(20, safe_bottom_y - 104)))
		var edge_x: int = int((1.0 - phase) * float(W) * 0.22) if side < 0 else int(float(W) - (1.0 - phase) * float(W) * 0.22)
		var line_w: int = max(3, int(4.0 + phase * 11.0))
		_px_rect(ctrl, edge_x if side < 0 else edge_x - line_w, y, line_w, 1, col)


func _draw_cockpit_first_person(ctrl: Control, W: int, H: int, bottom_y: int, is_narrow: bool) -> void:
	var roll_px: int = int(clampf(_chassis_roll_rad * 95.0, -6.0, 6.0))
	var cx: int = (W >> 1) + roll_px
	var steer_px: int = int(round(clampf(_steer_input, -1.0, 1.0) * (6.0 if is_narrow else 9.0)))
	var tire_phase: int = int(floor(_wheel_spin_dist * 1.4)) & 1
	var comp_key: String = _next_pit_compound if (_in_pit_stop and _pit_progress_01 >= 0.52) else _compound
	var comp_col: Color = COMPOUND_COLORS.get(comp_key, COMPOUND_COLORS["SOFT"])

	var cowl_top_y: int = bottom_y - (44 if is_narrow else 50)
	var wheel_w: int = 16 if is_narrow else 24
	var wheel_h: int = 28 if is_narrow else 34
	var wheel_out_half: int = 66 if is_narrow else mini(int(float(W) * 0.36), 116)
	var wheel_base_y: int = cowl_top_y - (26 if is_narrow else 32)
	var curb_jolt: int = (-2 if ((int(_elapsed_sec * 42.0) & 1) == 0) else 1) if (_on_curb and _speed_kmh > 20.0) else 0
	var fl_bounce: int = curb_jolt - int(clampf(_wheel_comp[0], -0.4, 0.8) * 5.0)
	var fr_bounce: int = -curb_jolt - int(clampf(_wheel_comp[1], -0.4, 0.8) * 5.0)

	# 1. Chrome Double-Wishbone Suspension + Exposed Steering/Spinning Front Slicks!
	var chrome: Color = Color(0.68, 0.73, 0.82, 1.0)
	_px_rect(ctrl, cx - wheel_out_half + wheel_w - 1, wheel_base_y + 10 + fl_bounce, maxi(6, wheel_out_half - wheel_w - 12), 2, chrome)
	_px_rect(ctrl, cx - wheel_out_half + wheel_w - 1, wheel_base_y + 21 + fl_bounce, maxi(6, wheel_out_half - wheel_w - 9), 2, chrome)
	_px_rect(ctrl, cx + 13, wheel_base_y + 10 + fr_bounce, maxi(6, wheel_out_half - wheel_w - 12), 2, chrome)
	_px_rect(ctrl, cx + 10, wheel_base_y + 21 + fr_bounce, maxi(6, wheel_out_half - wheel_w - 9), 2, chrome)

	for side_idx in range(2):
		var side: int = -1 if side_idx == 0 else 1
		var b_y: int = fl_bounce if side < 0 else fr_bounce
		var wx: int = (cx - wheel_out_half if side < 0 else cx + wheel_out_half - wheel_w) + steer_px
		var wy: int = wheel_base_y + b_y
		_px_rect(ctrl, wx, wy, wheel_w, wheel_h, Color(0.06, 0.07, 0.10, 1.0))
		_px_rect(ctrl, wx + 2, wy + 2, wheel_w - 4, wheel_h - 4, Color(0.14, 0.17, 0.22, 1.0))
		var bar_shift: int = 5 if tire_phase == 1 else 0
		var ty: int = wy + 4 + bar_shift
		while ty < wy + wheel_h - 4:
			_px_rect(ctrl, wx + 3, ty, wheel_w - 6, 2, Color(0.41, 0.46, 0.55, 1.0))
			ty += 9
		_px_rect(ctrl, (wx + wheel_w - 4) if side < 0 else (wx + 2), wy + 4, 2, wheel_h - 8, comp_col)
		if _brake_input > 0.18 and _speed_kmh > 65.0:
			_px_rect(ctrl, (wx + wheel_w) if side < 0 else (wx - 2), wy + 10, 2, wheel_h - 20, Color(1.0, 0.24, 0.0, 1.0))

	# 2. Riveted Crimson/White/Blue #1 Nosecone & Aero Cowling
	var nose_tip_y: int = cowl_top_y - (18 if is_narrow else 22)
	for ny in range(nose_tip_y, cowl_top_y + 1):
		var frac: float = float(ny - nose_tip_y) / float(maxi(1, cowl_top_y - nose_tip_y))
		var half_w: int = int(round((9.0 if is_narrow else 12.0) + frac * (26.0 if is_narrow else 38.0)))
		var row_cx: int = cx + int(round((1.0 - frac) * float(steer_px) * 0.35))
		_px_rect(ctrl, row_cx - half_w, ny, half_w * 2, 1, Color(0.61, 0.05, 0.08, 1.0))
		_px_rect(ctrl, row_cx - half_w + 3, ny, maxi(2, (half_w - 3) * 2), 1, Color(0.89, 0.09, 0.12, 1.0))
		var s_half: int = maxi(2, int(round(2.0 + frac * 5.0)))
		_px_rect(ctrl, row_cx - s_half, ny, s_half * 2, 1, Color(0.97, 0.97, 0.97, 1.0))
	_draw_pixel_text(ctrl, "1", cx, cowl_top_y - 12, Color(0.95, 0.12, 0.12, 1.0), 1, 1, 5)

	# 3. Titanium Halo Center Pillar & Upper Brow Arch
	var halo_y: int = 34 if is_narrow else 30
	_px_rect(ctrl, 0, halo_y, W, 3, Color(0.10, 0.12, 0.17, 1.0))
	_px_rect(ctrl, cx - 1, halo_y + 3, 3, maxi(4, nose_tip_y - (halo_y + 3)), Color(0.14, 0.17, 0.24, 1.0))

	# 4. Live Left & Right Pixel Wing Mirrors (Projecting Trailing Rivals 0.6m..65m Behind!)
	_draw_cockpit_wing_mirrors(ctrl, W, cx, cowl_top_y, is_narrow)

	# 5. Carbon Cockpit Surround & 10-LED F1 Digital Dashboard
	_px_rect(ctrl, 0, cowl_top_y, W, bottom_y - cowl_top_y, Color(0.07, 0.09, 0.13, 1.0))
	_px_rect(ctrl, 0, cowl_top_y, W, 2, Color(0.78, 0.08, 0.11, 1.0))
	var dash_w: int = 82 if is_narrow else 102
	var dash_x: int = cx - (dash_w >> 1)
	var dash_y: int = cowl_top_y + 1
	_px_rect(ctrl, dash_x, dash_y, dash_w, 21, Color(0.03, 0.04, 0.07, 1.0))

	var rpm_frac: float = clampf((_rpm - 4200.0) / (12500.0 - 4200.0), 0.0, 1.0)
	var leds_lit: int = int(round(rpm_frac * 10.0))
	var blue_strobe: bool = _rpm >= 11800.0 and ((int(_elapsed_sec * 24.0) & 1) == 0)
	var led_x0: int = dash_x + ((dash_w - 40) >> 1)
	for l in range(10):
		var l_col: Color = Color(0.11, 0.14, 0.20, 1.0)
		if l < leds_lit:
			if blue_strobe:
				l_col = Color(0.22, 0.85, 1.0, 1.0)
			elif l < 4:
				l_col = Color(0.0, 0.99, 0.35, 1.0)
			elif l < 7:
				l_col = Color(0.99, 0.96, 0.0, 1.0)
			else:
				l_col = Color(1.0, 0.13, 0.13, 1.0)
		_px_rect(ctrl, led_x0 + l * 4, dash_y + 2, 3, 3, l_col)

	var g_txt: String = ("H" if _gear > 1 else "L") if _gearbox_mode == "CLASSIC_2SPD" else ("G" + str(_gear))
	_draw_pixel_text(ctrl, str(int(round(_speed_kmh))).lpad(3, " "), dash_x + 3, dash_y + 7, Color(0.33, 0.88, 1.0, 1.0), 1, 0, 5)
	_draw_pixel_text(ctrl, g_txt, cx, dash_y + 7, Color(0.99, 0.96, 0.0, 1.0), 1, 1, 5)
	_px_rect(ctrl, dash_x + dash_w - 20, dash_y + 7, 17, 6, Color(0.0, 0.99, 0.35, 1.0) if _drs_active else Color(0.12, 0.16, 0.22, 1.0))
	if _drs_active:
		_draw_pixel_text(ctrl, "DRS", dash_x + dash_w - 11, dash_y + 7, Color.WHITE, 1, 1, 5)
	_px_rect(ctrl, dash_x + 4, dash_y + 16, dash_w - 8, 3, Color(0.09, 0.13, 0.20, 1.0))
	_px_rect(ctrl, dash_x + 4, dash_y + 16, int(round(float(dash_w - 8) * _ers_charge)), 3, Color.WHITE if _ers_deploying else Color(0.0, 0.89, 1.0, 1.0))

	# 6. Rotating 3-Spoke MOMO Leather Pixel Steering Wheel + Red/White Nomex Gloves!
	_draw_momo_wheel_and_gloves(ctrl, cx, bottom_y - 10, clampf(_steer_input, -1.0, 1.0) * 1.1)

	if _in_pit_stop:
		var is_go: bool = _pit_progress_01 > 0.88
		_px_rect(ctrl, cx - 16, nose_tip_y - 15, 32, 10, Color(0.0, 0.99, 0.35, 1.0) if is_go else Color(1.0, 0.13, 0.13, 1.0))
		_draw_pixel_text(ctrl, "GO!" if is_go else "STOP", cx, nose_tip_y - 13, Color.WHITE, 1, 1, 5)

	if H > bottom_y:
		_px_rect(ctrl, 0, bottom_y, W, H - bottom_y, Color(0.04, 0.05, 0.08, 1.0))


func _draw_cockpit_wing_mirrors(ctrl: Control, W: int, cx: int, cowl_top_y: int, is_narrow: bool) -> void:
	var mw: int = 28 if is_narrow else 40
	var mh: int = 14 if is_narrow else 18
	var my: int = cowl_top_y - mh - (4 if is_narrow else 6)
	var lx: int = 4 if is_narrow else maxi(8, cx - 108)
	var rx: int = (W - mw - 4) if is_narrow else mini(W - mw - 8, cx + 108 - mw)

	for m in range(2):
		var is_left: bool = (m == 0)
		var mx: int = lx if is_left else rx
		_px_rect(ctrl, (mx + mw - 6) if is_left else (mx + 2), my + mh, 4, cowl_top_y - (my + mh) + 2, Color(0.13, 0.15, 0.21, 1.0))
		_px_rect(ctrl, mx - 2, my - 2, mw + 4, mh + 4, Color(0.78, 0.08, 0.11, 1.0))
		_px_rect(ctrl, mx - 1, my - 1, mw + 2, mh + 2, Color(0.05, 0.06, 0.10, 1.0))
		var mid_y: int = my + (mh >> 1)
		_px_rect(ctrl, mx, my, mw, mh >> 1, Color(0.28, 0.58, 0.99, 1.0))
		_px_rect(ctrl, mx, mid_y, mw, mh - (mh >> 1), Color(0.0, 0.66, 0.13, 1.0))
		_px_rect(ctrl, mx + 3, mid_y, mw - 6, mh - (mh >> 1), Color(0.38, 0.40, 0.44, 1.0))

		if _player_node != null and not _rival_nodes.is_empty():
			var p_inv: Transform3D = _player_node.global_transform.affine_inverse()
			for r_idx in range(_rival_nodes.size()):
				var r_node: Node3D = _rival_nodes[r_idx]
				if r_node == null or not is_instance_valid(r_node):
					continue
				var rel: Vector3 = p_inv * r_node.global_position
				# In Godot -Z is forward, so +Z is behind the player car!
				var behind_m: float = rel.z
				if behind_m <= 0.8 or behind_m >= 65.0:
					continue
				if is_left and rel.x > 4.2:
					continue
				if (not is_left) and rel.x < -4.2:
					continue
				var m_scale: float = clampf(12.0 / (behind_m + 4.0), 0.18, 0.95)
				var cw: int = maxi(3, int(round(float(mw) * 0.50 * m_scale)))
				var ch: int = maxi(2, int(round(float(cw) * 0.55)))
				var car_cx: int = int(round(float(mx) + float(mw) * 0.5 + (rel.x / 7.5) * float(mw) * 0.42))
				var car_y0: int = clampi(int(round(float(mid_y + 2) + m_scale * float((mh >> 1) - 2))) - ch, my + 1, my + mh - ch - 1)
				var car_x0: int = clampi(car_cx - (cw >> 1), mx + 1, mx + mw - cw - 1)
				var pal: Color = RIVAL_MIRROR_PALETTES[r_idx % RIVAL_MIRROR_PALETTES.size()]
				_px_rect(ctrl, car_x0, car_y0, cw, ch, pal)


func _draw_momo_wheel_and_gloves(ctrl: Control, cx: int, cy: int, angle_rad: float) -> void:
	var outer_r: int = 20
	var inner_r: int = 15
	var cos_a: float = cos(angle_rad)
	var sin_a: float = sin(angle_rad)

	# Pixel steering rim + yellow top-dead-center leather marker
	for py in range(-outer_r, outer_r + 1):
		for px in range(-outer_r, outer_r + 1):
			var d2: int = px * px + py * py
			if d2 >= inner_r * inner_r and d2 <= outer_r * outer_r:
				var rx: float = float(px) * cos_a + float(py) * sin_a
				var ry: float = -float(px) * sin_a + float(py) * cos_a
				var is_stripe: bool = (ry < -float(inner_r) + 1.5 and absf(rx) <= 2.2)
				_px_rect(ctrl, cx + px, cy + py, 1, 1, Color(0.99, 0.96, 0.0, 1.0) if is_stripe else Color(0.12, 0.14, 0.18, 1.0))

	# 3-Spoke anodized spider + hub
	var spokes: Array[float] = [0.0, PI, PI * 0.5]
	for sp_ang in spokes:
		var a: float = sp_ang + angle_rad
		for r_step in range(4, inner_r + 1):
			_px_rect(ctrl, cx + int(round(cos(a) * float(r_step))) - 1, cy + int(round(sin(a) * float(r_step))) - 1, 3, 2, Color(0.22, 0.26, 0.34, 1.0))
	_px_rect(ctrl, cx - 5, cy - 5, 10, 10, Color(0.08, 0.10, 0.14, 1.0))
	_px_rect(ctrl, cx - 3, cy - 3, 6, 6, Color(0.88, 0.10, 0.12, 1.0))

	# Red/White Nomex Racing Gloves at 9 & 3 o'clock
	for side_val in [-1.0, 1.0]:
		var gx: int = cx + int(round(cos(angle_rad) * side_val * float(outer_r - 2)))
		var gy: int = cy + int(round(sin(angle_rad) * side_val * float(outer_r - 2)))
		_px_rect(ctrl, gx - 4, gy - 4, 8, 8, Color(0.89, 0.10, 0.13, 1.0))
		_px_rect(ctrl, gx - 3, gy + 2, 6, 3, Color(0.97, 0.97, 0.97, 1.0))


func _draw_tcam_foreground(ctrl: Control, W: int, H: int, bottom_y: int, is_narrow: bool) -> void:
	var cx: int = W >> 1
	var steer_px: int = int(round(clampf(_steer_input, -1.0, 1.0) * 7.0))
	var span_half: int = 64 if is_narrow else 92
	var ww: int = 18 if is_narrow else 24
	var wh: int = 32 if is_narrow else 38
	var wy: int = bottom_y - wh - 6
	var comp_col: Color = COMPOUND_COLORS.get(_compound, COMPOUND_COLORS["SOFT"])

	_px_rect(ctrl, cx - span_half + ww, wy + 12, span_half - ww - 8, 2, Color(0.65, 0.72, 0.82, 1.0))
	_px_rect(ctrl, cx + 8, wy + 12, span_half - ww - 8, 2, Color(0.65, 0.72, 0.82, 1.0))
	for s in [-1, 1]:
		var wx: int = (cx - span_half if s < 0 else cx + span_half - ww) + steer_px
		_px_rect(ctrl, wx, wy, ww, wh, Color(0.07, 0.08, 0.11, 1.0))
		_px_rect(ctrl, (wx + ww - 3) if s < 0 else (wx + 1), wy + 4, 2, wh - 8, comp_col)

	var nose_top: int = bottom_y - (50 if is_narrow else 60)
	for ny in range(nose_top, bottom_y):
		var t: float = float(ny - nose_top) / float(maxi(1, bottom_y - nose_top))
		var hw: int = int(round(5.0 + t * (15.0 if is_narrow else 21.0)))
		_px_rect(ctrl, cx - hw, ny, hw * 2, 1, Color(0.88, 0.11, 0.14, 1.0))
		_px_rect(ctrl, cx - 3, ny, 6, 1, Color(0.97, 0.97, 0.97, 1.0))
	_px_rect(ctrl, cx - 32, bottom_y - 22, 64, 4, Color(0.12, 0.15, 0.21, 1.0))
	if H > bottom_y:
		_px_rect(ctrl, 0, bottom_y, W, H - bottom_y, Color(0.05, 0.06, 0.10, 1.0))


func _draw_nose_wing_foreground(ctrl: Control, W: int, H: int, bottom_y: int, is_narrow: bool) -> void:
	var steer_px: int = int(round(clampf(_steer_input, -1.0, 1.0) * 5.0))
	var comp_col: Color = COMPOUND_COLORS.get(_compound, COMPOUND_COLORS["SOFT"])
	var iww: int = 12 if is_narrow else 16
	var iwh: int = 28 if is_narrow else 34
	var wing_w: int = 48 if is_narrow else 74
	var wing_h: int = 20 if is_narrow else 26

	for s in [-1, 1]:
		var wx: int = steer_px if s < 0 else (W - iww + steer_px)
		var wy: int = bottom_y - iwh - 4
		_px_rect(ctrl, wx, wy, iww, iwh, Color(0.06, 0.07, 0.10, 1.0))
		_px_rect(ctrl, (wx + iww - 2) if s < 0 else wx, wy + 3, 2, iwh - 6, comp_col)
		var fx: int = (iww + steer_px) if s < 0 else (W - iww - wing_w + steer_px)
		var fy: int = bottom_y - wing_h
		_px_rect(ctrl, fx, fy + 6, wing_w, wing_h - 6, Color(0.78, 0.08, 0.11, 1.0))
		_px_rect(ctrl, fx + 2, fy + 9, wing_w - 4, 3, Color(0.97, 0.97, 0.97, 1.0))
		_px_rect(ctrl, fx if s < 0 else (fx + wing_w - 4), fy, 4, wing_h, Color(0.99, 0.96, 0.0, 1.0))
	if H > bottom_y:
		_px_rect(ctrl, 0, bottom_y, W, H - bottom_y, Color(0.05, 0.06, 0.10, 1.0))


func _draw_chase_pit_crew_overlay(ctrl: Control, W: int, bottom_y: int) -> void:
	var cx: int = W >> 1
	var car_y: int = bottom_y - 46
	var is_go: bool = _pit_progress_01 > 0.88
	var is_1st: bool = (not is_go) and _pit_progress_01 > 0.68
	# Lollipop sign + Front/Rear Jack Men + 4 Wheel Gunners with pneumatic sparks!
	_px_rect(ctrl, cx - 15, car_y - 18, 30, 10, Color(0.0, 0.99, 0.35, 1.0) if is_go else (Color(0.99, 0.96, 0.0, 1.0) if is_1st else Color(1.0, 0.13, 0.13, 1.0)))
	_draw_pixel_text(ctrl, "GO!" if is_go else ("1ST" if is_1st else "STOP"), cx, car_y - 16, Color.WHITE, 1, 1, 5)
	var spark_on: bool = _pit_progress_01 >= 0.16 and _pit_progress_01 <= 0.80 and ((int(_elapsed_sec * 32.0) & 1) == 0)
	for c_idx in range(4):
		var side: int = -1 if (c_idx % 2 == 0) else 1
		var gy: int = (car_y + 6) if c_idx < 2 else (car_y + 28)
		var gx: int = (cx - 38) if side < 0 else (cx + 31)
		_px_rect(ctrl, gx + 1, gy - 3, 5, 4, Color.WHITE)
		_px_rect(ctrl, gx, gy + 1, 7, 8, Color(0.85, 0.10, 0.12, 1.0))
		if spark_on:
			_px_rect(ctrl, (cx - 28) if side < 0 else (cx + 25), gy + 2, 3, 2, Color(0.33, 0.93, 1.0, 1.0))


func _draw_visor_raindrops(ctrl: Control, W: int, safe_bottom_y: int) -> void:
	var drop_cnt: int = 20 if _is_monsoon else 11
	var cx: float = float(W) * 0.5
	var cy: float = float(safe_bottom_y) * 0.45
	var boost: float = clampf(_speed_kmh / 280.0, 0.0, 1.0)
	for i in range(drop_cnt):
		var life: float = fmod(_elapsed_sec * (1.2 + boost * 2.1) + float(i) * 0.37, 1.0)
		var ang: float = fmod(float(i) * 2.39996, TAU)
		var rad: float = 12.0 + float(i % 7) * 13.0 + life * (16.0 + boost * 40.0)
		var dx: int = int(round(cx + cos(ang) * rad * 1.35))
		var dy: int = int(round(cy + sin(ang) * rad * 0.75))
		if dx > 3 and dx < W - 4 and dy > 28 and dy < safe_bottom_y - 4:
			_px_rect(ctrl, dx, dy, 2, 2, Color(0.53, 0.86, 1.0, 0.85))
			_px_rect(ctrl, dx, dy, 1, 1, Color.WHITE)


func _draw_arcade_top_hud(ctrl: Control, W: int, H: int, is_portrait: bool) -> void:
	var top_y: int = 5 if is_portrait else 3
	_px_rect(ctrl, 0, 0, W, (top_y + 23) if is_portrait else 27, Color(0.0, 0.02, 0.10, 0.45))

	var score_str: String = str(maxi(0, _score)).lpad(6, "0")
	var top_str: String = str(maxi(0, _top_score)).lpad(6, "0")
	var time_int: int = maxi(0, int(ceil(_timer_sec)))
	var time_str: String = str(time_int).lpad(2, "0")
	var g_txt: String = ("HIGH" if _gear > 1 else "LOW") if _gearbox_mode == "CLASSIC_2SPD" else ("G" + str(_gear))
	var lap_cs: int = maxi(0, int(floor(_lap_time_sec * 100.0)))
	var lap_str: String = "%d'%02d\"%02d" % [lap_cs / 6000, (lap_cs % 6000) / 100, lap_cs % 100]

	var c_red: Color = Color(1.0, 0.13, 0.13, 1.0)
	var c_yel: Color = Color(0.99, 0.96, 0.0, 1.0)
	var c_grn: Color = Color(0.0, 0.99, 0.35, 1.0)
	var c_cyn: Color = Color(0.33, 0.86, 1.0, 1.0)

	if not is_portrait:
		var step: int = 5 if W < 320 else 6
		_draw_pixel_text(ctrl, "TOP " + top_str, 4, 3, c_red, 1, 0, step)
		_draw_pixel_text(ctrl, "SCORE " + score_str, 4, 14, c_yel, 1, 0, step)
		var col2_x: int = maxi(4 + step * 13, int(round(float(W) * 0.28)))
		_draw_pixel_text(ctrl, "LAP %d/%d" % [_current_lap, _total_laps], col2_x, 3, c_grn, 1, 0, step)
		_draw_pixel_text(ctrl, lap_str, col2_x, 14, c_grn, 1, 0, step)
		_draw_pixel_text(ctrl, "TIME", W >> 1, 2, c_red, 1, 1, step)
		_draw_pixel_text(ctrl, time_str, W >> 1, 10, c_yel, 2, 1, 6)
		_draw_pixel_text(ctrl, "P%d/%d" % [_player_pos, _total_cars], int(round(float(W) * 0.68)), 14, c_cyn, 1, 0, step)
		_draw_pixel_text(ctrl, "%3dKM/H" % int(round(_speed_kmh)), W - 4, 3, Color.WHITE, 1, 2, step)
		_draw_pixel_text(ctrl, g_txt, W - 4, 14, c_cyn if _gear >= 7 else c_yel, 1, 2, step)
	else:
		_draw_pixel_text(ctrl, "TOP " + top_str, 4, top_y, c_red, 1, 0, 5)
		_draw_pixel_text(ctrl, "TIME " + time_str, W >> 1, top_y, c_yel, 1, 1, 5)
		_draw_pixel_text(ctrl, "%dK %s" % [int(round(_speed_kmh)), g_txt], W - 4, top_y, c_yel, 1, 2, 5)
		_draw_pixel_text(ctrl, "SCR " + score_str, 4, top_y + 11, c_yel, 1, 0, 5)
		_draw_pixel_text(ctrl, lap_str, W >> 1, top_y + 11, c_grn, 1, 1, 5)
		_draw_pixel_text(ctrl, "P%d/%d L%d" % [_player_pos, _total_cars, _current_lap], W - 4, top_y + 11, c_cyn, 1, 2, 5)

	# Compact 4-Tire Thermal/Wear + Wing Damage + ERS/DRS Arcade Pod at Upper-Left
	var wy: int = (top_y + 25) if is_portrait else 29
	_px_rect(ctrl, 4, wy, 30, 24, Color(0.02, 0.04, 0.12, 0.58))
	_px_rect(ctrl, 9, wy + 2, 12, 2, c_grn if _front_wing_damage < 0.35 else c_red)
	_px_rect(ctrl, 13, wy + 4, 4, 14, c_red)
	for t_i in range(4):
		var tx: int = 7 if (t_i % 2 == 0) else 19
		var ty: int = (wy + 5) if t_i < 2 else (wy + 12)
		var life_v: float = _tire_life_01[t_i]
		var temp_v: float = _tire_temps_c[t_i]
		var t_col: Color = c_red if (life_v < 0.25 or temp_v > 114.0) else (c_yel if (life_v < 0.52 or temp_v > 103.0) else c_grn)
		_px_rect(ctrl, tx, ty, 4, 5, t_col)
	_px_rect(ctrl, 9, wy + 19, 12, 2, c_cyn if _drs_active else c_grn)
	var ers_h: int = int(round(18.0 * _ers_charge))
	_px_rect(ctrl, 27, wy + 3, 4, 18, Color(0.09, 0.14, 0.22, 1.0))
	_px_rect(ctrl, 27, wy + 3 + (18 - ers_h), 4, ers_h, Color.WHITE if _ers_deploying else c_cyn)

	if _cam_toast_timer > 0.0:
		_draw_pixel_text(ctrl, CAMERA_LABELS_1982[_camera_mode], W - 4, (top_y + 26) if is_portrait else 30, c_cyn, 1, 2, 5)
	if _sector_popup_timer > 0.0 and not _sector_popup_text.is_empty():
		_draw_pixel_text(ctrl, _sector_popup_text, W - 4, (top_y + 37) if is_portrait else 40, c_grn if _sector_popup_green else c_red, 1, 2, 5)
	if _crowd_roar_timer > 0.0 and ((int(_elapsed_sec * 10.0) & 1) == 0):
		_draw_pixel_text(ctrl, "CROWD ROAR!", W >> 1, (top_y + 48) if is_portrait else 50, c_yel, 1, 1, 5)

	var callout: String = _center_callout
	if callout.is_empty() and _in_pit_stop:
		var sub_lbl: String = _pit_sub_phase if not _pit_sub_phase.is_empty() else ("GO! GO! GO!" if _pit_progress_01 > 0.88 else "PIT SERVICE")
		callout = "PIT CREW: %s %.1fS" % [sub_lbl, _pit_remaining_sec]
	if not callout.is_empty():
		var banner_y: int = mini(int(round(float(H) * 0.22)), 90) if is_portrait else 33
		var box_w: int = callout.length() * 5 + 12
		_px_rect(ctrl, (W - box_w) >> 1, banner_y, box_w, 13, Color(0.03, 0.05, 0.14, 0.92))
		_draw_pixel_text(ctrl, callout, W >> 1, banner_y + 3, c_yel, 1, 1, 5)


class _RetroPixelOverlayControl extends Control:
	var owner_mode: Retro1982Mode

	func _draw() -> void:
		if owner_mode != null and owner_mode.is_retro_enabled():
			owner_mode._paint_retro_overlay(self)
