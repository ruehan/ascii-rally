import * as THREE from 'three';

/**
 * Character sets per material. Order inside a string doesn't matter —
 * glyphs are measured and sorted by ink coverage at startup.
 * Assign with `setCharset(object, CHARSET.X)`.
 */
export const CHARSET = { DEFAULT: 0, GROUND: 1, FOLIAGE: 2, ROCK: 3, PILLAR: 4, CAR: 5, GOLD: 6, WOOD: 7 };

const CHARSET_GLYPHS = [
  /* DEFAULT */ ` .'\`^",:;Il!i><~+_-?][}{1)(|tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$`,
  /* GROUND  */ ` .,'\`:;-~`,
  /* FOLIAGE */ ` .,'^*vwYV&%#@`,
  /* ROCK    */ ` .,:;ocoO0Q@`,
  /* PILLAR  */ ` .:-=≡#H▓█`,
  /* CAR     */ ` .:=+*xX#$`,
  /* GOLD    */ ` .:+*oO@$§`,
  /* WOOD    */ ` .:!|lI#`,
];

// Edge glyphs: 4 orientations (see shader) + corner.
const EDGE_GLYPHS = ['|', '\\', '-', '/', '+'];

const ATLAS_COLS = 16;
const GLYPH_PX = 48;
const FONT = `bold ${GLYPH_PX * 0.9}px ui-monospace, Menlo, monospace`;

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

