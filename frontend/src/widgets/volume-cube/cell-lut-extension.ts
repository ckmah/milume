import { ColorPalette3DExtensions } from "@hms-dbmi/viv";
import { Matrix4 } from "@math.gl/core";

import type { MeshTarget } from "./cell-mesh";

import { type ImageFormat, imageTextureInfo } from "./image-volume";
import { DEFAULT_RENDER, type RenderSettings, paletteLut } from "./palettes";

/**
 * Viv volume rendering of the image: raycast alone (`volume0`, at its own dtype:
 * image-volume.ts), coloured through a 256-texel palette (`imagePalette`) with
 * alpha and gamma from the `render` prop, clipped to the cut. With `showImage`
 * false the image adds nothing (a uniform, no refetch). Cells are meshes
 * (cell-mesh.ts), coloured by `buildCellLut`, rendered offscreen just before; the
 * ray composites their nearest front and back surfaces at their depth.
 */

/** Widest a lookup texture row gets; indices wrap onto rows. */
export const CELL_LUT_WIDTH = 2048;

export type CellLut = { data: Uint8Array; width: number; height: number };

// Defined beside the palettes so chrome can use them without importing Viv.
export { DEFAULT_RENDER, type RenderSettings } from "./palettes";

/** A 256-texel image colour map from `paletteLut`. */
export type ImagePalette = { data: Uint8Array; width: number; height: number };

let liveTraitContrast: [number, number][] = [[0, 255], [0, 255], [0, 255], [0, 255]];
let liveImageChannelCount = 1;

/** Per-channel contrast for the cube raycast (trait `_image_channels`, raw dtype units). */
export function setCubeTraitContrast(limits: [number, number][]) {
  liveTraitContrast = limits.length
    ? limits
    : [[0, 255], [0, 255], [0, 255], [0, 255]];
}

/** Push trait contrast into cubeRender UBO before the cube extension draw binds palettes. */
export function applyCubeRenderShaderUniforms(layer: LayerLike): void {
  const { model } = layer.state;
  if (!model) return;
  const render = layer.props.render as (RenderSettings & { traitContrast?: [number, number][] }) | null;
  const traitLimits =
    (layer.props as { cubeTraitContrast?: [number, number][] }).cubeTraitContrast ??
    render?.traitContrast ??
    layer.props.contrastLimits ??
    undefined;
  if (traitLimits?.length) setCubeTraitContrast(traitLimits as [number, number][]);
  const imageOn = layer.props.showImage === false ? 0 : 1;
  const image = imageTextureInfo(layer.state.textures?.volume0);
  const frac = layer.props.cutFrac;
  const selections = (layer.props as { selections?: unknown[] }).selections;
  liveImageChannelCount = Math.max(selections?.length ?? 0, layer.props.channelPalettes?.length ?? 1);
  const lim = (i: number): [number, number] =>
    liveTraitContrast[i] ?? traitLimits?.[i] ?? [0, 255];
  const target = layer.props.cubeMeshTarget;
  const meshOn = Boolean(target?.drawn && target.front && target.back);
  const uniforms: CubeUniforms = {
    ...(layer.props.render ?? DEFAULT_RENDER),
    imageOn,
    imageScale: image?.scale ?? 1,
    imageMip: layer.props.imageMode === "mip" ? 1 : 0,
    imageChannelCount: liveImageChannelCount,
    imageContrast0: lim(0),
    imageContrast1: lim(1),
    imageContrast2: lim(2),
    imageContrast3: lim(3),
    cutX0: frac?.[0] ?? 0,
    cutX1: frac?.[1] ?? 1,
    cutY0: frac?.[2] ?? 0,
    cutY1: frac?.[3] ?? 1,
    cutZ0: frac?.[4] ?? 0,
    cutZ1: frac?.[5] ?? 1,
    meshOn: meshOn ? 1 : 0,
  };
  if (meshOn) {
    const { viewport, device } = layer.context;
    const m = new Matrix4(viewport.projectionMatrix)
      .multiplyRight(viewport.viewMatrix)
      .multiplyRight(layer.props.modelMatrix ?? new Matrix4())
      .multiplyRight(layer.state.scaleMatrix ?? new Matrix4())
      .multiplyRight(layer.props.resolutionMatrix ?? new Matrix4());
    uniforms.meshInv = Array.from(m.invert());
    uniforms.meshViewport = Array.from(device.gl.getParameter(device.gl.VIEWPORT) as Int32Array);
  }
  model.shaderInputs.setProps({ cubeRender: uniforms });
}

type CubeUniforms = Partial<RenderSettings> & {
  imageOn?: number;
  imageScale?: number;
  imageMip?: number;
  imageChannelCount?: number;
  imageContrast0?: [number, number];
  imageContrast1?: [number, number];
  imageContrast2?: [number, number];
  imageContrast3?: [number, number];
  cutX0?: number;
  cutX1?: number;
  cutY0?: number;
  cutY1?: number;
  cutZ0?: number;
  cutZ1?: number;
  meshOn?: number;
  meshInv?: number[];
  meshViewport?: number[];
};

