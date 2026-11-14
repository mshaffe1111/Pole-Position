#!/usr/bin/env python3
# =============================================================================
# RACE PHANATIC F1 — POLE POSITION 2026: A+ STUDIO BLENDER 5.3 PIPELINE
# Headless Blender 5.x (bpy + bmesh) Procedural Track, Foliage, Signage,
# Barriers, Grandstands & Articulated 3D Crowd / Marshal Generator
# Owner: @tracks (@Blender_Environment_Modeler)
#
# Usage:
#   blender -b -P tools/blender_generate_track_and_environment.py
#
# Exports real UV-unwrapped, Principled BSDF PBR .glb suites to BOTH:
#   - assets/models/               (Live Playable WebGL Three.js Engine)
#   - godot_project/assets/models/ (Godot 4.3 Mobile Forward+ Engine)
#     1. env_trees_biome.glb
#     2. env_signs_gantries_billboards.glb
#     3. env_barriers_fencing.glb
#     4. env_grandstands_crowds.glb
#     5. track_ribbon_sample.glb
#   Plus combined godot_project/assets/track_environment_suite.glb
# =============================================================================

import math
import os
import shutil
import sys
import traceback

try:
    import bpy
    import bmesh
    from mathutils import Vector, Matrix, Euler
except ImportError:
    print("NOTE: Run inside Blender 5.x: blender -b -P tools/blender_generate_track_and_environment.py")
    sys.exit(0)


# =============================================================================
# 1. GLOBAL CONSTANTS & CIRCUIT SPLINE CONTROL POINTS (1 BU = 1.0 Meter)
# =============================================================================
ROAD_HALF_WIDTH = 9.0
CURB_WIDTH = 1.35
RUNOFF_EXTRA_WIDTH = 6.4

FUJI_1982_CTRL_POINTS = [
    (-260.0,    0.0,  0.0,  0.0),
    (   0.0,    0.0,  0.0,  0.0),
    ( 300.0,    0.0,  0.0,  0.0),
    ( 620.0,    0.0,  0.0,  0.0),
    ( 830.0,  -95.0,  2.0,  5.5),
    ( 855.0, -295.0,  5.0,  7.2),
    ( 660.0, -380.0,  7.0,  3.0),
    ( 460.0, -330.0,  9.0, -6.0),
    ( 250.0, -470.0, 12.0,  5.8),
    (  60.0, -650.0, 14.0,  4.0),
    (-185.0, -665.0, 13.0,  7.2),
    (-370.0, -480.0, 10.0,  6.5),
    (-485.0, -240.0,  5.0,  4.5),
    (-430.0,  -55.0,  1.0,  1.8),
]


# =============================================================================
# 2. DETERMINISTIC HASH, PACKED PROCEDURAL PBR TEXTURES & PRINCIPLED BSDF
# =============================================================================
def _hash2d(x, y, seed=0):
    h = ((x * 374761393) ^ (y * 668265263) ^ (seed * 2147483647)) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFFFF) / 4294967295.0


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def link_to_scene(obj):
    if obj.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(obj)


def apply_all_transforms(obj):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)


def add_box_uvs(bm, scale_uv=0.5):
    uv_layer = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for lp in f.loops:
            co = lp.vert.co
            if az >= ax and az >= ay:
                lp[uv_layer].uv = (co.x * scale_uv, co.y * scale_uv)
            elif ax >= ay:
                lp[uv_layer].uv = (co.y * scale_uv, co.z * scale_uv)
            else:
                lp[uv_layer].uv = (co.x * scale_uv, co.z * scale_uv)


def add_planar_sign_uvs(bm, min_x, max_x, min_z, max_z):
    uv_layer = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    span_x = max(0.001, max_x - min_x)
    span_z = max(0.001, max_z - min_z)
    for f in bm.faces:
        for lp in f.loops:
            co = lp.vert.co
            u = (co.x - min_x) / span_x
            v = (co.z - min_z) / span_z
            lp[uv_layer].uv = (max(0.0, min(1.0, u)), max(0.0, min(1.0, v)))


def _make_packed_image(name, width, height, pixels_flat, is_data=False):
    if name in bpy.data.images:
        return bpy.data.images[name]
    img = bpy.data.images.new(name=name, width=width, height=height, alpha=True)
    if is_data and hasattr(img, "colorspace_settings"):
        img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(pixels_flat)
    img.pack()
    return img


def build_asphalt_textures(size=256):
    alb = [0.0] * (size * size * 4)
    nrm = [0.0] * (size * size * 4)
    grid = [[_hash2d(x, y, 17) for x in range(size)] for y in range(size)]

    for y in range(size):
        for x in range(size):
            u = x / float(size - 1)
            lg = math.exp(-((u - 0.27) ** 2) / 0.016)
            rg = math.exp(-((u - 0.73) ** 2) / 0.016)
            groove = min(1.0, max(lg, rg))
            fine = grid[y][x]
            coarse = _hash2d(x >> 1, y >> 1, 53)
            spark = 0.08 if fine > 0.96 else 0.0
            base = 0.105 + (fine - 0.5) * 0.075 + (coarse - 0.5) * 0.055 - groove * 0.038 + spark

            # Crisp white FIA edge lines
            if 0.02 <= u <= 0.045 or 0.955 <= u <= 0.98:
                r, g, b = 0.94, 0.96, 0.99
            else:
                r = max(0.03, min(0.95, base))
                g = max(0.03, min(0.95, base * 1.02))
                b = max(0.035, min(0.95, base * 1.06))

            idx = (y * size + x) * 4
            alb[idx] = r
            alb[idx + 1] = g
            alb[idx + 2] = b
            alb[idx + 3] = 1.0

            dx = (grid[y][(x + 1) % size] - grid[y][(x - 1) % size]) * (1.55 - groove * 0.65)
            dy = (grid[(y + 1) % size][x] - grid[(y - 1) % size][x]) * (1.55 - groove * 0.65)
            inv_l = 1.0 / math.sqrt(dx * dx + dy * dy + 1.0)
            nrm[idx] = (-dx * inv_l) * 0.5 + 0.5
            nrm[idx + 1] = (-dy * inv_l) * 0.5 + 0.5
            nrm[idx + 2] = inv_l * 0.5 + 0.5
            nrm[idx + 3] = 1.0

    return (
        _make_packed_image("Tex_Asphalt_DarkBasalt", size, size, alb, is_data=False),
        _make_packed_image("Tex_Asphalt_Normal", size, size, nrm, is_data=True),
    )


def build_bark_and_foliage_textures(size=256):
    bark = [0.0] * (size * size * 4)
    bark_nrm = [0.0] * (size * size * 4)
    leaf = [0.0] * (size * size * 4)
    bark_h = [[0.0] * size for _ in range(size)]

    for y in range(size):
        for x in range(size):
            warp = (_hash2d(x >> 2, y >> 3, 9) - 0.5) * 3.4 + (_hash2d(x >> 3, y >> 4, 21) - 0.5) * 2.2
            fissure = math.sin(x * 0.28 + warp) * 0.5 + 0.5
            plate = math.cos(x * 0.11 - warp * 0.6) * 0.5 + 0.5
            grain = _hash2d(x, y >> 2, 31)
            h_val = fissure * 0.62 + plate * 0.24 + grain * 0.14
            bark_h[y][x] = h_val

    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            h_val = bark_h[y][x]
            moss = max(0.0, _hash2d(x >> 2, y >> 2, 63) - 0.72) * 0.35
            lum = 0.12 + h_val * 0.19
            bark[idx] = min(1.0, lum * (1.24 - moss * 0.35))
            bark[idx + 1] = min(1.0, lum * (0.94 + moss * 0.45))
            bark[idx + 2] = min(1.0, lum * 0.68)
            bark[idx + 3] = 1.0

            dx = (bark_h[y][(x + 1) % size] - bark_h[y][(x - 1) % size]) * 2.4
            dy = (bark_h[(y + 1) % size][x] - bark_h[(y - 1) % size][x]) * 1.4
            inv_l = 1.0 / math.sqrt(dx * dx + dy * dy + 1.0)
            bark_nrm[idx] = (-dx * inv_l) * 0.5 + 0.5
            bark_nrm[idx + 1] = (-dy * inv_l) * 0.5 + 0.5
            bark_nrm[idx + 2] = inv_l * 0.5 + 0.5
            bark_nrm[idx + 3] = 1.0

            # Multi-scale botanical leaf cluster pattern (tints naturally via instanceColor / biome shader)
            cx1 = ((x % 16) - 7.5) / 8.0
            cy1 = ((y % 16) - 7.5) / 8.0
            cx2 = (((x + 7) % 11) - 5.0) / 5.5
            cy2 = (((y + 5) % 11) - 5.0) / 5.5
            d1 = math.sqrt(cx1 * cx1 * 1.3 + cy1 * cy1 * 0.85)
            d2 = math.sqrt(cx2 * cx2 * 0.9 + cy2 * cy2 * 1.25)
            blade = max(0.0, 1.0 - min(d1, d2))
            micro = (_hash2d(x >> 1, y >> 1, 77) - 0.5) * 0.14
            vein = 0.05 if (abs(cx1) < 0.11 and cy1 < 0.65) else 0.0
            l_val = max(0.48, min(0.98, 0.66 + blade * 0.24 + micro + vein))
            leaf[idx] = l_val * 0.96
            leaf[idx + 1] = min(1.0, l_val * 1.04)
            leaf[idx + 2] = l_val * 0.90
            leaf[idx + 3] = 1.0

    return (
        _make_packed_image("Tex_Tree_Bark", size, size, bark, is_data=False),
        _make_packed_image("Tex_Tree_Bark_Normal", size, size, bark_nrm, is_data=True),
        _make_packed_image("Tex_Foliage_Cluster", size, size, leaf, is_data=False),
    )


