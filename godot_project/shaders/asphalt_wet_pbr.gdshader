shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026 (GODOT 4 AAA SHADER PIPELINE)
// Shader: asphalt_wet_pbr.gdshader (@Godot_VFX_Shaders_Lead)
// Purpose:
//   - Multi-scale Macro + Micro quartz mineral asphalt aggregate PBR
//   - UV2 / Vertex-Color Green Channel (COLOR.g) rubbered-in racing groove
//   - Painted FIA White & Yellow/Cyan contrast track-edge lines
//   - Dynamic wetness & standing puddle specular/clearcoat mirror modulation
//   - Animated raindrop concentric ripple rings inside standing puddles
// ============================================================================

group_uniforms AsphaltAggregate;
uniform vec3 asphalt_base_color : source_color = vec3(0.145, 0.155, 0.175);
uniform vec3 asphalt_groove_color : source_color = vec3(0.075, 0.080, 0.094);
uniform vec3 aggregate_sparkle_color : source_color = vec3(0.42, 0.45, 0.50);
uniform float macro_uv_scale : hint_range(1.0, 64.0) = 12.0;
uniform float micro_uv_scale : hint_range(16.0, 512.0) = 96.0;
uniform float dry_roughness : hint_range(0.05, 1.0) = 0.78;
uniform float groove_roughness : hint_range(0.05, 1.0) = 0.36;
uniform float normal_bump_strength : hint_range(0.0, 2.0) = 0.65;

group_uniforms RacingLineAndMarkings;
uniform float groove_center_u : hint_range(-1.0, 1.0) = -0.10;
uniform float groove_half_width : hint_range(0.05, 0.60) = 0.24;
uniform float groove_intensity : hint_range(0.0, 1.0) = 0.85;
uniform bool enable_track_edge_lines = true;
uniform vec3 edge_line_primary_color : source_color = vec3(0.95, 0.96, 0.98);
uniform vec3 edge_line_accent_color : source_color = vec3(1.0, 0.82, 0.12);

group_uniforms DynamicWeatherWetness;
global uniform float global_wetness;
global uniform float groove_wetness;
uniform float local_wetness_override : hint_range(-1.0, 1.0) = -1.0;
uniform float puddle_coverage : hint_range(0.0, 1.0) = 0.52;
uniform float puddle_world_scale : hint_range(0.01, 0.5) = 0.065;
uniform float rain_ripple_intensity : hint_range(0.0, 1.0) = 0.68;
uniform vec3 wet_sky_tint : source_color = vec3(0.58, 0.74, 0.94);

varying vec3 v_world_pos;
varying vec3 v_world_normal;
varying float v_vertex_groove;
varying float v_vertex_puddle_bias;

// Fast deterministic 2D -> 1D and 2D -> 2D procedural hashes (mobile ALU friendly)
float hash21(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.xx + p3.yz) * p3.zy);
}

