type RuneSendChannel =
  | 'rune:sendMessage' | 'rune:cancelStream' | 'rune:connectChannel' | 'rune:clearHistory'
  | 'terminal:input' | 'terminal:resize' | 'terminal:kill'

type RuneOnChannel =
  | 'rune:init'
  | 'rune:streamStart' | 'rune:streamChunk' | 'rune:streamStatus'
  | 'rune:streamEnd' | 'rune:streamError'
  | 'rune:pushMessage' | 'rune:channelStatus'
  | 'rune:toolActivity'
  | 'terminal:output' | 'terminal:exit'

type RuneInvokeChannel =
  | 'terminal:spawn'
  | 'rune:createFile'

interface RuneAPI {
  send(channel: RuneSendChannel, data?: unknown): void
  on(channel: RuneOnChannel, callback: (data: any) => void): void
  off(channel: RuneOnChannel, callback: (data: any) => void): void
  invoke(channel: RuneInvokeChannel, data?: unknown): Promise<any>
}

interface Window {
  rune: RuneAPI
}
