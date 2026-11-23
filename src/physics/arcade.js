import { circleContact } from './shapes.js';
import { SpatialHash } from './spatialHash.js';
import { CARS, DEFAULT_CAR } from '../vehicle/cars.js';

const G = 9.81;          // real gravity for traction, slopes and braking
const RHO = 1.225;       // air density
const CRR = 0.015;       // rolling resistance
const LOOSE = new Set(['gravel', 'dirt', 'grass', 'sand']);

/** Flat ground; keeps the solver usable (and testable) without terrain. */
export const FLAT_TERRAIN = {
  heightAt: () => 0,
  slopeAlong: () => 0,
  surfaceAt: () => null,
};

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Vehicle solver: single-track ("bicycle") car on a heightfield.
 *
 * Horizontal: velocity vector + heading. Longitudinal force from power
 * (traction-limited), brakes, drag, rolling resistance and slope; tyre
 * force budget μ·N where N includes aero downforce. The budget is shared
 * per axle between longitudinal and lateral use (friction circle):
 *   - front axle limits yaw rate     → understeer when saturated
 *   - rear axle limits lateral catch → oversteer / drift when saturated
 *     (handbrake, power on a RWD car, low-grip surfaces)
 * Vertical: rides the terrain, leaves it over crests, lands.
 *
 * Interface shared with a future Rapier adapter: addStatic(shape),
 * createVehicle(opts), setCar(v, id), setIntents(v, intents),
 * resetVehicle(v, pos, heading), step(dt).
 *
 * Vehicle state: x, z, y, vx, vz, heading (0 = facing -Z), speed (signed,
 * along heading), slip (lateral m/s), steer, vy, pitch, roll, airborne,
 * surface; prev* copies for interpolation; one-step events landed / hit.
 */
export class ArcadePhysics {
  constructor({ bounds, terrain = FLAT_TERRAIN, gravity = 12 } = {}) {
    this.bounds = bounds;
    this.terrain = terrain;
    this.gravity = gravity; // vertical (jump) gravity, a bit snappier than real
    this.statics = new SpatialHash(8);
    this.vehicles = [];
    this._contact = { nx: 0, nz: 0, depth: 0 };
    this._ground = { h: 0, pitch: 0, roll: 0 };
  }

  addStatic(shape) {
    this.statics.insert(shape);
    return shape;
  }

  createVehicle({ pos = [0, 0], heading = 0, car = DEFAULT_CAR } = {}) {
    const v = {
      x: 0, z: 0, y: 0, vx: 0, vz: 0, heading: 0, speed: 0, slip: 0, steer: 0,
      vy: 0, pitch: 0, roll: 0, airborne: false, airTime: 0, surface: null, landed: 0, hit: 0,
      wheelX: 0.95, wheelZ: 1.05, airControl: 0.2,
      intents: { throttle: 0, brake: 0, steer: 0, handbrake: 0 },
    };
    this.setCar(v, car);
    this.resetVehicle(v, pos, heading);
    this.vehicles.push(v);
    return v;
  }

  /** Switch car class (spec from vehicle/cars.js). */
  setCar(v, id) {
    v.carId = CARS[id] ? id : DEFAULT_CAR;
    v.car = CARS[v.carId];
    v.radius = v.car.radius;
    v.wheelZ = v.car.wheelbase / 2;
  }

  /** intents: throttle 0..1, brake 0..1 (reverses when stopped), steer -1..1 (+ = left), handbrake 0..1. */
  setIntents(v, intents) {
    Object.assign(v.intents, intents);
  }

  resetVehicle(v, pos, heading = 0) {
    v.x = pos[0];
    v.z = pos[1];
    v.heading = heading;
    v.vx = v.vz = v.speed = v.slip = v.steer = v.vy = 0;
    v.airborne = false;
    this._sampleGround(v);
    v.y = this._ground.h;
    v.pitch = this._ground.pitch;
    v.roll = this._ground.roll;
    this._snapshot(v);
  }

