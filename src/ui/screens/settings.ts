import { DEFAULT_SETTINGS, type Settings, type StrategicMode } from '../../core/settings.ts';
import type { Ctx } from '../app.ts';
import { h } from '../dom.ts';
import { card, pageHead } from '../widgets.ts';

type NumKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];

const NUMBERS: { key: NumKey; label: string; hint: string; min?: number; max?: number }[] = [
  { key: 'strategicPerWeek', label: 'Стратегических встреч в неделю', hint: 'план на менеджера' },
  { key: 'followupPerWeek', label: 'Фоллоуапов в неделю', hint: 'план на менеджера' },
  { key: 'strategicThresholdDays', label: 'Порог «давно не встречались», дней', hint: 'встреча после стольких дней без встреч — стратегическая' },
  { key: 'callsPerWeek', label: 'Норматив звонков в неделю', hint: 'для плана/факта и прогноза' },
  { key: 'meetingsPerWeek', label: 'Норматив встреч в неделю', hint: 'для плана/факта и прогноза' },
  { key: 'dropPct', label: 'Падение активности, %', hint: 'сигнал «Внимание», к предыдущему периоду', max: 100 },
  { key: 'dropMinBase', label: 'Минимальная база для падения', hint: 'не сигналить, если в прошлом периоде было меньше' },
  { key: 'minWeeklyActivity', label: 'Порог активности в неделю', hint: 'звонки + встречи; ниже — сигнал' },
  { key: 'noMeetingDays', label: 'Дней без встреч', hint: 'сигнал «Нет встреч»' },
];

export function settingsScreen(ctx: Ctx): HTMLElement {
  const s = { ...ctx.settings };
  const save = () => ctx.app.setSettings({ ...s });

  const nums = NUMBERS.map((f) => [
    h('label', { for: `s-${f.key}` }, f.label),
    h('input', {
      id: `s-${f.key}`,
      type: 'number',
      min: f.min ?? 0,
      max: f.max ?? null,
      step: 1,
      value: s[f.key],
      onchange: (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        if (Number.isFinite(v) && v >= 0) {
          s[f.key] = v;
          save();
        }
      },
    }),
    h('span', { class: 'small muted' }, f.hint, s[f.key] !== DEFAULT_SETTINGS[f.key] ? ` · по умолчанию ${DEFAULT_SETTINGS[f.key]}` : ''),
  ]);

  const modes: { v: StrategicMode; l: string }[] = [
    { v: 'auto', l: 'Авто: по дням с последней встречи, если они есть, иначе по признаку из системы' },
    { v: 'days', l: 'Только по дням / признаку «новый клиент»' },
    { v: 'flag', l: 'Только по признаку «стратегическая встреча» из системы' },
  ];

  return h(
    'div',
    null,
    pageHead('Настройки', 'хранятся в этом браузере', [
      h(
        'button',
        {
          class: 'btn',
          onclick: () => ctx.app.setSettings({ ...DEFAULT_SETTINGS }),
        },
        '↺ Сбросить',
      ),
    ]),
    h(
      'div',
      { class: 'grid' },
      card('Нормативы и пороги', null, [h('div', { class: 'form-grid' }, nums.flat())]),
      card('Правила плана', null, [
      h(
        'div',
        { class: 'form-grid' },
        h('label', { for: 's-mode' }, 'Стратегическая встреча'),
        h(
          'select',
          {
            id: 's-mode',
            style: 'grid-column: span 2',
            onchange: (e: Event) => {
              s.strategicMode = (e.target as HTMLSelectElement).value as StrategicMode;
              save();
            },
          },
          modes.map((m) => h('option', { value: m.v, selected: s.strategicMode === m.v }, m.l)),
        ),
        h('label', { for: 's-sf' }, 'Стратегическая встреча — ещё и фоллоуап'),
        h('input', {
          id: 's-sf',
          type: 'checkbox',
          checked: s.strategicCountsAsFollowup,
          onchange: (e: Event) => {
            s.strategicCountsAsFollowup = (e.target as HTMLInputElement).checked;
            save();
          },
        }),
        h('span', { class: 'small muted' }, 'по умолчанию нет: одна встреча закрывает только одну часть плана'),
        h('label', { for: 's-ref' }, 'Опорная дата («сегодня»)'),
        h('input', {
          id: 's-ref',
          type: 'date',
          value: s.refDate ?? '',
          onchange: (e: Event) => {
            const v = (e.target as HTMLInputElement).value;
            s.refDate = v || null;
            save();
          },
        }),
        h('span', { class: 'small muted' }, `пусто — автоматически (сейчас ${ctx.ref.split('-').reverse().join('.')}): сегодня, если данные свежие, иначе последняя дата в данных`),
      ),
    ]),
    ),
  );
}
