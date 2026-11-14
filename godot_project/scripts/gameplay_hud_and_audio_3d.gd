# ==============================================================================
# RACE PHANATIC F1 — POLE POSITION 2026 (GODOT 4.3 AAA PIPELINE — A+ EDITION)
# Agent: @Gameplay_Tuning_Lead (@others)
# File: godot_project/scripts/gameplay_hud_and_audio_3d.gd
#
# Responsibilities:
# 1. "Fun Factor" Collision & Barrier Rub Tuning (non-flipping PhysicsMaterial
#    restitution/friction + angular impulse clamping on wheel/barrier rubs).
# 2. Multi-Layer 3D Spatial Audio Director:
#    - 3-Layer V6 Hybrid Engine crossfade + straight-cut 8-speed spur-gear whine
#    - Cockpit View Inside-Helmet Acoustic Mode (boosted 800-3,400 Hz spur-gear
#      whine, silicon-carbide MGU-K inverter whistle, close-mic visor aero wind
#      rush, carbon floor marble/grit pings & helmet-damped exhaust tail)
#    - Living Stadium Crowd Roar & Grandstand Doppler + Overtake Cheer Surges
#    - Pneumatic Paoli Pit Wheel-Gun Bursts & Quick-Lift Hydraulic Jack Drop
# 3. Broadcast Telemetry HUD, Live 3-Sector Split Delta Popups (🟣/🟢/🔴 S1/S2/S3),
#    4-Corner Tire Surface/Core Thermal Matrix, Smart Engineer Radio, Pit Crew
#    Millisecond Sub-Phases & Optimal Clutch Launch Mini-Game.
# ==============================================================================
class_name GameplayHudAndAudio3D
extends Node

signal box_this_lap_toggled(is_armed: bool)
signal pit_strategy_updated(next_compound: String, fuel_laps: float, repair_mode: String, crew_push: String)
signal optimal_clutch_triggered(result_grade: String, time_saved_sec: float)
signal sector_delta_recorded(sector_idx: int, delta_sec: float, is_purple: bool)

# ------------------------------------------------------------------------------
# 1. "FUN FACTOR" COLLISION & BARRIER RUB TUNING CONSTANTS
# ------------------------------------------------------------------------------
@export_group("Fun Factor Collision Tuning")
@export var chassis_barrier_friction: float = 0.14       ## Low tangential friction so wall-brushes slide instead of hooking
@export var chassis_barrier_restitution: float = 0.18    ## Controlled rebound without pinball bouncing
@export var wheel_to_wheel_friction: float = 0.11        ## Prevents open-wheel tire-interlock launches
@export var wheel_to_wheel_restitution: float = 0.16     ## Clean wheel-to-wheel rubbing restitution (>95% fwd speed retention)
@export var max_collision_pitch_roll_rad_s: float = 1.65 ## Clamps flip-over angular velocity spikes on kerbs/collisions
@export var barrier_rub_speed_retention: float = 0.94    ## Retains momentum on shallow (<18 deg) barrier grazes
@export var spin_recovery_assist_yaw_damp: float = 3.4   ## Helps mobile players catch >35 deg tank-slappers

# ------------------------------------------------------------------------------
# 2. 3D AUDIO SYNTHESIS & STREAM PARAMETERS
# ------------------------------------------------------------------------------
@export_group("3D Spatial Audio Tuning")
@export var idle_rpm: float = 4000.0
@export var redline_rpm: float = 15000.0
@export var transmission_whine_max_db: float = -4.5
@export var tire_scrub_threshold_slip: float = 0.14
@export var curb_buzz_base_freq_hz: float = 128.0
@export var curb_buzz_max_freq_hz: float = 265.0
@export var doppler_passby_distance_m: float = 8.5
@export var doppler_min_rel_speed_kmh: float = 18.0

# ------------------------------------------------------------------------------
# 3. HUD & TELEMETRY WIDGET NODE REFERENCES
# ------------------------------------------------------------------------------
@export_group("HUD Node Paths")
@export var hud_root: Control
@export var speed_label: Label
@export var gear_label: Label
@export var rpm_progress_bar: ProgressBar
@export var drs_badge_label: Label
@export var lap_label: Label
@export var position_label: Label
@export var interval_sector_label: Label
@export var sector_delta_popup: Label
@export var engineer_radio_banner: Label
@export var pit_status_banner: Label
@export var clutch_cursor_slider: Range
@export var minimap_control: Control
@export var camera_mode_badge: Label

