// Карта городка 20×20. Ось x идёт вправо-вниз по экрану, y — влево-вниз.
//
//  .  трава        =  дорожка       o  площадь      ~  канал      #  мост
//  A/C/D  дом 2×2 (синяя/красная/зелёная крыша)     F  фонтан 2×2
//  T  сакура   P  сосна   L  каменный фонарь   S  лавка-ятай   B  живая изгородь
//  @  старт котика.  Еда расставляется случайно при каждом старте (см. game.js).
import { toScreen } from './iso.js';
import { hash, frac } from './raster.js';

export const MAP = [
  'PBBTBBBBPBBBB~~BBTBP',
  'B..AA...=....~~.CC.B',
  'B..AA..==..T.~~.CC.B',
  'B...=====....~~..=.B',
  'T.L.=...=..L.~~..=.B',
  'B...=...=....~~..=.B',
  'BDD.=..SoooS=##====B',
  'BDD.=..oooooo~~..=.T',
  'B...=..ooFFoo~~.AA.B',
  'P...=..ooFFoo~~.AA.B',
  'B...=..oooooo~~..=.B',
  'B.L.=..SoooSo~~..=.B',
  'T...=========##===.B',
  'B..CC...=....~~..=.B',
  'B..CC.T.=..P.~~..=.T',
  'B......@=....~~DD=.B',
  'B..L....=.T..~~DD=.B',
  'BBB.....===..~~..=.B',
  'B....T.......~~..L.B',
  'PBBTBBBPBBBBB~~BBTBP',
];

const HOUSES = { A: 'house_blue', C: 'house_red', D: 'house_green' };
const SOLID = new Set(['~', 'A', 'C', 'D', 'F', 'T', 'P', 'L', 'S', 'B']);
export const FOOD_KINDS = ['fish', 'onigiri', 'milk', 'dango', 'tin'];
const SNOWMEN = new Set(['2,11', '3,16']); // клетки фонарей, где зимой стоят снеговики

