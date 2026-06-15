# FrameBench 0.1.1 Release Notes

FrameBench 0.1.1 adds native USB camera controls for macOS UVC cameras.

## Included

- Native camera-control panel in the human app.
- macOS UVC helper bundled as an Electron extra resource.
- Supported controls are detected per camera and shown only when reported by the device.
- Exposure-time, focus, and white-balance adjustments automatically switch the related auto mode off before writing manual values.
- Browser/Electron camera capture remains the default preview and image-acquisition path.

## Platform Notes

- macOS: native UVC controls are implemented.
- Windows: native camera controls are not implemented yet.
- Linux: native camera controls are not implemented yet.

## Verification

- `npm run build` passed.
- `npm test` passed.
- `npm run package` passed.
- Packaged macOS app includes the bundled UVC helper under `Contents/Resources/native/macos/`.
- Native controls were manually tested with a USB UVC camera on macOS.

## Known Gaps

- Camera-control support still varies by camera model and firmware.
- Windows and Linux camera-control backends remain future work.
- macOS notarization is still not configured.
