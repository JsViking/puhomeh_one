// Крошечный программный изометрический растеризатор.
// Вызывается один раз при старте, чтобы «нарисовать» пиксель-арт спрайты кодом
// (никаких внешних картинок). Потом всё уходит в одну GPU-текстуру-атлас.
//
// Мировые единицы: 1 = один тайл по осям u (x) и v (y); z — высота в экранных пикселях.
// Проекция 2:1 (тайл 32×16 px):  sx = (u - v) * 16,  sy = (u + v) * 8 - z

export const OUTLINE = [42, 26, 46];
export const L = (() => { const v = [-0.35, 0.6, 0.72]; const l = Math.hypot(...v); return v.map((x) => x / l); })();

export function hash(a, b = 0, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1440670441);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
export const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const frac = (x) => x - Math.floor(x);
// Постеризация освещения — даёт «ступенчатые» пиксельные тени
export const band = (l) => (l < 0.2 ? 0.7 : l < 0.5 ? 0.85 : l < 0.8 ? 1.0 : 1.12);

export class IsoCanvas {
  constructor(w, h, ax, ay) {
    Object.assign(this, { w, h, ax, ay });
    this.px = new Uint8ClampedArray(w * h * 4);
    this.depth = new Float32Array(w * h).fill(-Infinity);
  }

  // Точка мира -> пиксель с z-буфером (больше u+v+z/8 — ближе к камере)
  plot(u, v, z, c) {
    if (!c) return;
    const sx = Math.floor(this.ax + (u - v) * 16);
    const sy = Math.floor(this.ay + (u + v) * 8 - z);
    if (sx < 0 || sy < 0 || sx >= this.w || sy >= this.h) return;
    const i = sy * this.w + sx;
    const d = u + v + z / 8;
    if (d < this.depth[i] - 1e-4) return;
    this.depth[i] = d;
    const o = i * 4;
    this.px[o] = c[0]; this.px[o + 1] = c[1]; this.px[o + 2] = c[2]; this.px[o + 3] = c[3] ?? 255;
  }

  // Прямая запись 2D-пикселя (для плоских спрайтов)
  set(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 4;
    this.px[o] = c[0]; this.px[o + 1] = c[1]; this.px[o + 2] = c[2]; this.px[o + 3] = c[3] ?? 255;
  }

  // Коробка, выровненная по осям. Видимы только грани top, +u (правая) и +v (левая).
  // col(face, u, v, z) -> rgb | null
  box(u0, v0, z0, u1, v1, z1, col) {
    const du = u1 - u0, dv = v1 - v0, dz = z1 - z0;
    const nu = Math.max(1, Math.ceil(du * 44)), nv = Math.max(1, Math.ceil(dv * 44)), nz = Math.max(1, Math.ceil(dz * 2.5));
    for (let i = 0; i <= nu; i++) {
      const u = u0 + (du * i) / nu;
      for (let k = 0; k <= nz; k++) {
        const z = z0 + (dz * k) / nz;
        const c = col('+v', u, v1, z);
        if (c) this.plot(u, v1, z, shade(c, 0.86));
      }
    }
    for (let j = 0; j <= nv; j++) {
      const v = v0 + (dv * j) / nv;
      for (let k = 0; k <= nz; k++) {
        const z = z0 + (dz * k) / nz;
        const c = col('+u', u1, v, z);
        if (c) this.plot(u1, v, z, shade(c, 0.7));
      }
    }
    for (let i = 0; i <= nu; i++) {
      const u = u0 + (du * i) / nu;
      for (let j = 0; j <= nv; j++) {
        const v = v0 + (dv * j) / nv;
        this.plot(u, v, z1, col('top', u, v, z1));
      }
    }
  }

  // Эллипсоид. col(light, nx, ny, nz, u, v, z) -> rgb
  ellipsoid(cu, cv, cz, ru, rv, rz, col) {
    const n = Math.ceil((Math.max(ru, rv) * 16 * 4 + rz * 2) * 1.5) + 8;
    for (let i = 0; i <= n; i++) {
      const th = (Math.PI * i) / n, st = Math.sin(th), nz = Math.cos(th);
      const m = Math.max(4, Math.ceil(2 * n * st));
      for (let j = 0; j < m; j++) {
        const ph = (2 * Math.PI * j) / m;
        const nx = st * Math.cos(ph), ny = st * Math.sin(ph);
        const l = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        const u = cu + ru * nx, v = cv + rv * ny, z = cz + rz * nz;
        this.plot(u, v, z, col(l, nx, ny, nz, u, v, z));
      }
    }
  }

