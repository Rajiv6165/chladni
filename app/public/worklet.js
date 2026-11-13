import './polyfill.js';
import init, { WasmSynth } from '../pkg/synth_core.js?v=11';

class SynthWorklet extends AudioWorkletProcessor {
    constructor() {
        super();
        this.synth = null;
        this.buffer = null;
        this.modeAmplitudesBuffer = null;
        this.blockCount = 0;
        this.port.onmessage = this.handleMessage.bind(this);
    }

    async handleMessage(event) {
        const data = event.data;
        if (data.type === 'init_wasm') {
            try {
                await init(data.module);
                
                this.synth = new WasmSynth(data.sampleRate);
                this.buffer = new Float32Array(128);
                this.modeAmplitudesBuffer = new Float32Array(32);
                
                const modeTable = new Float32Array(64);
                this.synth.get_mode_table(modeTable);

                this.port.postMessage({
                    type: 'ready',
                    modeTable: Array.from(modeTable)
                });
            } catch (err) {
                console.error("Failed to init WASM in worklet", err);
            }
            return;
        }

        if (!this.synth) return;
        
        switch (data.type) {
            case 'note_on':
                this.synth.note_on(data.freq, data.velocity);
                break;
            case 'note_off':
                this.synth.note_off(data.freq);
                break;
            case 'set_cutoff':
                this.synth.set_filter_cutoff(data.value);
                break;
            case 'set_resonance':
                this.synth.set_filter_resonance(data.value);
                break;
            case 'set_reverb':
                this.synth.set_reverb_mix(data.value);
                break;
            case 'set_waveform':
                this.synth.set_waveform(data.value);
                break;
            case 'set_adsr':
                this.synth.set_adsr(data.attack, data.decay, data.sustain, data.release);
                break;
            case 'set_delay_time':
                this.synth.set_delay_time(data.value);
                break;
            case 'set_delay_feedback':
                this.synth.set_delay_feedback(data.value);
                break;
            case 'set_detune':
                this.synth.set_detune(data.value);
                break;
            case 'set_master_gain':
                this.synth.set_master_gain(data.value);
                break;
            // Phase 9 Modal Engine Handlers
            case 'set_engine_mode':
                this.synth.set_engine_mode(data.mode);
                break;
            case 'strike':
                this.synth.strike(data.x, data.y, data.velocity, data.freq);
                break;
            case 'set_material':
                this.synth.set_material(data.material);
                break;
            case 'set_decay':
                this.synth.set_decay(data.decay);
                break;
            case 'set_damping_tilt':
                this.synth.set_damping_tilt(data.tilt);
                break;
            case 'set_brightness':
                this.synth.set_brightness(data.brightness);
                break;
            case 'set_mode_count':
                this.synth.set_mode_count(data.count);
                break;
            case 'apply_sound_preset': {
                if (data.engine !== undefined) {
                    this.synth.set_engine_mode(data.engine === 'modal' ? 1 : 0);
                }
                const s = data.sound;
                if (s) {
                    if (typeof s.waveformNumber === 'number') this.synth.set_waveform(s.waveformNumber);
                    if (typeof s.attack === 'number') this.synth.set_adsr(s.attack, s.decay, s.sustain, s.release);
                    if (typeof s.filterCutoff === 'number') this.synth.set_filter_cutoff(s.filterCutoff);
                    if (typeof s.filterResonance === 'number') this.synth.set_filter_resonance(s.filterResonance);
                    if (typeof s.reverbMix === 'number') this.synth.set_reverb_mix(s.reverbMix);
                    if (typeof s.delayTime === 'number') this.synth.set_delay_time(s.delayTime);
                    if (typeof s.delayFeedback === 'number') this.synth.set_delay_feedback(s.delayFeedback);
                    if (typeof s.detune === 'number') this.synth.set_detune(s.detune);
                    if (typeof s.masterGain === 'number') this.synth.set_master_gain(s.masterGain);
                }
                const m = data.modal;
                if (m) {
                    if (typeof m.materialNumber === 'number') this.synth.set_material(m.materialNumber);
                    if (typeof m.decay === 'number') this.synth.set_decay(m.decay);
                    if (typeof m.dampingTilt === 'number') this.synth.set_damping_tilt(m.dampingTilt);
                    if (typeof m.brightness === 'number') this.synth.set_brightness(m.brightness);
                    if (typeof m.modeCount === 'number') this.synth.set_mode_count(m.modeCount);
                }
                break;
            }
        }
    }

    process(inputs, outputs, parameters) {
        if (!this.synth || !this.buffer) {
            return true;
        }

        const output = outputs[0];
        const channel = output[0];
        
        this.synth.process(this.buffer);

        for (let i = 0; i < channel.length; ++i) {
            channel[i] = this.buffer[i];
            
            for (let c = 1; c < output.length; ++c) {
                output[c][i] = this.buffer[i];
            }
        }

        // Throttle live mode amplitudes reporting to ~60Hz (~every 6 blocks of 128 samples at 48kHz)
        this.blockCount++;
        if (this.blockCount >= 6) {
            this.blockCount = 0;
            if (this.synth.get_engine_mode() === 1 && this.modeAmplitudesBuffer) {
                this.synth.get_mode_amplitudes(this.modeAmplitudesBuffer);
                this.port.postMessage({
                    type: 'modal_amplitudes',
                    amplitudes: Array.from(this.modeAmplitudesBuffer)
                });
            }
        }

        return true;
    }
}

registerProcessor('synth-worklet', SynthWorklet);
