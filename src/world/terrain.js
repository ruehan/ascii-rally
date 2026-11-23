import { smoothPath, cumulative, forEachNear, segmentDistance } from './path.js';

/**
 * Baked heightfield: deterministic noise + declarative features.
 * Pure JS (no three) — render mesh, physics and later Rapier all read the
 * same `heights` array, so the car can never float above / sink into the
 * visible ground.
 *
 * Grid: n × n vertices, row-major by z, origin at (-size/2, -size/2).
 * Each cell is split along the (ix+1,iz)–(ix,iz+1) diagonal; heightAt()
 * interpolates on the same triangles as the mesh.
 *
 * Feature types (applied in this order, later wins):
 *   hill   { pos:[x,z], r, height }                       additive bump
 *   ridge  { points, width, height }                      additive bump along a polyline
 *   coast  { points, land, cliffTop, cliffWidth, rise, seaDepth, blend:[d0,d1] }
 *          coastline polyline west→east; land on the 'north' (-z, default) or 'south' side
 *   pad    { pos:[x,z], r, y?, falloff }                  flatten (y defaults to local average)
 *   flat   { polygon, y, falloff }                        flatten a polygon (no noise inside)
 *   plane  { polygon, origin:[x,z], y, slope:[dx,dz], falloff }  sloped flat plane
 *   trail  { points, width, shoulder, smooth, crests:[{at, length, height}] }
 *          carved road: flat cross-section, smoothed long profile
 * Pads are applied again after trails so zone floors stay exactly level.
 */

// --- Deterministic value noise ------------------------------------------

function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sz; // 0..1
}

function fbm(x, z, seed, octaves) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += (valueNoise(x * f, z * f, seed + o * 101) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm; // -1..1
}

// --- Helpers --------------------------------------------------------------

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const bump = (d, r) => (d >= r ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * d) / r));

// --- Terrain ---------------------------------------------------------------

