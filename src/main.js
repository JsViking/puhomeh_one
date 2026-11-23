// Точка входа: WebGPU, атлас, уровень, ввод, игровой цикл, HUD.
import { initGPU, Renderer } from './gpu.js';
import { buildAtlas } from './atlas.js';
import { buildLevel } from './map.js';
import { Game } from './game.js';
import { Scene } from './scene.js';
import * as sfx from './audio.js';
import * as board from './leaderboard.js';
import { createJoystick } from './touch.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gfx');

async function main() {
  let gpu;
  try {
    gpu = await initGPU(canvas);
  } catch (err) {
    console.warn(err);
    $('title').classList.add('hidden');
    $('nogpu').classList.remove('hidden');
    $('nogpu-reason').textContent = err.message;
    return;
  }

  const t0 = performance.now();
  const atlas = buildAtlas();
  console.log(`[atlas] ${atlas.width}×${atlas.height}, спрайтов: ${Object.keys(atlas.sprites).length}, ${(performance.now() - t0).toFixed(0)} мс`);
  const level = buildLevel(atlas);
  const renderer = new Renderer(gpu, atlas);
  const scene = new Scene(atlas, level);
  const game = new Game(level);
  let crt = 1;

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(innerWidth * dpr));
    canvas.height = Math.max(1, Math.floor(innerHeight * dpr));
    renderer.resize(canvas.width, canvas.height);
  };
  addEventListener('resize', resize);
  resize();

  // ---- Действия (общие для клавиатуры, мыши и пальца) ----
  const syncButtons = () => {
    $('btn-night').classList.toggle('on', !!game.nightTarget);
    $('btn-music').classList.toggle('off', !sfx.isMusicOn());
    $('btn-crt').classList.toggle('off', !crt);
  };
  const actions = {
    start: () => { if (game.phase === 'title') game.start(); },
    restart: () => { if (game.phase === 'win' || game.phase === 'lose') game.restart(); },
    night: () => { game.toggleNight(); syncButtons(); },
    music: () => { sfx.toggleMusic(); syncButtons(); },
    crt: () => { crt = crt ? 0 : 1; syncButtons(); },
    meow: () => { if (game.phase === 'play') game.meow(); },
  };
  syncButtons();

  // ---- Клавиатура ----
  const keys = new Set();
  const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return; // печатаем имя для рекорда — игра не слушает
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    sfx.init();
    keys.add(e.code);
    if (e.repeat) return;
    if (game.phase === 'title') { actions.start(); return; }
    if (e.code === 'KeyN') actions.night();
    if (e.code === 'KeyC') actions.crt();
    if (e.code === 'KeyM') actions.music();
    if (e.code === 'Space') actions.meow();
    if (e.code === 'KeyR') actions.restart();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  const pressed = (...codes) => codes.some((c) => keys.has(c));

  // ---- Сенсорный экран и мышь ----
  const joystick = createJoystick({ onStart: sfx.init });
  // Звук в мобильных браузерах можно включить только из обработчика жеста пользователя
  addEventListener('pointerup', sfx.init);
  $('title').addEventListener('pointerdown', () => { sfx.init(); actions.start(); });
  document.querySelectorAll('.again').forEach((b) => b.addEventListener('click', () => { sfx.init(); actions.restart(); }));
  for (const [id, fn] of [['btn-night', actions.night], ['btn-music', actions.music], ['btn-crt', actions.crt], ['btn-meow', actions.meow]]) {
    const b = $(id);
    // pointerdown — мгновенный отклик; preventDefault — кнопка не забирает фокус (иначе Пробел нажимал бы её)
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); sfx.init(); fn(); });
    b.addEventListener('click', (e) => { if (e.detail === 0) fn(); }); // активация с клавиатуры/читалки экрана
  }

  const readInput = () => (joystick.active ? joystick.vec : {
    x: (pressed('KeyD', 'ArrowRight') ? 1 : 0) - (pressed('KeyA', 'ArrowLeft') ? 1 : 0),
    y: (pressed('KeyS', 'ArrowDown') ? 1 : 0) - (pressed('KeyW', 'ArrowUp') ? 1 : 0),
  });

  // ---- HUD ----
  const ui = { score: '', time: '', phase: '' };
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function updateHUD() {
    const score = `${game.score}/${game.total}`, time = fmt(game.time);
    if (score !== ui.score) $('score').textContent = ui.score = score;
    if (time !== ui.time) $('time').textContent = ui.time = time;
    if (game.lives !== ui.lives) {
      ui.lives = game.lives;
      const lost = Math.max(0, 3 - game.lives);
      $('lives').innerHTML = '♥'.repeat(Math.max(0, game.lives)) + `<span class="lost">${'♥'.repeat(lost)}</span>`;
    }
    if (game.phase !== ui.phase) {
      ui.phase = game.phase;
      $('title').classList.toggle('hidden', game.phase !== 'title');
      $('win').classList.toggle('hidden', game.phase !== 'win');
      $('lose').classList.toggle('hidden', game.phase !== 'lose');
      if (game.phase === 'lose') $('lose-score').textContent = `${game.score}/${game.total}`;
      $('hud').classList.toggle('hidden', game.phase === 'title');
      $('help').classList.toggle('hidden', game.phase === 'title');
      $('btn-meow').classList.toggle('hidden', game.phase !== 'play');
      if (game.phase === 'win') onWin();
      if (game.phase === 'title') showTitleBoard();
    }
  }

  // ---- Рекорды ----
  const entryForm = $('entry'), entryName = $('entry-name'), winTable = $('win-table');
  let winTime = 0, saving = false;
  const showList = (table, { list, online }, highlight = -1) => {
    board.render(table, list, { highlight });
    table.previousElementSibling.textContent = online ? 'Рекорды · онлайн' : 'Рекорды';
  };
  async function showTitleBoard() {
    const top = await board.getTop(5);
    $('title-board').classList.toggle('hidden', top.list.length === 0);
    showList($('title-table'), top);
  }
  function finishEntry(result) {
    entryForm.classList.add('hidden');
    entryName.blur();
    $('win-hint').classList.remove('hidden');
    if (result) showList(winTable, result, result.rank);
  }
  async function onWin() {
    winTime = game.time;
    $('final').textContent = board.fmtTime(winTime);
    entryForm.classList.add('hidden');
    board.renderLoading(winTable);
    const top = await board.getTop();
    if (game.phase !== 'win') return; // пока грузили — уже начали заново
    showList(winTable, top);
    const best = top.list.length < board.MAX_ENTRIES || winTime < top.list[top.list.length - 1].time;
    entryForm.classList.toggle('hidden', !best);
    $('win-hint').classList.toggle('hidden', best);
    if (best) {
      entryName.value = board.lastName();
      // На телефоне не открываем клавиатуру сама — она закрыла бы пол-экрана
      if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => { entryName.focus(); entryName.select(); }, 0);
    }
  }
  entryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    saving = true;
    entryForm.querySelectorAll('button, input').forEach((el) => { el.disabled = true; });
    try {
      finishEntry(await board.add(entryName.value, winTime));
    } finally {
      saving = false;
      entryForm.querySelectorAll('button, input').forEach((el) => { el.disabled = false; });
    }
  });
  entryName.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') finishEntry(null);
  });
  $('entry-skip').addEventListener('click', () => finishEntry(null));
  showTitleBoard();

  // Отладочный хук для экспериментов из консоли
  window.__game = { game, level, atlas, renderer, keys };

  // ---- Цикл ----
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    game.update(dt, readInput());
    sfx.setNight(game.night);
    const { nSprites, nGlow, camX, camY } = scene.build(game, renderer.lowW, renderer.lowH, t, dt);
    renderer.render(scene.data, nSprites, nGlow, { camX, camY, time: t, night: game.night, crt });
    updateHUD();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
