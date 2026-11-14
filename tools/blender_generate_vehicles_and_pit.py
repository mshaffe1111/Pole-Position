"""
Headless Blender 5.x (`bpy`) A+ Studio Procedural Vehicle, Cockpit Interior & Pit Crew Rig Generator
RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX (WebGL2 + Godot 4.3 Dual Pipeline)

Run headlessly:
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" -b -P tools/blender_generate_vehicles_and_pit.py
  (or via Windows App Alias: blender-launcher.exe --background --python tools/blender_generate_vehicles_and_pit.py)

A+ Engineering, First-Person Cockpit & Godot 4.3 / Three.js Export Contract:
  1. Metric Scale: 1.0 Blender Unit = 1.0 Meter (`scale = 1, 1, 1` via `transform_apply`).
  2. Orientation: Authored in Blender -Y Forward (`+X` Car Left, `-X` Car Right, `+Z` Up), rotated
     180 deg around Z and baked via `bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)`
     so glTF/Godot 4 & Three.js receive strict `-Z` Forward (`Vector3.FORWARD`), `+Y` Up, `+X` Right.
  3. Standardized 2026 F1 Node Hierarchy (`f1_car_2026.glb`):
       - Body                               ([0.0, 0.0, 0.0] — 13-station monocoque, 8-louvre undercut sidepods,
                                             titanium floor-edge vortex strakes, 8-strake Venturi diffuser,
                                             overhead FOM T-Cam pod, titanium exhaust + wastegates, 15-LED rain light)
           - CockpitTub_Interior            ([0.0, 0.42, -0.35] — recessed carbon survival cell, FIA foam headrest,
                                             6-point Sabelt harness + anodized buckles, knee pads, inner carbon sills)
           - Halo_Titanium                  ([0.0, 0.68, -0.44] — Grade-5 titanium hoop, slim V-pillar for authentic
                                             Cockpit View framing, swept carbon/livery aero fairings & onboard cam)
           - WingMirror_L                   ([-0.54, 0.585, -0.50] — twin aero stalks, vortex shroud, chrome mirror glass)
           - WingMirror_R                   ([+0.54, 0.585, -0.50] — twin aero stalks, vortex shroud, chrome mirror glass)
           - FrontWing                      ([0.0, 0.10, -2.20] — 4-element gull-wing cascade + 3-slot louvred endplates)
           - RearWing                       ([0.0, 0.73, +1.92] — spoon mainplane, twin beam wing, multi-slot endplates)
               - RearWing_DRS               ([0.0, 0.84, +1.89] world / [0.0, 0.11, -0.03] local — hinged DRS upper flap)
           - SteeringWheel                  ([0.0, 0.54, -0.52] — carbon butterfly wheel, 15-LED RPM brow, 6 rotaries,
                                             OLED bezel, magnetic shift & clutch paddles)
               - DriverArms_Gloves          ([0.0, 0.54, -0.52] world / [0.0, 0.0, 0.0] local — Nomex racing sleeves +
                                             moulded carbon-knuckle gloves & thumbs gripping wheel, tracking rotation 1:1!)
           - CockpitDash                    ([0.0, 0.59, -0.56] — high-contrast OLED telemetry screen & LED shift bar)
           - DriverHelmet                   ([0.0, 0.625, -0.245] — aero carbon helmet, rear gurney spoiler & iridium visor)
       - Suspension_FL / FR / RL / RR       ([±0.22, 0.31, -1.48 / +1.42] — aero wishbones, pushrod & trackrod)
           - BrakeCaliper_FL / FR / RL / RR ([±0.86, 0.34, -1.48 / +1.42] world — sculpted carbon brake duct + intake scoop
                                             + drum shroud + 6-piston Brembo monobloc alloy caliper)
       - Wheel_FL / FR / RL / RR            ([±0.86, 0.34, -1.48 / +1.42] — 48-seg Pirelli slick, dual 3-arc stripes,
                                             wheel-wake aero cover, 10-spoke Y-split forged rim & anodized center-lock nut)
           - BrakeDisc_FL / FR / RL / RR    (co-axial radially slotted carbon-ceramic rotor + alloy bell for thermal glow)
       - CollisionHull-convcolonly          ([0.0, 0.0, 0.0] — 24-vertex ski-ramp convex hull for Jolt/GodotPhysics3D)
  4. Standardized 3D Pit Garage & Rigged Crew (`pit_crew_rig.glb`):
       - PitGarage_Bay
       - Overhead_Gantry_And_Hoses
       - Pressurized_Fuel_Rig
       - QuickLift_FrontJack                ([0.0, 0.0, -2.75] — tubular carbon-alloy cradle, rollers & long lever handle)
       - QuickLift_RearJack                 ([0.0, 0.0, +2.55] — rear diffuser quick-lift cradle, rollers & lever handle)
       - Pit_Lollipop_Sign                  ([0.0, 0.0, -3.55] — carbon pole + octagonal STOP / 1ST GEAR dual-face board)
       - Spare_Pirelli_Wheel_Set            ([2.35, 0.0, -1.55] — staged spare Pirelli slick tires + forged rims + rack)
       - PitCrew_Armature + PitCrew_Mechanic (13-bone skeleton + high-detail Paoli Hurricane wheel gun & 3 smooth NLA clips:
                                             `Pit_Idle_Ready`, `Pit_Tire_Swap`, `Pit_Jack_And_Refuel`)

Dual-Engine Exports:
  - assets/models/f1_car_2026.glb              &  godot_project/assets/models/f1_car_2026.glb
  - assets/models/pit_crew_rig.glb             &  godot_project/assets/models/pit_crew_rig.glb
  (Preserves all existing WebGL `.glb` assets in `assets/models/` 100% untouched!)
"""

import bpy
import bmesh
from mathutils import Matrix, Vector, Euler
import traceback
import shutil
import math
import os

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_MODELS_WEBGL = os.path.join(ROOT_DIR, "assets", "models")
OUT_MODELS_GODOT = os.path.join(ROOT_DIR, "godot_project", "assets", "models")
OUT_BLEND = os.path.join(ROOT_DIR, "blender")
os.makedirs(OUT_MODELS_WEBGL, exist_ok=True)
os.makedirs(OUT_MODELS_GODOT, exist_ok=True)
os.makedirs(OUT_BLEND, exist_ok=True)


# ==============================================================================
# 1. COLOR, PROCEDURAL CARBON NORMAL MAP & PRINCIPLED BSDF UTILITIES
# ==============================================================================

def _srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_lin(hex_str):
    h = hex_str.lstrip("#")
    return (
        _srgb_to_lin(int(h[0:2], 16) / 255.0),
        _srgb_to_lin(int(h[2:4], 16) / 255.0),
        _srgb_to_lin(int(h[4:6], 16) / 255.0),
    )


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def build_procedural_carbon_maps(size=256):
    """
    Generate packed 256x256 2x2 diagonal twill carbon-fiber Albedo & Tangent-Space Normal Map
    images in Blender memory so exported .glb carries crisp embedded carbon weave textures.
    """
    alb_img = bpy.data.images.new("CarbonTwill2x2_Albedo", width=size, height=size, alpha=False)
    nrm_img = bpy.data.images.new("CarbonTwill2x2_Normal", width=size, height=size, alpha=False)
    nrm_img.colorspace_settings.name = "Non-Color"

    alb_px = [0.0] * (size * size * 4)
    nrm_px = [0.0] * (size * size * 4)

    cell = 8
    half = cell // 2
    for y in range(size):
        for x in range(size):
            tx = x // half
            ty = y // half
            u_in = (x % half) / float(half)
            v_in = (y % half) / float(half)
            twill_warp = ((tx + ty) % 4) < 2

            if twill_warp:
                crest = math.sin(u_in * math.pi)
                nx = -math.cos(u_in * math.pi) * 0.42
                ny = 0.07
                lum = 0.020 + 0.048 * crest
            else:
                crest = math.sin(v_in * math.pi)
                nx = 0.07
                ny = -math.cos(v_in * math.pi) * 0.42
                lum = 0.011 + 0.034 * crest

            idx = (y * size + x) * 4
            alb_px[idx] = lum * 0.92
            alb_px[idx + 1] = lum * 0.96
            alb_px[idx + 2] = lum * 1.08
            alb_px[idx + 3] = 1.0

            nz = math.sqrt(max(0.05, 1.0 - nx * nx - ny * ny))
            nrm_px[idx] = 0.5 + 0.5 * nx
            nrm_px[idx + 1] = 0.5 + 0.5 * ny
            nrm_px[idx + 2] = 0.5 + 0.5 * nz
            nrm_px[idx + 3] = 1.0

    alb_img.pixels = alb_px
    nrm_img.pixels = nrm_px
    alb_img.pack()
    nrm_img.pack()
    return alb_img, nrm_img


def make_pbr_mat(
    name,
    color_lin,
    metallic=0.2,
    roughness=0.35,
    clearcoat=0.0,
    clearcoat_roughness=0.05,
    emission=None,
    emission_strength=0.0,
    albedo_img=None,
    normal_img=None,
    uv_tile=14.0,
):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if not bsdf:
        return mat

    bsdf.inputs["Base Color"].default_value = (color_lin[0], color_lin[1], color_lin[2], 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness

    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = clearcoat
        bsdf.inputs["Coat Roughness"].default_value = clearcoat_roughness
    elif "Clearcoat" in bsdf.inputs:
        bsdf.inputs["Clearcoat"].default_value = clearcoat
        bsdf.inputs["Clearcoat Roughness"].default_value = clearcoat_roughness

    if emission is not None and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (emission[0], emission[1], emission[2], 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength

    if albedo_img is not None or normal_img is not None:
        tex_coord = nt.nodes.new("ShaderNodeTexCoord")
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (uv_tile, uv_tile, uv_tile)
        nt.links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])

        if albedo_img is not None:
            tex_alb = nt.nodes.new("ShaderNodeTexImage")
            tex_alb.image = albedo_img
            nt.links.new(mapping.outputs["Vector"], tex_alb.inputs["Vector"])
            nt.links.new(tex_alb.outputs["Color"], bsdf.inputs["Base Color"])

        if normal_img is not None:
            tex_nrm = nt.nodes.new("ShaderNodeTexImage")
            tex_nrm.image = normal_img
            nrm_node = nt.nodes.new("ShaderNodeNormalMap")
            nrm_node.inputs["Strength"].default_value = 0.88
            nt.links.new(mapping.outputs["Vector"], tex_nrm.inputs["Vector"])
            nt.links.new(tex_nrm.outputs["Color"], nrm_node.inputs["Color"])
            nt.links.new(nrm_node.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


# ==============================================================================
# 2. MESH LOFTING, UV UNWRAPPING (4PX MARGIN) & TRANSFORM APPLICATION HELPERS
# ==============================================================================

def add_box(bm, cx, cy, cz, sx, sy, sz, rot_euler=None):
    ret = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=ret["verts"])
    if rot_euler is not None:
        rmat = Euler(rot_euler, "XYZ").to_matrix()
        bmesh.ops.rotate(bm, cent=(0.0, 0.0, 0.0), matrix=rmat, verts=ret["verts"])
    bmesh.ops.translate(bm, vec=(cx, cy, cz), verts=ret["verts"])
    return ret["verts"]


def add_loft(bm, rings_pts, closed_ring=True, cap_start=True, cap_end=True):
    rings = [[bm.verts.new(p) for p in pts] for pts in rings_pts]
    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]
        n = len(r0)
        limit = n if closed_ring else (n - 1)
        for j in range(limit):
            jn = (j + 1) % n
            bm.faces.new([r0[j], r0[jn], r1[jn], r1[j]])
    if closed_ring and len(rings[0]) >= 3:
        if cap_start:
            bm.faces.new(list(reversed(rings[0])))
        if cap_end:
            bm.faces.new(rings[-1])
    return rings


def add_swept_tube(bm, path_pts, radii_xy, segs=12, up_hint=(0.0, 0.0, 1.0), cap_ends=True):
    pts = [Vector(p) for p in path_pts]
    count = len(pts)
    if count < 2:
        return []
    r_list = [radii_xy] * count if isinstance(radii_xy[0], (int, float)) else list(radii_xy)

    tangents = []
    for i in range(count):
        t = (pts[1] - pts[0]) if i == 0 else ((pts[-1] - pts[-2]) if i == count - 1 else (pts[i + 1] - pts[i - 1]))
        tangents.append(t.normalized() if t.length > 1e-6 else Vector((0.0, 1.0, 0.0)))

    up = Vector(up_hint).normalized()
    if abs(tangents[0].dot(up)) > 0.94:
        up = Vector((1.0, 0.0, 0.0)) if abs(tangents[0].x) < 0.8 else Vector((0.0, 1.0, 0.0))

    nrm = (up - tangents[0] * tangents[0].dot(up)).normalized()
    normals = [nrm]
    for i in range(1, count):
        q = tangents[i - 1].rotation_difference(tangents[i])
        nrm = (q @ nrm).normalized()
        nrm = (nrm - tangents[i] * tangents[i].dot(nrm)).normalized()
        normals.append(nrm)

    rings_pts = []
    for i in range(count):
        p, t, n = pts[i], tangents[i], normals[i]
        b = t.cross(n).normalized()
        rx, ry = r_list[i]
        ring = []
        for s in range(segs):
            ang = (2.0 * math.pi * s) / segs
            v = p + n * (math.cos(ang) * rx) + b * (math.sin(ang) * ry)
            ring.append((v.x, v.y, v.z))
        rings_pts.append(ring)

    return add_loft(bm, rings_pts, closed_ring=True, cap_start=cap_ends, cap_end=cap_ends)


