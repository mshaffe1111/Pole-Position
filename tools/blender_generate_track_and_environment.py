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


def build_bark_and_foliage_textures(size=128):
    bark = [0.0] * (size * size * 4)
    leaf = [0.0] * (size * size * 4)
    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            fissure = math.sin(x * 0.42 + _hash2d(x >> 2, y >> 3, 9) * 3.0) * 0.5 + 0.5
            grain = _hash2d(x, y >> 2, 31)
            lum = 0.16 + fissure * 0.14 + (grain - 0.5) * 0.06
            bark[idx] = lum * 1.28
            bark[idx + 1] = lum * 0.92
            bark[idx + 2] = lum * 0.64
            bark[idx + 3] = 1.0

            # Neutral-bright sunlit botanical leaf cluster pattern (tints cleanly via material or instanceColor!)
            cell_u = ((x % 16) - 7.5) / 8.0
            cell_v = ((y % 16) - 7.5) / 8.0
            leaf_d = math.sqrt(cell_u * cell_u + cell_v * cell_v)
            vein = 0.06 if abs(cell_u) < 0.14 and cell_v < 0.7 else 0.0
            l_val = 0.76 + max(0.0, 0.22 - leaf_d * 0.20) + (_hash2d(x >> 1, y >> 1, 77) - 0.5) * 0.12 + vein
            l_val = max(0.54, min(1.0, l_val))
            leaf[idx] = l_val
            leaf[idx + 1] = min(1.0, l_val * 1.03)
            leaf[idx + 2] = l_val * 0.96
            leaf[idx + 3] = 1.0

    return (
        _make_packed_image("Tex_Tree_Bark", size, size, bark, is_data=False),
        _make_packed_image("Tex_Foliage_Cluster", size, size, leaf, is_data=False),
    )


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
# 3. SUITE 1: env_trees_biome.glb (LOD0 / LOD1 / LOD2 Sapling Trees + Outward Normals)
# =============================================================================
def _finalize_tree_mesh(mesh, crown_center_z, max_height, max_radius):
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    crown_c = Vector((0.0, 0.0, crown_center_z))
    custom_normals = []
    for v in mesh.vertices:
        if v.co.z > crown_center_z * 0.56:
            out_n = (v.co - crown_c).normalized()
            blended = (v.normal * 0.22 + out_n * 0.78).normalized()
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
            ao_b = max(0.42, min(1.0, 0.48 + 0.52 * (dist_c / max_radius))) if is_canopy else 0.82
            phase_a = ((math.atan2(co.y, co.x) + math.pi) / (2.0 * math.pi))
            lp[col_layer] = (sway_r, flutter_g, ao_b, phase_a)


