import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface TerminalPanelProps {
  cwd?: string
  autoCommand?: string
}

const THEME = {
  background: '#18222d',
  foreground: '#d4d8de',
  cursor: '#d4d8de',
  cursorAccent: '#18222d',
  selectionBackground: '#2B5278',
  black: '#1a2634',
  red: '#ef5350',
  green: '#26a69a',
  yellow: '#ffb74d',
  blue: '#42a5f5',
  magenta: '#ab47bc',
  cyan: '#26c6da',
  white: '#d4d8de',
  brightBlack: '#546e7a',
  brightRed: '#ef5350',
  brightGreen: '#26a69a',
  brightYellow: '#ffb74d',
  brightBlue: '#64b5f6',
  brightMagenta: '#ab47bc',
  brightCyan: '#26c6da',
  brightWhite: '#ffffff',
}

export function TerminalPanel({ cwd, autoCommand }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const fittedRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: THEME,
      fontSize: 13,
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)

    termRef.current = term
    fitRef.current = fit

    const doFit = () => {
      const el = containerRef.current
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return
      fit.fit()
      if (!fittedRef.current) {
        fittedRef.current = true
        term.focus()
      }
      if (ptyIdRef.current) {
        window.rune.send('terminal:resize', {
          id: ptyIdRef.current,
          cols: term.cols,
          rows: term.rows,
        })
      }
    }

    // ResizeObserver fires on initial observe + any resize
    const ro = new ResizeObserver(() => requestAnimationFrame(doFit))
    ro.observe(containerRef.current)

    window.rune.invoke('terminal:spawn', { cwd: cwd || undefined }).then(({ id }: { id: string }) => {
      ptyIdRef.current = id
      // Sync size now that pty is ready
      window.rune.send('terminal:resize', { id, cols: term.cols, rows: term.rows })

      const onOutput = (msg: { id: string; data: string }) => {
        if (msg.id !== id) return
        term.write(msg.data)
      }
      window.rune.on('terminal:output', onOutput)

      const onExit = (msg: { id: string; exitCode: number }) => {
        if (msg.id === id) {
          term.write(`\r\n\x1b[90m[Process exited with code ${msg.exitCode}]\x1b[0m\r\n`)
          ptyIdRef.current = null
        }
      }
      window.rune.on('terminal:exit', onExit)

      term.onData((data: string) => {
        if (ptyIdRef.current) {
          window.rune.send('terminal:input', { id: ptyIdRef.current, data })
        }
      })

      if (autoCommand) {
        setTimeout(() => {
          window.rune.send('terminal:input', { id, data: autoCommand + '\n' })
        }, 500)
      }

      ;(term as any).__cleanupOutput = onOutput
      ;(term as any).__cleanupExit = onExit
    })

    return () => {
      ro.disconnect()
      if ((term as any).__cleanupOutput) window.rune.off('terminal:output', (term as any).__cleanupOutput)
      if ((term as any).__cleanupExit) window.rune.off('terminal:exit', (term as any).__cleanupExit)
      if (ptyIdRef.current) window.rune.send('terminal:kill', { id: ptyIdRef.current })
      term.dispose()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ backgroundColor: '#18222d', padding: '4px 0 0 4px' }}
    />
  )
}
