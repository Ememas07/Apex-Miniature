#!/usr/bin/env python3
"""
scripts/fitSoundFromVideo.py

Standalone CLI tool to analyze racing audio clips (.mp4 / .wav), track acoustic spectrum
and RPM contour, and fit an Apex Miniature audioEngine.ts acoustic preset using
differential evolution (scipy.optimize.differential_evolution).

Outputs a ready-to-paste JSON preset matching the exact schema used by:
  - src/three/audioEngine.ts
  - src/components/SoundEditorModal.tsx
  - src/game/audio.ts

Usage:
  python3 scripts/fitSoundFromVideo.py path/to/clip.mp4 --cylinders 8 --idle 1100 --redline 8800 --out preset.json
"""

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import numpy as np
import scipy.signal
import scipy.optimize
import scipy.io.wavfile


SAMPLE_RATE = 44100


def check_ffmpeg() -> str:
    """Finds ffmpeg binary or raises descriptive error."""
    path = shutil.which("ffmpeg")
    if not path:
        # Check common Windows locations
        for candidate in ["C:\\Windows\\ffmpeg.exe", "ffmpeg.exe", "ffmpeg"]:
            if os.path.exists(candidate):
                return candidate
        raise RuntimeError("ffmpeg executable not found on PATH or in system directory.")
    return path


def extract_audio_pcm(input_file: str, start: float | None = None, duration: float = 2.5) -> tuple[np.ndarray, float]:
    """
    Extracts 44100 Hz mono PCM from video or audio file using ffmpeg (or direct wav loading).
    Returns (audio_samples_float32, actual_start_sec).
    """
    # Fast path: direct wav reading when already uncompressed PCM
    if input_file.lower().endswith(".wav"):
        try:
            sr, data = scipy.io.wavfile.read(input_file)
            if data.ndim > 1:
                data = np.mean(data, axis=1)
            if data.dtype == np.int16:
                full_audio = data.astype(np.float32) / 32768.0
            else:
                full_audio = data.astype(np.float32)

            if sr == SAMPLE_RATE:
                win_samples = int(duration * SAMPLE_RATE)
                if start is not None:
                    start_idx = int(start * SAMPLE_RATE)
                    chunk = full_audio[start_idx : start_idx + win_samples]
                    return chunk, start

                if len(full_audio) <= win_samples:
                    return full_audio, 0.0

                step_samples = int(0.25 * SAMPLE_RATE)
                best_start_idx = 0
                best_score = -1e9
                for idx in range(0, len(full_audio) - win_samples, step_samples):
                    chunk = full_audio[idx : idx + win_samples]
                    rms = np.sqrt(np.mean(chunk**2))
                    if rms < 0.01:
                        continue
                    fft = np.abs(np.fft.rfft(chunk[:4096]))
                    peak_ratio = np.max(fft) / (np.mean(fft) + 1e-6)
                    score = rms * 0.4 + peak_ratio * 0.6
                    if score > best_score:
                        best_score = score
                        best_start_idx = idx

                best_start_sec = best_start_idx / SAMPLE_RATE
                return full_audio[best_start_idx : best_start_idx + win_samples], best_start_sec
        except Exception:
            pass

    ffmpeg_bin = check_ffmpeg()

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_wav = os.path.join(tmp_dir, "extracted.wav")

        if start is not None:
            # Extract target segment directly
            cmd = [
                ffmpeg_bin,
                "-nostdin",
                "-y",
                "-v", "error",
                "-ss", str(max(0.0, start)),
                "-t", str(max(0.5, duration)),
                "-i", input_file,
                "-vn",
                "-ar", str(SAMPLE_RATE),
                "-ac", "1",
                "-c:a", "pcm_s16le",
                tmp_wav,
            ]
            res = subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if res.returncode != 0:
                raise RuntimeError(f"ffmpeg extraction failed: {res.stderr.decode('utf-8', errors='ignore')}")

            sr, data = scipy.io.wavfile.read(tmp_wav)
            if data.dtype == np.int16:
                audio = data.astype(np.float32) / 32768.0
            else:
                audio = data.astype(np.float32)
            return audio, start

        # Auto-select the cleanest high-harmonic 2.5s window
        # First extract up to 35 seconds to scan
        cmd = [
            ffmpeg_bin,
            "-nostdin",
            "-y",
            "-v", "error",
            "-t", "35.0",
            "-i", input_file,
            "-vn",
            "-ar", str(SAMPLE_RATE),
            "-ac", "1",
            "-c:a", "pcm_s16le",
            tmp_wav,
        ]
        res = subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if res.returncode != 0:
            raise RuntimeError(f"ffmpeg extraction failed: {res.stderr.decode('utf-8', errors='ignore')}")

        sr, data = scipy.io.wavfile.read(tmp_wav)
        if data.dtype == np.int16:
            full_audio = data.astype(np.float32) / 32768.0
        else:
            full_audio = data.astype(np.float32)

        win_samples = int(duration * SAMPLE_RATE)
        if len(full_audio) <= win_samples:
            return full_audio, 0.0

        # Slide window in 0.25s steps to find highest harmonic energy & cleanest peak structure
        step_samples = int(0.25 * SAMPLE_RATE)
        best_start_idx = 0
        best_score = -1e9

        for idx in range(0, len(full_audio) - win_samples, step_samples):
            chunk = full_audio[idx : idx + win_samples]
            rms = np.sqrt(np.mean(chunk**2))
            if rms < 0.01:
                continue

            # Compute spectral energy in engine fundamental/harmonic band (80 Hz - 4000 Hz)
            fft = np.abs(np.fft.rfft(chunk[:4096]))
            freqs = np.fft.rfftfreq(4096, 1.0 / SAMPLE_RATE)
            band = (freqs >= 80) & (freqs <= 4000)
            band_fft = fft[band]

            if len(band_fft) == 0:
                continue

            # Score by spectral peakiness (harmonic definition vs noise floor)
            peak_ratio = np.max(band_fft) / (np.mean(band_fft) + 1e-6)
            score = rms * 0.4 + peak_ratio * 0.6
            if score > best_score:
                best_score = score
                best_start_idx = idx

        best_start_sec = best_start_idx / SAMPLE_RATE
        selected_chunk = full_audio[best_start_idx : best_start_idx + win_samples]
        return selected_chunk, best_start_sec