def populate_trees_biome_scene():
    bark_img, leaf_img = build_bark_and_foliage_textures(128)
    mat_bark = create_pbr_material("Tree_Bark_PBR", (1.0, 1.0, 1.0), roughness=0.88, albedo_img=bark_img)
    mat_decid = create_pbr_material("Tree_Foliage_Deciduous_PBR", (1.0, 1.0, 1.0), roughness=0.72, albedo_img=leaf_img)
    mat_pine = create_pbr_material("Tree_Foliage_Pine_PBR", (0.86, 0.96, 0.88), roughness=0.76, albedo_img=leaf_img)
    mat_palm = create_pbr_material("Tree_Foliage_Palm_PBR", (0.90, 0.98, 0.88), roughness=0.66, albedo_img=leaf_img)

    lod_specs = [
        ("LOD0", 2, 10),
        ("LOD1", 1, 7),
        ("LOD2", 1, 5),
    ]

    for lod_tag, ico_sub, rad_seg in lod_specs:
        # 1. Broadleaf / Sakura / Autumn Maple Sapling Tree (Flared Buttress + Primary/Secondary Limbs + 8 Boughs)
        bm = bmesh.new()
        bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=True, segments=rad_seg,
            radius1=0.62, radius2=0.44, depth=1.0,
            matrix=Matrix.Translation((0.0, 0.0, 0.50))
        )
        bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=True, segments=rad_seg,
            radius1=0.45, radius2=0.26, depth=3.4,
            matrix=Matrix.Translation((0.0, 0.0, 2.55))
        )
        limbs = [
            ((-0.68,  0.22, 4.05), ( 0.20, -0.58, 0.0), 0.24, 0.11, 2.45),
            (( 0.66, -0.20, 4.15), (-0.22,  0.56, 0.0), 0.23, 0.11, 2.35),
            (( 0.08,  0.64, 4.20), ( 0.56,  0.05, 0.0), 0.21, 0.10, 2.25),
            ((-0.12, -0.60, 4.35), (-0.52, -0.08, 0.0), 0.20, 0.10, 2.15),
        ]
        for l_pos, l_rot, r1, r2, dp in limbs:
            m_l = Matrix.Translation(l_pos) @ Euler(l_rot).to_matrix().to_4x4()
            bmesh.ops.create_cone(
                bm, cap_ends=True, cap_tris=True, segments=max(5, rad_seg - 2),
                radius1=r1, radius2=r2, depth=dp, matrix=m_l
            )
        for f in bm.faces:
            f.material_index = 0

        boughs = [
            ((-1.85,  0.48, 5.05), (1.28, 1.18, 0.76), 2.35),
            (( 1.88, -0.42, 5.18), (1.24, 1.18, 0.74), 2.30),
            (( 0.18,  1.78, 5.12), (1.18, 1.26, 0.76), 2.22),
            ((-0.26, -1.68, 5.45), (1.20, 1.16, 0.78), 2.18),
            ((-1.05, -1.05, 6.05), (1.12, 1.12, 0.78), 2.05),
            (( 1.10,  1.02, 6.12), (1.14, 1.10, 0.78), 2.05),
            (( 0.05,  0.04, 6.85), (1.26, 1.24, 0.86), 2.55),
        ]
        if lod_tag == "LOD2":
            boughs = boughs[:4] + [boughs[-1]]
        for b_pos, b_scl, b_rad in boughs:
            prev = set(bm.faces)
            m_b = Matrix.Translation(b_pos) @ Matrix.Diagonal((b_scl[0], b_scl[1], b_scl[2], 1.0))
            bmesh.ops.create_icosphere(bm, subdivisions=ico_sub, radius=b_rad, matrix=m_b)
            for f in bm.faces:
                if f not in prev:
                    f.material_index = 1

        _paint_tree_wind_colors_and_uvs(bm, crown_center_z=5.7, max_height=9.2, max_radius=4.5)
        dec_mesh = bpy.data.meshes.new(f"Tree_Deciduous_{lod_tag}_Mesh")
        bm.to_mesh(dec_mesh)
        bm.free()
        _finalize_tree_mesh(dec_mesh, crown_center_z=5.7, max_height=9.2, max_radius=4.5)

        dec_obj = bpy.data.objects.new(f"Tree_Deciduous_{lod_tag}", dec_mesh)
        dec_obj.data.materials.append(mat_bark)
        dec_obj.data.materials.append(mat_decid)
        link_to_scene(dec_obj)
        apply_all_transforms(dec_obj)

        # 2. 5-Tiered Alpine Japanese Cedar / Scots Pine
        pbm = bmesh.new()
        bmesh.ops.create_cone(
            pbm, cap_ends=True, cap_tris=True, segments=rad_seg,
            radius1=0.48, radius2=0.18, depth=5.2,
            matrix=Matrix.Translation((0.0, 0.0, 2.6))
        )
        for f in pbm.faces:
            f.material_index = 0

        tiers = [
            (4.15, 3.45, 3.2),
            (6.05, 2.95, 3.1),
            (7.85, 2.40, 3.0),
            (9.55, 1.80, 2.8),
            (11.10, 1.15, 2.6),
        ]
        if lod_tag == "LOD2":
            tiers = [(4.6, 3.4, 4.2), (7.6, 2.5, 4.0), (10.4, 1.5, 3.5)]
        for tz, rb, th in tiers:
            prev = set(pbm.faces)
            bmesh.ops.create_cone(
                pbm, cap_ends=True, cap_tris=True, segments=rad_seg + 3,
                radius1=rb, radius2=0.08, depth=th,
                matrix=Matrix.Translation((0.0, 0.0, tz))
            )
            for f in pbm.faces:
                if f not in prev:
                    f.material_index = 1

        _paint_tree_wind_colors_and_uvs(pbm, crown_center_z=7.2, max_height=12.5, max_radius=3.6)
        pine_mesh = bpy.data.meshes.new(f"Tree_Pine_{lod_tag}_Mesh")
        pbm.to_mesh(pine_mesh)
        pbm.free()
        _finalize_tree_mesh(pine_mesh, crown_center_z=7.2, max_height=12.5, max_radius=3.6)

        pine_obj = bpy.data.objects.new(f"Tree_Pine_{lod_tag}", pine_mesh)
        pine_obj.data.materials.append(mat_bark)
        pine_obj.data.materials.append(mat_pine)
        link_to_scene(pine_obj)
        apply_all_transforms(pine_obj)

        # 3. Curved 4-Segment Riviera / Vegas Palm Tree with 9 Arched Pinnate Fronds
        lbm = bmesh.new()
        palm_segs = [
            ((0.05, 0.0, 1.35), (0.0, 0.03, 0.0), 0.44, 0.36, 2.75),
            ((0.20, 0.0, 3.95), (0.0, 0.07, 0.0), 0.36, 0.29, 2.75),
            ((0.46, 0.0, 6.50), (0.0, 0.11, 0.0), 0.29, 0.23, 2.65),
            ((0.80, 0.0, 8.92), (0.0, 0.15, 0.0), 0.23, 0.18, 2.45),
        ]
        for s_pos, s_rot, r1, r2, dp in palm_segs:
            m_s = Matrix.Translation(s_pos) @ Euler(s_rot).to_matrix().to_4x4()
            bmesh.ops.create_cone(
                lbm, cap_ends=True, cap_tris=True, segments=rad_seg,
                radius1=r1, radius2=r2, depth=dp, matrix=m_s
            )
        # Crown heart
        bmesh.ops.create_icosphere(
            lbm, subdivisions=1, radius=0.52,
            matrix=Matrix.Translation((0.98, 0.0, 10.05))
        )
        for f in lbm.faces:
            f.material_index = 0

        frond_n = 9 if lod_tag == "LOD0" else (7 if lod_tag == "LOD1" else 5)
        for fi in range(frond_n):
            az = (math.pi * 2.0 * fi) / frond_n + (fi % 2) * 0.08
            tilt_up = 0.24 if fi % 2 == 0 else 0.06
            prev = set(lbm.faces)
            # Inner ascending petiole blade
            m_in = (
                Matrix.Translation((0.98, 0.0, 10.12))
                @ Matrix.Rotation(az, 4, "Z")
                @ Matrix.Translation((1.25, 0.0, 0.32 + tilt_up))
                @ Euler((0.0, -0.26, 0.0)).to_matrix().to_4x4()
                @ Matrix.Diagonal((2.45, 0.68, 0.10, 1.0))
            )
            bmesh.ops.create_cube(lbm, size=1.0, matrix=m_in)
            # Outer gracefully drooping frond tip
            m_out = (
                Matrix.Translation((0.98, 0.0, 10.12))
                @ Matrix.Rotation(az, 4, "Z")
                @ Matrix.Translation((3.35, 0.0, -0.06 + tilt_up))
                @ Euler((0.0, 0.42, 0.0)).to_matrix().to_4x4()
                @ Matrix.Diagonal((2.15, 0.52, 0.08, 1.0))
            )
            bmesh.ops.create_cube(lbm, size=1.0, matrix=m_out)
            for f in lbm.faces:
                if f not in prev:
                    f.material_index = 1

        _paint_tree_wind_colors_and_uvs(lbm, crown_center_z=9.8, max_height=11.0, max_radius=4.6)
        palm_mesh = bpy.data.meshes.new(f"Tree_Palm_{lod_tag}_Mesh")
        lbm.to_mesh(palm_mesh)
        lbm.free()
        _finalize_tree_mesh(palm_mesh, crown_center_z=9.8, max_height=11.0, max_radius=4.6)

        palm_obj = bpy.data.objects.new(f"Tree_Palm_{lod_tag}", palm_mesh)
        palm_obj.data.materials.append(mat_bark)
        palm_obj.data.materials.append(mat_palm)
        link_to_scene(palm_obj)
        apply_all_transforms(palm_obj)


