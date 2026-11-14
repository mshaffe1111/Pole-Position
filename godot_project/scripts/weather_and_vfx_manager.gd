extends Node3D
class_name WeatherAndVFXManager

# ==============================================================================
# RACE PHANATIC F1 — POLE POSITION 2026 (GODOT 4 AAA VFX & WEATHER PIPELINE)
# Script: weather_and_vfx_manager.gd (@Godot_VFX_Shaders_Lead)
# Purpose:
#   - 1:1 Godot 4 counterpart to `src/weather.js` & `src/models.js` VFX systems
#   - Fixed-per-race 6-Regime Weather State Machine (`HOT_SUNNY`, `GOLDEN_SUNSET`,
#     `OVERCAST_COOL`, `LIGHT_DRIZZLE`, `MONSOON_STORM`, `NEON_NIGHT`)
#   - Configures `WorldEnvironment` (`PhysicalSkyMaterial`, ACES Filmic tonemap,
#     mobile-safe Glow/Bloom, Volumetric/Exponential Fog) & `DirectionalLight3D`
#     2-split mobile Cascaded Shadow Maps (`SHADOW_PARALLEL_2_SPLITS`, 2048x2048)
#     with contact shadows
#   - Synchronizes global shader uniforms (`global_wetness`, `groove_wetness`,
#     `wind_direction`, `wind_speed`, `crowd_excitement`, `camera_flash_rate`)
#   - Drives `GPUParticles3D` for world-space rain streaks, multi-stage wet
#     rooster-tail spray, >250 km/h wingtip aero vortex contrails, titanium
#     skid-block sparks, gravel/grass kick-up, and lock-up tire smoke puffs
# ==============================================================================

signal thunder_clapped(intensity: float)
signal weather_configured(regime_id: String, groove_moisture: float, offline_moisture: float)

