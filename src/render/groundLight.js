import * as THREE from 'three';

/**
 * Night light on the ground and on props, added as emissive by the terrain
 * and by every prop material:
 *   - pools (street lamps, lit windows): one world-sized map baked by the
 *     world builder;
 *   - beams: the headlights of the nearest traffic cars, a handful of cones
 *     evaluated in the shader (far cheaper than real spotlights for each).
 */
export const MAX_BEAMS = 6;

export const groundLight = {
  tLight: { value: null },       // R8, world-aligned (x → u, z → v)
  uLights: { value: 0 },         // 0 day .. 1 night
  uLightMin: { value: -600 },    // world coordinate of texel 0
  uLightSize: { value: 1200 },
  // Per beam: xy = nose position (world x, z), zw = forward direction; strength 0 = off.
  uBeams: { value: Array.from({ length: MAX_BEAMS }, () => new THREE.Vector4(0, 0, 0, -1)) },
  uBeamK: { value: new Array(MAX_BEAMS).fill(0) },
};

export const GROUND_LIGHT_GLSL = /* glsl */ `
  uniform sampler2D tLight;
  uniform float uLights;
  uniform float uLightMin;
  uniform float uLightSize;
  uniform vec4 uBeams[${MAX_BEAMS}];
  uniform float uBeamK[${MAX_BEAMS}];
  vec3 lampLight(vec2 worldXZ, vec3 albedo, float gain) {
    vec3 sum = vec3(0.0);
    if (uLights > 0.0) {
      float pool = texture2D(tLight, (worldXZ - uLightMin) / uLightSize).r;
      sum += vec3(1.0, 0.80, 0.52) * (pool * uLights * gain);
    }
    // Headlight cones: widen and fade with distance ahead of the nose.
    for (int i = 0; i < ${MAX_BEAMS}; i++) {
      float k = uBeamK[i];
      if (k <= 0.0) continue;
      vec2 d = worldXZ - uBeams[i].xy;
      vec2 f = uBeams[i].zw;
      float along = dot(d, f);
      if (along <= 0.0 || along > 34.0) continue;
      float lat = abs(d.x * f.y - d.y * f.x) / (1.15 + along * 0.36);
      float cone = smoothstep(0.0, 1.2, along) * (1.0 - smoothstep(16.0, 34.0, along)) * (1.0 - smoothstep(0.55, 1.0, lat));
      sum += vec3(1.0, 0.93, 0.76) * (cone * k / (1.0 + along * along * 0.01));
    }
    return albedo * sum;
  }
`;
