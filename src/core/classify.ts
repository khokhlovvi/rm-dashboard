import type { Activity } from './types.ts';
import type { Settings } from './settings.ts';

/**
 * Стратегическая встреча — встреча с новым клиентом или с клиентом, с которым не встречались
 * `strategicThresholdDays` дней и больше.
 *  - auto: если источник дал число дней — считаем сами по порогу (и признаку нового клиента);
 *          иначе доверяем флагу «стратегическая встреча» из источника;
 *  - days: только по дням / признаку нового клиента;
 *  - flag: только по флагу из источника.
 */
export function isStrategic(a: Activity, s: Settings): boolean {
  if (a.type !== 'meeting') return false;
  const byDays = a.newClient || (a.daysSinceLastMeeting !== null && a.daysSinceLastMeeting >= s.strategicThresholdDays);
  const byFlag = a.kind === 'strategic';
  switch (s.strategicMode) {
    case 'flag':
      return byFlag;
    case 'days':
      return byDays;
    case 'auto':
      return a.daysSinceLastMeeting !== null || a.newClient ? byDays : byFlag;
  }
}

/**
 * Фоллоуап — звонок или встреча с видом «фоллоуап» (возвращаемся к клиенту и дорабатываем
 * договорённости). Стратегическая встреча фоллоуапом не считается, если не включено
 * `strategicCountsAsFollowup`.
 */
export function isFollowup(a: Activity, s: Settings, strategic = isStrategic(a, s)): boolean {
  if (a.kind !== 'followup') return false;
  return !strategic || s.strategicCountsAsFollowup;
}
