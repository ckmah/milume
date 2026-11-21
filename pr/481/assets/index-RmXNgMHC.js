const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/raw-BS1OOAfz.js","assets/index-BLYKkKUN.js","assets/index-Dx-quTGH.css","assets/lzw-DdbX7S2a.js","assets/jpeg-8dCx0vjj.js","assets/deflate-lwd88uHS.js","assets/pako.esm-B6VxO94S.js","assets/packbits-BdESE3PB.js","assets/lerc-DOgKnjFc.js","assets/webimage-Bgei7wlL.js"])))=>i.map(i=>d[i]);
import{a7 as Ds,a8 as Ss,a9 as ht,aa as tA,ab as Et,ac as go,ad as ho,ae as uo,af as po,ag as fo,ah as Io,ai as wA,aj as K,ak as mo,al as Ns,am as Co,an as Eo,ao as ut,ap as Bo,aq as vo,ar as xo,as as Rs,at as Qo,au as yo,av as wo,aw as _o,ax as _A,ay as Do,az as _t,aA as So,aB as No,aC as Ro,aD as bo,aE as Mo,aF as ko,aG as Lo,aH as To,aI as Fo,L as AA,x as bs,aJ as Go,y as Ms,aK as Uo,z as Bt,G as sA,aL as Yo,K as Po,W as oA,aM as Oo,S as qo,A as qe,aN as me,aO as Ko,aP as b,aQ as Jo,aR as DA,aS as we,aT as SA,aU as zo,aV as jo,aW as E,aX as Ho,aY as Lt,aZ as it,a_ as Zo,a$ as NA,b0 as RA,M as J,b1 as Vo,w as $,b2 as ks,b3 as bA,B as $o,b4 as Wo}from"./index-BLYKkKUN.js";function Ls(A,e,t,s={}){return e!==void 0&&t!==void 0&&(s={...s,headers:{...s.headers,Range:`bytes=${e}-${e+t-1}`}}),fetch(A,s)}function Xo(A,e){return{...A,...e,headers:{...A.headers,...e.headers}}}function MA(A,e){const t=typeof A=="string"?new URL(A):A;t.pathname.endsWith("/")||(t.pathname+="/");const s=new URL(e.slice(1),t);return s.search=t.search,s}async function kA(A){if(A.status!==404){if(A.status===200||A.status===206)return new Uint8Array(await A.arrayBuffer());throw new Error(`Unexpected response status ${A.status} ${A.statusText}`)}}async function en(A,e,t,s){if(s)return fetch(A,{...t,headers:{...t.headers,Range:`bytes=-${e}`}});let o=await fetch(A,{...t,method:"HEAD"});if(!o.ok)return o;let n=o.headers.get("Content-Length"),a=Number(n);return Ls(A,a-e,a,t)}class tn{url;#e;#t;constructor(e,t={}){this.url=e,this.#e=t.overrides??{},this.#t=t.useSuffixRequest??!1}#A(e){return Xo(this.#e,e)}async get(e,t={}){let s=MA(this.url,e).href,o=await fetch(s,this.#A(t));return kA(o)}async getRange(e,t,s={}){let o=MA(this.url,e),n=this.#A(s),a;return"suffixLength"in t?a=await en(o,t.suffixLength,n,this.#t):a=await Ls(o,t.offset,t.length,n),kA(a)}}class Je extends Error{constructor(e,t={}){super(`Node not found: ${e}`,t),this.name="NodeNotFoundError"}}class nA extends Error{constructor(e){super(`Missing key: ${e}`),this.name="KeyError"}}let vt=An();function An(){let A=new WeakMap;function e(t){let s=A.get(t)??{v2:0,v3:0};return A.set(t,s),s}return{increment(t,s){e(t)[s]+=1},version_max(t){let s=e(t);return s.v3>s.v2?"v3":"v2"}}}async function sn(A){let e=await A.store.get(A.resolve(".zattrs").path);return e?Et(e):{}}async function on(A,e={}){let t="store"in A?A:new Ss(A),s={};return(e.attrs??!0)&&(s=await sn(t)),e.kind==="array"?LA(t,s):e.kind==="group"?TA(t,s):LA(t,s).catch(o=>(Ds(o,Je),TA(t,s)))}async function LA(A,e){let{path:t}=A.resolve(".zarray"),s=await A.store.get(t);if(!s)throw new Je("v2 array",{cause:new nA(t)});return vt.increment(A.store,"v2"),new ht(A.store,A.path,go(Et(s),e))}async function TA(A,e){let{path:t}=A.resolve(".zgroup"),s=await A.store.get(t);if(!s)throw new Je("v2 group",{cause:new nA(t)});return vt.increment(A.store,"v2"),new tA(A.store,A.path,ho(Et(s),e))}async function nn(A){let{store:e,path:t}=A.resolve("zarr.json"),s=await A.store.get(t);if(!s)throw new Je("v3 array or group",{cause:new nA(t)});let o=Et(s);return o.node_type==="array"&&(o.fill_value=uo(o)),o.node_type==="array"?new ht(e,A.path,o):new tA(e,A.path,o)}async function an(A,e={}){let t="store"in A?A:new Ss(A),s=await nn(t);if(vt.increment(t.store,"v3"),e.kind===void 0||e.kind==="array"&&s instanceof ht||e.kind==="group"&&s instanceof tA)return s;let o=s instanceof ht?"array":"group";throw new Error(`Expected node of kind ${e.kind}, found ${o}.`)}async function de(A,e={}){let t="store"in A?A.store:A,s=vt.version_max(t),o=s==="v2"?de.v2:de.v3,n=s==="v2"?de.v3:de.v2;return o(A,e).catch(a=>(Ds(a,Je),n(A,e)))}de.v2=on;de.v3=an;const rn="Queued Requests",cn="Active Requests",ln="Cancelled Requests",gn="Queued Requests Ever",hn="Active Requests Ever",un={id:"request-scheduler",throttleRequests:!0,maxRequests:6,debounceTime:0};class dn{props;stats;activeRequestCount=0;requestQueue=[];requestMap=new Map;updateTimer=null;constructor(e={}){this.props={...un,...e},this.stats=new po({id:this.props.id}),this.stats.get(rn),this.stats.get(cn),this.stats.get(ln),this.stats.get(gn),this.stats.get(hn)}scheduleRequest(e,t=()=>0){if(!this.props.throttleRequests)return Promise.resolve({done:()=>{}});if(this.requestMap.has(e))return this.requestMap.get(e);const s={handle:e,priority:0,getPriority:t},o=new Promise(n=>(s.resolve=n,s));return this.requestQueue.push(s),this.requestMap.set(e,o),this._issueNewRequests(),o}_issueRequest(e){const{handle:t,resolve:s}=e;let o=!1;const n=()=>{o||(o=!0,this.requestMap.delete(t),this.activeRequestCount--,this._issueNewRequests())};return this.activeRequestCount++,s?s({done:n}):Promise.resolve({done:n})}_issueNewRequests(){this.updateTimer!==null&&clearTimeout(this.updateTimer),this.updateTimer=setTimeout(()=>this._issueNewRequestsAsync(),this.props.debounceTime)}_issueNewRequestsAsync(){this.updateTimer!==null&&clearTimeout(this.updateTimer),this.updateTimer=null;const e=Math.max(this.props.maxRequests-this.activeRequestCount,0);if(e!==0){this._updateAllRequests();for(let t=0;t<e;++t){const s=this.requestQueue.shift();s&&this._issueRequest(s)}}}_updateAllRequests(){const e=this.requestQueue;for(let t=0;t<e.length;++t){const s=e[t];this._updateRequest(s)||(e.splice(t,1),this.requestMap.delete(s.handle),t--)}e.sort((t,s)=>t.priority-s.priority)}_updateRequest(e){return e.priority=e.getPriority(e.handle),e.priority<0?(e.resolve(null),!1):!0}}let Ve;class aA extends fo{static get ZERO(){return Ve||(Ve=new aA(0,0,0,0),Object.freeze(Ve)),Ve}constructor(e=0,t=0,s=0,o=0){super(-0,-0,-0,-0),Io(e)&&arguments.length===1?this.copy(e):(wA.debug&&(K(e),K(t),K(s),K(o)),this[0]=e,this[1]=t,this[2]=s,this[3]=o)}set(e,t,s,o){return this[0]=e,this[1]=t,this[2]=s,this[3]=o,this.check()}copy(e){return this[0]=e[0],this[1]=e[1],this[2]=e[2],this[3]=e[3],this.check()}fromObject(e){return wA.debug&&(K(e.x),K(e.y),K(e.z),K(e.w)),this[0]=e.x,this[1]=e.y,this[2]=e.z,this[3]=e.w,this}toObject(e){return e.x=this[0],e.y=this[1],e.z=this[2],e.w=this[3],e}get ELEMENTS(){return 4}get z(){return this[2]}set z(e){this[2]=K(e)}get w(){return this[3]}set w(e){this[3]=K(e)}transform(e){return mo(this,this,e),this.check()}transformByMatrix3(e){return Ns(this,this,e),this.check()}transformByMatrix2(e){return Co(this,this,e),this.check()}transformByQuaternion(e){return Eo(this,this,e),this.check()}applyMatrix4(e){return e.transform(this,this),this}}function pn(){const A=new ut(9);return ut!=Float32Array&&(A[1]=0,A[2]=0,A[3]=0,A[5]=0,A[6]=0,A[7]=0),A[0]=1,A[4]=1,A[8]=1,A}function fn(A,e){if(A===e){const t=e[1],s=e[2],o=e[5];A[1]=e[3],A[2]=e[6],A[3]=t,A[5]=e[7],A[6]=s,A[7]=o}else A[0]=e[0],A[1]=e[3],A[2]=e[6],A[3]=e[1],A[4]=e[4],A[5]=e[7],A[6]=e[2],A[7]=e[5],A[8]=e[8];return A}function In(A,e){const t=e[0],s=e[1],o=e[2],n=e[3],a=e[4],i=e[5],r=e[6],c=e[7],l=e[8],g=l*a-i*c,h=-l*n+i*r,u=c*n-a*r;let f=t*g+s*h+o*u;return f?(f=1/f,A[0]=g*f,A[1]=(-l*s+o*c)*f,A[2]=(i*s-o*a)*f,A[3]=h*f,A[4]=(l*t-o*r)*f,A[5]=(-i*t+o*n)*f,A[6]=u*f,A[7]=(-c*t+s*r)*f,A[8]=(a*t-s*n)*f,A):null}function mn(A){const e=A[0],t=A[1],s=A[2],o=A[3],n=A[4],a=A[5],i=A[6],r=A[7],c=A[8];return e*(c*n-a*r)+t*(-c*o+a*i)+s*(r*o-n*i)}function FA(A,e,t){const s=e[0],o=e[1],n=e[2],a=e[3],i=e[4],r=e[5],c=e[6],l=e[7],g=e[8],h=t[0],u=t[1],f=t[2],v=t[3],x=t[4],B=t[5],D=t[6],R=t[7],M=t[8];return A[0]=h*s+u*a+f*c,A[1]=h*o+u*i+f*l,A[2]=h*n+u*r+f*g,A[3]=v*s+x*a+B*c,A[4]=v*o+x*i+B*l,A[5]=v*n+x*r+B*g,A[6]=D*s+R*a+M*c,A[7]=D*o+R*i+M*l,A[8]=D*n+R*r+M*g,A}function Cn(A,e,t){const s=e[0],o=e[1],n=e[2],a=e[3],i=e[4],r=e[5],c=e[6],l=e[7],g=e[8],h=t[0],u=t[1];return A[0]=s,A[1]=o,A[2]=n,A[3]=a,A[4]=i,A[5]=r,A[6]=h*s+u*a+c,A[7]=h*o+u*i+l,A[8]=h*n+u*r+g,A}function En(A,e,t){const s=e[0],o=e[1],n=e[2],a=e[3],i=e[4],r=e[5],c=e[6],l=e[7],g=e[8],h=Math.sin(t),u=Math.cos(t);return A[0]=u*s+h*a,A[1]=u*o+h*i,A[2]=u*n+h*r,A[3]=u*a-h*s,A[4]=u*i-h*o,A[5]=u*r-h*n,A[6]=c,A[7]=l,A[8]=g,A}function GA(A,e,t){const s=t[0],o=t[1];return A[0]=s*e[0],A[1]=s*e[1],A[2]=s*e[2],A[3]=o*e[3],A[4]=o*e[4],A[5]=o*e[5],A[6]=e[6],A[7]=e[7],A[8]=e[8],A}function Bn(A,e){const t=e[0],s=e[1],o=e[2],n=e[3],a=t+t,i=s+s,r=o+o,c=t*a,l=s*a,g=s*i,h=o*a,u=o*i,f=o*r,v=n*a,x=n*i,B=n*r;return A[0]=1-g-f,A[3]=l-B,A[6]=h+x,A[1]=l+B,A[4]=1-c-f,A[7]=u-v,A[2]=h-x,A[5]=u+v,A[8]=1-c-g,A}var Tt;(function(A){A[A.COL0ROW0=0]="COL0ROW0",A[A.COL0ROW1=1]="COL0ROW1",A[A.COL0ROW2=2]="COL0ROW2",A[A.COL1ROW0=3]="COL1ROW0",A[A.COL1ROW1=4]="COL1ROW1",A[A.COL1ROW2=5]="COL1ROW2",A[A.COL2ROW0=6]="COL2ROW0",A[A.COL2ROW1=7]="COL2ROW1",A[A.COL2ROW2=8]="COL2ROW2"})(Tt||(Tt={}));const vn=Object.freeze([1,0,0,0,1,0,0,0,1]);class G extends Bo{static get IDENTITY(){return Qn()}static get ZERO(){return xn()}get ELEMENTS(){return 9}get RANK(){return 3}get INDICES(){return Tt}constructor(e,...t){super(-0,-0,-0,-0,-0,-0,-0,-0,-0),arguments.length===1&&Array.isArray(e)?this.copy(e):t.length>0?this.copy([e,...t]):this.identity()}copy(e){return this[0]=e[0],this[1]=e[1],this[2]=e[2],this[3]=e[3],this[4]=e[4],this[5]=e[5],this[6]=e[6],this[7]=e[7],this[8]=e[8],this.check()}identity(){return this.copy(vn)}fromObject(e){return this.check()}fromQuaternion(e){return Bn(this,e),this.check()}set(e,t,s,o,n,a,i,r,c){return this[0]=e,this[1]=t,this[2]=s,this[3]=o,this[4]=n,this[5]=a,this[6]=i,this[7]=r,this[8]=c,this.check()}setRowMajor(e,t,s,o,n,a,i,r,c){return this[0]=e,this[1]=o,this[2]=i,this[3]=t,this[4]=n,this[5]=r,this[6]=s,this[7]=a,this[8]=c,this.check()}determinant(){return mn(this)}transpose(){return fn(this,this),this.check()}invert(){return In(this,this),this.check()}multiplyLeft(e){return FA(this,e,this),this.check()}multiplyRight(e){return FA(this,this,e),this.check()}rotate(e){return En(this,this,e),this.check()}scale(e){return Array.isArray(e)?GA(this,this,e):GA(this,this,[e,e]),this.check()}translate(e){return Cn(this,this,e),this.check()}transform(e,t){let s;switch(e.length){case 2:s=xo(t||[-0,-0],e,this);break;case 3:s=vo(t||[-0,-0,-0],e,this);break;case 4:s=Ns(t||[-0,-0,-0,-0],e,this);break;default:throw new Error("Illegal vector")}return Rs(s,e.length),s}transformVector(e,t){return this.transform(e,t)}transformVector2(e,t){return this.transform(e,t)}transformVector3(e,t){return this.transform(e,t)}}let $e,We=null;function xn(){return $e||($e=new G([0,0,0,0,0,0,0,0,0]),Object.freeze($e)),$e}function Qn(){return We||(We=new G,Object.freeze(We)),We}function UA(){const A=new ut(4);return ut!=Float32Array&&(A[0]=0,A[1]=0,A[2]=0),A[3]=1,A}function yn(A){return A[0]=0,A[1]=0,A[2]=0,A[3]=1,A}function Ts(A,e,t){t=t*.5;const s=Math.sin(t);return A[0]=s*e[0],A[1]=s*e[1],A[2]=s*e[2],A[3]=Math.cos(t),A}function YA(A,e,t){const s=e[0],o=e[1],n=e[2],a=e[3],i=t[0],r=t[1],c=t[2],l=t[3];return A[0]=s*l+a*i+o*c-n*r,A[1]=o*l+a*r+n*i-s*c,A[2]=n*l+a*c+s*r-o*i,A[3]=a*l-s*i-o*r-n*c,A}function wn(A,e,t){t*=.5;const s=e[0],o=e[1],n=e[2],a=e[3],i=Math.sin(t),r=Math.cos(t);return A[0]=s*r+a*i,A[1]=o*r+n*i,A[2]=n*r-o*i,A[3]=a*r-s*i,A}function _n(A,e,t){t*=.5;const s=e[0],o=e[1],n=e[2],a=e[3],i=Math.sin(t),r=Math.cos(t);return A[0]=s*r-n*i,A[1]=o*r+a*i,A[2]=n*r+s*i,A[3]=a*r-o*i,A}function Dn(A,e,t){t*=.5;const s=e[0],o=e[1],n=e[2],a=e[3],i=Math.sin(t),r=Math.cos(t);return A[0]=s*r+o*i,A[1]=o*r-s*i,A[2]=n*r+a*i,A[3]=a*r-n*i,A}function Sn(A,e){const t=e[0],s=e[1],o=e[2];return A[0]=t,A[1]=s,A[2]=o,A[3]=Math.sqrt(Math.abs(1-t*t-s*s-o*o)),A}function rt(A,e,t,s){const o=e[0],n=e[1],a=e[2],i=e[3];let r=t[0],c=t[1],l=t[2],g=t[3],h,u,f,v,x;return h=o*r+n*c+a*l+i*g,h<0&&(h=-h,r=-r,c=-c,l=-l,g=-g),1-h>Lo?(u=Math.acos(h),x=Math.sin(u),f=Math.sin((1-s)*u)/x,v=Math.sin(s*u)/x):(f=1-s,v=s),A[0]=f*o+v*r,A[1]=f*n+v*c,A[2]=f*a+v*l,A[3]=f*i+v*g,A}function Nn(A,e){const t=e[0],s=e[1],o=e[2],n=e[3],a=t*t+s*s+o*o+n*n,i=a?1/a:0;return A[0]=-t*i,A[1]=-s*i,A[2]=-o*i,A[3]=n*i,A}function Rn(A,e){return A[0]=-e[0],A[1]=-e[1],A[2]=-e[2],A[3]=e[3],A}function Fs(A,e){const t=e[0]+e[4]+e[8];let s;if(t>0)s=Math.sqrt(t+1),A[3]=.5*s,s=.5/s,A[0]=(e[5]-e[7])*s,A[1]=(e[6]-e[2])*s,A[2]=(e[1]-e[3])*s;else{let o=0;e[4]>e[0]&&(o=1),e[8]>e[o*3+o]&&(o=2);const n=(o+1)%3,a=(o+2)%3;s=Math.sqrt(e[o*3+o]-e[n*3+n]-e[a*3+a]+1),A[o]=.5*s,s=.5/s,A[3]=(e[n*3+a]-e[a*3+n])*s,A[n]=(e[n*3+o]+e[o*3+n])*s,A[a]=(e[a*3+o]+e[o*3+a])*s}return A}const bn=Ro,Mn=Mo,kn=wo,Ln=bo,Tn=Qo,Fn=yo,Gs=ko,Gn=(function(){const A=_o(),e=_A(1,0,0),t=_A(0,1,0);return function(s,o,n){const a=Do(o,n);return a<-.999999?(_t(A,e,o),So(A)<1e-6&&_t(A,t,o),No(A,A),Ts(s,A,Math.PI),s):a>.999999?(s[0]=0,s[1]=0,s[2]=0,s[3]=1,s):(_t(A,o,n),s[0]=A[0],s[1]=A[1],s[2]=A[2],s[3]=1+a,Gs(s,s))}})();(function(){const A=UA(),e=UA();return function(t,s,o,n,a,i){return rt(A,s,a,i),rt(e,o,n,i),rt(t,A,e,2*i*(1-i)),t}})();(function(){const A=pn();return function(e,t,s,o){return A[0]=s[0],A[3]=s[1],A[6]=s[2],A[1]=o[0],A[4]=o[1],A[7]=o[2],A[2]=-t[0],A[5]=-t[1],A[8]=-t[2],Gs(e,Fs(e,A))}})();const Un=[0,0,0,1];class PA extends To{constructor(e=0,t=0,s=0,o=1){super(-0,-0,-0,-0),Array.isArray(e)&&arguments.length===1?this.copy(e):this.set(e,t,s,o)}copy(e){return this[0]=e[0],this[1]=e[1],this[2]=e[2],this[3]=e[3],this.check()}set(e,t,s,o){return this[0]=e,this[1]=t,this[2]=s,this[3]=o,this.check()}fromObject(e){return this[0]=e.x,this[1]=e.y,this[2]=e.z,this[3]=e.w,this.check()}fromMatrix3(e){return Fs(this,e),this.check()}fromAxisRotation(e,t){return Ts(this,e,t),this.check()}identity(){return yn(this),this.check()}setAxisAngle(e,t){return this.fromAxisRotation(e,t)}get ELEMENTS(){return 4}get x(){return this[0]}set x(e){this[0]=K(e)}get y(){return this[1]}set y(e){this[1]=K(e)}get z(){return this[2]}set z(e){this[2]=K(e)}get w(){return this[3]}set w(e){this[3]=K(e)}len(){return Tn(this)}lengthSquared(){return Fn(this)}dot(e){return kn(this,e)}rotationTo(e,t){return Gn(this,e,t),this.check()}add(e){return bn(this,this,e),this.check()}calculateW(){return Sn(this,this),this.check()}conjugate(){return Rn(this,this),this.check()}invert(){return Nn(this,this),this.check()}lerp(e,t,s){return s===void 0?this.lerp(this,e,t):(Ln(this,e,t,s),this.check())}multiplyRight(e){return YA(this,this,e),this.check()}multiplyLeft(e){return YA(this,e,this),this.check()}normalize(){const e=this.len(),t=e>0?1/e:0;return this[0]=this[0]*t,this[1]=this[1]*t,this[2]=this[2]*t,this[3]=this[3]*t,e===0&&(this[3]=1),this.check()}rotateX(e){return wn(this,this,e),this.check()}rotateY(e){return _n(this,this,e),this.check()}rotateZ(e){return Dn(this,this,e),this.check()}scale(e){return Mn(this,this,e),this.check()}slerp(e,t,s){let o,n,a;switch(arguments.length){case 1:({start:o=Un,target:n,ratio:a}=e);break;case 2:o=this,n=e,a=t;break;default:o=e,n=t,a=s}return rt(this,o,n,a),this.check()}transformVector4(e,t=new aA){return Fo(t,e,this),Rs(t,4)}lengthSq(){return this.lengthSquared()}setFromAxisAngle(e,t){return this.setAxisAngle(e,t)}premultiply(e){return this.multiplyLeft(e)}multiply(e){return this.multiplyRight(e)}}const Yn=1e-15,Pn=1e-20,On=`struct LineUniforms {
  widthScale: f32,
  widthMinPixels: f32,
  widthMaxPixels: f32,
  useShortestPath: f32,
  widthUnits: i32,
};

@group(0) @binding(1)
var<uniform> line: LineUniforms;
`,OA=`uniform lineUniforms {
  float widthScale;
  float widthMinPixels;
  float widthMaxPixels;
  float useShortestPath;
  highp int widthUnits;
} line;
`,qn={name:"line",source:On,vs:OA,fs:OA,uniformTypes:{widthScale:"f32",widthMinPixels:"f32",widthMaxPixels:"f32",useShortestPath:"f32",widthUnits:"i32"}},Kn=`// ---------- Helper Structures & Functions ----------

// Placeholder filter functions.
fn deckgl_filter_size(offset: vec3<f32>, geometry: Geometry) -> vec3<f32> {
  return offset;
}
fn deckgl_filter_gl_position(p: vec4<f32>, geometry: Geometry) -> vec4<f32> {
  return p;
}
fn deckgl_filter_color(color: vec4<f32>, geometry: Geometry) -> vec4<f32> {
  return color;
}

// Compute an extrusion offset given a line direction (in clipspace),
// an offset direction (-1 or 1), and a width in pixels.
// Assumes a uniform "project" with a viewportSize field is available.
fn getExtrusionOffset(line_clipspace: vec2<f32>, offset_direction: f32, width: f32) -> vec2<f32> {
  // project.viewportSize should be provided as a uniform (not shown here)
  let dir_screenspace = normalize(line_clipspace * project.viewportSize);
  // Rotate by 90°: (x,y) becomes (-y,x)
  let rotated = vec2<f32>(-dir_screenspace.y, dir_screenspace.x);
  return rotated * offset_direction * width / 2.0;
}

// Splits the line between two points at a given x coordinate.
// Interpolates the y and z components.
fn splitLine(a: vec3<f32>, b: vec3<f32>, x: f32) -> vec3<f32> {
  let t: f32 = (x - a.x) / (b.x - a.x);
  return vec3<f32>(x, a.yz + t * (b.yz - a.yz));
}

// ---------- Uniforms & Global Structures ----------

// Uniforms for line, color, and project are assumed to be defined elsewhere.
// For example:
//
// @group(0) @binding(0)
// var<uniform> line: LineUniform;
//
// struct ColorUniform {
//   opacity: f32,
// };
// @group(0) @binding(1)
// var<uniform> color: ColorUniform;
//
// struct ProjectUniform {
//   viewportSize: vec2<f32>,
// };
// @group(0) @binding(2)
// var<uniform> project: ProjectUniform;



// ---------- Vertex Output Structure ----------

struct Varyings {
  @builtin(position) gl_Position: vec4<f32>,
  @location(0) vColor: vec4<f32>,
  @location(1) uv: vec2<f32>,
};

// ---------- Vertex Shader Entry Point ----------

@vertex
fn vertexMain(
  @location(0) positions: vec3<f32>,
  @location(1) instanceSourcePositions: vec3<f32>,
  @location(2) instanceTargetPositions: vec3<f32>,
  @location(3) instanceSourcePositions64Low: vec3<f32>,
  @location(4) instanceTargetPositions64Low: vec3<f32>,
  @location(5) instanceColors: vec4<f32>,
  @location(6) instancePickingColors: vec3<f32>,
  @location(7) instanceWidths: f32
) -> Varyings {
  var geometry: Geometry;
  geometry.worldPosition = instanceSourcePositions;
  geometry.worldPositionAlt = instanceTargetPositions;

  var source_world: vec3<f32> = instanceSourcePositions;
  var target_world: vec3<f32> = instanceTargetPositions;
  var source_world_64low: vec3<f32> = instanceSourcePositions64Low;
  var target_world_64low: vec3<f32> = instanceTargetPositions64Low;

  // Apply shortest-path adjustments if needed.
  if (line.useShortestPath > 0.5 || line.useShortestPath < -0.5) {
    source_world.x = (source_world.x + 180.0 % 360.0) - 180.0;
    target_world.x = (target_world.x + 180.0 % 360.0) - 180.0;
    let deltaLng: f32 = target_world.x - source_world.x;

    if (deltaLng * line.useShortestPath > 180.0) {
      source_world.x = source_world.x + 360.0 * line.useShortestPath;
      source_world = splitLine(source_world, target_world, 180.0 * line.useShortestPath);
      source_world_64low = vec3<f32>(0.0, 0.0, 0.0);
    } else if (deltaLng * line.useShortestPath < -180.0) {
      target_world.x = target_world.x + 360.0 * line.useShortestPath;
      target_world = splitLine(source_world, target_world, 180.0 * line.useShortestPath);
      target_world_64low = vec3<f32>(0.0, 0.0, 0.0);
    } else if (line.useShortestPath < 0.0) {
      var abortOut: Varyings;
      abortOut.gl_Position = vec4<f32>(0.0);
      abortOut.vColor = vec4<f32>(0.0);
      abortOut.uv = vec2<f32>(0.0);
      return abortOut;
    }
  }

  // Project Pos and target positions to clip space.
  let sourceResult = project_position_to_clipspace_and_commonspace(source_world, source_world_64low, vec3<f32>(0.0));
  let targetResult = project_position_to_clipspace_and_commonspace(target_world, target_world_64low, vec3<f32>(0.0));
  let sourcePos: vec4<f32> = sourceResult.clipPosition;
  let targetPos: vec4<f32> = targetResult.clipPosition;
  let source_commonspace: vec4<f32> = sourceResult.commonPosition;
  let target_commonspace: vec4<f32> = targetResult.commonPosition;

  // Interpolate along the line segment.
  let segmentIndex: f32 = positions.x;
  let p: vec4<f32> = sourcePos + segmentIndex * (targetPos - sourcePos);
  geometry.position = source_commonspace + segmentIndex * (target_commonspace - source_commonspace);
  let uv: vec2<f32> = positions.xy;
  geometry.uv = uv;
  geometry.pickingColor = instancePickingColors;

  // Determine width in pixels.
  let widthPixels: f32 = clamp(
    project_unit_size_to_pixel(instanceWidths * line.widthScale, line.widthUnits),
    line.widthMinPixels, line.widthMaxPixels
  );

  // Compute extrusion offset.
  let extrusion: vec2<f32> = getExtrusionOffset(targetPos.xy - sourcePos.xy, positions.y, widthPixels);
  let offset: vec3<f32> = vec3<f32>(extrusion, 0.0);

  // Apply deck.gl filter functions.
  let filteredOffset = deckgl_filter_size(offset, geometry);
  let filteredP = deckgl_filter_gl_position(p, geometry);

  let clipOffset: vec2<f32> = project_pixel_size_to_clipspace(filteredOffset.xy);
  let finalPosition: vec4<f32> = filteredP + vec4<f32>(clipOffset, 0.0, 0.0);

  // Compute color.
  var vColor: vec4<f32> = vec4<f32>(instanceColors.rgb, instanceColors.a * color.opacity);
  // vColor = deckgl_filter_color(vColor, geometry);

  var output: Varyings;
  output.gl_Position = finalPosition;
  output.vColor = vColor;
  output.uv = uv;
  return output;
}

