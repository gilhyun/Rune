import { useState, useEffect, useCallback } from 'react'
import { Bot } from 'lucide-react'
import { ChatPanel } from './features/chat/chat-panel'
import { useChat } from './features/chat/use-chat'

export function App() {
  const chat = useChat()
  const [showTerminal, setShowTerminal] = useState(true)

  // Auto-switch to chat when MCP channel connects OR when history is loaded
  useEffect(() => {
    const handler = (data: { port: number; connected: boolean }) => {
      if (data.connected) setShowTerminal(false)
    }
    window.rune.on('rune:channelStatus', handler)
    return () => window.rune.off('rune:channelStatus', handler)
  }, [])

  // If there's existing history, show chat immediately
  useEffect(() => {
    if (chat.messages.length > 0) setShowTerminal(false)
  }, [chat.messages.length > 0])

  const toggleTerminal = useCallback(() => setShowTerminal(prev => !prev), [])

  if (!chat.runeInfo) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <Bot className="h-12 w-12 text-accent" />
          <p className="text-sm text-muted">Open a .rune file to get started</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background text-foreground text-[13px] overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <ChatPanel
          chat={chat}
          showTerminal={showTerminal}
          onToggleTerminal={toggleTerminal}
        />
      </div>
    </div>
  )
}
