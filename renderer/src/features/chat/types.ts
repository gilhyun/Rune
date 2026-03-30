export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  text: string
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
}
