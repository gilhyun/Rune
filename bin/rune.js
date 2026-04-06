#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const [,, command, ...args] = process.argv

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// ── Commands ────────────────────────────────────

switch (command) {
  case 'new':     return createRune(args[0], args)
  case 'run':     return runRune(args[0], args.slice(1))
  case 'pipe':    return pipeRunes(args)
  case 'loop':    return loopRunes(args)
  case 'watch':   return watchRune(args[0], args.slice(1))
  case 'list':    return listRunes()
  case 'backup':  return backupRune(args[0], args.slice(1))
  case 'inbound': return inboundRune(args[0], args.slice(1))
  case 'open':
    console.log('  ℹ️  `rune open` has been removed from the CLI.')
    console.log('     For a GUI, use RuneChat: https://github.com/gilhyun/runechat')
    process.exit(0)
  case 'install':
  case 'uninstall':
    console.log('  ℹ️  `rune install` / `rune uninstall` are no longer needed.')
    console.log('     Rune is now a pure CLI — install with: npm install -g openrune')
    process.exit(0)
  case 'help':
  case '--help':
  case '-h':
  default:        return showHelp()
}


// ── new ──────────────────────────────────────────

function createRune(name, allArgs) {
  if (!name) {
    console.log('Usage: rune new <name> [--role "role description"]')
    console.log('Example: rune new designer --role "UI/UX design expert"')
    process.exit(1)
  }

  // Parse --role flag
  let role = 'General assistant'
  const roleIdx = allArgs.indexOf('--role')
  if (roleIdx !== -1 && allArgs[roleIdx + 1]) {
    role = allArgs[roleIdx + 1]
  }

  const fileName = name.endsWith('.rune') ? name : `${name}.rune`
  const filePath = path.resolve(process.cwd(), fileName)

  if (fs.existsSync(filePath)) {
    console.log(`  ⚠️  ${fileName} already exists.`)
    process.exit(1)
  }

  const runeData = {
    name: name.replace('.rune', ''),
    role,
    icon: 'bot',
    createdAt: new Date().toISOString(),
    history: [],
  }

  fs.writeFileSync(filePath, JSON.stringify(runeData, null, 2))
  console.log(`🔮 Created ${fileName}`)
  console.log(`   Name: ${runeData.name}`)
  console.log(`   Role: ${runeData.role}`)
  console.log(`   Path: ${filePath}`)
  console.log('')
  console.log(`  Run: rune run ${fileName} "your prompt"`)
}


