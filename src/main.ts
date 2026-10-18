import './styles.css';
import { App } from './ui/app.ts';
import { installTooltip } from './ui/dom.ts';
import { overviewScreen } from './ui/screens/overview.ts';
import { rankingScreen } from './ui/screens/ranking.ts';

const root = document.getElementById('app');
if (!root) throw new Error('#app не найден');

installTooltip();
new App(root)
  .register([
    { path: 'overview', title: 'Обзор', screen: overviewScreen },
    { path: 'ranking', title: 'Рейтинг', screen: rankingScreen },
  ])
  .start();
