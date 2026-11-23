import './ui.css';
import { panels, projects, owner } from '../content/content.js';
import { leaderboard, formatTime } from '../game/leaderboard.js';
import { CARS, CAR_ORDER } from '../vehicle/cars.js';
import { t, L, i18n, zoneName, paceNote } from './i18n.js';

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
    if (typeof l === 'string' || (l && ('en' in l || 'ko' in l))) { flush(); html += `<p>${esc(L(l))}</p>`; }
    else if (l.h) { flush(); html += `<h3>── ${esc(L(l.h))} ──</h3>`; }
    else if (l.k) kv.push([L(l.k), L(l.v)]);
    else if (l.link) { flush(); html += `<p><a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(L(l.link))}</a></p>`; }
  }
  flush();
  return html;
}

function timesLog(stage, car, highlight) {
  const rows = leaderboard.get(stage.id, car).map(e =>
    `<span class="${e.hash === highlight ? 'me' : ''}">${e.hash}  ${formatTime(e.time)}  ${esc(owner.handle)}  ${e.date}</span>`);
  const target = stage.target?.[car];
  rows.push(target ? `<span>${t('log.target')}   ${formatTime(target)}  ${t('log.owner')}</span>` : `<span>${t('log.noTarget')}</span>`);
  return `<div class="log">${rows.join('\n')}</div>`;
}

/** Project shown for a stage; fun stages (project: null) get a stand-in. */
function projectOf(stage) {
  const p = projects[stage.project];
  if (!p) return { title: stage.title ?? stage.name, year: '', role: '', stack: '', summary: [t('fun.summary')], links: [] };
  return { ...p, title: L(p.title), role: L(p.role) };
}