  /** Sets speed along the current heading (tests, spawns). */
  setSpeed(v, s) {
    v.vx = -Math.sin(v.heading) * s;
    v.vz = -Math.cos(v.heading) * s;
    v.speed = s;
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
    v.landed = 0;
    v.hit = 0;
    const c = v.car;
    const T = this.terrain;
    const { throttle, brake, handbrake = 0 } = v.intents;
    const m = c.mass;

    // Axes and velocity components.
    let fx = -Math.sin(v.heading), fz = -Math.cos(v.heading);
    let rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
    let vLong = v.vx * fx + v.vz * fz;
    let vLat = v.vx * rx + v.vz * rz;

    v.surface = T.surfaceAt(v.x, v.z);
    const ground = !v.airborne || v.airTime < 0.08; // tiny hops keep traction
    const mu = ground ? (c.tyres[v.surface] ?? 1) : 0;
    const down = 0.5 * RHO * c.cla * vLong * vLong;
    const N = m * G + down;
    const axle = 0.5 * mu * N; // grip budget per axle

    // --- Steering demand ----------------------------------------------------------
    // Cornering gets first call on the tyres; traction control / ABS then only
    // use what's left for driving and braking (otherwise full throttle at low
    // speed would leave no grip to steer with).
    v.steer += (v.intents.steer - v.steer) * Math.min(1, dt * 10);
    const delta = v.steer * c.steer / (1 + Math.abs(vLong) / 35); // less lock at speed
    const rWant = (vLong * Math.tan(delta)) / c.wheelbase;
    // Lateral need per axle: the turn asked for, plus catching any slide
    // (stability control: a sliding car gets less power, so it doesn't spin).
    const latNeed = Math.min(axle, (m * 0.5) * (Math.abs(rWant * vLong) + Math.abs(vLat) * 4));
    const longAvail = Math.sqrt(Math.max(0, axle * axle - latNeed * latNeed)); // per axle

    // --- Longitudinal forces -------------------------------------------------------
    let Fdrive = 0, Fbrake = 0;
    // Driven wheels' share of the budget (AWD: both axles; RWD: rear load share).
    const tractionCap = longAvail * (c.drive < 1 ? c.drive / 0.5 : 2);
    const power = Fmax => Math.min((c.power * 1000) / Math.max(Math.abs(vLong), 4), Fmax);
    if (throttle > 0) {
      const limiter = 1 - smoothstep(c.vmax / 3.6 * 0.97, c.vmax / 3.6, vLong);
      Fdrive = throttle * power(tractionCap) * limiter;
    }
    if (brake > 0) {
      if (vLong > 0.5) Fbrake = brake * Math.min(c.brakeG * N, longAvail * 2);
      else Fdrive -= brake * power(tractionCap) * 0.35; // reverse gear
    }
    const Fhb = handbrake && Math.abs(vLong) > 0.5 ? handbrake * axle * 0.8 : 0;
    // Low cars on loose ground plough: resistance grows with speed, like a gravel trap.
    const loose = LOOSE.has(v.surface) ? c.offroad * (1 + Math.abs(vLong) / 6) : 0;
    const Fres = 0.5 * RHO * c.cda * vLong * vLong + (CRR + loose) * m * G;
    const Fslope = ground ? m * G * T.slopeAlong(v.x, v.z, fx, fz) : 0;

    // Per-axle longitudinal use → what's left for cornering (friction circle).
    const rwd = c.drive < 1;
    const drive = Math.abs(Fdrive);
    const frontLong = (rwd ? 0 : drive * 0.5) + Fbrake * 0.6;
    const rearLong = (rwd ? drive : drive * 0.5) + Fbrake * 0.4 + Fhb;
    const half = m * 0.5;
    const aLatF = Math.sqrt(Math.max(0, axle * axle - frontLong * frontLong)) / half;
    const aLatR = Math.sqrt(Math.max(0, axle * axle - rearLong * rearLong)) / half * (handbrake ? 0.35 : 1);

    // Longitudinal: drive and slope accelerate; brakes/resistance only slow
    // the car down (they never push it backwards on their own).
    if (ground) {
      vLong += ((Fdrive - Fslope) / m) * dt;
      const decel = ((Math.min(Fbrake + Fhb, mu * N) + Fres) / m) * dt;
      vLong = Math.abs(vLong) <= decel ? 0 : vLong - Math.sign(vLong) * decel;
    } else {
      vLong -= Math.sign(vLong) * (0.5 * RHO * c.cda * vLong * vLong / m) * dt;
    }
    vLong = Math.max(-8, vLong);

    // --- Yaw ----------------------------------------------------------------------------
    let r = rWant;
    if (ground) {
      const rLimit = aLatF / Math.max(Math.abs(vLong), 1); // front saturation → understeer
      r = Math.max(-rLimit, Math.min(rLimit, r));
      if (handbrake) r *= 1.5; // rear lets go: car rotates more
    } else {
      r *= v.airControl;
    }
    v.heading += r * dt;

    // The world velocity doesn't turn with the body by itself; the rear tyres
    // pull the lateral component back towards zero, up to their limit.
    const nfx = -Math.sin(v.heading), nfz = -Math.cos(v.heading);
    const nrx = Math.cos(v.heading), nrz = -Math.sin(v.heading);
    const wx = fx * vLong + rx * vLat, wz = fz * vLong + rz * vLat;
    vLong = wx * nfx + wz * nfz;
    vLat = wx * nrx + wz * nrz;
    if (ground) {
      const catchUp = aLatR * dt;
      vLat -= Math.max(-catchUp, Math.min(catchUp, vLat));
    }

    // Parked on gentle ground: static friction holds the car still.
    if (!throttle && !brake && ground && Math.abs(vLong) < 0.05 && Math.abs(Fslope / m) < 0.5) {
      vLong = 0;
      vLat *= 0.5;
    }

    v.vx = nfx * vLong + nrx * vLat;
    v.vz = nfz * vLong + nrz * vLat;
    v.x += v.vx * dt;
    v.z += v.vz * dt;
    v.speed = vLong;
    v.slip = vLat;

    this._collide(v);
    this._clampBounds(v);
    this._stepVertical(v, dt);
  }

