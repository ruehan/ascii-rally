// Drives every road of the real map with a simple autopilot and checks it
// stays drivable: no props blocking the road, no falling into the sea,
// forest crests actually launch the car.
import assert from 'node:assert/strict';
import * as THREE from 'three';
const root = new URL('..', import.meta.url).href.replace(/\/$/, '');
const { buildWorld } = await import(root + '/src/world/build.js');
const { ArcadePhysics } = await import(root + '/src/physics/arcade.js');
const { pointAt } = await import(root + '/src/world/path.js');
const map = (await import(root + '/src/world/map.js')).default;

const w = buildWorld(new THREE.Scene(), map);
const T = w.terrain, S = w.surfaces;

function drive(trail) {
  const p = new ArcadePhysics({ bounds: w.bounds, terrain: { heightAt: T.heightAt, slopeAlong: T.slopeAlong, surfaceAt: S.surfaceAt } });
  w.colliders.forEach(c => p.addStatic(c));
  const a = pointAt(trail.path, trail.cum, 3), b = pointAt(trail.path, trail.cum, 6);
  const v = p.createVehicle({ pos: [a.x, a.z], heading: Math.atan2(-(b.x - a.x), -(b.z - a.z)) });
  const r = { jumps: 0, offroad: 0, stuck: [], sea: false, t: 0, progress: 0 };
  let s = 3, air = 0, last = [v.x, v.z];
  while (s < trail.length - 8 && r.t < 120) {
    let best = Infinity;
    for (let q = s - 5; q < s + 20; q += 0.5) {
      const pt = pointAt(trail.path, trail.cum, q);
      const d = Math.hypot(pt.x - v.x, pt.z - v.z);
      if (d < best) { best = d; s = q; }
    }
    const tgt = pointAt(trail.path, trail.cum, s + 7);
    let err = Math.atan2(-(tgt.x - v.x), -(tgt.z - v.z)) - v.heading;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    p.setIntents(v, { throttle: Math.abs(err) > 0.6 ? 0.3 : 1, brake: 0, steer: Math.max(-1, Math.min(1, err * 2)) });
    const wasAir = v.airborne;
    p.step(1 / 60);
    r.t += 1 / 60;
    if (v.airborne) air += 1 / 60;
    else if (wasAir) { if (air > 0.15) r.jumps++; air = 0; }
    if (v.y < map.waterLevel - 0.3) r.sea = true;
    if (best > trail.width / 2 + 1.5) r.offroad += 1 / 60;
    if (Math.round(r.t * 60) % 120 === 0) {
      if (Math.hypot(v.x - last[0], v.z - last[1]) < 1) r.stuck.push([+v.x.toFixed(1), +v.z.toFixed(1)]);
      last = [v.x, v.z];
    }
  }
  r.progress = s / trail.length;
  return r;
}

for (const trail of T.trails) {
  if (trail.length < 30) continue;
  const r = drive(trail);
  assert.ok(r.progress > 0.8, `${trail.id}: only reached ${(r.progress * 100).toFixed(0)}%`);
  assert.deepEqual(r.stuck, [], `${trail.id}: stuck at ${JSON.stringify(r.stuck)}`);
  assert.ok(!r.sea, `${trail.id}: fell into the sea`);
  assert.ok(r.offroad < 1, `${trail.id}: ${r.offroad.toFixed(1)} s off the road`);
  if (trail.id === 'forest') assert.ok(r.jumps >= 3, `forest crests should launch the car (got ${r.jumps})`);
}
// From the spawn the car must reach every road leaving the paddock.
function reach(target) {
  const p = new ArcadePhysics({ bounds: w.bounds, terrain: { heightAt: T.heightAt, slopeAlong: T.slopeAlong, surfaceAt: S.surfaceAt } });
  w.colliders.forEach(c => p.addStatic(c));
  const v = p.createVehicle({ pos: map.spawn.pos, heading: map.spawn.heading });
  for (let t = 0; t < 15; t += 1 / 60) {
    const dx = target[0] - v.x, dz = target[1] - v.z;
    if (Math.hypot(dx, dz) < 3) return true;
    let err = Math.atan2(-dx, -dz) - v.heading;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    p.setIntents(v, { throttle: Math.abs(err) > 0.8 ? 0.3 : 0.7, brake: 0, steer: Math.max(-1, Math.min(1, err * 2)) });
    p.step(1 / 60);
  }
  return false;
}
for (const id of ['forest', 'town', 'valley']) {
  const t = map.trails.find(t => t.id === id);
  assert.ok(reach(t.points[0]), `spawn can't reach the ${id} road at ${t.points[0]}`);
}

