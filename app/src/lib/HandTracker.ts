import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';

export type HandTrackerCallback = (result: HandLandmarkerResult) => void;

export class HandTracker {
    private handLandmarker: HandLandmarker | null = null;
    private videoElement: HTMLVideoElement | null = null;
    private isRunning: boolean = false;
    private lastVideoTime: number = -1;
    private callback: HandTrackerCallback | null = null;
    
    // Allow the model to load before starting
    public isModelLoaded: boolean = false;

    constructor() {}

    async init() {
        if (this.isModelLoaded) return;
        
        try {
            const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm"
            );
            
            this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                    delegate: "GPU"
                },
                runningMode: "VIDEO",
                numHands: 2
            });
            
            this.isModelLoaded = true;
        } catch (e) {
            console.error("Failed to load MediaPipe Hands model", e);
            throw e;
        }
    }

    async startCamera(videoElement: HTMLVideoElement, onResult: HandTrackerCallback) {
        this.videoElement = videoElement;
        this.callback = onResult;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 30 }
                }
            });
            this.videoElement.srcObject = stream;
            
            return new Promise<void>((resolve) => {
                this.videoElement!.onloadeddata = () => {
                    this.videoElement!.play();
                    this.isRunning = true;
                    this.predictWebcam();
                    resolve();
                };
            });
        } catch (e) {
            console.error("Failed to access webcam", e);
            throw e;
        }
    }

    stopCamera() {
        this.isRunning = false;
        if (this.videoElement && this.videoElement.srcObject) {
            const stream = this.videoElement.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            this.videoElement.srcObject = null;
        }
    }

    private predictWebcam = () => {
        if (!this.isRunning || !this.videoElement || !this.handLandmarker) return;

        let startTimeMs = performance.now();
        if (this.lastVideoTime !== this.videoElement.currentTime) {
            this.lastVideoTime = this.videoElement.currentTime;
            
            const results = this.handLandmarker.detectForVideo(this.videoElement, startTimeMs);
            if (this.callback) {
                this.callback(results);
            }
        }

        requestAnimationFrame(this.predictWebcam);
    }
}
