<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import {
    FACTORY_PLATES,
    loadUserPlates,
    saveUserPlates,
    exportPlateJson,
    exportAllPlatesJson,
    parsePlateFileContent,
    presetToUrlHash,
    urlHashToPreset,
    validatePlatePreset,
    type PlatePreset,
  } from './preset';

  export let activePlate: PlatePreset = FACTORY_PLATES[0];
  export let isModified: boolean = false;

  const dispatch = createEventDispatcher<{
    selectPlate: PlatePreset;
    revertPlate: void;
    saveAsPlate: { name: string; description: string };
  }>();

  let userPlates: PlatePreset[] = [];
  let storageNotice: string = '';
  let toastMessage: string = '';
  let toastTimeout: any = null;

  // Dialog state
  let modalMode: 'none' | 'save' | 'rename' | 'delete' = 'none';
  let modalInputName: string = '';
  let modalInputDesc: string = '';
  let modalError: string = '';
  let fileInputEl: HTMLInputElement;

  $: allPlates = [...FACTORY_PLATES, ...userPlates];

  onMount(() => {
    // 1. Load user plates from localStorage
    const res = loadUserPlates();
    if (res.plates) {
      userPlates = res.plates;
    }
    if (res.warning) {
      storageNotice = res.warning;
    }

    // 2. Check for URL hash share: #plate=<base64url>
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#plate=')) {
      const shareRes = urlHashToPreset(window.location.hash);
      if (shareRes.success && shareRes.preset) {
        const shared = shareRes.preset;
        // Check if already in user plates, else add temporarily
        const existingIdx = userPlates.findIndex(p => p.id === shared.id || p.name === shared.name);
        if (existingIdx >= 0) {
          activePlate = userPlates[existingIdx];
        } else {
          userPlates = [...userPlates, shared];
          activePlate = shared;
          saveUserPlates(userPlates);
        }
        dispatch('selectPlate', activePlate);
        showToast(`SHARED PLATE LOADED: "${activePlate.name.toUpperCase()}"`);
      } else if (shareRes.error) {
        showToast(`LINK ERROR: ${shareRes.error.toUpperCase()}`);
      }
    }
  });

  function showToast(msg: string) {
    toastMessage = msg;
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastMessage = '';
    }, 4000);
  }

  export function selectPlateByIndex(idx: number) {
    if (idx >= 0 && idx < allPlates.length) {
      selectPlate(allPlates[idx]);
    }
  }

  export function selectPlate(plate: PlatePreset) {
    activePlate = plate;
    dispatch('selectPlate', plate);
  }

  function handleKeydown(e: KeyboardEvent, index: number) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIdx = (index + 1) % allPlates.length;
      selectPlateByIndex(nextIdx);
      focusTab(nextIdx);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIdx = (index - 1 + allPlates.length) % allPlates.length;
      selectPlateByIndex(prevIdx);
      focusTab(prevIdx);
    } else if (e.key === 'Home') {
      e.preventDefault();
      selectPlateByIndex(0);
      focusTab(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      selectPlateByIndex(allPlates.length - 1);
      focusTab(allPlates.length - 1);
    }
  }

  function focusTab(idx: number) {
    setTimeout(() => {
      const tabs = document.querySelectorAll('.plate-tab');
      if (tabs[idx]) {
        (tabs[idx] as HTMLElement).focus();
      }
    }, 10);
  }

  function openSaveDialog() {
    modalMode = 'save';
    // Default name
    let base = activePlate.name.replace(/ \(User\)/g, '');
    let candidate = `${base} Variant`;
    let counter = 2;
    while (allPlates.some(p => p.name.toLowerCase() === candidate.toLowerCase())) {
      candidate = `${base} Variant ${counter++}`;
    }
    modalInputName = candidate;
    modalInputDesc = activePlate.description;
    modalError = '';
  }

  function openRenameDialog() {
    if (activePlate.category !== 'user') return;
    modalMode = 'rename';
    modalInputName = activePlate.name;
    modalInputDesc = activePlate.description;
    modalError = '';
  }

  function openDeleteDialog() {
    if (activePlate.category !== 'user') return;
    modalMode = 'delete';
    modalError = '';
  }

  function closeModal() {
    modalMode = 'none';
    modalError = '';
  }

  function confirmSave() {
    const cleanName = modalInputName.trim();
    if (!cleanName) {
      modalError = 'Please provide a plate designation.';
      return;
    }
    if (cleanName.length > 36) {
      modalError = 'Name exceeds 36 characters.';
      return;
    }
    // Duplicate check
    const exists = userPlates.some(p => p.name.toLowerCase() === cleanName.toLowerCase());
    if (exists) {
      modalError = 'A user plate with this name already exists.';
      return;
    }

    dispatch('saveAsPlate', {
      name: cleanName,
      description: modalInputDesc.trim() || 'Acoustic plate craft.',
    });
    closeModal();
  }

  export function addSavedUserPlate(newPlate: PlatePreset) {
    userPlates = [...userPlates, newPlate];
    const saveRes = saveUserPlates(userPlates);
    if (!saveRes.success && saveRes.error) {
      showToast(saveRes.error);
    } else {
      showToast(`PLATE "${newPlate.name.toUpperCase()}" ENGRAVED`);
    }
    activePlate = newPlate;
  }

  function confirmRename() {
    if (activePlate.category !== 'user') return;
    const cleanName = modalInputName.trim();
    if (!cleanName) {
      modalError = 'Name cannot be empty.';
      return;
    }
    const exists = userPlates.some(p => p.id !== activePlate.id && p.name.toLowerCase() === cleanName.toLowerCase());
    if (exists) {
      modalError = 'Another plate has this name.';
      return;
    }

    activePlate = {
      ...activePlate,
      name: cleanName,
      description: modalInputDesc.trim() || activePlate.description,
    };
    userPlates = userPlates.map(p => (p.id === activePlate.id ? activePlate : p));
    saveUserPlates(userPlates);
    showToast(`PLATE RENAMED: "${cleanName.toUpperCase()}"`);
    closeModal();
  }

  function confirmDelete() {
    if (activePlate.category !== 'user') return;
    const targetId = activePlate.id;
    userPlates = userPlates.filter(p => p.id !== targetId);
    saveUserPlates(userPlates);
    showToast(`PLATE "${activePlate.name.toUpperCase()}" DECOMMISSIONED`);
    // Fall back to Bell
    activePlate = FACTORY_PLATES[0];
    dispatch('selectPlate', activePlate);
    closeModal();
  }

  function exportCurrentPlate() {
    const jsonStr = exportPlateJson(activePlate);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chladni-plate-${activePlate.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`PLATE "${activePlate.name.toUpperCase()}" EXPORTED`);
  }

  function exportAllPlates() {
    const jsonStr = exportAllPlatesJson(allPlates);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chladni-plate-collection.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('PLATE COLLECTION EXPORTED');
  }

  function triggerImport() {
    if (fileInputEl) {
      fileInputEl.value = '';
      fileInputEl.click();
    }
  }

  async function handleFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    try {
      const text = await file.text();
      const parseRes = parsePlateFileContent(text);
      if (!parseRes.success || !parseRes.plates || parseRes.plates.length === 0) {
        showToast(`IMPORT FAILED: ${parseRes.error || 'INVALID DATA'}`);
        return;
      }

      const importedPlates = parseRes.plates;
      let countAdded = 0;
      let lastImported = activePlate;

      for (const plate of importedPlates) {
        plate.category = 'user';
        // Check duplicate ID or name
        let uniqueName = plate.name;
        let suffix = 2;
        while (allPlates.some(p => p.name.toLowerCase() === uniqueName.toLowerCase())) {
          uniqueName = `${plate.name} (${suffix++})`;
        }
        plate.name = uniqueName;
        plate.id = `imported-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        userPlates = [...userPlates, plate];
        lastImported = plate;
        countAdded++;
      }

      saveUserPlates(userPlates);
      activePlate = lastImported;
      dispatch('selectPlate', activePlate);
      showToast(`IMPORTED ${countAdded} PLATE${countAdded > 1 ? 'S' : ''} SUCCESSFULLY`);
    } catch (err) {
      showToast('IMPORT FAILED: COULD NOT READ FILE');
    }
  }

  async function shareCurrentPlate() {
    const hash = presetToUrlHash(activePlate);
    if (!hash) {
      showToast('SHARE FAILED: COULD NOT ENCODE PLATE');
      return;
    }

    const shareUrl = `${window.location.origin}${window.location.pathname}${hash}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        showToast('SHARE LINK COPIED TO CLIPBOARD');
      } else {
        // Fallback prompt
        window.prompt('Copy acoustic plate URL:', shareUrl);
      }
    } catch (e) {
      window.prompt('Copy acoustic plate URL:', shareUrl);
    }
  }
