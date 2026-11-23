import * as THREE from 'three';
import { MAX_SETS, CHARSET_GLYPHS, EDGE_GLYPHS, CHARSET, SET_DENSITY, SET_FILL } from './charsets.js';
import { cutawayUniforms, CUTAWAY_GLSL } from './cutaway.js';

const ATLAS_COLS = 16;
const GLYPH_PX = 48; // resolution used only to measure ink coverage
const font = px => `bold ${Math.round(px * 0.95)}px ui-monospace, Menlo, monospace`;
const FONT = font(GLYPH_PX);

/** Sorts glyphs from least to most ink so brightness maps to density. */
function sortByCoverage(chars) {
  const c = document.createElement('canvas');
  c.width = c.height = GLYPH_PX;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const unique = [...new Set([...chars])];
  const measured = unique.map(ch => {
    ctx.clearRect(0, 0, GLYPH_PX, GLYPH_PX);
    ctx.fillStyle = '#fff';
    ctx.fillText(ch, GLYPH_PX / 2, GLYPH_PX / 2);
    const d = ctx.getImageData(0, 0, GLYPH_PX, GLYPH_PX).data;
    let ink = 0;
    for (let i = 3; i < d.length; i += 4) ink += d[i];
    return { ch, ink };
  });
  return measured.sort((a, b) => a.ink - b.ink).map(m => m.ch);
}

/**
 * Grid atlas of glyphs, ATLAS_COLS per row, rendered at exactly `px` pixels
 * per glyph (= on-screen cell size) and sampled with nearest filtering, so
 * small cells stay crisp instead of blurring thin strokes into grey.
 */
