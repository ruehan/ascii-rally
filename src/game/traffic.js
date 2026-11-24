import * as THREE from 'three';
import { CHARSET, setCharset } from '../render/charsets.js';
import { shapes } from '../vehicle/models.js';
import { pointAt } from '../world/path.js';
import { box } from '../physics/shapes.js';
import { groundLight, MAX_BEAMS } from '../render/groundLight.js';

/**
 * Traffic: ordinary cars that drive the public tarmac roads, keeping to the
 * right, slowing for bends, queueing behind whatever is in their lane (the
 * player included) and turning round at a road's end. Each one is a moving
 * collider in the physics (addDynamic): the player bounces off it, and a
 * hard hit shoves the car aside and leaves it stopped for a few seconds
 * before it pulls back into its lane.
 *
 * Also runs the scripted "patrols" from the world builder (the collection
 * truck, the plant's delivery truck) — same driving, plus stops.
 */

// --- Models (original, unbranded): one merged mesh + one lens mesh each -------------
const GLASS = '#18222e', DARK = '#22252a', TYRE = '#1d1f22', HUB = '#8d9299';
const LAMP = '#fff3b0', TAIL = '#c01818';

function wheels(b, x, zs, r, w = 0.26) {
  for (const z of zs) {
    for (const side of [-1, 1]) b.cyl(r, w, TYRE, side * x, r, z).cyl(r * 0.55, w + 0.03, HUB, side * x, r, z, 'x', 8);
  }
}

