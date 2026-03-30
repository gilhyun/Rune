import { useEffect, useCallback, useRef } from 'react'

export function useIPCOn(channel: RuneOnChannel, callback: (data: any) => void) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const handler = (data: any) => callbackRef.current(data)
    window.rune.on(channel, handler)
    return () => window.rune.off(channel, handler)
  }, [channel])
}

export function useIPCSend() {
  return useCallback((channel: RuneSendChannel, data?: unknown) => {
    window.rune.send(channel, data)
  }, [])
}

export function useIPCInvoke() {
  return useCallback((channel: RuneInvokeChannel, data?: unknown) => {
    return window.rune.invoke(channel, data)
  }, [])
}
