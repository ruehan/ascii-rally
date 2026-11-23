import * as THREE from 'three';
import { CHARSET } from './charsets.js';
import { SURFACE_IDS, SDF_RANGE } from '../world/surfaces.js';

// Charset per surface id (index = SURFACE_IDS value). Grass uses height bands.
const SURFACE_SET = [];
SURFACE_SET[SURFACE_IDS.grass] = -1;
SURFACE_SET[SURFACE_IDS.gravel] = CHARSET.GRAVEL;
SURFACE_SET[SURFACE_IDS.dirt] = CHARSET.DIRT;
SURFACE_SET[SURFACE_IDS.cobble] = CHARSET.COBBLE;
SURFACE_SET[SURFACE_IDS.asphalt] = CHARSET.ASPHALT;
SURFACE_SET[SURFACE_IDS.kerb] = CHARSET.KERB;
SURFACE_SET[SURFACE_IDS.pad] = CHARSET.FLOOR;
SURFACE_SET[SURFACE_IDS.sand] = CHARSET.SAND;
SURFACE_SET[SURFACE_IDS.snow] = CHARSET.PACKED; // road snow; off-road snow comes from the biome
SURFACE_SET[SURFACE_IDS.ice] = CHARSET.ICE;
SURFACE_SET[SURFACE_IDS.dune] = CHARSET.DUNE;
for (let i = 0; i < 16; i++) SURFACE_SET[i] ??= -1;

/**
 * Info-pass material for the terrain: per-fragment charset (height band,
 * cliff by slope, or road surface) and line encoding for contours / road
 * edges. Writes smooth normals so slopes don't turn into edge glyphs.
 */
export function createTerrainInfoMaterial({ surfaceIdTex, surfaceSdfTex, size, bands = [6, 14], contour = 3 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tSurfId: { value: surfaceIdTex },
      tSurfSdf: { value: surfaceSdfTex },
      uWorldMin: { value: -size / 2 },
      uWorldSize: { value: size },
      uBands: { value: new THREE.Vector2(...bands) },
      uContour: { value: contour },
      uSurfSet: { value: SURFACE_SET },
    },
    vertexShader: /* glsl */ `
      attribute vec2 biome;
      varying vec3 vWorld;
      varying vec3 vViewNormal;
      varying vec2 vBiome;
      void main() {
        vBiome = biome;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vViewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      #define PI 3.14159265
      uniform sampler2D tSurfId;
      uniform sampler2D tSurfSdf;
      uniform float uWorldMin;
      uniform float uWorldSize;
      uniform vec2 uBands;
      uniform float uContour;
      uniform float uSurfSet[16];
      varying vec3 vWorld;
      varying vec3 vViewNormal;
      varying vec2 vBiome;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      void main() {
        vec2 uv = (vWorld.xz - uWorldMin) / uWorldSize;
        float sid = floor(texture2D(tSurfId, uv).r * 255.0 + 0.5);
        float sdW = (texture2D(tSurfSdf, uv).r * 2.0 - 1.0) * ${SDF_RANGE.toFixed(1)}; // m, >0 inside road

        // Derivatives up front (must not sit in divergent branches).
        float hb = vWorld.y / uContour;
        vec2 gH = vec2(dFdx(hb), dFdy(hb));
        vec2 gS = vec2(dFdx(sdW), dFdy(sdW));
        float fh = length(gH);
        float fs = length(gS);

        // World-space slope for cliffs.
        vec3 wn = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float set = vWorld.y < uBands.x ? ${CHARSET.TERRA_LOW}.0
                  : vWorld.y < uBands.y ? ${CHARSET.TERRA_MID}.0 : ${CHARSET.TERRA_HIGH}.0;
        // Biomes (dithered at their borders): snow / desert glyphs off-road.
        float r = hash(floor(vWorld.xz * 2.0));
        if (vBiome.x > r) set = vWorld.y > 60.0 ? ${CHARSET.SNOW_HIGH}.0 : ${CHARSET.SNOW}.0;
        else if (vBiome.y > r) set = vWorld.y > 6.5 ? ${CHARSET.DUNE}.0 : ${CHARSET.SAND}.0;
        if (abs(wn.y) < 0.6) set = ${CHARSET.CLIFF}.0;
        float surfSet = uSurfSet[int(clamp(sid, 0.0, 15.0))];
        bool onSurf = surfSet >= 0.0;
        if (onSurf) set = surfSet;

        float a = 64.0 + set;

        // Road edge: where the signed distance crosses 0. Contour: every uContour m
        // of height, skipped where lines would pile up (steep slopes) and on roads.
        float dEdge = abs(sdW) / max(fs, 1e-4);
        float dLine = min(fract(hb), 1.0 - fract(hb)) / max(fh, 1e-4);
        vec2 g = vec2(0.0);
        bool isLine = false;
        float kind = 0.0; // 0 contour, 4 road edge
        if (fs > 1e-4 && dEdge < 1.6) { g = gS; isLine = true; kind = 4.0; }
        else if (!onSurf && fh < 0.35 && dLine < 1.1) { g = gH; isLine = true; }
        if (isLine) {
          float th = atan(g.y, g.x);
          if (th < 0.0) th += PI;
          a = 128.0 + kind + mod(floor(th / (PI * 0.25) + 0.5), 4.0);
        }
        gl_FragColor = vec4(normalize(vViewNormal) * 0.5 + 0.5, a / 255.0);
      }
    `,
  });
}
