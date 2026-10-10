# milume hero — "Inside the tissue" (immersive, full bleed)
11.0 s seamless loop · 1600×900 · bg #0b0b0b · highlight #2dd4bf · 4 category colours (pink/blue/amber/violet)
Renderer: gen.py (numpy + PIL pinhole camera, depth-sorted flat discs, fog, defocused near layer, additive teal halo).
Volume is periodic in z (length 60) and the camera path is periodic in x/y/roll, so t=11 s == t=0 exactly (clean/k1 and clean/k6 are byte-identical).
Cells are procedural (40 clustered niches, 16k cells), not real data.

| # | Time | Camera move & speed | What lights up / reacts | Depth cues |
|---|------|--------------------|------------------------|-----------|
| 1 | 0.00 s | Constant forward dolly (~5.5 units/s), slight drift right; sine ease on lateral sway only | Nothing lit — resting field, niches read as colour clusters | Near cells big + blurred, far cells small & fogged into black |
| 2 | 2.60 s | Banks/sways left through a dense layer; roll ≈ 0.08 rad | Still neutral; transcript specks (tiny bright dots) ring the cells passing close | Peak parallax: foreground streams past, mid-layer slower |
| 3 | 4.00 s | Same speed, heading into a pocket ahead-centre | A region ignites teal (core fades in over 0.5 s, ease-out) with a soft halo that glows through occluding cells | Glow overrides fog so the lit region reads at depth |
| 4 | 5.80 s | Camera flies into the lit region | Ripple shell spreads outward (~2.6 units/s); cells inside it tint toward teal, the wavefront flashes | Lit cells now near and large; wavefront wraps the camera |
| 5 | 8.60 s | Exits the region, continues forward | Wave fading (2.5 s linear fade, finishes by 10.2 s); residual teal tint dissolves | Lit region falls behind, field ahead returns to resting colours |
| 6 | 11.00 s | = frame 1 | Nothing lit | Loop point |

**Loop point:** 11.00 s → 0.00 s. Reaction is fully off from 10.2–11 s and 0–3.2 s, so the cut is inside a calm stretch. Motion is continuous (constant forward speed, periodic sway), so there is no ease-out/in at the seam.

## Export
- **WebM (docs site):** 1600×900, 30 fps, 330 frames, VP9 CRF ~32, muted autoplay loop playsinline; MP4 H.264 fallback. Expect ~2–4 MB.
- **GIF (README):** 800×450, 12 fps (132 frames), 64–128 colour global palette (ffmpeg palettegen stats_mode=diff + paletteuse dither=none or bayer_scale=5).
- **GIF and dense dots:** flat discs on black with few colours quantize cleanly (no banding on the flat fills; the blurred near layer and the teal halo are the only gradients and can band a little at 64 colours, so 96–128 is the better choice). The catch is file size, not looks: a single keyframe at 800×450 with 96 colours and no dither is ~130 KB, and with forward motion almost every pixel changes, so frame diffing helps little. 132 frames would be ~10–17 MB. To get under ~4 MB: use 640×360 at 10 fps, thin the cells about 40% and drop the specks for the GIF only, or loop a 5–6 s segment. Or ship an animated WebP/MP4 `<video>` in the README where GitHub supports it, and keep the GIF only as the fallback still loop.
- Transcript specks are 1–2 px at GIF size and will mostly disappear; that's fine, they're a WebM-only detail.
