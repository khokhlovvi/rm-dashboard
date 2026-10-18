import { activityOf, conversionOf, weeklySeries } from '../../core/metrics.ts';
import { lastWeekStarts } from '../../core/periods.ts';
import { change, METRIC_LABELS, standings, statValue, type ManagerStats, type MetricKey } from '../../core/ranking.ts';
import { downloadCsv, downloadXlsx, type Cell } from '../../data/export.ts';
import type { Ctx } from '../app.ts';
import { sparkline } from '../charts.ts';
import { h, raw } from '../dom.ts';
import { deltaEl, fmtInt, fmtNum, fmtPct, signed, plural } from '../format.ts';
import { compareNote, managerLink, pageHead } from '../widgets.ts';

type ColKey = 'rank' | 'name' | 'calls' | 'meetings' | 'conversion' | 'strategic' | 'followups' | 'planPct' | 'vsAvg' | 'vsBest' | 'delta' | 'rankMove';

let sortKey: ColKey = 'rank';
let sortAsc = true;

const isPct = (k: MetricKey) => k === 'conversion' || k === 'planPct';

export function rankingScreen(ctx: Ctx): HTMLElement {
  const key = ctx.ui.rankMetric;
  const stats = ctx.stats;
  const st = standings(stats, key);
  const weeks = lastWeekStarts(ctx.period.end, 12);
  const fmtV = (v: number | null) => (isPct(key) ? fmtPct(v) : fmtNum(v));
  const fmtDiff = (v: number | null) => (v === null ? '—' : isPct(key) ? `${signed(v * 100, (x) => x.toFixed(0))} п.п.` : signed(v));

  const rows = stats.map((m, i) => ({ m, s: st[i] }));
  const val = (r: { m: ManagerStats; s: (typeof st)[number] }, k: ColKey): number | string => {
    switch (k) {
      case 'rank':
        return r.s.rank;
      case 'name':
        return r.m.name;
      case 'calls':
        return r.m.agg.calls;
      case 'meetings':
        return r.m.agg.meetings;
      case 'conversion':
        return conversionOf(r.m.agg) ?? -1;
      case 'strategic':
        return r.m.agg.strategic;
      case 'followups':
        return r.m.agg.followups;
      case 'planPct':
        return r.m.plan.avgPct;
      case 'vsAvg':
        return r.s.vsAvg ?? -Infinity;
      case 'vsBest':
        return r.s.vsBest ?? -Infinity;
      case 'delta':
        return r.s.delta ?? -Infinity;
      case 'rankMove':
        return r.s.prevRank - r.s.rank;
    }
  };
  rows.sort((a, b) => {
    const x = val(a, sortKey);
    const y = val(b, sortKey);
    const c = typeof x === 'string' ? x.localeCompare(String(y), 'ru') : (x as number) - (y as number);
    return (sortAsc ? c : -c) || a.s.rank - b.s.rank;
  });

  const th = (k: ColKey, label: string, title?: string, cls = '') =>
    h(
      'th',
      {
        class: `sortable ${cls}`,
        title: title ?? 'Сортировать',
        'aria-sort': sortKey === k ? (sortAsc ? 'ascending' : 'descending') : null,
        onclick: () => {
          if (sortKey === k) sortAsc = !sortAsc;
          else {
            sortKey = k;
            sortAsc = k === 'rank' || k === 'name';
          }
          ctx.app.render();
        },
      },
      label,
      sortKey === k ? h('span', { class: 'arrow' }, sortAsc ? ' ▲' : ' ▼') : null,
    );

  const planLabel = ctx.period.kind === 'month' || ctx.period.kind === 'ytd' || ctx.period.kind === 'custom' ? 'План 3+6, ср.' : 'План 3+6';
  const table = h(
    'table',
    { class: 'data' },
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        th('rank', 'Место', `Место по метрике «${METRIC_LABELS[key]}»`),
        th('name', 'Менеджер', undefined, 'l'),
        th('calls', 'Звонки'),
        th('meetings', 'Встречи'),
        th('conversion', 'Конверсия', 'Звонки с договорённостью о встрече / все звонки'),
        th('strategic', 'Стратег.', 'Стратегические встречи'),
        th('followups', 'Фоллоуапы'),
        th('planPct', planLabel, 'Выполнение плана 3 + 6 (среднее по завершённым неделям периода)'),
        th('delta', 'Динамика', `Изменение метрики к предыдущему периоду (${compareNote(ctx)})`),
        th('vsAvg', 'От среднего', 'Отклонение метрики от среднего по команде'),
        th('vsBest', 'От лучшего', 'Отставание метрики от лучшего результата'),
        th('rankMove', 'Место было', 'Место в предыдущем периоде и сдвиг'),
        h('th', { class: 'l', title: 'Звонки + встречи по неделям, 12 недель' }, 'Активность, 12 нед.'),
      ),
    ),
    h(
      'tbody',
      null,
      rows.map(({ m, s }) => {
        const spark = weeklySeries(ctx.cube, m.index, weeks).map((p) => activityOf(p.agg));
        const move = s.prevRank - s.rank;
        return h(
          'tr',
          null,
          h('td', null, h('span', { class: `rank${s.rank <= 3 ? ' top' : ''}` }, String(s.rank))),
          h('td', { class: 'l' }, managerLink(m.name), h('div', { class: 'small muted' }, m.department)),
          h('td', null, fmtInt(m.agg.calls), ' ', deltaEl(change(m.agg.calls, m.prev.calls))),
          h('td', null, fmtInt(m.agg.meetings), ' ', deltaEl(change(m.agg.meetings, m.prev.meetings))),
          h('td', null, fmtPct(conversionOf(m.agg))),
          h('td', null, fmtInt(m.agg.strategic)),
          h('td', null, fmtInt(m.agg.followups)),
          h('td', null, fmtPct(m.plan.avgPct), m.plan.completeWeeks > 1 ? h('div', { class: 'small muted' }, `${m.plan.doneWeeks} из ${m.plan.completeWeeks} нед.`) : null),
          h('td', null, deltaEl(s.delta)),
          h('td', { 'data-tip': `${METRIC_LABELS[key]}: ${fmtV(s.value)}\nСреднее по команде: ${fmtV(s.avg)}` }, fmtDiff(s.vsAvg), s.vsAvgPct !== null && !isPct(key) ? h('div', { class: 'small muted' }, `${signed(s.vsAvgPct * 100, (x) => x.toFixed(0))}%`) : null),
          h('td', { 'data-tip': `Лучший результат: ${fmtV(s.best)}` }, s.vsBest === 0 ? h('strong', null, 'лучший') : fmtDiff(s.vsBest)),
          h(
            'td',
            null,
            String(s.prevRank),
            ' ',
            move === 0 ? h('span', { class: 'delta flat' }, '→') : h('span', { class: `delta ${move > 0 ? 'up' : 'down'}`, title: move > 0 ? 'поднялся' : 'опустился' }, `${move > 0 ? '▲' : '▼'}${Math.abs(move)}`),
          ),
          h('td', { class: 'l' }, raw(sparkline(spark, { tip: `${m.name}: ${spark.join(' · ')}` }), 'span')),
        );
      }),
      teamRow(ctx, stats, key),
    ),
  );

  const metricSel = h(
    'select',
    { 'aria-label': 'Метрика рейтинга', onchange: (e: Event) => ctx.app.setUi({ rankMetric: (e.target as HTMLSelectElement).value as MetricKey }) },
    (Object.keys(METRIC_LABELS) as MetricKey[]).map((k) => h('option', { value: k, selected: k === key }, `Рейтинг по: ${METRIC_LABELS[k]}`)),
  );
  const exportRows = (): Cell[][] => [
    ['Место', 'Менеджер', 'Подразделение', 'Звонки', 'Звонки, пред.', 'Встречи', 'Встречи, пред.', 'Конверсия, %', 'Стратег.', 'Фоллоуапы', 'План 3+6, %', 'Недель план выполнен', `${METRIC_LABELS[key]}`, 'От среднего', 'От лучшего', 'Динамика, %'],
    ...[...stats]
      .map((m, i) => ({ m, s: st[i] }))
      .sort((a, b) => a.s.rank - b.s.rank)
      .map(({ m, s }) => [
        s.rank,
        m.name,
        m.department,
        m.agg.calls,
        m.prev.calls,
        m.agg.meetings,
        m.prev.meetings,
        round1((conversionOf(m.agg) ?? 0) * 100),
        m.agg.strategic,
        m.agg.followups,
        round1(m.plan.avgPct * 100),
        m.plan.doneWeeks,
        round1((s.value ?? 0) * (isPct(key) ? 100 : 1)),
        round1((s.vsAvg ?? 0) * (isPct(key) ? 100 : 1)),
        round1((s.vsBest ?? 0) * (isPct(key) ? 100 : 1)),
        s.delta === null ? null : round1(s.delta * 100),
      ]),
  ];
  const fname = () => `рейтинг_${ctx.period.start}_${ctx.period.end}`;

  return h(
    'div',
    null,
    pageHead('Рейтинг менеджеров', `${stats.length} ${plural(stats.length, 'менеджер', 'менеджера', 'менеджеров')} · ${compareNote(ctx)}`, [
      metricSel,
      h('button', { class: 'btn', onclick: () => downloadCsv(fname(), exportRows()) }, '⤓ CSV'),
      h('button', { class: 'btn', onclick: () => void downloadXlsx(fname(), exportRows(), 'Рейтинг') }, '⤓ Excel'),
    ]),
    h('section', { class: 'card' }, h('div', { class: 'table-wrap' }, table), h('p', { class: 'note' }, `Место, отклонения и динамика считаются по метрике «${METRIC_LABELS[key]}». Клик по заголовку — сортировка. ▲▼ в столбцах звонков и встреч — к предыдущему такому же периоду.`)),
  );
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function teamRow(ctx: Ctx, stats: ManagerStats[], key: MetricKey): HTMLElement {
  const n = Math.max(1, stats.length);
  const team = ctx.cube.teamSum(ctx.period.start, ctx.period.end);
  const prev = ctx.cube.teamSum(ctx.prev.start, ctx.prev.end);
  const avgPlan = stats.reduce((s, m) => s + m.plan.avgPct, 0) / n;
  const avgVal = stats.reduce((s, m) => s + (statValue(m, key) ?? 0), 0) / n;
  return h(
    'tr',
    { class: 'team' },
    h('td', null, '—'),
    h('td', { class: 'l' }, 'Среднее по команде'),
    h('td', null, fmtNum(team.calls / n), ' ', deltaEl(change(team.calls, prev.calls))),
    h('td', null, fmtNum(team.meetings / n), ' ', deltaEl(change(team.meetings, prev.meetings))),
    h('td', null, fmtPct(conversionOf(team))),
    h('td', null, fmtNum(team.strategic / n)),
    h('td', null, fmtNum(team.followups / n)),
    h('td', null, fmtPct(avgPlan)),
    h('td', null, ''),
    h('td', { colspan: 3, class: 'small muted' }, `${METRIC_LABELS[key]}: ${isPct(key) ? fmtPct(avgVal) : fmtNum(avgVal)} в среднем`),
    h('td', null, ''),
  );
}
