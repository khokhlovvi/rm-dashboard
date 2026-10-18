import { describe, expect, it } from 'vitest';
import {
  addMonthsClamped,
  calendarRange,
  diffDays,
  getPeriod,
  isIsoDate,
  isoWeek,
  lastWeekStarts,
  planWeeks,
  previousPeriod,
  weekday,
  weekEnd,
  weekKey,
  weekStart,
  workdays,
} from '../src/core/periods.ts';

describe('границы недели', () => {
  it('понедельник–воскресенье', () => {
    expect(weekday('2026-10-12')).toBe(1); // пн
    expect(weekday('2026-10-18')).toBe(7); // вс
    expect(weekStart('2026-10-18')).toBe('2026-10-12');
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
    expect(weekEnd('2026-10-14')).toBe('2026-10-18');
  });
  it('неделя через месяц и год', () => {
    expect(weekStart('2026-01-01')).toBe('2025-12-29');
    expect(weekEnd('2025-12-29')).toBe('2026-01-04');
    expect(weekStart('2026-03-01')).toBe('2026-02-23');
  });
  it('високосный год', () => {
    expect(weekStart('2024-02-29')).toBe('2024-02-26');
    expect(weekEnd('2024-02-26')).toBe('2024-03-03');
  });
  it('даты до 1970 и часовой пояс не ломают расчёт', () => {
    expect(weekday('1969-12-31')).toBe(3);
    expect(diffDays('2026-03-30', '2026-03-29')).toBe(1); // переход на летнее время в Европе
  });
});

describe('ISO-недели', () => {
  it('неделя принадлежит году своего четверга', () => {
    expect(isoWeek('2025-12-29')).toEqual({ year: 2026, week: 1 });
    expect(isoWeek('2021-01-03')).toEqual({ year: 2020, week: 53 });
    expect(isoWeek('2026-10-18')).toEqual({ year: 2026, week: 42 });
    expect(weekKey('2027-01-01')).toBe('2026-W53');
    expect(weekKey('2027-01-04')).toBe('2027-W01');
  });
});

describe('периоды', () => {
  const ref = '2026-10-14'; // среда
  it('прошлая неделя и позапрошлая', () => {
    const p = getPeriod('lastWeek', ref);
    expect(p).toMatchObject({ start: '2026-10-05', end: '2026-10-11' });
    expect(previousPeriod(p)).toMatchObject({ start: '2026-09-28', end: '2026-10-04' });
  });
  it('прошлая неделя, если ref — воскресенье, это всё равно предыдущая пн–вс', () => {
    expect(getPeriod('lastWeek', '2026-10-18')).toMatchObject({ start: '2026-10-05', end: '2026-10-11' });
    expect(getPeriod('lastWeek', '2026-10-19')).toMatchObject({ start: '2026-10-12', end: '2026-10-18' });
  });
  it('неделя накопительно сравнивается с тем же днём прошлой недели', () => {
    const p = getPeriod('week', ref);
    expect(p).toMatchObject({ start: '2026-10-12', end: '2026-10-14' });
    expect(previousPeriod(p)).toMatchObject({ start: '2026-10-05', end: '2026-10-07' });
  });
  it('месяц с 1 числа', () => {
    const p = getPeriod('month', ref);
    expect(p).toMatchObject({ start: '2026-10-01', end: '2026-10-14' });
    expect(previousPeriod(p)).toMatchObject({ start: '2026-09-01', end: '2026-09-14' });
  });
  it('месяц: предыдущий короче — конец обрезается', () => {
    const p = getPeriod('month', '2026-03-31');
    expect(previousPeriod(p)).toMatchObject({ start: '2026-02-01', end: '2026-02-28' });
    expect(previousPeriod(getPeriod('month', '2024-03-30'))).toMatchObject({ end: '2024-02-29' });
  });
  it('месяц: январь сравнивается с декабрём прошлого года', () => {
    const p = getPeriod('month', '2026-01-15');
    expect(previousPeriod(p)).toMatchObject({ start: '2025-12-01', end: '2025-12-15' });
  });
  it('с начала года и сравнение с тем же днём прошлого года', () => {
    const p = getPeriod('ytd', ref);
    expect(p).toMatchObject({ start: '2026-01-01', end: '2026-10-14' });
    expect(previousPeriod(p)).toMatchObject({ start: '2025-01-01', end: '2025-10-14' });
    expect(previousPeriod(getPeriod('ytd', '2024-02-29'))).toMatchObject({ start: '2023-01-01', end: '2023-02-28' });
  });
  it('неделя накопительно в начале года уходит в прошлый год', () => {
    const p = getPeriod('week', '2026-01-02');
    expect(p).toMatchObject({ start: '2025-12-29', end: '2026-01-02' });
    expect(getPeriod('lastWeek', '2026-01-02')).toMatchObject({ start: '2025-12-22', end: '2025-12-28' });
  });
  it('произвольный период и предыдущий такой же длины', () => {
    const p = getPeriod('custom', ref, { start: '2026-09-10', end: '2026-09-01' });
    expect(p).toMatchObject({ start: '2026-09-01', end: '2026-09-10' });
    expect(previousPeriod(p)).toMatchObject({ start: '2026-08-22', end: '2026-08-31' });
  });
  it('сдвиг месяцев с обрезкой', () => {
    expect(addMonthsClamped('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', -2)).toBe('2025-11-30');
    expect(addMonthsClamped('2025-12-15', 1)).toBe('2026-01-15');
  });
});

