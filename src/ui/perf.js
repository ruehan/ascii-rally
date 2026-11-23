/**
 * Performance overlay (toggle with F3, or open with ?perf in the URL).
 * Frame time p50/p95 over the last 120 frames, JS time per frame, draw
 * calls and triangles across all passes (renderer.info is accumulated per
 * frame in main.js), and JS heap where the browser exposes it.
 */
export function createPerfOverlay(renderer) {
  const el = document.createElement('div');
  el.className = 'ui ui-perf';
  el.hidden = !new URLSearchParams(location.search).has('perf');
  document.body.appendChild(el);

  const frames = new Float32Array(120);
  const js = new Float32Array(120);
  let i = 0, last = performance.now(), jsStart = 0, timer = 0;

  window.addEventListener('keydown', e => {
    if (e.code === 'F3') { el.hidden = !el.hidden; e.preventDefault(); }
  });

  const pct = (arr, p) => {
    const s = Array.from(arr).filter(Boolean).sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0;
  };

  return {
    get visible() { return !el.hidden; },
    /** Call at the start of the frame's work. */
    begin() { jsStart = performance.now(); },
    /** Call after rendering. */
    end(dt) {
      const now = performance.now();
      frames[i] = now - last;
      js[i] = now - jsStart;
      last = now;
      i = (i + 1) % frames.length;
      timer -= dt;
      if (el.hidden || timer > 0) return;
      timer = 0.25;
      const r = renderer.info.render;
      const mem = performance.memory ? ` · heap ${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB` : '';
      el.textContent =
        `frame p50 ${pct(frames, 0.5).toFixed(1)} ms · p95 ${pct(frames, 0.95).toFixed(1)} ms\n` +
        `js ${pct(js, 0.5).toFixed(1)} ms · draws ${r.calls} · tris ${(r.triangles / 1000).toFixed(0)}k${mem}\n` +
        `geo ${renderer.info.memory.geometries} · tex ${renderer.info.memory.textures} · dpr ${renderer.getPixelRatio()}`;
    },
  };
}
