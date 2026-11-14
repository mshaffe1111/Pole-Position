#!/usr/bin/env python3
"""
Race Phanatic F1 — Studio Motorsport Acoustic Sample-Bank & Convolution IR Baker
================================================================================
Generates 13 physical-modeled, loop-locked 44.1 kHz 16-bit PCM RIFF WAVE (.wav)
audio sample banks and stereo acoustic convolution impulse responses in
`assets/audio/` using zero external binary dependencies (pure Python 3 stdlib
`math`/`wave`/`array`/`struct`/`random`, with optional NumPy acceleration).

Generated Assets (`assets/audio/*.wav`, 44,100 Hz, 16-bit PCM):
  1. engine_idle_loop.wav               (3,500 RPM lumpy Otto-cycle idle bark, 70 exact 720-deg cycles)
  2. engine_mid_bark_loop.wav           (8,500 RPM high-BMEP header + Helmholtz airbox bark, 170 cycles)
  3. engine_high_scream_loop.wav        (13,500 RPM V6/V10 Inconel scream + 11-blade turbo, 270 cycles)
  4. engine_offthrottle_overrun_loop.wav(8,500 RPM closed-throttle vacuum + unburnt-fuel crackles/burbles)
  5. gearbox_spur_whine_loop.wav        (200 km/h straight-cut/dog-ring transmission mesh + sidebands)
  6. tire_scrub_limit_loop.wav          (Progressive 65-95% grip-limit Pirelli rubber hysteresis groan)
  7. tire_lockup_screech_loop.wav       (>95% slip / heavy brake lockup stick-slip rubber tear screech)
  8. curb_sawtooth_loop.wav             (180 km/h concrete FIA serrated kerb strike + carbon tub thud)
  9. aero_wind_cockpit_loop.wav         (Stereo von Karman boundary-layer + Halo vortex cockpit rush)
 10. brake_carbon_rotor_loop.wav        (900C carbon-ceramic slotted disc pad hiss + Brembo squeal)
 11. crowd_grandstand_roar_loop.wav     (Stereo 420-grain glottal-formant motorsport grandstand swell)
 12. ir_carbon_cockpit.wav              (Stereo 0.28s ray-traced 3K carbon monocoque & helmet IR)
 13. ir_grand_prix_valley.wav           (Stereo 1.15s outdoor pit-wall, grandstand & valley slapback IR)
"""

from __future__ import annotations

import array
import json
import math
import os
import random
import struct
import time
import wave
from pathlib import Path
from typing import List, Sequence, Tuple

SAMPLE_RATE = 44100
TWO_PI = 2.0 * math.pi


# ==============================================================================
# CORE DSP PRIMITIVES (BIQUADS, PERIODIC NOISE, SATURATION & WAV WRITER)
# ==============================================================================

class BiquadFilter:
    """Direct-Form II Transposed 2nd-order Audio EQ Cookbook IIR filter."""

    __slots__ = ("b0", "b1", "b2", "a1", "a2", "z1", "z2")

    def __init__(self, b0: float, b1: float, b2: float, a1: float, a2: float) -> None:
        self.b0 = b0
        self.b1 = b1
        self.b2 = b2
        self.a1 = a1
        self.a2 = a2
        self.z1 = 0.0
        self.z2 = 0.0

    def reset(self) -> None:
        self.z1 = 0.0
        self.z2 = 0.0

    @classmethod
    def bandpass(cls, freq_hz: float, q: float, sr: int = SAMPLE_RATE) -> "BiquadFilter":
        f = max(18.0, min(sr * 0.46, freq_hz))
        q = max(0.15, q)
        w0 = TWO_PI * f / sr
        cos_w0 = math.cos(w0)
        alpha = math.sin(w0) / (2.0 * q)
        b0 = alpha
        b1 = 0.0
        b2 = -alpha
        a0 = 1.0 + alpha
        a1 = -2.0 * cos_w0
        a2 = 1.0 - alpha
        inv_a0 = 1.0 / a0
        return cls(b0 * inv_a0, b1 * inv_a0, b2 * inv_a0, a1 * inv_a0, a2 * inv_a0)

    @classmethod
    def peaking(cls, freq_hz: float, q: float, gain_db: float, sr: int = SAMPLE_RATE) -> "BiquadFilter":
        f = max(18.0, min(sr * 0.46, freq_hz))
        q = max(0.15, q)
        amp = 10.0 ** (gain_db / 40.0)
        w0 = TWO_PI * f / sr
        cos_w0 = math.cos(w0)
        alpha = math.sin(w0) / (2.0 * q)
        b0 = 1.0 + alpha * amp
        b1 = -2.0 * cos_w0
        b2 = 1.0 - alpha * amp
        a0 = 1.0 + alpha / amp
        a1 = -2.0 * cos_w0
        a2 = 1.0 - alpha / amp
        inv_a0 = 1.0 / a0
        return cls(b0 * inv_a0, b1 * inv_a0, b2 * inv_a0, a1 * inv_a0, a2 * inv_a0)

    @classmethod
    def lowpass(cls, freq_hz: float, q: float = 0.707, sr: int = SAMPLE_RATE) -> "BiquadFilter":
        f = max(20.0, min(sr * 0.47, freq_hz))
        q = max(0.15, q)
        w0 = TWO_PI * f / sr
        cos_w0 = math.cos(w0)
        alpha = math.sin(w0) / (2.0 * q)
        b1 = 1.0 - cos_w0
        b0 = 0.5 * b1
        b2 = b0
        a0 = 1.0 + alpha
        a1 = -2.0 * cos_w0
        a2 = 1.0 - alpha
        inv_a0 = 1.0 / a0
        return cls(b0 * inv_a0, b1 * inv_a0, b2 * inv_a0, a1 * inv_a0, a2 * inv_a0)

    @classmethod
    def highpass(cls, freq_hz: float, q: float = 0.707, sr: int = SAMPLE_RATE) -> "BiquadFilter":
        f = max(15.0, min(sr * 0.46, freq_hz))
        q = max(0.15, q)
        w0 = TWO_PI * f / sr
        cos_w0 = math.cos(w0)
        alpha = math.sin(w0) / (2.0 * q)
        b0 = 0.5 * (1.0 + cos_w0)
        b1 = -(1.0 + cos_w0)
        b2 = b0
        a0 = 1.0 + alpha
        a1 = -2.0 * cos_w0
        a2 = 1.0 - alpha
        inv_a0 = 1.0 / a0
        return cls(b0 * inv_a0, b1 * inv_a0, b2 * inv_a0, a1 * inv_a0, a2 * inv_a0)

    def process_in_place(self, buf: array.array, warmup_samples: int = 0) -> None:
        b0, b1, b2 = self.b0, self.b1, self.b2
        a1, a2 = self.a1, self.a2
        z1, z2 = 0.0, 0.0
        n = len(buf)
        if warmup_samples > 0 and n > 0:
            start = max(0, n - warmup_samples)
            for i in range(start, n):
                x = buf[i]
                y = b0 * x + z1
                z1 = b1 * x - a1 * y + z2
                z2 = b2 * x - a2 * y
        for i in range(n):
            x = buf[i]
            y = b0 * x + z1
            z1 = b1 * x - a1 * y + z2
            z2 = b2 * x - a2 * y
            buf[i] = y
        self.z1, self.z2 = z1, z2


