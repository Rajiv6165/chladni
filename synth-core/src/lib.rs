mod effects;
mod modal;
mod voice;

use wasm_bindgen::prelude::*;
use effects::SimpleDelay;
use modal::{ModalPlateEngine, MODE_TABLE, MAX_MODES};
use voice::{Voice, Waveform};

const MAX_VOICES: usize = 8;

#[wasm_bindgen]
pub struct WasmSynth {
    voices: Vec<Voice>,
    modal_engine: ModalPlateEngine,
    delay: SimpleDelay,
    engine_mode: u8, // 0 = Subtractive, 1 = Modal
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
            modal_engine: ModalPlateEngine::new(sample_rate),
            delay: SimpleDelay::new(sample_rate, 300.0), // 300ms default delay
            engine_mode: 0, // Default to Subtractive
            filter_cutoff: 2000.0,
            filter_resonance: 0.5,
            master_gain: 1.0,
            target_master_gain: 1.0,
        }
    }

    pub fn set_engine_mode(&mut self, mode: u8) {
        self.engine_mode = if mode == 1 { 1 } else { 0 };
    }

    pub fn get_engine_mode(&self) -> u8 {
        self.engine_mode
    }

    pub fn note_on(&mut self, freq: f32, velocity: f32) {
        if self.engine_mode == 1 {
            // In modal mode, standard note_on strikes with default resonant coordinates
            self.modal_engine.strike(0.38, 0.42, velocity, freq);
            return;
        }

        // Subtractive engine voice allocation
        if let Some(voice) = self.voices.iter_mut().find(|v| !v.active) {
            voice.note_on(freq, velocity);
        } else {
            // Voice stealing: take the first one
            self.voices[0].note_off(); // Quick release
            self.voices[0].note_on(freq, velocity);
        }
    }

    pub fn note_off(&mut self, freq: f32) {
        if self.engine_mode == 1 {
            // Modal strikes ring down naturally, no note_off needed
            return;
        }

        for voice in self.voices.iter_mut() {
            if voice.active && (voice.note_freq - freq).abs() < 0.1 {
                voice.note_off();
            }
        }
    }

    // --- Phase 9 Modal Engine API ---

    pub fn strike(&mut self, x: f32, y: f32, velocity: f32, freq: f32) {
        if self.engine_mode == 0 {
            // If in subtractive mode, trigger voice note_on
            self.note_on(freq, velocity);
        } else {
            self.modal_engine.strike(x, y, velocity, freq);
        }
    }

    pub fn set_material(&mut self, mat_id: u8) {
        self.modal_engine.set_material(mat_id);
    }

    pub fn set_decay(&mut self, decay: f32) {
        self.modal_engine.set_decay(decay);
    }

    pub fn set_damping_tilt(&mut self, tilt: f32) {
        self.modal_engine.set_damping_tilt(tilt);
    }

    pub fn set_brightness(&mut self, brightness: f32) {
        self.modal_engine.set_brightness(brightness);
    }

    pub fn set_mode_count(&mut self, count: u32) {
        self.modal_engine.set_mode_count(count as usize);
    }

    // Copies live mode amplitudes to destination Float32Array (size up to MAX_MODES)
    pub fn get_mode_amplitudes(&self, output_buffer: &mut [f32]) {
        let len = output_buffer.len().min(MAX_MODES);
        output_buffer[..len].copy_from_slice(&self.modal_engine.live_amplitudes[..len]);
    }

    // Copies static mode (n, m) coordinates to destination Float32Array (n_0, m_0, n_1, m_1, ...)
    pub fn get_mode_table(&self, output_buffer: &mut [f32]) {
        let max_pairs = output_buffer.len() / 2;
        let count = max_pairs.min(MAX_MODES);
        for i in 0..count {
            output_buffer[i * 2] = MODE_TABLE[i].n as f32;
            output_buffer[i * 2 + 1] = MODE_TABLE[i].m as f32;
        }
    }

    // --- Subtractive / Common Engine API ---

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

            let raw_sample = if self.engine_mode == 1 {
                self.modal_engine.process()
            } else {
                let mut mixed = 0.0;
                for voice in self.voices.iter_mut() {
                    mixed += voice.process();
                }
                mixed
            };
            
            // Apply delay effect (common across both engines)
            let with_delay = self.delay.process(raw_sample);
            
            // Master gain and soft clipping to prevent distortion
            *sample = (with_delay * self.master_gain).tanh();
        }

        if self.engine_mode == 1 {
            self.modal_engine.update_live_amplitudes();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_synth_default_sound_compatibility() {
        let mut synth = WasmSynth::new(44100.0);
        assert_eq!(synth.get_engine_mode(), 0); // Default must be Subtractive
        let mut buffer = [0.0f32; 128];
        synth.note_on(440.0, 1.0);
        synth.process(&mut buffer);

        // Verify output is non-zero and bounded
        let max_val = buffer.iter().fold(0.0f32, |m, &x| m.max(x.abs()));
        assert!(max_val > 0.0);
        assert!(max_val <= 1.0);
    }

    #[test]
    fn test_modal_engine_switching_and_strike() {
        let mut synth = WasmSynth::new(44100.0);
        synth.set_engine_mode(1);
        assert_eq!(synth.get_engine_mode(), 1);

        // Strike modal plate
        synth.strike(0.3, 0.4, 1.0, 220.0);

        let mut buffer = [0.0f32; 128];
        synth.process(&mut buffer);

        let max_val = buffer.iter().fold(0.0f32, |m, &x| m.max(x.abs()));
        assert!(max_val > 0.0, "Modal plate should produce sound upon strike");
        assert!(max_val <= 1.0, "Modal output should be bounded");

        let mut live_amps = [0.0f32; 16];
        synth.get_mode_amplitudes(&mut live_amps);
        let amp_sum: f32 = live_amps.iter().sum();
        assert!(amp_sum > 0.0, "Live amplitudes must be positive after strike");
    }

    #[test]
    fn test_seamless_engine_switching_without_click() {
        let mut synth = WasmSynth::new(44100.0);
        let mut buffer = [0.0f32; 128];

        synth.note_on(220.0, 1.0);
        synth.process(&mut buffer);

        // Switch to modal engine while sound is playing
        synth.set_engine_mode(1);
        synth.strike(0.5, 0.5, 0.8, 330.0);
        synth.process(&mut buffer);

        for &s in buffer.iter() {
            assert!(s.is_finite());
            assert!(s.abs() <= 1.0);
        }

        // Switch back to subtractive engine
        synth.set_engine_mode(0);
        synth.note_on(440.0, 0.8);
        synth.process(&mut buffer);

        for &s in buffer.iter() {
            assert!(s.is_finite());
            assert!(s.abs() <= 1.0);
        }
    }
}
