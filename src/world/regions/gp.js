/**
 * Grand Prix (~/grand-prix): a 1.5 km circuit on the flats south of home.
 * Clockwise: 500 m main straight east, T1 heavy-braking hairpin, fast esses,
 * stadium section, medium chicane, long sweeper, last corner onto the straight.
 * Corners ≥ 10 m radius; the whole track sits on one flat (no noise bumps —
 * at 300+ km/h any crest launches the car).
 */
export default {
  id: 'gp',
  features: [
    { type: 'flat', polygon: [[-285, 262], [355, 262], [360, 390], [215, 575], [-285, 575]], y: 6, falloff: 40 },
  ],
  trails: [
    {
      id: 'gp', surface: 'asphalt', width: 12, shoulder: 6, smooth: 150, maxGrade: 0.02, closed: true, kerbs: true,
      points: [[0, 300], [140, 300], [280, 300],
        [312, 305], [328, 320], [322, 337], [300, 348],                 // T1 hairpin
        [262, 372], [236, 400], [222, 432], [196, 462], [170, 500],     // T2–T4 esses
        [150, 530], [110, 545], [60, 545],                              // T5
        [30, 538], [10, 505], [-25, 490], [-55, 505], [-70, 535], [-95, 545], // stadium T6–T9
        [-112, 537], [-128, 537], [-150, 545],                          // T10/11 chicane
        [-200, 543], [-232, 525], [-245, 485], [-245, 400],             // T12 sweeper
        [-238, 345], [-215, 310], [-190, 300]],                         // T13 last corner
    },
    {
      // Paddock → over the low saddle → joins the main straight's west end.
      id: 'pass', surface: 'asphalt', width: 8, shoulder: 6, smooth: 120, maxGrade: 0.08,
      points: [[0, 142], [-4, 172], [-8, 205], [-20, 235], [-60, 255], [-120, 265], [-170, 282], [-205, 298]],
    },
    {
      id: 'pitlane', surface: 'asphalt', width: 8, shoulder: 3, smooth: 40, maxGrade: 0.02,
      points: [[-170, 284], [-100, 280], [200, 280], [262, 292]],
    },
    {
      // West exit towards the desert basin.
      id: 'gp-west', surface: 'asphalt', width: 7, shoulder: 5, smooth: 80, maxGrade: 0.06,
      points: [[-245, 440], [-290, 430], [-330, 410], [-370, 395]],
    },
  ],
  zones: [
    { id: 'race-control', title: 'RACE CONTROL', path: '~/grand-prix/race-control', content: 'hq', pos: [-150, 252], r: 12, surface: 'pad' },
  ],
  stages: [
    { id: 'ss6', name: 'SS6', trail: 'gp', from: 15, to: -15, splits: [430, 900], project: 'p6', hue: '#ff9a3c', target: {} },
  ],
  scatter: [
    { kind: 'broadleaf', rect: [-300, 200, 380, 590], count: 260, seed: 61, clearance: 25 },
    { kind: 'rock', rect: [-300, 200, 380, 590], count: 60, seed: 62, clearance: 10 },
  ],
};