function runRune(file, restArgs) {
  if (!file) {
    console.log('Usage: rune run <file.rune> "prompt" [--auto] [--output json|text]')
    console.log('Example: rune run reviewer.rune "Review the latest commit"')
    console.log('         rune run coder.rune "Build a REST API server" --auto')
    process.exit(1)
  }

  const filePath = path.resolve(process.cwd(), file)
  if (!fs.existsSync(filePath)) {
    console.error(`  ❌ File not found: ${filePath}`)
    process.exit(1)
  }

  // Parse args: prompt and flags
  let prompt = ''
  let outputFormat = 'text'
  let autoMode = false
  let logFile = ''
  for (let i = 0; i < restArgs.length; i++) {
    if (restArgs[i] === '--output' && restArgs[i + 1]) {
      outputFormat = restArgs[i + 1]
      i++
    } else if (restArgs[i] === '--auto') {
      autoMode = true
    } else if (restArgs[i] === '--log' && restArgs[i + 1]) {
      logFile = restArgs[i + 1]
      i++
    } else if (!prompt) {
      prompt = restArgs[i]
    }
  }

  // Read from stdin if no prompt provided
  if (!prompt && process.stdin.isTTY === false) {
    prompt = fs.readFileSync('/dev/stdin', 'utf-8').trim()
  }

  if (!prompt) {
    console.error('  ❌ No prompt provided. Pass a prompt string or pipe via stdin.')
    process.exit(1)
  }

  const rune = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  const folderPath = path.dirname(filePath)

  // Build system prompt from .rune context
  const systemParts = []
  if (rune.role) systemParts.push(`Your role: ${rune.role}`)
  if (rune.memory && rune.memory.length > 0) {
    systemParts.push('Saved memory from previous sessions:')
    rune.memory.forEach((m, i) => systemParts.push(`${i + 1}. ${m}`))
  }
  if (rune.history && rune.history.length > 0) {
    const recent = rune.history.slice(-10)
    systemParts.push(`\nRecent conversation (${rune.history.length} total, showing last ${recent.length}):`)
    for (const msg of recent) {
      const who = msg.role === 'user' ? 'User' : 'Assistant'
      systemParts.push(`${who}: ${msg.text}`)
    }
  }

  const systemPrompt = systemParts.join('\n')

  // Build permissions args from .rune file
  function buildPermissionArgs(runeData) {
    const args = []
    if (runeData.permissions) {
      const p = runeData.permissions
      const allowed = []
      const disallowed = []

      if (p.fileWrite === false) disallowed.push('Write', 'Edit')
      if (p.bash === false) disallowed.push('Bash')
      if (p.network === false) disallowed.push('WebFetch', 'WebSearch')

      if (p.allowPaths && p.allowPaths.length > 0) {
        for (const ap of p.allowPaths) {
          allowed.push(`Read(${ap})`, `Glob(${ap})`, `Grep(${ap})`)
          if (p.fileWrite !== false) allowed.push(`Write(${ap})`, `Edit(${ap})`)
        }
      }
      if (p.denyPaths && p.denyPaths.length > 0) {
        for (const dp of p.denyPaths) {
          disallowed.push(`Read(${dp})`, `Write(${dp})`, `Edit(${dp})`, `Glob(${dp})`, `Grep(${dp})`)
        }
      }

      if (allowed.length > 0) args.push('--allowedTools', allowed.join(' '))
      if (disallowed.length > 0) args.push('--disallowedTools', disallowed.join(' '))
    }
    return args
  }

  // Logging
  const logEntries = []
  const logStart = Date.now()

  // Auto mode: agent can read/write files, run commands, fix errors autonomously
  if (autoMode) {
    console.log(`🔮 [auto] ${rune.name} is working on: ${prompt}\n`)

    const claudeArgs = ['-p', '--print',
      '--mcp-config', '{"mcpServers":{}}',
      '--strict-mcp-config',
      '--dangerously-skip-permissions',
      '--verbose',
      '--output-format', 'stream-json',
    ]
    // Apply permissions (override dangerously-skip if permissions are set)
    const permArgs = buildPermissionArgs(rune)
    claudeArgs.push(...permArgs)

    if (systemPrompt) {
      claudeArgs.push('--system-prompt', systemPrompt)
    }
    claudeArgs.push(prompt)

    const child = spawn('claude', claudeArgs, {
      cwd: folderPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let fullOutput = ''

    let buffer = ''
    child.stdout.on('data', (data) => {
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() // keep incomplete line in buffer
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)

          // Tool use events
          if (event.type === 'assistant' && event.message && event.message.content) {
            for (const block of event.message.content) {
              if (block.type === 'tool_use') {
                const tool = block.name || 'unknown'
                const input = block.input || {}
                logEntries.push({ type: 'tool_use', tool, input, ts: Date.now() })
                if (tool === 'Bash') {
                  console.log(`  ▶ Bash: ${(input.command || '').slice(0, 120)}`)
                } else if (tool === 'Write') {
                  console.log(`  ▶ Write: ${input.file_path || ''}`)
                } else if (tool === 'Edit') {
                  console.log(`  ▶ Edit: ${input.file_path || ''}`)
                } else if (tool === 'Read') {
                  console.log(`  ▶ Read: ${input.file_path || ''}`)
                } else if (tool === 'Grep') {
                  console.log(`  ▶ Grep: ${input.pattern || ''}`)
                } else if (tool === 'Glob') {
                  console.log(`  ▶ Glob: ${input.pattern || ''}`)
                } else {
                  console.log(`  ▶ ${tool}`)
                }
              } else if (block.type === 'text' && block.text && block.text.trim()) {
                console.log(`  💬 ${block.text.trim().slice(0, 200)}`)
              }
            }
          }

          // Tool results
          if (event.type === 'user' && event.tool_use_result) {
            logEntries.push({ type: 'tool_result', result: event.tool_use_result, ts: Date.now() })
          }

          // Final result
          if (event.type === 'result') {
            fullOutput = event.result || ''
            logEntries.push({ type: 'result', cost_usd: event.total_cost_usd, usage: event.usage, duration_ms: event.duration_ms, ts: Date.now() })
            if (fullOutput) console.log(`\n${fullOutput}`)
          }
        } catch {}
      }
    })

    child.stderr.on('data', (d) => { process.stderr.write(d) })

    child.on('close', (code) => {
      // Save to history
      rune.history = rune.history || []
      rune.history.push({ role: 'user', text: prompt, ts: Date.now() })
      rune.history.push({ role: 'assistant', text: fullOutput.trim(), ts: Date.now() })
      fs.writeFileSync(filePath, JSON.stringify(rune, null, 2))

      // Write structured log
      if (logFile) {
        const costEntry = logEntries.find(e => e.type === 'result')
        const log = {
          agent: rune.name,
          role: rune.role,
          prompt,
          mode: 'auto',
          permissions: rune.permissions || null,
          duration_ms: Date.now() - logStart,
          cost_usd: costEntry?.cost_usd || null,
          usage: costEntry?.usage || null,
          tool_calls: logEntries.filter(e => e.type === 'tool_use').map(e => ({ tool: e.tool, input: e.input, ts: e.ts })),
          result: fullOutput.trim(),
          exit_code: code,
          ts: new Date().toISOString(),
        }
        fs.writeFileSync(path.resolve(logFile), JSON.stringify(log, null, 2))
        console.log(`  📋 Log saved: ${logFile}`)
      }

      if (code !== 0) console.error(`\n  ⚠️  Agent exited with code ${code}`)
      else console.log(`\n✓ ${rune.name} finished`)
      process.exit(code || 0)
    })

    return
  }

  // Normal mode: print-only, no tool execution
  const claudeArgs = [
    '-p', '--print',
    '--mcp-config', '{"mcpServers":{}}',
    '--strict-mcp-config',
  ]
  if (systemPrompt) {
    claudeArgs.push('--system-prompt', systemPrompt + `\nWorking folder: ${folderPath}`)
  }
  if (outputFormat === 'json') {
    claudeArgs.push('--output-format', 'json')
  }
  claudeArgs.push('--', prompt)

  const child = spawn('claude', claudeArgs, {
    cwd: folderPath,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  })

  let stdout = ''
  let stderr = ''

  child.stdout.on('data', (data) => {
    const text = data.toString()
    stdout += text
    if (outputFormat !== 'json') process.stdout.write(text)
  })
  child.stderr.on('data', (data) => { stderr += data.toString() })

  child.on('close', (code) => {
    if (outputFormat === 'json') {
      try {
        const parsed = JSON.parse(stdout)
        console.log(JSON.stringify({ agent: rune.name, role: rune.role, response: parsed }, null, 2))
      } catch {
        console.log(JSON.stringify({ agent: rune.name, role: rune.role, response: stdout.trim() }, null, 2))
      }
    }

    // Save to history
    rune.history = rune.history || []
    rune.history.push({ role: 'user', text: prompt, ts: Date.now() })
    rune.history.push({ role: 'assistant', text: stdout.trim(), ts: Date.now() })
    fs.writeFileSync(filePath, JSON.stringify(rune, null, 2))

    if (code !== 0 && stderr) {
      console.error(stderr)
    }
    process.exit(code || 0)
  })
}

