# =============================================================================
# RACE PHANATIC F1 — POLE POSITION 2026: AAA MOBILE RACING UPGRADE (GODOT 4.x)
# MultiMeshInstance3D Blender .GLB Biome Trees, 300/200/100/50m Signs, Living
# Mexican-Wave Crowds, 3D Flag Wavers, Motorsport Smoke Flares, Confetti & Marshals
# Owner: @tracks (@Blender_Environment_Modeler)
# =============================================================================
class_name MultiMeshEnvironmentScatter
extends Node3D

@export_enum("FUJI_1982", "MONACO_HARBOR", "VEGAS_NEON", "MONZA_TEMPLE", "SUZUKA_130R", "SILVERSTONE_GP")
var circuit_id: String = "FUJI_1982"

@export var road_half_width: float = 8.4
@export var curb_width: float = 1.25
@export var deciduous_tree_count: int = 280
@export var pine_tree_count: int = 190
@export var palm_tree_count: int = 150
@export var grandstand_spectator_count: int = 1080
@export var flag_waver_count: int = 54
@export var confetti_count: int = 220

@export var wind_speed: float = 3.6
@export var wind_direction_xz: Vector2 = Vector2(0.85, 0.52)

const GLB_TREES_PATH := "res://assets/models/env_trees_biome.glb"
const GLB_SIGNS_PATH := "res://assets/models/env_signs_gantries_billboards.glb"
const GLB_BARRIERS_PATH := "res://assets/models/env_barriers_fencing.glb"
const GLB_CROWDS_PATH := "res://assets/models/env_grandstands_crowds.glb"

var _deciduous_mm: MultiMeshInstance3D
var _pine_mm: MultiMeshInstance3D
var _palm_mm: MultiMeshInstance3D
var _grandstand_mm: MultiMeshInstance3D
var _spectator_mm: MultiMeshInstance3D
var _flag_waver_mm: MultiMeshInstance3D
var _marshal_mm: MultiMeshInstance3D
var _brake_board_mm: MultiMeshInstance3D
var _billboard_mm: MultiMeshInstance3D
var _tire_wall_mm: MultiMeshInstance3D
var _smoke_flare_mm: MultiMeshInstance3D
var _confetti_mm: MultiMeshInstance3D

var _elapsed_sec: float = 0.0
var _player_world_pos: Vector3 = Vector3.ZERO
var _player_speed_kmh: float = 0.0
var crowd_excitement: float = 0.24
var _checkered_flag_active: bool = false
var _yellow_flag_active: bool = false

var _flare_sources: Array[Vector3] = []
var _confetti_seeds: Array[Dictionary] = []
var _marshal_anchors: Array[Transform3D] = []

const TEAM_CROWD_PALETTE: Array[Color] = [
	Color(0.90, 0.11, 0.15, 1.0), # Scuderia Tifosi Red
	Color(1.00, 0.43, 0.00, 1.0), # McLaren Papaya Orange
	Color(0.00, 0.85, 0.96, 1.0), # Petronas / Gulf Cyan
	Color(1.00, 0.84, 0.00, 1.0), # Championship Gold
	Color(0.96, 0.98, 1.00, 1.0), # Classic Motorsport White
	Color(0.00, 0.88, 0.46, 1.0), # Aston / Hybrid Emerald
	Color(1.00, 0.08, 0.58, 1.0), # Vegas Neon Magenta
]

const FLARE_SMOKE_PALETTE: Array[Color] = [
	Color(1.00, 0.43, 0.00, 0.55), # Papaya Flare Plume
	Color(1.00, 0.09, 0.26, 0.55), # Tifosi Red Flare Plume
	Color(0.00, 0.90, 1.00, 0.55), # Electric Cyan Flare Plume
	Color(1.00, 0.84, 0.00, 0.55), # Gold Flare Plume
]

const BRAKING_ZONE_STATIONS_M: Array[float] = [688.0, 1742.0, 2626.0, 3774.0]
const PUFFS_PER_FLARE: int = 14


func _ready() -> void:
	_setup_multimesh_nodes()
	rebuild_circuit_scatter(circuit_id)


