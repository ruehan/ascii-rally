import * as THREE from 'three';
import { CHARSET, setCharset } from '../render/charsets.js';
import { material } from './materials.js';
import { groundLight } from '../render/groundLight.js';
import { swayUniforms } from '../render/sway.js';
import { geometries as G } from './geometries.js';
import { Instancer } from './instancer.js';
import { createTerrain } from './terrain.js';
import { createSurfaces, SDF_RANGE } from './surfaces.js';
import { createTerrainMesh } from './terrainMesh.js';
import { createBiomes } from './biomes.js';
import { pointAt } from './path.js';
import { circle, box, circleContact } from '../physics/shapes.js';
import { SpatialHash } from '../physics/spatialHash.js';
import { buildRoute } from '../game/loop24.js';
import { milestones } from '../content/content.js';

// Deterministic RNG.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

/** Three.js yaw so local +x points along (tx, tz). */
const yawAlong = (tx, tz) => Math.atan2(-tz, tx);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

const HOUSE_WALLS = ['#e8c07a', '#d98b5f', '#f0e2c4', '#e7a6a0', '#c9d6a3', '#f2d38b', '#a9c4c9'];
const ROOFS = ['#b5532f', '#9c4a2c', '#c2643a'];
const STONE = '#c8bba4';

/**
 * Builds the world from map data: terrain, surfaces, meshes, colliders.
 * Static props are batched into one InstancedMesh per look.
 */
