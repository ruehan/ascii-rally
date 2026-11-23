/**
 * Desert (~/desert): a fast dirt loop round a dune basin in the south-west.
 * Reached from the mountain descent and from the GP's west exit. Two long
 * straights each carry a jump with plenty of straight road after landing.
 */
export default {
  id: 'desert',
  biomes: [
    { id: 'desert', polygon: [[-600, 190], [-300, 250], [-275, 330], [-290, 600], [-600, 600]], feather: 50 },
  ],
  features: [
    // Dune ridges inside the loop, NW–SE, kept ≥ 15 m from the road.
    { type: 'ridge', points: [[-500, 305], [-462, 342]], width: 18, height: 5 },
    { type: 'ridge', points: [[-485, 385], [-438, 425]], width: 18, height: 6 },
    { type: 'ridge', points: [[-475, 455], [-428, 492]], width: 18, height: 5 },
    { type: 'ridge', points: [[-425, 318], [-385, 356]], width: 16, height: 4 },
    { type: 'ridge', points: [[-412, 398], [-372, 438]], width: 16, height: 5 },
  ],
  trails: [
    {
      id: 'desert', surface: 'dirt', width: 9, shoulder: 6, smooth: 80, maxGrade: 0.06,
      points: [[-450, 195], [-480, 240], [-520, 280], [-550, 330], [-550, 470], [-530, 525], [-480, 555],
        [-360, 558], [-325, 530], [-318, 480], [-330, 430], [-320, 370], [-300, 330]],
      // Jumps near the start of the N–S straight (s 170–311) and the E–W
      // straight (s 430–551), so there's straight road to land on.
      crests: [{ at: 195, length: 40, height: 2.5 }, { at: 452, length: 40, height: 2.0 }],
    },
  ],
  zones: [
    { id: 'bivouac', title: 'BIVOUAC', path: '~/desert/bivouac', content: null, pos: [-438, 252], r: 12, surface: 'sand' },
  ],
  stages: [
    { id: 'ss10', name: 'SS10', title: 'DUNE', trail: 'desert', from: 10, to: -15, splits: [330, 640], project: null, hue: '#f2c14e', target: {}, cars: ['rally', 'trail'] },
  ],
  scatter: [
    { kind: 'cactus', rect: [-600, 180, -280, 600], count: 160, seed: 101, clearance: 10, biome: 'desert' },
    { kind: 'shrub', rect: [-600, 180, -280, 600], count: 400, seed: 102, clearance: 3, biome: 'desert' },
    { kind: 'rock', rect: [-600, 180, -280, 600], count: 120, seed: 103, clearance: 6, biome: 'desert' },
  ],
};