export function createTerrain({ size = 400, cell = 2, seed = 1, base = {}, features = [] } = {}) {
  const n = Math.round(size / cell) + 1;
  const origin = -size / 2;
  const heights = new Float32Array(n * n);
  const grid = { n, origin, cell };
  const { height: baseHeight = 0, amp = 0, wavelength = 60, octaves = 3 } = base;

  // Base noise.
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = origin + ix * cell, z = origin + iz * cell;
      heights[iz * n + ix] = baseHeight + (amp ? fbm(x / wavelength, z / wavelength, seed, octaves) * amp : 0);
    }
  }

  const byType = t => features.filter(f => f.type === t);
  const sample = (x, z) => sampleGrid(heights, grid, x, z);

  // Additive bumps.
  for (const f of byType('hill')) {
    const [cx, cz] = f.pos;
    forEachCell(grid, cx - f.r, cz - f.r, cx + f.r, cz + f.r, (k, x, z) => {
      heights[k] += f.height * bump(Math.hypot(x - cx, z - cz), f.r);
    });
  }
  for (const f of byType('ridge')) {
    const path = smoothPath(f.points, cell);
    const cum = cumulative(path);
    forEachNear(path, cum, f.width, grid, (k, d) => { heights[k] += f.height * bump(d, f.width); });
  }

  // Coast: cliff profile blended into inland terrain. The coastline runs
  // west→east (monotone in x), so the land/sea side of a point is a cheap
  // comparison with the coastline's z at that x; exact signed distance is
  // only computed inside the blend band, against nearby segments.
  for (const f of byType('coast')) {
    const path = smoothPath(f.points, cell * 2);
    const { cliffTop = 16, cliffWidth = 7, rise = 0.06, seaDepth = 6, blend = [50, 100], land = 'north' } = f;
    const landSign = land === 'south' ? -1 : 1;
    const band = blend[1];
    const coastZ = x => {
      if (x <= path[0][0]) return path[0][1];
      for (let i = 1; i < path.length; i++) {
        if (path[i][0] >= x) {
          const [ax, az] = path[i - 1], [bx, bz] = path[i];
          return az + (bz - az) * ((x - ax) / ((bx - ax) || 1));
        }
      }
      return path[path.length - 1][1];
    };
    const profileAt = d => d < 0 ? -seaDepth * smoothstep(0, -12, d)
      : d < cliffWidth ? cliffTop * smoothstep(0, cliffWidth, d)
      : cliffTop + (d - cliffWidth) * rise;
    for (let ix = 0; ix < n; ix++) {
      const x = origin + ix * cell;
      const zc = coastZ(x);
      // Segments that can be within `band` of this column, and their z range:
      // rows farther than `band` beyond that range can't be within the band.
      const local = [];
      let zMin = Infinity, zMax = -Infinity;
      for (let i = 0; i < path.length - 1; i++) {
        if (Math.max(path[i][0], path[i + 1][0]) >= x - band && Math.min(path[i][0], path[i + 1][0]) <= x + band) {
          local.push(path[i], path[i + 1]);
          zMin = Math.min(zMin, path[i][1], path[i + 1][1]);
          zMax = Math.max(zMax, path[i][1], path[i + 1][1]);
        }
      }
      for (let iz = 0; iz < n; iz++) {
        const z = origin + iz * cell;
        const k = iz * n + ix;
        // Positive = land side (north = smaller z by default).
        const side = (zc - z) * landSign;
        let d;
        if (z < zMin - band || z > zMax + band) {
          if (side > 0) continue;          // deep inland: untouched
          heights[k] = -seaDepth;          // open sea
          continue;
        }
        let best = Infinity;
        for (let i = 0; i < local.length; i += 2) {
          const [dd] = segmentDistance(x, z, local[i][0], local[i][1], local[i + 1][0], local[i + 1][1]);
          if (dd < best) best = dd;
        }
        d = side >= 0 ? best : -best;
        if (d > band) continue;
        const profile = profileAt(d);
        const w = smoothstep(blend[0], blend[1], d);
        heights[k] = profile + (heights[k] - profile) * w;
      }
    }
  }

  // Polygon flats / sloped planes (fast roads sit on these: no noise bumps).
  for (const f of features.filter(f => f.type === 'flat' || f.type === 'plane')) {
    const poly = f.polygon;
    const fall = f.falloff ?? 30;
    const [ox, oz] = f.origin ?? [0, 0];
    const [sx, sz] = f.slope ?? [0, 0];
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    forEachCell(grid, Math.min(...xs) - fall, Math.min(...zs) - fall, Math.max(...xs) + fall, Math.max(...zs) + fall, (k, x, z) => {
      const d = pointInPolygon(x, z, poly) ? 0 : polygonDistance(x, z, poly);
      if (d >= fall) return;
      const target = f.y + (x - ox) * sx + (z - oz) * sz;
      const w = 1 - smoothstep(0, fall, d);
      heights[k] += (target - heights[k]) * w;
    });
  }

  // Pads (first pass, so trails entering them sample the flattened height).
  const pads = byType('pad').map(f => ({ ...f, y: f.y ?? averageAround(sample, f.pos, f.r) }));
  const applyPads = () => {
    for (const f of pads) {
      const [cx, cz] = f.pos;
      const fall = f.falloff ?? 8;
      const R = f.r + fall;
      forEachCell(grid, cx - R, cz - R, cx + R, cz + R, (k, x, z) => {
        const w = 1 - smoothstep(f.r, R, Math.hypot(x - cx, z - cz));
        heights[k] += (f.y - heights[k]) * w;
      });
    }
  };
  applyPads();

  // Trails: smoothed long profile, flat cross-section, crests added on top.
  const trails = [];
  for (const f of byType('trail')) {
    const path = smoothPath(f.points, cell, f.closed);
    const cum = cumulative(path);
    const total = cum[cum.length - 1];
    const { width = 6, shoulder = 6, smooth = 20, maxGrade = 0.22, crests = [] } = f;

    // Raw profile at 1 m along the path, then moving average + grade limit.
    // Open trails are smoothed relative to the straight line between their
    // end heights, so the ends stay pinned to whatever they join (pads, roads).
    const steps = Math.ceil(total) + 1;
    const raw = new Float32Array(steps);
    let seg = 1;
    for (let i = 0; i < steps; i++) {
      const s = Math.min(total, i);
      while (seg < cum.length - 1 && cum[seg] < s) seg++;
      const a = path[seg - 1], b = path[seg];
      const t = (s - cum[seg - 1]) / ((cum[seg] - cum[seg - 1]) || 1);
      raw[i] = sample(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    }
    const h0 = raw[0], h1 = raw[steps - 1];
    const line = i => (f.closed ? 0 : h0 + ((h1 - h0) * i) / Math.max(1, steps - 1));
    const half = Math.max(1, Math.round(smooth / 2));
    const profile = new Float32Array(steps);
    for (let i = 0; i < steps; i++) {
      let sum = 0, cnt = 0;
      for (let j = i - half; j <= i + half; j++) {
        if (f.closed) { sum += raw[(j + steps) % steps]; cnt++; continue; }
        // Mirror the detrended residual past the ends so it fades to 0 there.
        const jj = j < 0 ? -j : j >= steps ? 2 * (steps - 1) - j : j;
        const r = raw[Math.max(0, Math.min(steps - 1, jj))] - line(Math.max(0, Math.min(steps - 1, jj)));
        sum += j < 0 || j >= steps ? -r : r;
        cnt++;
      }
      profile[i] = sum / cnt + line(i);
    }
    // Grade limit: forward + backward passes (twice for closed loops).
    for (let pass = 0; pass < (f.closed ? 2 : 1); pass++) {
      for (let i = 1; i < steps; i++) {
        profile[i] = Math.max(profile[i - 1] - maxGrade, Math.min(profile[i - 1] + maxGrade, profile[i]));
      }
      for (let i = steps - 2; i >= 0; i--) {
        profile[i] = Math.max(profile[i + 1] - maxGrade, Math.min(profile[i + 1] + maxGrade, profile[i]));
      }
    }
    // The limiter leaves kinks where it starts/stops clipping; at speed a
    // convex kink launches the car, so round them off (ends stay pinned).
    {
      const k = Math.max(2, Math.round(smooth / 4));
      const src = Float32Array.from(profile);
      for (let i = 0; i < steps; i++) {
        let sum = 0, cnt = 0;
        for (let j = i - k; j <= i + k; j++) {
          if (f.closed) { sum += src[(j + steps) % steps]; cnt++; continue; }
          if (j < 0 || j >= steps) continue;
          sum += src[j]; cnt++;
        }
        const w = f.closed ? 1 : Math.min(1, i / k, (steps - 1 - i) / k); // pinned ends
        profile[i] = src[i] + (sum / cnt - src[i]) * w;
      }
    }
    for (const c of crests) {
      for (let i = 0; i < steps; i++) profile[i] += c.height * bump(Math.abs(i - c.at), c.length / 2);
    }
    const profileAt = s => {
      const i = Math.max(0, Math.min(steps - 1, s));
      const i0 = Math.floor(i), i1 = Math.min(steps - 1, i0 + 1);
      return profile[i0] + (profile[i1] - profile[i0]) * (i - i0);
    };

    const R = width / 2 + shoulder;
    forEachNear(path, cum, R, grid, (k, d, s) => {
      const w = 1 - smoothstep(width / 2, R, d);
      heights[k] += (profileAt(s) - heights[k]) * w;
    });
    trails.push({ ...f, path, cum, length: total, profileAt });
  }

  applyPads();

  return {
    size, cell, n, origin, heights, trails, pads,
    heightAt: (x, z) => sampleGrid(heights, grid, x, z),
    normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
      const e = cell;
      const hx = sampleGrid(heights, grid, x + e, z) - sampleGrid(heights, grid, x - e, z);
      const hz = sampleGrid(heights, grid, x, z + e) - sampleGrid(heights, grid, x, z - e);
      const nx = -hx, ny = 2 * e, nz = -hz;
      const l = Math.hypot(nx, ny, nz);
      out.x = nx / l; out.y = ny / l; out.z = nz / l;
      return out;
    },
    /** dh/ds when moving along unit direction (dx, dz). */
    slopeAlong(x, z, dx, dz) {
      const e = 0.75;
      return (sampleGrid(heights, grid, x + dx * e, z + dz * e) - sampleGrid(heights, grid, x - dx * e, z - dz * e)) / (2 * e);
    },
  };
}

