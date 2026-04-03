<p align="center">
  <img src="rune-logo.png" width="180" />
</p>

<h1 align="center">Rune</h1>

<p align="center">
  <strong>File-based AI Agent Harness for Claude Code</strong><br/>
  Drop a <code>.rune</code> file in any folder. Run it headlessly, chain agents, or open the desktop UI.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/powered_by-Claude_Code-blueviolet" alt="Claude Code" />
  <img src="https://img.shields.io/badge/platform-macOS-blue" alt="platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
</p>

---

## What is Rune?

Rune is a file-based agent harness for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Each `.rune` file is an independent AI agent with its own role, memory, and context. Run it from the CLI, chain agents together, automate with triggers, or open the desktop UI.

- **File-based** — One `.rune` file = one agent. Move it, share it, version it with git.
- **Headless execution** — Run agents from the CLI or scripts. No GUI needed.
- **Agent chaining** — Pipe agents together in a pipeline. Output → input, automatically.
- **Automated triggers** — Run agents on file changes, git commits, or a cron schedule.
- **Node.js API** — Use agents programmatically with `require('openrune')`.
- **Desktop UI** — Chat interface with real-time activity monitoring and built-in terminal.

---

## Why Rune?

Building a Claude Code harness usually means wiring up process management, I/O parsing, state handling, and a UI from scratch. Rune lets you skip all of that — just drop a file and go.

**No harness boilerplate** — No SDK wiring, no process management, no custom I/O parsing. One `.rune` file gives you a fully working agent you can run from CLI, scripts, or the desktop UI.

**Persistent context** — Role, memory, and chat history live in the `.rune` file. Close the app, reopen it next week — the agent picks up right where you left off.

**Portable & shareable** — The `.rune` file is just JSON. Commit it to git, share it with teammates, or move it to another machine. The agent goes wherever the file goes.

**Multiple agents per project** — A reviewer, a backend dev, a designer — each with its own role and history, working side by side in the same folder.

**Scriptable** — Chain agents, set up triggers, or call agents from your own code via the Node.js API. One file format, multiple ways to use it.

<p align="center">
  <img src="demo.gif" width="100%" alt="Rune demo" />
</p>

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`

### 1. Install

```bash
npm install -g openrune
```

### 2. Create your first agent

```bash
cd ~/my-project
rune new myagent
```

Or right-click any folder in Finder → Quick Actions → **New Rune**

<p align="center">
  <img src="Screenshot.png" width="500" alt="Right-click to create a Rune agent" />
</p>

### 3. Use it

**Desktop UI** — Double-click the `.rune` file, or:

```bash
rune open myagent.rune
```

**Headless** — Run from the CLI without a GUI:

```bash
rune run myagent.rune "Explain this project's architecture"
```

---

## Features

### Harness

- **Headless execution** — `rune run` lets you run agents from the CLI, scripts, or CI/CD. No GUI needed.
- **Agent chaining** — `rune pipe` connects agents in sequence. Each agent's output feeds into the next.
- **Automated triggers** — `rune watch` runs agents on file changes, git commits, or a cron schedule.
- **Node.js API** — `require('openrune')` to use agents programmatically in your own code.
- **Persistent context** — Role, memory, and chat history are saved in the `.rune` file across sessions.

### Desktop UI

- **Chat interface** — Markdown rendering, file attachment, stream cancellation.
- **Real-time activity** — See every tool call, result, and permission request as it happens via [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks).
- **Built-in terminal** — Raw Claude Code output and your own commands, side by side.

### Agent Roles

```bash
# General assistant
rune new assistant

# Specialized agents
rune new designer --role "UI/UX design expert"
rune new backend --role "Backend developer, Node.js specialist"
rune new reviewer --role "Code reviewer, focused on security and performance"
```

### The `.rune` File

A `.rune` file is just JSON:

```json
{
  "name": "myagent",
  "role": "General assistant",
  "icon": "bot",
  "createdAt": "2025-01-01T00:00:00Z",
  "history": []
}
```

Edit the `role` field anytime to change the agent's behavior.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `rune install` | Build app, register file association, install Quick Action |
| `rune new <name>` | Create a `.rune` file in the current directory |
| `rune new <name> --role "..."` | Create with a custom role |
| `rune open <file.rune>` | Open a `.rune` file (desktop GUI) |
| `rune run <file.rune> "prompt"` | Run agent headlessly (no GUI) |
| `rune pipe <a.rune> <b.rune> "prompt"` | Chain agents in a pipeline |
| `rune watch <file.rune> --on <event>` | Set up automated triggers |
| `rune list` | List `.rune` files in the current directory |
| `rune uninstall` | Remove Rune integration (keeps your `.rune` files) |

---

## Harness Mode

Rune isn't just a desktop app — it's a full agent harness. Use it from scripts, CI/CD, or your own tools.

### Headless execution

Run any `.rune` agent from the command line without opening the GUI:

```bash
rune run reviewer.rune "Review the latest commit"

