// The room's surfaces grow the same on the GPU as in JS (light-waves §4:
// the same surface seed draws identical cells on every device). Compiles
// scene/light/surface.js's GLSL in a real browser's WebGL2 (and its WGSL in
// WebGPU, where the browser has it), grows blocks of cells of every kind on
// the GPU, reads them back and compares each cell with the JS reference: the
// crisp cells bit for bit, the averaged ones to float precision.
//   node frontend/e2e/grower.mjs              headless Chromium (software GL; no WebGPU adapter there)
//   node frontend/e2e/grower.mjs --webgpu     also the full Chromium on this machine's GPU, for WebGPU
import { chromium } from 'playwright';
import { growCell, growMean, seedMix, thingSeed, SURFACE_GLSL, SURFACE_WGSL, PLASTER, PLANKS, BOARD, BRASS, WAX, WICK, CLOTH, SKIN, DIRT, STONE, BARK, DEFAULT_SEEDS } from '../src/scene/light/surface.js';

const N = 128; // cells a side per block
const mixOf = (seed) => (typeof seed === 'number' ? seed : seedMix(seed)); // (a thing's seed is already mixed)
// Blocks: each kind at the origin, across a floor seam and a board's end, far out on a wall, and the things.
const BLOCKS = [
  { kind: PLASTER, seed: DEFAULT_SEEDS['wall-far'], ox: 0, oy: 0 },
  { kind: PLASTER, seed: [0xdeadbeef, 0x01234567], ox: 40000, oy: 30000 },
  { kind: PLANKS, seed: DEFAULT_SEEDS.floor, ox: 0, oy: 1480 },
  { kind: PLANKS, seed: DEFAULT_SEEDS.floor, ox: 9000, oy: 3000 },
  { kind: PLANKS, seed: [7, 9], ox: 41000, oy: 43000 },
  { kind: BOARD, seed: DEFAULT_SEEDS.table, ox: 0, oy: 3150 },
  { kind: BOARD, seed: [0xffffffff, 0], ox: 17000, oy: 9000 },
  // the things' matter (matter-fixes §3), each from its own seed
  { kind: BRASS, seed: thingSeed(seedMix(DEFAULT_SEEDS.table), 'holder-0'), ox: 0, oy: 0 },
  { kind: BRASS, seed: [3, 0x80000000], ox: 5000, oy: 64 },
  { kind: WAX, seed: thingSeed(seedMix(DEFAULT_SEEDS.table), 'candle-1'), ox: 100, oy: 3000 },
  { kind: WICK, seed: [11, 13], ox: 0, oy: 0 },
  { kind: CLOTH, seed: [0x0badf00d, 5], ox: 2000, oy: 700 },
  { kind: SKIN, seed: [21, 34], ox: 900, oy: 900 },
  // the outside's: the ground far out in the world, a stone, a limb's bark
  { kind: DIRT, seed: [0x5eed, 0x9e3779b9], ox: 400000, oy: 650000 },
  { kind: STONE, seed: [7, 0x80000001], ox: 300, oy: 1200 },
  { kind: BARK, seed: [0xabcdef, 42], ox: 5000, oy: 90000 },
];
// The averaged character: positions (cells, fractional) and footprints. Every
// position is a multiple of 1/16, exact in float32, so the GPU and JS read the
// same cell (a position a hair from a cell's edge would floor differently).
const MEANS = [1, 1.5, 3, 16, 256, 4096].flatMap((foot) => BLOCKS.map((b, i) => ({ ...b, foot, ox: b.ox + 0.375 + i, oy: b.oy + 0.625, stride: Math.round((foot / 3 + 0.71) * 16) / 16 })));

const expectCells = (b) => {
  const out = new Int32Array(N * N * 3);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = growCell(b.kind, b.seed, b.ox + x, b.oy + y);
    out.set([c.height, c.tone, c.grain], (y * N + x) * 3);
  }
  return out;
};
const MN = 32;
const MEAN_TOL = 0.25; // height and tone units (see report)
const expectMeans = (b) => {
  const out = new Float64Array(MN * MN * 2);
  for (let y = 0; y < MN; y++) for (let x = 0; x < MN; x++) {
    const c = growMean(b.kind, b.seed, b.ox + x * b.stride, b.oy + y * b.stride, b.foot);
    out.set([c.height, c.tone], (y * MN + x) * 2);
  }
  return out;
};

