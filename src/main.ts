import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import { execSync } from 'child_process'
import * as pty from 'node-pty'

const RUNE_DIR = path.join(require('os').homedir(), '.rune')
const CHANNEL_PORT = 51234

// Ensure rune config dir exists
if (!fs.existsSync(RUNE_DIR)) fs.mkdirSync(RUNE_DIR, { recursive: true })

// ── Window Registry ──────────────────────────────────
interface RuneWindow {
  window: BrowserWindow
  filePath: string
  folderPath: string
  port: number
}

const windowRegistry = new Map<string, RuneWindow>()
const ptyProcesses = new Map<string, pty.IPty>()
let ptyIdCounter = 0

// ── .rune File I/O ───────────────────────────────────
interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

interface RuneFile {
  name: string
  role: string
  icon?: string
  port?: number
  createdAt?: string
  windowBounds?: WindowBounds
  history?: { role: 'user' | 'assistant'; text: string; ts: number }[]
  memory?: string[]
}

function readRuneFile(filePath: string): RuneFile {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return { name: path.basename(filePath, '.rune'), role: 'General assistant', history: [] }
  }
}

function writeRuneFile(filePath: string, data: RuneFile) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function appendHistory(filePath: string, msg: { role: 'user' | 'assistant'; text: string; ts: number }) {
  const rune = readRuneFile(filePath)
  if (!rune.history) rune.history = []
  rune.history.push(msg)
  writeRuneFile(filePath, rune)
}

// ── Port Allocation ──────────────────────────────────
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = require('net').createServer()
    srv.once('error', () => resolve(true))
    srv.once('listening', () => { srv.close(); resolve(false) })
    srv.listen(port, '127.0.0.1')
  })
}

async function allocatePort(): Promise<number> {
  const usedPorts = new Set<number>()
  for (const [, rw] of windowRegistry) usedPorts.add(rw.port)
  let port = CHANNEL_PORT
  while (usedPorts.has(port) || await isPortInUse(port)) port++
  return port
}

// ── Channel Health Check ─────────────────────────────
function checkChannelHealth(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, { timeout: 2000 }, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve(json.status === 'ok' && json.name === 'rune-channel' && json.mcpConnected !== false)
        } catch { resolve(false) }
      })
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

// ── Channel Message Sender ───────────────────────────
function sanitizeUnicode(s: string): string {
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD')
}

const activeRequests = new Map<number, http.ClientRequest>()

function sendToChannel(content: string, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'chat', content: sanitizeUnicode(content) })
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 180_000,
    }, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk })
      res.on('end', () => { activeRequests.delete(port); resolve(data) })
    })
    req.on('error', (e) => { activeRequests.delete(port); reject(e) })
    req.on('timeout', () => { activeRequests.delete(port); req.destroy(); reject(new Error('timeout')) })
    activeRequests.set(port, req)
    req.write(body)
    req.end()
  })
}

function cancelChannelRequest(port: number) {
  const req = activeRequests.get(port)
  if (req) {
    req.destroy()
    activeRequests.delete(port)
  }
}

// ── SSE Push Listener ────────────────────────────────
const sseConnections = new Map<number, http.IncomingMessage>()
const retryTimers = new Map<number, ReturnType<typeof setInterval>>()

function getWindowForPort(port: number): BrowserWindow | null {
  for (const [, rw] of windowRegistry) {
    if (rw.port === port && !rw.window.isDestroyed()) return rw.window
  }
  return null
}