func _process(delta: float) -> void:
	_elapsed_sec += delta
	if crowd_excitement > 0.24:
		crowd_excitement = maxf(0.24, crowd_excitement - delta * 0.36)
	_update_crowd_and_wind_uniforms(_elapsed_sec)
	_animate_smoke_flares_confetti_and_marshals(_elapsed_sec)


func trigger_crowd_excitement(boost: float = 1.0) -> void:
	crowd_excitement = clampf(crowd_excitement + maxf(0.15, boost), 0.24, 2.2)


func set_checkered_flag(active: bool = false) -> void:
	_checkered_flag_active = active
	if active:
		trigger_crowd_excitement(1.5)


func set_marshal_flag_state(yellow_active: bool, vsc_active: bool = false) -> void:
	_yellow_flag_active = yellow_active or vsc_active


func set_player_telemetry(world_pos: Vector3, speed_kmh: float) -> void:
	_player_world_pos = world_pos
	_player_speed_kmh = speed_kmh
	if speed_kmh > 295.0 and absf(world_pos.z) < 42.0:
		crowd_excitement = maxf(crowd_excitement, 0.88)


func rebuild_circuit_scatter(next_circuit_id: String) -> void:
	circuit_id = next_circuit_id
	_populate_biome_trees()
	_populate_braking_boards_and_billboards()
	_populate_tire_walls()
	_populate_grandstands_crowds_flares_and_marshals()


# -----------------------------------------------------------------------------
# 1. BLENDER 5.3 .GLB MESH EXTRACTOR + MULTIMESH LAYER INITIALIZATION
# -----------------------------------------------------------------------------
func _load_glb_mesh_or_fallback(glb_path: String, target_node_name: String, fallback_mesh: Mesh) -> Mesh:
	if ResourceLoader.exists(glb_path):
		var packed := load(glb_path) as PackedScene
		if packed:
			var root := packed.instantiate()
			if root:
				var found := _find_mesh_recursive(root, target_node_name)
				root.free()
				if found:
					return found
	return fallback_mesh


func _find_mesh_recursive(node: Node, target_name: String) -> Mesh:
	if node is MeshInstance3D and (node.name == target_name or node.name.begins_with(target_name)):
		if node.mesh:
			return node.mesh
	for child in node.get_children():
		var res := _find_mesh_recursive(child, target_name)
		if res:
			return res
	return null


func _setup_multimesh_nodes() -> void:
	_deciduous_mm = _create_multimesh_layer(
		"DeciduousTrees_MM",
		_load_glb_mesh_or_fallback(GLB_TREES_PATH, "Tree_Deciduous_LOD0", _build_deciduous_proxy_mesh())
	)
	_pine_mm = _create_multimesh_layer(
		"PineTrees_MM",
		_load_glb_mesh_or_fallback(GLB_TREES_PATH, "Tree_Pine_LOD0", _build_pine_proxy_mesh())
	)
	_palm_mm = _create_multimesh_layer(
		"PalmTrees_MM",
		_load_glb_mesh_or_fallback(GLB_TREES_PATH, "Tree_Palm_LOD0", _build_palm_proxy_mesh())
	)
	_grandstand_mm = _create_multimesh_layer(
		"GrandstandTribunes_MM",
		_load_glb_mesh_or_fallback(GLB_CROWDS_PATH, "Grandstand_Tribune", _build_grandstand_proxy_mesh())
	)
	_spectator_mm = _create_multimesh_layer(
		"GrandstandSpectators_MM",
		_load_glb_mesh_or_fallback(GLB_CROWDS_PATH, "Spectator_Cheering", _build_spectator_proxy_mesh())
	)
	_flag_waver_mm = _create_multimesh_layer(
		"SupporterFlagWavers_MM",
		_load_glb_mesh_or_fallback(GLB_CROWDS_PATH, "Spectator_FlagWaver", _build_flag_waver_proxy_mesh())
	)
	_marshal_mm = _create_multimesh_layer(
		"TracksideMarshals_MM",
		_load_glb_mesh_or_fallback(GLB_CROWDS_PATH, "Marshal_FlagWaver", _build_flag_waver_proxy_mesh())
	)
	_brake_board_mm = _create_multimesh_layer(
		"BrakingBoards_MM",
		_load_glb_mesh_or_fallback(GLB_SIGNS_PATH, "BrakeBoard_300m", _build_brake_board_proxy_mesh())
	)
	_billboard_mm = _create_multimesh_layer(
		"SponsorBillboards_MM",
		_load_glb_mesh_or_fallback(GLB_SIGNS_PATH, "Sponsor_Billboard_Rig", _build_billboard_proxy_mesh())
	)
	_tire_wall_mm = _create_multimesh_layer(
		"TireBarriers_MM",
		_load_glb_mesh_or_fallback(GLB_BARRIERS_PATH, "Barrier_TireWall", _build_tire_wall_proxy_mesh())
	)
	_smoke_flare_mm = _create_multimesh_layer("SmokeFlarePlumes_MM", _build_smoke_puff_mesh(), false)
	_confetti_mm = _create_multimesh_layer("StadiumConfetti_MM", _build_confetti_card_mesh(), false)


