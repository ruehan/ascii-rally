/**
 * Stage ~/ — world layout, 1.2 km × 1.2 km. Units: metres, XZ plane,
 * -Z = north. See docs/world-v3.md. Data lives in ./regions/*; build.js
 * turns it into terrain, surfaces, meshes and colliders.
 */
import world from './regions/world.js';
import core from './regions/core.js';
import gp from './regions/gp.js';
import highway, { loop24 } from './regions/highway.js';

/**
 * Regions are concatenated in order. Terrain features apply in type order
 * (see terrain.js), so region order only matters within a type.
 */
const regions = [world, core, gp, highway];
const all = key => regions.flatMap(r => r[key] ?? []);

export default {
  size: 1200,
  bounds: { type: 'box', min: [-585, -585], max: [585, 585] },
  waterLevel: 0,
  spawn: { pos: [0, 132], heading: 0 },

  terrain: {
    cell: 2,
    seed: 7,
    base: { height: 4, amp: 2.2, wavelength: 55, octaves: 3 },
    features: all('features'),
  },
  trails: all('trails'),
  zones: all('zones'),
  stages: all('stages'),
  scatter: all('scatter'),

  loop24,
};
