import './ui.css';
import { panels, projects, owner } from '../content/content.js';
import { leaderboard, formatTime } from '../game/leaderboard.js';
import { CARS, CAR_ORDER } from '../vehicle/cars.js';

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

function timesLog(stage, car, highlight) {
  const rows = leaderboard.get(stage.id, car).map(e =>
    `<span class="${e.hash === highlight ? 'me' : ''}">${e.hash}  ${formatTime(e.time)}  ${esc(owner.handle)}  ${e.date}</span>`);
  const target = stage.target?.[car];
  rows.push(target ? `<span>target   ${formatTime(target)}  owner</span>` : '<span>no owner target for this car</span>');
  return `<div class="log">${rows.join('\n')}</div>`;
}

/** Garage: car cards with real-world-ish specs; buttons emit car:select. */
function carCards(current) {
  return CAR_ORDER.map(id => {
    const c = CARS[id];
    const kw = c.power, hp = Math.round(kw * 1.341);
    return `<div class="car-card${id === current ? ' on' : ''}">
      <button data-car="${id}">${id === current ? '● ' : '○ '}${esc(c.name)}</button> <span class="k">${esc(c.klass)}</span>
      <div class="spec">${kw} kW (${hp} hp) · ${c.mass} kg · 0-100 ${c.zeroTo100}s · ${c.vmax} km/h · ${c.drive === 1 ? 'AWD' : 'RWD'} · downforce ${c.cla ? 'ClA ' + c.cla : 'none'}</div>
      <div class="spec">tyres: tarmac ${c.tyres.asphalt} · gravel ${c.tyres.gravel} · grass ${c.tyres.grass} — ${esc(c.note)}</div>
    </div>`;
  }).join('');
}

const COMPASS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']; // up = ahead on screen

/**
 * DOM overlay: telemetry bar, navigation arrow, pace-note log, prompt,
 * countdown and the info panel. Listens to the bus; never touches physics.
 */
