import { useRef, useEffect, useState, useCallback } from 'react'
import { Sparkles, Zap, Loader2 } from 'lucide-react'
import { MessageBubble } from './message-bubble'
import { useIPCOn } from '@/hooks/use-ipc'
import type { ChatMessage } from './types'

interface ToolActivity {
  tool: string
  status: 'running' | 'done'
  preview?: string
  ts: number
}

interface MessageListProps {
  messages: ChatMessage[]
  isStreaming: boolean
  streamingDisplayText: string
  port?: number
  folderPath?: string
  visible?: boolean
}

export function MessageList({ messages, isStreaming, streamingDisplayText, port, folderPath, visible }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const [connected, setConnected] = useState(false)
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([])

  useIPCOn('rune:channelStatus', (data: { port: number; connected: boolean }) => {
    if (data.port === port) setConnected(data.connected)
  })

  useIPCOn('rune:toolActivity', (data: { port: number; type: 'tool_start' | 'tool_end'; tool: string; preview?: string }) => {
    if (data.port !== port) return
    if (data.type === 'tool_start') {
      setToolActivities(prev => [...prev.slice(-4), { tool: data.tool, status: 'running', ts: Date.now() }])
    } else {
      setToolActivities(prev => {
        const idx = prev.findIndex(a => a.tool === data.tool && a.status === 'running')
        if (idx === -1) return prev
        const updated = [...prev]
        updated[idx] = { ...updated[idx], status: 'done', preview: data.preview }
        return updated
      })
    }
  })

  // Clear old done activities
  useEffect(() => {
    if (toolActivities.length === 0) return
    const timer = setInterval(() => {
      const cutoff = Date.now() - 5000
      setToolActivities(prev => prev.filter(a => a.status === 'running' || a.ts > cutoff))
    }, 1000)
    return () => clearInterval(timer)
  }, [toolActivities.length])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    shouldAutoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
    })
  }, [messages.length, streamingDisplayText])

  useEffect(() => {
    shouldAutoScrollRef.current = true
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
    })
  }, [messages.length])

  useEffect(() => {
    if (visible === false) return
    shouldAutoScrollRef.current = true
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
    })
  }, [visible])

  if (messages.length === 0 && !isStreaming) {
    return (
      <div ref={containerRef} className="flex-1 overflow-y-auto flex flex-col items-center justify-center gap-5 px-10">
        {!connected ? (
          <>
            <div className="h-12 w-12 rounded-xl bg-accent-red/10 flex items-center justify-center">
              <Zap className="h-6 w-6 text-accent-red" />
            </div>
            <div className="text-center">
              <p className="text-[14px] font-medium text-foreground mb-1.5">Waiting for channel</p>
              <p className="text-[12px] text-muted leading-relaxed mb-3">
                Auto-connects when Claude CLI is running.
              </p>
              <div className="bg-[#1a1a1a] border border-border rounded-lg px-4 py-3 text-left max-w-[440px]">
                <p className="text-[11px] text-muted mb-1.5">Run in terminal:</p>
                <code className="text-[11px] text-accent leading-relaxed break-all">
                  {folderPath ? `cd ${folderPath} && ` : ''}
                  RUNE_CHANNEL_PORT={port} claude --dangerously-skip-permissions --dangerously-load-development-channels server:rune-channel
                </code>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-accent" />
            </div>
            <p className="text-[14px] font-medium text-foreground">Ready to chat</p>
            <p className="text-[12px] text-muted">Ask me anything about your project</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5 min-h-0" onScroll={handleScroll}>
      {!connected && (
        <div className="flex items-center gap-2 px-3 py-2 bg-accent-red/8 border border-accent-red/20 rounded-lg text-[12px] text-accent-red shrink-0">
          <Zap className="h-3.5 w-3.5 shrink-0" />
          <span>Channel disconnected — waiting for Claude CLI on port :{port}</span>
        </div>
      )}
      {messages.map((msg, i) => {
        const isStreamingMsg = isStreaming && msg.role === 'assistant' && i === messages.length - 1
        return (
          <MessageBubble
            key={i}
            role={msg.role}
            text={isStreamingMsg ? streamingDisplayText : msg.text}
            isStreaming={isStreamingMsg}
          />
        )
      })}
      {toolActivities.length > 0 && (
        <div className="flex flex-col gap-1 px-1">
          {toolActivities.map((activity, i) => (
            <div key={`${activity.tool}-${activity.ts}-${i}`} className="flex items-center gap-2 text-[11px] text-muted animate-in fade-in duration-200">
              {activity.status === 'running' ? (
                <Loader2 className="h-3 w-3 text-accent animate-spin shrink-0" />
              ) : (
                <div className="h-3 w-3 flex items-center justify-center shrink-0">
                  <div className="h-1.5 w-1.5 rounded-full bg-accent/50" />
                </div>
              )}
              <span className={activity.status === 'running' ? 'text-accent' : 'text-muted'}>{activity.tool}</span>
              {activity.preview && <span className="text-muted truncate max-w-[280px]">— {activity.preview}</span>}
            </div>
          ))}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
