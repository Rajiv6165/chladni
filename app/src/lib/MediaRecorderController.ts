import { audioEngine, type RecordedAudioTake } from './AudioEngine';

export interface MimeTypeInfo {
  mimeType: string;
  label: string;
  extension: 'webm' | 'mp4';
}

export interface TakeResult {
  wavBlob: Blob;
  wavUrl: string;
  wavFilename: string;
  wavSizeBytes: number;

  videoBlob: Blob;
  videoUrl: string;
  videoFilename: string;
  videoSizeBytes: number;
  videoFormatLabel: string;

  durationSec: number;
  sampleRate: number;
  timestamp: Date;
  stoppedReason?: string;
}

export type RecordingState = 'idle' | 'recording' | 'finishing';

export class MediaRecorderController {
  state: RecordingState = 'idle';
  elapsedSeconds: number = 0;
  maxDurationSeconds: number = 180; // 3 minutes limit
  warningThresholdSeconds: number = 150; // 2m 30s: warning threshold
  
  includeInsetAndFrame: boolean = false; // Opt-in toggle (Privacy-safe default: false)

  private mediaRecorder: MediaRecorder | null = null;
  private recordedVideoChunks: Blob[] = [];
  private timerIntervalId: number | null = null;
  private recordingStartTime: number = 0;
  private compositeCanvas: HTMLCanvasElement | null = null;
  private compositeCtx: CanvasRenderingContext2D | null = null;
  private compositeRafId: number | null = null;

  onStateChange?: (state: RecordingState) => void;
  onTick?: (elapsed: number, isWarning: boolean, remaining: number) => void;
  onTakeReady?: (take: TakeResult) => void;
  onError?: (err: Error) => void;

  constructor() {}

