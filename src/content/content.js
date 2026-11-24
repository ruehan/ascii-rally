/**
 * Portfolio content — the one file to edit.
 *
 * Text can be a plain string (same in both languages) or `{ en, ko }`.
 * Everything marked TODO is a placeholder. Panels are plain data:
 *   { title, lines: [ text | { k, v } | { h } | { link, href } ] }
 *   - text       a paragraph line
 *   - { h }      a section heading
 *   - { k, v }   a key/value row (setup sheet style)
 *   - { link, href } a link
 */

export const owner = {
  name: 'TODO Your Name',
  handle: 'guest',
  role: { en: 'Software developer', ko: '소프트웨어 개발자' },
};

const todo = { en: 'TODO', ko: 'TODO' };
const todoSummary = { en: 'TODO: one or two sentences about what it is and why it matters.', ko: 'TODO: 무엇이고 왜 중요한지 한두 문장.' };

/** Projects shown at the end of each special stage (ids used in map.js stages). */
export const projects = {
  p1: {
    title: 'stage ~/',
    year: '2026',
    role: { en: 'Design + development', ko: '디자인 + 개발' },
    stack: 'Three.js · GLSL · Vite',
    summary: [
      { en: 'This site. A drivable portfolio rendered entirely as ASCII:', ko: '이 사이트. 전부 아스키 문자로 그려지는 운전형 포트폴리오:' },
      { en: 'a GPU shader turns a 3D world into glyphs, with edge characters,', ko: 'GPU 셰이더가 3D 월드를 문자로 바꾸고, 윤곽 문자와' },
      { en: 'per-material charsets and contour lines on the terrain.', ko: '재질별 문자 세트, 지형 등고선을 그립니다.' },
    ],
    links: [{ link: { en: 'source', ko: '소스' }, href: '#' }],
  },
  p2: { title: 'TODO project two', year: 'TODO', role: todo, stack: 'TODO', summary: [todoSummary], links: [] },
  p3: { title: 'TODO project three', year: 'TODO', role: todo, stack: 'TODO', summary: [todoSummary], links: [] },
  p4: { title: 'TODO project four', year: 'TODO', role: todo, stack: 'TODO', summary: ['TODO'], links: [] },
  p5: { title: 'TODO project five', year: 'TODO', role: todo, stack: 'TODO', summary: ['TODO'], links: [] },
  p6: { title: 'TODO project six', year: 'TODO', role: todo, stack: 'TODO', summary: ['TODO'], links: [] },
};

/**
 * Careers: each has its own region and stage in the world (stage config
 * `career: '<id>'`); finishing the stage shows this card. Text is plain or
 * { en, ko }.
 */
export const careers = {
  keti: {
    company: { en: 'Korea Electronics Technology Institute (KETI)', ko: '한국전자기술연구원(KETI)' },
    short: 'KETI',
    role: { en: 'Researcher', ko: '연구원' },
    period: '2021.10 – 2023.03',
    field: { en: 'Healthcare · wearable watch', ko: '헬스케어 · 웨어러블 워치' },
    summary: [
      { en: 'Research and development on a healthcare wearable (watch).', ko: '헬스케어 웨어러블(워치) 연구 개발.' },
      { en: 'TODO: what you built, measured or shipped.', ko: 'TODO: 만든 것, 측정한 것, 성과.' },
    ],
    stack: 'TODO',
    links: [],
  },
  zeroone: {
    company: { en: 'Zero One Co., Ltd.', ko: '주식회사 제로원' },
    short: { en: 'Zero One', ko: '제로원' },
    role: { en: 'SW Team Lead', ko: 'SW팀장' },
    period: '2025.04 – 2026.10',
    field: { en: 'Food-waste reducers · collection service', ko: '음식물 감량기 · 수거 서비스' },
    summary: [
      { en: 'Built the company\'s overall software system: reducer machines and the collection service.', ko: '감량기와 음식물 수거 서비스를 아우르는 전반적인 시스템 구축.' },
      { en: 'TODO: team, architecture, results.', ko: 'TODO: 팀, 구조, 성과.' },
    ],
    stack: 'TODO',
    links: [],
  },
  moisten: {
    company: { en: 'Moisten Co., Ltd.', ko: '(주)모이스텐' },
    short: { en: 'Moisten', ko: '모이스텐' },
    role: { en: 'Developer (AI & DX System Manager)', ko: '개발자 (AI & DX System Manager)' },
    period: { en: '2026.11 – now', ko: '2026.11 – 현재' },
    field: { en: 'Cosmetics · ODF film', ko: '화장품 · ODF 필름' },
    summary: [
      { en: 'Building company-wide systems and automation (AI & DX).', ko: '전반적인 시스템 구축 및 자동화 (AI & DX).' },
      { en: 'TODO: current focus.', ko: 'TODO: 지금 집중하는 일.' },
    ],
    stack: 'TODO',
    links: [],
  },
};

