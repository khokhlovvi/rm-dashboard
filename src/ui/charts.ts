/**
 * Графики — ручной SVG. Библиотека не нужна: нам хватает линий, спарклайнов и тепловых карт,
 * а свои 200 строк дают полный контроль над темами, подписями и подсказками без лишних килобайт.
 */
import { esc } from './dom.ts';

export interface Series {
  name: string;
  values: (number | null)[];
  color: string; // CSS-цвет, обычно var(--series-N)
  dashed?: boolean;
  width?: number;
}

export interface LineChartOpts {
  labels: string[]; // подписи по оси X
  tips?: string[]; // заголовок подсказки для каждой точки X
  height?: number;
  width?: number;
  format?: (v: number) => string;
  highlight?: [number, number]; // диапазон индексов X для подсветки периода
  yMax?: number;
}

function niceStep(max: number, ticks: number): number {
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

const defFmt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

/** Линейный график с одной осью Y, сеткой, подписями и подсказкой-колонкой на каждую точку. */
export function lineChart(series: Series[], o: LineChartOpts): string {
  const W = o.width ?? 720;
  const H = o.height ?? 220;
  const fmt = o.format ?? defFmt;
  const m = { t: 10, r: 12, b: 26, l: 40 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const n = o.labels.length;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const dataMax = Math.max(o.yMax ?? 0, ...all, 1);
  const step = niceStep(dataMax, 4);
  const yMax = Math.ceil(dataMax / step) * step;
  const x = (i: number) => m.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => m.t + ih - (v / yMax) * ih;
  const parts: string[] = [];

  if (o.highlight) {
    const [a, b] = o.highlight;
    const half = n > 1 ? iw / (n - 1) / 2 : iw / 2;
    parts.push(`<rect class="highlight" x="${Math.max(m.l, x(a) - half)}" y="${m.t}" width="${Math.min(W - m.r, x(b) + half) - Math.max(m.l, x(a) - half)}" height="${ih}"/>`);
  }
  for (let v = 0; v <= yMax + 1e-9; v += step) {
    parts.push(`<line class="grid-line" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`);
    parts.push(`<text class="axis-text" x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`);
  }
  const every = Math.max(1, Math.ceil(n / 13));
  o.labels.forEach((l, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    if (i !== n - 1 && n - 1 - i < every) return; // не наезжать на последнюю подпись
    parts.push(`<text class="axis-text" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`);
  });
  for (const s of series) {
    let d = '';
    s.values.forEach((v, i) => {
      if (v === null) return;
      d += `${d && s.values[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    parts.push(
      `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width ?? 2}" stroke-linejoin="round" stroke-linecap="round"${s.dashed ? ' stroke-dasharray="5 4"' : ''}/>`,
    );
    const li = s.values.length - 1;
    const lv = s.values[li];
    if (lv !== null && lv !== undefined && !s.dashed) {
      parts.push(`<circle cx="${x(li)}" cy="${y(lv)}" r="4" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`);
    }
  }
  // колонки для подсказок
  const colW = n > 1 ? iw / (n - 1) : iw;
  for (let i = 0; i < n; i++) {
    const head = o.tips?.[i] ?? o.labels[i];
    const lines = series.map((s) => `${s.name}: ${s.values[i] === null ? '—' : fmt(s.values[i] as number)}`);
    parts.push(
      `<rect class="hover-col" x="${x(i) - colW / 2}" y="${m.t}" width="${colW}" height="${ih}" data-tip="${esc([head, ...lines].join('\n'))}"/>`,
    );
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map((s) => s.name).join(', '))}">${parts.join('')}</svg>`;
}

export function legend(items: { name: string; color: string; dashed?: boolean }[]): string {
  return `<div class="legend">${items
    .map((i) => `<span><span class="sw${i.dashed ? ' dash' : ''}" style="background:${i.color}"></span>${esc(i.name)}</span>`)
    .join('')}</div>`;
}

/** Спарклайн: линия + последняя точка. */
export function sparkline(values: number[], opts: { width?: number; height?: number; color?: string; tip?: string } = {}): string {
  const W = opts.width ?? 96;
  const H = opts.height ?? 24;
  const max = Math.max(...values, 1);
  const n = values.length;
  const x = (i: number) => 2 + (n <= 1 ? 0 : (i * (W - 6)) / (n - 1));
  const y = (v: number) => H - 3 - (v / max) * (H - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const c = opts.color ?? 'var(--series-1)';
  const last = values[n - 1] ?? 0;
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"${opts.tip ? ` data-tip="${esc(opts.tip)}"` : ''} role="img" aria-label="динамика"><path d="${d}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${x(n - 1)}" cy="${y(last)}" r="2.6" fill="${c}"/></svg>`;
}

/** Цвет клетки тепловой карты: смесь «низ → верх» в OKLab по интенсивности 0..1 (одна шкала, один оттенок). */
export function heatStyle(t: number, hue: 1 | 2 = 1): { style: string; dark: boolean } {
  const p = Math.round(Math.max(0, Math.min(1, t)) * 100);
  return { style: `background:color-mix(in oklab, var(--heat-hi-${hue}) ${p}%, var(--heat-lo))`, dark: p >= 55 };
}

export function heatLegend(hue: 1 | 2, max: number, unit = ''): string {
  return `<div class="heat-legend"><span>0</span><span class="bar" style="background:linear-gradient(90deg,var(--heat-lo),var(--heat-hi-${hue}))"></span><span>${max}${unit ? ' ' + esc(unit) : ''}</span></div>`;
}
