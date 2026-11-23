/**
 * Character sets per material. Order inside a string doesn't matter —
 * glyphs are measured and sorted by ink coverage at startup.
 *
 * Ids are stored in an 8-bit channel of the info pass; MAX_SETS is the
 * shader-side array size and can grow up to 256.
 */
export const MAX_SETS = 16;

export const CHARSET = {
  DEFAULT: 0,
  GROUND: 1,
  FOLIAGE: 2,
  ROCK: 3,
  PILLAR: 4,
  CAR: 5,
  GOLD: 6,
  WOOD: 7,
  ROAD: 8,
  FLOOR: 9,
  GLYPH: 10,
  TILDE: 11,
  CHEVRON: 12,
};

export const CHARSET_GLYPHS = [
  /* DEFAULT */ ` .'\`^",:;Il!i><~+_-?][}{1)(|tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$`,
  /* GROUND  */ ` .,'\`:;-~`,
  /* FOLIAGE */ ` .,'^*vwYV&%#@`,
  /* ROCK    */ ` .,:;ocoO0Q@`,
  /* PILLAR  */ ` .:-=≡#H▓█`,
  /* CAR     */ ` .:=+*xX#$`,
  /* GOLD    */ ` .:+*oO@$§`,
  /* WOOD    */ ` .:!|lI#`,
  /* ROAD    */ ` .:-=`,
  /* FLOOR   */ ` .01`,
  /* GLYPH   */ ` .:░▒▓█`,
  /* TILDE   */ ` ~≈`,
  /* CHEVRON */ ` >»`,
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
