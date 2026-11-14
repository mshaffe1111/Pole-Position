# ==============================================================================
# RACE PHANATIC F1 — POLE POSITION 2026 (GODOT 4.3 AAA PIPELINE — A+ EDITION)
# Agent: @Gameplay_Tuning_Lead (@others)
# File: godot_project/scripts/main_race_coordinator.gd
#
# Master Grand Prix Weekend Coordinator orchestrating:
# 1. 5-Light FIA Start Gantry Countdown -> Green Flag Launch -> Checkered Podium
# 2. Player #1 F1VehiclePhysics3D + 7 Autonomous AI Rivals (AIDriverController)
# 3. 6-Circuit Switching (Fuji, Monaco, Suzuka, Vegas, Silverstone, Monza)
# 4. Fixed-Per-Race Weather Roll (WeatherAndVFXManager) & Auto Wet-Tire Fitment
# 5. Stationary Pit Crew Rig (PitBoxTrigger Area3D + AnimationPlayer + Clutch)
# 6. 4-Camera Cycling (0: CHASE, 1: HALO T-CAM, 2: COCKPIT VIEW, 3: NOSE WING)
#    with Inside-Helmet Acoustics, Visor Rain/Tear-Off & 1982 Retro CRT Parity
# 7. Live Standings, Intervals, 3-Sector Split Deltas & Stadium Crowd Surges
# ==============================================================================
class_name MainRaceCoordinator
extends Node3D

signal race_phase_changed(new_phase: String)
signal standings_updated(standings: Array)
signal camera_view_cycled(camera_index: int, camera_label: String)
signal visual_era_toggled(is_retro_1982: bool)

enum RacePhase {
	GRID_INTRO = 0,
	COUNTDOWN = 1,
	RACING = 2,
	FINISHED_PODIUM = 3,
}

const CAMERA_LABELS: Array[String] = [
	"CHASE CAM",
	"HALO T-CAM",
	"COCKPIT VIEW",
	"NOSE WING CAM",
]

const CIRCUIT_CATALOG: Array[String] = [
	"FUJI_1982",
	"MONACO_HARBOR",
	"SUZUKA_130R",
	"VEGAS_NEON",
	"SILVERSTONE_GP",
	"MONZA_TEMPLE",
]

const AI_ROSTER_PRESETS: Array[Dictionary] = [
	{"name": "K. Takahashi", "num": 7, "arch": "APEX_TACTICIAN", "primary": Color(0.02, 0.58, 0.96), "accent": Color(0.96, 0.98, 1.00)},
	{"name": "L. Conti", "num": 16, "arch": "LATE_BRAKER", "primary": Color(0.88, 0.08, 0.12), "accent": Color(1.00, 0.84, 0.08)},
	{"name": "M. Vance", "num": 4, "arch": "SLIPSTREAM_HUNTER", "primary": Color(1.00, 0.50, 0.04), "accent": Color(0.08, 0.10, 0.14)},
	{"name": "S. Lindqvist", "num": 63, "arch": "RAIN_MASTER", "primary": Color(0.00, 0.82, 0.68), "accent": Color(0.86, 0.90, 0.94)},
	{"name": "A. Moreau", "num": 10, "arch": "CONSISTENT_PRO", "primary": Color(0.14, 0.34, 0.92), "accent": Color(1.00, 0.32, 0.68)},
	{"name": "F. Silva", "num": 14, "arch": "APEX_TACTICIAN", "primary": Color(0.02, 0.48, 0.34), "accent": Color(0.82, 0.96, 0.18)},
	{"name": "R. Sato", "num": 22, "arch": "LATE_BRAKER", "primary": Color(0.94, 0.95, 0.98), "accent": Color(0.86, 0.08, 0.16)},
]

@export_group("Session Configuration")
@export_enum("FUJI_1982", "MONACO_HARBOR", "SUZUKA_130R", "VEGAS_NEON", "SILVERSTONE_GP", "MONZA_TEMPLE")
var active_circuit_id: String = "FUJI_1982"
@export var weather_preset: String = "RANDOM"
@export var total_laps: int = 5
@export_enum("AUTO_8SPD", "MANUAL_8SPD", "CLASSIC_2SPD") var player_gearbox_mode: String = "AUTO_8SPD"
@export var start_in_retro_1982_mode: bool = false

@export_group("Scene Node Paths")
@export var track_environment_path: NodePath = ^"TrackEnvironment3D"
@export var pit_crew_rig_path: NodePath = ^"PitCrewRig"
@export var weather_manager_path: NodePath = ^"WeatherAndVFXManager"
@export var starting_grid_path: NodePath = ^"StartingGrid"
@export var retro_layer_path: NodePath = ^"Retro1982Layer"
@export var broadcast_hud_layer_path: NodePath = ^"BroadcastHUDLayer"

# Cached Scene References
var _track_env: Node3D
var _scatter_ctrl: MultiMeshEnvironmentScatter
var _pit_crew_rig: Node3D
var _pit_anim_player: AnimationPlayer
var _pit_box_trigger: Area3D
var _weather_mgr: WeatherAndVFXManager
var _player_car: F1VehiclePhysics3D
var _player_cam_rig: MobileTouchAndCamera3D
var _player_hud_audio: GameplayHudAndAudio3D
var _ai_vehicles: Array[F1VehiclePhysics3D] = []
var _ai_controllers: Array[AIDriverController] = []
var _all_vehicles: Array[F1VehiclePhysics3D] = []
var _gantry_pods: Array[MeshInstance3D] = []
var _gantry_pod_mats: Array[StandardMaterial3D] = []

