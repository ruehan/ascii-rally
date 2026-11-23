/**
 * Synthesised car audio (no sample files):
 *   engine — saw + square through a low-pass, pitch from fake gears/rpm;
 *            a short torque cut + clunk on upshifts, a blip on downshifts
 *   tyres  — filtered noise, colour depends on the surface; louder when
 *            the car slides on loose ground (scrub)
 *   squeal — narrow band of noise on hard surfaces when sliding or braking hard
 *   wind   — high-passed noise growing with speed²
 *   one-shots — landing thump, impact, countdown beeps
 *
 * Browsers only allow audio after a user gesture, so call `unlock()` from
 * the first key/pointer event. Everything is a no-op until then.
 */

const SURFACE_NOISE = {
  //          filter type    freq   Q    gain per m/s
  gravel:  ['bandpass', 2600, 0.8, 0.010],
  dirt:    ['bandpass', 1400, 0.7, 0.010],
  grass:   ['lowpass', 700, 0.7, 0.008],
  sand:    ['lowpass', 900, 0.7, 0.010],
  cobble:  ['bandpass', 520, 1.2, 0.012],
  asphalt: ['lowpass', 380, 0.7, 0.004],
  kerb:    ['bandpass', 300, 2, 0.012],
  pad:     ['lowpass', 450, 0.7, 0.004],
  snow:    ['lowpass', 1300, 0.6, 0.008],  // soft crunch
  ice:     ['highpass', 3500, 0.7, 0.002], // thin hiss
  dune:    ['lowpass', 520, 0.6, 0.012],   // deep sandy rumble
};
// Surfaces tyres can squeal on (rubber on a hard, grippy top).
const HARD = new Set(['asphalt', 'kerb', 'pad', 'cobble']);
// Loose surfaces get extra scrub noise while sliding.
const LOOSE = new Set(['gravel', 'dirt', 'grass', 'sand', 'snow', 'dune']);

