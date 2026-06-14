import type { BurstLabelSummary, BurstSampleSummary, ImageStats, StatRange } from "./types.js";

export function summarizeBurst(labelIds: string[], samples: BurstSampleSummary[]): Record<string, BurstLabelSummary> {
  return Object.fromEntries(
    labelIds
      .map((labelId) => {
        const stats = samples.map((sample) => sample.stats?.crops[labelId]).filter(Boolean) as ImageStats[];
        if (!stats.length) return null;
        const meanBrightness = range(stats.map((stat) => stat.meanBrightness));
        const saturatedPixelRatio = range(stats.map((stat) => stat.saturatedPixelRatio));
        const contrast = range(stats.map((stat) => stat.contrast));
        const r = range(stats.map((stat) => stat.meanColor.r));
        const g = range(stats.map((stat) => stat.meanColor.g));
        const b = range(stats.map((stat) => stat.meanColor.b));
        const summary: BurstLabelSummary = {
          labelId,
          meanBrightness,
          saturatedPixelRatio,
          contrast,
          meanColor: { r, g, b },
          likelyChanged:
            Math.abs(meanBrightness.delta) >= 12 ||
            Math.abs(saturatedPixelRatio.delta) >= 0.02 ||
            Math.abs(r.delta) + Math.abs(g.delta) + Math.abs(b.delta) >= 30
        };
        return [labelId, summary] as const;
      })
      .filter(Boolean) as Array<readonly [string, BurstLabelSummary]>
  );
}

function range(values: number[]): StatRange {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min: round(min), max: round(max), delta: round(max - min) };
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
