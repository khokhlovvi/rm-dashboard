import { isFollowup, isStrategic } from './classify.ts';
import { addDays, diffDays, fromDay, planWeeks, toDay, weekStart, workdays, monthBounds, type PlanWeek } from './periods.ts';
import type { Settings } from './settings.ts';
import { PRODUCTS, type Activity } from './types.ts';

/** Поля агрегата (без продуктов). Порядок важен: это смещения в плоском массиве куба. */
export const AGG_FIELDS = [
  'calls',
  'meetings',
  'callMeetingSet',
  'callProduct',
  'callRefusal',
  'meetMeetingSet',
  'meetProduct',
  'meetRefusal',
  'strategic',
  'followups',
  'followupCalls',
  'followupMeetings',
] as const;
export type AggField = (typeof AGG_FIELDS)[number];
const NF = AGG_FIELDS.length;
const IDX = Object.fromEntries(AGG_FIELDS.map((f, i) => [f, i])) as Record<AggField, number>;

export type Agg = Record<AggField, number> & { products: number[] };

export interface Filters {
  department: string; // '' — все
  manager: string; // '' — все
  product: string; // '' — все
}

export const NO_FILTERS: Filters = { department: '', manager: '', product: '' };

export interface ManagerInfo {
  name: string;
  department: string;
}

export function emptyAgg(nProducts: number): Agg {
  const a = Object.fromEntries(AGG_FIELDS.map((f) => [f, 0])) as Record<AggField, number>;
  return { ...a, products: new Array<number>(nProducts).fill(0) };
}

export function addAgg(a: Agg, b: Agg): Agg {
  const r = emptyAgg(a.products.length);
  for (const f of AGG_FIELDS) r[f] = a[f] + b[f];
  r.products = a.products.map((v, i) => v + (b.products[i] ?? 0));
  return r;
}

export const activityOf = (a: Agg): number => a.calls + a.meetings;
export const conversionOf = (a: Agg): number | null => (a.calls > 0 ? a.callMeetingSet / a.calls : null);
export const productOpenedOf = (a: Agg): number => a.callProduct + a.meetProduct;

/**
 * Куб «менеджер × день» с префиксными суммами: сумма за любой интервал — O(полей).
 * Классификация (стратегическая / фоллоуап) применяется при построении, поэтому куб
 * пересобирается при смене настроек или фильтров.
 */
export class Cube {
  readonly managers: ManagerInfo[];
  readonly products: string[];
  readonly departments: string[];
  readonly minDate: string;
  readonly maxDate: string;
  readonly settings: Settings;
  private readonly day0: number;
  private readonly nDays: number;
  private readonly width: number;
  private readonly prefix: Float64Array[]; // по менеджеру: (nDays+1) × width
  private readonly lastMeeting: (number | null)[][]; // по менеджеру: индекс последнего дня со встречей ≤ d

