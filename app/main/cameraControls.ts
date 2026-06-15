import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import type { NativeCameraControl, NativeCameraControlsState, NativeCameraDevice } from "../../shared/types.js";

const execFileAsync = promisify(execFile);
const CONTROL_LABELS: Record<string, string> = {
  "auto-exposure-mode": "Auto exposure mode",
  "exposure-time-abs": "Exposure time",
  brightness: "Brightness",
  contrast: "Contrast",
  saturation: "Saturation",
  hue: "Hue",
  gamma: "Gamma",
  sharpness: "Sharpness",
  "white-balance-temp": "White balance temp",
  "auto-white-balance-temp": "Auto white balance",
  "focus-abs": "Focus",
  "auto-focus": "Auto focus",
  "backlight-compensation": "Backlight compensation",
  "power-line-frequency": "Power line frequency"
};

const BOOLEAN_CONTROLS = new Set(["auto-focus", "auto-white-balance-temp"]);

export async function getNativeCameraControls(cameraName: string | null): Promise<NativeCameraControlsState> {
  if (process.platform !== "darwin") {
    return emptyState("Native camera controls are not implemented for this platform yet.", false);
  }

  const helperPath = resolveHelperPath();
  if (!helperPath) {
    return emptyState("Native camera helper is not available.", true);
  }

  try {
    const devices = parseDevices(await runHelper(helperPath, ["--list-devices"]));
    const matchedDevice = matchDevice(devices, cameraName);
    if (!matchedDevice) {
      return {
        supported: true,
        platform: process.platform,
        helperAvailable: true,
        message: devices.length ? "No matching native UVC camera was found." : "No native UVC cameras were found.",
        devices,
        matchedDevice: null,
        controls: []
      };
    }

    return stateForDevice(helperPath, devices, matchedDevice);
  } catch (error) {
    return emptyState(error instanceof Error ? error.message : String(error), true);
  }
}

