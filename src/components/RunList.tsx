import { useState, type ReactNode } from 'react'
import { runMode, runSource } from '../lib/runClassification'
import { CHARACTERS, type CardChange, type Pickup, type PotionChange, type RelicChange, type Run, type RunMode, type RunSource } from '../lib/types'

function ChangeHistory({ count, children }: { count: number; children: ReactNode }) {
  return count ? <details className="relic-history"><summary>View changes ({count})</summary><ol>{children}</ol></details> : null
}

function ChangeRow({ floor, context, children }: { floor: number; context?: string; children: ReactNode }) {
  return <li><small>Floor {floor}{context ? ` · ${context}` : ''}</small><div className="relic-change-items">{children}</div></li>
}

function ChangeTag({ kind, children }: { kind: 'gained' | 'removed' | 'other'; children: ReactNode }) {
  return <span className={`relic-${kind}`}>{children}</span>
}

function CardCell({ cards, changes, legacyImport }: { cards: Pickup[]; changes?: CardChange[]; legacyImport: boolean }) {
  return <div className="history-cell">
    <div className="final-count">Final cards: {cards.length}</div>
    {cards.length ? <div className="card-summary">{cards.map((card, index) => <span key={`${card.name}-${index}`}><strong>{card.name}{card.upgraded ? '+' : ''}</strong>{card.floor ? ` @ ${card.floor}` : ''}{(card.upgraded || card.effects?.length) && <small>{[...(card.upgraded ? ['Upgraded'] : []), ...(card.effects ?? [])].join(' · ')}</small>}</span>)}</div> : <span>—</span>}
    {legacyImport && changes === undefined ? <small className="history-note">Re-import this run for card changes.</small> : null}
    <ChangeHistory count={changes?.length ?? 0}>{changes?.map((change, index) => <ChangeRow key={`${change.floor}-${index}`} floor={change.floor} context={change.context}>
      {change.removed.map((name, itemIndex) => <ChangeTag kind="removed" key={`removed-${itemIndex}`}>− {name}</ChangeTag>)}
      {change.gained.map((name, itemIndex) => <ChangeTag kind="gained" key={`gained-${itemIndex}`}>+ {name}</ChangeTag>)}
      {change.transformed.map((item, itemIndex) => <ChangeTag kind="other" key={`transformed-${itemIndex}`}>{item.from} → {item.to}</ChangeTag>)}
      {change.upgraded.map((name, itemIndex) => <ChangeTag kind="other" key={`upgraded-${itemIndex}`}>↑ {name}</ChangeTag>)}
    </ChangeRow>)}</ChangeHistory>
  </div>
}

function RelicCell({ relics, changes }: { relics: Pickup[]; changes?: RelicChange[] }) {
  return <div className="history-cell">
    {relics.length ? <div className="relic-inventory">{relics.map((relic, index) => <span key={`${relic.name}-${index}`}>
      {relic.name}{relic.floor ? <small> @ {relic.floor}</small> : null}
    </span>)}</div> : <span>—</span>}
    <ChangeHistory count={changes?.length ?? 0}>{changes?.map((change, index) => <ChangeRow key={`${change.floor}-${index}`} floor={change.floor} context={change.context}>
      {change.removed.map((name, itemIndex) => <ChangeTag kind="removed" key={`removed-${itemIndex}`}>− {name}</ChangeTag>)}
      {change.gained.map((name, itemIndex) => <ChangeTag kind="gained" key={`gained-${itemIndex}`}>+ {name}</ChangeTag>)}
    </ChangeRow>)}</ChangeHistory>
  </div>
}

function PotionCell({ run }: { run: Run }) {
  const finalPotions = run.finalPotions ?? run.potions ?? []
  const legacyImport = run.id.startsWith('sts2:') && run.finalPotions === undefined
  return <div className="history-cell">
    <div className="final-count">{legacyImport ? 'Recorded potions' : 'Final potions'}: {finalPotions.length}</div>
    {finalPotions.length ? <div className="relic-inventory">{finalPotions.map((name, index) => <span key={`${name}-${index}`}>{name}</span>)}</div> : <span>—</span>}
    {legacyImport ? <small className="history-note">Re-import this run for final inventory and changes.</small> : null}
    <ChangeHistory count={run.potionChanges?.length ?? 0}>{run.potionChanges?.map((change: PotionChange, index) => <ChangeRow key={`${change.floor}-${index}`} floor={change.floor} context={change.context}>
      {change.gained.map((name, itemIndex) => <ChangeTag kind="gained" key={`gained-${itemIndex}`}>+ {name}</ChangeTag>)}
      {change.used.map((name, itemIndex) => <ChangeTag kind="other" key={`used-${itemIndex}`}>Used {name}</ChangeTag>)}
      {change.discarded.map((name, itemIndex) => <ChangeTag kind="removed" key={`discarded-${itemIndex}`}>Discarded {name}</ChangeTag>)}
    </ChangeRow>)}</ChangeHistory>
  </div>
}

