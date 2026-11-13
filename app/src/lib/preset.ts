export type WaveformType = 'saw' | 'square' | 'triangle' | 'sine';
export type ModeMappingType = 'harmonic' | 'crystalline' | 'dense' | 'radial' | 'concentric';
export type EngineType = 'subtractive' | 'modal';
export type MaterialType = 'glass' | 'brass' | 'bronze' | 'wood' | 'ceramic';

export const MATERIAL_MAP: Record<MaterialType, number> = {
    glass: 0,
    brass: 1,
    bronze: 2,
    wood: 3,
    ceramic: 4,
};

export interface ModalPreset {
    material: MaterialType;
    decay: number;        // 0.1 - 10.0s
    dampingTilt: number;  // 0.0 - 2.0
    brightness: number;   // 0.1 - 1.0
    modeCount: number;    // 8 - 32
}

export interface SoundPreset {
    waveform: WaveformType;
    attack: number;          // 0.001 - 3.0s
    decay: number;           // 0.001 - 3.0s
    sustain: number;         // 0.0 - 1.0
    release: number;         // 0.001 - 5.0s
    filterCutoff: number;    // 100 - 10000 Hz
    filterResonance: number; // 0.0 - 1.0
    reverbMix: number;       // 0.0 - 1.0
    delayTime: number;       // 10 - 1000 ms
    delayFeedback: number;   // 0.0 - 0.95 (strictly < 1.0)
    detune: number;          // 0.0 - 50.0 cents
    masterGain: number;      // 0.0 - 1.5
}

export interface VisualPreset {
    lineSharpness: number;   // 0.5 - 3.5
    grainAmount: number;     // 0.0 - 1.0
    modeMapping: ModeMappingType;
    tint: {
        r: number;           // 0.0 - 1.0
        g: number;           // 0.0 - 1.0
        b: number;           // 0.0 - 1.0
    };
}

export interface GesturePreset {
    pitchRangeOctaves: number; // 1.0 - 3.5
    baseOctave: number;        // 1 - 5 (MIDI root 24, 36, 48, 60, 72)
    smoothing: number;         // 0.02 - 0.5
    pinchThreshold: number;    // 0.02 - 0.15
}

export interface PlatePreset {
    version: 1 | 2;
    id: string;
    name: string;
    description: string;
    category: 'factory' | 'user';
    engine?: EngineType;
    sound: SoundPreset;
    modal?: ModalPreset;
    visual: VisualPreset;
    gesture: GesturePreset;
}

export const WAVEFORM_MAP: Record<WaveformType, number> = {
    saw: 0,
    square: 1,
    triangle: 2,
    sine: 3,
};