const WEATHER_REGIMES: Dictionary = {
	"HOT_SUNNY": {
		"id": "HOT_SUNNY",
		"label": "HOT & SUNNY",
		"moisture": 0.00,
		"ambient_temp_c": 31.0,
		"track_temp_c": 46.0,
		"sun_color": Color(1.00, 0.97, 0.90),
		"sun_energy": 1.45,
		"sun_elevation_deg": 48.0,
		"sun_azimuth_deg": 32.0,
		"sky_top_color": Color(0.055, 0.361, 0.878),
		"sky_horizon_color": Color(0.780, 0.910, 1.000),
		"ground_bottom_color": Color(0.145, 0.175, 0.145),
		"fog_density": 0.00014,
		"wind_speed": 1.15,
		"rain_rate": 0.0
	},
	"GOLDEN_SUNSET": {
		"id": "GOLDEN_SUNSET",
		"label": "GOLDEN SUNSET",
		"moisture": 0.00,
		"ambient_temp_c": 24.0,
		"track_temp_c": 33.0,
		"sun_color": Color(1.00, 0.745, 0.400),
		"sun_energy": 1.38,
		"sun_elevation_deg": 14.5,
		"sun_azimuth_deg": 62.0,
		"sky_top_color": Color(0.176, 0.361, 0.722),
		"sky_horizon_color": Color(1.000, 0.769, 0.420),
		"ground_bottom_color": Color(0.220, 0.145, 0.125),
		"fog_density": 0.00022,
		"wind_speed": 1.05,
		"rain_rate": 0.0
	},
	"OVERCAST_COOL": {
		"id": "OVERCAST_COOL",
		"label": "OVERCAST COOL",
		"moisture": 0.04,
		"ambient_temp_c": 18.0,
		"track_temp_c": 22.0,
		"sun_color": Color(0.933, 0.957, 0.980),
		"sun_energy": 0.92,
		"sun_elevation_deg": 38.0,
		"sun_azimuth_deg": 24.0,
		"sky_top_color": Color(0.290, 0.392, 0.510),
		"sky_horizon_color": Color(0.796, 0.851, 0.910),
		"ground_bottom_color": Color(0.165, 0.180, 0.195),
		"fog_density": 0.00028,
		"wind_speed": 1.45,
		"rain_rate": 0.0
	},
	"LIGHT_DRIZZLE": {
		"id": "LIGHT_DRIZZLE",
		"label": "LIGHT DRIZZLE",
		"moisture": 0.42,
		"ambient_temp_c": 16.0,
		"track_temp_c": 19.0,
		"sun_color": Color(0.784, 0.847, 0.910),
		"sun_energy": 0.74,
		"sun_elevation_deg": 34.0,
		"sun_azimuth_deg": 18.0,
		"sky_top_color": Color(0.204, 0.290, 0.388),
		"sky_horizon_color": Color(0.612, 0.690, 0.769),
		"ground_bottom_color": Color(0.115, 0.135, 0.160),
		"fog_density": 0.00042,
		"wind_speed": 1.85,
		"rain_rate": 0.52
	},
	"MONSOON_STORM": {
		"id": "MONSOON_STORM",
		"label": "MONSOON STORM",
		"moisture": 0.88,
		"ambient_temp_c": 14.0,
		"track_temp_c": 16.0,
		"sun_color": Color(0.643, 0.737, 0.847),
		"sun_energy": 0.56,
		"sun_elevation_deg": 28.0,
		"sun_azimuth_deg": 12.0,
		"sky_top_color": Color(0.122, 0.184, 0.275),
		"sky_horizon_color": Color(0.400, 0.486, 0.588),
		"ground_bottom_color": Color(0.085, 0.105, 0.135),
		"fog_density": 0.00064,
		"wind_speed": 2.65,
		"rain_rate": 1.00
	},
	"NEON_NIGHT": {
		"id": "NEON_NIGHT",
		"label": "NEON NIGHT",
		"moisture": 0.00,
		"ambient_temp_c": 20.0,
		"track_temp_c": 24.0,
		"sun_color": Color(0.847, 0.925, 1.000),
		"sun_energy": 0.42,
		"sun_elevation_deg": 36.0,
		"sun_azimuth_deg": 44.0,
		"sky_top_color": Color(0.035, 0.071, 0.180),
		"sky_horizon_color": Color(0.231, 0.141, 0.400),
		"ground_bottom_color": Color(0.045, 0.035, 0.085),
		"fog_density": 0.00018,
		"wind_speed": 0.95,
		"rain_rate": 0.0
	}
}

@export_group("Scene Node References")
@export var world_environment: WorldEnvironment
@export var sun_light: DirectionalLight3D
@export var fill_light: DirectionalLight3D
@export var reflection_probe: ReflectionProbe
@export var windshield_rain_material: ShaderMaterial

@export_group("Global Rain & Track VFX Emitters")
@export var rain_streaks_particles: GPUParticles3D
@export var rain_splash_particles: GPUParticles3D

var current_regime_id: String = "HOT_SUNNY"
var groove_moisture: float = 0.0
var offline_moisture: float = 0.0
var ambient_temp: float = 31.0
var track_temp: float = 46.0
var active_theme: String = "FUJI"
var is_night_active: bool = false

var _lightning_flash: float = 0.0
var _lightning_cooldown: float = 7.5
var _wind_vector: Vector3 = Vector3(0.82, 0.0, 0.57)
var _base_sun_energy: float = 2.15
var _visor_wipe_progress: float = 0.0
var _visor_wipe_active: bool = false

# Per-car registered VFX rigs: car_id -> Dictionary of GPUParticles3D / MeshInstance3D nodes
var _car_vfx_rigs: Dictionary = {}

func _ready() -> void:
	_ensure_environment_and_lights()
	_ensure_global_rain_particles()
	configure_for_session("2026_UPDATED", "HOT_SUNNY", {"theme": "FUJI", "forceNight": false})

