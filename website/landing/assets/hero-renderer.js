"use strict";(()=>{var H=[1,2,3,4,5];async function j(t){let r=await fetch(t);if(!r.ok)throw new Error(`hero points: ${r.status}`);let e=await r.arrayBuffer(),n=new DataView(e),c=n.getUint32(0,!0),o=H.length,m=c*o,a=new Float32Array(c*3),l=new Uint8Array(c),d=new Float32Array(c),s=4;for(let i=0;i<c;i++){let p=n.getFloat32(s,!0);s+=4;let b=n.getFloat32(s,!0);s+=4;let _=n.getFloat32(s,!0);s+=4;let g=n.getUint8(s);s+=1;let y=n.getFloat32(s,!0);s+=4;let L=i*3;a[L]=p,a[L+1]=b,a[L+2]=_,l[i]=g,d[i]=y}let A=new Float32Array(m*3),x=new Uint8Array(m),u=new Float32Array(m),f=0;for(let i=0;i<c;i++){let p=i*3,b=a[p],_=a[p+1],g=a[p+2],y=l[i],L=d[i];for(let B of H){let R=f*3;A[R]=b,A[R+1]=_,A[R+2]=g+B*10,x[f]=y,u[f]=L,f++}}return{count:m,pos:A,cat:x,rad:u}}function M(t){let r=t/11%1,e=r*10%10;return{c:[.45*Math.sin(2*Math.PI*r),.25*Math.sin(4*Math.PI*r),e],roll:.0125*Math.cos(2*Math.PI*r)}}var ae={id:"dark",backgroundHex:"#05100f",tealRampHex:["#0f766e","#14b8a6","#5eead4","#a5f3fc"],accentHex:"#f59e0b",saturation:.85,normalAlphaBlend:!1};var D=ae;function G(t){let r=Number.parseInt(t.slice(1),16);return[(r>>16)/255,(r>>8&255)/255,(r&255)/255]}function z(t,r){let e=.2126*t[0]+.7152*t[1]+.0722*t[2];return[e+(t[0]-e)*r,e+(t[1]-e)*r,e+(t[2]-e)*r]}function $(t=D){let r=t.saturation,e=t.tealRampHex.map(n=>z(G(n),r));return e.push(z(G(t.accentHex),r)),{background:G(t.backgroundHex),slots:e}}function U([t,r,e]){return`vec3(${t.toFixed(6)}, ${r.toFixed(6)}, ${e.toFixed(6)})`}var se=.35,ie=.15;function Z(){return ie*900}function ue(t,r){if(r<=0)return Number.POSITIVE_INFINITY;let e=900*t/r;return Math.max(e,se)}function le(t,r,e,n,c=72){let o=0,m=Number.POSITIVE_INFINITY;for(let a=0;a<c;a++){let l=a/c*11,{c:d}=M(l),s=e-d[2];m=Math.min(m,s),s>0&&(o=Math.max(o,ue(n,s)))}return{maxPr:o,minDepth:m}}function X(t,r,e,n=72){let c=0,o=Number.POSITIVE_INFINITY;for(let m=0;m<e;m++){let a=m*3,l=le(t[a],t[a+1],t[a+2],r[m],n);c=Math.max(c,l.maxPr),o=Math.min(o,l.minDepth)}return{maxPr:c,minDepth:o}}var N=$(D),me=U(N.background),fe=N.slots.map((t,r)=>`const vec3 SLOT${r} = ${U(t)};`).join(`
`),de=`#version 300 es
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
const vec3 BG = ${me};
${fe}

vec3 pointCol(float c) {
  int i = int(c + 0.5);
  if (i == 0) return SLOT0;
  if (i == 1) return SLOT1;
  if (i == 2) return SLOT2;
  if (i == 3) return SLOT3;
  return SLOT4;
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

  vec3 rgb = clamp(pointCol(i_cat), 0.0, 1.0);
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
}`,be=`#version 300 es
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
}`,pe=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]);function K(t){return t.count}function J(t){let{maxPr:r}=X(t.srcPos,t.srcRad,t.count);return r}function Q(){return Z()}function ee(t,r){let e=t.getContext("webgl2",{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!0});if(!e)return null;let n=q(e,e.VERTEX_SHADER,de),c=q(e,e.FRAGMENT_SHADER,be);if(!n||!c)return null;let o=Ae(e,n,c);if(!o)return null;let m=e.createBuffer(),a=e.createBuffer(),l=e.createBuffer(),d=e.createBuffer(),s=e.createVertexArray(),A=new Float32Array(r.count);for(let b=0;b<r.count;b++)A[b]=r.cat[b];e.bindVertexArray(s),e.bindBuffer(e.ARRAY_BUFFER,m),e.bufferData(e.ARRAY_BUFFER,pe,e.STATIC_DRAW);let x=e.getAttribLocation(o,"a_corner");e.enableVertexAttribArray(x),e.vertexAttribPointer(x,2,e.FLOAT,!1,0,0),e.vertexAttribDivisor(x,0),e.bindBuffer(e.ARRAY_BUFFER,a),e.bufferData(e.ARRAY_BUFFER,r.pos.byteLength,e.DYNAMIC_DRAW);let u=e.getAttribLocation(o,"i_pos");e.enableVertexAttribArray(u),e.vertexAttribPointer(u,3,e.FLOAT,!1,12,0),e.vertexAttribDivisor(u,1),e.bindBuffer(e.ARRAY_BUFFER,l),e.bufferData(e.ARRAY_BUFFER,A.byteLength,e.DYNAMIC_DRAW);let f=e.getAttribLocation(o,"i_cat");e.enableVertexAttribArray(f),e.vertexAttribPointer(f,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(f,1),e.bindBuffer(e.ARRAY_BUFFER,d),e.bufferData(e.ARRAY_BUFFER,r.rad.byteLength,e.DYNAMIC_DRAW);let i=e.getAttribLocation(o,"i_rad");e.enableVertexAttribArray(i),e.vertexAttribPointer(i,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(i,1),e.bindVertexArray(null),e.enable(e.BLEND);let p=new Uint32Array(r.count);for(let b=0;b<r.count;b++)p[b]=b;return{gl:e,program:o,vao:s,posBuf:a,catBuf:l,radBuf:d,count:r.count,srcPos:r.pos,srcCat:A,srcRad:r.rad,order:p,keys:new Float32Array(r.count),sortPos:new Float32Array(r.pos.length),sortCat:new Float32Array(r.count),sortRad:new Float32Array(r.count),uTime:e.getUniformLocation(o,"u_time"),uScale:e.getUniformLocation(o,"u_scale"),uLayout:e.getUniformLocation(o,"u_layout"),clearRgb:N.background}}function q(t,r,e){let n=t.createShader(r);return n?(t.shaderSource(n,e),t.compileShader(n),t.getShaderParameter(n,t.COMPILE_STATUS)?n:(console.error(t.getShaderInfoLog(n)),t.deleteShader(n),null)):null}function Ae(t,r,e){let n=t.createProgram();return n?(t.attachShader(n,r),t.attachShader(n,e),t.linkProgram(n),t.getProgramParameter(n,t.LINK_STATUS)?n:(console.error(t.getProgramInfoLog(n)),t.deleteProgram(n),null)):null}function xe(t,r){let{srcPos:e,order:n,keys:c,count:o}=t,{c:m}=M(r),a=m[2];for(let u=0;u<o;u++)c[u]=e[u*3+2]-a;n.sort((u,f)=>c[f]-c[u]);let{sortPos:l,sortCat:d,sortRad:s,srcCat:A,srcRad:x}=t;for(let u=0;u<o;u++){let f=n[u],i=u*3,p=f*3;l[i]=e[p],l[i+1]=e[p+1],l[i+2]=e[p+2],d[u]=A[f],s[u]=x[f]}}function te(t,r,e,n,c){let{gl:o,program:m,vao:a,posBuf:l,catBuf:d,radBuf:s,count:A,uTime:x,uScale:u,uLayout:f,clearRgb:i}=t;xe(t,r),o.bindBuffer(o.ARRAY_BUFFER,l),o.bufferSubData(o.ARRAY_BUFFER,0,t.sortPos),o.bindBuffer(o.ARRAY_BUFFER,d),o.bufferSubData(o.ARRAY_BUFFER,0,t.sortCat),o.bindBuffer(o.ARRAY_BUFFER,s),o.bufferSubData(o.ARRAY_BUFFER,0,t.sortRad),o.viewport(0,0,e,n),o.clearColor(i[0],i[1],i[2],1),o.clear(o.COLOR_BUFFER_BIT),o.useProgram(m),o.bindVertexArray(a),o.blendFunc(o.ONE,o.ONE_MINUS_SRC_ALPHA),x&&o.uniform1f(x,r),u&&o.uniform2f(u,e,n),f&&o.uniform4f(f,c.scale,c.offX,c.offY,c.dpr),o.drawArraysInstanced(o.TRIANGLES,0,6,A),o.bindVertexArray(null)}function he(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches}function Le(){return Math.min(2,window.devicePixelRatio||1)}function re(t,r,e){if(e!==null)return e;let n=(t-r)/1e3;return n-Math.floor(n/11)*11}async function oe(t){let r=t.getAttribute("data-assets-base")??"assets/",e=t.querySelector(".milume-hero__poster"),n=t.querySelector(".milume-hero__canvas");if(!e||!n)throw new Error("milume-hero: missing poster or canvas");e.hidden=!0,n.hidden=!0;let c=null,o=!1;try{c=await j(`${r}hero-points.bin`)}catch{o=!0}let a=!he()&&!o&&c?ee(n,c):null,l=!!a;l?(e.hidden=!0,n.hidden=!1,t.dataset.heroMode="webgl"):(e.hidden=!1,n.hidden=!0,t.dataset.heroMode="poster");let d=l,s=0,A=0,x=0,u=0,f=0,i=null,p=performance.now(),b=0,_=0,g={scale:1,offX:0,offY:0,dpr:1},y=()=>{let h=t.getBoundingClientRect(),F=Le();b=Math.max(1,Math.round(h.width*F)),_=Math.max(1,Math.round(h.height*F)),n.width=b,n.height=_,n.style.width=`${h.width}px`,n.style.height=`${h.height}px`;let v=h.width,w=h.height,P=Math.max(v/1600,w/900);g={scale:P,offX:(v-1600*P)/2,offY:(w-900*P)/2,dpr:F}},L=h=>{if(!a)return;performance.mark("hero-begin");let F=re(h,p,i);u=0;let v=performance.now();te(a,F,b,_,g),f=performance.now()-v,performance.mark("hero-end");let w=performance.getEntriesByName("hero-frame");for(let ne of w)performance.clearMeasures(ne.name);performance.measure("hero-frame","hero-begin","hero-end");let P=performance.getEntriesByName("hero-frame").pop();P&&(x=P.duration),performance.clearMarks("hero-begin"),performance.clearMarks("hero-end"),A+=1},B=()=>{s=0,!(!d||!a)&&(L(performance.now()),s=requestAnimationFrame(B))},R=()=>{!d||!l||s||(s=requestAnimationFrame(B))},T=()=>{d=!1,s&&(cancelAnimationFrame(s),s=0)},C=()=>{l&&(i=null,p=performance.now(),d=!0,R())},k=new IntersectionObserver(h=>{h.some(v=>v.isIntersecting)?C():T()},{threshold:.05});k.observe(t);let V=()=>{document.visibilityState==="hidden"?T():t.getBoundingClientRect().bottom>0&&t.getBoundingClientRect().top<window.innerHeight&&C()};document.addEventListener("visibilitychange",V);let W=new ResizeObserver(()=>{y(),R()});return W.observe(t),y(),l&&R(),{pause:T,resume:C,destroy:()=>{T(),k.disconnect(),W.disconnect(),document.removeEventListener("visibilitychange",V)},isLive:()=>l,getFrameId:()=>A,isPaused:()=>!d,getLastFrameMs:()=>x,getLastSimMs:()=>u,getLastDrawMs:()=>f,setTime:h=>{i=h,T(),L(performance.now())},getLoopTime:()=>re(performance.now(),p,i),renderOnce:()=>L(performance.now()),getVisiblePointCount:()=>a?K(a):0,getMaxProjectedRadiusAcrossLoop:()=>a?J(a):0,getMaxAllowedProjectedRadius:()=>Q()}}async function Y(){let t=document.querySelectorAll("[data-milume-hero]"),r=[];for(let e of t)r.push(await oe(e));window.__milumeHeroHandles=r}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{Y().catch(()=>{})}):Y().catch(()=>{});window.__milumeHeroMount=Y;})();