const MODELS = {
  sedan(b, l, color) {
    b.box(1.78, 0.5, 4.4, color, 0, 0.62, 0, { front: 0.9, back: 0.92 })
      .box(1.5, 0.46, 2.3, GLASS, 0, 1.1, 0.15, { top: [0.82, 0.62], topShift: 0.05 })
      .box(1.2, 0.04, 1.32, color, 0, 1.35, 0.2)
      .box(1.7, 0.16, 0.16, DARK, 0, 0.42, -2.18).box(1.7, 0.16, 0.16, DARK, 0, 0.42, 2.18);
    wheels(b, 0.84, [-1.4, 1.4], 0.33);
    l.pair(0.36, 0.14, 0.08, LAMP, 0.58, 0.68, -2.2).pair(0.4, 0.12, 0.08, TAIL, 0.58, 0.72, 2.2);
    return { hx: 0.9, hz: 2.2, h: 1.4 };
  },
  hatch(b, l, color) {
    b.box(1.72, 0.5, 3.8, color, 0, 0.62, 0, { front: 0.9 })
      .box(1.5, 0.46, 2.2, GLASS, 0, 1.1, 0.4, { top: [0.82, 0.75], topShift: 0.1 })
      .box(1.2, 0.04, 1.6, color, 0, 1.35, 0.52)
      .box(1.66, 0.16, 0.16, DARK, 0, 0.42, -1.88).box(1.66, 0.16, 0.16, DARK, 0, 0.42, 1.88);
    wheels(b, 0.82, [-1.2, 1.25], 0.32);
    l.pair(0.34, 0.14, 0.08, LAMP, 0.56, 0.68, -1.9).pair(0.3, 0.2, 0.08, TAIL, 0.62, 0.78, 1.9);
    return { hx: 0.87, hz: 1.9, h: 1.4 };
  },
  van(b, l, color) {
    b.box(1.9, 1.3, 4.8, color, 0, 1.05, 0, { front: 0.95 })
      .box(1.7, 0.5, 0.5, color, 0, 0.62, -2.5)                              // short nose
      .box(1.66, 0.5, 0.08, GLASS, 0, 1.38, -2.38, { rx: -0.25 })            // windscreen
      .pair(0.06, 0.42, 1.0, GLASS, 0.93, 1.4, -1.6)                         // cab windows
      .box(1.86, 0.16, 0.16, DARK, 0, 0.42, -2.72).box(1.86, 0.16, 0.16, DARK, 0, 0.42, 2.4);
    wheels(b, 0.9, [-1.6, 1.5], 0.36, 0.28);
    l.pair(0.32, 0.16, 0.08, LAMP, 0.6, 0.7, -2.76).pair(0.16, 0.36, 0.08, TAIL, 0.82, 1.0, 2.42);
    return { hx: 0.97, hz: 2.55, h: 1.9 };
  },
  pickup(b, l, color) {
    b.box(1.85, 0.55, 5.0, color, 0, 0.75, 0, { front: 0.93 })
      .box(1.6, 0.5, 1.5, GLASS, 0, 1.27, -0.5, { top: [0.88, 0.8] })
      .box(1.42, 0.04, 1.22, color, 0, 1.54, -0.5)
      .box(1.6, 0.05, 1.9, DARK, 0, 1.03, 1.45)                              // bed floor
      .pair(0.1, 0.28, 2.0, color, 0.87, 1.15, 1.45).box(1.84, 0.28, 0.1, color, 0, 1.15, 2.45)
      .box(1.8, 0.18, 0.16, DARK, 0, 0.5, -2.5).box(1.8, 0.18, 0.16, DARK, 0, 0.5, 2.5);
    wheels(b, 0.88, [-1.55, 1.55], 0.4, 0.3);
    l.pair(0.34, 0.16, 0.08, LAMP, 0.6, 0.85, -2.52).pair(0.14, 0.3, 0.08, TAIL, 0.84, 0.95, 2.52);
    return { hx: 0.95, hz: 2.55, h: 1.6 };
  },
  // Box truck (the collection truck / delivery truck patrols).
  truck(b, l, color, { box: boxColor = '#eef1f3' } = {}) {
    b.box(2.3, 0.4, 6.4, DARK, 0, 0.65, -0.2)                                // chassis
      .box(2.3, 1.9, 1.7, color, 0, 1.75, -2.55)                             // cab
      .box(2.1, 0.7, 0.08, GLASS, 0, 2.1, -3.42)                             // windscreen
      .box(2.4, 2.5, 4.3, boxColor, 0, 2.1, 0.95)                            // body
      .box(2.44, 0.4, 4.34, color, 0, 1.8, 0.95)                             // stripe
      .box(2.2, 1.6, 0.4, '#6b7684', 0, 1.8, 3.25);                          // rear lift
    wheels(b, 1.0, [-2.4, 0.9, 2.1], 0.5, 0.34);
    l.pair(0.4, 0.2, 0.08, LAMP, 0.75, 1.0, -3.42).pair(0.2, 0.3, 0.08, TAIL, 0.95, 1.1, 3.46);
    return { hx: 1.2, hz: 3.45, h: 3.3 };
  },
};
const PAINT = ['#e8e8e8', '#b9bec6', '#3a3f47', '#27408b', '#8c2f39', '#d9c7a0', '#6ea8c9', '#3f6b4f', '#f2c230', '#c96f3b'];
const MIX = ['sedan', 'sedan', 'hatch', 'hatch', 'van', 'pickup'];

// --- Lanes ----------------------------------------------------------------------------
/**
 * A closed lap for one road: up the right-hand lane, a U-turn before the
 * end, back down the other side, a U-turn before the start. The turns are
 * driven like real ones — swing out to the right, then round a wide arc
 * (onto the shoulder on narrow roads) — and the whole lap is smoothed, so
 * there are no corners in it. Returns points, cumulative lengths and a
 * speed limit per point (bends and the U-turns).
 */
