import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { nextLabelId, normalizeId, titleFromId, uniqueLabelId } from "../dist/main/shared/labels.js";
import { summarizeBurst } from "../dist/main/shared/stats.js";

const execFileAsync = promisify(execFile);

testBurstSummary();
testLabelHelpers();
await testCliHelp();

console.log("FrameBench tests passed");

function testBurstSummary() {
  const samples = [
    sample("sample-1", 100, 0.01, 35, { r: 50, g: 55, b: 60 }),
    sample("sample-2", 127.25, 0.04, 41, { r: 76, g: 62, b: 66 }),
    sample("sample-3", 111.5, 0.02, 38, { r: 61, g: 58, b: 63 })
  ];

  const summary = summarizeBurst(["status-led"], samples);
  assert.equal(summary["status-led"].labelId, "status-led");
  assert.equal(summary["status-led"].meanBrightness.min, 100);
  assert.equal(summary["status-led"].meanBrightness.max, 127.25);
  assert.equal(summary["status-led"].meanBrightness.delta, 27.25);
  assert.equal(summary["status-led"].likelyChanged, true);
}

function testLabelHelpers() {
  const labels = [
    label("label_1"),
    label("status_led"),
    label("status_led_2")
  ];

  assert.equal(normalizeId(" Status LED #1 "), "status_led_1");
  assert.equal(uniqueLabelId("status_led", labels, "label_1"), "status_led_3");
  assert.equal(uniqueLabelId("status_led", labels, "status_led"), "status_led");
  assert.equal(nextLabelId(labels), "label_4");
  assert.equal(titleFromId("rgb-strip_left"), "Rgb Strip Left");
}

async function testCliHelp() {
  const { stderr, stdout } = await execFileAsync(process.execPath, ["cli/framebench.mjs", "burst", "--help"]);
  const output = `${stdout}\n${stderr}`;
  assert.match(output, /framebench burst --title/);
  assert.match(output, /--interval <ms>/);
  assert.doesNotMatch(output, /burstId:/);
}

function label(id) {
  return {
    id,
    name: id,
    shape: "rect",
    x: 0,
    y: 0,
    width: 0.1,
    height: 0.1,
    color: "#f2c14e",
    description: ""
  };
}

function sample(id, meanBrightness, saturatedPixelRatio, contrast, meanColor) {
  return {
    index: 1,
    captureId: id,
    createdAt: "2026-06-14T00:00:00.000Z",
    elapsedMs: 0,
    folder: "",
    fullImage: "",
    crops: { "status-led": "" },
    stats: {
      crops: {
        "status-led": {
          width: 10,
          height: 10,
          meanBrightness,
          minBrightness: meanBrightness - 5,
          maxBrightness: meanBrightness + 5,
          contrast,
          saturatedPixelRatio,
          meanColor
        }
      }
    }
  };
}
