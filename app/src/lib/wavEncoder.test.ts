import { describe, it, expect } from 'vitest';
import { encodeWav, parseWavHeader, decodeWavSamples } from './wavEncoder';

describe('WAV Encoder (16-bit PCM)', () => {
  it('generates a valid RIFF/WAVE header with correct markers', async () => {
    const chunk = new Float32Array([0.0, 0.5, -0.5, 0.0]);
    const blob = encodeWav([chunk], 48000, 1);
    const arrayBuffer = await blob.arrayBuffer();
    const header = parseWavHeader(arrayBuffer);

    expect(header.chunkId).toBe('RIFF');
    expect(header.format).toBe('WAVE');
    expect(header.subchunk1Id).toBe('fmt ');
    expect(header.subchunk1Size).toBe(16);
    expect(header.audioFormat).toBe(1); // PCM
    expect(header.subchunk2Id).toBe('data');
    expect(header.bitsPerSample).toBe(16);
  });

  it('correctly calculates length and byte rate fields for stereo 48kHz', async () => {
    // 1000 stereo frames = 2000 samples
    const numFrames = 1000;
    const numChannels = 2;
    const sampleRate = 48000;
    const chunk = new Float32Array(numFrames * numChannels);
    for (let i = 0; i < chunk.length; i++) {
      chunk[i] = Math.sin(i * 0.1);
    }

    const blob = encodeWav([chunk], sampleRate, numChannels);
    const arrayBuffer = await blob.arrayBuffer();
    const header = parseWavHeader(arrayBuffer);

    const expectedDataBytes = numFrames * numChannels * 2; // 4000 bytes
    expect(header.numChannels).toBe(2);
    expect(header.sampleRate).toBe(48000);
    expect(header.byteRate).toBe(48000 * 2 * 2); // 192000
    expect(header.blockAlign).toBe(4);
    expect(header.subchunk2Size).toBe(expectedDataBytes);
    expect(header.chunkSize).toBe(36 + expectedDataBytes);
    expect(header.totalSamples).toBe(numFrames * numChannels);
    expect(arrayBuffer.byteLength).toBe(44 + expectedDataBytes);
  });

  it('correctly calculates length and byte rate fields for mono 44.1kHz', async () => {
    const numSamples = 4410; // 0.1 seconds
    const sampleRate = 44100;
    const chunk = new Float32Array(numSamples);

    const blob = encodeWav([chunk], sampleRate, 1);
    const arrayBuffer = await blob.arrayBuffer();
    const header = parseWavHeader(arrayBuffer);

    const expectedDataBytes = numSamples * 2;
    expect(header.numChannels).toBe(1);
    expect(header.sampleRate).toBe(44100);
    expect(header.byteRate).toBe(44100 * 2);
    expect(header.blockAlign).toBe(2);
    expect(header.subchunk2Size).toBe(expectedDataBytes);
    expect(header.chunkSize).toBe(36 + expectedDataBytes);
  });

  it('preserves known sine wave through encode/decode round-trip within 16-bit quantization error', async () => {
    const sampleRate = 48000;
    const freq = 440.0;
    const durationSec = 0.5;
    const totalFrames = Math.floor(sampleRate * durationSec);
    const original = new Float32Array(totalFrames);

    for (let i = 0; i < totalFrames; i++) {
      original[i] = 0.8 * Math.sin((2 * Math.PI * freq * i) / sampleRate);
    }

    // Encode to WAV (mono)
    const blob = encodeWav([original], sampleRate, 1);
    const arrayBuffer = await blob.arrayBuffer();

    // Verify header
    const header = parseWavHeader(arrayBuffer);
    expect(header.sampleRate).toBe(sampleRate);
    expect(header.numChannels).toBe(1);
    expect(header.totalSamples).toBe(totalFrames);

    // Decode samples back
    const decoded = decodeWavSamples(arrayBuffer);
    expect(decoded.length).toBe(totalFrames);

    // Compare original vs decoded
    let maxError = 0;
    let sumSquaredError = 0;
    for (let i = 0; i < totalFrames; i++) {
      const err = Math.abs(original[i] - decoded[i]);
      if (err > maxError) maxError = err;
      sumSquaredError += err * err;
    }

    const rmsError = Math.sqrt(sumSquaredError / totalFrames);

    // 16-bit PCM quantization step is 1 / 32768 ≈ 0.0000305
    // Quantization error for round-trip should never exceed 1 / 32767
    expect(maxError).toBeLessThan(1.0 / 32760);
    expect(rmsError).toBeLessThan(0.00003);
  });

  it('safely clamps out-of-range float values without wrapping', async () => {
    const extreme = new Float32Array([1.5, -1.8, 1.0, -1.0, 0.0]);
    const blob = encodeWav([extreme], 48000, 1);
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = decodeWavSamples(arrayBuffer);

    // 1.5 should clamp to 1.0 (int16 32767 -> ~1.0)
    expect(decoded[0]).toBeCloseTo(1.0, 4);
    // -1.8 should clamp to -1.0 (int16 -32768 -> -1.0)
    expect(decoded[1]).toBeCloseTo(-1.0, 4);
    expect(decoded[2]).toBeCloseTo(1.0, 4);
    expect(decoded[3]).toBeCloseTo(-1.0, 4);
    expect(decoded[4]).toBeCloseTo(0.0, 4);
  });

  it('assembles multiple chunks without gaps or discontinuities', async () => {
    const chunk1 = new Float32Array([0.1, 0.2, 0.3]);
    const chunk2 = new Float32Array([0.4, 0.5]);
    const chunk3 = new Float32Array([0.6, 0.7, 0.8, 0.9]);

    const blob = encodeWav([chunk1, chunk2, chunk3], 48000, 1);
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = decodeWavSamples(arrayBuffer);

    expect(decoded.length).toBe(9);
    for (let i = 0; i < 9; i++) {
      expect(decoded[i]).toBeCloseTo((i + 1) * 0.1, 3);
    }
  });
});
