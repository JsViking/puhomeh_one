// Процедурная генерация всех спрайтов игры и упаковка их в один атлас (RGBA8).
import { IsoCanvas, hash, hex, shade, frac, band, rotBox, gridSprite } from './raster.js';

const C = {
  grass: hex('#6cbf4f'), grassD: hex('#53a23f'), grassL: hex('#94da6a'),
  flowers: ['#ffffff', '#ffd84a', '#ff8fb4'].map(hex),
  stone: ['#cdbb9c', '#c2ae8e', '#d8c8aa'].map(hex), mortar: hex('#9a876c'),
  plaza: hex('#e8d9bb'), plaza2: hex('#dccaa8'), plazaL: hex('#b9a585'),
  water: hex('#3f86d8'), waterD: hex('#336fbf'), waterL: hex('#b4e2ff'),
  wall: hex('#8e909c'), wallD: hex('#6c6e7a'),
  wood: hex('#a8703c'), wood2: hex('#956234'), woodD: hex('#5c3b24'), woodL: hex('#c48a52'),
  red: hex('#d8443a'), white: hex('#fff7ea'), plaster: hex('#f3ead6'), paper: hex('#fff6d8'),
  leaf: hex('#3f9a45'), leafD: hex('#2d7436'), leafL: hex('#62b956'),
  bark: hex('#6e4630'),
  pinkD: hex('#c9679a'), pink: hex('#ea8fb9'), pinkL: hex('#f7b8d4'), pinkLL: hex('#ffe0ee'),
  pineD: hex('#1f5a3a'), pine: hex('#2f7d4f'), pineL: hex('#4aa364'),
  stoneG: hex('#b8b4aa'), stoneGD: hex('#9a968c'),
  warm: hex('#ffd25e'), noren: hex('#2f4b8f'), dark: hex('#2b1f1a'),
  orange: hex('#f4a443'), stripe: hex('#cf7428'), catW: hex('#fff3e0'), catPink: hex('#f59ab0'), eye: hex('#24162a'),
};

// ---------- Земля ----------
function groundCanvas(colorFn, z = 0) {
  const c = new IsoCanvas(40, 36, 20, 4);
  const N = 52;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const u = -0.02 + (1.04 * i) / N, v = -0.02 + (1.04 * j) / N;
    c.plot(u, v, z, colorFn(u, v));
  }
  return c;
}

const grass = (seed) => groundCanvas((u, v) => {
  const px = Math.floor(u * 16), py = Math.floor(v * 16);
  const r = hash(px, py, seed * 7 + 1);
  if (seed === 2 && r > 0.975) return C.flowers[Math.floor(hash(px, py, 99) * 3)];
  if (r < 0.14) return C.grassD;
  if (r > 0.9) return C.grassL;
  return C.grass;
}).finish(false);

const path = (seed) => groundCanvas((u, v) => {
  const a = u * 3, cu = Math.floor(a);
  const b = v * 3 + (((cu % 2) + 2) % 2) * 0.5, cv = Math.floor(b);
  const fu = a - cu, fv = b - cv;
  if (fu < 0.1 || fv < 0.1) return C.mortar;
  const base = C.stone[Math.floor(hash(cu, cv, seed) * 3)];
  if (fu > 0.86 || fv > 0.86) return shade(base, 0.9);
  if (fu < 0.26 && fv < 0.26) return shade(base, 1.06);
  return base;
}).finish(false);

const plaza = () => groundCanvas((u, v) => {
  const a = u * 2, b = v * 2;
  if (frac(a) < 0.06 || frac(b) < 0.06) return C.plazaL;
  return (Math.floor(a) + Math.floor(b)) & 1 ? C.plaza2 : C.plaza;
}).finish(false);

