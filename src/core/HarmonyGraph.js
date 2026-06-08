/**
 * HarmonyGraph.js — Harmony Lab Pro
 * Lógica pura del grafo de relaciones armónicas.
 * Sin UI, sin side effects, sin imports externos.
 *
 * Conceptos implementados:
 * - Funciones armónicas: tónica (T), subdominante (S), dominante (D)
 * - Relaciones entre acordes diatónicos (movimientos naturales)
 * - Peso de las relaciones (fuerte, normal, débil)
 * - Sugerencias de movimiento dado un acorde activo
 * - Círculo de quintas para calcular distancia entre tonalidades
 */

import { getDiatonic, getScale, NOTES } from './MusicTheory.js';

// ── Funciones armónicas ───────────────────────────────────────────────────────

/**
 * Clasificación funcional de cada grado diatónico.
 * Aplica a escalas de 7 notas (Mayor, Menor, modos).
 *
 * T = Tónica (reposo, estabilidad)
 * S = Subdominante (tensión suave, movimiento)
 * D = Dominante (tensión fuerte, resolución hacia T)
 */
export const HARMONIC_FUNCTION = {
  0: 'T',  // I   — Tónica
  1: 'S',  // ii  — Subdominante
  2: 'T',  // iii — Tónica (relativa)
  3: 'S',  // IV  — Subdominante
  4: 'D',  // V   — Dominante
  5: 'T',  // vi  — Tónica (relativa menor)
  6: 'D',  // vii°— Dominante (sensible)
};

/**
 * Retorna la función armónica de un grado diatónico.
 * @param {number} degree - Grado (0-6)
 * @returns {'T'|'S'|'D'|'unknown'}
 */
export function getHarmonicFunction(degree) {
  return HARMONIC_FUNCTION[degree] ?? 'unknown';
}

// ── Tipos de relaciones entre acordes ─────────────────────────────────────────

/**
 * Tipos de relación armónica entre dos acordes.
 * @enum {string}
 */
export const RELATION_TYPES = {
  RESOLUTION:   'resolution',    // D → T (resolución fuerte)
  PREPARATION:  'preparation',   // S → D (preparación)
  PROLONGATION: 'prolongation',  // T → T (extensión de tónica)
  SUBDOMINANT:  'subdominant',   // T → S (movimiento hacia subdominante)
  DECEPTIVE:    'deceptive',     // D → vi (cadencia rota)
  CHROMATIC:    'chromatic',     // movimiento cromático o de intercambio
  WEAK:         'weak',          // movimiento posible pero menos idiomático
};

/**
 * Peso de cada tipo de relación (1 = fuerte, 0 = débil).
 * Usado para ordenar sugerencias.
 */
const RELATION_WEIGHTS = {
  resolution:   1.0,
  preparation:  0.9,
  prolongation: 0.7,
  subdominant:  0.8,
  deceptive:    0.6,
  chromatic:    0.5,
  weak:         0.3,
};

// ── Grafo de relaciones diatónicas ────────────────────────────────────────────

/**
 * Define las relaciones armónicas entre grados diatónicos.
 * Formato: { desde: [[hacia, tipo], ...] }
 *
 * Basado en práctica común de armonía tonal (Bach, jazz, pop).
 */
