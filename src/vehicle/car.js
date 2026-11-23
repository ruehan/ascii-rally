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
    // Lamps get their own emissive material so they can glow at night.
    this.lampMat = new THREE.MeshStandardMaterial({ color: '#fff3b0', emissive: '#fff0c0', emissiveIntensity: 0 });
    const light = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.1), this.lampMat);
    light.position.set(0, 0.8, -1.65);
    this.tailMat = new THREE.MeshStandardMaterial({ color: '#7a1010', emissive: '#ff2020', emissiveIntensity: 0 });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.08), this.tailMat);
    tail.position.set(0, 0.85, 1.62);
    this.object.add(body, cabin, light, tail);

    // Headlights: present from the start (adding lights later recompiles
    // every shader); only the intensity changes.
    this.headlight = new THREE.SpotLight('#fff2d0', 0, 42, 0.5, 0.55, 1);
    this.headlight.position.set(0, 1, -1.6);
    this.headlight.target.position.set(0, -1.5, -16);
    this.object.add(this.headlight, this.headlight.target);

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
    this.object.rotation.order = 'YXZ'; // heading, then pitch, then roll
    scene.add(this.object);

    // Body squash on landing: a damped spring on the body's vertical scale.
    this.body = [body, cabin, light];
    this.squash = 0;
    this.squashV = 0;
  }

  /** 0 = off, 1 = full night lights. */
  setLights(k) {
    this.headlight.intensity = 60 * k;
    this.lampMat.emissiveIntensity = 1.5 * k;
    this.tailMat.emissiveIntensity = 1.2 * k;
  }

  /** Squash the body (landings). */
  bump(amount) {
    this.squashV -= Math.min(4, amount * 0.35);
  }

  /** World positions of the rear wheel contact points. */
  rearWheels(out = [[0, 0, 0], [0, 0, 0]]) {
    const o = this.object;
    const c = Math.cos(o.rotation.y), sn = Math.sin(o.rotation.y);
    [[-0.95, 1.05], [0.95, 1.05]].forEach(([lx, lz], i) => {
      out[i][0] = o.position.x + lx * c + lz * sn;
      out[i][1] = o.position.y;
      out[i][2] = o.position.z - lx * sn + lz * c;
    });
    return out;
  }

  sync(v, alpha, dt) {
    const lerp = (a, b) => a + (b - a) * alpha;
    this.object.position.set(lerp(v.prevX, v.x), lerp(v.prevY, v.y), lerp(v.prevZ, v.z));
    this.object.rotation.set(lerp(v.prevPitch, v.pitch), lerp(v.prevHeading, v.heading), -lerp(v.prevRoll, v.roll));

    // Spring back from squash.
    this.squashV += (-120 * this.squash - 12 * this.squashV) * dt;
    this.squash += this.squashV * dt;
    const sy = Math.max(0.6, 1 + this.squash);
    for (const b of this.body) b.scale.y = sy;

    const spin = (v.speed * dt) / WHEEL_RADIUS;
    for (const w of this.wheels) {
      w.mesh.rotation.x -= spin;
      if (w.front) w.pivot.rotation.y = v.steer * 0.5;
    }
  }
}
