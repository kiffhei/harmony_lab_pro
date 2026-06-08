/**
 * HarmonyGraph.test.js
 * Tests para src/core/HarmonyGraph.js
 */

import { describe, it, expect } from 'vitest';
import {
  HARMONIC_FUNCTION, RELATION_TYPES, CIRCLE_OF_FIFTHS,
  COMMON_PROGRESSIONS,
  getHarmonicFunction,
  buildHarmonyNodes,
  buildHarmonyRelations,
  getSuggestions,
  getPredecessors,
  getRelation,
  circleOfFifthsDistance,
  getNeighborKeys,
  getRelativeKey,
  getParallelKey,
  degreesToChords,
  getCommonProgressions,
} from '../../core/HarmonyGraph.js';

// ── HARMONIC_FUNCTION ─────────────────────────────────────────────────────────

describe('HARMONIC_FUNCTION', () => {
  it('I (0) es Tónica', () => expect(HARMONIC_FUNCTION[0]).toBe('T'));
  it('ii (1) es Subdominante', () => expect(HARMONIC_FUNCTION[1]).toBe('S'));
  it('iii (2) es Tónica', () => expect(HARMONIC_FUNCTION[2]).toBe('T'));
  it('IV (3) es Subdominante', () => expect(HARMONIC_FUNCTION[3]).toBe('S'));
  it('V (4) es Dominante', () => expect(HARMONIC_FUNCTION[4]).toBe('D'));
  it('vi (5) es Tónica', () => expect(HARMONIC_FUNCTION[5]).toBe('T'));
  it('vii° (6) es Dominante', () => expect(HARMONIC_FUNCTION[6]).toBe('D'));
});

// ── getHarmonicFunction ───────────────────────────────────────────────────────

describe('getHarmonicFunction()', () => {
  it('grado 0 → T', () => expect(getHarmonicFunction(0)).toBe('T'));
  it('grado 4 → D', () => expect(getHarmonicFunction(4)).toBe('D'));
  it('grado 3 → S', () => expect(getHarmonicFunction(3)).toBe('S'));
  it('grado inválido → unknown', () => expect(getHarmonicFunction(99)).toBe('unknown'));
  it('grado negativo → unknown', () => expect(getHarmonicFunction(-1)).toBe('unknown'));
});

// ── buildHarmonyNodes ─────────────────────────────────────────────────────────

describe('buildHarmonyNodes()', () => {
  it('C Major retorna 7 nodos', () => {
    expect(buildHarmonyNodes('C', 'Major')).toHaveLength(7);
  });

  it('cada nodo tiene las propiedades requeridas', () => {
    const nodes = buildHarmonyNodes('C', 'Major');
    nodes.forEach((node) => {
      expect(node).toHaveProperty('root');
      expect(node).toHaveProperty('quality');
      expect(node).toHaveProperty('roman');
      expect(node).toHaveProperty('notes');
      expect(node).toHaveProperty('degree');
      expect(node).toHaveProperty('function');
    });
  });

  it('primer nodo de C Major: root=C, quality=maj, degree=0, function=T', () => {
    const nodes = buildHarmonyNodes('C', 'Major');
    expect(nodes[0].root).toBe('C');
    expect(nodes[0].quality).toBe('maj');
    expect(nodes[0].degree).toBe(0);
    expect(nodes[0].function).toBe('T');
  });

  it('quinto nodo (V) de C Major: root=G, function=D', () => {
    const nodes = buildHarmonyNodes('C', 'Major');
    expect(nodes[4].root).toBe('G');
    expect(nodes[4].function).toBe('D');
  });

  it('sexto nodo (vi) de C Major: root=A, quality=min, function=T', () => {
    const nodes = buildHarmonyNodes('C', 'Major');
    expect(nodes[5].root).toBe('A');
    expect(nodes[5].quality).toBe('min');
    expect(nodes[5].function).toBe('T');
  });

  it('degree coincide con el índice del array', () => {
    const nodes = buildHarmonyNodes('G', 'Major');
    nodes.forEach((node, i) => expect(node.degree).toBe(i));
  });

  it('Pentatonic retorna 5 nodos', () => {
    expect(buildHarmonyNodes('C', 'Pentatonic Maj')).toHaveLength(5);
  });

  it('A Minor retorna 7 nodos', () => {
    expect(buildHarmonyNodes('A', 'Minor')).toHaveLength(7);
  });

  it('funciona con todas las notas raíz', () => {
    const roots = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    roots.forEach((root) => {
      expect(() => buildHarmonyNodes(root, 'Major')).not.toThrow();
    });
  });
});

