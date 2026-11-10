import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    FACTORY_PLATES,
    validatePlatePreset,
    parsePlateFileContent,
    exportPlateJson,
    exportAllPlatesJson,
    presetToUrlHash,
    urlHashToPreset,
    loadUserPlates,
    saveUserPlates,
    type PlatePreset,
} from './preset';

// Simple in-memory localStorage mock for node test runner
class MemoryStorage implements Storage {
    private store = new Map<string, string>();
    get length(): number { return this.store.size; }
    clear(): void { this.store.clear(); }
    getItem(key: string): string | null { return this.store.get(key) ?? null; }
    key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
    removeItem(key: string): void { this.store.delete(key); }
    setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}

const mockStorage = new MemoryStorage();
(globalThis as any).localStorage = mockStorage;

describe('Plate Preset Schema & Validation', () => {
    it('validates all 6 factory plates successfully', () => {
        expect(FACTORY_PLATES.length).toBeGreaterThanOrEqual(6);
        for (const plate of FACTORY_PLATES) {
            const res = validatePlatePreset(plate);
            expect(res.valid).toBe(true);
            if (res.valid) {
                expect(res.preset.category).toBe('factory');
                expect(res.preset.name).toBe(plate.name);
                expect(res.preset.sound.delayFeedback).toBeLessThanOrEqual(0.95);
            }
        }
    });

    it('rejects non-object or null input safely', () => {
        expect(validatePlatePreset(null).valid).toBe(false);
        expect(validatePlatePreset(undefined).valid).toBe(false);
        expect(validatePlatePreset('string').valid).toBe(false);
        expect(validatePlatePreset(12345).valid).toBe(false);
        expect(validatePlatePreset([1, 2, 3]).valid).toBe(false);
    });

    it('rejects unsupported version numbers', () => {
        const res = validatePlatePreset({ version: 99, name: 'Future' });
        expect(res.valid).toBe(false);
        if (!res.valid) {
            expect(res.error).toContain('Unsupported preset version');
        }
    });

    it('clamps numeric values into safe operational ranges', () => {
        const extremeInput = {
            version: 1,
            name: 'Extreme Plate',
            sound: {
                waveform: 'square',
                attack: -5.0, // Should clamp to >= 0.001
                decay: 99.0,  // Should clamp to <= 3.0
                sustain: 2.5, // Should clamp to <= 1.0
                release: -1.0,
                filterCutoff: 999999, // Should clamp to <= 10000
                filterResonance: -0.5, // Should clamp to >= 0.0
                reverbMix: 1.5,
                delayTime: 5000,
                delayFeedback: 1.5, // Critical: strictly < 1.0 (<= 0.95)
                detune: 100,
                masterGain: 10,
            },
            visual: {
                lineSharpness: 10.0,
                grainAmount: -2.0,
                modeMapping: 'invalid_mode',
                tint: { r: 5.0, g: -1.0, b: 0.5 },
            },
            gesture: {
                pitchRangeOctaves: 10,
                baseOctave: 10,
                smoothing: 0.001,
                pinchThreshold: 1.0,
            },
        };

        const res = validatePlatePreset(extremeInput);
        expect(res.valid).toBe(true);
        if (res.valid) {
            const { sound, visual, gesture } = res.preset;
            expect(sound.attack).toBe(0.001);
            expect(sound.decay).toBe(3.0);
            expect(sound.sustain).toBe(1.0);
            expect(sound.release).toBe(0.001);
            expect(sound.filterCutoff).toBe(10000);
            expect(sound.filterResonance).toBe(0.0);
            expect(sound.reverbMix).toBe(1.0);
            expect(sound.delayTime).toBe(1000);
            expect(sound.delayFeedback).toBe(0.95); // Feedback clamped below 1.0
            expect(sound.detune).toBe(50.0);
            expect(sound.masterGain).toBe(1.5);

            expect(visual.lineSharpness).toBe(3.5);
            expect(visual.grainAmount).toBe(0.0);
            expect(visual.modeMapping).toBe('harmonic'); // Fallback to safe mode
            expect(visual.tint.r).toBe(1.0);
            expect(visual.tint.g).toBe(0.0);
            expect(visual.tint.b).toBe(0.5);

            expect(gesture.pitchRangeOctaves).toBe(3.5);
            expect(gesture.baseOctave).toBe(5);
            expect(gesture.smoothing).toBe(0.02);
            expect(gesture.pinchThreshold).toBe(0.15);
        }
    });

    it('strips rogue and prototype pollution fields', () => {
        const malicious = JSON.parse(
            '{"version":1,"name":"Clean","__proto__":{"polluted":true},"rogueField":"steal_cookie","sound":{"waveform":"saw"}}'
        );
        const res = validatePlatePreset(malicious);
        expect(res.valid).toBe(true);
        if (res.valid) {
            expect((res.preset as any).rogueField).toBeUndefined();
            expect((res.preset as any).polluted).toBeUndefined();
        }
    });

    it('sanitizes strings of HTML tags and enforces length limits', () => {
        const dirty = {
            version: 1,
            name: '<script>alert("xss")</script>My Very Long Plate Name That Exceeds The Maximum Allowed Thirty Six Character Boundary Easily',
            description: '<b>Formatted</b> <i>text</i> description',
        };
        const res = validatePlatePreset(dirty);
        expect(res.valid).toBe(true);
        if (res.valid) {
            expect(res.preset.name).not.toContain('<script>');
            expect(res.preset.name).not.toContain('</script>');
            expect(res.preset.name.length).toBeLessThanOrEqual(36);
            expect(res.preset.description).toBe('Formatted text description');
        }
    });
});

