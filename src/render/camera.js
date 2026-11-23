import * as THREE from 'three';

const OFFSET = new THREE.Vector3(0, 16, 16); // fixed view direction (north-up)

/**
 * Fixed-angle follow camera for hilly terrain.
 * - follows the GROUND height under the car (smoothed), so jumps don't jolt the view
 * - looks a few metres ahead along the direction of travel
 * - lifts when terrain between camera and car would block the view
 */
export function createCameraRig(camera, terrain) {
  const target = new THREE.Vector3();
  const goal = new THREE.Vector3();
  const look = new THREE.Vector3();
  let groundY = null;
  let lift = 0;

  function update(dt, car, vehicle) {
    const p = car.position;
    const gy = terrain.heightAt(p.x, p.z);
    groundY = groundY === null ? gy : groundY + (gy - groundY) * (1 - Math.exp(-dt / 0.3));

    // Look-ahead along velocity (helps most when driving south/toward camera).
    const ahead = Math.min(6, Math.abs(vehicle.speed) * 0.5) * Math.sign(vehicle.speed);
    look.set(-Math.sin(vehicle.heading) * ahead, 0, -Math.cos(vehicle.heading) * ahead);
    target.x += (p.x + look.x - target.x) * (1 - Math.exp(-dt * 4));
    target.z += (p.z + look.z - target.z) * (1 - Math.exp(-dt * 4));
    target.y = groundY;

    // Occlusion: sample terrain along the car→camera line; lift if it pokes above.
    let need = 0;
    for (let i = 1; i <= 6; i++) {
      const t = i / 7;
      const x = p.x + OFFSET.x * t, z = p.z + OFFSET.z * t;
      const lineY = groundY + 1 + OFFSET.y * t;
      need = Math.max(need, terrain.heightAt(x, z) + 1 - lineY);
    }
    lift += (need - lift) * (1 - Math.exp(-dt * (need > lift ? 6 : 1.5)));

    goal.set(target.x + OFFSET.x, target.y + OFFSET.y + lift, target.z + OFFSET.z - lift * 0.5);
    camera.position.lerp(goal, 1 - Math.exp(-dt * 5));
    camera.lookAt(target.x, target.y + 0.5, target.z);
  }

  function snap(car) {
    target.copy(car.position);
    groundY = terrain.heightAt(car.position.x, car.position.z);
    target.y = groundY;
    camera.position.copy(target).add(OFFSET);
    camera.lookAt(target);
  }

  return { update, snap, target };
}
