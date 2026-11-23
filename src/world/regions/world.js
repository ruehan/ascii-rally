/**
 * World frame: boundary mountains, the sea and bay, and the large-scale
 * landforms of every region (roads live in the region files).
 *
 *   N  sea + bay (home coast is the bay's south shore), lighthouse cape (NE)
 *   NW snow mountains   W mountain rally   SW desert basin
 *   S  Grand Prix flats  E vineyard hills + long straight   centre: home (core.js)
 */
export default {
  id: 'world',
  features: [
    // Boundary mountains: south, west (up to the snow), east (up to the coast).
    { type: 'ridge', points: [[-640, 600], [0, 606], [640, 600]], width: 60, height: 30 },
    { type: 'ridge', points: [[-602, 620], [-602, 200], [-600, -380]], width: 50, height: 30 },
    { type: 'ridge', points: [[602, 620], [602, 0], [600, -400]], width: 50, height: 28 },

    // Sea + bay. One west→east coastline, land to the south. The home coast
    // (x −175…175) is unchanged; the bay opens north of it.
    {
      type: 'coast', land: 'south',
      points: [[-640, -470], [-480, -478], [-380, -468], [-320, -455], [-275, -410], [-245, -350], [-228, -280],
        [-215, -215], [-200, -170], [-175, -148], [-148, -158], [-128, -178], [-105, -160], [-80, -142], [-50, -150],
        [-20, -139], [10, -150], [45, -160], [75, -143], [105, -150], [140, -138], [175, -150], [200, -185],
        [215, -250], [232, -320], [262, -385], [320, -440], [370, -460], [400, -490], [430, -462], [470, -455],
        [540, -440], [640, -445]],
      cliffTop: 15, cliffWidth: 7, rise: 0.06, seaDepth: 6, blend: [45, 95],
    },

    // Snow mountains (NW): fjord peaks rising from the sea.
    { type: 'hill', pos: [-510, -330], r: 150, height: 75 },
    { type: 'hill', pos: [-540, -400], r: 90, height: 100 },
    { type: 'ridge', points: [[-600, -200], [-480, -250], [-380, -300]], width: 120, height: 40 },

    // Mountain rally (W): one broad massif peaking at the col, so the
    // switchbacks climb steadily to it and the far side descends steadily.
    { type: 'hill', pos: [-460, -170], r: 320, height: 58 },

    // Hillclimb hill (hidden road arrives later).
    { type: 'hill', pos: [-330, 175], r: 80, height: 45 },

    // Desert basin (SW): low base ground; dunes come with the desert region.

    // Grand Prix flats (S).
    { type: 'pad', pos: [-120, 420], r: 170, y: 6, falloff: 30 },
    { type: 'pad', pos: [110, 420], r: 170, y: 6, falloff: 30 },
    { type: 'pad', pos: [300, 360], r: 60, y: 6, falloff: 30 },

    // Vineyard hills (E).
    { type: 'hill', pos: [300, -150], r: 90, height: 18 },
    { type: 'hill', pos: [420, 100], r: 80, height: 14 },
    { type: 'hill', pos: [330, 150], r: 60, height: 10 },
  ],
  trails: [],
  zones: [],
  stages: [],
  scatter: [],
};