</script>

<!-- Hidden file input for plate import -->
<input
  bind:this={fileInputEl}
  type="file"
  accept=".json"
  style="display: none;"
  on:change={handleFileSelected}
  aria-label="Import plate from JSON"
/>

<div class="plate-rack-container" aria-label="Plate Preset Rack">
  <!-- Top metadata row: Name, modified status, description, and quick actions -->
  <div class="rack-header">
    <div class="plate-info">
      <div class="title-row">
        <span class="plate-title">{activePlate.name}</span>
        <span class="badge" class:user={activePlate.category === 'user'}>
          {activePlate.category === 'factory' ? 'FACTORY' : 'USER'}
        </span>
        <span class="badge engine-badge" class:modal={activePlate.engine === 'modal'}>
          {activePlate.engine === 'modal' ? 'MODAL' : 'SUBTRACTIVE'}
        </span>
        {#if isModified}
          <span class="modified-tag" title="Parameters changed from loaded plate">
            <span class="modified-dot"></span> MODIFIED
          </span>
          <button
            class="revert-btn"
            on:click={() => dispatch('revertPlate')}
            title="Revert modified dials back to loaded plate values"
          >
            REVERT
          </button>
        {/if}
      </div>
      <div class="plate-description">{activePlate.description}</div>
    </div>

    <!-- Quick action buttons in brass styling -->
    <div class="rack-actions">
      <button class="rack-btn" on:click={openSaveDialog} title="Save current settings as a new user plate">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
          <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/>
        </svg>
        SAVE AS
      </button>

      {#if activePlate.category === 'user'}
        <button class="rack-btn" on:click={openRenameDialog} title="Rename active user plate">
          RENAME
        </button>
        <button class="rack-btn danger" on:click={openDeleteDialog} title="Decommission active user plate">
          DELETE
        </button>
      {/if}

      <button class="rack-btn" on:click={exportCurrentPlate} title="Export active plate as JSON file">
        EXPORT
      </button>
      <button class="rack-btn" on:click={triggerImport} title="Import plate from JSON file">
        IMPORT
      </button>
      <button class="rack-btn" on:click={shareCurrentPlate} title="Copy shareable plate link to clipboard">
        SHARE
      </button>
    </div>
  </div>

  <!-- Engraved brass slot tabs -->
  <div
    class="tabs-strip"
    role="tablist"
    aria-label="Preset Plates"
  >
    {#each allPlates as plate, idx}
      {@const isActive = plate.id === activePlate.id}
      <button
        class="plate-tab"
        class:active={isActive}
        class:user-tab={plate.category === 'user'}
        role="tab"
        aria-selected={isActive}
        tabindex={isActive ? 0 : -1}
        on:click={() => selectPlate(plate)}
        on:keydown={(e) => handleKeydown(e, idx)}
      >
        <span class="tab-led" class:lit={isActive}></span>
        <span class="tab-label">{plate.name}</span>
        {#if plate.engine === 'modal'}
          <span class="tab-mode-tag">M</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Non-intrusive toast notification banner -->
  {#if toastMessage}
    <div class="rack-toast" role="status" aria-live="polite">
      {toastMessage}
    </div>
  {/if}

  {#if storageNotice}
    <div class="storage-warning" role="alert">
      {storageNotice}
    </div>
  {/if}
</div>

<!-- Modal Dialogs for Save, Rename, Delete -->
{#if modalMode !== 'none'}
  <div class="modal-backdrop" on:click={closeModal} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal-window" on:click|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
      {#if modalMode === 'save'}
        <h3 class="modal-title">ENGRAVE NEW PLATE</h3>
        <p class="modal-sub">Capture the current acoustic, visual, and gesture profile.</p>
        
        <label class="modal-field">
          <span>PLATE DESIGNATION</span>
          <input
            type="text"
            maxlength="36"
            bind:value={modalInputName}
            placeholder="e.g. Celestial Bell"
          />
        </label>

        <label class="modal-field">
          <span>ACOUSTIC CHARACTER (DESCRIPTION)</span>
          <input
            type="text"
            maxlength="140"
            bind:value={modalInputDesc}
            placeholder="e.g. Sharp crystal grain with low octave reverberation."
          />
        </label>

        {#if modalError}
          <div class="modal-error">{modalError}</div>
        {/if}

        <div class="modal-actions">
          <button class="modal-btn secondary" on:click={closeModal}>CANCEL</button>
          <button class="modal-btn primary" on:click={confirmSave}>SAVE PLATE</button>
        </div>

      {:else if modalMode === 'rename'}
        <h3 class="modal-title">RE-ENGRAVE DESIGNATION</h3>
        <p class="modal-sub">Rename user plate "{activePlate.name}".</p>

        <label class="modal-field">
          <span>NEW DESIGNATION</span>
          <input
            type="text"
            maxlength="36"
            bind:value={modalInputName}
          />
        </label>

        <label class="modal-field">
          <span>DESCRIPTION</span>
          <input
            type="text"
            maxlength="140"
            bind:value={modalInputDesc}
          />
        </label>

        {#if modalError}
          <div class="modal-error">{modalError}</div>
        {/if}

        <div class="modal-actions">
          <button class="modal-btn secondary" on:click={closeModal}>CANCEL</button>
          <button class="modal-btn primary" on:click={confirmRename}>APPLY</button>
        </div>

      {:else if modalMode === 'delete'}
        <h3 class="modal-title danger-text">DECOMMISSION PLATE</h3>
        <p class="modal-sub">
          Are you sure you wish to decommission <strong>"{activePlate.name}"</strong>?
          This action cannot be undone.
        </p>

        <div class="modal-actions">
          <button class="modal-btn secondary" on:click={closeModal}>CANCEL</button>
          <button class="modal-btn danger" on:click={confirmDelete}>DECOMMISSION</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .plate-rack-container {
    background: #1a1612;
    border-bottom: 2px solid var(--color-brass-panel);
    padding: 0.8rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    position: relative;
    z-index: 15;
    box-shadow: inset 0 2px 6px rgba(0,0,0,0.4);
  }

  .rack-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .plate-info {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }

  .plate-title {
    font-family: var(--font-readout);
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--color-ivory);
    letter-spacing: 1px;
    line-height: 1.1;
  }

  .badge {
    font-family: var(--font-ui);
    font-size: 0.65rem;
    letter-spacing: 1.5px;
    padding: 0.15rem 0.5rem;
    border-radius: 2px;
    background: rgba(139, 90, 43, 0.25);
    border: 1px solid var(--color-brass-highlight);
    color: var(--color-brass-pale);
  }

  .badge.user {
    background: rgba(74, 122, 107, 0.25);
    border-color: var(--color-plate-accent);
    color: var(--color-ivory);
  }

  .badge.engine-badge {
    background: rgba(139, 90, 43, 0.2);
    border-color: var(--color-brass-highlight);
    color: var(--color-brass-pale);
  }

  .badge.engine-badge.modal {
    background: rgba(74, 122, 107, 0.35);
    border-color: var(--color-plate-accent);
    color: #92d9c6;
  }

  .tab-mode-tag {
    font-size: 0.55rem;
    padding: 0 3px;
    border-radius: 2px;
    background: rgba(74, 122, 107, 0.35);
    color: #92d9c6;
    margin-left: 4px;
    font-weight: bold;
    border: 1px solid rgba(74, 122, 107, 0.5);
  }

  .modified-tag {
    font-family: var(--font-ui);
    font-size: 0.7rem;
    letter-spacing: 1px;
    color: #e6a23c;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .modified-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #e6a23c;
    box-shadow: 0 0 6px #e6a23c;
  }

  .revert-btn {
    background: none;
    border: 1px solid #e6a23c;
    color: #e6a23c;
    font-family: var(--font-ui);
    font-size: 0.65rem;
    letter-spacing: 1px;
    padding: 0.1rem 0.4rem;
    cursor: pointer;
    border-radius: 2px;
    transition: all 0.15s ease;
  }

  .revert-btn:hover {
    background: rgba(230, 162, 60, 0.2);
  }

  .plate-description {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--color-brass-pale);
    opacity: 0.85;
    letter-spacing: 0.5px;
  }

  .rack-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .rack-btn {
    background: #241c16;
    border: 1px solid var(--color-brass-panel);
    color: var(--color-ivory);
    font-family: var(--font-ui);
    font-size: 0.72rem;
    letter-spacing: 1.5px;
    padding: 0.35rem 0.65rem;
    cursor: pointer;
    border-radius: 2px;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    transition: all 0.15s ease;
  }

  .rack-btn:hover {
    background: var(--color-brass-panel);
    border-color: var(--color-brass-highlight);
    color: #fff;
  }

  .rack-btn:focus-visible {
    outline: 2px solid var(--color-brass-pale);
    outline-offset: 1px;
  }

  .rack-btn.danger {
    border-color: rgba(180, 50, 50, 0.6);
    color: #e57373;
  }

  .rack-btn.danger:hover {
    background: rgba(180, 50, 50, 0.25);
    border-color: #e57373;
  }

  .tabs-strip {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    padding-bottom: 0.2rem;
    scrollbar-width: thin;
    scrollbar-color: var(--color-brass-panel) transparent;
  }

  .tabs-strip::-webkit-scrollbar {
    height: 4px;
  }
  .tabs-strip::-webkit-scrollbar-thumb {
    background: var(--color-brass-panel);
    border-radius: 2px;
  }

  .plate-tab {
    background: #211913;
    border: 1px solid var(--color-brass-panel);
    color: var(--color-brass-pale);
    font-family: var(--font-ui);
    font-size: 0.75rem;
    letter-spacing: 1px;
    padding: 0.45rem 0.8rem;
    border-radius: 2px;
    cursor: pointer;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    position: relative;
    transition: all 0.18s ease;
  }

  .plate-tab:hover {
    background: #2a2018;
    color: var(--color-ivory);
    border-color: var(--color-brass-highlight);
  }

  .plate-tab:focus-visible {
    outline: 2px solid var(--color-brass-pale);
    outline-offset: 1px;
  }

  .plate-tab.active {
    background: #2e231a;
    border-color: var(--color-brass-pale);
    color: #fff;
    box-shadow: inset 0 0 8px rgba(139, 90, 43, 0.4), 0 2px 4px rgba(0,0,0,0.5);
  }

  .plate-tab.user-tab {
    border-left: 2px solid var(--color-plate-accent);
  }

  .tab-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #3a2e22;
    transition: all 0.2s ease;
  }

  .tab-led.lit {
    background: #4ade80;
    box-shadow: 0 0 6px #4ade80;
  }

  .rack-toast {
    position: absolute;
    bottom: -32px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(18, 16, 13, 0.95);
    border: 1px solid var(--color-brass-pale);
    color: var(--color-ivory);
    font-family: var(--font-ui);
    font-size: 0.72rem;
    letter-spacing: 1.5px;
    padding: 0.3rem 0.8rem;
    border-radius: 2px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.7);
    z-index: 30;
    pointer-events: none;
    animation: fadeIn 0.2s ease-out;
  }

  .storage-warning {
    font-family: var(--font-ui);
    font-size: 0.7rem;
    color: #e6a23c;
    letter-spacing: 0.5px;
  }

  /* Modal styling */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 100;
  }

  .modal-window {
    background: #1a1612;
    border: 2px solid var(--color-brass-panel);
    box-shadow: inset 0 0 0 1px var(--color-brass-pale), 0 20px 50px rgba(0,0,0,0.9);
    border-radius: 4px;
    width: 90%;
    max-width: 460px;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    font-family: var(--font-ui);
    color: var(--color-ivory);
  }

  .modal-title {
    margin: 0;
    font-family: var(--font-readout);
    font-size: 1.6rem;
    letter-spacing: 2px;
    color: var(--color-brass-pale);
  }

  .modal-title.danger-text {
    color: #e57373;
  }

  .modal-sub {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-brass-pale);
    opacity: 0.85;
    line-height: 1.4;
  }

  .modal-field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-size: 0.75rem;
    letter-spacing: 1.5px;
  }

  .modal-field input {
    background: #0e0c0a;
    border: 1px solid var(--color-brass-panel);
    border-radius: 2px;
    color: var(--color-ivory);
    font-family: var(--font-ui);
    font-size: 0.95rem;
    padding: 0.6rem 0.8rem;
    outline: none;
    transition: border-color 0.2s;
  }

  .modal-field input:focus {
    border-color: var(--color-brass-pale);
    box-shadow: 0 0 6px rgba(212, 184, 150, 0.3);
  }

  .modal-error {
    font-size: 0.8rem;
    color: #e57373;
    letter-spacing: 0.5px;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.8rem;
    margin-top: 0.5rem;
  }

  .modal-btn {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    letter-spacing: 1.5px;
    padding: 0.6rem 1.2rem;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .modal-btn.secondary {
    background: transparent;
    border: 1px solid var(--color-brass-panel);
    color: var(--color-brass-pale);
  }
  .modal-btn.secondary:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: var(--color-brass-highlight);
    color: #fff;
  }

  .modal-btn.primary {
    background: var(--color-brass-panel);
    border: 1px solid var(--color-brass-pale);
    color: var(--color-ivory);
  }
  .modal-btn.primary:hover {
    background: var(--color-brass-highlight);
    color: #fff;
  }

  .modal-btn.danger {
    background: rgba(180, 50, 50, 0.3);
    border: 1px solid #e57373;
    color: #e57373;
  }
  .modal-btn.danger:hover {
    background: rgba(180, 50, 50, 0.6);
    color: #fff;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translate(-50%, 6px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .rack-toast, .modal-window, .plate-tab {
      transition: none !important;
      animation: none !important;
    }
  }
</style>