def build_fia_brake_sign_texture(dist_m, w=256, h=160):
    """
    Packed crisp FIA matte black/white meter marker texture (`300`, `200`, `150`, `100`, `50`)
    so standalone GLB / Godot renders authentic FIA distance numerals while keeping [0..1] planar UVs.
    """
    glyphs = {
        "0": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
        "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
        "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
        "3": ["01110", "10001", "00001", "00110", "00001", "10001", "01110"],
        "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    }
    label = str(dist_m)
    px = [0.0] * (w * h * 4)
    # Matte charcoal FIA board background (#14171c linear ~ 0.007..0.012) or dark FIA green for 300/200/150
    bg_r, bg_g, bg_b = (0.008, 0.010, 0.013) if dist_m <= 100 else (0.006, 0.036, 0.018)
    fg_r, fg_g, fg_b = (0.90, 0.92, 0.94)

    n_chars = len(label)
    gw = n_chars * 5 + (n_chars - 1) * 1
    gh = 7
    scale_x = 9 if n_chars == 3 else 11
    scale_y = 14
    tot_w = gw * scale_x
    tot_h = gh * scale_y
    ox = (w - tot_w) // 2
    oy = (h - tot_h) // 2

    for y in range(h):
        vy = h - 1 - y
        for x in range(w):
            idx = (y * w + x) * 4
            border = (6 <= x <= 10 or w - 11 <= x <= w - 7 or 6 <= vy <= 10 or h - 11 <= vy <= h - 7) and (
                6 <= x <= w - 7 and 6 <= vy <= h - 7
            )
            lit = border
            if not lit and ox <= x < ox + tot_w and oy <= vy < oy + tot_h:
                gx = (x - ox) // scale_x
                gy = (vy - oy) // scale_y
                c_idx = gx // 6
                c_col = gx % 6
                if c_col < 5 and 0 <= c_idx < n_chars and 0 <= gy < gh:
                    ch = label[c_idx]
                    if glyphs[ch][gy][c_col] == "1":
                        lit = True
            if lit:
                px[idx], px[idx + 1], px[idx + 2], px[idx + 3] = fg_r, fg_g, fg_b, 1.0
            else:
                px[idx], px[idx + 1], px[idx + 2], px[idx + 3] = bg_r, bg_g, bg_b, 1.0

    return _make_packed_image(f"Tex_FIA_Brake_{dist_m}m", w, h, px, is_data=False)


def create_pbr_material(
    name,
    base_color,
    roughness=0.55,
    metallic=0.0,
    emission_color=None,
    emission_strength=0.0,
    clearcoat=0.0,
    clearcoat_roughness=0.1,
    albedo_img=None,
    normal_img=None,
    normal_strength=1.0,
    alpha=1.0,
):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if not bsdf:
        return mat

    bsdf.inputs["Base Color"].default_value = (base_color[0], base_color[1], base_color[2], 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if alpha < 1.0 and "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha
        if hasattr(mat, "blend_method"):
            mat.blend_method = "BLEND"

    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = clearcoat
        bsdf.inputs["Coat Roughness"].default_value = clearcoat_roughness
    elif "Clearcoat" in bsdf.inputs:
        bsdf.inputs["Clearcoat"].default_value = clearcoat
        bsdf.inputs["Clearcoat Roughness"].default_value = clearcoat_roughness

    if emission_color and emission_strength > 0.0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (
                emission_color[0], emission_color[1], emission_color[2], 1.0
            )
            bsdf.inputs["Emission Strength"].default_value = emission_strength
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = (
                emission_color[0], emission_color[1], emission_color[2], 1.0
            )

    if albedo_img is not None:
        tex_node = nodes.new("ShaderNodeTexImage")
        tex_node.image = albedo_img
        if base_color != (1.0, 1.0, 1.0):
            mix_node = nodes.new("ShaderNodeMix")
            mix_node.data_type = "RGBA"
            mix_node.blend_type = "MULTIPLY"
            mix_node.inputs[0].default_value = 1.0
            mix_node.inputs[7].default_value = (base_color[0], base_color[1], base_color[2], 1.0)
            links.new(tex_node.outputs["Color"], mix_node.inputs[6])
            links.new(mix_node.outputs[2], bsdf.inputs["Base Color"])
        else:
            links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])

    if normal_img is not None:
        n_tex = nodes.new("ShaderNodeTexImage")
        n_tex.image = normal_img
        n_map = nodes.new("ShaderNodeNormalMap")
        n_map.inputs["Strength"].default_value = normal_strength
        links.new(n_tex.outputs["Color"], n_map.inputs["Color"])
        links.new(n_map.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def export_glb_to_both_engines(filename, out_dirs):
    export_props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    kwargs = {
        "filepath": os.path.join(out_dirs[0], filename),
        "export_format": "GLB",
        "export_yup": True,
        "export_apply": True,
        "export_texcoords": True,
        "export_normals": True,
        "export_materials": "EXPORT",
    }
    if "export_tangents" in export_props:
        kwargs["export_tangents"] = True
    if "export_attributes" in export_props:
        kwargs["export_attributes"] = True
    if "export_vertex_color" in export_props:
        kwargs["export_vertex_color"] = "MATERIAL"
    elif "export_colors" in export_props:
        kwargs["export_colors"] = True

    bpy.ops.export_scene.gltf(**kwargs)
    primary = kwargs["filepath"]
    for extra_dir in out_dirs[1:]:
        shutil.copy2(primary, os.path.join(extra_dir, filename))
    print(f"  -> Exported {filename} ({os.path.getsize(primary):,} bytes)")


# =============================================================================
# 3. SUITE 1: env_trees_biome.glb (Fuller Multi-Cluster Botanical Canopies + Outward/Upward Normals)
# =============================================================================
def _finalize_tree_mesh(mesh, crown_center_z, max_height, max_radius):
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    crown_c = Vector((0.0, 0.0, crown_center_z))
    up_v = Vector((0.0, 0.0, 1.0))
    custom_normals = []
    for v in mesh.vertices:
        if v.co.z > crown_center_z * 0.50:
            out_n = (v.co - crown_c)
            out_n = out_n.normalized() if out_n.length > 1e-4 else up_v
            blended = (v.normal * 0.18 + out_n * 0.50 + up_v * 0.32).normalized()
            custom_normals.append(blended)
        else:
            custom_normals.append(v.normal)
    mesh.normals_split_custom_set_from_vertices(custom_normals)


def _paint_tree_wind_colors_and_uvs(bm, crown_center_z, max_height, max_radius):
    add_box_uvs(bm, scale_uv=0.45)
    col_layer = bm.loops.layers.color.get("Col") or bm.loops.layers.color.new("Col")
    crown_c = Vector((0.0, 0.0, crown_center_z))
    for f in bm.faces:
        f.smooth = True
        is_canopy = f.material_index == 1
        for lp in f.loops:
            co = lp.vert.co
            z_clamped = max(0.0, min(1.0, co.z / max_height))
            sway_r = z_clamped ** 1.35
            radial = math.hypot(co.x, co.y)
            flutter_g = max(0.0, min(1.0, radial / max_radius)) if is_canopy else 0.0
            dist_c = (co - crown_c).length
            ao_b = max(0.46, min(1.0, 0.50 + 0.50 * (dist_c / max_radius))) if is_canopy else 0.84
            phase_a = ((math.atan2(co.y, co.x) + math.pi) / (2.0 * math.pi))
            lp[col_layer] = (sway_r, flutter_g, ao_b, phase_a)


def populate_trees_biome_scene():
    bark_img, bark_nrm, leaf_img = build_bark_and_foliage_textures(256)
    mat_bark = create_pbr_material(
        "Tree_Bark_PBR", (1.0, 1.0, 1.0),
        roughness=0.90, metallic=0.0, albedo_img=bark_img, normal_img=bark_nrm, normal_strength=0.95
    )
    mat_decid = create_pbr_material("Tree_Foliage_Deciduous_PBR", (1.0, 1.0, 1.0), roughness=0.82, metallic=0.0, albedo_img=leaf_img)
    mat_pine = create_pbr_material("Tree_Foliage_Pine_PBR", (0.86, 0.95, 0.86), roughness=0.84, metallic=0.0, albedo_img=leaf_img)
    mat_palm = create_pbr_material("Tree_Foliage_Palm_PBR", (0.88, 0.96, 0.85), roughness=0.76, metallic=0.0, albedo_img=leaf_img)

    lod_specs = [
        ("LOD0", 2, 12),
        ("LOD1", 1, 8),
        ("LOD2", 1, 6),
    ]

    for lod_tag, ico_sub, rad_seg in lod_specs:
        # 1. Fuller Multi-Cluster Broadleaf / Sakura / Maple Tree (Root Buttresses + Forked Limbs + 15 Leaf Sub-Crowns)
        bm = bmesh.new()
        bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=True, segments=rad_seg,
            radius1=0.68, radius2=0.44, depth=1.15,
            matrix=Matrix.Translation((0.0, 0.0, 0.55))
        )
        # 4 organic root flare buttresses
        for ri in range(4):
            ra = ri * math.pi * 0.5 + 0.35
            m_rt = (
                Matrix.Translation((math.cos(ra) * 0.36, math.sin(ra) * 0.36, 0.36))
                @ Matrix.Rotation(ra, 4, "Z")
                @ Euler((0.0, -0.52, 0.0)).to_matrix().to_4x4()
            )
            bmesh.ops.create_cone(
                bm, cap_ends=True, cap_tris=True, segments=6,
                radius1=0.22, radius2=0.08, depth=0.95, matrix=m_rt
            )
        bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=True, segments=rad_seg,
            radius1=0.45, radius2=0.26, depth=3.35,
            matrix=Matrix.Translation((0.02, -0.02, 2.55)) @ Euler((0.03, 0.02, 0.0)).to_matrix().to_4x4()
        )
        limbs = [
            ((-0.72,  0.24, 4.05), ( 0.22, -0.60, 0.0), 0.24, 0.10, 2.55),
            (( 0.70, -0.22, 4.15), (-0.24,  0.58, 0.0), 0.23, 0.10, 2.45),
            (( 0.10,  0.68, 4.22), ( 0.58,  0.06, 0.0), 0.21, 0.09, 2.35),
            ((-0.14, -0.64, 4.35), (-0.54, -0.08, 0.0), 0.20, 0.09, 2.25),
            ((-0.46, -0.46, 5.10), (-0.36, -0.38, 0.0), 0.15, 0.07, 1.85),
            (( 0.48,  0.44, 5.20), ( 0.34,  0.38, 0.0), 0.15, 0.07, 1.85),
        ]
        for l_pos, l_rot, r1, r2, dp in limbs:
            m_l = Matrix.Translation(l_pos) @ Euler(l_rot).to_matrix().to_4x4()
            bmesh.ops.create_cone(
                bm, cap_ends=True, cap_tris=True, segments=max(5, rad_seg - 3),
                radius1=r1, radius2=r2, depth=dp, matrix=m_l
            )
        for f in bm.faces:
            f.material_index = 0

        boughs = [
            ((-2.15,  0.55, 4.85), (1.22, 1.10, 0.68), 1.85),
            ((-1.35,  1.45, 5.15), (1.15, 1.18, 0.72), 1.78),
            (( 2.10, -0.48, 4.95), (1.20, 1.12, 0.68), 1.82),
            (( 1.38, -1.42, 5.22), (1.14, 1.16, 0.70), 1.74),
            (( 0.22,  2.05, 4.98), (1.16, 1.22, 0.68), 1.80),
            ((-0.30, -1.96, 5.18), (1.18, 1.14, 0.70), 1.76),
            ((-1.52, -0.98, 5.75), (1.12, 1.08, 0.74), 1.72),
            (( 1.56,  0.96, 5.82), (1.14, 1.08, 0.74), 1.72),
            ((-0.78,  0.78, 6.35), (1.18, 1.14, 0.78), 1.88),
            (( 0.82, -0.74, 6.42), (1.16, 1.16, 0.78), 1.86),
            ((-1.15,  0.05, 6.15), (1.10, 1.12, 0.74), 1.70),
            (( 1.12,  0.12, 6.20), (1.12, 1.10, 0.74), 1.70),
            (( 0.04,  0.92, 6.68), (1.15, 1.12, 0.78), 1.76),
            ((-0.08, -0.88, 6.72), (1.14, 1.12, 0.78), 1.74),
            (( 0.04,  0.04, 7.28), (1.26, 1.22, 0.82), 2.05),
        ]
        if lod_tag == "LOD1":
            boughs = boughs[::2] + [boughs[-1]]
        elif lod_tag == "LOD2":
            boughs = [boughs[0], boughs[2], boughs[4], boughs[5], boughs[-1]]

        for bi, (b_pos, b_scl, b_rad) in enumerate(boughs):
            prev_f = set(bm.faces)
            prev_v = set(bm.verts)
            m_b = Matrix.Translation(b_pos) @ Matrix.Diagonal((b_scl[0], b_scl[1], b_scl[2], 1.0))
            bmesh.ops.create_icosphere(bm, subdivisions=ico_sub, radius=b_rad, matrix=m_b)
            # Subtle organic botanical lobe irregularity so sub-crowns never look like geometric balls
            for v in bm.verts:
                if v not in prev_v:
                    d = v.co - Vector(b_pos)
                    ang_a = math.atan2(d.y, d.x)
                    ripple = 1.0 + 0.11 * math.sin(ang_a * 3.0 + bi * 1.7) + 0.07 * math.cos(d.z * 2.3 + bi)
                    v.co = Vector(b_pos) + d * ripple
            for f in bm.faces:
                if f not in prev_f:
                    f.material_index = 1

        _paint_tree_wind_colors_and_uvs(bm, crown_center_z=5.85, max_height=9.4, max_radius=4.7)
        dec_mesh = bpy.data.meshes.new(f"Tree_Deciduous_{lod_tag}_Mesh")
        bm.to_mesh(dec_mesh)
        bm.free()
        _finalize_tree_mesh(dec_mesh, crown_center_z=5.85, max_height=9.4, max_radius=4.7)

        dec_obj = bpy.data.objects.new(f"Tree_Deciduous_{lod_tag}", dec_mesh)
        dec_obj.data.materials.append(mat_bark)
        dec_obj.data.materials.append(mat_decid)
        link_to_scene(dec_obj)
        apply_all_transforms(dec_obj)

        # 2. 7-Tiered Whorled Scalloped Japanese Sugi Cedar / Alpine Scots Pine
        pbm = bmesh.new()
        bmesh.ops.create_cone(
            pbm, cap_ends=True, cap_tris=True, segments=rad_seg,
            radius1=0.52, radius2=0.14, depth=9.4,
            matrix=Matrix.Translation((0.0, 0.0, 4.7))
        )
        for f in pbm.faces:
            f.material_index = 0

        tiers = [
            (3.45, 3.55, 2.35, 7),
            (4.95, 3.22, 2.25, 7),
            (6.38, 2.82, 2.15, 6),
            (7.72, 2.38, 2.05, 6),
            (8.98, 1.92, 1.95, 5),
            (10.15, 1.44, 1.85, 5),
            (11.25, 0.95, 1.80, 5),
        ]
        if lod_tag == "LOD1":
            tiers = tiers[::2] + [tiers[-1]]
        elif lod_tag == "LOD2":
            tiers = [(4.2, 3.45, 3.6, 5), (7.4, 2.45, 3.4, 5), (10.5, 1.35, 3.0, 4)]

        cone_segs = rad_seg * 2 if lod_tag == "LOD0" else rad_seg + 4
        for ti, (tz, rb, th, lobes) in enumerate(tiers):
            prev_f = set(pbm.faces)
            prev_v = set(pbm.verts)
            bmesh.ops.create_cone(
                pbm, cap_ends=True, cap_tris=True, segments=cone_segs,
                radius1=rb, radius2=0.12, depth=th,
                matrix=Matrix.Translation((0.0, 0.0, tz))
            )
            # Scallop outer bough skirt into organic whorled cedar branchlets with natural droop
            z_bot = tz - th * 0.5
            for v in pbm.verts:
                if v not in prev_v:
                    r_xy = math.hypot(v.co.x, v.co.y)
                    if r_xy > 0.22:
                        ang = math.atan2(v.co.y, v.co.x)
                        lobe_w = 0.84 + 0.22 * math.cos(ang * lobes + ti * 1.15)
                        v.co.x *= lobe_w
                        v.co.y *= lobe_w
                        if abs(v.co.z - z_bot) < 0.25:
                            v.co.z -= 0.22 * (lobe_w - 0.78)
            for f in pbm.faces:
                if f not in prev_f:
                    f.material_index = 1

        _paint_tree_wind_colors_and_uvs(pbm, crown_center_z=7.2, max_height=12.6, max_radius=3.8)
        pine_mesh = bpy.data.meshes.new(f"Tree_Pine_{lod_tag}_Mesh")
        pbm.to_mesh(pine_mesh)
        pbm.free()
        _finalize_tree_mesh(pine_mesh, crown_center_z=7.2, max_height=12.6, max_radius=3.8)

        pine_obj = bpy.data.objects.new(f"Tree_Pine_{lod_tag}", pine_mesh)
        pine_obj.data.materials.append(mat_bark)
        pine_obj.data.materials.append(mat_pine)
        link_to_scene(pine_obj)
        apply_all_transforms(pine_obj)

        # 3. Curved Ringed Riviera / Canary Date Palm with 13 Multi-Segment Pinnate Fronds
        lbm = bmesh.new()
        palm_segs = [
            ((0.03, 0.0, 0.95), (0.0, 0.02, 0.0), 0.48, 0.39, 1.95),
            ((0.12, 0.0, 2.75), (0.0, 0.05, 0.0), 0.39, 0.33, 1.90),
            ((0.28, 0.0, 4.52), (0.0, 0.08, 0.0), 0.33, 0.28, 1.88),
            ((0.49, 0.0, 6.26), (0.0, 0.11, 0.0), 0.28, 0.24, 1.85),
            ((0.74, 0.0, 7.96), (0.0, 0.14, 0.0), 0.24, 0.20, 1.80),
            ((0.96, 0.0, 9.45), (0.0, 0.16, 0.0), 0.22, 0.25, 1.35),
        ]
        for s_pos, s_rot, r1, r2, dp in palm_segs:
            m_s = Matrix.Translation(s_pos) @ Euler(s_rot).to_matrix().to_4x4()
            bmesh.ops.create_cone(
                lbm, cap_ends=True, cap_tris=True, segments=rad_seg,
                radius1=r1, radius2=r2, depth=dp, matrix=m_s
            )
        bmesh.ops.create_icosphere(
            lbm, subdivisions=1, radius=0.48,
            matrix=Matrix.Translation((1.02, 0.0, 10.08))
        )
        for f in lbm.faces:
            f.material_index = 0

        frond_n = 13 if lod_tag == "LOD0" else (9 if lod_tag == "LOD1" else 6)
        crown_origin = Matrix.Translation((1.02, 0.0, 10.14))
        for fi in range(frond_n):
            az = (math.pi * 2.0 * fi) / frond_n + (fi % 3) * 0.07
            tier_lift = 0.34 if (fi % 3 == 0) else (0.14 if (fi % 3 == 1) else -0.06)
            prev_f = set(lbm.faces)
            # 3-segment arched pinnate frond blade (ascending rachis -> arching mid-blade -> drooping tip)
            frond_parts = [
                ((0.92, 0.0, 0.26 + tier_lift * 0.7), -0.34, (1.65, 0.56, 0.07)),
                ((2.28, 0.0, 0.42 + tier_lift),        0.08, (1.55, 0.78, 0.06)),
                ((3.58, 0.0, 0.04 + tier_lift * 0.8),  0.54, (1.42, 0.46, 0.05)),
            ]
            for (f_off, pitch_y, f_scl) in frond_parts:
                m_seg = (
                    crown_origin
                    @ Matrix.Rotation(az, 4, "Z")
                    @ Matrix.Translation(f_off)
                    @ Euler((0.14 if fi % 2 == 0 else -0.14, pitch_y, 0.0)).to_matrix().to_4x4()
                    @ Matrix.Diagonal((f_scl[0], f_scl[1], f_scl[2], 1.0))
                )
                bmesh.ops.create_cube(lbm, size=1.0, matrix=m_seg)
            for f in lbm.faces:
                if f not in prev_f:
                    f.material_index = 1

        _paint_tree_wind_colors_and_uvs(lbm, crown_center_z=9.85, max_height=11.3, max_radius=4.8)
        palm_mesh = bpy.data.meshes.new(f"Tree_Palm_{lod_tag}_Mesh")
        lbm.to_mesh(palm_mesh)
        lbm.free()
        _finalize_tree_mesh(palm_mesh, crown_center_z=9.85, max_height=11.3, max_radius=4.8)

        palm_obj = bpy.data.objects.new(f"Tree_Palm_{lod_tag}", palm_mesh)
        palm_obj.data.materials.append(mat_bark)
        palm_obj.data.materials.append(mat_palm)
        link_to_scene(palm_obj)
        apply_all_transforms(palm_obj)


