"use strict";(()=>{var H=[11,11,11],C=[45,212,191],W=[[244,114,182],[96,165,250],[251,191,36],[167,139,250]],G=[.6,-.3,13],N=.5,k=3,q=22,z=30,X=[-1,0,1,2,3,4];async function $(t){let r=await fetch(t);if(!r.ok)throw new Error(`hero points: ${r.status}`);let e=await r.arrayBuffer(),o=new DataView(e),i=o.getUint32(0,!0),a=[],n=4;for(let u=0;u<i;u++){let f=o.getFloat32(n,!0);n+=4;let s=o.getFloat32(n,!0);n+=4;let l=o.getFloat32(n,!0);n+=4;let h=o.getUint8(n);n+=1;let d=o.getFloat32(n,!0);n+=4,a.push({x:f,y:s,z:l,cat:h,rad:d})}let m=[];for(let u of X){let f=u*10;for(let s of a)m.push({x:s.x,y:s.y,z:s.z+f,cat:s.cat,rad:s.rad})}return m}var me=`#version 300 es
in vec2 a_pos;
in float a_size;
in vec4 a_color;
uniform vec2 u_scale;
out vec4 v_color;
void main() {
  vec2 clip = (a_pos / u_scale) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}`,fe=`#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  if (d > 0.5) discard;
  float edge = smoothstep(0.5, 0.22, d);
  outColor = vec4(v_color.rgb, v_color.a * edge);
}`,de=`
attribute vec2 a_pos;
attribute float a_size;
attribute vec4 a_color;
uniform vec2 u_scale;
varying vec4 v_color;
void main() {
  vec2 clip = (a_pos / u_scale) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}`,pe=`
precision mediump float;
varying vec4 v_color;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  if (d > 0.5) discard;
  float edge = smoothstep(0.5, 0.22, d);
  gl_FragColor = vec4(v_color.rgb, v_color.a * edge);
}`;function J(t){let e=t.getContext("webgl2",{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!0})??t.getContext("webgl",{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!0});if(!e)return null;let o=e instanceof WebGL2RenderingContext,i=K(e,e.VERTEX_SHADER,o?me:de),a=K(e,e.FRAGMENT_SHADER,o?fe:pe);if(!i||!a)return null;let n=be(e,i,a);if(!n)return null;let m=e.createBuffer();if(!m)return null;e.useProgram(n);let u=e.getAttribLocation(n,"a_pos"),f=e.getAttribLocation(n,"a_size"),s=e.getAttribLocation(n,"a_color");e.bindBuffer(e.ARRAY_BUFFER,m);let l=28;e.enableVertexAttribArray(u),e.vertexAttribPointer(u,2,e.FLOAT,!1,l,0),e.enableVertexAttribArray(f),e.vertexAttribPointer(f,1,e.FLOAT,!1,l,8),e.enableVertexAttribArray(s),e.vertexAttribPointer(s,4,e.FLOAT,!1,l,12);let h=e.getParameter(e.ALIASED_POINT_SIZE_RANGE),d=h?h[1]:64;return e.enable(e.BLEND),e.blendFunc(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA),{gl:e,program:n,buf:m,uScale:e.getUniformLocation(n,"u_scale"),maxPoint:d,isWebGL2:o}}function K(t,r,e){let o=t.createShader(r);return o?(t.shaderSource(o,e),t.compileShader(o),t.getShaderParameter(o,t.COMPILE_STATUS)?o:(t.deleteShader(o),null)):null}function be(t,r,e){let o=t.createProgram();return o?(t.attachShader(o,r),t.attachShader(o,e),t.linkProgram(o),t.getProgramParameter(o,t.LINK_STATUS)?o:(t.deleteProgram(o),null)):null}var L=new Float32Array(2e4*7);function j(t,r,e,o,i,a,n,m){return L[t++]=r,L[t++]=e,L[t++]=o,L[t++]=i,L[t++]=a,L[t++]=n,L[t++]=m,t}function Q(t,r,e,o,i,a){let{gl:n,program:m,buf:u,uScale:f,maxPoint:s}=t,l=0,h=0;for(let c of r){if(h>=2e4)break;let p=Math.min(s,Math.max(1,c.rad*2*i*a.scale)),_=c.alpha*Math.min(1,(c.rad0/Math.max(1,c.rad))**2),A=(c.sx*a.scale+a.offX)*i,b=(c.sy*a.scale+a.offY)*i;l=j(l,A,b,p,c.cr/255,c.cg/255,c.cb/255,_),h++}n.viewport(0,0,e,o),n.clearColor(11/255,11/255,11/255,1),n.clear(n.COLOR_BUFFER_BIT),n.useProgram(m),f&&n.uniform2f(f,e,o),n.bindBuffer(n.ARRAY_BUFFER,u),n.bufferData(n.ARRAY_BUFFER,L.subarray(0,l),n.DYNAMIC_DRAW),n.drawArrays(n.POINTS,0,h);let d=0,x=l;for(let c of r){if(c.glow<.2)continue;if(d>=4e3)break;let p=Math.min(s,Math.max(1,c.rad0*3.6*i*a.scale)),_=c.glow*c.alpha*.25,A=(c.sx*a.scale+a.offX)*i,b=(c.sy*a.scale+a.offY)*i;x=j(x,A,b,p,45/255*_,212/255*_,191/255*_,_),d++}d>0&&(n.blendFunc(n.SRC_ALPHA,n.ONE),n.bufferData(n.ARRAY_BUFFER,L.subarray(l,x),n.DYNAMIC_DRAW),n.drawArrays(n.POINTS,0,d),n.blendFunc(n.SRC_ALPHA,n.ONE_MINUS_SRC_ALPHA))}function S(t,r,e){let o=Math.max(0,Math.min(1,(e-t)/(r-t)));return o*o*(3-2*o)}function ee(t){let r=t/11%1,e=r*10%10;return{c:[.45*Math.sin(2*Math.PI*r),.25*Math.sin(4*Math.PI*r),e],roll:.0125*Math.cos(2*Math.PI*r)}}function te(t){if(t<.6||t>9.6)return null;let r=t-.6,e=S(0,1,r)*(1-S(6,9,r));return{s:r,a:e}}function ne(t,r){let e=t[0]-r[0],o=t[1]-r[1],i=t[2]-r[2];return Math.hypot(e,o,i)}function oe(t,r,e){let o=t[0],i=t[1],a=t[2],n=r;return o=o*(1-.08*n)+C[0]*.08*n,i=i*(1-.08*n)+C[1]*.08*n,a=a*(1-.08*n)+C[2]*.08*n,o=o*(1-e)+C[0]*e,i=i*(1-e)+C[1]*e,a=a*(1-e)+C[2]*e,[o,i,a]}function re(t,r,e){let o=11;return e&&(o=11+e.a*(G[2]-r-11)),o}var B=[];function se(t,r){let{c:e,roll:o}=ee(r),i=Math.cos(o),a=Math.sin(o),n=te(r),m=re(r,e[2],n);B.length=0;let u=1600/2,f=900/2;for(let s of t){let l=s.z-e[2];if(l<=N||l>=z)continue;let h=s.x-e[0],d=s.y-e[1],x=h*i-d*a,c=h*a+d*i,p=l,_=u+900*x/p,A=f+900*c/p,b=900*s.rad/p,v=0,y=W[s.cat]??W[0],M=[y[0],y[1],y[2]];if(n){let ie=[s.x,s.y,s.z],D=ne(ie,G),ce=.85*Math.exp(-Math.pow(D/3,2))*S(0,1,n.s),le=Math.exp(-Math.pow((D-2.5-n.s*1.4)/2,2))*S(.3,1.3,n.s);v=Math.min(1,Math.max(0,ce+.4*le))*n.a;let ue=Math.min(1,Math.max(0,(2.5+n.s*1.4-D)/2*n.a));M=oe(M,ue,v)}let F=Math.pow(Math.max(0,Math.min(1,1-(p-1)/(z-1))),1.8),P=Math.max(F*.9,v*Math.min(.95,F*3)),g=M[0]*P+H[0]*(1-P),w=M[1]*P+H[1]*(1-P),R=M[2]*P+H[2]*(1-P),E=S(N,k,p)*(1-S(q,z,p)),Y=Math.min(40,40*Math.abs(1/p-1/m)*m);b<.35||E<.01||_<-b||_>1600+b||A<-b||A>900+b||B.push({sx:_,sy:A,z:p,rad:b*(1+Y*.04),rad0:b,cr:g,cg:w,cb:R,alpha:E,glow:v,coc:Y})}return B.sort((s,l)=>l.z-s.z),B}function he(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches}function _e(){return Math.min(2,window.devicePixelRatio||1)}async function ae(t){let r=t.getAttribute("data-assets-base")??"assets/",e=t.querySelector(".milume-hero__poster"),o=t.querySelector(".milume-hero__canvas");if(!e||!o)throw new Error("milume-hero: missing poster or canvas");let i=null,a=!1;try{i=await $(`${r}hero-points.bin`)}catch{a=!0}let m=he()||a?null:J(o),u=!!(m&&i);u?(e.hidden=!0,o.hidden=!1,t.dataset.heroMode="webgl"):(e.hidden=!1,o.hidden=!0,t.dataset.heroMode="poster");let f=u,s=0,l=0,h=performance.now(),d=0,x=0,c=1,p={scale:1,offX:0,offY:0},_=()=>{let g=t.getBoundingClientRect();c=_e(),d=Math.max(1,Math.round(g.width*c)),x=Math.max(1,Math.round(g.height*c)),o.width=d,o.height=x,o.style.width=`${g.width}px`,o.style.height=`${g.height}px`;let w=g.width,R=g.height,E=Math.max(w/1600,R/900);p={scale:E,offX:(w-1600*E)/2,offY:(R-900*E)/2}},A=()=>{if(s=0,!f||!m||!i)return;let g=(performance.now()-h)/1e3%11,w=se(i,g);Q(m,w,d,x,c,p),l+=1,s=requestAnimationFrame(A)},b=()=>{!f||!u||s||(s=requestAnimationFrame(A))},v=()=>{f=!1,s&&(cancelAnimationFrame(s),s=0)},y=()=>{u&&(f=!0,b())},M=new IntersectionObserver(g=>{g.some(R=>R.isIntersecting)?y():v()},{threshold:.05});M.observe(t);let F=()=>{document.visibilityState==="hidden"?v():t.getBoundingClientRect().bottom>0&&t.getBoundingClientRect().top<window.innerHeight&&y()};document.addEventListener("visibilitychange",F);let P=new ResizeObserver(()=>{_(),b()});return P.observe(t),_(),u&&b(),{pause:v,resume:y,destroy:()=>{v(),M.disconnect(),P.disconnect(),document.removeEventListener("visibilitychange",F)},isLive:()=>u,getFrameId:()=>l,isPaused:()=>!f}}async function V(){let t=document.querySelectorAll("[data-milume-hero]"),r=[];for(let e of t)r.push(await ae(e));window.__milumeHeroHandles=r}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{V().catch(()=>{})}):V().catch(()=>{});window.__milumeHeroMount=V;})();
