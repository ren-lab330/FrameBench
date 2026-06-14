import type { FrameBenchLabel, ImageStats } from "../../../../shared/types";

export type ResizeCorner = "nw" | "ne" | "sw" | "se";

export function clamp(value: number, min = 0, max = 1) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampInteger(value: number, min: number, max: number) {
  const normalized = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, normalized));
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function resizeLabel(label: FrameBenchLabel, corner: ResizeCorner, point: { x: number; y: number }): FrameBenchLabel {
  const left = label.x;
  const right = label.x + label.width;
  const top = label.y;
  const bottom = label.y + label.height;
  const minSize = 0.01;

  const nextLeft = corner.includes("w") ? Math.min(point.x, right - minSize) : left;
  const nextRight = corner.includes("e") ? Math.max(point.x, left + minSize) : right;
  const nextTop = corner.includes("n") ? Math.min(point.y, bottom - minSize) : top;
  const nextBottom = corner.includes("s") ? Math.max(point.y, top + minSize) : bottom;

  return {
    ...label,
    x: clamp(nextLeft),
    y: clamp(nextTop),
    width: clamp(nextRight - nextLeft, minSize, 1 - nextLeft),
    height: clamp(nextBottom - nextTop, minSize, 1 - nextTop)
  };
}

export function cropVideoToDataUrl(video: HTMLVideoElement, label: FrameBenchLabel, width: number, height: number, quality: number) {
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = Math.max(1, Math.round(label.width * width));
  cropCanvas.height = Math.max(1, Math.round(label.height * height));
  const cropContext = cropCanvas.getContext("2d");
  cropContext?.drawImage(
    video,
    Math.round(label.x * width),
    Math.round(label.y * height),
    cropCanvas.width,
    cropCanvas.height,
    0,
    0,
    cropCanvas.width,
    cropCanvas.height
  );
  return cropCanvas.toDataURL("image/jpeg", quality);
}

export function imageStatsFromCanvas(canvas: HTMLCanvasElement): ImageStats {
  const context = canvas.getContext("2d");
  if (!context || !canvas.width || !canvas.height) {
    return {
      width: canvas.width,
      height: canvas.height,
      meanBrightness: 0,
      minBrightness: 0,
      maxBrightness: 0,
      contrast: 0,
      saturatedPixelRatio: 0,
      meanColor: { r: 0, g: 0, b: 0 }
    };
  }

  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixels = data.length / 4;
  let brightnessSum = 0;
  let brightnessSquaredSum = 0;
  let minBrightness = 255;
  let maxBrightness = 0;
  let saturatedPixels = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    brightnessSum += brightness;
    brightnessSquaredSum += brightness * brightness;
    minBrightness = Math.min(minBrightness, brightness);
    maxBrightness = Math.max(maxBrightness, brightness);
    if (r >= 250 || g >= 250 || b >= 250) saturatedPixels += 1;
    rSum += r;
    gSum += g;
    bSum += b;
  }

  const meanBrightness = brightnessSum / pixels;
  const variance = brightnessSquaredSum / pixels - meanBrightness * meanBrightness;

  return {
    width: canvas.width,
    height: canvas.height,
    meanBrightness: roundStat(meanBrightness),
    minBrightness: roundStat(minBrightness),
    maxBrightness: roundStat(maxBrightness),
    contrast: roundStat(Math.sqrt(Math.max(0, variance))),
    saturatedPixelRatio: roundStat(saturatedPixels / pixels, 4),
    meanColor: {
      r: roundStat(rSum / pixels),
      g: roundStat(gSum / pixels),
      b: roundStat(bSum / pixels)
    }
  };
}

export function toFileUrl(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const prefixed = /^[a-zA-Z]:\//.test(normalized) ? `/${normalized}` : normalized;
  return `file://${prefixed.split("/").map(encodeURIComponent).join("/")}`;
}

function roundStat(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
