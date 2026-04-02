import { useState } from 'react'
import { Brain, Terminal, FileText, Pencil, Search, FolderOpen, ChevronRight, ChevronDown, Code, FileCode } from 'lucide-react'
import type { ContentBlock } from './types'

const TOOL_ICONS: Record<string, typeof Terminal> = {
  Bash: Terminal,
  Read: FileText,
  Write: FileCode,
  Edit: Pencil,
  Grep: Search,
  Glob: FolderOpen,
  Task: Code,
}

function getToolIcon(tool?: string) {
  if (!tool) return Terminal
  return TOOL_ICONS[tool] || Terminal
}

function formatArgs(args?: Record<string, unknown>): string {
  if (!args) return ''
  const entries = Object.entries(args)
  if (entries.length === 0) return ''
  return entries
    .map(([k, v]) => {
      const val = typeof v === 'string' ? v : JSON.stringify(v)
      const truncated = val.length > 120 ? val.slice(0, 120) + '...' : val
      return `${k}: ${truncated}`
    })
    .join('\n')
}

function ThinkingBlock({ block }: { block: ContentBlock }) {
  const [expanded, setExpanded] = useState(false)
  const hasContent = block.content && block.content.trim().length > 0
  const preview = block.content
    ? block.content.length > 80
      ? block.content.slice(0, 80) + '...'
      : block.content
    : ''

  return (
    <div className="activity-block activity-thinking">
      <button
        className="activity-header"
        onClick={() => hasContent && setExpanded(!expanded)}
      >
        <Brain className="activity-icon h-3.5 w-3.5 text-purple-400 shrink-0" />
        <span className="activity-label text-purple-400">Thinking</span>
        {!expanded && preview && (
          <span className="activity-preview">{preview}</span>
        )}
        {hasContent && (
          expanded
            ? <ChevronDown className="h-3 w-3 text-muted shrink-0 ml-auto" />
            : <ChevronRight className="h-3 w-3 text-muted shrink-0 ml-auto" />
        )}
      </button>
      {expanded && hasContent && (
        <div className="activity-body activity-thinking-body">
          {block.content}
        </div>
      )}
    </div>
  )
}

function ToolUseBlock({ block }: { block: ContentBlock }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = getToolIcon(block.tool)
  const argsText = formatArgs(block.args)

  return (
    <div className="activity-block activity-tool-use">
      <button
        className="activity-header"
        onClick={() => argsText && setExpanded(!expanded)}
      >
        <Icon className="activity-icon h-3.5 w-3.5 text-accent shrink-0" />
        <span className="activity-label text-accent">{block.tool || 'Tool'}</span>
        {!expanded && block.args && (
          <span className="activity-preview">
            {Object.entries(block.args).map(([k, v]) => {
              const val = typeof v === 'string' ? v : JSON.stringify(v)
              return val.length > 60 ? val.slice(0, 60) + '...' : val
            }).join(' ')}
          </span>
        )}
        {argsText && (
          expanded
            ? <ChevronDown className="h-3 w-3 text-muted shrink-0 ml-auto" />
            : <ChevronRight className="h-3 w-3 text-muted shrink-0 ml-auto" />
        )}
      </button>
      {expanded && argsText && (
        <div className="activity-body">
          <pre className="activity-args">{argsText}</pre>
        </div>
      )}
    </div>
  )
}

function ToolResultBlock({ block }: { block: ContentBlock }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = getToolIcon(block.tool)
  const hasContent = block.content && block.content.trim().length > 0
  const preview = block.content
    ? block.content.length > 100
      ? block.content.slice(0, 100) + '...'
      : block.content
    : ''

  return (
    <div className="activity-block activity-tool-result">
      <button
        className="activity-header"
        onClick={() => hasContent && setExpanded(!expanded)}
      >
        <Icon className="activity-icon h-3.5 w-3.5 text-emerald-400 shrink-0" />
        <span className="activity-label text-emerald-400">{block.tool || 'Result'}</span>
        <span className="activity-result-badge">done</span>
        {!expanded && preview && (
          <span className="activity-preview">{preview}</span>
        )}
        {hasContent && (
          expanded
            ? <ChevronDown className="h-3 w-3 text-muted shrink-0 ml-auto" />
            : <ChevronRight className="h-3 w-3 text-muted shrink-0 ml-auto" />
        )}
      </button>
      {expanded && hasContent && (
        <div className="activity-body">
          <pre className="activity-result-content">{block.content}</pre>
        </div>
      )}
    </div>
  )
}

export function ActivityBlock({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'thinking':
      return <ThinkingBlock block={block} />
    case 'tool_use':
      return <ToolUseBlock block={block} />
    case 'tool_result':
      return <ToolResultBlock block={block} />
    default:
      return null
  }
}
