<p align="center">
  <img src="rune-logo.png" width="180" />
</p>

<h1 align="center">Rune</h1>

<p align="center">
  <a href="README.md">English</a> | <a href="README.ko.md">한국어</a>
</p>

<p align="center">
  <strong>The simplest agent toolkit for Claude Code</strong><br/>
  No SDK. No boilerplate. Just one file per agent.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/powered_by-Claude_Code-blueviolet" alt="Claude Code" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
</p>

---

## Why Rune?

Claude Code already ships with subagents, hooks, skills, and headless mode. Rune is for the things that aren't built in:

- **One file = one agent.** Claude Code has `--resume`, but session threads pile up per directory with no names, no roles, and no way to tell which is which — good luck finding "that reviewer conversation from last week." Rune puts **everything about an agent into a single `.rune` file**: role, permissions, memory, full history. Name it, commit it, share it, drop it into another project. Managing 10 agents is managing 10 files.
- **Self-correction loops.** `rune loop coder.rune reviewer.rune "..." --until "no critical issues"` runs a doer/reviewer cycle until the stop condition is met or max iterations are reached. No scripting.
- **Per-agent permissions.** Lock a reviewer to `fileWrite: false` with `allowPaths: ["src/**"]`. A coder on the same project can still write anywhere. The guardrails travel with the file, not the session.
- **One-line triggers.** `rune watch agent.rune --on cron --interval 5m` — scheduled, file-change, and git-commit triggers without writing hook configs.

If you just want a one-off specialized agent inside a single session, Claude Code's built-in subagents are perfect. Reach for Rune when the same agent needs to come back tomorrow, run on a schedule, or be handed off to a teammate.

---

## How Rune works

Rune does not call the Claude API, handle any credentials, or wrap Claude Code's internals. Every agent invocation is a plain subprocess call to the official `claude` CLI:

```
rune run reviewer.rune "..."
      │
      ▼
spawn('claude', ['-p', '--print',
                 '--mcp-config', '{"mcpServers":{}}',
                 '--strict-mcp-config',
                 '--system-prompt', <role + memory + recent history>,
                 '--', <your prompt>])
      │
      ▼
Claude Code CLI (your logged-in session)
```

Key points:
- **No API key, no OAuth shim.** Rune uses your already-authenticated `claude` CLI as-is.
- **MCP isolation.** Rune passes `--mcp-config '{"mcpServers":{}}' --strict-mcp-config` so your project's `.mcp.json` never gets auto-loaded during an agent run. Nothing in your working folder is touched.
- **State lives in the `.rune` file.** Role, memory, and conversation history are plain JSON on your disk. Rune injects them into the system prompt each run — that's how persistence works without any server.
- **Usage:** runs through your Claude Code CLI session, so usage counts toward your normal Claude Code subscription.

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

## 30-Second Quick Start

```bash
rune new reviewer --role "Code reviewer, security focused"
rune run reviewer.rune "Review the latest commit"
```

That's it. You just built an agent.

---

## How is Rune different from Agent Teams?

Claude Code's Agent Teams spawn teammates at runtime — powerful, but ephemeral. When the session ends, the agents are gone.

Rune takes a different approach: **agents are files.**

| | Agent Teams | Rune |
|---|---|---|
| **Persistence** | Session-only — agents disappear when done | `.rune` files persist forever with history and memory |
| **Portability** | Tied to a single Claude Code session | Share, version-control, and reuse `.rune` files anywhere |
| **Scheduling** | Manual execution only | Cron, file-change, and git-commit triggers |
| **Permissions** | Inherited from session | Per-agent controls (`fileWrite`, `bash`, `allowPaths`) |
| **Execution** | Interactive | Headless, pipelines, CI/CD-ready |
| **Self-correction** | Not built-in | `rune loop` — automatic review-fix cycles |

Rune agents survive across sessions, machines, and teams. Build once, run forever.

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

Run agents from the terminal:

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

### Self-correction loop

Agents review and fix their own work automatically:

```bash
rune loop coder.rune reviewer.rune "Build a REST API with Express" --until "no critical issues" --max-iterations 3 --auto
```

```
🔁 Starting self-correction loop (max 3 iterations)
   Stop condition: "no critical issues"

  ━━━ Iteration 1/3 ━━━

  ▶ [doer] coder — implements the API
  ✓ coder done

  ▶ [reviewer] reviewer — finds 2 critical issues
  ✓ reviewer done

  ━━━ Iteration 2/3 ━━━

  ▶ [doer] coder — fixes the issues
  ✓ coder done

  ▶ [reviewer] reviewer — "no critical issues found"
  ✓ reviewer done

  ✅ Condition met: "no critical issues"

🔁 Loop completed after 2 iterations
```

The doer implements, the reviewer reviews. If issues are found, feedback goes back to the doer automatically — until the condition is met or max iterations are reached.

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

## CLI Reference

| Command | Description |
|---------|-------------|
| `rune new <name> [--role "..."]` | Create agent |
| `rune run <file> "prompt" [--auto] [--output json]` | Run headlessly |
| `rune pipe <a> <b> [...] "prompt" [--auto]` | Chain agents |
| `rune loop <doer> <reviewer> "prompt" [--until "..."] [--max-iterations N] [--auto]` | Self-correction loop |
| `rune watch <file> --on <event> --prompt "..."` | Automated triggers |
| `rune list` | List agents in current directory |

**Watch events:** `git-commit`, `git-push`, `file-change` (with `--glob`), `cron` (with `--interval`)

---

## Platform Support

| Platform | Status |
|----------|--------|
| macOS | Supported |
| Windows | Supported |
| Linux | Supported |

---

## License

MIT
