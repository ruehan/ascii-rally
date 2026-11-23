import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).href.replace(/\/$/, '');
const { smoothPath, cumulative } = await import(root + '/src/world/path.js');
const { paceNotes } = await import(root + '/src/game/paceNotes.js');
const { createStageSystem } = await import(root + '/src/game/stages.js');
const { createZoneSystem } = await import(root + '/src/game/zones.js');
const { createBus } = await import(root + '/src/core/events.js');
const { formatTime } = await import(root + '/src/game/leaderboard.js');

const trail = (id, points, extra = {}) => {
  const path = smoothPath(points, 1);
  return { id, path, cum: cumulative(path), width: 6, crests: [], ...extra };
};
const record = bus => {
  const log = [];
  for (const t of ['stage:near', 'stage:armed', 'stage:count', 'stage:go', 'stage:split', 'stage:note', 'stage:finish', 'stage:abort',
    'zone:enter', 'zone:exit', 'zone:open']) bus.on(t, p => log.push([t, p]));
  return log;
};
const types = log => log.map(e => e[0]);

// --- Pace notes ---------------------------------------------------------------
{
  const straight = trail('a', [[0, 0], [0, -200]]);
  assert.deepEqual(paceNotes({ ...straight, from: 0, to: 200 }), [], 'straight road: no notes');

  // North, then a tight right (east). Yaw convention: left = positive.
  const right = trail('b', [[0, 0], [0, -60], [6, -70], [60, -72], [120, -72]]);
  const notes = paceNotes({ ...right, from: 0, to: 180 });
  assert.equal(notes.length, 1, JSON.stringify(notes));
  assert.match(notes[0].text, /^R[1-3]/, 'tight right turn');

  const left = trail('c', [[0, 0], [0, -60], [-60, -120], [-60, -200]]);
  assert.match(paceNotes({ ...left, from: 0, to: 230 })[0].text, /^L/, 'left turn');

  const crest = trail('d', [[0, 0], [0, -200]], { crests: [{ at: 100, length: 20, height: 2 }] });
  assert.deepEqual(paceNotes({ ...crest, from: 0, to: 200 }).map(n => n.text), ['crest ! jump']);
}

// --- Stage: clean run -----------------------------------------------------------
const straightTrail = trail('t', [[0, 0], [0, -300]]);
const stageCfg = { id: 'ss', name: 'SS', trail: 't', from: 20, to: 220, splits: [80, 150], target: 20 };

function run({ jump = false, wander = false } = {}) {
  const bus = createBus();
  const log = record(bus);
  const st = createStageSystem({ stages: [stageCfg], trails: [straightTrail], bus });
  const v = { x: 0, z: -20, speed: 0 };
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) st.update(dt, v);                // arm
  for (let i = 0; i < 3 * 60 + 5; i++) {                        // countdown
    if (jump && i === 30) { v.z -= 2; }
    st.update(dt, v);
  }
  v.speed = 10;
  for (let i = 0; i < 40 * 60 && st.state === 'running'; i++) {
    v.z -= v.speed * dt;
    if (wander && v.z < -100) v.x += 1; // drive away from the route
    st.update(dt, v);
  }
  return log;
}

{
  const log = run();
  const t = types(log);
  assert.deepEqual(t.filter(x => x !== 'stage:note'),
    ['stage:near', 'stage:armed', 'stage:count', 'stage:count', 'stage:count', 'stage:go', 'stage:split', 'stage:split', 'stage:finish']);
  const fin = log.find(e => e[0] === 'stage:finish')[1];
  assert.ok(Math.abs(fin.time - 20) < 0.5, `200 m at 10 m/s ≈ 20 s, got ${fin.time}`);
  assert.equal(fin.penalty, 0);
}
{
  const fin = run({ jump: true }).find(e => e[0] === 'stage:finish')[1];
  assert.equal(fin.penalty, 5, 'jump start penalty');
}
{
  const log = run({ wander: true });
  assert.ok(types(log).includes('stage:abort'), 'leaving the route aborts');
  assert.ok(!types(log).includes('stage:finish'));
}

// --- Zones ----------------------------------------------------------------------------
{
  const bus = createBus();
  const log = record(bus);
  const zs = createZoneSystem({ zones: [{ id: 'z', pos: [0, 0], r: 5 }], bus });
  const v = { x: 20, z: 0, speed: 5 };
  const step = n => { for (let i = 0; i < n; i++) zs.update(1 / 60, v); };
  step(10);
  v.x = 0; step(10);                 // drive in (still moving)
  v.speed = 0; step(60);             // stop 1 s → opens once
  step(120);                         // stay → no second open
  v.speed = 5; v.x = 6; step(5);     // within hysteresis: still inside
  v.x = 9; step(5);                  // out
  assert.deepEqual(types(log), ['zone:enter', 'zone:open', 'zone:exit']);
}

assert.equal(formatTime(83.42), '1:23.4');
assert.equal(formatTime(9.96), '0:10.0');
assert.equal(formatTime(59.96), '1:00.0');
console.log('all game tests passed');
