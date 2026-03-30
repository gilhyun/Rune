import { useState } from 'react'
import { Trash2, SquareTerminal, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIPCOn } from '@/hooks/use-ipc'

interface ChatHeaderProps {
  name: string
  role?: string
  port: number
  showTerminal?: boolean
  onClearHistory: () => void
  onToggleTerminal?: () => void
}

export function ChatHeader({ name, role, port, showTerminal, onClearHistory, onToggleTerminal }: ChatHeaderProps) {
  const [connected, setConnected] = useState(false)

  useIPCOn('rune:channelStatus', (data: { port: number; connected: boolean }) => {
    if (data.port === port) setConnected(data.connected)
  })

  const dotColor = connected ? 'bg-accent' : 'bg-accent-red'

  return (
    <div
      className="flex items-center justify-between px-4 h-[40px] border-b border-border shrink-0"
      style={{ WebkitAppRegion: 'drag' as any }}
    >
      <div className="flex items-center gap-2" style={{ marginLeft: process.platform === 'darwin' ? 68 : 0 }}>
        <Bot className="h-4 w-4 text-accent" />
        <span className="text-[13px] font-medium text-foreground">{name}</span>
        <div className={cn('w-2 h-2 rounded-full', dotColor, !connected && 'animate-pulse')} />
        <span className="text-[11px] text-muted tabular-nums">:{port}</span>
        {role && <span className="text-[11px] text-muted truncate max-w-[200px]">{role}</span>}
      </div>

      <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' as any }}>
        {onToggleTerminal && (
          <button
            className={cn(
              'inline-flex items-center justify-center rounded-md h-7 w-7 transition-colors',
              showTerminal
                ? 'text-accent bg-accent/10'
                : 'text-muted hover:text-foreground hover:bg-border'
            )}
            title="Toggle terminal"
            onClick={onToggleTerminal}
          >
            <SquareTerminal className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          className="inline-flex items-center justify-center rounded-md h-7 w-7 text-muted hover:text-foreground hover:bg-border transition-colors"
          title="Clear history"
          onClick={onClearHistory}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