# ------------------------------------------------------------------------------
# 1. INITIALIZATION OF MOBILE-OPTIMIZED WORLD ENVIRONMENT & 2-SPLIT CSM SHADOWS
# ------------------------------------------------------------------------------
func _ensure_environment_and_lights() -> void:
	if world_environment == null:
		world_environment = WorldEnvironment.new()
		world_environment.name = "GrandPrixWorldEnvironment"
		add_child(world_environment)

	if world_environment.environment == null:
		var env := Environment.new()
		var sky := Sky.new()
		var sky_mat := PhysicalSkyMaterial.new()
		sky_mat.rayleigh_coefficient = 2.2
		sky_mat.mie_coefficient = 0.006
		sky_mat.mie_eccentricity = 0.82
		sky_mat.turbidity = 10.0
		sky.sky_material = sky_mat
		sky.radiance_size = Sky.RADIANCE_SIZE_256

		env.background_mode = Environment.BG_SKY
		env.sky = sky
		env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
		env.ambient_light_sky_contribution = 0.78
		env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
		env.tonemap_mode = Environment.TONE_MAPPER_ACES
		env.tonemap_exposure = 1.06
		env.tonemap_white = 6.0

		# Mobile-safe HDR Glow / Bloom (strictly above 1.15 threshold — zero milky sky wash!)
		env.glow_enabled = true
		env.glow_intensity = 0.34
		env.glow_strength = 0.80
		env.glow_bloom = 0.05
		env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
		env.glow_hdr_threshold = 1.15

		# Ultra-clear 75%-reduced atmospheric horizon fog
		env.fog_enabled = true
		env.fog_light_energy = 0.72
		env.fog_sun_scatter = 0.20
		env.fog_density = 0.00004
		env.fog_sky_affect = 0.08
		world_environment.environment = env

	if sun_light == null:
		sun_light = DirectionalLight3D.new()
		sun_light.name = "PrimarySunLight3D"
		add_child(sun_light)

	# Mobile-safe 2-Split Cascaded Shadow Maps (2048x2048 atlas) + Crisp Contact Shadows
	sun_light.shadow_enabled = true
	sun_light.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun_light.directional_shadow_split_1 = 0.14
	sun_light.directional_shadow_max_distance = 135.0
	sun_light.directional_shadow_blend_splits = true
	sun_light.shadow_bias = 0.02
	sun_light.shadow_normal_bias = 1.05
	sun_light.shadow_blur = 1.15

	if fill_light == null:
		fill_light = DirectionalLight3D.new()
		fill_light.name = "WarmSkyFillLight3D"
		fill_light.shadow_enabled = false
		fill_light.light_energy = 0.26
		fill_light.rotation_degrees = Vector3(-36.0, -142.0, 0.0)
		add_child(fill_light)

func _ensure_global_rain_particles() -> void:
	if rain_streaks_particles == null:
		rain_streaks_particles = GPUParticles3D.new()
		rain_streaks_particles.name = "WorldRainStreaksGPU"
		rain_streaks_particles.amount = 640
		rain_streaks_particles.lifetime = 0.65
		rain_streaks_particles.visibility_aabb = AABB(Vector3(-48.0, -4.0, -48.0), Vector3(96.0, 40.0, 96.0))
		rain_streaks_particles.emitting = false

		var p_mat := ParticleProcessMaterial.new()
		p_mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
		p_mat.emission_box_extents = Vector3(42.0, 18.0, 42.0)
		p_mat.direction = Vector3(0.08, -1.0, 0.05)
		p_mat.spread = 3.5
		p_mat.initial_velocity_min = 38.0
		p_mat.initial_velocity_max = 52.0
		p_mat.gravity = Vector3(0.0, -18.0, 0.0)
		rain_streaks_particles.process_material = p_mat

		var streak_mesh := RibbonTrailMesh.new()
		streak_mesh.size = 0.022
		streak_mesh.section_length = 0.35
		rain_streaks_particles.draw_pass_1 = streak_mesh
		add_child(rain_streaks_particles)

