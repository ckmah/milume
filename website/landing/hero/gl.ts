import type { DrawPoint } from "./types.ts";

const CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

const VS_INST = `#version 300 es
in vec2 a_corner;
in vec2 i_center;
in float i_radius;
in vec4 i_color;
in float i_soft;
uniform vec2 u_scale;
out vec4 v_color;
out float v_soft;
out vec2 v_uv;
void main() {
  v_uv = a_corner * 0.5 + 0.5;
  vec2 pos = i_center + a_corner * i_radius;
  vec2 clip = (pos / u_scale) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = i_color;
  v_soft = i_soft;
}`;

const FS_INST = `#version 300 es
precision mediump float;
in vec4 v_color;
in float v_soft;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec2 p = v_uv - 0.5;
  float d = length(p);
  if (d > 0.5) discard;
  float inner = 0.5 - v_soft;
  float edge = smoothstep(0.5, max(0.06, inner), d);
  outColor = vec4(v_color.rgb, v_color.a * edge);
}`;

const VS1 = `
attribute vec2 a_corner;
attribute vec2 a_center;
attribute float a_radius;
attribute vec4 a_color;
attribute float a_soft;
uniform vec2 u_scale;
varying vec4 v_color;
varying float v_soft;
varying vec2 v_uv;
void main() {
  v_uv = a_corner * 0.5 + 0.5;
  vec2 pos = a_center + a_corner * a_radius;
  vec2 clip = (pos / u_scale) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = a_color;
  v_soft = a_soft;
}`;

const FS1 = `
precision mediump float;
varying vec4 v_color;
varying float v_soft;
varying vec2 v_uv;
void main() {
  vec2 p = v_uv - 0.5;
  float d = length(p);
  if (d > 0.5) discard;
  float inner = 0.5 - v_soft;
  float edge = smoothstep(0.5, max(0.06, inner), d);
  gl_FragColor = vec4(v_color.rgb, v_color.a * edge);
}`;

export type GlBundle = {
  gl: WebGL2RenderingContext | WebGLRenderingContext;
  program: WebGLProgram;
  cornerBuf: WebGLBuffer;
  instanceBuf: WebGLBuffer;
  uScale: WebGLUniformLocation | null;
  instanced: boolean;
  vao: WebGLVertexArrayObject | null;
};

export function createGl(canvas: HTMLCanvasElement): GlBundle | null {
  const gl2 = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  });
  if (gl2) {
    return createInstanced(gl2);
  }
  const gl1 = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  });
  if (!gl1) return null;
  return createExpanded(gl1);
}

function createInstanced(gl: WebGL2RenderingContext): GlBundle | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VS_INST);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FS_INST);
  if (!vs || !fs) return null;
  const program = link(gl, vs, fs);
  if (!program) return null;

  const cornerBuf = gl.createBuffer();
  const instanceBuf = gl.createBuffer();
  if (!cornerBuf || !instanceBuf) return null;

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER, CORNERS, gl.STATIC_DRAW);
  const cornerLoc = gl.getAttribLocation(program, "a_corner");
  gl.enableVertexAttribArray(cornerLoc);
  gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(cornerLoc, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
  const stride = 8 * 4;
  const bindInst = (name: string, size: number, offset: number) => {
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(loc, 1);
  };
  bindInst("i_center", 2, 0);
  bindInst("i_radius", 1, 8);
  bindInst("i_color", 4, 12);
  bindInst("i_soft", 1, 28);

  gl.bindVertexArray(null);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  return { gl, program, cornerBuf, instanceBuf, uScale: gl.getUniformLocation(program, "u_scale"), instanced: true, vao };
}

function createExpanded(gl: WebGLRenderingContext): GlBundle | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VS1);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FS1);
  if (!vs || !fs) return null;
  const program = link(gl, vs, fs);
  if (!program) return null;
  const cornerBuf = gl.createBuffer();
  const instanceBuf = gl.createBuffer();
  if (!cornerBuf || !instanceBuf) return null;
  gl.useProgram(program);
  const stride = 10 * 4;
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
  const bind = (name: string, size: number, offset: number) => {
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  };
  bind("a_corner", 2, 0);
  bind("a_center", 2, 8);
  bind("a_radius", 1, 16);
  bind("a_color", 4, 20);
  bind("a_soft", 1, 36);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  return { gl, program, cornerBuf, instanceBuf, uScale: gl.getUniformLocation(program, "u_scale"), instanced: false, vao: null };
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

