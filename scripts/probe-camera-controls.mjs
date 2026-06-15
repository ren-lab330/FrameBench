#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const defaultHelper = "/tmp/framebench-uvc-util/build/Release/uvc-util";
const helperPath = process.env.FRAMEBENCH_UVC_UTIL ?? defaultHelper;

const usage = `FrameBench native camera-control probe

This prototype shells out to uvc-util, a macOS UVC/IOKit helper.
It is intentionally not wired into the app yet.

Usage:
  node scripts/probe-camera-controls.mjs list
  node scripts/probe-camera-controls.mjs controls --index 0
  node scripts/probe-camera-controls.mjs show --index 0
  node scripts/probe-camera-controls.mjs get --index 0 --control brightness
  node scripts/probe-camera-controls.mjs set --index 0 --control brightness --value 1

Set FRAMEBENCH_UVC_UTIL=/path/to/uvc-util if the helper is elsewhere.
`;

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const options = parseOptions(args.slice(1));

if (!existsSync(helperPath)) {
  fail(`uvc-util helper not found at ${helperPath}

Build it outside the repo for this prototype:
  git clone https://github.com/jtfrey/uvc-util.git /tmp/framebench-uvc-util
  cd /tmp/framebench-uvc-util
  xcodebuild -project uvc-util.xcodeproj -configuration Release build`);
}

switch (command) {
  case "list":
    run(["--list-devices"]);
    break;
  case "controls":
    run([...selectionArgs(options), "--list-controls"]);
    break;
  case "show":
    run([...selectionArgs(options), "--show-control=*"]);
    break;
  case "get":
    run([...selectionArgs(options), `--get-value=${required(options, "control")}`]);
    break;
  case "set":
    run([...selectionArgs(options), `--set=${required(options, "control")}=${required(options, "value")}`]);
    break;
  case "help":
  case "--help":
  case "-h":
    console.log(usage);
    break;
  default:
    fail(`Unknown command: ${command}\n\n${usage}`);
}

function run(helperArgs) {
  const result = spawnSync(helperPath, helperArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function selectionArgs(parsed) {
  if (parsed.index !== undefined) {
    return [`--select-by-index=${parsed.index}`];
  }
  if (parsed.vendorProduct !== undefined) {
    return [`--select-by-vendor-and-product-id=${parsed.vendorProduct}`];
  }
  if (parsed.name !== undefined) {
    return [`--select-by-name=${parsed.name}`];
  }
  return ["--select-by-index=0"];
}

function parseOptions(rawArgs) {
  const parsed = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const [key, inlineValue] = token.slice(2).split("=", 2);
    const value = inlineValue ?? rawArgs[index + 1];
    if (inlineValue === undefined) {
      index += 1;
    }

    parsed[toCamelCase(key)] = value;
  }

  return parsed;
}

function required(parsed, name) {
  const value = parsed[toCamelCase(name)];
  if (value === undefined || value === "") {
    fail(`Missing required option --${name}`);
  }
  return value;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
