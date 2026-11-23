import { settings } from './settings.js';
import { t, i18n } from './i18n.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Settings menu (O or Esc with nothing else open, or the ⚙ button).
 * Mouse: click an option. Keys: ↑/↓ pick a row, ←/→ change it, Enter on
 * an action row, Esc/O close. While open it keeps keys from the game.
 *
 * getQuality() → the tier auto mode is on now (shown next to "auto").
 */
export function createSettingsMenu({ onOpenChange, toggleHelp, getQuality }) {
  const ROWS = [
    { id: 'lang', options: ['en', 'ko'], get: () => i18n.lang, set: v => i18n.set(v), fmt: v => (v === 'en' ? 'English' : '한국어') },
    { id: 'sound', options: [true, false], fmt: v => t(v ? 'set.on' : 'set.off') },
    { id: 'glyph', options: [6, 8, 10, 12, 16], fmt: v => `${v}px` },
    { id: 'colour', options: [true, false], fmt: v => t(v ? 'set.on' : 'set.off') },
    { id: 'edges', options: [true, false], fmt: v => t(v ? 'set.on' : 'set.off') },
    { id: 'camera', options: ['chase', 'top'], fmt: v => t(`set.camera.${v}`) },
    { id: 'quality', options: ['auto', 'high', 'medium', 'low'], fmt: v => t(`set.quality.${v}`) + (v === 'auto' ? ` (${t(`set.quality.${getQuality()}`)})` : '') },
    { id: 'help', action: () => toggleHelp(), fmt: () => t('set.help.toggle') },
  ];
  const get = r => (r.get ? r.get() : settings.get(r.id));
  const set = (r, v) => (r.set ? r.set(v) : settings.set(r.id, v));

  const gear = document.createElement('button');
  gear.className = 'ui-gear';
  gear.textContent = '⚙';
  gear.addEventListener('click', () => toggle());
  document.body.appendChild(gear);

  const el = document.createElement('div');
  el.className = 'ui ui-settings';
  el.hidden = true;
  document.body.appendChild(el);
  let row = 0;

  function render() {
    gear.title = t('set.title');
    el.innerHTML = `<h2>${esc(t('set.title'))}</h2>` + ROWS.map((r, i) => {
      const cur = r.action ? null : get(r);
      const opts = r.action
        ? `<button data-i="${i}" data-a="1">${esc(r.fmt())}</button>`
        : r.options.map((o, j) => `<button data-i="${i}" data-j="${j}" class="${o === cur ? 'on' : ''}">${esc(r.fmt(o))}</button>`).join('');
      return `<div class="row${i === row ? ' sel' : ''}"><span class="k">${esc(t(`set.${r.id}`))}</span><span class="opts">${opts}</span></div>`;
    }).join('') + `<div class="foot">${esc(t('set.foot'))}</div>`;
    el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const r = ROWS[+b.dataset.i];
      row = +b.dataset.i;
      if (b.dataset.a) r.action(); else set(r, r.options[+b.dataset.j]);
      render();
    }));
  }

  function open() { row = 0; render(); el.hidden = false; onOpenChange(true); }
  function close() {
    if (el.hidden) return false;
    el.hidden = true;
    onOpenChange(false);
    return true;
  }
  function toggle() { if (el.hidden) open(); else close(); }

  window.addEventListener('keydown', e => {
    if (el.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    const r = ROWS[row];
    const step = d => {
      if (r.action) return;
      const i = r.options.indexOf(get(r));
      set(r, r.options[(i + d + r.options.length) % r.options.length]);
    };
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': row = (row + ROWS.length - 1) % ROWS.length; break;
      case 'ArrowDown': case 'KeyS': row = (row + 1) % ROWS.length; break;
      case 'ArrowLeft': case 'KeyA': step(-1); break;
      case 'ArrowRight': case 'KeyD': step(1); break;
      case 'Enter': case 'Space': if (r.action) r.action(); else step(1); break;
      case 'Escape': case 'KeyO': close(); break;
      default: return; // other keys (e.g. L) still reach the game
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!el.hidden) render();
  }, true);

  settings.onChange(() => { if (!el.hidden) render(); });
  i18n.onChange(() => { if (!el.hidden) render(); gear.title = t('set.title'); });
  gear.title = t('set.title');

  return { open, close, toggle, get isOpen() { return !el.hidden; }, refresh() { if (!el.hidden) render(); } };
}