  constructor(activities: Activity[], settings: Settings, filters: Filters = NO_FILTERS, allDepartments?: string[]) {
    this.settings = settings;
    const productSet = new Set<string>(PRODUCTS);
    for (const a of activities) for (const p of a.products) productSet.add(p);
    this.products = [...productSet];
    const pIdx = new Map(this.products.map((p, i) => [p, i]));

    const deptSet = new Set<string>();
    const mgrMap = new Map<string, ManagerInfo>();
    for (const a of activities) {
      if (a.department) deptSet.add(a.department);
      if (!mgrMap.has(a.manager)) mgrMap.set(a.manager, { name: a.manager, department: a.department });
    }
    this.departments = allDepartments ?? [...deptSet].sort((x, y) => x.localeCompare(y, 'ru'));
    this.managers = [...mgrMap.values()]
      .filter((m) => (!filters.department || m.department === filters.department) && (!filters.manager || m.name === filters.manager))
      .sort((x, y) => x.name.localeCompare(y.name, 'ru'));
    const mIdx = new Map(this.managers.map((m, i) => [m.name, i]));

    let min = '9999-12-31';
    let max = '0000-01-01';
    for (const a of activities) {
      if (a.date < min) min = a.date;
      if (a.date > max) max = a.date;
    }
    if (activities.length === 0) min = max = '2026-01-01';
    this.minDate = min;
    this.maxDate = max;
    this.day0 = toDay(min);
    this.nDays = toDay(max) - this.day0 + 1;
    this.width = NF + this.products.length;

    const raw = this.managers.map(() => new Float64Array(this.nDays * this.width));
    for (const a of activities) {
      const mi = mIdx.get(a.manager);
      if (mi === undefined) continue;
      if (filters.product && !a.products.includes(filters.product)) continue;
      const row = raw[mi];
      const o = (toDay(a.date) - this.day0) * this.width;
      const strategic = isStrategic(a, settings);
      const followup = isFollowup(a, settings, strategic);
      if (a.type === 'call') {
        row[o + IDX.calls]++;
        if (a.result === 'meeting_set') row[o + IDX.callMeetingSet]++;
        if (a.result === 'product_opened') row[o + IDX.callProduct]++;
        if (a.result === 'refusal') row[o + IDX.callRefusal]++;
        if (followup) row[o + IDX.followupCalls]++;
      } else {
        row[o + IDX.meetings]++;
        if (a.result === 'meeting_set') row[o + IDX.meetMeetingSet]++;
        if (a.result === 'product_opened') row[o + IDX.meetProduct]++;
        if (a.result === 'refusal') row[o + IDX.meetRefusal]++;
        if (followup) row[o + IDX.followupMeetings]++;
      }
      if (strategic) row[o + IDX.strategic]++;
      if (followup) row[o + IDX.followups]++;
      for (const p of a.products) {
        const pi = pIdx.get(p);
        if (pi !== undefined) row[o + NF + pi]++;
      }
    }

    this.prefix = raw.map((row) => {
      const pre = new Float64Array((this.nDays + 1) * this.width);
      for (let d = 0; d < this.nDays; d++) {
        const src = d * this.width;
        const prev = d * this.width;
        const dst = (d + 1) * this.width;
        for (let f = 0; f < this.width; f++) pre[dst + f] = pre[prev + f] + row[src + f];
      }
      return pre;
    });

    this.lastMeeting = raw.map((row) => {
      const res: (number | null)[] = new Array(this.nDays);
      let last: number | null = null;
      for (let d = 0; d < this.nDays; d++) {
        if (row[d * this.width + IDX.meetings] > 0) last = d;
        res[d] = last;
      }
      return res;
    });
  }

  managerIndex(name: string): number {
    return this.managers.findIndex((m) => m.name === name);
  }

  /** Сумма по менеджеру за [start, end] включительно; даты вне данных дают нули. */
  sum(mi: number, start: string, end: string): Agg {
    const r = emptyAgg(this.products.length);
    const a = Math.max(0, toDay(start) - this.day0);
    const b = Math.min(this.nDays - 1, toDay(end) - this.day0);
    if (b < a || mi < 0) return r;
    const pre = this.prefix[mi];
    const lo = a * this.width;
    const hi = (b + 1) * this.width;
    for (let f = 0; f < NF; f++) r[AGG_FIELDS[f]] = pre[hi + f] - pre[lo + f];
    for (let p = 0; p < this.products.length; p++) r.products[p] = pre[hi + NF + p] - pre[lo + NF + p];
    return r;
  }

  teamSum(start: string, end: string): Agg {
    let r = emptyAgg(this.products.length);
    for (let i = 0; i < this.managers.length; i++) r = addAgg(r, this.sum(i, start, end));
    return r;
  }

  /** Дата последней встречи менеджера не позже `upTo` (null — встреч не было). */
  lastMeetingDate(mi: number, upTo: string): string | null {
    const d = Math.min(this.nDays - 1, toDay(upTo) - this.day0);
    if (d < 0 || mi < 0) return null;
    const v = this.lastMeeting[mi][d];
    return v === null ? null : fromDay(this.day0 + v);
  }
}

// ——— План 3 + 6 ———

export type PlanStatus = 'done' | 'partial' | 'none';

export interface WeekPlan {
  week: PlanWeek;
  strategic: number;
  followups: number;
  pct: number; // 0..1
  status: PlanStatus;
}

export function planOf(strategic: number, followups: number, s: Settings): { pct: number; status: PlanStatus } {
  const sp = s.strategicPerWeek > 0 ? Math.min(strategic, s.strategicPerWeek) / s.strategicPerWeek : 1;
  const fp = s.followupPerWeek > 0 ? Math.min(followups, s.followupPerWeek) / s.followupPerWeek : 1;
  const pct = (sp + fp) / 2;
  const status: PlanStatus = sp >= 1 && fp >= 1 ? 'done' : strategic === 0 && followups === 0 ? 'none' : 'partial';
  return { pct, status };
}

