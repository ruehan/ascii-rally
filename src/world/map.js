/**
 * Stage ~/ — world layout. Units: metres, XZ plane, -Z = north (screen up).
 * See docs/map-design.md. Everything here is data; build.js turns it into
 * terrain, surfaces, meshes and colliders.
 *
 * The camera always looks north, so anything worth seeing sits north of the
 * road you're on. Hence the sea is in the NORTH: you drive up from the
 * paddock, crest the plateau, and the coast opens up below.
 *
 *   North : coastal cliff road (asphalt) above the sea, lookout headland
 *   West  : rally forest — gravel loop through dense conifers, crests
 *   East  : old town on a hill — cobbled spiral, steep climb, piazza (Rally HQ), church
 *   South : paddock (spawn), garage, pit wall; mountain ridge boundary
 *   Centre: valley road climbing north to the coast
 */
export default {
  size: 400,
  bounds: { type: 'box', min: [-188, -182], max: [188, 188] },
  waterLevel: 0,
  spawn: { pos: [0, 132], heading: 0 },

  terrain: {
    cell: 2,
    seed: 7,
    base: { height: 4, amp: 2.2, wavelength: 55, octaves: 3 },
    features: [
      // Boundary mountains (south + flanks).
      { type: 'ridge', points: [[-210, 196], [-80, 200], [60, 196], [210, 196]], width: 40, height: 24 },
      { type: 'ridge', points: [[-200, 190], [-198, 40], [-196, -90]], width: 30, height: 16 },
      { type: 'ridge', points: [[200, 190], [198, 40], [196, -90]], width: 30, height: 16 },

      // Rally forest (west): rolling hills.
      { type: 'hill', pos: [-120, 20], r: 55, height: 12 },
      { type: 'hill', pos: [-75, -45], r: 45, height: 14 },
      { type: 'hill', pos: [-150, -60], r: 40, height: 16 },
      { type: 'hill', pos: [-45, 10], r: 30, height: 7 },
      { type: 'hill', pos: [-160, 90], r: 35, height: 9 },

      // Old town hill (east).
      { type: 'hill', pos: [95, 10], r: 72, height: 20 },

      // Valley undulation.
      { type: 'hill', pos: [30, -60], r: 30, height: 4 },
      { type: 'hill', pos: [150, 120], r: 35, height: 6 },

      // Coast: cliff above the sea in the north. Coves + a headland at x≈-125.
      {
        type: 'coast', land: 'south',
        points: [[-230, -150], [-175, -148], [-148, -158], [-128, -178], [-105, -160], [-80, -142], [-50, -150],
          [-20, -139], [10, -150], [45, -160], [75, -143], [105, -150], [140, -138], [175, -150], [230, -148]],
        cliffTop: 15, cliffWidth: 7, rise: 0.06, seaDepth: 6, blend: [45, 95],
      },
    ],
  },

  // Roads. `surface` picks grip/drag, colour and charset. Crests are jumps (at = metres along).
  trails: [
    {
      id: 'forest', surface: 'gravel', width: 6, shoulder: 5, smooth: 16, closed: true,
      points: [[-22, 120], [-50, 110], [-75, 90], [-86, 60], [-70, 34], [-52, 8], [-62, -20],
        [-90, -40], [-122, -54], [-152, -34], [-162, 0], [-142, 30], [-152, 64], [-130, 94],
        [-100, 110], [-70, 126], [-42, 130]],
      crests: [{ at: 140, length: 22, height: 2.8 }, { at: 330, length: 20, height: 3.0 }, { at: 470, length: 22, height: 2.6 }],
    },
    {
      id: 'town', surface: 'cobble', width: 6, shoulder: 4, smooth: 30,
      points: [[18, 110], [38, 98], [60, 78], [86, 66], [115, 58], [135, 35], [138, 5],
        [125, -20], [100, -32], [75, -25], [62, -5], [66, 14], [81, 12]],
    },
    {
      id: 'town-steep', surface: 'cobble', width: 5, shoulder: 3, smooth: 50, maxGrade: 0.3,
      points: [[86, 64], [90, 50], [93, 36], [95, 24]],
    },
    {
      id: 'valley', surface: 'asphalt', width: 8, shoulder: 6, smooth: 60,
      points: [[0, 98], [6, 60], [-6, 20], [5, -20], [-4, -60], [3, -100], [5, -136]],
    },
    {
      id: 'coast', surface: 'asphalt', width: 7, shoulder: 4, smooth: 18,
      // Hugs the cliff edge (~9 m from the shoreline) so the sea shows above the road.
      points: [[-186, -122], [-160, -138], [-140, -145], [-120, -155], [-100, -146], [-80, -132], [-55, -138],
        [-25, -128], [5, -138], [40, -148], [70, -132], [100, -138], [135, -126], [170, -134], [186, -124]],
    },
    {
      // East side, coast → paddock: the night leg of the 24H loop.
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
  ],

  // Special stages = projects. Ranges are metres along a trail (driven in
  // increasing direction). One surface each, like a mixed-surface rally.
  // target = the owner's time to beat (seconds).
  stages: [
    { id: 'ss1', name: 'SS1', trail: 'forest', from: 25, to: 265, splits: [100, 185], project: 'p1', hue: '#ffd166', target: 24 },
    { id: 'ss2', name: 'SS2', trail: 'town', from: 40, to: 305, splits: [120, 220], project: 'p2', hue: '#ff6b6b', target: 28 },
    { id: 'ss3', name: 'SS3', trail: 'coast', from: 222, to: 395, splits: [280, 340], project: 'p3', hue: '#4dabf7', target: 15 },
  ],

  // 24H loop: a route stitched from existing roads (clockwise). Driving it
  // runs the clock from 15:00 round to 15:00; career milestones sit along it.
  loop24: {
    route: [
      { trail: 'valley' },
      { trail: 'coast', from: 211 },
      { trail: 'east' },
      { points: [[22, 124], [10, 108], [0, 99]] }, // across the paddock back to the start
    ],
    start: 10,          // start line, metres along the route
    startHour: 15,
  },

  // Scatter regions (rects: [minX, minZ, maxX, maxZ]).
  scatter: [
    { kind: 'conifer', rect: [-188, -115, -14, 175], count: 1400, seed: 11, clearance: 2.5 },
    { kind: 'broadleaf', rect: [-14, -110, 35, 175], count: 70, seed: 13, clearance: 3 },
    { kind: 'broadleaf', rect: [35, 90, 188, 175], count: 60, seed: 16, clearance: 3 },
    { kind: 'rock', rect: [-188, -115, 188, 175], count: 120, seed: 14, clearance: 2 },
    { kind: 'cypress', rect: [30, -60, 165, 95], count: 90, seed: 15, clearance: 2 },
  ],
};
