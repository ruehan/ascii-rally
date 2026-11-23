import { shapeBounds } from './shapes.js';

/**
 * Uniform grid over the XZ plane for static shapes. A shape is stored in
 * every cell its bounds touch; queries dedupe with a per-query stamp.
 */
export class SpatialHash {
  constructor(cellSize = 8) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this._stamp = 0;
    this._result = [];
  }

  _key(ix, iz) {
    return ix * 73856093 ^ iz * 19349663;
  }

  insert(shape) {
    const [x0, z0, x1, z1] = shapeBounds(shape);
    const s = this.cellSize;
    shape._stamp = 0;
    for (let ix = Math.floor(x0 / s); ix <= Math.floor(x1 / s); ix++) {
      for (let iz = Math.floor(z0 / s); iz <= Math.floor(z1 / s); iz++) {
        const k = this._key(ix, iz);
        let list = this.cells.get(k);
        if (!list) { list = []; this.cells.set(k, list); }
        list.push(shape);
      }
    }
  }

  /** Shapes whose cells overlap the circle (x, z, r). Returned array is reused. */
  query(x, z, r) {
    const s = this.cellSize;
    const stamp = ++this._stamp;
    const out = this._result;
    out.length = 0;
    for (let ix = Math.floor((x - r) / s); ix <= Math.floor((x + r) / s); ix++) {
      for (let iz = Math.floor((z - r) / s); iz <= Math.floor((z + r) / s); iz++) {
        const list = this.cells.get(this._key(ix, iz));
        if (!list) continue;
        for (const shape of list) {
          if (shape._stamp !== stamp) { shape._stamp = stamp; out.push(shape); }
        }
      }
    }
    return out;
  }
}
