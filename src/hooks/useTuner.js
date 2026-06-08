/**
 * useTuner.js — Harmony Lab Pro
 * Hook que conecta TunerEngine con React y el micrófono del dispositivo.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  analyzeBuffer, analyzePitch, PitchSmoother, centsToBarPosition,
} from '../core/TunerEngine.js';

const FFT_SIZE = 4096;

const INITIAL_STATE = {
  status:      'idle',
  note:        null,
  noteName:    null,
  octave:      4,
  cents:       0,
  freq:        0,
  targetFreq:  440,
  inTune:      false,
  tuning:      'in_tune',
  barPosition: 0.5,
  error:       null,
};

export function useTuner({ windowSize = 5 } = {}) {
  const [state, setState] = useState(INITIAL_STATE);

  const streamRef   = useRef(null);
  const contextRef  = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef   = useRef(null);
  const rafRef      = useRef(null);
  const smootherRef = useRef(new PitchSmoother(windowSize));
  const bufferRef   = useRef(null);
  const activeRef   = useRef(false);

  const detect = useCallback(() => {
    if (!activeRef.current || !analyserRef.current) return;

    const analyser = analyserRef.current;
    const buffer   = bufferRef.current;

    analyser.getFloatTimeDomainData(buffer);

    const analysis = analyzeBuffer(buffer, contextRef.current.sampleRate);
    const smoother = smootherRef.current;

    if (analysis) {
      const smoothedFreq = smoother.push(analysis.freq);
      if (smoothedFreq !== null) {
        try {
          const smoothed = analyzePitch(smoothedFreq, analysis.clarity);
          setState({
            status:      'active',
            note:        smoothed.note,
            noteName:    smoothed.noteName,
            octave:      smoothed.octave,
            cents:       smoothed.cents,
            freq:        smoothed.freq,
            targetFreq:  smoothed.targetFreq,
            inTune:      smoothed.inTune,
            tuning:      smoothed.tuning,
            barPosition: centsToBarPosition(smoothed.cents),
            error:       null,
          });
        } catch (_) { /* frecuencia fuera de rango */ }
      }
    } else {
      smoother.push(null);
    }

    rafRef.current = requestAnimationFrame(detect);
  }, []);

  const start = useCallback(async () => {
    if (activeRef.current) return;

    setState((prev) => ({ ...prev, status: 'requesting', error: null }));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation:  false,
          noiseSuppression:  false,
          autoGainControl:   false,
        },
      });

      streamRef.current = stream;

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      contextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      bufferRef.current = new Float32Array(analyser.fftSize);

      smootherRef.current.reset();
      activeRef.current = true;

      setState((prev) => ({ ...prev, status: 'active' }));
      rafRef.current = requestAnimationFrame(detect);

    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Acceso al micrófono denegado'
        : err.name === 'NotFoundError'
          ? 'No se encontró micrófono'
          : `Error: ${err.message}`;

      setState({ ...INITIAL_STATE, status: 'error', error: msg });
    }
  }, [detect]);

  const stop = useCallback(() => {
    activeRef.current = false;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (contextRef.current?.state !== 'closed') {
      contextRef.current?.close();
      contextRef.current = null;
    }

    analyserRef.current = null;
    bufferRef.current   = null;

    smootherRef.current.reset();
    setState(INITIAL_STATE);
  }, []);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (contextRef.current?.state !== 'closed') {
        contextRef.current?.close();
      }
    };
  }, []);

  return { state, start, stop, isActive: state.status === 'active' };
}
