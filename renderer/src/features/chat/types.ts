export interface ContentBlock {
  type: 'thinking' | 'tool_use' | 'tool_result'
  content?: string
  tool?: string
  args?: Record<string, unknown>
  ts: number
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  text: string
  files?: string[]
  blocks?: ContentBlock[]
}

export interface RuneInfo {
  filePath: string
  folderPath: string
  port: number
  name: string
  role: string
  icon?: string
  history: { role: 'user' | 'assistant'; text: string; ts: number }[]
}

export interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  shownText: string
  typeQueue: string
  activityBlocks: ContentBlock[]
}
