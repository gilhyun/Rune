import { useState, useCallback, useRef, useEffect } from 'react'
import { useIPCOn, useIPCSend } from '@/hooks/use-ipc'
import type { ChatState, ChatMessage, RuneInfo } from './types'

export function useChat() {
  const [runeInfo, setRuneInfo] = useState<RuneInfo | null>(null)
  const [state, setState] = useState<ChatState>({
    messages: [],
    isStreaming: false,
    shownText: '',
    typeQueue: '',
  })
  const typeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const send = useIPCSend()

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
        messages[messages.length - 1] = { role: 'assistant', text: fullText }
      }
      return { ...prev, messages, isStreaming: false, shownText: '', typeQueue: '' }
    })
  }, [])

  // IPC event listeners
  useIPCOn('rune:streamStart', () => {
    setState(prev => ({
      ...prev,
      isStreaming: true,
      shownText: '',
      typeQueue: '',
      messages: [...prev.messages, { role: 'assistant', text: '' }],
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

  // Handle file rename
  useIPCOn('rune:fileRenamed', (data: { name: string; newPath: string }) => {
    setRuneInfo(prev => prev ? { ...prev, name: data.name, filePath: data.newPath } : prev)
  })

  // Actions
  const sendMessage = useCallback((content: string) => {
    if (!runeInfo || state.isStreaming || !content.trim()) return
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, { role: 'user', text: content }],
    }))
    send('rune:sendMessage', { content, port: runeInfo.port })
  }, [runeInfo, state.isStreaming, send])

  const cancelStream = useCallback(() => {
    send('rune:cancelStream', {})
  }, [send])

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
    messages: state.messages,
    isStreaming: state.isStreaming,
    streamingDisplayText: getDisplayText(),
    sendMessage,
    cancelStream,
    clearHistory,
  }
}
