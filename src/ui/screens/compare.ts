import { activityOf, conversionOf, portfolioDepth, productOpenedOf, rareProducts, weeklySeries, type Agg } from '../../core/metrics.ts';
import { lastWeekStarts, weekStart } from '../../core/periods.ts';
import { standings, type MetricKey, METRIC_LABELS } from '../../core/ranking.ts';
import type { Ctx } from '../app.ts';
import { heatLegend, heatStyle } from '../charts.ts';
import { h, raw } from '../dom.ts';
import { fmtInt, fmtNum, fmtPct } from '../format.ts';
import { barList, card, compareNote, managerLink, pageHead, weekLabel, weekTip } from '../widgets.ts';

function heatCell(v: number, max: number, hue: 1 | 2, tip: string): HTMLElement {
  if (v === 0) return h('td', { class: 'zero', 'data-tip': tip }, '0');
  const { style, dark } = heatStyle(max ? v / max : 0, hue);
  return h('td', { style, class: dark ? 'dark' : null, 'data-tip': tip }, fmtInt(v));
}

export function compareScreen(ctx: Ctx): HTMLElement {
  const { cube, ui, ref } = ctx;
  const field = ui.heatField;
  const hue: 1 | 2 = field === 'calls' ? 1 : 2;
  const fieldLabel = field === 'calls' ? 'Звонки' : 'Встречи';

  // ——— менеджер × неделя ———
  const weeks = lastWeekStarts(ctx.period.end, ui.heatWeeks).filter((w) => w >= weekStart(cube.minDate));
  const byWeek = cube.managers.map((m, i) => ({ m, vals: weeklySeries(cube, i, weeks).map((p) => p.agg[field]) }));
  const maxW = Math.max(1, ...byWeek.flatMap((r) => r.vals));
  const weekHeat = h(
    'table',
    { class: 'heat' },
    h('thead', null, h('tr', null, h('th', { class: 'row' }, ''), weeks.map((w) => h('th', { title: weekTip(w, ref) }, weekLabel(w))), h('th', null, 'Итого'))),
    h(
      'tbody',
      null,
      byWeek.map((r) =>
        h(
          'tr',
          null,
          h('th', { class: 'row' }, managerLink(r.m.name)),
          r.vals.map((v, i) => heatCell(v, maxW, hue, `${r.m.name}\n${weekTip(weeks[i], ref)}\n${fieldLabel}: ${v}`)),
          h('th', null, fmtInt(r.vals.reduce((s, v) => s + v, 0))),
        ),
      ),
    ),
  );

  const segField = h(
    'div',
    { class: 'seg' },
    (['calls', 'meetings'] as const).map((f) => h('button', { 'aria-pressed': String(field === f), onclick: () => ctx.app.setUi({ heatField: f }) }, f === 'calls' ? 'Звонки' : 'Встречи')),
  );
  const segWeeks = h(
    'div',
    { class: 'seg' },
    [8, 13, 26, 40].map((n) => h('button', { 'aria-pressed': String(ui.heatWeeks === n), onclick: () => ctx.app.setUi({ heatWeeks: n }) }, `${n} нед.`)),
  );

  // ——— менеджер × продукт ———
  const aggs = cube.managers.map((m, i) => ({ m, i, a: cube.sum(i, ctx.period.start, ctx.period.end) }));
  const productOrder = cube.products.map((p, pi) => ({ p, pi, total: aggs.reduce((s, x) => s + x.a.products[pi], 0) })).filter((x) => x.total > 0 || x.pi < 11);
  const maxP = Math.max(1, ...aggs.flatMap((x) => x.a.products));
  const prodHeat = h(
    'table',
    { class: 'heat' },
    h('thead', null, h('tr', null, h('th', { class: 'row' }, ''), productOrder.map((x) => h('th', null, x.p)), h('th', { title: 'Сколько разных продуктов упоминал менеджер' }, 'Глубина'))),
    h(
      'tbody',
      null,
      aggs.map((x) =>
        h(
          'tr',
          null,
          h('th', { class: 'row' }, managerLink(x.m.name)),
          productOrder.map((p) => heatCell(x.a.products[p.pi], maxP, 1, `${x.m.name}\n${p.p}: ${x.a.products[p.pi]} упоминаний`)),
          h('th', null, `${portfolioDepth(x.a)} из ${productOrder.length}`),
        ),
      ),
      h('tr', null, h('th', { class: 'row' }, 'Команда'), productOrder.map((p) => h('th', null, fmtInt(p.total))), h('th', null, '')),
    ),
  );

  // ——— воронки ———
  const funnelRows = [...aggs].sort((a, b) => (conversionOf(b.a) ?? -1) - (conversionOf(a.a) ?? -1));
  const team = cube.teamSum(ctx.period.start, ctx.period.end);
  const maxCalls = Math.max(1, ...aggs.map((x) => x.a.calls));
  const bar = (v: number, max: number, color: string) => {
    const el = h('span', { class: 'minibar' });
    el.style.width = `${Math.min(80, Math.max(2, (v / max) * 80))}px`;
    el.style.background = color;
    return el;
  };
  const funnelRow = (name: Node | string, a: Agg, cls?: string) =>
    h(
      'tr',
      { class: cls ?? null },
      h('td', { class: 'l' }, name),
      h('td', null, fmtInt(a.calls), cls ? null : [' ', bar(a.calls, maxCalls, 'var(--series-1)')]),
      h('td', null, fmtInt(a.callMeetingSet)),
      h('td', null, h('strong', null, fmtPct(conversionOf(a)))),
      h('td', null, fmtInt(a.meetings), cls ? null : [' ', bar(a.meetings, maxCalls, 'var(--series-2)')]),
      h('td', null, fmtInt(productOpenedOf(a))),
      h('td', null, fmtPct(a.meetings ? a.meetProduct / a.meetings : null)),
      h('td', null, fmtPct(activityOf(a) ? (a.callRefusal + a.meetRefusal) / activityOf(a) : null)),
    );
  const funnelTable = h(
    'table',
    { class: 'data' },
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        h('th', { class: 'l' }, 'Менеджер'),
        h('th', null, 'Звонки'),
        h('th', null, 'Договорились'),
        h('th', null, 'Звонок → встреча'),
        h('th', null, 'Встречи'),
        h('th', null, 'Открыт продукт'),
        h('th', null, 'Встреча → продукт'),
        h('th', null, 'Доля отказов'),
      ),
    ),
    h('tbody', null, funnelRows.map((x) => funnelRow(managerLink(x.m.name), x.a)), funnelRow('Команда', team, 'team')),
  );

  // ——— портфель ———
  const rare = rareProducts(cube, team, 0.04);
  const depth = barList(
    [...aggs]
      .sort((a, b) => portfolioDepth(b.a) - portfolioDepth(a.a))
      .map((x) => ({ label: managerLink(x.m.name), value: portfolioDepth(x.a), text: `${portfolioDepth(x.a)} из ${productOrder.length}`, tip: `${x.m.name}: ${portfolioDepth(x.a)} разных продуктов` })),
    productOrder.length,
  );
  const totalMentions = team.products.reduce((s, v) => s + v, 0);
  const productShare = barList(
    productOrder
      .map((p) => ({ label: p.p, value: p.total, text: fmtPct(totalMentions ? p.total / totalMentions : null), tip: `${p.p}: ${p.total} упоминаний`, color: rare.some((r) => r.product === p.p) ? 'var(--bad)' : undefined }))
      .sort((a, b) => b.value - a.value),
  );

  return h(
    'div',
    null,
    pageHead('Сравнение менеджеров', compareNote(ctx)),
    sideBySide(ctx),
    h(
      'section',
      { class: 'card mt' },
      h('div', { class: 'card-head' }, h('h2', null, `Менеджер × неделя: ${fieldLabel.toLowerCase()}`), h('span', { class: 'hint' }, 'цвет — интенсивность, число — количество'), h('div', { class: 'right no-print' }, segField, segWeeks)),
      h('div', { class: 'table-wrap' }, weekHeat),
      raw(heatLegend(hue, maxW, field === 'calls' ? 'звонков' : 'встреч')),
    ),
    h(
      'section',
      { class: 'card mt' },
      h('div', { class: 'card-head' }, h('h2', null, 'Менеджер × продукт'), h('span', { class: 'hint' }, 'число упоминаний продукта в отчётах за выбранный период')),
      h('div', { class: 'table-wrap' }, prodHeat),
      raw(heatLegend(1, maxP, 'упоминаний')),
    ),
    h('div', { class: 'grid cols-2 mt' }, card('Глубина портфеля', 'сколько разных продуктов предлагает менеджер', [depth]), card('Доля продуктов в упоминаниях', rare.length ? `красным — почти не упоминаются (< 4%): ${rare.map((r) => r.product).join(', ')}` : null, [productShare])),
    h('div', { class: 'mt' }, card('Воронка по менеджерам', 'звонок → встреча → результат · сортировка по конверсии', [h('div', { class: 'table-wrap' }, funnelTable)])),
  );
}

