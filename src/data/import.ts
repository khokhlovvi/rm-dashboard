import { addDays, diffDays, isIsoDate, makeIso } from '../core/periods.ts';
import { PRODUCTS, type Activity, type ActivityKind, type ActivityResult, type ActivityType } from '../core/types.ts';

export type FieldKey = 'date' | 'manager' | 'department' | 'type' | 'result' | 'products' | 'kind' | 'daysSince' | 'lastMeetingDate' | 'newClient';

export interface FieldSpec {
  key: FieldKey;
  label: string;
  required: boolean;
  hint: string;
  synonyms: string[];
}

/** Схема импорта. Синонимы — для автосопоставления заголовков (без учёта регистра и пробелов). */
export const FIELDS: FieldSpec[] = [
  { key: 'date', label: 'Дата', required: true, hint: 'ДД.ММ.ГГГГ, ГГГГ-ММ-ДД или дата Excel', synonyms: ['дата', 'date', 'дата активности', 'дата контакта', 'день'] },
  { key: 'manager', label: 'Менеджер', required: true, hint: 'ФИО или код менеджера', synonyms: ['менеджер', 'рм', 'rm', 'manager', 'клиентский менеджер', 'сотрудник', 'фио менеджера', 'ответственный'] },
  { key: 'department', label: 'Подразделение', required: false, hint: 'необязательно', synonyms: ['подразделение', 'отдел', 'офис', 'department', 'блок', 'филиал'] },
  { key: 'type', label: 'Тип активности', required: true, hint: 'звонок / встреча', synonyms: ['тип', 'тип активности', 'type', 'activity', 'канал', 'вид контакта'] },
  { key: 'result', label: 'Результат', required: false, hint: 'договорились о встрече / открыт продукт / отказ', synonyms: ['результат', 'result', 'итог', 'outcome'] },
  { key: 'products', label: 'Продукт', required: false, hint: 'один или несколько через , ; /', synonyms: ['продукт', 'продукты', 'product', 'products', 'упомянутые продукты'] },
  { key: 'kind', label: 'Вид активности', required: false, hint: 'стратегическая встреча / фоллоуап / прочее', synonyms: ['вид активности', 'вид', 'kind', 'категория', 'цель', 'тип встречи'] },
  {
    key: 'daysSince',
    label: 'Дней с последней встречи',
    required: false,
    hint: 'число; пусто — нет данных',
    synonyms: ['дней с последней встречи', 'дней с последней встречи с клиентом', 'дней без встреч', 'days since last meeting', 'давность встречи'],
  },
  { key: 'lastMeetingDate', label: 'Дата последней встречи', required: false, hint: 'если нет числа дней — посчитаем сами', synonyms: ['дата последней встречи', 'последняя встреча', 'last meeting', 'last meeting date'] },
  { key: 'newClient', label: 'Новый клиент', required: false, hint: 'да / нет', synonyms: ['новый клиент', 'новый', 'new client', 'is new'] },
];

export type Mapping = Partial<Record<FieldKey, number>>;

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[\s_\-.:]+/g, ' ').trim();

export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<number>();
  const hs = headers.map((h) => norm(String(h ?? '')));
  // сначала точные совпадения, потом «содержит»
  for (const pass of ['exact', 'contains'] as const) {
    for (const f of FIELDS) {
      if (m[f.key] !== undefined) continue;
      const idx = hs.findIndex((h, i) => !used.has(i) && f.synonyms.some((s) => (pass === 'exact' ? h === norm(s) : h.includes(norm(s)))));
      if (idx >= 0) {
        m[f.key] = idx;
        used.add(idx);
      }
    }
  }
  return m;
}

/** Колонки, похожие на персональные данные клиента: в приложение не попадают. */
export const SENSITIVE_RE = /клиент|client|телефон|phone|сч[её]т|account|инн|inn|паспорт|e-?mail|почт|контакт|адрес|огрн|кпп/i;

export function sensitiveColumns(headers: string[], mapping: Mapping): string[] {
  const mapped = new Set(Object.values(mapping));
  return headers.filter((h, i) => !mapped.has(i) && SENSITIVE_RE.test(String(h)));
}

// ——— Разбор значений ———

/** Дата из Date, серийного номера Excel или строки ДД.ММ.ГГГГ / ГГГГ-ММ-ДД / ДД/ММ/ГГГГ (время отбрасывается). */
export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // read-excel-file отдаёт даты в UTC-полночь
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 80000) {
    return addDays('1899-12-30', Math.floor(v));
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const iso = makeIso(+m[1], +m[2], +m[3]);
    return isIsoDate(iso) ? iso : null;
  }
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const iso = makeIso(y, +m[2], +m[1]);
    return isIsoDate(iso) ? iso : null;
  }
  return null;
}

export function parseType(v: unknown): ActivityType | null {
  const s = norm(String(v ?? ''));
  if (/звон|call|телеф/.test(s)) return 'call';
  if (/встреч|meet|визит|visit/.test(s)) return 'meeting';
  return null;
}

