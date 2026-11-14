"""
Blender 5.x AAA High-Detail 3D Asset Generator for:
RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX

Exports 5 high-craft 3D GLB assets (and .blend source files):
  - assets/models/f1_car.glb     (Next-Gen F1 Car + Articulated DRS Flap, Cockpit Wheel & Endplates)
  - assets/models/f1_wheel.glb   (Forged 10-Spoke Rim, Dual Pirelli Sidewall Stripes & Slotted Rotor)
  - assets/models/pit_crew.glb   (Articulated Kneeling Pit Mechanic, Visor, Knee Pads & Paoli Wheel Gun)
  - assets/models/mount_fuji.glb (3-Strata Iconic Stratovolcano: Cedar Base, Basalt Gullies & Snow Cap)
  - assets/models/yacht.glb      (3-Deck Monte Carlo Superyacht: Bridge Glass, Radar Arch, Sunpads & Turquoise Stripe)
"""

import bpy
import bmesh
from mathutils import Matrix, Vector
import traceback
import math
import os

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_MODELS = os.path.join(ROOT_DIR, "assets", "models")
OUT_BLEND = os.path.join(ROOT_DIR, "blender")
os.makedirs(OUT_MODELS, exist_ok=True)
os.makedirs(OUT_BLEND, exist_ok=True)


# ==============================================================================
# COLOR, MATERIAL & GEOMETRY UTILITIES
# ==============================================================================

def _c_srgb_to_lin(c):
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear_rgb(hex_str):
    h = hex_str.lstrip("#")
    sr = int(h[0:2], 16) / 255.0
    sg = int(h[2:4], 16) / 255.0
    sb = int(h[4:6], 16) / 255.0
    return (_c_srgb_to_lin(sr), _c_srgb_to_lin(sg), _c_srgb_to_lin(sb))


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


def apply_box_uvs(bm, scale=1.5):
    """Assign clean cubic/triplanar UV coordinates so carbon-weave & PBR textures tile crisply."""
    uv_layer = bm.loops.layers.uv.verify()
    bm.faces.ensure_lookup_table()
    for f in bm.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                u, v = co.x * scale, co.y * scale
            elif ax >= ay and ax >= az:
                u, v = co.y * scale, co.z * scale
            else:
                u, v = co.x * scale, co.z * scale
            loop[uv_layer].uv = (u, v)


def create_mesh_object(
    name,
    bm,
    mat=None,
    shade_smooth=True,
    subdiv_levels=0,
    location=(0.0, 0.0, 0.0),
    rotation=(0.0, 0.0, 0.0),
    auto_uv=True,
    uv_scale=1.6,
):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if auto_uv:
        apply_box_uvs(bm, scale=uv_scale)

    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = rotation
    bpy.context.collection.objects.link(obj)

    if mat:
        obj.data.materials.append(mat)
    if subdiv_levels > 0:
        mod = obj.modifiers.new(name="Subsurf", type="SUBSURF")
        mod.levels = subdiv_levels
        mod.render_levels = subdiv_levels
    if shade_smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def add_box(bm, cx, cy, cz, sx, sy, sz):
    ret = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=ret["verts"])
    bmesh.ops.translate(bm, vec=(cx, cy, cz), verts=ret["verts"])
    return ret["verts"]


def add_loft(bm, rings_pts, closed_ring=True, cap_start=True, cap_end=True):
    """Loft a list of vertex coordinate rings into clean quad strips."""
    rings = []
    for pts in rings_pts:
        rings.append([bm.verts.new(p) for p in pts])

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
    """
    Parallel-transport swept elliptical tube along 3D `path_pts`.
    `radii_xy` can be a single (rx, ry) tuple or a per-station list of (rx, ry) tuples.
    """
    pts = [Vector(p) for p in path_pts]
    count = len(pts)
    if count < 2:
        return []

    if isinstance(radii_xy[0], (int, float)):
        r_list = [radii_xy] * count
    else:
        r_list = list(radii_xy)

    tangents = []
    for i in range(count):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == count - 1:
            t = pts[-1] - pts[-2]
        else:
            t = pts[i + 1] - pts[i - 1]
        if t.length < 1e-6:
            t = Vector((0.0, 1.0, 0.0))
        tangents.append(t.normalized())

    up = Vector(up_hint).normalized()
    if abs(tangents[0].dot(up)) > 0.94:
        up = Vector((1.0, 0.0, 0.0)) if abs(tangents[0].x) < 0.8 else Vector((0.0, 1.0, 0.0))

    nrm = (up - tangents[0] * tangents[0].dot(up)).normalized()
    normals = [nrm]
    for i in range(1, count):
        q = tangents[i - 1].rotation_difference(tangents[i])
        nrm = (q @ nrm).normalized()
        # Re-orthogonalize to prevent drift
        nrm = (nrm - tangents[i] * tangents[i].dot(nrm)).normalized()
        normals.append(nrm)

    rings_pts = []
    for i in range(count):
        p = pts[i]
        t = tangents[i]
        n = normals[i]
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
    """Create a sleek airfoil/elliptical strut between two 3D points."""
    return add_swept_tube(bm, [p0, p1], (rx, ry), segs=segs, up_hint=up_hint, cap_ends=True)


def add_airfoil_ribbon(bm, span_stations, closed_caps=True):
    """
    Build a 3D cambered wing element across span stations.
    Each station in `span_stations`: (x, y_lead, y_trail, z_base, camber, thickness)
    where -Y is leading edge (forward) and +Y is trailing edge (rearward).
    """
    rings_pts = []
    # 8-point airfoil cross-section around chord u in [0..1]
    u_prof = [
        (0.00,  0.00),   # leading edge nose
        (0.18,  0.55),   # upper forward suction peak
        (0.52,  0.48),   # upper mid chord
        (0.88,  0.22),   # upper trailing ramp
        (1.00,  0.04),   # trailing edge top
        (0.88, -0.10),   # lower trailing
        (0.48, -0.32),   # lower mid pressure surface
        (0.15, -0.35),   # lower leading chin
    ]
    for (x, y_le, y_te, z0, camber, thick) in span_stations:
        dy = y_te - y_le
        ring = []
        for (u, tz) in u_prof:
            y = y_le + u * dy
            arch = math.sin(u * math.pi) * camber
            z = z0 + arch + tz * thick
            ring.append((x, y, z))
        rings_pts.append(ring)
    return add_loft(bm, rings_pts, closed_ring=True, cap_start=closed_caps, cap_end=closed_caps)


def export_asset(name):
    blend_path = os.path.join(OUT_BLEND, f"{name}.blend")
    glb_path = os.path.join(OUT_MODELS, f"{name}.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
    )


# ==============================================================================
# 1. NEXT-GEN FORMULA 1 CAR & ARTICULATED PARTS (f1_car.glb)
# ==============================================================================

