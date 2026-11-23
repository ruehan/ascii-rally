import { smoothPath, segmentDistance } from './path.js';

/**
 * Surface map: what the ground is made of, at 0.5 m resolution.
 * Pure JS — read by physics (grip/drag), the terrain shaders (colour +
 * charset + edge lines) and prop placement (keep props off roads).
 *
 *   ids[k]  surface id (SURFACE_IDS)
 *   sdf[k]  signed distance to the nearest surface edge, ±SDF_RANGE m → 0..255,
 *           128 = edge, >128 inside a road/pad
 */
export const SURFACE_IDS = { grass: 0, gravel: 1, dirt: 2, cobble: 3, asphalt: 4, kerb: 5, pad: 6, sand: 7, snow: 8, ice: 9, dune: 10 };
export const SURFACE_NAMES = Object.keys(SURFACE_IDS);
export const SDF_RANGE = 4; // must exceed any placement clearance asked of insideAt()

// Grip per surface lives with each car's tyres (vehicle/cars.js).

/** Per-segment flag: does the path turn noticeably around this segment? */
function bends(path, closed) {
  const n = path.length;
  const yaw = i => {
    const a = path[(i + n) % n], b = path[(i + 1 + n) % n];
    return Math.atan2(b[0] - a[0], b[1] - a[1]);
  };
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const lo = closed ? i - 4 : Math.max(0, i - 4);
    const hi = closed ? i + 4 : Math.min(n - 2, i + 4);
    const d = Math.atan2(Math.sin(yaw(hi) - yaw(lo)), Math.cos(yaw(hi) - yaw(lo)));
    out.push(Math.abs(d) > 0.35); // > ~20° over ~16 m
  }
  return out;
}

export function createSurfaces({ size = 400, res = 0.5, trails = [], pads = [], patches = [] }) {
  const n = Math.round(size / res);
  const origin = -size / 2;
  const ids = new Uint8Array(n * n);
  const sdf = new Uint8Array(n * n);   // 0 = far outside
  // Best (halfWidth - dist) per cell, in centimetres (Int16: half the memory of floats).
  const Q = 100;
  const inside = new Int16Array(n * n).fill(-SDF_RANGE * Q);

  const kerbCandidates = [];
  const stamp = (k, value, id) => {
    const q = Math.round(value * Q);
    if (q > inside[k]) {
      inside[k] = q;
      if (value >= 0) ids[k] = id;
    }
  };

  for (const t of trails) {
    const id = SURFACE_IDS[t.surface ?? 'gravel'];
    const path = t.path ?? smoothPath(t.points, 1, t.closed);
    const half = (t.width ?? 6) / 2;
    const R = half + SDF_RANGE;
    // Kerbs: a 1.2 m strip along both edges wherever the road bends.
    const bend = t.kerbs ? bends(path, t.closed) : null;
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i];
      const [bx, bz] = path[i + 1];
      const kerb = bend && bend[i];
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - origin) / res));
      const x1 = Math.min(n - 1, Math.ceil((Math.max(ax, bx) + R - origin) / res));
      const z0 = Math.max(0, Math.floor((Math.min(az, bz) - R - origin) / res));
      const z1 = Math.min(n - 1, Math.ceil((Math.max(az, bz) + R - origin) / res));
      for (let iz = z0; iz <= z1; iz++) {
        const pz = origin + (iz + 0.5) * res;
        for (let ix = x0; ix <= x1; ix++) {
          const px = origin + (ix + 0.5) * res;
          const [d] = segmentDistance(px, pz, ax, az, bx, bz);
          if (d > R) continue;
          stamp(iz * n + ix, half - d, id);
          if (kerb && d <= half && d > half - 1.2) kerbCandidates.push(iz * n + ix);
        }
      }
    }
  }

  // Kerb only where the texel really ends up within 1.2 m of the road edge
  // (inside corners, a segment's edge strip can lie mid-road for its neighbour).
  for (const k of kerbCandidates) {
    if (inside[k] >= 0 && inside[k] < 1.2 * Q && ids[k] === SURFACE_IDS.asphalt) ids[k] = SURFACE_IDS.kerb;
  }

  for (const p of [...pads, ...patches]) {
    const id = SURFACE_IDS[p.surface ?? 'pad'];
    const [cx, cz] = p.pos;
    const R = p.r + SDF_RANGE;
    const x0 = Math.max(0, Math.floor((cx - R - origin) / res));
    const x1 = Math.min(n - 1, Math.ceil((cx + R - origin) / res));
    const z0 = Math.max(0, Math.floor((cz - R - origin) / res));
    const z1 = Math.min(n - 1, Math.ceil((cz + R - origin) / res));
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        const d = Math.hypot(origin + (ix + 0.5) * res - cx, origin + (iz + 0.5) * res - cz);
        // Pads win over roads they overlap so the floor reads as one plaza.
        const k = iz * n + ix;
        const v = p.r - d;
        if (v >= 0) { ids[k] = id; inside[k] = Math.max(inside[k], Math.round(v * Q)); }
        else stamp(k, v, id);
      }
    }
  }

  for (let k = 0; k < n * n; k++) {
    const v = Math.max(-SDF_RANGE, Math.min(SDF_RANGE, inside[k] / Q));
    sdf[k] = Math.round(((v / SDF_RANGE) * 0.5 + 0.5) * 255);
  }

  const index = (x, z) => {
    const ix = Math.max(0, Math.min(n - 1, Math.floor((x - origin) / res)));
    const iz = Math.max(0, Math.min(n - 1, Math.floor((z - origin) / res)));
    return iz * n + ix;
  };

  return {
    size, res, n, origin, ids, sdf,
    /** Surface name at a point. */
    surfaceAt: (x, z) => SURFACE_NAMES[ids[index(x, z)]],
    /** Metres inside the nearest road/pad (negative = outside, clamped ±SDF_RANGE). */
    insideAt: (x, z) => inside[index(x, z)] / Q,
  };
}
