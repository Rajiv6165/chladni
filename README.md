# Chladni: Polyphonic Synthesizer & Plate Visualizer

![Demo Placeholder](./demo-placeholder.gif)

**Live Demo:** [Play Chladni](https://chladni.pages.dev) *(Requires Webcam and Audio permissions)*

[![CI/CD Pipeline](https://github.com/Rajiv6165/chladni/actions/workflows/ci.yml/badge.svg)](https://github.com/Rajiv6165/chladni/actions/workflows/ci.yml)

Chladni is a browser-based, touchless polyphonic synthesizer and interactive cymatics visualizer. Using MediaPipe hand tracking, you can play chords and shape the sound with gestures in thin air. The audio engine runs entirely in a low-latency WebAssembly `AudioWorklet`, while the visuals accurately simulate Chladni plate resonance patterns using WebGL2—all happening fully client-side with no backend and zero cloud dependencies.

## Features
- 🖐️ **Touchless Gesture Control:** Play notes and adjust effects using webcam hand tracking.
- 🎹 **Polyphonic WASM Synth Core:** Written in Rust and compiled to WebAssembly for zero-allocation, lock-free audio processing.
- 🌊 **Real-time Chladni Visualization:** A custom GLSL shader that mathematically calculates Chladni resonance patterns driven directly by the audio output.
- 🎛️ **Brass Instrument Aesthetic:** An immersive, bespoke UI featuring custom SVG rotary dials and an oscilloscope-style webcam inset.
- 🎙️ **Session Recording & Export:** Lossless 16-bit PCM WAV capture via zero-allocation `AudioWorklet` tapped after the master limiter, alongside synchronized 60fps canvas video (`MediaRecorder` with VP9/VP8/Opus or MP4 fallback).
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
        GM --> |Note On/Off & Params| MsgPort1[Message Port]
        RecCtrl[Record Control] --> |Start / Stop| MediaRec[MediaRecorder]
        RecCtrl --> |Transfer Pool| RecNode[Recorder Worklet Node]
    end

    subgraph Audio Thread [AudioWorklet]
        MsgPort2[Message Port] --> Host[AudioWorklet Host]
        Host --> |Params| Rust[Rust/WASM Synth Core]
        Rust --> |Stereo Buffer| Analyser[AnalyserNode tap]
        Analyser --> Limiter[Master Limiter Compressor]
        Limiter --> AudioOut[AudioContext Destination]
        Limiter --> |Post-Limiter Tap| RecNode
        Limiter --> |Post-Limiter Tap| MediaDest[MediaStream Destination]
    end

    subgraph GPU & Video Pipeline [WebGL2 & Canvas]
        Analyser --> |RMS & Freq| Shader[GLSL Chladni Shader]
        Shader --> Canvas[Plate Canvas]
        Canvas --> |captureStream 60fps| MediaRec
        MediaDest --> |Audio Track| MediaRec
        RecNode --> |Zero-Copy PCM Transfer| WavEnc[WAV Encoder]
    end

    MsgPort1 <--> MsgPort2
```

### Why it's built this way
- **No-allocation audio path:** Both the Rust synthesis core and the PCM recording `AudioWorklet` run with zero heap allocations in their `process()` loops. Reusable transferable `Float32Array` buffers ping-pong between the main thread and audio thread, preventing GC dropouts.
- **Post-Limiter Tap:** Recording taps strictly *after* the master limiter compressor. Exported takes match what the user actually hears and can never clip harder than live playback.
- **AudioWorklet boundary:** The main thread only sends lightweight JSON commands (Note On/Off, CC) across the boundary, completely decoupling UI rendering and hand tracking from audio synthesis.
- **Chladni Plate Equation:** The visualizer uses the actual Chladni resonance equation (`sin(n*pi*x) * sin(m*pi*y) - sin(m*pi*x) * sin(n*pi*y) = 0`) to find nodal lines. The synthesizer's fundamental frequency is mapped to corresponding integer `(n, m)` resonance modes.
- **EMA Smoothing:** The gesture tracking uses Exponential Moving Average (EMA) to smooth out hand jitter before converting it into musical pitches and parameter values.

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
| **Left** | Move Y Axis (Up/Down) | **Pitch** | C3 (bottom of frame) to C5 (top of frame) |
| **Right** | Move Y Axis (Up/Down) | **Filter Cutoff** | Adjusts the low-pass filter cutoff |
| **Right** | Move X Axis (Left/Right)| **Reverb Mix** | Controls the delay/reverb wetness |
*Note: The right hand only affects sound while the left hand is actively pinching.*

## Local Setup

Run this project locally in under 5 minutes:

### Prerequisites
- Node.js (v18+)
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

## Known Limitations
- **Safari AudioWorklet Quirks:** Safari's implementation of AudioWorklet can occasionally be aggressive with sleeping background tabs.
- **GPU Delegate Support:** MediaPipe uses the GPU delegate where available. On some unsupported devices or strict browsers, it silently falls back to the CPU delegate, which may increase latency.
- **Lighting Sensitivity:** The gesture tracking accuracy is highly dependent on ambient lighting. Poor lighting will introduce jitter.
