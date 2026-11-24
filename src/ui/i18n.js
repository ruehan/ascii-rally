/**
 * UI language (English / Korean). `t(key, params)` looks a string up in the
 * current language (falling back to English); `L(value)` picks the current
 * language from a `{ en, ko }` pair and passes anything else through, so
 * content can be written either way.
 *
 * The choice persists per browser; the first visit follows the browser's
 * language. Press L in-game to switch.
 */
const KEY = 'stage~/lang';
export const LANGS = ['en', 'ko'];

let lang = (() => {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGS.includes(saved)) return saved;
  } catch { /* storage unavailable */ }
  return typeof navigator !== 'undefined' && /^ko\b/i.test(navigator.language ?? '') ? 'ko' : 'en';
})();
const listeners = new Set();

export const i18n = {
  get lang() { return lang; },
  set(next) {
    if (!LANGS.includes(next) || next === lang) return;
    lang = next;
    try { localStorage.setItem(KEY, lang); } catch { /* not persisted */ }
    for (const fn of listeners) fn(lang);
  },
  toggle() { this.set(lang === 'en' ? 'ko' : 'en'); return lang; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

/** Picks the current language from `{ en, ko }`; other values pass through. */
export function L(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && ('en' in v || 'ko' in v)) return v[lang] ?? v.en;
  return v;
}

/** Zone name in the current language (English: the zone's own title). */
export function zoneName(zone) {
  return (lang === 'ko' && STR.ko[`zone.${zone.id}`]) || zone.title.toLowerCase();
}

/** Translated UI string; values may be functions of `params`. */
export function t(key, params = {}) {
  const s = STR[lang][key] ?? STR.en[key];
  if (s === undefined) return key;
  return typeof s === 'function' ? s(params) : s;
}

const STR = {
  en: {
    help: 'WASD/arrows drive · Space handbrake · Q car · E open · M map · Esc close · R paddock\nV camera · T time · N sound · C colour · G outlines · +/- glyph size · L 한국어 · H help · O settings',
    close: '[Esc] close',
    'note.camera': ({ mode }) => `> camera: ${mode === 'chase' ? 'chase' : 'north-up'}`,
    'note.sound': ({ on }) => `> sound: ${on ? 'on' : 'off'}`,
    'note.time': ({ i }) => `> time: ${['afternoon', 'sunset', 'night', 'dawn'][i]}`,
    'note.time24': '> 24H running — the clock is the race',
    'note.nav': ({ name, dist, clock }) => `> ${name} · ${dist}m · ${clock} o'clock`,
    'note.travel': ({ label }) => `> travelled to ${label}`,
    'note.lang': '> language: English',
    'note.edges': ({ on }) => `> outlines: ${on ? 'on' : 'off'}`,
    'note.car': ({ name, klass }) => `> car: ${name} · ${klass}`,
    'note.armed': ({ name, title }) => `> ${name} armed · ${title}`,
    'note.jump': '! jump start +5.0',
    'note.split': ({ i, time, delta, missed }) => `> split ${i}  ${time}${delta}${missed ? '  missed +10' : ''}`,
    'note.finish': ({ time }) => `> finish ${time}`,
    'note.abort': ({ name, reason }) => `> ${name} aborted · ${reason}`,
    'reason.off route': 'off route',
    'reason.reset': 'reset',
    'loop.start': '> 24H · green flag · 15:00',
    'loop.finish': '> 24H · chequered flag',
    'loop.pause': '> 24H · session paused (off route)',
    'loop.card': '24H · finished',
    'loop.cardText': 'Round the clock — and back to now.',
    'prompt.box': ({ name }) => `<b>${name}</b> stop in the box to start`,
    'prompt.open': ({ name }) => `<b>[E]</b> open ${name}`,
    'prompt.slicks': ({ surface }) => `slicks on ${surface} — <b>[Q]</b> try RALLY or TRAIL`,
    'nav.start': ({ name }) => `${name} start`,
    'hq.title': '$ git log --stages',
    'hq.intro': ({ car }) => `Stage times on this browser for <b>${car}</b>. Beat the owner's targets.`,
    'log.target': 'target',
    'log.owner': 'owner',
    'log.noTarget': 'no owner target for this car',
    'result.beat': ({ d, car }) => `▼ ${d} — beat the owner (${car})`,
    'result.behind': ({ d, car }) => `▲ +${d} vs owner (${car})`,
    'result.best': ' · NEW BEST',
    'result.penalty': ({ p }) => ` · penalty +${p}`,
    'result.project': 'PROJECT',
    'result.career': 'CAREER',
    'result.k.company': 'COMPANY', 'result.k.period': 'PERIOD', 'result.k.field': 'FIELD',
    'result.times': 'TIMES',
    'result.k.title': 'TITLE', 'result.k.year': 'YEAR', 'result.k.role': 'ROLE', 'result.k.stack': 'STACK',
    'fun.summary': 'Fun stage — no project here, just the road.',
    'garage.cars': 'CARS',
    'garage.cycle': '(Q cycles anywhere)',
    'garage.downforce': 'downforce',
    'garage.none': 'none',
    'garage.tyres': 'tyres',
    'garage.tarmac': 'tarmac', 'garage.gravel': 'gravel', 'garage.grass': 'grass',
    'map.title': '$ map --travel',
    'map.places': 'places',
    'map.stages': 'stages',
    'map.foot': 'click or press its key · [M]/[Esc] close',
    'place.paddock': 'paddock', 'place.hq': 'rally hq', 'place.garage': 'garage', 'place.pitwall': 'pit wall',
    'place.24h': '24H gate', 'place.lookout': 'lookout',
    'set.title': 'settings',
    'set.lang': 'language', 'set.sound': 'sound', 'set.glyph': 'glyph size', 'set.colour': 'colour',
    'set.edges': 'outlines', 'set.camera': 'camera', 'set.quality': 'quality', 'set.help': 'controls',
    'set.on': 'on', 'set.off': 'off',
    'set.camera.chase': 'chase', 'set.camera.top': 'north-up',
    'set.quality.auto': 'auto', 'set.quality.high': 'high', 'set.quality.medium': 'medium', 'set.quality.low': 'low',
    'set.help.toggle': 'show / hide',
    'set.foot': '↑↓ choose · ←→ change · [O]/[Esc] close',
    'note.quality': ({ tier }) => `> quality: ${tier} (auto)`,
    'boot.title': "A developer's rally season, drawn in text.",
    'boot.drive': 'WASD / arrows drive · Space handbrake',
    'boot.explore': 'Stop on a pad (or press E) to open it · M map · O settings',
    'boot.start': '[Enter] or click to start',
    'boot.lang': 'language',
    'surf.gravel': 'gravel', 'surf.dirt': 'dirt', 'surf.grass': 'grass', 'surf.sand': 'sand', 'surf.cobble': 'cobbles',
    'surf.asphalt': 'tarmac', 'surf.kerb': 'kerb', 'surf.pad': 'pad', 'surf.snow': 'snow', 'surf.ice': 'ice', 'surf.dune': 'dunes',
  },
  ko: {
    help: 'WASD/방향키 운전 · Space 핸드브레이크 · Q 차량 · E 열기 · M 지도 · Esc 닫기 · R 출발점\nV 카메라 · T 시간대 · N 소리 · C 컬러 · G 윤곽선 · +/- 글자 크기 · L English · H 도움말 · O 설정',
    close: '[Esc] 닫기',
    'note.camera': ({ mode }) => `> 카메라: ${mode === 'chase' ? '추격' : '북쪽 고정'}`,
    'note.sound': ({ on }) => `> 소리: ${on ? '켜짐' : '꺼짐'}`,
    'note.time': ({ i }) => `> 시간대: ${['오후', '해질녘', '밤', '새벽'][i]}`,
    'note.time24': '> 24H 진행 중 — 시계가 곧 레이스',
    'note.nav': ({ name, dist, clock }) => `> ${name} · ${dist}m · ${clock}시 방향`,
    'note.travel': ({ label }) => `> ${label}(으)로 이동`,
    'note.lang': '> 언어: 한국어',
    'note.edges': ({ on }) => `> 윤곽선: ${on ? '켜짐' : '꺼짐'}`,
    'note.car': ({ name, klass }) => `> 차량: ${name} · ${klass}`,
    'note.armed': ({ name, title }) => `> ${name} 준비 · ${title}`,
    'note.jump': '! 부정 출발 +5.0',
    'note.split': ({ i, time, delta, missed }) => `> 구간 ${i}  ${time}${delta}${missed ? '  놓침 +10' : ''}`,
    'note.finish': ({ time }) => `> 피니시 ${time}`,
    'note.abort': ({ name, reason }) => `> ${name} 중단 · ${reason}`,
    'reason.off route': '코스 이탈',
    'reason.reset': '리셋',
    'loop.start': '> 24H · 그린 플래그 · 15:00',
    'loop.finish': '> 24H · 체커기',
    'loop.pause': '> 24H · 세션 일시정지 (코스 이탈)',
    'loop.card': '24H · 완주',
    'loop.cardText': '하루를 돌아 — 다시 지금으로.',
    'prompt.box': ({ name }) => `<b>${name}</b> 출발 박스에 멈추면 시작`,
    'prompt.open': ({ name }) => `<b>[E]</b> ${name} 열기`,
    'prompt.slicks': ({ surface }) => `${surface}에 슬릭 타이어 — <b>[Q]</b> RALLY나 TRAIL로 바꿔보세요`,
    'nav.start': ({ name }) => `${name} 출발`,
    'hq.title': '$ git log --stages',
    'hq.intro': ({ car }) => `이 브라우저의 <b>${car}</b> 스테이지 기록. 오너 기록을 깨보세요.`,
    'log.target': '목표',
    'log.owner': '오너',
    'log.noTarget': '이 차량의 오너 기록 없음',
    'result.beat': ({ d, car }) => `▼ ${d} — 오너 기록 경신 (${car})`,
    'result.behind': ({ d, car }) => `▲ +${d} 오너 대비 (${car})`,
    'result.best': ' · 신기록',
    'result.penalty': ({ p }) => ` · 페널티 +${p}`,
    'result.project': '프로젝트',
    'result.career': '경력',
    'result.k.company': '회사', 'result.k.period': '기간', 'result.k.field': '분야',
    'result.times': '기록',
    'result.k.title': '제목', 'result.k.year': '연도', 'result.k.role': '역할', 'result.k.stack': '기술',
    'fun.summary': '즐기는 스테이지 — 프로젝트 없이 길만 있어요.',
    'garage.cars': '차량',
    'garage.cycle': '(어디서든 Q로 변경)',
    'garage.downforce': '다운포스',
    'garage.none': '없음',
    'garage.tyres': '타이어 접지',
    'garage.tarmac': '포장', 'garage.gravel': '자갈', 'garage.grass': '잔디',
    'map.title': '$ map --travel',
    'map.places': '장소',
    'map.stages': '스테이지',
    'map.foot': '클릭하거나 키를 누르세요 · [M]/[Esc] 닫기',
    'place.paddock': '패독', 'place.hq': '랠리 본부', 'place.garage': '차고', 'place.pitwall': '피트월',
    'place.24h': '24H 게이트', 'place.lookout': '전망대',
    'surf.gravel': '자갈', 'surf.dirt': '흙길', 'surf.grass': '잔디', 'surf.sand': '모래', 'surf.cobble': '돌길',
    'surf.asphalt': '포장도로', 'surf.kerb': '연석', 'surf.pad': '광장', 'surf.snow': '눈길', 'surf.ice': '빙판', 'surf.dune': '사구',
    'set.title': '설정',
    'set.lang': '언어', 'set.sound': '소리', 'set.glyph': '글자 크기', 'set.colour': '컬러',
    'set.edges': '윤곽선', 'set.camera': '카메라', 'set.quality': '화질', 'set.help': '조작법',
    'set.on': '켜기', 'set.off': '끄기',
    'set.camera.chase': '추격', 'set.camera.top': '북쪽 고정',
    'set.quality.auto': '자동', 'set.quality.high': '높음', 'set.quality.medium': '중간', 'set.quality.low': '낮음',
    'set.help.toggle': '보이기 / 숨기기',
    'set.foot': '↑↓ 선택 · ←→ 변경 · [O]/[Esc] 닫기',
    'note.quality': ({ tier }) => `> 화질: ${({ high: '높음', medium: '중간', low: '낮음' })[tier]} (자동)`,
    'boot.title': '개발자의 랠리 시즌, 글자로 그린 세계.',
    'boot.drive': 'WASD / 방향키 운전 · Space 핸드브레이크',
    'boot.explore': '패드에 멈추면(또는 E) 열려요 · M 지도 · O 설정',
    'boot.start': '[Enter] 또는 클릭해서 시작',
    'boot.lang': '언어',
    'zone.bivouac': '비박지', 'zone.paddock': '패독', 'zone.garage': '차고', 'zone.pitwall': '피트월', 'zone.piazza': '랠리 본부',
    'zone.lookout': '전망대', 'zone.skidpad': '스키드패드', 'zone.roadhouse': '휴게소', 'zone.lighthouse': '등대',
    'zone.cantina': '와이너리', 'zone.race-control': '레이스 컨트롤', 'zone.refuge': '산장', 'zone.col': '고개', 'zone.summit': '정상',
  },
};

/** Korean rally pace-note words (the corner codes like R4 / L3 stay as they are). */
const PACE_KO = [[' over crest ! jump', ' 크레스트 넘어 ! 점프'], ['crest ! jump', '크레스트 ! 점프'], [' long', ' 길게'], [' into', ' 이어서']];
export function paceNote(text) {
  if (lang !== 'ko') return text;
  let s = text;
  for (const [a, b] of PACE_KO) s = s.split(a).join(b);
  return s;
}
