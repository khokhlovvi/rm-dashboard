import './styles.css';
import { App } from './ui/app.ts';
import { installTooltip } from './ui/dom.ts';
import { attentionScreen } from './ui/screens/attention.ts';
import { compareScreen } from './ui/screens/compare.ts';
import { importScreen } from './ui/screens/import.ts';
import { managerScreen } from './ui/screens/manager.ts';
import { overviewScreen } from './ui/screens/overview.ts';
import { planScreen } from './ui/screens/plan.ts';
import { rankingScreen } from './ui/screens/ranking.ts';
import { settingsScreen } from './ui/screens/settings.ts';

const root = document.getElementById('app');
if (!root) throw new Error('#app не найден');

installTooltip();
new App(root)
  .register([
    { path: 'overview', title: 'Обзор', screen: overviewScreen },
    { path: 'ranking', title: 'Рейтинг', screen: rankingScreen },
    { path: 'plan', title: 'План 3 + 6', screen: planScreen },
    { path: 'compare', title: 'Сравнение', screen: compareScreen },
    { path: 'manager', title: 'Карточка менеджера', screen: managerScreen },
    { path: 'attention', title: 'Внимание', screen: attentionScreen },
    { path: 'import', title: 'Импорт', screen: importScreen },
    { path: 'settings', title: 'Настройки', screen: settingsScreen },
  ])
  .start();