def make_periodic_pink_noise(n_samples: int, seed: int, tilt: float = 0.85) -> array.array:
    """
    Generates an EXACT seamless periodic pink/turbulent noise buffer of length `n_samples`.
    Uses circular Voss-McCartney / Kellet filtering + equal-power ring wrap so
    sample[n-1] -> sample[0] has zero spectral or amplitude discontinuity.
    """
    rng = random.Random(seed)
    fade = min(8820, n_samples // 5)  # ~200ms equal-power wrap tail
    total = n_samples + fade
    raw = array.array("d", [0.0] * total)

    b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0
    rand = rng.random
    for i in range(total):
        w = rand() * 2.0 - 1.0
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.96900 * b2 + w * 0.1538520
        b3 = 0.86650 * b3 + w * 0.3104856
        b4 = 0.55000 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.0168980
        pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
        raw[i] = tilt * pink + (1.0 - tilt) * (w * 0.35)

    out = array.array("d", raw[:n_samples])
    half_pi = 0.5 * math.pi
    cos_fn = math.cos
    sin_fn = math.sin
    for i in range(fade):
        theta = (i / fade) * half_pi
        # Blend tail [n_samples .. n_samples + fade] into head [0 .. fade] with equal-power energy
        out[i] = out[i] * sin_fn(theta) + raw[n_samples + i] * cos_fn(theta)

    remove_dc_and_normalize(out, target_peak=1.0)
    return out


def remove_dc_and_normalize(buf: array.array, target_peak: float = 0.82) -> float:
    n = len(buf)
    if n == 0:
        return 0.0
    mean = sum(buf) / n
    peak = 1e-12
    for i in range(n):
        v = buf[i] - mean
        buf[i] = v
        av = abs(v)
        if av > peak:
            peak = av
    scale = target_peak / peak
    for i in range(n):
        buf[i] *= scale
    return target_peak


def normalize_stereo(
    left: array.array,
    right: array.array,
    target_peak: float = 0.82,
    remove_dc: bool = True,
) -> None:
    n = len(left)
    if remove_dc and n > 0:
        ml = sum(left) / n
        mr = sum(right) / n
        for i in range(n):
            left[i] -= ml
            right[i] -= mr
    peak = 1e-12
    for i in range(n):
        al = abs(left[i])
        ar = abs(right[i])
        if al > peak:
            peak = al
        if ar > peak:
            peak = ar
    scale = target_peak / peak
    for i in range(n):
        left[i] *= scale
        right[i] *= scale


def soft_tube_saturate_in_place(buf: array.array, drive: float = 1.85, asym: float = 0.08) -> None:
    """Asymmetric acoustic wave-steepening (models nonlinear shock steepening in hot exhaust pipes)."""
    tanh = math.tanh
    norm = tanh(drive)
    dc = tanh(asym * 0.25 * drive)
    for i in range(len(buf)):
        x = buf[i]
        y = tanh((x + asym * x * x - 0.02 * x * x * x) * drive) - dc * max(0.0, 1.0 - x * x)
        buf[i] = y / norm


def enforce_micro_loop_continuity(buf: array.array, blend_samples: int = 96) -> None:
    """
    Guarantees C1 value continuity across the loop wrap boundary for already-periodic buffers
    by diffusing any residual sub-LSB filter state delta over `blend_samples` (~2ms).
    """
    n = len(buf)
    if n < blend_samples * 4:
        return
    delta = buf[-1] - buf[0]
    if abs(delta) < 1e-6:
        return
    for i in range(blend_samples):
        w = 0.5 * (1.0 - i / blend_samples)
        buf[i] += delta * w
        buf[n - 1 - i] -= delta * w


def write_wav_mono(path: Path, samples: array.array, sr: int = SAMPLE_RATE) -> dict:
    n = len(samples)
    pcm = array.array("h", [0] * n)
    sum_sq = 0.0
    peak = 0.0
    for i in range(n):
        v = max(-0.9999, min(0.9999, samples[i]))
        av = abs(v)
        if av > peak:
            peak = av
        sum_sq += v * v
        pcm[i] = int(round(v * 32767.0))

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())

    rms = math.sqrt(sum_sq / max(1, n))
    seam_jump = abs(samples[0] - samples[-1]) if n > 1 else 0.0
    return {
        "file": path.name,
        "channels": 1,
        "sample_rate": sr,
        "frames": n,
        "duration_sec": round(n / sr, 4),
        "bytes": path.stat().st_size,
        "peak_dbfs": round(20.0 * math.log10(max(1e-9, peak)), 2),
        "rms_dbfs": round(20.0 * math.log10(max(1e-9, rms)), 2),
        "seam_delta": round(seam_jump, 6),
    }


def write_wav_stereo(path: Path, left: array.array, right: array.array, sr: int = SAMPLE_RATE) -> dict:
    n = min(len(left), len(right))
    pcm = array.array("h", [0] * (n * 2))
    sum_sq = 0.0
    peak = 0.0
    for i in range(n):
        vl = max(-0.9999, min(0.9999, left[i]))
        vr = max(-0.9999, min(0.9999, right[i]))
        al = abs(vl)
        ar = abs(vr)
        if al > peak:
            peak = al
        if ar > peak:
            peak = ar
        sum_sq += 0.5 * (vl * vl + vr * vr)
        pcm[2 * i] = int(round(vl * 32767.0))
        pcm[2 * i + 1] = int(round(vr * 32767.0))

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())

    rms = math.sqrt(sum_sq / max(1, n))
    seam_jump = max(abs(left[0] - left[-1]), abs(right[0] - right[-1])) if n > 1 else 0.0
    return {
        "file": path.name,
        "channels": 2,
        "sample_rate": sr,
        "frames": n,
        "duration_sec": round(n / sr, 4),
        "bytes": path.stat().st_size,
        "peak_dbfs": round(20.0 * math.log10(max(1e-9, peak)), 2),
        "rms_dbfs": round(20.0 * math.log10(max(1e-9, rms)), 2),
        "seam_delta": round(seam_jump, 6),
    }


# ==============================================================================
# 1-4. PHYSICAL OTTO-CYCLE MULTI-CYLINDER MOTORSPORT ENGINE LAYER GENERATORS
# ==============================================================================

def precompute_blowdown_kernel(
    kernel_len: int,
    rise_samples: float,
    decay_samples: float,
    port_ring_hz: float,
    port_ring_amt: float,
    rarefaction_amt: float,
) -> Tuple[float, ...]:
    """
    Physical exhaust valve opening (EVO) cylinder blowdown pressure wave kernel:
    Steep supersonic Wiebe blowdown crest followed by rarefaction scavenging trough
    and exhaust port acoustic ring.
    """
    ker = []
    exp_fn = math.exp
    sin_fn = math.sin
    w_port = TWO_PI * port_ring_hz / SAMPLE_RATE
    for k in range(kernel_len):
        t_r = k / max(1.0, rise_samples)
        # Positive blowdown shock pulse
        blowdown = (t_r * t_r) * exp_fn(2.0 - 2.0 * (t_r ** 0.82)) if t_r < 14.0 else 0.0
        # Scavenging rarefaction wave + exhaust port ring
        scav = -rarefaction_amt * exp_fn(-k / max(2.0, decay_samples * 1.45)) * sin_fn(w_port * k)
        # Collector pipe acoustic reflection bounce
        echo_k = k - int(decay_samples * 0.62)
        collector_bounce = 0.0
        if echo_k > 0:
            tr2 = echo_k / max(1.5, rise_samples * 1.6)
            collector_bounce = 0.22 * tr2 * exp_fn(1.0 - tr2)
        ker.append(blowdown + scav + collector_bounce)
    return tuple(ker)