func _create_multimesh_layer(node_name: String, mesh_res: Mesh, cast_shd: bool = true) -> MultiMeshInstance3D:
	var existing := get_node_or_null(node_name) as MultiMeshInstance3D
	if existing:
		if existing.multimesh and existing.multimesh.mesh == null:
			existing.multimesh.mesh = mesh_res
		return existing
	var mmi := MultiMeshInstance3D.new()
	mmi.name = node_name
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.use_custom_data = true
	mm.mesh = mesh_res
	mmi.multimesh = mm
	mmi.cast_shadow = (
		GeometryInstance3D.SHADOW_CASTING_SETTING_ON if cast_shd
		else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	)
	add_child(mmi)
	return mmi


# -----------------------------------------------------------------------------
# 2. BIOME FOLIAGE + MAIN STRAIGHT SHOWROOM SCENIC VISTA GROVES
# -----------------------------------------------------------------------------
func _populate_biome_trees() -> void:
	var is_coastal_or_vegas := (circuit_id == "MONACO_HARBOR" or circuit_id == "VEGAS_NEON")
	var dec_total := 0 if is_coastal_or_vegas else deciduous_tree_count
	var pine_total := 0 if is_coastal_or_vegas else pine_tree_count
	var palm_total := palm_tree_count if is_coastal_or_vegas else 0

	_deciduous_mm.multimesh.instance_count = dec_total
	_pine_mm.multimesh.instance_count = pine_total
	_palm_mm.multimesh.instance_count = palm_total

	for i in range(dec_total):
		var xform := (
			_sample_main_straight_vista_transform(i, 64) if i < 64
			else _sample_roadside_transform(i, dec_total, 22.0, 88.0, 91)
		)
		_deciduous_mm.multimesh.set_instance_transform(i, xform)
		_deciduous_mm.multimesh.set_instance_color(i, _pick_foliage_tint(i))
		_deciduous_mm.multimesh.set_instance_custom_data(
			i, Color(float(i % 17) / 17.0, wind_speed, wind_direction_xz.x, wind_direction_xz.y)
		)

	for i in range(pine_total):
		var xform := (
			_sample_main_straight_vista_transform(i + 64, 48) if i < 48
			else _sample_roadside_transform(i, pine_total, 26.0, 96.0, 211)
		)
		_pine_mm.multimesh.set_instance_transform(i, xform)
		_pine_mm.multimesh.set_instance_color(i, Color(0.14, 0.40, 0.22, 1.0))
		_pine_mm.multimesh.set_instance_custom_data(
			i, Color(float(i % 19) / 19.0, wind_speed, wind_direction_xz.x, wind_direction_xz.y)
		)

	for i in range(palm_total):
		var xform := (
			_sample_main_straight_vista_transform(i, 44) if i < 44
			else _sample_roadside_transform(i, palm_total, 18.5, 54.0, 307)
		)
		_palm_mm.multimesh.set_instance_transform(i, xform)
		_palm_mm.multimesh.set_instance_color(i, Color(0.16, 0.54, 0.29, 1.0))
		_palm_mm.multimesh.set_instance_custom_data(
			i, Color(float(i % 13) / 13.0, wind_speed * 1.15, wind_direction_xz.x, wind_direction_xz.y)
		)


