import * as THREE from 'three';
import { AsciiRenderer } from './ascii.js';
import { createWorld } from './world.js';
import { Car } from './car.js';

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
const ascii = new AsciiRenderer(renderer, { cellSize: 8 });

const { colliders, sun, monument } = createWorld(scene);
const car = new Car(scene);
car.object.position.set(0, 0, 4);

// Input
const input = { forward: false, backward: false, left: false, right: false };
const KEYS = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'backward', ArrowDown: 'backward',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};
function setKey(e, down) {
  const k = KEYS[e.code];
  if (k) { input[k] = down; e.preventDefault(); }
}
window.addEventListener('keydown', e => {
  setKey(e, true);
  if (e.repeat) return;
  if (e.code === 'KeyC') ascii.toggleColor();
  if (e.code === 'KeyE') ascii.toggleEdges();
  if (e.code === 'Equal' || e.code === 'NumpadAdd') ascii.setCellSize(Math.min(24, ascii.cellSize + 2));
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') ascii.setCellSize(Math.max(6, ascii.cellSize - 2));
  if (e.code === 'KeyR') { car.object.position.set(0, 0, 4); car.speed = 0; car.heading = 0; }
});
window.addEventListener('keyup', e => setKey(e, false));
window.addEventListener('blur', () => Object.keys(input).forEach(k => (input[k] = false)));

// Resize
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

// Fixed-angle follow camera (isometric-ish, always same view direction).
const CAM_OFFSET = new THREE.Vector3(0, 16, 16);
const camTarget = new THREE.Vector3();
camera.position.copy(car.object.position).add(CAM_OFFSET);

const hudSpeed = document.getElementById('speed');
const clock = new THREE.Clock();

function tick() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const t = clock.elapsedTime;

  car.update(dt, input, colliders);
  monument.children.forEach((ring, i) => (ring.rotation.z = t * (0.4 + i * 0.3) * (i % 2 ? -1 : 1)));

  camTarget.copy(car.object.position);
  camera.position.lerp(camTarget.clone().add(CAM_OFFSET), 1 - Math.exp(-dt * 4));
  camera.lookAt(camTarget);

  // Shadow camera follows the car so shadows stay sharp nearby.
  sun.position.set(camTarget.x + 20, 35, camTarget.z + 10);
  sun.target.position.copy(camTarget);

  ascii.render(scene, camera);
  hudSpeed.textContent = String(Math.round(Math.abs(car.speed) * 3.6)).padStart(3, ' ');
  requestAnimationFrame(tick);
}
tick();
