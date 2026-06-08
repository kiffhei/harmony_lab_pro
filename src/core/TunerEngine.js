/**
 * TunerEngine.js — Harmony Lab Pro
 * Detección de pitch por autocorrelación.
 * Puro JavaScript, sin Web Audio API — testeable en jsdom.
 *
 * Algoritmo: Autocorrelación con umbral de claridad (YIN simplificado).
 * Rango de detección: 50Hz – 1200Hz (cubre bajo, guitarra, voz, violín).
 *
 * Referencias:
 * - Chris Wilson: https://github.com/cwilso/PitchDetect
 * - YIN algorithm: de Cheveigné & Kawahara (2002)
 */

import { freqToNote, freqCents, noteFreq, NOTES } from './MusicTheory.js';

// ── Constantes de detección ───────────────────────────────────────────────────

/** Frecuencia mínima detectable en Hz */
export const MIN_FREQ = 50;

/** Frecuencia máxima detectable en Hz */
export const MAX_FREQ = 1200;

/** Umbral de claridad mínima para considerar una detección válida (0-1) */
export const CLARITY_THRESHOLD = 0.9;

/** Umbral de RMS mínimo para activar la detección (silencio) */
export const SILENCE_THRESHOLD = 0.01;

/** Rango de cents para considerar una nota "afinada" */
export const IN_TUNE_CENTS = 5;

// ── Utilidades de señal ───────────────────────────────────────────────────────

/**
 * Calcula el RMS (Root Mean Square) de un buffer de audio.
 * Mide el volumen efectivo de la señal.
 *
 * @param {Float32Array} buffer
 * @returns {number} RMS entre 0 y 1
 */
export function calculateRMS(buffer) {
  if (!buffer || buffer.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

/**
 * Verifica si un buffer contiene señal (no es silencio).
 *
 * @param {Float32Array} buffer
 * @param {number} [threshold=SILENCE_THRESHOLD]
 * @returns {boolean}
 */
export function hasSignal(buffer, threshold = SILENCE_THRESHOLD) {
  return calculateRMS(buffer) > threshold;
}

/**
 * Normaliza un buffer de audio al rango [-1, 1].
 *
 * @param {Float32Array} buffer
 * @returns {Float32Array}
 */
export function normalizeBuffer(buffer) {
  const max = Math.max(...buffer.map(Math.abs));
  if (max === 0) return new Float32Array(buffer.length);
  const result = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    result[i] = buffer[i] / max;
  }
  return result;
}

// ── Algoritmo de autocorrelación ──────────────────────────────────────────────

/**
 * Detecta el pitch fundamental de un buffer de audio usando autocorrelación.
 *
 * El algoritmo:
 * 1. Calcula la autocorrelación para cada lag posible en el rango de frecuencias
 * 2. Encuentra el primer máximo local que supera el umbral de claridad
 * 3. Refina la estimación con interpolación parabólica
 *
 * @param {Float32Array} buffer   - Buffer de audio (samples)
 * @param {number} sampleRate     - Tasa de muestreo del AudioContext
 * @returns {{ freq: number, clarity: number }|null}
 *   freq: frecuencia detectada en Hz
 *   clarity: confianza de la detección (0-1)
 *   null si no se detectó pitch o la señal es silencio
 *
 * @example
 * const result = detectPitch(audioBuffer, 44100);
 * if (result) console.log(result.freq, result.clarity);
 */
export function detectPitch(buffer, sampleRate) {
  if (!buffer || buffer.length === 0 || !sampleRate) return null;
  if (!hasSignal(buffer)) return null;

  // Rango de lags a explorar basado en MIN/MAX_FREQ
  const minLag = Math.floor(sampleRate / MAX_FREQ);
  const maxLag = Math.ceil(sampleRate / MIN_FREQ);

  const bufLen = buffer.length;

  // Calcular autocorrelación para cada lag
  // ACF(lag) = Σ buffer[i] * buffer[i + lag]
  let bestLag     = -1;
  let bestValue   = -Infinity;

  // Normalización: ACF(0) para calcular claridad relativa
  let acf0 = 0;
  for (let i = 0; i < bufLen; i++) {
    acf0 += buffer[i] * buffer[i];
  }
  if (acf0 === 0) return null;

  const acf = new Float32Array(maxLag + 1);

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const limit = Math.min(bufLen - lag, bufLen);
    for (let i = 0; i < limit; i++) {
      sum += buffer[i] * buffer[i + lag];
    }
    acf[lag] = sum;
    if (sum > bestValue) {
      bestValue = sum;
      bestLag   = lag;
    }
  }

  if (bestLag === -1) return null;

  // Claridad: correlación relativa al peak (0-1)
  const clarity = bestValue / acf0;

  if (clarity < CLARITY_THRESHOLD) return null;

  // Refinamiento con interpolación parabólica para mayor precisión
  // Usa los valores en lag-1, lag, lag+1 para encontrar el máximo exacto
  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const prev = acf[bestLag - 1];
    const curr = acf[bestLag];
    const next = acf[bestLag + 1];
    const denom = 2 * (2 * curr - prev - next);
    if (denom !== 0) {
      refinedLag = bestLag + (prev - next) / denom;
    }
  }

  const freq = sampleRate / refinedLag;

  // Validar rango final
  if (freq < MIN_FREQ || freq > MAX_FREQ) return null;

  return {
    freq:    Math.round(freq * 100) / 100,
    clarity: Math.min(1, Math.max(0, clarity)),
  };
}

