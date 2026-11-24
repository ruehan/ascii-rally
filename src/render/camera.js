import * as THREE from 'three';

/**
 * Follow camera for hilly terrain, two modes (toggle with `toggleMode()`):
 *
 *   chase — behind the car, turning with it, so "ahead" is always up on screen
 *   top   — fixed north-up view from above (the original map-like view)
 *
 * Both follow the GROUND height under the car (smoothed) so jumps don't jolt
 * the view, look a little ahead, and lift when terrain would block the car.
 */
const MODES = {
  // Same height/distance/angle as the top view — only the yaw follows the car.
  chase: { dist: 16, height: 16, ahead: 6, yawRate: 3.5 },
  top: { dist: 16, height: 16, ahead: 6, yawRate: 0 },
};

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = t => t * t * (3 - 2 * t);

// Overview: a slow high orbit around a region (career pads, F key).
const OV_IN = 1.6, OV_OUT = 1.1;   // seconds to fly up / back down
const OV_SWAY = 0.3, OV_RATE = 0.12; // gentle back-and-forth around the view angle

export function createCameraRig(camera, terrain) {
  const target = new THREE.Vector3();
  const goal = new THREE.Vector3();
  let mode = 'chase';
  let yaw = 0;            // camera yaw, car-heading convention (0 = looking north)
  let groundY = null;
  let lift = 0;
  let shake = 0;           // metres, decays
  // Chase pose (smoothed) kept apart so the overview can blend over it.
  const chasePos = new THREE.Vector3();
  const chaseLook = new THREE.Vector3();
  let ov = null;           // { center:[x,z], r, y, angle }
  let ovK = 0;             // 0 = chase, 1 = overview
  let ovWant = 0;
  const ovPos = new THREE.Vector3();
  const ovLook = new THREE.Vector3();
  const focus = new THREE.Vector3(); // what the view is about (shadows follow it)

  function update(dt, car, vehicle) {
    const m = MODES[mode];
    const p = car.position;
    const gy = terrain.heightAt(p.x, p.z);
    groundY = groundY === null ? gy : groundY + (gy - groundY) * (1 - Math.exp(-dt / 0.3));

    // Yaw: chase swings round behind the car with a little lag; top stays north.
    const want = mode === 'chase' ? vehicle.heading : 0;
    yaw += wrap(want - yaw) * (mode === 'chase' ? 1 - Math.exp(-dt * m.yawRate) : 1);

    // Look-ahead along the car's direction of travel.
    const ahead = Math.min(m.ahead, Math.abs(vehicle.speed) * 0.5) * Math.sign(vehicle.speed || 1);
    const ax = p.x - Math.sin(vehicle.heading) * ahead;
    const az = p.z - Math.cos(vehicle.heading) * ahead;
    const k = 1 - Math.exp(-dt * 4);
    target.x += (ax - target.x) * k;
    target.z += (az - target.z) * k;
    target.y = groundY;

    // Camera sits behind the view direction.
    const bx = Math.sin(yaw) * m.dist, bz = Math.cos(yaw) * m.dist;

    // Occlusion: sample terrain along the car→camera line; lift if it pokes above.
    let need = 0;
    for (let i = 1; i <= 6; i++) {
      const t = i / 7;
      const lineY = groundY + 1 + m.height * t;
      need = Math.max(need, terrain.heightAt(p.x + bx * t, p.z + bz * t) + 1 - lineY);
    }
    lift += (need - lift) * (1 - Math.exp(-dt * (need > lift ? 6 : 1.5)));

    goal.set(target.x + bx * (1 - lift * 0.03), target.y + m.height + lift, target.z + bz * (1 - lift * 0.03));
    chasePos.lerp(goal, 1 - Math.exp(-dt * 5));
    chaseLook.set(target.x, target.y + 0.8, target.z);

    // Overview blend: fly up to a slow orbit, or back down to the car.
    ovK = ovWant ? Math.min(1, ovK + dt / OV_IN) : Math.max(0, ovK - dt / OV_OUT);
    if (ov && ovK > 0) {
      ov.t += dt;
      const a = ov.angle + Math.sin(ov.t * OV_RATE) * OV_SWAY;
      const d = ov.r * 1.35, h = ov.r * 1.9; // ~2.3r away: the whole region fits the 45° view
      ovPos.set(ov.center[0] + Math.sin(a) * d, ov.y + h, ov.center[1] + Math.cos(a) * d);
      ovLook.set(ov.center[0], ov.y, ov.center[1]);
      const k = smooth(ovK);
      camera.position.lerpVectors(chasePos, ovPos, k);
      // Arc up rather than cut through hills on the way.
      camera.position.y += Math.sin(Math.PI * k) * ov.r * 0.25;
      focus.lerpVectors(chaseLook, ovLook, k);
      camera.lookAt(focus);
    } else {
      if (!ovWant) ov = null;
      camera.position.copy(chasePos);
      camera.lookAt(chaseLook);
      focus.copy(chaseLook);
    }
    if (shake > 0.01) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake *= Math.exp(-dt * 9);
    }
  }

  function snap(car, vehicle) {
    const m = MODES[mode];
    yaw = mode === 'chase' ? vehicle.heading : 0;
    target.copy(car.position);
    groundY = terrain.heightAt(car.position.x, car.position.z);
    target.y = groundY;
    chasePos.set(target.x + Math.sin(yaw) * m.dist, target.y + m.height, target.z + Math.cos(yaw) * m.dist);
    chaseLook.set(target.x, target.y + 0.8, target.z);
    camera.position.copy(chasePos);
    camera.lookAt(target);
    focus.copy(chaseLook);
    ov = null; ovK = 0; ovWant = 0;
  }

  /**
   * Overview of a region: `{ center:[x,z], r, angle? }` (angle: side the
   * camera looks from, 0 = from the south; default where it already is),
   * null flies back to the car.
   */
  function overview(view) {
    if (!view) { ovWant = 0; return; }
    const [cx, cz] = view.center;
    const from = Math.atan2(camera.position.x - cx, camera.position.z - cz);
    if (ov && ovK > 0 && ov.center === view.center) { ovWant = 1; return; }
    ov = { center: view.center, r: view.r, y: terrain.heightAt(cx, cz), angle: view.angle ?? from, t: 0 };
    ovWant = 1;
  }

  return {
    update,
    snap,
    target,
    focus,
    overview,
    /** 0..1 how far into the overview the camera is. */
    get overviewK() { return smooth(ovK); },
    /** Size of the region being shown (m), for fog / shadow range. */
    get overviewR() { return ov ? ov.r : 0; },
    get inOverview() { return ovWant === 1; },
    /** Kick the camera (landings, crashes). */
    shake(amount) { shake = Math.min(1.2, shake + amount); },
    toggleMode() { mode = mode === 'chase' ? 'top' : 'chase'; return mode; },
    setMode(m) { if (m === 'chase' || m === 'top') mode = m; },
    get mode() { return mode; },
    /** Direction the camera looks (car-heading convention), for the UI. */
    get yaw() { return yaw; },
  };
}
