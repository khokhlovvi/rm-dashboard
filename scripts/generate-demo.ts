/**
 * Выгружает демо-данные в CSV по схеме импорта: `npm run demo [-- --end 2026-10-18 --weeks 40]`.
 * Результат — data/sample/demo.csv (вымышленные менеджеры, без данных клиентов).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDemo } from '../src/data/demo.ts';
import { activitiesToRows } from '../src/data/import.ts';
import { toCsv } from '../src/data/csv.ts';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const end = arg('end');
const weeks = arg('weeks') ? Number(arg('weeks')) : undefined;
const list = generateDemo({ end, weeks });
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../data/sample/demo.csv');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, toCsv(activitiesToRows(list)));
console.log(`Записано ${list.length} активностей → ${out}`);