# Optional 1982 Retro Renderer & HUD Nodes
var _retro_overlay_rect: ColorRect
var _retro_mode_node: Node
var _gantry_banner_label: Label
var _podium_modal: Control
var _podium_summary_label: Label
var _btn_cam_cycle: Button
var _btn_retro_toggle: Button
var _btn_pit_box: Button
var _btn_circuit_next: Button

# Live Race State
var current_phase: RacePhase = RacePhase.COUNTDOWN
var camera_index: int = 0
var is_retro_1982_active: bool = false
var _countdown_elapsed: float = 0.0
var _lit_red_pods: int = 0
var _race_clock_sec: float = 0.0
var _crowd_excitement: float = 0.35

# Per-Car Lap, Distance & Sector Tracking
var _car_progress: Dictionary = {} # instance_id -> Dictionary
var _standings_order: Array[Dictionary] = []
var _prev_player_position: int = 1
var _player_sector_idx: int = 0
var _player_sector_start_sec: float = 0.0
var _pit_cooldown_sec: float = 0.0


func _ready() -> void:
	_resolve_scene_nodes()
	_setup_gantry_light_materials()
	_configure_starting_grid_vehicles()
	_bind_hud_controls_and_buttons()
	_setup_pit_crew_trigger()
	_setup_optional_retro_1982_layer()
	start_race_weekend(active_circuit_id, weather_preset)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("camera_cycle"):
		cycle_live_camera()
	elif event.is_action_pressed("visor_tear_off"):
		trigger_visor_tear_off()
	elif event.is_action_pressed("pit_box_request"):
		toggle_box_this_lap()
	elif event.is_action_pressed("clutch_release"):
		if _player_hud_audio != null and _player_hud_audio.clutch_minigame_active:
			_player_hud_audio.attempt_clutch_release()
	elif event.is_action_pressed("retro_1982_toggle"):
		toggle_retro_1982_mode()


# ==============================================================================
# 1. SCENE NODE RESOLUTION & STARTING GRID INITIALIZATION
# ==============================================================================
func _resolve_scene_nodes() -> void:
	_track_env = get_node_or_null(track_environment_path) as Node3D
	if _track_env != null:
		_scatter_ctrl = _track_env.get_node_or_null("MultiMeshEnvironmentScatter") as MultiMeshEnvironmentScatter
		for idx: int in range(1, 6):
			var pod := _track_env.get_node_or_null("StartGantry3D/StartLight_Pod_%d" % idx) as MeshInstance3D
			if pod != null:
				_gantry_pods.append(pod)

	_pit_crew_rig = get_node_or_null(pit_crew_rig_path) as Node3D
	if _pit_crew_rig != null:
		_pit_anim_player = _pit_crew_rig.get_node_or_null("AnimationPlayer") as AnimationPlayer
		_pit_box_trigger = _pit_crew_rig.get_node_or_null("PitBoxTrigger") as Area3D

	_weather_mgr = get_node_or_null(weather_manager_path) as WeatherAndVFXManager


func _setup_gantry_light_materials() -> void:
	_gantry_pod_mats.clear()
	for pod: MeshInstance3D in _gantry_pods:
		if pod.mesh == null:
			var sphere := SphereMesh.new()
			sphere.radius = 0.22
			sphere.height = 0.44
			pod.mesh = sphere
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color(0.12, 0.03, 0.04)
		mat.roughness = 0.22
		mat.emission_enabled = true
		mat.emission = Color(0.0, 0.0, 0.0)
		mat.emission_energy_multiplier = 0.0
		pod.set_surface_override_material(0, mat)
		_gantry_pod_mats.append(mat)


