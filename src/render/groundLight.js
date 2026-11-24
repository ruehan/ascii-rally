/**
 * Night light pools (street lamps, lit windows): one world-sized map baked
 * by the world builder, added as warm light by the terrain and by every
 * prop material, so ground, trees and walls near a lamp all catch it.
 */
export const groundLight = {
  tLight: { value: null },       // R8, world-aligned (x → u, z → v)
  uLights: { value: 0 },         // 0 day .. 1 night
  uLightMin: { value: -600 },    // world coordinate of texel 0
  uLightSize: { value: 1200 },
};

export const GROUND_LIGHT_GLSL = /* glsl */ `
  uniform sampler2D tLight;
  uniform float uLights;
  uniform float uLightMin;
  uniform float uLightSize;
  vec3 lampLight(vec2 worldXZ, vec3 albedo, float gain) {
    if (uLights <= 0.0) return vec3(0.0);
    float pool = texture2D(tLight, (worldXZ - uLightMin) / uLightSize).r;
    return albedo * vec3(1.0, 0.80, 0.52) * (pool * uLights * gain);
  }
`;
