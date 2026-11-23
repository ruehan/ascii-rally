import * as THREE from 'three';
import { CHARSET, setCharset } from '../render/charsets.js';
import { material } from '../world/materials.js';

const WHEEL_RADIUS = 0.42;

function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  m.castShadow = true;
  return m;
}

/**
 * Car visuals only. Movement lives in the physics adapter; call
 * `sync(vehicle, alpha, dt)` each frame to copy the interpolated state.
 */
export class CarView {
  constructor(scene) {
    this.object = new THREE.Group();

    const body = box(1.8, 0.6, 3.2, '#ff5d5d');
    body.position.y = 0.7;
    const cabin = box(1.5, 0.6, 1.6, '#f1f3f5');
    cabin.position.set(0, 1.3, 0.3);
    const light = box(1.4, 0.2, 0.1, '#fff3b0');
    light.position.set(0, 0.8, -1.65);
    this.object.add(body, cabin, light);

    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.35, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = material('#2b2b2b');
    for (const [x, z] of [[-0.95, -1.05], [0.95, -1.05], [-0.95, 1.05], [0.95, 1.05]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, WHEEL_RADIUS, z);
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.castShadow = true;
      pivot.add(w);
      this.object.add(pivot);
      this.wheels.push({ pivot, mesh: w, front: z < 0 });
    }

    setCharset(this.object, CHARSET.CAR);
    scene.add(this.object);
  }

  sync(v, alpha, dt) {
    const pos = this.object.position;
    pos.x = v.prevX + (v.x - v.prevX) * alpha;
    pos.z = v.prevZ + (v.z - v.prevZ) * alpha;
    this.object.rotation.y = v.prevHeading + (v.heading - v.prevHeading) * alpha;

    const spin = (v.speed * dt) / WHEEL_RADIUS;
    for (const w of this.wheels) {
      w.mesh.rotation.x -= spin;
      if (w.front) w.pivot.rotation.y = v.steer * 0.5;
    }
  }
}