func _sample_main_straight_vista_transform(idx: int, total: int) -> Transform3D:
	var h1 := _fast_hash(idx, 1, 512)
	var h2 := _fast_hash(idx, 2, 512)
	var side := -1.0 if (idx % 2 == 0) else 1.0
	var x_pos := -180.0 + (float(idx % maxi(1, total)) / float(maxi(1, total))) * 790.0 + (h1 - 0.5) * 12.0
	var z_pos := side * (road_half_width + 44.0 + h2 * 46.0)
	var sc := 1.08 + h2 * 0.56
	var basis := Basis.from_euler(Vector3(0.0, h1 * TAU, 0.0)).scaled(Vector3.ONE * sc)
	return Transform3D(basis, Vector3(x_pos, 0.0, z_pos))


func _pick_foliage_tint(idx: int) -> Color:
	if circuit_id == "FUJI_1982":
		var sakura := [
			Color(1.0, 0.62, 0.78, 1.0),
			Color(1.0, 0.72, 0.84, 1.0),
			Color(0.15, 0.42, 0.24, 1.0),
		]
		return sakura[idx % sakura.size()]
	elif circuit_id == "MONZA_TEMPLE" or circuit_id == "SUZUKA_130R":
		var autumn := [
			Color(0.86, 0.15, 0.15, 1.0),
			Color(0.92, 0.35, 0.05, 1.0),
			Color(0.92, 0.70, 0.03, 1.0),
			Color(0.14, 0.39, 0.20, 1.0),
		]
		return autumn[idx % autumn.size()]
	return Color(0.15, 0.45, 0.22, 1.0)


func _sample_roadside_transform(idx: int, total: int, min_off: float, max_off: float, seed_val: int) -> Transform3D:
	var angle := (TAU * float(idx)) / maxf(1.0, float(total))
	var h1 := _fast_hash(idx, 1, seed_val)
	var h2 := _fast_hash(idx, 2, seed_val)
	var h3 := _fast_hash(idx, 3, seed_val)

	var side := -1.0 if (idx % 2 == 0) else 1.0
	var lat_dist := road_half_width + curb_width + min_off + h1 * (max_off - min_off)
	var radius_x := 460.0 + side * lat_dist
	var radius_z := 320.0 + side * lat_dist

	var pos := Vector3(
		180.0 + cos(angle) * radius_x,
		0.0,
		-220.0 + sin(angle) * radius_z
	)
	var scale_s := 0.88 + h2 * 0.58
	var basis := Basis.from_euler(Vector3(0.0, h3 * TAU, 0.0)).scaled(Vector3.ONE * scale_s)
	return Transform3D(basis, pos)


# -----------------------------------------------------------------------------
# 3. 3D FIA 300m / 200m / 100m / 50m BRAKING BOARDS & SPONSOR BILLBOARDS
# -----------------------------------------------------------------------------
func _populate_braking_boards_and_billboards() -> void:
	var distances := [300.0, 200.0, 100.0, 50.0]
	var total_boards := BRAKING_ZONE_STATIONS_M.size() * distances.size()
	_brake_board_mm.multimesh.instance_count = total_boards

	var write_idx := 0
	for z_idx in range(BRAKING_ZONE_STATIONS_M.size()):
		var entry_m := BRAKING_ZONE_STATIONS_M[z_idx]
		for m_idx in range(distances.size()):
			var dist_m: float = distances[m_idx]
			var station_u := fposmod((entry_m - dist_m) / 4250.0, 1.0)
			var ang := station_u * TAU
			var pos := Vector3(
				180.0 + cos(ang) * (460.0 + road_half_width + 3.45),
				0.0,
				-220.0 + sin(ang) * (320.0 + road_half_width + 3.45)
			)
			var yaw := -ang + PI * 0.5 + 0.15
			var basis := Basis.from_euler(Vector3(0.0, yaw, 0.0))
			_brake_board_mm.multimesh.set_instance_transform(write_idx, Transform3D(basis, pos))

			var bar_col := Color(1.0, 0.84, 0.0, 1.0) if m_idx <= 1 else (
				Color(0.0, 0.94, 1.0, 1.0) if m_idx == 2 else Color(1.0, 0.18, 0.32, 1.0)
			)
			_brake_board_mm.multimesh.set_instance_color(write_idx, bar_col)
			_brake_board_mm.multimesh.set_instance_custom_data(write_idx, Color(dist_m / 300.0, 1.0, 0.0, 0.0))
			write_idx += 1

	var bb_total := 24
	_billboard_mm.multimesh.instance_count = bb_total
	for i in range(bb_total):
		var ang := (TAU * float(i)) / float(bb_total)
		var side := -1.0 if (i % 2 == 0) else 1.0
		var pos := Vector3(
			180.0 + cos(ang) * (460.0 + side * (road_half_width + 7.55)),
			0.0,
			-220.0 + sin(ang) * (320.0 + side * (road_half_width + 7.55))
		)
		var basis := Basis.from_euler(Vector3(0.0, -ang + PI * 0.5, 0.0))
		_billboard_mm.multimesh.set_instance_transform(i, Transform3D(basis, pos))
		_billboard_mm.multimesh.set_instance_color(i, TEAM_CROWD_PALETTE[i % TEAM_CROWD_PALETTE.size()])


