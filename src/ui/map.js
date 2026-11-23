import { MAP_CLASSES } from './mapGrid.js';
import { t, i18n } from './i18n.js';

const COLORS = {
  sea: '#3f86ad', low: '#5f7038', mid: '#857a45', high: '#a89a70', cliff: '#8f7f6c',
  gravel: '#e8d3a2', cobble: '#d9c9b0', asphalt: '#aab3c2', dirt: '#b08a5c', pad: '#ddd3bc',
  tree: '#3f9f55', building: '#e0a070', kerb: '#ff6b6b', sand: '#efe0b4',
  snowfield: '#e6eefa', desert: '#d6b07a', dune: '#e8c587', snowroad: '#b8c4d6', ice: '#9fd8ff',
};
const CLASS_COLORS = MAP_CLASSES.map(c => COLORS[c.id]);
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const label = d => (typeof d.label === 'function' ? d.label() : d.label);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Car heading (0 = north, + = left) → north-up arrow glyph. */
const arrowFor = heading => ARROWS[Math.round(((-heading * 180 / Math.PI) % 360 + 360) % 360 / 45) % 8];

/**
 * Minimap (always on, north-up) + full map overlay with fast travel.
 *
 * destinations: [{ key, label, x, z, heading, color }]
 * onTravel(dest), onOpenChange(open)
 */