// Every special stage can be completed: arm in the start box, count down, drive to the finish.
{
  const { createStageSystem } = await import(root + '/src/game/stages.js');
  const { createBus } = await import(root + '/src/core/events.js');
  for (const cfg of map.stages) {
    const bus = createBus();
    const events = [];
    for (const t of ['stage:go', 'stage:split', 'stage:finish', 'stage:abort', 'stage:note']) bus.on(t, e => events.push([t, e]));
    const stages = createStageSystem({ stages: [cfg], trails: T.trails, bus });
    const trail = T.trails.find(t => t.id === cfg.trail);
    const p = new ArcadePhysics({ bounds: w.bounds, terrain: { heightAt: T.heightAt, slopeAlong: T.slopeAlong, surfaceAt: S.surfaceAt } });
    w.colliders.forEach(c => p.addStatic(c));
    const a = pointAt(trail.path, trail.cum, cfg.from);
    const v = p.createVehicle({ pos: [a.x, a.z], heading: Math.atan2(-a.tx, -a.tz) });
    let s = cfg.from;
    for (let t = 0; t < 90 && !events.some(e => e[0] === 'stage:finish' || e[0] === 'stage:abort'); t += 1 / 60) {
      const go = stages.state === 'running';
      let best = Infinity;
      for (let q = s - 5; q < s + 20; q += 0.5) {
        const pt = pointAt(trail.path, trail.cum, q);
        const d = Math.hypot(pt.x - v.x, pt.z - v.z);
        if (d < best) { best = d; s = q; }
      }
      const tgt = pointAt(trail.path, trail.cum, s + 7);
      let err = Math.atan2(-(tgt.x - v.x), -(tgt.z - v.z)) - v.heading;
      while (err > Math.PI) err -= 2 * Math.PI;
      while (err < -Math.PI) err += 2 * Math.PI;
      p.setIntents(v, go
        ? { throttle: Math.abs(err) > 0.6 ? 0.3 : 1, brake: 0, steer: Math.max(-1, Math.min(1, err * 2)) }
        : { throttle: 0, brake: 0, steer: 0 });
      p.step(1 / 60);
      stages.update(1 / 60, v);
    }
    const fin = events.find(e => e[0] === 'stage:finish');
    const abort = events.find(e => e[0] === 'stage:abort');
    assert.ok(fin, `${cfg.name}: did not finish${abort ? ' (' + abort[1].reason + ')' : ''}`);
    assert.equal(events.filter(e => e[0] === 'stage:split').length, cfg.splits.length, `${cfg.name}: splits`);
    assert.equal(fin[1].penalty, 0, `${cfg.name}: autopilot run should be clean`);
    const notes = events.filter(e => e[0] === 'stage:note').map(e => e[1].text);
    console.log(`  ${cfg.name} ${trail.id.padEnd(6)} ${fin[1].time.toFixed(1)}s (target ${cfg.target}s)  notes: ${notes.join(' | ')}`);
  }
}

// The 24H loop can be driven start to finish on the real map.
{
  const { createLoop24 } = await import(root + '/src/game/loop24.js');
  const { createBus } = await import(root + '/src/core/events.js');
  const bus = createBus();
  const events = [];
  for (const t of ['loop:start', 'loop:milestone', 'loop:finish', 'loop:pause']) bus.on(t, () => events.push(t));
  const route = w.route;
  const loop = createLoop24({ route, start: map.loop24.start, milestones: [1, 2, 3, 4, 5, 6].map(i => ({ year: i })), bus });
  const p = new ArcadePhysics({ bounds: w.bounds, terrain: { heightAt: T.heightAt, slopeAlong: T.slopeAlong, surfaceAt: S.surfaceAt } });
  w.colliders.forEach(c => p.addStatic(c));
  const a = pointAt(route.path, route.cum, 2);
  const v = p.createVehicle({ pos: [a.x, a.z], heading: Math.atan2(-a.tx, -a.tz) });
  let s = 2, t = 0;
  for (; t < 240 && !events.includes('loop:finish') && !events.includes('loop:pause'); t += 1 / 60) {
    let best = Infinity;
    for (let q = s - 5; q < s + 20; q += 0.5) {
      const pt = pointAt(route.path, route.cum, q);
      const d = Math.hypot(pt.x - v.x, pt.z - v.z);
      if (d < best) { best = d; s = q; }
    }
    const tgt = pointAt(route.path, route.cum, s + 7);
    let err = Math.atan2(-(tgt.x - v.x), -(tgt.z - v.z)) - v.heading;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    p.setIntents(v, { throttle: Math.abs(err) > 0.6 ? 0.3 : 1, brake: 0, steer: Math.max(-1, Math.min(1, err * 2)) });
    p.step(1 / 60);
    loop.update(1 / 60, v);
  }
  assert.deepEqual(events.filter(e => e !== 'loop:milestone'), ['loop:start', 'loop:finish'], `24H events: ${events}`);
  assert.equal(events.filter(e => e === 'loop:milestone').length, 6);
  console.log(`  24H lap ${route.length.toFixed(0)} m in ${t.toFixed(0)} s`);
}

console.log('all world tests passed');