// The module must not share a sampler's name: luma.gl keys a module's
// uniforms by module name and would set that sampler's texture unit from them.
const CUBE_RENDER_UNIFORM_TYPES = {
    imageAlpha: "f32",
    imageGamma: "f32",
    imageOn: "f32",
    imageScale: "f32",
    imageMip: "f32",
    imageChannelCount: "f32",
    imageContrast0: "vec2<f32>",
    imageContrast1: "vec2<f32>",
    imageContrast2: "vec2<f32>",
    imageContrast3: "vec2<f32>",
    cutX0: "f32",
    cutX1: "f32",
    cutY0: "f32",
    cutY1: "f32",
    cutZ0: "f32",
    cutZ1: "f32",
    meshOn: "f32",
    meshInv: "mat4x4<f32>",
    meshViewport: "vec4<f32>",
  } as const;

const CUBE_RENDER_DEFAULT_UNIFORMS = {
    imageAlpha: 1,
    imageGamma: 1,
    imageOn: 1,
    imageScale: 1,
    imageMip: 0,
    imageChannelCount: 1,
    imageContrast0: [0, 255],
    imageContrast1: [0, 255],
    imageContrast2: [0, 255],
    imageContrast3: [0, 255],
    cutX0: 0,
    cutX1: 1,
    cutY0: 0,
    cutY1: 1,
    cutZ0: 0,
    cutZ1: 1,
    meshOn: 0,
    meshInv: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    meshViewport: [0, 0, 1, 1],
  };

function channelContrastFromProps(render: CubeUniforms, channel: 0 | 1 | 2 | 3): [number, number] {
  const pairs: ([number, number] | undefined)[] = [
    render.imageContrast0,
    render.imageContrast1,
    render.imageContrast2,
    render.imageContrast3,
  ];
  const fromProps = pairs[channel];
  if (fromProps) return fromProps;
  return liveTraitContrast[channel] ?? [0, 255];
}

function cubeRenderGetUniforms(render: CubeUniforms = {}) {
  const trait = (i: 0 | 1 | 2 | 3): [number, number] =>
    liveTraitContrast[i] ?? channelContrastFromProps(render, i);
  return {
    imageAlpha: render.imageAlpha ?? DEFAULT_RENDER.imageAlpha,
    imageGamma: render.imageGamma ?? DEFAULT_RENDER.imageGamma,
    imageOn: render.imageOn ?? 1,
    imageScale: render.imageScale ?? 1,
    imageMip: render.imageMip ?? 0,
    imageChannelCount: render.imageChannelCount ?? liveImageChannelCount,
    imageContrast0: trait(0),
    imageContrast1: trait(1),
    imageContrast2: trait(2),
    imageContrast3: trait(3),
    cutX0: render.cutX0 ?? 0,
    cutX1: render.cutX1 ?? 1,
    cutY0: render.cutY0 ?? 0,
    cutY1: render.cutY1 ?? 1,
    cutZ0: render.cutZ0 ?? 0,
    cutZ1: render.cutZ1 ?? 1,
    meshOn: render.meshOn ?? 0,
    meshInv: render.meshInv ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    meshViewport: render.meshViewport ?? [0, 0, 1, 1],
  };
}

const cubeRenderModuleSingle = {
  name: "cubeRender",
  uniformTypes: CUBE_RENDER_UNIFORM_TYPES,
  defaultUniforms: CUBE_RENDER_DEFAULT_UNIFORMS,
  getUniforms: cubeRenderGetUniforms,
  inject: {
    "fs:DECKGL_PROCESS_INTENSITY": "intensity = intensity * cubeRender.imageScale;",
  },
  fs: `\
uniform cubeRenderUniforms {
  float imageAlpha;
  float imageGamma;
  float imageOn;
  float imageScale;
  float imageMip;
  float imageChannelCount;
  vec2 imageContrast0;
  vec2 imageContrast1;
  vec2 imageContrast2;
  vec2 imageContrast3;
  float cutX0;
  float cutX1;
  float cutY0;
  float cutY1;
  float cutZ0;
  float cutZ1;
  float meshOn;
  mat4 meshInv;
  vec4 meshViewport;
} cubeRender;

uniform highp sampler3D imagePalette;
uniform highp sampler3D meshFrontColor;
uniform highp sampler3D meshFrontDepth;
uniform highp sampler3D meshBackColor;
uniform highp sampler3D meshBackDepth;

vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }

float cover(float a, float steps) {
  return 1.0 - pow(clamp(1.0 - a, 0.0, 1.0), steps);
}

// Single-channel: Viv applies contrast before intensity reaches this shader (see inject).
vec4 imageSample(float v) {
  float g = pow(clamp(v, 0.0, 1.0), cubeRender.imageGamma);
  vec3 c = srgbToLinear(texelFetch(imagePalette, ivec3(int(g * 255.0 + 0.5), 0, 0), 0).rgb);
  return vec4(c, g * cubeRender.imageAlpha * cubeRender.imageOn);
}

const float NO_MESH = 1e9;

vec3 linearToSrgb(vec3 c) { return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

vec4 meshSurface(highp sampler3D col, highp sampler3D dep, vec3 eye, vec3 dir, out float t) {
  t = NO_MESH;
  if (cubeRender.meshOn < 0.5) return vec4(0.0);
  ivec3 px = ivec3(ivec2(gl_FragCoord.xy), 0);
  vec4 d = texelFetch(dep, px, 0);
  if (d.a < 0.5) return vec4(0.0);
  vec4 c = texelFetch(col, px, 0);
  float z = dot(d.rgb, vec3(1.0, 1.0 / 255.0, 1.0 / 65025.0));
  vec2 ndc = (gl_FragCoord.xy - cubeRender.meshViewport.xy) / cubeRender.meshViewport.zw * 2.0 - 1.0;
  vec4 q = cubeRender.meshInv * vec4(ndc, z * 2.0 - 1.0, 1.0);
  t = dot(q.xyz / q.w - eye, dir);
  return c;
}

void addSample(inout vec4 acc, vec4 im, float steps) {
  float a = cover(im.a, steps);
  acc.rgb += (1.0 - acc.a) * a * im.rgb;
  acc.a += (1.0 - acc.a) * a;
}

void meshFlush(inout vec4 shown, inout vec4 acc, vec4 m) {
  shown.rgb += (1.0 - shown.a) * acc.a * linearToSrgb(clamp(acc.rgb, 0.0, 1.0));
  shown.a += (1.0 - shown.a) * acc.a;
  acc = vec4(0.0);
  shown.rgb += (1.0 - shown.a) * m.a * m.rgb;
  shown.a += (1.0 - shown.a) * m.a;
}
`,
};

