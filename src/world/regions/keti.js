/**
 * Career 1 — KETI (healthcare wearable research), 2021–2023.
 * A research campus east of the home valley on the old skidpad: the plaza
 * is a giant watch face (hands follow the in-game clock), glass lab blocks
 * stand to the north, and the PULSE stage crosses the dial and leaves east
 * on a road drawn as a heartbeat (P bump, sharp QRS spike, T bump).
 */
export const DIAL = { pos: [46, -76], r: 25 };

/** P, Q, R, S, T as [x, height north (m), width (m)] Gaussian bumps. */
const WAVES = [[82, 3, 8], [99, -2.5, 8], [114, 12, 20], [131, -8, 15], [154, 5, 11]];
function heartbeat() {
  const z = x => -76 - WAVES.reduce((sum, [c, a, w]) => sum + a * Math.exp(-(((x - c) / w) ** 2)), 0);
  const pts = [];
  for (let x = 24; x <= 172; x += 4) pts.push([x, +z(x).toFixed(2)]);
  return pts;
}

export default {
  id: 'keti',
  trails: [
    {
      // Baseline z = −76: P (small bump), QRS (spike north then south),
      // T (rounded bump). Joins the east road at x ≈ 172.
      id: 'pulse', surface: 'asphalt', width: 7, shoulder: 4, smooth: 12, maxGrade: 0.12,
      // One heartbeat as a sum of bumps, sampled every 4 m: sharp enough to
      // read as an ECG, but every turn keeps ≥ ~8.5 m radius (drivable).
      points: heartbeat(),
    },
  ],
  zones: [
    {
      id: 'keti', title: 'KETI', label: { en: 'KETI campus', ko: 'KETI 캠퍼스' }, path: '~/career/keti', content: 'career', career: 'keti',
      pos: DIAL.pos, r: DIAL.r, surface: 'asphalt',
    },
  ],
  stages: [
    {
      id: 'c1', name: 'C1', title: 'PULSE', trail: 'pulse', from: 6, to: -6, splits: [70, 120],
      career: 'keti', hue: '#ff4d6d', target: {},
    },
  ],
  scatter: [],
};
