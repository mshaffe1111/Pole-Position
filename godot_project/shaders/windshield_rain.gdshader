shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, unshaded;

// ============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026 (GODOT 4 AAA SHADER PIPELINE)
// Shader: windshield_rain.gdshader (@Godot_VFX_Shaders_Lead)
// Purpose:
//   - Cockpit Helmet Visor / Aeroscreen Raindrop Refraction & Aero-Shear Shader
//   - Combines static micro-condensation beads + gravity/airflow-driven sliding
//     raindrop rivulets that deflect outward at 300+ km/h and curve with yaw!
//   - Includes a tear-off visor / wiper clear-sweep band (`visor_wipe_progress`)
//   - Uses screen-space normal refraction (`hint_screen_texture`) for zero-overdraw
//     60 FPS mobile GPU execution.
// ============================================================================

uniform sampler2D screen_tex : hint_screen_texture, repeat_disable, filter_linear_mipmap;

group_uniforms RaindropDynamics;
global uniform float global_wetness;
uniform float rain_intensity_override : hint_range(-1.0, 1.0) = -1.0;
uniform float car_speed_kmh : hint_range(0.0, 360.0) = 240.0;
uniform float yaw_rate_rad : hint_range(-2.0, 2.0) = 0.0;
uniform float refraction_strength : hint_range(0.0, 0.12) = 0.038;
uniform float droplet_density : hint_range(4.0, 32.0) = 16.0;

group_uniforms VisorTearOffAndTint;
uniform float visor_wipe_progress : hint_range(0.0, 1.0) = 0.0;
uniform vec3 visor_perimeter_tint : source_color = vec3(0.04, 0.09, 0.16);
uniform vec3 droplet_specular_color : source_color = vec3(0.86, 0.94, 1.0);
uniform float vignette_strength : hint_range(0.0, 1.0) = 0.28;

vec3 hash13(float p) {
	vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.11369, 0.13787));
	p3 += dot(p3, p3.yzx + 19.19);
	return fract(vec3((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y, (p3.y + p3.z) * p3.x));
}