const cubeRenderModuleMulti = {
  name: "cubeRender",
  uniformTypes: CUBE_RENDER_UNIFORM_TYPES,
  defaultUniforms: CUBE_RENDER_DEFAULT_UNIFORMS,
  getUniforms: cubeRenderGetUniforms,
  inject: {
    "fs:DECKGL_PROCESS_INTENSITY": "intensity = intensity * cubeRender.imageScale;",
  },
  fs: `\
uniform cubeRenderUniforms {
  float imageAlpha;
  float imageGamma;
  float imageOn;
  float imageScale;
  float imageMip;
  float imageChannelCount;
  vec2 imageContrast0;
  vec2 imageContrast1;
  vec2 imageContrast2;
  vec2 imageContrast3;
  float cutX0;
  float cutX1;
  float cutY0;
  float cutY1;
  float cutZ0;
  float cutZ1;
  float meshOn;
  mat4 meshInv;
  vec4 meshViewport;
} cubeRender;

// A 3D texture one texel deep: luma.gl validates the program before it assigns
// texture units, and a sampler2D beside Viv's sampler3Ds (all on unit 0 then)
// fails that validation.
uniform highp sampler3D imagePalette;
uniform highp sampler3D imagePalette1;
uniform highp sampler3D imagePalette2;
uniform highp sampler3D imagePalette3;
uniform highp sampler3D meshFrontColor;
uniform highp sampler3D meshFrontDepth;
uniform highp sampler3D meshBackColor;
uniform highp sampler3D meshBackDepth;

vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }

// Alpha of that many composited samples. A step of 1 leaves a unchanged.
float cover(float a, float steps) {
  return 1.0 - pow(clamp(1.0 - a, 0.0, 1.0), steps);
}

vec4 tintedSample(float v, highp sampler3D palette) {
  float g = pow(clamp(v, 0.0, 1.0), cubeRender.imageGamma);
  vec3 c = srgbToLinear(texelFetch(palette, ivec3(int(g * 255.0 + 0.5), 0, 0), 0).rgb);
  return vec4(c, g * cubeRender.imageAlpha * cubeRender.imageOn);
}

vec4 imageSample(float v) {
  return tintedSample(v, imagePalette);
}

vec4 combinedImageSample2(float v0, float v1) {
  vec4 s0 = tintedSample(v0, imagePalette);
  if (cubeRender.imageChannelCount < 2.5) return s0;
  vec4 s1 = tintedSample(v1, imagePalette1);
  return vec4(s0.rgb + s1.rgb, min(1.0, s0.a + s1.a));
}

vec4 combinedImageSample3(float v0, float v1, float v2) {
  vec4 s0 = tintedSample(v0, imagePalette);
  if (cubeRender.imageChannelCount < 1.5) return s0;
  vec4 acc = s0;
  if (cubeRender.imageChannelCount > 1.5) {
    vec4 s1 = tintedSample(v1, imagePalette1);
    acc = vec4(acc.rgb + s1.rgb, min(1.0, acc.a + s1.a));
  }
  if (cubeRender.imageChannelCount > 2.5) {
    vec4 s2 = tintedSample(v2, imagePalette2);
    acc = vec4(acc.rgb + s2.rgb, min(1.0, acc.a + s2.a));
  }
  return acc;
}

vec4 combinedImageSample4(float v0, float v1, float v2, float v3) {
  vec4 s0 = tintedSample(v0, imagePalette);
  if (cubeRender.imageChannelCount < 1.5) return s0;
  vec4 acc = s0;
  if (cubeRender.imageChannelCount > 1.5) {
    vec4 s1 = tintedSample(v1, imagePalette1);
    acc = vec4(acc.rgb + s1.rgb, min(1.0, acc.a + s1.a));
  }
  if (cubeRender.imageChannelCount > 2.5) {
    vec4 s2 = tintedSample(v2, imagePalette2);
    acc = vec4(acc.rgb + s2.rgb, min(1.0, acc.a + s2.a));
  }
  if (cubeRender.imageChannelCount > 3.5) {
    vec4 s3 = tintedSample(v3, imagePalette3);
    acc = vec4(acc.rgb + s3.rgb, min(1.0, acc.a + s3.a));
  }
  return acc;
}

const float NO_MESH = 1e9;

// Viv's linear_to_srgb, per channel.
vec3 linearToSrgb(vec3 c) { return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

// One mesh surface at this pixel: (sRGB rgb, alpha), and its distance t along the ray
// in the ray's space (NO_MESH when there is none). meshInv takes clip space back to
// the unit cube the ray marches.
vec4 meshSurface(highp sampler3D col, highp sampler3D dep, vec3 eye, vec3 dir, out float t) {
  t = NO_MESH;
  if (cubeRender.meshOn < 0.5) return vec4(0.0);
  ivec3 px = ivec3(ivec2(gl_FragCoord.xy), 0);
  vec4 d = texelFetch(dep, px, 0);
  if (d.a < 0.5) return vec4(0.0);
  vec4 c = texelFetch(col, px, 0);
  float z = dot(d.rgb, vec3(1.0, 1.0 / 255.0, 1.0 / 65025.0));
  vec2 ndc = (gl_FragCoord.xy - cubeRender.meshViewport.xy) / cubeRender.meshViewport.zw * 2.0 - 1.0;
  vec4 q = cubeRender.meshInv * vec4(ndc, z * 2.0 - 1.0, 1.0);
  t = dot(q.xyz / q.w - eye, dir);
  return c;
}

// A sample over that many steps' worth of the ray.
void addSample(inout vec4 acc, vec4 im, float steps) {
  float a = cover(im.a, steps);
  acc.rgb += (1.0 - acc.a) * a * im.rgb;
  acc.a += (1.0 - acc.a) * a;
}

// Where a ray meets a mesh, the image so far (acc, the ray's usual linear sum) goes
// into "shown" as the canvas would show it, sRGB premultiplied, then the mesh over
// what follows, and acc starts again behind the mesh. This is how the image looked
// under the meshes when they drew over the cube; a ray that meets none is untouched.
void meshFlush(inout vec4 shown, inout vec4 acc, vec4 m) {
  shown.rgb += (1.0 - shown.a) * acc.a * linearToSrgb(clamp(acc.rgb, 0.0, 1.0));
  shown.a += (1.0 - shown.a) * acc.a;
  acc = vec4(0.0);
  shown.rgb += (1.0 - shown.a) * m.a * m.rgb;
  shown.a += (1.0 - shown.a) * m.a;
}
`,
};