# ------------------------------------------------------------------------------
# INTERNAL STATE
# ------------------------------------------------------------------------------
var _vehicle_body: RigidBody3D
var _engine_low_player: AudioStreamPlayer3D
var _engine_mid_player: AudioStreamPlayer3D
var _engine_high_player: AudioStreamPlayer3D
var _gearbox_whine_player: AudioStreamPlayer3D
var _mguk_whistle_player: AudioStreamPlayer3D
var _visor_wind_player: AudioStreamPlayer3D
var _marble_ping_player: AudioStreamPlayer3D
var _tire_skid_player: AudioStreamPlayer3D
var _curb_buzz_player: AudioStreamPlayer3D
var _exhaust_crackle_player: AudioStreamPlayer3D
var _doppler_whoosh_player: AudioStreamPlayer3D
var _crowd_roar_player: AudioStreamPlayer3D
var _crowd_cheer_player: AudioStreamPlayer3D
var _pit_wheelgun_player: AudioStreamPlayer3D
var _pit_jackdrop_player: AudioStreamPlayer3D

var is_cockpit_acoustic_mode: bool = false
var _crowd_excitement_01: float = 0.25
var _marble_ping_cooldown_sec: float = 0.0
var _wheelgun_burst_cooldown_sec: float = 0.0
var _prev_pit_sub_phase: String = ""

var _best_sector_times: Array[float] = [999.0, 999.0, 999.0]
var _current_sector_idx: int = 0
var _current_sector_elapsed: float = 0.0
var _active_sector_popup_dict: Dictionary = {}
var _prev_throttle: float = 0.0
var _prev_gear: int = 1
var _whoosh_cooldown_sec: float = 0.0
var _popup_timer_sec: float = 0.0
var _radio_timer_sec: float = 0.0
var _warned_tire_35: bool = false
var _warned_fuel_15: bool = false

# Tire thermal & wear state mirrored for UI rendering
var _tire_temps_c: Array[float] = [88.0, 88.0, 90.0, 90.0]
var _tire_wear_01: Array[float] = [1.0, 1.0, 1.0, 1.0]
var _track_wetness_01: float = 0.0

# Interactive Pit Crew & Clutch Mini-Game State
var box_this_lap_armed: bool = false
var pit_stop_active: bool = false
var pit_stop_total_sec: float = 2.45
var pit_stop_remaining_sec: float = 0.0
var current_pit_sub_phase: String = "IDLE"
var clutch_minigame_active: bool = false
var clutch_cursor_01: float = 0.0
var clutch_cursor_dir: float = 1.0
var clutch_resolved: bool = false


func _ready() -> void:
	_setup_spatial_audio_nodes()


func bind_player_vehicle(vehicle: RigidBody3D) -> void:
	_vehicle_body = vehicle
	if _vehicle_body == null:
		return
	_apply_fun_factor_collision_material(_vehicle_body)


func set_cockpit_acoustic_mode(is_cockpit: bool) -> void:
	is_cockpit_acoustic_mode = is_cockpit
	if camera_mode_badge != null and is_cockpit:
		camera_mode_badge.text = "🎥 COCKPIT VIEW"


func reset_sector_splits() -> void:
	_best_sector_times = [999.0, 999.0, 999.0]
	_current_sector_idx = 0
	_current_sector_elapsed = 0.0
	_popup_timer_sec = 0.0
	_active_sector_popup_dict = {}
	if sector_delta_popup != null:
		sector_delta_popup.visible = false


func get_active_sector_delta_popup() -> Dictionary:
	if _popup_timer_sec <= 0.0:
		return {}
	return _active_sector_popup_dict


# ==============================================================================
# 1. "FUN FACTOR" COLLISION RESTITUTION, FRICTION & ANTI-FLIP STABILIZER
# ==============================================================================
func _apply_fun_factor_collision_material(body: RigidBody3D) -> void:
	var phys_mat := PhysicsMaterial.new()
	phys_mat.friction = chassis_barrier_friction
	phys_mat.bounce = chassis_barrier_restitution
	phys_mat.absorbent = false
	phys_mat.rough = false
	body.physics_material_override = phys_mat
	body.continuous_cd = true
	body.contact_monitor = true
	body.max_contacts_reported = 8


