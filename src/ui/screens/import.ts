import { formatRange } from '../../core/periods.ts';
import { KIND_LABELS, RESULT_LABELS } from '../../core/types.ts';
import { parseCsv } from '../../data/csv.ts';
import { generateDemo } from '../../data/demo.ts';
import { activitiesToRows, FIELDS, guessMapping, missingRequired, normalizeRows, sensitiveColumns, type FieldKey, type Mapping } from '../../data/import.ts';
import { CAN_DOWNLOAD, downloadCsv } from '../../data/export.ts';
import { clearImport, demoDataset, readJson, saveImport, writeJson } from '../../data/store.ts';
import type { Ctx } from '../app.ts';
import { h } from '../dom.ts';
import { fmtInt } from '../format.ts';
import { card, pageHead } from '../widgets.ts';

const KEY_MAPPING = 'rm-dashboard:mapping:v1';

interface Pending {
  fileName: string;
  headers: string[];
  rows: unknown[][];
  mapping: Mapping;
}

let pending: Pending | null = null;
let message: { kind: 'ok' | 'bad' | 'warn'; text: string } | null = null;

/** Чтение файла: CSV — своим парсером, XLSX — read-excel-file (загружается по требованию). */
async function readFile(file: File): Promise<unknown[][]> {
  if (/\.(xlsx|xlsm)$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    return (await readSheet(file)) as unknown[][];
  }
  if (/\.xls$/i.test(file.name)) throw new Error('Старый формат .xls не поддерживается — сохраните файл как .xlsx или CSV.');
  return parseCsv(await file.text());
}

/** Сохранённое сопоставление применяется, если в файле те же заголовки. */
function restoreMapping(headers: string[]): Mapping {
  const saved = readJson<Record<string, FieldKey>>(KEY_MAPPING, {});
  const m = guessMapping(headers);
  headers.forEach((hd, i) => {
    const k = saved[hd];
    if (k) {
      for (const key of Object.keys(m) as FieldKey[]) if (m[key] === i) delete m[key];
      m[k] = i;
    }
  });
  return m;
}

function saveMapping(p: Pending): void {
  const res: Record<string, FieldKey> = {};
  for (const [k, i] of Object.entries(p.mapping)) if (i !== undefined) res[p.headers[i]] = k as FieldKey;
  writeJson(KEY_MAPPING, res);
}

export function importScreen(ctx: Ctx): HTMLElement {
  const rerender = () => ctx.app.render();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const all = await readFile(file);
      if (all.length < 2) throw new Error('В файле нет строк с данными.');
      const headers = all[0].map((x) => String(x ?? '').trim());
      pending = { fileName: file.name, headers, rows: all.slice(1), mapping: restoreMapping(headers) };
      message = null;
    } catch (e) {
      pending = null;
      message = { kind: 'bad', text: `Не удалось прочитать «${file.name}»: ${(e as Error).message}` };
    }
    rerender();
  };

  const input = h('input', { type: 'file', accept: '.csv,.txt,.xlsx,.xlsm', 'aria-label': 'Файл CSV или XLSX', onchange: (e: Event) => void onFile((e.target as HTMLInputElement).files?.[0]) });
  const drop = h(
    'div',
    {
      class: 'dropzone',
      ondragover: (e: Event) => {
        e.preventDefault();
        drop.classList.add('over');
      },
      ondragleave: () => drop.classList.remove('over'),
      ondrop: (e: Event) => {
        e.preventDefault();
        drop.classList.remove('over');
        void onFile((e as DragEvent).dataTransfer?.files?.[0]);
      },
    },
    h('p', null, 'Перетащите файл CSV или XLSX сюда или выберите его:'),
    input,
    h('p', { class: 'small muted' }, 'Файл обрабатывается только в этом браузере. Берутся лишь сопоставленные колонки — имена клиентов, телефоны и счета отбрасываются и нигде не сохраняются.'),
  );

  const current = card('Текущие данные', null, [
    h('p', null, h('strong', null, ctx.ds.label), ` — ${fmtInt(ctx.ds.activities.length)} активностей, ${ctx.base.managers.length} менеджеров, ${formatRange({ start: ctx.base.minDate, end: ctx.base.maxDate })}.`),
    ctx.ds.importedAt ? h('p', { class: 'small muted' }, `Загружено ${new Date(ctx.ds.importedAt).toLocaleString('ru-RU')}`) : null,
    h(
      'div',
      { class: 'filters' },
      ctx.ds.source === 'import'
        ? h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                clearImport();
                message = { kind: 'ok', text: 'Вернулись к демо-данным. Импорт удалён из браузера.' };
                ctx.app.setDataset(demoDataset());
              },
            },
            '↺ Вернуться к демо-данным',
          )
        : null,
      CAN_DOWNLOAD ? h('button', { class: 'btn', onclick: () => downloadCsv('шаблон_импорта', activitiesToRows(generateDemo({ weeks: 1 }).slice(0, 5))) }, '⤓ Шаблон CSV') : null,
      CAN_DOWNLOAD ? h('button', { class: 'btn', onclick: () => downloadCsv('демо_активности', activitiesToRows(generateDemo())) }, '⤓ Демо целиком (CSV)') : null,
    ),
  ]);

  const msg = message ? h('div', { class: `alert ${message.kind}` }, message.text) : null;

  return h(
    'div',
    null,
    pageHead('Импорт данных', 'CSV (разделитель ; , или таб) или XLSX, первая строка — заголовки'),
    msg,
    h('div', { class: 'grid cols-2' }, card('Загрузить файл', null, [drop]), current),
    pending ? mappingCard(ctx, pending) : h('div', { class: 'mt' }, schemaCard()),
  );
}

