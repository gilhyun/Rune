#!/usr/bin/env node

const { execSync, spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

// Platform check
const IS_MAC = process.platform === 'darwin'
const IS_WIN = process.platform === 'win32'

const RUNE_HOME = path.join(os.homedir(), '.rune')
const APP_DIR = path.join(RUNE_HOME, 'app')
const QUICK_ACTION_DIR = IS_MAC ? path.join(os.homedir(), 'Library', 'Services') : null

const [,, command, ...args] = process.argv

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// ── Commands ────────────────────────────────────

switch (command) {
  case 'install': return install()
  case 'new':     return createRune(args[0], args)
  case 'open':    return openRune(args[0])
  case 'run':     return runRune(args[0], args.slice(1))
  case 'pipe':    return pipeRunes(args)
  case 'watch':   return watchRune(args[0], args.slice(1))
  case 'list':    return listRunes()
  case 'uninstall': return uninstall()
  case 'help':
  case '--help':
  case '-h':
  default:        return showHelp()
}

// ── install ──────────────────────────────────────

function install() {
  console.log('🔮 Installing Rune...\n')
  ensureDir(RUNE_HOME)
  ensureDir(APP_DIR)

  // 1. Build the app (dev mode: use local source)
  const projectRoot = path.resolve(__dirname, '..')
  console.log('  Building Rune app...')
  try {
    execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' })
  } catch (e) {
    console.error('  ❌ Build failed')
    process.exit(1)
  }

  // 2. Rebuild native modules for Electron (node-pty)
  console.log('  Rebuilding native modules for Electron...')
  try {
    execSync('npx electron-rebuild -m .', { cwd: projectRoot, stdio: 'inherit' })
    console.log('  ✅ Native modules rebuilt')
  } catch (e) {
    console.error('  ⚠️  electron-rebuild failed (terminal may not work)')
  }

  // 3. Store project path for later use
  fs.writeFileSync(path.join(RUNE_HOME, 'project-path'), projectRoot)
  console.log(`  ✅ App built at ${projectRoot}`)

  // 3. Install macOS Quick Action for right-click menu
  if (IS_MAC) {
    installQuickAction(projectRoot)
  }

  // 4. Register .rune file association (macOS)
  if (IS_MAC) {
    registerFileAssociation(projectRoot)
  }

  // 5. Install Claude Code channel plugin
  installChannelPlugin()

  console.log('\n🔮 Rune installed successfully!\n')
  console.log('  Usage:')
  console.log('    Right-click any folder → Quick Actions → New Rune')
  console.log('    Double-click any .rune file to open')
  console.log('    rune new <name>       Create .rune file in current directory')
  console.log('    rune open <file>      Open a .rune file')
  console.log('    rune list             List .rune files in current directory')
  console.log('')
}

function installQuickAction(projectRoot) {
  console.log('  Installing macOS Quick Action...')

  ensureDir(QUICK_ACTION_DIR)

  // Remove old workflow if exists
  const workflowDir = path.join(QUICK_ACTION_DIR, 'New Rune.workflow')
  if (fs.existsSync(workflowDir)) {
    fs.rmSync(workflowDir, { recursive: true })
  }

  // Create helper shell script that the Quick Action will call
  const helperScript = path.join(RUNE_HOME, 'create-rune.sh')
  const nodebin = process.execPath
  const runeBin = path.resolve(__dirname, 'rune.js')

  // Write the helper shell script
  const scriptContent = `#!/bin/bash
# Get the folder path — works for both file and folder right-clicks
INPUT="$1"
if [ -z "$INPUT" ]; then
  INPUT=$(osascript -e 'tell application "Finder" to get POSIX path of (target of front Finder window as alias)' 2>/dev/null)
fi
if [ -z "$INPUT" ]; then
  INPUT="$HOME"
fi
# If input is a file, use its parent directory
if [ -f "$INPUT" ]; then
  FOLDER=$(dirname "$INPUT")
else
  FOLDER="$INPUT"
fi
# Remove trailing slash
FOLDER="\${FOLDER%/}"

# Create .rune file with folder name as agent name
NAME=$(basename "$FOLDER")
FILEPATH="$FOLDER/$NAME.rune"

cat > "$FILEPATH" << RUNEEOF
{
  "name": "$NAME",
  "role": "General assistant",
  "icon": "bot",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "history": []
}
RUNEEOF
`
  fs.writeFileSync(helperScript, scriptContent, { mode: 0o755 })

  // Create workflow directory structure
  const contentsDir = path.join(workflowDir, 'Contents')
  ensureDir(contentsDir)

  const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSServices</key>
	<array>
		<dict>
			<key>NSMenuItem</key>
			<dict>
				<key>default</key>
				<string>New Rune</string>
			</dict>
			<key>NSMessage</key>
			<string>runWorkflowAsService</string>
			<key>NSRequiredContext</key>
			<dict/>
			<key>NSSendFileTypes</key>
			<array>
				<string>public.item</string>
			</array>
		</dict>
	</array>
</dict>
</plist>`

  const wflow = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>AMApplicationBuild</key>
	<string>523</string>
	<key>AMApplicationVersion</key>
	<string>2.10</string>
	<key>AMDocumentVersion</key>
	<string>2</string>
	<key>actions</key>
	<array>
		<dict>
			<key>action</key>
			<dict>
				<key>AMAccepts</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Optional</key>
					<true/>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.path</string>
					</array>
				</dict>
				<key>AMActionVersion</key>
				<string>2.0.3</string>
				<key>AMApplication</key>
				<array>
					<string>Automator</string>
				</array>
				<key>AMParameterProperties</key>
				<dict>
					<key>COMMAND_STRING</key>
					<dict/>
					<key>CheckedForUserDefaultShell</key>
					<dict/>
					<key>inputMethod</key>
					<dict/>
					<key>shell</key>
					<dict/>
					<key>source</key>
					<dict/>
				</dict>
				<key>AMProvides</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.path</string>
					</array>
				</dict>
				<key>ActionBundlePath</key>
				<string>/System/Library/Automator/Run Shell Script.action</string>
				<key>ActionName</key>
				<string>Run Shell Script</string>
				<key>ActionParameters</key>
				<dict>
					<key>COMMAND_STRING</key>
					<string>"${helperScript}" "$@"</string>
					<key>CheckedForUserDefaultShell</key>
					<true/>
					<key>inputMethod</key>
					<integer>1</integer>
					<key>shell</key>
					<string>/bin/bash</string>
					<key>source</key>
					<string></string>
				</dict>
				<key>BundleIdentifier</key>
				<string>com.apple.RunShellScript</string>
				<key>CFBundleVersion</key>
				<string>2.0.3</string>
				<key>CanShowSelectedItemsWhenRun</key>
				<false/>
				<key>CanShowWhenRun</key>
				<true/>
				<key>Category</key>
				<array>
					<string>AMCategoryUtilities</string>
				</array>
				<key>Class Name</key>
				<string>RunShellScriptAction</string>
				<key>InputUUID</key>
				<string>A5C0F22C-6B6A-4E8E-8B6A-1F6C4E5D3A2B</string>
				<key>Keywords</key>
				<array>
					<string>Shell</string>
					<string>Script</string>
				</array>
				<key>OutputUUID</key>
				<string>B7D1F33D-7C7B-5F9F-9C7B-2A7D5F6E4B3C</string>
				<key>UUID</key>
				<string>C8E2A44E-8D8C-6A0A-0D8C-3A8E6A7F5C4D</string>
				<key>UnlocalizedApplications</key>
				<array>
					<string>Automator</string>
				</array>
				<key>arguments</key>
				<dict>
					<key>0</key>
					<dict>
						<key>default value</key>
						<string>/bin/bash</string>
						<key>name</key>
						<string>shell</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
					</dict>
					<key>1</key>
					<dict>
						<key>default value</key>
						<string></string>
						<key>name</key>
						<string>COMMAND_STRING</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
					</dict>
					<key>2</key>
					<dict>
						<key>default value</key>
						<integer>1</integer>
						<key>name</key>
						<string>inputMethod</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
					</dict>
					<key>3</key>
					<dict>
						<key>default value</key>
						<string></string>
						<key>name</key>
						<string>source</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
					</dict>
				</dict>
				<key>isViewVisible</key>
				<true/>
				<key>location</key>
				<string>309.000000:627.000000</string>
				<key>nibPath</key>
				<string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
			</dict>
		</dict>
	</array>
	<key>connectors</key>
	<dict/>
	<key>workflowMetaData</key>
	<dict>
		<key>serviceInputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject</string>
		<key>serviceApplicationBundleID</key>
		<string>com.apple.Finder</string>
		<key>workflowTypeIdentifier</key>
		<string>com.apple.Automator.servicesMenu</string>
	</dict>
</dict>
</plist>`

  fs.writeFileSync(path.join(contentsDir, 'Info.plist'), infoPlist)
  fs.writeFileSync(path.join(contentsDir, 'document.wflow'), wflow)

  // Flush services cache
  try {
    execSync('/System/Library/CoreServices/pbs -flush', { stdio: 'ignore' })
  } catch {}
  try {
    execSync('/System/Library/CoreServices/pbs -update', { stdio: 'ignore' })
  } catch {}

  console.log('  ✅ Quick Action installed: Right-click folder → Quick Actions → New Rune')
  console.log('  💡 If not visible, go to System Settings → Extensions → Finder → enable "New Rune"')
}

function registerFileAssociation(projectRoot) {
  console.log('  Registering .rune file association...')

  // Find the actual Electron binary (not the Node wrapper script)
  const electronBinary = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')

  // Create a minimal .app wrapper for macOS file association
  const appDir = path.join(APP_DIR, 'Rune.app')
  // Remove old app if exists
  if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true })
  const appContents = path.join(appDir, 'Contents')
  const appMacOS = path.join(appContents, 'MacOS')
  ensureDir(appMacOS)

  // Info.plist with file association
  const appPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleIdentifier</key>
	<string>com.studio-h.rune</string>
	<key>CFBundleName</key>
	<string>Rune</string>
	<key>CFBundleDisplayName</key>
	<string>Rune</string>
	<key>CFBundleVersion</key>
	<string>0.1.0</string>
	<key>CFBundleShortVersionString</key>
	<string>0.1.0</string>
	<key>CFBundleExecutable</key>
	<string>rune-launcher</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>LSMinimumSystemVersion</key>
	<string>10.15</string>
	<key>CFBundleDocumentTypes</key>
	<array>
		<dict>
			<key>CFBundleTypeExtensions</key>
			<array>
				<string>rune</string>
			</array>
			<key>CFBundleTypeName</key>
			<string>Rune Agent File</string>
			<key>CFBundleTypeRole</key>
			<string>Editor</string>
			<key>LSHandlerRank</key>
			<string>Owner</string>
			<key>LSItemContentTypes</key>
			<array>
				<string>com.studio-h.rune</string>
			</array>
		</dict>
	</array>
	<key>UTExportedTypeDeclarations</key>
	<array>
		<dict>
			<key>UTTypeConformsTo</key>
			<array>
				<string>public.json</string>
			</array>
			<key>UTTypeDescription</key>
			<string>Rune Agent File</string>
			<key>UTTypeIdentifier</key>
			<string>com.studio-h.rune</string>
			<key>UTTypeTagSpecification</key>
			<dict>
				<key>public.filename-extension</key>
				<array>
					<string>rune</string>
				</array>
			</dict>
		</dict>
	</array>
	<key>LSUIElement</key>
	<true/>
