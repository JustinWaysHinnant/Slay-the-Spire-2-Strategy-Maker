import { useMemo, useState, type ReactNode } from 'react'
import { runMode, runSource } from '../lib/runClassification'
import { actEconomyStats, ancientChoiceStats, bootstrapMedianInterval, campfireChoiceStats, cardTimingStats, deathsByEnemy, eliteEncounterStats, eliteRouteStats, encounterPressureStats, floorDistribution, formatRate, median, offeredDecisionStats, pickupStats, resourceMetrics, wilsonInterval, winRate, winRateByAscension, winRateByCharacter, winRateTrend } from '../lib/stats'
import { CHARACTERS, type Run, type RunMode, type RunSource } from '../lib/types'

const pct = (value: number) => `${Math.round(value * 100)}%`
const number = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1)
const interval = (low: number, high: number, suffix = '') => `${number(low)}–${number(high)}${suffix}`
const signedInterval = (low: number, high: number, suffix = '') => `${low > 0 ? '+' : ''}${number(low)} to ${high > 0 ? '+' : ''}${number(high)}${suffix}`
type AnalysisTab = 'performance' | 'health' | 'elites' | 'ancients' | 'decisions' | 'encounters' | 'deck' | 'routing' | 'resources'

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
  const characterCounts = Object.fromEntries(CHARACTERS.map((name) => [name, base.filter((run) => run.character === name).length]))
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
        <label>Ascension<select value={ascension} onChange={(event) => setAscension(event.target.value)}><option value="all">All levels</option>{ascensions.map((level) => <option value={level} key={level}>A{level}</option>)}</select></label>
        <label>Patch<select value={patch} onChange={(event) => setPatch(event.target.value)}><option value="all">All recorded patches</option>{builds.map((build) => <option key={build}>{build}</option>)}</select></label>
        <label>Act<select value={act} onChange={(event) => setAct(event.target.value)}><option value="all">All Acts</option><option value="1">Act 1</option><option value="2">Act 2</option><option value="3">Act 3</option></select></label>
      </div>
    </section>
    {mode === 'singleplayer' ? <section className="character-scope panel" aria-label="Character scope">
      <div><strong>Character view</strong><small>Separate every statistic by the character you are studying.</small></div>
      <div className="character-tabs" role="tablist" aria-label="Choose a character">
        <button type="button" role="tab" aria-selected={character === 'all'} className={character === 'all' ? 'active' : ''} onClick={() => setCharacter('all')}><span>All characters</span><small>{base.length} runs</small></button>
        {CHARACTERS.map((name) => <button type="button" role="tab" aria-selected={character === name} className={character === name ? 'active' : ''} onClick={() => setCharacter(name)} key={name}><span>{name}</span><small>{characterCounts[name]} runs</small></button>)}
      </div>
    </section> : null}
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
  const actEconomy = useMemo(() => actEconomyStats(runs, act), [runs, act])
  const campfires = useMemo(() => campfireChoiceStats(runs, act), [runs, act])
  const eliteEncounters = useMemo(() => eliteEncounterStats(runs, act), [runs, act])
  const eliteRoutes = useMemo(() => eliteRouteStats(runs, act), [runs, act])
  const ancientChoices = useMemo(() => ancientChoiceStats(runs, act), [runs, act])
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
      ['performance', 'Performance'], ['health', 'Act & HP'], ['elites', 'Elite routes'], ['ancients', 'Ancient choices'], ['decisions', 'Card choices'], ['encounters', 'Difficult fights'], ['deck', 'Deck signals'], ['routing', 'Paths taken'], ['resources', 'Resources'],
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
      {analysisTab === 'health' ? <Analysis title="Act survival & HP economy" subtitle={`What each Act costs and how often it is cleared · ${scope}`} wide>
        <SectionHelp><strong>Use this to find the Act that drains your runs.</strong> Entry and exit HP use the first and last recorded room in each Act. Damage and healing are totals per run, shown as medians. Campfire comparisons describe what happened after each choice; they do not prove the choice caused the result.</SectionHelp>
        {actEconomy.length ? <div className="table-wrap"><table className="analytics-table act-economy-table"><thead><tr><th>Act</th><th>Cleared <Info text="A run cleared an Act if it reached a later Act, or won after its last recorded Act." /></th><th>Recorded HP <Info text="Typical HP after the first recorded room and after the final recorded room in the Act. Percentages account for different maximum HP totals." /></th><th>Damage taken <Info text="Typical total recorded combat damage during the Act, per run." /></th><th>Healing <Info text="Typical total recorded HP restored during the Act, per run." /></th></tr></thead><tbody>{actEconomy.map((item) => <tr key={item.act}><td><strong>Act {item.act}</strong><small>{item.entrants} run{item.entrants === 1 ? '' : 's'} reached it</small></td><td><strong>{formatRate(item.completionRate)}</strong><small>{item.completed} of {item.entrants} runs</small><small>Possible rate: {pct(item.completionInterval.low)}–{pct(item.completionInterval.high)}</small></td><td><strong>{item.medianEntryHp === undefined ? 'Not recorded' : `${number(item.medianEntryHp)} → ${number(item.medianExitHp!)} HP`}</strong>{item.medianEntryHpPercent === undefined ? <small>No maximum-HP data</small> : <small>{pct(item.medianEntryHpPercent)} → {pct(item.medianExitHpPercent!)} of max HP</small>}<small>First → last recorded room</small></td><td><strong>{number(item.medianDamage)} HP</strong><small>Likely typical range: {interval(item.damageInterval.low, item.damageInterval.high, ' HP')}</small></td><td><strong>{number(item.medianHealing)} HP</strong><small>Likely typical range: {interval(item.healingInterval.low, item.healingInterval.high, ' HP')}</small></td></tr>)}</tbody></table></div> : <NoData>No room-by-room HP history exists in this scope.</NoData>}
        <div className="subsection-heading"><h3>Campfire decisions</h3><p>How often each choice appeared and whether that run went on to clear the Act.</p></div>
        {campfires.length ? <div className="campfire-grid">{campfires.map((item) => <article key={`${item.act}-${item.name}`}><span>Act {item.act}</span><strong>{item.name}</strong><b>{formatRate(item.completionRate)} cleared</b><small>{item.completed} of {item.runs} runs · {item.choices} choice{item.choices === 1 ? '' : 's'}</small><small>Possible rate: {pct(item.completionInterval.low)}–{pct(item.completionInterval.high)}</small></article>)}</div> : <NoData>No campfire choices were recorded in this scope.</NoData>}
      </Analysis> : null}
      {analysisTab === 'elites' ? <Analysis title="Elite risk versus reward" subtitle={`What Elite paths cost—and what followed · ${scope}`} wide>
        <SectionHelp><strong>Treat these as route signals, not proof that Elites cause wins.</strong> Strong runs are more able to take multiple Elites, while weak runs may die before reaching them. Compare HP cost and reward capture alongside win rate, and use the Act filter when planning a specific route.</SectionHelp>
        <div className="subsection-heading first"><h3>Route intensity</h3><p>Completed-run outcomes grouped by how many Elites were fought in the selected scope.</p></div>
        {eliteRoutes.length ? <div className="elite-route-grid">{eliteRoutes.map((item) => <article key={item.key}><span>{item.label}</span><strong>{formatRate(item.winRate)} wins</strong><small>{item.wins} of {item.runs} completed runs</small><div><b>{number(item.medianEliteDamage)} HP</b><small>typical Elite damage</small></div><div><b>{number(item.medianRelicRewards)}</b><small>typical relic rewards</small></div><em>Possible win rate: {pct(item.winRateInterval.low)}–{pct(item.winRateInterval.high)}</em></article>)}</div> : <NoData>No room-by-room Elite history exists in this scope.</NoData>}
        <div className="subsection-heading"><h3>Elite encounters</h3><p>Direct danger, recorded relic rewards, and the final outcome of runs that took each fight.</p></div>
        {eliteEncounters.length ? <div className="table-wrap"><table className="analytics-table"><thead><tr><th>Elite</th><th>Lethality <Info text="Deaths during this encounter divided by recorded visits." /></th><th>HP cost <Info text="Typical recorded damage in this Elite fight." /></th><th>Relic reward <Info text="Visits with a recorded picked relic divided by all visits. Missing reward records can lower this rate." /></th><th>Run outcome <Info text="Final win rate among completed runs that encountered this Elite. This is an association, not a causal effect." /></th></tr></thead><tbody>{eliteEncounters.map((item) => <tr key={item.name}><td><strong>{item.name}</strong><small>{item.visits} visit{item.visits === 1 ? '' : 's'}</small></td><td><strong className={item.deathRate >= .5 ? 'negative' : ''}>{formatRate(item.deathRate)} deaths</strong><small>{item.deaths} of {item.visits} visits</small><small>Possible rate: {pct(item.deathRateInterval.low)}–{pct(item.deathRateInterval.high)}</small></td><td><strong>{item.medianDamage === undefined ? 'Not recorded' : `${number(item.medianDamage)} HP`}</strong><small>{item.damageInterval ? `Likely typical range: ${interval(item.damageInterval.low, item.damageInterval.high, ' HP')}` : 'No damage range available'}</small></td><td><strong>{formatRate(item.rewardRate)}</strong><small>{item.relicRewards} of {item.visits} visits recorded a picked relic</small></td><td><strong>{formatRate(item.runWinRate)} wins</strong><small>{item.runWins} of {item.completedRuns} completed runs</small><small>Possible rate: {pct(item.runWinInterval.low)}–{pct(item.runWinInterval.high)}</small></td></tr>)}</tbody></table></div> : <NoData>No named Elite encounters were recorded in this scope.</NoData>}
      </Analysis> : null}
      {analysisTab === 'ancients' ? <Analysis title="Ancient choices" subtitle={`What you chose, skipped, and experienced afterward · ${scope}`} wide>
        <SectionHelp><strong>Use the picked-versus-skipped comparison as a question generator, not a tier list.</strong> Run strength, character, path, and patch can all influence both the choice and its result. Wide ranges mean the archive does not yet distinguish the options reliably.</SectionHelp>
        {ancientChoices.length ? <div className="table-wrap"><table className="analytics-table ancient-table"><thead><tr><th>Choice</th><th>Your selection <Info text="How often you picked this option when it was recorded as available." /></th><th>Run result after picking <Info text="Final result of completed runs where this option was picked, compared with runs where it was offered and skipped." /></th><th>Following fight <Info text="Typical damage in the next recorded fight after picking versus skipping. Positive differences mean less damage after picking." /></th></tr></thead><tbody>{ancientChoices.map((item) => <tr key={item.name}><td><strong>{item.name}</strong><small>{item.offered} recorded offer{item.offered === 1 ? '' : 's'}</small></td><td><strong>{item.picked} of {item.offered} picked</strong><small>{formatRate(item.pickRate)} pick rate · {item.skipped} skipped</small><small>Possible rate: {pct(item.pickRateInterval.low)}–{pct(item.pickRateInterval.high)}</small></td><td><strong>{item.pickedWinRate === undefined ? 'No completed picks' : `${formatRate(item.pickedWinRate)} wins`}</strong><small>{item.pickedWins} of {item.pickedCompleted} picked runs</small>{item.winRateDelta === undefined ? <small>Needs both picked and skipped examples</small> : <><small className={item.winRateDelta > 0 ? 'positive' : item.winRateDelta < 0 ? 'negative' : ''}>{item.winRateDelta > 0 ? '+' : ''}{number(item.winRateDelta)} points versus skipping</small><small>Possible difference: {signedInterval(item.winRateDeltaInterval!.low, item.winRateDeltaInterval!.high, ' points')}</small></>}</td><td><strong className={item.nextFightHpDeltaInterval?.low !== undefined && item.nextFightHpDeltaInterval.low > 0 ? 'positive' : item.nextFightHpDeltaInterval?.high !== undefined && item.nextFightHpDeltaInterval.high < 0 ? 'negative' : ''}>{impactLabel(item.nextFightHpDeltaInterval?.low, item.nextFightHpDeltaInterval?.high)}</strong>{item.nextFightHpDelta === undefined ? <small>Needs picked and skipped examples with a following fight</small> : <><small>{item.nextFightHpDelta >= 0 ? `${number(item.nextFightHpDelta)} HP less damage` : `${number(Math.abs(item.nextFightHpDelta))} HP more damage`} after picking</small><small>Possible difference: {signedInterval(item.nextFightHpDeltaInterval!.low, item.nextFightHpDeltaInterval!.high, ' HP')}</small></>}<small>Compared {item.pickedImpactN} picks with {item.skippedImpactN} skips</small></td></tr>)}</tbody></table></div> : <NoData>No Ancient choice offers were recorded in this scope.</NoData>}
      </Analysis> : null}
      {analysisTab === 'decisions' ? <Analysis title="Card choice outcomes" subtitle={`What you picked, skipped, and experienced afterward · ${scope}`} wide>
        <SectionHelp><strong>Use these comparisons to find choices worth reviewing, not to build a universal tier list.</strong> “Usually picked” describes your behavior. Final win rate and following-fight damage are associations: deck state, route, character, difficulty, and patch can all influence both the choice and its result. Wide ranges mean more examples are needed.</SectionHelp>
        {decisions.length ? <><div className="table-wrap"><table className="analytics-table card-choice-table"><thead><tr><th>Card</th><th>Your choice <Info text="How many times you picked this card out of all times it was offered. Skipped means another card—or no card—was chosen." /></th><th>Usual preference <Info text="A stabilized pick rate. Small samples are gently pulled toward your normal pick rate for the same character and Ascension so they do not look misleadingly extreme." /></th><th>Run result after picking <Info text="Final outcome of completed runs where the card was picked, compared with runs where it was offered and skipped." /></th><th>Following fight <Info text="Compares typical damage in the next recorded fight after picking versus skipping. Other differences between runs can also affect this result." /></th></tr></thead><tbody>{visibleDecisions.map((item) => <tr key={item.name}><td><strong>{item.name}</strong><small>{item.offered} recorded offer{item.offered === 1 ? '' : 's'}</small></td><td><strong>{item.picked} of {item.offered} picked</strong><small>{pct(item.rawPickRate)} raw pick rate · {item.skipped} skipped</small></td><td><strong>{preferenceLabel(item.adjustedPickRate)}</strong><small>Adjusted pick rate: {pct(item.adjustedPickRate)} <Info text="Adjusted means the rate accounts for small samples by blending them with your character-and-Ascension baseline." /></small><small>Possible raw rate: {pct(item.pickRateInterval.low)}–{pct(item.pickRateInterval.high)} <Info text="The 95% uncertainty range for the unadjusted picked-versus-offered rate. A wide range means this preference is not yet well established." /></small></td><td><strong>{item.pickedWinRate === undefined ? 'No completed picks' : `${formatRate(item.pickedWinRate)} wins`}</strong><small>{item.pickedWins} of {item.pickedCompleted} picked runs</small>{item.pickedWinInterval ? <small>Possible picked win rate: {pct(item.pickedWinInterval.low)}–{pct(item.pickedWinInterval.high)}</small> : null}{item.winRateDelta === undefined ? <small>Needs both picked and skipped examples</small> : <><small className={item.winRateDelta > 0 ? 'positive' : item.winRateDelta < 0 ? 'negative' : ''}>{item.winRateDelta > 0 ? '+' : ''}{number(item.winRateDelta)} points versus skipping</small><small>Possible difference: {signedInterval(item.winRateDeltaInterval!.low, item.winRateDeltaInterval!.high, ' points')}</small></>}</td><td><strong className={item.nextFightHpDeltaInterval?.low !== undefined && item.nextFightHpDeltaInterval.low > 0 ? 'positive' : item.nextFightHpDeltaInterval?.high !== undefined && item.nextFightHpDeltaInterval.high < 0 ? 'negative' : ''}>{impactLabel(item.nextFightHpDeltaInterval?.low, item.nextFightHpDeltaInterval?.high)}</strong>{item.nextFightHpDelta === undefined ? <small>Needs both picked and skipped examples with a following fight</small> : <><small>Estimated difference: {item.nextFightHpDelta >= 0 ? `${number(item.nextFightHpDelta)} HP less damage` : `${number(Math.abs(item.nextFightHpDelta))} HP more damage`}</small><small>Possible difference: {signedInterval(item.nextFightHpDeltaInterval!.low, item.nextFightHpDeltaInterval!.high, ' HP')} <Info text="Positive values mean less next-fight damage after picking; negative values mean more. If the range crosses zero, the direction is unclear." /></small></>}<small>Compared {item.pickedImpactN} picks with {item.skippedImpactN} skips</small></td></tr>)}</tbody></table></div><ShowAll expanded={showAllDecisions} total={decisions.length} shown={visibleDecisions.length} onClick={() => setShowAllDecisions((value) => !value)} /></> : <NoData>No complete card offers exist in this scope. Re-import current <code>.run</code> files.</NoData>}
      </Analysis> : null}

      {analysisTab === 'encounters' ? <Analysis title="Encounter matchups" subtitle={`Where fights demand health, time, potions, or the run itself · ${scope}`} wide>
        <SectionHelp><strong>Use the selected character and Act filters to build a preparation list.</strong> Death rate shows immediate lethality; HP share makes damage comparable across maximum-health totals; potion use shows resource pressure; and final win rate shows what happened after reaching the fight. These are descriptive associations, not proof that an encounter caused the final result.</SectionHelp>
        {encounters.length ? <><div className="table-wrap"><table className="analytics-table encounter-table"><thead><tr><th>Fight</th><th>Lethality <Info text="Deaths divided by recorded visits. This accounts for how often the fight was reached." /></th><th>Health burden <Info text="Typical recorded damage in HP and as a share of maximum HP. A heavy hit is at least 25% of maximum HP." /></th><th>Fight cost <Info text="Typical turns plus the share of tracked visits where at least one potion was used." /></th><th>Run result after reaching it <Info text="Final outcome of distinct completed runs that reached this fight. Repeated visits in one run count once here." /></th></tr></thead><tbody>{visibleEncounters.map((item) => <tr key={item.name}><td><strong>{item.name}</strong><small>{item.visits} recorded visit{item.visits === 1 ? '' : 's'}</small></td><td><strong className={item.deathRate >= .5 ? 'negative' : ''}>{formatRate(item.deathRate)} deaths</strong><small>{item.deaths} of {item.visits} visits</small><small>Possible rate: {pct(item.deathRateInterval.low)}–{pct(item.deathRateInterval.high)}</small></td><td><strong>{item.medianHpLoss === undefined ? 'Not recorded' : `${number(item.medianHpLoss)} HP`}</strong><small>{item.hpLossInterval ? `Likely typical range: ${interval(item.hpLossInterval.low, item.hpLossInterval.high, ' HP')}` : 'No HP-loss range available'}</small>{item.medianHpLossPercent === undefined ? <small>No maximum-HP comparison</small> : <><small>{pct(item.medianHpLossPercent)} of max HP typically</small><small>{item.highDamageVisits} of {item.hpPercentVisits} visits cost at least 25%</small></>}</td><td><strong>{item.medianTurns === undefined ? 'Turns not recorded' : `${number(item.medianTurns)} turns`}</strong><small>{item.turnsInterval ? `Likely typical range: ${interval(item.turnsInterval.low, item.turnsInterval.high, ' turns')}` : 'No turn range available'}</small><small>{item.potionUseRate === undefined ? 'Potion use not recorded' : `${formatRate(item.potionUseRate)} used a potion · ${item.potionUseVisits} of ${item.potionTrackedVisits}`}</small>{item.potionUseInterval ? <small>Possible potion-use rate: {pct(item.potionUseInterval.low)}–{pct(item.potionUseInterval.high)}</small> : null}</td><td><strong>{item.runWinRate === undefined ? 'No completed runs' : `${formatRate(item.runWinRate)} wins`}</strong><small>{item.runWins} of {item.completedRuns} completed runs</small>{item.runWinInterval ? <small>Possible rate: {pct(item.runWinInterval.low)}–{pct(item.runWinInterval.high)}</small> : null}</td></tr>)}</tbody></table></div><ShowAll expanded={showAllEncounters} total={encounters.length} shown={visibleEncounters.length} onClick={() => setShowAllEncounters((value) => !value)} /></> : <NoData>No encounter-level records exist in this scope.</NoData>}
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
