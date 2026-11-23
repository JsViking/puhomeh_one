// Плавающий виртуальный джойстик для телефона: коснулся в любом месте — там появился джойстик,
// тянешь палец — котик бежит в эту сторону. Работает только для касаний (мышь не трогает).
const RADIUS = 52;    // px, насколько далеко ходит «шляпка»
const DEADZONE = 10;  // px, мелкие движения пальца игнорируем

export function createJoystick({ onStart } = {}) {
  const base = document.createElement('div');
  base.className = 'joy-base hidden';
  const knob = document.createElement('div');
  knob.className = 'joy-knob';
  base.append(knob);
  document.body.append(base);

  let id = null, ox = 0, oy = 0;
  const vec = { x: 0, y: 0 };

  const reset = () => {
    id = null;
    vec.x = vec.y = 0;
    base.classList.add('hidden');
  };

  addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || id !== null) return;
    // Кнопки, поле ввода и открытые окна (титул, победа) джойстик не перехватывает
    if (e.target.closest('button, input, .overlay:not(.hidden), .toolbar')) return;
    id = e.pointerId;
    ox = e.clientX; oy = e.clientY;
    base.style.left = `${ox}px`;
    base.style.top = `${oy}px`;
    knob.style.transform = 'translate(-50%, -50%)';
    base.classList.remove('hidden');
    onStart?.();
    e.preventDefault();
  }, { passive: false });

  addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) { dx = (dx / len) * RADIUS; dy = (dy / len) * RADIUS; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    if (len < DEADZONE) { vec.x = vec.y = 0; return; }
    vec.x = dx / Math.hypot(dx, dy);
    vec.y = dy / Math.hypot(dx, dy);
  });

  const end = (e) => { if (e.pointerId === id) reset(); };
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
  addEventListener('blur', reset);

  return { vec, get active() { return id !== null; } };
}