export function buildWorld(scene, map) {
  // --- Ground ----------------------------------------------------------------
  const features = [
    ...map.terrain.features,
    ...map.zones.filter(z => z.flatten !== false).map(z => ({ type: 'pad', pos: z.pos, r: z.r, y: z.y, pre: z.flatten === 'pre', falloff: z.flatten === 'pre' ? 25 : undefined })),
    ...map.trails.map(t => ({ type: 'trail', ...t })),
  ];
  const terrain = createTerrain({ size: map.size, ...map.terrain, features });
  const surfaces = createSurfaces({
    size: map.size,
    trails: terrain.trails,
    pads: map.zones.map(z => ({ pos: z.pos, r: z.r, surface: z.surface })),
    patches: map.patches ?? [],
  });
  const biomes = createBiomes(map.biomes ?? []);
  /** Off-road ground follows the biome: sand in the desert, snow up high. */
  const surfaceAt = (x, z) => {
    const s = surfaces.surfaceAt(x, z);
    if (s !== 'grass') return s;
    const b = biomes.biomeAt(x, z, terrain.heightAt(x, z));
    return b.snow > 0.5 ? 'snow' : b.desert > 0.5 ? 'sand' : 'grass';
  };

  scene.background = new THREE.Color('#121612');
  scene.fog = new THREE.Fog('#121612', 55, 130);

  // Sea: brightness ripples over time so the `~ ≈` glyphs shimmer; the
  // terrain draws surf along the shore from the same clock.
  const seaTime = { value: 0 };
  const ground = createTerrainMesh(terrain, surfaces, biomes, { waterLevel: map.waterLevel, time: seaTime });
  scene.add(ground);

  const seaMat = new THREE.MeshStandardMaterial({ color: '#3f86ad', roughness: 0.6, emissive: '#000000' });
  seaMat.onBeforeCompile = shader => {
    shader.uniforms.uTime = seaTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSeaXZ;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSeaXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSeaXZ;\nuniform float uTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float w = sin(vSeaXZ.x * 0.35 + uTime * 1.1) + sin(vSeaXZ.y * 0.5 - uTime * 0.8) + sin((vSeaXZ.x + vSeaXZ.y) * 0.2 + uTime * 0.6);
        diffuseColor.rgb *= 0.75 + 0.18 * w;`);
  };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), seaMat);
  sea.position.y = map.waterLevel;
  setCharset(sea, CHARSET.TILDE);
  scene.add(sea);

  // --- Placement helpers -------------------------------------------------------
  const inst = new Instancer();
  const colliders = [];
  const occupied = new SpatialHash(8); // buildings/props already placed
  const _c = { nx: 0, nz: 0, depth: 0 };
  const h = (x, z) => terrain.heightAt(x, z);
  const nrm = { x: 0, y: 1, z: 0 };

  // Wind: foliage sways (see render/sway.js). [A, B] by shape — a canopy on
  // a trunk moves as a whole, rooted plants keep their base still.
  const SWAY = { canopy: [0.65, 0.35], bush: [0.5, 0.5], cone: [0, 1], row: [0, 0.55] };
  const swayOf = (geo, charset, cut) => {
    if (charset !== CHARSET.FOLIAGE) return null;
    if (geo === G.ball()) return cut ? SWAY.canopy : SWAY.bush;
    if (geo === G.cone()) return SWAY.cone;
    if (geo === G.block()) return SWAY.row;
    return null; // cacti stand still
  };
  const put = (geo, color, charset, x, y, z, sx, sy, sz, { yaw = 0, rx = 0, rz = 0, cut = false, shadow = true, sway } = {}) => {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, yaw, rz)), _s.set(sx, sy, sz));
    inst.add(geo, material(color, { cutaway: cut, sway: sway ?? swayOf(geo, charset, cut) }), charset, _m, { castShadow: shadow });
  };
  const solid = shape => { colliders.push(shape); occupied.insert(shape); return shape; };

  /** Lowest/highest ground under a rotated footprint. */
  const footprint = (x, z, hx, hz, yaw) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    let lo = Infinity, hi = -Infinity;
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
      const lx = a * hx, lz = b * hz;
      const y = h(x + lx * c + lz * s, z - lx * s + lz * c);
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    return { lo, hi };
  };
  // Road/pad edges in a coarse grid, for clearances beyond the surface
  // map's SDF range (it only knows distances up to SDF_RANGE).
  const FAR = 30, CELL = 20, edges = new Map();
  const edgeKey = (ix, iz) => ix * 100003 + iz;
  const addEdge = (e, x0, z0, x1, z1) => {
    for (let ix = Math.floor((x0 - FAR) / CELL); ix <= Math.floor((x1 + FAR) / CELL); ix++) {
      for (let iz = Math.floor((z0 - FAR) / CELL); iz <= Math.floor((z1 + FAR) / CELL); iz++) {
        const k = edgeKey(ix, iz);
        if (!edges.has(k)) edges.set(k, []);
        edges.get(k).push(e);
      }
    }
  };
  for (const t of terrain.trails) {
    const half = (t.width ?? 6) / 2;
    for (let i = 0; i < t.path.length - 1; i += 2) {
      const [ax, az] = t.path[i], [bx, bz] = t.path[Math.min(t.path.length - 1, i + 2)];
      addEdge({ ax, az, bx, bz, half }, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
    }
  }
  for (const zn of map.zones) {
    const [cx, cz] = zn.pos;
    addEdge({ ax: cx, az: cz, bx: cx, bz: cz, half: zn.r }, cx, cz, cx, cz);
  }
  /** Metres from (x, z) to the nearest road/pad edge (capped at FAR). */
  const roadGap = (x, z) => {
    let best = FAR;
    for (const e of edges.get(edgeKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const dx = e.bx - e.ax, dz = e.bz - e.az;
      const t = Math.max(0, Math.min(1, ((x - e.ax) * dx + (z - e.az) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - e.ax - dx * t, z - e.az - dz * t) - e.half);
    }
    return best;
  };

  /** True if a circle of radius r is off roads/pads and clear of placed objects. */
  const isClear = (x, z, r, roadMargin = 0.5) => {
    if (roadMargin > SDF_RANGE - 0.5) {
      if (roadGap(x, z) < r + roadMargin) return false;
    } else {
      for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
        if (surfaces.insideAt(x + dx, z + dz) > -roadMargin) return false;
      }
    }
    for (const s of occupied.query(x, z, r)) if (circleContact(s, x, z, r, _c)) return false;
    return true;
  };

  // Night light pools on the ground (lamps, lit windows): baked into one
  // world-sized texture the terrain shader adds as warm light after dusk.
  const lightSpots = [];
  const glow = (x, z, r, k = 1) => lightSpots.push([x, z, r, k]);

  // --- Buildings ---------------------------------------------------------------
  // Windows: dark glass by day; at night a share of them light up (the
  // material's glow follows the time of day, see update()).
  const windowLit = new THREE.MeshStandardMaterial({ color: '#2c313a', emissive: '#ffc35a', emissiveIntensity: 0, flatShading: true });
  const windowDark = material('#2c313a');
  function windows(x, z, yaw, w, d, floorY, floors, rand) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const n = Math.max(1, Math.floor((w - 1) / 2.2));
    for (const side of [-1, 1]) {
      for (let f = 0; f < floors; f++) {
        for (let i = 0; i < n; i++) {
          const lx = (i - (n - 1) / 2) * (w - 1) / n, lz = side * (d / 2 + 0.05);
          const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
          const lit = rand() < 0.55;
          _m.compose(_p.set(px, floorY + 1.1 + f * 3, pz), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(0.9, 1.2, 0.12));
          inst.add(G.block(), lit ? windowLit : windowDark, CHARSET.GOLD, _m, { castShadow: false });
          // Ground-floor light spills onto the street outside.
          if (lit && f === 0) glow(px + side * s * 1.6, pz + side * c * 1.6, 3.4, 0.55);
        }
      }
    }
  }

  // --- Shared architecture helpers (career places) -----------------------------------
  // Night lights: lamp heads glow with the time of day (see update()).
  const lampGlow = new THREE.MeshStandardMaterial({ color: '#3a3428', emissive: '#ffd89a', emissiveIntensity: 0, flatShading: true });
  /** Street lamp: pole + glowing head (lit at dusk/night). */
  function lampPost(x, z, { height = 4.5 } = {}) {
    if (!isClear(x, z, 0.3, 0.6)) return false;
    const y = h(x, z);
    put(G.block(), '#3b4048', CHARSET.WALL, x, y, z, 0.16, height, 0.16, { shadow: false });
    _m.compose(_p.set(x, y + height, z), _q.identity(), _s.set(0.55, 0.22, 0.55));
    inst.add(G.block(), lampGlow, CHARSET.GOLD, _m, { castShadow: false });
    glow(x, z, height * 1.7, 1);
    solid(circle(x, z, 0.2, height, y));
    return true;
  }
  /** Flat paving (drive-over) where the ground is level enough; returns false otherwise. */
  function paving(x, z, w, d, yaw, color, charset = CHARSET.FLOOR) {
    const { lo, hi } = footprint(x, z, w / 2, d / 2, yaw);
    if (hi - lo > 0.6) return false;
    put(G.block(), color, charset, x, hi - 0.06, z, w, 0.1, d, { yaw, shadow: false });
    return true;
  }
  /**
   * Modern building: main volume, vertical mullion stripes on the long faces
   * (curtain wall), a coloured band under the roof, roof parapet and HVAC
   * boxes, an entrance canopy on the front (local −z) face, lit windows.
   */
  function modernBlock(x, z, w, d, hgt, { yaw = 0, wall = '#8fb8d0', band = '#2f6fb5', rand = rng(1), canopy = true } = {}) {
    if (!boxClear(x, z, w, d, yaw, 0.8)) return null;
    const { lo } = footprint(x, z, w / 2, d / 2, yaw);
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const at = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
    put(G.block(), wall, CHARSET.WALL, x, lo - 0.4, z, w, hgt + 0.4, d, { yaw, cut: true });
    put(G.block(), band, CHARSET.GOLD, x, lo + hgt - 0.9, z, w + 0.12, 0.7, d + 0.12, { yaw, cut: true });
    put(G.block(), '#e9edf0', CHARSET.WALL, x, lo + hgt, z, w + 0.3, 0.45, d + 0.3, { yaw, cut: true });
    for (let mx = -w / 2 + 1.5; mx < w / 2 - 1; mx += 2.2) {
      for (const side of [-1, 1]) {
        const [px, pz] = at(mx, side * (d / 2 + 0.05));
        put(G.block(), '#dde6ec', CHARSET.WALL, px, lo + 0.4, pz, 0.18, hgt - 1.6, 0.1, { yaw, shadow: false });
      }
    }
    for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) {
      const [px, pz] = at((rand() - 0.5) * (w - 4), (rand() - 0.5) * (d - 3));
      put(G.block(), '#aab3bd', CHARSET.WALL, px, lo + hgt + 0.45, pz, 1.8, 1.0, 1.4, { yaw, shadow: false });
    }
    if (canopy) {
      const [px, pz] = at(0, -d / 2 - 1.2);
      put(G.block(), '#e9edf0', CHARSET.WALL, px, lo + 2.8, pz, 4.2, 0.25, 2.4, { yaw, shadow: false });
    }
    windows(x, z, yaw, w, d, lo, Math.max(1, Math.floor(hgt / 3) - 1), rand);
    solid(box(x, z, w / 2, d / 2, yaw, hgt + 0.45, lo - 0.4));
    return { lo, at };
  }

  function house(x, z, yaw, w, d, floors, rand, { flatRoof = false } = {}) {
    const { lo, hi } = footprint(x, z, w / 2, d / 2, yaw);
    const base = lo - 0.4;
    const wallH = hi - base + floors * 3;
    windows(x, z, yaw, w, d, hi, floors, rand);
    put(G.block(), pick(rand, HOUSE_WALLS), CHARSET.WALL, x, base, z, w, wallH, d, { yaw, cut: true });
    if (flatRoof) {
      put(G.block(), '#f4efe4', CHARSET.WALL, x, base + wallH, z, w + 0.4, 0.4, d + 0.4, { yaw, cut: true });
    } else {
      put(G.prism(), pick(rand, ROOFS), CHARSET.ROOF, x, base + wallH, z, d + 0.5, 1.4 + d * 0.12, w + 0.3,
        { yaw: yaw + Math.PI / 2, cut: true });
    }
    solid(box(x, z, w / 2, d / 2, yaw, wallH, base));
  }

  /** Rows of houses lining a trail on both sides. */
  /** True if a rotated w×d footprint is off roads/pads (by margin) and free of placed objects. */
  const boxClear = (x, z, w, d, yaw, margin = 0.3) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const ni = Math.max(4, Math.ceil(w)), nj = Math.max(4, Math.ceil(d)); // ~1 m sample spacing
    for (let i = 0; i <= ni; i++) for (let j = 0; j <= nj; j++) {
      const lx = (i / ni - 0.5) * w, lz = (j / nj - 0.5) * d;
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      if (surfaces.insideAt(px, pz) > -margin) return false;
      for (const o of occupied.query(px, pz, 0.3)) if (circleContact(o, px, pz, 0.3, _c)) return false;
    }
    return true;
  };

  function lineStreet(trail, { rand, sides = [-1, 1], gap = 0.4, setback = 0.8, floors = [2, 3], chance = 1, flatRoof = false, start = 6 }) {
    const { path, cum, length } = trail;
    for (const side of sides) {
      let s = start;
      while (s < length - 6) {
        const w = 5 + rand() * 3;
        const d = 6 + rand() * 3;
        const p = pointAt(path, cum, s + w / 2);
        const off = trail.width / 2 + setback + d / 2;
        // Perpendicular (left of travel = (tz, -tx)).
        const x = p.x + p.tz * off * side;
        const z = p.z - p.tx * off * side;
        const yaw = yawAlong(p.tx, p.tz);
        if (rand() < chance && boxClear(x, z, w, d, yaw, 0.3)) {
          const f = floors[0] + Math.floor(rand() * (floors[1] - floors[0] + 1));
          house(x, z, yaw, w, d, f, rand, { flatRoof });
        }
        s += w + gap;
      }
    }
  }

  const trail = id => terrain.trails.find(t => t.id === id);
  const zone = id => map.zones.find(z => z.id === id);

  // --- Paddock (spawn) ---------------------------------------------------------
  // Exits: valley road north (x=0), forest road west, town road north-east.
  {
    const [px, pz] = zone('paddock').pos;
    const y = h(px, pz);
    for (const dx of [-12, 12]) {
      const tx = px + dx, tz = pz - 15;
      put(G.block(), '#f2efe6', CHARSET.GLYPH, tx, y, tz, 6, 2.6, 5, { cut: true });
      put(G.prism(), '#d9483b', CHARSET.ROOF, tx, y + 2.6, tz, 6.4, 1.4, 5.4, { cut: true });
      solid(box(tx, tz, 3, 2.5, 0, 4, y));
    }
    for (const [dx, color] of [[-13, '#2f5d8c'], [13, '#e8e8e8']]) {
      put(G.block(), color, CHARSET.DEFAULT, px + dx, y, pz + 16, 2.6, 3.2, 9, { cut: true });
      solid(box(px + dx, pz + 16, 1.3, 4.5, 0, 3.2, y));
    }
    // "SERVICE ~/" arch over the north exit.
    const az = pz - 21;
    for (const dx of [-5.5, 5.5]) {
      put(G.block(), '#d9d9d9', CHARSET.GLYPH, px + dx, h(px + dx, az), az, 0.6, 5.5, 0.6, { cut: true });
      solid(circle(px + dx, az, 0.5, 5.5, h(px + dx, az)));
    }
    put(G.block(), '#d9483b', CHARSET.GOLD, px, h(px, az) + 4.4, az, 11.6, 1.2, 0.4, { cut: true, shadow: false });
    // Flags along the south edge.
    for (let i = -3; i <= 3; i++) {
      const fx = px + i * 5, fz = pz + 21;
      put(G.cylinder(), '#cfcfcf', CHARSET.WOOD, fx, h(fx, fz), fz, 0.08, 6, 0.08);
      put(G.block(), i % 2 ? '#3f7bff' : '#ffd166', CHARSET.GOLD, fx + 0.8, h(fx, fz) + 4.6, fz, 1.6, 1.2, 0.05, { shadow: false });
    }
  }

  // --- Garage (skills) ---------------------------------------------------------
  {
    const [gx, gz] = zone('garage').pos;
    const y = h(gx, gz);
    const wall = (x, z, w, d) => {
      put(G.block(), '#8f8a80', CHARSET.WALL, x, y - 0.2, z, w, 4.4, d, { cut: true });
      solid(box(x, z, w / 2, d / 2, 0, 4.2, y));
    };
    wall(gx, gz - 6, 11, 0.6);
    wall(gx - 5.5, gz - 2, 0.6, 8);
    wall(gx + 5.5, gz - 2, 0.6, 8);
    put(G.block(), '#6d6a64', CHARSET.ROOF, gx, y + 4.2, gz - 2, 12, 0.35, 9, { cut: true });
    // Tyre stacks.
    for (const [dx, n] of [[-3.8, 4], [-2.6, 3], [3.8, 5], [2.6, 2]]) {
      for (let i = 0; i < n; i++) {
        put(G.ring(), '#2b2b2b', CHARSET.CAR, gx + dx, y + 0.15 + i * 0.32, gz - 4.6, 0.45, 0.45, 1.3, { rx: Math.PI / 2 });
      }
    }
  }

  // --- Pit wall + radio tower (contact) ---------------------------------------
  {
    const [cx, cz] = zone('pitwall').pos;
    const y = h(cx, cz);
    put(G.block(), '#d9d9d9', CHARSET.WALL, cx - 1, y, cz - 4, 10, 1.2, 0.8);
    solid(box(cx - 1, cz - 4, 5, 0.4, 0, 1.2, y));
    for (let i = -2; i <= 2; i++) put(G.block(), '#1d2733', CHARSET.GLYPH, cx - 1 + i * 2, y + 1.2, cz - 4, 1.4, 0.9, 0.3);
    const tx = cx + 5, tz = cz - 5;
    put(G.cylinder(), '#bfc6cc', CHARSET.GLYPH, tx, y, tz, 0.35, 8, 0.35, { cut: true });
    for (const ry of [3, 5, 7]) put(G.ring(), '#ffd166', CHARSET.GOLD, tx, y + ry, tz, 0.9, 0.9, 1, { rx: Math.PI / 2 });
    put(G.cone(), '#ffd166', CHARSET.GOLD, tx, y + 8, tz, 0.5, 1.4, 0.5);
    solid(circle(tx, tz, 0.6, 9, y));
  }

  // --- Old town ------------------------------------------------------------------
  {
    const rand = rng(21);
    const [qx, qz] = zone('piazza').pos;
    const qy = h(qx, qz);
    // Fountain.
    put(G.cylinder(), STONE, CHARSET.ROCK, qx, qy, qz, 2.6, 0.7, 2.6);
    put(G.cylinder(), '#3f86ad', CHARSET.TILDE, qx, qy + 0.05, qz, 2.2, 0.7, 2.2, { shadow: false });
    put(G.cylinder(), STONE, CHARSET.ROCK, qx, qy, qz, 0.4, 2.4, 0.4);
    put(G.ball(), STONE, CHARSET.ROCK, qx, qy + 2.7, qz, 0.6, 0.6, 0.6);
    solid(circle(qx, qz, 2.7, 0.8, qy));

    // Church on the north side: nave + bell tower + spire.
    const cz = qz - 23;
    const { lo } = footprint(qx, cz, 4.5, 8, 0);
    put(G.block(), '#efe3c8', CHARSET.WALL, qx, lo - 0.5, cz, 9, 9 + qy - lo, 16, { cut: true });
    put(G.prism(), '#b5532f', CHARSET.ROOF, qx, qy + 8.5, cz, 9.6, 3.2, 16.4, { cut: true });
    solid(box(qx, cz, 4.5, 8, 0, 12, lo));
    const tx = qx + 7.5, tz = qz - 17;
    put(G.block(), '#e6d6b4', CHARSET.WALL, tx, h(tx, tz) - 0.3, tz, 4, 17, 4, { cut: true });
    put(G.spire(), '#9c4a2c', CHARSET.ROOF, tx, h(tx, tz) + 16.7, tz, 3.1, 5, 3.1, { cut: true });
    put(G.block(), '#2b2b2b', CHARSET.GLYPH, tx, h(tx, tz) + 13, tz + 2.02, 1.4, 2.2, 0.05, { shadow: false });
    solid(box(tx, tz, 2, 2, 0, 22, h(tx, tz)));

    // Rally HQ: ceremonial start arch at the top of the steep street + timing board.
    const ay = h(qx, qz + 12);
    for (const dx of [-5.2, 5.2]) {
      put(G.block(), '#2b2b2b', CHARSET.GLYPH, qx + dx, ay, qz + 12, 0.7, 5, 0.7, { cut: true });
      solid(circle(qx + dx, qz + 12, 0.5, 5, ay));
    }
    put(G.block(), '#ffd166', CHARSET.GOLD, qx, ay + 4.2, qz + 12, 11.4, 1.3, 0.4, { cut: true, shadow: false });
    put(G.block(), '#1d2733', CHARSET.GLYPH, qx + 11, qy, qz - 3, 1, 4.5, 6, { cut: true });
    solid(box(qx + 11, qz - 3, 0.5, 3, 0, 4.5, qy));

    // Town gate on the lower spiral.
    const town = trail('town');
    const g = pointAt(town.path, town.cum, 28);
    const gyaw = yawAlong(g.tx, g.tz);
    for (const side of [-1, 1]) {
      const off = town.width / 2 + 0.8;
      const x = g.x + g.tz * off * side, z = g.z - g.tx * off * side;
      put(G.block(), STONE, CHARSET.WALL, x, h(x, z) - 0.3, z, 1.4, 6, 1.4, { yaw: gyaw, cut: true });
      solid(circle(x, z, 0.9, 6, h(x, z)));
    }
    put(G.block(), STONE, CHARSET.WALL, g.x, h(g.x, g.z) + 4.6, g.z, 1.2, 1.4, town.width + 3, { yaw: gyaw, cut: true });

    // Houses lining the cobbled streets (contiguous facades).
    lineStreet(town, { rand, start: 34 });
    lineStreet(trail('town-steep'), { rand, start: 3, floors: [2, 4] });
  }

  // --- Coast ---------------------------------------------------------------------
  {
    const rand = rng(31);
    const coast = trail('coast');
    const { path, cum, length } = coast;
    // Sea wall on the downhill side, in short segments (gaps where other roads join).
    for (let s = 2; s < length - 2; s += 4.2) {
      const p = pointAt(path, cum, s);
      const off = coast.width / 2 + 0.9;
      const lx = p.x + p.tz * off, lz = p.z - p.tx * off;
      const rx = p.x - p.tz * off, rz = p.z + p.tx * off;
      const [x, z] = h(lx, lz) < h(rx, rz) ? [lx, lz] : [rx, rz];
      if (surfaces.insideAt(x, z) > -0.3) continue;
      const yaw = yawAlong(p.tx, p.tz);
      const y = h(x, z);
      put(G.block(), '#efe9dc', CHARSET.WALL, x, y - 0.3, z, 4, 1.2, 0.6, { yaw });
      solid(box(x, z, 2, 0.3, yaw, 0.9, y));
    }
    // Clinging pastel houses with flat roofs on the uphill side.
    const uphill = (() => {
      const p = pointAt(path, cum, length / 2);
      return h(p.x + p.tz * 6, p.z - p.tx * 6) > h(p.x - p.tz * 6, p.z + p.tx * 6) ? 1 : -1;
    })();
    lineStreet(coast, { rand, sides: [uphill], gap: 9, setback: 2.5, floors: [1, 3], chance: 0.55, flatRoof: true });
    // Lemon terraces and umbrella pines further uphill.
    for (let s = 4; s < length - 4; s += 3) {
      const p = pointAt(path, cum, s);
      for (const off of [17, 20, 23]) {
        if (rand() < 0.35) continue;
        const d = coast.width / 2 + off;
        const x = p.x + p.tz * d * uphill, z = p.z - p.tx * d * uphill;
        if (!isClear(x, z, 0.8, 1)) continue;
        put(G.ball(), rand() < 0.5 ? '#9bb53a' : '#c8d23c', CHARSET.FOLIAGE, x, h(x, z) + 0.6, z, 0.9, 0.8, 0.9);
      }
      if (rand() < 0.12) {
        const d = coast.width / 2 + 14 + rand() * 8;
        const x = p.x + p.tz * d * uphill, z = p.z - p.tx * d * uphill;
        if (isClear(x, z, 1.5, 1)) umbrellaPine(x, z, rand);
      }
    }
  }

  function umbrellaPine(x, z, rand) {
    const y = h(x, z);
    const th = 4 + rand() * 2.5;
    put(G.trunk(), '#7a5a3a', CHARSET.WOOD, x, y, z, 1, th, 1, { cut: true });
    put(G.ball(), '#4f6b3a', CHARSET.FOLIAGE, x, y + th + 0.6, z, 3.2 + rand(), 1.1, 3.2 + rand(), { cut: true });
    solid(circle(x, z, 0.5, th, y));
  }

  // --- Lookout headland (about) ---------------------------------------------------
  {
    const [lx, lz] = zone('lookout').pos;
    const y = h(lx, lz);
    put(G.block(), '#8a6a48', CHARSET.WOOD, lx, y, lz + 3, 6, 0.25, 3);
    for (const dx of [-2.8, 0, 2.8]) put(G.block(), '#8a6a48', CHARSET.WOOD, lx + dx, y, lz + 4.4, 0.15, 1.1, 0.15);
    put(G.block(), '#8a6a48', CHARSET.WOOD, lx, y + 1, lz + 4.4, 5.8, 0.12, 0.12);
    put(G.cylinder(), '#cfcfcf', CHARSET.WOOD, lx - 4, y, lz - 2, 0.08, 7, 0.08);
    put(G.block(), '#4dd9e8', CHARSET.GOLD, lx - 3.2, y + 5.6, lz - 2, 1.6, 1.1, 0.05, { shadow: false });
    for (let i = 0; i < 4; i++) {
      const s = 0.9 - i * 0.18;
      put(G.rock(), '#9aa3ad', CHARSET.ROCK, lx + 4, y + 0.4 + i * 0.6, lz - 2, s, s * 0.7, s, { yaw: i });
    }
    solid(circle(lx + 4, lz - 2, 1, 2.5, y));
    const rand = rng(41);
    for (let i = 0; i < 6; i++) {
      const a = rand() * Math.PI * 2, r = 9 + rand() * 6;
      const x = lx + Math.cos(a) * r, z = lz + Math.sin(a) * r;
      if (h(x, z) > 3 && isClear(x, z, 1.5)) umbrellaPine(x, z, rand);
    }
  }

  // --- Circuit: grandstand on the infield, tyre wall at the hairpin ------------------
  if (trail('circuit')) {
    const rand = rng(51);
    // Grandstand facing the main straight (x≈18), 3 tiers with a crowd.
    const gx = 29, z0 = -92, z1 = -64;
    const gy = Math.min(h(gx, z0), h(gx, z1), h(gx + 6, z0), h(gx + 6, z1));
    for (let tier = 0; tier < 3; tier++) {
      const x = gx + tier * 2, top = 0.8 + tier * 1.1;
      put(G.block(), '#c9ced6', CHARSET.WALL, x, gy - 0.3, (z0 + z1) / 2, 2, top + 0.3, z1 - z0, { cut: true });
      for (let z = z0 + 0.8; z < z1; z += 1.1) {
        if (rand() < 0.25) continue;
        const c = ['#ff6b6b', '#ffd166', '#4dabf7', '#5dff8a', '#f4f4f4', '#c77dff'][Math.floor(rand() * 6)];
        put(G.block(), c, CHARSET.DEFAULT, x - 0.3, gy + top, z + rand() * 0.3, 0.5, 0.9, 0.5, { cut: true, shadow: false });
      }
    }
    put(G.block(), '#2b2b2b', CHARSET.GLYPH, gx + 2, gy + 3.8, (z0 + z1) / 2, 7, 0.3, z1 - z0 + 1, { cut: true }); // roof
    solid(box(gx + 2, (z0 + z1) / 2, 3.5, (z1 - z0) / 2, 0, 4, gy));
    // Tyre wall outside the hairpin.
    for (let x = 14; x <= 48; x += 1.1) {
      for (let row = 0; row < 3; row++) {
        const z = -121 - (x > 30 ? (x - 30) * -0.2 : 0);
        put(G.ring(), row % 2 ? '#f4f4f4' : '#2b2b2b', CHARSET.CAR, x, h(x, z) + 0.15 + row * 0.3, z, 0.5, 0.5, 1.4, { rx: Math.PI / 2, shadow: false });
      }
    }
    solid(box(31, -121, 17, 0.6, 0, 1, h(31, -121)));
  }

  // --- Grand Prix: pit building, grandstand, start gantry, braking boards, tyre walls
  if (trail('gp')) {
    const gpt = trail('gp');
    const rand = rng(71);
    const y = 6;
    // Pit building north of the pit lane: one long block with dark garage bays.
    put(G.block(), '#d9dde3', CHARSET.WALL, 10, y - 0.2, 266, 230, 5.5, 8, { cut: true });
    solid(box(10, 266, 115, 4, 0, 5.5, y));
    for (let x = -95; x <= 115; x += 14) put(G.block(), '#1d2733', CHARSET.GLYPH, x, y, 270.05, 9, 3.5, 0.1, { shadow: false });
    // Grandstand on the infield, facing the main straight.
    for (let tier = 0; tier < 4; tier++) {
      const z = 322 + tier * 2, top = 0.8 + tier * 1.1;
      put(G.block(), '#c9ced6', CHARSET.WALL, -20, y - 0.3, z, 240, top + 0.3, 2, { cut: true });
      for (let x = -138; x < 98; x += 1.1) {
        if (rand() < 0.3) continue;
        const c = ['#ff6b6b', '#ffd166', '#4dabf7', '#5dff8a', '#f4f4f4', '#c77dff'][Math.floor(rand() * 6)];
        put(G.block(), c, CHARSET.DEFAULT, x, y + top, z - 0.3, 0.5, 0.9, 0.5, { cut: true, shadow: false });
      }
    }
    put(G.block(), '#2b2b2b', CHARSET.GLYPH, -20, y + 5.2, 325, 242, 0.3, 9, { cut: true });
    solid(box(-20, 325, 121, 4.5, 0, 5, y));
    // Start gantry over the line: two posts, a beam, five red lights.
    const p0 = pointAt(gpt.path, gpt.cum, 0);
    const yaw0 = yawAlong(p0.tx, p0.tz);
    for (const sgn of [-1, 1]) {
      const x = p0.x + p0.tz * 9 * sgn, z = p0.z - p0.tx * 9 * sgn;
      put(G.block(), '#2b2b2b', CHARSET.GLYPH, x, y, z, 0.6, 9, 0.6, { yaw: yaw0, cut: true });
      solid(circle(x, z, 0.5, 9, y));
    }
    put(G.block(), '#2b2b2b', CHARSET.GLYPH, p0.x, y + 8, p0.z, 0.8, 1, 18.6, { yaw: yaw0, cut: true, shadow: false });
    for (let i = -2; i <= 2; i++) {
      put(G.block(), '#ff2020', CHARSET.KERB, p0.x + p0.tz * i * 1.6, y + 7.6, p0.z - p0.tx * i * 1.6, 0.9, 0.6, 0.9, { shadow: false });
    }
    // Braking boards before T1 (left/outside of the approach): 150 / 100 / 50 m.
    for (const [d, n] of [[130, 3], [180, 2], [230, 1]]) {
      const p = pointAt(gpt.path, gpt.cum, d);
      const off = gpt.width / 2 + 5;
      const x = p.x + p.tz * off, z = p.z - p.tx * off;
      put(G.block(), '#f4f4f4', CHARSET.WALL, x, y, z, 0.3, 1.2, 1.4, { yaw: yawAlong(p.tx, p.tz) });
      for (let k = 0; k < n; k++) put(G.block(), '#1a1a1a', CHARSET.GLYPH, x, y + 0.25 + k * 0.32, z, 0.32, 0.12, 1.2, { yaw: yawAlong(p.tx, p.tz), shadow: false });
    }
    // Tyre wall outside T1 (south of the link road, which is T1's straight-on escape).
    for (let z = 312; z <= 350; z += 1.1) {
      for (let row = 0; row < 3; row++) {
        put(G.ring(), row % 2 ? '#f4f4f4' : '#2b2b2b', CHARSET.CAR, 352, y + 0.15 + row * 0.3, z, 0.5, 0.5, 1.4, { rx: Math.PI / 2, shadow: false });
      }
    }
    solid(box(352, 331, 0.6, 19, 0, 1, y));
  }

  // --- Special stages: start arch + box, split gates, chequered finish -------------
  for (const raw of map.stages ?? []) {
    const tr = trail(raw.trail);
    const st = { ...raw, to: raw.to < 0 ? tr.length + raw.to : raw.to };
    const at = d => pointAt(tr.path, tr.cum, d);
    const side = (p, off) => [p.x + p.tz * off, p.z - p.tx * off];
    const gate = (d, postColor, beam) => {
      const p = at(d);
      const yaw = yawAlong(p.tx, p.tz);
      const off0 = tr.width / 2 + 2; // clear of the road: cars have a ~1.4 m collision radius
      let top = -Infinity, off = off0;
      for (const sgn of [-1, 1]) {
        // In narrow streets the facades are closer: step the post in rather
        // than standing it inside a house.
        let x, z;
        for (const o of [off0, off0 - 0.6, off0 - 1.1]) {
          [x, z] = side(p, o * sgn);
          if (isClear(x, z, 0.35, 0.2)) { off = Math.min(off, o); break; }
          x = null;
        }
        if (x === null) continue;
        const y = h(x, z);
        put(G.block(), postColor, CHARSET.GLYPH, x, y - 0.2, z, 0.5, 5.4, 0.5, { yaw, cut: true });
        solid(circle(x, z, 0.4, 5.4, y));
        top = Math.max(top, y + 4.6);
      }
      if (beam) beam(p, yaw, top, off);
    };
    // Start: arch in the stage colour, cones marking the start box behind it.
    gate(st.from + 3, '#2b2b2b', (p, yaw, top, off) =>
      put(G.block(), st.hue, CHARSET.GOLD, p.x, top, p.z, 1.2, 1.1, off * 2 + 0.6, { yaw, cut: true, shadow: false }));
    const box = at(st.from);
    for (const [a, b] of [[-3, -3], [-3, 3], [3, -3], [3, 3]]) {
      const x = box.x + box.tx * a + box.tz * b, z = box.z + box.tz * a - box.tx * b;
      put(G.cone(), '#ff7a1a', CHARSET.CHEVRON, x, h(x, z), z, 0.25, 0.6, 0.25, { shadow: false });
    }
    // Splits: plain posts with a gold flag.
    for (const d of st.splits) {
      gate(d, '#d9d9d9', (p, yaw, top) => {
        const [x, z] = side(p, tr.width / 2 + 2);
        put(G.block(), '#ffd166', CHARSET.GOLD, x, top - 0.4, z, 0.05, 0.9, 1.3, { yaw, shadow: false });
      });
    }
    // Finish: chequered beam (alternating black/white blocks read as a pattern of glyphs/blanks).
    gate(st.to, '#2b2b2b', (p, yaw, top, off) => {
      const n = 10, w = (off * 2 + 0.6) / n;
      for (let i = 0; i < n; i++) {
        for (let r = 0; r < 2; r++) {
          const d = -off - 0.3 + w * (i + 0.5);
          const x = p.x + p.tz * d, z = p.z - p.tx * d;
          put(G.block(), (i + r) % 2 ? '#f4f4f4' : '#1a1a1a', CHARSET.GLYPH, x, top + r * 0.55, z, 0.6, 0.55, w, { yaw, cut: true, shadow: false });
        }
      }
    });
  }

  // --- 24H loop: start gate, milestone boards, reflectors ----------------------------
  let route = null;
  if (map.loop24) {
    route = buildRoute(map.loop24.route, terrain.trails);
    // Glow material: readable at night when everything else goes dark.
    const glow = new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb020', emissiveIntensity: 0.8 });
    const putGlow = (x, y, z, sx, sy, sz, yaw) => {
      _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(sx, sy, sz));
      inst.add(G.block(), glow, CHARSET.GOLD, _m, { castShadow: false });
    };
    const at = d => pointAt(route.path, route.cum, d);
    const side = (p, off) => [p.x + p.tz * off, p.z - p.tx * off];
    const W = 8; // half of the widest road on the route (GP 12 m) + 2 m clearance

    // Start gate "24H".
    {
      const p = at(map.loop24.start);
      const yaw = yawAlong(p.tx, p.tz);
      for (const sgn of [-1, 1]) {
        const [x, z] = side(p, (W + 0.5) * sgn);
        put(G.block(), '#1d2733', CHARSET.GLYPH, x, h(x, z) - 0.2, z, 0.6, 6, 0.6, { yaw, cut: true });
        solid(circle(x, z, 0.5, 6, h(x, z)));
      }
      putGlow(p.x, h(p.x, p.z) + 5.2, p.z, 1, 1.2, W * 2 + 1.6, yaw);
    }
    // Milestone boards (right-hand side), spaced like createLoop24 spaces them.
    const span = route.length - map.loop24.start;
    milestones.forEach((m, i) => {
      const d = map.loop24.start + span * (m.at ?? (i + 1) / (milestones.length + 1));
      const p = at(d);
      const yaw = yawAlong(p.tx, p.tz);
      // First clear spot off the road (roads can bend away from the route line,
      // e.g. chicanes), trying farther out and then the other side.
      let x, z;
      for (const off of [-(W + 2), -(W + 6), W + 2, W + 6, -(W + 12), W + 12]) {
        [x, z] = side(p, off);
        if (isClear(x, z, 1.5, 2)) break;
      }
      const y = h(x, z);
      put(G.block(), '#2b2b2b', CHARSET.WOOD, x, y, z, 0.25, 2.2, 0.25, { yaw });
      putGlow(x, y + 2.2, z, 2.6, 1.4, 0.2, yaw + Math.PI / 2);
      solid(circle(x, z, 0.4, 3.5, y));
    });
    // Reflector posts every 20 m along the long straight (the night leg).
    const night = trail('straight');
    if (night) {
      for (let d = 6; d < night.length - 6; d += 20) {
        const p = pointAt(night.path, night.cum, d);
        for (const sgn of [-1, 1]) {
          const [x, z] = side(p, (night.width / 2 + 2.5) * sgn);
          if (!isClear(x, z, 0.3, 0.3)) continue;
          put(G.block(), '#efefef', CHARSET.WALL, x, h(x, z), z, 0.15, 0.9, 0.15);
          putGlow(x, h(x, z) + 0.75, z, 0.18, 0.15, 0.18, 0);
        }
      }
    }
  }

  // --- Red/white marker poles along roads that need them (snow) -------------------
  for (const t of terrain.trails.filter(tr => tr.poles)) {
    let n = 0;
    for (let d = 5; d < t.length - 5; d += 15) {
      const p = pointAt(t.path, t.cum, d);
      for (const sgn of [-1, 1]) {
        const off = t.width / 2 + 2;
        const x = p.x + p.tz * off * sgn, z = p.z - p.tx * off * sgn;
        if (!isClear(x, z, 0.2, 0.5)) continue;
        put(G.block(), (n++ % 2) ? '#ff4040' : '#f4f4f4', CHARSET.KERB, x, h(x, z), z, 0.12, 1.1, 0.12, { shadow: false });
      }
    }
  }

  // Per-frame animations for props (blinking lights, moving machines...).
  const animators = [];

  /**
   * A small truck/van that drives a trail back and forth on the right-hand
   * side, pausing at `stops` (metres along the trail). Visual only (no collider).
   */
  /**
   * Truck/van model (cab at local −z): chassis, six wheels, cab with a dark
   * windscreen, a box body with a coloured stripe, and a rear lift.
   */
  function truckModel({ cab = '#3c8c4a', box: boxColor = '#eef1f3', stripe = cab } = {}) {
    const g = new THREE.Group();
    const part = (geo, w, hh, d, x, y, z, color, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, material(color));
      m.scale.set(w, hh, d);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      m.castShadow = true;
      g.add(m);
    };
    part(G.block(), 2.3, 0.4, 6.4, 0, 0.45, -0.2, '#2b2b2b');                // chassis
    for (const wz of [-2.4, 0.9, 2.1]) {
      for (const wx of [-1.15, 1.15]) part(G.cylinder(), 0.5, 0.35, 0.5, wx + (wx > 0 ? -0.18 : 0.18), 0.5, wz, '#1a1a1a', 0, Math.PI / 2);
    }
    part(G.block(), 2.3, 1.9, 1.7, 0, 0.8, -2.55, cab);                       // cab
    part(G.block(), 2.1, 0.7, 0.08, 0, 1.75, -3.42, '#20262e');               // windscreen
    part(G.block(), 2.4, 2.5, 4.3, 0, 0.85, 0.95, boxColor);                  // body
    part(G.block(), 2.44, 0.4, 4.34, 0, 1.6, 0.95, stripe);                   // stripe
    part(G.block(), 2.2, 1.6, 0.4, 0, 1.0, 3.25, '#6b7684');                  // rear lift
    setCharset(g, CHARSET.WALL);
    return g;
  }

  // Scripted vehicles on the career roads (the collection truck, the plant's
  // delivery truck): game/traffic.js drives them, with colliders.
  const patrols = [];

  // --- Career 1: KETI research campus ------------------------------------------------
  // Watch-face plaza (hour markers, hands that follow the in-game clock), glass
  // lab blocks to the north, an antenna mast and a heart-rate board.
  const dialHands = [];
  {
    const zk = zone('keti');
    if (zk) {
      const [cx, cz] = zk.pos;
      const y = h(cx, cz);
      // Hour markers painted on the plaza (flat, drive-over); lume glows at night.
      const lume = new THREE.MeshStandardMaterial({ color: '#f2f2f2', emissive: '#9dffb0', emissiveIntensity: 0, flatShading: true });
      const lumeGold = new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffe39a', emissiveIntensity: 0, flatShading: true });
      animators.push((dt, t, look) => { lume.emissiveIntensity = lumeGold.emissiveIntensity = look ? look.lights * 1.4 : 0; });
      const flat = (mat, x, z, w, d, yaw, lift = 0.05) => {
        _m.compose(_p.set(x, h(x, z) + lift, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(w, 0.18, d));
        inst.add(G.block(), mat, CHARSET.GOLD, _m, { castShadow: false });
      };
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const big = i % 3 === 0;
        const r = zk.r - 4;
        flat(big ? lumeGold : lume, cx + Math.sin(a) * r, cz - Math.cos(a) * r, big ? 1.6 : 0.9, big ? 4 : 2.4, -a);
      }
      // Sub-dials (chronograph): small tick rings at 6 and 9 o'clock; the one
      // at 9 has a running seconds hand. Date window at 3 o'clock.
      const subSecond = [];
      for (const [ox, oz, running] of [[0, 11.5, false], [-11.5, 0, true]]) {
        const sx = cx + ox, sz = cz + oz;
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          flat(lume, sx + Math.sin(a) * 3.2, sz - Math.cos(a) * 3.2, 0.22, k % 4 ? 0.5 : 1.0, -a, 0.08);
        }
        put(G.cylinder(), '#3a414b', CHARSET.GLYPH, sx, h(sx, sz), sz, 4.4, 0.04, 4.4, { shadow: false });
        put(G.cylinder(), '#c9ccd2', CHARSET.GOLD, sx, h(sx, sz), sz, 4.6, 0.035, 4.6, { shadow: false }); // silver ring
        if (running) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 3.0).translate(0, 0.06, -1.5), material('#ff4d6d'));
          m.position.set(sx, h(sx, sz) + 0.2, sz);
          setCharset(m, CHARSET.GOLD);
          scene.add(m);
          subSecond.push(m);
        }
      }
      animators.push((dt, t) => { for (const m of subSecond) m.rotation.y = -((Math.floor(t) % 60) / 60) * Math.PI * 2; });
      flat(material('#f2f2f2'), cx + 13, cz, 3.2, 2.2, 0, 0.07);
      flat(material('#1d2127'), cx + 13, cz, 1.6, 1.2, 0, 0.1);
      // Hands: real meshes, turned every frame in update().
      const hand = (len, wid, color) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(wid, 0.2, len).translate(0, 0.1, -len / 2), material(color));
        m.position.set(cx, y + 0.3 + dialHands.length * 0.12, cz); // above the PULSE road crossing the dial
        m.receiveShadow = true;
        setCharset(m, CHARSET.GOLD);
        scene.add(m);
        dialHands.push(m);
      };
      hand(zk.r * 0.5, 2.2, '#ffd166'); // hour
      hand(zk.r * 0.78, 1.2, '#f2f2f2'); // minute
      put(G.cylinder(), '#2b2b2b', CHARSET.GLYPH, cx, y, cz, 1.6, 0.6, 1.6, { shadow: false });
      // Bezel: a dark ring painted at the plaza's rim with 60 minute ticks.
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2, r = zk.r - 1.2;
        const bx = cx + Math.sin(a) * r, bz = cz - Math.cos(a) * r;
        put(G.block(), '#1d2127', CHARSET.WALL, bx, h(bx, bz) + 0.03, bz, 2.7, 0.08, 2.2, { yaw: -a, shadow: false });
        if (i % 5) {
          const tr = zk.r - 1.2;
          put(G.block(), '#d6dde3', CHARSET.GOLD, cx + Math.sin(a) * tr, h(bx, bz) + 0.12, cz - Math.cos(a) * tr, 0.25, 0.05, 1.1, { yaw: -a, shadow: false });
        }
      }
      // Crown at 2 o'clock (with two pushers either side), just outside the rim.
      for (const [ang, len, rad] of [[Math.PI / 3, 3.2, 1.4], [Math.PI / 3 - 0.22, 1.6, 0.55], [Math.PI / 3 + 0.22, 1.6, 0.55]]) {
        const r = zk.r + len / 2;
        const kx = cx + Math.sin(ang) * r, kz = cz - Math.cos(ang) * r;
        if (!isClear(kx, kz, rad, 0.5)) continue;
        put(G.cylinder(), '#c9ccd2', CHARSET.WALL, kx - Math.sin(ang) * len / 2, h(kx, kz) + rad, kz + Math.cos(ang) * len / 2,
          rad, len, rad, { yaw: -ang, rx: Math.PI / 2 });
        solid(circle(kx, kz, rad, rad * 2, h(kx, kz)));
      }

      // Labs: curtain-wall blocks facing the plaza (fronts to the south), each
      // with its own colour band; the east one carries a sensor-test dome.
      modernBlock(90, -104, 16, 9, 9, { yaw: Math.PI, band: '#ff4d6d', rand: rng(901) });
      const main = modernBlock(123, -106, 18, 10, 12, { yaw: Math.PI, band: '#2f6fb5', rand: rng(902) });
      if (main) {
        // Antenna mast on the main lab, light blinking.
        const ry = main.lo + 12.45;
        put(G.cylinder(), '#c9ccd2', CHARSET.WALL, 129, ry, -108, 0.15, 9, 0.15, { shadow: false });
        const lamp = new THREE.Mesh(G.ball(), new THREE.MeshStandardMaterial({ color: '#40121a', emissive: '#ff4d6d', emissiveIntensity: 0 }));
        lamp.position.set(129, ry + 9.2, -108);
        lamp.scale.setScalar(0.4);
        setCharset(lamp, CHARSET.GOLD);
        scene.add(lamp);
        animators.push((dt, t) => { lamp.material.emissiveIntensity = (t % 1.4) < 0.25 ? 2.2 : 0.1; }); // aircraft-warning blink
      }
      const test = modernBlock(153, -104, 13, 9, 7, { yaw: Math.PI, wall: '#e9edf0', band: '#5dff8a', rand: rng(903) });
      if (test) put(G.ball(), '#cfe8f0', CHARSET.ROOF, 153, test.lo + 7.4, -104, 3.4, 2.6, 3.4, { cut: true });

      // Campus walk along the lab fronts: paving, lamps and benches.
      for (let x = 78; x <= 164; x += 4) paving(x, -97.6, 4.1, 2.8, 0, '#cfc8b8');
      for (let x = 82; x <= 164; x += 14) lampPost(x, -95.9);
      for (let x = 89; x <= 160; x += 14) {
        if (!isClear(x, -95.9, 0.8, 0.6)) continue;
        put(G.block(), '#8a6a4a', CHARSET.WOOD, x, h(x, -95.9), -95.9, 1.8, 0.45, 0.55);
        solid(box(x, -95.9, 0.9, 0.3, 0, 0.5, h(x, -95.9)));
      }

      // Campus walk: a row of round trees between the labs and the road.
      const roundTree = (x, z, rand) => {
        if (!isClear(x, z, 1.4, 1.5)) return;
        const y = h(x, z), s = 1.1 + rand() * 0.4;
        put(G.trunk(), '#5a4030', CHARSET.WOOD, x, y, z, 0.8, 1.6, 0.8);
        put(G.ball(), rand() < 0.5 ? '#4f8a4a' : '#5c9850', CHARSET.FOLIAGE, x, y + 1.6 + s, z, s, s * 1.1, s, { cut: true });
        solid(circle(x, z, 0.4, 3.5, y));
      };
      const trand = rng(4242);
      for (let x = 78; x <= 166; x += 7) roundTree(x, -93.2 + (trand() - 0.5) * 0.8, trand);

      // Staff car park: painted bays and a few parked cars, wherever it fits.
      for (const [px, pz] of [[18, -104], [150, -54], [84, -52]]) {
        if (!boxClear(px, pz, 18, 11, 0, 1.2)) continue;
        const py = h(px, pz);
        put(G.block(), '#4a4f57', CHARSET.FLOOR, px, py - 0.05, pz, 18, 0.12, 11, { shadow: false });
        const crand = rng(px * 7 + 3);
        for (let i = 0; i < 6; i++) {
          const bx = px - 7.5 + i * 3;
          put(G.block(), '#e6e6e6', CHARSET.GOLD, bx - 1.5, py + 0.03, pz - 2.5, 0.12, 0.05, 4.5, { shadow: false });
          if (crand() < 0.65) {
            const col = ['#d9483b', '#3f6fb5', '#e8e8e8', '#2b2b2b', '#c9a227'][Math.floor(crand() * 5)];
            put(G.block(), col, CHARSET.CAR, bx, py, pz - 2.5, 1.7, 1.2, 3.8);
            put(G.block(), '#20262e', CHARSET.CAR, bx, py + 1.2, pz - 2.7, 1.5, 0.5, 2);
            solid(box(bx, pz - 2.5, 0.85, 1.9, 0, 1.7, py));
          }
        }
        break;
      }

      // Heart-rate board facing the dial from the south, a glowing ECG trace.
      const bx = cx, bz = cz + zk.r + 6, by = h(bx, bz);
      const beat = new THREE.MeshStandardMaterial({ color: '#3a1018', emissive: '#ff4d6d', emissiveIntensity: 1.2, flatShading: true });
      // The trace pulses at ~72 bpm: a sharp flash that decays.
      animators.push((dt, t) => { const ph = (t * 1.2) % 1; beat.emissiveIntensity = 0.35 + 2.2 * Math.exp(-ph * 9); });
      for (const dx of [-6.5, 6.5]) {
        put(G.block(), '#2b2b2b', CHARSET.GLYPH, bx + dx, by, bz, 0.4, 5.5, 0.4);
        solid(circle(bx + dx, bz, 0.4, 5.5, by));
      }
      put(G.block(), '#14181c', CHARSET.GLYPH, bx, by + 2.2, bz, 13.6, 3.4, 0.3);
      // The heartbeat road's centre line is the same pulsing trace.
      const pulse = trail('pulse');
      if (pulse) {
        for (let d = 2; d < pulse.length - 2; d += 2) {
          const p = pointAt(pulse.path, pulse.cum, d);
          _m.compose(_p.set(p.x, pulse.profileAt(d) + 0.05, p.z), _q.setFromEuler(_e.set(0, Math.atan2(p.tx, p.tz), 0)), _s.set(0.3, 0.06, 1.5));
          inst.add(G.block(), beat, CHARSET.GOLD, _m, { castShadow: false });
        }
      }
      const wave = [[-6, 0], [-3.4, 0], [-3, 0.3], [-2.6, 0], [-1.6, 0], [-1.2, -0.4], [-0.6, 1.4], [0, -0.8], [0.4, 0], [1.8, 0], [2.4, 0.4], [3, 0], [6, 0]];
      for (let i = 0; i < wave.length - 1; i++) {
        const [x0, y0] = wave[i], [x1, y1] = wave[i + 1];
        const len = Math.hypot(x1 - x0, y1 - y0);
        _m.compose(_p.set(bx + (x0 + x1) / 2, by + 3.6 + (y0 + y1) / 2, bz - 0.2),
          _q.setFromEuler(_e.set(0, 0, Math.atan2(y1 - y0, x1 - x0))), _s.set(len, 0.18, 0.1));
        inst.add(G.box(), beat, CHARSET.GOLD, _m, { castShadow: false });
      }
    }
  }

  // --- Career 2: Zero One depot ------------------------------------------------------
  // Food-waste reducers (drums) in the yard, a control tower with screens,
  // parked collection trucks, and a wheelie bin at each pickup split.
  {
    const zd = zone('zeroone'), route = trail('collect');
    if (zd && route) {
      const screen = new THREE.MeshStandardMaterial({ color: '#0f2a1a', emissive: '#7bd389', emissiveIntensity: 0.9, flatShading: true });
      // Bin stations along the route: three bins under a little roof.
      for (const sp of [70, 140, 210, 280, 340]) {
        const p = pointAt(route.path, route.cum, sp);
        const off = route.width / 2 + 2.2;
        const x = p.x - p.tz * off, z = p.z + p.tx * off;
        const yaw = yawAlong(p.tx, p.tz);
        if (!boxClear(x, z, 4.2, 1.8, yaw, 0.6)) continue;
        const y = h(x, z), c = Math.cos(yaw), sn = Math.sin(yaw);
        for (const [i, col] of [['#3c8c4a', -1.3], ['#3c8c4a', 0], ['#2f6fb5', 1.3]].map(([c0, o]) => [o, c0])) {
          const bx = x + i * c, bz = z - i * sn;
          put(G.block(), col, CHARSET.WALL, bx, y, bz, 1.0, 1.15, 0.95, { yaw });
          put(G.block(), '#245a2f', CHARSET.WALL, bx, y + 1.15, bz, 1.06, 0.12, 1.0, { yaw });
        }
        for (const o of [-2, 2]) put(G.block(), '#6b7684', CHARSET.WALL, x + o * c + 0.7 * sn, y, z - o * sn + 0.7 * c, 0.12, 2.2, 0.12, { yaw, shadow: false });
        put(G.block(), '#9aa3ad', CHARSET.ROOF, x, y + 2.2, z, 4.6, 0.12, 2.2, { yaw });
        solid(box(x, z, 2.1, 0.9, yaw, 2.3, y));
      }
      // Reducer machines under the shed: appliance body, hopper lid on top,
      // a green status display and an output chute.
      for (const dz of [-8, 0, 8]) {
        const x = zd.pos[0] + 19, z = zd.pos[1] + dz;
        if (!boxClear(x, z, 4.2, 3, 0, 1)) continue;
        const y = h(x, z);
        put(G.block(), '#d9dee3', CHARSET.WALL, x, y, z, 3.6, 2.2, 2.6);
        put(G.block(), '#8a9099', CHARSET.WALL, x - 0.5, y + 2.2, z, 2.2, 0.35, 2.0);          // hopper lid
        put(G.block(), '#5f666f', CHARSET.WALL, x - 0.5, y + 2.55, z + 0.8, 1.6, 0.25, 0.15);  // lid hinge
        _m.compose(_p.set(x - 1.82, y + 1.4, z - 0.5), _q.setFromEuler(_e.set(0, Math.PI / 2, 0)), _s.set(0.9, 0.6, 0.06));
        inst.add(G.block(), screen, CHARSET.GOLD, _m, { castShadow: false });                     // display
        put(G.block(), '#6b7684', CHARSET.WALL, x + 2.0, y + 0.4, z, 0.6, 0.8, 1.0);            // chute
        put(G.block(), '#5a4030', CHARSET.DIRT, x + 2.4, y, z, 0.9, 0.5, 1.0, { shadow: false }); // output
        solid(box(x, z, 2.1, 1.3, 0, 2.6, y));
      }
      // Control tower: windows, a green band, screens on every side, antenna.
      {
        const x = zd.pos[0] - 16, z = zd.pos[1] - 20;
        if (boxClear(x, z, 7, 7, 0, 1)) {
          const { lo } = footprint(x, z, 3.5, 3.5, 0);
          put(G.block(), '#d8dde2', CHARSET.WALL, x, lo - 0.4, z, 7, 11, 7, { cut: true });
          put(G.block(), '#3c8c4a', CHARSET.GOLD, x, lo + 9.6, z, 7.12, 0.6, 7.12, { cut: true });
          put(G.block(), '#2b2f36', CHARSET.WALL, x, lo + 10.6, z, 7.6, 0.5, 7.6, { cut: true });
          put(G.cylinder(), '#c9ccd2', CHARSET.WALL, x + 2.5, lo + 11.1, z - 2.5, 0.1, 4, 0.1, { shadow: false });
          windows(x, z, 0, 7, 7, lo, 2, rng(311));
          for (const [dx, dz, yaw] of [[0, -3.55, 0], [0, 3.55, Math.PI], [3.55, 0, -Math.PI / 2], [-3.55, 0, Math.PI / 2]]) {
            _m.compose(_p.set(x + dx, lo + 7.2, z + dz), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(5, 2.0, 0.1));
            inst.add(G.block(), screen, CHARSET.GOLD, _m, { castShadow: false });
          }
          solid(box(x, z, 3.5, 3.5, 0, 11, lo - 0.4));
        }
      }
      // Parked trucks (same model as the one on the route).
      const parked = (x, z, yaw) => {
        if (!boxClear(x, z, 2.6, 7, yaw, 0.6)) return;
        const t = truckModel();
        t.position.set(x, h(x, z), z);
        t.rotation.y = yaw;
        scene.add(t);
        solid(box(x, z, 1.3, 3.5, yaw, 3.2, h(x, z)));
      };
      parked(zd.pos[0] - 6, zd.pos[1] + 24, 0);
      parked(zd.pos[0] + 2, zd.pos[1] + 24, 0);

      const [dx0, dz0] = zd.pos;
      // Open shed over the reducer row: four posts and a roof.
      {
        const sx = dx0 + 19, sz = dz0, sy = h(sx, sz);
        for (const [ox, oz] of [[-3.5, -12], [3.5, -12], [-3.5, 12], [3.5, 12]]) {
          if (!isClear(sx + ox, sz + oz, 0.4, 0.8)) continue;
          put(G.block(), '#6b7684', CHARSET.WALL, sx + ox, h(sx + ox, sz + oz), sz + oz, 0.4, 5.6, 0.4);
          solid(circle(sx + ox, sz + oz, 0.3, 5.6, h(sx + ox, sz + oz)));
        }
        put(G.block(), '#9aa3ad', CHARSET.ROOF, sx, sy + 5.6, sz, 8.6, 0.35, 25.4, { cut: true });
      }
      // Compost output: a low mound and sacks on pallets by the shed's south end.
      {
        const mx = dx0 + 19, mz = dz0 + 18;
        if (isClear(mx, mz, 3.5, 1)) {
          const my = h(mx, mz);
          put(G.ball(), '#5a4030', CHARSET.DIRT, mx, my, mz, 3.4, 1.4, 2.8, { shadow: false });
          for (const ox of [-4.5, 4.5]) {
            if (!isClear(mx + ox, mz, 1.2, 0.8)) continue;
            put(G.block(), '#a07a4a', CHARSET.WOOD, mx + ox, my, mz, 1.6, 0.25, 1.4);
            put(G.block(), '#e8dcc0', CHARSET.WALL, mx + ox, my + 0.25, mz, 1.4, 0.9, 1.2);
            solid(circle(mx + ox, mz, 0.9, 1.2, my));
          }
          solid(circle(mx, mz, 2.6, 1.3, my));
        }
      }
      // Sorting bins in a row by the yard (colour per stream).
      {
        const colors = ['#3c8c4a', '#2f6fb5', '#e0b030', '#8a8f96', '#a0522d'];
        for (let i = 0; i < colors.length; i++) {
          const bx = dx0 - 12 + i * 1.6, bz = dz0 + 10;
          if (!isClear(bx, bz, 0.6, 0.8)) continue;
          const by = h(bx, bz);
          put(G.block(), colors[i], CHARSET.WALL, bx, by, bz, 1.1, 1.2, 1.1);
          solid(circle(bx, bz, 0.6, 1.2, by));
        }
      }
      // Concrete yard slab (skips roads), floodlights at the corners, and a
      // warehouse with a green band on the west side.
      for (let x = dx0 - 22; x <= dx0 + 24; x += 4) {
        for (let z = dz0 - 24; z <= dz0 + 30; z += 4) {
          if (surfaces.insideAt(x, z) > -0.4) continue; // up to the road edge
          paving(x, z, 4.02, 4.02, 0, '#bcb7ab');
        }
      }
      for (const [fx, fz] of [[dx0 - 23, dz0 - 25], [dx0 + 25, dz0 - 25], [dx0 - 23, dz0 + 31], [dx0 + 25, dz0 + 31]]) lampPost(fx, fz, { height: 8 });
      modernBlock(dx0 - 17, dz0 + 6, 9, 15, 6, { yaw: Math.PI / 2, wall: '#d8dde2', band: '#3c8c4a', rand: rng(312), canopy: false });

      // Yard fence: posts and rails round the depot; gaps appear wherever a
      // road or a building is in the way.
      {
        const [x0, z0, x1, z1] = [dx0 - 24, dz0 - 26, dx0 + 26, dz0 + 32];
        const edge = (ax, az, bx, bz) => {
          const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 3);
          for (let i = 0; i <= n; i++) {
            const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
            if (!isClear(x, z, 0.3, 1.2)) continue;
            const y = h(x, z);
            put(G.block(), '#8a8f96', CHARSET.WALL, x, y, z, 0.18, 1.6, 0.18, { shadow: false });
            put(G.block(), '#aab3c2', CHARSET.WALL, x, y + 1.25, z, bx !== ax ? 3 : 0.1, 0.1, bz !== az ? 3 : 0.1, { shadow: false });
            solid(circle(x, z, 0.2, 1.6, y));
          }
        };
        edge(x0, z0, x1, z0); edge(x1, z0, x1, z1); edge(x1, z1, x0, z1); edge(x0, z1, x0, z0);
      }

      // A collection truck drives the route, stopping at each bin.
      patrols.push({ trail: route.id, model: 'truck', stops: [70, 140, 210, 280, 340], color: '#3c8c4a', box: '#eef1f3', speed: 7 });
    }
  }

  // --- Career 3: Moisten botanical plant ---------------------------------------------
  // White clean-room plant, film rolls by the yard, robot arms over a belt,
  // and glowing chevrons painted on the FILM LINE conveyor strips.
  {
    const zm = zone('moisten');
    if (zm) {
      const [mx, mz] = zm.pos;
      // Clean-room plant south of the yard.
      const px = mx + 22, pz = mz + 38;
      if (boxClear(px, pz, 24, 14, 0, 1)) {
        const { lo } = footprint(px, pz, 12, 7, 0);
        put(G.block(), '#f3f5f7', CHARSET.WALL, px, lo - 0.4, pz, 24, 8.4, 14, { cut: true });
        put(G.block(), '#b38cff', CHARSET.GOLD, px, lo + 6.9, pz, 24.12, 0.7, 14.12, { cut: true }); // lavender band
        // Sawtooth roof: five teeth, each a sloped panel with a glazed north face.
        for (let i = 0; i < 5; i++) {
          const tx = px - 12 + 2.4 + i * 4.8;
          put(G.block(), '#d9dee3', CHARSET.ROOF, tx, lo + 8.9, pz, 5.1, 0.25, 14.2, { rz: 0.39, cut: true });
          put(G.block(), '#9fd0e8', CHARSET.WALL, tx + 2.35, lo + 8, pz, 0.15, 1.95, 14.0, { cut: true });
        }
        windows(px, pz, 0, 24, 14, lo, 2, rng(77));
        solid(box(px, pz, 12, 7, 0, 8.4, lo - 0.4));
        // Belt along the plant's north face with two robot arms.
        const bz = pz - 9.5, by = h(px, bz);
        put(G.block(), '#2b2f36', CHARSET.WALL, px, by, bz, 16, 0.9, 1.6);
        solid(box(px, bz, 8, 0.8, 0, 0.9, by));
        for (const dx of [-4, 4]) {
          const ax = px + dx, az = bz - 2.2;
          put(G.cylinder(), '#ff8c42', CHARSET.GOLD, ax, by, az, 0.55, 0.8, 0.55);
          // Arm: a turning group (upper arm + forearm) that swings over the belt.
          const arm = new THREE.Group();
          const seg = (w, hh, d, x, y, z, rx) => {
            const m = new THREE.Mesh(G.block(), material('#ff8c42'));
            m.scale.set(w, hh, d); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true;
            arm.add(m);
          };
          seg(0.35, 2.6, 0.35, 0, 0, 0.0, 0.45);
          seg(0.3, 1.8, 0.3, 0, 2.3, 1.1, 1.9);
          arm.position.set(ax, by + 0.8, az);
          setCharset(arm, CHARSET.GOLD);
          scene.add(arm);
          const phase = dx;
          animators.push((dt, t) => { arm.rotation.y = Math.sin(t * 0.9 + phase) * 1.1; });
          solid(circle(ax, az, 0.6, 3.5, by));
        }
      }
      // Landmark: a giant cosmetic bottle (pump top) by the yard entrance.
      {
        const bx = mx + 14, bz = mz - 13;
        if (isClear(bx, bz, 2.4, 1)) {
          const by = h(bx, bz);
          put(G.cylinder(), '#f3d7e3', CHARSET.WALL, bx, by, bz, 2.1, 6.5, 2.1, { cut: true });
          put(G.cylinder(), '#e9b8cc', CHARSET.GOLD, bx, by + 2.2, bz, 2.15, 1.4, 2.15, { cut: true }); // label
          put(G.cylinder(), '#f2f2f2', CHARSET.WALL, bx, by + 6.5, bz, 1.0, 1.0, 1.0);
          put(G.cylinder(), '#d9dee3', CHARSET.WALL, bx, by + 7.5, bz, 0.35, 1.3, 0.35);
          put(G.block(), '#d9dee3', CHARSET.WALL, bx + 0.7, by + 8.6, bz, 1.6, 0.35, 0.4);           // pump spout
          solid(circle(bx, bz, 2.1, 9, by));
        }
      }
      // ODF film line on show: two rollers on frames with a thin film between.
      {
        const fx = mx + 22, fz = mz + 19, fy = h(fx, fz);
        if (boxClear(fx, fz, 12, 2.4, 0, 0.8)) {
          for (const o of [-5.5, 5.5]) {
            put(G.block(), '#6b7684', CHARSET.WALL, fx + o, fy, fz - 1, 0.25, 2.2, 0.25, { shadow: false });
            put(G.block(), '#6b7684', CHARSET.WALL, fx + o, fy, fz + 1, 0.25, 2.2, 0.25, { shadow: false });
            put(G.cylinder(), '#c9ccd2', CHARSET.WALL, fx + o, fy + 1.85, fz - 1.1, 0.45, 2.2, 0.45, { rx: Math.PI / 2 });
          }
          put(G.block(), '#e6f4ff', CHARSET.ICE, fx, fy + 2.25, fz, 11, 0.05, 2.0, { shadow: false }); // the film
          solid(box(fx, fz, 6, 1.2, 0, 2.6, fy));
        }
      }
      // Lamps along the plant road; a gravel path between the flower fields.
      const film = trail('film');
      if (film) {
        for (let d = 10; d < film.length - 10; d += 18) {
          const p = pointAt(film.path, film.cum, d), off = film.width / 2 + 1.6;
          lampPost(p.x - p.tz * off, p.z + p.tx * off);
        }
      }
      for (let z = 100; z <= 188; z += 3) paving(336, z, 2.4, 3.05, 0, '#b8a888', CHARSET.GRAVEL);

      // Film rolls stacked north of the yard.
      for (let i = 0; i < 3; i++) {
        const fx = mx - 4 + i * 4, fz = mz - 18;
        if (!isClear(fx, fz, 1.6, 1)) continue;
        const fy = h(fx, fz);
        put(G.cylinder(), '#e8f1f7', CHARSET.WALL, fx, fy + 0.9, fz - 1.4, 0.9, 2.8, 0.9, { rx: Math.PI / 2 });
        if (i < 2) put(G.cylinder(), '#d6e6f2', CHARSET.WALL, fx + 2, fy + 2.5, fz - 1.4, 0.8, 2.8, 0.8, { rx: Math.PI / 2 });
        solid(circle(fx, fz, 1.2, 3.3, fy));
      }
    }
    if (zm) {
      const [mx, mz] = zm.pos;
      // Greenhouses (glass half-barrels) beside the lavender.
      for (const [gx, gz] of [[214, 30], [214, 118], [236, 118]]) {
        if (!boxClear(gx, gz, 16, 8, 0, 1)) continue;
        const gy = h(gx, gz);
        put(G.cylinder(), '#cfe8f0', CHARSET.ROOF, gx - 8, gy, gz, 3.8, 16, 3.8, { rz: -Math.PI / 2 });
        put(G.block(), '#9fc4d8', CHARSET.WALL, gx, gy, gz, 16, 0.4, 7.8, { shadow: false });
        solid(box(gx, gz, 8, 3.9, 0, 3.8, gy));
      }
      // Distillation tanks with cone tops, joined by a pipe.
      const tanks = [];
      for (let i = 0; i < 3; i++) {
        const tx = mx + 41 + i * 5, tz = mz + 30;
        if (!isClear(tx, tz, 2.2, 1)) continue;
        const ty = h(tx, tz);
        put(G.cylinder(), '#d9dee3', CHARSET.WALL, tx, ty, tz, 1.8, 7, 1.8);
        put(G.cone(), '#b9c0c8', CHARSET.ROOF, tx, ty + 7, tz, 1.8, 1.4, 1.8);
        solid(circle(tx, tz, 1.9, 8.4, ty));
        tanks.push([tx, tz, ty]);
      }
      if (tanks.length > 1) {
        const [a0, , ay] = tanks[0], [a1] = tanks[tanks.length - 1];
        put(G.cylinder(), '#9aa3ad', CHARSET.WALL, a0, ay + 5, tanks[0][1], 0.25, a1 - a0, 0.25, { rz: -Math.PI / 2 });
      }
      // AI & DX server room: dark block with blinking status strips.
      {
        const sx = mx + 22, sz = mz + 56;
        if (boxClear(sx, sz, 8, 5, 0, 1)) {
          const sy = h(sx, sz);
          put(G.block(), '#1d2127', CHARSET.WALL, sx, sy - 0.3, sz, 8, 4.3, 5, { cut: true });
          solid(box(sx, sz, 4, 2.5, 0, 4, sy - 0.3));
          const leds = [0, 1, 2, 3].map(i => {
            const m = new THREE.MeshStandardMaterial({ color: '#0b1a12', emissive: i % 2 ? '#48cae4' : '#5dff8a', emissiveIntensity: 1 });
            const led = new THREE.Mesh(G.block(), m);
            led.scale.set(1.2, 0.25, 0.08);
            led.position.set(sx - 2.4 + i * 1.6, sy + 2.4, sz - 2.56);
            setCharset(led, CHARSET.GOLD);
            scene.add(led);
            return m;
          });
          animators.push((dt, t) => leds.forEach((m, i) => { m.emissiveIntensity = Math.sin(t * (3 + i * 1.7) + i) > 0.2 ? 1.8 : 0.15; }));
        }
      }
      // A delivery van shuttles along the plant road.
      const plantRoad = trail('film');
      if (plantRoad) patrols.push({ trail: plantRoad.id, model: 'truck', color: '#b38cff', box: '#f3f5f7', speed: 9 });
    }

    // Conveyor slats across the road on boost strips (flat, bright).
    for (const b of map.boosts ?? []) {
      const tr = trail(b.trail);
      if (!tr) continue;
      for (let d = b.from; d <= b.to; d += 1.6) {
        const p = pointAt(tr.path, tr.cum, d);
        put(G.block(), '#b38cff', CHARSET.GOLD, p.x, h(p.x, p.z) + 0.04, p.z, tr.width * 0.8, 0.05, 0.4,
          { yaw: Math.atan2(p.tx, p.tz), shadow: false });
      }
    }
  }

  // --- Scatter (trees, rocks) -----------------------------------------------------
  const KINDS = {
    conifer(x, z, rand) {
      const y = h(x, z);
      const th = 1.2 + rand() * 1.2;
      const ch = 4 + rand() * 4;
      const cr = 1.4 + rand() * 0.9;
      put(G.trunk(), '#6b4a2e', CHARSET.WOOD, x, y, z, 1, th, 1, { cut: true });
      put(G.cone(), rand() < 0.5 ? '#2f6b3c' : '#3f7f45', CHARSET.FOLIAGE, x, y + th * 0.7, z, cr, ch, cr, { cut: true });
      return solid(circle(x, z, 0.45, th + ch, y));
    },
    broadleaf(x, z, rand) {
      const y = h(x, z);
      const th = 1.8 + rand();
      put(G.trunk(), '#7a5a3a', CHARSET.WOOD, x, y, z, 1, th, 1, { cut: true });
      const s = 1.8 + rand() * 1.2;
      put(G.ball(), rand() < 0.5 ? '#6f9a3e' : '#86a94a', CHARSET.FOLIAGE, x, y + th + s * 0.6, z, s, s * 0.8, s, { cut: true });
      return solid(circle(x, z, 0.45, th + s, y));
    },
    cypress(x, z, rand) {
      const y = h(x, z);
      const ch = 6 + rand() * 4;
      put(G.trunk(), '#6b4a2e', CHARSET.WOOD, x, y, z, 0.8, 0.8, 0.8, { cut: true });
      put(G.cone(), '#2e5233', CHARSET.FOLIAGE, x, y + 0.5, z, 0.8 + rand() * 0.3, ch, 0.8 + rand() * 0.3, { cut: true });
      return solid(circle(x, z, 0.5, ch, y));
    },
    snowPine(x, z, rand) {
      const y = h(x, z);
      const ch = 4 + rand() * 4, cr = 1.3 + rand() * 0.8;
      put(G.trunk(), '#5a4030', CHARSET.WOOD, x, y, z, 1, 1.2, 1, { cut: true });
      put(G.cone(), '#2e5a3e', CHARSET.FOLIAGE, x, y + 0.8, z, cr, ch, cr, { cut: true });
      put(G.cone(), '#f2f6ff', CHARSET.SNOW, x, y + 0.8 + ch * 0.55, z, cr * 0.55, ch * 0.45, cr * 0.55, { cut: true, sway: [0.55, 0.45] }); // snow cap (moves with the tree)
      return solid(circle(x, z, 0.45, ch, y));
    },
    cactus(x, z, rand) {
      // Original desert plant: a ribbed column with one or two arms.
      const y = h(x, z), ht = 1.6 + rand() * 1.4;
      put(G.cylinder(), '#5f8f4a', CHARSET.FOLIAGE, x, y, z, 0.28, ht, 0.28, { cut: true });
      for (const side of rand() < 0.5 ? [1] : [1, -1]) {
        const ay = y + ht * (0.4 + rand() * 0.3);
        put(G.cylinder(), '#5f8f4a', CHARSET.FOLIAGE, x + side * 0.45, ay, z, 0.18, 0.12, 0.18, { rz: Math.PI / 2 * side });
        put(G.cylinder(), '#5f8f4a', CHARSET.FOLIAGE, x + side * 0.6, ay, z, 0.18, ht * 0.35, 0.18);
      }
      return solid(circle(x, z, 0.4, ht, y));
    },
    shrub(x, z, rand) {
      const s = 0.4 + rand() * 0.5;
      put(G.ball(), rand() < 0.5 ? '#9a8a5a' : '#7f7a4a', CHARSET.FOLIAGE, x, h(x, z) + s * 0.4, z, s * 1.3, s * 0.7, s * 1.3, { shadow: false });
      return null;
    },
    rock(x, z, rand) {
      const s = 0.5 + rand() * 1.3;
      const sandstone = biomes.biomeAt(x, z, h(x, z)).desert > 0.5;
      put(G.rock(), sandstone ? '#c48a5c' : '#9aa3ad', CHARSET.ROCK, x, h(x, z) + s * 0.3, z, s, s * 0.8, s, { yaw: rand() * 6, rx: rand() * 3 });
      return s > 0.9 ? solid(circle(x, z, s * 0.8, s, h(x, z))) : null;
    },
  };
  // Vineyards: rows of vines on posts, following each block's row direction.
  for (const vy of map.vineyards ?? []) {
    const [x0, z0, x1, z1] = vy.rect;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const ux = Math.sin(vy.yaw), uz = Math.cos(vy.yaw);   // along the row
    const vx = uz, vz = -ux;                              // across rows
    const half = Math.hypot(x1 - x0, z1 - z0) / 2;
    const rand = rng(Math.round(cx * 7 + cz));
    for (let b = -half; b <= half; b += vy.spacing) {
      for (let a = -half; a <= half; a += 1.6) {
        const x = cx + ux * a + vx * b, z = cz + uz * a + vz * b;
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;
        if (h(x, z) < 1.5 || terrain.normalAt(x, z, nrm).y < 0.88) continue;
        if (!isClear(x, z, 0.6, 1.5)) continue;
        const y = h(x, z);
        const [c0, c1] = vy.colors ?? ['#4f7f3a', '#5d8a3c'];
        put(G.block(), rand() < 0.5 ? c0 : c1, CHARSET.FOLIAGE, x, y - 0.1, z, 0.7, (vy.height ?? 1.1) + rand() * 0.25, 1.5, { yaw: vy.yaw, shadow: false });
        occupied.insert(circle(x, z, 0.6, 1.3, y)); // keeps trees out of the rows (no collider: drive through)
      }
    }
  }

  for (const sc of map.scatter) {
    const rand = rng(sc.seed);
    const [x0, z0, x1, z1] = sc.rect;
    for (let i = 0; i < sc.count; i++) {
      const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
      const roll = rand(); // keep the RNG stream stable regardless of rejections
      if (h(x, z) < 1.5) continue;
      if (sc.biome) {
        const b = biomes.biomeAt(x, z, h(x, z));
        const w = sc.biome === 'temperate' ? 1 - b.snow - b.desert : b[sc.biome];
        if (w < 0.5) continue;
      }
      if (terrain.normalAt(x, z, nrm).y < 0.82) continue;
      if (!isClear(x, z, 1.2, sc.clearance)) continue;
      KINDS[sc.kind](x, z, rng(Math.floor(roll * 1e9)));
    }
  }

  // --- Road paint ----------------------------------------------------------------
  // Dashed centre line on public tarmac roads (not the circuit, which has
  // kerbs, nor the heartbeat road with its own trace).
  {
    const DASH = 3, GAP = 5;
    for (const t of terrain.trails) {
      if (t.surface !== 'asphalt' || t.kerbs || t.id === 'pulse' || t.id === 'pitlane' || (t.width ?? 6) < 6.5) continue;
      for (let d = GAP; d < t.length - GAP; d += DASH + GAP) {
        const p = pointAt(t.path, t.cum, d + DASH / 2);
        // Only on this road's own tarmac: not across pads or through junctions.
        if (surfaces.surfaceAt(p.x, p.z) !== 'asphalt' || surfaces.insideAt(p.x, p.z) < (t.width ?? 6) / 2 - 0.6) continue;
        const y0 = h(p.x - p.tx * DASH / 2, p.z - p.tz * DASH / 2), y1 = h(p.x + p.tx * DASH / 2, p.z + p.tz * DASH / 2);
        _e.set(Math.atan2(y0 - y1, DASH), Math.atan2(p.tx, p.tz), 0);
        _m.compose(_p.set(p.x, (y0 + y1) / 2 + 0.02, p.z), _q.setFromEuler(_e), _s.set(0.34, 0.05, DASH));
        inst.add(G.block(), material('#ffd766'), CHARSET.GOLD, _m, { castShadow: false }); // warm paint: hue is what reads in glyphs
      }
    }
  }

  inst.build(scene);

  // Bake the light pools: smooth falloff, brightest wins where pools overlap.
  {
    const N = 1024, half = map.size / 2, px = map.size / N;
    const data = new Uint8Array(N * N);
    for (const [x, z, r, k] of lightSpots) {
      const cx = (x + half) / px, cz = (z + half) / px, rr = r / px;
      for (let iz = Math.max(0, Math.floor(cz - rr)); iz <= Math.min(N - 1, Math.ceil(cz + rr)); iz++) {
        for (let ix = Math.max(0, Math.floor(cx - rr)); ix <= Math.min(N - 1, Math.ceil(cx + rr)); ix++) {
          const d = Math.hypot(ix + 0.5 - cx, iz + 0.5 - cz) / rr;
          if (d >= 1) continue;
          const v = Math.round(255 * k * (1 - d * d) * (1 - d * d));
          if (v > data[iz * N + ix]) data[iz * N + ix] = v;
        }
      }
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    groundLight.tLight.value = tex;
    groundLight.uLightMin.value = -half;
    groundLight.uLightSize.value = map.size;
  }

  return {
    terrain, surfaces, surfaceAt, biomes, colliders, route, patrols, bounds: map.bounds, spawn: map.spawn, waterLevel: map.waterLevel,
    /** Per-frame: sea ripples; at dusk/night the sea faintly reflects the sky. */
    update(dt, t, look) {
      seaTime.value = t;
      swayUniforms.uSwayTime.value = t;
      if (look) {
        seaMat.emissive.copy(look.sky).multiplyScalar(look.night ? 0.24 : 0.12);
        windowLit.emissiveIntensity = look.lights * 1.8; // dusk → night
        lampGlow.emissiveIntensity = 0.15 + look.lights * 2.2;
        groundLight.uLights.value = look.lights;
        for (const fn of animators) fn(dt, t, look);
        // KETI dial: hands show the in-game time (12 at north, clockwise).
        if (dialHands.length) {
          dialHands[0].rotation.y = -((look.hour % 12) / 12) * Math.PI * 2;
          dialHands[1].rotation.y = -((look.hour % 1)) * Math.PI * 2;
        }
      }
    },
  };
}
