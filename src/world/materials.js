import * as THREE from 'three';

// Shared material palette: one material per (colour, options) combination,
// so meshes with the same look share a material and can be instanced.
const cache = new Map();

export function material(color, { flatShading = true } = {}) {
  const key = `${new THREE.Color(color).getHexString()}|${flatShading}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading });
    cache.set(key, m);
  }
  return m;
}