describe('недели плана', () => {
  it('неделя на стыке месяцев относится к месяцу четверга', () => {
    // 28.09–04.10.2026: четверг 01.10 → октябрь
    const oct = planWeeks({ start: '2026-10-01', end: '2026-10-31' }, '2026-12-31');
    expect(oct.map((w) => w.start)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    const sep = planWeeks({ start: '2026-09-01', end: '2026-09-30' }, '2026-12-31');
    expect(sep.map((w) => w.start)).not.toContain('2026-09-28');
  });
  it('незавершённая неделя помечается', () => {
    const w = planWeeks(calendarRange(getPeriod('month', '2026-10-14')), '2026-10-14');
    expect(w.map((x) => [x.start, x.complete])).toEqual([
      ['2026-09-28', true],
      ['2026-10-05', true],
      ['2026-10-12', false],
    ]);
  });
  it('год: неделя 29.12.2025 относится к 2026', () => {
    const y26 = planWeeks({ start: '2026-01-01', end: '2026-12-31' }, '2027-01-10');
    expect(y26[0].start).toBe('2025-12-29');
    expect(y26).toHaveLength(53);
    const y25 = planWeeks({ start: '2025-01-01', end: '2025-12-31' }, '2027-01-10');
    expect(y25.at(-1)?.start).toBe('2025-12-22');
    expect(y25).toHaveLength(52);
  });
});

describe('calendarRange', () => {
  it('неделя накопительно — вся неделя', () => {
    expect(calendarRange(getPeriod('week', '2026-10-14'))).toEqual({ start: '2026-10-12', end: '2026-10-18' });
    expect(planWeeks(calendarRange(getPeriod('week', '2026-10-14')), '2026-10-14')).toHaveLength(1);
  });
  it('с начала года — до 31 декабря', () => {
    const w = planWeeks(calendarRange(getPeriod('ytd', '2026-01-02')), '2026-01-02');
    expect(w.map((x) => [x.start, x.complete])).toEqual([['2025-12-29', false]]);
  });
});

describe('прочее', () => {
  it('последние недели', () => {
    expect(lastWeekStarts('2026-10-14', 3)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
  });
  it('рабочие дни', () => {
    expect(workdays('2026-10-01', '2026-10-31')).toBe(22);
    expect(workdays('2026-10-17', '2026-10-18')).toBe(0);
  });
  it('валидация дат', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('26-1-1')).toBe(false);
  });
});