export function parseResult(v: unknown): ActivityResult {
  const s = norm(String(v ?? ''));
  if (!s) return 'none';
  if (/отказ|refus|reject|нет интереса/.test(s)) return 'refusal';
  if (/открыт|продаж|продук|сделк|opened|sale|deal/.test(s)) return 'product_opened';
  if (/встреч|meeting|назнач|договор/.test(s)) return 'meeting_set';
  return 'none';
}

export function parseKind(v: unknown): ActivityKind {
  const s = norm(String(v ?? ''));
  if (/страт|strateg/.test(s)) return 'strategic';
  if (/follow|фоллоу|фолоу|повтор|доработ/.test(s)) return 'followup';
  return 'other';
}

export function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return /^(да|yes|y|true|1|истина|\+|новый)$/i.test(String(v ?? '').trim());
}

const PRODUCT_ALIASES: Record<string, string> = {
  'банковская гарантия': 'БГ',
  'гарантия': 'БГ',
  'бг': 'БГ',
  'рко': 'РКО',
  'расчетно кассовое обслуживание': 'РКО',
  'зп проект': 'ЗП-проект',
  'зарплатный проект': 'ЗП-проект',
  'зп': 'ЗП-проект',
  'вэд': 'ВЭД',
  'программа лояльности': 'Программа лояльности',
  'лояльность': 'Программа лояльности',
  'цр': 'ЦР',
  'эквайринг': 'Эквайринг',
  'fx': 'FX',
  'конверсия': 'FX',
  'кредит': 'Кредит',
  'кредитование': 'Кредит',
  'депозит': 'Депозит',
  'факторинг': 'Факторинг',
};
for (const p of PRODUCTS) PRODUCT_ALIASES[norm(p)] = p;

export function parseProducts(v: unknown): string[] {
  const s = String(v ?? '').trim();
  if (!s) return [];
  const res = new Set<string>();
  for (const part of s.split(/[,;/|\n]+/)) {
    const t = part.trim();
    if (!t) continue;
    res.add(PRODUCT_ALIASES[norm(t)] ?? t);
  }
  return [...res];
}

function parseIntSafe(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export interface ImportError {
  row: number; // номер строки в файле (с 1, заголовок — строка 1)
  message: string;
}

export interface ImportResult {
  activities: Activity[];
  errors: ImportError[];
  skipped: number;
}

/**
 * Превращает строки файла (без заголовка) в активности по сопоставлению колонок.
 * Берутся только сопоставленные колонки; остальные (в т.ч. данные клиентов) отбрасываются.
 */
export function normalizeRows(rows: unknown[][], mapping: Mapping, headerOffset = 1): ImportResult {
  const activities: Activity[] = [];
  const errors: ImportError[] = [];
  const col = (r: unknown[], k: FieldKey) => (mapping[k] === undefined ? undefined : r[mapping[k] as number]);
  rows.forEach((r, i) => {
    const line = i + 1 + headerOffset;
    const date = parseDate(col(r, 'date'));
    const manager = String(col(r, 'manager') ?? '').trim();
    const type = parseType(col(r, 'type'));
    const problems: string[] = [];
    if (!date) problems.push('дата не распознана');
    if (!manager) problems.push('нет менеджера');
    if (!type) problems.push(`тип «${String(col(r, 'type') ?? '')}» не звонок и не встреча`);
    if (problems.length || !date || !type) {
      errors.push({ row: line, message: problems.join('; ') });
      return;
    }
    let days = parseIntSafe(col(r, 'daysSince'));
    if (days === null && mapping.lastMeetingDate !== undefined) {
      const last = parseDate(col(r, 'lastMeetingDate'));
      if (last && last <= date) days = diffDays(date, last);
    }
    activities.push({
      date,
      manager,
      department: String(col(r, 'department') ?? '').trim(),
      type,
      result: parseResult(col(r, 'result')),
      products: parseProducts(col(r, 'products')),
      kind: parseKind(col(r, 'kind')),
      daysSinceLastMeeting: days,
      newClient: mapping.newClient !== undefined ? parseBool(col(r, 'newClient')) : false,
    });
  });
  return { activities, errors, skipped: errors.length };
}

export function missingRequired(mapping: Mapping): FieldSpec[] {
  return FIELDS.filter((f) => f.required && mapping[f.key] === undefined);
}

/** Строки для выгрузки активностей в CSV по той же схеме (для демо и шаблона). */
export function activitiesToRows(list: Activity[]): (string | number)[][] {
  const typeLabel = { call: 'звонок', meeting: 'встреча' };
  const resLabel: Record<ActivityResult, string> = { meeting_set: 'договорились о встрече', product_opened: 'открыт продукт', refusal: 'отказ', none: '' };
  const kindLabel: Record<ActivityKind, string> = { strategic: 'стратегическая встреча', followup: 'фоллоуап', other: 'прочее' };
  return [
    ['дата', 'менеджер', 'подразделение', 'тип активности', 'результат', 'продукт', 'вид активности', 'дней с последней встречи', 'новый клиент'],
    ...list.map((a) => [
      a.date,
      a.manager,
      a.department,
      typeLabel[a.type],
      resLabel[a.result],
      a.products.join(', '),
      kindLabel[a.kind],
      a.daysSinceLastMeeting ?? '',
      a.newClient ? 'да' : '',
    ]),
  ];
}
