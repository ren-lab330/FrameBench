import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  BurstLabelSummary,
  BurstSampleSummary,
  BurstSummary,
  CaptureSummary,
  HistoryItem,
  ImageStats,
  SaveCaptureRequest
} from "../../shared/types.js";
import { summarizeBurst } from "../../shared/stats.js";
import { getFrameBenchPath } from "./project.js";

interface CaptureJson {
  schemaVersion: 1;
  kind?: "capture";
  id: string;
  title: string;
  createdAt: string;
  source: "human" | "agent";
  camera: SaveCaptureRequest["camera"];
  fullImage: "full.jpg";
  labels: Array<{
    id: string;
    name: string;
    crop: string;
    stats?: ImageStats;
  }>;
  stats?: {
    full?: ImageStats;
    crops: Record<string, ImageStats>;
  };
  tags: string[];
}

interface BurstJson {
  schemaVersion: 1;
  kind: "burst";
  id: string;
  title: string;
  createdAt: string;
  source: "human" | "agent";
  count: number;
  intervalMs: number;
  durationMs: number;
  labels: string[];
  samples: BurstSampleSummary[];
  summary: Record<string, BurstLabelSummary>;
  tags: string[];
  errors: Array<{ index: number; error: string }>;
}

export async function saveCapture(request: SaveCaptureRequest): Promise<CaptureSummary> {
  const framebenchPath = getFrameBenchPath();
  if (!framebenchPath) throw new Error("No project selected");

  const iso = new Date().toISOString();
  const dateFolder = iso.slice(0, 10);
  const id = `${safeTimestamp(iso)}_${slugify(request.title || "capture")}`;
  const captureFolder = join(framebenchPath, "captures", dateFolder, id);
  return writeCaptureFolder(captureFolder, id, iso, request);
}

