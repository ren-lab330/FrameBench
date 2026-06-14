# Release Smoke Test

Run this before a release build or before handing FrameBench to another agent/user.

## Build And Tests

```bash
npm run release:check
```

If this workspace does not have `npm` on `PATH`, use the bundled Node/npm runtime available to the local Codex environment.

Confirm generated icon assets exist:

```text
build/icon.png
build/icon.icns
build/icon.ico
app/renderer/public/icon.png
```

Confirm macOS camera privacy metadata on packaged builds:

```bash
plutil -p release/mac/FrameBench.app/Contents/Info.plist | rg NSCameraUsageDescription
codesign -d --entitlements :- release/mac/FrameBench.app 2>/dev/null | rg com.apple.security.device.camera
codesign -d --entitlements :- "release/mac/FrameBench.app/Contents/Frameworks/FrameBench Helper (Renderer).app" 2>/dev/null | rg com.apple.security.device.camera
```

## App Launch

1. Launch Electron.
2. Confirm the app/window icon is visible where the platform shows it.
3. Select an existing project folder.
4. Confirm the saved camera selection restores.
5. Confirm the saved label lock state restores.
6. Switch project and cancel the dialog. The app should remain in the current project.

## Camera And Labels

1. Confirm the camera preview is not black.
2. Draw a label with a short drag.
3. Confirm a click without drag does not create a tiny label.
4. Resize the label from a corner.
5. Type into label name, label ID, and description fields.
6. Lock labels and confirm labels can be selected but not moved, resized, deleted, or created.
7. Unlock labels, delete one with Delete/Backspace, then undo with Cmd+Z or Ctrl+Z.

## Manual Capture

1. Click `Capture`.
2. Confirm one capture appears in the left history list.
3. Open it and confirm the full image and crops are visible.
4. Rename the capture.
5. Add notes and confirm they save.
6. Click the active capture again or Back to Inspector to return to label inspection.

## Manual Burst

1. Open the `Burst` menu.
2. Run a short burst, such as count `4` and interval `150`.
3. Confirm one grouped burst appears in history.
4. Open it and confirm the animation advances.
5. Confirm cropped burst previews and summary stats are visible.

## CLI/API

With the app running and a project selected:

```bash
./bin/framebench status --json
./bin/framebench labels --json
./bin/framebench capture --title "release smoke capture" --json
./bin/framebench burst --title "release smoke burst" --count 4 --interval 150 --json
./bin/framebench burst --help
```

`burst --help` must print help only and must not create a burst.

## Project Files

Inspect the selected project:

```text
.framebench/
  framebench.json
  labels.json
  agent-readme.md
  captures/
```

Confirm new captures and bursts have metadata, images, crops, and `notes.md`.

## Agent Handoff

Give an agent:

- The project path.
- The FrameBench CLI path, usually `./bin/framebench` or an absolute path.
- The generated `.framebench/agent-readme.md`.
- A concrete hardware task and what visual evidence is expected.

Ask the agent to capture, inspect a crop or burst summary, and write notes.
