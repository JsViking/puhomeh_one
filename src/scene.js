// Сборка списка спрайтов на кадр: земля -> тени -> объекты (с сортировкой по глубине) -> частицы -> свечения.
import { toScreen } from './iso.js';
import { FLOATS_PER_INSTANCE as F } from './gpu.js';

const CAT_BOX = 0.12;  // «след» котика для сортировки (меньше радиуса коллизии — так он никогда не «внутри» дома)
const FOOD_BOX = 0.1;
// Цвета огоньков гирлянды
const BULBS = [[1, 0.3, 0.3], [0.35, 1, 0.45], [1, 0.9, 0.3], [0.4, 0.7, 1]];
const mod = (a, m) => ((a % m) + m) % m;

export class Scene {
  constructor(atlas, level, max = 8192) {
    this.atlas = atlas;
    this.level = level;
    this.max = max;
    this.data = new Float32Array(max * F);
    this.n = 0;
    this.cam = null;
    this.winter = false; // новогодний режим: спрайты с префиксом w_, снег, гирлянды
    this.themed = new Map();
    this.flakes = [];
  }

  // Имя спрайта с учётом темы: зимой берём `w_имя`, если такой есть
  tn(name) {
    if (!this.winter) return name;
    let r = this.themed.get(name);
    if (r === undefined) { r = this.atlas.sprites[`w_${name}`] ? `w_${name}` : name; this.themed.set(name, r); }
    return r;
  }

  put(name, x, y, tint, fx) {
    if (this.n >= this.max) return;
    const s = this.atlas.sprites[this.tn(name)], d = this.data, o = this.n++ * F;
    const AW = this.atlas.width, AH = this.atlas.height;
    d[o] = Math.round(x) - s.ax; d[o + 1] = Math.round(y) - s.ay; d[o + 2] = s.w; d[o + 3] = s.h;
    d[o + 4] = s.x / AW; d[o + 5] = s.y / AH; d[o + 6] = (s.x + s.w) / AW; d[o + 7] = (s.y + s.h) / AH;
    d[o + 8] = tint ? tint[0] : 1; d[o + 9] = tint ? tint[1] : 1; d[o + 10] = tint ? tint[2] : 1; d[o + 11] = tint ? tint[3] : 1;
    d[o + 12] = fx ? fx[0] : 0; d[o + 13] = fx ? fx[1] : 0; d[o + 14] = 0; d[o + 15] = 0;
  }

  rectOf(name, x, y) {
    const s = this.atlas.sprites[this.tn(name)];
    const rx0 = Math.round(x) - s.ax, ry0 = Math.round(y) - s.ay;
    return { rx0, ry0, rx1: rx0 + s.w, ry1: ry0 + s.h };
  }