func stabilize_collision_and_barrier_rub(
	body: RigidBody3D,
	dt: float,
	steer_input: float,
	slip_angle_rear_rad: float
) -> void:
	if body == null:
		return

	# 1A. Clamp pitch (X) and roll (Z) angular velocities so high-speed curb strikes
	#     or wheel-to-wheel rubs never flip the F1 car upside down on mobile!
	var ang_vel: Vector3 = body.angular_velocity
	var local_ang: Vector3 = body.global_transform.basis.inverse() * ang_vel
	local_ang.x = clampf(local_ang.x, -max_collision_pitch_roll_rad_s, max_collision_pitch_roll_rad_s)
	local_ang.z = clampf(local_ang.z, -max_collision_pitch_roll_rad_s, max_collision_pitch_roll_rad_s)

	# 1B. Counter-steer tank-slapper damping when player is actively counter-steering
	if absf(slip_angle_rear_rad) > 0.22 and signf(steer_input) != signf(local_ang.y):
		local_ang.y = move_toward(local_ang.y, 0.0, spin_recovery_assist_yaw_damp * dt)

	body.angular_velocity = body.global_transform.basis * local_ang

	# 1C. Shallow barrier graze momentum preservation (prevents sticky wall-snagging)
	var state := PhysicsServer3D.body_get_direct_state(body.get_rid())
	if state == null:
		return
	var contact_count: int = state.get_contact_count()
	for i in range(contact_count):
		var normal: Vector3 = state.get_contact_local_normal(i)
		if absf(normal.y) < 0.35:
			var vel: Vector3 = body.linear_velocity
			var into_wall_speed: float = -vel.dot(normal)
			if into_wall_speed > 0.5:
				var tangent_vel: Vector3 = vel + normal * (into_wall_speed * (1.0 + chassis_barrier_restitution))
				body.linear_velocity = tangent_vel * barrier_rub_speed_retention
				break


# ==============================================================================
# 2. 3D SPATIAL AUDIO SYNTHESIS & MULTI-LAYER TELEMETRY MODULATION
# ==============================================================================
func _setup_spatial_audio_nodes() -> void:
	_engine_low_player = _create_3d_player("EngineLow_3D", -6.0, 45.0)
	_engine_mid_player = _create_3d_player("EngineMid_3D", -4.0, 55.0)
	_engine_high_player = _create_3d_player("EngineHigh_3D", -2.5, 75.0)
	_gearbox_whine_player = _create_3d_player("GearboxWhine_3D", -12.0, 35.0)
	_mguk_whistle_player = _create_3d_player("MGUKInverterWhistle_3D", -22.0, 22.0)
	_visor_wind_player = _create_3d_player("CockpitVisorWind_3D", -26.0, 18.0)
	_marble_ping_player = _create_3d_player("CarbonFloorMarblePing_3D", -18.0, 14.0)
	_tire_skid_player = _create_3d_player("TireSkid_3D", -18.0, 30.0)
	_curb_buzz_player = _create_3d_player("CurbBuzz_3D", -16.0, 28.0)
	_exhaust_crackle_player = _create_3d_player("ExhaustCrackle_3D", -5.0, 45.0)
	_doppler_whoosh_player = _create_3d_player("DopplerWhoosh_3D", -3.0, 60.0)
	_crowd_roar_player = _create_3d_player("GrandstandCrowdRoar_3D", -24.0, 180.0)
	_crowd_cheer_player = _create_3d_player("GrandstandCrowdCheerSurge_3D", -8.0, 220.0)
	_pit_wheelgun_player = _create_3d_player("PaoliPitWheelGun_3D", -4.0, 42.0)
	_pit_jackdrop_player = _create_3d_player("HydraulicPitJackDrop_3D", -3.5, 38.0)


func _create_3d_player(node_name: String, base_db: float, max_dist: float) -> AudioStreamPlayer3D:
	var p := AudioStreamPlayer3D.new()
	p.name = node_name
	p.volume_db = base_db
	p.max_distance = max_dist
	p.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
	p.doppler_tracking = AudioStreamPlayer3D.DOPPLER_TRACKING_PHYSICS_STEP
	p.panning_strength = 1.15
	add_child(p)
	return p


