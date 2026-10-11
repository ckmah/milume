"use strict";(()=>{var T=[-1,0,1,2,3,4];async function W(t){let n=await fetch(t);if(!n.ok)throw new Error(`hero points: ${n.status}`);let e=await n.arrayBuffer(),r=new DataView(e),i=r.getUint32(0,!0),o=T.length,v=i*o,u=new Float32Array(v*3),l=new Uint8Array(v),m=new Float32Array(v),s=0,c=4;for(let p=0;p<i;p++){let a=r.getFloat32(c,!0);c+=4;let f=r.getFloat32(c,!0);c+=4;let b=r.getFloat32(c,!0);c+=4;let A=r.getUint8(c);c+=1;let d=r.getFloat32(c,!0);c+=4;for(let F of T){let _=s*3;u[_]=a,u[_+1]=f,u[_+2]=b+F*10,l[s]=A,m[s]=d,s++}}return{count:v,pos:u,cat:l,rad:m}}function Y(t){let n=t/11%1,e=n*10%10;return{c:[.45*Math.sin(2*Math.PI*n),.25*Math.sin(4*Math.PI*n),e],roll:.0125*Math.cos(2*Math.PI*n)}}var $=`#version 300 es
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
  float sx = float(${1600}) * 0.5 + F * x / z;
  float sy = float(${900}) * 0.5 + F * y / z;
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
}`,j=`#version 300 es
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
}`,K=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]);function z(t){return t.count}function N(t,n){let e=t.getContext("webgl2",{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!0});if(!e)return null;let r=V(e,e.VERTEX_SHADER,$),i=V(e,e.FRAGMENT_SHADER,j);if(!r||!i)return null;let o=J(e,r,i);if(!o)return null;let v=e.createBuffer(),u=e.createBuffer(),l=e.createBuffer(),m=e.createBuffer(),s=e.createVertexArray(),c=new Float32Array(n.count);for(let d=0;d<n.count;d++)c[d]=n.cat[d];e.bindVertexArray(s),e.bindBuffer(e.ARRAY_BUFFER,v),e.bufferData(e.ARRAY_BUFFER,K,e.STATIC_DRAW);let p=e.getAttribLocation(o,"a_corner");e.enableVertexAttribArray(p),e.vertexAttribPointer(p,2,e.FLOAT,!1,0,0),e.vertexAttribDivisor(p,0),e.bindBuffer(e.ARRAY_BUFFER,u),e.bufferData(e.ARRAY_BUFFER,n.pos.byteLength,e.DYNAMIC_DRAW);let a=e.getAttribLocation(o,"i_pos");e.enableVertexAttribArray(a),e.vertexAttribPointer(a,3,e.FLOAT,!1,12,0),e.vertexAttribDivisor(a,1),e.bindBuffer(e.ARRAY_BUFFER,l),e.bufferData(e.ARRAY_BUFFER,c.byteLength,e.DYNAMIC_DRAW);let f=e.getAttribLocation(o,"i_cat");e.enableVertexAttribArray(f),e.vertexAttribPointer(f,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(f,1),e.bindBuffer(e.ARRAY_BUFFER,m),e.bufferData(e.ARRAY_BUFFER,n.rad.byteLength,e.DYNAMIC_DRAW);let b=e.getAttribLocation(o,"i_rad");e.enableVertexAttribArray(b),e.vertexAttribPointer(b,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(b,1),e.bindVertexArray(null),e.enable(e.BLEND);let A=new Uint32Array(n.count);for(let d=0;d<n.count;d++)A[d]=d;return{gl:e,program:o,vao:s,posBuf:u,catBuf:l,radBuf:m,count:n.count,srcPos:n.pos,srcCat:c,srcRad:n.rad,order:A,keys:new Float32Array(n.count),sortPos:new Float32Array(n.pos.length),sortCat:new Float32Array(n.count),sortRad:new Float32Array(n.count),uTime:e.getUniformLocation(o,"u_time"),uScale:e.getUniformLocation(o,"u_scale"),uLayout:e.getUniformLocation(o,"u_layout")}}function V(t,n,e){let r=t.createShader(n);return r?(t.shaderSource(r,e),t.compileShader(r),t.getShaderParameter(r,t.COMPILE_STATUS)?r:(console.error(t.getShaderInfoLog(r)),t.deleteShader(r),null)):null}function J(t,n,e){let r=t.createProgram();return r?(t.attachShader(r,n),t.attachShader(r,e),t.linkProgram(r),t.getProgramParameter(r,t.LINK_STATUS)?r:(console.error(t.getProgramInfoLog(r)),t.deleteProgram(r),null)):null}function Q(t,n){let{srcPos:e,order:r,keys:i,count:o}=t,{c:v}=Y(n),u=v[2];for(let a=0;a<o;a++)i[a]=e[a*3+2]-u;r.sort((a,f)=>i[f]-i[a]);let{sortPos:l,sortCat:m,sortRad:s,srcCat:c,srcRad:p}=t;for(let a=0;a<o;a++){let f=r[a],b=a*3,A=f*3;l[b]=e[A],l[b+1]=e[A+1],l[b+2]=e[A+2],m[a]=c[f],s[a]=p[f]}}function k(t,n,e,r,i){let{gl:o,program:v,vao:u,posBuf:l,catBuf:m,radBuf:s,count:c,uTime:p,uScale:a,uLayout:f}=t;Q(t,n),o.bindBuffer(o.ARRAY_BUFFER,l),o.bufferSubData(o.ARRAY_BUFFER,0,t.sortPos),o.bindBuffer(o.ARRAY_BUFFER,m),o.bufferSubData(o.ARRAY_BUFFER,0,t.sortCat),o.bindBuffer(o.ARRAY_BUFFER,s),o.bufferSubData(o.ARRAY_BUFFER,0,t.sortRad),o.viewport(0,0,e,r),o.clearColor(11/255,11/255,11/255,1),o.clear(o.COLOR_BUFFER_BIT),o.useProgram(v),o.bindVertexArray(u),o.blendFunc(o.ONE,o.ONE_MINUS_SRC_ALPHA),p&&o.uniform1f(p,n),a&&o.uniform2f(a,e,r),f&&o.uniform4f(f,i.scale,i.offX,i.offY,i.dpr),o.drawArraysInstanced(o.TRIANGLES,0,6,c),o.bindVertexArray(null)}function ee(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches}function te(){return Math.min(2,window.devicePixelRatio||1)}function Z(t,n,e){if(e!==null)return e;let r=(t-n)/1e3;return r-Math.floor(r/11)*11}async function X(t){let n=t.getAttribute("data-assets-base")??"assets/",e=t.querySelector(".milume-hero__poster"),r=t.querySelector(".milume-hero__canvas");if(!e||!r)throw new Error("milume-hero: missing poster or canvas");e.hidden=!0,r.hidden=!0;let i=null,o=!1;try{i=await W(`${n}hero-points.bin`)}catch{o=!0}let u=!ee()&&!o&&i?N(r,i):null,l=!!u;l?(e.hidden=!0,r.hidden=!1,t.dataset.heroMode="webgl"):(e.hidden=!1,r.hidden=!0,t.dataset.heroMode="poster");let m=l,s=0,c=0,p=0,a=0,f=0,b=null,A=performance.now(),d=0,F=0,_={scale:1,offX:0,offY:0,dpr:1},I=()=>{let h=t.getBoundingClientRect(),L=te();d=Math.max(1,Math.round(h.width*L)),F=Math.max(1,Math.round(h.height*L)),r.width=d,r.height=F,r.style.width=`${h.width}px`,r.style.height=`${h.height}px`;let y=h.width,x=h.height,g=Math.max(y/1600,x/900);_={scale:g,offX:(y-1600*g)/2,offY:(x-900*g)/2,dpr:L}},P=h=>{if(!u)return;performance.mark("hero-begin");let L=Z(h,A,b);a=0;let y=performance.now();k(u,L,d,F,_),f=performance.now()-y,performance.mark("hero-end");let x=performance.getEntriesByName("hero-frame");for(let q of x)performance.clearMeasures(q.name);performance.measure("hero-frame","hero-begin","hero-end");let g=performance.getEntriesByName("hero-frame").pop();g&&(p=g.duration),performance.clearMarks("hero-begin"),performance.clearMarks("hero-end"),c+=1},D=()=>{s=0,!(!m||!u)&&(P(performance.now()),s=requestAnimationFrame(D))},M=()=>{!m||!l||s||(s=requestAnimationFrame(D))},R=()=>{m=!1,s&&(cancelAnimationFrame(s),s=0)},S=()=>{l&&(b=null,A=performance.now(),m=!0,M())},O=new IntersectionObserver(h=>{h.some(y=>y.isIntersecting)?S():R()},{threshold:.05});O.observe(t);let U=()=>{document.visibilityState==="hidden"?R():t.getBoundingClientRect().bottom>0&&t.getBoundingClientRect().top<window.innerHeight&&S()};document.addEventListener("visibilitychange",U);let H=new ResizeObserver(()=>{I(),M()});return H.observe(t),I(),l&&M(),{pause:R,resume:S,destroy:()=>{R(),O.disconnect(),H.disconnect(),document.removeEventListener("visibilitychange",U)},isLive:()=>l,getFrameId:()=>c,isPaused:()=>!m,getLastFrameMs:()=>p,getLastSimMs:()=>a,getLastDrawMs:()=>f,setTime:h=>{b=h,R(),P(performance.now())},getLoopTime:()=>Z(performance.now(),A,b),renderOnce:()=>P(performance.now()),getVisiblePointCount:()=>u?z(u):0}}async function G(){let t=document.querySelectorAll("[data-milume-hero]"),n=[];for(let e of t)n.push(await X(e));window.__milumeHeroHandles=n}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{G().catch(()=>{})}):G().catch(()=>{});window.__milumeHeroMount=G;})();
