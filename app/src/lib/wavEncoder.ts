/**
 * Lossless 16-bit PCM WAV Encoder for Web Audio
 * 
 * Generates valid RIFF/WAVE files with exact sample rates matching
 * the AudioContext, supporting mono and stereo interleaved audio.
 */

export interface WavHeaderInfo {
  chunkId: string;
  chunkSize: number;
  format: string;
  subchunk1Id: string;
  subchunk1Size: number;
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  subchunk2Id: string;
  subchunk2Size: number;
  totalSamples: number;
}

/**
 * Encodes an array of Float32Array chunks (interleaved stereo or mono) into a 16-bit PCM WAV Blob.
 * 
 * @param chunks Array of Float32Array sample chunks from audio capture
 * @param sampleRate Actual sample rate from the AudioContext (e.g. 44100, 48000)
 * @param numChannels 1 for mono, 2 for stereo (matching engine output)
 * @returns Blob with MIME type 'audio/wav'
 */
export function encodeWav(
  chunks: Float32Array[],
  sampleRate: number,
  numChannels: number = 2
): Blob {
  let totalLength = 0;
  for (let i = 0; i < chunks.length; i++) {
    totalLength += chunks[i].length;
  }

  const bytesPerSample = 2; // 16-bit
  const dataByteLength = totalLength * bytesPerSample;
  const headerByteLength = 44;
  const totalByteLength = headerByteLength + dataByteLength;

  const buffer = new ArrayBuffer(totalByteLength);
  const view = new DataView(buffer);

  // Write RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true); // ChunkSize
  writeString(view, 8, 'WAVE');

  // Write 'fmt ' subchunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);  // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // ByteRate
  view.setUint16(32, numChannels * bytesPerSample, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // Write 'data' subchunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataByteLength, true);

  // Write PCM audio data (converted from Float32 [-1, 1] to Int16 [-32768, 32767])
  let offset = 44;
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]));
      const intSample = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Decodes a WAV ArrayBuffer into header metadata and float samples.
 * Used for testing, round-trip verification, and audio inspection.
 */
export function parseWavHeader(buffer: ArrayBuffer): WavHeaderInfo {
  const view = new DataView(buffer);

  const chunkId = readString(view, 0, 4);
  const chunkSize = view.getUint32(4, true);
  const format = readString(view, 8, 4);
  const subchunk1Id = readString(view, 12, 4);
  const subchunk1Size = view.getUint32(16, true);
  const audioFormat = view.getUint16(20, true);
  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const byteRate = view.getUint32(28, true);
  const blockAlign = view.getUint16(32, true);
  const bitsPerSample = view.getUint16(34, true);
  const subchunk2Id = readString(view, 36, 4);
  const subchunk2Size = view.getUint32(40, true);

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = subchunk2Size / bytesPerSample;

  return {
    chunkId,
    chunkSize,
    format,
    subchunk1Id,
    subchunk1Size,
    audioFormat,
    numChannels,
    sampleRate,
    byteRate,
    blockAlign,
    bitsPerSample,
    subchunk2Id,
    subchunk2Size,
    totalSamples
  };
}

/**
 * Reads decoded 16-bit PCM samples back as Float32 values in [-1, 1].
 */
export function decodeWavSamples(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  const dataOffset = 44;
  const byteLength = view.getUint32(40, true);
  const sampleCount = byteLength / 2;
  const out = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(dataOffset + i * 2, true);
    out[i] = int16 < 0 ? int16 / 32768 : int16 / 32767;
  }

  return out;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function readString(view: DataView, offset: number, length: number): string {
  let str = '';
  for (let i = 0; i < length; i++) {
    str += String.fromCharCode(view.getUint8(offset + i));
  }
  return str;
}
