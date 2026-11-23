import { circleContact } from './shapes.js';
import { SpatialHash } from './spatialHash.js';

const DEFAULT_VEHICLE = {
  accel: 28,
  brake: 40,
  maxSpeed: 22,
  maxReverse: 8,
  drag: 2.2,       // top speed settles near accel / drag
  steerRate: 2.6,  // rad/s at full lock
  radius: 1.3,
};

/**
 * Arcade (non-physical) solver. Interface is shared with the future Rapier
 * adapter: addStatic(shape), createVehicle(opts), setIntents(v, intents),
 * resetVehicle(v, pos, heading), step(dt).
 *
 * Vehicle state: x, z, heading (0 = facing -Z), speed, steer, plus prevX,
 * prevZ, prevHeading for render interpolation.
 */
export class ArcadePhysics {
  constructor({ bounds }) {
    this.bounds = bounds;            // { type: 'circle', r } | { type: 'box', min:[x,z], max:[x,z] }
    this.statics = new SpatialHash(8);
    this.vehicles = [];
    this._contact = { nx: 0, nz: 0, depth: 0 };
  }

  addStatic(shape) {
    this.statics.insert(shape);
    return shape;
  }

  createVehicle({ pos = [0, 0], heading = 0, ...opts } = {}) {
    const v = {
      ...DEFAULT_VEHICLE, ...opts,
      x: pos[0], z: pos[1], heading, speed: 0, steer: 0,
      prevX: pos[0], prevZ: pos[1], prevHeading: heading,
      intents: { throttle: 0, brake: 0, steer: 0 },
    };
    this.vehicles.push(v);
    return v;
  }

  /** intents: throttle 0..1, brake 0..1 (reverses when stopped), steer -1..1 (+ = left). */
  setIntents(v, intents) {
    Object.assign(v.intents, intents);
  }

  resetVehicle(v, pos, heading = 0) {
    v.x = v.prevX = pos[0];
    v.z = v.prevZ = pos[1];
    v.heading = v.prevHeading = heading;
    v.speed = 0;
    v.steer = 0;
  }

  step(dt) {
    for (const v of this.vehicles) this._stepVehicle(v, dt);
  }

  _stepVehicle(v, dt) {
    v.prevX = v.x;
    v.prevZ = v.z;
    v.prevHeading = v.heading;
    const { throttle, brake, steer } = v.intents;

    // Throttle / brake / reverse.
    v.speed += v.accel * throttle * dt;
    if (brake) v.speed -= (v.speed > 0 ? v.brake : v.accel) * brake * dt;
    v.speed -= v.speed * v.drag * dt;
    v.speed = Math.max(-v.maxReverse, Math.min(v.maxSpeed, v.speed));
    if (!throttle && !brake && Math.abs(v.speed) < 0.05) v.speed = 0;

    // Steering scales with speed so the car can't spin in place.
    v.steer += (steer - v.steer) * Math.min(1, dt * 10);
    const grip = Math.min(1, Math.abs(v.speed) / 6);
    v.heading += v.steer * v.steerRate * grip * Math.sign(v.speed) * dt;

    v.x -= Math.sin(v.heading) * v.speed * dt;
    v.z -= Math.cos(v.heading) * v.speed * dt;

    // Static collisions: push out of every overlap, but bounce speed once.
    const c = this._contact;
    let hit = false;
    for (const s of this.statics.query(v.x, v.z, v.radius)) {
      if (!circleContact(s, v.x, v.z, v.radius, c)) continue;
      v.x += c.nx * c.depth;
      v.z += c.nz * c.depth;
      // Only bounce if moving into the obstacle.
      const vx = -Math.sin(v.heading) * v.speed;
      const vz = -Math.cos(v.heading) * v.speed;
      if (vx * c.nx + vz * c.nz < 0) hit = true;
    }
    if (hit) v.speed *= -0.3;

    this._clampBounds(v);
  }

  _clampBounds(v) {
    const b = this.bounds;
    if (!b) return;
    if (b.type === 'circle') {
      const r = Math.hypot(v.x, v.z);
      if (r > b.r) {
        v.x *= b.r / r;
        v.z *= b.r / r;
        v.speed *= 0.5;
      }
    } else {
      const x = Math.max(b.min[0], Math.min(b.max[0], v.x));
      const z = Math.max(b.min[1], Math.min(b.max[1], v.z));
      if (x !== v.x || z !== v.z) { v.x = x; v.z = z; v.speed *= 0.5; }
    }
  }
}