# ------------------------------------------------------------------------------
# 2. FIXED-PER-RACE WEATHER ROLL & SESSION CONFIGURATION (1:1 WITH weather.js)
# ------------------------------------------------------------------------------
func roll_regime_for_race(mode: String, weather_preset: String, track_def: Dictionary = {}) -> String:
	var force_night: bool = bool(track_def.get("forceNight", false))
	if force_night:
		if weather_preset == "LIGHT_DRIZZLE" or weather_preset == "MONSOON_STORM":
			return weather_preset
		if weather_preset == "RANDOM":
			return "NEON_NIGHT" if randf() < 0.80 else "LIGHT_DRIZZLE"
		return "NEON_NIGHT"

	if mode == "1982_ORIGINAL":
		if WEATHER_REGIMES.has(weather_preset):
			return weather_preset
		return "HOT_SUNNY" if randf() < 0.68 else "GOLDEN_SUNSET"

	if weather_preset == "" or weather_preset == "RANDOM" or weather_preset == "DYNAMIC":
		var roll: float = randf()
		if roll < 0.34:
			return "HOT_SUNNY"
		elif roll < 0.56:
			return "GOLDEN_SUNSET"
		elif roll < 0.74:
			return "OVERCAST_COOL"
		elif roll < 0.90:
			return "LIGHT_DRIZZLE"
		else:
			return "MONSOON_STORM"

	return weather_preset if WEATHER_REGIMES.has(weather_preset) else "HOT_SUNNY"

func configure_for_session(mode: String, regime_or_preset: String, track_def: Dictionary = {}) -> String:
	_lightning_flash = 0.0
	var chosen_id: String = regime_or_preset
	if not WEATHER_REGIMES.has(chosen_id):
		chosen_id = roll_regime_for_race(mode, regime_or_preset, track_def)

	current_regime_id = chosen_id
	var reg: Dictionary = WEATHER_REGIMES.get(current_regime_id, WEATHER_REGIMES["HOT_SUNNY"])
	var force_night_sky: bool = bool(track_def.get("forceNight", false))
	var sky_reg: Dictionary = WEATHER_REGIMES["NEON_NIGHT"] if force_night_sky else reg

	if mode == "1982_ORIGINAL":
		groove_moisture = 0.0
		offline_moisture = 0.0
	else:
		var base_m: float = float(reg["moisture"])
		groove_moisture = snappedf(base_m * 0.82, 0.001) if base_m > 0.05 else base_m
		offline_moisture = base_m

	ambient_temp = float(reg["ambient_temp_c"])
	track_temp = float(reg["track_temp_c"])
	active_theme = String(track_def.get("theme", "FUJI"))
	is_night_active = (String(sky_reg["id"]) == "NEON_NIGHT")

	# High-contrast Directional Sun + 45%-lower Ambient Fill & 75%-lower Fog Density
	_base_sun_energy = float(sky_reg["sun_energy"]) * 1.48
	sun_light.light_color = sky_reg["sun_color"]
	sun_light.light_energy = _base_sun_energy
	sun_light.rotation_degrees = Vector3(
		-float(sky_reg["sun_elevation_deg"]),
		float(sky_reg["sun_azimuth_deg"]),
		0.0
	)

	# Configure WorldEnvironment Sky & Fog
	if world_environment and world_environment.environment:
		var env: Environment = world_environment.environment
		env.fog_light_color = sky_reg["sky_horizon_color"]
		env.fog_density = minf(0.00024, float(sky_reg["fog_density"]) * 0.25)
		env.ambient_light_color = sky_reg["sky_horizon_color"]
		env.ambient_light_energy = 0.50 if is_night_active else 0.58

	# Toggle global rain particles
	var rain_rate: float = float(reg["rain_rate"])
	if rain_streaks_particles:
		rain_streaks_particles.emitting = (rain_rate > 0.05)
		rain_streaks_particles.amount_ratio = clampf(rain_rate, 0.0, 1.0)

	# Push Global Shader Parameters to asphalt_wet_pbr.gdshader, foliage_wind_and_crowd_vat.gdshader & windshield_rain.gdshader
	_sync_global_shader_parameters(float(reg["wind_speed"]))
	weather_configured.emit(current_regime_id, groove_moisture, offline_moisture)
	return current_regime_id