def build_f1_chassis():
    """
    Blender coords: -Y is Nose/Forward, +Y is Rear, +Z is Up, +X is Right.
    Wheel hubs in FormulaCarRig: X = ±0.86, Z = 0.34, Front Y = -1.48, Rear Y = +1.42.
    """
    reset_scene()

    # Exact required material names preserved 100%
    mat_primary = make_mat("Livery_Primary", (0.86, 0.05, 0.09), metallic=0.46, roughness=0.16)
    mat_accent = make_mat("Livery_Accent", (0.97, 0.97, 0.99), metallic=0.26, roughness=0.20)
    mat_carbon = make_mat("Carbon_Fiber", (0.055, 0.060, 0.070), metallic=0.34, roughness=0.34)
    mat_metal = make_mat("Titanium_Exhaust", (0.72, 0.69, 0.64), metallic=0.96, roughness=0.16)
    mat_helmet = make_mat("Driver_Helmet_Mat", (0.0, 0.82, 0.98), metallic=0.45, roughness=0.14)
    mat_visor = make_mat("Driver_Visor_Mat", (0.015, 0.035, 0.075), metallic=0.98, roughness=0.04)
    mat_rainlight = make_mat(
        "Rain_Light_Mat",
        (1.0, 0.03, 0.02),
        metallic=0.1,
        roughness=0.15,
        emission=(1.0, 0.04, 0.02),
        emission_strength=6.5,
    )

    # --------------------------------------------------------------------------
    # A. BODY_MAIN: Sculpted Monocoque, Needle Nose, Downwash Sidepods & Mirrors
    # --------------------------------------------------------------------------
    bm_body = bmesh.new()

    # 12-station aerodynamic monocoque + roll-hoop airbox + coke-bottle spine
    mono_stations = [
        # (y, hw_bot, hw_mid, hw_top, z_bot, z_mid, z_top)
        (-2.44, 0.048, 0.065, 0.040, 0.125, 0.155, 0.182),  # Drooped aero nose tip
        (-2.15, 0.105, 0.132, 0.092, 0.132, 0.195, 0.255),
        (-1.80, 0.165, 0.205, 0.148, 0.138, 0.245, 0.345),
        (-1.46, 0.220, 0.268, 0.195, 0.130, 0.285, 0.435),  # Front axle bulkhead
        (-1.05, 0.290, 0.345, 0.242, 0.105, 0.315, 0.505),
        (-0.68, 0.335, 0.388, 0.275, 0.092, 0.328, 0.535),  # Forward cockpit coaming
        (-0.26, 0.350, 0.405, 0.282, 0.090, 0.335, 0.542),  # Cockpit waist
        ( 0.06, 0.342, 0.392, 0.228, 0.090, 0.410, 0.755),  # Roll-hoop intake rise
        ( 0.24, 0.332, 0.380, 0.195, 0.092, 0.430, 0.798),  # Airbox roll-hoop crest
        ( 0.68, 0.265, 0.315, 0.132, 0.098, 0.385, 0.685),  # Engine cover taper
        ( 1.22, 0.165, 0.205, 0.075, 0.115, 0.310, 0.515),  # Coke-bottle narrow waist
        ( 1.66, 0.105, 0.135, 0.048, 0.138, 0.268, 0.395),
        ( 1.94, 0.075, 0.092, 0.036, 0.155, 0.245, 0.335),  # Rear gearbox tailcone
    ]
    mono_rings = []
    for (y, hwb, hwm, hwt, zb, zm, zt) in mono_stations:
        mono_rings.append([
            (-hwb, y, zb),
            ( hwb, y, zb),
            ( hwm, y, zm - 0.045),
            ( hwm * 0.96, y, zm + 0.055),
            ( hwt, y, zt),
            (-hwt, y, zt),
            (-hwm * 0.96, y, zm + 0.055),
            (-hwm, y, zm - 0.045),
        ])
    add_loft(bm_body, mono_rings, closed_ring=True, cap_start=True, cap_end=True)

    # Sculpted High-Undercut Downwash Sidepods (left & right) clearing front & rear tires cleanly
    for side in (-1.0, 1.0):
        sp_stations = [
            # (y, xin, xout_bot, xout_mid, xout_top, zb, zm, zt, gully_dip)
            (-0.70, 0.28, 0.52, 0.75, 0.73, 0.20, 0.36, 0.485, 0.000),  # High overbite inlet lip
            (-0.46, 0.30, 0.58, 0.83, 0.78, 0.13, 0.33, 0.505, 0.015),  # Deep floor undercut
            (-0.08, 0.29, 0.64, 0.82, 0.74, 0.10, 0.31, 0.480, 0.032),  # Maximum aero shoulder
            ( 0.38, 0.25, 0.56, 0.72, 0.62, 0.10, 0.28, 0.430, 0.042),  # Waterslide downwash ramp
            ( 0.86, 0.19, 0.42, 0.54, 0.44, 0.11, 0.24, 0.355, 0.030),  # Coke-bottle inward sweep
            ( 1.28, 0.14, 0.26, 0.33, 0.26, 0.13, 0.21, 0.285, 0.012),  # Clears RL/RR inner tire (|x|=0.67)
            ( 1.66, 0.09, 0.15, 0.18, 0.14, 0.15, 0.20, 0.245, 0.000),  # Blends into diffuser roof
        ]
        sp_rings = []
        for (y, xin, xob, xom, xot, zb, zm, zt, dip) in sp_stations:
            x_mid_top = 0.5 * (xin + xot)
            pts = [
                (side * xin,       y, zb),
                (side * xob,       y, zb + 0.035),
                (side * xom,       y, zm),
                (side * xot,       y, zt),
                (side * x_mid_top, y, zt - dip),  # Sculpted downwash cooling channel!
                (side * xin,       y, zt + 0.012),
            ]
            if side < 0:
                pts = list(reversed(pts))
            sp_rings.append(pts)
        add_loft(bm_body, sp_rings, closed_ring=True, cap_start=True, cap_end=True)

        # Aerodynamic Winged Rear-View Mirror Housings
        mir_rings = [
            [
                (side * 0.42, -0.58, 0.545),
                (side * 0.56, -0.57, 0.550),
                (side * 0.57, -0.57, 0.592),
                (side * 0.42, -0.58, 0.588),
            ],
            [
                (side * 0.41, -0.49, 0.542),
                (side * 0.57, -0.49, 0.548),
                (side * 0.58, -0.49, 0.595),
                (side * 0.41, -0.49, 0.590),
            ],
        ]
        if side < 0:
            mir_rings = [list(reversed(r)) for r in mir_rings]
        add_loft(bm_body, mir_rings, closed_ring=True, cap_start=True, cap_end=True)

    create_mesh_object("Body_Main", bm_body, mat_primary, shade_smooth=True, subdiv_levels=2, uv_scale=1.2)

    # --------------------------------------------------------------------------
    # B. BODY_ACCENT: Nose Livery Stripe, Dorsal Aero Sharkfin & Sidepod Blades
    # --------------------------------------------------------------------------
    bm_acc = bmesh.new()

    # Contoured nosecone center racing stripe hugging upper nose slope
    stripe_stations = [
        (-2.32, 0.032, 0.175, 0.188),
        (-1.95, 0.068, 0.258, 0.272),
        (-1.50, 0.095, 0.418, 0.436),
        (-1.02, 0.105, 0.502, 0.518),
        (-0.72, 0.110, 0.530, 0.544),
    ]
    st_rings = []
    for (y, hw, zb, zt) in stripe_stations:
        st_rings.append([(-hw, y, zb), (hw, y, zb), (hw * 0.92, y, zt), (-hw * 0.92, y, zt)])
    add_loft(bm_acc, st_rings, closed_ring=True, cap_start=True, cap_end=True)

    # Sculpted Dorsal Aero Sharkfin along Engine Cover Spine
    fin_stations = [
        (0.28, 0.014, 0.68, 0.790),
        (0.68, 0.012, 0.58, 0.755),
        (1.18, 0.011, 0.44, 0.720),
        (1.62, 0.010, 0.36, 0.685),
    ]
    fin_rings = []
    for (y, hw, zb, zt) in fin_stations:
        fin_rings.append([(-hw, y, zb), (hw, y, zb), (hw * 0.6, y, zt), (-hw * 0.6, y, zt)])
    add_loft(bm_acc, fin_rings, closed_ring=True, cap_start=True, cap_end=True)

    # Sidepod outer shoulder livery flashes
    for side in (-1.0, 1.0):
        sp_flash = [
            (-0.62, 0.56, 0.76, 0.475, 0.495),
            (-0.12, 0.58, 0.80, 0.470, 0.492),
            ( 0.38, 0.48, 0.68, 0.418, 0.440),
            ( 0.78, 0.36, 0.50, 0.345, 0.365),
        ]
        fl_rings = []
        for (y, xi, xo, zb, zt) in sp_flash:
            pts = [(side * xi, y, zb), (side * xo, y, zb - 0.01), (side * xo, y, zt - 0.01), (side * xi, y, zt)]
            if side < 0:
                pts = list(reversed(pts))
            fl_rings.append(pts)
        add_loft(bm_acc, fl_rings, closed_ring=True, cap_start=True, cap_end=True)

    create_mesh_object("Body_Accent", bm_acc, mat_accent, shade_smooth=True, uv_scale=1.4)

    # --------------------------------------------------------------------------
    # C. CARBON_CHASSIS: Venturi Floor + Edge Strakes, Sidepod Cooling Louvres,
    #    Multi-Strake Diffuser, Cockpit Tub, HANS Collar, Scoops & Mirror Stalks
    # --------------------------------------------------------------------------
    bm_carb = bmesh.new()

    # 1. Sculpted Ground-Effect Venturi Floor + Tapered Tea-Tray Front Bib Splitter
    floor_stations = [
        (-1.62, 0.16, 0.052, 0.068),  # Forward tea-tray splitter nose
        (-1.26, 0.32, 0.052, 0.072),  # Bib waist behind front tires
        (-0.98, 0.82, 0.054, 0.082),  # Venturi tunnel inlet flare
        (-0.30, 0.84, 0.054, 0.084),  # Maximum ground-effect floor width
        ( 0.45, 0.83, 0.055, 0.084),
        ( 0.98, 0.78, 0.058, 0.086),  # Tire-spat taper ahead of rear wheels
        ( 1.56, 0.62, 0.064, 0.094),  # Transitions into rear diffuser throat
    ]
    flr_rings = []
    for (y, hw, zb, zt) in floor_stations:
        flr_rings.append([(-hw, y, zb), (hw, y, zb), (hw, y, zt), (-hw, y, zt)])
    add_loft(bm_carb, flr_rings, closed_ring=True, cap_start=True, cap_end=True)

    # Tea-tray splitter stay strut to nose underside
    add_strut(bm_carb, (0.0, -1.52, 0.065), (0.0, -1.46, 0.145), 0.012, 0.032, segs=6, up_hint=(1, 0, 0))

    # 2. Venturi Floor Edge Wings, Outwash Vortex Strakes & Forward Underfloor Fences
    for side in (-1.0, 1.0):
        # Continuous raised scrolled floor-edge wing
        add_box(bm_carb, side * 0.835, -0.02, 0.095, 0.026, 1.88, 0.045)
        # 5 angled curved Venturi floor-edge vortex strakes along outer floor edge!
        for k in range(5):
            yk = -0.82 + k * 0.36
            p0 = (side * 0.805, yk - 0.09, 0.082)
            p1 = (side * 0.858, yk + 0.09, 0.118)
            add_strut(bm_carb, p0, p1, 0.008, 0.028, segs=6, up_hint=(0, 0, 1))
        # 3 forward Venturi tunnel inlet fences under sidepod leading edge
        for f_idx, fx in enumerate((0.44, 0.59, 0.73)):
            y_f = -0.92 + f_idx * 0.05
            add_box(bm_carb, side * fx, y_f, 0.095, 0.014, 0.32, 0.075)

    # 3. High-Expansion Rear Venturi Diffuser Tunnel + 6 Vertical Strakes + Gurney Flap
    diff_stations = [
        (1.54, 0.62, 0.065, 0.095),
        (1.78, 0.61, 0.135, 0.175),
        (2.02, 0.60, 0.215, 0.255),
    ]
    d_rings = []
    for (y, hw, zb, zt) in diff_stations:
        d_rings.append([(-hw, y, zb), (hw, y, zb), (hw, y, zt), (-hw, y, zt)])
    add_loft(bm_carb, d_rings, closed_ring=True, cap_start=True, cap_end=True)
    # Outer diffuser wallplates + 6 internal vertical aero strakes
    for sx in (-0.59, -0.44, -0.29, -0.13, 0.13, 0.29, 0.44, 0.59):
        add_box(bm_carb, sx, 1.80, 0.135, 0.016, 0.48, 0.145)
    # Rear crash attenuator structure housing the rain light
    add_box(bm_carb, 0.0, 1.96, 0.215, 0.095, 0.22, 0.135)

    # 4. Sculpted Sidepod Cooling Louvres (7 angled shark-gill heat-extraction slats per side!)
    for side in (-1.0, 1.0):
        # Dark recessed cooling plenum bed along sidepod gully
        verts_bed = add_box(bm_carb, side * 0.46, 0.16, 0.452, 0.15, 0.72, 0.022)
        bmesh.ops.rotate(
            bm_carb,
            cent=(side * 0.46, 0.16, 0.452),
            matrix=Matrix.Rotation(0.085, 3, "X"),
            verts=verts_bed,
        )
        for g in range(7):
            yg = -0.15 + g * 0.102
            zg = 0.478 - g * 0.0085
            xg = side * (0.48 - g * 0.010)
            slat = add_box(bm_carb, xg, yg, zg, 0.145, 0.036, 0.010)
            bmesh.ops.rotate(
                bm_carb,
                cent=(xg, yg, zg),
                matrix=Matrix.Rotation(-0.42, 3, "X") @ Matrix.Rotation(side * 0.16, 3, "Z"),
                verts=slat,
            )

        # Dark recessed radiator scoop mouths & roll-hoop intake mouth
        add_box(bm_carb, side * 0.53, -0.705, 0.355, 0.38, 0.065, 0.20)
        # Dual aero mirror stalks (inboard & sidepod vertical stay) + dark mirror face
        add_strut(bm_carb, (side * 0.31, -0.54, 0.525), (side * 0.44, -0.54, 0.562), 0.008, 0.022, segs=6)
        add_strut(bm_carb, (side * 0.52, -0.53, 0.485), (side * 0.51, -0.53, 0.552), 0.007, 0.020, segs=6)
        # Over-wheel front wake deflector winglets (2026 ground-effect wheel wake brow!)
        brow = add_box(bm_carb, side * 0.68, -1.28, 0.555, 0.022, 0.34, 0.12)
        bmesh.ops.rotate(bm_carb, cent=(side * 0.68, -1.28, 0.555), matrix=Matrix.Rotation(side * 0.42, 3, "Y"), verts=brow)

    # Cockpit dark carbon tub interior, molded headrest bolsters, HANS collar & airbox mouth
    add_box(bm_carb, 0.0, -0.35, 0.495, 0.44, 0.78, 0.14)
    for side in (-1.0, 1.0):
        add_box(bm_carb, side * 0.185, -0.22, 0.585, 0.065, 0.42, 0.075)  # FIA side headrest bolsters
        # Carbon HANS safety collar resting on driver shoulders
        add_strut(bm_carb, (side * 0.085, -0.17, 0.58), (side * 0.115, -0.34, 0.535), 0.022, 0.016, segs=6)
    add_box(bm_carb, 0.0, -0.06, 0.615, 0.26, 0.14, 0.085)  # Rear cockpit headrest pad
    add_box(bm_carb, 0.0, 0.06, 0.735, 0.165, 0.09, 0.115)  # Roll-hoop intake throat

    create_mesh_object("Carbon_Chassis", bm_carb, mat_carbon, shade_smooth=False, uv_scale=2.2)

    # --------------------------------------------------------------------------
    # D. HALO_TITANIUM: Curved Subdivided Grade-5 Titanium Cockpit Halo Hoop
    # --------------------------------------------------------------------------
    bm_halo = bmesh.new()

    # Smooth 15-point horseshoe curve wrapping around the cockpit from rear mounts to front apex
    halo_arc = [
        (-0.195,  0.03, 0.560),
        (-0.228, -0.12, 0.625),
        (-0.246, -0.30, 0.658),
        (-0.232, -0.46, 0.672),
        (-0.178, -0.58, 0.678),
        (-0.092, -0.645, 0.680),
        ( 0.000, -0.668, 0.681),  # Front center V-junction
        ( 0.092, -0.645, 0.680),
        ( 0.178, -0.58, 0.678),
        ( 0.232, -0.46, 0.672),
        ( 0.246, -0.30, 0.658),
        ( 0.228, -0.12, 0.625),
        ( 0.195,  0.03, 0.560),
    ]
    halo_radii = [
        (0.024, 0.022),
        (0.023, 0.021),
        (0.022, 0.020),
        (0.022, 0.020),
        (0.023, 0.021),
        (0.024, 0.022),
        (0.026, 0.023),
        (0.024, 0.022),
        (0.023, 0.021),
        (0.022, 0.020),
        (0.022, 0.020),
        (0.023, 0.021),
        (0.024, 0.022),
    ]
    add_swept_tube(bm_halo, halo_arc, halo_radii, segs=12, up_hint=(0.0, 0.0, 1.0), cap_ends=True)

    # Sculpted teardrop front center Halo V-pylon anchored cleanly to monocoque deck
    pylon_pts = [
        (0.0, -0.715, 0.515),
        (0.0, -0.692, 0.595),
        (0.0, -0.668, 0.678),
    ]
    pylon_r = [(0.015, 0.036), (0.014, 0.030), (0.018, 0.032)]
    add_swept_tube(bm_halo, pylon_pts, pylon_r, segs=12, up_hint=(1.0, 0.0, 0.0), cap_ends=True)

    create_mesh_object("Halo_Titanium", bm_halo, mat_carbon, shade_smooth=True, subdiv_levels=1, uv_scale=2.5)

    # --------------------------------------------------------------------------
    # E. ROLL_HOOP_TCAM: Sculpted FOM Overhead Airbox T-Cam Broadcast Pod
    # --------------------------------------------------------------------------
    bm_tcam = bmesh.new()
    # Local coords centered around T-Cam mount (0.0, 0.17, 0.825)
    add_strut(bm_tcam, (0.0, 0.01, -0.045), (0.0, -0.005, 0.042), 0.011, 0.034, segs=8, up_hint=(1, 0, 0))
    # Horizontal airfoil camera wing bar + outboard camera pods
    add_airfoil_ribbon(
        bm_tcam,
        [
            (-0.135, -0.035, 0.032, 0.044, 0.004, 0.018),
            ( 0.000, -0.042, 0.036, 0.046, 0.005, 0.024),
            ( 0.135, -0.035, 0.032, 0.044, 0.004, 0.018),
        ],
    )
    # Forward camera lens housing & outboard telemetry pods
    add_box(bm_tcam, 0.0, -0.048, 0.046, 0.048, 0.035, 0.028)
    for side in (-1.0, 1.0):
        add_box(bm_tcam, side * 0.135, -0.005, 0.044, 0.022, 0.072, 0.024)
    create_mesh_object(
        "Roll_Hoop_TCam",
        bm_tcam,
        mat_carbon,
        shade_smooth=True,
        location=(0.0, 0.17, 0.825),
        uv_scale=3.0,
    )

    # --------------------------------------------------------------------------
    # F. COCKPIT_WHEEL: Articulated Butterfly F1 Steering Wheel + Thumb Rotaries
    #    Origin right at hub (0.0, -0.52, 0.54) so models.js rotates it live!
    # --------------------------------------------------------------------------
    bm_sw = bmesh.new()
    # Steering shaft quick-release hub extending forward (-Y) into bulkhead
    add_strut(bm_sw, (0.0, -0.14, 0.0), (0.0, 0.012, 0.0), 0.024, 0.024, segs=12, up_hint=(0, 0, 1))
    # Sculpted carbon butterfly central faceplate (flat top, F1 open bottom cutout)
    add_box(bm_sw, 0.0, 0.010,  0.014, 0.185, 0.020, 0.092)  # Center display & rotary console
    add_box(bm_sw, 0.0, 0.010,  0.062, 0.245, 0.018, 0.022)  # Flat top shift-LED brow bridge
    add_box(bm_sw, 0.0, 0.018,  0.032, 0.105, 0.012, 0.042)  # Recessed telemetry screen bezel

    # Contoured Butterfly Ergonomic Side Grips + Thumb Rotaries + Rear Shift Paddles
    for side in (-1.0, 1.0):
        grip_path = [
            (side * 0.095, 0.010, -0.062),  # Lower grip horn
            (side * 0.124, 0.012, -0.025),  # Palm swell
            (side * 0.128, 0.012,  0.018),  # Main grip barrel
            (side * 0.112, 0.010,  0.058),  # Upper thumb-hook horn
        ]
        add_swept_tube(bm_sw, grip_path, (0.017, 0.020), segs=10, up_hint=(0, 1, 0), cap_ends=True)
        # Lower spoke bridge from center plate to lower grip
        add_strut(bm_sw, (side * 0.055, 0.010, -0.028), (side * 0.105, 0.010, -0.052), 0.010, 0.014, segs=6)
        # Thumb rotary encoder wheel inside thumb cutout
        add_box(bm_sw, side * 0.088, 0.018, 0.036, 0.016, 0.016, 0.022)
        # Tactile front push-buttons
        for bz in (0.048, 0.015, -0.016):
            add_box(bm_sw, side * 0.068, 0.022, bz, 0.014, 0.010, 0.014)
        # Magnetic carbon upshift/downshift & dual-clutch paddles on rear (-Y) of wheel!
        add_box(bm_sw, side * 0.088, -0.014,  0.018, 0.045, 0.008, 0.058)
        add_box(bm_sw, side * 0.072, -0.016, -0.034, 0.038, 0.007, 0.032)

    # 3 Central FIA ERS / Differential / Brake-Migration Rotary Dials
    for rx in (-0.034, 0.0, 0.034):
        add_strut(bm_sw, (rx, 0.016, -0.016), (rx, 0.028, -0.016), 0.012, 0.012, segs=10, up_hint=(0, 0, 1))

    create_mesh_object(
        "Cockpit_Wheel",
        bm_sw,
        mat_carbon,
        shade_smooth=True,
        location=(0.0, -0.52, 0.54),
        rotation=(0.24, 0.0, 0.0),
        uv_scale=4.0,
    )

    # --------------------------------------------------------------------------
    # G. DRIVER HELMET, IRIDIUM VISOR, RACING SHOULDERS & GLOVED HANDS ON WHEEL
    # --------------------------------------------------------------------------
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=0.148, location=(0.0, -0.245, 0.625))
    helm = bpy.context.active_object
    helm.name = "Driver_Helmet"
    helm.scale = (0.91, 1.12, 0.96)
    helm.data.materials.append(mat_helmet)
    for p in helm.data.polygons:
        p.use_smooth = True

    bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=16, radius=0.143, location=(0.0, -0.295, 0.628))
    vis = bpy.context.active_object
    vis.name = "Driver_Visor"
    vis.scale = (0.87, 1.06, 0.50)
    vis.data.materials.append(mat_visor)
    for p in vis.data.polygons:
        p.use_smooth = True

    # Driver Racing Suit Torso, Shoulders & Articulated Arms reaching to Cockpit_Wheel
    bm_drv = bmesh.new()
    # Reclined F1 seating chest & shoulders inside cockpit tub
    torso_rings = [
        [(-0.15, -0.14, 0.41), (0.15, -0.14, 0.41), (0.18, -0.16, 0.555), (-0.18, -0.16, 0.555)],
        [(-0.14, -0.32, 0.39), (0.14, -0.32, 0.39), (0.16, -0.30, 0.525), (-0.16, -0.30, 0.525)],
    ]
    add_loft(bm_drv, torso_rings, closed_ring=True, cap_start=True, cap_end=True)
    for side in (-1.0, 1.0):
        arm_path = [
            (side * 0.175, -0.20, 0.535),  # Shoulder deltoid
            (side * 0.185, -0.36, 0.495),  # Bent elbow inside cockpit coaming
            (side * 0.132, -0.485, 0.532), # Forearm wrist meeting steering grip
        ]
        add_swept_tube(bm_drv, arm_path, [(0.044, 0.046), (0.038, 0.040), (0.030, 0.032)], segs=10)
    create_mesh_object("Driver_Shoulders", bm_drv, mat_primary, shade_smooth=True, subdiv_levels=1, uv_scale=1.8)

    # Gloved Driver Hands wrapped around Left & Right Butterfly Grips
    bm_glv = bmesh.new()
    for side in (-1.0, 1.0):
        hand_path = [
            (side * 0.132, -0.482, 0.534),
            (side * 0.122, -0.515, 0.542),
            (side * 0.118, -0.532, 0.548),
        ]
        add_swept_tube(bm_glv, hand_path, [(0.032, 0.034), (0.034, 0.038), (0.026, 0.030)], segs=10)
    create_mesh_object("Driver_Gloves", bm_glv, mat_accent, shade_smooth=True, subdiv_levels=1, uv_scale=2.5)

    # --------------------------------------------------------------------------
    # H. SUSPENSION_ARMS: Double-Wishbone Airfoils, Pull/Pushrods & Brake Ducts
    # --------------------------------------------------------------------------
    bm_susp = bmesh.new()
    for side in (-1.0, 1.0):
        # Front Axle (y = -1.48, z = 0.34): Upper & Lower V-Wishbones + Tie-Rod + Pullrod
        add_strut(bm_susp, (side * 0.18, -1.62, 0.39), (side * 0.72, -1.48, 0.42), 0.009, 0.028, segs=6)
        add_strut(bm_susp, (side * 0.21, -1.32, 0.38), (side * 0.72, -1.48, 0.42), 0.009, 0.026, segs=6)
        add_strut(bm_susp, (side * 0.16, -1.60, 0.21), (side * 0.72, -1.48, 0.24), 0.009, 0.028, segs=6)
        add_strut(bm_susp, (side * 0.20, -1.30, 0.20), (side * 0.72, -1.48, 0.24), 0.009, 0.026, segs=6)
        add_strut(bm_susp, (side * 0.19, -1.52, 0.31), (side * 0.71, -1.52, 0.33), 0.008, 0.020, segs=6)  # Steering tie-rod
        add_strut(bm_susp, (side * 0.20, -1.38, 0.22), (side * 0.70, -1.48, 0.42), 0.010, 0.016, segs=8)  # Diagonal pullrod

        # Rear Axle (y = +1.42, z = 0.34): Upper & Lower V-Wishbones + Toe-Link + Pushrod
        add_strut(bm_susp, (side * 0.14,  1.18, 0.40), (side * 0.72,  1.42, 0.43), 0.010, 0.030, segs=6)
        add_strut(bm_susp, (side * 0.11,  1.52, 0.39), (side * 0.72,  1.42, 0.43), 0.010, 0.028, segs=6)
        add_strut(bm_susp, (side * 0.13,  1.20, 0.20), (side * 0.72,  1.42, 0.24), 0.010, 0.030, segs=6)
        add_strut(bm_susp, (side * 0.10,  1.54, 0.21), (side * 0.72,  1.42, 0.24), 0.010, 0.028, segs=6)
        add_strut(bm_susp, (side * 0.14,  1.26, 0.44), (side * 0.70,  1.42, 0.25), 0.011, 0.017, segs=8)  # Diagonal pushrod

        # Sculpted Carbon Brake Duct Drums & Aero Cooling Scoops (just inside wheel inner lip |x|=0.674)
        add_strut(bm_susp, (side * 0.66, -1.48, 0.34), (side * 0.73, -1.48, 0.34), 0.155, 0.155, segs=18, up_hint=(0, 0, 1))
        add_box(bm_susp, side * 0.65, -1.56, 0.36, 0.055, 0.12, 0.16)  # Front brake cooling scoop
        add_strut(bm_susp, (side * 0.66,  1.42, 0.34), (side * 0.73,  1.42, 0.34), 0.160, 0.160, segs=18, up_hint=(0, 0, 1))
        add_box(bm_susp, side * 0.65,  1.33, 0.37, 0.055, 0.14, 0.18)  # Rear brake duct winglets

    create_mesh_object("Suspension_Arms", bm_susp, mat_carbon, shade_smooth=True, uv_scale=2.4)

    # --------------------------------------------------------------------------
    # I. FRONT_WING_MAIN + SEPARATE FRONT_WING_ENDPLATE_L & R (WITH DIVEPLANES!)
    # --------------------------------------------------------------------------
    bm_fwc = bmesh.new()
    # Local coords centered around (0.0, -2.20, 0.10)
    # 4-Element Gull-Wing Cascaded Front Wing (Mainplane + 3 Stepped Slotted Flaps)
    fw_elements = [
        # (dy_le, dy_te, dz_center, dz_mid, dz_tip, camber, thick)
        (-0.22, -0.02, -0.028, -0.016, -0.022, 0.008, 0.024),  # Swept Mainplane
        (-0.08,  0.08,  0.002,  0.016,  0.010, 0.010, 0.020),  # 1st Cascade Flap
        ( 0.02,  0.15,  0.034,  0.052,  0.044, 0.012, 0.017),  # 2nd Cascade Flap
        ( 0.10,  0.21,  0.068,  0.088,  0.078, 0.014, 0.015),  # Upper High-Angle Aero Flap
    ]
    for (dle, dte, zc, zm, zt, cam, thk) in fw_elements:
        span_pts = [
            (-0.905, dle + 0.06, dte + 0.05, zt, cam, thk * 0.88),
            (-0.520, dle + 0.02, dte + 0.02, zm, cam, thk),
            (-0.160, dle - 0.02, dte,        zc, cam, thk),
            ( 0.000, dle - 0.04, dte - 0.01, zc - 0.006, cam, thk * 1.05),
            ( 0.160, dle - 0.02, dte,        zc, cam, thk),
            ( 0.520, dle + 0.02, dte + 0.02, zm, cam, thk),
            ( 0.905, dle + 0.06, dte + 0.05, zt, cam, thk * 0.88),
        ]
        add_airfoil_ribbon(bm_fwc, span_pts)

    # Twin sculpted nosecone aero pylons & inter-flap slot gap brackets
    for side in (-1.0, 1.0):
        add_strut(bm_fwc, (side * 0.095, -0.08, -0.01), (side * 0.072, 0.02, 0.115), 0.012, 0.085, segs=8, up_hint=(1, 0, 0))
        for bx in (0.38, 0.68):
            add_box(bm_fwc, side * bx, 0.06, 0.045, 0.010, 0.16, 0.085)

    create_mesh_object(
        "Front_Wing_Main",
        bm_fwc,
        mat_accent,
        shade_smooth=True,
        location=(0.0, -2.20, 0.10),
        uv_scale=1.8,
    )

    # Separate Front_Wing_Endplate_L & Front_Wing_Endplate_R with local origins for realistic damage tilt!
    for side, label in ((-1.0, "L"), (1.0, "R")):
        bm_fwe = bmesh.new()
        # Local origin at (side * 0.92, -2.20, 0.14)
        # Swept curved vertical endplate blade
        ep_rings = [
            [(side * -0.012, -0.22, -0.075), (side * 0.014, -0.22, -0.075), (side * 0.018, -0.14, 0.155), (side * -0.008, -0.14, 0.155)],
            [(side * -0.010,  0.02, -0.078), (side * 0.016,  0.02, -0.078), (side * 0.024,  0.04, 0.175), (side * -0.004,  0.04, 0.175)],
            [(side *  0.004,  0.24, -0.072), (side * 0.028,  0.24, -0.072), (side * 0.036,  0.25, 0.145), (side *  0.010,  0.25, 0.145)],
        ]
        if side < 0:
            ep_rings = [list(reversed(r)) for r in ep_rings]
        add_loft(bm_fwe, ep_rings, closed_ring=True, cap_start=True, cap_end=True)

        # Outwash footplate tunnel along bottom outer edge
        add_box(bm_fwe, side * 0.032, 0.01, -0.072, 0.075, 0.46, 0.020)

        # S-curved outboard aero diveplane / canard flick!
        dive_pts = [
            (side * 0.014, -0.14, -0.010),
            (side * 0.042,  0.02,  0.035),
            (side * 0.056,  0.18,  0.088),
        ]
        add_swept_tube(bm_fwe, dive_pts, (0.032, 0.008), segs=8, up_hint=(1.0, 0.0, 0.0), cap_ends=True)

        create_mesh_object(
            f"Front_Wing_Endplate_{label}",
            bm_fwe,
            mat_primary,
            shade_smooth=True,
            location=(side * 0.92, -2.20, 0.14),
            uv_scale=2.2,
        )

    # --------------------------------------------------------------------------
    # J. REAR_WING_MAIN + ARTICULATED REAR_WING_DRS_FLAP + ENDPLATES
    # --------------------------------------------------------------------------
    bm_rwm = bmesh.new()
    # Local coords centered at (0.0, 1.92, 0.73)
    # 1. Spoon-profile Rear-Wing Mainplane
    rw_main_span = [
        (-0.525, -0.12, 0.12,  0.012, -0.014, 0.030),
        (-0.260, -0.13, 0.12, -0.008, -0.018, 0.034),
        ( 0.000, -0.14, 0.12, -0.016, -0.020, 0.036),
        ( 0.260, -0.13, 0.12, -0.008, -0.018, 0.034),
        ( 0.525, -0.12, 0.12,  0.012, -0.014, 0.030),
    ]
    add_airfoil_ribbon(bm_rwm, rw_main_span)

    # 2. Lower Dual-Element Beam Wing above Exhaust & Diffuser (dz = -0.33 -> z = 0.40)
    beam_span = [
        (-0.48, -0.04, 0.11, -0.33, 0.010, 0.022),
        ( 0.00, -0.05, 0.12, -0.34, 0.012, 0.025),
        ( 0.48, -0.04, 0.11, -0.33, 0.010, 0.022),
    ]
    add_airfoil_ribbon(bm_rwm, beam_span)

    # 3. Twin Swan-Neck Aero Pylons arcing cleanly over the mainplane leading edge
    for side in (-1.0, 1.0):
        swan_path = [
            (side * 0.082, -0.26, -0.31),  # Anchors into gearbox/engine cover
            (side * 0.082, -0.18, -0.12),
            (side * 0.082, -0.16,  0.055), # Arcs above mainplane leading edge
            (side * 0.082, -0.06,  0.005), # Hooks down into top of mainplane!
        ]
        add_swept_tube(bm_rwm, swan_path, (0.012, 0.055), segs=10, up_hint=(1, 0, 0), cap_ends=True)

    # 4. Central DRS Hydraulic Actuator Pod (sits forward of DRS hinge so flap pivots cleanly)
    add_strut(bm_rwm, (0.0, -0.12, 0.00), (0.0, -0.04, 0.125), 0.018, 0.042, segs=8, up_hint=(1, 0, 0))
    add_box(bm_rwm, 0.0, -0.05, 0.135, 0.046, 0.15, 0.044)

    create_mesh_object(
        "Rear_Wing_Main",
        bm_rwm,
        mat_accent,
        shade_smooth=True,
        location=(0.0, 1.92, 0.73),
        uv_scale=1.8,
    )

    # SEPARATE ARTICULATED `Rear_Wing_DRS_Flap` (`Livery_Accent`)
    # Origin placed RIGHT along rear-upper hinge (y = 2.04, z = 0.85)!
    # Leading edge extends forward in local -Y (dy = -0.155 .. +0.010) so `drsFlap.rotation.x = -0.32`
    # in Three.js lifts the leading edge cleanly upward to open the DRS slot gap!
    bm_drs = bmesh.new()
    drs_span = [
        (-0.518, -0.150, 0.012, -0.010, 0.012, 0.022),
        (-0.260, -0.158, 0.012, -0.016, 0.014, 0.024),
        ( 0.000, -0.152, 0.008, -0.018, 0.014, 0.024),
        ( 0.260, -0.158, 0.012, -0.016, 0.014, 0.024),
        ( 0.518, -0.150, 0.012, -0.010, 0.012, 0.022),
    ]
    add_airfoil_ribbon(bm_drs, drs_span)
    # Crisp trailing-edge Gurney lip along hinge line
    add_box(bm_drs, 0.0, 0.010, 0.006, 1.03, 0.008, 0.014)
    # Outboard DRS pivot pins connecting into endplates
    for side in (-1.0, 1.0):
        add_strut(bm_drs, (side * 0.515, 0.0, 0.0), (side * 0.535, 0.0, 0.0), 0.010, 0.010, segs=8, up_hint=(0, 0, 1))

    create_mesh_object(
        "Rear_Wing_DRS_Flap",
        bm_drs,
        mat_accent,
        shade_smooth=True,
        location=(0.0, 2.04, 0.85),
        uv_scale=2.0,
    )

    # Sculpted Rear Wing Endplates (Left & Right)
    for side, label in ((-1.0, "L"), (1.0, "R")):
        bm_rwe = bmesh.new()
        # Local origin at (side * 0.54, 1.95, 0.68)
        rwe_rings = [
            [(side * -0.014, -0.18, -0.26), (side * 0.014, -0.18, -0.26), (side * 0.014, -0.16, 0.22), (side * -0.014, -0.16, 0.22)],
            [(side * -0.014,  0.04, -0.24), (side * 0.014,  0.04, -0.24), (side * 0.014,  0.06, 0.23), (side * -0.014,  0.06, 0.23)],
            [(side * -0.012,  0.19, -0.16), (side * 0.012,  0.19, -0.16), (side * 0.012,  0.20, 0.20), (side * -0.012,  0.20, 0.20)],
        ]
        if side < 0:
            rwe_rings = [list(reversed(r)) for r in rwe_rings]
        add_loft(bm_rwe, rwe_rings, closed_ring=True, cap_start=True, cap_end=True)

        # 3 outboard vortex-control gill strakes on outer rear-wing endplate face
        for g in range(3):
            add_box(bm_rwe, side * 0.018, -0.02 + g * 0.065, 0.11 - g * 0.035, 0.010, 0.14, 0.012)

        create_mesh_object(
            f"Rear_Wing_Endplate_{label}",
            bm_rwe,
            mat_primary,
            shade_smooth=True,
            location=(side * 0.54, 1.95, 0.68),
            uv_scale=2.0,
        )

    # --------------------------------------------------------------------------
    # K. EXHAUST_PIPE (CENTRAL TITANIUM TAILPIPE + TWIN WASTEGATES) & RAIN LIGHT
    # --------------------------------------------------------------------------
    bm_exh = bmesh.new()

    def add_hollow_pipe(cx, cy_start, cy_end, cz, r_out, r_in, segs=24):
        # Hollow thin-walled titanium nozzle (outer wall -> lip -> recessed bore)
        stations = [
            (cy_start, r_out * 0.94),
            (cy_end,   r_out),
            (cy_end,   r_in),
            (cy_start + 0.05, r_in * 0.92),
        ]
        rings = []
        for (py, pr) in stations:
            ring = []
            for s in range(segs):
                a = (2.0 * math.pi * s) / segs
                ring.append((cx + math.cos(a) * pr, py, cz + math.sin(a) * pr))
            rings.append(ring)
        add_loft(bm_exh, rings, closed_ring=True, cap_start=True, cap_end=True)

    # Central primary V6/V10 megaphone tailpipe at (0.0, 1.98, 0.35)
    add_hollow_pipe(0.0, 1.78, 2.09, 0.35, 0.058, 0.048, segs=28)
    # Twin flanking wastegate tailpipes at (±0.072, 1.97, 0.33) — matches models.js wgLeft/wgRight!
    for side in (-1.0, 1.0):
        add_hollow_pipe(side * 0.072, 1.82, 2.08, 0.33, 0.024, 0.018, segs=18)

    create_mesh_object("Exhaust_Pipe", bm_exh, mat_metal, shade_smooth=True, uv_scale=3.0)

    # Glowing FIA Rear Rain / ERS Harvesting LED Matrix Lens
    bm_rl = bmesh.new()
    add_box(bm_rl, 0.0, 2.068, 0.212, 0.052, 0.022, 0.108)
    create_mesh_object("Rear_Rain_Light", bm_rl, mat_rainlight, shade_smooth=False, uv_scale=4.0)

    export_asset("f1_car")


