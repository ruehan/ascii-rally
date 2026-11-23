/**
 * Car classes with real-world-ish specs (public figures for each class;
 * no brands). Physics reads these directly — see physics/arcade.js.
 *
 *   power     kW at the wheels (peak)          mass   kg
 *   cda       drag area Cd·A (m²)              cla    downforce area Cl·A (m²)
 *   vmax      top speed, km/h (gear limited)    drive  share of weight on driven wheels (1 = AWD)
 *   wheelbase m                                 steer  max steering angle (rad) at low speed
 *   brakeG    max braking decel from the brakes alone (g); tyres may limit it
 *   tyres     friction coefficient μ per surface
 *   offroad   extra rolling drag on loose surfaces (low cars bottom out)
 *   radius    collision radius (m)
 *   cgh       centre-of-gravity height (m): weight transfer under braking/accel
 *   soft      body pitch/roll per g of acceleration (rad): suspension softness
 *   engineBrake  off-throttle drivetrain drag (g)
 *   audio     { cyl, idle, redline, gears }
 *
 *   klass / note  text: plain or { en, ko }
 *
 * Reference numbers (for the spec sheet), roughly:
 *   RALLY    Rally1 class: ~500 hp hybrid, 1260 kg, AWD, ~200 km/h gearing
 *   FORMULA  current F1: ~1000 hp, 798 kg, RWD, ~350 km/h, ~5 g peak cornering with aero
 *   HYPERCAR LMH class: 500 kW cap, 1030 kg, ~340 km/h
 *   GT       GT3 class: ~550 hp, 1300 kg, ~290 km/h
 *   TRAIL    classic 4x4: ~135 hp, 1800 kg, ~140 km/h
 */
export const CARS = {
  rally: {
    name: 'RALLY', klass: { en: 'Rally1-class hatch', ko: 'Rally1급 해치백' },
    power: 373, mass: 1260, cda: 0.75, cla: 0.6, vmax: 200, drive: 1,
    wheelbase: 2.6, steer: 0.55, brakeG: 1.6, radius: 1.3, cgh: 0.45, soft: 0.035, engineBrake: 0.12,
    tyres: { gravel: 1.0, dirt: 1.0, grass: 0.75, sand: 0.65, cobble: 1.0, asphalt: 1.1, kerb: 1.0, pad: 1.05, snow: 0.62, ice: 0.35, dune: 0.55 },
    offroad: 0,
    audio: { cyl: 4, idle: 1000, redline: 7500, gears: 6 },
    zeroTo100: 3.0, note: { en: 'All-rounder. Loves gravel; drifts on loose stuff.', ko: '만능형. 자갈을 좋아하고 느슨한 노면에서 드리프트.' },
  },
  formula: {
    name: 'FORMULA', klass: { en: 'F1-class single-seater', ko: 'F1급 싱글시터' },
    power: 750, mass: 798, cda: 1.3, cla: 5.0, vmax: 350, drive: 0.56,
    wheelbase: 3.6, steer: 0.44, brakeG: 2.2, radius: 1.4, cgh: 0.28, soft: 0.006, engineBrake: 0.2,
    tyres: { gravel: 0.45, dirt: 0.4, grass: 0.35, sand: 0.25, cobble: 0.9, asphalt: 1.75, kerb: 1.5, pad: 1.3, snow: 0.18, ice: 0.08, dune: 0.2 },
    offroad: 0.07,
    audio: { cyl: 6, idle: 4000, redline: 12500, gears: 8 },
    zeroTo100: 2.6, note: { en: 'Slicks + huge downforce. Unreal on tarmac, helpless on gravel.', ko: '슬릭 + 거대한 다운포스. 포장도로에선 비현실적, 자갈에선 무력.' },
  },
  hypercar: {
    name: 'HYPERCAR', klass: { en: 'LMH-class prototype', ko: 'LMH급 프로토타입' },
    power: 500, mass: 1030, cda: 1.0, cla: 3.2, vmax: 340, drive: 0.58,
    wheelbase: 3.1, steer: 0.42, brakeG: 2.0, radius: 1.5, cgh: 0.32, soft: 0.01, engineBrake: 0.15,
    tyres: { gravel: 0.5, dirt: 0.45, grass: 0.4, sand: 0.3, cobble: 0.95, asphalt: 1.6, kerb: 1.4, pad: 1.25, snow: 0.2, ice: 0.1, dune: 0.22 },
    offroad: 0.07,
    audio: { cyl: 6, idle: 2500, redline: 9000, gears: 7 },
    zeroTo100: 2.8, note: { en: 'Endurance prototype. Stable at speed, long and low.', ko: '내구 레이스 프로토타입. 고속 안정, 길고 낮음.' },
  },
  gt: {
    name: 'GT', klass: { en: 'GT3-class coupé', ko: 'GT3급 쿠페' },
    power: 410, mass: 1300, cda: 0.85, cla: 1.6, vmax: 290, drive: 0.52,
    wheelbase: 2.7, steer: 0.48, brakeG: 1.8, radius: 1.4, cgh: 0.42, soft: 0.02, engineBrake: 0.12,
    tyres: { gravel: 0.6, dirt: 0.55, grass: 0.5, sand: 0.4, cobble: 1.0, asphalt: 1.45, kerb: 1.3, pad: 1.2, snow: 0.26, ice: 0.12, dune: 0.3 },
    offroad: 0.05,
    audio: { cyl: 8, idle: 1100, redline: 9000, gears: 6 },
    zeroTo100: 3.5, note: { en: 'Front-engined racer. Forgiving, loud, a bit heavy.', ko: '프론트 엔진 레이서. 관대하고 시끄럽고 조금 무거움.' },
  },
  trail: {
    name: 'TRAIL', klass: { en: 'classic 4x4', ko: '클래식 4x4' },
    power: 80, mass: 1800, cda: 1.8, cla: 0, vmax: 140, drive: 1,
    wheelbase: 2.6, steer: 0.6, brakeG: 0.9, radius: 1.4, cgh: 0.8, soft: 0.07, engineBrake: 0.08,
    tyres: { gravel: 0.85, dirt: 0.9, grass: 0.85, sand: 0.8, cobble: 0.85, asphalt: 0.85, kerb: 0.85, pad: 0.85, snow: 0.6, ice: 0.3, dune: 0.75 },
    offroad: 0,
    audio: { cyl: 6, idle: 700, redline: 4800, gears: 5 },
    zeroTo100: 11, note: { en: 'Slow, tall, goes anywhere. Sunday drive.', ko: '느리고 높고 어디든 감. 일요일 드라이브.' },
  },
};

export const CAR_ORDER = ['rally', 'formula', 'hypercar', 'gt', 'trail'];
export const DEFAULT_CAR = 'rally';
