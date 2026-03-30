import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import * as http from 'http'

import * as fs from 'fs'

const PORT = Number(process.env.RUNE_CHANNEL_PORT || 8800)
const FOLDER_PATH = process.env.RUNE_FOLDER_PATH || ''
const AGENT_ROLE = process.env.RUNE_AGENT_ROLE || ''
const RUNE_FILE_PATH = process.env.RUNE_FILE_PATH || ''

// ── .rune File I/O ──────────────────────────────
interface RuneFile {
  name: string
  role: string
  history?: { role: 'user' | 'assistant'; text: string; ts: number }[]
  memory?: string[]
  [key: string]: unknown
}

function readRuneFile(): RuneFile | null {
  if (!RUNE_FILE_PATH) return null
  try {
    return JSON.parse(fs.readFileSync(RUNE_FILE_PATH, 'utf-8'))
  } catch {
    return null
  }
}

function writeRuneFile(data: RuneFile) {
  if (!RUNE_FILE_PATH) return
  try {
    fs.writeFileSync(RUNE_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e: any) {
    console.error(`[rune-channel] Failed to write .rune file: ${e.message}`)
  }
}

function buildSessionContext(): string {
  const rune = readRuneFile()
  if (!rune) return ''

  const parts: string[] = []

  // Memory
  if (rune.memory && rune.memory.length > 0) {
    parts.push('## Saved Memory')
    parts.push('These are notes you saved from previous sessions:')
    rune.memory.forEach((m, i) => parts.push(`${i + 1}. ${m}`))
  }

  // History summary (last 20 messages condensed)
  if (rune.history && rune.history.length > 0) {
    const recent = rune.history.slice(-20)
    parts.push('\n## Recent Conversation History')
    parts.push(`(${rune.history.length} total messages, showing last ${recent.length})`)
    for (const msg of recent) {
      const who = msg.role === 'user' ? 'User' : 'You'
      const text = msg.text.length > 200 ? msg.text.slice(0, 200) + '...' : msg.text
      parts.push(`- **${who}**: ${text}`)
    }
  }

  return parts.join('\n')
}

// ── MCP Server ──────────────────────────────────

const mcp = new Server(
  { name: 'rune-channel', version: '0.1.0' },
  {
    capabilities: {
      experimental: { 'claude/channel': {} },
      tools: {},
    },
    instructions: `You are an AI agent running inside the Rune desktop app.

## System Info
- Current time: ${new Date().toISOString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})
- Local time: ${new Date().toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, hour12: false })}
- Working folder: ${FOLDER_PATH || '(none)'}
${AGENT_ROLE ? `\n## Your Role\n${AGENT_ROLE}\n` : ''}
Messages arrive as <channel source="rune-channel" type="..." request_id="...">.

## Message types
- type="chat": User message from the Rune chat UI. Always reply using the rune_reply tool with the request_id.

## CRITICAL: ALL output MUST go through rune_reply
You are connected to a desktop app UI. The user CANNOT see your regular text output — they can ONLY see messages sent via rune_reply.
- NEVER output plain text without calling rune_reply. Any text not sent through rune_reply is invisible to the user.
- For chat messages: call rune_reply with the request_id.
- For proactive updates: call rune_reply WITHOUT request_id to push via SSE.
- If you need to do multi-step work (fetch data, analyze, etc.), do all the work FIRST, then send ONE comprehensive rune_reply at the end.
- Even error messages and status updates must go through rune_reply.

## CRITICAL: Actions, Not Words
When the user asks you to do something, ACTUALLY DO IT. Never just describe what you would do.
- Read files, write code, run commands — take action.
- Only explain when the user asks for an explanation.

## Memory
You have a rune_memory tool to save persistent notes across sessions.
- Save important context: user preferences, project decisions, key findings, recurring patterns.
- Memory is stored in the .rune file and provided to you at the start of each session.
- Use it proactively when you learn something worth remembering.
`,
  }
)

// ── Pending Replies ──────────────────────────────

const pendingReplies = new Map<string, (text: string) => void>()
const sseClients = new Set<http.ServerResponse>()
let mcpConnected = false

function broadcastSSE(data: Record<string, unknown>) {
  const msg = `data: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    try { client.write(msg) } catch {}
  }
}

// ── Tools ────────────────────────────────────────

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'rune_reply',
      description: 'Send a reply back to the Rune UI. Use this for every chat message. If request_id is omitted, the message is pushed as a proactive notification.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          request_id: { type: 'string', description: 'The request_id from the incoming channel message. Omit to send a proactive push message.' },
          text: { type: 'string', description: 'Your response in markdown' },
        },
        required: ['text'],
      },
    },
    {
      name: 'rune_memory',
      description: 'Save, list, or delete persistent memory notes in the .rune file. Use this to remember important context across sessions — user preferences, project decisions, key findings, etc. Memory persists even when the session ends.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string', enum: ['save', 'list', 'delete'], description: 'save: add a new memory note. list: show all saved memories. delete: remove a memory by index (1-based).' },
          text: { type: 'string', description: 'The memory note to save (required for "save" action)' },
          index: { type: 'number', description: 'The 1-based index of the memory to delete (required for "delete" action)' },
        },
        required: ['action'],
      },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  const toolName = req.params.name

  // Broadcast tool_start for non-internal tools
  if (toolName !== 'rune_reply' && toolName !== 'rune_memory') {
    const argsSummary: Record<string, unknown> = {}
    const rawArgs = req.params.arguments as Record<string, unknown> | undefined
    if (rawArgs) {
      for (const [k, v] of Object.entries(rawArgs)) {
        if (typeof v === 'string' && v.length > 80) argsSummary[k] = (v as string).slice(0, 80) + '…'
        else argsSummary[k] = v
      }
    }
    broadcastSSE({ type: 'tool_start', tool: toolName, args: argsSummary })
  }

  if (req.params.name === 'rune_reply') {
    const { request_id, text } = req.params.arguments as { request_id?: string; text: string }
    if (request_id) {
      const resolve = pendingReplies.get(request_id)
      if (resolve) {
        resolve(text)
        pendingReplies.delete(request_id)
      } else {
        broadcastSSE({ type: 'push', text })
      }
    } else {
      broadcastSSE({ type: 'push', text })
    }
    return { content: [{ type: 'text' as const, text: 'sent' }] }
  }

  // rune_memory tool
  if (req.params.name === 'rune_memory') {
    const { action, text, index } = req.params.arguments as { action: string; text?: string; index?: number }
    const rune = readRuneFile()
    if (!rune) {
      return { content: [{ type: 'text' as const, text: 'No .rune file available' }], isError: true }
    }
    if (!rune.memory) rune.memory = []

    if (action === 'save') {
      if (!text) return { content: [{ type: 'text' as const, text: 'text is required for save action' }], isError: true }
      rune.memory.push(text)
      writeRuneFile(rune)
      broadcastSSE({ type: 'memory_update' })
      return { content: [{ type: 'text' as const, text: `Memory saved (${rune.memory.length} total)` }] }
    }

    if (action === 'list') {
      if (rune.memory.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No memories saved yet.' }] }
      }
      const list = rune.memory.map((m, i) => `${i + 1}. ${m}`).join('\n')
      return { content: [{ type: 'text' as const, text: `Saved memories:\n${list}` }] }
    }

    if (action === 'delete') {
      if (!index || index < 1 || index > rune.memory.length) {
        return { content: [{ type: 'text' as const, text: `Invalid index. Valid range: 1-${rune.memory.length}` }], isError: true }
      }
      const removed = rune.memory.splice(index - 1, 1)
      writeRuneFile(rune)
      broadcastSSE({ type: 'memory_update' })
      return { content: [{ type: 'text' as const, text: `Deleted: "${removed[0]}" (${rune.memory.length} remaining)` }] }
    }

    return { content: [{ type: 'text' as const, text: `Unknown action: ${action}` }], isError: true }
  }

  // Unknown tool
  return { content: [{ type: 'text' as const, text: `Unknown tool: ${toolName}` }], isError: true }
})

