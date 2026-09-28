import { useEffect, useRef, useState } from 'react'
import {
  chooseHistoryDirectory,
  chooseRunFiles,
  forgetDirectoryHandle,
  hasReadPermission,
  isSameDirectory,
  loadDirectoryHandle,
  saveDirectoryHandle,
  scanHistoryDirectory,
  scanSelectedFiles,
  supportsDirectoryPicker,
  supportsOpenFilePicker,
  type RunSource,
  type ScanResult,
  type HistoryDirectoryHandle,
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
  const normalFiles = useRef<HTMLInputElement>(null)
  const moddedFiles = useRef<HTMLInputElement>(null)
  const handles = useRef<Partial<Record<RunSource, HistoryDirectoryHandle>>>({})
  const callbacks = useRef({ onRuns, onError })
  callbacks.current = { onRuns, onError }

  async function otherHandle(source: RunSource) {
    const other = source === 'normal' ? 'modded' : 'normal'
    const handle = handles.current[other] ?? await loadDirectoryHandle(other)
    if (handle) handles.current[other] = handle
    return handle
  }

  async function useFolder(source: RunSource, handle: HistoryDirectoryHandle) {
    if (await isSameDirectory(handle, await otherHandle(source))) {
      throw new Error(`That history folder is already connected as ${source === 'normal' ? 'Modded' : 'Normal'}. Choose the history folder inside the ${source === 'normal' ? 'regular profile' : 'modded profile'} instead.`)
    }
    await saveDirectoryHandle(source, handle)
    handles.current[source] = handle
    setConnected((current) => ({ ...current, [source]: true }))
    const result = await scanHistoryDirectory(handle, source)
    callbacks.current.onRuns(result.runs, source, result, true)
  }

  async function scan(source: RunSource, announce: boolean, requestPermission = false) {
    const handle = handles.current[source]
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
      if (handles.current[source]) {
        if (await isSameDirectory(handles.current[source], await otherHandle(source))) {
          delete handles.current[source]
          await forgetDirectoryHandle(source)
          setConnected((current) => ({ ...current, [source]: false }))
        } else {
          if (await scan(source, true, true)) return
          callbacks.current.onError(`Access to the ${source} folder was denied. Use Import .run files below, or refresh the page to reconnect.`)
          return
        }
      }
      // Keep the picker directly in the click handler: it requires transient user activation.
      const handle = await chooseHistoryDirectory(source)
      await useFolder(source, handle)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        callbacks.current.onError('No folder was connected. Select the history folder itself, or use Import .run files below.')
        return
      }
      callbacks.current.onError(error instanceof Error ? error.message : 'Could not connect the run-history folder.')
    }
  }

  async function changeFolder(source: RunSource) {
    try {
      const handle = await chooseHistoryDirectory(source)
      await useFolder(source, handle)
    } catch (error) {
      callbacks.current.onError(error instanceof Error ? error.message : 'Could not change the run-history folder.')
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

  async function importFiles(source: RunSource) {
    if (!supportsOpenFilePicker()) {
      (source === 'normal' ? normalFiles : moddedFiles).current?.click()
      return
    }
    try {
      // Separate picker IDs remember separate Normal and Modded locations. When a
      // folder is connected, start directly inside that source's history folder.
      const files = await chooseRunFiles(source, handles.current[source])
      if (!files.length) return
      const result = await scanSelectedFiles(files, source)
      callbacks.current.onRuns(result.runs, source, result, true)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      callbacks.current.onError(error instanceof Error ? error.message : 'Could not import the selected run files.')
    }
  }

  useEffect(() => {
    let active = true
    async function autoScan() {
      const normal = handles.current.normal ?? await loadDirectoryHandle('normal')
      let modded = handles.current.modded ?? await loadDirectoryHandle('modded')
      if (normal) handles.current.normal = normal
      if (modded) handles.current.modded = modded
      if (normal && modded && await isSameDirectory(normal, modded)) {
        await forgetDirectoryHandle('modded')
        delete handles.current.modded
        modded = undefined
        setConnected((current) => ({ ...current, modded: false }))
        callbacks.current.onError('The same history folder was connected as Normal and Modded. The Modded connection was removed; reconnect it to the history folder inside the modded profile.')
      }
      for (const source of ['normal', 'modded'] as const) {
        try {
          const handle = source === 'normal' ? normal : modded
          if (handle) handles.current[source] = handle
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
    <div><p className="eyebrow">Automatic import</p><h2>Run folders</h2><p>For automatic sync, select the <code>history</code> folder itself—not a <code>.run</code> file. Copied runs shared by the normal and modded profiles are counted once.</p></div>
    <div className="sync-actions">
      {(['normal', 'modded'] as const).map((source) => <div className="sync-source" key={source}>
        <button className="secondary" onClick={() => void connect(source)}>
          <span className={`connection-dot${connected[source] ? ' connected' : ''}`} />
          {connected[source] ? `Sync ${sourceLabel(source)}` : `Connect ${sourceLabel(source)} folder`}
        </button>
        {connected[source] && <button className="sync-file-button" onClick={() => void changeFolder(source)}>Change folder</button>}
        <button className="sync-file-button" onClick={() => void importFiles(source)}>Import {sourceLabel(source)} .run files</button>
      </div>)}
    </div>
    <input ref={normalFallback} hidden type="file" multiple {...{ webkitdirectory: '' }} onChange={(event) => void fallbackImport('normal', event.target.files)} />
    <input ref={moddedFallback} hidden type="file" multiple {...{ webkitdirectory: '' }} onChange={(event) => void fallbackImport('modded', event.target.files)} />
    <input ref={normalFiles} hidden type="file" accept=".run" multiple onChange={(event) => { void fallbackImport('normal', event.target.files); event.target.value = '' }} />
    <input ref={moddedFiles} hidden type="file" accept=".run" multiple onChange={(event) => { void fallbackImport('modded', event.target.files); event.target.value = '' }} />
  </section>
}