# ==============================================================================
# 2. FORGED 10-SPOKE MOTORSPORT WHEEL, PIRELLI STRIPES & SLOTTED ROTOR (f1_wheel.glb)
# ==============================================================================

def build_f1_wheel():
    reset_scene()

    # Exact material names listed in modeling specification
    mat_rubber = make_mat("Tire_Rubber", (0.062, 0.065, 0.072), metallic=0.06, roughness=0.62)
    mat_compound = make_mat(
        "Compound_Stripe",
        (0.98, 0.12, 0.14),
        metallic=0.10,
        roughness=0.30,
        emission=(0.98, 0.12, 0.14),
        emission_strength=0.65,
    )
    mat_rim = make_mat("Wheel_Rim", (0.25, 0.27, 0.32), metallic=0.90, roughness=0.20)
    mat_nut = make_mat("Center_Nut_Mat", (0.90, 0.18, 0.18), metallic=0.88, roughness=0.18)
    mat_disc = make_mat(
        "Brake_Disc",
        (0.32, 0.30, 0.28),
        metallic=0.80,
        roughness=0.28,
        emission=(1.0, 0.32, 0.02),
        emission_strength=0.0,
    )

    # 1. Sculpted Rounded Racing Slick Profile (48 radial segments x 13 profile rings + Cylindrical UVs!)
    bm_tire = bmesh.new()
    segs = 48
    prof = [
        (-0.178, 0.194, 0.00),
        (-0.184, 0.220, 0.06),
        (-0.187, 0.262, 0.12),
        (-0.182, 0.305, 0.18),
        (-0.166, 0.332, 0.24),
        (-0.132, 0.343, 0.32),
        ( 0.000, 0.346, 0.50),
        ( 0.132, 0.343, 0.68),
        ( 0.166, 0.332, 0.76),
        ( 0.182, 0.305, 0.82),
        ( 0.187, 0.262, 0.88),
        ( 0.184, 0.220, 0.94),
        ( 0.178, 0.194, 1.00),
    ]
    t_rings = []
    for (px, pr, _) in prof:
        ring = []
        for i in range(segs):
            ang = (2.0 * math.pi * i) / segs
            ring.append(bm_tire.verts.new((px, math.cos(ang) * pr, math.sin(ang) * pr)))
        t_rings.append(ring)

    uv_tire = bm_tire.loops.layers.uv.verify()
    for k in range(len(t_rings) - 1):
        r0, r1 = t_rings[k], t_rings[k + 1]
        u0, u1 = prof[k][2], prof[k + 1][2]
        for i in range(segs):
            inext = (i + 1) % segs
            v0 = i / segs
            v1 = (i + 1) / segs
            f = bm_tire.faces.new([r0[i], r0[inext], r1[inext], r1[i]])
            f.loops[0][uv_tire].uv = (u0, v0)
            f.loops[1][uv_tire].uv = (u0, v1)
            f.loops[2][uv_tire].uv = (u1, v1)
            f.loops[3][uv_tire].uv = (u1, v0)

    create_mesh_object("Tire_Tread", bm_tire, mat_rubber, shade_smooth=True, auto_uv=False)

    # 2. Dual Outer + Inner Pirelli-Style Curved Sidewall Compound Stripes
    #    3 broken racing arc bands per sidewall so wheel spin reads dynamically at 60fps!
    bm_ring = bmesh.new()
    for side in (-1.0, 1.0):
        x_sw = side * 0.1885
        # 3 bold curved Pirelli arc segments (100 deg each, 20 deg lettering gaps)
        for arc_idx in range(3):
            base_deg = arc_idx * 120.0 + 10.0
            arc_steps = 16
            v_in, v_out = [], []
            for s in range(arc_steps + 1):
                ang = math.radians(base_deg + (100.0 * s) / arc_steps)
                cy, cz = math.cos(ang), math.sin(ang)
                v_in.append(bm_ring.verts.new((x_sw, cy * 0.232, cz * 0.232)))
                v_out.append(bm_ring.verts.new((x_sw, cy * 0.278, cz * 0.278)))
            for s in range(arc_steps):
                if side > 0:
                    bm_ring.faces.new([v_in[s], v_out[s], v_out[s + 1], v_in[s + 1]])
                else:
                    bm_ring.faces.new([v_in[s], v_in[s + 1], v_out[s + 1], v_out[s]])

        # Continuous fine inner rim-lip accent ring
        p_in, p_out = [], []
        for i in range(segs):
            ang = (2.0 * math.pi * i) / segs
            cy, cz = math.cos(ang), math.sin(ang)
            p_in.append(bm_ring.verts.new((side * 0.1855, cy * 0.205, cz * 0.205)))
            p_out.append(bm_ring.verts.new((side * 0.1865, cy * 0.216, cz * 0.216)))
        for i in range(segs):
            inext = (i + 1) % segs
            if side > 0:
                bm_ring.faces.new([p_in[i], p_out[i], p_out[inext], p_in[inext]])
            else:
                bm_ring.faces.new([p_in[i], p_in[inext], p_out[inext], p_out[i]])

    create_mesh_object("Compound_Sidewall", bm_ring, mat_compound, shade_smooth=True)

    # 3. Forged 10-Spoke Motorsport Alloy Rim (Machined Barrel + Recessed Hub + 10 Sculpted Spokes)
    #    Built symmetrically on both -X and +X faces so FL/RL and FR/RR both display concave forged spokes!
    bm_rim = bmesh.new()
    rim_segs = 40
    barrel_prof = [
        (-0.182, 0.200),
        (-0.182, 0.188),
        (-0.155, 0.184),
        ( 0.000, 0.180),
        ( 0.155, 0.184),
        ( 0.182, 0.188),
        ( 0.182, 0.200),
        ( 0.168, 0.196),
        ( 0.000, 0.192),
        (-0.168, 0.196),
    ]
    b_rings = []
    for (bx, br) in barrel_prof:
        ring = []
        for i in range(rim_segs):
            ang = (2.0 * math.pi * i) / rim_segs
            ring.append((bx, math.cos(ang) * br, math.sin(ang) * br))
        b_rings.append(ring)
    add_loft(bm_rim, b_rings, closed_ring=True, cap_start=False, cap_end=False)
    # Close barrel profile loop
    r_first = [bm_rim.verts.new(p) for p in b_rings[0]]
    r_last = [bm_rim.verts.new(p) for p in b_rings[-1]]
    for i in range(rim_segs):
        inext = (i + 1) % rim_segs
        bm_rim.faces.new([r_last[i], r_last[inext], r_first[inext], r_first[i]])

    # Central forged hub cylinder connecting inner & outer lug bowls
    add_strut(bm_rim, (-0.156, 0.0, 0.0), (0.156, 0.0, 0.0), 0.072, 0.072, segs=24, up_hint=(0, 0, 1))

    # 10 Crisp Forged Concave Spokes on BOTH Wheel Faces!
    for side in (-1.0, 1.0):
        for sp_i in range(10):
            ang = (2.0 * math.pi * sp_i) / 10.0
            cy, cz = math.cos(ang), math.sin(ang)
            ty, tz = -cz, cy
            p_hub = (side * 0.142, cy * 0.064, cz * 0.064)
            p_mid = (side * 0.158, cy * 0.128, cz * 0.128)
            p_rim = (side * 0.174, cy * 0.190, cz * 0.190)
            add_swept_tube(
                bm_rim,
                [p_hub, p_mid, p_rim],
                [(0.013, 0.015), (0.010, 0.012), (0.012, 0.016)],
                segs=8,
                up_hint=(0.0, ty, tz),
                cap_ends=True,
            )

    create_mesh_object("Wheel_Rim", bm_rim, mat_rim, shade_smooth=False, uv_scale=3.0)

    # 4. Machined Anodized FIA Center-Lock Wheel Nut (Hex/Octagonal Splined Nut on Both Faces)
    bm_nut = bmesh.new()
    add_strut(bm_nut, (-0.182, 0.0, 0.0), (0.182, 0.0, 0.0), 0.046, 0.046, segs=8, up_hint=(0, 0, 1))
    for side in (-1.0, 1.0):
        add_strut(bm_nut, (side * 0.148, 0.0, 0.0), (side * 0.168, 0.0, 0.0), 0.056, 0.056, segs=16, up_hint=(0, 0, 1))
    create_mesh_object("Center_Lock_Nut", bm_nut, mat_nut, shade_smooth=False, uv_scale=4.0)

    # 5. Slotted Carbon-Ceramic Brake Disc + Machined Rotor Bell + Radial Planar UVs!
    bm_disc = bmesh.new()
    disc_segs = 48
    r_outer = 0.176
    r_bell = 0.088
    # Ventilated rotor ring + recessed central bell
    disc_prof = [
        (-0.026, r_bell),
        (-0.026, r_outer),
        ( 0.026, r_outer),
        ( 0.026, r_bell),
        ( 0.014, 0.052),
        (-0.014, 0.052),
    ]
    d_rings = []
    for (dx, dr) in disc_prof:
        ring = []
        for i in range(disc_segs):
            ang = (2.0 * math.pi * i) / disc_segs
            ring.append(bm_disc.verts.new((dx, math.cos(ang) * dr, math.sin(ang) * dr)))
        d_rings.append(ring)
    for k in range(len(d_rings)):
        r0 = d_rings[k]
        r1 = d_rings[(k + 1) % len(d_rings)]
        for i in range(disc_segs):
            inext = (i + 1) % disc_segs
            bm_disc.faces.new([r0[i], r0[inext], r1[inext], r1[i]])

    # 16 Sculpted Radial Slotted Friction Ribs on both rotor faces
    for side in (-1.0, 1.0):
        for sl in range(16):
            ang = (2.0 * math.pi * sl) / 16.0 + 0.12
            cy0, cz0 = math.cos(ang), math.sin(ang)
            cy1, cz1 = math.cos(ang + 0.14), math.sin(ang + 0.14)
            add_strut(
                bm_disc,
                (side * 0.026, cy0 * 0.096, cz0 * 0.096),
                (side * 0.026, cy1 * 0.168, cz1 * 0.168),
                0.0035,
                0.0045,
                segs=4,
                up_hint=(1, 0, 0),
            )

    # Custom Planar Radial UV mapping centered at (0.5, 0.5) so getBrakeRotorTexture() glows concentrically!
    bmesh.ops.recalc_face_normals(bm_disc, faces=bm_disc.faces)
    uv_disc = bm_disc.loops.layers.uv.verify()
    for f in bm_disc.faces:
        for loop in f.loops:
            co = loop.vert.co
            u = 0.5 + (co.y / r_outer) * 0.465
            v = 0.5 + (co.z / r_outer) * 0.465
            loop[uv_disc].uv = (u, v)

    create_mesh_object("Brake_Disc", bm_disc, mat_disc, shade_smooth=False, auto_uv=False)

    export_asset("f1_wheel")


