import * as THREE from 'three';
import { AsciiRenderer } from './render/ascii.js';
import { createLighting } from './render/lighting.js';
import { createCameraRig } from './render/camera.js';
import { updateCutaway } from './render/cutaway.js';
import { buildWorld } from './world/build.js';
import map from './world/map.js';
import { ArcadePhysics } from './physics/arcade.js';
import { CarView } from './vehicle/car.js';
import { CAR_ORDER, DEFAULT_CAR } from './vehicle/cars.js';
import { readIntents } from './vehicle/controller.js';
import { createInput } from './core/input.js';
import { createLoop } from './core/loop.js';
import { createBus } from './core/events.js';
import { createZoneSystem } from './game/zones.js';
import { createStageSystem } from './game/stages.js';
import { createUI } from './ui/ui.js';
import { createParticles } from './fx/particles.js';
import { createAudio } from './fx/audio.js';
import { createLoop24 } from './game/loop24.js';
import { createBoosts } from './game/boosts.js';
import { sampleTime } from './render/timeOfDay.js';
import { milestones } from './content/content.js';
import { buildMapGrid } from './ui/mapGrid.js';
import { createMapUI } from './ui/map.js';
import { createPerfOverlay } from './ui/perf.js';
import { t, i18n, zoneName } from './ui/i18n.js';
import { settings } from './ui/settings.js';
import { createSettingsMenu } from './ui/settingsMenu.js';
import { createBoot } from './ui/boot.js';
import { TIERS, guessTier, createAutoQuality } from './render/quality.js';

// Boot screen is already up (index.html); let it paint before the heavy build.
const boot = createBoot();
await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

// --- Renderer -------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false; // count draw calls across all passes per frame
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
const ascii = new AsciiRenderer(renderer, { cellSize: settings.get('glyph') });
ascii.setColor(settings.get('colour'));
ascii.setEdges(settings.get('edges'));

// --- World + physics ------------------------------------------------------
const world = buildWorld(scene, map);
const { terrain, surfaces } = world;
const lighting = createLighting(scene);
// Nothing past the fog is visible; keep the far plane tight for depth precision.
camera.far = scene.fog.far + 10;
camera.updateProjectionMatrix();

const physics = new ArcadePhysics({
  bounds: world.bounds,
  terrain: { heightAt: terrain.heightAt, slopeAlong: terrain.slopeAlong, surfaceAt: world.surfaceAt },
});
world.colliders.forEach(s => physics.addStatic(s));
// Chosen car persists per browser (guarded: storage may be unavailable).
const savedCar = (() => { try { return localStorage.getItem('stage~/car'); } catch { return null; } })();
let carId = CAR_ORDER.includes(savedCar) ? savedCar : DEFAULT_CAR;
const vehicle = physics.createVehicle({ pos: world.spawn.pos, heading: world.spawn.heading, car: carId });
const car = new CarView(scene, carId);
const rig = createCameraRig(camera, terrain);

// --- Game systems ---------------------------------------------------------
const bus = createBus();
const zones = createZoneSystem({ zones: map.zones, bus });
const stages = createStageSystem({ stages: map.stages, trails: terrain.trails, bus });
const input = createInput();
const ui = createUI({ bus, stages, onPanel: open => { input.enabled = !open; }, getCar: () => carId });

function selectCar(id) {
  if (id === carId) return;
  carId = id;
  stages.abort();
  physics.setCar(vehicle, id);
  car.setModel(id);
  ascii.invalidate(); // nested meshes changed
  try { localStorage.setItem('stage~/car', id); } catch { /* not persisted */ }
  bus.emit('car:changed', { id });
}
bus.on('car:select', ({ id }) => selectCar(id));
const particles = createParticles(scene);
const audio = createAudio();
const wheels = [[0, 0, 0], [0, 0, 0]];

// Audio may only start after a user gesture.
const unlockAudio = () => audio.unlock();
window.addEventListener('keydown', unlockAudio, { once: true });
window.addEventListener('pointerdown', unlockAudio, { once: true });

const boosts = createBoosts(map.boosts, terrain.trails);
const loop24 = createLoop24({ route: world.route, start: map.loop24.start, startHour: map.loop24.startHour, milestones, bus });

// Time of day: the 24H session drives the clock; otherwise a preset (T cycles).
const PRESETS = [15, 18.8, 23.5, 5.8];
let preset = 0;
let hour = PRESETS[0];
let look = sampleTime(hour);

bus.on('stage:count', () => audio.beep());
bus.on('stage:go', () => audio.beep(true));