# =============================================================================
# 4. SUITE 2: env_signs_gantries_billboards.glb
#    (Authentic Matte FIA Meter Boards on Frangible Posts, Lattice Start Gantry + Hoods, Sponsor Rig)
# =============================================================================
def _add_tube_between(bm, p0, p1, radius, segs=6):
    v0 = Vector(p0)
    v1 = Vector(p1)
    dv = v1 - v0
    length = dv.length
    if length < 1e-5:
        return
    mid = (v0 + v1) * 0.5
    quat = Vector((0.0, 0.0, 1.0)).rotation_difference(dv.normalized())
    mat = Matrix.Translation(mid) @ quat.to_matrix().to_4x4()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=segs, radius1=radius, radius2=radius, depth=length, matrix=mat)


def populate_signs_gantries_billboards_scene():
    # Authentic non-glowing motorsport metals, anodized extrusions & matte sign faces
    mat_dark = create_pbr_material("Sign_Dark_Steel", (0.09, 0.11, 0.14), roughness=0.62, metallic=0.42)
    mat_alu_frame = create_pbr_material("Sign_Satin_Aluminum", (0.62, 0.66, 0.71), roughness=0.38, metallic=0.82)
    mat_truss = create_pbr_material("Gantry_SpaceFrame_Steel", (0.76, 0.80, 0.85), roughness=0.34, metallic=0.84)
    mat_conc = create_pbr_material("Gantry_Concrete_Plinth", (0.58, 0.61, 0.65), roughness=0.84, metallic=0.02)
    mat_banner = create_pbr_material("Sponsor_Face_Default", (0.94, 0.96, 0.98), roughness=0.56, metallic=0.04)
    # Unlit/realistic polycarbonate start-light lenses (zero daytime self-glow; engines drive start sequence!)
    mat_red_off = create_pbr_material("StartLight_Red_Lens", (0.28, 0.02, 0.03), roughness=0.18, metallic=0.08, clearcoat=0.85)
    mat_grn_off = create_pbr_material("StartLight_Green_Lens", (0.02, 0.18, 0.07), roughness=0.18, metallic=0.08, clearcoat=0.85)

    # 1. Authentic FIA Braking Marker Boards (300m, 200m, 150m, 100m, 50m)
    #    Matte polystyrene/composite board on twin frangible breakaway posts — ZERO floodlight glow!
    for dist_m in (300, 200, 150, 100, 50):
        sign_tex = build_fia_brake_sign_texture(dist_m)
        mat_face = create_pbr_material(
            f"BrakeBoard_Face_{dist_m}m", (1.0, 1.0, 1.0),
            roughness=0.65, metallic=0.02, albedo_img=sign_tex
        )
        bm = bmesh.new()
        # Twin frangible tubular posts + rubberized ground sockets + shear-pin breakaway collars
        for x_leg in (-0.66, 0.66):
            # Rubber/composite ground base pad
            bmesh.ops.create_cube(
                bm, size=1.0,
                matrix=Matrix.Translation((x_leg, 0.05, 0.035)) @ Matrix.Diagonal((0.24, 0.28, 0.07, 1.0))
            )
            # Frangible shear-pin breakaway collar at z=0.14m
            bmesh.ops.create_cone(
                bm, cap_ends=True, cap_tris=True, segments=10,
                radius1=0.068, radius2=0.062, depth=0.14,
                matrix=Matrix.Translation((x_leg, 0.05, 0.14))
            )
            # Slim tubular breakaway post rising behind the board
            bmesh.ops.create_cone(
                bm, cap_ends=True, cap_tris=True, segments=10,
                radius1=0.044, radius2=0.042, depth=2.12,
                matrix=Matrix.Translation((x_leg, 0.05, 1.14))
            )
            # 2 clamping U-brackets on rear of board
            for z_cl in (1.18, 1.98):
                bmesh.ops.create_cube(
                    bm, size=1.0,
                    matrix=Matrix.Translation((x_leg, 0.04, z_cl)) @ Matrix.Diagonal((0.12, 0.07, 0.08, 1.0))
                )
        # Rear horizontal aluminum stiffening channels
        for z_bar in (1.18, 1.98):
            bmesh.ops.create_cube(
                bm, size=1.0,
                matrix=Matrix.Translation((0.0, 0.032, z_bar)) @ Matrix.Diagonal((1.96, 0.036, 0.055, 1.0))
            )
        # Slim matte dark FIA border frame (2.12m x 1.38m x 0.055m — crisp slim profile!)
        bmesh.ops.create_cube(
            bm, size=1.0,
            matrix=Matrix.Translation((0.0, 0.0, 1.58)) @ Matrix.Diagonal((2.12, 0.052, 1.38, 1.0))
        )
        add_box_uvs(bm, scale_uv=0.6)
        for f in bm.faces:
            f.material_index = 0

        # Planar-UV Sign Face Panel (`BrakeBoard_Face_{dist_m}m`, [0..1] UVs for WebGL & embedded numerals for Godot)
        f_bm = bmesh.new()
        bmesh.ops.create_cube(
            f_bm, size=1.0,
            matrix=Matrix.Translation((0.0, 0.0, 1.58)) @ Matrix.Diagonal((2.02, 0.066, 1.28, 1.0))
        )
        add_planar_sign_uvs(f_bm, -1.01, 1.01, 0.94, 2.22)
        for f in f_bm.faces:
            f.material_index = 1

        mesh = bpy.data.meshes.new(f"BrakeBoard_{dist_m}m_Mesh")
        tmp = bpy.data.meshes.new("_tmp_brk")
        f_bm.to_mesh(tmp)
        f_bm.free()
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
        bm.normal_update()
        bm.to_mesh(mesh)
        bm.free()

        obj = bpy.data.objects.new(f"BrakeBoard_{dist_m}m-convcolonly", mesh)
        obj.data.materials.append(mat_dark)
        obj.data.materials.append(mat_face)
        link_to_scene(obj)
        apply_all_transforms(obj)

    # 2. Trackside Sponsor Billboard Rig (Steel A-Frame Lattice Struts + Satin Extruded Bezel + Matte Banner)
    bbm = bmesh.new()
    for x_p in (-2.85, -0.95, 0.95, 2.85):
        # Concrete ballast plinth block
        bmesh.ops.create_cube(
            bbm, size=1.0,
            matrix=Matrix.Translation((x_p, 0.52, 0.18)) @ Matrix.Diagonal((0.52, 1.15, 0.36, 1.0))
        )
        # Vertical steel H-column (flanges + web)
        bmesh.ops.create_cube(
            bbm, size=1.0,
            matrix=Matrix.Translation((x_p, 0.18, 1.76)) @ Matrix.Diagonal((0.12, 0.16, 3.44, 1.0))
        )
        # Rear diagonal A-frame raker strut + horizontal tie strut
        _add_tube_between(bbm, (x_p, 0.18, 2.95), (x_p, 0.98, 0.28), 0.048, segs=8)
        _add_tube_between(bbm, (x_p, 0.18, 1.45), (x_p, 0.62, 1.45), 0.036, segs=6)

    # Rear longitudinal steel cross-girts, catwalk grating & rear safety handrail
    for z_g in (1.05, 2.15, 3.15):
        bmesh.ops.create_cube(
            bbm, size=1.0,
            matrix=Matrix.Translation((0.0, 0.14, z_g)) @ Matrix.Diagonal((7.60, 0.07, 0.09, 1.0))
        )
    bmesh.ops.create_cube(
        bbm, size=1.0,
        matrix=Matrix.Translation((0.0, 0.46, 0.86)) @ Matrix.Diagonal((7.30, 0.48, 0.05, 1.0))
    )
    _add_tube_between(bbm, (-3.65, 0.68, 1.82), (3.65, 0.68, 1.82), 0.022, segs=6)
    for x_hr in (-3.60, -1.80, 0.0, 1.80, 3.60):
        _add_tube_between(bbm, (x_hr, 0.68, 0.88), (x_hr, 0.68, 1.82), 0.020, segs=6)

    # 4 Non-glowing hooded downward cowl fixtures along top edge
    for x_fl in (-2.70, -0.90, 0.90, 2.70):
        _add_tube_between(bbm, (x_fl, 0.08, 3.50), (x_fl, -0.46, 3.56), 0.022, segs=6)
        bmesh.ops.create_cube(
            bbm, size=1.0,
            matrix=Matrix.Translation((x_fl, -0.50, 3.54)) @ Euler((0.32, 0.0, 0.0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.46, 0.22, 0.08, 1.0))
        )
    add_box_uvs(bbm, scale_uv=0.45)
    for f in bbm.faces:
        f.material_index = 0

    # Slim extruded satin-aluminum perimeter bezel frame (slot 2 = `Sign_Satin_Aluminum`)
    bezel_bm = bmesh.new()
    for (bx, bz, sx, sz) in (
        (0.0, 3.47, 7.80, 0.09),
        (0.0, 0.81, 7.80, 0.09),
        (-3.86, 2.14, 0.09, 2.74),
        ( 3.86, 2.14, 0.09, 2.74),
    ):
        bmesh.ops.create_cube(
            bezel_bm, size=1.0,
            matrix=Matrix.Translation((bx, 0.0, bz)) @ Matrix.Diagonal((sx, 0.14, sz, 1.0))
        )
    # Rear backing sheet inside frame
    bmesh.ops.create_cube(
        bezel_bm, size=1.0,
        matrix=Matrix.Translation((0.0, 0.03, 2.14)) @ Matrix.Diagonal((7.68, 0.04, 2.60, 1.0))
    )
    add_box_uvs(bezel_bm, scale_uv=0.5)
    for f in bezel_bm.faces:
        f.material_index = 2

    # Planar-UV Tensioned Matte Banner Face (`Sponsor_Face_Default`, slot 1)
    bf_bm = bmesh.new()
    bmesh.ops.create_cube(
        bf_bm, size=1.0,
        matrix=Matrix.Translation((0.0, -0.01, 2.14)) @ Matrix.Diagonal((7.64, 0.08, 2.58, 1.0))
    )
    add_planar_sign_uvs(bf_bm, -3.82, 3.82, 0.85, 3.43)
    for f in bf_bm.faces:
        f.material_index = 1

    bb_mesh = bpy.data.meshes.new("Sponsor_Billboard_Rig_Mesh")
    for sub in (bf_bm, bezel_bm):
        tmp = bpy.data.meshes.new("_tmp_bb")
        sub.to_mesh(tmp)
        sub.free()
        bbm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    bbm.normal_update()
    bbm.to_mesh(bb_mesh)
    bbm.free()

    bb_obj = bpy.data.objects.new("Sponsor_Billboard_Rig-convcolonly", bb_mesh)
    bb_obj.data.materials.append(mat_dark)
    bb_obj.data.materials.append(mat_banner)
    bb_obj.data.materials.append(mat_alu_frame)
    link_to_scene(bb_obj)
    apply_all_transforms(bb_obj)

    # 3. Fine Steel Space-Frame Start/Finish Gantry (`Start_Gantry_Truss-col`) + 5 FIA Start-Light Pods
    #    ALL structural lattice chords, X-braces, ladder cages & light hoods sit in slot 0 (`Gantry_SpaceFrame_Steel`)
    #    so `src/track.js` (`matName.includes('spaceframe')`) extracts the complete detailed space-frame lattice!
    span_x = ROAD_HALF_WIDTH + 4.3
    gbm = bmesh.new()
    tower_bays = 7
    z_top_tower = 9.90
    dz_t = z_top_tower / tower_bays

    for side in (-1.0, 1.0):
        tx = side * span_x
        # Heavy bolted steel base plate plinth
        bmesh.ops.create_cube(
            gbm, size=1.0,
            matrix=Matrix.Translation((tx, 0.0, 0.16)) @ Matrix.Diagonal((1.75, 1.85, 0.32, 1.0))
        )
        # 4 vertical tubular tower corner chords
        for dx in (-0.55, 0.55):
            for dy in (-0.62, 0.62):
                _add_tube_between(gbm, (tx + dx, dy, 0.25), (tx + dx, dy, z_top_tower), 0.095, segs=10)

        # 7 Bays of 4-face horizontal batten struts + true X-diagonal tubular lattice bracing
        for b_i in range(tower_bays):
            z0 = 0.28 + b_i * dz_t
            z1 = z0 + dz_t
            # Horizontal rectangular collar tubes
            for dy in (-0.62, 0.62):
                _add_tube_between(gbm, (tx - 0.55, dy, z1), (tx + 0.55, dy, z1), 0.045, segs=6)
            for dx in (-0.55, 0.55):
                _add_tube_between(gbm, (tx + dx, -0.62, z1), (tx + dx, 0.62, z1), 0.045, segs=6)
            # Alternating Warren / X-bracing on front/back & inboard/outboard tower faces
            if b_i % 2 == 0:
                _add_tube_between(gbm, (tx - 0.55, -0.62, z0), (tx + 0.55, -0.62, z1), 0.036, segs=6)
                _add_tube_between(gbm, (tx + 0.55,  0.62, z0), (tx - 0.55,  0.62, z1), 0.036, segs=6)
                _add_tube_between(gbm, (tx - 0.55, -0.62, z0), (tx - 0.55,  0.62, z1), 0.036, segs=6)
                _add_tube_between(gbm, (tx + 0.55,  0.62, z0), (tx + 0.55, -0.62, z1), 0.036, segs=6)
            else:
                _add_tube_between(gbm, (tx + 0.55, -0.62, z0), (tx - 0.55, -0.62, z1), 0.036, segs=6)
                _add_tube_between(gbm, (tx - 0.55,  0.62, z0), (tx + 0.55,  0.62, z1), 0.036, segs=6)
                _add_tube_between(gbm, (tx - 0.55,  0.62, z0), (tx - 0.55, -0.62, z1), 0.036, segs=6)
                _add_tube_between(gbm, (tx + 0.55, -0.62, z0), (tx + 0.55,  0.62, z1), 0.036, segs=6)

        # Outboard maintenance access ladder + safety hoop cage
        lx_out = tx + side * 0.76
        for ly in (-0.18, 0.18):
            _add_tube_between(gbm, (lx_out, ly, 0.35), (lx_out, ly, 8.85), 0.022, segs=6)
        for rz in range(16):
            zr = 0.65 + rz * 0.52
            _add_tube_between(gbm, (lx_out, -0.18, zr), (lx_out, 0.18, zr), 0.014, segs=5)

    # Overhead 16-Bay 4-Chord Space-Frame Bridge Span (`z = 7.35 .. 9.65`, `y = -0.62 .. +0.62`)
    z_lo, z_hi = 7.35, 9.65
    y_fr, y_bk = -0.62, 0.62
    x_left, x_right = -(span_x + 0.55), (span_x + 0.55)
    for zb in (z_lo, z_hi):
        for yb in (y_fr, y_bk):
            _add_tube_between(gbm, (x_left, yb, zb), (x_right, yb, zb), 0.092, segs=10)

    n_bays = 16
    bay_w = (x_right - x_left) / float(n_bays)
    for bi in range(n_bays + 1):
        bx0 = x_left + bi * bay_w
        # Vertical & transverse rectangular frame ribs at every bay station
        _add_tube_between(gbm, (bx0, y_fr, z_lo), (bx0, y_fr, z_hi), 0.040, segs=6)
        _add_tube_between(gbm, (bx0, y_bk, z_lo), (bx0, y_bk, z_hi), 0.040, segs=6)
        _add_tube_between(gbm, (bx0, y_fr, z_lo), (bx0, y_bk, z_lo), 0.040, segs=6)
        _add_tube_between(gbm, (bx0, y_fr, z_hi), (bx0, y_bk, z_hi), 0.040, segs=6)
        if bi < n_bays:
            bx1 = bx0 + bay_w
            # Front, Rear, Top & Bottom Warren diagonal space-frame webs!
            if bi % 2 == 0:
                _add_tube_between(gbm, (bx0, y_fr, z_lo), (bx1, y_fr, z_hi), 0.035, segs=6)
                _add_tube_between(gbm, (bx0, y_bk, z_hi), (bx1, y_bk, z_lo), 0.035, segs=6)
                _add_tube_between(gbm, (bx0, y_fr, z_hi), (bx1, y_bk, z_hi), 0.032, segs=6)
                _add_tube_between(gbm, (bx0, y_bk, z_lo), (bx1, y_fr, z_lo), 0.032, segs=6)
            else:
                _add_tube_between(gbm, (bx0, y_fr, z_hi), (bx1, y_fr, z_lo), 0.035, segs=6)
                _add_tube_between(gbm, (bx0, y_bk, z_lo), (bx1, y_bk, z_hi), 0.035, segs=6)
                _add_tube_between(gbm, (bx0, y_bk, z_hi), (bx1, y_fr, z_hi), 0.032, segs=6)
                _add_tube_between(gbm, (bx0, y_fr, z_lo), (bx1, y_bk, z_lo), 0.032, segs=6)

    # 5 Underslung FIA Start-Light Drop-Stanchions + Realistic Curved Sun-Visor Hoods on the Gantry Truss!
    for i in range(5):
        x_pod = (i - 2) * 1.78
        _add_tube_between(gbm, (x_pod - 0.24, y_fr, z_lo), (x_pod - 0.24, -0.74, 5.55), 0.028, segs=6)
        _add_tube_between(gbm, (x_pod + 0.24, y_fr, z_lo), (x_pod + 0.24, -0.74, 5.55), 0.028, segs=6)
        # Rear backing bezel & twin curved wrap-around anti-glare sun-visor hoods
        bmesh.ops.create_cube(
            gbm, size=1.0,
            matrix=Matrix.Translation((x_pod, -0.76, 6.34)) @ Matrix.Diagonal((0.78, 0.12, 1.56, 1.0))
        )
        for z_vis in (6.92, 6.18):
            # Curved semicircular sun-hood visor over each signal lamp
            for hs in range(7):
                a0 = math.pi * (hs / 7.0)
                a1 = math.pi * ((hs + 1) / 7.0)
                r_h = 0.28
                v0 = gbm.verts.new((x_pod + math.cos(a0) * r_h, -0.76, z_vis - 0.22 + math.sin(a0) * r_h))
                v1 = gbm.verts.new((x_pod + math.cos(a1) * r_h, -0.76, z_vis - 0.22 + math.sin(a1) * r_h))
                v2 = gbm.verts.new((x_pod + math.cos(a1) * r_h, -1.24, z_vis - 0.24 + math.sin(a1) * r_h))
                v3 = gbm.verts.new((x_pod + math.cos(a0) * r_h, -1.24, z_vis - 0.24 + math.sin(a0) * r_h))
                gbm.faces.new((v0, v1, v2, v3))

    add_box_uvs(gbm, scale_uv=0.35)
    for f in gbm.faces:
        f.material_index = 0

    # Slim central gantry sponsor signboard inside truss (slot 1 = `Sponsor_Face_Default`)
    gf_bm = bmesh.new()
    bmesh.ops.create_cube(
        gf_bm, size=1.0,
        matrix=Matrix.Translation((0.0, 0.0, 8.50)) @ Matrix.Diagonal((span_x * 1.82, 0.16, 2.02, 1.0))
    )
    add_planar_sign_uvs(gf_bm, -span_x * 0.91, span_x * 0.91, 7.49, 9.51)
    for f in gf_bm.faces:
        f.material_index = 1

    g_mesh = bpy.data.meshes.new("Start_Gantry_Truss_Mesh")
    tmp_gf = bpy.data.meshes.new("_tmp_gf")
    gf_bm.to_mesh(tmp_gf)
    gf_bm.free()
    gbm.from_mesh(tmp_gf)
    bpy.data.meshes.remove(tmp_gf)
    gbm.normal_update()
    gbm.to_mesh(g_mesh)
    gbm.free()

    g_obj = bpy.data.objects.new("Start_Gantry_Truss-col", g_mesh)
    g_obj.data.materials.append(mat_truss)
    g_obj.data.materials.append(mat_banner)
    g_obj.data.materials.append(mat_conc)
    link_to_scene(g_obj)
    apply_all_transforms(g_obj)

    # 5 Individual FIA StartLight_Pod_1..5 Nodes with Deep Wrap-Around Sun Hoods & Recessed Lenses
    for i in range(5):
        x_off = (i - 2) * 1.78
        lbm = bmesh.new()
        bmesh.ops.create_cube(
            lbm, size=1.0,
            matrix=Matrix.Translation((x_off, -0.78, 6.34)) @ Matrix.Diagonal((0.82, 0.36, 1.62, 1.0))
        )
        # Rear weatherproof telemetry junction box
        bmesh.ops.create_cube(
            lbm, size=1.0,
            matrix=Matrix.Translation((x_off, -0.54, 6.34)) @ Matrix.Diagonal((0.42, 0.16, 0.58, 1.0))
        )
        # Deep wrap-around FIA sun-hood cowls for upper & lower signal lamps
        for z_vis in (6.70, 5.96):
            for hs in range(8):
                a0 = math.pi * (hs / 8.0)
                a1 = math.pi * ((hs + 1) / 8.0)
                r_h = 0.27
                v0 = lbm.verts.new((x_off + math.cos(a0) * r_h, -0.94, z_vis + math.sin(a0) * r_h))
                v1 = lbm.verts.new((x_off + math.cos(a1) * r_h, -0.94, z_vis + math.sin(a1) * r_h))
                v2 = lbm.verts.new((x_off + math.cos(a1) * r_h, -1.28, z_vis - 0.03 + math.sin(a1) * r_h))
                v3 = lbm.verts.new((x_off + math.cos(a0) * r_h, -1.28, z_vis - 0.03 + math.sin(a0) * r_h))
                lbm.faces.new((v0, v1, v2, v3))
        add_box_uvs(lbm, scale_uv=0.8)
        for f in lbm.faces:
            f.material_index = 0

        for idx_l, z_l in enumerate((6.70, 5.96)):
            prev = set(lbm.faces)
            bmesh.ops.create_icosphere(
                lbm, subdivisions=2, radius=0.23,
                matrix=Matrix.Translation((x_off, -0.98, z_l)) @ Matrix.Diagonal((1.0, 0.36, 1.0, 1.0))
            )
            for f in lbm.faces:
                if f not in prev:
                    f.material_index = 1 if idx_l == 0 else 2

        pod_mesh = bpy.data.meshes.new(f"StartLight_Pod_{i + 1}_Mesh")
        lbm.normal_update()
        lbm.to_mesh(pod_mesh)
        lbm.free()

        pod_obj = bpy.data.objects.new(f"StartLight_Pod_{i + 1}", pod_mesh)
        pod_obj.data.materials.append(mat_dark)
        pod_obj.data.materials.append(mat_red_off)
        pod_obj.data.materials.append(mat_grn_off)
        link_to_scene(pod_obj)
        apply_all_transforms(pod_obj)


