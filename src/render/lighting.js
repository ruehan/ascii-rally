import * as THREE from 'three';

const SHADOW_EXTENT = 28;   // half-size of shadow frustum (m); covers the camera view
const SHADOW_MAP = 1024;
const SUN_DISTANCE = 42;
const MOON_DIR = new THREE.Vector3(-0.35, 0.85, -0.4).normalize();
const STEP = THREE.MathUtils.degToRad(0.5); // sun direction quantum (avoids shadow crawl)

/**
 * Hemisphere fill + one directional light that is the sun by day and the
 * moon by night. The shadow frustum follows a target, snapped to whole
 * shadow texels in light space so it doesn't shimmer.
 */
export function createLighting(scene) {
  const hemi = new THREE.HemisphereLight('#d6e6ff', '#5a4a36', 1.5);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff1d6', 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  Object.assign(sun.shadow.camera, {
    left: -SHADOW_EXTENT, right: SHADOW_EXTENT, top: SHADOW_EXTENT, bottom: -SHADOW_EXTENT,
    near: 1, far: 100,
  });
  scene.add(sun, sun.target);

  const toLight = new THREE.Vector3(20, 35, 10).normalize(); // direction towards the light
  const dir = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  let extent = SHADOW_EXTENT;
  let sunDist = SUN_DISTANCE;
  let texel = (SHADOW_EXTENT * 2) / SHADOW_MAP;
  const snapped = new THREE.Vector3();

  function setDirection(v) {
    // Quantise so tiny changes don't re-snap the shadow grid every frame.
    const az = Math.round(Math.atan2(v.z, v.x) / STEP) * STEP;
    const el = Math.round(Math.asin(THREE.MathUtils.clamp(v.y, -1, 1)) / STEP) * STEP;
    toLight.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    dir.copy(toLight).negate();
    right.crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    up.crossVectors(right, dir).normalize();
  }
  setDirection(toLight);

  /** Re-centres shadows on `target`. */
  function follow(target) {
    const a = Math.round(target.dot(right) / texel) * texel;
    const b = Math.round(target.dot(up) / texel) * texel;
    const c = target.dot(dir);
    snapped.copy(right).multiplyScalar(a).addScaledVector(up, b).addScaledVector(dir, c);
    sun.target.position.copy(snapped);
    sun.position.copy(snapped).addScaledVector(toLight, sunDist);
  }

  /** Applies a timeOfDay sample. */
  function setTime(look) {
    hemi.color.copy(look.sky);
    hemi.groundColor.copy(look.ground);
    hemi.intensity = look.hemiI;
    if (look.night) {
      setDirection(MOON_DIR);
      sun.color.set('#8fa6d6');
      sun.intensity = 0.35; // shadows stay enabled: toggling would recompile every shader
    } else {
      setDirection(look.sunDir);
      sun.color.copy(look.sun);
      sun.intensity = look.sunI;
    }
  }

  /**
   * Shadow map resolution; 0 turns sun shadows off (quality tiers). Turning
   * them on/off recompiles shaders once, so it's only done on tier changes.
   */
  function setShadowSize(size) {
    sun.castShadow = size > 0;
    if (!size || sun.shadow.mapSize.x === size) return;
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sun.shadow.mapSize.set(size, size);
    texel = (extent * 2) / size;
  }

  /**
   * Widens the shadow frustum (overview camera): `scale` 1 = normal. Coarser
   * texels, but a whole region keeps its shadows.
   */
  function setRange(scale) {
    const e = Math.round(SHADOW_EXTENT * scale);
    if (e === extent) return;
    extent = e;
    sunDist = SUN_DISTANCE * Math.max(1, scale * 0.8);
    Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, far: 100 + sunDist * 2.2 });
    sun.shadow.camera.updateProjectionMatrix();
    texel = (e * 2) / sun.shadow.mapSize.x;
  }

  return { sun, follow, setTime, setShadowSize, setRange };
}