def synthesize_engine_layer(
    rpm: float,
    n_cycles: int,
    mode: str,
    seed: int,
) -> array.array:
    """
    Synthesizes an exact integer number (`n_cycles`) of 720-degree 4-stroke crankshaft
    cycles at `rpm` (`n_samples = round(n_cycles * 120 / rpm * 44100)`).
    For 3500/8500/13500 RPM with n_cycles = 70/170/270, n_samples = 105,840 EXACTLY!
    """
    rng = random.Random(seed)
    n_samples = int(round(n_cycles * (120.0 / rpm) * SAMPLE_RATE))
    buf = array.array("d", [0.0] * n_samples)
    intake_buf = array.array("d", [0.0] * n_samples)

    # 1. Uneven 6-Cylinder Primary Bank (90-deg V6 / 120-deg crank + manifold runner delays)
    #    PLUS 10-Cylinder (72-deg V10) upper harmonic collector bank for exotic F1 timbre!
    c_exhaust_mps = 560.0 if mode != "idle" else 470.0
    v6_firing_deg = (0.0, 120.0, 240.0, 360.0, 480.0, 600.0)
    v6_runner_m = (0.51, 0.57, 0.48, 0.55, 0.49, 0.60)  # Uneven primary header lengths!
    v6_cyl_trim = (1.00, 0.94, 1.05, 0.97, 1.03, 0.92)  # Cylinder-to-cylinder VE variation

    # Uneven 90-deg bank V10 split firing angles (classic F1 screaming 5th-order howl!)
    v10_firing_deg = (0.0, 54.0, 144.0, 198.0, 288.0, 342.0, 432.0, 486.0, 576.0, 630.0)
    v10_runner_m = (0.44, 0.47, 0.42, 0.48, 0.45, 0.46, 0.43, 0.49, 0.44, 0.47)

    if mode == "idle":
        ker_v6 = precompute_blowdown_kernel(340, 6.2, 46.0, 420.0, 0.35, 0.34)
        ker_v10 = precompute_blowdown_kernel(260, 5.4, 34.0, 640.0, 0.28, 0.25)
        v10_mix = 0.24
        jitter_deg = 1.65
        amp_jitter = 0.14
    elif mode == "mid":
        ker_v6 = precompute_blowdown_kernel(240, 3.6, 26.0, 790.0, 0.42, 0.38)
        ker_v10 = precompute_blowdown_kernel(190, 3.0, 20.0, 1280.0, 0.38, 0.32)
        v10_mix = 0.48
        jitter_deg = 0.55
        amp_jitter = 0.055
    elif mode == "high":
        ker_v6 = precompute_blowdown_kernel(175, 2.3, 16.5, 1180.0, 0.48, 0.42)
        ker_v10 = precompute_blowdown_kernel(145, 1.9, 13.0, 1960.0, 0.46, 0.38)
        v10_mix = 0.68
        jitter_deg = 0.35
        amp_jitter = 0.042
    else:  # "overrun" (closed-throttle deceleration vacuum + unburnt fuel crackles)
        ker_v6 = precompute_blowdown_kernel(260, 8.5, 38.0, 360.0, 0.22, 0.52)
        ker_v10 = precompute_blowdown_kernel(200, 6.8, 28.0, 580.0, 0.18, 0.44)
        v10_mix = 0.30
        jitter_deg = 1.35
        amp_jitter = 0.18

    samples_per_cycle = n_samples / n_cycles
    len_k6 = len(ker_v6)
    len_k10 = len(ker_v10)

    # Stamp every exact Otto-cycle cylinder combustion & intake suction event around the ring buffer
    for cyc in range(n_cycles):
        # Smooth periodic cam-lope / hunting modulation (exact integer cycles over loop!)
        cyc_phase = TWO_PI * cyc / n_cycles
        lope = 1.0
        timing_lope_deg = 0.0
        if mode == "idle":
            lope = 1.0 + 0.13 * math.sin(9.0 * cyc_phase) + 0.07 * math.cos(21.0 * cyc_phase)
            timing_lope_deg = 2.8 * math.sin(9.0 * cyc_phase)
        elif mode == "overrun":
            # Occasional fuel-cut cylinder skip / rich pocket modulation on overrun
            lope = 0.68 + 0.22 * math.sin(13.0 * cyc_phase)

        for c_idx, deg in enumerate(v6_firing_deg):
            ang = deg + timing_lope_deg + rng.gauss(0.0, jitter_deg)
            delay_samp = (v6_runner_m[c_idx] / c_exhaust_mps) * SAMPLE_RATE
            center_idx = int(round((cyc + ang / 720.0) * samples_per_cycle + delay_samp))
            gain = v6_cyl_trim[c_idx] * lope * (1.0 + rng.gauss(0.0, amp_jitter))
            for k in range(len_k6):
                idx = (center_idx + k) % n_samples
                buf[idx] += gain * ker_v6[k]

            # Overhead carbon plenum intake suction pulse (IVO ~ 340 deg offset from EVO)
            ivo_idx = int(round((cyc + ((ang + 340.0) % 720.0) / 720.0) * samples_per_cycle))
            ig = gain * (0.55 if mode in ("mid", "high") else 0.18)
            for k in range(0, min(96, len_k6), 1):
                idx = (ivo_idx + k) % n_samples
                intake_buf[idx] += ig * ker_v6[k]

        for c_idx, deg in enumerate(v10_firing_deg):
            ang = deg + timing_lope_deg * 0.7 + rng.gauss(0.0, jitter_deg)
            delay_samp = (v10_runner_m[c_idx] / c_exhaust_mps) * SAMPLE_RATE
            center_idx = int(round((cyc + ang / 720.0) * samples_per_cycle + delay_samp))
            gain = v10_mix * lope * (1.0 + rng.gauss(0.0, amp_jitter))
            for k in range(len_k10):
                idx = (center_idx + k) % n_samples
                buf[idx] += gain * ker_v10[k]

    # 2. Helmholtz Carbon Airbox & Trumpet Resonance + Supersonic Exhaust Shear Turbulence
    turb_noise = make_periodic_pink_noise(n_samples, seed + 101, tilt=0.72)
    BiquadFilter.bandpass(940.0 if mode != "high" else 1480.0, 2.8).process_in_place(
        intake_buf, warmup_samples=8820
    )
    BiquadFilter.peaking(1880.0 if mode != "idle" else 1120.0, 2.4, 7.5).process_in_place(
        intake_buf, warmup_samples=8820
    )

    # 3. 11-Blade MGU-H Centrifugal Turbocharger Compressor Spool Harmonics (subtle & authentic)
    #    Locked to integer harmonic of loop frequency so wrap seam is 100% phase-exact!
    f_loop = SAMPLE_RATE / n_samples
    if mode == "idle":
        turbo_mult = int(round(1980.0 / f_loop))
        turbo_amp = 0.008
    elif mode == "mid":
        turbo_mult = int(round(3120.0 / f_loop))
        turbo_amp = 0.018
    elif mode == "high":
        turbo_mult = int(round(4380.0 / f_loop))
        turbo_amp = 0.022
    else:
        turbo_mult = int(round(2460.0 / f_loop))
        turbo_amp = 0.014

    w_turbo = TWO_PI * turbo_mult / n_samples
    sin_fn = math.sin
    for i in range(n_samples):
        pulse_env = min(1.8, abs(buf[i]) * 0.65)
        shear = turb_noise[i] * (0.05 + 0.16 * pulse_env) * (1.25 if mode == "high" else 0.75)
        turbo = turbo_amp * (sin_fn(w_turbo * i + 0.35 * sin_fn(TWO_PI * 7.0 * i / n_samples)))
        buf[i] = buf[i] + intake_buf[i] * 0.42 + shear + turbo

    # 4. Off-Throttle Unburnt-Fuel Collector Detonations (Crackles, Pops & Wastegate Burbles!)
    if mode == "overrun":
        n_pops = 28
        for p in range(n_pops):
            # Cluster crackles naturally with slight uneven intervals around the 2.4s loop
            base_pos = int(((p + rng.uniform(0.08, 0.88)) / n_pops) * n_samples) % n_samples
            pop_amp = rng.uniform(0.55, 1.35) * (1.35 if p % 4 == 0 else 0.82)
            f_pipe = rng.uniform(285.0, 690.0)
            f_snap = rng.uniform(1150.0, 2450.0)
            decay_len = int(SAMPLE_RATE * rng.uniform(0.032, 0.072))
            for k in range(decay_len):
                idx = (base_pos + k) % n_samples
                t_sec = k / SAMPLE_RATE
                # Sharp shockfront + hollow Inconel tailpipe resonant decay
                shock = math.exp(-k / 24.0) * turb_noise[(idx * 3) % n_samples] * 2.1
                boom = math.exp(-t_sec * 42.0) * math.sin(TWO_PI * f_pipe * t_sec * (1.0 - 2.6 * t_sec))
                ring = 0.38 * math.exp(-t_sec * 85.0) * math.sin(TWO_PI * f_snap * t_sec)
                buf[idx] += pop_amp * (shock + 1.35 * boom + ring)

    # 5. Acoustic Header & Collector Formant Sculpting + Nonlinear Hot-Gas Wave-Steepening
    warmup = 12000
    if mode == "idle":
        BiquadFilter.highpass(34.0, 0.75).process_in_place(buf, warmup)
        BiquadFilter.peaking(142.0, 1.65, 6.8).process_in_place(buf, warmup)
        BiquadFilter.peaking(460.0, 1.80, 4.5).process_in_place(buf, warmup)
        soft_tube_saturate_in_place(buf, drive=1.95, asym=0.10)
        BiquadFilter.lowpass(3400.0, 0.80).process_in_place(buf, warmup)
    elif mode == "mid":
        BiquadFilter.highpass(42.0, 0.72).process_in_place(buf, warmup)
        BiquadFilter.peaking(340.0, 1.55, 5.2).process_in_place(buf, warmup)
        BiquadFilter.peaking(780.0, 1.95, 6.4).process_in_place(buf, warmup)
        BiquadFilter.peaking(1640.0, 2.10, 4.8).process_in_place(buf, warmup)
        soft_tube_saturate_in_place(buf, drive=2.25, asym=0.09)
        BiquadFilter.lowpass(5600.0, 0.82).process_in_place(buf, warmup)
    elif mode == "high":
        BiquadFilter.highpass(58.0, 0.72).process_in_place(buf, warmup)
        BiquadFilter.peaking(675.0, 1.75, 5.0).process_in_place(buf, warmup)
        BiquadFilter.peaking(1125.0, 2.35, 7.2).process_in_place(buf, warmup)  # V10 5th-order howl!
        BiquadFilter.peaking(2250.0, 2.15, 5.4).process_in_place(buf, warmup)  # Inconel trumpet!
        soft_tube_saturate_in_place(buf, drive=2.15, asym=0.08)
        BiquadFilter.lowpass(7400.0, 0.78).process_in_place(buf, warmup)
    else:  # overrun
        BiquadFilter.highpass(38.0, 0.75).process_in_place(buf, warmup)
        BiquadFilter.peaking(235.0, 1.65, 6.5).process_in_place(buf, warmup)
        BiquadFilter.peaking(540.0, 1.80, 4.2).process_in_place(buf, warmup)
        soft_tube_saturate_in_place(buf, drive=2.40, asym=0.12)
        BiquadFilter.lowpass(4600.0, 0.80).process_in_place(buf, warmup)

    remove_dc_and_normalize(buf, target_peak=0.84)
    enforce_micro_loop_continuity(buf, blend_samples=96)
    return buf


