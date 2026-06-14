import { app, dialog } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { FrameBenchLabel, ProjectConfig, ProjectState } from "../../shared/types.js";

const APP_REVISION = "0.1.0-dev";

interface LabelsFile {
  schemaVersion: 1;
  labels: FrameBenchLabel[];
}

let currentProjectPath: string | null = null;
let agentApiUrl: string | null = null;

export function setAgentApiUrl(url: string): void {
  agentApiUrl = url;
}

export function getFrameBenchPath(projectPath = currentProjectPath): string | null {
  return projectPath ? join(projectPath, ".framebench") : null;
}

export function getCurrentProjectState(): ProjectState | null {
  if (!currentProjectPath) return null;
  return {
    projectPath: currentProjectPath,
    projectName: basename(currentProjectPath),
    appRevision: APP_REVISION,
    agentApiUrl
  };
}

export async function chooseProject(): Promise<ProjectState | null> {
  const result = await dialog.showOpenDialog({
    title: "Choose FrameBench Project Folder",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || !result.filePaths[0]) return null;
  currentProjectPath = result.filePaths[0];
  await initializeProject(currentProjectPath);
  return getCurrentProjectState();
}

export async function initializeProject(projectPath: string): Promise<void> {
  const framebenchPath = join(projectPath, ".framebench");
  await mkdir(join(framebenchPath, "captures"), { recursive: true });

  const now = new Date().toISOString();
  const configPath = join(framebenchPath, "framebench.json");
  const labelsPath = join(framebenchPath, "labels.json");
  const readmePath = join(framebenchPath, "agent-readme.md");

  await writeJsonIfMissing<ProjectConfig>(configPath, {
    schemaVersion: 1,
    appName: "FrameBench",
    lastCameraId: null,
    labelLockEnabled: false,
    createdAt: now,
    updatedAt: now
  });

  await writeJsonIfMissing<LabelsFile>(labelsPath, {
    schemaVersion: 1,
    labels: []
  });

  await writeFile(
    readmePath,
    `# FrameBench Agent Instructions

This project uses FrameBench for visual hardware inspection.

FrameBench stores captures in:

\`.framebench/captures/\`

Labels are defined in:

\`.framebench/labels.json\`

When you need to inspect hardware state, request a new capture through the FrameBench local API or CLI. After capture, inspect the relevant crop first.

Default local API:

\`http://127.0.0.1:47611\`

Recommended CLI:

\`framebench\`

If \`framebench\` is not installed on PATH, use the project FrameBench wrapper or the absolute wrapper path provided by the user.

Useful HTTP examples:

\`\`\`bash
curl http://127.0.0.1:47611/api/status
curl http://127.0.0.1:47611/api/labels
curl -X POST http://127.0.0.1:47611/api/captures \\
  -H "Content-Type: application/json" \\
  -d '{"title":"status LED after firmware upload","tags":["agent"]}'
\`\`\`

Useful CLI examples:

\`\`\`bash
framebench status --json
framebench labels --json
framebench capture --title "status LED after firmware upload" --tag agent --json
framebench burst --title "fade or movement check" --label <label-id> --count 12 --interval 150 --json
framebench stats <capture-id> <label-id> --json
framebench compare <before-capture-id> <after-capture-id> <label-id> --json
framebench note <capture-id> "Status LED appears brighter than baseline."
\`\`\`

Prefer cropped label images when checking small visual details. Use \`full.jpg\` only for context.

Important: crops can be noisy, tight, overexposed, or visually ambiguous. Do not overstate certainty from a crop. If absolute state classification is unclear, compare brightness, saturation, contrast, mean color, and changes between captures. A useful conclusion can be "the labeled area became brighter" or "the visual evidence is ambiguous, but the brightness trend changed."

Use burst captures when time variation matters, such as blinking, fading, animation, display transitions, physical movement, or unstable/transient visual states. Burst captures create many files quickly, so do not overuse them for static checks where a single capture is enough. Burst timing is best-effort visual sampling, not precise electrical timing.

After inspecting, write a short note in the capture's \`notes.md\` if your conclusion matters for the task.
`,
    "utf8"
  );
}

export async function loadLabels(): Promise<FrameBenchLabel[]> {
  const framebenchPath = getFrameBenchPath();
  if (!framebenchPath) return [];
  const raw = await readFile(join(framebenchPath, "labels.json"), "utf8");
  const data = JSON.parse(raw) as LabelsFile;
  return Array.isArray(data.labels) ? data.labels : [];
}

export async function loadProjectConfig(): Promise<ProjectConfig | null> {
  const framebenchPath = getFrameBenchPath();
  if (!framebenchPath) return null;

  const configPath = join(framebenchPath, "framebench.json");
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<ProjectConfig>;
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    appName: "FrameBench",
    lastCameraId: typeof parsed.lastCameraId === "string" ? parsed.lastCameraId : null,
    labelLockEnabled: typeof parsed.labelLockEnabled === "boolean" ? parsed.labelLockEnabled : false,
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : now,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : now
  };
}

export async function updateProjectConfig(
  patch: Partial<Pick<ProjectConfig, "lastCameraId" | "labelLockEnabled">>
): Promise<ProjectConfig | null> {
  const framebenchPath = getFrameBenchPath();
  if (!framebenchPath) return null;

  const current = (await loadProjectConfig()) ?? {
    schemaVersion: 1,
    appName: "FrameBench",
    lastCameraId: null,
    labelLockEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const next: ProjectConfig = {
    ...current,
    lastCameraId: patch.lastCameraId !== undefined ? patch.lastCameraId : current.lastCameraId,
    labelLockEnabled: patch.labelLockEnabled !== undefined ? patch.labelLockEnabled : current.labelLockEnabled,
    updatedAt: new Date().toISOString()
  };
  await writeFile(join(framebenchPath, "framebench.json"), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function saveLabels(labels: FrameBenchLabel[]): Promise<void> {
  const framebenchPath = getFrameBenchPath();
  if (!framebenchPath) return;
  const data: LabelsFile = { schemaVersion: 1, labels };
  await writeFile(join(framebenchPath, "labels.json"), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeJsonIfMissing<T>(path: string, value: T): Promise<void> {
  try {
    await readFile(path, "utf8");
  } catch {
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
}

export function getUserDataPath(): string {
  return app.getPath("userData");
}
