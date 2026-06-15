# Native Camera Controls Prototype

This is a working macOS prototype for USB camera controls that are not exposed by Electron/Chromium `MediaStreamTrack.getCapabilities()`.

## Result

The browser camera API only exposed basic stream controls on the tested USB camera:

- width
- height
- aspect ratio
- frame rate
- resize mode

Native AVFoundation is not enough on macOS for this feature. The exposure and focus APIs that look useful are unavailable on macOS.

The working path is lower-level UVC control access through IOKit. The prototype uses `uvc-util` outside the repo and calls it from:

```bash
node scripts/probe-camera-controls.mjs
```

## Tested Camera

```text
Device: USB Camera
Vendor/Product: 0x1bcf:0x28c4
UVC version: 1.00
```

Readable controls included:

- brightness
- contrast
- saturation
- hue
- gamma
- sharpness
- white-balance-temp
- auto-white-balance-temp
- exposure-time-abs
- auto-exposure-mode
- focus-abs
- auto-focus
- backlight-compensation
- power-line-frequency

## Write Tests

Brightness write worked and was reversible:

```text
brightness: 0 -> 1 -> 0
```

Exposure time write required manual exposure mode:

```text
auto-exposure-mode: 8 -> 1 -> 8
exposure-time-abs: 166 -> 167 -> 166
```

Direct `exposure-time-abs` writes while auto exposure was enabled failed, which is expected for many UVC cameras.

## Prototype Commands

Build `uvc-util` outside this repo:

```bash
git clone https://github.com/jtfrey/uvc-util.git /tmp/framebench-uvc-util
cd /tmp/framebench-uvc-util
xcodebuild -project uvc-util.xcodeproj -configuration Release build
```

Run the probe:

```bash
node scripts/probe-camera-controls.mjs list
node scripts/probe-camera-controls.mjs controls --index 0
node scripts/probe-camera-controls.mjs show --index 0
node scripts/probe-camera-controls.mjs get --index 0 --control brightness
node scripts/probe-camera-controls.mjs set --index 0 --control brightness --value 1
```

If the helper lives somewhere else:

```bash
FRAMEBENCH_UVC_UTIL=/path/to/uvc-util node scripts/probe-camera-controls.mjs show --index 0
```

## Integration Notes

This is feasible, but it should be treated as an optional native backend, not a guaranteed cross-platform camera feature.

Likely production shape:

- Keep browser camera preview/capture as the default path.
- Add a native camera-control service per platform.
- Use UVC controls where supported and show only controls actually reported by the connected camera.
- On macOS, use an embedded helper or native addon based on the `uvc-util`/IOKit approach.
- On Linux, use V4L2 controls.
- On Windows, use DirectShow/Media Foundation camera properties.

The FrameBench UI should preserve camera presets per project, but the agent-facing API should expose camera controls conservatively because support varies by camera and operating system.
