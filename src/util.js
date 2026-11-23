// Общие мелочи для котика и собак.

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 4 изо-направления: 0:+x (вправо-вниз), 1:+y (влево-вниз), 2:-x (влево-вверх), 3:-y (вправо-вверх).
// При почти равных вариантах сохраняем прежнее — без дрожания спрайта.
export function pickDir(vx, vy, prev) {
  const dots = [vx, vy, -vx, -vy];
  let best = 0;
  for (let i = 1; i < 4; i++) if (dots[i] > dots[best]) best = i;
  return dots[prev] > dots[best] * 0.85 ? prev : best;
}

// Поиск пути в ширину по сетке тайлов (4 соседа). Возвращает центры клеток пути без стартовой.
export function findPath(level, fx, fy, tx, ty) {
  const { W, H, solid } = level;
  const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !solid[y][x];
  if (!ok(tx, ty) || !ok(fx, fy)) return [];
  const prev = new Int32Array(W * H).fill(-1);
  const start = fy * W + fx, goal = ty * W + tx;
  prev[start] = start;
  const queue = [start];
  for (let qi = 0; qi < queue.length && prev[goal] < 0; qi++) {
    const cur = queue[qi], x = cur % W, y = (cur / W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (!ok(nx, ny) || prev[ny * W + nx] >= 0) continue;
      prev[ny * W + nx] = cur;
      queue.push(ny * W + nx);
    }
  }
  if (prev[goal] < 0) return [];
  const path = [];
  for (let c = goal; c !== start; c = prev[c]) path.push({ x: (c % W) + 0.5, y: ((c / W) | 0) + 0.5 });
  return path.reverse();
}
