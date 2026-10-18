export type StrategicMode = 'auto' | 'days' | 'flag';

export interface Settings {
  /** Недельный план: стратегические встречи */
  strategicPerWeek: number;
  /** Недельный план: фоллоуапы */
  followupPerWeek: number;
  /** Порог «давно не встречались», дней */
  strategicThresholdDays: number;
  /** Как определять стратегическую встречу: auto — по дням, если они есть, иначе по флагу */
  strategicMode: StrategicMode;
  /** Засчитывать ли стратегическую встречу ещё и как фоллоуап (по умолчанию нет) */
  strategicCountsAsFollowup: boolean;
  /** План/факт: звонков на менеджера в неделю */
  callsPerWeek: number;
  /** План/факт: встреч на менеджера в неделю */
  meetingsPerWeek: number;
  /** Сигнал «падение»: на сколько % активность ниже предыдущего периода */
  dropPct: number;
  /** Сигнал «падение» не поднимаем, если в предыдущем периоде было меньше активностей */
  dropMinBase: number;
  /** Сигнал «ниже порога»: активностей в неделю (для длинных периодов — в среднем) */
  minWeeklyActivity: number;
  /** Сигнал «нет встреч»: дней без встреч */
  noMeetingDays: number;
  /** Опорная дата; null — последняя дата в данных */
  refDate: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  strategicPerWeek: 3,
  followupPerWeek: 6,
  strategicThresholdDays: 180,
  strategicMode: 'auto',
  strategicCountsAsFollowup: false,
  callsPerWeek: 15,
  meetingsPerWeek: 5,
  dropPct: 30,
  dropMinBase: 5,
  minWeeklyActivity: 10,
  noMeetingDays: 7,
  refDate: null,
};

export function normalizeSettings(raw: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const def = DEFAULT_SETTINGS[key];
    const v = r[key];
    if (typeof def === 'number' && typeof v === 'number' && Number.isFinite(v) && v >= 0) (s as unknown as Record<string, unknown>)[key] = v;
    if (typeof def === 'boolean' && typeof v === 'boolean') (s as unknown as Record<string, unknown>)[key] = v;
  }
  if (r.strategicMode === 'auto' || r.strategicMode === 'days' || r.strategicMode === 'flag') s.strategicMode = r.strategicMode;
  if (typeof r.refDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.refDate)) s.refDate = r.refDate;
  return s;
}