func _sync_global_shader_parameters(wind_spd: float) -> void:
	RenderingServer.global_shader_parameter_set("global_wetness", offline_moisture)
	RenderingServer.global_shader_parameter_set("groove_wetness", groove_moisture)
	RenderingServer.global_shader_parameter_set("wind_direction", _wind_vector.normalized())
	RenderingServer.global_shader_parameter_set("wind_speed", wind_spd)

func get_ideal_lateral_offset(curvature: float) -> float:
	if absf(curvature) < 0.05:
		return -1.2
	return signf(curvature) * 4.8

func get_moisture_at(curvature: float, lateral_offset: float) -> float:
	var ideal: float = get_ideal_lateral_offset(curvature)
	var dist_from_groove: float = absf(lateral_offset - ideal)
	var off_blend: float = clampf((dist_from_groove - 1.6) / 3.2, 0.0, 1.0)
	return lerpf(groove_moisture, offline_moisture, off_blend)

func get_forecast_summary() -> Dictionary:
	var reg: Dictionary = WEATHER_REGIMES.get(current_regime_id, WEATHER_REGIMES["HOT_SUNNY"])
	return {
		"current": reg,
		"next": reg,
		"transitionProgress": 0.0,
		"grooveMoisture": groove_moisture,
		"offLineMoisture": offline_moisture,
		"ambientTemp": ambient_temp,
		"trackTemp": track_temp,
		"isFixedPerRace": true
	}

# ------------------------------------------------------------------------------
# 3. PER-CAR VFX RIG REGISTRATION & TELEMETRY-DRIVEN PARTICLE UPDATES
#    - Multi-Stage Wet Rooster-Tail Spray (Rear Tire Wake Jets + Central Plume)
#    - High-Speed (>250 km/h) Rear-Wingtip Aero Condensation Vortex Contrails
#    - Titanium Underfloor Skid-Block Sparks (Kerbs & >285 km/h Aero Compression)
#    - Off-Track Gravel Kick-Up & Heavy-Braking Lock-Up Tire Smoke Puffs
# ------------------------------------------------------------------------------
func register_car_vfx_rig(car_id: StringName, car_root: Node3D) -> Dictionary:
	var rig_node := Node3D.new()
	rig_node.name = "TelemetryVFXRig"
	car_root.add_child(rig_node)

	var rooster_spray := _create_emitter("WetRoosterSprayGPU", 96, 0.55, Vector3(0.0, 0.38, 1.95), Vector3(0.0, 0.35, 1.0), 14.0, 24.0)
	var gravel_kickup := _create_emitter("GravelKickUpGPU", 48, 0.48, Vector3(0.0, 0.16, 1.45), Vector3(0.0, 0.55, 1.0), 8.0, 15.0)
	var tire_smoke := _create_emitter("LockupTireSmokeGPU", 64, 0.62, Vector3(0.0, 0.18, -1.35), Vector3(0.0, 0.25, 1.0), 6.0, 12.0)
	var skid_sparks := _create_emitter("TitaniumSkidSparksGPU", 56, 0.28, Vector3(0.0, 0.06, 1.25), Vector3(0.0, 0.18, 1.0), 18.0, 32.0)
	var wingtip_vortex_l := _create_emitter("WingtipVortexLeftGPU", 40, 0.22, Vector3(-0.535, 0.895, 2.13), Vector3(0.0, 0.0, 1.0), 22.0, 30.0)
	var wingtip_vortex_r := _create_emitter("WingtipVortexRightGPU", 40, 0.22, Vector3(0.535, 0.895, 2.13), Vector3(0.0, 0.0, 1.0), 22.0, 30.0)

	rig_node.add_child(rooster_spray)
	rig_node.add_child(gravel_kickup)
	rig_node.add_child(tire_smoke)
	rig_node.add_child(skid_sparks)
	rig_node.add_child(wingtip_vortex_l)
	rig_node.add_child(wingtip_vortex_r)

	var bundle := {
		"root": rig_node,
		"rooster_spray": rooster_spray,
		"gravel_kickup": gravel_kickup,
		"tire_smoke": tire_smoke,
		"skid_sparks": skid_sparks,
		"wingtip_vortex_l": wingtip_vortex_l,
		"wingtip_vortex_r": wingtip_vortex_r
	}
	_car_vfx_rigs[car_id] = bundle
	return bundle

