import { useMemo, useState, type ReactNode } from 'react'
import { runMode, runSource } from '../lib/runClassification'
import { bootstrapMedianInterval, cardTimingStats, deathsByEnemy, encounterPressureStats, floorDistribution, formatRate, median, offeredDecisionStats, pickupStats, resourceMetrics, wilsonInterval, winRate, winRateByAscension, winRateByCharacter, winRateTrend } from '../lib/stats'
import { CHARACTERS, type Run, type RunMode, type RunSource } from '../lib/types'

const pct = (value: number) => `${Math.round(value * 100)}%`
const number = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1)
const interval = (low: number, high: number, suffix = '') => `${number(low)}–${number(high)}${suffix}`
const signedInterval = (low: number, high: number, suffix = '') => `${low > 0 ? '+' : ''}${number(low)} to ${high > 0 ? '+' : ''}${number(high)}${suffix}`
type AnalysisTab = 'performance' | 'decisions' | 'encounters' | 'deck' | 'routing' | 'resources'

const preferenceLabel = (rate: number) => rate >= .67 ? 'Usually picked' : rate <= .33 ? 'Usually skipped' : 'Mixed choice'
const impactLabel = (low?: number, high?: number) => {
  if (low === undefined || high === undefined) return 'Not enough comparison data'
  if (low > 0) return 'Less damage after picking'
  if (high < 0) return 'More damage after picking'
  return 'Effect unclear'
}

type AppTab = 'dashboard' | 'statistics' | 'log' | 'history'

export function Dashboard({ runs, onNavigate }: { runs: Run[]; onNavigate: (tab: AppTab) => void }) {
  const completed = runs.filter((run) => run.outcome !== 'abandoned').sort((a, b) => b.date.localeCompare(a.date))
  const recent = completed.slice(0, 10)
  const recentWins = recent.filter((run) => run.outcome === 'win').length
  const previous = completed.slice(10, 20)
  const previousRate = winRate(previous).rate
  const recentRate = winRate(recent).rate
  const nodeRuns = runs.filter((run) => run.nodes?.length).length
  const danger = encounterPressureStats(runs).find((item) => item.visits >= 2) ?? encounterPressureStats(runs)[0]
  const lastRun = completed[0]
  const trend = previous.length ? Math.round((recentRate - previousRate) * 100) : undefined

  if (!runs.length) return <section className="empty"><span>0</span><h2>Your strategy starts with a run.</h2><p>Connect a history folder above or log a run manually.</p></section>
  return <div className="overview">
    <section className="dashboard-lead panel">
      <div><p className="eyebrow">Next-run brief</p><h2>{danger ? `Prepare for ${danger.name}.` : 'Build your evidence base.'}</h2><p>{danger ? `${danger.deaths} death${danger.deaths === 1 ? '' : 's'} in ${danger.visits} recorded visits, with a typical cost of ${danger.medianHpLoss === undefined ? 'unrecorded HP' : `${number(danger.medianHpLoss)} HP`}. Review the encounter before your next attempt.` : 'Import detailed run history to identify difficult encounters and decision patterns.'}</p></div>
      <button className="primary" type="button" onClick={() => onNavigate('statistics')}>Open statistics</button>
    </section>
    <section className="stat-grid overview-stats">
      <article className="stat"><span>Recent form</span><strong>{recent.length ? `${recentWins}–${recent.length - recentWins}` : '—'}</strong><small>Last {recent.length} completed run{recent.length === 1 ? '' : 's'} · {formatRate(recentRate)} wins</small>{trend === undefined ? <small>More runs will reveal a trend</small> : <small className={trend > 0 ? 'positive' : trend < 0 ? 'negative' : ''}>{trend > 0 ? '+' : ''}{trend} points vs previous {previous.length}</small>}</article>
      <article className="stat"><span>Archive coverage</span><strong>{runs.length ? pct(nodeRuns / runs.length) : '0%'}</strong><small>{nodeRuns} of {runs.length} runs include room-by-room history</small><small>{nodeRuns === runs.length ? 'Ready for detailed analysis' : 'Sync current .run files for richer insights'}</small></article>
      <article className="stat"><span>Last result</span><strong className="text-stat">{lastRun ? `${lastRun.outcome === 'win' ? 'Victory' : 'Defeat'} · F${lastRun.floor}` : '—'}</strong><small>{lastRun ? `${lastRun.character} · A${lastRun.ascension} · ${lastRun.date}` : 'No completed runs yet'}</small><small>{lastRun?.killedBy ? `Ended by ${lastRun.killedBy}` : 'Open history for the full run record'}</small></article>
    </section>
    <section className="overview-grid">
      <article className="panel overview-card"><div className="section-heading"><div><h2>Recent runs</h2><p>The latest completed climbs</p></div><button className="text-action" onClick={() => onNavigate('history')}>View all</button></div>{completed.slice(0, 5).map((run) => <div className="recent-run" key={run.id}><span className={`result-dot ${run.outcome}`}></span><div><strong>{run.character} · A{run.ascension}</strong><small>{run.date}{run.killedBy ? ` · ${run.killedBy}` : ''}</small></div><span>Floor {run.floor}</span></div>)}</article>
      <article className="panel overview-card"><div className="section-heading"><div><h2>Review checklist</h2><p>Turn your archive into a plan</p></div></div><button className="review-link" onClick={() => onNavigate('statistics')}><strong>Check difficult fights</strong><span>Find encounters costing the most HP or runs →</span></button><button className="review-link" onClick={() => onNavigate('statistics')}><strong>Question card habits</strong><span>Compare picks, skips, and following-fight damage →</span></button><button className="review-link" onClick={() => onNavigate('statistics')}><strong>Audit routing and resources</strong><span>Review elite pressure, shops, rests, and potion use →</span></button></article>
    </section>
  </div>
}