// ── buildHarmonyRelations ─────────────────────────────────────────────────────

describe('buildHarmonyRelations()', () => {
  it('C Major retorna relaciones', () => {
    const rels = buildHarmonyRelations('C', 'Major');
    expect(rels.length).toBeGreaterThan(0);
  });

  it('cada relación tiene fromDegree, toDegree, type, weight', () => {
    const rels = buildHarmonyRelations('C', 'Major');
    rels.forEach((r) => {
      expect(r).toHaveProperty('fromDegree');
      expect(r).toHaveProperty('toDegree');
      expect(r).toHaveProperty('type');
      expect(r).toHaveProperty('weight');
    });
  });

  it('weight está en rango 0-1', () => {
    const rels = buildHarmonyRelations('C', 'Major');
    rels.forEach((r) => {
      expect(r.weight).toBeGreaterThan(0);
      expect(r.weight).toBeLessThanOrEqual(1);
    });
  });

  it('V → I es relación de resolución', () => {
    const rels = buildHarmonyRelations('C', 'Major');
    const vToI = rels.find((r) => r.fromDegree === 4 && r.toDegree === 0);
    expect(vToI).toBeDefined();
    expect(vToI.type).toBe(RELATION_TYPES.RESOLUTION);
  });

  it('V → I tiene el peso más alto', () => {
    const rels = buildHarmonyRelations('C', 'Major');
    const vToI = rels.find((r) => r.fromDegree === 4 && r.toDegree === 0);
    expect(vToI.weight).toBe(1.0);
  });

  it('V → vi es cadencia rota (deceptive)', () => {
    const rels = buildHarmonyRelations('C', 'Major');
    const vToVi = rels.find((r) => r.fromDegree === 4 && r.toDegree === 5);
    expect(vToVi).toBeDefined();
    expect(vToVi.type).toBe(RELATION_TYPES.DECEPTIVE);
  });

  it('Pentatonic → retorna array vacío (no aplica grafo diatónico)', () => {
    expect(buildHarmonyRelations('C', 'Pentatonic Maj')).toEqual([]);
  });

  it('Blues → retorna array vacío', () => {
    expect(buildHarmonyRelations('C', 'Blues')).toEqual([]);
  });
});

// ── getSuggestions ────────────────────────────────────────────────────────────

describe('getSuggestions()', () => {
  it('desde V (4) hay sugerencias', () => {
    expect(getSuggestions(4, 'C', 'Major').length).toBeGreaterThan(0);
  });

  it('primera sugerencia desde V es I (resolución)', () => {
    const suggestions = getSuggestions(4, 'C', 'Major');
    expect(suggestions[0].node.degree).toBe(0);
    expect(suggestions[0].relation.type).toBe(RELATION_TYPES.RESOLUTION);
  });

  it('sugerencias ordenadas por peso descendente', () => {
    const suggestions = getSuggestions(0, 'C', 'Major');
    for (let i = 0; i < suggestions.length - 1; i++) {
      expect(suggestions[i].relation.weight).toBeGreaterThanOrEqual(
        suggestions[i + 1].relation.weight
      );
    }
  });

  it('cada sugerencia tiene node y relation', () => {
    getSuggestions(0, 'C', 'Major').forEach((s) => {
      expect(s).toHaveProperty('node');
      expect(s).toHaveProperty('relation');
    });
  });

  it('Pentatonic → retorna array vacío', () => {
    expect(getSuggestions(0, 'C', 'Pentatonic Maj')).toEqual([]);
  });

  it('funciona con diferentes tonalidades', () => {
    expect(() => getSuggestions(4, 'G', 'Major')).not.toThrow();
    expect(() => getSuggestions(4, 'A', 'Minor')).not.toThrow();
  });
});