export const FACTORY_PLATES: PlatePreset[] = [
    {
        version: 2,
        id: 'bell',
        name: 'Bell',
        description: 'Pure sinusoidal resonance with crystalline nodal lines and enduring bell decay.',
        category: 'factory',
        engine: 'subtractive',
        sound: {
            waveform: 'sine',
            attack: 0.005,
            decay: 0.8,
            sustain: 0.2,
            release: 1.5,
            filterCutoff: 6500,
            filterResonance: 0.25,
            reverbMix: 0.65,
            delayTime: 450,
            delayFeedback: 0.65,
            detune: 0.0,
            masterGain: 1.05,
        },
        visual: {
            lineSharpness: 2.6,
            grainAmount: 0.2,
            modeMapping: 'crystalline',
            tint: { r: 0.85, g: 0.80, b: 0.70 }, // Pale Antique Ivory
        },
        gesture: {
            pitchRangeOctaves: 2.0,
            baseOctave: 4,
            smoothing: 0.12,
            pinchThreshold: 0.05,
        },
    },
    {
        version: 2,
        id: 'glass-harmonica',
        name: 'Glass Harmonica',
        description: 'Soft-edged ethereal friction tones with fine powder dispersion.',
        category: 'factory',
        engine: 'subtractive',
        sound: {
            waveform: 'triangle',
            attack: 0.15,
            decay: 0.4,
            sustain: 0.85,
            release: 0.8,
            filterCutoff: 3800,
            filterResonance: 0.35,
            reverbMix: 0.5,
            delayTime: 320,
            delayFeedback: 0.55,
            detune: 2.5,
            masterGain: 1.0,
        },
        visual: {
            lineSharpness: 1.4,
            grainAmount: 0.85,
            modeMapping: 'harmonic',
            tint: { r: 0.29, g: 0.52, b: 0.46 }, // Oxidized Copper / Verdigris
        },
        gesture: {
            pitchRangeOctaves: 2.0,
            baseOctave: 4,
            smoothing: 0.22,
            pinchThreshold: 0.05,
        },
    },
    {
        version: 2,
        id: 'brass-drone',
        name: 'Brass Drone',
        description: 'Heavy detuned dual-saw resonance with thick, viscous nodal ribbons.',
        category: 'factory',
        engine: 'subtractive',
        sound: {
            waveform: 'saw',
            attack: 0.08,
            decay: 0.5,
            sustain: 0.9,
            release: 0.6,
            filterCutoff: 1800,
            filterResonance: 0.65,
            reverbMix: 0.35,
            delayTime: 380,
            delayFeedback: 0.5,
            detune: 15.0,
            masterGain: 1.0,
        },
        visual: {
            lineSharpness: 0.85,
            grainAmount: 0.4,
            modeMapping: 'dense',
            tint: { r: 0.68, g: 0.48, b: 0.24 }, // Warm Burnished Brass
        },
        gesture: {
            pitchRangeOctaves: 2.0,
            baseOctave: 2,
            smoothing: 0.15,
            pinchThreshold: 0.05,
        },
    },
    {
        version: 2,
        id: 'pluck',
        name: 'Pluck',
        description: 'Percussive square-wave transient with snappy nodal settling.',
        category: 'factory',
        engine: 'subtractive',
        sound: {
            waveform: 'square',
            attack: 0.002,
            decay: 0.12,
            sustain: 0.05,
            release: 0.15,
            filterCutoff: 4200,
            filterResonance: 0.5,
            reverbMix: 0.2,
            delayTime: 160,
            delayFeedback: 0.3,
            detune: 0.0,
            masterGain: 0.95,
        },
        visual: {
            lineSharpness: 2.0,
            grainAmount: 0.15,
            modeMapping: 'concentric',
            tint: { r: 0.38, g: 0.46, b: 0.48 }, // Steely Slate Patina
        },
        gesture: {
            pitchRangeOctaves: 2.5,
            baseOctave: 3,
            smoothing: 0.08,
            pinchThreshold: 0.05,
        },
    },
    {
        version: 2,
        id: 'deep-plate',
        name: 'Deep Plate',
        description: 'Subterranean acoustic resonance vibrating heavy bronze grain.',
        category: 'factory',
        engine: 'subtractive',
        sound: {
            waveform: 'triangle',
            attack: 0.06,
            decay: 0.6,
            sustain: 0.8,
            release: 0.9,
            filterCutoff: 500,
            filterResonance: 0.75,
            reverbMix: 0.3,
            delayTime: 620,
            delayFeedback: 0.6,
            detune: 6.0,
            masterGain: 1.15,
        },
        visual: {
            lineSharpness: 0.75,
            grainAmount: 0.9,
            modeMapping: 'radial',
            tint: { r: 0.42, g: 0.36, b: 0.26 }, // Dark Patina Bronze
        },
        gesture: {
            pitchRangeOctaves: 1.5,
            baseOctave: 2,
            smoothing: 0.25,
            pinchThreshold: 0.05,
        },
    },
    {
        version: 2,
        id: 'shimmer',
        name: 'Shimmer',
        description: 'Scintillating high register with cascading echo trails and intricate geometry.',
        category: 'factory',
        engine: 'subtractive',
        sound: {
            waveform: 'saw',
            attack: 0.04,
            decay: 0.5,
            sustain: 0.75,
            release: 1.2,
            filterCutoff: 7500,
            filterResonance: 0.45,
            reverbMix: 0.75,
            delayTime: 520,
            delayFeedback: 0.82,
            detune: 8.0,
            masterGain: 1.0,
        },
        visual: {
            lineSharpness: 2.8,
            grainAmount: 0.95,
            modeMapping: 'crystalline',
            tint: { r: 0.78, g: 0.62, b: 0.32 }, // Gilded Brass
        },
        gesture: {
            pitchRangeOctaves: 2.5,
            baseOctave: 4,
            smoothing: 0.15,
            pinchThreshold: 0.05,
        },
    },
    // Phase 9 Modal Factory Plates
    {
        version: 2,
        id: 'struck-glass',
        name: 'Struck Glass',
        description: 'Crystalline resonance with slow high-frequency decay and pristine nodal clarity.',
        category: 'factory',
        engine: 'modal',
        modal: {
            material: 'glass',
            decay: 3.5,
            dampingTilt: 0.4,
            brightness: 0.9,
            modeCount: 24,
        },
        sound: {
            waveform: 'sine',
            attack: 0.005,
            decay: 0.5,
            sustain: 0.5,
            release: 1.0,
            filterCutoff: 8000,
            filterResonance: 0.3,
            reverbMix: 0.5,
            delayTime: 360,
            delayFeedback: 0.45,
            detune: 0.0,
            masterGain: 1.0,
        },
        visual: {
            lineSharpness: 3.0,
            grainAmount: 0.35,
            modeMapping: 'crystalline',
            tint: { r: 0.82, g: 0.86, b: 0.90 }, // Crystalline Pale Ivory
        },
        gesture: {
            pitchRangeOctaves: 2.0,
            baseOctave: 4,
            smoothing: 0.1,
            pinchThreshold: 0.05,
        },
    },
    {
        version: 2,
        id: 'bronze-gong',
        name: 'Bronze Gong',
        description: 'Heavy inharmonic spread with enduring fundamental resonance and dense particle dispersion.',
        category: 'factory',
        engine: 'modal',
        modal: {
            material: 'bronze',
            decay: 5.0,
            dampingTilt: 0.9,
            brightness: 0.65,
            modeCount: 32,
        },
        sound: {
            waveform: 'saw',
            attack: 0.01,
            decay: 0.8,
            sustain: 0.7,
            release: 2.0,
            filterCutoff: 3000,
            filterResonance: 0.5,
            reverbMix: 0.6,
            delayTime: 480,
            delayFeedback: 0.65,
            detune: 5.0,
            masterGain: 1.1,
        },
        visual: {
            lineSharpness: 1.2,
            grainAmount: 0.75,
            modeMapping: 'dense',
            tint: { r: 0.68, g: 0.48, b: 0.24 }, // Warm Burnished Brass
        },
        gesture: {
            pitchRangeOctaves: 2.0,
            baseOctave: 2,
            smoothing: 0.18,
            pinchThreshold: 0.05,
        },
    },
    {
        version: 2,
        id: 'wooden-plate',
        name: 'Wooden Plate',
        description: 'Rapid high-frequency damping with a dry, woody strike transient and broad low-order modes.',
        category: 'factory',
        engine: 'modal',
        modal: {
            material: 'wood',
            decay: 0.8,
            dampingTilt: 1.6,
            brightness: 0.45,
            modeCount: 16,
        },
        sound: {
            waveform: 'triangle',
            attack: 0.005,
            decay: 0.2,
            sustain: 0.1,
            release: 0.3,
            filterCutoff: 2200,
            filterResonance: 0.3,
            reverbMix: 0.25,
            delayTime: 180,
            delayFeedback: 0.2,
            detune: 0.0,
            masterGain: 1.05,
        },
        visual: {
            lineSharpness: 1.8,
            grainAmount: 0.5,
            modeMapping: 'harmonic',
            tint: { r: 0.56, g: 0.42, b: 0.28 }, // Warm Organic Timber
        },
        gesture: {
            pitchRangeOctaves: 2.0,
            baseOctave: 3,
            smoothing: 0.08,
            pinchThreshold: 0.05,
        },
    },
    {
        version: 2,
        id: 'cymatic-bowl',
        name: 'Cymatic Bowl',
        description: 'Metallic singing bowl shimmer with rich modal interplay and delicate verdigris ripples.',
        category: 'factory',
        engine: 'modal',
        modal: {
            material: 'ceramic',
            decay: 4.0,
            dampingTilt: 0.7,
            brightness: 0.8,
            modeCount: 24,
        },
        sound: {
            waveform: 'sine',
            attack: 0.01,
            decay: 0.6,
            sustain: 0.8,
            release: 1.8,
            filterCutoff: 5000,
            filterResonance: 0.4,
            reverbMix: 0.55,
            delayTime: 400,
            delayFeedback: 0.5,
            detune: 2.0,
            masterGain: 1.0,
        },
        visual: {
            lineSharpness: 2.4,
            grainAmount: 0.85,
            modeMapping: 'concentric',
            tint: { r: 0.32, g: 0.58, b: 0.52 }, // Fine Verdigris Patina
        },
        gesture: {
            pitchRangeOctaves: 2.5,
            baseOctave: 3,
            smoothing: 0.12,
            pinchThreshold: 0.05,
        },
    },
];

