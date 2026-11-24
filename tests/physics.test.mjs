import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).href.replace(/\/$/, '');
const { circle, box, circleContact } = await import(root + '/src/physics/shapes.js');
const { SpatialHash } = await import(root + '/src/physics/spatialHash.js');
const { ArcadePhysics } = await import(root + '/src/physics/arcade.js');
const c = { nx: 0, nz: 0, depth: 0 };
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

// circle vs circle
assert.ok(circleContact(circle(0, 0, 1), 1.5, 0, 1, c)); near(c.nx, 1); near(c.depth, 0.5);
assert.ok(!circleContact(circle(0, 0, 1), 3, 0, 1, c));
// axis box, approach from +x
assert.ok(circleContact(box(0, 0, 2, 1), 2.5, 0, 1, c)); near(c.nx, 1); near(c.nz, 0); near(c.depth, 0.5);
// rotated 90deg (three yaw): hx now spans z. Point at z=+2.5 should hit, x=+2.5 should not.
assert.ok(circleContact(box(0, 0, 2, 0.5, Math.PI / 2), 0, 2.5, 1, c)); near(Math.abs(c.nz), 1); near(c.depth, 0.5);
assert.ok(!circleContact(box(0, 0, 2, 0.5, Math.PI / 2), 2.5, 0, 1, c));
// centre inside box -> pushed out along shallow axis
assert.ok(circleContact(box(0, 0, 2, 1), 0.2, 0.8, 0.5, c)); near(c.nz, 1); near(c.depth, 0.7);

// spatial hash dedupe
const h = new SpatialHash(8);
const big = box(0, 0, 20, 20); h.insert(big); h.insert(circle(100, 100, 1));
assert.equal(h.query(0, 0, 30).length, 1);
assert.equal(h.query(100, 100, 2).length, 1);

// car classes: realistic acceleration / top speed (flat asphalt)
const { CARS } = await import(root + '/src/vehicle/cars.js');
const flat = surface => ({ heightAt: () => 0, slopeAlong: () => 0, surfaceAt: () => surface });
for (const id of ['rally', 'formula', 'gt']) {
  const p = new ArcadePhysics({ bounds: { type: 'circle', r: 1e5 }, terrain: flat('asphalt') });
  const v = p.createVehicle({ pos: [0, 0], car: id });
  p.setIntents(v, { throttle: 1, brake: 0, steer: 0 });
  let t100 = null;
  for (let t = 0; t < 60; t += 1 / 60) { p.step(1 / 60); if (t100 === null && v.speed >= 100 / 3.6) t100 = t; }
  const c = CARS[id];
  assert.ok(Math.abs(t100 - c.zeroTo100) < 0.6, `${id} 0-100 ${t100.toFixed(2)} vs spec ${c.zeroTo100}`);
  assert.ok(Math.abs(v.speed * 3.6 - c.vmax) < c.vmax * 0.05, `${id} top ${(v.speed * 3.6).toFixed(0)} vs ${c.vmax}`);
  assert.ok(v.z < -50, 'moves toward -Z');
}

// slicks are hopeless on gravel; rally tyres aren't
{
  const top = (id, surface) => {
    const p = new ArcadePhysics({ terrain: flat(surface) });
    const v = p.createVehicle({ car: id });
    p.setIntents(v, { throttle: 1, brake: 0, steer: 0 });
    for (let i = 0; i < 3600; i++) p.step(1 / 60);
    return v.speed * 3.6;
  };
  assert.ok(top('formula', 'gravel') < 80, 'F1 bogs down on gravel');
  assert.ok(top('rally', 'gravel') > 180, 'rally car flies on gravel');
}

// handbrake makes the car rotate and slide (drift)
{
  const p = new ArcadePhysics({ terrain: flat('gravel') });
  const v = p.createVehicle({ car: 'rally' });
  p.setSpeed(v, 20);
  let maxSlip = 0;
  for (let i = 0; i < 60; i++) {
    p.setIntents(v, { throttle: 0.5, brake: 0, steer: 1, handbrake: i < 30 ? 1 : 0 });
    p.step(1 / 60);
    maxSlip = Math.max(maxSlip, Math.abs(v.slip));
  }
  assert.ok(maxSlip > 3, `handbrake turn slides sideways (${maxSlip.toFixed(1)} m/s)`);
}