export function buildLevel(atlas) {
  const H = MAP.length, W = MAP[0].length;
  MAP.forEach((r, i) => { if (r.length !== W) throw new Error(`Строка карты ${i}: ${r.length} символов вместо ${W}`); });
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : MAP[y][x]);
  const solid = MAP.map((r) => [...r].map((ch) => SOLID.has(ch)));
  const ground = [], objects = [];
  const used = new Set();
  let start = { x: W / 2, y: H / 2 };

  // Статический объект: спрайт рисуется от угла тайла (ox, oy); box — «след» на земле для сортировки.
  // Экранный прямоугольник — объединение обычного и зимнего спрайта (ёлка выше фонтана).
  const addObj = (name, ox, oy, box, extra = {}) => {
    const frames = Array.isArray(name) ? name : null;
    const base = frames ? frames[0] : name;
    const [sx, sy] = toScreen(ox, oy);
    const variants = [base, `w_${base}`, extra.winterName].filter((n) => n && atlas.sprites[n]).map((n) => atlas.sprites[n]);
    objects.push({
      name, frames, sx, sy,
      x0: box[0], y0: box[1], x1: box[2], y1: box[3],
      rx0: Math.min(...variants.map((s) => sx - s.ax)), ry0: Math.min(...variants.map((s) => sy - s.ay)),
      rx1: Math.max(...variants.map((s) => sx - s.ax + s.w)), ry1: Math.max(...variants.map((s) => sy - s.ay + s.h)),
      glows: [], ...extra,
    });
  };

  // Гирлянда по краю крыши дома (для новогоднего режима): фронтальный карниз и скат фронтона
  const garland = (x, y) => {
    const pts = [];
    for (let u = -0.15; u <= 2.16; u += 0.23) pts.push(toScreen(x + u, y + 2.27, 19.3 - 1.2 * Math.sin(Math.PI * frac((u + 0.15) / 0.46))));
    const zr = (v) => 20 + 13 * (1 - Math.abs(v - 1) / 1.25);
    for (let v = -0.2; v <= 2.21; v += 0.24) pts.push(toScreen(x + 2.27, y + v, zr(v) - 0.6));
    return pts;
  };

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = MAP[y][x];
    const [sx, sy] = toScreen(x, y);
    const d = x + y;

    if (ch === '~') {
      const land = (c) => c !== null && c !== '~';
      const wu = land(at(x - 1, y)) ? 1 : 0, wv = land(at(x, y - 1)) ? 1 : 0;
      ground.push({ frames: [`water${wu}${wv}_0`, `water${wu}${wv}_1`], sx, sy, d });
    } else if (ch === '#') {
      ground.push({ name: 'bridge', sx, sy, d });
      addObj('rail', x, y, [x, y + 0.9, x + 1, y + 1]);
    } else if ('=*'.includes(ch)) {
      ground.push({ name: hash(x, y, 3) < 0.5 ? 'path0' : 'path1', sx, sy, d });
    } else if ('o%SF'.includes(ch)) {
      ground.push({ name: 'plaza', sx, sy, d });
    } else {
      const r = hash(x, y, 1);
      ground.push({ name: r < 0.15 ? 'grass2' : r < 0.55 ? 'grass1' : 'grass0', sx, sy, d });
    }

    const key = `${x},${y}`;
    if ((HOUSES[ch] || ch === 'F') && !used.has(key)) {
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) used.add(`${x + dx},${y + dy}`);
      if (ch === 'F') {
        // Зимой здесь стоит ёлка: вокруг неё разноцветные отсветы огоньков
        const treeGlows = [];
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2, r = 0.5 - (k % 3) * 0.12;
          treeGlows.push([...toScreen(x + 1 + r * Math.cos(a), y + 1 + r * Math.sin(a), 14 + (k % 3) * 12), 'tree', k]);
        }
        treeGlows.push([...toScreen(x + 1, y + 1, 57), 'star']);
        addObj(['fountain0', 'fountain1'], x, y, [x, y, x + 2, y + 2], { winterGlows: treeGlows });
      } else {
        addObj(HOUSES[ch], x, y, [x, y, x + 2, y + 2], { glows: [toScreen(x + 0.55, y + 2, 13), toScreen(x + 2, y + 1.45, 13)], lights: garland(x, y) });
      }
    }
    const one = [x, y, x + 1, y + 1];
    if (ch === 'T') addObj('sakura', x, y, one);
    if (ch === 'P') addObj('pine', x, y, one);
    if (ch === 'B') addObj('hedge', x, y, one);
    if (ch === 'L') {
      // Два фонаря в новогоднем режиме превращаются в снеговиков
      const snowy = SNOWMEN.has(`${x},${y}`);
      addObj('lantern', x, y, one, { glows: [toScreen(x + 0.5, y + 0.5, 16)], ...(snowy && { winterName: 'snowman', winterGlows: [] }) });
    }
    if (ch === 'S') addObj(hash(x, y, 7) < 0.5 ? 'stall0' : 'stall1', x, y, one, { glows: [toScreen(x + 0.86, y + 1, 13)] });
    if (ch === '@') start = { x: x + 0.5, y: y + 0.5 };
  }

  ground.sort((a, b) => a.d - b.d);

  // Клетки, где может появиться еда: проходимые, достижимые от старта (обход в ширину), не мосты
  const spawnTiles = [];
  const seen = new Set();
  const queue = [[Math.floor(start.x), Math.floor(start.y)]];
  while (queue.length) {
    const [x, y] = queue.shift();
    const key = `${x},${y}`;
    if (seen.has(key) || x < 0 || y < 0 || x >= W || y >= H || solid[y][x]) continue;
    seen.add(key);
    if (MAP[y][x] !== '#') spawnTiles.push({ x, y });
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return { W, H, solid, ground, objects, start, spawnTiles };
}
