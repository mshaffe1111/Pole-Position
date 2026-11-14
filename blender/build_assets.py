"""
Blender 5.x Procedural 3D Asset Generator for:
RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX

Generates and exports:
  - assets/models/f1_car.glb       (+ blender/f1_car.blend)
  - assets/models/f1_wheel.glb     (+ blender/f1_wheel.blend)
  - assets/models/pit_crew.glb     (+ blender/pit_crew.blend)
  - assets/models/mount_fuji.glb   (+ blender/mount_fuji.blend)

Run via:
  blender.exe --background --python blender/build_assets.py
"""

import bpy
import bmesh
from mathutils import Matrix
import traceback
import math
import os

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_MODELS = os.path.join(ROOT_DIR, "assets", "models")
OUT_BLEND = os.path.join(ROOT_DIR, "blender")
os.makedirs(OUT_MODELS, exist_ok=True)
os.makedirs(OUT_BLEND, exist_ok=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, color, metallic=0.2, roughness=0.35, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emission is not None and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (emission[0], emission[1], emission[2], 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def create_mesh_object(name, bm, mat=None, shade_smooth=True):
    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if mat:
        obj.data.materials.append(mat)
    if shade_smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def add_box(bm, cx, cy, cz, sx, sy, sz):
    ret = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=ret["verts"])
    bmesh.ops.translate(bm, vec=(cx, cy, cz), verts=ret["verts"])
    return ret["verts"]


def build_f1_chassis():
    """
    Builds the Formula 1 chassis (without wheels, which are exported separately
    so Three.js/Godot can steer & spin all 4 corners with zero pivot drift).
    Blender coords: -Y is Nose/Forward, +Y is Rear, +Z is Up, +X is Right.
    When exported with export_yup=True to glTF:
      -Z is Forward, +Y is Up, +X is Right.
    """
    reset_scene()

    mat_primary = make_mat("Livery_Primary", (0.86, 0.08, 0.12), metallic=0.55, roughness=0.24)
    mat_accent = make_mat("Livery_Accent", (0.96, 0.96, 0.98), metallic=0.35, roughness=0.28)
    mat_carbon = make_mat("Carbon_Fiber", (0.07, 0.075, 0.085), metallic=0.25, roughness=0.42)
    mat_metal = make_mat("Titanium_Exhaust", (0.55, 0.52, 0.48), metallic=0.90, roughness=0.25)
    mat_helmet = make_mat("Driver_Helmet_Mat", (0.98, 0.80, 0.05), metallic=0.4, roughness=0.2)
    mat_visor = make_mat("Driver_Visor_Mat", (0.03, 0.05, 0.10), metallic=0.9, roughness=0.08)
    mat_rainlight = make_mat("Rain_Light_Mat", (1.0, 0.05, 0.02), metallic=0.1, roughness=0.2,
                             emission=(1.0, 0.08, 0.02), emission_strength=3.5)

    # 1. Sculpted Monocoque, Nosecone & Tapered Engine Cover (Body_Main)
    bm = bmesh.new()
    # Profile stations from nose (-2.35) to rear gearbox (+1.85): (y, half_w_bot, half_w_top, z_bot, z_top)
    stations = [
        (-2.38, 0.09, 0.07, 0.13, 0.21),
        (-1.95, 0.16, 0.13, 0.14, 0.29),
        (-1.40, 0.25, 0.21, 0.13, 0.42),
        (-0.85, 0.34, 0.27, 0.11, 0.52),
        (-0.30, 0.38, 0.29, 0.10, 0.55),
        ( 0.25, 0.36, 0.24, 0.10, 0.76),  # Airbox intake peak
        ( 0.85, 0.28, 0.14, 0.11, 0.64),
        ( 1.45, 0.18, 0.07, 0.13, 0.44),
        ( 1.92, 0.10, 0.04, 0.16, 0.32),
    ]
    rings = []
    for (y, hwb, hwt, zb, zt) in stations:
        zm = 0.5 * (zb + zt)
        hwm = max(hwb, hwt) * 1.08
        pts = [
            (-hwb, y, zb),
            ( hwb, y, zb),
            ( hwm, y, zm),
            ( hwt, y, zt),
            (-hwt, y, zt),
            (-hwm, y, zm),
        ]
        ring = [bm.verts.new(p) for p in pts]
        rings.append(ring)

    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]
        n = len(r0)
        for j in range(n):
            jn = (j + 1) % n
            bm.faces.new([r0[j], r0[jn], r1[jn], r1[j]])
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])

    # Sculpted Left & Right Aero Sidepods integrated into Body_Main
    for side in (-1.0, 1.0):
        sp_stations = [
            (-0.62, 0.30, 0.72, 0.11, 0.47),
            (-0.35, 0.32, 0.78, 0.10, 0.49),
            ( 0.20, 0.30, 0.74, 0.10, 0.45),
            ( 0.85, 0.24, 0.56, 0.11, 0.36),
            ( 1.38, 0.16, 0.32, 0.13, 0.28),
        ]
        sp_rings = []
        for (y, x_in, x_out, zb, zt) in sp_stations:
            pts = [
                (side * x_in, y, zb),
                (side * x_out, y, zb + 0.02),
                (side * x_out, y, zt - 0.04),
                (side * x_in, y, zt),
            ]
            if side < 0:
                pts = list(reversed(pts))
            sp_rings.append([bm.verts.new(p) for p in pts])
        for i in range(len(sp_rings) - 1):
            r0, r1 = sp_rings[i], sp_rings[i + 1]
            for j in range(4):
                jn = (j + 1) % 4
                bm.faces.new([r0[j], r0[jn], r1[jn], r1[j]])
        bm.faces.new(list(reversed(sp_rings[0])))
        bm.faces.new(sp_rings[-1])

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    create_mesh_object("Body_Main", bm, mat_primary, shade_smooth=True)

    # 2. Livery Accent Stripes & Sharkfin (Body_Accent)
    bm_acc = bmesh.new()
    add_box(bm_acc, 0.0, -1.35, 0.38, 0.16, 1.55, 0.15)  # Nose racing stripe
    add_box(bm_acc, 0.0, 0.95, 0.63, 0.035, 1.15, 0.24)  # Aero Sharkfin
    for side in (-1.0, 1.0):
        add_box(bm_acc, side * 0.64, 0.05, 0.46, 0.22, 0.95, 0.04)  # Sidepod accent flash
    bmesh.ops.recalc_face_normals(bm_acc, faces=bm_acc.faces)
    create_mesh_object("Body_Accent", bm_acc, mat_accent, shade_smooth=False)

    # 3. Carbon Floor, Undertray Diffuser, Cockpit Recess, Halo & Mirrors (Carbon_Chassis)
    bm_carb = bmesh.new()
    add_box(bm_carb, 0.0, 0.10, 0.075, 1.56, 3.15, 0.045)  # Ground-effect Venturi floor
    add_box(bm_carb, 0.0, 1.78, 0.13, 1.15, 0.55, 0.14)    # Rear diffuser tunnels
    add_box(bm_carb, 0.0, -0.32, 0.51, 0.44, 0.78, 0.12)   # Cockpit dark tub opening
    add_box(bm_carb, 0.0, 0.24, 0.73, 0.18, 0.14, 0.14)    # Airbox intake scoop mouth
    # Halo titanium hoop
    add_box(bm_carb, 0.0, -0.66, 0.58, 0.045, 0.08, 0.15)  # Center halo pillar
    for side in (-1.0, 1.0):
        add_box(bm_carb, side * 0.19, -0.34, 0.64, 0.04, 0.68, 0.04)  # Halo side bars
        add_box(bm_carb, side * 0.46, -0.52, 0.54, 0.14, 0.09, 0.06)  # Wing mirrors
    bmesh.ops.recalc_face_normals(bm_carb, faces=bm_carb.faces)
    create_mesh_object("Carbon_Chassis", bm_carb, mat_carbon, shade_smooth=False)

    # 4. Double-Wishbone Suspension Arms (Suspension_Arms)
    bm_susp = bmesh.new()
    for side in (-1.0, 1.0):
        # Front upper & lower wishbones (y = -1.48)
        for z_arm in (0.20, 0.34):
            add_box(bm_susp, side * 0.52, -1.48, z_arm, 0.68, 0.045, 0.025)
            add_box(bm_susp, side * 0.52, -1.36, z_arm, 0.66, 0.04, 0.025)
        # Rear upper & lower wishbones (y = +1.42)
        for z_arm in (0.21, 0.36):
            add_box(bm_susp, side * 0.52, 1.42, z_arm, 0.68, 0.05, 0.028)
            add_box(bm_susp, side * 0.52, 1.28, z_arm, 0.66, 0.045, 0.028)
    bmesh.ops.recalc_face_normals(bm_susp, faces=bm_susp.faces)
    create_mesh_object("Suspension_Arms", bm_susp, mat_carbon, shade_smooth=False)

    # 5. Driver Helmet & Visor
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=0.145, location=(0.0, -0.26, 0.61))
    helm = bpy.context.active_object
    helm.name = "Driver_Helmet"
    helm.scale = (0.92, 1.08, 0.96)
    helm.data.materials.append(mat_helmet)
    for p in helm.data.polygons:
        p.use_smooth = True

    bm_vis = bmesh.new()
    add_box(bm_vis, 0.0, -0.37, 0.62, 0.22, 0.10, 0.075)
    bmesh.ops.recalc_face_normals(bm_vis, faces=bm_vis.faces)
    create_mesh_object("Driver_Visor", bm_vis, mat_visor, shade_smooth=True)

    # 6. Multi-Element Front Wing (Separate Center + Left/Right Endplates for Damage Detachment!)
    bm_fwc = bmesh.new()
    add_box(bm_fwc, 0.0, -2.28, 0.09, 1.76, 0.30, 0.032)   # Mainplane
    add_box(bm_fwc, 0.0, -2.16, 0.135, 1.72, 0.20, 0.026)  # Upper flap
    for side in (-1.0, 1.0):
        add_box(bm_fwc, side * 0.11, -2.18, 0.14, 0.03, 0.18, 0.10)  # Swan-neck pylons
    bmesh.ops.recalc_face_normals(bm_fwc, faces=bm_fwc.faces)
    create_mesh_object("Front_Wing_Main", bm_fwc, mat_accent, shade_smooth=False)

    for side, label in ((-1.0, "L"), (1.0, "R")):
        bm_fwe = bmesh.new()
        add_box(bm_fwe, side * 0.90, -2.22, 0.16, 0.035, 0.44, 0.22)
        add_box(bm_fwe, side * 0.93, -2.22, 0.07, 0.07, 0.42, 0.025)
        bmesh.ops.recalc_face_normals(bm_fwe, faces=bm_fwe.faces)
        create_mesh_object(f"Front_Wing_Endplate_{label}", bm_fwe, mat_primary, shade_smooth=False)

    # 7. Dual-Plane Rear Wing & Endplates (Damageable)
    bm_rwm = bmesh.new()
    add_box(bm_rwm, 0.0, 1.92, 0.72, 1.04, 0.28, 0.035)   # Lower mainplane
    add_box(bm_rwm, 0.0, 2.02, 0.84, 1.04, 0.18, 0.030)   # Upper DRS flap
    add_box(bm_rwm, 0.0, 1.84, 0.50, 0.05, 0.20, 0.44)    # Center swan-neck pillar
    bmesh.ops.recalc_face_normals(bm_rwm, faces=bm_rwm.faces)
    create_mesh_object("Rear_Wing_Main", bm_rwm, mat_accent, shade_smooth=False)

    for side, label in ((-1.0, "L"), (1.0, "R")):
        bm_rwe = bmesh.new()
        add_box(bm_rwe, side * 0.53, 1.95, 0.68, 0.035, 0.42, 0.42)
        bmesh.ops.recalc_face_normals(bm_rwe, faces=bm_rwe.faces)
        create_mesh_object(f"Rear_Wing_Endplate_{label}", bm_rwe, mat_primary, shade_smooth=False)

    # 8. Exhaust Pipe & FIA Rear Rain Light
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.055, depth=0.28,
                                        location=(0.0, 1.98, 0.34), rotation=(math.pi / 2, 0.0, 0.0))
    exh = bpy.context.active_object
    exh.name = "Exhaust_Pipe"
    exh.data.materials.append(mat_metal)

    bm_rl = bmesh.new()
    add_box(bm_rl, 0.0, 2.02, 0.21, 0.06, 0.04, 0.09)
    bmesh.ops.recalc_face_normals(bm_rl, faces=bm_rl.faces)
    create_mesh_object("Rear_Rain_Light", bm_rl, mat_rainlight, shade_smooth=False)

    blend_path = os.path.join(OUT_BLEND, "f1_car.blend")
    glb_path = os.path.join(OUT_MODELS, "f1_car.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB", export_yup=True, export_apply=True)
    print(f"[OK] Exported {glb_path}")


