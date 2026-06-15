import { app, BrowserWindow, ipcMain, systemPreferences } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { setCaptureRequester, setCapturesChangedNotifier, startAgentServer } from "./agentServer.js";
import { getNativeCameraControls, setNativeCameraControl } from "./cameraControls.js";
import { listCaptures, renameCapture, saveBurst, saveCapture, saveCaptureNotes } from "./captures.js";
import { chooseProject, getCurrentProjectState, loadLabels, loadProjectConfig, saveLabels, updateProjectConfig } from "./project.js";
import type { AgentCaptureOptions, SaveBurstRequest, SaveCaptureRequest } from "../../shared/types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;
let mainWindow: BrowserWindow | null = null;
const pendingCaptures = new Map<
  string,
  {
    resolve: (request: SaveCaptureRequest) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }
>();

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: "FrameBench",
    icon: resolveWindowIcon(),
    backgroundColor: "#0d1014",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (process.platform === "darwin") {
    await systemPreferences.askForMediaAccess("camera");
  }

  if (isDev) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(join(__dirname, "../../../renderer/index.html"));
  }
}

function resolveWindowIcon(): string | undefined {
  const paths = [
    join(__dirname, "../../../../build/icon.png"),
    join(process.resourcesPath, "build/icon.png")
  ];
  return paths.find((path) => existsSync(path));
}

app.whenReady().then(async () => {
  setCaptureRequester(requestRendererCapture);
  setCapturesChangedNotifier(notifyCapturesChanged);
  await startAgentServer();
  ipcMain.handle("project:choose", chooseProject);
  ipcMain.handle("project:get", () => getCurrentProjectState());
  ipcMain.handle("project:config:get", loadProjectConfig);
  ipcMain.handle("project:config:update", (_event, patch) => updateProjectConfig(patch));
  ipcMain.handle("labels:load", loadLabels);
  ipcMain.handle("labels:save", (_event, labels) => saveLabels(labels));
  ipcMain.handle("captures:save", (_event, request) => saveCapture(request));
  ipcMain.handle("bursts:save", (_event, request: SaveBurstRequest) =>
    saveBurst(request.title, request.source, request.intervalMs, request.labels, request.requests, request.errors ?? [], request.tags ?? [])
  );
  ipcMain.handle("captures:list", listCaptures);
  ipcMain.handle("captures:notes:save", (_event, captureId, notes) => saveCaptureNotes(captureId, notes));
  ipcMain.handle("captures:rename", (_event, captureId, title) => renameCapture(captureId, title));
  ipcMain.handle("camera-controls:get", (_event, cameraName) => getNativeCameraControls(cameraName));
  ipcMain.handle("camera-controls:set", (_event, deviceIndex, controlId, value) => setNativeCameraControl(deviceIndex, controlId, value));
  ipcMain.on("agent:capture-result", (_event, requestId, result: SaveCaptureRequest | { error: string }) => {
    const pending = pendingCaptures.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingCaptures.delete(requestId);
    if ("error" in result) {
      pending.reject(new Error(result.error));
    } else {
      pending.resolve(result);
    }
  });
  await createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

async function requestRendererCapture(options: AgentCaptureOptions): Promise<SaveCaptureRequest> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error("FrameBench window is not ready");
  }

  const requestId = randomUUID();
  const captureRequest = new Promise<SaveCaptureRequest>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCaptures.delete(requestId);
      reject(new Error("Timed out waiting for renderer capture"));
    }, 15000);
    pendingCaptures.set(requestId, { resolve, reject, timeout });
  });

  mainWindow.webContents.send("agent:capture-request", requestId, options);
  return captureRequest;
}

export function notifyCapturesChanged(): void {
  mainWindow?.webContents.send("captures:changed");
}
