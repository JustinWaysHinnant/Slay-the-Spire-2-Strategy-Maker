import { useMemo, useState, type ReactNode } from 'react'
import { runMode, runSource } from '../lib/runClassification'
import { bootstrapMedianInterval, encounterPressureStats, formatRate, median, offeredDecisionStats, resourceMetrics, wilsonInterval } from '../lib/stats'
import { CHARACTERS, type Run, type RunMode, type RunSource } from '../lib/types'

const pct = (value: number) => `${Math.round(value * 100)}%`
const number = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1)
const interval = (low: number, high: number, suffix = '') => `${number(low)}–${number(high)}${suffix}`

export function Dashboard({ runs }: { runs: Run[] }) {
  const [mode, setMode] = useState<RunMode>('singleplayer')
  const [source, setSource] = useState<RunSource>('normal')
  const [character, setCharacter] = useState('all')
  const [ascension, setAscension] = useState('all')
  const [patch, setPatch] = useState('all')
  const [act, setAct] = useState('all')
  const base = runs.filter((run) => runSource(run) === source && runMode(run) === mode)
  const builds = [...new Set(base.map((run) => run.buildId).filter((item): item is string => Boolean(item)))].sort()
  const ascensions = [...new Set(base.map((run) => run.ascension))].sort((a, b) => a - b)
  const filtered = base.filter((run) => (mode === 'multiplayer' || character === 'all' || run.character === character)
    && (ascension === 'all' || run.ascension === Number(ascension))
    && (patch === 'all' || run.buildId === patch))
  const actNumber = act === 'all' ? undefined : Number(act)
  const scoped = actNumber === undefined ? filtered : filtered.filter((run) => run.nodes?.some((node) => node.act === actNumber))
  const patchLabel = patch !== 'all' ? patch : builds.length ? builds.length === 1 ? builds[0] : `${builds[0]}–${builds.at(-1)}` : 'unrecorded'

  return <div className="dashboard">
    <section className="mode-filter panel" aria-label="Dashboard filters">
      <div><strong>Analysis scope</strong><small>Every estimate below uses this character, difficulty, patch, and Act scope.</small></div>
      <div className="dashboard-filters">
        <label>Save source<select value={source} onChange={(event) => setSource(event.target.value as RunSource)}><option value="normal">Normal</option><option value="modded">Modded</option></select></label>
        <label>Run type<select value={mode} onChange={(event) => { const next = event.target.value as RunMode; setMode(next); if (next === 'multiplayer') setCharacter('all') }}><option value="singleplayer">Singleplayer</option><option value="multiplayer">Multiplayer</option></select></label>
        {mode === 'singleplayer' ? <label>Character<select value={character} onChange={(event) => setCharacter(event.target.value)}><option value="all">All characters</option>{CHARACTERS.map((name) => <option key={name}>{name}</option>)}</select></label> : null}
        <label>Ascension<select value={ascension} onChange={(event) => setAscension(event.target.value)}><option value="all">All levels</option>{ascensions.map((level) => <option value={level} key={level}>A{level}</option>)}</select></label>
        <label>Patch<select value={patch} onChange={(event) => setPatch(event.target.value)}><option value="all">All recorded patches</option>{builds.map((build) => <option key={build}>{build}</option>)}</select></label>
        <label>Act<select value={act} onChange={(event) => setAct(event.target.value)}><option value="all">All Acts</option><option value="1">Act 1</option><option value="2">Act 2</option><option value="3">Act 3</option></select></label>
      </div>
    </section>
    <DashboardContent runs={scoped} act={actNumber} patchLabel={patchLabel} />
  </div>
}

