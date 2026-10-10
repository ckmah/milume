"use strict";(()=>{var V=[11,11,11],H=[45,212,191],K=[[244,114,182],[96,165,250],[251,191,36],[167,139,250]],z=[.6,-.3,13],J=.5,re=3,oe=22,Y=30,ae=[-1,0,1,2,3,4];async function se(e){let r=await fetch(e);if(!r.ok)throw new Error(`hero points: ${r.status}`);let o=await r.arrayBuffer(),n=new DataView(o),s=n.getUint32(0,!0),i=[],t=4;for(let f=0;f<s;f++){let m=n.getFloat32(t,!0);t+=4;let c=n.getFloat32(t,!0);t+=4;let v=n.getFloat32(t,!0);t+=4;let h=n.getUint8(t);t+=1;let x=n.getFloat32(t,!0);t+=4,i.push({x:m,y:c,z:v,cat:h,rad:x})}let l=[];for(let f of ae){let m=f*10;for(let c of i)l.push({x:c.x,y:c.y,z:c.z+m,cat:c.cat,rad:c.rad})}return l}var Q=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),Ae=`#version 300 es
in vec2 a_corner;
in vec2 i_center;
in float i_radius;
in vec4 i_color;
in float i_soft;
uniform vec2 u_scale;
out vec4 v_color;
out float v_soft;
out vec2 v_uv;
void main() {
  v_uv = a_corner * 0.5 + 0.5;
  vec2 pos = i_center + a_corner * i_radius;
  vec2 clip = (pos / u_scale) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = i_color;
  v_soft = i_soft;
}`,xe=`#version 300 es
precision mediump float;
in vec4 v_color;
in float v_soft;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec2 p = v_uv - 0.5;
  float d = length(p);
  if (d > 0.5) discard;
  float inner = 0.5 - v_soft;
  float edge = smoothstep(0.5, max(0.06, inner), d);
  outColor = vec4(v_color.rgb, v_color.a * edge);
}`,Le=`
attribute vec2 a_corner;
attribute vec2 a_center;
attribute float a_radius;
attribute vec4 a_color;
attribute float a_soft;
uniform vec2 u_scale;
varying vec4 v_color;
varying float v_soft;
varying vec2 v_uv;
void main() {
  v_uv = a_corner * 0.5 + 0.5;
  vec2 pos = a_center + a_corner * a_radius;
  vec2 clip = (pos / u_scale) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = a_color;
  v_soft = a_soft;
}`,Re=`
precision mediump float;
varying vec4 v_color;
varying float v_soft;
varying vec2 v_uv;
void main() {
  vec2 p = v_uv - 0.5;
  float d = length(p);
  if (d > 0.5) discard;
  float inner = 0.5 - v_soft;
  float edge = smoothstep(0.5, max(0.06, inner), d);
  gl_FragColor = vec4(v_color.rgb, v_color.a * edge);
}`;function ce(e){let r=e.getContext("webgl2",{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!0});if(r)return ye(r);let o=e.getContext("webgl",{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!0});return o?Me(o):null}function ye(e){let r=k(e,e.VERTEX_SHADER,Ae),o=k(e,e.FRAGMENT_SHADER,xe);if(!r||!o)return null;let n=ie(e,r,o);if(!n)return null;let s=e.createBuffer(),i=e.createBuffer();if(!s||!i)return null;let t=e.createVertexArray();e.bindVertexArray(t),e.bindBuffer(e.ARRAY_BUFFER,s),e.bufferData(e.ARRAY_BUFFER,Q,e.STATIC_DRAW);let l=e.getAttribLocation(n,"a_corner");e.enableVertexAttribArray(l),e.vertexAttribPointer(l,2,e.FLOAT,!1,0,0),e.vertexAttribDivisor(l,0),e.bindBuffer(e.ARRAY_BUFFER,i);let f=32,m=(c,v,h)=>{let x=e.getAttribLocation(n,c);e.enableVertexAttribArray(x),e.vertexAttribPointer(x,v,e.FLOAT,!1,f,h),e.vertexAttribDivisor(x,1)};return m("i_center",2,0),m("i_radius",1,8),m("i_color",4,12),m("i_soft",1,28),e.bindVertexArray(null),e.enable(e.BLEND),e.blendFunc(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA),{gl:e,program:n,cornerBuf:s,instanceBuf:i,uScale:e.getUniformLocation(n,"u_scale"),instanced:!0,vao:t}}function Me(e){let r=k(e,e.VERTEX_SHADER,Le),o=k(e,e.FRAGMENT_SHADER,Re);if(!r||!o)return null;let n=ie(e,r,o);if(!n)return null;let s=e.createBuffer(),i=e.createBuffer();if(!s||!i)return null;e.useProgram(n);let t=40;e.bindBuffer(e.ARRAY_BUFFER,i);let l=(f,m,c)=>{let v=e.getAttribLocation(n,f);e.enableVertexAttribArray(v),e.vertexAttribPointer(v,m,e.FLOAT,!1,t,c)};return l("a_corner",2,0),l("a_center",2,8),l("a_radius",1,16),l("a_color",4,20),l("a_soft",1,36),e.enable(e.BLEND),e.blendFunc(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA),{gl:e,program:n,cornerBuf:s,instanceBuf:i,uScale:e.getUniformLocation(n,"u_scale"),instanced:!1,vao:null}}function k(e,r,o){let n=e.createShader(r);return n?(e.shaderSource(n,o),e.compileShader(n),e.getShaderParameter(n,e.COMPILE_STATUS)?n:(e.deleteShader(n),null)):null}function ie(e,r,o){let n=e.createProgram();return n?(e.attachShader(n,r),e.attachShader(n,o),e.linkProgram(n),e.getProgramParameter(n,e.LINK_STATUS)?n:(e.deleteProgram(n),null)):null}var u=new Float32Array(12e3*8),S=new Float32Array(12e3*6*10);function ue(e,r,o,n,s,i){let{gl:t,program:l,instanceBuf:f,uScale:m,instanced:c,vao:v}=e,h=0,x=c?14e3:4e3,B=r;r.length>x&&(B=[...r].sort((a,d)=>d.rad*d.alpha-a.rad*a.alpha).slice(0,x).sort((a,d)=>d.z-a.z));for(let a of B){let d=a.rad*s*i.scale;if(d<.35)continue;let p=(a.sx*i.scale+i.offX)*s,y=(a.sy*i.scale+i.offY)*s,A=Math.min(.42,.08+a.coc/40*.34),b=Math.min(1,a.alpha*a.coverage*1.18);if(b<.004)continue;let _=h*8;u[_]=p,u[_+1]=y,u[_+2]=d,u[_+3]=a.cr/255,u[_+4]=a.cg/255,u[_+5]=a.cb/255,u[_+6]=b,u[_+7]=A,h++}if(t.viewport(0,0,o,n),t.clearColor(11/255,11/255,11/255,1),t.clear(t.COLOR_BUFFER_BIT),t.useProgram(l),m&&t.uniform2f(m,o,n),c&&t instanceof WebGL2RenderingContext)t.bindVertexArray(v),t.bindBuffer(t.ARRAY_BUFFER,f),t.bufferData(t.ARRAY_BUFFER,u.subarray(0,h*8),t.DYNAMIC_DRAW),t.drawArraysInstanced(t.TRIANGLES,0,6,h),t.bindVertexArray(null);else{let a=0;for(let d=0;d<h;d++){let p=d*8,y=u[p],A=u[p+1],b=u[p+2],_=u[p+3],D=u[p+4],M=u[p+5],F=u[p+6],P=u[p+7];for(let C=0;C<6;C++){let L=a*10;S[L]=Q[C*2],S[L+1]=Q[C*2+1],S[L+2]=y,S[L+3]=A,S[L+4]=b,S[L+5]=_,S[L+6]=D,S[L+7]=M,S[L+8]=F,S[L+9]=P,a++}}t.bindBuffer(t.ARRAY_BUFFER,f),t.bufferData(t.ARRAY_BUFFER,S.subarray(0,a*10),t.DYNAMIC_DRAW),t.drawArrays(t.TRIANGLES,0,a)}let E=0;for(let a of B){if(a.glow<.18)continue;if(E+h>=x)break;let d=a.rad0*2.2*s*i.scale,p=(a.sx*i.scale+i.offX)*s,y=(a.sy*i.scale+i.offY)*s,A=a.glow*a.alpha*.32,b=(h+E)*8;u[b]=p,u[b+1]=y,u[b+2]=d,u[b+3]=45/255*A,u[b+4]=212/255*A,u[b+5]=191/255*A,u[b+6]=A*.85,u[b+7]=.35,E++}E>0&&c&&t instanceof WebGL2RenderingContext&&(t.bindVertexArray(v),t.bindBuffer(t.ARRAY_BUFFER,f),t.bufferData(t.ARRAY_BUFFER,u.subarray(h*8,(h+E)*8),t.DYNAMIC_DRAW),t.blendFunc(t.SRC_ALPHA,t.ONE),t.drawArraysInstanced(t.TRIANGLES,0,6,E),t.blendFunc(t.SRC_ALPHA,t.ONE_MINUS_SRC_ALPHA),t.bindVertexArray(null))}function O(e,r,o){let n=Math.max(0,Math.min(1,(o-e)/(r-e)));return n*n*(3-2*n)}function le(e){let r=e/11%1,o=r*10%10;return{c:[.45*Math.sin(2*Math.PI*r),.25*Math.sin(4*Math.PI*r),o],roll:.0125*Math.cos(2*Math.PI*r)}}function fe(e){if(e<.6||e>9.6)return null;let r=e-.6,o=O(0,1,r)*(1-O(6,9,r));return{s:r,a:o}}function me(e,r){let o=e[0]-r[0],n=e[1]-r[1],s=e[2]-r[2];return Math.hypot(o,n,s)}function de(e,r,o){let n=e[0],s=e[1],i=e[2],t=r;return n=n*(1-.08*t)+H[0]*.08*t,s=s*(1-.08*t)+H[1]*.08*t,i=i*(1-.08*t)+H[2]*.08*t,n=n*(1-o)+H[0]*o,s=s*(1-o)+H[1]*o,i=i*(1-o)+H[2]*o,[n,s,i]}function pe(e,r,o){let n=11;return o&&(n=11+o.a*(z[2]-r-11)),n}var g=[0,.6,1.3,2.3,3.6,5.2,7.2,9.6,12.5,16];function we(e){let r=e*.5,o=0;for(let n=0;n<g.length-1;n++){if(r<=g[n+1]){let s=(r-g[n])/(g[n+1]-g[n]);return g[n]*(1-s)+g[n+1]*s}o=n}return g[g.length-1]}var X=[];function be(e,r){let{c:o,roll:n}=le(r),s=Math.cos(n),i=Math.sin(n),t=fe(r),l=pe(r,o[2],t);X.length=0;let f=1600/2,m=900/2;for(let c of e){let v=c.z-o[2];if(v<=J||v>=Y)continue;let h=c.x-o[0],x=c.y-o[1],B=h*s-x*i,E=h*i+x*s,a=v,d=f+900*B/a,p=m+900*E/a,y=900*c.rad/a,A=0,b=K[c.cat]??K[0],_=[b[0],b[1],b[2]];if(t){let $=[c.x,c.y,c.z],T=me($,z),j=.85*Math.exp(-Math.pow(T/3,2))*O(0,1,t.s),he=Math.exp(-Math.pow((T-2.5-t.s*1.4)/2,2))*O(.3,1.3,t.s);A=Math.min(1,Math.max(0,j+.4*he))*t.a;let ve=Math.min(1,Math.max(0,(2.5+t.s*1.4-T)/2*t.a));_=de(_,ve,A)}let D=Math.pow(Math.max(0,Math.min(1,1-(a-1)/(Y-1))),1.8),M=Math.max(D*.97,A*Math.min(.98,D*3.2));t&&(M=Math.min(1,M*(1+.14*t.a)));let F=a<10?1+(10-a)*.022:1,P=1.1,C=_[0]*P*M*F+V[0]*(1-M),L=_[1]*P*M*F+V[1]*(1-M),U=_[2]*P*M*F+V[2]*(1-M),R=O(J,re,a)*(1-O(oe,Y,a)),I=Math.min(40,40*Math.abs(1/a-1/l)*l),G=we(I),w=y+G*.82,q=Math.min(1,(y/Math.max(1,w))**2);w<.12||R<.006||d<-w||d>1600+w||p<-w||p>900+w||X.push({sx:d,sy:p,z:a,rad:w,rad0:y,cr:C,cg:L,cb:U,alpha:R,coverage:q,glow:A,coc:I})}return X.sort((c,v)=>v.z-c.z),X}function Ee(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches}function Se(){return Math.min(2,window.devicePixelRatio||1)}async function _e(e){let r=e.getAttribute("data-assets-base")??"assets/",o=e.querySelector(".milume-hero__poster"),n=e.querySelector(".milume-hero__canvas");if(!o||!n)throw new Error("milume-hero: missing poster or canvas");let s=null,i=!1;try{s=await se(`${r}hero-points.bin`)}catch{i=!0}let l=Ee()||i?null:ce(n),f=!!(l&&s);f?(o.hidden=!0,n.hidden=!1,e.dataset.heroMode="webgl"):(o.hidden=!1,n.hidden=!0,e.dataset.heroMode="poster");let m=f,c=0,v=0,h=0,x=0,B=0,E=0,a=performance.now(),d=0,p=0,y=1,A={scale:1,offX:0,offY:0},b=()=>{let R=e.getBoundingClientRect();y=Se(),d=Math.max(1,Math.round(R.width*y)),p=Math.max(1,Math.round(R.height*y)),n.width=d,n.height=p,n.style.width=`${R.width}px`,n.style.height=`${R.height}px`;let I=R.width,G=R.height,w=Math.max(I/1600,G/900);A={scale:w,offX:(I-1600*w)/2,offY:(G-900*w)/2}},_=R=>{if(!l||!s)return;performance.mark("hero-begin");let I=((R-a)/1e3+E)%11,G=performance.now(),w=be(s,I);x=performance.now()-G;let q=performance.now();ue(l,w,d,p,y,A),B=performance.now()-q,performance.mark("hero-end");let $=performance.getEntriesByName("hero-frame");for(let j of $)performance.clearMeasures(j.name);performance.measure("hero-frame","hero-begin","hero-end");let T=performance.getEntriesByName("hero-frame").pop();T&&(h=T.duration),performance.clearMarks("hero-begin"),performance.clearMarks("hero-end"),v+=1},D=()=>{c=0,!(!m||!l||!s)&&(_(performance.now()),c=requestAnimationFrame(D))},M=()=>{!m||!f||c||(c=requestAnimationFrame(D))},F=()=>{m=!1,c&&(cancelAnimationFrame(c),c=0)},P=()=>{f&&(m=!0,M())},C=new IntersectionObserver(R=>{R.some(G=>G.isIntersecting)?P():F()},{threshold:.05});C.observe(e);let L=()=>{document.visibilityState==="hidden"?F():e.getBoundingClientRect().bottom>0&&e.getBoundingClientRect().top<window.innerHeight&&P()};document.addEventListener("visibilitychange",L);let U=new ResizeObserver(()=>{b(),M()});return U.observe(e),b(),f&&M(),{pause:F,resume:P,destroy:()=>{F(),C.disconnect(),U.disconnect(),document.removeEventListener("visibilitychange",L)},isLive:()=>f,getFrameId:()=>v,isPaused:()=>!m,getLastFrameMs:()=>h,getLastSimMs:()=>x,getLastDrawMs:()=>B,setTime:R=>{E=R,a=performance.now(),f&&_(performance.now())},renderOnce:()=>_(performance.now())}}async function ne(){let e=document.querySelectorAll("[data-milume-hero]"),r=[];for(let o of e)r.push(await _e(o));window.__milumeHeroHandles=r}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{ne().catch(()=>{})}):ne().catch(()=>{});window.__milumeHeroMount=ne;})();