// Вода опущена на 5px; у «дальних» берегов видна каменная стенка канала
function water(frame, wallU, wallV) {
  const c = groundCanvas((u, v) => {
    const px = Math.floor(u * 16), py = Math.floor(v * 16);
    if (hash(px, py, 40 + frame) > 0.94) return C.waterL;
    if (hash(px, py, 5) < 0.2) return C.waterD;
    return C.water;
  }, -5);
  const brick = (a, z) => (frac(z / 2.5) < 0.3 || frac(a * 5 + (Math.floor(z / 2.5) % 2) * 0.5) < 0.1 ? C.wallD : C.wall);
  for (let j = 0; j <= 50; j++) for (let k = 0; k <= 14; k++) {
    const t = j / 50, z = -5 + (5 * k) / 14;
    if (wallU) c.plot(0, t, z, shade(z < -4 ? C.waterL : brick(t, z), 0.75));
    if (wallV) c.plot(t, 0, z, shade(z < -4 ? C.waterL : brick(t, z), 0.9));
  }
  return c.finish(false);
}

function bridge() {
  const c = new IsoCanvas(48, 48, 24, 16);
  c.box(0, 0, -3, 1, 1, 0, (f, u) => {
    if (f !== 'top') return C.woodD;
    if (frac(u * 6) < 0.14) return C.woodD;
    return Math.floor(u * 6) % 2 ? C.wood : C.woodL;
  });
  for (const pu of [0.04, 0.88]) c.box(pu, 0.02, 0, pu + 0.08, 0.1, 9, () => C.red);
  c.box(0, 0.04, 7, 1, 0.09, 9, () => C.red);
  return c.finish(false);
}

// Ближние перила моста — отдельный объект, чтобы правильно сортироваться с котиком
function rail() {
  const c = new IsoCanvas(48, 48, 24, 24);
  for (const pu of [0.04, 0.88]) c.box(pu, 0.9, 0, pu + 0.08, 0.98, 9, () => C.red);
  c.box(0, 0.91, 7, 1, 0.96, 9, () => C.red);
  return c.finish();
}

// ---------- Постройки и декор ----------
function hedge() {
  const c = new IsoCanvas(48, 56, 24, 30);
  c.box(0.04, 0.04, 0, 0.96, 0.96, 11, (f, u, v, z) => {
    const r = hash(Math.floor(u * 16), Math.floor(v * 16) + Math.floor(z / 1.5) * 31, f.length);
    return r < 0.2 ? C.leafD : r > 0.85 ? C.leafL : C.leaf;
  });
  return c.finish();
}

function house(roof, wallVariant) {
  const c = new IsoCanvas(128, 128, 64, 72);
  const RIDGE = 33, EAVE = 20, O = 0.25;
  const zr = (v) => EAVE + (RIDGE - EAVE) * (1 - Math.abs(v - 1) / (1 + O));
  const plaster = wallVariant ? hex('#efe0c0') : C.plaster;

  c.box(0, 0, 0, 2, 2, 2, (f, u, v, z) => (hash(Math.floor(u * 10), Math.floor(v * 10) + Math.floor(z) * 13, 3) < 0.3 ? C.wallD : C.wall));

  c.box(0.06, 0.06, 2, 1.94, 1.94, EAVE, (f, u, v, z) => {
    if (f === 'top') return null;
    const a = f === '+v' ? u : v;
    if (Math.abs(a - 0.06) < 0.06 || Math.abs(a - 1.94) < 0.06 || Math.abs(a - 1) < 0.04) return C.woodD;
    if (f === '+v' && a > 1.22 && a < 1.72 && z < 15) {
      // дверь с занавеской-норэн
      if (z > 9.5) return Math.abs(a - 1.47) < 0.03 ? C.dark : C.noren;
      return C.dark;
    }
    const win = (f === '+v' && a > 0.3 && a < 0.8 && z > 10 && z < 16.5) || (f === '+u' && a > 1.2 && a < 1.7 && z > 10 && z < 16.5);
    if (win) return frac(a * 14) < 0.2 || Math.floor(z) % 3 === 0 ? C.woodD : C.paper; // сёдзи
    if (z < 8) return Math.floor(a * 14) % 2 ? C.wood : C.wood2;
    if (z < 9.2 || z > EAVE - 1.5) return C.woodD;
    return plaster;
  });

  // фронтон
  for (let j = 0; j <= 90; j++) {
    const v = 0.06 + (1.88 * j) / 90, top = zr(v);
    for (let z = EAVE; z <= top; z += 0.4) {
      const beam = Math.abs(z - (EAVE + 5)) < 0.8 || Math.abs(v - 1) < 0.04;
      c.plot(1.94, v, z, shade(beam ? C.woodD : plaster, 0.7));
    }
  }

  // двускатная черепичная крыша
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const u = -O + ((2 + 2 * O) * i) / N;
    for (let j = 0; j <= N; j++) {
      const v = -O + ((2 + 2 * O) * j) / N, s = Math.abs(v - 1);
      let col = roof;
      if (frac(u * 9) < 0.22) col = shade(roof, 0.8);
      if (frac(s * 7) < 0.14) col = shade(roof, 0.88);
      if (s < 0.08) col = shade(roof, 0.62);
      if (s > 1 + O - 0.07) col = shade(roof, 0.7);
      c.plot(u, v, zr(v), shade(col, v < 1 ? 0.8 : 1.0));
    }
  }
  for (let j = 0; j <= N; j++) {
    const t = -O + ((2 + 2 * O) * j) / N;
    for (let k = 0; k <= 4; k++) {
      c.plot(2 + O, t, zr(t) - k * 0.5, shade(roof, 0.5));
      c.plot(t, 2 + O, EAVE - k * 0.5, shade(roof, 0.55));
    }
  }
  // горшок с растением у двери
  c.box(1.82, 1.94, 0, 1.94, 2.04, 3, () => hex('#b0583a'));
  c.ellipsoid(1.88, 1.99, 5, 0.08, 0.08, 3, (l) => shade(C.leaf, band(l)));
  return c.finish();
}

