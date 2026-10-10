import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
W,H=1600,900; L=60.0; T=11.0
rng=np.random.default_rng(7)
BG=(11,11,11); TEAL=np.array([45,212,191])
CAT=np.array([[244,114,182],[96,165,250],[251,191,36],[167,139,250]])
# clustered tissue: cluster centres periodic in z
N=16000
cent=np.c_[rng.uniform(-14,14,40),rng.uniform(-9,9,40),rng.uniform(0,L,40)]
ccat=rng.integers(0,4,40)
ci=rng.integers(0,40,N)
P=cent[ci]+rng.normal(0,2.6,(N,3)); P[:,2]%=L
cat=np.where(rng.random(N)<0.8,ccat[ci],rng.integers(0,4,N))
rad=rng.uniform(0.14,0.24,N)
SEL=np.array([1.0,-0.5,40.0])  # selected region
def cam(t):
    u=t/T; z=u*L
    return np.array([2.5*np.sin(2*np.pi*u),1.5*np.sin(4*np.pi*u),z]),0.08*np.cos(2*np.pi*u)
def react(t):
    # ripple: start 3.2s, wave speed, fades out by 10s -> periodic zero at loop
    if t<3.2 or t>10.2: return None
    s=t-3.2; return s,max(0,1-max(0,s-4.5)/2.5)
def render(t):
    c,roll=cam(t)
    Q=np.vstack([P,P+[0,0,L],P-[0,0,L]]); cc=np.tile(cat,3); rr=np.tile(rad,3)
    d=Q-c; z=d[:,2]; m=(z>0.4)&(z<46); d,z,cc,rr,Q=d[m],z[m],cc[m],rr[m],Q[m]
    cr,sr=np.cos(roll),np.sin(roll)
    x=d[:,0]*cr-d[:,1]*sr; y=d[:,0]*sr+d[:,1]*cr
    f=900; sx=W/2+f*x/z; sy=H/2+f*y/z; pr=f*rr/z
    col=CAT[cc].astype(float)
    glow=np.zeros(len(z))
    r=react(t)
    if r:
        s,a=r
        # selection wraps to nearest tile copy of SEL
        ds=np.linalg.norm(Q-SEL,axis=1)
        core=(ds<3.5)*min(1,s/0.5)
        ring=np.exp(-((ds-3.0-s*2.6)/1.2)**2)*(s>0.3)
        glow=np.clip(core+0.8*ring,0,1)*a
        # neighbours behind wave recolor (shift toward teal-tinted hue)
        passed=(ds<3.0+s*2.6)&(ds>=3.0)
        col[passed]=col[passed]*(1-0.25*a)+TEAL*0.25*a
        col=col*(1-glow[:,None])+TEAL*glow[:,None]
    fog=np.clip(1-(z-1)/44,0,1)**2.2
    bright=np.maximum(fog*0.85,glow*np.clip(fog*3,0,0.95))
    col=col*bright[:,None]+np.array(BG)*(1-bright[:,None])
    o=np.argsort(-z)
    far=Image.new('RGB',(W,H),BG); dfar=ImageDraw.Draw(far)
    near=Image.new('RGBA',(W,H),(0,0,0,0)); dn=ImageDraw.Draw(near)
    for i in o:
        R=pr[i]
        if R>500 or sx[i]<-R or sx[i]>W+R or sy[i]<-R or sy[i]>H+R: continue
        C=tuple(int(v) for v in col[i])
        if z[i]<2.5: dn.ellipse([sx[i]-R,sy[i]-R,sx[i]+R,sy[i]+R],fill=C+(150,))
        else:
            dfar.ellipse([sx[i]-R,sy[i]-R,sx[i]+R,sy[i]+R],fill=C)
            if 2.5<=z[i]<7 and (i%3==0):  # transcript specks
                rs=np.random.default_rng(i)
                for k in range(6):
                    a_=rs.uniform(0,6.28); q=R*rs.uniform(1.1,1.7)
                    px,py=sx[i]+q*np.cos(a_),sy[i]+q*np.sin(a_); e=max(1.2,R*0.06)
                    dfar.ellipse([px-e,py-e,px+e,py+e],fill=tuple(min(255,int(v*1.3)) for v in C))
    near=near.filter(ImageFilter.GaussianBlur(14))
    far.paste(near,(0,0),near)
    # glow halo for lit cells
    if r:
        g=Image.new('RGB',(W,H),(0,0,0)); dg=ImageDraw.Draw(g)
        for i in np.where(glow>0.3)[0]:
            R=pr[i]*1.8
            if R<300: dg.ellipse([sx[i]-R,sy[i]-R,sx[i]+R,sy[i]+R],fill=tuple(int(v*glow[i]*min(1,fog[i]*3)*0.5) for v in TEAL))
        g=g.filter(ImageFilter.GaussianBlur(18))
        far=Image.fromarray(np.clip(np.asarray(far,int)+np.asarray(g,int),0,255).astype('uint8'))
    return far
KEYS=[(0.0,"Drift in — slow forward dolly, ease-in-out sine; near cells soft, far fog"),
      (2.6,"Bank left between layers; parallax peaks, transcript specks pass close"),
      (4.0,"A region ignites teal — selection as light, 0.5 s ease-out"),
      (5.8,"Ripple spreads outward; neighbours recolor as the wave passes"),
      (8.6,"Wave fades, tinted field settles; camera keeps gliding"),
      (11.0,"= frame 1: periodic volume, seamless loop")]
try: fnt=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",20); fb=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",20)
except: fnt=fb=ImageFont.load_default()
ims=[]
for n,(t,note) in enumerate(KEYS,1):
    im=render(t%T); im.save(f"clean/k{n}.png")
    d=ImageDraw.Draw(im,'RGBA')
    d.rounded_rectangle([24,24,150,58],12,fill=(0,0,0,170)); d.text((38,29),f"{t:05.2f}s",font=fnt,fill=(230,230,230))
    d.ellipse([W-66,24,W-30,60],fill=(45,212,191,230)); d.text((W-54,29),str(n),font=fb,fill=(11,11,11))
    tw=d.textlength(note,font=fnt); d.rounded_rectangle([24,H-62,48+tw,H-26],12,fill=(0,0,0,170)); d.text((36,H-57),note,font=fnt,fill=(230,230,230))
    im.save(f"k{n}.png"); ims.append(im)
sh=Image.new('RGB',(3*800+40,2*450+30),BG)
for i,im in enumerate(ims): sh.paste(im.resize((800,450)),(10+(i%3)*810,10+(i//3)*460))
sh.save("contact-sheet.png")
