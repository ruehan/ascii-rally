/**
 * The "code page" render style draws the world with this project's own
 * source. Loaded lazily (only when the style is picked) so the normal
 * bundle doesn't carry it.
 */
const WIDTH = 256; // texture row width (≥ any screen's column count)
const ORDER = ['main.js', 'render/', 'world/', 'physics/', 'vehicle/', 'game/', 'fx/', 'ui/', 'core/', 'content/'];

let cache = null;
export function loadCodeLines() {
  if (cache) return cache;
  const files = import.meta.glob('../**/*.js', { query: '?raw', import: 'default' });
  const rank = p => { const i = ORDER.findIndex(o => p.includes(`/${o}`) || p.endsWith(o)); return i < 0 ? ORDER.length : i; };
  const paths = Object.keys(files).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  cache = Promise.all(paths.map(p => files[p]())).then(texts => {
    const src = [];
    texts.forEach((text, i) => {
      src.push(`// --- src/${paths[i].replace(/^\.\.\//, '')} ---`);
      for (const l of text.split('\n')) {
        const t = l.replace(/\t/g, '  ').trim();
        if (t) src.push(t);
      }
    });
    // Reflow into full-width rows (source lines joined by two spaces) so the
    // page has no ragged right edge: every cell carries a character.
    const rows = [];
    let row = '';
    for (const l of src) {
      row = row ? `${row}  ${l}` : l;
      while (row.length >= WIDTH) { rows.push(row.slice(0, WIDTH)); row = row.slice(WIDTH); }
    }
    if (row) rows.push(row.padEnd(WIDTH));
    return rows;
  });
  return cache;
}
