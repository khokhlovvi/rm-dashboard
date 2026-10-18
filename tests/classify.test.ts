import { describe, expect, it } from 'vitest';
import { isFollowup, isStrategic } from '../src/core/classify.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/settings.ts';
import type { Activity } from '../src/core/types.ts';

const base: Activity = {
  date: '2026-10-12',
  manager: 'М',
  department: '',
  type: 'meeting',
  result: 'none',
  products: [],
  kind: 'other',
  daysSinceLastMeeting: null,
  newClient: false,
};
const a = (p: Partial<Activity>): Activity => ({ ...base, ...p });
const s = (p: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...p });

describe('стратегическая встреча', () => {
  it('по порогу дней: 180 и больше — да, 179 — нет', () => {
    expect(isStrategic(a({ daysSinceLastMeeting: 180 }), s())).toBe(true);
    expect(isStrategic(a({ daysSinceLastMeeting: 179 }), s())).toBe(false);
  });
  it('порог настраивается', () => {
    expect(isStrategic(a({ daysSinceLastMeeting: 100 }), s({ strategicThresholdDays: 90 }))).toBe(true);
  });
  it('новый клиент — стратегическая', () => {
    expect(isStrategic(a({ newClient: true }), s())).toBe(true);
  });
  it('звонок не бывает стратегической встречей', () => {
    expect(isStrategic(a({ type: 'call', daysSinceLastMeeting: 400, kind: 'strategic' }), s())).toBe(false);
  });
  it('auto: без дней — по флагу; с днями — дни важнее флага', () => {
    expect(isStrategic(a({ kind: 'strategic' }), s())).toBe(true);
    expect(isStrategic(a({ kind: 'strategic', daysSinceLastMeeting: 20 }), s())).toBe(false);
  });
  it('режимы flag и days', () => {
    expect(isStrategic(a({ kind: 'strategic', daysSinceLastMeeting: 20 }), s({ strategicMode: 'flag' }))).toBe(true);
    expect(isStrategic(a({ kind: 'strategic' }), s({ strategicMode: 'days' }))).toBe(false);
  });
});

describe('фоллоуап', () => {
  it('звонок и встреча с видом «фоллоуап» засчитываются', () => {
    expect(isFollowup(a({ type: 'call', kind: 'followup' }), s())).toBe(true);
    expect(isFollowup(a({ kind: 'followup', daysSinceLastMeeting: 10 }), s())).toBe(true);
  });
  it('прочее — не фоллоуап', () => {
    expect(isFollowup(a({ type: 'call', kind: 'other' }), s())).toBe(false);
  });
  it('стратегическая встреча фоллоуапом не считается (по умолчанию)', () => {
    const m = a({ kind: 'followup', daysSinceLastMeeting: 200 });
    expect(isStrategic(m, s())).toBe(true);
    expect(isFollowup(m, s())).toBe(false);
    expect(isFollowup(m, s({ strategicCountsAsFollowup: true }))).toBe(true);
  });
});
