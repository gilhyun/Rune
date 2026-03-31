import { Paperclip, FileText } from 'lucide-react'
import { MarkdownRenderer } from './markdown-renderer'

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system'
  text: string
  files?: string[]
  isStreaming?: boolean
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])

function isImage(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  return IMAGE_EXTS.has(ext)
}

function getFileName(filePath: string) {
  return filePath.split('/').pop() || filePath
}

function FileAttachment({ file }: { file: string }) {
  if (isImage(file)) {
    return (
      <div className="rounded-lg overflow-hidden border border-accent/10 max-w-[200px]">
        <img
          src={`file://${file}`}
          alt={getFileName(file)}
          className="max-w-full max-h-[160px] object-contain bg-black/20"
          draggable={false}
        />
        <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground truncate">
          <Paperclip className="h-2.5 w-2.5 shrink-0 opacity-50" />
          {getFileName(file)}
        </div>
      </div>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 bg-accent/10 rounded-md px-2 py-0.5 text-[11px] text-accent">
      <FileText className="h-2.5 w-2.5" />
      {getFileName(file)}
    </span>
  )
}

export function MessageBubble({ role, text, files, isStreaming }: MessageBubbleProps) {
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
          {files && files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {files.map((file, i) => (
                <FileAttachment key={i} file={file} />
              ))}
            </div>
          )}
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
