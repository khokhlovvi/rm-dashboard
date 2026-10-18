import { activityOf, conversionOf, planFact, planSummary, teamPlanStatus, weeklySeries } from '../../core/metrics.ts';
import { calendarRange, getPeriod, planWeeks, formatRange } from '../../core/periods.ts';
import { change } from '../../core/ranking.ts';
import { weeklySummary } from '../../core/summary.ts';
import type { Ctx } from '../app.ts';
import { lineChart } from '../charts.ts';
import { h } from '../dom.ts';
import { deltaEl, fmtInt, fmtNum, fmtPct, plural, statusEl } from '../format.ts';
import { card, chartWeeks, compareNote, funnel, funnelStages, pageHead, progress, svg, weekLabel, weekTip } from '../widgets.ts';

function kpi(label: string, value: string, delta: HTMLElement, foot: string): HTMLElement {
  return h('section', { class: 'card kpi' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), h('div', { class: 'foot' }, delta, h('span', null, foot)));
}

export function overviewScreen(ctx: Ctx): HTMLElement {
  const { cube, period, prev, ref } = ctx;
  const team = cube.teamSum(period.start, period.end);
  const teamPrev = cube.teamSum(prev.start, prev.end);
  const conv = conversionOf(team);
  const convPrev = conversionOf(teamPrev);
  const active = ctx.stats.filter((m) => activityOf(m.agg) > 0).length;
  const activePrev = ctx.stats.filter((m) => activityOf(m.prev) > 0).length;
  const n = cube.managers.length;
  const was = (v: number) => (ctx.prev.end < ctx.base.minDate ? 'нет данных за прошлый период' : `было ${fmtInt(v)}`);

  const kpis = h(
    'div',
    { class: 'grid cols-4' },
    kpi('Звонки', fmtInt(team.calls), deltaEl(change(team.calls, teamPrev.calls)), `${was(teamPrev.calls)} · отказов ${fmtInt(team.callRefusal)}`),
    kpi('Встречи', fmtInt(team.meetings), deltaEl(change(team.meetings, teamPrev.meetings)), `${was(teamPrev.meetings)} · стратегических ${fmtInt(team.strategic)}`),
    kpi(
      'Конверсия звонок → встреча',
      fmtPct(conv, 1),
      deltaEl(conv !== null && convPrev !== null ? (conv - convPrev) * 100 : null, { abs: true, suffix: ' п.п.' }),
      `${fmtInt(team.callMeetingSet)} договорённостей из ${fmtInt(team.calls)} звонков`,
    ),
    kpi('Активные менеджеры', `${active} из ${n}`, deltaEl(activePrev ? active - activePrev : null, { abs: true }), 'хотя бы одна активность в периоде'),
  );

  // План 3 + 6
  const lw = getPeriod('lastWeek', ref);
  const week = planWeeks(lw, ref)[0];
  const st = week ? teamPlanStatus(cube, week) : { done: 0, partial: 0, none: 0 };
  const month = calendarRange(getPeriod('month', ref));
  const ytd = calendarRange(getPeriod('ytd', ref));
  const sumWeeks = (range: { start: string; end: string }) =>
    cube.managers.reduce(
      (acc, _m, i) => {
        const s = planSummary(cube, i, range, ref);
        return { done: acc.done + s.doneWeeks, total: acc.total + s.completeWeeks };
      },
      { done: 0, total: 0 },
    );
  const mw = sumWeeks(month);
  const yw = sumWeeks(ytd);
  const s = ctx.settings;
  const planCard = card(
    `План ${s.strategicPerWeek} + ${s.followupPerWeek}: прошлая неделя`,
    week ? formatRange(week) : null,
    [
      h(
        'div',
        { class: 'grid cols-3' },
        [
          ['done', st.done, 'выполнили полностью'],
          ['partial', st.partial, 'выполнили частично'],
          ['none', st.none, 'не начали'],
        ].map(([k, v, l]) => h('div', { class: 'kpi' }, h('div', { class: 'value' }, String(v)), statusEl(k as 'done', l as string))),
      ),
      h(
        'p',
        { class: 'note' },
        `${s.strategicPerWeek} стратегические встречи и ${s.followupPerWeek} фоллоуапов на менеджера в неделю. `,
        `За месяц выполнено ${mw.done} из ${mw.total} менеджеро-недель (${fmtPct(mw.total ? mw.done / mw.total : null)}), `,
        `с начала года — ${yw.done} из ${yw.total} (${fmtPct(yw.total ? yw.done / yw.total : null)}). `,
        h('a', { href: '#/plan' }, 'Подробно →'),
      ),
    ],
  );

  const summary = card('Сводка прошлой недели', 'по агрегатам, по правилам', [h('ul', { class: 'summary' }, weeklySummary(cube, ref).map((t) => h('li', null, t)))]);

  // Динамика по неделям
  const { starts, highlight } = chartWeeks(ctx);
  const series = weeklySeries(cube, 'team', starts);
  const labels = starts.map(weekLabel);
  const tips = starts.map((w) => weekTip(w, ref));
  const avg = (v: number) => fmtNum(n ? v / n : 0);
  const callsChart = card('Звонки по неделям', `вся команда · выделен выбранный период`, [
    svg(lineChart([{ name: 'Звонки', values: series.map((p) => p.agg.calls), color: 'var(--series-1)' }], { labels, tips, highlight, height: 220 })),
    h('p', { class: 'note' }, `В среднем на менеджера за последнюю неделю: ${avg(series.at(-1)?.agg.calls ?? 0)} звонков.`),
  ]);
  const meetChart = card('Встречи по неделям', `вся команда · выделен выбранный период`, [
    svg(lineChart([{ name: 'Встречи', values: series.map((p) => p.agg.meetings), color: 'var(--series-2)' }], { labels, tips, highlight, height: 220 })),
    h('p', { class: 'note' }, `В среднем на менеджера за последнюю неделю: ${avg(series.at(-1)?.agg.meetings ?? 0)} встреч.`),
  ]);

  // План / факт
  const pfCalls = planFact(cube, ref, 'calls', 'team');
  const pfMeet = planFact(cube, ref, 'meetings', 'team');
  const pf = card('План и факт', `норматив: ${s.callsPerWeek} звонков и ${s.meetingsPerWeek} встреч на менеджера в неделю`, [
    h('h3', null, 'Текущая неделя'),
    progress('Звонки', pfCalls.week.fact, pfCalls.week.plan, pfCalls.week.forecast === null ? null : Math.round(pfCalls.week.forecast)),
    progress('Встречи', pfMeet.week.fact, pfMeet.week.plan, pfMeet.week.forecast === null ? null : Math.round(pfMeet.week.forecast)),
    h('h3', null, 'Месяц и прогноз к концу месяца'),
    progress('Звонки', pfCalls.month.fact, pfCalls.month.plan, pfCalls.month.forecast),
    progress('Встречи', pfMeet.month.fact, pfMeet.month.plan, pfMeet.month.forecast),
    h('p', { class: 'note' }, 'Прогноз = факт ÷ прошедшие рабочие дни × рабочих дней в периоде. Серая метка — план, тёмная — прогноз.'),
  ]);

  const fun = card('Воронка: звонок → встреча → результат', 'вся команда за период', [
    funnel(funnelStages(team)),
    h('p', { class: 'note' }, h('a', { href: '#/compare' }, 'Сравнить воронки менеджеров →')),
  ]);

  return h(
    'div',
    null,
    pageHead('Обзор команды', `${n} ${plural(n, 'менеджер', 'менеджера', 'менеджеров')} · ${compareNote(ctx)}`),
    kpis,
    h('div', { class: 'grid cols-2 mt' }, callsChart, meetChart),
    h('div', { class: 'grid cols-2 mt' }, planCard, summary),
    h('div', { class: 'grid cols-2 mt' }, pf, fun),
  );
}
