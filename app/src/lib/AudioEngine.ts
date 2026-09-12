export class AudioEngine {
    audioCtx: AudioContext | null = null;
    synthWorkletNode: AudioWorkletNode | null = null;
    isReady: boolean = false;

    constructor() {}

    async init(onReady?: () => void) {
        if (this.audioCtx) return;

        this.audioCtx = new AudioContext();

        try {
            // Load the worklet from the public directory
            await this.audioCtx.audioWorklet.addModule('/worklet.js?v=9', { type: 'module' });
            
            this.synthWorkletNode = new AudioWorkletNode(this.audioCtx, 'synth-worklet');
            this.synthWorkletNode.connect(this.audioCtx.destination);
            
            // Load WASM from the public directory
            const response = await fetch('/pkg/synth_core_bg.wasm?v=8');
            const buffer = await response.arrayBuffer();
            const wasmModule = await WebAssembly.compile(buffer);

            this.synthWorkletNode.port.onmessage = (e) => {
                if (e.data === 'ready') {
                    this.isReady = true;
                    if (onReady) onReady();
                }
            };

            this.synthWorkletNode.port.postMessage({ type: 'init_wasm', module: wasmModule, sampleRate: this.audioCtx.sampleRate });

        } catch (e) {
            console.error('Failed to init audio worklet', e);
            throw e;
        }
    }

    resume() {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    mtof(note: number): number {
        return 440.0 * Math.pow(2, (note - 69) / 12);
    }

    noteOn(freq: number, velocity: number = 1.0) {
        if (!this.synthWorkletNode || !this.isReady) return;
        this.synthWorkletNode.port.postMessage({
            type: 'note_on',
            freq,
            velocity
        });
    }

    noteOff(freq: number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        this.synthWorkletNode.port.postMessage({
            type: 'note_off',
            freq
        });
    }

    setCutoff(value: number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        this.synthWorkletNode.port.postMessage({ type: 'set_cutoff', value });
    }

    setResonance(value: number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        this.synthWorkletNode.port.postMessage({ type: 'set_resonance', value });
    }

    setReverb(value: number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        this.synthWorkletNode.port.postMessage({ type: 'set_reverb', value });
    }
}

export const audioEngine = new AudioEngine();