export function RunList({ runs, onDelete, onClear }: { runs: Run[]; onDelete: (id: string) => void; onClear: () => void }) {
  const [filter, setFilter] = useState('all')
  const [modeFilter, setModeFilter] = useState<RunMode>('singleplayer')
  const [sourceFilter, setSourceFilter] = useState<RunSource>('normal')
  const visible = [...runs].filter((run) => runSource(run) === sourceFilter && runMode(run) === modeFilter && (modeFilter === 'multiplayer' || filter === 'all' || run.character === filter)).sort((a, b) => b.date.localeCompare(a.date))
  const abandoned = visible.filter((run) => run.outcome === 'abandoned')
  const abandonedByCharacter = CHARACTERS.map((character) => ({ character, runs: abandoned.filter((run) => run.character === character) }))
  function clearAll() {
    const label = `${runs.length} saved run${runs.length === 1 ? '' : 's'}`
    if (confirm(`Clear all ${label}? This cannot be undone. Your Steam history files will not be affected.`)) onClear()
  }
  return <section className="panel history-panel"><div className="section-heading"><div><p className="eyebrow">Archive</p><h2>Run history</h2></div><div className="history-filters">
    <label>Save source<select aria-label="Filter by save source" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as RunSource)}><option value="normal">Normal</option><option value="modded">Modded</option></select></label>
    <label>Run type<select aria-label="Filter by run type" value={modeFilter} onChange={(e) => { const mode = e.target.value as RunMode; setModeFilter(mode); if (mode === 'multiplayer') setFilter('all') }}><option value="singleplayer">Singleplayer</option><option value="multiplayer">Multiplayer</option></select></label>
    {modeFilter === 'singleplayer' ? <label>Character<select aria-label="Filter by character" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All characters</option>{CHARACTERS.map((name) => <option key={name}>{name}</option>)}</select></label> : null}
    {runs.length > 0 ? <button className="clear-runs" type="button" onClick={clearAll}>Clear all runs</button> : null}
  </div></div>
    <section className="abandoned-section" aria-labelledby="abandoned-heading">
      <div><h3 id="abandoned-heading">Abandoned runs by character</h3><p>{sourceFilter === 'normal' ? 'Normal' : 'Modded'} · {modeFilter === 'singleplayer' ? 'Singleplayer' : 'Multiplayer'}{modeFilter === 'multiplayer' ? ' · character is the first player recorded in the run file' : ''}</p></div>
      <div className="abandoned-grid">{abandonedByCharacter.map(({ character, runs: characterRuns }) => <article key={character}><span>{character}</span><strong>{characterRuns.length}</strong><small>{characterRuns.length === 1 ? `Floor ${characterRuns[0].floor}` : characterRuns.length ? `Latest floor ${characterRuns[0].floor}` : 'No abandoned runs'}</small></article>)}</div>
    </section>
    {!visible.length ? <div className="no-data">No {sourceFilter} {modeFilter} runs match this filter.</div> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Source</th><th>Type</th><th>Character</th><th>Asc.</th><th>Outcome</th><th>Floor</th><th>Cards held · changes</th><th>Relics held · changes</th><th>Potions held · changes</th><th></th></tr></thead><tbody>{visible.map((run) => { const mode = runMode(run), source = runSource(run); return <tr key={run.id}><td>{run.date}</td><td><span className={`source-badge ${source}`}>{source === 'normal' ? 'Normal' : 'Modded'}</span></td><td><span className={`mode-badge ${mode}`}>{mode === 'singleplayer' ? 'Singleplayer' : `Multiplayer · ${run.playerCount ?? '2+'} players`}</span>{mode === 'multiplayer' ? <small className="history-note">Showing first player in file</small> : null}</td><td>{run.character}</td><td>A{run.ascension}</td><td><span className={`badge ${run.outcome}`}>{run.outcome}</span></td><td>{run.floor}</td><td><CardCell cards={run.cards} changes={run.cardChanges} legacyImport={run.id.startsWith('sts2:')} /></td><td><RelicCell relics={run.relics} changes={run.relicChanges} /></td><td><PotionCell run={run} /></td><td><button className="delete" onClick={() => { if (confirm('Delete this run?')) onDelete(run.id) }} aria-label={`Delete ${run.character} run from ${run.date}`}>Delete</button></td></tr> })}</tbody></table></div>}
  </section>
}