# =============================================================================
# 5. SUITE 3: env_barriers_fencing.glb
# =============================================================================
def _add_lofted_tube_or_limb(bm, stations, segs=8, mat_idx=0, cap_start=False, cap_end=False):
    """Lofts smooth elliptical cross-sections along a list of (center_vec, rx, ry, rot_euler_or_none) stations."""
    rings = []
    for st in stations:
        center = Vector(st[0])
        rx, ry = st[1], st[2]
        rot = st[3] if len(st) > 3 and st[3] is not None else Euler((0.0, 0.0, 0.0))
        rmat = rot.to_matrix()
        ring = []
        for s in range(segs):
            ang = (2.0 * math.pi * s) / float(segs)
            local_v = Vector((math.cos(ang) * rx, math.sin(ang) * ry, 0.0))
            v = bm.verts.new(center + (rmat @ local_v))
            ring.append(v)
        rings.append(ring)

    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]
        for s in range(segs):
            sn = (s + 1) % segs
            f = bm.faces.new((r0[s], r0[sn], r1[sn], r1[s]))
            f.material_index = mat_idx
            f.smooth = True

    if cap_start and len(rings) > 0:
        f0 = bm.faces.new(list(reversed(rings[0])))
        f0.material_index = mat_idx
        f0.smooth = True
    if cap_end and len(rings) > 0:
        f1 = bm.faces.new(rings[-1])
        f1.material_index = mat_idx
        f1.smooth = True


def _add_toroid_tire(bm, center_xyz, major_r=0.41, section_r=0.145, section_h=0.165, radial_segs=14, ring_segs=8, mat_idx=0):
    """Builds a realistic rounded hollow vulcanized motorsport barrier tire (toroidal tread + sidewalls + inner bead)."""
    cx, cy, cz = center_xyz
    rings = []
    for i in range(radial_segs):
        theta = (2.0 * math.pi * i) / float(radial_segs)
        ct, st = math.cos(theta), math.sin(theta)
        ring = []
        for j in range(ring_segs):
            phi = (2.0 * math.pi * j) / float(ring_segs)
            # Slightly flatter tread face at cos(phi) > 0 for authentic racing tire carcass silhouette
            cp, sp = math.cos(phi), math.sin(phi)
            r_local = major_r + cp * section_r
            z_local = sp * section_h * (0.92 if cp > 0.35 else 1.0)
            v = bm.verts.new((cx + ct * r_local, cy + st * r_local, cz + z_local))
            ring.append(v)
        rings.append(ring)

    for i in range(radial_segs):
        inxt = (i + 1) % radial_segs
        for j in range(ring_segs):
            jnxt = (j + 1) % ring_segs
            f = bm.faces.new((rings[i][j], rings[inxt][j], rings[inxt][jnxt], rings[i][jnxt]))
            f.material_index = mat_idx
            f.smooth = True