func _populate_tire_walls() -> void:
	var stacks := 48
	_tire_wall_mm.multimesh.instance_count = stacks
	for i in range(stacks):
		var zone_base: float = BRAKING_ZONE_STATIONS_M[i % BRAKING_ZONE_STATIONS_M.size()]
		var station_u := fposmod((zone_base + float(i % 12) * 3.8) / 4250.0, 1.0)
		var ang := station_u * TAU
		var pos := Vector3(
			180.0 + cos(ang) * (460.0 + road_half_width + 4.85),
			0.0,
			-220.0 + sin(ang) * (320.0 + road_half_width + 4.85)
		)
		var basis := Basis.from_euler(Vector3(0.0, -ang, 0.0))
		_tire_wall_mm.multimesh.set_instance_transform(i, Transform3D(basis, pos))
		_tire_wall_mm.multimesh.set_instance_color(
			i, Color(0.90, 0.12, 0.16, 1.0) if (i % 2 == 0) else Color(0.96, 0.97, 0.99, 1.0)
		)


# -----------------------------------------------------------------------------
# 4. GRANDSTANDS, MEXICAN-WAVE CROWDS, 3D FLAG WAVERS, SMOKE FLARES, CONFETTI & MARSHALS
# -----------------------------------------------------------------------------
func _populate_grandstands_crowds_flares_and_marshals() -> void:
	var stand_centers := [Vector3(-82.0, 0.0, -31.4), Vector3(172.0, 0.0, -31.4), Vector3(426.0, 0.0, -31.4)]

	# 1. Modular 28m Blender .GLB Grandstand Tribunes (6 modules per 168m-192m Main Straight block)
	var modules_per_stand := 6
	_grandstand_mm.multimesh.instance_count = stand_centers.size() * modules_per_stand
	var gs_idx := 0
	for s_idx in range(stand_centers.size()):
		var origin: Vector3 = stand_centers[s_idx]
		for m in range(modules_per_stand):
			var mx := origin.x - 80.0 + (float(m) + 0.5) * 26.8
			var basis := Basis.IDENTITY
			_grandstand_mm.multimesh.set_instance_transform(gs_idx, Transform3D(basis, Vector3(mx, 0.0, origin.z)))
			_grandstand_mm.multimesh.set_instance_color(gs_idx, Color(0.92, 0.95, 1.0, 1.0))
			gs_idx += 1

	# 2. Cheering 3D Spectators (Main Straight Tribunes + VIP Paddock Rooftop Terrace!)
	_spectator_mm.multimesh.instance_count = grandstand_spectator_count
	var vip_count := 120
	var main_crowd_count := maxi(0, grandstand_spectator_count - vip_count)
	var per_stand := maxi(1, int(main_crowd_count / stand_centers.size()))
	var cols := 36
	var rows := maxi(1, int(per_stand / cols))

	var idx := 0
	for s_idx in range(stand_centers.size()):
		var origin: Vector3 = stand_centers[s_idx]
		for r in range(rows):
			var seat_y := 3.96 + float(r) * 1.24
			var seat_z := origin.z + (6.55 - float(r) * 1.65)
			for c in range(cols):
				if idx >= main_crowd_count:
					break
				var seat_x := origin.x - 84.0 + (float(c) / float(maxi(1, cols - 1))) * 168.0
				var pos := Vector3(seat_x, seat_y, seat_z)
				var basis := Basis.IDENTITY
				_spectator_mm.multimesh.set_instance_transform(idx, Transform3D(basis, pos))
				var jersey := TEAM_CROWD_PALETTE[(c * 5 + r * 3 + s_idx) % TEAM_CROWD_PALETTE.size()]
				_spectator_mm.multimesh.set_instance_color(idx, jersey)
				var wave_phase := seat_x * 0.055
				var flash_seed := _fast_hash(c, r, s_idx * 41 + 19)
				_spectator_mm.multimesh.set_instance_custom_data(
					idx, Color(wave_phase, flash_seed, float(s_idx), 1.0)
				)
				idx += 1

	# VIP Paddock Club Rooftop Crowd overlooking Pit Lane & Showroom Grid!
	while idx < grandstand_spectator_count:
		var v_i := idx - main_crowd_count
		var h1 := _fast_hash(v_i, 1, 887)
		var h2 := _fast_hash(v_i, 2, 887)
		var vx := -85.0 + (float(v_i) / float(maxi(1, vip_count))) * 300.0
		var vz := 18.8 + h2 * 3.6
		var basis := Basis.from_euler(Vector3(0.0, PI + (h1 - 0.5) * 0.35, 0.0))
		_spectator_mm.multimesh.set_instance_transform(idx, Transform3D(basis, Vector3(vx, 10.52, vz)))
		_spectator_mm.multimesh.set_instance_color(idx, TEAM_CROWD_PALETTE[v_i % TEAM_CROWD_PALETTE.size()])
		_spectator_mm.multimesh.set_instance_custom_data(idx, Color(vx * 0.055, h1, 3.0, 1.0))
		idx += 1

	# 3. 3D Flag-Waving Supporters
	_flag_waver_mm.multimesh.instance_count = flag_waver_count
	for f_i in range(flag_waver_count):
		var s_idx := f_i % stand_centers.size()
		var origin: Vector3 = stand_centers[s_idx]
		var r_slot := (f_i * 3) % 7
		var fx := origin.x - 78.0 + (float(f_i) / float(maxi(1, flag_waver_count - 1))) * 156.0
		var fy := 3.96 + float(r_slot) * 1.24
		var fz := origin.z + (6.55 - float(r_slot) * 1.65) + 0.18
		_flag_waver_mm.multimesh.set_instance_transform(f_i, Transform3D(Basis.IDENTITY, Vector3(fx, fy, fz)))
		_flag_waver_mm.multimesh.set_instance_color(f_i, TEAM_CROWD_PALETTE[f_i % TEAM_CROWD_PALETTE.size()])
		_flag_waver_mm.multimesh.set_instance_custom_data(f_i, Color(float(f_i) * 0.45, 1.0, 0.0, 1.0))

	# 4. Motorsport Smoke Flare Plumes (6 Ultra Flare Sections x 14 Rising Puffs)
	_flare_sources.clear()
	for s_idx in range(stand_centers.size()):
		var origin: Vector3 = stand_centers[s_idx]
		_flare_sources.append(Vector3(origin.x - 36.0, 6.8, origin.z + 3.2))
		_flare_sources.append(Vector3(origin.x + 38.0, 8.6, origin.z + 1.4))
	_smoke_flare_mm.multimesh.instance_count = _flare_sources.size() * PUFFS_PER_FLARE
	for s_i in range(_flare_sources.size()):
		var p_col := FLARE_SMOKE_PALETTE[s_i % FLARE_SMOKE_PALETTE.size()]
		for p in range(PUFFS_PER_FLARE):
			_smoke_flare_mm.multimesh.set_instance_color(s_i * PUFFS_PER_FLARE + p, p_col)

	# 5. Celebratory Confetti Seeds above Start/Finish & Paddock Terrace
	_confetti_seeds.clear()
	_confetti_mm.multimesh.instance_count = confetti_count
	for c_i in range(confetti_count):
		var h1 := _fast_hash(c_i, 1, 941)
		var h2 := _fast_hash(c_i, 2, 941)
		var h3 := _fast_hash(c_i, 3, 941)
		var on_paddock := (c_i % 3 == 0)
		_confetti_seeds.append({
			"base_x": -110.0 + h1 * 280.0,
			"base_y": 14.5 if on_paddock else 16.2,
			"base_z": (17.5 + h2 * 5.0) if on_paddock else -(road_half_width + 15.5 + h2 * 10.0),
			"phase": h3,
			"drift": (h1 - 0.5) * 4.5,
			"spin": 2.5 + h2 * 5.5,
		})
		_confetti_mm.multimesh.set_instance_color(c_i, TEAM_CROWD_PALETTE[c_i % TEAM_CROWD_PALETTE.size()])

	# 6. Articulated 3D Trackside Flag Marshals (Start/Finish Rostrum + 4 Sector Posts)
	_marshal_anchors.clear()
	_marshal_anchors.append(Transform3D(Basis.IDENTITY, Vector3(6.5, 1.55, -(road_half_width + 4.85))))
	for m_i in range(4):
		var ang := (TAU * float(m_i)) / 4.0 + 0.42
		var m_pos := Vector3(
			180.0 + cos(ang) * (460.0 + road_half_width + 6.9),
			0.0,
			-220.0 + sin(ang) * (320.0 + road_half_width + 6.9)
		)
		_marshal_anchors.append(Transform3D(Basis.from_euler(Vector3(0.0, -ang + PI, 0.0)), m_pos))
	_marshal_mm.multimesh.instance_count = _marshal_anchors.size()
	for m_idx in range(_marshal_anchors.size()):
		_marshal_mm.multimesh.set_instance_transform(m_idx, _marshal_anchors[m_idx])
		_marshal_mm.multimesh.set_instance_color(m_idx, Color(0.0, 0.90, 0.46, 1.0))