const DIATONIC_RELATIONS = {
  0: [ // I (Tónica)
    [1, RELATION_TYPES.SUBDOMINANT],   // I → ii
    [2, RELATION_TYPES.PROLONGATION],  // I → iii
    [3, RELATION_TYPES.SUBDOMINANT],   // I → IV
    [4, RELATION_TYPES.PREPARATION],   // I → V (movimiento hacia dominante)
    [5, RELATION_TYPES.PROLONGATION],  // I → vi
  ],
  1: [ // ii (Subdominante)
    [4, RELATION_TYPES.PREPARATION],   // ii → V (movimiento ii-V fuerte)
    [0, RELATION_TYPES.WEAK],          // ii → I (movimiento retrógrado)
    [3, RELATION_TYPES.PROLONGATION],  // ii → IV (subdominante)
    [6, RELATION_TYPES.PREPARATION],   // ii → vii°
  ],
  2: [ // iii (Tónica relativa)
    [5, RELATION_TYPES.PROLONGATION],  // iii → vi
    [4, RELATION_TYPES.PREPARATION],   // iii → V
    [0, RELATION_TYPES.RESOLUTION],    // iii → I (resolución débil)
    [3, RELATION_TYPES.SUBDOMINANT],   // iii → IV
  ],
  3: [ // IV (Subdominante)
    [4, RELATION_TYPES.PREPARATION],   // IV → V (movimiento clásico)
    [0, RELATION_TYPES.RESOLUTION],    // IV → I (cadencia plagal)
    [1, RELATION_TYPES.PROLONGATION],  // IV → ii
    [5, RELATION_TYPES.PROLONGATION],  // IV → vi
    [6, RELATION_TYPES.PREPARATION],   // IV → vii°
  ],
  4: [ // V (Dominante)
    [0, RELATION_TYPES.RESOLUTION],    // V → I (cadencia auténtica — fuerte)
    [5, RELATION_TYPES.DECEPTIVE],     // V → vi (cadencia rota)
    [3, RELATION_TYPES.WEAK],          // V → IV (movimiento retrógrado)
    [1, RELATION_TYPES.WEAK],          // V → ii
  ],
  5: [ // vi (Tónica relativa menor)
    [1, RELATION_TYPES.SUBDOMINANT],   // vi → ii
    [4, RELATION_TYPES.PREPARATION],   // vi → V
    [2, RELATION_TYPES.PROLONGATION],  // vi → iii
    [3, RELATION_TYPES.SUBDOMINANT],   // vi → IV
    [0, RELATION_TYPES.RESOLUTION],    // vi → I
  ],
  6: [ // vii° (Dominante — sensible)
    [0, RELATION_TYPES.RESOLUTION],    // vii° → I (resolución de sensible)
    [5, RELATION_TYPES.DECEPTIVE],     // vii° → vi
    [1, RELATION_TYPES.WEAK],          // vii° → ii
  ],
};

// ── Nodo del grafo ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ChordNode
 * @property {string}   root     - Nota raíz del acorde
 * @property {string}   quality  - 'maj'|'min'|'dim'|'aug'
 * @property {string}   roman    - Grado romano 'I', 'ii', etc.
 * @property {string[]} notes    - Notas del acorde
 * @property {number}   degree   - Índice del grado (0-6)
 * @property {'T'|'S'|'D'} function - Función armónica
 */

/**
 * @typedef {Object} ChordRelation
 * @property {number} fromDegree
 * @property {number} toDegree
 * @property {string} type       - RELATION_TYPES value
 * @property {number} weight     - 0-1
 */

// ── Funciones principales ─────────────────────────────────────────────────────

/**
 * Construye los nodos del grafo armónico para una tonalidad.
 *
 * @param {string} root      - Nota raíz, ej: 'C'
 * @param {string} scaleName - Nombre de la escala, ej: 'Major'
 * @returns {ChordNode[]} Array de nodos ordenados por grado
 *
 * @example
 * buildHarmonyNodes('C', 'Major')
 * // → [
 * //   { root: 'C', quality: 'maj', roman: 'I', degree: 0, function: 'T', notes: [...] },
 * //   { root: 'D', quality: 'min', roman: 'ii', degree: 1, function: 'S', notes: [...] },
 * //   ...
 * // ]
 */
export function buildHarmonyNodes(root, scaleName) {
  const chords = getDiatonic(root, scaleName);
  return chords.map((chord, degree) => ({
    ...chord,
    degree,
    function: getHarmonicFunction(degree),
  }));
}