function clamp(val: any, min: number, max: number, defaultVal: number): number {
    const num = Number(val);
    if (!Number.isFinite(num)) return defaultVal;
    return Math.max(min, Math.min(max, num));
}

function sanitizeString(str: any, maxLength: number, defaultVal: string): string {
    if (typeof str !== 'string') return defaultVal;
    const cleaned = str.replace(/<[^>]*>/g, '').replace(/["'&]/g, '').trim();
    if (!cleaned) return defaultVal;
    return cleaned.slice(0, maxLength);
}

function getStorage(): Storage | null {
    if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
        return (globalThis as any).localStorage;
    }
    return null;
}

export function validatePlatePreset(raw: any): { valid: true; preset: PlatePreset } | { valid: false; error: string } {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { valid: false, error: 'Preset must be an object' };
    }

    if (raw.version !== 1 && raw.version !== 2) {
        return { valid: false, error: `Unsupported preset version: ${raw.version} (expected 1 or 2)` };
    }

    const name = sanitizeString(raw.name, 36, 'Untitled Plate');
    const id = sanitizeString(raw.id || `plate-${Date.now()}`, 48, `plate-${Date.now()}`);
    const description = sanitizeString(raw.description, 140, 'Custom user crafted plate preset.');
    const category: 'factory' | 'user' = raw.category === 'factory' ? 'factory' : 'user';

    const engine: EngineType = raw.engine === 'modal' ? 'modal' : 'subtractive';

    const s = raw.sound || {};
    const validWaveforms: WaveformType[] = ['saw', 'square', 'triangle', 'sine'];
    const waveform: WaveformType = validWaveforms.includes(s.waveform) ? s.waveform : 'saw';

    const sound: SoundPreset = {
        waveform,
        attack: clamp(s.attack, 0.001, 3.0, 0.01),
        decay: clamp(s.decay, 0.001, 3.0, 0.1),
        sustain: clamp(s.sustain, 0.0, 1.0, 0.7),
        release: clamp(s.release, 0.001, 5.0, 0.2),
        filterCutoff: clamp(s.filterCutoff, 100, 10000, 2000),
        filterResonance: clamp(s.filterResonance, 0.0, 1.0, 0.5),
        reverbMix: clamp(s.reverbMix, 0.0, 1.0, 0.3),
        delayTime: clamp(s.delayTime, 10, 1000, 300),
        delayFeedback: clamp(s.delayFeedback, 0.0, 0.95, 0.5),
        detune: clamp(s.detune, 0.0, 50.0, 0.0),
        masterGain: clamp(s.masterGain, 0.0, 1.5, 1.0),
    };

    let modal: ModalPreset | undefined = undefined;
    if (engine === 'modal' || raw.modal) {
        const m = raw.modal || {};
        const validMaterials: MaterialType[] = ['glass', 'brass', 'bronze', 'wood', 'ceramic'];
        const material: MaterialType = validMaterials.includes(m.material) ? m.material : 'brass';
        modal = {
            material,
            decay: clamp(m.decay, 0.1, 10.0, 2.0),
            dampingTilt: clamp(m.dampingTilt, 0.0, 2.0, 0.8),
            brightness: clamp(m.brightness, 0.1, 1.0, 0.7),
            modeCount: Math.round(clamp(m.modeCount, 8, 32, 16)),
        };
    }

    const v = raw.visual || {};
    const validModes: ModeMappingType[] = ['harmonic', 'crystalline', 'dense', 'radial', 'concentric'];
    const modeMapping: ModeMappingType = validModes.includes(v.modeMapping) ? v.modeMapping : 'harmonic';

    const tintObj = v.tint || {};
    const visual: VisualPreset = {
        lineSharpness: clamp(v.lineSharpness, 0.5, 3.5, 1.5),
        grainAmount: clamp(v.grainAmount, 0.0, 1.0, 0.5),
        modeMapping,
        tint: {
            r: clamp(tintObj.r, 0.0, 1.0, 0.29),
            g: clamp(tintObj.g, 0.0, 1.0, 0.48),
            b: clamp(tintObj.b, 0.0, 1.0, 0.42),
        },
    };

    const g = raw.gesture || {};
    const gesture: GesturePreset = {
        pitchRangeOctaves: clamp(g.pitchRangeOctaves, 1.0, 3.5, 2.0),
        baseOctave: Math.round(clamp(g.baseOctave, 1, 5, 3)),
        smoothing: clamp(g.smoothing, 0.02, 0.5, 0.15),
        pinchThreshold: clamp(g.pinchThreshold, 0.02, 0.15, 0.05),
    };

    const preset: PlatePreset = {
        version: raw.version === 1 ? 1 : 2,
        id,
        name,
        description,
        category,
        engine,
        sound,
        ...(modal ? { modal } : {}),
        visual,
        gesture,
    };

    return { valid: true, preset };
}

