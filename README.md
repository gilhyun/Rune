<p align="center">
  <img src="rune-logo.png" width="180" />
</p>

<h1 align="center">Rune</h1>

<p align="center">
  <strong>The simplest agent harness for Claude Code</strong><br/>
  No SDK. No boilerplate. Just one file per agent.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/powered_by-Claude_Code-blueviolet" alt="Claude Code" />
  <img src="https://img.shields.io/badge/platform-macOS-blue" alt="platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
</p>

---

## Prerequisites

- **Node.js** 18+
- **Claude Code CLI** installed and logged in — Rune uses Claude Code under the hood for all agent execution

```bash
npm install -g @anthropic-ai/claude-code
claude                                       # login if you haven't
```

## Install

```bash
npm install -g openrune
```

---

## 30-Second Harness

```bash
rune new reviewer --role "Code reviewer, security focused"
rune run reviewer.rune "Review the latest commit"
```

That's it. You just built an agent harness.

---

## Core Concepts

### One file = one agent

```bash
rune new architect --role "Software architect"
rune new coder --role "Backend developer"
rune new reviewer --role "Code reviewer"
```

Each `.rune` file is just JSON — portable, shareable, version-controllable:

```json
{
  "name": "reviewer",
  "role": "Code reviewer, security focused",
  "permissions": {
    "fileWrite": false,
    "bash": false,
    "allowPaths": ["src/**"],
    "denyPaths": [".env", "secrets/**"]
  },
  "history": [],
  "memory": []
}
```

### Permissions

Control what each agent can do. No permissions = full access (backward compatible).

```json
{
  "permissions": {
    "fileWrite": false,
    "bash": false,
    "network": false,
    "allowPaths": ["src/**", "tests/**"],
    "denyPaths": [".env", "secrets/**", "node_modules/**"]
  }
}
```

- `fileWrite: false` — agent can read but not write/edit files
- `bash: false` — agent cannot run shell commands
- `network: false` — agent cannot make web requests
- `allowPaths` / `denyPaths` — restrict file access to specific patterns

A reviewer that can only read `src/`: safe. A coder that can write anywhere: powerful. You decide per agent.

### Structured logging

Track what agents do, how long it takes, and how much it costs:

```bash
rune run reviewer.rune "Review this project" --auto --log review.json
```

```json
{
  "agent": "reviewer",
  "prompt": "Review this project",
  "duration_ms": 12340,
  "cost_usd": 0.045,
  "tool_calls": [
    { "tool": "Read", "input": { "file_path": "src/index.ts" } },
    { "tool": "Grep", "input": { "pattern": "TODO" } }
  ],
  "result": "Found 3 issues..."
}
```

### Self-spawning agents

An agent can create and coordinate other agents on its own:

```bash
rune new manager --role "Project manager. Create agents with rune new and coordinate them with rune pipe."
rune run manager.rune "Create a summarizer and a translator agent, then pipe them to summarize and translate this news article into Korean." --auto
```

The manager will:
1. Run `rune new summarizer --role "..."` 
2. Run `rune new translator --role "..."`
3. Run `rune pipe summarizer.rune translator.rune "..."`
4. If something fails, debug and fix it autonomously

Agents creating agents. No human intervention.

### Headless execution

Run agents from the terminal. No GUI needed:

```bash
rune run reviewer.rune "Review the latest commit"

# Pipe input from other commands
git diff | rune run reviewer.rune "Review this diff"

# JSON output for scripting
rune run reviewer.rune "Check for security issues" --output json
```

### Autonomous mode

With `--auto`, agents write files, run commands, and fix errors on their own:

```bash
rune run coder.rune "Create an Express server with a /health endpoint. Run npm init and npm install." --auto
```

```
🔮 [auto] coder is working on: Create an Express server...

  ▶ Write: /path/to/server.js
  ▶ Bash: npm init -y
  ▶ Bash: npm install express
  💬 Server created and dependencies installed.

✓ coder finished
```

### Agent pipeline

Chain agents. Each agent's output feeds into the next:

```bash
rune pipe architect.rune coder.rune "Build a REST API with Express"
```

With `--auto`, the last agent executes the plan:

```bash
rune pipe architect.rune coder.rune "Build a REST API with Express" --auto
```

architect designs → coder implements (writes files, installs deps).

### Automated triggers

```bash
# On every git commit
rune watch reviewer.rune --on git-commit --prompt "Review this commit"

# On file changes
rune watch linter.rune --on file-change --glob "src/**/*.ts" --prompt "Check for issues"

# On a schedule
rune watch monitor.rune --on cron --interval 5m --prompt "Check server health"
```

### Node.js API

Use agents in your own code. Each `.send()` call spawns a Claude Code process, so Claude Code CLI must be installed and logged in on the machine.

```js
const rune = require('openrune')

const reviewer = rune.load('reviewer.rune')
const result = await reviewer.send('Review the latest commit')

// Pipeline
const { finalOutput } = await rune.pipe(
  ['architect.rune', 'coder.rune'],
  'Build a REST API'
)
```

---

## Example: Agent-Powered API Server

A full walkthrough — from zero to a running server built by agents.

### 1. Install and create agents

```bash
npm install -g openrune
mkdir my-project && cd my-project

rune new architect --role "Software architect. Design system architecture concisely."
rune new coder --role "Backend developer. Implement code based on the given plan."
rune new reviewer --role "Code reviewer. Review for bugs and security issues."
```

### 2. Agents collaborate to build a server

```bash
rune pipe architect.rune coder.rune "Design and build an Express server with POST /review endpoint that uses require('openrune') to load reviewer.rune and send the prompt. Run npm init -y and npm install express openrune." --auto
```

architect designs the architecture → coder writes `server.js`, runs `npm init`, installs dependencies.

### 3. Start the server

```bash
node server.js
```

### 4. Call the agent via API

```bash
curl -X POST http://localhost:3000/review \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Review this project"}'
```

The reviewer agent analyzes your project and returns a full code review.

### 5. Open the desktop UI

```bash
rune open reviewer.rune
```

The conversation history from the API call is already there — context persists across CLI, API, and GUI.

---

## Desktop UI

Rune includes an optional desktop app for interactive chat.

```bash
rune open reviewer.rune
```

Or double-click any `.rune` file in Finder.

- **Real-time activity** — See tool calls, results, and permission requests as they happen.
- **Built-in terminal** — Claude Code output and your own commands, side by side.
- **Right-click to create** — macOS Quick Action for creating agents from Finder.

> If double-click doesn't work, run `rune install` once to register the file association.

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

## Platform Support

| Platform | Status |
|----------|--------|
| macOS | Supported |
| Windows | Coming soon |
| Linux | Coming soon |

---

## License

MIT
