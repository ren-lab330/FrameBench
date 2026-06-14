# FrameBench

FrameBench is a local Electron app for closing the feedback loop between coding agents and physical hardware. A human chooses a project folder, aims a camera at the bench, defines labeled regions, and an agent can request captures or bursts through a local HTTP API or CLI.

FrameBench stores all project data inside the selected project folder under `.framebench/`. The app does not require accounts, cloud services, or a global project registry.

## Current Capabilities

- Select a project folder and initialize `.framebench/`.
- Use a USB camera for live preview.
- Draw, resize, rename, lock, delete, and undo-delete rectangular labels.
- Take manual captures from the UI.
- Take manual burst captures from the UI with count, interval, and label summary controls.
- Request captures and bursts through the local agent API.
- Use the `framebench` CLI for agent-friendly JSON output.
- Save full images, label crops, image statistics, notes, and burst summaries.

## Project Data

When a project is selected, FrameBench creates:

```text
<project>/
  .framebench/
    framebench.json
    labels.json
    agent-readme.md
    captures/
```

`agent-readme.md` is generated for coding agents working inside that project. It explains how to use the local API/CLI without mentioning any specific test project.

See [docs/storage-and-api.md](docs/storage-and-api.md) for the full storage and API reference.

## Development

This project currently uses Electron, React, Vite, and TypeScript.

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Run Electron:

```bash
npm start
```

Run focused tests after a build:

```bash
npm run build
npm test
```

Run the Phase 3 release check:

```bash
npm run release:check
```

In this local workspace, if `npm` is not on `PATH`, use the bundled Node/npm runtime already used by Codex.

## CLI

The repository wrapper is:

```bash
./bin/framebench
```

Examples:

```bash
./bin/framebench status --json
./bin/framebench labels --json
./bin/framebench capture --title "status LED check" --json
./bin/framebench burst --title "fade check" --label status_led --count 12 --interval 150 --json
./bin/framebench note <capture-or-burst-id> "Observed status LED brightness change."
```

Run command-specific help:

```bash
./bin/framebench burst --help
```

## Architecture

The short version:

- `app/main/`: Electron main process, project files, capture storage, local HTTP API.
- `app/preload/`: safe bridge exposed to the renderer as `window.framebench`.
- `app/renderer/`: React UI, camera preview, label editing, human capture controls.
- `shared/`: TypeScript types and pure logic shared by app surfaces.
- `cli/`: agent-facing command-line client.
- `bin/`: wrapper that prefers a bundled local Node runtime when available.

See [docs/architecture.md](docs/architecture.md) for the maintainability notes.

## Packaging

Regenerate app icons from `logo.png`:

```bash
npm run icons
```

Build an unpacked app:

```bash
npm run package
```

Build configured distributables:

```bash
npm run dist
```

See [docs/distribution.md](docs/distribution.md) for platform notes and release metadata.

## Release Checks

Before a release, run the checklist in [docs/release-smoke-test.md](docs/release-smoke-test.md).
