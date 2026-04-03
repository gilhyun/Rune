import { useState, useCallback, useRef, useEffect } from 'react'
import { useIPCOn, useIPCSend } from '@/hooks/use-ipc'
import type { ChatState, ChatMessage, ContentBlock, RuneInfo } from './types'

export function useChat() {
  const [runeInfo, setRuneInfo] = useState<RuneInfo | null>(null)
  const [connected, setConnected] = useState(false)
  const [state, setState] = useState<ChatState>({
    messages: [],
    isStreaming: false,
    shownText: '',
    typeQueue: '',
    activityBlocks: [],
  })
  const typeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const send = useIPCSend()

  // Track channel connection status
  const lastStatusRef = useRef<{ port: number; connected: boolean } | null>(null)
  useIPCOn('rune:channelStatus', (data: { port: number; connected: boolean }) => {
    lastStatusRef.current = data
    if (runeInfo && data.port === runeInfo.port) setConnected(data.connected)
  })

  // Apply buffered status when runeInfo arrives
  useEffect(() => {
    if (runeInfo && lastStatusRef.current && lastStatusRef.current.port === runeInfo.port) {
      setConnected(lastStatusRef.current.connected)
    }
  }, [runeInfo])

  // Initialize from main process
  useIPCOn('rune:init', (data: RuneInfo) => {
    setRuneInfo(data)
    // Restore history
    if (data.history && data.history.length > 0) {
      setState(prev => ({
        ...prev,
        messages: data.history.map(h => ({ role: h.role, text: h.text })),
      }))
    }
  })

  // Typewriter engine
  const startTyping = useCallback(() => {
    if (typeTimerRef.current) return
    typeTimerRef.current = setInterval(() => {
      setState(prev => {
        if (!prev.typeQueue) {
          if (typeTimerRef.current) {
            clearInterval(typeTimerRef.current)
            typeTimerRef.current = null
          }
          return prev
        }
        const batch = Math.min(prev.typeQueue.length, 4)
        return {
          ...prev,
          shownText: prev.shownText + prev.typeQueue.slice(0, batch),
          typeQueue: prev.typeQueue.slice(batch),
        }
      })
    }, 10)
  }, [])

  const appendChunk = useCallback((text: string) => {
    setState(prev => ({ ...prev, typeQueue: prev.typeQueue + text }))
    startTyping()
  }, [startTyping])

  const finishStream = useCallback(() => {
    if (typeTimerRef.current) {
      clearInterval(typeTimerRef.current)
      typeTimerRef.current = null
    }
    setState(prev => {
      const fullText = prev.shownText + prev.typeQueue
      const messages = [...prev.messages]
      if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
        messages[messages.length - 1] = {
          role: 'assistant',
          text: fullText,
          blocks: prev.activityBlocks.length > 0 ? [...prev.activityBlocks] : undefined,
        }
      }
      return { ...prev, messages, isStreaming: false, shownText: '', typeQueue: '', activityBlocks: [] }
    })
  }, [])

  // IPC event listeners
  useIPCOn('rune:streamStart', () => {
    setState(prev => ({
      ...prev,
      isStreaming: true,
      shownText: '',
      typeQueue: '',
      activityBlocks: [],
      messages: [...prev.messages, { role: 'assistant', text: '' }],
    }))
  })

  useIPCOn('rune:activity', (data: { port: number; activityType: string; content?: string; tool?: string; args?: Record<string, unknown> }) => {
    const block: ContentBlock = {
      type: data.activityType as ContentBlock['type'],
      content: data.content,
      tool: data.tool,
      args: data.args,
      ts: Date.now(),
    }
    setState(prev => ({
      ...prev,
      activityBlocks: [...prev.activityBlocks, block],
    }))
  })

  useIPCOn('rune:streamChunk', (data: { text: string }) => {
    const clean = data.text
      .replace(/[\x00-\x08\x0e-\x1f\x7f]/g, '')
      .replace(/\^[A-Z@\[\\\]\^_]/g, '')
    appendChunk(clean)
  })

  useIPCOn('rune:streamEnd', () => {
    finishStream()
  })

  useIPCOn('rune:streamError', (data: { error: string }) => {
    if (typeTimerRef.current) {
      clearInterval(typeTimerRef.current)
      typeTimerRef.current = null
    }
    setState(prev => {
      const messages = [...prev.messages]
      if (messages.length > 0 && messages[messages.length - 1].role === 'assistant' && !messages[messages.length - 1].text) {
        messages[messages.length - 1] = { role: 'assistant', text: data.error }
      } else {
        messages.push({ role: 'assistant', text: data.error })
      }
      return { ...prev, messages, isStreaming: false, shownText: '', typeQueue: '' }
    })
  })

  useIPCOn('rune:pushMessage', (data: { text: string }) => {
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, { role: 'assistant', text: data.text }],
    }))
  })

  // Handle Claude Code hook events
  useIPCOn('rune:hook', (data: { event: string; tool_name?: string; tool_input?: Record<string, unknown>; tool_output?: string; prompt?: string; permission_prompt_reason?: string; notification_type?: string; message?: string }) => {
    let block: ContentBlock | null = null

    if (data.event === 'PreToolUse' && data.tool_name) {
      block = {
        type: 'tool_use',
        tool: data.tool_name,
        args: data.tool_input,
        ts: Date.now(),
      }
    } else if (data.event === 'PostToolUse' && data.tool_name) {
      block = {
        type: 'tool_result',
        tool: data.tool_name,
        content: data.tool_output ? (data.tool_output.length > 500 ? data.tool_output.slice(0, 500) + '…' : data.tool_output) : 'done',
        ts: Date.now(),
      }
    } else if (data.event === 'PermissionRequest') {
      block = {
        type: 'thinking',
        content: `⚠️ Permission needed: ${data.tool_name} — ${data.permission_prompt_reason || ''}`,
        tool: data.tool_name,
        ts: Date.now(),
      }
    } else if (data.event === 'Notification') {
      block = {
        type: 'thinking',
        content: `📢 ${data.message || data.notification_type || 'notification'}`,
        ts: Date.now(),
      }
    }

    if (block) {
      setState(prev => ({
        ...prev,
        activityBlocks: [...prev.activityBlocks, block!],
      }))
    }
  })

  // Handle file rename
  useIPCOn('rune:fileRenamed', (data: { name: string; newPath: string }) => {
    setRuneInfo(prev => prev ? { ...prev, name: data.name, filePath: data.newPath } : prev)
  })

  // Actions
  const sendMessage = useCallback((content: string, files?: string[]) => {
    if (!runeInfo || (!content.trim() && (!files || files.length === 0))) return

    // If streaming, cancel current response and finalize partial text
    if (state.isStreaming) {
      send('rune:cancelStream', { port: runeInfo.port })
      finishStream()
    }

    // Build the actual content sent to channel: prepend file paths
    let channelContent = content
    if (files && files.length > 0) {
      const fileSection = files.map(f => `[Attached file: ${f}]`).join('\n')
      channelContent = fileSection + (content ? '\n\n' + content : '')
    }

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, { role: 'user', text: content, files }],
    }))
    send('rune:sendMessage', { content: channelContent, port: runeInfo.port })
  }, [runeInfo, state.isStreaming, send, finishStream])

  const cancelStream = useCallback(() => {
    send('rune:cancelStream', { port: runeInfo?.port })
  }, [send, runeInfo?.port])

  const clearHistory = useCallback(() => {
    if (!runeInfo) return
    setState(prev => ({ ...prev, messages: [], shownText: '', typeQueue: '' }))
    send('rune:clearHistory', { port: runeInfo.port })
  }, [runeInfo, send])

  // Connect channel on mount
  useEffect(() => {
    if (runeInfo) {
      send('rune:connectChannel', { port: runeInfo.port })
    }
  }, [runeInfo?.port]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup
  useEffect(() => {
    return () => {
      if (typeTimerRef.current) clearInterval(typeTimerRef.current)
    }
  }, [])

  const getDisplayText = useCallback((): string => {
    if (!state.isStreaming || !state.shownText) return ''
    return state.shownText
  }, [state.isStreaming, state.shownText])

  return {
    runeInfo,
    connected,
    messages: state.messages,
    isStreaming: state.isStreaming,
    streamingDisplayText: getDisplayText(),
    streamingActivities: state.activityBlocks,
    sendMessage,
    cancelStream,
    clearHistory,
  }
}
