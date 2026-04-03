<p align="center">
  <img src="rune-logo.png" width="180" />
</p>

<h1 align="center">Rune</h1>

<p align="center">
  <strong>The simplest agent harness for Claude Code</strong><br/>
  One file per agent. Run headlessly, chain them together, automate with triggers, or chat in the desktop UI.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/powered_by-Claude_Code-blueviolet" alt="Claude Code" />
  <img src="https://img.shields.io/badge/platform-macOS-blue" alt="platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
</p>

---

## Why Rune?

Building a Claude Code harness usually means wiring up process management, I/O parsing, state handling, and a UI from scratch.

Rune replaces all of that with a single file.

```bash
npm install -g openrune

rune new reviewer --role "Code reviewer, security focused"
rune run reviewer.rune "Review the latest commit"
```

That's it. No SDK, no boilerplate, no config.

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`

### Install

```bash
npm install -g openrune
```

### Create and run agents

```bash
# Create agents
rune new architect --role "Software architect"
rune new coder --role "Backend developer"
rune new reviewer --role "Code reviewer"

# Run headlessly
rune run reviewer.rune "Review the latest commit"

# Pipe input
git diff | rune run reviewer.rune "Review this diff"

# Agent pipeline — architect designs, coder builds (with file creation)
rune pipe architect.rune coder.rune "Build a REST API with Express" --auto

# Open desktop UI
rune open reviewer.rune
```

---

## How It Works

Each `.rune` file is an independent AI agent:

```json
{
  "name": "reviewer",
  "role": "Code reviewer, security focused",
  "history": [],
  "memory": []
}
```

- **Portable** — It's just JSON. Commit to git, share with teammates, move between machines.
- **Persistent** — Role, memory, and chat history live in the file. The agent picks up where it left off.
- **Independent** — Multiple agents in the same folder, each with their own context.

---

## Agent Pipeline

Chain agents together. Each agent's output feeds into the next:

```bash
rune pipe architect.rune coder.rune reviewer.rune "Add OAuth2 login flow"
```

architect designs → coder implements → reviewer checks.

With `--auto`, the last agent can write files and run commands:

```bash
rune pipe architect.rune coder.rune "Build a REST API with Express" --auto
```

---

## Autonomous Mode

`--auto` lets agents write files, run commands, and fix errors on their own:

```bash
rune run coder.rune "Create a server.js with Express, run npm init and npm install" --auto
```

You see every action in real-time:
```
🔮 [auto] coder is working on: Create a server.js...

  ▶ Write: /path/to/server.js
  ▶ Bash: npm init -y
  ▶ Bash: npm install express
  💬 Server created and dependencies installed.

✓ coder finished
```

---

## Automated Triggers

Run agents automatically on events:

```bash
# On every git commit
rune watch reviewer.rune --on git-commit --prompt "Review this commit"

# On file changes
rune watch linter.rune --on file-change --glob "src/**/*.ts" --prompt "Check for issues"

# On a schedule
rune watch monitor.rune --on cron --interval 5m --prompt "Check server health"
```

---

## Node.js API

Use agents in your own code:

```js
const rune = require('openrune')

// Single agent
const reviewer = rune.load('reviewer.rune')
const result = await reviewer.send('Review the latest commit')

// Pipeline
const { finalOutput } = await rune.pipe(
  ['architect.rune', 'coder.rune'],
  'Build a REST API'
)
```

Works in Express servers, scripts, CI/CD — anywhere Node.js runs.

---

## Desktop UI

Double-click a `.rune` file or run `rune open` for an interactive chat interface.

- **Real-time activity** — See every tool call, result, and permission request via [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks).
- **Built-in terminal** — Claude Code output and your own commands, side by side.
- **Right-click to create** — macOS Quick Action for creating agents from Finder.

<p align="center">
  <img src="demo.gif" width="100%" alt="Rune demo" />
</p>

---

## Use Cases

| Scenario | Example |
|----------|---------|
| **Code review** | `rune run reviewer.rune "Review the latest commit"` |
| **Auto review on commit** | `rune watch reviewer.rune --on git-commit --prompt "Review this"` |
| **Agent pipeline** | `rune pipe architect.rune coder.rune "Build a login page" --auto` |
| **CI/CD** | `rune run qa.rune "Run tests and report failures" --output json` |
| **Monitoring** | `rune watch ops.rune --on cron --interval 10m --prompt "Check health"` |
| **Team sharing** | Commit `.rune` files to git — teammates get the same agents |
| **Node.js server** | `const rune = require('openrune'); rune.load('agent.rune').send(...)` |

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `rune new <name> [--role "..."]` | Create agent |
| `rune run <file> "prompt" [--auto] [--output json]` | Run headlessly |
| `rune pipe <a> <b> [...] "prompt" [--auto]` | Chain agents |
| `rune watch <file> --on <event> --prompt "..."` | Automated triggers |
| `rune open <file>` | Desktop UI |
| `rune list` | List agents in current directory |
| `rune install` | Set up file associations & Quick Action |

**Watch events:** `git-commit`, `git-push`, `file-change` (with `--glob`), `cron` (with `--interval`)

---

## Architecture

```
  Harness Mode (rune run / pipe / watch):
    CLI → Claude Code (-p) → stdout
    No GUI, no MCP — direct execution with .rune context

  Desktop UI Mode (rune open / double-click):
    Chat UI (React) ↔ Electron ↔ MCP Channel ↔ Claude Code CLI
    Real-time hooks for activity monitoring
```

---

## Development

```bash
git clone https://github.com/gilhyun/Rune.git
cd Rune
npm install
npm start
```

### Project Structure

```
bin/rune.js              CLI (new, run, pipe, watch, open, list)
lib/index.js             Node.js API
channel/rune-channel.ts  MCP channel + hooks endpoint
src/main.ts              Electron main process
renderer/src/            React chat UI + terminal
```

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
