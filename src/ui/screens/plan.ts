import { planSummary, teamPlanStatus, weekPlan, type PlanStatus } from '../../core/metrics.ts';
import { calendarRange, formatRange, formatShort, getPeriod, lastWeekStarts, monthName, parts, planWeeks, weekKey, addDays, type PlanWeek } from '../../core/periods.ts';
import { CAN_DOWNLOAD, downloadCsv, downloadXlsx, type Cell } from '../../data/export.ts';
import type { Ctx } from '../app.ts';
import { h } from '../dom.ts';
import { fmtPct, STATUS_ICON, STATUS_LABEL, statusEl } from '../format.ts';
import { card, managerLink, pageHead } from '../widgets.ts';

const N_WEEKS = 10;

export function planScreen(ctx: Ctx): HTMLElement {
  const { cube, ref, settings: s } = ctx;
  const S = s.strategicPerWeek;
  const F = s.followupPerWeek;
  // последние недели до текущей включительно
  const weeks: PlanWeek[] = lastWeekStarts(ref, N_WEEKS).map((start) => ({ start, end: addDays(start, 6), key: weekKey(start), complete: addDays(start, 6) <= ref }));
  const lastWeek = planWeeks(getPeriod('lastWeek', ref), ref)[0];
  const monthR = calendarRange(getPeriod('month', ref));
  const ytdR = calendarRange(getPeriod('ytd', ref));

  const rows = cube.managers.map((m, i) => ({
    m,
    i,
    weeks: weeks.map((w) => weekPlan(cube, i, w)),
    month: planSummary(cube, i, monthR, ref),
    ytd: planSummary(cube, i, ytdR, ref),
  }));
  rows.sort((a, b) => b.ytd.doneWeeks - a.ytd.doneWeeks || b.month.doneWeeks - a.month.doneWeeks || a.m.name.localeCompare(b.m.name, 'ru'));

  const table = h(
    'table',
    { class: 'data plan' },
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        h('th', { class: 'l' }, 'Менеджер'),
        weeks.map((w) => h('th', { title: formatRange(w) }, `${formatShort(w.start)}`, h('div', { class: 'small muted' }, w.key.slice(5).replace('W', 'нед. ') + (w.complete ? '' : ' · идёт')))),
        h('th', { title: `Недель с выполненным планом в месяце (${monthName(ref)})` }, `${monthName(ref)}`),
        h('th', { title: 'Недель с выполненным планом с начала года' }, `С начала ${parts(ref).y}`),
      ),
    ),
    h(
      'tbody',
      null,
      rows.map((r) =>
        h(
          'tr',
          null,
          h('td', { class: 'l' }, managerLink(r.m.name)),
          r.weeks.map((w) =>
            h(
              'td',
              {
                class: `cell ${w.status}${w.week.complete ? '' : ' current'}`,
                'data-tip': `${r.m.name}, ${formatRange(w.week)}${w.week.complete ? '' : ' (неделя идёт)'}\nСтратегические встречи: ${w.strategic} из ${S}\nФоллоуапы: ${w.followups} из ${F}\nВыполнение: ${fmtPct(w.pct)} — ${STATUS_LABEL[w.status]}`,
              },
              `${STATUS_ICON[w.status]} ${w.strategic}/${S} · ${w.followups}/${F}`,
            ),
          ),
          h('td', null, h('strong', null, `${r.month.doneWeeks}`), ` из ${r.month.completeWeeks}`),
          h('td', null, h('strong', null, `${r.ytd.doneWeeks}`), ` из ${r.ytd.completeWeeks}`),
        ),
      ),
    ),
  );

  const st = lastWeek ? teamPlanStatus(cube, lastWeek) : { done: 0, partial: 0, none: 0 };
  const lwRows = lastWeek ? cube.managers.map((m, i) => ({ m, p: weekPlan(cube, i, lastWeek) })) : [];
  const group = (status: PlanStatus) =>
    h(
      'div',
      null,
      h('div', { class: 'kpi' }, h('div', { class: 'value' }, String(st[status])), statusEl(status, status === 'done' ? 'выполнили полностью' : status === 'partial' ? 'частично' : 'не начали')),
      h(
        'p',
        { class: 'note' },
        lwRows
          .filter((x) => x.p.status === status)
          .map((x, k, arr) => [managerLink(x.m.name), ` (${x.p.strategic}/${S}, ${x.p.followups}/${F})`, k < arr.length - 1 ? ', ' : '']),
      ),
    );

  const exportRows = (): Cell[][] => [
    ['Менеджер', ...weeks.map((w) => `${w.key} стратег.`).flatMap((k) => [k, k.replace('стратег.', 'фоллоуап'), k.replace('стратег.', 'статус')]), 'Месяц: недель выполнено', 'Месяц: завершённых недель', 'Год: недель выполнено', 'Год: завершённых недель'],
    ...rows.map((r) => [r.m.name, ...r.weeks.flatMap((w) => [w.strategic, w.followups, STATUS_LABEL[w.status]]), r.month.doneWeeks, r.month.completeWeeks, r.ytd.doneWeeks, r.ytd.completeWeeks]),
  ];

  return h(
    'div',
    null,
    pageHead(`План ${S} + ${F}`, `${S} стратегические встречи и ${F} фоллоуапов на менеджера в неделю`, [
      CAN_DOWNLOAD ? h('button', { class: 'btn', onclick: () => downloadCsv(`план_${ref}`, exportRows()) }, '⤓ CSV') : null,
      CAN_DOWNLOAD ? h('button', { class: 'btn', onclick: () => void downloadXlsx(`план_${ref}`, exportRows(), 'План') }, '⤓ Excel') : null,
    ]),
    card('Прошлая неделя', lastWeek ? formatRange(lastWeek) : null, [h('div', { class: 'grid cols-3' }, group('done'), group('partial'), group('none'))]),
    h(
      'section',
      { class: 'card mt' },
      h('div', { class: 'card-head' }, h('h2', null, 'Выполнение по неделям'), h('span', { class: 'hint' }, `в клетке: стратегические / фоллоуапы · пунктир — неделя идёт · сортировка по числу выполненных недель с начала года`)),
      h('div', { class: 'table-wrap' }, table),
      h(
        'p',
        { class: 'note' },
        `Стратегическая встреча — с новым клиентом или с клиентом, с которым не было встреч ${s.strategicThresholdDays}+ дней. `,
        `Фоллоуап — звонок или встреча, где дорабатываем прежние договорённости; стратегическая встреча ${s.strategicCountsAsFollowup ? 'тоже засчитывается' : 'в фоллоуапы не засчитывается'}. `,
        'Неделя относится к месяцу и году, на которые приходится её четверг. ',
        h('a', { href: '#/settings' }, 'Настройки правил →'),
      ),
    ),
  );
}