func update_audio_and_hud_frame(dt: float, telemetry: Dictionary, rivals: Array = []) -> void:
	if _whoosh_cooldown_sec > 0.0:
		_whoosh_cooldown_sec = maxf(0.0, _whoosh_cooldown_sec - dt)
	if _marble_ping_cooldown_sec > 0.0:
		_marble_ping_cooldown_sec = maxf(0.0, _marble_ping_cooldown_sec - dt)
	if _wheelgun_burst_cooldown_sec > 0.0:
		_wheelgun_burst_cooldown_sec = maxf(0.0, _wheelgun_burst_cooldown_sec - dt)
	if _popup_timer_sec > 0.0:
		_popup_timer_sec = maxf(0.0, _popup_timer_sec - dt)
		if _popup_timer_sec <= 0.0:
			_active_sector_popup_dict = {}
			if sector_delta_popup != null:
				sector_delta_popup.visible = false
	if _radio_timer_sec > 0.0:
		_radio_timer_sec = maxf(0.0, _radio_timer_sec - dt)
		if _radio_timer_sec <= 0.0 and engineer_radio_banner != null:
			engineer_radio_banner.visible = false

	if telemetry.has("is_cockpit_view"):
		is_cockpit_acoustic_mode = bool(telemetry["is_cockpit_view"])

	var rpm: float = float(telemetry.get("rpm", idle_rpm))
	var gear: int = int(telemetry.get("gear", 1))
	var speed_kmh: float = float(telemetry.get("speed_kmh", 0.0))
	var throttle: float = float(telemetry.get("throttle", 0.0))
	var brake: float = float(telemetry.get("brake", 0.0))
	var ers_deploying: bool = bool(telemetry.get("ers_deploying", throttle > 0.82 and speed_kmh > 110.0))
	var max_slip_ratio: float = float(telemetry.get("max_slip_ratio", 0.0))
	var max_slip_angle_rad: float = float(telemetry.get("max_slip_angle_rad", 0.0))
	var on_curb: bool = bool(telemetry.get("on_curb", false))
	var on_offtrack: bool = bool(telemetry.get("on_grass", false)) or bool(telemetry.get("on_gravel", false))

	# 2A. 3-Layer Engine RPM Pitch & Crossfade + Inside-Helmet Shell Filtering
	var rpm_norm: float = clampf((rpm - idle_rpm) / maxf(1.0, redline_rpm - idle_rpm), 0.0, 1.0)
	var load_boost_db: float = lerpf(-3.5, 2.2, throttle)
	var helmet_high_cut_db: float = -2.8 if is_cockpit_acoustic_mode else 0.0
	var helmet_induction_boost_db: float = 1.8 if is_cockpit_acoustic_mode else 0.0

	_engine_low_player.pitch_scale = lerpf(0.68, 1.45, rpm_norm)
	_engine_mid_player.pitch_scale = lerpf(0.75, 1.85, rpm_norm)
	_engine_high_player.pitch_scale = lerpf(0.82, 2.35, rpm_norm)

	var low_weight: float = clampf(1.0 - rpm_norm * 1.65, 0.05, 1.0)
	var mid_weight: float = clampf(1.0 - absf(rpm_norm - 0.52) * 2.1, 0.08, 1.0)
	var high_weight: float = clampf((rpm_norm - 0.35) * 1.55, 0.02, 1.0)

	_engine_low_player.volume_db = linear_to_db(low_weight) + load_boost_db + helmet_induction_boost_db * 0.5
	_engine_mid_player.volume_db = linear_to_db(mid_weight) + load_boost_db + helmet_induction_boost_db
	_engine_high_player.volume_db = linear_to_db(high_weight) + load_boost_db + helmet_high_cut_db

	# 2B. Straight-Cut 8-Speed Spur-Gear Whine (prominent 800-3,400 Hz inside helmet!)
	var speed_norm: float = clampf(speed_kmh / 345.0, 0.0, 1.0)
	var cockpit_whine_boost_db: float = 5.2 if is_cockpit_acoustic_mode else 0.0
	_gearbox_whine_player.pitch_scale = lerpf(0.55, 2.85, speed_norm) + float(gear) * 0.065
	_gearbox_whine_player.volume_db = lerpf(-28.0, transmission_whine_max_db + cockpit_whine_boost_db, pow(speed_norm, 0.72))

	# 2C. Inside-Helmet MGU-K Inverter Whistle, Close-Mic Visor Aero Wind & Carbon Floor Marble Pings
	if is_cockpit_acoustic_mode and speed_kmh > 32.0:
		var mguk_active: float = 1.0 if (ers_deploying or brake > 0.35) else 0.25
		_mguk_whistle_player.pitch_scale = lerpf(1.15, 3.10, speed_norm)
		_mguk_whistle_player.volume_db = lerpf(-28.0, -7.5, speed_norm * mguk_active)
		_visor_wind_player.pitch_scale = lerpf(0.85, 1.68, speed_norm)
		_visor_wind_player.volume_db = lerpf(-26.0, -6.5, pow(speed_norm, 1.25))

		var marble_prob: float = (0.35 if (on_curb or on_offtrack) else 0.06) * speed_norm
		if _marble_ping_cooldown_sec <= 0.0 and randf() < marble_prob * dt * 12.0:
			_marble_ping_cooldown_sec = randf_range(0.11, 0.34)
			_marble_ping_player.pitch_scale = randf_range(1.35, 2.45)
			_marble_ping_player.volume_db = randf_range(-13.0, -6.0)
			if _marble_ping_player.stream != null:
				_marble_ping_player.play()
	else:
		_mguk_whistle_player.volume_db = -60.0
		_visor_wind_player.volume_db = -60.0

	# 2D. Off-Throttle Overrun Crackles & Waste-Gate Flutter on High-RPM Lift / Downshift
	if (_prev_throttle > 0.65 and throttle < 0.18 and rpm_norm > 0.58) or (gear < _prev_gear and speed_kmh > 95.0):
		trigger_exhaust_backfire_pop(rpm_norm)
	_prev_throttle = throttle
	_prev_gear = gear

	# 2E. Tire Scrub & Lockup Squeal (modulated by combined slip ratio + slip angle)
	var combined_slip: float = maxf(max_slip_ratio, absf(max_slip_angle_rad) * 1.85)
	if combined_slip > tire_scrub_threshold_slip and speed_kmh > 25.0:
		var slip_intensity: float = clampf((combined_slip - tire_scrub_threshold_slip) / 0.55, 0.0, 1.0)
		_tire_skid_player.pitch_scale = lerpf(0.84, 1.32, slip_intensity)
		_tire_skid_player.volume_db = lerpf(-24.0, -1.5, slip_intensity)
	else:
		_tire_skid_player.volume_db = -60.0

	# 2F. FIA Serrated Kerb Sawtooth Resonance (128 Hz - 265 Hz speed-synced buzz)
	if on_curb and speed_kmh > 35.0:
		var curb_freq_norm: float = clampf(speed_kmh / 300.0, 0.0, 1.0)
		_curb_buzz_player.pitch_scale = lerpf(1.0, curb_buzz_max_freq_hz / curb_buzz_base_freq_hz, curb_freq_norm)
		_curb_buzz_player.volume_db = lerpf(-14.0, -0.5 if is_cockpit_acoustic_mode else -1.5, curb_freq_norm)
	else:
		_curb_buzz_player.volume_db = -60.0

	# 2G. Stereo-Panned Rival Doppler Pass-By Whoosh
	_check_rival_doppler_passby(speed_kmh, rivals)

	# 3. Update Broadcast Telemetry HUD, Pit Stop Sub-Phases & Smart Engineer Warnings
	_update_broadcast_hud(dt, telemetry)


