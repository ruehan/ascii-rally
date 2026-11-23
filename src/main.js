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
import { sampleTime } from './render/timeOfDay.js';
import { milestones } from './content/content.js';
import { buildMapGrid } from './ui/mapGrid.js';
import { createMapUI } from './ui/map.js';
import { createPerfOverlay } from './ui/perf.js';

// --- Renderer -------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false; // count draw calls across all passes per frame
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
const ascii = new AsciiRenderer(renderer, { cellSize: 6 });

// --- World + physics ------------------------------------------------------
const world = buildWorld(scene, map);
const { terrain, surfaces } = world;
const lighting = createLighting(scene);
// Nothing past the fog is visible; keep the far plane tight for depth precision.
camera.far = scene.fog.far + 10;
camera.updateProjectionMatrix();

const physics = new ArcadePhysics({
  bounds: world.bounds,
  terrain: { heightAt: terrain.heightAt, slopeAlong: terrain.slopeAlong, surfaceAt: surfaces.surfaceAt },
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
input.onPress('KeyC', () => ascii.toggleColor());
input.onPress('KeyG', () => ascii.toggleEdges());
input.onPress(['Equal', 'NumpadAdd'], () => ascii.setCellSize(Math.min(24, ascii.cellSize + 2)));
input.onPress(['Minus', 'NumpadSubtract'], () => ascii.setCellSize(Math.max(6, ascii.cellSize - 2)));
input.onPress('KeyR', () => { ui.close(); respawn(world.spawn); });
input.onPress('KeyQ', () => selectCar(CAR_ORDER[(CAR_ORDER.indexOf(carId) + 1) % CAR_ORDER.length]));
input.onPress('KeyE', () => { if (!mapUI.isOpen && !ui.close()) zones.open(); });
input.onPress('Escape', () => { if (!mapUI.close()) ui.close(); });
input.onPress('KeyV', () => ui.note(`> camera: ${rig.toggleMode()}`));
input.onPress('KeyN', () => ui.note(`> sound: ${audio.toggleMute() ? 'off' : 'on'}`));
input.onPress('KeyT', () => {
  if (loop24.state === 'running') return ui.note('> 24H running — the clock is the race');
  preset = (preset + 1) % PRESETS.length;
  ui.note(`> time: ${['afternoon', 'sunset', 'night', 'dawn'][preset]}`);
});

// --- Where am I / where next -------------------------------------------------
function place() {
  const z = zones.current;
  if (z) return z.path;
  const { x, z: zz } = vehicle;
  if (x > 10 && x < 82 && zz < -32 && zz > -124) return '~/circuit';
  if (zz < -110) return '~/coast';
  if (x < -20) return '~/forest';
  if (x > 30 && zz < 100) return '~/old-town';
  return '~/valley';
}

/** Nearest stage start or zone not yet visited this session. */
const targets = [
  ...stages.stages.map(st => ({ id: st.id, name: `${st.name} start`, x: st.start.x, z: st.start.z })),
  ...map.zones.filter(z => z.id !== 'paddock').map(z => ({ id: z.id, name: z.title.toLowerCase(), x: z.pos[0], z: z.pos[1] })),
  { id: '24h', name: '24H gate', x: loop24.startPoint.x, z: loop24.startPoint.z },
];
bus.on('loop:finish', () => ui.visited.add('24h'));
function nextTarget() {
  let best = null;
  for (const t of targets) {
    if (ui.visited.has(t.id)) continue;
    const dist = Math.hypot(t.x - vehicle.x, t.z - vehicle.z);
    if (!best || dist < best.dist) best = { ...t, dist };
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
  ui.note(`> ${nav.name} · ${Math.round(nav.dist)}m · ${clock} o'clock`);
}

// --- Map + fast travel -------------------------------------------------------------
const gridArgs = { terrain, surfaces, colliders: world.colliders, waterLevel: world.waterLevel };
const along = p => Math.atan2(-p.tx, -p.tz); // car heading that faces along a path tangent
const gateP = loop24.startPoint;
const gate = { x: gateP.x - gateP.tx * 12, z: gateP.z - gateP.tz * 12, heading: along(gateP) }; // just before the line
const zonePos = id => map.zones.find(z => z.id === id);
const destinations = [
  { key: '1', label: 'paddock', x: world.spawn.pos[0], z: world.spawn.pos[1], heading: world.spawn.heading },
  ...stages.stages.map((st, i) => ({
    key: String(i + 2), label: `${st.name} ${st.trail.id}`, x: st.start.x, z: st.start.z, heading: along(st.start),
  })),
  { key: '8', label: '24H gate', ...gate },
  { key: '9', label: 'rally hq', x: zonePos('piazza').pos[0], z: zonePos('piazza').pos[1], heading: 0 },
  { key: '0', label: 'lookout', x: zonePos('lookout').pos[0], z: zonePos('lookout').pos[1], heading: 0 },
  { label: 'garage', x: zonePos('garage').pos[0], z: zonePos('garage').pos[1], heading: 0 },
  { label: 'pit wall', x: zonePos('pitwall').pos[0], z: zonePos('pitwall').pos[1], heading: 0 },
];
const mapUI = createMapUI({
  fine: buildMapGrid({ ...gridArgs, cellX: 2 }),
  coarse: buildMapGrid({ ...gridArgs, cellX: 4 }),
  destinations,
  onTravel: d => {
    ui.close();
    respawn({ pos: [d.x, d.z], heading: d.heading });
    ui.note(`> travelled to ${d.label}`);
  },
  onOpenChange: open => {
    if (open) ui.close();
    input.enabled = !open;
  },
});
input.onPress('KeyM', () => mapUI.toggle());
for (let i = 0; i <= 9; i++) input.onPress(`Digit${i}`, () => mapUI.pressKey(String(i)));

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
resize();
respawn(world.spawn);

// --- Loop -----------------------------------------------------------------
const carFocus = new THREE.Vector3();
const perf = createPerfOverlay(renderer);
let devIntents = null; // dev-only override (see window.__stage.drive)

const loop = createLoop({
  step(h) {
    physics.setIntents(vehicle, devIntents ?? readIntents(input.state));
    physics.step(h);
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

// Dev-only handle for debugging / screenshots from the console.
if (import.meta.env.DEV) {
  window.__stage = {
    physics, vehicle, terrain, surfaces, stages, zones, renderer, loop24,
    setPreset(i) { preset = i; },
    teleport(x, z, heading = 0) { respawn({ pos: [x, z], heading }); },
    /** Force intents ({throttle, brake, steer}) or null to hand control back. */
    drive(intents) { devIntents = intents; },
  };
}