# Pipe input from other commands
git diff | rune run reviewer.rune "Review this diff"

# JSON output for scripting
rune run reviewer.rune "Review src/auth.ts" --output json
```

### Agent chaining

Chain multiple agents into a pipeline. The output of each agent becomes the input for the next:

```bash
rune pipe coder.rune reviewer.rune tester.rune "Implement a login page"
```

This runs: coder writes the code → reviewer reviews it → tester writes tests.

### Automated triggers

Set agents to run automatically on events:

```bash
# Run on every git commit
rune watch reviewer.rune --on git-commit --prompt "Review this commit"

# Watch for file changes
rune watch linter.rune --on file-change --glob "src/**/*.ts" --prompt "Check for issues"

# Run on a schedule
rune watch monitor.rune --on cron --interval 5m --prompt "Check server health"
```

### Node.js API

Use Rune agents programmatically in your own code:

```js
const rune = require('openrune')

const reviewer = rune.load('reviewer.rune')
const result = await reviewer.send('Review the latest commit')
console.log(result)

// Agent chaining via API
const { finalOutput } = await rune.pipe(
  ['coder.rune', 'reviewer.rune'],
  'Implement a login page'
)
```

---

## Architecture

```
                    ┌─────────────────────────┐
                    │      Desktop UI Mode     │
                    │   User ↔ Chat UI (React) │
                    │         ↕ IPC            │
                    │   Electron Main Process  │
                    │         ↕ HTTP + SSE     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │  MCP Channel             │     Claude Code Hooks
                    │  (rune-channel)          │      ↕ HTTP POST
                    │         ↕ MCP            │←──── rune-channel /hook
                    └────────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │     Claude Code CLI      │
                    └─────────────────────────┘

   Harness Mode (rune run / pipe / watch):
     CLI → Claude Code CLI (-p) → stdout
     No MCP channel, no Electron — direct execution
```

**Two modes of operation:**

1. **Desktop UI** — Chat input → MCP channel → Claude Code, with hooks for real-time activity monitoring.
2. **Harness** — Direct CLI execution via `claude -p`. Agents run headlessly with context from the `.rune` file.

---

## Development

### Setup

```bash
git clone https://github.com/gilhyun/Rune.git
cd Rune
npm install
```

### Build & Run

```bash
# Build and launch
npm start

# Build only
npm run build
```

### Project Structure

```
Rune/
  bin/rune.js              # CLI (install, new, open, run, pipe, watch, list)
  lib/index.js             # Node.js API (require('openrune'))
  src/
    main.ts                # Electron main process
    preload.ts             # Preload bridge (IPC security)
  channel/
    rune-channel.ts        # MCP channel + hooks HTTP endpoint
  renderer/
    src/
      App.tsx              # Root React component
      features/
        chat/              # Chat UI (input, messages, activity blocks)
        terminal/          # Built-in terminal (xterm.js + node-pty)
      hooks/               # IPC hooks
      lib/                 # Utilities
```

### Hooks Configuration

Rune automatically sets up Claude Code hooks in `~/.claude/settings.json`. The hooks only fire when `RUNE_CHANNEL_PORT` is set, so they don't affect standalone Claude Code usage.

Captured events: `PreToolUse`, `PostToolUse`, `PermissionRequest`, `UserPromptSubmit`, `Stop`, `Notification`, `SessionStart`, `SessionEnd`.

---

## Important Notice

> **Rune is currently in early development.** The MCP channel (`rune-channel`) loads via Claude Code's `--dangerously-load-development-channels` flag. This is a development-only feature and may change in future Claude Code releases. Use at your own discretion.

---

## Troubleshooting

### "Channel disconnected"

The Claude Code CLI isn't running. It should start automatically via the terminal. If not:

```bash
cd /your/project/folder
RUNE_CHANNEL_PORT=<port> claude --permission-mode auto --enable-auto-mode
```

### Quick Action doesn't appear

Open **System Settings** → **Privacy & Security** → **Extensions** → **Finder** and enable **New Rune**.

---

## Platform Support

| Platform | Status |
|----------|--------|
| macOS | Supported |
| Windows | Coming soon |
| Linux | Coming soon |

---

## License

MIT