function laneLoop(trail, { from = 12, to = trail.length - 12, step = 2.5, cruise = 14 } = {}) {
  const off = Math.max(1.4, Math.min(2.6, (trail.width ?? 6) / 4));
  const R = Math.max(off + 1.6, 4.6);          // U-turn radius
  const EASE = Math.min(16, (to - from) / 3);  // metres over which a car drifts out for the turn
  const ease = d => { const t = Math.max(0, Math.min(1, Math.min(d - from, to - d) / EASE)); return R + (off - R) * t * t * (3 - 2 * t); };
  let xs = [], zs = [];
  const add = (x, z) => { xs.push(x); zs.push(z); };
  const at = d => pointAt(trail.path, trail.cum, d);
  const n = Math.max(2, Math.round((to - from) / step));
  for (let i = 0; i <= n; i++) { const d = from + (to - from) * i / n, p = at(d), o = ease(d); add(p.x - p.tz * o, p.z + p.tx * o); }
  const turn = (p, sign) => {
    for (let k = 1; k < 14; k++) {
      const a = (k / 14) * Math.PI, c = Math.cos(a) * R * sign, s = Math.sin(a) * R * sign;
      add(p.x - p.tz * c + p.tx * s, p.z + p.tx * c + p.tz * s);
    }
  };
  turn(at(to), 1);
  // Where the return lane starts, as a distance (measured before smoothing; close enough).
  let backAt = 0;
  for (let i = 1; i < xs.length; i++) backAt += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  for (let i = n; i >= 0; i--) { const d = from + (to - from) * i / n, p = at(d), o = ease(d); add(p.x + p.tz * o, p.z - p.tx * o); }
  turn(at(from), -1);
  // Round every corner off (Chaikin, twice).
  for (let pass = 0; pass < 2; pass++) {
    const nx = [], nz = [], M = xs.length;
    for (let i = 0; i < M; i++) {
      const j = (i + 1) % M;
      nx.push(xs[i] * 0.75 + xs[j] * 0.25, xs[i] * 0.25 + xs[j] * 0.75);
      nz.push(zs[i] * 0.75 + zs[j] * 0.25, zs[i] * 0.25 + zs[j] * 0.75);
    }
    xs = nx; zs = nz;
  }

  const N = xs.length;
  const cum = new Float32Array(N + 1);
  for (let i = 0; i < N; i++) cum[i + 1] = cum[i] + Math.hypot(xs[(i + 1) % N] - xs[i], zs[(i + 1) % N] - zs[i]);
  // Speed limit from curvature (lateral 2.6 m/s², measured over a few
  // points), then let cars brake in time (3 m/s²).
  const vmax = new Float32Array(N), W = 3;
  for (let i = 0; i < N; i++) {
    const a = (i + N - W) % N, b = (i + W) % N;
    const h0 = Math.atan2(xs[i] - xs[a], zs[i] - zs[a]), h1 = Math.atan2(xs[b] - xs[i], zs[b] - zs[i]);
    const span = Math.hypot(xs[b] - xs[i], zs[b] - zs[i]) + Math.hypot(xs[i] - xs[a], zs[i] - zs[a]);
    const turnRate = Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0))) / Math.max(0.5, span / 2);
    vmax[i] = Math.max(2.5, Math.min(cruise, Math.sqrt(2.6 / Math.max(turnRate, 1e-4))));
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = N - 1; i >= 0; i--) {
      const b = (i + 1) % N;
      vmax[i] = Math.min(vmax[i], Math.sqrt(vmax[b] * vmax[b] + 2 * 3 * (cum[i + 1] - cum[i])));
    }
  }
  return { id: trail.id, xs, zs, cum, vmax, N, total: cum[N], backAt, from, to };
}

/** Point on a lap at distance s (wraps): writes x, z, tx, tz, i into out. */
function sample(loop, s, out) {
  s = ((s % loop.total) + loop.total) % loop.total;
  let lo = 0, hi = loop.N;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (loop.cum[mid] <= s) lo = mid; else hi = mid; }
  const j = (lo + 1) % loop.N;
  const len = loop.cum[lo + 1] - loop.cum[lo] || 1, t = (s - loop.cum[lo]) / len;
  const dx = loop.xs[j] - loop.xs[lo], dz = loop.zs[j] - loop.zs[lo];
  out.x = loop.xs[lo] + dx * t; out.z = loop.zs[lo] + dz * t;
  out.tx = dx / len; out.tz = dz / len; out.i = lo;
  return out;
}

const rng = seed => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

const BEAM_RANGE = 130; // m from the camera's focus within which a car's headlights are drawn
const near = [];

