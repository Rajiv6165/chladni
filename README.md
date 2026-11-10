# Chladni: Polyphonic Synthesizer & Plate Visualizer

![Demo Placeholder](./demo-placeholder.gif)

**Live Demo:** [Play Chladni](https://chladni.pages.dev) *(Requires Webcam and Audio permissions)*

[![CI/CD Pipeline](https://github.com/Rajiv6165/chladni/actions/workflows/ci.yml/badge.svg)](https://github.com/Rajiv6165/chladni/actions/workflows/ci.yml)

Chladni is a browser-based, touchless polyphonic synthesizer and interactive cymatics visualizer. Using MediaPipe hand tracking, you can play chords and shape the sound with gestures in thin air. The audio engine runs entirely in a low-latency WebAssembly `AudioWorklet`, while the visuals accurately simulate Chladni plate resonance patterns using WebGL2—all happening fully client-side with no backend and zero cloud dependencies.

## Features
- 🖐️ **Touchless Gesture Control:** Play notes and adjust effects using webcam hand tracking.
- 🎹 **Polyphonic WASM Synth Core:** Written in Rust and compiled to WebAssembly for zero-allocation, lock-free audio processing with anti-aliased oscillators (Saw, Square, Triangle, Sine), runtime ADSR, unison detune, and fractional delay.
- 🌊 **Real-time Chladni Visualization:** A custom GLSL shader that mathematically calculates Chladni resonance patterns driven directly by the audio output.
- 🏷️ **Preset Plates (Phase 7):** Switch between named instruments bundling sound, visual character, and gesture response with instant, click-free parameter ramping.
- 🎛️ **Brass Instrument Aesthetic:** An immersive, bespoke UI featuring custom SVG rotary dials, engraved brass plate rack, and an oscilloscope-style webcam inset.
- 🎙️ **Session Recording & Export (Phase 8):** Lossless 16-bit PCM WAV capture via zero-allocation `AudioWorklet` tapped after the master limiter, alongside synchronized 60fps canvas video (`MediaRecorder` with VP9/VP8/Opus or MP4 fallback).
- 🚀 **100% Client-Side:** No servers, no paid APIs. Runs securely in your browser.

## Tech Stack
![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)
![WebAssembly](https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white)
![Svelte](https://img.shields.io/badge/Svelte-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)
![WebGL2](https://img.shields.io/badge/WebGL2-990000?style=for-the-badge&logo=webgl&logoColor=white)
![MediaPipe](https://img.shields.io/badge/MediaPipe-00B2FF?style=for-the-badge&logo=google&logoColor=white)

## Architecture

```mermaid
graph TD
    subgraph UI Thread [Main Thread - Svelte]
        Cam[Webcam] --> |Frames| MP[MediaPipe Hand Tracker]
        MP --> |Landmarks| GM[Gesture Mapper]
        GM --> |EMA Smoothing| UI[Svelte UI / Dials]
        PlateRack[Plate Selector Rack] --> |Active Preset| UI
        PlateRack --> |Visual Uniforms| Shader[GLSL Chladni Shader]
        PlateRack --> |Gesture Tuning| GM
        UI --> |Note On/Off & Sound Params| MsgPort1[Message Port]
        RecCtrl[Record Control] --> |Start / Stop| MediaRec[MediaRecorder]
        RecCtrl --> |Transfer Pool| RecNode[Recorder Worklet Node]
    end

    subgraph Audio Thread [AudioWorklet]
        MsgPort2[Message Port] --> Host[AudioWorklet Host]
        Host --> |Smoothed Params| Rust[Rust/WASM Synth Core]
        Rust --> |Stereo Buffer| Analyser[AnalyserNode tap]
        Analyser --> Limiter[Master Limiter Compressor]
        Limiter --> AudioOut[AudioContext Destination]
        Limiter --> |Post-Limiter Tap| RecNode
        Limiter --> |Post-Limiter Tap| MediaDest[MediaStream Destination]
    end

    subgraph GPU & Video Pipeline [WebGL2 & Canvas]
        Analyser --> |RMS & Freq| Shader
        Shader --> Canvas[Plate Canvas]
        Canvas --> |captureStream 60fps| MediaRec
        MediaDest --> |Audio Track| MediaRec
        RecNode --> |Zero-Copy PCM Transfer| WavEnc[WAV Encoder]
    end

    MsgPort1 <--> MsgPort2
```

### Why it's built this way
- **No-allocation audio path:** Both the Rust synthesis core and the PCM recording `AudioWorklet` run with zero heap allocations in their `process()` loops. Reusable transferable `Float32Array` buffers ping-pong between the main thread and audio thread, preventing GC dropouts.
- **Click-Free Parameter Ramping:** Switching preset plates mid-note transitions parameters (filter, delay time, feedback, oscillator waveforms, unison detune, and master gain) via one-pole smoothers, eliminating pops, clicks, or zippering.
- **Post-Limiter Tap:** Recording taps strictly *after* the master limiter compressor. Exported takes match what the user actually hears and can never clip harder than live playback.
- **AudioWorklet boundary:** The main thread sends structured parameter commands across the boundary, completely decoupling UI rendering and hand tracking from audio synthesis.
- **Chladni Plate Equation:** The visualizer uses the actual Chladni resonance equation (`sin(n*pi*x) * sin(m*pi*y) - sin(m*pi*x) * sin(n*pi*y) = 0`) to find nodal lines. The synthesizer's fundamental frequency is mapped to corresponding integer `(n, m)` resonance modes.
- **EMA Smoothing:** The gesture tracking uses Exponential Moving Average (EMA) to smooth out hand jitter before converting it into musical pitches and parameter values.

## Preset Plates (Phase 7)

A **"plate"** is an acoustic preset bundling the sound synthesis engine, the visual cymatics character, and the gesture response into a cohesive instrument identity. Switching plates feels like swapping out the vibrating metal plate on an acoustic instrument.

### Factory Plates

| Plate | Sound Character | Visual Look | Gesture Tuning | Description |
|---|---|---|---|---|
| **Bell** | Pure sine wave, instant attack (5ms), enduring decay (800ms), long delay (450ms, 65% fdbk) | Ultra-sharp nodal lines (sharpness 2.6), minimal grain, crystalline lattice, pale antique ivory | Base octave 4 (MIDI 60), 2 octaves range, fine glissandi smoothing | Pure sinusoidal resonance with crystalline nodal lines and enduring bell decay. |
| **Glass Harmonica** | Triangle wave, swelling soft attack (150ms), sustained resonance, airy reverb | Medium line sharpness (1.4), fine sand grain (0.85), harmonic modal series, oxidized copper/verdigris | Base octave 4 (MIDI 60), 2 octaves range, high smoothing (0.22) for silky glissandi | Soft-edged ethereal friction tones with fine powder dispersion. |
| **Brass Drone** | Sawtooth wave, heavy detuned dual-oscillator unison (15 cents spread), warm low-pass filter (1800Hz) | Thick viscous nodal ribbons (sharpness 0.85), dense modal lattice, warm burnished brass tint | Base octave 2 (MIDI 36), low register, 2 octaves range | Heavy detuned dual-saw resonance with thick, viscous nodal ribbons. |
| **Pluck** | Band-limited PolyBLEP square wave, percussive zero-attack (2ms), snappy decay (120ms) | Crisp geometric lines (sharpness 2.0), low grain (0.15), concentric modes, slate patina tint | Base octave 3 (MIDI 48), 2.5 octaves range, agile responsive smoothing (0.08) | Percussive square-wave transient with snappy nodal settling. |
| **Deep Plate** | Triangle wave, dark low-pass resonance (500Hz), long slow delay (620ms), slight unison detune | Broad diffuse lines (sharpness 0.75), heavy acoustic bronze sand (grain 0.9), radial modes, dark bronze tint | Base octave 2 (MIDI 36), 1.5 octaves range, weighted smoothing (0.25) | Subterranean acoustic resonance vibrating heavy bronze grain. |
| **Shimmer** | Bright sawtooth, high filter cutoff (7500Hz), cascading delay trails (520ms, 82% feedback), 75% reverb mix | Intricate sharp lines (sharpness 2.8), fine glittering grain (0.95), crystalline modes, gilded brass tint | Base octave 4 (MIDI 60), 2.5 octaves range, responsive tracking | Scintillating high register with cascading echo trails and intricate geometry. |

### User Plates & Privacy
- **Local & Private:** User-created plates are stored directly on your machine in `localStorage`. No accounts, no backend, and zero remote data storage.
- **Save Current As:** Captures live synthesizer dials, visual settings, and gesture response under a custom designation (up to 36 characters with duplicate prevention).
- **Edit & Revert:** Tweaking dials marks a plate as `• MODIFIED`. The `[REVERT]` button snaps dials and audio parameters back to the loaded plate state.
- **Rename & Decommission:** User plates can be renamed or permanently decommissioned (with confirmation). Factory plates remain read-only.
- **Seamless Recording:** Switching plates while recording does not interrupt the active take or drop video frames.

### Import, Export & Share Schema
Plates can be exported as `.json` files or shared instantly through URL hashes (`#plate=<base64url>`). All imports are validated against a strict schema with automatic sanitization and clamping:

```json
{
  "version": 1,
  "id": "plate-celestial-bell",
  "name": "Celestial Bell",
  "description": "Pure sinusoidal resonance with crystalline nodal lines.",
  "category": "user",
  "sound": {
    "waveform": "sine",
    "attack": 0.005,
    "decay": 0.8,
    "sustain": 0.2,
    "release": 1.5,
    "filterCutoff": 6500,
    "filterResonance": 0.25,
    "reverbMix": 0.65,
    "delayTime": 450,
    "delayFeedback": 0.65,
    "detune": 0.0,
    "masterGain": 1.05
  },
  "visual": {
    "lineSharpness": 2.6,
    "grainAmount": 0.2,
    "modeMapping": "crystalline",
    "tint": { "r": 0.85, "g": 0.80, "b": 0.70 }
  },
  "gesture": {
    "pitchRangeOctaves": 2.0,
    "baseOctave": 4,
    "smoothing": 0.12,
    "pinchThreshold": 0.05
  }
}
```

## Record & Export

Chladni includes a fully client-side recording system integrated into the brass control panel:

| Format | Container / MIME | Audio Encoding | Video Encoding | Primary Browser Target |
|---|---|---|---|---|
| **Lossless Audio** | `.wav` (`audio/wav`) | 16-bit PCM, native rate (e.g. 48kHz / 44.1kHz), stereo | N/A | Universal DAW / Audio player |
| **Synchronized Video (Preferred)** | `.webm` (`video/webm;codecs=vp9,opus` or `vp8`) | 192 kbps Opus stereo | VP9 / VP8, 60 FPS, 5 Mbps | Chrome, Firefox, Edge |
| **Synchronized Video (Fallback)** | `.mp4` (`video/mp4;codecs=avc1,mp4a.40.2`) | 192 kbps AAC stereo | H.264 / AVC, 60 FPS | Safari, iOS |

### Recording Safeguards & Privacy
- **Privacy-Safe Default:** By default, video recording taps exclusively the WebGL Chladni plate canvas via `canvas.captureStream(60)`. No webcam video, face, room, or hand footage is recorded. An explicit "INCLUDE INSET" toggle allows opting into a 60fps composite capture with the instrument frame and webcam inset.
- **Memory Bounded (3-Minute Ceiling):** Recordings are capped at 3 minutes (180s) to keep browser memory bounded (~34.5 MB for WAV, ~90 MB for video). A countdown warning appears at 2:30.
- **Tab Backgrounding Safety:** When switching tabs during a recording, the session automatically stops and finalizes immediately, preventing desynced or corrupt chunks caused by background audio suspension.
- **Zero Resource Leaks:** Discarding takes revokes object URLs and dereferences memory buffers immediately.

## Gesture Control Map

| Hand | Action | Parameter Controlled | Range / Details |
|------|--------|----------------------|-----------------|
| **Left** | Pinch (Index + Thumb) | **Note On / Off** | Triggers note. Release pinch to stop. |
| **Left** | Move Y Axis (Up/Down) | **Pitch** | Tuned by active plate (e.g. C3–C5, C2–C4, or C4–C6) |
| **Right** | Move Y Axis (Up/Down) | **Filter Cutoff** | Adjusts the low-pass filter cutoff (100 Hz to 10 kHz) |
| **Right** | Move X Axis (Left/Right)| **Reverb Mix** | Controls the delay/reverb wetness (0% to 100%) |
*Note: The right hand only affects sound while the left hand is actively pinching.*

## Local Setup

Run this project locally in under 5 minutes:

### Prerequisites
- Node.js (v20+)
- Rust (`rustup` with the `wasm32-unknown-unknown` target)
- `wasm-pack`

### 1. Build the WASM Core
```bash
cd synth-core
# Install the webassembly target if you haven't already
rustup target add wasm32-unknown-unknown
# Build the WASM module
wasm-pack build --target web --out-dir ../app/public/pkg
```

### 2. Run the Svelte App
```bash
cd ../app
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

## Testing & Verification
```bash
# Run Rust synth-core unit tests (8 tests: waveforms, ADSR, feedback clamp, stability)
cargo test --manifest-path synth-core/Cargo.toml

# Run frontend Vitest suite (20 tests: WAV encoder, preset validation, storage, import/export)
cd app && npm test

# Type-check and lint
npm run check

# Production build
npm run build
```

## Known Limitations
- **Safari AudioWorklet Quirks:** Safari's implementation of AudioWorklet can occasionally be aggressive with sleeping background tabs.
- **GPU Delegate Support:** MediaPipe uses the GPU delegate where available. On some unsupported devices or strict browsers, it silently falls back to the CPU delegate, which may increase latency.
- **Lighting Sensitivity:** The gesture tracking accuracy is highly dependent on ambient lighting. Poor lighting will introduce jitter.