</dict>
</plist>`

  fs.writeFileSync(path.join(appContents, 'Info.plist'), appPlist)

  // Launcher script — dynamically finds the rune binary and uses it to resolve Electron
  const runeBin = path.resolve(__dirname, 'rune.js')
  const nodebin = process.execPath
  const launcherScript = `#!/bin/bash
# Dynamically resolve Rune's install location via the CLI binary
RUNE_BIN="${runeBin}"
RUNE_PROJECT="$(dirname "$(dirname "$RUNE_BIN")")"

# Find Electron binary
ELECTRON="$RUNE_PROJECT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"

if [ ! -f "$ELECTRON" ]; then
  # Fallback: try the path saved by rune install
  if [ -f "$HOME/.rune/project-path" ]; then
    RUNE_PROJECT="$(cat "$HOME/.rune/project-path")"
    ELECTRON="$RUNE_PROJECT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
  fi
fi

if [ ! -f "$ELECTRON" ]; then
  osascript -e 'display dialog "Electron not found. Run: rune install" buttons {"OK"}'
  exit 1
fi

# CRITICAL: unset this so Electron runs as an app, not plain Node.js
unset ELECTRON_RUN_AS_NODE

# macOS passes the file path as the last argument when double-clicking
FILE=""
for arg in "$@"; do
  if [[ "$arg" == *.rune ]]; then
    FILE="$arg"
    break
  fi
