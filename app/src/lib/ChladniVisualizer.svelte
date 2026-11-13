<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { audioEngine } from './AudioEngine';
  import type { VisualPreset, ModeMappingType } from './preset';

  let canvasEl: HTMLCanvasElement;
  let gl: WebGL2RenderingContext | null = null;
  let animationFrameId: number;
  let program: WebGLProgram | null = null;

  // Uniform locations
  let u_resolution: WebGLUniformLocation | null = null;
  let u_time: WebGLUniformLocation | null = null;
  let u_amplitude: WebGLUniformLocation | null = null;
  let u_n: WebGLUniformLocation | null = null;
  let u_m: WebGLUniformLocation | null = null;
  let u_lineSharpness: WebGLUniformLocation | null = null;
  let u_grainAmount: WebGLUniformLocation | null = null;
  let u_tint: WebGLUniformLocation | null = null;

  // Phase 9 Modal Engine uniforms
  let u_engine_mode: WebGLUniformLocation | null = null;
  let u_mode_count: WebGLUniformLocation | null = null;
  let u_mode_nm: WebGLUniformLocation | null = null;
  let u_mode_amp: WebGLUniformLocation | null = null;
  let u_strike_pos: WebGLUniformLocation | null = null;
  let u_strike_time: WebGLUniformLocation | null = null;

  // Visual parameter state with smoothing to avoid jarring graphical jumps
  let currentSharpness = 1.5;
  let targetSharpness = 1.5;
  let currentGrain = 0.5;
  let targetGrain = 0.5;
  let currentTint = { r: 0.29, g: 0.48, b: 0.42 };
  let targetTint = { r: 0.29, g: 0.48, b: 0.42 };
  let activeModeMapping: ModeMappingType = 'harmonic';

  // Strike ripple animation state
  let lastStrikePos = { x: 0.5, y: 0.5 };
  let lastStrikeTimeMs = -999999;

  const vertexShaderSource = `#version 300 es
    in vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentShaderSource = `#version 300 es
    precision highp float;

    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_amplitude;
    uniform float u_n;
    uniform float u_m;
    uniform float u_lineSharpness;
    uniform float u_grainAmount;
    uniform vec3 u_tint;

    // Modal engine uniforms
    uniform int u_engine_mode;
    uniform int u_mode_count;
    uniform vec2 u_mode_nm[32];
    uniform float u_mode_amp[32];
    uniform vec2 u_strike_pos;
    uniform float u_strike_time;

    out vec4 fragColor;

    // Random noise function
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    // 2D Noise based on Morgan McGuire @morgan3d
    float noise(in vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    void main() {
        // Normalize coordinates and center origin
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        vec2 st = uv * 2.0 - 1.0;
        
        // Correct aspect ratio so the pattern doesn't stretch
        st.x *= u_resolution.x / u_resolution.y;

        // Scale plate slightly
        vec2 pos = st * 1.5;

        // Apply jitter based on amplitude and time
        // More amplitude = more jitter on the grains
        vec2 jitter = vec2(noise(pos * 50.0 + u_time * 5.0), noise(pos * 50.0 - u_time * 5.0)) * 2.0 - 1.0;
        vec2 evalPos = pos + jitter * (u_amplitude * 0.02);

        float pi = 3.14159265359;
        float chladni = 0.0;

        if (u_engine_mode == 1) {
            // Modal Synthesis Engine: Physical superposition of live modes
            // Map evalPos to normalized plate coordinates [0.0, 1.0]
            vec2 plateCoords = evalPos * 0.4 + 0.5;
            float totalWeight = 0.0;

            for (int i = 0; i < 32; i++) {
                if (i >= u_mode_count) break;
                float amp = u_mode_amp[i];
                if (amp > 0.0001) {
                    vec2 nm = u_mode_nm[i];
                    // Real square plate mode superposition phi_nm(x, y) = sin(n*pi*x)*sin(m*pi*y) - sin(m*pi*x)*sin(n*pi*y)
                    float phi = sin(nm.x * pi * plateCoords.x) * sin(nm.y * pi * plateCoords.y)
                              - sin(nm.y * pi * plateCoords.x) * sin(nm.x * pi * plateCoords.y);
                    chladni += phi * amp;
                    totalWeight += amp;
                }
            }

            if (totalWeight > 0.0001) {
                chladni /= totalWeight;
            } else {
                // When completely silent, rest on fundamental mode (1, 1) or quiet pattern
                chladni = sin(pi * plateCoords.x) * sin(pi * plateCoords.y);
            }
        } else {
            // Subtractive Engine: Continuous frequency-mapped (n, m) pair
            chladni = sin(u_n * pi * evalPos.x) * sin(u_m * pi * evalPos.y) - sin(u_m * pi * evalPos.x) * sin(u_n * pi * evalPos.y);
        }

        // The sand settles where vibration is 0 (nodal lines).
        // Brightness is high when abs(chladni) is close to 0.
        // Line thickness is shaped by lineSharpness preset parameter
        float sharpness = max(0.2, u_lineSharpness);
        float thickness = (0.05 + u_amplitude * 0.1) / sharpness;
        float sand = smoothstep(thickness, 0.0, abs(chladni));
        
        // Fade overall sand visibility based on amplitude so it dims when quiet
        sand *= smoothstep(0.0, 0.1, u_amplitude) * 0.8 + 0.2;

        // Fine grain in the sand modulated by grainAmount
        float grain = random(evalPos * 100.0 + u_time) * 0.5 + 0.5;
        sand *= mix(1.0, grain, min(u_amplitude * 5.0, 1.0) * u_grainAmount);

        // Design-system brass / ivory / patina palette
        vec3 bgColor = vec3(0.07, 0.06, 0.05);   // #12100D
        vec3 sandColor = u_tint;                 // Preset-specific acoustic tint
        vec3 rimColor = vec3(0.54, 0.35, 0.17);  // #8B5A2B
        
        // Mix sand onto background
        vec3 color = mix(bgColor, sandColor, sand);

        // Rim lighting / Vignette (using original un-jittered st)
        float dist = length(st);
        float vignette = smoothstep(0.7, 1.8, dist);
        color = mix(color, rimColor, vignette * 0.5);

        // Strike Marker: Subtle brass ripple ring indicating strike location & cancellation
        if (u_strike_time >= 0.0 && u_strike_time < 1.0) {
            // Map strike position [0, 1] to screen space pos
            vec2 strikeSt = (u_strike_pos - 0.5) / 0.4;
            float dStrike = length(pos - strikeSt);
            float ringRadius = 0.02 + u_strike_time * 0.22;
            float ring = smoothstep(0.015, 0.002, abs(dStrike - ringRadius)) * (1.0 - u_strike_time);
            
            // Subtle glowing brass strike marker
            vec3 strikeColor = vec3(0.92, 0.78, 0.50);
            color = mix(color, strikeColor, ring * 0.75);
        }

        fragColor = vec4(color, 1.0);
    }
  `;

  function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  export function getCanvas(): HTMLCanvasElement | null {
    return canvasEl;
  }

  export function setVisualPreset(visual: VisualPreset) {
    targetSharpness = visual.lineSharpness;
    targetGrain = visual.grainAmount;
    targetTint = { ...visual.tint };
    activeModeMapping = visual.modeMapping;
  }

  export function triggerStrike(x: number, y: number) {
    lastStrikePos = { x, y };
    lastStrikeTimeMs = performance.now();
  }

  function handlePlateClick(e: MouseEvent | TouchEvent) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    // Convert click to normalized plate coordinates [0, 1]
    const u = (clientX - rect.left) / rect.width;
    const v = (clientY - rect.top) / rect.height;

    // Invert Y for acoustic plate coordinate system
    const strikeX = Math.max(0.02, Math.min(0.98, u));
    const strikeY = Math.max(0.02, Math.min(0.98, 1.0 - v));

    triggerStrike(strikeX, strikeY);

    if (audioEngine.isReady) {
      if (audioEngine.engineMode === 'modal') {
        audioEngine.strike(strikeX, strikeY, 0.9);
      } else {
        // In subtractive mode, click toggles or triggers a brief note
        audioEngine.noteOn(audioEngine.currentFreq || 220, 0.9);
        setTimeout(() => audioEngine.noteOff(audioEngine.currentFreq || 220), 200);
      }
    }
  }

  function initWebGL() {
    if (!canvasEl) return;
    gl = canvasEl.getContext('webgl2', { preserveDrawingBuffer: true });
    if (!gl) {
      console.error('WebGL2 not supported');
      return;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    program = gl.createProgram();
    if (!program || !vertexShader || !fragmentShader) return;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }

    // Set up full-screen quad
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    // Get uniform locations
    u_resolution = gl.getUniformLocation(program, 'u_resolution');
    u_time = gl.getUniformLocation(program, 'u_time');
    u_amplitude = gl.getUniformLocation(program, 'u_amplitude');
    u_n = gl.getUniformLocation(program, 'u_n');
    u_m = gl.getUniformLocation(program, 'u_m');
    u_lineSharpness = gl.getUniformLocation(program, 'u_lineSharpness');
    u_grainAmount = gl.getUniformLocation(program, 'u_grainAmount');
    u_tint = gl.getUniformLocation(program, 'u_tint');

    // Phase 9 Modal Uniforms
    u_engine_mode = gl.getUniformLocation(program, 'u_engine_mode');
    u_mode_count = gl.getUniformLocation(program, 'u_mode_count');
    u_mode_nm = gl.getUniformLocation(program, 'u_mode_nm');
    u_mode_amp = gl.getUniformLocation(program, 'u_mode_amp');
    u_strike_pos = gl.getUniformLocation(program, 'u_strike_pos');
    u_strike_time = gl.getUniformLocation(program, 'u_strike_time');
  }

  // Predefined modal pairs for various plate geometries
  const MODE_SERIES: Record<ModeMappingType, Array<{ n: number, m: number }>> = {
    harmonic: [
      { n: 1, m: 2 },
      { n: 2, m: 3 },
      { n: 3, m: 2 },
      { n: 3, m: 4 },
      { n: 4, m: 5 },
      { n: 5, m: 3 },
      { n: 5, m: 6 }
    ],
    crystalline: [
      { n: 2, m: 4 },
      { n: 3, m: 5 },
      { n: 4, m: 6 },
      { n: 5, m: 7 },
      { n: 6, m: 4 },
      { n: 6, m: 8 }
    ],
    dense: [
      { n: 3, m: 3 },
      { n: 4, m: 3 },
      { n: 4, m: 4 },
      { n: 5, m: 4 },
      { n: 5, m: 5 },
      { n: 6, m: 6 }
    ],
    radial: [
      { n: 1, m: 1 },
      { n: 2, m: 1 },
      { n: 2, m: 2 },
      { n: 3, m: 1 },
      { n: 3, m: 2 },
      { n: 4, m: 2 }
    ],
    concentric: [
      { n: 1, m: 3 },
      { n: 2, m: 4 },
      { n: 3, m: 5 },
      { n: 4, m: 2 },
      { n: 5, m: 3 },
      { n: 6, m: 2 }
    ]
  };

  // Map log-frequency to interpolated modal pairs based on active style
  function mapFreqToModes(freq: number, modeStyle: ModeMappingType) {
    if (freq < 10) return { n: 1, m: 1 };
    
    // Clamp freq to our musical range
    let f = Math.max(65, Math.min(1046, freq));
    let t = Math.log10(f / 65) / Math.log10(1046 / 65);
    
    const modePairs = MODE_SERIES[modeStyle] || MODE_SERIES.harmonic;
    
    let index = t * (modePairs.length - 1);
    let i0 = Math.floor(index);
    let i1 = Math.min(i0 + 1, modePairs.length - 1);
    let frac = index - i0;
    
    // Smoothstep fraction for snappy lock to integer modes
    let smoothFrac = frac * frac * (3 - 2 * frac); 
    
    let n = modePairs[i0].n * (1 - smoothFrac) + modePairs[i1].n * smoothFrac;
    let m = modePairs[i0].m * (1 - smoothFrac) + modePairs[i1].m * smoothFrac;
    
    return { n, m };
  }

  function resizeCanvas() {
    if (!canvasEl || !gl) return;
    const displayWidth = window.innerWidth;
    const displayHeight = window.innerHeight;

    if (canvasEl.width !== displayWidth || canvasEl.height !== displayHeight) {
      canvasEl.width = displayWidth;
      canvasEl.height = displayHeight;
      gl.viewport(0, 0, canvasEl.width, canvasEl.height);
    }
  }

  function render(time: number) {
    if (!gl || !program) return;

    resizeCanvas();

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);

    // Smooth uniform transitions
    currentSharpness += (targetSharpness - currentSharpness) * 0.05;
    currentGrain += (targetGrain - currentGrain) * 0.05;
    currentTint.r += (targetTint.r - currentTint.r) * 0.05;
    currentTint.g += (targetTint.g - currentTint.g) * 0.05;
    currentTint.b += (targetTint.b - currentTint.b) * 0.05;

    // Get audio data
    const { rms, freq } = audioEngine.getAnalysis();
    const modes = mapFreqToModes(freq, activeModeMapping);

    const isModal = audioEngine.engineMode === 'modal';
    gl.uniform1i(u_engine_mode, isModal ? 1 : 0);

    if (isModal) {
      gl.uniform1i(u_mode_count, 32);
      gl.uniform2fv(u_mode_nm, audioEngine.getModeTable());
      gl.uniform1fv(u_mode_amp, audioEngine.getModalAmplitudes());
    }

    const strikeElapsedSec = lastStrikeTimeMs > 0 ? (time - lastStrikeTimeMs) * 0.001 : 999.0;
    gl.uniform2f(u_strike_pos, lastStrikePos.x, lastStrikePos.y);
    gl.uniform1f(u_strike_time, strikeElapsedSec);

    gl.uniform2f(u_resolution, canvasEl.width, canvasEl.height);
    gl.uniform1f(u_time, time * 0.001); // time in seconds
    gl.uniform1f(u_amplitude, rms);
    gl.uniform1f(u_n, modes.n);
    gl.uniform1f(u_m, modes.m);
    gl.uniform1f(u_lineSharpness, currentSharpness);
    gl.uniform1f(u_grainAmount, currentGrain);
    gl.uniform3f(u_tint, currentTint.r, currentTint.g, currentTint.b);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    animationFrameId = requestAnimationFrame(render);
  }

  onMount(() => {
    initWebGL();
    animationFrameId = requestAnimationFrame(render);
    window.addEventListener('resize', resizeCanvas);
  });

  onDestroy(() => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    window.removeEventListener('resize', resizeCanvas);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<canvas 
  bind:this={canvasEl} 
  class="chladni-canvas"
  on:click={handlePlateClick}
  aria-label="Interactive Acoustic Chladni Plate"
></canvas>

<style>
  .chladni-canvas {
    width: 100vw;
    height: 100vh;
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 0;
    cursor: crosshair;
  }
</style>
