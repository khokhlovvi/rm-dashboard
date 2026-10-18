import { activityOf, conversionOf, planFact, planSummary, portfolioDepth, weekPlan, weeklySeries } from '../../core/metrics.ts';
import { addDays, calendarRange, formatRange, formatShort, getPeriod, lastWeekStarts, weekKey } from '../../core/periods.ts';
import { change, METRIC_LABELS, standings, type MetricKey } from '../../core/ranking.ts';
import { SIGNAL_LABELS } from '../../core/attention.ts';
import type { Ctx } from '../app.ts';
import { legend, lineChart } from '../charts.ts';
import { h, raw } from '../dom.ts';
import { deltaEl, fmtInt, fmtNum, fmtPct, signed, STATUS_ICON, STATUS_LABEL, statusEl } from '../format.ts';
import { barList, card, chartWeeks, compareNote, emptyState, funnel, funnelStages, pageHead, progress, svg, weekLabel, weekTip } from '../widgets.ts';

const CARD_METRICS: MetricKey[] = ['activity', 'calls', 'meetings', 'conversion', 'strategic', 'followups', 'planPct', 'productOpened', 'depth'];

export function managerScreen(ctx: Ctx): HTMLElement {
  const { cube, ref } = ctx;
  const name = ctx.route[1] ?? cube.managers[0]?.name ?? '';
  const mi = cube.managerIndex(name);
  const picker = h(
    'select',
    { 'aria-label': 'Менеджер', onchange: (e: Event) => ctx.app.go(`manager/${encodeURIComponent((e.target as HTMLSelectElement).value)}`) },
    cube.managers.map((m) => h('option', { value: m.name, selected: m.name === name }, m.name)),
  );
  if (mi < 0) return h('div', null, pageHead('Карточка менеджера', null, [picker]), emptyState(name ? `«${name}» нет в данных с текущими фильтрами.` : 'Нет менеджеров в данных.'));

  const m = ctx.stats[mi];
  const n = cube.managers.length;
  const a = m.agg;

  // KPI с местом в команде
  const st = (k: MetricKey) => standings(ctx.stats, k)[mi];
  const kpi = (label: string, value: string, delta: HTMLElement, k: MetricKey) => {
    const s = st(k);
    return h(
      'section',
      { class: 'card kpi' },
      h('div', { class: 'label' }, label),
      h('div', { class: 'value' }, value),
      h('div', { class: 'foot' }, delta, h('span', null, `${s.rank} место из ${s.of}`)),
    );
  };
  const conv = conversionOf(a);
  const convPrev = conversionOf(m.prev);
  const kpis = h(
    'div',
    { class: 'grid cols-4' },
    kpi('Звонки', fmtInt(a.calls), deltaEl(change(a.calls, m.prev.calls)), 'calls'),
    kpi('Встречи', fmtInt(a.meetings), deltaEl(change(a.meetings, m.prev.meetings)), 'meetings'),
    kpi('Конверсия звонок → встреча', fmtPct(conv, 1), deltaEl(conv !== null && convPrev !== null ? (conv - convPrev) * 100 : null, { abs: true, suffix: ' п.п.' }), 'conversion'),
    kpi('Выполнение плана 3 + 6', fmtPct(m.plan.avgPct), deltaEl(Math.round((m.plan.avgPct - m.prevPlan.avgPct) * 100), { abs: true, suffix: ' п.п.' }), 'planPct'),
  );

  // Динамика по неделям: менеджер vs среднее команды
  const { starts, highlight } = chartWeeks(ctx);
  const mine = weeklySeries(cube, mi, starts);
  const team = weeklySeries(cube, 'team', starts);
  const labels = starts.map(weekLabel);
  const tips = starts.map((w) => weekTip(w, ref));
  const avg = (v: number) => Math.round((v / Math.max(1, n)) * 10) / 10;
  const chart = (title: string, field: 'calls' | 'meetings', color: string) =>
    card(title, 'по неделям · пунктир — среднее по команде', [
      raw(legend([{ name, color }, { name: 'Среднее по команде', color: 'var(--series-team)', dashed: true }])),
      svg(
        lineChart(
          [
            { name, values: mine.map((p) => p.agg[field]), color },
            { name: 'Среднее по команде', values: team.map((p) => avg(p.agg[field])), color: 'var(--series-team)', dashed: true, width: 1.5 },
          ],
          { labels, tips, highlight, height: 200, format: (v) => fmtNum(v) },
        ),
      ),
    ]);
  const convChart = card('Конверсия звонок → встреча', 'по неделям, %', [
    raw(legend([{ name, color: 'var(--series-3)' }, { name: 'Команда', color: 'var(--series-team)', dashed: true }])),
    svg(
      lineChart(
        [
          { name, values: mine.map((p) => (p.agg.calls ? Math.round((p.agg.callMeetingSet / p.agg.calls) * 100) : null)), color: 'var(--series-3)' },
          { name: 'Команда', values: team.map((p) => (p.agg.calls ? Math.round((p.agg.callMeetingSet / p.agg.calls) * 100) : null)), color: 'var(--series-team)', dashed: true, width: 1.5 },
        ],
        { labels, tips, highlight, height: 200, format: (v) => `${fmtNum(v)}%` },
      ),
    ),
  ]);

  // Сравнение с командой
  const isPct = (k: MetricKey) => k === 'conversion' || k === 'planPct';
  const f = (k: MetricKey, v: number | null) => (isPct(k) ? fmtPct(v) : fmtNum(v));
  const cmp = h(
    'table',
    { class: 'data' },
    h('thead', null, h('tr', null, h('th', { class: 'l' }, 'Показатель'), h('th', null, name), h('th', null, 'Среднее'), h('th', null, 'Лучший'), h('th', null, 'От среднего'), h('th', null, 'Место'), h('th', null, 'Динамика'))),
    h(
      'tbody',
      null,
      CARD_METRICS.map((k) => {
        const s = st(k);
        return h(
          'tr',
          null,
          h('td', { class: 'l' }, METRIC_LABELS[k]),
          h('td', null, h('strong', null, f(k, s.value))),
          h('td', null, f(k, s.avg)),
          h('td', null, f(k, s.best)),
          h('td', null, s.vsAvg === null ? '—' : isPct(k) ? `${signed(s.vsAvg * 100, (x) => x.toFixed(0))} п.п.` : signed(s.vsAvg)),
          h('td', null, `${s.rank} из ${s.of}`),
          h('td', null, deltaEl(s.delta)),
        );
      }),
    ),
  );

  // История плана
  const weeks = lastWeekStarts(ref, 16).map((start) => ({ start, end: addDays(start, 6), key: weekKey(start), complete: addDays(start, 6) <= ref }));
  const S = ctx.settings.strategicPerWeek;
  const F = ctx.settings.followupPerWeek;
  const planRow = h(
    'table',
    { class: 'data plan' },
    h('thead', null, h('tr', null, weeks.map((w) => h('th', { title: formatRange(w) }, formatShort(w.start))))),
    h(
      'tbody',
      null,
      h(
        'tr',
        null,
        weeks.map((w) => {
          const p = weekPlan(cube, mi, w);
          return h(
            'td',
            { class: `cell ${p.status}${w.complete ? '' : ' current'}`, 'data-tip': `${formatRange(w)}\nСтратегические: ${p.strategic} из ${S}\nФоллоуапы: ${p.followups} из ${F}\n${STATUS_LABEL[p.status]}` },
            `${STATUS_ICON[p.status]} ${p.strategic}/${S} · ${p.followups}/${F}`,
          );
        }),
      ),
    ),
  );
  const monthPlan = planSummary(cube, mi, calendarRange(getPeriod('month', ref)), ref);
  const ytdPlan = planSummary(cube, mi, calendarRange(getPeriod('ytd', ref)), ref);
  const lastWeekPlan = weekPlan(cube, mi, { ...getPeriod('lastWeek', ref), key: '', complete: true });

  // Продукты
  const prods = cube.products
    .map((p, i) => ({ label: p, value: a.products[i], tip: `${p}: ${a.products[i]} упоминаний` }))
    .filter((p) => p.value > 0)
    .sort((x, y) => y.value - x.value);
  const missing = cube.products.filter((_, i) => a.products[i] === 0);

  const pfc = planFact(cube, ref, 'calls', mi);
  const pfm = planFact(cube, ref, 'meetings', mi);
  const signals = ctx.signals.filter((s) => s.index === mi);

  return h(
    'div',
    null,
    pageHead(name, `${m.department || 'без подразделения'} · ${compareNote(ctx)}`, [picker, h('a', { class: 'btn', href: '#/ranking' }, '← Рейтинг')]),
    signals.length
      ? h('div', { class: 'alert warn' }, '⚠ ', signals.map((s, i) => [h('strong', null, SIGNAL_LABELS[s.kind]), `: ${s.text}`, i < signals.length - 1 ? ' · ' : '']))
      : null,
    kpis,
    h('div', { class: 'grid cols-2 mt' }, chart('Звонки', 'calls', 'var(--series-1)'), chart('Встречи', 'meetings', 'var(--series-2)')),
    h('div', { class: 'mt' }, card('Сравнение с командой', `за период · место из ${n}`, [h('div', { class: 'table-wrap' }, cmp)])),
    h('div', { class: 'grid cols-2 mt' }, convChart, card('Воронка', 'за период', [funnel(funnelStages(a))])),
    h(
      'section',
      { class: 'card mt' },
      h(
        'div',
        { class: 'card-head' },
        h('h2', null, `План ${S} + ${F} по неделям`),
        h('span', { class: 'hint' }, `прошлая неделя: `),
        statusEl(lastWeekPlan.status),
        h('span', { class: 'hint' }, `· месяц: ${monthPlan.doneWeeks} из ${monthPlan.completeWeeks} нед. · с начала года: ${ytdPlan.doneWeeks} из ${ytdPlan.completeWeeks} нед.`),
      ),
      h('div', { class: 'table-wrap' }, planRow),
    ),
    h(
      'div',
      { class: 'grid cols-2 mt' },
      card('Упоминаемые продукты', `глубина портфеля: ${portfolioDepth(a)} из ${cube.products.length}`, [
        prods.length ? barList(prods) : emptyState('Нет упоминаний продуктов за период'),
        missing.length ? h('p', { class: 'note' }, `Не упоминал(а): ${missing.join(', ')}.`) : null,
      ]),
      card('План и факт', `норматив ${ctx.settings.callsPerWeek} звонков и ${ctx.settings.meetingsPerWeek} встреч в неделю`, [
        progress('Звонки, текущая неделя', pfc.week.fact, pfc.week.plan, pfc.week.forecast === null ? null : Math.round(pfc.week.forecast)),
        progress('Встречи, текущая неделя', pfm.week.fact, pfm.week.plan, pfm.week.forecast === null ? null : Math.round(pfm.week.forecast)),
        progress('Звонки, месяц', pfc.month.fact, pfc.month.plan, pfc.month.forecast),
        progress('Встречи, месяц', pfm.month.fact, pfm.month.plan, pfm.month.forecast),
        h('p', { class: 'note' }, `Всего активностей за период: ${fmtInt(activityOf(a))}.`),
      ]),
    ),
  );
}
