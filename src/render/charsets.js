/**
 * Character sets per material. Order inside a string doesn't matter —
 * glyphs are measured and sorted by ink coverage at startup.
 *
 * The info pass stores the id in an 8-bit alpha:
 *   0..63    regular charset id
 *   64..127  terrain ("soft": weak normal edges), charset = a - 64
 *   128..131 terrain line (contour / road edge), edge direction = a - 128
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
];

if (CHARSET_GLYPHS.length > MAX_SETS) {
  throw new Error(`CHARSET_GLYPHS has ${CHARSET_GLYPHS.length} sets; MAX_SETS is ${MAX_SETS}`);
}

// Edge glyphs: 4 orientations (see ascii.js shader) + corner.
export const EDGE_GLYPHS = ['|', '\\', '-', '/', '+'];

/** Tags every mesh under `object` with a charset id. */
export function setCharset(object, id) {
  object.traverse(o => { if (o.isMesh) o.userData.charset = id; });
}
