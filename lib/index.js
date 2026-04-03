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

module.exports = { load, pipe }
