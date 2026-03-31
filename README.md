<p align="center">
  <img src="rune-logo.png" width="180" />
</p>

<h1 align="center">Rune</h1>

<p align="center">
  <strong>File-based AI Agent Desktop App</strong><br/>
  Drop a <code>.rune</code> file in any folder. Double-click to open. Chat with your AI agent.
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/rune?color=violet" alt="npm" />
  <img src="https://img.shields.io/badge/platform-macOS-blue" alt="platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
</p>

---

## What is Rune?

Rune turns any folder into an AI workspace. Each `.rune` file is an independent AI agent with its own chat history, role, and context — all powered by [Claude Code](https://claude.ai/claude-code).

- **File-based** — One `.rune` file = one agent. Move it, share it, version it with git.
- **Folder-aware** — The agent knows your project. It can read files, run commands, and write code.
- **Desktop-native** — Lightweight Electron app with built-in terminal. No browser needed.
- **Right-click to create** — macOS Quick Action lets you create agents from Finder.

---

## Quick Start

### 1. Install

```bash
npm install -g rune
```

That's it. The app builds automatically, registers `.rune` file association, and adds a macOS Quick Action.

### 2. Create your first agent

**From terminal:**

```bash
cd ~/my-project
rune new myagent
```

**From Finder:**

Right-click any folder → Quick Actions → **New Rune**

### 3. Open and chat

**Double-click** the `.rune` file, or:

```bash
rune open myagent.rune
```

The app opens a chat window. A Claude Code channel starts automatically in the built-in terminal.

---

## Usage Guide

### CLI Commands

| Command | Description |
|---------|-------------|
| `rune install` | Build app, register file association, install Quick Action |
| `rune new <name>` | Create a `.rune` file in the current directory |
| `rune new <name> --role "..."` | Create with a custom role |
| `rune open <file.rune>` | Open a `.rune` file |
| `rune list` | List `.rune` files in the current directory |
| `rune uninstall` | Remove Rune integration (keeps your `.rune` files) |

### Creating Agents

```bash
# General assistant
rune new assistant

# Specialized agents
rune new designer --role "UI/UX design expert"
rune new backend --role "Backend developer, Node.js specialist"
rune new reviewer --role "Code reviewer, focused on security and performance"
```

### Right-click Menu (macOS)

After `rune install`, you can right-click any folder in Finder:

**Right-click** → **Quick Actions** → **New Rune**

This creates a `.rune` file named after the folder and opens it immediately.

### Chat Features

- **Markdown rendering** — Code blocks, tables, lists, and more.
- **File attachment** — Click the paperclip icon to attach files. The agent reads them directly from your local filesystem.
- **Image preview** — Attached images show a thumbnail preview in the chat.
- **Stream cancellation** — Click the stop button to cancel a response mid-stream.
- **Built-in terminal** — Toggle the terminal panel to see agent activity or run commands.
- **Chat history** — Persisted in the `.rune` file. Clear anytime with the trash icon.

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

- **name** — Display name in the chat header.
- **role** — System prompt that defines the agent's behavior.
- **history** — Chat messages are saved here automatically.

You can edit the `role` field to customize your agent at any time.

---

## Development Guide

### Prerequisites

- **Node.js** 18+
- **npm** 9+
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`

### Setup

```bash
git clone https://github.com/studio-h/Rune.git
cd Rune
npm install
```

### Build & Run

```bash
# Build and launch
npm run dev

# Build only
npm run build

# Build main process only
npm run build:main

# Build renderer only
npm run build:renderer
```

### Project Structure

```
Rune/
  bin/rune.js              # CLI tool (install, new, open, list)
  src/
    main.ts                # Electron main process
    preload.ts             # Preload bridge (IPC security)
  channel/
    rune-channel.ts        # MCP channel server (Claude Code ↔ Rune)
  renderer/
    src/
      App.tsx              # Root React component
      features/
        chat/              # Chat UI (input, messages, markdown)
        terminal/          # Built-in terminal (xterm.js + node-pty)
      hooks/               # IPC hooks
      lib/                 # Utilities
```

### Architecture

```
User ↔ Renderer (React)
         ↕ IPC
       Main Process (Electron)
         ↕ HTTP
       MCP Channel Server (Claude Code)
         ↕ MCP
       Claude AI
```

1. User types a message in the chat UI.
2. Renderer sends it to the main process via IPC.
3. Main process forwards it to the MCP channel server via HTTP POST.
4. Channel server communicates with Claude Code via MCP protocol.
5. Response streams back through the same chain.

### Adding IPC Channels

1. Add the channel name to `src/preload.ts` (allowed list).
2. Add the type to `renderer/src/global.d.ts`.
3. Add the handler in `src/main.ts` inside `setupIPC()`.

---

## Troubleshooting

### "Channel disconnected" in the chat

The Claude Code CLI channel isn't running. It should start automatically via the built-in terminal. If not, run manually:

```bash
cd /your/project/folder
RUNE_CHANNEL_PORT=<port> claude --dangerously-skip-permissions --dangerously-load-development-channels server:rune-channel
```

The port number is shown in the chat header.

### "Electron not found" when running `rune open`

Run `rune install` first to build the app and register paths.

### Quick Action doesn't appear

1. Open **System Settings** → **Privacy & Security** → **Extensions** → **Finder**.
2. Make sure **New Rune** is enabled.

---

## License

MIT
