let audioCtx;
let synthWorkletNode;

const startBtn = document.getElementById('start-btn');
const cutoffSlider = document.getElementById('cutoff');
const resonanceSlider = document.getElementById('resonance');
const reverbSlider = document.getElementById('reverb');
const pianoContainer = document.getElementById('piano');

function mtof(note) {
    return 440.0 * Math.pow(2, (note - 69) / 12);
}

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

notes.forEach(n => {
    const key = document.createElement('div');
    key.className = `key ${n.color}`;
    key.innerText = n.color === 'white' ? n.name : '';
    key.dataset.note = n.note;

    const playNote = (e) => {
        e.preventDefault();
        key.classList.add('active');
        if (synthWorkletNode) {
            synthWorkletNode.port.postMessage({
                type: 'note_on',
                freq: mtof(n.note),
                velocity: 1.0
            });
        }
    };

    const stopNote = (e) => {
        e.preventDefault();
        key.classList.remove('active');
        if (synthWorkletNode) {
            synthWorkletNode.port.postMessage({
                type: 'note_off',
                freq: mtof(n.note)
            });
        }
    };

    key.addEventListener('mousedown', playNote);
    key.addEventListener('mouseup', stopNote);
    key.addEventListener('mouseleave', stopNote);
    
    key.addEventListener('touchstart', playNote);
    key.addEventListener('touchend', stopNote);
    key.addEventListener('touchcancel', stopNote);

    pianoContainer.appendChild(key);
});

startBtn.addEventListener('click', async () => {
    if (audioCtx) return;

    audioCtx = new AudioContext();
    startBtn.innerText = 'Initializing...';
    startBtn.disabled = true;

    try {
        await audioCtx.audioWorklet.addModule('worklet.js?v=9', { type: 'module' });
        
        synthWorkletNode = new AudioWorkletNode(audioCtx, 'synth-worklet');
        synthWorkletNode.connect(audioCtx.destination);
        
        const response = await fetch('../pkg/synth_core_bg.wasm?v=8');
        const buffer = await response.arrayBuffer();
        const wasmModule = await WebAssembly.compile(buffer);

        synthWorkletNode.port.onmessage = (e) => {
            if (e.data === 'ready') {
                startBtn.innerText = 'Audio Running';
                
                synthWorkletNode.port.postMessage({ type: 'set_cutoff', value: parseFloat(cutoffSlider.value) });
                synthWorkletNode.port.postMessage({ type: 'set_resonance', value: parseFloat(resonanceSlider.value) });
                synthWorkletNode.port.postMessage({ type: 'set_reverb', value: parseFloat(reverbSlider.value) });
            }
        };

        synthWorkletNode.port.postMessage({ type: 'init_wasm', module: wasmModule, sampleRate: audioCtx.sampleRate });

    } catch (e) {
        console.error('Failed to init audio worklet', e);
        startBtn.innerText = 'Error (see console)';
    }
});

cutoffSlider.addEventListener('input', (e) => {
    if (synthWorkletNode) {
        synthWorkletNode.port.postMessage({ type: 'set_cutoff', value: parseFloat(e.target.value) });
    }
});
resonanceSlider.addEventListener('input', (e) => {
    if (synthWorkletNode) {
        synthWorkletNode.port.postMessage({ type: 'set_resonance', value: parseFloat(e.target.value) });
    }
});
reverbSlider.addEventListener('input', (e) => {
    if (synthWorkletNode) {
        synthWorkletNode.port.postMessage({ type: 'set_reverb', value: parseFloat(e.target.value) });
    }
});
