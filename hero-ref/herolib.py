# milume immersive hero v3: slower, early pulse, AA + near/far fades, depth-of-field
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
W,H=1600,900; SS=2; L=10.0; T=11.0; F=900.0
rng=np.random.default_rng(11)
BG=np.array([11,11,11],float); TEAL=np.array([45,212,191],float)
CAT=np.array([[244,114,182],[96,165,250],[251,191,36],[167,139,250]],float)
# field periodic in z with period L (camera travels exactly one period per loop)
NC=24; N=2700
cent=np.c_[rng.uniform(-15,15,NC),rng.uniform(-9,9,NC),rng.uniform(0,L,NC)]
ccat=rng.integers(0,4,NC); ci=rng.integers(0,NC,N)
P=cent[ci]+rng.normal(0,2.2,(N,3))*[1,1,0.8]
P[:,2]+=rng.uniform(-1.5,1.5,N); P[:,2]%=L     # randomized jitter breaks banding
cat=np.where(rng.random(N)<0.78,ccat[ci],rng.integers(0,4,N))
rad=rng.uniform(0.14,0.24,N)
KS=range(-1,5)
Q0=np.vstack([P+[0,0,k*L] for k in KS]); C0=np.tile(cat,len(KS)); R0=np.tile(rad,len(KS))
SEL=np.array([0.6,-0.3,13.0])
ZN0,ZN1,ZF0,ZF1=0.5,3.0,22.0,30.0
def ss(a,b,x): x=np.clip((x-a)/(b-a),0,1); return x*x*(3-2*x)
def cam(t):
    u=(t/T)%1.0; z=(u*L)%L
    return np.array([0.45*np.sin(2*np.pi*u),0.25*np.sin(4*np.pi*u),z]),0.0125*np.cos(2*np.pi*u)
def pulse(t):
    """(s, amplitude); amplitude 0 outside 0.6-9.6 s so seam is clean"""
    if t<0.6 or t>9.6: return None
    s=t-0.6; a=float(ss(0,1.0,s)*(1-ss(6.0,9.0,s))); return s,a
def render(t):
    c,roll=cam(t)
    d=Q0-c; z=d[:,2]; m=(z>ZN0)&(z<ZF1)
    d,z,cc,rr,Q=d[m],z[m],C0[m],R0[m],Q0[m]
    cr,sr=np.cos(roll),np.sin(roll)
    x=d[:,0]*cr-d[:,1]*sr; y=d[:,0]*sr+d[:,1]*cr
    sx=W/2+F*x/z; sy=H/2+F*y/z; pr=F*rr/z
    col=CAT[cc].copy(); glow=np.zeros(len(z))
    p=pulse(t); zf=11.0
    if p:
        s,a=p
        ds=np.linalg.norm(Q-SEL,axis=1)
        core=0.85*np.exp(-(ds/3.0)**2)*ss(0,1.0,s)
        ring=np.exp(-((ds-2.5-s*1.4)/2.0)**2)*ss(0.3,1.3,s)
        glow=np.clip(core+0.4*ring,0,1)*a
        passed=np.clip((2.5+s*1.4-ds)/2.0,0,1)*a
        col=col*(1-0.08*passed[:,None])+TEAL*0.08*passed[:,None]
        col=col*(1-glow[:,None])+TEAL*glow[:,None]
        zf=11.0+a*((SEL[2]-c[2])-11.0)   # focus follows pulse, back to 11 at seam
    fog=np.clip(1-(z-1)/(ZF1-1),0,1)**1.8
    bright=np.maximum(fog*0.9,glow*np.clip(fog*3,0,0.95))
    col=col*bright[:,None]+BG*(1-bright[:,None])
    alpha=ss(ZN0,ZN1,z)*(1-ss(ZF0,ZF1,z))
    # circle of confusion (px) -> depth bins
    coc=np.minimum(40*np.abs(1/z-1/zf)*zf,40)
    # blur levels (sigma px); each point split linearly between its two nearest levels
    sig=np.array([0,0.6,1.3,2.3,3.6,5.2,7.2,9.6,12.5,16.0])
    fi=np.interp(coc*0.5,sig,np.arange(len(sig)))
    lo=np.floor(fi).astype(int); w=fi-lo; hi=np.minimum(lo+1,len(sig)-1)
    out=np.tile(BG,(H,W,1))
    order=np.argsort(-z)
    levels=[b for b in range(len(sig)) if np.any((lo==b)&(w<1))|np.any((hi==b)&(w>0))]
    # composite levels back-to-front by weighted median depth of members
    def zmed(b): mm=(lo==b)|(hi==b); return -np.median(z[mm])
    levels.sort(key=zmed)
    for b in levels:
        wt=np.where(lo==b,1-w,0)+np.where((hi==b)&(hi!=lo),w,0)
        idx=order[wt[order]>0]
        colL=Image.new('RGB',(W*SS,H*SS),(0,0,0)); cov=Image.new('RGB',(W*SS,H*SS),(0,0,0))
        dc=ImageDraw.Draw(colL,'RGBA'); dv=ImageDraw.Draw(cov,'RGBA')
        for i in idx:
            R=pr[i]*SS
            X,Y=sx[i]*SS,sy[i]*SS
            if X<-R or X>W*SS+R or Y<-R or Y>H*SS+R: continue
            Rd=max(1.0,np.ceil(R*2)/2)
            A=alpha[i]*wt[i]*min(1.0,(R/Rd)**2)
            ai=int(round(255*A))
            if ai<1: continue
            box=[X-Rd,Y-Rd,X+Rd,Y+Rd]
            dc.ellipse(box,fill=tuple(int(v) for v in col[i])+(ai,))
            dv.ellipse(box,fill=(255,255,255,ai))
        colL=colL.resize((W,H),Image.LANCZOS); cov=cov.resize((W,H),Image.LANCZOS)
        if sig[b]>0.3:
            colL=colL.filter(ImageFilter.GaussianBlur(float(sig[b]))); cov=cov.filter(ImageFilter.GaussianBlur(float(sig[b])))
        pc=np.asarray(colL,float); a=np.asarray(cov,float)[:,:,:1]/255.0
        out=out*(1-a)+pc
    if p:
        g=Image.new('RGB',(W,H),(0,0,0)); dg=ImageDraw.Draw(g)
        for i in np.where(glow>0.2)[0]:
            R=pr[i]*1.8
            if R<300: dg.ellipse([sx[i]-R,sy[i]-R,sx[i]+R,sy[i]+R],fill=tuple(int(v*glow[i]*alpha[i]*min(1,fog[i]*3)*0.25) for v in TEAL))
        out=out+np.asarray(g.filter(ImageFilter.GaussianBlur(18)),float)
    return Image.fromarray(np.clip(out+0.5,0,255).astype('uint8'))
