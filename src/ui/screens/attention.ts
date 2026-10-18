import { SIGNAL_LABELS, type Signal, type SignalKind } from '../../core/attention.ts';
import { activityOf } from '../../core/metrics.ts';
import type { Ctx } from '../app.ts';
import { h } from '../dom.ts';
import { fmtInt, plural } from '../format.ts';
import { card, compareNote, emptyState, managerLink, pageHead } from '../widgets.ts';

const ICON: Record<SignalKind, string> = { drop: '▼', meetDrop: '▽', low: '↓', noMeetings: '⌀', planNone: '✕' };

let filter: SignalKind | '' = '';

export function attentionScreen(ctx: Ctx): HTMLElement {
  const s = ctx.settings;
  const all = ctx.signals;
  const list = filter ? all.filter((x) => x.kind === filter) : all;
  const counts = (Object.keys(SIGNAL_LABELS) as SignalKind[]).map((k) => ({ k, n: all.filter((x) => x.kind === k).length }));
  const chips = h(
    'div',
    { class: 'chips no-print' },
    h('button', { class: 'chip', 'aria-pressed': String(filter === ''), onclick: () => ((filter = ''), ctx.app.render()) }, `Все (${all.length})`),
    counts.map(({ k, n }) => h('button', { class: 'chip', 'aria-pressed': String(filter === k), onclick: () => ((filter = k), ctx.app.render()) }, `${ICON[k]} ${SIGNAL_LABELS[k]} (${n})`)),
  );

  const byManager = new Map<string, Signal[]>();
  for (const x of list) byManager.set(x.manager, [...(byManager.get(x.manager) ?? []), x]);
  const rows = [...byManager.entries()].sort((a, b) => b[1].filter((x) => x.severity === 'high').length - a[1].filter((x) => x.severity === 'high').length || b[1].length - a[1].length);

  const body = rows.length
    ? h(
        'div',
        { class: 'signals' },
        rows.map(([name, sigs]) => {
          const m = ctx.stats[sigs[0].index];
          const high = sigs.some((x) => x.severity === 'high');
          return h(
            'div',
            { class: `signal ${high ? 'high' : 'medium'}` },
            h('span', { class: 'ico', title: high ? 'высокая важность' : 'средняя важность' }, high ? '●' : '○'),
            h('div', null, managerLink(name), h('div', { class: 'small muted' }, `${m?.department ?? ''} · ${fmtInt(m ? activityOf(m.agg) : 0)} акт. за период`)),
            h(
              'ul',
              { class: 'sig-list' },
              sigs.map((x) => h('li', null, h('span', { class: `sig-ico ${x.severity}` }, ICON[x.kind]), h('strong', null, SIGNAL_LABELS[x.kind]), x.severity === 'high' ? ' · важно' : '', `: ${x.text.charAt(0).toLowerCase()}${x.text.slice(1)}`)),
            ),
          );
        }),
      )
    : emptyState('Сигналов нет — все менеджеры в норме.');

  const nMgr = new Set(all.map((x) => x.manager)).size;
  return h(
    'div',
    null,
    pageHead('Внимание', `${nMgr} ${plural(nMgr, 'менеджер', 'менеджера', 'менеджеров')} с сигналами · ${compareNote(ctx)}`),
    card('Сигналы', null, [chips, h('div', { class: 'mt' }, body)]),
    h(
      'p',
      { class: 'note' },
      `Правила: падение активности (звонки + встречи) на ${s.dropPct}% и больше к предыдущему такому же периоду (если там было не меньше ${s.dropMinBase}); `,
      `активность ниже ${s.minWeeklyActivity} в неделю; нет встреч ${s.noMeetingDays}+ дней к ${ctx.ref.split('-').reverse().join('.')}; `,
      `план прошлой недели не начат (0 стратегических и 0 фоллоуапов). `,
      h('a', { href: '#/settings' }, 'Изменить пороги →'),
    ),
  );
}
