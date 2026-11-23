import * as THREE from 'three';

const SHADOW_EXTENT = 28;   // half-size of shadow frustum (m); covers the fixed camera view
const SHADOW_MAP = 1024;
const SUN_OFFSET = new THREE.Vector3(20, 35, 10);

/**
 * Hemisphere fill + directional sun whose shadow frustum follows a target.
 * Returns `follow(target)` to call each frame.
 */
export function createLighting(scene) {
  scene.add(new THREE.HemisphereLight('#d6e6ff', '#5a4a36', 1.5));

  const sun = new THREE.DirectionalLight('#fff1d6', 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  Object.assign(sun.shadow.camera, {
    left: -SHADOW_EXTENT, right: SHADOW_EXTENT, top: SHADOW_EXTENT, bottom: -SHADOW_EXTENT,
    near: 1, far: 100,
  });
  scene.add(sun, sun.target);

  // Light-space basis for texel snapping (sun direction is constant).
  const dir = SUN_OFFSET.clone().normalize().negate();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  const texel = (SHADOW_EXTENT * 2) / SHADOW_MAP;
  const snapped = new THREE.Vector3();

  /** Re-centres shadows on `target`, snapped to whole shadow texels to avoid shimmer. */
  function follow(target) {
    const a = Math.round(target.dot(right) / texel) * texel;
    const b = Math.round(target.dot(up) / texel) * texel;
    const c = target.dot(dir);
    snapped.copy(right).multiplyScalar(a)
      .addScaledVector(up, b)
      .addScaledVector(dir, c);
    sun.target.position.copy(snapped);
    sun.position.copy(snapped).add(SUN_OFFSET);
  }

  return { sun, follow };
}
