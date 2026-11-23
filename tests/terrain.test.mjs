import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).href.replace(/\/$/, '');
const { createTerrain } = await import(root + '/src/world/terrain.js');
const { createSurfaces } = await import(root + '/src/world/surfaces.js');
const { ArcadePhysics } = await import(root + '/src/physics/arcade.js');

const near = (a, b, e = 1e-6, msg = '') => assert.ok(Math.abs(a - b) < e, `${msg} ${a} != ${b}`);

// --- Determinism --------------------------------------------------------------
const cfg = {
  size: 100, cell: 2, seed: 3,
  base: { height: 2, amp: 3, wavelength: 20 },
  features: [
    { type: 'hill', pos: [10, 10], r: 20, height: 8 },
    { type: 'pad', pos: [-20, -20], r: 8, y: 5 },
    { type: 'trail', points: [[-40, 30], [0, 0], [30, -35]], width: 6 },
  ],
};
const a = createTerrain(cfg);
const b = createTerrain(cfg);
assert.deepEqual(Array.from(a.heights), Array.from(b.heights), 'same seed -> same heights');
const c = createTerrain({ ...cfg, seed: 4 });
assert.notDeepEqual(Array.from(a.heights), Array.from(c.heights), 'different seed differs');

// --- Pad is flat -------------------------------------------------------------
for (const [x, z] of [[-20, -20], [-24, -18], [-16, -23], [-20, -13]]) near(a.heightAt(x, z), 5, 1e-4, 'pad');

// --- heightAt is continuous across cell edges/diagonals ----------------------
for (let i = 0; i < 2000; i++) {
  const x = -45 + Math.random() * 90, z = -45 + Math.random() * 90;
  const d = a.heightAt(x, z) - a.heightAt(x + 1e-4, z + 1e-4);
  assert.ok(Math.abs(d) < 0.01, `discontinuity at ${x},${z}: ${d}`);
}

// --- Trail cross-section is flat ---------------------------------------------
{
  // Trail passes through (0,0) heading SE; perpendicular is roughly (1,1)/√2.
  const h0 = a.heightAt(0, 0);
  near(a.heightAt(1.5, 1.2), h0, 0.15, 'trail cross-section');
}

// --- Vehicle on a slope rolls downhill ----------------------------------------
const slope = { heightAt: (x, z) => 0.1 * z, slopeAlong: (x, z, dx, dz) => 0.1 * dz, surfaceAt: () => 'asphalt' };
{
  const p = new ArcadePhysics({ terrain: slope });
  const v = p.createVehicle({ pos: [0, 0] }); // facing -z = downhill (h decreases)
  for (let i = 0; i < 120; i++) p.step(1 / 60);
  assert.ok(v.speed > 0.5, `rolls forward downhill: ${v.speed}`);
  near(v.y, 0.1 * v.z, 0.05, 'stays on ground');
  assert.ok(v.pitch < 0, 'nose down when facing downhill');
}

// --- Crest launches the car and it lands -----------------------------------
{
  // Ramp up to z=-20 then a sharp drop: h = 2 at the lip, 0 beyond.
  const ramp = {
    heightAt: (x, z) => (z > 0 ? 0 : z > -20 ? -z * 0.1 : Math.max(0, 2 + (z + 20) * 1.0)),
    slopeAlong: () => 0,
    surfaceAt: () => 'asphalt',
  };
  const p = new ArcadePhysics({ terrain: ramp });
  const v = p.createVehicle({ pos: [0, 10] });
  p.setSpeed(v, 18);
  p.setIntents(v, { throttle: 1, brake: 0, steer: 0 });
  let flew = false, landed = false;
  for (let i = 0; i < 240; i++) {
    p.step(1 / 60);
    if (v.airborne) flew = true;
    if (flew && !v.airborne) { landed = true; break; }
  }
  assert.ok(flew, 'took off over the lip');
  assert.ok(landed, 'landed within 4 s');
}

// --- Surfaces: grass slower than asphalt ------------------------------------
{
  const topSpeed = surface => {
    const p = new ArcadePhysics({ terrain: { heightAt: () => 0, slopeAlong: () => 0, surfaceAt: () => surface } });
    const v = p.createVehicle({ car: 'gt' }); // slicks: surface matters
    p.setIntents(v, { throttle: 1, brake: 0, steer: 0 });
    for (let i = 0; i < 600; i++) p.step(1 / 60);
    return v.speed;
  };
  const asphalt = topSpeed('asphalt'), grass = topSpeed('grass');
  assert.ok(asphalt > grass + 3, `asphalt ${asphalt} vs grass ${grass}`);
}