float hash21(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

// Computes a single layer of aero-sheared sliding raindrops + trailing wake beads
// Returns vec3(normal_xy, droplet_mask)
vec3 sliding_rain_layer(vec2 uv, float time_sec, float scale, float speed_factor) {
	vec2 aspect = vec2(2.2, 1.0);
	vec2 st = uv * scale * aspect;

	// High-speed airflow pushes droplets radially outward from visor stagnation center
	vec2 center_dir = uv - vec2(0.5, 0.58);
	st += center_dir * speed_factor * 0.55;
	st.x += yaw_rate_rad * 0.45 * (1.0 - uv.y);

	vec2 id = floor(st);
	st.y += time_sec * (0.42 + speed_factor * 0.68) * (0.75 + 0.5 * hash21(vec2(id.x, 0.0)));
	id = floor(st);
	vec3 rnd = hash13(id.x * 137.3 + id.y * 591.7);
	vec2 gv = fract(st) - 0.5;

	// Wiggly capillary path as droplet slides across polycarbonate visor
	float wiggle = sin(uv.y * 22.0 + sin(uv.y * 7.0) + rnd.x * 6.28318) * 0.22 * (0.5 - abs(gv.x));
	float drop_x = (rnd.x - 0.5) * 0.65 + wiggle;
	float drop_y = -sin(time_sec * (1.4 + rnd.z) + sin(time_sec * 2.1 + rnd.y) * 0.5) * 0.36;

	vec2 drop_vec = (gv - vec2(drop_x, drop_y)) / aspect;
	float drop_dist = length(drop_vec);
	float main_drop = smoothstep(0.11, 0.02, drop_dist);

	// Trailing micro-beads left behind the main sliding droplet
	vec2 trail_vec = (gv - vec2(drop_x, drop_y * 0.25)) / vec2(1.0, 2.8);
	trail_vec.y = (fract(st.y * 5.0) - 0.5) / 5.0;
	float trail_drop = smoothstep(0.06, 0.01, length(trail_vec))
		* smoothstep(-0.04, 0.04, gv.y - drop_y)
		* smoothstep(0.48, drop_y, gv.y);

	float combined = clamp(main_drop + trail_drop * 0.72, 0.0, 1.0);
	vec2 normal_xy = drop_vec * 9.5 * main_drop + trail_vec * 7.0 * trail_drop;
	return vec3(normal_xy, combined);
}

// Static micro-mist condensation droplets
vec3 static_mist_beads(vec2 uv, float time_sec, float scale) {
	vec2 st = uv * scale * vec2(1.8, 1.0);
	vec2 id = floor(st);
	vec2 gv = fract(st) - 0.5;
	vec3 rnd = hash13(id.x * 73.1 + id.y * 319.9);
	vec2 pos = (rnd.xy - 0.5) * 0.58;
	float fade = smoothstep(0.0, 0.2, fract(time_sec * 0.35 + rnd.z))
		* smoothstep(1.0, 0.65, fract(time_sec * 0.35 + rnd.z));
	float d = length(gv - pos);
	float mask = smoothstep(0.12, 0.015, d) * fade * step(0.42, rnd.x);
	return vec3((gv - pos) * 8.0 * mask, mask);
}

void fragment() {
	float eff_rain = (rain_intensity_override >= 0.0) ? rain_intensity_override : global_wetness;
	eff_rain = clamp(eff_rain, 0.0, 1.0);

	// Tear-off visor strip wipe clears droplets from left to right when triggered
	float wipe_clear = 1.0;
	if (visor_wipe_progress > 0.001 && visor_wipe_progress < 0.999) {
		wipe_clear = smoothstep(visor_wipe_progress - 0.06, visor_wipe_progress + 0.04, SCREEN_UV.x);
	}
	float active_rain = eff_rain * wipe_clear;

	float speed_norm = clamp(car_speed_kmh / 320.0, 0.0, 1.15);

	vec3 mist = vec3(0.0);
	vec3 layer_a = vec3(0.0);
	vec3 layer_b = vec3(0.0);

	if (active_rain > 0.02) {
		mist = static_mist_beads(SCREEN_UV, TIME, droplet_density * 2.4) * smoothstep(0.05, 0.45, active_rain);
		layer_a = sliding_rain_layer(SCREEN_UV, TIME, droplet_density, speed_norm) * smoothstep(0.10, 0.65, active_rain);
		layer_b = sliding_rain_layer(SCREEN_UV * 1.37 + vec2(0.23, -0.17), TIME * 1.18, droplet_density * 0.78, speed_norm * 1.15)
			* smoothstep(0.28, 0.95, active_rain);
	}

	vec2 total_normal = (mist.xy * 0.45 + layer_a.xy + layer_b.xy * 0.85) * active_rain;
	float drop_mask = clamp(mist.z * 0.5 + layer_a.z + layer_b.z, 0.0, 1.0) * active_rain;

	// Screen-space refraction through water meniscus (slightly sharper mip for magnifying lens effect)
	vec2 refracted_uv = clamp(SCREEN_UV + total_normal * refraction_strength, vec2(0.002), vec2(0.998));
	vec3 scene_col = textureLod(screen_tex, refracted_uv, 0.0).rgb;

	// Specular rim glint on top edge of water beads
	float rim_glint = pow(clamp(dot(normalize(vec3(total_normal, 0.35)), normalize(vec3(-0.35, 0.78, 0.52))), 0.0, 1.0), 6.0) * drop_mask;
	scene_col += droplet_specular_color * rim_glint * 0.55;

	// Subtle helmet visor perimeter vignette
	vec2 centered = (SCREEN_UV - 0.5) * vec2(1.15, 1.35);
	float vig = smoothstep(0.45, 0.95, length(centered)) * vignette_strength;
	scene_col = mix(scene_col, visor_perimeter_tint, vig);

	ALBEDO = scene_col;
	ALPHA = clamp(drop_mask * 0.92 + vig * 0.85, 0.0, 1.0);
}
