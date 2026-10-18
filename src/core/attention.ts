import { activityOf, type Cube } from './metrics.ts';
import { diffDays, getPeriod, periodLength, type Period } from './periods.ts';
import type { ManagerStats } from './ranking.ts';

export type SignalKind = 'drop' | 'low' | 'noMeetings' | 'planNone';

export interface Signal {
  manager: string;
  index: number;
  kind: SignalKind;
  severity: 'high' | 'medium';
  text: string;
  value: number;
}

export const SIGNAL_LABELS: Record<SignalKind, string> = {
  drop: 'Падение активности',
  low: 'Ниже порога',
  noMeetings: 'Нет встреч',
  planNone: 'План не начат',
};

/**
 * Сигналы «Внимание»:
 *  - drop: активность (звонки + встречи) упала на dropPct% и больше к предыдущему периоду (база ≥ dropMinBase);
 *  - low: активность ниже minWeeklyActivity в неделю (для длинного периода — в среднем за неделю);
 *  - noMeetings: нет встреч noMeetingDays дней и больше к опорной дате;
 *  - planNone: план 3 + 6 прошлой недели не начат.
 */
export function attentionSignals(cube: Cube, stats: ManagerStats[], period: Period, ref: string): Signal[] {
  const s = cube.settings;
  const out: Signal[] = [];
  const weeks = Math.max(1, periodLength(period) / 7);
  const lastWeek = getPeriod('lastWeek', ref);
  for (const m of stats) {
    const cur = activityOf(m.agg);
    const prev = activityOf(m.prev);
    if (prev >= s.dropMinBase && prev > 0) {
      const ch = (cur - prev) / prev;
      if (ch <= -s.dropPct / 100) {
        out.push({
          manager: m.name,
          index: m.index,
          kind: 'drop',
          severity: ch <= -0.5 ? 'high' : 'medium',
          value: ch,
          text: `Активность ${cur} против ${prev} в предыдущем периоде (${Math.round(ch * 100)}%)`,
        });
      }
    }
    const perWeek = cur / weeks;
    if (perWeek < s.minWeeklyActivity) {
      out.push({
        manager: m.name,
        index: m.index,
        kind: 'low',
        severity: perWeek < s.minWeeklyActivity / 2 ? 'high' : 'medium',
        value: perWeek,
        text: `${perWeek.toFixed(1).replace('.', ',')} активностей в неделю при пороге ${s.minWeeklyActivity}`,
      });
    }
    const last = cube.lastMeetingDate(m.index, ref);
    const days = last === null ? Infinity : diffDays(ref, last);
    if (days >= s.noMeetingDays) {
      out.push({
        manager: m.name,
        index: m.index,
        kind: 'noMeetings',
        severity: days >= s.noMeetingDays * 2 ? 'high' : 'medium',
        value: days,
        text: last === null ? 'Встреч в данных нет' : `Последняя встреча ${days} дн. назад`,
      });
    }
    const lw = cube.sum(m.index, lastWeek.start, lastWeek.end);
    if (lw.strategic === 0 && lw.followups === 0) {
      out.push({
        manager: m.name,
        index: m.index,
        kind: 'planNone',
        severity: 'high',
        value: 0,
        text: 'На прошлой неделе 0 стратегических встреч и 0 фоллоуапов',
      });
    }
  }
  const sev = { high: 0, medium: 1 };
  return out.sort((a, b) => sev[a.severity] - sev[b.severity] || a.manager.localeCompare(b.manager, 'ru'));
}
