use std::f32::consts::PI;

pub const MAX_MODES: usize = 32;
pub const DEFAULT_MODES: usize = 16;
pub const MAX_MODAL_VOICES: usize = 8;

#[derive(Copy, Clone, Debug, PartialEq)]
pub struct ModeCoord {
    pub n: u8,
    pub m: u8,
    pub ratio: f32, // (n^2 + m^2) / 2
}

// Precomputed table of simply-supported square plate modes sorted by frequency ratio:
// f(n, m) = f0 * (n^2 + m^2) / 2
// Mode (1, 1) has ratio (1 + 1)/2 = 1.0 (fundamental)
pub const MODE_TABLE: [ModeCoord; MAX_MODES] = [
    ModeCoord { n: 1, m: 1, ratio: 1.0 },   // (1+1)/2 = 1.0
    ModeCoord { n: 1, m: 2, ratio: 2.5 },   // (1+4)/2 = 2.5
    ModeCoord { n: 2, m: 1, ratio: 2.5 },   // (4+1)/2 = 2.5
    ModeCoord { n: 2, m: 2, ratio: 4.0 },   // (4+4)/2 = 4.0
    ModeCoord { n: 1, m: 3, ratio: 5.0 },   // (1+9)/2 = 5.0
    ModeCoord { n: 3, m: 1, ratio: 5.0 },   // (9+1)/2 = 5.0
    ModeCoord { n: 2, m: 3, ratio: 6.5 },   // (4+9)/2 = 6.5
    ModeCoord { n: 3, m: 2, ratio: 6.5 },   // (9+4)/2 = 6.5
    ModeCoord { n: 1, m: 4, ratio: 8.5 },   // (1+16)/2 = 8.5
    ModeCoord { n: 4, m: 1, ratio: 8.5 },   // (16+1)/2 = 8.5
    ModeCoord { n: 3, m: 3, ratio: 9.0 },   // (9+9)/2 = 9.0
    ModeCoord { n: 2, m: 4, ratio: 10.0 },  // (4+16)/2 = 10.0
    ModeCoord { n: 4, m: 2, ratio: 10.0 },  // (16+4)/2 = 10.0
    ModeCoord { n: 3, m: 4, ratio: 12.5 },  // (9+16)/2 = 12.5
    ModeCoord { n: 4, m: 3, ratio: 12.5 },  // (16+9)/2 = 12.5
    ModeCoord { n: 1, m: 5, ratio: 13.0 },  // (1+25)/2 = 13.0
    ModeCoord { n: 5, m: 1, ratio: 13.0 },  // (25+1)/2 = 13.0
    ModeCoord { n: 2, m: 5, ratio: 14.5 },  // (4+25)/2 = 14.5
    ModeCoord { n: 5, m: 2, ratio: 14.5 },  // (25+4)/2 = 14.5
    ModeCoord { n: 4, m: 4, ratio: 16.0 },  // (16+16)/2 = 16.0
    ModeCoord { n: 3, m: 5, ratio: 17.0 },  // (9+25)/2 = 17.0
    ModeCoord { n: 5, m: 3, ratio: 17.0 },  // (25+9)/2 = 17.0
    ModeCoord { n: 1, m: 6, ratio: 18.5 },  // (1+36)/2 = 18.5
    ModeCoord { n: 6, m: 1, ratio: 18.5 },  // (36+1)/2 = 18.5
    ModeCoord { n: 2, m: 6, ratio: 20.0 },  // (4+36)/2 = 20.0
    ModeCoord { n: 6, m: 2, ratio: 20.0 },  // (36+4)/2 = 20.0
    ModeCoord { n: 4, m: 5, ratio: 20.5 },  // (16+25)/2 = 20.5
    ModeCoord { n: 5, m: 4, ratio: 20.5 },  // (25+16)/2 = 20.5
    ModeCoord { n: 3, m: 6, ratio: 22.5 },  // (9+36)/2 = 22.5
    ModeCoord { n: 6, m: 3, ratio: 22.5 },  // (36+9)/2 = 22.5
    ModeCoord { n: 5, m: 5, ratio: 25.0 },  // (25+25)/2 = 25.0
    ModeCoord { n: 2, m: 7, ratio: 26.5 },  // (4+49)/2 = 26.5
];

#[derive(Copy, Clone, Debug, PartialEq)]
pub enum MaterialType {
    Glass = 0,
    Brass = 1,
    Bronze = 2,
    Wood = 3,
    Ceramic = 4,
}

impl MaterialType {
    pub fn from_u8(val: u8) -> Self {
        match val {
            0 => MaterialType::Glass,
            1 => MaterialType::Brass,
            2 => MaterialType::Bronze,
            3 => MaterialType::Wood,
            4 => MaterialType::Ceramic,
            _ => MaterialType::Brass,
        }
    }

