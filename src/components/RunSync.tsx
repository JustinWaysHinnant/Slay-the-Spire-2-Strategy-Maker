import { useEffect, useRef, useState } from 'react'
import {
  chooseHistoryDirectory,
  hasReadPermission,
  loadDirectoryHandle,
  scanHistoryDirectory,
  scanSelectedFiles,
  supportsDirectoryPicker,
  type RunSource,
  type ScanResult,
} from '../lib/runHistory'
import type { Run } from '../lib/types'

interface Props {
  onRuns: (runs: Run[], source: RunSource, result: ScanResult, announce: boolean) => void
  onError: (message: string) => void
}

const sourceLabel = (source: RunSource) => source === 'normal' ? 'Normal' : 'Modded'

export function RunSync({ onRuns, onError }: Props) {
  const [connected, setConnected] = useState<Record<RunSource, boolean>>({ normal: false, modded: false })
  const normalFallback = useRef<HTMLInputElement>(null)
  const moddedFallback = useRef<HTMLInputElement>(null)
  const callbacks = useRef({ onRuns, onError })
  callbacks.current = { onRuns, onError }

  async function scan(source: RunSource, announce: boolean, requestPermission = false) {
    const handle = await loadDirectoryHandle(source)
    if (!handle || !await hasReadPermission(handle, requestPermission)) return false
    setConnected((current) => ({ ...current, [source]: true }))
    const result = await scanHistoryDirectory(handle, source)
    callbacks.current.onRuns(result.runs, source, result, announce)
    return true
  }

  async function connect(source: RunSource) {
    try {
      if (!supportsDirectoryPicker()) {
        (source === 'normal' ? normalFallback : moddedFallback).current?.click()
        return
      }
      if (await scan(source, true, true)) return
      const handle = await chooseHistoryDirectory(source)
      setConnected((current) => ({ ...current, [source]: true }))
      const result = await scanHistoryDirectory(handle, source)
      callbacks.current.onRuns(result.runs, source, result, true)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      callbacks.current.onError(error instanceof Error ? error.message : 'Could not connect the run-history folder.')
    }
  }

  async function fallbackImport(source: RunSource, files?: FileList | null) {
    if (!files?.length) return
    try {
      const result = await scanSelectedFiles(files, source)
      callbacks.current.onRuns(result.runs, source, result, true)
    } catch (error) {
      callbacks.current.onError(error instanceof Error ? error.message : 'Could not import the selected run folder.')
    }
  }

  useEffect(() => {
    let active = true
    async function autoScan() {
      for (const source of ['normal', 'modded'] as const) {
        try {
          const handle = await loadDirectoryHandle(source)
          if (!active || !handle || !await hasReadPermission(handle)) continue
          setConnected((current) => ({ ...current, [source]: true }))
          const result = await scanHistoryDirectory(handle, source)
          if (active) callbacks.current.onRuns(result.runs, source, result, false)
        } catch {
          // A disconnected or moved folder can be reconnected with its button.
        }
      }
    }
    void autoScan()
    const timer = window.setInterval(() => void autoScan(), 30_000)
    const onFocus = () => void autoScan()
    window.addEventListener('focus', onFocus)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [])

  return <section className="sync-panel panel">
    <div><p className="eyebrow">Automatic import</p><h2>Run folders</h2><p>Connect the unmodded history first, then the separate modded history. Only <code>.run</code> files are read.</p></div>
    <div className="sync-actions">
      {(['normal', 'modded'] as const).map((source) => <button className="secondary" key={source} onClick={() => void connect(source)}>
        <span className={`connection-dot${connected[source] ? ' connected' : ''}`} />
        {connected[source] ? `Sync ${sourceLabel(source)}` : `Connect ${sourceLabel(source)}`}
      </button>)}
    </div>
    <input ref={normalFallback} hidden type="file" multiple {...{ webkitdirectory: '' }} onChange={(event) => void fallbackImport('normal', event.target.files)} />
    <input ref={moddedFallback} hidden type="file" multiple {...{ webkitdirectory: '' }} onChange={(event) => void fallbackImport('modded', event.target.files)} />
  </section>
}
