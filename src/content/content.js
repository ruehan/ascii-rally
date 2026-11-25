/**
 * Portfolio content — the one file to edit.
 *
 * Text can be a plain string (same in both languages) or `{ en, ko }`.
 * Panels are plain data:
 *   { title, lines: [ text | { k, v } | { h } | { link, href } ] }
 *   - text       a paragraph line
 *   - { h }      a section heading
 *   - { k, v }   a key/value row (setup sheet style)
 *   - { link, href } a link
 */

const SITE = 'https://hangyu-field-notes.vercel.app'; // the long-form portfolio (case studies, notes)

export const owner = {
  name: 'Han Gyu',
  handle: 'guest', // shown in the prompt: the visitor is a guest on this stage
  role: { en: 'Full-stack developer & AI researcher', ko: '풀스택 개발자 & AI 연구자' },
  base: { en: 'Cheongju, South Korea', ko: '청주, 대한민국' },
  email: 'ruehan98@gmail.com',
  github: 'https://github.com/ruehan',
  site: SITE,
};

/** Projects shown at the end of a special stage (ids used in map.js stages). */
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
    links: [{ link: { en: 'source — github.com/ruehan/ascii-rally', ko: '소스 — github.com/ruehan/ascii-rally' }, href: 'https://github.com/ruehan/ascii-rally' }],
  },
};

/**
 * Careers: each has its own region in the world (zone config
 * `career: '<id>'`); stopping on its pad shows this card. Text is plain or
 * { en, ko }. `stack` is optional (the row is left out when empty).
 */
export const careers = {
  keti: {
    company: { en: 'Korea Electronics Technology Institute (KETI)', ko: '한국전자기술연구원(KETI)' },
    short: 'KETI',
    role: { en: 'Researcher', ko: '연구원' },
    period: '2021.10 – 2023.03',
    field: { en: 'Digital health · wearable sensing · vehicle voice AI', ko: '디지털 헬스케어 · 웨어러블 센싱 · 차량 음성 AI' },
    stack: 'Python · Flask · K-NN · Android · IMU · Kalman filter · Bluetooth · STT APIs · OTA',
    summary: [
      {
        en: 'Intelligent Convergence SW Research Center: applied AI systems — wearable inertial sensing, vehicle voice recognition, and the services around them.',
        ko: '지능융합SW연구센터에서 웨어러블 관성 센싱, 차량 음성 인식, 그리고 이를 뒷받침하는 서비스까지 응용 AI 시스템을 연구·개발했습니다.',
      },
      { h: { en: 'RESEARCH', ko: '연구' } },
      { k: 'MOTION', v: { en: 'Real-time dumbbell exercise recognition from accelerometer signals (K-NN); 94.7–99.3% on four motions in controlled tests', ko: '덤벨 가속도 신호로 운동 동작을 실시간 인식 (K-NN). 통제 실험의 4개 동작에서 94.7–99.3%' } },
      { k: 'GAIT', v: { en: 'Walking distance and pace from a wrist-worn IMU, no GPS or leg sensors; Kalman filter + gravity compensation', ko: 'GPS나 다리 센서 없이 손목 IMU로 보행 거리·속도 추정. 칼만 필터 + 중력 보정' } },
      { k: 'VOICE', v: { en: 'Vehicle voice platform: compares several STT results, learns per device, returns a personal model over the air', ko: '차량 음성 플랫폼: 여러 STT 결과를 비교하고, 차량별로 학습해 개인화 모델을 OTA로 전달' } },
      { en: 'Three conference papers (KICS, 2022).', ko: '학술대회 논문 3편 (KICS, 2022).' },
    ],
    links: [
      { link: { en: 'case — Motion Feedback ↗', ko: '사례 — Motion Feedback ↗' }, href: `${SITE}/projects/aether` },
      { link: { en: 'case — Gait Measured ↗', ko: '사례 — Gait Measured ↗' }, href: `${SITE}/projects/atlas` },
      { link: { en: 'case — Voice Updated ↗', ko: '사례 — Voice Updated ↗' }, href: `${SITE}/projects/relay` },
    ],
  },
  zeroone: {
    company: { en: 'Zero One Co., Ltd.', ko: '주식회사 제로원' },
    short: { en: 'Zero One', ko: '제로원' },
    role: { en: 'Team Lead, Software Development', ko: 'SW팀장' },
    period: '2025.04 – 2026.10',
    field: { en: 'Food-waste reducers · collection service', ko: '음식물 감량기 · 수거 서비스' },
    summary: [
      { en: 'Led software development and delivery as team lead, connecting product needs with implementation.', ko: '팀장으로서 SW 개발과 제품의 구현·전달을 이끌며, 제품 요구를 실제 구현으로 연결했습니다.' },
      { en: 'Built the company\'s overall software system: the reducer machines and the food-waste collection service.', ko: '감량기와 음식물 수거 서비스를 아우르는 전반적인 시스템을 구축했습니다.' },
    ],
    links: [],
  },
  moisten: {
    company: { en: 'Moisten Co., Ltd.', ko: '(주)모이스텐' },
    short: { en: 'Moisten', ko: '모이스텐' },
    role: { en: 'Developer (AI & DX System Manager)', ko: '개발자 (AI & DX System Manager)' },
    period: { en: '2026.11 – now', ko: '2026.11 – 현재' },
    field: { en: 'Cosmetics · ODF film', ko: '화장품 · ODF 필름' },
    summary: [
      { en: 'Building company-wide systems and automation (AI & DX).', ko: '전반적인 시스템 구축과 자동화를 맡고 있습니다 (AI & DX).' },
    ],
    links: [],
  },
};