func update_crowd_ambience(speed_kmh: float, near_grandstand_01: float, excitement_01: float) -> void:
	_crowd_excitement_01 = clampf(excitement_01, 0.0, 1.0)
	if _crowd_roar_player == null:
		return
	var prox: float = clampf(near_grandstand_01, 0.0, 1.0)
	var level: float = clampf(prox * (0.45 + _crowd_excitement_01 * 0.55), 0.0, 1.0)
	if level <= 0.02:
		_crowd_roar_player.volume_db = -60.0
		return
	var doppler_shift: float = clampf(1.0 + (speed_kmh / 340.0) * 0.12 * prox, 0.88, 1.18)
	_crowd_roar_player.pitch_scale = doppler_shift
	_crowd_roar_player.volume_db = lerpf(-28.0, -3.5, level)


func play_crowd_cheer_surge(intensity_01: float = 1.0) -> void:
	var clamped: float = clampf(intensity_01, 0.15, 1.0)
	_crowd_excitement_01 = maxf(_crowd_excitement_01, clamped)
	if _crowd_cheer_player == null:
		return
	_crowd_cheer_player.pitch_scale = randf_range(0.95, 1.08)
	_crowd_cheer_player.volume_db = lerpf(-11.0, -1.0, clamped)
	if _crowd_cheer_player.stream != null:
		_crowd_cheer_player.play()