function crown(c, blobs, pal) {
  for (const [u, v, z, ru, rv, rz] of blobs) {
    c.ellipsoid(u, v, z, ru, rv, rz, (l, nx, ny, nz, U, V, Z) => {
      const r = hash(Math.floor(U * 24), Math.floor(V * 24), Math.floor(Z));
      if (pal.length > 4 && r > 0.95) return pal[4];
      const ll = l + (r - 0.5) * 0.3;
      return ll < 0.2 ? pal[0] : ll < 0.5 ? pal[1] : ll < 0.8 ? pal[2] : pal[3];
    });
  }
}

function sakura() {
  const c = new IsoCanvas(80, 96, 40, 60);
  c.cylinder(0.5, 0.5, 0, 0.07, 16, (p, l) => shade(C.bark, band(l)));
  crown(c, [[0.5, 0.5, 26, 0.48, 0.48, 11], [0.25, 0.62, 21, 0.3, 0.3, 8], [0.7, 0.3, 22, 0.3, 0.3, 8], [0.45, 0.78, 19, 0.28, 0.28, 7], [0.58, 0.52, 33, 0.32, 0.32, 7]],
    [C.pinkD, C.pink, C.pinkL, C.pinkLL, C.white]);
  return c.finish();
}

function pine() {
  const c = new IsoCanvas(80, 96, 40, 60);
  c.cylinder(0.5, 0.5, 0, 0.08, 20, (p, l) => shade(hex('#5a3d2a'), band(l)));
  crown(c, [[0.5, 0.5, 13, 0.46, 0.46, 5], [0.42, 0.58, 20, 0.36, 0.36, 5], [0.55, 0.47, 27, 0.25, 0.25, 4.5]],
    [C.pineD, C.pine, C.pine, C.pineL]);
  return c.finish();
}

function lantern() {
  const c = new IsoCanvas(48, 64, 24, 44);
  const st = (f, u, v, z) => (hash(Math.floor(u * 20), Math.floor(v * 20), Math.floor(z)) < 0.15 ? C.stoneGD : C.stoneG);
  c.box(0.3, 0.3, 0, 0.7, 0.7, 3, st);
  c.box(0.43, 0.43, 3, 0.57, 0.57, 11, st);
  c.box(0.33, 0.33, 11, 0.67, 0.67, 13, st);
  c.box(0.36, 0.36, 13, 0.64, 0.64, 19, (f, u, v, z) => {
    if (f !== 'top' && z > 14 && z < 18) { const a = f === '+u' ? v : u; if (a > 0.42 && a < 0.58) return C.warm; }
    return st(f, u, v, z);
  });
  c.box(0.24, 0.24, 19, 0.76, 0.76, 21, st);
  c.box(0.33, 0.33, 21, 0.67, 0.67, 23, st);
  c.box(0.45, 0.45, 23, 0.55, 0.55, 26, st);
  return c.finish();
}