function connectSSE(port: number) {
  if (sseConnections.has(port)) return

  const req = http.get(`http://127.0.0.1:${port}/sse`, (res) => {
    sseConnections.set(port, res)
    console.log(`[rune] SSE connected to :${port}`)

    let buf = ''
    res.on('data', (chunk: Buffer) => {
      buf += chunk
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            const win = getWindowForPort(port)
            if (!win) continue

            if (data.type === 'push') {
              // Save push message to .rune file history
              const rw = [...windowRegistry.values()].find(r => r.port === port)
              if (rw) appendHistory(rw.filePath, { role: 'assistant', text: data.text, ts: Date.now() })
              win.webContents.send('rune:pushMessage', { text: data.text, port })
            }
            if (data.type === 'tool_start' || data.type === 'tool_end') {
              win.webContents.send('rune:toolActivity', { port, type: data.type, tool: data.tool, args: data.args, preview: data.preview })
            }
            if (data.type === 'memory_update') {
              // Channel updated memory in .rune file — reload and notify renderer
              const rw = [...windowRegistry.values()].find(r => r.port === port)
              if (rw) {
                const rune = readRuneFile(rw.filePath)
                win.webContents.send('rune:memoryUpdate', { memory: rune.memory || [] })
              }
            }
            if (data.type === 'session_start') {
              win.webContents.send('rune:sessionStart', { port })
            }
            if (data.type === 'mcp_disconnected') {
              console.log(`[rune] MCP disconnected on :${port}`)
              win.webContents.send('rune:channelStatus', { port, connected: false })
              sseConnections.delete(port)
              startRetryPolling(port)
            }
          } catch {}
        }
      }
    })
    res.on('end', () => {
      sseConnections.delete(port)
      console.log(`[rune] SSE disconnected from :${port}, reconnecting in 3s...`)
      setTimeout(() => connectSSE(port), 3000)
    })
    res.on('error', () => {
      sseConnections.delete(port)
      setTimeout(() => connectSSE(port), 3000)
    })
  })
  req.on('error', () => {
    setTimeout(() => connectSSE(port), 5000)
  })
}

function disconnectSSE(port: number) {
  const res = sseConnections.get(port)
  if (res) {
    res.destroy()
    sseConnections.delete(port)
  }
}

async function autoConnectChannel(port: number): Promise<boolean> {
  const ok = await checkChannelHealth(port)
  if (ok) {
    connectSSE(port)
    const timer = retryTimers.get(port)
    if (timer) { clearInterval(timer); retryTimers.delete(port) }
    const win = getWindowForPort(port)
    win?.webContents.send('rune:channelStatus', { port, connected: true })
    console.log(`[rune] auto-connected to channel :${port}`)
  }
  return ok
}

function startRetryPolling(port: number) {
  if (retryTimers.has(port)) return
  const timer = setInterval(async () => {
    await autoConnectChannel(port)
  }, 5000)
  retryTimers.set(port, timer)
}

// ── .mcp.json Writer ─────────────────────────────────
function findNodePath(): string {
  try { return execSync('which node', { encoding: 'utf-8' }).trim() } catch {}
  for (const p of ['/usr/local/bin/node', '/opt/homebrew/bin/node']) {
    if (fs.existsSync(p)) return p
  }
  return 'node'
}

function writeMcpJson(folderPath: string, port: number, role?: string, runeFilePath?: string) {
  const channelJs = path.join(__dirname, 'rune-channel.js')
  const nodePath = findNodePath()
  const env: Record<string, string> = {
    RUNE_FOLDER_PATH: folderPath,
    RUNE_CHANNEL_PORT: String(port),
  }
  if (role) env.RUNE_AGENT_ROLE = role
  if (runeFilePath) env.RUNE_FILE_PATH = runeFilePath
  const mcpConfig = {
    mcpServers: {
      'rune-channel': {
        command: nodePath,
        args: [channelJs],
        env,
      },
    },
  }
  try {
    fs.writeFileSync(path.join(folderPath, '.mcp.json'), JSON.stringify(mcpConfig, null, 2), 'utf-8')
  } catch {}
}

