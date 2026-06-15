import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ChevronDown,
  Crosshair,
  FolderOpen,
  Images,
  Lock,
  Maximize2,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Unlock,
  X
} from "lucide-react";
import { createRoot } from "react-dom/client";
import type {
  BurstSummary,
  CaptureSummary,
  FrameBenchApi,
  FrameBenchLabel,
  HistoryItem,
  NativeCameraControl,
  NativeCameraControlsState,
  ProjectConfig,
  ProjectState,
  SaveBurstRequest,
  SaveCaptureRequest
} from "../../../shared/types";
import {
  clamp,
  clampInteger,
  cropVideoToDataUrl,
  delay,
  imageStatsFromCanvas,
  resizeLabel,
  toFileUrl,
  type ResizeCorner
} from "./lib/capture";
import { nextLabelId, normalizeId, titleFromId, uniqueLabelId } from "../../../shared/labels";
import "./styles.css";

const COLORS = ["#f2c14e", "#59c9a5", "#ff6b6b", "#7aa2ff", "#c084fc", "#4dd4ff"];
const api = getFrameBenchApi();
const isBrowserPreview = !window.framebench;

type DragState =
  | { type: "pendingDraw"; startX: number; startY: number }
  | { type: "draw"; startX: number; startY: number; labelId: string }
  | { type: "move"; startX: number; startY: number; label: FrameBenchLabel }
  | { type: "resize"; startX: number; startY: number; label: FrameBenchLabel; corner: ResizeCorner }
  | null;