# ==============================================================================
# 3. ARTICULATED PIT CREW MECHANIC & PAOLI PNEUMATIC WHEEL GUN (pit_crew.glb)
# ==============================================================================

def build_pit_crew():
    """
    -Y in Blender exports to +Z in Three.js (forward toward the F1 car in PitCrewDiorama!).
    Feet planted cleanly at Z = 0.0.
    """
    reset_scene()

    mat_suit = make_mat("Crew_Suit", (0.86, 0.08, 0.12), metallic=0.14, roughness=0.52)
    mat_stripe = make_mat("Crew_Stripe_Mat", (0.96, 0.97, 0.99), metallic=0.20, roughness=0.38)
    mat_helm = make_mat("Crew_Helmet_Mat", (0.95, 0.96, 0.99), metallic=0.38, roughness=0.16)
    mat_visor = make_mat("Crew_Visor", (0.015, 0.04, 0.09), metallic=0.96, roughness=0.05)
    mat_equip = make_mat("Crew_Equip", (0.09, 0.11, 0.14), metallic=0.68, roughness=0.30)

    # 1. Articulated Kneeling-Ready Pit Mechanic Suit (Torso, Angled Thighs/Shins & Reaching Arms)
    bm_suit = bmesh.new()

    # Asymmetric dynamic athletic pit-gunner stance: left knee forward/low, right knee stabilizing!
    leg_configs = [
        # (hip, knee, ankle, toe)
        ((-0.125,  0.06, 0.80), (-0.135, -0.17, 0.44), (-0.135,  0.04, 0.09), (-0.135, -0.12, 0.045)),
        (( 0.125,  0.08, 0.80), ( 0.135, -0.12, 0.47), ( 0.135,  0.10, 0.09), ( 0.135, -0.06, 0.045)),
    ]
    for (hip, knee, ankle, _) in leg_configs:
        add_swept_tube(bm_suit, [hip, knee, ankle], [(0.082, 0.086), (0.072, 0.076), (0.056, 0.060)], segs=10)

    # Articulated Pelvis, Waist & Forward-Leaning Athletic Torso
    torso_stations = [
        [(-0.17,  0.14, 0.76), (0.17,  0.14, 0.76), (0.17, -0.03, 0.78), (-0.17, -0.03, 0.78)],
        [(-0.16,  0.11, 0.96), (0.16,  0.11, 0.96), (0.16, -0.07, 0.98), (-0.16, -0.07, 0.98)],
        [(-0.21,  0.07, 1.18), (0.21,  0.07, 1.18), (0.21, -0.13, 1.21), (-0.21, -0.13, 1.21)],
        [(-0.17,  0.04, 1.32), (0.17,  0.04, 1.32), (0.17, -0.14, 1.34), (-0.17, -0.14, 1.34)],
    ]
    add_loft(bm_suit, torso_stations, closed_ring=True, cap_start=True, cap_end=True)

    # Articulated Left & Right Arms Reaching Forward to Grip the Pneumatic Wheel Gun
    add_swept_tube(
        bm_suit,
        [(-0.21, -0.04, 1.24), (-0.22, -0.22, 1.02), (-0.09, -0.44, 0.86)],
        [(0.064, 0.066), (0.054, 0.056), (0.044, 0.046)],
        segs=10,
    )
    add_swept_tube(
        bm_suit,
        [(0.21, -0.04, 1.24), (0.20, -0.20, 1.00), (0.04, -0.34, 0.84)],
        [(0.064, 0.066), (0.054, 0.056), (0.044, 0.046)],
        segs=10,
    )

    create_mesh_object("Crew_Suit", bm_suit, mat_suit, shade_smooth=True, subdiv_levels=1, uv_scale=1.6)

    # 2. Racing Suit Chest Stripes, Shoulder Epaulettes & Belt
    bm_st = bmesh.new()
    add_box(bm_st, 0.0, -0.125, 1.14, 0.37, 0.025, 0.085)  # Bold chest team band
    add_box(bm_st, 0.0,  0.040, 0.88, 0.33, 0.195, 0.050)  # Nomex waist belt
    for side in (-1.0, 1.0):
        add_box(bm_st, side * 0.18, -0.05, 1.335, 0.09, 0.14, 0.025)  # Shoulder epaulettes
    create_mesh_object("Crew_Chest_Stripe", bm_st, mat_stripe, shade_smooth=False)

    # 3. Aero Pit-Crew Helmet + Curved Chrome/Tinted Visor
    bpy.ops.mesh.primitive_uv_sphere_add(segments=26, ring_count=18, radius=0.152, location=(0.0, -0.065, 1.48))
    chelm = bpy.context.active_object
    chelm.name = "Crew_Helmet"
    chelm.scale = (0.92, 1.08, 0.98)
    chelm.data.materials.append(mat_helm)
    for p in chelm.data.polygons:
        p.use_smooth = True

    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=14, radius=0.146, location=(0.0, -0.118, 1.475))
    cvis = bpy.context.active_object
    cvis.name = "Crew_Visor"
    cvis.scale = (0.88, 1.04, 0.54)
    cvis.data.materials.append(mat_visor)
    for p in cvis.data.polygons:
        p.use_smooth = True

    # 4. Molded Carbon Knee Pads, Racing Boots, Radio Headset & Detailed Paoli Pneumatic Wheel Gun!
    bm_eq = bmesh.new()

    # Molded Kevlar/Carbon Knee Pads strapped over both bent knees + Racing Boots
    add_box(bm_eq, -0.135, -0.225, 0.445, 0.135, 0.075, 0.155)
    add_box(bm_eq,  0.135, -0.175, 0.475, 0.135, 0.075, 0.155)
    add_box(bm_eq, -0.135, -0.045, 0.055, 0.115, 0.230, 0.110)
    add_box(bm_eq,  0.135,  0.015, 0.055, 0.115, 0.230, 0.110)

    # Helmet Comms Ear-Cups + Boom Mic + Belt Radio Pack
    for side in (-1.0, 1.0):
        add_box(bm_eq, side * 0.148, -0.055, 1.47, 0.036, 0.095, 0.095)
    add_strut(bm_eq, (-0.145, -0.08, 1.44), (-0.04, -0.22, 1.40), 0.008, 0.008, segs=6)
    add_box(bm_eq, 0.0, 0.15, 0.89, 0.12, 0.06, 0.11)

    # High-Detail Paoli F1 Pneumatic Impact Wheel Gun (aimed forward along -Y!)
    # Main machined alloy motor housing
    add_strut(bm_eq, (0.0, -0.26, 0.87), (0.0, -0.50, 0.84), 0.054, 0.058, segs=16, up_hint=(0, 0, 1))
    # Top torque-light bar housing
    add_box(bm_eq, 0.0, -0.37, 0.935, 0.052, 0.19, 0.032)
    # High-speed drive anvil + flared conical center-lock wheel socket
    add_strut(bm_eq, (0.0, -0.50, 0.84), (0.0, -0.62, 0.825), 0.026, 0.026, segs=14, up_hint=(0, 0, 1))
    add_swept_tube(
        bm_eq,
        [(0.0, -0.61, 0.826), (0.0, -0.695, 0.815)],
        [(0.032, 0.032), (0.054, 0.054)],
        segs=16,
        up_hint=(0, 0, 1),
    )
    # Rear pistol grip + left auxiliary side stabilizing handle + pneumatic air-hose whip
    add_strut(bm_eq, (0.02, -0.32, 0.85), (0.03, -0.30, 0.71), 0.020, 0.028, segs=8, up_hint=(1, 0, 0))
    add_strut(bm_eq, (-0.03, -0.45, 0.85), (-0.13, -0.45, 0.86), 0.018, 0.018, segs=8, up_hint=(0, 0, 1))
    add_swept_tube(
        bm_eq,
        [(0.02, -0.26, 0.72), (0.06, -0.16, 0.62), (0.12, -0.02, 0.58)],
        (0.014, 0.014),
        segs=8,
    )

    create_mesh_object("Crew_Equipment", bm_eq, mat_equip, shade_smooth=True, uv_scale=2.5)

    export_asset("pit_crew")