function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function polygonDistance(x, z, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [d] = segmentDistance(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
    if (d < best) best = d;
  }
  return best;
}

function forEachCell({ n, origin, cell }, x0, z0, x1, z1, fn) {
  const ix0 = Math.max(0, Math.floor((x0 - origin) / cell));
  const ix1 = Math.min(n - 1, Math.ceil((x1 - origin) / cell));
  const iz0 = Math.max(0, Math.floor((z0 - origin) / cell));
  const iz1 = Math.min(n - 1, Math.ceil((z1 - origin) / cell));
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) fn(iz * n + ix, origin + ix * cell, origin + iz * cell);
  }
}

function averageAround(sample, [cx, cz], r) {
  let sum = 0, cnt = 0;
  for (let a = 0; a < 16; a++) {
    for (const f of [0, 0.5, 1]) {
      sum += sample(cx + Math.cos(a / 16 * Math.PI * 2) * r * f, cz + Math.sin(a / 16 * Math.PI * 2) * r * f);
      cnt++;
    }
  }
  return sum / cnt;
}

/** Triangle interpolation matching the mesh split (diagonal (ix+1,iz)-(ix,iz+1)). */
function sampleGrid(heights, { n, origin, cell }, x, z) {
  let gx = (x - origin) / cell, gz = (z - origin) / cell;
  gx = Math.max(0, Math.min(n - 1.000001, gx));
  gz = Math.max(0, Math.min(n - 1.000001, gz));
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = gx - ix, fz = gz - iz;
  const k = iz * n + ix;
  const ha = heights[k], hb = heights[k + 1], hc = heights[k + n], hd = heights[k + n + 1];
  if (fx + fz <= 1) return ha + (hb - ha) * fx + (hc - ha) * fz;
  return hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
}