  build(game, W, H, t, dt) {
    this.n = 0;
    const { level } = this;
    const cat = game.cat;
    const [csx, csy] = toScreen(cat.x, cat.y);

    // Камера плавно догоняет котика, позиция округляется до пикселя
    const tx = csx - W / 2, ty = csy - 14 - H / 2;
    if (!this.cam) this.cam = { x: tx, y: ty };
    const k = 1 - Math.exp(-dt * 6);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    const camX = Math.round(this.cam.x), camY = Math.round(this.cam.y);
    const vis = (x0, y0, x1, y1) => x1 >= camX && x0 <= camX + W && y1 >= camY && y0 <= camY + H;

    // 1. Земля (уже отсортирована от дальних к ближним)
    const wf = Math.floor(t * 2) % 2;
    for (const g of level.ground) {
      const name = g.frames ? g.frames[wf] : g.name;
      const s = this.atlas.sprites[this.tn(name)];
      const x0 = g.sx - s.ax, y0 = g.sy - s.ay;
      if (vis(x0, y0, x0 + s.w, y0 + s.h)) this.put(name, g.sx, g.sy);
    }

    // 2. Тени
    const foods = game.foods.filter((f) => !f.taken);
    this.put('shadow', csx, csy, [1, 1, 1, 0.3]);
    for (const d of game.dogs) { const [x, y] = toScreen(d.x, d.y); this.put('shadow', x, y, [1, 1, 1, 0.3]); }
    for (const f of foods) {
      const [x, y] = toScreen(f.x, f.y);
      // Пульсирующее золотое кольцо на земле: еду видно издалека и ночью (emissive)
      const pulse = 0.55 + 0.45 * Math.sin(t * 4 + f.phase);
      this.put('ring', x, y, [1, 1, 1, pulse], [0, 1]);
      this.put('shadow_s', x, y, [1, 1, 1, 0.25]);
    }

    // 3. Объекты
    const objs = level.objects.filter((o) => vis(o.rx0, o.ry0, o.rx1, o.ry1));
    const catName = `cat${cat.dir}_${cat.frame}`;
    const bob = cat.moving && cat.frame === 1 ? 1 : 0;
    const blinkHidden = game.invuln > 0 && Math.floor(t * 12) % 2 === 0; // мигание после поимки
    objs.push({
      x0: cat.x - CAT_BOX, y0: cat.y - CAT_BOX, x1: cat.x + CAT_BOX, y1: cat.y + CAT_BOX,
      ...this.rectOf(catName, csx, csy - bob),
      draw: () => { if (!blinkHidden) this.put(catName, csx, csy - bob); },
    });
    for (const d of game.dogs) {
      const [dx, dy] = toScreen(d.x, d.y);
      const name = `dog${d.dir}_${d.frame}`;
      const db = d.moving && d.frame === 1 ? 1 : 0;
      objs.push({
        x0: d.x - CAT_BOX, y0: d.y - CAT_BOX, x1: d.x + CAT_BOX, y1: d.y + CAT_BOX,
        ...this.rectOf(name, dx, dy - db),
        draw: () => {
          this.put(name, dx, dy - db);
          if (d.alert > 0) this.put('exclaim', dx, dy - 40 - Math.round(Math.sin(t * 20) * 1.5), null, [0, 1]);
        },
      });
    }
    for (const f of foods) {
      const [fx, fy] = toScreen(f.x, f.y);
      const lift = Math.round(7 + Math.sin(t * 3 + f.phase) * 3);
      const name = `food_${f.kind}`;
      // Короткая белая вспышка раз в пару секунд — «блик», привлекающий взгляд
      const glint = Math.pow(Math.max(0, Math.sin(t * 2.2 + f.phase)), 12) * 0.7;
      objs.push({
        x0: f.x - FOOD_BOX, y0: f.y - FOOD_BOX, x1: f.x + FOOD_BOX, y1: f.y + FOOD_BOX,
        ...this.rectOf(name, fx, fy - lift),
        draw: () => {
          this.put(name, fx, fy - lift, null, [glint, 0.8]);
          if (Math.sin(t * 2.3 + f.phase * 5) > 0.7) this.put('sparkle', fx + 6, fy - lift - 13, null, [0, 1]);
          if (Math.sin(t * 1.7 + f.phase * 3) > 0.8) this.put('sparkle', fx - 7, fy - lift - 4, null, [0, 1]);
        },
        glows: [[fx, fy - 6, true]],
      });
    }
    for (const o of depthSort(objs)) {
      if (o.draw) { o.draw(); continue; }
      this.put((this.winter && o.winterName) || (o.frames ? o.frames[wf] : o.name), o.sx, o.sy);
      // Гирлянда на крыше: бегущие разноцветные огоньки
      if (this.winter && o.lights) {
        const shift = Math.floor(t * 3);
        o.lights.forEach(([lx, ly], i) => this.put('bulb', lx, ly, [...BULBS[(i + shift) % 4], 1], [0, 1]));
      }
    }

    // 4. Частицы
    for (const p of game.particles) {
      const a = 1 - Math.max(0, (p.life - p.max * 0.6) / (p.max * 0.4));
      this.put(p.spr, p.x, p.y, [1, 1, 1, a], [0, 1]);
    }
    // 5. Снегопад (только зимой). Снежинки живут в экранных координатах с параллаксом:
    // ближние сдвигаются вместе с миром, дальние — медленнее.
    if (this.winter) this.snow(W, H, t, dt, camX, camY);
    const nSprites = this.n;

    // 6. Свечения (отдельный аддитивный пайплайн, видны ночью)
    if (game.night > 0.01) {
      for (const o of objs) {
        const glows = (this.winter && o.winterGlows) || o.glows;
        if (glows) {
          for (const [gx, gy, kind, k = 0] of glows) {
            const flick = 0.85 + 0.15 * Math.sin(t * 9 + gx * 0.37) * Math.sin(t * 5.3 + gy);
            let tint = [1.0, 0.72, 0.38, 0.9 * flick];
            if (kind === true) tint = [1.0, 0.9, 0.45, 0.6]; // еда
            if (kind === 'tree') tint = [...BULBS[(k + Math.floor(t * 2)) % 4], 0.7];
            if (kind === 'star') tint = [1.0, 0.9, 0.5, 0.9];
            this.put(kind === 'tree' ? 'glow_s' : 'glow', gx, gy, tint);
          }
        }
        if (this.winter && o.lights) {
          const shift = Math.floor(t * 3);
          o.lights.forEach(([lx, ly], i) => { if (i % 2 === 0) this.put('glow_s', lx, ly, [...BULBS[(i + shift) % 4], 0.8]); });
        }
      }
    }
    return { nSprites, nGlow: this.n - nSprites, camX, camY };
  }
}

