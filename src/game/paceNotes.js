import { pointAt } from '../world/path.js';

/**
 * Generates rally pace notes from road geometry (no hand authoring).
 *
 * Severity follows the usual 1–6 scale: 6 = flat-out kink, 1 = hairpin.
 * Direction: L / R. Modifiers: `long`, `over crest ! jump`.
 * Returns [{ s, text }] sorted by distance along the path.
 */
const STEP = 4;     // sampling interval (m)
const WINDOW = 16;  // heading change measured over this distance (m)
const MIN_TURN = 12 * Math.PI / 180;

function severity(radius) {
  if (radius > 120) return 6;
  if (radius > 80) return 5;
  if (radius > 50) return 4;
  if (radius > 30) return 3;
  if (radius > 18) return 2;
  return 1;
}

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/** Car-style yaw of the path tangent at s (increasing = turning left). */
function yawAt(path, cum, s) {
  const p = pointAt(path, cum, s);
  return Math.atan2(-p.tx, -p.tz);
}

export function paceNotes({ path, cum, from, to, crests = [] }) {
  // Group consecutive samples turning the same way into one corner.
  const corners = [];
  let cur = null;
  for (let s = from; s < to - WINDOW; s += STEP) {
    const d = wrap(yawAt(path, cum, s + WINDOW) - yawAt(path, cum, s));
    const dir = Math.abs(d) < MIN_TURN ? 0 : Math.sign(d);
    if (dir && cur && cur.dir === dir) {
      cur.end = s + WINDOW;
    } else if (dir) {
      cur = { dir, start: s, end: s + WINDOW };
      corners.push(cur);
    } else {
      cur = null;
    }
  }

  const notes = corners.map(c => {
    const angle = Math.abs(wrap(yawAt(path, cum, c.end) - yawAt(path, cum, c.start)));
    const len = c.end - c.start;
    const sev = severity(len / Math.max(angle, 1e-3));
    let text = `${c.dir > 0 ? 'L' : 'R'}${sev}`;
    if (len > 45) text += ' long';
    return { s: c.start, text };
  });

  // Crests: attach to a corner that starts nearby, else their own note.
  for (const c of crests) {
    const at = c.at - c.length / 2;
    if (at < from || at > to) continue;
    const n = notes.find(n => Math.abs(n.s - at) < 12);
    if (n) n.text += ' over crest ! jump';
    else notes.push({ s: at, text: 'crest ! jump' });
  }

  notes.sort((a, b) => a.s - b.s);

  // Close notes chain with "into".
  for (let i = 0; i < notes.length - 1; i++) {
    if (notes[i + 1].s - notes[i].s < 20) notes[i].text += ' into';
  }
  return notes;
}
