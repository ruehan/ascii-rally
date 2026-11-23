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

// --- Renderer -------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false; // count draw calls across all passes per frame
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
const ascii = new AsciiRenderer(renderer, { cellSize: 8 });

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

// Respawn point: last place the car was settled on a road, refreshed every second.
const safe = { pos: [...world.spawn.pos], heading: world.spawn.heading, timer: 0 };
function respawn(at = safe) {
  physics.resetVehicle(vehicle, at.pos, at.heading);
  car.sync(vehicle, 1, 0);
  rig.snap(car.object);
}

// --- Input ----------------------------------------------------------------
const input = createInput();
input.onPress('KeyC', () => ascii.toggleColor());
input.onPress('KeyG', () => ascii.toggleEdges());
input.onPress(['Equal', 'NumpadAdd'], () => ascii.setCellSize(Math.min(24, ascii.cellSize + 2)));
input.onPress(['Minus', 'NumpadSubtract'], () => ascii.setCellSize(Math.max(6, ascii.cellSize - 2)));
input.onPress('KeyR', () => respawn(world.spawn));

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
const hudSpeed = document.getElementById('speed');
const hudAlt = document.getElementById('alt');
const hudCalls = document.getElementById('calls');
const carFocus = new THREE.Vector3();

const loop = createLoop({
  step(h) {
    physics.setIntents(vehicle, readIntents(input.state));
    physics.step(h);

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
    lighting.follow(rig.target); // shadows stay sharp around the car

    camera.updateMatrixWorld();
    updateCutaway(camera, carFocus.copy(car.object.position).setY(car.object.position.y + 1), 0.16);

    renderer.info.reset();
    ascii.render(scene, camera);
    hudCalls.textContent = renderer.info.render.calls;
    hudSpeed.textContent = String(Math.round(Math.abs(vehicle.speed) * 3.6)).padStart(3, ' ');
    hudAlt.textContent = `${Math.round(vehicle.y)}m ${vehicle.surface ?? ''}`;
  },
});

loop.onUpdate((dt, t) => world.update(dt, t));
loop.start();

// Dev-only handle for debugging / screenshots from the console.
if (import.meta.env.DEV) {
  window.__stage = {
    physics, vehicle, terrain, surfaces,
    teleport(x, z, heading = 0) { respawn({ pos: [x, z], heading }); },
  };
}
