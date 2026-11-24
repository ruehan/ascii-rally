import * as THREE from 'three';
import { applyCutaway } from '../render/cutaway.js';
import { swayUniforms, SWAY_GLSL, swayProject } from '../render/sway.js';
import { groundLight, GROUND_LIGHT_GLSL } from '../render/groundLight.js';

// Shared material palette: one material per (colour, options) combination,
// so meshes with the same look share a material and can be instanced.
//   cutaway  lets the object turn see-through where it hides the car
//   sway     [A, B]: the plant moves with the wind (see render/sway.js)
// Every material also catches the night light pools (render/groundLight.js).
const cache = new Map();

export function material(color, { flatShading = true, cutaway = false, sway = null } = {}) {
  const key = `${new THREE.Color(color).getHexString()}|${flatShading}|${cutaway}|${sway ? sway.join(',') : ''}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading });
    if (cutaway) applyCutaway(m);
    if (sway) m.userData.sway = sway;
    const base = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      base?.call(m, shader, renderer);
      Object.assign(shader.uniforms, groundLight);
      // World xz of the vertex, for the light-pool lookup.
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vLampXZ;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vLampXZ = (modelMatrix * (instanceMatrix * vec4(transformed, 1.0))).xz;
          #else
            vLampXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
          #endif`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec2 vLampXZ;\n${GROUND_LIGHT_GLSL}`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += lampLight(vLampXZ, diffuseColor.rgb, 0.8);');
      if (sway) {
        Object.assign(shader.uniforms, swayUniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${SWAY_GLSL}`)
          .replace('#include <project_vertex>', swayProject(sway[0], sway[1]));
      }
    };
    m.customProgramCacheKey = () => `prop|${cutaway}|${sway ? sway.join(',') : ''}`;
    cache.set(key, m);
  }
  return m;
}
