import { contextBridge, ipcRenderer } from 'electron'

const onAllowed = [
  'rune:init',
  'rune:streamStart', 'rune:streamChunk', 'rune:streamStatus', 'rune:streamEnd',
  'rune:streamError', 'rune:pushMessage',
  'rune:channelStatus',
  'rune:toolActivity',
  'rune:fileRenamed',
  'rune:memoryUpdate',
  'rune:sessionStart',
  'terminal:output', 'terminal:exit',
]

const listeners = new Map<string, Map<Function, (...args: any[]) => void>>()

contextBridge.exposeInMainWorld('rune', {
  send: (channel: string, data?: any) => {
    const allowed = [
      'rune:sendMessage', 'rune:cancelStream', 'rune:connectChannel', 'rune:clearHistory',
      'terminal:input', 'terminal:resize', 'terminal:kill',
    ]
    if (allowed.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },
  on: (channel: string, callback: (data: any) => void) => {
    if (!onAllowed.includes(channel)) return
    const wrapper = (_: any, data: any) => callback(data)
    if (!listeners.has(channel)) listeners.set(channel, new Map())
    listeners.get(channel)!.set(callback, wrapper)
    ipcRenderer.on(channel, wrapper)
  },
  off: (channel: string, callback: (data: any) => void) => {
    if (!onAllowed.includes(channel)) return
    const channelMap = listeners.get(channel)
    if (!channelMap) return
    const wrapper = channelMap.get(callback)
    if (wrapper) {
      ipcRenderer.removeListener(channel, wrapper)
      channelMap.delete(callback)
    }
  },
  invoke: (channel: string, data?: any): Promise<any> => {
    const allowed = [
      'terminal:spawn',
      'explorer:listFiles', 'explorer:readFile',
      'rune:createFile',
    ]
    if (allowed.includes(channel)) {
      return ipcRenderer.invoke(channel, data)
    }
    return Promise.reject('Channel not allowed')
  },
})