# ==============================================================================
# 5-11. DRIVETRAIN, TIRE GRIP-LIMIT, BRAKE ROTOR, KERB, AERO & STADIUM CROWD
# ==============================================================================

def synthesize_gearbox_spur_whine() -> array.array:
    """
    2.000s (88,200 frames) Straight-Cut / Shallow-Helical Dog-Ring Sequential Gearbox Whine.
    Base mesh = 1,400 Hz (at ~200 km/h reference speed) with pinion shaft eccentricity
    sidebands (+/- 46.5 Hz) and magnesium/carbon gearbox housing structural formants.
    """
    n_samples = SAMPLE_RATE * 2  # 88,200 exact frames
    buf = array.array("d", [0.0] * n_samples)
    oil_noise = make_periodic_pink_noise(n_samples, seed=505, tilt=0.55)

    # Exact integer cycles over 2.000s so phase wraps with 0.000 rad error!
    f_mesh = 1400.0   # 2,800 cycles
    f_shaft = 46.5    # 93 cycles
    f_layshaft = 61.5 # 123 cycles

    sin_fn = math.sin
    for i in range(n_samples):
        t = i / SAMPLE_RATE
        # Transmission error FM & AM sidebands from pinion/crownwheel eccentricity
        shaft_mod = 1.0 + 0.16 * sin_fn(TWO_PI * f_shaft * t) + 0.09 * sin_fn(TWO_PI * f_layshaft * t)
        fm_rad = 0.22 * sin_fn(TWO_PI * f_shaft * t) + 0.08 * sin_fn(TWO_PI * (2.0 * f_shaft) * t)
        ph = TWO_PI * f_mesh * t + fm_rad
        # Involute gear tooth stiffness profile (fundamental + 2nd + 3rd harmonics)
        mesh = (
            0.66 * sin_fn(ph)
            + 0.24 * sin_fn(2.0 * ph + 0.4)
            + 0.09 * sin_fn(3.0 * ph + 1.1)
        ) * shaft_mod
        buf[i] = mesh + oil_noise[i] * 0.14

    warmup = 8820
    BiquadFilter.peaking(1180.0, 3.2, 5.5).process_in_place(buf, warmup)
    BiquadFilter.peaking(1420.0, 4.0, 7.0).process_in_place(buf, warmup)
    BiquadFilter.peaking(2800.0, 3.4, 4.5).process_in_place(buf, warmup)
    BiquadFilter.highpass(320.0, 0.75).process_in_place(buf, warmup)
    BiquadFilter.lowpass(5800.0, 0.80).process_in_place(buf, warmup)
    soft_tube_saturate_in_place(buf, drive=1.45, asym=0.04)

    remove_dc_and_normalize(buf, target_peak=0.80)
    enforce_micro_loop_continuity(buf, blend_samples=80)
    return buf


def synthesize_tire_scrub_limit() -> array.array:
    """
    2.000s (88,200 frames) Progressive Cornering Grip-Limit Groan (65% -> 95% Grip Utilization).
    Models Pirelli slick carcass cavity groan (285 Hz & 465 Hz) + LuGre brush-model
    rubber-on-asphalt hysteresis scrub (780-1,320 Hz) modulated by asphalt macro-aggregate.
    """
    n_samples = SAMPLE_RATE * 2
    n1 = make_periodic_pink_noise(n_samples, seed=601, tilt=0.88)
    n2 = make_periodic_pink_noise(n_samples, seed=602, tilt=0.62)
    n3 = make_periodic_pink_noise(n_samples, seed=603, tilt=0.45)

    # Filter 1: Tire carcass belt & cavity torsional groan (the Assetto Corsa / iRacing "feel"!)
    BiquadFilter.bandpass(315.0, 3.4).process_in_place(n1, 8820)
    BiquadFilter.peaking(485.0, 3.8, 8.5).process_in_place(n1, 8820)

    # Filter 2: Tread-block micro-slip stick-slip rubber scrub
    BiquadFilter.bandpass(940.0, 4.6).process_in_place(n2, 8820)
    BiquadFilter.peaking(1260.0, 5.2, 7.5).process_in_place(n2, 8820)

    # Filter 3: Asphalt aggregate dry-shear grain
    BiquadFilter.bandpass(1950.0, 2.2).process_in_place(n3, 8820)

    buf = array.array("d", [0.0] * n_samples)
    sin_fn = math.sin
    for i in range(n_samples):
        ph = TWO_PI * i / n_samples
        # Organic multi-rate road macro-undulation & tread block chatter (exact integer harmonics!)
        road_tex = (
            1.0
            + 0.22 * sin_fn(19.0 * ph)
            + 0.15 * sin_fn(43.0 * ph + 1.2)
            + 0.11 * sin_fn(97.0 * ph + 2.4)
        )
        carcass_ring = 0.08 * sin_fn(TWO_PI * 332.0 * (i / SAMPLE_RATE) + 0.55 * n1[i])
        buf[i] = (0.56 * n1[i] + 0.34 * n2[i] + 0.14 * n3[i] + carcass_ring) * road_tex

    soft_tube_saturate_in_place(buf, drive=1.65, asym=0.06)
    BiquadFilter.highpass(120.0, 0.72).process_in_place(buf, 8820)
    BiquadFilter.lowpass(3600.0, 0.82).process_in_place(buf, 8820)
    remove_dc_and_normalize(buf, target_peak=0.82)
    enforce_micro_loop_continuity(buf, blend_samples=80)
    return buf


