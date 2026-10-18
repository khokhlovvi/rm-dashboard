import { describe, expect, it } from 'vitest';
import { resolveRef } from '../src/ui/app.ts';
import { DEFAULT_SETTINGS } from '../src/core/settings.ts';

describe('опорная дата', () => {
  it('сегодня, если данные свежие; иначе последняя дата данных; ручная — всегда', () => {
    expect(resolveRef(DEFAULT_SETTINGS, '2026-10-16', '2026-10-18')).toBe('2026-10-18');
    expect(resolveRef(DEFAULT_SETTINGS, '2026-09-30', '2026-10-18')).toBe('2026-09-30');
    expect(resolveRef({ ...DEFAULT_SETTINGS, refDate: '2026-06-01' }, '2026-10-16', '2026-10-18')).toBe('2026-06-01');
  });
});
