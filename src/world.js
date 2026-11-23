import * as THREE from 'three';
import { CHARSET, setCharset } from './ascii.js';

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

function mesh(geometry, color) {
  const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, flatShading: true }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function tree(rand) {
  const g = new THREE.Group();
  const h = 2 + rand() * 2;
  const trunk = mesh(new THREE.CylinderGeometry(0.25, 0.35, h, 6), '#8a5a33');
  trunk.position.y = h / 2;
  setCharset(trunk, CHARSET.WOOD);
  const crown = mesh(new THREE.ConeGeometry(1.4 + rand() * 0.6, 3 + rand() * 1.5, 7), '#3fbf5a');
  crown.position.y = h + 1.2;
  setCharset(crown, CHARSET.FOLIAGE);
  g.add(trunk, crown);
  return { object: g, radius: 1.2 };
}

function rock(rand) {
  const s = 0.8 + rand() * 1.4;
  const m = mesh(new THREE.DodecahedronGeometry(s, 0), '#9aa3ad');
  m.position.y = s * 0.6;
  m.rotation.set(rand() * 3, rand() * 3, rand() * 3);
  setCharset(m, CHARSET.ROCK);
  return { object: m, radius: s * 0.9 };
}

function pillar(rand) {
  const h = 3 + rand() * 6;
  const colors = ['#ff6b6b', '#ffd166', '#4dabf7', '#c77dff'];
  const m = mesh(new THREE.BoxGeometry(2, h, 2), colors[Math.floor(rand() * colors.length)]);
  m.position.y = h / 2;
  setCharset(m, CHARSET.PILLAR);
  return { object: m, radius: 1.5 };
}

/**
 * Builds the static world. Returns colliders as circles on the XZ plane.
 */
export function createWorld(scene) {
  scene.background = new THREE.Color('#05070a');
  scene.fog = new THREE.Fog('#05070a', 25, 75);

  scene.add(new THREE.HemisphereLight('#bcd7ff', '#2a2018', 0.9));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.position.set(20, 35, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 100 });
  scene.add(sun, sun.target);

  // Ground + grid so motion reads clearly in ASCII.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD_RADIUS + 20, 64),
    new THREE.MeshStandardMaterial({ color: '#3a4250' }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  setCharset(ground, CHARSET.GROUND);
  scene.add(ground);

  const grid = new THREE.GridHelper(WORLD_RADIUS * 2, WORLD_RADIUS / 2, '#7d8899', '#566070');
  grid.position.y = 0.01;
  grid.userData.noEdges = true; // lines would read as edges everywhere
  scene.add(grid);

  // Boundary ring of rocks-coloured posts.
  const colliders = [];
  const rand = mulberry32(42);
  const makers = [tree, tree, tree, rock, rock, pillar];

  for (let i = 0; i < 70; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 10 + rand() * (WORLD_RADIUS - 12); // keep spawn area clear
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (colliders.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 3)) continue;

    const { object, radius } = makers[Math.floor(rand() * makers.length)](rand);
    object.position.x = x;
    object.position.z = z;
    scene.add(object);
    colliders.push({ x, z, r: radius });
  }

  // Centre landmark: stacked rings marking the origin.
  const monument = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const ring = mesh(new THREE.TorusGeometry(2.2 - i * 0.5, 0.35, 8, 24), '#ffd166');
    ring.position.y = 1.2 + i * 1.6;
    ring.rotation.x = Math.PI / 2;
    monument.add(ring);
  }
  monument.position.set(0, 0, -6);
  setCharset(monument, CHARSET.GOLD);
  scene.add(monument);
  colliders.push({ x: 0, z: -6, r: 2.4 });

  return { colliders, sun, monument };
}
