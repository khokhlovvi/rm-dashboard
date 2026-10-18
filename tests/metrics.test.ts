import { describe, expect, it } from 'vitest';
import { Cube, planFact, planOf, planSummary, rareProducts, teamPlanStatus, weekPlan } from '../src/core/metrics.ts';
import { calendarRange, getPeriod, planWeeks, previousPeriod } from '../src/core/periods.ts';
import { change, computeStats, ranks, standings } from '../src/core/ranking.ts';
import { attentionSignals } from '../src/core/attention.ts';
import { weeklySummary } from '../src/core/summary.ts';
import { DEFAULT_SETTINGS } from '../src/core/settings.ts';
import type { Activity } from '../src/core/types.ts';
import { generateDemo } from '../src/data/demo.ts';

const act = (p: Partial<Activity>): Activity => ({
  date: '2026-10-05',
  manager: 'А',
  department: 'Д1',
  type: 'call',
  result: 'none',
  products: [],
  kind: 'other',
  daysSinceLastMeeting: null,
  newClient: false,
  ...p,
});

describe('план 3 + 6', () => {
  it('статусы и процент', () => {
    expect(planOf(3, 6, DEFAULT_SETTINGS)).toEqual({ pct: 1, status: 'done' });
    expect(planOf(5, 9, DEFAULT_SETTINGS)).toEqual({ pct: 1, status: 'done' });
    expect(planOf(0, 0, DEFAULT_SETTINGS)).toEqual({ pct: 0, status: 'none' });
    expect(planOf(3, 0, DEFAULT_SETTINGS)).toEqual({ pct: 0.5, status: 'partial' });
    expect(planOf(1, 3, DEFAULT_SETTINGS).pct).toBeCloseTo((1 / 3 + 0.5) / 2);
  });

  it('стратегическая встреча с видом «фоллоуап» не попадает в фоллоуапы', () => {
    const list = [
      ...[1, 2, 3].map(() => act({ type: 'meeting', daysSinceLastMeeting: 200, kind: 'followup' })),
      ...[1, 2, 3, 4, 5].map(() => act({ kind: 'followup' })),
      act({ type: 'meeting', kind: 'followup', daysSinceLastMeeting: 30 }),
    ];
    const cube = new Cube(list, DEFAULT_SETTINGS);
    const w = planWeeks({ start: '2026-10-05', end: '2026-10-11' }, '2026-10-11')[0];
    const p = weekPlan(cube, 0, w);
    expect(p.strategic).toBe(3);
    expect(p.followups).toBe(6);
    expect(p.status).toBe('done');
    const cube2 = new Cube(list, { ...DEFAULT_SETTINGS, strategicCountsAsFollowup: true });
    expect(weekPlan(cube2, 0, w).followups).toBe(9);
  });

  it('недели выполнения за месяц', () => {
    const list: Activity[] = [];
    // выполняем план в неделю 05.10 и 12.10, не в 28.09
    for (const ws of ['2026-10-05', '2026-10-12']) {
      for (let i = 0; i < 3; i++) list.push(act({ date: ws, type: 'meeting', newClient: true }));
      for (let i = 0; i < 6; i++) list.push(act({ date: ws, kind: 'followup' }));
    }
    list.push(act({ date: '2026-09-29', kind: 'followup' }));
    list.push(act({ date: '2026-10-20', kind: 'followup' }));
    const cube = new Cube(list, DEFAULT_SETTINGS);
    const ref = '2026-10-20';
    const s = planSummary(cube, 0, calendarRange(getPeriod('month', ref)), ref);
    expect(s.weeks.map((w) => w.status)).toEqual(['partial', 'done', 'done', 'partial']);
    expect(s.completeWeeks).toBe(3);
    expect(s.doneWeeks).toBe(2);
  });
});

