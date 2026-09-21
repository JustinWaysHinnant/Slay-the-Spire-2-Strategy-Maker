import { useState } from 'react'
import { CHARACTERS, type Pickup, type RelicChange, type Run } from '../lib/types'

function RelicCell({ relics, changes }: { relics: Pickup[]; changes?: RelicChange[] }) {
  return <div className="relic-cell">
    {relics.length ? <div className="relic-inventory">{relics.map((relic, index) => <span key={`${relic.name}-${index}`}>
      {relic.name}{relic.floor ? <small> @ {relic.floor}</small> : null}
    </span>)}</div> : <span>—</span>}
    {changes?.length ? <details className="relic-history">
      <summary>View changes ({changes.length})</summary>
      <ol>{changes.map((change, index) => <li key={`${change.floor}-${index}`}>
        <small>Floor {change.floor}{change.context ? ` · ${change.context}` : ''}</small>
        <div className="relic-change-items">
          {change.removed.map((name, itemIndex) => <span className="relic-removed" key={`removed-${itemIndex}`}>− {name}</span>)}
          {change.gained.map((name, itemIndex) => <span className="relic-gained" key={`gained-${itemIndex}`}>+ {name}</span>)}
        </div>
      </li>)}</ol>
    </details> : null}
  </div>
}

export function RunList({ runs, onDelete }: { runs: Run[]; onDelete: (id: string) => void }) {
  const [filter, setFilter] = useState('all')
  const visible = [...runs].filter((run) => filter === 'all' || run.character === filter).sort((a, b) => b.date.localeCompare(a.date))
  return <section className="panel"><div className="section-heading"><div><p className="eyebrow">Archive</p><h2>Run history</h2></div><select aria-label="Filter by character" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All characters</option>{CHARACTERS.map((name) => <option key={name}>{name}</option>)}</select></div>
    {!visible.length ? <div className="no-data">No runs match this filter.</div> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Character</th><th>Asc.</th><th>Outcome</th><th>Floor</th><th>Cards and effects</th><th>Relics held · changes</th><th>Potions</th><th></th></tr></thead><tbody>{visible.map((run) => <tr key={run.id}><td>{run.date}</td><td>{run.character}</td><td>A{run.ascension}</td><td><span className={`badge ${run.outcome}`}>{run.outcome}</span></td><td>{run.floor}</td><td>{run.cards.length ? <div className="card-summary">{run.cards.map((card, index) => <span key={`${card.name}-${index}`}><strong>{card.name}{card.upgraded ? '+' : ''}</strong>{card.floor ? ` @ ${card.floor}` : ''}{(card.upgraded || card.effects?.length) && <small>{[...(card.upgraded ? ['Upgraded'] : []), ...(card.effects ?? [])].join(' · ')}</small>}</span>)}</div> : '—'}</td><td><RelicCell relics={run.relics} changes={run.relicChanges} /></td><td>{run.potions?.length ? run.potions.join(', ') : '—'}</td><td><button className="delete" onClick={() => { if (confirm('Delete this run?')) onDelete(run.id) }} aria-label={`Delete ${run.character} run from ${run.date}`}>Delete</button></td></tr>)}</tbody></table></div>}
  </section>
}