# ==============================================================================
# 4. MULTI-STRATA ICONIC MOUNT FUJI STRATOVOLCANO (mount_fuji.glb)
# ==============================================================================

def build_mount_fuji():
    """
    3-Material Iconic Mount Fuji Stratovolcano (NEVER a plain white cone!):
      - `Fuji_Forest_Base`: Lush dark Japanese cedar green (#1e4628) sweeping foothills skirt
      - `Fuji_Volcanic_Slope`: Deep blue-slate basalt rock (#2c4263) with sculpted radial ridge gullies
      - `Fuji_Snow_Cap`: Jagged snow ridges (#f4f8ff) draped asymmetrically across upper ~38% & 8-peak crater rim
    Preserves exact base_radius = 480.0 and peak_height = 188.0!
    """
    reset_scene()

    c_forest = hex_to_linear_rgb("#1e4628")
    c_basalt = hex_to_linear_rgb("#2c4263")
    c_snow = hex_to_linear_rgb("#f4f8ff")

    mat_forest = make_mat("Fuji_Forest_Base", c_forest, metallic=0.02, roughness=0.88)
    mat_slope = make_mat("Fuji_Volcanic_Slope", c_basalt, metallic=0.04, roughness=0.84)
    mat_snow = make_mat(
        "Fuji_Snow_Cap",
        c_snow,
        metallic=0.05,
        roughness=0.34,
        emission=(0.86, 0.92, 1.00),
        emission_strength=0.18,
    )

    segs = 128
    base_radius = 480.0
    peak_height = 188.0

    # Authentic concave Fuji-san catenary profile (h_frac -> r_frac)
    def base_profile_r(hf):
        # Smooth exponential concave curve from r=1.0 at h=0 to r=0.064 at crater rim h=1.0
        return 0.064 + 0.936 * ((1.0 - hf) ** 1.88)

    def ridge_displacement(ang, hf):
        # Multi-harmonic eroded radial volcanic ridges + Hoeizan parasitic flank bulge around ang ~ 0.9 rad
        sharp_ribs = (
            0.042 * math.sin(ang * 9.0 + 0.25)
            + 0.028 * math.cos(ang * 17.0 - 0.6)
            + 0.016 * (1.0 - 2.0 * abs(math.sin(ang * 13.0 + 0.4)))
            + 0.009 * math.sin(ang * 31.0 + 1.1)
        )
        # Stronger gullies on mid-upper volcanic cone, gentler at wide base skirt
        amp = math.sin(min(1.0, hf * 1.35) * math.pi * 0.68)
        hoeizan = 0.055 * math.exp(-(((ang - 0.95) / 0.34) ** 2)) * math.exp(-(((hf - 0.48) / 0.16) ** 2))
        return 1.0 + amp * sharp_ribs + hoeizan

    def crater_rim_wave(ang):
        # Iconic 8-petal Hasshin-po jagged summit caldera peaks (Kengamine highest peak!)
        return 1.0 + 0.022 * math.sin(ang * 8.0 + 0.4) + 0.014 * math.cos(ang * 3.0 - 0.8)

    def timber_line_h(ang):
        # Organic undulating cedar forest treeline (~22% to 30% elevation)
        return (
            0.255
            + 0.036 * math.sin(ang * 7.0 + 0.5)
            + 0.022 * math.cos(ang * 13.0 - 0.3)
            + 0.014 * math.sin(ang * 23.0)
        )

    def snow_line_h(ang):
        # Asymmetric jagged snowcap (~upper 38%: mean h=0.62, plunging to 0.51 in gullies & 0.73 on rocky ribs!)
        chute = -0.095 * (abs(math.sin(ang * 9.0 + 0.25)) ** 1.6)
        drift = 0.042 * math.cos(ang * 4.0 + 0.9) + 0.028 * math.sin(ang * 15.0 - 0.4)
        return max(0.50, min(0.75, 0.655 + chute + drift))

    # --------------------------------------------------------------------------
    # Stratum 1: Fuji_Forest_Base (Lush Dark Cedar Foothills Skirt, h = 0 .. timberline)
    # --------------------------------------------------------------------------
    bm_forest = bmesh.new()
    forest_steps = 7
    f_rings = []
    for s_idx in range(forest_steps):
        u = s_idx / (forest_steps - 1)
        ring = []
        for i in range(segs):
            ang = (2.0 * math.pi * i) / segs
            hf = u * timber_line_h(ang)
            rf = base_profile_r(hf) * ridge_displacement(ang, hf)
            # Slight outer skirt proudness (1.008 -> 0.994 at top) so timberline tucks cleanly into basalt rock
            proud = 1.008 - 0.014 * u
            r = base_radius * rf * proud
            z = peak_height * hf
            ring.append((math.cos(ang) * r, math.sin(ang) * r, z))
        f_rings.append(ring)
    add_loft(bm_forest, f_rings, closed_ring=True, cap_start=False, cap_end=False)
    create_mesh_object("Fuji_Forest_Base", bm_forest, mat_forest, shade_smooth=False, uv_scale=0.02)

    # --------------------------------------------------------------------------
    # Stratum 2: Fuji_Volcanic_Slope (Deep Blue-Slate Basalt Rock + Radial Gullies + Caldera Bowl)
    # --------------------------------------------------------------------------
    bm_slope = bmesh.new()
    slope_fracs = [0.16, 0.23, 0.30, 0.38, 0.46, 0.54, 0.62, 0.70, 0.78, 0.86, 0.93, 0.98, 1.00]
    s_rings = []
    for hf in slope_fracs:
        ring = []
        for i in range(segs):
            ang = (2.0 * math.pi * i) / segs
            rf = base_profile_r(hf) * ridge_displacement(ang, hf)
            r = base_radius * rf
            rim_k = crater_rim_wave(ang) if hf > 0.88 else 1.0
            z = peak_height * hf * (1.0 + (rim_k - 1.0) * ((hf - 0.88) / 0.12 if hf > 0.88 else 0.0))
            ring.append((math.cos(ang) * r, math.sin(ang) * r, z))
        s_rings.append(ring)

    # Sunken volcanic summit caldera interior bowl so Fuji looks authentic from helicopter/aerial cams!
    caldera_ring = []
    for i in range(segs):
        ang = (2.0 * math.pi * i) / segs
        r_in = base_radius * 0.032 * (1.0 + 0.08 * math.sin(ang * 6.0))
        caldera_ring.append((math.cos(ang) * r_in, math.sin(ang) * r_in, peak_height * 0.90))
    s_rings.append(caldera_ring)

    add_loft(bm_slope, s_rings, closed_ring=True, cap_start=False, cap_end=True)
    create_mesh_object("Fuji_Volcanic_Slope", bm_slope, mat_slope, shade_smooth=False, uv_scale=0.02)

    # --------------------------------------------------------------------------
    # Stratum 3: Fuji_Snow_Cap (Sculpted Jagged Snow Ridges across Upper ~38% + Crater Rim)
    # --------------------------------------------------------------------------
    bm_snow = bmesh.new()
    snow_steps = 11
    sn_rings = []
    for s_idx in range(snow_steps):
        u = s_idx / (snow_steps - 1)
        ring = []
        for i in range(segs):
            ang = (2.0 * math.pi * i) / segs
            h_start = snow_line_h(ang)
            hf = h_start + u * (1.0 - h_start)
            rf = base_profile_r(hf) * ridge_displacement(ang, hf)
            # Snowpack sits cleanly proud (+2.4m) over basalt gullies, tapering at lower tongue tips
            snow_proud = 0.4 + 2.2 * math.sin(min(1.0, u * 2.2) * math.pi * 0.5)
            r = base_radius * rf + snow_proud
            rim_k = crater_rim_wave(ang) if hf > 0.86 else 1.0
            z = peak_height * hf * (1.0 + (rim_k - 1.0) * max(0.0, (hf - 0.86) / 0.14)) + 0.45
            ring.append((math.cos(ang) * r, math.sin(ang) * r, z))
        sn_rings.append(ring)

    # Snow-dusted inner crater lip
    crater_lip_in = []
    for i in range(segs):
        ang = (2.0 * math.pi * i) / segs
        r_lip = base_radius * 0.048 * (1.0 + 0.06 * math.sin(ang * 8.0))
        crater_lip_in.append((math.cos(ang) * r_lip, math.sin(ang) * r_lip, peak_height * 0.955))
    sn_rings.append(crater_lip_in)

    add_loft(bm_snow, sn_rings, closed_ring=True, cap_start=False, cap_end=False)
    create_mesh_object("Fuji_Snow_Cap", bm_snow, mat_snow, shade_smooth=False, uv_scale=0.025)

    export_asset("mount_fuji")


