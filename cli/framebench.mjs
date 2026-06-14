#!/usr/bin/env node

const args = process.argv.slice(2);
const json = pullFlag("--json");
const baseUrl = pullOption("--url") || process.env.FRAMEBENCH_URL || "http://127.0.0.1:47611";
const command = args.shift();

if (!command || command === "help" || args.includes("--help") || args.includes("-h")) {
  usage(command === "help" ? args[0] : command);
}

try {
  switch (command) {
    case "status":
      await print(await request("GET", "/api/status"));
      break;
    case "project":
      await print(await request("GET", "/api/project"));
      break;
    case "labels":
      await print(await request("GET", "/api/labels"));
      break;
    case "capture": {
      const title = pullOption("--title") || args.join(" ") || "Agent capture";
      const tags = collectOption("--tag");
      await print(await request("POST", "/api/captures", { title, tags }));
      break;
    }
    case "burst": {
      const title = pullOption("--title") || "Agent burst";
      const tags = collectOption("--tag");
      const labels = collectOption("--label");
      const count = Number(pullOption("--count") || 8);
      const intervalMs = Number(pullOption("--interval") || pullOption("--interval-ms") || 250);
      await print(await request("POST", "/api/bursts", { title, tags, labels, count, intervalMs }));
      break;
    }
    case "captures":
      await print(await request("GET", "/api/captures"));
      break;
    case "full": {
      const captureId = requireArg("capture-id");
      await print(await request("GET", `/api/captures/${encodeURIComponent(captureId)}/full`));
      break;
    }
    case "stats": {
      const captureId = requireArg("capture-id");
      const labelId = args.shift();
      const capture = await request("GET", `/api/captures/${encodeURIComponent(captureId)}`);
      const stats = labelId ? capture.stats?.crops?.[labelId] : capture.stats;
      if (!stats) throw new Error(labelId ? `No stats for label ${labelId}` : "No stats for capture");
      await print({ captureId, labelId, stats });
      break;
    }
    case "compare": {
      const beforeId = requireArg("before-capture-id");
      const afterId = requireArg("after-capture-id");
      const labelId = requireArg("label-id");
      const before = await request("GET", `/api/captures/${encodeURIComponent(beforeId)}`);
      const after = await request("GET", `/api/captures/${encodeURIComponent(afterId)}`);
      const beforeStats = before.stats?.crops?.[labelId];
      const afterStats = after.stats?.crops?.[labelId];
      if (!beforeStats) throw new Error(`No stats for ${labelId} in ${beforeId}`);
      if (!afterStats) throw new Error(`No stats for ${labelId} in ${afterId}`);
      await print(compareStats(beforeId, afterId, labelId, beforeStats, afterStats));
      break;
    }
    case "crop": {
      const captureId = requireArg("capture-id");
      const labelId = requireArg("label-id");
      await print(await request("GET", `/api/captures/${encodeURIComponent(captureId)}/crops/${encodeURIComponent(labelId)}`));
      break;
    }
    case "note": {
      const captureId = requireArg("capture-id");
      const note = args.join(" ");
      if (!note) usage("note", "note requires text");
      await print(await request("POST", `/api/captures/${encodeURIComponent(captureId)}/notes`, { note }));
      break;
    }
    case "rename": {
      const captureId = requireArg("capture-id");
      const title = args.join(" ");
      if (!title) usage("rename", "rename requires a title");
      await print(await request("PATCH", `/api/captures/${encodeURIComponent(captureId)}`, { title }));
      break;
    }
    default:
      usage();
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (json) {
    console.error(JSON.stringify({ error: message }, null, 2));
  } else {
    console.error(`FrameBench: ${message}`);
  }
  process.exit(1);
}

async function request(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.error || `${response.status} ${response.statusText}`);
  }
  return data;
}

async function print(data) {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (command === "labels" && Array.isArray(data.labels)) {
    for (const label of data.labels) {
      console.log(`${label.id}\t${label.name}`);
    }
    return;
  }

  if (command === "captures" && Array.isArray(data.captures)) {
    for (const capture of data.captures) {
      console.log(`${capture.id}\t${capture.title}`);
    }
    return;
  }

  if (command === "capture") {
    console.log(`captureId: ${data.id}`);
    console.log(`folder: ${data.folder}`);
    console.log(`full: ${data.fullImagePath || data.fullImage}`);
    if (data.cropPaths || data.crops) {
      const crops = data.cropPaths || data.crops;
      for (const [label, path] of Object.entries(crops)) {
        console.log(`crop:${label}: ${path}`);
      }
    }
    return;
  }

  if (command === "burst") {
    console.log(`burstId: ${data.id}`);
    console.log(`folder: ${data.folder}`);
    console.log(`samples: ${data.samples?.length ?? 0}`);
    console.log(`intervalMs: ${data.intervalMs}`);
    for (const [labelId, summary] of Object.entries(data.summary || {})) {
      console.log(
        `summary:${labelId}: brightnessDelta=${summary.meanBrightness.delta} saturatedDelta=${summary.saturatedPixelRatio.delta} likelyChanged=${summary.likelyChanged}`
      );
    }
    return;
  }

  if (command === "compare") {
    console.log(`label: ${data.labelId}`);
    console.log(`meanBrightnessDelta: ${data.delta.meanBrightness}`);
    console.log(`saturatedPixelRatioDelta: ${data.delta.saturatedPixelRatio}`);
    console.log(`meanColorDelta: r=${data.delta.meanColor.r} g=${data.delta.meanColor.g} b=${data.delta.meanColor.b}`);
    console.log(`likelyChanged: ${data.likelyChanged}`);
    return;
  }

  if (data.path) {
    console.log(data.path);
    return;
  }

  console.log(JSON.stringify(data, null, 2));
}