func _create_emitter(
	node_name: String,
	particle_count: int,
	life_sec: float,
	local_pos: Vector3,
	emit_dir: Vector3,
	vel_min: float,
	vel_max: float
) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.name = node_name
	p.position = local_pos
	p.amount = particle_count
	p.lifetime = life_sec
	p.emitting = false
	p.visibility_aabb = AABB(Vector3(-12.0, -2.0, -4.0), Vector3(24.0, 12.0, 28.0))

	var mat := ParticleProcessMaterial.new()
	mat.direction = emit_dir.normalized()
	mat.spread = 16.0
	mat.initial_velocity_min = vel_min
	mat.initial_velocity_max = vel_max
	mat.gravity = Vector3(0.0, -6.5, 0.0)
	p.process_material = mat

	var quad := QuadMesh.new()
	quad.size = Vector2(0.32, 0.32)
	p.draw_pass_1 = quad
	return p

func update_car_telemetry_vfx(car_id: StringName, telemetry: Dictionary) -> void:
	if not _car_vfx_rigs.has(car_id):
		return
	var bundle: Dictionary = _car_vfx_rigs[car_id]
	var speed_kmh: float = float(telemetry.get("speed_kmh", 0.0))
	var moisture_w: float = float(telemetry.get("moisture", offline_moisture))
	var skid_intensity: float = float(telemetry.get("skid_intensity", 0.0))
	var on_curb: bool = bool(telemetry.get("on_curb", false))
	var on_offtrack: bool = bool(telemetry.get("on_grass", false)) or bool(telemetry.get("on_gravel", false))
	var in_slipstream: bool = bool(telemetry.get("in_slipstream", false)) or bool(telemetry.get("drs_active", false))

	# 1. Multi-Stage Wet Rooster-Tail Spray (W > 0.12 and speed > 58 km/h)
	var spray: GPUParticles3D = bundle["rooster_spray"]
	var show_spray: bool = (moisture_w > 0.12 and speed_kmh > 58.0)
	spray.emitting = show_spray
	if show_spray:
		spray.amount_ratio = clampf(((speed_kmh - 58.0) / 195.0) * (0.42 + moisture_w * 0.92), 0.15, 1.0)

	# 2. High-Speed (>250 km/h) Rear-Wingtip Aero Condensation Vortex Contrails
	var show_vortex: bool = (speed_kmh > 250.0)
	var vortex_ratio: float = clampf(((speed_kmh - 250.0) / 65.0) * (1.0 + moisture_w * 0.85 + (0.45 if in_slipstream else 0.0)), 0.1, 1.0)
	var vl: GPUParticles3D = bundle["wingtip_vortex_l"]
	var vr: GPUParticles3D = bundle["wingtip_vortex_r"]
	vl.emitting = show_vortex
	vr.emitting = show_vortex
	if show_vortex:
		vl.amount_ratio = vortex_ratio
		vr.amount_ratio = vortex_ratio

	# 3. Titanium Underfloor Skid-Block Sparks (Kerbs >110 km/h or Aero Bottoming >285 km/h)
	var sparks: GPUParticles3D = bundle["skid_sparks"]
	var show_sparks: bool = (on_curb and speed_kmh > 110.0) or (speed_kmh > 285.0)
	sparks.emitting = show_sparks
	if show_sparks:
		sparks.amount_ratio = 0.95 if on_curb else clampf((speed_kmh - 280.0) / 40.0, 0.35, 1.0)

	# 4. Off-Track Gravel / Turf Kick-Up
	var gravel: GPUParticles3D = bundle["gravel_kickup"]
	gravel.emitting = (on_offtrack and speed_kmh > 35.0)

	# 5. Heavy-Braking Lock-Up & Cornering Slip Tire Smoke Puffs
	var smoke: GPUParticles3D = bundle["tire_smoke"]
	var show_smoke: bool = (skid_intensity > 0.32 and moisture_w < 0.25 and speed_kmh > 45.0)
	smoke.emitting = show_smoke
	if show_smoke:
		smoke.amount_ratio = clampf((skid_intensity - 0.30) * 1.45, 0.2, 1.0)