// No channel placeholders anywhere, so Viv does not repeat these lines per
// channel. One loop for both projections (a uniform, so a toggle needs no
// recompile): the image accumulates samples (Additive) or keeps the maximum
// (MIP), and stops once saturated. Viv steps p after _RENDER, so _RENDER may
// break but must not continue.
const IN_CUT = `
    vec2 xS = fragmentUniforms3D.xSlice;
    vec2 yS = fragmentUniforms3D.ySlice;
    vec2 zS = fragmentUniforms3D.zSlice;
    float xLo = mix(xS.x, xS.y, cubeRender.cutX0);
    float xHi = mix(xS.x, xS.y, cubeRender.cutX1);
    float yLo = mix(yS.x, yS.y, cubeRender.cutY0);
    float yHi = mix(yS.x, yS.y, cubeRender.cutY1);
    float zLo = mix(zS.x, zS.y, cubeRender.cutZ0);
    float zHi = mix(zS.x, zS.y, cubeRender.cutZ1);
    bool inCut = p.x >= xLo - 0.002 && p.x <= xHi + 0.002
      && p.y >= yLo - 0.002 && p.y <= yHi + 0.002
      && p.z >= zLo - 0.002 && p.z <= zHi + 0.002;`;

const RENDERING_SINGLE = {
  _BEFORE_RENDER: `
  vec4 acc = vec4(0.0);
  float meshT0;
  float meshT1;
  vec4 mesh0 = meshSurface(meshFrontColor, meshFrontDepth, transformed_eye, ray_dir, meshT0);
  vec4 mesh1 = meshSurface(meshBackColor, meshBackDepth, transformed_eye, ray_dir, meshT1);
  if (meshT1 < meshT0) {
    vec4 m = mesh0; mesh0 = mesh1; mesh1 = m;
    float t = meshT0; meshT0 = meshT1; meshT1 = t;
  }
  bool meshHere = meshT0 < NO_MESH;
  vec4 shown = vec4(0.0);
  float maxImage = -1.0;
  bool ghosting = cubeRender.cutX1 - cubeRender.cutX0 < 0.999
    || cubeRender.cutY1 - cubeRender.cutY0 < 0.999
    || cubeRender.cutZ1 - cubeRender.cutZ0 < 0.999;
  float stepScale = 1.0;`,
  _RENDER: `
    ${IN_CUT}
    bool imageHere = !(ghosting && !inCut);
    float lo = meshHere ? dot(p - transformed_eye, ray_dir) - 0.5 * dt : 0.0;
    if (meshHere && cubeRender.imageMip < 0.5 && meshT0 < lo + dt) {
      vec4 im = imageHere ? imageSample(intensityValue0) : vec4(0.0);
      float done = 0.0;
      for (int k = 0; k < 2; k++) {
        if (meshT0 >= lo + dt) break;
        float f = clamp((meshT0 - lo) / dt, done, 1.0);
        addSample(acc, im, stepScale * (f - done));
        done = f;
        meshFlush(shown, acc, mesh0);
        meshT0 = meshT1;
        mesh0 = mesh1;
        meshT1 = NO_MESH;
      }
      addSample(acc, im, stepScale * (1.0 - done));
    } else if (imageHere) {
      if (cubeRender.imageMip > 0.5) {
        maxImage = max(maxImage, intensityValue0);
      } else if (acc.a < 0.95) {
        vec4 im = imageSample(intensityValue0);
        float a = cover(im.a, stepScale);
        acc.rgb += (1.0 - acc.a) * a * im.rgb;
        acc.a += (1.0 - acc.a) * a;
      }
    }
    if (cubeRender.imageMip < 0.5 && 1.0 - (1.0 - shown.a) * (1.0 - acc.a) >= 0.95) {
      break;
    }`,
  _AFTER_RENDER: `
  color = acc;
  if (cubeRender.imageMip > 0.5) {
    vec4 im = imageSample(maxImage);
    color = vec4(im.rgb * cubeRender.imageAlpha * cubeRender.imageOn, cubeRender.imageOn);
  }
  if (meshHere) {
    if (cubeRender.imageMip > 0.5) {
      acc = vec4(0.0);
      if (meshT0 < NO_MESH) meshFlush(shown, acc, mesh0);
      if (meshT1 < NO_MESH) meshFlush(shown, acc, mesh1);
      acc = color;
    } else {
      if (meshT0 < NO_MESH) meshFlush(shown, acc, mesh0);
      if (meshT1 < NO_MESH) meshFlush(shown, acc, mesh1);
    }
    meshFlush(shown, acc, vec4(0.0));
    color = vec4(srgbToLinear(shown.rgb / max(shown.a, 1e-6)), shown.a);
  }`,
};