done

cd "$RUNE_PROJECT"
if [ -n "$FILE" ]; then
  exec "$ELECTRON" . "$FILE"
else
  exec "$ELECTRON" .
fi
`
  fs.writeFileSync(path.join(appMacOS, 'rune-launcher'), launcherScript, { mode: 0o755 })

  // Register the app with Launch Services
  try {
    execSync(`/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -R -f "${appDir}"`, { stdio: 'ignore' })
    console.log('  ✅ .rune file association registered')
  } catch {
    console.log('  ⚠️  Could not auto-register. Double-click a .rune file and choose "Open With" → Rune')
  }

  // Set as default handler for .rune files
  try {
    execSync(`defaults write com.apple.LaunchServices/com.apple.launchservices.secure LSHandlers -array-add '{ LSHandlerContentType = "com.studio-h.rune"; LSHandlerRoleAll = "com.studio-h.rune"; }'`, { stdio: 'ignore' })
  } catch {}
}

function installChannelPlugin() {
  console.log('  Installing Claude Code channel plugin...')

  const projectRoot = path.resolve(__dirname, '..')
  const claudePluginsDir = path.join(os.homedir(), '.claude', 'plugins')
  const installedFile = path.join(claudePluginsDir, 'installed_plugins.json')
  const marketplacesFile = path.join(claudePluginsDir, 'known_marketplaces.json')

  // Check if Claude Code plugins dir exists
  if (!fs.existsSync(claudePluginsDir)) {
    console.log('  ⚠️  Claude Code not found (~/.claude/plugins missing). Install Claude Code first.')
    return
  }

  try {
    // 1. Register marketplace
    const marketplaceName = 'rune'
    let marketplaces = {}
    if (fs.existsSync(marketplacesFile)) {
      try { marketplaces = JSON.parse(fs.readFileSync(marketplacesFile, 'utf-8')) } catch {}
    }
    if (!marketplaces[marketplaceName]) {
      marketplaces[marketplaceName] = {
        source: { source: 'github', repo: 'gilhyun/Rune' },
        installLocation: path.join(claudePluginsDir, 'marketplaces', marketplaceName),
        lastUpdated: new Date().toISOString(),
      }
      fs.writeFileSync(marketplacesFile, JSON.stringify(marketplaces, null, 2))
    }

    // 2. Copy plugin to cache
    const pluginJson = JSON.parse(fs.readFileSync(path.join(projectRoot, '.claude-plugin', 'plugin.json'), 'utf-8'))
    const version = pluginJson.version || '0.1.0'
    const cacheDir = path.join(claudePluginsDir, 'cache', marketplaceName, 'rune-channel', version)
    ensureDir(cacheDir)

    // Copy essential files
    const filesToCopy = ['.claude-plugin', 'dist/rune-channel.js', 'package.json', 'LICENSE']
    for (const f of filesToCopy) {
      const src = path.join(projectRoot, f)
      const dst = path.join(cacheDir, f)
      if (!fs.existsSync(src)) continue
      const stat = fs.statSync(src)
      if (stat.isDirectory()) {
        ensureDir(dst)
        for (const child of fs.readdirSync(src)) {
          fs.copyFileSync(path.join(src, child), path.join(dst, child))
        }
      } else {
        ensureDir(path.dirname(dst))
        fs.copyFileSync(src, dst)
      }
    }

    // 3. Register in installed_plugins.json
    let installed = { version: 2, plugins: {} }
    if (fs.existsSync(installedFile)) {
      try { installed = JSON.parse(fs.readFileSync(installedFile, 'utf-8')) } catch {}
    }

    const pluginKey = `rune-channel@${marketplaceName}`
    const entries = installed.plugins[pluginKey] || []
    // Add/update user-scope entry
    const userEntry = entries.find(e => e.scope === 'user')
    const newEntry = {
      scope: 'user',
      installPath: cacheDir,
      version,
      installedAt: userEntry?.installedAt || new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    }
    if (userEntry) {
      Object.assign(userEntry, newEntry)
    } else {
      entries.push(newEntry)
    }
    installed.plugins[pluginKey] = entries
    fs.writeFileSync(installedFile, JSON.stringify(installed, null, 2))

    console.log('  ✅ Channel plugin installed')
  } catch (e) {
    console.log(`  ⚠️  Plugin install failed: ${e.message}`)
    console.log('     Run manually inside Claude Code: /plugin install rune-channel@rune')
  }
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
    console.log(`  ⚠️  ${fileName} already exists. Opening it instead.`)
    return openRune(filePath)
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
  console.log('  Double-click the file to open, or run:')
  console.log(`  rune open ${fileName}`)
}

// ── open ─────────────────────────────────────────

function findProjectRoot() {
  // Always resolve from the actual package location (works for both global and local)
  const fromBin = path.resolve(__dirname, '..')
  const electronCheck = path.join(fromBin, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
  if (fs.existsSync(electronCheck)) return fromBin

  // Fallback: check saved path
  const savedPath = path.join(RUNE_HOME, 'project-path')
  if (fs.existsSync(savedPath)) {
    const saved = fs.readFileSync(savedPath, 'utf-8').trim()
    const savedElectron = path.join(saved, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
    if (fs.existsSync(savedElectron)) return saved
  }

  return null
}

function openRune(file) {
  if (!file) {
    console.log('Usage: rune open <file.rune>')
    process.exit(1)
  }

  const filePath = path.resolve(process.cwd(), file)
  if (!fs.existsSync(filePath)) {
    console.error(`  ❌ File not found: ${filePath}`)
    process.exit(1)
  }

  const projectRoot = findProjectRoot()
  if (!projectRoot) {
    console.error('  ❌ Electron not found. Run `rune install` first.')
    process.exit(1)
  }

  const electronBinary = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')

  console.log(`🔮 Opening ${path.basename(filePath)}...`)

  // CRITICAL: unset ELECTRON_RUN_AS_NODE — Claude Code sets it,
  // which makes Electron act as plain Node.js instead of an Electron app
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  const child = spawn(electronBinary, ['.', filePath], {
    cwd: projectRoot,
    detached: true,
    stdio: 'ignore',
    env,
  })
  child.unref()
}

// ── run (headless) ──────────────────────────────

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

    // Temporarily hide .mcp.json to prevent MCP interference
    const mcpPath = path.join(folderPath, '.mcp.json')
    const mcpBackup = path.join(folderPath, '.mcp.json.bak')
    let mcpHidden = false
    if (fs.existsSync(mcpPath)) {
      fs.renameSync(mcpPath, mcpBackup)
      mcpHidden = true
    }

    const claudeArgs = ['-p', '--print',
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

    const restoreMcp = () => {
      if (mcpHidden && fs.existsSync(mcpBackup)) {
        fs.renameSync(mcpBackup, mcpPath)
      }
    }

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
      restoreMcp()
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

    // Restore .mcp.json if process is killed
    process.on('SIGINT', restoreMcp)
    process.on('SIGTERM', restoreMcp)

    return
  }

  // Normal mode: print-only, no tool execution
  // Run from tmpdir to avoid .mcp.json interference, add project folder via --add-dir
  const claudeArgs = ['-p', '--print', '--add-dir', folderPath]
  if (systemPrompt) {
    claudeArgs.push('--system-prompt', systemPrompt + `\nWorking folder: ${folderPath}`)
  }
  if (outputFormat === 'json') {
    claudeArgs.push('--output-format', 'json')
  }
  claudeArgs.push('--', prompt)

  const os = require('os')
  const child = spawn('claude', claudeArgs, {
    cwd: os.tmpdir(),
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
      // Temporarily hide .mcp.json
      const mcpPath = path.join(folderPath, '.mcp.json')
      const mcpBackup = path.join(folderPath, '.mcp.json.pipe.bak')
      let mcpHidden = false
      if (fs.existsSync(mcpPath)) {
        fs.renameSync(mcpPath, mcpBackup)
        mcpHidden = true
      }

      const claudeArgs = ['-p', '--print',
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
          if (mcpHidden && fs.existsSync(mcpBackup)) fs.renameSync(mcpBackup, mcpPath)
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
      // Normal pipe step: text output only, run from tmpdir to avoid .mcp.json
      const os = require('os')
      const claudeArgs = ['-p', '--print', '--add-dir', folderPath]
      if (systemParts.length > 0) {
        claudeArgs.push('--system-prompt', systemParts.join('\n') + `\nWorking folder: ${folderPath}`)
      }
      claudeArgs.push('--', pipeContext)

      const output = await new Promise((resolve, reject) => {
        const child = spawn('claude', claudeArgs, {
          cwd: os.tmpdir(),
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

// ── uninstall ────────────────────────────────────

function uninstall() {
  console.log('🔮 Uninstalling Rune...\n')

  // Remove Quick Action
  const workflowDir = path.join(QUICK_ACTION_DIR, 'New Rune.workflow')
  if (fs.existsSync(workflowDir)) {
    fs.rmSync(workflowDir, { recursive: true })
    console.log('  ✅ Quick Action removed')
  }

  // Remove .app wrapper
  const appDir = path.join(APP_DIR, 'Rune.app')
  if (fs.existsSync(appDir)) {
    fs.rmSync(appDir, { recursive: true })
    console.log('  ✅ App wrapper removed')
  }

  // Unregister from Launch Services
  if (IS_MAC) {
    try {
      execSync(`/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "${appDir}"`, { stdio: 'ignore' })
    } catch {}
  }

  console.log('\n🔮 Rune uninstalled. Your .rune files are preserved.\n')
}

// ── help ─────────────────────────────────────────

function showHelp() {
  console.log(`
