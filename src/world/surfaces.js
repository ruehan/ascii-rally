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
export const SURFACE_IDS = { grass: 0, gravel: 1, dirt: 2, cobble: 3, asphalt: 4, kerb: 5, pad: 6, sand: 7 };
export const SURFACE_NAMES = Object.keys(SURFACE_IDS);
export const SDF_RANGE = 4; // must exceed any placement clearance asked of insideAt()

/** Physics per surface. Top speed ≈ accel / drag. */
export const SURFACE_PHYSICS = {
  grass:   { grip: 0.7,  drag: 3.2 },
  gravel:  { grip: 0.8,  drag: 2.4 },
  dirt:    { grip: 0.85, drag: 2.5 },
  cobble:  { grip: 0.9,  drag: 2.4 },
  asphalt: { grip: 1.0,  drag: 2.0 },
  kerb:    { grip: 0.9,  drag: 2.1 },
  pad:     { grip: 0.95, drag: 2.2 },
  sand:    { grip: 0.6,  drag: 3.6 },
};

export function createSurfaces({ size = 400, res = 0.5, trails = [], pads = [] }) {
  const n = Math.round(size / res);
  const origin = -size / 2;
  const ids = new Uint8Array(n * n);
  const sdf = new Uint8Array(n * n);   // 0 = far outside
  const inside = new Float32Array(n * n).fill(-SDF_RANGE); // best (halfWidth - dist)

  const stamp = (k, value, id) => {
    if (value > inside[k]) {
      inside[k] = value;
      if (value >= 0) ids[k] = id;
    }
  };

  for (const t of trails) {
    const id = SURFACE_IDS[t.surface ?? 'gravel'];
    const path = t.path ?? smoothPath(t.points, 1, t.closed);
    const half = (t.width ?? 6) / 2;
    const R = half + SDF_RANGE;
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i];
      const [bx, bz] = path[i + 1];
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - origin) / res));
      const x1 = Math.min(n - 1, Math.ceil((Math.max(ax, bx) + R - origin) / res));
      const z0 = Math.max(0, Math.floor((Math.min(az, bz) - R - origin) / res));
      const z1 = Math.min(n - 1, Math.ceil((Math.max(az, bz) + R - origin) / res));
      for (let iz = z0; iz <= z1; iz++) {
        const pz = origin + (iz + 0.5) * res;
        for (let ix = x0; ix <= x1; ix++) {
          const px = origin + (ix + 0.5) * res;
          const [d] = segmentDistance(px, pz, ax, az, bx, bz);
          if (d <= R) stamp(iz * n + ix, half - d, id);
        }
      }
    }
  }

  for (const p of pads) {
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
        if (v >= 0) { ids[k] = id; inside[k] = Math.max(inside[k], v); }
        else stamp(k, v, id);
      }
    }
  }

  for (let k = 0; k < n * n; k++) {
    const v = Math.max(-SDF_RANGE, Math.min(SDF_RANGE, inside[k]));
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
    insideAt: (x, z) => inside[index(x, z)],
  };
}
