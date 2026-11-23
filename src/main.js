import * as THREE from 'three';
import { AsciiRenderer } from './render/ascii.js';
import { createLighting } from './render/lighting.js';
import { createCameraRig } from './render/camera.js';
import { updateCutaway } from './render/cutaway.js';
import { buildWorld } from './world/build.js';
import map from './world/map.js';
import { ArcadePhysics } from './physics/arcade.js';
import { CarView } from './vehicle/car.js';
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
const vehicle = physics.createVehicle({ pos: world.spawn.pos, heading: world.spawn.heading });
const car = new CarView(scene);
const rig = createCameraRig(camera, terrain);

// --- Game systems ---------------------------------------------------------
const bus = createBus();
const zones = createZoneSystem({ zones: map.zones, bus });
const stages = createStageSystem({ stages: map.stages, trails: terrain.trails, bus });
const input = createInput();
const ui = createUI({ bus, stages, onPanel: open => { input.enabled = !open; } });
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
input.onPress('KeyE', () => { if (!ui.close()) zones.open(); });
input.onPress('Escape', () => ui.close());
input.onPress('KeyV', () => ui.note(`> camera: ${rig.toggleMode()}`));
input.onPress('KeyM', () => ui.note(`> sound: ${audio.toggleMute() ? 'off' : 'on'}`));
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
