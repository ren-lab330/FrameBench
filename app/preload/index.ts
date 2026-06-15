import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentCaptureOptions,
  FrameBenchApi,
  FrameBenchLabel,
  ProjectConfig,
  ProjectState,
  SaveBurstRequest,
  SaveCaptureRequest
} from "../../shared/types.js";

const api: FrameBenchApi = {
  chooseProject: () => ipcRenderer.invoke("project:choose") as Promise<ProjectState | null>,
  getProject: () => ipcRenderer.invoke("project:get") as Promise<ProjectState | null>,
  loadProjectConfig: () => ipcRenderer.invoke("project:config:get") as Promise<ProjectConfig | null>,
  updateProjectConfig: (patch: Partial<Pick<ProjectConfig, "lastCameraId" | "labelLockEnabled">>) =>
    ipcRenderer.invoke("project:config:update", patch) as Promise<ProjectConfig | null>,
  saveLabels: (labels: FrameBenchLabel[]) => ipcRenderer.invoke("labels:save", labels) as Promise<void>,
  loadLabels: () => ipcRenderer.invoke("labels:load") as Promise<FrameBenchLabel[]>,
  saveCapture: (request: SaveCaptureRequest) => ipcRenderer.invoke("captures:save", request),
  saveBurst: (request: SaveBurstRequest) => ipcRenderer.invoke("bursts:save", request),
  listCaptures: () => ipcRenderer.invoke("captures:list"),
  saveCaptureNotes: (captureId: string, notes: string) => ipcRenderer.invoke("captures:notes:save", captureId, notes),
  renameCapture: (captureId: string, title: string) => ipcRenderer.invoke("captures:rename", captureId, title),
  getNativeCameraControls: (cameraName: string | null) => ipcRenderer.invoke("camera-controls:get", cameraName),
  setNativeCameraControl: (deviceIndex: number, controlId: string, value: number | boolean) =>
    ipcRenderer.invoke("camera-controls:set", deviceIndex, controlId, value),
  onAgentCaptureRequest: (callback: (requestId: string, options: AgentCaptureOptions) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, requestId: string, options: AgentCaptureOptions) => callback(requestId, options);
    ipcRenderer.on("agent:capture-request", listener);
    return () => ipcRenderer.removeListener("agent:capture-request", listener);
  },
  completeAgentCaptureRequest: (requestId: string, result: SaveCaptureRequest | { error: string }) => {
    ipcRenderer.send("agent:capture-result", requestId, result);
  },
  onCapturesChanged: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("captures:changed", listener);
    return () => ipcRenderer.removeListener("captures:changed", listener);
  }
};

contextBridge.exposeInMainWorld("framebench", api);
