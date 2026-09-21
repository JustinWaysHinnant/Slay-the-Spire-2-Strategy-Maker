import { useState } from 'react'
import { CHARACTERS, type Run } from '../lib/types'

export function RunList({ runs, onDelete }: { runs: Run[]; onDelete: (id: string) => void }) {
  const [filter, setFilter] = useState('all')
  const visible = [...runs].filter((run) => filter === 'all' || run.character === filter).sort((a, b) => b.date.localeCompare(a.date))
  return <section className="panel"><div className="section-heading"><div><p className="eyebrow">Archive</p><h2>Run history</h2></div><select aria-label="Filter by character" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All characters</option>{CHARACTERS.map((name) => <option key={name}>{name}</option>)}</select></div>
    {!visible.length ? <div className="no-data">No runs match this filter.</div> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Character</th><th>Asc.</th><th>Outcome</th><th>Floor</th><th>Cards</th><th>Effects</th><th>Potions</th><th></th></tr></thead><tbody>{visible.map((run) => <tr key={run.id}><td>{run.date}</td><td>{run.character}</td><td>A{run.ascension}</td><td><span className={`badge ${run.outcome}`}>{run.outcome}</span></td><td>{run.floor}</td><td>{run.cards.length}</td><td>{run.cardEffects?.length ?? 0}</td><td>{run.potions?.length ?? 0}</td><td><button className="delete" onClick={() => { if (confirm('Delete this run?')) onDelete(run.id) }} aria-label={`Delete ${run.character} run from ${run.date}`}>Delete</button></td></tr>)}</tbody></table></div>}
  </section>
}