export function createUI({ bus, stages, onPanel, getCar }) {
  const top = el('ui-top');
  const navEl = el('ui-nav');
  const notes = el('ui-notes');
  const prompt = el('ui-prompt');
  const count = el('ui-count');
  const speed = el('ui-speed');
  const help = el('ui-help');
  const card = el('ui-card');
  let cardTimer = 0;
  const panel = el('ui-panel');
  panel.hidden = true;
  help.textContent = 'WASD/방향키 운전 · Space 핸드브레이크 · Q 차량 · E 열기 · M 지도 · Esc 닫기 · R 출발점\nV 카메라 · T 시간대 · N 소리 · C 컬러 · G 윤곽선 · +/- 글자 크기';

  let noteLines = [];
  const slicksOnDirt = v => Math.abs(v.speed) < 8 && (CARS[getCar()].tyres[v.surface] ?? 1) < 0.55;
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
    const car = getCar();
    if (zone.content === 'hq') {
      const html = stages.stages.map(st => {
        const p = projects[st.project];
        return `<h3>── ${esc(st.name)} · ${esc(p?.title ?? st.project)} ──</h3>${timesLog(st, car)}`;
      }).join('');
      open('$ git log --stages', `<p>Stage times on this browser for <b>${esc(CARS[car].name)}</b>. Beat the owner's targets.</p>${html}`);
      return;
    }
    const data = panels[zone.content];
    if (!data) return;
    if (zone.content === 'skills') {
      // The garage also hands out cars.
      open(data.title, `<h3>── CARS ── (Q cycles anywhere)</h3>${carCards(car)}${renderLines(data.lines)}`);
      panel.querySelectorAll('[data-car]').forEach(b => b.addEventListener('click', () => {
        bus.emit('car:select', { id: b.dataset.car });
        openZone(zone);
      }));
      return;
    }
    open(data.title, renderLines(data.lines));
  }

  function openResult({ stage, time, penalty }) {
    visited.add(stage.id);
    const car = getCar();
    const rec = leaderboard.add(stage.id, car, time);
    const target = stage.target?.[car];
    const delta = target ? time - target : null;
    const p = projects[stage.project] ?? { title: stage.project, summary: [], links: [] };
    const verdict = delta === null ? `<span>${esc(CARS[car].name)}</span>`
      : delta <= 0 ? `<span style="color:var(--ui-accent)">▼ ${delta.toFixed(1)} — beat the owner (${esc(CARS[car].name)})</span>`
      : `<span style="color:var(--ui-bad)">▲ +${delta.toFixed(1)} vs owner (${esc(CARS[car].name)})</span>`;
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
      ${timesLog(stage, car, rec.entry.hash)}`);
  }

  /** Transient card (doesn't block driving). */
  function showCard(title, lines, seconds = 5) {
    card.innerHTML = `<h2>${esc(title)}</h2>${renderLines(lines)}`;
    card.hidden = false;
    cardTimer = seconds;
  }
  card.hidden = true;

  // --- Bus ---------------------------------------------------------------------------
  bus.on('loop:start', () => { close(); note('> 24H · green flag · 15:00'); });
  bus.on('loop:milestone', ({ milestone: m }) => {
    note(`> ${m.year} · ${m.title}`);
    showCard(`${m.year} · ${m.title}`, [m.text]);
  });
  bus.on('loop:finish', () => { note('> 24H · chequered flag'); showCard('24H · finished', ['Round the clock — and back to now.']); });
  bus.on('loop:pause', () => note('> 24H · session paused (off route)'));
  bus.on('zone:open', ({ zone }) => openZone(zone));
  bus.on('stage:armed', ({ stage }) => { close(); noteLines = []; note(`> ${stage.name} armed · ${projects[stage.project]?.title ?? ''}`); });
  bus.on('stage:count', ({ n }) => { count.textContent = n; count.classList.remove('go'); });
  bus.on('stage:go', ({ jumped }) => {
    count.textContent = 'GO'; count.classList.add('go'); countTimer = 0.8;
    if (jumped) note('! jump start +5.0');
  });
  bus.on('stage:note', ({ text, dist }) => note(`> ${String(dist).padStart(3)}  ${text}`));
  bus.on('stage:split', ({ stage, index, time, missed }) => {
    const target = stage.target?.[getCar()];
    lastSplit = target ? time - target * (stage.splits[index] - stage.from) / stage.length : null;
    const delta = lastSplit === null ? '' : `  ${lastSplit <= 0 ? '▼' : '▲'}${lastSplit.toFixed(1)}`;
    note(`> split ${index + 1}  ${formatTime(time)}${delta}${missed ? '  missed +10' : ''}`);
  });
  bus.on('car:changed', ({ id }) => note(`> car: ${CARS[id].name} · ${CARS[id].klass}`));
  bus.on('stage:finish', e => { lastSplit = null; note(`> finish ${formatTime(e.time)}`); openResult(e); });
  bus.on('stage:abort', ({ stage, reason }) => { lastSplit = null; count.textContent = ''; note(`> ${stage.name} aborted · ${reason}`); });

  // --- Per-frame ------------------------------------------------------------------------
  /**
   * state: { vehicle, place, zone, nav: { name, dist, bearing } | null, viewYaw, dt }
   */
  function update({ vehicle, place, zone, nav, viewYaw, loop, dt }) {
    const kmh = String(Math.round(Math.abs(vehicle.speed) * 3.6)).padStart(3, '0');
    const alt = `alt ${String(Math.round(vehicle.y)).padStart(2)}m`;
    const sep = '<span class="sep">│</span>';

    if (stages.state === 'running') {
      const st = stages.active;
      const delta = lastSplit === null ? '' : `${sep}<span class="${lastSplit <= 0 ? 'good' : 'bad'}">${lastSplit <= 0 ? '▼' : '▲'} ${lastSplit.toFixed(1)}</span>`;
      top.innerHTML = `<span class="prompt">${esc(st.name)}</span>${sep}<span class="opt">/projects/${esc(projects[st.project]?.title ?? '')}</span>${sep}${formatTime(stages.time)}${delta}${sep}${kmh} km/h${sep}<span class="opt">${alt}</span><span class="right">${Math.round(stages.progress * 100)}%</span>`;
    } else if (loop && loop.state === 'running') {
      const hh = Math.floor(loop.hour), mm = Math.floor((loop.hour - hh) * 60);
      const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      top.innerHTML = `<span class="prompt">24H</span>${sep}${clock}${sep}${kmh} km/h${sep}<span class="opt">${alt}</span><span class="right">${Math.round(loop.progress * 100)}%</span>`;
    } else {
      top.innerHTML = `<span class="prompt">${esc(owner.handle)}@stage:${esc(place)} $</span><span class="right opt">${esc(CARS[getCar()].name)} · ${kmh} km/h · ${alt} · ${esc(vehicle.surface ?? '')}</span>`;
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
    else if (slicksOnDirt(vehicle)) prompt.innerHTML = `slicks on ${esc(vehicle.surface)} — <b>[Q]</b> try RALLY or TRAIL`;
    else prompt.innerHTML = '';

    if (countTimer > 0) { countTimer -= dt; if (countTimer <= 0) count.textContent = ''; }
    if (cardTimer > 0) { cardTimer -= dt; if (cardTimer <= 0) card.hidden = true; }
  }

  return { update, note, close, openZone, visited, get panelOpen() { return !panel.hidden; } };
}