# =============================================================================
# 4. SUITE 2: env_signs_gantries_billboards.glb
# =============================================================================
def populate_signs_gantries_billboards_scene():
    mat_dark = create_pbr_material("Sign_Dark_Steel", (0.10, 0.13, 0.18), roughness=0.32, metallic=0.78)
    mat_truss = create_pbr_material("Gantry_SpaceFrame_Steel", (0.85, 0.89, 0.94), roughness=0.24, metallic=0.82)
    mat_conc = create_pbr_material("Gantry_Concrete_Plinth", (0.72, 0.76, 0.82), roughness=0.74, metallic=0.05)
    mat_flood = create_pbr_material(
        "Sign_Floodlight_LED", (1.0, 0.98, 0.90), roughness=0.15,
        emission_color=(1.0, 0.96, 0.84), emission_strength=3.2
    )
    mat_banner = create_pbr_material("Sponsor_Face_Default", (0.96, 0.98, 1.0), roughness=0.28, metallic=0.10)
    mat_red_off = create_pbr_material(
        "StartLight_Red_Lens", (0.85, 0.08, 0.10), roughness=0.18,
        emission_color=(1.0, 0.10, 0.12), emission_strength=1.8
    )
    mat_grn_off = create_pbr_material(
        "StartLight_Green_Lens", (0.06, 0.32, 0.14), roughness=0.22,
        emission_color=(0.05, 0.95, 0.38), emission_strength=0.35
    )

    # 1. FIA Braking Marker Boards (300m, 200m, 150m, 100m, 50m) — ALL centered at (0,0,0)!
    brake_colors = {
        300: (0.04, 0.42, 0.20),
        200: (0.04, 0.36, 0.18),
        150: (0.04, 0.38, 0.19),
        100: (0.05, 0.30, 0.15),
        50:  (0.76, 0.10, 0.12),
    }
    for dist_m, face_col in brake_colors.items():
        mat_face = create_pbr_material(f"BrakeBoard_Face_{dist_m}m", face_col, roughness=0.24, metallic=0.08)
        bm = bmesh.new()
        # Twin breakaway posts + frangible base shoes + rear stiffener bars
        for x_leg in (-0.68, 0.68):
            bmesh.ops.create_cube(
                bm, size=1.0,
                matrix=Matrix.Translation((x_leg, 0.06, 0.12)) @ Matrix.Diagonal((0.34, 0.40, 0.24, 1.0))
            )
            bmesh.ops.create_cone(
                bm, cap_ends=True, cap_tris=True, segments=8,
                radius1=0.068, radius2=0.058, depth=2.10,
                matrix=Matrix.Translation((x_leg, 0.12, 1.05))
            )
        for z_bar in (1.15, 2.05):
            bmesh.ops.create_cube(
                bm, size=1.0,
                matrix=Matrix.Translation((0.0, 0.11, z_bar)) @ Matrix.Diagonal((1.86, 0.08, 0.08, 1.0))
            )
        # Beveled outer sign cabinet frame + top floodlight cantilever arm
        bmesh.ops.create_cube(
            bm, size=1.0,
            matrix=Matrix.Translation((0.0, 0.02, 1.66)) @ Matrix.Diagonal((2.28, 0.14, 1.62, 1.0))
        )
        bmesh.ops.create_cube(
            bm, size=1.0,
            matrix=Matrix.Translation((0.0, -0.18, 2.52)) @ Matrix.Diagonal((2.06, 0.44, 0.09, 1.0))
        )
        add_box_uvs(bm, scale_uv=0.5)
        for f in bm.faces:
            f.material_index = 0

        # Planar-UV Sign Face Panel (front & rear faces cleanly mapped [0..1]!)
        f_bm = bmesh.new()
        bmesh.ops.create_cube(
            f_bm, size=1.0,
            matrix=Matrix.Translation((0.0, 0.0, 1.66)) @ Matrix.Diagonal((2.16, 0.20, 1.50, 1.0))
        )
        add_planar_sign_uvs(f_bm, -1.08, 1.08, 0.91, 2.41)
        for f in f_bm.faces:
            f.material_index = 1

        # Emissive LED Floodlight Strip under hood
        l_bm = bmesh.new()
        bmesh.ops.create_cube(
            l_bm, size=1.0,
            matrix=Matrix.Translation((0.0, -0.26, 2.46)) @ Matrix.Diagonal((1.92, 0.18, 0.05, 1.0))
        )
        add_box_uvs(l_bm, scale_uv=1.0)
        for f in l_bm.faces:
            f.material_index = 2

        mesh = bpy.data.meshes.new(f"BrakeBoard_{dist_m}m_Mesh")
        for sub in (f_bm, l_bm):
            tmp = bpy.data.meshes.new("_tmp")
            sub.to_mesh(tmp)
            sub.free()
            bm.from_mesh(tmp)
            bpy.data.meshes.remove(tmp)
        bm.normal_update()
        bm.to_mesh(mesh)
        bm.free()

        obj = bpy.data.objects.new(f"BrakeBoard_{dist_m}m-convcolonly", mesh)
        obj.data.materials.append(mat_dark)
        obj.data.materials.append(mat_face)
        obj.data.materials.append(mat_flood)
        link_to_scene(obj)
        apply_all_transforms(obj)

    # 2. Heavy-Duty Trackside Sponsor Billboard Rig (Centered at (0,0,0), Planar Sign Face!)
    bbm = bmesh.new()
    for x_p in (-2.75, 0.0, 2.75):
        bmesh.ops.create_cube(
            bbm, size=1.0,
            matrix=Matrix.Translation((x_p, 0.36, 0.18)) @ Matrix.Diagonal((0.62, 0.85, 0.36, 1.0))
        )
        bmesh.ops.create_cone(
            bbm, cap_ends=True, cap_tris=True, segments=8,
            radius1=0.095, radius2=0.085, depth=3.45,
            matrix=Matrix.Translation((x_p, 0.24, 1.72))
        )
        m_diag = Matrix.Translation((x_p, 0.82, 1.22)) @ Euler((-0.48, 0.0, 0.0)).to_matrix().to_4x4()
        bmesh.ops.create_cone(
            bbm, cap_ends=True, cap_tris=True, segments=6,
            radius1=0.068, radius2=0.06, depth=2.55, matrix=m_diag
        )
    # Rear catwalk grating & outer sign frame
    bmesh.ops.create_cube(
        bbm, size=1.0,
        matrix=Matrix.Translation((0.0, 0.45, 0.85)) @ Matrix.Diagonal((7.40, 0.48, 0.08, 1.0))
    )
    bmesh.ops.create_cube(
        bbm, size=1.0,
        matrix=Matrix.Translation((0.0, 0.04, 2.14)) @ Matrix.Diagonal((7.84, 0.22, 2.78, 1.0))
    )
    # 3 Top floodlight arms
    for x_fl in (-2.4, 0.0, 2.4):
        bmesh.ops.create_cube(
            bbm, size=1.0,
            matrix=Matrix.Translation((x_fl, -0.28, 3.58)) @ Matrix.Diagonal((0.14, 0.68, 0.08, 1.0))
        )
    add_box_uvs(bbm, scale_uv=0.4)
    for f in bbm.faces:
        f.material_index = 0

    bf_bm = bmesh.new()
    bmesh.ops.create_cube(
        bf_bm, size=1.0,
        matrix=Matrix.Translation((0.0, 0.0, 2.14)) @ Matrix.Diagonal((7.64, 0.30, 2.62, 1.0))
    )
    add_planar_sign_uvs(bf_bm, -3.82, 3.82, 0.83, 3.45)
    for f in bf_bm.faces:
        f.material_index = 1

    bl_bm = bmesh.new()
    bmesh.ops.create_cube(
        bl_bm, size=1.0,
        matrix=Matrix.Translation((0.0, -0.48, 3.56)) @ Matrix.Diagonal((7.10, 0.28, 0.12, 1.0))
    )
    add_box_uvs(bl_bm, scale_uv=1.0)
    for f in bl_bm.faces:
        f.material_index = 2

    bb_mesh = bpy.data.meshes.new("Sponsor_Billboard_Rig_Mesh")
    for sub in (bf_bm, bl_bm):
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
    bb_obj.data.materials.append(mat_flood)
    link_to_scene(bb_obj)
    apply_all_transforms(bb_obj)

    # 3. Overhead Space-Frame Start/Finish Gantry + 5 Detailed 3D Start Light Pods
    span_x = ROAD_HALF_WIDTH + 4.3
    gbm = bmesh.new()
    for side in (-1.0, 1.0):
        bmesh.ops.create_cube(
            gbm, size=1.0,
            matrix=Matrix.Translation((side * span_x, 0.0, 0.44)) @ Matrix.Diagonal((2.2, 2.2, 0.88, 1.0))
        )
        for dx in (-0.54, 0.54):
            for dy in (-0.68, 0.68):
                bmesh.ops.create_cone(
                    gbm, cap_ends=True, cap_tris=True, segments=10,
                    radius1=0.17, radius2=0.14, depth=10.0,
                    matrix=Matrix.Translation((side * span_x + dx, dy, 5.0))
                )
        for z_r in (1.8, 3.6, 5.4, 7.2, 9.0):
            bmesh.ops.create_cube(
                gbm, size=1.0,
                matrix=Matrix.Translation((side * span_x, 0.0, z_r)) @ Matrix.Diagonal((1.22, 1.50, 0.14, 1.0))
            )
            # Diagonal Warren brace
            m_br = Matrix.Translation((side * span_x, 0.0, z_r - 0.85)) @ Euler((0.68, 0.0, 0.0)).to_matrix().to_4x4()
            bmesh.ops.create_cone(
                gbm, cap_ends=True, cap_tris=True, segments=6,
                radius1=0.06, radius2=0.06, depth=2.1, matrix=m_br
            )

    # Overhead horizontal space-frame chords & diagonal cross-webs
    for z_b in (7.30, 9.72):
        for dy in (-0.58, 0.58):
            m_b = Matrix.Translation((0.0, dy, z_b)) @ Matrix.Rotation(math.pi * 0.5, 4, "Y")
            bmesh.ops.create_cone(
                gbm, cap_ends=True, cap_tris=True, segments=10,
                radius1=0.15, radius2=0.15, depth=span_x * 2.08, matrix=m_b
            )
    for kx in range(-6, 7):
        cx = kx * 2.0
        m_w = Matrix.Translation((cx, -0.58, 8.51)) @ Euler((0.0, 0.55 if kx % 2 == 0 else -0.55, 0.0)).to_matrix().to_4x4()
        bmesh.ops.create_cone(
            gbm, cap_ends=True, cap_tris=True, segments=6,
            radius1=0.055, radius2=0.055, depth=2.85, matrix=m_w
        )
    add_box_uvs(gbm, scale_uv=0.35)
    for f in gbm.faces:
        f.material_index = 0

    gf_bm = bmesh.new()
    bmesh.ops.create_cube(
        gf_bm, size=1.0,
        matrix=Matrix.Translation((0.0, 0.0, 8.52)) @ Matrix.Diagonal((span_x * 1.90, 1.10, 2.22, 1.0))
    )
    add_planar_sign_uvs(gf_bm, -span_x * 0.95, span_x * 0.95, 7.41, 9.63)
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

    for i in range(5):
        x_off = (i - 2) * 1.78
        lbm = bmesh.new()
        bmesh.ops.create_cube(
            lbm, size=1.0,
            matrix=Matrix.Translation((x_off, -0.74, 6.32)) @ Matrix.Diagonal((0.92, 0.58, 1.72, 1.0))
        )
        for z_vis in (7.10, 6.40):
            bmesh.ops.create_cube(
                lbm, size=1.0,
                matrix=Matrix.Translation((x_off, -1.12, z_vis)) @ Matrix.Diagonal((0.98, 0.42, 0.10, 1.0))
            )
        add_box_uvs(lbm, scale_uv=0.8)
        for f in lbm.faces:
            f.material_index = 0

        for idx_l, z_l in enumerate((6.70, 5.96)):
            prev = set(lbm.faces)
            bmesh.ops.create_icosphere(
                lbm, subdivisions=2, radius=0.26,
                matrix=Matrix.Translation((x_off, -1.02, z_l)) @ Matrix.Diagonal((1.0, 0.52, 1.0, 1.0))
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
def populate_barriers_fencing_scene():
    mat_armco = create_pbr_material("Barrier_Armco_Galvanized", (0.78, 0.83, 0.89), roughness=0.28, metallic=0.82)
    mat_post = create_pbr_material("Barrier_Post_DarkSteel", (0.16, 0.20, 0.26), roughness=0.36, metallic=0.76)
    mat_foam = create_pbr_material("Barrier_SAFER_BlueFoam", (0.06, 0.46, 0.88), roughness=0.62, metallic=0.05)
    mat_tire_r = create_pbr_material("Barrier_Tire_FIARed", (0.84, 0.10, 0.13), roughness=0.68, metallic=0.04)
    mat_tire_w = create_pbr_material("Barrier_Tire_FIAWhite", (0.94, 0.96, 0.99), roughness=0.68, metallic=0.04)
    mat_rubber = create_pbr_material("Barrier_Conveyor_Rubber", (0.09, 0.10, 0.12), roughness=0.82, metallic=0.06)
    mat_fence = create_pbr_material("Barrier_CatchFence_Wire", (0.76, 0.82, 0.90), roughness=0.35, metallic=0.72, alpha=0.38)

    # 1. Corrugated 3-Wave Armco W-Beam + Rear Steel I-Posts
    abm = bmesh.new()
    for z_w, y_w in ((0.28, -0.04), (0.44, 0.03), (0.60, -0.05), (0.76, 0.03), (0.92, -0.04)):
        bmesh.ops.create_cube(
            abm, size=1.0,
            matrix=Matrix.Translation((0.0, y_w, z_w)) @ Matrix.Diagonal((4.52, 0.10, 0.16, 1.0))
        )
    add_box_uvs(abm, scale_uv=0.5)
    for f in abm.faces:
        f.material_index = 0

    p_bm = bmesh.new()
    for x_p in (-1.85, 0.0, 1.85):
        bmesh.ops.create_cube(
            p_bm, size=1.0,
            matrix=Matrix.Translation((x_p, 0.16, 0.54)) @ Matrix.Diagonal((0.15, 0.20, 1.08, 1.0))
        )
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

    # 2. SAFER Barrier (Steel Impact Tubes + Closed-Cell Blue Polystyrene Absorber Blocks)
    sbm = bmesh.new()
    for z_tube in (0.22, 0.56, 0.90):
        bmesh.ops.create_cube(
            sbm, size=1.0,
            matrix=Matrix.Translation((0.0, 0.0, z_tube)) @ Matrix.Diagonal((6.0, 0.18, 0.28, 1.0))
        )
    add_box_uvs(sbm, scale_uv=0.4)
    for f in sbm.faces:
        f.material_index = 0

    fbm_foam = bmesh.new()
    for x_pad in (-2.25, -0.75, 0.75, 2.25):
        bmesh.ops.create_cube(
            fbm_foam, size=1.0,
            matrix=Matrix.Translation((x_pad, 0.26, 0.56)) @ Matrix.Diagonal((0.72, 0.34, 0.96, 1.0))
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

    # 3. Bolted 3-High x 4-Wide FIA Tire Wall + Conveyor Belt Impact Strap
    tbm = bmesh.new()
    for col_i, x_t in enumerate((-1.68, -0.56, 0.56, 1.68)):
        for row_j, z_t in enumerate((0.18, 0.54, 0.90)):
            prev = set(tbm.faces)
            bmesh.ops.create_cone(
                tbm, cap_ends=True, cap_tris=True, segments=14,
                radius1=0.54, radius2=0.54, depth=0.33,
                matrix=Matrix.Translation((x_t, 0.0, z_t))
            )
            mat_i = (col_i + row_j) % 2
            for f in tbm.faces:
                if f not in prev:
                    f.material_index = mat_i
    # Front bolted rubber conveyor belt face strap
    prev = set(tbm.faces)
    bmesh.ops.create_cube(
        tbm, size=1.0,
        matrix=Matrix.Translation((0.0, -0.54, 0.54)) @ Matrix.Diagonal((4.48, 0.06, 0.78, 1.0))
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

    # 4. FIA Grade-1 Curved Debris Catch Fence (Stanchions + Horizontal Cables + Wire Screen)
    cbm = bmesh.new()
    for x_p in (-5.8, 0.0, 5.8):
        bmesh.ops.create_cone(
            cbm, cap_ends=True, cap_tris=True, segments=8,
            radius1=0.075, radius2=0.065, depth=3.6,
            matrix=Matrix.Translation((x_p, 0.0, 1.8))
        )
        m_over = Matrix.Translation((x_p, -0.32, 3.98)) @ Euler((0.54, 0.0, 0.0)).to_matrix().to_4x4()
        bmesh.ops.create_cone(
            cbm, cap_ends=True, cap_tris=True, segments=6,
            radius1=0.06, radius2=0.05, depth=1.15, matrix=m_over
        )
    for z_cab in (1.2, 2.0, 2.8, 3.55):
        m_c = Matrix.Translation((0.0, -0.04, z_cab)) @ Matrix.Rotation(math.pi * 0.5, 4, "Y")
        bmesh.ops.create_cone(
            cbm, cap_ends=True, cap_tris=True, segments=6,
            radius1=0.022, radius2=0.022, depth=12.4, matrix=m_c
        )
    add_box_uvs(cbm, scale_uv=0.4)
    for f in cbm.faces:
        f.material_index = 0

    w_bm = bmesh.new()
    bmesh.ops.create_cube(
        w_bm, size=1.0,
        matrix=Matrix.Translation((0.0, -0.02, 2.25)) @ Matrix.Diagonal((12.4, 0.02, 3.10, 1.0))
    )
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
def _build_humanoid_bmesh(arm_pose="CHEER"):
    bm = bmesh.new()
    # Shoes & Legs (material 0 = dark trousers/boots)
    for sx in (-0.14, 0.14):
        bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=True, segments=6,
            radius1=0.085, radius2=0.095, depth=0.66,
            matrix=Matrix.Translation((sx, 0.0, 0.33))
        )
    for f in bm.faces:
        f.material_index = 0

    # Sculpted Jersey Torso + Shoulders + Raised Cheering / Flag-Holding Arms (material 1 = tintable team jersey!)
    prev = set(bm.faces)
    bmesh.ops.create_cube(
        bm, size=1.0,
        matrix=Matrix.Translation((0.0, 0.0, 0.94)) @ Matrix.Diagonal((0.50, 0.28, 0.62, 1.0))
    )
    if arm_pose == "CHEER":
        for sx in (-1.0, 1.0):
            m_arm = (
                Matrix.Translation((sx * 0.34, -0.04, 1.34))
                @ Euler((0.18, sx * -0.48, 0.0)).to_matrix().to_4x4()
                @ Matrix.Diagonal((0.13, 0.13, 0.58, 1.0))
            )
            bmesh.ops.create_cube(bm, size=1.0, matrix=m_arm)
    else:
        # Both arms angled forward gripping flagpole / marshal staff!
        for sx, z_a in ((-0.22, 1.18), (0.20, 1.32)):
            m_arm = (
                Matrix.Translation((sx, -0.22, z_a))
                @ Euler((0.78, sx * 0.35, 0.0)).to_matrix().to_4x4()
                @ Matrix.Diagonal((0.13, 0.13, 0.52, 1.0))
            )
            bmesh.ops.create_cube(bm, size=1.0, matrix=m_arm)
    for f in bm.faces:
        if f not in prev:
            f.material_index = 1

    # Head + Cap / Helmet (material 2)
    prev = set(bm.faces)
    bmesh.ops.create_icosphere(
        bm, subdivisions=1, radius=0.175,
        matrix=Matrix.Translation((0.0, 0.0, 1.44))
    )
    bmesh.ops.create_cube(
        bm, size=1.0,
        matrix=Matrix.Translation((0.0, -0.14, 1.50)) @ Matrix.Diagonal((0.24, 0.18, 0.05, 1.0))
    )
    for f in bm.faces:
        if f not in prev:
            f.material_index = 2

    return bm


def _add_subdivided_flag_banner(bm, pole_base, pole_len, cloth_w, cloth_h, cols, mat_pole, mat_cloth):
    # Angled Flagpole
    prev = set(bm.faces)
    m_pole = Matrix.Translation((pole_base[0], pole_base[1], pole_base[2] + pole_len * 0.5))
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=True, segments=6,
        radius1=0.032, radius2=0.024, depth=pole_len, matrix=m_pole
    )
    for f in bm.faces:
        if f not in prev:
            f.material_index = mat_pole

    # Subdivided 3D Waving Cloth Grid along +X from flagpole top so vertex shader ripples cleanly!
    top_z = pole_base[2] + pole_len - 0.08
    rows = 3
    grid_verts = []
    for r in range(rows + 1):
        v_frac = r / float(rows)
        z_v = top_z - cloth_h * (1.0 - v_frac)
        row_v = []
        for c in range(cols + 1):
            u_frac = c / float(cols)
            x_u = pole_base[0] + u_frac * cloth_w
            y_wave = math.sin(u_frac * math.pi * 1.5) * 0.06
            v = bm.verts.new((x_u, pole_base[1] + y_wave, z_v))
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
    mat_struct = create_pbr_material("Grandstand_Concrete_Steel", (0.22, 0.26, 0.33), roughness=0.52, metallic=0.28)
    mat_roof = create_pbr_material("Grandstand_Tensile_Roof", (0.93, 0.96, 1.00), roughness=0.28, metallic=0.24)
    mat_stair = create_pbr_material("Grandstand_Safety_Yellow", (0.96, 0.78, 0.06), roughness=0.42, metallic=0.10)
    mat_pants = create_pbr_material("Crowd_Dark_Trousers", (0.14, 0.17, 0.22), roughness=0.78)
    mat_jersey = create_pbr_material("Crowd_Tintable_Jersey", (0.96, 0.97, 0.99), roughness=0.58)
    mat_skin_cap = create_pbr_material("Crowd_Head_Cap", (0.92, 0.76, 0.62), roughness=0.55)
    mat_flag_cloth = create_pbr_material("Crowd_Tintable_Flag", (0.98, 0.98, 1.00), roughness=0.42)
    mat_marshal_suit = create_pbr_material("Marshal_FIA_SafetyOrange", (0.98, 0.42, 0.04), roughness=0.48)

    # 1. Multi-Tiered Architectural Grandstand Tribune (28m span, cantilevered roof + tie-rods + yellow stairs)
    gbm = bmesh.new()
    span_w = 28.0
    bmesh.ops.create_cube(
        gbm, size=1.0,
        matrix=Matrix.Translation((0.0, 0.0, 1.65)) @ Matrix.Diagonal((span_w, 17.6, 3.3, 1.0))
    )
    bmesh.ops.create_cube(
        gbm, size=1.0,
        matrix=Matrix.Translation((0.0, 7.9, 8.2)) @ Matrix.Diagonal((span_w, 2.0, 16.4, 1.0))
    )
    for sx in (-span_w * 0.5 + 0.55, span_w * 0.5 - 0.55):
        bmesh.ops.create_cube(
            gbm, size=1.0,
            matrix=Matrix.Translation((sx, 1.1, 7.0)) @ Matrix.Diagonal((1.1, 15.6, 10.8, 1.0))
        )
    for r in range(12):
        sy = -6.6 + r * 1.18
        sz = 3.55 + r * 0.88
        bmesh.ops.create_cube(
            gbm, size=1.0,
            matrix=Matrix.Translation((0.0, sy, sz)) @ Matrix.Diagonal((span_w - 2.0, 1.24, 0.84, 1.0))
        )
    for px in (-10.5, -3.5, 3.5, 10.5):
        bmesh.ops.create_cone(
            gbm, cap_ends=True, cap_tris=True, segments=8,
            radius1=0.34, radius2=0.28, depth=17.4,
            matrix=Matrix.Translation((px, 6.9, 8.7))
        )
    for f in gbm.faces:
        f.material_index = 0

    # Cantilevered roof awning (material 1)
    prev = set(gbm.faces)
    m_roof = (
        Matrix.Translation((0.0, -0.8, 17.5))
        @ Euler((0.09, 0.0, 0.0)).to_matrix().to_4x4()
        @ Matrix.Diagonal((span_w + 2.4, 21.8, 0.72, 1.0))
    )
    bmesh.ops.create_cube(gbm, size=1.0, matrix=m_roof)
    for f in gbm.faces:
        if f not in prev:
            f.material_index = 1

    # Central yellow stadium stairs (material 2)
    prev = set(gbm.faces)
    for sx_st in (-6.8, 6.8):
        for r in range(12):
            sy = -6.65 + r * 1.18
            sz = 3.62 + r * 0.88
            bmesh.ops.create_cube(
                gbm, size=1.0,
                matrix=Matrix.Translation((sx_st, sy, sz)) @ Matrix.Diagonal((1.45, 1.26, 0.88, 1.0))
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

    # 2. Spectator_Cheering (3D articulated cheering stadium fan with wave vertex weights)
    cbm = _build_humanoid_bmesh("CHEER")
    add_box_uvs(cbm, scale_uv=1.0)
    col_c = cbm.loops.layers.color.new("Col")
    for f in cbm.faces:
        f.smooth = True
        for lp in f.loops:
            co = lp.vert.co
            jump_w = max(0.0, min(1.0, co.z / 1.65))
            arm_w = 1.0 if (co.z > 1.05 and abs(co.x) > 0.24) else 0.0
            lp[col_c] = (jump_w, arm_w, 0.92, 1.0)
    c_mesh = bpy.data.meshes.new("Spectator_Cheering_Mesh")
    cbm.normal_update()
    cbm.to_mesh(c_mesh)
    cbm.free()
    c_obj = bpy.data.objects.new("Spectator_Cheering", c_mesh)
    c_obj.data.materials.append(mat_pants)
    c_obj.data.materials.append(mat_jersey)
    c_obj.data.materials.append(mat_skin_cap)
    link_to_scene(c_obj)
    apply_all_transforms(c_obj)

    # 3. Spectator_FlagWaver (3D fan + 3.2m flagpole + subdivided 3D team flag cloth!)
    fbm = _build_humanoid_bmesh("FLAG")
    _add_subdivided_flag_banner(
        fbm, pole_base=(0.0, -0.34, 0.85), pole_len=2.85,
        cloth_w=2.25, cloth_h=1.28, cols=8, mat_pole=0, mat_cloth=3
    )
    add_box_uvs(fbm, scale_uv=0.6)
    col_f = fbm.loops.layers.color.new("Col")
    for f in fbm.faces:
        f.smooth = True
        is_flag = f.material_index == 3
        for lp in f.loops:
            co = lp.vert.co
            cloth_u = max(0.0, min(1.0, co.x / 2.25)) if is_flag else 0.0
            jump_w = max(0.0, min(1.0, co.z / 1.8))
            lp[col_f] = (cloth_u, jump_w, 0.95, 1.0)
    fw_mesh = bpy.data.meshes.new("Spectator_FlagWaver_Mesh")
    fbm.normal_update()
    fbm.to_mesh(fw_mesh)
    fbm.free()
    fw_obj = bpy.data.objects.new("Spectator_FlagWaver", fw_mesh)
    fw_obj.data.materials.append(mat_pants)
    fw_obj.data.materials.append(mat_jersey)
    fw_obj.data.materials.append(mat_skin_cap)
    fw_obj.data.materials.append(mat_flag_cloth)
    link_to_scene(fw_obj)
    apply_all_transforms(fw_obj)

    # 4. Marshal_FlagWaver (3D FIA Trackside Marshal + Waving 3D Signal Flag!)
    mbm = _build_humanoid_bmesh("FLAG")
    _add_subdivided_flag_banner(
        mbm, pole_base=(0.0, -0.36, 0.92), pole_len=2.15,
        cloth_w=1.65, cloth_h=1.05, cols=7, mat_pole=0, mat_cloth=3
    )
    add_box_uvs(mbm, scale_uv=0.7)
    col_m = mbm.loops.layers.color.new("Col")
    for f in mbm.faces:
        f.smooth = True
        is_flag = f.material_index == 3
        for lp in f.loops:
            co = lp.vert.co
            cloth_u = max(0.0, min(1.0, co.x / 1.65)) if is_flag else 0.0
            lp[col_m] = (cloth_u, 0.25, 0.95, 1.0)
    m_mesh = bpy.data.meshes.new("Marshal_FlagWaver_Mesh")
    mbm.normal_update()
    mbm.to_mesh(m_mesh)
    mbm.free()
    m_obj = bpy.data.objects.new("Marshal_FlagWaver", m_mesh)
    m_obj.data.materials.append(mat_pants)
    m_obj.data.materials.append(mat_marshal_suit)
    m_obj.data.materials.append(mat_roof)
    m_obj.data.materials.append(mat_flag_cloth)
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
    mat_curb_r = create_pbr_material("Track_Curb_FIARed", (0.86, 0.10, 0.13), roughness=0.32, metallic=0.10)
    mat_curb_w = create_pbr_material("Track_Curb_FIAWhite", (0.96, 0.98, 1.00), roughness=0.32, metallic=0.10)

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