export async function saveBurst(
  title: string,
  source: "agent" | "human",
  intervalMs: number,
  labels: string[],
  requests: SaveCaptureRequest[],
  errors: Array<{ index: number; error: string }>,
  tags: string[] = []
): Promise<BurstSummary> {
  const framebenchPath = getFrameBenchPath();
  if (!framebenchPath) throw new Error("No project selected");

  const iso = requests[0]?.capturedAt ?? new Date().toISOString();
  const dateFolder = iso.slice(0, 10);
  const id = `${safeTimestamp(iso)}_${slugify(title || "burst")}-burst`;
  const burstFolder = join(framebenchPath, "captures", dateFolder, id);
  const samplesFolder = join(burstFolder, "samples");
  const started = Date.now();
  await mkdir(samplesFolder, { recursive: true });

  const samples: BurstSampleSummary[] = [];
  for (let index = 0; index < requests.length; index += 1) {
    const sampleNumber = index + 1;
    const sampleId = `${id}_sample-${String(sampleNumber).padStart(3, "0")}`;
    const sampleFolder = join(samplesFolder, `sample-${String(sampleNumber).padStart(3, "0")}`);
    const sample = await writeCaptureFolder(sampleFolder, sampleId, requests[index].capturedAt ?? new Date().toISOString(), {
      ...requests[index],
      title: `${title || "Burst"} sample ${String(sampleNumber).padStart(2, "0")}`,
      source,
      tags
    });
    samples.push({
      index: sampleNumber,
      captureId: sample.id,
      createdAt: sample.createdAt,
      elapsedMs: requests[index].elapsedMs ?? Date.now() - started,
      folder: sample.folder,
      fullImage: sample.fullImage,
      crops: sample.crops,
      stats: sample.stats
    });
  }

  const labelIds = labels.length ? labels : Array.from(new Set(samples.flatMap((sample) => Object.keys(sample.crops))));
  const summary = summarizeBurst(labelIds, samples);
  const metadata: BurstJson = {
    schemaVersion: 1,
    kind: "burst",
    id,
    title: title || "Burst",
    createdAt: iso,
    source,
    count: requests.length,
    intervalMs,
    durationMs: Math.max(...samples.map((sample) => sample.elapsedMs), Date.now() - started),
    labels: labelIds,
    samples,
    summary,
    tags,
    errors
  };

  await writeFile(join(burstFolder, "burst.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  await writeFile(join(burstFolder, "notes.md"), "", "utf8");

  return {
    kind: "burst",
    id,
    title: metadata.title,
    createdAt: iso,
    folder: burstFolder,
    count: metadata.count,
    intervalMs,
    durationMs: metadata.durationMs,
    labels: labelIds,
    samples,
    summary,
    notes: "",
    tags,
    errors
  };
}

async function writeCaptureFolder(captureFolder: string, id: string, iso: string, request: SaveCaptureRequest): Promise<CaptureSummary> {
  const cropsFolder = join(captureFolder, "crops");
  await mkdir(cropsFolder, { recursive: true });
  await writeDataUrl(join(captureFolder, "full.jpg"), request.fullImage);

  const cropMap: Record<string, string> = {};
  for (const crop of request.crops) {
    const safeName = `${slugify(crop.name)}.jpg`;
    const relativePath = `crops/${safeName}`;
    await writeDataUrl(join(captureFolder, relativePath), crop.dataUrl);
    cropMap[crop.name] = relativePath;
  }

  const metadata: CaptureJson = {
    schemaVersion: 1,
    kind: "capture",
    id,
    title: request.title || "Capture",
    createdAt: iso,
    source: request.source,
    camera: request.camera,
    fullImage: "full.jpg",
    labels: request.labels.map((label) => ({
      id: label.id,
      name: label.name,
      crop: cropMap[label.id] ?? `crops/${label.id}.jpg`,
      stats: request.crops.find((crop) => crop.name === label.id)?.stats
    })),
    stats: {
      full: request.fullStats,
      crops: Object.fromEntries(request.crops.filter((crop) => crop.stats).map((crop) => [crop.name, crop.stats as ImageStats]))
    },
    tags: request.tags ?? []
  };

  await writeFile(join(captureFolder, "capture.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  await writeFile(join(captureFolder, "notes.md"), "", "utf8");

  return {
    kind: "capture",
    id,
    title: metadata.title,
    createdAt: iso,
    folder: captureFolder,
    fullImage: join(captureFolder, "full.jpg"),
    crops: Object.fromEntries(Object.entries(cropMap).map(([key, value]) => [key, join(captureFolder, value)])),
    notes: "",
    stats: metadata.stats
  };
}

export async function listCaptures(): Promise<HistoryItem[]> {
  const framebenchPath = getFrameBenchPath();
  if (!framebenchPath) return [];

  const capturesPath = join(framebenchPath, "captures");
  const summaries: HistoryItem[] = [];

  for (const dateFolder of await safeReadDir(capturesPath)) {
    for (const captureId of await safeReadDir(join(capturesPath, dateFolder))) {
      const folder = join(capturesPath, dateFolder, captureId);
      try {
        const burstRaw = await safeReadFile(join(folder, "burst.json"));
        if (burstRaw) {
          const metadata = JSON.parse(burstRaw) as Partial<BurstJson>;
          const samples = Array.isArray(metadata.samples) ? metadata.samples : [];
          const labels = Array.isArray(metadata.labels) ? metadata.labels : Array.from(new Set(samples.flatMap((sample) => Object.keys(sample.crops ?? {}))));
          const summary = metadata.summary ?? summarizeBurst(labels, samples);
          summaries.push({
            kind: "burst",
            id: metadata.id ?? captureId,
            title: metadata.title ?? "Burst",
            createdAt: metadata.createdAt ?? createdAtFromId(captureId),
            folder,
            count: typeof metadata.count === "number" ? metadata.count : samples.length,
            intervalMs: typeof metadata.intervalMs === "number" ? metadata.intervalMs : 0,
            durationMs: typeof metadata.durationMs === "number" ? metadata.durationMs : maxElapsedMs(samples),
            labels,
            samples,
            summary,
            notes: await safeReadFile(join(folder, "notes.md")),
            tags: metadata.tags ?? [],
            errors: metadata.errors ?? []
          });
          continue;
        }
        const metadata = JSON.parse(await readFile(join(folder, "capture.json"), "utf8")) as Partial<CaptureJson>;
        const labels = Array.isArray(metadata.labels) ? metadata.labels : [];
        const fullImage = metadata.fullImage ?? "full.jpg";
        summaries.push({
          kind: "capture",
          id: metadata.id ?? captureId,
          title: metadata.title ?? metadata.id ?? "Capture",
          createdAt: metadata.createdAt ?? createdAtFromId(captureId),
          folder,
          fullImage: join(folder, fullImage),
          crops: Object.fromEntries(labels.filter((label) => label.id && label.crop).map((label) => [label.id, join(folder, label.crop)])),
          notes: await safeReadFile(join(folder, "notes.md")),
          stats: metadata.stats ?? {
            full: undefined,
            crops: Object.fromEntries(labels.filter((label) => label.id && label.stats).map((label) => [label.id, label.stats as ImageStats]))
          }
        });
      } catch {
        // Ignore incomplete capture folders.
      }
    }
  }

  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40);
}

export async function getCapture(captureId: string): Promise<CaptureSummary | null> {
  return findCapture(captureId);
}

export async function getBurst(burstId: string): Promise<BurstSummary | null> {
  const items = await listCaptures();
  return (items.find((item) => item.kind === "burst" && item.id === burstId) as BurstSummary | undefined) ?? null;
}

export async function saveCaptureNotes(captureId: string, notes: string): Promise<CaptureSummary> {
  const capture = await findCapture(captureId);
  if (!capture) throw new Error("Capture not found");
  await writeFile(join(capture.folder, "notes.md"), notes, "utf8");
  return { ...capture, notes };
}

export async function saveBurstNotes(burstId: string, notes: string): Promise<BurstSummary> {
  const burst = await getBurst(burstId);
  if (!burst) throw new Error("Burst not found");
  await writeFile(join(burst.folder, "notes.md"), notes, "utf8");
  return { ...burst, notes };
}

export async function renameCapture(captureId: string, title: string): Promise<CaptureSummary> {
  const capture = await findCapture(captureId);
  if (!capture) throw new Error("Capture not found");
  const metadataPath = join(capture.folder, "capture.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as CaptureJson;
  metadata.title = title.trim() || "Capture";
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return { ...capture, title: metadata.title };
}

async function findCapture(captureId: string): Promise<CaptureSummary | null> {
  const captures = await listCaptures();
  return (captures.find((capture) => capture.kind === "capture" && capture.id === captureId) as CaptureSummary | undefined) ?? null;
}

function maxElapsedMs(samples: BurstSampleSummary[]): number {
  return Math.max(0, ...samples.map((sample) => sample.elapsedMs ?? 0));
}

function createdAtFromId(id: string): string {
  const possibleIso = id.slice(0, 24).replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
  const date = new Date(possibleIso);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

async function writeDataUrl(path: string, dataUrl: string): Promise<void> {
  const base64 = dataUrl.replace(/^data:image\/jpe?g;base64,/, "");
  await writeFile(path, Buffer.from(base64, "base64"));
}

async function safeReadDir(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

async function safeReadFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function safeTimestamp(value: string): string {
  return value.replace(/:/g, "-");
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "capture";
}
