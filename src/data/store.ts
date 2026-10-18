import type { Activity, ActivityKind, ActivityResult, ActivityType, Dataset } from '../core/types.ts';
import { generateDemo } from './demo.ts';

const KEY_DATA = 'rm-dashboard:dataset:v1';

type Packed = [string, number, number, 0 | 1, number, string, number, number | null, 0 | 1];

const RESULTS: ActivityResult[] = ['none', 'meeting_set', 'product_opened', 'refusal'];
const KINDS: ActivityKind[] = ['other', 'followup', 'strategic'];
const TYPES: ActivityType[] = ['call', 'meeting'];

interface Stored {
  label: string;
  importedAt: string;
  managers: string[];
  departments: string[];
  rows: Packed[];
}

/** Компактная упаковка для localStorage: справочники менеджеров и подразделений + массивы. */
export function pack(list: Activity[], label: string): Stored {
  const managers: string[] = [];
  const departments: string[] = [];
  const mi = new Map<string, number>();
  const di = new Map<string, number>();
  const idx = (map: Map<string, number>, arr: string[], v: string) => {
    let i = map.get(v);
    if (i === undefined) {
      i = arr.push(v) - 1;
      map.set(v, i);
    }
    return i;
  };
  const rows = list.map(
    (a): Packed => [
      a.date,
      idx(mi, managers, a.manager),
      idx(di, departments, a.department),
      a.type === 'call' ? 0 : 1,
      RESULTS.indexOf(a.result),
      a.products.join('|'),
      KINDS.indexOf(a.kind),
      a.daysSinceLastMeeting,
      a.newClient ? 1 : 0,
    ],
  );
  return { label, importedAt: new Date().toISOString(), managers, departments, rows };
}

export function unpack(s: Stored): Activity[] {
  return s.rows.map((r) => ({
    date: r[0],
    manager: s.managers[r[1]],
    department: s.departments[r[2]],
    type: TYPES[r[3]],
    result: RESULTS[r[4]] ?? 'none',
    products: r[5] ? r[5].split('|') : [],
    kind: KINDS[r[6]] ?? 'other',
    daysSinceLastMeeting: r[7],
    newClient: r[8] === 1,
  }));
}

export function demoDataset(): Dataset {
  return { source: 'demo', label: 'Демо-данные (вымышленные менеджеры)', activities: generateDemo() };
}

export function loadDataset(): Dataset {
  try {
    const raw = localStorage.getItem(KEY_DATA);
    if (raw) {
      const s = JSON.parse(raw) as Stored;
      return { source: 'import', label: s.label, importedAt: s.importedAt, activities: unpack(s) };
    }
  } catch (e) {
    console.warn('Не удалось прочитать сохранённый импорт', e);
  }
  return demoDataset();
}

/** Сохраняет импорт в браузере. Возвращает false, если не хватило места (данные останутся только до перезагрузки). */
export function saveImport(list: Activity[], label: string): boolean {
  try {
    localStorage.setItem(KEY_DATA, JSON.stringify(pack(list, label)));
    return true;
  } catch (e) {
    console.warn('Импорт не сохранён в localStorage', e);
    return false;
  }
}

export function clearImport(): void {
  try {
    localStorage.removeItem(KEY_DATA);
  } catch {
    /* нет доступа к хранилищу — нечего чистить */
  }
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* хранилище недоступно — настройки живут до перезагрузки */
  }
}