func _configure_starting_grid_vehicles() -> void:
	var grid_root := get_node_or_null(starting_grid_path) as Node3D
	if grid_root == null:
		return

	_ai_vehicles.clear()
	_ai_controllers.clear()
	_all_vehicles.clear()

	_player_car = grid_root.get_node_or_null("PlayerF1Car") as F1VehiclePhysics3D
	if _player_car != null:
		_player_car.add_to_group("player_vehicle")
		_player_car.gearbox_mode = player_gearbox_mode
		_player_cam_rig = _player_car.get_node_or_null("CameraAndTouchRig") as MobileTouchAndCamera3D
		_player_hud_audio = _player_car.get_node_or_null("GameplayHudAndAudio") as GameplayHudAndAudio3D
		if _player_cam_rig != null:
			_player_cam_rig.vehicle_node = _player_car
			_player_cam_rig.spring_arm = _player_cam_rig.get_node_or_null("SpringArm3D") as SpringArm3D
			_player_cam_rig.active_camera = _player_cam_rig.get_node_or_null("SpringArm3D/Camera3D") as Camera3D
			_player_cam_rig.cockpit_visor_rain_overlay = _player_cam_rig.get_node_or_null("SpringArm3D/Camera3D/CockpitVisorRainOverlay") as MeshInstance3D
			if _player_cam_rig.active_camera != null:
				_player_cam_rig.active_camera.current = true
				_player_cam_rig.active_camera.near = 0.08
			if not _player_cam_rig.camera_mode_changed.is_connected(_on_player_camera_mode_changed):
				_player_cam_rig.camera_mode_changed.connect(_on_player_camera_mode_changed)
			if not _player_cam_rig.visor_tear_off_triggered.is_connected(_on_visor_tear_off_signal):
				_player_cam_rig.visor_tear_off_triggered.connect(_on_visor_tear_off_signal)
		if _player_hud_audio != null:
			_player_hud_audio.bind_player_vehicle(_player_car)
		_all_vehicles.append(_player_car)
		if _weather_mgr != null:
			_weather_mgr.register_car_vfx_rig(&"player_1", _player_car)

	for i: int in range(AI_ROSTER_PRESETS.size()):
		var ai_node := grid_root.get_node_or_null("AIRival_%d" % (i + 1)) as F1VehiclePhysics3D
		if ai_node == null:
			continue
		var preset: Dictionary = AI_ROSTER_PRESETS[i]
		ai_node.gearbox_mode = "AUTO_8SPD"

		# Disable player camera & touch input processing on AI instances of f1_car_2026.tscn
		var ai_cam_rig := ai_node.get_node_or_null("CameraAndTouchRig") as Node3D
		if ai_cam_rig != null:
			ai_cam_rig.set_process(false)
			ai_cam_rig.set_physics_process(false)
			ai_cam_rig.set_process_input(false)
			ai_cam_rig.set_process_unhandled_input(false)
			var ai_cam := ai_cam_rig.get_node_or_null("SpringArm3D/Camera3D") as Camera3D
			if ai_cam != null:
				ai_cam.current = false
		var ai_hud := ai_node.get_node_or_null("GameplayHudAndAudio") as Node
		if ai_hud != null:
			ai_hud.set_process(false)

		_apply_team_livery_override(ai_node, preset["primary"] as Color, preset["accent"] as Color)

		var ai_ctrl := ai_node.get_node_or_null("AIDriverController") as AIDriverController
		if ai_ctrl == null:
			ai_ctrl = AIDriverController.new()
			ai_ctrl.name = "AIDriverController"
			ai_ctrl.archetype_id = String(preset["arch"])
			ai_ctrl.driver_name = String(preset["name"])
			ai_ctrl.car_number = int(preset["num"])
			ai_ctrl.slot_index = i
			ai_ctrl.circuit_id = active_circuit_id
			ai_node.add_child(ai_ctrl)

		_ai_vehicles.append(ai_node)
		_ai_controllers.append(ai_ctrl)
		_all_vehicles.append(ai_node)
		if _weather_mgr != null:
			_weather_mgr.register_car_vfx_rig(StringName("ai_%d" % (i + 1)), ai_node)


func _apply_team_livery_override(car_node: Node3D, primary_col: Color, _accent_col: Color) -> void:
	var body_mesh := car_node.get_node_or_null("Body/ChassisMonocoque") as MeshInstance3D
	if body_mesh == null:
		body_mesh = car_node.find_child("Body", true, false) as MeshInstance3D
	if body_mesh != null:
		var mat := StandardMaterial3D.new()
		mat.albedo_color = primary_col
		mat.metallic = 0.38
		mat.roughness = 0.20
		mat.clearcoat_enabled = true
		mat.clearcoat = 1.0
		mat.clearcoat_roughness = 0.05
		body_mesh.set_surface_override_material(0, mat)


# ==============================================================================
# 2. HUD BINDINGS, PIT TRIGGER & OPTIONAL 1982 RETRO CRT LAYER
# ==============================================================================
func _bind_hud_controls_and_buttons() -> void:
	var hud_layer := get_node_or_null(broadcast_hud_layer_path)
	if hud_layer == null:
		return

	var hud_root := hud_layer.get_node_or_null("HUDRoot") as Control
	if hud_root == null:
		return

	_gantry_banner_label = hud_root.find_child("GantryCountdownBanner", true, false) as Label
	_podium_modal = hud_root.find_child("PodiumCeremonyModal", true, false) as Control
	_podium_summary_label = hud_root.find_child("PodiumSummaryLabel", true, false) as Label
	_btn_cam_cycle = hud_root.find_child("BtnCameraCycle", true, false) as Button
	_btn_retro_toggle = hud_root.find_child("BtnRetro1982Toggle", true, false) as Button
	_btn_pit_box = hud_root.find_child("BtnPitBoxThisLap", true, false) as Button
	_btn_circuit_next = hud_root.find_child("BtnNextCircuit", true, false) as Button

	if _btn_cam_cycle != null and not _btn_cam_cycle.pressed.is_connected(cycle_live_camera):
		_btn_cam_cycle.pressed.connect(cycle_live_camera)
	if _btn_retro_toggle != null and not _btn_retro_toggle.pressed.is_connected(toggle_retro_1982_mode):
		_btn_retro_toggle.pressed.connect(toggle_retro_1982_mode)
	if _btn_pit_box != null and not _btn_pit_box.pressed.is_connected(toggle_box_this_lap):
		_btn_pit_box.pressed.connect(toggle_box_this_lap)
	if _btn_circuit_next != null and not _btn_circuit_next.pressed.is_connected(cycle_next_circuit):
		_btn_circuit_next.pressed.connect(cycle_next_circuit)

	if _player_hud_audio != null:
		_player_hud_audio.hud_root = hud_root
		_player_hud_audio.speed_label = hud_root.find_child("SpeedValueLabel", true, false) as Label
		_player_hud_audio.gear_label = hud_root.find_child("GearBadgeLabel", true, false) as Label
		_player_hud_audio.rpm_progress_bar = hud_root.find_child("RPMProgressBar", true, false) as ProgressBar
		_player_hud_audio.drs_badge_label = hud_root.find_child("DRSBadgeLabel", true, false) as Label
		_player_hud_audio.lap_label = hud_root.find_child("LapCounterLabel", true, false) as Label
		_player_hud_audio.position_label = hud_root.find_child("PositionBadgeLabel", true, false) as Label
		_player_hud_audio.interval_sector_label = hud_root.find_child("SectorIntervalLabel", true, false) as Label
		_player_hud_audio.sector_delta_popup = hud_root.find_child("SectorDeltaPopupLabel", true, false) as Label
		_player_hud_audio.engineer_radio_banner = hud_root.find_child("EngineerRadioLabel", true, false) as Label
		_player_hud_audio.pit_status_banner = hud_root.find_child("PitCrewStatusLabel", true, false) as Label
		_player_hud_audio.clutch_cursor_slider = hud_root.find_child("ClutchReleaseSlider", true, false) as Range
		_player_hud_audio.camera_mode_badge = hud_root.find_child("CameraModeBadgeLabel", true, false) as Label

	if _player_cam_rig != null:
		_player_cam_rig.wheel_zone_control = hud_root.find_child("TouchWheelZone", true, false) as Control
		_player_cam_rig.arrow_zone_control = hud_root.find_child("TouchArrowZone", true, false) as Control
		_player_cam_rig.pedal_zone_control = hud_root.find_child("TouchPedalZone", true, false) as Control
		_player_cam_rig.wheel_hub_label = hud_root.find_child("WheelHubTelemetryLabel", true, false) as Label