func play_pit_wheel_gun_burst(corner_pan: float = 0.0) -> void:
	if _pit_wheelgun_player == null or _wheelgun_burst_cooldown_sec > 0.0:
		return
	_wheelgun_burst_cooldown_sec = 0.15
	_pit_wheelgun_player.position = Vector3(clampf(corner_pan, -1.0, 1.0) * 0.9, 0.35, 0.0)
	_pit_wheelgun_player.pitch_scale = randf_range(0.96, 1.14)
	_pit_wheelgun_player.volume_db = -2.0
	if _pit_wheelgun_player.stream != null:
		_pit_wheelgun_player.play()


func play_pit_jack_drop() -> void:
	if _pit_jackdrop_player == null:
		return
	_pit_jackdrop_player.pitch_scale = randf_range(0.94, 1.04)
	_pit_jackdrop_player.volume_db = -1.5
	if _pit_jackdrop_player.stream != null:
		_pit_jackdrop_player.play()


func trigger_exhaust_backfire_pop(intensity_01: float = 0.8) -> void:
	if _exhaust_crackle_player == null:
		return
	_exhaust_crackle_player.pitch_scale = randf_range(0.88, 1.18)
	_exhaust_crackle_player.volume_db = lerpf(-9.0, 0.0, clampf(intensity_01, 0.0, 1.0))
	if _exhaust_crackle_player.stream != null:
		_exhaust_crackle_player.play()


func _check_rival_doppler_passby(player_speed_kmh: float, rivals: Array) -> void:
	if _vehicle_body == null or _whoosh_cooldown_sec > 0.0:
		return
	var p_pos: Vector3 = _vehicle_body.global_position
	for rival in rivals:
		if not (rival is Node3D):
			continue
		var r_pos: Vector3 = (rival as Node3D).global_position
		var dist_m: float = p_pos.distance_to(r_pos)
		if dist_m < doppler_passby_distance_m and dist_m > 1.2:
			var r_spd: float = float(rival.get("speed_kmh")) if "speed_kmh" in rival else 220.0
			var rel_kmh: float = absf(player_speed_kmh - r_spd)
			if rel_kmh >= doppler_min_rel_speed_kmh:
				_whoosh_cooldown_sec = 1.45
				_doppler_whoosh_player.global_position = r_pos
				_doppler_whoosh_player.pitch_scale = clampf(0.82 + (rel_kmh / 140.0), 0.78, 1.75)
				_doppler_whoosh_player.volume_db = lerpf(-8.0, 1.5, clampf(rel_kmh / 95.0, 0.0, 1.0))
				if _doppler_whoosh_player.stream != null:
					_doppler_whoosh_player.play()
				break