float value_noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = hash21(i);
	float b = hash21(i + vec2(1.0, 0.0));
	float c = hash21(i + vec2(0.0, 1.0));
	float d = hash21(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm4(vec2 p) {
	float v = 0.0;
	float amp = 0.5;
	mat2 rot = mat2(vec2(0.80, 0.60), vec2(-0.60, 0.80));
	for (int i = 0; i < 4; i++) {
		v += amp * value_noise(p);
		p = rot * p * 2.04;
		amp *= 0.5;
	}
	return v;
}

// Concentric expanding raindrop ripple rings inside standing water puddles
vec2 compute_rain_ripples(vec2 world_xz, float time_sec) {
	vec2 uv = world_xz * 1.35;
	vec2 cell = floor(uv);
	vec2 f = fract(uv);
	vec2 accum_grad = vec2(0.0);

	for (int dy = -1; dy <= 1; dy++) {
		for (int dx = -1; dx <= 1; dx++) {
			vec2 neighbor = vec2(float(dx), float(dy));
			vec2 rnd = hash22(cell + neighbor);
			float phase = fract(time_sec * (1.25 + rnd.x * 0.75) + rnd.y);
			vec2 center = neighbor + rnd * 0.75 - f;
			float dist = length(center) + 1e-4;
			float wave = sin(dist * 28.0 - phase * 18.84955) * exp(-dist * 4.2) * (1.0 - phase);
			accum_grad += (center / dist) * wave;
		}
	}
	return accum_grad * 0.045;
}

void vertex() {
	v_world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_world_normal = normalize(MODEL_NORMAL_MATRIX * NORMAL);
	// Vertex-Color Green channel (COLOR.g) or UV2 (UV2.x / UV2.y) encodes baked racing-line rubber weight
	v_vertex_groove = clamp(max(COLOR.g, max(UV2.x, UV2.y)), 0.0, 1.0);
	// Vertex-Color Blue channel (COLOR.b) encodes drainage basin / puddle accumulation bias
	v_vertex_puddle_bias = COLOR.b;
}

void fragment() {
	// 1. Multi-Scale Quartz Mineral Aggregate & Bitumen Base
	vec2 macro_uv = UV * vec2(macro_uv_scale, macro_uv_scale * 4.0);
	vec2 micro_uv = UV * vec2(micro_uv_scale, micro_uv_scale * 4.0);

	float macro_var = fbm4(macro_uv);
	float micro_grain = value_noise(micro_uv);
	float fine_grit = hash21(floor(micro_uv * 2.5));

	// 2. Rubbered-In Racing Groove Blend (combines spline lateral UV + baked COLOR.g / UV2.x)
	float lat_coord = (UV.x - 0.5) * 2.0; // [-1.0 .. +1.0] across road width
	float dist_to_groove = abs(lat_coord - groove_center_u);
	float uv_groove_mask = 1.0 - smoothstep(groove_half_width * 0.35, groove_half_width, dist_to_groove);
	float rubber_weight = clamp(max(uv_groove_mask, v_vertex_groove) * groove_intensity, 0.0, 1.0);

	// Longitudinal tire-marbling streaks along the racing groove
	float marble_streak = value_noise(vec2(UV.x * 42.0, UV.y * 180.0));
	rubber_weight = clamp(rubber_weight * (0.82 + 0.28 * marble_streak), 0.0, 1.0);

	vec3 base_albedo = mix(asphalt_base_color, asphalt_base_color * 1.18, macro_var * 0.45);
	base_albedo = mix(base_albedo, aggregate_sparkle_color, smoothstep(0.76, 0.96, fine_grit) * 0.22);
	base_albedo = mix(base_albedo, asphalt_groove_color, rubber_weight * 0.78);

	// 3. Painted FIA White + Yellow/Cyan Contrast Track-Edge Lines
	float edge_abs = abs(lat_coord);
	float white_line_mask = smoothstep(0.89, 0.905, edge_abs) * (1.0 - smoothstep(0.935, 0.948, edge_abs));
	float accent_line_mask = smoothstep(0.865, 0.875, edge_abs) * (1.0 - smoothstep(0.885, 0.892, edge_abs));
	float paint_mask = 0.0;
	if (enable_track_edge_lines) {
		paint_mask = clamp(white_line_mask + accent_line_mask, 0.0, 1.0);
		base_albedo = mix(base_albedo, edge_line_primary_color, white_line_mask * 0.92);
		base_albedo = mix(base_albedo, edge_line_accent_color, accent_line_mask * 0.86);
	}

	// 4. Micro-Bump Tangent Normal Perturbation
	float h_center = micro_grain * 0.65 + fine_grit * 0.35;
	float h_dx = value_noise(micro_uv + vec2(0.45, 0.0)) * 0.65;
	float h_dy = value_noise(micro_uv + vec2(0.0, 0.45)) * 0.65;
	// Rubbered racing groove fills micro-pores, smoothing normal perturbations
	float bump_atten = mix(1.0, 0.42, rubber_weight) * (1.0 - paint_mask * 0.65);
	vec2 surf_grad = vec2(h_center - h_dx, h_center - h_dy) * normal_bump_strength * bump_atten;

	// 5. Dynamic Wetness, Drying Groove & Standing Puddles
	float active_wetness = (local_wetness_override >= 0.0) ? local_wetness_override : global_wetness;
	float active_groove_wet = (local_wetness_override >= 0.0)
		? local_wetness_override * 0.78
		: max(groove_wetness, active_wetness * 0.78);
	float local_moisture = mix(active_wetness, active_groove_wet, rubber_weight);

	// Low-frequency world-space puddle basins off the crowned racing line
	float basin_noise = fbm4(v_world_pos.xz * puddle_world_scale);
	float crown_drainage = smoothstep(0.12, 0.55, abs(lat_coord));
	float puddle_field = basin_noise * (0.68 + 0.32 * crown_drainage) + v_vertex_puddle_bias * 0.35;
	float puddle_thresh = mix(0.92, 0.44, clamp(local_moisture * puddle_coverage, 0.0, 1.0));
	float puddle_mask = smoothstep(puddle_thresh, puddle_thresh + 0.14, puddle_field) * step(0.08, local_moisture);

	// Wet asphalt darkening (porous water absorption reduces diffuse albedo by ~42%)
	float porous_darken = mix(1.0, 0.56, clamp(local_moisture * 1.15, 0.0, 1.0));
	vec3 final_albedo = base_albedo * mix(porous_darken, 0.88, paint_mask);
	// Standing puddles reflect sky tint at grazing Fresnel angles
	float ndotv = clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	float fresnel = pow(1.0 - ndotv, 4.2);
	final_albedo = mix(final_albedo, wet_sky_tint * 0.45, puddle_mask * fresnel * 0.72);

	// 6. Raindrop Ripples inside Standing Puddles
	if (puddle_mask > 0.02 && local_moisture > 0.18 && rain_ripple_intensity > 0.01) {
		vec2 ripple_grad = compute_rain_ripples(v_world_pos.xz, TIME) * rain_ripple_intensity * local_moisture;
		surf_grad = mix(surf_grad, ripple_grad, puddle_mask * 0.92);
	} else {
		surf_grad *= (1.0 - puddle_mask * 0.92);
	}

	// 7. Final PBR Material Outputs (Roughness, Metallic, Clearcoat, Normal)
	float base_rough = mix(dry_roughness, groove_roughness, rubber_weight);
	base_rough = mix(base_rough, 0.32, paint_mask);
	float wet_rough = mix(base_rough, 0.07, clamp(local_moisture * 1.1, 0.0, 1.0));
	float final_roughness = mix(wet_rough, 0.025, puddle_mask);

	ALBEDO = final_albedo;
	ROUGHNESS = clamp(final_roughness, 0.02, 1.0);
	METALLIC = mix(0.06 + rubber_weight * 0.08, 0.76, clamp(local_moisture * 0.65 + puddle_mask * 0.55, 0.0, 1.0));
	SPECULAR = mix(0.52, 0.95, clamp(local_moisture + puddle_mask, 0.0, 1.0));
	CLEARCOAT = clamp(local_moisture * 0.85 + puddle_mask * 0.95 + rubber_weight * 0.22, 0.0, 1.0);
	CLEARCOAT_ROUGHNESS = mix(0.18, 0.025, clamp(local_moisture + puddle_mask, 0.0, 1.0));
	NORMAL_MAP = normalize(vec3(-surf_grad.x, -surf_grad.y, 1.0)) * 0.5 + 0.5;
	NORMAL_MAP_DEPTH = 1.0;
}