func _setup_pit_crew_trigger() -> void:
	if _pit_box_trigger != null and not _pit_box_trigger.body_entered.is_connected(_on_pit_box_body_entered):
		_pit_box_trigger.body_entered.connect(_on_pit_box_body_entered)


func _setup_optional_retro_1982_layer() -> void:
	var retro_layer := get_node_or_null(retro_layer_path)
	if retro_layer == null:
		return
	if retro_layer.has_method("set_retro_enabled"):
		_retro_mode_node = retro_layer
		if _retro_mode_node.has_signal("retro_mode_changed") and not _retro_mode_node.is_connected("retro_mode_changed", _on_external_retro_mode_changed):
			_retro_mode_node.connect("retro_mode_changed", _on_external_retro_mode_changed)
	else:
		_retro_overlay_rect = retro_layer.get_node_or_null("CRTPostProcessRect") as ColorRect
		if ResourceLoader.exists("res://scripts/retro_1982_mode.gd"):
			var retro_script: Script = load("res://scripts/retro_1982_mode.gd") as Script
			if retro_script != null:
				_retro_mode_node = retro_script.new()
				_retro_mode_node.name = "Retro1982Renderer"
				retro_layer.add_child(_retro_mode_node)
	set_retro_1982_mode(start_in_retro_1982_mode)


func _on_external_retro_mode_changed(enabled: bool) -> void:
	is_retro_1982_active = enabled
	if _btn_retro_toggle != null:
		_btn_retro_toggle.text = "1982 ARCADE CRT" if enabled else "2026 3D ULTRA"
	visual_era_toggled.emit(enabled)


# ==============================================================================
# 3. RACE WEEKEND START, CIRCUIT SWITCHING & GRID POSITIONING
# ==============================================================================
func start_race_weekend(circuit_id: String, requested_weather: String = "RANDOM") -> void:
	active_circuit_id = circuit_id
	if _scatter_ctrl != null:
		_scatter_ctrl.rebuild_circuit_scatter(active_circuit_id)

	var is_night_circuit: bool = (active_circuit_id == "VEGAS_NEON")
	var chosen_weather: String = "HOT_SUNNY"
	if _weather_mgr != null:
		var mode_str: String = "1982_ORIGINAL" if is_retro_1982_active else "2026_UPDATED"
		var theme_prefix: String = active_circuit_id.split("_")[0]
		chosen_weather = _weather_mgr.configure_for_session(
			mode_str,
			requested_weather,
			{"theme": theme_prefix, "forceNight": is_night_circuit}
		)

	var auto_compound: String = "SOFT"
	if _weather_mgr != null and _weather_mgr.offline_moisture >= 0.65:
		auto_compound = "FULL_WET"
	elif _weather_mgr != null and _weather_mgr.offline_moisture >= 0.25:
		auto_compound = "INTERMEDIATE"

	_place_vehicles_on_starting_grid(auto_compound)
	if _player_hud_audio != null:
		_player_hud_audio.reset_sector_splits()
		_player_hud_audio.show_engineer_radio(
			"📻 GRID READY • %s • WEATHER: %s (%s TIRES)" % [active_circuit_id, chosen_weather, auto_compound],
			4.2
		)

	if _podium_modal != null:
		_podium_modal.visible = false

	_countdown_elapsed = 0.0
	_lit_red_pods = 0
	_race_clock_sec = 0.0
	_player_sector_idx = 0
	_player_sector_start_sec = 0.0
	_prev_player_position = 1
	_crowd_excitement = 0.65
	_set_gantry_red_lights(0)
	_set_race_phase(RacePhase.COUNTDOWN)


