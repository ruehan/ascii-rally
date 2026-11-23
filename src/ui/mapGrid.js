/**
 * ASCII map of the world, built once from terrain, surfaces and colliders.
 * Pure (no DOM). Cells are taller than wide (like monospace glyphs) so the
 * map isn't stretched: cellZ = cellX / CHAR_ASPECT.
 *
 * Each cell has a class (index into MAP_CLASSES) and a glyph.
 */
export const CHAR_ASPECT = 0.6;

export const MAP_CLASSES = [
  { id: 'sea', ch: '~' },
  { id: 'low', ch: '.' },
  { id: 'mid', ch: ',' },
  { id: 'high', ch: "'" },
  { id: 'cliff', ch: '|' },
  { id: 'gravel', ch: ':' },
  { id: 'cobble', ch: 'o' },
  { id: 'asphalt', ch: '=' },
  { id: 'dirt', ch: '%' },
  { id: 'pad', ch: '#' },
  { id: 'tree', ch: '^' },
  { id: 'building', ch: 'H' },
  { id: 'kerb', ch: '=' },
  { id: 'sand', ch: '.' },
  { id: 'snowfield', ch: '*' },   // off-road snow (biome / above the snowline)
  { id: 'desert', ch: '.' },      // desert floor
  { id: 'dune', ch: '~' },        // dune crests
  { id: 'snowroad', ch: ':' },    // packed-snow road
  { id: 'ice', ch: '-' },
];
const C = Object.fromEntries(MAP_CLASSES.map((c, i) => [c.id, i]));

const SURFACE_CLASS = {
  gravel: C.gravel, cobble: C.cobble, asphalt: C.asphalt, dirt: C.dirt, pad: C.pad, kerb: C.kerb, sand: C.sand,
  snow: C.snowroad, ice: C.ice, dune: C.dune,
};
/** Classes that are plain ground (props may be drawn over them). */
const GROUND = new Set([C.sea, C.low, C.mid, C.high, C.cliff, C.snowfield, C.desert, C.dune]);

/**
 * @param {object} o
 * @param {object} o.terrain   createTerrain() result
 * @param {object} [o.biomes]  createBiomes() result (snow / desert ground)
 * @param {object} o.surfaces  createSurfaces() result
 * @param {Array}  o.colliders physics shapes (trees = small circles, buildings = boxes)
 * @param {number} o.cellX     metres per column
 * @param {number} [o.waterLevel]
 */
export function buildMapGrid({ terrain, surfaces, biomes = null, colliders = [], cellX = 2, waterLevel = 0 }) {
  const cellZ = cellX / CHAR_ASPECT;
  const size = terrain.size;
  const origin = -size / 2;
  const cols = Math.floor(size / cellX);
  const rows = Math.floor(size / cellZ);
  const cls = new Uint8Array(cols * rows);
  const nrm = { x: 0, y: 1, z: 0 };

  for (let r = 0; r < rows; r++) {
    const z = origin + (r + 0.5) * cellZ;
    for (let c = 0; c < cols; c++) {
      const x = origin + (c + 0.5) * cellX;
      const surf = surfaces.surfaceAt(x, z);
      let k;
      if (SURFACE_CLASS[surf] !== undefined) k = SURFACE_CLASS[surf];
      else {
        const y = terrain.heightAt(x, z);
        if (y < waterLevel + 0.2) k = C.sea;
        else if (terrain.normalAt(x, z, nrm).y < 0.6) k = C.cliff;
        else {
          const b = biomes ? biomes.biomeAt(x, z, y) : null;
          if (b && b.snow > 0.5) k = C.snowfield;
          else if (b && b.desert > 0.5) k = y > 6.5 ? C.dune : C.desert;
          else k = y < 6 ? C.low : y < 14 ? C.mid : C.high;
        }
      }
      cls[r * cols + c] = k;
    }
  }

  // Props on top of ground (but never over roads).
  const cell = (x, z) => {
    const c = Math.floor((x - origin) / cellX), r = Math.floor((z - origin) / cellZ);
    return c >= 0 && r >= 0 && c < cols && r < rows ? r * cols + c : -1;
  };
  const isGround = k => GROUND.has(k) && k !== C.sea;
  for (const s of colliders) {
    if (s.type === 'circle' && s.r < 0.7 && s.h > 2.5) {
      const k = cell(s.x, s.z);
      if (k >= 0 && isGround(cls[k])) cls[k] = C.tree;
    } else if (s.type === 'box' && s.h > 2.5) {
      // Buildings: fill the box's axis-aligned extent.
      const ex = Math.abs(Math.cos(s.rot)) * s.hx + Math.abs(Math.sin(s.rot)) * s.hz;
      const ez = Math.abs(Math.sin(s.rot)) * s.hx + Math.abs(Math.cos(s.rot)) * s.hz;
      for (let z = s.z - ez; z <= s.z + ez; z += cellZ * 0.5) {
        for (let x = s.x - ex; x <= s.x + ex; x += cellX * 0.5) {
          const k = cell(x, z);
          if (k >= 0 && isGround(cls[k])) cls[k] = C.building;
        }
      }
    }
  }

  return {
    cols, rows, cellX, cellZ, origin, cls,
    /** True for plain ground classes (no road, prop or building). */
    isGround: k => GROUND.has(k),
    /** World → fractional [col, row]. */
    toCell: (x, z) => [(x - origin) / cellX, (z - origin) / cellZ],
    /** Glyph at a cell (space outside). */
    char(c, r) {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return ' ';
      return MAP_CLASSES[cls[r * cols + c]].ch;
    },
    classAt(c, r) {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
      return cls[r * cols + c];
    },
  };
}