export function weekPlan(cube: Cube, mi: number, week: PlanWeek): WeekPlan {
  const a = cube.sum(mi, week.start, week.end);
  return { week, strategic: a.strategic, followups: a.followups, ...planOf(a.strategic, a.followups, cube.settings) };
}

export interface PlanSummary {
  weeks: WeekPlan[];
  completeWeeks: number;
  doneWeeks: number;
  /** Среднее выполнение по завершённым неделям; если завершённых нет — по текущей неделе */
  avgPct: number;
}

export function planSummary(cube: Cube, mi: number, range: { start: string; end: string }, ref: string): PlanSummary {
  const weeks = planWeeks(range, ref).map((w) => weekPlan(cube, mi, w));
  const complete = weeks.filter((w) => w.week.complete);
  const basis = complete.length ? complete : weeks;
  return {
    weeks,
    completeWeeks: complete.length,
    doneWeeks: complete.filter((w) => w.status === 'done').length,
    avgPct: basis.length ? basis.reduce((s, w) => s + w.pct, 0) / basis.length : 0,
  };
}

export interface TeamPlanStatus {
  done: number;
  partial: number;
  none: number;
}

export function teamPlanStatus(cube: Cube, week: PlanWeek): TeamPlanStatus {
  const r: TeamPlanStatus = { done: 0, partial: 0, none: 0 };
  for (let i = 0; i < cube.managers.length; i++) r[weekPlan(cube, i, week).status]++;
  return r;
}

// ——— Ряды по неделям ———

export interface WeekPoint {
  start: string;
  agg: Agg;
}

export function weeklySeries(cube: Cube, mi: number | 'team', weekStarts: string[]): WeekPoint[] {
  return weekStarts.map((start) => {
    const end = addDays(start, 6);
    return { start, agg: mi === 'team' ? cube.teamSum(start, end) : cube.sum(mi, start, end) };
  });
}

// ——— План / факт и прогноз ———

export interface PlanFact {
  plan: number;
  fact: number;
  forecast: number | null; // прогноз к концу месяца (только для месяца)
}

/**
 * План/факт на неделю (неделя `ref`) и месяц (`ref`). Недельный план = норматив × менеджеров;
 * месячный = недельный × рабочие дни месяца / 5. Прогноз = факт / прошедшие рабочие дни × все рабочие дни.
 */
export function planFact(cube: Cube, ref: string, field: 'calls' | 'meetings', mi: number | 'team') {
  const s = cube.settings;
  const per = field === 'calls' ? s.callsPerWeek : s.meetingsPerWeek;
  const heads = mi === 'team' ? cube.managers.length : 1;
  const get = (a: string, b: string) => (mi === 'team' ? cube.teamSum(a, b) : cube.sum(mi, a, b))[field];

  const ws = weekStart(ref);
  const week: PlanFact = { plan: per * heads, fact: get(ws, ref), forecast: null };
  const elapsedW = workdays(ws, ref);
  week.forecast = elapsedW > 0 ? (week.fact / elapsedW) * 5 : null;

  const mb = monthBounds(ref);
  const totalWd = workdays(mb.start, mb.end);
  const elapsed = workdays(mb.start, ref);
  const fact = get(mb.start, ref);
  const month: PlanFact = {
    plan: Math.round((per * heads * totalWd) / 5),
    fact,
    forecast: elapsed > 0 ? Math.round((fact / elapsed) * totalWd) : null,
  };
  return { week, month };
}

// ——— Глубина портфеля ———

export function portfolioDepth(a: Agg): number {
  return a.products.filter((v) => v > 0).length;
}

/** Продукты, на которые приходится меньше `share` всех упоминаний команды. */
export function rareProducts(cube: Cube, team: Agg, share = 0.03): { product: string; count: number; share: number }[] {
  const total = team.products.reduce((s, v) => s + v, 0);
  if (total === 0) return [];
  return cube.products
    .map((product, i) => ({ product, count: team.products[i], share: team.products[i] / total }))
    .filter((p) => p.share < share)
    .sort((x, y) => x.count - y.count);
}

export function daysBetween(a: string, b: string): number {
  return diffDays(a, b);
}
