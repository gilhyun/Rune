/**
 * OpenRune — Node.js API
 *
 * Usage:
 *   const rune = require('openrune')
 *   const agent = rune.load('reviewer.rune')
 *   const result = await agent.send('Review this code')
 */

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

function load(filePath) {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Rune file not found: ${resolved}`)
  }

  const rune = JSON.parse(fs.readFileSync(resolved, 'utf-8'))
  const folderPath = path.dirname(resolved)

  return {
    name: rune.name,
    role: rune.role,
    filePath: resolved,

    async send(prompt) {
      const fresh = JSON.parse(fs.readFileSync(resolved, 'utf-8'))

      // Build system prompt
      const systemParts = []
      if (fresh.role) systemParts.push(`Your role: ${fresh.role}`)
      if (fresh.memory && fresh.memory.length > 0) {
        systemParts.push('Saved memory:')
        fresh.memory.forEach((m, i) => systemParts.push(`${i + 1}. ${m}`))
      }
      if (fresh.history && fresh.history.length > 0) {
        const recent = fresh.history.slice(-10)
        systemParts.push(`\nRecent conversation (last ${recent.length}):`)
        for (const msg of recent) {
          const who = msg.role === 'user' ? 'User' : 'Assistant'
          systemParts.push(`${who}: ${msg.text}`)
        }
      }

      systemParts.push(`Working folder: ${folderPath}`)

      const claudeArgs = ['-p', '--print']
      if (systemParts.length > 0) {
        claudeArgs.push('--system-prompt', systemParts.join('\n'))
      }
      claudeArgs.push('--add-dir', folderPath)
      claudeArgs.push('--', prompt)

      // Run from a temp dir to avoid loading .mcp.json from the project folder
      const os = require('os')
      const tmpDir = os.tmpdir()

      const result = await new Promise((resolve, reject) => {
        const child = spawn('claude', claudeArgs, {
          cwd: tmpDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env },
        })

        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (d) => { stdout += d.toString() })
        child.stderr.on('data', (d) => { stderr += d.toString() })
        child.on('close', (code) => {
          if (code !== 0) reject(new Error(stderr || `Exit code ${code}`))
          else resolve(stdout.trim())
        })
      })

      // Save to history
      fresh.history = fresh.history || []
      fresh.history.push({ role: 'user', text: prompt, ts: Date.now() })
      fresh.history.push({ role: 'assistant', text: result, ts: Date.now() })
      fs.writeFileSync(resolved, JSON.stringify(fresh, null, 2))

      return result
    },

    getHistory() {
      const fresh = JSON.parse(fs.readFileSync(resolved, 'utf-8'))
      return fresh.history || []
    },

    getMemory() {
      const fresh = JSON.parse(fs.readFileSync(resolved, 'utf-8'))
      return fresh.memory || []
    },

    addMemory(text) {
      const fresh = JSON.parse(fs.readFileSync(resolved, 'utf-8'))
      fresh.memory = fresh.memory || []
      fresh.memory.push(text)
      fs.writeFileSync(resolved, JSON.stringify(fresh, null, 2))
    },
  }
}

async function pipe(runeFiles, prompt) {
  let currentInput = prompt
  const results = []

  for (let i = 0; i < runeFiles.length; i++) {
    const agent = load(runeFiles[i])
    const input = i > 0
      ? `Previous agent (${results[i-1].agent}) output:\n\n${currentInput}\n\nNow do your part:`
      : currentInput

    const output = await agent.send(input)
    results.push({ agent: agent.name, role: agent.role, output })
    currentInput = output
  }

  return { pipeline: results, finalOutput: currentInput }
}

/**
 * Backup a .rune file to md/json/rune format
 * @param {string} filePath - path to .rune file
 * @param {object} opts - { format: 'md'|'json'|'rune' }
 * @returns {{ content: string, filename: string }}
 */
function backup(filePath, opts = {}) {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Rune file not found: ${resolved}`)
  }

  const rune = JSON.parse(fs.readFileSync(resolved, 'utf-8'))
  const format = opts.format || 'md'
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const baseName = rune.name || path.basename(filePath, '.rune')

  if (format === 'md') {
    const lines = []
    lines.push(`# ${rune.name} — Conversation Backup\n`)
    lines.push(`- **Role**: ${rune.role || 'N/A'}`)
    lines.push(`- **Exported**: ${new Date().toISOString()}`)
    lines.push(`- **Messages**: ${(rune.history || []).length}\n`)

    if (rune.memory && rune.memory.length > 0) {
      lines.push(`## Memory\n`)
      rune.memory.forEach((m, i) => lines.push(`${i + 1}. ${m}`))
      lines.push('')
    }

    if (rune.history && rune.history.length > 0) {
      lines.push(`## Conversation\n`)
      for (const msg of rune.history) {
        const who = msg.role === 'user' ? '**User**' : '**Assistant**'
        const time = msg.ts ? new Date(msg.ts).toLocaleString() : ''
        lines.push(`### ${who} ${time ? `(${time})` : ''}\n`)
        lines.push(msg.text)
        lines.push('\n---\n')
      }
    }

    return { content: lines.join('\n'), filename: `${baseName}-backup-${ts}.md` }
  }

  if (format === 'json') {
    return {
      content: JSON.stringify({ ...rune, _backup: { exportedAt: new Date().toISOString(), sourceFile: resolved } }, null, 2),
      filename: `${baseName}-backup-${ts}.json`,
    }
  }

  if (format === 'rune') {
    return {
      content: JSON.stringify(rune, null, 2),
      filename: `${baseName}-backup-${ts}.rune`,
    }
  }

  throw new Error(`Unknown format: ${format}`)
}

/**
 * Send an inbound message to a .rune agent
 * @param {string} filePath - path to .rune file
 * @param {string} message - the message text
 * @param {object} opts - { source: string }
 */
function inbound(filePath, message, opts = {}) {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Rune file not found: ${resolved}`)
  }

  const rune = JSON.parse(fs.readFileSync(resolved, 'utf-8'))
  rune.history = rune.history || []
  rune.history.push({
    role: 'user',
    text: message,
    ts: Date.now(),
    source: opts.source || 'external',
  })
  fs.writeFileSync(resolved, JSON.stringify(rune, null, 2))

  return { agent: rune.name, queued: true, historyLength: rune.history.length }
}

module.exports = { load, pipe, backup, inbound }