export function createMapUI({ fine, coarse, destinations, onTravel, onOpenChange }) {
  // --- Minimap --------------------------------------------------------------------------
  const COLS = 31, ROWS = 17, FONT = 11;
  const mini = document.createElement('canvas');
  mini.className = 'ui-mini';
  const ctx = mini.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.font = `${FONT}px ui-monospace, Menlo, monospace`;
  const cw = Math.ceil(ctx.measureText('M').width);
  const ch = FONT;
  mini.width = COLS * cw * dpr;
  mini.height = ROWS * ch * dpr;
  mini.style.width = `${COLS * cw}px`;
  mini.style.height = `${ROWS * ch}px`;
  document.body.appendChild(mini);
  let miniTimer = 0;

  function drawMini(v) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(10, 13, 14, 0.85)';
    ctx.fillRect(0, 0, COLS * cw, ROWS * ch);
    ctx.font = `${FONT}px ui-monospace, Menlo, monospace`;
    ctx.textBaseline = 'top';
    const [cc, cr] = fine.toCell(v.x, v.z);
    const c0 = Math.round(cc) - (COLS >> 1), r0 = Math.round(cr) - (ROWS >> 1);
    // Ground is a dim colour field; roads are solid bright cells; trees and
    // buildings keep their glyphs. Reads at a glance, still a character grid.
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const k = fine.classAt(c0 + c, r0 + r);
        if (k < 0) continue;
        if (fine.isGround(k)) {
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = CLASS_COLORS[k];
          ctx.fillRect(c * cw, r * ch, cw, ch);
          ctx.globalAlpha = 1;
        } else if (MAP_CLASSES[k].id === 'tree' || MAP_CLASSES[k].id === 'building') {
          ctx.fillStyle = CLASS_COLORS[k];
          ctx.fillText(MAP_CLASSES[k].ch, c * cw, r * ch);
        } else {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = CLASS_COLORS[k];
          ctx.fillRect(c * cw, r * ch + 1, cw, ch - 2);
          ctx.globalAlpha = 1;
        }
      }
    }
    // Destination markers in view.
    ctx.fillStyle = '#ffd166';
    for (const d of destinations) {
      const [dc, dr] = fine.toCell(d.x, d.z);
      const c = Math.round(dc) - c0, r = Math.round(dr) - r0;
      if (c >= 0 && r >= 0 && c < COLS && r < ROWS) {
        ctx.fillStyle = '#0a0d0e';
        ctx.fillRect(c * cw, r * ch, cw, ch);
        ctx.fillStyle = '#ffd166';
        ctx.fillText(d.key ?? '*', c * cw, r * ch);
      }
    }
    // Car.
    const c = COLS >> 1, r = ROWS >> 1;
    ctx.fillStyle = '#0a0d0e';
    ctx.fillRect(c * cw - 1, r * ch, cw + 2, ch);
    ctx.fillStyle = '#5dff8a';
    ctx.fillText(arrowFor(v.heading), c * cw, r * ch);
    ctx.fillStyle = '#7d8a94';
    ctx.fillText('N', (COLS - 1) * cw, 0);
  }

  // --- Full map -----------------------------------------------------------------------------
  const overlay = document.createElement('div');
  overlay.className = 'ui-map';
  overlay.hidden = true;
  const frame = document.createElement('div');
  frame.className = 'frame';
  const pre = document.createElement('pre');
  // Group runs of the same class into one span.
  let html = '';
  for (let r = 0; r < coarse.rows; r++) {
    let run = -1, buf = '';
    for (let c = 0; c < coarse.cols; c++) {
      const k = coarse.classAt(c, r);
      if (k !== run) {
        if (buf) html += `<span style="color:${CLASS_COLORS[run]}">${esc(buf)}</span>`;
        run = k; buf = '';
      }
      buf += MAP_CLASSES[k].ch;
    }
    html += `<span style="color:${CLASS_COLORS[run]}">${esc(buf)}</span>\n`;
  }
  pre.innerHTML = html;
  frame.appendChild(pre);

  const markers = destinations.map(d => {
    const b = document.createElement('button');
    b.className = 'marker';
    b.addEventListener('click', () => travel(d));
    frame.appendChild(b);
    return { d, b };
  });
  const carMark = document.createElement('div');
  carMark.className = 'car';
  frame.appendChild(carMark);

  const side = document.createElement('div');
  side.className = 'side';
  const group = g => destinations.filter(d => (d.group ?? 'places') === g);
  const list = ds => ds.map(d =>
    `<button data-i="${destinations.indexOf(d)}"><b>${esc(d.key ?? '·')}</b> ${esc(label(d))}</button>`).join('');
  function renderText() {
    for (const { d, b } of markers) b.innerHTML = `<b>${esc(d.key ?? '·')}</b> ${esc(label(d))}`;
    side.innerHTML = `<h2>${t('map.title')}</h2><h3>${t('map.places')}</h3>${list(group('places'))}<h3>${t('map.stages')}</h3>${list(group('stages'))}
      <p class="foot">${t('map.foot')}</p>`;
    side.querySelectorAll('button').forEach(b => b.addEventListener('click', () => travel(destinations[+b.dataset.i])));
  }
  renderText();
  i18n.onChange(() => { renderText(); if (!overlay.hidden) metrics = layout(); });

  // While the map is open, destination keys travel (and don't reach the
  // game's own key bindings, e.g. Q = change car).
  window.addEventListener('keydown', e => {
    if (overlay.hidden || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const d = destinations.find(x => x.key && x.key === e.key.toLowerCase());
    if (!d) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    travel(d);
  }, true);

  overlay.append(frame, side);
  document.body.appendChild(overlay);

  function layout() {
    // Fit the map: glyph width ≈ 0.6 em, line height = 1 em.
    const w = window.innerWidth * (window.innerWidth > 900 ? 0.66 : 0.94);
    const h = window.innerHeight * 0.86;
    const fs = Math.max(5, Math.min(w / (coarse.cols * 0.6), h / coarse.rows));
    pre.style.fontSize = `${fs}px`;
    const charW = pre.getBoundingClientRect().width / coarse.cols;
    // Place labels, nudging any that would overlap an earlier one up/down.
    const placed = [];
    for (const { d, b } of markers) {
      const [c, r] = coarse.toCell(d.x, d.z);
      const left = c > coarse.cols * 0.75; // near the right edge: hang to the left
      b.style.transform = left ? 'translate(calc(-100% + 6px), -50%)' : 'translate(-6px, -50%)';
      const w = b.offsetWidth, hgt = b.offsetHeight + 2;
      const x0 = c * charW + (left ? -w + 6 : -6);
      let y = r * fs;
      for (let i = 0; i < 12; i++) {
        const hit = placed.find(p => x0 < p.x1 && x0 + w > p.x0 && Math.abs(y - p.y) < hgt);
        if (!hit) break;
        y = hit.y + (i % 2 ? -hgt : hgt) * (y >= hit.y ? 1 : -1);
      }
      placed.push({ x0, x1: x0 + w, y });
      b.style.left = `${c * charW}px`;
      b.style.top = `${y}px`;
      b.classList.toggle('nudged', Math.abs(y - r * fs) > 1);
    }
    return { fs, charW };
  }
  let metrics = null;

  function open() {
    overlay.hidden = false;
    metrics = layout();
    onOpenChange(true);
  }
  function close() {
    if (overlay.hidden) return false;
    overlay.hidden = true;
    onOpenChange(false);
    return true;
  }
  function travel(d) {
    close();
    onTravel(d);
  }
  window.addEventListener('resize', () => { if (!overlay.hidden) metrics = layout(); });

  return {
    get isOpen() { return !overlay.hidden; },
    toggle() { return overlay.hidden ? (open(), true) : (close(), false); },
    close,
    update(dt, v) {
      miniTimer -= dt;
      if (miniTimer <= 0) { drawMini(v); miniTimer = 1 / 15; }
      if (!overlay.hidden && metrics) {
        const [c, r] = coarse.toCell(v.x, v.z);
        carMark.textContent = arrowFor(v.heading);
        carMark.style.left = `${c * metrics.charW}px`;
        carMark.style.top = `${r * metrics.fs}px`;
        carMark.style.fontSize = `${Math.max(12, metrics.fs * 1.6)}px`;
      }
    },
  };
}
