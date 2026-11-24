import * as THREE from 'three';
import { CHARSET } from '../render/charsets.js';
import { geometries } from '../world/geometries.js';
import { applyCutaway, cutawayUniforms, CUTAWAY_GLSL } from '../render/cutaway.js';

/**
 * Glyph particles: pooled InstancedMeshes (one per charset) so dust renders
 * as `. : %` and spray as `~ ≈` through the normal ASCII pipeline.
 * Particles "fade" by shrinking — there is no transparency in glyph land.
 */
/**
 * Info-pass material for particles: a flat camera-facing normal and the
 * "soft" charset encoding (64 + id), so puffs draw as fill glyphs without
 * edge outlines around every facet.
 */
function softInfoMaterial(charset) {
  return new THREE.ShaderMaterial({
    uniforms: cutawayUniforms,
    vertexShader: /* glsl */ `
      varying vec4 vClip;
      varying float vDepth;
      void main() {
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        vec4 mv = modelViewMatrix * p;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
        vClip = gl_Position;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec4 vClip;
      varying float vDepth;
      ${CUTAWAY_GLSL}
      void main() {
        if (cutaway(vClip, vDepth)) discard; // never hide the car
        gl_FragColor = vec4(0.5, 0.5, 1.0, ${(64 + charset).toFixed(1)} / 255.0);
      }
    `,
  });
}

class Pool {
  constructor(scene, size, charset) {
    this.size = size;
    this.mesh = new THREE.InstancedMesh(
      geometries.ball(),
      applyCutaway(new THREE.MeshBasicMaterial({ color: '#ffffff' })), // unlit: bright, flat clouds
      size,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false; // instances move every frame
    this.mesh.castShadow = false;
    this.mesh.userData.charset = charset;
    this.mesh.userData.infoMaterial = softInfoMaterial(charset);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Allocate instanceColor up front.
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.items = [];
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
  }

  spawn(p) {
    if (this.items.length >= this.size) this.items.shift(); // recycle the oldest
    this.items.push(p);
  }

  update(dt) {
    const { items, mesh, _m: m, _c: c } = this;
    let n = 0;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      // Drag pulls the velocity toward the wind (still air unless given).
      p.vx += ((p.wx ?? 0) - p.vx) * Math.min(1, p.drag * dt);
      p.vz += ((p.wz ?? 0) - p.vz) * Math.min(1, p.drag * dt);
      p.vy += (p.gravity - p.vy * p.drag) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.age / p.life;
      // Puffs swell then shrink; "steady" motes keep their size, easing in and out.
      const s = p.steady ? p.size * Math.min(1, t * 8, (1 - t) * 8)
        : p.size * Math.sin(Math.PI * Math.min(1, t * 1.6 + 0.15)) * (1 - t * 0.4);
      m.makeScale(s, s, s).setPosition(p.x, p.y, p.z);
      mesh.setMatrixAt(n, m);
      mesh.setColorAt(n, c.set(p.color));
      items[n++] = p;
    }
    items.length = n;
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

const DUST_COLORS = {
  gravel: '#e8d3a2', dirt: '#b08a5c', grass: '#9aa86a', sand: '#efe0b4', pad: '#ddd3bc',
};

export function createParticles(scene) {
  const dust = new Pool(scene, 260, CHARSET.DIRT);
  const spray = new Pool(scene, 120, CHARSET.TILDE);
  // Weather: snowflakes, blown sand, fireflies (see ambient()).
  const flakes = new Pool(scene, 300, CHARSET.SNOW);
  const air = { snow: 0, sand: 0, fly: 0 };
  const rnd = (a, b) => a + Math.random() * (b - a);
  let carry = 0;

  return {
    /**
     * Continuous emission from the rear wheels.
     * wheels: [[x,y,z], ...], v: vehicle state.
     */
    drive(dt, wheels, v) {
      if (v.airborne) return;
      const speed = Math.abs(v.speed);
      const surface = v.surface ?? 'grass';
      const loose = surface in DUST_COLORS;
      const sliding = Math.abs(v.steer) > 0.6 && speed > 8;
      let rate = 0;
      if (loose && speed > 3) rate = Math.min(120, speed * 3);     // dust trail
      else if (!loose && sliding) rate = speed * 0.8;               // tyre smoke on tarmac/cobbles
      carry += rate * dt;
      const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading);
      while (carry >= 1) {
        carry -= 1;
        const w = wheels[Math.random() < 0.5 ? 0 : 1];
        dust.spawn({
          x: w[0] + rnd(-0.2, 0.2), y: w[1] + 0.15, z: w[2] + rnd(-0.2, 0.2),
          vx: -fx * speed * rnd(0.1, 0.3) + rnd(-1, 1),
          vy: rnd(0.8, 2.2),
          vz: -fz * speed * rnd(0.1, 0.3) + rnd(-1, 1),
          gravity: -0.6, drag: 1.8,
          size: loose ? rnd(0.7, 1.3) : rnd(0.5, 0.8),
          life: rnd(0.8, 1.6), age: 0,
          color: loose ? DUST_COLORS[surface] : '#c9ccd2',
        });
      }
    },

    /** One-off cloud (landings, crashes). */
    burst(x, y, z, count, { color = '#d8c39a', speed = 5, size = 1.3 } = {}) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = rnd(0.3, 1) * speed;
        dust.spawn({
          x, y: y + 0.2, z, vx: Math.cos(a) * r, vy: rnd(1, 3), vz: Math.sin(a) * r,
          gravity: -0.8, drag: 2.2, size: rnd(0.4, 1) * size, life: rnd(0.6, 1.2), age: 0, color,
        });
      }
    },