const RENDERING_MULTI = {
  _BEFORE_RENDER: `
  vec4 acc = vec4(0.0);
  float meshT0;
  float meshT1;
  vec4 mesh0 = meshSurface(meshFrontColor, meshFrontDepth, transformed_eye, ray_dir, meshT0);
  vec4 mesh1 = meshSurface(meshBackColor, meshBackDepth, transformed_eye, ray_dir, meshT1);
  if (meshT1 < meshT0) {
    vec4 m = mesh0; mesh0 = mesh1; mesh1 = m;
    float t = meshT0; meshT0 = meshT1; meshT1 = t;
  }
  bool meshHere = meshT0 < NO_MESH;
  vec4 shown = vec4(0.0);
  float maxImage0 = -1.0;
  float maxImage1 = -1.0;
#if NUM_CHANNELS > 2
  float maxImage2 = -1.0;
#endif
#if NUM_CHANNELS > 3
  float maxImage3 = -1.0;
#endif
  bool ghosting = cubeRender.cutX1 - cubeRender.cutX0 < 0.999
    || cubeRender.cutY1 - cubeRender.cutY0 < 0.999
    || cubeRender.cutZ1 - cubeRender.cutZ0 < 0.999;
  float stepScale = 1.0;`,
  _RENDER: `
    ${IN_CUT}
    bool imageHere = !(ghosting && !inCut);
    // This sample stands for the step around it (lo to lo + dt along the ray).
    float lo = meshHere ? dot(p - transformed_eye, ray_dir) - 0.5 * dt : 0.0;
    if (meshHere && cubeRender.imageMip < 0.5 && meshT0 < lo + dt) {
      // A mesh surface inside the step splits it: the part in front goes in before
      // the surface, the rest after.
      vec4 im = vec4(0.0);
      if (imageHere) {
#if NUM_CHANNELS == 1
        im = imageSample(intensityValue0);
#elif NUM_CHANNELS == 2
        im = combinedImageSample2(intensityValue0, intensityValue1);
#elif NUM_CHANNELS == 3
        im = combinedImageSample3(intensityValue0, intensityValue1, intensityValue2);
#else
        im = combinedImageSample4(intensityValue0, intensityValue1, intensityValue2, intensityValue3);
#endif
      }
      float done = 0.0;
      // At most the two surfaces; the one left after a flush moves up to mesh0.
      for (int k = 0; k < 2; k++) {
        if (meshT0 >= lo + dt) break;
        float f = clamp((meshT0 - lo) / dt, done, 1.0);
        addSample(acc, im, stepScale * (f - done));
        done = f;
        meshFlush(shown, acc, mesh0);
        meshT0 = meshT1;
        mesh0 = mesh1;
        meshT1 = NO_MESH;
      }
      addSample(acc, im, stepScale * (1.0 - done));
    } else if (imageHere) {
      if (cubeRender.imageMip > 0.5) {
        maxImage0 = max(maxImage0, intensityValue0);
#if NUM_CHANNELS > 1
        maxImage1 = max(maxImage1, intensityValue1);
#endif
#if NUM_CHANNELS > 2
        maxImage2 = max(maxImage2, intensityValue2);
#endif
#if NUM_CHANNELS > 3
        maxImage3 = max(maxImage3, intensityValue3);
#endif
      } else if (acc.a < 0.95) {
        vec4 im = vec4(0.0);
#if NUM_CHANNELS == 1
        im = imageSample(intensityValue0);
#elif NUM_CHANNELS == 2
        im = combinedImageSample2(intensityValue0, intensityValue1);
#elif NUM_CHANNELS == 3
        im = combinedImageSample3(intensityValue0, intensityValue1, intensityValue2);
#else
        im = combinedImageSample4(intensityValue0, intensityValue1, intensityValue2, intensityValue3);
#endif
        float a = cover(im.a, stepScale);
        acc.rgb += (1.0 - acc.a) * a * im.rgb;
        acc.a += (1.0 - acc.a) * a;
      }
    }
    if (cubeRender.imageMip < 0.5 && 1.0 - (1.0 - shown.a) * (1.0 - acc.a) >= 0.95) {
      break;
    }`,
  _AFTER_RENDER: `
  color = acc;
  if (cubeRender.imageMip > 0.5) {
    vec4 im = vec4(0.0);
#if NUM_CHANNELS == 1
    im = imageSample(maxImage0);
#elif NUM_CHANNELS == 2
    im = combinedImageSample2(maxImage0, maxImage1);
#elif NUM_CHANNELS == 3
    im = combinedImageSample3(maxImage0, maxImage1, maxImage2);
#else
    im = combinedImageSample4(maxImage0, maxImage1, maxImage2, maxImage3);
#endif
    color = vec4(im.rgb * cubeRender.imageAlpha * cubeRender.imageOn, cubeRender.imageOn);
  }
  if (meshHere) {
    // In a projection there is no depth to put the meshes at: they go over it.
    if (cubeRender.imageMip > 0.5) {
      acc = vec4(0.0);
      if (meshT0 < NO_MESH) meshFlush(shown, acc, mesh0);
      if (meshT1 < NO_MESH) meshFlush(shown, acc, mesh1);
      acc = color;
    } else {
      if (meshT0 < NO_MESH) meshFlush(shown, acc, mesh0);
      if (meshT1 < NO_MESH) meshFlush(shown, acc, mesh1);
    }
    meshFlush(shown, acc, vec4(0.0));
    // Viv turns color to sRGB and the canvas blend weights it by alpha: undo both.
    color = vec4(srgbToLinear(shown.rgb / max(shown.a, 1e-6)), shown.a);
  }`,
};

