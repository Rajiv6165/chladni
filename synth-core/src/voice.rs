use std::f32::consts::PI;

#[derive(Copy, Clone, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Waveform {
    Saw = 0,
    Square = 1,
    Triangle = 2,
    Sine = 3,
}

impl Waveform {
    pub fn from_u8(val: u8) -> Self {
        match val {
            1 => Waveform::Square,
            2 => Waveform::Triangle,
            3 => Waveform::Sine,
            _ => Waveform::Saw,
        }
    }
}

pub struct AdsREnvelope {
    sample_rate: f32,
    attack_rate: f32,
    decay_rate: f32,
    sustain_level: f32,
    release_rate: f32,
    
    level: f32,
    state: EnvelopeState,
}

#[derive(PartialEq, Debug)]
enum EnvelopeState {
    Idle,
    Attack,
    Decay,
    Sustain,
    Release,
}

impl AdsREnvelope {
    pub fn new(sample_rate: f32) -> Self {
        let mut env = Self {
            sample_rate,
            attack_rate: 0.0,
            decay_rate: 0.0,
            sustain_level: 0.7,
            release_rate: 0.0,
            level: 0.0,
            state: EnvelopeState::Idle,
        };
        // Default: 10ms attack, 100ms decay, 0.7 sustain, 200ms release
        env.set_params(0.01, 0.1, 0.7, 0.2);
        env
    }

    pub fn set_params(&mut self, attack_sec: f32, decay_sec: f32, sustain: f32, release_sec: f32) {
        let a = attack_sec.max(0.001);
        let d = decay_sec.max(0.001);
        let r = release_sec.max(0.001);

        self.attack_rate = 1.0 / (a * self.sample_rate);
        self.decay_rate = 1.0 / (d * self.sample_rate);
        self.sustain_level = sustain.clamp(0.0, 1.0);
        self.release_rate = 1.0 / (r * self.sample_rate);
    }

    pub fn note_on(&mut self) {
        self.state = EnvelopeState::Attack;
    }

    pub fn note_off(&mut self) {
        if self.state != EnvelopeState::Idle {
            self.state = EnvelopeState::Release;
        }
    }

    pub fn process(&mut self) -> f32 {
        match self.state {
            EnvelopeState::Idle => {
                self.level = 0.0;
            }
            EnvelopeState::Attack => {
                self.level += self.attack_rate;
                if self.level >= 1.0 {
                    self.level = 1.0;
                    self.state = EnvelopeState::Decay;
                }
            }
            EnvelopeState::Decay => {
                self.level -= self.decay_rate;
                if self.level <= self.sustain_level {
                    self.level = self.sustain_level;
                    self.state = EnvelopeState::Sustain;
                }
            }
            EnvelopeState::Sustain => {
                // Stay at sustain level
            }
            EnvelopeState::Release => {
                self.level -= self.release_rate;
                if self.level <= 0.0 {
                    self.level = 0.0;
                    self.state = EnvelopeState::Idle;
                }
            }
        }
        self.level
    }

    pub fn is_active(&self) -> bool {
        self.state != EnvelopeState::Idle
    }
}

pub struct SvfFilter {
    sample_rate: f32,
    cutoff: f32,
    target_cutoff: f32,
    resonance: f32,
    target_resonance: f32,
    ic1eq: f32,
    ic2eq: f32,
}

impl SvfFilter {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate,
            cutoff: 1000.0,
            target_cutoff: 1000.0,
            resonance: 0.5,
            target_resonance: 0.5,
            ic1eq: 0.0,
            ic2eq: 0.0,
        }
    }

    pub fn set_params(&mut self, cutoff: f32, resonance: f32) {
        self.target_cutoff = cutoff.clamp(20.0, self.sample_rate * 0.49);
        self.target_resonance = resonance.clamp(0.0, 1.0);
    }

    pub fn process(&mut self, input: f32) -> f32 {
        // Smooth cutoff and resonance to prevent zipper noise when switching presets
        self.cutoff += (self.target_cutoff - self.cutoff) * 0.01;
        self.resonance += (self.target_resonance - self.resonance) * 0.01;

        let g = (PI * self.cutoff / self.sample_rate).tan();
        let k = 2.0 - (2.0 * self.resonance);
        
        let a1 = 1.0 / (1.0 + g * (g + k));
        let a2 = g * a1;
        let a3 = g * a2;

        let v3 = input - self.ic2eq;
        let v1 = a1 * self.ic1eq + a2 * v3;
        let v2 = self.ic2eq + a2 * self.ic1eq + a3 * v3;
        
        self.ic1eq = 2.0 * v1 - self.ic1eq;
        self.ic2eq = 2.0 * v2 - self.ic2eq;
        
        // Lowpass output
        v2
    }
}

