/**
 * Endurance country (~/endurance): the east. A 1.1 km long straight on one
 * gently sloping plane (no crests: at 340 km/h even a mild bump launches the
 * car), the north-east coast road with a lighthouse cape, and vineyard hills.
 * Also defines the 24H career loop v2, which runs its night here.
 */
export default {
  id: 'highway',
  features: [
    // One tilted plane under the straight + Tertre U-turn: y≈12 at z=300 → y≈28 at the north end.
    { type: 'plane', polygon: [[395, -430], [545, -430], [545, 560], [395, 560]], origin: [520, 505], y: 8, slope: [0, -0.022], falloff: 40 },
  ],
  trails: [
    {
      // T1 straight-on → down to the Tertre U-turn.
      id: 'link', surface: 'asphalt', width: 10, shoulder: 6, smooth: 120, maxGrade: 0.07,
      points: [[300, 300], [350, 298], [395, 310], [415, 345], [418, 420], [415, 470]],
    },
    {
      // Tertre U-turn, then 1.1 km north with a gentle kink, to the north corner.
      id: 'straight', surface: 'asphalt', width: 10, shoulder: 8, smooth: 150, maxGrade: 0.03,
      // ~700 m flat out from the U-turn exit to the kink: the one place a car
      // reaches its real top speed. No chicane — it killed the run.
      points: [[415, 470], [425, 520], [455, 548], [495, 545], [518, 515], [520, 300], [520, 60],
        [520, 0], [520, -200], [515, -250], [520, -300], [520, -380], // gentle kink, flat out
        [508, -405], [490, -418]],
    },
    {
      id: 'coast-e', surface: 'asphalt', width: 8, shoulder: 5, smooth: 120, maxGrade: 0.06,
      points: [[490, -418], [470, -432], [400, -445], [330, -425], [278, -378], [248, -318], [232, -255],
        [218, -190], [196, -140], [186, -124]],
    },
    {
      id: 'lighthouse', surface: 'gravel', width: 5, shoulder: 3, smooth: 6,
      points: [[400, -447], [400, -458], [400, -468]],
    },
    {
      // Home east road → vineyards → the long straight's chicane.
      id: 'vigna', surface: 'asphalt', width: 7, shoulder: 5, smooth: 110, maxGrade: 0.08,
      points: [[168, 0], [205, 8], [245, -15], [290, -5], [330, 25], [375, 15], [420, 35], [465, 30], [505, 30]],
    },
  ],
  zones: [
    { id: 'roadhouse', title: 'ROADHOUSE', path: '~/endurance/roadhouse', content: null, pos: [540, 250], r: 10, surface: 'pad' },
    { id: 'lighthouse', title: 'LIGHTHOUSE', path: '~/coast/lighthouse', content: null, pos: [400, -476], r: 8, surface: 'pad' },
    { id: 'cantina', title: 'CANTINA', path: '~/vineyards/cantina', content: null, pos: [290, -28], r: 10, surface: 'pad' },
  ],
  stages: [
    { id: 'ss11', name: 'SS11', title: 'COSTIERA', trail: 'coast-e', from: 20, to: -20, splits: [180, 340], project: null, hue: '#48cae4', target: {} },
    { id: 'ss12', name: 'SS12', title: 'THE LONG STRAIGHT', trail: 'straight', from: 10, to: -5, splits: [480, 760], project: null, hue: '#ffbe0b', target: {} },
    { id: 'ss13', name: 'SS13', title: 'VIGNA', trail: 'vigna', from: 10, to: -20, splits: [120, 220], project: null, hue: '#9d4edd', target: {} },
  ],
  scatter: [
    { kind: 'cypress', rect: [205, -330, 470, 240], count: 220, seed: 81, clearance: 8 },
    { kind: 'broadleaf', rect: [205, 240, 585, 585], count: 90, seed: 82, clearance: 14 },
    { kind: 'rock', rect: [205, -450, 585, 585], count: 80, seed: 83, clearance: 6 },
  ],
};

/**
 * 24H loop v2 (~3.2 km, clockwise): the clock starts on the link straight on
 * from GP T1, runs into the night along the long straight, dawns on the
 * coast, crosses home in the morning and returns via the GP straight.
 * Trail sections with from > to are driven in reverse; negative numbers
 * count back from a trail's end.
 */
export const loop24 = {
  route: [
    { trail: 'link' },
    { trail: 'straight' },
    { trail: 'coast-e' },
    { trail: 'coast', from: -1, to: 211 },     // reverse: east end → valley junction
    { trail: 'valley', from: -1, to: 0 },       // reverse: down to the paddock
    { points: [[0, 98], [0, 120], [0, 142]] },   // across the paddock
    { trail: 'pass' },
    { trail: 'gp', from: -205, to: -1 },        // join the GP main straight
    { trail: 'gp', from: 0, to: 295 },          // … to T1, straight on into the link
  ],
  start: 60, // 60 m into the link: the gate posts must clear GP T1
  startHour: 15,
};
