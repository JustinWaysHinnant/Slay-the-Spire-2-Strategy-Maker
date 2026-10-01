import { useMemo, useState, type ReactNode } from 'react'
import { runMode, runSource } from '../lib/runClassification'
import { bootstrapMedianInterval, encounterPressureStats, formatRate, median, offeredDecisionStats, resourceMetrics, wilsonInterval } from '../lib/stats'
import { CHARACTERS, type Run, type RunMode, type RunSource } from '../lib/types'

const pct = (value: number) => `${Math.round(value * 100)}%`
const number = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1)
const interval = (low: number, high: number, suffix = '') => `${number(low)}–${number(high)}${suffix}`
type AnalysisTab = 'decisions' | 'encounters' | 'routing' | 'resources'

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
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>('decisions')
  const [showAllDecisions, setShowAllDecisions] = useState(false)
  const [showAllEncounters, setShowAllEncounters] = useState(false)
  const counted = runs.filter((run) => run.outcome !== 'abandoned')
  const wins = counted.filter((run) => run.outcome === 'win').length
  const winCi = wilsonInterval(wins, counted.length)
  const nodeRuns = runs.filter((run) => run.nodes?.length).length
  const decisions = useMemo(() => offeredDecisionStats(runs, act), [runs, act])
  const encounters = useMemo(() => encounterPressureStats(runs, act), [runs, act])
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
  const visibleDecisions = showAllDecisions ? decisions : decisions.slice(0, 10)
  const visibleEncounters = showAllEncounters ? encounters : encounters.slice(0, 10)

  if (!runs.length) return <section className="empty"><span>0</span><h2>No runs match these filters.</h2><p>Change the scope or re-import run history with richer node data.</p></section>
  return <div>
    <section className="scope-note"><strong>{scope}</strong><span>{nodeRuns}/{runs.length} runs have decision-level data. Re-import legacy runs to include them below.</span></section>
    <section className="stat-grid">
      <article className="stat"><span>Counted win rate <Info text="Wins among completed runs; abandoned runs are excluded." /></span><strong>{formatRate(counted.length ? wins / counted.length : 0)}</strong><small>{wins}/{counted.length} wins · 95% CI {pct(winCi.low)}–{pct(winCi.high)}</small></article>
      <article className="stat"><span>Decision coverage <Info text="Individual card appearances with both picked and skipped options preserved." /></span><strong>{decisions.reduce((sum, item) => sum + item.offered, 0)}</strong><small>card appearances · {nodeRuns}/{runs.length} runs</small></article>
      <article className="stat"><span>Median duration <Info text="The typical elapsed run time, less distorted by unusually long runs." /></span><strong>{duration.length ? `${Math.round(median(duration))}m` : '—'}</strong><small>{duration.length ? `${duration.length} runs · 95% CI ${interval(durationCi.low, durationCi.high, 'm')}` : `0/${runs.length} recorded`}</small></article>
    </section>

    <div className="analysis-tabs" role="tablist" aria-label="Statistics view">{([
      ['decisions', 'Decisions'], ['encounters', 'Encounters'], ['routing', 'Routing'], ['resources', 'Resources'],
    ] as [AnalysisTab, string][]).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={analysisTab === value} className={analysisTab === value ? 'active' : ''} onClick={() => setAnalysisTab(value)}>{label}</button>)}</div>
    <div className="analysis-grid compact">
      {analysisTab === 'decisions' ? <Analysis title="Offered decisions" subtitle={`Card choices · ${scope}`} wide>
        <SectionHelp>Shows how you respond when a card actually appears. Pick rate is the observed preference. Shrunk rate pulls tiny samples toward your character-and-Ascension norm. HP effect compares median next-fight damage after picking versus skipping; positive values mean less damage.</SectionHelp>
        {decisions.length ? <><div className="table-wrap"><table className="analytics-table"><thead><tr><th>Card</th><th>Choice<small>Picked / offered · rate</small></th><th>Adjusted<small>Shrunk estimate · 95% raw CI</small></th><th>Next fight<small>HP saved · sample</small></th></tr></thead><tbody>{visibleDecisions.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td><td>{item.picked}/{item.offered} · {pct(item.rawPickRate)}<small>{item.skipped} skipped</small></td><td>{pct(item.adjustedPickRate)}<small>{pct(item.pickRateInterval.low)}–{pct(item.pickRateInterval.high)}</small></td><td>{item.nextFightHpDelta === undefined ? '—' : <span className={item.nextFightHpDelta >= 0 ? 'positive' : 'negative'}>{item.nextFightHpDelta >= 0 ? '+' : ''}{number(item.nextFightHpDelta)} HP</span>}<small>{item.nextFightHpDeltaInterval ? `CI ${interval(item.nextFightHpDeltaInterval.low, item.nextFightHpDeltaInterval.high)} · n=${item.pickedImpactN}/${item.skippedImpactN}` : `n=${item.pickedImpactN}/${item.skippedImpactN}`}</small></td></tr>)}</tbody></table></div><ShowAll expanded={showAllDecisions} total={decisions.length} shown={visibleDecisions.length} onClick={() => setShowAllDecisions((value) => !value)} /></> : <NoData>No complete card offers exist in this scope. Re-import current <code>.run</code> files.</NoData>}
      </Analysis> : null}

      {analysisTab === 'encounters' ? <Analysis title="Encounter pressure" subtitle={`Deaths per visit and median resource cost · ${scope}`} wide>
        <SectionHelp>Measures how consistently each fight taxes your deck. Deaths are divided by actual visits, avoiding the exposure bias of raw death counts. HP and turn medians reveal expensive encounters even when you survive.</SectionHelp>
        {encounters.length ? <><div className="table-wrap"><table className="analytics-table"><thead><tr><th>Encounter</th><th>Lethality<small>Deaths / visits · rate</small></th><th>HP lost<small>Median · 95% CI</small></th><th>Turns<small>Median · 95% CI</small></th></tr></thead><tbody>{visibleEncounters.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td><td>{item.deaths}/{item.visits} · {pct(item.deathRate)}<small>{pct(item.deathRateInterval.low)}–{pct(item.deathRateInterval.high)}</small></td><td>{item.medianHpLoss === undefined ? '—' : number(item.medianHpLoss)}<small>{item.hpLossInterval ? `${interval(item.hpLossInterval.low, item.hpLossInterval.high)} · n=${item.visits}` : `n=${item.visits}`}</small></td><td>{item.medianTurns === undefined ? '—' : number(item.medianTurns)}<small>{item.turnsInterval ? `${interval(item.turnsInterval.low, item.turnsInterval.high)} · n=${item.visits}` : `n=${item.visits}`}</small></td></tr>)}</tbody></table></div><ShowAll expanded={showAllEncounters} total={encounters.length} shown={visibleEncounters.length} onClick={() => setShowAllEncounters((value) => !value)} /></> : <NoData>No encounter-level records exist in this scope.</NoData>}
      </Analysis> : null}

      {analysisTab === 'routing' ? <Analysis title="Routing mix" subtitle={`Visited nodes · ${scope}`} wide>
        <SectionHelp>Counts where your chosen paths actually took you. Use the mix to compare aggressive elite routing, economic shop paths, and defensive rest-site paths under the same scope.</SectionHelp>
        {roomCounts.length ? <div className="compact-list dense">{roomCounts.map((room) => <div key={room.name}><span>{room.name}</span><strong>{room.count}</strong><small>of {roomCounts.reduce((sum, item) => sum + item.count, 0)} nodes</small></div>)}</div> : <NoData>No route history recorded.</NoData>}
      </Analysis> : null}

      {analysisTab === 'resources' ? <Analysis title="Resource conversion" subtitle={`Per-run medians · ${scope}`} wide>
        <SectionHelp>Summarizes what a typical run spends or risks. Medians limit the influence of unusually long or extreme runs, while the interval shows how uncertain that typical value remains.</SectionHelp>
        {resources.length ? <div className="compact-list dense">{resources.map((metric) => <div key={metric.key}><span>{metric.label} <Info text={metric.description} /></span><strong>{number(metric.median)}</strong><small>95% CI {interval(metric.interval.low, metric.interval.high)} · n={metric.runs}</small></div>)}</div> : <NoData>No resource history recorded.</NoData>}
      </Analysis> : null}
    </div>
  </div>
}

function Analysis({ title, subtitle, wide, children }: { title: string; subtitle: string; wide?: boolean; children: ReactNode }) {
  return <section className={`panel analysis ${wide ? 'wide' : ''}`}><div className="section-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</section>
}
function Info({ text }: { text: string }) { return <span className="info-tooltip" tabIndex={0} aria-label={text}>i<span role="tooltip">{text}</span></span> }
function SectionHelp({ children }: { children: ReactNode }) { return <details className="section-help"><summary>How to read this section</summary><p>{children}</p></details> }
function ShowAll({ expanded, total, shown, onClick }: { expanded: boolean; total: number; shown: number; onClick: () => void }) {
  if (total <= 10) return null
  return <button className="show-all" type="button" onClick={onClick}>{expanded ? 'Show top 10' : `Show all ${total}`}<small>{expanded ? '' : `Currently showing ${shown}`}</small></button>
}
function NoData({ children }: { children: ReactNode }) { return <div className="no-data">{children}</div> }
