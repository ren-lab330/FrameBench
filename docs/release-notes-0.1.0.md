# FrameBench 0.1.0 Release Notes

FrameBench 0.1.0 is the first internal release candidate for agent-assisted hardware visual inspection.

## Included

- Electron desktop app with USB camera preview.
- Project-local `.framebench/` storage.
- Rectangular labels with crop previews, lock mode, deletion, and undo.
- Manual captures with full image, crops, stats, rename, and notes.
- Manual burst captures with count, interval, and label summary controls.
- Local HTTP API for coding agents.
- `framebench` CLI wrapper with JSON output.
- Capture and burst brightness/color summary stats.
- Generated project-local `agent-readme.md`.
- macOS, Windows, and Linux packaging configuration.
- App icon assets generated from `logo.png`.

## macOS Artifacts Built Locally

```text
release/FrameBench-0.1.0-mac-x64.dmg
release/FrameBench-0.1.0-mac-x64.zip
```

SHA-256:

```text
37bed2464062739fee58f45eb66b1cb05f1552ac2f1c334289b70d9e965a5da8  FrameBench-0.1.0-mac-x64.dmg
d8cdcbe8ec6ad55dc27937e6caaa6bd1ee65aa08213f9c49fbb18e1bbfe14a8a  FrameBench-0.1.0-mac-x64.zip
```

## Verification

- `npm run release:check` passed.
- `npm run package` passed.
- `npm run dist -- --mac` passed.
- `codesign --verify --deep --strict --verbose=2 release/mac/FrameBench.app` passed.
- Main app and renderer helper include `com.apple.security.device.camera`.
- Main app `Info.plist` includes `NSCameraUsageDescription`.

## Known Gaps

- macOS notarization is not configured yet.
- Windows and Linux targets are configured but still need native-platform validation.
- The CLI is still a repository wrapper, not a standalone installed binary.
- Tests are focused smoke/regression checks, not a full app automation suite.

## Recommended First Handoff

Use this release with a local project and a same-machine coding agent. Give the agent:

- the project path,
- the absolute `bin/framebench` path,
- the generated `.framebench/agent-readme.md`,
- a concrete hardware visual task.
