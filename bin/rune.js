#!/usr/bin/env node

const { execSync, spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

const RUNE_HOME = path.join(os.homedir(), '.rune')
const APP_DIR = path.join(RUNE_HOME, 'app')
const QUICK_ACTION_DIR = path.join(os.homedir(), 'Library', 'Services')

const [,, command, ...args] = process.argv

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// ── Commands ────────────────────────────────────

switch (command) {
  case 'install': return install()
  case 'new':     return createRune(args[0], args)
  case 'open':    return openRune(args[0])
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

  // 2. Store project path for later use
  fs.writeFileSync(path.join(RUNE_HOME, 'project-path'), projectRoot)
  console.log(`  ✅ App built at ${projectRoot}`)

  // 3. Install macOS Quick Action for right-click menu
  if (process.platform === 'darwin') {
    installQuickAction(projectRoot)
  }

  // 4. Register .rune file association (macOS)
  if (process.platform === 'darwin') {
    registerFileAssociation(projectRoot)
  }

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

  // Launcher script — uses actual Electron binary, not Node wrapper
  const launcherScript = `#!/bin/bash
RUNE_PROJECT="${projectRoot}"
ELECTRON="${electronBinary}"

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

  // Try to find the project root
  let projectRoot
  const savedPath = path.join(RUNE_HOME, 'project-path')
  if (fs.existsSync(savedPath)) {
    projectRoot = fs.readFileSync(savedPath, 'utf-8').trim()
  } else {
    projectRoot = path.resolve(__dirname, '..')
  }

  const electronBinary = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
  if (!fs.existsSync(electronBinary)) {
    console.error('  ❌ Electron not found. Run `rune install` first.')
    process.exit(1)
  }

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
  if (process.platform === 'darwin') {
    try {
      execSync(`/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "${appDir}"`, { stdio: 'ignore' })
    } catch {}
  }

  console.log('\n🔮 Rune uninstalled. Your .rune files are preserved.\n')
}

// ── help ─────────────────────────────────────────

function showHelp() {
  console.log(`
🔮 Rune — File-based AI Agent

Usage:
  rune install              Install Rune (build app, register file association, add Quick Action)
  rune new <name>           Create a new .rune file in current directory
    --role "description"    Set the agent's role
  rune open <file.rune>     Open a .rune file
  rune list                 List .rune files in current directory
  rune uninstall            Remove Rune integration (keeps .rune files)
  rune help                 Show this help

Examples:
  rune new designer --role "UI/UX design expert"
  rune new backend --role "Backend developer, Node.js specialist"
  rune open designer.rune
  rune list
`)
}
