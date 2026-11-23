const MOVE_KEYS = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'backward', ArrowDown: 'backward',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
};

/**
 * Keyboard input: held movement state + one-shot key actions.
 * Set `enabled = false` (e.g. while a UI panel is open) to ignore movement.
 */
export function createInput(target = window) {
  const held = { forward: false, backward: false, left: false, right: false, handbrake: false };
  const actions = new Map();

  const input = {
    enabled: true,
    /** Movement state, all false while disabled. */
    get state() {
      return input.enabled ? held : { forward: false, backward: false, left: false, right: false, handbrake: false };
    },
    /** Register a one-shot action for a KeyboardEvent.code (or several). */
    onPress(codes, fn) {
      for (const c of [].concat(codes)) actions.set(c, fn);
    },
  };

  target.addEventListener('keydown', e => {
    const k = MOVE_KEYS[e.code];
    if (k) { held[k] = true; e.preventDefault(); }
    if (!e.repeat) actions.get(e.code)?.(e);
  });
  target.addEventListener('keyup', e => {
    const k = MOVE_KEYS[e.code];
    if (k) held[k] = false;
  });
  target.addEventListener('blur', () => {
    for (const k in held) held[k] = false;
  });

  return input;
}
