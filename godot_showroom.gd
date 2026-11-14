extends Node3D

# Interactive Godot 4.7 3D Showroom for Race Phanatic F1 Blender GLB Assets
var turntable: Node3D

func _ready() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.06, 0.11, 0.20)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.75, 0.85, 1.0)
	env.ambient_light_energy = 0.85
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-48, 35, 0)
	sun.light_energy = 1.9
	add_child(sun)

	var cam := Camera3D.new()
	cam.position = Vector3(3.8, 2.1, 4.6)
	cam.look_at_from_position(cam.position, Vector3(0, 0.4, 0), Vector3.UP)
	add_child(cam)

	turntable = Node3D.new()
	add_child(turntable)

	var car_scene := load("res://assets/models/f1_car.glb") as PackedScene
	if car_scene:
		turntable.add_child(car_scene.instantiate())

	var wheel_scene := load("res://assets/models/f1_wheel.glb") as PackedScene
	if wheel_scene:
		var wheel_coords := [
			Vector3(-0.86, 0.34, -1.48),
			Vector3( 0.86, 0.34, -1.48),
			Vector3(-0.86, 0.34,  1.42),
			Vector3( 0.86, 0.34,  1.42),
		]
		for pos in wheel_coords:
			var w := wheel_scene.instantiate() as Node3D
			w.position = pos
			turntable.add_child(w)

	var crew_scene := load("res://assets/models/pit_crew.glb") as PackedScene
	if crew_scene:
		var crew := crew_scene.instantiate() as Node3D
		crew.position = Vector3(1.85, 0.0, -0.4)
		crew.rotation_degrees.y = -75
		turntable.add_child(crew)

func _process(delta: float) -> void:
	if turntable:
		turntable.rotate_y(delta * 0.45)
