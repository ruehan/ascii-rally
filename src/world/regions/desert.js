/**
 * Desert (~/desert): a fast dirt loop round a dune basin in the south-west.
 * Reached from the mountain descent and from the GP's west exit. Two long
 * straights each carry a jump with plenty of straight road after landing.
 */
// Road control points (the dune field keeps clear of them).
const ROAD = [[-450, 195], [-480, 240], [-520, 280], [-550, 330], [-550, 470], [-530, 525], [-480, 555],
  [-360, 558], [-325, 530], [-318, 480], [-330, 430], [-320, 370], [-300, 330]];

function segDist(x, z, [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}
const roadDist = (x, z) => Math.min(...ROAD.slice(1).map((b, i) => segDist(x, z, ROAD[i], b)));

/**
 * Dune field: short ridges across a NW wind (long axis NE–SW), seeded so
 * the map is the same every run. Each keeps its footprint ≥ ~9 m off
 * the road and inside the basin.
 */
function dunes() {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let i = 0; i < 2000 && out.length < 70; i++) {
    const x = -590 + rand() * 300, z = 230 + rand() * 360;
    const len = 22 + rand() * 30, width = 14 + rand() * 10, height = 3.5 + rand() * 5;
    const ang = Math.PI / 4 + (rand() - 0.5) * 0.6; // NE–SW crest lines
    const dx = Math.cos(ang) * len / 2, dz = -Math.sin(ang) * len / 2;
    const a = [x - dx, z - dz], b = [x + dx, z + dz];
    const clear = width / 2 + 9;
    if ([a, [x, z], b].some(([px, pz]) => roadDist(px, pz) < clear || px < -585 || pz > 590)) continue;
    if (out.some(o => Math.hypot(o.c[0] - x, o.c[1] - z) < 24)) continue;
    out.push({ c: [x, z], f: { type: 'ridge', points: [a, [x + dz * 0.25, z - dx * 0.25], b], width, height } }); // slight crescent
  }
  return out.map(o => o.f);
}

export default {
  id: 'desert',
  biomes: [
    { id: 'desert', polygon: [[-600, 190], [-300, 250], [-275, 330], [-290, 600], [-600, 600]], feather: 50 },
  ],
  features: dunes(),
  trails: [
    {
      id: 'desert', surface: 'dirt', width: 9, shoulder: 6, smooth: 80, maxGrade: 0.06,
      points: ROAD,
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
    { kind: 'cactus', rect: [-600, 180, -280, 600], count: 800, seed: 101, clearance: 5, biome: 'desert' },
    { kind: 'shrub', rect: [-600, 180, -280, 600], count: 3000, seed: 102, clearance: 2, biome: 'desert' },
    { kind: 'rock', rect: [-600, 180, -280, 600], count: 500, seed: 103, clearance: 4, biome: 'desert' },
  ],
};
