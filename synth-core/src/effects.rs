pub struct SimpleDelay {
    buffer: Vec<f32>,
    write_pos: usize,
    sample_rate: f32,
    feedback: f32,
    target_feedback: f32,
    mix: f32,
    target_mix: f32,
    delay_samples: f32,
    target_delay_samples: f32,
}

impl SimpleDelay {
    pub fn new(sample_rate: f32, delay_ms: f32) -> Self {
        // Allocate buffer for up to 2.0 seconds of delay to avoid any heap allocation at runtime
        let max_samples = (sample_rate * 2.0).ceil() as usize;
        let buffer = vec![0.0; max_samples.max(1024)];
        let clamped_ms = delay_ms.clamp(10.0, 1500.0);
        let init_delay_samples = (sample_rate * clamped_ms / 1000.0).clamp(1.0, (buffer.len() - 2) as f32);

        Self {
            buffer,
            write_pos: 0,
            sample_rate,
            feedback: 0.5,
            target_feedback: 0.5,
            mix: 0.0,
            target_mix: 0.0,
            delay_samples: init_delay_samples,
            target_delay_samples: init_delay_samples,
        }
    }

    pub fn set_mix(&mut self, mix: f32) {
        self.target_mix = mix.clamp(0.0, 1.0);
    }

    pub fn set_delay_time(&mut self, delay_ms: f32) {
        let clamped_ms = delay_ms.clamp(10.0, 1500.0);
        let max_samples = (self.buffer.len() - 2) as f32;
        self.target_delay_samples = (self.sample_rate * clamped_ms / 1000.0).clamp(1.0, max_samples);
    }

    pub fn set_feedback(&mut self, feedback: f32) {
        // Keep feedback strictly below 1.0 to prevent runaway gain oscillation
        self.target_feedback = feedback.clamp(0.0, 0.95);
    }

    #[cfg(test)]
    pub fn get_feedback(&self) -> f32 {
        self.target_feedback
    }

    pub fn process(&mut self, input: f32) -> f32 {
        if self.buffer.is_empty() {
            return input;
        }

        // Smooth parameters to avoid clicks and pops when changing presets
        self.feedback += (self.target_feedback - self.feedback) * 0.005;
        self.mix += (self.target_mix - self.mix) * 0.005;
        self.delay_samples += (self.target_delay_samples - self.delay_samples) * 0.002;

        if self.mix < 0.0001 && self.target_mix < 0.0001 {
            return input;
        }

        let buf_len = self.buffer.len();
        let buf_len_f = buf_len as f32;

        // Fractional delay with linear interpolation
        let mut read_pos = self.write_pos as f32 - self.delay_samples;
        while read_pos < 0.0 {
            read_pos += buf_len_f;
        }
        while read_pos >= buf_len_f {
            read_pos -= buf_len_f;
        }

        let idx0 = read_pos.floor() as usize % buf_len;
        let idx1 = (idx0 + 1) % buf_len;
        let frac = read_pos - read_pos.floor();

        let delayed = self.buffer[idx0] * (1.0 - frac) + self.buffer[idx1] * frac;

        // Write to delay buffer with feedback soft-saturation
        let new_val = (input + delayed * self.feedback).tanh();
        self.buffer[self.write_pos] = new_val;

        self.write_pos = (self.write_pos + 1) % buf_len;

        // Equal-power style crossfade between dry and wet
        input * (1.0 - self.mix) + delayed * self.mix
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_feedback_clamp_prevents_runaway() {
        let sample_rate = 44100.0;
        let mut delay = SimpleDelay::new(sample_rate, 100.0);
        delay.set_mix(1.0);

        // Attempt to set dangerous feedback values > 1.0
        delay.set_feedback(1.5);
        assert!(delay.get_feedback() <= 0.95);

        delay.set_feedback(99.0);
        assert!(delay.get_feedback() <= 0.95);

        // Process a large input pulse and let feedback run for thousands of samples
        let mut max_val = 0.0f32;
        for i in 0..20000 {
            let input = if i == 0 { 1.0 } else { 0.0 };
            let out = delay.process(input);
            if out.abs() > max_val {
                max_val = out.abs();
            }
        }

        // Bounded output thanks to feedback clamp and tanh saturation
        assert!(max_val.is_finite());
        assert!(max_val <= 1.0);
    }
}