function stall(variant) {
  const c = new IsoCanvas(64, 72, 32, 46);
  const awn = variant ? hex('#3c6fd0') : C.red;
  for (const [pu, pv] of [[0.1, 0.2], [0.84, 0.2], [0.1, 0.84], [0.84, 0.84]]) c.box(pu, pv, 0, pu + 0.06, pv + 0.06, 20, () => C.woodD);
  c.box(0.1, 0.45, 0, 0.9, 0.9, 9, (f, u, v, z) => (f === 'top' ? C.woodL : z < 2 ? C.woodD : Math.floor((f === '+v' ? u : v) * 10) % 2 ? C.wood : C.wood2));
  const goods = ['#e8483c', '#f29b2e', '#8bc34a', '#ffe066'].map(hex);
  for (let i = 0; i < 4; i++) c.ellipsoid(0.22 + i * 0.18, 0.66, 10.5, 0.07, 0.07, 2, (l) => shade(goods[(i + variant) % 4], band(l)));
  // навес с полосками, слегка наклонён вперёд
  for (let i = 0; i <= 60; i++) for (let j = 0; j <= 60; j++) {
    const u = 0.02 + (0.96 * i) / 60, v = 0.12 + (0.9 * j) / 60;
    c.plot(u, v, 23 - (v - 0.12) * 5, Math.floor(u * 8) % 2 ? awn : C.white);
  }
  for (let i = 0; i <= 60; i++) {
    const u = 0.02 + (0.96 * i) / 60, zf = 23 - 0.9 * 5, drop = 2 + (frac(u * 8) < 0.5 ? 1 : 0);
    for (let z = zf - drop; z <= zf; z += 0.4) c.plot(u, 1.02, z, shade(Math.floor(u * 8) % 2 ? awn : C.white, 0.86));
  }
  c.ellipsoid(0.86, 1.0, 13, 0.07, 0.07, 3, (l) => shade(hex('#e84a3a'), band(l)));
  return c.finish();
}

function fountain(frame) {
  const c = new IsoCanvas(96, 96, 48, 46);
  const stone = hex('#b5b0a8'), stoneL = hex('#d4d0c8');
  const waterRing = (rr, k) => (frac(rr * k - frame * 0.5) < 0.18 ? C.waterL : C.water);
  c.cylinder(1, 1, 0, 0.85, 6, (part, l, rr) => (part === 'top' ? (rr < 0.7 ? null : stoneL) : shade(stone, band(l))));
  c.cylinder(1, 1, 3.5, 0.7, 2.5, (part, l) => (part === 'top' ? null : shade(stone, 0.8)));
  for (let i = 0; i <= 30; i++) {
    const rr = (0.7 * i) / 30, m = Math.ceil(rr * 250) + 1;
    for (let j = 0; j < m; j++) { const ph = (2 * Math.PI * j) / m; c.plot(1 + rr * Math.cos(ph), 1 + rr * Math.sin(ph), 4, waterRing(rr, 5)); }
  }
  c.cylinder(1, 1, 0, 0.12, 15, (part, l) => shade(stone, band(l)));
  c.cylinder(1, 1, 15, 0.32, 3, (part, l, rr) => (part === 'top' ? (rr < 0.25 ? C.water : stoneL) : shade(stone, band(l))));
  // струи воды
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2 + 0.2;
    for (let t = 0; t <= 1; t += 0.01) {
      if ((Math.floor(t * 10) + frame) % 2) continue;
      const rr = 0.32 + 0.3 * t;
      c.plot(1 + rr * Math.cos(ang), 1 + rr * Math.sin(ang), 18 - 14 * t * t, C.waterL);
    }
  }
  c.ellipsoid(1, 1, 20 + frame, 0.06, 0.06, 2, () => C.waterL);
  return c.finish();
}

