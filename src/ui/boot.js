import { t, i18n } from './i18n.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Boot screen (markup in index.html, so it shows before any JS runs).
 * `ready({ ask })` swaps the progress bar for a start card on the first
 * visit (language choice + the three controls that matter, waits for
 * Enter/click — which also unlocks audio) or simply fades out otherwise.
 */
export function createBoot() {
  const el = document.getElementById('boot');
  if (!el) return { status() {}, ready: () => Promise.resolve() };
  const status = el.querySelector('.status');
  const start = el.querySelector('.start');

  function renderStart() {
    start.innerHTML = `
      <p>${esc(t('boot.title'))}</p>
      <p class="dim">${esc(t('boot.drive'))}<br>${esc(t('boot.explore'))}</p>
      <p class="lang">${esc(t('boot.lang'))}: ${['en', 'ko'].map(l =>
        `<button data-lang="${l}" class="${l === i18n.lang ? 'on' : ''}">${l === 'en' ? 'English' : '한국어'}</button>`).join(' ')}</p>
      <p class="go">${esc(t('boot.start'))}</p>`;
    start.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      i18n.set(b.dataset.lang);
      renderStart();
    }));
  }

  return {
    status(text) { if (status) status.textContent = text; },
    ready({ ask }) {
      el.classList.add('ready');
      const hide = () => { el.classList.add('out'); setTimeout(() => el.remove(), 700); };
      if (!ask) { hide(); return Promise.resolve(); }
      renderStart();
      el.classList.add('ask');
      return new Promise(resolve => {
        const go = () => {
          window.removeEventListener('keydown', onKey, true);
          el.removeEventListener('click', go);
          hide();
          resolve();
        };
        const onKey = e => {
          if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); go(); }
          else if (e.code === 'KeyL') { e.stopImmediatePropagation(); i18n.toggle(); renderStart(); }
          else e.stopImmediatePropagation(); // nothing else reaches the game yet
        };
        window.addEventListener('keydown', onKey, true);
        el.addEventListener('click', go);
      });
    },
  };
}