// ── Análisis de nota ──────────────────────────────────────────────────────────

/**
 * Resultado completo del análisis de pitch.
 *
 * @typedef {Object} PitchAnalysis
 * @property {number}  freq       - Frecuencia detectada en Hz
 * @property {number}  clarity    - Confianza de detección (0-1)
 * @property {string}  note       - Nota más cercana, ej: 'A4'
 * @property {string}  noteName   - Solo el nombre, ej: 'A'
 * @property {number}  octave     - Octava de la nota
 * @property {number}  cents      - Desviación en cents (-50 a +50)
 * @property {boolean} inTune     - true si |cents| <= IN_TUNE_CENTS
 * @property {'flat'|'sharp'|'in_tune'} tuning - Estado de afinación
 * @property {number}  targetFreq - Frecuencia exacta de la nota objetivo
 */

/**
 * Analiza una frecuencia y retorna toda la información de afinación.
 *
 * @param {number} freq       - Frecuencia en Hz
 * @param {number} [clarity=1]
 * @returns {PitchAnalysis}
 *
 * @example
 * analyzePitch(442)
 * // → { freq: 442, note: 'A4', cents: +7.85, inTune: false, tuning: 'sharp', ... }
 */
export function analyzePitch(freq, clarity = 1) {
  const note      = freqToNote(freq);           // ej: 'A4'
  const noteName  = note.slice(0, -1);          // ej: 'A'
  const octave    = parseInt(note.slice(-1), 10); // ej: 4
  const cents     = freqCents(freq, note);
  const inTune    = Math.abs(cents) <= IN_TUNE_CENTS;

  let tuning;
  if (inTune)       tuning = 'in_tune';
  else if (cents > 0) tuning = 'sharp';
  else                tuning = 'flat';

  const targetFreq = noteFreq(noteName, octave);

  return {
    freq,
    clarity,
    note,
    noteName,
    octave,
    cents:      Math.round(cents * 10) / 10,
    inTune,
    tuning,
    targetFreq: Math.round(targetFreq * 1000) / 1000,
  };
}

/**
 * Pipeline completo: buffer → PitchAnalysis|null
 * Combina detectPitch + analyzePitch en una sola llamada.
 *
 * @param {Float32Array} buffer
 * @param {number} sampleRate
 * @returns {PitchAnalysis|null}
 */
export function analyzeBuffer(buffer, sampleRate) {
  const result = detectPitch(buffer, sampleRate);
  if (!result) return null;
  return analyzePitch(result.freq, result.clarity);
}

// ── Suavizado de detecciones ──────────────────────────────────────────────────

/**
 * PitchSmoother — Suaviza las detecciones de pitch para evitar
 * parpadeo en la UI cuando la frecuencia oscila ligeramente.
 *
 * Usa una ventana deslizante de las últimas N detecciones
 * y retorna la mediana como valor estable.
 */
export class PitchSmoother {
  /**
   * @param {number} [windowSize=5] - Número de frames a promediar
   */
  constructor(windowSize = 5) {
    this._window = [];
    this._size   = Math.max(1, windowSize);
  }

  /**
   * Agrega una nueva detección y retorna el pitch suavizado.
   * @param {number|null} freq - Frecuencia detectada, o null si no hay señal
   * @returns {number|null} Frecuencia suavizada, o null
   */
  push(freq) {
    if (freq === null || freq === undefined) {
      this._window = [];
      return null;
    }

    this._window.push(freq);
    if (this._window.length > this._size) {
      this._window.shift();
    }

    if (this._window.length < Math.ceil(this._size / 2)) {
      return null; // No hay suficientes frames aún
    }

    // Mediana para mayor robustez que el promedio
    const sorted = [...this._window].sort((a, b) => a - b);
    const mid    = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Resetea el buffer de suavizado.
   */
  reset() {
    this._window = [];
  }

  /**
   * Retorna el tamaño actual del buffer.
   * @returns {number}
   */
  size() {
    return this._window.length;
  }
}

// ── Utilidades de calibración ─────────────────────────────────────────────────

/**
 * Calcula la frecuencia de A4 para una calibración personalizada.
 * El estándar es 440Hz, pero algunos músicos usan 432Hz u otras.
 *
 * @param {number} cents - Desviación en cents respecto a 440Hz
 * @returns {number} Frecuencia de A4 calibrada
 */
export function calibratedA4(cents) {
  return 440 * Math.pow(2, cents / 1200);
}

/**
 * Retorna el nombre de la nota más cercana a una frecuencia,
 * sin información de octava. Útil para el display simplificado.
 *
 * @param {number} freq
 * @returns {string} nombre de nota, ej: 'A', 'C#'
 */
export function nearestNoteName(freq) {
  if (!freq || freq <= 0) return '';
  try {
    const full = freqToNote(freq); // 'A4'
    return full.replace(/\d+$/, '');
  } catch {
    return '';
  }
}

/**
 * Convierte cents a un valor normalizado para una barra visual.
 * Mapea [-50, +50] cents a [0, 1], con 0.5 = afinado.
 *
 * @param {number} cents
 * @returns {number} valor 0-1
 */
export function centsToBarPosition(cents) {
  const clamped = Math.min(50, Math.max(-50, cents));
  return (clamped + 50) / 100;
}
