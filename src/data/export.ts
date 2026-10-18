import { toCsv } from './csv.ts';

export type Cell = string | number | null;

function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function downloadCsv(name: string, rows: Cell[][]): void {
  download(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
}

/** XLSX — через write-excel-file, загружается по требованию, чтобы не утяжелять стартовый бандл. */
export async function downloadXlsx(name: string, rows: Cell[][], sheet = 'Данные'): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const data = rows.map((r, ri) =>
    r.map((v) => {
      if (v === null || v === '') return null;
      if (typeof v === 'number') return { value: v, type: Number };
      return { value: String(v), type: String, fontWeight: ri === 0 ? ('bold' as const) : undefined };
    }),
  );
  const blob = await writeXlsxFile(data, { sheet, columns: rows[0]?.map((_, i) => ({ width: i === 0 ? 24 : 14 })) }).toBlob();
  download(blob, `${name}.xlsx`);
}
