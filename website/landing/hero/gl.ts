import type { GpuField } from "./field.ts";
import { LOGICAL_H, LOGICAL_W } from "./constants.ts";
import { cam } from "./math.ts";

const VS = `#version 300 es
precision highp float;
in vec2 a_corner;
in vec3 i_pos;
in float i_cat;
in float i_rad;
uniform float u_time;
uniform vec2 u_scale;
uniform vec4 u_layout;
out vec4 v_pm;
out vec2 v_uv;

const float F = 900.0;
const vec3 BG = vec3(11.0 / 255.0);
const vec3 CAT0 = vec3(244.0, 114.0, 182.0) / 255.0;
const vec3 CAT1 = vec3(96.0, 165.0, 250.0) / 255.0;
const vec3 CAT2 = vec3(251.0, 191.0, 36.0) / 255.0;
const vec3 CAT3 = vec3(167.0, 139.0, 250.0) / 255.0;

vec3 catCol(float c) {
  int i = int(c + 0.5);
  if (i == 0) return CAT0;
  if (i == 1) return CAT1;
  if (i == 2) return CAT2;
  return CAT3;
}

void cam(float t, out vec3 c, out float roll) {
  const float T = 11.0;
  const float L = 10.0;
  float u = mod(t, T) / T;
  float z = mod(u * L, L);
  c = vec3(0.45 * sin(6.2831853 * u), 0.25 * sin(12.566371 * u), z);
  roll = 0.0125 * cos(6.2831853 * u);
}

void main() {
  v_uv = a_corner * 0.5 + 0.5;
  vec3 c;
  float roll;
  cam(u_time, c, roll);
  float cr = cos(roll);
  float sr = sin(roll);
  vec3 d = i_pos - c;
  float z = max(d.z, 0.02);
  float x = d.x * cr - d.y * sr;
  float y = d.x * sr + d.y * cr;
  float sx = float(${LOGICAL_W}) * 0.5 + F * x / z;
  float sy = float(${LOGICAL_H}) * 0.5 + F * y / z;
  float pr = F * i_rad / z;
  float rad = max(pr, 0.35);

  vec3 col = catCol(i_cat);
  float bright = 0.88;
  vec3 rgb = col * bright + BG * (1.0 - bright);
  rgb = clamp(rgb, 0.0, 1.0);
  float a = 1.0;

  v_pm = vec4(rgb * a, a);

  float lay = u_layout.x;
  float offX = u_layout.y;
  float offY = u_layout.z;
  float dpr = u_layout.w;
  vec2 center = vec2((sx * lay + offX) * dpr, (sy * lay + offY) * dpr);
  float R = rad * lay * dpr;
  vec2 pos = center + a_corner * R;
  vec2 clip = (pos / u_scale) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec4 v_pm;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec2 p = v_uv - 0.5;
  float d = length(p);
  if (d > 0.5) discard;
  float edge = smoothstep(0.5, 0.08, d);
  float a = v_pm.a * edge;
  vec3 rgb = v_pm.rgb * edge;
  outColor = vec4(rgb, a);
}`;

const CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

export type GlBundle = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  posBuf: WebGLBuffer;
  catBuf: WebGLBuffer;
  radBuf: WebGLBuffer;
  count: number;
  srcPos: Float32Array;
  srcCat: Float32Array;
  srcRad: Float32Array;
  order: Uint32Array;
  keys: Float32Array;
  sortPos: Float32Array;
  sortCat: Float32Array;
  sortRad: Float32Array;
  uTime: WebGLUniformLocation | null;
  uScale: WebGLUniformLocation | null;
  uLayout: WebGLUniformLocation | null;
};

export function camZAt(t: number): number {
  const u = (t % 11) / 11;
  return (u * 10) % 10;
}

/** Instances drawn each frame (static field; camera-only motion). */
export function visiblePointCount(bundle: GlBundle): number {
  return bundle.count;
}