/**
 * Construye las relaciones del grafo para una tonalidad.
 * Solo aplica para escalas de 7 notas (las pentatónicas y Blues
 * retornan array vacío ya que el grafo diatónico no aplica).
 *
 * @param {string} root
 * @param {string} scaleName
 * @returns {ChordRelation[]}
 */
export function buildHarmonyRelations(root, scaleName) {
  const nodes = buildHarmonyNodes(root, scaleName);
  if (nodes.length !== 7) return [];

  const relations = [];

  Object.entries(DIATONIC_RELATIONS).forEach(([fromStr, targets]) => {
    const from = parseInt(fromStr, 10);
    targets.forEach(([to, type]) => {
      relations.push({
        fromDegree: from,
        toDegree:   to,
        type,
        weight: RELATION_WEIGHTS[type] ?? 0.3,
      });
    });
  });

  return relations;
}

/**
 * Retorna los movimientos sugeridos desde un acorde activo,
 * ordenados por peso (más idiomático primero).
 *
 * @param {number} fromDegree     - Grado de origen (0-6)
 * @param {string} root
 * @param {string} scaleName
 * @returns {Array<{node: ChordNode, relation: ChordRelation}>}
 *
 * @example
 * getSuggestions(4, 'C', 'Major')
 * // → [{ node: I, relation: { type: 'resolution', weight: 1.0 } }, ...]
 */
export function getSuggestions(fromDegree, root, scaleName) {
  const nodes     = buildHarmonyNodes(root, scaleName);
  const relations = buildHarmonyRelations(root, scaleName);

  if (nodes.length !== 7) return [];

  return relations
    .filter((r) => r.fromDegree === fromDegree)
    .sort((a, b) => b.weight - a.weight)
    .map((relation) => ({
      node: nodes[relation.toDegree],
      relation,
    }));
}

/**
 * Retorna todos los acordes que resuelven hacia un grado destino.
 * Útil para mostrar "quién puede llegar a este acorde".
 *
 * @param {number} toDegree
 * @param {string} root
 * @param {string} scaleName
 * @returns {Array<{node: ChordNode, relation: ChordRelation}>}
 */
export function getPredecessors(toDegree, root, scaleName) {
  const nodes     = buildHarmonyNodes(root, scaleName);
  const relations = buildHarmonyRelations(root, scaleName);

  if (nodes.length !== 7) return [];

  return relations
    .filter((r) => r.toDegree === toDegree)
    .sort((a, b) => b.weight - a.weight)
    .map((relation) => ({
      node: nodes[relation.fromDegree],
      relation,
    }));
}

/**
 * Retorna la relación directa entre dos grados, o null si no existe.
 *
 * @param {number} fromDegree
 * @param {number} toDegree
 * @returns {ChordRelation|null}
 */
export function getRelation(fromDegree, toDegree) {
  const targets = DIATONIC_RELATIONS[fromDegree];
  if (!targets) return null;
  const found = targets.find(([to]) => to === toDegree);
  if (!found) return null;
  const [, type] = found;
  return { fromDegree, toDegree, type, weight: RELATION_WEIGHTS[type] ?? 0.3 };
}

// ── Círculo de quintas ────────────────────────────────────────────────────────

/**
 * Orden del círculo de quintas (sentido horario).
 */
export const CIRCLE_OF_FIFTHS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];

/**
 * Calcula la distancia en el círculo de quintas entre dos notas.
 * @param {string} noteA
 * @param {string} noteB
 * @returns {number} distancia (0-6, donde 0 = misma nota, 6 = tritono)
 */
export function circleOfFifthsDistance(noteA, noteB) {
  const idxA = CIRCLE_OF_FIFTHS.indexOf(noteA);
  const idxB = CIRCLE_OF_FIFTHS.indexOf(noteB);
  if (idxA === -1 || idxB === -1) return -1;
  const diff = Math.abs(idxA - idxB);
  return Math.min(diff, 12 - diff);
}

