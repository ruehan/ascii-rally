import * as THREE from 'three';

// Shared unit geometries. Vary size with scale on the mesh / instance
// instead of creating new geometry per prop.
const cache = new Map();

function get(key, make) {
  let g = cache.get(key);
  if (!g) { g = make(); cache.set(key, g); }
  return g;
}

export const geometries = {
  /** 1 x 1 x 1 box centred at origin. */
  box: () => get('box', () => new THREE.BoxGeometry(1, 1, 1)),
  /** Tapered trunk, height 1, base at y=0. */
  trunk: () => get('trunk', () => new THREE.CylinderGeometry(0.25, 0.35, 1, 6).translate(0, 0.5, 0)),
  /** Cone radius 1, height 1, base at y=0. */
  cone: () => get('cone', () => new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0)),
  /** Dodecahedron radius 1. */
  rock: () => get('rock', () => new THREE.DodecahedronGeometry(1, 0)),
};