// ---------- Котик: воксельная модель, 4 направления × 3 кадра ----------
function cat(dir, frame) {
  const c = new IsoCanvas(72, 72, 36, 48);
  const S = 1.6;
  const B = (a0, b0, z0, a1, b1, z1, col) => rotBox(c, dir, a0 * S, b0 * S, z0 * S, a1 * S, b1 * S, z1 * S, (f, a, b, z) => col(f, a / S, b / S, z / S));
  const O = C.orange, St = C.stripe, W = C.catW;
  const step = frame === 0 ? 0 : frame === 1 ? 1 : -1;
  const stripe = (a) => frac(a * 14) < 0.35;

  for (const [la, lb, ph] of [[0.12, -0.07, 1], [0.12, 0.07, -1], [-0.13, -0.07, -1], [-0.13, 0.07, 1]]) {
    const lift = step * ph > 0 ? 1.5 : 0, da = step * ph * 0.035;
    B(la - 0.035 + da, lb - 0.035, lift, la + 0.035 + da, lb + 0.035, lift + 4, (f, a, b, z) => (z < lift + 1.6 ? W : O));
  }
  B(-0.21, -0.1, 3.5, 0.2, 0.1, 9, (f, a, b, z) => {
    if (f === '+a') return W;
    if (f === 'top') return stripe(a) ? St : O;
    if (z < 5.2) return W;
    return stripe(a) && z > 6.5 ? St : O;
  });
  const sway = frame === 2 ? 0.03 : frame === 1 ? -0.03 : 0;
  B(-0.3, -0.03, 7.5, -0.2, 0.03, 9.5, () => O);
  B(-0.34, -0.03 + sway, 8, -0.28, 0.03 + sway, 16, (f, a, b, z) => (z > 13.5 || Math.floor(z) % 3 === 0 ? St : O));
  B(0.12, -0.15, 7, 0.37, 0.15, 15, (f, a, b, z) => {
    if (f === '+a') {
      if (z > 10.6 && z < 12.8 && Math.abs(Math.abs(b) - 0.07) < 0.032) return C.eye;
      if (z > 9.4 && z <= 10.6 && Math.abs(b) < 0.025) return C.catPink;
      if (z < 10 && Math.abs(b) < 0.09) return W;
      return O;
    }
    if (f === 'top') return (Math.abs(b) < 0.025 || Math.abs(Math.abs(b) - 0.08) < 0.02) && a < 0.3 ? St : O;
    return z < 9.5 ? W : O;
  });
  for (const eb of [-0.1, 0.1]) {
    B(0.2, eb - 0.045, 15, 0.27, eb + 0.045, 18.5, (f, a, b, z) => (f === '+a' && Math.abs(b - eb) < 0.02 && z < 17.5 ? C.catPink : O));
  }
  return c.finish();
}

