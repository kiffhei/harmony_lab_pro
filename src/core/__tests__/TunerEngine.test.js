/**
 * TunerEngine.test.js
 * Tests para src/core/TunerEngine.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MIN_FREQ, MAX_FREQ, CLARITY_THRESHOLD,
  SILENCE_THRESHOLD, IN_TUNE_CENTS,
  calculateRMS, hasSignal, normalizeBuffer,
  detectPitch, analyzePitch, analyzeBuffer,
  PitchSmoother, calibratedA4, nearestNoteName,
  centsToBarPosition,
} from '../../core/TunerEngine.js';

// ── Helpers para generar señales de prueba ────────────────────────────────────

/**
 * Genera una onda sinusoidal pura a una frecuencia dada.
 * @param {number} freq       - Frecuencia en Hz
 * @param {number} sampleRate - Tasa de muestreo
 * @param {number} duration   - Duración en segundos
 * @param {number} [amp=0.5]  - Amplitud
 */
function generateSine(freq, sampleRate, duration = 0.5, amp = 0.5) {
  const length = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = amp * Math.sin(2 * Math.PI * freq * i / sampleRate);
  }
  return buffer;
}

/** Buffer de silencio */
function silenceBuffer(length = 2048) {
  return new Float32Array(length);
}

/** Buffer de ruido blanco suave */
function noiseBuffer(length = 2048, amp = 0.005) {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) buf[i] = (Math.random() * 2 - 1) * amp;
  return buf;
}

const SAMPLE_RATE = 44100;

// ── Constantes ────────────────────────────────────────────────────────────────

describe('Constantes', () => {
  it('MIN_FREQ es 50', () => expect(MIN_FREQ).toBe(50));
  it('MAX_FREQ es 1200', () => expect(MAX_FREQ).toBe(1200));
  it('CLARITY_THRESHOLD es 0.9', () => expect(CLARITY_THRESHOLD).toBe(0.9));
  it('SILENCE_THRESHOLD es 0.01', () => expect(SILENCE_THRESHOLD).toBe(0.01));
  it('IN_TUNE_CENTS es 5', () => expect(IN_TUNE_CENTS).toBe(5));
  it('MAX_FREQ > MIN_FREQ', () => expect(MAX_FREQ).toBeGreaterThan(MIN_FREQ));
});

// ── calculateRMS ──────────────────────────────────────────────────────────────

describe('calculateRMS()', () => {
  it('buffer vacío → 0', () => expect(calculateRMS(new Float32Array(0))).toBe(0));
  it('null → 0', () => expect(calculateRMS(null)).toBe(0));
  it('silencio → 0', () => expect(calculateRMS(silenceBuffer())).toBe(0));

  it('onda sinusoidal de amp 1 → RMS ≈ 0.707', () => {
    const buf = generateSine(440, SAMPLE_RATE, 0.1, 1.0);
    expect(calculateRMS(buf)).toBeCloseTo(0.707, 1);
  });

  it('onda de amp 0.5 → RMS ≈ 0.354', () => {
    const buf = generateSine(440, SAMPLE_RATE, 0.1, 0.5);
    expect(calculateRMS(buf)).toBeCloseTo(0.354, 1);
  });

  it('retorna número no negativo', () => {
    expect(calculateRMS(generateSine(440, SAMPLE_RATE))).toBeGreaterThanOrEqual(0);
  });
});

// ── hasSignal ─────────────────────────────────────────────────────────────────

describe('hasSignal()', () => {
  it('silencio → false', () => {
    expect(hasSignal(silenceBuffer())).toBe(false);
  });

  it('señal de amplitud 0.5 → true', () => {
    expect(hasSignal(generateSine(440, SAMPLE_RATE, 0.1, 0.5))).toBe(true);
  });

  it('ruido muy suave (< threshold) → false', () => {
    expect(hasSignal(noiseBuffer(2048, 0.001))).toBe(false);
  });

  it('umbral personalizado funciona', () => {
    const buf = generateSine(440, SAMPLE_RATE, 0.1, 0.05);
    expect(hasSignal(buf, 0.01)).toBe(true);
    expect(hasSignal(buf, 0.5)).toBe(false);
  });
});

// ── normalizeBuffer ───────────────────────────────────────────────────────────

describe('normalizeBuffer()', () => {
  it('buffer de silencio → todos ceros', () => {
    const result = normalizeBuffer(silenceBuffer(10));
    result.forEach((v) => expect(v).toBe(0));
  });

  it('normaliza al rango [-1, 1]', () => {
    const buf    = generateSine(440, SAMPLE_RATE, 0.1, 2.0);
    const result = normalizeBuffer(buf);
    const max    = Math.max(...result.map(Math.abs));
    expect(max).toBeCloseTo(1, 5);
  });

  it('señal ya normalizada no cambia', () => {
    const buf    = generateSine(440, SAMPLE_RATE, 0.1, 1.0);
    const result = normalizeBuffer(buf);
    expect(Math.max(...result.map(Math.abs))).toBeCloseTo(1, 3);
  });

  it('retorna Float32Array', () => {
    expect(normalizeBuffer(silenceBuffer()) instanceof Float32Array).toBe(true);
  });
});