func _place_vehicles_on_starting_grid(starting_compound: String) -> void:
	_car_progress.clear()
	for slot: int in range(_all_vehicles.size()):
		var v: F1VehiclePhysics3D = _all_vehicles[slot]
		var row: int = int(slot / 2)
		var side_sign: float = -1.0 if (slot % 2 == 0) else 1.0
		var grid_s: float = posmod(int(992 - row * 9), int(MotorsportTelemetryData.TRACK_GAME_LENGTH))
		var lat_m: float = side_sign * 2.85

		var sample: Dictionary = MotorsportTelemetryData.sample_circuit_spline(active_circuit_id, float(grid_s))
		var center_pos: Vector3 = sample.get("position", Vector3(-16.0 - float(row) * 8.5, 0.35, 0.0))
		var tangent: Vector3 = sample.get("tangent", Vector3(1.0, 0.0, 0.0)).normalized()
		var right_vec: Vector3 = tangent.cross(Vector3.UP).normalized()
		var spawn_pos: Vector3 = center_pos + right_vec * lat_m + Vector3(0.0, 0.42, 0.0)

		v.linear_velocity = Vector3.ZERO
		v.angular_velocity = Vector3.ZERO
		v.global_position = spawn_pos
		v.look_at(spawn_pos + tangent, Vector3.UP)
		v.set_driver_inputs(0.0, 0.0, 1.0, false, false)
		if "tire_compound" in v:
			v.set("tire_compound", starting_compound)
		if "fuel_laps_remaining" in v:
			v.fuel_laps_remaining = float(total_laps) + 1.8

		var drv_name: String = "PLAYER #1" if slot == 0 else String(AI_ROSTER_PRESETS[slot - 1]["name"])
		var car_num: int = 1 if slot == 0 else int(AI_ROSTER_PRESETS[slot - 1]["num"])
		_car_progress[v.get_instance_id()] = {
			"vehicle": v,
			"is_player": (slot == 0),
			"driver_name": drv_name,
			"car_number": car_num,
			"lap": 1,
			"last_s": float(grid_s),
			"total_dist_game_m": float(slot) * -0.01,
			"finished": false,
			"finish_time_sec": 0.0,
		}

	for idx: int in range(_ai_controllers.size()):
		_ai_controllers[idx].circuit_id = active_circuit_id


func cycle_next_circuit() -> void:
	var cur_idx: int = CIRCUIT_CATALOG.find(active_circuit_id)
	var next_idx: int = posmod(cur_idx + 1, CIRCUIT_CATALOG.size())
	start_race_weekend(CIRCUIT_CATALOG[next_idx], weather_preset)


# ==============================================================================
# 4. 4-CAMERA SWITCHING & 1982 RETRO MODE PARITY
# ==============================================================================
func cycle_live_camera() -> void:
	set_camera_index(posmod(camera_index + 1, 4))


func set_camera_index(next_idx: int) -> void:
	camera_index = posmod(next_idx, 4)
	if _player_cam_rig != null:
		_player_cam_rig.set_camera_mode_index(camera_index)
	_apply_camera_mode_side_effects(camera_index)


func _on_player_camera_mode_changed(mode_idx: int, _mode_name: String) -> void:
	camera_index = posmod(mode_idx, 4)
	_apply_camera_mode_side_effects(camera_index)


func _apply_camera_mode_side_effects(idx: int) -> void:
	var is_cockpit: bool = (idx == 2)
	if _player_hud_audio != null:
		_player_hud_audio.set_cockpit_acoustic_mode(is_cockpit)
		if _player_hud_audio.camera_mode_badge != null:
			_player_hud_audio.camera_mode_badge.text = "🎥 %s" % CAMERA_LABELS[idx]
	if _retro_mode_node != null:
		if _retro_mode_node.has_method("set_camera_mode"):
			_retro_mode_node.call("set_camera_mode", idx)
		elif _retro_mode_node.has_method("set_camera_index"):
			_retro_mode_node.call("set_camera_index", idx)
	camera_view_cycled.emit(idx, CAMERA_LABELS[idx])


func trigger_visor_tear_off() -> void:
	if _player_cam_rig != null and _player_cam_rig.has_method("trigger_visor_tear_off"):
		_player_cam_rig.call("trigger_visor_tear_off")
	elif _player_hud_audio != null:
		_player_hud_audio.show_engineer_radio("🥽 VISOR TEAR-OFF CLEARED", 1.6)


func _on_visor_tear_off_signal(_count: int) -> void:
	if _player_hud_audio != null:
		_player_hud_audio.show_engineer_radio("🥽 VISOR TEAR-OFF CLEARED", 1.5)


func toggle_retro_1982_mode() -> void:
	set_retro_1982_mode(not is_retro_1982_active)


func set_retro_1982_mode(enabled: bool) -> void:
	is_retro_1982_active = enabled
	if _retro_overlay_rect != null:
		_retro_overlay_rect.visible = enabled
	if _retro_mode_node != null:
		if _retro_mode_node.has_method("set_retro_enabled"):
			_retro_mode_node.call("set_retro_enabled", enabled)
		elif "visible" in _retro_mode_node:
			_retro_mode_node.set("visible", enabled)
	if _btn_retro_toggle != null:
		_btn_retro_toggle.text = "1982 ARCADE CRT" if enabled else "2026 3D ULTRA"
	visual_era_toggled.emit(enabled)


# ==============================================================================
# 5. FRAME & PHYSICS ORCHESTRATION (COUNTDOWN, AI, STANDINGS, SECTORS & CROWD)
# ==============================================================================
func _physics_process(dt: float) -> void:
	if _pit_cooldown_sec > 0.0:
		_pit_cooldown_sec = maxf(0.0, _pit_cooldown_sec - dt)

	if current_phase == RacePhase.COUNTDOWN:
		_step_fia_gantry_countdown(dt)
		_hold_grid_brakes_during_countdown()
		return

	if current_phase == RacePhase.RACING:
		_race_clock_sec += dt
		_step_ai_drivers(dt)
		_step_pit_immobilization_if_servicing()
		if _player_car != null and _player_hud_audio != null:
			_player_hud_audio.stabilize_collision_and_barrier_rub(
				_player_car,
				dt,
				_player_car.steer_input,
				0.0
			)


func _process(dt: float) -> void:
	_update_race_progress_and_standings(dt)
	_update_player_telemetry_hud_vfx_and_crowd(dt)