def populate_barriers_fencing_scene():
    # Authentic non-glowing motorsport barrier materials (preserving all src/track.js material-name substrings)
    mat_armco = create_pbr_material("Barrier_Armco_Galvanized", (0.66, 0.69, 0.72), roughness=0.42, metallic=0.78)
    mat_post = create_pbr_material("Barrier_Post_DarkSteel", (0.15, 0.17, 0.20), roughness=0.46, metallic=0.72)
    mat_foam = create_pbr_material("Barrier_SAFER_BlueFoam", (0.06, 0.36, 0.72), roughness=0.78, metallic=0.0)
    mat_tire_r = create_pbr_material("Barrier_Tire_FIARed", (0.76, 0.09, 0.10), roughness=0.78, metallic=0.0)
    mat_tire_w = create_pbr_material("Barrier_Tire_FIAWhite", (0.88, 0.89, 0.90), roughness=0.78, metallic=0.0)
    mat_rubber = create_pbr_material("Barrier_Conveyor_Rubber", (0.08, 0.085, 0.095), roughness=0.84, metallic=0.0)
    mat_fence = create_pbr_material("Barrier_CatchFence_Wire", (0.68, 0.72, 0.76), roughness=0.44, metallic=0.70, alpha=0.36)

    # 1. FIA Triple-Tier Corrugated W-Beam Armco Guardrail + Structural Steel H-Posts & Offset Blockouts
    abm = bmesh.new()
    x_stations = (-2.26, -1.85, -0.92, 0.0, 0.92, 1.85, 2.26)
    # Continuous 9-point W-beam cross-section (dz, y_front_back) per rail tier
    w_profile = (
        (-0.135, 0.035),
        (-0.115, -0.015),
        (-0.072, -0.062),
        (-0.025, -0.012),
        (0.000, 0.018),
        (0.025, -0.012),
        (0.072, -0.062),
        (0.115, -0.015),
        (0.135, 0.035),
    )
    thick_y = 0.016
    for z_rail in (0.29, 0.59, 0.89):
        front_cols = []
        back_cols = []
        for xp in x_stations:
            f_col = [abm.verts.new((xp, y_off, z_rail + dz)) for (dz, y_off) in w_profile]
            b_col = [abm.verts.new((xp, y_off + thick_y, z_rail + dz)) for (dz, y_off) in w_profile]
            front_cols.append(f_col)
            back_cols.append(b_col)
        for ix in range(len(x_stations) - 1):
            for ip in range(len(w_profile) - 1):
                ff = abm.faces.new((front_cols[ix][ip], front_cols[ix + 1][ip], front_cols[ix + 1][ip + 1], front_cols[ix][ip + 1]))
                ff.smooth = True
                bf = abm.faces.new((back_cols[ix][ip + 1], back_cols[ix + 1][ip + 1], back_cols[ix + 1][ip], back_cols[ix][ip]))
                bf.smooth = True
            # Rolled top and bottom edges
            abm.faces.new((front_cols[ix][-1], front_cols[ix + 1][-1], back_cols[ix + 1][-1], back_cols[ix][-1]))
            abm.faces.new((back_cols[ix][0], back_cols[ix + 1][0], front_cols[ix + 1][0], front_cols[ix][0]))
        # Splice bolt plates at post stations
        for xp_s in (-1.85, 0.0, 1.85):
            bmesh.ops.create_cube(
                abm, size=1.0,
                matrix=Matrix.Translation((xp_s, 0.012, z_rail)) @ Matrix.Diagonal((0.12, 0.028, 0.08, 1.0))
            )
    add_box_uvs(abm, scale_uv=0.5)
    for f in abm.faces:
        f.material_index = 0

    # True H-beam structural steel posts + rail offset blockouts + base anchor plates
    p_bm = bmesh.new()
    for x_p in (-1.85, 0.0, 1.85):
        # Front flange, central web, rear flange
        bmesh.ops.create_cube(p_bm, size=1.0, matrix=Matrix.Translation((x_p, 0.095, 0.54)) @ Matrix.Diagonal((0.13, 0.018, 1.08, 1.0)))
        bmesh.ops.create_cube(p_bm, size=1.0, matrix=Matrix.Translation((x_p, 0.175, 0.54)) @ Matrix.Diagonal((0.022, 0.15, 1.08, 1.0)))
        bmesh.ops.create_cube(p_bm, size=1.0, matrix=Matrix.Translation((x_p, 0.255, 0.54)) @ Matrix.Diagonal((0.13, 0.018, 1.08, 1.0)))
        # Base plate
        bmesh.ops.create_cube(p_bm, size=1.0, matrix=Matrix.Translation((x_p, 0.175, 0.015)) @ Matrix.Diagonal((0.22, 0.26, 0.03, 1.0)))
        # 3 rail spacer blockouts connecting W-beams to front flange
        for z_rail in (0.29, 0.59, 0.89):
            bmesh.ops.create_cube(p_bm, size=1.0, matrix=Matrix.Translation((x_p, 0.055, z_rail)) @ Matrix.Diagonal((0.10, 0.075, 0.14, 1.0)))
    add_box_uvs(p_bm, scale_uv=0.5)
    for f in p_bm.faces:
        f.material_index = 1

    armco_mesh = bpy.data.meshes.new("Barrier_Armco_Mesh")
    tmp_p = bpy.data.meshes.new("_tmp_ap")
    p_bm.to_mesh(tmp_p)
    p_bm.free()
    abm.from_mesh(tmp_p)
    bpy.data.meshes.remove(tmp_p)
    abm.normal_update()
    abm.to_mesh(armco_mesh)
    abm.free()

    armco_obj = bpy.data.objects.new("Barrier_Armco-col", armco_mesh)
    armco_obj.data.materials.append(mat_armco)
    armco_obj.data.materials.append(mat_post)
    link_to_scene(armco_obj)
    apply_all_transforms(armco_obj)

    # 2. SAFER Barrier (4-Tube HSS Steel Impact Wall + Recessed Splice Straps + Polystyrene Foam Stacks)
    sbm = bmesh.new()
    for z_tube in (0.16, 0.43, 0.70, 0.97):
        bmesh.ops.create_cube(
            sbm, size=1.0,
            matrix=Matrix.Translation((0.0, 0.0, z_tube)) @ Matrix.Diagonal((6.0, 0.18, 0.23, 1.0))
        )
    # Internal vertical steel splice straps & retaining channels
    for x_sp in (-2.40, -0.80, 0.80, 2.40):
        bmesh.ops.create_cube(
            sbm, size=1.0,
            matrix=Matrix.Translation((x_sp, 0.10, 0.565)) @ Matrix.Diagonal((0.11, 0.04, 1.02, 1.0))
        )
    add_box_uvs(sbm, scale_uv=0.4)
    for f in sbm.faces:
        f.material_index = 0

    fbm_foam = bmesh.new()
    for x_pad in (-2.40, -1.20, 0.0, 1.20, 2.40):
        # Trapezoidal multi-sheet closed-cell polystyrene absorber bundle
        bmesh.ops.create_cube(
            fbm_foam, size=1.0,
            matrix=Matrix.Translation((x_pad, 0.26, 0.56)) @ Matrix.Diagonal((0.68, 0.34, 0.98, 1.0))
        )
        bmesh.ops.create_cube(
            fbm_foam, size=1.0,
            matrix=Matrix.Translation((x_pad, 0.44, 0.56)) @ Matrix.Diagonal((0.54, 0.08, 0.94, 1.0))
        )
    add_box_uvs(fbm_foam, scale_uv=0.5)
    for f in fbm_foam.faces:
        f.material_index = 1

    safer_mesh = bpy.data.meshes.new("Barrier_SAFER_Mesh")
    tmp_sf = bpy.data.meshes.new("_tmp_sf")
    fbm_foam.to_mesh(tmp_sf)
    fbm_foam.free()
    sbm.from_mesh(tmp_sf)
    bpy.data.meshes.remove(tmp_sf)
    sbm.normal_update()
    sbm.to_mesh(safer_mesh)
    sbm.free()

    safer_obj = bpy.data.objects.new("Barrier_SAFER-col", safer_mesh)
    safer_obj.data.materials.append(mat_armco)
    safer_obj.data.materials.append(mat_foam)
    link_to_scene(safer_obj)
    apply_all_transforms(safer_obj)

    # 3. Bolted 3-High x 4-Wide Hollow Toroidal FIA Tire Wall + Heavy Rubber Conveyor Impact Belt
    tbm = bmesh.new()
    for col_i, x_t in enumerate((-1.68, -0.56, 0.56, 1.68)):
        for row_j, z_t in enumerate((0.18, 0.52, 0.86)):
            mat_i = (col_i + row_j) % 2
            _add_toroid_tire(
                tbm, center_xyz=(x_t, 0.0, z_t),
                major_r=0.405, section_r=0.145, section_h=0.165,
                radial_segs=14, ring_segs=8, mat_idx=mat_i
            )
    # Front bolted vulcanized rubber conveyor belt impact face + vertical clamping battens
    prev = set(tbm.faces)
    bmesh.ops.create_cube(
        tbm, size=1.0,
        matrix=Matrix.Translation((0.0, -0.555, 0.52)) @ Matrix.Diagonal((4.52, 0.045, 0.86, 1.0))
    )
    for x_clamp in (-1.68, -0.56, 0.56, 1.68):
        bmesh.ops.create_cube(
            tbm, size=1.0,
            matrix=Matrix.Translation((x_clamp, -0.585, 0.52)) @ Matrix.Diagonal((0.085, 0.025, 0.88, 1.0))
        )
    for f in tbm.faces:
        if f not in prev:
            f.material_index = 2
    add_box_uvs(tbm, scale_uv=0.6)

    tire_mesh = bpy.data.meshes.new("Barrier_TireWall_Mesh")
    tbm.normal_update()
    tbm.to_mesh(tire_mesh)
    tbm.free()

    tire_obj = bpy.data.objects.new("Barrier_TireWall-col", tire_mesh)
    tire_obj.data.materials.append(mat_tire_r)
    tire_obj.data.materials.append(mat_tire_w)
    tire_obj.data.materials.append(mat_rubber)
    link_to_scene(tire_obj)
    apply_all_transforms(tire_obj)

    # 4. FIA Grade-1 Curved Debris Catch Fence (4 Steel Stanchions + 2-Stage Overhang + 7 Tension Cables + Mesh)
    cbm = bmesh.new()
    for x_p in (-5.8, -1.933, 1.933, 5.8):
        # Vertical heavy steel stanchion + base gusset plate
        bmesh.ops.create_cube(
            cbm, size=1.0,
            matrix=Matrix.Translation((x_p, 0.05, 0.03)) @ Matrix.Diagonal((0.26, 0.30, 0.06, 1.0))
        )
        bmesh.ops.create_cone(
            cbm, cap_ends=True, cap_tris=True, segments=8,
            radius1=0.075, radius2=0.065, depth=3.55,
            matrix=Matrix.Translation((x_p, 0.0, 1.775))
        )
        # Rear triangular gusset fin at stanchion base
        bmesh.ops.create_cube(
            cbm, size=1.0,
            matrix=Matrix.Translation((x_p, 0.11, 0.28)) @ Euler((-0.26, 0.0, 0.0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.028, 0.16, 0.52, 1.0))
        )
        # 2-segment curved FIA debris overhang arm leaning toward circuit
        m_over1 = Matrix.Translation((x_p, -0.22, 3.84)) @ Euler((0.52, 0.0, 0.0)).to_matrix().to_4x4()
        bmesh.ops.create_cone(
            cbm, cap_ends=True, cap_tris=True, segments=8,
            radius1=0.062, radius2=0.054, depth=0.72, matrix=m_over1
        )
        m_over2 = Matrix.Translation((x_p, -0.58, 4.30)) @ Euler((0.86, 0.0, 0.0)).to_matrix().to_4x4()
        bmesh.ops.create_cone(
            cbm, cap_ends=True, cap_tris=True, segments=8,
            radius1=0.054, radius2=0.044, depth=0.64, matrix=m_over2
        )

    # 5 horizontal high-tensile steel catch cables on vertical face + 2 on overhang canopy
    cable_coords = (
        (-0.045, 0.95),
        (-0.045, 1.60),
        (-0.045, 2.25),
        (-0.045, 2.90),
        (-0.045, 3.52),
        (-0.34, 4.02),
        (-0.74, 4.46),
    )
    for y_cab, z_cab in cable_coords:
        m_c = Matrix.Translation((0.0, y_cab, z_cab)) @ Matrix.Rotation(math.pi * 0.5, 4, "Y")
        bmesh.ops.create_cone(
            cbm, cap_ends=True, cap_tris=True, segments=6,
            radius1=0.020, radius2=0.020, depth=12.4, matrix=m_c
        )
    add_box_uvs(cbm, scale_uv=0.4)
    for f in cbm.faces:
        f.material_index = 0

    # Vertical debris wire mesh panel + upper angled overhang wire mesh panel
    w_bm = bmesh.new()
    bmesh.ops.create_cube(
        w_bm, size=1.0,
        matrix=Matrix.Translation((0.0, -0.025, 2.15)) @ Matrix.Diagonal((12.4, 0.016, 2.82, 1.0))
    )
    m_over_mesh = (
        Matrix.Translation((0.0, -0.42, 4.04))
        @ Euler((0.68, 0.0, 0.0)).to_matrix().to_4x4()
        @ Matrix.Diagonal((12.4, 0.016, 1.18, 1.0))
    )
    bmesh.ops.create_cube(w_bm, size=1.0, matrix=m_over_mesh)
    add_box_uvs(w_bm, scale_uv=0.5)
    for f in w_bm.faces:
        f.material_index = 1

    fence_mesh = bpy.data.meshes.new("Barrier_CatchFence_Mesh")
    tmp_w = bpy.data.meshes.new("_tmp_fw")
    w_bm.to_mesh(tmp_w)
    w_bm.free()
    cbm.from_mesh(tmp_w)
    bpy.data.meshes.remove(tmp_w)
    cbm.normal_update()
    cbm.to_mesh(fence_mesh)
    cbm.free()

    fence_obj = bpy.data.objects.new("Barrier_CatchFence", fence_mesh)
    fence_obj.data.materials.append(mat_post)
    fence_obj.data.materials.append(mat_fence)
    link_to_scene(fence_obj)
    apply_all_transforms(fence_obj)


# =============================================================================
# 6. SUITE 4: env_grandstands_crowds.glb
#    (Grandstand_Tribune-col + Spectator_Cheering + Spectator_FlagWaver + Marshal_FlagWaver)
# =============================================================================
def _add_limb_chain(bm, pts_radii, segs=8, mat_idx=1, cap_end=True):
    """Builds a smooth anatomical limb chain along 3D points [(pos_tuple, r_x, r_y), ...] with tangent-aligned rings."""
    n = len(pts_radii)
    rings = []
    up_ref = Vector((0.0, 1.0, 0.0))
    for i in range(n):
        p = Vector(pts_radii[i][0])
        rx, ry = pts_radii[i][1], pts_radii[i][2]
        if i == 0:
            tan = (Vector(pts_radii[1][0]) - p).normalized()
        elif i == n - 1:
            tan = (p - Vector(pts_radii[i - 1][0])).normalized()
        else:
            tan = (Vector(pts_radii[i + 1][0]) - Vector(pts_radii[i - 1][0])).normalized()
        ref = Vector((1.0, 0.0, 0.0)) if abs(tan.dot(up_ref)) > 0.92 else up_ref
        side = tan.cross(ref).normalized()
        binorm = side.cross(tan).normalized()
        ring = []
        for s in range(segs):
            ang = (2.0 * math.pi * s) / float(segs)
            v = bm.verts.new(p + side * (math.cos(ang) * rx) + binorm * (math.sin(ang) * ry))
            ring.append(v)
        rings.append(ring)

    for i in range(n - 1):
        r0, r1 = rings[i], rings[i + 1]
        for s in range(segs):
            sn = (s + 1) % segs
            f = bm.faces.new((r0[s], r0[sn], r1[sn], r1[s]))
            f.material_index = mat_idx
            f.smooth = True

    if cap_end and rings:
        fc = bm.faces.new(rings[-1])
        fc.material_index = mat_idx
        fc.smooth = True