// ── pipe (agent chaining) ───────────────────────

async function pipeRunes(args) {
  // Parse: rune pipe agent1.rune agent2.rune ... "initial prompt" [--output json] [--auto]
  const runeFiles = []
  let prompt = ''
  let outputFormat = 'text'
  let autoMode = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      outputFormat = args[i + 1]
      i++
    } else if (args[i] === '--auto') {
      autoMode = true
    } else if (args[i].endsWith('.rune')) {
      runeFiles.push(args[i])
    } else if (!prompt) {
      prompt = args[i]
    }
  }

  if (runeFiles.length < 2 || !prompt) {
    console.log('Usage: rune pipe <agent1.rune> <agent2.rune> [...] "initial prompt" [--auto]')
    console.log('Example: rune pipe architect.rune coder.rune "Build a REST API" --auto')
    console.log('\nThe output of each agent becomes the input for the next.')
    console.log('With --auto, the last agent can write files and run commands.')
    process.exit(1)
  }

  // Read from stdin if no prompt
  if (!prompt && process.stdin.isTTY === false) {
    prompt = fs.readFileSync('/dev/stdin', 'utf-8').trim()
  }

  let currentInput = prompt
  const results = []

  for (let i = 0; i < runeFiles.length; i++) {
    const file = runeFiles[i]
    const filePath = path.resolve(process.cwd(), file)

    if (!fs.existsSync(filePath)) {
      console.error(`  ❌ File not found: ${filePath}`)
      process.exit(1)
    }

    const rune = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    const folderPath = path.dirname(filePath)

    const isLast = i === runeFiles.length - 1
    const pipeContext = i > 0
      ? `You are step ${i + 1} of ${runeFiles.length} in a pipeline. The previous agent (${results[i-1].agent}) produced the following output:\n\n${currentInput}\n\nNow do your part:`
      : currentInput

    if (outputFormat !== 'json') {
      console.error(`\n  ▶ [${i + 1}/${runeFiles.length}] ${rune.name} (${rune.role || 'assistant'})`)
    }

    // Build system prompt
    const systemParts = []
    if (rune.role) systemParts.push(`Your role: ${rune.role}`)
    if (rune.memory && rune.memory.length > 0) {
      systemParts.push('Saved memory:')
      rune.memory.forEach((m, j) => systemParts.push(`${j + 1}. ${m}`))
    }

    // Last agent in auto mode: can write files and run commands
    const useAuto = autoMode && isLast

    if (useAuto) {
      const claudeArgs = ['-p', '--print',
        '--mcp-config', '{"mcpServers":{}}',
        '--strict-mcp-config',
        '--dangerously-skip-permissions',
        '--verbose',
        '--output-format', 'stream-json',
      ]
      if (systemParts.length > 0) {
        claudeArgs.push('--system-prompt', systemParts.join('\n'))
      }
      claudeArgs.push(pipeContext)

      const output = await new Promise((resolve, reject) => {
        const child = spawn('claude', claudeArgs, {
          cwd: folderPath,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env },
        })

        let fullOutput = ''
        let buffer = ''
        child.stdout.on('data', (data) => {
          buffer += data.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop()
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const event = JSON.parse(line)
              if (event.type === 'assistant' && event.message && event.message.content) {
                for (const block of event.message.content) {
                  if (block.type === 'tool_use') {
                    const tool = block.name || 'unknown'
                    const input = block.input || {}
                    if (tool === 'Bash') console.log(`  ▶ Bash: ${(input.command || '').slice(0, 120)}`)
                    else if (tool === 'Write') console.log(`  ▶ Write: ${input.file_path || ''}`)
                    else if (tool === 'Edit') console.log(`  ▶ Edit: ${input.file_path || ''}`)
                    else if (tool === 'Read') console.log(`  ▶ Read: ${input.file_path || ''}`)
                    else console.log(`  ▶ ${tool}`)
                  } else if (block.type === 'text' && block.text && block.text.trim()) {
                    console.log(`  💬 ${block.text.trim().slice(0, 200)}`)
                  }
                }
              }
              if (event.type === 'result') {
                fullOutput = event.result || ''
                if (fullOutput) console.log(`\n${fullOutput}`)
              }
            } catch {}
          }
        })
        child.stderr.on('data', (d) => { process.stderr.write(d) })
        child.on('close', (code) => {
          if (code !== 0) reject(new Error(`Agent ${rune.name} exited with code ${code}`))
          else resolve(fullOutput.trim())
        })
      })

      results.push({ agent: rune.name, role: rune.role, output })
      rune.history = rune.history || []
      rune.history.push({ role: 'user', text: pipeContext, ts: Date.now() })
      rune.history.push({ role: 'assistant', text: output, ts: Date.now() })
      fs.writeFileSync(filePath, JSON.stringify(rune, null, 2))
      currentInput = output

    } else {
      // Normal pipe step: text output only
      const claudeArgs = [
        '-p', '--print',
        '--mcp-config', '{"mcpServers":{}}',
        '--strict-mcp-config',
      ]
      if (systemParts.length > 0) {
        claudeArgs.push('--system-prompt', systemParts.join('\n') + `\nWorking folder: ${folderPath}`)
      }
      claudeArgs.push('--', pipeContext)

      const output = await new Promise((resolve, reject) => {
        const child = spawn('claude', claudeArgs, {
          cwd: folderPath,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env },
        })

        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (d) => { stdout += d.toString() })
        child.stderr.on('data', (d) => { stderr += d.toString() })
        child.on('close', (code) => {
          if (code !== 0) reject(new Error(stderr || `Agent ${rune.name} exited with code ${code}`))
          else resolve(stdout.trim())
        })
      })

      results.push({ agent: rune.name, role: rune.role, output })
      rune.history = rune.history || []
      rune.history.push({ role: 'user', text: pipeContext, ts: Date.now() })
      rune.history.push({ role: 'assistant', text: output, ts: Date.now() })
      fs.writeFileSync(filePath, JSON.stringify(rune, null, 2))
      currentInput = output

      if (outputFormat !== 'json' && !isLast) {
        console.error(`  ✓ Done\n`)
      }
    }
  }

  // Final output
  if (outputFormat === 'json') {
    console.log(JSON.stringify({ pipeline: results, finalOutput: currentInput }, null, 2))
  } else {
    console.log(currentInput)
  }
}

