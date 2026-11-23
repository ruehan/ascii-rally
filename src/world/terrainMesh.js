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

/**
 * Builds the terrain mesh from the baked heightfield. Smooth normals (facets
 * would turn every slope into edge glyphs); triangles split exactly like
 * terrain.heightAt so physics matches the picture.
 */
export function createTerrainMesh(terrain, surfaces) {
  const { n, origin, cell, heights } = terrain;
  const count = n * n;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const nrm = { x: 0, y: 1, z: 0 };
  const c = new THREE.Color();

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const k = iz * n + ix;
      const x = origin + ix * cell, z = origin + iz * cell, y = heights[k];
      pos.set([x, y, z], k * 3);
      terrain.normalAt(x, z, nrm);
      nor.set([nrm.x, nrm.y, nrm.z], k * 3);

      if (y < 0.5) c.copy(SEABED);
      else if (y < 8) c.copy(LOW).lerp(MID, Math.max(0, (y - 3) / 5));
      else c.copy(MID).lerp(HIGH, Math.min(1, (y - 8) / 10));
      c.lerp(ROCK, 1 - THREE.MathUtils.smoothstep(nrm.y, 0.6, 0.85)); // steep → rock
      col.set([c.r, c.g, c.b], k * 3);
    }
  }

  // Same split as terrain.heightAt: diagonal (ix+1,iz)–(ix,iz+1).
  const index = new Uint32Array((n - 1) * (n - 1) * 6);
  let i = 0;
  for (let iz = 0; iz < n - 1; iz++) {
    for (let ix = 0; ix < n - 1; ix++) {
      const a = iz * n + ix, b = a + 1, cc = a + n, d = cc + 1;
      index.set([a, cc, b, b, cc, d], i);
      i += 6;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();

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

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.userData.infoMaterial = createTerrainInfoMaterial({
    surfaceIdTex: idTex, surfaceSdfTex: sdfTex, size: surfaces.size,
  });
  return mesh;
}
