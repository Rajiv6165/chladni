<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let value = 0.5; // Normalized value 0.0 to 1.0
  export let label = '';
  export let readout = '';
  export let isDragging = false;
  export let gestureColor: string | null = null;
  
  const dispatch = createEventDispatcher();
  
  let startY = 0;
  let startValue = 0;
  let knobElement: HTMLElement;
  
  const MIN_ANGLE = -135;
  const MAX_ANGLE = 135;
  const ANGLE_RANGE = MAX_ANGLE - MIN_ANGLE;
  
  // DRAG_SENSITIVITY: pixels of vertical drag to go from 0 to 1
  const DRAG_SENSITIVITY = 200; 

  $: angle = MIN_ANGLE + (value * ANGLE_RANGE);

  function handlePointerDown(e: PointerEvent | MouseEvent | TouchEvent) {
    if (e.type === 'touchstart') e.preventDefault(); // Prevent scrolling while interacting
    
    isDragging = true;
    startValue = value;
    
    if (e.type === 'touchstart') {
        const touch = (e as TouchEvent).touches[0];
        startY = touch.clientY;
    } else {
        startY = (e as MouseEvent | PointerEvent).clientY;
    }

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
  }

  function handlePointerMove(e: MouseEvent | TouchEvent) {
    if (!isDragging) return;
    
    let currentY = 0;
    if (e.type === 'touchmove') {
        const touch = (e as TouchEvent).touches[0];
        currentY = touch.clientY;
        e.preventDefault(); // prevent scrolling
    } else {
        currentY = (e as MouseEvent).clientY;
    }
    
    const deltaY = startY - currentY; // Moving up increases value
    let newValue = startValue + (deltaY / DRAG_SENSITIVITY);
    
    // Clamp
    newValue = Math.max(0, Math.min(1, newValue));
    
    if (value !== newValue) {
        value = newValue;
        dispatch('change', value);
    }
  }

  function handlePointerUp() {
    isDragging = false;
    window.removeEventListener('mousemove', handlePointerMove);
    window.removeEventListener('mouseup', handlePointerUp);
    window.removeEventListener('touchmove', handlePointerMove);
    window.removeEventListener('touchend', handlePointerUp);
    dispatch('settle', value);
  }

  function handleKeyDown(e: KeyboardEvent) {
    let step = 0.05;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      value = Math.min(1, value + step);
      e.preventDefault();
      dispatch('change', value);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      value = Math.max(0, value - step);
      e.preventDefault();
      dispatch('change', value);
    }
  }
</script>

<div class="dial-container">
  <div 
    class="dial-knob"
    bind:this={knobElement}
    role="slider"
    tabindex="0"
    aria-valuenow={value}
    aria-valuemin="0"
    aria-valuemax="1"
    aria-label={label}
    on:mousedown={handlePointerDown}
    on:touchstart={handlePointerDown}
    on:keydown={handleKeyDown}
  >
    <svg viewBox="0 0 100 100" class="knob-svg" class:dragging={isDragging}>
      <!-- Outer metallic ring -->
      <circle cx="50" cy="50" r="48" fill="var(--color-brass-panel)" 
              stroke={gestureColor && !isDragging ? gestureColor : "var(--color-brass-pale)"} 
              stroke-width={gestureColor && !isDragging ? "2.5" : "1.5"} 
              style={gestureColor && !isDragging ? `filter: drop-shadow(0 0 6px ${gestureColor}); transition: all 0.3s ease;` : 'transition: all 0.3s ease;'} />
      
      <!-- Inner darker face -->
      <circle cx="50" cy="50" r="40" fill="#2a2016" />
      
      <!-- Indicator Group (Rotates) -->
      <g transform={`rotate(${angle} 50 50)`}>
        <!-- Pointer line -->
        <line x1="50" y1="50" x2="50" y2="15" stroke="var(--color-plate-accent)" stroke-width="4" stroke-linecap="round" />
        <!-- Pointer dot -->
        <circle cx="50" cy="15" r="4" fill="var(--color-ivory)" />
      </g>
    </svg>
  </div>
  
  {#if label}
    <div class="dial-label">{label}</div>
  {/if}
  
  {#if readout}
    <div class="dial-readout">{readout}</div>
  {/if}
</div>

<style>
  .dial-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    width: 80px; /* Base size */
  }

  .dial-knob {
    width: 100%;
    aspect-ratio: 1;
    cursor: ns-resize;
    outline: none;
    touch-action: none; /* Crucial for custom touch handling */
    border-radius: 50%;
    /* Subtle drop shadow for depth */
    box-shadow: 0 8px 16px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.1);
    transition: transform 0.1s, box-shadow 0.1s;
  }

  .dial-knob:focus-visible {
    box-shadow: 0 0 0 3px var(--color-plate-accent), 0 8px 16px rgba(0,0,0,0.4);
  }

  .dial-knob:hover, .dial-knob:focus-visible {
    transform: scale(1.05);
  }
  
  .dial-knob:active {
    transform: scale(0.98);
    box-shadow: 0 4px 8px rgba(0,0,0,0.5);
  }

  .knob-svg {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: 50%;
  }
  
  .knob-svg circle, .knob-svg line {
    transition: stroke 0.2s, fill 0.2s;
  }

  .knob-svg.dragging line {
    stroke: var(--color-ivory); /* Highlight pointer when interacting */
  }

  .dial-label {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--color-brass-pale);
    text-align: center;
  }

  .dial-readout {
    font-family: var(--font-readout);
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-ivory);
    text-align: center;
    /* Engraved look */
    text-shadow: 0 1px 1px rgba(0,0,0,0.8), 0 -1px 0 rgba(255,255,255,0.1);
  }
</style>
