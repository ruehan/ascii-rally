// Test/dev autopilot: follows a path, braking for corners using the car's
// own grip so it works for every car class at realistic speeds.
const root = new URL('../..', import.meta.url).href.replace(/\/$/, '');
const { pointAt } = await import(root + '/src/world/path.js');

const G = 9.81;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export function createAutopilot({ path, cum, surfaceAt = () => 'asphalt', heightAt = null, start = 0 }) {
  const total = cum[cum.length - 1];
  let s = start;
  let stuckFor = 0, reverseFor = 0;
  const yawAt = d => { const p = pointAt(path, cum, d); return Math.atan2(-p.tx, -p.tz); };

  /** Safe cornering speed at distance d along the path for car c. */
  function cornerSpeed(c, d) {
    const turn = Math.abs(wrap(yawAt(d + 4) - yawAt(d - 4)));
    if (turn < 1e-3) return Infinity;
    const R = 8 / turn;
    const p = pointAt(path, cum, d);
    const mu = c.tyres[surfaceAt(p.x, p.z)] ?? 1;
    // Solve v² = μ·(g + k·v²)·R  with k = ½ρ·ClA/m (downforce grows with v²).
    const k = 0.5 * 1.225 * c.cla / c.mass;
    const denom = 1 - mu * k * R * 0.5;
    return denom <= 0 ? Infinity : Math.sqrt((mu * G * R * 0.5) / denom);
  }

  /** Speed that keeps the car on the ground over a crest at d (v²·κ < ~0.9 g; small crests may still be jumped). */
  function crestSpeed(c, d) {
    if (!heightAt) return Infinity;
    const h = q => { const p = pointAt(path, cum, q); return heightAt(p.x, p.z); };
    const L = 6;
    const kappa = (h(d + L) + h(d - L) - 2 * h(d)) / (L * L);
    if (kappa >= -1e-3) return Infinity;
    const down = 0.5 * 1.225 * c.cla / c.mass; // downforce helps
    const k = -kappa - down * 0.6;
    return k <= 0 ? Infinity : Math.sqrt((0.9 * G) / k);
  }

  return {
    get s() { return s; },
    get progress() { return s / total; },
    /** Returns intents for vehicle v (car spec v.car). */
    drive(v) {
      let best = Infinity;
      for (let q = s - 5; q < s + 25; q += 0.5) {
        const p = pointAt(path, cum, q);
        const d = Math.hypot(p.x - v.x, p.z - v.z);
        if (d < best) { best = d; s = q; }
      }
      const speed = Math.max(0, v.speed);
      const look = Math.max(7, speed * 0.45);
      const tgt = pointAt(path, cum, s + look);
      const err = wrap(Math.atan2(-(tgt.x - v.x), -(tgt.z - v.z)) - v.heading);

      // Braking: the slowest "corner speed reachable by braking" ahead.
      const c = v.car;
      const mu = c.tyres[surfaceAt(v.x, v.z)] ?? 1;
      // Downhill eats into braking: subtract the slope's share of gravity.
      let downhill = 0;
      if (heightAt) {
        const p0 = pointAt(path, cum, s), p1 = pointAt(path, cum, s + 15);
        downhill = Math.max(0, (heightAt(p0.x, p0.z) - heightAt(p1.x, p1.z)) / 15);
      }
      const aBrake = Math.max(1.5, Math.min(c.brakeG, mu) * G * 0.6 - downhill * G);
      const horizon = speed * speed / (2 * aBrake) + 25;
      const react = speed * 0.4; // metres lost before braking bites (bumps, airtime)
      let allowed = Infinity;
      for (let d = 0; d < horizon; d += 3) {
        const vc = Math.min(cornerSpeed(c, s + d), crestSpeed(c, s + d));
        allowed = Math.min(allowed, Math.sqrt(vc * vc + 2 * aBrake * Math.max(0, d - react)));
      }
      const tooFast = speed > allowed;

      // Stuck against something: back out with opposite lock for a second.
      stuckFor = Math.abs(v.speed) < 0.5 ? stuckFor + 1 / 60 : 0;
      if (stuckFor > 1.2) { reverseFor = 1; stuckFor = 0; }
      if (reverseFor > 0) {
        reverseFor -= 1 / 60;
        return { throttle: 0, brake: 1, steer: -Math.sign(err) || 1, handbrake: 0 };
      }
      return {
        throttle: tooFast ? 0 : Math.abs(err) > 0.6 ? 0.3 : 1,
        brake: tooFast ? Math.min(1, (speed - allowed) / 3 + 0.3) : 0,
        steer: Math.max(-1, Math.min(1, err * 2.2)),
        handbrake: 0,
      };
    },
  };
}