function DashboardContent({ runs, act, patchLabel }: { runs: Run[]; act?: number; patchLabel: string }) {
  const counted = runs.filter((run) => run.outcome !== 'abandoned')
  const wins = counted.filter((run) => run.outcome === 'win').length
  const winCi = wilsonInterval(wins, counted.length)
  const nodeRuns = runs.filter((run) => run.nodes?.length).length
  const decisions = useMemo(() => offeredDecisionStats(runs, act).slice(0, 30), [runs, act])
  const encounters = useMemo(() => encounterPressureStats(runs, act).slice(0, 20), [runs, act])
  const resources = useMemo(() => resourceMetrics(runs, act), [runs, act])
  const roomCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const run of runs) for (const node of run.nodes ?? []) if (act === undefined || node.act === act) {
      const room = node.roomType ?? node.mapType ?? 'Unknown'
      counts.set(room, (counts.get(room) ?? 0) + 1)
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  }, [runs, act])
  const duration = runs.flatMap((run) => run.durationSeconds === undefined ? [] : [run.durationSeconds / 60])
  const durationCi = bootstrapMedianInterval(duration)
  const scope = `${runs.length} runs · patch ${patchLabel} · 95% intervals`

  if (!runs.length) return <section className="empty"><span>0</span><h2>No runs match these filters.</h2><p>Change the scope or re-import run history with richer node data.</p></section>
  return <div>
    <section className="scope-note"><strong>{scope}</strong><span>{nodeRuns}/{runs.length} runs have decision-level data. Re-import legacy runs to include them below.</span></section>
    <section className="stat-grid">
      <article className="stat"><span>Counted win rate</span><p>Wins among completed runs; abandoned runs are excluded.</p><strong>{formatRate(counted.length ? wins / counted.length : 0)}</strong><small>{wins}/{counted.length} wins · 95% CI {pct(winCi.low)}–{pct(winCi.high)} · patch {patchLabel}</small></article>
      <article className="stat"><span>Decision coverage</span><p>Individual card appearances with both picked and skipped options preserved.</p><strong>{decisions.reduce((sum, item) => sum + item.offered, 0)}</strong><small>card appearances · {nodeRuns}/{runs.length} runs · patch {patchLabel}</small></article>
      <article className="stat"><span>Median duration</span><p>The typical elapsed run time, less distorted by unusually long runs.</p><strong>{duration.length ? `${Math.round(median(duration))}m` : '—'}</strong><small>{duration.length ? `${duration.length} runs · 95% bootstrap CI ${interval(durationCi.low, durationCi.high, 'm')}` : `0/${runs.length} recorded`} · patch {patchLabel}</small></article>
    </section>

    <div className="analysis-grid">
      <Analysis title="Offered decisions" subtitle={`Card choices · ${scope}`} wide>
        <p className="metric-description">Shows how you respond when a card actually appears. The adjusted rate pulls tiny samples toward your character-and-Ascension norm; HP effect compares median damage in the next fight after picking versus skipping.</p>
        {decisions.length ? <div className="table-wrap"><table className="analytics-table"><thead><tr><th>Card</th><th>Picked / offered<small>Your choice count</small></th><th>Pick rate<small>Observed preference</small></th><th>Shrunk rate<small>Small-sample estimate</small></th><th>Next-fight HP effect<small>Positive means less damage</small></th></tr></thead><tbody>{decisions.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td><td>{item.picked}/{item.offered}<small>{item.skipped} skipped</small></td><td>{pct(item.rawPickRate)}<small>95% CI {pct(item.pickRateInterval.low)}–{pct(item.pickRateInterval.high)}</small></td><td>{pct(item.adjustedPickRate)}<small>8-offer character + Ascension prior</small></td><td>{item.nextFightHpDelta === undefined ? '—' : <span className={item.nextFightHpDelta >= 0 ? 'positive' : 'negative'}>{item.nextFightHpDelta >= 0 ? '+' : ''}{number(item.nextFightHpDelta)} HP saved</span>}<small>{item.nextFightHpDeltaInterval ? `95% bootstrap CI ${interval(item.nextFightHpDeltaInterval.low, item.nextFightHpDeltaInterval.high)} · ${item.pickedImpactN} picked / ${item.skippedImpactN} skipped` : `${item.pickedImpactN} picked / ${item.skippedImpactN} skipped next fights`}</small></td></tr>)}</tbody></table></div> : <NoData>No complete card offers exist in this scope. Re-import current <code>.run</code> files.</NoData>}
      </Analysis>

      <Analysis title="Encounter pressure" subtitle={`Deaths per visit and median resource cost · ${scope}`} wide>
        <p className="metric-description">Measures how consistently each fight taxes your deck. Deaths are divided by actual visits; HP and turn medians reveal costly fights even when you survive.</p>
        {encounters.length ? <div className="table-wrap"><table className="analytics-table"><thead><tr><th>Encounter</th><th>Deaths / visits<small>Fatal outcomes</small></th><th>Death rate<small>Lethality per exposure</small></th><th>HP lost<small>Median damage taken</small></th><th>Turns<small>Median fight length</small></th></tr></thead><tbody>{encounters.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td><td>{item.deaths}/{item.visits}</td><td>{pct(item.deathRate)}<small>95% CI {pct(item.deathRateInterval.low)}–{pct(item.deathRateInterval.high)}</small></td><td>{item.medianHpLoss === undefined ? '—' : number(item.medianHpLoss)}<small>{item.hpLossInterval ? `median · 95% bootstrap CI ${interval(item.hpLossInterval.low, item.hpLossInterval.high)} · n=${item.visits}` : `n=${item.visits}`}</small></td><td>{item.medianTurns === undefined ? '—' : number(item.medianTurns)}<small>{item.turnsInterval ? `median · 95% bootstrap CI ${interval(item.turnsInterval.low, item.turnsInterval.high)} · n=${item.visits}` : `n=${item.visits}`}</small></td></tr>)}</tbody></table></div> : <NoData>No encounter-level records exist in this scope.</NoData>}
      </Analysis>

      <Analysis title="Routing mix" subtitle={`Visited nodes · ${scope}`}>
        <p className="metric-description">Counts where your chosen paths actually took you, making aggressive, economic, and defensive routing patterns visible.</p>
        {roomCounts.length ? <div className="compact-list">{roomCounts.map((room) => <div key={room.name}><span>{room.name}</span><strong>{room.count}</strong><small>of {roomCounts.reduce((sum, item) => sum + item.count, 0)} recorded nodes</small></div>)}</div> : <NoData>No route history recorded.</NoData>}
      </Analysis>
      <Analysis title="Resource conversion" subtitle={`Per-run medians · ${scope}`}>
        <p className="metric-description">Summarizes what a typical run spends or risks, using medians so one extreme run does not dominate the result.</p>
        {resources.length ? <div className="compact-list">{resources.map((metric) => <div key={metric.key}><span>{metric.label}</span><strong>{number(metric.median)}</strong><small>{metric.description}</small><small>95% bootstrap CI {interval(metric.interval.low, metric.interval.high)} · n={metric.runs}</small></div>)}</div> : <NoData>No resource history recorded.</NoData>}
      </Analysis>
    </div>
  </div>
}

function Analysis({ title, subtitle, wide, children }: { title: string; subtitle: string; wide?: boolean; children: ReactNode }) {
  return <section className={`panel analysis ${wide ? 'wide' : ''}`}><div className="section-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</section>
}
function NoData({ children }: { children: ReactNode }) { return <div className="no-data">{children}</div> }
