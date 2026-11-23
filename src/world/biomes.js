/**
 * Biomes: snow and desert weights at any point (temperate = what's left).
 * Polygons with a feathered edge; snow also appears anywhere above the
 * snowline. Pure JS — used by the terrain mesh (colours, charsets), physics
 * (off-road ground: sand / snow) and the map.
 */
function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function edgeDistance(x, z, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Weight 0..1 for a polygon with a feathered border (half inside, half outside). */
function polygonWeight(x, z, poly, feather) {
  const d = edgeDistance(x, z, poly);
  const signed = pointInPolygon(x, z, poly) ? d : -d;
  return feather > 0 ? smoothstep(-feather / 2, feather / 2, signed) : (signed >= 0 ? 1 : 0);
}

/**
 * biomes: [{ id: 'snow'|'desert', polygon, feather, snowline?, snowlineFeather? }]
 * Returns biomeAt(x, z, y) → { snow, desert } weights.
 */
export function createBiomes(biomes = []) {
  const snow = biomes.filter(b => b.id === 'snow');
  const desert = biomes.filter(b => b.id === 'desert');
  return {
    biomeAt(x, z, y = 0) {
      let s = 0, d = 0;
      for (const b of snow) {
        s = Math.max(s, polygonWeight(x, z, b.polygon, b.feather ?? 0));
        if (b.snowline !== undefined) s = Math.max(s, smoothstep(b.snowline, b.snowline + (b.snowlineFeather ?? 10), y));
      }
      for (const b of desert) d = Math.max(d, polygonWeight(x, z, b.polygon, b.feather ?? 0));
      return { snow: s, desert: d * (1 - s) };
    },
  };
}
