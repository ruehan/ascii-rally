/**
 * Shared collider schema, read by both the arcade physics and (later) Rapier.
 * All positions are on the XZ plane in metres; `y`/`h` give the vertical
 * extent so a 3D engine can build real shapes.
 *
 *   { type: 'circle', x, z, r, h, y }
 *   { type: 'box',    x, z, hx, hz, rot, h, y }   // half extents, yaw in radians (three.js rotation.y)
 *
 * `y` is the base height; the shape spans y..y+h. The arcade solver skips
 * shapes the car is above (jumps clear low obstacles).
 */

export const circle = (x, z, r, h = 2, y = 0) => ({ type: 'circle', x, z, r, h, y });
export const box = (x, z, hx, hz, rot = 0, h = 2, y = 0) => ({ type: 'box', x, z, hx, hz, rot, h, y });

/** Axis-aligned bounds of a shape: [minX, minZ, maxX, maxZ]. */
export function shapeBounds(s) {
  if (s.type === 'circle') return [s.x - s.r, s.z - s.r, s.x + s.r, s.z + s.r];
  const c = Math.abs(Math.cos(s.rot));
  const n = Math.abs(Math.sin(s.rot));
  const ex = s.hx * c + s.hz * n;
  const ez = s.hx * n + s.hz * c;
  return [s.x - ex, s.z - ez, s.x + ex, s.z + ez];
}

/**
 * Penetration of a circle (px, pz, pr) into shape `s`.
 * Writes {nx, nz, depth} into `out` (normal points out of the shape) and
 * returns true on overlap.
 */
export function circleContact(s, px, pz, pr, out) {
  if (s.type === 'circle') {
    const dx = px - s.x;
    const dz = pz - s.z;
    const d = Math.hypot(dx, dz);
    const min = s.r + pr;
    if (d >= min) return false;
    if (d < 1e-6) { out.nx = 1; out.nz = 0; } else { out.nx = dx / d; out.nz = dz / d; }
    out.depth = min - d;
    return true;
  }

  // Box: move point into box space.
  const c = Math.cos(s.rot);
  const n = Math.sin(s.rot);
  const dx = px - s.x;
  const dz = pz - s.z;
  const lx = dx * c - dz * n;
  const lz = dx * n + dz * c;

  const cx = Math.max(-s.hx, Math.min(s.hx, lx));
  const cz = Math.max(-s.hz, Math.min(s.hz, lz));
  let nx, nz, depth;

  if (cx === lx && cz === lz) {
    // Centre inside box: push out along the shallowest axis.
    const ox = s.hx - Math.abs(lx);
    const oz = s.hz - Math.abs(lz);
    if (ox < oz) { nx = Math.sign(lx) || 1; nz = 0; depth = ox + pr; }
    else { nx = 0; nz = Math.sign(lz) || 1; depth = oz + pr; }
  } else {
    const ex = lx - cx;
    const ez = lz - cz;
    const d = Math.hypot(ex, ez);
    if (d >= pr) return false;
    nx = ex / d; nz = ez / d; depth = pr - d;
  }

  // Normal back to world space.
  out.nx = nx * c + nz * n;
  out.nz = -nx * n + nz * c;
  out.depth = depth;
  return true;
}