function createGlyphAtlas(glyphs, px) {
  const rows = Math.ceil(glyphs.length / ATLAS_COLS);
  const canvas = document.createElement('canvas');
  canvas.width = px * ATLAS_COLS;
  canvas.height = px * rows;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = font(px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  glyphs.forEach((ch, i) => {
    const x = (i % ATLAS_COLS) * px + px / 2;
    const y = Math.floor(i / ATLAS_COLS) * px + px / 2 + px * 0.04;
    ctx.fillText(ch, x, y);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return { texture: tex, rows };
}

// Info pass: flat view-space normal in RGB, charset id in A.
// Handles InstancedMesh (USE_INSTANCING is defined by three for those draws).
// `cut` variants discard the same fragments as cutaway colour materials.
function createInfoMaterial(charsetId, cut = false) {
  return new THREE.ShaderMaterial({
    uniforms: { charsetId: { value: charsetId }, ...(cut ? cutawayUniforms : {}) },
    defines: cut ? { CUTAWAY: '' } : {},
    vertexShader: /* glsl */ `
      varying vec3 vViewPos;
      varying vec4 vClip;
      void main() {
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        vec4 mv = modelViewMatrix * p;
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
        vClip = gl_Position;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float charsetId;
      varying vec3 vViewPos;
      varying vec4 vClip;
      #ifdef CUTAWAY
        ${CUTAWAY_GLSL}
      #endif
      void main() {
        #ifdef CUTAWAY
          if (cutaway(vClip, -vViewPos.z)) discard;
        #endif
        vec3 n = normalize(cross(dFdx(vViewPos), dFdy(vViewPos)));
        gl_FragColor = vec4(n * 0.5 + 0.5, charsetId / 255.0);
      }
    `,
  });
}

const vertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  #define PI 3.14159265
  #define MAX_SETS ${MAX_SETS}

  uniform sampler2D tScene;
  uniform sampler2D tDepth;
  uniform sampler2D tInfo;
  uniform sampler2D tGlyphs;
  uniform vec2 resolution;     // drawing-buffer pixels
  uniform float cellSize;      // drawing-buffer pixels per cell
  uniform float atlasCols;
  uniform float atlasRows;
  uniform float rampStart[MAX_SETS];
  uniform float rampLen[MAX_SETS];
  uniform float setDensity[MAX_SETS];
  uniform float setFill[MAX_SETS];
  uniform float edgeStart;
  uniform float colorMode;     // 1 = per-object colour, 0 = mono terminal
  uniform vec3 monoColor;
  uniform vec3 background;
  uniform float edgesOn;
  uniform float edgeThreshold;
  uniform float depthWeight;
  uniform float dither;
  uniform float terrainNormalWeight; // terrain normals barely count toward edges
  uniform float lineDim;             // contour / road-edge lines darker than edges
  uniform float exposure;
  uniform float lumFloor;
  uniform float pastel;              // 0 = full-saturation hue, 1 = white
  uniform float edgeGain;
  uniform float cellFill;            // faint colour wash behind each glyph
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float fogNear;
  uniform float fogFar;
  uniform vec2 cells;          // cell grid size (cols, rows)

  vec2 cellUv(vec2 cell) { return (cell + 0.5) / cells; }

  float linearDepth(vec2 uv) {
    float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
    return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Runs once per CELL (render target is cols × rows). Two variants:
  // default writes tint.rgb + glyph index; OUT_BG writes the cell background.
  void main() {
    vec2 cell = floor(gl_FragCoord.xy);
    vec2 uv = cellUv(cell);

    // Scene target is 2x the cell grid, so a linear sample at the cell
    // centre averages a 2x2 block — cheap anti-aliasing.
    vec3 col = texture2D(tScene, uv).rgb;
    col = pow(max(col, 0.0), vec3(1.0 / 2.2)); // render target is linear; approx sRGB
    float lum = clamp(dot(col, vec3(0.299, 0.587, 0.114)) * exposure + lumFloor, 0.0, 1.0);

    // Decode info alpha: <64 charset, 64..127 terrain charset, >=128 terrain line.
    float aByte = floor(texture2D(tInfo, uv).a * 255.0 + 0.5);
    bool isLine = aByte >= 128.0;
    int set = isLine ? ${CHARSET.TERRA_LOW} : int(aByte >= 64.0 ? aByte - 64.0 : aByte);
    set = clamp(set, 0, MAX_SETS - 1);

    // Pick this cell's charset and map brightness into its ramp.
    // Dither nudges cells near a step boundary to the neighbouring glyph.
    float start = rampStart[set];
    float len = rampLen[set];
    float l = clamp(lum * setDensity[set] + (hash(cell) - 0.5) * dither / len, 0.0, 0.999);
    float idx = start + min(floor(l * len), len - 1.0);

    // --- Edge detection: Sobel over neighbouring cells on depth + normals,
    // combined with a structure tensor so gradient sign doesn't matter.
    float edge = 0.0;
    if (edgesOn > 0.5) {
      float dCenter = linearDepth(uv);
      vec4 gx = vec4(0.0), gy = vec4(0.0);
      for (int i = -1; i <= 1; i++) {
        for (int j = -1; j <= 1; j++) {
          vec2 suv = cellUv(cell + vec2(float(i), float(j)));
          vec4 inf = texture2D(tInfo, suv);
          float w = inf.a * 255.0 >= 63.5 ? terrainNormalWeight : 1.0;
          vec4 s = vec4(inf.rgb * w, linearDepth(suv) / dCenter * depthWeight);
          float wx = float(i) * (j == 0 ? 2.0 : 1.0);
          float wy = float(j) * (i == 0 ? 2.0 : 1.0);
          gx += s * wx;
          gy += s * wy;
        }
      }
      float Jxx = dot(gx, gx);
      float Jyy = dot(gy, gy);
      float Jxy = dot(gx, gy);

      float strength = sqrt(Jxx + Jyy);
      float fade = 1.0 - smoothstep(fogNear, fogFar, dCenter);
      if (strength * fade > edgeThreshold) {
        // Coherence ~1 for a straight edge, ~0 where directions meet (corner).
        float coherence = sqrt((Jxx - Jyy) * (Jxx - Jyy) + 4.0 * Jxy * Jxy) / max(Jxx + Jyy, 1e-5);
        float k;
        if (coherence < 0.35) {
          k = 4.0; // '+'
        } else {
          // Dominant gradient direction, folded to [0, PI).
          float theta = 0.5 * atan(2.0 * Jxy, Jxx - Jyy);
          if (theta < 0.0) theta += PI;
          // 0: gradient along x -> '|', 1: diagonal -> '\\',
          // 2: gradient along y -> '-', 3: other diagonal -> '/'
          k = mod(floor(theta / (PI * 0.25) + 0.5), 4.0);
        }
        idx = edgeStart + k;
        edge = 1.0;
      } else if (isLine && fade > 0.0) {
        idx = edgeStart + mod(aByte - 128.0, 4.0);
        edge = -1.0; // terrain line
      }
    }

    // Glyph density carries brightness, so normalise colour to full hue.
    float peak = max(max(col.r, col.g), max(col.b, 1e-3));
    vec3 hue = col / peak;
    vec3 tint = mix(monoColor, mix(hue, vec3(1.0), pastel), colorMode);
    // The wash keeps the surface colour under contours; road edges also
    // darken the wash so the road reads as a crisp band.
    vec3 baseTint = tint;
    if (isLine && aByte >= 132.0) baseTint = mix(tint, background, lineDim);
    if (edge > 0.0) tint = mix(tint, vec3(1.0), 0.35) * edgeGain; // edges a touch brighter
    else if (edge < 0.0) tint = mix(tint, background, lineDim);

    // Lit cells get a faint wash of their colour behind the glyph; empty
    // (dark) cells stay pure background so the terminal look survives.
    #ifdef OUT_BG
      gl_FragColor = vec4(background + baseTint * cellFill * setFill[set] * clamp(lum * 1.3, 0.0, 1.0), 1.0);
    #else
      gl_FragColor = vec4(tint, idx / 255.0);
    #endif
  }
`;

// Per-pixel pass: only looks the cell up and draws its glyph.
const finalShader = /* glsl */ `
  uniform sampler2D tCell;     // rgb = glyph colour, a = glyph index / 255
  uniform sampler2D tCellBg;   // rgb = cell background
  uniform sampler2D tGlyphs;
  uniform vec2 cells;
  uniform float cellSize;
  uniform float atlasCols;
  uniform float atlasRows;
  void main() {
    vec2 frag = gl_FragCoord.xy;
    vec2 cell = floor(frag / cellSize);
    vec2 uv = (cell + 0.5) / cells;
    vec4 a = texture2D(tCell, uv);
    vec3 bg = texture2D(tCellBg, uv).rgb;
    float idx = floor(a.a * 255.0 + 0.5);
    // Look up glyph in grid atlas (canvas is flipped: row 0 at top).
    vec2 inCell = fract(frag / cellSize);
    vec2 g = vec2(mod(idx, atlasCols), floor(idx / atlasCols));
    vec2 guv = vec2((g.x + inCell.x) / atlasCols, (atlasRows - 1.0 - g.y + inCell.y) / atlasRows);
    float glyph = texture2D(tGlyphs, guv).r;
    gl_FragColor = vec4(mix(bg, a.rgb, glyph), 1.0);
  }
`;

/**
 * Renders a scene to low-res targets (colour+depth, normals+charset), then
 * draws it as ASCII glyphs with per-material charsets and edge characters.
 *
 * Info pass: meshes are swapped to a per-charset material. The mesh list is
 * cached; it rebuilds when top-level children change or `invalidate()` is
 * called (call it after adding/removing nested meshes or changing charsets).
 *
 * Objects with `userData.noEdges = true` are hidden from the info pass.
 */
export class AsciiRenderer {
  constructor(renderer, { cellSize = 10 } = {}) {
    this.renderer = renderer;
    this.cellSize = cellSize;

    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthTexture: new THREE.DepthTexture(1, 1),
    });
    this.infoTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.infoMaterials = CHARSET_GLYPHS.map((_, i) => createInfoMaterial(i));
    this.infoMaterialsCut = CHARSET_GLYPHS.map((_, i) => createInfoMaterial(i, true));

    // Build atlas: every charset ramp back to back, then edge glyphs.
    // Unused shader slots fall back to DEFAULT.
    const glyphs = [];
    const rampStart = [];
    const rampLen = [];
    for (const set of CHARSET_GLYPHS) {
      const sorted = sortByCoverage(set);
      rampStart.push(glyphs.length);
      rampLen.push(sorted.length);
      glyphs.push(...sorted);
    }
    while (rampStart.length < MAX_SETS) {
      rampStart.push(rampStart[0]);
      rampLen.push(rampLen[0]);
    }
    const edgeStart = glyphs.length;
    glyphs.push(...EDGE_GLYPHS);
    // The cell pass stores the glyph index in one 8-bit channel.
    if (glyphs.length > 255) throw new Error(`glyph atlas has ${glyphs.length} glyphs; max 255`);
    this._glyphs = glyphs;
    this._atlasPx = 0;
    const atlas = createGlyphAtlas(glyphs, GLYPH_PX);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tScene: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        tInfo: { value: this.infoTarget.texture },
        tGlyphs: { value: atlas.texture },
        resolution: { value: new THREE.Vector2() },
        cellSize: { value: cellSize },
        atlasCols: { value: ATLAS_COLS },
        atlasRows: { value: atlas.rows },
        rampStart: { value: rampStart },
        rampLen: { value: rampLen },
        setDensity: { value: SET_DENSITY },
        setFill: { value: SET_FILL },
        edgeStart: { value: edgeStart },
        colorMode: { value: 1 },
        monoColor: { value: new THREE.Color('#5dff8a') },
        background: { value: new THREE.Color('#0d1012') },
        edgesOn: { value: 0 },          // outlines off by default (G toggles)
        edgeThreshold: { value: 0.9 },
        depthWeight: { value: 1.5 },
        dither: { value: 0.3 },
        terrainNormalWeight: { value: 0.35 },
        lineDim: { value: 0.45 },
        exposure: { value: 1.25 },
        lumFloor: { value: 0.03 },
        pastel: { value: 0.3 },
        edgeGain: { value: 1 },
        cellFill: { value: 1 },        // global scale on the per-set fill
        cameraNear: { value: 0.1 },
        cameraFar: { value: 200 },
        fogNear: { value: 1e4 },
        fogFar: { value: 1e5 },
        cells: { value: new THREE.Vector2(1, 1) },
      },
      depthTest: false,
      depthWrite: false,
    });
    // Same per-cell shader, writing the cell background instead (shared uniforms).
    this.bgMaterial = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, uniforms: this.material.uniforms,
      defines: { OUT_BG: '' }, depthTest: false, depthWrite: false,
    });

    // Cell-resolution targets: the expensive work runs once per cell.
    const cellOpts = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
    this.cellTarget = new THREE.WebGLRenderTarget(1, 1, cellOpts);
    this.cellBgTarget = new THREE.WebGLRenderTarget(1, 1, cellOpts);
    const u = this.material.uniforms;
    this.finalMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: finalShader,
      uniforms: {
        tCell: { value: this.cellTarget.texture },
        tCellBg: { value: this.cellBgTarget.texture },
        tGlyphs: u.tGlyphs,       // shared uniform objects: atlas swaps propagate
        cells: u.cells,
        cellSize: u.cellSize,
        atlasCols: u.atlasCols,
        atlasRows: u.atlasRows,
      },
      depthTest: false,
      depthWrite: false,
    });

    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quadScene.add(this.quad);

    this._scene = null;
    this._meshes = [];      // meshes to swap in the info pass
    this._noEdges = [];     // objects hidden in the info pass
    this._saved = [];       // original materials during swap
    this._hidden = [];      // objects actually hidden this frame
    this._dirty = true;
    this._onChildChange = () => { this._dirty = true; };
  }

  /** Force the info-pass mesh list to rebuild next frame. */
  invalidate() {
    this._dirty = true;
  }

  setSize(width, height) {
    const dpr = this.renderer.getPixelRatio();
    const bw = Math.floor(width * dpr);
    const bh = Math.floor(height * dpr);
    const cell = this.cellSize * dpr;
    this.material.uniforms.resolution.value.set(bw, bh);
    this.material.uniforms.cellSize.value = cell;
    this._ensureAtlas(Math.max(4, Math.round(cell)));
    const tw = Math.ceil(bw / cell) * 2;
    const th = Math.ceil(bh / cell) * 2;
    this.target.setSize(tw, th);
    this.infoTarget.setSize(tw, th);
    const cols = Math.ceil(bw / cell), rows = Math.ceil(bh / cell);
    this.material.uniforms.cells.value.set(cols, rows);
    this.cellTarget.setSize(cols, rows);
    this.cellBgTarget.setSize(cols, rows);
  }

  /** Re-renders the glyph atlas when the on-screen cell size changes. */
  _ensureAtlas(px) {
    if (px === this._atlasPx) return;
    const u = this.material.uniforms;
    u.tGlyphs.value.dispose();
    const atlas = createGlyphAtlas(this._glyphs, px);
    u.tGlyphs.value = atlas.texture;
    u.atlasRows.value = atlas.rows;
    this._atlasPx = px;
  }

  setCellSize(px) {
    this.cellSize = px;
    const size = this.renderer.getSize(new THREE.Vector2());
    this.setSize(size.x, size.y);
  }

  /** Time-of-day look: exposure, floor, pastel, edge gain, background colour. */
  setLook(look) {
    const u = this.material.uniforms;
    u.exposure.value = look.exposure;
    u.lumFloor.value = look.floor;
    u.pastel.value = look.pastel;
    u.edgeGain.value = look.edgeGain;
    u.background.value.copy(look.fog).multiplyScalar(0.8);
  }

  toggleColor() {
    const u = this.material.uniforms.colorMode;
    u.value = u.value ? 0 : 1;
  }

  /** Toggles outline glyphs; returns true when they're now on. */
  toggleEdges() {
    const u = this.material.uniforms.edgesOn;
    u.value = u.value ? 0 : 1;
    return u.value === 1;
  }

  _watch(scene) {
    if (this._scene === scene) return;
    if (this._scene) {
      this._scene.removeEventListener('childadded', this._onChildChange);
      this._scene.removeEventListener('childremoved', this._onChildChange);
    }
    scene.addEventListener('childadded', this._onChildChange);
    scene.addEventListener('childremoved', this._onChildChange);
    this._scene = scene;
    this._dirty = true;
  }

  _rebuild(scene) {
    this._meshes.length = 0;
    this._noEdges.length = 0;
    const walk = o => {
      if (o.userData.noEdges) { this._noEdges.push(o); return; }
      if (o.isMesh) this._meshes.push(o);
      for (const c of o.children) walk(c);
    };
    walk(scene);
    this._dirty = false;
  }

  render(scene, camera) {
    const r = this.renderer;
    const u = this.material.uniforms;
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;
    if (scene.fog) {
      u.fogNear.value = scene.fog.near;
      u.fogFar.value = scene.fog.far;
    }

    this._watch(scene);
    if (this._dirty) this._rebuild(scene);

    // 1) Colour + depth.
    r.setRenderTarget(this.target);
    r.render(scene, camera);

    // 2) Info pass: normals + charset id.
    const bg = scene.background;
    const fog = scene.fog;
    const shadowAuto = r.shadowMap.autoUpdate;
    scene.background = null;
    scene.fog = null;
    r.shadowMap.autoUpdate = false; // shadows already rendered in pass 1

    const meshes = this._meshes;
    const saved = this._saved;
    saved.length = meshes.length;
    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i];
      saved[i] = m.material;
      const table = m.material.userData.cutaway ? this.infoMaterialsCut : this.infoMaterials;
      m.material = m.userData.infoMaterial ?? table[m.userData.charset ?? 0] ?? table[0];
    }
    this._hidden.length = 0;
    for (const o of this._noEdges) {
      if (o.visible) { o.visible = false; this._hidden.push(o); }
    }

    r.setRenderTarget(this.infoTarget);
    r.setClearColor(0x000000, 0); // alpha 0 -> DEFAULT charset for background
    r.clear();
    r.render(scene, camera);

    for (let i = 0; i < meshes.length; i++) meshes[i].material = saved[i];
    for (const o of this._hidden) o.visible = true;
    scene.background = bg;
    scene.fog = fog;
    r.shadowMap.autoUpdate = shadowAuto;

    // 3) Per-cell glyph + colours (tiny targets), then 4) per-pixel glyph draw.
    this.quad.material = this.material;
    r.setRenderTarget(this.cellTarget);
    r.render(this.quadScene, this.quadCamera);
    this.quad.material = this.bgMaterial;
    r.setRenderTarget(this.cellBgTarget);
    r.render(this.quadScene, this.quadCamera);
    this.quad.material = this.finalMaterial;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCamera);
  }
}
