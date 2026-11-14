shader_type canvas_item;
// ==============================================================================
// RACE PHANATIC F1 — POLE POSITION 2026: RETRO GRAND PRIX (GODOT 4.3)
// Agent: @retro1982
// File: godot_project/shaders/crt_1982_arcade.gdshader
//
// Authentic 1982 Namco System-1 Arcade Raster Quantizer & Trinitron CRT Shader:
// 1. Dynamic Square-Pixel Framebuffer Quantization (W x 240p in Landscape/Desktop,
//    196 x H square pixels in Google Pixel 11 Pro Portrait).
// 2. 2x2 Bayer Ordered Dithering + Namco System-1 RGB DAC Palette Quantization
//    with Vivid Arcade Chroma Punch.
// 3. Horizontal Raster Scanlines, RGB Aperture-Grille Phosphor Mask & Subtle
//    Curved Arcade Tube Vignette.
// 4. Live DRS / Slipstream Cyan Edge Surge, Monsoon Lightning Flash & Final-Lap
//    Flashing Checkered Top Border.
// ==============================================================================

uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_nearest;

uniform bool retro_enabled = true;
uniform float target_vertical_px : hint_range(160.0, 360.0, 1.0) = 240.0;
uniform float portrait_width_px : hint_range(160.0, 260.0, 1.0) = 196.0;
uniform float palette_levels : hint_range(4.0, 32.0, 1.0) = 8.0;
uniform float dither_strength : hint_range(0.0, 1.0, 0.01) = 0.26;
uniform float scanline_strength : hint_range(0.0, 0.65, 0.01) = 0.22;
uniform float phosphor_mask_strength : hint_range(0.0, 0.45, 0.01) = 0.12;
uniform float crt_curvature : hint_range(0.0, 0.08, 0.001) = 0.020;
uniform float vignette_strength : hint_range(0.0, 0.65, 0.01) = 0.24;
uniform float color_saturation_boost : hint_range(0.8, 2.0, 0.01) = 1.28;
uniform float drs_boost_flash : hint_range(0.0, 1.0, 0.01) = 0.0;
uniform float lightning_flash : hint_range(0.0, 1.0, 0.01) = 0.0;
uniform bool checkered_border_active = false;

vec2 apply_crt_curve(vec2 uv, float amount) {
	if (amount <= 0.0001) {
		return uv;
	}
	vec2 centered = uv * 2.0 - 1.0;
	vec2 offset = centered.yx * centered.yx * amount;
	centered += centered * offset;
	return centered * 0.5 + 0.5;
}

float bayer2x2(ivec2 px) {
	int idx = (px.x & 1) + ((px.y & 1) * 2);
	if (idx == 0) return -0.375;
	if (idx == 1) return 0.125;
	if (idx == 2) return 0.375;
	return -0.125;
}

void fragment() {
	if (!retro_enabled) {
		COLOR = textureLod(screen_texture, SCREEN_UV, 0.0);
	} else {
		vec2 vp_size = 1.0 / max(SCREEN_PIXEL_SIZE, vec2(0.00001));
		float aspect = vp_size.x / max(vp_size.y, 1.0);

		// Square-pixel arcade grid: 196xH on Portrait phones, Wx240 on Landscape/Desktop!
		vec2 virtual_res;
		if (aspect < 0.85) {
			virtual_res = vec2(portrait_width_px, clamp(round(portrait_width_px / max(aspect, 0.35)), 240.0, 520.0));
		} else {
			virtual_res = vec2(clamp(round(target_vertical_px * aspect), 220.0, 564.0), target_vertical_px);
		}

		vec2 curved_uv = apply_crt_curve(SCREEN_UV, crt_curvature);
		bool out_of_tube = (curved_uv.x < 0.0 || curved_uv.x > 1.0 || curved_uv.y < 0.0 || curved_uv.y > 1.0);

		if (out_of_tube) {
			COLOR = vec4(0.01, 0.012, 0.025, 1.0);
		} else {
			// Snap UV to razor-sharp arcade pixel centers
			vec2 pixel_coord = floor(curved_uv * virtual_res);
			vec2 snapped_uv = (pixel_coord + vec2(0.5)) / virtual_res;
			vec3 col = textureLod(screen_texture, clamp(snapped_uv, vec2(0.001), vec2(0.999)), 0.0).rgb;

			// Boost arcade chroma saturation (Namco System-1 vivid RGB punch!)
			float luma = dot(col, vec3(0.299, 0.587, 0.114));
			col = clamp(mix(vec3(luma), col, color_saturation_boost), vec3(0.0), vec3(1.0));

			// 2x2 Bayer ordered dithering + System-1 RGB DAC palette quantization
			ivec2 ipx = ivec2(pixel_coord);
			float dither = bayer2x2(ipx) * (dither_strength / max(palette_levels, 2.0));
			col = floor(clamp(col + vec3(dither), vec3(0.0), vec3(0.999)) * palette_levels) / max(palette_levels - 1.0, 1.0);

			// DRS / Slipstream high-speed cyan edge shimmer
			if (drs_boost_flash > 0.01) {
				float edge_dist = abs(curved_uv.x - 0.5) * 2.0;
				float pulse = 0.5 + 0.5 * sin(TIME * 22.0 + pixel_coord.y * 0.35);
				float mask = smoothstep(0.68, 1.0, edge_dist) * drs_boost_flash * pulse;
				col = mix(col, vec3(0.33, 0.92, 1.0), mask * 0.45);
			}

			// Monsoon storm lightning flash
			if (lightning_flash > 0.01) {
				col = mix(col, vec3(0.92, 0.97, 1.0), clamp(lightning_flash * 0.72, 0.0, 0.85));
			}

			// Final-Lap / Podium 1982 flashing checkered top border (top 2 virtual pixel rows)
			if (checkered_border_active && pixel_coord.y < 2.0) {
				int parity = int(floor(TIME * 10.0)) & 1;
				int cell = int(floor(pixel_coord.x / 6.0));
				col = (((cell + parity) & 1) == 0) ? vec3(0.97, 0.97, 0.97) : vec3(0.06, 0.06, 0.08);
			}

			// Horizontal 240p CRT raster scanline darkening on odd screen rows
			float scan_wave = 0.5 + 0.5 * cos(fract(curved_uv.y * virtual_res.y) * 6.2831853);
			col *= mix(1.0, 0.72 + 0.28 * scan_wave, scanline_strength);

			// Trinitron RGB phosphor subpixel column triad
			int sub_x = int(floor(SCREEN_UV.x * vp_size.x)) % 3;
			vec3 mask_rgb = vec3(1.0);
			if (sub_x == 0) mask_rgb = vec3(1.08, 0.94, 0.94);
			else if (sub_x == 1) mask_rgb = vec3(0.94, 1.08, 0.94);
			else mask_rgb = vec3(0.94, 0.94, 1.08);
			col *= mix(vec3(1.0), mask_rgb, phosphor_mask_strength);

			// Subtle arcade cabinet tube corner vignette
			vec2 vig_d = curved_uv * (1.0 - curved_uv.yx);
			float vig = clamp(pow(max(vig_d.x * vig_d.y * 16.0, 0.0), 0.22), 0.0, 1.0);
			col *= mix(1.0, vig, vignette_strength);

			COLOR = vec4(clamp(col, vec3(0.0), vec3(1.0)), 1.0);
		}
	}
}
