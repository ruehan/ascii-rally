/**
 * Character sets per material. Order inside a string doesn't matter —
 * glyphs are measured and sorted by ink coverage at startup.
 *
 * The info pass stores the id in an 8-bit alpha:
 *   0..63    regular charset id
 *   64..127  terrain ("soft": weak normal edges), charset = a - 64
 *   128..135 terrain line, direction = (a - 128) % 4; 128..131 contour, 132..135 road edge
 * so ids must stay below 64.
 */
export const MAX_SETS = 32;

export const CHARSET = {
  DEFAULT: 0,
  TERRA_LOW: 1,
  FOLIAGE: 2,
  ROCK: 3,
  ASPHALT: 4,
  CAR: 5,
  GOLD: 6,
  WOOD: 7,
  GRAVEL: 8,
  FLOOR: 9,
  GLYPH: 10,
  TILDE: 11,
  CHEVRON: 12,
  TERRA_MID: 13,
  TERRA_HIGH: 14,
  KERB: 15,
  COBBLE: 16,
  DIRT: 17,
  WALL: 18,
  ROOF: 19,
  SAND: 20,
  CLIFF: 21,
  SNOW: 22,
  SNOW_HIGH: 23,
  ICE: 24,
  DUNE: 25,
  PACKED: 26, // snow road (packed, grooved)
};

export const CHARSET_GLYPHS = [
  /* DEFAULT    */ ` .'\`^",:;Il!i><~+_-?][}{1)(|tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$`,
  /* TERRA_LOW  */ ` .,'`,
  /* FOLIAGE    */ ` .,'^*vwYV&%#@`,
  /* ROCK       */ ` .,:;ocoO0Q@`,
  /* ASPHALT    */ ` .-=≡#`,
  /* CAR        */ ` .:=+*xX#$`,
  /* GOLD       */ ` .:+*oO@$§`,
  /* WOOD       */ ` .:!|lI#`,
  /* GRAVEL     */ ` .:;=+`,
  /* FLOOR      */ ` .01`,
  /* GLYPH      */ ` .:░▒▓█`,
  /* TILDE      */ ` ~≈`,
  /* CHEVRON    */ ` >»`,
  /* TERRA_MID  */ ` .,:'`,
  /* TERRA_HIGH */ ` .'^"`,
  /* KERB       */ ` -=#`,
  /* COBBLE     */ ` .:o0O@`,
  /* DIRT       */ ` .:%`,
  /* WALL       */ ` .:|H#`,
  /* ROOF       */ ` .^A`,
  /* SAND       */ ` .,`,
  /* CLIFF      */ ` .:;|!`,
  /* SNOW       */ ` .·*`,
  /* SNOW_HIGH  */ ` .'*^`,
  /* ICE        */ ` -_=`,
  /* DUNE       */ ` .~-`,
  /* PACKED     */ ` .:=`,
];

if (CHARSET_GLYPHS.length > MAX_SETS) {
  throw new Error(`CHARSET_GLYPHS has ${CHARSET_GLYPHS.length} sets; MAX_SETS is ${MAX_SETS}`);
}

/**
 * Per-charset look, for figure/ground separation:
 *   density — scales brightness before picking a glyph (<1 = sparser glyphs)
 *   fill    — colour wash behind the glyph (the cell background)
 * Natural ground is a calm colour field with sparse texture, roads are a
 * touch denser, and objects (most of all the car) keep full-contrast glyphs.
 */
const GROUND = { density: 0.6, fill: 0.4 };
const ROAD = { density: 0.85, fill: 0.3 };
const OBJECT = { density: 1, fill: 0.18 };
const STYLE = {
  TERRA_LOW: GROUND, TERRA_MID: GROUND, TERRA_HIGH: GROUND, SAND: GROUND, DUNE: GROUND,
  SNOW: { density: 0.5, fill: 0.55 }, SNOW_HIGH: { density: 0.5, fill: 0.55 },
  ASPHALT: ROAD, GRAVEL: ROAD, DIRT: ROAD, COBBLE: ROAD, FLOOR: ROAD, ICE: ROAD, PACKED: ROAD, KERB: { density: 1, fill: 0.3 },
  CLIFF: { density: 0.85, fill: 0.2 },
  CAR: { density: 1.1, fill: 0.5 },
  TILDE: { density: 0.9, fill: 0.22 },
};
export const SET_DENSITY = [], SET_FILL = [];
for (const [name, id] of Object.entries(CHARSET)) {
  const st = STYLE[name] ?? OBJECT;
  SET_DENSITY[id] = st.density;
  SET_FILL[id] = st.fill;
}
for (let i = 0; i < MAX_SETS; i++) { SET_DENSITY[i] ??= OBJECT.density; SET_FILL[i] ??= OBJECT.fill; }

// Edge glyphs: 4 orientations (see ascii.js shader) + corner.
export const EDGE_GLYPHS = ['|', '\\', '-', '/', '+'];

/** Tags every mesh under `object` with a charset id. */
export function setCharset(object, id) {
  object.traverse(o => { if (o.isMesh) o.userData.charset = id; });
}
