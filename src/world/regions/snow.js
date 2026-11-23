/**
 * Mountains (~/mountains) and snow (~/snow): the west and north-west.
 * West coast road climbs from the home coast into the snow; the snow road
 * (ice on two shaded hairpins) reaches the col; the gravel rally road runs
 * from the home forest over the col and down to the desert. A hidden
 * hillclimb hides in a dense wood west of the forest.
 */
export default {
  id: 'snow',
  biomes: [
    // Snow on the fjord mountains, and anywhere above 55 m.
    { id: 'snow', polygon: [[-600, -500], [-340, -500], [-330, -380], [-390, -250], [-600, -170]], feather: 40, snowline: 55, snowlineFeather: 10 },
  ],
  features: [],
  trails: [
    {
      id: 'coast-w', surface: 'asphalt', width: 7, shoulder: 5, smooth: 100, maxGrade: 0.08,
      points: [[-186, -122], [-208, -150], [-225, -200], [-238, -265], [-255, -335], [-282, -390], [-320, -425], [-345, -440]],
    },
    {
      id: 'neve', surface: 'snow', width: 7, shoulder: 4, smooth: 25, maxGrade: 0.12, poles: true,
      points: [[-345, -440], [-400, -450], [-445, -430], [-415, -395], [-370, -375], [-410, -345], [-470, -340],
        [-530, -365], [-570, -320], [-560, -265], [-520, -240], [-490, -215], [-440, -190]],
    },
    {
      id: 'westsaddle', surface: 'gravel', width: 6, shoulder: 4, smooth: 20, maxGrade: 0.12,
      points: [[-152, 64], [-185, 78], [-215, 80]],
    },
    {
      // Home forest → four switchbacks up to the col. Ends exactly at the col
      // (road ends are pinned to the ground, so all three roads meet level).
      id: 'mountain', surface: 'gravel', width: 6, shoulder: 5, smooth: 30, maxGrade: 0.18,
      points: [[-215, 80], [-260, 95], [-315, 90], [-350, 60], [-335, 25], [-280, 15], [-240, -5],
        [-250, -40], [-305, -45], [-360, -30], [-410, -45], [-430, -80], [-385, -100], [-330, -105],
        [-300, -130], [-335, -160], [-385, -150], [-440, -190]],
    },
    {
      // Col → down the far side on two long straights → desert.
      id: 'descent', surface: 'gravel', width: 6, shoulder: 5, smooth: 40, maxGrade: 0.15,
      // No jumps: there's no straight long enough after a landing (crests on
      // the steep part act as launch ramps). The desert has the jumps.
      // Kept east of x≈-550: the west boundary ridge (x -602, 50 m wide) tilts the ground beyond it.
      points: [[-440, -190], [-500, -178], [-538, -150], [-546, -100], [-546, -20], [-540, 20], [-530, 100],
        [-500, 130], [-470, 140], [-440, 165], [-450, 195]],
    },
    {
      // Hidden: entrance behind the trees just west of the forest.
      id: 'hillclimb', surface: 'asphalt', width: 6, shoulder: 4, smooth: 30, maxGrade: 0.15,
      points: [[-205, 105], [-230, 150], [-262, 165], [-238, 190], [-272, 215], [-312, 202], [-302, 172],
        [-338, 152], [-362, 180]],
    },
  ],
  // Ice on the two shaded snow hairpins.
  patches: [
    { pos: [-445, -430], r: 9, surface: 'ice' },
    { pos: [-370, -375], r: 9, surface: 'ice' },
  ],
  zones: [
    { id: 'refuge', title: 'REFUGE', path: '~/snow/refuge', content: null, pos: [-525, -290], r: 10, surface: 'snow' },
    // Junction of the snow and gravel roads: a `pre` pad sets the height both
    // roads are carved from, so they meet level.
    { id: 'col', title: 'COL', path: '~/mountains/col', content: null, pos: [-440, -190], r: 14, y: 60, surface: 'gravel', flatten: 'pre' },
    { id: 'summit', title: 'SUMMIT', path: '~/hillclimb/summit', content: null, pos: [-366, 186], r: 8, surface: 'pad', hidden: true },
  ],
  stages: [
    { id: 'ss7', name: 'SS7', title: 'TORNANTI', trail: 'mountain', from: 20, to: -15, splits: [300, 600], project: null, hue: '#d9a066', target: {}, cars: ['rally', 'trail'] },
    { id: 'ss8', name: 'SS8', title: 'DISCESA', trail: 'descent', from: 20, to: -25, splits: [180, 360], project: null, hue: '#b5835a', target: {}, cars: ['rally', 'trail'] },
    { id: 'ss9', name: 'SS9', title: 'NEVE', trail: 'neve', from: 15, to: -15, splits: [220, 430], project: null, hue: '#e8f4ff', target: {}, cars: ['rally', 'trail'] },
    { id: 'hc', name: 'HC', title: 'HILLCLIMB', trail: 'hillclimb', from: 8, to: -8, splits: [150, 300], project: null, hue: '#3f7bff', target: {}, hidden: true, cars: ['rally', 'gt', 'trail'] },
  ],
  scatter: [
    { kind: 'snowPine', rect: [-600, -500, -300, -150], count: 1600, seed: 91, clearance: 6, biome: 'snow' },
    { kind: 'conifer', rect: [-600, -170, -200, 180], count: 1300, seed: 92, clearance: 3, biome: 'temperate' },
    { kind: 'conifer', rect: [-390, 90, -195, 235], count: 900, seed: 93, clearance: 4, biome: 'temperate' }, // hides the hillclimb
    { kind: 'rock', rect: [-600, -500, -200, 235], count: 300, seed: 94, clearance: 6 },
  ],
};