pub struct Voice {
    pub active: bool,
    pub note_freq: f32,
    sample_rate: f32,
    phase: f32,
    phase_inc: f32,
    phase2: f32,
    phase_inc2: f32,
    detune_cents: f32,
    target_detune_cents: f32,
    waveform: Waveform,
    envelope: AdsREnvelope,
    filter: SvfFilter,
    velocity: f32,
}

impl Voice {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            active: false,
            note_freq: 0.0,
            sample_rate,
            phase: 0.0,
            phase_inc: 0.0,
            phase2: 0.0,
            phase_inc2: 0.0,
            detune_cents: 0.0,
            target_detune_cents: 0.0,
            waveform: Waveform::Saw,
            envelope: AdsREnvelope::new(sample_rate),
            filter: SvfFilter::new(sample_rate),
            velocity: 0.0,
        }
    }

    pub fn set_waveform(&mut self, wf: Waveform) {
        self.waveform = wf;
    }

    pub fn set_adsr(&mut self, attack_sec: f32, decay_sec: f32, sustain: f32, release_sec: f32) {
        self.envelope.set_params(attack_sec, decay_sec, sustain, release_sec);
    }

    pub fn set_detune(&mut self, cents: f32) {
        self.target_detune_cents = cents.clamp(0.0, 50.0);
    }

    pub fn set_filter_params(&mut self, cutoff: f32, resonance: f32) {
        self.filter.set_params(cutoff, resonance);
    }

    pub fn note_on(&mut self, freq: f32, velocity: f32) {
        self.note_freq = freq;
        self.phase_inc = freq / self.sample_rate;
        self.update_phase2_inc();
        self.velocity = velocity;
        self.envelope.note_on();
        self.active = true;
    }

    pub fn note_off(&mut self) {
        self.envelope.note_off();
    }

    fn update_phase2_inc(&mut self) {
        if self.detune_cents.abs() > 0.001 {
            let ratio = 2.0f32.powf(self.detune_cents / 1200.0);
            self.phase_inc2 = self.phase_inc * ratio;
        } else {
            self.phase_inc2 = self.phase_inc;
        }
    }

    // PolyBLEP quasi-bandlimited step correction
    fn poly_blep(&self, t: f32, dt: f32) -> f32 {
        if t < dt {
            let t = t / dt;
            return t + t - t * t - 1.0;
        } else if t > 1.0 - dt {
            let t = (t - 1.0) / dt;
            return t * t + t + t + 1.0;
        }
        0.0
    }

    // Band-limited or alias-free oscillator evaluation
    fn sample_oscillator(&self, phase: f32, phase_inc: f32) -> f32 {
        match self.waveform {
            Waveform::Saw => {
                // Band-limited sawtooth using PolyBLEP
                let mut saw = 1.0 - 2.0 * phase;
                saw += self.poly_blep(phase, phase_inc);
                saw
            }
            Waveform::Square => {
                // Band-limited square using PolyBLEP at both transitions (0.0 and 0.5)
                let naive_sq = if phase < 0.5 { 1.0 } else { -1.0 };
                let blep0 = self.poly_blep(phase, phase_inc);
                let phase_half = if phase >= 0.5 { phase - 0.5 } else { phase + 0.5 };
                let blep_half = self.poly_blep(phase_half, phase_inc);
                naive_sq + blep0 - blep_half
            }
            Waveform::Triangle => {
                // Triangle wave: continuous with rapid 1/n^2 harmonic roll-off
                if phase < 0.25 {
                    4.0 * phase
                } else if phase < 0.75 {
                    2.0 - 4.0 * phase
                } else {
                    4.0 * phase - 4.0
                }
            }
            Waveform::Sine => {
                // Pure sine: mathematically alias-free at any frequency
                (phase * 2.0 * PI).sin()
            }
        }
    }

    pub fn process(&mut self) -> f32 {
        if !self.active {
            return 0.0;
        }

        let env_val = self.envelope.process();
        if !self.envelope.is_active() {
            self.active = false;
            return 0.0;
        }

        // Smooth detune parameter
        if (self.target_detune_cents - self.detune_cents).abs() > 0.001 {
            self.detune_cents += (self.target_detune_cents - self.detune_cents) * 0.005;
            self.update_phase2_inc();
        }

        // Generate primary oscillator
        let mut osc = self.sample_oscillator(self.phase, self.phase_inc);

        // Advance primary phase
        self.phase += self.phase_inc;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }

        // Unison second oscillator if detuned
        if self.detune_cents > 0.05 {
            let osc2 = self.sample_oscillator(self.phase2, self.phase_inc2);
            self.phase2 += self.phase_inc2;
            if self.phase2 >= 1.0 {
                self.phase2 -= 1.0;
            }
            // Equal-power sum
            osc = (osc + osc2) * 0.7071;
        }

        // Apply filter and envelope
        let filtered = self.filter.process(osc);
        filtered * env_val * self.velocity * 0.2 // Volume scaling
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_envelope_reaches_zero() {
        let sample_rate = 44100.0;
        let mut env = AdsREnvelope::new(sample_rate);
        
        env.note_on();
        // attack + decay is 110ms. Run for 200ms
        for _ in 0..8820 {
            env.process();
        }
        
        env.note_off();
        // release is 200ms. Run for 300ms
        for _ in 0..13230 {
            env.process();
        }
        
        assert_eq!(env.process(), 0.0);
        assert!(!env.is_active());
    }

    #[test]
    fn test_custom_adsr_timing_reaches_zero() {
        let sample_rate = 44100.0;
        let mut env = AdsREnvelope::new(sample_rate);
        // Fast 5ms attack, 20ms decay, 0.3 sustain, 50ms release
        env.set_params(0.005, 0.02, 0.3, 0.05);

        env.note_on();
        // Run attack + decay (~25ms = 1102 samples) + extra 25ms
        for _ in 0..2205 {
            env.process();
        }
        assert!((env.process() - 0.3).abs() < 0.01);

        env.note_off();
        // Release 50ms = 2205 samples. Run 3000 samples
        for _ in 0..3000 {
            env.process();
        }
        assert_eq!(env.process(), 0.0);
        assert!(!env.is_active());
    }

    #[test]
    fn test_filter_stability() {
        let sample_rate = 44100.0;
        let mut filter = SvfFilter::new(sample_rate);
        filter.set_params(20000.0, 1.0); // max cutoff, max resonance
        
        let mut max_val = 0.0f32;
        // feed it a step impulse
        for i in 0..1000 {
            let input = if i == 0 { 1.0 } else { 0.0 };
            let out = filter.process(input);
            if out.abs() > max_val {
                max_val = out.abs();
            }
        }
        // Should not explode to infinity
        assert!(max_val < 100.0);
    }

    #[test]
    fn test_voice_output_range() {
        let sample_rate = 44100.0;
        let mut voice = Voice::new(sample_rate);
        voice.note_on(440.0, 1.0);
        
        let mut max_out = 0.0f32;
        for _ in 0..44100 {
            let out = voice.process().abs();
            if out > max_out {
                max_out = out;
            }
        }
        
        // Voice is scaled by 0.2, so it shouldn't exceed that too much
        assert!(max_out <= 0.25);
    }

    #[test]
    fn test_all_waveforms_output_bounded() {
        let sample_rate = 44100.0;
        let waveforms = [
            Waveform::Saw,
            Waveform::Square,
            Waveform::Triangle,
            Waveform::Sine,
        ];

        for &wf in &waveforms {
            let mut voice = Voice::new(sample_rate);
            voice.set_waveform(wf);
            voice.set_detune(15.0); // Test with unison detune enabled
            voice.note_on(440.0, 1.0);

            let mut max_out = 0.0f32;
            for _ in 0..2000 {
                let out = voice.process().abs();
                assert!(out.is_finite(), "Output must be finite for {:?}", wf);
                if out > max_out {
                    max_out = out;
                }
            }
            // Max out should be reasonably bounded around volume scale 0.2 (allowing for filter ringing/resonance)
            assert!(max_out <= 0.5, "Waveform {:?} exceeded safe bound: {}", wf, max_out);
        }
    }
}