def build_f1_wheel():
    """
    Centered at (0,0,0), Axle along X axis, Radius = 0.34m, Width = 0.36m.
    Contains named parts:
      - Tire_Tread
      - Compound_Sidewall (recolored dynamically for SOFT/MEDIUM/HARD/INTER/WET!)
      - Wheel_Rim
      - Brake_Disc (glows fiery orange under heavy braking!)
    """
    reset_scene()

    mat_rubber = make_mat("Tire_Rubber_Mat", (0.09, 0.09, 0.10), metallic=0.08, roughness=0.72)
    mat_compound = make_mat("Compound_Stripe_Mat", (0.95, 0.12, 0.12), metallic=0.1, roughness=0.4,
                            emission=(0.95, 0.12, 0.12), emission_strength=0.35)
    mat_rim = make_mat("Wheel_Rim_Mat", (0.18, 0.19, 0.22), metallic=0.82, roughness=0.28)
    mat_disc = make_mat("Brake_Disc_Mat", (0.28, 0.26, 0.25), metallic=0.75, roughness=0.35,
                        emission=(1.0, 0.32, 0.02), emission_strength=0.0)

    # Tire cylinder along X axis
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=0.34, depth=0.35,
                                        location=(0.0, 0.0, 0.0), rotation=(0.0, math.pi / 2, 0.0))
    tire = bpy.context.active_object
    tire.name = "Tire_Tread"
    tire.data.materials.append(mat_rubber)
    for p in tire.data.polygons:
        p.use_smooth = True

    # Compound colored sidewall rings on both sides so left/right wheels both show compound stripe
    bm_ring = bmesh.new()
    segs = 28
    for side in (-1.0, 1.0):
        x = side * 0.178
        r_in, r_out = 0.225, 0.285
        v_in, v_out = [], []
        for i in range(segs):
            ang = (2.0 * math.pi * i) / segs
            cy, cz = math.cos(ang), math.sin(ang)
            v_in.append(bm_ring.verts.new((x, cy * r_in, cz * r_in)))
            v_out.append(bm_ring.verts.new((x, cy * r_out, cz * r_out)))
        for i in range(segs):
            inext = (i + 1) % segs
            if side > 0:
                bm_ring.faces.new([v_in[i], v_out[i], v_out[inext], v_in[inext]])
            else:
                bm_ring.faces.new([v_in[i], v_in[inext], v_out[inext], v_out[i]])
    bmesh.ops.recalc_face_normals(bm_ring, faces=bm_ring.faces)
    create_mesh_object("Compound_Sidewall", bm_ring, mat_compound, shade_smooth=False)

    # Rim + 5 spokes for clear rotation visibility at speed!
    bm_rim = bmesh.new()
    for i in range(5):
        ang = (2.0 * math.pi * i) / 5.0
        cy, cz = math.cos(ang), math.sin(ang)
        verts = add_box(bm_rim, 0.0, 0.0, 0.0, 0.365, 0.045, 0.38)
        bmesh.ops.rotate(bm_rim, cent=(0, 0, 0),
                         matrix=Matrix(((1, 0, 0), (0, cy, -cz), (0, cz, cy))),
                         verts=verts)
    add_box(bm_rim, 0.0, 0.0, 0.0, 0.38, 0.09, 0.09)  # Center lock nut
    bmesh.ops.recalc_face_normals(bm_rim, faces=bm_rim.faces)
    create_mesh_object("Wheel_Rim", bm_rim, mat_rim, shade_smooth=False)

    # Carbon-ceramic Brake Disc (glows bright orange under heavy braking)
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.185, depth=0.06,
                                        location=(0.0, 0.0, 0.0), rotation=(0.0, math.pi / 2, 0.0))
    disc = bpy.context.active_object
    disc.name = "Brake_Disc"
    disc.data.materials.append(mat_disc)

    blend_path = os.path.join(OUT_BLEND, "f1_wheel.blend")
    glb_path = os.path.join(OUT_MODELS, "f1_wheel.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB", export_yup=True, export_apply=True)
    print(f"[OK] Exported {glb_path}")