// Respawn point: last place the car was settled on a road, refreshed every second.
const safe = { pos: [...world.spawn.pos], heading: world.spawn.heading, timer: 0 };
function respawn(at = safe) {
  if (at === safe) { // fell in the sea
    particles.splash(vehicle.x, world.waterLevel, vehicle.z);
    audio.splash();
  }
  stages.abort();
  loop24.reset();
  physics.resetVehicle(vehicle, at.pos, at.heading);
  car.sync(vehicle, 1, 0);
  rig.snap(car.object, vehicle);
}

// --- Input ----------------------------------------------------------------
// Shortcuts go through settings (persisted; the settings menu shows the same state).
input.onPress('KeyC', () => settings.toggle('colour'));
input.onPress('KeyG', () => ui.note(t('note.edges', { on: settings.toggle('edges') })));
input.onPress('KeyL', () => i18n.toggle());
input.onPress('KeyH', () => ui.toggleHelp());
input.onPress('KeyO', () => settingsMenu.toggle());
input.onPress(['Equal', 'NumpadAdd'], () => settings.set('glyph', Math.min(24, settings.get('glyph') + 2)));
input.onPress(['Minus', 'NumpadSubtract'], () => settings.set('glyph', Math.max(6, settings.get('glyph') - 2)));
input.onPress('KeyR', () => { ui.close(); respawn(world.spawn); });
input.onPress('KeyQ', () => selectCar(CAR_ORDER[(CAR_ORDER.indexOf(carId) + 1) % CAR_ORDER.length]));
input.onPress('KeyE', () => { if (!mapUI.isOpen && !ui.close()) zones.open(); });
// Esc closes whatever is open; with nothing open it opens the settings.
input.onPress('Escape', () => { if (!mapUI.close() && !ui.close()) settingsMenu.open(); });
input.onPress('KeyV', () => {
  settings.set('camera', settings.get('camera') === 'chase' ? 'top' : 'chase');
  ui.note(t('note.camera', { mode: settings.get('camera') }));
});
input.onPress('KeyN', () => ui.note(t('note.sound', { on: settings.toggle('sound') })));
input.onPress('KeyT', () => {
  if (loop24.state === 'running') return ui.note(t('note.time24'));
  preset = (preset + 1) % PRESETS.length;
  ui.note(t('note.time', { i: preset }));
});

// --- Where am I / where next -------------------------------------------------
function place() {
  const z = zones.current;
  if (z) return z.path;
  const { x, z: zz } = vehicle;
  // Outer regions first (see src/world/regions/*), then the home valley.
  if (zz > 235 && x > -290 && x < 370) return '~/grand-prix';
  if (x < -280 && zz > 180) return '~/desert';
  if (x < -200 && zz < -250) return '~/snow';
  if (x < -200) return '~/mountains';
  if (x > 205 && x < 480 && zz > -240 && zz < 200) return '~/vineyards';
  if (x > 205) return '~/endurance';
  if (zz < -110) return '~/coast';
  if (x < -20) return '~/forest';
  if (x > 30 && zz < 100) return '~/old-town';
  return '~/valley';
}

/** Nearest stage start or zone not yet visited this session (hidden ones are for finding). */
const targets = [
  ...stages.stages.filter(st => !st.hidden).map(st => ({ id: st.id, name: () => t('nav.start', { name: st.name }), x: st.start.x, z: st.start.z })),
  ...map.zones.filter(z => z.id !== 'paddock' && !z.hidden).map(z => ({ id: z.id, name: () => zoneName(z), x: z.pos[0], z: z.pos[1] })),
  { id: '24h', name: () => t('place.24h'), x: loop24.startPoint.x, z: loop24.startPoint.z },
];
bus.on('loop:finish', () => ui.visited.add('24h'));
function nextTarget() {
  let best = null;
  for (const t of targets) {
    if (ui.visited.has(t.id)) continue;
    const dist = Math.hypot(t.x - vehicle.x, t.z - vehicle.z);
    if (!best || dist < best.dist) best = { ...t, name: t.name(), dist };
  }
  if (!best || best.dist < 8) return null; // already there
  best.bearing = ((Math.atan2(best.x - vehicle.x, -(best.z - vehicle.z)) * 180 / Math.PI) + 360) % 360;
  return best;
}
let navTimer = 3;
function navNote(nav, dt) {
  navTimer -= dt;
  if (navTimer > 0 || !nav || stages.state !== 'idle' || Math.abs(vehicle.speed) < 2) return;
  navTimer = 8;
  const heading = ((-rig.yaw * 180 / Math.PI) % 360 + 360) % 360;
  const rel = ((nav.bearing - heading) % 360 + 360) % 360;
  const clock = Math.round(rel / 30) % 12 || 12;
  ui.note(t('note.nav', { name: nav.name, dist: Math.round(nav.dist), clock }));
}