function pullFlag(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function pullOption(option) {
  const index = args.indexOf(option);
  if (index === -1) return null;
  const value = args[index + 1];
  args.splice(index, 2);
  return value ?? null;
}

function collectOption(option) {
  const values = [];
  for (;;) {
    const value = pullOption(option);
    if (!value) return values;
    values.push(value);
  }
}

function requireArg(name) {
  const value = args.shift();
  if (!value) usage(command, `missing ${name}`);
  return value;
}

function compareStats(beforeId, afterId, labelId, before, after) {
  const delta = {
    meanBrightness: round(after.meanBrightness - before.meanBrightness),
    minBrightness: round(after.minBrightness - before.minBrightness),
    maxBrightness: round(after.maxBrightness - before.maxBrightness),
    contrast: round(after.contrast - before.contrast),
    saturatedPixelRatio: round(after.saturatedPixelRatio - before.saturatedPixelRatio, 4),
    meanColor: {
      r: round(after.meanColor.r - before.meanColor.r),
      g: round(after.meanColor.g - before.meanColor.g),
      b: round(after.meanColor.b - before.meanColor.b)
    }
  };

  return {
    beforeCaptureId: beforeId,
    afterCaptureId: afterId,
    labelId,
    before,
    after,
    delta,
    likelyChanged:
      Math.abs(delta.meanBrightness) >= 12 ||
      Math.abs(delta.saturatedPixelRatio) >= 0.02 ||
      Math.abs(delta.meanColor.r) + Math.abs(delta.meanColor.g) + Math.abs(delta.meanColor.b) >= 30
  };
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function usage(topic, error) {
  if (error) console.error(`FrameBench: ${error}`);
  const commandHelp = {
    status: `Usage:
  framebench status [--json]

Shows whether the FrameBench app and local agent API are reachable.`,
    project: `Usage:
  framebench project [--json]

Shows the currently selected FrameBench project.`,
    labels: `Usage:
  framebench labels [--json]

Lists configured labels. Use label IDs with crop, stats, compare, and burst.`,
    capture: `Usage:
  framebench capture --title "LED check" [--tag firmware] [--json]

Requests one camera capture from the FrameBench app.`,
    burst: `Usage:
  framebench burst --title "Fade check" [--label status_led] [--count 8] [--interval 250] [--json]

Requests a grouped burst capture for blinking, fading, movement, or transient visual states.

Options:
  --label <id>     Include a specific label in the burst summary; repeat for multiple labels
  --count <n>      Number of samples
  --interval <ms>  Best-effort delay between samples
  --tag <tag>      Add a tag; repeat for multiple tags`,
    captures: `Usage:
  framebench captures [--json]

Lists recent captures and bursts.`,
    full: `Usage:
  framebench full <capture-id> [--json]

Prints the full image path for a capture.`,
    stats: `Usage:
  framebench stats <capture-id> [label-id] [--json]

Shows full-image stats or one label crop's stats.`,
    compare: `Usage:
  framebench compare <before-capture-id> <after-capture-id> <label-id> [--json]

Compares brightness, saturation, contrast, and mean color for one label across two captures.`,
    crop: `Usage:
  framebench crop <capture-id> <label-id> [--json]

Prints one label crop path.`,
    note: `Usage:
  framebench note <capture-or-burst-id> "Observation text" [--json]

Writes notes.md for a capture or burst.`,
    rename: `Usage:
  framebench rename <capture-id> "New title" [--json]

Renames a capture.`
  };

  const help = commandHelp[topic];
  if (help) {
    console.error(`${help}

Global options:
  --url <url>      Override FrameBench API URL
  --json           Emit JSON`);
    process.exit(error ? 1 : 0);
  }

  console.error(`Usage:
  framebench status [--json]
  framebench project [--json]
  framebench labels [--json]
  framebench capture --title "LED check" [--tag firmware] [--json]
  framebench burst --title "Fade check" [--label status_led] [--count 8] [--interval 250] [--json]
  framebench captures [--json]
  framebench full <capture-id> [--json]
  framebench stats <capture-id> [label-id] [--json]
  framebench compare <before-capture-id> <after-capture-id> <label-id> [--json]
  framebench crop <capture-id> <label-id> [--json]
  framebench note <capture-id> "Observation text" [--json]
  framebench rename <capture-id> "New title" [--json]

Options:
  --url <url>      Override FrameBench API URL
  --json           Emit JSON

Run "framebench <command> --help" for command-specific help.`);
  process.exit(error ? 1 : 0);
}
