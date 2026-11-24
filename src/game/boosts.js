import { pointAt } from '../world/path.js';

/**
 * Conveyor strips: stretches of a trail that push a car along the road
 * (FILM LINE's "automation"). Each strip is sampled every 2 m; a car within
 * half a road width of a sample and roughly facing along it is accelerated
 * forward, up to a cap.
 *
 * boosts: [{ trail, from, to, accel?, cap? }] (metres along the trail)
 */
export function createBoosts(boosts = [], trails = []) {
  const samples = [];
  for (const b of boosts) {
    const tr = trails.find(t => t.id === b.trail);
    if (!tr) continue;
    for (let s = b.from; s <= b.to; s += 2) {
      const p = pointAt(tr.path, tr.cum, s);
      samples.push({ x: p.x, z: p.z, tx: p.tx, tz: p.tz, r: (tr.width ?? 7) / 2, accel: b.accel ?? 7, cap: b.cap ?? 0.9 });
    }
  }
  return {
    samples,
    /** Applies the push for this step; returns true while the car is on a strip. */
    apply(v, dt) {
      if (v.airborne) return false;
      for (const p of samples) {
        if (Math.abs(v.x - p.x) > p.r || Math.abs(v.z - p.z) > p.r) continue;
        if (Math.hypot(v.x - p.x, v.z - p.z) > p.r) continue;
        const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading);
        if (fx * p.tx + fz * p.tz < 0.3) return false; // only when driving along it
        const along = v.vx * p.tx + v.vz * p.tz;
        if (along < (v.car.vmax / 3.6) * p.cap) {
          v.vx += p.tx * p.accel * dt;
          v.vz += p.tz * p.accel * dt;
        }
        return true;
      }
      return false;
    },
  };
}