def add_strut(bm, p0, p1, rx, ry, segs=8, up_hint=(0.0, 0.0, 1.0)):
    return add_swept_tube(bm, [p0, p1], (rx, ry), segs=segs, up_hint=up_hint, cap_ends=True)


def add_airfoil(bm, span_stations):
    """
    10-vertex cambered motorsport airfoil profile across `span_stations`:
      (x, y_lead, y_trail, z_base, camber, thickness) in Blender -Y forward space.
    """
    u_prof = [
        (0.00,  0.00),
        (0.10,  0.42),
        (0.24,  0.58),
        (0.52,  0.50),
        (0.84,  0.24),
        (1.00,  0.04),
        (0.86, -0.10),
        (0.52, -0.30),
        (0.22, -0.36),
        (0.08, -0.22),
    ]
    rings = []
    for (x, yle, yte, z0, cam, thk) in span_stations:
        dy = yte - yle
        ring = []
        for (u, tz) in u_prof:
            y = yle + u * dy
            z = z0 + math.sin(u * math.pi) * cam + tz * thk
            ring.append((x, y, z))
        rings.append(ring)
    return add_loft(bm, rings, closed_ring=True, cap_start=True, cap_end=True)


def tag_faces_from(bm, face_mark, mat_idx):
    for f in list(bm.faces)[face_mark:]:
        f.material_index = mat_idx
    return len(bm.faces)


def unwrap_with_4px_padding(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    if "UV2" not in mesh.uv_layers:
        mesh.uv_layers.new(name="UV2")

    mesh.uv_layers.active = mesh.uv_layers["UVMap"]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.008, area_weight=0.0)
    mesh.uv_layers.active = mesh.uv_layers["UV2"]
    bpy.ops.uv.smart_project(angle_limit=math.radians(72.0), island_margin=0.012, area_weight=0.0)
    mesh.uv_layers.active = mesh.uv_layers["UVMap"]
    bpy.ops.object.mode_set(mode="OBJECT")


def finalize_godot_mesh(
    name,
    bm,
    materials,
    godot_pivot=(0.0, 0.0, 0.0),
    parent=None,
    parent_godot_pivot=(0.0, 0.0, 0.0),
    shade_smooth=True,
    subdiv_levels=0,
    smart_uv=True,
):
    """
    Authored in Blender -Y Forward (`+X` Car Left, `-X` Car Right, `+Z` Up).
    Rotating 180 deg around Z maps `(x_b, y_b, z_b)` -> `(-x_b, -y_b, z_b)`, which glTF `export_yup=True`
    exports to Godot/Three.js `(-x_b, z_b, +y_b)` = `(+X Right, +Y Up, -Z Nose Forward)`.
    """
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    if isinstance(materials, list):
        for m in materials:
            obj.data.materials.append(m)
    elif materials is not None:
        obj.data.materials.append(materials)

    if shade_smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    if subdiv_levels > 0:
        mod = obj.modifiers.new(name="Subsurf", type="SUBSURF")
        mod.levels = subdiv_levels
        mod.render_levels = subdiv_levels
        bpy.ops.object.modifier_apply(modifier=mod.name)

    obj.rotation_euler = (0.0, 0.0, math.pi)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    pivot_bl = Vector((godot_pivot[0], -godot_pivot[2], godot_pivot[1]))
    parent_bl = Vector((parent_godot_pivot[0], -parent_godot_pivot[2], parent_godot_pivot[1]))

    if pivot_bl.length > 1e-6:
        obj.data.transform(Matrix.Translation(-pivot_bl))
        obj.data.update()

    if smart_uv:
        unwrap_with_4px_padding(obj)

    if parent is not None:
        obj.parent = parent
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.location = pivot_bl - parent_bl
    else:
        obj.location = pivot_bl

    return obj


# ==============================================================================
# 3. BUILD A+ 2026 FORMULA 1 CAR & COCKPIT INTERIOR (`f1_car_2026.glb`)
# ==============================================================================

def build_pirelli_wheel_bmesh(bm, cx_bl, yb, wy_g, is_rear=False, out_sign=1.0):
    """
    Reusable A+ 48-segment 18-inch Pirelli P-Zero racing slick + razor-thin 11mm 3-arc sidewall stripes +
    dark carbon inner barrel & aero wheel-wake crescent + deep-dish 70mm concave 10-spoke Y-split forged
    gunmetal rim + anodized center-lock nut (ZERO flat silver pie-plate look!).
    Materials expected on `bm`: 0=Rubber, 1=CompoundStripe, 2=ForgedRim, 3=CenterLockNut, 4=CarbonBarrel.
    """
    half_w = 0.198 if is_rear else 0.168
    w_segs = 48
    prof = [
        (-half_w * 0.94, 0.196),
        (-half_w * 1.00, 0.238),
        (-half_w * 0.99, 0.296),
        (-half_w * 0.88, 0.334),
        (-half_w * 0.55, 0.344),
        ( 0.000,         0.347),
        ( half_w * 0.55, 0.344),
        ( half_w * 0.88, 0.334),
        ( half_w * 0.99, 0.296),
        ( half_w * 1.00, 0.238),
        ( half_w * 0.94, 0.196),
    ]
    f0 = len(bm.faces)
    t_rings = []
    for (dx, pr) in prof:
        ring = []
        for i in range(w_segs):
            a = (2.0 * math.pi * i) / w_segs
            ring.append((cx_bl + dx, yb + math.cos(a) * pr, wy_g + math.sin(a) * pr))
        t_rings.append(ring)
    add_loft(bm, t_rings, closed_ring=True, cap_start=False, cap_end=False)
    f_mark = tag_faces_from(bm, f0, 0)

    # Razor-thin 11mm (r = 0.248..0.259) Pirelli P-Zero 3-arc sidewall rings (inboard + outboard)
    for s_side in (-1.0, 1.0):
        xw = cx_bl + s_side * (half_w * 1.006)
        for arc_i in range(3):
            b_deg = arc_i * 120.0 + 14.0
            for step in range(12):
                a0 = math.radians(b_deg + step * 7.5)
                a1 = math.radians(b_deg + (step + 1) * 7.5)
                v0 = bm.verts.new((xw, yb + math.cos(a0) * 0.248, wy_g + math.sin(a0) * 0.248))
                v1 = bm.verts.new((xw, yb + math.cos(a0) * 0.259, wy_g + math.sin(a0) * 0.259))
                v2 = bm.verts.new((xw, yb + math.cos(a1) * 0.259, wy_g + math.sin(a1) * 0.259))
                v3 = bm.verts.new((xw, yb + math.cos(a1) * 0.248, wy_g + math.sin(a1) * 0.248))
                bm.faces.new([v0, v1, v2, v3] if s_side > 0 else [v0, v3, v2, v1])
    f_mark = tag_faces_from(bm, f_mark, 1)

    # Deep-dish concave 10-spoke Y-split forged gunmetal rim (outer lip + recessed central hub + 20 Y-spokes)
    lip_x_in = cx_bl + out_sign * (half_w * 0.84)
    lip_x_out = cx_bl + out_sign * (half_w * 0.96)
    lip_rings = []
    for (lx, lr) in ((lip_x_in, 0.188), (lip_x_out, 0.198), (lip_x_out, 0.186), (lip_x_in, 0.180)):
        ring = []
        for i in range(36):
            a = (2.0 * math.pi * i) / 36.0
            ring.append((lx, yb + math.cos(a) * lr, wy_g + math.sin(a) * lr))
        lip_rings.append(ring)
    add_loft(bm, lip_rings, closed_ring=True, cap_start=False, cap_end=False)

    add_strut(
        bm,
        (cx_bl + out_sign * (half_w * 0.38), yb, wy_g),
        (cx_bl + out_sign * (half_w * 0.62), yb, wy_g),
        0.064,
        0.064,
        segs=20,
    )
    for sp_i in range(10):
        base_ang = (2.0 * math.pi * sp_i) / 10.0
        for branch in (-0.125, 0.125):
            ang_tip = base_ang + branch
            cy0, cz0 = math.cos(base_ang), math.sin(base_ang)
            cy1, cz1 = math.cos(ang_tip), math.sin(ang_tip)
            add_swept_tube(
                bm,
                [
                    (cx_bl + out_sign * (half_w * 0.54), yb + cy0 * 0.058, wy_g + cz0 * 0.058),
                    (cx_bl + out_sign * (half_w * 0.74), yb + 0.5 * (cy0 + cy1) * 0.124, wy_g + 0.5 * (cz0 + cz1) * 0.124),
                    (cx_bl + out_sign * (half_w * 0.93), yb + cy1 * 0.190, wy_g + cz1 * 0.190),
                ],
                [(0.013, 0.016), (0.010, 0.014), (0.009, 0.013)],
                segs=6,
                up_hint=(0.0, -cz0, cy0),
            )
    f_mark = tag_faces_from(bm, f_mark, 2)

    # Center-lock anodized wheel nut & locking pawl cone
    add_strut(
        bm,
        (cx_bl + out_sign * (half_w * 0.52), yb, wy_g),
        (cx_bl + out_sign * (half_w * 0.92), yb, wy_g),
        0.040,
        0.040,
        segs=12,
    )
    f_mark = tag_faces_from(bm, f_mark, 3)

    # Dark recessed carbon inner barrel + sculpted 2026 carbon aero rim-cover ring (NO flat silver pie-plate!)
    barrel_rings = []
    for (bx, br) in ((cx_bl - half_w * 0.86, 0.180), (cx_bl + half_w * 0.84, 0.180), (cx_bl + half_w * 0.84, 0.174), (cx_bl - half_w * 0.86, 0.174)):
        ring = []
        for i in range(32):
            a = (2.0 * math.pi * i) / 32.0
            ring.append((bx, yb + math.cos(a) * br, wy_g + math.sin(a) * br))
        barrel_rings.append(ring)
    add_loft(bm, barrel_rings, closed_ring=True, cap_start=False, cap_end=False)

    aero_x = cx_bl + out_sign * (half_w * 0.89)
    for seg_i in range(24):
        a0 = (2.0 * math.pi * seg_i) / 24.0
        a1 = (2.0 * math.pi * (seg_i + 1)) / 24.0
        v0 = bm.verts.new((aero_x, yb + math.cos(a0) * 0.156, wy_g + math.sin(a0) * 0.156))
        v1 = bm.verts.new((aero_x, yb + math.cos(a0) * 0.184, wy_g + math.sin(a0) * 0.184))
        v2 = bm.verts.new((aero_x, yb + math.cos(a1) * 0.184, wy_g + math.sin(a1) * 0.184))
        v3 = bm.verts.new((aero_x, yb + math.cos(a1) * 0.156, wy_g + math.sin(a1) * 0.156))
        bm.faces.new([v0, v1, v2, v3] if out_sign > 0 else [v0, v3, v2, v1])
    tag_faces_from(bm, f_mark, 4)


