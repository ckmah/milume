from PIL import Image, ImageDraw
import os
def sbs(a, b, out, crop=None, scale=1):
    A = Image.open(a).convert("RGB"); B = Image.open(b).convert("RGB")
    if crop: A, B = A.crop(crop), B.crop(crop)
    if scale != 1: A, B = (im.resize((im.width * scale, im.height * scale), Image.LANCZOS) for im in (A, B))
    o = Image.new("RGB", (A.width * 2 + 8, A.height + 28), (30, 30, 30)); o.paste(A, (0, 28)); o.paste(B, (A.width + 8, 28))
    d = ImageDraw.Draw(o); d.text((8, 8), "before (5bc677e)", fill=(230, 230, 230)); d.text((A.width + 16, 8), "after (fresnel 0.15-0.6, flat 0.6, shine 0, img boost 0.75)", fill=(230, 230, 230))
    o.save(out)
for n in ["w100-orbit", "w300-orbit", "cutz-w100-orbit", "cutx-w100-iso"]:
    f = f"mesh-colour-{n}.png"; sbs(f"before/{f}", f"after/{f}", f"sbs-{n}.png")
sbs("before/mesh-colour-w100-orbit.png", "after/mesh-colour-w100-orbit.png", "sbs-zoom-w100-orbit.png", crop=(330, 200, 650, 460), scale=2)
