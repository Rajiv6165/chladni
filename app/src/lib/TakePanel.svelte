<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { type TakeResult, MediaRecorderController } from './MediaRecorderController';

  export let take: TakeResult;

  const dispatch = createEventDispatcher<{
    discard: void;
  }>();

  let activeTab: 'video' | 'audio' = 'video';
  let videoEl: HTMLVideoElement;
  let audioEl: HTMLAudioElement;

  function triggerDownload(url: string, filename: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleDownloadWav() {
    triggerDownload(take.wavUrl, take.wavFilename);
  }

  function handleDownloadVideo() {
    triggerDownload(take.videoUrl, take.videoFilename);
  }

  function handleDiscard() {
    if (videoEl) videoEl.pause();
    if (audioEl) audioEl.pause();
    MediaRecorderController.disposeTake(take);
    dispatch('discard');
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleDiscard();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div class="take-overlay" role="dialog" aria-modal="true" aria-labelledby="take-title">
  <div class="take-card">
    <div class="card-header">
      <div class="title-group">
        <h3 id="take-title" class="take-title">TAKE ARCHIVE</h3>
        <span class="take-time">{MediaRecorderController.formatTime(take.durationSec)} DURATION</span>
      </div>
      <button class="close-btn" on:click={handleDiscard} aria-label="Close and discard take">✕</button>
    </div>

    {#if take.stoppedReason === 'backgrounded'}
      <div class="notice-bar">
        RECORDING SAVED: TAB SWITCH DETECTED
      </div>
    {:else if take.stoppedReason === 'max_length_reached'}
      <div class="notice-bar">
        RECORDING SAVED: 3-MINUTE CEILING REACHED
      </div>
    {/if}

    <!-- Tab switcher for player preview -->
    <div class="preview-tabs">
      <button
        class="tab-btn"
        class:active={activeTab === 'video'}
        on:click={() => { activeTab = 'video'; if (audioEl) audioEl.pause(); }}
      >
        VIDEO ({take.videoFormatLabel})
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === 'audio'}
        on:click={() => { activeTab = 'audio'; if (videoEl) videoEl.pause(); }}
      >
        WAV (16-BIT PCM)
      </button>
    </div>

    <!-- Media preview screen -->
    <div class="preview-stage">
      {#if activeTab === 'video'}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          bind:this={videoEl}
          src={take.videoUrl}
          controls
          playsinline
          class="preview-video"
        ></video>
      {:else}
        <div class="audio-stage">
          <div class="audio-dial-graphic">
            <svg viewBox="0 0 100 100" class="mini-dial">
              <circle cx="50" cy="50" r="44" fill="#1e1711" stroke="var(--color-brass-pale)" stroke-width="2" />
              <circle cx="50" cy="50" r="34" fill="#2a2016" />
              <line x1="50" y1="50" x2="50" y2="20" stroke="var(--color-plate-accent)" stroke-width="4" stroke-linecap="round" />
            </svg>
            <div class="pcm-label">16-BIT / {take.sampleRate} Hz</div>
          </div>
          <audio
            bind:this={audioEl}
            src={take.wavUrl}
            controls
            class="preview-audio"
          ></audio>
        </div>
      {/if}
    </div>

    <!-- Take Metadata Summary Grid -->
    <div class="meta-grid">
      <div class="meta-item">
        <span class="meta-label">LOSSLESS WAV</span>
        <span class="meta-val">{MediaRecorderController.formatFileSize(take.wavSizeBytes)}</span>
        <span class="meta-sub">{take.sampleRate} Hz · Stereo 16-bit</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">SYNCHRONIZED VIDEO</span>
        <span class="meta-val">{MediaRecorderController.formatFileSize(take.videoSizeBytes)}</span>
        <span class="meta-sub">{take.videoFormatLabel}</span>
      </div>
    </div>

    <!-- Actions Panel -->
    <div class="card-actions">
      <button class="action-btn download-btn" on:click={handleDownloadWav}>
        <span class="btn-icon">↓</span>
        <span>DOWNLOAD WAV</span>
      </button>
      <button class="action-btn download-btn" on:click={handleDownloadVideo}>
        <span class="btn-icon">↓</span>
        <span>DOWNLOAD VIDEO</span>
      </button>
      <button class="action-btn discard-btn" on:click={handleDiscard}>
        <span>DISCARD TAKE</span>
      </button>
    </div>
  </div>
</div>

<style>
  .take-overlay {
    position: fixed;
    inset: 0;
    background: rgba(10, 8, 6, 0.85);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1.5rem;
    box-sizing: border-box;
    animation: fadeIn 0.25s ease-out forwards;
  }

  .take-card {
    background: #1c1612;
    border: 2px solid var(--color-brass-pale);
    border-radius: 4px;
    width: 100%;
    max-width: 580px;
    box-shadow: 0 15px 40px rgba(0, 0, 0, 0.85), inset 0 0 0 1px var(--color-brass-highlight);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .card-header {
    background: #281f18;
    border-bottom: 1px solid var(--color-brass-panel);
    padding: 0.85rem 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title-group {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }

  .take-title {
    margin: 0;
    font-family: var(--font-ui);
    font-size: 1.1rem;
    letter-spacing: 2.5px;
    color: var(--color-brass-pale);
  }

  .take-time {
    font-family: var(--font-readout);
    font-size: 1.05rem;
    color: var(--color-ivory);
    letter-spacing: 1px;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-brass-pale);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.2rem 0.5rem;
    line-height: 1;
    border-radius: 2px;
  }

  .close-btn:hover, .close-btn:focus-visible {
    color: var(--color-ivory);
    outline: 1px solid var(--color-plate-accent);
  }

  .notice-bar {
    background: rgba(200, 75, 49, 0.18);
    border-bottom: 1px solid rgba(200, 75, 49, 0.4);
    color: #ff9f8a;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    letter-spacing: 1px;
    padding: 0.4rem 1.25rem;
    text-align: center;
  }

  .preview-tabs {
    display: flex;
    background: #14100c;
    border-bottom: 1px solid var(--color-brass-panel);
  }

  .tab-btn {
    flex: 1;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: rgba(212, 184, 150, 0.7);
    font-family: var(--font-ui);
    font-size: 0.75rem;
    letter-spacing: 1.5px;
    padding: 0.65rem 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tab-btn:hover {
    color: var(--color-ivory);
  }

  .tab-btn.active {
    color: var(--color-ivory);
    border-bottom-color: var(--color-plate-accent);
    background: rgba(74, 122, 107, 0.12);
  }

  .preview-stage {
    background: #0d0a08;
    height: 250px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }

  .preview-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    outline: none;
  }

  .audio-stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    width: 100%;
    padding: 1rem;
  }

  .audio-dial-graphic {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }

  .mini-dial {
    width: 60px;
    height: 60px;
  }

  .pcm-label {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    letter-spacing: 1px;
    color: var(--color-brass-pale);
  }

  .preview-audio {
    width: 80%;
    max-width: 360px;
    filter: invert(0.85) hue-rotate(180deg);
  }

  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    padding: 0.85rem 1.25rem;
    background: #18130f;
    border-bottom: 1px solid var(--color-brass-panel);
  }

  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .meta-label {
    font-family: var(--font-ui);
    font-size: 0.65rem;
    letter-spacing: 1px;
    color: var(--color-brass-pale);
  }

  .meta-val {
    font-family: var(--font-readout);
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-ivory);
  }

  .meta-sub {
    font-family: var(--font-ui);
    font-size: 0.65rem;
    color: rgba(232, 220, 196, 0.6);
  }

  .card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    padding: 0.85rem 1.25rem;
    background: #241c16;
  }

  .action-btn {
    flex: 1;
    min-width: 140px;
    padding: 0.75rem 1rem;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    letter-spacing: 1.5px;
    border-radius: 3px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    transition: all 0.15s ease;
    outline: none;
  }

  .action-btn:focus-visible {
    box-shadow: 0 0 0 3px var(--color-plate-accent);
  }

  .download-btn {
    background: var(--color-brass-panel);
    border: 1px solid var(--color-brass-pale);
    color: var(--color-ivory);
  }

  .download-btn:hover {
    background: var(--color-brass-highlight);
    border-color: var(--color-ivory);
  }

  .download-btn:active {
    transform: scale(0.98);
  }

  .btn-icon {
    font-size: 0.95rem;
    font-weight: bold;
  }

  .discard-btn {
    background: transparent;
    border: 1px solid rgba(212, 184, 150, 0.35);
    color: rgba(212, 184, 150, 0.8);
  }

  .discard-btn:hover {
    background: rgba(200, 75, 49, 0.2);
    border-color: #ff785a;
    color: #ff9f8a;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @media (max-width: 600px) {
    .take-card { max-width: 95vw; }
    .card-actions { flex-direction: column; }
    .meta-grid { grid-template-columns: 1fr; gap: 0.5rem; }
  }

  @media (prefers-reduced-motion: reduce) {
    .take-overlay { animation: none !important; }
    .action-btn { transition: none !important; }
  }
</style>