/**
 * Retorna las tonalidades vecinas (a distancia 1 en el círculo de quintas).
 * @param {string} root
 * @returns {{ dominant: string, subdominant: string }}
 */
export function getNeighborKeys(root) {
  const idx = CIRCLE_OF_FIFTHS.indexOf(root);
  if (idx === -1) return { dominant: null, subdominant: null };
  return {
    dominant:    CIRCLE_OF_FIFTHS[(idx + 1) % 12],
    subdominant: CIRCLE_OF_FIFTHS[(idx + 11) % 12],
  };
}

/**
 * Retorna la tonalidad relativa (Mayor ↔ menor).
 * @param {string} root
 * @param {string} scaleName
 * @returns {string|null} nota raíz de la tonalidad relativa
 */
export function getRelativeKey(root, scaleName) {
  const rootIdx = NOTES.indexOf(root);
  if (rootIdx === -1) return null;

  if (scaleName === 'Major') {
    // Relativa menor: 6º grado = 9 semitonos arriba
    return NOTES[(rootIdx + 9) % 12];
  }
  if (scaleName === 'Minor') {
    // Relativa mayor: 3er grado = 3 semitonos arriba
    return NOTES[(rootIdx + 3) % 12];
  }
  return null;
}

/**
 * Retorna la tonalidad homónima (mismo nombre, modo opuesto).
 * Ej: C Mayor → C menor
 * @param {string} root
 * @param {string} scaleName
 * @returns {{ root: string, scaleName: string }|null}
 */
export function getParallelKey(root, scaleName) {
  if (scaleName === 'Major') return { root, scaleName: 'Minor' };
  if (scaleName === 'Minor') return { root, scaleName: 'Major' };
  return null;
}

// ── Progresiones comunes ──────────────────────────────────────────────────────

/**
 * Progresiones diatónicas comunes por géneros.
 * Cada progresión es un array de grados (0-indexed).
 */
export const COMMON_PROGRESSIONS = {
  'I-IV-V-I':      [0, 3, 4, 0],
  'I-V-vi-IV':     [0, 4, 5, 3],
  'ii-V-I':        [1, 4, 0],
  'I-vi-IV-V':     [0, 5, 3, 4],
  'vi-IV-I-V':     [5, 3, 0, 4],
  'I-IV-vi-V':     [0, 3, 5, 4],
  'I-V-IV-I':      [0, 4, 3, 0],
  'iii-vi-ii-V-I': [2, 5, 1, 4, 0],
  'I-vi-ii-V':     [0, 5, 1, 4],
  'I-IV-I-V':      [0, 3, 0, 4],
};

/**
 * Convierte una progresión de grados a acordes reales para una tonalidad.
 *
 * @param {number[]} degrees    - Array de grados (0-indexed)
 * @param {string}   root
 * @param {string}   scaleName
 * @returns {ChordNode[]}
 *
 * @example
 * degreesToChords([0, 4, 5, 3], 'C', 'Major')
 * // → [C maj, G maj, A min, F maj]
 */
export function degreesToChords(degrees, root, scaleName) {
  const nodes = buildHarmonyNodes(root, scaleName);
  if (nodes.length < 7) return [];
  return degrees
    .filter((d) => d >= 0 && d < nodes.length)
    .map((d) => nodes[d]);
}

/**
 * Retorna todas las progresiones comunes para una tonalidad.
 *
 * @param {string} root
 * @param {string} scaleName
 * @returns {Array<{ name: string, chords: ChordNode[] }>}
 */
export function getCommonProgressions(root, scaleName) {
  const nodes = buildHarmonyNodes(root, scaleName);
  if (nodes.length < 7) return [];

  return Object.entries(COMMON_PROGRESSIONS).map(([name, degrees]) => ({
    name,
    chords: degreesToChords(degrees, root, scaleName),
  }));
}
