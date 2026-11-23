import * as THREE from 'three';
import { AsciiRenderer } from './render/ascii.js';
import { createLighting } from './render/lighting.js';
import { createWorld } from './world/world.js';
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
const { colliders, monument, bounds } = createWorld(scene);
const lighting = createLighting(scene);
// Nothing past the fog is visible; keep the far plane tight for depth precision.
camera.far = scene.fog.far + 10;
camera.updateProjectionMatrix();

const SPAWN = { pos: [0, 4], heading: 0 };
const physics = new ArcadePhysics({ bounds });
colliders.forEach(s => physics.addStatic(s));
const vehicle = physics.createVehicle(SPAWN);
const car = new CarView(scene);

// --- Input ----------------------------------------------------------------
const input = createInput();
input.onPress('KeyC', () => ascii.toggleColor());
input.onPress('KeyE', () => ascii.toggleEdges());
input.onPress(['Equal', 'NumpadAdd'], () => ascii.setCellSize(Math.min(24, ascii.cellSize + 2)));
input.onPress(['Minus', 'NumpadSubtract'], () => ascii.setCellSize(Math.max(6, ascii.cellSize - 2)));
input.onPress('KeyR', () => physics.resetVehicle(vehicle, SPAWN.pos, SPAWN.heading));

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

// --- Camera ---------------------------------------------------------------
// Fixed-angle follow camera (isometric-ish, always same view direction).
const CAM_OFFSET = new THREE.Vector3(0, 16, 16);
const camTarget = new THREE.Vector3(SPAWN.pos[0], 0, SPAWN.pos[1]);
const camGoal = new THREE.Vector3();
camera.position.copy(camTarget).add(CAM_OFFSET);

// --- Loop -----------------------------------------------------------------
const hudSpeed = document.getElementById('speed');
const hudCalls = document.getElementById('calls');

const loop = createLoop({
  step(h) {
    physics.setIntents(vehicle, readIntents(input.state));
    physics.step(h);
  },
  render(alpha, dt) {
    car.sync(vehicle, alpha, dt);

    camTarget.copy(car.object.position);
    camera.position.lerp(camGoal.copy(camTarget).add(CAM_OFFSET), 1 - Math.exp(-dt * 4));
    camera.lookAt(camTarget);
    lighting.follow(camTarget); // shadows stay sharp around the car

    renderer.info.reset();
    ascii.render(scene, camera);
    hudCalls.textContent = renderer.info.render.calls;
    hudSpeed.textContent = String(Math.round(Math.abs(vehicle.speed) * 3.6)).padStart(3, ' ');
  },
});

loop.onUpdate((dt, t) => {
  monument.children.forEach((ring, i) => (ring.rotation.z = t * (0.4 + i * 0.3) * (i % 2 ? -1 : 1)));
});

loop.start();
