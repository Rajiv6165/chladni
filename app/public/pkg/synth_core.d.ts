/* tslint:disable */
/* eslint-disable */

export class WasmSynth {
    free(): void;
    [Symbol.dispose](): void;
    constructor(sample_rate: number);
    note_off(freq: number): void;
    note_on(freq: number, velocity: number): void;
    process(output_buffer: Float32Array): void;
    set_adsr(attack_sec: number, decay_sec: number, sustain: number, release_sec: number): void;
    set_delay_feedback(feedback: number): void;
    set_delay_time(delay_ms: number): void;
    set_detune(cents: number): void;
    set_filter_cutoff(cutoff: number): void;
    set_filter_resonance(resonance: number): void;
    set_master_gain(gain: number): void;
    set_reverb_mix(mix: number): void;
    set_waveform(waveform: number): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmsynth_free: (a: number, b: number) => void;
    readonly wasmsynth_new: (a: number) => number;
    readonly wasmsynth_note_off: (a: number, b: number) => void;
    readonly wasmsynth_note_on: (a: number, b: number, c: number) => void;
    readonly wasmsynth_process: (a: number, b: number, c: number, d: any) => void;
    readonly wasmsynth_set_adsr: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly wasmsynth_set_delay_feedback: (a: number, b: number) => void;
    readonly wasmsynth_set_delay_time: (a: number, b: number) => void;
    readonly wasmsynth_set_detune: (a: number, b: number) => void;
    readonly wasmsynth_set_filter_cutoff: (a: number, b: number) => void;
    readonly wasmsynth_set_filter_resonance: (a: number, b: number) => void;
    readonly wasmsynth_set_master_gain: (a: number, b: number) => void;
    readonly wasmsynth_set_reverb_mix: (a: number, b: number) => void;
    readonly wasmsynth_set_waveform: (a: number, b: number) => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
