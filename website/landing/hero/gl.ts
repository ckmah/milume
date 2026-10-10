import type { GpuField } from "./field.ts";
import { LOGICAL_H, LOGICAL_W } from "./constants.ts";

const VS = `#version 300 es
precision highp float;
in vec2 a_corner;
in vec3 i_pos;
in float i_cat;
in float i_rad;
uniform float u_time;
uniform vec2 u_scale;
uniform vec4 u_layout; // scale, offX, offY, dpr
uniform vec2 u_zClip; // min, max depth (camera-relative)
out vec4 v_pm;
out float v_soft;
out vec2 v_uv;

const float T = 11.0;
const float L = 10.0;
const float F = 900.0;
const vec3 BG = vec3(0.043137, 0.043137, 0.043137);
const vec3 TEAL = vec3(0.176471, 0.831373, 0.749020);
const vec3 CAT0 = vec3(0.956863, 0.447059, 0.713725);
const vec3 CAT1 = vec3(0.376471, 0.647059, 0.980392);
const vec3 CAT2 = vec3(0.984314, 0.749020, 0.141176);
const vec3 CAT3 = vec3(0.654902, 0.545098, 0.980392);
const vec3 SEL = vec3(0.6, -0.3, 13.0);
const float ZN0 = 0.5;
const float ZN1 = 3.0;
const float ZF0 = 22.0;
const float ZF1 = 30.0;

float ss(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

vec3 catCol(float c) {
  int i = int(c + 0.5);
  if (i == 0) return CAT0;
  if (i == 1) return CAT1;
  if (i == 2) return CAT2;
  return CAT3;
}

void cam(float t, out vec3 c, out float roll) {
  float u = fract(t / T);
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
  float z = d.z;
  if (z < u_zClip.x || z >= u_zClip.y || z <= ZN0 || z >= ZF1) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_pm = vec4(0.0);
    v_soft = 0.0;
    return;
  }
  float x = d.x * cr - d.y * sr;
  float y = d.x * sr + d.y * cr;
  float sx = float(${LOGICAL_W}) * 0.5 + F * x / z;
  float sy = float(${LOGICAL_H}) * 0.5 + F * y / z;
  float pr = F * i_rad / z;

  float glow = 0.0;
  vec3 col = catCol(i_cat);
  float pulseA = 0.0;
  float pulseS = 0.0;
  if (u_time >= 0.6 && u_time <= 9.6) {
    pulseS = u_time - 0.6;
    pulseA = ss(0.0, 1.0, pulseS) * (1.0 - ss(6.0, 9.0, pulseS));
    float ds = length(i_pos - SEL);
    float core = 0.85 * exp(-pow(ds / 3.0, 2.0)) * ss(0.0, 1.0, pulseS);
    float ring = exp(-pow((ds - 2.5 - pulseS * 1.4) / 2.0, 2.0)) * ss(0.3, 1.3, pulseS);
    glow = clamp(core + 0.4 * ring, 0.0, 1.0) * pulseA;
    float passed = clamp((2.5 + pulseS * 1.4 - ds) / 2.0, 0.0, 1.0) * pulseA;
    col = mix(col, TEAL, 0.08 * passed);
    col = mix(col, TEAL, glow);
  }

  float zf = 11.0;
  if (pulseA > 0.0) {
    zf = 11.0 + pulseA * ((SEL.z - c.z) - 11.0);
  }
  float fog = pow(clamp(1.0 - (z - 1.0) / (ZF1 - 1.0), 0.0, 1.0), 1.8);
  float bright = max(fog * 1.02, glow * min(1.0, fog * 3.4));
  if (pulseA > 0.0) bright = min(1.0, bright * (1.0 + 0.16 * pulseA));
  float nearLift = z < 10.0 ? 1.0 + (10.0 - z) * 0.022 : 1.0;
  vec3 rgb = col * bright * nearLift + BG * (1.0 - bright);
  rgb = clamp(rgb, 0.0, 1.0);

  float alpha = ss(ZN0, ZN1, z) * (1.0 - ss(ZF0, ZF1, z));
  float coc = min(40.0, 40.0 * abs(1.0 / z - 1.0 / zf) * zf);
  float blur = coc * 0.41;
  float rad = pr + blur;
  float coverage = min(1.0, pow(pr / max(rad, 1.0), 2.0));
  float a = min(1.0, alpha * (0.35 + 0.65 * coverage));
  if (a < 0.004 || rad < 0.2) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_pm = vec4(0.0);
    v_soft = 0.0;
    return;
  }

  v_soft = min(0.42, 0.08 + (coc / 40.0) * 0.34);
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
in float v_soft;
in vec2 v_uv;
out vec4 outColor;
void main() {
  if (v_pm.a <= 0.0) discard;
  vec2 p = v_uv - 0.5;
  float d = length(p);
  if (d > 0.5) discard;
  float inner = 0.5 - v_soft;
  float edge = smoothstep(0.5, max(0.06, inner), d);
  float a = v_pm.a * edge;
  outColor = vec4(v_pm.rgb * edge, a);
}`;

const CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

export type GlBundle = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  cornerBuf: WebGLBuffer;
  posBuf: WebGLBuffer;
  catBuf: WebGLBuffer;
  radBuf: WebGLBuffer;
  count: number;
  uTime: WebGLUniformLocation | null;
  uScale: WebGLUniformLocation | null;
  uLayout: WebGLUniformLocation | null;
  uZClip: WebGLUniformLocation | null;
};

const Z_BINS: [number, number][] = [
  [0.5, 3.5],
  [3.5, 6],
  [6, 8.5],
  [8.5, 11],
  [11, 14],
  [14, 17],
  [17, 20.5],
  [20.5, 24],
  [24, 27],
  [27, 30],
];

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

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER, CORNERS, gl.STATIC_DRAW);
  const cornerLoc = gl.getAttribLocation(program, "a_corner");
  gl.enableVertexAttribArray(cornerLoc);
  gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(cornerLoc, 0);

  const stride = 3 * 4;
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, field.pos, gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, "i_pos");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, stride, 0);
  gl.vertexAttribDivisor(posLoc, 1);

  gl.bindBuffer(gl.ARRAY_BUFFER, catBuf);
  const catF = new Float32Array(field.count);
  for (let i = 0; i < field.count; i++) catF[i] = field.cat[i];
  gl.bufferData(gl.ARRAY_BUFFER, catF, gl.STATIC_DRAW);
  const catLoc = gl.getAttribLocation(program, "i_cat");
  gl.enableVertexAttribArray(catLoc);
  gl.vertexAttribPointer(catLoc, 1, gl.FLOAT, false, 4, 0);
  gl.vertexAttribDivisor(catLoc, 1);

  gl.bindBuffer(gl.ARRAY_BUFFER, radBuf);
  gl.bufferData(gl.ARRAY_BUFFER, field.rad, gl.STATIC_DRAW);
  const radLoc = gl.getAttribLocation(program, "i_rad");
  gl.enableVertexAttribArray(radLoc);
  gl.vertexAttribPointer(radLoc, 1, gl.FLOAT, false, 4, 0);
  gl.vertexAttribDivisor(radLoc, 1);

  gl.bindVertexArray(null);

  gl.useProgram(program);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  return {
    gl,
    program,
    vao,
    cornerBuf,
    posBuf,
    catBuf,
    radBuf,
    count: field.count,
    uTime: gl.getUniformLocation(program, "u_time"),
    uScale: gl.getUniformLocation(program, "u_scale"),
    uLayout: gl.getUniformLocation(program, "u_layout"),
    uZClip: gl.getUniformLocation(program, "u_zClip"),
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
  const { gl, program, vao, count, uTime, uScale, uLayout, uZClip } = bundle;

  gl.viewport(0, 0, width, height);
  gl.clearColor(11 / 255, 11 / 255, 11 / 255, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.bindVertexArray(vao);
  if (uTime) gl.uniform1f(uTime, t);
  if (uScale) gl.uniform2f(uScale, width, height);
  if (uLayout) gl.uniform4f(uLayout, layout.scale, layout.offX, layout.offY, layout.dpr);

  for (const [z0, z1] of Z_BINS) {
    if (uZClip) gl.uniform2f(uZClip, z0, z1);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
  }
  gl.bindVertexArray(null);
}
