import * as THREE from 'three';
import { WORLD_RADIUS } from './world/world.js';
import { CHARSET, setCharset } from './render/charsets.js';
import { material } from './world/materials.js';

const ACCEL = 28;
const BRAKE = 40;
const MAX_SPEED = 22;
const MAX_REVERSE = 8;
const DRAG = 2.2;
const STEER_RATE = 2.6;   // rad/s at full steering
const CAR_RADIUS = 1.3;

function box(w, h, d, color) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    material(color),
  );
  m.castShadow = true;
  return m;
}

/**
 * Small boxy car with arcade (non-physical) handling.
 * Phase 2 replaces movement with a physics engine.
 */
export class Car {
  constructor(scene) {
    this.object = new THREE.Group();
    this.speed = 0;
    this.heading = 0; // radians, 0 = facing -Z
    this.steer = 0;

    const body = box(1.8, 0.6, 3.2, '#ff5d5d');
    body.position.y = 0.7;
    const cabin = box(1.5, 0.6, 1.6, '#f1f3f5');
    cabin.position.set(0, 1.3, 0.3);
    const light = box(1.4, 0.2, 0.1, '#fff3b0');
    light.position.set(0, 0.8, -1.65);
    this.object.add(body, cabin, light);

    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = material('#2b2b2b');
    for (const [x, z] of [[-0.95, -1.05], [0.95, -1.05], [-0.95, 1.05], [0.95, 1.05]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.42, z);
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.castShadow = true;
      pivot.add(w);
      this.object.add(pivot);
      this.wheels.push({ pivot, mesh: w, front: z < 0 });
    }

    setCharset(this.object, CHARSET.CAR);
    scene.add(this.object);
  }

  update(dt, input, colliders) {
    // Throttle / brake.
    if (input.forward) this.speed += ACCEL * dt;
    if (input.backward) this.speed -= (this.speed > 0 ? BRAKE : ACCEL) * dt;
    this.speed -= this.speed * DRAG * dt;
    this.speed = THREE.MathUtils.clamp(this.speed, -MAX_REVERSE, MAX_SPEED);
    if (!input.forward && !input.backward && Math.abs(this.speed) < 0.05) this.speed = 0;

    // Steering scales with speed so the car can't spin in place.
    const target = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer = THREE.MathUtils.lerp(this.steer, target, Math.min(1, dt * 10));
    const grip = Math.min(1, Math.abs(this.speed) / 6);
    this.heading += this.steer * STEER_RATE * grip * Math.sign(this.speed) * dt;

    const pos = this.object.position;
    pos.x -= Math.sin(this.heading) * this.speed * dt;
    pos.z -= Math.cos(this.heading) * this.speed * dt;

    // Circle collisions: push out and bleed speed.
    for (const c of colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const dist = Math.hypot(dx, dz);
      const min = c.r + CAR_RADIUS;
      if (dist < min && dist > 1e-4) {
        pos.x = c.x + (dx / dist) * min;
        pos.z = c.z + (dz / dist) * min;
        this.speed *= -0.3;
      }
    }

    // Soft world boundary.
    const r = Math.hypot(pos.x, pos.z);
    if (r > WORLD_RADIUS) {
      pos.x *= WORLD_RADIUS / r;
      pos.z *= WORLD_RADIUS / r;
      this.speed *= 0.5;
    }

    this.object.rotation.y = this.heading;

    // Wheel visuals.
    const spin = (this.speed * dt) / 0.42;
    for (const w of this.wheels) {
      w.mesh.rotation.x -= spin;
      if (w.front) w.pivot.rotation.y = this.steer * 0.5;
    }
  }
}