const instances = new Float32Array(12_000 * 8);
const expanded = new Float32Array(12_000 * 6 * 10);

export function drawPoints(
  bundle: GlBundle,
  points: DrawPoint[],
  width: number,
  height: number,
  dpr: number,
  layout: { scale: number; offX: number; offY: number },
): void {
  const { gl, program, instanceBuf, uScale, instanced, vao } = bundle;
  let n = 0;
  const maxN = instanced ? 14_000 : 4_000;

  let toDraw = points;
  if (points.length > maxN) {
    toDraw = [...points]
      .sort((a, b) => b.rad * b.alpha - a.rad * a.alpha)
      .slice(0, maxN)
      .sort((a, b) => b.z - a.z);
  }

  for (const p of toDraw) {
    const radius = p.rad * dpr * layout.scale;
    if (radius < 0.35) continue;
    const px = (p.sx * layout.scale + layout.offX) * dpr;
    const py = (p.sy * layout.scale + layout.offY) * dpr;
    const soft = Math.min(0.42, 0.08 + (p.coc / 40) * 0.34);
    const a = Math.min(1, p.alpha * p.coverage * 1.18);
    if (a < 0.004) continue;
    const o = n * 8;
    instances[o] = px;
    instances[o + 1] = py;
    instances[o + 2] = radius;
    instances[o + 3] = p.cr / 255;
    instances[o + 4] = p.cg / 255;
    instances[o + 5] = p.cb / 255;
    instances[o + 6] = a;
    instances[o + 7] = soft;
    n++;
  }

  gl.viewport(0, 0, width, height);
  gl.clearColor(11 / 255, 11 / 255, 11 / 255, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  if (uScale) gl.uniform2f(uScale, width, height);

  if (instanced && gl instanceof WebGL2RenderingContext) {
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, instances.subarray(0, n * 8), gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    gl.bindVertexArray(null);
  } else {
    let o = 0;
    for (let i = 0; i < n; i++) {
      const base = i * 8;
      const px = instances[base];
      const py = instances[base + 1];
      const radius = instances[base + 2];
      const cr = instances[base + 3];
      const cg = instances[base + 4];
      const cb = instances[base + 5];
      const a = instances[base + 6];
      const soft = instances[base + 7];
      for (let v = 0; v < 6; v++) {
        const e = o * 10;
        expanded[e] = CORNERS[v * 2];
        expanded[e + 1] = CORNERS[v * 2 + 1];
        expanded[e + 2] = px;
        expanded[e + 3] = py;
        expanded[e + 4] = radius;
        expanded[e + 5] = cr;
        expanded[e + 6] = cg;
        expanded[e + 7] = cb;
        expanded[e + 8] = a;
        expanded[e + 9] = soft;
        o++;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, expanded.subarray(0, o * 10), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, o);
  }

  let halo = 0;
  for (const p of toDraw) {
    if (p.glow < 0.18) continue;
    if (halo + n >= maxN) break;
    const radius = p.rad0 * 2.2 * dpr * layout.scale;
    const px = (p.sx * layout.scale + layout.offX) * dpr;
    const py = (p.sy * layout.scale + layout.offY) * dpr;
    const k = p.glow * p.alpha * 0.32;
    const idx = (n + halo) * 8;
    instances[idx] = px;
    instances[idx + 1] = py;
    instances[idx + 2] = radius;
    instances[idx + 3] = (45 / 255) * k;
    instances[idx + 4] = (212 / 255) * k;
    instances[idx + 5] = (191 / 255) * k;
    instances[idx + 6] = k * 0.85;
    instances[idx + 7] = 0.35;
    halo++;
  }
  if (halo > 0 && instanced && gl instanceof WebGL2RenderingContext) {
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, instances.subarray(n * 8, (n + halo) * 8), gl.DYNAMIC_DRAW);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, halo);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(null);
  }
}
