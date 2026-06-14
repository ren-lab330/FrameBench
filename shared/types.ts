export type LabelShape = "rect";

export interface FrameBenchLabel {
  id: string;
  name: string;
  shape: LabelShape;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  description: string;
}

export interface ProjectState {
  projectPath: string;
  projectName: string;
  appRevision: string;
  agentApiUrl: string | null;
}

export interface ProjectConfig {
  schemaVersion: 1;
  appName: "FrameBench";
  lastCameraId: string | null;
  labelLockEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CaptureImage {
  name: string;
  dataUrl: string;
  stats?: ImageStats;
}

export interface ImageStats {
  width: number;
  height: number;
  meanBrightness: number;
  minBrightness: number;
  maxBrightness: number;
  contrast: number;
  saturatedPixelRatio: number;
  meanColor: {
    r: number;
    g: number;
    b: number;
  };
}

export interface SaveCaptureRequest {
  title: string;
  source: "human" | "agent";
  capturedAt?: string;
  elapsedMs?: number;
  camera: {
    name: string;
    width: number;
    height: number;
  };
  fullImage: string;
  fullStats?: ImageStats;
  labels: FrameBenchLabel[];
  crops: CaptureImage[];
  tags?: string[];
}

export interface AgentCaptureOptions {
  title?: string;
  tags?: string[];
}

export interface AgentBurstOptions extends AgentCaptureOptions {
  labels?: string[];
  count?: number;
  intervalMs?: number;
}

export interface SaveBurstRequest {
  title: string;
  source: "human" | "agent";
  intervalMs: number;
  labels: string[];
  requests: SaveCaptureRequest[];
  errors?: Array<{ index: number; error: string }>;
  tags?: string[];
}

export interface CaptureSummary {
  kind: "capture";
  id: string;
  title: string;
  createdAt: string;
  folder: string;
  fullImage: string;
  crops: Record<string, string>;
  notes: string;
  stats?: {
    full?: ImageStats;
    crops: Record<string, ImageStats>;
  };
}

export interface BurstSampleSummary {
  index: number;
  captureId: string;
  createdAt: string;
  elapsedMs: number;
  folder: string;
  fullImage: string;
  crops: Record<string, string>;
  stats?: CaptureSummary["stats"];
}

export interface StatRange {
  min: number;
  max: number;
  delta: number;
}

export interface BurstLabelSummary {
  labelId: string;
  meanBrightness: StatRange;
  saturatedPixelRatio: StatRange;
  contrast: StatRange;
  meanColor: {
    r: StatRange;
    g: StatRange;
    b: StatRange;
  };
  likelyChanged: boolean;
}

export interface BurstSummary {
  kind: "burst";
  id: string;
  title: string;
  createdAt: string;
  folder: string;
  count: number;
  intervalMs: number;
  durationMs: number;
  labels: string[];
  samples: BurstSampleSummary[];
  summary: Record<string, BurstLabelSummary>;
  notes: string;
  tags: string[];
  errors: Array<{ index: number; error: string }>;
}

export type HistoryItem = CaptureSummary | BurstSummary;

export interface FrameBenchApi {
  chooseProject: () => Promise<ProjectState | null>;
  getProject: () => Promise<ProjectState | null>;
  loadProjectConfig: () => Promise<ProjectConfig | null>;
  updateProjectConfig: (patch: Partial<Pick<ProjectConfig, "lastCameraId" | "labelLockEnabled">>) => Promise<ProjectConfig | null>;
  saveLabels: (labels: FrameBenchLabel[]) => Promise<void>;
  loadLabels: () => Promise<FrameBenchLabel[]>;
  saveCapture: (request: SaveCaptureRequest) => Promise<CaptureSummary>;
  saveBurst: (request: SaveBurstRequest) => Promise<BurstSummary>;
  listCaptures: () => Promise<HistoryItem[]>;
  saveCaptureNotes: (captureId: string, notes: string) => Promise<CaptureSummary>;
  renameCapture: (captureId: string, title: string) => Promise<CaptureSummary>;
  onAgentCaptureRequest: (callback: (requestId: string, options: AgentCaptureOptions) => void) => () => void;
  completeAgentCaptureRequest: (requestId: string, result: SaveCaptureRequest | { error: string }) => void;
  onCapturesChanged: (callback: () => void) => () => void;
}