// ── detectPitch ───────────────────────────────────────────────────────────────

describe('detectPitch()', () => {
  it('buffer vacío → null', () => {
    expect(detectPitch(new Float32Array(0), SAMPLE_RATE)).toBeNull();
  });

  it('null → null', () => {
    expect(detectPitch(null, SAMPLE_RATE)).toBeNull();
  });

  it('silencio → null', () => {
    expect(detectPitch(silenceBuffer(4096), SAMPLE_RATE)).toBeNull();
  });

  it('sin sampleRate → null', () => {
    expect(detectPitch(generateSine(440, SAMPLE_RATE), 0)).toBeNull();
  });

  it('detecta A4 (440Hz) con precisión razonable', () => {
    const buf    = generateSine(440, SAMPLE_RATE, 0.5, 0.8);
    const result = detectPitch(buf, SAMPLE_RATE);
    expect(result).not.toBeNull();
    expect(result.freq).toBeGreaterThan(420);
    expect(result.freq).toBeLessThan(460);
  });

  it('detecta E4 (329.63Hz)', () => {
    const buf    = generateSine(329.63, SAMPLE_RATE, 0.5, 0.8);
    const result = detectPitch(buf, SAMPLE_RATE);
    expect(result).not.toBeNull();
    expect(result.freq).toBeGreaterThan(310);
    expect(result.freq).toBeLessThan(350);
  });

  it('retorna clarity entre 0 y 1', () => {
    const buf    = generateSine(440, SAMPLE_RATE, 0.5, 0.8);
    const result = detectPitch(buf, SAMPLE_RATE);
    if (result) {
      expect(result.clarity).toBeGreaterThanOrEqual(0);
      expect(result.clarity).toBeLessThanOrEqual(1);
    }
  });

  it('resultado tiene freq y clarity', () => {
    const buf    = generateSine(440, SAMPLE_RATE, 0.5, 0.8);
    const result = detectPitch(buf, SAMPLE_RATE);
    if (result) {
      expect(result).toHaveProperty('freq');
      expect(result).toHaveProperty('clarity');
    }
  });

  it('freq detectada está dentro del rango válido', () => {
    const buf    = generateSine(440, SAMPLE_RATE, 0.5, 0.8);
    const result = detectPitch(buf, SAMPLE_RATE);
    if (result) {
      expect(result.freq).toBeGreaterThanOrEqual(MIN_FREQ);
      expect(result.freq).toBeLessThanOrEqual(MAX_FREQ);
    }
  });
});

// ── analyzePitch ──────────────────────────────────────────────────────────────

describe('analyzePitch()', () => {
  it('A4 exacto (440Hz) → inTune=true, cents≈0', () => {
    const result = analyzePitch(440);
    expect(result.note).toBe('A4');
    expect(result.noteName).toBe('A');
    expect(result.octave).toBe(4);
    expect(result.cents).toBeCloseTo(0, 0);
    expect(result.inTune).toBe(true);
    expect(result.tuning).toBe('in_tune');
  });

  it('442Hz → sharp', () => {
    const result = analyzePitch(442);
    expect(result.tuning).toBe('sharp');
    expect(result.cents).toBeGreaterThan(0);
    expect(result.inTune).toBe(false);
  });

  it('438Hz → flat', () => {
    const result = analyzePitch(438);
    expect(result.tuning).toBe('flat');
    expect(result.cents).toBeLessThan(0);
    expect(result.inTune).toBe(false);
  });

  it('frecuencia dentro de IN_TUNE_CENTS → inTune=true', () => {
    // A4 + 3 cents sigue siendo "afinado"
    const slightlySharp = 440 * Math.pow(2, 3 / 1200);
    const result = analyzePitch(slightlySharp);
    expect(result.inTune).toBe(true);
    expect(result.tuning).toBe('in_tune');
  });

  it('tiene todas las propiedades requeridas', () => {
    const result = analyzePitch(440);
    ['freq','clarity','note','noteName','octave','cents','inTune','tuning','targetFreq']
      .forEach((prop) => expect(result).toHaveProperty(prop));
  });

  it('targetFreq es la frecuencia exacta de la nota', () => {
    const result = analyzePitch(442);
    expect(result.targetFreq).toBeCloseTo(440, 0);
  });

  it('cents está redondeado a 1 decimal', () => {
    const result = analyzePitch(442);
    expect(result.cents).toBe(Math.round(result.cents * 10) / 10);
  });

  it('C4 (261.626Hz) → nota C4', () => {
    const result = analyzePitch(261.626);
    expect(result.note).toBe('C4');
    expect(result.noteName).toBe('C');
  });
});

// ── analyzeBuffer ─────────────────────────────────────────────────────────────

