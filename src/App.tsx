import { useRef, useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { RunForm } from './components/RunForm'
import { RunList } from './components/RunList'
import { loadRuns, mergeRuns, parseArchive, saveRuns, toArchive } from './lib/storage'
import type { Run } from './lib/types'
import './styles/app.css'
import './styles/card-editor.css'

type Tab = 'dashboard' | 'log' | 'history'
export default function App() {
  const [runs, setRuns] = useState<Run[]>(loadRuns), [tab, setTab] = useState<Tab>('dashboard'), [notice, setNotice] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  function commit(next: Run[]) { setRuns(next); if (!saveRuns(next)) setNotice('Could not save locally. Export your data before closing this tab.') }
  function exportRuns() { const blob = new Blob([JSON.stringify(toArchive(runs), null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `strategy-maker-runs-${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(link.href) }
  async function importRuns(file?: File) { if (!file) return; try { const incoming = parseArchive(await file.text()); commit(mergeRuns(runs, incoming)); setNotice(`Imported ${incoming.length} valid runs.`) } catch (error) { setNotice(error instanceof Error ? error.message : 'Import failed.') } }
  return <><header><div className="brand"><span className="brand-mark">Ⅱ</span><div><strong>SLAY THE SPIRE 2</strong><small>STRATEGY MAKER</small></div></div><nav>{(['dashboard','log','history'] as const).map((name) => <button className={tab === name ? 'active' : ''} onClick={() => setTab(name)} key={name}>{name}</button>)}</nav><div className="actions"><button onClick={exportRuns}>Export</button><button onClick={() => fileRef.current?.click()}>Import</button><input ref={fileRef} hidden type="file" accept="application/json" onChange={(e) => void importRuns(e.target.files?.[0])}/></div></header>
    <main><div className="hero"><div><p className="eyebrow">Personal intelligence</p><h1>{tab === 'dashboard' ? 'Know your climb.' : tab === 'log' ? 'Record the climb.' : 'Study the climb.'}</h1></div><p>Turn every ascent into evidence.</p></div>{notice && <button className="notice" onClick={() => setNotice('')}>{notice} <span>×</span></button>}{tab === 'dashboard' && <Dashboard runs={runs}/>} {tab === 'log' && <RunForm onAdd={(run) => { commit([...runs, run]); setTab('dashboard') }}/>} {tab === 'history' && <RunList runs={runs} onDelete={(id) => commit(runs.filter((run) => run.id !== id))}/>}</main>
    <footer>Local-first · your runs never leave this browser</footer></>
}