export function createGl(canvas: HTMLCanvasElement, field: GpuField): GlBundle | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VS);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const program = link(gl, vs, fs);
  if (!program) return null;

  const cornerBuf = gl.createBuffer()!;
  const posBuf = gl.createBuffer()!;
  const catBuf = gl.createBuffer()!;
  const radBuf = gl.createBuffer()!;
  const vao = gl.createVertexArray()!;

  const srcCat = new Float32Array(field.count);
  for (let i = 0; i < field.count; i++) srcCat[i] = field.cat[i];

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER, CORNERS, gl.STATIC_DRAW);
  const cornerLoc = gl.getAttribLocation(program, "a_corner");
  gl.enableVertexAttribArray(cornerLoc);
  gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(cornerLoc, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, field.pos.byteLength, gl.DYNAMIC_DRAW);
  const posLoc = gl.getAttribLocation(program, "i_pos");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 12, 0);
  gl.vertexAttribDivisor(posLoc, 1);

  gl.bindBuffer(gl.ARRAY_BUFFER, catBuf);
  gl.bufferData(gl.ARRAY_BUFFER, srcCat.byteLength, gl.DYNAMIC_DRAW);
  const catLoc = gl.getAttribLocation(program, "i_cat");
  gl.enableVertexAttribArray(catLoc);
  gl.vertexAttribPointer(catLoc, 1, gl.FLOAT, false, 4, 0);
  gl.vertexAttribDivisor(catLoc, 1);

  gl.bindBuffer(gl.ARRAY_BUFFER, radBuf);
  gl.bufferData(gl.ARRAY_BUFFER, field.rad.byteLength, gl.DYNAMIC_DRAW);
  const radLoc = gl.getAttribLocation(program, "i_rad");
  gl.enableVertexAttribArray(radLoc);
  gl.vertexAttribPointer(radLoc, 1, gl.FLOAT, false, 4, 0);
  gl.vertexAttribDivisor(radLoc, 1);

  gl.bindVertexArray(null);
  gl.enable(gl.BLEND);

  const order = new Uint32Array(field.count);
  for (let i = 0; i < field.count; i++) order[i] = i;

  return {
    gl,
    program,
    vao,
    posBuf,
    catBuf,
    radBuf,
    count: field.count,
    srcPos: field.pos,
    srcCat,
    srcRad: field.rad,
    order,
    keys: new Float32Array(field.count),
    sortPos: new Float32Array(field.pos.length),
    sortCat: new Float32Array(field.count),
    sortRad: new Float32Array(field.count),
    uTime: gl.getUniformLocation(program, "u_time"),
    uScale: gl.getUniformLocation(program, "u_scale"),
    uLayout: gl.getUniformLocation(program, "u_layout"),
  };
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

function sortInstances(bundle: GlBundle, t: number): void {
  const { srcPos, order, keys, count } = bundle;
  const { c } = cam(t);
  const cz = c[2];
  for (let i = 0; i < count; i++) {
    keys[i] = srcPos[i * 3 + 2]! - cz;
  }
  order.sort((a, b) => keys[b]! - keys[a]!);
  const { sortPos, sortCat, sortRad, srcCat, srcRad } = bundle;
  for (let k = 0; k < count; k++) {
    const j = order[k]!;
    const p = k * 3;
    const q = j * 3;
    sortPos[p] = srcPos[q]!;
    sortPos[p + 1] = srcPos[q + 1]!;
    sortPos[p + 2] = srcPos[q + 2]!;
    sortCat[k] = srcCat[j]!;
    sortRad[k] = srcRad[j]!;
  }
}

export function drawFrame(
  bundle: GlBundle,
  t: number,
  width: number,
  height: number,
  layout: { scale: number; offX: number; offY: number; dpr: number },
): void {
  const { gl, program, vao, posBuf, catBuf, radBuf, count, uTime, uScale, uLayout } = bundle;

  sortInstances(bundle, t);

  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, bundle.sortPos);
  gl.bindBuffer(gl.ARRAY_BUFFER, catBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, bundle.sortCat);
  gl.bindBuffer(gl.ARRAY_BUFFER, radBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, bundle.sortRad);

  gl.viewport(0, 0, width, height);
  gl.clearColor(11 / 255, 11 / 255, 11 / 255, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.bindVertexArray(vao);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  if (uTime) gl.uniform1f(uTime, t);
  if (uScale) gl.uniform2f(uScale, width, height);
  if (uLayout) gl.uniform4f(uLayout, layout.scale, layout.offX, layout.offY, layout.dpr);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
  gl.bindVertexArray(null);
}