// --- Surface map stamps trails and pads ---------------------------------------
{
  const s = createSurfaces({ size: 100, trails: a.trails.map(t => ({ ...t, surface: 'gravel' })), pads: [{ pos: [-20, -20], r: 8 }] });
  assert.equal(s.surfaceAt(0, 0), 'gravel');
  assert.equal(s.surfaceAt(-20, -20), 'pad');
  assert.equal(s.surfaceAt(40, 40), 'grass');
  assert.ok(s.insideAt(0, 0) > 2, 'centre of a 6 m road is ~3 m inside');
}

console.log('all terrain tests passed');

// --- Chunked terrain mesh matches the heightfield and heightAt's triangle split ---
{
  const THREE = await import('three');
  const { createTerrainMesh } = await import(root + '/src/world/terrainMesh.js');
  const t = createTerrain({ ...cfg, size: 240 }); // 121² verts → 3×3 chunks
  const s = createSurfaces({ size: 240, trails: [], pads: [] });
  const group = createTerrainMesh(t, s);
  assert.ok(group.children.length === 9, `chunks: ${group.children.length}`);
  const tri = new THREE.Triangle(), p = new THREE.Vector3();
  for (const mesh of group.children) {
    const pos = mesh.geometry.attributes.position, idx = mesh.geometry.index.array;
    for (let i = 0; i < pos.count; i += 7) near(pos.getY(i), t.heightAt(pos.getX(i), pos.getZ(i)), 1e-4, 'vertex y');
    // Centroids of a few triangles must lie on heightAt.
    for (let k = 0; k < idx.length; k += 6 * 97) {
      tri.a.fromBufferAttribute(pos, idx[k]); tri.b.fromBufferAttribute(pos, idx[k + 1]); tri.c.fromBufferAttribute(pos, idx[k + 2]);
      tri.getMidpoint(p);
      near(p.y, t.heightAt(p.x, p.z), 1e-3, 'triangle split');
    }
  }
  console.log('terrain chunk tests passed');
}

// --- flat / plane polygons ---------------------------------------------------
{
  const t = createTerrain({
    size: 200, cell: 2, seed: 5, base: { height: 2, amp: 3, wavelength: 20 },
    features: [
      { type: 'flat', polygon: [[-60, -60], [0, -60], [0, 0], [-60, 0]], y: 7, falloff: 10 },
      { type: 'plane', polygon: [[20, 20], [80, 20], [80, 80], [20, 80]], origin: [20, 20], y: 3, slope: [0, 0.05], falloff: 10 },
    ],
  });
  for (const [x, z] of [[-50, -50], [-10, -10], [-30, -2]]) near(t.heightAt(x, z), 7, 1e-4, 'flat');
  near(t.heightAt(50, 20), 3, 1e-4, 'plane origin row');
  near(t.heightAt(50, 70), 3 + 50 * 0.05, 1e-4, 'plane slope');
  console.log('flat/plane tests passed');
}

// --- fast roads on the real map have no unintended crests ------------------------
// A car leaves the ground where v²·κ > g (vertical gravity 12): at ~340 km/h
// any convex vertical curve tighter than ~740 m launches it.
{
  const map = (await import(root + '/src/world/map.js')).default;
  const features = [...map.terrain.features, ...map.zones.map(z => ({ type: 'pad', pos: z.pos, r: z.r, y: z.y })), ...map.trails.map(t => ({ type: 'trail', ...t }))];
  const T = createTerrain({ size: map.size, ...map.terrain, features });
  // Minimum convex radius (m) ≈ (design speed)² / 12.
  const FAST = { gp: 600, straight: 700, link: 400, 'coast-e': 300, pass: 200, vigna: 250, valley: 150 };
  for (const [id, minR] of Object.entries(FAST)) {
    const t = T.trails.find(tr => tr.id === id);
    let worst = Infinity, at = 0;
    for (let s = 20; s < t.length - 20; s += 5) {
      const k = (t.profileAt(s - 20) - 2 * t.profileAt(s) + t.profileAt(s + 20)) / 400; // h''
      if (k < 0 && -1 / k < worst) { worst = -1 / k; at = s; }
    }
    assert.ok(worst >= minR, `${id}: convex radius ${worst.toFixed(0)} m at s=${at} (< ${minR})`);
  }
  console.log('fast road profile tests passed');
}