// single bounce when hitting two overlapping obstacles
const p2 = new ArcadePhysics({ bounds: { type: 'circle', r: 1000 } });
p2.addStatic(circle(-0.5, -3, 1)); p2.addStatic(circle(0.5, -3, 1));
const v2 = p2.createVehicle({ pos: [0, 0] });
p2.setSpeed(v2, 10); p2.setIntents(v2, { throttle: 0, brake: 0, steer: 0 });
let bounced = false;
for (let i = 0; i < 60 && !bounced; i++) { p2.step(1 / 60); if (v2.speed < 0) bounced = true; }
assert.ok(bounced, 'bounced');
assert.ok(v2.speed > -10 * 0.3 - 1e-6 && v2.speed < 0, `one bounce: ${v2.speed}`);

// bounds clamp
const p3 = new ArcadePhysics({ bounds: { type: 'circle', r: 10 } });
const v3 = p3.createVehicle({ pos: [0, 0] });
p3.setIntents(v3, { throttle: 1, brake: 0, steer: 0 });
for (let i = 0; i < 600; i++) p3.step(1 / 60);
assert.ok(Math.hypot(v3.x, v3.z) <= 10 + 1e-6);
console.log('all physics tests passed');

// handbrake holds the car on a slope (parking brake)
{
  const slope = { heightAt: (x, z) => 0.2 * z, slopeAlong: (x, z, dx, dz) => 0.2 * dz, surfaceAt: () => 'asphalt' };
  const p = new ArcadePhysics({ terrain: slope });
  const v = p.createVehicle({ car: 'rally' });
  p.setIntents(v, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
  for (let i = 0; i < 120; i++) p.step(1 / 60);
  assert.ok(Math.abs(v.z) < 0.05, `held on a 20% slope (moved ${v.z.toFixed(2)} m)`);
  p.setIntents(v, { throttle: 0, brake: 0, steer: 0, handbrake: 0 });
  for (let i = 0; i < 60; i++) p.step(1 / 60);
  assert.ok(Math.abs(v.z) > 0.5, 'rolls once released');
  console.log('handbrake hold passed');
}

// every car defines grip for every surface (a missing one would silently fall back)
{
  const { SURFACE_NAMES } = await import(root + '/src/world/surfaces.js');
  for (const [id, c] of Object.entries(CARS)) {
    for (const s of SURFACE_NAMES) assert.ok(typeof c.tyres[s] === 'number', `${id} lacks tyres.${s}`);
  }
  console.log('tyre table complete');
}

// Realism: braking distances, engine braking, weight transfer, terrain effects.
{
  const flatT = (surface, slope = 0, side = 0) => ({
    heightAt: () => 0,
    // slopeAlong(x,z,dx,dz): rise per metre along (dx,dz); +x is "right" when facing -Z.
    slopeAlong: (x, z, dx, dz) => -dz * slope + dx * side,
    surfaceAt: () => surface,
  });
  const run = (id, terrain, kmh, intents, secs) => {
    const p = new ArcadePhysics({ terrain });
    const v = p.createVehicle({ car: id });
    p.setSpeed(v, kmh / 3.6);
    p.setIntents(v, intents);
    const z0 = v.z;
    let t = 0;
    while (t < secs && !(intents.brake && v.speed < 0.3)) { p.step(1 / 120); t += 1 / 120; }
    return { v, dist: z0 - v.z, t };
  };
  // 100→0 km/h on asphalt within real-world ranges (road-legal ~35 m, F1 ~20 m).
  const stop = { rally: [28, 40], formula: [15, 24], hypercar: [17, 27], gt: [20, 30], trail: [36, 52] };
  for (const [id, [lo, hi]] of Object.entries(stop)) {
    const { dist } = run(id, flatT('asphalt'), 100, { brake: 1 }, 10);
    assert.ok(dist > lo && dist < hi, `${id} 100-0 in ${dist.toFixed(1)} m (expected ${lo}–${hi})`);
  }
  // Lifting off slows the car more than drag alone (engine braking).
  const coast = run('gt', flatT('asphalt'), 120, { throttle: 0 }, 1).v.speed * 3.6;
  assert.ok(coast < 120 - 4, `engine braking: 120 → ${coast.toFixed(1)} km/h after 1 s`);
  // Sand drags every car: the 4x4 is slower on dunes than on dirt.
  const top = s => run('trail', flatT(s), 0, { throttle: 1 }, 15).v.speed;
  assert.ok(top('dune') < top('dirt') * 0.9, 'dunes slow even the 4x4');
  // A steep cross-slope (40%) slides a parked car on ice (μ 0.35), not on asphalt.
  const slide = s => { const { v } = run('rally', flatT(s, 0, 0.4), 0, { handbrake: 1 }, 2); return Math.abs(v.x); };
  assert.ok(slide('ice') > 1 && slide('asphalt') < 0.2, `cross-slope: ice ${slide('ice').toFixed(2)} m, asphalt ${slide('asphalt').toFixed(2)} m`);
  // Weight transfer: hard braking unloads the rear, so the car rotates more
  // in a braked turn than in a coasting one (lift-off / trail-brake oversteer).
  const yaw = brake => { const { v } = run('gt', flatT('asphalt'), 120, { brake, steer: 0.6 }, 0.8); return Math.abs(v.heading); };
  assert.ok(yaw(1) > 0 && yaw(0) > 0, 'turns');
  const { v: vb } = run('gt', flatT('asphalt'), 120, { brake: 1 }, 0.5);
  assert.ok(vb.ax < -9, `braking decel registers (${(vb.ax / 9.81).toFixed(2)} g)`);
  assert.ok(vb.bodyPitch < -0.01, `nose dives under braking (${vb.bodyPitch.toFixed(3)} rad)`);
  assert.ok(Math.abs(vb.pitch) < 1e-6, 'the wheels stay flat on flat ground');
  console.log('realism checks passed');
}

// --- Moving obstacles (traffic) ----------------------------------------------
{
  const { box } = await import('../src/physics/shapes.js');
  const p = new ArcadePhysics({});
  const v = p.createVehicle({ pos: [0, 0], heading: 0 });
  // A box driving towards the parked car from ahead (the car faces -z).
  const body = { shape: box(0, -8, 1, 2.2, 0, 1.5, 0), vx: 0, vz: 5, hits: 0, onHit(speed) { this.hits++; this.speed = speed; } };
  p.addDynamic(body);
  p.setIntents(v, { handbrake: 0 });
  for (let i = 0; i < 120; i++) { body.shape.z += body.vz / 120; p.step(1 / 120); }
  assert.ok(body.hits > 0 && body.speed > 3, `the moving box hits the parked car (${body.speed?.toFixed(1)} m/s)`);
  assert.ok(v.z > 0.3 && v.hit !== undefined, `and shoves it back (${v.z.toFixed(2)} m)`);
  const gap = Math.abs(v.z - body.shape.z);
  assert.ok(gap >= 2.2 + v.radius - 0.05, `no overlap left (${gap.toFixed(2)} m)`);
  // Driving into a stopped obstacle: the car bounces off, the obstacle is told.
  const p2 = new ArcadePhysics({});
  const v2 = p2.createVehicle({ pos: [0, 0], heading: 0 });
  const wall = { shape: box(0, -12, 1, 2.2, 0, 1.5, 0), vx: 0, vz: 0, onHit(speed) { this.speed = speed; } };
  p2.addDynamic(wall);
  p2.setSpeed(v2, 12);
  let hit = 0;
  for (let i = 0; i < 240; i++) { p2.step(1 / 120); hit = Math.max(hit, v2.hit); }
  assert.ok(hit > 5 && wall.speed > 5, `crash registers on both (${hit.toFixed(1)} m/s)`);
  assert.ok(v2.z > -12 + 2.2, 'car stays outside the obstacle');
  console.log('moving obstacle checks passed');
}

