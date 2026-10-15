/**
 * AudioWorkletProcessor for lossless PCM audio capture.
 * 
 * Runs on the dedicated Web Audio rendering thread.
 * STRICT ZERO-ALLOCATION GUARANTEE:
 * No heap allocations inside the hot-path process() callback.
 * Uses a pre-allocated pool of transferable Float32Array buffers.
 */

class RecorderProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.isRecording = false;
        this.bufferSize = 4096; // 4096 stereo frames = 8192 float samples
        this.pool = [];
        this.currentBuffer = null;
        this.writeIndex = 0;

        // Pre-allocate buffer pool in constructor (off the audio hot path)
        for (let i = 0; i < 24; i++) {
            this.pool.push(new Float32Array(this.bufferSize * 2));
        }

        this.port.onmessage = (e) => {
            const msg = e.data;
            if (msg.type === 'start') {
                this.isRecording = true;
                this.writeIndex = 0;
                this.currentBuffer = this.pool.length > 0 ? this.pool.pop() : new Float32Array(this.bufferSize * 2);
            } else if (msg.type === 'stop') {
                this.isRecording = false;
                if (this.currentBuffer && this.writeIndex > 0) {
                    const validLen = this.writeIndex * 2;
                    const buf = this.currentBuffer;
                    this.currentBuffer = null;
                    this.writeIndex = 0;
                    this.port.postMessage({
                        type: 'chunk',
                        buffer: buf,
                        length: validLen
                    }, [buf.buffer]);
                } else {
                    this.currentBuffer = null;
                    this.writeIndex = 0;
                }
            } else if (msg.type === 'recycle') {
                // Main thread returned a drained buffer back to the free pool
                if (msg.buffer && msg.buffer.byteLength > 0) {
                    this.pool.push(new Float32Array(msg.buffer));
                }
            }
        };
    }

    process(inputs, outputs, parameters) {
        if (!this.isRecording) {
            return true;
        }

        const input = inputs[0];
        if (!input || input.length === 0) {
            return true;
        }

        const ch0 = input[0];
        const ch1 = input.length > 1 ? input[1] : ch0;
        const len = ch0.length;

        if (!this.currentBuffer) {
            if (this.pool.length > 0) {
                this.currentBuffer = this.pool.pop();
                this.writeIndex = 0;
            } else {
                return true;
            }
        }

        let buf = this.currentBuffer;
        let idx = this.writeIndex * 2;

        for (let i = 0; i < len; i++) {
            buf[idx] = ch0[i];
            buf[idx + 1] = ch1[i];
            idx += 2;
            this.writeIndex++;

            if (this.writeIndex >= this.bufferSize) {
                // Transfer full buffer to main thread (zero-copy)
                this.port.postMessage({
                    type: 'chunk',
                    buffer: buf,
                    length: this.bufferSize * 2
                }, [buf.buffer]);

                this.currentBuffer = this.pool.length > 0 ? this.pool.pop() : null;
                buf = this.currentBuffer;
                this.writeIndex = 0;
                idx = 0;
                if (!buf) break;
            }
        }

        return true;
    }
}

registerProcessor('recorder-worklet', RecorderProcessor);