func _step_fia_gantry_countdown(dt: float) -> void:
	_countdown_elapsed += dt
	var target_pods: int = clampi(int(floor(_countdown_elapsed / 0.85)) + 1, 1, 5)
	if _countdown_elapsed < 4.55:
		if target_pods != _lit_red_pods:
			_lit_red_pods = target_pods
			_set_gantry_red_lights(_lit_red_pods)
		if _gantry_banner_label != null:
			_gantry_banner_label.visible = true
			_gantry_banner_label.text = "● ".repeat(_lit_red_pods).strip_edges()
			_gantry_banner_label.modulate = Color(1.0, 0.16, 0.18)
	else:
		_set_gantry_red_lights(0)
		if _gantry_banner_label != null:
			_gantry_banner_label.text = "🟢 LIGHTS OUT AND AWAY WE GO!"
			_gantry_banner_label.modulate = Color(0.0, 0.96, 0.48)
		if _player_hud_audio != null:
			_player_hud_audio.play_crowd_cheer_surge(0.95)
		_crowd_excitement = 1.0
		_set_race_phase(RacePhase.RACING)
		get_tree().create_timer(1.6).timeout.connect(func() -> void:
			if _gantry_banner_label != null and current_phase == RacePhase.RACING:
				_gantry_banner_label.visible = false
		)


func _set_gantry_red_lights(lit_count: int) -> void:
	for idx: int in range(_gantry_pod_mats.size()):
		var mat: StandardMaterial3D = _gantry_pod_mats[idx]
		if idx < lit_count:
			mat.albedo_color = Color(1.0, 0.08, 0.10)
			mat.emission = Color(1.0, 0.06, 0.08)
			mat.emission_energy_multiplier = 4.5
		else:
			mat.albedo_color = Color(0.10, 0.03, 0.04)
			mat.emission = Color(0.0, 0.0, 0.0)
			mat.emission_energy_multiplier = 0.0


func _hold_grid_brakes_during_countdown() -> void:
	for v: F1VehiclePhysics3D in _all_vehicles:
		if v == _player_car and _player_cam_rig != null:
			# Allow player revving on the grid while holding wheel brakes!
			v.set_driver_inputs(0.0, _player_cam_rig.throttle_output, 1.0, false, false)
		else:
			v.set_driver_inputs(0.0, 0.35, 1.0, false, false)


func _step_ai_drivers(dt: float) -> void:
	var moisture_w: float = _weather_mgr.offline_moisture if _weather_mgr != null else 0.0
	var ctx := {
		"circuit_id": active_circuit_id,
		"moisture": moisture_w,
		"groove_moisture": _weather_mgr.groove_moisture if _weather_mgr != null else 0.0,
		"total_laps": total_laps,
		"race_elapsed_sec": _race_clock_sec,
	}
	for i: int in range(_ai_controllers.size()):
		var ai_ctrl: AIDriverController = _ai_controllers[i]
		var ai_car: F1VehiclePhysics3D = _ai_vehicles[i]
		var prog: Dictionary = _car_progress.get(ai_car.get_instance_id(), {})
		ctx["lap"] = int(prog.get("lap", 1))
		ctx["total_distance_game_m"] = float(prog.get("total_dist_game_m", 0.0))
		ai_ctrl.step_f1_rigidbody(ai_car, _all_vehicles, _player_car, dt, ctx)


# ==============================================================================
# 6. PIT STOP SERVICE & STATIONARY CREW ANIMATIONS
# ==============================================================================
func toggle_box_this_lap() -> void:
	if _player_hud_audio == null:
		return
	_player_hud_audio.box_this_lap_armed = not _player_hud_audio.box_this_lap_armed
	var armed: bool = _player_hud_audio.box_this_lap_armed
	_player_hud_audio.box_this_lap_toggled.emit(armed)
	if _btn_pit_box != null:
		_btn_pit_box.text = "🔧 BOX CONFIRMED" if armed else "🔧 BOX THIS LAP"
	_player_hud_audio.show_engineer_radio(
		"📻 COPY THAT — PIT CREW STANDING BY IN THE BOX!" if armed else "📻 STAY OUT, STAY OUT!",
		2.8
	)


func _on_pit_box_body_entered(body: Node3D) -> void:
	if body != _player_car or _player_hud_audio == null or _pit_cooldown_sec > 0.0:
		return
	if _player_hud_audio.pit_stop_active:
		return
	if _player_car.speed_kmh > 92.0:
		_player_hud_audio.show_engineer_radio("⚠️ PIT SPEEDING! SLOW BELOW 80 KM/H FOR CREW SERVICE!", 2.5)
		return

	_player_hud_audio.box_this_lap_armed = false
	if _btn_pit_box != null:
		_btn_pit_box.text = "🔧 BOX THIS LAP"
	_player_hud_audio.begin_stationary_pit_stop(2.45)
	if _pit_anim_player != null and _pit_anim_player.has_animation("Pit_Tire_Swap"):
		_pit_anim_player.play("Pit_Tire_Swap")


func _step_pit_immobilization_if_servicing() -> void:
	if _player_car == null or _player_hud_audio == null:
		return
	if _player_hud_audio.pit_stop_active:
		_player_car.linear_velocity = _player_car.linear_velocity.move_toward(Vector3.ZERO, 0.85)
		_player_car.set_driver_inputs(0.0, 0.25, 1.0, false, false)
	elif _player_hud_audio.current_pit_sub_phase == "CLEAR":
		_player_hud_audio.current_pit_sub_phase = "IDLE"
		_pit_cooldown_sec = 8.0
		_replenish_player_tires_and_fuel()
		if _pit_anim_player != null and _pit_anim_player.has_animation("Pit_Idle_Ready"):
			_pit_anim_player.play("Pit_Idle_Ready")
		_player_hud_audio.show_engineer_radio("🟢 GREEN LIGHT! FRESH PIRELLI SET + FUEL LOCKED — PUSH NOW!", 3.2)


