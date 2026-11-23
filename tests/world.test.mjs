// Drives the real map with an autopilot and checks it stays drivable: no
// props blocking roads, no falling into the sea, crests launch the car,
// every stage and the 24H loop can be completed.
import assert from 'node:assert/strict';
import * as THREE from 'three';
const root = new URL('..', import.meta.url).href.replace(/\/$/, '');
const { buildWorld } = await import(root + '/src/world/build.js');
const { ArcadePhysics } = await import(root + '/src/physics/arcade.js');
const { createStageSystem } = await import(root + '/src/game/stages.js');
const { createLoop24 } = await import(root + '/src/game/loop24.js');
const { createBus } = await import(root + '/src/core/events.js');
const { pointAt } = await import(root + '/src/world/path.js');
const { createAutopilot } = await import(root + '/tests/lib/autopilot.mjs');
const map = (await import(root + '/src/world/map.js')).default;

const w = buildWorld(new THREE.Scene(), map);
const T = w.terrain, S = w.surfaces;
const DT = 1 / 60;

function physics() {
  const p = new ArcadePhysics({ bounds: w.bounds, terrain: { heightAt: T.heightAt, slopeAlong: T.slopeAlong, surfaceAt: w.surfaceAt } });
  w.colliders.forEach(c => p.addStatic(c));
  return p;
}

/** Drive a path with the autopilot until `done()` or timeout; returns stats. */
function run({ path, cum, from = 3, to = cum.at(-1) - 8, car = 'rally', step = () => {}, done = () => false, timeout = 120 }) {
  const p = physics();
  const a = pointAt(path, cum, from);
  const v = p.createVehicle({ pos: [a.x, a.z], heading: Math.atan2(-a.tx, -a.tz), car });
  const ap = createAutopilot({ path, cum, surfaceAt: w.surfaceAt, heightAt: T.heightAt, start: from });
  const r = { jumps: 0, offroad: 0, stuck: [], sea: false, t: 0, v };
  let air = 0, halt = 0, bestS = from, sinceProgress = 0;
  while (ap.s < to && r.t < timeout && !done()) {
    const intents = halt > 0 ? { throttle: 0, brake: 0, steer: 0, handbrake: 1 } : ap.drive(v); // wait on the handbrake
    p.setIntents(v, intents);
    const wasAir = v.airborne;
    p.step(DT);
    halt = step(v, DT) ? 1 : 0;
    r.t += DT;
    if (v.airborne) air += DT;
    else if (wasAir) { if (air > 0.15) r.jumps++; air = 0; }
    if (v.y < map.waterLevel - 0.3) r.sea = true;
    const near = pointAt(path, cum, ap.s);
    if (Math.hypot(near.x - v.x, near.z - v.z) > 8) r.offroad += DT;
    // Blocked = no progress along the road for 6 s (brief run-offs that the
    // autopilot recovers from are fine).
    if (ap.s > bestS + 2) { bestS = ap.s; sinceProgress = 0; }
    else if (!halt && (sinceProgress += DT) > 6) {
      r.stuck.push([+v.x.toFixed(1), +v.z.toFixed(1)]);
      break;
    }
  }
  r.progress = (ap.s - from) / Math.max(1, to - from);
  return r;
}

// Every road end to end.
for (const trail of T.trails) {
  if (trail.length < 30) continue;
  const r = run({ path: trail.path, cum: trail.cum });
  assert.ok(r.progress > 0.95, `${trail.id}: only reached ${(r.progress * 100).toFixed(0)}%`);
  assert.deepEqual(r.stuck, [], `${trail.id}: stuck at ${JSON.stringify(r.stuck)}`);
  assert.ok(!r.sea, `${trail.id}: fell into the sea`);
  assert.ok(r.offroad < 1, `${trail.id}: ${r.offroad.toFixed(1)} s off the road`);
  if (trail.id === 'forest') assert.ok(r.jumps >= 3, `forest crests should launch the car (got ${r.jumps})`);
}

// From the spawn the car must reach every road leaving the paddock.
function reach(target) {
  const p = physics();
  const v = p.createVehicle({ pos: map.spawn.pos, heading: map.spawn.heading });
  for (let t = 0; t < 15; t += DT) {
    const dx = target[0] - v.x, dz = target[1] - v.z;
    if (Math.hypot(dx, dz) < 3) return true;
    let err = Math.atan2(-dx, -dz) - v.heading;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    p.setIntents(v, { throttle: Math.abs(err) > 0.8 ? 0.2 : 0.4, brake: 0, steer: Math.max(-1, Math.min(1, err * 2)) });
    p.step(DT);
  }
  return false;
}
for (const id of ['forest', 'town', 'valley']) {
  const t = map.trails.find(t => t.id === id);
  assert.ok(reach(t.points[0]), `spawn can't reach the ${id} road at ${t.points[0]}`);
}

