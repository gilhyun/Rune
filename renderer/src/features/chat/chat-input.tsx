import { useRef, useCallback } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  isStreaming: boolean
  onSend: (content: string) => void
  onCancel: () => void
}

export function ChatInput({ isStreaming, onSend, onCancel }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const content = textareaRef.current?.value.trim()
    if (!content) return
    onSend(content)
    if (textareaRef.current) {
      textareaRef.current.value = ''
      textareaRef.current.style.height = 'auto'
    }
  }, [onSend])

  const handleSendOrCancel = useCallback(() => {
    if (isStreaming) onCancel()
    else handleSend()
  }, [isStreaming, onCancel, handleSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    }
  }, [])

  return (
    <div className="flex flex-col gap-2.5 px-4 py-3.5 border-t border-border shrink-0">
      <div className="flex gap-2.5 items-end">
        <textarea
          ref={textareaRef}
          className="flex-1 rounded-xl border border-input bg-transparent px-3.5 py-2.5 text-[13px] text-foreground resize-none outline-none min-h-[42px] max-h-[120px] leading-[1.5] transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-0"
          placeholder="Type a message..."
          rows={1}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
        />
        <button
          className={cn(
            'inline-flex items-center justify-center rounded-xl h-[38px] w-[38px] shrink-0 transition-colors',
            isStreaming
              ? 'bg-accent-red text-white hover:bg-accent-red/90'
              : 'bg-accent text-accent-foreground hover:bg-accent/90'
          )}
          onClick={handleSendOrCancel}
        >
          {isStreaming ? <Square className="h-3.5 w-3.5" /> : <ArrowUp className="h-4 w-4 stroke-[2.5]" />}
        </button>
      </div>
    </div>
  )
}
