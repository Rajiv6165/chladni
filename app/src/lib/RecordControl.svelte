<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { RecordingState } from './MediaRecorderController';

  export let state: RecordingState = 'idle';
  export let elapsedSeconds = 0;
  export let isWarning = false;
  export let remainingSeconds = 180;
  export let formatLabel = 'WEBM + WAV';
  export let includeInsetAndFrame = false;
  export let isAudioReady = false;

  const dispatch = createEventDispatcher<{
    toggleRecord: void;
    toggleIncludeInset: boolean;
  }>();

  function formatTime(secs: number): string {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  }

  function handleClick() {
    if (!isAudioReady || state === 'finishing') return;
    dispatch('toggleRecord');
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }

  function handleToggleInset(e: Event) {
    const target = e.target as HTMLInputElement;
    includeInsetAndFrame = target.checked;
    dispatch('toggleIncludeInset', includeInsetAndFrame);
  }
</script>

<div class="rec-module">
  <div
    class="rec-button"
    class:recording={state === 'recording'}
    class:finishing={state === 'finishing'}
    class:warning={isWarning}
    class:disabled={!isAudioReady}
    role="button"
    tabindex={isAudioReady && state !== 'finishing' ? 0 : -1}
    aria-label={state === 'recording' ? 'Stop Recording' : 'Start Recording'}
    on:click={handleClick}
    on:keydown={handleKeyDown}
  >
    <!-- Outer metallic bezel ring -->
    <div class="bezel-ring">
      <div class="inner-face">
        <!-- Mechanical status lamp -->
        <div class="status-lamp" class:active={state === 'recording'} class:pulsing={state === 'recording' && !isWarning} class:alert={isWarning}></div>

        <!-- Readout & State Text -->
        {#if state === 'finishing'}
          <div class="rec-readout finishing-text">ENCODING</div>
        {:else if state === 'recording'}
          <div class="rec-readout" class:warning-text={isWarning}>
            {formatTime(elapsedSeconds)}
          </div>
        {:else}
          <div class="rec-readout idle-text">0:00</div>
        {/if}

        <div class="rec-label">
          {#if state === 'recording'}
            STOP
          {:else if state === 'finishing'}
            SAVING
          {:else}
            REC
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Format & Toggle metadata -->
  <div class="rec-subtext">
    <span class="format-badge" title="Muxed canvas video & lossless 16-bit PCM WAV">{formatLabel}</span>

    {#if state === 'recording' && isWarning}
      <span class="warning-tag">{Math.ceil(remainingSeconds)}s LEFT</span>
    {/if}
  </div>

  <!-- Privacy-Safe Opt-In Toggle -->
  <label class="privacy-toggle" title="Default captures only the Chladni plate (no webcam). Opt-in to composite full frame and camera inset.">
    <input
      type="checkbox"
      checked={includeInsetAndFrame}
      disabled={state === 'recording' || state === 'finishing'}
      on:change={handleToggleInset}
    />
    <span class="toggle-text">INCLUDE INSET</span>
  </label>
</div>

<style>
  .rec-module {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    width: 105px;
    user-select: none;
  }

  .rec-button {
    width: 78px;
    height: 78px;
    border-radius: 50%;
    cursor: pointer;
    outline: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .rec-button:focus-visible {
    box-shadow: 0 0 0 3px var(--color-plate-accent), 0 8px 16px rgba(0, 0, 0, 0.6);
  }

  .rec-button:hover:not(.disabled) {
    transform: scale(1.05);
  }

  .rec-button:active:not(.disabled) {
    transform: scale(0.96);
  }

  .rec-button.disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .bezel-ring {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: radial-gradient(circle, var(--color-brass-panel) 65%, var(--color-brass-highlight) 100%);
    border: 2px solid var(--color-brass-pale);
    box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.15), 0 8px 16px rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding: 4px;
  }

  .inner-face {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: #1e1711;
    border: 1px solid rgba(212, 184, 150, 0.25);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    box-sizing: border-box;
    box-shadow: inset 0 3px 6px rgba(0, 0, 0, 0.8);
  }

  /* Physical Jewel Lamp Indicator */
  .status-lamp {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4a3828;
    border: 1px solid #2b1f15;
    margin-bottom: 2px;
    transition: background-color 0.3s ease, box-shadow 0.3s ease;
  }

  .status-lamp.active {
    background: #c84b31;
    border-color: #ff785a;
    box-shadow: 0 0 8px #c84b31, 0 0 16px rgba(200, 75, 49, 0.6);
  }

  .status-lamp.pulsing {
    animation: lampBlink 1.2s infinite ease-in-out;
  }

  .status-lamp.alert {
    background: #e63946;
    animation: lampFastBlink 0.5s infinite alternate ease-in-out;
  }

  .rec-readout {
    font-family: var(--font-readout);
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--color-ivory);
    line-height: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
    letter-spacing: 0.5px;
  }

  .rec-readout.idle-text {
    color: rgba(232, 220, 196, 0.6);
  }

  .rec-readout.finishing-text {
    font-size: 0.65rem;
    font-family: var(--font-ui);
    letter-spacing: 1px;
    color: var(--color-brass-pale);
    animation: pulse 1s infinite alternate;
  }

  .rec-readout.warning-text {
    color: #ff9f43;
    animation: pulse 0.5s infinite alternate;
  }

  .rec-label {
    font-family: var(--font-ui);
    font-size: 0.65rem;
    letter-spacing: 1.5px;
    color: var(--color-brass-pale);
    margin-top: 1px;
    font-weight: bold;
  }

  .rec-subtext {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .format-badge {
    font-family: var(--font-ui);
    font-size: 0.6rem;
    letter-spacing: 0.8px;
    color: rgba(212, 184, 150, 0.8);
    text-transform: uppercase;
  }

  .warning-tag {
    font-family: var(--font-ui);
    font-size: 0.6rem;
    color: #ff785a;
    font-weight: bold;
    letter-spacing: 0.5px;
  }

  .privacy-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    margin-top: 2px;
  }

  .privacy-toggle input[type="checkbox"] {
    appearance: none;
    width: 11px;
    height: 11px;
    border: 1px solid var(--color-brass-pale);
    background: #1a1612;
    border-radius: 2px;
    cursor: pointer;
    margin: 0;
    position: relative;
    outline: none;
  }

  .privacy-toggle input[type="checkbox"]:focus-visible {
    box-shadow: 0 0 0 2px var(--color-plate-accent);
  }

  .privacy-toggle input[type="checkbox"]:checked {
    background: var(--color-plate-accent);
    border-color: var(--color-brass-pale);
  }

  .privacy-toggle input[type="checkbox"]:checked::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 0px;
    width: 4px;
    height: 7px;
    border: solid var(--color-ivory);
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
  }

  .toggle-text {
    font-family: var(--font-ui);
    font-size: 0.55rem;
    letter-spacing: 0.8px;
    color: var(--color-brass-pale);
    opacity: 0.8;
  }

  @keyframes lampBlink {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.85); }
  }

  @keyframes lampFastBlink {
    from { opacity: 1; }
    to { opacity: 0.3; }
  }

  @media (prefers-reduced-motion: reduce) {
    .status-lamp.pulsing,
    .status-lamp.alert,
    .rec-readout.finishing-text,
    .rec-readout.warning-text {
      animation: none !important;
      opacity: 1 !important;
    }
  }
</style>
