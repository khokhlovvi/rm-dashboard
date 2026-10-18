import { activityOf, conversionOf, rareProducts, teamPlanStatus, type Cube } from './metrics.ts';
import { getPeriod, planWeeks, previousPeriod } from './periods.ts';
import { change, computeStats } from './ranking.ts';

const pct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 100))}%`;

function dyn(cur: number, prev: number): string {
  const c = change(cur, prev);
  if (c === null) return 'без базы для сравнения';
  if (Math.abs(c) < 0.005) return 'на уровне позапрошлой';
  return `${c > 0 ? '▲' : '▼'} ${pct(c)} к позапрошлой`;
}

/**
 * Сводка прошлой недели: 3–5 фраз по агрегатам команды и менеджеров (шаблон по правилам,
 * без внешних API). Возвращает массив предложений.
 */
export function weeklySummary(cube: Cube, ref: string): string[] {
  const p = getPeriod('lastWeek', ref);
  const pp = previousPeriod(p);
  const team = cube.teamSum(p.start, p.end);
  const prevTeam = cube.teamSum(pp.start, pp.end);
  const out: string[] = [];
  if (cube.managers.length === 0) return ['Нет данных по менеджерам за выбранные фильтры.'];

  out.push(
    `Команда за прошлую неделю: ${team.calls} звонков (${dyn(team.calls, prevTeam.calls)}) и ${team.meetings} встреч (${dyn(team.meetings, prevTeam.meetings)}).`,
  );

  const week = planWeeks(p, ref)[0];
  if (week) {
    const st = teamPlanStatus(cube, week);
    out.push(`План 3 + 6 выполнили полностью ${st.done} из ${cube.managers.length}, частично — ${st.partial}, не начали — ${st.none}.`);
  }

  const stats = computeStats(cube, p, pp, ref);
  const growth = stats
    .map((m) => ({ name: m.name, cur: activityOf(m.agg), prev: activityOf(m.prev) }))
    .filter((m) => m.prev >= cube.settings.dropMinBase)
    .map((m) => ({ ...m, ch: (m.cur - m.prev) / m.prev }))
    .sort((a, b) => b.ch - a.ch);
  const up = growth.filter((g) => g.ch >= 0.15).slice(0, 2);
  const down = growth.filter((g) => g.ch <= -0.15).reverse().slice(0, 2);
  if (up.length) out.push(`Сильнее всех выросли: ${up.map((g) => `${g.name} (${pct(g.ch)})`).join(', ')}.`);
  if (down.length) out.push(`Просели: ${down.map((g) => `${g.name} (${pct(g.ch)})`).join(', ')}.`);
  if (!up.length && !down.length) out.push('Резких изменений активности у менеджеров нет (в пределах ±15%).');

  const conv = stats
    .filter((m) => m.agg.calls >= 10)
    .map((m) => ({ name: m.name, c: conversionOf(m.agg) ?? 0 }))
    .sort((a, b) => b.c - a.c)[0];
  const rare = rareProducts(cube, team).slice(0, 3);
  if (conv && out.length < 5) out.push(`Лучшая конверсия звонок → встреча — ${conv.name}: ${Math.round(conv.c * 100)}%.`);
  if (rare.length && out.length < 5) out.push(`Почти не упоминаются продукты: ${rare.map((r) => r.product).join(', ')}.`);
  return out;
}