func _replenish_player_tires_and_fuel() -> void:
	if _player_car == null:
		return
	_player_car.fuel_laps_remaining = minf(_player_car.max_fuel_laps, float(total_laps) + 2.0)
	if "wheel_states" in _player_car:
		for c_key: String in ["FL", "FR", "RL", "RR"]:
			if _player_car.wheel_states.has(c_key):
				_player_car.wheel_states[c_key]["life"] = 1.0
				_player_car.wheel_states[c_key]["punctured"] = false


# ==============================================================================
# 7. LIVE STANDINGS, 3-SECTOR SPLITS, TELEMETRY VFX & STADIUM CROWD SURGES
# ==============================================================================
func _update_race_progress_and_standings(_dt: float) -> void:
	_standings_order.clear()
	for v: F1VehiclePhysics3D in _all_vehicles:
		var id: int = v.get_instance_id()
		if not _car_progress.has(id):
			continue
		var entry: Dictionary = _car_progress[id]
		var prev_s: float = float(entry["last_s"])
		var proj: Dictionary = MotorsportTelemetryData.project_world_pos_to_spline(
			active_circuit_id,
			v.global_position,
			prev_s
		)
		var cur_s: float = float(proj["s"])
		var ds: float = cur_s - prev_s
		if ds < -500.0:
			ds += MotorsportTelemetryData.TRACK_GAME_LENGTH
		elif ds > 500.0:
			ds -= MotorsportTelemetryData.TRACK_GAME_LENGTH

		if current_phase == RacePhase.RACING and ds > -40.0:
			entry["total_dist_game_m"] = float(entry["total_dist_game_m"]) + maxf(0.0, ds)
			if prev_s > 915.0 and cur_s < 85.0:
				var next_lap: int = int(entry["lap"]) + 1
				entry["lap"] = next_lap
				if bool(entry["is_player"]):
					_on_player_lap_crossed(next_lap)

		entry["last_s"] = cur_s
		if bool(entry["is_player"]) and current_phase == RacePhase.RACING:
			_check_player_sector_transitions(cur_s)

		_standings_order.append(entry)

	_standings_order.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return float(a["total_dist_game_m"]) > float(b["total_dist_game_m"])
	)
	standings_updated.emit(_standings_order)


func _check_player_sector_transitions(cur_s: float) -> void:
	var sec_idx: int = 0 if cur_s < 333.33 else (1 if cur_s < 666.67 else 2)
	if sec_idx != _player_sector_idx:
		var split_sec: float = _race_clock_sec - _player_sector_start_sec
		if _player_hud_audio != null and split_sec > 1.0:
			var pop: Dictionary = _player_hud_audio.record_sector_split(_player_sector_idx, split_sec)
			var is_imp: bool = float(pop.get("delta_sec", 0.0)) <= 0.0
			if _retro_mode_node != null and _retro_mode_node.has_method("show_sector_delta"):
				_retro_mode_node.call("show_sector_delta", String(pop.get("display_text", "")), is_imp)
			if bool(pop.get("is_purple", false)):
				_crowd_excitement = minf(1.0, _crowd_excitement + 0.22)
		_player_sector_idx = sec_idx
		_player_sector_start_sec = _race_clock_sec


func _on_player_lap_crossed(next_lap: int) -> void:
	if next_lap == total_laps and _player_hud_audio != null:
		_player_hud_audio.show_engineer_radio("🏁 FINAL LAP! EMPTY THE HYBRID BATTERY TO THE LINE!", 3.8)
		_player_hud_audio.play_crowd_cheer_surge(0.85)
		_crowd_excitement = 0.95
	elif next_lap > total_laps and current_phase == RacePhase.RACING:
		_finish_grand_prix()


func _finish_grand_prix() -> void:
	_set_race_phase(RacePhase.FINISHED_PODIUM)
	var player_pos: int = _get_player_standing_index() + 1
	if _player_hud_audio != null:
		_player_hud_audio.play_crowd_cheer_surge(1.0)
	if _podium_modal != null:
		_podium_modal.visible = true
	if _podium_summary_label != null:
		var medal: String = "🏆 P1 GRAND PRIX VICTORY!" if player_pos == 1 else ("🥈 P%d PODIUM FINISH!" % player_pos if player_pos <= 3 else "🏁 FINISHED P%d / %d" % [player_pos, _standings_order.size()])
		_podium_summary_label.text = "%s\n%s • TIME: %.2fs" % [medal, active_circuit_id, _race_clock_sec]


func _get_player_standing_index() -> int:
	for i: int in range(_standings_order.size()):
		if bool(_standings_order[i]["is_player"]):
			return i
	return 0


