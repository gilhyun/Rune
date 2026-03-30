import { MarkdownRenderer } from './markdown-renderer'

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system'
  text: string
  isStreaming?: boolean
}

export function MessageBubble({ role, text, isStreaming }: MessageBubbleProps) {
  if (role === 'system') {
    return (
      <div className="flex justify-center">
        <span className="text-[11px] text-muted/50">{text}</span>
      </div>
    )
  }

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="leading-[1.7] whitespace-pre-wrap break-words text-[13px] bg-user-bg border border-accent/15 rounded-2xl rounded-br-md px-4 py-3 max-w-[85%]">
          {text}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <MarkdownRenderer text={text} isStreaming={isStreaming} />
    </div>
  )
}
