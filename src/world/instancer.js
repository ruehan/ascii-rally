import * as THREE from 'three';

/**
 * Collects static props and emits one InstancedMesh per
 * (geometry, material, charset) group — one draw call per group.
 */
export class Instancer {
  constructor() {
    this.groups = new Map();
  }

  /**
   * @param {THREE.BufferGeometry} geometry shared geometry
   * @param {THREE.Material} material shared material
   * @param {number} charset charset id
   * @param {THREE.Matrix4} matrix world transform (copied)
   * @param {{castShadow?: boolean, receiveShadow?: boolean}} [opts]
   */
  add(geometry, material, charset, matrix, { castShadow = true, receiveShadow = true } = {}) {
    const key = `${geometry.uuid}|${material.uuid}|${charset}|${castShadow}|${receiveShadow}`;
    let g = this.groups.get(key);
    if (!g) {
      g = { geometry, material, charset, castShadow, receiveShadow, matrices: [] };
      this.groups.set(key, g);
    }
    g.matrices.push(matrix.clone());
  }

  /** Adds the InstancedMeshes to `parent` and returns them. */
  build(parent) {
    const meshes = [];
    for (const g of this.groups.values()) {
      const mesh = new THREE.InstancedMesh(g.geometry, g.material, g.matrices.length);
      g.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = g.castShadow;
      mesh.receiveShadow = g.receiveShadow;
      mesh.userData.charset = g.charset;
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.groups.clear();
    return meshes;
  }
}
