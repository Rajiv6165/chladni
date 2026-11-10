mod effects;
mod voice;

use wasm_bindgen::prelude::*;
use effects::SimpleDelay;
use voice::{Voice, Waveform};

const MAX_VOICES: usize = 8;

#[wasm_bindgen]
pub struct WasmSynth {
    voices: Vec<Voice>,
    delay: SimpleDelay,
    filter_cutoff: f32,
    filter_resonance: f32,
    master_gain: f32,
    target_master_gain: f32,
}

#[wasm_bindgen]
impl WasmSynth {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> Self {
        let mut voices = Vec::with_capacity(MAX_VOICES);
        for _ in 0..MAX_VOICES {
            voices.push(Voice::new(sample_rate));
        }

        Self {
            voices,
            delay: SimpleDelay::new(sample_rate, 300.0), // 300ms default delay
            filter_cutoff: 2000.0,
            filter_resonance: 0.5,
            master_gain: 1.0,
            target_master_gain: 1.0,
        }
    }

    pub fn note_on(&mut self, freq: f32, velocity: f32) {
        // Find an inactive voice, or steal the oldest active one (naive stealing)
        if let Some(voice) = self.voices.iter_mut().find(|v| !v.active) {
            voice.note_on(freq, velocity);
        } else {
            // Voice stealing: take the first one
            self.voices[0].note_off(); // Quick release
            self.voices[0].note_on(freq, velocity);
        }
    }

    pub fn note_off(&mut self, freq: f32) {
        // Find voice matching freq (with some epsilon)
        for voice in self.voices.iter_mut() {
            if voice.active && (voice.note_freq - freq).abs() < 0.1 {
                voice.note_off();
            }
        }
    }

    pub fn set_filter_cutoff(&mut self, cutoff: f32) {
        self.filter_cutoff = cutoff;
        for voice in self.voices.iter_mut() {
            voice.set_filter_params(self.filter_cutoff, self.filter_resonance);
        }
    }

    pub fn set_filter_resonance(&mut self, resonance: f32) {
        self.filter_resonance = resonance;
        for voice in self.voices.iter_mut() {
            voice.set_filter_params(self.filter_cutoff, self.filter_resonance);
        }
    }

    pub fn set_reverb_mix(&mut self, mix: f32) {
        self.delay.set_mix(mix);
    }

    // --- Phase 7 Preset Expansion Surface ---

    pub fn set_waveform(&mut self, waveform: u8) {
        let wf = Waveform::from_u8(waveform);
        for voice in self.voices.iter_mut() {
            voice.set_waveform(wf);
        }
    }

    pub fn set_adsr(&mut self, attack_sec: f32, decay_sec: f32, sustain: f32, release_sec: f32) {
        for voice in self.voices.iter_mut() {
            voice.set_adsr(attack_sec, decay_sec, sustain, release_sec);
        }
    }

    pub fn set_delay_time(&mut self, delay_ms: f32) {
        self.delay.set_delay_time(delay_ms);
    }

    pub fn set_delay_feedback(&mut self, feedback: f32) {
        self.delay.set_feedback(feedback);
    }

    pub fn set_detune(&mut self, cents: f32) {
        for voice in self.voices.iter_mut() {
            voice.set_detune(cents);
        }
    }

    pub fn set_master_gain(&mut self, gain: f32) {
        self.target_master_gain = gain.clamp(0.0, 2.0);
    }

    // Fills the given f32 buffer with audio samples. 
    // This is called per quantum (e.g., 128 samples) from AudioWorklet.
    pub fn process(&mut self, output_buffer: &mut [f32]) {
        for sample in output_buffer.iter_mut() {
            self.master_gain += (self.target_master_gain - self.master_gain) * 0.005;

            let mut mixed = 0.0;
            for voice in self.voices.iter_mut() {
                mixed += voice.process();
            }
            
            // Apply delay effect
            mixed = self.delay.process(mixed);
            
            // Master gain and soft clipping to prevent distortion
            *sample = (mixed * self.master_gain).tanh();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_synth_default_sound_compatibility() {
        let mut synth = WasmSynth::new(44100.0);
        let mut buffer = [0.0f32; 128];
        synth.note_on(440.0, 1.0);
        synth.process(&mut buffer);

        // Verify output is non-zero and bounded
        let max_val = buffer.iter().fold(0.0f32, |m, &x| m.max(x.abs()));
        assert!(max_val > 0.0);
        assert!(max_val <= 1.0);
    }

    #[test]
    fn test_synth_preset_switching_stability() {
        let mut synth = WasmSynth::new(44100.0);
        let mut buffer = [0.0f32; 128];

        synth.note_on(220.0, 1.0);

        // Switch through waveforms and presets while processing
        for wf in 0..4 {
            synth.set_waveform(wf);
            synth.set_adsr(0.05, 0.2, 0.4, 0.3);
            synth.set_filter_cutoff(800.0 + (wf as f32) * 500.0);
            synth.set_filter_resonance(0.3 + (wf as f32) * 0.1);
            synth.set_delay_time(100.0 + (wf as f32) * 50.0);
            synth.set_delay_feedback(0.4);
            synth.set_reverb_mix(0.3);
            synth.set_detune(5.0 * (wf as f32));
            synth.set_master_gain(1.1);

            for _ in 0..10 {
                synth.process(&mut buffer);
                for &s in buffer.iter() {
                    assert!(s.is_finite(), "Sample was not finite during preset switch");
                    assert!(s.abs() <= 1.0, "Sample clipped excessively: {}", s);
                }
            }
        }
    }
}
