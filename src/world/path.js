/**
 * Polyline helpers shared by terrain, surfaces and prop placement.
 * Pure JS (no three) so it runs in node tests.
 */

/** Catmull-Rom resample of control points into ~`spacing` metre steps. */
export function smoothPath(points, spacing = 2, closed = false) {
  const pts = closed ? [...points, points[0]] : points;
  const get = i => {
    if (closed) return points[(i + points.length) % points.length];
    return pts[Math.max(0, Math.min(pts.length - 1, i))];
  };
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.ceil(len / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(closed ? [...points[0]] : [...pts[pts.length - 1]]);
  return out;
}

/** Cumulative distance along a polyline. */
export function cumulative(path) {
  const d = [0];
  for (let i = 1; i < path.length; i++) {
    d.push(d[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  }
  return d;
}

/**
 * Nearest point on segment a-b to p. Returns [distance, t in 0..1].
 */
export function segmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return [Math.hypot(px - (ax + dx * t), pz - (az + dz * t)), t];
}

/** Point and unit tangent at distance `s` along a path with cumulative `cum`. */
export function pointAt(path, cum, s) {
  s = Math.max(0, Math.min(cum[cum.length - 1], s));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const a = path[i - 1], b = path[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (s - cum[i - 1]) / seg;
  const dx = (b[0] - a[0]) / seg, dz = (b[1] - a[1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: dx, tz: dz };
}

/**
 * Visits every grid point within `radius` of the path and reports the
 * nearest distance + arc length. `visit(index, dist, s)` is called once per
 * grid point with its best match.
 */
export function forEachNear(path, cum, radius, grid, visit) {
  const { n, origin, cell } = grid;
  const best = new Map();
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i];
    const [bx, bz] = path[i + 1];
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - radius - origin) / cell));
    const x1 = Math.min(n - 1, Math.ceil((Math.max(ax, bx) + radius - origin) / cell));
    const z0 = Math.max(0, Math.floor((Math.min(az, bz) - radius - origin) / cell));
    const z1 = Math.min(n - 1, Math.ceil((Math.max(az, bz) + radius - origin) / cell));
    const segLen = cum[i + 1] - cum[i];
    for (let iz = z0; iz <= z1; iz++) {
      const pz = origin + iz * cell;
      for (let ix = x0; ix <= x1; ix++) {
        const px = origin + ix * cell;
        const [d, t] = segmentDistance(px, pz, ax, az, bx, bz);
        if (d > radius) continue;
        const k = iz * n + ix;
        const prev = best.get(k);
        if (!prev || d < prev[0]) best.set(k, [d, cum[i] + segLen * t]);
      }
    }
  }
  for (const [k, [d, s]] of best) visit(k, d, s);
}
