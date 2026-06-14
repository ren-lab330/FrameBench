import type { FrameBenchLabel } from "./types.js";

export function normalizeId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function uniqueLabelId(value: string, labels: FrameBenchLabel[], currentId: string) {
  if (!value) return "";
  const existing = new Set(labels.filter((label) => label.id !== currentId).map((label) => label.id));
  if (!existing.has(value)) return value;
  let index = 2;
  let next = `${value}_${index}`;
  while (existing.has(next)) {
    index += 1;
    next = `${value}_${index}`;
  }
  return next;
}

export function nextLabelId(labels: FrameBenchLabel[]) {
  let index = labels.length + 1;
  let id = `label_${index}`;
  const ids = new Set(labels.map((label) => label.id));
  while (ids.has(id)) {
    index += 1;
    id = `label_${index}`;
  }
  return id;
}

export function titleFromId(id: string) {
  return id.replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
