"use strict";(()=>{var D=[1,2,3,4,5];async function Z(t){let r=await fetch(t);if(!r.ok)throw new Error(`hero points: ${r.status}`);let e=await r.arrayBuffer(),n=new DataView(e),c=n.getUint32(0,!0),o=D.length,u=c*o,a=new Float32Array(c*3),l=new Uint8Array(c),d=new Float32Array(c),s=4;for(let i=0;i<c;i++){let p=n.getFloat32(s,!0);s+=4;let A=n.getFloat32(s,!0);s+=4;let R=n.getFloat32(s,!0);s+=4;let h=n.getUint8(s);s+=1;let F=n.getFloat32(s,!0);s+=4;let _=i*3;a[_]=p,a[_+1]=A,a[_+2]=R,l[i]=h,d[i]=F}let b=new Float32Array(u*3),x=new Uint8Array(u),m=new Float32Array(u),f=0;for(let i=0;i<c;i++){let p=i*3,A=a[p],R=a[p+1],h=a[p+2],F=l[i],_=d[i];for(let S of D){let y=f*3;b[y]=A,b[y+1]=R,b[y+2]=h+S*10,x[f]=F,m[f]=_,f++}}return{count:u,pos:b,cat:x,rad:m}}function M(t){let r=t/11%1,e=r*10%10;return{c:[.45*Math.sin(2*Math.PI*r),.25*Math.sin(4*Math.PI*r),e],roll:.0125*Math.cos(2*Math.PI*r)}}var le={id:"dark",backgroundHex:"#05100f",tealRampHex:["#0f766e","#14b8a6","#5eead4","#a5f3fc"],accentHex:"#f59e0b",saturation:.85,normalAlphaBlend:!1};var V=le;function G(t){let r=Number.parseInt(t.slice(1),16);return[(r>>16)/255,(r>>8&255)/255,(r&255)/255]}function X(t,r){let e=.2126*t[0]+.7152*t[1]+.0722*t[2];return[e+(t[0]-e)*r,e+(t[1]-e)*r,e+(t[2]-e)*r]}function q(t=V){let r=t.saturation,e=t.tealRampHex.map(n=>X(G(n),r));return e.push(X(G(t.accentHex),r)),{background:G(t.backgroundHex),slots:e}}function U([t,r,e]){return`vec3(${t.toFixed(6)}, ${r.toFixed(6)}, ${e.toFixed(6)})`}var W=.35,me=.15;function K(){return me*900}function N(t,r){if(r<=0)return Number.POSITIVE_INFINITY;let e=900*t/r;return Math.max(e,W)}function fe(t,r,e,n,c=72){let o=0,u=Number.POSITIVE_INFINITY;for(let a=0;a<c;a++){let l=a/c*11,{c:d}=M(l),s=e-d[2];u=Math.min(u,s),s>0&&(o=Math.max(o,N(n,s)))}return{maxPr:o,minDepth:u}}function J(t,r,e,n=72){let c=0,o=Number.POSITIVE_INFINITY;for(let u=0;u<e;u++){let a=u*3,l=fe(t[a],t[a+1],t[a+2],r[u],n);c=Math.max(c,l.maxPr),o=Math.min(o,l.minDepth)}return{maxPr:c,minDepth:o}}var Y=q(V),de=U(Y.background),be=Y.slots.map((t,r)=>`const vec3 SLOT${r} = ${U(t)};`).join(`
`),pe=`#version 300 es
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
const vec3 BG = ${de};
${be}

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
}`,Ae=`#version 300 es
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
}`,xe=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]);function ee(t){return t.count}function te(t){let{maxPr:r}=J(t.srcPos,t.srcRad,t.count);return r}function re(){return K()}function oe(t,r){let e=t.getContext("webgl2",{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!0});if(!e)return null;let n=Q(e,e.VERTEX_SHADER,pe),c=Q(e,e.FRAGMENT_SHADER,Ae);if(!n||!c)return null;let o=Le(e,n,c);if(!o)return null;let u=e.createBuffer(),a=e.createBuffer(),l=e.createBuffer(),d=e.createBuffer(),s=e.createVertexArray(),b=new Float32Array(r.count);for(let A=0;A<r.count;A++)b[A]=r.cat[A];e.bindVertexArray(s),e.bindBuffer(e.ARRAY_BUFFER,u),e.bufferData(e.ARRAY_BUFFER,xe,e.STATIC_DRAW);let x=e.getAttribLocation(o,"a_corner");e.enableVertexAttribArray(x),e.vertexAttribPointer(x,2,e.FLOAT,!1,0,0),e.vertexAttribDivisor(x,0),e.bindBuffer(e.ARRAY_BUFFER,a),e.bufferData(e.ARRAY_BUFFER,r.pos.byteLength,e.DYNAMIC_DRAW);let m=e.getAttribLocation(o,"i_pos");e.enableVertexAttribArray(m),e.vertexAttribPointer(m,3,e.FLOAT,!1,12,0),e.vertexAttribDivisor(m,1),e.bindBuffer(e.ARRAY_BUFFER,l),e.bufferData(e.ARRAY_BUFFER,b.byteLength,e.DYNAMIC_DRAW);let f=e.getAttribLocation(o,"i_cat");e.enableVertexAttribArray(f),e.vertexAttribPointer(f,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(f,1),e.bindBuffer(e.ARRAY_BUFFER,d),e.bufferData(e.ARRAY_BUFFER,r.rad.byteLength,e.DYNAMIC_DRAW);let i=e.getAttribLocation(o,"i_rad");e.enableVertexAttribArray(i),e.vertexAttribPointer(i,1,e.FLOAT,!1,4,0),e.vertexAttribDivisor(i,1),e.bindVertexArray(null),e.enable(e.BLEND);let p=new Uint32Array(r.count);for(let A=0;A<r.count;A++)p[A]=A;return{gl:e,program:o,vao:s,posBuf:a,catBuf:l,radBuf:d,count:r.count,srcPos:r.pos,srcCat:b,srcRad:r.rad,order:p,keys:new Float32Array(r.count),sortPos:new Float32Array(r.pos.length),sortCat:new Float32Array(r.count),sortRad:new Float32Array(r.count),uTime:e.getUniformLocation(o,"u_time"),uScale:e.getUniformLocation(o,"u_scale"),uLayout:e.getUniformLocation(o,"u_layout"),clearRgb:Y.background}}function Q(t,r,e){let n=t.createShader(r);return n?(t.shaderSource(n,e),t.compileShader(n),t.getShaderParameter(n,t.COMPILE_STATUS)?n:(console.error(t.getShaderInfoLog(n)),t.deleteShader(n),null)):null}function Le(t,r,e){let n=t.createProgram();return n?(t.attachShader(n,r),t.attachShader(n,e),t.linkProgram(n),t.getProgramParameter(n,t.LINK_STATUS)?n:(console.error(t.getProgramInfoLog(n)),t.deleteProgram(n),null)):null}function he(t,r){let{srcPos:e,order:n,keys:c,count:o}=t,{c:u}=M(r),a=u[2];for(let m=0;m<o;m++)c[m]=e[m*3+2]-a;n.sort((m,f)=>c[f]-c[m]);let{sortPos:l,sortCat:d,sortRad:s,srcCat:b,srcRad:x}=t;for(let m=0;m<o;m++){let f=n[m],i=m*3,p=f*3;l[i]=e[p],l[i+1]=e[p+1],l[i+2]=e[p+2],d[m]=b[f],s[m]=x[f]}}function ne(t,r,e,n,c){let{gl:o,program:u,vao:a,posBuf:l,catBuf:d,radBuf:s,count:b,uTime:x,uScale:m,uLayout:f,clearRgb:i}=t;he(t,r),o.bindBuffer(o.ARRAY_BUFFER,l),o.bufferSubData(o.ARRAY_BUFFER,0,t.sortPos),o.bindBuffer(o.ARRAY_BUFFER,d),o.bufferSubData(o.ARRAY_BUFFER,0,t.sortCat),o.bindBuffer(o.ARRAY_BUFFER,s),o.bufferSubData(o.ARRAY_BUFFER,0,t.sortRad),o.viewport(0,0,e,n),o.clearColor(i[0],i[1],i[2],1),o.clear(o.COLOR_BUFFER_BIT),o.useProgram(u),o.bindVertexArray(a),o.blendFunc(o.ONE,o.ONE_MINUS_SRC_ALPHA),x&&o.uniform1f(x,r),m&&o.uniform2f(m,e,n),f&&o.uniform4f(f,c.scale,c.offX,c.offY,c.dpr),o.drawArraysInstanced(o.TRIANGLES,0,6,b),o.bindVertexArray(null)}var ae={logicalW:1600,logicalH:900};function _e(t,r,e,n,c=ae,o=W){let{c:u,roll:a}=M(n),l=Math.cos(a),d=Math.sin(a),s=c.logicalW/2,b=c.logicalH/2,x=c.logicalW,m=c.logicalH,f=0;for(let i=0;i<e;i++){let p=i*3,A=t[p]-u[0],R=t[p+1]-u[1],h=t[p+2]-u[2];if(h<=0)continue;let F=A*l-R*d,_=A*d+R*l,S=s+900*F/h,y=b+900*_/h,g=N(r[i],h);S+g<0||S-g>x||y+g<0||y-g>m||g<o||f++}return f}function se(t,r,e,n=24,c=ae,o=_e){let u=[];for(let s=0;s<n;s++){let b=s/n*11;u.push(o(t,r,e,b,c))}let a=Math.min(...u),l=Math.max(...u),d=u.reduce((s,b)=>s+b,0)/u.length;return{min:a,max:l,mean:d,samples:u}}function ge(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches}function Re(){return Math.min(2,window.devicePixelRatio||1)}function ce(t,r,e){if(e!==null)return e;let n=(t-r)/1e3;return n-Math.floor(n/11)*11}async function ie(t){let r=t.getAttribute("data-assets-base")??"assets/",e=t.querySelector(".milume-hero__poster"),n=t.querySelector(".milume-hero__canvas");if(!e||!n)throw new Error("milume-hero: missing poster or canvas");e.hidden=!0,n.hidden=!0;let c=null,o=!1;try{c=await Z(`${r}hero-points.bin`)}catch{o=!0}let a=!ge()&&!o&&c?oe(n,c):null,l=!!a;l?(e.hidden=!0,n.hidden=!1,t.dataset.heroMode="webgl"):(e.hidden=!1,n.hidden=!0,t.dataset.heroMode="poster");let d=l,s=0,b=0,x=0,m=0,f=0,i=null,p=performance.now(),A=0,R=0,h={scale:1,offX:0,offY:0,dpr:1},F=()=>{let L=t.getBoundingClientRect(),E=Re();A=Math.max(1,Math.round(L.width*E)),R=Math.max(1,Math.round(L.height*E)),n.width=A,n.height=R,n.style.width=`${L.width}px`,n.style.height=`${L.height}px`;let T=L.width,O=L.height,I=Math.max(T/1600,O/900);h={scale:I,offX:(T-1600*I)/2,offY:(O-900*I)/2,dpr:E}},_=L=>{if(!a)return;performance.mark("hero-begin");let E=ce(L,p,i);m=0;let T=performance.now();ne(a,E,A,R,h),f=performance.now()-T,performance.mark("hero-end");let O=performance.getEntriesByName("hero-frame");for(let ue of O)performance.clearMeasures(ue.name);performance.measure("hero-frame","hero-begin","hero-end");let I=performance.getEntriesByName("hero-frame").pop();I&&(x=I.duration),performance.clearMarks("hero-begin"),performance.clearMarks("hero-end"),b+=1},S=()=>{s=0,!(!d||!a)&&(_(performance.now()),s=requestAnimationFrame(S))},y=()=>{!d||!l||s||(s=requestAnimationFrame(S))},g=()=>{d=!1,s&&(cancelAnimationFrame(s),s=0)},H=()=>{l&&(i=null,p=performance.now(),d=!0,y())},j=new IntersectionObserver(L=>{L.some(T=>T.isIntersecting)?H():g()},{threshold:.05});j.observe(t);let z=()=>{document.visibilityState==="hidden"?g():t.getBoundingClientRect().bottom>0&&t.getBoundingClientRect().top<window.innerHeight&&H()};document.addEventListener("visibilitychange",z);let $=new ResizeObserver(()=>{F(),y()});return $.observe(t),F(),l&&y(),{pause:g,resume:H,destroy:()=>{g(),j.disconnect(),$.disconnect(),document.removeEventListener("visibilitychange",z)},isLive:()=>l,getFrameId:()=>b,isPaused:()=>!d,getLastFrameMs:()=>x,getLastSimMs:()=>m,getLastDrawMs:()=>f,setTime:L=>{i=L,g(),_(performance.now())},getLoopTime:()=>ce(performance.now(),p,i),renderOnce:()=>_(performance.now()),getVisiblePointCount:()=>a?ee(a):0,getMaxProjectedRadiusAcrossLoop:()=>a?te(a):0,getMaxAllowedProjectedRadius:()=>re(),getVisibleDiscStatsAcrossLoop:()=>a?se(a.srcPos,a.srcRad,a.count,24):null}}async function k(){let t=document.querySelectorAll("[data-milume-hero]"),r=[];for(let e of t)r.push(await ie(e));window.__milumeHeroHandles=r}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{k().catch(()=>{})}):k().catch(()=>{});window.__milumeHeroMount=k;})();
