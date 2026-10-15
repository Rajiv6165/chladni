import { encodeWav } from './wavEncoder';

export interface RecordedAudioTake {
    wavBlob: Blob;
    sampleRate: number;
    durationSec: number;
}

export class AudioEngine {
    audioCtx: AudioContext | null = null;
    synthWorkletNode: AudioWorkletNode | null = null;
    recorderWorkletNode: AudioWorkletNode | null = null;
    mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
    isReady: boolean = false;

    analyserNode: AnalyserNode | null = null;
    targetFreq: number = 0;
    currentFreq: number = 0;
    freqEmaAlpha: number = 0.1;
    timeDomainData: Float32Array | null = null;

    // Lossless recording state
    isRecordingAudio: boolean = false;
    recordedChunks: Float32Array[] = [];
    private stopPromiseResolve: ((take: RecordedAudioTake) => void) | null = null;

    constructor() {}

    async init(onReady?: () => void) {
        if (this.audioCtx) return;

        this.audioCtx = new AudioContext();

        try {
            // Load synth and recorder worklets from the public directory
            await this.audioCtx.audioWorklet.addModule('/worklet.js?v=9');
            await this.audioCtx.audioWorklet.addModule('/recorder-worklet.js?v=1');
            
            this.synthWorkletNode = new AudioWorkletNode(this.audioCtx, 'synth-worklet');
            this.recorderWorkletNode = new AudioWorkletNode(this.audioCtx, 'recorder-worklet');
            this.mediaStreamDest = this.audioCtx.createMediaStreamDestination();
            
            this.analyserNode = this.audioCtx.createAnalyser();
            this.analyserNode.fftSize = 2048;
            this.timeDomainData = new Float32Array(this.analyserNode.fftSize);

            // Add master limiter for safety against high resonance
            const limiter = this.audioCtx.createDynamicsCompressor();
            limiter.threshold.setValueAtTime(-3, this.audioCtx.currentTime); // -3dB threshold
            limiter.knee.setValueAtTime(0, this.audioCtx.currentTime); // Hard knee
            limiter.ratio.setValueAtTime(20, this.audioCtx.currentTime); // High ratio for limiting
            limiter.attack.setValueAtTime(0.005, this.audioCtx.currentTime); // Fast attack
            limiter.release.setValueAtTime(0.05, this.audioCtx.currentTime); // Fast release

            // Audio signal graph:
            // synthWorkletNode -> analyserNode -> limiter -> audioCtx.destination (live playback)
            //                                             -> recorderWorkletNode (lossless PCM capture)
            //                                             -> mediaStreamDest (A/V MediaRecorder track)
            this.synthWorkletNode.connect(this.analyserNode);
            this.analyserNode.connect(limiter);
            limiter.connect(this.audioCtx.destination);
            limiter.connect(this.recorderWorkletNode);
            limiter.connect(this.mediaStreamDest);
            
            // Wire up recorder worklet message port
            this.recorderWorkletNode.port.onmessage = (e) => {
                const msg = e.data;
                if (msg.type === 'chunk') {
                    const incoming: Float32Array = msg.buffer;
                    const validLen: number = msg.length;
                    
                    // Copy active samples for WAV assembly
                    const chunk = new Float32Array(validLen);
                    chunk.set(incoming.subarray(0, validLen));
                    this.recordedChunks.push(chunk);

                    // Recycle incoming buffer back to the worklet pool
                    this.recorderWorkletNode?.port.postMessage({
                        type: 'recycle',
                        buffer: incoming.buffer
                    }, [incoming.buffer]);

                    if (!this.isRecordingAudio && this.stopPromiseResolve) {
                        this.finalizeWav();
                    }
                }
            };

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

            this.synthWorkletNode.port.postMessage({
                type: 'init_wasm',
                module: wasmModule,
                sampleRate: this.audioCtx.sampleRate
            });

        } catch (e) {
            console.error('Failed to init audio engine', e);
            throw e;
        }
    }

    startRecording() {
        if (!this.recorderWorkletNode || !this.isReady) return;
        this.recordedChunks = [];
        this.isRecordingAudio = true;
        this.recorderWorkletNode.port.postMessage({ type: 'start' });
    }

    stopRecording(): Promise<RecordedAudioTake> {
        return new Promise((resolve) => {
            if (!this.recorderWorkletNode || !this.isRecordingAudio) {
                const sampleRate = this.audioCtx?.sampleRate || 48000;
                const wavBlob = encodeWav(this.recordedChunks, sampleRate, 2);
                resolve({ wavBlob, sampleRate, durationSec: 0 });
                return;
            }

            this.isRecordingAudio = false;
            this.stopPromiseResolve = resolve;
            this.recorderWorkletNode.port.postMessage({ type: 'stop' });

            // Safety timeout to ensure resolve fires even if worklet was idle
            setTimeout(() => {
                if (this.stopPromiseResolve) {
                    this.finalizeWav();
                }
            }, 120);
        });
    }

    private finalizeWav() {
        if (!this.stopPromiseResolve) return;
        const resolve = this.stopPromiseResolve;
        this.stopPromiseResolve = null;

        const sampleRate = this.audioCtx?.sampleRate || 48000;
        let totalSamples = 0;
        for (let i = 0; i < this.recordedChunks.length; i++) {
            totalSamples += this.recordedChunks[i].length;
        }
        const durationSec = totalSamples / (2 * sampleRate); // Stereo channels = 2
        const wavBlob = encodeWav(this.recordedChunks, sampleRate, 2);

        resolve({ wavBlob, sampleRate, durationSec });
    }

    clearRecordingBuffers() {
        this.recordedChunks = [];
    }

    getMediaStream(): MediaStream | null {
        return this.mediaStreamDest?.stream ?? null;
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
        
        this.targetFreq = freq;
        if (this.currentFreq === 0) this.currentFreq = freq;

        this.synthWorkletNode.port.postMessage({
            type: 'note_on',
            freq,
            velocity
        });
    }

    noteOff(freq: number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        
        this.targetFreq = 0;

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

    getAnalysis(): { rms: number, freq: number } {
        if (!this.analyserNode || !this.timeDomainData) {
            return { rms: 0, freq: this.currentFreq };
        }
        
        // Cast as any to satisfy compiler across varying DOM lib versions
        this.analyserNode.getFloatTimeDomainData(this.timeDomainData as any);
        let sumSquares = 0;
        for (let i = 0; i < this.timeDomainData.length; i++) {
            sumSquares += this.timeDomainData[i] * this.timeDomainData[i];
        }
        const rms = Math.sqrt(sumSquares / this.timeDomainData.length);

        if (this.targetFreq > 0) {
            this.currentFreq = this.currentFreq + (this.targetFreq - this.currentFreq) * this.freqEmaAlpha;
        }

        return { rms, freq: this.currentFreq };
    }
}

export const audioEngine = new AudioEngine();