func _animate_smoke_flares_confetti_and_marshals(t: float) -> void:
	# Animate rising motorsport smoke flare plumes
	if _smoke_flare_mm and _smoke_flare_mm.multimesh:
		var idx := 0
		for s_i in range(_flare_sources.size()):
			var src: Vector3 = _flare_sources[s_i]
			for p in range(PUFFS_PER_FLARE):
				var age := fposmod(t * (0.30 + crowd_excitement * 0.12) + float(p) / float(PUFFS_PER_FLARE) + float(s_i) * 0.19, 1.0)
				var lift_y := 1.35 + age * (10.5 + crowd_excitement * 3.5)
				var drift_x := age * age * 6.8 + sin(t * 1.9 + float(p + s_i)) * (0.45 + age * 0.9)
				var drift_z := cos(t * 1.5 + float(p) * 0.7) * (0.35 + age * 0.8)
				var sc := maxf(0.08, (1.15 + age * 4.8) * (1.0 - age * 0.55))
				var basis := Basis.from_euler(Vector3(0.0, t * 0.65 + float(p) * 0.8, 0.0)).scaled(Vector3.ONE * sc)
				_smoke_flare_mm.multimesh.set_instance_transform(
					idx, Transform3D(basis, src + Vector3(drift_x, lift_y, drift_z))
				)
				idx += 1

	# Animate tumbling celebratory confetti
	if _confetti_mm and _confetti_mm.multimesh:
		var c_scale := 0.75 + minf(1.2, crowd_excitement * 0.55)
		for c_i in range(_confetti_seeds.size()):
			var cs: Dictionary = _confetti_seeds[c_i]
			var fall := fposmod(t * (0.24 + crowd_excitement * 0.12) + float(cs["phase"]), 1.0)
			var spin_spd := float(cs["spin"])
			var pos := Vector3(
				float(cs["base_x"]) + sin(t * 2.1 + float(cs["phase"]) * 12.0) * 1.35 + fall * float(cs["drift"]),
				float(cs["base_y"]) - fall * 13.8,
				float(cs["base_z"]) + cos(t * 1.8 + float(cs["phase"]) * 9.0) * 0.95
			)
			var basis := Basis.from_euler(Vector3(t * spin_spd, t * spin_spd * 0.8, t * 2.2)).scaled(Vector3.ONE * c_scale)
			_confetti_mm.multimesh.set_instance_transform(c_i, Transform3D(basis, pos))

	# Animate waving 3D Trackside Flag Marshals (Green / Caution Yellow / Checkered)
	if _marshal_mm and _marshal_mm.multimesh:
		var rate := 9.2 if (_yellow_flag_active or _checkered_flag_active) else 4.2
		var amp := 0.34 if (_yellow_flag_active or _checkered_flag_active) else 0.15
		for m_i in range(_marshal_anchors.size()):
			var anchor: Transform3D = _marshal_anchors[m_i]
			var sway := Basis.from_euler(Vector3(0.0, sin(t * rate + float(m_i) * 1.3) * amp, 0.0))
			_marshal_mm.multimesh.set_instance_transform(m_i, Transform3D(anchor.basis * sway, anchor.origin))
			var flag_col := Color(0.0, 0.90, 0.46, 1.0)
			if _checkered_flag_active and m_i == 0:
				flag_col = Color(1.0, 1.0, 1.0, 1.0)
			elif _yellow_flag_active:
				flag_col = Color(1.0, 0.90, 0.0, 1.0)
			_marshal_mm.multimesh.set_instance_color(m_i, flag_col)


