/**
 * Home valley (~/) — the original 400 m world, coordinates unchanged.
 * Forest rally loop (W), old town (E), coastal cliff road (N), paddock (S).
 */
export default {
  id: 'core',
  features: [
    // Rally forest: rolling hills.
    { type: 'hill', pos: [-120, 20], r: 55, height: 12 },
    { type: 'hill', pos: [-75, -45], r: 45, height: 14 },
    { type: 'hill', pos: [-150, -60], r: 40, height: 16 },
    { type: 'hill', pos: [-45, 10], r: 30, height: 7 },
    { type: 'hill', pos: [-160, 90], r: 35, height: 9 },
    // Old town hill.
    { type: 'hill', pos: [95, 10], r: 72, height: 20 },
    // Valley undulation.
    { type: 'hill', pos: [30, -60], r: 30, height: 4 },
    { type: 'hill', pos: [150, 120], r: 35, height: 6 },
  ],

  // Roads. `surface` picks grip/drag, colour and charset. Crests are jumps (at = metres along).
  trails: [
    {
      id: 'forest', surface: 'gravel', width: 6, shoulder: 5, smooth: 16, closed: true,
      points: [[-22, 120], [-50, 110], [-75, 90], [-86, 60], [-70, 34], [-52, 8], [-62, -20],
        [-90, -40], [-122, -54], [-152, -34], [-162, 0], [-142, 30], [-152, 64], [-130, 94],
        [-100, 110], [-70, 126], [-42, 130]],
      // Crests sit on straights so you land with road ahead.
      crests: [{ at: 125, length: 20, height: 2.2 }, { at: 188, length: 24, height: 1.8 }, { at: 465, length: 22, height: 3.0 }],
    },
    {
      id: 'town', surface: 'cobble', width: 6, shoulder: 4, smooth: 30,
      points: [[18, 110], [38, 98], [60, 78], [86, 66], [115, 58], [135, 35], [138, 5],
        [125, -20], [100, -32], [75, -25], [62, -5], [66, 14], [81, 12]],
    },
    {
      id: 'town-steep', surface: 'cobble', width: 5, shoulder: 3, smooth: 50, maxGrade: 0.25,
      points: [[86, 64], [90, 50], [93, 36], [95, 24]],
    },
    {
      id: 'valley', surface: 'asphalt', width: 8, shoulder: 6, smooth: 60,
      points: [[0, 98], [6, 60], [-6, 20], [5, -20], [-4, -60], [3, -100], [5, -136]],
    },
    {
      id: 'coast', surface: 'asphalt', width: 7, shoulder: 4, smooth: 18,
      // Hugs the cliff edge (~9 m from the shoreline) so the sea shows beside the road.
      points: [[-186, -122], [-160, -138], [-140, -145], [-120, -155], [-100, -146], [-80, -132], [-55, -138],
        [-25, -128], [5, -138], [40, -148], [70, -132], [100, -138], [135, -126], [170, -134], [186, -124]],
    },
    {
      // East side, coast → paddock.
      id: 'east', surface: 'dirt', width: 7, shoulder: 5, smooth: 40,
      points: [[184, -118], [178, -80], [170, -40], [168, 0], [166, 40], [155, 80], [130, 112],
        [90, 135], [55, 140], [22, 124]],
    },
    {
      id: 'lookout', surface: 'gravel', width: 5, shoulder: 3, smooth: 6,
      points: [[-119, -155], [-121, -158], [-122, -160]],
    },
  ],

  // Zones: flat pads. Stop on one (or press E) to open its panel (src/content).
  zones: [
    { id: 'paddock', title: 'PADDOCK', path: '~/paddock', content: 'season', pos: [0, 120], r: 22, surface: 'pad' },
    { id: 'garage', title: 'GARAGE', path: '~/garage', content: 'skills', pos: [-40, 146], r: 9, surface: 'pad' },
    { id: 'pitwall', title: 'PIT WALL', path: '~/pit-wall', content: 'contact', pos: [26, 158], r: 8, surface: 'pad' },
    { id: 'piazza', title: 'RALLY HQ', path: '~/old-town/hq', content: 'hq', pos: [95, 10], r: 14, y: 16, surface: 'cobble' },
    { id: 'lookout', title: 'LOOKOUT', path: '~/coast/lookout', content: 'about', pos: [-122, -163], r: 7, surface: 'pad' },
    { id: 'skidpad', title: 'SKIDPAD', path: '~/skidpad', content: null, pos: [46, -76], r: 25, surface: 'asphalt' },
  ],

  // Special stages = projects. Ranges are metres along a trail (driven in
  // increasing direction). target = the owner's time per car class (seconds;
  // missing = no target, e.g. slicks on gravel).
  stages: [
    { id: 'ss1', name: 'SS1', trail: 'forest', from: 25, to: 250, splits: [100, 185], project: 'p1', hue: '#ffd166', target: { rally: 17.5, gt: 27, trail: 20.5 } },
    { id: 'ss2', name: 'SS2', trail: 'town', from: 40, to: 305, splits: [120, 220], project: 'p2', hue: '#ff6b6b', target: { rally: 21, formula: 23.5, hypercar: 23, gt: 22, trail: 23.5 } },
    { id: 'ss3', name: 'SS3', trail: 'coast', from: 222, to: 395, splits: [280, 340], project: 'p3', hue: '#4dabf7', target: { rally: 15, formula: 12.5, hypercar: 13.5, gt: 14, trail: 17.5 } },
    { id: 'ss4', name: 'SS4', trail: 'east', from: 20, to: 340, splits: [120, 230], project: 'p4', hue: '#c77dff', target: { rally: 21, formula: 34.5, hypercar: 31, gt: 24.5, trail: 23.5 } },
    { id: 'ss5', name: 'SS5', trail: 'valley', from: 40, to: 230, splits: [100, 165], project: 'p5', hue: '#5dff8a', target: { rally: 12, formula: 10.5, hypercar: 11, gt: 12, trail: 15.5 } },
  ],

  // Scatter regions (rects: [minX, minZ, maxX, maxZ]).
  scatter: [
    { kind: 'conifer', rect: [-188, -115, -14, 175], count: 1400, seed: 11, clearance: 2.5 },
    { kind: 'broadleaf', rect: [-14, -110, 35, 175], count: 70, seed: 13, clearance: 3 },
    { kind: 'broadleaf', rect: [35, 90, 188, 175], count: 60, seed: 16, clearance: 3 },
    { kind: 'rock', rect: [-188, -115, 188, 175], count: 120, seed: 14, clearance: 2 },
    { kind: 'cypress', rect: [30, -60, 165, 95], count: 90, seed: 15, clearance: 2 },
  ],
};