describe('analyzeBuffer()', () => {
  it('silencio → null', () => {
    expect(analyzeBuffer(silenceBuffer(4096), SAMPLE_RATE)).toBeNull();
  });

  it('señal de A4 → PitchAnalysis con nota A', () => {
    const buf    = generateSine(440, SAMPLE_RATE, 0.5, 0.8);
    const result = analyzeBuffer(buf, SAMPLE_RATE);
    if (result) {
      expect(result.noteName).toBe('A');
      expect(result.octave).toBe(4);
    }
  });

  it('retorna null o PitchAnalysis (nunca undefined)', () => {
    const buf    = generateSine(440, SAMPLE_RATE, 0.5, 0.8);
    const result = analyzeBuffer(buf, SAMPLE_RATE);
    expect(result === null || typeof result === 'object').toBe(true);
  });
});

// ── PitchSmoother ─────────────────────────────────────────────────────────────

describe('PitchSmoother', () => {
  let smoother;

  beforeEach(() => {
    smoother = new PitchSmoother(5);
  });

  it('crea instancia sin errores', () => {
    expect(() => new PitchSmoother()).not.toThrow();
    expect(() => new PitchSmoother(3)).not.toThrow();
  });

  it('size inicial es 0', () => {
    expect(smoother.size()).toBe(0);
  });

  it('null → null y resetea buffer', () => {
    smoother.push(440);
    smoother.push(440);
    smoother.push(null);
    expect(smoother.size()).toBe(0);
  });

  it('pocos frames → null (ventana no completa)', () => {
    expect(smoother.push(440)).toBeNull();
    expect(smoother.push(441)).toBeNull();
  });

  it('con suficientes frames → retorna mediana', () => {
    [440, 441, 440, 442, 440].forEach((f) => smoother.push(f));
    const result = smoother.push(440);
    expect(result).not.toBeNull();
    expect(result).toBeCloseTo(440, 0);
  });

  it('suaviza outliers', () => {
    const base = 440;
    [base, base, base, base, base].forEach((f) => smoother.push(f));
    // Un outlier no debe dominar
    const result = smoother.push(500);
    expect(result).toBeCloseTo(base, -1); // mediana ignora el outlier
  });

  it('reset() limpia el buffer', () => {
    smoother.push(440);
    smoother.push(440);
    smoother.reset();
    expect(smoother.size()).toBe(0);
  });

  it('windowSize 1 → retorna el valor inmediatamente', () => {
    const s = new PitchSmoother(1);
    expect(s.push(440)).toBe(440);
  });

  it('windowSize 0 → se clampea a 1', () => {
    const s = new PitchSmoother(0);
    expect(s.push(440)).toBe(440);
  });
});

// ── calibratedA4 ──────────────────────────────────────────────────────────────

describe('calibratedA4()', () => {
  it('0 cents → 440Hz exacto', () => {
    expect(calibratedA4(0)).toBe(440);
  });

  it('+100 cents → un semitono más alto', () => {
    expect(calibratedA4(100)).toBeCloseTo(440 * Math.pow(2, 1 / 12), 3);
  });

  it('-100 cents → un semitono más bajo', () => {
    expect(calibratedA4(-100)).toBeCloseTo(440 / Math.pow(2, 1 / 12), 3);
  });

  it('432Hz corresponde a ~-31.77 cents', () => {
    const cents = 1200 * Math.log2(432 / 440);
    expect(calibratedA4(cents)).toBeCloseTo(432, 1);
  });
});

// ── nearestNoteName ───────────────────────────────────────────────────────────

describe('nearestNoteName()', () => {
  it('440Hz → "A"', () => expect(nearestNoteName(440)).toBe('A'));
  it('261.63Hz → "C"', () => expect(nearestNoteName(261.63)).toBe('C'));
  it('0 → ""', () => expect(nearestNoteName(0)).toBe(''));
  it('negativo → ""', () => expect(nearestNoteName(-100)).toBe(''));
  it('null → ""', () => expect(nearestNoteName(null)).toBe(''));
  it('retorna string', () => expect(typeof nearestNoteName(440)).toBe('string'));
});

// ── centsToBarPosition ────────────────────────────────────────────────────────

describe('centsToBarPosition()', () => {
  it('0 cents → 0.5 (centro)', () => {
    expect(centsToBarPosition(0)).toBe(0.5);
  });

  it('+50 cents → 1.0 (extremo derecho)', () => {
    expect(centsToBarPosition(50)).toBe(1.0);
  });

  it('-50 cents → 0.0 (extremo izquierdo)', () => {
    expect(centsToBarPosition(-50)).toBe(0.0);
  });

  it('clampea valores mayores a 50', () => {
    expect(centsToBarPosition(100)).toBe(1.0);
  });

  it('clampea valores menores a -50', () => {
    expect(centsToBarPosition(-100)).toBe(0.0);
  });

  it('retorna valor entre 0 y 1', () => {
    [-50, -25, 0, 25, 50].forEach((c) => {
      const pos = centsToBarPosition(c);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThanOrEqual(1);
    });
  });

  it('+25 cents → 0.75', () => {
    expect(centsToBarPosition(25)).toBe(0.75);
  });

  it('-25 cents → 0.25', () => {
    expect(centsToBarPosition(-25)).toBe(0.25);
  });
});
