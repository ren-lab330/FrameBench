# Architecture

FrameBench is split into five surfaces: Electron main, preload bridge, React renderer, shared code, and CLI.

## Main Process

Location: `app/main/`

Responsibilities:

- Owns project selection and `.framebench/` initialization.
- Reads and writes project config, labels, captures, burst metadata, and notes.
- Runs the local agent HTTP API on `127.0.0.1`.
- Sends capture requests to the renderer when the API needs a camera frame.

Key files:

- `index.ts`: Electron window lifecycle and IPC handlers.
- `project.ts`: project folder state, config, generated `agent-readme.md`, labels.
- `captures.ts`: capture and burst storage, listing, notes, renaming.
- `agentServer.ts`: local HTTP API used by coding agents and the CLI.

Keep filesystem writes in the main process. The renderer should not know storage paths beyond what the API returns.

## Preload Bridge

Location: `app/preload/`

`index.ts` defines the typed bridge. `index.cjs` is the CommonJS file Electron loads at runtime and is copied into `dist/` by `scripts/copy-preload.mjs`.

When adding a renderer-visible IPC method, update both files:

- `app/preload/index.ts`
- `app/preload/index.cjs`

Then run `npm run build` to copy the CommonJS preload into `dist/`.

## Renderer

Location: `app/renderer/src/`

Responsibilities:

- Human UI and interaction state.
- Camera access through `navigator.mediaDevices`.
- Label drawing, moving, resizing, locking, deletion, and live crop preview.
- Building capture payloads from the video frame.
- Manual capture and manual burst controls.

Current structure:

- `App.tsx`: app shell, state orchestration, UI composition.
- `styles.css`: application styling.
- `lib/capture.ts`: canvas, crop, image stats, numeric helpers, file URL helper.

As the UI grows, prefer extracting components by workflow:

- `CameraStage`
- `LabelDock`
- `CaptureHistory`
- `Inspector`
- `CaptureReview`
- `BurstReview`

Avoid moving filesystem or HTTP server behavior into the renderer.

## Shared Code

Location: `shared/`

Responsibilities:

- Cross-surface TypeScript contracts.
- Pure logic that can be tested without Electron.

Key files:

- `types.ts`: API, storage, capture, burst, and project interfaces.
- `stats.ts`: burst summary calculation.
- `labels.ts`: label ID normalization, uniqueness, default label naming.

Shared files should stay free of Electron, DOM, and Node-specific side effects unless there is a strong reason.

## CLI

Location: `cli/` and `bin/`

`cli/framebench.mjs` talks to the local HTTP API. It should stay agent-friendly:

- `--json` output must be easy to parse.
- Errors should be concise.
- Command-specific `--help` should not perform an action.

`bin/framebench` is the executable wrapper. It prefers the bundled local Node runtime if present, then falls back to `node` on `PATH`.

## Data Flow

Single capture:

```text
CLI/API or human UI
  -> renderer builds SaveCaptureRequest from camera frame
  -> main saves capture folder
  -> main returns CaptureSummary
  -> UI/history/API/CLI consume summary paths and stats
```

Burst capture:

```text
CLI/API or human UI
  -> renderer builds multiple SaveCaptureRequest samples
  -> main saves grouped burst folder
  -> main computes/stores summary ranges
  -> UI/history/API/CLI consume BurstSummary
```

The renderer creates images and image stats because it owns the live camera frame. The main process owns persistence because it owns trusted filesystem access.

## Testing

Current focused tests live in `scripts/run-tests.mjs`.

The tests assume compiled shared output exists, so run:

```bash
npm run build
npm test
```

Near-term test additions should cover:

- Capture/burst metadata compatibility.
- CLI command help and JSON errors.
- Label ID normalization and uniqueness.
- Storage listing when incomplete capture folders exist.