// --- Map + fast travel -------------------------------------------------------------
const gridArgs = { terrain, surfaces, biomes: world.biomes, colliders: world.colliders, waterLevel: world.waterLevel };
const along = p => Math.atan2(-p.tx, -p.tz); // car heading that faces along a path tangent
const gateP = loop24.startPoint;
const gate = { x: gateP.x - gateP.tx * 12, z: gateP.z - gateP.tz * 12, heading: along(gateP) }; // just before the line
const zonePos = id => map.zones.find(z => z.id === id);
// Places on 1–6, career stages on 7–9, other stages on letters in stage
// order (no M: it closes the map). Hidden stages stay off the map.
const STAGE_KEYS = 'abcdefghijklnopqrstuvwxyz';
const stageNum = st => +(/\d+/.exec(st.name)?.[0] ?? 99);
const destinations = [
  { key: '1', label: () => t('place.paddock'), x: world.spawn.pos[0], z: world.spawn.pos[1], heading: world.spawn.heading },
  { key: '2', label: () => t('place.hq'), x: zonePos('piazza').pos[0], z: zonePos('piazza').pos[1], heading: 0 },
  { key: '3', label: () => t('place.garage'), x: zonePos('garage').pos[0], z: zonePos('garage').pos[1], heading: 0 },
  { key: '4', label: () => t('place.pitwall'), x: zonePos('pitwall').pos[0], z: zonePos('pitwall').pos[1], heading: 0 },
  { key: '5', label: () => t('place.24h'), ...gate },
  { key: '6', label: () => t('place.lookout'), x: zonePos('lookout').pos[0], z: zonePos('lookout').pos[1], heading: 0 },
  // Careers: the career stages' start boxes on 7–9.
  ...stages.stages.filter(st => st.career).map((st, i) => ({
    key: String(7 + i), group: 'careers', label: `${st.name} ${st.title}`.toLowerCase(),
    x: st.start.x, z: st.start.z, heading: along(st.start),
  })),
  ...stages.stages.filter(st => !st.hidden && !st.career).sort((a, b) => stageNum(a) - stageNum(b)).map((st, i) => ({
    key: STAGE_KEYS[i], group: 'stages', label: `${st.name} ${st.title ?? st.trail.id}`.toLowerCase(),
    x: st.start.x, z: st.start.z, heading: along(st.start),
  })),
];
const mapUI = createMapUI({
  fine: buildMapGrid({ ...gridArgs, cellX: 2 }),
  coarse: buildMapGrid({ ...gridArgs, cellX: 4 }),
  destinations,
  onTravel: d => {
    ui.close();
    respawn({ pos: [d.x, d.z], heading: d.heading });
    ui.note(t('note.travel', { label: typeof d.label === 'function' ? d.label() : d.label }));
  },
  onOpenChange: open => {
    if (open) ui.close();
    input.enabled = !open;
  },
});
input.onPress('KeyM', () => mapUI.toggle());

// --- Settings + quality ---------------------------------------------------------
const settingsMenu = createSettingsMenu({
  onOpenChange: open => {
    if (open) { ui.close(); mapUI.close(); }
    input.enabled = !open;
  },
  toggleHelp: () => ui.toggleHelp(),
  getQuality: () => quality.tier,
});
function applyTier(tier) {
  const q = TIERS[tier];
  lighting.setShadowSize(q.shadow);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
  resize();
}
const quality = createAutoQuality({
  start: settings.get('quality') === 'auto' ? guessTier() : settings.get('quality'),
  onStep: tier => { applyTier(tier); ui.note(t('note.quality', { tier })); settingsMenu.refresh(); },
});
rig.setMode(settings.get('camera'));
audio.setMuted(!settings.get('sound'));
settings.onChange((key, v) => {
  if (key === 'glyph') ascii.setCellSize(v);
  else if (key === 'colour') ascii.setColor(v);
  else if (key === 'edges') ascii.setEdges(v);
  else if (key === 'camera') rig.setMode(v);
  else if (key === 'sound') audio.setMuted(!v);
  else if (key === 'quality') {
    const tier = v === 'auto' ? guessTier() : v;
    quality.reset(tier);
    applyTier(tier);
  }
});