func _update_crowd_and_wind_uniforms(t: float) -> void:
	var straight_proximity := clampf(1.0 - absf(_player_world_pos.z) / 90.0, 0.0, 1.0)
	var cheer_val := clampf(0.45 + straight_proximity * 0.55 + crowd_excitement * 0.65, 0.3, 2.5)
	for mmi in [_spectator_mm, _flag_waver_mm, _deciduous_mm, _pine_mm, _palm_mm]:
		if not mmi:
			continue
		var mat := mmi.material_override as ShaderMaterial
		if mat:
			mat.set_shader_parameter("u_time", t)
			mat.set_shader_parameter("u_cheer_excitation", cheer_val)
			mat.set_shader_parameter("u_wind_speed", wind_speed)


func _fast_hash(x: int, y: int, seed_val: int) -> float:
	var n := (x * 374761393 + y * 668265263 + seed_val * 1442695041) & 0x7fffffff
	n = (n ^ (n >> 13)) * 1274126177
	return float((n ^ (n >> 16)) & 0x7fffffff) / 2147483647.0


# -----------------------------------------------------------------------------
# 5. PROCEDURAL FALLBACK MESHES (AUTOMATICALLY OVERRIDDEN BY BLENDER 5.3 .GLBS)
# -----------------------------------------------------------------------------
func _build_deciduous_proxy_mesh() -> Mesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var cyl := CylinderMesh.new()
	cyl.top_radius = 2.4
	cyl.bottom_radius = 2.8
	cyl.height = 6.8
	st.append_from(cyl, 0, Transform3D(Basis.IDENTITY, Vector3(0.0, 4.8, 0.0)))
	return st.commit()