// ── loop (self-correction) ──────────────────────

async function loopRunes(args) {
  // Parse: rune loop coder.rune reviewer.rune "prompt" [--until "condition"] [--max-iterations N] [--auto]
  const runeFiles = []
  let prompt = ''
  let untilCondition = ''
  let maxIterations = 5
  let autoMode = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--until' && args[i + 1]) {
      untilCondition = args[++i]
    } else if (args[i] === '--max-iterations' && args[i + 1]) {
      maxIterations = parseInt(args[++i], 10)
    } else if (args[i] === '--auto') {
      autoMode = true
    } else if (args[i].endsWith('.rune')) {
      runeFiles.push(args[i])
    } else if (!prompt) {
      prompt = args[i]
    }
  }

  if (runeFiles.length < 2 || !prompt) {
    console.log('Usage: rune loop <doer.rune> <reviewer.rune> "prompt" [--until "condition"] [--max-iterations N] [--auto]')
    console.log('')
    console.log('Options:')
    console.log('  --until "..."          Stop when the reviewer\'s output contains this text')
    console.log('  --max-iterations N     Maximum number of loop iterations (default: 5)')
    console.log('  --auto                 Allow agents to write files and run commands')
    console.log('')
    console.log('Example:')
    console.log('  rune loop coder.rune reviewer.rune "Build a REST API" --until "no critical issues" --max-iterations 3 --auto')
    console.log('')
    console.log('The first agent implements, the last agent reviews.')
    console.log('If the reviewer finds issues, feedback is sent back to the first agent automatically.')
    process.exit(1)
  }

  // Validate files
  for (const file of runeFiles) {
    const filePath = path.resolve(process.cwd(), file)
    if (!fs.existsSync(filePath)) {
      console.error(`  ❌ File not found: ${filePath}`)
      process.exit(1)
    }
  }

  const doerFile = runeFiles[0]
  const reviewerFile = runeFiles[runeFiles.length - 1]
  const doerPath = path.resolve(process.cwd(), doerFile)
  const reviewerPath = path.resolve(process.cwd(), reviewerFile)

  let currentPrompt = prompt
  let iteration = 0
  let converged = false

  console.log(`\n🔁 Starting self-correction loop (max ${maxIterations} iterations)`)
  if (untilCondition) console.log(`   Stop condition: "${untilCondition}"`)
  console.log('')

  while (iteration < maxIterations && !converged) {
    iteration++
    console.log(`  ━━━ Iteration ${iteration}/${maxIterations} ━━━\n`)

    // Step 1: Doer implements
    const doerRune = JSON.parse(fs.readFileSync(doerPath, 'utf-8'))
    const doerFolder = path.dirname(doerPath)
    const doerSystem = []
    if (doerRune.role) doerSystem.push(`Your role: ${doerRune.role}`)
    if (doerRune.memory && doerRune.memory.length > 0) {
      doerSystem.push('Saved memory:')
      doerRune.memory.forEach((m, j) => doerSystem.push(`${j + 1}. ${m}`))
    }

    const doerContext = iteration > 1
      ? `You are in iteration ${iteration} of a self-correction loop. The reviewer found issues with your previous work:\n\n${currentPrompt}\n\nFix the issues and improve your implementation.`
      : currentPrompt

    console.log(`  ▶ [doer] ${doerRune.name} (${doerRune.role || 'assistant'})`)

    const doerOutput = await runAgent(doerRune.name, doerFolder, doerSystem, doerContext, autoMode)

    doerRune.history = doerRune.history || []
    doerRune.history.push({ role: 'user', text: doerContext, ts: Date.now() })
    doerRune.history.push({ role: 'assistant', text: doerOutput, ts: Date.now() })
    fs.writeFileSync(doerPath, JSON.stringify(doerRune, null, 2))

    console.log(`  ✓ ${doerRune.name} done\n`)

    // Step 2: Reviewer reviews
    const reviewerRune = JSON.parse(fs.readFileSync(reviewerPath, 'utf-8'))
    const reviewerFolder = path.dirname(reviewerPath)
    const reviewerSystem = []
    if (reviewerRune.role) reviewerSystem.push(`Your role: ${reviewerRune.role}`)
    if (reviewerRune.memory && reviewerRune.memory.length > 0) {
      reviewerSystem.push('Saved memory:')
      reviewerRune.memory.forEach((m, j) => reviewerSystem.push(`${j + 1}. ${m}`))
    }

    const reviewerContext = `You are the reviewer in iteration ${iteration} of a self-correction loop. Review the work done by ${doerRune.name}:\n\n${doerOutput}\n\nIf there are issues, describe them clearly so the implementer can fix them. If the work is satisfactory, say so clearly.`

    console.log(`  ▶ [reviewer] ${reviewerRune.name} (${reviewerRune.role || 'assistant'})`)

    const reviewerOutput = await runAgent(reviewerRune.name, reviewerFolder, reviewerSystem, reviewerContext, false)

    reviewerRune.history = reviewerRune.history || []
    reviewerRune.history.push({ role: 'user', text: reviewerContext, ts: Date.now() })
    reviewerRune.history.push({ role: 'assistant', text: reviewerOutput, ts: Date.now() })
    fs.writeFileSync(reviewerPath, JSON.stringify(reviewerRune, null, 2))

    console.log(`  ✓ ${reviewerRune.name} done\n`)

    // Check convergence
    if (untilCondition) {
      const lower = reviewerOutput.toLowerCase()
      if (lower.includes(untilCondition.toLowerCase())) {
        converged = true
        console.log(`  ✅ Condition met: "${untilCondition}"`)
      }
    }

    if (!converged) {
      currentPrompt = reviewerOutput
    }
  }

  if (!converged && iteration >= maxIterations) {
    console.log(`  ⚠️  Max iterations (${maxIterations}) reached`)
  }

  console.log(`\n🔁 Loop completed after ${iteration} iteration${iteration > 1 ? 's' : ''}\n`)
}