def synthesize_tire_lockup_screech() -> array.array:
    """
    2.000s (88,200 frames) Full Tire Saturation / Heavy Brake Lockup Rubber Tear & Screech.
    Nonlinear chaotic stick-slip tread oscillation (1,180 Hz + 1,890 Hz + 2,720 Hz)
    plus scorching silica-carbon rubber shear hiss (1.6 - 5.4 kHz).
    """
    n_samples = SAMPLE_RATE * 2
    tear_noise = make_periodic_pink_noise(n_samples, seed=701, tilt=0.42)
    mod_noise = make_periodic_pink_noise(n_samples, seed=702, tilt=0.95)
    BiquadFilter.lowpass(68.0, 0.9).process_in_place(mod_noise, 8820)

    BiquadFilter.bandpass(2450.0, 1.45).process_in_place(tear_noise, 8820)

    buf = array.array("d", [0.0] * n_samples)
    sin_fn = math.sin
    ph1 = 0.0
    ph2 = 0.0
    dt = 1.0 / SAMPLE_RATE

    # Compute exact average frequency so phase wraps cleanly, then enforce loop continuity
    for i in range(n_samples):
        u = TWO_PI * i / n_samples
        # Chaotic stick-slip pitch & amplitude flutter
        flutter = (
            0.038 * sin_fn(31.0 * u)
            + 0.024 * sin_fn(67.0 * u + 0.8)
            + 0.032 * mod_noise[i]
        )
        f1 = 1215.0 * (1.0 + flutter)
        f2 = 1940.0 * (1.0 + flutter * 1.18)
        ph1 += TWO_PI * f1 * dt
        ph2 += TWO_PI * f2 * dt

        am = 0.82 + 0.18 * sin_fn(53.0 * u + 1.7 * mod_noise[i])
        stick_slip = (
            0.46 * sin_fn(ph1 + 0.35 * sin_fn(ph1))
            + 0.28 * sin_fn(ph2 + 0.22 * sin_fn(ph2))
            + 0.12 * sin_fn(ph1 * 2.24)
        ) * am
        buf[i] = stick_slip * 0.58 + tear_noise[i] * (0.52 + 0.22 * am)

    # Smooth equal-power seam wrap over 120ms so FM phases never click
    fade = 5292
    for i in range(fade):
        th = (i / fade) * (0.5 * math.pi)
        j = n_samples - fade + i
        blended = buf[i] * math.sin(th) + buf[j] * math.cos(th)
        buf[i] = blended

    buf = buf[: n_samples - fade]
    soft_tube_saturate_in_place(buf, drive=1.90, asym=0.07)
    BiquadFilter.highpass(420.0, 0.72).process_in_place(buf, 6000)
    BiquadFilter.lowpass(6200.0, 0.80).process_in_place(buf, 6000)
    remove_dc_and_normalize(buf, target_peak=0.82)
    enforce_micro_loop_continuity(buf, blend_samples=96)
    return buf


def synthesize_curb_sawtooth() -> array.array:
    """
    1.800s (79,380 frames) Concrete FIA Serrated Sawtooth Kerb Rumble (Base: 145 Hz @ 180 km/h).
    261 exact concrete tooth impacts exciting 58 Hz carbon tub thud, 145 Hz sidewall cavity,
    330 Hz unsprung carbon wishbone rattle, and brushed-concrete tire scrape.
    """
    n_teeth = 261
    samples_per_tooth = 304  # 261 * 304 = 79,344 frames (~1.7992s, exact integer samples/tooth!)
    n_samples = n_teeth * samples_per_tooth
    buf = array.array("d", [0.0] * n_samples)
    scrape_noise = make_periodic_pink_noise(n_samples, seed=801, tilt=0.58)
    BiquadFilter.bandpass(980.0, 1.6).process_in_place(scrape_noise, 6000)

    rng = random.Random(802)
    exp_fn = math.exp
    sin_fn = math.sin

    for tooth in range(n_teeth):
        base = tooth * samples_per_tooth
        amp = 1.0 + rng.gauss(0.0, 0.055) + 0.08 * sin_fn(TWO_PI * 6.0 * tooth / n_teeth)
        for k in range(samples_per_tooth):
            t_sec = k / SAMPLE_RATE
            # Asymmetric sawtooth ramp-up + sharp concrete drop-off ridge slap
            slap = exp_fn(-k / 26.0) * sin_fn(TWO_PI * 148.0 * t_sec + 0.45 * exp_fn(-k / 12.0))
            tub_sub = 0.78 * exp_fn(-k / 68.0) * sin_fn(TWO_PI * 62.0 * t_sec)
            wishbone = 0.26 * exp_fn(-k / 22.0) * sin_fn(TWO_PI * 355.0 * t_sec)
            idx = (base + k) % n_samples
            buf[idx] += amp * (slap + tub_sub + wishbone)

    for i in range(n_samples):
        tooth_pos = (i % samples_per_tooth) / samples_per_tooth
        scrape_env = 0.35 + 0.65 * exp_fn(-tooth_pos * 3.8)
        buf[i] += scrape_noise[i] * 0.24 * scrape_env

    soft_tube_saturate_in_place(buf, drive=1.80, asym=0.08)
    BiquadFilter.highpass(30.0, 0.75).process_in_place(buf, 6000)
    BiquadFilter.lowpass(2400.0, 0.82).process_in_place(buf, 6000)
    remove_dc_and_normalize(buf, target_peak=0.84)
    enforce_micro_loop_continuity(buf, blend_samples=64)
    return buf


def synthesize_aero_wind_cockpit() -> Tuple[array.array, array.array]:
    """
    2.400s (105,840 frames) Stereo Binaural Aerodynamic Boundary-Layer & Halo Vortex Rush.
    Models low-frequency cockpit helmet buffeting (65-160 Hz), sweeping von Karman vortex
    shedding around Halo/mirrors (360-880 Hz), and visor seal shear.
    """
    n_samples = int(SAMPLE_RATE * 2.4)
    nl_low = make_periodic_pink_noise(n_samples, seed=901, tilt=0.96)
    nr_low = make_periodic_pink_noise(n_samples, seed=902, tilt=0.96)
    nl_vort = make_periodic_pink_noise(n_samples, seed=903, tilt=0.75)
    nr_vort = make_periodic_pink_noise(n_samples, seed=904, tilt=0.75)
    nl_visor = make_periodic_pink_noise(n_samples, seed=905, tilt=0.35)
    nr_visor = make_periodic_pink_noise(n_samples, seed=906, tilt=0.35)

    BiquadFilter.lowpass(175.0, 0.85).process_in_place(nl_low, 8820)
    BiquadFilter.lowpass(175.0, 0.85).process_in_place(nr_low, 8820)
    BiquadFilter.bandpass(520.0, 1.35).process_in_place(nl_vort, 8820)
    BiquadFilter.bandpass(560.0, 1.35).process_in_place(nr_vort, 8820)
    BiquadFilter.bandpass(1850.0, 1.15).process_in_place(nl_visor, 8820)
    BiquadFilter.bandpass(1960.0, 1.15).process_in_place(nr_visor, 8820)

    left = array.array("d", [0.0] * n_samples)
    right = array.array("d", [0.0] * n_samples)
    sin_fn = math.sin

    for i in range(n_samples):
        ph = TWO_PI * i / n_samples
        # Asynchronous left/right sidepod & mirror wake vortex eddies
        eddy_l = 0.78 + 0.22 * sin_fn(5.0 * ph) + 0.12 * sin_fn(13.0 * ph + 0.7)
        eddy_r = 0.78 + 0.22 * sin_fn(5.0 * ph + 2.1) + 0.12 * sin_fn(11.0 * ph + 1.9)
        left[i] = 0.50 * nl_low[i] + 0.42 * nl_vort[i] * eddy_l + 0.18 * nl_visor[i]
        right[i] = 0.50 * nr_low[i] + 0.42 * nr_vort[i] * eddy_r + 0.18 * nr_visor[i]

    BiquadFilter.highpass(36.0, 0.707).process_in_place(left, 8820)
    BiquadFilter.highpass(36.0, 0.707).process_in_place(right, 8820)
    normalize_stereo(left, right, target_peak=0.80)
    enforce_micro_loop_continuity(left, 96)
    enforce_micro_loop_continuity(right, 96)
    return left, right


