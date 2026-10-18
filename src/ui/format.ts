import type { PlanStatus } from '../core/metrics.ts';
import { h } from './dom.ts';

const intFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const oneFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 0 });

export const fmtInt = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : intFmt.format(v));
export const fmtNum = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : oneFmt.format(v));
export const fmtPct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits).replace('.', ',')}%`;

const MINUS = '−';

export function signed(v: number, formatter: (x: number) => string = fmtNum): string {
  if (Math.abs(v) < 1e-9) return '0';
  return `${v > 0 ? '+' : MINUS}${formatter(Math.abs(v))}`;
}

/** Динамика: стрелка + знак + цвет. `inverse` — когда рост плохо. */
export function deltaEl(ch: number | null, opts: { suffix?: string; abs?: boolean; inverse?: boolean; title?: string } = {}): HTMLElement {
  if (ch === null || !Number.isFinite(ch)) return h('span', { class: 'delta na', title: opts.title ?? 'нет базы для сравнения' }, '— нет базы');
  const flat = opts.abs ? Math.abs(ch) < 1e-9 : Math.abs(ch) < 0.005;
  const up = ch > 0;
  const cls = flat ? 'flat' : up !== Boolean(opts.inverse) ? 'up' : 'down';
  const arrow = flat ? '→' : up ? '▲' : '▼';
  const text = opts.abs ? signed(ch) : signed(ch * 100, (x) => intFmt.format(x)) + '%';
  return h('span', { class: `delta ${cls}`, title: opts.title ?? null }, `${arrow} ${text}${opts.suffix ?? ''}`);
}

export const STATUS_LABEL: Record<PlanStatus, string> = { done: 'выполнен', partial: 'частично', none: 'не начат' };
export const STATUS_ICON: Record<PlanStatus, string> = { done: '✓', partial: '≈', none: '✕' };

export function statusEl(s: PlanStatus, text?: string): HTMLElement {
  return h('span', { class: `status ${s}` }, `${STATUS_ICON[s]} ${text ?? STATUS_LABEL[s]}`);
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
