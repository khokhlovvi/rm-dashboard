import { Cube, type Filters } from '../core/metrics.ts';
import { diffDays, getPeriod, PERIOD_LABELS, periodTitle, previousPeriod, today, type Period, type PeriodKind } from '../core/periods.ts';
import { computeStats, type ManagerStats, type MetricKey } from '../core/ranking.ts';
import { normalizeSettings, type Settings } from '../core/settings.ts';
import type { Dataset } from '../core/types.ts';
import { attentionSignals, type Signal } from '../core/attention.ts';
import { loadDataset, readJson, writeJson } from '../data/store.ts';
import { h } from './dom.ts';

/** Сборка для просмотрщика артефактов (`npm run build:artifact`): там нельзя печатать и скачивать файлы. */
export const EMBEDDED = import.meta.env.MODE === 'artifact';
const CAN_PRINT = !EMBEDDED;

export interface UiState {
  period: PeriodKind;
  customStart: string;
  customEnd: string;
  department: string;
  manager: string;
  product: string;
  theme: 'auto' | 'light' | 'dark';
  rankMetric: MetricKey;
  heatField: 'calls' | 'meetings';
  heatWeeks: number;
  compare: string[];
}

const KEY_UI = 'rm-dashboard:ui:v1';
const KEY_SETTINGS = 'rm-dashboard:settings:v1';

const DEFAULT_UI: UiState = {
  period: 'lastWeek',
  customStart: '',
  customEnd: '',
  department: '',
  manager: '',
  product: '',
  theme: 'auto',
  rankMetric: 'activity',
  heatField: 'calls',
  heatWeeks: 13,
  compare: [],
};

export interface Ctx {
  ds: Dataset;
  settings: Settings;
  ui: UiState;
  /** Куб без фильтров — для списков менеджеров/подразделений */
  base: Cube;
  /** Куб с фильтрами подразделения, менеджера и продукта */
  cube: Cube;
  ref: string;
  period: Period;
  prev: Period;
  stats: ManagerStats[];
  signals: Signal[];
  route: string[];
  app: App;
}

export type Screen = (ctx: Ctx) => HTMLElement;

export interface Route {
  path: string;
  title: string;
  screen: Screen;
  hidden?: boolean;
}

/**
 * Опорная дата: из настроек; иначе сегодня, если данные дошли до последней недели;
 * иначе последняя дата в данных (для старых выгрузок).
 */
export function resolveRef(settings: Settings, maxDate: string, now = today()): string {
  if (settings.refDate) return settings.refDate;
  if (maxDate <= now && diffDays(now, maxDate) <= 7) return now;
  return maxDate;
}