// ---------- Собака-сиба: тоже воксели, 4 направления × 3 кадра ----------
function dog(dir, frame) {
  const c = new IsoCanvas(80, 80, 40, 54);
  const S = 1.6;
  const B = (a0, b0, z0, a1, b1, z1, col) => rotBox(c, dir, a0 * S, b0 * S, z0 * S, a1 * S, b1 * S, z1 * S, (f, a, b, z) => col(f, a / S, b / S, z / S));
  const Br = hex('#d98c3f'), Cr = hex('#fff1d6'), Dk = hex('#8a4f22'), Red = hex('#d8343a');
  const step = frame === 0 ? 0 : frame === 1 ? 1 : -1;

  for (const [la, lb, ph] of [[0.14, -0.08, 1], [0.14, 0.08, -1], [-0.17, -0.08, -1], [-0.17, 0.08, 1]]) {
    const lift = step * ph > 0 ? 1.8 : 0, da = step * ph * 0.045;
    B(la - 0.045 + da, lb - 0.04, lift, la + 0.045 + da, lb + 0.04, lift + 5, (f, a, b, z) => (z < lift + 1.6 ? Cr : Br));
  }
  B(-0.25, -0.12, 4.5, 0.22, 0.12, 10.5, (f, a, b, z) => (f === '+a' || z < 6.3 ? Cr : Br));
  // хвост-бублик
  B(-0.31, -0.04, 9, -0.23, 0.04, 15, (f, a, b, z) => (z > 13 ? Cr : Br));
  B(-0.29, -0.04, 14, -0.17, 0.04, 16.5, () => Cr);
  // ошейник
  B(0.11, -0.13, 8.5, 0.18, 0.13, 10.2, () => Red);
  // голова и морда
  B(0.14, -0.16, 8, 0.42, 0.16, 16, (f, a, b, z) => {
    if (f === '+a') {
      if (z > 12 && z < 13.9 && Math.abs(Math.abs(b) - 0.085) < 0.03) return C.eye;
      if (z < 11.5) return Cr;
      return Br;
    }
    if (f === 'top') return Br;
    return z < 10.5 ? Cr : Br;
  });
  B(0.42, -0.075, 8.5, 0.53, 0.075, 11.5, (f, a, b, z) => (f === '+a' && z > 10.2 && Math.abs(b) < 0.035 ? C.eye : Cr));
  for (const eb of [-0.1, 0.1]) {
    B(0.22, eb - 0.045, 16, 0.31, eb + 0.045, 19.5, (f, a, b, z) => (f === '+a' && Math.abs(b - eb) < 0.02 && z < 18.5 ? Cr : f === 'top' ? Dk : Br));
  }
  return c.finish();
}

// ---------- Плоские спрайты: еда, частицы, тени ----------
const FOOD = {
  fish: [[
    '..bbbbb...ff',
    '.bbbbbbbb.ff',
    'bebbbbbbbbff',
    'bllllllllbf.',
    '.llllllll.ff',
    '..lllll...f.',
  ], { b: hex('#6aa8e8'), l: hex('#d6efff'), e: hex('#24162a'), f: hex('#3d7cc9') }],
  onigiri: [[
    '....ww....',
    '...wwww...',
    '..wwwwww..',
    '.wwwwwwww.',
    '.wwwwwwwg.',
    'wwnnnnnngg',
    'wwnnnnnngg',
    '.wnnnnnng.',
  ], { w: hex('#ffffff'), g: hex('#d9dde6'), n: hex('#1f3b2c') }],
  milk: [[
    '.cccc.',
    '.cccc.',
    '..mm..',
    '.mmmm.',
    'mmmmms',
    'mbbbms',
    'mbbbms',
    'mmmmms',
    '.mmms.',
  ], { c: hex('#e84a5f'), m: hex('#ffffff'), s: hex('#cfd6e6'), b: hex('#4a8fe0') }],
  dango: [[
    '..pp..',
    '.pppp.',
    '.pppp.',
    '..pp..',
    '..ww..',
    '.wwww.',
    '.wwww.',
    '..ww..',
    '..gg..',
    '.gggg.',
    '.gggg.',
    '..gg..',
    '..tt..',
    '..tt..',
  ], { p: hex('#f7a8c8'), w: hex('#fff8ee'), g: hex('#9fd27a'), t: hex('#a8703c') }],
  tin: [[
    '.ssssss.',
    'sllllllS',
    'syyyyyyS',
    'syybbyyS',
    'syyyyyyS',
    '.SSSSSS.',
  ], { s: hex('#d8dce8'), l: hex('#ffffff'), S: hex('#8a90a8'), y: hex('#f0c040'), b: hex('#4080d0') }],
};

function ellipse(w, h) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) { const dx = (x + 0.5 - w / 2) / (w / 2), dy = (y + 0.5 - h / 2) / (h / 2); r += dx * dx + dy * dy <= 1 ? 'k' : '.'; }
    rows.push(r);
  }
  return gridSprite(rows, { k: [0, 0, 0] }, { ax: w >> 1, ay: h >> 1, outline: false });
}

