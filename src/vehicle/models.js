import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { material } from '../world/materials.js';

/**
 * Low-poly car models (original designs and liveries — no real-world
 * branding). Each is a few dozen boxes, some tapered, merged into ONE mesh
 * with vertex colours, so a detailed car still costs one draw call per pass.
 *
 * A builder returns:
 *   wheels  [{ x, z, r, w }]  positions relative to the car centre (front = -z)
 *   rim     wheel rim colour
 *   lamp    [x, y, z] where the headlight beam starts
 *   lamps   [[x, y, z, w, h]] headlight lenses        tails  same, tail lights
 */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();

/** Collects coloured shapes, then merges them into a single vertex-coloured mesh. */
export function shapes() {
  const geos = [];
  const push = (geo, color, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _one));
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  };
  const api = {
    /**
     * Box centred at (x, y, z). Tapers (all optional):
     *   top: [sx, sz]  scale of the top face     topShift: move the top face along z
     *   front / back   width scale at the -z / +z end      drop: lower the front top edge
     */
    box(w, h, d, color, x, y, z, { top, topShift = 0, front, back, drop = 0, rx = 0 } = {}) {
      const g = new THREE.BoxGeometry(w, h, d);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
        if (front && pz < 0) px *= front;
        if (back && pz > 0) px *= back;
        if (drop && pz < 0 && py > 0) py -= drop;
        if (py > 0 && top) { px *= top[0]; pz = pz * top[1] + topShift; }
        pos.setXYZ(i, px, py, pz);
      }
      push(g, color, x, y, z, rx);
      return api;
    },
    /** Both sides at once: box at ±x. */
    pair(w, h, d, color, x, y, z, opts) { return api.box(w, h, d, color, x, y, z, opts).box(w, h, d, color, -x, y, z, opts); },
    /** Cylinder of radius r and length len along `axis` ('x' or 'z'). */
    cyl(r, len, color, x, y, z, axis = 'x', sides = 12) {
      push(new THREE.CylinderGeometry(r, r, len, sides), color, x, y, z, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0);
      return api;
    },
    ball(r, color, x, y, z) { push(new THREE.IcosahedronGeometry(r, 1), color, x, y, z); return api; },
    /** The merged mesh (vertex colours; catches lamp light like any prop). */
    mesh() {
      const mesh = new THREE.Mesh(mergeGeometries(geos), material('#ffffff', { vertexColors: true }));
      mesh.castShadow = true;
      return mesh;
    },
  };
  return api;
}

const GLASS = '#18222e', DARK = '#22252a', WHITE = '#f3f4f6';
const corners = (x, z) => [[-x, -z], [x, -z], [-x, z], [x, z]];