@fragment
fn fragmentMain(
  @location(0) vColor: vec4<f32>,
  @location(1) uv: vec2<f32>
) -> @location(0) vec4<f32> {
  // Create and initialize geometry with the provided uv.
  var geometry: Geometry;
  geometry.uv = uv;

  // Start with the input color.
  var fragColor: vec4<f32> = vColor;

  // Apply the deck.gl filter to the color.
  fragColor = deckgl_filter_color(fragColor, geometry);

  // Apply premultiplied alpha as required by transparent canvas
  fragColor = deckgl_premultiplied_alpha(fragColor);

  return fragColor;
}
`,Jn=`#version 300 es
#define SHADER_NAME line-layer-vertex-shader
in vec3 positions;
in vec3 instanceSourcePositions;
in vec3 instanceTargetPositions;
in vec3 instanceSourcePositions64Low;
in vec3 instanceTargetPositions64Low;
in vec4 instanceColors;
in vec3 instancePickingColors;
in float instanceWidths;
out vec4 vColor;
out vec2 uv;
vec2 getExtrusionOffset(vec2 line_clipspace, float offset_direction, float width) {
vec2 dir_screenspace = normalize(line_clipspace * project.viewportSize);
dir_screenspace = vec2(-dir_screenspace.y, dir_screenspace.x);
return dir_screenspace * offset_direction * width / 2.0;
}
vec3 splitLine(vec3 a, vec3 b, float x) {
float t = (x - a.x) / (b.x - a.x);
return vec3(x, mix(a.yz, b.yz, t));
}
void main(void) {
geometry.worldPosition = instanceSourcePositions;
geometry.worldPositionAlt = instanceTargetPositions;
vec3 source_world = instanceSourcePositions;
vec3 target_world = instanceTargetPositions;
vec3 source_world_64low = instanceSourcePositions64Low;
vec3 target_world_64low = instanceTargetPositions64Low;
if (line.useShortestPath > 0.5 || line.useShortestPath < -0.5) {
source_world.x = mod(source_world.x + 180., 360.0) - 180.;
target_world.x = mod(target_world.x + 180., 360.0) - 180.;
float deltaLng = target_world.x - source_world.x;
if (deltaLng * line.useShortestPath > 180.) {
source_world.x += 360. * line.useShortestPath;
source_world = splitLine(source_world, target_world, 180. * line.useShortestPath);
source_world_64low = vec3(0.0);
} else if (deltaLng * line.useShortestPath < -180.) {
target_world.x += 360. * line.useShortestPath;
target_world = splitLine(source_world, target_world, 180. * line.useShortestPath);
target_world_64low = vec3(0.0);
} else if (line.useShortestPath < 0.) {
gl_Position = vec4(0.);
return;
}
}
vec4 source_commonspace;
vec4 target_commonspace;
vec4 source = project_position_to_clipspace(source_world, source_world_64low, vec3(0.), source_commonspace);
vec4 target = project_position_to_clipspace(target_world, target_world_64low, vec3(0.), target_commonspace);
float segmentIndex = positions.x;
vec4 p = mix(source, target, segmentIndex);
geometry.position = mix(source_commonspace, target_commonspace, segmentIndex);
uv = positions.xy;
geometry.uv = uv;
geometry.pickingColor = instancePickingColors;
float widthPixels = clamp(
project_size_to_pixel(instanceWidths * line.widthScale, line.widthUnits),
line.widthMinPixels, line.widthMaxPixels
);
vec3 offset = vec3(
getExtrusionOffset(target.xy - source.xy, positions.y, widthPixels),
0.0);
DECKGL_FILTER_SIZE(offset, geometry);
DECKGL_FILTER_GL_POSITION(p, geometry);
gl_Position = p + vec4(project_pixel_size_to_clipspace(offset.xy), 0.0, 0.0);
vColor = vec4(instanceColors.rgb, instanceColors.a * layer.opacity);
DECKGL_FILTER_COLOR(vColor, geometry);
}
`,zn=`#version 300 es
#define SHADER_NAME line-layer-fragment-shader
precision highp float;
in vec4 vColor;
in vec2 uv;
out vec4 fragColor;
void main(void) {
geometry.uv = uv;
fragColor = vColor;
DECKGL_FILTER_COLOR(fragColor, geometry);
}
`,jn=[0,0,0,255],Hn={getSourcePosition:{type:"accessor",value:A=>A.sourcePosition},getTargetPosition:{type:"accessor",value:A=>A.targetPosition},getColor:{type:"accessor",value:jn},getWidth:{type:"accessor",value:1},widthUnits:"pixels",widthScale:{type:"number",value:1,min:0},widthMinPixels:{type:"number",value:0,min:0},widthMaxPixels:{type:"number",value:Number.MAX_SAFE_INTEGER,min:0}};class Oe extends AA{getBounds(){return this.getAttributeManager()?.getBounds(["instanceSourcePositions","instanceTargetPositions"])}getShaders(){return super.getShaders({vs:Jn,fs:zn,source:Kn,modules:[bs,Go,Ms,qn]})}get wrapLongitude(){return!1}initializeState(){this.getAttributeManager().addInstanced({instanceSourcePositions:{size:3,type:"float64",fp64:this.use64bitPositions(),transition:!0,accessor:"getSourcePosition"},instanceTargetPositions:{size:3,type:"float64",fp64:this.use64bitPositions(),transition:!0,accessor:"getTargetPosition"},instanceColors:{size:this.props.colorFormat.length,type:"unorm8",transition:!0,accessor:"getColor",defaultValue:[0,0,0,255]},instanceWidths:{size:1,transition:!0,accessor:"getWidth",defaultValue:1}})}updateState(e){super.updateState(e),e.changeFlags.extensionsChanged&&(this.state.model?.destroy(),this.state.model=this._getModel(),this.getAttributeManager().invalidateAll())}draw({uniforms:e}){const{widthUnits:t,widthScale:s,widthMinPixels:o,widthMaxPixels:n,wrapLongitude:a}=this.props,i=this.state.model,r={widthUnits:Uo[t],widthScale:s,widthMinPixels:o,widthMaxPixels:n,useShortestPath:a?1:0};i.shaderInputs.setProps({line:r}),i.draw(this.context.renderPass),a&&(i.shaderInputs.setProps({line:{...r,useShortestPath:-1}}),i.draw(this.context.renderPass))}_getModel(){const e=this.context.device.type==="webgpu"?{depthWriteEnabled:!0,depthCompare:"less-equal"}:void 0,t=[0,-1,0,0,1,0,1,-1,0,1,1,0];return new Bt(this.context.device,{...this.getShaders(),id:this.props.id,bufferLayout:this.getAttributeManager().getBufferLayouts(),geometry:new sA({topology:"triangle-strip",attributes:{positions:{size:3,value:new Float32Array(t)}}}),parameters:e,isInstanced:!0})}}Oe.layerName="LineLayer";Oe.defaultProps=Hn;function Zn(A,e){if(!A)return null;const t="startIndices"in A?A.startIndices[e]:e,s=A.featureIds.value[t];return t!==-1?Vn(A,s,t):null}function Vn(A,e,t){const s={properties:{...A.properties[e]}};for(const o in A.numericProps)s.properties[o]=A.numericProps[o].value[t];return s}function $n(A,e){const t={points:null,lines:null,polygons:null};for(const s in t){const o=A[s].globalFeatureIds.value;t[s]=new Uint8ClampedArray(o.length*4);const n=[];for(let a=0;a<o.length;a++)e(o[a],n),t[s][a*4+0]=n[0],t[s][a*4+1]=n[1],t[s][a*4+2]=n[2],t[s][a*4+3]=255}return t}const ct={circle:{type:qo,props:{filled:"filled",stroked:"stroked",lineWidthMaxPixels:"lineWidthMaxPixels",lineWidthMinPixels:"lineWidthMinPixels",lineWidthScale:"lineWidthScale",lineWidthUnits:"lineWidthUnits",pointRadiusMaxPixels:"radiusMaxPixels",pointRadiusMinPixels:"radiusMinPixels",pointRadiusScale:"radiusScale",pointRadiusUnits:"radiusUnits",pointAntialiasing:"antialiasing",pointBillboard:"billboard",getFillColor:"getFillColor",getLineColor:"getLineColor",getLineWidth:"getLineWidth",getPointRadius:"getRadius"}},icon:{type:Oo,props:{iconAtlas:"iconAtlas",iconMapping:"iconMapping",iconSizeMaxPixels:"sizeMaxPixels",iconSizeMinPixels:"sizeMinPixels",iconSizeScale:"sizeScale",iconSizeUnits:"sizeUnits",iconAlphaCutoff:"alphaCutoff",iconBillboard:"billboard",getIcon:"getIcon",getIconAngle:"getAngle",getIconColor:"getColor",getIconPixelOffset:"getPixelOffset",getIconSize:"getSize"}},text:{type:oA,props:{textSizeMaxPixels:"sizeMaxPixels",textSizeMinPixels:"sizeMinPixels",textSizeScale:"sizeScale",textSizeUnits:"sizeUnits",textBackground:"background",textBackgroundPadding:"backgroundPadding",textFontFamily:"fontFamily",textFontWeight:"fontWeight",textLineHeight:"lineHeight",textMaxWidth:"maxWidth",textOutlineColor:"outlineColor",textOutlineWidth:"outlineWidth",textWordBreak:"wordBreak",textCharacterSet:"characterSet",textBillboard:"billboard",textFontSettings:"fontSettings",getText:"getText",getTextAngle:"getAngle",getTextColor:"getColor",getTextPixelOffset:"getPixelOffset",getTextSize:"getSize",getTextAnchor:"getTextAnchor",getTextAlignmentBaseline:"getAlignmentBaseline",getTextBackgroundColor:"getBackgroundColor",getTextBorderColor:"getBorderColor",getTextBorderWidth:"getBorderWidth"}}},lt={type:Po,props:{lineWidthUnits:"widthUnits",lineWidthScale:"widthScale",lineWidthMinPixels:"widthMinPixels",lineWidthMaxPixels:"widthMaxPixels",lineJointRounded:"jointRounded",lineCapRounded:"capRounded",lineMiterLimit:"miterLimit",lineBillboard:"billboard",getLineColor:"getColor",getLineWidth:"getWidth"}},Ft={type:Yo,props:{extruded:"extruded",filled:"filled",wireframe:"wireframe",elevationScale:"elevationScale",material:"material",_full3d:"_full3d",getElevation:"getElevation",getFillColor:"getFillColor",getLineColor:"getLineColor"}};function Ge({type:A,props:e}){const t={};for(const s in e)t[s]=A.defaultProps[e[s]];return t}function Dt(A,e){const{transitions:t,updateTriggers:s}=A.props,o={updateTriggers:{},transitions:t&&{getPosition:t.geometry}};for(const n in e){const a=e[n];let i=A.props[n];n.startsWith("get")&&(i=A.getSubLayerAccessor(i),o.updateTriggers[a]=s[n],t&&(o.transitions[a]=t[n])),o[a]=i}return o}function Wn(A){if(Array.isArray(A))return A;switch(qe.assert(A.type,"GeoJSON does not have type"),A.type){case"Feature":return[A];case"FeatureCollection":return qe.assert(Array.isArray(A.features),"GeoJSON does not have features array"),A.features;default:return[{geometry:A}]}}function qA(A,e,t={}){const s={pointFeatures:[],lineFeatures:[],polygonFeatures:[],polygonOutlineFeatures:[]},{startRow:o=0,endRow:n=A.length}=t;for(let a=o;a<n;a++){const i=A[a],{geometry:r}=i;if(r)if(r.type==="GeometryCollection"){qe.assert(Array.isArray(r.geometries),"GeoJSON does not have geometries array");const{geometries:c}=r;for(let l=0;l<c.length;l++){const g=c[l];KA(g,s,e,i,a)}}else KA(r,s,e,i,a)}return s}function KA(A,e,t,s,o){const{type:n,coordinates:a}=A,{pointFeatures:i,lineFeatures:r,polygonFeatures:c,polygonOutlineFeatures:l}=e;if(!ea(n,a)){qe.warn(`${n} coordinates are malformed`)();return}switch(n){case"Point":i.push(t({geometry:A},s,o));break;case"MultiPoint":a.forEach(g=>{i.push(t({geometry:{type:"Point",coordinates:g}},s,o))});break;case"LineString":r.push(t({geometry:A},s,o));break;case"MultiLineString":a.forEach(g=>{r.push(t({geometry:{type:"LineString",coordinates:g}},s,o))});break;case"Polygon":c.push(t({geometry:A},s,o)),a.forEach(g=>{l.push(t({geometry:{type:"LineString",coordinates:g}},s,o))});break;case"MultiPolygon":a.forEach(g=>{c.push(t({geometry:{type:"Polygon",coordinates:g}},s,o)),g.forEach(h=>{l.push(t({geometry:{type:"LineString",coordinates:h}},s,o))})});break}}const Xn={Point:1,MultiPoint:2,LineString:2,MultiLineString:3,Polygon:3,MultiPolygon:4};function ea(A,e){let t=Xn[A];for(qe.assert(t,`Unknown GeoJSON type ${A}`);e&&--t>0;)e=e[0];return e&&Number.isFinite(e[0])}function Us(){return{points:{},lines:{},polygons:{},polygonsOutline:{}}}function Xe(A){return A.geometry.coordinates}function ta(A,e){const t=Us(),{pointFeatures:s,lineFeatures:o,polygonFeatures:n,polygonOutlineFeatures:a}=A;return t.points.data=s,t.points._dataDiff=e.pointFeatures&&(()=>e.pointFeatures),t.points.getPosition=Xe,t.lines.data=o,t.lines._dataDiff=e.lineFeatures&&(()=>e.lineFeatures),t.lines.getPath=Xe,t.polygons.data=n,t.polygons._dataDiff=e.polygonFeatures&&(()=>e.polygonFeatures),t.polygons.getPolygon=Xe,t.polygonsOutline.data=a,t.polygonsOutline._dataDiff=e.polygonOutlineFeatures&&(()=>e.polygonOutlineFeatures),t.polygonsOutline.getPath=Xe,t}function Aa(A,e){const t=Us(),{points:s,lines:o,polygons:n}=A,a=$n(A,e);t.points.data={length:s.positions.value.length/s.positions.size,attributes:{...s.attributes,getPosition:s.positions,instancePickingColors:{size:4,value:a.points}},properties:s.properties,numericProps:s.numericProps,featureIds:s.featureIds},t.lines.data={length:o.pathIndices.value.length-1,startIndices:o.pathIndices.value,attributes:{...o.attributes,getPath:o.positions,instancePickingColors:{size:4,value:a.lines}},properties:o.properties,numericProps:o.numericProps,featureIds:o.featureIds},t.lines._pathType="open";const i=n.positions.value.length/n.positions.size,r=Array(i).fill(1);for(const c of n.primitivePolygonIndices.value)r[c-1]=0;return t.polygons.data={length:n.polygonIndices.value.length-1,startIndices:n.polygonIndices.value,attributes:{...n.attributes,getPolygon:n.positions,instanceVertexValid:{size:1,value:new Uint16Array(r)},pickingColors:{size:4,value:a.polygons}},properties:n.properties,numericProps:n.numericProps,featureIds:n.featureIds},t.polygons._normalize=!1,n.triangles&&(t.polygons.data.attributes.indices=n.triangles.value),t.polygonsOutline.data={length:n.primitivePolygonIndices.value.length-1,startIndices:n.primitivePolygonIndices.value,attributes:{...n.attributes,getPath:n.positions,instancePickingColors:{size:4,value:a.polygons}},properties:n.properties,numericProps:n.numericProps,featureIds:n.featureIds},t.polygonsOutline._pathType="open",t}const sa=["points","linestrings","polygons"],oa={...Ge(ct.circle),...Ge(ct.icon),...Ge(ct.text),...Ge(lt),...Ge(Ft),stroked:!0,filled:!0,extruded:!1,wireframe:!1,_full3d:!1,iconAtlas:{type:"object",value:null},iconMapping:{type:"object",value:{}},getIcon:{type:"accessor",value:A=>A.properties.icon},getText:{type:"accessor",value:A=>A.properties.text},pointType:"circle",getRadius:{deprecatedFor:"getPointRadius"}};class iA extends me{initializeState(){this.state={layerProps:{},features:{},featuresDiff:{}}}updateState({props:e,changeFlags:t}){if(!t.dataChanged)return;const{data:s}=this.props,o=s&&"points"in s&&"polygons"in s&&"lines"in s;this.setState({binary:o}),o?this._updateStateBinary({props:e,changeFlags:t}):this._updateStateJSON({props:e,changeFlags:t})}_updateStateBinary({props:e,changeFlags:t}){const s=Aa(e.data,this.encodePickingColor);this.setState({layerProps:s})}_updateStateJSON({props:e,changeFlags:t}){const s=Wn(e.data),o=this.getSubLayerRow.bind(this);let n={};const a={};if(Array.isArray(t.dataChanged)){const r=this.state.features;for(const c in r)n[c]=r[c].slice(),a[c]=[];for(const c of t.dataChanged){const l=qA(s,o,c);for(const g in r)a[g].push(Ko({data:n[g],getIndex:h=>h.__source.index,dataRange:c,replace:l[g]}))}}else n=qA(s,o);const i=ta(n,a);this.setState({features:n,featuresDiff:a,layerProps:i})}getPickingInfo(e){const t=super.getPickingInfo(e),{index:s,sourceLayer:o}=t;return t.featureType=sa.find(n=>o.id.startsWith(`${this.id}-${n}-`)),s>=0&&o.id.startsWith(`${this.id}-points-text`)&&this.state.binary&&(t.index=this.props.data.points.globalFeatureIds.value[s]),t}_updateAutoHighlight(e){const t=`${this.id}-points-`,s=e.featureType==="points";for(const o of this.getSubLayers())o.id.startsWith(t)===s&&o.updateAutoHighlight(e)}_renderPolygonLayer(){const{extruded:e,wireframe:t}=this.props,{layerProps:s}=this.state,o="polygons-fill",n=this.shouldRenderSubLayer(o,s.polygons?.data)&&this.getSubLayerClass(o,Ft.type);if(n){const a=Dt(this,Ft.props),i=e&&t;return i||delete a.getLineColor,a.updateTriggers.lineColors=i,new n(a,this.getSubLayerProps({id:o,updateTriggers:a.updateTriggers}),s.polygons)}return null}_renderLineLayers(){const{extruded:e,stroked:t}=this.props,{layerProps:s}=this.state,o="polygons-stroke",n="linestrings",a=!e&&t&&this.shouldRenderSubLayer(o,s.polygonsOutline?.data)&&this.getSubLayerClass(o,lt.type),i=this.shouldRenderSubLayer(n,s.lines?.data)&&this.getSubLayerClass(n,lt.type);if(a||i){const r=Dt(this,lt.props);return[a&&new a(r,this.getSubLayerProps({id:o,updateTriggers:r.updateTriggers}),s.polygonsOutline),i&&new i(r,this.getSubLayerProps({id:n,updateTriggers:r.updateTriggers}),s.lines)]}return null}_renderPointLayers(){const{pointType:e}=this.props,{layerProps:t,binary:s}=this.state;let{highlightedObjectIndex:o}=this.props;!s&&Number.isFinite(o)&&(o=t.points.data.findIndex(i=>i.__source.index===o));const n=new Set(e.split("+")),a=[];for(const i of n){const r=`points-${i}`,c=ct[i],l=c&&this.shouldRenderSubLayer(r,t.points?.data)&&this.getSubLayerClass(r,c.type);if(l){const g=Dt(this,c.props);let h=t.points;if(i==="text"&&s){const{instancePickingColors:u,...f}=h.data.attributes;h={...h,data:{...h.data,attributes:f}}}a.push(new l(g,this.getSubLayerProps({id:r,updateTriggers:g.updateTriggers,highlightedObjectIndex:o}),h))}}return a}renderLayers(){const{extruded:e}=this.props,t=this._renderPolygonLayer(),s=this._renderLineLayers(),o=this._renderPointLayers();return[!e&&t,s,o,e&&t]}getSubLayerAccessor(e){const{binary:t}=this.state;return!t||typeof e!="function"?super.getSubLayerAccessor(e):(s,o)=>{const{data:n,index:a}=o,i=Zn(n,a);return e(i,o)}}}iA.layerName="GeoJsonLayer";iA.defaultProps=oa;const na=255,JA=[0,0,0],Ee=10,m="VIV_CHANNEL_INDEX",Ae="VIV_PLANE_INDEX",aa="-apple-system, 'Helvetica Neue', Arial, sans-serif",zA={Uint8:{format:"r8uint",dataFormat:b.RED_INTEGER,type:b.UNSIGNED_BYTE,max:2**8-1,sampler:"usampler2D"},Uint16:{format:"r16uint",dataFormat:b.RED_INTEGER,type:b.UNSIGNED_SHORT,max:2**16-1,sampler:"usampler2D"},Uint32:{format:"r32uint",dataFormat:b.RED_INTEGER,type:b.UNSIGNED_INT,max:2**32-1,sampler:"usampler2D"},Float32:{format:"r32float",dataFormat:b.RED,type:b.FLOAT,max:3.4*10**38,sampler:"sampler2D"},Int8:{format:"r8sint",dataFormat:b.RED_INTEGER,type:b.BYTE,max:2**7-1,sampler:"isampler2D"},Int16:{format:"r16sint",dataFormat:b.RED_INTEGER,type:b.SHORT,max:2**15-1,sampler:"isampler2D"},Int32:{format:"r32sint",dataFormat:b.RED_INTEGER,type:b.INT,max:2**31-1,sampler:"isampler2D"},Float64:{format:"r32float",dataFormat:b.RED,type:b.FLOAT,max:3.4*10**38,sampler:"sampler2D",cast:A=>new Float32Array(A)}},Ys=`vec4 apply_transparent_color(vec3 color, vec3 transparentColor, bool useTransparentColor, float opacity){
  return vec4(color, (color == transparentColor && useTransparentColor) ? 0. : opacity);
}
`;var ia=Object.defineProperty,ra=(A,e,t)=>e in A?ia(A,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):A[e]=t,Ps=(A,e,t)=>(ra(A,typeof e!="symbol"?e+"":e,t),t);function ca(A,e,t=1){if(A.includes(m)){let s="";for(let o=0;o<e;o++)s+=`${A.replaceAll(m,o.toString())}
`;return s.endsWith(`,
`)&&(s=`${s.slice(0,-2)}
`),s}if(A.includes(Ae)){let s="";for(let o=0;o<t;o++)s+=`${A.replaceAll(Ae,o.toString())}
`;return s.endsWith(`,
`)&&(s=`${s.slice(0,-2)}
`),s}return A}function jA(A,e,t=1){return A.split(`
`).map(s=>ca(s,e,t)).join(`
`)}function oe(A,e,t=1){if(e<1)throw new Error(`expandShaderModule requires numChannels >= 1, got ${e}`);if(t<1)throw new Error(`expandShaderModule requires numPlanes >= 1, got ${t}`);const s={...A};if(A.uniformTypes){const n={};for(const[a,i]of Object.entries(A.uniformTypes))if(a.includes(m))for(let r=0;r<e;r++){const c=a.replaceAll(m,r.toString());n[c]=i}else if(a.includes(Ae))for(let r=0;r<t;r++){const c=a.replaceAll(Ae,r.toString());n[c]=i}else n[a]=i;s.uniformTypes=n}A.fs&&(s.fs=jA(A.fs,e,t)),A.vs&&(s.vs=jA(A.vs,e,t));const o={...A.defines||{}};return o.NUM_CHANNELS=String(e),o.NUM_PLANES=String(t),s.defines=o,s}const Os=class Ye extends DA{constructor(){super();const e=DA.getDefaultShaderAssembler(),t=e._getModuleList(),s=e._hookFunctions;for(const a of t)this.addDefaultModule(a);for(const a of s)this.addShaderHook(a);const o="fs:DECKGL_MUTATE_COLOR(inout vec4 rgba, float[NUM_CHANNELS] intensity, vec2 vTexCoord)",n="fs:DECKGL_PROCESS_INTENSITY(inout float intensity, vec2 contrastLimits, int channelIndex)";this.addShaderHook(o),this.addShaderHook(n)}static getDefaultVivShaderAssembler(){return Ye._default||(Ye._default=new Ye),Ye._default}};Ps(Os,"_default");let rA=Os;class Te extends Jo{getShaders(e){const t=e.getVivShaderTemplates.call(this)||{},s=this.getNumChannels(),o=this.getNumPlanes();return{modules:(t.modules||[]).map(a=>oe(a,s,o))}}}Ps(Te,"extensionName","VivLayerExtension");const la=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(1,1,1,0);
  const float e1 = 1.0;
  const vec4 v1 = vec4(1,1,1,1);
  float a0 = smoothstep(e0,e1,x);
  return mix(v0,v1,a0)*step(e0,x)*step(x,e1);
}
`,ga=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(1,0,0,1);
  const float e1 = 1.0;
  const vec4 v1 = vec4(1,1,0,1);
  float a0 = smoothstep(e0,e1,x);
  return mix(v0,v1,a0)*step(e0,x)*step(x,e1);
}
`,ha=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.1568627450980392,0.10196078431372549,0.17254901960784313,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.23137254901960785,0.19215686274509805,0.35294117647058826,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.25098039215686274,0.2980392156862745,0.5450980392156862,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.24705882352941178,0.43137254901960786,0.592156862745098,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.2823529411764706,0.5568627450980392,0.6196078431372549,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.3333333333333333,0.6823529411764706,0.6392156862745098,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.47058823529411764,0.807843137254902,0.6392156862745098,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.7333333333333333,0.9019607843137255,0.6745098039215687,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.9921568627450981,0.996078431372549,0.8,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,ua=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0,0,0,1);
  const float e1 = 0.2;
  const vec4 v1 = vec4(0.9019607843137255,0,0,1);
  const float e2 = 0.4;
  const vec4 v2 = vec4(0.9019607843137255,0.8235294117647058,0,1);
  const float e3 = 0.7;
  const vec4 v3 = vec4(1,1,1,1);
  const float e4 = 1.0;
  const vec4 v4 = vec4(0.6274509803921569,0.7843137254901961,1,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),mix(v3,v4,a3)*step(e3,x)*step(x,e4)
  )));
}
`,da=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0,0,1,1);
  const float e1 = 1.0;
  const vec4 v1 = vec4(1,0,0,1);
  float a0 = smoothstep(e0,e1,x);
  return mix(v0,v1,a0)*step(e0,x)*step(x,e1);
}
`,pa=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0,0,0,1);
  const float e1 = 0.376;
  const vec4 v1 = vec4(0.32941176470588235,0.32941176470588235,0.4549019607843137,1);
  const float e2 = 0.753;
  const vec4 v2 = vec4(0.6627450980392157,0.7843137254901961,0.7843137254901961,1);
  const float e3 = 1.0;
  const vec4 v3 = vec4(1,1,1,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),mix(v2,v3,a2)*step(e2,x)*step(x,e3)
  ));
}
`,fa=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.1843137254901961,0.058823529411764705,0.24313725490196078,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.3411764705882353,0.09019607843137255,0.33725490196078434,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.5098039215686274,0.10980392156862745,0.38823529411764707,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.6705882352941176,0.1607843137254902,0.3764705882352941,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.807843137254902,0.2627450980392157,0.33725490196078434,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.9019607843137255,0.41568627450980394,0.32941176470588235,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.9490196078431372,0.5843137254901961,0.403921568627451,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.9764705882352941,0.7568627450980392,0.5294117647058824,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.996078431372549,0.9294117647058824,0.6901960784313725,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,Ia=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.07058823529411765,0.1411764705882353,0.0784313725490196,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.09803921568627451,0.24705882352941178,0.1607843137254902,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.09411764705882353,0.3568627450980392,0.23137254901960785,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.050980392156862744,0.4666666666666667,0.2823529411764706,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.07058823529411765,0.5803921568627451,0.3137254901960784,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.3137254901960784,0.6784313725490196,0.34901960784313724,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.5176470588235295,0.7686274509803922,0.47843137254901963,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.6862745098039216,0.8666666666666667,0.6352941176470588,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.8431372549019608,0.9764705882352941,0.8156862745098039,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,ma=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.49019607843137253,0,0.7019607843137254,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.4549019607843137,0,0.8549019607843137,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.3843137254901961,0.2901960784313726,0.9294117647058824,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.26666666666666666,0.5725490196078431,0.9058823529411765,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0,0.8,0.7725490196078432,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0,0.9686274509803922,0.5725490196078431,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0,1,0.34509803921568627,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.1568627450980392,1,0.03137254901960784,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.5764705882352941,1,0,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,Ca=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0,0,0,1);
  const float e1 = 0.804;
  const vec4 v1 = vec4(1,0.6274509803921569,0.4,1);
  const float e2 = 1.0;
  const vec4 v2 = vec4(1,0.7803921568627451,0.4980392156862745,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),mix(v1,v2,a1)*step(e1,x)*step(x,e2)
  );
}
`,Ea=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0,0,0,1);
  const float e1 = 0.07;
  const vec4 v1 = vec4(0.08627450980392157,0.0196078431372549,0.23137254901960785,1);
  const float e2 = 0.13;
  const vec4 v2 = vec4(0.23529411764705882,0.01568627450980392,0.4117647058823529,1);
  const float e3 = 0.2;
  const vec4 v3 = vec4(0.42745098039215684,0.00392156862745098,0.5294117647058824,1);
  const float e4 = 0.27;
  const vec4 v4 = vec4(0.6313725490196078,0,0.5764705882352941,1);
  const float e5 = 0.33;
  const vec4 v5 = vec4(0.8235294117647058,0.00784313725490196,0.5568627450980392,1);
  const float e6 = 0.4;
  const vec4 v6 = vec4(0.984313725490196,0.043137254901960784,0.4823529411764706,1);
  const float e7 = 0.47;
  const vec4 v7 = vec4(1,0.11372549019607843,0.3803921568627451,1);
  const float e8 = 0.53;
  const vec4 v8 = vec4(1,0.21176470588235294,0.27058823529411763,1);
  const float e9 = 0.6;
  const vec4 v9 = vec4(1,0.3333333333333333,0.1803921568627451,1);
  const float e10 = 0.67;
  const vec4 v10 = vec4(1,0.47058823529411764,0.13333333333333333,1);
  const float e11 = 0.73;
  const vec4 v11 = vec4(1,0.615686274509804,0.1450980392156863,1);
  const float e12 = 0.8;
  const vec4 v12 = vec4(0.9450980392156862,0.7490196078431373,0.2235294117647059,1);
  const float e13 = 0.87;
  const vec4 v13 = vec4(0.8784313725490196,0.8627450980392157,0.36470588235294116,1);
  const float e14 = 0.93;
  const vec4 v14 = vec4(0.8549019607843137,0.9450980392156862,0.5568627450980392,1);
  const float e15 = 1.0;
  const vec4 v15 = vec4(0.8901960784313725,0.9921568627450981,0.7764705882352941,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  float a8 = smoothstep(e8,e9,x);
  float a9 = smoothstep(e9,e10,x);
  float a10 = smoothstep(e10,e11,x);
  float a11 = smoothstep(e11,e12,x);
  float a12 = smoothstep(e12,e13,x);
  float a13 = smoothstep(e13,e14,x);
  float a14 = smoothstep(e14,e15,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),
    max(mix(v7,v8,a7)*step(e7,x)*step(x,e8),
    max(mix(v8,v9,a8)*step(e8,x)*step(x,e9),
    max(mix(v9,v10,a9)*step(e9,x)*step(x,e10),
    max(mix(v10,v11,a10)*step(e10,x)*step(x,e11),
    max(mix(v11,v12,a11)*step(e11,x)*step(x,e12),
    max(mix(v12,v13,a12)*step(e12,x)*step(x,e13),
    max(mix(v13,v14,a13)*step(e13,x)*step(x,e14),mix(v14,v15,a14)*step(e14,x)*step(x,e15)
  ))))))))))))));
}
`,Ba=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.21176470588235294,0.054901960784313725,0.1411764705882353,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.34901960784313724,0.09019607843137255,0.3137254901960784,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.43137254901960786,0.17647058823529413,0.5176470588235295,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.47058823529411764,0.30196078431372547,0.6980392156862745,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.47058823529411764,0.44313725490196076,0.8352941176470589,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.45098039215686275,0.592156862745098,0.8941176470588236,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.5254901960784314,0.7254901960784313,0.8901960784313725,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.6941176470588235,0.8392156862745098,0.8901960784313725,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.9019607843137255,0.9450980392156862,0.9450980392156862,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,va=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0,0,0.5098039215686274,1);
  const float e1 = 0.1;
  const vec4 v1 = vec4(0,0.7058823529411765,0.7058823529411765,1);
  const float e2 = 0.2;
  const vec4 v2 = vec4(0.1568627450980392,0.8235294117647058,0.1568627450980392,1);
  const float e3 = 0.4;
  const vec4 v3 = vec4(0.9019607843137255,0.9019607843137255,0.19607843137254902,1);
  const float e4 = 0.6;
  const vec4 v4 = vec4(0.47058823529411764,0.27450980392156865,0.0784313725490196,1);
  const float e5 = 1.0;
  const vec4 v5 = vec4(1,1,1,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),mix(v4,v5,a4)*step(e4,x)*step(x,e5)
  ))));
}
`,xa=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0,0,0,1);
  const float e1 = 0.15;
  const vec4 v1 = vec4(0.11764705882352941,0,0.39215686274509803,1);
  const float e2 = 0.4;
  const vec4 v2 = vec4(0.47058823529411764,0,0.39215686274509803,1);
  const float e3 = 0.6;
  const vec4 v3 = vec4(0.6274509803921569,0.35294117647058826,0,1);
  const float e4 = 0.8;
  const vec4 v4 = vec4(0.9019607843137255,0.7843137254901961,0,1);
  const float e5 = 1.0;
  const vec4 v5 = vec4(1,0.9803921568627451,0.8627450980392157,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),mix(v4,v5,a4)*step(e4,x)*step(x,e5)
  ))));
}
`,Qa=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.11764705882352941,0.01568627450980392,0.43137254901960786,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.1843137254901961,0.054901960784313725,0.6901960784313725,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.1607843137254902,0.17647058823529413,0.9254901960784314,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.09803921568627451,0.38823529411764707,0.8313725490196079,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.26666666666666666,0.5137254901960784,0.7843137254901961,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.4470588235294118,0.611764705882353,0.7725490196078432,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.615686274509804,0.7098039215686275,0.796078431372549,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.7843137254901961,0.8156862745098039,0.8470588235294118,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.9450980392156862,0.9294117647058824,0.9254901960784314,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,ya=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.23529411764705882,0.03529411764705882,0.07058823529411765,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.39215686274509803,0.06666666666666667,0.10588235294117647,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.5568627450980392,0.0784313725490196,0.11372549019607843,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.6941176470588235,0.16862745098039217,0.10588235294117647,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.7529411764705882,0.3411764705882353,0.24705882352941178,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.803921568627451,0.49019607843137253,0.4117647058823529,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.8470588235294118,0.6352941176470588,0.5803921568627451,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.8901960784313725,0.7803921568627451,0.7568627450980392,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.9450980392156862,0.9294117647058824,0.9254901960784314,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,wa=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0,0.26666666666666666,0.10588235294117647,1);
  const float e1 = 0.125;
  const vec4 v1 = vec4(0,0.42745098039215684,0.17254901960784313,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.13725490196078433,0.5450980392156862,0.27058823529411763,1);
  const float e3 = 0.375;
  const vec4 v3 = vec4(0.2549019607843137,0.6705882352941176,0.36470588235294116,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.4549019607843137,0.7686274509803922,0.4627450980392157,1);
  const float e5 = 0.625;
  const vec4 v5 = vec4(0.6313725490196078,0.8509803921568627,0.6078431372549019,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.7803921568627451,0.9137254901960784,0.7529411764705882,1);
  const float e7 = 0.875;
  const vec4 v7 = vec4(0.8980392156862745,0.9607843137254902,0.8784313725490196,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.9686274509803922,0.9882352941176471,0.9607843137254902,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,_a=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0,0,0,1);
  const float e1 = 1.0;
  const vec4 v1 = vec4(1,1,1,1);
  float a0 = smoothstep(e0,e1,x);
  return mix(v0,v1,a0)*step(e0,x)*step(x,e1);
}
`,Da=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0,0,0,1);
  const float e1 = 0.3;
  const vec4 v1 = vec4(0.9019607843137255,0,0,1);
  const float e2 = 0.6;
  const vec4 v2 = vec4(1,0.8235294117647058,0,1);
  const float e3 = 1.0;
  const vec4 v3 = vec4(1,1,1,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),mix(v2,v3,a2)*step(e2,x)*step(x,e3)
  ));
}
`,Sa=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(1,0,0,1);
  const float e1 = 0.169;
  const vec4 v1 = vec4(0.9921568627450981,1,0.00784313725490196,1);
  const float e2 = 0.173;
  const vec4 v2 = vec4(0.9686274509803922,1,0.00784313725490196,1);
  const float e3 = 0.337;
  const vec4 v3 = vec4(0,0.9882352941176471,0.01568627450980392,1);
  const float e4 = 0.341;
  const vec4 v4 = vec4(0,0.9882352941176471,0.0392156862745098,1);
  const float e5 = 0.506;
  const vec4 v5 = vec4(0.00392156862745098,0.9764705882352941,1,1);
  const float e6 = 0.671;
  const vec4 v6 = vec4(0.00784313725490196,0,0.9921568627450981,1);
  const float e7 = 0.675;
  const vec4 v7 = vec4(0.03137254901960784,0,0.9921568627450981,1);
  const float e8 = 0.839;
  const vec4 v8 = vec4(1,0,0.984313725490196,1);
  const float e9 = 0.843;
  const vec4 v9 = vec4(1,0,0.9607843137254902,1);
  const float e10 = 1.0;
  const vec4 v10 = vec4(1,0,0.023529411764705882,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  float a8 = smoothstep(e8,e9,x);
  float a9 = smoothstep(e9,e10,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),
    max(mix(v7,v8,a7)*step(e7,x)*step(x,e8),
    max(mix(v8,v9,a8)*step(e8,x)*step(x,e9),mix(v9,v10,a9)*step(e9,x)*step(x,e10)
  )))))))));
}
`,Na=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0,0,0.01568627450980392,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.12156862745098039,0.047058823529411764,0.2823529411764706,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.3333333333333333,0.058823529411764705,0.42745098039215684,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.5333333333333333,0.13333333333333333,0.41568627450980394,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.7294117647058823,0.21176470588235294,0.3333333333333333,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.8901960784313725,0.34901960784313724,0.2,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.9764705882352941,0.5490196078431373,0.0392156862745098,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.9764705882352941,0.788235294117647,0.19607843137254902,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.9882352941176471,1,0.6431372549019608,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,Ra=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0,0,0.5137254901960784,1);
  const float e1 = 0.125;
  const vec4 v1 = vec4(0,0.23529411764705882,0.6666666666666666,1);
  const float e2 = 0.375;
  const vec4 v2 = vec4(0.0196078431372549,1,1,1);
  const float e3 = 0.625;
  const vec4 v3 = vec4(1,1,0,1);
  const float e4 = 0.875;
  const vec4 v4 = vec4(0.9803921568627451,0,0,1);
  const float e5 = 1.0;
  const vec4 v5 = vec4(0.5019607843137255,0,0,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),mix(v4,v5,a4)*step(e4,x)*step(x,e5)
  ))));
}
`,ba=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0,0,0.01568627450980392,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.10980392156862745,0.06274509803921569,0.26666666666666666,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.30980392156862746,0.07058823529411765,0.4823529411764706,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.5058823529411764,0.1450980392156863,0.5058823529411764,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.7098039215686275,0.21176470588235294,0.47843137254901963,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.8980392156862745,0.3137254901960784,0.39215686274509803,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.984313725490196,0.5294117647058824,0.3803921568627451,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.996078431372549,0.7607843137254902,0.5294117647058824,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.9882352941176471,0.9921568627450981,0.7490196078431373,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,Ma=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.25098039215686274,0.0196078431372549,0.0196078431372549,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.41568627450980394,0.023529411764705882,0.058823529411764705,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.5647058823529412,0.10196078431372549,0.027450980392156862,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.6588235294117647,0.25098039215686274,0.011764705882352941,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.7372549019607844,0.39215686274509803,0.01568627450980392,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.807843137254902,0.5333333333333333,0.043137254901960784,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.8627450980392157,0.6823529411764706,0.09803921568627451,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.9058823529411765,0.8431372549019608,0.17254901960784313,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.9725490196078431,0.996078431372549,0.4117647058823529,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,ka=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.2,0.0784313725490196,0.09411764705882353,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.35294117647058826,0.12549019607843137,0.13725490196078433,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.5058823529411764,0.17254901960784313,0.13333333333333333,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.6235294117647059,0.26666666666666666,0.09803921568627451,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.7137254901960784,0.38823529411764707,0.07450980392156863,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.7803921568627451,0.5254901960784314,0.08627450980392157,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.8313725490196079,0.6705882352941176,0.13725490196078433,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.8666666666666667,0.8235294117647058,0.21176470588235294,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.8823529411764706,0.9921568627450981,0.29411764705882354,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,La=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.5686274509803921,0.4117647058823529,0.07058823529411765,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.7215686274509804,0.2784313725490196,0.14901960784313725,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.7294117647058823,0.22745098039215686,0.45098039215686275,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.6274509803921569,0.2784313725490196,0.7254901960784313,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.43137254901960786,0.3803921568627451,0.8549019607843137,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.19607843137254902,0.4823529411764706,0.6431372549019608,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.12156862745098039,0.5137254901960784,0.43137254901960786,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.30196078431372547,0.5058823529411764,0.13333333333333333,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.5686274509803921,0.4117647058823529,0.07058823529411765,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,Ta=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0,0,1,1);
  const float e1 = 0.1;
  const vec4 v1 = vec4(0.2,0.6,1,1);
  const float e2 = 0.2;
  const vec4 v2 = vec4(0.4,0.8,1,1);
  const float e3 = 0.3;
  const vec4 v3 = vec4(0.6,0.8,1,1);
  const float e4 = 0.4;
  const vec4 v4 = vec4(0.8,0.8,1,1);
  const float e5 = 0.5;
  const vec4 v5 = vec4(1,1,1,1);
  const float e6 = 0.6;
  const vec4 v6 = vec4(1,0.8,1,1);
  const float e7 = 0.7;
  const vec4 v7 = vec4(1,0.6,1,1);
  const float e8 = 0.8;
  const vec4 v8 = vec4(1,0.4,0.8,1);
  const float e9 = 0.9;
  const vec4 v9 = vec4(1,0.4,0.4,1);
  const float e10 = 1.0;
  const vec4 v10 = vec4(1,0,0,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  float a8 = smoothstep(e8,e9,x);
  float a9 = smoothstep(e9,e10,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),
    max(mix(v7,v8,a7)*step(e7,x)*step(x,e8),
    max(mix(v8,v9,a8)*step(e8,x)*step(x,e9),mix(v9,v10,a9)*step(e9,x)*step(x,e10)
  )))))))));
}
`,Fa=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.050980392156862744,0.03137254901960784,0.5294117647058824,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.29411764705882354,0.011764705882352941,0.6313725490196078,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.49019607843137253,0.011764705882352941,0.6588235294117647,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.6588235294117647,0.13333333333333333,0.5882352941176471,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.796078431372549,0.27450980392156865,0.4745098039215686,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.8980392156862745,0.4196078431372549,0.36470588235294116,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.9725490196078431,0.5803921568627451,0.2549019607843137,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.9921568627450981,0.7647058823529411,0.1568627450980392,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.9411764705882353,0.9764705882352941,0.12941176470588237,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,Ga=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.047058823529411764,0.2,0.5137254901960784,1);
  const float e1 = 0.25;
  const vec4 v1 = vec4(0.0392156862745098,0.5333333333333333,0.7294117647058823,1);
  const float e2 = 0.5;
  const vec4 v2 = vec4(0.9490196078431372,0.8274509803921568,0.2196078431372549,1);
  const float e3 = 0.75;
  const vec4 v3 = vec4(0.9490196078431372,0.5607843137254902,0.2196078431372549,1);
  const float e4 = 1.0;
  const vec4 v4 = vec4(0.8509803921568627,0.11764705882352941,0.11764705882352941,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),mix(v3,v4,a3)*step(e3,x)*step(x,e4)
  )));
}
`,Ua=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.49019607843137253,0,0.7019607843137254,1);
  const float e1 = 0.1;
  const vec4 v1 = vec4(0.7803921568627451,0,0.7058823529411765,1);
  const float e2 = 0.2;
  const vec4 v2 = vec4(1,0,0.4745098039215686,1);
  const float e3 = 0.3;
  const vec4 v3 = vec4(1,0.4235294117647059,0,1);
  const float e4 = 0.4;
  const vec4 v4 = vec4(0.8705882352941177,0.7607843137254902,0,1);
  const float e5 = 0.5;
  const vec4 v5 = vec4(0.5882352941176471,1,0,1);
  const float e6 = 0.6;
  const vec4 v6 = vec4(0,1,0.21568627450980393,1);
  const float e7 = 0.7;
  const vec4 v7 = vec4(0,0.9647058823529412,0.5882352941176471,1);
  const float e8 = 0.8;
  const vec4 v8 = vec4(0.19607843137254902,0.6549019607843137,0.8705882352941177,1);
  const float e9 = 0.9;
  const vec4 v9 = vec4(0.403921568627451,0.2,0.9215686274509803,1);
  const float e10 = 1.0;
  const vec4 v10 = vec4(0.48627450980392156,0,0.7294117647058823,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  float a8 = smoothstep(e8,e9,x);
  float a9 = smoothstep(e9,e10,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),
    max(mix(v7,v8,a7)*step(e7,x)*step(x,e8),
    max(mix(v8,v9,a8)*step(e8,x)*step(x,e9),mix(v9,v10,a9)*step(e9,x)*step(x,e10)
  )))))))));
}
`,Ya=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.5882352941176471,0,0.35294117647058826,1);
  const float e1 = 0.125;
  const vec4 v1 = vec4(0,0,0.7843137254901961,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0,0.09803921568627451,1,1);
  const float e3 = 0.375;
  const vec4 v3 = vec4(0,0.596078431372549,1,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.17254901960784313,1,0.5882352941176471,1);
  const float e5 = 0.625;
  const vec4 v5 = vec4(0.592156862745098,1,0,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(1,0.9176470588235294,0,1);
  const float e7 = 0.875;
  const vec4 v7 = vec4(1,0.43529411764705883,0,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(1,0,0,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,Pa=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.0196078431372549,0.0392156862745098,0.6745098039215687,1);
  const float e1 = 0.35;
  const vec4 v1 = vec4(0.41568627450980394,0.5372549019607843,0.9686274509803922,1);
  const float e2 = 0.5;
  const vec4 v2 = vec4(0.7450980392156863,0.7450980392156863,0.7450980392156863,1);
  const float e3 = 0.6;
  const vec4 v3 = vec4(0.8627450980392157,0.6666666666666666,0.5176470588235295,1);
  const float e4 = 0.7;
  const vec4 v4 = vec4(0.9019607843137255,0.5686274509803921,0.35294117647058826,1);
  const float e5 = 1.0;
  const vec4 v5 = vec4(0.6980392156862745,0.0392156862745098,0.10980392156862745,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),mix(v4,v5,a4)*step(e4,x)*step(x,e5)
  ))));
}
`,Oa=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.16470588235294117,0.09411764705882353,0.4235294117647059,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.12941176470588237,0.19607843137254902,0.6352941176470588,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.058823529411764705,0.35294117647058826,0.5686274509803921,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.1568627450980392,0.4627450980392157,0.5372549019607843,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.23137254901960785,0.5725490196078431,0.5294117647058824,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.30980392156862746,0.6862745098039216,0.49411764705882355,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.47058823529411764,0.796078431372549,0.40784313725490196,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.7568627450980392,0.8666666666666667,0.39215686274509803,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.9921568627450981,0.9372549019607843,0.6039215686274509,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,qa=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(1,0,1,1);
  const float e1 = 1.0;
  const vec4 v1 = vec4(1,1,0,1);
  float a0 = smoothstep(e0,e1,x);
  return mix(v0,v1,a0)*step(e0,x)*step(x,e1);
}
`,Ka=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0,0.5019607843137255,0.4,1);
  const float e1 = 1.0;
  const vec4 v1 = vec4(1,1,0.4,1);
  float a0 = smoothstep(e0,e1,x);
  return mix(v0,v1,a0)*step(e0,x)*step(x,e1);
}
`,Ja=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.01568627450980392,0.13725490196078433,0.2,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.09019607843137255,0.2,0.47843137254901963,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.3333333333333333,0.23137254901960785,0.615686274509804,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.5058823529411764,0.30980392156862746,0.5607843137254902,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.6862745098039216,0.37254901960784315,0.5098039215686274,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.8705882352941177,0.4392156862745098,0.396078431372549,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.9764705882352941,0.5725490196078431,0.25882352941176473,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.9764705882352941,0.7686274509803922,0.2549019607843137,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.9098039215686274,0.9803921568627451,0.3568627450980392,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,za=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.13333333333333333,0.12156862745098039,0.10588235294117647,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.2549019607843137,0.19607843137254902,0.1607843137254902,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.3843137254901961,0.27058823529411763,0.20392156862745098,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.5137254901960784,0.34901960784313724,0.2235294117647059,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.6313725490196078,0.4392156862745098,0.23137254901960785,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.7254901960784313,0.5490196078431373,0.25882352941176473,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.792156862745098,0.6823529411764706,0.34509803921568627,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.8470588235294118,0.8196078431372549,0.49411764705882355,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.9137254901960784,0.9647058823529412,0.6705882352941176,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,ja=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.06666666666666667,0.12549019607843137,0.25098039215686274,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.13725490196078433,0.20392156862745098,0.4549019607843137,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.11372549019607843,0.3176470588235294,0.611764705882353,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.12156862745098039,0.44313725490196076,0.6352941176470588,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.19607843137254902,0.5647058823529412,0.6627450980392157,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.3411764705882353,0.6784313725490196,0.6901960784313725,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.5843137254901961,0.7686274509803922,0.7411764705882353,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.796078431372549,0.8666666666666667,0.8274509803921568,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.996078431372549,0.984313725490196,0.9019607843137255,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,Ha=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.09019607843137255,0.13725490196078433,0.07450980392156863,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.09411764705882353,0.25098039215686274,0.14901960784313725,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.043137254901960784,0.37254901960784315,0.17647058823529413,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.15294117647058825,0.4823529411764706,0.13725490196078433,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.37254901960784315,0.5725490196078431,0.047058823529411764,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.596078431372549,0.6470588235294118,0.07058823529411765,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.788235294117647,0.7294117647058823,0.27058823529411763,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.9137254901960784,0.8470588235294118,0.5372549019607843,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(1,0.9921568627450981,0.803921568627451,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,Za=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.26666666666666666,0.00392156862745098,0.32941176470588235,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.2784313725490196,0.17254901960784313,0.47843137254901963,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.23137254901960785,0.3176470588235294,0.5450980392156862,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(0.17254901960784313,0.44313725490196076,0.5568627450980392,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.12941176470588237,0.5647058823529412,0.5529411764705883,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(0.15294117647058825,0.6784313725490196,0.5058823529411764,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.3607843137254902,0.7843137254901961,0.38823529411764707,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.6666666666666666,0.8627450980392157,0.19607843137254902,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.9921568627450981,0.9058823529411765,0.1450980392156863,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,Va=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.49019607843137253,0,0.7019607843137254,1);
  const float e1 = 0.13;
  const vec4 v1 = vec4(0.6745098039215687,0,0.7333333333333333,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.8588235294117647,0,0.6666666666666666,1);
  const float e3 = 0.38;
  const vec4 v3 = vec4(1,0,0.5098039215686274,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(1,0.24705882352941178,0.2901960784313726,1);
  const float e5 = 0.63;
  const vec4 v5 = vec4(1,0.4823529411764706,0,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.9176470588235294,0.6901960784313725,0,1);
  const float e7 = 0.88;
  const vec4 v7 = vec4(0.7450980392156863,0.8941176470588236,0,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(0.5764705882352941,1,0,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,$a=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0,0,1,1);
  const float e1 = 1.0;
  const vec4 v1 = vec4(0,1,0.5019607843137255,1);
  float a0 = smoothstep(e0,e1,x);
  return mix(v0,v1,a0)*step(e0,x)*step(x,e1);
}
`,Wa=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.03137254901960784,0.11372549019607843,0.34509803921568627,1);
  const float e1 = 0.125;
  const vec4 v1 = vec4(0.1450980392156863,0.20392156862745098,0.5803921568627451,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.13333333333333333,0.3686274509803922,0.6588235294117647,1);
  const float e3 = 0.375;
  const vec4 v3 = vec4(0.11372549019607843,0.5686274509803921,0.7529411764705882,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.2549019607843137,0.7137254901960784,0.7686274509803922,1);
  const float e5 = 0.625;
  const vec4 v5 = vec4(0.4980392156862745,0.803921568627451,0.7333333333333333,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.7803921568627451,0.9137254901960784,0.7058823529411765,1);
  const float e7 = 0.875;
  const vec4 v7 = vec4(0.9294117647058824,0.9725490196078431,0.8509803921568627,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(1,1,0.8509803921568627,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,Xa=`vec4 apply_cmap (float x) {
  const float e0 = 0.0;
  const vec4 v0 = vec4(0.5019607843137255,0,0.14901960784313725,1);
  const float e1 = 0.125;
  const vec4 v1 = vec4(0.7411764705882353,0,0.14901960784313725,1);
  const float e2 = 0.25;
  const vec4 v2 = vec4(0.8901960784313725,0.10196078431372549,0.10980392156862745,1);
  const float e3 = 0.375;
  const vec4 v3 = vec4(0.9882352941176471,0.3058823529411765,0.16470588235294117,1);
  const float e4 = 0.5;
  const vec4 v4 = vec4(0.9921568627450981,0.5529411764705883,0.23529411764705882,1);
  const float e5 = 0.625;
  const vec4 v5 = vec4(0.996078431372549,0.6980392156862745,0.2980392156862745,1);
  const float e6 = 0.75;
  const vec4 v6 = vec4(0.996078431372549,0.8509803921568627,0.4627450980392157,1);
  const float e7 = 0.875;
  const vec4 v7 = vec4(1,0.9294117647058824,0.6274509803921569,1);
  const float e8 = 1.0;
  const vec4 v8 = vec4(1,1,0.8,1);
  float a0 = smoothstep(e0,e1,x);
  float a1 = smoothstep(e1,e2,x);
  float a2 = smoothstep(e2,e3,x);
  float a3 = smoothstep(e3,e4,x);
  float a4 = smoothstep(e4,e5,x);
  float a5 = smoothstep(e5,e6,x);
  float a6 = smoothstep(e6,e7,x);
  float a7 = smoothstep(e7,e8,x);
  return max(mix(v0,v1,a0)*step(e0,x)*step(x,e1),
    max(mix(v1,v2,a1)*step(e1,x)*step(x,e2),
    max(mix(v2,v3,a2)*step(e2,x)*step(x,e3),
    max(mix(v3,v4,a3)*step(e3,x)*step(x,e4),
    max(mix(v4,v5,a4)*step(e4,x)*step(x,e5),
    max(mix(v5,v6,a5)*step(e5,x)*step(x,e6),
    max(mix(v6,v7,a6)*step(e6,x)*step(x,e7),mix(v7,v8,a7)*step(e7,x)*step(x,e8)
  )))))));
}
`,qs={__proto__:null,alpha:la,autumn:ga,bathymetry:ha,blackbody:ua,bluered:da,bone:pa,cdom:fa,chlorophyll:Ia,cool:ma,copper:Ca,cubehelix:Ea,density:Ba,earth:va,electric:xa,freesurface_blue:Qa,freesurface_red:ya,greens:wa,greys:_a,hot:Da,hsv:Sa,inferno:Na,jet:Ra,magma:ba,oxygen:Ma,par:ka,phase:La,picnic:Ta,plasma:Fa,portland:Ga,rainbow:Ya,rainbow_soft:Ua,rdbu:Pa,salinity:Oa,spring:qa,summer:Ka,temperature:Ja,turbidity:za,velocity_blue:ja,velocity_green:Ha,viridis:Za,warm:Va,winter:$a,yignbu:Wa,yiorrd:Xa};function ei(A,e){const t=`additive_colormap_${A}`;return{name:t,uniformTypes:{opacity:"f32",useTransparentColor:"u32"},fs:`uniform ${t}Uniforms {
  float opacity;
  uint useTransparentColor; //no bool-like type in decode-shader-types.ts
} ${t};
${Ys}
${e}
vec4 colormap(float intensity) {
  float opacity = ${t}.opacity;
  bool useTransparentColor = ${t}.useTransparentColor != uint(0);
  return vec4(apply_transparent_color(apply_cmap(min(1.,intensity)).xyz, apply_cmap(0.).xyz, useTransparentColor, opacity));
}`,inject:{"fs:DECKGL_MUTATE_COLOR":`  float intensityCombo = 0.;
  for (int i = 0; i < NUM_CHANNELS; i++) {
    intensityCombo += max(0.,intensity[i]);
  }
  rgba = colormap(intensityCombo);`}}}const Gt={colormap:{type:"string",value:"viridis",compare:!0},opacity:{type:"number",value:1,compare:!0},useTransparentColor:{type:"boolean",value:!1,compare:!0}},Ks=class extends Te{getVivShaderTemplates(){const A=this?.props?.colormap||Gt.colormap.value,e=qs[A];if(!e)throw Error(`No colormap named ${A} found in registry`);return{modules:[ei(A,e)]}}updateState({props:A,oldProps:e,changeFlags:t,...s}){super.updateState({props:A,oldProps:e,changeFlags:t,...s});const n=`additive_colormap_${this?.props?.colormap||Gt.colormap.value}`,a=this.getModels();for(const i of a)i.shaderInputs.setProps({[n]:{opacity:this.props.opacity,useTransparentColor:this.props.useTransparentColor}})}};Ks.extensionName="AdditiveColormapExtension";Ks.defaultProps=Gt;function ti(A,e,t){for(let s=0;s<t;s+=1)A.push(e);return A}const HA=[[0,0,255],[0,255,0],[255,0,255],[255,255,0],[255,128,0],[0,255,255],[255,255,255],[255,0,0]];function cA(A){if(A>HA.length)throw new Error("Too many colors");return HA.slice(0,A)}function lA({colors:A,channelsVisible:e}){const t=A.map((n,a)=>e[a]?n.map(i=>i/na):JA),s=Ee-t.length;return ti(t,JA,s)}const Ce="colorPaletteModule",Ai=`uniform ${Ce}Uniforms {
  vec3 transparentColor;
  uint useTransparentColor;
  float opacity;
  vec3 color${m};
} ${Ce};

${Ys}

void mutate_color(inout vec3 rgb, float[NUM_CHANNELS] intensity) {
  vec3 colors[NUM_CHANNELS] = vec3[NUM_CHANNELS](
    ${Ce}.color${m},
  );
  for(int i = 0; i < NUM_CHANNELS; i++) {
    rgb += max(0.0, min(1.0, intensity[i])) * vec3(colors[i]);
  }
}
vec4 apply_opacity(vec3 rgb) {
  bool useTransparentColor = ${Ce}.useTransparentColor != uint(0);
  return vec4(apply_transparent_color(rgb, ${Ce}.transparentColor, useTransparentColor, ${Ce}.opacity));
}
`,si=`vec3 rgb = rgba.rgb;
mutate_color(rgb, intensity);
rgba = apply_opacity(rgb);
`,oi={name:Ce,uniformTypes:{transparentColor:"vec3<f32>",useTransparentColor:"u32",opacity:"f32",[`color${m}`]:"vec3<f32>"},fs:Ai,inject:{"fs:DECKGL_MUTATE_COLOR":si}},gt={colors:{type:"array",value:null,compare:!0},opacity:{type:"number",value:1,compare:!0},transparentColor:{type:"array",value:null,compare:!0},useTransparentColor:{type:"boolean",value:!1,compare:!0}},ze=class extends Te{getVivShaderTemplates(){return{modules:[oi]}}updateState({props:A,oldProps:e,changeFlags:t,...s}){super.updateState({props:A,oldProps:e,changeFlags:t,...s});const{colors:o,channelsVisible:n,opacity:a=gt.opacity.value,transparentColor:i=gt.transparentColor.value,useTransparentColor:r=gt.useTransparentColor.value}=this.props,c=this.props.selections||this.selections||[],l=c.length,g=lA({channelsVisible:n||c.map(()=>!0),colors:o||cA(l)}),h={opacity:a,transparentColor:(i||[0,0,0]).map(u=>u/255),useTransparentColor:r?1:0};for(let u=0;u<l;u++)h[`color${u}`]=g[u];for(const u of this.getModels())u.shaderInputs.setProps({colorPaletteModule:h})}};ze.extensionName="ColorPaletteExtension";ze.defaultProps=gt;const F="lensModule",ni=`uniform ${F}Uniforms {
  // lens bounds for ellipse
  float majorLensAxis;
  float minorLensAxis;

  // lens uniforms
  vec2 lensCenter;
  uint lensEnabled;
  int lensSelection;
  vec3 lensBorderColor;
  float lensBorderRadius;

  // color palette
  vec3 color${m};
} ${F};

bool frag_in_lens_bounds(vec2 vTexCoord) {
  // Check membership in what is (not visually, but effectively) an ellipse.
  // Since the fragment space is a unit square and the real coordinates could be longer than tall,
  // to get a circle visually we have to treat the check as that of an ellipse to get the effect of a circle.

  // Check membership in ellipse.
  return pow((${F}.lensCenter.x - vTexCoord.x) / ${F}.majorLensAxis, 2.) + pow((${F}.lensCenter.y - vTexCoord.y) / ${F}.minorLensAxis, 2.) < (1. - ${F}.lensBorderRadius);
}

bool frag_on_lens_bounds(vec2 vTexCoord) {
  // Same as the above, except this checks the boundary.

  float ellipseDistance = pow((${F}.lensCenter.x - vTexCoord.x) / ${F}.majorLensAxis, 2.) + pow((${F}.lensCenter.y - vTexCoord.y) / ${F}.minorLensAxis, 2.);

  // Check membership on "bourndary" of ellipse.
  return ellipseDistance <= 1. && ellipseDistance >= (1. - ${F}.lensBorderRadius);
}
// Return a float for boolean arithmetic calculation.
float get_use_color_float(vec2 vTexCoord, int channelIndex) {
  bool lensEnabled = ${F}.lensEnabled != uint(0);
  bool isFragInLensBounds = frag_in_lens_bounds(vTexCoord);
  bool inLensAndUseLens = lensEnabled && isFragInLensBounds;
  return float(int((inLensAndUseLens && channelIndex == ${F}.lensSelection) || (!inLensAndUseLens)));
 
}
void mutate_color(inout vec3 rgb, float[NUM_CHANNELS] intensity, vec2 vTexCoord) {
  vec3 colors[NUM_CHANNELS] = vec3[NUM_CHANNELS](
    ${F}.color${m},
  );
  for(int i = 0; i < NUM_CHANNELS; i++) {
    float useColorValue = get_use_color_float(vTexCoord, i);
    rgb += max(0., min(1., intensity[i])) * max(vec3(colors[i]), (1. - useColorValue) * vec3(1., 1., 1.));
  }
}
`,ai={name:F,uniformTypes:{majorLensAxis:"f32",minorLensAxis:"f32",lensCenter:"vec2<f32>",lensEnabled:"u32",lensSelection:"i32",lensBorderColor:"vec3<f32>",lensBorderRadius:"f32",[`color${m}`]:"vec3<f32>"},fs:ni,inject:{"fs:DECKGL_MUTATE_COLOR":`
   vec3 rgb = rgba.rgb;
   mutate_color(rgb, intensity, vTexCoord);
   rgba = vec4(rgb, 1.);
  `,"fs:#main-end":`
      bool lensEnabled = ${F}.lensEnabled != uint(0);
      bool isFragOnLensBounds = frag_on_lens_bounds(vTexCoord);
      fragColor = (lensEnabled && isFragOnLensBounds) ? vec4(${F}.lensBorderColor, 1.) : fragColor;
  `}},_e={lensEnabled:{type:"boolean",value:!1,compare:!0},lensSelection:{type:"number",value:0,compare:!0},lensRadius:{type:"number",value:100,compare:!0},lensBorderColor:{type:"array",value:[255,255,255],compare:!0},lensBorderRadius:{type:"number",value:.02,compare:!0},colors:{type:"array",value:null,compare:!0}},Js=class extends Te{getVivShaderTemplates(){return{modules:[ai]}}initializeState(){const A=this.getCurrentLayer();if(A.isComposite)return;const e=()=>{const{viewportId:t}=A.props,{lensRadius:s=_e.lensRadius.value}=this.props;if(!t){A.setState({unprojectLensBounds:[0,0,0,0]});return}const{mousePosition:o}=A.context,n=A.context.deck.viewManager.views.filter(r=>r.id===t)[0],a=A.context.deck.viewManager.viewState[t],i=n.makeViewport({...a,viewState:a});if(o&&i.containsPixel(o)){const r={x:o.x-i.x,y:o.y-i.y},l=[[r.x-s,r.y],[r.x,r.y+s],[r.x+s,r.y],[r.x,r.y-s]].map((g,h)=>i.unproject(g)[h%2]);A.setState({unprojectLensBounds:l})}else A.setState({unprojectLensBounds:[0,0,0,0]})};this.context.deck&&this.context.deck.eventManager.on({pointermove:e,pointerleave:e,wheel:e}),this.setState({onMouseMove:e,unprojectLensBounds:[0,0,0,0]})}draw(){const{unprojectLensBounds:A=[0,0,0,0]}=this.state,{bounds:e,lensEnabled:t=_e.lensEnabled.value,lensSelection:s=_e.lensSelection.value,lensBorderColor:o=_e.lensBorderColor.value,lensBorderRadius:n=_e.lensBorderRadius.value,colors:a,channelsVisible:i}=this.props,[r,c,l,g]=A,[h,u,f,v]=e,x=(r-h)/(f-h),B=(c-v)/(u-v),D=(l-h)/(f-h),R=(g-v)/(u-v),M=this.props.selections||this.selections||[],P=this.getNumChannels(),O=lA({channelsVisible:i||M.map(()=>!0),colors:a||cA(P)}),z={majorLensAxis:(D-x)/2,minorLensAxis:(B-R)/2,lensCenter:[(D+x)/2,(B+R)/2],lensEnabled:t?1:0,lensSelection:s,lensBorderColor:o.map(q=>q/255),lensBorderRadius:n};for(let q=0;q<P;q++)z[`color${q}`]=O[q];this.state.model?.shaderInputs.setProps({lensModule:z})}finalizeState(){this.context.deck&&this.context.deck.eventManager.off({pointermove:this.state?.onMouseMove,pointerleave:this.state?.onMouseMove,wheel:this.state?.onMouseMove})}};Js.extensionName="LensExtension";Js.defaultProps=_e;function ii(A,e){const t=`${e}

vec4 colormap(float intensity, float opacity) {
  return vec4(apply_cmap(min(1.,intensity)).xyz, opacity);
}`;return{name:`additive-colormap-3d-${A}`,fs:t}}const zs={colormap:{type:"string",value:"viridis",compare:!0}},je=class extends Te{constructor(...e){super(e),this.opts=this.opts||{}}getVivShaderTemplates(){const e=this?.props?.colormap||zs.colormap.value,t=qs[e];return{modules:[ii(e,t)]}}updateState({props:e,oldProps:t,changeFlags:s,...o}){if(super.updateState({props:e,oldProps:t,changeFlags:s,...o}),e.colormap!==t.colormap){const{device:n}=this.context;this.state.model&&(this.state.model.destroy(),this.setState({model:this._getModel(n)}))}}};je.extensionName="BaseExtension";je.defaultProps=zs;const ri=`// additive-colormap-3d before render
  float intensityValue${m} = 0.0;
`,ci=`// additive-colormap-3d render
  float total = 0.0;

  // this will create an unrolled accumulation over all channels
  total += intensityValue${m};
  // Do not go past 1 in opacity/colormap value.
  total = min(total, 1.0);

  vec4 val_color = colormap(total, total);

  // Opacity correction
  val_color.a = 1.0 - pow(1.0 - val_color.a, 1.0);
  color.rgb += (1.0 - color.a) * val_color.a * val_color.rgb;
  color.a += (1.0 - color.a) * val_color.a;
  if (color.a >= 0.95) {
    break;
  }
  p += ray_dir * dt;
`,li="",gi=class extends je{constructor(e){super(e),this.rendering={_BEFORE_RENDER:ri,_RENDER:ci,_AFTER_RENDER:li}}};gi.extensionName="AdditiveBlendExtension";const hi=`  float maxVal${m} = -1.;
`,ui=`  maxVal${m} = max(intensityValue${m}, maxVal${m});
`,di=`  float total = 0.0;
  total += maxVal${m};
  // Do not go past 1 in opacity/colormap value.
  total = min(total, 1.0);
  color = colormap(total, total);
`,pi=class extends je{constructor(e){super(e),this.rendering={_BEFORE_RENDER:hi,_RENDER:ui,_AFTER_RENDER:di}}};pi.extensionName="MaximumIntensityProjectionExtension";const fi=`  float minVal${m} = 1. / 0.;
`,Ii=`  minVal${m} = min(intensityValue${m}, minVal${m});
`,mi=`  float total = 0.0;
  total += minVal${m};
  // Do not go past 1 in opacity/colormap value.
  total = min(total, 1.0);
  color = colormap(total, total);
`,Ci=class extends je{constructor(e){super(e),this.rendering={_BEFORE_RENDER:fi,_RENDER:Ii,_AFTER_RENDER:mi}}};Ci.extensionName="MinimumIntensityProjectionExtension";const Ei={colors:{type:"array",value:null,compare:!0}},Fe=class extends Te{constructor(...A){super(A),this.opts=this.opts||{}}getVivShaderTemplates(){return{}}};Fe.extensionName="BaseExtension";Fe.defaultProps=Ei;const Bi=`// additive-blend before render
  float intensityValue${m} = 0.0;`,vi=`// additive-blend render
  vec3 rgbCombo = vec3(0.0);
  vec3 hsvCombo = vec3(0.0);
  float total = 0.0;
  total += intensityValue${m};
  rgbCombo += max(0.0, min(1.0, intensityValue${m})) * fragmentUniforms3D.color${m};
  // Do not go past 1 in opacity.
  total = min(total, 1.0);
  vec4 val_color = vec4(rgbCombo, total);
  // Opacity correction
  val_color.a = 1.0 - pow(1.0 - val_color.a, 1.0);
  color.rgb += (1.0 - color.a) * val_color.a * val_color.rgb;
  color.a += (1.0 - color.a) * val_color.a;
  if (color.a >= 0.95) {
    break;
  }`,xi="",js=class extends Fe{constructor(A){super(A),this.rendering={_BEFORE_RENDER:Bi,_RENDER:vi,_AFTER_RENDER:xi}}};js.extensionName="AdditiveBlendExtension";const Qi=`  float maxVal${m} = -1.0;
`,yi=`  maxVal${m} = max(intensityValue${m}, maxVal${m});
`,wi=`  vec3 rgbCombo = vec3(0.0);
  rgbCombo += max(0.0, min(1.0, maxVal${m})) * fragmentUniforms3D.color${m};
  color = vec4(rgbCombo, 1.0);
`,_i=class extends Fe{constructor(A){super(A),this.rendering={_BEFORE_RENDER:Qi,_RENDER:yi,_AFTER_RENDER:wi}}};_i.extensionName="MaximumIntensityProjectionExtension";const Di=`  float minVal${m} = 1.0 / 0.0;
`,Si=`  minVal${m} = min(intensityValue${m}, minVal${m});
`,Ni=`  vec3 rgbCombo = vec3(0.0);
  rgbCombo += max(0.0, min(1.0, minVal${m})) * fragmentUniforms3D.color${m};
  color = vec4(rgbCombo, 1.0);
`,Ri=class extends Fe{constructor(A){super(A),this.rendering={_BEFORE_RENDER:Di,_RENDER:Si,_AFTER_RENDER:Ni}}};Ri.extensionName="MinimumIntensityProjectionExtension";const Hs={BaseExtension:Fe,AdditiveBlendExtension:js},bi=new Map;function ge(A,e){Array.isArray(A)||(A=[A]),A.forEach(t=>bi.set(t,e))}ge([void 0,1],()=>we(()=>import("./raw-BS1OOAfz.js"),__vite__mapDeps([0,1,2])).then(A=>A.default));ge(5,()=>we(()=>import("./lzw-DdbX7S2a.js"),__vite__mapDeps([3,1,2])).then(A=>A.default));ge(6,()=>{throw new Error("old style JPEG compression is not supported.")});ge(7,()=>we(()=>import("./jpeg-8dCx0vjj.js"),__vite__mapDeps([4,1,2])).then(A=>A.default));ge([8,32946],()=>we(()=>import("./deflate-lwd88uHS.js"),__vite__mapDeps([5,6,1,2])).then(A=>A.default));ge(32773,()=>we(()=>import("./packbits-BdESE3PB.js"),__vite__mapDeps([7,1,2])).then(A=>A.default));ge(34887,()=>we(()=>import("./lerc-DOgKnjFc.js"),__vite__mapDeps([8,6,1,2])).then(async A=>(await A.zstd.init(),A)).then(A=>A.default));ge(50001,()=>we(()=>import("./webimage-Bgei7wlL.js"),__vite__mapDeps([9,1,2])).then(A=>A.default));function Mi(A,e){let t=A.length-e,s=0;do{for(let o=e;o>0;o--)A[s+e]+=A[s],s++;t-=e}while(t>0)}function ki(A,e,t){let s=0,o=A.length;const n=o/t;for(;o>e;){for(let i=e;i>0;--i)A[s+e]+=A[s],++s;o-=e}const a=A.slice();for(let i=0;i<n;++i)for(let r=0;r<t;++r)A[t*i+r]=a[(t-r-1)*n+i]}function Li(A,e,t,s,o,n){if(e===1)return A;for(let r=0;r<o.length;++r){if(o[r]%8!==0)throw new Error("When decoding with predictor, only multiple of 8 bits are supported.");if(o[r]!==o[0])throw new Error("When decoding with predictor, all samples must have the same size.")}const a=o[0]/8,i=n===2?1:o.length;for(let r=0;r<s&&!(r*i*t*a>=A.byteLength);++r){let c;if(e===2){switch(o[0]){case 8:c=new Uint8Array(A,r*i*t*a,i*t*a);break;case 16:c=new Uint16Array(A,r*i*t*a,i*t*a/2);break;case 32:c=new Uint32Array(A,r*i*t*a,i*t*a/4);break;default:throw new Error(`Predictor 2 not allowed with ${o[0]} bits per sample.`)}Mi(c,i)}else e===3&&(c=new Uint8Array(A,r*i*t*a,i*t*a),ki(c,i,a))}return A}class Ti{async decode(e,t){const s=await this.decodeBlock(t),o=e.Predictor||1;if(o!==1){const n=!e.StripOffsets,a=n?e.TileWidth:e.ImageWidth,i=n?e.TileLength:e.RowsPerStrip||e.ImageLength;return Li(s,o,a,i,e.BitsPerSample,e.PlanarConfiguration)}return s}}let V,et=null;function ZA(){return et!==null&&et.buffer===V.memory.buffer||(et=new Uint8Array(V.memory.buffer)),et}let VA=0,tt=null;function $A(){return tt!==null&&tt.buffer===V.memory.buffer||(tt=new Int32Array(V.memory.buffer)),tt}async function gA(A){A===void 0&&(A="".replace(/\.js$/,"_bg.wasm")),(typeof A=="string"||typeof Request=="function"&&A instanceof Request||typeof URL=="function"&&A instanceof URL)&&(A=fetch(A));const{instance:e,module:t}=await(async function(s,o){if(typeof Response=="function"&&s instanceof Response){if(typeof WebAssembly.instantiateStreaming=="function")try{return await WebAssembly.instantiateStreaming(s,o)}catch(a){if(s.headers.get("Content-Type")=="application/wasm")throw a;console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n",a)}const n=await s.arrayBuffer();return await WebAssembly.instantiate(n,o)}{const n=await WebAssembly.instantiate(s,o);return n instanceof WebAssembly.Instance?{instance:n,module:s}:n}})(await A,{});return V=e.exports,gA.__wbindgen_wasm_module=t,V}var Fi=Object.freeze({__proto__:null,decompress:function(A,e){try{const c=V.__wbindgen_add_to_stack_pointer(-16);var t=(function(l,g){const h=g(1*l.length);return ZA().set(l,h/1),VA=l.length,h})(A,V.__wbindgen_malloc),s=VA;V.decompress(c,t,s,e);var o=$A()[c/4+0],n=$A()[c/4+1],a=(i=o,r=n,ZA().subarray(i/1,i/1+r)).slice();return V.__wbindgen_free(o,1*n),a}finally{V.__wbindgen_add_to_stack_pointer(16)}var i,r},default:gA});const Gi=[62,0,0,0,63,52,53,54,55,56,57,58,59,60,61,0,0,0,0,0,0,0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,0,0,0,0,0,0,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51];function At(A){return Gi[A-43]}const Ui=(function(A){let e,t=A.endsWith("==")?2:A.endsWith("=")?1:0,s=A.length,o=new Uint8Array(s/4*3);for(let n=0,a=0;n<s;n+=4,a+=3)e=At(A.charCodeAt(n))<<18|At(A.charCodeAt(n+1))<<12|At(A.charCodeAt(n+2))<<6|At(A.charCodeAt(n+3)),o[a]=e>>16,o[a+1]=e>>8&255,o[a+2]=255&e;return o.subarray(0,o.length-t)})("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NwMAIANBEGokAA8LIARBCEHYhcAAEDcACyACQQhByIXAABA3AAuqAgEDfyMAQYABayIEJAACQAJAAn8CQCABKAIAIgNBEHFFBEAgACgCACECIANBIHENASACrSABEBUMAgsgACgCACECQQAhAANAIAAgBGpB/wBqIAJBD3EiA0EwciADQdcAaiADQQpJGzoAACAAQX9qIQAgAkEEdiICDQALIABBgAFqIgJBgQFPDQIgAUGkjsAAQQIgACAEakGAAWpBACAAaxAIDAELQQAhAANAIAAgBGpB/wBqIAJBD3EiA0EwciADQTdqIANBCkkbOgAAIABBf2ohACACQQR2IgINAAsgAEGAAWoiAkGBAU8NAiABQaSOwABBAiAAIARqQYABakEAIABrEAgLIARBgAFqJAAPCyACQYABQZSOwAAQOQALIAJBgAFBlI7AABA5AAuxAgEEfyMAQUBqIgIkACABKAIEIgNFBEAgAUEEaiEDIAEoAgAhBCACQQA2AiAgAkIBNwMYIAIgAkEYajYCJCACQThqIARBEGopAgA3AwAgAkEwaiAEQQhqKQIANwMAIAIgBCkCADcDKCACQSRqQdiJwAAgAkEoahAJGiACQRBqIgQgAigCIDYCACACIAIpAxg3AwgCQCABKAIEIgVFDQAgAUEIaigCAEUNACAFEAQLIAMgAikDCDcCACADQQhqIAQoAgA2AgAgAygCACEDCyABQQE2AgQgAUEMaigCACEEIAFBCGoiASgCACEFIAFCADcCAEEMQQQQWSIBRQRAQQxBBBBjAAsgASAENgIIIAEgBTYCBCABIAM2AgAgAEGQi8AANgIEIAAgATYCACACQUBrJAAL/AEBAn8jAEEQayICJAAgACgCACACQQA2AgwCfwJAAkAgAUGAAU8EQCABQYAQSQ0BIAJBDGohACABQYCABE8NAiACIAFBP3FBgAFyOgAOIAIgAUEMdkHgAXI6AAwgAiABQQZ2QT9xQYABcjoADUEDDAMLIAIgAToADCACQQxqIQBBAQwCCyACIAFBP3FBgAFyOgANIAIgAUEGdkHAAXI6AAwgAkEMaiEAQQIMAQsgAiABQT9xQYABcjoADyACIAFBEnZB8AFyOgAMIAIgAUEGdkE/cUGAAXI6AA4gAiABQQx2QT9xQYABcjoADUEECyEBIAAgARALIAJBEGokAAv5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QSxqQQI2AgAgAUE8akEhNgIAIAFCAjcCHCABQayMwAA2AhggAUEdNgI0IAEgAUEwajYCKCABIAFBEGo2AjggASABQQhqNgIwIAFBGGpB8IDAABBRAAtxAQN/IwBBIGsiAiQAAkAgACABEBkNACABQRxqKAIAIQMgASgCGCACQRxqQQA2AgAgAkHwi8AANgIYIAJCATcCDCACQfSLwAA2AgggAyACQQhqEAkNACAAQQRqIAEQGSACQSBqJAAPCyACQSBqJABBAQswAQF/AkACQEGAwABBAhBZIgENAQwAC0GAwABBAhBjAAsgACABNgIAIABBgCA2AgQLewECfwJAAkAgACgCBCIBBEAgACgCDCICIAFPDQEgACgCACIBIAJqIAEtAAA6AAAgAEEANgIIIAAgACgCDEEBajYCDCAAKAIERQ0CIAAoAgAtAAAPC0EAQQBBiIbAABA2AAsgAiABQZiGwAAQNgALQQBBAEGohsAAEDYAC2gBAn8gACAALQBGIgFBAWoiAjoACiAAQQEgAUEPcXRBAmoiATsBQCAAQX8gAkEPcXRBf3M7AQggAEEYaigCACABQf//A3EiAU8EQCAAIAE2AhgLIABBJGooAgAgAU8EQCAAIAE2AiQLC1ABAX8gAEEUaigCACIBRSABQQJ0RXJFBEAgACgCEBAECyAAQSBqKAIAIgFFIAFBAXRFckUEQCAAKAIcEAQLIABBLGooAgAEQCAAKAIoEAQLC2wBAX8jAEEwayIDJAAgAyABNgIEIAMgADYCACADQRxqQQI2AgAgA0EsakEcNgIAIANCAjcCDCADQYCNwAA2AgggA0EcNgIkIAMgA0EgajYCGCADIAM2AiggAyADQQRqNgIgIANBCGogAhBRAAtsAQF/IwBBMGsiAyQAIAMgATYCBCADIAA2AgAgA0EcakECNgIAIANBLGpBHDYCACADQgI3AgwgA0HMkcAANgIIIANBHDYCJCADIANBIGo2AhggAyADQQRqNgIoIAMgAzYCICADQQhqIAIQUQALbAEBfyMAQTBrIgMkACADIAE2AgQgAyAANgIAIANBHGpBAjYCACADQSxqQRw2AgAgA0ICNwIMIANBgJLAADYCCCADQRw2AiQgAyADQSBqNgIYIAMgA0EEajYCKCADIAM2AiAgA0EIaiACEFEAC2wBAX8jAEEwayIDJAAgAyABNgIEIAMgADYCACADQRxqQQI2AgAgA0EsakEcNgIAIANCAjcCDCADQayRwAA2AgggA0EcNgIkIAMgA0EgajYCGCADIANBBGo2AiggAyADNgIgIANBCGogAhBRAAtcAQF/IwBBEGsiAyQAAkAgACgCBCABayACTwRAIANBADYCAAwBCyADIAAgASACEBYgAygCAEEBRw0AIANBCGooAgAiAARAIAMoAgQgABBjAAsQXQALIANBEGokAAtaAQF/IwBBEGsiAiQAAkAgACgCBCABa0EBTwRAIAJBADYCAAwBCyACIAAgARAeIAIoAgBBAUcNACACQQhqKAIAIgAEQCACKAIEIAAQYwALEF0ACyACQRBqJAALWgEBfyMAQRBrIgIkAAJAIAAoAgQgAWtBAU8EQCACQQA2AgAMAQsgAiAAIAEQHSACKAIAQQFHDQAgAkEIaigCACIABEAgAigCBCAAEGMACxBdAAsgAkEQaiQAC1kBAX8jAEEgayICJAAgAiAAKAIANgIEIAJBGGogAUEQaikCADcDACACQRBqIAFBCGopAgA3AwAgAiABKQIANwMIIAJBBGpB2InAACACQQhqEAkgAkEgaiQAC0YAAkBBCCACSQRAAn9BCCACSQRAIAIgAxAQDAELIAMQAAsiAg0BQQAPCyAAIAMQCg8LIAIgACADIAEgASADSxsQSyAAEAQLWQEBfyMAQSBrIgIkACACIAAoAgA2AgQgAkEYaiABQRBqKQIANwMAIAJBEGogAUEIaikCADcDACACIAEpAgA3AwggAkEEakHwj8AAIAJBCGoQCSACQSBqJAALWQACQAJAAkAgAUF/SgRAAkAgAgRAIAENAQwECyABRQ0DIAFBARBZIgINBAwCCyABEEciAkUNAQwDCxBdAAsgAUEBEGMAC0EBIQILIAAgATYCBCAAIAI2AgALVgEBfyMAQSBrIgIkACACIAA2AgQgAkEYaiABQRBqKQIANwMAIAJBEGogAUEIaikCADcDACACIAEpAgA3AwggAkEEakHwj8AAIAJBCGoQCSACQSBqJAALWQEDfwJAIAEoAgwiAiABKAIIIgNPBEAgASgCBCIEIAJJDQEgASgCACEBIAAgAiADazYCBCAAIAEgA2o2AgAPCyADIAJB2IbAABA4AAsgAiAEQdiGwAAQNwALVQEBfyAAQRBqIAAt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");let St;async function Yi(A,e){St||(St=await(async()=>(await gA(Ui),Fi))());const t=St.decompress(A,e);if(t.length===0)throw Error("Failed to decode with LZW decoder.");return t}var N;(function(A){A.assertEqual=o=>{};function e(o){}A.assertIs=e;function t(o){throw new Error}A.assertNever=t,A.arrayToEnum=o=>{const n={};for(const a of o)n[a]=a;return n},A.getValidEnumValues=o=>{const n=A.objectKeys(o).filter(i=>typeof o[o[i]]!="number"),a={};for(const i of n)a[i]=o[i];return A.objectValues(a)},A.objectValues=o=>A.objectKeys(o).map(function(n){return o[n]}),A.objectKeys=typeof Object.keys=="function"?o=>Object.keys(o):o=>{const n=[];for(const a in o)Object.prototype.hasOwnProperty.call(o,a)&&n.push(a);return n},A.find=(o,n)=>{for(const a of o)if(n(a))return a},A.isInteger=typeof Number.isInteger=="function"?o=>Number.isInteger(o):o=>typeof o=="number"&&Number.isFinite(o)&&Math.floor(o)===o;function s(o,n=" | "){return o.map(a=>typeof a=="string"?`'${a}'`:a).join(n)}A.joinValues=s,A.jsonStringifyReplacer=(o,n)=>typeof n=="bigint"?n.toString():n})(N||(N={}));var WA;(function(A){A.mergeShapes=(e,t)=>({...e,...t})})(WA||(WA={}));const I=N.arrayToEnum(["string","nan","number","integer","float","boolean","date","bigint","symbol","function","undefined","null","array","object","unknown","promise","void","never","map","set"]),ue=A=>{switch(typeof A){case"undefined":return I.undefined;case"string":return I.string;case"number":return Number.isNaN(A)?I.nan:I.number;case"boolean":return I.boolean;case"function":return I.function;case"bigint":return I.bigint;case"symbol":return I.symbol;case"object":return Array.isArray(A)?I.array:A===null?I.null:A.then&&typeof A.then=="function"&&A.catch&&typeof A.catch=="function"?I.promise:typeof Map<"u"&&A instanceof Map?I.map:typeof Set<"u"&&A instanceof Set?I.set:typeof Date<"u"&&A instanceof Date?I.date:I.object;default:return I.unknown}},d=N.arrayToEnum(["invalid_type","invalid_literal","custom","invalid_union","invalid_union_discriminator","invalid_enum_value","unrecognized_keys","invalid_arguments","invalid_return_type","invalid_date","invalid_string","too_small","too_big","invalid_intersection_types","not_multiple_of","not_finite"]);class ce extends Error{get errors(){return this.issues}constructor(e){super(),this.issues=[],this.addIssue=s=>{this.issues=[...this.issues,s]},this.addIssues=(s=[])=>{this.issues=[...this.issues,...s]};const t=new.target.prototype;Object.setPrototypeOf?Object.setPrototypeOf(this,t):this.__proto__=t,this.name="ZodError",this.issues=e}format(e){const t=e||function(n){return n.message},s={_errors:[]},o=n=>{for(const a of n.issues)if(a.code==="invalid_union")a.unionErrors.map(o);else if(a.code==="invalid_return_type")o(a.returnTypeError);else if(a.code==="invalid_arguments")o(a.argumentsError);else if(a.path.length===0)s._errors.push(t(a));else{let i=s,r=0;for(;r<a.path.length;){const c=a.path[r];r===a.path.length-1?(i[c]=i[c]||{_errors:[]},i[c]._errors.push(t(a))):i[c]=i[c]||{_errors:[]},i=i[c],r++}}};return o(this),s}static assert(e){if(!(e instanceof ce))throw new Error(`Not a ZodError: ${e}`)}toString(){return this.message}get message(){return JSON.stringify(this.issues,N.jsonStringifyReplacer,2)}get isEmpty(){return this.issues.length===0}flatten(e=t=>t.message){const t={},s=[];for(const o of this.issues)if(o.path.length>0){const n=o.path[0];t[n]=t[n]||[],t[n].push(e(o))}else s.push(e(o));return{formErrors:s,fieldErrors:t}}get formErrors(){return this.flatten()}}ce.create=A=>new ce(A);const Ut=(A,e)=>{let t;switch(A.code){case d.invalid_type:A.received===I.undefined?t="Required":t=`Expected ${A.expected}, received ${A.received}`;break;case d.invalid_literal:t=`Invalid literal value, expected ${JSON.stringify(A.expected,N.jsonStringifyReplacer)}`;break;case d.unrecognized_keys:t=`Unrecognized key(s) in object: ${N.joinValues(A.keys,", ")}`;break;case d.invalid_union:t="Invalid input";break;case d.invalid_union_discriminator:t=`Invalid discriminator value. Expected ${N.joinValues(A.options)}`;break;case d.invalid_enum_value:t=`Invalid enum value. Expected ${N.joinValues(A.options)}, received '${A.received}'`;break;case d.invalid_arguments:t="Invalid function arguments";break;case d.invalid_return_type:t="Invalid function return type";break;case d.invalid_date:t="Invalid date";break;case d.invalid_string:typeof A.validation=="object"?"includes"in A.validation?(t=`Invalid input: must include "${A.validation.includes}"`,typeof A.validation.position=="number"&&(t=`${t} at one or more positions greater than or equal to ${A.validation.position}`)):"startsWith"in A.validation?t=`Invalid input: must start with "${A.validation.startsWith}"`:"endsWith"in A.validation?t=`Invalid input: must end with "${A.validation.endsWith}"`:N.assertNever(A.validation):A.validation!=="regex"?t=`Invalid ${A.validation}`:t="Invalid";break;case d.too_small:A.type==="array"?t=`Array must contain ${A.exact?"exactly":A.inclusive?"at least":"more than"} ${A.minimum} element(s)`:A.type==="string"?t=`String must contain ${A.exact?"exactly":A.inclusive?"at least":"over"} ${A.minimum} character(s)`:A.type==="number"?t=`Number must be ${A.exact?"exactly equal to ":A.inclusive?"greater than or equal to ":"greater than "}${A.minimum}`:A.type==="bigint"?t=`Number must be ${A.exact?"exactly equal to ":A.inclusive?"greater than or equal to ":"greater than "}${A.minimum}`:A.type==="date"?t=`Date must be ${A.exact?"exactly equal to ":A.inclusive?"greater than or equal to ":"greater than "}${new Date(Number(A.minimum))}`:t="Invalid input";break;case d.too_big:A.type==="array"?t=`Array must contain ${A.exact?"exactly":A.inclusive?"at most":"less than"} ${A.maximum} element(s)`:A.type==="string"?t=`String must contain ${A.exact?"exactly":A.inclusive?"at most":"under"} ${A.maximum} character(s)`:A.type==="number"?t=`Number must be ${A.exact?"exactly":A.inclusive?"less than or equal to":"less than"} ${A.maximum}`:A.type==="bigint"?t=`BigInt must be ${A.exact?"exactly":A.inclusive?"less than or equal to":"less than"} ${A.maximum}`:A.type==="date"?t=`Date must be ${A.exact?"exactly":A.inclusive?"smaller than or equal to":"smaller than"} ${new Date(Number(A.maximum))}`:t="Invalid input";break;case d.custom:t="Invalid input";break;case d.invalid_intersection_types:t="Intersection results could not be merged";break;case d.not_multiple_of:t=`Number must be a multiple of ${A.multipleOf}`;break;case d.not_finite:t="Number must be finite";break;default:t=e.defaultError,N.assertNever(A)}return{message:t}};let Pi=Ut;function Oi(){return Pi}const qi=A=>{const{data:e,path:t,errorMaps:s,issueData:o}=A,n=[...t,...o.path||[]],a={...o,path:n};if(o.message!==void 0)return{...o,path:n,message:o.message};let i="";const r=s.filter(c=>!!c).slice().reverse();for(const c of r)i=c(a,{data:e,defaultError:i}).message;return{...o,path:n,message:i}};function p(A,e){const t=Oi(),s=qi({issueData:e,data:A.data,path:A.path,errorMaps:[A.common.contextualErrorMap,A.schemaErrorMap,t,t===Ut?void 0:Ut].filter(o=>!!o)});A.common.issues.push(s)}class j{constructor(){this.value="valid"}dirty(){this.value==="valid"&&(this.value="dirty")}abort(){this.value!=="aborted"&&(this.value="aborted")}static mergeArray(e,t){const s=[];for(const o of t){if(o.status==="aborted")return Q;o.status==="dirty"&&e.dirty(),s.push(o.value)}return{status:e.value,value:s}}static async mergeObjectAsync(e,t){const s=[];for(const o of t){const n=await o.key,a=await o.value;s.push({key:n,value:a})}return j.mergeObjectSync(e,s)}static mergeObjectSync(e,t){const s={};for(const o of t){const{key:n,value:a}=o;if(n.status==="aborted"||a.status==="aborted")return Q;n.status==="dirty"&&e.dirty(),a.status==="dirty"&&e.dirty(),n.value!=="__proto__"&&(typeof a.value<"u"||o.alwaysSet)&&(s[n.value]=a.value)}return{status:e.value,value:s}}}const Q=Object.freeze({status:"aborted"}),Pe=A=>({status:"dirty",value:A}),Z=A=>({status:"valid",value:A}),XA=A=>A.status==="aborted",es=A=>A.status==="dirty",Re=A=>A.status==="valid",dt=A=>typeof Promise<"u"&&A instanceof Promise;var C;(function(A){A.errToObj=e=>typeof e=="string"?{message:e}:e||{},A.toString=e=>typeof e=="string"?e:e?.message})(C||(C={}));class fe{constructor(e,t,s,o){this._cachedPath=[],this.parent=e,this.data=t,this._path=s,this._key=o}get path(){return this._cachedPath.length||(Array.isArray(this._key)?this._cachedPath.push(...this._path,...this._key):this._cachedPath.push(...this._path,this._key)),this._cachedPath}}const ts=(A,e)=>{if(Re(e))return{success:!0,data:e.value};if(!A.common.issues.length)throw new Error("Validation failed but no issues detected.");return{success:!1,get error(){if(this._error)return this._error;const t=new ce(A.common.issues);return this._error=t,this._error}}};function w(A){if(!A)return{};const{errorMap:e,invalid_type_error:t,required_error:s,description:o}=A;if(e&&(t||s))throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);return e?{errorMap:e,description:o}:{errorMap:(a,i)=>{const{message:r}=A;return a.code==="invalid_enum_value"?{message:r??i.defaultError}:typeof i.data>"u"?{message:r??s??i.defaultError}:a.code!=="invalid_type"?{message:i.defaultError}:{message:r??t??i.defaultError}},description:o}}class S{get description(){return this._def.description}_getType(e){return ue(e.data)}_getOrReturnCtx(e,t){return t||{common:e.parent.common,data:e.data,parsedType:ue(e.data),schemaErrorMap:this._def.errorMap,path:e.path,parent:e.parent}}_processInputParams(e){return{status:new j,ctx:{common:e.parent.common,data:e.data,parsedType:ue(e.data),schemaErrorMap:this._def.errorMap,path:e.path,parent:e.parent}}}_parseSync(e){const t=this._parse(e);if(dt(t))throw new Error("Synchronous parse encountered promise.");return t}_parseAsync(e){const t=this._parse(e);return Promise.resolve(t)}parse(e,t){const s=this.safeParse(e,t);if(s.success)return s.data;throw s.error}safeParse(e,t){const s={common:{issues:[],async:t?.async??!1,contextualErrorMap:t?.errorMap},path:t?.path||[],schemaErrorMap:this._def.errorMap,parent:null,data:e,parsedType:ue(e)},o=this._parseSync({data:e,path:s.path,parent:s});return ts(s,o)}"~validate"(e){const t={common:{issues:[],async:!!this["~standard"].async},path:[],schemaErrorMap:this._def.errorMap,parent:null,data:e,parsedType:ue(e)};if(!this["~standard"].async)try{const s=this._parseSync({data:e,path:[],parent:t});return Re(s)?{value:s.value}:{issues:t.common.issues}}catch(s){s?.message?.toLowerCase()?.includes("encountered")&&(this["~standard"].async=!0),t.common={issues:[],async:!0}}return this._parseAsync({data:e,path:[],parent:t}).then(s=>Re(s)?{value:s.value}:{issues:t.common.issues})}async parseAsync(e,t){const s=await this.safeParseAsync(e,t);if(s.success)return s.data;throw s.error}async safeParseAsync(e,t){const s={common:{issues:[],contextualErrorMap:t?.errorMap,async:!0},path:t?.path||[],schemaErrorMap:this._def.errorMap,parent:null,data:e,parsedType:ue(e)},o=this._parse({data:e,path:s.path,parent:s}),n=await(dt(o)?o:Promise.resolve(o));return ts(s,n)}refine(e,t){const s=o=>typeof t=="string"||typeof t>"u"?{message:t}:typeof t=="function"?t(o):t;return this._refinement((o,n)=>{const a=e(o),i=()=>n.addIssue({code:d.custom,...s(o)});return typeof Promise<"u"&&a instanceof Promise?a.then(r=>r?!0:(i(),!1)):a?!0:(i(),!1)})}refinement(e,t){return this._refinement((s,o)=>e(s)?!0:(o.addIssue(typeof t=="function"?t(s,o):t),!1))}_refinement(e){return new Qe({schema:this,typeName:y.ZodEffects,effect:{type:"refinement",refinement:e}})}superRefine(e){return this._refinement(e)}constructor(e){this.spa=this.safeParseAsync,this._def=e,this.parse=this.parse.bind(this),this.safeParse=this.safeParse.bind(this),this.parseAsync=this.parseAsync.bind(this),this.safeParseAsync=this.safeParseAsync.bind(this),this.spa=this.spa.bind(this),this.refine=this.refine.bind(this),this.refinement=this.refinement.bind(this),this.superRefine=this.superRefine.bind(this),this.optional=this.optional.bind(this),this.nullable=this.nullable.bind(this),this.nullish=this.nullish.bind(this),this.array=this.array.bind(this),this.promise=this.promise.bind(this),this.or=this.or.bind(this),this.and=this.and.bind(this),this.transform=this.transform.bind(this),this.brand=this.brand.bind(this),this.default=this.default.bind(this),this.catch=this.catch.bind(this),this.describe=this.describe.bind(this),this.pipe=this.pipe.bind(this),this.readonly=this.readonly.bind(this),this.isNullable=this.isNullable.bind(this),this.isOptional=this.isOptional.bind(this),this["~standard"]={version:1,vendor:"zod",validate:t=>this["~validate"](t)}}optional(){return pe.create(this,this._def)}nullable(){return ke.create(this,this._def)}nullish(){return this.nullable().optional()}array(){return te.create(this)}promise(){return mt.create(this,this._def)}or(e){return ft.create([this,e],this._def)}and(e){return It.create(this,e,this._def)}transform(e){return new Qe({...w(this._def),schema:this,typeName:y.ZodEffects,effect:{type:"transform",transform:e}})}default(e){const t=typeof e=="function"?e:()=>e;return new Ot({...w(this._def),innerType:this,defaultValue:t,typeName:y.ZodDefault})}brand(){return new hr({typeName:y.ZodBranded,type:this,...w(this._def)})}catch(e){const t=typeof e=="function"?e:()=>e;return new qt({...w(this._def),innerType:this,catchValue:t,typeName:y.ZodCatch})}describe(e){const t=this.constructor;return new t({...this._def,description:e})}pipe(e){return hA.create(this,e)}readonly(){return Kt.create(this)}isOptional(){return this.safeParse(void 0).success}isNullable(){return this.safeParse(null).success}}const Ki=/^c[^\s-]{8,}$/i,Ji=/^[0-9a-z]+$/,zi=/^[0-9A-HJKMNP-TV-Z]{26}$/i,ji=/^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i,Hi=/^[a-z0-9_-]{21}$/i,Zi=/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/,Vi=/^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/,$i=/^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i,Wi="^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$";let Nt;const Xi=/^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,er=/^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,tr=/^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/,Ar=/^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,sr=/^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,or=/^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,Zs="((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))",nr=new RegExp(`^${Zs}$`);function Vs(A){let e="[0-5]\\d";A.precision?e=`${e}\\.\\d{${A.precision}}`:A.precision==null&&(e=`${e}(\\.\\d+)?`);const t=A.precision?"+":"?";return`([01]\\d|2[0-3]):[0-5]\\d(:${e})${t}`}function ar(A){return new RegExp(`^${Vs(A)}$`)}function ir(A){let e=`${Zs}T${Vs(A)}`;const t=[];return t.push(A.local?"Z?":"Z"),A.offset&&t.push("([+-]\\d{2}:?\\d{2})"),e=`${e}(${t.join("|")})`,new RegExp(`^${e}$`)}function rr(A,e){return!!((e==="v4"||!e)&&Xi.test(A)||(e==="v6"||!e)&&tr.test(A))}function cr(A,e){if(!Zi.test(A))return!1;try{const[t]=A.split(".");if(!t)return!1;const s=t.replace(/-/g,"+").replace(/_/g,"/").padEnd(t.length+(4-t.length%4)%4,"="),o=JSON.parse(atob(s));return!(typeof o!="object"||o===null||"typ"in o&&o?.typ!=="JWT"||!o.alg||e&&o.alg!==e)}catch{return!1}}function lr(A,e){return!!((e==="v4"||!e)&&er.test(A)||(e==="v6"||!e)&&Ar.test(A))}class ne extends S{_parse(e){if(this._def.coerce&&(e.data=String(e.data)),this._getType(e)!==I.string){const n=this._getOrReturnCtx(e);return p(n,{code:d.invalid_type,expected:I.string,received:n.parsedType}),Q}const s=new j;let o;for(const n of this._def.checks)if(n.kind==="min")e.data.length<n.value&&(o=this._getOrReturnCtx(e,o),p(o,{code:d.too_small,minimum:n.value,type:"string",inclusive:!0,exact:!1,message:n.message}),s.dirty());else if(n.kind==="max")e.data.length>n.value&&(o=this._getOrReturnCtx(e,o),p(o,{code:d.too_big,maximum:n.value,type:"string",inclusive:!0,exact:!1,message:n.message}),s.dirty());else if(n.kind==="length"){const a=e.data.length>n.value,i=e.data.length<n.value;(a||i)&&(o=this._getOrReturnCtx(e,o),a?p(o,{code:d.too_big,maximum:n.value,type:"string",inclusive:!0,exact:!0,message:n.message}):i&&p(o,{code:d.too_small,minimum:n.value,type:"string",inclusive:!0,exact:!0,message:n.message}),s.dirty())}else if(n.kind==="email")$i.test(e.data)||(o=this._getOrReturnCtx(e,o),p(o,{validation:"email",code:d.invalid_string,message:n.message}),s.dirty());else if(n.kind==="emoji")Nt||(Nt=new RegExp(Wi,"u")),Nt.test(e.data)||(o=this._getOrReturnCtx(e,o),p(o,{validation:"emoji",code:d.invalid_string,message:n.message}),s.dirty());else if(n.kind==="uuid")ji.test(e.data)||(o=this._getOrReturnCtx(e,o),p(o,{validation:"uuid",code:d.invalid_string,message:n.message}),s.dirty());else if(n.kind==="nanoid")Hi.test(e.data)||(o=this._getOrReturnCtx(e,o),p(o,{validation:"nanoid",code:d.invalid_string,message:n.message}),s.dirty());else if(n.kind==="cuid")Ki.test(e.data)||(o=this._getOrReturnCtx(e,o),p(o,{validation:"cuid",code:d.invalid_string,message:n.message}),s.dirty());else if(n.kind==="cuid2")Ji.test(e.data)||(o=this._getOrReturnCtx(e,o),p(o,{validation:"cuid2",code:d.invalid_string,message:n.message}),s.dirty());else if(n.kind==="ulid")zi.test(e.data)||(o=this._getOrReturnCtx(e,o),p(o,{validation:"ulid",code:d.invalid_string,message:n.message}),s.dirty());else if(n.kind==="url")try{new URL(e.data)}catch{o=this._getOrReturnCtx(e,o),p(o,{validation:"url",code:d.invalid_string,message:n.message}),s.dirty()}else n.kind==="regex"?(n.regex.lastIndex=0,n.regex.test(e.data)||(o=this._getOrReturnCtx(e,o),p(o,{validation:"regex",code:d.invalid_string,message:n.message}),s.dirty())):n.kind==="trim"?e.data=e.data.trim():n.kind==="includes"?e.data.includes(n.value,n.position)||(o=this._getOrReturnCtx(e,o),p(o,{code:d.invalid_string,validation:{includes:n.value,position:n.position},message:n.message}),s.dirty()):n.kind==="toLowerCase"?e.data=e.data.toLowerCase():n.kind==="toUpperCase"?e.data=e.data.toUpperCase():n.kind==="startsWith"?e.data.startsWith(n.value)||(o=this._getOrReturnCtx(e,o),p(o,{code:d.invalid_string,validation:{startsWith:n.value},message:n.message}),s.dirty()):n.kind==="endsWith"?e.data.endsWith(n.value)||(o=this._getOrReturnCtx(e,o),p(o,{code:d.invalid_string,validation:{endsWith:n.value},message:n.message}),s.dirty()):n.kind==="datetime"?ir(n).test(e.data)||(o=this._getOrReturnCtx(e,o),p(o,{code:d.invalid_string,validation:"datetime",message:n.message}),s.dirty()):n.kind==="date"?nr.test(e.data)||(o=this._getOrReturnCtx(e,o),p(o,{code:d.invalid_string,validation:"date",message:n.message}),s.dirty()):n.kind==="time"?ar(n).test(e.data)||(o=this._getOrReturnCtx(e,o),p(o,{code:d.invalid_string,validation:"time",message:n.message}),s.dirty()):n.kind==="duration"?Vi.test(e.data)||(o=this._getOrReturnCtx(e,o),p(o,{validation:"duration",code:d.invalid_string,message:n.message}),s.dirty()):n.kind==="ip"?rr(e.data,n.version)||(o=this._getOrReturnCtx(e,o),p(o,{validation:"ip",code:d.invalid_string,message:n.message}),s.dirty()):n.kind==="jwt"?cr(e.data,n.alg)||(o=this._getOrReturnCtx(e,o),p(o,{validation:"jwt",code:d.invalid_string,message:n.message}),s.dirty()):n.kind==="cidr"?lr(e.data,n.version)||(o=this._getOrReturnCtx(e,o),p(o,{validation:"cidr",code:d.invalid_string,message:n.message}),s.dirty()):n.kind==="base64"?sr.test(e.data)||(o=this._getOrReturnCtx(e,o),p(o,{validation:"base64",code:d.invalid_string,message:n.message}),s.dirty()):n.kind==="base64url"?or.test(e.data)||(o=this._getOrReturnCtx(e,o),p(o,{validation:"base64url",code:d.invalid_string,message:n.message}),s.dirty()):N.assertNever(n);return{status:s.value,value:e.data}}_regex(e,t,s){return this.refinement(o=>e.test(o),{validation:t,code:d.invalid_string,...C.errToObj(s)})}_addCheck(e){return new ne({...this._def,checks:[...this._def.checks,e]})}email(e){return this._addCheck({kind:"email",...C.errToObj(e)})}url(e){return this._addCheck({kind:"url",...C.errToObj(e)})}emoji(e){return this._addCheck({kind:"emoji",...C.errToObj(e)})}uuid(e){return this._addCheck({kind:"uuid",...C.errToObj(e)})}nanoid(e){return this._addCheck({kind:"nanoid",...C.errToObj(e)})}cuid(e){return this._addCheck({kind:"cuid",...C.errToObj(e)})}cuid2(e){return this._addCheck({kind:"cuid2",...C.errToObj(e)})}ulid(e){return this._addCheck({kind:"ulid",...C.errToObj(e)})}base64(e){return this._addCheck({kind:"base64",...C.errToObj(e)})}base64url(e){return this._addCheck({kind:"base64url",...C.errToObj(e)})}jwt(e){return this._addCheck({kind:"jwt",...C.errToObj(e)})}ip(e){return this._addCheck({kind:"ip",...C.errToObj(e)})}cidr(e){return this._addCheck({kind:"cidr",...C.errToObj(e)})}datetime(e){return typeof e=="string"?this._addCheck({kind:"datetime",precision:null,offset:!1,local:!1,message:e}):this._addCheck({kind:"datetime",precision:typeof e?.precision>"u"?null:e?.precision,offset:e?.offset??!1,local:e?.local??!1,...C.errToObj(e?.message)})}date(e){return this._addCheck({kind:"date",message:e})}time(e){return typeof e=="string"?this._addCheck({kind:"time",precision:null,message:e}):this._addCheck({kind:"time",precision:typeof e?.precision>"u"?null:e?.precision,...C.errToObj(e?.message)})}duration(e){return this._addCheck({kind:"duration",...C.errToObj(e)})}regex(e,t){return this._addCheck({kind:"regex",regex:e,...C.errToObj(t)})}includes(e,t){return this._addCheck({kind:"includes",value:e,position:t?.position,...C.errToObj(t?.message)})}startsWith(e,t){return this._addCheck({kind:"startsWith",value:e,...C.errToObj(t)})}endsWith(e,t){return this._addCheck({kind:"endsWith",value:e,...C.errToObj(t)})}min(e,t){return this._addCheck({kind:"min",value:e,...C.errToObj(t)})}max(e,t){return this._addCheck({kind:"max",value:e,...C.errToObj(t)})}length(e,t){return this._addCheck({kind:"length",value:e,...C.errToObj(t)})}nonempty(e){return this.min(1,C.errToObj(e))}trim(){return new ne({...this._def,checks:[...this._def.checks,{kind:"trim"}]})}toLowerCase(){return new ne({...this._def,checks:[...this._def.checks,{kind:"toLowerCase"}]})}toUpperCase(){return new ne({...this._def,checks:[...this._def.checks,{kind:"toUpperCase"}]})}get isDatetime(){return!!this._def.checks.find(e=>e.kind==="datetime")}get isDate(){return!!this._def.checks.find(e=>e.kind==="date")}get isTime(){return!!this._def.checks.find(e=>e.kind==="time")}get isDuration(){return!!this._def.checks.find(e=>e.kind==="duration")}get isEmail(){return!!this._def.checks.find(e=>e.kind==="email")}get isURL(){return!!this._def.checks.find(e=>e.kind==="url")}get isEmoji(){return!!this._def.checks.find(e=>e.kind==="emoji")}get isUUID(){return!!this._def.checks.find(e=>e.kind==="uuid")}get isNANOID(){return!!this._def.checks.find(e=>e.kind==="nanoid")}get isCUID(){return!!this._def.checks.find(e=>e.kind==="cuid")}get isCUID2(){return!!this._def.checks.find(e=>e.kind==="cuid2")}get isULID(){return!!this._def.checks.find(e=>e.kind==="ulid")}get isIP(){return!!this._def.checks.find(e=>e.kind==="ip")}get isCIDR(){return!!this._def.checks.find(e=>e.kind==="cidr")}get isBase64(){return!!this._def.checks.find(e=>e.kind==="base64")}get isBase64url(){return!!this._def.checks.find(e=>e.kind==="base64url")}get minLength(){let e=null;for(const t of this._def.checks)t.kind==="min"&&(e===null||t.value>e)&&(e=t.value);return e}get maxLength(){let e=null;for(const t of this._def.checks)t.kind==="max"&&(e===null||t.value<e)&&(e=t.value);return e}}ne.create=A=>new ne({checks:[],typeName:y.ZodString,coerce:A?.coerce??!1,...w(A)});function gr(A,e){const t=(A.toString().split(".")[1]||"").length,s=(e.toString().split(".")[1]||"").length,o=t>s?t:s,n=Number.parseInt(A.toFixed(o).replace(".","")),a=Number.parseInt(e.toFixed(o).replace(".",""));return n%a/10**o}class Be extends S{constructor(){super(...arguments),this.min=this.gte,this.max=this.lte,this.step=this.multipleOf}_parse(e){if(this._def.coerce&&(e.data=Number(e.data)),this._getType(e)!==I.number){const n=this._getOrReturnCtx(e);return p(n,{code:d.invalid_type,expected:I.number,received:n.parsedType}),Q}let s;const o=new j;for(const n of this._def.checks)n.kind==="int"?N.isInteger(e.data)||(s=this._getOrReturnCtx(e,s),p(s,{code:d.invalid_type,expected:"integer",received:"float",message:n.message}),o.dirty()):n.kind==="min"?(n.inclusive?e.data<n.value:e.data<=n.value)&&(s=this._getOrReturnCtx(e,s),p(s,{code:d.too_small,minimum:n.value,type:"number",inclusive:n.inclusive,exact:!1,message:n.message}),o.dirty()):n.kind==="max"?(n.inclusive?e.data>n.value:e.data>=n.value)&&(s=this._getOrReturnCtx(e,s),p(s,{code:d.too_big,maximum:n.value,type:"number",inclusive:n.inclusive,exact:!1,message:n.message}),o.dirty()):n.kind==="multipleOf"?gr(e.data,n.value)!==0&&(s=this._getOrReturnCtx(e,s),p(s,{code:d.not_multiple_of,multipleOf:n.value,message:n.message}),o.dirty()):n.kind==="finite"?Number.isFinite(e.data)||(s=this._getOrReturnCtx(e,s),p(s,{code:d.not_finite,message:n.message}),o.dirty()):N.assertNever(n);return{status:o.value,value:e.data}}gte(e,t){return this.setLimit("min",e,!0,C.toString(t))}gt(e,t){return this.setLimit("min",e,!1,C.toString(t))}lte(e,t){return this.setLimit("max",e,!0,C.toString(t))}lt(e,t){return this.setLimit("max",e,!1,C.toString(t))}setLimit(e,t,s,o){return new Be({...this._def,checks:[...this._def.checks,{kind:e,value:t,inclusive:s,message:C.toString(o)}]})}_addCheck(e){return new Be({...this._def,checks:[...this._def.checks,e]})}int(e){return this._addCheck({kind:"int",message:C.toString(e)})}positive(e){return this._addCheck({kind:"min",value:0,inclusive:!1,message:C.toString(e)})}negative(e){return this._addCheck({kind:"max",value:0,inclusive:!1,message:C.toString(e)})}nonpositive(e){return this._addCheck({kind:"max",value:0,inclusive:!0,message:C.toString(e)})}nonnegative(e){return this._addCheck({kind:"min",value:0,inclusive:!0,message:C.toString(e)})}multipleOf(e,t){return this._addCheck({kind:"multipleOf",value:e,message:C.toString(t)})}finite(e){return this._addCheck({kind:"finite",message:C.toString(e)})}safe(e){return this._addCheck({kind:"min",inclusive:!0,value:Number.MIN_SAFE_INTEGER,message:C.toString(e)})._addCheck({kind:"max",inclusive:!0,value:Number.MAX_SAFE_INTEGER,message:C.toString(e)})}get minValue(){let e=null;for(const t of this._def.checks)t.kind==="min"&&(e===null||t.value>e)&&(e=t.value);return e}get maxValue(){let e=null;for(const t of this._def.checks)t.kind==="max"&&(e===null||t.value<e)&&(e=t.value);return e}get isInt(){return!!this._def.checks.find(e=>e.kind==="int"||e.kind==="multipleOf"&&N.isInteger(e.value))}get isFinite(){let e=null,t=null;for(const s of this._def.checks){if(s.kind==="finite"||s.kind==="int"||s.kind==="multipleOf")return!0;s.kind==="min"?(t===null||s.value>t)&&(t=s.value):s.kind==="max"&&(e===null||s.value<e)&&(e=s.value)}return Number.isFinite(t)&&Number.isFinite(e)}}Be.create=A=>new Be({checks:[],typeName:y.ZodNumber,coerce:A?.coerce||!1,...w(A)});class ve extends S{constructor(){super(...arguments),this.min=this.gte,this.max=this.lte}_parse(e){if(this._def.coerce)try{e.data=BigInt(e.data)}catch{return this._getInvalidInput(e)}if(this._getType(e)!==I.bigint)return this._getInvalidInput(e);let s;const o=new j;for(const n of this._def.checks)n.kind==="min"?(n.inclusive?e.data<n.value:e.data<=n.value)&&(s=this._getOrReturnCtx(e,s),p(s,{code:d.too_small,type:"bigint",minimum:n.value,inclusive:n.inclusive,message:n.message}),o.dirty()):n.kind==="max"?(n.inclusive?e.data>n.value:e.data>=n.value)&&(s=this._getOrReturnCtx(e,s),p(s,{code:d.too_big,type:"bigint",maximum:n.value,inclusive:n.inclusive,message:n.message}),o.dirty()):n.kind==="multipleOf"?e.data%n.value!==BigInt(0)&&(s=this._getOrReturnCtx(e,s),p(s,{code:d.not_multiple_of,multipleOf:n.value,message:n.message}),o.dirty()):N.assertNever(n);return{status:o.value,value:e.data}}_getInvalidInput(e){const t=this._getOrReturnCtx(e);return p(t,{code:d.invalid_type,expected:I.bigint,received:t.parsedType}),Q}gte(e,t){return this.setLimit("min",e,!0,C.toString(t))}gt(e,t){return this.setLimit("min",e,!1,C.toString(t))}lte(e,t){return this.setLimit("max",e,!0,C.toString(t))}lt(e,t){return this.setLimit("max",e,!1,C.toString(t))}setLimit(e,t,s,o){return new ve({...this._def,checks:[...this._def.checks,{kind:e,value:t,inclusive:s,message:C.toString(o)}]})}_addCheck(e){return new ve({...this._def,checks:[...this._def.checks,e]})}positive(e){return this._addCheck({kind:"min",value:BigInt(0),inclusive:!1,message:C.toString(e)})}negative(e){return this._addCheck({kind:"max",value:BigInt(0),inclusive:!1,message:C.toString(e)})}nonpositive(e){return this._addCheck({kind:"max",value:BigInt(0),inclusive:!0,message:C.toString(e)})}nonnegative(e){return this._addCheck({kind:"min",value:BigInt(0),inclusive:!0,message:C.toString(e)})}multipleOf(e,t){return this._addCheck({kind:"multipleOf",value:e,message:C.toString(t)})}get minValue(){let e=null;for(const t of this._def.checks)t.kind==="min"&&(e===null||t.value>e)&&(e=t.value);return e}get maxValue(){let e=null;for(const t of this._def.checks)t.kind==="max"&&(e===null||t.value<e)&&(e=t.value);return e}}ve.create=A=>new ve({checks:[],typeName:y.ZodBigInt,coerce:A?.coerce??!1,...w(A)});class pt extends S{_parse(e){if(this._def.coerce&&(e.data=!!e.data),this._getType(e)!==I.boolean){const s=this._getOrReturnCtx(e);return p(s,{code:d.invalid_type,expected:I.boolean,received:s.parsedType}),Q}return Z(e.data)}}pt.create=A=>new pt({typeName:y.ZodBoolean,coerce:A?.coerce||!1,...w(A)});class be extends S{_parse(e){if(this._def.coerce&&(e.data=new Date(e.data)),this._getType(e)!==I.date){const n=this._getOrReturnCtx(e);return p(n,{code:d.invalid_type,expected:I.date,received:n.parsedType}),Q}if(Number.isNaN(e.data.getTime())){const n=this._getOrReturnCtx(e);return p(n,{code:d.invalid_date}),Q}const s=new j;let o;for(const n of this._def.checks)n.kind==="min"?e.data.getTime()<n.value&&(o=this._getOrReturnCtx(e,o),p(o,{code:d.too_small,message:n.message,inclusive:!0,exact:!1,minimum:n.value,type:"date"}),s.dirty()):n.kind==="max"?e.data.getTime()>n.value&&(o=this._getOrReturnCtx(e,o),p(o,{code:d.too_big,message:n.message,inclusive:!0,exact:!1,maximum:n.value,type:"date"}),s.dirty()):N.assertNever(n);return{status:s.value,value:new Date(e.data.getTime())}}_addCheck(e){return new be({...this._def,checks:[...this._def.checks,e]})}min(e,t){return this._addCheck({kind:"min",value:e.getTime(),message:C.toString(t)})}max(e,t){return this._addCheck({kind:"max",value:e.getTime(),message:C.toString(t)})}get minDate(){let e=null;for(const t of this._def.checks)t.kind==="min"&&(e===null||t.value>e)&&(e=t.value);return e!=null?new Date(e):null}get maxDate(){let e=null;for(const t of this._def.checks)t.kind==="max"&&(e===null||t.value<e)&&(e=t.value);return e!=null?new Date(e):null}}be.create=A=>new be({checks:[],coerce:A?.coerce||!1,typeName:y.ZodDate,...w(A)});class As extends S{_parse(e){if(this._getType(e)!==I.symbol){const s=this._getOrReturnCtx(e);return p(s,{code:d.invalid_type,expected:I.symbol,received:s.parsedType}),Q}return Z(e.data)}}As.create=A=>new As({typeName:y.ZodSymbol,...w(A)});class ss extends S{_parse(e){if(this._getType(e)!==I.undefined){const s=this._getOrReturnCtx(e);return p(s,{code:d.invalid_type,expected:I.undefined,received:s.parsedType}),Q}return Z(e.data)}}ss.create=A=>new ss({typeName:y.ZodUndefined,...w(A)});class os extends S{_parse(e){if(this._getType(e)!==I.null){const s=this._getOrReturnCtx(e);return p(s,{code:d.invalid_type,expected:I.null,received:s.parsedType}),Q}return Z(e.data)}}os.create=A=>new os({typeName:y.ZodNull,...w(A)});class ns extends S{constructor(){super(...arguments),this._any=!0}_parse(e){return Z(e.data)}}ns.create=A=>new ns({typeName:y.ZodAny,...w(A)});class Yt extends S{constructor(){super(...arguments),this._unknown=!0}_parse(e){return Z(e.data)}}Yt.create=A=>new Yt({typeName:y.ZodUnknown,...w(A)});class Ie extends S{_parse(e){const t=this._getOrReturnCtx(e);return p(t,{code:d.invalid_type,expected:I.never,received:t.parsedType}),Q}}Ie.create=A=>new Ie({typeName:y.ZodNever,...w(A)});class as extends S{_parse(e){if(this._getType(e)!==I.undefined){const s=this._getOrReturnCtx(e);return p(s,{code:d.invalid_type,expected:I.void,received:s.parsedType}),Q}return Z(e.data)}}as.create=A=>new as({typeName:y.ZodVoid,...w(A)});class te extends S{_parse(e){const{ctx:t,status:s}=this._processInputParams(e),o=this._def;if(t.parsedType!==I.array)return p(t,{code:d.invalid_type,expected:I.array,received:t.parsedType}),Q;if(o.exactLength!==null){const a=t.data.length>o.exactLength.value,i=t.data.length<o.exactLength.value;(a||i)&&(p(t,{code:a?d.too_big:d.too_small,minimum:i?o.exactLength.value:void 0,maximum:a?o.exactLength.value:void 0,type:"array",inclusive:!0,exact:!0,message:o.exactLength.message}),s.dirty())}if(o.minLength!==null&&t.data.length<o.minLength.value&&(p(t,{code:d.too_small,minimum:o.minLength.value,type:"array",inclusive:!0,exact:!1,message:o.minLength.message}),s.dirty()),o.maxLength!==null&&t.data.length>o.maxLength.value&&(p(t,{code:d.too_big,maximum:o.maxLength.value,type:"array",inclusive:!0,exact:!1,message:o.maxLength.message}),s.dirty()),t.common.async)return Promise.all([...t.data].map((a,i)=>o.type._parseAsync(new fe(t,a,t.path,i)))).then(a=>j.mergeArray(s,a));const n=[...t.data].map((a,i)=>o.type._parseSync(new fe(t,a,t.path,i)));return j.mergeArray(s,n)}get element(){return this._def.type}min(e,t){return new te({...this._def,minLength:{value:e,message:C.toString(t)}})}max(e,t){return new te({...this._def,maxLength:{value:e,message:C.toString(t)}})}length(e,t){return new te({...this._def,exactLength:{value:e,message:C.toString(t)}})}nonempty(e){return this.min(1,e)}}te.create=(A,e)=>new te({type:A,minLength:null,maxLength:null,exactLength:null,typeName:y.ZodArray,...w(e)});function De(A){if(A instanceof T){const e={};for(const t in A.shape){const s=A.shape[t];e[t]=pe.create(De(s))}return new T({...A._def,shape:()=>e})}else return A instanceof te?new te({...A._def,type:De(A.element)}):A instanceof pe?pe.create(De(A.unwrap())):A instanceof ke?ke.create(De(A.unwrap())):A instanceof xe?xe.create(A.items.map(e=>De(e))):A}class T extends S{constructor(){super(...arguments),this._cached=null,this.nonstrict=this.passthrough,this.augment=this.extend}_getCached(){if(this._cached!==null)return this._cached;const e=this._def.shape(),t=N.objectKeys(e);return this._cached={shape:e,keys:t},this._cached}_parse(e){if(this._getType(e)!==I.object){const c=this._getOrReturnCtx(e);return p(c,{code:d.invalid_type,expected:I.object,received:c.parsedType}),Q}const{status:s,ctx:o}=this._processInputParams(e),{shape:n,keys:a}=this._getCached(),i=[];if(!(this._def.catchall instanceof Ie&&this._def.unknownKeys==="strip"))for(const c in o.data)a.includes(c)||i.push(c);const r=[];for(const c of a){const l=n[c],g=o.data[c];r.push({key:{status:"valid",value:c},value:l._parse(new fe(o,g,o.path,c)),alwaysSet:c in o.data})}if(this._def.catchall instanceof Ie){const c=this._def.unknownKeys;if(c==="passthrough")for(const l of i)r.push({key:{status:"valid",value:l},value:{status:"valid",value:o.data[l]}});else if(c==="strict")i.length>0&&(p(o,{code:d.unrecognized_keys,keys:i}),s.dirty());else if(c!=="strip")throw new Error("Internal ZodObject error: invalid unknownKeys value.")}else{const c=this._def.catchall;for(const l of i){const g=o.data[l];r.push({key:{status:"valid",value:l},value:c._parse(new fe(o,g,o.path,l)),alwaysSet:l in o.data})}}return o.common.async?Promise.resolve().then(async()=>{const c=[];for(const l of r){const g=await l.key,h=await l.value;c.push({key:g,value:h,alwaysSet:l.alwaysSet})}return c}).then(c=>j.mergeObjectSync(s,c)):j.mergeObjectSync(s,r)}get shape(){return this._def.shape()}strict(e){return C.errToObj,new T({...this._def,unknownKeys:"strict",...e!==void 0?{errorMap:(t,s)=>{const o=this._def.errorMap?.(t,s).message??s.defaultError;return t.code==="unrecognized_keys"?{message:C.errToObj(e).message??o}:{message:o}}}:{}})}strip(){return new T({...this._def,unknownKeys:"strip"})}passthrough(){return new T({...this._def,unknownKeys:"passthrough"})}extend(e){return new T({...this._def,shape:()=>({...this._def.shape(),...e})})}merge(e){return new T({unknownKeys:e._def.unknownKeys,catchall:e._def.catchall,shape:()=>({...this._def.shape(),...e._def.shape()}),typeName:y.ZodObject})}setKey(e,t){return this.augment({[e]:t})}catchall(e){return new T({...this._def,catchall:e})}pick(e){const t={};for(const s of N.objectKeys(e))e[s]&&this.shape[s]&&(t[s]=this.shape[s]);return new T({...this._def,shape:()=>t})}omit(e){const t={};for(const s of N.objectKeys(this.shape))e[s]||(t[s]=this.shape[s]);return new T({...this._def,shape:()=>t})}deepPartial(){return De(this)}partial(e){const t={};for(const s of N.objectKeys(this.shape)){const o=this.shape[s];e&&!e[s]?t[s]=o:t[s]=o.optional()}return new T({...this._def,shape:()=>t})}required(e){const t={};for(const s of N.objectKeys(this.shape))if(e&&!e[s])t[s]=this.shape[s];else{let n=this.shape[s];for(;n instanceof pe;)n=n._def.innerType;t[s]=n}return new T({...this._def,shape:()=>t})}keyof(){return $s(N.objectKeys(this.shape))}}T.create=(A,e)=>new T({shape:()=>A,unknownKeys:"strip",catchall:Ie.create(),typeName:y.ZodObject,...w(e)});T.strictCreate=(A,e)=>new T({shape:()=>A,unknownKeys:"strict",catchall:Ie.create(),typeName:y.ZodObject,...w(e)});T.lazycreate=(A,e)=>new T({shape:A,unknownKeys:"strip",catchall:Ie.create(),typeName:y.ZodObject,...w(e)});class ft extends S{_parse(e){const{ctx:t}=this._processInputParams(e),s=this._def.options;function o(n){for(const i of n)if(i.result.status==="valid")return i.result;for(const i of n)if(i.result.status==="dirty")return t.common.issues.push(...i.ctx.common.issues),i.result;const a=n.map(i=>new ce(i.ctx.common.issues));return p(t,{code:d.invalid_union,unionErrors:a}),Q}if(t.common.async)return Promise.all(s.map(async n=>{const a={...t,common:{...t.common,issues:[]},parent:null};return{result:await n._parseAsync({data:t.data,path:t.path,parent:a}),ctx:a}})).then(o);{let n;const a=[];for(const r of s){const c={...t,common:{...t.common,issues:[]},parent:null},l=r._parseSync({data:t.data,path:t.path,parent:c});if(l.status==="valid")return l;l.status==="dirty"&&!n&&(n={result:l,ctx:c}),c.common.issues.length&&a.push(c.common.issues)}if(n)return t.common.issues.push(...n.ctx.common.issues),n.result;const i=a.map(r=>new ce(r));return p(t,{code:d.invalid_union,unionErrors:i}),Q}}get options(){return this._def.options}}ft.create=(A,e)=>new ft({options:A,typeName:y.ZodUnion,...w(e)});function Pt(A,e){const t=ue(A),s=ue(e);if(A===e)return{valid:!0,data:A};if(t===I.object&&s===I.object){const o=N.objectKeys(e),n=N.objectKeys(A).filter(i=>o.indexOf(i)!==-1),a={...A,...e};for(const i of n){const r=Pt(A[i],e[i]);if(!r.valid)return{valid:!1};a[i]=r.data}return{valid:!0,data:a}}else if(t===I.array&&s===I.array){if(A.length!==e.length)return{valid:!1};const o=[];for(let n=0;n<A.length;n++){const a=A[n],i=e[n],r=Pt(a,i);if(!r.valid)return{valid:!1};o.push(r.data)}return{valid:!0,data:o}}else return t===I.date&&s===I.date&&+A==+e?{valid:!0,data:A}:{valid:!1}}class It extends S{_parse(e){const{status:t,ctx:s}=this._processInputParams(e),o=(n,a)=>{if(XA(n)||XA(a))return Q;const i=Pt(n.value,a.value);return i.valid?((es(n)||es(a))&&t.dirty(),{status:t.value,value:i.data}):(p(s,{code:d.invalid_intersection_types}),Q)};return s.common.async?Promise.all([this._def.left._parseAsync({data:s.data,path:s.path,parent:s}),this._def.right._parseAsync({data:s.data,path:s.path,parent:s})]).then(([n,a])=>o(n,a)):o(this._def.left._parseSync({data:s.data,path:s.path,parent:s}),this._def.right._parseSync({data:s.data,path:s.path,parent:s}))}}It.create=(A,e,t)=>new It({left:A,right:e,typeName:y.ZodIntersection,...w(t)});class xe extends S{_parse(e){const{status:t,ctx:s}=this._processInputParams(e);if(s.parsedType!==I.array)return p(s,{code:d.invalid_type,expected:I.array,received:s.parsedType}),Q;if(s.data.length<this._def.items.length)return p(s,{code:d.too_small,minimum:this._def.items.length,inclusive:!0,exact:!1,type:"array"}),Q;!this._def.rest&&s.data.length>this._def.items.length&&(p(s,{code:d.too_big,maximum:this._def.items.length,inclusive:!0,exact:!1,type:"array"}),t.dirty());const n=[...s.data].map((a,i)=>{const r=this._def.items[i]||this._def.rest;return r?r._parse(new fe(s,a,s.path,i)):null}).filter(a=>!!a);return s.common.async?Promise.all(n).then(a=>j.mergeArray(t,a)):j.mergeArray(t,n)}get items(){return this._def.items}rest(e){return new xe({...this._def,rest:e})}}xe.create=(A,e)=>{if(!Array.isArray(A))throw new Error("You must pass an array of schemas to z.tuple([ ... ])");return new xe({items:A,typeName:y.ZodTuple,rest:null,...w(e)})};class is extends S{get keySchema(){return this._def.keyType}get valueSchema(){return this._def.valueType}_parse(e){const{status:t,ctx:s}=this._processInputParams(e);if(s.parsedType!==I.map)return p(s,{code:d.invalid_type,expected:I.map,received:s.parsedType}),Q;const o=this._def.keyType,n=this._def.valueType,a=[...s.data.entries()].map(([i,r],c)=>({key:o._parse(new fe(s,i,s.path,[c,"key"])),value:n._parse(new fe(s,r,s.path,[c,"value"]))}));if(s.common.async){const i=new Map;return Promise.resolve().then(async()=>{for(const r of a){const c=await r.key,l=await r.value;if(c.status==="aborted"||l.status==="aborted")return Q;(c.status==="dirty"||l.status==="dirty")&&t.dirty(),i.set(c.value,l.value)}return{status:t.value,value:i}})}else{const i=new Map;for(const r of a){const c=r.key,l=r.value;if(c.status==="aborted"||l.status==="aborted")return Q;(c.status==="dirty"||l.status==="dirty")&&t.dirty(),i.set(c.value,l.value)}return{status:t.value,value:i}}}}is.create=(A,e,t)=>new is({valueType:e,keyType:A,typeName:y.ZodMap,...w(t)});class Ke extends S{_parse(e){const{status:t,ctx:s}=this._processInputParams(e);if(s.parsedType!==I.set)return p(s,{code:d.invalid_type,expected:I.set,received:s.parsedType}),Q;const o=this._def;o.minSize!==null&&s.data.size<o.minSize.value&&(p(s,{code:d.too_small,minimum:o.minSize.value,type:"set",inclusive:!0,exact:!1,message:o.minSize.message}),t.dirty()),o.maxSize!==null&&s.data.size>o.maxSize.value&&(p(s,{code:d.too_big,maximum:o.maxSize.value,type:"set",inclusive:!0,exact:!1,message:o.maxSize.message}),t.dirty());const n=this._def.valueType;function a(r){const c=new Set;for(const l of r){if(l.status==="aborted")return Q;l.status==="dirty"&&t.dirty(),c.add(l.value)}return{status:t.value,value:c}}const i=[...s.data.values()].map((r,c)=>n._parse(new fe(s,r,s.path,c)));return s.common.async?Promise.all(i).then(r=>a(r)):a(i)}min(e,t){return new Ke({...this._def,minSize:{value:e,message:C.toString(t)}})}max(e,t){return new Ke({...this._def,maxSize:{value:e,message:C.toString(t)}})}size(e,t){return this.min(e,t).max(e,t)}nonempty(e){return this.min(1,e)}}Ke.create=(A,e)=>new Ke({valueType:A,minSize:null,maxSize:null,typeName:y.ZodSet,...w(e)});class rs extends S{get schema(){return this._def.getter()}_parse(e){const{ctx:t}=this._processInputParams(e);return this._def.getter()._parse({data:t.data,path:t.path,parent:t})}}rs.create=(A,e)=>new rs({getter:A,typeName:y.ZodLazy,...w(e)});class cs extends S{_parse(e){if(e.data!==this._def.value){const t=this._getOrReturnCtx(e);return p(t,{received:t.data,code:d.invalid_literal,expected:this._def.value}),Q}return{status:"valid",value:e.data}}get value(){return this._def.value}}cs.create=(A,e)=>new cs({value:A,typeName:y.ZodLiteral,...w(e)});function $s(A,e){return new Me({values:A,typeName:y.ZodEnum,...w(e)})}class Me extends S{_parse(e){if(typeof e.data!="string"){const t=this._getOrReturnCtx(e),s=this._def.values;return p(t,{expected:N.joinValues(s),received:t.parsedType,code:d.invalid_type}),Q}if(this._cache||(this._cache=new Set(this._def.values)),!this._cache.has(e.data)){const t=this._getOrReturnCtx(e),s=this._def.values;return p(t,{received:t.data,code:d.invalid_enum_value,options:s}),Q}return Z(e.data)}get options(){return this._def.values}get enum(){const e={};for(const t of this._def.values)e[t]=t;return e}get Values(){const e={};for(const t of this._def.values)e[t]=t;return e}get Enum(){const e={};for(const t of this._def.values)e[t]=t;return e}extract(e,t=this._def){return Me.create(e,{...this._def,...t})}exclude(e,t=this._def){return Me.create(this.options.filter(s=>!e.includes(s)),{...this._def,...t})}}Me.create=$s;class ls extends S{_parse(e){const t=N.getValidEnumValues(this._def.values),s=this._getOrReturnCtx(e);if(s.parsedType!==I.string&&s.parsedType!==I.number){const o=N.objectValues(t);return p(s,{expected:N.joinValues(o),received:s.parsedType,code:d.invalid_type}),Q}if(this._cache||(this._cache=new Set(N.getValidEnumValues(this._def.values))),!this._cache.has(e.data)){const o=N.objectValues(t);return p(s,{received:s.data,code:d.invalid_enum_value,options:o}),Q}return Z(e.data)}get enum(){return this._def.values}}ls.create=(A,e)=>new ls({values:A,typeName:y.ZodNativeEnum,...w(e)});class mt extends S{unwrap(){return this._def.type}_parse(e){const{ctx:t}=this._processInputParams(e);if(t.parsedType!==I.promise&&t.common.async===!1)return p(t,{code:d.invalid_type,expected:I.promise,received:t.parsedType}),Q;const s=t.parsedType===I.promise?t.data:Promise.resolve(t.data);return Z(s.then(o=>this._def.type.parseAsync(o,{path:t.path,errorMap:t.common.contextualErrorMap})))}}mt.create=(A,e)=>new mt({type:A,typeName:y.ZodPromise,...w(e)});class Qe extends S{innerType(){return this._def.schema}sourceType(){return this._def.schema._def.typeName===y.ZodEffects?this._def.schema.sourceType():this._def.schema}_parse(e){const{status:t,ctx:s}=this._processInputParams(e),o=this._def.effect||null,n={addIssue:a=>{p(s,a),a.fatal?t.abort():t.dirty()},get path(){return s.path}};if(n.addIssue=n.addIssue.bind(n),o.type==="preprocess"){const a=o.transform(s.data,n);if(s.common.async)return Promise.resolve(a).then(async i=>{if(t.value==="aborted")return Q;const r=await this._def.schema._parseAsync({data:i,path:s.path,parent:s});return r.status==="aborted"?Q:r.status==="dirty"||t.value==="dirty"?Pe(r.value):r});{if(t.value==="aborted")return Q;const i=this._def.schema._parseSync({data:a,path:s.path,parent:s});return i.status==="aborted"?Q:i.status==="dirty"||t.value==="dirty"?Pe(i.value):i}}if(o.type==="refinement"){const a=i=>{const r=o.refinement(i,n);if(s.common.async)return Promise.resolve(r);if(r instanceof Promise)throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");return i};if(s.common.async===!1){const i=this._def.schema._parseSync({data:s.data,path:s.path,parent:s});return i.status==="aborted"?Q:(i.status==="dirty"&&t.dirty(),a(i.value),{status:t.value,value:i.value})}else return this._def.schema._parseAsync({data:s.data,path:s.path,parent:s}).then(i=>i.status==="aborted"?Q:(i.status==="dirty"&&t.dirty(),a(i.value).then(()=>({status:t.value,value:i.value}))))}if(o.type==="transform")if(s.common.async===!1){const a=this._def.schema._parseSync({data:s.data,path:s.path,parent:s});if(!Re(a))return Q;const i=o.transform(a.value,n);if(i instanceof Promise)throw new Error("Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.");return{status:t.value,value:i}}else return this._def.schema._parseAsync({data:s.data,path:s.path,parent:s}).then(a=>Re(a)?Promise.resolve(o.transform(a.value,n)).then(i=>({status:t.value,value:i})):Q);N.assertNever(o)}}Qe.create=(A,e,t)=>new Qe({schema:A,typeName:y.ZodEffects,effect:e,...w(t)});Qe.createWithPreprocess=(A,e,t)=>new Qe({schema:e,effect:{type:"preprocess",transform:A},typeName:y.ZodEffects,...w(t)});class pe extends S{_parse(e){return this._getType(e)===I.undefined?Z(void 0):this._def.innerType._parse(e)}unwrap(){return this._def.innerType}}pe.create=(A,e)=>new pe({innerType:A,typeName:y.ZodOptional,...w(e)});class ke extends S{_parse(e){return this._getType(e)===I.null?Z(null):this._def.innerType._parse(e)}unwrap(){return this._def.innerType}}ke.create=(A,e)=>new ke({innerType:A,typeName:y.ZodNullable,...w(e)});class Ot extends S{_parse(e){const{ctx:t}=this._processInputParams(e);let s=t.data;return t.parsedType===I.undefined&&(s=this._def.defaultValue()),this._def.innerType._parse({data:s,path:t.path,parent:t})}removeDefault(){return this._def.innerType}}Ot.create=(A,e)=>new Ot({innerType:A,typeName:y.ZodDefault,defaultValue:typeof e.default=="function"?e.default:()=>e.default,...w(e)});class qt extends S{_parse(e){const{ctx:t}=this._processInputParams(e),s={...t,common:{...t.common,issues:[]}},o=this._def.innerType._parse({data:s.data,path:s.path,parent:{...s}});return dt(o)?o.then(n=>({status:"valid",value:n.status==="valid"?n.value:this._def.catchValue({get error(){return new ce(s.common.issues)},input:s.data})})):{status:"valid",value:o.status==="valid"?o.value:this._def.catchValue({get error(){return new ce(s.common.issues)},input:s.data})}}removeCatch(){return this._def.innerType}}qt.create=(A,e)=>new qt({innerType:A,typeName:y.ZodCatch,catchValue:typeof e.catch=="function"?e.catch:()=>e.catch,...w(e)});class gs extends S{_parse(e){if(this._getType(e)!==I.nan){const s=this._getOrReturnCtx(e);return p(s,{code:d.invalid_type,expected:I.nan,received:s.parsedType}),Q}return{status:"valid",value:e.data}}}gs.create=A=>new gs({typeName:y.ZodNaN,...w(A)});class hr extends S{_parse(e){const{ctx:t}=this._processInputParams(e),s=t.data;return this._def.type._parse({data:s,path:t.path,parent:t})}unwrap(){return this._def.type}}class hA extends S{_parse(e){const{status:t,ctx:s}=this._processInputParams(e);if(s.common.async)return(async()=>{const n=await this._def.in._parseAsync({data:s.data,path:s.path,parent:s});return n.status==="aborted"?Q:n.status==="dirty"?(t.dirty(),Pe(n.value)):this._def.out._parseAsync({data:n.value,path:s.path,parent:s})})();{const o=this._def.in._parseSync({data:s.data,path:s.path,parent:s});return o.status==="aborted"?Q:o.status==="dirty"?(t.dirty(),{status:"dirty",value:o.value}):this._def.out._parseSync({data:o.value,path:s.path,parent:s})}}static create(e,t){return new hA({in:e,out:t,typeName:y.ZodPipeline})}}class Kt extends S{_parse(e){const t=this._def.innerType._parse(e),s=o=>(Re(o)&&(o.value=Object.freeze(o.value)),o);return dt(t)?t.then(o=>s(o)):s(t)}unwrap(){return this._def.innerType}}Kt.create=(A,e)=>new Kt({innerType:A,typeName:y.ZodReadonly,...w(e)});var y;(function(A){A.ZodString="ZodString",A.ZodNumber="ZodNumber",A.ZodNaN="ZodNaN",A.ZodBigInt="ZodBigInt",A.ZodBoolean="ZodBoolean",A.ZodDate="ZodDate",A.ZodSymbol="ZodSymbol",A.ZodUndefined="ZodUndefined",A.ZodNull="ZodNull",A.ZodAny="ZodAny",A.ZodUnknown="ZodUnknown",A.ZodNever="ZodNever",A.ZodVoid="ZodVoid",A.ZodArray="ZodArray",A.ZodObject="ZodObject",A.ZodUnion="ZodUnion",A.ZodDiscriminatedUnion="ZodDiscriminatedUnion",A.ZodIntersection="ZodIntersection",A.ZodTuple="ZodTuple",A.ZodRecord="ZodRecord",A.ZodMap="ZodMap",A.ZodSet="ZodSet",A.ZodFunction="ZodFunction",A.ZodLazy="ZodLazy",A.ZodLiteral="ZodLiteral",A.ZodEnum="ZodEnum",A.ZodEffects="ZodEffects",A.ZodNativeEnum="ZodNativeEnum",A.ZodOptional="ZodOptional",A.ZodNullable="ZodNullable",A.ZodDefault="ZodDefault",A.ZodCatch="ZodCatch",A.ZodPromise="ZodPromise",A.ZodBranded="ZodBranded",A.ZodPipeline="ZodPipeline",A.ZodReadonly="ZodReadonly"})(y||(y={}));const re=ne.create;Be.create;ve.create;pt.create;be.create;const ur=Yt.create;Ie.create;te.create;const W=T.create;ft.create;It.create;xe.create;const uA=Me.create;mt.create;pe.create;ke.create;const Jt=Qe.createWithPreprocess,U={string:(A=>ne.create({...A,coerce:!0})),number:(A=>Be.create({...A,coerce:!0})),boolean:(A=>pt.create({...A,coerce:!0})),bigint:(A=>ve.create({...A,coerce:!0})),date:(A=>be.create({...A,coerce:!0}))};var dr=Object.defineProperty,pr=(A,e,t)=>e in A?dr(A,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):A[e]=t,fr=(A,e,t)=>(pr(A,e+"",t),t);class Ir extends Ti{constructor(e){super(),fr(this,"maxUncompressedSize");const t=e.TileWidth||e.ImageWidth,s=e.TileLength||e.ImageLength,o=e.BitsPerSample[0]/8;this.maxUncompressedSize=t*s*o}async decodeBlock(e){const t=new Uint8Array(e);return(await Yi(t,this.maxUncompressedSize)).buffer}}function mr(A){if(!Number.isInteger(A))throw Error("Not an integer.");const e=new ArrayBuffer(4);new DataView(e).setInt32(0,A,!1);const s=new Uint8Array(e);return Array.from(s)}function ye(A){const e=A[A.length-1];return e===3||e===4}function xt(A){const e=ye(A.shape),[t,s]=A.shape.slice(e?-3:-2);return{height:t,width:s}}function Cr(A){return 2**Math.floor(Math.log2(A))}const Ws="__vivSignalAborted";function He({attr:A,...e}){return{...A,...e}}function zt(A){return Array.isArray(A)?A:[A]}const Er=uA(["XYZCT","XYZTC","XYCTZ","XYCZT","XYTCZ","XYTZC"]),Br=uA(["int8","int16","int32","uint8","uint16","uint32","float","bit","double","complex","double-complex"]),Rt=uA(["Ym","Zm","Em","Pm","Tm","Gm","Mm","km","hm","dam","m","dm","cm","mm","µm","nm","pm","fm","am","zm","ym","Å","thou","li","in","ft","yd","mi","ua","ly","pc","pt","pixel","reference frame"]),vr=W({}).extend({attr:W({ID:re(),SamplesPerPixel:U.number().optional(),Name:re().optional(),Color:U.number().transform(mr).optional()})}).transform(He),xr=W({}).extend({attr:W({FileName:re()})}).transform(He),Qr=W({UUID:xr.optional()}).extend({attr:W({IFD:U.number().default(0),PlaneCount:U.number().default(1),FirstT:U.number().optional(),FirstC:U.number().optional(),FirstZ:U.number().optional()})}).transform(He),yr=W({Channel:Jt(zt,vr.array()),TiffData:Jt(zt,Qr.array()).optional()}).extend({attr:W({ID:re(),DimensionOrder:Er,Type:Br,SizeT:U.number(),SizeC:U.number(),SizeZ:U.number(),SizeY:U.number(),SizeX:U.number(),PhysicalSizeX:U.number().optional(),PhysicalSizeY:U.number().optional(),PhysicalSizeZ:U.number().optional(),SignificantBits:U.number().optional(),PhysicalSizeXUnit:Rt.optional().default("µm"),PhysicalSizeYUnit:Rt.optional().default("µm"),PhysicalSizeZUnit:Rt.optional().default("µm"),BigEndian:re().transform(A=>A.toLowerCase()==="true").optional(),Interleaved:re().transform(A=>A.toLowerCase()==="true").optional()})}).transform(He).transform(({Channel:A,...e})=>({Channels:A,...e})),wr=W({AquisitionDate:re().optional().default(""),Description:ur().optional().default(""),Pixels:yr}).extend({attr:W({ID:re(),Name:re().optional()})}).transform(He);W({Image:Jt(zt,wr.array())});ge(5,()=>Ir);function _r(A){return typeof A[0]!="string"}async function Dr(A,e=""){const t=jo(A),s=e?t.resolve(e):t,n=await(await de(s,{kind:"group"})).attrs,i="ome"in n?n.ome:n;let r=["0"],c=["t","c","z","y","x"];if("multiscales"in i){const{datasets:g,axes:h}=i.multiscales[0];r=g.map(u=>u.path),h&&(_r(h)?c=h.map(u=>u.name):c=h)}return{data:await Promise.all(r.map(g=>de(s.resolve(g),{kind:"array"}))),rootAttrs:i,labels:c}}function Sr(A){const e=ye(A.shape),[t,s]=A.chunks.slice(e?-3:-2),o=Math.min(t,s);return Cr(o)}function Nr(A){if(new Set(A).size!==A.length)throw new Error("Labels must be unique");return t=>{if(Array.isArray(t))return[...t];const s=Array(A.length).fill(0);for(const[o,n]of Object.entries(t)){const a=A.indexOf(o);if(a===-1)throw new Error(`Invalid indexer key: ${o}`);s[a]=n}return s}}var Rr=Object.defineProperty,br=(A,e,t)=>e in A?Rr(A,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):A[e]=t,hs=(A,e,t)=>(br(A,typeof e!="symbol"?e+"":e,t),t);const us={u1:"Uint8",u2:"Uint16",u4:"Uint32",f4:"Float32",f8:"Float64",i1:"Int8",i2:"Int16",i4:"Int32"};class bt extends Error{}class Mr{constructor(e,t,s){this.labels=t,this.tileSize=s,hs(this,"_data"),hs(this,"_indexer"),this._indexer=Nr(t),this._data=e}get shape(){return this._data.shape}get dtype(){const e=this._data.dtype.toLowerCase();return e.length===2&&e in us?us[e]:e.charAt(0).toUpperCase()+e.slice(1)}get _xIndex(){const e=ye(this._data.shape);return this._data.shape.length-(e?2:1)}_chunkIndex(e,{x:t,y:s}){const o=this._indexer(e);return o[this._xIndex]=t,o[this._xIndex-1]=s,o}_getSlices(e,t){const{height:s,width:o}=xt(this),[n,a]=[e*this.tileSize,Math.min((e+1)*this.tileSize,o)],[i,r]=[t*this.tileSize,Math.min((t+1)*this.tileSize,s)];if(n===a||i===r)throw new bt("Tile slice is zero-sized.");if(n<0||i<0||a>o||r>s)throw new bt("Tile slice is out of bounds.");return[SA(n,a),SA(i,r)]}async _getRaw(e,t){const s=t?.storeOptions?.signal,o=await zo(this._data,e,s);if(typeof o!="object")throw new Error("Expected object from zarr.get");return o}async getRaster({selection:e,signal:t}){const s=this._chunkIndex(e,{x:null,y:null}),o=await this._getRaw(s,{storeOptions:{signal:t}}),{data:n,shape:[a,i]}=o;return{data:n,width:i,height:a}}async getTile(e){const{x:t,y:s,selection:o,signal:n}=e,[a,i]=this._getSlices(t,s),r=this._chunkIndex(o,{x:a,y:i}),c=await this._getRaw(r,{storeOptions:{signal:n}}),{data:l,shape:[g,h]}=c;return{data:l,height:g,width:h}}onTileError(e){if(!(e instanceof bt))throw e}}async function kr(A){const{data:e,rootAttrs:t,labels:s}=await Dr(A),o=Sr(e[0]);return{data:e.map(a=>new Mr(a,s,o)),metadata:t}}async function ul(A,e={}){const t=new tn(A,e.fetchOptions);if(e?.type!=="multiscales")throw Error("Only multiscale OME-Zarr is supported.");return kr(t)}class Lr{constructor(e){this.index=e,this.isVisible=!1,this.isSelected=!1,this.parent=null,this.children=[],this.content=null,this._loader=void 0,this._abortController=null,this._loaderId=0,this._isLoaded=!1,this._isCancelled=!1,this._needsReload=!1}get bbox(){return this._bbox}set bbox(e){this._bbox||(this._bbox=e,"west"in e?this.boundingBox=[[e.west,e.south],[e.east,e.north]]:this.boundingBox=[[e.left,e.top],[e.right,e.bottom]])}get data(){return this.isLoading&&this._loader?this._loader.then(()=>this.data):this.content}get isLoaded(){return this._isLoaded&&!this._needsReload}get isLoading(){return!!this._loader&&!this._isCancelled}get needsReload(){return this._needsReload||this._isCancelled}get byteLength(){const e=this.content?this.content.byteLength:0;return Number.isFinite(e)||console.error("byteLength not defined in tile data"),e}async _loadData({getData:e,requestScheduler:t,onLoad:s,onError:o}){const{index:n,id:a,bbox:i,userData:r,zoom:c}=this,l=this._loaderId;this._abortController=new AbortController;const{signal:g}=this._abortController,h=await t.scheduleRequest(this,v=>v.isSelected?1:-1);if(!h){this._isCancelled=!0;return}if(this._isCancelled){h.done();return}let u=null,f;try{u=await e({index:n,id:a,bbox:i,userData:r,zoom:c,signal:g})}catch(v){f=v||!0}finally{h.done()}if(l===this._loaderId){if(this._loader=void 0,this.content=u,this._isCancelled&&!u){this._isLoaded=!1;return}this._isLoaded=!0,this._isCancelled=!1,f?o(f,this):s(this)}}loadData(e){return this._isLoaded=!1,this._isCancelled=!1,this._needsReload=!1,this._loaderId++,this._loader=this._loadData(e),this._loader}setNeedsReload(){this.isLoading&&(this.abort(),this._loader=void 0),this._needsReload=!0}abort(){this.isLoaded||(this._isCancelled=!0,this._abortController?.abort())}}const Y={OUTSIDE:-1,INTERSECTING:0,INSIDE:1},ds=new E,Tr=new E;class dA{constructor(e=[0,0,0],t=[0,0,0],s){s=s||ds.copy(e).add(t).scale(.5),this.center=new E(s),this.halfDiagonal=new E(t).subtract(this.center),this.minimum=new E(e),this.maximum=new E(t)}clone(){return new dA(this.minimum,this.maximum,this.center)}equals(e){return this===e||!!e&&this.minimum.equals(e.minimum)&&this.maximum.equals(e.maximum)}transform(e){return this.center.transformAsPoint(e),this.halfDiagonal.transform(e),this.minimum.transform(e),this.maximum.transform(e),this}intersectPlane(e){const{halfDiagonal:t}=this,s=Tr.from(e.normal),o=t.x*Math.abs(s.x)+t.y*Math.abs(s.y)+t.z*Math.abs(s.z),n=this.center.dot(s)+e.distance;return n-o>0?Y.INSIDE:n+o<0?Y.OUTSIDE:Y.INTERSECTING}distanceTo(e){return Math.sqrt(this.distanceSquaredTo(e))}distanceSquaredTo(e){const t=ds.from(e).subtract(this.center),{halfDiagonal:s}=this;let o=0,n;return n=Math.abs(t.x)-s.x,n>0&&(o+=n*n),n=Math.abs(t.y)-s.y,n>0&&(o+=n*n),n=Math.abs(t.z)-s.z,n>0&&(o+=n*n),o}}const Ue=new E,ps=new E;class pA{constructor(e=[0,0,0],t=0){this.radius=-0,this.center=new E,this.fromCenterRadius(e,t)}fromCenterRadius(e,t){return this.center.from(e),this.radius=t,this}fromCornerPoints(e,t){return t=Ue.from(t),this.center=new E().from(e).add(t).scale(.5),this.radius=this.center.distance(t),this}equals(e){return this===e||!!e&&this.center.equals(e.center)&&this.radius===e.radius}clone(){return new pA(this.center,this.radius)}union(e){const t=this.center,s=this.radius,o=e.center,n=e.radius,a=Ue.copy(o).subtract(t),i=a.magnitude();if(s>=i+n)return this.clone();if(n>=i+s)return e.clone();const r=(s+i+n)*.5;return ps.copy(a).scale((-s+r)/i).add(t),this.center.copy(ps),this.radius=r,this}expand(e){const s=Ue.from(e).subtract(this.center).magnitude();return s>this.radius&&(this.radius=s),this}transform(e){this.center.transform(e);const t=Ho(Ue,e);return this.radius=Math.max(t[0],Math.max(t[1],t[2]))*this.radius,this}distanceSquaredTo(e){const t=this.distanceTo(e);return t*t}distanceTo(e){const s=Ue.from(e).subtract(this.center);return Math.max(0,s.len()-this.radius)}intersectPlane(e){const t=this.center,s=this.radius,n=e.normal.dot(t)+e.distance;return n<-s?Y.OUTSIDE:n<s?Y.INTERSECTING:Y.INSIDE}}const Fr=new E,Gr=new E,st=new E,ot=new E,nt=new E,Ur=new E,Yr=new E,se={COLUMN0ROW0:0,COLUMN0ROW1:1,COLUMN0ROW2:2,COLUMN1ROW0:3,COLUMN1ROW1:4,COLUMN1ROW2:5,COLUMN2ROW0:6,COLUMN2ROW1:7,COLUMN2ROW2:8};class fA{constructor(e=[0,0,0],t=[0,0,0,0,0,0,0,0,0]){this.center=new E().from(e),this.halfAxes=new G(t)}get halfSize(){const e=this.halfAxes.getColumn(0),t=this.halfAxes.getColumn(1),s=this.halfAxes.getColumn(2);return[new E(e).len(),new E(t).len(),new E(s).len()]}get quaternion(){const e=this.halfAxes.getColumn(0),t=this.halfAxes.getColumn(1),s=this.halfAxes.getColumn(2),o=new E(e).normalize(),n=new E(t).normalize(),a=new E(s).normalize();return new PA().fromMatrix3(new G([...o,...n,...a]))}fromCenterHalfSizeQuaternion(e,t,s){const o=new PA(s),n=new G().fromQuaternion(o);return n[0]=n[0]*t[0],n[1]=n[1]*t[0],n[2]=n[2]*t[0],n[3]=n[3]*t[1],n[4]=n[4]*t[1],n[5]=n[5]*t[1],n[6]=n[6]*t[2],n[7]=n[7]*t[2],n[8]=n[8]*t[2],this.center=new E().from(e),this.halfAxes=n,this}clone(){return new fA(this.center,this.halfAxes)}equals(e){return this===e||!!e&&this.center.equals(e.center)&&this.halfAxes.equals(e.halfAxes)}getBoundingSphere(e=new pA){const t=this.halfAxes,s=t.getColumn(0,st),o=t.getColumn(1,ot),n=t.getColumn(2,nt),a=Fr.copy(s).add(o).add(n);return e.center.copy(this.center),e.radius=a.magnitude(),e}intersectPlane(e){const t=this.center,s=e.normal,o=this.halfAxes,n=s.x,a=s.y,i=s.z,r=Math.abs(n*o[se.COLUMN0ROW0]+a*o[se.COLUMN0ROW1]+i*o[se.COLUMN0ROW2])+Math.abs(n*o[se.COLUMN1ROW0]+a*o[se.COLUMN1ROW1]+i*o[se.COLUMN1ROW2])+Math.abs(n*o[se.COLUMN2ROW0]+a*o[se.COLUMN2ROW1]+i*o[se.COLUMN2ROW2]),c=s.dot(t)+e.distance;return c<=-r?Y.OUTSIDE:c>=r?Y.INSIDE:Y.INTERSECTING}distanceTo(e){return Math.sqrt(this.distanceSquaredTo(e))}distanceSquaredTo(e){const t=Gr.from(e).subtract(this.center),s=this.halfAxes,o=s.getColumn(0,st),n=s.getColumn(1,ot),a=s.getColumn(2,nt),i=o.magnitude(),r=n.magnitude(),c=a.magnitude();o.normalize(),n.normalize(),a.normalize();let l=0,g;return g=Math.abs(t.dot(o))-i,g>0&&(l+=g*g),g=Math.abs(t.dot(n))-r,g>0&&(l+=g*g),g=Math.abs(t.dot(a))-c,g>0&&(l+=g*g),l}computePlaneDistances(e,t,s=[-0,-0]){let o=Number.POSITIVE_INFINITY,n=Number.NEGATIVE_INFINITY;const a=this.center,i=this.halfAxes,r=i.getColumn(0,st),c=i.getColumn(1,ot),l=i.getColumn(2,nt),g=Ur.copy(r).add(c).add(l).add(a),h=Yr.copy(g).subtract(e);let u=t.dot(h);return o=Math.min(u,o),n=Math.max(u,n),g.copy(a).add(r).add(c).subtract(l),h.copy(g).subtract(e),u=t.dot(h),o=Math.min(u,o),n=Math.max(u,n),g.copy(a).add(r).subtract(c).add(l),h.copy(g).subtract(e),u=t.dot(h),o=Math.min(u,o),n=Math.max(u,n),g.copy(a).add(r).subtract(c).subtract(l),h.copy(g).subtract(e),u=t.dot(h),o=Math.min(u,o),n=Math.max(u,n),a.copy(g).subtract(r).add(c).add(l),h.copy(g).subtract(e),u=t.dot(h),o=Math.min(u,o),n=Math.max(u,n),a.copy(g).subtract(r).add(c).subtract(l),h.copy(g).subtract(e),u=t.dot(h),o=Math.min(u,o),n=Math.max(u,n),a.copy(g).subtract(r).subtract(c).add(l),h.copy(g).subtract(e),u=t.dot(h),o=Math.min(u,o),n=Math.max(u,n),a.copy(g).subtract(r).subtract(c).subtract(l),h.copy(g).subtract(e),u=t.dot(h),o=Math.min(u,o),n=Math.max(u,n),s[0]=o,s[1]=n,s}transform(e){this.center.transformAsPoint(e);const t=this.halfAxes.getColumn(0,st);t.transformAsPoint(e);const s=this.halfAxes.getColumn(1,ot);s.transformAsPoint(e);const o=this.halfAxes.getColumn(2,nt);return o.transformAsPoint(e),this.halfAxes=new G([...t,...s,...o]),this}getTransform(){throw new Error("not implemented")}}const fs=new E,Is=new E;class Le{constructor(e=[0,0,1],t=0){this.normal=new E,this.distance=-0,this.fromNormalDistance(e,t)}fromNormalDistance(e,t){return Lt(Number.isFinite(t)),this.normal.from(e).normalize(),this.distance=t,this}fromPointNormal(e,t){e=fs.from(e),this.normal.from(t).normalize();const s=-this.normal.dot(e);return this.distance=s,this}fromCoefficients(e,t,s,o){return this.normal.set(e,t,s),Lt(it(this.normal.len(),1)),this.distance=o,this}clone(){return new Le(this.normal,this.distance)}equals(e){return it(this.distance,e.distance)&&it(this.normal,e.normal)}getPointDistance(e){return this.normal.dot(e)+this.distance}transform(e){const t=Is.copy(this.normal).transformAsVector(e).normalize(),s=this.normal.scale(-this.distance).transform(e);return this.fromPointNormal(s,t)}projectPointOntoPlane(e,t=[0,0,0]){const s=fs.from(e),o=this.getPointDistance(s),n=Is.copy(this.normal).scale(o);return s.subtract(n).to(t)}}const ms=[new E([1,0,0]),new E([0,1,0]),new E([0,0,1])],Cs=new E,Pr=new E;class ae{constructor(e=[]){this.planes=e}fromBoundingSphere(e){this.planes.length=2*ms.length;const t=e.center,s=e.radius;let o=0;for(const n of ms){let a=this.planes[o],i=this.planes[o+1];a||(a=this.planes[o]=new Le),i||(i=this.planes[o+1]=new Le);const r=Cs.copy(n).scale(-s).add(t);a.fromPointNormal(r,n);const c=Cs.copy(n).scale(s).add(t),l=Pr.copy(n).negate();i.fromPointNormal(c,l),o+=2}return this}computeVisibility(e){let t=Y.INSIDE;for(const s of this.planes)switch(e.intersectPlane(s)){case Y.OUTSIDE:return Y.OUTSIDE;case Y.INTERSECTING:t=Y.INTERSECTING;break}return t}computeVisibilityWithPlaneMask(e,t){if(Lt(Number.isFinite(t),"parentPlaneMask is required."),t===ae.MASK_OUTSIDE||t===ae.MASK_INSIDE)return t;let s=ae.MASK_INSIDE;const o=this.planes;for(let n=0;n<this.planes.length;++n){const a=n<31?1<<n:0;if(n<31&&(t&a)===0)continue;const i=o[n],r=e.intersectPlane(i);if(r===Y.OUTSIDE)return ae.MASK_OUTSIDE;r===Y.INTERSECTING&&(s|=a)}return s}}ae.MASK_OUTSIDE=4294967295;ae.MASK_INSIDE=0;ae.MASK_INDETERMINATE=2147483647;new E;new E;new E;new E;new E;new E;new E;new E;new E;new E;new E;new E;new E;new E;new E;new E;new E;const ee=new G,Or=new G,qr=new G,at=new G,Es=new G;function Kr(A,e={}){const t=Pn,s=10;let o=0,n=0;const a=Or,i=qr;a.identity(),i.copy(A);const r=t*Jr(i);for(;n<s&&zr(i)>r;)jr(i,at),Es.copy(at).transpose(),i.multiplyRight(at),i.multiplyLeft(Es),a.multiplyRight(at),++o>2&&(++n,o=0);return e.unitary=a.toTarget(e.unitary),e.diagonal=i.toTarget(e.diagonal),e}function Jr(A){let e=0;for(let t=0;t<9;++t){const s=A[t];e+=s*s}return Math.sqrt(e)}const jt=[1,0,0],Ht=[2,2,1];function zr(A){let e=0;for(let t=0;t<3;++t){const s=A[ee.getElementIndex(Ht[t],jt[t])];e+=2*s*s}return Math.sqrt(e)}function jr(A,e){const t=Yn;let s=0,o=1;for(let c=0;c<3;++c){const l=Math.abs(A[ee.getElementIndex(Ht[c],jt[c])]);l>s&&(o=c,s=l)}const n=jt[o],a=Ht[o];let i=1,r=0;if(Math.abs(A[ee.getElementIndex(a,n)])>t){const c=A[ee.getElementIndex(a,a)],l=A[ee.getElementIndex(n,n)],g=A[ee.getElementIndex(a,n)],h=(c-l)/2/g;let u;h<0?u=-1/(-h+Math.sqrt(1+h*h)):u=1/(h+Math.sqrt(1+h*h)),i=1/Math.sqrt(1+u*u),r=u*i}return G.IDENTITY.to(e),e[ee.getElementIndex(n,n)]=e[ee.getElementIndex(a,a)]=i,e[ee.getElementIndex(a,n)]=r,e[ee.getElementIndex(n,a)]=-r,e}const he=new E,Hr=new E,Zr=new E,Vr=new E,$r=new E,Wr=new G,Xr={diagonal:new G,unitary:new G};function ec(A,e=new fA){if(!A||A.length===0)return e.halfAxes=new G([0,0,0,0,0,0,0,0,0]),e.center=new E,e;const t=A.length,s=new E(0,0,0);for(const k of A)s.add(k);const o=1/t;s.multiplyByScalar(o);let n=0,a=0,i=0,r=0,c=0,l=0;for(const k of A){const L=he.copy(k).subtract(s);n+=L.x*L.x,a+=L.x*L.y,i+=L.x*L.z,r+=L.y*L.y,c+=L.y*L.z,l+=L.z*L.z}n*=o,a*=o,i*=o,r*=o,c*=o,l*=o;const g=Wr;g[0]=n,g[1]=a,g[2]=i,g[3]=a,g[4]=r,g[5]=c,g[6]=i,g[7]=c,g[8]=l;const{unitary:h}=Kr(g,Xr),u=e.halfAxes.copy(h);let f=u.getColumn(0,Zr),v=u.getColumn(1,Vr),x=u.getColumn(2,$r),B=-Number.MAX_VALUE,D=-Number.MAX_VALUE,R=-Number.MAX_VALUE,M=Number.MAX_VALUE,P=Number.MAX_VALUE,O=Number.MAX_VALUE;for(const k of A)he.copy(k),B=Math.max(he.dot(f),B),D=Math.max(he.dot(v),D),R=Math.max(he.dot(x),R),M=Math.min(he.dot(f),M),P=Math.min(he.dot(v),P),O=Math.min(he.dot(x),O);f=f.multiplyByScalar(.5*(M+B)),v=v.multiplyByScalar(.5*(P+D)),x=x.multiplyByScalar(.5*(O+R)),e.center.copy(f).add(v).add(x);const z=Hr.set(B-M,D-P,R-O).multiplyByScalar(.5),q=new G([z[0],0,0,0,z[1],0,0,0,z[2]]);return e.halfAxes.multiplyRight(q),e}const Se=512,Bs=3,Xs=[[.5,.5],[0,0],[0,1],[1,0],[1,1]],eo=Xs.concat([[0,.5],[.5,0],[1,.5],[.5,1]]),tc=eo.concat([[.25,.5],[.75,.5]]);class Ne{constructor(e,t,s){this.x=e,this.y=t,this.z=s}get children(){if(!this._children){const e=this.x*2,t=this.y*2,s=this.z+1;this._children=[new Ne(e,t,s),new Ne(e,t+1,s),new Ne(e+1,t,s),new Ne(e+1,t+1,s)]}return this._children}update(e){const{viewport:t,cullingVolume:s,elevationBounds:o,minZ:n,maxZ:a,bounds:i,offset:r,project:c}=e,l=this.getBoundingVolume(o,r,c);if(i&&!this.insideBounds(i)||s.computeVisibility(l)<0)return!1;if(!this.childVisible){let{z:h}=this;if(h<a&&h>=n){const u=l.distanceTo(t.cameraPosition)*t.scale/t.height;h+=Math.floor(Math.log2(u))}if(h>=a)return this.selected=!0,!0}this.selected=!1,this.childVisible=!0;for(const h of this.children)h.update(e);return!0}getSelected(e=[]){if(this.selected&&e.push(this),this._children)for(const t of this._children)t.getSelected(e);return e}insideBounds([e,t,s,o]){const n=Math.pow(2,this.z),a=Se/n;return this.x*a<s&&this.y*a<o&&(this.x+1)*a>e&&(this.y+1)*a>t}getBoundingVolume(e,t,s){if(s){const r=this.z<1?tc:this.z<2?eo:Xs,c=[];for(const l of r){const g=Vt(this.x+l[0],this.y+l[1],this.z);g[2]=e[0],c.push(s(g)),e[0]!==e[1]&&(g[2]=e[1],c.push(s(g)))}return ec(c)}const o=Math.pow(2,this.z),n=Se/o,a=this.x*n+t*Se,i=Se-(this.y+1)*n;return new dA([a,i,e[0]],[a+n,i+n,e[1]])}}function Ac(A,e,t,s){const o=A instanceof Zo&&A.resolution?A.projectPosition:null,n=Object.values(A.getFrustumPlanes()).map(({normal:u,distance:f})=>new Le(u.clone().negate(),f)),a=new ae(n),i=A.distanceScales.unitsPerMeter[2],r=t&&t[0]*i||0,c=t&&t[1]*i||0,l=A instanceof NA&&A.pitch<=60?e:0;if(s){const[u,f,v,x]=s,B=RA([u,x]),D=RA([v,f]);s=[B[0],Se-B[1],D[0],Se-D[1]]}const g=new Ne(0,0,0),h={viewport:A,project:o,cullingVolume:a,elevationBounds:[r,c],minZ:l,maxZ:e,bounds:s,offset:0};if(g.update(h),A instanceof NA&&A.subViewports&&A.subViewports.length>1){for(h.offset=-1;g.update(h)&&!(--h.offset<-Bs););for(h.offset=1;g.update(h)&&!(++h.offset>Bs););}return g.getSelected()}const le=512,sc=[-1/0,-1/0,1/0,1/0],oc={equal:(A,e)=>{if(A===e)return!0;if(!Array.isArray(A)||!Array.isArray(e))return!1;const t=A.length;if(t!==e.length)return!1;for(let s=0;s<t;s++)if(A[s]!==e[s])return!1;return!0}};function IA(A,e){const t=[e.transformAsPoint([A[0],A[1]]),e.transformAsPoint([A[2],A[1]]),e.transformAsPoint([A[0],A[3]]),e.transformAsPoint([A[2],A[3]])];return[Math.min(...t.map(o=>o[0])),Math.min(...t.map(o=>o[1])),Math.max(...t.map(o=>o[0])),Math.max(...t.map(o=>o[1]))]}function nc(A){return Math.abs(A.split("").reduce((e,t)=>(e<<5)-e+t.charCodeAt(0)|0,0))}function ac(A,e){if(!A||!A.length)return null;const{index:t,id:s}=e;if(Array.isArray(A)){const n=nc(s)%A.length;A=A[n]}let o=A;for(const n of Object.keys(t)){const a=new RegExp(`{${n}}`,"g");o=o.replace(a,String(t[n]))}return Number.isInteger(t.y)&&Number.isInteger(t.z)&&(o=o.replace(/\{-y\}/g,String(Math.pow(2,t.z)-t.y-1))),o}function ic(A,e,t){let s;return s=A.getBounds(),A.isGeospatial?[Math.max(s[0],t[0]),Math.max(s[1],t[1]),Math.min(s[2],t[2]),Math.min(s[3],t[3])]:[Math.max(Math.min(s[0],t[2]),t[0]),Math.max(Math.min(s[1],t[3]),t[1]),Math.min(Math.max(s[2],t[0]),t[2]),Math.min(Math.max(s[3],t[1]),t[3])]}function rc({viewport:A,z:e,cullRect:t}){return(A.subViewports||[A]).map(o=>Zt(o,e||0,t))}function Zt(A,e,t){if(!Array.isArray(e)){const n=t.x-A.x,a=t.y-A.y,{width:i,height:r}=t,c={targetZ:e},l=A.unproject([n,a],c),g=A.unproject([n+i,a],c),h=A.unproject([n,a+r],c),u=A.unproject([n+i,a+r],c);return[Math.min(l[0],g[0],h[0],u[0]),Math.min(l[1],g[1],h[1],u[1]),Math.max(l[0],g[0],h[0],u[0]),Math.max(l[1],g[1],h[1],u[1])]}const s=Zt(A,e[0],t),o=Zt(A,e[1],t);return[Math.min(s[0],o[0]),Math.min(s[1],o[1]),Math.max(s[2],o[2]),Math.max(s[3],o[3])]}function cc(A,e,t){return t?IA(A,t).map(o=>o*e/le):A.map(s=>s*e/le)}function mA(A,e){return Math.pow(2,A)*le/e}function Vt(A,e,t){const s=mA(t,le),o=A/s*360-180,n=Math.PI-2*Math.PI*e/s,a=180/Math.PI*Math.atan(.5*(Math.exp(n)-Math.exp(-n)));return[o,a]}function vs(A,e,t,s){const o=mA(t,s);return[A/o*le,e/o*le]}function lc(A,e,t,s,o=le){if(A.isGeospatial){const[c,l]=Vt(e,t,s),[g,h]=Vt(e+1,t+1,s);return{west:c,north:l,east:g,south:h}}const[n,a]=vs(e,t,s,o),[i,r]=vs(e+1,t+1,s,o);return{left:n,top:a,right:i,bottom:r}}function gc(A,e,t,s,o){const n=ic(A,null,s),a=mA(e,t),[i,r,c,l]=cc(n,a,o),g=[];for(let h=Math.floor(i);h<c;h++)for(let u=Math.floor(r);u<l;u++)g.push({x:h,y:u,z:e});return g}function hc({viewport:A,maxZoom:e,minZoom:t,zRange:s,extent:o,tileSize:n=le,modelMatrix:a,modelMatrixInverse:i,zoomOffset:r=0}){let c=A.isGeospatial?Math.round(A.zoom+Math.log2(le/n))+r:Math.ceil(A.zoom)+r;if(typeof t=="number"&&Number.isFinite(t)&&c<t){if(!o)return[];c=t}typeof e=="number"&&Number.isFinite(e)&&c>e&&(c=e);let l=o;return a&&i&&o&&!A.isGeospatial&&(l=IA(o,a)),A.isGeospatial?Ac(A,c,s,o):gc(A,c,n,l||sc,i)}function uc(A){let e={},t;return s=>{for(const o in s)if(!dc(s[o],e[o])){t=A(s),e=s;break}return t}}function dc(A,e){if(A===e)return!0;if(Array.isArray(A)){const t=A.length;if(!e||e.length!==t)return!1;for(let s=0;s<t;s++)if(A[s]!==e[s])return!1;return!0}return!1}const xs=1,Qt=2,pc="never",fc="no-overlap",CA="best-available",Ic=5,mc={[CA]:Bc,[fc]:vc,[pc]:()=>{}},Cc={extent:null,tileSize:512,maxZoom:null,minZoom:null,maxCacheSize:null,maxCacheByteSize:null,refinementStrategy:"best-available",zRange:null,maxRequests:6,debounceTime:0,zoomOffset:0,onTileLoad:()=>{},onTileUnload:()=>{},onTileError:()=>{}};class Ec{constructor(e){this._getCullBounds=uc(rc),this.opts={...Cc,...e},this.setOptions(this.opts),this.onTileLoad=t=>{this.opts.onTileLoad?.(t),this.opts.maxCacheByteSize!==null&&(this._cacheByteSize+=t.byteLength,this._resizeCache())},this._requestScheduler=new dn({throttleRequests:this.opts.maxRequests>0||this.opts.debounceTime>0,maxRequests:this.opts.maxRequests,debounceTime:this.opts.debounceTime}),this._cache=new Map,this._tiles=[],this._dirty=!1,this._cacheByteSize=0,this._viewport=null,this._zRange=null,this._selectedTiles=null,this._frameNumber=0,this._modelMatrix=new J,this._modelMatrixInverse=new J}get tiles(){return this._tiles}get selectedTiles(){return this._selectedTiles}get isLoaded(){return this._selectedTiles!==null&&this._selectedTiles.every(e=>e.isLoaded)}get needsReload(){return this._selectedTiles!==null&&this._selectedTiles.some(e=>e.needsReload)}setOptions(e){Object.assign(this.opts,e),Number.isFinite(e.maxZoom)&&(this._maxZoom=Math.floor(e.maxZoom)),Number.isFinite(e.minZoom)&&(this._minZoom=Math.ceil(e.minZoom))}finalize(){for(const e of this._cache.values())e.isLoading&&e.abort();this._cache.clear(),this._tiles=[],this._selectedTiles=null}reloadAll(){for(const e of this._cache.keys()){const t=this._cache.get(e);!this._selectedTiles||!this._selectedTiles.includes(t)?this._cache.delete(e):t.setNeedsReload()}}update(e,{zRange:t,modelMatrix:s}={zRange:null,modelMatrix:null}){const o=s?new J(s):new J,n=!o.equals(this._modelMatrix);if(!this._viewport||!e.equals(this._viewport)||!it(this._zRange,t)||n){n&&(this._modelMatrixInverse=o.clone().invert(),this._modelMatrix=o),this._viewport=e,this._zRange=t;const i=this.getTileIndices({viewport:e,maxZoom:this._maxZoom,minZoom:this._minZoom,zRange:t,modelMatrix:this._modelMatrix,modelMatrixInverse:this._modelMatrixInverse});this._selectedTiles=i.map(r=>this._getTile(r,!0)),this._dirty&&this._rebuildTree()}else this.needsReload&&(this._selectedTiles=this._selectedTiles.map(i=>this._getTile(i.index,!0)));const a=this.updateTileStates();return this._pruneRequests(),this._dirty&&this._resizeCache(),a&&this._frameNumber++,this._frameNumber}isTileVisible(e,t,s){if(!e.isVisible)return!1;if(t&&this._viewport){const o=this._getCullBounds({viewport:this._viewport,z:this._zRange,cullRect:t});let{bbox:n}=e;for(const[a,i,r,c]of o){let l;if("west"in n)l=n.west<r&&n.east>a&&n.south<c&&n.north>i;else{if(s&&!J.IDENTITY.equals(s)){const[u,f,v,x]=IA([n.left,n.top,n.right,n.bottom],s);n={left:u,top:f,right:v,bottom:x}}const g=Math.min(n.top,n.bottom),h=Math.max(n.top,n.bottom);l=n.left<r&&n.right>a&&g<c&&h>i}if(l)return!0}return!1}return!0}getTileIndices({viewport:e,maxZoom:t,minZoom:s,zRange:o,modelMatrix:n,modelMatrixInverse:a}){const{tileSize:i,extent:r,zoomOffset:c}=this.opts;return hc({viewport:e,maxZoom:t,minZoom:s,zRange:o,tileSize:i,extent:r,modelMatrix:n,modelMatrixInverse:a,zoomOffset:c})}getTileId(e){return`${e.x}-${e.y}-${e.z}`}getTileZoom(e){return e.z}getTileMetadata(e){const{tileSize:t}=this.opts;return{bbox:lc(this._viewport,e.x,e.y,e.z,t)}}getParentIndex(e){const t=Math.floor(e.x/2),s=Math.floor(e.y/2),o=e.z-1;return{x:t,y:s,z:o}}updateTileStates(){const e=this.opts.refinementStrategy||CA,t=new Array(this._cache.size);let s=0;for(const o of this._cache.values())t[s++]=o.isVisible,o.isSelected=!1,o.isVisible=!1;for(const o of this._selectedTiles)o.isSelected=!0,o.isVisible=!0;(typeof e=="function"?e:mc[e])(Array.from(this._cache.values())),s=0;for(const o of this._cache.values())if(t[s++]!==o.isVisible)return!0;return!1}_pruneRequests(){const{maxRequests:e=0}=this.opts,t=[];let s=0;for(const o of this._cache.values())o.isLoading&&(s++,!o.isSelected&&!o.isVisible&&t.push(o));for(;e>0&&s>e&&t.length>0;)t.shift().abort(),s--}_rebuildTree(){const{_cache:e}=this;for(const t of e.values())t.parent=null,t.children&&(t.children.length=0);for(const t of e.values()){const s=this._getNearestAncestor(t);t.parent=s,s?.children&&s.children.push(t)}}_resizeCache(){const{_cache:e,opts:t}=this,s=t.maxCacheSize??(t.maxCacheByteSize!==null?1/0:Ic*this.selectedTiles.length),o=t.maxCacheByteSize??1/0;if(e.size>s||this._cacheByteSize>o){for(const[a,i]of e)if(!i.isVisible&&!i.isSelected&&(this._cacheByteSize-=t.maxCacheByteSize!==null?i.byteLength:0,e.delete(a),this.opts.onTileUnload?.(i)),e.size<=s&&this._cacheByteSize<=o)break;this._rebuildTree(),this._dirty=!0}this._dirty&&(this._tiles=Array.from(this._cache.values()).sort((a,i)=>a.zoom-i.zoom),this._dirty=!1)}_getTile(e,t){const s=this.getTileId(e);let o=this._cache.get(s),n=!1;return!o&&t?(o=new Lr(e),Object.assign(o,this.getTileMetadata(o.index)),Object.assign(o,{id:s,zoom:this.getTileZoom(o.index)}),n=!0,this._cache.set(s,o),this._dirty=!0):o&&o.needsReload&&(n=!0),o&&n&&o.loadData({getData:this.opts.getTileData,requestScheduler:this._requestScheduler,onLoad:this.onTileLoad,onError:this.opts.onTileError}),o}_getNearestAncestor(e){const{_minZoom:t=0}=this;let s=e.index;for(;this.getTileZoom(s)>t;){s=this.getParentIndex(s);const o=this._getTile(s);if(o)return o}return null}}function Bc(A){for(const e of A)e.state=0;for(const e of A)e.isSelected&&!to(e)&&EA(e);for(const e of A)e.isVisible=!!(e.state&Qt)}function vc(A){for(const t of A)t.state=0;for(const t of A)t.isSelected&&to(t);const e=Array.from(A).sort((t,s)=>t.zoom-s.zoom);for(const t of e)if(t.isVisible=!!(t.state&Qt),t.children&&(t.isVisible||t.state&xs))for(const s of t.children)s.state=xs;else t.isSelected&&EA(t)}function to(A){let e=A;for(;e;){if(e.isLoaded||e.content)return e.state|=Qt,!0;e=e.parent}return!1}function EA(A){for(const e of A.children)e.isLoaded||e.content?e.state|=Qt:EA(e)}const xc={TilesetClass:Ec,data:{type:"data",value:[]},dataComparator:oc.equal,renderSubLayers:{type:"function",value:A=>new iA(A)},getTileData:{type:"function",optional:!0,value:null},onViewportLoad:{type:"function",optional:!0,value:null},onTileLoad:{type:"function",value:A=>{}},onTileUnload:{type:"function",value:A=>{}},onTileError:{type:"function",value:A=>console.error(A)},extent:{type:"array",optional:!0,value:null,compare:!0},tileSize:512,maxZoom:null,minZoom:0,maxCacheSize:null,maxCacheByteSize:null,refinementStrategy:CA,zRange:null,maxRequests:6,debounceTime:0,zoomOffset:0};class BA extends me{initializeState(){this.state={tileset:null,isLoaded:!1}}finalizeState(){this.state?.tileset?.finalize()}get isLoaded(){return!!this.state?.tileset?.selectedTiles?.every(e=>e.isLoaded&&e.layers&&e.layers.every(t=>t.isLoaded))}shouldUpdateState({changeFlags:e}){return e.somethingChanged}updateState({changeFlags:e}){let{tileset:t}=this.state;const s=e.propsOrDataChanged||e.updateTriggersChanged,o=e.dataChanged||e.updateTriggersChanged&&(e.updateTriggersChanged.all||e.updateTriggersChanged.getTileData);t?s&&(t.setOptions(this._getTilesetOptions()),o?t.reloadAll():t.tiles.forEach(n=>{n.layers=null})):(t=new this.props.TilesetClass(this._getTilesetOptions()),this.setState({tileset:t})),this._updateTileset()}_getTilesetOptions(){const{tileSize:e,maxCacheSize:t,maxCacheByteSize:s,refinementStrategy:o,extent:n,maxZoom:a,minZoom:i,maxRequests:r,debounceTime:c,zoomOffset:l}=this.props;return{maxCacheSize:t,maxCacheByteSize:s,maxZoom:a,minZoom:i,tileSize:e,refinementStrategy:o,extent:n,maxRequests:r,debounceTime:c,zoomOffset:l,getTileData:this.getTileData.bind(this),onTileLoad:this._onTileLoad.bind(this),onTileError:this._onTileError.bind(this),onTileUnload:this._onTileUnload.bind(this)}}_updateTileset(){const e=this.state.tileset,{zRange:t,modelMatrix:s}=this.props,o=e.update(this.context.viewport,{zRange:t,modelMatrix:s}),{isLoaded:n}=e,a=this.state.isLoaded!==n,i=this.state.frameNumber!==o;n&&(a||i)&&this._onViewportLoad(),i&&this.setState({frameNumber:o}),this.state.isLoaded=n}_onViewportLoad(){const{tileset:e}=this.state,{onViewportLoad:t}=this.props;t&&t(e.selectedTiles)}_onTileLoad(e){this.props.onTileLoad(e),e.layers=null,this.setNeedsUpdate()}_onTileError(e,t){this.props.onTileError(e),t.layers=null,this.setNeedsUpdate()}_onTileUnload(e){this.props.onTileUnload(e)}getTileData(e){const{data:t,getTileData:s,fetch:o}=this.props,{signal:n}=e;return e.url=typeof t=="string"||Array.isArray(t)?ac(t,e):null,s?s(e):o&&e.url?o(e.url,{propName:"data",layer:this,signal:n}):null}renderSubLayers(e){return this.props.renderSubLayers(e)}getSubLayerPropsByTile(e){return null}getPickingInfo(e){const t=e.sourceLayer,s=t.props.tile,o=e.info;return o.picked&&(o.tile=s),o.sourceTile=s,o.sourceTileSubLayer=t,o}_updateAutoHighlight(e){e.sourceTileSubLayer.updateAutoHighlight(e)}renderLayers(){return this.state.tileset.tiles.map(e=>{const t=this.getSubLayerPropsByTile(e);if(!(!e.isLoaded&&!e.content))if(e.layers)t&&e.layers[0]&&Object.keys(t).some(s=>e.layers[0].props[s]!==t[s])&&(e.layers=e.layers.map(s=>s.clone(t)));else{const s=this.renderSubLayers({...this.props,...this.getSubLayerProps({id:e.id,updateTriggers:this.props.updateTriggers}),data:e.content,_offset:0,tile:e});e.layers=Vo(s,Boolean).map(o=>o.clone({tile:e,...t}))}return e.layers})}filterSubLayer({layer:e,cullRect:t}){const{tile:s}=e.props,{modelMatrix:o}=this.props;return this.state.tileset.isTileVisible(s,t,o?new J(o):null)}}BA.defaultProps=xc;BA.layerName="TileLayer";function Qc(A){return[...Array(A).keys()]}function Ao(A,e,t="channel"){if(e===0)return null;const s=Object.keys(A),o=`${t}0`,n=A[o];if(!n&&s.length===0)return null;if(s.length===e)return A;if(s.length<e&&n){const a={...A};for(let i=0;i<e;i++){const r=`${t}${i}`;a[r]||(a[r]=n)}return a}if(s.length>e){const a={};for(let i=0;i<e;i++)a[`${t}${i}`]=A[`${t}${i}`];return a}return null}function so(A,e,t){for(let s=0;s<t;s+=1)A.push(e);return A}function vA(A){const e=A.charAt(0).toUpperCase()+A.slice(1).toLowerCase(),t=zA[e];if(!t){const s=Object.keys(zA);throw Error(`Dtype not supported, got ${A}. Must be one of ${s}.`)}return t}function oo({contrastLimits:A=[],channelsVisible:e,domain:t,dtype:s}){const o=t?.[1]||vA(s).max,n=A.map((r,c)=>e[c]?r:[o,o]),a=Ee-n.length;if(a<0)throw Error(`${n.length} channels passed in, but only ${Ee} are allowed.`);return so(n,[o,o],a).reduce((r,c)=>r.concat(c),[])}function yc(A){const{x:e,y:t,z:s}=A?.meta?.physicalSizes??{};if(e?.size&&t?.size&&s?.size){const o=Math.min(s.size,e.size,t.size),n=[e.size/o,t.size/o,s.size/o];return new J().scale(n)}return new J().identity()}function wc(A){const e=new $o().makeViewport({viewState:A,height:A.height,width:A.width});return[e.unproject([0,0]),e.unproject([e.width,0]),e.unproject([e.width,e.height]),e.unproject([0,e.height])]}const Ct=[1,2,3,4,5,10,20,25,50,100,200,250,500,1e3],_c=Ct[0],Dc=Ct[Ct.length-1],$t=[{symbol:"Y",exponent:24},{symbol:"Z",exponent:21},{symbol:"E",exponent:18},{symbol:"P",exponent:15},{symbol:"T",exponent:12},{symbol:"G",exponent:9},{symbol:"M",exponent:6},{symbol:"k",exponent:3},{symbol:"h",exponent:2},{symbol:"da",exponent:1},{symbol:"",exponent:0},{symbol:"d",exponent:-1},{symbol:"c",exponent:-2},{symbol:"m",exponent:-3},{symbol:"µ",exponent:-6},{symbol:"n",exponent:-9},{symbol:"p",exponent:-12},{symbol:"f",exponent:-15},{symbol:"a",exponent:-18},{symbol:"z",exponent:-21},{symbol:"y",exponent:-24}];function Sc(A,e){if(!e||e==="m")return A;if(e.length>1){let t=e.substring(0,e.length-1);t==="u"&&(t="µ");const s=$t.find(o=>o.symbol===t);if(s)return A*10**s.exponent}throw new Error("Received unknown unit")}function Nc(A){let e=0;(A<_c||A>Dc)&&(e=Math.floor(Math.log10(A)));let t=$t.find(a=>a.exponent%3===0&&a.exponent<=e),s=A/10**t.exponent;s>500&&s<=1e3&&(t=$t.find(a=>a.exponent%3===0&&a.exponent<=e+3),s=A/10**t.exponent);const o=Ct.find(a=>a>s);return[o*10**t.exponent,o,t.symbol]}function Rc(A){if(!(A instanceof Uint8Array))throw new Error("Expected Uint8Array");const e=new Uint8Array(A.length+A.length/3);for(let t=0;t<A.length/3;t+=1)e[t*4]=A[t*3],e[t*4+1]=A[t*3+1],e[t*4+2]=A[t*3+2],e[t*4+3]=255;return e}const ie={WhiteIsZero:0,BlackIsZero:1,RGB:2,Palette:3,TransparencyMask:4,CMYK:5,YCbCr:6,CIELab:8,ICCLab:9},no={...ks.defaultProps,pickable:{type:"boolean",value:!0,compare:!0},coordinateSystem:$.CARTESIAN},bc=(A,e)=>{const t=e?"true":"false",s=`vec3(${(e||[0,0,0]).map(o=>String(o/255)).join(",")})`;switch(A){case ie.RGB:return`color[3] = (${t} && (color.rgb == ${s})) ? 0.0 : color.a;`;case ie.WhiteIsZero:return`          float value = 1.0 - (color.r / 256.0);
          color = vec4(value, value, value, (${t} && vec3(value, value, value) == ${s}) ? 0.0 : color.a);
        `;case ie.BlackIsZero:return`          float value = (color.r / 256.0);
          color = vec4(value, value, value, (${t} && vec3(value, value, value) == ${s}) ? 0.0 : color.a);
        `;case ie.YCbCr:return`          float y = color[0];
          float cb = color[1];
          float cr = color[2];
          color[0] = (y + (1.40200 * (cr - .5)));
          color[1] = (y - (0.34414 * (cb - .5)) - (0.71414 * (cr - .5)));
          color[2] = (y + (1.77200 * (cb - .5)));
          color[3] = (${t} && distance(color.rgb, ${s}) < 0.01) ? 0.0 : color.a;
        `;default:return console.error("Unsupported photometric interpretation or none provided.  No transformation will be done to image data"),""}},Mc=A=>{switch(A){case ie.RGB:return[0,0,0,0];case ie.WhiteIsZero:return[255,255,255,0];case ie.BlackIsZero:return[0,0,0,0];case ie.YCbCr:return[16,128,128,0];default:return console.error("Unsupported photometric interpretation or none provided.  No transformation will be done to image data"),[0,0,0,0]}},Qs=A=>{if(!A?.data||!A.width||!A.height)return null;const e=A.data&&A.data.length===A.width*A.height*3?Rc(A.data):A.data;return{...A,data:e}};class xA extends ks{_getModel(e){const{photometricInterpretation:t,transparentColorInHook:s}=this.props,o=bc(t,s),n=this.props.selections?.length||1;return new Bt(this.context.device,{...oe(this.getShaders(),n),id:this.props.id,bufferLayout:this.getAttributeManager().getBufferLayouts(),topology:"triangle-list",isInstanced:!1,inject:{"fs:DECKGL_FILTER_COLOR":o},shaderAssembler:rA.getDefaultVivShaderAssembler()})}}const Ze=class extends me{initializeState(A){const{device:e}=this.context;e.setParametersWebGL({[b.UNPACK_ALIGNMENT]:1,[b.PACK_ALIGNMENT]:1}),super.initializeState(A)}updateState({props:A,oldProps:e,...t}){if(super.updateState({props:A,oldProps:e,...t}),!A.image?.data||!A.image?.width||!A.image?.height){this.state.bitmapTexture&&(this.state.bitmapTexture.delete(),this.setState({bitmapTexture:null}));return}if(A.image===e?.image&&this.state.bitmapTexture)return;this.state.bitmapTexture&&this.state.bitmapTexture.delete();const s=Qs(A.image),o=this.context.device.createTexture({width:s.width,height:s.height,dimension:"2d",data:s.data,mipmaps:!1,format:s.format||"rgba8unorm",sampler:{minFilter:"linear",magFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"}});this.setState({bitmapTexture:o})}finalizeState(){this.state.bitmapTexture&&(this.state.bitmapTexture.delete(),this.setState({bitmapTexture:null})),super.finalizeState()}renderLayers(){const{photometricInterpretation:A,transparentColor:e}=this.props,t=Mc(A),s=this.state.bitmapTexture||Qs(this.props.image);return s?new xA({...this.props,image:s},{transparentColor:t,transparentColorInHook:e,id:`${this.props.id}-wrapped`}):null}};Ze.layerName="BitmapLayer";Ze.PHOTOMETRIC_INTERPRETATIONS=ie;Ze.defaultProps={...no,image:{type:"object",value:{},compare:!0},transparentColor:{type:"array",value:[0,0,0],compare:!0},photometricInterpretation:{type:"number",value:2,compare:!0}};xA.defaultProps=no;xA.layerName="BitmapLayerWrapper";const Wt="channelIntensity",kc=`uniform ${Wt}Uniforms {
  vec2 contrastLimits${m};
} ${Wt};

float apply_contrast_limits(float intensity, vec2 contrastLimits) {
    return  max(0., (intensity - contrastLimits[0]) / max(0.0005, (contrastLimits[1] - contrastLimits[0])));
}
`,Lc={name:Wt,uniformTypes:{[`contrastLimits${m}`]:"vec2<f32>"},defines:{SAMPLER_TYPE:"usampler2D",COLORMAP_FUNCTION:""},fs:kc},Tc=`#version 300 es
#define SHADER_NAME xr-layer-fragment-shader
precision highp float;
precision highp int;
precision highp SAMPLER_TYPE;

// our texture
uniform SAMPLER_TYPE channel${m};

in vec2 vTexCoord;

out vec4 fragColor;

void main() {

  float intensity${m} = float(texture(channel${m}, vTexCoord).r);
  DECKGL_PROCESS_INTENSITY(intensity${m}, channelIntensity.contrastLimits${m}, ${m});
  // DECKGL_PROCESS_INTENSITY(intensity${m}, xrLayer.contrastLimits${m}, ${m});

  float[] intensity = float[NUM_CHANNELS](
    // as of this writing, this will be expanded by some very fragile string processing to remove final comma...
    // needs documenting and hopefully improving.
    intensity${m},
  );
  DECKGL_MUTATE_COLOR(fragColor, intensity, vTexCoord);


  geometry.uv = vTexCoord;
  DECKGL_FILTER_COLOR(fragColor, geometry);
}
`,Fc=`#version 300 es
#define SHADER_NAME xr-layer-vertex-shader

in vec2 texCoords;
in vec3 positions;
in vec3 positions64Low;
in vec3 instancePickingColors;
out vec2 vTexCoord;

void main(void) {
  geometry.worldPosition = positions;
  geometry.uv = texCoords;
  geometry.pickingColor = instancePickingColors;
  gl_Position = project_position_to_clipspace(positions, positions64Low, vec3(0.), geometry.position);
  DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
  vTexCoord = texCoords;
  vec4 color = vec4(0.);
  DECKGL_FILTER_COLOR(color, geometry);
}
`,Gc={fs:Tc,vs:Fc,name:"xrLayer"};function ys(A,e,t=Ee){const s=e==="linear",o=vA(s?"Float32":A);return{shaderModule:oe({...Gc},t),filter:e,cast:s?n=>new Float32Array(n):n=>n,...o}}const Uc={pickable:{type:"boolean",value:!0,compare:!0},coordinateSystem:$.CARTESIAN,channelData:{type:"object",value:{},compare:!0},bounds:{type:"array",value:[0,0,1,1],compare:!0},contrastLimits:{type:"array",value:[],compare:!0},channelsVisible:{type:"array",value:[],compare:!0},dtype:{type:"string",value:"Uint16",compare:!0},interpolation:{type:"string",value:"nearest",compare:!0},colormap:{type:"string",value:null,compare:!0}};class yt extends AA{getNumChannels(){return this.props.selections?.length??this.props.channels?.length??Ee}getNumPlanes(){return 1}getShaders(){const{dtype:e,interpolation:t}=this.props,s=this.getNumChannels(),{shaderModule:o,sampler:n}=ys(e,t,s),a=this._isHookDefinedByExtensions("fs:DECKGL_PROCESS_INTENSITY"),r={...oe(Lc,s),inject:{}};return a||(r.inject["fs:DECKGL_PROCESS_INTENSITY"]=`
        intensity = apply_contrast_limits(intensity, contrastLimits);
      `),oe(super.getShaders({...o,defines:{SAMPLER_TYPE:n},modules:[bs,Ms,r]}),s)}_isHookDefinedByExtensions(e){const{extensions:t}=this.props;return t?.some(s=>{const o=s.getShaders.call(this,s),{inject:n={},modules:a=[]}=o,i=n[e],r=a.some(c=>c?.inject[e]);return i||r})}initializeState(){const{device:e}=this.context;e.setParametersWebGL({[b.UNPACK_ALIGNMENT]:1,[b.PACK_ALIGNMENT]:1}),this.getAttributeManager().add({positions:{size:3,type:"float64",fp64:this.use64bitPositions(),update:this.calculatePositions,noAlloc:!0}}),this.setState({numInstances:1,positions:new Float64Array(12)})}finalizeState(){super.finalizeState(),this.state.textures&&Object.values(this.state.textures).forEach(e=>e?.delete())}updateState({props:e,oldProps:t,changeFlags:s,...o}){super.updateState({props:e,oldProps:t,changeFlags:s,...o});const n=this.getNumChannels();if(n===0){this.state.model&&(this.state.model.destroy(),this.setState({model:null}));return}const a=e.colormap!==t?.colormap;if(s.extensionsChanged||e.interpolation!==t.interpolation||a||(e.selections?.length??0)!==(t.selections?.length??0)){const{device:g}=this.context;this.state.model&&this.state.model.destroy(),this.setState({model:this._getModel(g)}),this.getAttributeManager().invalidateAll()}(e.channelData!==t.channelData&&e.channelData?.data!==t.channelData?.data||e.interpolation!==t.interpolation)&&this.loadChannelTextures(e.channelData);const i=this.getAttributeManager();e.bounds!==t.bounds&&i.invalidate("positions");const r=this._newTexturesFromLoadThisFrame??this.state.textures,{model:c}=this.state,l=r&&c?Ao(r,n,"channel"):null;if(l){const{contrastLimits:g,domain:h,dtype:u,channelsVisible:f}=this.props,v=oo({contrastLimits:g.slice(0,n),channelsVisible:f.slice(0,n),domain:h,dtype:u}),x={};for(let B=0;B<n;B++)x[`contrastLimits${B}`]=[v[B*2],v[B*2+1]];c.shaderInputs.setProps({channelIntensity:x}),c.setBindings(l)}}_getModel(e){return e?new Bt(e,{...this.getShaders(),id:this.props.id,geometry:new sA({topology:"triangle-list",vertexCount:6,indices:new Uint16Array([0,1,3,1,2,3]),attributes:{texCoords:{value:new Float32Array([0,1,0,0,1,0,1,1]),size:2}}}),bufferLayout:this.getAttributeManager().getBufferLayouts(),isInstanced:!1,shaderAssembler:rA.getDefaultVivShaderAssembler()}):null}calculatePositions(e){const{positions:t}=this.state,{bounds:s}=this.props;t[0]=s[0],t[1]=s[1],t[2]=0,t[3]=s[0],t[4]=s[3],t[5]=0,t[6]=s[2],t[7]=s[3],t[8]=0,t[9]=s[2],t[10]=s[1],t[11]=0,e.value=t}_setNewTexturesFromLoadThisFrame(e){this._newTexturesFromLoadThisFrame=e}loadChannelTextures(e){const t=this.getNumChannels(),s={};for(let o=0;o<t;o++)s[`channel${o}`]=null;if(this.state.textures&&Object.values(this.state.textures).forEach(o=>o?.delete()),e&&Object.keys(e).length>0&&e.data){e.data.forEach((o,n)=>{s[`channel${n}`]=this.dataToTexture(o,e.width,e.height)},this);for(const o in s){if(!s.channel0)throw new Error("Bad texture state!");s[o]||(s[o]=s.channel0)}this._setNewTexturesFromLoadThisFrame(s),this.setState({textures:s})}else this._setNewTexturesFromLoadThisFrame(null)}dataToTexture(e,t,s){const{interpolation:o}=this.props,n=ys(this.props.dtype,o);return this.context.device.createTexture({width:t,height:s,dimension:"2d",data:n.cast?.(e)??e,mipmaps:!1,sampler:{minFilter:n.filter,magFilter:n.filter,addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"},format:n.format})}}yt.layerName="XRLayer";yt.defaultProps=Uc;const Yc={pickable:{type:"boolean",value:!0,compare:!0},coordinateSystem:$.CARTESIAN,contrastLimits:{type:"array",value:[],compare:!0},channelsVisible:{type:"array",value:[],compare:!0},selections:{type:"array",value:[],compare:!0},domain:{type:"array",value:[],compare:!0},viewportId:{type:"string",value:"",compare:!0},loader:{type:"object",value:{getRaster:async()=>({data:[],height:0,width:0}),dtype:"Uint16",shape:[]},compare:!0},onClick:{type:"function",value:null,compare:!0},onViewportLoad:{type:"function",value:null,compare:!0},interpolation:{type:"number",value:"nearest",compare:!0},extensions:{type:"array",value:[new ze],compare:!0}},wt=class extends me{getNumChannels(){return this.props.selections?.length??this.props.channels?.length??Ee}getNumPlanes(){return 1}finalizeState(){this.state.abortController.abort()}updateState({props:A,oldProps:e}){const t=A.loader!==e.loader,s=A.selections!==e.selections;if(t||s){const{loader:o,selections:n=[],onViewportLoad:a}=this.props,i=new AbortController;this.setState({abortController:i});const{signal:r}=i,c=g=>o.getRaster({selection:g,signal:r}),l=n.map(c);Promise.all(l).then(g=>{const h={data:g.map(u=>u.data),width:g[0]?.width,height:g[0]?.height};ye(o.shape)&&(h.data=h.data[0],h.data.length===h.width*h.height*3&&(h.format="rgba8unorm")),a&&a(h),this.setState({...h})}).catch(g=>{if(g!==Ws)throw g})}}getPickingInfo({info:A,sourceLayer:e}){return A.sourceLayer=e,A.tile=e.props.tile,A}renderLayers(){const{loader:A,id:e}=this.props,{dtype:t}=A,{width:s,height:o,data:n}=this.state;if(!(s&&o))return null;const a=[0,o,s,0];if(ye(A.shape)){const{photometricInterpretation:i=2}=A.meta;return new Ze(this.props,{image:this.state,photometricInterpretation:i,bounds:a,id:`image-sub-layer-${a}-${e}`,extensions:[]})}return new yt(this.props,{channelData:{data:n,height:o,width:s},bounds:a,id:`image-sub-layer-${a}-${e}`,dtype:t})}};wt.layerName="ImageLayer";wt.defaultProps=Yc;function Pc(A){const{bbox:{left:e,top:t},index:{x:s,y:o,z:n}}=A.tile,{data:a,id:i,loader:r,maxZoom:c}=A;if([e,t].some(u=>u<0)||!a||a.width===0||a.height===0)return null;const l=r[0],g=2**Math.round(-n),h=[e,t+a.height*g,e+a.width*g,t];if(ye(l.shape)){const{photometricInterpretation:u=2}=l.meta;return new Ze(A,{image:a,photometricInterpretation:u,bounds:h,id:`tile-sub-layer-${h}-${i}`,tileId:{x:s,y:o,z:n},extensions:[]})}return new yt(A,{channelData:a,bounds:h,id:`tile-sub-layer-${h}-${i}`,tileId:{x:s,y:o,z:n},interpolation:n===c?"nearest":"linear"})}const Oc={pickable:{type:"boolean",value:!0,compare:!0},coordinateSystem:$.CARTESIAN,contrastLimits:{type:"array",value:[],compare:!0},channelsVisible:{type:"array",value:[],compare:!0},renderSubLayers:{type:"function",value:Pc,compare:!1},dtype:{type:"string",value:"Uint16",compare:!0},domain:{type:"array",value:[],compare:!0},viewportId:{type:"string",value:"",compare:!0},interpolation:{type:"number",value:null,compare:!0}};class QA extends BA{_updateTileset(){this.props.viewportId||super._updateTileset(),(this.props.viewportId&&this.context.viewport.id===this.props.viewportId||!this.state.tileset._viewport)&&super._updateTileset()}}QA.layerName="MultiscaleImageLayerBase";QA.defaultProps=Oc;const qc={pickable:{type:"boolean",value:!0,compare:!0},onHover:{type:"function",value:null,compare:!1},contrastLimits:{type:"array",value:[],compare:!0},channelsVisible:{type:"array",value:[],compare:!0},domain:{type:"array",value:[],compare:!0},viewportId:{type:"string",value:"",compare:!0},maxRequests:{type:"number",value:10,compare:!0},onClick:{type:"function",value:null,compare:!0},refinementStrategy:{type:"string",value:null,compare:!0},excludeBackground:{type:"boolean",value:!1,compare:!0},extensions:{type:"array",value:[new ze],compare:!0}},ao=class extends me{renderLayers(){const{loader:A,selections:e,opacity:t,viewportId:s,onTileError:o,onHover:n,id:a,onClick:i,modelMatrix:r,excludeBackground:c,refinementStrategy:l}=this.props,{tileSize:g,dtype:h}=A[0],u=async({index:{x:O,y:z,z:q},signal:k})=>{if(!e||e.length===0)return null;const L=Math.round(-q),_=X=>{const H={x:O,y:z,selection:X,signal:k};return A[L].getTile(H)};try{const X=await Promise.all(e.map(_)),H={data:X.map(lo=>lo.data),width:X[0].width,height:X[0].height};return ye(A[L].shape)&&(H.data=H.data[0],H.data.length===H.width*H.height*3&&(H.format="rgba8unorm")),H}catch(X){if(X===Ws)return null;throw X}},{height:f,width:v}=xt(A[0]),x=new QA(this.props,{id:`Tiled-Image-${a}`,getTileData:u,dtype:h,tileSize:g,zoomOffset:Math.round(Math.log2(r?r.getScale()[0]:1)),extent:[0,0,v,f],minZoom:Math.round(-(A.length-1)),maxZoom:0,refinementStrategy:l||(t===1?"best-available":"no-overlap"),updateTriggers:{getTileData:[A,e]},onTileError:o||A[0].onTileError}),B=A[A.length-1],D=typeof B.getRaster=="function",R=r?r.clone():new J;return[D&&!c&&new wt(this.props,{id:`Background-Image-${a}`,loader:B,modelMatrix:R.scale(2**(A.length-1)),visible:!s||this.context.viewport.id===s,onHover:n,onClick:i,interpolation:"linear",onViewportLoad:null}),x]}};ao.layerName="MultiscaleImageLayer";ao.defaultProps=qc;const Kc={pickable:{type:"boolean",value:!0,compare:!0},loader:{type:"object",value:{getRaster:async()=>({data:[],height:0,width:0}),getRasterSize:()=>({height:0,width:0}),dtype:"<u2"},compare:!0},id:{type:"string",value:"",compare:!0},boundingBox:{type:"array",value:[[0,0],[0,1],[1,1],[1,0]],compare:!0},boundingBoxColor:{type:"array",value:[255,0,0],compare:!0},boundingBoxOutlineWidth:{type:"number",value:1,compare:!0},viewportOutlineColor:{type:"array",value:[255,190,0],compare:!0},viewportOutlineWidth:{type:"number",value:2,compare:!0},overviewScale:{type:"number",value:1,compare:!0},zoom:{type:"number",value:1,compare:!0},extensions:{type:"array",value:[new ze],compare:!0}},io=class extends me{renderLayers(){const{loader:A,id:e,zoom:t,boundingBox:s,boundingBoxColor:o,boundingBoxOutlineWidth:n,viewportOutlineColor:a,viewportOutlineWidth:i,overviewScale:r}=this.props,{width:c,height:l}=xt(A[0]),g=A.length-1,h=A[g],u=new wt(this.props,{id:`viewport-${e}`,modelMatrix:new J().scale(2**g*r),loader:h}),f=new bA({id:`bounding-box-overview-${e}`,coordinateSystem:"cartesian",data:[s],getPolygon:B=>B,filled:!1,stroked:!0,getLineColor:o,getLineWidth:n*2**t}),v=new bA({id:`viewport-outline-${e}`,coordinateSystem:"cartesian",data:[[[0,0],[c*r,0],[c*r,l*r],[0,l*r]]],getPolygon:B=>B,filled:!1,stroked:!0,getLineColor:a,getLineWidth:i*2**t});return[u,f,v]}};io.layerName="OverviewLayer";io.defaultProps=Kc;const Jc={pickable:{type:"boolean",value:!0,compare:!0},imageViewState:{type:"object",value:{zoom:0,target:[0,0,0],width:1,height:1},compare:!0},unit:{type:"string",value:"",compare:!0},size:{type:"number",value:1,compare:!0},position:{type:"string",value:"bottom-right",compare:!0},length:{type:"number",value:.085,compare:!0},snap:{type:"boolean",value:!1,compare:!0}},ro=class extends me{renderLayers(){const{id:A,unit:e,size:t,position:s,imageViewState:o,length:n,snap:a,height:i,width:r}=this.props,c=wc(o),g=(c[2][0]-c[0][0])*.05,h=g*2**o.zoom,u=10;let f=(g*t).toPrecision(5),v=e,x=h;if(a){const k=Sc(t,e),L=g*k,[_,X,H]=Nc(L);f=X,v=`${H}m`,x=_/k*2**o.zoom}let B,D;const R=s.endsWith("-left");switch(s){case"bottom-right":D=i-i*n,B=r-x-r*n;break;case"bottom-left":D=i-i*n,B=r*n;break;case"top-right":D=i*n,B=r-x-r*n;break;case"top-left":D=i*n,B=r*n;break;default:throw new Error(`Position ${s} not found`)}const M=B+x,P=new Oe({id:`scale-bar-length-${A}`,coordinateSystem:$.CARTESIAN,data:[[[R?B:M-x,D],[R?B+x:M,D]]],getSourcePosition:k=>k[0],getTargetPosition:k=>k[1],getWidth:2,getColor:[220,220,220]}),O=new Oe({id:`scale-bar-height-left-${A}`,coordinateSystem:$.CARTESIAN,data:[[[R?B:M-x,D-u],[R?B:M-x,D+u]]],getSourcePosition:k=>k[0],getTargetPosition:k=>k[1],getWidth:2,getColor:[220,220,220]}),z=new Oe({id:`scale-bar-height-right-${A}`,coordinateSystem:$.CARTESIAN,data:[[[R?B+x:M,D-u],[R?B+x:M,D+u]]],getSourcePosition:k=>k[0],getTargetPosition:k=>k[1],getWidth:2,getColor:[220,220,220]}),q=new oA({id:`units-label-layer-${A}`,coordinateSystem:$.CARTESIAN,data:[{text:`${f}${v}`,position:[R?B:M,D-u*2]}],getTextAnchor:R?"start":"end",getColor:[220,220,220,255],getSize:12,fontFamily:aa,sizeUnits:"pixels",sizeScale:1,characterSet:[...v.split(""),...Qc(10).map(k=>String(k)),".","e","+"]});return[P,O,z,q]}};ro.layerName="ScaleBarLayer";ro.defaultProps=Jc;const zc=`#version 300 es
precision highp int;
precision highp float;
precision highp SAMPLER_TYPE;

uniform highp SAMPLER_TYPE volume${m};

in vec3 vray_dir;
flat in vec3 transformed_eye;
out vec4 color;

vec2 intersect_box(vec3 orig, vec3 dir) {
	vec3 box_min = vec3(fragmentUniforms3D.xSlice[0], fragmentUniforms3D.ySlice[0], fragmentUniforms3D.zSlice[0]);
	vec3 box_max = vec3(fragmentUniforms3D.xSlice[1], fragmentUniforms3D.ySlice[1], fragmentUniforms3D.zSlice[1]);
	vec3 inv_dir = 1. / dir;
	vec3 tmin_tmp = (box_min - orig) * inv_dir;
	vec3 tmax_tmp = (box_max - orig) * inv_dir;
	vec3 tmin = min(tmin_tmp, tmax_tmp);
	vec3 tmax = max(tmin_tmp, tmax_tmp);
	float t0 = max(tmin.x, max(tmin.y, tmin.z));
  float t1 = min(tmax.x, min(tmax.y, tmax.z));
  vec2 val = vec2(t0, t1);
	return val;
}

float linear_to_srgb(float x) {
	if (x <= 0.0031308f) {
		return 12.92f * x;
	}
	return 1.055f * pow(x, 1.f / 2.4f) - 0.055f;
}

// Pseudo-random number gen from
// http://www.reedbeta.com/blog/quick-and-easy-gpu-random-numbers-in-d3d11/
// with some tweaks for the range of values
float wang_hash(int seed) {
	seed = (seed ^ 61) ^ (seed >> 16);
	seed *= 9;
	seed = seed ^ (seed >> 4);
	seed *= 0x27d4eb2d;
	seed = seed ^ (seed >> 15);
	return float(seed % 2147483647) / float(2147483647);
}


void main(void) {
	// Step 1: Normalize the view ray
	vec3 ray_dir = normalize(vray_dir);

	// Step 2: Intersect the ray with the volume bounds to find the interval
	// along the ray overlapped by the volume.
	vec2 t_hit = intersect_box(transformed_eye, ray_dir);
	if (t_hit.x > t_hit.y) {
		discard;
	}
	// We don't want to sample voxels behind the eye if it's
	// inside the volume, so keep the starting point at or in front
	// of the eye
	t_hit.x = max(t_hit.x, 0.);

	// Step 3: Compute the step size to march through the volume grid
	vec3 dt_vec = 1. / (fragmentUniforms3D.scale * vec4(abs(ray_dir), 1.)).xyz;
	float dt = 1. * min(dt_vec.x, min(dt_vec.y, dt_vec.z));

	float offset = wang_hash(int(gl_FragCoord.x + 640. * gl_FragCoord.y));

	// Step 4: Starting from the entry point, march the ray through the volume
	// and sample it
	vec3 p = transformed_eye + (t_hit.x + offset * dt) * ray_dir;
	
	#define _U fragmentUniforms3D
	_BEFORE_RENDER

	// TODO: Probably want to stop this process at some point to improve performance when marching down the edges.
	for (float t = t_hit.x; t < t_hit.y; t += dt) {
		// Check if this point is on the "positive" side or "negative" side of the plane - only show positive.
		float canShow = 1.;
		canShow *= max(0., sign(dot(_U.normal${Ae}, p) + _U.distance${Ae}));
		// Do not show coordinates outside 0-1 box.
		// Something about the undefined behavior outside the box causes the additive blender to 
		// render some very odd artifacts.
		float canShowXCoordinate = max(p.x - 0., 0.) * max(1. - p.x , 0.);
		float canShowYCoordinate = max(p.y - 0., 0.) * max(1. - p.y , 0.);
		float canShowZCoordinate = max(p.z - 0., 0.) * max(1. - p.z , 0.);
		float canShowCoordinate = float(ceil(canShowXCoordinate * canShowYCoordinate * canShowZCoordinate));
		canShow = canShowCoordinate * canShow;
		float intensityValue${m} = float(texture(volume${m}, p).r);
		DECKGL_PROCESS_INTENSITY(intensityValue${m}, channelIntensity3D.contrastLimits${m}, ${m});
		intensityValue${m} = canShow * intensityValue${m};


		_RENDER

		p += ray_dir * dt;
	}
	_AFTER_RENDER
  color.r = linear_to_srgb(color.r);
  color.g = linear_to_srgb(color.g);
  color.b = linear_to_srgb(color.b);
}
`,jc=`#version 300 es
#define SHADER_NAME xr-layer-vertex-shader

// Unit-cube vertices
in vec3 positions;

uniform vertexUniforms {
  // Eye position - last column of the inverted view matrix  
  vec3 eye_pos;
  mat4 proj;
  mat4 model;
  mat4 view;
  // A matrix for scaling in the model space before any transformations.
  // This projects the unit cube up to match the "pixel size" multiplied by the physical size ratio, if provided.
  mat4 scale;
  mat4 resolution;
} vertex;

out vec3 vray_dir;
flat out vec3 transformed_eye;

void main() {

  // Step 1: Standard MVP transformation (+ the scale matrix) to place the positions on your 2D screen ready for rasterization + fragment processing.
  gl_Position = vertex.proj * vertex.view * vertex.model * vertex.scale * vertex.resolution * vec4(positions, 1.);

  // Step 2: Invert the eye back from world space to the normalized 0-1 cube world space because ray casting on the fragment shader runs in 0-1 space.
  // Geometrically, the transformed_eye is a position relative to the 0-1 normalized vertices, which themselves are the inverse of the model + scale trasnformation.
  // See below for an example which does not involve a scale transformation, for simplicity, but motivates geometrically the needed transformation on eye_pos.
  /*
  This first diagram is a skewed volume (i.e a "shear" model matrix applied) top down with the eye marked as #, all in world space
       ^
    ___|__
    \\  |  \\
     \\ |   \\
      \\|____\\
       | 
       | 
       |
       #

  This next diagram shows the volume after the inverse model matrix has placed it back in model coordinates, but the eye still in world space. 
       ^
    ___|___
    |  |  |
    |  |  |
    |__|__|
       |
       |
       |
       #

  Finally, we apply the inverse model matrix transformation to the eye as well to bring it too into world space.
  Notice that the ray here matches the "voxels" through which the first ray also passes, as desired.
         ^
    ____/__
    |  /  |
    | /   |
    |/____|
    /
   /
  /
 #
  */
  transformed_eye = (inverse(vertex.resolution) * inverse(vertex.scale) * inverse(vertex.model) * (vec4(vertex.eye_pos, 1.))).xyz;

  // Step 3: Rays are from eye to vertices so that they get interpolated over the fragments.
  vray_dir = positions - transformed_eye;
}
`,Xt="channelIntensity3D",Hc=`uniform ${Xt}Uniforms {
  vec2 contrastLimits${m};
} ${Xt};

float apply_contrast_limits(float intensity, vec2 contrastLimits) {
  float contrastLimitsAppliedToIntensity = (intensity - contrastLimits[0]) / max(0.0005, (contrastLimits[1] - contrastLimits[0]));
  return max(0., contrastLimitsAppliedToIntensity);
}
`,Zc={name:Xt,uniformTypes:{[`contrastLimits${m}`]:"vec2<f32>"},fs:Hc},eA="fragmentUniforms3D",Vc=`uniform ${eA}Uniforms {
  vec2 xSlice;
  vec2 ySlice;
  vec2 zSlice;
  mat4 scale;
  vec3 color${m};
  vec3 normal${Ae};
  float distance${Ae};
} ${eA};
`,$c={name:eA,uniformTypes:{xSlice:"vec2<f32>",ySlice:"vec2<f32>",zSlice:"vec2<f32>",scale:"mat4x4<f32>",[`color${m}`]:"vec3<f32>",[`normal${Ae}`]:"vec3<f32>",[`distance${Ae}`]:"f32"},fs:Vc},Wc="vertex",Xc={name:Wc,uniformTypes:{eye_pos:"vec3<f32>",proj:"mat4x4<f32>",model:"mat4x4<f32>",view:"mat4x4<f32>",scale:"mat4x4<f32>",resolution:"mat4x4<f32>"}},el=[1,1,0,0,1,0,1,1,1,0,1,1,0,0,1,0,1,0,0,0,0,1,1,0,1,0,0,1,1,1,1,0,1,0,0,1,1,0,0,0,0,0],Mt=1,tl={pickable:!1,coordinateSystem:$.CARTESIAN,channelData:{type:"object",value:{},compare:!0},contrastLimits:{type:"array",value:[],compare:!0},colors:{type:"array",value:null,compare:!0},dtype:{type:"string",value:"Uint8",compare:!0},xSlice:{type:"array",value:null,compare:!0},ySlice:{type:"array",value:null,compare:!0},zSlice:{type:"array",value:null,compare:!0},clippingPlanes:{type:"array",value:[],compare:!0},resolutionMatrix:{type:"object",value:new J,compare:!0},channelsVisible:{type:"array",value:[],compare:!0},extensions:{type:"array",value:[new Hs.AdditiveBlendExtension],compare:!0}};function ws(){const A=vA("Float32");return{...A,sampler:A.sampler.replace("2D","3D"),cast:e=>new Float32Array(e)}}function Al(A){let e={};if(A.forEach(t=>{t.rendering._RENDER&&(e=t.rendering)}),!e._RENDER)throw new Error("XR3DLayer requires at least one extension to define opts.rendering as an object with _RENDER as a property at the minimum.");return e}const yA=class extends AA{getNumChannels(){return this.props.selections?.length??this.props.channels?.length??Ee}getNumPlanes(){const{clippingPlanes:A}=this.props;return A?.length||Mt}initializeState(){const{device:A}=this.context;A.setParametersWebGL({[b.UNPACK_ALIGNMENT]:1,[b.PACK_ALIGNMENT]:1})}_isHookDefinedByExtensions(A){const{extensions:e}=this.props;return e?.some(t=>{const s=t.getShaders.call(this,t);if(s){const{inject:o={},modules:n=[]}=s,a=o[A],i=n.some(r=>r?.inject?.[A]);return a||i}return!1})}getShaders(){const{extensions:A}=this.props,{sampler:e}=ws(),{_BEFORE_RENDER:t,_RENDER:s,_AFTER_RENDER:o}=Al(A),n=this._isHookDefinedByExtensions("fs:DECKGL_PROCESS_INTENSITY"),a=this.getNumChannels(),i=this.getNumPlanes(),r=oe(Zc,a,i),c=oe($c,a,i),l=oe(Xc,a,i),g={inject:{},...r};return n||(g.inject["fs:DECKGL_PROCESS_INTENSITY"]=`
        intensity = apply_contrast_limits(intensity, contrastLimits);
      `),oe(super.getShaders({vs:jc,fs:zc.replace("_BEFORE_RENDER",t).replace("_RENDER",s).replace("_AFTER_RENDER",o),defines:{SAMPLER_TYPE:e},modules:[g,c,l]}),a,i)}finalizeState(){super.finalizeState(),this.state.textures&&Object.values(this.state.textures).forEach(A=>A?.delete())}updateState({props:A,oldProps:e,changeFlags:t}){if(this.getNumChannels()===0){this.state.model&&(this.state.model.destroy(),this.setState({model:null}));return}const o=(A.selections?.length??0)!==(e?.selections?.length??0);if(t.extensionsChanged||A.colormap!==e.colormap||A.renderingMode!==e.renderingMode||A.clippingPlanes.length!==e.clippingPlanes.length||o){const{device:n}=this.context;this.state.model&&this.state.model.destroy(),this.setState({model:this._getModel(n)})}A.channelData&&A?.channelData?.data!==e?.channelData?.data&&this.loadTexture(A.channelData),this.state.textures&&this.state.scaleMatrix&&this._updateUniforms(A)}_getModel(A){return A?new Bt(A,{...this.getShaders(),geometry:new sA({topology:"triangle-strip",attributes:{positions:new Float32Array(el)}}),shaderAssembler:rA.getDefaultVivShaderAssembler()}):null}_updateUniforms(A){const{textures:e,scaleMatrix:t}=this.state;if(!e||!t)return;const s=this.getNumChannels(),{contrastLimits:o,colors:n,xSlice:a,ySlice:i,zSlice:r,channelsVisible:c,domain:l,dtype:g,clippingPlanes:h,resolutionMatrix:u,selections:f}=A,v=oo({contrastLimits:o,channelsVisible:c,domain:l,dtype:g}),x=t.clone().invert(),B=u.clone().invert(),D=so(h.map(_=>_.clone().transform(x).transform(B)),new Le([1,0,0]),h.length||Mt),R=D.flatMap(_=>_.normal),M=D.map(_=>_.distance),P=h.length||Mt,O=Object.values(e).filter(_=>_).length,z=Math.max(O,f?.length||0,1),q=lA({channelsVisible:c||Array(z).fill(!0),colors:n||cA(z)}),k={};for(let _=0;_<s;_++)k[`contrastLimits${_}`]=[v[_*2],v[_*2+1]];const L={xSlice:a?a.map(_=>_/t[0]/u[0]):[0,1],ySlice:i?i.map(_=>_/t[5]/u[5]):[0,1],zSlice:r?r.map(_=>_/t[10]/u[10]):[0,1],scale:t};for(let _=0;_<s;_++)L[`color${_}`]=q[_]||[0,0,0];for(let _=0;_<P;_++)L[`normal${_}`]=[R[_*3],R[_*3+1],R[_*3+2]],L[`distance${_}`]=M[_];this.setState({channelIntensity3DUniforms:k,fragmentUniforms3DUniforms:L})}draw(){const{model:A,scaleMatrix:e,channelIntensity3DUniforms:t,fragmentUniforms3DUniforms:s}=this.state;if(!t||!s){this.state.textures&&e&&this._updateUniforms(this.props);return}const o=this._newTexturesFromLoadThisFrame??this.state.textures,n=this.getNumChannels();let a=null;if(o&&A&&e){const i=o,r=n;(this._cachedBindingsTextures!==i||this._cachedBindingsNumChannels!==r)&&(this._cachedBindings=Ao(o,n,"volume"),this._cachedBindingsTextures=i,this._cachedBindingsNumChannels=r),a=this._cachedBindings}if(a&&A&&e){const{modelMatrix:i,resolutionMatrix:r}=this.props,{viewMatrix:c,viewMatrixInverse:l,projectionMatrix:g}=this.context.viewport;this._vertexUniformsData||(this._vertexUniformsData={eye_pos:[0,0,0],proj:null,model:null,view:null,scale:null,resolution:null});const h=this._vertexUniformsData,u=h.eye_pos;u[0]=l[12],u[1]=l[13],u[2]=l[14],h.proj=g,this._defaultModelMatrix||(this._defaultModelMatrix=new J),h.model=i||this._defaultModelMatrix,h.view=c,h.scale=e,h.resolution=r,A.shaderInputs.setProps({channelIntensity3D:t,fragmentUniforms3D:s,vertex:h}),A.setBindings(a),A.draw(this.context.renderPass),this._newTexturesFromLoadThisFrame&&(this._newTexturesFromLoadThisFrame=null)}}loadTexture(A){const e=this.getNumChannels(),t={};for(let s=0;s<e;s++)t[`volume${s}`]=null;if(this.state.textures&&Object.values(this.state.textures).forEach(s=>s?.delete()),A&&Object.keys(A).length>0&&A.data){const{height:s,width:o,depth:n}=A;A.data.forEach((a,i)=>{t[`volume${i}`]=this.dataToTexture(a,o,s,n)},this);for(const a in t){if(!t.volume0)throw new Error("Bad texture state!");t[a]||(t[a]=t.volume0)}this._newTexturesFromLoadThisFrame=t,this.setState({textures:t,scaleMatrix:new J().scale(this.props.physicalSizeScalingMatrix.transformPoint([o,s,n]))},()=>{this._updateUniforms(this.props)})}else this._newTexturesFromLoadThisFrame=null}dataToTexture(A,e,t,s){const o=ws();return this.context.device.createTexture({width:e,height:t,depth:s,dimension:"3d",data:o.cast?.(A)??A,format:o.format,mipmaps:!1,sampler:{minFilter:"linear",magFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge",addressModeW:"clamp-to-edge"}})}};yA.layerName="XR3DLayer";yA.defaultProps=tl;async function sl({source:A,selection:e,onUpdate:t=()=>{},downsampleDepth:s=1,signal:o}){const{shape:n,labels:a,dtype:i}=A,{height:r,width:c}=xt(A),l=n[a.indexOf("z")],g=Math.max(1,Math.floor(l/s)),h=r*c,u=`${i}Array`,f=globalThis[u],v=new f(h*g);return await Promise.all(new Array(g).fill(0).map(async(x,B)=>{const D={...e,z:B*s},{data:R}=await A.getRaster({selection:D,signal:o});let M=0;for(t();M<h;){const P=B*h+(h-M-1),O=(c-M-1)%c+c*Math.floor(M/c);v[P]=R[O],M+=1}t()})),{data:v,height:r,width:c,depth:g}}const ol=(A,e,t)=>new oA({id:`text-${t}`,coordinateSystem:$.CARTESIAN,data:[{text:A,position:e.position}],getColor:[220,220,220,255],getSize:25,sizeUnits:"meters",sizeScale:2**-e.zoom,fontFamily:"Helvetica"}),nl={pickable:!1,coordinateSystem:$.CARTESIAN,contrastLimits:{type:"array",value:[],compare:!0},channelsVisible:{type:"array",value:[],compare:!0},selections:{type:"array",value:[],compare:!0},resolution:{type:"number",value:0,compare:!0},domain:{type:"array",value:[],compare:!0},loader:{type:"object",value:[{getRaster:async()=>({data:[],height:0,width:0}),dtype:"Uint16",shape:[1],labels:["z"]}],compare:!0},xSlice:{type:"array",value:null,compare:!0},ySlice:{type:"array",value:null,compare:!0},zSlice:{type:"array",value:null,compare:!0},clippingPlanes:{type:"array",value:[],compare:!0},onUpdate:{type:"function",value:()=>{},compare:!0},useProgressIndicator:{type:"boolean",value:!0,compare:!0},extensions:{type:"array",value:[new Hs.AdditiveBlendExtension],compare:!0}},co=class extends me{clearState(){this.setState({height:null,width:null,depth:null,data:null,physicalSizeScalingMatrix:null,resolutionMatrix:null,progress:0,abortController:null})}finalizeState(){this.state.abortController.abort()}updateState({oldProps:A,props:e}){const t=e.loader!==A.loader,s=e.resolution!==A.resolution,o=e.selections!==A.selections;if(s&&this.clearState(),t||o||s){const{loader:n,selections:a=[],resolution:i,onViewportLoad:r}=this.props,c=n[i];let l=0;const g=(c.shape[c.labels.indexOf("z")]>>i)*a.length,h=()=>{l+=.5/g,this.props.onUpdate&&this.props.onUpdate({progress:l}),this.setState({progress:l})},u=new AbortController;this.setState({abortController:u});const{signal:f}=u,v=a.map(B=>sl({selection:B,source:c,onUpdate:h,downsampleDepth:2**i,signal:f})),x=yc(n[i]);Promise.all(v).then(B=>{r&&r(B);const D={data:B.map(R=>R.data),width:B[0]?.width,height:B[0]?.height,depth:B[0]?.depth};this.setState({...D,physicalSizeScalingMatrix:x,resolutionMatrix:new J().scale(2**i)})})}}renderLayers(){const{loader:A,id:e,resolution:t,useProgressIndicator:s}=this.props,{dtype:o}=A[t],{data:n,width:a,height:i,depth:r,progress:c,physicalSizeScalingMatrix:l,resolutionMatrix:g}=this.state;if(!(a&&i)&&s){const{viewport:h}=this.context;return ol(`Loading Volume ${String((c||0)*100).slice(0,5)}%...`,h,e)}return new yA(this.props,{channelData:{data:n,width:a,height:i,depth:r},id:`XR3DLayer-0-${i}-${a}-0-${t}-${e}`,physicalSizeScalingMatrix:l,parameters:{[b.CULL_FACE]:!0,[b.CULL_FACE_MODE]:b.FRONT,[b.DEPTH_TEST]:!1,blendFunc:[b.SRC_ALPHA,b.ONE],blend:!0},resolutionMatrix:g,dtype:o})}};co.layerName="VolumeLayer";co.defaultProps=nl;var kt,_s;function al(){return _s||(_s=1,kt=function A(e,t){if(e===t)return!0;if(e&&t&&typeof e=="object"&&typeof t=="object"){if(e.constructor!==t.constructor)return!1;var s,o,n;if(Array.isArray(e)){if(s=e.length,s!=t.length)return!1;for(o=s;o--!==0;)if(!A(e[o],t[o]))return!1;return!0}if(e.constructor===RegExp)return e.source===t.source&&e.flags===t.flags;if(e.valueOf!==Object.prototype.valueOf)return e.valueOf()===t.valueOf();if(e.toString!==Object.prototype.toString)return e.toString()===t.toString();if(n=Object.keys(e),s=n.length,s!==Object.keys(t).length)return!1;for(o=s;o--!==0;)if(!Object.prototype.hasOwnProperty.call(t,n[o]))return!1;for(o=s;o--!==0;){var a=n[o];if(!A(e[a],t[a]))return!1}return!0}return e!==e&&t!==t}),kt}var il=al();const dl=Wo(il);export{Ti as B,Hs as C,Oe as L,co as V,yA as X,ul as a,dl as e,kr as l};
