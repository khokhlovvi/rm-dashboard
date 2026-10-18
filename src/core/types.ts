export type ActivityType = 'call' | 'meeting';
export type ActivityResult = 'meeting_set' | 'product_opened' | 'refusal' | 'none';
export type ActivityKind = 'strategic' | 'followup' | 'other';

/** Одна активность менеджера. Только агрегируемые поля — никаких данных клиента. */
export interface Activity {
  date: string; // YYYY-MM-DD
  manager: string;
  department: string;
  type: ActivityType;
  result: ActivityResult;
  products: string[];
  kind: ActivityKind;
  daysSinceLastMeeting: number | null;
  newClient: boolean;
}

export const PRODUCTS = [
  'БГ',
  'РКО',
  'ЗП-проект',
  'ВЭД',
  'Программа лояльности',
  'ЦР',
  'Эквайринг',
  'FX',
  'Кредит',
  'Депозит',
  'Факторинг',
] as const;

export const RESULT_LABELS: Record<ActivityResult, string> = {
  meeting_set: 'Договорились о встрече',
  product_opened: 'Открыт продукт',
  refusal: 'Отказ',
  none: 'Без результата',
};

export const KIND_LABELS: Record<ActivityKind, string> = {
  strategic: 'Стратегическая встреча',
  followup: 'Фоллоуап',
  other: 'Прочее',
};

export interface Dataset {
  source: 'demo' | 'import';
  label: string;
  activities: Activity[];
  importedAt?: string;
}
