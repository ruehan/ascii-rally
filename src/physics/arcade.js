import { circleContact } from './shapes.js';
import { SpatialHash } from './spatialHash.js';
import { SURFACE_PHYSICS } from '../world/surfaces.js';

const DEFAULT_VEHICLE = {
  accel: 28,
  brake: 40,
  maxSpeed: 22,
  maxReverse: 8,
  drag: 2.2,        // used when the terrain reports no surface
  steerRate: 2.6,   // rad/s at full lock
  radius: 1.3,
  slopeFactor: 1,   // how much gravity along the slope affects speed
  wheelX: 0.95,     // half track
  wheelZ: 1.05,     // half wheelbase
  airControl: 0.25, // steer/throttle multiplier while airborne
};

/** Flat ground; keeps the solver usable (and testable) without terrain. */
export const FLAT_TERRAIN = {
  heightAt: () => 0,
  slopeAlong: () => 0,
  surfaceAt: () => null,
};

/**
 * Arcade (non-physical) solver. Interface is shared with the future Rapier
 * adapter: addStatic(shape), createVehicle(opts), setIntents(v, intents),
 * resetVehicle(v, pos, heading), step(dt).
 *
 * Horizontal motion is 2D (XZ). Height is solved separately: the car rides
 * the terrain, leaves it when the ground drops away faster than a ballistic
 * arc (crests), and lands back on it.
 *
 * Vehicle state: x, z, y, heading (0 = facing -Z), speed, steer, vy, pitch,
 * roll, airborne, surface; prev* copies for render interpolation.
 */
export class ArcadePhysics {
  constructor({ bounds, terrain = FLAT_TERRAIN, gravity = 14 } = {}) {
    this.bounds = bounds;            // { type: 'circle', r } | { type: 'box', min:[x,z], max:[x,z] }
    this.terrain = terrain;
    this.gravity = gravity;          // arcade gravity (m/s²), stronger than real for snappy jumps
    this.statics = new SpatialHash(8);
    this.vehicles = [];
    this._contact = { nx: 0, nz: 0, depth: 0 };
    this._ground = { h: 0, pitch: 0, roll: 0 };
  }

  addStatic(shape) {
    this.statics.insert(shape);
    return shape;
  }

  createVehicle({ pos = [0, 0], heading = 0, ...opts } = {}) {
    const v = {
      ...DEFAULT_VEHICLE, ...opts,
      x: 0, z: 0, y: 0, heading: 0, speed: 0, steer: 0,
      vy: 0, pitch: 0, roll: 0, airborne: false, airTime: 0, surface: null,
      intents: { throttle: 0, brake: 0, steer: 0 },
    };
    this.resetVehicle(v, pos, heading);
    this.vehicles.push(v);
    return v;
  }

  /** intents: throttle 0..1, brake 0..1 (reverses when stopped), steer -1..1 (+ = left). */
  setIntents(v, intents) {
    Object.assign(v.intents, intents);
  }

  resetVehicle(v, pos, heading = 0) {
    v.x = pos[0];
    v.z = pos[1];
    v.heading = heading;
    v.speed = v.steer = v.vy = 0;
    v.airborne = false;
    this._sampleGround(v);
    v.y = this._ground.h;
    v.pitch = this._ground.pitch;
    v.roll = this._ground.roll;
    this._snapshot(v);
  }

  step(dt) {
    for (const v of this.vehicles) this._stepVehicle(v, dt);
  }

  _snapshot(v) {
    v.prevX = v.x; v.prevZ = v.z; v.prevY = v.y;
    v.prevHeading = v.heading; v.prevPitch = v.pitch; v.prevRoll = v.roll;
  }