export function Statistics({ runs }: { runs: Run[] }) {
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
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>('performance')
  const [showAllDecisions, setShowAllDecisions] = useState(false)
  const [showAllEncounters, setShowAllEncounters] = useState(false)
  const counted = runs.filter((run) => run.outcome !== 'abandoned')
  const wins = counted.filter((run) => run.outcome === 'win').length
  const winCi = wilsonInterval(wins, counted.length)
  const nodeRuns = runs.filter((run) => run.nodes?.length).length
  const decisions = useMemo(() => offeredDecisionStats(runs, act), [runs, act])
  const encounters = useMemo(() => encounterPressureStats(runs, act), [runs, act])
  const resources = useMemo(() => resourceMetrics(runs, act), [runs, act])
  const characterRates = useMemo(() => winRateByCharacter(runs), [runs])
  const ascensionRates = useMemo(() => winRateByAscension(runs), [runs])
  const cardSignals = useMemo(() => pickupStats(runs, 'cards', 3), [runs])
  const relicSignals = useMemo(() => pickupStats(runs, 'relics', 3), [runs])
  const timing = useMemo(() => cardTimingStats(runs), [runs])
  const floorBands = useMemo(() => floorDistribution(runs), [runs])
  const deaths = useMemo(() => deathsByEnemy(runs), [runs])
  const trend = useMemo(() => winRateTrend(runs), [runs])
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
      ['performance', 'Performance'], ['decisions', 'Card choices'], ['encounters', 'Difficult fights'], ['deck', 'Deck signals'], ['routing', 'Paths taken'], ['resources', 'Resources'],
    ] as [AnalysisTab, string][]).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={analysisTab === value} className={analysisTab === value ? 'active' : ''} onClick={() => setAnalysisTab(value)}>{label}</button>)}</div>
    <div className="analysis-grid compact">
      {analysisTab === 'performance' ? <Analysis title="Performance" subtitle={`Where results improve—and where runs stop · ${scope}`} wide>
        <SectionHelp>Compare groups only when they contain a useful number of runs. Win rate by character or Ascension can reveal where to focus practice, while final floors and recurring killers show which stage of the climb deserves preparation.</SectionHelp>
        <div className="strategy-columns">
          <div><h3>By character</h3>{Object.entries(characterRates).length ? <div className="rank-list">{(Object.entries(characterRates) as [string, ReturnType<typeof winRate>][]).sort((a,b) => b[1].rate-a[1].rate).map(([name, stat]) => <div key={name}><span>{name}<small>{stat.wins}–{stat.losses} over {stat.total} runs</small></span><strong>{formatRate(stat.rate)}</strong></div>)}</div> : <NoData>No character results recorded.</NoData>}</div>
          <div><h3>By Ascension</h3>{Object.entries(ascensionRates).length ? <div className="rank-list">{Object.entries(ascensionRates).map(([level, stat]) => <div key={level}><span>A{level}<small>{stat.wins}–{stat.losses} over {stat.total} runs</small></span><strong>{formatRate(stat.rate)}</strong></div>)}</div> : <NoData>No Ascension results recorded.</NoData>}</div>
          <div><h3>Where runs end</h3>{floorBands.length ? <div className="rank-list">{floorBands.map((item) => <div key={item.band}><span>Floors {item.band}</span><strong>{item.runs}</strong></div>)}</div> : <NoData>No final-floor data recorded.</NoData>}</div>
          <div><h3>Recurring run-enders</h3>{deaths.length ? <div className="rank-list">{deaths.slice(0,8).map((item) => <div key={item.name}><span>{item.name}</span><strong>{item.deaths}</strong></div>)}</div> : <NoData>No named run-enders recorded.</NoData>}</div>
        </div>
        <p className="trend-note">Latest rolling win rate: <strong>{trend.length ? formatRate(trend.at(-1)!.rate) : '—'}</strong> across the latest {Math.min(10, counted.length)} completed runs.</p>
      </Analysis> : null}
      {analysisTab === 'decisions' ? <Analysis title="Card choices" subtitle={`What you picked when each card appeared · ${scope}`} wide>
        <SectionHelp><strong>Start with the words in bold.</strong> “Usually picked” describes your behavior, not whether a card is objectively good. The adjusted rate prevents one or two appearances from looking more decisive than they are. Next-fight results compare typical damage after picking and skipping; they show a pattern, not proof that the card caused it.</SectionHelp>
        {decisions.length ? <><div className="table-wrap"><table className="analytics-table"><thead><tr><th>Card</th><th>Your choice <Info text="How many times you picked this card out of all times it was offered. Skipped means another card—or no card—was chosen." /></th><th>Usual preference <Info text="A stabilized pick rate. Small samples are gently pulled toward your normal pick rate for the same character and Ascension so they do not look misleadingly extreme." /></th><th>Following fight <Info text="Compares typical damage in the next recorded fight after picking versus skipping. Other differences between runs can also affect this result." /></th></tr></thead><tbody>{visibleDecisions.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td><td><strong>{item.picked} of {item.offered} picked</strong><small>{pct(item.rawPickRate)} raw pick rate · {item.skipped} skipped</small></td><td><strong>{preferenceLabel(item.adjustedPickRate)}</strong><small>Adjusted pick rate: {pct(item.adjustedPickRate)} <Info text="Adjusted means the rate accounts for small samples by blending them with your character-and-Ascension baseline." /></small><small>Possible raw rate: {pct(item.pickRateInterval.low)}–{pct(item.pickRateInterval.high)} <Info text="The 95% uncertainty range for the unadjusted picked-versus-offered rate. A wide range means this preference is not yet well established." /></small></td><td><strong className={item.nextFightHpDeltaInterval?.low !== undefined && item.nextFightHpDeltaInterval.low > 0 ? 'positive' : item.nextFightHpDeltaInterval?.high !== undefined && item.nextFightHpDeltaInterval.high < 0 ? 'negative' : ''}>{impactLabel(item.nextFightHpDeltaInterval?.low, item.nextFightHpDeltaInterval?.high)}</strong>{item.nextFightHpDelta === undefined ? <small>Needs both picked and skipped examples with a following fight</small> : <><small>Estimated difference: {item.nextFightHpDelta >= 0 ? `${number(item.nextFightHpDelta)} HP less damage` : `${number(Math.abs(item.nextFightHpDelta))} HP more damage`}</small><small>Possible difference: {signedInterval(item.nextFightHpDeltaInterval!.low, item.nextFightHpDeltaInterval!.high, ' HP')} <Info text="Positive values mean less next-fight damage after picking; negative values mean more. If the range crosses zero, the direction is unclear." /></small></>}<small>Compared {item.pickedImpactN} picks with {item.skippedImpactN} skips</small></td></tr>)}</tbody></table></div><ShowAll expanded={showAllDecisions} total={decisions.length} shown={visibleDecisions.length} onClick={() => setShowAllDecisions((value) => !value)} /></> : <NoData>No complete card offers exist in this scope. Re-import current <code>.run</code> files.</NoData>}
      </Analysis> : null}

      {analysisTab === 'encounters' ? <Analysis title="Difficult fights" subtitle={`How often each fight ended the run and what it usually cost · ${scope}`} wide>
        <SectionHelp><strong>Deaths per visit</strong> identifies fights that end runs often. Typical HP loss and turns also reveal costly fights that you usually survive. “Typical” means the middle recorded result, so unusually good or bad fights have less influence.</SectionHelp>
        {encounters.length ? <><div className="table-wrap"><table className="analytics-table"><thead><tr><th>Fight</th><th>Survival result <Info text="Deaths divided by the number of times this fight was reached. This is more useful than a raw death count because it accounts for exposure." /></th><th>Typical HP lost <Info text="The median HP lost: half of recorded visits lost less HP and half lost more." /></th><th>Typical turns <Info text="The median fight length: half of recorded visits were shorter and half were longer." /></th></tr></thead><tbody>{visibleEncounters.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td><td><strong>{item.deaths ? `Died on ${item.deaths} of ${item.visits} visits` : `Survived all ${item.visits} visits`}</strong><small>{pct(item.deathRate)} death rate</small><small>Possible rate: {pct(item.deathRateInterval.low)}–{pct(item.deathRateInterval.high)} <Info text="The 95% uncertainty range for the death rate. More visits generally make this range narrower." /></small></td><td><strong>{item.medianHpLoss === undefined ? 'Not recorded' : `${number(item.medianHpLoss)} HP`}</strong><small>{item.hpLossInterval ? `Likely typical range: ${interval(item.hpLossInterval.low, item.hpLossInterval.high, ' HP')}` : 'No HP-loss range available'}</small><small>Based on {item.visits} visits</small></td><td><strong>{item.medianTurns === undefined ? 'Not recorded' : `${number(item.medianTurns)} turns`}</strong><small>{item.turnsInterval ? `Likely typical range: ${interval(item.turnsInterval.low, item.turnsInterval.high, ' turns')}` : 'No turn range available'}</small><small>Based on {item.visits} visits</small></td></tr>)}</tbody></table></div><ShowAll expanded={showAllEncounters} total={encounters.length} shown={visibleEncounters.length} onClick={() => setShowAllEncounters((value) => !value)} /></> : <NoData>No encounter-level records exist in this scope.</NoData>}
      </Analysis> : null}

      {analysisTab === 'deck' ? <Analysis title="Deck signals" subtitle={`Cards, relics, and timing associated with your results · ${scope}`} wide>
        <SectionHelp><strong>These are associations, not tier lists.</strong> A positive lift means your win rate was higher in runs containing that item than your overall rate. Strong runs, character pools, rarity, and when an item appeared can all influence the result.</SectionHelp>
        <div className="strategy-columns deck-columns">
          <div><h3>Cards linked with stronger results</h3>{cardSignals.length ? <div className="rank-list">{cardSignals.slice(0,8).map((item) => <div key={item.name}><span>{item.name}<small>{item.wins}/{item.runs} wins</small></span><strong className={item.lift >= 0 ? 'positive' : 'negative'}>{item.lift >= 0 ? '+' : ''}{number(item.lift)} pts</strong></div>)}</div> : <NoData>Need at least 3 completed runs with the same card.</NoData>}</div>
          <div><h3>Relics linked with stronger results</h3>{relicSignals.length ? <div className="rank-list">{relicSignals.slice(0,8).map((item) => <div key={item.name}><span>{item.name}<small>{item.wins}/{item.runs} wins</small></span><strong className={item.lift >= 0 ? 'positive' : 'negative'}>{item.lift >= 0 ? '+' : ''}{number(item.lift)} pts</strong></div>)}</div> : <NoData>Need at least 3 completed runs with the same relic.</NoData>}</div>
          <div className="wide-column"><h3>Card acquisition timing</h3>{timing.length ? <div className="rank-list timing-list">{timing.map((item) => <div key={item.band}><span>Floors {item.band}<small>{item.pickups} recorded pickups</small></span><strong className={item.lift >= 0 ? 'positive' : 'negative'}>{formatRate(item.rate)} · {item.lift >= 0 ? '+' : ''}{number(item.lift)} pts</strong></div>)}</div> : <NoData>Need at least 3 timed card pickups in a floor band.</NoData>}</div>
        </div>
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