async function runAgent(name, folderPath, systemParts, prompt, autoMode) {
  if (autoMode) {
    const claudeArgs = ['-p', '--print',
      '--mcp-config', '{"mcpServers":{}}',
      '--strict-mcp-config',
      '--dangerously-skip-permissions',
      '--verbose',
      '--output-format', 'stream-json',
    ]
    if (systemParts.length > 0) {
      claudeArgs.push('--system-prompt', systemParts.join('\n'))
    }
    claudeArgs.push(prompt)

    const output = await new Promise((resolve, reject) => {
      const child = spawn('claude', claudeArgs, {
        cwd: folderPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      let fullOutput = ''
      let buffer = ''
      child.stdout.on('data', (data) => {
        buffer += data.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)
            if (event.type === 'assistant' && event.message && event.message.content) {
              for (const block of event.message.content) {
                if (block.type === 'tool_use') {
                  const tool = block.name || 'unknown'
                  const input = block.input || {}
                  if (tool === 'Bash') console.log(`    ▶ Bash: ${(input.command || '').slice(0, 120)}`)
                  else if (tool === 'Write') console.log(`    ▶ Write: ${input.file_path || ''}`)
                  else if (tool === 'Edit') console.log(`    ▶ Edit: ${input.file_path || ''}`)
                  else if (tool === 'Read') console.log(`    ▶ Read: ${input.file_path || ''}`)
                  else console.log(`    ▶ ${tool}`)
                } else if (block.type === 'text' && block.text && block.text.trim()) {
                  console.log(`    💬 ${block.text.trim().slice(0, 200)}`)
                }
              }
            }
            if (event.type === 'result') {
              fullOutput = event.result || ''
            }
          } catch {}
        }
      })
      child.stderr.on('data', (d) => { process.stderr.write(d) })
      child.on('close', (code) => {
        if (code !== 0) reject(new Error(`Agent ${name} exited with code ${code}`))
        else resolve(fullOutput.trim())
      })
    })

    return output
  } else {
    const claudeArgs = [
      '-p', '--print',
      '--mcp-config', '{"mcpServers":{}}',
      '--strict-mcp-config',
    ]
    if (systemParts.length > 0) {
      claudeArgs.push('--system-prompt', systemParts.join('\n') + `\nWorking folder: ${folderPath}`)
    }
    claudeArgs.push('--', prompt)

    const output = await new Promise((resolve, reject) => {
      const child = spawn('claude', claudeArgs, {
        cwd: folderPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      let stdout = ''
      child.stdout.on('data', (d) => { stdout += d.toString() })
      child.stderr.on('data', (d) => { process.stderr.write(d) })
      child.on('close', (code) => {
        if (code !== 0) reject(new Error(`Agent ${name} exited with code ${code}`))
        else resolve(stdout.trim())
      })
    })

    return output
  }
}

// ── watch (triggers) ────────────────────────────

function watchRune(file, restArgs) {
  if (!file) {
    console.log('Usage: rune watch <file.rune> --on <event> [options]')
    console.log('')
    console.log('Events:')
    console.log('  file-change    Watch for file changes in the project folder')
    console.log('  git-push       Run after git push (installs a git hook)')
    console.log('  git-commit     Run after git commit (installs a git hook)')
    console.log('  cron           Run on a schedule (e.g. --interval 5m)')
    console.log('')
    console.log('Options:')
    console.log('  --prompt "..."       The prompt to send when triggered')
    console.log('  --glob "*.ts"        File pattern to watch (for file-change)')
    console.log('  --interval 5m        Interval for cron (e.g. 30s, 5m, 1h)')
    console.log('')
    console.log('Examples:')
    console.log('  rune watch reviewer.rune --on file-change --glob "src/**/*.ts" --prompt "Review changed files"')
    console.log('  rune watch reviewer.rune --on git-commit --prompt "Review this commit"')
    console.log('  rune watch monitor.rune --on cron --interval 5m --prompt "Check server status"')
    process.exit(1)
  }

  const filePath = path.resolve(process.cwd(), file)
  if (!fs.existsSync(filePath)) {
    console.error(`  ❌ File not found: ${filePath}`)
    process.exit(1)
  }

  // Parse args
  let event = ''
  let prompt = ''
  let glob = ''
  let interval = '5m'

  for (let i = 0; i < restArgs.length; i++) {
    if (restArgs[i] === '--on' && restArgs[i + 1]) { event = restArgs[++i] }
    else if (restArgs[i] === '--prompt' && restArgs[i + 1]) { prompt = restArgs[++i] }
    else if (restArgs[i] === '--glob' && restArgs[i + 1]) { glob = restArgs[++i] }
    else if (restArgs[i] === '--interval' && restArgs[i + 1]) { interval = restArgs[++i] }
  }

  if (!event) {
    console.error('  ❌ --on <event> is required')
    process.exit(1)
  }

  if (!prompt) {
    console.error('  ❌ --prompt is required')
    process.exit(1)
  }

  const rune = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  const folderPath = path.dirname(filePath)

  function triggerRun(triggerInfo) {
    const fullPrompt = triggerInfo
      ? `[Triggered by: ${triggerInfo}]\n\n${prompt}`
      : prompt
    console.log(`\n🔮 [${new Date().toLocaleTimeString()}] Triggered: ${rune.name} — ${triggerInfo || event}`)

    const systemParts = []
    if (rune.role) systemParts.push(`Your role: ${rune.role}`)

    const claudeArgs = ['-p', '--print', '--bare']
    if (systemParts.length > 0) {
      claudeArgs.push('--system-prompt', systemParts.join('\n'))
    }
    claudeArgs.push(fullPrompt)

    const child = spawn('claude', claudeArgs, {
      cwd: folderPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let stdout = ''
    child.stdout.on('data', (d) => {
      const text = d.toString()
      stdout += text
      process.stdout.write(text)
    })
    child.stderr.on('data', (d) => { process.stderr.write(d) })
    child.on('close', () => {
      // Save to history
      const fresh = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      fresh.history = fresh.history || []
      fresh.history.push({ role: 'user', text: fullPrompt, ts: Date.now() })
      fresh.history.push({ role: 'assistant', text: stdout.trim(), ts: Date.now() })
      fs.writeFileSync(filePath, JSON.stringify(fresh, null, 2))
      console.log(`\n✓ Done`)
    })
  }

  // ── Event handlers ──

  if (event === 'file-change') {
    const watchDir = folderPath
    console.log(`🔮 Watching ${watchDir} for file changes...`)
    if (glob) console.log(`   Pattern: ${glob}`)
    console.log(`   Agent: ${rune.name} (${rune.role || 'assistant'})`)
    console.log('   Press Ctrl+C to stop\n')

    let debounce = null
    fs.watch(watchDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return
      if (filename.endsWith('.rune')) return  // ignore .rune file changes
      if (filename.startsWith('.git')) return
      if (filename.includes('node_modules')) return

      // Simple glob matching
      if (glob) {
        const ext = glob.replace('*', '')
        if (!filename.endsWith(ext) && !filename.includes(glob.replace('*', ''))) return
      }

      // Debounce: wait 1s after last change
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        triggerRun(`file changed: ${filename}`)
      }, 1000)
    })
  }

  else if (event === 'git-commit' || event === 'git-push') {
    const hookName = event === 'git-commit' ? 'post-commit' : 'post-push'
    const gitDir = path.join(folderPath, '.git', 'hooks')

    if (!fs.existsSync(path.join(folderPath, '.git'))) {
      console.error('  ❌ Not a git repository')
      process.exit(1)
    }

    ensureDir(gitDir)

    // For git-push, use pre-push since post-push doesn't exist natively
    const actualHook = event === 'git-push' ? 'pre-push' : 'post-commit'
    const hookPath = path.join(gitDir, actualHook)
    const runeBin = path.resolve(__dirname, 'rune.js')
    const nodebin = process.execPath

    const hookScript = `#!/bin/bash
# Rune auto-trigger: ${rune.name}
"${nodebin}" "${runeBin}" run "${filePath}" "${prompt.replace(/"/g, '\\"')}" &
`

    // Append if hook exists, create if not
    if (fs.existsSync(hookPath)) {
      const existing = fs.readFileSync(hookPath, 'utf-8')
      if (!existing.includes('Rune auto-trigger')) {
        fs.appendFileSync(hookPath, '\n' + hookScript)
      } else {
        console.log(`  ⚠️  Rune hook already installed in ${actualHook}`)
        return
      }
    } else {
      fs.writeFileSync(hookPath, hookScript, { mode: 0o755 })
    }

    console.log(`🔮 Git hook installed: ${actualHook}`)
    console.log(`   Agent: ${rune.name} will run on every ${event.replace('git-', '')}`)
    console.log(`   Prompt: "${prompt}"`)
    console.log(`   Hook: ${hookPath}`)
  }

  else if (event === 'cron') {
    const ms = parseInterval(interval)
    console.log(`🔮 Running ${rune.name} every ${interval}`)
    console.log(`   Prompt: "${prompt}"`)
    console.log('   Press Ctrl+C to stop\n')

    // Run immediately, then on interval
    triggerRun(`cron (every ${interval})`)
    setInterval(() => {
      triggerRun(`cron (every ${interval})`)
    }, ms)
  }

  else {
    console.error(`  ❌ Unknown event: ${event}. Use: file-change, git-commit, git-push, cron`)
    process.exit(1)
  }
}

