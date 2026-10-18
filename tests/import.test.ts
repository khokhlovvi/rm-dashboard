import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '../src/data/csv.ts';
import { activitiesToRows, guessMapping, missingRequired, normalizeRows, parseDate, parseProducts, parseResult, sensitiveColumns } from '../src/data/import.ts';
import { pack, unpack } from '../src/data/store.ts';
import { generateDemo } from '../src/data/demo.ts';

describe('CSV', () => {
  it('разделитель ; и кавычки', () => {
    const rows = parseCsv('﻿a;b;c\r\n1;"x; ""y""";3\n\n4;5;6\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x; "y"', '3'],
      ['4', '5', '6'],
    ]);
  });
  it('запятая и перенос строки в кавычках', () => {
    expect(parseCsv('a,b\n"1\n2",3')).toEqual([
      ['a', 'b'],
      ['1\n2', '3'],
    ]);
  });
  it('круговая проверка', () => {
    const data = [['дата', 'продукт'], ['2026-01-01', 'РКО, ЗП-проект']];
    expect(parseCsv(toCsv(data))).toEqual(data);
  });
});

describe('разбор значений', () => {
  it('даты', () => {
    expect(parseDate('05.10.2026')).toBe('2026-10-05');
    expect(parseDate('2026-10-05 14:30')).toBe('2026-10-05');
    expect(parseDate('5/1/26')).toBe('2026-01-05');
    expect(parseDate(46300)).toBe('2026-10-05');
    expect(parseDate(new Date(Date.UTC(2026, 9, 5)))).toBe('2026-10-05');
    expect(parseDate('31.02.2026')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
  it('результаты и продукты', () => {
    expect(parseResult('Договорились о встрече')).toBe('meeting_set');
    expect(parseResult('Открыт продукт')).toBe('product_opened');
    expect(parseResult('ОТКАЗ')).toBe('refusal');
    expect(parseResult('')).toBe('none');
    expect(parseProducts('зарплатный проект; РКО / Банковская гарантия, Новый продукт')).toEqual(['ЗП-проект', 'РКО', 'БГ', 'Новый продукт']);
  });
});

describe('сопоставление колонок', () => {
  const headers = ['Дата контакта', 'Клиент', 'Телефон клиента', 'РМ', 'Тип', 'Результат', 'Продукты', 'Вид активности', 'Дата последней встречи'];
  it('угадывает по синонимам и находит чувствительные колонки', () => {
    const m = guessMapping(headers);
    expect(m).toMatchObject({ date: 0, manager: 3, type: 4, result: 5, products: 6, kind: 7, lastMeetingDate: 8 });
    expect(missingRequired(m)).toEqual([]);
    expect(sensitiveColumns(headers, m)).toEqual(['Клиент', 'Телефон клиента']);
  });
  it('нормализует строки, отбрасывая клиента, и считает дни сам', () => {
    const m = guessMapping(headers);
    const res = normalizeRows(
      [
        ['05.10.2026', 'ООО Ромашка', '+7 900 000-00-00', 'Иванов', 'Встреча', '', 'РКО', 'стратегическая', '01.01.2026'],
        ['06.10.2026', 'ООО Ромашка', '', 'Иванов', 'звонок', 'отказ', '', 'фоллоуап', ''],
        ['xx', '', '', '', 'письмо', '', '', '', ''],
      ],
      m,
    );
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].row).toBe(4);
    expect(res.activities).toHaveLength(2);
    expect(res.activities[0]).toEqual({
      date: '2026-10-05',
      manager: 'Иванов',
      department: '',
      type: 'meeting',
      result: 'none',
      products: ['РКО'],
      kind: 'strategic',
      daysSinceLastMeeting: 277,
      newClient: false,
    });
    expect(JSON.stringify(res.activities)).not.toMatch(/Ромашка|\+7/);
  });
  it('демо-выгрузка импортируется обратно без потерь', () => {
    const list = generateDemo({ end: '2026-10-18', weeks: 3 });
    const rows = parseCsv(toCsv(activitiesToRows(list)));
    const res = normalizeRows(rows.slice(1), guessMapping(rows[0]));
    expect(res.errors).toEqual([]);
    expect(res.activities).toEqual(list);
  });
});

describe('хранилище', () => {
  it('упаковка и распаковка', () => {
    const list = generateDemo({ end: '2026-10-18', weeks: 4 });
    expect(unpack(pack(list, 'x'))).toEqual(list);
  });
});
