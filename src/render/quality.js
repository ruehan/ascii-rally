/**
 * Quality tiers and an automatic picker.
 *
 *   shadow  sun shadow map size (0 = no shadows)
 *   dpr     cap on device pixel ratio for the final glyph pass
 *
 * The scene itself renders at the glyph-cell resolution, so what costs on
 * slow devices is mostly shadows, draw calls and the full-resolution final
 * pass. `auto` starts from a guess about the device and steps down (never
 * up, to avoid see-sawing) while frames are slow.
 */
export const TIERS = {
  high: { shadow: 2048, dpr: 2 },
  medium: { shadow: 1024, dpr: 1.5 },
  low: { shadow: 0, dpr: 1 },
};
export const TIER_ORDER = ['high', 'medium', 'low'];

/** First guess from what the browser tells us about the device. */
export function guessTier() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const mobile = /Android|iPhone|iPad|Mobile/i.test(nav.userAgent ?? '');
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 8;
  if (mobile || cores <= 2 || mem <= 2) return 'low';
  if (cores <= 4 || mem <= 4) return 'medium';
  return 'high';
}

/**
 * Watches frame times while in auto mode; calls `onStep(tier)` when it
 * steps down. Frames are judged over 3 s windows, after a short grace
 * period (loading hitches, shader compiles).
 */
export function createAutoQuality({ start, onStep }) {
  let tier = start;
  let grace = 4, window = 0, slow = 0, frames = 0;
  return {
    get tier() { return tier; },
    reset(next) { tier = next; grace = 3; window = slow = frames = 0; },
    /** dt in seconds (real frame time). */
    frame(dt) {
      if (grace > 0) { grace -= dt; return; }
      window += dt; frames++;
      if (dt > 1 / 40) slow++; // under ~40 fps
      if (window < 3) return;
      const slowShare = slow / frames;
      window = slow = frames = 0;
      const i = TIER_ORDER.indexOf(tier);
      if (slowShare > 0.5 && i < TIER_ORDER.length - 1) {
        tier = TIER_ORDER[i + 1];
        grace = 2;
        onStep(tier);
      }
    },
  };
}
