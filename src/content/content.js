/**
 * Portfolio content — the one file to edit.
 *
 * Everything marked TODO is a placeholder. Panels are plain data:
 *   { title, lines: [ string | { k, v } | { h } | { link, href } ] }
 *   - string     a paragraph line
 *   - { h }      a section heading
 *   - { k, v }   a key/value row (setup sheet style)
 *   - { link, href } a link
 */

export const owner = {
  name: 'TODO Your Name',
  handle: 'guest',
  role: 'Software developer',
};

/** Projects shown at the end of each special stage (ids used in map.js stages). */
export const projects = {
  p1: {
    title: 'stage ~/',
    year: '2026',
    role: 'Design + development',
    stack: 'Three.js · GLSL · Vite',
    summary: [
      'This site. A drivable portfolio rendered entirely as ASCII:',
      'a GPU shader turns a 3D world into glyphs, with edge characters,',
      'per-material charsets and contour lines on the terrain.',
    ],
    links: [{ link: 'source', href: '#' }],
  },
  p2: {
    title: 'TODO project two',
    year: 'TODO',
    role: 'TODO',
    stack: 'TODO',
    summary: ['TODO: one or two sentences about what it is and why it matters.'],
    links: [],
  },
  p3: {
    title: 'TODO project three',
    year: 'TODO',
    role: 'TODO',
    stack: 'TODO',
    summary: ['TODO: one or two sentences about what it is and why it matters.'],
    links: [],
  },
  p4: { title: 'TODO project four', year: 'TODO', role: 'TODO', stack: 'TODO', summary: ['TODO'], links: [] },
  p5: { title: 'TODO project five', year: 'TODO', role: 'TODO', stack: 'TODO', summary: ['TODO'], links: [] },
  p6: { title: 'TODO project six', year: 'TODO', role: 'TODO', stack: 'TODO', summary: ['TODO'], links: [] },
};

/**
 * Career milestones along the 24H loop, in order (first = afternoon start,
 * last = back to the paddock next day). `at` (0..1 of the lap) is optional.
 */
export const milestones = [
  { year: 'TODO', title: 'First line of code', text: 'TODO: where it started.' },
  { year: 'TODO', title: 'Studies', text: 'TODO: school / degree / self-taught.' },
  { year: 'TODO', title: 'First job', text: 'TODO: company, role.' },
  { year: 'TODO', title: 'The long night', text: 'TODO: the hard project that taught the most.' },
  { year: 'TODO', title: 'Levelling up', text: 'TODO: next role / big launch.' },
  { year: 'TODO', title: 'Now', text: 'TODO: what you are doing today.' },
];

/** Zone panels (ids used in map.js zones[].content). */
export const panels = {
  season: {
    title: '$ ./season --start',
    lines: [
      `Welcome to ${owner.name}'s rally season.`,
      'Drive to a pad and stop (or press E) to open it.',
      { h: 'SPECIAL STAGES = PROJECTS' },
      'Stop in a start box, wait for 3-2-1, drive to the finish.',
      'SS1 forest (gravel) · SS2 old town (cobbles) · SS3 coast (tarmac)',
      'SS4 east road at night (dirt) · SS5 valley hillclimb · SS6 circuit lap',
      { h: '24H = CAREER' },
      'Drive north through the 24H gate: valley → coast → east road → home.',
      'The clock runs from afternoon through the night; milestones line the way.',
      { h: 'ALSO ON THE MAP' },
      { k: 'LOOKOUT', v: 'about  — coast headland, north-west' },
      { k: 'GARAGE', v: 'skills — next to the paddock' },
      { k: 'PIT WALL', v: 'contact — next to the paddock' },
      { k: 'RALLY HQ', v: 'stage times — old town piazza, east' },
    ],
  },
  about: {
    title: '$ whoami',
    lines: [
      { k: 'DRIVER', v: owner.name },
      { k: 'ROLE', v: owner.role },
      { k: 'BASE', v: 'TODO city' },
      { h: 'ABOUT' },
      'TODO: a few lines about you — what you build, what you care about.',
      { h: 'OFF THE CLOCK' },
      'Motorsport: F1, endurance racing, rally, hot hatches.',
    ],
  },
  skills: {
    title: '$ cat setup-sheet.txt',
    lines: [
      { h: 'CAR SETUP' },
      { k: 'ENGINE', v: 'TODO main language' },
      { k: 'CHASSIS', v: 'TODO main framework' },
      { k: 'GEARBOX', v: 'TODO build / tooling' },
      { k: 'SUSPENSION', v: 'TODO testing / quality' },
      { k: 'TYRES', v: 'TODO infra / deploy' },
      { k: 'AERO', v: 'Three.js · GLSL' },
    ],
  },
  contact: {
    title: '> box box — let\'s talk',
    lines: [
      { k: 'RADIO', v: 'TODO email' },
      { link: 'TELEMETRY  github.com/TODO', href: '#' },
      { link: 'GRID       linkedin.com/in/TODO', href: '#' },
    ],
  },
  // 'hq' is generated from stage times (see ui.js).
};
