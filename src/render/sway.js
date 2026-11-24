/**
 * Wind sway for plants. Shared by the colour materials (world/materials.js)
 * and the matching info-pass materials (ascii.js) so both passes move the
 * same way. A material opts in with a pair [A, B]: a vertex at unit-geometry
 * height y moves by `clamp(A + B * y, 0, 1)` of the full sway, so a rooted
 * plant keeps its base still and a canopy on a trunk moves as a whole.
 */
export const swayUniforms = {
  uSwayTime: { value: 0 },
  uSwayAmp: { value: 0.3 }, // metres at full sway; 0 turns the wind off
};

export const SWAY_GLSL = /* glsl */ `
  uniform float uSwayTime;
  uniform float uSwayAmp;
  // World-space push for a plant rooted at "base" (xz): slow wide gusts
  // travelling downwind, with a quicker flutter that differs per plant.
  vec2 swayOffset(vec2 base, float k) {
    float gust = sin(uSwayTime * 0.55 - dot(base, vec2(0.024, 0.011)));
    float a = sin(uSwayTime * 1.6 + base.x * 0.37 + base.y * 0.29);
    float b = sin(uSwayTime * 2.7 + base.y * 0.43);
    float w = (0.6 + 0.4 * gust) * (a * 0.75 + b * 0.25) + 0.25 * gust;
    return vec2(1.0, 0.42) * (w * uSwayAmp * k);
  }
`;

/** Vertex code replacing `#include <project_vertex>` (instanced props only). */
export const swayProject = (a, b) => /* glsl */ `
  vec4 mvPosition = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
    mvPosition.xz += swayOffset(instanceMatrix[3].xz, clamp(${a.toFixed(3)} + ${b.toFixed(3)} * position.y, 0.0, 1.0));
  #endif
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
`;
