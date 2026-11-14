shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_burley, specular_schlick_ggx;

// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026 (GODOT 4 AAA SHADER PIPELINE)
// Shader: foliage_wind_and_crowd_vat.gdshader (@Godot_VFX_Shaders_Lead)
// Purpose:
//   - Dual-mode GPU Vertex Animation Shader for:
//     (A) 3D Biome Trees (Deciduous, Alpine Pines, Mediterranean Palms) using
//         Vertex-Color Red (COLOR.r) wind weight, primary trunk sway +
//         high-frequency leaf flutter, hemisphere canopy normals, and foliage
//         subsurface scattering transmission (`BACKLIGHT`).
//     (B) 3D Grandstand Spectators (`MultiMeshInstance3D`) using VAT / procedural
//         stadium Mexican-wave cheering bounce, arm/flag waving, per-instance
//         team livery palette variation (`INSTANCE_CUSTOM`), and stochastic
//         stadium camera flash starbursts as F1 cars blast down the straight!
// ============================================================================

group_uniforms ModeSelection;
// false = 3D Biome Foliage Wind Mode; true = 3D Grandstand Crowd VAT Mode
uniform bool is_crowd_mode = false;

group_uniforms GlobalWindAndExcitement;
global uniform vec3 wind_direction;
global uniform float wind_speed;
global uniform float crowd_excitement;
global uniform float camera_flash_rate;

group_uniforms FoliageParameters;
uniform vec3 foliage_canopy_color : source_color = vec3(0.18, 0.44, 0.22);
uniform vec3 foliage_sunlit_tip_color : source_color = vec3(0.36, 0.64, 0.30);
uniform vec3 trunk_bark_color : source_color = vec3(0.28, 0.20, 0.14);
uniform vec3 subsurface_tint : source_color = vec3(0.48, 0.78, 0.26);
uniform float trunk_sway_amplitude : hint_range(0.0, 1.5) = 0.28;
uniform float leaf_flutter_amplitude : hint_range(0.0, 0.5) = 0.085;
uniform float leaf_flutter_frequency : hint_range(1.0, 20.0) = 6.8;
uniform float hemisphere_normal_blend : hint_range(0.0, 1.0) = 0.65;

group_uniforms CrowdVATParameters;
uniform bool use_vat_texture = false;
uniform sampler2D vat_position_tex : filter_linear, repeat_enable;
uniform float vat_frame_rate : hint_range(1.0, 60.0) = 24.0;
uniform float crowd_wave_speed : hint_range(0.5, 12.0) = 4.2;
uniform float crowd_jump_height : hint_range(0.0, 0.65) = 0.26;
uniform vec3 team_palette_a : source_color = vec3(0.90, 0.10, 0.18); // Namco Scuderia Crimson
uniform vec3 team_palette_b : source_color = vec3(1.00, 0.48, 0.00); // Papaya Apex Orange
uniform vec3 team_palette_c : source_color = vec3(0.00, 0.82, 0.75); // Silver Arrow Teal
uniform vec3 team_palette_d : source_color = vec3(0.05, 0.38, 0.92); // Equipe Royale Blue

varying float v_wind_or_cheer_mask;
varying float v_camera_flash;
varying float v_instance_seed;
varying vec3 v_local_pos;

float hash11(float p) {
	p = fract(p * 0.1031);
	p *= p + 33.33;
	p *= p + p;
	return fract(p);
}

