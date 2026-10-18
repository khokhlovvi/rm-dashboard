import { addDays, formatRange, formatShort, lastWeekStarts, periodLength, toDay, weekKey, weekStart, type Period } from '../core/periods.ts';
import { activityOf, conversionOf, productOpenedOf, type Agg } from '../core/metrics.ts';
import type { Ctx } from './app.ts';
import { h, raw } from './dom.ts';
import { fmtInt, fmtPct } from './format.ts';

export function card(title: string, hint: string | null, body: (Node | null)[], right?: Node | null): HTMLElement {
  return h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, title), hint ? h('span', { class: 'hint' }, hint) : null, right ? h('div', { class: 'right' }, right) : null), body);
}

export function pageHead(title: string, sub: string | null, actions?: (Node | null)[]): HTMLElement {
  return h('div', { class: 'page-head' }, h('h1', null, title), sub ? h('span', { class: 'sub' }, sub) : null, actions ? h('div', { class: 'actions no-print' }, actions) : null);
}

export function managerLink(name: string): HTMLElement {
  return h('a', { href: `#/manager/${encodeURIComponent(name)}` }, name);
}

export function compareNote(ctx: Ctx): string {
  if (ctx.prev.end < ctx.base.minDate) return `сравнение с ${formatRange(ctx.prev)} — данных за этот период нет`;
  return `сравнение с ${formatRange(ctx.prev)}`;
}

/** Недели для графиков динамики: для «с начала года» — все недели года, иначе не меньше 13 недель до конца периода. */
export function chartWeeks(ctx: Ctx): { starts: string[]; highlight: [number, number] } {
  const p: Period = ctx.period;
  const span = Math.ceil((toDay(weekStart(p.end)) - toDay(weekStart(p.start))) / 7) + 1;
  const n = Math.min(53, Math.max(13, span));
  const starts = lastWeekStarts(p.end, n).filter((s) => addDays(s, 6) >= ctx.base.minDate);
  const first = starts.findIndex((s) => addDays(s, 6) >= p.start);
  return { starts, highlight: [Math.max(0, first), starts.length - 1] };
}

export function weekLabel(start: string): string {
  return formatShort(start);
}

export function weekTip(start: string, ref: string): string {
  const end = addDays(start, 6);
  return `${weekKey(start).replace('-W', ', неделя ')} · ${formatShort(start)}–${formatShort(end)}${end > ref ? ' (неполная)' : ''}`;
}

export function progress(label: string, fact: number, plan: number, forecast: number | null, metaExtra = ''): HTMLElement {
  const max = Math.max(plan, fact, forecast ?? 0, 1);
  const pct = plan > 0 ? fact / plan : null;
  const fill = h('div', { class: 'fill' });
  fill.style.width = `${Math.min(100, (fact / max) * 100)}%`;
  const track = h('div', { class: 'track', 'data-tip': `${label}\nФакт: ${fmtInt(fact)}\nПлан: ${fmtInt(plan)}${forecast !== null ? `\nПрогноз: ${fmtInt(forecast)}` : ''}` }, fill);
  if (forecast !== null) {
    const f = h('div', { class: 'forecast', title: 'прогноз' });
    f.style.left = `calc(${Math.min(100, (forecast / max) * 100)}% - 1px)`;
    track.appendChild(f);
  }
  const planMark = h('div', { class: 'forecast' });
  planMark.style.left = `calc(${Math.min(100, (plan / max) * 100)}% - 1px)`;
  planMark.style.background = 'var(--text-3)';
  track.appendChild(planMark);
  const status = pct === null ? '' : pct >= 1 ? '✓ план выполнен' : forecast !== null && forecast >= plan ? '▲ по прогнозу выполнит' : forecast !== null ? '▼ по прогнозу не выполнит' : '';
  return h(
    'div',
    { class: 'progress' },
    h('div', { class: 'top' }, h('span', null, label), h('strong', null, `${fmtInt(fact)} из ${fmtInt(plan)} · ${fmtPct(pct)}`)),
    track,
    h('div', { class: 'meta' }, [forecast !== null ? `прогноз: ${fmtInt(forecast)}` : '', status, metaExtra].filter(Boolean).join(' · ')),
  );
}

export interface FunnelStage {
  label: string;
  value: number;
  note?: string;
}

export function funnelStages(a: Agg): FunnelStage[] {
  const conv = conversionOf(a);
  return [
    { label: 'Звонки', value: a.calls },
    { label: 'Договорились о встрече', value: a.callMeetingSet, note: `${fmtPct(conv)} от звонков` },
    { label: 'Встречи', value: a.meetings },
    { label: 'Открыт продукт', value: productOpenedOf(a), note: `${fmtPct(a.meetings ? a.meetProduct / a.meetings : null)} встреч` },
  ];
}

export function funnel(stages: FunnelStage[]): HTMLElement {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return h(
    'div',
    { class: 'funnel' },
    stages.map((s, i) => {
      const fill = h('div', { class: 'fill' });
      fill.style.width = `${Math.max(1, (s.value / max) * 100)}%`;
      fill.style.background = i < 2 ? 'var(--series-1)' : 'var(--series-2)';
      return h('div', { class: 'stage' }, h('span', null, s.label), h('div', { class: 'track', 'data-tip': `${s.label}: ${fmtInt(s.value)}${s.note ? `\n${s.note}` : ''}` }, fill), h('span', { class: 'val' }, h('strong', null, fmtInt(s.value)), s.note ? h('div', { class: 'small muted' }, s.note) : null));
    }),
  );
}

export function barList(items: { label: string | Node; value: number; tip?: string; color?: string; text?: string }[], max?: number): HTMLElement {
  const m = max ?? Math.max(...items.map((i) => i.value), 1);
  return h(
    'div',
    { class: 'bars' },
    items.map((i) => {
      const fill = h('div', { class: 'fill' });
      fill.style.width = `${(i.value / m) * 100}%`;
      if (i.color) fill.style.background = i.color;
      return h('div', { class: 'bar-row' }, h('span', null, i.label), h('div', { class: 'track', 'data-tip': i.tip ?? null }, fill), h('span', { class: 'val' }, i.text ?? fmtInt(i.value)));
    }),
  );
}

export function weeksInPeriod(p: Period): number {
  return Math.max(1, periodLength(p) / 7);
}

export function activityText(a: Agg): string {
  return `${fmtInt(a.calls)} звонков · ${fmtInt(a.meetings)} встреч · всего ${fmtInt(activityOf(a))}`;
}

export function svg(html: string): HTMLElement {
  return raw(html, 'div', 'chart');
}

export function emptyState(text: string): HTMLElement {
  return h('div', { class: 'empty' }, text);
}