# ==============================================================================
# 3. BROADCAST HUD, LIVE SECTOR DELTAS, PIT SUB-PHASES & CLUTCH LAUNCH
# ==============================================================================
func _update_broadcast_hud(dt: float, telemetry: Dictionary) -> void:
	var speed_kmh: float = float(telemetry.get("speed_kmh", 0.0))
	var gear: int = int(telemetry.get("gear", 1))
	var rpm: float = float(telemetry.get("rpm", idle_rpm))
	var lap: int = int(telemetry.get("lap", 1))
	var total_laps: int = int(telemetry.get("total_laps", 5))
	var pos: int = int(telemetry.get("position", 1))
	var total_cars: int = int(telemetry.get("total_cars", 8))
	var gap_ahead_sec: float = float(telemetry.get("gap_ahead_sec", 0.0))
	var gap_behind_sec: float = float(telemetry.get("gap_behind_sec", 0.0))
	var in_slipstream: bool = bool(telemetry.get("in_slipstream", false))
	var drs_active: bool = bool(telemetry.get("drs_active", false))
	var fuel_laps: float = float(telemetry.get("fuel_laps", 5.0))
	_track_wetness_01 = float(telemetry.get("track_wetness", 0.0))

	if telemetry.has("tire_wear") and telemetry["tire_wear"] is Array:
		var tw: Array = telemetry["tire_wear"]
		for i in range(min(4, tw.size())):
			_tire_wear_01[i] = float(tw[i])
	if telemetry.has("tire_temp_c") and telemetry["tire_temp_c"] is Array:
		var tt: Array = telemetry["tire_temp_c"]
		for i in range(min(4, tt.size())):
			_tire_temps_c[i] = float(tt[i])

	if speed_label != null:
		speed_label.text = "%03d" % int(roundf(speed_kmh))
	if gear_label != null:
		gear_label.text = "G%d" % gear
	if rpm_progress_bar != null:
		rpm_progress_bar.value = clampf(((rpm - idle_rpm) / maxf(1.0, redline_rpm - idle_rpm)) * 100.0, 0.0, 100.0)
	if drs_badge_label != null:
		drs_badge_label.visible = in_slipstream or drs_active
		drs_badge_label.text = "⚡ DRS +15 KM/H" if in_slipstream else "⚡ DRS OPEN"
	if lap_label != null:
		lap_label.text = "LAP %d/%d" % [lap, total_laps]
	if position_label != null:
		position_label.text = "P%d/%d" % [pos, total_cars]

	# Live Sector + Interval / Gap Readout (or temporary 2.5s S1/S2/S3 Split Delta Flash)
	_current_sector_elapsed += dt
	var sec_num: int = int(telemetry.get("sector_id", _current_sector_idx + 1))
	if interval_sector_label != null:
		if _popup_timer_sec > 0.0 and _active_sector_popup_dict.has("display_text"):
			interval_sector_label.text = String(_active_sector_popup_dict["display_text"])
		elif pos == 1:
			interval_sector_label.text = "S%d • LEAD +%.1fs" % [sec_num, gap_behind_sec]
		else:
			interval_sector_label.text = "S%d • INT -%.1fs" % [sec_num, gap_ahead_sec]

	# Smart Race Engineer Warnings (35% Tire Wear & 1.5 Laps Fuel)
	var min_tire_life: float = minf(minf(_tire_wear_01[0], _tire_wear_01[1]), minf(_tire_wear_01[2], _tire_wear_01[3]))
	if min_tire_life <= 0.35 and min_tire_life > 0.25 and not _warned_tire_35:
		_warned_tire_35 = true
		show_engineer_radio("📻 ENGINEER: Tires at %d%% — pit window open, consider boxing soon." % int(roundf(min_tire_life * 100.0)))
	elif min_tire_life > 0.60:
		_warned_tire_35 = false

	if fuel_laps <= 1.5 and fuel_laps > 0.05 and not _warned_fuel_15:
		_warned_fuel_15 = true
		show_engineer_radio("📻 ENGINEER: Low fuel (%.1f laps left) — box this lap!" % fuel_laps)
	elif fuel_laps > 2.2:
		_warned_fuel_15 = false

	# Stationary Pit Crew Sub-Phase Progression & Optimal Clutch Release Mini-Game
	if pit_stop_active:
		_step_pit_stop_service(dt)


func record_sector_split(sector_idx: int, sector_time_sec: float) -> Dictionary:
	notify_sector_checkpoint_crossed(sector_idx, sector_time_sec)
	return _active_sector_popup_dict


func notify_sector_checkpoint_crossed(sector_idx: int, sector_time_sec: float) -> void:
	if sector_idx < 0 or sector_idx >= 3 or sector_time_sec <= 0.5:
		return
	var prev_best: float = _best_sector_times[sector_idx]
	var has_baseline: bool = prev_best < 900.0
	var delta: float = (sector_time_sec - prev_best) if has_baseline else 0.0
	var is_purple: bool = sector_time_sec < prev_best
	if is_purple:
		_best_sector_times[sector_idx] = sector_time_sec

	emit_signal("sector_delta_recorded", sector_idx, delta, is_purple)

	var sign_str: String = "+" if delta > 0.0 else ""
	var disp_text: String = ""
	var tint_col: Color = Color(0.88, 0.25, 0.98)
	if not has_baseline or delta <= -0.02:
		disp_text = "🟣 S%d %s%.2fs" % [sector_idx + 1, sign_str, delta] if has_baseline else "🟣 S%d %.2fs" % [sector_idx + 1, sector_time_sec]
		tint_col = Color(0.88, 0.25, 0.98)
	elif delta <= 0.08:
		disp_text = "🟢 S%d %s%.2fs" % [sector_idx + 1, sign_str, delta]
		tint_col = Color(0.0, 0.90, 0.46)
	else:
		disp_text = "🔴 S%d +%0.2fs" % [sector_idx + 1, delta]
		tint_col = Color(1.0, 0.24, 0.30)

	_popup_timer_sec = 2.5
	_active_sector_popup_dict = {
		"sector": sector_idx + 1,
		"split_sec": sector_time_sec,
		"delta_sec": delta,
		"is_purple": is_purple,
		"display_text": disp_text,
		"color": tint_col
	}

	if sector_delta_popup != null:
		sector_delta_popup.visible = true
		sector_delta_popup.text = disp_text
		sector_delta_popup.modulate = tint_col


