import { activityOf, conversionOf, planSummary, productOpenedOf, portfolioDepth, type Agg, type Cube, type PlanSummary } from './metrics.ts';
import { calendarRange, type Period } from './periods.ts';

export type MetricKey = 'activity' | 'calls' | 'meetings' | 'conversion' | 'strategic' | 'followups' | 'planPct' | 'productOpened' | 'depth';

export const METRIC_LABELS: Record<MetricKey, string> = {
  activity: 'Активность (звонки + встречи)',
  calls: 'Звонки',
  meetings: 'Встречи',
  conversion: 'Конверсия звонок → встреча',
  strategic: 'Стратегические встречи',
  followups: 'Фоллоуапы',
  planPct: 'Выполнение плана 3 + 6',
  productOpened: 'Открыто продуктов',
  depth: 'Глубина портфеля',
};

export interface ManagerStats {
  index: number;
  name: string;
  department: string;
  agg: Agg;
  prev: Agg;
  plan: PlanSummary;
  prevPlan: PlanSummary;
}

export function metricValue(agg: Agg, plan: PlanSummary, key: MetricKey): number | null {
  switch (key) {
    case 'activity':
      return activityOf(agg);
    case 'calls':
      return agg.calls;
    case 'meetings':
      return agg.meetings;
    case 'conversion':
      return conversionOf(agg);
    case 'strategic':
      return agg.strategic;
    case 'followups':
      return agg.followups;
    case 'planPct':
      return plan.avgPct;
    case 'productOpened':
      return productOpenedOf(agg);
    case 'depth':
      return portfolioDepth(agg);
  }
}

export const statValue = (m: ManagerStats, key: MetricKey) => metricValue(m.agg, m.plan, key);
export const statPrevValue = (m: ManagerStats, key: MetricKey) => metricValue(m.prev, m.prevPlan, key);

export function computeStats(cube: Cube, period: Period, prev: Period, ref: string): ManagerStats[] {
  const range = calendarRange(period);
  const prevRange = calendarRange(prev);
  return cube.managers.map((m, index) => ({
    index,
    name: m.name,
    department: m.department,
    agg: cube.sum(index, period.start, period.end),
    prev: cube.sum(index, prev.start, prev.end),
    plan: planSummary(cube, index, range, ref),
    prevPlan: planSummary(cube, index, prevRange, prev.end),
  }));
}

/** Относительное изменение; null, если базы нет. */
export function change(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return (cur - prev) / prev;
}

/** Ранги «1, 2, 2, 4»: равные значения делят место. null-значения — в конце. */
export function ranks(values: (number | null)[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity));
  const res = new Array<number>(values.length);
  let place = 0;
  order.forEach((o, pos) => {
    if (pos === 0 || o.v !== order[pos - 1].v) place = pos + 1;
    res[o.i] = place;
  });
  return res;
}

export interface Standing {
  value: number | null;
  prevValue: number | null;
  rank: number;
  prevRank: number;
  of: number;
  avg: number;
  best: number;
  /** value − среднее */
  vsAvg: number | null;
  /** value / среднее − 1 */
  vsAvgPct: number | null;
  /** value − лучшее (≤ 0) */
  vsBest: number | null;
  /** изменение к предыдущему такому же периоду */
  delta: number | null;
}

/** Место в рейтинге, отклонение от среднего и лучшего, динамика — для каждого менеджера. */
export function standings(stats: ManagerStats[], key: MetricKey): Standing[] {
  const vals = stats.map((m) => statValue(m, key));
  const prevVals = stats.map((m) => statPrevValue(m, key));
  const r = ranks(vals);
  const pr = ranks(prevVals);
  const defined = vals.filter((v): v is number => v !== null);
  const avg = defined.length ? defined.reduce((s, v) => s + v, 0) / defined.length : 0;
  const best = defined.length ? Math.max(...defined) : 0;
  return stats.map((_, i) => {
    const v = vals[i];
    return {
      value: v,
      prevValue: prevVals[i],
      rank: r[i],
      prevRank: pr[i],
      of: stats.length,
      avg,
      best,
      vsAvg: v === null ? null : v - avg,
      vsAvgPct: v === null || avg === 0 ? null : v / avg - 1,
      vsBest: v === null ? null : v - best,
      delta: change(v, prevVals[i]),
    };
  });
}
