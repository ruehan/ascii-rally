import * as THREE from 'three';
import { SURFACE_IDS } from './surfaces.js';
import { SURFACE_EDGE_GLSL } from '../render/surfaceEdge.js';
import { createTerrainInfoMaterial } from '../render/terrainInfo.js';
import { groundLight, GROUND_LIGHT_GLSL } from '../render/groundLight.js';

// Ground colour by height (low → high) and for steep rock.
const LOW = new THREE.Color('#5f7038');   // olive valley
const MID = new THREE.Color('#857a45');   // dry grass / ochre
const HIGH = new THREE.Color('#a89a70');  // sand-stone uplands
const ROCK = new THREE.Color('#8f7f6c');  // cliffs
const SEABED = new THREE.Color('#6f8d8f');
// Biome palettes (low → high, and steep rock).
const SNOW_LOW = new THREE.Color('#dfe8f2'), SNOW_HIGH = new THREE.Color('#f6f9ff'), SNOW_ROCK = new THREE.Color('#7d8794');
const DESERT_LOW = new THREE.Color('#d9b27a'), DESERT_HIGH = new THREE.Color('#e9c98a'), DESERT_ROCK = new THREE.Color('#b07850');

// Road / pad colours, indexed by SURFACE_IDS (grass keeps the vertex colour).
const SURFACE_COLORS = [];
SURFACE_COLORS[SURFACE_IDS.grass] = '#000000';
SURFACE_COLORS[SURFACE_IDS.gravel] = '#f0d9a8';
SURFACE_COLORS[SURFACE_IDS.dirt] = '#9a7a52';
SURFACE_COLORS[SURFACE_IDS.cobble] = '#e6d6c0';
SURFACE_COLORS[SURFACE_IDS.asphalt] = '#9aa3b5';
SURFACE_COLORS[SURFACE_IDS.kerb] = '#d94a3a';
SURFACE_COLORS[SURFACE_IDS.pad] = '#ddd3bc';
SURFACE_COLORS[SURFACE_IDS.sand] = '#e3d3a4';
SURFACE_COLORS[SURFACE_IDS.snow] = '#aebdd2'; // packed, darker than the snowfield
SURFACE_COLORS[SURFACE_IDS.ice] = '#bfe3ff';
SURFACE_COLORS[SURFACE_IDS.dune] = '#e9c98a';
for (let i = 0; i < 16; i++) SURFACE_COLORS[i] ??= '#000000';

