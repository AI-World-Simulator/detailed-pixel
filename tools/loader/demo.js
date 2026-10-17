// Gallery of the boot-loader variants side by side: node tools/loader/demo.js -> loaders.html (open it directly, no server)
// Each panel runs the real src/loader.js scene; boot steps advance by themselves (or click a step). The app itself:
// index.html?loader=<variant>&slowboot=8000
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const spr = fs.existsSync(path.join(__dirname, '..', '..', 'data/loader/sprites.json')) ? R('data/loader/sprites.json') : 'null';
const VARIANTS = [
  ['crew', 'Бригада', 'Каждый шаг загрузки — своя работа: красят сушу, копают горы, кладут дорогу, распаковывают ящик, встречают жителей. Сделанное остаётся на сцене.'],
  ['chat', 'Болтовня', 'Двое соседей под фонарём обмениваются картинками в облачках, смеются, моргают. Не зависит от шагов, цикл 14 с.'],
  ['walk', 'Прогулка', 'Житель идёт через мир; пейзаж за спиной меняется по шагам: море → горы → дороги → город.'],
  ['parade', 'Шествие', 'Жители идут через улицу, у каждого свой шаг; старик читает газету у скамейки. Не зависит от шагов.'],
  ['island', 'Остров', 'Остров «дорастает» слоем на каждом шаге: море → пляж → луга → горы и лес → дороги → дома.'],
  ['dots', 'Точки', 'Запасной вариант без спрайтов (и для старых браузеров).'],
];
const STEPS = [['coast', 'Рисуем береговые линии…'], ['smooth', 'Сглаживаем побережья…'], ['relief', 'Поднимаем горы и пустыни…'],
  ['roads', 'Прокладываем дороги…'], ['kit', 'Распаковываем набор спрайтов…'], ['workers', 'Запускаем генераторы…'], ['people', 'Заселяем города…']];
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Лоадеры — Детальный пиксель</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600&family=Press+Start+2P&display=swap">
<style>
:root { --ink: #0b1626; --edge: #2a4466; --text: #eef3fa; --muted: #93a8c3; --gold: #f2a516; --display: "Press Start 2P", monospace; --ui: "Pixelify Sans", ui-monospace, monospace; color-scheme: dark; }
body { margin: 0; background: #070f1b; color: var(--text); font-family: var(--ui); }
header { padding: 20px 16px 4px; max-width: 1180px; margin: 0 auto; }
h1 { font-family: var(--display); font-size: 16px; letter-spacing: .08em; margin: 0 0 8px; }
header p { color: var(--muted); margin: 0; font-size: 15px; line-height: 1.45; }
main { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 536px), 1fr)); gap: 16px; padding: 16px; max-width: 1180px; margin: 0 auto; }
.card { background: var(--ink); box-shadow: 0 0 0 2px #050b14, inset 0 0 0 1px var(--edge); padding: 14px 16px 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; min-width: 0; }
.card h2 { align-self: flex-start; margin: 0; font-size: 18px; font-weight: 600; } .card h2 code { color: var(--gold); font-size: 14px; margin-left: 6px; }
.card p { align-self: flex-start; margin: 0; color: var(--muted); font-size: 14px; line-height: 1.4; }
.msg { color: var(--muted); font-size: 15px; min-height: 1.3em; }
.steps { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; }
.steps button { font: inherit; font-size: 12px; color: var(--muted); background: #13233a; border: 0; padding: 4px 7px; cursor: pointer; box-shadow: inset 0 0 0 1px var(--edge); }
.steps button.on { color: #050b14; background: var(--gold); }
.row { display: flex; gap: 12px; align-items: center; font-size: 13px; color: var(--muted); flex-wrap: wrap; justify-content: center; }
.row a { color: var(--gold); }
.row label { display: flex; gap: 4px; align-items: center; cursor: pointer; }
@media (max-width: 400px) { main { padding: 4px; gap: 10px; } .card { padding: 10px 4px 12px; } .card h2, .card p { padding: 0 6px; } }   /* 336 px scene fits a 360 px phone */
</style>
<style>${R('src/loader.css')}</style></head><body>
<header><h1>ЛОАДЕРЫ</h1><p>Сцены из пиксельных жителей для экрана загрузки. Всё движение — CSS (transform/opacity), поэтому сцена не замирает, пока главный поток занят генерацией мира. Шаги переключаются сами каждые 2,2 с; клик по шагу — вручную. Режим «меньше движения» проверяется в DevTools → Rendering → prefers-reduced-motion.</p></header>
<main>${VARIANTS.map(([v, t, d]) => `
<section class="card" data-v="${v}"><h2>${t}<code>?loader=${v}</code></h2><p>${d}</p>
<div class="ldr-stage" aria-hidden="true"></div><div class="msg"></div>
<div class="ldr-bar"></div>
<div class="steps">${STEPS.map(([k, s], i) => `<button type="button" data-i="${i}" title="${s}">${i + 1}. ${k}</button>`).join('')}</div>
<div class="row"><label><input type="checkbox" class="auto" checked> авто</label><a href="index.html?loader=${v}&amp;slowboot=8000">в приложении (8 с)</a></div>
</section>`).join('')}
</main>
<script>${R('src/loader.js').split('/*LOADER_SPR*/null').join(spr)}</script>
<script>
const STEPS = ${JSON.stringify(STEPS)};
document.querySelectorAll('.card').forEach((card) => {
  const sc = LOADER.scene(card.querySelector('.ldr-stage'), card.dataset.v);
  const msg = card.querySelector('.msg'), bar = card.querySelector('.ldr-bar'), btns = card.querySelectorAll('.steps button'), auto = card.querySelector('.auto');
  let i = -1;
  const go = (k) => { i = k; const [key, text] = STEPS[i]; msg.textContent = text; bar.style.setProperty('--p', (i + 1) / STEPS.length); btns.forEach((b, j) => b.classList.toggle('on', j === i)); sc.stage(key, i, STEPS.length); };
  btns.forEach((b) => b.addEventListener('click', () => { auto.checked = false; go(+b.dataset.i); }));
  go(0);
  setInterval(() => { if (auto.checked) { if (i === STEPS.length - 1) { const host = card.querySelector('.ldr-stage'); const fresh = host.cloneNode(false); fresh.className = 'ldr-stage'; host.replaceWith(fresh); Object.assign(sc, LOADER.scene(fresh, card.dataset.v)); go(0); } else go(i + 1); } }, 2200);
});
</script></body></html>`;
fs.writeFileSync(path.join(__dirname, '..', '..', 'loaders.html'), html);
console.log('loaders.html', (html.length / 1024 | 0) + 'KB');