    /** Water splash. */
    splash(x, y, z, count = 40) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = rnd(1, 5);
        spray.spawn({
          x, y, z, vx: Math.cos(a) * r, vy: rnd(4, 9), vz: Math.sin(a) * r,
          gravity: -14, drag: 0.6, size: rnd(0.3, 0.7), life: rnd(0.8, 1.4), age: 0,
          color: Math.random() < 0.5 ? '#bfe6ff' : '#5fb0e0',
        });
      }
    },

    /**
     * Weather around a point (the camera's focus): snow falls in the snow
     * biome, sand blows low across the desert, fireflies drift over
     * temperate ground at night. `radius` widens with the overview camera.
     */
    ambient(dt, x, z, heightAt, { snow = 0, desert = 0, night = 0, radius = 24 } = {}) {
      const spot = () => {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
        return [x + Math.cos(a) * r, z + Math.sin(a) * r];
      };
      const wide = Math.min(1.6, radius / 24), big = Math.sqrt(radius / 24);
      air.snow += snow * 70 * wide * dt;
      while (air.snow >= 1) {
        air.snow -= 1;
        const [px, pz] = spot();
        const fall = rnd(1.6, 2.4), top = rnd(2, 6.5); // low: flakes near the camera would loom
        flakes.spawn({
          x: px, y: heightAt(px, pz) + top, z: pz, vx: 1.2, vy: -fall, vz: 0.4, wx: rnd(0.8, 2.2), wz: rnd(-0.4, 1),
          gravity: -fall * 1.2, drag: 1.2, size: rnd(0.1, 0.17) * big, life: top / fall, age: 0, steady: true,
          color: '#ffffff',
        });
      }
      air.sand += desert * 16 * wide * dt;
      while (air.sand >= 1) {
        air.sand -= 1;
        const [px, pz] = spot();
        const gust = rnd(5, 9);
        dust.spawn({
          x: px, y: heightAt(px, pz) + rnd(0.2, 1.2), z: pz, vx: gust, vy: rnd(0, 0.6), vz: gust * 0.4, wx: gust, wz: gust * 0.4,
          gravity: 0, drag: 0.8, size: rnd(0.3, 0.6) * big, life: rnd(1.2, 2.2), age: 0,
          color: '#efdcae',
        });
      }
      air.fly += night * Math.max(0, 1 - snow - desert) * 5 * wide * dt;
      while (air.fly >= 1) {
        air.fly -= 1;
        const [px, pz] = spot();
        const y = heightAt(px, pz);
        if (y < 1) continue; // not over the sea
        flakes.spawn({
          x: px, y: y + rnd(0.6, 2.2), z: pz, vx: rnd(-0.6, 0.6), vy: rnd(-0.1, 0.25), vz: rnd(-0.6, 0.6), wx: rnd(-0.5, 0.5), wz: rnd(-0.5, 0.5),
          gravity: 0, drag: 0.5, size: 0.17 * big, life: rnd(2, 4), age: 0, steady: true,
          color: '#e6ff8a',
        });
      }
    },

    update(dt) {
      dust.update(dt);
      spray.update(dt);
      flakes.update(dt);
    },
  };
}
