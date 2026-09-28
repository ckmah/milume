# image-texture

The image window goes to the GPU at its own dtype, and no CPU copy of it stays
once it is there. It draws as it did when Viv uploaded it as float32.

**Spec:** `frontend/e2e/volume-cube/volume-cube.spec.ts` — `"a uint8 image reaches the GPU as one byte per voxel, with no CPU copy left"`, `"a uint16 image draws as it did at float32, as r16unorm or as floats without norm16"`

## Sub-features

- uint8 -> `r8unorm` 3D texture (1 B/voxel): `data-image-format="r8unorm"` on
  `.volume-cube__view` once a layer draws it (`"none"` before)
- uint16 -> `r16unorm` (2 B/voxel) when the context has `EXT_texture_norm16`,
  else `r32float` (exact for every uint16; how Viv drew it before)
- Any other dtype -> `r32float`, as before
- Contrast limits keep their raw-value meaning: a unorm sample is `v / max`,
  and the cube shader multiplies it back (`imageScale`: 255, 65535 or 1) before
  Viv's contrast ramp
- No CPU copy after upload: the texels are written with `copyImageData` (luma.gl
  keeps no reference), the volume Viv lays out for the upload is detached right
  after it (its `byteLength` reads 0), and the fetched block is released once
  Viv has read it (`WindowPixelSource.release`)
- Labels for the shown window fetch no image chunks (the shown image is reused,
  not refetched)
- Viv still draws the box, raycast, cuts, pan, presets, MIP/additive, palettes,
  contrast, gamma, alpha, Show image and the label compositing

## How to get to it (user POV)

Nothing to click: every window the cube shows (standalone widget, Landmarks'
dock and hover preview) goes up this way.

## Driving it with Playwright

```ts
await recordTextures(page); // init script: texStorage3D / texSubImage3D log on window.__tex3d
await page.reload({ waitUntil: "networkidle" });
const view = volumeCubeWidget(page).locator(".volume-cube__view");
await expect(view).toHaveAttribute("data-image-format", "r8unorm");
// storage contains [GL_R8, 100, 100, 64] and no R32F volume;
// the one 640000-byte write's array now has byteLength 0.
```

The uint16 test serves the toy image as `<u2` (`serveImageAsUint16`: each
voxel `v` as `v * 257`) with the contrast scaled by 257, and compares
screenshots of the 8-bit original, the r16unorm upload and (after an init
script hides `EXT_texture_norm16`) the r32float upload.

Helpers (in the spec): `recordTextures`, `serveImageAsUint16`, `pixelDiff`,
`settledView`.

**Proof**

- Functional: `data-image-format`; the texture formats and sizes allocated; the
  Viv volume detached after its one write.
- Pixels: uint16 as r16unorm, as r32float and the uint8 original agree within
  one level on under 0.1 % of lit pixels (measured: 0-41 of ~100 k, all by 1,
  SwiftShader and an NVIDIA RTX 5000 Ada). A wrong `imageScale` moves every
  pixel.
- The Landmarks dock pixel test (verify-landmarks `inspect-cube`) checks
  `data-image-format="r8unorm"` and an R8 texture 101 voxels wide (unaligned
  rows).

## Gotchas

- `CubeVolumeLayer` / `CubeXR3DLayer` (`image-volume.ts`) subclass Viv's layers:
  `FramedVolumeView.getLayers` builds the VolumeLayer under Viv's own id, whose
  `renderLayers` rebuilds Viv's XR3DLayer as `CubeXR3DLayer` with the same props
  (as deck.gl's `clone` does). Only `dataToTexture` is replaced; Viv's getVolume
  still lays the volume out, so the label texel order (`vivRow`) is unchanged.
- The cube extension only draws on a layer named `CubeXR3DLayer`: if Viv stops
  going through the subclass, the palette and labels vanish and
  `data-image-format` stays `"none"`.
- The contrast hook (`fs:DECKGL_PROCESS_INTENSITY` in the `cubeRender` module)
  replaces Viv's default ramp; Viv skips its own when an extension defines it.
- Viv's VolumeLayer keeps its laid-out volume in state; it is detached after the
  upload, so a second upload of the same volume throws (Viv never does one: a
  new texture always comes with a new volume).
- Hardware filtering of unorm and float textures rounds differently: on a real
  GPU the r8unorm dock renders differ from the old float32 ones in a few pixels
  by one level (SwiftShader, headless Chromium without a GPU, gives identical pixels).
- Headless Playwright on Windows runs SwiftShader, which has no
  `EXT_texture_norm16`: the r16unorm branch runs there only with a GPU
  (`--use-angle=d3d11 --enable-gpu`).
