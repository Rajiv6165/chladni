import { EMAFilter } from './filters';
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';

export class GestureMapper {
    // Smoothed values for Left Hand (Pitch, Gate)
    public pitchEma = new EMAFilter(0.15);
    public pinchEma = new EMAFilter(0.3); // Faster response for pinch
    
    // Smoothed values for Right Hand (Filter, Reverb)
    public cutoffEma = new EMAFilter(0.15);
    public sizeEma = new EMAFilter(0.1);

    public isNoteOn = false;
    private pinchThresholdOn = 0.05;
    private pinchThresholdOff = 0.08;

    // Tracking state for robust identity across frames
    private lastLeftHandCentroid: { x: number, y: number } | null = null;
    private lastRightHandCentroid: { x: number, y: number } | null = null;

    constructor() {}

    reset() {
        this.pitchEma.reset();
        this.cutoffEma.reset();
        this.pinchEma.reset();
        this.sizeEma.reset();
        this.isNoteOn = false;
        this.lastLeftHandCentroid = null;
        this.lastRightHandCentroid = null;
    }

    private getCentroid(hand: any) {
        let sumX = 0, sumY = 0;
        for (const p of hand) {
            sumX += p.x;
            sumY += p.y;
        }
        return { x: sumX / hand.length, y: sumY / hand.length };
    }

