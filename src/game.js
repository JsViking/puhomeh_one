// Игровая логика: движение котика, коллизии, еда, собаки, жизни, частицы, победа и поражение.
import { toScreen, screenToWorldVec } from './iso.js';
import * as sfx from './audio.js';
import { FOOD_KINDS } from './map.js';
import { Dog } from './dog.js';
import { shuffle, pickDir } from './util.js';

const R_COLLIDE = 0.22; // радиус котика для столкновений (в тайлах)
const SPEED = 74;       // экранных пикселей в секунду по горизонтали
const FOOD_COUNT = 12;
const FOOD_MIN_DIST = 3.5;  // минимальное расстояние между двумя едами (в тайлах)
const FOOD_START_DIST = 3;  // и от точки старта котика
const DOG_COUNT = 2;
const DOG_START_DIST = 9;   // собаки появляются подальше от котика
const LIVES = 3;
const CATCH_DIST = 0.45;
const INVULN = 2;           // секунд неуязвимости после поимки

export class Game {
  constructor(level) {
    this.level = level;
    this.phase = 'title'; // title | play | win | lose
    this.night = 0;
    this.nightTarget = 0;
    this.reset();
  }

  reset() {
    const s = this.level.start;
    this.cat = { x: s.x, y: s.y, dir: 1, frame: 0, anim: 0, moving: false };
    this.foods = spawnFoods(this.level);
    this.dogs = spawnDogs(this.level, DOG_COUNT);
    this.score = 0;
    this.total = this.foods.length;
    this.lives = LIVES;
    this.invuln = 0;
    this.time = 0;
    this.particles = [];
    this.winTimer = -1;
    this.loseTimer = -1;
  }

  start() { this.phase = 'play'; sfx.startMusic(); }
  restart() { this.reset(); this.phase = 'play'; sfx.startMusic(); }
  toggleNight() { this.nightTarget = this.nightTarget ? 0 : 1; }

  meow() {
    sfx.meow();
    this.burst(this.cat.x, this.cat.y, 'heart', 1);
  }

  solidAt(tx, ty) {
    const { W, H, solid } = this.level;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
    return solid[ty][tx];
  }

  blocked(x, y) {
    const r = R_COLLIDE;
    for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++)
      for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++)
        if (this.solidAt(tx, ty)) return true;
    return false;
  }

  burst(x, y, spr, count) {
    const [sx, sy] = toScreen(x, y);
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: sx + (Math.random() - 0.5) * 10, y: sy - 22,
        vx: (Math.random() - 0.5) * 36, vy: -22 - Math.random() * 26,
        life: 0, max: 0.9 + Math.random() * 0.5, spr,
      });
    }
  }

  // Собака поймала котика: минус жизнь, котик возвращается на старт и пару секунд мигает
  caught(dog) {
    this.lives--;
    this.burst(this.cat.x, this.cat.y, 'exclaim', 3);
    for (const d of this.dogs) d.calmDown(d === dog ? 4 : 2);
    if (this.lives <= 0) {
      this.loseTimer = 0.9;
      sfx.stopMusic();
      sfx.lose();
      return;
    }
    sfx.hurt();
    const s = this.level.start;
    this.cat.x = s.x; this.cat.y = s.y;
    this.invuln = INVULN;
  }

  // input: { x, y } — направление на экране (-1..1)
  update(dt, input) {
    this.night += (this.nightTarget - this.night) * Math.min(1, dt * 2.5);

    for (const p of this.particles) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy += 18 * dt; }
    this.particles = this.particles.filter((p) => p.life < p.max);

    const cat = this.cat;
    const playing = this.phase === 'play' && this.winTimer < 0 && this.loseTimer < 0;
    let ix = 0, iy = 0;
    if (playing) {
      ix = input.x; iy = input.y;
      this.time += dt;
    }
    this.invuln = Math.max(0, this.invuln - dt);
    const len = Math.hypot(ix, iy);
    cat.moving = len > 0;
    if (cat.moving) {
      // Экранное направление -> мировое; по вертикали чуть медленнее (изометрия)
      const [vx, vy] = screenToWorldVec((ix / len) * SPEED, (iy / len) * SPEED * 0.62);
      cat.dir = pickDir(vx, vy, cat.dir);
      const nx = cat.x + vx * dt;
      if (!this.blocked(nx, cat.y)) cat.x = nx;
      const ny = cat.y + vy * dt;
      if (!this.blocked(cat.x, ny)) cat.y = ny;
      cat.anim += dt;
      cat.frame = 1 + (Math.floor(cat.anim * 7) % 2);
    } else {
      cat.frame = 0;
      cat.anim = 0;
    }

    // Собаки двигаются всегда (на титульном экране просто гуляют), ловят только во время игры
    const canChase = playing && this.invuln <= 0;
    for (const d of this.dogs) {
      const dist = d.update(dt, cat, canChase);
      if (canChase && dist < CATCH_DIST && this.loseTimer < 0) this.caught(d);
    }

    if (playing) {
      for (const f of this.foods) {
        if (f.taken || Math.hypot(f.x - cat.x, f.y - cat.y) > 0.5) continue;
        f.taken = true;
        this.score++;
        sfx.pickup();
        this.burst(f.x, f.y, 'heart', 6);
        if (this.score === this.total) {
          this.winTimer = 0.9;
          for (const d of this.dogs) d.calmDown(999);
          sfx.stopMusic();
          sfx.win();
        }
      }
    }
    if (this.winTimer > 0) {
      this.winTimer -= dt;
      if (this.winTimer <= 0) this.phase = 'win';
    }
    if (this.loseTimer > 0) {
      this.loseTimer -= dt;
      if (this.loseTimer <= 0) this.phase = 'lose';
    }
    if (this.phase === 'win' && Math.random() < dt * 3) this.burst(cat.x, cat.y, 'heart', 1);
  }
}

// Случайная расстановка еды: перебираем клетки в случайном порядке и берём только те,
// что не ближе FOOD_MIN_DIST к уже выбранным. Если 12 штук не влезло — немного ослабляем условие.
function spawnFoods(level) {
  const { spawnTiles, start } = level;
  for (let minDist = FOOD_MIN_DIST; minDist > 0; minDist -= 0.5) {
    const picked = [];
    for (const t of shuffle([...spawnTiles])) {
      const x = t.x + 0.5, y = t.y + 0.5;
      if (Math.hypot(x - start.x, y - start.y) < FOOD_START_DIST) continue;
      if (picked.some((p) => Math.hypot(p.x - x, p.y - y) < minDist)) continue;
      picked.push({ x, y });
      if (picked.length === FOOD_COUNT) break;
    }
    if (picked.length === FOOD_COUNT || minDist <= 0.5) {
      // Виды еды: перемешанный цикл, чтобы встретились все пять
      const kinds = shuffle(Array.from({ length: picked.length }, (_, i) => FOOD_KINDS[i % FOOD_KINDS.length]));
      return picked.map((p, i) => ({ ...p, kind: kinds[i], phase: Math.random() * 6.28, taken: false }));
    }
  }
  return [];
}

// Собаки — далеко от старта котика и друг от друга
function spawnDogs(level, count) {
  const { spawnTiles, start } = level;
  const picked = [];
  for (const t of shuffle([...spawnTiles])) {
    const x = t.x + 0.5, y = t.y + 0.5;
    if (Math.hypot(x - start.x, y - start.y) < DOG_START_DIST) continue;
    if (picked.some((p) => Math.hypot(p.x - x, p.y - y) < 7)) continue;
    picked.push(new Dog(level, x, y));
    if (picked.length === count) break;
  }
  return picked;
}