    pub fn default_params(&self) -> (f32, f32) {
        // Returns (base_decay_sec, damping_tilt)
        match self {
            MaterialType::Glass => (3.5, 0.15),
            MaterialType::Brass => (2.0, 0.50),
            MaterialType::Bronze => (4.0, 0.35),
            MaterialType::Wood => (0.45, 1.30),
            MaterialType::Ceramic => (2.5, 0.60),
        }
    }
}

// Coupled state-space resonator: u[n] and v[n] represent orthogonal quadrature components.
// Absolute stability: eigenvalues strictly bounded to radius r < 1.0.
// Instantaneous mode amplitude is exactly sqrt(u^2 + v^2) at any sample.
#[derive(Copy, Clone, Debug)]
pub struct CoupledResonator {
    pub u: f32,
    pub v: f32,
    pub a: f32, // r * cos(theta)
    pub b: f32, // r * sin(theta)
    pub active: bool,
}

impl CoupledResonator {
    pub fn new() -> Self {
        Self {
            u: 0.0,
            v: 0.0,
            a: 0.0,
            b: 0.0,
            active: false,
        }
    }

    pub fn set_coefficients(&mut self, freq: f32, t60: f32, sample_rate: f32) {
        if freq <= 5.0 || freq >= sample_rate * 0.49 || t60 <= 0.001 {
            self.a = 0.0;
            self.b = 0.0;
            self.active = false;
            return;
        }

        let theta = (2.0 * PI * freq / sample_rate).clamp(0.0001, PI * 0.98);
        // T60 decay rate: amplitude drops by 60 dB (10^-3) in T60 seconds:
        // r = exp(-6.907755 / (T60 * fs))
        let r = (-6.907755 / (t60 * sample_rate)).exp().clamp(0.0, 0.99999);

        self.a = r * theta.cos();
        self.b = r * theta.sin();
    }

    pub fn excite(&mut self, impulse: f32) {
        // Direct injection into quadrature state
        self.u += impulse;
        if self.u.abs() > 1e-12 {
            self.active = true;
        }
    }

    #[inline(always)]
    pub fn process(&mut self) -> f32 {
        if !self.active {
            return 0.0;
        }

        // Coupled rotation:
        // u_next = a * u - b * v
        // v_next = b * u + a * v
        let u_next = self.a * self.u - self.b * self.v;
        let v_next = self.b * self.u + self.a * self.v;

        // Guard against floating point denormals below acoustic audibility (-120 dB)
        let energy_sq = u_next * u_next + v_next * v_next;
        if energy_sq < 1e-12 {
            self.u = 0.0;
            self.v = 0.0;
            self.active = false;
            return 0.0;
        }

        self.u = u_next;
        self.v = v_next;

        self.u
    }

    #[inline(always)]
    #[cfg(test)]
    pub fn amplitude(&self) -> f32 {
        if !self.active {
            0.0
        } else {
            (self.u * self.u + self.v * self.v).sqrt()
        }
    }

    pub fn reset(&mut self) {
        self.u = 0.0;
        self.v = 0.0;
        self.active = false;
    }
}

pub struct ModalVoice {
    pub modes: [CoupledResonator; MAX_MODES],
    pub active_mode_count: usize,
    pub fundamental_freq: f32,
    pub age: u64,
    pub active: bool,
    sample_rate: f32,
}

