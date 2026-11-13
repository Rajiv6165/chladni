import { encodeWav } from './wavEncoder';
import { 
    WAVEFORM_MAP, 
    MATERIAL_MAP, 
    type SoundPreset, 
    type WaveformType, 
    type EngineType, 
    type MaterialType, 
    type ModalPreset 
} from './preset';

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

    // Phase 9 Modal synthesis state
    engineMode: EngineType = 'subtractive';
    modalAmplitudes: Float32Array = new Float32Array(32);
    modeTable: Float32Array = new Float32Array(64);
    onModalAmplitudes?: (amps: Float32Array) => void;

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
            // Load synth and recorder worklets relative to current location for GitHub Pages compatibility
            const workletUrl = new URL('worklet.js?v=10', window.location.href).href;
            const recorderWorkletUrl = new URL('recorder-worklet.js?v=1', window.location.href).href;
            await this.audioCtx.audioWorklet.addModule(workletUrl);
            await this.audioCtx.audioWorklet.addModule(recorderWorkletUrl);
            
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

            // Load WASM from location relative to current page for GitHub Pages compatibility
            const wasmUrl = new URL('pkg/synth_core_bg.wasm?v=11', window.location.href).href;
            const response = await fetch(wasmUrl);
            const buffer = await response.arrayBuffer();
            const wasmModule = await WebAssembly.compile(buffer);

            this.synthWorkletNode.port.onmessage = (e) => {
                const msg = e.data;
                if (msg === 'ready' || msg?.type === 'ready') {
                    if (msg?.modeTable && Array.isArray(msg.modeTable)) {
                        this.modeTable.set(msg.modeTable);
                    }
                    this.isReady = true;
                    if (onReady) onReady();
                } else if (msg?.type === 'modal_amplitudes' && Array.isArray(msg.amplitudes)) {
                    this.modalAmplitudes.set(msg.amplitudes);
                    if (this.onModalAmplitudes) {
                        this.onModalAmplitudes(this.modalAmplitudes);
                    }
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

    setWaveform(waveform: WaveformType | number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        const val = typeof waveform === 'number' ? waveform : WAVEFORM_MAP[waveform] ?? 0;
        this.synthWorkletNode.port.postMessage({ type: 'set_waveform', value: val });
    }

    setAdsr(attack: number, decay: number, sustain: number, release: number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        this.synthWorkletNode.port.postMessage({ type: 'set_adsr', attack, decay, sustain, release });
    }

    setDelayTime(value: number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        this.synthWorkletNode.port.postMessage({ type: 'set_delay_time', value });
    }

    setDelayFeedback(value: number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        this.synthWorkletNode.port.postMessage({ type: 'set_delay_feedback', value });
    }

    setDetune(value: number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        this.synthWorkletNode.port.postMessage({ type: 'set_detune', value });
    }

    setMasterGain(value: number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        this.synthWorkletNode.port.postMessage({ type: 'set_master_gain', value });
    }

    // Phase 9 Modal Engine controls
    setEngineMode(mode: EngineType) {
        this.engineMode = mode;
        if (!this.synthWorkletNode || !this.isReady) return;
        this.synthWorkletNode.port.postMessage({ 
            type: 'set_engine_mode', 
            mode: mode === 'modal' ? 1 : 0 
        });
    }

    strike(x: number, y: number, velocity: number = 1.0, freq?: number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        const strikeFreq = freq !== undefined && freq > 0 ? freq : (this.currentFreq || 220.0);
        this.targetFreq = strikeFreq;
        if (this.currentFreq === 0) this.currentFreq = strikeFreq;
        this.synthWorkletNode.port.postMessage({
            type: 'strike',
            x: Math.max(0.01, Math.min(0.99, x)),
            y: Math.max(0.01, Math.min(0.99, y)),
            velocity: Math.max(0.05, Math.min(1.0, velocity)),
            freq: strikeFreq
        });
    }

    setMaterial(material: MaterialType | number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        const id = typeof material === 'number' ? material : (MATERIAL_MAP[material] ?? 1);
        this.synthWorkletNode.port.postMessage({ type: 'set_material', material: id });
    }

    setModalDecay(decay: number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        this.synthWorkletNode.port.postMessage({ type: 'set_decay', decay });
    }

    setDampingTilt(tilt: number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        this.synthWorkletNode.port.postMessage({ type: 'set_damping_tilt', tilt });
    }

    setBrightness(brightness: number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        this.synthWorkletNode.port.postMessage({ type: 'set_brightness', brightness });
    }

    setModeCount(count: number) {
        if (!this.synthWorkletNode || !this.isReady) return;
        this.synthWorkletNode.port.postMessage({ type: 'set_mode_count', count });
    }

    getModalAmplitudes(): Float32Array {
        return this.modalAmplitudes;
    }

    getModeTable(): Float32Array {
        return this.modeTable;
    }

    applySoundPreset(sound: SoundPreset, engine: EngineType = 'subtractive', modal?: ModalPreset) {
        this.engineMode = engine;
        if (!this.synthWorkletNode || !this.isReady) return;
        const waveformNumber = WAVEFORM_MAP[sound.waveform] ?? 0;
        const modalPayload = modal ? {
            ...modal,
            materialNumber: MATERIAL_MAP[modal.material] ?? 1
        } : undefined;

        this.synthWorkletNode.port.postMessage({
            type: 'apply_sound_preset',
            engine,
            sound: {
                ...sound,
                waveformNumber
            },
            modal: modalPayload
        });
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
