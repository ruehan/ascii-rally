import { circleContact } from './shapes.js';
import { SpatialHash } from './spatialHash.js';
import { CARS, DEFAULT_CAR } from '../vehicle/cars.js';

const G = 9.81;          // real gravity for traction, slopes and braking
const RHO = 1.225;       // air density
const CRR = 0.015;       // rolling resistance
// Rolling drag factor on loose ground for low cars (× car.offroad).
const LOOSE = { gravel: 1, dirt: 1, grass: 1, sand: 1.3, snow: 1.2, dune: 2.5 };
// Rolling-resistance coefficient by surface (all cars).
const ROLL = { asphalt: 0.012, kerb: 0.015, pad: 0.012, cobble: 0.02, gravel: 0.025, dirt: 0.03,
  grass: 0.045, sand: 0.1, snow: 0.06, ice: 0.01, dune: 0.15 };
// Surface roughness: shakes the body (and the camera with it).
const ROUGH = { asphalt: 0.05, kerb: 1, pad: 0.05, cobble: 0.7, gravel: 0.45, dirt: 0.35,
  grass: 0.4, sand: 0.25, snow: 0.2, ice: 0, dune: 0.3 };

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
    v.groundPrev = v.y;
    v.vgS = 0;
    v.load = 1;
    v.ax = v.ay = v.landT = 0;
    v.thrIn = v.brkIn = 0;
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
    const { handbrake = 0 } = v.intents;
    const m = c.mass;

    // Pedals don't act instantly: brake pressure builds over ~0.12 s and the
    // engine responds over ~0.15 s (keyboard input is all-or-nothing).
    const pedal = (cur, want, up, downRate) =>
      cur + Math.max(-dt / downRate, Math.min(dt / up, want - cur));
    v.thrIn = pedal(v.thrIn ?? 0, v.intents.throttle, 0.15, 0.05);
    v.brkIn = pedal(v.brkIn ?? 0, v.intents.brake, 0.12, 0.06);
    const throttle = v.thrIn, brake = v.brkIn;

    // Axes and velocity components.
    let fx = -Math.sin(v.heading), fz = -Math.cos(v.heading);
    let rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
    let vLong = v.vx * fx + v.vz * fz;
    let vLat = v.vx * rx + v.vz * rz;
    const vLong0 = vLong;

    v.surface = T.surfaceAt(v.x, v.z);
    const ground = !v.airborne || v.airTime < 0.08; // tiny hops keep traction
    const slope = ground ? T.slopeAlong(v.x, v.z, fx, fz) : 0;  // rise per m ahead
    const side = ground ? T.slopeAlong(v.x, v.z, rx, rz) : 0;   // rise per m to the right
    v.landT = Math.max(0, (v.landT ?? 0) - dt);
    // Vertical load factor from the road's curvature over a car length: over
    // a crest the car goes light (less grip), in a dip it's pressed down.
    if (ground) {
      const L = 4, d = Math.sign(vLong) || 1;
      const h0 = T.heightAt(v.x, v.z);
      const kappa = (T.heightAt(v.x + fx * L * d, v.z + fz * L * d) + T.heightAt(v.x - fx * L * d, v.z - fz * L * d) - 2 * h0) / (L * L);
      const want = Math.max(0.3, Math.min(1.6, 1 + (vLong * vLong * kappa) / G));
      v.load = (v.load ?? 1) + (want - (v.load ?? 1)) * Math.min(1, dt * 8);
    }

    // --- Tyre load ------------------------------------------------------------------
    // Weight (less on steep ground) × vertical load factor (light over crests,
    // heavy in compressions) + aero downforce. Tyres lose a little μ as load
    // rises (load sensitivity), and grip just after a hard landing.
    const down = 0.5 * RHO * c.cla * vLong * vLong;
    const N = m * G / Math.sqrt(1 + slope * slope + side * side) * (v.load ?? 1) + down;
    let mu = ground ? (c.tyres[v.surface] ?? c.tyres.grass) : 0;
    mu *= Math.pow(Math.max(0.5, N / (m * G)), -0.08);
    if (v.landT > 0) mu *= 0.6;

    // Longitudinal weight transfer (from last step's acceleration, lagged by
    // the suspension): braking loads the front, accelerating loads the rear.
    const wr = c.drive < 1 ? c.drive : 0.5;            // static rear weight share
    const shift = ((v.ax ?? 0) * c.cgh) / (c.wheelbase * G);
    const shareR = Math.max(0.15, Math.min(0.85, wr + shift));
    const axleF = mu * N * (1 - shareR), axleR = mu * N * shareR; // grip budget per axle
    const mF = m * (1 - wr), mR = m * wr;

    // --- Steering demand ----------------------------------------------------------
    // Cornering gets first call on the tyres; traction control / ABS then only
    // use what's left for driving and braking (otherwise full throttle at low
    // speed would leave no grip to steer with).
    v.steer += (v.intents.steer - v.steer) * Math.min(1, dt * 10);
    const delta = v.steer * c.steer / (1 + Math.abs(vLong) / 35); // less lock at speed
    const rWant = (vLong * Math.tan(delta)) / c.wheelbase;
    // Lateral need: the turn asked for, holding the car on a cross-slope, plus
    // catching any slide (stability control: a sliding car gets less power).
    const aNeed = Math.abs(rWant * vLong) + Math.abs(vLat) * 4 + G * Math.abs(side);
    const latF = Math.min(axleF, mF * aNeed), latR = Math.min(axleR, mR * aNeed);
    const availF = Math.sqrt(Math.max(0, axleF * axleF - latF * latF));
    const availR = Math.sqrt(Math.max(0, axleR * axleR - latR * latR));

    // --- Longitudinal forces -------------------------------------------------------
    let Fdrive = 0, Fbrake = 0;
    const rwd = c.drive < 1;
    const tractionCap = rwd ? availR : availF + availR;
    const power = Fmax => Math.min((c.power * 1000) / Math.max(Math.abs(vLong), 4), Fmax);
    if (throttle > 0) {
      const limiter = 1 - smoothstep(c.vmax / 3.6 * 0.97, c.vmax / 3.6, vLong);
      Fdrive = throttle * power(tractionCap) * limiter;
    }
    // Brakes (ABS): the driver's brake and the corner share each axle's
    // friction circle in proportion. Braking hard mid-corner therefore costs
    // steering (understeer) and unloads the rear (oversteer) — unlike drive
    // power, which traction control only gives out of what steering leaves.
    let brakeF = 0, brakeR = 0;
    if (brake > 0) {
      if (vLong > 0.5) {
        const want = brake * Math.min(c.brakeG * N, mu * N);
        // Brake bias leans further forward than the weight does (as real cars
        // are set up), so the rear isn't the first axle to give up.
        brakeR = want * shareR * 0.7;
        brakeF = want - brakeR;
        const fitF = Math.hypot(latF, brakeF), fitR = Math.hypot(latR, brakeR);
        if (fitF > axleF) brakeF *= axleF / fitF;
        if (fitR > axleR) brakeR *= axleR / fitR;
        Fbrake = brakeF + brakeR;
      } else Fdrive -= brake * power(tractionCap) * 0.35; // reverse gear
    }
    const Fhb = handbrake && Math.abs(vLong) > 0.5 ? handbrake * axleR * 1.6 : 0;
    // Off throttle the drivetrain drags the car down (engine braking).
    const Feb = ground && throttle < 0.05 && vLong > 1 ? c.engineBrake * m * G * Math.min(1, vLong / 8) : 0;
    // Rolling resistance by surface (sand and snow are hard work for every
    // car); low cars on loose ground also plough, more the faster they go.
    const loose = (LOOSE[v.surface] ?? 0) * c.offroad * (1 + Math.abs(vLong) / 6);
    const crr = ROLL[v.surface] ?? ROLL.grass;
    const Fres = 0.5 * RHO * c.cda * vLong * vLong + (crr + loose) * m * G + Feb;
    const Fslope = ground ? m * G * slope : 0;

    // Per-axle longitudinal use → what's left for cornering (friction circle).
    const drive = Math.abs(Fdrive);
    const frontLong = (rwd ? 0 : drive * 0.5) + brakeF;
    const rearLong = (rwd ? drive : drive * 0.5) + brakeR + Fhb + (rwd ? Feb : Feb * 0.5);
    const aLatF = Math.sqrt(Math.max(0, axleF * axleF - frontLong * frontLong)) / mF;
    const aLatR = Math.sqrt(Math.max(0, axleR * axleR - rearLong * rearLong)) / mR * (handbrake ? 0.35 : 1);

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
      vLat -= G * side * dt; // a cross-slope pushes the car downhill
      const catchUp = aLatR * dt;
      vLat -= Math.max(-catchUp, Math.min(catchUp, vLat));
    }

    // Parked: static friction holds the car on gentle ground; the handbrake
    // holds it on any slope the tyres can grip.
    const parked = !throttle && ground && (
      (!brake && Math.abs(vLong) < 0.05 && Math.abs(Fslope / m) < 0.5) ||
      (handbrake && Math.abs(vLong) < 1 && Math.abs(Fslope) < mu * N));
    if (parked) {
      vLong = 0;
      // Sideways too, unless the cross-slope beats the tyres (ice on a camber).
      if (Math.abs(side) < mu) vLat *= 0.5;
    }

    // Body accelerations (lagged like a suspension) for weight transfer and
    // pitch/roll of the body.
    const k = Math.min(1, dt * 8);
    v.ax = (v.ax ?? 0) + (((vLong - vLong0) / dt) - (v.ax ?? 0)) * k;
    v.ay = (v.ay ?? 0) + ((ground ? r * vLong : 0) - (v.ay ?? 0)) * k;

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
    // Aero downforce presses the car down too: a fast F1 car stays glued
    // over bumps that would launch a rally car.
    const Gv = this.gravity + (0.5 * RHO * v.car.cla * v.speed * v.speed) / v.car.mass;
    if (v.airborne) {
      v.airTime += dt;
      v.vy -= Gv * dt;
      v.y += v.vy * dt;
      v.pitch += (-0.12 - v.pitch) * Math.min(1, dt * 2); // nose drops slowly in the air
      v.roll += (0 - v.roll) * Math.min(1, dt * 2);
      if (v.y <= g.h) {
        v.landed = -v.vy;
        if (v.vy < -8) { v.vx *= 0.8; v.vz *= 0.8; } // hard landing
        if (v.vy < -5) v.landT = 0.25;                // tyres/suspension recover: less grip
        v.load = 1;
        // Carry on with the ground's own vertical speed (downhill: falling with
        // it), not 0 — and not the stale take-off value, which would bounce
        // the car straight back up.
        const vg = v.speed * this.terrain.slopeAlong(v.x, v.z, -Math.sin(v.heading), -Math.cos(v.heading));
        v.y = g.h;
        v.vy = Math.min(0, vg);
        v.airborne = false;
        v.groundPrev = g.h;
        v.vgS = vg;
      }
      return;
    }
    // Grounded: the car falls under gravity (+ downforce) and the ground can
    // only push it up. Where the ground drops away faster than that (crests),
    // a gap builds up over successive steps; past 5 cm the car is airborne.
    // Ground's vertical speed under the car, low-passed: the suspension soaks
    // up small bumps so only sustained crests can throw the car upwards.
    const vgRaw = (g.h - (v.groundPrev ?? g.h)) / dt;
    v.groundPrev = g.h;
    v.vgS = (v.vgS ?? vgRaw) + (vgRaw - (v.vgS ?? vgRaw)) * Math.min(1, dt * 12);
    v.vy -= Gv * dt;
    v.y += v.vy * dt;
    if (v.y <= g.h) {
      v.y = g.h;
      v.vy = Math.max(v.vy, v.vgS);
    } else if (v.y > g.h + 0.05) {
      v.airborne = true;
      v.airTime = 0;
      return;
    }
    // Body follows the ground, squats/dives with acceleration, leans out of
    // corners and shakes on rough surfaces.
    const c = v.car;
    const rough = (ROUGH[v.surface] ?? ROUGH.grass) * Math.min(1, Math.abs(v.speed) / 15);
    const shake = rough * (0.004 + c.soft * 0.12);
    const n1 = Math.sin(v.x * 3.1 + v.z * 1.7) * Math.sin(v.z * 2.3 - v.x * 0.9);
    const n2 = Math.sin(v.x * 2.2 - v.z * 3.3) * Math.sin(v.x * 1.3 + v.z * 2.9);
    const pitchT = g.pitch + Math.max(-0.08, Math.min(0.08, ((v.ax ?? 0) / G) * c.soft)) + n1 * shake;
    const rollT = g.roll + Math.max(-0.1, Math.min(0.1, ((v.ay ?? 0) / G) * c.soft)) + n2 * shake;
    const k = Math.min(1, dt * 12);
    v.pitch += (pitchT - v.pitch) * k;
    v.roll += (rollT - v.roll) * k;
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