// Золотое кольцо на земле под едой — чтобы её было видно издалека
function ring(w, h) {
  const rows = [];
  const inside = (x, y, rx, ry) => {
    const dx = (x + 0.5 - w / 2) / rx, dy = (y + 0.5 - h / 2) / ry;
    return dx * dx + dy * dy <= 1;
  };
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) {
      const outer = inside(x, y, w / 2, h / 2), inner = inside(x, y, w / 2 - 2, h / 2 - 1);
      r += outer && !inner ? 'y' : outer ? 'l' : '.';
    }
    rows.push(r);
  }
  return gridSprite(rows, { y: hex('#ffd25e'), l: [255, 240, 170, 90] }, { ax: w >> 1, ay: h >> 1, outline: false });
}

// Мягкое свечение фонаря с дизерингом Байера (ретро-градиент)
function glow(size) {
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const c = new IsoCanvas(size, size, size >> 1, size >> 1);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
    const a = Math.pow(Math.max(0, 1 - d), 1.6);
    const q = Math.floor(a * 5 + BAYER[(y % 4) * 4 + (x % 4)] / 16) / 5;
    if (q > 0) c.set(x, y, [255, 255, 255, Math.round(q * 255)]);
  }
  return { w: size, h: size, ax: size >> 1, ay: size >> 1, data: c.px };
}

// ---------- Сборка атласа ----------
export function buildAtlas() {
  const S = {};
  for (let i = 0; i < 3; i++) S[`grass${i}`] = grass(i);
  S.path0 = path(1); S.path1 = path(2);
  S.plaza = plaza();
  for (let f = 0; f < 2; f++) for (let wu = 0; wu < 2; wu++) for (let wv = 0; wv < 2; wv++) S[`water${wu}${wv}_${f}`] = water(f, wu, wv);
  S.bridge = bridge(); S.rail = rail();
  S.hedge = hedge();
  S.house_blue = house(hex('#4b5e86'), 0);
  S.house_red = house(hex('#b8473a'), 1);
  S.house_green = house(hex('#4f8a6a'), 0);
  S.sakura = sakura(); S.pine = pine(); S.lantern = lantern();
  S.stall0 = stall(0); S.stall1 = stall(1);
  S.fountain0 = fountain(0); S.fountain1 = fountain(1);
  for (let d = 0; d < 4; d++) for (let f = 0; f < 3; f++) S[`cat${d}_${f}`] = cat(d, f);
  for (let d = 0; d < 4; d++) for (let f = 0; f < 3; f++) S[`dog${d}_${f}`] = dog(d, f);
  S.exclaim = gridSprite(['.rr.', 'rrrr', 'rrrr', '.rr.', '.rr.', '....', '.rr.', '.rr.'], { r: hex('#ff4040') }, { ax: 2, ay: 8 });
  for (const [k, [rows, pal]] of Object.entries(FOOD)) S[`food_${k}`] = gridSprite(rows, pal);
  S.heart = gridSprite(['.rr.rr.', 'rwrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], { r: hex('#ff5c8a'), w: hex('#ffd0de') }, { ax: 3, ay: 3 });
  S.sparkle = gridSprite(['..y..', '..y..', 'yyWyy', '..y..', '..y..'], { y: hex('#fff6a0'), W: hex('#ffffff') }, { ax: 2, ay: 2, outline: false });
  S.shadow = ellipse(18, 7);
  S.shadow_s = ellipse(11, 4);
  S.ring = ring(22, 9);
  S.glow = glow(48);

  // Простая «полочная» упаковка с 1px зазором (чтобы nearest-семплинг не цеплял соседей)
  const W = 1024;
  const names = Object.keys(S).sort((a, b) => S[b].h - S[a].h);
  let x = 1, y = 1, rowH = 0;
  for (const n of names) {
    const s = S[n];
    if (x + s.w + 1 > W) { x = 1; y += rowH + 1; rowH = 0; }
    s.x = x; s.y = y; x += s.w + 1; rowH = Math.max(rowH, s.h);
  }
  let H = 64;
  while (H < y + rowH + 1) H *= 2;
  const data = new Uint8Array(W * H * 4);
  for (const n of names) {
    const s = S[n];
    for (let row = 0; row < s.h; row++) data.set(s.data.subarray(row * s.w * 4, (row + 1) * s.w * 4), ((s.y + row) * W + s.x) * 4);
    delete s.data;
  }
  return { width: W, height: H, data, sprites: S };
}
