import * as THREE from 'three';

/**
 * Tyre marks: rubber on tarmac when the car slides or brakes hard, ruts on
 * loose ground wherever it drives. A ring buffer of ground quads that only
 * DARKEN what's under them (multiply blend, colour pass only), so the
 * glyphs and the sun-shadow mask of the ground stay as they are.
 */
const HARD = new Set(['asphalt', 'cobble', 'pad', 'kerb']);
const RUT = { gravel: 0.66, dirt: 0.64, sand: 0.7, dune: 0.7, snow: 0.68, ice: 0.82, grass: 0.72 };
const WIDTH = 0.42;
const STEP = 0.7;   // metres between mark segments

export function createSkidMarks(scene, { heightAt, max = 1800 }) {
  const mat = new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, depthWrite: false, fog: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,       // dst.rgb *= src.rgb
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,  // keep the shadow mask in alpha
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, max);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.userData.noEdges = true; // colour pass only
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color());
  scene.add(mesh);

  let next = 0, used = 0;
  const last = [null, null]; // previous point per wheel while marking
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');
  const p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();

  function segment(a, b, shade) {
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const len = Math.hypot(dx, dz);
    const ya = heightAt(a[0], a[2]), yb = heightAt(b[0], b[2]);
    // Local +z runs along the segment; pitch follows the slope.
    e.set(Math.atan2(ya - yb, len), Math.atan2(dx, dz), 0);
    m.compose(p.set((a[0] + b[0]) / 2, (ya + yb) / 2 + 0.03, (a[2] + b[2]) / 2), q.setFromEuler(e), s.set(WIDTH, 1, len + 0.12));
    mesh.setMatrixAt(next, m);
    mesh.setColorAt(next, c.setRGB(shade, shade, shade));
    next = (next + 1) % max;
    used = Math.min(max, used + 1);
    mesh.count = used;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  return {
    /** wheels: rear contact points [[x,y,z],[x,y,z]]; v: vehicle; intents: pedals. */
    update(wheels, v, intents) {
      const speed = Math.abs(v.speed);
      const surface = v.surface ?? 'grass';
      const slide = Math.abs(v.slip ?? 0);
      let shade = 0;
      if (!v.airborne) {
        if (HARD.has(surface)) {
          const skid = slide > 2.4 || (intents.handbrake && speed > 3) || (intents.brake && v.speed > 13);
          if (skid) shade = 0.5 - Math.min(0.14, slide * 0.02);
        } else if (speed > 1.5) {
          shade = (RUT[surface] ?? 0.72) - Math.min(0.12, slide * 0.03);
        }
      }
      for (let i = 0; i < 2; i++) {
        const w = wheels[i];
        if (!shade) { last[i] = null; continue; }
        if (!last[i]) { last[i] = [w[0], w[1], w[2]]; continue; }
        const d = Math.hypot(w[0] - last[i][0], w[2] - last[i][2]);
        if (d > 6) { last[i] = [w[0], w[1], w[2]]; continue; } // teleported
        if (d < STEP) continue;
        segment(last[i], w, shade);
        last[i][0] = w[0]; last[i][1] = w[1]; last[i][2] = w[2];
      }
    },
    clear() { next = used = 0; mesh.count = 0; last[0] = last[1] = null; },
  };
}