type Texture = { destroy(): void };
type Device = { gl: WebGL2RenderingContext; createTexture(props: Record<string, unknown>): Texture };

type LayerLike = {
  constructor: { layerName?: string };
  props: {
    /** Default true; false: the image adds nothing to the ray. */
    showImage?: boolean;
    /** Default "additive": accumulate the image's samples; "mip": its maximum along the ray. */
    imageMode?: "additive" | "mip";
    /** Called when the format of the image texture this layer draws changes (null: none yet). */
    onImageBound?: (format: ImageFormat | null) => void;
    imagePalette?: ImagePalette | null;
    /** Per-channel tint palettes (up to 4); index 0 uses `imagePalette`. */
    channelPalettes?: ImagePalette[] | null;
    render?: RenderSettings | null;
    /** Cut edges as fractions of the ray box. Omitted: the whole box. */
    cutFrac?: number[] | null;
    contrastLimits?: [number, number][] | null;
    /** The meshes' offscreen surfaces for this view (cell-mesh.ts). */
    cubeMeshTarget?: MeshTarget | null;
    modelMatrix?: Matrix4 | null;
    resolutionMatrix?: Matrix4 | null;
  };
  state: {
    model?: {
      setBindings(b: Record<string, unknown>): void;
      shaderInputs: { setProps(p: Record<string, unknown>): void };
    } | null;
    /** Format of the image texture last drawn. */
    boundImage?: ImageFormat | null;
    /** Set by Viv's XR3DLayer: `volume0` is the image texture it draws. */
    textures?: { volume0?: unknown } | null;
    paletteTexture?: Texture | null;
    channelPaletteTextures?: Texture[] | null;
    scaleMatrix?: Matrix4 | null;
  };
  context: { device: Device; viewport: { viewMatrix: number[]; projectionMatrix: number[] } };
  setState(patch: Record<string, unknown>): void;
};

/** Only the cube's XR3DLayer (image-volume.ts) draws; its VolumeLayer parent shares the extension. */
function isRaycaster(layer: LayerLike): boolean {
  return layer.constructor.layerName === "CubeXR3DLayer";
}

const NEAREST = {
  minFilter: "nearest",
  magFilter: "nearest",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge",
  addressModeW: "clamp-to-edge",
};

