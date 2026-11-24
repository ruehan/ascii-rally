/**
 * Career 2 — Zero One (food-waste reducers + collection service), 2025–2026.
 * A depot on the flat ground between the GP's east road and the long
 * straight: reducer machines (drums) in the yard, a control tower with
 * screens, parked collection trucks. The COLLECTION RUN stage leaves the
 * depot, loops the block past five bins (each is a split: miss one, +10 s)
 * and comes back to the yard.
 */
export const DEPOT = { pos: [468, 452], r: 14 };

export default {
  id: 'zeroone',
  trails: [
    {
      id: 'collect', surface: 'asphalt', width: 7, shoulder: 4, smooth: 10, maxGrade: 0.1,
      points: [[468, 440], [468, 405], [452, 384], [446, 352], [462, 334], [490, 336], [500, 362],
        [490, 392], [500, 420], [502, 470], [488, 502], [456, 504], [440, 480], [448, 462]],
    },
  ],
  zones: [
    {
      id: 'zeroone', title: 'ZERO ONE', label: { en: 'Zero One depot', ko: '제로원 차고지' },
      path: '~/career/zero-one', content: 'career', career: 'zeroone',
      pos: DEPOT.pos, r: DEPOT.r, surface: 'pad',
    },
  ],
  stages: [
    {
      id: 'c2', name: 'C2', title: 'COLLECTION RUN', trail: 'collect', from: 6, to: -8,
      splits: [70, 140, 210, 280, 340], splitKind: 'pickup', // five bins
      career: 'zeroone', hue: '#7bd389', target: {},
    },
  ],
  scatter: [],
};