def build_pit_crew():
    """
    Builds a stylized 3D Pit Crew Mechanic with Helmet, Visor & Pneumatic Wheel Gun.
    Origin at feet (0,0,0), height ~1.78m, facing -Y (glTF -Z).
    """
    reset_scene()

    mat_suit = make_mat("Crew_Suit_Mat", (0.88, 0.12, 0.15), metallic=0.15, roughness=0.6)
    mat_dark = make_mat("Crew_Gear_Mat", (0.12, 0.13, 0.15), metallic=0.4, roughness=0.45)
    mat_helm = make_mat("Crew_Helmet_Mat", (0.95, 0.95, 0.97), metallic=0.35, roughness=0.22)

    bm_suit = bmesh.new()
    add_box(bm_suit, -0.11, 0.0, 0.42, 0.15, 0.17, 0.84)   # Left leg
    add_box(bm_suit,  0.11, 0.0, 0.42, 0.15, 0.17, 0.84)   # Right leg
    add_box(bm_suit,  0.0,  0.0, 1.12, 0.42, 0.24, 0.58)   # Torso
    add_box(bm_suit, -0.26, -0.18, 1.16, 0.12, 0.44, 0.12) # Left arm reaching forward
    add_box(bm_suit,  0.26, -0.18, 1.16, 0.12, 0.44, 0.12) # Right arm reaching forward
    bmesh.ops.recalc_face_normals(bm_suit, faces=bm_suit.faces)
    create_mesh_object("Crew_Suit", bm_suit, mat_suit, shade_smooth=False)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.15, location=(0.0, 0.0, 1.58))
    chelm = bpy.context.active_object
    chelm.name = "Crew_Helmet"
    chelm.data.materials.append(mat_helm)

    bm_gun = bmesh.new()
    add_box(bm_gun, 0.0, -0.42, 1.14, 0.10, 0.34, 0.12)    # Pneumatic wheel gun body
    add_box(bm_gun, 0.0, -0.62, 1.14, 0.06, 0.16, 0.06)    # Socket nozzle
    add_box(bm_gun, 0.0, -0.35, 1.56, 0.24, 0.08, 0.09)    # Visor
    bmesh.ops.recalc_face_normals(bm_gun, faces=bm_gun.faces)
    create_mesh_object("Crew_Equipment", bm_gun, mat_dark, shade_smooth=False)

    blend_path = os.path.join(OUT_BLEND, "pit_crew.blend")
    glb_path = os.path.join(OUT_MODELS, "pit_crew.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB", export_yup=True, export_apply=True)
    print(f"[OK] Exported {glb_path}")


