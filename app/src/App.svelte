<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { audioEngine } from './lib/AudioEngine';
  import { HandTracker } from './lib/HandTracker';
  import { GestureMapper } from './lib/GestureMapper';
  import { DrawingUtils, HandLandmarker } from '@mediapipe/tasks-vision';
  import './app.css';

  let videoEl: HTMLVideoElement;
  let canvasEl: HTMLCanvasElement;
  let canvasCtx: CanvasRenderingContext2D;
  let drawingUtils: DrawingUtils;

  let handTracker = new HandTracker();
  let gestureMapper = new GestureMapper();

  let isInitializing = false;
  let initError = '';
  let fallbackMode = false;
  let isAudioReady = false;

  // Fallback UI State
  let cutoff = 1000;
  let resonance = 0.5;
  let reverb = 0.5;

  let currentNoteFreq = 0; // To track which note to turn off

  onMount(() => {
    canvasCtx = canvasEl.getContext('2d')!;
    drawingUtils = new DrawingUtils(canvasCtx);
  });

  onDestroy(() => {
    handTracker.stopCamera();
  });

  async function startApp() {
    isInitializing = true;
    initError = '';
    
    try {
      // Init Audio Engine
      await audioEngine.init(() => {
        isAudioReady = true;
      });
      audioEngine.resume();
      
      // Init MediaPipe
      await handTracker.init();

      // Start Camera
      await handTracker.startCamera(videoEl, (results) => {
        if (!canvasEl || !videoEl) return;
        
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        
        if (results.landmarks) {
          for (const landmarks of results.landmarks) {
            drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
              color: "#00FF00",
              lineWidth: 5
            });
            drawingUtils.drawLandmarks(landmarks, {
              color: "#FF0000",
              lineWidth: 2
            });
          }
        }

        // Map gestures
        const mapped = gestureMapper.process(results);
        
        if (mapped.noteOnEvent && mapped.pitch !== undefined) {
            currentNoteFreq = audioEngine.mtof(mapped.pitch);
            audioEngine.noteOn(currentNoteFreq, 1.0);
        } else if (mapped.noteOffEvent && currentNoteFreq !== 0) {
            audioEngine.noteOff(currentNoteFreq);
            currentNoteFreq = 0;
        }

        if (mapped.cutoff !== undefined) audioEngine.setCutoff(mapped.cutoff);
        if (mapped.reverb !== undefined) audioEngine.setReverb(mapped.reverb);

      });

    } catch (e: any) {
      console.error(e);
      initError = e.message || 'Failed to initialize';
      fallbackMode = true; // Enable fallback
      
      // Try initializing audio anyway for fallback mode if it didn't already
      if (!isAudioReady) {
          try {
              await audioEngine.init(() => { isAudioReady = true; });
              audioEngine.resume();
          } catch(err) {
              console.error("Audio init failed for fallback", err);
          }
      }
    } finally {
      isInitializing = false;
    }
  }

  // Fallback Handlers
  const notes = [
    { note: 60, name: 'C4', color: 'white' },
    { note: 61, name: 'C#4', color: 'black' },
    { note: 62, name: 'D4', color: 'white' },
    { note: 63, name: 'D#4', color: 'black' },
    { note: 64, name: 'E4', color: 'white' },
    { note: 65, name: 'F4', color: 'white' },
    { note: 66, name: 'F#4', color: 'black' },
    { note: 67, name: 'G4', color: 'white' },
    { note: 68, name: 'G#4', color: 'black' },
    { note: 69, name: 'A4', color: 'white' },
    { note: 70, name: 'A#4', color: 'black' },
    { note: 71, name: 'B4', color: 'white' },
    { note: 72, name: 'C5', color: 'white' },
  ];

  function playNoteFallback(note: number) {
      if (isAudioReady) audioEngine.noteOn(audioEngine.mtof(note));
  }
  
  function stopNoteFallback(note: number) {
      if (isAudioReady) audioEngine.noteOff(audioEngine.mtof(note));
  }
</script>

<main class="app-container">
  <h1>Chladni: Phase 2 - Gesture Control</h1>
  
  {#if !isAudioReady && !isInitializing}
    <div class="start-screen">
      <button class="btn-start" on:click={startApp}>Start Experience</button>
      <p>Will request webcam access</p>
    </div>
  {/if}

  {#if isInitializing}
    <div class="loading-state">
      <p>Loading MediaPipe Models and Initializing Audio...</p>
    </div>
  {/if}

  <div class="tracker-container" style="display: {(!fallbackMode && isAudioReady) ? 'block' : 'none'}">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={videoEl} style="display: none;"></video>
    <canvas bind:this={canvasEl} class="overlay-canvas"></canvas>
    
    <div class="instructions">
      <p><b>Hand Controls:</b></p>
      <ul>
        <li><b>Pinch</b> (Thumb & Index): Note On/Off</li>
        <li><b>Vertical Position (Y)</b>: Pitch</li>
        <li><b>Horizontal Position (X)</b>: Filter Cutoff</li>
        <li><b>Hand Distance (Size)</b>: Reverb Mix</li>
      </ul>
    </div>
  </div>

  {#if fallbackMode && isAudioReady}
    <div class="fallback-ui">
      <div class="error-banner">
        <p>⚠️ Camera access denied or not found. Falling back to mouse/touch controls.</p>
        {#if initError}<small>{initError}</small>{/if}
      </div>

      <div class="sliders">
        <label>
          Cutoff
          <input type="range" min="100" max="10000" bind:value={cutoff} on:input={() => audioEngine.setCutoff(cutoff)} />
        </label>
        <label>
          Resonance
          <input type="range" min="0" max="1" step="0.01" bind:value={resonance} on:input={() => audioEngine.setResonance(resonance)} />
        </label>
        <label>
          Reverb
          <input type="range" min="0" max="1" step="0.01" bind:value={reverb} on:input={() => audioEngine.setReverb(reverb)} />
        </label>
      </div>

      <div class="piano">
        {#each notes as n}
          <div 
            class="key {n.color}" 
            role="button"
            tabindex="0"
            on:mousedown={() => playNoteFallback(n.note)}
            on:mouseup={() => stopNoteFallback(n.note)}
            on:mouseleave={() => stopNoteFallback(n.note)}
            on:touchstart|preventDefault={() => playNoteFallback(n.note)}
            on:touchend|preventDefault={() => stopNoteFallback(n.note)}
          >
            {n.color === 'white' ? n.name : ''}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</main>
