import { useState, type ReactNode } from 'react'
import { CHARACTERS, type CardChange, type Pickup, type PotionChange, type RelicChange, type Run } from '../lib/types'

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

export function RunList({ runs, onDelete }: { runs: Run[]; onDelete: (id: string) => void }) {
  const [filter, setFilter] = useState('all')
  const [modeFilter, setModeFilter] = useState('all')
  const visible = [...runs].filter((run) => (filter === 'all' || run.character === filter) && (modeFilter === 'all' || (run.mode ?? 'unclassified') === modeFilter)).sort((a, b) => b.date.localeCompare(a.date))
  return <section className="panel"><div className="section-heading"><div><p className="eyebrow">Archive</p><h2>Run history</h2></div><div className="history-filters"><select aria-label="Filter by run type" value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}><option value="all">All run types</option><option value="singleplayer">Singleplayer</option><option value="multiplayer">Multiplayer</option><option value="unclassified">Unclassified</option></select><select aria-label="Filter by character" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All characters</option>{CHARACTERS.map((name) => <option key={name}>{name}</option>)}</select></div></div>
    {!visible.length ? <div className="no-data">No runs match this filter.</div> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Character</th><th>Asc.</th><th>Outcome</th><th>Floor</th><th>Cards held · changes</th><th>Relics held · changes</th><th>Potions held · changes</th><th></th></tr></thead><tbody>{visible.map((run) => <tr key={run.id}><td>{run.date}</td><td><span className={`mode-badge ${run.mode ?? 'unclassified'}`}>{run.mode === 'singleplayer' ? 'Singleplayer' : run.mode === 'multiplayer' ? `Multiplayer · ${run.playerCount ?? '2+'} players` : 'Unclassified'}</span>{run.mode === 'multiplayer' ? <small className="history-note">Showing first player in file</small> : null}{run.mode === undefined ? <small className="history-note">Re-import to identify run type</small> : null}</td><td>{run.character}</td><td>A{run.ascension}</td><td><span className={`badge ${run.outcome}`}>{run.outcome}</span></td><td>{run.floor}</td><td><CardCell cards={run.cards} changes={run.cardChanges} legacyImport={run.id.startsWith('sts2:')} /></td><td><RelicCell relics={run.relics} changes={run.relicChanges} /></td><td><PotionCell run={run} /></td><td><button className="delete" onClick={() => { if (confirm('Delete this run?')) onDelete(run.id) }} aria-label={`Delete ${run.character} run from ${run.date}`}>Delete</button></td></tr>)}</tbody></table></div>}
  </section>
}