func _update_player_telemetry_hud_vfx_and_crowd(dt: float) -> void:
	if _player_car == null:
		return

	var p_idx: int = _get_player_standing_index()
	var player_pos: int = p_idx + 1
	if current_phase == RacePhase.RACING and player_pos < _prev_player_position:
		_crowd_excitement = 1.0
		if _player_hud_audio != null:
			_player_hud_audio.play_crowd_cheer_surge(0.92)
	_prev_player_position = player_pos
	_crowd_excitement = move_toward(_crowd_excitement, 0.30, dt * 0.14)

	var p_entry: Dictionary = _standings_order[p_idx] if p_idx < _standings_order.size() else {}
	var p_dist: float = float(p_entry.get("total_dist_game_m", 0.0))
	var ref_mps: float = maxf(28.0, _player_car.speed_kmh / 3.6)
	var gap_ahead_sec: float = 0.0
	var gap_behind_sec: float = 0.0
	if p_idx > 0:
		var ahead_dist: float = float(_standings_order[p_idx - 1]["total_dist_game_m"])
		gap_ahead_sec = maxf(0.0, (ahead_dist - p_dist) * MotorsportTelemetryData.DEFAULT_REAL_M_PER_GAME_M / ref_mps)
	if p_idx + 1 < _standings_order.size():
		var behind_dist: float = float(_standings_order[p_idx + 1]["total_dist_game_m"])
		gap_behind_sec = maxf(0.0, (p_dist - behind_dist) * MotorsportTelemetryData.DEFAULT_REAL_M_PER_GAME_M / ref_mps)

	var player_s: float = float(p_entry.get("last_s", 0.0))
	var on_main_straight: bool = (player_s > 865.0 or player_s < 165.0)
	var near_grandstand_01: float = 1.0 if on_main_straight else (0.55 if (player_s > 440.0 and player_s < 560.0) else 0.12)

	var tire_wear_arr: Array[float] = [1.0, 1.0, 1.0, 1.0]
	for c_i: int in range(4):
		var ck: String = ["FL", "FR", "RL", "RR"][c_i]
		if _player_car.wheel_states.has(ck):
			tire_wear_arr[c_i] = float(_player_car.wheel_states[ck].get("life", 1.0))

	var moisture_w: float = _weather_mgr.offline_moisture if _weather_mgr != null else 0.0
	var telemetry := {
		"speed_kmh": _player_car.speed_kmh,
		"rpm": _player_car.rpm,
		"gear": _player_car.gear,
		"throttle": _player_car.throttle_input,
		"brake": _player_car.brake_input,
		"ers_deploying": _player_car.ers_deploying,
		"in_slipstream": _player_car.in_slipstream,
		"drs_active": _player_car.drs_active,
		"skid_intensity": _player_car.skid_intensity,
		"max_slip_ratio": _player_car.skid_intensity * 0.65,
		"max_slip_angle_rad": _player_car.skid_intensity * 0.28,
		"on_curb": str(_player_car.wheel_states["FL"].get("surface_group", "")) == "surface_curb" or str(_player_car.wheel_states["FR"].get("surface_group", "")) == "surface_curb",
		"on_grass": str(_player_car.wheel_states["RL"].get("surface_group", "")) == "surface_grass",
		"on_gravel": str(_player_car.wheel_states["RL"].get("surface_group", "")) == "surface_gravel",
		"moisture": moisture_w,
		"track_wetness": moisture_w,
		"tire_wear": tire_wear_arr,
		"tire_temp_c": _player_car.tire_temps_c,
		"fuel_laps": _player_car.fuel_laps_remaining,
		"lap": clampi(int(p_entry.get("lap", 1)), 1, total_laps),
		"total_laps": total_laps,
		"position": player_pos,
		"total_cars": _all_vehicles.size(),
		"sector_id": _player_sector_idx + 1,
		"gap_ahead_sec": gap_ahead_sec,
		"gap_behind_sec": gap_behind_sec,
		"is_cockpit_view": (camera_index == 2),
		"camera_index": camera_index,
		"look_apex_normalized": _player_cam_rig.look_apex_normalized if _player_cam_rig != null else 0.0,
	}

	if _player_hud_audio != null:
		_player_hud_audio.update_audio_and_hud_frame(dt, telemetry, _ai_vehicles)
		_player_hud_audio.update_crowd_ambience(_player_car.speed_kmh, near_grandstand_01, _crowd_excitement)

	if _scatter_ctrl != null:
		_scatter_ctrl.set_player_telemetry(_player_car.global_position, _player_car.speed_kmh)

	if _weather_mgr != null:
		_weather_mgr.update_car_telemetry_vfx(&"player_1", telemetry)
		var cam_pos: Vector3 = _player_cam_rig.active_camera.global_position if (_player_cam_rig != null and _player_cam_rig.active_camera != null) else _player_car.global_position
		_weather_mgr.update_weather_and_vfx(
			dt,
			cam_pos,
			_player_car.global_position,
			_player_car.speed_kmh,
			_player_car.angular_velocity.y,
			on_main_straight and _player_car.speed_kmh > 250.0
		)

	if is_retro_1982_active and _retro_mode_node != null:
		var retro_payload := telemetry.duplicate()
		retro_payload["camera_mode"] = camera_index
		retro_payload["gearbox_mode"] = _player_car.gearbox_mode
		retro_payload["steer_input"] = _player_car.steer_input
		retro_payload["brake_input"] = _player_car.brake_input
		retro_payload["ers_charge"] = _player_car.ers_charge
		retro_payload["pit_sub_phase"] = _player_hud_audio.current_pit_sub_phase if _player_hud_audio != null else "IDLE"
		retro_payload["in_pit_stop"] = _player_hud_audio.pit_stop_active if _player_hud_audio != null else false
		retro_payload["crowd_excitement"] = _crowd_excitement
		if _retro_mode_node.has_method("update_telemetry"):
			_retro_mode_node.call("update_telemetry", retro_payload)
		elif _retro_mode_node.has_method("render_frame"):
			_retro_mode_node.call("render_frame", retro_payload)


func _set_race_phase(next_phase: RacePhase) -> void:
	current_phase = next_phase
	var names: Array[String] = ["GRID_INTRO", "COUNTDOWN", "RACING", "FINISHED_PODIUM"]
	race_phase_changed.emit(names[int(next_phase)])