/** Garage: car cards with real-world-ish specs; buttons emit car:select. */
function carCards(current) {
  return CAR_ORDER.map(id => {
    const c = CARS[id];
    const kw = c.power, hp = Math.round(kw * 1.341);
    return `<div class="car-card${id === current ? ' on' : ''}">
      <button data-car="${id}">${id === current ? '● ' : '○ '}${esc(c.name)}</button> <span class="k">${esc(L(c.klass))}</span>
      <div class="spec">${kw} kW (${hp} hp) · ${c.mass} kg · 0-100 ${c.zeroTo100}s · ${c.vmax} km/h · ${c.drive === 1 ? 'AWD' : 'RWD'} · ${t('garage.downforce')} ${c.cla ? 'ClA ' + c.cla : t('garage.none')}</div>
      <div class="spec">${t('garage.tyres')}: ${t('garage.tarmac')} ${c.tyres.asphalt} · ${t('garage.gravel')} ${c.tyres.gravel} · ${t('garage.grass')} ${c.tyres.grass} — ${esc(L(c.note))}</div>
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

  // Controls help: shown on the very first visit only (until the driver
  // has been on the move for a while); H brings it back any time.
  const SEEN = 'stage~/seen';
  const firstVisit = (() => { try { return !localStorage.getItem(SEEN); } catch { return true; } })();
  try { localStorage.setItem(SEEN, '1'); } catch { /* not persisted */ }
  let helpDrive = 0;
  help.hidden = !firstVisit;
  const renderHelp = () => { help.textContent = t('help'); };
  renderHelp();
  let openPanel = null; // re-render the open panel when the language changes
  i18n.onChange(() => {
    renderHelp();
    if (!panel.hidden && openPanel) openPanel();
    note(t('note.lang'));
  });

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
    panel.innerHTML = `<h2>${esc(L(title))}</h2>${html}<div class="foot">${t('close')}</div>`;
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
    openPanel = () => openZone(zone);
    visited.add(zone.id);
    const car = getCar();
    if (zone.content === 'hq') {
      // In stage-number order; hidden stages only once they've been driven.
      const num = st => (/\d+/.exec(st.name) ? +/\d+/.exec(st.name)[0] : 99);
      const list = stages.stages
        .filter(st => !st.hidden || leaderboard.get(st.id, car).length)
        .sort((a, b) => num(a) - num(b));
      const html = list.map(st => {
        return `<h3>── ${esc(st.name)} · ${esc(projectOf(st).title)} ──</h3>${timesLog(st, car)}`;
      }).join('');
      open(t('hq.title'), `<p>${t('hq.intro', { car: esc(CARS[car].name) })}</p>${html}`);
      return;
    }
    const data = panels[zone.content];
    if (!data) return;
    if (zone.content === 'skills') {
      // The garage also hands out cars.
      open(data.title, `<h3>── ${t('garage.cars')} ── ${t('garage.cycle')}</h3>${carCards(car)}${renderLines(data.lines)}`);
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
    openPanel = () => renderResult({ stage, time, penalty, rec });
    renderResult({ stage, time, penalty, rec });
  }
  function renderResult({ stage, time, penalty, rec }) {
    const car = getCar();
    const target = stage.target?.[car];
    const delta = target ? time - target : null;
    const p = projectOf(stage);
    const verdict = delta === null ? `<span>${esc(CARS[car].name)}</span>`
      : delta <= 0 ? `<span style="color:var(--ui-accent)">${t('result.beat', { d: delta.toFixed(1), car: esc(CARS[car].name) })}</span>`
      : `<span style="color:var(--ui-bad)">${t('result.behind', { d: delta.toFixed(1), car: esc(CARS[car].name) })}</span>`;
    const best = rec.rank === 1 ? t('result.best') : '';
    open(`${stage.name} · ${p.title}`, `
      <p class="big">${formatTime(time)}</p>
      <p>${verdict}${best}${penalty ? t('result.penalty', { p: penalty.toFixed(1) }) : ''}</p>
      ${renderLines([
        { h: t('result.project') },
        { k: t('result.k.title'), v: p.title }, { k: t('result.k.year'), v: p.year }, { k: t('result.k.role'), v: p.role }, { k: t('result.k.stack'), v: p.stack },
        ...(p.summary ?? []),
        ...(p.links ?? []),
        { h: t('result.times') },
      ])}
      ${timesLog(stage, car, rec.entry.hash)}`);
  }

  /** Transient card (doesn't block driving). */
  function showCard(title, lines, seconds = 5) {
    card.innerHTML = `<h2>${esc(L(title))}</h2>${renderLines(lines)}`;
    card.hidden = false;
    cardTimer = seconds;
  }
  card.hidden = true;

  // --- Bus ---------------------------------------------------------------------------
  bus.on('loop:start', () => { close(); note(t('loop.start')); });
  bus.on('loop:milestone', ({ milestone: m }) => {
    note(`> ${m.year} · ${L(m.title)}`);
    showCard(`${m.year} · ${L(m.title)}`, [m.text]);
  });
  bus.on('loop:finish', () => { note(t('loop.finish')); showCard(t('loop.card'), [t('loop.cardText')]); });
  bus.on('loop:pause', () => note(t('loop.pause')));
  bus.on('zone:open', ({ zone }) => openZone(zone));
  bus.on('stage:armed', ({ stage }) => { close(); noteLines = []; note(t('note.armed', { name: stage.name, title: projectOf(stage).title })); });
  bus.on('stage:count', ({ n }) => { count.textContent = n; count.classList.remove('go'); });
  bus.on('stage:go', ({ jumped }) => {
    count.textContent = 'GO'; count.classList.add('go'); countTimer = 0.8;
    if (jumped) note(t('note.jump'));
  });
  bus.on('stage:note', ({ text, dist }) => note(`> ${String(dist).padStart(3)}  ${paceNote(text)}`));
  bus.on('stage:split', ({ stage, index, time, missed }) => {
    const target = stage.target?.[getCar()];
    lastSplit = target ? time - target * (stage.splits[index] - stage.from) / stage.length : null;
    const delta = lastSplit === null ? '' : `  ${lastSplit <= 0 ? '▼' : '▲'}${lastSplit.toFixed(1)}`;
    note(t('note.split', { i: index + 1, time: formatTime(time), delta, missed }));
  });
  bus.on('car:changed', ({ id }) => note(t('note.car', { name: CARS[id].name, klass: L(CARS[id].klass) })));
  bus.on('stage:finish', e => { lastSplit = null; note(t('note.finish', { time: formatTime(e.time) })); openResult(e); });
  bus.on('stage:abort', ({ stage, reason }) => { lastSplit = null; count.textContent = ''; note(t('note.abort', { name: stage.name, reason: t(`reason.${reason}`) })); });

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
      top.innerHTML = `<span class="prompt">${esc(st.name)}</span>${sep}<span class="opt">${st.project ? '/projects/' : '/stages/'}${esc(projectOf(st).title)}</span>${sep}${formatTime(stages.time)}${delta}${sep}${kmh} km/h${sep}<span class="opt">${alt}</span><span class="right">${Math.round(stages.progress * 100)}%</span>`;
    } else if (loop && loop.state === 'running') {
      const hh = Math.floor(loop.hour), mm = Math.floor((loop.hour - hh) * 60);
      const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      top.innerHTML = `<span class="prompt">24H</span>${sep}${clock}${sep}${kmh} km/h${sep}<span class="opt">${alt}</span><span class="right">${Math.round(loop.progress * 100)}%</span>`;
    } else {
      const surf = vehicle.surface ? t(`surf.${vehicle.surface}`) : '';
      top.innerHTML = `<span class="prompt">${esc(owner.handle)}@stage:${esc(place)} $</span><span class="right opt">${esc(CARS[getCar()].name)} · ${kmh} km/h · ${alt} · ${esc(surf)}</span>`;
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
    if (stages.state === 'near') prompt.innerHTML = t('prompt.box', { name: esc(stages.active.name) });
    else if (stages.state === 'running' || stages.state === 'countdown') prompt.innerHTML = '';
    else if (zone && panel.hidden) prompt.innerHTML = t('prompt.open', { name: esc(zoneName(zone)) });
    else if (slicksOnDirt(vehicle)) prompt.innerHTML = t('prompt.slicks', { surface: esc(t(`surf.${vehicle.surface}`)) });
    else prompt.innerHTML = '';

    // First visit: the help fades once the driver has been moving ~25 s.
    if (!help.hidden && firstVisit && helpDrive < 25) {
      if (Math.abs(vehicle.speed) > 2) helpDrive += dt;
      if (helpDrive >= 25) help.hidden = true;
    }
    if (countTimer > 0) { countTimer -= dt; if (countTimer <= 0) count.textContent = ''; }
    if (cardTimer > 0) { cardTimer -= dt; if (cardTimer <= 0) card.hidden = true; }
  }

  return {
    update, note, close, openZone, visited, firstVisit,
    get panelOpen() { return !panel.hidden; },
    toggleHelp() { help.hidden = !help.hidden; helpDrive = 25; },
  };
}