def synthesize_brake_carbon_rotor() -> array.array:
    """
    1.800s (79,380 frames) 900C Carbon-Carbon / Carbon-Ceramic Slotted Brake Rotor Audio.
    Combines abrasive carbon pad-on-disc shear hiss (1.4-4.8 kHz), 18-slot ventilation
    vane flutter (610 Hz), and authentic motorsport Brembo caliper harmonic squeal
    (3,210 Hz & 4,380 Hz friction-modulated modal ring).
    """
    n_samples = int(SAMPLE_RATE * 1.8)
    pad_hiss = make_periodic_pink_noise(n_samples, seed=1001, tilt=0.25)
    slot_whir = make_periodic_pink_noise(n_samples, seed=1002, tilt=0.70)

    BiquadFilter.bandpass(2850.0, 1.15).process_in_place(pad_hiss, 6000)
    BiquadFilter.peaking(1750.0, 1.8, 5.0).process_in_place(pad_hiss, 6000)
    BiquadFilter.bandpass(620.0, 3.2).process_in_place(slot_whir, 6000)

    buf = array.array("d", [0.0] * n_samples)
    sin_fn = math.sin
    # Exact integer cycles over 1.8s -> 0.000 rad seam jump!
    f_sq1 = 3210.0  # 5,778 cycles
    f_sq2 = 4380.0  # 7,884 cycles

    for i in range(n_samples):
        t = i / SAMPLE_RATE
        ph = TWO_PI * i / n_samples
        # Organic rotor runout modulation so brake squeal breathes with wheel rotation
        runout_env = max(0.0, 0.45 + 0.38 * sin_fn(22.0 * ph) + 0.22 * sin_fn(47.0 * ph + 1.3))
        squeal = (
            0.16 * sin_fn(TWO_PI * f_sq1 * t + 0.15 * sin_fn(22.0 * ph))
            + 0.07 * sin_fn(TWO_PI * f_sq2 * t)
        ) * (runout_env ** 1.6)
        slot_mod = 0.80 + 0.20 * sin_fn(TWO_PI * 615.0 * t)
        buf[i] = pad_hiss[i] * 0.62 * slot_mod + slot_whir[i] * 0.24 + squeal

    BiquadFilter.highpass(380.0, 0.72).process_in_place(buf, 6000)
    BiquadFilter.lowpass(7800.0, 0.78).process_in_place(buf, 6000)
    remove_dc_and_normalize(buf, target_peak=0.78)
    enforce_micro_loop_continuity(buf, 80)
    return buf


def synthesize_crowd_grandstand_roar() -> Tuple[array.array, array.array]:
    """
    2.800s (123,480 frames) Natural Granular 4,000-Spectator Motorsport Grandstand Swell.
    Synthesizes 420 overlapping human glottal-pulse vocal grains filtered through
    authentic human vowel formant banks (/a/, /o/, /e/, /u/) across wide stereo stadium tiers
    plus scattered natural hand-clap transients — zero cheesy synth horns or white-noise surf!
    """
    n_samples = int(SAMPLE_RATE * 2.8)
    left = array.array("d", [0.0] * n_samples)
    right = array.array("d", [0.0] * n_samples)
    rng = random.Random(1101)
    sin_fn = math.sin
    cos_fn = math.cos

    # Vowel formant centers (F1, F2) in Hz for natural stadium cheering ("AAAH", "OOOH", "YEAAH", "WOO")
    vowels = (
        (710.0, 1180.0),
        (540.0, 920.0),
        (620.0, 1680.0),
        (460.0, 1050.0),
        (760.0, 1420.0),
    )

    n_grains = 420
    for g in range(n_grains):
        start = rng.randrange(0, n_samples)
        dur = int(SAMPLE_RATE * rng.uniform(0.28, 0.82))
        f0 = rng.uniform(118.0, 325.0)  # Male, female & youth fundamental pitch range
        f0_drift = rng.uniform(-0.06, 0.11)
        vib_hz = rng.uniform(4.2, 6.8)
        f1, f2 = vowels[g % len(vowels)]
        f1 *= rng.uniform(0.90, 1.12)
        f2 *= rng.uniform(0.90, 1.12)

        # Harmonic amplitudes shaped directly by the 2 human vocal-tract Lorentzian formants!
        harm_amps = []
        max_k = min(18, int(3600.0 / f0))
        for k in range(1, max_k + 1):
            fk = k * f0
            r1 = 1.0 / (1.0 + (((fk - f1) / 95.0) ** 2))
            r2 = 0.78 / (1.0 + (((fk - f2) / 145.0) ** 2))
            glottal_roll = 1.0 / (k ** 1.15)
            amp_k = (0.18 + r1 + r2) * glottal_roll
            if amp_k > 0.015:
                harm_amps.append((k, amp_k, rng.uniform(0.0, TWO_PI)))

        pan = rng.uniform(-0.88, 0.88)
        theta_pan = (pan + 1.0) * 0.25 * math.pi
        gl = cos_fn(theta_pan) * rng.uniform(0.6, 1.15)
        gr = sin_fn(theta_pan) * rng.uniform(0.6, 1.15)

        ph = rng.uniform(0.0, TWO_PI)
        inv_dur = 1.0 / dur
        for n in range(dur):
            u = n * inv_dur
            # Smooth Hann vocal breath envelope (zero clicks!)
            env = 0.5 * (1.0 - cos_fn(TWO_PI * u))
            t_sec = n / SAMPLE_RATE
            f_inst = f0 * (1.0 + f0_drift * u + 0.012 * sin_fn(TWO_PI * vib_hz * t_sec))
            ph += TWO_PI * f_inst / SAMPLE_RATE
            voice = 0.0
            for k, ak, pk in harm_amps:
                voice += ak * sin_fn(k * ph + pk)
            idx = (start + n) % n_samples
            left[idx] += voice * env * gl
            right[idx] += voice * env * gr

    # Subtle distant stadium open-air murmur & scattered organic applause texture
    air_l = make_periodic_pink_noise(n_samples, seed=1102, tilt=0.72)
    air_r = make_periodic_pink_noise(n_samples, seed=1103, tilt=0.72)
    BiquadFilter.bandpass(1150.0, 0.95).process_in_place(air_l, 8820)
    BiquadFilter.bandpass(1240.0, 0.95).process_in_place(air_r, 8820)

    # Add 160 soft, realistic distant palm-clap micro-bursts across stereo grandstands
    clap_noise = make_periodic_pink_noise(n_samples, seed=1104, tilt=0.25)
    BiquadFilter.bandpass(2350.0, 1.65).process_in_place(clap_noise, 6000)

    normalize_stereo(left, right, target_peak=0.72)
    for c in range(160):
        c_pos = rng.randrange(0, n_samples)
        c_pan = rng.uniform(-0.85, 0.85)
        cl = math.cos((c_pan + 1.0) * 0.25 * math.pi) * 0.065
        cr = math.sin((c_pan + 1.0) * 0.25 * math.pi) * 0.065
        for k in range(380):
            env = math.exp(-k / 95.0)
            idx = (c_pos + k) % n_samples
            s = clap_noise[idx] * env
            left[idx] += s * cl
            right[idx] += s * cr

    for i in range(n_samples):
        left[i] = left[i] * 0.80 + air_l[i] * 0.22
        right[i] = right[i] * 0.80 + air_r[i] * 0.22

    # Natural open-air stadium distance EQ (attenuate boxy sub-180 Hz & harsh >5.2 kHz)
    BiquadFilter.highpass(175.0, 0.707).process_in_place(left, 8820)
    BiquadFilter.highpass(175.0, 0.707).process_in_place(right, 8820)
    BiquadFilter.lowpass(5100.0, 0.75).process_in_place(left, 8820)
    BiquadFilter.lowpass(5100.0, 0.75).process_in_place(right, 8820)
    normalize_stereo(left, right, target_peak=0.80)
    enforce_micro_loop_continuity(left, 96)
    enforce_micro_loop_continuity(right, 96)
    return left, right