func show_engineer_radio(message: String, duration_sec: float = 4.0) -> void:
	if engineer_radio_banner == null:
		return
	engineer_radio_banner.text = message
	engineer_radio_banner.visible = true
	_radio_timer_sec = duration_sec


func begin_stationary_pit_stop(total_duration_sec: float = 2.45) -> void:
	pit_stop_active = true
	pit_stop_total_sec = maxf(1.4, total_duration_sec)
	pit_stop_remaining_sec = pit_stop_total_sec
	current_pit_sub_phase = "JACK_UP"
	_prev_pit_sub_phase = ""
	clutch_minigame_active = false
	clutch_cursor_01 = 0.1
	clutch_cursor_dir = 1.0
	clutch_resolved = false


func _step_pit_stop_service(dt: float) -> void:
	pit_stop_remaining_sec = maxf(0.0, pit_stop_remaining_sec - dt)
	var elapsed: float = pit_stop_total_sec - pit_stop_remaining_sec
	var prog: float = clampf(elapsed / maxf(0.1, pit_stop_total_sec), 0.0, 1.0)

	var sub_phase_banner: String = "TORQUE LOCKED • CLEAR!"
	var phase_code: String = "DROP_GO"
	if prog < 0.22:
		sub_phase_banner = "JACKS UP • LOOSENING NUTS"
		phase_code = "JACK_UP"
	elif prog < 0.44:
		sub_phase_banner = "GUNNERS OFF • REMOVING WORN SET"
		phase_code = "GUNS_OFF"
	elif prog < 0.68:
		sub_phase_banner = "FITTING FRESH PIRELLI COMPOUND"
		phase_code = "SWAP_TIRES"
	elif prog < 0.88:
		sub_phase_banner = "PAOLI TORQUE LOCK • FUEL FLOW"
		phase_code = "GUNS_TORQUE"

	current_pit_sub_phase = phase_code
	if phase_code != _prev_pit_sub_phase:
		if phase_code == "GUNS_OFF":
			play_pit_wheel_gun_burst(-0.65)
		elif phase_code == "GUNS_TORQUE":
			play_pit_wheel_gun_burst(0.65)
		elif phase_code == "DROP_GO":
			play_pit_jack_drop()
		_prev_pit_sub_phase = phase_code

	if pit_status_banner != null:
		pit_status_banner.visible = true
		pit_status_banner.text = "%s (%.2fs)" % [sub_phase_banner, pit_stop_remaining_sec]

	if pit_stop_remaining_sec <= 1.45 and pit_stop_remaining_sec > 0.06:
		clutch_minigame_active = true
		if not clutch_resolved:
			clutch_cursor_01 += clutch_cursor_dir * dt * 1.52
			if clutch_cursor_01 >= 1.0:
				clutch_cursor_01 = 1.0
				clutch_cursor_dir = -1.0
			elif clutch_cursor_01 <= 0.0:
				clutch_cursor_01 = 0.0
				clutch_cursor_dir = 1.0
			if clutch_cursor_slider != null:
				clutch_cursor_slider.value = clutch_cursor_01 * 100.0

	if pit_stop_remaining_sec <= 0.0:
		pit_stop_active = false
		clutch_minigame_active = false
		current_pit_sub_phase = "CLEAR"
		if pit_status_banner != null:
			pit_status_banner.visible = false


func attempt_clutch_release() -> String:
	if not clutch_minigame_active or clutch_resolved:
		return "NONE"
	clutch_resolved = true
	if clutch_cursor_01 >= 0.38 and clutch_cursor_01 <= 0.64:
		pit_stop_remaining_sec = maxf(0.05, pit_stop_remaining_sec - 0.35)
		emit_signal("optimal_clutch_triggered", "PERFECT", 0.35)
		return "PERFECT"
	if clutch_cursor_01 >= 0.28 and clutch_cursor_01 <= 0.74:
		pit_stop_remaining_sec = maxf(0.05, pit_stop_remaining_sec - 0.15)
		emit_signal("optimal_clutch_triggered", "GOOD", 0.15)
		return "GOOD"
	emit_signal("optimal_clutch_triggered", "MISS", 0.0)
	return "MISS"