/**
 * Milestones along the 24H loop, in order (first = afternoon start, last =
 * back to the paddock next day). `at` (0..1 of the lap) is optional.
 */
export const milestones = [
  { year: '2021.10', title: { en: 'Researcher · KETI', ko: 'KETI 연구원' }, text: careers.keti.field },
  { year: '2022', title: { en: 'Three papers · KICS', ko: 'KICS 논문 3편' }, text: { en: 'Motion recognition · gait estimation · vehicle voice OTA', ko: '동작 인식 · 보행 추정 · 차량 음성 OTA' } },
  { year: '2024', title: { en: 'Walk, Together', ko: 'Walk, Together' }, text: { en: 'Frontend lead · location-based dog-walking service', ko: '프론트엔드 팀장 · 위치 기반 반려견 산책 서비스' } },
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
      { h: { en: 'CAREER', ko: '경력' } },
      { en: 'Each job is a place on the map; stop on its pad to read the card.', ko: '경력마다 지도 위에 지역이 있어요. 패드에 멈추면 경력 카드가 열립니다.' },
      { k: 'KETI', v: { en: 'research campus — east of the valley', ko: '연구 캠퍼스 — 계곡 동쪽' } },
      { k: { en: 'ZERO ONE', ko: '제로원' }, v: { en: 'collection depot — east, by the long straight', ko: '수거 차고지 — 동쪽, 롱 스트레이트 옆' } },
      { k: { en: 'MOISTEN', ko: '모이스텐' }, v: { en: 'botanical plant — south of the vineyards', ko: '보태니컬 공장 — 포도밭 남쪽' } },
      { h: { en: 'SPECIAL STAGES', ko: '스페셜 스테이지' } },
      { en: 'Stop in a start box, wait for 3-2-1, drive to the finish.', ko: '출발 박스에 멈추고 3-2-1 뒤 피니시까지 달리세요.' },
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
      { k: { en: 'BASE', ko: '거점' }, v: owner.base },
      { h: { en: 'ABOUT', ko: '소개' } },
      {
        en: 'I build AI-enabled systems across digital health, wearable sensing and connected mobility — the model, the service under it and the interface a person actually uses.',
        ko: '디지털 헬스케어, 웨어러블 센싱, 커넥티드 모빌리티 분야에서 AI 기반 시스템을 설계·구현합니다. 모델과 그 아래의 서비스, 사람이 실제로 쓰는 인터페이스까지 함께 만듭니다.',
      },
      {
        en: 'I am drawn to the point where a technical system meets a person\'s judgement.',
        ko: '기술 시스템이 사람의 판단과 만나는 지점에 관심이 있습니다.',
      },
      { h: { en: 'HOW I WORK', ko: '일하는 원칙' } },
      { k: '01', v: { en: 'Evidence before certainty', ko: '확신보다 근거' } },
      { k: '02', v: { en: 'Make the route editable', ko: '다시 판단할 수 있게' } },
      { k: '03', v: { en: 'Build for the next question', ko: '다음 질문을 위해 만들기' } },
      { h: { en: 'ALSO BUILT', ko: '그 밖에 만든 것' } },
      { k: 'WALK', v: { en: 'Walk, Together (2024) — location-based dog-walking service; frontend lead · React · TypeScript', ko: 'Walk, Together (2024) — 위치 기반 반려견 산책 서비스. 프론트엔드 팀장 · React · TypeScript' } },
      { k: 'BIO', v: { en: 'Bio Acoustic — process proposal: food-waste byproducts into a bio-based acoustic panel', ko: 'Bio Acoustic — 음식물 부산물을 바이오 기반 흡음 패널로 만드는 공정 제안' } },
      { k: 'WORKOS', v: { en: 'R&D WorkOS (in development) — one workspace for research projects, experiments, samples and documents · Next.js', ko: 'R&D WorkOS (개발 중) — 연구 프로젝트·실험·시료·문서를 잇는 워크스페이스 · Next.js' } },
      { link: { en: 'field notes — case studies and essays ↗', ko: '필드 노트 — 사례 연구와 글 ↗' }, href: owner.site },
    ],
  },
  skills: {
    title: '$ cat setup-sheet.txt',
    lines: [
      { h: { en: 'CAR SETUP', ko: '세팅 시트' } },
      { k: { en: 'ENGINE', ko: '엔진' }, v: { en: 'Python — AI, research, data processing', ko: 'Python — AI, 연구, 데이터 처리' } },
      { k: { en: 'CHASSIS', ko: '섀시' }, v: 'React · Next.js · TypeScript' },
      { k: { en: 'GEARBOX', ko: '변속기' }, v: 'FastAPI · Flask · SQL' },
      { k: { en: 'SUSPENSION', ko: '서스펜션' }, v: { en: 'Signal processing — IMU, Kalman filter', ko: '신호 처리 — IMU, 칼만 필터' } },
      { k: { en: 'TYRES', ko: '타이어' }, v: { en: 'Computer vision · motion recognition', ko: '컴퓨터 비전 · 동작 인식' } },
      { k: { en: 'AERO', ko: '공력' }, v: 'Three.js · GLSL' },
    ],
  },
  contact: {
    title: { en: '> box box — let\'s talk', ko: '> 박스 박스 — 이야기해요' },
    lines: [
      { k: { en: 'RADIO', ko: '무전' }, v: owner.email },
      { link: 'TELEMETRY  github.com/ruehan ↗', href: owner.github },
      { link: { en: 'PADDOCK    field notes (portfolio) ↗', ko: 'PADDOCK    필드 노트 (포트폴리오) ↗' }, href: owner.site },
    ],
  },
  // 'hq' is generated from stage times (see ui.js).
};
