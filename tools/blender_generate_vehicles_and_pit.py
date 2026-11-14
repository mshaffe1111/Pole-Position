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
    Authentic 48-segment 18-inch Pirelli P-Zero racing slick + non-glowing satin 3-arc sidewall markings +
    matte-carbon inner barrel & sculpted 2026 aero wheel-wake shroud + forged 10-spoke Y-split concave
    BBS/OZ magnesium rim + machined bead-lock lip + knurled anodized center-lock nut.
    Materials expected on `bm`: 0=Rubber, 1=CompoundStripe, 2=ForgedRim, 3=CenterLockNut, 4=CarbonBarrel.
    """
    half_w = 0.202 if is_rear else 0.170
    w_segs = 48
    prof = [
        (-half_w * 0.91, 0.194),
        (-half_w * 0.97, 0.214),
        (-half_w * 1.00, 0.252),
        (-half_w * 0.985, 0.298),
        (-half_w * 0.92, 0.330),
        (-half_w * 0.72, 0.343),
        (-half_w * 0.36, 0.3465),
        ( 0.000,         0.3475),
        ( half_w * 0.36, 0.3465),
        ( half_w * 0.72, 0.343),
        ( half_w * 0.92, 0.330),
        ( half_w * 0.985, 0.298),
        ( half_w * 1.00, 0.252),
        ( half_w * 0.97, 0.214),
        ( half_w * 0.91, 0.194),
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

    # Crisp 10mm (r = 0.249..0.259) Pirelli P-Zero 3-arc sidewall ink bands (inboard + outboard, non-emissive)
    for s_side in (-1.0, 1.0):
        xw = cx_bl + s_side * (half_w * 1.004)
        for arc_i in range(3):
            b_deg = arc_i * 120.0 + 14.0
            for step in range(12):
                a0 = math.radians(b_deg + step * 7.5)
                a1 = math.radians(b_deg + (step + 1) * 7.5)
                v0 = bm.verts.new((xw, yb + math.cos(a0) * 0.249, wy_g + math.sin(a0) * 0.249))
                v1 = bm.verts.new((xw, yb + math.cos(a0) * 0.259, wy_g + math.sin(a0) * 0.259))
                v2 = bm.verts.new((xw, yb + math.cos(a1) * 0.259, wy_g + math.sin(a1) * 0.259))
                v3 = bm.verts.new((xw, yb + math.cos(a1) * 0.249, wy_g + math.sin(a1) * 0.249))
                bm.faces.new([v0, v1, v2, v3] if s_side > 0 else [v0, v3, v2, v1])
    f_mark = tag_faces_from(bm, f_mark, 1)

    # Forged 18-inch concave 10-spoke Y-split magnesium rim (multi-step outer bead flange + inboard flange + central hub)
    lip_x_in = cx_bl + out_sign * (half_w * 0.80)
    lip_x_mid = cx_bl + out_sign * (half_w * 0.90)
    lip_x_out = cx_bl + out_sign * (half_w * 0.955)
    lip_rings = []
    for (lx, lr) in (
        (lip_x_in, 0.184),
        (lip_x_mid, 0.193),
        (lip_x_out, 0.197),
        (lip_x_out, 0.187),
        (lip_x_mid, 0.182),
        (lip_x_in, 0.178),
    ):
        ring = []
        for i in range(40):
            a = (2.0 * math.pi * i) / 40.0
            ring.append((lx, yb + math.cos(a) * lr, wy_g + math.sin(a) * lr))
        lip_rings.append(ring)
    add_loft(bm, lip_rings, closed_ring=True, cap_start=False, cap_end=False)

    # Inboard rim bead flange
    in_lip_a = cx_bl - out_sign * (half_w * 0.84)
    in_lip_b = cx_bl - out_sign * (half_w * 0.94)
    in_rings = []
    for (lx, lr) in ((in_lip_a, 0.180), (in_lip_b, 0.195), (in_lip_b, 0.185), (in_lip_a, 0.176)):
        ring = []
        for i in range(32):
            a = (2.0 * math.pi * i) / 32.0
            ring.append((lx, yb + math.cos(a) * lr, wy_g + math.sin(a) * lr))
        in_rings.append(ring)
    add_loft(bm, in_rings, closed_ring=True, cap_start=False, cap_end=False)

    # Central machined forged hub bowl + drive-peg ring + 10 Y-split spokes (20 sculpted branches)
    add_strut(
        bm,
        (cx_bl + out_sign * (half_w * 0.34), yb, wy_g),
        (cx_bl + out_sign * (half_w * 0.60), yb, wy_g),
        0.068,
        0.068,
        segs=24,
    )
    for sp_i in range(10):
        base_ang = (2.0 * math.pi * sp_i) / 10.0
        cy0, cz0 = math.cos(base_ang), math.sin(base_ang)
        # Root stem from hub bowl to Y-junction
        add_swept_tube(
            bm,
            [
                (cx_bl + out_sign * (half_w * 0.50), yb + cy0 * 0.056, wy_g + cz0 * 0.056),
                (cx_bl + out_sign * (half_w * 0.64), yb + cy0 * 0.098, wy_g + cz0 * 0.098),
            ],
            [(0.015, 0.018), (0.013, 0.016)],
            segs=6,
            up_hint=(0.0, -cz0, cy0),
        )
        for branch in (-0.132, 0.132):
            ang_tip = base_ang + branch
            cy1, cz1 = math.cos(ang_tip), math.sin(ang_tip)
            add_swept_tube(
                bm,
                [
                    (cx_bl + out_sign * (half_w * 0.62), yb + cy0 * 0.094, wy_g + cz0 * 0.094),
                    (cx_bl + out_sign * (half_w * 0.78), yb + 0.5 * (cy0 + cy1) * 0.142, wy_g + 0.5 * (cz0 + cz1) * 0.142),
                    (cx_bl + out_sign * (half_w * 0.92), yb + cy1 * 0.188, wy_g + cz1 * 0.188),
                ],
                [(0.011, 0.014), (0.009, 0.012), (0.008, 0.011)],
                segs=6,
                up_hint=(0.0, -cz0, cy0),
            )
    f_mark = tag_faces_from(bm, f_mark, 2)

    # Knurled anodized center-lock wheel nut + conical spindle nose
    nut_rings = []
    for (nx_f, nr) in ((0.52, 0.046), (0.72, 0.044), (0.86, 0.036), (0.93, 0.024)):
        ring = []
        for i in range(16):
            a = (2.0 * math.pi * i) / 16.0
            rk = nr * (1.0 + (0.03 if i % 2 == 0 else -0.02))
            ring.append((cx_bl + out_sign * (half_w * nx_f), yb + math.cos(a) * rk, wy_g + math.sin(a) * rk))
        nut_rings.append(ring)
    add_loft(bm, nut_rings, closed_ring=True, cap_start=True, cap_end=True)
    f_mark = tag_faces_from(bm, f_mark, 3)

    # Matte-carbon inner barrel + sculpted 2026 outer aero wheel-wake rim shroud ring
    barrel_rings = []
    for (bx, br) in (
        (cx_bl - half_w * 0.86, 0.179),
        (cx_bl + half_w * 0.82, 0.179),
        (cx_bl + half_w * 0.82, 0.173),
        (cx_bl - half_w * 0.86, 0.173),
    ):
        ring = []
        for i in range(36):
            a = (2.0 * math.pi * i) / 36.0
            ring.append((bx, yb + math.cos(a) * br, wy_g + math.sin(a) * br))
        barrel_rings.append(ring)
    add_loft(bm, barrel_rings, closed_ring=True, cap_start=False, cap_end=False)

    aero_x_in = cx_bl + out_sign * (half_w * 0.84)
    aero_x_out = cx_bl + out_sign * (half_w * 0.905)
    shroud_rings = []
    for (sx_w, sr) in ((aero_x_in, 0.148), (aero_x_out, 0.168), (aero_x_out, 0.186), (aero_x_in, 0.182)):
        ring = []
        for i in range(32):
            a = (2.0 * math.pi * i) / 32.0
            ring.append((sx_w, yb + math.cos(a) * sr, wy_g + math.sin(a) * sr))
        shroud_rings.append(ring)
    add_loft(bm, shroud_rings, closed_ring=True, cap_start=False, cap_end=False)
    tag_faces_from(bm, f_mark, 4)


def build_godot_f1_car_2026():
    reset_scene()
    alb_carbon, nrm_carbon = build_procedural_carbon_maps(size=256)

    # Authentic Motorsport PBR Palette — ZERO cartoon glow on tires, paint, carbon, Nomex, or exhaust
    mat_primary = make_pbr_mat("F1_Livery_Primary", hex_lin("#d8101c"), metallic=0.38, roughness=0.16, clearcoat=0.92, clearcoat_roughness=0.05)
    mat_accent = make_pbr_mat("F1_Livery_Accent", hex_lin("#f4f6fa"), metallic=0.22, roughness=0.18, clearcoat=0.88, clearcoat_roughness=0.06)
    mat_carbon = make_pbr_mat(
        "F1_Carbon_Weave",
        hex_lin("#161a21"),
        metallic=0.16,
        roughness=0.38,
        clearcoat=0.22,
        clearcoat_roughness=0.24,
        albedo_img=alb_carbon,
        normal_img=nrm_carbon,
        uv_tile=16.0,
    )
    mat_titanium = make_pbr_mat("F1_Titanium_Aero", hex_lin("#8d96a3"), metallic=0.92, roughness=0.24, clearcoat=0.18)
    mat_exhaust = make_pbr_mat(
        "F1_Titanium_Exhaust",
        hex_lin("#a3998d"),
        metallic=0.94,
        roughness=0.22,
        emission_strength=0.0,
    )
    mat_mirror = make_pbr_mat("F1_Mirror_Chrome", hex_lin("#eef5ff"), metallic=1.0, roughness=0.015, clearcoat=1.0, clearcoat_roughness=0.005)
    mat_helmet = make_pbr_mat("F1_Helmet_Shell", hex_lin("#00bae6"), metallic=0.38, roughness=0.15, clearcoat=0.95, clearcoat_roughness=0.04)
    mat_visor = make_pbr_mat("F1_Visor_Chrome", hex_lin("#081324"), metallic=0.98, roughness=0.04, clearcoat=1.0, clearcoat_roughness=0.01)
    mat_nomex_red = make_pbr_mat("F1_Driver_Nomex", hex_lin("#c4121f"), metallic=0.02, roughness=0.80)
    mat_glove_grip = make_pbr_mat("F1_Glove_Suede", hex_lin("#171a20"), metallic=0.02, roughness=0.84)
    mat_foam = make_pbr_mat("F1_Cockpit_Foam", hex_lin("#15181f"), metallic=0.02, roughness=0.72)
    mat_harness = make_pbr_mat("F1_Harness_Belt", hex_lin("#ebb800"), metallic=0.08, roughness=0.58)
    mat_oled = make_pbr_mat(
        "F1_Cockpit_OLED",
        hex_lin("#061018"),
        metallic=0.10,
        roughness=0.12,
        clearcoat=0.75,
        emission=hex_lin("#00f096"),
        emission_strength=1.8,
    )
    mat_rpm_led = make_pbr_mat(
        "F1_Shift_LED",
        hex_lin("#00d8ff"),
        metallic=0.08,
        roughness=0.14,
        emission=hex_lin("#00d8ff"),
        emission_strength=2.8,
    )
    mat_rain = make_pbr_mat(
        "F1_Rain_Light",
        hex_lin("#ff1822"),
        metallic=0.08,
        roughness=0.16,
        emission=hex_lin("#ff1822"),
        emission_strength=3.6,
    )
    # Matte vulcanized Pirelli tire rubber & non-glowing satin sidewall compound ink
    mat_rubber = make_pbr_mat("F1_Tire_Rubber", hex_lin("#16181d"), metallic=0.03, roughness=0.76)
    mat_stripe = make_pbr_mat(
        "F1_Compound_Stripe",
        hex_lin("#e21e28"),
        metallic=0.04,
        roughness=0.48,
        clearcoat=0.15,
        clearcoat_roughness=0.30,
        emission_strength=0.0,
    )
    mat_rim = make_pbr_mat("F1_Wheel_Rim", hex_lin("#242933"), metallic=0.88, roughness=0.24, clearcoat=0.30)
    mat_caliper = make_pbr_mat("F1_Caliper_Alloy", hex_lin("#dc1924"), metallic=0.76, roughness=0.24, clearcoat=0.65)
    mat_rotor = make_pbr_mat("F1_Brake_Rotor", hex_lin("#4a4542"), metallic=0.80, roughness=0.32)
    mat_hull = make_pbr_mat("F1_Collision_Debug", hex_lin("#00ff88"), metallic=0.0, roughness=0.9)

    # --------------------------------------------------------------------------
    # 1. `Body` ([0, 0, 0] — 17-Station Sculpted Monocoque, 10-Station Deep-Undercut Sidepods,
    #    Titanium Floor-Edge Vortex Strakes, 8-Strake Diffuser, T-Cam, Exhaust, Rain Light)
    # --------------------------------------------------------------------------
    bm_body = bmesh.new()
    # Slots: 0=Primary, 1=Accent, 2=Carbon, 3=Titanium, 4=Exhaust, 5=RainLight
    mono_stations = [
        (-2.50, 0.038, 0.052, 0.032, 0.124, 0.146, 0.168),
        (-2.34, 0.064, 0.088, 0.058, 0.126, 0.166, 0.208),
        (-2.12, 0.098, 0.132, 0.092, 0.130, 0.194, 0.258),
        (-1.84, 0.146, 0.188, 0.136, 0.134, 0.232, 0.332),
        (-1.52, 0.206, 0.256, 0.186, 0.128, 0.278, 0.420),
        (-1.20, 0.268, 0.322, 0.230, 0.112, 0.306, 0.486),
        (-0.88, 0.312, 0.368, 0.258, 0.098, 0.320, 0.518),
        (-0.56, 0.340, 0.394, 0.272, 0.092, 0.330, 0.532),
        (-0.24, 0.348, 0.402, 0.270, 0.090, 0.344, 0.548),
        ( 0.04, 0.342, 0.392, 0.224, 0.090, 0.402, 0.732),
        ( 0.26, 0.330, 0.380, 0.192, 0.090, 0.432, 0.814),
        ( 0.56, 0.288, 0.336, 0.150, 0.094, 0.400, 0.722),
        ( 0.88, 0.236, 0.280, 0.112, 0.102, 0.362, 0.630),
        ( 1.20, 0.182, 0.220, 0.082, 0.114, 0.318, 0.532),
        ( 1.54, 0.128, 0.160, 0.054, 0.128, 0.274, 0.426),
        ( 1.82, 0.088, 0.110, 0.038, 0.146, 0.248, 0.354),
        ( 2.02, 0.064, 0.080, 0.028, 0.160, 0.234, 0.318),
    ]
    m_rings = []
    for (y, hwb, hwm, hwt, zb, zm, zt) in mono_stations:
        m_rings.append([
            (-hwb, y, zb),
            ( hwb, y, zb),
            ( hwm * 0.92, y, zb + 0.32 * (zm - zb)),
            ( hwm, y, zm - 0.032),
            ( hwm * 0.96, y, zm + 0.048),
            ( hwt, y, zt),
            (-hwt, y, zt),
            (-hwm * 0.96, y, zm + 0.048),
            (-hwm, y, zm - 0.032),
            (-hwm * 0.92, y, zb + 0.32 * (zm - zb)),
        ])
    add_loft(bm_body, m_rings)

    # 10-Station Deep-Undercut 2026 Ground-Effect Sidepods with Sculpted Downwash Gullies
    for side in (-1.0, 1.0):
        sp_stations = [
            (-0.76, 0.28, 0.48, 0.73, 0.71, 0.23, 0.37, 0.490, 0.000),
            (-0.62, 0.30, 0.54, 0.80, 0.78, 0.18, 0.35, 0.508, 0.010),
            (-0.44, 0.30, 0.58, 0.84, 0.80, 0.14, 0.33, 0.508, 0.020),
            (-0.20, 0.30, 0.62, 0.85, 0.78, 0.11, 0.31, 0.494, 0.032),
            ( 0.06, 0.29, 0.62, 0.82, 0.73, 0.10, 0.29, 0.470, 0.042),
            ( 0.34, 0.26, 0.57, 0.73, 0.63, 0.10, 0.27, 0.434, 0.046),
            ( 0.64, 0.22, 0.48, 0.61, 0.51, 0.11, 0.26, 0.390, 0.038),
            ( 0.96, 0.17, 0.38, 0.47, 0.38, 0.12, 0.24, 0.340, 0.026),
            ( 1.30, 0.12, 0.26, 0.33, 0.26, 0.135, 0.215, 0.288, 0.014),
            ( 1.66, 0.08, 0.14, 0.18, 0.14, 0.155, 0.195, 0.242, 0.000),
        ]
        sp_rings = []
        for (y, xin, xob, xom, xot, zb, zm, zt, dip) in sp_stations:
            pts = [
                (side * xin, y, zb),
                (side * xob, y, zb + 0.028),
                (side * xom, y, zm),
                (side * xot, y, zt),
                (side * (0.35 * xin + 0.65 * xot), y, zt - dip),
                (side * (0.68 * xin + 0.32 * xot), y, zt - dip * 0.75),
                (side * xin, y, zt + 0.012),
            ]
            if side < 0:
                pts = list(reversed(pts))
            sp_rings.append(pts)
        add_loft(bm_body, sp_rings)

    f_mark = tag_faces_from(bm_body, 0, 0)

    # Sculpted dorsal aero sharkfin + nosecone accent spear + roll-hoop airbox intake bezel (slot 1 = Accent)
    shark_rings = [
        [(-0.010, 0.28, 0.808), (0.010, 0.28, 0.808), (0.007, 0.30, 0.842), (-0.007, 0.30, 0.842)],
        [(-0.010, 0.96, 0.625), (0.010, 0.96, 0.625), (0.007, 0.96, 0.775), (-0.007, 0.96, 0.775)],
        [(-0.009, 1.64, 0.405), (0.009, 1.64, 0.405), (0.006, 1.64, 0.720), (-0.006, 1.64, 0.720)],
    ]
    add_loft(bm_body, shark_rings)
    add_box(bm_body, 0.0, -1.58, 0.362, 0.142, 1.48, 0.078)
    add_box(bm_body, 0.0, 0.13, 0.758, 0.192, 0.082, 0.122)
    f_mark = tag_faces_from(bm_body, f_mark, 1)

    # Ground-effect Venturi floor, tea-tray splitter bib, S-duct nose slot, airbox splitter,
    # 4 forward floor fences per side, 8-strake rear diffuser, sidepod inlet scoops,
    # 8 cooling louvres per side & overhead FOM T-Cam pod (slot 2 = Carbon)
    add_box(bm_body, 0.0, 0.10, 0.066, 1.68, 2.94, 0.028)
    add_box(bm_body, 0.0, -1.48, 0.058, 0.42, 0.56, 0.020)  # Tea-tray splitter bib
    add_box(bm_body, 0.0, -1.08, 0.502, 0.18, 0.06, 0.016, rot_euler=(math.radians(16.0), 0.0, 0.0))  # Nose S-duct exit slot
    add_box(bm_body, 0.0, 0.095, 0.758, 0.156, 0.036, 0.096)  # Roll-hoop dark intake cavity
    add_box(bm_body, 0.0, 0.088, 0.758, 0.014, 0.052, 0.094)  # Roll-hoop central triangular splitter web
    add_box(bm_body, 0.0, 1.80, 0.148, 1.28, 0.58, 0.152)     # Rear Venturi diffuser roof
    for sx in (-0.58, -0.44, -0.30, -0.16, 0.16, 0.30, 0.44, 0.58):
        add_box(bm_body, sx, 1.83, 0.122, 0.014, 0.52, 0.146)
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
                (0.005, 0.042),
                segs=6,
                up_hint=(0, 0, 1),
            )
        # Sidepod carbon overbite inlet lip, vertical cheek vane & recessed dark radiator baffle
        add_box(bm_body, side * 0.54, -0.765, 0.490, 0.45, 0.15, 0.016)
        add_box(bm_body, side * 0.755, -0.725, 0.395, 0.016, 0.16, 0.19)
        add_box(bm_body, side * 0.53, -0.742, 0.368, 0.40, 0.028, 0.21)
        # Sculpted carbon floor-edge wing + longitudinal slot-gap knife
        add_box(bm_body, side * 0.848, 0.04, 0.086, 0.034, 2.02, 0.032)
        add_box(bm_body, side * 0.876, -0.12, 0.094, 0.016, 1.42, 0.014)
        # 8 angled cooling gill louvres along sidepod shoulder
        for g in range(8):
            add_box(
                bm_body,
                side * 0.45,
                -0.18 + g * 0.088,
                0.482 - g * 0.008,
                0.15,
                0.028,
                0.009,
                rot_euler=(math.radians(18.0), 0.0, 0.0),
            )
    # Overhead Roll-Hoop FOM T-Cam housing + twin lenses
    add_strut(bm_body, (0.0, 0.17, 0.798), (0.0, 0.17, 0.882), 0.012, 0.038, segs=8, up_hint=(1, 0, 0))
    add_box(bm_body, 0.0, 0.17, 0.890, 0.28, 0.068, 0.024)
    for side in (-1.0, 1.0):
        add_strut(bm_body, (side * 0.115, 0.125, 0.890), (side * 0.115, 0.185, 0.890), 0.013, 0.013, segs=10)
    f_mark = tag_faces_from(bm_body, f_mark, 2)

    # Titanium Floor-Edge Vortex Strakes, Bib Stay, Rear Floor Stay Rods & Skid Blocks (slot 3 = Titanium)
    add_strut(bm_body, (0.0, -1.42, 0.068), (0.0, -1.36, 0.132), 0.006, 0.006, segs=8)  # Tea-tray deflection stay
    for side in (-1.0, 1.0):
        for sv_i in range(5):
            y_sv = -0.62 + sv_i * 0.34
            add_box(
                bm_body,
                side * 0.874,
                y_sv,
                0.096,
                0.007,
                0.17,
                0.048,
                rot_euler=(0.0, 0.0, side * math.radians(14.0)),
            )
        add_strut(bm_body, (side * 0.34, 0.88, 0.36), (side * 0.83, 0.96, 0.095), 0.005, 0.005, segs=6)
    for y_skid in (-1.38, -0.35, 0.82):
        add_box(bm_body, 0.0, y_skid, 0.048, 0.14, 0.22, 0.010)
    f_mark = tag_faces_from(bm_body, f_mark, 3)

    # Thin-walled Inconel/Titanium Central Exhaust + Twin Wastegate Pipes (slot 4 = Exhaust)
    ex_rings = []
    for (ey, er_out) in ((1.76, 0.056), (2.06, 0.060), (2.10, 0.062), (2.10, 0.053), (1.88, 0.050)):
        ring = [(math.cos(2.0 * math.pi * i / 24) * er_out, ey, 0.352 + math.sin(2.0 * math.pi * i / 24) * er_out) for i in range(24)]
        ex_rings.append(ring)
    add_loft(bm_body, ex_rings, closed_ring=True, cap_start=True, cap_end=True)
    for side in (-1.0, 1.0):
        add_strut(bm_body, (side * 0.076, 1.83, 0.332), (side * 0.076, 2.08, 0.332), 0.024, 0.024, segs=16)
    f_mark = tag_faces_from(bm_body, f_mark, 4)

    # FIA 15-LED Rear Crash-Structure Rain Light Matrix + Carbon Crash Housing (slot 5 = RainLight)
    add_box(bm_body, 0.0, 2.074, 0.212, 0.054, 0.024, 0.112)
    tag_faces_from(bm_body, f_mark, 5)

    body_obj = finalize_godot_mesh(
        "Body",
        bm_body,
        [mat_primary, mat_accent, mat_carbon, mat_titanium, mat_exhaust, mat_rain],
        godot_pivot=(0.0, 0.0, 0.0),
        shade_smooth=True,
    )

    # --------------------------------------------------------------------------
    # 2. `Body/CockpitTub_Interior` ([0.0, 0.42, -0.35] — Crisp First-Person Survival Cell)
    # --------------------------------------------------------------------------
    bm_tub = bmesh.new()
    # Slots: 0=Carbon, 1=CockpitFoam, 2=DriverNomex, 3=HarnessBelt, 4=TitaniumBuckle
    add_box(bm_tub, 0.0, -0.36, 0.208, 0.46, 0.90, 0.022)         # Molded carbon floor pan
    add_box(bm_tub, 0.0, -0.80, 0.380, 0.44, 0.036, 0.32)         # Forward footwell bulkhead
    add_box(bm_tub, 0.0, -0.02, 0.400, 0.43, 0.052, 0.36, rot_euler=(math.radians(-26.0), 0.0, 0.0))  # Reclined carbon seat shell
    add_box(bm_tub, 0.0, -0.62, 0.492, 0.096, 0.30, 0.064)        # Carbon steering column shroud
    # HANS carbon yoke resting over driver collar
    for side in (-1.0, 1.0):
        add_swept_tube(
            bm_tub,
            [(side * 0.078, -0.08, 0.562), (side * 0.092, -0.18, 0.520), (side * 0.084, -0.26, 0.472)],
            (0.020, 0.008),
            segs=8,
            up_hint=(0, 0, 1),
        )
        add_box(bm_tub, side * 0.236, -0.38, 0.382, 0.030, 0.88, 0.28)    # Inner survival cell wall
        add_box(bm_tub, side * 0.246, -0.40, 0.534, 0.056, 0.84, 0.030)   # Sculpted upper cockpit coaming sill
    f_mark = tag_faces_from(bm_tub, 0, 0)

    # FIA impact-absorbing Confor-foam horseshoe headrest collar + lateral bolsters + leg splitter (slot 1 = Foam)
    headrest_arc = [
        (-0.206, -0.42, 0.556),
        (-0.208, -0.24, 0.568),
        (-0.198, -0.12, 0.582),
        (-0.138, -0.03, 0.594),
        ( 0.000,  0.01, 0.598),
        ( 0.138, -0.03, 0.594),
        ( 0.198, -0.12, 0.582),
        ( 0.208, -0.24, 0.568),
        ( 0.206, -0.42, 0.556),
    ]
    add_swept_tube(bm_tub, headrest_arc, (0.038, 0.034), segs=14)
    add_box(bm_tub, 0.0, -0.52, 0.42, 0.056, 0.26, 0.12)  # Center leg-keel Confor-foam pad
    f_mark = tag_faces_from(bm_tub, f_mark, 1)

    # Driver seated contoured Nomex torso & rounded deltoid shoulders (slot 2 = DriverNomex)
    torso_rings = [
        [(-0.15, -0.30, 0.30), (0.15, -0.30, 0.30), (0.16, -0.22, 0.40), (-0.16, -0.22, 0.40)],
        [(-0.175, -0.24, 0.42), (0.175, -0.24, 0.42), (0.175, -0.13, 0.51), (-0.175, -0.13, 0.51)],
        [(-0.145, -0.20, 0.51), (0.145, -0.20, 0.51), (0.135, -0.10, 0.555), (-0.135, -0.10, 0.555)],
    ]
    add_loft(bm_tub, torso_rings)
    for side in (-1.0, 1.0):
        add_swept_tube(
            bm_tub,
            [(side * 0.148, -0.18, 0.505), (side * 0.176, -0.28, 0.500), (side * 0.172, -0.34, 0.496)],
            [(0.056, 0.052), (0.052, 0.048), (0.048, 0.044)],
            segs=12,
        )
    f_mark = tag_faces_from(bm_tub, f_mark, 2)

    # 6-Point Sabelt FIA Racing Harness shoulder & lap belts (slot 3 = HarnessBelt)
    for side in (-1.0, 1.0):
        add_swept_tube(
            bm_tub,
            [
                (side * 0.084, -0.04, 0.558),
                (side * 0.092, -0.18, 0.508),
                (side * 0.062, -0.29, 0.415),
            ],
            (0.025, 0.006),
            segs=8,
            up_hint=(0, 0, 1),
        )
        add_swept_tube(
            bm_tub,
            [(side * 0.175, -0.28, 0.365), (side * 0.055, -0.30, 0.405)],
            (0.022, 0.006),
            segs=8,
            up_hint=(0, 0, 1),
        )
    f_mark = tag_faces_from(bm_tub, f_mark, 3)

    # Quick-release rotary harness cam-lock buckle & shoulder strap adjusters (slot 4 = Titanium)
    add_strut(bm_tub, (0.0, -0.295, 0.410), (0.0, -0.312, 0.415), 0.028, 0.028, segs=14)
    for side in (-1.0, 1.0):
        add_box(bm_tub, side * 0.082, -0.215, 0.482, 0.034, 0.022, 0.012, rot_euler=(math.radians(-24.0), 0.0, 0.0))
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
    # 3. `Body/Halo_Titanium` ([0.0, 0.68, -0.44] — Slim Grade-5 Titanium Hoop + Aero Fairings)
    # --------------------------------------------------------------------------
    bm_halo = bmesh.new()
    # Slots: 0=Titanium, 1=CarbonFairing, 2=LiveryAccentWinglet
    halo_arc = [
        (-0.205,  0.04, 0.562),
        (-0.244, -0.14, 0.634),
        (-0.240, -0.34, 0.668),
        (-0.182, -0.54, 0.682),
        (-0.084, -0.642, 0.686),
        ( 0.000, -0.672, 0.688),
        ( 0.084, -0.642, 0.686),
        ( 0.182, -0.54, 0.682),
        ( 0.240, -0.34, 0.668),
        ( 0.244, -0.14, 0.634),
        ( 0.205,  0.04, 0.562),
    ]
    add_swept_tube(bm_halo, halo_arc, (0.020, 0.019), segs=18)
    # Slim teardrop central front V-pillar (11mm X half-width for authentic Helmet-Cam apex sightline)
    add_swept_tube(
        bm_halo,
        [(0.0, -0.715, 0.518), (0.0, -0.694, 0.605), (0.0, -0.672, 0.686)],
        [(0.012, 0.036), (0.010, 0.032), (0.013, 0.038)],
        segs=12,
        up_hint=(1, 0, 0),
    )
    f_mark = tag_faces_from(bm_halo, 0, 0)

    # Swept carbon aero fairings, V-junction gusset & FIA high-speed driver-facing camera pod (slot 1 = Carbon)
    for side in (-1.0, 1.0):
        fairing_pts = [
            (side * 0.210,  0.02, 0.576),
            (side * 0.248, -0.18, 0.650),
            (side * 0.240, -0.38, 0.682),
            (side * 0.170, -0.56, 0.694),
        ]
        add_swept_tube(bm_halo, fairing_pts, (0.024, 0.006), segs=10, up_hint=(0, 0, 1))
    add_box(bm_halo, -0.042, -0.655, 0.668, 0.032, 0.044, 0.020)
    f_mark = tag_faces_from(bm_halo, f_mark, 1)

    # Upper Halo boomerang aero conditioning winglets (slot 2 = Accent)
    for side in (-1.0, 1.0):
        add_airfoil(bm_halo, [
            (side * 0.204, -0.16, -0.04, 0.654, 0.007, 0.008),
            (side * 0.254, -0.28, -0.16, 0.676, 0.007, 0.007),
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
    #    Dual aero stalks, outer vortex-conditioning shroud & recessed reflective mirror glass
    # --------------------------------------------------------------------------
    for (m_name, godot_x) in (("WingMirror_L", -0.54), ("WingMirror_R", 0.54)):
        s_bl = -1.0 if godot_x > 0 else 1.0
        bm_mir = bmesh.new()
        # Slots: 0=LiveryPrimary, 1=CarbonStalk, 2=MirrorChrome
        cowl_rings = [
            [
                (s_bl * 0.482, -0.568, 0.572),
                (s_bl * 0.594, -0.558, 0.574),
                (s_bl * 0.594, -0.558, 0.606),
                (s_bl * 0.482, -0.568, 0.604),
            ],
            [
                (s_bl * 0.464, -0.520, 0.562),
                (s_bl * 0.614, -0.512, 0.564),
                (s_bl * 0.614, -0.512, 0.618),
                (s_bl * 0.464, -0.520, 0.616),
            ],
            [
                (s_bl * 0.462, -0.478, 0.560),
                (s_bl * 0.616, -0.472, 0.562),
                (s_bl * 0.616, -0.472, 0.620),
                (s_bl * 0.462, -0.478, 0.618),
            ],
        ]
        if s_bl < 0:
            cowl_rings = [[list(p) for p in reversed(r)] for r in cowl_rings]
        add_loft(bm_mir, cowl_rings)
        f_mark = tag_faces_from(bm_mir, 0, 0)

        # Twin carbon aero stays + outer C-shaped aero vortex shroud
        add_strut(bm_mir, (s_bl * 0.285, -0.528, 0.545), (s_bl * 0.472, -0.516, 0.584), 0.005, 0.024, segs=8)
        add_strut(bm_mir, (s_bl * 0.555, -0.506, 0.490), (s_bl * 0.555, -0.506, 0.564), 0.005, 0.022, segs=8, up_hint=(1, 0, 0))
        add_box(bm_mir, s_bl * 0.542, -0.504, 0.625, 0.162, 0.072, 0.005)
        add_box(bm_mir, s_bl * 0.623, -0.504, 0.592, 0.005, 0.068, 0.062)
        f_mark = tag_faces_from(bm_mir, f_mark, 1)

        # Rear-facing high-metallic mirror glass pane
        add_box(bm_mir, s_bl * 0.538, -0.472, 0.590, 0.138, 0.005, 0.048)
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
    # 5. `Body/FrontWing` ([0.0, 0.10, -2.20]) + Separable Child Nodes
    #    `FrontWing_Endplate_L` ([-0.92, 0.19, -2.22]) & `FrontWing_Endplate_R` ([+0.92, 0.19, -2.22])
    #    enabling asymmetrical left/right wing damage in `src/models.js` & Godot!
    # --------------------------------------------------------------------------
    bm_fw = bmesh.new()
    # Slots: 0=Accent, 1=Primary, 2=Carbon, 3=Titanium
    for (yle, yte, z0, cam, thk) in [
        (-2.46, -2.24, 0.072, 0.008, 0.022),
        (-2.31, -2.13, 0.104, 0.011, 0.019),
        (-2.19, -2.04, 0.138, 0.014, 0.016),
        (-2.09, -1.96, 0.172, 0.016, 0.014),
    ]:
        add_airfoil(bm_fw, [
            (-0.916, yle + 0.058, yte + 0.044, z0 + 0.012, cam, thk * 0.84),
            (-0.640, yle + 0.028, yte + 0.022, z0 + 0.006, cam, thk * 0.92),
            (-0.320, yle + 0.004, yte + 0.006, z0 - 0.002, cam, thk * 0.98),
            ( 0.000, yle - 0.026, yte - 0.002, z0 - 0.010, cam, thk),
            ( 0.320, yle + 0.004, yte + 0.006, z0 - 0.002, cam, thk * 0.98),
            ( 0.640, yle + 0.028, yte + 0.022, z0 + 0.006, cam, thk * 0.92),
            ( 0.916, yle + 0.058, yte + 0.044, z0 + 0.012, cam, thk * 0.84),
        ])
    f_mark = tag_faces_from(bm_fw, 0, 0)

    # Twin sculpted aero nosecone pylons (slot 1 = Primary)
    for side in (-1.0, 1.0):
        add_swept_tube(
            bm_fw,
            [(side * 0.096, -2.29, 0.082), (side * 0.086, -2.23, 0.148), (side * 0.072, -2.17, 0.214)],
            [(0.010, 0.088), (0.010, 0.082), (0.011, 0.076)],
            segs=10,
            up_hint=(1, 0, 0),
        )
    f_mark = tag_faces_from(bm_fw, f_mark, 1)

    # Flap-adjuster actuator pods & inboard carbon slot-gap fences (slot 2 = Carbon)
    for side in (-1.0, 1.0):
        add_strut(bm_fw, (side * 0.42, -2.24, 0.128), (side * 0.42, -2.02, 0.182), 0.014, 0.018, segs=10)
    f_mark = tag_faces_from(bm_fw, f_mark, 2)

    # Titanium slot-gap separator brackets across the 4-element cascade (slot 3 = Titanium)
    for side in (-1.0, 1.0):
        for bx in (0.26, 0.56, 0.78):
            add_box(bm_fw, side * bx, -2.15, 0.132, 0.005, 0.26, 0.076)
    tag_faces_from(bm_fw, f_mark, 3)

    fw_pivot_g = (0.0, 0.10, -2.20)
    fw_obj = finalize_godot_mesh(
        "FrontWing",
        bm_fw,
        [mat_accent, mat_primary, mat_carbon, mat_titanium],
        godot_pivot=fw_pivot_g,
        parent=body_obj,
        parent_godot_pivot=(0.0, 0.0, 0.0),
    )

    # Separable Left & Right Front-Wing Endplates (`FrontWing_Endplate_L`, `FrontWing_Endplate_R`)
    for (ep_name, godot_ep_x) in (("FrontWing_Endplate_L", -0.92), ("FrontWing_Endplate_R", 0.92)):
        # Pre-baked Blender X: +0.92 for Car Left (`godot_ep_x = -0.92`), -0.92 for Car Right (`+0.92`)
        s_ep = -1.0 if godot_ep_x > 0 else 1.0
        bm_fep = bmesh.new()
        # Slots: 0=Primary, 1=Carbon, 2=Accent
        # Curved cambered main vertical endplate sail + 3 upper outwash louvre vanes
        ep_rings = []
        for (zk, x_off, y0, y1) in [
            (0.070, 0.920, -2.42, -1.94),
            (0.145, 0.926, -2.40, -1.94),
            (0.225, 0.934, -2.35, -1.95),
            (0.305, 0.946, -2.26, -1.97),
        ]:
            pts = [
                (s_ep * (x_off - 0.010), y0, zk),
                (s_ep * (x_off + 0.010), y0 + 0.015, zk),
                (s_ep * (x_off + 0.014), 0.5 * (y0 + y1), zk),
                (s_ep * (x_off + 0.008), y1, zk),
                (s_ep * (x_off - 0.008), y1, zk),
                (s_ep * (x_off - 0.006), 0.5 * (y0 + y1), zk),
            ]
            if s_ep < 0:
                pts = list(reversed(pts))
            ep_rings.append(pts)
        add_loft(bm_fep, ep_rings)
        for slot_i in range(3):
            add_box(
                bm_fep,
                s_ep * (0.942 - slot_i * 0.003),
                -2.24 + slot_i * 0.11,
                0.285,
                0.014,
                0.086,
                0.055,
                rot_euler=(0.0, s_ep * math.radians(10.0), s_ep * math.radians(-10.0)),
            )
        f_mark = tag_faces_from(bm_fep, 0, 0)

        # Carbon outwash footplate Venturi tunnel + S-curved exterior diveplane canard (slot 1 = Carbon)
        add_box(bm_fep, s_ep * 0.952, -2.18, 0.068, 0.076, 0.48, 0.014)
        add_swept_tube(
            bm_fep,
            [
                (s_ep * 0.940, -2.35, 0.125),
                (s_ep * 0.962, -2.18, 0.178),
                (s_ep * 0.974, -2.00, 0.232),
            ],
            (0.030, 0.006),
            segs=8,
            up_hint=(0, 0, 1),
        )
        f_mark = tag_faces_from(bm_fep, f_mark, 1)

        # Crisp upper leading-edge accent trim strip (slot 2 = Accent)
        add_swept_tube(
            bm_fep,
            [
                (s_ep * 0.922, -2.41, 0.080),
                (s_ep * 0.934, -2.35, 0.220),
                (s_ep * 0.946, -2.26, 0.305),
            ],
            (0.009, 0.009),
            segs=8,
        )
        tag_faces_from(bm_fep, f_mark, 2)

        finalize_godot_mesh(
            ep_name,
            bm_fep,
            [mat_primary, mat_carbon, mat_accent],
            godot_pivot=(godot_ep_x, 0.19, -2.22),
            parent=fw_obj,
            parent_godot_pivot=fw_pivot_g,
        )

    # --------------------------------------------------------------------------
    # 6. `Body/RearWing` ([0.0, 0.73, +1.92]) + `RearWing_Endplate_L/R` + `RearWing_DRS`
    # --------------------------------------------------------------------------
    bm_rw = bmesh.new()
    # Slots: 0=Accent, 1=Carbon
    # Deep-spoon cambered mainplane + twin-element lower beam wing
    add_airfoil(bm_rw, [
        (-0.522, 1.80, 2.04, 0.748, -0.014, 0.028),
        (-0.260, 1.785, 2.04, 0.722, -0.019, 0.032),
        ( 0.000, 1.778, 2.04, 0.712, -0.022, 0.034),
        ( 0.260, 1.785, 2.04, 0.722, -0.019, 0.032),
        ( 0.522, 1.80, 2.04, 0.748, -0.014, 0.028),
    ])
    for (b_yle, b_yte, b_z) in ((1.86, 2.02, 0.385), (1.94, 2.07, 0.435)):
        add_airfoil(bm_rw, [
            (-0.505, b_yle, b_yte, b_z, 0.010, 0.018),
            ( 0.000, b_yle - 0.01, b_yte + 0.01, b_z - 0.008, 0.012, 0.020),
            ( 0.505, b_yle, b_yte, b_z, 0.010, 0.018),
        ])
    f_mark = tag_faces_from(bm_rw, 0, 0)

    # Twin swan-neck carbon pylons & central DRS hydraulic actuator pod (slot 1 = Carbon)
    for side in (-1.0, 1.0):
        add_swept_tube(
            bm_rw,
            [(side * 0.082, 1.63, 0.42), (side * 0.082, 1.75, 0.805), (side * 0.082, 1.86, 0.732)],
            (0.010, 0.048),
            segs=10,
            up_hint=(1, 0, 0),
        )
    add_box(bm_rw, 0.0, 1.855, 0.862, 0.040, 0.15, 0.046)
    tag_faces_from(bm_rw, f_mark, 1)

    rw_pivot_g = (0.0, 0.73, 1.92)
    rw_obj = finalize_godot_mesh(
        "RearWing",
        bm_rw,
        [mat_accent, mat_carbon],
        godot_pivot=rw_pivot_g,
        parent=body_obj,
        parent_godot_pivot=(0.0, 0.0, 0.0),
    )

    # Child `RearWing_Endplate_L` & `RearWing_Endplate_R` (matching Godot `f1_car_2026.tscn`)
    for (rep_name, godot_rx) in (("RearWing_Endplate_L", -0.52), ("RearWing_Endplate_R", 0.52)):
        s_re = -1.0 if godot_rx > 0 else 1.0
        bm_rep = bmesh.new()
        # Slots: 0=Primary, 1=Carbon, 2=RainLight
        rep_rings = []
        for (zk, x_off, y0, y1) in [
            (0.375, 0.515, 1.84, 2.09),
            (0.540, 0.532, 1.80, 2.12),
            (0.740, 0.542, 1.78, 2.14),
            (0.905, 0.540, 1.80, 2.13),
        ]:
            pts = [
                (s_re * (x_off - 0.009), y0, zk),
                (s_re * (x_off + 0.009), y0, zk),
                (s_re * (x_off + 0.009), y1, zk),
                (s_re * (x_off - 0.009), y1, zk),
            ]
            if s_re < 0:
                pts = list(reversed(pts))
            rep_rings.append(pts)
        add_loft(bm_rep, rep_rings)
        for rs_i in range(3):
            add_box(
                bm_rep,
                s_re * 0.544,
                1.82 + rs_i * 0.10,
                0.868,
                0.018,
                0.078,
                0.058,
                rot_euler=(math.radians(14.0), 0.0, 0.0),
            )
        f_mark = tag_faces_from(bm_rep, 0, 0)

        for vs_i in range(3):
            add_box(bm_rep, s_re * 0.526, 1.84 + vs_i * 0.085, 0.44, 0.008, 0.052, 0.115)
        f_mark = tag_faces_from(bm_rep, f_mark, 1)

        # Vertical FIA Endplate Rain-Light LED Strip
        add_box(bm_rep, s_re * 0.542, 2.138, 0.62, 0.014, 0.012, 0.23)
        tag_faces_from(bm_rep, f_mark, 2)

        finalize_godot_mesh(
            rep_name,
            bm_rep,
            [mat_primary, mat_carbon, mat_rain],
            godot_pivot=(godot_rx, 0.67, 1.94),
            parent=rw_obj,
            parent_godot_pivot=rw_pivot_g,
        )

    # Articulated `RearWing_DRS`: Pivot at [0.0, 0.84, +1.89]
    bm_drs = bmesh.new()
    add_airfoil(bm_drs, [
        (-0.520, 1.885, 2.054, 0.848, 0.014, 0.020),
        ( 0.000, 1.878, 2.054, 0.840, 0.016, 0.022),
        ( 0.520, 1.885, 2.054, 0.848, 0.014, 0.020),
    ])
    f_mark = tag_faces_from(bm_drs, 0, 0)
    add_box(bm_drs, 0.0, 2.052, 0.858, 1.03, 0.007, 0.013)
    add_box(bm_drs, 0.0, 1.885, 0.862, 0.026, 0.055, 0.024)
    tag_faces_from(bm_drs, f_mark, 1)

    finalize_godot_mesh(
        "RearWing_DRS",
        bm_drs,
        [mat_accent, mat_carbon],
        godot_pivot=(0.0, 0.84, 1.89),
        parent=rw_obj,
        parent_godot_pivot=rw_pivot_g,
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
    # 9. 4-Corner `Suspension_<C>` (Double-Wishbone + Pullrod/Pushrod),
    #    Matte-Carbon `BrakeDuct_<C>`, Forged `BrakeCaliper_<C>`,
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
        in_sign_bl = 1.0 if wx_g > 0 else -1.0  # Inboard direction in pre-baked Blender X

        # Authentic Teardrop-Airfoil Double Wishbones + Pullrod/Pushrod + Steering/Toe Link + Driveshaft
        bm_s = bmesh.new()
        # Upper wishbone (forward & aft aero legs converging at upright balljoint)
        add_strut(bm_s, (sx_in_bl, yb - 0.16, 0.402), (sx_out_bl, yb - 0.015, 0.432), 0.006, 0.030, segs=10)
        add_strut(bm_s, (sx_in_bl, yb + 0.16, 0.390), (sx_out_bl, yb + 0.015, 0.432), 0.006, 0.028, segs=10)
        # Lower wishbone (multi-link forward & aft aero legs)
        add_strut(bm_s, (sx_in_bl, yb - 0.15, 0.198), (sx_out_bl, yb - 0.015, 0.232), 0.007, 0.032, segs=10)
        add_strut(bm_s, (sx_in_bl, yb + 0.15, 0.192), (sx_out_bl, yb + 0.015, 0.232), 0.007, 0.030, segs=10)
        # Front pullrod / Rear pushrod diagonal strut + inboard chassis rocker blister
        if not is_rear:
            # Front pullrod (high outboard upright -> low inboard survival cell keel)
            add_strut(bm_s, (sx_in_bl, yb + 0.08, 0.225), (sx_out_bl, yb - 0.02, 0.428), 0.008, 0.015, segs=10)
            add_box(bm_s, sx_in_bl - in_sign_bl * 0.02, yb + 0.08, 0.228, 0.038, 0.065, 0.028)
        else:
            # Rear pushrod (low outboard upright -> high inboard gearbox torsion-bar rocker)
            add_strut(bm_s, (sx_in_bl, yb - 0.08, 0.448), (sx_out_bl, yb + 0.02, 0.238), 0.008, 0.015, segs=10)
            add_box(bm_s, sx_in_bl - in_sign_bl * 0.02, yb - 0.08, 0.452, 0.038, 0.065, 0.028)
            # Rear carbon constant-velocity driveshaft axle
            add_strut(bm_s, (sx_in_bl, yb + 0.01, wy_g), (sx_out_bl, yb, wy_g), 0.018, 0.018, segs=12)
        # Aero track-rod / toe-link + vertical carbon wheel-upright kingpin post
        add_strut(bm_s, (sx_in_bl, yb - 0.075, 0.325), (sx_out_bl, yb - 0.055, 0.335), 0.006, 0.022, segs=8)
        add_strut(bm_s, (sx_out_bl, yb, 0.225), (sx_out_bl, yb, 0.440), 0.018, 0.026, segs=10, up_hint=(1, 0, 0))

        susp_pivot_g = (in_x_g, 0.31, wz_g)
        susp_obj = finalize_godot_mesh(
            f"Suspension_{cid}",
            bm_s,
            mat_carbon,
            godot_pivot=susp_pivot_g,
        )

        # Dedicated Matte-Carbon `BrakeDuct_<C>` (separate from `BrakeCaliper_<C>` so `src/models.js`
        # preserves authentic matte autoclave carbon weave instead of painting the drum caliper-red!)
        bm_duct = bmesh.new()
        # Full carbon-fiber brake drum shroud, inboard multi-vane air scoop & FIA wheel-wake winglets
        drum_rings = []
        for (dx_in, dr) in ((0.138, 0.170), (0.128, 0.181), (0.022, 0.181), (0.014, 0.172)):
            ring = [(-wx_g + in_sign_bl * dx_in, yb + math.cos(2.0 * math.pi * i / 28) * dr, wy_g + math.sin(2.0 * math.pi * i / 28) * dr) for i in range(28)]
            drum_rings.append(ring)
        add_loft(bm_duct, drum_rings, closed_ring=True, cap_start=True, cap_end=False)
        # Sculpted inboard brake cooling air scoop + internal splitter vane
        add_swept_tube(
            bm_duct,
            [
                (-wx_g + in_sign_bl * 0.172, yb - 0.195, wy_g + 0.042),
                (-wx_g + in_sign_bl * 0.152, yb - 0.075, wy_g + 0.032),
                (-wx_g + in_sign_bl * 0.122, yb + 0.035, wy_g + 0.022),
            ],
            [(0.034, 0.074), (0.030, 0.062), (0.024, 0.048)],
            segs=10,
            up_hint=(0, 0, 1),
        )
        add_box(bm_duct, -wx_g + in_sign_bl * 0.172, yb - 0.188, wy_g + 0.042, 0.056, 0.020, 0.005)
        # FIA upper & lower inboard wheel-wake conditioning deflector winglets
        add_box(bm_duct, -wx_g + in_sign_bl * 0.158, yb + 0.085, wy_g + 0.242, 0.012, 0.27, 0.092, rot_euler=(math.radians(-12.0), 0.0, 0.0))
        add_box(bm_duct, -wx_g + in_sign_bl * 0.154, yb + 0.095, wy_g - 0.185, 0.012, 0.22, 0.058, rot_euler=(math.radians(10.0), 0.0, 0.0))

        finalize_godot_mesh(
            f"BrakeDuct_{cid}",
            bm_duct,
            mat_carbon,
            godot_pivot=(wx_g, wy_g, wz_g),
            parent=susp_obj,
            parent_godot_pivot=susp_pivot_g,
        )

        # Forged 6-Piston Brembo Monobloc `BrakeCaliper_<C>` + Titanium Bridge Bolts
        bm_cal = bmesh.new()
        cal_x_bl = -wx_g + in_sign_bl * 0.042
        cal_y_bl = yb + (-0.118 if wz_g < 0 else 0.118)
        add_box(bm_cal, cal_x_bl, cal_y_bl, wy_g + 0.032, 0.082, 0.108, 0.156)
        for pz in (-0.042, 0.032, 0.104):
            add_strut(bm_cal, (cal_x_bl - 0.046, cal_y_bl, wy_g + pz), (cal_x_bl + 0.046, cal_y_bl, wy_g + pz), 0.022, 0.022, segs=12)
        f_mark = tag_faces_from(bm_cal, 0, 0)

        for bz in (-0.045, 0.032, 0.105):
            add_strut(bm_cal, (cal_x_bl - 0.050, cal_y_bl, wy_g + bz), (cal_x_bl + 0.050, cal_y_bl, wy_g + bz), 0.007, 0.007, segs=8)
        tag_faces_from(bm_cal, f_mark, 1)

        finalize_godot_mesh(
            f"BrakeCaliper_{cid}",
            bm_cal,
            [mat_caliper, mat_titanium],
            godot_pivot=(wx_g, wy_g, wz_g),
            parent=susp_obj,
            parent_godot_pivot=susp_pivot_g,
        )

        # `Wheel_<C>` (48-seg Pirelli slick + non-glowing stripes + forged 18" Y-split rim + lock nut)
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

        # Radially Slotted Carbon-Ceramic `BrakeDisc_<C>` (slot 0 = `F1_Brake_Rotor` for dynamic thermal glow)
        bm_disc = bmesh.new()
        add_strut(bm_disc, (cx_bl - 0.018, yb, wy_g), (cx_bl + 0.018, yb, wy_g), 0.170, 0.170, segs=36)
        add_strut(bm_disc, (cx_bl - 0.024, yb, wy_g), (cx_bl + 0.024, yb, wy_g), 0.092, 0.092, segs=24)
        for slot_i in range(16):
            ang = (2.0 * math.pi * slot_i) / 16.0
            sy_slot = yb + math.cos(ang) * 0.132
            sz_slot = wy_g + math.sin(ang) * 0.132
            add_box(bm_disc, cx_bl, sy_slot, sz_slot, 0.040, 0.008, 0.050, rot_euler=(ang, 0.0, 0.0))

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

    mat_garage = make_pbr_mat("Pit_Garage_Steel", hex_lin("#1e2430"), metallic=0.68, roughness=0.38)
    mat_cab = make_pbr_mat("Pit_Cabinet_Red", hex_lin("#d41420"), metallic=0.35, roughness=0.26, clearcoat=0.65)
    mat_hose = make_pbr_mat("Pit_Pneumatic_Hose", hex_lin("#e6b800"), metallic=0.06, roughness=0.52)
    mat_fuel = make_pbr_mat("Pit_Fuel_Chrome", hex_lin("#cfd6e0"), metallic=0.90, roughness=0.20)
    mat_led = make_pbr_mat(
        "Pit_Ceiling_LED",
        hex_lin("#f4faff"),
        metallic=0.08,
        roughness=0.16,
        emission=hex_lin("#e8f6ff"),
        emission_strength=2.8,
    )
    # Authentic painted lollipop boards & matte vulcanized tires (ZERO cartoon glow!)
    mat_stop_red = make_pbr_mat(
        "Pit_Lollipop_Stop",
        hex_lin("#e01b24"),
        metallic=0.06,
        roughness=0.36,
        emission_strength=0.0,
    )
    mat_go_green = make_pbr_mat(
        "Pit_Lollipop_Go",
        hex_lin("#00b85c"),
        metallic=0.06,
        roughness=0.36,
        emission_strength=0.0,
    )
    mat_carbon = make_pbr_mat(
        "Pit_Boom_Carbon",
        hex_lin("#161a21"),
        metallic=0.16,
        roughness=0.38,
        clearcoat=0.22,
        albedo_img=alb_carbon,
        normal_img=nrm_carbon,
        uv_tile=10.0,
    )
    mat_rubber = make_pbr_mat("Pit_Tire_Rubber", hex_lin("#16181d"), metallic=0.03, roughness=0.76)
    mat_stripe = make_pbr_mat(
        "Pit_Compound_Soft",
        hex_lin("#e21e28"),
        metallic=0.04,
        roughness=0.48,
        clearcoat=0.15,
        emission_strength=0.0,
    )
    mat_rim = make_pbr_mat("Pit_Wheel_Rim", hex_lin("#242933"), metallic=0.88, roughness=0.24, clearcoat=0.30)
    mat_suit = make_pbr_mat("Crew_Nomex_Suit", hex_lin("#c8121e"), metallic=0.02, roughness=0.82)
    mat_suit_stripe = make_pbr_mat("Crew_Suit_Stripe", hex_lin("#f2f5fa"), metallic=0.04, roughness=0.78)
    mat_helm = make_pbr_mat("Crew_Carbon_Helmet", hex_lin("#f2f5fa"), metallic=0.32, roughness=0.16, clearcoat=0.92)
    mat_visor = make_pbr_mat("Crew_Iridium_Visor", hex_lin("#081324"), metallic=0.96, roughness=0.05, clearcoat=1.0)
    mat_gun_body = make_pbr_mat("Crew_Paoli_Gun", hex_lin("#1b222d"), metallic=0.78, roughness=0.32)
    mat_gun_anod = make_pbr_mat("Crew_Paoli_Anodized", hex_lin("#0095e8"), metallic=0.88, roughness=0.22, clearcoat=0.55)

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
    def _ell_ring(cx, cy, cz, rx, ry, segs=16):
        return [(cx + math.cos(2.0 * math.pi * i / segs) * rx, cy + math.sin(2.0 * math.pi * i / segs) * ry, cz) for i in range(segs)]

    # Anatomical Pelvis / Hips + Nomex Waist Belt
    v0 = len(bm_crew.verts)
    pelvis_rings = [
        _ell_ring(0.0, 0.02, 0.77, 0.165, 0.112),
        _ell_ring(0.0, 0.015, 0.86, 0.172, 0.118),
        _ell_ring(0.0, 0.005, 0.96, 0.156, 0.106),
    ]
    add_loft(bm_crew, pelvis_rings)
    tag_new_verts(v0, "Pelvis", 0)

    # Tapered Athletic Nomex Torso + Rounded Deltoid Caps + Fireproof Neck Collar
    v0 = len(bm_crew.verts)
    torso_rings = [
        _ell_ring(0.0, 0.00, 0.95, 0.156, 0.106),
        _ell_ring(0.0, -0.015, 1.07, 0.174, 0.116),
        _ell_ring(0.0, -0.030, 1.21, 0.202, 0.128),
        _ell_ring(0.0, -0.036, 1.32, 0.212, 0.122),
        _ell_ring(0.0, -0.040, 1.36, 0.115, 0.085),
    ]
    add_loft(bm_crew, torso_rings)
    for sx in (-0.205, 0.205):
        ret_sh = bmesh.ops.create_uvsphere(bm_crew, u_segments=14, v_segments=10, radius=0.068)
        bmesh.ops.scale(bm_crew, vec=(1.05, 0.95, 0.92), verts=ret_sh["verts"])
        bmesh.ops.translate(bm_crew, vec=(sx, -0.036, 1.285), verts=ret_sh["verts"])
    tag_new_verts(v0, "Spine", 0)

    # FIA Team Chest Stripe + Epaulettes + Waist Belt
    v0 = len(bm_crew.verts)
    add_loft(bm_crew, [
        _ell_ring(0.0, -0.028, 1.15, 0.194, 0.129),
        _ell_ring(0.0, -0.031, 1.23, 0.206, 0.132),
    ], cap_start=False, cap_end=False)
    add_box(bm_crew, -0.165, -0.035, 1.345, 0.095, 0.16, 0.018)
    add_box(bm_crew,  0.165, -0.035, 1.345, 0.095, 0.16, 0.018)
    tag_new_verts(v0, "Spine", 1)

    # Aero Carbon Pit Helmet, Top Intake Scoop, Chin Guard & Peltor Radio Headset Muffs
    v0 = len(bm_crew.verts)
    add_strut(bm_crew, (0.0, -0.04, 1.34), (0.0, -0.045, 1.43), 0.056, 0.056, segs=12)
    ret_ch = bmesh.ops.create_uvsphere(bm_crew, u_segments=28, v_segments=18, radius=0.148)
    bmesh.ops.scale(bm_crew, vec=(0.93, 1.09, 0.99), verts=ret_ch["verts"])
    bmesh.ops.translate(bm_crew, vec=(0.0, -0.05, 1.50), verts=ret_ch["verts"])
    add_box(bm_crew, 0.0, -0.01, 1.642, 0.072, 0.17, 0.022)
    tag_new_verts(v0, "Head", 2)

    v0 = len(bm_crew.verts)
    for sx in (-0.142, 0.142):
        add_strut(bm_crew, (sx, -0.04, 1.485), (sx + (0.018 if sx > 0 else -0.018), -0.04, 1.485), 0.044, 0.054, segs=12)
    add_swept_tube(bm_crew, [(0.148, -0.05, 1.465), (0.115, -0.145, 1.435), (0.025, -0.185, 1.425)], (0.006, 0.006), segs=6)
    tag_new_verts(v0, "Head", 4)

    v0 = len(bm_crew.verts)
    ret_cv = bmesh.ops.create_uvsphere(bm_crew, u_segments=24, v_segments=14, radius=0.142)
    bmesh.ops.scale(bm_crew, vec=(0.89, 1.05, 0.50), verts=ret_cv["verts"])
    bmesh.ops.translate(bm_crew, vec=(0.0, -0.104, 1.494), verts=ret_cv["verts"])
    tag_new_verts(v0, "Head", 3)

    # Tapered Anatomical Arms, Forearms, thighs & calves
    tapered_limbs = [
        ([( 0.21, -0.04, 1.28), ( 0.216, -0.13, 1.16), ( 0.22, -0.22, 1.04)], [(0.064, 0.064), (0.058, 0.058), (0.052, 0.052)], "UpperArm.L", 0),
        ([( 0.22, -0.22, 1.04), ( 0.15, -0.33, 0.96), ( 0.08, -0.44, 0.88)], [(0.052, 0.052), (0.046, 0.046), (0.038, 0.038)], "Forearm.L", 0),
        ([(-0.21, -0.04, 1.28), (-0.205, -0.12, 1.15), (-0.20, -0.20, 1.02)], [(0.064, 0.064), (0.058, 0.058), (0.052, 0.052)], "UpperArm.R", 0),
        ([(-0.20, -0.20, 1.02), (-0.115, -0.32, 0.95), (-0.03, -0.44, 0.88)], [(0.052, 0.052), (0.046, 0.046), (0.038, 0.038)], "Forearm.R", 0),
        ([( 0.125,  0.02, 0.81), ( 0.128, -0.04, 0.63), ( 0.13, -0.10, 0.45)], [(0.086, 0.088), (0.076, 0.078), (0.064, 0.066)], "Thigh.L", 0),
        ([( 0.13, -0.10, 0.45), ( 0.13, -0.04, 0.26), ( 0.13,  0.02, 0.07)], [(0.064, 0.066), (0.058, 0.062), (0.046, 0.050)], "Shin.L", 0),
        ([(-0.125,  0.02, 0.81), (-0.128, -0.04, 0.63), (-0.13, -0.10, 0.45)], [(0.086, 0.088), (0.076, 0.078), (0.064, 0.066)], "Thigh.R", 0),
        ([(-0.13, -0.10, 0.45), (-0.13, -0.04, 0.26), (-0.13,  0.02, 0.07)], [(0.064, 0.066), (0.058, 0.062), (0.046, 0.050)], "Shin.R", 0),
    ]
    for (pts, rads, bname, midx) in tapered_limbs:
        v0 = len(bm_crew.verts)
        add_swept_tube(bm_crew, pts, rads, segs=12)
        tag_new_verts(v0, bname, midx)

    # Gloved Mechanic Hands, Moulded Kevlar Knee Pads & Contoured Racing Boots
    for (hx, hy, hz, bname) in ((0.08, -0.45, 0.88, "Forearm.L"), (-0.03, -0.45, 0.88, "Forearm.R")):
        v0 = len(bm_crew.verts)
        ret_gl = bmesh.ops.create_uvsphere(bm_crew, u_segments=12, v_segments=8, radius=0.042)
        bmesh.ops.scale(bm_crew, vec=(0.88, 1.18, 0.82), verts=ret_gl["verts"])
        bmesh.ops.translate(bm_crew, vec=(hx, hy, hz), verts=ret_gl["verts"])
        tag_new_verts(v0, bname, 4)

    for sx, bname in ((0.13, "Shin.L"), (-0.13, "Shin.R")):
        v0 = len(bm_crew.verts)
        add_swept_tube(bm_crew, [(sx, -0.145, 0.52), (sx, -0.158, 0.45), (sx, -0.142, 0.38)], [(0.058, 0.032), (0.064, 0.036), (0.056, 0.030)], segs=10)
        add_swept_tube(bm_crew, [(sx, 0.02, 0.095), (sx, -0.02, 0.045), (sx, -0.11, 0.032)], [(0.050, 0.054), (0.052, 0.044), (0.046, 0.032)], segs=12)
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
