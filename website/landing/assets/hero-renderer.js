"use strict";(()=>{var X={x:30,y:18},$=1e4;function fe(t,r){let e=Math.round(t/X.x*$),n=Math.round(r/X.y*$);return`${e},${n}`}function O(t,r){let e=new Set;for(let n=0;n<r;n++){let a=n*3,o=fe(t[a],t[a+1]);if(e.has(o))throw new Error(`hero field: duplicate normalized xy at instance ${n} (${o})`);e.add(o)}}async function q(t){let r=await fetch(t);if(!r.ok)throw new Error(`hero points: ${r.status}`);let e=await r.arrayBuffer(),n=new DataView(e),a=n.getUint32(0,!0),o=new Float32Array(a*3),u=new Uint8Array(a),i=new Float32Array(a),s=4;for(let l=0;l<a;l++){let c=l*3;o[c]=n.getFloat32(s,!0),s+=4,o[c+1]=n.getFloat32(s,!0),s+=4,o[c+2]=n.getFloat32(s,!0),s+=4,u[l]=n.getUint8(s),s+=1,i[l]=n.getFloat32(s,!0),s+=4}return O(o,a),{count:a,pos:o,cat:u,rad:i}}function E(t){let r=t/11%1,e=r*10%10;return{c:[.45*Math.sin(2*Math.PI*r),.25*Math.sin(4*Math.PI*r),e],roll:.0125*Math.cos(2*Math.PI*r)}}var de={id:"dark",backgroundHex:"#05100f",tealRampHex:["#0f766e","#14b8a6","#5eead4","#a5f3fc"],accentHex:"#f59e0b",saturation:.85,normalAlphaBlend:!1};var G=de;function D(t){let r=Number.parseInt(t.slice(1),16);return[(r>>16)/255,(r>>8&255)/255,(r&255)/255]}function K(t,r){let e=.2126*t[0]+.7152*t[1]+.0722*t[2];return[e+(t[0]-e)*r,e+(t[1]-e)*r,e+(t[2]-e)*r]}function J(t=G){let r=t.saturation,e=t.tealRampHex.map(n=>K(D(n),r));return e.push(K(D(t.accentHex),r)),{background:D(t.backgroundHex),slots:e}}function U([t,r,e]){return`vec3(${t.toFixed(6)}, ${r.toFixed(6)}, ${e.toFixed(6)})`}var V=.35,be=.15;function Q(){return be*900}function N(t,r){if(r<=0)return Number.POSITIVE_INFINITY;let e=900*t/r;return Math.max(e,V)}function pe(t,r,e,n,a=72){let o=0,u=Number.POSITIVE_INFINITY;for(let i=0;i<a;i++){let s=i/a*11,{c:l}=E(s),c=e-l[2];u=Math.min(u,c),c>0&&(o=Math.max(o,N(n,c)))}return{maxPr:o,minDepth:u}}function ee(t,r,e,n=72){let a=0,o=Number.POSITIVE_INFINITY;for(let u=0;u<e;u++){let i=u*3,s=pe(t[i],t[i+1],t[i+2],r[u],n);a=Math.max(a,s.maxPr),o=Math.min(o,s.minDepth)}return{maxPr:a,minDepth:o}}var W=J(G),Ae=U(W.background),xe=W.slots.map((t,r)=>`const vec3 SLOT${r} = ${U(t)};`).join(`
`),he=`#version 300 es
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
const vec3 BG = ${Ae};
${xe}

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
}`,Le=`#version 300 es
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
}`,ye=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]);function re(t){return t.count}function oe(t){let{maxPr:r}=ee(t.srcPos,t.srcRad,t.count);return r}function ne(){return Q()}function ae(t,r){let e=t.getContext("webgl2",{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!0});if(!e)return null;let n=te(e,e.VERTEX_SHADER,he),a=te(e,e.FRAGMENT_SHADER,Le);if(!n||!a)return null;let o=_e(e,n,a);if(!o)return null;let u=e.createBuffer(),i=e.createBuffer(),s=e.createBuffer(),l=e.createBuffer(),c=e.createVertexArray(),b=new Float32Array(r.count);for(let p=0;p<r.count;p++)b[p]=r.cat[p];e.bindVertexArray(c),e.bindBuffer(e.ARRAY_BUFFER,u),e.bufferData(e.ARRAY_BUFFER,ye,e.STATIC_DRAW);let x=e.getAttribLocation(o,"a_corner");e.enableVertexAttribArray(x),e.vertexAttribPointer(x,2,e.FLOAT,!1,0,0),e.vertexAttribDivisor(x,0),e.bindBuffer(e.ARRAY_BUFFER,i),e.bufferData(e.ARRAY_BUFFER,r.pos.byteLength,e.DYNAMIC_DRAW);let m=e.getAttribLocation(o,"i_pos");e.enableVertexAttribArray(m),e.vertexAttribPointer(m,3,e.FLOAT,!1,12,0),e.vertexAttribDivisor(m,1),e.bindBuffer(e.ARRAY_BUFFER,s),e.bufferData(e.ARRAY_BUFFER,b.byteLength,e.DYNAMIC_DRAW);let d=e.getAttribLocation(o,"i_cat");e.enableVertexAttribArray(d),e.vertexAttribPointer(d,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(d,1),e.bindBuffer(e.ARRAY_BUFFER,l),e.bufferData(e.ARRAY_BUFFER,r.rad.byteLength,e.DYNAMIC_DRAW);let f=e.getAttribLocation(o,"i_rad");e.enableVertexAttribArray(f),e.vertexAttribPointer(f,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(f,1),e.bindVertexArray(null),e.enable(e.BLEND);let A=new Uint32Array(r.count);for(let p=0;p<r.count;p++)A[p]=p;return{gl:e,program:o,vao:c,posBuf:i,catBuf:s,radBuf:l,count:r.count,srcPos:r.pos,srcCat:b,srcRad:r.rad,order:A,keys:new Float32Array(r.count),sortPos:new Float32Array(r.pos.length),sortCat:new Float32Array(r.count),sortRad:new Float32Array(r.count),uTime:e.getUniformLocation(o,"u_time"),uScale:e.getUniformLocation(o,"u_scale"),uLayout:e.getUniformLocation(o,"u_layout"),clearRgb:W.background}}function te(t,r,e){let n=t.createShader(r);return n?(t.shaderSource(n,e),t.compileShader(n),t.getShaderParameter(n,t.COMPILE_STATUS)?n:(console.error(t.getShaderInfoLog(n)),t.deleteShader(n),null)):null}function _e(t,r,e){let n=t.createProgram();return n?(t.attachShader(n,r),t.attachShader(n,e),t.linkProgram(n),t.getProgramParameter(n,t.LINK_STATUS)?n:(console.error(t.getProgramInfoLog(n)),t.deleteProgram(n),null)):null}function ge(t,r){let{srcPos:e,order:n,keys:a,count:o}=t,{c:u}=E(r),i=u[2];for(let m=0;m<o;m++)a[m]=e[m*3+2]-i;n.sort((m,d)=>a[d]-a[m]);let{sortPos:s,sortCat:l,sortRad:c,srcCat:b,srcRad:x}=t;for(let m=0;m<o;m++){let d=n[m],f=m*3,A=d*3;s[f]=e[A],s[f+1]=e[A+1],s[f+2]=e[A+2],l[m]=b[d],c[m]=x[d]}}function ie(t,r,e,n,a){let{gl:o,program:u,vao:i,posBuf:s,catBuf:l,radBuf:c,count:b,uTime:x,uScale:m,uLayout:d,clearRgb:f}=t;ge(t,r),o.bindBuffer(o.ARRAY_BUFFER,s),o.bufferSubData(o.ARRAY_BUFFER,0,t.sortPos),o.bindBuffer(o.ARRAY_BUFFER,l),o.bufferSubData(o.ARRAY_BUFFER,0,t.sortCat),o.bindBuffer(o.ARRAY_BUFFER,c),o.bufferSubData(o.ARRAY_BUFFER,0,t.sortRad),o.viewport(0,0,e,n),o.clearColor(f[0],f[1],f[2],1),o.clear(o.COLOR_BUFFER_BIT),o.useProgram(u),o.bindVertexArray(i),o.blendFunc(o.ONE,o.ONE_MINUS_SRC_ALPHA),x&&o.uniform1f(x,r),m&&o.uniform2f(m,e,n),d&&o.uniform4f(d,a.scale,a.offX,a.offY,a.dpr),o.drawArraysInstanced(o.TRIANGLES,0,6,b),o.bindVertexArray(null)}var se={logicalW:1600,logicalH:900};function Re(t,r,e,n,a=se,o=V){let{c:u,roll:i}=E(n),s=Math.cos(i),l=Math.sin(i),c=a.logicalW/2,b=a.logicalH/2,x=a.logicalW,m=a.logicalH,d=0;for(let f=0;f<e;f++){let A=f*3,p=t[A]-u[0],R=t[A+1]-u[1],g=t[A+2]-u[2];if(g<=0)continue;let w=p*s-R*l,T=p*l+R*s,I=c+900*w/g,F=b+900*T/g,L=N(r[f],g);I+L<0||I-L>x||F+L<0||F-L>m||L<o||d++}return d}function ce(t,r,e,n=24,a=se,o=Re){let u=[];for(let c=0;c<n;c++){let b=c/n*11;u.push(o(t,r,e,b,a))}let i=Math.min(...u),s=Math.max(...u),l=u.reduce((c,b)=>c+b,0)/u.length;return{min:i,max:s,mean:l,samples:u}}function Fe(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches}function ve(){return Math.min(2,window.devicePixelRatio||1)}function ue(t,r,e){if(e!==null)return e;let n=(t-r)/1e3;return n-Math.floor(n/11)*11}async function le(t){let r=t.getAttribute("data-assets-base")??"assets/",e=t.querySelector(".milume-hero__poster"),n=t.querySelector(".milume-hero__canvas");if(!e||!n)throw new Error("milume-hero: missing poster or canvas");e.hidden=!0,n.hidden=!0;let a=null,o=!1;try{a=await q(`${r}hero-points.bin`)}catch{o=!0}let i=!Fe()&&!o&&a?ae(n,a):null,s=!!i;s?(e.hidden=!0,n.hidden=!1,t.dataset.heroMode="webgl"):(e.hidden=!1,n.hidden=!0,t.dataset.heroMode="poster");let l=s,c=0,b=0,x=0,m=0,d=0,f=null,A=performance.now(),p=0,R=0,g={scale:1,offX:0,offY:0,dpr:1},w=()=>{let h=t.getBoundingClientRect(),v=ve();p=Math.max(1,Math.round(h.width*v)),R=Math.max(1,Math.round(h.height*v)),n.width=p,n.height=R,n.style.width=`${h.width}px`,n.style.height=`${h.height}px`;let P=h.width,B=h.height,S=Math.max(P/1600,B/900);g={scale:S,offX:(P-1600*S)/2,offY:(B-900*S)/2,dpr:v}},T=h=>{if(!i)return;performance.mark("hero-begin");let v=ue(h,A,f);m=0;let P=performance.now();ie(i,v,p,R,g),d=performance.now()-P,performance.mark("hero-end");let B=performance.getEntriesByName("hero-frame");for(let me of B)performance.clearMeasures(me.name);performance.measure("hero-frame","hero-begin","hero-end");let S=performance.getEntriesByName("hero-frame").pop();S&&(x=S.duration),performance.clearMarks("hero-begin"),performance.clearMarks("hero-end"),b+=1},I=()=>{c=0,!(!l||!i)&&(T(performance.now()),c=requestAnimationFrame(I))},F=()=>{!l||!s||c||(c=requestAnimationFrame(I))},L=()=>{l=!1,c&&(cancelAnimationFrame(c),c=0)},C=()=>{s&&(f=null,A=performance.now(),l=!0,F())},k=new IntersectionObserver(h=>{h.some(P=>P.isIntersecting)?C():L()},{threshold:.05});k.observe(t);let z=()=>{document.visibilityState==="hidden"?L():t.getBoundingClientRect().bottom>0&&t.getBoundingClientRect().top<window.innerHeight&&C()};document.addEventListener("visibilitychange",z);let j=new ResizeObserver(()=>{w(),F()});return j.observe(t),w(),s&&F(),{pause:L,resume:C,destroy:()=>{L(),k.disconnect(),j.disconnect(),document.removeEventListener("visibilitychange",z)},isLive:()=>s,getFrameId:()=>b,isPaused:()=>!l,getLastFrameMs:()=>x,getLastSimMs:()=>m,getLastDrawMs:()=>d,setTime:h=>{f=h,L(),T(performance.now())},getLoopTime:()=>ue(performance.now(),A,f),renderOnce:()=>T(performance.now()),getVisiblePointCount:()=>i?re(i):0,getMaxProjectedRadiusAcrossLoop:()=>i?oe(i):0,getMaxAllowedProjectedRadius:()=>ne(),getVisibleDiscStatsAcrossLoop:()=>i?ce(i.srcPos,i.srcRad,i.count,24):null,hasUniqueNormalizedXy:()=>{if(!i)return!1;try{return O(i.srcPos,i.count),!0}catch{return!1}}}}async function Y(){let t=document.querySelectorAll("[data-milume-hero]"),r=[];for(let e of t)r.push(await le(e));window.__milumeHeroHandles=r}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{Y().catch(()=>{})}):Y().catch(()=>{});window.__milumeHeroMount=Y;})();
