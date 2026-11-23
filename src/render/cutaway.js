import * as THREE from 'three';

/**
 * X-ray cutaway: fragments of flagged materials that sit in front of the car
 * inside a screen-space circle around it are discarded, so trees and
 * buildings never hide the car. Shared uniforms; update once per frame.
 */
export const cutawayUniforms = {
  uCutCenter: { value: new THREE.Vector2() }, // car position in NDC
  uCutRadius: { value: 0 },                   // in NDC-y units; 0 disables
  uCutDepth: { value: 0 },                    // car view-space depth (m)
  uCutAspect: { value: 1 },
};

export const CUTAWAY_GLSL = /* glsl */ `
  uniform vec2 uCutCenter;
  uniform float uCutRadius;
  uniform float uCutDepth;
  uniform float uCutAspect;
  bool cutaway(vec4 clip, float viewDepth) {
    if (uCutRadius <= 0.0) return false;
    vec2 d = (clip.xy / clip.w - uCutCenter) * vec2(uCutAspect, 1.0);
    return length(d) < uCutRadius && viewDepth < uCutDepth - 1.2;
  }
`;

/** Patches a built-in material (e.g. MeshStandardMaterial) for cutaway. */
export function applyCutaway(material) {
  material.userData.cutaway = true;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, cutawayUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vCutClip;\nvarying float vCutDepth;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCutClip = gl_Position;\nvCutDepth = -mvPosition.z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec4 vCutClip;\nvarying float vCutDepth;\n${CUTAWAY_GLSL}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (cutaway(vCutClip, vCutDepth)) discard;');
  };
  material.customProgramCacheKey = () => 'cutaway';
  return material;
}

const _v = new THREE.Vector3();

/** Centres the cutaway on a world point (the car) for this frame. */
export function updateCutaway(camera, worldPos, radius = 0.2) {
  _v.copy(worldPos).applyMatrix4(camera.matrixWorldInverse);
  cutawayUniforms.uCutDepth.value = -_v.z;
  _v.copy(worldPos).project(camera);
  cutawayUniforms.uCutCenter.value.set(_v.x, _v.y);
  cutawayUniforms.uCutRadius.value = radius;
  cutawayUniforms.uCutAspect.value = camera.aspect;
}