// ── Channel Message Handler ─────────────────────────
async function handleChannelMessage(content: string, runeFilePath: string, port: number) {
  const win = getWindowForPort(port)
  if (!win) return

  win.webContents.send('rune:streamStart', {})
  win.webContents.send('rune:streamStatus', { status: `Channel :${port} sending...` })

  try {
    const reply = await sendToChannel(content, port)
    win.webContents.send('rune:streamChunk', { text: reply })
    win.webContents.send('rune:streamEnd', {})

    // Save to .rune history
    appendHistory(runeFilePath, { role: 'assistant', text: reply, ts: Date.now() })
  } catch (e: any) {
    const rune = readRuneFile(runeFilePath)
    const folderPath = path.dirname(runeFilePath)
    win.webContents.send('rune:streamError', {
      error: `Channel :${port} error: ${e.message}\n\nStart the channel:\ncd ${folderPath} && RUNE_CHANNEL_PORT=${port} RUNE_FOLDER_PATH=${folderPath}${rune.role ? ` RUNE_AGENT_ROLE="${rune.role}"` : ''} claude --dangerously-skip-permissions --dangerously-load-development-channels server:rune-channel`,
    })
  }
}

// ── Window Creation ──────────────────────────────────
async function createRuneWindow(filePath: string) {
  // If window already exists for this file, focus it
  const existing = windowRegistry.get(filePath)
  if (existing && !existing.window.isDestroyed()) {
    existing.window.focus()
    return
  }

  const rune = readRuneFile(filePath)
  const folderPath = path.dirname(filePath)
  let port = rune.port
  if (port && await isPortInUse(port)) port = 0
  if (!port) port = await allocatePort()

  // Sync name with filename & save port
  const fileBaseName = path.basename(filePath, '.rune')
  const nameChanged = rune.name !== fileBaseName
  if (nameChanged) rune.name = fileBaseName
  if (rune.port !== port || nameChanged) {
    rune.port = port
    writeRuneFile(filePath, rune)
  }

  // Write .mcp.json
  writeMcpJson(folderPath, port, rune.role, filePath)

  const bounds = rune.windowBounds
  const win = new BrowserWindow({
    width: bounds?.width || 500,
    height: bounds?.height || 700,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 300,
    minHeight: 400,
    ...(process.platform === 'darwin' ? {
      titleBarStyle: 'hiddenInset' as const,
      trafficLightPosition: { x: 12, y: 12 },
    } : {}),
    backgroundColor: '#1a1a1a',
    title: `${rune.name} — ${path.basename(folderPath)}`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  let currentFilePath = filePath

  // Save window bounds on move/resize
  const saveBounds = () => {
    if (win.isDestroyed()) return
    const currentBounds = win.getBounds()
    const currentRune = readRuneFile(currentFilePath)
    currentRune.windowBounds = currentBounds
    writeRuneFile(currentFilePath, currentRune)
  }
  let boundsTimeout: ReturnType<typeof setTimeout> | null = null
  const debouncedSaveBounds = () => {
    if (boundsTimeout) clearTimeout(boundsTimeout)
    boundsTimeout = setTimeout(saveBounds, 500)
  }
  win.on('resize', debouncedSaveBounds)
  win.on('move', debouncedSaveBounds)
  const rw: RuneWindow = { window: win, filePath, folderPath, port }
  windowRegistry.set(filePath, rw)
  updateDockVisibility()

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  win.webContents.on('did-finish-load', () => {
    const initData = {
      filePath: currentFilePath,
      folderPath,
      port,
      name: rune.name,
      role: rune.role,
      icon: rune.icon,
      history: rune.history || [],
    }
    console.log('[rune] Sending init:', JSON.stringify({ filePath: currentFilePath, folderPath, port, name: rune.name }))
    win.webContents.send('rune:init', initData)
  })

  // Watch folder for .rune file renames
  const createdAt = rune.createdAt
  let dirWatcher: fs.FSWatcher | null = null
  try {
    dirWatcher = fs.watch(folderPath, (_eventType, filename) => {
      if (!filename?.endsWith('.rune')) return
      // Check if our file still exists
      if (fs.existsSync(currentFilePath)) return
      // Our file was renamed/deleted — scan for the new name
      try {
        const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.rune'))
        for (const f of files) {
          const candidate = path.join(folderPath, f)
          try {
            const data = JSON.parse(fs.readFileSync(candidate, 'utf-8'))
            if (data.createdAt === createdAt && data.port === port) {
              console.log(`[rune] Detected rename: ${path.basename(currentFilePath)} → ${f}`)
              // Update registry
              windowRegistry.delete(currentFilePath)
              currentFilePath = candidate
              rw.filePath = candidate
              windowRegistry.set(candidate, rw)
              // Update name inside .rune file to match new filename
              const newName = path.basename(candidate, '.rune')
              data.name = newName
              writeRuneFile(candidate, data)
              // Update .mcp.json
              writeMcpJson(folderPath, port, data.role, candidate)
              // Update window title
              win.setTitle(`${newName} — ${path.basename(folderPath)}`)
              // Notify renderer
              win.webContents.send('rune:fileRenamed', { oldPath: currentFilePath, newPath: candidate, name: newName })
              break
            }
          } catch {}
        }
      } catch {}
    })
  } catch (e) {
    console.error('[rune] Failed to watch folder:', e)
  }

  // Start channel health check
  startRetryPolling(port)
  autoConnectChannel(port)

  win.on('closed', () => {
    windowRegistry.delete(currentFilePath)
    if (dirWatcher) dirWatcher.close()
    disconnectSSE(port)
    const timer = retryTimers.get(port)
    if (timer) { clearInterval(timer); retryTimers.delete(port) }
    // Kill all pty processes for this window (kills Claude Code + channel)
    for (const [id, p] of ptyProcesses) {
      try { p.kill() } catch {}
      ptyProcesses.delete(id)
    }
    updateDockVisibility()
  })
}

// ── Pending file path (before app ready) ─────────────
let pendingFilePath: string | null = null

app.on('will-finish-launching', () => {
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    console.log('[rune] open-file event:', filePath, 'ready:', app.isReady())
    if (app.isReady()) {
      createRuneWindow(filePath)
    } else {
      pendingFilePath = filePath
    }
  })
})

