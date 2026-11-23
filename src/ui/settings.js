/**
 * Player settings, persisted per browser. One source of truth for both the
 * settings menu and the keyboard shortcuts (C, G, N, V, +/−).
 *
 *   sound    on/off
 *   glyph    cell size in px (6..24, even)
 *   colour   per-object colour vs mono terminal green
 *   edges    outline glyphs
 *   camera   'chase' | 'top'
 *   quality  'auto' | 'high' | 'medium' | 'low'
 *
 * Language lives in i18n.js (it's needed before anything else renders).
 */
const KEY = 'stage~/settings';
const DEFAULTS = { sound: true, glyph: 6, colour: true, edges: false, camera: 'chase', quality: 'auto' };

const load = () => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...DEFAULTS }; }
};

const state = load();
const listeners = new Set();

export const settings = {
  get(key) { return state[key]; },
  /** Sets and persists a value; listeners get (key, value). */
  set(key, value) {
    if (!(key in DEFAULTS) || state[key] === value) return;
    state[key] = value;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* not persisted */ }
    for (const fn of listeners) fn(key, value);
  },
  toggle(key) { this.set(key, !state[key]); return state[key]; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  all() { return { ...state }; },
};
