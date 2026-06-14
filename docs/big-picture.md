# Big Picture: Agentic Hardware Development Tool Suite

## Vision

The long-term vision is a local-first tool suite that lets coding agents work on physical hardware with a real feedback loop.

Today, coding agents are strong at editing firmware, software, configuration, and tests, but they are mostly blind once the work leaves the computer and reaches the bench. Hardware development still depends on a human watching LEDs, reading displays, pressing buttons, checking wiring, listening for motion, and deciding whether the physical device behaved as expected.

The goal of this tool suite is to give agents grounded, structured access to the hardware bench without turning the project into a giant lab automation platform. Each tool should expose one clear physical signal or control surface to the agent, in a way that is local, inspectable, and easy for a human engineer to supervise.

## Product Thesis

Agentic hardware development needs more than code execution. It needs bench awareness.

The useful abstraction is not "replace the engineer." It is:

1. The human sets up the bench.
2. The agent changes code or configuration.
3. Local tools expose physical evidence back to the agent.
4. The agent compares expected and observed behavior.
5. The agent records notes, adjusts its approach, or asks the human for help.

This creates a closed loop:

```text
code change -> hardware behavior -> local observation -> agent reasoning -> next code change
```

The suite should be built as small, composable tools rather than one monolithic app.

## Principles

- Local first: project data stays on the developer's machine and inside the relevant project when possible.
- Human supervised: the engineer owns the setup, labels, wiring, safety, and interpretation boundaries.
- Agent friendly: every tool should expose a simple CLI, local API, or MCP-compatible interface with structured output.
- Project scoped: observations, notes, and configuration should travel with the hardware/software project.
- Narrow tools: each tool should do one physical feedback job well.
- Honest uncertainty: tools should report evidence, not overclaim pass/fail truth.
- No unnecessary lab bloat: avoid becoming a full test executive, cloud platform, or broad instrument orchestration system too early.

## FrameBench

FrameBench is the first tool in this suite.

It gives coding agents visual access to the hardware bench through a local camera. The human selects a project folder, aims a USB camera at the hardware, and draws labeled regions such as:

- `status_led`
- `power_led`
- `display_area`
- `rgb_strip`
- `button_area`
- `board_overview`

The agent can then request captures, inspect full images or labeled crops, compare image statistics, take burst samples, and write notes back into the project.

## FrameBench Capabilities Today

FrameBench currently supports:

- Electron desktop app.
- Project-local `.framebench/` storage.
- USB camera preview.
- Rectangular visual labels.
- Label move, resize, rename, delete, undo-delete, and lock mode.
- Live crop preview for selected labels.
- Manual single captures.
- Manual burst captures with sample count, interval, and label selection.
- Agent-triggered captures through a local HTTP API.
- Agent-triggered burst captures through the same API.
- CLI wrapper for agent use.
- JSON output for CLI commands.
- Full image storage.
- Per-label crop image storage.
- Capture notes.
- Capture renaming.
- Burst grouping as a single capture history item.
- Burst animation in the human UI.
- Per-crop image statistics:
  - mean brightness
  - min/max brightness
  - contrast
  - saturated pixel ratio
  - mean RGB color
- Burst summaries:
  - brightness/color ranges
  - deltas over time
  - likely visual change heuristic
- Generated project-local `agent-readme.md`.
- macOS packaging with camera entitlement.
- Windows/Linux packaging configuration, pending native validation.

FrameBench is intentionally not a computer vision framework. It provides useful visual artifacts and basic statistics, then lets the agent reason over them. For project-specific interpretation, such as an RGB LED strip pattern or display content, the agent can inspect crops directly or write its own analysis code against the saved images.

## How FrameBench Fits The Suite

FrameBench covers the visual observation layer.

It answers questions like:

- Did the status LED turn on?
- Did the LED get brighter after firmware changed?
- Is the display showing different content?
- Did an RGB strip visibly change color?
- Is a motorized or mechanical part moving?
- Did a blinking/fading behavior happen over time?
- Is there visual evidence worth attaching to the agent's notes?

In the broader suite, FrameBench should sit beside other focused tools:

```text
FrameBench        visual inspection through camera captures
Serial tool       logs, REPLs, boot output, device console
Flash tool        firmware upload and board reset workflows
Power tool        USB relay, smart plug, or bench supply control
Signal tool       simple GPIO/logic-level observations
Human prompt tool explicit handoff points for unsafe/manual steps
Bench memory      project-local notes, observations, and setup metadata
```

Each tool should expose a local interface that agents can call without needing a cloud service or broad permissions.

## What FrameBench Proves

FrameBench proves that a useful agent-hardware feedback loop can be simple.

The first successful loop is:

1. Agent changes firmware.
2. Agent asks FrameBench for a capture.
3. FrameBench saves full image and labeled crops.
4. Agent inspects the crop and stats.
5. Agent writes a note about observed hardware state.

The second successful loop is temporal:

1. Agent changes firmware to create blinking, fading, or motion.
2. Agent asks FrameBench for a burst.
3. FrameBench captures multiple samples.
4. Agent reads aggregate brightness/color deltas.
5. Agent decides whether the hardware changed over time.

These loops are small, but they are the core of agentic hardware development: the agent can now ask the physical world what happened.

## Near-Term Direction

FrameBench should stay focused and reliable rather than expanding into a general lab platform.

Good next directions:

- Improve packaging and install flow across macOS, Windows, and Linux.
- Make the CLI easier to install or expose from the app.
- Add stronger release automation.
- Add more parser/storage compatibility tests.
- Improve project documentation generated for agents.
- Support optional project-specific analysis scripts without baking niche image processing into the core app.
- Explore MCP integration once the CLI/API contract is stable.

Things to avoid for now:

- Full pass/fail test runner.
- Cloud sync.
- Account system.
- Broad instrument control.
- Heavy built-in computer vision workflows.
- Project-specific assumptions in the core tool.

## Longer-Term Suite Ideas

The suite can grow one tool at a time.

Potential tools:

- Device serial monitor with agent-readable logs and command injection.
- Firmware flash helper with board profiles.
- USB power-cycle helper.
- GPIO or simple logic capture helper.
- Audio capture for buzzers, motors, relays, or alarms.
- HID/button actuator integration for simple physical interactions.
- Bench setup manifests that describe camera position, labels, serial ports, board type, and known caveats.
- Agent session reports that combine code changes, captures, logs, and notes.

The long-term opportunity is not just better tools. It is a new development loop where agents can operate on hardware projects with grounded evidence, while the human engineer remains in control of the bench.

FrameBench is the first piece of that loop.
