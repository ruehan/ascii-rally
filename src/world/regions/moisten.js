/**
 * Career 3 — Moisten (cosmetics + ODF film; AI & DX), 2026–now.
 * A botanical factory on the low ground south of the vineyard road:
 * lavender rows (cosmetic ingredients), a white clean-room plant, film
 * rolls and robot arms. The plant road leaves the yard as a smooth ribbon
 * (film unrolling) with two conveyor strips that push the car along
 * (automation), and joins the vineyard road.
 */
export const YARD = { pos: [238, 72], r: 12 };

export default {
  id: 'moisten',
  trails: [
    {
      id: 'film', surface: 'asphalt', width: 7, shoulder: 4, smooth: 30, maxGrade: 0.08,
      points: [[250, 72], [280, 90], [308, 72], [336, 90], [362, 76], [388, 72], [406, 54], [413, 33]],
    },
  ],
  zones: [
    {
      id: 'moisten', title: 'MOISTEN', label: { en: 'Moisten plant', ko: '모이스텐 공장' },
      path: '~/career/moisten', content: 'career', career: 'moisten',
      view: { center: [285, 105], r: 80, angle: 0 }, // from the south
      pos: YARD.pos, r: YARD.r, surface: 'pad',
    },
  ],
  stages: [], // no stage: the region is the point
  // Conveyor strips (metres along a trail): the car is pushed forward.
  boosts: [
    { trail: 'film', from: 30, to: 52 },
    { trail: 'film', from: 112, to: 134 },
  ],
  // Lavender rows west of the yard.
  vineyards: [
    { rect: [198, 44, 228, 106], yaw: 0, spacing: 2.6, colors: ['#8e6bbf', '#a585d6'], height: 0.7 },
    // Flower fields south of the plant road: rose, calendula, more lavender.
    { rect: [296, 100, 334, 150], yaw: 0, spacing: 2.6, colors: ['#e07a9a', '#ef9ab3'], height: 0.6 },
    { rect: [338, 100, 376, 150], yaw: 0, spacing: 2.6, colors: ['#f2b134', '#f5c55a'], height: 0.6 },
    { rect: [296, 154, 376, 188], yaw: 0.15, spacing: 2.6, colors: ['#8e6bbf', '#a585d6'], height: 0.7 },
  ],
  scatter: [],
};