const BUILDERS = {
  // Rally hatch: short, wide arches, light pod on the bonnet, a big rear wing.
  rally(b) {
    const red = '#ff4d4d';
    b.box(1.8, 0.5, 3.9, red, 0, 0.65, 0, { front: 0.92, back: 0.95 })              // body
      .box(1.84, 0.14, 2.9, WHITE, 0, 0.47, 0.05)                                    // white sills
      .box(1.6, 0.5, 2.05, GLASS, 0, 1.15, 0.35, { top: [0.8, 0.68], topShift: 0.12 }) // greenhouse
      .box(1.26, 0.05, 1.36, WHITE, 0, 1.425, 0.48)                                  // roof
      .box(0.4, 0.12, 0.45, DARK, 0, 1.5, 0.05)                                      // roof scoop
      .box(0.3, 0.02, 1.25, WHITE, 0, 0.91, -1.2)                                    // bonnet stripe
      .pair(0.32, 0.03, 0.5, DARK, 0.45, 0.915, -1.2)                                // bonnet vents
      .box(0.95, 0.2, 0.14, DARK, 0, 1.0, -1.72)                                     // light pod
      .box(1.86, 0.16, 0.2, DARK, 0, 0.42, -1.93)                                    // splitter
      .box(1.7, 0.2, 0.16, DARK, 0, 0.45, 1.95)                                      // rear bumper
      .pair(0.12, 0.26, 0.95, DARK, 0.94, 0.72, -1.25).pair(0.12, 0.26, 0.95, DARK, 0.94, 0.72, 1.25) // arches
      .pair(0.03, 0.34, 0.55, WHITE, 0.905, 0.74, 0.2)                               // door number panels
      .pair(0.2, 0.1, 0.12, red, 0.98, 1.0, -0.45)                                   // mirrors
      .box(1.72, 0.06, 0.42, DARK, 0, 1.56, 1.72)                                    // rear wing
      .pair(0.06, 0.3, 0.46, red, 0.86, 1.46, 1.72)                                  // wing endplates
      .pair(0.07, 0.62, 0.25, DARK, 0.5, 1.22, 1.7)                                  // wing struts
      .pair(0.36, 0.26, 0.04, WHITE, 0.78, 0.36, 1.8)                                // mud flaps
      .box(0.14, 0.1, 0.14, '#8a8f98', 0.5, 0.42, 2.0);                              // exhaust
    return {
      wheels: corners(0.92, 1.25).map(([x, z]) => ({ x, z, r: 0.42, w: 0.34 })), rim: '#f0f0f0',
      lamp: [0, 0.8, -1.98],
      lamps: [[-0.6, 0.72, -1.97, 0.42, 0.16], [0.6, 0.72, -1.97, 0.42, 0.16], [-0.24, 1.0, -1.8, 0.3, 0.16], [0.24, 1.0, -1.8, 0.3, 0.16]],
      tails: [[-0.62, 0.78, 1.97, 0.4, 0.14], [0.62, 0.78, 1.97, 0.4, 0.14]],
    };
  },

  // Single-seater: needle nose, open wheels on wishbones, halo, big wings.
  formula(b) {
    const teal = '#00b4a6';
    b.box(1.45, 0.05, 3.3, DARK, 0, 0.13, 0.2, { front: 0.5 })                       // floor
      .box(0.72, 0.42, 2.3, WHITE, 0, 0.42, 0, { front: 0.8 })                       // tub
      .box(0.5, 0.3, 1.6, WHITE, 0, 0.36, -1.9, { front: 0.42, drop: 0.12 })         // nose
      .box(0.14, 0.02, 1.5, teal, 0, 0.5, -1.75, { rx: -0.075 })                     // nose stripe
      .box(1.9, 0.05, 0.42, teal, 0, 0.16, -2.6)                                     // front wing
      .pair(0.62, 0.05, 0.2, WHITE, 0.6, 0.24, -2.46)                                // wing flaps
      .pair(0.05, 0.22, 0.5, DARK, 0.95, 0.24, -2.58)                                // front endplates
      .pair(0.5, 0.34, 1.5, teal, 0.58, 0.36, 0.45, { front: 0.8, back: 0.6 })       // sidepods
      .pair(0.4, 0.2, 0.06, DARK, 0.58, 0.4, -0.32)                                  // sidepod inlets
      .box(0.42, 0.04, 0.72, DARK, 0, 0.645, -0.35)                                  // cockpit opening
      .ball(0.17, '#ffd23f', 0, 0.76, -0.28)                                         // helmet
      .box(0.06, 0.06, 0.62, DARK, 0, 0.9, -0.7, { rx: 0.32 })                       // halo spar
      .box(0.56, 0.06, 0.07, DARK, 0, 0.94, -0.22)                                   // halo hoop
      .box(0.36, 0.5, 0.6, WHITE, 0, 0.88, 0.28, { top: [0.7, 0.8] })                // airbox
      .box(0.22, 0.18, 0.04, DARK, 0, 1.0, -0.03)                                    // airbox inlet
      .box(0.5, 0.4, 1.7, WHITE, 0, 0.6, 1.05, { back: 0.35, top: [0.5, 1] })        // engine cover
      .box(0.05, 0.32, 1.25, teal, 0, 0.94, 1.1)                                     // shark fin
      .box(1.08, 0.07, 0.42, teal, 0, 1.05, 2.0)                                     // rear wing
      .box(1.0, 0.05, 0.25, DARK, 0, 0.6, 2.0)                                       // beam wing
      .pair(0.06, 0.64, 0.56, DARK, 0.55, 0.82, 2.0)                                 // rear endplates
      .box(0.9, 0.12, 0.3, DARK, 0, 0.2, 1.95)                                       // diffuser
      .pair(0.62, 0.035, 0.06, DARK, 0.5, 0.42, -1.75).pair(0.62, 0.035, 0.06, DARK, 0.5, 0.34, -1.52) // front wishbones
      .pair(0.6, 0.035, 0.06, DARK, 0.5, 0.44, 1.8).pair(0.6, 0.035, 0.06, DARK, 0.5, 0.36, 1.55)       // rear wishbones
      .pair(0.16, 0.08, 0.1, teal, 0.5, 0.74, -0.78);                                // mirrors
    return {
      wheels: corners(0.85, 1).map(([x, z], i) => ({ x, z: z < 0 ? -1.75 : 1.8, r: i < 2 ? 0.36 : 0.38, w: i < 2 ? 0.36 : 0.44 })), rim: '#c8ccd2',
      lamp: [0, 0.4, -2.72],
      lamps: [[0, 0.33, -2.71, 0.16, 0.1]],
      tails: [[0, 0.5, 2.12, 0.14, 0.22]], // rain light
    };
  },

  // Le Mans prototype: long and low, bubble cockpit between tall wheel arches, shark fin.
  hypercar(b) {
    const navy = '#2a4590', gold = '#ffd166'; // a blue bright enough to read against the dark glass
    b.box(2.0, 0.07, 4.9, DARK, 0, 0.2, 0)                                           // floor
      .box(1.25, 0.4, 4.5, navy, 0, 0.48, 0, { front: 0.7 })                         // core
      .pair(0.46, 0.52, 1.35, navy, 0.78, 0.54, -1.55, { top: [0.85, 0.8] })         // front arches
      .pair(0.46, 0.56, 1.5, navy, 0.78, 0.56, 1.5, { top: [0.85, 0.85] })           // rear arches
      .pair(0.44, 0.3, 1.75, navy, 0.78, 0.42, -0.05)                                // side pods
      .pair(0.3, 0.02, 0.5, DARK, 0.78, 0.81, -1.55)                                 // arch louvres
      .pair(0.36, 0.02, 0.5, WHITE, 0.78, 0.58, 0.05)                                // number panels
      .box(1.05, 0.46, 1.75, GLASS, 0, 0.91, -0.35, { top: [0.68, 0.55], topShift: 0.1 }) // cockpit
      .box(0.18, 0.02, 0.9, gold, 0, 1.15, -0.25)                                    // roof stripe
      .box(0.2, 0.02, 1.5, gold, 0, 0.69, -1.5)                                      // nose stripe
      .box(1.0, 0.34, 2.0, navy, 0, 0.85, 1.2, { top: [0.45, 0.95], back: 0.7 })     // engine cover
      .box(0.06, 0.5, 1.7, navy, 0, 1.22, 1.25)                                      // shark fin
      .box(1.95, 0.07, 0.45, gold, 0, 1.24, 2.28)                                    // rear wing
      .pair(0.06, 0.52, 0.6, navy, 0.97, 1.04, 2.25)                                 // wing endplates
      .box(2.02, 0.06, 0.3, DARK, 0, 0.17, -2.4)                                     // splitter
      .box(1.6, 0.18, 0.25, DARK, 0, 0.3, 2.35)                                      // diffuser
      .pair(0.16, 0.08, 0.12, navy, 0.62, 0.98, -0.9);                               // mirrors
    return {
      wheels: corners(0.9, 1.55).map(([x, z]) => ({ x, z, r: 0.38, w: 0.38 })), rim: gold,
      lamp: [0, 0.6, -2.3],
      lamps: [[-0.78, 0.6, -2.24, 0.3, 0.16], [0.78, 0.6, -2.24, 0.3, 0.16]],
      tails: [[-0.78, 0.62, 2.27, 0.34, 0.1], [0.78, 0.62, 2.27, 0.34, 0.1]],
    };
  },

  // Front-engined GT: long bonnet with a bulge, cabin set back, racing stripe, wing on struts.
  gt(b) {
    const orange = '#ff9a3c';
    b.box(1.92, 0.48, 4.5, orange, 0, 0.62, 0, { front: 0.9, back: 0.94 })           // body
      .box(0.95, 0.08, 1.6, orange, 0, 0.9, -1.25, { front: 0.8 })                   // bonnet bulge
      .pair(0.28, 0.03, 0.55, DARK, 0.64, 0.875, -1.1)                               // bonnet vents
      .box(0.4, 0.02, 1.58, WHITE, 0, 0.95, -1.25)                                   // stripe: bonnet
      .box(0.4, 0.02, 1.0, WHITE, 0, 1.385, 0.72)                                    //         roof
      .box(0.4, 0.02, 0.75, WHITE, 0, 0.87, 1.88)                                    //         boot
      .box(1.56, 0.48, 1.95, GLASS, 0, 1.1, 0.6, { top: [0.78, 0.6], topShift: 0.12 }) // greenhouse
      .box(1.2, 0.04, 1.12, orange, 0, 1.36, 0.72)                                   // roof
      .pair(0.12, 0.28, 1.0, orange, 0.99, 0.66, -1.35).pair(0.14, 0.3, 1.05, orange, 1.0, 0.67, 1.35) // arches
      .pair(0.1, 0.1, 1.7, DARK, 0.98, 0.38, 0)                                      // side skirts
      .box(1.98, 0.07, 0.36, DARK, 0, 0.34, -2.22)                                   // splitter
      .box(1.5, 0.16, 0.26, DARK, 0, 0.32, 2.2)                                      // diffuser
      .box(1.9, 0.06, 0.46, DARK, 0, 1.48, 2.02)                                     // rear wing
      .pair(0.05, 0.26, 0.5, orange, 0.95, 1.42, 2.02)                               // wing endplates
      .pair(0.07, 0.6, 0.22, DARK, 0.55, 1.16, 1.98)                                 // wing struts
      .pair(0.14, 0.1, 0.1, '#8a8f98', 0.3, 0.42, 2.28)                              // exhausts
      .pair(0.2, 0.1, 0.12, orange, 1.0, 1.02, -0.2);                                // mirrors
    return {
      wheels: corners(0.92, 1.35).map(([x, z]) => ({ x, z, r: 0.4, w: 0.38 })), rim: '#9aa0a8',
      lamp: [0, 0.75, -2.28],
      lamps: [[-0.66, 0.72, -2.26, 0.4, 0.14], [0.66, 0.72, -2.26, 0.4, 0.14]],
      tails: [[-0.66, 0.76, 2.26, 0.42, 0.1], [0.66, 0.76, 2.26, 0.42, 0.1]],
    };
  },

  // Classic 4x4: tall and square, roof rack with luggage, bull bar, snorkel, spare on the back.
  trail(b) {
    const green = '#6b8f5e', cream = '#efe6cf';
    b.box(1.7, 0.22, 4.0, DARK, 0, 0.72, 0)                                          // chassis
      .box(1.85, 0.6, 4.0, green, 0, 1.12, 0)                                        // body
      .box(1.45, 0.1, 1.25, green, 0, 1.47, -1.3)                                    // bonnet
      .box(1.74, 0.62, 2.5, GLASS, 0, 1.72, 0.5, { top: [0.94, 0.96] })              // cabin glass
      .box(1.76, 0.18, 2.52, green, 0, 1.5, 0.5)                                     // waist line
      .pair(0.1, 0.62, 0.12, green, 0.84, 1.72, -0.7).pair(0.1, 0.62, 0.12, green, 0.84, 1.72, 0.5).pair(0.1, 0.62, 0.12, green, 0.84, 1.72, 1.7) // pillars
      .box(1.78, 0.1, 2.6, cream, 0, 2.07, 0.5)                                      // roof
      .pair(0.06, 0.08, 2.2, DARK, 0.72, 2.17, 0.5)                                  // rack rails
      .box(1.5, 0.05, 0.06, DARK, 0, 2.2, -0.4).box(1.5, 0.05, 0.06, DARK, 0, 2.2, 0.2)
      .box(1.5, 0.05, 0.06, DARK, 0, 2.2, 0.8).box(1.5, 0.05, 0.06, DARK, 0, 2.2, 1.4) // rack bars
      .box(0.8, 0.3, 0.6, '#b89a6a', -0.2, 2.38, 0.95)                               // crate
      .box(0.25, 0.36, 0.4, '#b8402f', 0.45, 2.4, 0.05)                              // jerry can
      .box(1.9, 0.14, 0.14, DARK, 0, 0.8, -2.1)                                      // bull bar
      .pair(0.1, 0.5, 0.1, DARK, 0.5, 1.02, -2.1).box(1.1, 0.08, 0.1, DARK, 0, 1.28, -2.1)
      .pair(0.16, 0.16, 1.15, DARK, 0.96, 0.98, -1.3).pair(0.16, 0.16, 1.15, DARK, 0.96, 0.98, 1.3) // arches
      .pair(0.2, 0.07, 1.3, DARK, 1.0, 0.62, 0)                                      // side steps
      .box(0.1, 0.85, 0.1, DARK, -0.92, 1.75, -0.82).box(0.14, 0.14, 0.2, DARK, -0.92, 2.22, -0.87) // snorkel
      .box(1.8, 0.16, 0.14, DARK, 0, 0.78, 2.05)                                     // rear bumper
      .cyl(0.42, 0.26, DARK, 0, 1.25, 2.14, 'z').cyl(0.18, 0.28, cream, 0, 1.25, 2.15, 'z') // spare wheel
      .pair(0.14, 0.2, 0.1, DARK, 1.0, 1.6, -0.72);                                  // mirrors
    return {
      wheels: corners(0.95, 1.3).map(([x, z]) => ({ x, z, r: 0.5, w: 0.4 })), rim: cream,
      lamp: [0, 1.1, -2.05],
      lamps: [[-0.62, 1.12, -2.03, 0.28, 0.26], [0.62, 1.12, -2.03, 0.28, 0.26]],
      tails: [[-0.78, 1.05, 2.03, 0.16, 0.3], [0.78, 1.05, 2.03, 0.16, 0.3]],
    };
  },
};

/** Builds the body mesh into `group` and returns the model's spec (see above). */
export function buildCarModel(id, group) {
  const b = shapes();
  const spec = (BUILDERS[id] ?? BUILDERS.rally)(b);
  const body = b.mesh();
  group.add(body);
  return { ...spec, body };
}

/**
 * A wheel as one mesh: tyre, coloured rim on both faces, a spoke bar and a
 * few tread blocks so its spin shows from the side and from above.
 */
export function buildWheel({ r, w }, rim) {
  const b = shapes();
  b.cyl(r, w, '#26282c', 0, 0, 0, 'x', 14)
    .cyl(r * 0.62, w + 0.03, rim, 0, 0, 0, 'x', 10)
    .box(w + 0.05, r * 1.05, 0.09, '#3a3d42', 0, 0, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.box(w * 0.9, 0.05, 0.11, '#4b4f55', 0, Math.cos(a) * r, Math.sin(a) * r, { rx: a });
  }
  return b.mesh();
}
