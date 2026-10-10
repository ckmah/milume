"use strict";(()=>{var T=[-1,0,1,2,3,4];async function H(o){let n=await fetch(o);if(!n.ok)throw new Error(`hero points: ${n.status}`);let e=await n.arrayBuffer(),t=new DataView(e),c=t.getUint32(0,!0),r=T.length,m=c*r,s=new Float32Array(m*3),l=new Uint8Array(m),u=new Float32Array(m),i=0,a=4;for(let d=0;d<c;d++){let p=t.getFloat32(a,!0);a+=4;let b=t.getFloat32(a,!0);a+=4;let A=t.getFloat32(a,!0);a+=4;let _=t.getUint8(a);a+=1;let v=t.getFloat32(a,!0);a+=4;for(let F of T){let g=i*3;s[g]=p,s[g+1]=b,s[g+2]=A+F*10,l[i]=_,u[i]=v,i++}}return{count:m,pos:s,cat:l,rad:u}}var k=`#version 300 es
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
}`,X=`#version 300 es
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
}`,$=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),q=[[.5,3.5],[3.5,6],[6,8.5],[8.5,11],[11,14],[14,17],[17,20.5],[20.5,24],[24,27],[27,30]];function W(o,n){let e=o.getContext("webgl2",{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!0});if(!e)return null;let t=D(e,e.VERTEX_SHADER,k),c=D(e,e.FRAGMENT_SHADER,X);if(!t||!c)return null;let r=j(e,t,c);if(!r)return null;let m=e.createBuffer(),s=e.createBuffer(),l=e.createBuffer(),u=e.createBuffer(),i=e.createVertexArray();e.bindVertexArray(i),e.bindBuffer(e.ARRAY_BUFFER,m),e.bufferData(e.ARRAY_BUFFER,$,e.STATIC_DRAW);let a=e.getAttribLocation(r,"a_corner");e.enableVertexAttribArray(a),e.vertexAttribPointer(a,2,e.FLOAT,!1,0,0),e.vertexAttribDivisor(a,0);let d=12;e.bindBuffer(e.ARRAY_BUFFER,s),e.bufferData(e.ARRAY_BUFFER,n.pos,e.STATIC_DRAW);let p=e.getAttribLocation(r,"i_pos");e.enableVertexAttribArray(p),e.vertexAttribPointer(p,3,e.FLOAT,!1,d,0),e.vertexAttribDivisor(p,1),e.bindBuffer(e.ARRAY_BUFFER,l);let b=new Float32Array(n.count);for(let v=0;v<n.count;v++)b[v]=n.cat[v];e.bufferData(e.ARRAY_BUFFER,b,e.STATIC_DRAW);let A=e.getAttribLocation(r,"i_cat");e.enableVertexAttribArray(A),e.vertexAttribPointer(A,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(A,1),e.bindBuffer(e.ARRAY_BUFFER,u),e.bufferData(e.ARRAY_BUFFER,n.rad,e.STATIC_DRAW);let _=e.getAttribLocation(r,"i_rad");return e.enableVertexAttribArray(_),e.vertexAttribPointer(_,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(_,1),e.bindVertexArray(null),e.useProgram(r),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),{gl:e,program:r,vao:i,cornerBuf:m,posBuf:s,catBuf:l,radBuf:u,count:n.count,uTime:e.getUniformLocation(r,"u_time"),uScale:e.getUniformLocation(r,"u_scale"),uLayout:e.getUniformLocation(r,"u_layout"),uZClip:e.getUniformLocation(r,"u_zClip")}}function D(o,n,e){let t=o.createShader(n);return t?(o.shaderSource(t,e),o.compileShader(t),o.getShaderParameter(t,o.COMPILE_STATUS)?t:(console.error(o.getShaderInfoLog(t)),o.deleteShader(t),null)):null}function j(o,n,e){let t=o.createProgram();return t?(o.attachShader(t,n),o.attachShader(t,e),o.linkProgram(t),o.getProgramParameter(t,o.LINK_STATUS)?t:(console.error(o.getProgramInfoLog(t)),o.deleteProgram(t),null)):null}function U(o,n,e,t,c){let{gl:r,program:m,vao:s,count:l,uTime:u,uScale:i,uLayout:a,uZClip:d}=o;r.viewport(0,0,e,t),r.clearColor(11/255,11/255,11/255,1),r.clear(r.COLOR_BUFFER_BIT),r.useProgram(m),r.bindVertexArray(s),u&&r.uniform1f(u,n),i&&r.uniform2f(i,e,t),a&&r.uniform4f(a,c.scale,c.offX,c.offY,c.dpr);for(let[p,b]of q)d&&r.uniform2f(d,p,b),r.drawArraysInstanced(r.TRIANGLES,0,6,l);r.bindVertexArray(null)}function K(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches}function J(){return Math.min(2,window.devicePixelRatio||1)}function Q(o,n,e){if(e!==null)return e;let t=(o-n)/1e3;return t-Math.floor(t/11)*11}async function N(o){let n=o.getAttribute("data-assets-base")??"assets/",e=o.querySelector(".milume-hero__poster"),t=o.querySelector(".milume-hero__canvas");if(!e||!t)throw new Error("milume-hero: missing poster or canvas");let c=null,r=!1;try{c=await H(`${n}hero-points.bin`)}catch{r=!0}let s=!K()&&!r&&c?W(t,c):null,l=!!s;l?(e.hidden=!0,t.hidden=!1,o.dataset.heroMode="webgl"):(e.hidden=!1,t.hidden=!0,o.dataset.heroMode="poster");let u=l,i=0,a=0,d=0,p=0,b=0,A=null,_=performance.now(),v=0,F=0,g={scale:1,offX:0,offY:0,dpr:1},M=()=>{let f=o.getBoundingClientRect(),L=J();v=Math.max(1,Math.round(f.width*L)),F=Math.max(1,Math.round(f.height*L)),t.width=v,t.height=F,t.style.width=`${f.width}px`,t.style.height=`${f.height}px`;let h=f.width,w=f.height,x=Math.max(h/1600,w/900);g={scale:x,offX:(h-1600*x)/2,offY:(w-900*x)/2,dpr:L}},C=f=>{if(!s)return;performance.mark("hero-begin");let L=Q(f,_,A);p=0;let h=performance.now();U(s,L,v,F,g),b=performance.now()-h,performance.mark("hero-end");let w=performance.getEntriesByName("hero-frame");for(let Y of w)performance.clearMeasures(Y.name);performance.measure("hero-frame","hero-begin","hero-end");let x=performance.getEntriesByName("hero-frame").pop();x&&(d=x.duration),performance.clearMarks("hero-begin"),performance.clearMarks("hero-end"),a+=1},z=()=>{i=0,!(!u||!s)&&(C(performance.now()),i=requestAnimationFrame(z))},E=()=>{!u||!l||i||(i=requestAnimationFrame(z))},y=()=>{u=!1,i&&(cancelAnimationFrame(i),i=0)},B=()=>{l&&(A=null,_=performance.now(),u=!0,E())},P=new IntersectionObserver(f=>{f.some(h=>h.isIntersecting)?B():y()},{threshold:.05});P.observe(o);let I=()=>{document.visibilityState==="hidden"?y():o.getBoundingClientRect().bottom>0&&o.getBoundingClientRect().top<window.innerHeight&&B()};document.addEventListener("visibilitychange",I);let O=new ResizeObserver(()=>{M(),E()});return O.observe(o),M(),l&&E(),{pause:y,resume:B,destroy:()=>{y(),P.disconnect(),O.disconnect(),document.removeEventListener("visibilitychange",I)},isLive:()=>l,getFrameId:()=>a,isPaused:()=>!u,getLastFrameMs:()=>d,getLastSimMs:()=>p,getLastDrawMs:()=>b,setTime:f=>{A=f,y(),C(performance.now())},renderOnce:()=>C(performance.now())}}async function G(){let o=document.querySelectorAll("[data-milume-hero]"),n=[];for(let e of o)n.push(await N(e));window.__milumeHeroHandles=n}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{G().catch(()=>{})}):G().catch(()=>{});window.__milumeHeroMount=G;})();
