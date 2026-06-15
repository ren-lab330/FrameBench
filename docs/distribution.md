# Distribution

Phase 3 turns the working developer app into something that can be packaged and handed to another machine.

## Icon Source

Source artwork:

```text
logo.png
```

Generated assets:

```text
build/icon.png
build/icon.icns
build/icon.ico
app/renderer/public/icon.png
```

Regenerate icons:

```bash
npm run icons
```

The generator uses macOS `sips` and `iconutil`, so it should be run on macOS when regenerating `.icns`.

## Release Checks

Run:

```bash
npm run release:check
```

This regenerates icons, builds the app, and runs focused tests without recursively calling `npm` inside the script.

## Directory Package

Build an unpacked app for local inspection:

```bash
npm run package
```

Output goes to:

```text
release/
```

## Installer/Archive Builds

Build configured distributables:

```bash
npm run dist
```

Build one platform explicitly:

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Configured targets:

- macOS: `dmg`, `zip`
- Windows: `nsis`, `portable`
- Linux: `AppImage`, `deb`

Cross-platform note: electron-builder can prepare some targets from macOS, but reliable Windows and Linux release validation should happen on those platforms before calling it official.

macOS notarization note: signing can succeed locally without notarization. Public macOS distribution should add notarization credentials/options and verify Gatekeeper behavior on a clean machine.

## App Metadata

Current release metadata lives in `package.json`:

- `name`: `framebench`
- `version`: `0.1.1`
- `productName`: `FrameBench`
- `appId`: `app.framebench.desktop`
- `artifactName`: `${productName}-${version}-${os}-${arch}.${ext}`

## Native Camera Controls

FrameBench 0.1.1 bundles a macOS UVC helper at:

```text
resources/native/macos/uvc-util
```

The helper is copied into packaged apps as an Electron `extraResource`, so it remains executable outside `app.asar`. The helper is MIT-licensed; its license is included beside the binary.

Current backend status:

- macOS: UVC controls through the bundled helper.
- Linux: backend not implemented yet; V4L2 is the expected path.
- Windows: backend not implemented yet; DirectShow or Media Foundation is the expected path.

## CLI Distribution

The repository wrapper is:

```text
bin/framebench
```

It prefers the bundled Codex runtime path when present and falls back to `node` on `PATH`.

For a broader release, the remaining decision is whether to distribute the CLI as:

- a repo-local wrapper users call by absolute path,
- an installer-created PATH entry,
- a standalone packaged binary.

For the first official internal release, the repo-local wrapper is enough if the agent is given the absolute path.

## Manual Validation

After packaging, run the checklist in:

```text
docs/release-smoke-test.md
```

At minimum, verify:

- App launches.
- Icon appears in the Dock/taskbar/app bundle.
- Project selection works.
- Camera preview works.
- Manual capture and manual burst work.
- CLI can reach the running app.
- Generated `.framebench/agent-readme.md` is correct for a fresh project.
