import * as THREE from 'three';

// Shared unit geometries. Vary size with scale on the mesh / instance
// instead of creating new geometry per prop. Most have their base at y=0.
const cache = new Map();

function get(key, make) {
  let g = cache.get(key);
  if (!g) { g = make(); cache.set(key, g); }
  return g;
}

/** Triangular prism (gable roof): 1 wide (x), 1 tall, 1 deep (z), base at y=0. */
function prism() {
  const p = [
    [-0.5, 0, -0.5], [0.5, 0, -0.5], [0, 1, -0.5],
    [-0.5, 0, 0.5], [0.5, 0, 0.5], [0, 1, 0.5],
  ];
  const tris = [
    [0, 2, 1], [3, 4, 5],          // gable ends
    [0, 3, 5], [0, 5, 2],          // left slope
    [1, 2, 5], [1, 5, 4],          // right slope
    [0, 1, 4], [0, 4, 3],          // bottom
  ];
  const pos = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => t.forEach((v, j) => pos.set(p[v], i * 9 + j * 3)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export const geometries = {
  /** 1 x 1 x 1 box centred at origin. */
  box: () => get('box', () => new THREE.BoxGeometry(1, 1, 1)),
  /** 1 x 1 x 1 box with base at y=0. */
  block: () => get('block', () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
  /** Tapered trunk, height 1, base at y=0. */
  trunk: () => get('trunk', () => new THREE.CylinderGeometry(0.25, 0.35, 1, 6).translate(0, 0.5, 0)),
  /** Cone radius 1, height 1, base at y=0. */
  cone: () => get('cone', () => new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0)),
  /** Four-sided pyramid (spire), radius 1, height 1, base at y=0. */
  spire: () => get('spire', () => new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0)),
  /** Low-poly ball radius 1, centred. */
  ball: () => get('ball', () => new THREE.IcosahedronGeometry(1, 0)),
  /** Dodecahedron radius 1. */
  rock: () => get('rock', () => new THREE.DodecahedronGeometry(1, 0)),
  /** Cylinder radius 1, height 1, base at y=0. */
  cylinder: () => get('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0)),
  /** Gable roof prism. */
  prism: () => get('prism', prism),
  /** Torus (ring) lying in the XY plane. */
  ring: () => get('ring', () => new THREE.TorusGeometry(1, 0.12, 6, 18)),
};