/** Grid atlas of glyphs, ATLAS_COLS per row. */
function createGlyphAtlas(glyphs) {
  const rows = Math.ceil(glyphs.length / ATLAS_COLS);
  const canvas = document.createElement('canvas');
  canvas.width = GLYPH_PX * ATLAS_COLS;
  canvas.height = GLYPH_PX * rows;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  glyphs.forEach((ch, i) => {
    const x = (i % ATLAS_COLS) * GLYPH_PX + GLYPH_PX / 2;
    const y = Math.floor(i / ATLAS_COLS) * GLYPH_PX + GLYPH_PX / 2 + GLYPH_PX * 0.04;
    ctx.fillText(ch, x, y);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return { texture: tex, rows };
}

/** Tags every mesh under `object` with a charset id. */
export function setCharset(object, id) {
  object.traverse(o => { if (o.isMesh) o.userData.charset = id; });
}

// Info pass: flat view-space normal in RGB, charset id in A.
function createInfoMaterial(charsetId) {
  return new THREE.ShaderMaterial({
    uniforms: { charsetId: { value: charsetId } },
    vertexShader: /* glsl */ `
      varying vec3 vViewPos;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float charsetId;
      varying vec3 vViewPos;
      void main() {
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
  #define MAX_SETS 8

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
  uniform float edgeStart;
  uniform float colorMode;     // 1 = per-object colour, 0 = mono terminal
  uniform vec3 monoColor;
  uniform vec3 background;
  uniform float edgesOn;
  uniform float edgeThreshold;
  uniform float depthWeight;
  uniform float dither;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float fogNear;
  uniform float fogFar;

  vec2 cells;

  vec2 cellUv(vec2 cell) { return (cell + 0.5) / cells; }

  float linearDepth(vec2 uv) {
    float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
    return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 frag = gl_FragCoord.xy;
    cells = ceil(resolution / cellSize);
    vec2 cell = floor(frag / cellSize);
    vec2 uv = cellUv(cell);

    // Scene target is 2x the cell grid, so a linear sample at the cell
    // centre averages a 2x2 block — cheap anti-aliasing.
    vec3 col = texture2D(tScene, uv).rgb;
    col = pow(max(col, 0.0), vec3(1.0 / 2.2)); // render target is linear; approx sRGB
    float lum = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);

    // Pick this cell's charset and map brightness into its ramp.
    // Dither nudges cells near a step boundary to the neighbouring glyph.
    int set = int(floor(texture2D(tInfo, uv).a * 255.0 + 0.5));
    float start = rampStart[set];
    float len = rampLen[set];
    float l = clamp(lum + (hash(cell) - 0.5) * dither / len, 0.0, 0.999);
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
          vec4 s = vec4(texture2D(tInfo, suv).rgb, linearDepth(suv) / dCenter * depthWeight);
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
      }
    }

    // Look up glyph in grid atlas (canvas is flipped: row 0 at top).
    vec2 inCell = fract(frag / cellSize);
    vec2 g = vec2(mod(idx, atlasCols), floor(idx / atlasCols));
    vec2 guv = vec2((g.x + inCell.x) / atlasCols, (atlasRows - 1.0 - g.y + inCell.y) / atlasRows);
    float glyph = texture2D(tGlyphs, guv).r;

    // Glyph density carries brightness, so normalise colour to full hue.
    float peak = max(max(col.r, col.g), max(col.b, 1e-3));
    vec3 hue = col / peak;
    vec3 tint = mix(monoColor, hue, colorMode);
    tint = mix(tint, vec3(1.0), edge * 0.35); // edges a touch brighter

    gl_FragColor = vec4(mix(background, tint, glyph), 1.0);
  }
`;

/**
 * Renders a scene to low-res targets (colour+depth, normals+charset), then
 * draws it as ASCII glyphs with per-material charsets and edge characters.
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

    // Build atlas: every charset ramp back to back, then edge glyphs.
    const glyphs = [];
    const rampStart = [];
    const rampLen = [];
    for (const set of CHARSET_GLYPHS) {
      const sorted = sortByCoverage(set);
      rampStart.push(glyphs.length);
      rampLen.push(sorted.length);
      glyphs.push(...sorted);
    }
    const edgeStart = glyphs.length;
    glyphs.push(...EDGE_GLYPHS);
    const atlas = createGlyphAtlas(glyphs);

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
        edgeStart: { value: edgeStart },
        colorMode: { value: 1 },
        monoColor: { value: new THREE.Color('#5dff8a') },
        background: { value: new THREE.Color('#07090c') },
        edgesOn: { value: 1 },
        edgeThreshold: { value: 0.9 },
        depthWeight: { value: 1.5 },
        dither: { value: 0.6 },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 200 },
        fogNear: { value: 1e4 },
        fogFar: { value: 1e5 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this._hidden = [];
    this._swapped = [];
  }

  setSize(width, height) {
    const dpr = this.renderer.getPixelRatio();
    const bw = Math.floor(width * dpr);
    const bh = Math.floor(height * dpr);
    const cell = this.cellSize * dpr;
    this.material.uniforms.resolution.value.set(bw, bh);
    this.material.uniforms.cellSize.value = cell;
    const tw = Math.ceil(bw / cell) * 2;
    const th = Math.ceil(bh / cell) * 2;
    this.target.setSize(tw, th);
    this.infoTarget.setSize(tw, th);
  }

  setCellSize(px) {
    this.cellSize = px;
    const size = this.renderer.getSize(new THREE.Vector2());
    this.setSize(size.x, size.y);
  }

  toggleColor() {
    const u = this.material.uniforms.colorMode;
    u.value = u.value ? 0 : 1;
  }

  toggleEdges() {
    const u = this.material.uniforms.edgesOn;
    u.value = u.value ? 0 : 1;
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

    // 1) Colour + depth.
    r.setRenderTarget(this.target);
    r.render(scene, camera);

    // 2) Info pass: normals + charset id. Swap each mesh to its charset's material.
    const bg = scene.background;
    const fog = scene.fog;
    const shadowAuto = r.shadowMap.autoUpdate;
    scene.background = null;
    scene.fog = null;
    r.shadowMap.autoUpdate = false; // shadows already rendered in pass 1
    this._hidden.length = 0;
    this._swapped.length = 0;
    scene.traverse(o => {
      if (!o.visible) return;
      if (o.userData.noEdges) {
        o.visible = false;
        this._hidden.push(o);
      } else if (o.isMesh) {
        this._swapped.push(o, o.material);
        o.material = this.infoMaterials[o.userData.charset ?? 0];
      }
    });

    r.setRenderTarget(this.infoTarget);
    r.setClearColor(0x000000, 0); // alpha 0 -> DEFAULT charset for background
    r.clear();
    r.render(scene, camera);

    for (let i = 0; i < this._swapped.length; i += 2) this._swapped[i].material = this._swapped[i + 1];
    for (const o of this._hidden) o.visible = true;
    scene.background = bg;
    scene.fog = fog;
    r.shadowMap.autoUpdate = shadowAuto;

    // 3) ASCII composite to screen.
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCamera);
  }
}