impl ModalVoice {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            modes: [CoupledResonator::new(); MAX_MODES],
            active_mode_count: DEFAULT_MODES,
            fundamental_freq: 220.0,
            age: 0,
            active: false,
            sample_rate,
        }
    }

    pub fn configure_modes(
        &mut self,
        fundamental: f32,
        base_decay: f32,
        damping_tilt: f32,
        mode_count: usize,
    ) {
        self.fundamental_freq = fundamental.clamp(20.0, 2000.0);
        self.active_mode_count = mode_count.clamp(4, MAX_MODES);

        for k in 0..self.active_mode_count {
            let coord = &MODE_TABLE[k];
            let mode_freq = self.fundamental_freq * coord.ratio;

            // Frequency-dependent damping: higher modes decay faster based on tilt
            // T60_k = base_decay * (1.0 / ratio)^damping_tilt
            let decay_factor = (1.0 / coord.ratio).powf(damping_tilt.clamp(0.0, 2.5));
            let mode_t60 = (base_decay * decay_factor).clamp(0.005, 15.0);

            self.modes[k].set_coefficients(mode_freq, mode_t60, self.sample_rate);
        }

        // Deactivate unused modes above mode_count
        for k in self.active_mode_count..MAX_MODES {
            self.modes[k].reset();
        }
    }

    pub fn strike(&mut self, x: f32, y: f32, velocity: f32, brightness: f32) {
        let x_clamped = x.clamp(0.01, 0.99);
        let y_clamped = y.clamp(0.01, 0.99);
        let vel = velocity.clamp(0.0, 1.0);
        let bright = brightness.clamp(0.0, 1.0);

        let mut any_excited = false;

        for k in 0..self.active_mode_count {
            let coord = &MODE_TABLE[k];
            let n = coord.n as f32;
            let m = coord.m as f32;

            // Physical spatial projection:
            // Point force at (x, y) couples to mode (n, m) with weight sin(n*pi*x) * sin(m*pi*y)
            // Striking a nodal line (where sin = 0) leaves that mode silent!
            let spatial_coupling = (n * PI * x_clamped).sin() * (m * PI * y_clamped).sin();

            // High-frequency roll-off governed by strike brightness (mallet hardness)
            let brightness_weight = (1.0 / coord.ratio).powf(1.2 * (1.0 - bright));

            // Overall mode excitation
            let impulse = vel * spatial_coupling * brightness_weight * 0.15; // Scaled to prevent clipping

            if impulse.abs() > 1e-6 {
                self.modes[k].excite(impulse);
                any_excited = true;
            }
        }

        if any_excited {
            self.active = true;
            self.age = 0;
        }
    }

    #[inline(always)]
    pub fn process(&mut self) -> f32 {
        if !self.active {
            return 0.0;
        }

        self.age += 1;
        let mut sum = 0.0;
        let mut still_ringing = false;

        for k in 0..self.active_mode_count {
            if self.modes[k].active {
                sum += self.modes[k].process();
                still_ringing = true;
            }
        }

        if !still_ringing {
            self.active = false;
        }

        sum
    }

    pub fn total_energy(&self) -> f32 {
        if !self.active {
            return 0.0;
        }
        let mut energy = 0.0;
        for k in 0..self.active_mode_count {
            energy += self.modes[k].u * self.modes[k].u + self.modes[k].v * self.modes[k].v;
        }
        energy
    }

    pub fn quick_release(&mut self) {
        for mode in self.modes.iter_mut() {
            mode.u *= 0.1;
            mode.v *= 0.1;
        }
    }
}

pub struct ModalPlateEngine {
    voices: Vec<ModalVoice>,
    pub material: MaterialType,
    pub base_decay: f32,
    pub damping_tilt: f32,
    pub brightness: f32,
    pub mode_count: usize,
    pub live_amplitudes: [f32; MAX_MODES],
}

impl ModalPlateEngine {
    pub fn new(sample_rate: f32) -> Self {
        let mut voices = Vec::with_capacity(MAX_MODAL_VOICES);
        for _ in 0..MAX_MODAL_VOICES {
            voices.push(ModalVoice::new(sample_rate));
        }

        let material = MaterialType::Brass;
        let (default_decay, default_tilt) = material.default_params();

        Self {
            voices,
            material,
            base_decay: default_decay,
            damping_tilt: default_tilt,
            brightness: 0.5,
            mode_count: DEFAULT_MODES,
            live_amplitudes: [0.0; MAX_MODES],
        }
    }

    pub fn set_material(&mut self, mat_id: u8) {
        self.material = MaterialType::from_u8(mat_id);
        let (decay, tilt) = self.material.default_params();
        self.base_decay = decay;
        self.damping_tilt = tilt;
    }

    pub fn set_decay(&mut self, decay: f32) {
        self.base_decay = decay.clamp(0.05, 12.0);
    }

    pub fn set_damping_tilt(&mut self, tilt: f32) {
        self.damping_tilt = tilt.clamp(0.0, 2.5);
    }

    pub fn set_brightness(&mut self, brightness: f32) {
        self.brightness = brightness.clamp(0.0, 1.0);
    }

    pub fn set_mode_count(&mut self, count: usize) {
        self.mode_count = count.clamp(4, MAX_MODES);
    }

    pub fn strike(&mut self, x: f32, y: f32, velocity: f32, freq: f32) {
        // Voice allocation strategy:
        // 1. Find inactive voice
        // 2. Or steal the voice with lowest energy
        let best_voice_idx = if let Some(idx) = self.voices.iter().position(|v| !v.active) {
            idx
        } else {
            let mut min_energy = f32::MAX;
            let mut min_idx = 0;
            for (i, v) in self.voices.iter().enumerate() {
                let e = v.total_energy();
                if e < min_energy {
                    min_energy = e;
                    min_idx = i;
                }
            }
            self.voices[min_idx].quick_release();
            min_idx
        };

        let voice = &mut self.voices[best_voice_idx];
        voice.configure_modes(freq, self.base_decay, self.damping_tilt, self.mode_count);
        voice.strike(x, y, velocity, self.brightness);
    }

