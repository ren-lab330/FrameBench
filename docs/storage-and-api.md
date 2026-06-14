# Storage, API, And CLI Reference

FrameBench stores project data inside the selected project folder:

```text
<project>/
  .framebench/
    framebench.json
    labels.json
    agent-readme.md
    captures/
      YYYY-MM-DD/
        <capture-id>/
        <burst-id>-burst/
```

## Project Config

File: `.framebench/framebench.json`

```json
{
  "schemaVersion": 1,
  "appName": "FrameBench",
  "lastCameraId": "camera-device-id",
  "labelLockEnabled": false,
  "createdAt": "2026-06-14T12:00:00.000Z",
  "updatedAt": "2026-06-14T12:10:00.000Z"
}
```

The config is project-local. It restores the preferred camera and whether labels were locked.

## Labels

File: `.framebench/labels.json`

Coordinates are normalized to the visible camera image:

- `x`, `y`: top-left corner, from `0` to `1`.
- `width`, `height`: normalized rectangle size.
- Crops are created from the full camera frame using those normalized coordinates.

```json
{
  "schemaVersion": 1,
  "labels": [
    {
      "id": "status_led",
      "name": "Status LED",
      "shape": "rect",
      "x": 0.62,
      "y": 0.38,
      "width": 0.08,
      "height": 0.06,
      "color": "#f2c14e",
      "description": "Main firmware status LED"
    }
  ]
}
```

Use label descriptions to tell the agent what to inspect. Descriptions can mention ambiguity, expected behavior, color, brightness, movement, or nearby objects.

## Capture Storage

Folder:

```text
.framebench/captures/YYYY-MM-DD/<capture-id>/
  capture.json
  full.jpg
  crops/
    <label-id>.jpg
  notes.md
```

`capture.json`:

```json
{
  "schemaVersion": 1,
  "kind": "capture",
  "id": "2026-06-14T12-34-56.000Z_status-led-check",
  "title": "status LED check",
  "createdAt": "2026-06-14T12:34:56.000Z",
  "source": "human",
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
    }
  ],
  "stats": {
    "full": {},
    "crops": {}
  },
  "tags": ["agent"]
}
```

Image stats include:

- `meanBrightness`
- `minBrightness`
- `maxBrightness`
- `contrast`
- `saturatedPixelRatio`
- `meanColor.r/g/b`

## Burst Storage

Folder:

```text
.framebench/captures/YYYY-MM-DD/<burst-id>-burst/
  burst.json
  notes.md
  samples/
    sample-001/
      capture.json
      full.jpg
      crops/
```

A burst is one grouped history item made of multiple capture samples.

`burst.json` includes:

- `kind: "burst"`
- `count`
- `intervalMs`
- `durationMs`
- `labels`
- `samples`
- `summary`
- `errors`
- `tags`

The burst summary reports min, max, and delta for brightness, saturation, contrast, and mean RGB per label. `likelyChanged` is a visual heuristic, not a pass/fail verdict.

Burst timing is best-effort visual sampling. It is useful for blinking, fading, motion, display changes, and transient states, but it is not a replacement for electrical timing tools.

## Local HTTP API

Default base URL:

```text
http://127.0.0.1:47611
```

If port `47611` is busy, the app chooses another local port and exposes it in project status.

Endpoints:

```text
GET  /api/status
GET  /api/project
GET  /api/labels
POST /api/captures
GET  /api/captures
GET  /api/captures/:id
PATCH /api/captures/:id
GET  /api/captures/:id/full
GET  /api/captures/:id/crops/:labelId
POST /api/captures/:id/notes
POST /api/bursts
GET  /api/bursts/:id
```

Create capture:

```bash
curl -X POST http://127.0.0.1:47611/api/captures \
  -H "Content-Type: application/json" \
  -d '{"title":"status LED check","tags":["agent"]}'
```

Create burst:

```bash
curl -X POST http://127.0.0.1:47611/api/bursts \
  -H "Content-Type: application/json" \
  -d '{"title":"fade check","labels":["status_led"],"count":12,"intervalMs":150,"tags":["agent"]}'
```

Add notes to a capture or burst:

```bash
curl -X POST http://127.0.0.1:47611/api/captures/<id>/notes \
  -H "Content-Type: application/json" \
  -d '{"note":"The labeled area became brighter during the burst."}'
```

## CLI

Wrapper:

```bash
./bin/framebench
```

Commands:

```text
status
project
labels
capture
burst
captures
full
stats
compare
crop
note
rename
```

Examples:

```bash
./bin/framebench status --json
./bin/framebench capture --title "status LED check" --tag agent --json
./bin/framebench burst --title "fade check" --label status_led --count 12 --interval 150 --json
./bin/framebench stats <capture-id> status_led --json
./bin/framebench compare <before-id> <after-id> status_led --json
./bin/framebench note <capture-or-burst-id> "Observed brightness increase."
```

Use `--json` for agent consumption.

Command-specific help:

```bash
./bin/framebench burst --help
```

## Agent Guidance

Prefer crops for small hardware details. Use the full image for context.

Crops can be noisy, tight, overexposed, or ambiguous. If the visual state is unclear, describe uncertainty and use statistics or comparisons:

- brightness changed
- color shifted
- saturation increased
- movement or display content changed
- evidence is ambiguous

Do not overuse bursts for static checks. Use bursts when time variation matters.