// ── getPredecessors ───────────────────────────────────────────────────────────

describe('getPredecessors()', () => {
  it('I (0) tiene predecesores', () => {
    expect(getPredecessors(0, 'C', 'Major').length).toBeGreaterThan(0);
  });

  it('V → I aparece como predecesor de I', () => {
    const preds = getPredecessors(0, 'C', 'Major');
    const vToI  = preds.find((p) => p.node.degree === 4);
    expect(vToI).toBeDefined();
  });

  it('predecesores ordenados por peso descendente', () => {
    const preds = getPredecessors(0, 'C', 'Major');
    for (let i = 0; i < preds.length - 1; i++) {
      expect(preds[i].relation.weight).toBeGreaterThanOrEqual(
        preds[i + 1].relation.weight
      );
    }
  });

  it('Pentatonic → retorna array vacío', () => {
    expect(getPredecessors(0, 'C', 'Pentatonic Maj')).toEqual([]);
  });
});

// ── getRelation ───────────────────────────────────────────────────────────────

describe('getRelation()', () => {
  it('V → I retorna relación de resolución', () => {
    const rel = getRelation(4, 0);
    expect(rel).not.toBeNull();
    expect(rel.type).toBe(RELATION_TYPES.RESOLUTION);
    expect(rel.weight).toBe(1.0);
  });

  it('ii → V retorna relación de preparación', () => {
    const rel = getRelation(1, 4);
    expect(rel).not.toBeNull();
    expect(rel.type).toBe(RELATION_TYPES.PREPARATION);
  });

  it('relación inexistente retorna null', () => {
    expect(getRelation(0, 6)).toBeNull(); // I → vii° no definida directamente
  });

  it('grado desde inválido retorna null', () => {
    expect(getRelation(99, 0)).toBeNull();
  });

  it('fromDegree y toDegree están en el resultado', () => {
    const rel = getRelation(4, 0);
    expect(rel.fromDegree).toBe(4);
    expect(rel.toDegree).toBe(0);
  });
});

// ── CIRCLE_OF_FIFTHS ──────────────────────────────────────────────────────────

describe('CIRCLE_OF_FIFTHS', () => {
  it('tiene 12 notas', () => expect(CIRCLE_OF_FIFTHS).toHaveLength(12));
  it('empieza en C', () => expect(CIRCLE_OF_FIFTHS[0]).toBe('C'));
  it('segunda nota es G (quinta de C)', () => expect(CIRCLE_OF_FIFTHS[1]).toBe('G'));
});

// ── circleOfFifthsDistance ────────────────────────────────────────────────────

describe('circleOfFifthsDistance()', () => {
  it('misma nota → 0', () => expect(circleOfFifthsDistance('C', 'C')).toBe(0));
  it('C → G = 1 (quinta)', () => expect(circleOfFifthsDistance('C', 'G')).toBe(1));
  it('C → F = 1 (cuarta)', () => expect(circleOfFifthsDistance('C', 'F')).toBe(1));
  it('C → F# = 6 (tritono — máximo)', () => expect(circleOfFifthsDistance('C', 'F#')).toBe(6));
  it('es simétrica', () => {
    expect(circleOfFifthsDistance('C', 'D')).toBe(circleOfFifthsDistance('D', 'C'));
  });
  it('nota inválida → -1', () => expect(circleOfFifthsDistance('C', 'X')).toBe(-1));
});

// ── getNeighborKeys ───────────────────────────────────────────────────────────

describe('getNeighborKeys()', () => {
  it('vecinos de C son G (dominante) y F (subdominante)', () => {
    const { dominant, subdominant } = getNeighborKeys('C');
    expect(dominant).toBe('G');
    expect(subdominant).toBe('F');
  });

  it('vecinos de G son D (dominante) y C (subdominante)', () => {
    const { dominant, subdominant } = getNeighborKeys('G');
    expect(dominant).toBe('D');
    expect(subdominant).toBe('C');
  });

  it('nota inválida retorna nulls', () => {
    const { dominant, subdominant } = getNeighborKeys('X');
    expect(dominant).toBeNull();
    expect(subdominant).toBeNull();
  });
});

