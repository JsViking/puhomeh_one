// WGSL-шейдеры.

// Проход 1: все спрайты сцены одним инстансным draw-вызовом в low-res текстуру.
export const SPRITE_WGSL = /* wgsl */ `
struct Globals {
  camera: vec2f,   // левый верхний угол камеры в «мировых» экранных пикселях
  res: vec2f,      // размер low-res цели
  time: f32,
  night: f32,      // 0 = день, 1 = ночь
  pad: vec2f,
};
@group(0) @binding(0) var<uniform> g: Globals;
@group(0) @binding(1) var atlas: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

// Данные одного спрайта (per-instance вершинный буфер, 64 байта)
struct Inst {
  @location(0) rect: vec4f,  // xy — левый верх, zw — размер (px)
  @location(1) uv: vec4f,    // uv0.xy, uv1.zw в атласе
  @location(2) tint: vec4f,  // множитель цвета
  @location(3) fx: vec4f,    // x — вспышка в белый, y — «светится» (не темнеет ночью)
};

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) tint: vec4f,
  @location(2) fx: vec4f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, inst: Inst) -> VOut {
  // 4 вершины triangle-strip: (0,0) (1,0) (0,1) (1,1)
  let corner = vec2f(f32(vi & 1u), f32(vi >> 1u));
  let px = inst.rect.xy + corner * inst.rect.zw - g.camera;
  var o: VOut;
  o.pos = vec4f(px / g.res * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  o.uv = mix(inst.uv.xy, inst.uv.zw, corner);
  o.tint = inst.tint;
  o.fx = inst.fx;
  return o;
}

const NIGHT = vec3f(0.30, 0.34, 0.62);

@fragment
fn fsSprite(i: VOut) -> @location(0) vec4f {
  let c = textureSample(atlas, samp, i.uv) * i.tint;
  if (c.a < 0.01) { discard; }
  var rgb = mix(c.rgb, vec3f(1.0), i.fx.x);
  rgb *= mix(vec3f(1.0), NIGHT, g.night * (1.0 - i.fx.y));
  return vec4f(rgb, c.a);
}

// Свечение фонарей: аддитивное смешивание, видно только ночью
@fragment
fn fsGlow(i: VOut) -> @location(0) vec4f {
  let a = textureSample(atlas, samp, i.uv).a * i.tint.a * g.night;
  return vec4f(i.tint.rgb * a, a);
}
`;

// Проход 2: растягиваем low-res картинку на весь экран (nearest) + CRT-сканлайны и виньетка.
export const POST_WGSL = /* wgsl */ `
struct Post {
  lowRes: vec2f,
  canvas: vec2f,
  scale: f32,
  crt: f32,
  time: f32,
  pad: f32,
};
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> p: Post;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  // Один треугольник на весь экран
  let xy = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(xy * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let lp = fc.xy / p.scale;                 // координата в low-res пикселях
  var c = textureSample(src, samp, lp / p.lowRes).rgb;
  let scan = 1.0 - p.crt * 0.2 * smoothstep(0.45, 1.0, fract(lp.y)) * step(2.5, p.scale);
  let q = fc.xy / p.canvas - 0.5;
  let vig = 1.0 - p.crt * 0.7 * dot(q, q);
  return vec4f(c * scan * vig, 1.0);
}
`;