    // Allocation-free per-sample processing loop
    pub fn process(&mut self) -> f32 {
        let mut mixed = 0.0;
        for voice in self.voices.iter_mut() {
            mixed += voice.process();
        }

        // Soft saturation limiter on voice mix
        (mixed * 1.2).tanh()
    }

    // Computes and stores the instantaneous amplitudes of each mode across all voices
    pub fn update_live_amplitudes(&mut self) {
        for k in 0..self.mode_count {
            let mut sum_sq = 0.0;
            for voice in self.voices.iter() {
                if voice.active {
                    let u = voice.modes[k].u;
                    let v = voice.modes[k].v;
                    sum_sq += u * u + v * v;
                }
            }
            self.live_amplitudes[k] = sum_sq.sqrt();
        }
        for k in self.mode_count..MAX_MODES {
            self.live_amplitudes[k] = 0.0;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_coupled_resonator_stability() {
        let sample_rate = 48000.0;
        let mut res = CoupledResonator::new();
        res.set_coefficients(440.0, 0.5, sample_rate);
        res.excite(1.0);

        let mut max_val = 0.0f32;
        for _ in 0..50000 {
            let out = res.process().abs();
            assert!(out.is_finite(), "Output must be finite");
            if out > max_val {
                max_val = out;
            }
        }
        assert!(max_val <= 1.05, "Resonator amplified beyond input: {}", max_val);
        // Energy must decay and flush to silence
        for _ in 0..50000 {
            res.process();
        }
        assert_eq!(res.process(), 0.0);
        assert!(!res.active);
    }

    #[test]
    fn test_nodal_line_strike_silences_mode() {
        let sample_rate = 44100.0;
        let mut voice = ModalVoice::new(sample_rate);
        voice.configure_modes(200.0, 2.0, 0.5, 16);

        // Mode index 1 is (1, 2) and Mode index 2 is (2, 1).
        // For mode (2, 1), n = 2, m = 1.
        // Striking at x = 0.5: sin(2 * pi * 0.5) = sin(pi) = 0.0!
        // Mode (2, 1) MUST be completely silent!
        voice.strike(0.5, 0.3, 1.0, 0.5);

        let mode_2_1_amp = voice.modes[2].amplitude();
        assert!(
            mode_2_1_amp < 1e-5,
            "Mode (2, 1) should be silent when struck at x=0.5, got amp: {}",
            mode_2_1_amp
        );
    }

    #[test]
    fn test_sample_rate_independence() {
        // Test that decay reaches silence proportionally across 44.1k, 48k, and 96k
        let rates = [44100.0, 48000.0, 96000.0];
        for &sr in &rates {
            let mut engine = ModalPlateEngine::new(sr);
            engine.set_decay(0.1); // 100ms decay
            engine.strike(0.3, 0.4, 1.0, 300.0);

            // Run for 300ms (3 * T60)
            let samples = (sr * 0.35) as usize;
            for _ in 0..samples {
                engine.process();
            }
            engine.update_live_amplitudes();

            // After 350ms with 100ms T60, fundamental energy should be down by > 60dB (< 0.001)
            let remaining = engine.live_amplitudes[0];
            assert!(
                remaining < 0.005,
                "Sample rate {} did not decay properly: remaining {}",
                sr,
                remaining
            );
        }
    }

    #[test]
    fn test_all_parameters_at_extremes_stay_finite() {
        let sample_rate = 48000.0;
        let mut engine = ModalPlateEngine::new(sample_rate);

        // Extreme settings: maximum decay, zero tilt, max brightness, max mode count
        engine.set_decay(12.0);
        engine.set_damping_tilt(0.0);
        engine.set_brightness(1.0);
        engine.set_mode_count(32);

        // Strike with velocity > 1 and out-of-bounds coordinates
        engine.strike(-5.0, 10.0, 2.0, 20.0);

        for _ in 0..5000 {
            let sample = engine.process();
            assert!(sample.is_finite(), "Sample exploded to non-finite: {}", sample);
            assert!(sample.abs() <= 1.0, "Limiter failed to contain output: {}", sample);
        }

        // Extremely short decay, maximum tilt
        engine.set_decay(0.01);
        engine.set_damping_tilt(2.5);
        engine.set_brightness(0.0);
        engine.strike(0.5, 0.5, 1.0, 2000.0);

        for _ in 0..2000 {
            let sample = engine.process();
            assert!(sample.is_finite());
            assert!(sample.abs() <= 1.0);
        }
    }
}
