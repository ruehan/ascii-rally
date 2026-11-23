import { pointAt } from '../world/path.js';
import { paceNotes } from './paceNotes.js';

const START_RADIUS = 5;     // start box (m)
const ARM_DWELL = 0.8;      // stop this long in the box to arm
const COUNTDOWN = 3;        // seconds
const JUMP_START = 5;       // penalty (s)
const MISSED_SPLIT = 10;    // penalty (s)
const OFF_ROUTE = 25;       // abort if this far from the route...
const OFF_ROUTE_TIME = 2.5; // ...for this long
const NOTE_LEAD = 2.5;      // call notes this many seconds ahead

/**
 * Special stages: start box → countdown → splits → flying finish.
 * Pure logic (no DOM); call update(dt, vehicle) every physics step.
 *
 * Events (bus):
 *   stage:near      { stage }                 car in a start box
 *   stage:armed     { stage }
 *   stage:count     { stage, n }               3, 2, 1
 *   stage:go        { stage }
 *   stage:split     { stage, index, time }
 *   stage:note      { stage, text, dist }
 *   stage:finish    { stage, time, raw, penalty }
 *   stage:abort     { stage, reason }
 */
export function createStageSystem({ stages, trails, bus }) {
  const list = stages.map(cfg => {
    const trail = trails.find(t => t.id === cfg.trail);
    const start = pointAt(trail.path, trail.cum, cfg.from);
    return {
      ...cfg,
      trail,
      start,
      finish: pointAt(trail.path, trail.cum, cfg.to),
      length: cfg.to - cfg.from,
      notes: paceNotes({ path: trail.path, cum: trail.cum, from: cfg.from, to: cfg.to, crests: trail.crests }),
    };
  });

  let state = 'idle';
  let active = null;
  let dwell = 0, countdown = 0, time = 0, penalty = 0, s = 0, off = 0;
  let nextSplit = 0, nextNote = 0, jumped = false, startPos = null;

  /** Arc length of the nearest route point, searched around the last known s. */
  function locate(v) {
    const { path, cum } = active.trail;
    let best = Infinity, bs = s;
    for (let q = s - 10; q <= s + 30; q += 0.5) {
      const p = pointAt(path, cum, q);
      const d = Math.hypot(p.x - v.x, p.z - v.z);
      if (d < best) { best = d; bs = q; }
    }
    return { s: bs, dist: best };
  }

  function reset() {
    state = 'idle';
    active = null;
    dwell = 0;
  }

  function abort(reason) {
    bus.emit('stage:abort', { stage: active, reason });
    reset();
  }

  function update(dt, v) {
    const moving = Math.abs(v.speed) > 0.5;

    if (state === 'idle' || state === 'near') {
      const near = list.find(st => Math.hypot(st.start.x - v.x, st.start.z - v.z) < START_RADIUS);
      if (!near) { if (state === 'near') reset(); return; }
      if (state === 'idle') { state = 'near'; active = near; bus.emit('stage:near', { stage: near }); }
      dwell = moving ? 0 : dwell + dt;
      if (dwell >= ARM_DWELL) {
        state = 'countdown';
        countdown = COUNTDOWN;
        jumped = false;
        startPos = [v.x, v.z];
        bus.emit('stage:armed', { stage: active });
        bus.emit('stage:count', { stage: active, n: COUNTDOWN });
      }
      return;
    }

    if (state === 'countdown') {
      const before = Math.ceil(countdown);
      countdown -= dt;
      if (!jumped && Math.hypot(v.x - startPos[0], v.z - startPos[1]) > 1) jumped = true;
      if (countdown <= 0) {
        state = 'running';
        time = 0;
        penalty = jumped ? JUMP_START : 0;
        s = active.from;
        off = 0;
        nextSplit = 0;
        nextNote = 0;
        bus.emit('stage:go', { stage: active, jumped });
      } else if (Math.ceil(countdown) < before) {
        bus.emit('stage:count', { stage: active, n: Math.ceil(countdown) });
      }
      return;
    }

    if (state === 'running') {
      time += dt;
      const loc = locate(v);
      if (loc.s - s > 25) return abort('teleport');
      s = Math.max(s, loc.s);

      off = loc.dist > OFF_ROUTE ? off + dt : 0;
      if (off > OFF_ROUTE_TIME) return abort('off route');

      // Pace notes, called ahead by time.
      const lead = Math.max(15, Math.min(35, Math.abs(v.speed) * NOTE_LEAD));
      while (nextNote < active.notes.length && active.notes[nextNote].s <= s + lead) {
        const n = active.notes[nextNote++];
        bus.emit('stage:note', { stage: active, text: n.text, dist: Math.max(0, Math.round(n.s - s)) });
      }

      // Splits must be passed in order; skipping one costs time.
      while (nextSplit < active.splits.length && s >= active.splits[nextSplit]) {
        const near = loc.dist < active.trail.width / 2 + 3;
        if (!near) penalty += MISSED_SPLIT;
        bus.emit('stage:split', { stage: active, index: nextSplit, time: time + penalty, missed: !near });
        nextSplit++;
      }

      if (s >= active.to) {
        bus.emit('stage:finish', { stage: active, time: time + penalty, raw: time, penalty });
        reset();
      }
    }
  }

  return {
    stages: list,
    update,
    abort: () => active && state !== 'idle' && abort('reset'),
    get state() { return state; },
    get active() { return active; },
    get time() { return state === 'running' ? time + penalty : 0; },
    get countdown() { return countdown; },
    get progress() { return active && state === 'running' ? (s - active.from) / active.length : 0; },
  };
}
