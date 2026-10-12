import type { HeroPoint } from "./camera.ts";
import {
  buildInstances,
  createInstanceScratch,
  type InstanceScratch,
} from "./camera.ts";
import { LOGICAL_H, LOGICAL_W } from "./constants.ts";
import { glVec3, heroPaletteForGl, HERO_PALETTE } from "./palette.ts";

const PAL = heroPaletteForGl(HERO_PALETTE);
const BG_GLSL = glVec3(PAL.background);

const VS = `#version 300 es
precision highp float;
in vec2 a_corner;
in vec3 i_color;
in vec4 i_params;
uniform vec2 u_scale;
uniform vec4 u_layout;
out vec2 v_uv;
out vec3 v_col;
out float v_a;
out float v_soft;

void main() {
  v_uv = a_corner;
  v_col = i_color;
  v_a = i_params.w;
  float rad = i_params.z + 1.0;
  v_soft = clamp(1.0 / rad + (i_params.z > 3.0 ? 0.55 : 0.0), 0.0, 1.0);

  float lay = u_layout.x;
  float offX = u_layout.y;
  float offY = u_layout.z;
  float dpr = u_layout.w;
  vec2 center = vec2((i_params.x * lay + offX) * dpr, (i_params.y * lay + offY) * dpr);
  float R = rad * lay * dpr;
  vec2 pos = center + a_corner * R;
  vec2 clip = (pos / u_scale) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec3 v_col;
in float v_a;
in float v_soft;
out vec4 outColor;
void main() {
  float d = length(v_uv);
  float edge = smoothstep(1.0, 1.0 - max(v_soft, 0.08), d);
  float m = edge * v_a;
  outColor = vec4(v_col * m, m);
}`;

const CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

export type GlBundle = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  cornerBuf: WebGLBuffer;
  instanceBuf: WebGLBuffer;
  points: HeroPoint[];
  scratch: InstanceScratch;
  uScale: WebGLUniformLocation | null;
  uLayout: WebGLUniformLocation | null;
  clearRgb: [number, number, number];
  lastInstanceCount: number;
};

export function visiblePointCount(bundle: GlBundle): number {
  return bundle.points.length;
}

export function lastDrawInstanceCount(bundle: GlBundle): number {
  return bundle.lastInstanceCount;
}

export function createGl(canvas: HTMLCanvasElement, points: HeroPoint[]): GlBundle | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: true,
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VS);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const program = link(gl, vs, fs);
  if (!program) return null;

  const cornerBuf = gl.createBuffer()!;
  const instanceBuf = gl.createBuffer()!;
  const vao = gl.createVertexArray()!;
  const stride = 7 * 4;

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER, CORNERS, gl.STATIC_DRAW);
  const cornerLoc = gl.getAttribLocation(program, "a_corner");
  gl.enableVertexAttribArray(cornerLoc);
  gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(cornerLoc, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
  gl.bufferData(gl.ARRAY_BUFFER, 4, gl.DYNAMIC_DRAW);

  const colorLoc = gl.getAttribLocation(program, "i_color");
  gl.enableVertexAttribArray(colorLoc);
  gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, stride, 0);
  gl.vertexAttribDivisor(colorLoc, 1);

  const paramsLoc = gl.getAttribLocation(program, "i_params");
  gl.enableVertexAttribArray(paramsLoc);
  gl.vertexAttribPointer(paramsLoc, 4, gl.FLOAT, false, stride, 12);
  gl.vertexAttribDivisor(paramsLoc, 1);

  gl.bindVertexArray(null);
  gl.enable(gl.BLEND);

  return {
    gl,
    program,
    vao,
    cornerBuf,
    instanceBuf,
    points,
    scratch: createInstanceScratch(),
    uScale: gl.getUniformLocation(program, "u_scale"),
    uLayout: gl.getUniformLocation(program, "u_layout"),
    clearRgb: PAL.background,
    lastInstanceCount: 0,
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

export function drawFrame(
  bundle: GlBundle,
  t: number,
  width: number,
  height: number,
  layout: { scale: number; offX: number; offY: number; dpr: number },
): void {
  const { gl, program, vao, instanceBuf, points, scratch, uScale, uLayout, clearRgb } = bundle;

  const count = buildInstances(points, t, scratch);
  bundle.lastInstanceCount = count;

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    scratch.packed.subarray(0, count * 7),
    gl.DYNAMIC_DRAW,
  );

  gl.viewport(0, 0, width, height);
  gl.clearColor(clearRgb[0], clearRgb[1], clearRgb[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.bindVertexArray(vao);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  if (uScale) gl.uniform2f(uScale, width, height);
  if (uLayout) gl.uniform4f(uLayout, layout.scale, layout.offX, layout.offY, layout.dpr);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  gl.bindVertexArray(null);
}