describe('куб и суммы', () => {
  const list = [
    act({ date: '2026-10-05', result: 'meeting_set', products: ['РКО'] }),
    act({ date: '2026-10-06' }),
    act({ date: '2026-10-07', type: 'meeting', result: 'product_opened', products: ['РКО', 'Кредит'] }),
    act({ date: '2026-10-12', manager: 'Б', department: 'Д2' }),
  ];
  const cube = new Cube(list, DEFAULT_SETTINGS);
  it('суммы по периоду и вне данных', () => {
    const a = cube.sum(0, '2026-10-05', '2026-10-11');
    expect(a.calls).toBe(2);
    expect(a.meetings).toBe(1);
    expect(a.callMeetingSet).toBe(1);
    expect(a.meetProduct).toBe(1);
    expect(a.products[cube.products.indexOf('РКО')]).toBe(2);
    expect(cube.sum(0, '2020-01-01', '2020-12-31').calls).toBe(0);
    expect(cube.sum(0, '2020-01-01', '2030-12-31').calls).toBe(2);
  });
  it('фильтры', () => {
    expect(new Cube(list, DEFAULT_SETTINGS, { department: 'Д2', manager: '', product: '' }).managers.map((m) => m.name)).toEqual(['Б']);
    const byProduct = new Cube(list, DEFAULT_SETTINGS, { department: '', manager: '', product: 'Кредит' });
    expect(byProduct.teamSum('2026-10-01', '2026-10-31').meetings).toBe(1);
    expect(byProduct.teamSum('2026-10-01', '2026-10-31').calls).toBe(0);
  });
  it('последняя встреча', () => {
    expect(cube.lastMeetingDate(0, '2026-10-12')).toBe('2026-10-07');
    expect(cube.lastMeetingDate(0, '2026-10-06')).toBeNull();
  });
});

describe('рейтинг', () => {
  it('ранги с ничьими', () => {
    expect(ranks([5, 10, 10, 1, null])).toEqual([3, 1, 1, 4, 5]);
  });
  it('динамика без базы — null', () => {
    expect(change(5, 0)).toBeNull();
    expect(change(15, 10)).toBeCloseTo(0.5);
  });
  it('отклонения от среднего и лучшего', () => {
    const list = [act({ manager: 'А' }), act({ manager: 'А' }), act({ manager: 'А' }), act({ manager: 'Б' })];
    const cube = new Cube(list, DEFAULT_SETTINGS);
    const p = getPeriod('lastWeek', '2026-10-14');
    const st = standings(computeStats(cube, p, previousPeriod(p), '2026-10-14'), 'calls');
    expect(st[0]).toMatchObject({ value: 3, rank: 1, avg: 2, best: 3, vsAvg: 1, vsBest: 0 });
    expect(st[1]).toMatchObject({ value: 1, rank: 2, vsAvg: -1, vsBest: -2, vsAvgPct: -0.5 });
  });
});

describe('демо-данные', () => {
  const ref = '2026-10-18';
  const list = generateDemo({ end: ref });
  const cube = new Cube(list, DEFAULT_SETTINGS);
  it('16 менеджеров, 40 недель, детерминированно', () => {
    expect(cube.managers).toHaveLength(16);
    expect(cube.maxDate <= ref).toBe(true);
    expect(cube.minDate >= '2026-01-12').toBe(true);
    expect(generateDemo({ end: ref })).toEqual(list);
  });
  it('есть полное, частичное и нулевое выполнение плана на прошлой неделе', () => {
    const w = planWeeks(getPeriod('lastWeek', ref), ref)[0];
    const st = teamPlanStatus(cube, w);
    expect(st.done).toBeGreaterThanOrEqual(2);
    expect(st.partial).toBeGreaterThanOrEqual(2);
    expect(st.none).toBeGreaterThanOrEqual(1);
  });
  it('нет данных клиентов: только поля модели', () => {
    const keys = new Set(list.flatMap((a) => Object.keys(a)));
    expect([...keys].sort()).toEqual(['date', 'daysSinceLastMeeting', 'department', 'kind', 'manager', 'newClient', 'products', 'result', 'type']);
  });
  it('депозит и факторинг — редкие продукты', () => {
    const team = cube.teamSum('2026-01-01', ref);
    expect(rareProducts(cube, team).map((r) => r.product)).toEqual(expect.arrayContaining(['Депозит', 'Факторинг']));
  });
  it('сигналы внимания и сводка недели', () => {
    const p = getPeriod('lastWeek', ref);
    const stats = computeStats(cube, p, previousPeriod(p), ref);
    const sig = attentionSignals(cube, stats, p, ref);
    expect(sig.some((s) => s.kind === 'drop')).toBe(true);
    expect(sig.some((s) => s.kind === 'noMeetings')).toBe(true);
    const text = weeklySummary(cube, ref);
    expect(text.length).toBeGreaterThanOrEqual(3);
    expect(text.length).toBeLessThanOrEqual(5);
  });
  it('план/факт и прогноз месяца', () => {
    const pf = planFact(cube, ref, 'calls', 'team');
    expect(pf.month.plan).toBe(Math.round((15 * 16 * 22) / 5));
    expect(pf.month.forecast).toBeGreaterThan(pf.month.fact);
  });
});
