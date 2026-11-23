const EXIT_PAD = 2;       // hysteresis (m)
const OPEN_DWELL = 0.8;  // stopped this long on a pad opens its panel

/**
 * Zone pads: enter/exit with hysteresis, and auto-open after the car has
 * been stopped on the pad for a moment. Opens at most once per visit so a
 * closed panel doesn't pop straight back up.
 *
 * Events: zone:enter, zone:exit, zone:open  — payload { zone }
 */
export function createZoneSystem({ zones, bus }) {
  let current = null;
  let dwell = 0;
  let opened = false;
  let skip = false; // suppress the next auto-open (e.g. the spawn pad on return visits)

  function update(dt, v) {
    if (current) {
      const d = Math.hypot(v.x - current.pos[0], v.z - current.pos[1]);
      if (d > current.r + EXIT_PAD) {
        bus.emit('zone:exit', { zone: current });
        current = null;
      }
    }
    if (!current) {
      current = zones.find(z => Math.hypot(v.x - z.pos[0], v.z - z.pos[1]) < z.r) ?? null;
      if (!current) return;
      dwell = 0;
      opened = skip;
      skip = false;
      bus.emit('zone:enter', { zone: current });
    }
    dwell = Math.abs(v.speed) > 0.5 ? 0 : dwell + dt;
    if (!opened && dwell >= OPEN_DWELL) open();
  }

  function open() {
    if (!current) return false;
    opened = true;
    bus.emit('zone:open', { zone: current });
    return true;
  }

  return {
    update, open,
    /** Don't auto-open the next zone entered (E still opens it). */
    skipAutoOpen() { if (current) opened = true; else skip = true; },
    get current() { return current; },
  };
}
