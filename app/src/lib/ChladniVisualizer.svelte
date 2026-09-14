<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { audioEngine } from './AudioEngine';

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
        
        // Evaluate the Chladni pattern at the slightly jittered position
        float chladni = sin(u_n * pi * evalPos.x) * sin(u_m * pi * evalPos.y) - sin(u_m * pi * evalPos.x) * sin(u_n * pi * evalPos.y);

        // The sand settles where the vibration is 0 (nodal lines).
        // Brightness is high when abs(chladni) is close to 0.
        // We make the line thickness dependent on amplitude (louder = wider dispersion)
        float thickness = 0.05 + u_amplitude * 0.1;
        float sand = smoothstep(thickness, 0.0, abs(chladni));
        
        // Fade overall sand visibility based on amplitude so it dims when quiet
        sand *= smoothstep(0.0, 0.1, u_amplitude) * 0.8 + 0.2;

        // Add fine grain to the sand for physical feel
        float grain = random(evalPos * 100.0 + u_time) * 0.5 + 0.5;
        sand *= mix(1.0, grain, min(u_amplitude * 5.0, 1.0));

        // Palette
        vec3 bgColor = vec3(0.07, 0.06, 0.05);   // #12100D
        vec3 sandColor = vec3(0.29, 0.48, 0.42); // #4A7A6B
        vec3 rimColor = vec3(0.54, 0.35, 0.17);  // #8B5A2B
        
        // Mix sand onto background
        vec3 color = mix(bgColor, sandColor, sand);

        // Rim lighting / Vignette (using original un-jittered st)
        float dist = length(st);
        float vignette = smoothstep(0.7, 1.8, dist);
        color = mix(color, rimColor, vignette * 0.5);

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

  function initWebGL() {
    if (!canvasEl) return;
    gl = canvasEl.getContext('webgl2');
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
  }

  // Map log-frequency to an interpolated array of predefined integer pairs
  function mapFreqToModes(freq: number) {
    if (freq < 10) return { n: 1, m: 1 };
    
    // Clamp freq to our musical range (e.g. MIDI 48 to 84 -> ~130Hz to ~1046Hz)
    let f = Math.max(130, Math.min(1046, freq));
    let t = Math.log10(f / 130) / Math.log10(1046 / 130);
    
    const modePairs = [
        {n: 1, m: 2},
        {n: 2, m: 3},
        {n: 3, m: 2},
        {n: 3, m: 4},
        {n: 4, m: 5},
        {n: 5, m: 3},
        {n: 5, m: 6}
    ];
    
    let index = t * (modePairs.length - 1);
    let i0 = Math.floor(index);
    let i1 = Math.min(i0 + 1, modePairs.length - 1);
    let frac = index - i0;
    
    // Smoothstep the fraction so it "snaps" to integer modes for most of the range
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

    // Get audio data
    const { rms, freq } = audioEngine.getAnalysis();
    
    const modes = mapFreqToModes(freq);

    gl.uniform2f(u_resolution, canvasEl.width, canvasEl.height);
    gl.uniform1f(u_time, time * 0.001); // time in seconds
    gl.uniform1f(u_amplitude, rms);
    gl.uniform1f(u_n, modes.n);
    gl.uniform1f(u_m, modes.m);

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

<canvas bind:this={canvasEl} class="chladni-canvas"></canvas>

<style>
  .chladni-canvas {
    width: 100vw;
    height: 100vh;
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    z-index: -1; /* Place it behind everything else */
    pointer-events: none; /* Let clicks pass through */
  }
</style>
