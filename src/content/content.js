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
 * Career milestones along the 24H loop, in order (first = afternoon start,
 * last = back to the paddock next day). `at` (0..1 of the lap) is optional.
 */
export const milestones = [
  { year: 'TODO', title: { en: 'First line of code', ko: '첫 코드 한 줄' }, text: { en: 'TODO: where it started.', ko: 'TODO: 어디서 시작했는지.' } },
  { year: 'TODO', title: { en: 'Studies', ko: '공부' }, text: { en: 'TODO: school / degree / self-taught.', ko: 'TODO: 학교 / 전공 / 독학.' } },
  { year: 'TODO', title: { en: 'First job', ko: '첫 직장' }, text: { en: 'TODO: company, role.', ko: 'TODO: 회사, 역할.' } },
  { year: 'TODO', title: { en: 'The long night', ko: '긴 밤' }, text: { en: 'TODO: the hard project that taught the most.', ko: 'TODO: 가장 많이 배운 힘든 프로젝트.' } },
  { year: 'TODO', title: { en: 'Levelling up', ko: '레벨 업' }, text: { en: 'TODO: next role / big launch.', ko: 'TODO: 다음 역할 / 큰 출시.' } },
  { year: 'TODO', title: { en: 'Now', ko: '지금' }, text: { en: 'TODO: what you are doing today.', ko: 'TODO: 요즘 하고 있는 일.' } },
];

/** Zone panels (ids used in map.js zones[].content). */
export const panels = {
  season: {
    title: '$ ./season --start',
    lines: [
      { en: `Welcome to ${owner.name}'s rally season.`, ko: `${owner.name}의 랠리 시즌에 오신 걸 환영합니다.` },
      { en: 'Drive to a pad and stop (or press E) to open it.', ko: '패드로 가서 멈추면(또는 E) 열립니다.' },
      { en: 'H shows the controls · L switches language · M opens the map.', ko: 'H 조작법 보기 · L 언어 바꾸기 · M 지도 열기.' },
      { h: { en: 'SPECIAL STAGES = PROJECTS', ko: '스페셜 스테이지 = 프로젝트' } },
      { en: 'Stop in a start box, wait for 3-2-1, drive to the finish.', ko: '출발 박스에 멈추고 3-2-1 뒤 피니시까지 달리세요.' },
      { en: 'SS1–SS5 home roads · SS6 circuit · SS7–SS10 mountains, snow, desert', ko: 'SS1–SS5 홈 도로 · SS6 서킷 · SS7–SS10 산악·눈길·사막' },
      { en: 'SS11–SS13 coast, the long straight, vineyards', ko: 'SS11–SS13 해안, 롱 스트레이트, 포도밭' },
      { h: { en: '24H = CAREER', ko: '24H = 경력' } },
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
