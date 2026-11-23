/**
 * Maps input state to vehicle intents. Keyboard now; touch/gamepad later
 * produce the same shape.
 */
export function readIntents(state) {
  return {
    throttle: state.forward ? 1 : 0,
    brake: state.backward ? 1 : 0,
    steer: (state.left ? 1 : 0) - (state.right ? 1 : 0),
  };
}