def _build_humanoid_bmesh(arm_pose="CHEER", headwear="BASEBALL_CAP"):
    """
    Builds a cleanly proportioned 1.74m motorsport spectator or FIA trackside marshal:
      mat 0 = trousers / boots / belt
      mat 1 = shirt / jersey / Nomex coverall torso & sleeves
      mat 2 = natural human skin (head, neck, exposed forearms/hands)
      mat 4 (or 2/0) = headwear (baseball cap, wide-brim sun-hat, or FIA marshal cap + ear defenders)
    """
    bm = bmesh.new()

    # 1. Sculpted Sneakers / Boots + Anatomical Ankles, Calves, Knees, Thighs & Pelvis (mat 0)
    for sx in (-0.112, 0.112):
        # Molded shoe / boot extending forward (-Y is facing direction)
        shoe_stations = [
            ((sx, 0.055, 0.042), 0.050, 0.040, Euler((math.pi * 0.5, 0.0, 0.0))),
            ((sx, -0.015, 0.048), 0.054, 0.046, Euler((math.pi * 0.5, 0.0, 0.0))),
            ((sx, -0.095, 0.038), 0.050, 0.036, Euler((math.pi * 0.5, 0.0, 0.0))),
            ((sx, -0.145, 0.026), 0.036, 0.024, Euler((math.pi * 0.5, 0.0, 0.0))),
        ]
        _add_lofted_tube_or_limb(bm, shoe_stations, segs=8, mat_idx=0, cap_start=True, cap_end=True)

        # Ankle -> Calf -> Knee -> Thigh loft
        leg_stations = [
            ((sx, 0.00, 0.075), 0.048, 0.052),
            ((sx, 0.01, 0.240), 0.064, 0.068),
            ((sx, -0.008, 0.430), 0.058, 0.062),
            ((sx, 0.00, 0.640), 0.076, 0.082),
            ((sx * 0.90, 0.005, 0.815), 0.086, 0.092),
        ]
        _add_lofted_tube_or_limb(bm, leg_stations, segs=8, mat_idx=0, cap_start=False, cap_end=False)

    # Joined Pelvis / Hips & Waistband (mat 0)
    pelvis_stations = [
        ((0.0, 0.005, 0.785), 0.175, 0.108),
        ((0.0, 0.004, 0.855), 0.182, 0.114),
        ((0.0, 0.000, 0.915), 0.164, 0.104),
    ]
    _add_lofted_tube_or_limb(bm, pelvis_stations, segs=10, mat_idx=0, cap_start=True, cap_end=True)

    # 2. Tapered Cotton/Nomex Torso with Athletic Chest, Rounded Shoulders & Collar (mat 1)
    torso_stations = [
        ((0.0, 0.000, 0.905), 0.162, 0.104),
        ((0.0, -0.004, 1.020), 0.168, 0.110),
        ((0.0, -0.010, 1.155), 0.194, 0.124),
        ((0.0, -0.008, 1.285), 0.218, 0.128),
        ((0.0, -0.004, 1.365), 0.196, 0.112),
        ((0.0, 0.000, 1.415), 0.086, 0.078),
    ]
    _add_lofted_tube_or_limb(bm, torso_stations, segs=12, mat_idx=1, cap_start=False, cap_end=True)

    # 3. Articulated Two-Segment Human Arms (Jersey Sleeve + Forearm/Hand)
    is_marshal = (arm_pose == "FLAG_MARSHAL")
    forearm_mat = 1 if is_marshal else 2
    hand_mat = 0 if is_marshal else 2

    if arm_pose == "CHEER":
        for sx in (-1.0, 1.0):
            # Short polo/t-shirt sleeve over deltoid & upper bicep (mat 1)
            _add_limb_chain(bm, [
                ((sx * 0.195, -0.008, 1.335), 0.062, 0.060),
                ((sx * 0.258, -0.032, 1.405), 0.054, 0.052),
                ((sx * 0.295, -0.050, 1.455), 0.050, 0.048),
            ], segs=8, mat_idx=1, cap_end=False)
            # Exposed natural forearm & raised cheering hand (mat 2)
            _add_limb_chain(bm, [
                ((sx * 0.292, -0.048, 1.450), 0.045, 0.044),
                ((sx * 0.335, -0.075, 1.525), 0.042, 0.040),
                ((sx * 0.365, -0.105, 1.645), 0.035, 0.034),
                ((sx * 0.378, -0.118, 1.715), 0.040, 0.026),
                ((sx * 0.382, -0.124, 1.755), 0.028, 0.018),
            ], segs=8, mat_idx=forearm_mat, cap_end=True)
    else:
        # Asymmetric two-handed grip on angled flagpole in front (-Y)
        grip_y = -0.355 if is_marshal else -0.335
        grip_configs = (
            # Left arm reaches lower staff grip
            (-1.0, (-0.195, -0.008, 1.330), (-0.215, -0.145, 1.190), (-0.135, -0.245, 1.085), (-0.025, grip_y, 1.020)),
            # Right arm reaches upper staff grip
            (1.0, (0.195, -0.008, 1.335), (0.215, -0.145, 1.255), (0.135, -0.255, 1.250), (0.022, grip_y, 1.245)),
        )
        for sx, p_sh, p_mid, p_elb, p_wr in grip_configs:
            _add_limb_chain(bm, [
                (p_sh, 0.062, 0.058),
                (p_mid, 0.052, 0.050),
            ], segs=8, mat_idx=1, cap_end=False)
            _add_limb_chain(bm, [
                (p_mid, 0.046, 0.045),
                (p_elb, 0.042, 0.040),
                (p_wr, 0.036, 0.034),
            ], segs=8, mat_idx=forearm_mat, cap_end=True)
            # Gripping fist around flagpole
            prev_h = set(bm.faces)
            bmesh.ops.create_icosphere(
                bm, subdivisions=1, radius=0.042,
                matrix=Matrix.Translation(p_wr) @ Matrix.Diagonal((1.05, 1.15, 0.95, 1.0))
            )
            for f in bm.faces:
                if f not in prev_h:
                    f.material_index = hand_mat
                    f.smooth = True

    # 4. Sculpted Neck & Anatomically Proportioned Oval Human Head (mat 2)
    head_stations = [
        ((0.0, 0.002, 1.400), 0.056, 0.058),
        ((0.0, -0.002, 1.455), 0.052, 0.054),
        ((0.0, -0.012, 1.485), 0.072, 0.082),
        ((0.0, -0.014, 1.535), 0.088, 0.102),
        ((0.0, -0.008, 1.590), 0.092, 0.106),
        ((0.0, 0.002, 1.638), 0.080, 0.092),
        ((0.0, 0.008, 1.668), 0.046, 0.052),
    ]
    _add_lofted_tube_or_limb(bm, head_stations, segs=10, mat_idx=2, cap_start=False, cap_end=True)
    # Subtle nose bridge facing -Y
    prev_n = set(bm.faces)
    bmesh.ops.create_cube(
        bm, size=1.0,
        matrix=Matrix.Translation((0.0, -0.114, 1.552)) @ Euler((0.22, 0.0, 0.0)).to_matrix().to_4x4() @ Matrix.Diagonal((0.024, 0.028, 0.042, 1.0))
    )
    for f in bm.faces:
        if f not in prev_n:
            f.material_index = 2
            f.smooth = True

    # 5. Authentic Motorsport Headwear (mat 4 = dedicated cap/hat material)
    if headwear in ("BASEBALL_CAP", "MARSHAL_CAP"):
        # Fitted 6-panel domed cap crown
        cap_stations = [
            ((0.0, -0.006, 1.586), 0.097, 0.110),
            ((0.0, -0.002, 1.628), 0.094, 0.105),
            ((0.0, 0.004, 1.664), 0.074, 0.082),
            ((0.0, 0.008, 1.684), 0.022, 0.024),
        ]
        _add_lofted_tube_or_limb(bm, cap_stations, segs=10, mat_idx=4, cap_start=False, cap_end=True)

        # Curved forward visor bill (-Y) with cambered arch
        visor_cols = 6
        v_front, v_back = [], []
        for vc in range(visor_cols + 1):
            u = (vc / float(visor_cols)) * 2.0 - 1.0
            vx_b = u * 0.088
            vy_b = -0.088 - (1.0 - u * u) * 0.022
            vz_b = 1.592 + (1.0 - u * u) * 0.016
            vx_f = u * 0.076
            vy_f = -0.195 - (1.0 - u * u) * 0.032
            vz_f = 1.572 + (1.0 - u * u) * 0.018
            v_back.append(bm.verts.new((vx_b, vy_b, vz_b)))
            v_front.append(bm.verts.new((vx_f, vy_f, vz_f)))
        for vc in range(visor_cols):
            f_top = bm.faces.new((v_back[vc], v_back[vc + 1], v_front[vc + 1], v_front[vc]))
            f_top.material_index = 4
            f_top.smooth = True

        if headwear == "MARSHAL_CAP":
            # FIA Trackside Marshal acoustic ear-defenders (mat 0 dark safety gear)
            prev_ear = set(bm.faces)
            for sx in (-1.0, 1.0):
                bmesh.ops.create_cone(
                    bm, cap_ends=True, cap_tris=True, segments=8,
                    radius1=0.040, radius2=0.036, depth=0.034,
                    matrix=Matrix.Translation((sx * 0.102, 0.0, 1.555)) @ Matrix.Rotation(math.pi * 0.5, 4, "Y")
                )
            for f in bm.faces:
                if f not in prev_ear:
                    f.material_index = 0
                    f.smooth = True

    elif headwear == "SUN_HAT":
        # Wide-brim motorsport bucket / sun-hat (360-deg gently drooped sun brim + tapered crown + hatband)
        brim_stations = [
            ((0.0, -0.004, 1.572), 0.215, 0.228),
            ((0.0, -0.004, 1.596), 0.155, 0.168),
            ((0.0, -0.004, 1.602), 0.102, 0.114),
        ]
        _add_lofted_tube_or_limb(bm, brim_stations, segs=14, mat_idx=4, cap_start=False, cap_end=False)
        # Hatband ribbon (mat 0 dark contrast)
        band_stations = [
            ((0.0, -0.004, 1.598), 0.103, 0.115),
            ((0.0, -0.004, 1.622), 0.101, 0.112),
        ]
        _add_lofted_tube_or_limb(bm, band_stations, segs=14, mat_idx=0, cap_start=False, cap_end=False)
        # Bucket / sun-hat flat-top crown (mat 4)
        crown_stations = [
            ((0.0, -0.004, 1.620), 0.100, 0.111),
            ((0.0, -0.002, 1.678), 0.088, 0.098),
            ((0.0, 0.000, 1.688), 0.072, 0.080),
        ]
        _add_lofted_tube_or_limb(bm, crown_stations, segs=14, mat_idx=4, cap_start=False, cap_end=True)

    return bm


def _add_subdivided_flag_banner(bm, pole_base, pole_len, cloth_w, cloth_h, cols, mat_pole, mat_cloth):
    # Tapered fiberglass flagpole + top finial cap
    prev = set(bm.faces)
    m_pole = Matrix.Translation((pole_base[0], pole_base[1], pole_base[2] + pole_len * 0.5))
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=True, segments=8,
        radius1=0.024, radius2=0.015, depth=pole_len, matrix=m_pole
    )
    bmesh.ops.create_icosphere(
        bm, subdivisions=1, radius=0.024,
        matrix=Matrix.Translation((pole_base[0], pole_base[1], pole_base[2] + pole_len + 0.01))
    )
    for f in bm.faces:
        if f not in prev:
            f.material_index = mat_pole
            f.smooth = True

    # Subdivided 3D Waving Cloth Grid along +X from flagpole top so vertex shader ripples cleanly
    top_z = pole_base[2] + pole_len - 0.06
    rows = 4
    grid_verts = []
    for r in range(rows + 1):
        v_frac = r / float(rows)
        z_base = top_z - cloth_h * (1.0 - v_frac)
        row_v = []
        for c in range(cols + 1):
            u_frac = c / float(cols)
            x_u = pole_base[0] + 0.016 + u_frac * cloth_w
            # Natural multi-harmonic cloth drape + slight trailing gravity sag
            y_wave = (
                math.sin(u_frac * math.pi * 1.65 + (1.0 - v_frac) * 0.45) * 0.055 * u_frac
                + math.sin(u_frac * math.pi * 3.1) * 0.018 * u_frac
            )
            z_sag = -0.035 * (u_frac ** 1.4) * (1.0 - 0.3 * v_frac)
            v = bm.verts.new((x_u, pole_base[1] + y_wave, z_base + z_sag))
            row_v.append(v)
        grid_verts.append(row_v)

    for r in range(rows):
        for c in range(cols):
            f = bm.faces.new((
                grid_verts[r][c],
                grid_verts[r][c + 1],
                grid_verts[r + 1][c + 1],
                grid_verts[r + 1][c],
            ))
            f.material_index = mat_cloth
            f.smooth = True


