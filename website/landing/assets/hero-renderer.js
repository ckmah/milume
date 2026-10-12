"use strict";(()=>{var O=[1,2,3,4,5];async function N(t){let n=await fetch(t);if(!n.ok)throw new Error(`hero points: ${n.status}`);let e=await n.arrayBuffer(),o=new DataView(e),c=o.getUint32(0,!0),r=O.length,m=c*r,a=new Float32Array(c*3),l=new Uint8Array(c),d=new Float32Array(c),s=4;for(let u=0;u<c;u++){let b=o.getFloat32(s,!0);s+=4;let p=o.getFloat32(s,!0);s+=4;let x=o.getFloat32(s,!0);s+=4;let R=o.getUint8(s);s+=1;let y=o.getFloat32(s,!0);s+=4;let L=u*3;a[L]=b,a[L+1]=p,a[L+2]=x,l[u]=R,d[u]=y}let A=new Float32Array(m*3),h=new Uint8Array(m),i=new Float32Array(m),f=0;for(let u=0;u<c;u++){let b=u*3,p=a[b],x=a[b+1],R=a[b+2],y=l[u],L=d[u];for(let E of O){let _=f*3;A[_]=p,A[_+1]=x,A[_+2]=R+E*10,h[f]=y,i[f]=L,f++}}return{count:m,pos:A,cat:h,rad:i}}function S(t){let n=t/11%1,e=n*10%10;return{c:[.45*Math.sin(2*Math.PI*n),.25*Math.sin(4*Math.PI*n),e],roll:.0125*Math.cos(2*Math.PI*n)}}var ee=.35,te=.15;function W(){return te*900}function re(t,n){if(n<=0)return Number.POSITIVE_INFINITY;let e=900*t/n;return Math.max(e,ee)}function oe(t,n,e,o,c=72){let r=0,m=Number.POSITIVE_INFINITY;for(let a=0;a<c;a++){let l=a/c*11,{c:d}=S(l),s=e-d[2];m=Math.min(m,s),s>0&&(r=Math.max(r,re(o,s)))}return{maxPr:r,minDepth:m}}function V(t,n,e,o=72){let c=0,r=Number.POSITIVE_INFINITY;for(let m=0;m<e;m++){let a=m*3,l=oe(t[a],t[a+1],t[a+2],n[m],o);c=Math.max(c,l.maxPr),r=Math.min(r,l.minDepth)}return{maxPr:c,minDepth:r}}var ne=`#version 300 es
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
  float z = d.z;
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
}`,ae=`#version 300 es
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
}`,ce=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]);function z(t){return t.count}function k(t){let{maxPr:n}=V(t.srcPos,t.srcRad,t.count);return n}function Z(){return W()}function X(t,n){let e=t.getContext("webgl2",{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!0});if(!e)return null;let o=j(e,e.VERTEX_SHADER,ne),c=j(e,e.FRAGMENT_SHADER,ae);if(!o||!c)return null;let r=se(e,o,c);if(!r)return null;let m=e.createBuffer(),a=e.createBuffer(),l=e.createBuffer(),d=e.createBuffer(),s=e.createVertexArray(),A=new Float32Array(n.count);for(let p=0;p<n.count;p++)A[p]=n.cat[p];e.bindVertexArray(s),e.bindBuffer(e.ARRAY_BUFFER,m),e.bufferData(e.ARRAY_BUFFER,ce,e.STATIC_DRAW);let h=e.getAttribLocation(r,"a_corner");e.enableVertexAttribArray(h),e.vertexAttribPointer(h,2,e.FLOAT,!1,0,0),e.vertexAttribDivisor(h,0),e.bindBuffer(e.ARRAY_BUFFER,a),e.bufferData(e.ARRAY_BUFFER,n.pos.byteLength,e.DYNAMIC_DRAW);let i=e.getAttribLocation(r,"i_pos");e.enableVertexAttribArray(i),e.vertexAttribPointer(i,3,e.FLOAT,!1,12,0),e.vertexAttribDivisor(i,1),e.bindBuffer(e.ARRAY_BUFFER,l),e.bufferData(e.ARRAY_BUFFER,A.byteLength,e.DYNAMIC_DRAW);let f=e.getAttribLocation(r,"i_cat");e.enableVertexAttribArray(f),e.vertexAttribPointer(f,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(f,1),e.bindBuffer(e.ARRAY_BUFFER,d),e.bufferData(e.ARRAY_BUFFER,n.rad.byteLength,e.DYNAMIC_DRAW);let u=e.getAttribLocation(r,"i_rad");e.enableVertexAttribArray(u),e.vertexAttribPointer(u,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(u,1),e.bindVertexArray(null),e.enable(e.BLEND);let b=new Uint32Array(n.count);for(let p=0;p<n.count;p++)b[p]=p;return{gl:e,program:r,vao:s,posBuf:a,catBuf:l,radBuf:d,count:n.count,srcPos:n.pos,srcCat:A,srcRad:n.rad,order:b,keys:new Float32Array(n.count),sortPos:new Float32Array(n.pos.length),sortCat:new Float32Array(n.count),sortRad:new Float32Array(n.count),uTime:e.getUniformLocation(r,"u_time"),uScale:e.getUniformLocation(r,"u_scale"),uLayout:e.getUniformLocation(r,"u_layout")}}function j(t,n,e){let o=t.createShader(n);return o?(t.shaderSource(o,e),t.compileShader(o),t.getShaderParameter(o,t.COMPILE_STATUS)?o:(console.error(t.getShaderInfoLog(o)),t.deleteShader(o),null)):null}function se(t,n,e){let o=t.createProgram();return o?(t.attachShader(o,n),t.attachShader(o,e),t.linkProgram(o),t.getProgramParameter(o,t.LINK_STATUS)?o:(console.error(t.getProgramInfoLog(o)),t.deleteProgram(o),null)):null}function ie(t,n){let{srcPos:e,order:o,keys:c,count:r}=t,{c:m}=S(n),a=m[2];for(let i=0;i<r;i++)c[i]=e[i*3+2]-a;o.sort((i,f)=>c[f]-c[i]);let{sortPos:l,sortCat:d,sortRad:s,srcCat:A,srcRad:h}=t;for(let i=0;i<r;i++){let f=o[i],u=i*3,b=f*3;l[u]=e[b],l[u+1]=e[b+1],l[u+2]=e[b+2],d[i]=A[f],s[i]=h[f]}}function q(t,n,e,o,c){let{gl:r,program:m,vao:a,posBuf:l,catBuf:d,radBuf:s,count:A,uTime:h,uScale:i,uLayout:f}=t;ie(t,n),r.bindBuffer(r.ARRAY_BUFFER,l),r.bufferSubData(r.ARRAY_BUFFER,0,t.sortPos),r.bindBuffer(r.ARRAY_BUFFER,d),r.bufferSubData(r.ARRAY_BUFFER,0,t.sortCat),r.bindBuffer(r.ARRAY_BUFFER,s),r.bufferSubData(r.ARRAY_BUFFER,0,t.sortRad),r.viewport(0,0,e,o),r.clearColor(11/255,11/255,11/255,1),r.clear(r.COLOR_BUFFER_BIT),r.useProgram(m),r.bindVertexArray(a),r.blendFunc(r.ONE,r.ONE_MINUS_SRC_ALPHA),h&&r.uniform1f(h,n),i&&r.uniform2f(i,e,o),f&&r.uniform4f(f,c.scale,c.offX,c.offY,c.dpr),r.drawArraysInstanced(r.TRIANGLES,0,6,A),r.bindVertexArray(null)}function ue(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches}function le(){return Math.min(2,window.devicePixelRatio||1)}function $(t,n,e){if(e!==null)return e;let o=(t-n)/1e3;return o-Math.floor(o/11)*11}async function J(t){let n=t.getAttribute("data-assets-base")??"assets/",e=t.querySelector(".milume-hero__poster"),o=t.querySelector(".milume-hero__canvas");if(!e||!o)throw new Error("milume-hero: missing poster or canvas");e.hidden=!0,o.hidden=!0;let c=null,r=!1;try{c=await N(`${n}hero-points.bin`)}catch{r=!0}let a=!ue()&&!r&&c?X(o,c):null,l=!!a;l?(e.hidden=!0,o.hidden=!1,t.dataset.heroMode="webgl"):(e.hidden=!1,o.hidden=!0,t.dataset.heroMode="poster");let d=l,s=0,A=0,h=0,i=0,f=0,u=null,b=performance.now(),p=0,x=0,R={scale:1,offX:0,offY:0,dpr:1},y=()=>{let v=t.getBoundingClientRect(),F=le();p=Math.max(1,Math.round(v.width*F)),x=Math.max(1,Math.round(v.height*F)),o.width=p,o.height=x,o.style.width=`${v.width}px`,o.style.height=`${v.height}px`;let g=v.width,I=v.height,P=Math.max(g/1600,I/900);R={scale:P,offX:(g-1600*P)/2,offY:(I-900*P)/2,dpr:F}},L=v=>{if(!a)return;performance.mark("hero-begin");let F=$(v,b,u);i=0;let g=performance.now();q(a,F,p,x,R),f=performance.now()-g,performance.mark("hero-end");let I=performance.getEntriesByName("hero-frame");for(let K of I)performance.clearMeasures(K.name);performance.measure("hero-frame","hero-begin","hero-end");let P=performance.getEntriesByName("hero-frame").pop();P&&(h=P.duration),performance.clearMarks("hero-begin"),performance.clearMarks("hero-end"),A+=1},E=()=>{s=0,!(!d||!a)&&(L(performance.now()),s=requestAnimationFrame(E))},_=()=>{!d||!l||s||(s=requestAnimationFrame(E))},B=()=>{d=!1,s&&(cancelAnimationFrame(s),s=0)},G=()=>{l&&(u=null,b=performance.now(),d=!0,_())},U=new IntersectionObserver(v=>{v.some(g=>g.isIntersecting)?G():B()},{threshold:.05});U.observe(t);let H=()=>{document.visibilityState==="hidden"?B():t.getBoundingClientRect().bottom>0&&t.getBoundingClientRect().top<window.innerHeight&&G()};document.addEventListener("visibilitychange",H);let Y=new ResizeObserver(()=>{y(),_()});return Y.observe(t),y(),l&&_(),{pause:B,resume:G,destroy:()=>{B(),U.disconnect(),Y.disconnect(),document.removeEventListener("visibilitychange",H)},isLive:()=>l,getFrameId:()=>A,isPaused:()=>!d,getLastFrameMs:()=>h,getLastSimMs:()=>i,getLastDrawMs:()=>f,setTime:v=>{u=v,B(),L(performance.now())},getLoopTime:()=>$(performance.now(),b,u),renderOnce:()=>L(performance.now()),getVisiblePointCount:()=>a?z(a):0,getMaxProjectedRadiusAcrossLoop:()=>a?k(a):0,getMaxAllowedProjectedRadius:()=>Z()}}async function D(){let t=document.querySelectorAll("[data-milume-hero]"),n=[];for(let e of t)n.push(await J(e));window.__milumeHeroHandles=n}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{D().catch(()=>{})}):D().catch(()=>{});window.__milumeHeroMount=D;})();