/** A one-deep, unfiltered RGBA8 3D texture (see the module's sampler note). */
function lookupTexture(layer: LayerLike, lut: ImagePalette): Texture {
  return layer.context.device.createTexture({
    dimension: "3d",
    width: lut.width,
    height: lut.height,
    depth: 1,
    format: "rgba8unorm",
    data: lut.data,
    mipmaps: false,
    sampler: NEAREST,
  });
}

type CubeRendering = typeof RENDERING_SINGLE | typeof RENDERING_MULTI;

class CubeExtensionBase extends ColorPalette3DExtensions.BaseExtension {
  rendering: CubeRendering;
  multichannel: boolean;

  constructor(rendering: CubeRendering, multichannel: boolean) {
    super();
    this.rendering = rendering;
    this.multichannel = multichannel;
  }

  updateState(update: { props: object; oldProps: object }) {
    const layer = this as unknown as LayerLike;
    const { props, oldProps } = update as { props: LayerLike["props"]; oldProps: LayerLike["props"] };
    if (!isRaycaster(layer)) return;
    const traitLimits =
      (props as { cubeTraitContrast?: [number, number][] }).cubeTraitContrast ?? props.contrastLimits;
    if (traitLimits?.length) setCubeTraitContrast(traitLimits as [number, number][]);
    const oldTrait =
      (oldProps as { cubeTraitContrast?: [number, number][] }).cubeTraitContrast ?? oldProps.contrastLimits;
    const traitKey = JSON.stringify(traitLimits ?? []);
    const oldTraitKey = JSON.stringify(oldTrait ?? []);
    if (traitKey !== oldTraitKey) {
      const layerInstance = this as unknown as { setNeedsUpdate?: () => void };
      layerInstance.setNeedsUpdate?.();
    }
    const palettes = props.channelPalettes?.length
      ? props.channelPalettes
      : [props.imagePalette ?? paletteLut(props.render?.palette ?? DEFAULT_RENDER.palette)];
    const oldPalettes = oldProps.channelPalettes?.length
      ? oldProps.channelPalettes
      : [oldProps.imagePalette ?? paletteLut(oldProps.render?.palette ?? DEFAULT_RENDER.palette)];
    if (!layer.state.paletteTexture || palettes[0] !== oldPalettes[0]) {
      layer.state.paletteTexture?.destroy();
      layer.setState({ paletteTexture: lookupTexture(layer, palettes[0]!) });
    }
    if (this.multichannel) {
      const prev = layer.state.channelPaletteTextures ?? [];
      const nextCount = Math.max(0, palettes.length - 1);
      if (nextCount !== prev.length || palettes.slice(1).some((p, i) => p !== oldPalettes[i + 1])) {
        prev.forEach((t) => t.destroy());
        const channelPaletteTextures = palettes.slice(1, 4).map((p) => lookupTexture(layer, p));
        layer.setState({ channelPaletteTextures });
      }
      const paletteCount = palettes.length;
      const oldPaletteCount = oldPalettes.length;
      if (paletteCount !== oldPaletteCount) {
        liveImageChannelCount = paletteCount;
        applyCubeRenderShaderUniforms(layer);
        const layerInstance = this as unknown as { setNeedsUpdate?: () => void };
        layerInstance.setNeedsUpdate?.();
      }
    }
  }

  draw() {
    const layer = this as unknown as LayerLike;
    if (!isRaycaster(layer)) return;
    const { model, paletteTexture, channelPaletteTextures } = layer.state;
    if (!model || !paletteTexture) return;
    const target = layer.props.cubeMeshTarget;
    const meshOn = Boolean(target?.drawn && target.front && target.back);
    if (target) target.drawn = false;
    const pad = paletteTexture;
    const p1 = channelPaletteTextures?.[0] ?? pad;
    const p2 = channelPaletteTextures?.[1] ?? pad;
    const p3 = channelPaletteTextures?.[2] ?? pad;
    model.setBindings({
      imagePalette: paletteTexture,
      imagePalette1: p1,
      imagePalette2: p2,
      imagePalette3: p3,
      meshFrontColor: meshOn ? target!.front!.color : paletteTexture,
      meshFrontDepth: meshOn ? target!.front!.depth : paletteTexture,
      meshBackColor: meshOn ? target!.back!.color : paletteTexture,
      meshBackDepth: meshOn ? target!.back!.depth : paletteTexture,
    });
    const image = imageTextureInfo(layer.state.textures?.volume0);
    const imageFormat = image?.format ?? null;
    if (imageFormat !== (layer.state.boundImage ?? null)) {
      layer.state.boundImage = imageFormat;
      layer.props.onImageBound?.(imageFormat);
    }
    applyCubeRenderShaderUniforms(layer);
  }

  finalizeState() {
    const layer = this as unknown as LayerLike;
    if (!isRaycaster(layer)) return;
    layer.state.paletteTexture?.destroy();
    layer.state.channelPaletteTextures?.forEach((t) => t.destroy());
  }
}

class CubeExtensionSingle extends CubeExtensionBase {
  static componentName = "CubeExtensionSingle";
  static extensionName = "CubeExtensionSingle";

  getVivShaderTemplates() {
    return { modules: [cubeRenderModuleSingle] };
  }
}

class CubeExtensionMulti extends CubeExtensionBase {
  static componentName = "CubeExtensionMulti";
  static extensionName = "CubeExtensionMulti";

