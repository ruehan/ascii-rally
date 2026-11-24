import { SURFACE_IDS, SDF_RANGE } from '../world/surfaces.js';

/**
 * Where a road or pad really ends, shared by the terrain's colour and info
 * shaders so both passes agree. The surface map's ids are 0.5 m texels
 * (stair-stepped if used directly); the edge comes from the smooth signed
 * distance instead. Paved surfaces get a crisp edge, loose ones (gravel,
 * dirt, sand, snow) a ragged one that wanders into the verge.
 *
 *   surfSd(tex, uv)             metres inside the nearest surface (raw)
 *   surfInside(sid, sd, xz)     the same, with the ragged edge applied
 */
export const SURFACE_EDGE_GLSL = /* glsl */ `
  float seHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float seNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(seHash(i), seHash(i + vec2(1.0, 0.0)), f.x),
               mix(seHash(i + vec2(0.0, 1.0)), seHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  bool surfLoose(float sid) {
    return sid == ${SURFACE_IDS.gravel}.0 || sid == ${SURFACE_IDS.dirt}.0 || sid == ${SURFACE_IDS.sand}.0
        || sid == ${SURFACE_IDS.snow}.0 || sid == ${SURFACE_IDS.dune}.0;
  }
  float surfSd(sampler2D sdfTex, vec2 uv) {
    return (texture2D(sdfTex, uv).r * 2.0 - 1.0) * ${SDF_RANGE.toFixed(1)};
  }
  float surfInside(float sid, float sd, vec2 xz) {
    if (!surfLoose(sid)) return sd;
    return sd + (seNoise(xz * 0.55) * 0.65 + seNoise(xz * 1.7 + 9.0) * 0.35 - 0.5) * 0.9;
  }
`;
