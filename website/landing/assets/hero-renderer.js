"use strict";(()=>{var P=[-1,0,1,2,3,4];async function D(o){let n=await fetch(o);if(!n.ok)throw new Error(`hero points: ${n.status}`);let e=await n.arrayBuffer(),r=new DataView(e),l=r.getUint32(0,!0),t=P.length,_=l*t,f=new Float32Array(_*3),m=new Uint8Array(_),d=new Float32Array(_),i=0,s=4;for(let a=0;a<l;a++){let c=r.getFloat32(s,!0);s+=4;let p=r.getFloat32(s,!0);s+=4;let u=r.getFloat32(s,!0);s+=4;let g=r.getUint8(s);s+=1;let v=r.getFloat32(s,!0);s+=4;for(let F of P){let b=i*3;f[b]=c,f[b+1]=p,f[b+2]=u+F*10,m[i]=g,d[i]=v,i++}}return{count:_,pos:f,cat:m,rad:d}}var X=`#version 300 es
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
  float bright = max(fog * 0.9, glow * min(0.95, fog * 3.0));
  vec3 rgb = col * bright + BG * (1.0 - bright);
  rgb = clamp(rgb, 0.0, 1.0);

  float alpha = ss(ZN0, ZN1, z) * (1.0 - ss(ZF0, ZF1, z));
  float coc = min(40.0, 40.0 * abs(1.0 / z - 1.0 / zf) * zf);
  float sigma = blurSigma(coc * 0.5);
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
    float haloR = pr * 1.8;
    float haloA = glow * a * min(1.0, fog * 3.0) * 0.25;
    v_soft = 0.42;
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

  float rad = pr + sigma;
  if (a < 0.004 || rad < 0.15) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_pm = vec4(0.0);
    v_soft = 0.0;
    v_glow = 0.0;
    return;
  }

  v_soft = clamp(sigma / 14.0, 0.0, 0.5);
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
}`,q=`#version 300 es
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
  if (v_soft > 0.35) {
    float halo = exp(-pow(d / 0.48, 2.0) * 2.2);
    rgb += vec3(45.0 / 255.0, 212.0 / 255.0, 191.0 / 255.0) * v_glow * a * halo * 0.35;
  }
  outColor = vec4(rgb, a);
}`,$=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]);function j(o){return o%11/11*10%10}function N(o,n){let e=o.getContext("webgl2",{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!0});if(!e)return null;let r=H(e,e.VERTEX_SHADER,X),l=H(e,e.FRAGMENT_SHADER,q);if(!r||!l)return null;let t=K(e,r,l);if(!t)return null;let _=e.createBuffer(),f=e.createBuffer(),m=e.createBuffer(),d=e.createBuffer(),i=e.createVertexArray(),s=new Float32Array(n.count);for(let v=0;v<n.count;v++)s[v]=n.cat[v];e.bindVertexArray(i),e.bindBuffer(e.ARRAY_BUFFER,_),e.bufferData(e.ARRAY_BUFFER,$,e.STATIC_DRAW);let a=e.getAttribLocation(t,"a_corner");e.enableVertexAttribArray(a),e.vertexAttribPointer(a,2,e.FLOAT,!1,0,0),e.vertexAttribDivisor(a,0),e.bindBuffer(e.ARRAY_BUFFER,f),e.bufferData(e.ARRAY_BUFFER,n.pos.byteLength,e.DYNAMIC_DRAW);let c=e.getAttribLocation(t,"i_pos");e.enableVertexAttribArray(c),e.vertexAttribPointer(c,3,e.FLOAT,!1,12,0),e.vertexAttribDivisor(c,1),e.bindBuffer(e.ARRAY_BUFFER,m),e.bufferData(e.ARRAY_BUFFER,s.byteLength,e.DYNAMIC_DRAW);let p=e.getAttribLocation(t,"i_cat");e.enableVertexAttribArray(p),e.vertexAttribPointer(p,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(p,1),e.bindBuffer(e.ARRAY_BUFFER,d),e.bufferData(e.ARRAY_BUFFER,n.rad.byteLength,e.DYNAMIC_DRAW);let u=e.getAttribLocation(t,"i_rad");e.enableVertexAttribArray(u),e.vertexAttribPointer(u,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(u,1),e.bindVertexArray(null),e.enable(e.BLEND);let g=new Uint32Array(n.count);for(let v=0;v<n.count;v++)g[v]=v;return{gl:e,program:t,vao:i,posBuf:f,catBuf:m,radBuf:d,count:n.count,srcPos:n.pos,srcCat:s,srcRad:n.rad,order:g,keys:new Float32Array(n.count),sortPos:new Float32Array(n.pos.length),sortCat:new Float32Array(n.count),sortRad:new Float32Array(n.count),uTime:e.getUniformLocation(t,"u_time"),uGlowPass:e.getUniformLocation(t,"u_glowPass"),uScale:e.getUniformLocation(t,"u_scale"),uLayout:e.getUniformLocation(t,"u_layout")}}function H(o,n,e){let r=o.createShader(n);return r?(o.shaderSource(r,e),o.compileShader(r),o.getShaderParameter(r,o.COMPILE_STATUS)?r:(console.error(o.getShaderInfoLog(r)),o.deleteShader(r),null)):null}function K(o,n,e){let r=o.createProgram();return r?(o.attachShader(r,n),o.attachShader(r,e),o.linkProgram(r),o.getProgramParameter(r,o.LINK_STATUS)?r:(console.error(o.getProgramInfoLog(r)),o.deleteProgram(r),null)):null}function J(o,n){let{srcPos:e,order:r,keys:l,count:t}=o,_=j(n);for(let a=0;a<t;a++)l[a]=e[a*3+2]-_;r.sort((a,c)=>l[c]-l[a]);let{sortPos:f,sortCat:m,sortRad:d,srcCat:i,srcRad:s}=o;for(let a=0;a<t;a++){let c=r[a],p=a*3,u=c*3;f[p]=e[u],f[p+1]=e[u+1],f[p+2]=e[u+2],m[a]=i[c],d[a]=s[c]}}function z(o,n,e,r,l){let{gl:t,program:_,vao:f,posBuf:m,catBuf:d,radBuf:i,count:s,uTime:a,uGlowPass:c,uScale:p,uLayout:u}=o;J(o,n),t.bindBuffer(t.ARRAY_BUFFER,m),t.bufferSubData(t.ARRAY_BUFFER,0,o.sortPos),t.bindBuffer(t.ARRAY_BUFFER,d),t.bufferSubData(t.ARRAY_BUFFER,0,o.sortCat),t.bindBuffer(t.ARRAY_BUFFER,i),t.bufferSubData(t.ARRAY_BUFFER,0,o.sortRad),t.viewport(0,0,e,r),t.clearColor(11/255,11/255,11/255,1),t.clear(t.COLOR_BUFFER_BIT),t.useProgram(_),t.bindVertexArray(f),t.blendFunc(t.ONE,t.ONE_MINUS_SRC_ALPHA),a&&t.uniform1f(a,n),c&&t.uniform1f(c,0),p&&t.uniform2f(p,e,r),u&&t.uniform4f(u,l.scale,l.offX,l.offY,l.dpr),t.drawArraysInstanced(t.TRIANGLES,0,6,s),t.blendFunc(t.ONE,t.ONE),c&&t.uniform1f(c,1),t.drawArraysInstanced(t.TRIANGLES,0,6,s),t.blendFunc(t.ONE,t.ONE_MINUS_SRC_ALPHA),t.bindVertexArray(null)}function Q(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches}function ee(){return Math.min(2,window.devicePixelRatio||1)}function W(o,n,e){if(e!==null)return e;let r=(o-n)/1e3;return r-Math.floor(r/11)*11}async function Z(o){let n=o.getAttribute("data-assets-base")??"assets/",e=o.querySelector(".milume-hero__poster"),r=o.querySelector(".milume-hero__canvas");if(!e||!r)throw new Error("milume-hero: missing poster or canvas");let l=null,t=!1;try{l=await D(`${n}hero-points.bin`)}catch{t=!0}let f=!Q()&&!t&&l?N(r,l):null,m=!!f;m?(e.hidden=!0,r.hidden=!1,o.dataset.heroMode="webgl"):(e.hidden=!1,r.hidden=!0,o.dataset.heroMode="poster");let d=m,i=0,s=0,a=0,c=0,p=0,u=null,g=performance.now(),v=0,F=0,b={scale:1,offX:0,offY:0,dpr:1},G=()=>{let A=o.getBoundingClientRect(),h=ee();v=Math.max(1,Math.round(A.width*h)),F=Math.max(1,Math.round(A.height*h)),r.width=v,r.height=F,r.style.width=`${A.width}px`,r.style.height=`${A.height}px`;let L=A.width,R=A.height,y=Math.max(L/1600,R/900);b={scale:y,offX:(L-1600*y)/2,offY:(R-900*y)/2,dpr:h}},S=A=>{if(!f)return;performance.mark("hero-begin");let h=W(A,g,u);c=0;let L=performance.now();z(f,h,v,F,b),p=performance.now()-L,performance.mark("hero-end");let R=performance.getEntriesByName("hero-frame");for(let V of R)performance.clearMeasures(V.name);performance.measure("hero-frame","hero-begin","hero-end");let y=performance.getEntriesByName("hero-frame").pop();y&&(a=y.duration),performance.clearMarks("hero-begin"),performance.clearMarks("hero-end"),s+=1},M=()=>{i=0,!(!d||!f)&&(S(performance.now()),i=requestAnimationFrame(M))},B=()=>{!d||!m||i||(i=requestAnimationFrame(M))},w=()=>{d=!1,i&&(cancelAnimationFrame(i),i=0)},C=()=>{m&&(u=null,g=performance.now(),d=!0,B())},I=new IntersectionObserver(A=>{A.some(L=>L.isIntersecting)?C():w()},{threshold:.05});I.observe(o);let O=()=>{document.visibilityState==="hidden"?w():o.getBoundingClientRect().bottom>0&&o.getBoundingClientRect().top<window.innerHeight&&C()};document.addEventListener("visibilitychange",O);let U=new ResizeObserver(()=>{G(),B()});return U.observe(o),G(),m&&B(),{pause:w,resume:C,destroy:()=>{w(),I.disconnect(),U.disconnect(),document.removeEventListener("visibilitychange",O)},isLive:()=>m,getFrameId:()=>s,isPaused:()=>!d,getLastFrameMs:()=>a,getLastSimMs:()=>c,getLastDrawMs:()=>p,setTime:A=>{u=A,w(),S(performance.now())},getLoopTime:()=>W(performance.now(),g,u),renderOnce:()=>S(performance.now())}}async function T(){let o=document.querySelectorAll("[data-milume-hero]"),n=[];for(let e of o)n.push(await Z(e));window.__milumeHeroHandles=n}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{T().catch(()=>{})}):T().catch(()=>{});window.__milumeHeroMount=T;})();
