import * as THREE from 'three';

/**
 * Time-of-day keyframes (hour → look). Interpolated linearly, wrapping at 24.
 * Night keeps the ASCII readable by raising exposure and a luminance floor,
 * and switches the headlights on.
 */
const K = (hour, elev, sun, sunI, sky, ground, hemiI, fog, exposure, floor, pastel, edgeGain, lights) =>
  ({ hour, elev, sun, sunI, sky, ground, hemiI, fog, exposure, floor, pastel, edgeGain, lights });

const KEYS = [
  K(0, -40, '#8fa6d6', 0.0, '#1a2540', '#0a0c10', 0.22, '#05070c', 2.3, 0.05, 0.10, 0.55, 1),
  K(4.5, -12, '#8fa6d6', 0.0, '#24305a', '#0f1012', 0.35, '#080a12', 2.0, 0.05, 0.12, 0.65, 1),
  K(6, 2, '#ff9a5a', 0.9, '#7f8fc0', '#3a2a22', 0.75, '#15100d', 1.6, 0.04, 0.22, 0.85, 0.6),
  K(8, 20, '#ffd9a8', 2.2, '#c6d8ff', '#5a4a36', 1.3, '#121612', 1.3, 0.03, 0.28, 1, 0),
  K(13, 62, '#fff6e8', 2.9, '#e0ecff', '#5a4a36', 1.6, '#121612', 1.2, 0.03, 0.30, 1, 0),
  K(15, 45, '#fff1d6', 2.8, '#d6e6ff', '#5a4a36', 1.5, '#121612', 1.25, 0.03, 0.30, 1, 0),
  K(17.5, 18, '#ffcf8a', 2.4, '#d8c8ff', '#5a4030', 1.25, '#18120e', 1.3, 0.03, 0.30, 1, 0),
  K(19, 3, '#ff6a3a', 1.4, '#8a5ea0', '#3a2420', 0.75, '#160b08', 1.6, 0.04, 0.22, 0.85, 0.6),
  K(20.5, -10, '#8fa6d6', 0.0, '#2e2a50', '#120c0c', 0.4, '#07060c', 2.0, 0.05, 0.14, 0.65, 1),
  K(24, -40, '#8fa6d6', 0.0, '#1a2540', '#0a0c10', 0.22, '#05070c', 2.3, 0.05, 0.10, 0.55, 1),
];

const COLOR_KEYS = ['sun', 'sky', 'ground', 'fog'];
const _a = new THREE.Color(), _b = new THREE.Color();

/** Look at a given hour (0..24). Colours come back as THREE.Color. */
export function sampleTime(hour) {
  hour = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].hour <= hour) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = (hour - a.hour) / (b.hour - a.hour);
  const out = { hour };
  for (const k of Object.keys(a)) {
    if (k === 'hour') continue;
    if (COLOR_KEYS.includes(k)) out[k] = new THREE.Color().copy(_a.set(a[k])).lerp(_b.set(b[k]), t);
    else out[k] = a[k] + (b[k] - a[k]) * t;
  }
  // Sun path: rises in the east (+x) at 6h, south (+z) at noon, sets west at 18h.
  const az = ((hour - 6) / 12) * Math.PI;
  const e = THREE.MathUtils.degToRad(Math.max(out.elev, 4)); // keep a usable shadow angle near the horizon
  out.sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(e), Math.sin(e), Math.sin(az) * Math.cos(e)).normalize();
  out.night = out.elev < 0;
  return out;
}