def populate_grandstands_crowds_scene():
    # Architectural grandstand materials + natural matte motorsport wardrobe materials (roughness 0.85, zero glow)
    mat_struct = create_pbr_material("Grandstand_Concrete_Steel", (0.24, 0.27, 0.31), roughness=0.68, metallic=0.22)
    mat_roof = create_pbr_material("Grandstand_Tensile_Roof", (0.90, 0.92, 0.95), roughness=0.46, metallic=0.08)
    mat_stair = create_pbr_material("Grandstand_Safety_Yellow", (0.86, 0.66, 0.08), roughness=0.64, metallic=0.04)

    mat_pants = create_pbr_material("Crowd_Dark_Trousers", (0.14, 0.17, 0.22), roughness=0.86, metallic=0.0)
    mat_jersey = create_pbr_material("Crowd_Tintable_Jersey", (0.94, 0.95, 0.97), roughness=0.85, metallic=0.0)
    mat_skin = create_pbr_material("Crowd_Head_Cap", (0.84, 0.67, 0.54), roughness=0.78, metallic=0.0)
    mat_cap = create_pbr_material("Crowd_Baseball_Cap", (0.91, 0.92, 0.95), roughness=0.85, metallic=0.0)
    mat_sunhat = create_pbr_material("Crowd_SunHat_Woven", (0.82, 0.73, 0.54), roughness=0.88, metallic=0.0)
    mat_flag_cloth = create_pbr_material("Crowd_Tintable_Flag", (0.96, 0.97, 0.99), roughness=0.82, metallic=0.0)
    mat_marshal_suit = create_pbr_material("Marshal_FIA_SafetyOrange", (0.90, 0.36, 0.05), roughness=0.85, metallic=0.0)
    mat_marshal_cap = create_pbr_material("Marshal_White_SafetyCap", (0.92, 0.93, 0.95), roughness=0.85, metallic=0.0)

    # 1. Architectural Grandstand Tribune (28m span, clean seat rows + backs, vomitories, handrails & cantilevered roof)
    gbm = bmesh.new()
    span_w = 28.0
    # Lower concourse podium (split into 3 bays to form recessed vomitory portals at x = +/-6.8)
    for x_bay, w_bay in ((-10.85, 6.3), (0.0, 11.7), (10.85, 6.3)):
        bmesh.ops.create_cube(
            gbm, size=1.0,
            matrix=Matrix.Translation((x_bay, 0.0, 1.65)) @ Matrix.Diagonal((w_bay, 17.6, 3.3, 1.0))
        )
    # Recessed vomitory back-wall & soffit lintel
    bmesh.ops.create_cube(
        gbm, size=1.0,
        matrix=Matrix.Translation((0.0, 2.2, 1.65)) @ Matrix.Diagonal((span_w, 13.2, 3.3, 1.0))
    )
    bmesh.ops.create_cube(
        gbm, size=1.0,
        matrix=Matrix.Translation((0.0, -6.95, 3.52)) @ Matrix.Diagonal((span_w, 1.7, 0.56, 1.0))
    )

    # Front trackside concrete safety parapet + tubular steel front balustrade handrail
    bmesh.ops.create_cube(
        gbm, size=1.0,
        matrix=Matrix.Translation((0.0, -7.65, 3.82)) @ Matrix.Diagonal((span_w, 0.28, 0.92, 1.0))
    )
    bmesh.ops.create_cube(
        gbm, size=1.0,
        matrix=Matrix.Translation((0.0, -7.65, 4.46)) @ Matrix.Diagonal((span_w, 0.06, 0.06, 1.0))
    )
    for x_bal in (-13.5, -10.2, -7.6, -6.0, -3.0, 0.0, 3.0, 6.0, 7.6, 10.2, 13.5):
        bmesh.ops.create_cube(
            gbm, size=1.0,
            matrix=Matrix.Translation((x_bal, -7.65, 4.35)) @ Matrix.Diagonal((0.05, 0.05, 0.26, 1.0))
        )

    # Rear facade wall + 5 structural steel box-columns + rear wind-bracing X-ties + overhead cantilever spine masts
    bmesh.ops.create_cube(
        gbm, size=1.0,
        matrix=Matrix.Translation((0.0, 7.9, 8.2)) @ Matrix.Diagonal((span_w, 1.5, 16.4, 1.0))
    )
    col_xs = (-12.6, -6.3, 0.0, 6.3, 12.6)
    for px in col_xs:
        # Rear vertical mast rising above roofline to anchor tensile tie-rods
        bmesh.ops.create_cube(
            gbm, size=1.0,
            matrix=Matrix.Translation((px, 8.35, 10.4)) @ Matrix.Diagonal((0.52, 0.62, 20.8, 1.0))
        )
        # Underside tapered steel cantilever roof girder
        m_girder = (
            Matrix.Translation((px, -0.4, 16.95))
            @ Euler((0.09, 0.0, 0.0)).to_matrix().to_4x4()
            @ Matrix.Diagonal((0.32, 20.6, 0.56, 1.0))
        )
        bmesh.ops.create_cube(gbm, size=1.0, matrix=m_girder)
        # Overhead steel tension tie-rod from mast peak (y=8.35, z=20.6) forward to mid-cantilever (y=-4.5, z=17.4)
        p_top = Vector((px, 8.35, 20.5))
        p_mid = Vector((px, -4.80, 17.35))
        d_vec = p_mid - p_top
        m_tie = Matrix.Translation((p_top + p_mid) * 0.5) @ d_vec.to_track_quat("Z", "Y").to_matrix().to_4x4()
        bmesh.ops.create_cone(
            gbm, cap_ends=True, cap_tris=True, segments=6,
            radius1=0.055, radius2=0.055, depth=d_vec.length, matrix=m_tie
        )

    # Stepped side rake wind-walls
    for sx in (-span_w * 0.5 + 0.35, span_w * 0.5 - 0.35):
        for r in range(12):
            sy = -6.6 + r * 1.18
            sz = 3.55 + r * 0.88
            bmesh.ops.create_cube(
                gbm, size=1.0,
                matrix=Matrix.Translation((sx, sy, (sz + 1.45) * 0.5 + 1.1)) @ Matrix.Diagonal((0.68, 1.24, sz + 0.35, 1.0))
            )

    # 12 Clean Concrete Terrace Risers + Molded Continuous Seat Benches (split cleanly at twin aisle stairs x = +/-6.8)
    seat_bays = ((-10.35, 5.5), (0.0, 12.0), (10.35, 5.5))
    for r in range(12):
        sy = -6.6 + r * 1.18
        sz = 3.55 + r * 0.88
        # Structural concrete terrace tread/riser
        bmesh.ops.create_cube(
            gbm, size=1.0,
            matrix=Matrix.Translation((0.0, sy, sz - 0.14)) @ Matrix.Diagonal((span_w - 1.4, 1.24, 0.58, 1.0))
        )
        # Molded stadium seat-pan & seat-back rows in the 3 seating bays
        for x_sb, w_sb in seat_bays:
            bmesh.ops.create_cube(
                gbm, size=1.0,
                matrix=Matrix.Translation((x_sb, sy + 0.14, sz + 0.28)) @ Matrix.Diagonal((w_sb, 0.42, 0.10, 1.0))
            )
            bmesh.ops.create_cube(
                gbm, size=1.0,
                matrix=Matrix.Translation((x_sb, sy + 0.34, sz + 0.50)) @ Euler((-0.14, 0.0, 0.0)).to_matrix().to_4x4() @ Matrix.Diagonal((w_sb, 0.08, 0.40, 1.0))
            )

    # Tubular steel stair handrails flanking & dividing the twin aisle stairways (x = -6.8, +6.8)
    rake_len = math.hypot(11 * 1.18, 11 * 0.88) + 1.2
    rake_ang = math.atan2(0.88, 1.18)
    for sx_st in (-6.8, 6.8):
        for rail_dx in (-0.74, 0.0, 0.74):
            rx = sx_st + rail_dx
            m_hr = (
                Matrix.Translation((rx, -0.10, 9.25))
                @ Euler((rake_ang, 0.0, 0.0)).to_matrix().to_4x4()
                @ Matrix.Diagonal((0.045, rake_len, 0.055, 1.0))
            )
            bmesh.ops.create_cube(gbm, size=1.0, matrix=m_hr)
            for r_post in (0, 3, 6, 9, 11):
                py = -6.6 + r_post * 1.18
                pz = 3.55 + r_post * 0.88 + 0.45
                bmesh.ops.create_cube(
                    gbm, size=1.0,
                    matrix=Matrix.Translation((rx, py, pz)) @ Matrix.Diagonal((0.045, 0.045, 0.82, 1.0))
                )

    for f in gbm.faces:
        f.material_index = 0

    # Cantilevered tensile stadium roof awning + front aerodynamic drip fascia (material 1 = `Grandstand_Tensile_Roof`)
    prev = set(gbm.faces)
    m_roof = (
        Matrix.Translation((0.0, -0.8, 17.52))
        @ Euler((0.09, 0.0, 0.0)).to_matrix().to_4x4()
        @ Matrix.Diagonal((span_w + 2.4, 21.8, 0.34, 1.0))
    )
    bmesh.ops.create_cube(gbm, size=1.0, matrix=m_roof)
    # Front roof drip fascia lip
    bmesh.ops.create_cube(
        gbm, size=1.0,
        matrix=Matrix.Translation((0.0, -11.62, 16.52)) @ Matrix.Diagonal((span_w + 2.4, 0.24, 0.52, 1.0))
    )
    for f in gbm.faces:
        if f not in prev:
            f.material_index = 1

    # Twin Stepped Safety-Yellow Aisle Stairways (24 half-riser human steps per aisle, material 2)
    prev = set(gbm.faces)
    for sx_st in (-6.8, 6.8):
        for s_step in range(24):
            sy = -6.92 + s_step * 0.59
            sz = 3.40 + s_step * 0.44
            bmesh.ops.create_cube(
                gbm, size=1.0,
                matrix=Matrix.Translation((sx_st, sy, sz)) @ Matrix.Diagonal((1.46, 0.62, 0.46, 1.0))
            )
    for f in gbm.faces:
        if f not in prev:
            f.material_index = 2
    add_box_uvs(gbm, scale_uv=0.25)

    gs_mesh = bpy.data.meshes.new("Grandstand_Tribune_Mesh")
    gbm.normal_update()
    gbm.to_mesh(gs_mesh)
    gbm.free()
    gs_obj = bpy.data.objects.new("Grandstand_Tribune-col", gs_mesh)
    gs_obj.data.materials.append(mat_struct)
    gs_obj.data.materials.append(mat_roof)
    gs_obj.data.materials.append(mat_stair)
    link_to_scene(gs_obj)
    apply_all_transforms(gs_obj)

    # 2. Spectator_Cheering (Clean human proportions + fitted baseball cap + smooth cheering vertex weights)
    cbm = _build_humanoid_bmesh("CHEER", headwear="BASEBALL_CAP")
    add_box_uvs(cbm, scale_uv=1.0)
    col_c = cbm.loops.layers.color.new("Col")
    for f in cbm.faces:
        f.smooth = True
        for lp in f.loops:
            co = lp.vert.co
            jump_w = max(0.0, min(1.0, co.z / 1.68))
            # Smooth shoulder-to-wrist wave weight so raised arms cheer naturally without mesh tearing
            arm_t = max(0.0, min(1.0, (abs(co.x) - 0.20) / 0.14)) if co.z > 1.22 else 0.0
            ao = 0.78 + 0.18 * max(0.0, min(1.0, co.z / 1.60))
            lp[col_c] = (jump_w, arm_t, ao, 1.0)
    c_mesh = bpy.data.meshes.new("Spectator_Cheering_Mesh")
    cbm.normal_update()
    cbm.to_mesh(c_mesh)
    cbm.free()
    c_obj = bpy.data.objects.new("Spectator_Cheering", c_mesh)
    c_obj.data.materials.append(mat_pants)    # 0
    c_obj.data.materials.append(mat_jersey)   # 1
    c_obj.data.materials.append(mat_skin)     # 2
    c_obj.data.materials.append(mat_pants)    # 3 (unused placeholder)
    c_obj.data.materials.append(mat_cap)      # 4 (baseball cap)
    link_to_scene(c_obj)
    apply_all_transforms(c_obj)

    # 3. Spectator_FlagWaver (Clean human proportions + wide-brim sun-hat + flagpole + subdivided 3D team flag)
    fbm = _build_humanoid_bmesh("FLAG_FAN", headwear="SUN_HAT")
    _add_subdivided_flag_banner(
        fbm, pole_base=(0.0, -0.34, 0.85), pole_len=2.85,
        cloth_w=2.25, cloth_h=1.28, cols=10, mat_pole=0, mat_cloth=3
    )
    add_box_uvs(fbm, scale_uv=0.6)
    col_f = fbm.loops.layers.color.new("Col")
    for f in fbm.faces:
        f.smooth = True
        is_flag = f.material_index == 3
        for lp in f.loops:
            co = lp.vert.co
            cloth_u = max(0.0, min(1.0, co.x / 2.25)) if is_flag else 0.0
            jump_w = max(0.0, min(1.0, co.z / 1.80))
            ao = 0.96 if is_flag else (0.78 + 0.18 * max(0.0, min(1.0, co.z / 1.65)))
            lp[col_f] = (cloth_u, jump_w, ao, 1.0)
    fw_mesh = bpy.data.meshes.new("Spectator_FlagWaver_Mesh")
    fbm.normal_update()
    fbm.to_mesh(fw_mesh)
    fbm.free()
    fw_obj = bpy.data.objects.new("Spectator_FlagWaver", fw_mesh)
    fw_obj.data.materials.append(mat_pants)       # 0 (trousers & pole)
    fw_obj.data.materials.append(mat_jersey)      # 1 (jersey)
    fw_obj.data.materials.append(mat_skin)        # 2 (head, neck, forearms)
    fw_obj.data.materials.append(mat_flag_cloth)  # 3 (`Crowd_Tintable_Flag` -> includes 'flag'!)
    fw_obj.data.materials.append(mat_sunhat)      # 4 (wide-brim sun-hat)
    link_to_scene(fw_obj)
    apply_all_transforms(fw_obj)

    # 4. Marshal_FlagWaver (Clean FIA Trackside Marshal + safety cap + acoustic ear-defenders + waving signal flag)
    mbm = _build_humanoid_bmesh("FLAG_MARSHAL", headwear="MARSHAL_CAP")
    _add_subdivided_flag_banner(
        mbm, pole_base=(0.0, -0.36, 0.90), pole_len=2.15,
        cloth_w=1.65, cloth_h=1.05, cols=9, mat_pole=0, mat_cloth=3
    )
    add_box_uvs(mbm, scale_uv=0.7)
    col_m = mbm.loops.layers.color.new("Col")
    for f in mbm.faces:
        f.smooth = True
        is_flag = f.material_index == 3
        for lp in f.loops:
            co = lp.vert.co
            cloth_u = max(0.0, min(1.0, co.x / 1.65)) if is_flag else 0.0
            ao = 0.96 if is_flag else (0.80 + 0.16 * max(0.0, min(1.0, co.z / 1.65)))
            lp[col_m] = (cloth_u, 0.25, ao, 1.0)
    m_mesh = bpy.data.meshes.new("Marshal_FlagWaver_Mesh")
    mbm.normal_update()
    mbm.to_mesh(m_mesh)
    mbm.free()
    m_obj = bpy.data.objects.new("Marshal_FlagWaver", m_mesh)
    m_obj.data.materials.append(mat_pants)         # 0 (boots, gloves, ear-defenders, pole)
    m_obj.data.materials.append(mat_marshal_suit)  # 1 (matte FIA safety orange Nomex coveralls)
    m_obj.data.materials.append(mat_skin)          # 2 (head & neck)
    m_obj.data.materials.append(mat_flag_cloth)    # 3 (`Crowd_Tintable_Flag` -> includes 'flag'!)
    m_obj.data.materials.append(mat_marshal_cap)   # 4 (matte FIA marshal cap)
    link_to_scene(m_obj)
    apply_all_transforms(m_obj)


