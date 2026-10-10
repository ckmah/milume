import type { DrawPoint } from "./types.ts";

const VS = `#version 300 es
in vec2 a_pos;
in float a_size;
in vec4 a_color;
uniform vec2 u_scale;
out vec4 v_color;
void main() {
  vec2 clip = (a_pos / u_scale) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}`;

const FS = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  if (d > 0.5) discard;
  float edge = smoothstep(0.5, 0.22, d);
  outColor = vec4(v_color.rgb, v_color.a * edge);
}`;

const VS1 = `
attribute vec2 a_pos;
attribute float a_size;
attribute vec4 a_color;
uniform vec2 u_scale;
varying vec4 v_color;
void main() {
  vec2 clip = (a_pos / u_scale) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}`;

const FS1 = `
precision mediump float;
varying vec4 v_color;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  if (d > 0.5) discard;
  float edge = smoothstep(0.5, 0.22, d);
  gl_FragColor = vec4(v_color.rgb, v_color.a * edge);
}`;

export type GlBundle = {
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  program: WebGLProgram;
  buf: WebGLBuffer;
  uScale: WebGLUniformLocation | null;
  maxPoint: number;
  isWebGL2: boolean;
};

export function createGl(canvas: HTMLCanvasElement): GlBundle | null {
  const gl2 = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  });
  const gl1 =
    gl2 ??
    canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
    });
  if (!gl1) return null;

  const isWebGL2 = gl1 instanceof WebGL2RenderingContext;
  const vs = compile(gl1, gl1.VERTEX_SHADER, isWebGL2 ? VS : VS1);
  const fs = compile(gl1, gl1.FRAGMENT_SHADER, isWebGL2 ? FS : FS1);
  if (!vs || !fs) return null;
  const program = link(gl1, vs, fs);
  if (!program) return null;

  const buf = gl1.createBuffer();
  if (!buf) return null;

  gl1.useProgram(program);
  const aPos = gl1.getAttribLocation(program, "a_pos");
  const aSize = gl1.getAttribLocation(program, "a_size");
  const aColor = gl1.getAttribLocation(program, "a_color");
  gl1.bindBuffer(gl1.ARRAY_BUFFER, buf);
  const stride = 7 * 4;
  gl1.enableVertexAttribArray(aPos);
  gl1.vertexAttribPointer(aPos, 2, gl1.FLOAT, false, stride, 0);
  gl1.enableVertexAttribArray(aSize);
  gl1.vertexAttribPointer(aSize, 1, gl1.FLOAT, false, stride, 8);
  gl1.enableVertexAttribArray(aColor);
  gl1.vertexAttribPointer(aColor, 4, gl1.FLOAT, false, stride, 12);

  const range = gl1.getParameter(gl1.ALIASED_POINT_SIZE_RANGE) as Float32Array;
  const maxPoint = range ? range[1] : 64;

  gl1.enable(gl1.BLEND);
  gl1.blendFunc(gl1.SRC_ALPHA, gl1.ONE_MINUS_SRC_ALPHA);

  return {
    gl: gl1,
    program,
    buf,
    uScale: gl1.getUniformLocation(program, "u_scale"),
    maxPoint,
    isWebGL2,
  };
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

const pack = new Float32Array(20_000 * 7);

function writePoint(
  o: number,
  sx: number,
  sy: number,
  size: number,
  cr: number,
  cg: number,
  cb: number,
  a: number,
): number {
  pack[o++] = sx;
  pack[o++] = sy;
  pack[o++] = size;
  pack[o++] = cr;
  pack[o++] = cg;
  pack[o++] = cb;
  pack[o++] = a;
  return o;
}

export function drawPoints(
  bundle: GlBundle,
  points: DrawPoint[],
  width: number,
  height: number,
  dpr: number,
  layout: { scale: number; offX: number; offY: number },
): void {
  const { gl, program, buf, uScale, maxPoint } = bundle;
  let o = 0;
  let count = 0;
  for (const p of points) {
    if (count >= 20_000) break;
    const size = Math.min(maxPoint, Math.max(1, p.rad * 2 * dpr * layout.scale));
    const a = p.alpha * Math.min(1, (p.rad0 / Math.max(1, p.rad)) ** 2);
    const px = (p.sx * layout.scale + layout.offX) * dpr;
    const py = (p.sy * layout.scale + layout.offY) * dpr;
    o = writePoint(o, px, py, size, p.cr / 255, p.cg / 255, p.cb / 255, a);
    count++;
  }

  gl.viewport(0, 0, width, height);
  gl.clearColor(11 / 255, 11 / 255, 11 / 255, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  if (uScale) gl.uniform2f(uScale, width, height);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, pack.subarray(0, o), gl.DYNAMIC_DRAW);
  gl.drawArrays(gl.POINTS, 0, count);

  let halo = 0;
  let ho = o;
  for (const p of points) {
    if (p.glow < 0.2) continue;
    if (halo >= 4000) break;
    const size = Math.min(maxPoint, Math.max(1, p.rad0 * 3.6 * dpr * layout.scale));
    const k = p.glow * p.alpha * 0.25;
    const px = (p.sx * layout.scale + layout.offX) * dpr;
    const py = (p.sy * layout.scale + layout.offY) * dpr;
    ho = writePoint(
      ho,
      px,
      py,
      size,
      (45 / 255) * k,
      (212 / 255) * k,
      (191 / 255) * k,
      k,
    );
    halo++;
  }
  if (halo > 0) {
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.bufferData(gl.ARRAY_BUFFER, pack.subarray(o, ho), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.POINTS, 0, halo);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
}