export async function setNativeCameraControl(
  deviceIndex: number,
  controlId: string,
  value: number | boolean
): Promise<NativeCameraControlsState> {
  if (process.platform !== "darwin") {
    return emptyState("Native camera controls are not implemented for this platform yet.", false);
  }

  const helperPath = resolveHelperPath();
  if (!helperPath) {
    return emptyState("Native camera helper is not available.", true);
  }

  const helperValue = typeof value === "boolean" ? (value ? "1" : "0") : String(value);
  const devices = parseDevices(await runHelper(helperPath, ["--list-devices"]));
  const matchedDevice = devices.find((device) => device.index === deviceIndex) ?? null;
  if (!matchedDevice) return emptyState("Native camera was not found after updating the control.", true);

  try {
    await prepareManualMode(helperPath, deviceIndex, controlId);
    await runHelper(helperPath, [`--select-by-index=${deviceIndex}`, `--set=${controlId}=${helperValue}`]);
    return stateForDevice(helperPath, devices, matchedDevice);
  } catch (error) {
    const state = await stateForDevice(helperPath, devices, matchedDevice);
    return {
      ...state,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

async function prepareManualMode(helperPath: string, deviceIndex: number, controlId: string): Promise<void> {
  if (controlId === "exposure-time-abs") {
    await runHelper(helperPath, [`--select-by-index=${deviceIndex}`, "--set=auto-exposure-mode=1"]);
  }
  if (controlId === "focus-abs") {
    await runHelper(helperPath, [`--select-by-index=${deviceIndex}`, "--set=auto-focus=0"]);
  }
  if (controlId === "white-balance-temp") {
    await runHelper(helperPath, [`--select-by-index=${deviceIndex}`, "--set=auto-white-balance-temp=0"]);
  }
}

async function stateForDevice(
  helperPath: string,
  devices: NativeCameraDevice[],
  matchedDevice: NativeCameraDevice
): Promise<NativeCameraControlsState> {
  const controls = parseControls(await runHelper(helperPath, [`--select-by-index=${matchedDevice.index}`, "--show-control=*"]));
  return {
    supported: true,
    platform: process.platform,
    helperAvailable: true,
    message: controls.length ? "Native camera controls are available." : "This camera did not report writable UVC controls.",
    devices,
    matchedDevice,
    controls
  };
}

function resolveHelperPath(): string | null {
  const candidates = [
    process.env.FRAMEBENCH_UVC_UTIL,
    join(process.resourcesPath, "native", "macos", "uvc-util"),
    join(process.resourcesPath, "uvc-util"),
    join(app.getAppPath(), "resources", "native", "macos", "uvc-util"),
    "/tmp/framebench-uvc-util/build/Release/uvc-util"
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function runHelper(helperPath: string, args: string[]): Promise<string> {
  const result = await execFileAsync(helperPath, args, { timeout: 5000, maxBuffer: 1024 * 1024 });
  return result.stdout;
}

function parseDevices(output: string): NativeCameraDevice[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.match(/^(\d+)\s+(0x[0-9a-f]+:0x[0-9a-f]+)\s+(0x[0-9a-f]+)\s+([0-9.]+)\s+(.+)$/i))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      index: Number(match[1]),
      vendorProduct: match[2],
      locationId: match[3],
      uvcVersion: match[4],
      name: match[5].trim()
    }));
}

function parseControls(output: string): NativeCameraControl[] {
  const controls: NativeCameraControl[] = [];
  const blocks = output.matchAll(/^([a-z0-9-]+) \{\n([\s\S]*?)^}/gm);

  for (const block of blocks) {
    const id = block[1];
    const body = block[2];
    const typeDescription = body.match(/type-description:\s*\{\n([\s\S]*?)^\s*}/m)?.[1].trim().replace(/\s+/g, " ") ?? "";
    const currentValue = readValue(body, "current-value");
    if (currentValue === undefined) continue;

    const valueKind = BOOLEAN_CONTROLS.has(id) || typeof currentValue === "boolean" ? "boolean" : "number";
    controls.push({
      id,
      label: CONTROL_LABELS[id] ?? titleFromControlId(id),
      valueKind,
      minimum: readNumber(body, "minimum"),
      maximum: readNumber(body, "maximum"),
      step: readNumber(body, "step-size"),
      defaultValue: readValue(body, "default-value"),
      currentValue,
      typeDescription
    });
  }

  return controls.sort((left, right) => displayRank(left.id) - displayRank(right.id));
}

function readNumber(body: string, field: string): number | undefined {
  const value = readRaw(body, field);
  if (value === undefined) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function readValue(body: string, field: string): number | boolean | undefined {
  const value = readRaw(body, field);
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function readRaw(body: string, field: string): string | undefined {
  return body.match(new RegExp(`^\\s*${field}:\\s*(.+)$`, "m"))?.[1].trim();
}

function matchDevice(devices: NativeCameraDevice[], cameraName: string | null): NativeCameraDevice | null {
  if (!cameraName) return devices[0] ?? null;
  const normalizedCameraName = normalizeName(cameraName);
  return (
    devices.find((device) => normalizeName(device.name) === normalizedCameraName) ??
    devices.find((device) => normalizedCameraName.includes(normalizeName(device.name))) ??
    devices[0] ??
    null
  );
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function displayRank(id: string): number {
  const order = [
    "auto-exposure-mode",
    "exposure-time-abs",
    "brightness",
    "contrast",
    "saturation",
    "gamma",
    "sharpness",
    "auto-white-balance-temp",
    "white-balance-temp",
    "auto-focus",
    "focus-abs"
  ];
  const index = order.indexOf(id);
  return index === -1 ? order.length : index;
}

function titleFromControlId(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function emptyState(message: string, helperAvailable: boolean): NativeCameraControlsState {
  return {
    supported: process.platform === "darwin",
    platform: process.platform,
    helperAvailable,
    message,
    devices: [],
    matchedDevice: null,
    controls: []
  };
}