# =============================================================================
# 7. SUITE 5: track_ribbon_sample.glb (3D Banked Circuit Ribbon + Sawtooth Curbs)
# =============================================================================
def _catmull_rom_point(p0, p1, p2, p3, t):
    t2 = t * t
    t3 = t2 * t
    return 0.5 * (
        (2.0 * p1)
        + (-p0 + p2) * t
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
    )


def sample_circuit_spline(ctrl_pts, num_samples=360):
    n = len(ctrl_pts)
    pos_list = [Vector((p[0], p[1], p[2])) for p in ctrl_pts]
    bank_list = [math.radians(p[3]) for p in ctrl_pts]
    dense_pos, dense_bank = [], []
    sub = 12
    for i in range(n):
        p0, p1, p2, p3 = pos_list[(i - 1) % n], pos_list[i], pos_list[(i + 1) % n], pos_list[(i + 2) % n]
        b1, b2 = bank_list[i], bank_list[(i + 1) % n]
        for k in range(sub):
            u = k / float(sub)
            s_u = u * u * (3.0 - 2.0 * u)
            dense_pos.append(_catmull_rom_point(p0, p1, p2, p3, u))
            dense_bank.append(b1 + (b2 - b1) * s_u)

    total_m = len(dense_pos)
    cum = [0.0]
    for i in range(total_m):
        cum.append(cum[-1] + (dense_pos[(i + 1) % total_m] - dense_pos[i]).length)
    total_len = cum[-1]

    samples = []
    idx = 0
    up_world = Vector((0.0, 0.0, 1.0))
    for i in range(num_samples):
        target_d = (i / float(num_samples)) * total_len
        while idx < total_m - 1 and cum[idx + 1] < target_d:
            idx += 1
        seg_l = max(1e-6, cum[idx + 1] - cum[idx])
        f = (target_d - cum[idx]) / seg_l
        p_a, p_b = dense_pos[idx], dense_pos[(idx + 1) % total_m]
        pos = p_a.lerp(p_b, f)
        bank = dense_bank[idx] + (dense_bank[(idx + 1) % total_m] - dense_bank[idx]) * f
        s_norm = i / float(num_samples)
        if s_norm <= 0.12 or s_norm >= 0.94:
            pos.y = 0.0
            pos.z = 0.0
            bank = 0.0
        samples.append({"pos": pos, "s_m": target_d, "s_norm": s_norm, "bank": bank})

    for i in range(num_samples):
        prv = samples[(i - 2) % num_samples]["pos"]
        nxt = samples[(i + 2) % num_samples]["pos"]
        sn = samples[i]["s_norm"]
        tan = Vector((1.0, 0.0, 0.0)) if (sn <= 0.11 or sn >= 0.95) else (nxt - prv).normalized()
        right_flat = tan.cross(up_world).normalized()
        rot_bank = Matrix.Rotation(samples[i]["bank"], 4, tan)
        right = (rot_bank @ right_flat).normalized()
        normal = right.cross(tan).normalized()
        samples[i]["tan"] = tan
        samples[i]["right"] = right
        samples[i]["normal"] = normal
    for i in range(num_samples):
        t0 = samples[(i - 3) % num_samples]["tan"]
        t1 = samples[(i + 3) % num_samples]["tan"]
        samples[i]["curv"] = 0.0 if (samples[i]["s_norm"] <= 0.12 or samples[i]["s_norm"] >= 0.94) else (t1 - t0).dot(samples[i]["right"])
    return samples


def populate_track_ribbon_scene():
    alb_img, nrm_img = build_asphalt_textures(256)
    mat_asphalt = create_pbr_material(
        "Track_Asphalt_DarkBasalt_PBR", (1.0, 1.0, 1.0),
        roughness=0.86, metallic=0.04, clearcoat=0.0,
        albedo_img=alb_img, normal_img=nrm_img, normal_strength=1.35
    )
    mat_gravel = create_pbr_material("Track_Runoff_Gravel_PBR", (0.76, 0.68, 0.52), roughness=0.90)
    mat_grass = create_pbr_material("Track_Verge_Grass_PBR", (0.14, 0.42, 0.17), roughness=0.88)
    mat_curb_r = create_pbr_material("Track_Curb_FIARed", (0.78, 0.10, 0.11), roughness=0.58, metallic=0.0)
    mat_curb_w = create_pbr_material("Track_Curb_FIAWhite", (0.90, 0.91, 0.92), roughness=0.58, metallic=0.0)

    samples = sample_circuit_spline(FUJI_1982_CTRL_POINTS, num_samples=360)
    n = len(samples)

    # 1. Asphalt Ribbon (8 lateral slices, UVMap + UV2 racing groove + Col)
    bm = bmesh.new()
    uv1 = bm.loops.layers.uv.new("UVMap")
    uv2 = bm.loops.layers.uv.new("UV2")
    col = bm.loops.layers.color.new("Col")
    slices = 8
    rings = []
    for i in range(n):
        smp = samples[i]
        ideal = max(-0.55, min(0.55, -smp["curv"] * 2.2)) * ROAD_HALF_WIDTH
        row = []
        for j in range(slices + 1):
            u = j / float(slices)
            d = (u * 2.0 - 1.0) * ROAD_HALF_WIDTH
            crown = (1.0 - ((u * 2.0 - 1.0) ** 2)) * 0.035
            pt = smp["pos"] + smp["right"] * d + smp["normal"] * crown
            v = bm.verts.new(pt)
            groove = math.exp(-((d - ideal) ** 2) / 7.5)
            row.append((v, u, d, groove))
        rings.append(row)

    for i in range(n):
        i_nxt = (i + 1) % n
        v0 = samples[i]["s_m"] / 14.0
        v1 = (samples[i_nxt]["s_m"] if i_nxt > 0 else samples[i]["s_m"] + 8.0) / 14.0
        for j in range(slices):
            a0, u0, d0, g0 = rings[i][j]
            a1, u1, d1, g1 = rings[i][j + 1]
            b1, bu1, bd1, bg1 = rings[i_nxt][j + 1]
            b0, bu0, bd0, bg0 = rings[i_nxt][j]
            f = bm.faces.new((a0, a1, b1, b0))
            f.smooth = True
            meta = ((u0, v0, d0, g0), (u1, v0, d1, g1), (bu1, v1, bd1, bg1), (bu0, v1, bd0, bg0))
            for lp, (uu, vv, dd, gg) in zip(f.loops, meta):
                lp[uv1].uv = (uu, vv)
                lp[uv2].uv = (dd, gg)
                lp[col] = (1.0, gg, 0.0, 1.0)

    a_mesh = bpy.data.meshes.new("Track_Asphalt_Ribbon_Mesh")
    bm.normal_update()
    bm.to_mesh(a_mesh)
    bm.free()
    a_obj = bpy.data.objects.new("Track_Asphalt_Ribbon-col", a_mesh)
    a_obj.data.materials.append(mat_asphalt)
    a_obj["godot_group"] = "surface_asphalt"
    link_to_scene(a_obj)
    apply_all_transforms(a_obj)

    # 2. Left & Right 3D Sawtooth FIA Kerbs
    for side_sign, side_tag in ((-1.0, "L"), (1.0, "R")):
        cbm = bmesh.new()
        for i in range(n):
            smp = samples[i]
            nxt = samples[(i + 1) % n]
            if abs(smp["curv"]) < 0.015 and not (smp["s_norm"] <= 0.11 or smp["s_norm"] >= 0.95):
                continue
            d_in = side_sign * ROAD_HALF_WIDTH
            d_out = side_sign * (ROAD_HALF_WIDTH + CURB_WIDTH)
            tooth = 0.085 if (i % 2 == 0) else 0.032
            v_a0 = cbm.verts.new(smp["pos"] + smp["right"] * d_in + smp["normal"] * 0.024)
            v_a1 = cbm.verts.new(smp["pos"] + smp["right"] * d_out + smp["normal"] * tooth)
            v_b1 = cbm.verts.new(nxt["pos"] + nxt["right"] * d_out + nxt["normal"] * (tooth * 0.55))
            v_b0 = cbm.verts.new(nxt["pos"] + nxt["right"] * d_in + nxt["normal"] * 0.024)
            verts = (v_a0, v_a1, v_b1, v_b0) if side_sign > 0 else (v_a1, v_a0, v_b0, v_b1)
            f = cbm.faces.new(verts)
            f.material_index = (i // 2) % 2
        add_box_uvs(cbm, scale_uv=0.6)
        cm = bpy.data.meshes.new(f"Track_Curb_Sawtooth_{side_tag}_Mesh")
        cbm.normal_update()
        cbm.to_mesh(cm)
        cbm.free()
        co = bpy.data.objects.new(f"Track_Curb_Sawtooth_{side_tag}-col", cm)
        co.data.materials.append(mat_curb_r)
        co.data.materials.append(mat_curb_w)
        co["godot_group"] = "surface_curb"
        link_to_scene(co)
        apply_all_transforms(co)

    # 3. Runoff Gravel & Grass Verges
    for name_s, r_in, r_out, z_off, mat_s, grp in (
        ("Track_Runoff_Gravel-col", ROAD_HALF_WIDTH, ROAD_HALF_WIDTH + RUNOFF_EXTRA_WIDTH, -0.02, mat_gravel, "surface_gravel"),
        ("Track_Verge_Grass-col", ROAD_HALF_WIDTH + RUNOFF_EXTRA_WIDTH, ROAD_HALF_WIDTH + RUNOFF_EXTRA_WIDTH + 22.0, -0.06, mat_grass, "surface_grass"),
    ):
        sbm = bmesh.new()
        for side in (-1.0, 1.0):
            ring = []
            for i in range(n):
                smp = samples[i]
                vi = sbm.verts.new(smp["pos"] + smp["right"] * (side * r_in) + smp["normal"] * z_off)
                vo = sbm.verts.new(smp["pos"] + smp["right"] * (side * r_out) + smp["normal"] * (z_off - 0.04))
                ring.append((vi, vo))
            for i in range(n):
                inxt = (i + 1) % n
                vi0, vo0 = ring[i]
                vi1, vo1 = ring[inxt]
                f = sbm.faces.new((vi0, vo0, vo1, vi1) if side > 0 else (vo0, vi0, vi1, vo1))
                f.smooth = True
        add_box_uvs(sbm, scale_uv=0.12)
        sm = bpy.data.meshes.new(f"{name_s}_Mesh")
        sbm.normal_update()
        sbm.to_mesh(sm)
        sbm.free()
        so = bpy.data.objects.new(name_s, sm)
        so.data.materials.append(mat_s)
        so["godot_group"] = grp
        link_to_scene(so)
        apply_all_transforms(so)


# =============================================================================
# 8. MAIN HEADLESS BLENDER 5.3 EXECUTION
# =============================================================================
def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    webgl_models_dir = os.path.join(repo_root, "assets", "models")
    godot_models_dir = os.path.join(repo_root, "godot_project", "assets", "models")
    godot_assets_dir = os.path.join(repo_root, "godot_project", "assets")
    os.makedirs(webgl_models_dir, exist_ok=True)
    os.makedirs(godot_models_dir, exist_ok=True)
    os.makedirs(godot_assets_dir, exist_ok=True)
    both_dirs = [webgl_models_dir, godot_models_dir]

    print("[1/6] Building env_trees_biome.glb ...")
    reset_scene()
    populate_trees_biome_scene()
    export_glb_to_both_engines("env_trees_biome.glb", both_dirs)

    print("[2/6] Building env_signs_gantries_billboards.glb ...")
    reset_scene()
    populate_signs_gantries_billboards_scene()
    export_glb_to_both_engines("env_signs_gantries_billboards.glb", both_dirs)

    print("[3/6] Building env_barriers_fencing.glb ...")
    reset_scene()
    populate_barriers_fencing_scene()
    export_glb_to_both_engines("env_barriers_fencing.glb", both_dirs)

    print("[4/6] Building env_grandstands_crowds.glb ...")
    reset_scene()
    populate_grandstands_crowds_scene()
    export_glb_to_both_engines("env_grandstands_crowds.glb", both_dirs)

    print("[5/6] Building track_ribbon_sample.glb ...")
    reset_scene()
    populate_track_ribbon_scene()
    export_glb_to_both_engines("track_ribbon_sample.glb", both_dirs)

    print("[6/6] Building combined godot_project/assets/track_environment_suite.glb ...")
    reset_scene()
    populate_track_ribbon_scene()
    populate_trees_biome_scene()
    populate_signs_gantries_billboards_scene()
    populate_barriers_fencing_scene()
    populate_grandstands_crowds_scene()
    export_glb_to_both_engines("track_environment_suite.glb", [godot_assets_dir])

    print("SUCCESS: All 5 modular .glb suites + track_environment_suite.glb exported cleanly!")


if __name__ == "__main__":
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    log_path = os.path.join(repo_root, "godot_project", "assets", "build_track_env.log")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    try:
        main()
        with open(log_path, "w", encoding="utf-8") as lf:
            lf.write("SUCCESS: ALL 5 MODULAR .GLB SUITES + track_environment_suite.glb EXPORTED CLEANLY!\n")
    except Exception:
        with open(log_path, "w", encoding="utf-8") as lf:
            lf.write(traceback.format_exc())
        traceback.print_exc()
        sys.exit(1)