// ── IPC Setup ────────────────────────────────────────
function setupIPC() {
  // Send message
  ipcMain.on('rune:sendMessage', async (event, data: { content: string; port: number }) => {
    const rw = [...windowRegistry.values()].find(r => r.port === data.port)
    if (!rw) return

    // Save user message to .rune history
    appendHistory(rw.filePath, { role: 'user', text: data.content, ts: Date.now() })

    await handleChannelMessage(data.content, rw.filePath, data.port)
  })

  // Cancel stream
  ipcMain.on('rune:cancelStream', (_event, data: { port?: number }) => {
    if (data?.port) {
      cancelChannelRequest(data.port)
    } else {
      // Cancel all active requests
      for (const port of activeRequests.keys()) {
        cancelChannelRequest(port)
      }
    }
  })

  // Connect channel
  ipcMain.on('rune:connectChannel', async (_event, data: { port: number }) => {
    await autoConnectChannel(data.port)
  })

  // Clear history
  ipcMain.on('rune:clearHistory', (_event, data: { port: number }) => {
    const rw = [...windowRegistry.values()].find(r => r.port === data.port)
    if (!rw) return
    const rune = readRuneFile(rw.filePath)
    rune.history = []
    writeRuneFile(rw.filePath, rune)
  })

  // Terminal spawn
  ipcMain.handle('terminal:spawn', (_event, data: { cwd?: string }) => {
    const id = `pty-${++ptyIdCounter}`
    const shell = process.env.SHELL || '/bin/zsh'
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    let p: any
    try {
      p = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: data.cwd || process.env.HOME,
        env: env as Record<string, string>,
      })
    } catch (err) {
      console.error('[rune] pty.spawn failed:', err)
      return { id, error: String(err) }
    }

    ptyProcesses.set(id, p)

    p.onData((data: string) => {
      // Send to ALL windows (terminal will filter by id)
      for (const [, rw] of windowRegistry) {
        if (!rw.window.isDestroyed()) {
          rw.window.webContents.send('terminal:output', { id, data })
        }
      }
    })

    p.onExit(({ exitCode }) => {
      for (const [, rw] of windowRegistry) {
        if (!rw.window.isDestroyed()) {
          rw.window.webContents.send('terminal:exit', { id, exitCode })
        }
      }
      ptyProcesses.delete(id)
    })

    return { id }
  })

  // Terminal input
  ipcMain.on('terminal:input', (_event, data: { id: string; data: string }) => {
    const p = ptyProcesses.get(data.id)
    if (p) p.write(data.data)
  })

  // Terminal resize
  ipcMain.on('terminal:resize', (_event, data: { id: string; cols: number; rows: number }) => {
    const p = ptyProcesses.get(data.id)
    if (p) p.resize(data.cols, data.rows)
  })

  // Terminal kill
  ipcMain.on('terminal:kill', (_event, data: { id: string }) => {
    const p = ptyProcesses.get(data.id)
    if (p) {
      p.kill()
      ptyProcesses.delete(data.id)
    }
  })

  // Create new .rune file
  ipcMain.handle('rune:createFile', async (_event, data: { folderPath: string; name: string; role?: string }) => {
    const fileName = `${data.name}.rune`
    const filePath = path.join(data.folderPath, fileName)
    const runeData: RuneFile = {
      name: data.name,
      role: data.role || 'General assistant',
      icon: 'bot',
      createdAt: new Date().toISOString(),
      history: [],
    }
    writeRuneFile(filePath, runeData)
    return filePath
  })
}

