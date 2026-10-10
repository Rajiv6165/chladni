<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { audioEngine } from './lib/AudioEngine';
  import { HandTracker } from './lib/HandTracker';
  import { GestureMapper } from './lib/GestureMapper';
  import { DrawingUtils, HandLandmarker } from '@mediapipe/tasks-vision';
  import ChladniVisualizer from './lib/ChladniVisualizer.svelte';
  import RotaryDial from './lib/RotaryDial.svelte';
  import './app.css';

  let videoEl: HTMLVideoElement;
  let canvasEl: HTMLCanvasElement;
  let canvasCtx: CanvasRenderingContext2D;
  let drawingUtils: DrawingUtils;

  let handTracker = new HandTracker();
  let gestureMapper = new GestureMapper();

  let isInitializing = false;
  let loadingState = '';
  let initError = '';
  let fallbackMode = false;
  let isAudioReady = false;
  let hasStarted = false;
  let showHelp = false;

  let compatibilityChecks = {
    webgl2: false,
    wasm: false,
    audioWorklet: false,
    getUserMedia: false,
    checked: false
  };
  $: isCompatible = compatibilityChecks.checked && compatibilityChecks.webgl2 && compatibilityChecks.wasm && compatibilityChecks.audioWorklet;

  let activeHands = { left: false, right: false };
  let leftHandIndex: number | null = null;
  let rightHandIndex: number | null = null;

  const leftHandStyle = {
      connector: "rgba(212, 184, 150, 0.4)", // --color-brass-pale
      landmark: "rgba(74, 122, 107, 0.8)",   // --color-plate-accent
  };
  const rightHandStyle = {
      connector: "rgba(139, 90, 43, 0.6)",   // --color-brass-highlight
      landmark: "rgba(232, 220, 196, 0.8)",  // --color-ivory
  };

  // Normalized dial values (0.0 to 1.0)
  let cutoffNorm = 0.5;
  let resonanceNorm = 0.5;
  let reverbNorm = 0.5;

  // Dragging state to prevent gesture override
  let isDraggingCutoff = false;
  let isDraggingResonance = false;
  let isDraggingReverb = false;

  let currentNoteFreq = 0;

  $: cutoffActual = 100 * Math.pow(10, 2 * cutoffNorm); // 100 to 10000 Hz
  $: {
    if (isAudioReady) audioEngine.setCutoff(cutoffActual);
  }
  
  $: {
    if (isAudioReady) audioEngine.setResonance(resonanceNorm);
  }
  
  $: {
    if (isAudioReady) audioEngine.setReverb(reverbNorm);
  }

  function formatCutoff(val: number) {
    const hz = 100 * Math.pow(10, 2 * val);
    if (hz >= 1000) return (hz / 1000).toFixed(1) + 'k';
    return Math.round(hz).toString();
  }

  function formatPct(val: number) {
    return Math.round(val * 100).toString();
  }

  onMount(() => {
    // Capability checks
    compatibilityChecks = {
      webgl2: !!document.createElement('canvas').getContext('webgl2'),
      wasm: typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function',
      audioWorklet: typeof AudioContext !== 'undefined' && 'audioWorklet' in AudioContext.prototype,
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      checked: true
    };

    canvasCtx = canvasEl.getContext('2d')!;
    drawingUtils = new DrawingUtils(canvasCtx);
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
  });

  onDestroy(() => {
    handTracker.stopCamera();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    // Release audio resources
    if (audioEngine.audioCtx) {
      audioEngine.audioCtx.close();
    }
  });

  function handleVisibilityChange() {
    if (document.hidden) {
      if (isAudioReady) {
        audioEngine.noteOff(currentNoteFreq);
        currentNoteFreq = 0;
        audioEngine.audioCtx?.suspend();
      }
      handTracker.pauseCamera();
    } else {
      if (isAudioReady) {
        audioEngine.audioCtx?.resume();
      }
      handTracker.resumeCamera();
    }
  }

  async function startApp() {
    isInitializing = true;
    initError = '';
    hasStarted = true;
    
    try {
      loadingState = 'TUNING PLATE (AUDIO ENGINE)...';
      await audioEngine.init(() => {
        isAudioReady = true;
      });
      audioEngine.resume();
      
      loadingState = 'LOADING HAND MODEL...';
      await handTracker.init();

      loadingState = 'REQUESTING CAMERA ACCESS...';
      await handTracker.startCamera(videoEl, (results) => {
        if (!canvasEl || !videoEl || document.hidden) return;
        
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        
        const mapped = gestureMapper.process(results);
        activeHands = mapped.activeHands || { left: false, right: false };
        leftHandIndex = mapped.leftHandIndex ?? null;
        rightHandIndex = mapped.rightHandIndex ?? null;

        if (results.landmarks) {
          for (let i = 0; i < results.landmarks.length; i++) {
            const landmarks = results.landmarks[i];
            let style = leftHandStyle; // Default to left colors
            if (i === rightHandIndex) {
                style = rightHandStyle;
            } else if (i === leftHandIndex) {
                style = leftHandStyle;
            }
            
            drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
              color: style.connector,
              lineWidth: 2
            });
            drawingUtils.drawLandmarks(landmarks, {
              color: style.landmark,
              lineWidth: 1,
              radius: 3
            });
          }
        }
        
        if (mapped.noteOnEvent && mapped.pitch !== undefined) {
            currentNoteFreq = audioEngine.mtof(mapped.pitch);
            audioEngine.noteOn(currentNoteFreq, 1.0);
        } else if (mapped.noteOffEvent && currentNoteFreq !== 0) {
            audioEngine.noteOff(currentNoteFreq);
            currentNoteFreq = 0;
        }

        // Only update from gestures if user is not actively dragging the dial
        if (mapped.cutoff !== undefined && !isDraggingCutoff) {
            // mapped.cutoff is 100 to 10000. Inverse map to 0-1
            cutoffNorm = Math.log10(mapped.cutoff / 100) / 2;
        }
        if (mapped.reverb !== undefined && !isDraggingReverb) {
            reverbNorm = mapped.reverb;
        }

      });

    } catch (e: any) {
      console.error(e);
      let errorMsg = e.message || 'Failed to initialize';
      if (e.name === 'NotAllowedError' || e.name === 'NotFoundError' || e.name === 'NotReadableError') {
        errorMsg = 'CAMERA ACCESS DENIED OR UNAVAILABLE.';
      }
      initError = errorMsg;
      fallbackMode = true;
      
      if (!isAudioReady) {
          try {
              loadingState = 'RE-INITIALIZING AUDIO FOR FALLBACK...';
              await audioEngine.init(() => { isAudioReady = true; });
              audioEngine.resume();
          } catch(err) {
              console.error("Audio init failed for fallback", err);
              initError += ' AUDIO SYSTEM FAILED.';
          }
      }
    } finally {
      isInitializing = false;
      loadingState = '';
      if (!fallbackMode) {
          showHelp = true;
      }
    }
  }