void vertex() {
	v_local_pos = VERTEX;
	vec3 world_origin = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	float spatial_phase = dot(world_origin.xz, vec2(0.085, 0.065));
	float inst_seed = INSTANCE_CUSTOM.x + float(INSTANCE_ID) * 0.371 + spatial_phase;
	v_instance_seed = inst_seed;
	v_camera_flash = 0.0;

	vec2 raw_wind_xz = length(wind_direction.xz) > 0.001
		? normalize(wind_direction.xz)
		: vec2(0.82, 0.57);
	float eff_wind = max(0.35, wind_speed);

	if (!is_crowd_mode) {
		// ====================================================================
		// MODE A: 3D BIOME FOLIAGE WIND (Trunk Sway + Leaf Flutter + Normals)
		// ====================================================================
		// Vertex-Color Red (COLOR.r) encodes branch/canopy flexibility [0=base .. 1=outer leaves]
		float flex_weight = clamp(max(COLOR.r, smoothstep(0.8, 5.5, VERTEX.y)), 0.0, 1.0);
		v_wind_or_cheer_mask = flex_weight;

		// Primary low-frequency trunk & bough sway along global wind vector
		float sway_wave = sin(TIME * (1.45 * eff_wind) + spatial_phase) * 0.7
			+ cos(TIME * (0.85 * eff_wind) + spatial_phase * 1.7) * 0.3;
		vec2 trunk_offset = raw_wind_xz * sway_wave * trunk_sway_amplitude * (flex_weight * flex_weight);

		// Secondary high-frequency turbulent leaf & frond flutter
		float leaf_phase = TIME * leaf_flutter_frequency * eff_wind + dot(VERTEX, vec3(4.3, 5.7, 3.9)) + inst_seed;
		vec3 flutter_offset = vec3(
			sin(leaf_phase),
			cos(leaf_phase * 1.31) * 0.55,
			cos(leaf_phase * 0.93)
		) * leaf_flutter_amplitude * flex_weight;

		VERTEX.xz += trunk_offset;
		VERTEX += flutter_offset;

		// Outward hemisphere vertex normal blending for plush volumetric 3D tree crowns
		if (flex_weight > 0.20) {
			vec3 crown_center = vec3(0.0, 3.2, 0.0);
			vec3 hemi_normal = normalize(VERTEX - crown_center + vec3(0.0, 0.65, 0.0));
			NORMAL = normalize(mix(NORMAL, hemi_normal, hemisphere_normal_blend * flex_weight));
		}
	} else {
		// ====================================================================
		// MODE B: 3D GRANDSTAND CROWD VAT + STADIUM WAVE + CAMERA FLASHES
		// ====================================================================
		float excite = clamp(max(0.45, crowd_excitement), 0.0, 1.5);
		float upper_torso_mask = smoothstep(0.35, 1.15, VERTEX.y);
		v_wind_or_cheer_mask = upper_torso_mask;

		if (use_vat_texture) {
			// Sample baked Vertex Animation Texture (X = vertex index UV2.x, Y = animation frame)
			float anim_y = fract(TIME * (vat_frame_rate / 60.0) + hash11(inst_seed));
			vec3 vat_delta = texture(vat_position_tex, vec2(UV2.x, anim_y)).xyz;
			VERTEX += vat_delta * excite;
		} else {
			// Procedural Mexican-Wave Stadium Bounce + Cheering Arm/Flag Wave
			float wave_clock = TIME * crowd_wave_speed - world_origin.x * 0.065 + hash11(inst_seed) * 6.28318;
			float jump_pulse = max(0.0, sin(wave_clock));
			float cheer_bounce = pow(jump_pulse, 1.8) * crowd_jump_height * excite;

			// Upper torso & raised arms/flags sway left-right in celebration
			float arm_sway = sin(TIME * 7.5 + inst_seed * 4.1) * 0.14 * upper_torso_mask * excite;
			VERTEX.y += cheer_bounce * smoothstep(0.05, 0.55, VERTEX.y);
			VERTEX.x += arm_sway;
			VERTEX.z += cos(TIME * 6.2 + inst_seed * 2.7) * 0.06 * upper_torso_mask;
		}

		// Stochastic Stadium Camera Flash Starbursts (triggered on upper body / lens vertices)
		float flash_freq = max(0.25, camera_flash_rate);
		float flash_cycle = fract(TIME * (1.8 * flash_freq) + hash11(inst_seed * 13.7));
		float is_flashing_spectator = step(0.91, hash11(floor(TIME * 2.5) + inst_seed));
		v_camera_flash = smoothstep(0.92, 0.99, flash_cycle) * is_flashing_spectator * upper_torso_mask;
	}
}

void fragment() {
	if (!is_crowd_mode) {
		// 3D Biome Tree Bark vs Sunlit Canopy Albedo & Subsurface Transmission
		float is_canopy = smoothstep(0.15, 0.35, v_wind_or_cheer_mask);
		float height_grad = clamp((v_local_pos.y - 1.2) / 4.2, 0.0, 1.0);
		float instance_tint = hash11(v_instance_seed) * 0.18 - 0.09;

		vec3 leaf_col = mix(foliage_canopy_color, foliage_sunlit_tip_color, height_grad) + vec3(instance_tint * 0.4, instance_tint, instance_tint * 0.2);
		ALBEDO = mix(trunk_bark_color, leaf_col, is_canopy);
		ROUGHNESS = mix(0.88, 0.58, is_canopy);
		METALLIC = 0.02;
		// Foliage Subsurface Scattering / Backlight Transmission when backlit by low Sunset/Fuji sun
		BACKLIGHT = subsurface_tint * (0.42 * is_canopy);
	} else {
		// 3D Grandstand Spectator Team Livery Jersey & Camera Flash Emission
		float team_pick = fract(hash11(v_instance_seed * 3.17));
		vec3 jersey_col = team_palette_a;
		if (team_pick > 0.75) {
			jersey_col = team_palette_d;
		} else if (team_pick > 0.50) {
			jersey_col = team_palette_c;
		} else if (team_pick > 0.25) {
			jersey_col = team_palette_b;
		}

		// Lower legs/seats are dark slate; upper torso wears bright team colours; head/cap at top
		float torso_band = smoothstep(0.28, 0.48, v_local_pos.y) * (1.0 - smoothstep(1.22, 1.35, v_local_pos.y));
		vec3 base_crowd_col = mix(vec3(0.14, 0.16, 0.20), jersey_col, torso_band);

		ALBEDO = base_crowd_col;
		ROUGHNESS = 0.64;
		METALLIC = 0.08;
		// Intense white-blue Xenon/LED camera flash pop (picked up by Godot 4 Glow/Bloom!)
		EMISSION = vec3(3.8, 4.2, 5.0) * v_camera_flash;
	}
}