// ── App Lifecycle ────────────────────────────────────
// Background agent app: no dock icon, no default window.
// Only opens windows when .rune files are double-clicked.

// Handle CLI args: `rune open /path/to/file.rune` or direct file path
function getRuneFileFromArgs(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (arg.endsWith('.rune')) {
      const resolved = path.resolve(arg)
      if (fs.existsSync(resolved)) return resolved
    }
  }
  return null
}

// macOS: hide dock icon until a window opens (background agent mode)
if (process.platform === 'darwin') {
  app.dock?.hide()
}

app.whenReady().then(() => {
  setupIPC()

  console.log('[rune] App ready. argv:', process.argv)
  console.log('[rune] pendingFilePath:', pendingFilePath)

  // Check if launched with a .rune file argument
  const argFile = getRuneFileFromArgs(process.argv)
  // Also check env var (set by wrapper .app launcher when macOS sends Apple Event)
  const envFile = process.env.RUNE_OPEN_FILE || null
  console.log('[rune] argFile:', argFile, 'envFile:', envFile)

  const fileToOpen = pendingFilePath || argFile || envFile
  if (fileToOpen) {
    createRuneWindow(fileToOpen)
    pendingFilePath = null
  }
  // Otherwise: no window. App stays running in background, waiting for open-file events.
})

// Show dock icon when windows open, hide when all close
function updateDockVisibility() {
  if (process.platform !== 'darwin') return
  if (BrowserWindow.getAllWindows().length > 0) {
    app.dock?.show()
  } else {
    app.dock?.hide()
  }
}

app.on('window-all-closed', () => {
  // Quit when all windows close. AppleScript launcher starts fresh on next double-click.
  app.quit()
})

// Handle second instance (Windows: file passed via argv)
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    console.log('[rune] second-instance argv:', argv)
    const filePath = getRuneFileFromArgs(argv)
    console.log('[rune] second-instance filePath:', filePath)
    if (filePath) {
      if (app.isReady()) {
        createRuneWindow(filePath)
      } else {
        pendingFilePath = filePath
      }
    }
  })
}