# ==============================================================================
# 5. SLEEK 3-DECK MONTE CARLO SUPERYACHT (yacht.glb)
# ==============================================================================

def build_luxury_yacht():
    """
    3-Deck Monte Carlo Superyacht for Monaco Harbor:
      - Lofted flared clipper bow & stern swim platform (`Yacht_Hull_White`)
      - Vibrant turquoise waterline stripe (`Yacht_Turquoise_Stripe`) & deep navy boot-top (`Yacht_Navy_Trim`)
      - Tinted wraparound pilot bridge windshield & panoramic salon glass (`Yacht_Glass`)
      - Swept aerodynamic radar arch + twin Satcom radomes
      - Laid Burmese teak decks, foredeck/flybridge sunpads, sky-lounge jacuzzi & chrome bow rails!
    """
    reset_scene()

    mat_white = make_mat("Yacht_Hull_White", hex_to_linear_rgb("#f6f9fd"), metallic=0.18, roughness=0.16)
    mat_turq = make_mat(
        "Yacht_Turquoise_Stripe",
        hex_to_linear_rgb("#00d4e8"),
        metallic=0.32,
        roughness=0.18,
        emission=hex_to_linear_rgb("#00b8d4"),
        emission_strength=0.32,
    )
    mat_navy = make_mat("Yacht_Navy_Trim", hex_to_linear_rgb("#0c1d3d"), metallic=0.36, roughness=0.24)
    mat_glass = make_mat(
        "Yacht_Glass",
        hex_to_linear_rgb("#0b2e4f"),
        metallic=0.90,
        roughness=0.06,
        emission=hex_to_linear_rgb("#38a8e8"),
        emission_strength=0.42,
    )
    mat_teak = make_mat("Yacht_Teak_Deck", hex_to_linear_rgb("#a67242"), metallic=0.04, roughness=0.62)
    mat_sunpad = make_mat("Yacht_Sunpad_Cushion", hex_to_linear_rgb("#f7efe0"), metallic=0.05, roughness=0.46)
    mat_chrome = make_mat("Yacht_Chrome_Rail", (0.86, 0.89, 0.93), metallic=0.96, roughness=0.12)

    # 1. Lofted Flared Clipper Hull + 3 Aerodynamic Stepped Decks + Swept Radar Arch
    bm_hull = bmesh.new()

    # 9 Hull stations from sharp raked bow (-19.8) to wide stern transom (+15.6)
    hull_stations = [
        # (y, hw_keel, hw_chine, hw_sheer, z_keel, z_chine, z_sheer)
        (-19.8, 0.04, 0.14, 0.36, 1.35, 2.35, 3.85),  # Raked clipper stem
        (-16.5, 0.45, 1.15, 1.85, 0.25, 1.65, 3.72),
        (-12.0, 1.15, 2.25, 2.95, 0.05, 1.45, 3.58),
        ( -6.0, 1.85, 3.05, 3.55, 0.00, 1.35, 3.45),
        (  0.0, 2.15, 3.35, 3.68, 0.00, 1.30, 3.38),
        (  6.5, 2.20, 3.38, 3.65, 0.02, 1.28, 3.32),
        ( 12.2, 2.10, 3.25, 3.50, 0.08, 1.24, 3.22),
        ( 14.8, 1.95, 3.05, 3.28, 0.14, 1.05, 2.35),  # Sloped transom stairs step-down
        ( 16.4, 1.75, 2.85, 2.95, 0.22, 0.65, 0.95),  # Integrated stern swim platform!
    ]
    h_rings = []
    for (y, hwk, hwc, hws, zk, zc, zs) in hull_stations:
        h_rings.append([
            (-hwk, y, zk),
            ( hwk, y, zk),
            ( hwc, y, zc),
            ( hws, y, zs),
            (-hws, y, zs),
            (-hwc, y, zc),
        ])
    add_loft(bm_hull, h_rings, closed_ring=True, cap_start=True, cap_end=True)

    # Deck 1: Sleek Raked Main Salon Superstructure (z = 3.3 .. 5.25)
    d1_rings = [
        [(-1.75, -7.8, 3.42), (1.75, -7.8, 3.42), (1.45, -5.8, 5.22), (-1.45, -5.8, 5.22)],
        [(-2.85, -3.5, 3.38), (2.85, -3.5, 3.38), (2.68, -3.2, 5.25), (-2.68, -3.2, 5.25)],
        [(-2.88,  9.2, 3.30), (2.88,  9.2, 3.30), (2.72, 10.6, 5.25), (-2.72, 10.6, 5.25)],
    ]
    add_loft(bm_hull, d1_rings, closed_ring=True, cap_start=True, cap_end=True)

    # Deck 2: Upper Pilot Bridge & Sky-Lounge Deck (z = 5.22 .. 7.05) + Aft Sun Overhang
    d2_rings = [
        [(-1.55, -4.6, 5.22), (1.55, -4.6, 5.22), (1.32, -2.6, 7.05), (-1.32, -2.6, 7.05)],
        [(-2.35, -1.2, 5.22), (2.35, -1.2, 5.22), (2.18, -1.0, 7.05), (-2.18, -1.0, 7.05)],
        [(-2.35,  7.4, 5.22), (2.35,  7.4, 5.22), (2.22,  9.2, 7.05), (-2.22,  9.2, 7.05)],
    ]
    add_loft(bm_hull, d2_rings, closed_ring=True, cap_start=True, cap_end=True)

    # Deck 3: Flybridge Sundeck Coaming & Hardtop Canopy (z = 7.05 .. 8.35)
    add_box(bm_hull, 0.0, 2.8, 7.38, 3.75, 8.6, 0.68)

    # Swept-Back Aerodynamic Radar Arch + Mast + Twin Satcom Radome Spheres + Open-Array Radar!
    for side in (-1.0, 1.0):
        arch_pts = [
            (side * 1.82, 2.2, 7.65),
            (side * 1.55, 3.4, 9.25),
            (side * 0.85, 4.1, 9.85),
        ]
        add_swept_tube(bm_hull, arch_pts, (0.16, 0.42), segs=8, up_hint=(1, 0, 0), cap_ends=True)
    add_box(bm_hull, 0.0, 4.1, 9.88, 2.2, 1.35, 0.28)        # Radar arch crown wing
    add_strut(bm_hull, (0.0, 4.1, 9.9), (0.0, 4.6, 11.4), 0.10, 0.22, segs=8, up_hint=(1, 0, 0))
    add_box(bm_hull, 0.0, 3.85, 10.65, 2.15, 0.22, 0.16)     # Marine open-array X-band radar scanner

    create_mesh_object("Yacht_Superstructure", bm_hull, mat_white, shade_smooth=True, uv_scale=0.3)

    # Twin White Satcom Radome Spheres atop Radar Arch
    for side in (-1.0, 1.0):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=12, radius=0.46, location=(side * 0.92, 4.15, 10.38))
        dome = bpy.context.active_object
        dome.name = f"Yacht_Radome_{'L' if side < 0 else 'R'}"
        dome.data.materials.append(mat_white)
        for p in dome.data.polygons:
            p.use_smooth = True

    # 2. Vibrant Turquoise Waterline Stripe + Deep Navy Lower Boot-Top hugging Hull Stations!
    bm_turq = bmesh.new()
    bm_navy = bmesh.new()
    wl_stations = [
        (-17.8, 0.88, 1.18),
        (-12.0, 1.88, 2.15),
        ( -6.0, 2.68, 2.92),
        (  0.0, 2.96, 3.22),
        (  6.5, 3.00, 3.25),
        ( 12.2, 2.88, 3.12),
        ( 16.4, 2.72, 2.90),
    ]
    t_rings, n_rings = [], []
    for (y, hw_low, hw_high) in wl_stations:
        t_rings.append([
            (-hw_low * 1.015,  y, 0.52),
            ( hw_low * 1.015,  y, 0.52),
            ( hw_high * 1.015, y, 0.96),
            (-hw_high * 1.015, y, 0.96),
        ])
        n_rings.append([
            (-hw_low * 0.96,  y, 0.02),
            ( hw_low * 0.96,  y, 0.02),
            ( hw_low * 1.012, y, 0.52),
            (-hw_low * 1.012, y, 0.52),
        ])
    add_loft(bm_turq, t_rings, closed_ring=True, cap_start=True, cap_end=True)
    add_loft(bm_navy, n_rings, closed_ring=True, cap_start=True, cap_end=True)
    create_mesh_object("Yacht_Waterline", bm_turq, mat_turq, shade_smooth=True, uv_scale=0.4)
    create_mesh_object("Yacht_Boot_Top", bm_navy, mat_navy, shade_smooth=True, uv_scale=0.4)

    # 3. Tinted Wraparound Bridge Glass, Panoramic Salon Windows & Hull Portholes!
    bm_gl = bmesh.new()
    # Wraparound raked Upper Pilot-House Bridge Windshield + Side Glass
    br_gl = [
        [(-1.58, -4.45, 5.55), (1.58, -4.45, 5.55), (1.38, -2.85, 6.78), (-1.38, -2.85, 6.78)],
        [(-2.40, -1.20, 5.55), (2.40, -1.20, 5.55), (2.24, -1.05, 6.78), (-2.24, -1.05, 6.78)],
        [(-2.40,  6.85, 5.55), (2.40,  6.85, 5.55), (2.26,  7.45, 6.78), (-2.26,  7.45, 6.78)],
    ]
    add_loft(bm_gl, br_gl, closed_ring=True, cap_start=True, cap_end=True)

    # Main Deck Wraparound Panoramic Salon Windows
    m_gl = [
        [(-1.82, -7.45, 3.78), (1.82, -7.45, 3.78), (1.56, -5.95, 4.92), (-1.56, -5.95, 4.92)],
        [(-2.92, -3.40, 3.78), (2.92, -3.40, 3.78), (2.76, -3.15, 4.92), (-2.76, -3.15, 4.92)],
        [(-2.94,  8.65, 3.75), (2.94,  8.65, 3.75), (2.78,  9.25, 4.92), (-2.78,  9.25, 4.92)],
    ]
    add_loft(bm_gl, m_gl, closed_ring=True, cap_start=True, cap_end=True)

    # Sleek Hull-Side VIP Stateroom Window Strips
    add_box(bm_gl, 0.0, -1.5, 2.25, 6.88, 13.5, 0.52)
    # Flybridge forward tinted windscreen lip
    add_box(bm_gl, 0.0, -1.35, 7.92, 3.45, 0.45, 0.52)

    create_mesh_object("Yacht_Windows", bm_gl, mat_glass, shade_smooth=False, uv_scale=0.5)

    # 4. Burmese Teak Decks, Plush Foredeck & Flybridge Sunpads, Jacuzzi & Stainless Bow Rails!
    bm_teak = bmesh.new()
    add_box(bm_teak, 0.0, -11.6, 3.55, 4.4, 8.2, 0.14)  # Foredeck teak lounge floor
    add_box(bm_teak, 0.0,  15.3, 0.96, 5.5, 2.2, 0.12)  # Stern teak swim platform
    add_box(bm_teak, 0.0,  11.8, 3.28, 5.8, 3.8, 0.12)  # Aft cockpit dining deck
    add_box(bm_teak, 0.0,   2.8, 7.72, 3.55, 8.2, 0.10) # Flybridge sundeck floor
    create_mesh_object("Yacht_Sunpad_Deck", bm_teak, mat_teak, shade_smooth=False, uv_scale=0.8)

    bm_pad = bmesh.new()
    # Foredeck twin luxury sunpad mattresses + headrests
    for side in (-1.0, 1.0):
        add_box(bm_pad, side * 0.92, -10.8, 3.78, 1.35, 3.4, 0.28)
        add_box(bm_pad, side * 0.92,  -9.2, 3.98, 1.32, 0.55, 0.22)
    # Flybridge U-shaped sky-lounge sunpad & aft cockpit lounge sofa
    add_box(bm_pad, 0.0,  0.4, 7.92, 2.85, 2.6, 0.30)
    add_box(bm_pad, 0.0, 12.8, 3.55, 4.20, 1.25, 0.48)
    # Flybridge Spa Jacuzzi surround + glowing turquoise water insert (in Yacht_Waterline)
    add_box(bm_pad, 0.0,  5.6, 8.02, 2.15, 2.15, 0.52)
    create_mesh_object("Yacht_Sunpads", bm_pad, mat_sunpad, shade_smooth=True, subdiv_levels=1, uv_scale=1.0)

    bm_jac = bmesh.new()
    add_box(bm_jac, 0.0, 5.6, 8.30, 1.65, 1.65, 0.08)
    create_mesh_object("Yacht_Jacuzzi_Water", bm_jac, mat_turq, shade_smooth=False)

    # Polished Marine Stainless-Steel Bow Pulpit Guardrails
    bm_rail = bmesh.new()
    for side in (-1.0, 1.0):
        rail_pts = [
            (side * 0.22, -19.2, 4.45),
            (side * 1.65, -16.0, 4.32),
            (side * 2.65, -12.0, 4.18),
            (side * 3.15,  -7.5, 4.05),
        ]
        add_swept_tube(bm_rail, rail_pts, (0.035, 0.035), segs=6, up_hint=(0, 0, 1))
        for rx, ry, rz in rail_pts:
            add_strut(bm_rail, (rx, ry, rz - 0.62), (rx, ry, rz), 0.025, 0.025, segs=6, up_hint=(0, 1, 0))
    create_mesh_object("Yacht_Bow_Rails", bm_rail, mat_chrome, shade_smooth=True)

    export_asset("yacht")


# ==============================================================================
# MAIN BUILD ENTRYPOINT
# ==============================================================================

if __name__ == "__main__":
    log_path = os.path.join(OUT_BLEND, "build.log")
    try:
        build_f1_chassis()
        build_f1_wheel()
        build_pit_crew()
        build_mount_fuji()
        build_luxury_yacht()
        with open(log_path, "w", encoding="utf-8") as f:
            f.write("ALL 5 HIGH-DETAIL BLENDER 3D ASSETS BUILT SUCCESSFULLY!\n")
    except Exception:
        with open(log_path, "w", encoding="utf-8") as f:
            f.write(traceback.format_exc())
        raise