// ── getRelativeKey ────────────────────────────────────────────────────────────

describe('getRelativeKey()', () => {
  it('relativa de C Major es A', () => expect(getRelativeKey('C', 'Major')).toBe('A'));
  it('relativa de A Minor es C', () => expect(getRelativeKey('A', 'Minor')).toBe('C'));
  it('relativa de G Major es E', () => expect(getRelativeKey('G', 'Major')).toBe('E'));
  it('escala no reconocida retorna null', () => {
    expect(getRelativeKey('C', 'Blues')).toBeNull();
  });
  it('nota inválida retorna null', () => {
    expect(getRelativeKey('X', 'Major')).toBeNull();
  });
});

// ── getParallelKey ────────────────────────────────────────────────────────────

describe('getParallelKey()', () => {
  it('paralela de C Major es C Minor', () => {
    expect(getParallelKey('C', 'Major')).toEqual({ root: 'C', scaleName: 'Minor' });
  });

  it('paralela de A Minor es A Major', () => {
    expect(getParallelKey('A', 'Minor')).toEqual({ root: 'A', scaleName: 'Major' });
  });

  it('escala no reconocida retorna null', () => {
    expect(getParallelKey('C', 'Dorian')).toBeNull();
  });
});

// ── degreesToChords ───────────────────────────────────────────────────────────

describe('degreesToChords()', () => {
  it('I-V-vi-IV en C Major retorna 4 acordes', () => {
    const chords = degreesToChords([0, 4, 5, 3], 'C', 'Major');
    expect(chords).toHaveLength(4);
  });

  it('primer acorde de I-V-vi-IV en C es C maj', () => {
    const chords = degreesToChords([0, 4, 5, 3], 'C', 'Major');
    expect(chords[0].root).toBe('C');
    expect(chords[0].quality).toBe('maj');
  });

  it('filtra grados fuera de rango', () => {
    const chords = degreesToChords([0, 99, 4], 'C', 'Major');
    expect(chords).toHaveLength(2);
  });

  it('Pentatonic → retorna array vacío', () => {
    expect(degreesToChords([0, 1, 2], 'C', 'Pentatonic Maj')).toEqual([]);
  });

  it('array vacío → array vacío', () => {
    expect(degreesToChords([], 'C', 'Major')).toEqual([]);
  });
});

// ── getCommonProgressions ─────────────────────────────────────────────────────

describe('getCommonProgressions()', () => {
  it('retorna array de progresiones para C Major', () => {
    const progs = getCommonProgressions('C', 'Major');
    expect(progs.length).toBeGreaterThan(0);
  });

  it('cada progresión tiene name y chords', () => {
    getCommonProgressions('C', 'Major').forEach((p) => {
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('chords');
      expect(Array.isArray(p.chords)).toBe(true);
    });
  });

  it('I-V-vi-IV está en las progresiones comunes', () => {
    const progs = getCommonProgressions('C', 'Major');
    const found = progs.find((p) => p.name === 'I-V-vi-IV');
    expect(found).toBeDefined();
    expect(found.chords).toHaveLength(4);
  });

  it('ii-V-I tiene 3 acordes', () => {
    const progs = getCommonProgressions('C', 'Major');
    const iiVI = progs.find((p) => p.name === 'ii-V-I');
    expect(iiVI.chords).toHaveLength(3);
  });

  it('Pentatonic → retorna array vacío', () => {
    expect(getCommonProgressions('C', 'Pentatonic Maj')).toEqual([]);
  });

  it('funciona con todas las tonalidades comunes', () => {
    ['C','G','D','A','E','F','A#','D#'].forEach((root) => {
      expect(() => getCommonProgressions(root, 'Major')).not.toThrow();
    });
  });

  it('COMMON_PROGRESSIONS tiene al menos 8 progresiones', () => {
    expect(Object.keys(COMMON_PROGRESSIONS).length).toBeGreaterThanOrEqual(8);
  });
});
