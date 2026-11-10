import './polyfill.js';
import init, { WasmSynth } from '../pkg/synth_core.js?v=10';

class SynthWorklet extends AudioWorkletProcessor {
    constructor() {
        super();
        this.synth = null;
        this.buffer = null;
        this.port.onmessage = this.handleMessage.bind(this);
    }

    async handleMessage(event) {
        const data = event.data;
        if (data.type === 'init_wasm') {
            try {
                await init(data.module);
                
                this.synth = new WasmSynth(data.sampleRate);
                this.buffer = new Float32Array(128);
                
                this.port.postMessage('ready');
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
            case 'apply_sound_preset': {
                const s = data.sound;
                if (!s) break;
                if (typeof s.waveformNumber === 'number') this.synth.set_waveform(s.waveformNumber);
                if (typeof s.attack === 'number') this.synth.set_adsr(s.attack, s.decay, s.sustain, s.release);
                if (typeof s.filterCutoff === 'number') this.synth.set_filter_cutoff(s.filterCutoff);
                if (typeof s.filterResonance === 'number') this.synth.set_filter_resonance(s.filterResonance);
                if (typeof s.reverbMix === 'number') this.synth.set_reverb_mix(s.reverbMix);
                if (typeof s.delayTime === 'number') this.synth.set_delay_time(s.delayTime);
                if (typeof s.delayFeedback === 'number') this.synth.set_delay_feedback(s.delayFeedback);
                if (typeof s.detune === 'number') this.synth.set_detune(s.detune);
                if (typeof s.masterGain === 'number') this.synth.set_master_gain(s.masterGain);
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

        return true;
    }
}

registerProcessor('synth-worklet', SynthWorklet);
