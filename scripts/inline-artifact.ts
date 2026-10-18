/**
 * Собирает dist-artifact/ в один HTML без внешних файлов — для публикации как артефакт claude.ai
 * (там разрешены только встроенные скрипты и стили). Запуск: `npm run build:artifact`.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../dist-artifact');
const assets = readdirSync(join(dir, 'assets'));
const js = assets.filter((f) => f.endsWith('.js'));
const css = assets.filter((f) => f.endsWith('.css'));
if (js.length !== 1) throw new Error(`Ожидался один JS-файл, найдено: ${js.join(', ')}`);

// </script внутри кода закрыл бы тег — экранируем
const script = readFileSync(join(dir, 'assets', js[0]), 'utf8').replace(/<\/(script)/gi, '<\\/$1');
const style = css.map((f) => readFileSync(join(dir, 'assets', f), 'utf8')).join('\n');
const icon = /<link rel="icon"[^>]*>/.exec(readFileSync(join(dir, 'index.html'), 'utf8'))?.[0] ?? '';

const page = `<title>Активность РМ</title>
<meta name="description" content="Дашборд активности клиентских менеджеров: звонки, встречи, план 3 + 6">
${icon}
<style>${style}</style>
<div id="app"></div>
<script type="module">${script}</script>
`;
writeFileSync(join(dir, 'artifact.html'), page);
console.log(`dist-artifact/artifact.html: ${(page.length / 1024).toFixed(0)} КБ`);
