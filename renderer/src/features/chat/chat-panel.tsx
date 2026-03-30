import { useEffect, useState, useCallback, useRef } from 'react'
import { Toaster, toast } from 'sonner'
import { ChatHeader } from './chat-header'
import { MessageList } from './message-list'
import { ChatInput } from './chat-input'
import { TerminalPanel } from '../terminal/terminal-panel'
import type { useChat } from './use-chat'

interface ChatPanelProps {
  chat: ReturnType<typeof useChat>
  showTerminal?: boolean
  onToggleTerminal?: () => void
}

export function ChatPanel({ chat, showTerminal, onToggleTerminal }: ChatPanelProps) {
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
    ? `RUNE_CHANNEL_PORT=${chat.runeInfo.port} RUNE_FOLDER_PATH=${chat.runeInfo.folderPath} claude --dangerously-skip-permissions --dangerously-load-development-channels server:rune-channel`
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
            port={chat.runeInfo?.port}
            folderPath={chat.runeInfo?.folderPath}
            visible={!showTerminal}
          />
          <ChatInput
            isStreaming={chat.isStreaming}
            onSend={chat.sendMessage}
            onCancel={chat.cancelStream}
          />
        </div>
      </div>
      <Toaster
        position="bottom-center"
        offset={80}
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
