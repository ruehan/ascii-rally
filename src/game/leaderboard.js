const KEY = 'stage~/times';
const KEEP = 5;

/**
 * Best stage times in this browser (per-viewer convenience; may be empty in
 * private mode — every access is guarded).
 * Entries look like git log lines: { hash, time, date }.
 */
function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable: times just aren't kept */
  }
}

const hash = () => Math.floor(Math.random() * 0xfffffff).toString(16).padStart(7, '0');

export const leaderboard = {
  /** Records a time (keyed by stage and car); returns { entry, best, rank }. */
  add(stageId, car, time) {
    stageId = `${stageId}:${car}`;
    const data = read();
    const entry = { hash: hash(), time, date: new Date().toISOString().slice(0, 10) };
    const list = [...(data[stageId] ?? []), entry].sort((a, b) => a.time - b.time).slice(0, KEEP);
    data[stageId] = list;
    write(data);
    return { entry, best: list[0], rank: list.indexOf(entry) + 1 || null };
  },
  get(stageId, car) {
    return read()[`${stageId}:${car}`] ?? [];
  },
};

/** 83.42 → "1:23.4" */
export function formatTime(t) {
  t = Math.round(t * 10) / 10; // round first so 59.96 → 1:00.0, not 0:60.0
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}