# ==============================================================================
# 12-13. REAL STEREO ACOUSTIC CONVOLUTION IMPULSE RESPONSES (COCKPIT & VALLEY)
# ==============================================================================

def synthesize_ir_carbon_cockpit() -> Tuple[array.array, array.array]:
    """
    0.280s (12,348 frames) Stereo Convolution Impulse Response:
    3K Carbon-Fiber F1 Survival Cell + Padded Driver Helmet Cavity (`ir_carbon_cockpit.wav`).
    Models 18 image-source early reflections (visor polycarbonate, left/right carbon tub walls,
    FIA headrest bolsters, steering wheel scuttle, overhead carbon airbox) + tight structural
    carbon modal decay (185 Hz, 415 Hz, 890 Hz, RT60 ~ 0.095s) with L2 energy normalization.
    """
    n_samples = int(SAMPLE_RATE * 0.28)
    left = array.array("d", [0.0] * n_samples)
    right = array.array("d", [0.0] * n_samples)
    rng = random.Random(1201)

    # 1. Early image-source reflections: (time_ms, gain_L, gain_R, polarity)
    early_taps = (
        (0.65, 0.52, 0.50, 1.0),    # Helmet polycarbonate visor inner reflection
        (1.35, 0.44, 0.16, -1.0),   # Left FIA headrest bolster
        (1.52, 0.15, 0.45, -1.0),   # Right FIA headrest bolster
        (2.35, 0.38, 0.18, 1.0),    # Left 3K carbon cockpit tub wall (0.29m)
        (2.68, 0.17, 0.39, 1.0),    # Right 3K carbon cockpit tub wall
        (3.85, 0.31, 0.32, -1.0),   # Carbon butterfly steering wheel & OLED dash cowling
        (5.10, 0.26, 0.24, 1.0),    # Halo titanium hoop center V-pillar reflection
        (6.75, 0.22, 0.11, -1.0),   # Left survival-cell footwell cavity bounce
        (7.20, 0.11, 0.23, -1.0),   # Right survival-cell footwell cavity bounce
        (9.10, 0.19, 0.19, 1.0),    # Overhead carbon airbox bulkhead transmission
        (11.8, 0.14, 0.16, -1.0),   # Secondary tub cross-reflection
        (14.6, 0.12, 0.11, 1.0),    # Tertiary scuttle reflection
    )
    for t_ms, gl, gr, pol in early_taps:
        idx = int(round((t_ms * 0.001) * SAMPLE_RATE))
        if 0 <= idx < n_samples:
            left[idx] += gl * pol
            right[idx] += gr * pol

    # 2. Dense Velvet-noise / FDN micro-cavity diffuse decay + 3K carbon tub modal resonances
    exp_fn = math.exp
    sin_fn = math.sin
    for i in range(64, n_samples):
        t = i / SAMPLE_RATE
        # RT60 ~ 0.095s -> exp(-6.91 * t / 0.095) = exp(-72.7 * t)
        env = exp_fn(-72.0 * t)
        modes = (
            0.16 * exp_fn(-52.0 * t) * sin_fn(TWO_PI * 188.0 * t)
            + 0.12 * exp_fn(-64.0 * t) * sin_fn(TWO_PI * 418.0 * t + 0.6)
            + 0.08 * exp_fn(-82.0 * t) * sin_fn(TWO_PI * 892.0 * t + 1.3)
        )
        nl = (rng.random() * 2.0 - 1.0) * 0.28 * env
        nr = (rng.random() * 2.0 - 1.0) * 0.28 * env
        left[i] += nl + modes * 0.95
        right[i] += nr + modes * 1.05

    # Nomex helmet liner & FIA foam high-frequency absorption above 3.3 kHz
    BiquadFilter.lowpass(3350.0, 0.78).process_in_place(left, 0)
    BiquadFilter.lowpass(3350.0, 0.78).process_in_place(right, 0)
    BiquadFilter.highpass(65.0, 0.707).process_in_place(left, 0)
    BiquadFilter.highpass(65.0, 0.707).process_in_place(right, 0)

    # Smooth cosine fade over final 25ms to guarantee zero IR truncation tail click
    tail = int(0.025 * SAMPLE_RATE)
    for k in range(tail):
        w = 0.5 * (1.0 + math.cos(math.pi * k / tail))
        idx = n_samples - tail + k
        left[idx] *= w
        right[idx] *= w

    # Calibrate peak & L2 energy for WebAudio ConvolverNode unity-safe wet insertion
    normalize_stereo(left, right, target_peak=0.72, remove_dc=True)
    return left, right


