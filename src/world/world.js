import * as THREE from 'three';
import { CHARSET, setCharset } from '../render/charsets.js';
import { material } from './materials.js';
import { geometries } from './geometries.js';
import { Instancer } from './instancer.js';

// Placeholder world. Stage B replaces this with a data-driven map (docs/map-design.md).

export const WORLD_RADIUS = 60;

// Deterministic RNG so the world layout is the same every load.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function matrix(x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  return _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

// Prop makers: push instances, return collider radius. Random-call order is
// kept stable so the layout matches earlier versions.
function tree(inst, rand, x, z) {
  const h = 2 + rand() * 2;
  inst.add(geometries.trunk(), material('#8a5a33'), CHARSET.WOOD, matrix(x, 0, z, 1, h, 1));
  const rc = 1.4 + rand() * 0.6;
  const hc = 3 + rand() * 1.5;
  inst.add(geometries.cone(), material('#3fbf5a'), CHARSET.FOLIAGE, matrix(x, h + 1.2 - hc / 2, z, rc, hc, rc));
  return 1.2;
}

function rock(inst, rand, x, z) {
  const s = 0.8 + rand() * 1.4;
  inst.add(geometries.rock(), material('#9aa3ad'), CHARSET.ROCK,
    matrix(x, s * 0.6, z, s, s, s, rand() * 3, rand() * 3, rand() * 3));
  return s * 0.9;
}

const PILLAR_COLORS = ['#ff6b6b', '#ffd166', '#4dabf7', '#c77dff'];
function pillar(inst, rand, x, z) {
  const h = 3 + rand() * 6;
  const color = PILLAR_COLORS[Math.floor(rand() * PILLAR_COLORS.length)];
  inst.add(geometries.box(), material(color), CHARSET.PILLAR, matrix(x, h / 2, z, 2, h, 2));
  return 1.5;
}

/**
 * Builds the static world. Returns colliders as circles on the XZ plane.
 */
export function createWorld(scene) {
  scene.background = new THREE.Color('#05070a');
  scene.fog = new THREE.Fog('#05070a', 25, 75);

  // Ground + grid so motion reads clearly in ASCII.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD_RADIUS + 20, 64),
    material('#3a4250', { flatShading: false }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  setCharset(ground, CHARSET.GROUND);
  scene.add(ground);

  const grid = new THREE.GridHelper(WORLD_RADIUS * 2, WORLD_RADIUS / 2, '#7d8899', '#566070');
  grid.position.y = 0.01;
  grid.userData.noEdges = true; // lines would read as edges everywhere
  scene.add(grid);

  // Scattered props, batched into one InstancedMesh per look.
  const colliders = [];
  const rand = mulberry32(42);
  const makers = [tree, tree, tree, rock, rock, pillar];
  const inst = new Instancer();

  for (let i = 0; i < 70; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 10 + rand() * (WORLD_RADIUS - 12); // keep spawn area clear
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (colliders.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 3)) continue;

    const r = makers[Math.floor(rand() * makers.length)](inst, rand, x, z);
    colliders.push({ x, z, r });
  }
  inst.build(scene);

  // Centre landmark: stacked rings marking the origin (animated, so not instanced).
  const monument = new THREE.Group();
  const gold = material('#ffd166');
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2 - i * 0.5, 0.35, 8, 24), gold);
    ring.castShadow = true;
    ring.position.y = 1.2 + i * 1.6;
    ring.rotation.x = Math.PI / 2;
    monument.add(ring);
  }
  monument.position.set(0, 0, -6);
  setCharset(monument, CHARSET.GOLD);
  scene.add(monument);
  colliders.push({ x: 0, z: -6, r: 2.4 });

  return { colliders, monument };
}
