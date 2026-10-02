import { useMemo, useState, type ReactNode } from 'react'
import { runMode, runSource } from '../lib/runClassification'
import { bootstrapMedianInterval, encounterPressureStats, formatRate, median, offeredDecisionStats, resourceMetrics, wilsonInterval } from '../lib/stats'
import { CHARACTERS, type Run, type RunMode, type RunSource } from '../lib/types'

const pct = (value: number) => `${Math.round(value * 100)}%`
const number = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1)
const interval = (low: number, high: number, suffix = '') => `${number(low)}–${number(high)}${suffix}`
const signedInterval = (low: number, high: number, suffix = '') => `${low > 0 ? '+' : ''}${number(low)} to ${high > 0 ? '+' : ''}${number(high)}${suffix}`
type AnalysisTab = 'decisions' | 'encounters' | 'routing' | 'resources'

const preferenceLabel = (rate: number) => rate >= .67 ? 'Usually picked' : rate <= .33 ? 'Usually skipped' : 'Mixed choice'
const impactLabel = (low?: number, high?: number) => {
  if (low === undefined || high === undefined) return 'Not enough comparison data'
  if (low > 0) return 'Less damage after picking'
  if (high < 0) return 'More damage after picking'
  return 'Effect unclear'
}

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
  const scope = `${runs.length} filtered runs · patch ${patchLabel}`
  const visibleDecisions = showAllDecisions ? decisions : decisions.slice(0, 10)
  const visibleEncounters = showAllEncounters ? encounters : encounters.slice(0, 10)

  if (!runs.length) return <section className="empty"><span>0</span><h2>No runs match these filters.</h2><p>Change the scope or re-import run history with richer node data.</p></section>
  return <div>
    <section className="scope-note"><div><strong>Results are based on {scope}</strong><small>Every “possible” or “likely” range below is a 95% uncertainty range. Smaller ranges are more dependable. <Info text="A 95% uncertainty range shows values reasonably consistent with the recorded sample. It is not a guarantee, and a wide range means more data is needed." /></small></div><span>{nodeRuns}/{runs.length} runs include node history. Card-choice and fight coverage may still vary by run.</span></section>
    <section className="stat-grid">
      <article className="stat"><span>Runs won <Info text="The percentage of completed runs that ended in a win. Abandoned runs are not counted." /></span><strong>{formatRate(counted.length ? wins / counted.length : 0)}</strong><small>Won {wins} of {counted.length} completed runs</small><small>Likely win-rate range: {pct(winCi.low)}–{pct(winCi.high)} <Info text="This 95% uncertainty range is wider when there are fewer completed runs." /></small></article>
      <article className="stat"><span>Recorded card offers <Info text="The number of individual cards shown in fully recorded reward choices. One reward screen can contribute several card offers." /></span><strong>{decisions.reduce((sum, item) => sum + item.offered, 0)}</strong><small>Individual card appearances</small><small>{nodeRuns} of {runs.length} runs include node history</small></article>
      <article className="stat"><span>Typical run length <Info text="The median duration: half of recorded runs were shorter and half were longer. This is less distorted by unusually long runs than an average." /></span><strong>{duration.length ? `${Math.round(median(duration))}m` : '—'}</strong><small>{duration.length ? `Based on ${duration.length} recorded runs` : `0 of ${runs.length} runs recorded a duration`}</small>{duration.length ? <small>Likely typical range: {interval(durationCi.low, durationCi.high, 'm')} <Info text="This 95% bootstrap range shows uncertainty around the typical, or median, run length." /></small> : null}</article>
    </section>

    <div className="analysis-tabs" role="tablist" aria-label="Statistics view">{([
      ['decisions', 'Card choices'], ['encounters', 'Difficult fights'], ['routing', 'Paths taken'], ['resources', 'Resources'],
    ] as [AnalysisTab, string][]).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={analysisTab === value} className={analysisTab === value ? 'active' : ''} onClick={() => setAnalysisTab(value)}>{label}</button>)}</div>
    <div className="analysis-grid compact">
      {analysisTab === 'decisions' ? <Analysis title="Card choices" subtitle={`What you picked when each card appeared · ${scope}`} wide>
        <SectionHelp><strong>Start with the words in bold.</strong> “Usually picked” describes your behavior, not whether a card is objectively good. The adjusted rate prevents one or two appearances from looking more decisive than they are. Next-fight results compare typical damage after picking and skipping; they show a pattern, not proof that the card caused it.</SectionHelp>
        {decisions.length ? <><div className="table-wrap"><table className="analytics-table"><thead><tr><th>Card</th><th>Your choice <Info text="How many times you picked this card out of all times it was offered. Skipped means another card—or no card—was chosen." /></th><th>Usual preference <Info text="A stabilized pick rate. Small samples are gently pulled toward your normal pick rate for the same character and Ascension so they do not look misleadingly extreme." /></th><th>Following fight <Info text="Compares typical damage in the next recorded fight after picking versus skipping. Other differences between runs can also affect this result." /></th></tr></thead><tbody>{visibleDecisions.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td><td><strong>{item.picked} of {item.offered} picked</strong><small>{pct(item.rawPickRate)} raw pick rate · {item.skipped} skipped</small></td><td><strong>{preferenceLabel(item.adjustedPickRate)}</strong><small>Adjusted pick rate: {pct(item.adjustedPickRate)} <Info text="Adjusted means the rate accounts for small samples by blending them with your character-and-Ascension baseline." /></small><small>Possible raw rate: {pct(item.pickRateInterval.low)}–{pct(item.pickRateInterval.high)} <Info text="The 95% uncertainty range for the unadjusted picked-versus-offered rate. A wide range means this preference is not yet well established." /></small></td><td><strong className={item.nextFightHpDeltaInterval?.low !== undefined && item.nextFightHpDeltaInterval.low > 0 ? 'positive' : item.nextFightHpDeltaInterval?.high !== undefined && item.nextFightHpDeltaInterval.high < 0 ? 'negative' : ''}>{impactLabel(item.nextFightHpDeltaInterval?.low, item.nextFightHpDeltaInterval?.high)}</strong>{item.nextFightHpDelta === undefined ? <small>Needs both picked and skipped examples with a following fight</small> : <><small>Estimated difference: {item.nextFightHpDelta >= 0 ? `${number(item.nextFightHpDelta)} HP less damage` : `${number(Math.abs(item.nextFightHpDelta))} HP more damage`}</small><small>Possible difference: {signedInterval(item.nextFightHpDeltaInterval!.low, item.nextFightHpDeltaInterval!.high, ' HP')} <Info text="Positive values mean less next-fight damage after picking; negative values mean more. If the range crosses zero, the direction is unclear." /></small></>}<small>Compared {item.pickedImpactN} picks with {item.skippedImpactN} skips</small></td></tr>)}</tbody></table></div><ShowAll expanded={showAllDecisions} total={decisions.length} shown={visibleDecisions.length} onClick={() => setShowAllDecisions((value) => !value)} /></> : <NoData>No complete card offers exist in this scope. Re-import current <code>.run</code> files.</NoData>}
      </Analysis> : null}

      {analysisTab === 'encounters' ? <Analysis title="Difficult fights" subtitle={`How often each fight ended the run and what it usually cost · ${scope}`} wide>
        <SectionHelp><strong>Deaths per visit</strong> identifies fights that end runs often. Typical HP loss and turns also reveal costly fights that you usually survive. “Typical” means the middle recorded result, so unusually good or bad fights have less influence.</SectionHelp>
        {encounters.length ? <><div className="table-wrap"><table className="analytics-table"><thead><tr><th>Fight</th><th>Survival result <Info text="Deaths divided by the number of times this fight was reached. This is more useful than a raw death count because it accounts for exposure." /></th><th>Typical HP lost <Info text="The median HP lost: half of recorded visits lost less HP and half lost more." /></th><th>Typical turns <Info text="The median fight length: half of recorded visits were shorter and half were longer." /></th></tr></thead><tbody>{visibleEncounters.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td><td><strong>{item.deaths ? `Died on ${item.deaths} of ${item.visits} visits` : `Survived all ${item.visits} visits`}</strong><small>{pct(item.deathRate)} death rate</small><small>Possible rate: {pct(item.deathRateInterval.low)}–{pct(item.deathRateInterval.high)} <Info text="The 95% uncertainty range for the death rate. More visits generally make this range narrower." /></small></td><td><strong>{item.medianHpLoss === undefined ? 'Not recorded' : `${number(item.medianHpLoss)} HP`}</strong><small>{item.hpLossInterval ? `Likely typical range: ${interval(item.hpLossInterval.low, item.hpLossInterval.high, ' HP')}` : 'No HP-loss range available'}</small><small>Based on {item.visits} visits</small></td><td><strong>{item.medianTurns === undefined ? 'Not recorded' : `${number(item.medianTurns)} turns`}</strong><small>{item.turnsInterval ? `Likely typical range: ${interval(item.turnsInterval.low, item.turnsInterval.high, ' turns')}` : 'No turn range available'}</small><small>Based on {item.visits} visits</small></td></tr>)}</tbody></table></div><ShowAll expanded={showAllEncounters} total={encounters.length} shown={visibleEncounters.length} onClick={() => setShowAllEncounters((value) => !value)} /></> : <NoData>No encounter-level records exist in this scope.</NoData>}
      </Analysis> : null}

      {analysisTab === 'routing' ? <Analysis title="Paths taken" subtitle={`Where your routes went · ${scope}`} wide>
        <SectionHelp>This counts every recorded map location you visited. Compare elite, shop, and rest-site shares to see whether your routes tend to be aggressive, economic, or defensive. It describes your routing behavior; it does not decide which route was best.</SectionHelp>
        {roomCounts.length ? <div className="compact-list dense">{roomCounts.map((room) => { const total = roomCounts.reduce((sum, item) => sum + item.count, 0); return <div key={room.name}><span>{room.name} <Info text={`How often ${room.name} appeared among all recorded map locations in the current filters.`} /></span><strong>{room.count} visits</strong><small>{pct(room.count / total)} of {total} recorded locations</small></div> })}</div> : <NoData>No route history recorded.</NoData>}
      </Analysis> : null}

      {analysisTab === 'resources' ? <Analysis title="Resources" subtitle={`What a typical run spent, gained, or risked · ${scope}`} wide>
        <SectionHelp>Each large number is the typical result per run. “Typical” is the middle result rather than an average, so one extreme run cannot distort it as much. The likely range tells you how stable that typical result is.</SectionHelp>
        {resources.length ? <div className="compact-list dense">{resources.map((metric) => <div key={metric.key}><span>{metric.label} <Info text={metric.description} /></span><strong>Typically {number(metric.median)}</strong><small>Likely typical range: {interval(metric.interval.low, metric.interval.high)} <Info text="This 95% bootstrap range shows uncertainty around the typical, or median, per-run value." /></small><small>Based on {metric.runs} runs</small></div>)}</div> : <NoData>No resource history recorded.</NoData>}
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
