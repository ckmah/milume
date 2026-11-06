"""Panel illustrations for the Moran's I recipe schematic. Schematic, not data.
Writes schematic-moran-panels.svg next to this file (regen.sh renders the PNG)."""
import random
from pathlib import Path

random.seed(11)
W, H = 1200, 400
FONT = "Roboto, 'Helvetica Neue', Arial, sans-serif"
MONO = "'DejaVu Sans Mono', Menlo, monospace"
CT = {"enterocyte": "#4E79A7", "lamina propria": "#59A14F", "muscle": "#C9A26B"}
PW, PH, TOP = 200, 170, 118
XS = [30, 320, 610, 900]
VILLI = (55, 145)  # villus centers; tips point up


def tissue():
    pts = []
    for cx in VILLI:
        for y in range(122, 14, -12):  # enterocytes on both edges of each villus, base (y=122) to tip (y=14)
            for side in (-1, 1):
                pts.append((cx + side * 24 + random.uniform(-2, 2), y + random.uniform(-2, 2), "enterocyte"))
        for y in range(118, 30, -16):
            pts.append((cx + random.uniform(-8, 8), y, "lamina propria"))
    for x in range(10, PW - 5, 13):
        for y in (140, 154):
            pts.append((x + random.uniform(-2, 2), y + random.uniform(-2, 2), "muscle"))
    return pts


P = tissue()


def heat(v):  # 0..1 -> light gray to dark red
    v = max(0.0, min(1.0, v))
    a, b = (236, 236, 236), (165, 15, 21)
    return "#%02x%02x%02x" % tuple(int(a[i] + (b[i] - a[i]) * v) for i in range(3))


erbb3_noise = {i: random.uniform(0.7, 1.0) for i in range(len(P))}
shuffled = list(erbb3_noise.values()); random.shuffle(shuffled)
shuf = dict(zip(erbb3_noise, shuffled))

titles = ["1  Cells in tissue", "2  Erbb3, all cells", "3  Erbb3, enterocytes only", "4  Apob, enterocytes only"]
subs = ["colored by cell type", "bright wherever epithelium is", "no pattern among enterocytes", "low at villus base, high at tip"]
gauge = ["", "Moran's I: high", "Moran's I: near zero", "Moran's I: high"]
codes = [("ml.ds.ileum_merfish_xu2026()", ""),
         ("sq.gr.spatial_neighbors_knn(...)", "sq.gr.spatial_autocorr(...)"),
         ("ent = adata[enterocytes].copy()", "same two calls on ent"),
         ("same run as panel 3,", 'colored by "Apob"')]

out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="{FONT}">',
       f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>',
       '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker></defs>',
       f'<text x="30" y="44" font-size="22" font-weight="700" fill="#1F2328">Moran\'s I asks whether neighbors look alike. Fix the cell type and Erbb3 stops; Apob does not.</text>']
for i, x0 in enumerate(XS):
    out.append(f'<text x="{x0}" y="{TOP-28}" font-size="17" font-weight="700" fill="#1F2328">{titles[i]}</text>')
    out.append(f'<text x="{x0}" y="{TOP-9}" font-size="14" fill="#57606A">{subs[i]}</text>')
    out.append(f'<rect x="{x0}" y="{TOP}" width="{PW}" height="{PH}" rx="10" fill="#F6F8FA" stroke="#D0D7DE"/>')
    if gauge[i]:
        out.append(f'<text x="{x0+PW-8}" y="{TOP+PH-6}" font-size="13" font-weight="700" fill="#1F2328" text-anchor="end">{gauge[i]}</text>')
    c1, c2 = codes[i]
    out.append(f'<text x="{x0}" y="{TOP+PH+30}" font-size="12" font-family="{MONO}" fill="#24292F">{c1}</text>')
    if c2:
        out.append(f'<text x="{x0}" y="{TOP+PH+48}" font-size="12" font-family="{MONO}" fill="#24292F">{c2}</text>')
    if i < 3:
        ax = x0 + PW + 22
        out.append(f'<line x1="{ax}" y1="{TOP+PH/2}" x2="{ax+44}" y2="{TOP+PH/2}" stroke="#555" stroke-width="2.5" marker-end="url(#ah)"/>')
    g = [f'<g transform="translate({x0},{TOP})">']
    if i == 0:
        g.append(f'<text x="{PW/2}" y="10" font-size="10" fill="#57606A" text-anchor="middle">villus tips (lumen)</text>')
    for j, (a, b, t) in enumerate(P):
        ent = t == "enterocyte"
        if i == 0:
            col, op = CT[t], 1
        elif i == 1:
            col, op = heat(erbb3_noise[j] if ent else random.uniform(0, 0.08)), 1
        elif i == 2:
            col, op = (heat(random.uniform(0.15, 1.0)), 1) if ent else ("#D0D7DE", 0.35)
        else:
            col, op = (heat((122 - b) / 108 + random.uniform(-0.12, 0.12)), 1) if ent else ("#D0D7DE", 0.35)
        g.append(f'<circle cx="{a:.1f}" cy="{b:.1f}" r="5" fill="{col}" opacity="{op}"/>')
    g.append("</g>")
    out += g
# legend for panel 1 and the color scale
lx, ly = XS[0], TOP + PH + 66
for t in ["enterocyte", "lamina propria", "muscle"]:
    out.append(f'<circle cx="{lx+6}" cy="{ly-4}" r="6" fill="{CT[t]}"/><text x="{lx+16}" y="{ly}" font-size="13" fill="#24292F">{t}</text>')
    lx += 112
sx = XS[1]
for k in range(20):
    out.append(f'<rect x="{sx+k*6}" y="{TOP+PH+56}" width="6" height="10" fill="{heat(k/19)}"/>')
out.append(f'<text x="{sx}" y="{TOP+PH+82}" font-size="12" fill="#57606A">low</text><text x="{sx+120}" y="{TOP+PH+82}" font-size="12" fill="#57606A" text-anchor="end">high expression</text>')
out.append(f'<text x="30" y="{H-12}" font-size="13" fill="#57606A">Schematic, not data. Gray cells in panels 3 and 4 are left out of the graph and the score.</text>')
out.append("</svg>")
Path(__file__).with_name("schematic-moran-panels.svg").write_text("\n".join(out))
