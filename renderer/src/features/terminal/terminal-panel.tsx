import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface TerminalPanelProps {
  cwd?: string
  autoCommand?: string
}

const THEME = {
  background: '#0d0d0d',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#0d0d0d',
  selectionBackground: '#264f78',
  black: '#1e1e1e',
  red: '#ef5350',
  green: '#26a69a',
  yellow: '#ffb74d',
  blue: '#42a5f5',
  magenta: '#ab47bc',
  cyan: '#26c6da',
  white: '#d4d4d4',
  brightBlack: '#555555',
  brightRed: '#ef5350',
  brightGreen: '#26a69a',
  brightYellow: '#ffb74d',
  brightBlue: '#42a5f5',
  brightMagenta: '#ab47bc',
  brightCyan: '#26c6da',
  brightWhite: '#ffffff',
}

export function TerminalPanel({ cwd, autoCommand }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const [ready, setReady] = useState(false)

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

    // Retry fit until container has real dimensions
    let retries = 0
    const tryFit = () => {
      requestAnimationFrame(() => {
        const el = containerRef.current
        if (el && el.clientWidth > 0 && el.clientHeight > 0) {
          fit.fit()
          term.focus()
          setReady(true)
        } else if (retries < 20) {
          retries++
          setTimeout(tryFit, 50)
        }
      })
    }
    tryFit()

    window.rune.invoke('terminal:spawn', { cwd: cwd || undefined }).then(({ id }: { id: string }) => {
      ptyIdRef.current = id
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
      if ((term as any).__cleanupOutput) window.rune.off('terminal:output', (term as any).__cleanupOutput)
      if ((term as any).__cleanupExit) window.rune.off('terminal:exit', (term as any).__cleanupExit)
      if (ptyIdRef.current) window.rune.send('terminal:kill', { id: ptyIdRef.current })
      term.dispose()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!containerRef.current || !ready) return
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitRef.current && termRef.current) {
          fitRef.current.fit()
          if (ptyIdRef.current) {
            window.rune.send('terminal:resize', {
              id: ptyIdRef.current,
              cols: termRef.current.cols,
              rows: termRef.current.rows,
            })
          }
        }
      })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [ready])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ backgroundColor: '#0d0d0d', padding: '4px 0 0 4px' }}
    />
  )
}
