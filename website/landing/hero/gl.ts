import type { GpuField } from "./field.ts";
import { LOGICAL_H, LOGICAL_W } from "./constants.ts";

const VS = `#version 300 es
precision highp float;
in vec2 a_corner;
in vec3 i_pos;
in float i_cat;
in float i_rad;
uniform float u_time;
uniform float u_glowPass;
uniform vec2 u_scale;
uniform vec4 u_layout;
out vec4 v_pm;
out float v_soft;
out float v_glow;
out vec2 v_uv;

const float T = 11.0;
const float L = 10.0;
const float F = 900.0;
const vec3 BG = vec3(11.0 / 255.0);
const vec3 TEAL = vec3(45.0 / 255.0, 212.0 / 255.0, 191.0 / 255.0);
const vec3 CAT0 = vec3(244.0, 114.0, 182.0) / 255.0;
const vec3 CAT1 = vec3(96.0, 165.0, 250.0) / 255.0;
const vec3 CAT2 = vec3(251.0, 191.0, 36.0) / 255.0;
const vec3 CAT3 = vec3(167.0, 139.0, 250.0) / 255.0;
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
  float u = mod(t, T) / T;
  float z = mod(u * L, L);
  c = vec3(0.45 * sin(6.2831853 * u), 0.25 * sin(12.566371 * u), z);
  roll = 0.0125 * cos(6.2831853 * u);
}

float blurSigma(float halfCoc) {
  float fi = clamp(halfCoc, 0.0, 16.0);
  float s0=0.0,s1=0.6,s2=1.3,s3=2.3,s4=3.6,s5=5.2,s6=7.2,s7=9.6,s8=12.5,s9=16.0;
  if (fi <= s1) return mix(s0, s1, fi / s1);
  if (fi <= s2) return mix(s1, s2, (fi - s1) / (s2 - s1));
  if (fi <= s3) return mix(s2, s3, (fi - s2) / (s3 - s2));
  if (fi <= s4) return mix(s3, s4, (fi - s3) / (s4 - s3));
  if (fi <= s5) return mix(s4, s5, (fi - s4) / (s5 - s4));
  if (fi <= s6) return mix(s5, s6, (fi - s5) / (s6 - s5));
  if (fi <= s7) return mix(s6, s7, (fi - s6) / (s7 - s6));
  if (fi <= s8) return mix(s7, s8, (fi - s7) / (s8 - s7));
  if (fi <= s9) return mix(s8, s9, (fi - s8) / (s9 - s8));
  return s9;
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
  if (z <= ZN0 || z >= ZF1) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_pm = vec4(0.0);
    v_soft = 0.0;
    v_glow = 0.0;
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
    float core = 0.72 * exp(-pow(ds / 3.8, 2.0)) * ss(0.0, 1.0, pulseS);
    float ring = 0.32 * exp(-pow((ds - 2.5 - pulseS * 1.4) / 2.6, 2.0)) * ss(0.3, 1.3, pulseS);
    glow = clamp(core + ring, 0.0, 0.92) * pulseA;
    float passed = clamp((2.5 + pulseS * 1.4 - ds) / 2.0, 0.0, 1.0) * pulseA;
    col = mix(col, TEAL, 0.08 * passed);
    col = mix(col, TEAL, glow);
  }

  float zf = 11.0;
  if (pulseA > 0.0) {
    zf = 11.0 + pulseA * ((SEL.z - c.z) - 11.0);
  }
  float fog = pow(clamp(1.0 - (z - 1.0) / (ZF1 - 1.0), 0.0, 1.0), 1.8);
  float bright = max(fog * 0.74, glow * min(0.82, fog * 2.4));
  vec3 bgTeal = mix(BG, vec3(9.0 / 255.0, 24.0 / 255.0, 28.0 / 255.0), 0.42);
  vec3 rgb = col * bright + bgTeal * (1.0 - bright);
  float peak = max(max(rgb.r, rgb.g), rgb.b);
  if (peak > 0.85 && glow > 0.15) {
    rgb *= 0.85 / peak;
  }
  rgb = clamp(rgb, 0.0, 1.0);
  rgb *= mix(0.9, 1.0, clamp(bright, 0.0, 1.0));

  float alpha = ss(ZN0, ZN1, z) * (1.0 - ss(ZF0, ZF1, z));
  float dz = abs(z - zf);
  float inBand = 1.0 - ss(0.88, 1.02, dz);
  float cocThin = min(40.0, 40.0 * abs(1.0 / z - 1.0 / zf) * zf);
  float cocWide = min(40.0, cocThin * 3.6 + pow(max(dz - 0.85, 0.0), 1.2) * 18.0);
  float coc = mix(cocWide, cocThin * 0.05, inBand);
  float sigma = blurSigma(coc * 0.58) * (1.0 + 0.45 * (1.0 - inBand));
  float rd = max(1.0, ceil(pr * 2.0) * 0.5);
  float coverage = min(1.0, pow(pr / rd, 2.0));
  float a = alpha * coverage;

  if (u_glowPass > 0.5) {
    if (glow < 0.2 || a < 0.004) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      v_pm = vec4(0.0);
      v_soft = 0.0;
      v_glow = 0.0;
      return;
    }
    float haloR = pr * 1.65;
    float haloA = min(0.2, glow * a * min(1.0, fog * 3.0) * 0.17);
    v_soft = 0.52;
    v_glow = glow;
    v_pm = vec4(TEAL * haloA, haloA);
    float lay = u_layout.x;
    float offX = u_layout.y;
    float offY = u_layout.z;
    float dpr = u_layout.w;
    vec2 center = vec2((sx * lay + offX) * dpr, (sy * lay + offY) * dpr);
    float R = haloR * lay * dpr;
    vec2 pos = center + a_corner * R;
    vec2 clip = (pos / u_scale) * 2.0 - 1.0;
    clip.y = -clip.y;
    gl_Position = vec4(clip, 0.0, 1.0);
    return;
  }

  float rad = pr + sigma * 2.05;
  if (a < 0.004 || rad < 0.15) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_pm = vec4(0.0);
    v_soft = 0.0;
    v_glow = 0.0;
    return;
  }

  v_soft = clamp(sigma / 11.0, 0.04, 0.58);
  v_glow = glow;
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
in float v_glow;
in vec2 v_uv;
out vec4 outColor;
void main() {
  if (v_pm.a <= 0.0) discard;
  vec2 p = v_uv - 0.5;
  float d = length(p);
  if (d > 0.5) discard;
  float inner = 0.5 - v_soft;
  float edge = smoothstep(0.5, max(0.02, inner), d);
  float a = v_pm.a * edge;
  vec3 rgb = v_pm.rgb * edge;
  outColor = vec4(rgb, a);
}`;

const CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

const HAZE_VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const HAZE_FS = `#version 300 es
precision highp float;
out vec4 outColor;
void main() {
  vec3 haze = vec3(8.0 / 255.0, 22.0 / 255.0, 26.0 / 255.0);
  float a = 0.11;
  outColor = vec4(haze * a, a);
}`;

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
  uGlowPass: WebGLUniformLocation | null;
  uScale: WebGLUniformLocation | null;
  uLayout: WebGLUniformLocation | null;
  hazeProgram: WebGLProgram;
};

export function camZAt(t: number): number {
  const u = (t % 11) / 11;
  return (u * 10) % 10;
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

  const hazeVs = compile(gl, gl.VERTEX_SHADER, HAZE_VS);
  const hazeFs = compile(gl, gl.FRAGMENT_SHADER, HAZE_FS);
  if (!hazeVs || !hazeFs) return null;
  const hazeProgram = link(gl, hazeVs, hazeFs);
  if (!hazeProgram) return null;

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
    uGlowPass: gl.getUniformLocation(program, "u_glowPass"),
    uScale: gl.getUniformLocation(program, "u_scale"),
    uLayout: gl.getUniformLocation(program, "u_layout"),
    hazeProgram,
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
  const cz = camZAt(t);
  for (let i = 0; i < count; i++) {
    keys[i] = srcPos[i * 3 + 2] - cz;
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
  const { gl, program, vao, posBuf, catBuf, radBuf, count, uTime, uGlowPass, uScale, uLayout } = bundle;

  sortInstances(bundle, t);

  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, bundle.sortPos);
  gl.bindBuffer(gl.ARRAY_BUFFER, catBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, bundle.sortCat);
  gl.bindBuffer(gl.ARRAY_BUFFER, radBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, bundle.sortRad);

  gl.viewport(0, 0, width, height);
  gl.clearColor(10 / 255, 18 / 255, 20 / 255, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.bindVertexArray(vao);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  if (uTime) gl.uniform1f(uTime, t);
  if (uGlowPass) gl.uniform1f(uGlowPass, 0);
  if (uScale) gl.uniform2f(uScale, width, height);
  if (uLayout) gl.uniform4f(uLayout, layout.scale, layout.offX, layout.offY, layout.dpr);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);

  gl.useProgram(bundle.hazeProgram);
  gl.bindVertexArray(null);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.useProgram(program);
  gl.bindVertexArray(vao);
  gl.blendFunc(gl.ONE, gl.ONE);
  if (uGlowPass) gl.uniform1f(uGlowPass, 1);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  gl.bindVertexArray(null);
}