</script>

<main class="instrument-face">
  <div class="brass-frame">
    
    <div class="plate-area">
      <ChladniVisualizer />
    </div>

    <!-- Oscilloscope-style webcam inset -->
    <div class="webcam-inset" class:hidden={fallbackMode || !isAudioReady}>
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={videoEl} style="display: none;"></video>
      <canvas bind:this={canvasEl} class="overlay-canvas"></canvas>
    </div>

    <div class="control-panel">
      <RotaryDial 
        label="Cutoff" 
        bind:value={cutoffNorm} 
        bind:isDragging={isDraggingCutoff}
        readout={formatCutoff(cutoffNorm)}
        gestureColor={activeHands.right ? "var(--color-brass-highlight)" : null}
      />
      <RotaryDial 
        label="Reson." 
        bind:value={resonanceNorm} 
        bind:isDragging={isDraggingResonance}
        readout={formatPct(resonanceNorm)}
      />
      <RotaryDial 
        label="Reverb" 
        bind:value={reverbNorm} 
        bind:isDragging={isDraggingReverb}
        readout={formatPct(reverbNorm)}
        gestureColor={activeHands.right ? "var(--color-brass-highlight)" : null}
      />
    </div>

    {#if compatibilityChecks.checked && !isCompatible}
      <div class="power-overlay">
        <div class="error-panel">
          <h3>SYSTEM INCOMPATIBLE</h3>
          <p>Your browser is missing required capabilities:</p>
          <ul style="text-align: left;">
            <li>WebAssembly: {compatibilityChecks.wasm ? 'OK' : 'MISSING'}</li>
            <li>AudioWorklet: {compatibilityChecks.audioWorklet ? 'OK' : 'MISSING'}</li>
            <li>WebGL2: {compatibilityChecks.webgl2 ? 'OK' : 'MISSING'}</li>
          </ul>
        </div>
      </div>
    {:else}
      {#if !hasStarted}
        <div class="power-overlay">
          <button class="power-button" on:click={startApp}>
            <span class="power-text">SYSTEM INITIATE</span>
          </button>
        </div>
      {/if}

      {#if isInitializing}
        <div class="power-overlay loading">
          <div class="readout-text">{loadingState}</div>
        </div>
      {/if}
      
      {#if fallbackMode && isAudioReady}
        <div class="fallback-warning">
          OPTICAL SENSOR OFFLINE. MANUAL OVERRIDE ENGAGED.
          <br/><span style="font-size: 0.7em">{initError}</span>
        </div>
      {/if}

      {#if showHelp}
        <div class="power-overlay">
          <div class="help-panel">
            <h3>HOW TO PLAY</h3>
            <div class="help-grid">
              <div class="help-col">
                <h4 style="color: var(--color-plate-accent)">LEFT HAND</h4>
                <p><strong>Pinch (Index + Thumb):</strong> Trigger Note</p>
                <p><strong>Y Axis (Up/Down):</strong> Pitch (C3 to C5)</p>
              </div>
              <div class="help-col">
                <h4 style="color: var(--color-brass-highlight)">RIGHT HAND</h4>
                <p><strong>X Axis (Left/Right):</strong> Reverb</p>
                <p><strong>Y Axis (Up/Down):</strong> Filter Cutoff</p>
                <p><strong>Note:</strong> Right hand only active while left hand is pinching.</p>
              </div>
            </div>
            <button class="power-button" style="margin-top: 2rem;" on:click={() => showHelp = false}>
              <span class="power-text">ACKNOWLEDGE</span>
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</main>

<style>
  .instrument-face {
    width: 100vw;
    height: 100vh;
    padding: 2rem;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: var(--color-base);
  }

  .brass-frame {
    position: relative;
    width: 100%;
    max-width: 1200px;
    height: 100%;
    max-height: 800px;
    background-color: #1a1612;
    border-radius: 4px;
    /* Hairline etched effect */
    border: 2px solid var(--color-brass-panel);
    box-shadow: 
      inset 0 0 0 1px var(--color-brass-pale),
      0 20px 50px rgba(0,0,0,0.8);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    
    /* Animation initial state */
    opacity: 0;
    clip-path: inset(50% 50% 50% 50%);
  }

  /* Single orchestrated sequence */
  .brass-frame {
    animation: frameEngrave 1s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  .plate-area {
    flex: 1;
    position: relative;
    background: #000;
    border-bottom: 2px solid var(--color-brass-panel);
    opacity: 0;
    animation: fadeIn 0.8s ease-out 0.8s forwards;
  }

  .webcam-inset {
    position: absolute;
    top: 20px;
    left: 20px;
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: #000;
    border: 2px solid var(--color-brass-panel);
    box-shadow: inset 0 0 0 1px var(--color-brass-pale), 0 4px 10px rgba(0,0,0,0.8);
    overflow: hidden;
    z-index: 10;
    opacity: 0;
  }

  .webcam-inset:not(.hidden) {
    animation: fadeIn 0.8s ease-out 1.2s forwards;
  }

  .overlay-canvas {
    width: 100%;
    height: 100%;
    transform: scaleX(-1);
    object-fit: cover;
    /* CRT tint effect */
    filter: sepia(0.8) hue-rotate(110deg) saturate(1.5) contrast(1.2);
  }

  .control-panel {
    height: 160px;
    background-color: #241c16;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 4rem;
    padding: 0 2rem;
    box-shadow: inset 0 4px 10px rgba(0,0,0,0.5);
    
    opacity: 0;
    transform: translateY(20px);
    animation: settleIn 0.6s ease-out 1.4s forwards;
  }

  .power-overlay {
    position: absolute;
    inset: 0;
    background: rgba(18, 16, 13, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 20;
    backdrop-filter: blur(4px);
    opacity: 0;
    animation: fadeIn 0.8s ease-out 1.5s forwards;
  }

  .power-overlay.loading {
    background: rgba(18, 16, 13, 0.7);
  }

  .power-button {
    background: var(--color-brass-panel);
    border: 2px solid var(--color-brass-pale);
    color: var(--color-ivory);
    font-family: var(--font-ui);
    padding: 1.5rem 3rem;
    font-size: 1.2rem;
    letter-spacing: 4px;
    cursor: pointer;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
    transition: all 0.2s;
  }

  .power-button:hover {
    background: var(--color-brass-highlight);
    box-shadow: 0 6px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2);
  }

  .power-button:active {
    transform: scale(0.98);
    box-shadow: 0 2px 4px rgba(0,0,0,0.8);
  }

  .readout-text {
    font-family: var(--font-readout);
    color: var(--color-ivory);
    font-size: 1.5rem;
    letter-spacing: 2px;
    animation: pulse 1.5s infinite alternate;
  }

  .fallback-warning {
    position: absolute;
    top: 20px;
    right: 20px;
    background: rgba(139, 90, 43, 0.2);
    border: 1px solid var(--color-brass-highlight);
    color: var(--color-brass-pale);
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
    letter-spacing: 1px;
    border-radius: 2px;
    z-index: 10;
    max-width: 300px;
  }

  .error-panel {
    background: var(--color-base);
    border: 2px solid var(--color-brass-highlight);
    color: var(--color-brass-pale);
    padding: 2rem;
    font-family: var(--font-ui);
    letter-spacing: 2px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.8);
  }
  .error-panel h3 {
    margin-top: 0;
    color: var(--color-brass-highlight);
  }
  .error-panel ul {
    list-style: none;
    padding: 0;
  }
  .error-panel li {
    margin: 0.5rem 0;
  }

  .help-panel {
    background: rgba(18, 16, 13, 0.95);
    border: 2px solid var(--color-brass-pale);
    color: var(--color-ivory);
    padding: 3rem;
    font-family: var(--font-ui);
    max-width: 600px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.8), inset 0 0 0 1px var(--color-brass-highlight);
    text-align: center;
    border-radius: 4px;
  }
  .help-panel h3 {
    margin-top: 0;
    color: var(--color-brass-highlight);
    letter-spacing: 4px;
    font-size: 1.5rem;
    margin-bottom: 2rem;
  }
  .help-grid {
    display: flex;
    gap: 2rem;
    text-align: left;
  }
  .help-col {
    flex: 1;
    background: rgba(0,0,0,0.3);
    padding: 1.5rem;
    border: 1px solid var(--color-brass-panel);
  }
  .help-col h4 {
    margin-top: 0;
    letter-spacing: 2px;
    border-bottom: 1px solid var(--color-brass-panel);
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
  }
  .help-col p {
    font-size: 0.9rem;
    line-height: 1.6;
    margin: 0.5rem 0;
  }

  /* Animations */
  @keyframes frameEngrave {
    to {
      opacity: 1;
      clip-path: inset(0 0 0 0);
    }
  }

  @keyframes fadeIn {
    to { opacity: 1; }
  }

  @keyframes settleIn {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes pulse {
    from { opacity: 0.5; }
    to { opacity: 1; }
  }

  @media (max-width: 768px) {
    .instrument-face { padding: 1rem; }
    .control-panel { gap: 1.5rem; }
    .webcam-inset { width: 100px; height: 100px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .brass-frame, .plate-area, .webcam-inset, .control-panel {
      animation: none !important;
      opacity: 1 !important;
      clip-path: inset(0 0 0 0) !important;
      transform: none !important;
    }
  }
</style>
