import { addDays, lastWeekStarts, parts, today } from '../core/periods.ts';
import { PRODUCTS, type Activity, type ActivityResult } from '../core/types.ts';

/** Детерминированный ГПСЧ (mulberry32). */
export function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(rand: () => number, lambda: number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
}

function pickWeighted<T>(rand: () => number, items: readonly T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let x = rand() * total;
  for (let i = 0; i < items.length; i++) {
    x -= weights[i];
    if (x <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** Вымышленные менеджеры: имя, подразделение, профиль. */
const MANAGERS: { name: string; dept: string; profile: Profile }[] = [
  { name: 'Арсеньева Л.', dept: 'Корпоративный блок', profile: 'star' },
  { name: 'Белозёров К.', dept: 'Корпоративный блок', profile: 'steady' },
  { name: 'Ветрова М.', dept: 'Корпоративный блок', profile: 'growing' },
  { name: 'Гордеев П.', dept: 'Корпоративный блок', profile: 'declining' },
  { name: 'Дроздова Е.', dept: 'Корпоративный блок', profile: 'steady' },
  { name: 'Ершов С.', dept: 'МСБ', profile: 'star' },
  { name: 'Жукова А.', dept: 'МСБ', profile: 'caller' },
  { name: 'Зимин Р.', dept: 'МСБ', profile: 'steady' },
  { name: 'Ильина О.', dept: 'МСБ', profile: 'vacation' },
  { name: 'Карпов Д.', dept: 'МСБ', profile: 'growing' },
  { name: 'Ларионова Т.', dept: 'МСБ', profile: 'meeter' },
  { name: 'Миронов В.', dept: 'Региональный офис', profile: 'weak' },
  { name: 'Никитина Ю.', dept: 'Региональный офис', profile: 'star' },
  { name: 'Орлов Г.', dept: 'Региональный офис', profile: 'steady' },
  { name: 'Панова И.', dept: 'Региональный офис', profile: 'caller' },
  { name: 'Рябов Н.', dept: 'Региональный офис', profile: 'newbie' },
];

type Profile = 'star' | 'steady' | 'growing' | 'declining' | 'caller' | 'meeter' | 'vacation' | 'weak' | 'newbie';

interface Rates {
  otherCalls: number;
  otherMeetings: number;
  followCalls: number;
  followMeetings: number;
  strategic: number;
  conversion: number;
}

const PROFILES: Record<Profile, Rates> = {
  star: { otherCalls: 10, otherMeetings: 2, followCalls: 5, followMeetings: 3, strategic: 3.6, conversion: 0.32 },
  steady: { otherCalls: 9, otherMeetings: 1.5, followCalls: 3.5, followMeetings: 1.8, strategic: 2.2, conversion: 0.24 },
  growing: { otherCalls: 8, otherMeetings: 1.2, followCalls: 3, followMeetings: 1.5, strategic: 2, conversion: 0.22 },
  declining: { otherCalls: 11, otherMeetings: 1.8, followCalls: 4, followMeetings: 2, strategic: 2.6, conversion: 0.25 },
  caller: { otherCalls: 16, otherMeetings: 0.8, followCalls: 5, followMeetings: 0.8, strategic: 1.3, conversion: 0.17 },
  meeter: { otherCalls: 5, otherMeetings: 3, followCalls: 2, followMeetings: 3, strategic: 3, conversion: 0.38 },
  vacation: { otherCalls: 9, otherMeetings: 1.5, followCalls: 3.5, followMeetings: 1.8, strategic: 2.4, conversion: 0.25 },
  weak: { otherCalls: 5, otherMeetings: 0.6, followCalls: 1.5, followMeetings: 0.5, strategic: 0.9, conversion: 0.14 },
  newbie: { otherCalls: 7, otherMeetings: 0.8, followCalls: 2, followMeetings: 0.8, strategic: 1.2, conversion: 0.18 },
};

/** Базовая частота упоминаний продуктов; депозит и факторинг команда почти не предлагает. */
const PRODUCT_BASE = [8, 14, 9, 6, 4, 5, 10, 6, 11, 1, 0.8];

export interface DemoOptions {
  seed?: number;
  weeks?: number;
  /** Последняя дата данных (по умолчанию — сегодня) */
  end?: string;
}

/**
 * Демо-данные: 16 вымышленных менеджеров × 40 недель. Профили дают разную динамику (рост, спад,
 * отпуск, новичок), сезонность (январь, лето) и гарантируют, что на прошлой неделе есть менеджеры
 * с полным, частичным и нулевым выполнением плана 3 + 6.
 */
export function generateDemo(opts: DemoOptions = {}): Activity[] {
  const seed = opts.seed ?? 20261018;
  const weeks = opts.weeks ?? 40;
  const end = opts.end ?? today();
  const rand = rng(seed);
  const starts = lastWeekStarts(end, weeks);
  const lastFull = weeks - 2; // индекс прошлой полной недели
  const out: Activity[] = [];

  MANAGERS.forEach((m) => {
    const r = PROFILES[m.profile];
    const affinity = PRODUCT_BASE.map((b) => b * (0.4 + rand() * 1.4));
    const vacationWeeks = new Set<number>();
    // У всех — по одному-два отпуска, у «vacation» — ещё и прошлая + текущая неделя
    const v1 = Math.floor(rand() * (weeks - 6)) + 2;
    vacationWeeks.add(v1);
    if (rand() < 0.5) vacationWeeks.add(v1 + 1);
    if (m.profile === 'vacation') {
      vacationWeeks.add(lastFull);
      vacationWeeks.add(lastFull + 1);
    }

    starts.forEach((ws, wi) => {
      if (vacationWeeks.has(wi)) return;
      const t = wi / (weeks - 1); // 0..1 по времени
      let k = 1;
      if (m.profile === 'growing') k = 0.65 + 0.7 * t;
      if (m.profile === 'declining') k = wi >= lastFull ? 0.45 : 1.15 - 0.35 * t;
      if (m.profile === 'newbie') k = wi < weeks * 0.35 ? 0 : 0.5 + 0.8 * t;
      const month = parts(addDays(ws, 3)).m;
      if (month === 1 && parts(addDays(ws, 3)).d <= 10) k *= 0.3; // новогодние праздники
      if (month === 7 || month === 8) k *= 0.85; // лето
      k *= 0.85 + rand() * 0.3; // недельный шум
      if (k <= 0) return;

      let nStrat = poisson(rand, r.strategic * k);
      let nFollowCalls = poisson(rand, r.followCalls * k);
      let nFollowMeet = poisson(rand, r.followMeetings * k);
      const nOtherCalls = poisson(rand, r.otherCalls * k);
      const nOtherMeet = poisson(rand, r.otherMeetings * k);

      // Гарантии для прошлой недели: «звёзды» выполняют план, «слабый» — частично
      if (wi === lastFull) {
        if (m.profile === 'star') {
          nStrat = Math.max(nStrat, 3);
          if (nFollowCalls + nFollowMeet < 6) nFollowCalls = 6 - nFollowMeet;
        }
        if (m.profile === 'weak') {
          nStrat = Math.min(nStrat, 1);
          nFollowCalls = Math.min(nFollowCalls, 2);
          nFollowMeet = 0;
        }
      }

      const day = () => {
        const x = rand();
        const wd = x < 0.97 ? Math.floor(rand() * 5) : 5; // редко — суббота
        return addDays(ws, wd);
      };
      const products = (n: number) => {
        const res = new Set<string>();
        for (let i = 0; i < n; i++) res.add(pickWeighted(rand, PRODUCTS, affinity));
        return [...res];
      };
      const nProducts = () => (rand() < 0.25 ? 0 : rand() < 0.75 ? 1 : 2);

      const call = (kind: Activity['kind']): Activity => {
        const x = rand();
        const result: ActivityResult =
          x < r.conversion ? 'meeting_set' : x < r.conversion + 0.05 ? 'product_opened' : x < r.conversion + 0.27 ? 'refusal' : 'none';
        return {
          date: day(),
          manager: m.name,
          department: m.dept,
          type: 'call',
          result,
          products: products(nProducts()),
          kind,
          daysSinceLastMeeting: Math.floor(rand() * 150) + 5,
          newClient: false,
        };
      };
      const meeting = (strategic: boolean, kind: Activity['kind']): Activity => {
        const x = rand();
        const result: ActivityResult = x < 0.22 ? 'product_opened' : x < 0.4 ? 'meeting_set' : x < 0.5 ? 'refusal' : 'none';
        const newClient = strategic && rand() < 0.35;
        return {
          date: day(),
          manager: m.name,
          department: m.dept,
          type: 'meeting',
          result,
          products: products(nProducts() + 1),
          kind,
          daysSinceLastMeeting: newClient ? null : strategic ? 180 + Math.floor(rand() * 500) : 7 + Math.floor(rand() * 160),
          newClient,
        };
      };

      for (let i = 0; i < nStrat; i++) out.push(meeting(true, 'strategic'));
      for (let i = 0; i < nFollowMeet; i++) out.push(meeting(false, 'followup'));
      for (let i = 0; i < nOtherMeet; i++) out.push(meeting(false, 'other'));
      for (let i = 0; i < nFollowCalls; i++) out.push(call('followup'));
      for (let i = 0; i < nOtherCalls; i++) out.push(call('other'));
    });
  });

  return out.filter((a) => a.date <= end).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.manager.localeCompare(b.manager, 'ru')));
}

export const DEMO_MANAGER_COUNT = MANAGERS.length;
