import * as THREE from 'three';
import { SURFACE_IDS } from './surfaces.js';
import { createTerrainInfoMaterial } from '../render/terrainInfo.js';

// Ground colour by height (low → high) and for steep rock.
const LOW = new THREE.Color('#5f7038');   // olive valley
const MID = new THREE.Color('#857a45');   // dry grass / ochre
const HIGH = new THREE.Color('#a89a70');  // sand-stone uplands
const ROCK = new THREE.Color('#8f7f6c');  // cliffs
const SEABED = new THREE.Color('#6f8d8f');

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
export function createTerrainMesh(terrain, surfaces) {
  const { n, origin, cell, heights } = terrain;
  const count = n * n;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
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

      if (y < 0.5) c.copy(SEABED);
      else if (y < 8) c.copy(LOW).lerp(MID, Math.max(0, (y - 3) / 5));
      else c.copy(MID).lerp(HIGH, Math.min(1, (y - 8) / 10));
      c.lerp(ROCK, 1 - THREE.MathUtils.smoothstep(ny / l, 0.6, 0.85)); // steep → rock
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
  }

  // One geometry per chunk; same diagonal split as terrain.heightAt.
  const geometries = [];
  for (let cz = 0; cz < n - 1; cz += CHUNK) {
    for (let cx = 0; cx < n - 1; cx += CHUNK) {
      const w = Math.min(CHUNK, n - 1 - cx) + 1, h = Math.min(CHUNK, n - 1 - cz) + 1;
      const p = new Float32Array(w * h * 3), q = new Float32Array(w * h * 3), r = new Float32Array(w * h * 3);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const src = ((cz + j) * n + cx + i) * 3, dst = (j * w + i) * 3;
          for (let e = 0; e < 3; e++) { p[dst + e] = pos[src + e]; q[dst + e] = nor[src + e]; r[dst + e] = col[src + e]; }
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
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      geometries.push(geo);
    }
  }

  const idTex = dataTexture(surfaces.ids, surfaces.n, THREE.NearestFilter);
  const sdfTex = dataTexture(surfaces.sdf, surfaces.n, THREE.LinearFilter);

  // Colour pass: vertex colours, roads painted from the surface map.
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const surfaceColors = SURFACE_COLORS.map(h => new THREE.Color(h));
  mat.onBeforeCompile = shader => {
    shader.uniforms.tSurfId = { value: idTex };
    shader.uniforms.uWorldMin = { value: surfaces.origin };
    shader.uniforms.uWorldSize = { value: surfaces.size };
    shader.uniforms.uSurfColor = { value: surfaceColors };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWorldXZ;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vWorldXZ;
        uniform sampler2D tSurfId;
        uniform float uWorldMin;
        uniform float uWorldSize;
        uniform vec3 uSurfColor[8];`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float sid = floor(texture2D(tSurfId, (vWorldXZ - uWorldMin) / uWorldSize).r * 255.0 + 0.5);
        if (sid > 0.5) diffuseColor.rgb = uSurfColor[int(clamp(sid, 0.0, 7.0))];
        // Kerbs: red/white blocks along the road.
        if (abs(sid - ${SURFACE_IDS.kerb}.0) < 0.5 && fract((vWorldXZ.x + vWorldXZ.y) * 0.5) < 0.5) diffuseColor.rgb = vec3(0.95);`);
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
