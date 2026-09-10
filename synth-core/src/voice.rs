use std::f32::consts::PI;

pub struct AdsREnvelope {
    attack_rate: f32,
    decay_rate: f32,
    sustain_level: f32,
    release_rate: f32,
    
    level: f32,
    state: EnvelopeState,
}

#[derive(PartialEq)]
enum EnvelopeState {
    Idle,
    Attack,
    Decay,
    Sustain,
    Release,
}

impl AdsREnvelope {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            attack_rate: 1.0 / (0.01 * sample_rate), // 10ms attack
            decay_rate: 1.0 / (0.1 * sample_rate),  // 100ms decay
            sustain_level: 0.7,
            release_rate: 1.0 / (0.2 * sample_rate), // 200ms release
            level: 0.0,
            state: EnvelopeState::Idle,
        }
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
    resonance: f32,
    ic1eq: f32,
    ic2eq: f32,
}

impl SvfFilter {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate,
            cutoff: 1000.0,
            resonance: 0.5,
            ic1eq: 0.0,
            ic2eq: 0.0,
        }
    }

    pub fn set_params(&mut self, cutoff: f32, resonance: f32) {
        self.cutoff = cutoff.clamp(20.0, self.sample_rate / 2.0);
        self.resonance = resonance.clamp(0.0, 1.0);
    }

    pub fn process(&mut self, input: f32) -> f32 {
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
            envelope: AdsREnvelope::new(sample_rate),
            filter: SvfFilter::new(sample_rate),
            velocity: 0.0,
        }
    }

    pub fn set_filter_params(&mut self, cutoff: f32, resonance: f32) {
        self.filter.set_params(cutoff, resonance);
    }

    pub fn note_on(&mut self, freq: f32, velocity: f32) {
        self.note_freq = freq;
        self.phase_inc = freq / self.sample_rate;
        self.velocity = velocity;
        self.envelope.note_on();
        self.active = true;
    }

    pub fn note_off(&mut self) {
        self.envelope.note_off();
    }

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

    pub fn process(&mut self) -> f32 {
        if !self.active {
            return 0.0;
        }

        let env_val = self.envelope.process();
        if !self.envelope.is_active() {
            self.active = false;
            return 0.0;
        }

        // Naive sawtooth: phase goes from 0 to 1, maps to 1 to -1
        let mut naive_saw = 1.0 - 2.0 * self.phase;
        
        // PolyBLEP anti-aliasing
        naive_saw += self.poly_blep(self.phase, self.phase_inc);

        // Advance phase
        self.phase += self.phase_inc;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }

        // Apply filter and envelope
        let filtered = self.filter.process(naive_saw);
        filtered * env_val * self.velocity * 0.2 // Volume scaling
    }
}