  getVivShaderTemplates() {
    return { modules: [cubeRenderModuleMulti] };
  }
}

export const CUBE_EXTENSIONS: unknown[] = [new CubeExtensionSingle(RENDERING_SINGLE, false)];
export const CUBE_EXTENSIONS_MULTI: unknown[] = [new CubeExtensionMulti(RENDERING_MULTI, true)];

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function hexToLinear(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  // Viv converts the blended colour to sRGB at the end; stored linear, an
  // opaque cell comes out in exactly the Landmarks colour.
  return [
    Math.round(srgbToLinear((n >> 16) & 255) * 255),
    Math.round(srgbToLinear((n >> 8) & 255) * 255),
    Math.round(srgbToLinear(n & 255) * 255),
  ];
}

export type HighlightGroup = { name: string; color: string; labels: number[] };

/**
 * How the cube colours the shown window's cells.
 *
 * `instances` is the look with no category to colour by: every cell takes its
 * own hue from its id, so a whole segmentation reads at once. `groups`
 * is the look with a category or a focus: each group's cells in the category
 * colour, every other cell in the shared neutral.
 */
export type CellColoring =
  | { kind: "instances" }
  | { kind: "groups"; groups: readonly HighlightGroup[] }
  | { kind: "expression"; byLabel: ReadonlyMap<number, [number, number, number]> };

/**
 * The cells a group does not cover: achromatic on purpose. The orange this
 * used (#f97316) sits 3.6° from tab10's #ff7f0e, which `default_categorical_palette`
 * hands out second, so two categories were enough for "no category" to read as
 * one. Grey cannot collide with a hue.
 */
const OTHERS = { color: "#d4d4d4", behindGroups: 0.3 };

/**
 * Turns of hue between consecutive cell ids. Table rows run along the
 * mosaic, so cells next to each other in id are often next to each other in
 * space, and a step of the golden ratio's fractional part keeps the smallest
 * gap in any run of ids as wide as it can be.
 */
const HUE_STEP = 0.618033988749895;
/** Instance hues stay off full saturation, so a cell's colour survives the image behind it. */
const INSTANCE_SATURATION = 0.72;

/** Sector table of HSV -> RGB at full value, indexed by `floor(hue * 6)`. */
const HUE_SECTORS: ((lo: number, f: number) => [number, number, number])[] = [
  (lo, f) => [1, lo + (1 - lo) * f, lo],
  (lo, f) => [1 - (1 - lo) * f, 1, lo],
  (lo, f) => [lo, 1, lo + (1 - lo) * f],
  (lo, f) => [lo, 1 - (1 - lo) * f, 1],
  (lo, f) => [lo + (1 - lo) * f, lo, 1],
  (lo, f) => [1, lo, 1 - (1 - lo) * f],
];

/** A cell id's own colour, as linear RGB bytes (see `hexToLinear` for why linear). */
export function instanceColor(id: number): [number, number, number] {
  const sector = ((((id * HUE_STEP) % 1) + 1) % 1) * 6;
  const k = Math.min(5, Math.floor(sector));
  const rgb = HUE_SECTORS[k]!(1 - INSTANCE_SATURATION, sector - k);
  return rgb.map((c) => Math.round(srgbToLinear(Math.round(c * 255)) * 255)) as [number, number, number];
}

/**
 * Lookup texture for one window's cells (`cells[i]`: the global id of local
 * index i). Texel 0: the colour of cells the lookup gives none; texel i: cell
 * i's own colour, or clear when it has none (a later group wins).
 */
export function buildCellLut(coloring: CellColoring, cells: readonly number[]): CellLut {
  const n = Math.max(1, cells.length);
  const width = Math.min(CELL_LUT_WIDTH, n);
  const height = Math.ceil(n / width);
  const data = new Uint8Array(width * height * 4);
  const alpha = 255;
  if (coloring.kind === "instances") {
    // Texel 0 stays clear: every cell has a colour of its own.
    for (let i = 1; i < cells.length; i++) data.set([...instanceColor(cells[i]!), alpha], i * 4);
    return { data, width, height };
  }
  if (coloring.kind === "expression") {
    const others = hexToLinear(OTHERS.color)!;
    data.set([...others, Math.round(255 * OTHERS.behindGroups)], 0);
    for (let i = 1; i < cells.length; i++) {
      const rgb = coloring.byLabel.get(cells[i]!);
      if (rgb) data.set([rgb[0], rgb[1], rgb[2], alpha], i * 4);
    }
    return { data, width, height };
  }
  const { groups } = coloring;
  const others = hexToLinear(OTHERS.color)!;
  data.set([...others, groups.length ? Math.round(255 * OTHERS.behindGroups) : 255], 0);
  const colour = new Map<number, [number, number, number]>();
  for (const g of groups) {
    const rgb = hexToLinear(g.color);
    if (!rgb) continue;
    for (const id of g.labels) if (id > 0) colour.set(id, rgb);
  }
  for (let i = 1; i < cells.length; i++) {
    const rgb = colour.get(cells[i]!);
    if (rgb) data.set([rgb[0], rgb[1], rgb[2], alpha], i * 4);
  }
  return { data, width, height };
}
