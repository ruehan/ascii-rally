import * as THREE from 'three';
import { CHARSET, setCharset } from '../render/charsets.js';
import { material } from './materials.js';
import { geometries as G } from './geometries.js';
import { Instancer } from './instancer.js';
import { createTerrain } from './terrain.js';
import { createSurfaces } from './surfaces.js';
import { createTerrainMesh } from './terrainMesh.js';
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
    ...map.zones.map(z => ({ type: 'pad', pos: z.pos, r: z.r, y: z.y })),
    ...map.trails.map(t => ({ type: 'trail', ...t })),
  ];
  const terrain = createTerrain({ size: map.size, ...map.terrain, features });
  const surfaces = createSurfaces({
    size: map.size,
    trails: terrain.trails,
    pads: map.zones.map(z => ({ pos: z.pos, r: z.r, surface: z.surface })),
  });

  scene.background = new THREE.Color('#121612');
  scene.fog = new THREE.Fog('#121612', 55, 130);

  const ground = createTerrainMesh(terrain, surfaces);
  scene.add(ground);

  // Sea: brightness ripples over time so the `~ ≈` glyphs shimmer.
  const seaMat = new THREE.MeshStandardMaterial({ color: '#3f86ad', roughness: 0.6, emissive: '#000000' });
  const seaTime = { value: 0 };
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

  const put = (geo, color, charset, x, y, z, sx, sy, sz, { yaw = 0, rx = 0, rz = 0, cut = false, shadow = true } = {}) => {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, yaw, rz)), _s.set(sx, sy, sz));
    inst.add(geo, material(color, { cutaway: cut }), charset, _m, { castShadow: shadow });
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
  /** True if a circle of radius r is off roads/pads and clear of placed objects. */
  const isClear = (x, z, r, roadMargin = 0.5) => {
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      if (surfaces.insideAt(x + dx, z + dz) > -roadMargin) return false;
    }
    for (const s of occupied.query(x, z, r)) if (circleContact(s, x, z, r, _c)) return false;
    return true;
  };

  // --- Buildings ---------------------------------------------------------------
  function house(x, z, yaw, w, d, floors, rand, { flatRoof = false } = {}) {
    const { lo, hi } = footprint(x, z, w / 2, d / 2, yaw);
    const base = lo - 0.4;
    const wallH = hi - base + floors * 3;
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
        if (rand() < chance && isClear(x, z, Math.min(w, d) / 2, 0.3)) {
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
    for (const dx of [-4, 4]) {
      put(G.block(), '#2b2b2b', CHARSET.GLYPH, qx + dx, ay, qz + 12, 0.7, 5, 0.7, { cut: true });
      solid(circle(qx + dx, qz + 12, 0.5, 5, ay));
    }
    put(G.block(), '#ffd166', CHARSET.GOLD, qx, ay + 4.2, qz + 12, 9, 1.3, 0.4, { cut: true, shadow: false });
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
      const off = coast.width / 2 + 0.6;
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
    // Tyre wall outside T1.
    for (let z = 296; z <= 350; z += 1.1) {
      for (let row = 0; row < 3; row++) {
        put(G.ring(), row % 2 ? '#f4f4f4' : '#2b2b2b', CHARSET.CAR, 352, y + 0.15 + row * 0.3, z, 0.5, 0.5, 1.4, { rx: Math.PI / 2, shadow: false });
      }
    }
    solid(box(352, 323, 0.6, 27, 0, 1, y));
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
      const off = tr.width / 2 + 2; // clear of the road: cars have a ~1.4 m collision radius
      let top = -Infinity;
      for (const sgn of [-1, 1]) {
        const [x, z] = side(p, off * sgn);
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
    const W = 4.5; // half road + margin

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
      const [x, z] = side(p, -(W + 2));
      const y = h(x, z);
      put(G.block(), '#2b2b2b', CHARSET.WOOD, x, y, z, 0.25, 2.2, 0.25, { yaw });
      putGlow(x, y + 2.2, z, 2.6, 1.4, 0.2, yaw + Math.PI / 2);
      solid(circle(x, z, 0.4, 3.5, y));
    });
    // Reflector posts every 12 m on the east (night) leg.
    const east = trail('east');
    if (east) {
      for (let d = 6; d < east.length - 6; d += 12) {
        const p = pointAt(east.path, east.cum, d);
        for (const sgn of [-1, 1]) {
          const [x, z] = side(p, (east.width / 2 + 0.8) * sgn);
          if (!isClear(x, z, 0.3, 0.3)) continue;
          put(G.block(), '#efefef', CHARSET.WALL, x, h(x, z), z, 0.15, 0.9, 0.15);
          putGlow(x, h(x, z) + 0.75, z, 0.18, 0.15, 0.18, 0);
        }
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
    rock(x, z, rand) {
      const s = 0.5 + rand() * 1.3;
      put(G.rock(), '#9aa3ad', CHARSET.ROCK, x, h(x, z) + s * 0.3, z, s, s * 0.8, s, { yaw: rand() * 6, rx: rand() * 3 });
      return s > 0.9 ? solid(circle(x, z, s * 0.8, s, h(x, z))) : null;
    },
  };
  for (const sc of map.scatter) {
    const rand = rng(sc.seed);
    const [x0, z0, x1, z1] = sc.rect;
    for (let i = 0; i < sc.count; i++) {
      const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
      const roll = rand(); // keep the RNG stream stable regardless of rejections
      if (h(x, z) < 1.5) continue;
      if (terrain.normalAt(x, z, nrm).y < 0.82) continue;
      if (!isClear(x, z, 1.2, sc.clearance)) continue;
      KINDS[sc.kind](x, z, rng(Math.floor(roll * 1e9)));
    }
  }

  inst.build(scene);

  return {
    terrain, surfaces, colliders, route, bounds: map.bounds, spawn: map.spawn, waterLevel: map.waterLevel,
    /** Per-frame: sea ripples; at dusk/night the sea faintly reflects the sky. */
    update(dt, t, look) {
      seaTime.value = t;
      if (look) seaMat.emissive.copy(look.sky).multiplyScalar(look.night ? 0.24 : 0.12);
    },
  };
}
