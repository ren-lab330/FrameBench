# FrameBench From-Scratch Project Brief

This document is written for a coding agent starting from zero. Do not assume any previous Hardware Observer prototype, architecture, data model, or UI exists. Build the simplest useful version of this idea.

## Product Summary

FrameBench is a local desktop tool that helps AI coding agents visually inspect hardware on a bench.

The human uses FrameBench to choose a project folder, aim a camera at the hardware, and define named visual regions such as `status_led`, `power_led`, `display_area`, or `board_overview`.

The AI agent uses FrameBench to take captures on demand, inspect the full image or labeled crops, decide whether the hardware looks correct, and recapture when needed.

The core loop is:

1. Human sets up camera view and labels.
2. Agent changes firmware/software/hardware behavior.
3. Agent asks FrameBench to capture current hardware state.
4. FrameBench saves a full image and label-specific crops.
5. Agent inspects the relevant crop instead of a noisy full bench image.
6. Agent decides whether the result matches expectations.
7. Agent may capture again, leave notes, or ask the human to adjust the setup.

The point is not manual photography. The point is closing the loop for an AI coding agent working on physical hardware.

## Hard Scope

Build only a camera capture and labeling tool.

Do not build:

- Serial logging.
- Logic analyzer support.
- Oscilloscope support.
- Multimeter support.
- Recipe runner.
- Pass/fail automation framework.
- Global project database.
- Cloud sync.
- Account system.
- Broad lab orchestration.

Those may be separate future projects. They are out of scope for the first FrameBench.

## App Model

FrameBench is self-contained, but project data lives inside the selected project folder.

On app startup:

1. Show a project folder picker.
2. User selects a firmware/hardware project folder.
3. FrameBench looks for a project-local FrameBench folder.
4. If found, restore saved state.
5. If not found, start with an empty setup.

The project folder owns its own FrameBench data. A user should be able to zip a project folder, move it to another machine, and keep its capture history and labels.

## Project-Local Storage

Use a hidden folder inside the selected project:

```text
<selected-project>/
  .framebench/
    framebench.json
    labels.json
    agent-readme.md
    captures/
      2026-06-13/
        2026-06-13T14-22-11.430Z_led-test/
          capture.json
          full.jpg
          crops/
            status_led.jpg
            board_overview.jpg
          notes.md
```

Do not store capture content in the app install folder. Do not require a central project registry.

## Core Files

`framebench.json`:

```json
{
  "schemaVersion": 1,
  "appName": "FrameBench",
  "lastCameraId": "USB Camera",
  "createdAt": "2026-06-13T14:00:00.000Z",
  "updatedAt": "2026-06-13T14:00:00.000Z"
}
```

`labels.json`:

```json
{
  "schemaVersion": 1,
  "labels": [
    {
      "id": "status_led",
      "name": "Status LED",
      "shape": "rect",
      "x": 0.64,
      "y": 0.38,
      "width": 0.06,
      "height": 0.05,
      "color": "#f2c14e",
      "description": "Main firmware status LED"
    }
  ]
}
```

Each capture folder contains:

- `full.jpg`: complete camera image.
- `capture.json`: timestamp, camera info, labels, crop paths.
- `crops/*.jpg`: one crop per active label.
- `notes.md`: optional human or agent notes.

`capture.json`:

```json
{
  "schemaVersion": 1,
  "id": "2026-06-13T14-22-11.430Z_led-test",
  "title": "LED test",
  "createdAt": "2026-06-13T14:22:11.430Z",
  "source": "agent",
  "camera": {
    "name": "USB Camera",
    "width": 1920,
    "height": 1080
  },
  "fullImage": "full.jpg",
  "labels": [
    {
      "id": "status_led",
      "name": "Status LED",
      "crop": "crops/status_led.jpg"
    },
    {
      "id": "board_overview",
      "name": "Board Overview",
      "crop": "crops/board_overview.jpg"
    }
  ],
  "tags": ["blink", "firmware-check"]
}
```

## Agent Readme

Whenever FrameBench initializes a project, write:

```text
<selected-project>/.framebench/agent-readme.md
```

This file explains how a coding agent can use the tool. It should be short, concrete, and project-local.

Example content:

```markdown
# FrameBench Agent Instructions

This project uses FrameBench for visual hardware inspection.

FrameBench stores captures in:

`.framebench/captures/`

Labels are defined in:

`.framebench/labels.json`

When you need to inspect hardware state, request a new capture through the FrameBench local tool/API. After capture, inspect the relevant crop first.

Common crop paths:

- `crops/status_led.jpg`
- `crops/board_overview.jpg`

Prefer cropped label images when checking small visual details. Use `full.jpg` only for context.

After inspecting, write a short note in the capture's `notes.md` if your conclusion matters for the task.
```