const SIDE_METRICS: MetricKey[] = ['activity', 'calls', 'meetings', 'conversion', 'strategic', 'followups', 'planPct', 'productOpened', 'depth'];

/** Выбранные менеджеры бок о бок: значения, место, отклонение от среднего; лучший в строке выделен. */
function sideBySide(ctx: Ctx): HTMLElement {
  const names = ctx.stats.map((m) => m.name);
  let sel = ctx.ui.compare.filter((n) => names.includes(n));
  if (sel.length < 2) {
    const top = standings(ctx.stats, 'activity')
      .map((s, i) => ({ s, n: names[i] }))
      .sort((a, b) => a.s.rank - b.s.rank);
    sel = [top[0]?.n, top[Math.floor(top.length / 2)]?.n, top.at(-1)?.n].filter((x): x is string => !!x && x !== undefined);
    sel = [...new Set(sel)];
  }
  const toggle = (n: string) => {
    const cur = new Set(sel);
    if (cur.has(n)) cur.delete(n);
    else if (cur.size < 4) cur.add(n);
    ctx.app.setUi({ compare: [...cur] });
  };
  const chips = h(
    'div',
    { class: 'chips no-print' },
    names.map((n) => h('button', { class: 'chip', 'aria-pressed': String(sel.includes(n)), onclick: () => toggle(n), title: sel.length >= 4 && !sel.includes(n) ? 'Можно выбрать до 4 менеджеров' : null }, n)),
  );
  const isPct = (k: MetricKey) => k === 'conversion' || k === 'planPct';
  const idx = sel.map((n) => names.indexOf(n));
  const table = h(
    'table',
    { class: 'data' },
    h('thead', null, h('tr', null, h('th', { class: 'l' }, 'Показатель'), sel.map((n) => h('th', null, managerLink(n))), h('th', null, 'Среднее'), h('th', null, 'Лучший'))),
    h(
      'tbody',
      null,
      SIDE_METRICS.map((k) => {
        const st = standings(ctx.stats, k);
        const vals = idx.map((i) => st[i].value ?? -Infinity);
        const bestSel = Math.max(...vals);
        const f = (v: number | null) => (isPct(k) ? fmtPct(v) : fmtNum(v));
        return h(
          'tr',
          null,
          h('td', { class: 'l' }, METRIC_LABELS[k]),
          idx.map((i) =>
            h(
              'td',
              { 'data-tip': `Место: ${st[i].rank} из ${st[i].of}` },
              st[i].value === bestSel && sel.length > 1 ? h('strong', null, f(st[i].value), ' ★') : f(st[i].value),
              h('div', { class: 'small muted' }, `${st[i].rank} место`),
            ),
          ),
          h('td', { class: 'muted' }, f(st[0]?.avg ?? null)),
          h('td', { class: 'muted' }, f(st[0]?.best ?? null)),
        );
      }),
    ),
  );
  return card('Бок о бок', 'выберите от 2 до 4 менеджеров · ★ — лучший среди выбранных', [chips, h('div', { class: 'table-wrap mt' }, table)]);
}