  /** Average height + pitch/roll under the four wheels. */
  _sampleGround(v) {
    const T = this.terrain;
    const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading); // forward
    const rx = -fz, rz = fx;                                     // right
    const h = (a, b) => T.heightAt(v.x + fx * a + rx * b, v.z + fz * a + rz * b);
    const fl = h(v.wheelZ, -v.wheelX), fr = h(v.wheelZ, v.wheelX);
    const rl = h(-v.wheelZ, -v.wheelX), rr = h(-v.wheelZ, v.wheelX);
    const g = this._ground;
    g.h = (fl + fr + rl + rr) / 4;
    g.pitch = Math.atan2((fl + fr) - (rl + rr), 4 * v.wheelZ);   // nose up > 0
    g.roll = Math.atan2((rl + fl) - (rr + fr), 4 * v.wheelX);    // left side up > 0
    return g;
  }

  _stepVehicle(v, dt) {
    this._snapshot(v);
    const { throttle, brake, steer } = v.intents;
    const T = this.terrain;
    // Brief hops over bumps keep full control; real jumps reduce it.
    const control = v.airborne && v.airTime > 0.08 ? v.airControl : 1;

    v.surface = T.surfaceAt(v.x, v.z);
    const surf = SURFACE_PHYSICS[v.surface] ?? { grip: 1, drag: v.drag };

    // Throttle / brake / reverse (no traction in the air).
    let slopeAcc = 0;
    if (!v.airborne) {
      v.speed += v.accel * throttle * dt;
      if (brake) v.speed -= (v.speed > 0 ? v.brake : v.accel) * brake * dt;
      v.speed -= v.speed * surf.drag * dt;
      // Gravity along the slope: uphill slows, downhill speeds up.
      const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading);
      slopeAcc = -this.gravity * T.slopeAlong(v.x, v.z, fx, fz) * v.slopeFactor;
      v.speed += slopeAcc * dt;
    }
    v.speed = Math.max(-v.maxReverse, Math.min(v.maxSpeed, v.speed));
    // Parked on gentle ground: static friction holds the car still.
    if (!throttle && !brake && !v.airborne && Math.abs(v.speed) < 0.05 && Math.abs(slopeAcc) < 1) v.speed = 0;

    // Steering scales with speed and surface grip.
    v.steer += (steer - v.steer) * Math.min(1, dt * 10);
    const grip = Math.min(1, Math.abs(v.speed) / 6) * surf.grip * control;
    v.heading += v.steer * v.steerRate * grip * Math.sign(v.speed) * dt;

    v.x -= Math.sin(v.heading) * v.speed * dt;
    v.z -= Math.cos(v.heading) * v.speed * dt;

    // Static collisions: push out of every overlap the car isn't above,
    // but bounce speed once.
    const c = this._contact;
    let hit = false;
    for (const s of this.statics.query(v.x, v.z, v.radius)) {
      if (v.y > (s.y ?? 0) + s.h) continue;
      if (!circleContact(s, v.x, v.z, v.radius, c)) continue;
      v.x += c.nx * c.depth;
      v.z += c.nz * c.depth;
      const vx = -Math.sin(v.heading) * v.speed;
      const vz = -Math.cos(v.heading) * v.speed;
      if (vx * c.nx + vz * c.nz < 0) hit = true;
    }
    if (hit) v.speed *= -0.3;

    this._clampBounds(v);
    this._stepVertical(v, dt);
  }

  _stepVertical(v, dt) {
    const g = this._sampleGround(v);
    const G = this.gravity;
    if (v.airborne) {
      v.airTime += dt;
      v.vy -= G * dt;
      v.y += v.vy * dt;
      v.pitch += (-0.12 - v.pitch) * Math.min(1, dt * 2); // nose drops slowly in the air
      v.roll += (0 - v.roll) * Math.min(1, dt * 2);
      if (v.y <= g.h) {
        if (v.vy < -8) v.speed *= 0.75; // hard landing
        v.y = g.h;
        v.vy = 0;
        v.airborne = false;
      }
      return;
    }
    // Grounded: take off when the ground drops away faster than the car would
    // fall unsupported (crests, lips).
    const vyFree = v.vy - G * dt;
    const yFree = v.y + vyFree * dt;
    if (yFree > g.h + 0.01) {
      v.airborne = true;
      v.airTime = 0;
      v.vy = vyFree;
      v.y = yFree;
      return;
    }
    v.vy = (g.h - v.y) / dt;
    v.y = g.h;
    const k = Math.min(1, dt * 12);
    v.pitch += (g.pitch - v.pitch) * k;
    v.roll += (g.roll - v.roll) * k;
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
