import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Server } from "node:http";
import { getBurst, getCapture, listCaptures, renameCapture, saveBurst, saveBurstNotes, saveCapture, saveCaptureNotes } from "./captures.js";
import { getCurrentProjectState, loadLabels, setAgentApiUrl } from "./project.js";
import type { AgentBurstOptions, AgentCaptureOptions, BurstSummary, CaptureSummary, SaveCaptureRequest } from "../../shared/types.js";

let server: Server | null = null;
let captureRequester: ((options: AgentCaptureOptions) => Promise<SaveCaptureRequest>) | null = null;
let capturesChangedNotifier: (() => void) | null = null;

export function setCaptureRequester(requester: (options: AgentCaptureOptions) => Promise<SaveCaptureRequest>): void {
  captureRequester = requester;
}

export function setCapturesChangedNotifier(notifier: () => void): void {
  capturesChangedNotifier = notifier;
}

export async function startAgentServer(): Promise<string> {
  if (server) {
    const address = server.address();
    if (address && typeof address === "object") return `http://127.0.0.1:${address.port}`;
  }

  server = createServer(async (request, response) => {
    try {
      await route(request, response);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Unexpected server error"
      });
    }
  });

  const url = await new Promise<string>((resolve) => {
    const listen = (port: number) => {
      server?.listen(port, "127.0.0.1", () => {
        const address = server?.address();
        const actualPort = typeof address === "object" && address ? address.port : 0;
        resolve(`http://127.0.0.1:${actualPort}`);
      });
    };
    server?.once("error", () => listen(0));
    listen(47611);
  });

  setAgentApiUrl(url);
  return url;
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const parts = url.pathname.split("/").filter(Boolean);

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/status") {
    sendJson(response, 200, {
      ready: Boolean(getCurrentProjectState()),
      project: getCurrentProjectState(),
      camera: { captureAvailable: Boolean(captureRequester) }
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/project") {
    const project = getCurrentProjectState();
    if (!project) {
      sendJson(response, 404, { error: "No project selected" });
      return;
    }
    sendJson(response, 200, project);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/labels") {
    sendJson(response, 200, { labels: await loadLabels() });
    return;
  }

  if (parts[0] === "api" && parts[1] === "captures") {
    await routeCaptures(request, response, parts);
    return;
  }

  if (parts[0] === "api" && parts[1] === "bursts") {
    await routeBursts(request, response, parts);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function routeBursts(request: IncomingMessage, response: ServerResponse, parts: string[]): Promise<void> {
  const burstId = parts[2];

  if (request.method === "POST" && parts.length === 2) {
    if (!captureRequester) {
      sendJson(response, 503, { error: "Capture renderer is not ready" });
      return;
    }
    const body = await readJson<AgentBurstOptions>(request);
    const title = body.title || "Agent burst";
    const count = clampInteger(body.count ?? 8, 2, 300);
    const intervalMs = clampInteger(body.intervalMs ?? 250, 50, 60000);
    const labels = Array.isArray(body.labels) ? body.labels.filter(Boolean) : [];
    const tags = Array.isArray(body.tags) ? body.tags : [];
    const requests: SaveCaptureRequest[] = [];
    const errors: Array<{ index: number; error: string }> = [];
    const startedAt = Date.now();

    for (let index = 0; index < count; index += 1) {
      const targetStart = startedAt + index * intervalMs;
      const waitMs = targetStart - Date.now();
      if (waitMs > 0) await delay(waitMs);
      try {
        const requestPayload = await captureRequester({
          title: `${title} sample ${String(index + 1).padStart(2, "0")}`,
          tags
        });
        requests.push({
          ...requestPayload,
          capturedAt: new Date().toISOString(),
          elapsedMs: Date.now() - startedAt
        });
      } catch (error) {
        errors.push({ index: index + 1, error: error instanceof Error ? error.message : "Capture failed" });
      }
    }

    if (requests.length < 2) {
      sendJson(response, 500, { error: "Burst needs at least two successful samples", errors });
      return;
    }

    const burst = await saveBurst(title, "agent", intervalMs, labels, requests, errors, tags);
    capturesChangedNotifier?.();
    sendJson(response, 201, burstResponse(burst));
    return;
  }

  if (request.method === "GET" && burstId) {
    const burst = await getBurst(burstId);
    if (!burst) {
      sendJson(response, 404, { error: "Burst not found" });
      return;
    }
    sendJson(response, 200, burstResponse(burst));
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function routeCaptures(request: IncomingMessage, response: ServerResponse, parts: string[]): Promise<void> {
  const captureId = parts[2];
  const child = parts[3];

  if (request.method === "GET" && parts.length === 2) {
    sendJson(response, 200, { captures: await listCaptures() });
    return;
  }

  if (request.method === "POST" && parts.length === 2) {
    if (!captureRequester) {
      sendJson(response, 503, { error: "Capture renderer is not ready" });
      return;
    }
    const body = await readJson<AgentCaptureOptions>(request);
    const requestPayload = await captureRequester({
      title: body.title || "Agent capture",
      tags: Array.isArray(body.tags) ? body.tags : []
    });
    const capture = await saveCapture(requestPayload);
    capturesChangedNotifier?.();
    sendJson(response, 201, captureResponse(capture));
    return;
  }

  if (!captureId) {
    sendJson(response, 404, { error: "Capture not found" });
    return;
  }

  const capture = await getCapture(captureId);
  const burst = capture ? null : await getBurst(captureId);
  if (!capture && !burst) {
    sendJson(response, 404, { error: "Capture not found" });
    return;
  }

  if (request.method === "GET" && parts.length === 3) {
    sendJson(response, 200, capture ? captureResponse(capture) : burstResponse(burst as BurstSummary));
    return;
  }

  if (request.method === "PATCH" && parts.length === 3 && capture) {
    const body = await readJson<{ title?: string }>(request);
    sendJson(response, 200, captureResponse(await renameCapture(captureId, body.title || capture.title)));
    return;
  }

  if (request.method === "GET" && child === "full" && capture) {
    sendJson(response, 200, { captureId, path: capture.fullImage });
    return;
  }

  if (request.method === "GET" && child === "crops" && parts[4] && capture) {
    const labelId = parts[4];
    const path = capture.crops[labelId];
    if (!path) {
      sendJson(response, 404, { error: "Crop not found" });
      return;
    }
    sendJson(response, 200, { captureId, labelId, path });
    return;
  }

  if (request.method === "POST" && child === "notes") {
    const body = await readJson<{ note?: string; notes?: string; append?: boolean }>(request);
    const incoming = body.notes ?? body.note ?? "";
    if (capture) {
      const notes = body.append === false || !capture.notes ? incoming : `${capture.notes.trimEnd()}\n${incoming}`.trimStart();
      sendJson(response, 200, captureResponse(await saveCaptureNotes(captureId, notes)));
      return;
    }
    const burstItem = burst as BurstSummary;
    const notes = body.append === false || !burstItem.notes ? incoming : `${burstItem.notes.trimEnd()}\n${incoming}`.trimStart();
    sendJson(response, 200, burstResponse(await saveBurstNotes(captureId, notes)));
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function captureResponse(capture: CaptureSummary): CaptureSummary & { fullImagePath: string; cropPaths: Record<string, string> } {
  return {
    ...capture,
    fullImagePath: capture.fullImage,
    cropPaths: capture.crops
  };
}

function burstResponse(burst: BurstSummary): BurstSummary {
  return burst;
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {} as T;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "http://127.0.0.1",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS"
  };
}

function clampInteger(value: number, min: number, max: number): number {
  const normalized = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, normalized));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders()
  });
  response.end(JSON.stringify(body, null, 2));
}