function App() {
  const [project, setProject] = useState<ProjectState | null>(null);
  const [labels, setLabels] = useState<FrameBenchLabel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [cameraStatus, setCameraStatus] = useState<"idle" | "starting" | "ready" | "blocked" | "unavailable">("idle");
  const [streamSize, setStreamSize] = useState({ width: 0, height: 0 });
  const [videoRect, setVideoRect] = useState({ left: 0, top: 0, width: 1, height: 1 });
  const [cropPreview, setCropPreview] = useState<string>("");
  const [captures, setCaptures] = useState<HistoryItem[]>([]);
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(null);
  const [labelsLocked, setLabelsLocked] = useState(false);
  const [burstMenuOpen, setBurstMenuOpen] = useState(false);
  const [burstTitle, setBurstTitle] = useState("Manual burst");
  const [burstCount, setBurstCount] = useState(12);
  const [burstIntervalMs, setBurstIntervalMs] = useState(150);
  const [burstLabelScope, setBurstLabelScope] = useState("all");
  const [burstRunning, setBurstRunning] = useState(false);
  const [labelIdDraft, setLabelIdDraft] = useState("");
  const [undoLabels, setUndoLabels] = useState<FrameBenchLabel[] | null>(null);
  const [cameraRestartToken, setCameraRestartToken] = useState(0);
  const [nativeControlsOpen, setNativeControlsOpen] = useState(false);
  const [nativeControls, setNativeControls] = useState<NativeCameraControlsState | null>(null);
  const [nativeControlPending, setNativeControlPending] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const selectedLabel = labels.find((label) => label.id === selectedId) ?? null;
  const selectedItem = captures.find((capture) => capture.id === selectedCaptureId) ?? null;
  const selectedDevice = devices.find((device) => device.deviceId === selectedDeviceId) ?? null;

  useEffect(() => {
    setLabelIdDraft(selectedLabel?.id ?? "");
  }, [selectedLabel?.id]);

  const updateVideoRect = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !streamSize.width || !streamSize.height) {
      setVideoRect({ left: 0, top: 0, width: 1, height: 1 });
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    const stageAspect = stageRect.width / stageRect.height;
    const videoAspect = streamSize.width / streamSize.height;

    if (stageAspect > videoAspect) {
      const width = stageRect.height * videoAspect;
      setVideoRect({ left: (stageRect.width - width) / 2, top: 0, width, height: stageRect.height });
    } else {
      const height = stageRect.width / videoAspect;
      setVideoRect({ left: 0, top: (stageRect.height - height) / 2, width: stageRect.width, height });
    }
  }, [streamSize]);

  const loadProjectWorkspace = useCallback(async (nextProject: ProjectState) => {
    setProject(nextProject);
    const [config, loadedLabels, loadedCaptures] = await Promise.all([api.loadProjectConfig(), api.loadLabels(), api.listCaptures()]);
    setLabels(loadedLabels);
    setSelectedId(loadedLabels[0]?.id ?? null);
    setSelectedCaptureId(null);
    setCaptures(loadedCaptures);
    applyProjectConfig(config, setSelectedDeviceId, setLabelsLocked);
  }, []);

  useEffect(() => {
    api.getProject().then((currentProject) => {
      if (currentProject) {
        void loadProjectWorkspace(currentProject);
      } else {
        setProject(null);
      }
    });
  }, [loadProjectWorkspace]);

  useEffect(() => {
    return api.onCapturesChanged(() => {
      api.listCaptures().then(setCaptures);
    });
  }, []);

  useEffect(() => {
    if (!project) return;
    const timeout = window.setTimeout(() => {
      void api.saveLabels(labels);
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [labels, project]);

  const chooseProject = useCallback(async () => {
    const nextProject = await api.chooseProject();
    if (!nextProject) return;
    await loadProjectWorkspace(nextProject);
    setCameraRestartToken((token) => token + 1);
  }, [loadProjectWorkspace]);

  useEffect(() => {
    if (!project) return;
    const timeout = window.setTimeout(() => {
      void api.updateProjectConfig({ lastCameraId: selectedDeviceId || null });
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [project, selectedDeviceId]);

  const refreshNativeControls = useCallback(async () => {
    if (isBrowserPreview) return;
    const state = await api.getNativeCameraControls(selectedDevice?.label || null);
    setNativeControls(state);
  }, [selectedDevice?.label]);

  useEffect(() => {
    if (!project || !selectedDeviceId || !nativeControlsOpen) return;
    void refreshNativeControls();
  }, [nativeControlsOpen, project, refreshNativeControls, selectedDeviceId]);

  const setNativeControl = useCallback(async (control: NativeCameraControl, value: number | boolean) => {
    const deviceIndex = nativeControls?.matchedDevice?.index;
    if (deviceIndex === undefined) return;
    setNativeControlPending(control.id);
    try {
      const state = await api.setNativeCameraControl(deviceIndex, control.id, value);
      setNativeControls(state);
    } catch (error) {
      setNativeControls((current) =>
        current
          ? { ...current, message: error instanceof Error ? error.message : String(error) }
          : current
      );
    } finally {
      setNativeControlPending(null);
    }
  }, [nativeControls?.matchedDevice?.index]);

  useEffect(() => {
    if (!project) return;
    void api.updateProjectConfig({ labelLockEnabled: labelsLocked });
  }, [labelsLocked, project]);

  const refreshDevices = useCallback(async () => {
    const mediaDevices = await navigator.mediaDevices.enumerateDevices();
    const cameras = mediaDevices.filter((device) => device.kind === "videoinput");
    setDevices(cameras);
    if ((!selectedDeviceId || !cameras.some((camera) => camera.deviceId === selectedDeviceId)) && cameras[0]) {
      setSelectedDeviceId(cameras[0].deviceId);
    }
  }, [selectedDeviceId]);

  const updateStreamSize = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setStreamSize({ width: video.videoWidth, height: video.videoHeight });
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("unavailable");
      return;
    }

    setCameraStatus("starting");
    try {
      const previousStream = videoRef.current?.srcObject;
      if (previousStream instanceof MediaStream) {
        previousStream.getTracks().forEach((track) => track.stop());
      }
      if (videoRef.current) videoRef.current.srcObject = null;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: selectedDeviceId ? { ideal: selectedDeviceId } : undefined,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((resolve) => {
          if (!videoRef.current) return resolve();
          if (videoRef.current.readyState >= 1) return resolve();
          videoRef.current.onloadedmetadata = () => resolve();
        });
        await videoRef.current.play();
        updateStreamSize();
      }
      setCameraStatus("ready");
      await refreshDevices();
    } catch {
      setCameraStatus("blocked");
    }
  }, [refreshDevices, selectedDeviceId, updateStreamSize]);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    void startCamera();
    return () => {
      const stream = videoRef.current?.srcObject;
      if (stream instanceof MediaStream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startCamera, cameraRestartToken]);

  useEffect(() => {
    updateVideoRect();
    window.addEventListener("resize", updateVideoRect);
    return () => window.removeEventListener("resize", updateVideoRect);
  }, [updateVideoRect]);

  useEffect(() => {
    updateVideoRect();
  }, [streamSize, updateVideoRect]);

  const getPoint = useCallback((event: React.PointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || !videoRect.width || !videoRect.height) return null;
    return {
      x: clamp((event.clientX - rect.left - videoRect.left) / videoRect.width),
      y: clamp((event.clientY - rect.top - videoRect.top) / videoRect.height)
    };
  }, [videoRect]);

  const beginDraw = useCallback((event: React.PointerEvent) => {
    if (labelsLocked) return;
    if ((event.target as HTMLElement).closest(".labelBox")) return;
    const point = getPoint(event);
    if (!point) return;
    setSelectedCaptureId(null);
    setDrag({ type: "pendingDraw", startX: point.x, startY: point.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [getPoint, labelsLocked]);

  const pointerMove = useCallback((event: React.PointerEvent) => {
    if (!drag) return;
    const point = getPoint(event);
    if (!point) return;

    if (drag.type === "pendingDraw") {
      if (Math.hypot(point.x - drag.startX, point.y - drag.startY) < 0.012) return;
      const id = nextLabelId(labels);
      const label: FrameBenchLabel = {
        id,
        name: titleFromId(id),
        shape: "rect",
        x: Math.min(drag.startX, point.x),
        y: Math.min(drag.startY, point.y),
        width: Math.max(0.01, Math.abs(point.x - drag.startX)),
        height: Math.max(0.01, Math.abs(point.y - drag.startY)),
        color: COLORS[labels.length % COLORS.length],
        description: ""
      };
      setLabels((current) => [...current, label]);
      setSelectedId(id);
      setUndoLabels(null);
      setDrag({ type: "draw", startX: drag.startX, startY: drag.startY, labelId: id });
      return;
    }

    if (drag.type === "draw") {
      setLabels((current) =>
        current.map((label) => {
          if (label.id !== drag.labelId) return label;
          const x = Math.min(drag.startX, point.x);
          const y = Math.min(drag.startY, point.y);
          return {
            ...label,
            x,
            y,
            width: Math.max(0.01, Math.abs(point.x - drag.startX)),
            height: Math.max(0.01, Math.abs(point.y - drag.startY))
          };
        })
      );
      return;
    }

    if (drag.type === "move") {
      const deltaX = point.x - drag.startX;
      const deltaY = point.y - drag.startY;
      setLabels((current) =>
        current.map((label) =>
          label.id === drag.label.id
            ? {
                ...label,
                x: clamp(drag.label.x + deltaX, 0, 1 - drag.label.width),
                y: clamp(drag.label.y + deltaY, 0, 1 - drag.label.height)
              }
            : label
        )
      );
    }

    if (drag.type === "resize") {
      setLabels((current) =>
        current.map((label) => (label.id === drag.label.id ? resizeLabel(drag.label, drag.corner, point) : label))
      );
    }
  }, [drag, getPoint, labels]);

  const endPointer = useCallback(() => {
    setDrag(null);
  }, []);

  const beginMove = useCallback((event: React.PointerEvent, label: FrameBenchLabel) => {
    event.stopPropagation();
    const point = getPoint(event);
    if (!point) return;
    setSelectedId(label.id);
    setSelectedCaptureId(null);
    if (labelsLocked) return;
    setDrag({ type: "move", startX: point.x, startY: point.y, label });
  }, [getPoint, labelsLocked]);

  const beginResize = useCallback((event: React.PointerEvent, label: FrameBenchLabel, corner: ResizeCorner) => {
    event.stopPropagation();
    const point = getPoint(event);
    if (!point) return;
    setSelectedId(label.id);
    setSelectedCaptureId(null);
    if (labelsLocked) return;
    setDrag({ type: "resize", startX: point.x, startY: point.y, label, corner });
  }, [getPoint, labelsLocked]);

  const updateSelected = useCallback((patch: Partial<FrameBenchLabel>) => {
    if (!selectedId || labelsLocked) return;
    setLabels((current) =>
      current.map((label) => {
        if (label.id !== selectedId) return label;
        return { ...label, ...patch };
      })
    );
  }, [labelsLocked, selectedId]);

  const commitLabelIdDraft = useCallback(() => {
    if (!selectedId || labelsLocked) return;
    const normalized = uniqueLabelId(normalizeId(labelIdDraft), labels, selectedId);
    if (!normalized) {
      setLabelIdDraft(selectedId);
      return;
    }
    setLabels((current) => current.map((label) => (label.id === selectedId ? { ...label, id: normalized } : label)));
    setSelectedId(normalized);
    setLabelIdDraft(normalized);
  }, [labelIdDraft, labels, labelsLocked, selectedId]);

  const deleteSelected = useCallback(() => {
    if (!selectedId || labelsLocked) return;
    setUndoLabels(labels);
    setLabels((current) => current.filter((label) => label.id !== selectedId));
    setSelectedId(null);
  }, [labels, labelsLocked, selectedId]);

  const undoLastLabelDelete = useCallback(() => {
    if (!undoLabels) return;
    setLabels(undoLabels);
    setUndoLabels(null);
  }, [undoLabels]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable = target?.matches("input, textarea, select, [contenteditable='true']");
      if (isEditable) return;

      if ((event.key === "Delete" || event.key === "Backspace") && selectedId && !labelsLocked) {
        event.preventDefault();
        deleteSelected();
      }

      if (event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey) && undoLabels) {
        event.preventDefault();
        undoLastLabelDelete();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, labelsLocked, selectedId, undoLabels, undoLastLabelDelete]);

  const buildCaptureRequest = useCallback((title: string, source: "human" | "agent", tags: string[] = []): SaveCaptureRequest | null => {
    const video = videoRef.current;
    if (!video || cameraStatus !== "ready" || !streamSize.width || !streamSize.height) return null;

    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = streamSize.width;
    fullCanvas.height = streamSize.height;
    const fullContext = fullCanvas.getContext("2d");
    if (!fullContext) return null;
    fullContext.drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height);
    const fullStats = imageStatsFromCanvas(fullCanvas);

    const crops = labels.map((label) => {
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = Math.max(1, Math.round(label.width * fullCanvas.width));
      cropCanvas.height = Math.max(1, Math.round(label.height * fullCanvas.height));
      const cropContext = cropCanvas.getContext("2d");
      cropContext?.drawImage(
        fullCanvas,
        Math.round(label.x * fullCanvas.width),
        Math.round(label.y * fullCanvas.height),
        cropCanvas.width,
        cropCanvas.height,
        0,
        0,
        cropCanvas.width,
        cropCanvas.height
      );
      return {
        name: label.id,
        dataUrl: cropCanvas.toDataURL("image/jpeg", 0.92),
        stats: imageStatsFromCanvas(cropCanvas)
      };
    });

    const device = devices.find((item) => item.deviceId === selectedDeviceId);
    return {
      title,
      source,
      camera: {
        name: device?.label || "Camera",
        width: streamSize.width,
        height: streamSize.height
      },
      fullImage: fullCanvas.toDataURL("image/jpeg", 0.92),
      fullStats,
      labels,
      crops,
      tags
    };
  }, [cameraStatus, devices, labels, selectedDeviceId, streamSize]);

  const captureFrame = useCallback(async () => {
    const request = buildCaptureRequest("Manual capture", "human");
    if (!request) return;
    const summary = await api.saveCapture(request);
    setCaptures((current) => [summary, ...current]);
    setSelectedCaptureId(summary.id);
    setSelectedId(null);
  }, [buildCaptureRequest]);

  const captureBurst = useCallback(async () => {
    if (burstRunning) return;
    const count = clampInteger(burstCount, 2, 300);
    const intervalMs = clampInteger(burstIntervalMs, 50, 60000);
    const startedAt = Date.now();
    const requests: SaveCaptureRequest[] = [];
    const errors: SaveBurstRequest["errors"] = [];
    const summaryLabels = burstLabelScope === "all" ? labels.map((label) => label.id) : [burstLabelScope].filter(Boolean);

    setBurstRunning(true);
    setSelectedCaptureId(null);
    try {
      for (let index = 0; index < count; index += 1) {
        const targetStart = startedAt + index * intervalMs;
        const waitMs = targetStart - Date.now();
        if (waitMs > 0) await delay(waitMs);
        const request = buildCaptureRequest(`${burstTitle || "Manual burst"} sample ${String(index + 1).padStart(2, "0")}`, "human", ["human-burst"]);
        if (!request) {
          errors.push({ index: index + 1, error: "Camera is not ready" });
          continue;
        }
        requests.push({
          ...request,
          capturedAt: new Date().toISOString(),
          elapsedMs: Date.now() - startedAt
        });
      }

      if (requests.length < 2) return;
      const summary = await api.saveBurst({
        title: burstTitle || "Manual burst",
        source: "human",
        intervalMs,
        labels: summaryLabels,
        requests,
        errors,
        tags: ["human-burst"]
      });
      setCaptures((current) => [summary, ...current]);
      setSelectedCaptureId(summary.id);
      setSelectedId(null);
      setBurstMenuOpen(false);
    } finally {
      setBurstRunning(false);
    }
  }, [buildCaptureRequest, burstCount, burstIntervalMs, burstLabelScope, burstRunning, burstTitle, labels]);

  useEffect(() => {
    return api.onAgentCaptureRequest((requestId, options) => {
      const request = buildCaptureRequest(options.title || "Agent capture", "agent", options.tags ?? []);
      if (!request) {
        api.completeAgentCaptureRequest(requestId, { error: "Camera is not ready" });
        return;
      }
      api.completeAgentCaptureRequest(requestId, request);
    });
  }, [buildCaptureRequest]);

  useEffect(() => {
    if (!selectedLabel || cameraStatus !== "ready") {
      setCropPreview("");
      return;
    }

    let frame = 0;
    const renderPreview = () => {
      const video = videoRef.current;
      if (video && streamSize.width && streamSize.height) {
        setCropPreview(cropVideoToDataUrl(video, selectedLabel, streamSize.width, streamSize.height, 0.88));
      }
      frame = window.requestAnimationFrame(renderPreview);
    };
    renderPreview();
    return () => window.cancelAnimationFrame(frame);
  }, [cameraStatus, selectedLabel, streamSize]);

  const statusText = useMemo(() => {
    if (cameraStatus === "ready") return `${streamSize.width || "-"} x ${streamSize.height || "-"}`;
    if (cameraStatus === "starting") return "Starting";
    if (cameraStatus === "blocked") return "Permission needed";
    if (cameraStatus === "unavailable") return "Unavailable";
    return "Idle";
  }, [cameraStatus, streamSize]);

  if (!project) {
    return <ProjectPicker onChooseProject={chooseProject} />;
  }

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="brandCluster">
          <AppLogo />
          <div>
            <h1>FrameBench</h1>
            <p>{project.projectPath}</p>
          </div>
        </div>
        <div className="statusCluster">
          <StatusPill icon={<Camera size={15} />} tone={cameraStatus === "ready" ? "good" : "warn"} text={statusText} />
          <StatusPill icon={<Radio size={15} />} tone={project.agentApiUrl ? "good" : "warn"} text={project.agentApiUrl ?? "Agent offline"} />
          <span className="revision">{project.appRevision}</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="leftRail">
          <section>
            <p className="railLabel">Project</p>
            <h2>{project.projectName}</h2>
            <button className="secondaryButton" onClick={chooseProject}>
              <FolderOpen size={16} /> Switch
            </button>
            {isBrowserPreview && (
              <p className="previewNote">Browser preview cannot open folders. Use the Electron app for real projects.</p>
            )}
          </section>

          <section>
            <p className="railLabel">Camera</p>
            <select value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)}>
              {devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
            <button className="secondaryButton cameraControlToggle" onClick={() => setNativeControlsOpen((open) => !open)}>
              <SlidersHorizontal size={16} /> Native Controls
            </button>
            {nativeControlsOpen && (
              <NativeCameraControlsPanel
                state={nativeControls}
                pendingControlId={nativeControlPending}
                onRefresh={refreshNativeControls}
                onSetControl={setNativeControl}
              />
            )}
          </section>

          <section>
            <p className="railLabel">Captures</p>
            {captures.length ? (
              <div className="captureList">
                {captures.slice(0, 8).map((capture) => (
                  <button
                    className={`captureItem ${selectedCaptureId === capture.id ? "active" : ""}`}
                    key={capture.id}
                    onClick={() => {
                      if (selectedCaptureId === capture.id) {
                        setSelectedCaptureId(null);
                      } else {
                        setSelectedCaptureId(capture.id);
                        setSelectedId(null);
                      }
                    }}
                  >
                    {historyThumb(capture) ? <img src={toFileUrl(historyThumb(capture) as string)} alt="" /> : <span className="captureThumbFallback" />}
                    <span>{capture.kind === "burst" ? `Burst · ${capture.title}` : capture.title}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="emptyHistory">
                <Maximize2 size={16} />
                <span>Capture history will appear here.</span>
              </div>
            )}
          </section>
        </aside>

        <section className="stageColumn">
          <div
            ref={stageRef}
            className="cameraStage"
            onPointerDown={beginDraw}
            onPointerMove={pointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
          >
            <video ref={videoRef} className="cameraVideo" muted playsInline onLoadedMetadata={updateStreamSize} />
            {cameraStatus !== "ready" && (
              <div className="cameraFallback">
                <Camera size={34} />
                <strong>{cameraStatus === "blocked" ? "Camera access is blocked" : "Starting camera"}</strong>
                <button className="primaryButton" onClick={startCamera}>Start Camera</button>
              </div>
            )}
            <div className="labelLayer">
              <div
                className="videoOverlay"
                style={{
                  left: videoRect.left,
                  top: videoRect.top,
                  width: videoRect.width,
                  height: videoRect.height
                }}
              >
              {labels.map((label) => (
                <button
                  key={label.id}
                  className={`labelBox ${selectedId === label.id ? "selected" : ""}`}
                  style={{
                    left: `${label.x * 100}%`,
                    top: `${label.y * 100}%`,
                    width: `${label.width * 100}%`,
                    height: `${label.height * 100}%`,
                    borderColor: label.color,
                    color: label.color
                  }}
                  onPointerDown={(event) => beginMove(event, label)}
                >
                  <span>{label.id}</span>
                  {selectedId === label.id && (
                    <>
                      <i className="resizeHandle nw" onPointerDown={(event) => beginResize(event, label, "nw")} />
                      <i className="resizeHandle ne" onPointerDown={(event) => beginResize(event, label, "ne")} />
                      <i className="resizeHandle sw" onPointerDown={(event) => beginResize(event, label, "sw")} />
                      <i className="resizeHandle se" onPointerDown={(event) => beginResize(event, label, "se")} />
                    </>
                  )}
                </button>
              ))}
              </div>
            </div>
          </div>

          <footer className="labelDock">
            <div className="dockHeading">
              <Crosshair size={17} />
              <span>Labels</span>
            </div>
            <div className="labelChips">
              {labels.map((label) => (
                <button
                  key={label.id}
                  className={`labelChip ${selectedId === label.id ? "active" : ""}`}
                  onClick={() => {
                    setSelectedId(label.id);
                    setSelectedCaptureId(null);
                  }}
                >
                  <span style={{ background: label.color }} />
                  {label.id}
                </button>
              ))}
              <button className="labelHint">
                <Plus size={15} /> Drag on camera
              </button>
            </div>
            <button className={`lockButton ${labelsLocked ? "locked" : ""}`} onClick={() => setLabelsLocked((locked) => !locked)}>
              {labelsLocked ? <Lock size={16} /> : <Unlock size={16} />}
            </button>
            <button className="captureButton" onClick={captureFrame} disabled={cameraStatus !== "ready"}>
              <Camera size={18} /> Capture
            </button>
            <div className="burstControl">
              <button className="burstButton" onClick={() => setBurstMenuOpen((open) => !open)} disabled={cameraStatus !== "ready" || burstRunning}>
                <Images size={18} /> {burstRunning ? "Bursting" : "Burst"} <ChevronDown size={15} />
              </button>
              {burstMenuOpen && (
                <div className="burstMenu">
                  <label>
                    Name
                    <input value={burstTitle} onChange={(event) => setBurstTitle(event.target.value)} />
                  </label>
                  <div className="burstMenuGrid">
                    <label>
                      Count
                      <input
                        type="number"
                        min={2}
                        max={300}
                        value={burstCount}
                        onChange={(event) => setBurstCount(clampInteger(Number(event.target.value), 2, 300))}
                      />
                    </label>
                    <label>
                      Interval ms
                      <input
                        type="number"
                        min={50}
                        max={60000}
                        step={25}
                        value={burstIntervalMs}
                        onChange={(event) => setBurstIntervalMs(clampInteger(Number(event.target.value), 50, 60000))}
                      />
                    </label>
                  </div>
                  <label>
                    Summary label
                    <select value={burstLabelScope} onChange={(event) => setBurstLabelScope(event.target.value)}>
                      <option value="all">All labels</option>
                      {labels.map((label) => (
                        <option key={label.id} value={label.id}>
                          {label.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="primaryButton fullWidth" onClick={captureBurst} disabled={cameraStatus !== "ready" || burstRunning}>
                    <Images size={16} /> Start Burst
                  </button>
                </div>
              )}
            </div>
          </footer>
        </section>

        <aside className="inspector">
          <p className="railLabel">{selectedItem ? (selectedItem.kind === "burst" ? "Burst Review" : "Capture Review") : "Inspector"}</p>
          {selectedItem?.kind === "capture" ? (
            <CaptureReview
              capture={selectedItem}
              onClose={() => setSelectedCaptureId(null)}
              onRename={async (title) => {
                const updated = await api.renameCapture(selectedItem.id, title);
                setCaptures((current) => current.map((capture) => (capture.id === updated.id ? updated : capture)));
              }}
              onSaveNotes={async (notes) => {
                const updated = await api.saveCaptureNotes(selectedItem.id, notes);
                setCaptures((current) => current.map((capture) => (capture.id === updated.id ? updated : capture)));
              }}
            />
          ) : selectedItem?.kind === "burst" ? (
            <BurstReview burst={selectedItem} onClose={() => setSelectedCaptureId(null)} />
          ) : selectedLabel ? (
            <div className="fieldStack">
              {cropPreview && (
                <div className="liveCropPreview">
                  <img src={cropPreview} alt="" />
                </div>
              )}
              <label>
                Name
                <input disabled={labelsLocked} value={selectedLabel.name} onChange={(event) => updateSelected({ name: event.target.value })} />
                <small>Human-readable display text.</small>
              </label>
              <label>
                Label ID
                <input
                  disabled={labelsLocked}
                  value={labelIdDraft}
                  onChange={(event) => setLabelIdDraft(event.target.value)}
                  onBlur={commitLabelIdDraft}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setLabelIdDraft(selectedLabel.id);
                  }}
                />
                <small>Filesystem/API name used for crop files.</small>
              </label>
              <label>
                Description
                <textarea disabled={labelsLocked} value={selectedLabel.description} onChange={(event) => updateSelected({ description: event.target.value })} />
              </label>
              <div className="geometryGrid">
                <NumberField label="X" value={selectedLabel.x} onChange={(value) => updateSelected({ x: value })} />
                <NumberField label="Y" value={selectedLabel.y} onChange={(value) => updateSelected({ y: value })} />
                <NumberField label="W" value={selectedLabel.width} onChange={(value) => updateSelected({ width: value })} />
                <NumberField label="H" value={selectedLabel.height} onChange={(value) => updateSelected({ height: value })} />
              </div>
              <button className="dangerButton" onClick={deleteSelected} disabled={labelsLocked}>
                <Trash2 size={16} /> Delete Label
              </button>
              {undoLabels && (
                <button className="secondaryButton fullWidth" onClick={undoLastLabelDelete}>
                  <RotateCcw size={16} /> Undo Delete
                </button>
              )}
            </div>
          ) : (
            <div className="emptyInspector">
              <Crosshair size={22} />
              <span>Draw or select a label.</span>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function historyThumb(item: HistoryItem): string | null {
  if (item.kind === "capture") return item.fullImage;
  return item.samples[0]?.fullImage ?? null;
}

function NativeCameraControlsPanel({
  state,
  pendingControlId,
  onRefresh,
  onSetControl
}: {
  state: NativeCameraControlsState | null;
  pendingControlId: string | null;
  onRefresh: () => void;
  onSetControl: (control: NativeCameraControl, value: number | boolean) => void;
}) {
  return (
    <div className="nativeControlPanel">
      <div className="nativeControlHeader">
        <span>{state?.matchedDevice?.name ?? "Camera controls"}</span>
        <button className="iconButton" onClick={onRefresh} title="Refresh controls">
          <RefreshCw size={14} />
        </button>
      </div>
      {!state ? (
        <p>Open or refresh to probe native camera controls.</p>
      ) : !state.supported ? (
        <p>{state.message}</p>
      ) : !state.helperAvailable ? (
        <p>{state.message}</p>
      ) : state.controls.length === 0 ? (
        <p>{state.message}</p>
      ) : (
        <div className="nativeControlList">
          {state.controls.map((control) => (
            <NativeCameraControlField
              key={control.id}
              control={control}
              disabled={pendingControlId === control.id}
              onSetControl={onSetControl}
            />
          ))}
        </div>
      )}
      {state?.message && state.controls.length > 0 && <p>{state.message}</p>}
    </div>
  );
}

function NativeCameraControlField({
  control,
  disabled,
  onSetControl
}: {
  control: NativeCameraControl;
  disabled: boolean;
  onSetControl: (control: NativeCameraControl, value: number | boolean) => void;
}) {
  const [draftValue, setDraftValue] = useState(control.currentValue);

  useEffect(() => {
    setDraftValue(control.currentValue);
  }, [control.currentValue]);

  if (control.valueKind === "boolean") {
    return (
      <label className="nativeControlRow">
        <span>{control.label}</span>
        <input
          type="checkbox"
          checked={Boolean(control.currentValue)}
          disabled={disabled}
          onChange={(event) => onSetControl(control, event.target.checked)}
        />
      </label>
    );
  }

  if (control.id === "auto-exposure-mode") {
    return (
      <label className="nativeControlRow stacked">
        <span>{control.label}</span>
        <select
          value={String(control.currentValue)}
          disabled={disabled}
          onChange={(event) => onSetControl(control, Number(event.target.value))}
        >
          <option value="1">Manual</option>
          <option value="8">Auto</option>
          {control.currentValue !== 1 && control.currentValue !== 8 && (
            <option value={String(control.currentValue)}>Current: {String(control.currentValue)}</option>
          )}
        </select>
      </label>
    );
  }

  const numericValue = typeof draftValue === "number" ? draftValue : 0;
  const hasRange = control.minimum !== undefined && control.maximum !== undefined;

  return (
    <label className="nativeControlRow stacked">
      <span>{control.label}</span>
      <div className="nativeNumberControl">
        {hasRange && (
          <input
            type="range"
            min={control.minimum}
            max={control.maximum}
            step={control.step || 1}
            value={numericValue}
            disabled={disabled}
            onChange={(event) => setDraftValue(Number(event.target.value))}
            onPointerUp={(event) => onSetControl(control, Number((event.currentTarget as HTMLInputElement).value))}
          />
        )}
        <input
          type="number"
          min={control.minimum}
          max={control.maximum}
          step={control.step || 1}
          value={numericValue}
          disabled={disabled}
          onChange={(event) => setDraftValue(Number(event.target.value))}
          onBlur={(event) => onSetControl(control, Number(event.currentTarget.value))}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </div>
    </label>
  );
}

function applyProjectConfig(
  config: ProjectConfig | null,
  setSelectedDeviceId: (value: string) => void,
  setLabelsLocked: (value: boolean) => void
) {
  setSelectedDeviceId(config?.lastCameraId ?? "");
  setLabelsLocked(config?.labelLockEnabled ?? false);
}

function ProjectPicker({ onChooseProject }: { onChooseProject: () => void }) {
  return (
    <main className="pickerShell">
      <section className="pickerPanel">
        <AppLogo large />
        <h1>FrameBench</h1>
        <p>Choose a hardware or firmware project. Captures and labels stay inside that project in `.framebench`.</p>
        <button className="primaryButton" onClick={onChooseProject}>
          <FolderOpen size={18} /> Choose Project Folder
        </button>
      </section>
    </main>
  );
}

function AppLogo({ large = false }: { large?: boolean }) {
  return <img className={`appMark ${large ? "large" : ""}`} src="./icon.png" alt="" />;
}

function StatusPill({ icon, tone, text }: { icon: React.ReactNode; tone: "good" | "warn"; text: string }) {
  return (
    <span className={`statusPill ${tone}`}>
      {icon}
      {text}
    </span>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={0}
        max={1}
        step={0.001}
        value={Number(value.toFixed(3))}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
      />
    </label>
  );
}

function CaptureReview({
  capture,
  onClose,
  onRename,
  onSaveNotes
}: {
  capture: CaptureSummary;
  onClose: () => void;
  onRename: (title: string) => Promise<void>;
  onSaveNotes: (notes: string) => Promise<void>;
}) {
  const crops = Object.entries(capture.crops);
  const [title, setTitle] = useState(capture.title);
  const [notes, setNotes] = useState(capture.notes);

  useEffect(() => {
    setTitle(capture.title);
    setNotes(capture.notes);
  }, [capture]);

  return (
    <div className="captureReview">
      <button className="closeReviewButton" onClick={onClose}>
        <X size={15} /> Back to Inspector
      </button>
      {capture.fullImage ? <img className="reviewImage" src={toFileUrl(capture.fullImage)} alt="" /> : <div className="reviewImage placeholder" />}
      <label>
        Capture Name
        <input value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => void onRename(title)} />
      </label>
      <p>{new Date(capture.createdAt).toLocaleString()}</p>
      <label>
        Full Image
        <input readOnly value={capture.fullImage} />
      </label>
      {crops.length > 0 && (
        <div className="cropGrid">
          {crops.map(([labelId, path]) => (
            <div className="cropPreview" key={labelId}>
              <img src={toFileUrl(path)} alt="" />
              <label>
                {labelId}
                <input readOnly value={path} />
              </label>
            </div>
          ))}
        </div>
      )}
      {crops.length === 0 && <p>No label crops were saved with this capture.</p>}
      <label>
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => void onSaveNotes(notes)} />
      </label>
    </div>
  );
}

function BurstReview({ burst, onClose }: { burst: BurstSummary; onClose: () => void }) {
  const [frameIndex, setFrameIndex] = useState(0);
  const frames = burst.samples;

  useEffect(() => {
    if (frames.length <= 1) return;
    const timeout = window.setTimeout(() => {
      setFrameIndex((index) => (index + 1) % frames.length);
    }, Math.max(80, Math.min(1000, burst.intervalMs)));
    return () => window.clearTimeout(timeout);
  }, [burst.intervalMs, frameIndex, frames.length]);

  const current = frames[frameIndex];

  return (
    <div className="captureReview">
      <button className="closeReviewButton" onClick={onClose}>
        <X size={15} /> Back to Inspector
      </button>
      {current?.fullImage ? <img className="reviewImage" src={toFileUrl(current.fullImage)} alt="" /> : <div className="reviewImage placeholder" />}
      <h3>{burst.title}</h3>
      <p>
        Burst {frameIndex + 1} / {Math.max(1, frames.length)} · {burst.intervalMs} ms interval · {Math.round(burst.durationMs)} ms
      </p>
      {current && (
        <div className="cropGrid">
          {Object.entries(current.crops).map(([labelId, path]) => (
            <div className="cropPreview" key={labelId}>
              <img src={toFileUrl(path)} alt="" />
              <label>
                {labelId}
                <input readOnly value={path} />
              </label>
            </div>
          ))}
        </div>
      )}
      <label>
        Folder
        <input readOnly value={burst.folder} />
      </label>
      <div className="burstSummaryList">
        {Object.values(burst.summary).map((summary) => (
          <div className="burstSummaryItem" key={summary.labelId}>
            <strong>{summary.labelId}</strong>
            <span>brightness delta {summary.meanBrightness.delta}</span>
            <span>color delta r{summary.meanColor.r.delta} g{summary.meanColor.g.delta} b{summary.meanColor.b.delta}</span>
            <span>{summary.likelyChanged ? "likely changed" : "no strong change detected"}</span>
          </div>
        ))}
      </div>
      {burst.errors.length > 0 && <p>{burst.errors.length} samples failed during this burst.</p>}
    </div>
  );
}

function getFrameBenchApi(): FrameBenchApi {
  if (window.framebench) return window.framebench;

  const previewProject: ProjectState = {
    projectPath: "Browser preview mode",
    projectName: "Preview",
    appRevision: "0.1.0-preview",
    agentApiUrl: null
  };
  let previewLabels: FrameBenchLabel[] = [];
  let previewCaptures: CaptureSummary[] = [];
  let previewConfig: ProjectConfig = {
    schemaVersion: 1,
    appName: "FrameBench",
    lastCameraId: null,
    labelLockEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return {
    chooseProject: async () => previewProject,
    getProject: async () => previewProject,
    loadProjectConfig: async () => previewConfig,
    updateProjectConfig: async (patch: Partial<Pick<ProjectConfig, "lastCameraId" | "labelLockEnabled">>) => {
      previewConfig = { ...previewConfig, ...patch, updatedAt: new Date().toISOString() };
      return previewConfig;
    },
    saveLabels: async (labels: FrameBenchLabel[]) => {
      previewLabels = labels;
    },
    loadLabels: async () => previewLabels,
    saveCapture: async (_request: SaveCaptureRequest) => {
      const createdAt = new Date().toISOString();
      const summary: CaptureSummary = {
        kind: "capture",
        id: createdAt.replace(/:/g, "-"),
        title: "Browser preview capture",
        createdAt,
        folder: "",
        fullImage: "",
        crops: {},
        notes: ""
      };
      previewCaptures = [summary, ...previewCaptures];
      return summary;
    },
    saveBurst: async (request: SaveBurstRequest) => {
      const createdAt = new Date().toISOString();
      const summary: BurstSummary = {
        kind: "burst",
        id: createdAt.replace(/:/g, "-"),
        title: request.title,
        createdAt,
        folder: "",
        count: request.requests.length,
        intervalMs: request.intervalMs,
        durationMs: request.requests.at(-1)?.elapsedMs ?? 0,
        labels: request.labels,
        samples: [],
        summary: {},
        notes: "",
        tags: request.tags ?? [],
        errors: request.errors ?? []
      };
      previewCaptures = [summary, ...previewCaptures];
      return summary;
    },
    listCaptures: async () => previewCaptures,
    saveCaptureNotes: async (captureId: string, notes: string) => {
      previewCaptures = previewCaptures.map((capture) => (capture.id === captureId ? { ...capture, notes } : capture));
      return previewCaptures.find((capture) => capture.id === captureId) as CaptureSummary;
    },
    renameCapture: async (captureId: string, title: string) => {
      previewCaptures = previewCaptures.map((capture) => (capture.id === captureId ? { ...capture, title } : capture));
      return previewCaptures.find((capture) => capture.id === captureId) as CaptureSummary;
    },
    getNativeCameraControls: async () => ({
      supported: false,
      platform: "browser",
      helperAvailable: false,
      message: "Native camera controls are available only in the Electron app.",
      devices: [],
      matchedDevice: null,
      controls: []
    }),
    setNativeCameraControl: async () => ({
      supported: false,
      platform: "browser",
      helperAvailable: false,
      message: "Native camera controls are available only in the Electron app.",
      devices: [],
      matchedDevice: null,
      controls: []
    }),
    onAgentCaptureRequest: () => () => undefined,
    completeAgentCaptureRequest: () => undefined,
    onCapturesChanged: () => () => undefined
  };
}

createRoot(document.getElementById("root")!).render(<App />);
