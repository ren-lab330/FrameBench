const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("framebench", {
  chooseProject: () => ipcRenderer.invoke("project:choose"),
  getProject: () => ipcRenderer.invoke("project:get"),
  loadProjectConfig: () => ipcRenderer.invoke("project:config:get"),
  updateProjectConfig: (patch) => ipcRenderer.invoke("project:config:update", patch),
  saveLabels: (labels) => ipcRenderer.invoke("labels:save", labels),
  loadLabels: () => ipcRenderer.invoke("labels:load"),
  saveCapture: (request) => ipcRenderer.invoke("captures:save", request),
  saveBurst: (request) => ipcRenderer.invoke("bursts:save", request),
  listCaptures: () => ipcRenderer.invoke("captures:list"),
  saveCaptureNotes: (captureId, notes) => ipcRenderer.invoke("captures:notes:save", captureId, notes),
  renameCapture: (captureId, title) => ipcRenderer.invoke("captures:rename", captureId, title),
  onAgentCaptureRequest: (callback) => {
    const listener = (_event, requestId, options) => callback(requestId, options);
    ipcRenderer.on("agent:capture-request", listener);
    return () => ipcRenderer.removeListener("agent:capture-request", listener);
  },
  completeAgentCaptureRequest: (requestId, result) => {
    ipcRenderer.send("agent:capture-result", requestId, result);
  },
  onCapturesChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("captures:changed", listener);
    return () => ipcRenderer.removeListener("captures:changed", listener);
  }
});