// --- Resize ---------------------------------------------------------------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  ascii.setSize(w, h);
}
window.addEventListener('resize', resize);
applyTier(quality.tier); // also sizes everything
respawn(world.spawn);
// Return visits: don't pop the welcome panel open on the spawn pad (E still opens it).
if (!ui.firstVisit) zones.skipAutoOpen();

// --- Loop -----------------------------------------------------------------
const carFocus = new THREE.Vector3();
const perf = createPerfOverlay(renderer);
let devIntents = null; // dev-only override (see window.__stage.drive)

const loop = createLoop({
  step(h) {
    physics.setIntents(vehicle, devIntents ?? readIntents(input.state));
    physics.step(h);
    boosts.apply(vehicle, h);
    zones.update(h, vehicle);
    stages.update(h, vehicle);
    loop24.update(h, vehicle);

    // Impacts: camera kick, body squash, dust, thump.
    if (vehicle.landed > 3) {
      rig.shake(vehicle.landed * 0.05);
      car.bump(vehicle.landed);
      audio.land(vehicle.landed);
      particles.burst(vehicle.x, vehicle.y, vehicle.z, Math.min(30, Math.round(vehicle.landed * 3)));
    }
    if (vehicle.hit > 2) {
      rig.shake(vehicle.hit * 0.04);
      audio.hit(vehicle.hit);
      particles.burst(vehicle.x, vehicle.y, vehicle.z, 8, { color: '#9aa3ad', speed: 3, size: 0.5 });
    }

    // Fell into the sea: back to the last safe spot.
    if (vehicle.y < world.waterLevel - 0.3) respawn();
    safe.timer += h;
    if (safe.timer > 1 && !vehicle.airborne && vehicle.surface && vehicle.surface !== 'grass') {
      safe.timer = 0;
      safe.pos = [vehicle.x, vehicle.z];
      safe.heading = vehicle.heading;
    }
  },
  render(alpha, dt) {
    perf.begin();
    if (settings.get('quality') === 'auto') quality.frame(dt);
    car.sync(vehicle, alpha, dt);
    rig.update(dt, car.object, vehicle);
    // Time of day: ease toward the target hour along the shorter way round the clock.
    const want = loop24.hour ?? PRESETS[preset];
    const diff = ((want - hour + 36) % 24) - 12;
    hour = (hour + diff * Math.min(1, dt * (loop24.state === 'running' ? 6 : 1.2)) + 24) % 24;
    look = sampleTime(hour);
    lighting.setTime(look);
    ascii.setLook(look);
    scene.fog.color.copy(look.fog);
    scene.background.copy(look.fog);
    car.setLights(look.lights);

    particles.drive(dt, car.rearWheels(wheels), vehicle);
    particles.update(dt);
    audio.update(dt, vehicle, (devIntents ?? readIntents(input.state)).throttle);
    lighting.follow(rig.target); // shadows stay sharp around the car

    camera.updateMatrixWorld();
    updateCutaway(camera, carFocus.copy(car.object.position).setY(car.object.position.y + 1), 0.16);

    renderer.info.reset();
    ascii.render(scene, camera);

    const nav = nextTarget();
    navNote(nav, dt);
    ui.update({ vehicle, place: place(), zone: zones.current, nav, viewYaw: rig.yaw, loop: loop24, dt });
    mapUI.update(dt, vehicle);
    perf.end(dt);
  },
});

loop.onUpdate((dt, t) => world.update(dt, t, look));
loop.start();

// First frame is up: drop the boot screen (first visit: wait for "start").
input.enabled = false;
requestAnimationFrame(() => requestAnimationFrame(async () => {
  await boot.ready({ ask: ui.firstVisit });
  if (!ui.panelOpen && !mapUI.isOpen && !settingsMenu.isOpen) input.enabled = true;
}));

// Dev-only handle for debugging / screenshots from the console.
if (import.meta.env.DEV) {
  window.__stage = {
    physics, vehicle, terrain, surfaces, stages, zones, renderer, loop24, ascii, scene, camera,
    /** GPU-synced render timing (ms per frame) for comparing renderer changes. */
    benchRender(n = 40) {
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      ascii.render(scene, camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        ascii.render(scene, camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      }
      return (performance.now() - t0) / n;
    },
    setPreset(i) { preset = i; },
    teleport(x, z, heading = 0) { respawn({ pos: [x, z], heading }); },
    /** Force intents ({throttle, brake, steer}) or null to hand control back. */
    drive(intents) { devIntents = intents; },
  };
}
