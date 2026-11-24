import * as THREE from 'three';
import { CHARSET, setCharset } from '../render/charsets.js';
import { buildCarModel, buildWheel } from './models.js';
import { DEFAULT_CAR } from './cars.js';

const _p = new THREE.Vector3();

/**
 * Car visuals only. Movement lives in the physics adapter; call
 * `sync(vehicle, alpha, dt)` each frame to copy the interpolated state.
 * `setModel(id)` swaps the body for another car class.
 */
export class CarView {
  constructor(scene, id = DEFAULT_CAR, { heightAt = null } = {}) {
    this.heightAt = heightAt; // lets each wheel follow the ground under it
    this.object = new THREE.Group();
    this.object.rotation.order = 'YXZ'; // heading, then pitch, then roll

    // Lamps get their own emissive materials so they can glow at night.
    this.lampMat = new THREE.MeshStandardMaterial({ color: '#fff3b0', emissive: '#fff0c0', emissiveIntensity: 0 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: '#7a1010', emissive: '#ff2020', emissiveIntensity: 0 });

    // Lights exist from the start (adding lights later recompiles every
    // shader); only intensities and positions change. One beam per main
    // headlight lens, and a small red glow behind the tail lights.
    this.beams = [0, 1].map(() => {
      const beam = new THREE.SpotLight('#fff2d0', 0, 42, 0.42, 0.6, 1);
      this.object.add(beam, beam.target);
      return beam;
    });
    this.beamCount = 2;
    this.tailGlow = new THREE.PointLight('#ff2a1a', 0, 3.5, 2);
    this.object.add(this.tailGlow);

    this.model = new THREE.Group();
    this.object.add(this.model);
    this.setModel(id);
    scene.add(this.object);
  }

  setModel(id) {
    this.id = id;
    this.model.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    this.model.clear();
    // The body (with its lamps) rides on springs above the wheels: sync()
    // pitches, rolls and heaves it; the wheels stay on the ground.
    this.body = new THREE.Group();
    this.model.add(this.body);
    const m = buildCarModel(id, this.body);
    for (const [list, mat] of [[m.lamps, this.lampMat], [m.tails, this.tailMat]]) {
      for (const [x, y, z, w, h] of list) {
        const lens = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), mat);
        lens.position.set(x, y, z);
        this.body.add(lens);
      }
    }
    // Beams leave from the first two lenses (the main headlights); a car with
    // a single lamp gets a single beam.
    this.beamCount = Math.min(2, m.lamps.length);
    this.beams.forEach((beam, i) => {
      const [x, y, z] = m.lamps[Math.min(i, m.lamps.length - 1)];
      beam.position.set(x, y + 0.1, z - 0.05);
      beam.target.position.set(x * 1.6, y - 2.1, z - 16); // a touch outward, dipped to the road
    });
    // The glow sits just behind the tail lights, low, so it pools on the road.
    const tz = Math.max(...m.tails.map(t => t[2])), ty = m.tails.reduce((a, t) => a + t[1], 0) / m.tails.length;
    this.tailGlow.position.set(0, Math.min(0.7, ty), tz + 0.75);
    this._applyLights();

    this.wheels = [];
    for (const w of m.wheels) {
      const pivot = new THREE.Group();
      pivot.position.set(w.x, w.r, w.z);
      const mesh = buildWheel(w, m.rim);
      pivot.add(mesh);
      this.model.add(pivot);
      this.wheels.push({ pivot, mesh, front: w.z < 0, r: w.r, x: w.x, z: w.z, off: 0 });
    }
    setCharset(this.model, CHARSET.CAR);
  }

  /** 0 = off, 1 = full night lights. */
  setLights(k) {
    this.lights = k;
    this._applyLights();
  }

  /** Brake lights: 0..1, eased so they don't flicker with a tapped pedal. */
  setBrake(on, dt) {
    this.brake = (this.brake ?? 0) + ((on ? 1 : 0) - (this.brake ?? 0)) * Math.min(1, dt * 18);
    this._applyLights();
  }

  _applyLights() {
    const k = this.lights ?? 0, brake = this.brake ?? 0;
    this.beams.forEach((beam, i) => { beam.intensity = i < this.beamCount ? (this.beamCount === 1 ? 60 : 36) * k : 0; });
    this.lampMat.emissiveIntensity = 1.5 * k;
    this.tailMat.emissiveIntensity = 1.2 * k + 3 * brake;
    // Tail lights barely tint the road behind — a hint at night, a little
    // more on the brakes; kept just above invisible on purpose.
    this.tailGlow.intensity = 0.35 * k + 1.1 * brake * (0.2 + 0.8 * k);
  }

  /** World positions of the rear wheel contact points. */
  rearWheels(out = [[0, 0, 0], [0, 0, 0]]) {
    const o = this.object;
    const c = Math.cos(o.rotation.y), sn = Math.sin(o.rotation.y);
    this.wheels.filter(w => !w.front).slice(0, 2).forEach((w, i) => {
      out[i][0] = o.position.x + w.x * c + w.z * sn;
      out[i][1] = o.position.y;
      out[i][2] = o.position.z - w.x * sn + w.z * c;
    });
    return out;
  }

  sync(v, alpha, dt) {
    const lerp = (a, b) => a + (b - a) * alpha;
    this.object.position.set(lerp(v.prevX, v.x), lerp(v.prevY, v.y), lerp(v.prevZ, v.z));
    this.object.rotation.set(lerp(v.prevPitch, v.pitch), lerp(v.prevHeading, v.heading), -lerp(v.prevRoll, v.roll));

    // Body on its springs (physics/arcade.js _stepBody).
    this.body.rotation.set(lerp(v.prevBodyPitch, v.bodyPitch), 0, -lerp(v.prevBodyRoll, v.bodyRoll));
    this.body.position.y = lerp(v.prevHeave, v.heave);

    // Wheels: spin, steer, and each one follows the ground under it (droops
    // in the air), within the suspension's travel.
    this.object.updateMatrixWorld();
    const droop = -Math.min(0.16, 0.05 + v.car.soft * 1.6);
    for (const w of this.wheels) {
      w.mesh.rotation.x -= (v.speed * dt) / w.r;
      if (w.front) w.pivot.rotation.y = v.steer * 0.5;
      let want = 0;
      if (v.airborne) want = droop;
      else if (this.heightAt) {
        _p.set(w.x, 0, w.z).applyMatrix4(this.object.matrixWorld);
        want = Math.max(droop, Math.min(0.14, this.heightAt(_p.x, _p.z) - _p.y));
      }
      w.off += (want - w.off) * Math.min(1, dt * 30);
      w.pivot.position.y = w.r + w.off;
    }
  }
}
