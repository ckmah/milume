import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_RENDER } from "./palettes.ts";
import { channelDisplayColor, parseChannelHex } from "./tint-palette.ts";
import { cubeImageChannels } from "./image-channels.ts";

describe("DEFAULT_RENDER", () => {
  it("defaults segmentation mesh peak opacity to 0.6", () => {
    assert.equal(DEFAULT_RENDER.cellAlpha, 0.6);
  });
});

describe("channelDisplayColor", () => {
  it("keeps a valid hex and ignores anything else", () => {
    assert.equal(parseChannelHex("  #FF3B3B "), "#ff3b3b");
    assert.equal(parseChannelHex("#fff"), null);
    assert.equal(parseChannelHex("red"), null);
  });

  it("uses the picked hex, white for a lone unset channel, and the index tint otherwise", () => {
    assert.equal(channelDisplayColor("#00d5ff", 2, true), "#00d5ff");
    assert.equal(channelDisplayColor(undefined, 0, true), "#ffffff");
    assert.equal(channelDisplayColor("nope", 1, false), "#ff8844");
  });

  it("feeds the picked hex to the cube and leaves the other channel on its default", () => {
    const channels = cubeImageChannels(
      [
        { name: "Channel 0", visible: true, contrast_limits: [0, 48], color: "#ff3b3b" },
        { name: "PanCK", visible: true, contrast_limits: [0, 48] },
      ],
      null,
      [0, 48],
    );
    assert.equal(channels[0]?.tint, "#ff3b3b");
    assert.equal(channels[1]?.tint, "#ff8844");
  });
});