const STORAGE_KEY = 'chladni_user_plates_v1';

export function loadUserPlates(): { plates: PlatePreset[]; warning?: string } {
    try {
        const storage = getStorage();
        if (!storage) {
            return { plates: [], warning: 'Local storage is unavailable in this environment.' };
        }
        const data = storage.getItem(STORAGE_KEY);
        if (!data) return { plates: [] };

        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) return { plates: [] };

        const validPlates: PlatePreset[] = [];
        for (const item of parsed) {
            const res = validatePlatePreset(item);
            if (res.valid) {
                res.preset.category = 'user';
                validPlates.push(res.preset);
            }
        }
        return { plates: validPlates };
    } catch (e: any) {
        console.warn('Failed to load user plates from localStorage', e);
        return { plates: [], warning: 'Unable to access stored plates: storage may be blocked.' };
    }
}

export function saveUserPlates(plates: PlatePreset[]): { success: boolean; error?: string } {
    try {
        const storage = getStorage();
        if (!storage) {
            return { success: false, error: 'Local storage is not supported.' };
        }
        const userOnly = plates.filter(p => p.category === 'user');
        storage.setItem(STORAGE_KEY, JSON.stringify(userOnly));
        return { success: true };
    } catch (e: any) {
        console.error('Failed to save user plates to localStorage', e);
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            return { success: false, error: 'Storage quota exceeded. Please export or delete older plates.' };
        }
        return { success: false, error: 'Storage error: plate could not be persisted.' };
    }
}