function mappingCard(ctx: Ctx, p: Pending): HTMLElement {
  const missing = missingRequired(p.mapping);
  const sensitive = sensitiveColumns(p.headers, p.mapping);
  const preview = normalizeRows(p.rows.slice(0, 300), p.mapping);
  const used = new Set(Object.values(p.mapping));

  const rows = FIELDS.map((f) => {
    const sel = h(
      'select',
      {
        'aria-label': f.label,
        onchange: (e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          if (v === '') delete p.mapping[f.key];
          else p.mapping[f.key] = Number(v);
          ctx.app.render();
        },
      },
      h('option', { value: '' }, '— не использовать —'),
      p.headers.map((hd, i) => h('option', { value: String(i), selected: p.mapping[f.key] === i }, hd || `колонка ${i + 1}`)),
    );
    return [h('label', null, f.label, f.required ? h('strong', { title: 'обязательно' }, ' *') : null), sel, h('span', { class: 'small muted' }, f.hint)];
  });

  const doImport = () => {
    const res = normalizeRows(p.rows, p.mapping);
    if (!res.activities.length) {
      message = { kind: 'bad', text: 'Ни одна строка не распознана — проверьте сопоставление колонок.' };
      ctx.app.render();
      return;
    }
    saveMapping(p);
    const label = `Импорт: ${p.fileName}`;
    const saved = saveImport(res.activities, label);
    message = {
      kind: res.errors.length || !saved ? 'warn' : 'ok',
      text:
        `Загружено ${fmtInt(res.activities.length)} активностей из «${p.fileName}».` +
        (res.errors.length ? ` Пропущено строк с ошибками: ${res.errors.length} (первая — строка ${res.errors[0].row}: ${res.errors[0].message}).` : '') +
        (saved ? '' : ' Файл слишком большой для хранилища браузера — данные доступны до перезагрузки страницы.'),
    };
    pending = null;
    ctx.app.setDataset({ source: 'import', label, activities: res.activities, importedAt: new Date().toISOString() });
  };

  const previewTable = h(
    'table',
    { class: 'data' },
    h('thead', null, h('tr', null, ['Дата', 'Менеджер', 'Подразделение', 'Тип', 'Результат', 'Продукты', 'Вид', 'Дней с встречи', 'Новый'].map((x, i) => h('th', { class: i < 3 ? 'l' : null }, x)))),
    h(
      'tbody',
      null,
      preview.activities.slice(0, 8).map((a) =>
        h(
          'tr',
          null,
          h('td', { class: 'l' }, a.date),
          h('td', { class: 'l' }, a.manager),
          h('td', { class: 'l' }, a.department || '—'),
          h('td', null, a.type === 'call' ? 'звонок' : 'встреча'),
          h('td', null, RESULT_LABELS[a.result]),
          h('td', null, a.products.join(', ') || '—'),
          h('td', null, KIND_LABELS[a.kind]),
          h('td', null, a.daysSinceLastMeeting ?? '—'),
          h('td', null, a.newClient ? 'да' : ''),
        ),
      ),
    ),
  );

  return h(
    'section',
    { class: 'card mt' },
    h('div', { class: 'card-head' }, h('h2', null, `Сопоставление колонок: ${p.fileName}`), h('span', { class: 'hint' }, `${fmtInt(p.rows.length)} строк · ${p.headers.length} колонок`)),
    h('div', { class: 'form-grid' }, rows.flat()),
    sensitive.length ? h('div', { class: 'alert warn' }, `Колонки с данными клиентов будут отброшены и не сохранятся: ${sensitive.join(', ')}.`) : null,
    p.headers.some((_, i) => !used.has(i)) ? h('p', { class: 'note' }, `Не используются: ${p.headers.filter((_, i) => !used.has(i)).join(', ')}.`) : null,
    missing.length ? h('div', { class: 'alert bad' }, `Сопоставьте обязательные поля: ${missing.map((f) => f.label).join(', ')}.`) : null,
    h('h3', { class: 'mt' }, 'Предпросмотр (как прочитает дашборд)'),
    preview.errors.length ? h('div', { class: 'alert warn' }, `В первых ${Math.min(300, p.rows.length)} строках ошибок: ${preview.errors.length}. Пример — строка ${preview.errors[0].row}: ${preview.errors[0].message}.`) : null,
    h('div', { class: 'table-wrap' }, previewTable),
    h(
      'div',
      { class: 'filters mt' },
      h('button', { class: 'btn primary', disabled: missing.length > 0, onclick: doImport }, 'Загрузить в дашборд'),
      h(
        'button',
        {
          class: 'btn',
          onclick: () => {
            pending = null;
            ctx.app.render();
          },
        },
        'Отмена',
      ),
    ),
  );
}

function schemaCard(): HTMLElement {
  return card('Схема данных', 'одна строка — одна активность', [
    h(
      'div',
      { class: 'table-wrap' },
      h(
      'table',
      { class: 'data' },
      h('thead', null, h('tr', null, h('th', { class: 'l' }, 'Поле'), h('th', { class: 'l' }, 'Обязательно'), h('th', { class: 'l' }, 'Значения'), h('th', { class: 'l' }, 'Узнаём заголовки'))),
      h(
        'tbody',
        null,
        FIELDS.map((f) => h('tr', null, h('td', { class: 'l' }, f.label), h('td', { class: 'l' }, f.required ? 'да' : 'нет'), h('td', { class: 'l' }, f.hint), h('td', { class: 'l small muted' }, f.synonyms.slice(0, 4).join(', ')))),
      ),
      ),
    ),
    h('p', { class: 'note' }, 'Если заголовки другие — сопоставьте их вручную после выбора файла; сопоставление запоминается для следующих загрузок.'),
  ]);
}