// --- WebGL2: render into an RGBA32UI target, one texel a cell ---
async function glsl(page) {
  return page.evaluate(({ src, blocks, means, N, MN }) => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return { error: 'no WebGL2' };
    const vs = '#version 300 es\nin vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
    const head = '#version 300 es\nprecision highp float;\nprecision highp int;\n';
    const cellFs = `${head}uniform uint seedMix; uniform int kind; uniform uvec2 origin; out uvec4 o;\n${src}\nvoid main() {\n  ivec3 c = growCell(kind, seedMix, origin + uvec2(gl_FragCoord.xy));\n  ivec2 f = cellFace(kind, seedMix, origin + uvec2(gl_FragCoord.xy));\n  o = uvec4(uint(c.x + 1024), uint(c.y), uint(c.z), uint(f.x + 1024) | (uint(f.y + 1024) << 16u));\n}`;
    const meanFs = `${head}uniform uint seedMix; uniform int kind; uniform vec2 origin; uniform float stride; uniform float foot; out uvec4 o;\n${src}\nvoid main() {\n  vec2 m = growMean(kind, seedMix, origin + floor(gl_FragCoord.xy) * stride, foot);\n  o = uvec4(floatBitsToUint(m.x), floatBitsToUint(m.y), 0u, 0u);\n}`;
    const prog = (fs) => {
      const p = gl.createProgram();
      for (const [type, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, s);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
        gl.attachShader(p, sh);
      }
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    };
    let cellProg, meanProg;
    try {
      cellProg = prog(cellFs);
      meanProg = prog(meanFs);
    } catch (err) {
      return { error: String(err.message) };
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const target = (n) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32UI, n, n);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, n, n);
      return { tex, fb };
    };
    const draw = (p, n, set) => {
      const t = target(n);
      gl.useProgram(p);
      const loc = gl.getAttribLocation(p, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      set((name) => gl.getUniformLocation(p, name));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const px = new Uint32Array(n * n * 4);
      gl.readPixels(0, 0, n, n, gl.RGBA_INTEGER, gl.UNSIGNED_INT, px);
      gl.deleteFramebuffer(t.fb);
      gl.deleteTexture(t.tex);
      return Array.from(px);
    };
    const cells = blocks.map((b) => draw(cellProg, N, (u) => {
      gl.uniform1ui(u('seedMix'), b.mix);
      gl.uniform1i(u('kind'), b.kind);
      gl.uniform2ui(u('origin'), b.ox, b.oy);
    }));
    const avg = means.map((b) => draw(meanProg, MN, (u) => {
      gl.uniform1ui(u('seedMix'), b.mix);
      gl.uniform1i(u('kind'), b.kind);
      gl.uniform2f(u('origin'), b.ox, b.oy);
      gl.uniform1f(u('stride'), b.stride);
      gl.uniform1f(u('foot'), b.foot);
    }));
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return { cells, avg, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  }, { src: SURFACE_GLSL, blocks: BLOCKS.map((b) => ({ ...b, mix: mixOf(b.seed) })), means: MEANS.map((b) => ({ ...b, mix: mixOf(b.seed) })), N, MN });
}

// --- WebGPU: a compute shader writes each cell into a storage buffer ---
async function wgsl(page) {
  return page.evaluate(async ({ src, blocks, means, N, MN }) => {
    if (!navigator.gpu) return { error: 'no navigator.gpu' };
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { error: 'no WebGPU adapter' };
    const device = await adapter.requestDevice();
    const code = `${src}
struct P { m: u32, kind: i32, ox: u32, oy: u32 }
@group(0) @binding(0) var<uniform> prm: P;
@group(0) @binding(1) var<storage, read_write> dst: array<u32>;
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= ${N}u || id.y >= ${N}u) { return; }
  let cell = vec2<u32>(prm.ox + id.x, prm.oy + id.y);
  let c = growCell(prm.kind, prm.m, cell);
  let f = cellFace(prm.kind, prm.m, cell);
  let k = (id.y * ${N}u + id.x) * 4u;
  dst[k] = u32(c.x + 1024); dst[k + 1u] = u32(c.y); dst[k + 2u] = u32(c.z);
  dst[k + 3u] = u32(f.x + 1024) | (u32(f.y + 1024) << 16u);
}
struct Q { m: u32, kind: i32, ox: f32, oy: f32, stride: f32, foot: f32, pad0: f32, pad1: f32 }
@group(0) @binding(0) var<uniform> q: Q;
@group(0) @binding(1) var<storage, read_write> avg: array<u32>;
@compute @workgroup_size(8, 8) fn means(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= ${MN}u || id.y >= ${MN}u) { return; }
  let v = growMean(q.kind, q.m, vec2<f32>(q.ox, q.oy) + vec2<f32>(f32(id.x), f32(id.y)) * q.stride, q.foot);
  let k = (id.y * ${MN}u + id.x) * 4u;
  avg[k] = bitcast<u32>(v.x); avg[k + 1u] = bitcast<u32>(v.y);
}`;
    const module = device.createShaderModule({ code });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === 'error');
    if (errors.length) return { error: errors.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join('\n') };
    const run = async (entryPoint, n, prmBytes) => {
      const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint } });
      const size = n * n * 4 * 4;
      const prm = device.createBuffer({ size: prmBytes.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(prm, 0, prmBytes);
      const dst = device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      const read = device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: prm } }, { binding: 1, resource: { buffer: dst } }] });
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(n / 8, n / 8);
      pass.end();
      enc.copyBufferToBuffer(dst, 0, read, 0, size);
      device.queue.submit([enc.finish()]);
      await read.mapAsync(GPUMapMode.READ);
      const got = Array.from(new Uint32Array(read.getMappedRange()));
      read.unmap();
      return got;
    };
    const cells = [];
    for (const b of blocks) {
      const dv = new DataView(new ArrayBuffer(16));
      dv.setUint32(0, b.mix, true);
      dv.setInt32(4, b.kind, true);
      dv.setUint32(8, b.ox, true);
      dv.setUint32(12, b.oy, true);
      cells.push(await run('main', N, dv.buffer));
    }
    const avg = [];
    for (const b of means) {
      const dv = new DataView(new ArrayBuffer(32));
      dv.setUint32(0, b.mix, true);
      dv.setInt32(4, b.kind, true);
      [b.ox, b.oy, b.stride, b.foot].forEach((v, i) => dv.setFloat32(8 + 4 * i, v, true));
      avg.push(await run('means', MN, dv.buffer));
    }
    const ai = adapter.info ?? {};
    return { cells, avg, renderer: `${ai.vendor ?? ''} ${ai.architecture ?? ''} ${ai.description ?? ''}`.trim() };
  }, { src: SURFACE_WGSL, blocks: BLOCKS.map((b) => ({ ...b, mix: mixOf(b.seed) })), means: MEANS.map((b) => ({ ...b, mix: mixOf(b.seed) })), N, MN });
}