describe('Plate Export & Import Round-trip', () => {
    it('successfully serializes and parses a single plate', () => {
        const original = FACTORY_PLATES[0];
        const jsonStr = exportPlateJson(original);
        const parsed = parsePlateFileContent(jsonStr);

        expect(parsed.success).toBe(true);
        expect(parsed.plates.length).toBe(1);
        expect(parsed.plates[0].name).toBe(original.name);
        expect(parsed.plates[0].sound.waveform).toBe(original.sound.waveform);
        expect(parsed.plates[0].sound.delayFeedback).toBe(original.sound.delayFeedback);
        expect(parsed.plates[0].visual.lineSharpness).toBe(original.visual.lineSharpness);
    });

    it('successfully serializes and parses a collection of plates', () => {
        const jsonStr = exportAllPlatesJson(FACTORY_PLATES.slice(0, 3));
        const parsed = parsePlateFileContent(jsonStr);

        expect(parsed.success).toBe(true);
        expect(parsed.plates.length).toBe(3);
        expect(parsed.plates[0].name).toBe(FACTORY_PLATES[0].name);
        expect(parsed.plates[1].name).toBe(FACTORY_PLATES[1].name);
        expect(parsed.plates[2].name).toBe(FACTORY_PLATES[2].name);
    });

    it('gracefully handles malformed JSON without throwing', () => {
        const garbage = '{ "version": 1, "name": "Broken" ... invalid syntax';
        const res = parsePlateFileContent(garbage);
        expect(res.success).toBe(false);
        expect(res.error).toContain('Malformed JSON');
    });

    it('gracefully handles empty collections or corrupted plate data', () => {
        const emptyCollection = JSON.stringify({ version: 1, type: 'chladni_plate_collection', plates: [] });
        const res = parsePlateFileContent(emptyCollection);
        expect(res.success).toBe(false);
        expect(res.error).toContain('Collection contains no valid plates');
    });
});

describe('URL Hash Share Round-trip', () => {
    it('encodes and decodes a plate preset into compact URL hash', () => {
        const plate = FACTORY_PLATES[1]; // Glass Harmonica
        const hash = presetToUrlHash(plate);

        expect(hash.startsWith('#plate=')).toBe(true);
        const decoded = urlHashToPreset(hash);
        expect(decoded.success).toBe(true);
        if (decoded.success && decoded.preset) {
            expect(decoded.preset.name).toBe(plate.name);
            expect(decoded.preset.sound.waveform).toBe(plate.sound.waveform);
            expect(decoded.preset.sound.filterCutoff).toBe(plate.sound.filterCutoff);
            expect(decoded.preset.visual.modeMapping).toBe(plate.visual.modeMapping);
        }
    });

    it('handles corrupt or tampered URL hashes safely', () => {
        const badHash = '#plate=not_valid_base64_json!@#$';
        const res = urlHashToPreset(badHash);
        expect(res.success).toBe(false);
        expect(res.error).toBeDefined();

        const emptyHash = '#plate=';
        expect(urlHashToPreset(emptyHash).success).toBe(false);
    });
});

describe('LocalStorage User Plate Persistence', () => {
    beforeEach(() => {
        mockStorage.clear();
    });

    it('persists and retrieves user plates', () => {
        const testUserPlate: PlatePreset = {
            version: 1,
            id: 'user-plate-1',
            name: 'My Custom Plate',
            description: 'Hand tuned acoustic preset',
            category: 'user',
            sound: { ...FACTORY_PLATES[0].sound, filterCutoff: 3300 },
            visual: { ...FACTORY_PLATES[0].visual, lineSharpness: 2.1 },
            gesture: { ...FACTORY_PLATES[0].gesture, smoothing: 0.18 },
        };

        const saveRes = saveUserPlates([testUserPlate]);
        expect(saveRes.success).toBe(true);

        const loadRes = loadUserPlates();
        expect(loadRes.plates.length).toBe(1);
        expect(loadRes.plates[0].name).toBe('My Custom Plate');
        expect(loadRes.plates[0].sound.filterCutoff).toBe(3300);
        expect(loadRes.plates[0].category).toBe('user');
    });

    it('handles localStorage QuotaExceededError gracefully', () => {
        const setItemSpy = vi.spyOn(mockStorage, 'setItem').mockImplementation(() => {
            const error = new Error('Quota exceeded') as any;
            error.name = 'QuotaExceededError';
            error.code = 22;
            throw error;
        });

        const testUserPlate: PlatePreset = {
            version: 1,
            id: 'overflow-plate',
            name: 'Overflow',
            description: 'Testing quota error',
            category: 'user',
            sound: FACTORY_PLATES[0].sound,
            visual: FACTORY_PLATES[0].visual,
            gesture: FACTORY_PLATES[0].gesture,
        };

        const saveRes = saveUserPlates([testUserPlate]);
        expect(saveRes.success).toBe(false);
        expect(saveRes.error).toContain('quota exceeded');

        setItemSpy.mockRestore();
    });
});