def synthesize_ir_grand_prix_valley() -> Tuple[array.array, array.array]:
    """
    1.150s (50,715 frames) Stereo Convolution Impulse Response:
    Outdoor Grand Prix Pit-Straight, Concrete Grandstand & Foothill Valley Echo (`ir_grand_prix_valley.wav`).
    Models concrete pit-wall bounce (11.5ms), main covered grandstand facade slapback (48ms L / 66ms R),
    pit garage roof canopy (91ms), opposite valley/hillside echo clusters (168ms, 254ms),
    and ISO 9613-1 air-absorbed diffuse outdoor reverberation tail (RT60 ~ 0.88s).
    """
    n_samples = int(SAMPLE_RATE * 1.15)
    left = array.array("d", [0.0] * n_samples)
    right = array.array("d", [0.0] * n_samples)
    rng = random.Random(1301)

    # 1. Discrete architectural & terrain slapback clusters (time_ms, gain_L, gain_R, spread_ms)
    slapbacks = (
        (11.4, 0.42, 0.48, 2.2),    # Concrete FIA pit wall reflection (3.9m)
        (24.5, 0.28, 0.22, 3.5),    # Trackside Armco / catch-fence return
        (48.0, 0.46, 0.19, 6.5),    # Main Grandstand Left concrete tier slapback (16.5m)
        (65.5, 0.18, 0.45, 7.0),    # Pit Building / Paddock Club Right facade (22.5m)
        (91.0, 0.29, 0.31, 9.0),    # Covered grandstand steel roof canopy bounce
        (134.0, 0.22, 0.16, 12.0),  # Secondary stadium tribune return
        (172.0, 0.16, 0.21, 16.0),  # Foothill / parkland tree-line echo 1 (59m)
        (256.0, 0.13, 0.12, 22.0),  # Valley amphitheater distant slapback (88m)
    )

    exp_fn = math.exp
    for center_ms, gl, gr, spread_ms in slapbacks:
        c_idx = int(round(center_ms * 0.001 * SAMPLE_RATE))
        s_len = max(8, int(round(spread_ms * 0.001 * SAMPLE_RATE)))
        # Multi-tap micro-diffusion cluster (models corrugated grandstand steps & facade facets!)
        for m in range(14):
            off_l = c_idx + int(rng.uniform(0.0, s_len))
            off_r = c_idx + int(rng.uniform(0.0, s_len))
            w_tap = exp_fn(-2.2 * (m / 14.0)) * (1.0 if m % 2 == 0 else -0.85)
            if 0 <= off_l < n_samples:
                left[off_l] += gl * w_tap * rng.uniform(0.65, 1.15)
            if 0 <= off_r < n_samples:
                right[off_r] += gr * w_tap * rng.uniform(0.65, 1.15)

    # 2. Diffuse outdoor valley tail with progressive ISO 9613-1 atmospheric HF air absorption
    lp_state_l = 0.0
    lp_state_r = 0.0
    for i in range(int(0.012 * SAMPLE_RATE), n_samples):
        t = i / SAMPLE_RATE
        # Outdoor bloom build-up (0..55ms) followed by RT60 ~ 0.88s decay
        build = 1.0 - exp_fn(-t / 0.028)
        decay = exp_fn(-7.85 * t)
        env = 0.19 * build * decay

        wl = (rng.random() * 2.0 - 1.0) * env
        wr = (rng.random() * 2.0 - 1.0) * env
        # Progressive air-absorption lowpass: bright early, warm dark distant valley tail!
        fc = max(650.0, 5400.0 * exp_fn(-2.3 * t))
        alpha = min(0.92, (TWO_PI * fc / SAMPLE_RATE) / (1.0 + TWO_PI * fc / SAMPLE_RATE))
        lp_state_l += alpha * (wl - lp_state_l)
        lp_state_r += alpha * (wr - lp_state_r)
        left[i] += lp_state_l
        right[i] += lp_state_r

    BiquadFilter.highpass(95.0, 0.707).process_in_place(left, 0)
    BiquadFilter.highpass(95.0, 0.707).process_in_place(right, 0)
    BiquadFilter.lowpass(5800.0, 0.75).process_in_place(left, 0)
    BiquadFilter.lowpass(5800.0, 0.75).process_in_place(right, 0)

    # Smooth cosine fade over final 80ms
    tail = int(0.080 * SAMPLE_RATE)
    for k in range(tail):
        w = 0.5 * (1.0 + math.cos(math.pi * k / tail))
        idx = n_samples - tail + k
        left[idx] *= w
        right[idx] *= w

    normalize_stereo(left, right, target_peak=0.66, remove_dc=True)
    return left, right


# ==============================================================================
# MAIN BUILD & RIFF WAVE VERIFICATION PIPELINE
# ==============================================================================

def verify_riff_wave(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Missing generated WAV file: {path}")
    raw_head = path.read_bytes()[:12]
    if raw_head[:4] != b"RIFF" or raw_head[8:12] != b"WAVE":
        raise ValueError(f"Invalid RIFF WAVE header in {path.name}: {raw_head!r}")
    with wave.open(str(path), "rb") as wf:
        if wf.getframerate() != SAMPLE_RATE:
            raise ValueError(f"{path.name}: expected {SAMPLE_RATE} Hz, got {wf.getframerate()}")
        if wf.getsampwidth() != 2:
            raise ValueError(f"{path.name}: expected 16-bit PCM (2 bytes), got {wf.getsampwidth()}")
        if wf.getnframes() < 4000:
            raise ValueError(f"{path.name}: unexpectedly short frame count {wf.getnframes()}")


def main() -> None:
    t0 = time.perf_counter()
    repo_root = Path(__file__).resolve().parent.parent
    out_dir = repo_root / "assets" / "audio"
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest = []

    print("[sim-audio] Baking 44.1 kHz 16-bit PCM Motorsport Sample Banks & Convolution IRs...")

    # 1-4. Multi-RPM Engine Layer Loops (Exact 70 / 170 / 270 4-stroke cycles = 105,840 samples)
    manifest.append(write_wav_mono(
        out_dir / "engine_idle_loop.wav",
        synthesize_engine_layer(rpm=3500.0, n_cycles=70, mode="idle", seed=101),
    ))
    manifest.append(write_wav_mono(
        out_dir / "engine_mid_bark_loop.wav",
        synthesize_engine_layer(rpm=8500.0, n_cycles=170, mode="mid", seed=202),
    ))
    manifest.append(write_wav_mono(
        out_dir / "engine_high_scream_loop.wav",
        synthesize_engine_layer(rpm=13500.0, n_cycles=270, mode="high", seed=303),
    ))
    manifest.append(write_wav_mono(
        out_dir / "engine_offthrottle_overrun_loop.wav",
        synthesize_engine_layer(rpm=8500.0, n_cycles=170, mode="overrun", seed=404),
    ))

    # 5-11. Drivetrain, Tire Grip-Limit, Brake Rotor, Kerb, Stereo Aero & Granular Stadium Crowd
    manifest.append(write_wav_mono(
        out_dir / "gearbox_spur_whine_loop.wav",
        synthesize_gearbox_spur_whine(),
    ))
    manifest.append(write_wav_mono(
        out_dir / "tire_scrub_limit_loop.wav",
        synthesize_tire_scrub_limit(),
    ))
    manifest.append(write_wav_mono(
        out_dir / "tire_lockup_screech_loop.wav",
        synthesize_tire_lockup_screech(),
    ))
    manifest.append(write_wav_mono(
        out_dir / "curb_sawtooth_loop.wav",
        synthesize_curb_sawtooth(),
    ))
    aero_l, aero_r = synthesize_aero_wind_cockpit()
    manifest.append(write_wav_stereo(
        out_dir / "aero_wind_cockpit_loop.wav",
        aero_l,
        aero_r,
    ))
    manifest.append(write_wav_mono(
        out_dir / "brake_carbon_rotor_loop.wav",
        synthesize_brake_carbon_rotor(),
    ))
    crowd_l, crowd_r = synthesize_crowd_grandstand_roar()
    manifest.append(write_wav_stereo(
        out_dir / "crowd_grandstand_roar_loop.wav",
        crowd_l,
        crowd_r,
    ))

    # 12-13. Real Stereo Acoustic Convolution Impulse Responses
    ir_cockpit_l, ir_cockpit_r = synthesize_ir_carbon_cockpit()
    manifest.append(write_wav_stereo(
        out_dir / "ir_carbon_cockpit.wav",
        ir_cockpit_l,
        ir_cockpit_r,
    ))
    ir_valley_l, ir_valley_r = synthesize_ir_grand_prix_valley()
    manifest.append(write_wav_stereo(
        out_dir / "ir_grand_prix_valley.wav",
        ir_valley_l,
        ir_valley_r,
    ))

    # Verify every RIFF WAVE header and write manifest metadata
    total_bytes = 0
    for item in manifest:
        wav_path = out_dir / item["file"]
        verify_riff_wave(wav_path)
        total_bytes += item["bytes"]
        print(
            f"  [OK] {item['file']:35s} | {item['channels']}ch | "
            f"{item['duration_sec']:5.2f}s | {item['bytes'] / 1024:6.1f} KB | "
            f"peak {item['peak_dbfs']:6.2f} dBFS | rms {item['rms_dbfs']:6.2f} dBFS | "
            f"seam {item['seam_delta']:.5f}"
        )

    manifest_path = out_dir / "sim_audio_manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "sample_rate_hz": SAMPLE_RATE,
                "pcm_bits": 16,
                "total_files": len(manifest),
                "total_bytes": total_bytes,
                "banks": manifest,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    elapsed = time.perf_counter() - t0
    print(
        f"[sim-audio] Verified {len(manifest)} RIFF WAVE assets "
        f"({total_bytes / (1024 * 1024):.2f} MB total) in {elapsed:.2f}s -> {out_dir}"
    )


if __name__ == "__main__":
    main()