// Cells from the GPU against the JS reference: [mismatches, first mismatch].
function compareCells(got, b) {
  const want = expectCells(b);
  let bad = 0, first = null;
  for (let i = 0; i < N * N; i++) {
    const [h, t, g, f] = got.slice(i * 4, i * 4 + 4);
    const face = [(f & 0xffff) - 1024, (f >>> 16) - 1024];
    const x = i % N, y = Math.floor(i / N);
    // WebGL's rows come bottom up from gl_FragCoord.y = row: the same (origin + fragcoord), no flip needed
    const k = i * 3;
    const wantFace = [growCell(b.kind, b.seed, b.ox + x + 1, b.oy + y).height - want[k], growCell(b.kind, b.seed, b.ox + x, b.oy + y + 1).height - want[k]];
    if (h - 1024 !== want[k] || t !== want[k + 1] || g !== want[k + 2] || face[0] !== wantFace[0] || face[1] !== wantFace[1]) {
      bad++;
      first ??= { x: b.ox + x, y: b.oy + y, gpu: [h - 1024, t, g, ...face], js: [want[k], want[k + 1], want[k + 2], ...wantFace] };
    }
  }
  return [bad, first];
}

function report(name, res) {
  if (res.error) {
    console.log(`${name}: unavailable or failed — ${res.error}`);
    return null;
  }
  let total = 0;
  BLOCKS.forEach((b, i) => {
    const [bad, first] = compareCells(res.cells[i], b);
    total += bad;
    if (bad) console.log(`  ${name} block ${i} (kind ${b.kind}): ${bad} cells differ, first ${JSON.stringify(first)}`);
  });
  console.log(`${name} (${res.renderer}): crisp cells ${total ? `${total} DIFFER` : `identical`} over ${BLOCKS.length} blocks × ${N * N} cells`);
  if (res.avg) {
    // Floats, not bits: the GPU's positions are float32, so far out on a wall
    // (40 000 cells) a position is good to 0.004 cells, and a box-filtered seam
    // edge moves the tone by about 70 a cell there: a few tenths of a tone unit
    // (of 255) is float precision, not a different surface.
    let worst = { d: 0 };
    const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
    MEANS.forEach((b, i) => {
      const want = expectMeans(b);
      for (let k = 0; k < MN * MN; k++) {
        for (let c = 0; c < 2; c++) {
          u32[0] = res.avg[i][k * 4 + c];
          const d = Math.abs(f32[0] - want[k * 2 + c]);
          if (d > worst.d) worst = { d, foot: b.foot, kind: b.kind, at: [b.ox + (k % MN) * b.stride, b.oy + Math.floor(k / MN) * b.stride].map((v) => +v.toFixed(2)), what: c ? 'tone' : 'height' };
        }
      }
    });
    console.log(`${name}: averaged cells within ${worst.d.toFixed(4)} units of JS over ${MEANS.length} blocks (worst: ${worst.what}, kind ${worst.kind}, foot ${worst.foot}, at ${worst.at})`);
    if (worst.d > MEAN_TOL) total++;
  }
  return total;
}

const webgpu = process.argv.includes('--webgpu');
let failed = 0;
const runs = [
  { name: 'headless', launch: { args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  ...(webgpu ? [{ name: 'full Chromium', launch: { channel: 'chromium', args: ['--enable-unsafe-webgpu'] } }] : []),
];
for (const run of runs) {
  const browser = await chromium.launch(run.launch);
  const page = await browser.newPage();
  // a secure context (WebGPU is only there): a localhost page, served from here
  await page.route('http://localhost/grower', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>grower</title>' }));
  await page.goto('http://localhost/grower');
  console.log(`— ${run.name}`);
  const g = report('WebGL2 GLSL', await glsl(page));
  if (g === null || g > 0) failed++;
  const w = report('WebGPU WGSL', await wgsl(page));
  if (w > 0) failed++;
  await browser.close();
}
process.exit(failed ? 1 : 0);