def build_mount_fuji():
    """
    Builds a majestic 3D Mount Fuji stratovolcano mesh with ridged volcanic slopes
    and iconic jagged snow-cap line for the Fuji Speedway northern horizon.
    """
    reset_scene()

    mat_rock = make_mat("Fuji_Volcanic_Slope", (0.20, 0.25, 0.38), metallic=0.05, roughness=0.88)
    mat_snow = make_mat("Fuji_Snow_Summit", (0.95, 0.97, 1.00), metallic=0.05, roughness=0.45,
                        emission=(0.92, 0.95, 1.00), emission_strength=0.18)

    bm_rock = bmesh.new()
    bm_snow = bmesh.new()

    segs = 48
    rings_data = [
        (0.0,   1.00),
        (0.18,  0.68),
        (0.38,  0.44),
        (0.58,  0.27),
        (0.76,  0.16),
        (0.92,  0.095),
        (1.00,  0.065),
    ]
    base_radius = 420.0
    peak_height = 165.0

    def ring_pts(h_frac, r_frac, ridge_amp=1.0):
        pts = []
        for i in range(segs):
            ang = (2.0 * math.pi * i) / segs
            # Subtle natural volcanic radial flutes
            flute = 1.0 + ridge_amp * (0.045 * math.sin(ang * 7.0) + 0.025 * math.cos(ang * 13.0))
            r = base_radius * r_frac * flute
            z = peak_height * h_frac
            pts.append((math.cos(ang) * r, math.sin(ang) * r, z))
        return pts

    # Lower volcanic slopes (rings 0..4)
    rock_rings = []
    for idx in range(5):
        hf, rf = rings_data[idx]
        pts = ring_pts(hf, rf, ridge_amp=(1.0 if idx > 0 else 0.3))
        rock_rings.append([bm_rock.verts.new(p) for p in pts])
    for r_i in range(len(rock_rings) - 1):
        r0, r1 = rock_rings[r_i], rock_rings[r_i + 1]
        for i in range(segs):
            inext = (i + 1) % segs
            bm_rock.faces.new([r0[i], r0[inext], r1[inext], r1[i]])
    bmesh.ops.recalc_face_normals(bm_rock, faces=bm_rock.faces)
    create_mesh_object("Fuji_Rock_Base", bm_rock, mat_rock, shade_smooth=True)

    # Snow cap with iconic jagged snowline skirt (rings 3..6)
    snow_rings = []
    for idx in range(3, len(rings_data)):
        hf, rf = rings_data[idx]
        pts = []
        for i in range(segs):
            ang = (2.0 * math.pi * i) / segs
            jag = -0.055 * abs(math.sin(ang * 6.0 + 0.4)) if idx == 3 else 0.0
            hf_eff = hf + jag
            flute = 1.0 + 0.04 * math.sin(ang * 7.0)
            r = (base_radius * rf * 1.015) * flute
            z = peak_height * hf_eff + 0.3
            pts.append((math.cos(ang) * r, math.sin(ang) * r, z))
        snow_rings.append([bm_snow.verts.new(p) for p in pts])
    for r_i in range(len(snow_rings) - 1):
        r0, r1 = snow_rings[r_i], snow_rings[r_i + 1]
        for i in range(segs):
            inext = (i + 1) % segs
            bm_snow.faces.new([r0[i], r0[inext], r1[inext], r1[i]])
    bmesh.ops.recalc_face_normals(bm_snow, faces=bm_snow.faces)
    create_mesh_object("Fuji_Snow_Cap", bm_snow, mat_snow, shade_smooth=True)

    blend_path = os.path.join(OUT_BLEND, "mount_fuji.blend")
    glb_path = os.path.join(OUT_MODELS, "mount_fuji.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB", export_yup=True, export_apply=True)
    print(f"[OK] Exported {glb_path}")


if __name__ == "__main__":
    log_path = os.path.join(OUT_BLEND, "build.log")
    try:
        build_f1_chassis()
        build_f1_wheel()
        build_pit_crew()
        build_mount_fuji()
        with open(log_path, "w", encoding="utf-8") as f:
            f.write("ALL BLENDER 3D ASSETS BUILT SUCCESSFULLY!\n")
    except Exception:
        with open(log_path, "w", encoding="utf-8") as f:
            f.write(traceback.format_exc())
        raise
