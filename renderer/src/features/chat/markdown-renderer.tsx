import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { renderMarkdown } from '@/lib/markdown'

interface MarkdownRendererProps {
  text: string
  isStreaming?: boolean
}

export function MarkdownRenderer({ text, isStreaming }: MarkdownRendererProps) {
  const html = useMemo(() => {
    if (!text) return ''
    return renderMarkdown(text)
  }, [text])

  return (
    <div
      className={cn(
        'msg-content rendered leading-[1.65] break-words text-[13px]',
        isStreaming && 'streaming',
        isStreaming && !text && 'empty-streaming'
      )}
      dangerouslySetInnerHTML={text ? { __html: html } : undefined}
    />
  )
}
