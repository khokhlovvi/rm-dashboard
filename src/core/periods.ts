/**
 * Даты и периоды. Все даты — строки 'YYYY-MM-DD'; арифметика — в целых днях от 1970-01-01 (UTC),
 * поэтому часовой пояс браузера не влияет на границы.
 * Неделя — ISO 8601: понедельник–воскресенье, неделя принадлежит году своего четверга.
 */

const MS_DAY = 86_400_000;

export type PeriodKind = 'lastWeek' | 'week' | 'month' | 'ytd' | 'custom';

export interface Period {
  kind: PeriodKind;
  start: string;
  end: string;
}

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  lastWeek: 'Прошлая неделя',
  week: 'Неделя',
  month: 'Месяц',
  ytd: 'С начала года',
  custom: 'Период',
};

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function toDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
}

export function fromDay(day: number): string {
  return new Date(day * MS_DAY).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return fromDay(toDay(iso) + n);
}

export function diffDays(a: string, b: string): number {
  return toDay(a) - toDay(b);
}

export function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function makeIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** 1 = понедельник … 7 = воскресенье. */
export function weekday(iso: string): number {
  // 1970-01-01 — четверг (4)
  return ((((toDay(iso) + 3) % 7) + 7) % 7) + 1;
}

export function weekStart(iso: string): string {
  return addDays(iso, 1 - weekday(iso));
}

export function weekEnd(iso: string): string {
  return addDays(weekStart(iso), 6);
}

/** ISO-неделя: год недели (по четвергу) и номер. */
export function isoWeek(iso: string): { year: number; week: number } {
  const thursday = addDays(weekStart(iso), 3);
  const year = parts(thursday).y;
  const jan1 = makeIso(year, 1, 1);
  const week = Math.floor(diffDays(thursday, jan1) / 7) + 1;
  return { year, week };
}

