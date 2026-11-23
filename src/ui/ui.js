import './ui.css';
import { panels, projects, owner } from '../content/content.js';
import { leaderboard, formatTime } from '../game/leaderboard.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function el(cls, parent = document.body) {
  const d = document.createElement('div');
  d.className = `ui ${cls}`;
  parent.appendChild(d);
  return d;
}

/** Renders content.js panel data to HTML. */
function renderLines(lines) {
  let html = '';
  let kv = [];
  const flush = () => {
    if (!kv.length) return;
    html += `<div class="kv">${kv.map(([k, v]) => `<span class="k">${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>`;
    kv = [];
  };
  for (const l of lines) {
    if (typeof l === 'string') { flush(); html += `<p>${esc(l)}</p>`; }
    else if (l.h) { flush(); html += `<h3>── ${esc(l.h)} ──</h3>`; }
    else if (l.k) kv.push([l.k, l.v]);
    else if (l.link) { flush(); html += `<p><a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.link)}</a></p>`; }
  }
  flush();
  return html;
}

function timesLog(stage, highlight) {
  const rows = leaderboard.get(stage.id).map(e =>
    `<span class="${e.hash === highlight ? 'me' : ''}">${e.hash}  ${formatTime(e.time)}  ${esc(owner.handle)}  ${e.date}</span>`);
  rows.push(`<span>target   ${formatTime(stage.target)}  owner</span>`);
  return `<div class="log">${rows.join('\n')}</div>`;
}

const COMPASS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']; // up = ahead on screen

/**
 * DOM overlay: telemetry bar, navigation arrow, pace-note log, prompt,
 * countdown and the info panel. Listens to the bus; never touches physics.
 */
export function createUI({ bus, stages, onPanel }) {
  const top = el('ui-top');
  const navEl = el('ui-nav');
  const notes = el('ui-notes');
  const prompt = el('ui-prompt');
  const count = el('ui-count');
  const speed = el('ui-speed');
  const help = el('ui-help');
  const panel = el('ui-panel');
  panel.hidden = true;
  help.textContent = 'WASD/방향키 운전 · E 열기 · Esc 닫기 · R 출발점\nV 카메라 · C 컬러 · G 윤곽선 · +/- 글자 크기';

  let noteLines = [];
  let lastSplit = null;
  let countTimer = 0;
  const visited = new Set();

  // --- Notes ------------------------------------------------------------------------
  function note(text) {
    noteLines = [text, ...noteLines].slice(0, 3);
    notes.innerHTML = noteLines.map((t, i) => `<div class="n${i}">${esc(t)}</div>`).join('');
  }

  // --- Panel --------------------------------------------------------------------------
  function open(title, html) {
    panel.innerHTML = `<h2>${esc(title)}</h2>${html}<div class="foot">[Esc] close</div>`;
    panel.hidden = false;
    panel.scrollTop = 0;
    onPanel(true);
  }
  function close() {
    if (panel.hidden) return false;
    panel.hidden = true;
    onPanel(false);
    return true;
  }

  function openZone(zone) {
    visited.add(zone.id);
    if (zone.content === 'hq') {
      const html = stages.stages.map(st => {
        const p = projects[st.project];
        return `<h3>── ${esc(st.name)} · ${esc(p?.title ?? st.project)} ──</h3>${timesLog(st)}`;
      }).join('');
      open('$ git log --stages', `<p>Stage times on this browser. Beat the owner's targets.</p>${html}`);
      return;
    }
    const data = panels[zone.content];
    if (data) open(data.title, renderLines(data.lines));
  }

  function openResult({ stage, time, penalty }) {
    visited.add(stage.id);
    const rec = leaderboard.add(stage.id, time);
    const delta = time - stage.target;
    const p = projects[stage.project] ?? { title: stage.project, summary: [], links: [] };
    const verdict = delta <= 0 ? `<span style="color:var(--ui-accent)">▼ ${delta.toFixed(1)} — beat the owner</span>`
      : `<span style="color:var(--ui-bad)">▲ +${delta.toFixed(1)} vs owner</span>`;
    const best = rec.rank === 1 ? ' · NEW BEST' : '';
    open(`${stage.name} · ${p.title}`, `
      <p class="big">${formatTime(time)}</p>
      <p>${verdict}${best}${penalty ? ` · penalty +${penalty.toFixed(1)}` : ''}</p>
      ${renderLines([
        { h: 'PROJECT' },
        { k: 'TITLE', v: p.title }, { k: 'YEAR', v: p.year }, { k: 'ROLE', v: p.role }, { k: 'STACK', v: p.stack },
        ...(p.summary ?? []),
        ...(p.links ?? []),
        { h: 'TIMES' },
      ])}
      ${timesLog(stage, rec.entry.hash)}`);
  }

  // --- Bus ---------------------------------------------------------------------------
  bus.on('zone:open', ({ zone }) => openZone(zone));
  bus.on('stage:armed', ({ stage }) => { close(); noteLines = []; note(`> ${stage.name} armed · ${projects[stage.project]?.title ?? ''}`); });
  bus.on('stage:count', ({ n }) => { count.textContent = n; count.classList.remove('go'); });
  bus.on('stage:go', ({ jumped }) => {
    count.textContent = 'GO'; count.classList.add('go'); countTimer = 0.8;
    if (jumped) note('! jump start +5.0');
  });
  bus.on('stage:note', ({ text, dist }) => note(`> ${String(dist).padStart(3)}  ${text}`));
  bus.on('stage:split', ({ stage, index, time, missed }) => {
    const pace = stage.target * (stage.splits[index] - stage.from) / stage.length;
    lastSplit = time - pace;
    note(`> split ${index + 1}  ${formatTime(time)}  ${lastSplit <= 0 ? '▼' : '▲'}${lastSplit.toFixed(1)}${missed ? '  missed +10' : ''}`);
  });
  bus.on('stage:finish', e => { lastSplit = null; note(`> finish ${formatTime(e.time)}`); openResult(e); });
  bus.on('stage:abort', ({ stage, reason }) => { lastSplit = null; count.textContent = ''; note(`> ${stage.name} aborted · ${reason}`); });

  // --- Per-frame ------------------------------------------------------------------------
  /**
   * state: { vehicle, place, zone, nav: { name, dist, bearing } | null, viewYaw, dt }
   */
  function update({ vehicle, place, zone, nav, viewYaw, dt }) {
    const kmh = String(Math.round(Math.abs(vehicle.speed) * 3.6)).padStart(3, '0');
    const alt = `alt ${String(Math.round(vehicle.y)).padStart(2)}m`;
    const sep = '<span class="sep">│</span>';

    if (stages.state === 'running') {
      const st = stages.active;
      const delta = lastSplit === null ? '' : `${sep}<span class="${lastSplit <= 0 ? 'good' : 'bad'}">${lastSplit <= 0 ? '▼' : '▲'} ${lastSplit.toFixed(1)}</span>`;
      top.innerHTML = `<span class="prompt">${esc(st.name)}</span>${sep}<span class="opt">/projects/${esc(projects[st.project]?.title ?? '')}</span>${sep}${formatTime(stages.time)}${delta}${sep}${kmh} km/h${sep}<span class="opt">${alt}</span><span class="right">${Math.round(stages.progress * 100)}%</span>`;
    } else {
      top.innerHTML = `<span class="prompt">${esc(owner.handle)}@stage:${esc(place)} $</span><span class="right opt">${kmh} km/h · ${alt} · ${esc(vehicle.surface ?? '')}</span>`;
    }
    speed.textContent = `${kmh} km/h`;

    // Navigation: arrow toward the next target, relative to where the camera looks.
    const view = ((-viewYaw * 180 / Math.PI) % 360 + 360) % 360;
    const facing = COMPASS_8[Math.round((((-vehicle.heading * 180 / Math.PI) % 360 + 360) % 360) / 45) % 8];
    if (nav && stages.state === 'idle') {
      const rel = ((nav.bearing - view) % 360 + 360) % 360;
      const arrow = ARROWS[Math.round(rel / 45) % 8];
      navEl.innerHTML = `<span class="arrow">${arrow}</span><span class="name">${esc(nav.name)}</span><span class="dist">${Math.round(nav.dist)} m</span><span class="facing">${facing}</span>`;
    } else {
      navEl.innerHTML = `<span class="facing">${facing}</span>`;
    }

    // Prompt.
    if (stages.state === 'near') prompt.innerHTML = `<b>${esc(stages.active.name)}</b> stop in the box to start`;
    else if (stages.state === 'running' || stages.state === 'countdown') prompt.innerHTML = '';
    else if (zone && panel.hidden) prompt.innerHTML = `<b>[E]</b> open ${esc(zone.title.toLowerCase())}`;
    else prompt.innerHTML = '';

    if (countTimer > 0) { countTimer -= dt; if (countTimer <= 0) count.textContent = ''; }
  }

  return { update, note, close, openZone, visited, get panelOpen() { return !panel.hidden; } };
}
