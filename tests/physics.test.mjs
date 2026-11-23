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