Scene.prototype.snow = function (W, H, t, dt, camX, camY) {
  const want = Math.min(320, Math.round((W * H) / 300));
  while (this.flakes.length < want) {
    this.flakes.push({
      x: Math.random() * W, y: Math.random() * H,
      vy: 10 + Math.random() * 16, drift: 4 + Math.random() * 8, ph: Math.random() * 6.28,
      par: 0.6 + Math.random() * 0.4, big: Math.random() < 0.25,
    });
  }
  this.flakes.length = want;
  for (const f of this.flakes) {
    f.y += f.vy * dt;
    f.x += Math.sin(t * 1.3 + f.ph) * f.drift * dt;
    const sx = camX + mod(f.x - camX * f.par, W), sy = camY + mod(f.y - camY * f.par, H);
    this.put(f.big ? 'flake2' : 'flake1', sx, sy, [1, 1, 1, f.big ? 0.9 : 0.75], [0, 0.6]);
  }
};

// Топологическая сортировка по «следам» на земле — классика изометрических движков.
// a рисуется раньше b, если a целиком «за» b по одной из осей и их картинки пересекаются.
function behind(a, b) {
  const ax = a.x1 <= b.x0, ay = a.y1 <= b.y0, bx = b.x1 <= a.x0, by = b.y1 <= a.y0;
  if ((ax && !by) || (ay && !bx)) return true;
  if (ax || ay || bx || by) return false;
  return a.x0 + a.x1 + a.y0 + a.y1 < b.x0 + b.x1 + b.y0 + b.y1;
}

function depthSort(objs) {
  const n = objs.length;
  for (const o of objs) { o._deps = []; o._mark = false; }
  for (let i = 0; i < n; i++) {
    const a = objs[i];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = objs[j];
      if (a.rx1 <= b.rx0 || b.rx1 <= a.rx0 || a.ry1 <= b.ry0 || b.ry1 <= a.ry0) continue;
      if (behind(a, b)) b._deps.push(a);
    }
  }
  objs.sort((a, b) => a.x0 + a.y0 - (b.x0 + b.y0));
  const out = [];
  const visit = (o) => {
    if (o._mark) return;
    o._mark = true;
    for (const d of o._deps) visit(d);
    out.push(o);
  };
  for (const o of objs) visit(o);
  return out;
}