export function createTraffic({ scene, terrain, physics, patrols = [], bus, seed = 11, density = 1 }) {
  const rand = rng(seed);
  const cars = [];
  const glow = { value: 0 }; // lens brightness (night)

  // Lenses glow in their own colour after dusk (one shared material).
  const bodyMat = undefined; // default vertex-coloured prop material
  const lensMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
  lensMat.onBeforeCompile = shader => {
    shader.uniforms.uGlow = glow;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * uGlow;');
  };

  function spawn(loop, { model, color, cruise, s, opts, stops = [] }) {
    const b = shapes(), l = shapes();
    const dim = MODELS[model](b, l, color, opts);
    const obj = new THREE.Group();
    obj.rotation.order = 'YXZ';
    const body = b.mesh(bodyMat), lens = l.mesh(lensMat);
    lens.castShadow = false;
    obj.add(body, lens);
    setCharset(obj, CHARSET.CAR);
    scene.add(obj);

    const car = {
      loop, s, v: 0, cruise, dim, obj, stops, wait: 0,
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, px: 0, py: 0, pz: 0, pyaw: 0, ppitch: 0, proll: 0,
      fx: 0, fz: -1,                       // forward (for the others' look-ahead)
      stun: 0, kx: 0, kz: 0, kvx: 0, kvz: 0, yawOff: 0, yawV: 0, lean: 0, dive: 0, pv: 0,
      blocked: 0, ghost: 0, horn: 0, hidden: false, served: null,
    };
    car.body = physics.addDynamic({
      shape: box(0, 0, dim.hx, dim.hz, 0, dim.h, 0), vx: 0, vz: 0, off: false,
      // A real knock: stop, get shoved along the hit, twist a little.
      onHit(speed, dx, dz) {
        if (speed < 1.2) return;
        car.stun = Math.max(car.stun, 1.5 + Math.min(3, speed * 0.25));
        const push = Math.min(7, speed * 0.5);
        car.kvx += dx * push; car.kvz += dz * push;
        car.yawV += Math.sign(car.fx * dz - car.fz * dx || 1) * Math.min(1.6, speed * 0.1);
        car.v *= 0.3;
        bus?.emit('traffic:hit', { speed, x: car.x, z: car.z });
      },
    });
    place(car, 1 / 60);
    car.body.vx = car.body.vz = 0;
    car.lean = car.dive = 0;
    car.px = car.x; car.py = car.y; car.pz = car.z; car.pyaw = car.yaw; car.ppitch = car.pitch; car.proll = car.roll;
    cars.push(car);
    return car;
  }

  const _s = { x: 0, z: 0, tx: 0, tz: 0, i: 0 }, _r = { x: 0, z: 0, tx: 0, tz: 0, i: 0 };
  /** Lane position + knock offset → pose on the ground, collider, velocity. */
  function place(car, dt) {
    // Both axles ride the lane and the body lies along the chord between
    // them, so the car swings round a bend instead of snapping to it.
    const axle = car.dim.hz * 0.62;
    sample(car.loop, car.s + axle, _s);
    sample(car.loop, car.s - axle, _r);
    const x = (_s.x + _r.x) / 2 + car.kx, z = (_s.z + _r.z) / 2 + car.kz;
    const yaw = Math.atan2(_r.x - _s.x, _r.z - _s.z) + car.yawOff;
    // The body leans out of the turn and dips or squats with the pedals.
    const rate = wrap(yaw - car.yaw) / dt, acc = (car.v - car.pv) / dt;
    car.pv = car.v;
    const kb = Math.min(1, dt * 5);
    car.lean += (Math.max(-0.07, Math.min(0.07, car.v * rate * 0.01)) - car.lean) * kb;
    car.dive += (Math.max(-0.05, Math.min(0.04, acc * 0.006)) - car.dive) * kb;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
    const a = car.dim.hz * 0.7, b = car.dim.hx * 0.8, h = terrain.heightAt;
    const fl = h(x + fx * a - rx * b, z + fz * a - rz * b), fr = h(x + fx * a + rx * b, z + fz * a + rz * b);
    const rl = h(x - fx * a - rx * b, z - fz * a - rz * b), rr = h(x - fx * a + rx * b, z - fz * a + rz * b);
    car.body.vx = (x - car.x) / dt; car.body.vz = (z - car.z) / dt;
    car.x = x; car.z = z; car.y = (fl + fr + rl + rr) / 4;
    car.yaw = yaw; car.fx = fx; car.fz = fz;
    car.pitch = Math.atan2((fl + fr) - (rl + rr), 4 * a) + car.dive;
    car.roll = Math.atan2((rl + fl) - (rr + fr), 4 * b) + car.lean;
    const sh = car.body.shape;
    sh.x = x; sh.z = z; sh.rot = yaw; sh.y = car.y;
  }

  // --- Routes ---------------------------------------------------------------------------
  const PRIVATE = new Set(['pitlane', 'pulse', ...patrols.map(p => p.trail)]);
  for (const t of terrain.trails) {
    if (t.surface !== 'asphalt' || t.kerbs || t.closed || PRIVATE.has(t.id) || (t.width ?? 6) < 7 || t.length < 120) continue;
    const fast = (t.width ?? 6) >= 10;
    const loop = laneLoop(t, { cruise: fast ? 20 : 14 });
    const count = Math.max(1, Math.min(6, Math.round((loop.total / 330) * density)));
    const start = rand() * loop.total;
    for (let i = 0; i < count; i++) {
      spawn(loop, {
        model: MIX[Math.floor(rand() * MIX.length)], color: PAINT[Math.floor(rand() * PAINT.length)],
        cruise: (fast ? 15 : 9.5) + rand() * (fast ? 5 : 4),
        s: start + (i + (rand() - 0.5) * 0.4) * loop.total / count,
      });
    }
  }
  for (const p of patrols) {
    const t = terrain.trails.find(tr => tr.id === p.trail);
    if (!t) continue;
    const loop = laneLoop(t, { from: 8, to: t.length - 8, cruise: p.speed ?? 7 });
    // Stops are given along the trail; the truck calls at them both ways.
    const stops = [];
    for (const st of p.stops ?? []) {
      if (st <= loop.from || st >= loop.to) continue;
      stops.push(st - loop.from, loop.backAt + (loop.to - st));
    }
    spawn(loop, { model: p.model ?? 'truck', color: p.color ?? '#3c8c4a', opts: { box: p.box }, cruise: p.speed ?? 7, s: 2, stops: stops.sort((a, b) => a - b) });
  }

  const player = { x: 0, z: 0, vx: 0, vz: 0, dim: { hx: 1, hz: 2.2 }, isPlayer: true };

  function drive(car, dt, closed) {
    car.px = car.x; car.py = car.y; car.pz = car.z; car.pyaw = car.yaw; car.ppitch = car.pitch; car.proll = car.roll;
    // A road closed for a special stage has no traffic on it.
    const hide = car.loop.id === closed;
    if (hide !== car.hidden) { car.hidden = hide; car.obj.visible = !hide; car.body.off = hide; }
    if (hide) return;

    sample(car.loop, car.s, _s);
    let want = Math.min(car.cruise, car.loop.vmax[_s.i]);

    // Scheduled stops (patrols): ease up to the stop, wait, move on.
    if (car.wait > 0) { car.wait -= dt; want = 0; }
    else if (car.stops.length) {
      const pos = ((car.s % car.loop.total) + car.loop.total) % car.loop.total;
      for (const st of car.stops) {
        const d = st - pos;
        if (st === car.served) { if (d < -1 || d > 12) car.served = null; continue; } // just called here
        if (d > 0 && d < 12) want = Math.min(want, Math.max(1.2, d * 0.9));
        if (d > 0 && d < 0.6) { car.wait = 2.5; car.served = st; want = 0; }
      }
    }
    if (car.stun > 0) { car.stun -= dt; want = 0; }

    // Whatever is ahead in this lane: follow it, or stop behind it.
    let blocker = null;
    for (const o of others(car)) {
      if (o === car || o.hidden || (car.ghost > 0 && !o.isPlayer)) continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      const along = dx * car.fx + dz * car.fz;
      // Look as far ahead as it takes to stop comfortably from this speed.
      if (along <= 0 || along > 8 + (car.v * car.v) / 7 + car.dim.hz + o.dim.hz) continue;
      const lat = Math.abs(dz * car.fx - dx * car.fz);
      if (lat > car.dim.hx + o.dim.hx + 0.5) continue;
      const clear = along - car.dim.hz - o.dim.hz;
      const ov = o.isPlayer ? o.vx * car.fx + o.vz * car.fz : (o.fx * car.fx + o.fz * car.fz) * o.v;
      // Fastest speed that can still brake (4.5 m/s²) to the other's speed 2.5 m short of it.
      const lim = clear < 2.5 ? 0 : Math.max(0, ov) + Math.sqrt(9 * (clear - 2.5));
      if (lim < want) { want = lim; blocker = o; }
    }
    if (blocker && car.v < 0.3) {
      car.blocked += dt;
      // Stuck behind the player: a tap of the horn. Stuck behind traffic for too
      // long (a stand-off at a junction): squeeze past.
      if (blocker.isPlayer && car.blocked > 2 && car.horn <= 0) { car.horn = 6; bus?.emit('traffic:horn', { x: car.x, z: car.z }); }
      if (!blocker.isPlayer && car.blocked > 6) { car.ghost = 4; car.blocked = 0; }
    } else car.blocked = 0;
    car.horn -= dt; car.ghost -= dt;

    car.v += Math.max(-7 * dt, Math.min(2.2 * dt, want - car.v));
    car.s += car.v * dt;

    // Knocked aside: slide to rest, then steer back into the lane once moving again.
    car.kx += car.kvx * dt; car.kz += car.kvz * dt; car.yawOff += car.yawV * dt;
    const fr = Math.exp(-4 * dt);
    car.kvx *= fr; car.kvz *= fr; car.yawV *= fr;
    if (car.stun <= 0) { const back = Math.exp(-0.9 * dt * Math.min(1, car.v / 3)); car.kx *= back; car.kz *= back; car.yawOff *= back; }
    place(car, dt);
  }

  /** Cars near enough to matter (plus the player). */
  function* others(car) {
    yield player;
    for (const o of cars) if (Math.abs(o.x - car.x) < 45 && Math.abs(o.z - car.z) < 45) yield o;
  }

  return {
    cars,
    /** Fixed-rate update: before physics.step, so colliders are where the cars are. */
    step(dt, v, closedTrail = null) {
      player.x = v.x; player.z = v.z; player.vx = v.vx; player.vz = v.vz;
      player.dim.hx = 1; player.dim.hz = v.car.wheelbase / 2 + 0.9;
      for (const car of cars) drive(car, dt, closedTrail);
    },
    /**
     * Per frame: interpolated poses; after dusk the lenses glow and the cars
     * nearest to `focus` (what the camera looks at) light the road ahead.
     */
    render(alpha, lights = 0, focus = null) {
      glow.value = lights * 1.8;
      for (const car of cars) {
        if (car.hidden) continue;
        car.obj.position.set(car.px + (car.x - car.px) * alpha, car.py + (car.y - car.py) * alpha, car.pz + (car.z - car.pz) * alpha);
        car.obj.rotation.set(car.ppitch + (car.pitch - car.ppitch) * alpha, car.pyaw + wrap(car.yaw - car.pyaw) * alpha, -(car.proll + (car.roll - car.proll) * alpha));
      }
      // Headlight beams (shader cones): only a few exist, so they go to the
      // nearest cars and fade out with distance rather than popping.
      const K = groundLight.uBeamK.value, B = groundLight.uBeams.value;
      K.fill(0);
      if (lights <= 0.02 || !focus) return;
      near.length = 0;
      for (const car of cars) {
        if (car.hidden) continue;
        car.far = Math.hypot(car.obj.position.x - focus.x, car.obj.position.z - focus.z);
        if (car.far < BEAM_RANGE) near.push(car);
      }
      near.sort((a, b) => a.far - b.far);
      for (let i = 0; i < Math.min(MAX_BEAMS, near.length); i++) {
        const car = near[i], yaw = car.obj.rotation.y;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        B[i].set(car.obj.position.x + fx * car.dim.hz, car.obj.position.z + fz * car.dim.hz, fx, fz);
        K[i] = lights * 0.9 * Math.min(1, (BEAM_RANGE - car.far) / 30);
      }
    },
  };
}