// Every special stage can be completed by every car: arm, count down, finish.
const CARS = ['rally', 'formula', 'hypercar', 'gt', 'trail'];
const times = {};
for (const cfg of map.stages) {
  times[cfg.id] = {};
  for (const car of CARS) {
    const bus = createBus();
    const events = [];
    for (const t of ['stage:split', 'stage:finish', 'stage:abort']) bus.on(t, e => events.push([t, e]));
    const stages = createStageSystem({ stages: [cfg], trails: T.trails, bus });
    const trail = T.trails.find(t => t.id === cfg.trail);
    const resolved = stages.stages[0]; // `to` may be relative to the trail end
    run({
      path: trail.path, cum: trail.cum, from: resolved.from, to: Math.min(trail.length - 1, resolved.to + 20), car, timeout: 200,
      step: (v, dt) => { stages.update(dt, v); return stages.state !== 'running'; },
      done: () => events.some(e => e[0] === 'stage:finish' || e[0] === 'stage:abort'),
    });
    const fin = events.find(e => e[0] === 'stage:finish');
    const abort = events.find(e => e[0] === 'stage:abort');
    // Cars with real grip on the stage's surface must finish; slicks on
    // gravel are allowed to fail (that's the point of choosing a car).
    const { CARS: SPECS } = await import(root + '/src/vehicle/cars.js');
    // Stages may name the cars they're built for (e.g. tight hairpins); else
    // any car with decent grip on the surface must finish.
    const mustFinish = cfg.cars ? cfg.cars.includes(car) : (SPECS[car].tyres[trail.surface] ?? 1) >= 0.7;
    if (mustFinish) {
      assert.ok(fin, `${cfg.name}/${car}: did not finish${abort ? ' (' + abort[1].reason + ')' : ''}`);
      assert.equal(events.filter(e => e[0] === 'stage:split').length, cfg.splits.length, `${cfg.name}/${car}: splits`);
    }
    times[cfg.id][car] = fin ? +fin[1].time.toFixed(1) : 'DNF';
  }
}
console.log('  stage times (autopilot):');
for (const [id, t] of Object.entries(times)) console.log(`    ${id}  ${CARS.map(c => `${c} ${t[c]}`).join('  ')}`);

// The long straight is long enough for an F1 car to pass 300 km/h.
{
  const straight = T.trails.find(t => t.id === 'straight');
  let top = 0;
  run({ path: straight.path, cum: straight.cum, car: 'formula', step: v => { top = Math.max(top, v.speed); } });
  assert.ok(top * 3.6 > 300, `FORMULA top speed on the long straight: ${(top * 3.6).toFixed(0)} km/h`);
  console.log(`  long straight: FORMULA ${(top * 3.6).toFixed(0)} km/h`);
}

// The 24H loop can be driven start to finish.
{
  const bus = createBus();
  const events = [];
  for (const t of ['loop:start', 'loop:milestone', 'loop:finish', 'loop:pause']) bus.on(t, () => events.push(t));
  const route = w.route;
  const loop = createLoop24({ route, start: map.loop24.start, milestones: [1, 2, 3, 4, 5, 6].map(i => ({ year: i })), bus });
  const r = run({
    path: route.path, cum: route.cum, from: 2, to: route.length, timeout: 600,
    step: (v, dt) => { loop.update(dt, v); },
    done: () => events.includes('loop:finish') || events.includes('loop:pause'),
  });
  assert.deepEqual(events.filter(e => e !== 'loop:milestone'), ['loop:start', 'loop:finish'], `24H events: ${events}`);
  assert.equal(events.filter(e => e === 'loop:milestone').length, 6);
  console.log(`  24H lap ${route.length.toFixed(0)} m in ${r.t.toFixed(0)} s`);
}

// The ASCII map reads the world correctly.
{
  const { buildMapGrid, MAP_CLASSES } = await import(root + '/src/ui/mapGrid.js');
  const g = buildMapGrid({ terrain: T, surfaces: S, colliders: w.colliders, cellX: 4, waterLevel: map.waterLevel });
  const at = (x, z) => MAP_CLASSES[g.classAt(...g.toCell(x, z).map(Math.floor))].id;
  assert.equal(at(0, -190), 'sea', 'north edge is sea');
  assert.equal(at(...map.zones.find(z => z.id === 'paddock').pos), 'pad');
  assert.equal(at(46, -76), 'asphalt', 'skidpad');
  const count = id => g.cls.filter(k => MAP_CLASSES[k].id === id).length;
  assert.ok(count('tree') > 200, `forest shows up (${count('tree')} tree cells)`);
  assert.ok(count('building') > 30, `town shows up (${count('building')} building cells)`);
}

console.log('all world tests passed');