# ------------------------------------------------------------------------------
# 4. FRAME UPDATE — CAMERA RAIN TRACKING, MONSOON LIGHTNING & CROWD EXCITEMENT
# ------------------------------------------------------------------------------
func update_weather_and_vfx(
	dt: float,
	camera_pos: Vector3,
	focus_target_pos: Vector3,
	player_speed_kmh: float = 0.0,
	player_yaw_rate: float = 0.0,
	is_main_straight_blast: bool = false
) -> void:
	if rain_streaks_particles and rain_streaks_particles.emitting:
		rain_streaks_particles.global_position = focus_target_pos + Vector3(0.0, 14.0, 0.0)

	# Update Cockpit Visor Rain Shader uniforms & Tear-Off sweep if bound
	if _visor_wipe_active:
		_visor_wipe_progress += dt * 2.5
		if _visor_wipe_progress >= 1.0:
			_visor_wipe_progress = 0.0
			_visor_wipe_active = false
	if windshield_rain_material:
		windshield_rain_material.set_shader_parameter("car_speed_kmh", player_speed_kmh)
		windshield_rain_material.set_shader_parameter("yaw_rate_rad", player_yaw_rate)
		if _visor_wipe_active:
			windshield_rain_material.set_shader_parameter("visor_wipe_progress", _visor_wipe_progress)

	# Dynamic Grandstand Crowd Excitement & Camera Flash Cascade on Main Straight
	var excite: float = 1.35 if is_main_straight_blast else 0.75
	var flash_rate: float = 2.8 if is_main_straight_blast else 0.85
	RenderingServer.global_shader_parameter_set("crowd_excitement", excite)
	RenderingServer.global_shader_parameter_set("camera_flash_rate", flash_rate)

	# Monsoon Storm Sheet-Lightning Flash & Thunder Signal
	if current_regime_id == "MONSOON_STORM":
		_lightning_cooldown -= dt
		if _lightning_cooldown <= 0.0:
			_lightning_flash = 1.0
			_lightning_cooldown = randf_range(6.5, 13.5)
			thunder_clapped.emit(randf_range(0.75, 1.0))

	if _lightning_flash > 0.001:
		_lightning_flash = maxf(0.0, _lightning_flash - dt * 3.8)
		if sun_light:
			sun_light.light_energy = _base_sun_energy + _lightning_flash * 2.8
	elif sun_light:
		sun_light.light_energy = _base_sun_energy

func trigger_visor_tear_off() -> void:
	_visor_wipe_progress = 0.01
	_visor_wipe_active = true
	if windshield_rain_material:
		windshield_rain_material.set_shader_parameter("visor_wipe_progress", _visor_wipe_progress)
