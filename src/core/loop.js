/**
 * Fixed-timestep game loop.
 *
 * - step(h):              simulation at a constant rate (physics, gameplay)
 * - render(alpha, dt, t): once per frame; alpha in [0,1) is how far we are
 *                         between the last two steps, for interpolation
 * - onUpdate(fn):         per-frame hooks (dt, t) for visual-only animation
 */
export function createLoop({ step, render, hz = 60, maxSteps = 5 }) {
  const h = 1 / hz;
  const updates = [];
  let acc = 0;
  let last = 0;
  let t = 0;
  let running = false;

  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min((now - last) / 1000, 0.25) : h;
    last = now;
    t += dt;

    acc += dt;
    let steps = 0;
    while (acc >= h && steps < maxSteps) {
      step(h);
      acc -= h;
      steps++;
    }
    if (steps === maxSteps) acc = 0; // fell behind (tab switch etc.): drop the backlog

    for (const fn of updates) fn(dt, t);
    render(acc / h, dt, t);
    requestAnimationFrame(frame);
  }

  return {
    onUpdate(fn) { updates.push(fn); },
    start() {
      if (running) return;
      running = true;
      last = 0;
      requestAnimationFrame(frame);
    },
    stop() { running = false; },
  };
}
