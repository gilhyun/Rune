import { useRef, useCallback, useState } from 'react'
import { ArrowUp, Square, Paperclip, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  isStreaming: boolean
  onSend: (content: string, files?: string[]) => void
  onCancel: () => void
}

export function ChatInput({ isStreaming, onSend, onCancel }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachedFiles, setAttachedFiles] = useState<string[]>([])

  const handleSend = useCallback(() => {
    const content = textareaRef.current?.value.trim()
    if (!content && attachedFiles.length === 0) return
    onSend(content || '', attachedFiles.length > 0 ? attachedFiles : undefined)
    if (textareaRef.current) {
      textareaRef.current.value = ''
      textareaRef.current.style.height = 'auto'
    }
    setAttachedFiles([])
  }, [onSend, attachedFiles])

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

  const handleFileClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const paths: string[] = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i] as any
      if (f.path) paths.push(f.path)
    }
    if (paths.length > 0) {
      setAttachedFiles(prev => [...prev, ...paths])
    }
    // Reset input so same file can be re-selected
    e.target.value = ''
  }, [])

  const removeFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  const getFileName = (filePath: string) => {
    return filePath.split('/').pop() || filePath
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3.5 border-t border-border shrink-0">
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachedFiles.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 bg-muted/30 border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground max-w-[200px]"
            >
              <Paperclip className="h-3 w-3 shrink-0 opacity-50" />
              <span className="truncate">{getFileName(file)}</span>
              <button
                onClick={() => removeFile(i)}
                className="shrink-0 hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2.5 items-end">
        <button
          className="inline-flex items-center justify-center rounded-xl h-[38px] w-[38px] shrink-0 transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/30"
          onClick={handleFileClick}
          title="Attach file"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
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
