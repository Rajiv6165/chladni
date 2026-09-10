mod effects;
mod voice;

use wasm_bindgen::prelude::*;
use effects::SimpleDelay;
use voice::Voice;

const MAX_VOICES: usize = 8;

#[wasm_bindgen]
pub struct WasmSynth {
    voices: Vec<Voice>,
    delay: SimpleDelay,
    filter_cutoff: f32,
    filter_resonance: f32,
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
            delay: SimpleDelay::new(sample_rate, 300.0), // 300ms delay
            filter_cutoff: 2000.0,
            filter_resonance: 0.5,
        }
    }

    pub fn note_on(&mut self, freq: f32, velocity: f32) {
        // Find an inactive voice, or steal the oldest active one (naive stealing)
        if let Some(voice) = self.voices.iter_mut().find(|v| !v.active) {
            voice.note_on(freq, velocity);
        } else {
            // Voice stealing: just take the first one
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

    // Fills the given f32 buffer with audio samples. 
    // This is called per quantum (e.g., 128 samples) from AudioWorklet.
    pub fn process(&mut self, output_buffer: &mut [f32]) {
        for sample in output_buffer.iter_mut() {
            let mut mixed = 0.0;
            for voice in self.voices.iter_mut() {
                mixed += voice.process();
            }
            
            // Apply delay effect
            mixed = self.delay.process(mixed);
            
            // Soft clipping to prevent distortion
            *sample = mixed.tanh();
        }
    }
}