export class App {
  ds: Dataset;
  settings: Settings;
  ui: UiState;
  private routes: Route[] = [];
  private root: HTMLElement;
  private cache = new Map<string, Cube>();
  private scrollKey = '';
  /** Текущий маршрут: из hash, но хранится и в памяти — на случай, если среда не даёт менять hash (встраивание). */
  private path = location.hash.replace(/^#\/?/, '');
  /** data-theme, выставленный внешней средой (например, просмотрщиком артефактов), — для режима «Авто». */
  private readonly hostTheme = document.documentElement.getAttribute('data-theme');

  constructor(root: HTMLElement) {
    this.root = root;
    this.ds = loadDataset();
    this.settings = normalizeSettings(readJson(KEY_SETTINGS, null));
    this.ui = { ...DEFAULT_UI, ...readJson<Partial<UiState>>(KEY_UI, {}) };
  }

  register(routes: Route[]): this {
    this.routes = routes;
    return this;
  }

  start(): void {
    window.addEventListener('hashchange', () => {
      this.path = location.hash.replace(/^#\/?/, '');
      this.render();
    });
    // Внутренние ссылки «#/...» обрабатываем сами: так навигация работает и там, где hash менять нельзя
    document.addEventListener('click', (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#/"]');
      if (!a || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey) return;
      e.preventDefault();
      this.go(a.getAttribute('href')!.slice(2));
    });
    window.addEventListener('beforeprint', () => document.documentElement.setAttribute('data-theme', 'light'));
    window.addEventListener('afterprint', () => this.applyTheme());
    this.applyTheme();
    this.render();
  }

  setUi(patch: Partial<UiState>): void {
    this.ui = { ...this.ui, ...patch };
    writeJson(KEY_UI, this.ui);
    if ('theme' in patch) this.applyTheme();
    this.render();
  }

  setSettings(s: Settings): void {
    this.settings = s;
    writeJson(KEY_SETTINGS, s);
    this.cache.clear();
    this.render();
  }

  setDataset(ds: Dataset): void {
    this.ds = ds;
    this.cache.clear();
    // фильтры могут ссылаться на менеджеров старого набора
    this.ui = { ...this.ui, department: '', manager: '', product: '', compare: [] };
    writeJson(KEY_UI, this.ui);
    this.render();
  }

  go(path: string): void {
    this.path = path;
    try {
      history.pushState(null, '', `#/${path}`);
    } catch {
      /* среда не разрешает менять адрес — маршрут остаётся в памяти */
    }
    this.render();
  }

  private applyTheme(): void {
    const t = this.ui.theme === 'auto' ? this.hostTheme : this.ui.theme;
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }

  private cube(filters: Filters, departments?: string[]): Cube {
    const key = JSON.stringify([filters, this.settings]);
    let c = this.cache.get(key);
    if (!c) {
      c = new Cube(this.ds.activities, this.settings, filters, departments);
      this.cache.set(key, c);
    }
    return c;
  }

  context(route: string[]): Ctx {
    const base = this.cube({ department: '', manager: '', product: '' });
    const cube = this.cube({ department: this.ui.department, manager: this.ui.manager, product: this.ui.product }, base.departments);
    const ref = resolveRef(this.settings, base.maxDate);
    const custom = this.ui.customStart && this.ui.customEnd ? { start: this.ui.customStart, end: this.ui.customEnd } : undefined;
    const period = getPeriod(this.ui.period, ref, custom);
    const prev = previousPeriod(period);
    const stats = computeStats(cube, period, prev, ref);
    const signals = attentionSignals(cube, stats, period, ref);
    return { ds: this.ds, settings: this.settings, ui: this.ui, base, cube, ref, period, prev, stats, signals, route, app: this };
  }

  render(): void {
    const hash = this.path;
    const route = hash.split('/').map((s) => decodeURIComponent(s));
    const r = this.routes.find((x) => x.path === route[0]) ?? this.routes[0];
    const ctx = this.context(route);
    const y = window.scrollY;
    const key = hash;
    const filters = [this.ui.department, this.ui.manager, this.ui.product].filter(Boolean).join(' · ');
    const printHead = h('div', { class: 'print-only small' }, `Активность клиентских менеджеров · ${periodTitle(ctx.period)}${filters ? ` · фильтр: ${filters}` : ''} · данные: ${ctx.ds.label} · напечатано ${new Date().toLocaleDateString('ru-RU')}`);
    this.root.replaceChildren(this.topbar(ctx), this.nav(ctx, r), h('main', { class: 'page' }, printHead, r.screen(ctx)));
    document.title = `${r.title} — Активность РМ`;
    // при смене фильтров остаёмся на месте, при переходе — наверх
    window.scrollTo(0, key === this.scrollKey ? y : 0);
    this.scrollKey = key;
  }

  private topbar(ctx: Ctx): HTMLElement {
    const u = this.ui;
    const kinds: PeriodKind[] = ['lastWeek', 'week', 'month', 'ytd', 'custom'];
    const seg = h(
      'div',
      { class: 'seg', role: 'group', 'aria-label': 'Период' },
      kinds.map((k) => h('button', { 'aria-pressed': String(u.period === k), onclick: () => this.setUi({ period: k }) }, PERIOD_LABELS[k])),
    );
    const custom =
      u.period === 'custom'
        ? h(
            'span',
            { class: 'filters' },
            h('input', {
              type: 'date',
              value: ctx.period.start,
              'aria-label': 'Начало периода',
              onchange: (e: Event) => this.setUi({ customStart: (e.target as HTMLInputElement).value, customEnd: ctx.period.end }),
            }),
            '–',
            h('input', {
              type: 'date',
              value: ctx.period.end,
              'aria-label': 'Конец периода',
              onchange: (e: Event) => this.setUi({ customEnd: (e.target as HTMLInputElement).value, customStart: ctx.period.start }),
            }),
          )
        : null;
    const select = (label: string, value: string, options: string[], onChange: (v: string) => void, all = 'Все') =>
      h(
        'select',
        { 'aria-label': label, title: label, onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) },
        h('option', { value: '' }, `${label}: ${all.toLowerCase()}`),
        options.map((o) => h('option', { value: o, selected: o === value }, o)),
      );
    const managers = ctx.base.managers.filter((m) => !u.department || m.department === u.department).map((m) => m.name);
    const themeNext = { auto: 'light', light: 'dark', dark: 'auto' } as const;
    const themeLabel = { auto: '◐ Авто', light: '☀ Светлая', dark: '☾ Тёмная' };
    return h(
      'header',
      { class: 'topbar' },
      h(
        'div',
        { class: 'topbar-inner' },
        h('div', { class: 'brand' }, h('h1', null, 'Активность клиентских менеджеров'), h('small', null, `${periodTitle(ctx.period)} · данные: ${ctx.ds.source === 'demo' ? 'демо' : ctx.ds.label}`)),
        h(
          'div',
          { class: 'filters' },
          seg,
          custom,
          ctx.base.departments.length > 1 ? select('Подразделение', u.department, ctx.base.departments, (v) => this.setUi({ department: v, manager: '' })) : null,
          select('Менеджер', u.manager, managers, (v) => this.setUi({ manager: v }), 'Все'),
          select('Продукт', u.product, ctx.base.products, (v) => this.setUi({ product: v }), 'Все'),
          h('button', { class: 'btn', title: 'Сменить тему', onclick: () => this.setUi({ theme: themeNext[u.theme] }) }, themeLabel[u.theme]),
          CAN_PRINT ? h('button', { class: 'btn', title: 'Печатная версия для планёрки', onclick: () => window.print() }, '⎙ Печать') : null,
        ),
      ),
    );
  }

  private nav(ctx: Ctx, current: Route): HTMLElement {
    return h(
      'nav',
      { class: 'nav', 'aria-label': 'Разделы' },
      h(
        'div',
        { class: 'nav-inner' },
        this.routes
          .filter((r) => !r.hidden)
          .map((r) =>
            h(
              'a',
              { href: `#/${r.path}`, 'aria-current': r === current ? 'page' : null },
              r.title,
              r.path === 'attention' && ctx.signals.length ? h('span', { class: 'badge', title: 'сигналов' }, String(new Set(ctx.signals.map((s) => s.manager)).size)) : null,
            ),
          ),
      ),
    );
  }
}