function dataTexture(data, n, filter) {
  const t = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  t.minFilter = t.magFilter = filter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

const CHUNK = 50; // cells per chunk side (100 m at 2 m cells)

/**
 * Builds the terrain from the baked heightfield as a Group of square chunks
 * (frustum-culled individually). Smooth normals (facets would turn every
 * slope into edge glyphs); triangles split exactly like terrain.heightAt so
 * physics matches the picture. Chunk borders duplicate vertices; normals and
 * colours come from the global grid, so there are no seams.
 */
export function createTerrainMesh(terrain, surfaces, biomes = null, { waterLevel = 0, time = { value: 0 } } = {}) {
  const { n, origin, cell, heights } = terrain;
  const count = n * n;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const bio = new Float32Array(count * 2); // snow, desert weights (info pass charsets)
  const tmp = new THREE.Color();
  const c = new THREE.Color();
  const at = (ix, iz) => heights[Math.min(n - 1, Math.max(0, iz)) * n + Math.min(n - 1, Math.max(0, ix))];

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const k = iz * n + ix;
      const y = heights[k];
      pos[k * 3] = origin + ix * cell;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = origin + iz * cell;
      // Central differences on the grid (same as terrain.normalAt at grid points).
      const nx = -(at(ix + 1, iz) - at(ix - 1, iz)), ny = 2 * cell, nz = -(at(ix, iz + 1) - at(ix, iz - 1));
      const l = Math.hypot(nx, ny, nz);
      nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;

      const steep = 1 - THREE.MathUtils.smoothstep(ny / l, 0.6, 0.85);
      if (y < 0.5) c.copy(SEABED);
      else if (y < 8) c.copy(LOW).lerp(MID, Math.max(0, (y - 3) / 5));
      else c.copy(MID).lerp(HIGH, Math.min(1, (y - 8) / 10));
      c.lerp(ROCK, steep); // steep → rock
      if (biomes && y >= 0.5) {
        const b = biomes.biomeAt(pos[k * 3], pos[k * 3 + 2], y);
        if (b.snow > 0) c.lerp(tmp.copy(SNOW_LOW).lerp(SNOW_HIGH, Math.min(1, y / 80)).lerp(SNOW_ROCK, steep * 0.7), b.snow);
        if (b.desert > 0) c.lerp(tmp.copy(DESERT_LOW).lerp(DESERT_HIGH, Math.min(1, (y - 3) / 8)).lerp(DESERT_ROCK, steep), b.desert);
        bio[k * 2] = b.snow; bio[k * 2 + 1] = b.desert;
      }
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
  }

  // One geometry per chunk; same diagonal split as terrain.heightAt.
  const geometries = [];
  for (let cz = 0; cz < n - 1; cz += CHUNK) {
    for (let cx = 0; cx < n - 1; cx += CHUNK) {
      const w = Math.min(CHUNK, n - 1 - cx) + 1, h = Math.min(CHUNK, n - 1 - cz) + 1;
      const p = new Float32Array(w * h * 3), q = new Float32Array(w * h * 3), r = new Float32Array(w * h * 3);
      const bb = new Float32Array(w * h * 2);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const v = (cz + j) * n + cx + i, src = v * 3, dst = (j * w + i) * 3;
          for (let e = 0; e < 3; e++) { p[dst + e] = pos[src + e]; q[dst + e] = nor[src + e]; r[dst + e] = col[src + e]; }
          bb[(j * w + i) * 2] = bio[v * 2]; bb[(j * w + i) * 2 + 1] = bio[v * 2 + 1];
        }
      }
      const index = new Uint32Array((w - 1) * (h - 1) * 6);
      let t = 0;
      for (let j = 0; j < h - 1; j++) {
        for (let i = 0; i < w - 1; i++) {
          const a = j * w + i, b = a + 1, cc = a + w, d = cc + 1;
          index[t++] = a; index[t++] = cc; index[t++] = b;
          index[t++] = b; index[t++] = cc; index[t++] = d;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(q, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(r, 3));
      geo.setAttribute('biome', new THREE.BufferAttribute(bb, 2));
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      geometries.push(geo);
    }
  }

  const idTex = dataTexture(surfaces.near, surfaces.n, THREE.NearestFilter);
  const sdfTex = dataTexture(surfaces.sdf, surfaces.n, THREE.LinearFilter);

  // Colour pass: vertex colours, roads painted from the surface map.
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const surfaceColors = SURFACE_COLORS.map(h => new THREE.Color(h));
  mat.onBeforeCompile = shader => {
    shader.uniforms.tSurfId = { value: idTex };
    shader.uniforms.tSurfSdf = { value: sdfTex };
    shader.uniforms.uWorldMin = { value: surfaces.origin };
    shader.uniforms.uWorldSize = { value: surfaces.size };
    shader.uniforms.uSurfColor = { value: surfaceColors };
    shader.uniforms.uTime = time;
    shader.uniforms.uWater = { value: waterLevel };
    Object.assign(shader.uniforms, groundLight);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 biome;\nvarying vec2 vBiome;\nvarying vec2 vWorldXZ;\nvarying vec3 vWorldN;\nvarying float vWorldY;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvBiome = biome;\nvWorldN = normalize(mat3(modelMatrix) * objectNormal);')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 wpos = modelMatrix * vec4(transformed, 1.0);\nvWorldXZ = wpos.xz;\nvWorldY = wpos.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vWorldXZ;
        varying vec3 vWorldN;
        varying float vWorldY;
        varying vec2 vBiome;
        float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x),
                     mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        uniform float uTime;
        uniform float uWater;
        ${GROUND_LIGHT_GLSL}
        uniform sampler2D tSurfId;
        uniform sampler2D tSurfSdf;
        ${SURFACE_EDGE_GLSL}
        uniform float uWorldMin;
        uniform float uWorldSize;
        uniform vec3 uSurfColor[16];`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 suv = (vWorldXZ - uWorldMin) / uWorldSize;
        float sid = floor(texture2D(tSurfId, suv).r * 255.0 + 0.5);
        // Metres inside the nearest road/pad: a smooth edge (crisp for paved
        // surfaces, ragged for loose ones) instead of the id map's 0.5 m steps.
        float sd = surfInside(sid, surfSd(tSurfSdf, suv), vWorldXZ);
        float wild = clamp(1.0 - vBiome.x - vBiome.y, 0.0, 1.0);
        if (vWorldY > uWater + 0.6) {
          // Open ground isn't one flat colour: lusher and drier patches
          // (meadow vs. dry grass) drift across it — a change of hue more
          // than of brightness, so the glyph texture stays calm. Snow and
          // sand only get faint wind-drift shading.
          float v = gNoise(vWorldXZ * 0.03) * 0.6 + gNoise(vWorldXZ * 0.085 + 31.0) * 0.4;
          vec3 lush = diffuseColor.rgb * vec3(0.80, 1.07, 0.74);
          vec3 dry = diffuseColor.rgb * vec3(1.13, 1.00, 0.80);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(lush, dry, smoothstep(0.32, 0.68, v)), wild);
          diffuseColor.rgb *= 1.0 + (v - 0.5) * 0.14 * (1.0 - wild);
        }
        // Cliffs and cuttings show their layers: faint strata that follow
        // height, bent a little so they don't read as ruled lines.
        {
          float steepF = 1.0 - smoothstep(0.55, 0.82, normalize(vWorldN).y);
          float strata = sin(vWorldY * 2.4 + gNoise(vWorldXZ * 0.07) * 5.0);
          diffuseColor.rgb *= 1.0 + 0.13 * strata * steepF;
        }
        if (sid > 0.5) {
          vec3 rc = uSurfColor[int(clamp(sid, 0.0, 15.0))];
          bool paved = sid == ${SURFACE_IDS.asphalt}.0 || sid == ${SURFACE_IDS.kerb}.0;
          if (sd > 0.0) {
            // Kerbs: red/white blocks along the road.
            if (sid == ${SURFACE_IDS.kerb}.0 && fract((vWorldXZ.x + vWorldXZ.y) * 0.5) < 0.5) rc = vec3(0.95);
            // Loose roads fade into the verge instead of ending on a line.
            if (surfLoose(sid)) rc = mix(diffuseColor.rgb, rc, 0.68 + 0.32 * smoothstep(0.0, 0.8, sd));
            diffuseColor.rgb = rc;
          } else if (paved) {
            // A worn gravel shoulder beside tarmac (fainter on snow and sand).
            float sh = smoothstep(-1.0, -0.15, sd) * (0.25 + 0.4 * wild);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.57, 0.47), sh);
          }
        }
        // Hillshade: relief lit from the north-west whatever the sun does, so
        // slopes read from the top-down camera (flat ground stays at 1).
        {
          const vec3 HL = vec3(-0.5, 0.7071, -0.5);
          float hs = clamp(1.0 + 1.3 * (dot(normalize(vWorldN), HL) - HL.y), 0.58, 1.4);
          diffuseColor.rgb *= hs;
        }
        // Surf: a white band just above the waterline that washes up and
        // back (two waves of different period along the shore).
        {
          // (reach stays positive: smoothstep with swapped edges is undefined)
          float reach = 0.32 + 0.16 * sin(uTime * 1.3 + vWorldXZ.x * 0.11 + vWorldXZ.y * 0.05)
                             + 0.09 * sin(uTime * 0.7 - vWorldXZ.x * 0.23);
          float above = vWorldY - uWater;
          float foam = above > -0.2 && above < 1.0 ? (1.0 - smoothstep(reach * 0.5, reach, above)) : 0.0;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 0.97), foam * 0.85);
        }`)
      // Night: warm pools under lamps and outside lit windows (baked map).
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += lampLight(vWorldXZ, diffuseColor.rgb, 1.1);`);
  };

  const infoMaterial = createTerrainInfoMaterial({ surfaceIdTex: idTex, surfaceSdfTex: sdfTex, size: surfaces.size });
  const group = new THREE.Group();
  group.name = 'terrain';
  for (const geo of geometries) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.userData.infoMaterial = infoMaterial;
    group.add(mesh);
  }
  return group;
}
