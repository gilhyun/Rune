import { useEffect, useState, useCallback, useRef } from 'react'
import { Toaster, toast } from 'sonner'
import { ShieldAlert } from 'lucide-react'
import { ChatHeader } from './chat-header'
import { MessageList } from './message-list'
import { ChatInput } from './chat-input'
import { TerminalPanel } from '../terminal/terminal-panel'
import type { useChat } from './use-chat'

interface PermissionPrompt {
  ptyId: string
  context: string
}

interface ChatPanelProps {
  chat: ReturnType<typeof useChat>
  showTerminal?: boolean
  onToggleTerminal?: () => void
}

export function ChatPanel({ chat, showTerminal, onToggleTerminal }: ChatPanelProps) {
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPrompt | null>(null)

  // Listen for permission prompts
  useEffect(() => {
    const handler = (data: { id: string; context: string }) => {
      setPermissionPrompt({ ptyId: data.id, context: data.context || '' })
    }
    window.rune.on('rune:permissionNeeded', handler)
    return () => window.rune.off('rune:permissionNeeded', handler)
  }, [])

  const handlePermissionResponse = useCallback((response: 'allow' | 'always' | 'deny') => {
    if (!permissionPrompt) return
    window.rune.send('rune:permissionRespond', { ptyId: permissionPrompt.ptyId, allow: response !== 'deny', response })
    setPermissionPrompt(null)
  }, [permissionPrompt])

  // Toast notifications for channel status
  useEffect(() => {
    const handler = (data: { port: number; connected: boolean }) => {
      if (data.connected) {
        toast.success(`Connected to channel :${data.port}`, { duration: 3000 })
      } else {
        toast.error(`Disconnected from channel :${data.port}`, { duration: 4000 })
      }
    }
    window.rune.on('rune:channelStatus', handler)
    return () => window.rune.off('rune:channelStatus', handler)
  }, [])

  const channelCommand = chat.runeInfo
    ? `RUNE_CHANNEL_PORT=${chat.runeInfo.port} RUNE_FOLDER_PATH=${chat.runeInfo.folderPath} claude --permission-mode auto --enable-auto-mode --dangerously-load-development-channels server:rune-channel`
    : ''

  return (
    <div className="flex flex-col h-full bg-background text-foreground relative">
      <ChatHeader
        name={chat.runeInfo?.name || 'Rune'}
        role={chat.runeInfo?.role}
        port={chat.runeInfo?.port || 0}
        showTerminal={showTerminal}
        onClearHistory={chat.clearHistory}
        onToggleTerminal={onToggleTerminal}
      />
      <div className="flex-1 overflow-hidden relative">
        {/* Terminal */}
        {chat.runeInfo && (
          <div className={showTerminal ? 'absolute inset-0' : 'absolute inset-0 invisible'}>
            <TerminalPanel
              cwd={chat.runeInfo.folderPath}
              autoCommand={channelCommand}
            />
          </div>
        )}
        {/* Chat view */}
        <div className={showTerminal ? 'absolute inset-0 invisible' : 'absolute inset-0 flex flex-col'}>
          <MessageList
            messages={chat.messages}
            isStreaming={chat.isStreaming}
            streamingDisplayText={chat.streamingDisplayText}
            streamingActivities={chat.streamingActivities}
            port={chat.runeInfo?.port}
            folderPath={chat.runeInfo?.folderPath}
            connected={chat.connected}
            visible={!showTerminal}
          />

          {/* Permission prompt banner */}
          {permissionPrompt && !showTerminal && (
            <div className="mx-3 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2">
                <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
                <span className="text-[12px] font-medium text-amber-300">Permission Required</span>
              </div>
              {permissionPrompt.context && (
                <pre className="px-3 pb-2 text-[11px] text-muted leading-relaxed max-h-[160px] overflow-y-auto whitespace-pre-wrap break-words">
                  {permissionPrompt.context.split('\n').slice(-12).join('\n')}
                </pre>
              )}
              <div className="flex gap-2 px-3 pb-3">
                <button
                  onClick={() => handlePermissionResponse('allow')}
                  className="flex-1 px-3 py-1.5 rounded-md text-[12px] font-medium bg-accent text-white hover:brightness-110 transition-all"
                >
                  Allow
                </button>
                <button
                  onClick={() => handlePermissionResponse('always')}
                  className="flex-1 px-3 py-1.5 rounded-md text-[12px] font-medium bg-accent/20 text-accent hover:bg-accent/30 border border-accent/30 transition-all"
                >
                  Always
                </button>
                <button
                  onClick={() => handlePermissionResponse('deny')}
                  className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-all"
                >
                  Deny
                </button>
              </div>
            </div>
          )}

          <ChatInput
            isStreaming={chat.isStreaming}
            disabled={!chat.connected}
            onSend={chat.sendMessage}
            onCancel={chat.cancelStream}
          />
        </div>
      </div>
      <Toaster
        position="bottom-center"
        offset={140}
        toastOptions={{
          style: {
            fontSize: '12px',
            padding: '8px 14px',
            background: 'oklch(0.25 0.065 300)',
            color: 'oklch(0.93 0.015 300)',
            border: '1px solid oklch(1 0.03 300 / 10%)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          },
        }}
      />
    </div>
  )
}