func _build_pine_proxy_mesh() -> Mesh:
	var cone := CylinderMesh.new()
	cone.top_radius = 0.1
	cone.bottom_radius = 3.2
	cone.height = 10.5
	return cone


func _build_palm_proxy_mesh() -> Mesh:
	var cyl := CylinderMesh.new()
	cyl.top_radius = 3.6
	cyl.bottom_radius = 0.35
	cyl.height = 9.8
	return cyl


func _build_grandstand_proxy_mesh() -> Mesh:
	var box := BoxMesh.new()
	box.size = Vector3(28.0, 16.5, 19.5)
	return box


func _build_spectator_proxy_mesh() -> Mesh:
	var box := BoxMesh.new()
	box.size = Vector3(0.54, 1.52, 0.34)
	return box


func _build_flag_waver_proxy_mesh() -> Mesh:
	var box := BoxMesh.new()
	box.size = Vector3(1.85, 2.85, 0.36)
	return box


func _build_brake_board_proxy_mesh() -> Mesh:
	var box := BoxMesh.new()
	box.size = Vector3(2.18, 1.54, 0.22)
	return box


func _build_billboard_proxy_mesh() -> Mesh:
	var box := BoxMesh.new()
	box.size = Vector3(7.64, 2.68, 0.32)
	return box


func _build_tire_wall_proxy_mesh() -> Mesh:
	var box := BoxMesh.new()
	box.size = Vector3(3.60, 1.05, 1.45)
	return box


func _build_smoke_puff_mesh() -> Mesh:
	var sph := SphereMesh.new()
	sph.radius = 0.65
	sph.height = 1.15
	sph.radial_segments = 10
	sph.rings = 6
	return sph


func _build_confetti_card_mesh() -> Mesh:
	var quad := QuadMesh.new()
	quad.size = Vector2(0.28, 0.15)
	return quad