🔮 Rune — File-based AI Agent Toolkit

Usage:
  rune install              Install Rune (build app, register file association, add Quick Action)
  rune new <name>           Create a new .rune file in current directory
    --role "description"    Set the agent's role
  rune open <file.rune>     Open a .rune file (desktop GUI)
  rune run <file.rune> "prompt"   Run agent headlessly (no GUI)
    --auto                  Auto mode: agent writes files, runs commands, fixes errors
    --output json|text      Output format (default: text)
    --log <file.json>       Save structured log (tool calls, cost, duration)
  rune pipe <a.rune> <b.rune> ... "prompt"   Chain agents in a pipeline
    --output json|text      Output format (default: text)
  rune watch <file.rune>    Set up automated triggers
    --on <event>            Event: file-change, git-commit, git-push, cron
    --prompt "..."          Prompt to send when triggered
    --glob "*.ts"           File pattern (for file-change)
    --interval 5m           Schedule interval (for cron: 30s, 5m, 1h)
  rune list                 List .rune files in current directory
  rune uninstall            Remove Rune integration (keeps .rune files)
  rune help                 Show this help

Examples:
  rune new reviewer --role "Code reviewer, security focused"
  rune run reviewer.rune "Review the latest commit"
  rune pipe coder.rune reviewer.rune "Implement a login page"
  rune watch reviewer.rune --on git-commit --prompt "Review this commit"
  rune watch monitor.rune --on cron --interval 5m --prompt "Check server health"
  echo "Fix the bug in auth.ts" | rune run backend.rune
`)
}
