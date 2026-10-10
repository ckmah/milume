"use strict";(()=>{var G=[-1,0,1,2,3,4];async function U(o){let a=await fetch(o);if(!a.ok)throw new Error(`hero points: ${a.status}`);let e=await a.arrayBuffer(),r=new DataView(e),l=r.getUint32(0,!0),t=G.length,v=l*t,i=new Float32Array(v*3),m=new Uint8Array(v),p=new Float32Array(v),c=0,s=4;for(let n=0;n<l;n++){let f=r.getFloat32(s,!0);s+=4;let d=r.getFloat32(s,!0);s+=4;let u=r.getFloat32(s,!0);s+=4;let b=r.getUint8(s);s+=1;let _=r.getFloat32(s,!0);s+=4;for(let h of G){let L=c*3;i[L]=f,i[L+1]=d,i[L+2]=u+h*10,m[c]=b,p[c]=_,c++}}return{count:v,pos:i,cat:m,rad:p}}var q=`#version 300 es
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
  float sx = float(${1600}) * 0.5 + F * x / z;
  float sy = float(${900}) * 0.5 + F * y / z;
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
}`,$=`#version 300 es
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
}`,j=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),K=`#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,J=`#version 300 es
precision highp float;
out vec4 outColor;
void main() {
  vec3 haze = vec3(8.0 / 255.0, 22.0 / 255.0, 26.0 / 255.0);
  float a = 0.11;
  outColor = vec4(haze * a, a);
}`;function Q(o){return o%11/11*10%10}function N(o,a){let e=o.getContext("webgl2",{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!0});if(!e)return null;let r=E(e,e.VERTEX_SHADER,q),l=E(e,e.FRAGMENT_SHADER,$);if(!r||!l)return null;let t=H(e,r,l);if(!t)return null;let v=E(e,e.VERTEX_SHADER,K),i=E(e,e.FRAGMENT_SHADER,J);if(!v||!i)return null;let m=H(e,v,i);if(!m)return null;let p=e.createBuffer(),c=e.createBuffer(),s=e.createBuffer(),n=e.createBuffer(),f=e.createVertexArray(),d=new Float32Array(a.count);for(let A=0;A<a.count;A++)d[A]=a.cat[A];e.bindVertexArray(f),e.bindBuffer(e.ARRAY_BUFFER,p),e.bufferData(e.ARRAY_BUFFER,j,e.STATIC_DRAW);let u=e.getAttribLocation(t,"a_corner");e.enableVertexAttribArray(u),e.vertexAttribPointer(u,2,e.FLOAT,!1,0,0),e.vertexAttribDivisor(u,0),e.bindBuffer(e.ARRAY_BUFFER,c),e.bufferData(e.ARRAY_BUFFER,a.pos.byteLength,e.DYNAMIC_DRAW);let b=e.getAttribLocation(t,"i_pos");e.enableVertexAttribArray(b),e.vertexAttribPointer(b,3,e.FLOAT,!1,12,0),e.vertexAttribDivisor(b,1),e.bindBuffer(e.ARRAY_BUFFER,s),e.bufferData(e.ARRAY_BUFFER,d.byteLength,e.DYNAMIC_DRAW);let _=e.getAttribLocation(t,"i_cat");e.enableVertexAttribArray(_),e.vertexAttribPointer(_,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(_,1),e.bindBuffer(e.ARRAY_BUFFER,n),e.bufferData(e.ARRAY_BUFFER,a.rad.byteLength,e.DYNAMIC_DRAW);let h=e.getAttribLocation(t,"i_rad");e.enableVertexAttribArray(h),e.vertexAttribPointer(h,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(h,1),e.bindVertexArray(null),e.enable(e.BLEND);let L=new Uint32Array(a.count);for(let A=0;A<a.count;A++)L[A]=A;return{gl:e,program:t,vao:f,posBuf:c,catBuf:s,radBuf:n,count:a.count,srcPos:a.pos,srcCat:d,srcRad:a.rad,order:L,keys:new Float32Array(a.count),sortPos:new Float32Array(a.pos.length),sortCat:new Float32Array(a.count),sortRad:new Float32Array(a.count),uTime:e.getUniformLocation(t,"u_time"),uGlowPass:e.getUniformLocation(t,"u_glowPass"),uScale:e.getUniformLocation(t,"u_scale"),uLayout:e.getUniformLocation(t,"u_layout"),hazeProgram:m}}function E(o,a,e){let r=o.createShader(a);return r?(o.shaderSource(r,e),o.compileShader(r),o.getShaderParameter(r,o.COMPILE_STATUS)?r:(console.error(o.getShaderInfoLog(r)),o.deleteShader(r),null)):null}function H(o,a,e){let r=o.createProgram();return r?(o.attachShader(r,a),o.attachShader(r,e),o.linkProgram(r),o.getProgramParameter(r,o.LINK_STATUS)?r:(console.error(o.getProgramInfoLog(r)),o.deleteProgram(r),null)):null}function ee(o,a){let{srcPos:e,order:r,keys:l,count:t}=o,v=Q(a);for(let n=0;n<t;n++)l[n]=e[n*3+2]-v;r.sort((n,f)=>l[f]-l[n]);let{sortPos:i,sortCat:m,sortRad:p,srcCat:c,srcRad:s}=o;for(let n=0;n<t;n++){let f=r[n],d=n*3,u=f*3;i[d]=e[u],i[d+1]=e[u+1],i[d+2]=e[u+2],m[n]=c[f],p[n]=s[f]}}function W(o,a,e,r,l){let{gl:t,program:v,vao:i,posBuf:m,catBuf:p,radBuf:c,count:s,uTime:n,uGlowPass:f,uScale:d,uLayout:u}=o;ee(o,a),t.bindBuffer(t.ARRAY_BUFFER,m),t.bufferSubData(t.ARRAY_BUFFER,0,o.sortPos),t.bindBuffer(t.ARRAY_BUFFER,p),t.bufferSubData(t.ARRAY_BUFFER,0,o.sortCat),t.bindBuffer(t.ARRAY_BUFFER,c),t.bufferSubData(t.ARRAY_BUFFER,0,o.sortRad),t.viewport(0,0,e,r),t.clearColor(10/255,18/255,20/255,1),t.clear(t.COLOR_BUFFER_BIT),t.useProgram(v),t.bindVertexArray(i),t.blendFunc(t.ONE,t.ONE_MINUS_SRC_ALPHA),n&&t.uniform1f(n,a),f&&t.uniform1f(f,0),d&&t.uniform2f(d,e,r),u&&t.uniform4f(u,l.scale,l.offX,l.offY,l.dpr),t.drawArraysInstanced(t.TRIANGLES,0,6,s),t.useProgram(o.hazeProgram),t.bindVertexArray(null),t.blendFunc(t.ONE,t.ONE_MINUS_SRC_ALPHA),t.drawArrays(t.TRIANGLES,0,3),t.useProgram(v),t.bindVertexArray(i),t.blendFunc(t.ONE,t.ONE),f&&t.uniform1f(f,1),t.drawArraysInstanced(t.TRIANGLES,0,6,s),t.blendFunc(t.ONE,t.ONE_MINUS_SRC_ALPHA),t.bindVertexArray(null)}function te(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches}function oe(){return Math.min(2,window.devicePixelRatio||1)}function Z(o,a,e){if(e!==null)return e;let r=(o-a)/1e3;return r-Math.floor(r/11)*11}async function V(o){let a=o.getAttribute("data-assets-base")??"assets/",e=o.querySelector(".milume-hero__poster"),r=o.querySelector(".milume-hero__canvas");if(!e||!r)throw new Error("milume-hero: missing poster or canvas");let l=null,t=!1;try{l=await U(`${a}hero-points.bin`)}catch{t=!0}let i=!te()&&!t&&l?N(r,l):null,m=!!i;m?(e.hidden=!0,r.hidden=!1,o.dataset.heroMode="webgl"):(e.hidden=!1,r.hidden=!0,o.dataset.heroMode="poster");let p=m,c=0,s=0,n=0,f=0,d=0,u=null,b=performance.now(),_=0,h=0,L={scale:1,offX:0,offY:0,dpr:1},A=()=>{let g=o.getBoundingClientRect(),y=oe();_=Math.max(1,Math.round(g.width*y)),h=Math.max(1,Math.round(g.height*y)),r.width=_,r.height=h,r.style.width=`${g.width}px`,r.style.height=`${g.height}px`;let F=g.width,x=g.height,R=Math.max(F/1600,x/900);L={scale:R,offX:(F-1600*R)/2,offY:(x-900*R)/2,dpr:y}},C=g=>{if(!i)return;performance.mark("hero-begin");let y=Z(g,b,u);f=0;let F=performance.now();W(i,y,_,h,L),d=performance.now()-F,performance.mark("hero-end");let x=performance.getEntriesByName("hero-frame");for(let k of x)performance.clearMeasures(k.name);performance.measure("hero-frame","hero-begin","hero-end");let R=performance.getEntriesByName("hero-frame").pop();R&&(n=R.duration),performance.clearMarks("hero-begin"),performance.clearMarks("hero-end"),s+=1},z=()=>{c=0,!(!p||!i)&&(C(performance.now()),c=requestAnimationFrame(z))},P=()=>{!p||!m||c||(c=requestAnimationFrame(z))},w=()=>{p=!1,c&&(cancelAnimationFrame(c),c=0)},T=()=>{m&&(u=null,b=performance.now(),p=!0,P())},I=new IntersectionObserver(g=>{g.some(F=>F.isIntersecting)?T():w()},{threshold:.05});I.observe(o);let D=()=>{document.visibilityState==="hidden"?w():o.getBoundingClientRect().bottom>0&&o.getBoundingClientRect().top<window.innerHeight&&T()};document.addEventListener("visibilitychange",D);let O=new ResizeObserver(()=>{A(),P()});return O.observe(o),A(),m&&P(),{pause:w,resume:T,destroy:()=>{w(),I.disconnect(),O.disconnect(),document.removeEventListener("visibilitychange",D)},isLive:()=>m,getFrameId:()=>s,isPaused:()=>!p,getLastFrameMs:()=>n,getLastSimMs:()=>f,getLastDrawMs:()=>d,setTime:g=>{u=g,w(),C(performance.now())},getLoopTime:()=>Z(performance.now(),b,u),renderOnce:()=>C(performance.now())}}async function M(){let o=document.querySelectorAll("[data-milume-hero]"),a=[];for(let e of o)a.push(await V(e));window.__milumeHeroHandles=a}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{M().catch(()=>{})}):M().catch(()=>{});window.__milumeHeroMount=M;})();
