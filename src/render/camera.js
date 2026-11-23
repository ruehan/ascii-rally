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

export function createCameraRig(camera, terrain) {
  const target = new THREE.Vector3();
  const goal = new THREE.Vector3();
  let mode = 'chase';
  let yaw = 0;            // camera yaw, car-heading convention (0 = looking north)
  let groundY = null;
  let lift = 0;
  let shake = 0;           // metres, decays
  let zoom = 1;

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

    // Pull back a little at speed so there's more road ahead.
    zoom += (1 + Math.min(0.35, Math.abs(vehicle.speed) / 150) - zoom) * (1 - Math.exp(-dt * 1.5));
    goal.set(target.x + bx * zoom * (1 - lift * 0.03), target.y + m.height * zoom + lift, target.z + bz * zoom * (1 - lift * 0.03));
    camera.position.lerp(goal, 1 - Math.exp(-dt * 5));
    camera.lookAt(target.x, target.y + 0.8, target.z);
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
    camera.position.set(target.x + Math.sin(yaw) * m.dist, target.y + m.height, target.z + Math.cos(yaw) * m.dist);
    camera.lookAt(target);
  }

  return {
    update,
    snap,
    target,
    /** Kick the camera (landings, crashes). */
    shake(amount) { shake = Math.min(1.2, shake + amount); },
    toggleMode() { mode = mode === 'chase' ? 'top' : 'chase'; return mode; },
    get mode() { return mode; },
    /** Direction the camera looks (car-heading convention), for the UI. */
    get yaw() { return yaw; },
  };
}