function parseInterval(str) {
  const match = str.match(/^(\d+)(s|m|h)$/)
  if (!match) {
    console.error(`  ❌ Invalid interval: ${str}. Use format like 30s, 5m, 1h`)
    process.exit(1)
  }
  const num = parseInt(match[1])
  const unit = match[2]
  if (unit === 's') return num * 1000
  if (unit === 'm') return num * 60 * 1000
  if (unit === 'h') return num * 60 * 60 * 1000
}

// ── list ─────────────────────────────────────────

function listRunes() {
  const cwd = process.cwd()
  const files = fs.readdirSync(cwd).filter(f => f.endsWith('.rune'))

  if (files.length === 0) {
    console.log('  No .rune files in current directory.')
    console.log('  Create one with: rune new <name>')
    return
  }

  console.log(`🔮 Rune files in ${cwd}:\n`)
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(cwd, file), 'utf-8'))
      const msgs = (data.history || []).length
      console.log(`  ${file}`)
      console.log(`    Name: ${data.name || '?'}  Role: ${data.role || '?'}  Messages: ${msgs}`)
    } catch {
      console.log(`  ${file}  (invalid)`)
    }
  }
}

// ── backup ──────────────────────────────────────

function backupRune(file, restArgs) {
  if (!file) {
    console.log('Usage: rune backup <file.rune> [--format md|json|rune] [--output <path>]')
    console.log('')
    console.log('Formats:')
    console.log('  md     Markdown — readable conversation export (default)')
    console.log('  json   JSON — full data including memory and metadata')
    console.log('  rune   Clone — timestamped copy of the .rune file')
    console.log('')
    console.log('Examples:')
    console.log('  rune backup reviewer.rune')
    console.log('  rune backup reviewer.rune --format json')
    console.log('  rune backup reviewer.rune --format rune --output backups/')
    process.exit(1)
  }

  const filePath = path.resolve(process.cwd(), file)
  if (!fs.existsSync(filePath)) {
    console.error(`  ❌ File not found: ${filePath}`)
    process.exit(1)
  }

  // Parse args
  let format = 'md'
  let outputPath = ''
  for (let i = 0; i < restArgs.length; i++) {
    if (restArgs[i] === '--format' && restArgs[i + 1]) { format = restArgs[++i] }
    else if (restArgs[i] === '--output' && restArgs[i + 1]) { outputPath = restArgs[++i] }
  }

  const rune = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const baseName = rune.name || path.basename(file, '.rune')

  let outFile, content

  if (format === 'md') {
    outFile = `${baseName}-backup-${ts}.md`
    const lines = []
    lines.push(`# ${rune.name} — Conversation Backup`)
    lines.push(``)
    lines.push(`- **Role**: ${rune.role || 'N/A'}`)
    lines.push(`- **Created**: ${rune.createdAt || 'N/A'}`)
    lines.push(`- **Exported**: ${new Date().toISOString()}`)
    lines.push(`- **Messages**: ${(rune.history || []).length}`)
    lines.push(``)

    if (rune.memory && rune.memory.length > 0) {
      lines.push(`## Memory`)
      lines.push(``)
      rune.memory.forEach((m, i) => lines.push(`${i + 1}. ${m}`))
      lines.push(``)
    }

    if (rune.history && rune.history.length > 0) {
      lines.push(`## Conversation`)
      lines.push(``)
      for (const msg of rune.history) {
        const who = msg.role === 'user' ? '**User**' : '**Assistant**'
        const time = msg.ts ? new Date(msg.ts).toLocaleString() : ''
        lines.push(`### ${who} ${time ? `(${time})` : ''}`)
        lines.push(``)
        lines.push(msg.text)
        lines.push(``)
        lines.push(`---`)
        lines.push(``)
      }
    }

    content = lines.join('\n')

  } else if (format === 'json') {
    outFile = `${baseName}-backup-${ts}.json`
    content = JSON.stringify({
      ...rune,
      _backup: {
        exportedAt: new Date().toISOString(),
        sourceFile: filePath,
        messageCount: (rune.history || []).length,
      }
    }, null, 2)

  } else if (format === 'rune') {
    outFile = `${baseName}-backup-${ts}.rune`
    content = JSON.stringify(rune, null, 2)

  } else {
    console.error(`  ❌ Unknown format: ${format}. Use: md, json, rune`)
    process.exit(1)
  }

  // Resolve output path
  if (outputPath) {
    const resolved = path.resolve(process.cwd(), outputPath)
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      outFile = path.join(resolved, outFile)
    } else {
      // Treat as file path
      outFile = resolved
    }
  } else {
    outFile = path.resolve(process.cwd(), outFile)
  }

  // Ensure parent dir exists
  const outDir = path.dirname(outFile)
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  fs.writeFileSync(outFile, content)

  const stats = {
    messages: (rune.history || []).length,
    memory: (rune.memory || []).length,
    size: fs.statSync(outFile).size,
  }

  console.log(`📦 Backup created`)
  console.log(`   Agent: ${rune.name} (${rune.role || 'N/A'})`)
  console.log(`   Format: ${format}`)
  console.log(`   Messages: ${stats.messages}, Memory: ${stats.memory}`)
  console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`)
  console.log(`   Output: ${outFile}`)
}


// ── inbound ─────────────────────────────────────

function inboundRune(file, restArgs) {
  if (!file) {
    console.log('Usage: rune inbound <file.rune> "message" [--run] [--auto] [--source <name>]')
    console.log('')
    console.log('Options:')
    console.log('  --run              Send the message and immediately run the agent')
    console.log('  --auto             Run in auto mode (agent can write files, run commands)')
    console.log('  --source <name>    Label the message source (default: "external")')
    console.log('')
    console.log('Without --run, the message is queued in history for the next rune run.')
    console.log('')
    console.log('Examples:')
    console.log('  rune inbound reviewer.rune "PR #42 is ready for review" --run')
    console.log('  rune inbound coder.rune "Build failed, fix it" --run --auto')
    console.log('  rune inbound monitor.rune "Deploy complete" --source deploy-bot')
    console.log('  echo "Error log..." | rune inbound coder.rune --run --auto')
    process.exit(1)
  }

  const filePath = path.resolve(process.cwd(), file)
  if (!fs.existsSync(filePath)) {
    console.error(`  ❌ File not found: ${filePath}`)
    process.exit(1)
  }

  // Parse args
  let message = ''
  let shouldRun = false
  let autoMode = false
  let source = 'external'

  for (let i = 0; i < restArgs.length; i++) {
    if (restArgs[i] === '--run') { shouldRun = true }
    else if (restArgs[i] === '--auto') { autoMode = true; shouldRun = true }
    else if (restArgs[i] === '--source' && restArgs[i + 1]) { source = restArgs[++i] }
    else if (!message) { message = restArgs[i] }
  }

  // Read from stdin if no message
  if (!message && process.stdin.isTTY === false) {
    message = fs.readFileSync('/dev/stdin', 'utf-8').trim()
  }

  if (!message) {
    console.error('  ❌ No message provided. Pass a message string or pipe via stdin.')
    process.exit(1)
  }

  const rune = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

  // Add message to history with source metadata
  rune.history = rune.history || []
  rune.history.push({
    role: 'user',
    text: message,
    ts: Date.now(),
    source,
  })
  fs.writeFileSync(filePath, JSON.stringify(rune, null, 2))

  console.log(`📨 Message delivered to ${rune.name}`)
  console.log(`   From: ${source}`)
  console.log(`   Text: ${message.slice(0, 100)}${message.length > 100 ? '...' : ''}`)

  if (!shouldRun) {
    console.log(`   Status: Queued (will be seen on next rune run)`)
    console.log(`\n   To run now: rune run ${file} "continue"`)
    return
  }

  // Run the agent with the inbound message
  console.log(`   Status: Running agent...\n`)

  const runArgs = [file, message]
  if (autoMode) runArgs.push('--auto')

  return runRune(file, runArgs.slice(1))
}


// ── help ─────────────────────────────────────────

function showHelp() {
  console.log(`
