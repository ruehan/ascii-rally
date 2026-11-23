import { smoothPath, cumulative, pointAt } from '../world/path.js';

const START_RADIUS = 7;
const OFF_ROUTE = 30;
const OFF_ROUTE_TIME = 3;

/**
 * Stitches trail sections (and raw point lists) into one route polyline.
 * Each part: { trail: id, from?, to? } or { points: [[x,z], ...] }.
 */
export function buildRoute(parts, trails, spacing = 2) {
  const pts = [];
  for (const part of parts) {
    if (part.points) {
      pts.push(...smoothPath(part.points, spacing));
      continue;
    }
    const t = trails.find(tr => tr.id === part.trail);
    const from = part.from ?? 0, to = part.to ?? t.cum.at(-1);
    for (let s = from; s <= to; s += spacing) {
      const p = pointAt(t.path, t.cum, s);
      pts.push([p.x, p.z]);
    }
  }
  // Drop near-duplicate joins.
  const path = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.5);
  return { path, cum: cumulative(path), length: cumulative(path).at(-1) };
}

/**
 * 24H session: crossing the start line starts the clock; distance along the
 * route maps to the hour (startHour → +24 h). Milestones fire as you pass
 * them. Leaving the route pauses the session.
 *
 * Events: loop:start, loop:milestone { milestone }, loop:finish, loop:pause
 */
export function createLoop24({ route, start, startHour = 15, milestones = [], bus }) {
  const startPt = pointAt(route.path, route.cum, start);
  const span = route.length - start;
  // Spread milestones evenly along the lap unless they say where.
  const ms = milestones.map((m, i) => ({ ...m, s: start + span * (m.at ?? (i + 1) / (milestones.length + 1)) }));

  let state = 'idle';
  let s = start, off = 0, next = 0;

  function locate(v) {
    let best = Infinity, bs = s;
    for (let q = s - 10; q <= s + 12; q += 1) { // narrow: never snap across a bend
      const p = pointAt(route.path, route.cum, q);
      const d = Math.hypot(p.x - v.x, p.z - v.z);
      if (d < best) { best = d; bs = q; }
    }
    return { s: bs, dist: best };
  }

  function update(dt, v) {
    if (state === 'idle') {
      // Start when crossing the line heading the route's way.
      const d = Math.hypot(v.x - startPt.x, v.z - startPt.z);
      const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading);
      if (d < START_RADIUS && v.speed > 2 && fx * startPt.tx + fz * startPt.tz > 0.5) {
        state = 'running';
        s = start;
        off = 0;
        next = 0;
        bus.emit('loop:start', {});
      }
      return;
    }
    const loc = locate(v);
    s = Math.max(s, loc.s);
    off = loc.dist > OFF_ROUTE ? off + dt : 0;
    if (off > OFF_ROUTE_TIME) {
      state = 'idle';
      bus.emit('loop:pause', {});
      return;
    }
    while (next < ms.length && s >= ms[next].s) bus.emit('loop:milestone', { milestone: ms[next++] });
    if (s >= route.length - 4) {
      state = 'idle';
      bus.emit('loop:finish', {});
    }
  }

  return {
    update,
    milestones: ms,
    startPoint: startPt,
    get state() { return state; },
    /** Clock hour while running, else null. */
    get hour() { return state === 'running' ? (startHour + 24 * (s - start) / span) % 24 : null; },
    get progress() { return state === 'running' ? (s - start) / span : 0; },
    reset() { state = 'idle'; },
  };
}
