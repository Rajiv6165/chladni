# Chladni

Gesture-controlled generative audio-visual instrument — a Rust/WASM synth engine driven by real-time hand tracking, rendering live Chladni cymatics patterns in raw WebGL. 100% client-side, no backend, no APIs.

## Phase 1: Rust/WASM Synth Core

The `synth-core` directory contains the polyphonic subtractive synth engine written in Rust and compiled to WebAssembly.

To build the WASM module:
```bash
cd synth-core
wasm-pack build --target web
```

To test the core:
Host the `synth-core` folder with a local HTTP server and navigate to `test/index.html`.

## App (Frontend)

The `app` directory contains the Svelte + Vite scaffolding for the UI (to be built in later phases).