export function weekKey(iso: string): string {
  const { year, week } = isoWeek(iso);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function today(): string {
  const d = new Date();
  return makeIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Сдвиг на n месяцев с обрезкой дня по длине месяца (31.03 − 1 мес = 28/29.02). */
export function addMonthsClamped(iso: string, n: number): string {
  const { y, m, d } = parts(iso);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return makeIso(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function getPeriod(kind: PeriodKind, ref: string, custom?: { start: string; end: string }): Period {
  switch (kind) {
    case 'lastWeek': {
      const start = addDays(weekStart(ref), -7);
      return { kind, start, end: addDays(start, 6) };
    }
    case 'week':
      return { kind, start: weekStart(ref), end: ref };
    case 'month': {
      const { y, m } = parts(ref);
      return { kind, start: makeIso(y, m, 1), end: ref };
    }
    case 'ytd':
      return { kind, start: makeIso(parts(ref).y, 1, 1), end: ref };
    case 'custom': {
      const c = custom ?? { start: addDays(ref, -27), end: ref };
      const [start, end] = c.start <= c.end ? [c.start, c.end] : [c.end, c.start];
      return { kind, start, end };
    }
  }
}

/** Предыдущий «такой же» период для сравнения динамики. */
export function previousPeriod(p: Period): Period {
  switch (p.kind) {
    case 'lastWeek':
    case 'week':
      return { kind: p.kind, start: addDays(p.start, -7), end: addDays(p.end, -7) };
    case 'month': {
      const start = addMonthsClamped(p.start, -1);
      const { y, m } = parts(start);
      const endDay = Math.min(parts(p.end).d, daysInMonth(y, m));
      return { kind: p.kind, start, end: makeIso(y, m, endDay) };
    }
    case 'ytd': {
      const { y, m, d } = parts(p.end);
      const py = y - 1;
      return { kind: p.kind, start: makeIso(py, 1, 1), end: makeIso(py, m, Math.min(d, daysInMonth(py, m))) };
    }
    case 'custom': {
      const len = diffDays(p.end, p.start) + 1;
      return { kind: p.kind, start: addDays(p.start, -len), end: addDays(p.start, -1) };
    }
  }
}

export function periodLength(p: { start: string; end: string }): number {
  return diffDays(p.end, p.start) + 1;
}

export function inPeriod(iso: string, p: { start: string; end: string }): boolean {
  return iso >= p.start && iso <= p.end;
}

export interface PlanWeek {
  start: string; // понедельник
  end: string; // воскресенье
  key: string; // 2026-W42
  complete: boolean; // воскресенье ≤ ref
}

/**
 * Недели, четверг которых попадает в календарный интервал (каждая неделя учитывается ровно в одном
 * месяце/году) и которые уже начались к `ref`. Для накопительных периодов передавайте полные границы
 * месяца/года (`calendarRange`), чтобы текущая неделя попала в список как незавершённая.
 */
export function planWeeks(p: { start: string; end: string }, ref: string): PlanWeek[] {
  const res: PlanWeek[] = [];
  let mon = weekStart(p.start);
  while (mon <= p.end && mon <= ref) {
    const thu = addDays(mon, 3);
    if (thu >= p.start && thu <= p.end) {
      const end = addDays(mon, 6);
      res.push({ start: mon, end, key: weekKey(mon), complete: end <= ref });
    }
    mon = addDays(mon, 7);
  }
  return res;
}

/** Понедельники n последних недель, заканчивая неделей, содержащей `end`. */
export function lastWeekStarts(end: string, n: number): string[] {
  const last = weekStart(end);
  const res: string[] = [];
  for (let i = n - 1; i >= 0; i--) res.push(addDays(last, -7 * i));
  return res;
}

/** Рабочие дни (пн–пт) в интервале включительно. */
export function workdays(start: string, end: string): number {
  let n = 0;
  for (let d = toDay(start), e = toDay(end); d <= e; d++) {
    const wd = ((((d + 3) % 7) + 7) % 7) + 1;
    if (wd <= 5) n++;
  }
  return n;
}

/** Календарные границы периода для подсчёта недель плана. */
export function calendarRange(p: Period): { start: string; end: string } {
  if (p.kind === 'month') return monthBounds(p.start);
  if (p.kind === 'ytd') return { start: p.start, end: makeIso(parts(p.start).y, 12, 31) };
  if (p.kind === 'week' || p.kind === 'lastWeek') return { start: weekStart(p.start), end: weekEnd(p.start) };
  return p;
}

export function monthBounds(iso: string): { start: string; end: string } {
  const { y, m } = parts(iso);
  return { start: makeIso(y, m, 1), end: makeIso(y, m, daysInMonth(y, m)) };
}

export function formatDate(iso: string, withYear = true): string {
  const { y, m, d } = parts(iso);
  return withYear ? `${d} ${MONTHS_GEN[m - 1]} ${y}` : `${d} ${MONTHS_GEN[m - 1]}`;
}

export function formatShort(iso: string): string {
  const { m, d } = parts(iso);
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

export function formatRange(p: { start: string; end: string }): string {
  const a = parts(p.start);
  const b = parts(p.end);
  if (p.start === p.end) return formatDate(p.start);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS_GEN[b.m - 1]} ${b.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS_GEN[a.m - 1]} – ${b.d} ${MONTHS_GEN[b.m - 1]} ${b.y}`;
  return `${formatDate(p.start)} – ${formatDate(p.end)}`;
}

export function monthName(iso: string): string {
  return MONTHS_NOM[parts(iso).m - 1];
}

export function periodTitle(p: Period): string {
  switch (p.kind) {
    case 'lastWeek':
      return `Прошлая неделя (${weekKey(p.start).replace('-W', ', нед. ')}): ${formatRange(p)}`;
    case 'week':
      return `Неделя (накопительно): ${formatRange(p)}`;
    case 'month':
      return `${monthName(p.start)} (накопительно): ${formatRange(p)}`;
    case 'ytd':
      return `С начала ${parts(p.start).y} года: ${formatRange(p)}`;
    case 'custom':
      return `Период: ${formatRange(p)}`;
  }
}