/**
 * Career milestones along the 24H loop, in order (first = afternoon start,
 * last = back to the paddock next day). `at` (0..1 of the lap) is optional.
 */
export const milestones = [
  { year: 'TODO', title: { en: 'First line of code', ko: '첫 코드 한 줄' }, text: { en: 'TODO: where it started.', ko: 'TODO: 어디서 시작했는지.' } },
  { year: '2021.10', title: { en: 'Researcher · KETI', ko: 'KETI 연구원' }, text: careers.keti.field },
  { year: '2025.04', title: { en: 'SW Team Lead · Zero One', ko: '제로원 SW팀장' }, text: careers.zeroone.field },
  { year: '2026.11', title: { en: 'AI & DX · Moisten', ko: '모이스텐 AI & DX' }, text: careers.moisten.field },
  { year: { en: 'NOW', ko: '지금' }, title: { en: 'Next stage loading', ko: '다음 스테이지 준비 중' }, text: { en: 'Back at the paddock.', ko: '다시 패독으로.' } },
];

/** Zone panels (ids used in map.js zones[].content). */
export const panels = {
  season: {
    title: '$ ./season --start',
    lines: [
      { en: `Welcome to ${owner.name}'s rally season.`, ko: `${owner.name}의 랠리 시즌에 오신 걸 환영합니다.` },
      { en: 'Drive to a pad and stop (or press E) to open it.', ko: '패드로 가서 멈추면(또는 E) 열립니다.' },
      { en: 'H shows the controls · L switches language · M opens the map.', ko: 'H 조작법 보기 · L 언어 바꾸기 · M 지도 열기.' },
      { h: { en: 'CAREER STAGES', ko: '경력 스테이지' } },
      { en: 'Each job has its own region and stage; finish it to open the card.', ko: '경력마다 지역과 스테이지가 있어요. 완주하면 경력 카드가 열립니다.' },
      { k: 'C1 PULSE', v: { en: 'KETI campus — east of the valley, heartbeat road', ko: 'KETI 캠퍼스 — 계곡 동쪽, 심전도 도로' } },
      { k: 'C2 COLLECTION', v: { en: 'Zero One depot — east, five bins to pick up', ko: '제로원 차고지 — 동쪽, 수거함 5곳' } },
      { k: 'C3 FILM LINE', v: { en: 'Moisten plant — south of the vineyards, conveyors', ko: '모이스텐 공장 — 포도밭 남쪽, 컨베이어' } },
      { en: 'Stop in a start box, wait for 3-2-1, drive to the finish.', ko: '출발 박스에 멈추고 3-2-1 뒤 피니시까지 달리세요.' },
      { h: { en: 'SPECIAL STAGES', ko: '스페셜 스테이지' } },
      { en: 'SS1–SS5 home roads · SS6 circuit · SS7–SS10 mountains, snow, desert', ko: 'SS1–SS5 홈 도로 · SS6 서킷 · SS7–SS10 산악·눈길·사막' },
      { en: 'SS11–SS13 coast, the long straight, vineyards', ko: 'SS11–SS13 해안, 롱 스트레이트, 포도밭' },
      { h: { en: '24H = TIMELINE', ko: '24H = 연대기' } },
      { en: 'Start at the 24H gate by the circuit and follow the loop home.', ko: '서킷 옆 24H 게이트에서 출발해 한 바퀴 돌아 집으로.' },
      { en: 'The clock runs from afternoon through the night; milestones line the way.', ko: '오후부터 밤을 지나 시계가 흐르고, 길가에 이정표가 있습니다.' },
      { h: { en: 'ALSO ON THE MAP', ko: '지도에 더 있는 것' } },
      { k: { en: 'LOOKOUT', ko: '전망대' }, v: { en: 'about  — coast headland, north', ko: '소개 — 북쪽 해안 곶' } },
      { k: { en: 'GARAGE', ko: '차고' }, v: { en: 'skills + cars — next to the paddock', ko: '기술 + 차량 — 패독 옆' } },
      { k: { en: 'PIT WALL', ko: '피트월' }, v: { en: 'contact — next to the paddock', ko: '연락처 — 패독 옆' } },
      { k: { en: 'RALLY HQ', ko: '랠리 본부' }, v: { en: 'stage times — old town piazza, east', ko: '스테이지 기록 — 동쪽 구시가지 광장' } },
    ],
  },
  about: {
    title: '$ whoami',
    lines: [
      { k: { en: 'DRIVER', ko: '드라이버' }, v: owner.name },
      { k: { en: 'ROLE', ko: '역할' }, v: owner.role },
      { k: { en: 'BASE', ko: '거점' }, v: { en: 'TODO city', ko: 'TODO 도시' } },
      { h: { en: 'ABOUT', ko: '소개' } },
      { en: 'TODO: a few lines about you — what you build, what you care about.', ko: 'TODO: 무엇을 만들고 무엇을 중요하게 여기는지 몇 줄.' },
      { h: { en: 'OFF THE CLOCK', ko: '쉬는 시간엔' } },
      { en: 'Motorsport: F1, endurance racing, rally, hot hatches.', ko: '모터스포츠: F1, 내구 레이스, 랠리, 핫해치.' },
    ],
  },
  skills: {
    title: '$ cat setup-sheet.txt',
    lines: [
      { h: { en: 'CAR SETUP', ko: '세팅 시트' } },
      { k: { en: 'ENGINE', ko: '엔진' }, v: { en: 'TODO main language', ko: 'TODO 주 언어' } },
      { k: { en: 'CHASSIS', ko: '섀시' }, v: { en: 'TODO main framework', ko: 'TODO 주 프레임워크' } },
      { k: { en: 'GEARBOX', ko: '변속기' }, v: { en: 'TODO build / tooling', ko: 'TODO 빌드 / 도구' } },
      { k: { en: 'SUSPENSION', ko: '서스펜션' }, v: { en: 'TODO testing / quality', ko: 'TODO 테스트 / 품질' } },
      { k: { en: 'TYRES', ko: '타이어' }, v: { en: 'TODO infra / deploy', ko: 'TODO 인프라 / 배포' } },
      { k: { en: 'AERO', ko: '공력' }, v: 'Three.js · GLSL' },
    ],
  },
  contact: {
    title: { en: '> box box — let\'s talk', ko: '> 박스 박스 — 이야기해요' },
    lines: [
      { k: { en: 'RADIO', ko: '무전' }, v: { en: 'TODO email', ko: 'TODO 이메일' } },
      { link: 'TELEMETRY  github.com/TODO', href: '#' },
      { link: 'GRID       linkedin.com/in/TODO', href: '#' },
    ],
  },
  // 'hq' is generated from stage times (see ui.js).
};