  // Цилиндр. col(part: 'side'|'top', light, rr, nx, ny, z) -> rgb | null
  cylinder(cu, cv, z0, r, h, col) {
    const m = Math.ceil(r * 16 * 2 * Math.PI * 2.5) + 8, nz = Math.ceil(h * 2.5) + 1;
    for (let j = 0; j < m; j++) {
      const ph = (2 * Math.PI * j) / m, nx = Math.cos(ph), ny = Math.sin(ph);
      const l = Math.max(0, nx * L[0] + ny * L[1]);
      for (let k = 0; k <= nz; k++) {
        const z = z0 + (h * k) / nz;
        this.plot(cu + r * nx, cv + r * ny, z, col('side', l, r, nx, ny, z));
      }
    }
    const nr = Math.ceil(r * 40) + 1;
    for (let i = 0; i <= nr; i++) {
      const rr = (r * i) / nr, mm = Math.max(1, Math.ceil(rr * 16 * 2 * Math.PI * 2.5));
      for (let j = 0; j < mm; j++) {
        const ph = (2 * Math.PI * j) / mm;
        this.plot(cu + rr * Math.cos(ph), cv + rr * Math.sin(ph), z0 + h, col('top', 1, rr, Math.cos(ph), Math.sin(ph), z0 + h));
      }
    }
  }

  // Обрезка по содержимому + тёмный контур в 1px (классика пиксель-арта)
  finish(outline = true) {
    const { w, h, px } = this;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return { w: 1, h: 1, ax: 0, ay: 0, data: new Uint8ClampedArray(4) };
    const p = outline ? 1 : 0;
    x0 -= p; y0 -= p; x1 += p; y1 += p;
    const W = x1 - x0 + 1, H = y1 - y0 + 1;
    const data = new Uint8ClampedArray(W * H * 4);
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && px[(y * w + x) * 4 + 3] > 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = x + x0, sy = y + y0, o = (y * W + x) * 4;
      if (solid(sx, sy)) {
        const i = (sy * w + sx) * 4;
        data[o] = px[i]; data[o + 1] = px[i + 1]; data[o + 2] = px[i + 2]; data[o + 3] = px[i + 3];
      } else if (outline && (solid(sx - 1, sy) || solid(sx + 1, sy) || solid(sx, sy - 1) || solid(sx, sy + 1))) {
        data[o] = OUTLINE[0]; data[o + 1] = OUTLINE[1]; data[o + 2] = OUTLINE[2]; data[o + 3] = 255;
      }
    }
    return { w: W, h: H, ax: this.ax - x0, ay: this.ay - y0, data };
  }
}

// Коробка в локальных координатах модели (a — вперёд, b — вбок), повёрнутой на k*90°.
// Нужна, чтобы из одной модели котика получить 4 направления взгляда.
export function rotBox(cv, k, a0, b0, z0, a1, b1, z1, col) {
  const R = (a, b) => (k === 0 ? [a, b] : k === 1 ? [-b, a] : k === 2 ? [-a, -b] : [b, -a]);
  const Ri = (u, v) => (k === 0 ? [u, v] : k === 1 ? [v, -u] : k === 2 ? [-u, -v] : [-v, u]);
  const p = R(a0, b0), q = R(a1, b1);
  const faceOf = (nu, nv) => {
    const [na, nb] = Ri(nu, nv);
    return na > 0.5 ? '+a' : na < -0.5 ? '-a' : nb > 0.5 ? '+b' : '-b';
  };
  const fU = faceOf(1, 0), fV = faceOf(0, 1);
  cv.box(Math.min(p[0], q[0]), Math.min(p[1], q[1]), z0, Math.max(p[0], q[0]), Math.max(p[1], q[1]), z1, (face, u, v, z) => {
    const [a, b] = Ri(u, v);
    return col(face === 'top' ? 'top' : face === '+u' ? fU : fV, a, b, z);
  });
}

// Плоский спрайт из строк-«пиксельной сетки». Якорь по умолчанию — центр нижнего края.
export function gridSprite(rows, pal, { ax, ay, outline = true } = {}) {
  const w = rows[0].length, h = rows.length;
  const c = new IsoCanvas(w + 2, h + 2, (ax ?? Math.floor(w / 2)) + 1, (ay ?? h) + 1);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) c.set(x + 1, y + 1, pal[ch]); }));
  return c.finish(outline);
}
