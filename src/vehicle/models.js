import * as THREE from 'three';
import { material } from '../world/materials.js';

/**
 * Low-poly car models built from boxes and cylinders (original designs and
 * liveries — no real-world branding). Each builder returns:
 *   parts:  meshes making up the body (squashed on landings)
 *   wheels: [{ x, z, r, w }]   positions relative to the car centre (front = -z)
 *   lamp:   [x, y, z] front lamp position     tail: [x, y, z]
 *   width   (lamp bar widths)
 */
function box(group, w, h, d, color, x, y, z, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  m.position.set(x, y, z);
  m.rotation.x = rx;
  m.castShadow = true;
  group.add(m);
  return m;
}

const BUILDERS = {
  rally(g) {
    const parts = [
      box(g, 1.8, 0.6, 3.2, '#ff5d5d', 0, 0.7, 0),        // body
      box(g, 1.5, 0.6, 1.6, '#f1f3f5', 0, 1.3, 0.3),      // cabin
      box(g, 0.5, 0.18, 0.6, '#2b2b2b', 0, 1.68, 0.2),    // roof scoop
      box(g, 1.7, 0.08, 0.45, '#2b2b2b', 0, 1.45, 1.55),  // rear wing
      box(g, 1.85, 0.15, 0.3, '#2b2b2b', 0, 0.42, -1.6),  // splitter
    ];
    const wheels = [[-0.95, -1.05], [0.95, -1.05], [-0.95, 1.05], [0.95, 1.05]].map(([x, z]) => ({ x, z, r: 0.42, w: 0.35 }));
    return { parts, wheels, lamp: [0, 0.8, -1.65], tail: [0, 0.85, 1.62], width: 1.4 };
  },

  formula(g) {
    const teal = '#00b4a6', white = '#e8edf2', dark = '#1c2026';
    const parts = [
      box(g, 0.75, 0.45, 2.6, white, 0, 0.45, 0.1),        // monocoque
      box(g, 0.4, 0.28, 1.5, white, 0, 0.35, -1.9),         // nose
      box(g, 1.9, 0.08, 0.45, teal, 0, 0.18, -2.55),        // front wing
      box(g, 1.5, 0.35, 1.3, teal, 0, 0.38, 0.35),          // sidepods
      box(g, 0.45, 0.55, 0.9, dark, 0, 0.85, 0.45),         // airbox / engine cover
      box(g, 0.55, 0.1, 0.55, dark, 0, 0.78, -0.5),         // cockpit / halo
      box(g, 1.1, 0.35, 0.12, teal, 0, 1.05, 1.95),         // rear wing
      box(g, 0.08, 0.45, 0.4, dark, 0.5, 0.75, 1.9),        // wing endplates
      box(g, 0.08, 0.45, 0.4, dark, -0.5, 0.75, 1.9),
    ];
    const wheels = [[-0.85, -1.75], [0.85, -1.75], [-0.85, 1.8], [0.85, 1.8]].map(([x, z], i) => ({ x, z, r: i < 2 ? 0.36 : 0.38, w: 0.42 }));
    return { parts, wheels, lamp: [0, 0.4, -2.6], tail: [0, 0.75, 2.05], width: 0.3 };
  },

  hypercar(g) {
    const navy = '#1f2a44', gold = '#ffd166', dark = '#14171c';
    const parts = [
      box(g, 2.0, 0.55, 4.8, navy, 0, 0.5, 0),              // body
      box(g, 1.1, 0.45, 1.6, dark, 0, 1.0, -0.2),           // canopy
      box(g, 0.08, 0.6, 1.6, navy, 0, 1.15, 1.2),           // shark fin
      box(g, 2.0, 0.08, 0.5, gold, 0, 1.15, 2.3),           // rear wing
      box(g, 2.05, 0.1, 0.4, dark, 0, 0.25, -2.35),         // splitter
      box(g, 0.25, 0.02, 4.82, gold, 0, 0.78, 0),           // stripe
    ];
    const wheels = [[-0.9, -1.55], [0.9, -1.55], [-0.9, 1.55], [0.9, 1.55]].map(([x, z]) => ({ x, z, r: 0.38, w: 0.38 }));
    return { parts, wheels, lamp: [0, 0.6, -2.42], tail: [0, 0.7, 2.42], width: 1.7 };
  },

  gt(g) {
    const orange = '#ff9a3c', dark = '#1c1c1c';
    const parts = [
      box(g, 1.95, 0.6, 4.4, orange, 0, 0.62, 0),           // body
      box(g, 1.5, 0.5, 1.8, dark, 0, 1.15, 0.35),           // greenhouse
      box(g, 1.9, 0.06, 0.45, dark, 0, 1.45, 2.05),         // rear wing
      box(g, 0.08, 0.5, 0.2, dark, 0.6, 1.15, 2.0),         // wing struts
      box(g, 0.08, 0.5, 0.2, dark, -0.6, 1.15, 2.0),
      box(g, 2.0, 0.1, 0.35, dark, 0, 0.35, -2.2),          // splitter
    ];
    const wheels = [[-0.92, -1.35], [0.92, -1.35], [-0.92, 1.35], [0.92, 1.35]].map(([x, z]) => ({ x, z, r: 0.4, w: 0.38 }));
    return { parts, wheels, lamp: [0, 0.75, -2.22], tail: [0, 0.8, 2.22], width: 1.6 };
  },

  trail(g) {
    const green = '#6b8f5e', cream = '#efe6cf', dark = '#2b2b2b';
    const parts = [
      box(g, 1.85, 0.8, 4.0, green, 0, 1.05, 0),            // body (tall)
      box(g, 1.75, 0.7, 2.3, cream, 0, 1.8, 0.4),           // cabin / roof
      box(g, 1.6, 0.15, 1.9, dark, 0, 2.25, 0.4),           // roof rack
      box(g, 1.9, 0.3, 0.2, dark, 0, 0.75, -2.05),          // bull bar
    ];
    const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.25, 10).rotateX(Math.PI / 2), material(dark));
    spare.position.set(0, 1.25, 2.12);
    spare.castShadow = true;
    g.add(spare);
    parts.push(spare);
    const wheels = [[-0.95, -1.3], [0.95, -1.3], [-0.95, 1.3], [0.95, 1.3]].map(([x, z]) => ({ x, z, r: 0.5, w: 0.4 }));
    return { parts, wheels, lamp: [0, 1.1, -2.02], tail: [0, 1.2, 2.02], width: 1.5 };
  },
};

export function buildCarModel(id, group) {
  return (BUILDERS[id] ?? BUILDERS.rally)(group);
}