// ── Main ─────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await mcp.connect(transport)
  mcpConnected = true
  console.error(`[rune-channel] MCP connected (port=${PORT}, folder=${FOLDER_PATH})`)

  // Notify Claude about session start with history + memory context
  setTimeout(() => {
    const sessionContext = buildSessionContext()
    const contextBlock = sessionContext ? `\n\n${sessionContext}` : ''
    mcp.notification({
      method: 'notifications/claude/channel',
      params: {
        content: `[SESSION_START] Channel connected. Folder: ${FOLDER_PATH || 'none'}${AGENT_ROLE ? `. Role: ${AGENT_ROLE}` : ''}${contextBlock}\n\nUse the rune_memory tool to save important context that should persist across sessions.`,
        meta: { type: 'session_start' },
      },
    }).catch((e: any) => console.error(`[rune-channel] Startup notification failed: ${e.message}`))
  }, 1000)

  // Handle disconnect
  function handleDisconnect(reason: string) {
    if (!mcpConnected) return
    console.error(`[rune-channel] ${reason}, shutting down`)
    mcpConnected = false
    broadcastSSE({ type: 'mcp_disconnected' })
    setTimeout(() => process.exit(0), 500)
  }

  mcp.onclose = () => handleDisconnect('MCP connection closed')
  process.stdin.on('end', () => handleDisconnect('stdin closed'))
  process.stdin.on('error', () => handleDisconnect('stdin error'))

  // ── HTTP server ─────────────────────────────────

  let reqId = 0

  const server = http.createServer(async (req, res) => {
    // SSE endpoint
    if (req.method === 'GET' && req.url === '/sse') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })
      res.write('data: {"type":"connected"}\n\n')
      sseClients.add(res)
      console.error(`[rune-channel] SSE client connected (total: ${sseClients.size})`)
      req.on('close', () => {
        sseClients.delete(res)
        console.error(`[rune-channel] SSE client disconnected (total: ${sseClients.size})`)
      })
      return
    }

    // Health check
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: mcpConnected ? 'ok' : 'no-mcp', name: 'rune-channel', mcpConnected }))
      return
    }

    // POST: chat message
    try {
      let body = ''
      for await (const chunk of req) body += chunk
      const { type, content } = JSON.parse(body) as { type: string; content: string }
      const id = String(++reqId)

      console.error(`[rune-channel] received ${type} message (id=${id}): ${content.slice(0, 100)}`)

      // Push to Claude Code
      try {
        await mcp.notification({
          method: 'notifications/claude/channel',
          params: {
            content,
            meta: { type, request_id: id },
          },
        })
      } catch (notifErr: any) {
        console.error(`[rune-channel] MCP notification FAILED: ${notifErr.message}`)
      }

      // For chat messages, wait for reply
      if (type === 'chat') {
        const reply = await new Promise<string>((resolve) => {
          pendingReplies.set(id, resolve)
          setTimeout(() => {
            if (pendingReplies.has(id)) {
              pendingReplies.delete(id)
              resolve(JSON.stringify({ error: 'timeout' }))
            }
          }, 180_000)
        })
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(reply)
        return
      }

      res.writeHead(200)
      res.end('ok')
    } catch (e: any) {
      console.error(`[rune-channel] HTTP error: ${e.message}`)
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    }
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.error(`[rune-channel] listening on http://127.0.0.1:${PORT}`)
  })
}

main()
