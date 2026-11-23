// Изометрическая проекция 2:1. Тайл — ромб 32×16 пикселей.
export const TILE_W = 32;
export const TILE_H = 16;

// Мир (x, y — в тайлах, z — высота в пикселях) -> «мировые» экранные пиксели (без камеры)
export function toScreen(x, y, z = 0) {
  return [(x - y) * (TILE_W / 2), (x + y) * (TILE_H / 2) - z];
}

// Экранная скорость (пиксели) -> мировая (тайлы). Обратное преобразование к toScreen.
export function screenToWorldVec(sx, sy) {
  return [sx / TILE_W + sy / TILE_H, sy / TILE_H - sx / TILE_W];
}
