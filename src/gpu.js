// Всё, что касается WebGPU: устройство, пайплайны, буферы, текстуры, кадр.
import { SPRITE_WGSL, POST_WGSL } from './shaders.wgsl.js';

const LOW_FORMAT = 'rgba8unorm';
export const FLOATS_PER_INSTANCE = 16; // 64 байта

export async function initGPU(canvas) {
  if (!navigator.gpu) throw new Error('navigator.gpu отсутствует — браузер без WebGPU');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('Не удалось получить GPUAdapter');
  const device = await adapter.requestDevice();
  device.addEventListener('uncapturederror', (e) => console.error('[WebGPU]', e.error.message));
  device.lost.then((info) => console.error('[WebGPU] device lost:', info.message));
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  return { device, context, format, adapter };
}

export class Renderer {
  constructor({ device, context, format }, atlas, maxInstances = 8192) {
    this.device = device;
    this.context = context;
    this.maxInstances = maxInstances;
    const U = GPUBufferUsage, T = GPUTextureUsage, S = GPUShaderStage;

    // Атлас: сырые RGBA-байты напрямую в текстуру
    this.atlasTex = device.createTexture({ size: [atlas.width, atlas.height], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST });
    device.queue.writeTexture({ texture: this.atlasTex }, atlas.data, { bytesPerRow: atlas.width * 4 }, [atlas.width, atlas.height]);
    this.nearest = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });

    this.globalsBuf = device.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
    this.postBuf = device.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
    this.instBuf = device.createBuffer({ size: maxInstances * FLOATS_PER_INSTANCE * 4, usage: U.VERTEX | U.COPY_DST });

    // Общий layout для двух пайплайнов спрайтов (обычный и аддитивный)
    const bgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: S.VERTEX | S.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: S.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: S.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
    const module = device.createShaderModule({ label: 'sprites', code: SPRITE_WGSL });
    module.getCompilationInfo?.().then((info) => info.messages.forEach((m) => console[m.type === 'error' ? 'error' : 'warn']('[WGSL sprites]', m.lineNum, m.message)));
    const vertex = {
      module, entryPoint: 'vs',
      buffers: [{
        arrayStride: FLOATS_PER_INSTANCE * 4, stepMode: 'instance',
        attributes: [0, 1, 2, 3].map((i) => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })),
      }],
    };
    const primitive = { topology: 'triangle-strip' };
    this.spritePipe = device.createRenderPipeline({
      label: 'sprite', layout, vertex, primitive,
      fragment: {
        module, entryPoint: 'fsSprite',
        targets: [{ format: LOW_FORMAT, blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        } }],
      },
    });
    this.glowPipe = device.createRenderPipeline({
      label: 'glow', layout, vertex, primitive,
      fragment: {
        module, entryPoint: 'fsGlow',
        targets: [{ format: LOW_FORMAT, blend: {
          color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
        } }],
      },
    });
    this.bind = device.createBindGroup({
      layout: bgl,
      entries: [
        { binding: 0, resource: { buffer: this.globalsBuf } },
        { binding: 1, resource: this.atlasTex.createView() },
        { binding: 2, resource: this.nearest },
      ],
    });

    const post = device.createShaderModule({ label: 'post', code: POST_WGSL });
    this.postPipe = device.createRenderPipeline({
      label: 'post', layout: 'auto',
      vertex: { module: post, entryPoint: 'vs' },
      fragment: { module: post, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.lowW = this.lowH = 0;
  }

  // Low-res цель подбирается так, чтобы масштаб до экрана был целым — пиксели остаются чёткими.
  // Ориентир: ~225 «игровых» пикселей по высоте и не меньше ~200 по ширине (важно для телефона в портрете).
  resize(cw, ch) {
    const scale = Math.max(1, Math.round(Math.min(ch / 225, cw / 200)));
    const lw = Math.ceil(cw / scale), lh = Math.ceil(ch / scale);
    this.cw = cw; this.ch = ch; this.scale = scale;
    if (lw === this.lowW && lh === this.lowH) return;
    this.lowW = lw; this.lowH = lh;
    this.low?.destroy();
    this.low = this.device.createTexture({ size: [lw, lh], format: LOW_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.lowView = this.low.createView();
    this.postBind = this.device.createBindGroup({
      layout: this.postPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.lowView },
        { binding: 1, resource: this.nearest },
        { binding: 2, resource: { buffer: this.postBuf } },
      ],
    });
  }

  render(inst, nSprites, nGlow, { camX, camY, time, night, crt }) {
    const q = this.device.queue;
    q.writeBuffer(this.globalsBuf, 0, new Float32Array([camX, camY, this.lowW, this.lowH, time, night, 0, 0]));
    q.writeBuffer(this.postBuf, 0, new Float32Array([this.lowW, this.lowH, this.cw, this.ch, this.scale, crt, time, 0]));
    const total = nSprites + nGlow;
    if (total) q.writeBuffer(this.instBuf, 0, inst.buffer, 0, total * FLOATS_PER_INSTANCE * 4);

    const enc = this.device.createCommandEncoder();
    const k = 1 - night * 0.6;
    const scene = enc.beginRenderPass({
      colorAttachments: [{ view: this.lowView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0.12 * k, g: 0.16 * k, b: 0.27 * k + 0.03, a: 1 } }],
    });
    scene.setBindGroup(0, this.bind);
    scene.setVertexBuffer(0, this.instBuf);
    if (nSprites) { scene.setPipeline(this.spritePipe); scene.draw(4, nSprites, 0, 0); }
    if (nGlow) { scene.setPipeline(this.glowPipe); scene.draw(4, nGlow, 0, nSprites); }
    scene.end();

    const out = enc.beginRenderPass({
      colorAttachments: [{ view: this.context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    out.setPipeline(this.postPipe);
    out.setBindGroup(0, this.postBind);
    out.draw(3);
    out.end();
    q.submit([enc.finish()]);
  }
}