def build_godot_f1_car_2026():
    reset_scene()
    alb_carbon, nrm_carbon = build_procedural_carbon_maps(size=256)

    mat_primary = make_pbr_mat("F1_Livery_Primary", hex_lin("#dc0e1a"), metallic=0.48, roughness=0.14, clearcoat=1.0, clearcoat_roughness=0.04)
    mat_accent = make_pbr_mat("F1_Livery_Accent", hex_lin("#f7f8fc"), metallic=0.28, roughness=0.16, clearcoat=0.95, clearcoat_roughness=0.06)
    mat_carbon = make_pbr_mat(
        "F1_Carbon_Weave",
        hex_lin("#1a1f28"),
        metallic=0.36,
        roughness=0.30,
        clearcoat=0.58,
        clearcoat_roughness=0.20,
        albedo_img=alb_carbon,
        normal_img=nrm_carbon,
        uv_tile=16.0,
    )
    mat_titanium = make_pbr_mat("F1_Titanium_Aero", hex_lin("#9aa3b0"), metallic=0.94, roughness=0.20, clearcoat=0.35)
    mat_exhaust = make_pbr_mat(
        "F1_Titanium_Exhaust",
        hex_lin("#b5aea4"),
        metallic=0.96,
        roughness=0.16,
        emission=hex_lin("#ff4800"),
        emission_strength=0.15,
    )
    mat_mirror = make_pbr_mat("F1_Mirror_Chrome", hex_lin("#eef5ff"), metallic=1.0, roughness=0.015, clearcoat=1.0, clearcoat_roughness=0.005)
    mat_helmet = make_pbr_mat("F1_Helmet_Shell", hex_lin("#00d4ff"), metallic=0.45, roughness=0.12, clearcoat=1.0, clearcoat_roughness=0.03)
    mat_visor = make_pbr_mat("F1_Visor_Chrome", hex_lin("#071326"), metallic=1.0, roughness=0.03, clearcoat=1.0, clearcoat_roughness=0.01)
    mat_nomex_red = make_pbr_mat("F1_Driver_Nomex", hex_lin("#c8101e"), metallic=0.06, roughness=0.66)
    mat_glove_grip = make_pbr_mat("F1_Glove_Suede", hex_lin("#171a21"), metallic=0.08, roughness=0.72)
    mat_foam = make_pbr_mat("F1_Cockpit_Foam", hex_lin("#14171d"), metallic=0.05, roughness=0.58)
    mat_harness = make_pbr_mat("F1_Harness_Belt", hex_lin("#ffd000"), metallic=0.22, roughness=0.38)
    mat_oled = make_pbr_mat(
        "F1_Cockpit_OLED",
        hex_lin("#061018"),
        metallic=0.15,
        roughness=0.10,
        clearcoat=0.85,
        emission=hex_lin("#00ff9d"),
        emission_strength=2.5,
    )
    mat_rpm_led = make_pbr_mat(
        "F1_Shift_LED",
        hex_lin("#00e5ff"),
        metallic=0.10,
        roughness=0.12,
        emission=hex_lin("#00e5ff"),
        emission_strength=4.2,
    )
    mat_rain = make_pbr_mat(
        "F1_Rain_Light",
        hex_lin("#ff1420"),
        metallic=0.1,
        roughness=0.14,
        emission=hex_lin("#ff1420"),
        emission_strength=5.8,
    )
    mat_rubber = make_pbr_mat("F1_Tire_Rubber", hex_lin("#15171c"), metallic=0.06, roughness=0.64)
    mat_stripe = make_pbr_mat(
        "F1_Compound_Stripe",
        hex_lin("#ff2430"),
        metallic=0.10,
        roughness=0.28,
        clearcoat=0.75,
        emission=hex_lin("#ff2430"),
        emission_strength=0.55,
    )
    mat_rim = make_pbr_mat("F1_Wheel_Rim", hex_lin("#232832"), metallic=0.88, roughness=0.22, clearcoat=0.35)
    mat_caliper = make_pbr_mat("F1_Caliper_Alloy", hex_lin("#e61924"), metallic=0.72, roughness=0.22, clearcoat=0.85)
    mat_rotor = make_pbr_mat("F1_Brake_Rotor", hex_lin("#4f4845"), metallic=0.82, roughness=0.28)
    mat_hull = make_pbr_mat("F1_Collision_Debug", hex_lin("#00ff88"), metallic=0.0, roughness=0.9)

    # --------------------------------------------------------------------------
    # 1. `Body` ([0, 0, 0] — 13-Station Monocoque, 8-Station Deep-Undercut Sidepods,
    #    Titanium Floor-Edge Vortex Strakes, 8-Strake Diffuser, T-Cam, Exhaust, Rain Light)
    # --------------------------------------------------------------------------
    bm_body = bmesh.new()
    # Slots: 0=Primary, 1=Accent, 2=Carbon, 3=Titanium, 4=Exhaust, 5=RainLight
    mono_stations = [
        (-2.48, 0.042, 0.058, 0.036, 0.122, 0.148, 0.174),
        (-2.24, 0.082, 0.108, 0.074, 0.128, 0.178, 0.232),
        (-1.92, 0.138, 0.176, 0.124, 0.134, 0.224, 0.312),
        (-1.54, 0.208, 0.258, 0.188, 0.128, 0.278, 0.422),
        (-1.14, 0.278, 0.332, 0.236, 0.108, 0.308, 0.492),
        (-0.76, 0.322, 0.378, 0.264, 0.095, 0.324, 0.525),
        (-0.38, 0.348, 0.402, 0.276, 0.090, 0.334, 0.535),
        ( 0.02, 0.344, 0.394, 0.228, 0.090, 0.398, 0.725),
        ( 0.24, 0.332, 0.382, 0.195, 0.090, 0.430, 0.812),
        ( 0.62, 0.278, 0.326, 0.142, 0.096, 0.392, 0.704),
        ( 1.06, 0.205, 0.248, 0.094, 0.108, 0.340, 0.578),
        ( 1.52, 0.132, 0.165, 0.056, 0.126, 0.278, 0.432),
        ( 1.96, 0.072, 0.090, 0.032, 0.156, 0.240, 0.328),
    ]
    m_rings = []
    for (y, hwb, hwm, hwt, zb, zm, zt) in mono_stations:
        m_rings.append([
            (-hwb, y, zb), (hwb, y, zb),
            (hwm, y, zm - 0.04), (hwm * 0.96, y, zm + 0.05),
            (hwt, y, zt), (-hwt, y, zt),
            (-hwm * 0.96, y, zm + 0.05), (-hwm, y, zm - 0.04),
        ])
    add_loft(bm_body, m_rings)

    # Deep-undercut 2026 ground-effect sidepods with sculpted water-slide top gullies
    for side in (-1.0, 1.0):
        sp_stations = [
            (-0.74, 0.28, 0.50, 0.74, 0.72, 0.22, 0.37, 0.492, 0.000),
            (-0.56, 0.30, 0.56, 0.82, 0.79, 0.16, 0.34, 0.510, 0.012),
            (-0.32, 0.30, 0.60, 0.85, 0.80, 0.12, 0.32, 0.504, 0.024),
            ( 0.02, 0.29, 0.63, 0.83, 0.75, 0.10, 0.30, 0.476, 0.038),
            ( 0.38, 0.25, 0.56, 0.72, 0.62, 0.10, 0.27, 0.430, 0.044),
            ( 0.78, 0.20, 0.44, 0.56, 0.46, 0.11, 0.25, 0.368, 0.034),
            ( 1.18, 0.14, 0.30, 0.38, 0.30, 0.13, 0.22, 0.305, 0.018),
            ( 1.62, 0.09, 0.15, 0.19, 0.15, 0.15, 0.20, 0.248, 0.000),
        ]
        sp_rings = []
        for (y, xin, xob, xom, xot, zb, zm, zt, dip) in sp_stations:
            pts = [
                (side * xin, y, zb),
                (side * xob, y, zb + 0.03),
                (side * xom, y, zm),
                (side * xot, y, zt),
                (side * 0.5 * (xin + xot), y, zt - dip),
                (side * xin, y, zt + 0.012),
            ]
            if side < 0:
                pts = list(reversed(pts))
            sp_rings.append(pts)
        add_loft(bm_body, sp_rings)

    f_mark = tag_faces_from(bm_body, 0, 0)

    # Dorsal aero sharkfin + sculpted nosecone livery stripe + airbox intake collar (slot 1 = Accent)
    add_box(bm_body, 0.0, 0.96, 0.65, 0.020, 1.36, 0.24)
    add_box(bm_body, 0.0, -1.56, 0.362, 0.145, 1.52, 0.082)
    add_box(bm_body, 0.0, 0.13, 0.755, 0.19, 0.08, 0.12)
    f_mark = tag_faces_from(bm_body, f_mark, 1)

    # Ground-effect Venturi floor, tea-tray bib, 4 forward floor fences per side,
    # 8-strake rear diffuser, sidepod inlet hoods, 8 cooling louvres per side & T-Cam pod (slot 2 = Carbon)
    add_box(bm_body, 0.0, 0.10, 0.066, 1.68, 2.92, 0.030)
    add_box(bm_body, 0.0, -1.46, 0.058, 0.40, 0.54, 0.022)  # Tea-tray splitter bib
    add_box(bm_body, 0.0, 1.80, 0.148, 1.26, 0.56, 0.15)    # Rear Venturi diffuser roof
    for sx in (-0.58, -0.44, -0.30, -0.16, 0.16, 0.30, 0.44, 0.58):
        add_box(bm_body, sx, 1.83, 0.122, 0.014, 0.50, 0.145)
    for side in (-1.0, 1.0):
        # 4 curved Venturi floor inlet fences per side
        for fi, fx in enumerate((0.36, 0.49, 0.62, 0.75)):
            add_swept_tube(
                bm_body,
                [
                    (side * fx, -0.86 + fi * 0.04, 0.085),
                    (side * (fx + 0.04), -0.52 + fi * 0.04, 0.082),
                    (side * (fx + 0.09), -0.18 + fi * 0.04, 0.080),
                ],
                (0.006, 0.042),
                segs=6,
                up_hint=(0, 0, 1),
            )
        # Sidepod carbon overbite lip & radiator recess baffle
        add_box(bm_body, side * 0.54, -0.755, 0.488, 0.44, 0.14, 0.018)
        add_box(bm_body, side * 0.53, -0.735, 0.365, 0.40, 0.03, 0.21)
        # Carbon floor edge wing + rear tire squirt slot
        add_box(bm_body, side * 0.848, 0.04, 0.088, 0.032, 1.98, 0.038)
        # 8 sculpted shark-gill cooling louvres along sidepod shoulder
        for g in range(8):
            add_box(
                bm_body,
                side * 0.45,
                -0.18 + g * 0.088,
                0.482 - g * 0.008,
                0.15,
                0.030,
                0.010,
                rot_euler=(math.radians(18.0), 0.0, 0.0),
            )
    # Overhead Roll-Hoop FOM T-Cam housing + twin lenses
    add_strut(bm_body, (0.0, 0.17, 0.795), (0.0, 0.17, 0.880), 0.013, 0.038, segs=8, up_hint=(1, 0, 0))
    add_box(bm_body, 0.0, 0.17, 0.888, 0.28, 0.068, 0.026)
    for side in (-1.0, 1.0):
        add_strut(bm_body, (side * 0.115, 0.125, 0.888), (side * 0.115, 0.185, 0.888), 0.014, 0.014, segs=10)
    f_mark = tag_faces_from(bm_body, f_mark, 2)

    # Titanium Floor-Edge Vortex Strakes, Stay Rods & Skid Plank Blocks (slot 3 = Titanium)
    for side in (-1.0, 1.0):
        for sv_i in range(5):
            y_sv = -0.62 + sv_i * 0.34
            add_box(
                bm_body,
                side * 0.872,
                y_sv,
                0.096,
                0.008,
                0.18,
                0.052,
                rot_euler=(0.0, 0.0, side * math.radians(14.0)),
            )
        # Rear floor stay rod from engine cover to floor edge ahead of rear tire
        add_strut(bm_body, (side * 0.34, 0.88, 0.36), (side * 0.83, 0.96, 0.095), 0.005, 0.005, segs=6)
    # Underfloor titanium skid blocks (sparking pads!)
    for y_skid in (-1.38, -0.35, 0.82):
        add_box(bm_body, 0.0, y_skid, 0.048, 0.14, 0.22, 0.010)
    f_mark = tag_faces_from(bm_body, f_mark, 3)

    # Central Flared Titanium Exhaust + Twin Wastegate Pipes (slot 4 = Exhaust)
    add_strut(bm_body, (0.0, 1.78, 0.35), (0.0, 2.09, 0.35), 0.058, 0.058, segs=24)
    for side in (-1.0, 1.0):
        add_strut(bm_body, (side * 0.076, 1.83, 0.33), (side * 0.076, 2.07, 0.33), 0.025, 0.025, segs=16)
    f_mark = tag_faces_from(bm_body, f_mark, 4)

    # FIA 15-LED Rear Crash-Structure Rain Light Matrix (slot 5 = RainLight)
    add_box(bm_body, 0.0, 2.072, 0.212, 0.056, 0.026, 0.114)
    tag_faces_from(bm_body, f_mark, 5)

    body_obj = finalize_godot_mesh(
        "Body",
        bm_body,
        [mat_primary, mat_accent, mat_carbon, mat_titanium, mat_exhaust, mat_rain],
        godot_pivot=(0.0, 0.0, 0.0),
        shade_smooth=True,
    )

    # --------------------------------------------------------------------------
    # 2. `Body/CockpitTub_Interior` ([0.0, 0.42, -0.35] — A+ First-Person Cockpit Cell)
    #    Recessed carbon survival tub, inner coaming rim, FIA horseshoe foam headrest,
    #    driver Nomex torso/shoulders, 6-point Sabelt harness + titanium buckles & column shroud!
    # --------------------------------------------------------------------------
    bm_tub = bmesh.new()
    # Slots: 0=Carbon, 1=CockpitFoam, 2=DriverNomex, 3=HarnessBelt, 4=TitaniumBuckle
    # Floor pan & recessed left/right inner carbon tub walls (open top so Cockpit View has clear sightline!)
    add_box(bm_tub, 0.0, -0.36, 0.21, 0.46, 0.88, 0.024)         # Cockpit floor pan
    add_box(bm_tub, 0.0, -0.78, 0.38, 0.44, 0.04, 0.32)          # Forward footwell bulkhead
    add_box(bm_tub, 0.0, -0.02, 0.40, 0.44, 0.06, 0.36, rot_euler=(math.radians(-26.0), 0.0, 0.0))  # Reclined carbon seat-back
    add_box(bm_tub, 0.0, -0.62, 0.49, 0.11, 0.28, 0.07)          # Carbon steering column shroud
    for side in (-1.0, 1.0):
        add_box(bm_tub, side * 0.235, -0.38, 0.38, 0.032, 0.86, 0.28)   # Inner survival cell wall
        add_box(bm_tub, side * 0.245, -0.40, 0.532, 0.058, 0.82, 0.034) # Sculpted upper cockpit coaming sill
    f_mark = tag_faces_from(bm_tub, 0, 0)

    # FIA impact-absorbing Confor-foam horseshoe headrest collar + knee bolsters (slot 1 = Foam)
    headrest_arc = [
        (-0.205, -0.38, 0.558),
        (-0.205, -0.16, 0.575),
        (-0.145, -0.04, 0.592),
        ( 0.000,  0.00, 0.598),
        ( 0.145, -0.04, 0.592),
        ( 0.205, -0.16, 0.575),
        ( 0.205, -0.38, 0.558),
    ]
    add_swept_tube(bm_tub, headrest_arc, (0.038, 0.034), segs=12)
    add_box(bm_tub, 0.0, -0.52, 0.42, 0.06, 0.26, 0.12)  # Center leg splitter pad
    f_mark = tag_faces_from(bm_tub, f_mark, 1)

    # Driver seated Nomex racing suit chest & upper shoulders (slot 2 = DriverNomex)
    add_box(bm_tub, 0.0, -0.20, 0.42, 0.34, 0.20, 0.24, rot_euler=(math.radians(-24.0), 0.0, 0.0))
    for side in (-1.0, 1.0):
        add_strut(
            bm_tub,
            (side * 0.155, -0.22, 0.495),
            (side * 0.178, -0.34, 0.505),
            0.056,
            0.052,
            segs=12,
        )
    f_mark = tag_faces_from(bm_tub, f_mark, 2)

    # 6-Point Sabelt FIA Racing Harness shoulder & lap belts + HANS collar (slot 3 = HarnessBelt)
    for side in (-1.0, 1.0):
        add_swept_tube(
            bm_tub,
            [
                (side * 0.085, -0.05, 0.555),
                (side * 0.095, -0.19, 0.505),
                (side * 0.065, -0.29, 0.415),
            ],
            (0.026, 0.007),
            segs=8,
            up_hint=(0, 0, 1),
        )
    f_mark = tag_faces_from(bm_tub, f_mark, 3)

    # Quick-release rotary harness cam-lock buckle & cockpit drink/radio toggles (slot 4 = Titanium)
    add_strut(bm_tub, (0.0, -0.295, 0.410), (0.0, -0.312, 0.415), 0.028, 0.028, segs=14)
    tag_faces_from(bm_tub, f_mark, 4)

    finalize_godot_mesh(
        "CockpitTub_Interior",
        bm_tub,
        [mat_carbon, mat_foam, mat_nomex_red, mat_harness, mat_titanium],
        godot_pivot=(0.0, 0.42, -0.35),
        parent=body_obj,
        parent_godot_pivot=(0.0, 0.0, 0.0),
    )

    # --------------------------------------------------------------------------
    # 3. `Body/Halo_Titanium` ([0.0, 0.68, -0.44] — Dedicated Halo w/ Swept Aero Fairings)
    #    Crafted specifically for authentic First-Person Cockpit View (`cameraIndex === 2`) framing!
    # --------------------------------------------------------------------------
    bm_halo = bmesh.new()
    # Slots: 0=Titanium, 1=CarbonFairing, 2=LiveryAccentWinglet
    halo_arc = [
        (-0.205,  0.04, 0.562),
        (-0.246, -0.14, 0.634),
        (-0.242, -0.34, 0.668),
        (-0.184, -0.54, 0.682),
        (-0.085, -0.642, 0.686),
        ( 0.000, -0.672, 0.688),
        ( 0.085, -0.642, 0.686),
        ( 0.184, -0.54, 0.682),
        ( 0.242, -0.34, 0.668),
        ( 0.246, -0.14, 0.634),
        ( 0.205,  0.04, 0.562),
    ]
    add_swept_tube(bm_halo, halo_arc, (0.023, 0.021), segs=18)
    # Streamlined teardrop central front V-pillar (slim X=13mm profile for clean apex visibility!)
    add_swept_tube(
        bm_halo,
        [(0.0, -0.715, 0.518), (0.0, -0.692, 0.605), (0.0, -0.672, 0.686)],
        [(0.015, 0.038), (0.012, 0.034), (0.016, 0.040)],
        segs=12,
        up_hint=(1, 0, 0),
    )
    f_mark = tag_faces_from(bm_halo, 0, 0)

    # Swept carbon aero fairings & rear transition mounts + onboard Halo camera blister (slot 1 = Carbon)
    for side in (-1.0, 1.0):
        fairing_pts = [
            (side * 0.212,  0.02, 0.578),
            (side * 0.252, -0.18, 0.652),
            (side * 0.244, -0.38, 0.684),
            (side * 0.172, -0.56, 0.696),
        ]
        add_swept_tube(bm_halo, fairing_pts, (0.028, 0.007), segs=10, up_hint=(0, 0, 1))
    add_box(bm_halo, -0.045, -0.655, 0.668, 0.036, 0.048, 0.022)  # High-speed Halo driver-facing camera pod
    f_mark = tag_faces_from(bm_halo, f_mark, 1)

    # Upper Halo boomerang aero conditioning winglets (slot 2 = Accent)
    for side in (-1.0, 1.0):
        add_airfoil(bm_halo, [
            (side * 0.205, -0.16, -0.04, 0.656, 0.008, 0.009),
            (side * 0.258, -0.28, -0.16, 0.678, 0.008, 0.008),
        ])
    tag_faces_from(bm_halo, f_mark, 2)

    finalize_godot_mesh(
        "Halo_Titanium",
        bm_halo,
        [mat_titanium, mat_carbon, mat_accent],
        godot_pivot=(0.0, 0.68, -0.44),
        parent=body_obj,
        parent_godot_pivot=(0.0, 0.0, 0.0),
    )

    # --------------------------------------------------------------------------
    # 4. `Body/WingMirror_L` & `Body/WingMirror_R` ([±0.54, 0.585, -0.50])
    #    Twin aero stalks, sculpted vortex-shroud cowling & high-metallic mirror glass face!
    # --------------------------------------------------------------------------
    for (m_name, godot_x) in (("WingMirror_L", -0.54), ("WingMirror_R", 0.54)):
        # Pre-baked Blender X: x_bl = -godot_x (`+0.54` for Left, `-0.54` for Right)
        s_bl = -1.0 if godot_x > 0 else 1.0
        bm_mir = bmesh.new()
        # Slots: 0=LiveryPrimary, 1=CarbonStalk, 2=MirrorChrome
        # Streamlined teardrop mirror housing
        cowl_rings = [
            [
                (s_bl * 0.468, -0.555, 0.566),
                (s_bl * 0.608, -0.545, 0.568),
                (s_bl * 0.608, -0.545, 0.614),
                (s_bl * 0.468, -0.555, 0.612),
            ],
            [
                (s_bl * 0.462, -0.510, 0.560),
                (s_bl * 0.616, -0.502, 0.562),
                (s_bl * 0.616, -0.502, 0.620),
                (s_bl * 0.462, -0.510, 0.618),
            ],
            [
                (s_bl * 0.466, -0.478, 0.562),
                (s_bl * 0.612, -0.472, 0.564),
                (s_bl * 0.612, -0.472, 0.618),
                (s_bl * 0.466, -0.478, 0.616),
            ],
        ]
        if s_bl < 0:
            cowl_rings = [[list(p) for p in reversed(r)] for r in cowl_rings]
        add_loft(bm_mir, cowl_rings)
        f_mark = tag_faces_from(bm_mir, 0, 0)

        # Twin aero stalks (inboard horizontal cockpit stay + vertical sidepod conditioning stay) & vortex shroud
        add_strut(bm_mir, (s_bl * 0.285, -0.525, 0.545), (s_bl * 0.475, -0.515, 0.582), 0.006, 0.024, segs=8)
        add_strut(bm_mir, (s_bl * 0.555, -0.505, 0.492), (s_bl * 0.555, -0.505, 0.565), 0.006, 0.022, segs=8, up_hint=(1, 0, 0))
        add_box(bm_mir, s_bl * 0.540, -0.502, 0.624, 0.158, 0.068, 0.006)  # Upper aero mirror conditioner vane
        f_mark = tag_faces_from(bm_mir, f_mark, 1)

        # Rear-facing high-metallic mirror glass pane (visible to driver in Cockpit View!)
        add_box(bm_mir, s_bl * 0.538, -0.473, 0.590, 0.136, 0.006, 0.046)
        tag_faces_from(bm_mir, f_mark, 2)

        finalize_godot_mesh(
            m_name,
            bm_mir,
            [mat_primary, mat_carbon, mat_mirror],
            godot_pivot=(godot_x, 0.585, -0.50),
            parent=body_obj,
            parent_godot_pivot=(0.0, 0.0, 0.0),
        )

    # --------------------------------------------------------------------------
    # 5. `Body/FrontWing` ([0.0, 0.10, -2.20] — 4-Element Gull-Wing + 3-Slot Endplates)
    # --------------------------------------------------------------------------
    bm_fw = bmesh.new()
    # Slots: 0=Accent, 1=Primary, 2=Carbon
    for (yle, yte, z0, cam, thk) in [
        (-2.45, -2.23, 0.072, 0.008, 0.024),
        (-2.30, -2.12, 0.104, 0.010, 0.020),
        (-2.19, -2.04, 0.138, 0.013, 0.017),
        (-2.09, -1.97, 0.172, 0.015, 0.015),
    ]:
        add_airfoil(bm_fw, [
            (-0.915, yle + 0.055, yte + 0.042, z0 + 0.010, cam, thk * 0.86),
            (-0.460, yle + 0.012, yte + 0.010, z0 + 0.002, cam, thk * 0.96),
            ( 0.000, yle - 0.024, yte,         z0 - 0.008, cam, thk),
            ( 0.460, yle + 0.012, yte + 0.010, z0 + 0.002, cam, thk * 0.96),
            ( 0.915, yle + 0.055, yte + 0.042, z0 + 0.010, cam, thk * 0.86),
        ])
    f_mark = tag_faces_from(bm_fw, 0, 0)

    # Twin nose pylons + multi-slot front wing endplates (3 distinct louvred aero slats + outwash canard!)
    for side in (-1.0, 1.0):
        add_strut(bm_fw, (side * 0.095, -2.28, 0.09), (side * 0.072, -2.16, 0.21), 0.012, 0.085, segs=8, up_hint=(1, 0, 0))
        # Lower endplate body + 3 angled multi-slot upper endplate vanes
        add_box(bm_fw, side * 0.925, -2.18, 0.125, 0.024, 0.50, 0.12)
        for slot_i in range(3):
            add_box(
                bm_fw,
                side * (0.926 - slot_i * 0.004),
                -2.30 + slot_i * 0.13,
                0.238,
                0.020,
                0.105,
                0.105,
                rot_euler=(0.0, side * math.radians(10.0), side * math.radians(-8.0)),
            )
    f_mark = tag_faces_from(bm_fw, f_mark, 1)

    # Carbon outwash footplate tunnels, S-curve diveplane canards & slot-gap separator brackets
    for side in (-1.0, 1.0):
        add_box(bm_fw, side * 0.958, -2.18, 0.068, 0.078, 0.48, 0.018)
        add_swept_tube(
            bm_fw,
            [
                (side * 0.942, -2.35, 0.125),
                (side * 0.958, -2.18, 0.175),
                (side * 0.968, -2.01, 0.228),
            ],
            (0.032, 0.007),
            segs=8,
            up_hint=(0, 0, 1),
        )
        for bx in (0.32, 0.64):
            add_box(bm_fw, side * bx, -2.14, 0.132, 0.008, 0.24, 0.075)
    tag_faces_from(bm_fw, f_mark, 2)

    finalize_godot_mesh(
        "FrontWing",
        bm_fw,
        [mat_accent, mat_primary, mat_carbon],
        godot_pivot=(0.0, 0.10, -2.20),
        parent=body_obj,
        parent_godot_pivot=(0.0, 0.0, 0.0),
    )

    # --------------------------------------------------------------------------
    # 6. `Body/RearWing` ([0.0, 0.73, +1.92]) + `Body/RearWing/RearWing_DRS`
    # --------------------------------------------------------------------------
    bm_rw = bmesh.new()
    # Slots: 0=Accent, 1=Primary, 2=Carbon, 3=RainLight
    # Deep-spoon mainplane + twin-element lower beam wing
    add_airfoil(bm_rw, [
        (-0.528, 1.80, 2.04, 0.746, -0.014, 0.030),
        (-0.260, 1.785, 2.04, 0.722, -0.019, 0.034),
        ( 0.000, 1.778, 2.04, 0.712, -0.022, 0.036),
        ( 0.260, 1.785, 2.04, 0.722, -0.019, 0.034),
        ( 0.528, 1.80, 2.04, 0.746, -0.014, 0.030),
    ])
    for (b_yle, b_yte, b_z) in ((1.86, 2.02, 0.385), (1.94, 2.07, 0.435)):
        add_airfoil(bm_rw, [
            (-0.485, b_yle, b_yte, b_z, 0.010, 0.020),
            ( 0.000, b_yle - 0.01, b_yte + 0.01, b_z - 0.008, 0.012, 0.022),
            ( 0.485, b_yle, b_yte, b_z, 0.010, 0.020),
        ])
    f_mark = tag_faces_from(bm_rw, 0, 0)

    # Multi-slot Rear Wing Endplates (upper louvred tip slots + lower scalloped skirt)
    for side in (-1.0, 1.0):
        add_box(bm_rw, side * 0.542, 1.94, 0.64, 0.024, 0.40, 0.36)
        for rs_i in range(3):
            add_box(
                bm_rw,
                side * 0.544,
                1.82 + rs_i * 0.11,
                0.865,
                0.020,
                0.082,
                0.075,
                rot_euler=(math.radians(14.0), 0.0, 0.0),
            )
    f_mark = tag_faces_from(bm_rw, f_mark, 1)

    # Twin swan-neck pylons, DRS hydraulic actuator pod & 3 lower endplate vortex strakes per side
    for side in (-1.0, 1.0):
        add_swept_tube(
            bm_rw,
            [(side * 0.082, 1.64, 0.42), (side * 0.082, 1.75, 0.80), (side * 0.082, 1.86, 0.73)],
            (0.011, 0.050),
            segs=10,
            up_hint=(1, 0, 0),
        )
        for vs_i in range(3):
            add_box(bm_rw, side * 0.530, 1.84 + vs_i * 0.09, 0.44, 0.010, 0.055, 0.12)
    add_box(bm_rw, 0.0, 1.855, 0.862, 0.044, 0.15, 0.048)
    f_mark = tag_faces_from(bm_rw, f_mark, 2)

    # Vertical FIA Endplate LED Trailing-Edge Strips
    for side in (-1.0, 1.0):
        add_box(bm_rw, side * 0.543, 2.138, 0.62, 0.016, 0.014, 0.24)
    tag_faces_from(bm_rw, f_mark, 3)

    rw_obj = finalize_godot_mesh(
        "RearWing",
        bm_rw,
        [mat_accent, mat_primary, mat_carbon, mat_rain],
        godot_pivot=(0.0, 0.73, 1.92),
        parent=body_obj,
        parent_godot_pivot=(0.0, 0.0, 0.0),
    )

    # Articulated `RearWing_DRS`: Pivot at [0.0, 0.84, +1.89]
    bm_drs = bmesh.new()
    add_airfoil(bm_drs, [
        (-0.520, 1.885, 2.054, 0.848, 0.014, 0.022),
        ( 0.000, 1.878, 2.054, 0.840, 0.016, 0.024),
        ( 0.520, 1.885, 2.054, 0.848, 0.014, 0.022),
    ])
    f_mark = tag_faces_from(bm_drs, 0, 0)
    # Carbon Gurney trailing-edge lip & central DRS clevis horn
    add_box(bm_drs, 0.0, 2.052, 0.858, 1.03, 0.008, 0.014)
    add_box(bm_drs, 0.0, 1.885, 0.862, 0.028, 0.055, 0.026)
    tag_faces_from(bm_drs, f_mark, 1)

    finalize_godot_mesh(
        "RearWing_DRS",
        bm_drs,
        [mat_accent, mat_carbon],
        godot_pivot=(0.0, 0.84, 1.89),
        parent=rw_obj,
        parent_godot_pivot=(0.0, 0.73, 1.92),
    )

    # --------------------------------------------------------------------------
    # 7. `Body/SteeringWheel` ([0.0, 0.54, -0.52]) + Child `DriverArms_Gloves`!
    # --------------------------------------------------------------------------
    bm_sw = bmesh.new()
    # Slots: 0=Carbon, 1=SuedeGrip, 2=OLED, 3=ShiftLED, 4=AccentButtons
    add_strut(bm_sw, (0.0, -0.65, 0.54), (0.0, -0.50, 0.54), 0.022, 0.022, segs=16)  # Quick-release steering shaft
    add_box(bm_sw, 0.0, -0.510, 0.550, 0.192, 0.020, 0.096)                          # Central carbon butterfly plate
    add_box(bm_sw, 0.0, -0.510, 0.604, 0.258, 0.018, 0.022)                          # Upper RPM shift-light brow
    add_box(bm_sw, 0.0, -0.510, 0.490, 0.165, 0.016, 0.020)                          # Lower butterfly bridge
    for side in (-1.0, 1.0):
        add_box(bm_sw, side * 0.090, -0.534, 0.562, 0.048, 0.007, 0.058)             # Magnetic gearshift paddles
        add_box(bm_sw, side * 0.078, -0.530, 0.505, 0.042, 0.007, 0.036)             # Dual-bite clutch paddles
    f_mark = tag_faces_from(bm_sw, 0, 0)

    # Contoured Alcantara / Suede Butterfly Grips (slot 1 = SuedeGrip)
    for side in (-1.0, 1.0):
        add_swept_tube(
            bm_sw,
            [
                (side * 0.098, -0.510, 0.478),
                (side * 0.132, -0.508, 0.520),
                (side * 0.134, -0.508, 0.565),
                (side * 0.116, -0.510, 0.602),
            ],
            (0.019, 0.022),
            segs=12,
            up_hint=(0, 1, 0),
        )
    f_mark = tag_faces_from(bm_sw, f_mark, 1)

    # Integrated Steering-Wheel 4.3" OLED Telemetry Screen Face (slot 2 = OLED)
    add_box(bm_sw, 0.0, -0.498, 0.562, 0.104, 0.005, 0.052)
    f_mark = tag_faces_from(bm_sw, f_mark, 2)

    # 15 Individual 3D Shift-Light LED Lenses along Top Brow (slot 3 = ShiftLED)
    for led_i in range(15):
        lx = -0.098 + led_i * (0.196 / 14.0)
        add_box(bm_sw, lx, -0.499, 0.605, 0.008, 0.006, 0.008)
    f_mark = tag_faces_from(bm_sw, f_mark, 3)

    # 3 Central Multi-Map Rotary Dials + 4 Thumb Encoders + 6 Pushbuttons (slot 4 = AccentButtons)
    for rx in (-0.040, 0.0, 0.040):
        add_strut(bm_sw, (rx, -0.504, 0.518), (rx, -0.490, 0.518), 0.012, 0.012, segs=12)
    for side in (-1.0, 1.0):
        for tz in (0.548, 0.578):
            add_strut(bm_sw, (side * 0.082, -0.508, tz), (side * 0.096, -0.508, tz), 0.010, 0.010, segs=10)
        for bz in (0.528, 0.558, 0.586):
            add_strut(bm_sw, (side * 0.068, -0.503, bz), (side * 0.068, -0.493, bz), 0.006, 0.006, segs=8)
    tag_faces_from(bm_sw, f_mark, 4)

    sw_obj = finalize_godot_mesh(
        "SteeringWheel",
        bm_sw,
        [mat_carbon, mat_glove_grip, mat_oled, mat_rpm_led, mat_accent],
        godot_pivot=(0.0, 0.54, -0.52),
        parent=body_obj,
        parent_godot_pivot=(0.0, 0.0, 0.0),
    )

    # `Body/SteeringWheel/DriverArms_Gloves`: Nomex racing sleeves + gauntlet cuffs +
    # moulded carbon-knuckle gloves & thumbs gripping the wheel grips (tracks `SteeringWheel` 1:1!)
    bm_arms = bmesh.new()
    # Slots: 0=DriverNomex, 1=AccentCuff, 2=GloveSuede, 3=CarbonKnuckle
    for side in (-1.0, 1.0):
        # Quilted Nomex forearm sleeve extending from cockpit shoulders toward wheel grips
        add_swept_tube(
            bm_arms,
            [
                (side * 0.172, -0.285, 0.492),
                (side * 0.162, -0.375, 0.504),
                (side * 0.146, -0.448, 0.522),
            ],
            [(0.048, 0.044), (0.043, 0.040), (0.036, 0.034)],
            segs=14,
        )
    f_mark = tag_faces_from(bm_arms, 0, 0)

    # White Nomex gauntlet wrist cuffs with elastic gather
    for side in (-1.0, 1.0):
        add_swept_tube(
            bm_arms,
            [
                (side * 0.146, -0.444, 0.521),
                (side * 0.136, -0.482, 0.532),
            ],
            [(0.038, 0.036), (0.034, 0.032)],
            segs=12,
        )
    f_mark = tag_faces_from(bm_arms, f_mark, 1)

    # Ergonomic racing glove palms, 4 curled fingers wrapped around grip & thumb hooked in wheel cutout!
    for side in (-1.0, 1.0):
        # Glove palm & backhand shell
        add_swept_tube(
            bm_arms,
            [
                (side * 0.135, -0.480, 0.533),
                (side * 0.133, -0.512, 0.542),
            ],
            (0.032, 0.036),
            segs=12,
        )
        # Thumb hooking inward around upper butterfly thumb-rest
        add_swept_tube(
            bm_arms,
            [
                (side * 0.122, -0.492, 0.556),
                (side * 0.104, -0.504, 0.568),
                (side * 0.094, -0.514, 0.562),
            ],
            [(0.013, 0.013), (0.011, 0.011), (0.009, 0.009)],
            segs=8,
        )
        # 4 articulated curled fingers wrapping around outer/front face of suede grip
        for fi in range(4):
            fz = 0.514 + fi * 0.016
            add_swept_tube(
                bm_arms,
                [
                    (side * 0.146, -0.502, fz),
                    (side * 0.144, -0.524, fz),
                    (side * 0.124, -0.526, fz),
                ],
                (0.0085, 0.0085),
                segs=8,
            )
    f_mark = tag_faces_from(bm_arms, f_mark, 2)

    # Moulded Carbon-Fiber Knuckle Guards on back of gloves (clearly visible in Cockpit View!)
    for side in (-1.0, 1.0):
        add_box(
            bm_arms,
            side * 0.146,
            -0.496,
            0.540,
            0.014,
            0.032,
            0.056,
            rot_euler=(0.0, side * math.radians(-12.0), 0.0),
        )
    tag_faces_from(bm_arms, f_mark, 3)

    finalize_godot_mesh(
        "DriverArms_Gloves",
        bm_arms,
        [mat_nomex_red, mat_accent, mat_glove_grip, mat_carbon],
        godot_pivot=(0.0, 0.54, -0.52),
        parent=sw_obj,
        parent_godot_pivot=(0.0, 0.54, -0.52),
    )

    # --------------------------------------------------------------------------
    # 8. `Body/CockpitDash` ([0.0, 0.59, -0.56]) & `Body/DriverHelmet` ([0.0, 0.625, -0.245])
    # --------------------------------------------------------------------------
    bm_dash = bmesh.new()
    add_box(bm_dash, 0.0, -0.568, 0.586, 0.186, 0.048, 0.080)  # Carbon anti-glare hood + bezel
    add_box(bm_dash, 0.0, -0.556, 0.628, 0.194, 0.034, 0.008)  # Sun-visor brow over dash
    f_mark = tag_faces_from(bm_dash, 0, 0)
    add_box(bm_dash, 0.0, -0.543, 0.590, 0.160, 0.006, 0.058)  # Emissive OLED dash screen
    f_mark = tag_faces_from(bm_dash, f_mark, 1)
    for dl_i in range(12):
        lx = -0.072 + dl_i * (0.144 / 11.0)
        add_box(bm_dash, lx, -0.542, 0.621, 0.007, 0.006, 0.006)
    tag_faces_from(bm_dash, f_mark, 2)

    finalize_godot_mesh(
        "CockpitDash",
        bm_dash,
        [mat_carbon, mat_oled, mat_rpm_led],
        godot_pivot=(0.0, 0.59, -0.56),
        parent=body_obj,
        parent_godot_pivot=(0.0, 0.0, 0.0),
    )

    bm_helm = bmesh.new()
    ret_h = bmesh.ops.create_uvsphere(bm_helm, u_segments=32, v_segments=20, radius=0.148)
    bmesh.ops.scale(bm_helm, vec=(0.91, 1.14, 0.96), verts=ret_h["verts"])
    bmesh.ops.translate(bm_helm, vec=(0.0, -0.245, 0.625), verts=ret_h["verts"])
    # Rear aero helmet spoiler gurney & chin-bar venturi diffuser
    add_box(bm_helm, 0.0, -0.105, 0.675, 0.16, 0.07, 0.028, rot_euler=(math.radians(16.0), 0.0, 0.0))
    f_mark = tag_faces_from(bm_helm, 0, 0)

    ret_v = bmesh.ops.create_uvsphere(bm_helm, u_segments=28, v_segments=16, radius=0.144)
    bmesh.ops.scale(bm_helm, vec=(0.88, 1.07, 0.50), verts=ret_v["verts"])
    bmesh.ops.translate(bm_helm, vec=(0.0, -0.296, 0.628), verts=ret_v["verts"])
    f_mark = tag_faces_from(bm_helm, f_mark, 1)

    # Visor top Zylon protective strip & tear-off posts
    add_box(bm_helm, 0.0, -0.382, 0.668, 0.16, 0.020, 0.016)
    tag_faces_from(bm_helm, f_mark, 2)

    finalize_godot_mesh(
        "DriverHelmet",
        bm_helm,
        [mat_helmet, mat_visor, mat_carbon],
        godot_pivot=(0.0, 0.625, -0.245),
        parent=body_obj,
        parent_godot_pivot=(0.0, 0.0, 0.0),
    )

    # --------------------------------------------------------------------------
    # 9. 4-Corner `Suspension_<C>`, Sculpted Carbon `BrakeCaliper_<C>`,
    #    `Wheel_<C>` & Radially Slotted `BrakeDisc_<C>`
    # --------------------------------------------------------------------------
    corners = [
        ("FL", -0.86, 0.34, -1.48, -0.22, False),
        ("FR",  0.86, 0.34, -1.48,  0.22, False),
        ("RL", -0.86, 0.34,  1.42, -0.22, True),
        ("RR",  0.86, 0.34,  1.42,  0.22, True),
    ]

    for (cid, wx_g, wy_g, wz_g, in_x_g, is_rear) in corners:
        sx_in_bl = -in_x_g
        sx_out_bl = -wx_g * 0.84
        yb = wz_g

        # Aero-profile double wishbones + pushrod/pullrod + steering/toe link
        bm_s = bmesh.new()
        add_strut(bm_s, (sx_in_bl, yb - 0.14, 0.395), (sx_out_bl, yb, 0.425), 0.008, 0.032, segs=8)
        add_strut(bm_s, (sx_in_bl, yb + 0.14, 0.385), (sx_out_bl, yb, 0.425), 0.008, 0.030, segs=8)
        add_strut(bm_s, (sx_in_bl, yb - 0.13, 0.205), (sx_out_bl, yb, 0.238), 0.008, 0.032, segs=8)
        add_strut(bm_s, (sx_in_bl, yb + 0.13, 0.198), (sx_out_bl, yb, 0.238), 0.008, 0.030, segs=8)
        add_strut(bm_s, (sx_in_bl, yb + 0.05, 0.46 if not is_rear else 0.21), (sx_out_bl, yb, 0.24 if not is_rear else 0.42), 0.009, 0.016, segs=8)
        add_strut(bm_s, (sx_in_bl, yb - 0.06, 0.32), (sx_out_bl, yb - 0.04, 0.33), 0.007, 0.020, segs=8)

        susp_pivot_g = (in_x_g, 0.31, wz_g)
        susp_obj = finalize_godot_mesh(
            f"Suspension_{cid}",
            bm_s,
            mat_carbon,
            godot_pivot=susp_pivot_g,
        )

        # Sculpted Carbon Brake Duct + Forward Cooling Scoop + Wheel-Wake Deflector + 6-Piston Brembo Caliper
        bm_cal = bmesh.new()
        # Slots: 0=CaliperAlloy, 1=CarbonBrakeDuct, 2=TitaniumBleeder
        in_sign_bl = 1.0 if wx_g > 0 else -1.0  # Inboard direction in pre-baked Blender X
        cal_x_bl = -wx_g + in_sign_bl * 0.035
        cal_y_bl = yb + (-0.115 if wz_g < 0 else 0.115)
        add_box(bm_cal, cal_x_bl, cal_y_bl, wy_g + 0.035, 0.088, 0.118, 0.162)
        f_mark = tag_faces_from(bm_cal, 0, 0)

        # Carbon-fiber brake drum barrel, inboard cooling inlet scoop & FIA upper wheel-wake winglets
        add_strut(bm_cal, (-wx_g + in_sign_bl * 0.125, yb, wy_g), (-wx_g + in_sign_bl * 0.015, yb, wy_g), 0.178, 0.178, segs=24)
        add_swept_tube(
            bm_cal,
            [
                (-wx_g + in_sign_bl * 0.165, yb - 0.18, wy_g + 0.04),
                (-wx_g + in_sign_bl * 0.145, yb - 0.06, wy_g + 0.03),
                (-wx_g + in_sign_bl * 0.115, yb + 0.04, wy_g + 0.02),
            ],
            [(0.032, 0.068), (0.028, 0.058), (0.022, 0.046)],
            segs=10,
            up_hint=(0, 0, 1),
        )
        add_box(bm_cal, -wx_g + in_sign_bl * 0.155, yb + 0.08, wy_g + 0.24, 0.014, 0.26, 0.095, rot_euler=(math.radians(-12.0), 0.0, 0.0))
        f_mark = tag_faces_from(bm_cal, f_mark, 1)

        # Caliper bridge bolts
        for bz in (-0.04, 0.04, 0.09):
            add_strut(bm_cal, (cal_x_bl - 0.048, cal_y_bl, wy_g + bz), (cal_x_bl + 0.048, cal_y_bl, wy_g + bz), 0.008, 0.008, segs=8)
        tag_faces_from(bm_cal, f_mark, 2)

        finalize_godot_mesh(
            f"BrakeCaliper_{cid}",
            bm_cal,
            [mat_caliper, mat_carbon, mat_titanium],
            godot_pivot=(wx_g, wy_g, wz_g),
            parent=susp_obj,
            parent_godot_pivot=susp_pivot_g,
        )

        # `Wheel_<C>` (48-seg Pirelli slick + dual stripes + Y-split 10-spoke rim + anodized lock nut)
        bm_w = bmesh.new()
        cx_bl = -wx_g
        out_sign = -1.0 if wx_g > 0 else 1.0
        build_pirelli_wheel_bmesh(bm_w, cx_bl, yb, wy_g, is_rear=is_rear, out_sign=out_sign)
        nut_mat = mat_primary if wx_g < 0 else mat_helmet

        wheel_pivot_g = (wx_g, wy_g, wz_g)
        wheel_obj = finalize_godot_mesh(
            f"Wheel_{cid}",
            bm_w,
            [mat_rubber, mat_stripe, mat_rim, nut_mat, mat_carbon],
            godot_pivot=wheel_pivot_g,
        )

        # Radially Slotted Carbon-Ceramic `BrakeDisc_<C>` (slot 0 = `F1_Brake_Rotor` for thermal glow!)
        bm_disc = bmesh.new()
        add_strut(bm_disc, (cx_bl - 0.020, yb, wy_g), (cx_bl + 0.020, yb, wy_g), 0.172, 0.172, segs=36)
        for slot_i in range(12):
            ang = (2.0 * math.pi * slot_i) / 12.0
            sy_slot = yb + math.cos(ang) * 0.132
            sz_slot = wy_g + math.sin(ang) * 0.132
            add_box(bm_disc, cx_bl, sy_slot, sz_slot, 0.044, 0.010, 0.052, rot_euler=(ang, 0.0, 0.0))

        finalize_godot_mesh(
            f"BrakeDisc_{cid}",
            bm_disc,
            mat_rotor,
            godot_pivot=wheel_pivot_g,
            parent=wheel_obj,
            parent_godot_pivot=wheel_pivot_g,
        )

    # --------------------------------------------------------------------------
    # 10. `CollisionHull-convcolonly` (24-Vertex Beveled Ski-Ramp Convex Hull)
    # --------------------------------------------------------------------------
    bm_col = bmesh.new()
    hull_rings = [
        [(-0.42, -2.42, 0.16), (0.42, -2.42, 0.16), (0.36, -2.38, 0.28), (-0.36, -2.38, 0.28)],
        [(-0.92, -1.55, 0.11), (0.92, -1.55, 0.11), (0.78, -1.45, 0.56), (-0.78, -1.45, 0.56)],
        [(-0.94,  0.10, 0.10), (0.94,  0.10, 0.10), (0.58,  0.18, 0.84), (-0.58,  0.18, 0.84)],
        [(-0.92,  1.50, 0.12), (0.92,  1.50, 0.12), (0.62,  1.65, 0.88), (-0.62,  1.65, 0.88)],
        [(-0.56,  2.06, 0.19), (0.56,  2.06, 0.19), (0.54,  2.06, 0.90), (-0.54,  2.06, 0.90)],
    ]
    add_loft(bm_col, hull_rings)
    col_obj = finalize_godot_mesh(
        "CollisionHull-convcolonly",
        bm_col,
        mat_hull,
        godot_pivot=(0.0, 0.0, 0.0),
        shade_smooth=False,
        smart_uv=False,
    )
    col_obj.display_type = "WIRE"

    blend_path = os.path.join(OUT_BLEND, "f1_car_2026.blend")
    glb_webgl = os.path.join(OUT_MODELS_WEBGL, "f1_car_2026.glb")
    glb_godot = os.path.join(OUT_MODELS_GODOT, "f1_car_2026.glb")

    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(
        filepath=glb_webgl,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
    )
    shutil.copy2(glb_webgl, glb_godot)
    for alias_name in ("f1_2026_player.glb", "f1_2026_rival.glb"):
        shutil.copy2(glb_webgl, os.path.join(OUT_MODELS_WEBGL, alias_name))
        shutil.copy2(glb_webgl, os.path.join(OUT_MODELS_GODOT, alias_name))