def track_rpm_and_throttle(
    audio: np.ndarray,
    cylinders: int,
    idle_rpm: float,
    redline_rpm: float,
    sr: int = SAMPLE_RATE,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Estimates time-varying firing frequency f_fire(t), converts to rpm(t) and rpmNorm(t),
    and infers throttleLoad(t) from energy envelope and spectral flux.
    Returns (rpm_norm, throttle_load, rpm_raw).
    """
    # 4-stroke engine firing frequency: f_fire = (rpm / 60) * (cylinders / 2) = (rpm * cylinders) / 120
    min_firing_hz = max(35.0, (idle_rpm * cylinders / 120.0) * 0.65)
    max_firing_hz = min(1200.0, (redline_rpm * cylinders / 120.0) * 1.08)

    n_fft = 4096
    hop = 512
    f, t, zxx = scipy.signal.stft(audio, fs=sr, nperseg=n_fft, noverlap=n_fft - hop, boundary=None)
    mag = np.abs(zxx)

    # Harmonic Product Spectrum (order 3) to accurately capture fundamental firing pitch
    n_frames = mag.shape[1]
    f_fire_track = np.zeros(n_frames, dtype=np.float32)

    valid_mask = (f >= min_firing_hz) & (f <= max_firing_hz)
    valid_freqs = f[valid_mask]

    for frame_idx in range(n_frames):
        spec = mag[:, frame_idx]

        # Downsampled spectra for HPS
        hps = spec.copy()
        for h in [2, 3]:
            downsampled = spec[::h]
            hps[: len(downsampled)] *= downsampled

        valid_hps = hps[valid_mask]
        if len(valid_hps) > 0 and np.max(valid_hps) > 0:
            best_idx = np.argmax(valid_hps)
            f_fire_track[frame_idx] = valid_freqs[best_idx]
        else:
            f_fire_track[frame_idx] = (min_firing_hz + max_firing_hz) * 0.5

    # Median filter to eliminate spurious octave jumps
    f_fire_smooth = scipy.signal.medfilt(f_fire_track, kernel_size=5)

    # Convert f_fire back to RPM: RPM = f_fire * 120 / cylinders
    rpm_track = f_fire_smooth * 120.0 / float(cylinders)
    rpm_track = np.clip(rpm_track, idle_rpm * 0.8, redline_rpm * 1.02)

    # Interpolate to sample resolution
    frame_times = t
    sample_times = np.linspace(0, len(audio) / sr, len(audio), endpoint=False)
    rpm_interp = np.interp(sample_times, frame_times, rpm_track)
    rpm_norm = np.clip((rpm_interp - idle_rpm) / max(1.0, (redline_rpm - idle_rpm)), 0.0, 1.0)

    # Inferred throttle load from envelope and high-frequency content (> 1500 Hz)
    hf_mask = f >= 1500
    hf_energy = np.sum(mag[hf_mask, :], axis=0)
    tot_energy = np.sum(mag, axis=0) + 1e-6
    hf_ratio = np.clip(hf_energy / tot_energy, 0.0, 1.0)

    # Short-time RMS envelope
    frame_rms = np.sqrt(np.mean(mag**2, axis=0))
    norm_rms = frame_rms / (np.max(frame_rms) + 1e-6)

    # Combined throttle load
    raw_throttle = np.clip(norm_rms * 0.65 + hf_ratio * 0.35, 0.0, 1.0)
    throttle_smooth = scipy.signal.medfilt(raw_throttle, kernel_size=5)
    throttle_interp = np.interp(sample_times, frame_times, throttle_smooth)
    throttle_load = np.clip(throttle_interp, 0.0, 1.0)

    return rpm_norm.astype(np.float32), throttle_load.astype(np.float32), rpm_interp.astype(np.float32)


def create_mel_filterbank(sr: int, n_fft: int, n_mels: int = 64, f_min: float = 40.0, f_max: float = 12000.0) -> np.ndarray:
    """Generates a standard triangular Mel filterbank matrix of shape (n_mels, n_fft // 2 + 1)."""
    n_freqs = n_fft // 2 + 1
    fft_freqs = np.linspace(0, sr / 2, n_freqs)

    def hz_to_mel(hz):
        return 2595.0 * np.log10(1.0 + hz / 700.0)

    def mel_to_hz(mel):
        return 700.0 * (10.0 ** (mel / 2595.0) - 1.0)

    mel_min = hz_to_mel(f_min)
    mel_max = hz_to_mel(f_max)
    mel_points = np.linspace(mel_min, mel_max, n_mels + 2)
    hz_points = mel_to_hz(mel_points)

    weights = np.zeros((n_mels, n_freqs), dtype=np.float32)
    for m in range(n_mels):
        left = hz_points[m]
        center = hz_points[m + 1]
        right = hz_points[m + 2]

        up = (fft_freqs - left) / max(1e-4, (center - left))
        down = (right - fft_freqs) / max(1e-4, (right - center))
        tri = np.maximum(0.0, np.minimum(up, down))
        weights[m, :] = tri

    return weights


def biquad_lowpass_filter(x: np.ndarray, cutoff_hz: float, q: float, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Exact Web Audio BiquadFilterNode lowpass filter via scipy.signal.lfilter."""
    cutoff = max(20.0, min(sr * 0.48, cutoff_hz))
    q_val = max(0.1, q)
    omega = 2.0 * math.pi * cutoff / sr
    alpha = math.sin(omega) / (2.0 * q_val)
    cos_w = math.cos(omega)

    b0 = (1.0 - cos_w) / 2.0
    b1 = 1.0 - cos_w
    b2 = (1.0 - cos_w) / 2.0
    a0 = 1.0 + alpha
    a1 = -2.0 * cos_w
    a2 = 1.0 - alpha

    b = np.array([b0 / a0, b1 / a0, b2 / a0], dtype=np.float32)
    a = np.array([1.0, a1 / a0, a2 / a0], dtype=np.float32)
    return scipy.signal.lfilter(b, a, x).astype(np.float32)


def biquad_peaking_filter(x: np.ndarray, freq_hz: float, gain_db: float, q: float, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Exact Web Audio BiquadFilterNode peaking filter via scipy.signal.lfilter."""
    freq = max(20.0, min(sr * 0.48, freq_hz))
    q_val = max(0.1, q)
    amp = 10.0 ** (gain_db / 40.0)
    omega = 2.0 * math.pi * freq / sr
    alpha = math.sin(omega) / (2.0 * q_val)
    cos_w = math.cos(omega)

    b0 = 1.0 + alpha * amp
    b1 = -2.0 * cos_w
    b2 = 1.0 - alpha * amp
    a0 = 1.0 + alpha / amp
    a1 = -2.0 * cos_w
    a2 = 1.0 - alpha / amp

    b = np.array([b0 / a0, b1 / a0, b2 / a0], dtype=np.float32)
    a = np.array([1.0, a1 / a0, a2 / a0], dtype=np.float32)
    return scipy.signal.lfilter(b, a, x).astype(np.float32)


def soft_clip(x: np.ndarray, drive: float) -> np.ndarray:
    """Exact Web Audio makeSoftClippingCurve math from src/game/audio.ts."""
    deg = math.pi / 180.0
    scaled = np.clip(x * 0.25, -1.0, 1.0)
    denom = math.pi + drive * np.abs(scaled) + 1e-8
    return ((3.0 + drive) * scaled * 20.0 * deg) / denom


def synthesize_candidate(
    params: np.ndarray,
    rpm_norm: np.ndarray,
    throttle_load: np.ndarray,
    cylinders: int,
    idle_rpm: float,
    redline_rpm: float,
    sr: int = SAMPLE_RATE,
) -> np.ndarray:
    """
    Vectorized NumPy/SciPy digital signal mirror of src/three/audioEngine.ts:
      - Harmonic PeriodicWave sum (0.5x, 1x, 2nd..6th order)
      - Uneven firing pulse modulation
      - Soft-clipping waveshaper
      - Resonant exhaust low-pass filter
      - Chest formant & exhaust formant peaking biquads
      - Turbo spool whistle & straight-cut gearbox whine
      - Cyclic fuel/ignition-cut rev limiter
    """
    n_samples = len(rpm_norm)
    t = np.arange(n_samples, dtype=np.float32) / float(sr)

    # Unpack parameter vector theta (20 parameters)
    w0 = params[0]
    w1 = params[1]
    w2 = params[2]
    w3 = params[3]
    w4 = params[4]
    w5 = params[5]
    sub_level = params[6]
    mid_level = params[7]
    high_level = params[8]
    distortion_drive = params[9]
    wot_filter_cutoff = params[10]
    filter_q = params[11]
    chest_formant_hz = params[12]
    chest_formant_gain = params[13]
    chest_formant_q = params[14]
    formant_hz = params[15]
    formant_gain = params[16]
    pulse_depth = params[17]
    turbo_spool_level = params[18]
    gear_whine_level = params[19]

    # Fundamental firing frequencies matching computeWarmFundamentalHz
    rpm = idle_rpm + rpm_norm * (redline_rpm - idle_rpm)
    crank_hz = rpm / 60.0
    firing_hz = crank_hz * (cylinders / 2.0)

    raw_idle = (idle_rpm / 60.0) * (cylinders / 2.0)
    raw_redline = (redline_rpm / 60.0) * (cylinders / 2.0)
    norm_sweep = np.where(raw_redline > raw_idle, (firing_hz - raw_idle) / (raw_redline - raw_idle), rpm_norm)

    base_idle_hz = max(45.0, (idle_rpm / 60.0) * (cylinders / 2.0) * 0.85)
    max_redline_hz = min(380.0, (redline_rpm / 60.0) * (cylinders / 2.0) * 0.95)
    base_hz = np.clip(base_idle_hz + norm_sweep * (max_redline_hz - base_idle_hz), 45.0, 380.0)

    sub_hz = base_hz * 0.5
    mid_hz = base_hz * 2.0
    high_hz = base_hz * 4.0

    # Continuous phase integration
    phi_base = 2.0 * math.pi * np.cumsum(base_hz / float(sr))
    phi_sub = 2.0 * math.pi * np.cumsum(sub_hz / float(sr))
    phi_mid = 2.0 * math.pi * np.cumsum(mid_hz / float(sr))
    phi_high = 2.0 * math.pi * np.cumsum(high_hz / float(sr))

    # 1. Primary combustion PeriodicWave sum
    s_comb = (
        w0 * np.sin(phi_base)
        + w1 * np.sin(2.0 * phi_base)
        + w2 * np.sin(3.0 * phi_base)
        + w3 * np.sin(4.0 * phi_base)
        + w4 * np.sin(5.0 * phi_base)
        + w5 * np.sin(6.0 * phi_base)
    )

    # 2. Sub-octave rumble oscillator (triangle wave)
    s_sub = sub_level * (2.0 / math.pi) * np.arcsin(np.sin(phi_sub))

    # 3. Midrange cylinder-order harmonic (sawtooth wave)
    s_mid = mid_level * (0.65 + throttle_load * 0.35) * (2.0 * (phi_mid / (2.0 * math.pi) - np.floor(phi_mid / (2.0 * math.pi) + 0.5)))

    # 4. Upper harmonic scream oscillator (sawtooth wave)
    upper_curve = np.power(rpm_norm, 1.35)
    s_high = high_level * (0.25 + upper_curve * 0.95) * (2.0 * (phi_high / (2.0 * math.pi) - np.floor(phi_high / (2.0 * math.pi) + 0.5)))

    # 5. Cylinder firing pulse clatter LFO
    pulse_hz = np.maximum(9.0, base_hz * 0.22)
    phi_pulse = 2.0 * math.pi * np.cumsum(pulse_hz / float(sr))
    rpm_fade = 1.0 - 0.72 * np.power(rpm_norm, 1.15)
    pulse_mod = 1.0 + pulse_depth * rpm_fade * (0.65 + throttle_load * 0.35) * np.sin(phi_pulse)

    # Raw combustion pre-mix
    s_raw = (0.84 * w0 * s_comb + s_sub + s_mid + s_high) * pulse_mod

    # 6. Waveshaper distortion drive
    s_dist = soft_clip(s_raw, distortion_drive)

    # 7. Resonant low-pass exhaust filter
    mean_blend = float(np.mean(rpm_norm * 0.48 + throttle_load * 0.52))
    cutoff = 260.0 + (wot_filter_cutoff - 260.0) * min(1.0, mean_blend)
    s_filtered = biquad_lowpass_filter(s_dist, cutoff, filter_q, sr)

    # 8. Chest & upper exhaust resonance formants
    s_chest = biquad_peaking_filter(s_filtered, chest_formant_hz, chest_formant_gain, chest_formant_q, sr)
    s_formant = biquad_peaking_filter(s_chest, formant_hz, formant_gain, 1.4, sr)

    # 9. Ancillary channels: Turbo whistle & straight-cut gearbox whine
    boost_load = np.clip(rpm_norm * 0.48 + throttle_load * 0.62 - 0.1, 0.0, 1.0)
    turbo_hz = 2400.0 + boost_load * 3100.0
    phi_turbo = 2.0 * math.pi * np.cumsum(turbo_hz / float(sr))
    s_turbo = turbo_spool_level * boost_load * (0.35 + throttle_load * 0.65) * np.sin(phi_turbo)

    gear_hz = 950.0 + 120.0 * 12.5 + rpm_norm * 780.0
    phi_gear = 2.0 * math.pi * np.cumsum(gear_hz / float(sr))
    s_gear = gear_whine_level * (0.55 + throttle_load * 0.45) * (np.sin(phi_gear) + 0.4 * np.sin(1.98 * phi_gear))

    # 10. Rev-limiter cyclic ignition cut gating (rpmNorm >= 0.985)
    if float(np.mean(rpm_norm)) >= 0.985:
        cut_phase = np.sin(2.0 * math.pi * 18.0 * t)
        gate = np.where(cut_phase < 0, 0.16, 1.0)
        s_formant = s_formant * gate

    # Final combined output
    comb_gain = 0.24 * (0.7 + throttle_load * 0.48)
    s_out = comb_gain * s_formant + s_turbo + s_gear

    # Normalize RMS
    rms = np.sqrt(np.mean(s_out**2))
    if rms > 1e-6:
        s_out = s_out / rms
    return s_out.astype(np.float32)


def compute_mr_log_mel(
    audio: np.ndarray,
    fft_sizes: tuple[int, ...] = (512, 1024, 2048),
    hop_sizes: tuple[int, ...] = (128, 256, 512),
    mel_fbs: list[np.ndarray] | None = None,
    sr: int = SAMPLE_RATE,
) -> tuple[list[np.ndarray], list[float]]:
    """Multi-resolution Log-Mel spectrogram representation and spectral centroids."""
    features = []
    centroids = []

    for i, n_fft in enumerate(fft_sizes):
        hop = hop_sizes[i]
        f, t, zxx = scipy.signal.stft(audio, fs=sr, nperseg=n_fft, noverlap=n_fft - hop, boundary=None)
        mag = np.abs(zxx)

        mel_fb = mel_fbs[i] if mel_fbs is not None else create_mel_filterbank(sr, n_fft, n_mels=64)
        mel_pow = mel_fb @ (mag**2)
        log_mel = np.log(mel_pow + 1e-5)

        # RMS normalization across time-frequency bins
        norm_log_mel = log_mel / (np.sqrt(np.mean(log_mel**2)) + 1e-6)
        features.append(norm_log_mel)

        # Spectral centroid
        freq_vec = f[:, None]
        centroid = np.sum(freq_vec * mag, axis=0) / (np.sum(mag, axis=0) + 1e-8)
        centroids.append(float(np.mean(centroid)))

    return features, centroids


def multi_resolution_loss(
    target_mels: list[np.ndarray],
    target_cents: list[float],
    cand_mels: list[np.ndarray],
    cand_cents: list[float],
) -> float:
    """L1 Log-Mel spectral distance + spectral centroid balance across multiple FFT resolutions."""
    loss = 0.0
    for i in range(len(target_mels)):
        l1_diff = np.mean(np.abs(target_mels[i] - cand_mels[i]))
        sc_diff = abs(target_cents[i] - cand_cents[i]) / max(1.0, target_cents[i])
        loss += float(l1_diff + 0.25 * sc_diff)
    return loss / float(len(target_mels))


def infer_engine_type(cylinders: int, w1: float, w3: float, pulse_depth: float) -> str:
    """Infers AcousticProfileType string based on cylinder count and harmonic distribution."""
    if cylinders == 4:
        return "INLINE4_TURBO"
    if cylinders == 6:
        return "V6_TURBO_HYBRID"
    if cylinders == 8:
        # Cross-plane V8 has strong 2nd order (w1) and pronounced firing pulse clatter
        return "V8_CROSSPLANE" if (w1 >= w3 and pulse_depth > 0.18) else "V8_FLATPLANE"
    if cylinders == 10:
        return "V10_NA"
    if cylinders == 12:
        return "V12_NA"
    return "V8_CROSSPLANE"


def objective_fn(
    vec: np.ndarray,
    rpm_norm: np.ndarray,
    throttle_load: np.ndarray,
    cylinders: int,
    idle_rpm: float,
    redline_rpm: float,
    fft_sizes: tuple[int, ...],
    hop_sizes: tuple[int, ...],
    mel_fbs: list[np.ndarray],
    target_mels: list[np.ndarray],
    target_cents: list[float],
) -> float:
    """Objective function for differential evolution evaluating multi-resolution spectral loss."""
    cand_audio = synthesize_candidate(
        vec, rpm_norm, throttle_load, cylinders, idle_rpm, redline_rpm, SAMPLE_RATE
    )
    cand_mels, cand_cents = compute_mr_log_mel(cand_audio, fft_sizes, hop_sizes, mel_fbs, SAMPLE_RATE)
    return multi_resolution_loss(target_mels, target_cents, cand_mels, cand_cents)


def main():
    parser = argparse.ArgumentParser(
        description="Fit audioEngine.ts acoustic preset from reference racing clip (.mp4 / .wav) via Differential Evolution."
    )
    parser.add_argument("input_file", help="Path to reference audio/video clip (.mp4, .wav, .m4a)")
    parser.add_argument("--cylinders", type=int, default=8, choices=[4, 6, 8, 10, 12], help="Cylinder count (default: 8)")
    parser.add_argument("--idle", type=int, default=1100, help="Idle RPM (default: 1100)")
    parser.add_argument("--redline", type=int, default=8800, help="Redline RPM (default: 8800)")
    parser.add_argument("--start", type=float, default=None, help="Clip start in seconds (default: auto-select)")
    parser.add_argument("--duration", type=float, default=2.5, help="Analysis window in seconds (default: 2.5)")
    parser.add_argument("--iters", type=int, default=120, help="Differential evolution max iterations (default: 120)")
    parser.add_argument("--popsize", type=int, default=10, help="Population size factor (default: 10)")
    parser.add_argument("--out", type=str, default=None, help="Path to write fitted JSON preset")
    parser.add_argument("--save-preview", type=str, default=None, help="Path to write synthesized audio preview WAV")

    args = parser.parse_args()

    if not os.path.exists(args.input_file):
        print(f"Error: input file not found: {args.input_file}", file=sys.stderr)
        sys.exit(1)

    print(f"\n--- Apex Miniature Acoustic Profile Fitter ---")
    print(f"Source file:   {args.input_file}")
    print(f"Architecture:  {args.cylinders}-Cylinder, {args.idle}..{args.redline} RPM")

    # 1. Extract audio
    print(f"Extracting 44.1 kHz PCM audio via ffmpeg...")
    raw_audio, actual_start = extract_audio_pcm(args.input_file, args.start, args.duration)
    # Normalize reference audio
    ref_rms = np.sqrt(np.mean(raw_audio**2))
    if ref_rms > 1e-5:
        target_audio = (raw_audio / ref_rms).astype(np.float32)
    else:
        target_audio = raw_audio

    print(f"Analysis window: {actual_start:.2f}s to {(actual_start + len(target_audio) / SAMPLE_RATE):.2f}s ({len(target_audio)} samples)")

    # 2. Track RPM & Throttle contours
    print(f"Tracking harmonic firing frequency and spectral flux contour...")
    rpm_norm, throttle_load, rpm_raw = track_rpm_and_throttle(
        target_audio, args.cylinders, float(args.idle), float(args.redline), SAMPLE_RATE
    )
    mean_rpm = int(np.mean(rpm_raw))
    print(f"Inferred RPM contour: avg {mean_rpm} RPM (norm: {np.mean(rpm_norm):.2f}), throttle load: {np.mean(throttle_load):.2f}")

    # 3. Precompute multi-resolution Mel filterbanks & target features
    fft_sizes = (512, 1024, 2048)
    hop_sizes = (128, 256, 512)
    mel_fbs = [create_mel_filterbank(SAMPLE_RATE, n_fft, n_mels=64) for n_fft in fft_sizes]
    target_mels, target_cents = compute_mr_log_mel(target_audio, fft_sizes, hop_sizes, mel_fbs, SAMPLE_RATE)

    # 4. Parameter bounds for differential evolution (20 parameters)
    bounds = [
        (0.35, 1.40),   # 0: w0 (1x fundamental)
        (0.05, 1.25),   # 1: w1 (2nd order)
        (0.02, 1.15),   # 2: w2 (3rd order)
        (0.02, 1.10),   # 3: w3 (4th order)
        (0.01, 0.90),   # 4: w4 (5th order)
        (0.01, 0.80),   # 5: w5 (6th order)
        (0.10, 1.30),   # 6: subLevel (0.5x sub-rumble)
        (0.20, 1.35),   # 7: midLevel (midrange oscillator)
        (0.10, 1.10),   # 8: highLevel (high scream harmonic)
        (6.0, 42.0),    # 9: distortionDrive
        (900.0, 3200.0),# 10: wotFilterCutoff
        (0.8, 4.5),     # 11: filterQ
        (120.0, 240.0), # 12: chestFormantHz
        (2.0, 12.0),    # 13: chestFormantGain
        (0.9, 2.2),     # 14: chestFormantQ
        (500.0, 1400.0),# 15: formantHz
        (1.5, 7.5),     # 16: formantGain
        (0.05, 0.55),   # 17: pulseDepth
        (0.0, 0.38),    # 18: turboSpoolLevel
        (0.0, 0.32),    # 19: gearWhineLevel
    ]

    print(f"Beginning Differential Evolution fitting (iters={args.iters}, popsize={args.popsize})...")
    opt_result = scipy.optimize.differential_evolution(
        func=objective_fn,
        bounds=bounds,
        args=(
            rpm_norm,
            throttle_load,
            args.cylinders,
            float(args.idle),
            float(args.redline),
            fft_sizes,
            hop_sizes,
            mel_fbs,
            target_mels,
            target_cents,
        ),
        maxiter=args.iters,
        popsize=args.popsize,
        mutation=(0.5, 1.0),
        recombination=0.7,
        seed=42,
        workers=-1,
        updating="deferred",
        polish=False,
    )

    best_p = opt_result.x
    best_loss = opt_result.fun
    print(f"\nOptimization complete! Total evaluations: {opt_result.nfev}, Final Loss: {best_loss:.4f}")

    # Build final matched waveform and preview if requested
    matched_audio = synthesize_candidate(
        best_p, rpm_norm, throttle_load, args.cylinders, float(args.idle), float(args.redline), SAMPLE_RATE
    )
    if args.save_preview:
        out_wav = (matched_audio * 32767.0).astype(np.int16)
        scipy.io.wavfile.write(args.save_preview, SAMPLE_RATE, out_wav)
        print(f"Saved synthesized audio preview -> {args.save_preview}")

    # Construct complete AcousticProfile schema matching audioEngine.ts & SoundEditorModal.tsx
    engine_type = infer_engine_type(args.cylinders, best_p[1], best_p[3], best_p[17])
    base_idle_hz = round(float(args.idle / 60.0 * (args.cylinders / 2.0)), 1)
    max_redline_hz = round(float(args.redline / 60.0 * (args.cylinders / 2.0)), 1)

    # 8 harmonic weights
    harmonic_weights = [
        round(float(best_p[0]), 3),
        round(float(best_p[1]), 3),
        round(float(best_p[2]), 3),
        round(float(best_p[3]), 3),
        round(float(best_p[4]), 3),
        round(float(best_p[5]), 3),
        round(float(best_p[5] * 0.45), 3),
        round(float(best_p[5] * 0.22), 3),
    ]

    has_turbo = bool(best_p[18] > 0.05)
    has_hybrid = False

    preset: dict = {
        "type": engine_type,
        "soundProfile": "custom_profile",
        "name": f"{args.cylinders}-Cyl Fitted Engine Profile",
        "cylinders": args.cylinders,
        "idleRpm": args.idle,
        "redlineRpm": args.redline,
        "baseIdleHz": base_idle_hz,
        "maxRedlineHz": max_redline_hz,
        "subRatio": 0.5,
        "midHarmonicRatio": 2.0,
        "highHarmonicRatio": 4.0,
        "subLevel": round(float(best_p[6]), 3),
        "midLevel": round(float(best_p[7]), 3),
        "highLevel": round(float(best_p[8]), 3),
        "harmonicWeights": harmonic_weights,
        "chestFormantHz": int(round(best_p[12])),
        "chestFormantGain": round(float(best_p[13]), 1),
        "chestFormantQ": round(float(best_p[14]), 2),
        "formantHz": int(round(best_p[15])),
        "formantGain": round(float(best_p[16]), 1),
        "formantQ": 1.4,
        "pulseDepth": round(float(best_p[17]), 3),
        "pulseRateScale": 0.22,
        "pulseWaveform": "sawtooth",
        "pulseRpmFade": 0.72,
        "oscCombustionType": "sawtooth",
        "oscHarmonicType": "sawtooth",
        "oscSubType": "triangle",
        "idleFilterCutoff": 260,
        "wotFilterCutoff": int(round(best_p[10])),
        "filterQ": round(float(best_p[11]), 2),
        "distortionDrive": int(round(best_p[9])),
        "combustionGain": 0.36,
        "profileGain": 1.6,
        "engineOutputGain": 1.6,
        "intakeLevel": 0.08,
        "intakeCenterHz": 980,
        "intakeHighRpmThreshold": 0.65,
        "hasHybridWhine": has_hybrid,
        "hybridWhineLevel": 0.0,
        "mguLaunchDominant": False,
        "hasTurboFlutter": has_turbo,
        "turboSpoolPitch": 1.1,
        "turboSpoolLevel": round(float(best_p[18]), 3),
        "gearWhineLevel": round(float(best_p[19]), 3),
        "gearWhinePitchScale": 1.0,
        "revLimiterRateHz": 18,
        "flatShiftCutMs": 50,
        "hasExhaustCrackles": True,
        "crackleIntensity": 1.4,
    }

    formatted_json = json.dumps(preset, indent=2)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(formatted_json + "\n")
        print(f"Saved fitted preset JSON -> {args.out}")

    print("\n================== READY-TO-PASTE JSON PRESET ==================")
    print(formatted_json)
    print("================================================================\n")


if __name__ == "__main__":
    main()