  static getBestSupportedMimeType(): MimeTypeInfo {
    if (typeof MediaRecorder === 'undefined') {
      return { mimeType: '', label: 'Unsupported', extension: 'webm' };
    }

    const candidates: Array<{ mime: string; label: string; ext: 'webm' | 'mp4' }> = [
      { mime: 'video/webm;codecs=vp9,opus', label: 'WebM (VP9 / Opus)', ext: 'webm' },
      { mime: 'video/webm;codecs=vp9', label: 'WebM (VP9)', ext: 'webm' },
      { mime: 'video/webm;codecs=vp8,opus', label: 'WebM (VP8 / Opus)', ext: 'webm' },
      { mime: 'video/webm;codecs=vp8', label: 'WebM (VP8)', ext: 'webm' },
      { mime: 'video/webm', label: 'WebM (Default)', ext: 'webm' },
      { mime: 'video/mp4;codecs=avc1,mp4a.40.2', label: 'MP4 (H.264 / AAC)', ext: 'mp4' },
      { mime: 'video/mp4', label: 'MP4 (Default)', ext: 'mp4' },
    ];

    for (const c of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(c.mime)) {
          return { mimeType: c.mime, label: c.label, extension: c.ext };
        }
      } catch {
        // Continue fallback search
      }
    }

    return { mimeType: '', label: 'Browser Default', extension: 'webm' };
  }

  static formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  static generateFilename(date: Date, ext: string): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const mins = pad(date.getMinutes());
    const secs = pad(date.getSeconds());
    return `chladni-${year}${month}${day}-${hours}${mins}${secs}.${ext}`;
  }

  static formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  static disposeTake(take: TakeResult) {
    if (take.wavUrl) {
      try { URL.revokeObjectURL(take.wavUrl); } catch {}
    }
    if (take.videoUrl) {
      try { URL.revokeObjectURL(take.videoUrl); } catch {}
    }
    audioEngine.clearRecordingBuffers();
  }

  async startRecording(
    plateCanvas: HTMLCanvasElement,
    overlayVideo?: HTMLVideoElement | null,
    overlayCanvas?: HTMLCanvasElement | null
  ) {
    if (this.state !== 'idle') return;

    this.recordedVideoChunks = [];
    this.elapsedSeconds = 0;

    const mimeInfo = MediaRecorderController.getBestSupportedMimeType();

    // Determine visual stream source
    let visualStream: MediaStream;
    if (this.includeInsetAndFrame) {
      visualStream = this.startCompositeStream(plateCanvas, overlayVideo, overlayCanvas);
    } else {
      // Privacy-safe default: pure plate WebGL canvas stream
      visualStream = plateCanvas.captureStream(60);
    }

    // Mux with Web Audio destination stream (tapped after master limiter)
    const combinedStream = new MediaStream();
    const videoTracks = visualStream.getVideoTracks();
    if (videoTracks.length > 0) {
      combinedStream.addTrack(videoTracks[0]);
    }

    const audioStream = audioEngine.getMediaStream();
    if (audioStream) {
      const audioTracks = audioStream.getAudioTracks();
      if (audioTracks.length > 0) {
        combinedStream.addTrack(audioTracks[0]);
      }
    }

    const recorderOptions: MediaRecorderOptions = {
      videoBitsPerSecond: 5_000_000, // 5 Mbps high fidelity video
      audioBitsPerSecond: 192_000    // 192 kbps high fidelity audio
    };
    if (mimeInfo.mimeType) {
      recorderOptions.mimeType = mimeInfo.mimeType;
    }

    try {
      this.mediaRecorder = new MediaRecorder(combinedStream, recorderOptions);
    } catch (e) {
      // Fallback if options were rejected
      this.mediaRecorder = new MediaRecorder(combinedStream);
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedVideoChunks.push(e.data);
      }
    };

    // Start lossless PCM AudioWorklet recording concurrently
    audioEngine.startRecording();

    // Start video recorder with 1-second timeslices for chunk flushing
    this.mediaRecorder.start(1000);

    this.state = 'recording';
    this.recordingStartTime = performance.now();
    this.onStateChange?.(this.state);

    // Live tick timer & 3-minute hard ceiling
    this.timerIntervalId = window.setInterval(() => {
      if (this.state !== 'recording') return;
      this.elapsedSeconds = (performance.now() - this.recordingStartTime) / 1000;
      const remaining = Math.max(0, this.maxDurationSeconds - this.elapsedSeconds);
      const isWarning = this.elapsedSeconds >= this.warningThresholdSeconds;

      this.onTick?.(this.elapsedSeconds, isWarning, remaining);

      if (this.elapsedSeconds >= this.maxDurationSeconds) {
        this.stopRecording('max_length_reached');
      }
    }, 100);
  }

  async stopRecording(reason?: string): Promise<void> {
    if (this.state !== 'recording') return;

    this.state = 'finishing';
    this.onStateChange?.(this.state);

    if (this.timerIntervalId !== null) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
    this.stopCompositeStream();

    const timestamp = new Date();
    const mimeInfo = MediaRecorderController.getBestSupportedMimeType();

    // 1. Finalize AudioWorklet PCM -> Lossless WAV
    const audioTakePromise = audioEngine.stopRecording();

    // 2. Finalize MediaRecorder -> Synchronized Video
    const videoPromise = new Promise<Blob>((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(new Blob(this.recordedVideoChunks, { type: mimeInfo.mimeType || 'video/webm' }));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const videoBlob = new Blob(this.recordedVideoChunks, {
          type: mimeInfo.mimeType || 'video/webm'
        });
        resolve(videoBlob);
      };

      try {
        this.mediaRecorder.stop();
      } catch (err) {
        console.warn('MediaRecorder stop warning:', err);
        resolve(new Blob(this.recordedVideoChunks, { type: mimeInfo.mimeType || 'video/webm' }));
      }
    });

    try {
      const [audioTake, videoBlob] = await Promise.all([audioTakePromise, videoPromise]);

      const wavUrl = URL.createObjectURL(audioTake.wavBlob);
      const videoUrl = URL.createObjectURL(videoBlob);

      const durationSec = Math.max(audioTake.durationSec, this.elapsedSeconds);

      const take: TakeResult = {
        wavBlob: audioTake.wavBlob,
        wavUrl,
        wavFilename: MediaRecorderController.generateFilename(timestamp, 'wav'),
        wavSizeBytes: audioTake.wavBlob.size,

        videoBlob,
        videoUrl,
        videoFilename: MediaRecorderController.generateFilename(timestamp, mimeInfo.extension),
        videoSizeBytes: videoBlob.size,
        videoFormatLabel: mimeInfo.label,

        durationSec,
        sampleRate: audioTake.sampleRate,
        timestamp,
        stoppedReason: reason
      };

      this.state = 'idle';
      this.onStateChange?.(this.state);
      this.onTakeReady?.(take);
    } catch (e: any) {
      this.state = 'idle';
      this.onStateChange?.(this.state);
      this.onError?.(e);
    }
  }

  private startCompositeStream(
    plateCanvas: HTMLCanvasElement,
    overlayVideo?: HTMLVideoElement | null,
    overlayCanvas?: HTMLCanvasElement | null
  ): MediaStream {
    if (!this.compositeCanvas) {
      this.compositeCanvas = document.createElement('canvas');
    }
    const width = 1280;
    const height = 720;
    this.compositeCanvas.width = width;
    this.compositeCanvas.height = height;
    this.compositeCtx = this.compositeCanvas.getContext('2d')!;

    const renderComposite = () => {
      if (!this.compositeCtx || !this.compositeCanvas || this.state !== 'recording') return;
      const ctx = this.compositeCtx;

      // 1. Draw plate canvas scaled to cover
      ctx.drawImage(plateCanvas, 0, 0, width, height);

      // 2. Etched brass outer border
      ctx.strokeStyle = '#8B5A2B';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, width - 4, height - 4);

      // 3. Draw circular CRT webcam inset in top-left if video active
      if (overlayVideo && overlayVideo.readyState >= 2 && !overlayVideo.paused) {
        const insetX = 90;
        const insetY = 90;
        const radius = 60;

        ctx.save();
        ctx.beginPath();
        ctx.arc(insetX, insetY, radius, 0, Math.PI * 2);
        ctx.clip();

        // Draw webcam mirrored
        ctx.save();
        ctx.translate(insetX, insetY);
        ctx.scale(-1, 1);
        ctx.drawImage(overlayVideo, -radius, -radius, radius * 2, radius * 2);
        ctx.restore();

        // Draw hand landmarks canvas overlay if present
        if (overlayCanvas && overlayCanvas.width > 0) {
          ctx.drawImage(overlayCanvas, insetX - radius, insetY - radius, radius * 2, radius * 2);
        }

        // CRT Green Tint
        ctx.fillStyle = 'rgba(74, 122, 107, 0.25)';
        ctx.fillRect(insetX - radius, insetY - radius, radius * 2, radius * 2);
        ctx.restore();

        // Brass bezel around inset
        ctx.beginPath();
        ctx.arc(insetX, insetY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#D4B896';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // 4. Subtle brass bottom status ribbon
      ctx.fillStyle = 'rgba(36, 28, 22, 0.75)';
      ctx.fillRect(0, height - 36, width, 36);
      ctx.strokeStyle = '#8B5A2B';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height - 36);
      ctx.lineTo(width, height - 36);
      ctx.stroke();

      ctx.fillStyle = '#E8DCC4';
      ctx.font = '14px "Space Grotesk", sans-serif';
      ctx.fillText('CHLADNI RESONANCE RECORDER', 20, height - 14);

      this.compositeRafId = requestAnimationFrame(renderComposite);
    };

    renderComposite();
    return this.compositeCanvas.captureStream(60);
  }

  private stopCompositeStream() {
    if (this.compositeRafId !== null) {
      cancelAnimationFrame(this.compositeRafId);
      this.compositeRafId = null;
    }
  }
}