export function exportPlateJson(preset: PlatePreset): string {
    return JSON.stringify(preset, null, 2);
}

export function exportAllPlatesJson(presets: PlatePreset[]): string {
    return JSON.stringify({ version: 2, type: 'chladni_plate_collection', plates: presets }, null, 2);
}

export function parsePlateFileContent(content: string): { 
    success: boolean; 
    plates: PlatePreset[]; 
    error?: string 
} {
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            const validated: PlatePreset[] = [];
            for (const item of parsed) {
                const res = validatePlatePreset(item);
                if (res.valid) validated.push(res.preset);
            }
            if (validated.length === 0) {
                return { success: false, plates: [], error: 'No valid plates found in file.' };
            }
            return { success: true, plates: validated };
        } else if (parsed && typeof parsed === 'object') {
            if (parsed.type === 'chladni_plate_collection' && Array.isArray(parsed.plates)) {
                const validated: PlatePreset[] = [];
                for (const item of parsed.plates) {
                    const res = validatePlatePreset(item);
                    if (res.valid) validated.push(res.preset);
                }
                if (validated.length === 0) {
                    return { success: false, plates: [], error: 'Collection contains no valid plates.' };
                }
                return { success: true, plates: validated };
            } else {
                const res = validatePlatePreset(parsed);
                if (res.valid) {
                    return { success: true, plates: [res.preset] };
                }
                return { success: false, plates: [], error: res.error };
            }
        }
        return { success: false, plates: [], error: 'Unrecognized file format.' };
    } catch (e: any) {
        return { success: false, plates: [], error: 'Malformed JSON file: parse error.' };
    }
}

// Compact URL hash sharing: #plate=<base64url>
export function presetToUrlHash(preset: PlatePreset): string {
    try {
        const minified: any = {
            v: preset.version,
            n: preset.name,
            d: preset.description,
            e: preset.engine,
            s: preset.sound,
            vi: preset.visual,
            g: preset.gesture,
        };
        if (preset.modal) {
            minified.m = preset.modal;
        }
        const utf8Bytes = new TextEncoder().encode(JSON.stringify(minified));
        let binary = '';
        for (let i = 0; i < utf8Bytes.length; i++) {
            binary += String.fromCharCode(utf8Bytes[i]);
        }
        const base64 = btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        return `#plate=${base64}`;
    } catch (e) {
        return '';
    }
}

export function urlHashToPreset(hash: string): { success: boolean; preset?: PlatePreset; error?: string } {
    if (!hash.startsWith('#plate=')) {
        return { success: false, error: 'No plate hash present.' };
    }
    const rawB64 = hash.slice(7);
    if (!rawB64) {
        return { success: false, error: 'Empty plate hash.' };
    }

    try {
        let base64 = rawB64.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
            base64 += '=';
        }
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const jsonStr = new TextDecoder().decode(bytes);
        const parsed = JSON.parse(jsonStr);

        const reconstructed = {
            version: parsed.v || 2,
            name: parsed.n || 'Shared Plate',
            description: parsed.d || 'Shared through acoustic link.',
            category: 'user',
            engine: parsed.e,
            sound: parsed.s,
            modal: parsed.m,
            visual: parsed.vi,
            gesture: parsed.g,
        };

        const res = validatePlatePreset(reconstructed);
        if (res.valid) {
            return { success: true, preset: res.preset };
        }
        return { success: false, error: res.error };
    } catch (e) {
        return { success: false, error: 'Invalid or corrupt plate link.' };
    }
}
