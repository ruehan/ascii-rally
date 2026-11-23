/**
 * Stage ~/ — world layout, 1.2 km × 1.2 km. Units: metres, XZ plane,
 * -Z = north. See docs/world-v3.md. Data lives in ./regions/*; build.js
 * turns it into terrain, surfaces, meshes and colliders.
 */
import world from './regions/world.js';
import core from './regions/core.js';
import gp from './regions/gp.js';

/**
 * Regions are concatenated in order. Terrain features apply in type order
 * (see terrain.js), so region order only matters within a type.
 */
const regions = [world, core, gp];
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

  // 24H loop: a route stitched from existing roads (clockwise). Driving it
  // runs the clock from 15:00 round to 15:00; career milestones sit along it.
  loop24: {
    route: [
      { trail: 'valley' },
      { trail: 'coast', from: 211 },
      { trail: 'east' },
      { points: [[22, 124], [10, 108], [0, 99]] }, // across the paddock back to the start
    ],
    start: 10,          // start line, metres along the route
    startHour: 15,
  },
};