export function createAudio() {
  let ctx = null;
  let master, engineGain, engineFilter, osc1, osc2, noiseGain, noiseFilter, cobbleLfo, cobbleDepth;
  let squealGain, squealFilter, windGain;
  let lastGear = 0, shiftCut = 0;
  let muted = false;
  let rpm = 1000;

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(ctx.destination);

    // Engine.
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.Q.value = 4;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2 = ctx.createOscillator();
    osc2.type = 'square';
    const o2g = ctx.createGain();
    o2g.gain.value = 0.5;
    osc1.connect(engineFilter);
    osc2.connect(o2g).connect(engineFilter);
    engineFilter.connect(engineGain).connect(master);
    osc1.start();
    osc2.start();

    // Tyre noise: looping white noise through a surface-dependent filter.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    noiseFilter = ctx.createBiquadFilter();
    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    // Cobble rumble: tremolo on the tyre noise.
    cobbleLfo = ctx.createOscillator();
    cobbleLfo.frequency.value = 14;
    cobbleDepth = ctx.createGain();
    cobbleDepth.gain.value = 0;
    cobbleLfo.connect(cobbleDepth).connect(noiseGain.gain);
    cobbleLfo.start();
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start();

    // Squeal: the same noise through a narrow resonant band, wobbling a bit.
    squealFilter = ctx.createBiquadFilter();
    squealFilter.type = 'bandpass';
    squealFilter.frequency.value = 1150;
    squealFilter.Q.value = 9;
    squealGain = ctx.createGain();
    squealGain.gain.value = 0;
    noise.connect(squealFilter).connect(squealGain).connect(master);

    // Wind: high-passed noise.
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'highpass';
    windFilter.frequency.value = 1800;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter).connect(windGain).connect(master);
  }

  const ramp = (param, value, t = 0.08) => param.setTargetAtTime(value, ctx.currentTime, t);

  function oneShot(type, f0, f1, dur, gain) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(f1, ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.05);
  }

  return {
    unlock() {
      if (!ctx) build();
      if (ctx.state === 'suspended') ctx.resume();
    },

    setMuted(m) {
      muted = !!m;
      if (ctx) ramp(master.gain, muted ? 0 : 0.35, 0.05);
    },

    toggleMute() {
      muted = !muted;
      if (ctx) ramp(master.gain, muted ? 0 : 0.35, 0.05);
      return muted;
    },

    /** Call every frame. throttle 0..1. Engine character comes from v.car.audio. */
    update(dt, v, throttle) {
      if (!ctx) return;
      const a = v.car.audio;
      const vmax = v.car.vmax / 3.6;
      const speed = Math.abs(v.speed);
      // Gears spaced up to top speed; rpm sweeps from ~60% to redline in each.
      const gearSpan = vmax / a.gears;
      const gear = Math.min(a.gears - 1, Math.floor(speed / gearSpan));
      const inGear = (speed - gear * gearSpan) / gearSpan;
      // Gear changes: upshift = brief torque cut + clunk, downshift = blip.
      if (gear !== lastGear && speed > 2) {
        if (gear > lastGear && throttle > 0.3) { shiftCut = 0.09; oneShot('square', 95, 55, 0.07, 0.05); }
        else if (gear < lastGear) rpm = Math.min(a.redline, rpm * 1.18);
      }
      lastGear = gear;
      shiftCut = Math.max(0, shiftCut - dt);
      const low = gear === 0 ? a.idle : a.redline * 0.62;
      let target = low + (a.redline - low) * inGear;
      if (speed < 0.5) target = a.idle + throttle * (a.redline - a.idle) * 0.4; // revving on the spot
      if (v.airborne) target += (a.redline - target) * 0.5 * throttle;          // wheels spin free
      rpm += (Math.min(a.redline, target) - rpm) * Math.min(1, dt * 8);

      const f = (rpm / 60) * (a.cyl / 2); // firing frequency
      ramp(osc1.frequency, f, 0.03);
      ramp(osc2.frequency, f / 2, 0.03);
      ramp(engineFilter.frequency, 500 + throttle * 1800 + rpm * 0.15, 0.05);
      ramp(engineGain.gain, shiftCut > 0 ? 0.05 : 0.10 + throttle * 0.16, shiftCut > 0 ? 0.01 : 0.08);

      const [type, freq, q, k] = SURFACE_NOISE[v.surface] ?? SURFACE_NOISE.grass;
      if (noiseFilter.type !== type) noiseFilter.type = type;
      ramp(noiseFilter.frequency, freq, 0.1);
      noiseFilter.Q.value = q;
      const slide = Math.abs(v.slip ?? 0);
      const scrub = LOOSE.has(v.surface) ? 1 + Math.min(1.5, slide / 3) : 1;
      const tyres = v.airborne ? 0 : Math.min(0.45, speed * k * 2 * scrub);
      ramp(noiseGain.gain, tyres, 0.08);

      // Squeal: sliding, or hard braking at speed (ABS chatter), on hard ground.
      let squeal = 0;
      if (!v.airborne && HARD.has(v.surface) && speed > 4) {
        squeal = Math.min(1, Math.max(0, (slide - 1.2) / 4));
        if ((v.brkIn ?? 0) > 0.6 && speed > 12) squeal = Math.max(squeal, 0.35 * v.brkIn);
      }
      ramp(squealGain.gain, squeal * 0.16, 0.05);
      ramp(squealFilter.frequency, 1050 + slide * 25 + Math.sin(performance.now() / 70) * 60, 0.03);

      ramp(windGain.gain, Math.min(0.12, (speed / 90) ** 2 * 0.12), 0.2);
      cobbleDepth.gain.value = v.surface === 'cobble' ? tyres * 0.8 : 0;
      cobbleLfo.frequency.value = 6 + speed * 1.2;
    },

    land(impact) { oneShot('sine', 110, 38, 0.3, Math.min(0.9, impact / 10)); },
    hit(amount) { oneShot('triangle', 160, 50, 0.18, Math.min(0.8, amount / 12)); },
    splash() { oneShot('sine', 600, 120, 0.5, 0.25); },
    beep(go = false) { oneShot('square', go ? 1320 : 660, go ? 1320 : 660, go ? 0.45 : 0.18, 0.12); },
  };
}
