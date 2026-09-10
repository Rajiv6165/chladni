pub struct SimpleDelay {
    buffer: Vec<f32>,
    write_pos: usize,
    feedback: f32,
    mix: f32,
}

impl SimpleDelay {
    pub fn new(sample_rate: f32, delay_ms: f32) -> Self {
        let size = ((sample_rate * delay_ms) / 1000.0) as usize;
        let buffer = vec![0.0; size];
        Self {
            buffer,
            write_pos: 0,
            feedback: 0.5,
            mix: 0.0,
        }
    }

    pub fn set_mix(&mut self, mix: f32) {
        self.mix = mix.clamp(0.0, 1.0);
    }

    pub fn process(&mut self, input: f32) -> f32 {
        if self.buffer.is_empty() || self.mix == 0.0 {
            return input;
        }

        let read_pos = self.write_pos;
        let delayed = self.buffer[read_pos];
        
        let new_val = input + delayed * self.feedback;
        self.buffer[self.write_pos] = new_val;
        
        self.write_pos = (self.write_pos + 1) % self.buffer.len();
        
        // mix dry and wet
        input * (1.0 - self.mix) + delayed * self.mix
    }
}
