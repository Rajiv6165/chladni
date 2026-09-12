import { EMAFilter } from './filters';
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';

export class GestureMapper {
    // Smoothed values
    public pitchEma = new EMAFilter(0.15);
    public cutoffEma = new EMAFilter(0.15);
    public pinchEma = new EMAFilter(0.3); // Faster response for pinch (note on/off)
    public sizeEma = new EMAFilter(0.1);

    public isNoteOn = false;
    private pinchThresholdOn = 0.05;
    private pinchThresholdOff = 0.08;

    constructor() {}

    reset() {
        this.pitchEma.reset();
        this.cutoffEma.reset();
        this.pinchEma.reset();
        this.sizeEma.reset();
        this.isNoteOn = false;
    }

    process(result: HandLandmarkerResult): { 
        pitch?: number, 
        cutoff?: number, 
        reverb?: number, 
        noteOnEvent?: boolean, 
        noteOffEvent?: boolean 
    } {
        if (!result.landmarks || result.landmarks.length === 0) {
            // No hands detected
            let noteOffEvent = false;
            if (this.isNoteOn) {
                this.isNoteOn = false;
                noteOffEvent = true;
            }
            this.reset();
            return { noteOffEvent };
        }

        // Just use the first hand for now
        const hand = result.landmarks[0];
        
        // Landmarks indices: 
        // 0: Wrist, 4: Thumb tip, 8: Index finger tip
        const wrist = hand[0];
        const thumbTip = hand[4];
        const indexTip = hand[8];

        // 1. Pitch -> Map Y of index tip (inverted, 0 is top, 1 is bottom)
        // Let's map roughly Y: 0.8 (bottom) to 0.2 (top) -> Notes: 48 (C3) to 72 (C5)
        const yRaw = Math.max(0.2, Math.min(0.8, indexTip.y));
        // Normalize 0.0 to 1.0 (where 1.0 is highest physical position)
        const yNorm = 1.0 - ((yRaw - 0.2) / 0.6); 
        const targetPitch = 48 + (yNorm * 24); // 48 to 72
        const pitch = this.pitchEma.update(targetPitch);

        // 2. Cutoff -> Map X of index tip
        // Let's map X: 0.1 (left) to 0.9 (right)
        const xRaw = Math.max(0.1, Math.min(0.9, indexTip.x));
        // In mirrored video, X=0 is actually right side of physical space.
        // Assuming video is mirrored, x=0 -> Right, x=1 -> Left.
        // Let's just use raw X and map it 100Hz to 10000Hz logarithmically
        const xNorm = (xRaw - 0.1) / 0.8;
        const targetCutoff = 100 * Math.pow(100, xNorm); // 100 to 10000
        const cutoff = this.cutoffEma.update(targetCutoff);

        // 3. Pinch (Gate) -> Distance between thumb tip and index tip
        const dx = thumbTip.x - indexTip.x;
        const dy = thumbTip.y - indexTip.y;
        const dz = thumbTip.z - indexTip.z;
        const targetPinchDist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const pinchDist = this.pinchEma.update(targetPinchDist);

        let noteOnEvent = false;
        let noteOffEvent = false;
        
        // Hysteresis for pinch
        // "pinched closed = note off/silent, pinched open past a threshold = note on"
        // Pinching open means distance > thresholdOn -> Note On
        // Pinching closed means distance < thresholdOff -> Note Off
        if (!this.isNoteOn && pinchDist > this.pinchThresholdOff) {
            this.isNoteOn = true;
            noteOnEvent = true;
        } else if (this.isNoteOn && pinchDist < this.pinchThresholdOn) {
            this.isNoteOn = false;
            noteOffEvent = true;
        }

        // 4. Reverb -> Hand size (distance proxy)
        // Rough bounding box diagonal as proxy for size
        let minX = 1, maxX = 0, minY = 1, maxY = 0;
        for (const p of hand) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        const diag = Math.sqrt(Math.pow(maxX - minX, 2) + Math.pow(maxY - minY, 2));
        // diagonal varies maybe from 0.1 (far) to 0.8 (very close)
        const diagNorm = Math.max(0, Math.min(1, (diag - 0.1) / 0.5));
        const reverb = this.sizeEma.update(diagNorm);

        return {
            pitch,
            cutoff,
            reverb,
            noteOnEvent,
            noteOffEvent
        };
    }
}