  _collide(v) {
    const c = this._contact;
    let worst = 0;
    for (const s of this.statics.query(v.x, v.z, v.radius)) {
      if (v.y > (s.y ?? 0) + s.h) continue;
      if (!circleContact(s, v.x, v.z, v.radius, c)) continue;
      v.x += c.nx * c.depth;
      v.z += c.nz * c.depth;
      const vn = v.vx * c.nx + v.vz * c.nz;
      if (vn < 0) {
        // Bounce off (restitution 0.3) and scrub some tangential speed.
        v.vx -= 1.3 * vn * c.nx;
        v.vz -= 1.3 * vn * c.nz;
        v.vx *= 0.8;
        v.vz *= 0.8;
        worst = Math.max(worst, -vn);
      }
    }
    if (worst) {
      v.hit = worst;
      v.speed = v.vx * -Math.sin(v.heading) + v.vz * -Math.cos(v.heading);
    }
  }

  _stepVertical(v, dt) {
    const g = this._sampleGround(v);
    const Gv = this.gravity;
    if (v.airborne) {
      v.airTime += dt;
      v.vy -= Gv * dt;
      v.y += v.vy * dt;
      v.pitch += (-0.12 - v.pitch) * Math.min(1, dt * 2); // nose drops slowly in the air
      v.roll += (0 - v.roll) * Math.min(1, dt * 2);
      if (v.y <= g.h) {
        v.landed = -v.vy;
        if (v.vy < -8) { v.vx *= 0.8; v.vz *= 0.8; } // hard landing
        v.y = g.h;
        v.vy = 0;
        v.airborne = false;
      }
      return;
    }
    // Grounded: take off when the ground drops away faster than the car would
    // fall unsupported (crests, lips).
    const vyFree = v.vy - Gv * dt;
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
        v.vx *= 0.5; v.vz *= 0.5;
      }
    } else {
      const x = Math.max(b.min[0], Math.min(b.max[0], v.x));
      const z = Math.max(b.min[1], Math.min(b.max[1], v.z));
      if (x !== v.x || z !== v.z) { v.x = x; v.z = z; v.vx *= 0.5; v.vz *= 0.5; }
    }
  }
}