🔮 Rune — File-based AI Agent Toolkit (CLI)

Usage:
  rune new <name>           Create a new .rune file in current directory
    --role "description"    Set the agent's role
  rune run <file.rune> "prompt"   Run agent headlessly
    --auto                  Auto mode: agent writes files, runs commands, fixes errors
    --output json|text      Output format (default: text)
    --log <file.json>       Save structured log (tool calls, cost, duration)
  rune pipe <a.rune> <b.rune> ... "prompt"   Chain agents in a pipeline
    --auto                  Last agent can write files and run commands
  rune loop <doer.rune> <reviewer.rune> "prompt"   Self-correction loop
    --until "condition"     Stop when reviewer output contains this text
    --max-iterations N      Max iterations (default: 5)
    --auto                  Allow agents to write files and run commands
  rune watch <file.rune>    Set up automated triggers
    --on <event>            Event: file-change, git-commit, git-push, cron
    --prompt "..."          Prompt to send when triggered
    --glob "*.ts"           File pattern (for file-change)
    --interval 5m           Schedule interval (for cron: 30s, 5m, 1h)
  rune backup <file.rune>   Export agent conversation/data
    --format md|json|rune   Output format (default: md)
    --output <path>         Output file or directory
  rune inbound <file.rune> "msg"   Send external message to agent
    --run                   Immediately run the agent after delivery
    --auto                  Run in auto mode (implies --run)
    --source <name>         Label the message source (default: "external")
  rune list                 List .rune files in current directory
  rune help                 Show this help

Examples:
  rune new reviewer --role "Code reviewer, security focused"
  rune run reviewer.rune "Review the latest commit"
  rune pipe coder.rune reviewer.rune "Implement a login page"
  rune loop coder.rune reviewer.rune "Build a REST API" --until "no critical issues" --max-iterations 3 --auto
  rune watch reviewer.rune --on git-commit --prompt "Review this commit"
  rune backup reviewer.rune --format md
  rune inbound coder.rune "Build failed, fix it" --run --auto
  echo "Error log..." | rune inbound coder.rune --run --auto
  echo "Fix the bug in auth.ts" | rune run backend.rune

Looking for a GUI? Check out RuneChat: https://github.com/gilhyun/runechat
`)
}