    private dist(p1: { x: number, y: number }, p2: { x: number, y: number }) {
        return Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2);
    }

    process(result: HandLandmarkerResult): { 
        pitch?: number, 
        cutoff?: number, 
        reverb?: number, 
        noteOnEvent?: boolean, 
        noteOffEvent?: boolean,
        activeHands: { left: boolean, right: boolean }
    } {
        let activeHands = { left: false, right: false };

        if (!result.landmarks || result.landmarks.length === 0) {
            // No hands detected
            let noteOffEvent = false;
            if (this.isNoteOn) {
                this.isNoteOn = false;
                noteOffEvent = true;
            }
            // Do NOT reset EMAs here so they hold their last values
            this.lastLeftHandCentroid = null;
            this.lastRightHandCentroid = null;
            return { noteOffEvent, activeHands };
        }

        let leftHand = null;
        let rightHand = null;

        // Try to identify hands using MediaPipe's handedness first, but use frame-to-frame centroid tracking to prevent swapping
        const hands = result.landmarks.map((landmarks, index) => {
            const centroid = this.getCentroid(landmarks);
            // MediaPipe handedness label (Note: video is mirrored, so physical left hand -> MediaPipe "Right" or "Left" depending on setup.
            // We just use whatever MediaPipe calls "Left" as left and "Right" as right.
            const rawLabel = result.handednesses[index][0].categoryName;
            return { landmarks, centroid, rawLabel, index };
        });

        if (hands.length === 1) {
            // Single hand visible: associate it based on tracking distance or fallback to raw label
            const h = hands[0];
            const dLeft = this.lastLeftHandCentroid ? this.dist(h.centroid, this.lastLeftHandCentroid) : Infinity;
            const dRight = this.lastRightHandCentroid ? this.dist(h.centroid, this.lastRightHandCentroid) : Infinity;
            
            if (dLeft < 0.2 && dLeft < dRight) {
                leftHand = h;
            } else if (dRight < 0.2 && dRight < dLeft) {
                rightHand = h;
            } else {
                if (h.rawLabel === "Left") leftHand = h;
                else rightHand = h;
            }
        } else if (hands.length >= 2) {
            // Two hands visible: assign based on tracking if both existed, else x-position or labels
            const h1 = hands[0];
            const h2 = hands[1];
            
            if (this.lastLeftHandCentroid && this.lastRightHandCentroid) {
                const cost1 = this.dist(h1.centroid, this.lastLeftHandCentroid) + this.dist(h2.centroid, this.lastRightHandCentroid);
                const cost2 = this.dist(h2.centroid, this.lastLeftHandCentroid) + this.dist(h1.centroid, this.lastRightHandCentroid);
                if (cost1 < cost2) {
                    leftHand = h1; rightHand = h2;
                } else {
                    leftHand = h2; rightHand = h1;
                }
            } else {
                // If tracking lost, rely on raw labels. If labels are identical, use X coordinate to disambiguate.
                if (h1.rawLabel !== h2.rawLabel) {
                    leftHand = h1.rawLabel === "Left" ? h1 : h2;
                    rightHand = h1.rawLabel === "Right" ? h1 : h2;
                } else {
                    // Video is mirrored, physical left hand is on the right side of unmirrored image (higher X)
                    if (h1.centroid.x > h2.centroid.x) {
                        leftHand = h1; rightHand = h2;
                    } else {
                        leftHand = h2; rightHand = h1;
                    }
                }
            }
        }

        let outPitch: number | undefined = undefined;
        let outCutoff: number | undefined = undefined;
        let outReverb: number | undefined = undefined;
        let noteOnEvent = false;
        let noteOffEvent = false;

        // Process Left Hand: Pitch & Gate
        if (leftHand) {
            activeHands.left = true;
            this.lastLeftHandCentroid = leftHand.centroid;
            
            const hand = leftHand.landmarks;
            const thumbTip = hand[4];
            const indexTip = hand[8];

            // 1. Pitch -> Map Y of index tip (inverted, 0 is top, 1 is bottom)
            const yRaw = Math.max(0.2, Math.min(0.8, indexTip.y));
            const yNorm = 1.0 - ((yRaw - 0.2) / 0.6); 
            const targetPitch = 48 + (yNorm * 24); // 48 to 72
            outPitch = this.pitchEma.update(targetPitch);

            // 2. Pinch (Gate) -> Distance between thumb tip and index tip
            const dx = thumbTip.x - indexTip.x;
            const dy = thumbTip.y - indexTip.y;
            const dz = thumbTip.z - indexTip.z;
            const targetPinchDist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            const pinchDist = this.pinchEma.update(targetPinchDist);

            if (!this.isNoteOn && pinchDist > this.pinchThresholdOff) {
                this.isNoteOn = true;
                noteOnEvent = true;
            } else if (this.isNoteOn && pinchDist < this.pinchThresholdOn) {
                this.isNoteOn = false;
                noteOffEvent = true;
            }
        } else {
            this.lastLeftHandCentroid = null;
            // If left hand disappears, turn note off gracefully
            if (this.isNoteOn) {
                this.isNoteOn = false;
                noteOffEvent = true;
            }
        }

        // Process Right Hand: Filter Cutoff & Reverb
        if (rightHand) {
            activeHands.right = true;
            this.lastRightHandCentroid = rightHand.centroid;

            const hand = rightHand.landmarks;
            const indexTip = hand[8];

            // 1. Cutoff -> Map X of index tip
            const xRaw = Math.max(0.1, Math.min(0.9, indexTip.x));
            const xNorm = (xRaw - 0.1) / 0.8;
            const targetCutoff = 100 * Math.pow(100, xNorm); // 100 to 10000
            outCutoff = this.cutoffEma.update(targetCutoff);

            // 2. Reverb -> Hand size (distance proxy)
            let minX = 1, maxX = 0, minY = 1, maxY = 0;
            for (const p of hand) {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            }
            const diag = Math.sqrt(Math.pow(maxX - minX, 2) + Math.pow(maxY - minY, 2));
            const diagNorm = Math.max(0, Math.min(1, (diag - 0.1) / 0.5));
            outReverb = this.sizeEma.update(diagNorm);
        } else {
            this.lastRightHandCentroid = null;
        }

        return {
            pitch: outPitch,
            cutoff: outCutoff,
            reverb: outReverb,
            noteOnEvent,
            noteOffEvent,
            activeHands,
            leftHandIndex: leftHand ? leftHand.index : null,
            rightHandIndex: rightHand ? rightHand.index : null
        };
    }
}