# ==============================================================================
# 4. BUILD A+ 3D PIT GARAGE, JACKS, LOLLIPOP, SPARE SLICK & RIGGED CREW
# ==============================================================================

def build_pit_garage_and_rigged_crew():
    reset_scene()
    alb_carbon, nrm_carbon = build_procedural_carbon_maps(size=128)

    mat_garage = make_pbr_mat("Pit_Garage_Steel", hex_lin("#1e2430"), metallic=0.72, roughness=0.32)
    mat_cab = make_pbr_mat("Pit_Cabinet_Red", hex_lin("#d91420"), metallic=0.45, roughness=0.22, clearcoat=0.85)
    mat_hose = make_pbr_mat("Pit_Pneumatic_Hose", hex_lin("#ffd000"), metallic=0.18, roughness=0.36)
    mat_fuel = make_pbr_mat("Pit_Fuel_Chrome", hex_lin("#cfd6e0"), metallic=0.92, roughness=0.18)
    mat_led = make_pbr_mat(
        "Pit_Ceiling_LED",
        hex_lin("#f4faff"),
        metallic=0.1,
        roughness=0.14,
        emission=hex_lin("#e8f6ff"),
        emission_strength=3.6,
    )
    mat_stop_red = make_pbr_mat(
        "Pit_Lollipop_Stop",
        hex_lin("#ff1a24"),
        metallic=0.15,
        roughness=0.22,
        emission=hex_lin("#ff1a24"),
        emission_strength=1.8,
    )
    mat_go_green = make_pbr_mat(
        "Pit_Lollipop_Go",
        hex_lin("#00e676"),
        metallic=0.15,
        roughness=0.22,
        emission=hex_lin("#00e676"),
        emission_strength=1.8,
    )
    mat_carbon = make_pbr_mat(
        "Pit_Boom_Carbon",
        hex_lin("#181c24"),
        metallic=0.36,
        roughness=0.30,
        clearcoat=0.55,
        albedo_img=alb_carbon,
        normal_img=nrm_carbon,
        uv_tile=10.0,
    )
    mat_rubber = make_pbr_mat("Pit_Tire_Rubber", hex_lin("#15171c"), metallic=0.06, roughness=0.64)
    mat_stripe = make_pbr_mat(
        "Pit_Compound_Soft",
        hex_lin("#ff2430"),
        metallic=0.10,
        roughness=0.28,
        emission=hex_lin("#ff2430"),
        emission_strength=0.45,
    )
    mat_rim = make_pbr_mat("Pit_Wheel_Rim", hex_lin("#586274"), metallic=0.92, roughness=0.18)
    mat_suit = make_pbr_mat("Crew_Nomex_Suit", hex_lin("#dc0e1a"), metallic=0.10, roughness=0.54)
    mat_suit_stripe = make_pbr_mat("Crew_Suit_Stripe", hex_lin("#f6f8fc"), metallic=0.18, roughness=0.36)
    mat_helm = make_pbr_mat("Crew_Carbon_Helmet", hex_lin("#f4f7fc"), metallic=0.38, roughness=0.14, clearcoat=1.0)
    mat_visor = make_pbr_mat("Crew_Iridium_Visor", hex_lin("#071326"), metallic=0.98, roughness=0.04, clearcoat=1.0)
    mat_gun_body = make_pbr_mat("Crew_Paoli_Gun", hex_lin("#1a222e"), metallic=0.84, roughness=0.24)
    mat_gun_anod = make_pbr_mat("Crew_Paoli_Anodized", hex_lin("#00a8ff"), metallic=0.90, roughness=0.18, clearcoat=0.7)

    # --------------------------------------------------------------------------
    # A. `PitGarage_Bay` (Portal Columns, Telemetry Wall, Tool Cabinets, LEDs & Pit Box Marks)
    # --------------------------------------------------------------------------
    bm_gar = bmesh.new()
    for y_col in (-3.8, 0.0, 3.8):
        add_box(bm_gar, -3.8, y_col, 2.1, 0.28, 0.28, 4.2)
        add_box(bm_gar, -8.2, y_col, 2.1, 0.28, 0.28, 4.2)
    add_box(bm_gar, -6.0, 0.0, 4.15, 4.8, 8.2, 0.24)
    add_box(bm_gar, -8.1, 0.0, 2.10, 0.20, 8.0, 4.0)
    f_mark = tag_faces_from(bm_gar, 0, 0)

    # Modular Red Pit Tool Chests +Pit-Box Painted Stopping Guidelines
    add_box(bm_gar, -7.2, -2.2, 0.68, 0.86, 2.5, 1.36)
    add_box(bm_gar, -7.2,  2.2, 0.68, 0.86, 2.5, 1.36)
    for side in (-1.0, 1.0):
        add_box(bm_gar, side * 1.08, 0.0, 0.008, 0.12, 5.2, 0.012)
        add_box(bm_gar, side * 0.96, -1.48, 0.010, 0.42, 0.10, 0.014)
        add_box(bm_gar, side * 0.96,  1.42, 0.010, 0.42, 0.10, 0.014)
    f_mark = tag_faces_from(bm_gar, f_mark, 1)

    for y_led in (-2.4, 0.0, 2.4):
        add_box(bm_gar, -5.8, y_led, 4.01, 2.8, 0.85, 0.05)
    tag_faces_from(bm_gar, f_mark, 2)

    finalize_godot_mesh("PitGarage_Bay", bm_gar, [mat_garage, mat_cab, mat_led], godot_pivot=(0.0, 0.0, 0.0))

    # --------------------------------------------------------------------------
    # B. `Overhead_Gantry_And_Hoses` (Swivel Carbon Booms + 4 Catenary Pneumatic Hoses)
    # --------------------------------------------------------------------------
    bm_boom = bmesh.new()
    add_strut(bm_boom, (-3.6, 0.0, 0.0), (-3.6, 0.0, 3.88), 0.13, 0.13, segs=14)
    for y_b in (-1.48, 1.42):
        add_box(bm_boom, -1.75, y_b, 3.80, 3.9, 0.14, 0.14)
        add_strut(bm_boom, (-3.55, y_b, 3.15), (-2.15, y_b, 3.78), 0.035, 0.035, segs=8)
    f_mark = tag_faces_from(bm_boom, 0, 0)

    hose_targets = [(1.25, -1.48), (-1.25, -1.48), (1.25, 1.42), (-1.25, 1.42)]
    for (hx, hy) in hose_targets:
        hose_pts = [
            (hx * 0.70, hy, 3.75),
            (hx * 0.86, hy + 0.10, 2.55),
            (hx * 1.00, hy + 0.16, 1.48),
            (hx * 1.06, hy + 0.06, 0.84),
        ]
        add_swept_tube(bm_boom, hose_pts, (0.019, 0.019), segs=10)
    tag_faces_from(bm_boom, f_mark, 1)

    finalize_godot_mesh("Overhead_Gantry_And_Hoses", bm_boom, [mat_carbon, mat_hose], godot_pivot=(0.0, 0.0, 0.0))

    # --------------------------------------------------------------------------
    # C. `Pressurized_Fuel_Rig` ([0.0, 0.0, 0.0] — Chrome Fuel Tower & Dry-Break Hose)
    # --------------------------------------------------------------------------
    bm_fuel = bmesh.new()
    add_strut(bm_fuel, (-3.25, 0.38, 0.0), (-3.25, 0.38, 2.62), 0.29, 0.29, segs=20)
    add_swept_tube(
        bm_fuel,
        [(-3.25, 0.38, 2.38), (-2.20, 0.28, 1.88), (-1.12, 0.16, 0.96)],
        [(0.048, 0.048), (0.040, 0.040), (0.056, 0.056)],
        segs=12,
    )
    f_mark = tag_faces_from(bm_fuel, 0, 0)
    add_box(bm_fuel, -3.25, 0.38, 1.55, 0.62, 0.62, 0.26)
    tag_faces_from(bm_fuel, f_mark, 1)
    finalize_godot_mesh("Pressurized_Fuel_Rig", bm_fuel, [mat_fuel, mat_cab], godot_pivot=(0.0, 0.0, 0.0))

    # --------------------------------------------------------------------------
    # D. Separate Articulated `QuickLift_FrontJack` & `QuickLift_RearJack`!
    # --------------------------------------------------------------------------
    for (j_name, jy_bl, jz_godot) in (
        ("QuickLift_FrontJack", -2.75, -2.75),
        ("QuickLift_RearJack",   2.55,  2.55),
    ):
        bm_jack = bmesh.new()
        dir_s = -1.0 if jy_bl < 0 else 1.0  # Away from car nose/tail in pre-baked -Y space
        # Low-profile billet chassis rails + swivel nose cradle + twin rollers + long carbon lever handle
        for rx in (-0.16, 0.16):
            add_box(bm_jack, rx, jy_bl, 0.065, 0.042, 0.78, 0.055)
            add_strut(bm_jack, (rx - 0.035, jy_bl - dir_s * 0.26, 0.055), (rx + 0.035, jy_bl - dir_s * 0.26, 0.055), 0.055, 0.055, segs=16)
        add_box(bm_jack, 0.0, jy_bl - dir_s * 0.32, 0.095, 0.34, 0.18, 0.045)  # Nose/diffuser lift cradle
        f_mark = tag_faces_from(bm_jack, 0, 0)

        # Curved tubular carbon-titanium quick-lift lever handle + crossbar grip
        handle_pts = [
            (0.0, jy_bl, 0.08),
            (0.0, jy_bl + dir_s * 0.24, 0.48),
            (0.0, jy_bl + dir_s * 0.56, 0.98),
        ]
        add_swept_tube(bm_jack, handle_pts, (0.022, 0.022), segs=10)
        add_strut(bm_jack, (-0.22, jy_bl + dir_s * 0.56, 0.98), (0.22, jy_bl + dir_s * 0.56, 0.98), 0.018, 0.018, segs=10)
        tag_faces_from(bm_jack, f_mark, 1)

        finalize_godot_mesh(
            j_name,
            bm_jack,
            [mat_cab, mat_carbon],
            godot_pivot=(0.0, 0.0, jz_godot),
        )

    # --------------------------------------------------------------------------
    # E. `Pit_Lollipop_Sign` ([0.0, 0.0, -3.55] — Carbon Pole + Dual-Face STOP / 1ST GEAR Sign)
    # --------------------------------------------------------------------------
    bm_lol = bmesh.new()
    # Carbon boom pole held out in front of the nosecone stopping mark
    add_swept_tube(
        bm_lol,
        [(-1.45, -3.55, 1.15), (-0.85, -3.55, 1.52), (0.0, -3.55, 1.56)],
        (0.020, 0.020),
        segs=10,
    )
    # Octagonal carbon sign frame centered at (0.0, -3.55, 1.56)
    oct_pts_f = []
    oct_pts_b = []
    for oi in range(8):
        ang = math.radians(22.5 + oi * 45.0)
        ox = math.cos(ang) * 0.30
        oz = 1.56 + math.sin(ang) * 0.30
        oct_pts_f.append((ox, -3.535, oz))
        oct_pts_b.append((ox, -3.565, oz))
    add_loft(bm_lol, [oct_pts_f, oct_pts_b], closed_ring=True, cap_start=True, cap_end=True)
    f_mark = tag_faces_from(bm_lol, 0, 0)

    # Driver-facing glowing RED "STOP" face + embossed white bar (`+Y` toward stopped car in -Y space)
    add_box(bm_lol, 0.0, -3.528, 1.56, 0.44, 0.008, 0.44)
    f_mark = tag_faces_from(bm_lol, f_mark, 1)

    # Flip-side glowing GREEN "1ST GEAR • GO!" face (`-Y` side so rotating lollipop 180° around Y flashes GO!)
    add_box(bm_lol, 0.0, -3.572, 1.56, 0.44, 0.008, 0.44)
    f_mark = tag_faces_from(bm_lol, f_mark, 2)

    # Crisp raised lettering bars across STOP / 1ST GEAR sign faces
    add_box(bm_lol, 0.0, -3.521, 1.56, 0.32, 0.006, 0.085)
    add_box(bm_lol, 0.0, -3.579, 1.56, 0.10, 0.006, 0.28)
    tag_faces_from(bm_lol, f_mark, 3)

    finalize_godot_mesh(
        "Pit_Lollipop_Sign",
        bm_lol,
        [mat_carbon, mat_stop_red, mat_go_green, mat_suit_stripe],
        godot_pivot=(0.0, 0.0, -3.55),
    )

    # --------------------------------------------------------------------------
    # F. `Spare_Pirelli_Wheel_Set` ([2.35, 0.0, -1.55] — Staged Spare Slicks + Rack)
    # --------------------------------------------------------------------------
    bm_spare = bmesh.new()
    # Upright standing spare Pirelli slick ready for tire-carrier
    # Slots: 0=Rubber, 1=CompoundSoft, 2=WheelRim, 3=CabinetRed, 4=CarbonBarrel, 5=StandRed
    build_pirelli_wheel_bmesh(bm_spare, -2.35, -1.55, 0.347, is_rear=True, out_sign=1.0)
    # Tubular red tire-staging stand behind the spare wheel
    f_mark = len(bm_spare.faces)
    add_box(bm_spare, -2.58, -1.55, 0.03, 0.56, 0.82, 0.04)
    add_strut(bm_spare, (-2.78, -1.88, 0.04), (-2.78, -1.88, 0.78), 0.022, 0.022, segs=8)
    add_strut(bm_spare, (-2.78, -1.22, 0.04), (-2.78, -1.22, 0.78), 0.022, 0.022, segs=8)
    add_strut(bm_spare, (-2.78, -1.88, 0.76), (-2.78, -1.22, 0.76), 0.020, 0.020, segs=8)
    tag_faces_from(bm_spare, f_mark, 5)

    finalize_godot_mesh(
        "Spare_Pirelli_Wheel_Set",
        bm_spare,
        [mat_rubber, mat_stripe, mat_rim, mat_cab, mat_carbon, mat_cab],
        godot_pivot=(2.35, 0.0, -1.55),
    )

    # --------------------------------------------------------------------------
    # G. 13-Bone Skeletal `PitCrew_Armature` + Skinned `PitCrew_Mechanic` w/ High-Detail Paoli Gun
    # --------------------------------------------------------------------------
    arm_data = bpy.data.armatures.new("PitCrew_Skeleton")
    arm_obj = bpy.data.objects.new("PitCrew_Armature", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.ops.object.select_all(action="DESELECT")
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj

    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def make_bone(bname, head, tail, parent_bone=None):
        b = eb.new(bname)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent_bone is not None:
            b.parent = parent_bone
        return b

    b_root = make_bone("Root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.25))
    b_pelvis = make_bone("Pelvis", (0.0, 0.0, 0.82), (0.0, 0.0, 0.98), b_root)
    b_spine = make_bone("Spine", (0.0, 0.0, 0.98), (0.0, -0.04, 1.34), b_pelvis)
    b_head = make_bone("Head", (0.0, -0.04, 1.36), (0.0, -0.05, 1.64), b_spine)

    b_arm_l = make_bone("UpperArm.L", ( 0.21, -0.04, 1.28), ( 0.22, -0.22, 1.04), b_spine)
    b_fore_l = make_bone("Forearm.L", ( 0.22, -0.22, 1.04), ( 0.08, -0.44, 0.88), b_arm_l)

    b_arm_r = make_bone("UpperArm.R", (-0.21, -0.04, 1.28), (-0.20, -0.20, 1.02), b_spine)
    b_fore_r = make_bone("Forearm.R", (-0.20, -0.20, 1.02), (-0.03, -0.44, 0.88), b_arm_r)
    b_gun = make_bone("WheelGunGrip.R", (0.0, -0.44, 0.88), (0.0, -0.78, 0.86), b_fore_r)

    b_thigh_l = make_bone("Thigh.L", ( 0.13, 0.02, 0.80), ( 0.13, -0.10, 0.45), b_pelvis)
    b_shin_l = make_bone("Shin.L", ( 0.13, -0.10, 0.45), ( 0.13,  0.02, 0.04), b_thigh_l)

    b_thigh_r = make_bone("Thigh.R", (-0.13, 0.02, 0.80), (-0.13, -0.10, 0.45), b_pelvis)
    b_shin_r = make_bone("Shin.R", (-0.13, -0.10, 0.45), (-0.13,  0.02, 0.04), b_thigh_r)

    bpy.ops.object.mode_set(mode="OBJECT")

    bm_crew = bmesh.new()
    deform_layer = bm_crew.verts.layers.deform.verify()

    bone_names = [
        "Root", "Pelvis", "Spine", "Head",
        "UpperArm.L", "Forearm.L", "UpperArm.R", "Forearm.R", "WheelGunGrip.R",
        "Thigh.L", "Shin.L", "Thigh.R", "Shin.R",
    ]
    b_idx = {bn: idx for idx, bn in enumerate(bone_names)}

    def tag_new_verts(start_v_idx, bone_name, mat_idx):
        bm_crew.verts.ensure_lookup_table()
        bm_crew.faces.ensure_lookup_table()
        gid = b_idx[bone_name]
        for v in list(bm_crew.verts)[start_v_idx:]:
            v[deform_layer][gid] = 1.0
        for f in bm_crew.faces:
            if all(v.index >= start_v_idx for v in f.verts):
                f.material_index = mat_idx

    # Slots: 0=NomexSuit, 1=SuitStripe, 2=CarbonHelmet, 3=IridiumVisor, 4=PaoliGunBody, 5=PaoliAnodized
    v0 = len(bm_crew.verts)
    add_box(bm_crew, 0.0, 0.02, 0.86, 0.34, 0.23, 0.19)
    tag_new_verts(v0, "Pelvis", 0)

    v0 = len(bm_crew.verts)
    add_box(bm_crew, 0.0, -0.03, 1.14, 0.40, 0.25, 0.40)
    tag_new_verts(v0, "Spine", 0)

    v0 = len(bm_crew.verts)
    add_box(bm_crew, 0.0, -0.16, 1.18, 0.37, 0.022, 0.095)
    add_box(bm_crew, -0.18, -0.03, 1.345, 0.09, 0.22, 0.025)
    add_box(bm_crew,  0.18, -0.03, 1.345, 0.09, 0.22, 0.025)
    tag_new_verts(v0, "Spine", 1)

    # Aero Pit Helmet, Top Vent, Comms Headset Muff & Chrome Visor
    v0 = len(bm_crew.verts)
    ret_ch = bmesh.ops.create_uvsphere(bm_crew, u_segments=26, v_segments=18, radius=0.154)
    bmesh.ops.scale(bm_crew, vec=(0.94, 1.08, 0.98), verts=ret_ch["verts"])
    bmesh.ops.translate(bm_crew, vec=(0.0, -0.05, 1.49), verts=ret_ch["verts"])
    add_box(bm_crew, 0.0, -0.01, 1.635, 0.08, 0.18, 0.024)
    tag_new_verts(v0, "Head", 2)

    v0 = len(bm_crew.verts)
    ret_cv = bmesh.ops.create_uvsphere(bm_crew, u_segments=22, v_segments=14, radius=0.148)
    bmesh.ops.scale(bm_crew, vec=(0.89, 1.05, 0.52), verts=ret_cv["verts"])
    bmesh.ops.translate(bm_crew, vec=(0.0, -0.106, 1.486), verts=ret_cv["verts"])
    tag_new_verts(v0, "Head", 3)

    limbs = [
        (( 0.21, -0.04, 1.28), ( 0.22, -0.22, 1.04), (0.064, 0.064), "UpperArm.L", 0),
        (( 0.22, -0.22, 1.04), ( 0.08, -0.44, 0.88), (0.052, 0.052), "Forearm.L", 0),
        ((-0.21, -0.04, 1.28), (-0.20, -0.20, 1.02), (0.064, 0.064), "UpperArm.R", 0),
        ((-0.20, -0.20, 1.02), (-0.03, -0.44, 0.88), (0.052, 0.052), "Forearm.R", 0),
        (( 0.13,  0.02, 0.80), ( 0.13, -0.10, 0.45), (0.080, 0.080), "Thigh.L", 0),
        (( 0.13, -0.10, 0.45), ( 0.13,  0.02, 0.05), (0.064, 0.064), "Shin.L", 0),
        ((-0.13,  0.02, 0.80), (-0.13, -0.10, 0.45), (0.080, 0.080), "Thigh.R", 0),
        ((-0.13, -0.10, 0.45), (-0.13,  0.02, 0.05), (0.064, 0.064), "Shin.R", 0),
    ]
    for (p0, p1, rad, bname, midx) in limbs:
        v0 = len(bm_crew.verts)
        add_strut(bm_crew, p0, p1, rad[0], rad[1], segs=12)
        tag_new_verts(v0, bname, midx)

    # Moulded Carbon Knee Pads & Racing Boots
    for sx, bname in ((0.13, "Shin.L"), (-0.13, "Shin.R")):
        v0 = len(bm_crew.verts)
        add_box(bm_crew, sx, -0.155, 0.45, 0.135, 0.075, 0.16)
        add_box(bm_crew, sx, -0.035, 0.05, 0.115, 0.23, 0.10)
        tag_new_verts(v0, bname, 4)

    # High-Detail Paoli Hurricane Pneumatic Wheel Gun on `WheelGunGrip.R`!
    v0 = len(bm_crew.verts)
    add_strut(bm_crew, (0.0, -0.32, 0.88), (0.0, -0.58, 0.872), 0.058, 0.062, segs=18)  # Finned magnesium motor housing
    add_strut(bm_crew, (0.0, -0.44, 0.87), (0.0, -0.42, 0.72), 0.024, 0.032, segs=10)   # Main pistol trigger handle
    add_strut(bm_crew, (0.0, -0.52, 0.89), (0.11, -0.50, 0.91), 0.018, 0.018, segs=10)  # Left-hand steady side-handle
    add_strut(bm_crew, (0.0, -0.42, 0.72), (0.0, -0.34, 0.62), 0.016, 0.016, segs=10)   # Swivel air-inlet whip fitting
    add_box(bm_crew, 0.0, -0.46, 0.948, 0.050, 0.20, 0.030)                             # Top LED status telemetry rail
    tag_new_verts(v0, "WheelGunGrip.R", 4)

    v0 = len(bm_crew.verts)
    add_strut(bm_crew, (0.0, -0.58, 0.872), (0.0, -0.70, 0.868), 0.044, 0.044, segs=16) # Anodized blue impact clutch nose
    add_strut(bm_crew, (0.0, -0.70, 0.868), (0.0, -0.80, 0.865), 0.048, 0.048, segs=16) # Flared center-lock titanium socket
    tag_new_verts(v0, "WheelGunGrip.R", 5)

    bmesh.ops.recalc_face_normals(bm_crew, faces=bm_crew.faces)
    crew_mesh = bpy.data.meshes.new("PitCrew_Mechanic_Mesh")
    bm_crew.to_mesh(crew_mesh)
    bm_crew.free()

    crew_obj = bpy.data.objects.new("PitCrew_Mechanic", crew_mesh)
    bpy.context.collection.objects.link(crew_obj)
    for m in [mat_suit, mat_suit_stripe, mat_helm, mat_visor, mat_gun_body, mat_gun_anod]:
        crew_obj.data.materials.append(m)
    for p in crew_obj.data.polygons:
        p.use_smooth = True

    for bn in bone_names:
        crew_obj.vertex_groups.new(name=bn)

    unwrap_with_4px_padding(crew_obj)

    crew_obj.parent = arm_obj
    arm_mod = crew_obj.modifiers.new(name="Armature", type="ARMATURE")
    arm_mod.object = arm_obj

    arm_obj.location = (1.55, 1.48, 0.0)
    arm_obj.rotation_euler = (0.0, 0.0, -math.pi * 0.5)
    bpy.ops.object.select_all(action="DESELECT")
    arm_obj.select_set(True)
    crew_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    # --------------------------------------------------------------------------
    # H. Bake 3 Multi-Stage Smooth NLA Actions (`Pit_Idle_Ready`, `Pit_Tire_Swap`, `Pit_Jack_And_Refuel`)
    # --------------------------------------------------------------------------
    arm_obj.animation_data_create()
    pb = arm_obj.pose.bones
    for b in pb:
        b.rotation_mode = "QUATERNION"

    def reset_pose():
        for b in pb:
            b.location = (0.0, 0.0, 0.0)
            b.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)

    def set_rot_deg(bname, rx, ry, rz):
        pb[bname].rotation_quaternion = Euler((math.radians(rx), math.radians(ry), math.radians(rz)), "XYZ").to_quaternion()

    def key_all(frame_num):
        for b in pb:
            b.keyframe_insert(data_path="location", frame=frame_num)
            b.keyframe_insert(data_path="rotation_quaternion", frame=frame_num)

    def push_action_to_nla(act_name, build_keys_fn, end_frame):
        act = bpy.data.actions.new(name=act_name)
        arm_obj.animation_data.action = act
        reset_pose()
        build_keys_fn()
        track = arm_obj.animation_data.nla_tracks.new()
        track.name = act_name
        strip = track.strips.new(act_name, 1, act)
        strip.frame_end = end_frame
        if hasattr(strip, "action_slot") and hasattr(arm_obj.animation_data, "action_slot"):
            if arm_obj.animation_data.action_slot is not None:
                strip.action_slot = arm_obj.animation_data.action_slot

    def keys_idle():
        reset_pose()
        set_rot_deg("Spine", 8.0, 0.0, 0.0)
        set_rot_deg("Thigh.L", -12.0, 0.0, 0.0)
        set_rot_deg("Shin.L", 16.0, 0.0, 0.0)
        set_rot_deg("Thigh.R", -12.0, 0.0, 0.0)
        set_rot_deg("Shin.R", 16.0, 0.0, 0.0)
        pb["Pelvis"].location = (0.0, 0.0, -0.03)
        key_all(1)

        pb["Pelvis"].location = (0.0, 0.0, -0.065)
        set_rot_deg("Spine", 12.0, 0.0, 0.0)
        set_rot_deg("Head", -6.0, 0.0, 8.0)
        pb["WheelGunGrip.R"].location = (-0.02, 0.0, 0.015)
        key_all(24)

        reset_pose()
        set_rot_deg("Spine", 8.0, 0.0, 0.0)
        set_rot_deg("Thigh.L", -12.0, 0.0, 0.0)
        set_rot_deg("Shin.L", 16.0, 0.0, 0.0)
        set_rot_deg("Thigh.R", -12.0, 0.0, 0.0)
        set_rot_deg("Shin.R", 16.0, 0.0, 0.0)
        pb["Pelvis"].location = (0.0, 0.0, -0.03)
        key_all(48)

    def keys_tire_swap():
        reset_pose()
        key_all(1)

        # Frame 12: Drop rapidly onto kneeling pad & present Paoli socket to wheel nut
        pb["Pelvis"].location = (-0.20, 0.0, -0.35)
        set_rot_deg("Thigh.L", -54.0, 0.0, 0.0)
        set_rot_deg("Shin.L", 70.0, 0.0, 0.0)
        set_rot_deg("Thigh.R", -28.0, 0.0, 0.0)
        set_rot_deg("Shin.R", 80.0, 0.0, 0.0)
        set_rot_deg("Spine", 20.0, 0.0, 0.0)
        set_rot_deg("UpperArm.R", 26.0, 0.0, 0.0)
        set_rot_deg("UpperArm.L", 24.0, 0.0, 0.0)
        key_all(12)

        # Frame 20: Zip-off old wheel nut (thrust + high-RPM recoil)
        pb["WheelGunGrip.R"].location = (-0.14, 0.0, 0.0)
        key_all(20)
        # Frame 28: Retract slightly as tire-off / tire-on swap passes
        pb["WheelGunGrip.R"].location = (-0.02, 0.0, 0.03)
        set_rot_deg("Spine", 14.0, 0.0, 0.0)
        key_all(28)
        # Frame 38: Zip-on fresh Pirelli wheel nut (second torque burst!)
        set_rot_deg("Spine", 21.0, 0.0, 0.0)
        pb["WheelGunGrip.R"].location = (-0.15, 0.0, 0.0)
        key_all(38)
        # Frame 43: Torque lock recoil
        pb["WheelGunGrip.R"].location = (-0.08, 0.0, 0.01)
        key_all(43)

        # Frame 52: Spring up & raise left arm high ("WHEEL LOCKED — CLEAR!")
        reset_pose()
        set_rot_deg("UpperArm.L", -122.0, 0.0, -18.0)
        set_rot_deg("Forearm.L", -18.0, 0.0, 0.0)
        key_all(52)

        reset_pose()
        key_all(60)

    def keys_jack_refuel():
        reset_pose()
        key_all(1)

        # Frame 14: Lunge forward & press down quick-lift jack / dry-break coupling
        pb["Pelvis"].location = (-0.24, 0.0, -0.16)
        set_rot_deg("Spine", 26.0, 0.0, 0.0)
        set_rot_deg("UpperArm.L", 36.0, 0.0, 0.0)
        set_rot_deg("UpperArm.R", 36.0, 0.0, 0.0)
        set_rot_deg("Thigh.L", -22.0, 0.0, 0.0)
        set_rot_deg("Shin.L", 28.0, 0.0, 0.0)
        key_all(14)

        # Frame 42: Hold car steady on jack while gunners torque all 4 corners
        pb["Pelvis"].location = (-0.25, 0.0, -0.18)
        set_rot_deg("Spine", 28.0, 0.0, 0.0)
        key_all(42)

        # Frame 50: Pull jack release trigger & step clear of launching F1 car!
        reset_pose()
        pb["Pelvis"].location = (0.10, 0.0, 0.0)
        set_rot_deg("UpperArm.L", -95.0, 0.0, -14.0)
        key_all(50)

        reset_pose()
        key_all(60)

    push_action_to_nla("Pit_Idle_Ready", keys_idle, 48)
    push_action_to_nla("Pit_Tire_Swap", keys_tire_swap, 60)
    push_action_to_nla("Pit_Jack_And_Refuel", keys_jack_refuel, 60)
    arm_obj.animation_data.action = None
    reset_pose()

    blend_path = os.path.join(OUT_BLEND, "pit_crew_rig.blend")
    glb_webgl = os.path.join(OUT_MODELS_WEBGL, "pit_crew_rig.glb")
    glb_godot = os.path.join(OUT_MODELS_GODOT, "pit_crew_rig.glb")

    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(
        filepath=glb_webgl,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
        export_skins=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
    )
    shutil.copy2(glb_webgl, glb_godot)


# ==============================================================================
# MAIN HEADLESS PIPELINE ENTRYPOINT
# ==============================================================================

if __name__ == "__main__":
    log_path = os.path.join(OUT_BLEND, "build_vehicles_pit.log")
    try:
        build_godot_f1_car_2026()
        build_pit_garage_and_rigged_crew()
        with open(log_path, "w", encoding="utf-8") as f:
            f.write("SUCCESS: A+ f1_car_2026.glb AND pit_crew_rig.glb EXPORTED TO BOTH WEBGL & GODOT!\n")
    except Exception:
        with open(log_path, "w", encoding="utf-8") as f:
            f.write(traceback.format_exc())
        raise
