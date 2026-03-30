import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, File, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

interface FileExplorerProps {
  folderPath: string
}

export function FileExplorer({ folderPath }: FileExplorerProps) {
  const [tree, setTree] = useState<FileNode[]>([])
  const folderName = folderPath.split('/').pop() || folderPath

  useEffect(() => {
    window.rune.invoke('explorer:listFiles', { folderPath }).then(setTree).catch(() => {})
  }, [folderPath])

  return (
    <div className="flex flex-col h-full bg-sidebar">
      <div
        className="flex items-center gap-2 px-4 h-[40px] border-b border-border text-[12px] font-medium text-muted uppercase tracking-wide shrink-0"
        style={{ WebkitAppRegion: 'drag' as any, paddingTop: process.platform === 'darwin' ? 0 : 0 }}
      >
        <span style={{ marginLeft: process.platform === 'darwin' ? 56 : 0 }}>{folderName}</span>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {tree.map(node => (
          <TreeNode key={node.path} node={node} depth={0} />
        ))}
      </div>
    </div>
  )
}

function TreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const [expanded, setExpanded] = useState(false)

  const toggle = useCallback(() => setExpanded(prev => !prev), [])

  if (node.type === 'directory') {
    return (
      <div>
        <button
          className="flex items-center gap-1 w-full text-left px-2 py-[3px] text-[12px] text-foreground hover:bg-border/50 transition-colors"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={toggle}
        >
          <ChevronRight className={cn('h-3 w-3 text-muted shrink-0 transition-transform', expanded && 'rotate-90')} />
          <Folder className="h-3.5 w-3.5 text-accent/70 shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children?.map(child => (
          <TreeNode key={child.path} node={child} depth={depth + 1} />
        ))}
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-1 px-2 py-[3px] text-[12px] text-muted-foreground hover:bg-border/50 transition-colors cursor-default"
      style={{ paddingLeft: `${20 + depth * 12}px` }}
    >
      <File className="h-3.5 w-3.5 text-muted shrink-0" />
      <span className="truncate">{node.name}</span>
    </div>
  )
}
