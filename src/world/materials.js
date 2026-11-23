import * as THREE from 'three';
import { applyCutaway } from '../render/cutaway.js';

// Shared material palette: one material per (colour, options) combination,
// so meshes with the same look share a material and can be instanced.
// `cutaway: true` lets the object turn see-through where it hides the car.
const cache = new Map();

export function material(color, { flatShading = true, cutaway = false } = {}) {
  const key = `${new THREE.Color(color).getHexString()}|${flatShading}|${cutaway}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading });
    if (cutaway) applyCutaway(m);
    cache.set(key, m);
  }
  return m;
}