The exact tool/API can be filled in by the implementation, but the readme must always exist.

## Agent Interface

The app needs an agent-facing interface from the beginning. It can be a local HTTP API, local CLI, MCP server, or a combination. The first implementation should keep it simple.

Required agent actions:

- Get current project status.
- List labels.
- Capture image.
- List recent captures.
- Get capture metadata.
- Get path to full image.
- Get path to a crop by label id.
- Add a note to a capture.

Suggested minimal local API:

```text
GET  /api/status
GET  /api/project
GET  /api/labels
POST /api/captures
GET  /api/captures
GET  /api/captures/:captureId
GET  /api/captures/:captureId/full
GET  /api/captures/:captureId/crops/:labelId
POST /api/captures/:captureId/notes
```

Suggested CLI:

```bash
framebench status
framebench labels
framebench capture --title "after uploading blink firmware"
framebench captures
framebench crop <capture-id> status_led
framebench note <capture-id> "Status LED appears on."
```

The agent should not need to click the UI to capture. The UI is for human setup and review.

## Human Workflow

The human workflow is setup-oriented:

1. Launch FrameBench.
2. Choose project folder.
3. Confirm or select camera.
4. Position the hardware under the camera.
5. Create labels on the live view.
6. Adjust labels until crops isolate useful visual details.
7. Leave the app running so the agent can request captures.
8. Review captures and notes when needed.

The human may manually capture for testing, but manual capture is secondary.

## Agent Workflow

The agent workflow is task-oriented:

1. Read `.framebench/agent-readme.md`.
2. Query FrameBench status.
3. List labels to understand available views.
4. Perform coding or firmware change.
5. Ask FrameBench to capture.
6. Inspect the relevant crop path.
7. If the crop is ambiguous, inspect `full.jpg`.
8. Recapture if timing or focus was wrong.
9. Write a note describing what was observed.
10. Continue coding based on the observed result.

Example:

```text
Agent changes Arduino blink interval.
Agent uploads firmware.
Agent calls framebench capture --title "blink interval after upload".
FrameBench saves full image and crops/status_led.jpg.
Agent inspects crops/status_led.jpg.
Agent concludes whether the LED state matches expectation.
Agent writes notes.md.
```

## UI Direction

The UI must be designed first, not bolted onto the data model later.

FrameBench should feel like a focused visual workspace:

- The camera view is the main object.
- Labels are manipulated directly on the image.
- Capture history is visual, not table-first.
- Agent readiness is visible but quiet.
- The UI should never require manual refresh.
- The selected project folder should always be visible.
- The current app revision should always be visible.

Visual language:

- Dark, modern, calm.
- Minimal chrome.
- Strong canvas-first layout.
- Subtle side panels.
- Clear selected states.
- Crisp label outlines and handles.
- Thumbnails for captures and crops.
- One obvious primary action for manual testing: **Capture**.

Avoid:

- Dashboard clutter.
- Dense tables as the primary view.
- Marketing hero pages.
- Abstract cards that hide the camera workflow.
- Overly colorful gradients.
- Exposing implementation concepts like "runs", "recipes", "timelines", or "instruments".

## UI Inspiration

Use these as references for interaction qualities, not as designs to copy:

- [Raycast](https://www.raycast.com/): fast command/action feel, keyboard-first clarity, low-friction workflows.
- [Linear preferences/interface docs](https://linear.app/docs/account-preferences): restrained theme controls and polished dark-mode productivity UI.
- [Figma](https://www.figma.com/): direct canvas manipulation, selection outlines, handles, side inspector patterns.
- [Figma UI design tool](https://www.figma.com/ui-design-tool/): collaborative/design-workspace vocabulary and clear handoff mentality.
- [Screen Studio](https://screen.studio/): capture-first product language, minimal controls around visual recording.

FrameBench is not a design tool, project manager, or screen recorder. Borrow the clarity:

- Raycast: commands should be fast.
- Linear: surfaces should feel quiet and readable.
- Figma: labels should feel directly editable on the image.
- Screen Studio: capture controls should be simple and confident.

## Proposed Layout

```text
+--------------------------------------------------------------------------------+
| FrameBench                   /path/to/project                  Agent Ready      |
+----------------------+---------------------------------------------------------+
| Project              |                                                         |
| my-firmware          |                 Live Camera View                        |
|                      |                                                         |
| Agent Access         |          [label rectangles over camera image]           |
| Running locally      |                                                         |
|                      |                                                         |
| Captures             |                                                         |
| Today                |                                                         |
| - LED after upload   |                                                         |
| - Boot state         |                                                         |
+----------------------+-------------------------------------+-------------------+
| Labels                                                     | Inspector         |
| status_led   power_led   board_overview                    | Selected label    |
|                                                             | name/id/x/y/w/h   |
+--------------------------------------------------------------------------------+
```

## Key Screens

### Project Picker

Purpose: choose the project where `.framebench/` will live.

Elements:

- FrameBench name.
- **Choose Project Folder** button.
- Recent projects list, if available.
- Short statement: "FrameBench stores captures inside the selected project."

### Setup Workspace

Purpose: human defines stable camera views for the agent.

Elements:

- Large live camera preview.
- Label creation tool.
- Label list.
- Selected label inspector.
- Agent status: running/not running, local API address, last capture.
- Manual capture button for testing.

### Capture Review

Purpose: human reviews what the agent captured.

Elements:

- Capture list with thumbnails.
- Full image preview.
- Crop thumbnail grid.
- Notes panel.
- Reveal folder button.
- Copy agent path button.

## Label Behavior

V1 labels are rectangles only.

Required interactions:

- Draw new rectangle.
- Move rectangle.
- Resize rectangle.
- Rename label.
- Edit label id.
- Delete label.
- See crop preview before capture if possible.

Label ids should be filesystem-safe and agent-friendly:

- Lowercase.
- Numbers allowed.
- Underscores or hyphens allowed.
- No spaces.

Good examples:

- `status_led`
- `power_led`
- `boot_button`
- `usb_connector`
- `display_area`
- `board_overview`

Bad examples:

- `thing`
- `LED!!!`
- `the little light near the left of the board`

## Capture Behavior

When an agent or human triggers capture:

1. Acquire one full-resolution image.
2. Save `full.jpg`.
3. For every active label, crop the corresponding region.
4. Save crops under `crops/<label-id>.jpg`.
5. Write `capture.json`.
6. Create or update `notes.md`.
7. Update UI immediately.
8. Return paths to the caller.

Capture response example:

```json
{
  "captureId": "2026-06-13T14-22-11.430Z_led-test",
  "folder": "/project/.framebench/captures/2026-06-13/2026-06-13T14-22-11.430Z_led-test",
  "fullImage": "full.jpg",
  "crops": {
    "status_led": "crops/status_led.jpg",
    "board_overview": "crops/board_overview.jpg"
  }
}
```

## Implementation Recommendation

Use a local desktop app with:

- Electron main process for filesystem access and folder picking.
- Browser renderer for camera preview and label editing.
- Local service or main-process API for agent access.
- Project-local storage in `.framebench/`.

Keep the app small:

```text
framebench/
  app/
    main/
    renderer/
  camera/
  storage/
  agent/
  docs/
```

Do not start with a database. JSON files and image folders are enough.

## Quality Bar

The first version is successful only if:

- The human can set up labels without confusion.
- The agent can trigger a capture without using the UI.
- Crops are generated reliably.
- The agent can find the relevant crop quickly.
- The project folder remains clean and understandable.
- Restarting the app restores the selected project's labels and history.
- No user action requires pressing Refresh.
- The UI always shows whether the agent capture service is ready.

## Acceptance Test

Use an Arduino Nano or similar board under a USB camera.

Human setup:

1. Open FrameBench.
2. Select the firmware project folder.
3. Create labels:
   - `board_overview`
   - `status_led`
4. Confirm crop previews look useful.

Agent task:

1. Read `.framebench/agent-readme.md`.
2. Build/upload a blink sketch or firmware change.
3. Trigger a FrameBench capture.
4. Inspect `crops/status_led.jpg`.
5. Decide whether the visible LED state supports the expected behavior.
6. If unclear, recapture.
7. Write a short note to the capture.

Human review:

1. Open capture history.
2. See the full image and crops.
3. Read the agent's note.
4. Reveal the capture folder and confirm files are organized.

## Open Decisions

- Should the local agent interface be HTTP first, CLI first, or MCP first?
- Should the app auto-open the last project or always ask?
- Should capture folders include milliseconds in the folder name?
- Should crop output be JPEG or PNG by default?
- Should there be a small global recent-projects file outside project folders?
- Should label colors be automatic or user-selected?

## First Build Plan

1. Build a static UI prototype with fake camera/capture data.
2. Validate layout and label-editing interaction.
3. Add project folder selection.
4. Add `.framebench/` storage.
5. Add live camera preview.
6. Add label persistence.
7. Add capture and crop generation.
8. Add agent API/CLI.
9. Write project-local `agent-readme.md`.
10. Test the full agent loop on a real board.

Do not implement future instrument features until this loop is excellent.
