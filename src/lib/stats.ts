import type { Character, Outcome, PickupStat, Run, TimingStat, WinRate } from './types'

export const isCounted = (run: Run) => run.outcome !== 'abandoned'

export function winRate(runs: Run[]): WinRate {
  const counted = runs.filter(isCounted)
  const wins = counted.filter((run) => run.outcome === 'win').length
  const losses = counted.length - wins
  return { wins, losses, total: counted.length, rate: counted.length ? wins / counted.length : 0 }
}

export function winRateByCharacter(runs: Run[]): Partial<Record<Character, WinRate>> {
  return Object.fromEntries([...new Set(runs.map((run) => run.character))].map((character) => [character, winRate(runs.filter((run) => run.character === character))]))
}

export function winRateByAscension(runs: Run[]): Record<number, WinRate> {
  return Object.fromEntries([...new Set(runs.map((run) => run.ascension))].sort((a, b) => a - b).map((level) => [level, winRate(runs.filter((run) => run.ascension === level))]))
}

export function pickupStats(runs: Run[], kind: 'cards' | 'relics', minRuns = 3): PickupStat[] {
  const baseline = winRate(runs).rate
  const namesForRun = (run: Run) => kind === 'cards' && run.cardsEverOwned !== undefined
    ? run.cardsEverOwned.map((name) => name.trim()).filter(Boolean)
    : run[kind].map((pickup) => pickup.name.trim()).filter(Boolean)
  const names = new Set(runs.flatMap(namesForRun))
  return [...names].map((name) => {
    const matching = runs.filter((run) => isCounted(run) && new Set(namesForRun(run)).has(name))
    const stat = winRate(matching)
    const removedRuns = kind === 'cards' ? matching.filter((run) => run.cardsRemovedDuringRun?.includes(name)).length : undefined
    const removalTrackedRuns = kind === 'cards' ? matching.filter((run) => run.cardsRemovedDuringRun !== undefined).length : undefined
    return { name, runs: stat.total, wins: stat.wins, rate: stat.rate, lift: (stat.rate - baseline) * 100, ...(removedRuns !== undefined ? { removedRuns, removalTrackedRuns } : {}) }
  }).filter((stat) => stat.runs >= minRuns).sort((a, b) => b.lift - a.lift || b.runs - a.runs || a.name.localeCompare(b.name))
}

/** Compares outcomes for individually timed card pickups, grouped by acquisition floor. */
export function cardTimingStats(runs: Run[], bandSize = 10, minPickups = 3): TimingStat[] {
  if (!Number.isInteger(bandSize) || bandSize < 1) throw new Error('bandSize must be a positive integer')
  if (!Number.isInteger(minPickups) || minPickups < 1) throw new Error('minPickups must be a positive integer')
  const counted = runs.filter(isCounted)
  const baseline = winRate(counted).rate
  const bands = new Map<number, { pickups: number; wins: number }>()
  for (const run of counted) {
    for (const card of run.cards) {
      if (!Number.isInteger(card.floor) || card.floor! < 1) continue
      const startFloor = Math.floor((card.floor! - 1) / bandSize) * bandSize + 1
      const current = bands.get(startFloor) ?? { pickups: 0, wins: 0 }
      current.pickups += 1
      if (run.outcome === 'win') current.wins += 1
      bands.set(startFloor, current)
    }
  }
  return [...bands.entries()].map(([startFloor, value]) => {
    const endFloor = startFloor + bandSize - 1
    const rate = value.wins / value.pickups
    return { band: `${startFloor}–${endFloor}`, startFloor, ...value, rate, lift: (rate - baseline) * 100 }
  }).filter((stat) => stat.pickups >= minPickups).sort((a, b) => a.startFloor - b.startFloor)
}

export function floorDistribution(runs: Run[], bandSize = 10) {
  const bands = new Map<number, number>()
  for (const run of runs) { const start = Math.floor(Math.max(0, run.floor - 1) / bandSize) * bandSize + 1; bands.set(start, (bands.get(start) ?? 0) + 1) }
  return [...bands.entries()].sort(([a], [b]) => a - b).map(([start, count]) => ({ band: `${start}–${start + bandSize - 1}`, runs: count }))
}

export function deathsByEnemy(runs: Run[]) {
  const counts = new Map<string, number>()
  for (const run of runs) if (run.outcome === 'loss' && run.killedBy?.trim()) counts.set(run.killedBy.trim(), (counts.get(run.killedBy.trim()) ?? 0) + 1)
  return [...counts.entries()].map(([name, deaths]) => ({ name, deaths })).sort((a, b) => b.deaths - a.deaths)
}

export function winRateTrend(runs: Run[], windowSize = 10) {
  const counted = runs.filter(isCounted).sort((a, b) => a.date.localeCompare(b.date))
  return counted.map((_, index) => ({ index: index + 1, rate: winRate(counted.slice(Math.max(0, index - windowSize + 1), index + 1)).rate }))
}

export function outcomeCounts(runs: Run[]): Record<Outcome, number> {
  return { win: runs.filter((r) => r.outcome === 'win').length, loss: runs.filter((r) => r.outcome === 'loss').length, abandoned: runs.filter((r) => r.outcome === 'abandoned').length }
}

export function bestCharacter(runs: Run[], minRuns = 3) {
  const entries = Object.entries(winRateByCharacter(runs)) as [Character, WinRate][]
  const best = entries.filter(([, stat]) => stat.total >= minRuns).sort((a, b) => b[1].rate - a[1].rate)[0]
  return best ? { character: best[0], rate: best[1].rate } : null
}

export const formatRate = (rate: number) => `${Math.round(rate * 100)}%`

export interface Interval { low: number; high: number }
export interface DecisionStat {
  name: string
  offered: number
  picked: number
  skipped: number
  rawPickRate: number
  adjustedPickRate: number
  pickRateInterval: Interval
  pickedWins: number
  pickedCompleted: number
  pickedWinRate?: number
  pickedWinInterval?: Interval
  skippedWins: number
  skippedCompleted: number
  winRateDelta?: number
  winRateDeltaInterval?: Interval
  pickedImpactN: number
  skippedImpactN: number
  nextFightHpDelta?: number
  nextFightHpDeltaInterval?: Interval
}
export interface EncounterPressureStat {
  name: string
  visits: number
  deaths: number
  deathRate: number
  deathRateInterval: Interval
  medianHpLoss?: number
  hpLossInterval?: Interval
  medianHpLossPercent?: number
  hpLossPercentInterval?: Interval
  hpPercentVisits: number
  highDamageVisits: number
  medianTurns?: number
  turnsInterval?: Interval
  potionUseVisits: number
  potionTrackedVisits: number
  potionUseRate?: number
  potionUseInterval?: Interval
  runWins: number
  completedRuns: number
  runWinRate?: number
  runWinInterval?: Interval
}
export interface ResourceMetric {
  key: string
  label: string
  description: string
  median: number
  interval: Interval
  runs: number
  winningRuns: number
  losingRuns: number
  winningMedian?: number
  losingMedian?: number
  outcomeDelta?: number
  outcomeDeltaInterval?: Interval
}
export interface DeckConstructionGroup {
  key: string
  label: string
  runs: number
  wins: number
  winRate: number
  winRateInterval: Interval
}
export interface DeckConstructionStats {
  deckSize: DeckConstructionGroup[]
  removals: DeckConstructionGroup[]
  upgrades: DeckConstructionGroup[]
}
export interface RouteOutcomeStat {
  name: string
  visits: number
  archiveShare: number
  runsWithVisit: number
  completedRuns: number
  medianRunShare: number
  runShareInterval: Interval
  winningRuns: number
  losingRuns: number
  winningMedianShare?: number
  losingMedianShare?: number
  outcomeShareDelta?: number
  outcomeShareDeltaInterval?: Interval
}
export interface ProgressComparison {
  key: 'win-rate' | 'final-floor' | 'duration' | 'damage'
  label: string
  unit: 'points' | 'floors' | 'minutes' | 'HP'
  recent: number
  previous: number
  delta: number
  recentInterval: Interval
  previousInterval: Interval
  recentN: number
  previousN: number
}
export interface ProgressWindowStats {
  windowSize: number
  recentRuns: number
  previousRuns: number
  comparisons: ProgressComparison[]
}
export interface CharacterRecord {
  character: Character
  ascension: number
  date: string
  score?: number
}
export interface PatchRecord {
  patch: string
  runs: number
  wins: number
  longestWinStreak: number
  bestAscensionWin?: number
  bestScore?: number
}
export interface PersonalRecordStats {
  completedRuns: number
  currentWinStreak: number
  longestWinStreak: number
  currentBossReachStreak: number
  longestBossReachStreak: number
  bossReachRuns: number
  scoredRuns: number
  bestScoreRun?: Run
  bestAscensionByCharacter: CharacterRecord[]
  patchRecords: PatchRecord[]
}
export interface ActEconomyStat {
  act: number
  entrants: number
  completed: number
  completionRate: number
  completionInterval: Interval
  medianEntryHp?: number
  medianEntryHpPercent?: number
  medianExitHp?: number
  medianExitHpPercent?: number
  medianDamage: number
  damageInterval: Interval
  medianHealing: number
  healingInterval: Interval
}
export interface CampfireChoiceStat {
  act: number
  name: string
  choices: number
  runs: number
  completed: number
  completionRate: number
  completionInterval: Interval
}
export interface EliteEncounterStat {
  name: string
  visits: number
  deaths: number
  deathRate: number
  deathRateInterval: Interval
  medianDamage?: number
  damageInterval?: Interval
  relicRewards: number
  rewardRate: number
  runWins: number
  completedRuns: number
  runWinRate: number
  runWinInterval: Interval
}
export interface EliteRouteStat {
  key: 'none' | 'one' | 'multiple'
  label: string
  runs: number
  wins: number
  winRate: number
  winRateInterval: Interval
  medianEliteDamage: number
  medianRelicRewards: number
}
export interface AncientChoiceStat {
  name: string
  offered: number
  picked: number
  skipped: number
  pickRate: number
  pickRateInterval: Interval
  pickedWins: number
  pickedCompleted: number
  pickedWinRate?: number
  pickedWinInterval?: Interval
  skippedWins: number
  skippedCompleted: number
  winRateDelta?: number
  winRateDeltaInterval?: Interval
  pickedImpactN: number
  skippedImpactN: number
  nextFightHpDelta?: number
  nextFightHpDeltaInterval?: Interval
}

export function wilsonInterval(successes: number, total: number, z = 1.96): Interval {
  if (!total) return { low: 0, high: 0 }
  const p = successes / total
  const denominator = 1 + z * z / total
  const centre = (p + z * z / (2 * total)) / denominator
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator
  return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) }
}

export function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0
  const index = (sorted.length - 1) * q
  const lower = Math.floor(index), upper = Math.ceil(index)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

/** Deterministic percentile bootstrap keeps the same personal archive stable between renders. */
export function bootstrapMedianInterval(values: number[], samples = 600): Interval {
  if (!values.length) return { low: 0, high: 0 }
  if (values.length === 1) return { low: values[0], high: values[0] }
  let state = (values.length * 2654435761) >>> 0
  const estimates: number[] = []
  for (let sample = 0; sample < samples; sample += 1) {
    const draw: number[] = []
    for (let index = 0; index < values.length; index += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      draw.push(values[state % values.length])
    }
    estimates.push(median(draw))
  }
  estimates.sort((a, b) => a - b)
  return { low: quantile(estimates, .025), high: quantile(estimates, .975) }
}

const combatNode = (node: NonNullable<Run['nodes']>[number]) => Boolean(node.encounter) || ['Monster', 'Elite', 'Boss'].includes(node.roomType ?? '')
const nodesInAct = (run: Run, act?: number) => (run.nodes ?? []).filter((node) => act === undefined || node.act === act)
const completedAct = (run: Run, act: number) => (run.nodes ?? []).some((node) => node.act > act)
  || (run.outcome === 'win' && act === Math.max(0, ...(run.nodes ?? []).map((node) => node.act)))

export function actEconomyStats(runs: Run[], selectedAct?: number): ActEconomyStat[] {
  const acts = selectedAct === undefined
    ? [...new Set(runs.flatMap((run) => (run.nodes ?? []).map((node) => node.act)))].sort((a, b) => a - b)
    : [selectedAct]
  return acts.flatMap((act) => {
    const entrants = runs.filter((run) => nodesInAct(run, act).length)
    if (!entrants.length) return []
    const completed = entrants.filter((run) => completedAct(run, act)).length
    const entryHp = entrants.flatMap((run) => {
      const node = nodesInAct(run, act)[0]
      return node.currentHp === undefined ? [] : [node.currentHp]
    })
    const entryHpPercent = entrants.flatMap((run) => {
      const node = nodesInAct(run, act)[0]
      return node.currentHp === undefined || !node.maxHp ? [] : [node.currentHp / node.maxHp]
    })
    const exitHp = entrants.flatMap((run) => {
      const node = nodesInAct(run, act).at(-1)
      return node?.currentHp === undefined ? [] : [node.currentHp]
    })
    const exitHpPercent = entrants.flatMap((run) => {
      const node = nodesInAct(run, act).at(-1)
      return node?.currentHp === undefined || !node.maxHp ? [] : [node.currentHp / node.maxHp]
    })
    const damage = entrants.map((run) => nodesInAct(run, act).reduce((sum, node) => sum + (node.damageTaken ?? 0), 0))
    const healing = entrants.map((run) => nodesInAct(run, act).reduce((sum, node) => sum + (node.healed ?? 0), 0))
    return [{
      act,
      entrants: entrants.length,
      completed,
      completionRate: completed / entrants.length,
      completionInterval: wilsonInterval(completed, entrants.length),
      medianEntryHp: entryHp.length ? median(entryHp) : undefined,
      medianEntryHpPercent: entryHpPercent.length ? median(entryHpPercent) : undefined,
      medianExitHp: exitHp.length ? median(exitHp) : undefined,
      medianExitHpPercent: exitHpPercent.length ? median(exitHpPercent) : undefined,
      medianDamage: median(damage),
      damageInterval: bootstrapMedianInterval(damage),
      medianHealing: median(healing),
      healingInterval: bootstrapMedianInterval(healing),
    }]
  })
}

export function campfireChoiceStats(runs: Run[], selectedAct?: number): CampfireChoiceStat[] {
  const choices = runs.flatMap((run) => (run.nodes ?? []).flatMap((node) => {
    if (selectedAct !== undefined && node.act !== selectedAct) return []
    return (node.restChoices ?? []).map((name) => ({ run, act: node.act, name }))
  }))
  const keys = [...new Set(choices.map((choice) => `${choice.act}\u0000${choice.name}`))]
  return keys.map((key) => {
    const [actText, name] = key.split('\u0000')
    const act = Number(actText)
    const matching = choices.filter((choice) => choice.act === act && choice.name === name)
    const matchingRuns = [...new Map(matching.map((choice) => [choice.run.id, choice.run])).values()]
    const completed = matchingRuns.filter((run) => completedAct(run, act)).length
    return {
      act,
      name,
      choices: matching.length,
      runs: matchingRuns.length,
      completed,
      completionRate: matchingRuns.length ? completed / matchingRuns.length : 0,
      completionInterval: wilsonInterval(completed, matchingRuns.length),
    }
  }).sort((a, b) => a.act - b.act || b.choices - a.choices || a.name.localeCompare(b.name))
}

const eliteNode = (node: NonNullable<Run['nodes']>[number]) => node.roomType === 'Elite' || node.mapType === 'Elite'
const relicRewarded = (node: NonNullable<Run['nodes']>[number]) => Boolean(node.relicChoices?.some((choice) => choice.picked))

export function eliteEncounterStats(runs: Run[], act?: number): EliteEncounterStat[] {
  const visits = runs.flatMap((run) => nodesInAct(run, act).filter(eliteNode).map((node) => ({ run, node })))
  const names = [...new Set(visits.map(({ node }) => node.encounter ?? node.context ?? 'Unknown Elite'))]
  return names.map((name) => {
    const matching = visits.filter(({ node }) => (node.encounter ?? node.context ?? 'Unknown Elite') === name)
    const damage = matching.flatMap(({ node }) => node.damageTaken === undefined ? [] : [node.damageTaken])
    const deaths = matching.filter(({ run, node }) => node.currentHp === 0 || (run.outcome === 'loss' && run.nodes?.at(-1) === node)).length
    const relicRewards = matching.filter(({ node }) => relicRewarded(node)).length
    const matchingRuns = [...new Map(matching.map(({ run }) => [run.id, run])).values()].filter(isCounted)
    const runWins = matchingRuns.filter((run) => run.outcome === 'win').length
    return {
      name,
      visits: matching.length,
      deaths,
      deathRate: deaths / matching.length,
      deathRateInterval: wilsonInterval(deaths, matching.length),
      medianDamage: damage.length ? median(damage) : undefined,
      damageInterval: damage.length ? bootstrapMedianInterval(damage) : undefined,
      relicRewards,
      rewardRate: relicRewards / matching.length,
      runWins,
      completedRuns: matchingRuns.length,
      runWinRate: matchingRuns.length ? runWins / matchingRuns.length : 0,
      runWinInterval: wilsonInterval(runWins, matchingRuns.length),
    }
  }).sort((a, b) => b.deathRate - a.deathRate || (b.medianDamage ?? 0) - (a.medianDamage ?? 0) || b.visits - a.visits)
}

export function eliteRouteStats(runs: Run[], act?: number): EliteRouteStat[] {
  const complete = runs.filter((run) => run.nodes?.length && isCounted(run))
  const groups: { key: EliteRouteStat['key']; label: string; matches: (count: number) => boolean }[] = [
    { key: 'none', label: 'No Elites', matches: (count) => count === 0 },
    { key: 'one', label: 'One Elite', matches: (count) => count === 1 },
    { key: 'multiple', label: 'Multiple Elites', matches: (count) => count >= 2 },
  ]
  return groups.flatMap(({ key, label, matches }) => {
    const matching = complete.filter((run) => matches(nodesInAct(run, act).filter(eliteNode).length))
    if (!matching.length) return []
    const wins = matching.filter((run) => run.outcome === 'win').length
    const damage = matching.map((run) => nodesInAct(run, act).filter(eliteNode).reduce((sum, node) => sum + (node.damageTaken ?? 0), 0))
    const rewards = matching.map((run) => nodesInAct(run, act).filter((node) => eliteNode(node) && relicRewarded(node)).length)
    return [{
      key,
      label,
      runs: matching.length,
      wins,
      winRate: wins / matching.length,
      winRateInterval: wilsonInterval(wins, matching.length),
      medianEliteDamage: median(damage),
      medianRelicRewards: median(rewards),
    }]
  })
}

export function ancientChoiceStats(runs: Run[], act?: number): AncientChoiceStat[] {
  const appearances: { run: Run; name: string; picked: boolean; nextDamage?: number }[] = []
  for (const run of runs) {
    const allNodes = run.nodes ?? []
    for (const [index, node] of allNodes.entries()) {
      if (act !== undefined && node.act !== act) continue
      const nextFight = allNodes.slice(index + 1).find(combatNode)
      for (const choice of node.ancientChoices ?? []) appearances.push({ run, name: choice.name, picked: choice.picked, nextDamage: nextFight?.damageTaken })
    }
  }
  return [...new Set(appearances.map((item) => item.name))].map((name) => {
    const offered = appearances.filter((item) => item.name === name)
    const picked = offered.filter((item) => item.picked)
    const skipped = offered.filter((item) => !item.picked)
    const pickedCompleted = picked.filter((item) => isCounted(item.run))
    const skippedCompleted = skipped.filter((item) => isCounted(item.run))
    const pickedWins = pickedCompleted.filter((item) => item.run.outcome === 'win').length
    const skippedWins = skippedCompleted.filter((item) => item.run.outcome === 'win').length
    const pickedWinRate = pickedCompleted.length ? pickedWins / pickedCompleted.length : undefined
    const skippedWinRate = skippedCompleted.length ? skippedWins / skippedCompleted.length : undefined
    const pickedWinInterval = pickedCompleted.length ? wilsonInterval(pickedWins, pickedCompleted.length) : undefined
    const skippedWinInterval = skippedCompleted.length ? wilsonInterval(skippedWins, skippedCompleted.length) : undefined
    const pickedDamage = picked.flatMap((item) => item.nextDamage === undefined ? [] : [item.nextDamage])
    const skippedDamage = skipped.flatMap((item) => item.nextDamage === undefined ? [] : [item.nextDamage])
    const nextFightHpDelta = pickedDamage.length && skippedDamage.length ? median(skippedDamage) - median(pickedDamage) : undefined
    let nextFightHpDeltaInterval: Interval | undefined
    if (nextFightHpDelta !== undefined) {
      const pickedCi = bootstrapMedianInterval(pickedDamage), skippedCi = bootstrapMedianInterval(skippedDamage)
      nextFightHpDeltaInterval = { low: skippedCi.low - pickedCi.high, high: skippedCi.high - pickedCi.low }
    }
    return {
      name,
      offered: offered.length,
      picked: picked.length,
      skipped: skipped.length,
      pickRate: picked.length / offered.length,
      pickRateInterval: wilsonInterval(picked.length, offered.length),
      pickedWins,
      pickedCompleted: pickedCompleted.length,
      pickedWinRate,
      pickedWinInterval,
      skippedWins,
      skippedCompleted: skippedCompleted.length,
      winRateDelta: pickedWinRate === undefined || skippedWinRate === undefined ? undefined : (pickedWinRate - skippedWinRate) * 100,
      winRateDeltaInterval: pickedWinInterval && skippedWinInterval ? { low: (pickedWinInterval.low - skippedWinInterval.high) * 100, high: (pickedWinInterval.high - skippedWinInterval.low) * 100 } : undefined,
      pickedImpactN: pickedDamage.length,
      skippedImpactN: skippedDamage.length,
      nextFightHpDelta,
      nextFightHpDeltaInterval,
    }
  }).sort((a, b) => b.offered - a.offered || b.pickRate - a.pickRate || a.name.localeCompare(b.name))
}

export function offeredDecisionStats(runs: Run[], act?: number, priorStrength = 8): DecisionStat[] {
  const appearances: { name: string; picked: boolean; nextDamage?: number; group: string; outcome: Run['outcome'] }[] = []
  for (const run of runs) {
    const allNodes = run.nodes ?? []
    for (const [index, node] of allNodes.entries()) {
      if (act !== undefined && node.act !== act) continue
      const nextFight = allNodes.slice(index + 1).find(combatNode)
      for (const choice of node.cardChoices ?? []) appearances.push({ name: choice.name, picked: choice.picked, nextDamage: nextFight?.damageTaken, group: `${run.character}|${run.ascension}`, outcome: run.outcome })
    }
  }
  const groupBaselines = new Map<string, number>()
  for (const group of new Set(appearances.map((item) => item.group))) {
    const matching = appearances.filter((item) => item.group === group)
    groupBaselines.set(group, matching.filter((item) => item.picked).length / matching.length)
  }
  const names = [...new Set(appearances.map((item) => item.name))]
  return names.map((name) => {
    const offered = appearances.filter((item) => item.name === name)
    const picked = offered.filter((item) => item.picked)
    const skipped = offered.filter((item) => !item.picked)
    const pickedDamage = picked.flatMap((item) => item.nextDamage === undefined ? [] : [item.nextDamage])
    const skippedDamage = skipped.flatMap((item) => item.nextDamage === undefined ? [] : [item.nextDamage])
    const pickedCompleted = picked.filter((item) => item.outcome !== 'abandoned')
    const skippedCompleted = skipped.filter((item) => item.outcome !== 'abandoned')
    const pickedWins = pickedCompleted.filter((item) => item.outcome === 'win').length
    const skippedWins = skippedCompleted.filter((item) => item.outcome === 'win').length
    const pickedWinRate = pickedCompleted.length ? pickedWins / pickedCompleted.length : undefined
    const skippedWinRate = skippedCompleted.length ? skippedWins / skippedCompleted.length : undefined
    const pickedWinInterval = pickedCompleted.length ? wilsonInterval(pickedWins, pickedCompleted.length) : undefined
    const skippedWinInterval = skippedCompleted.length ? wilsonInterval(skippedWins, skippedCompleted.length) : undefined
    const delta = pickedDamage.length && skippedDamage.length ? median(skippedDamage) - median(pickedDamage) : undefined
    let deltaInterval: Interval | undefined
    if (delta !== undefined) {
      const pickedCi = bootstrapMedianInterval(pickedDamage), skippedCi = bootstrapMedianInterval(skippedDamage)
      deltaInterval = { low: skippedCi.low - pickedCi.high, high: skippedCi.high - pickedCi.low }
    }
    const baseline = offered.reduce((sum, item) => sum + (groupBaselines.get(item.group) ?? 0), 0) / offered.length
    return {
      name,
      offered: offered.length,
      picked: picked.length,
      skipped: skipped.length,
      rawPickRate: picked.length / offered.length,
      adjustedPickRate: (picked.length + baseline * priorStrength) / (offered.length + priorStrength),
      pickRateInterval: wilsonInterval(picked.length, offered.length),
      pickedWins,
      pickedCompleted: pickedCompleted.length,
      pickedWinRate,
      pickedWinInterval,
      skippedWins,
      skippedCompleted: skippedCompleted.length,
      winRateDelta: pickedWinRate === undefined || skippedWinRate === undefined ? undefined : (pickedWinRate - skippedWinRate) * 100,
      winRateDeltaInterval: pickedWinInterval && skippedWinInterval ? { low: (pickedWinInterval.low - skippedWinInterval.high) * 100, high: (pickedWinInterval.high - skippedWinInterval.low) * 100 } : undefined,
      pickedImpactN: pickedDamage.length,
      skippedImpactN: skippedDamage.length,
      nextFightHpDelta: delta,
      nextFightHpDeltaInterval: deltaInterval,
    }
  }).sort((a, b) => b.offered - a.offered || b.adjustedPickRate - a.adjustedPickRate || a.name.localeCompare(b.name))
}

export function encounterPressureStats(runs: Run[], act?: number): EncounterPressureStat[] {
  const visits = runs.flatMap((run) => nodesInAct(run, act).filter(combatNode).map((node) => ({ run, node })))
  const names = [...new Set(visits.map(({ node }) => node.encounter ?? node.context).filter((name): name is string => Boolean(name)))]
  return names.map((name) => {
    const matching = visits.filter(({ node }) => (node.encounter ?? node.context) === name)
    const damage = matching.flatMap(({ node }) => node.damageTaken === undefined ? [] : [node.damageTaken])
    const damagePercent = matching.flatMap(({ node }) => node.damageTaken === undefined || node.maxHp === undefined || node.maxHp <= 0 ? [] : [node.damageTaken / node.maxHp])
    const turns = matching.flatMap(({ node }) => node.turns === undefined ? [] : [node.turns])
    const deaths = matching.filter(({ run, node }) => node.currentHp === 0 || (run.outcome === 'loss' && run.killedBy === name && run.nodes?.at(-1) === node)).length
    const potionTracked = matching.filter(({ node }) => node.potionsUsed !== undefined)
    const potionUseVisits = potionTracked.filter(({ node }) => node.potionsUsed!.length > 0).length
    const completedRuns = [...new Map(matching.filter(({ run }) => run.outcome !== 'abandoned').map(({ run }) => [run.id, run])).values()]
    const runWins = completedRuns.filter((run) => run.outcome === 'win').length
    return {
      name, visits: matching.length, deaths, deathRate: deaths / matching.length,
      deathRateInterval: wilsonInterval(deaths, matching.length),
      medianHpLoss: damage.length ? median(damage) : undefined,
      hpLossInterval: damage.length ? bootstrapMedianInterval(damage) : undefined,
      medianHpLossPercent: damagePercent.length ? median(damagePercent) : undefined,
      hpLossPercentInterval: damagePercent.length ? bootstrapMedianInterval(damagePercent) : undefined,
      hpPercentVisits: damagePercent.length,
      highDamageVisits: damagePercent.filter((value) => value >= .25).length,
      medianTurns: turns.length ? median(turns) : undefined,
      turnsInterval: turns.length ? bootstrapMedianInterval(turns) : undefined,
      potionUseVisits,
      potionTrackedVisits: potionTracked.length,
      potionUseRate: potionTracked.length ? potionUseVisits / potionTracked.length : undefined,
      potionUseInterval: potionTracked.length ? wilsonInterval(potionUseVisits, potionTracked.length) : undefined,
      runWins,
      completedRuns: completedRuns.length,
      runWinRate: completedRuns.length ? runWins / completedRuns.length : undefined,
      runWinInterval: completedRuns.length ? wilsonInterval(runWins, completedRuns.length) : undefined,
    }
  }).sort((a, b) => b.deathRate - a.deathRate || (b.medianHpLoss ?? 0) - (a.medianHpLoss ?? 0) || b.visits - a.visits)
}

/** Describes completed-run outcomes by final deck shape without implying causality. */
export function deckConstructionStats(runs: Run[]): DeckConstructionStats {
  const completed = runs.filter(isCounted)
  const group = (definitions: { key: string; label: string; matches: (run: Run) => boolean }[], eligible = completed) => definitions.flatMap((definition) => {
    const matching = eligible.filter(definition.matches)
    if (!matching.length) return []
    const wins = matching.filter((run) => run.outcome === 'win').length
    return [{ key: definition.key, label: definition.label, runs: matching.length, wins, winRate: wins / matching.length, winRateInterval: wilsonInterval(wins, matching.length) }]
  })
  const removalCount = (run: Run) => run.cardChanges
    ? run.cardChanges.reduce((total, change) => total + change.removed.length, 0)
    : run.cardsRemovedDuringRun?.length ?? 0
  const upgradeCount = (run: Run) => run.cardChanges
    ? run.cardChanges.reduce((total, change) => total + change.upgraded.length, 0)
    : run.cards.filter((card) => card.upgraded).length
  const removalEligible = completed.filter((run) => run.cardChanges !== undefined || run.cardsRemovedDuringRun !== undefined)
  return {
    deckSize: group([
      { key: '15-or-less', label: '15 or fewer cards', matches: (run) => run.cards.length <= 15 },
      { key: '16-20', label: '16–20 cards', matches: (run) => run.cards.length >= 16 && run.cards.length <= 20 },
      { key: '21-25', label: '21–25 cards', matches: (run) => run.cards.length >= 21 && run.cards.length <= 25 },
      { key: '26-plus', label: '26 or more cards', matches: (run) => run.cards.length >= 26 },
    ]),
    removals: group([
      { key: '0', label: 'No removals', matches: (run) => removalCount(run) === 0 },
      { key: '1', label: '1 removal', matches: (run) => removalCount(run) === 1 },
      { key: '2', label: '2 removals', matches: (run) => removalCount(run) === 2 },
      { key: '3-plus', label: '3+ removals', matches: (run) => removalCount(run) >= 3 },
    ], removalEligible),
    upgrades: group([
      { key: '0', label: 'No upgrades', matches: (run) => upgradeCount(run) === 0 },
      { key: '1-2', label: '1–2 upgrades', matches: (run) => upgradeCount(run) >= 1 && upgradeCount(run) <= 2 },
      { key: '3-5', label: '3–5 upgrades', matches: (run) => upgradeCount(run) >= 3 && upgradeCount(run) <= 5 },
      { key: '6-plus', label: '6+ upgrades', matches: (run) => upgradeCount(run) >= 6 },
    ]),
  }
}

/** Compares the share of each completed run's route spent in a room type. */
export function routeOutcomeStats(runs: Run[], act?: number): RouteOutcomeStat[] {
  const completed = runs.filter(isCounted).flatMap((run) => {
    const nodes = nodesInAct(run, act)
    return nodes.length ? [{ run, nodes }] : []
  })
  const roomName = (node: NonNullable<Run['nodes']>[number]) => node.roomType ?? node.mapType ?? 'Unknown'
  const names = [...new Set(completed.flatMap(({ nodes }) => nodes.map(roomName)))]
  const totalVisits = completed.reduce((sum, { nodes }) => sum + nodes.length, 0)
  return names.map((name) => {
    const shares = completed.map(({ run, nodes }) => ({ run, share: nodes.filter((node) => roomName(node) === name).length / nodes.length }))
    const winners = shares.filter(({ run }) => run.outcome === 'win').map(({ share }) => share)
    const losers = shares.filter(({ run }) => run.outcome === 'loss').map(({ share }) => share)
    const winningMedianShare = winners.length ? median(winners) : undefined
    const losingMedianShare = losers.length ? median(losers) : undefined
    let outcomeShareDelta: number | undefined
    let outcomeShareDeltaInterval: Interval | undefined
    if (winningMedianShare !== undefined && losingMedianShare !== undefined) {
      outcomeShareDelta = (winningMedianShare - losingMedianShare) * 100
      const winInterval = bootstrapMedianInterval(winners), lossInterval = bootstrapMedianInterval(losers)
      outcomeShareDeltaInterval = { low: (winInterval.low - lossInterval.high) * 100, high: (winInterval.high - lossInterval.low) * 100 }
    }
    const visits = completed.reduce((sum, { nodes }) => sum + nodes.filter((node) => roomName(node) === name).length, 0)
    const values = shares.map(({ share }) => share)
    return {
      name,
      visits,
      archiveShare: totalVisits ? visits / totalVisits : 0,
      runsWithVisit: shares.filter(({ share }) => share > 0).length,
      completedRuns: completed.length,
      medianRunShare: median(values),
      runShareInterval: bootstrapMedianInterval(values),
      winningRuns: winners.length,
      losingRuns: losers.length,
      winningMedianShare,
      losingMedianShare,
      outcomeShareDelta,
      outcomeShareDeltaInterval,
    }
  }).sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name))
}

/** Compares the latest completed runs with the immediately preceding window. */
export function progressWindowStats(runs: Run[], windowSize = 10, act?: number): ProgressWindowStats {
  if (!Number.isInteger(windowSize) || windowSize < 1) throw new Error('windowSize must be a positive integer')
  const completed = runs.filter(isCounted).sort((a, b) => b.date.localeCompare(a.date))
  const recent = completed.slice(0, windowSize)
  const previous = completed.slice(windowSize, windowSize * 2)
  const comparisons: ProgressComparison[] = []
  if (recent.length && previous.length) {
    const recentWins = recent.filter((run) => run.outcome === 'win').length
    const previousWins = previous.filter((run) => run.outcome === 'win').length
    const recentRate = recentWins / recent.length, previousRate = previousWins / previous.length
    const recentWinInterval = wilsonInterval(recentWins, recent.length), previousWinInterval = wilsonInterval(previousWins, previous.length)
    comparisons.push({
      key: 'win-rate', label: 'Win rate', unit: 'points', recent: recentRate * 100, previous: previousRate * 100,
      delta: (recentRate - previousRate) * 100,
      recentInterval: { low: recentWinInterval.low * 100, high: recentWinInterval.high * 100 },
      previousInterval: { low: previousWinInterval.low * 100, high: previousWinInterval.high * 100 },
      recentN: recent.length, previousN: previous.length,
    })
    const addMedian = (key: ProgressComparison['key'], label: string, unit: ProgressComparison['unit'], recentValues: number[], previousValues: number[]) => {
      if (!recentValues.length || !previousValues.length) return
      const recentMedian = median(recentValues), previousMedian = median(previousValues)
      comparisons.push({
        key, label, unit, recent: recentMedian, previous: previousMedian, delta: recentMedian - previousMedian,
        recentInterval: bootstrapMedianInterval(recentValues), previousInterval: bootstrapMedianInterval(previousValues),
        recentN: recentValues.length, previousN: previousValues.length,
      })
    }
    addMedian('final-floor', 'Final floor', 'floors', recent.map((run) => run.floor), previous.map((run) => run.floor))
    addMedian('duration', 'Run length', 'minutes', recent.flatMap((run) => run.durationSeconds === undefined ? [] : [run.durationSeconds / 60]), previous.flatMap((run) => run.durationSeconds === undefined ? [] : [run.durationSeconds / 60]))
    const damage = (window: Run[]) => window.flatMap((run) => nodesInAct(run, act).length ? [nodesInAct(run, act).reduce((sum, node) => sum + (node.damageTaken ?? 0), 0)] : [])
    addMedian('damage', 'Recorded combat damage', 'HP', damage(recent), damage(previous))
  }
  return { windowSize, recentRuns: recent.length, previousRuns: previous.length, comparisons }
}

function chronology(run: Run) {
  const importedTime = Number(run.id.split(':').at(-1))
  return run.startTime ?? (Number.isFinite(importedTime) ? importedTime : Date.parse(run.date) / 1000)
}

function streak(values: boolean[]) {
  let current = 0, longest = 0
  for (const value of values) {
    current = value ? current + 1 : 0
    longest = Math.max(longest, current)
  }
  return { current, longest }
}

/** Summarizes durable personal milestones from completed runs in chronological order. */
export function personalRecordStats(runs: Run[]): PersonalRecordStats {
  const completed = runs.filter(isCounted).sort((a, b) => chronology(a) - chronology(b) || a.id.localeCompare(b.id))
  const wins = streak(completed.map((run) => run.outcome === 'win'))
  const bossEligible = completed.filter((run) => run.outcome === 'win' || Boolean(run.nodes?.length))
  const reachedBoss = (run: Run) => run.outcome === 'win' || Boolean(run.nodes?.some((node) => node.roomType?.toLowerCase() === 'boss' || node.mapType?.toLowerCase() === 'boss'))
  const bosses = streak(bossEligible.map(reachedBoss))
  const scored = completed.filter((run): run is Run & { score: number } => run.score !== undefined && Number.isFinite(run.score))
  const bestScoreRun = scored.sort((a, b) => b.score - a.score || chronology(b) - chronology(a))[0]
  const bestAscensionByCharacter = ([...new Set(completed.map((run) => run.character))] as Character[]).flatMap((character) => {
    const best = completed.filter((run) => run.character === character && run.outcome === 'win')
      .sort((a, b) => b.ascension - a.ascension || (b.score ?? -1) - (a.score ?? -1) || chronology(b) - chronology(a))[0]
    return best ? [{ character, ascension: best.ascension, date: best.date, score: best.score }] : []
  }).sort((a, b) => b.ascension - a.ascension || a.character.localeCompare(b.character))
  const patchRecords = [...new Set(completed.map((run) => run.buildId).filter((value): value is string => Boolean(value)))].map((patch) => {
    const patchRuns = completed.filter((run) => run.buildId === patch)
    const patchWins = patchRuns.filter((run) => run.outcome === 'win')
    const patchStreak = streak(patchRuns.map((run) => run.outcome === 'win'))
    const patchScores = patchRuns.flatMap((run) => run.score === undefined ? [] : [run.score])
    return {
      patch,
      runs: patchRuns.length,
      wins: patchWins.length,
      longestWinStreak: patchStreak.longest,
      bestAscensionWin: patchWins.length ? Math.max(...patchWins.map((run) => run.ascension)) : undefined,
      bestScore: patchScores.length ? Math.max(...patchScores) : undefined,
    }
  }).sort((a, b) => b.patch.localeCompare(a.patch))
  return {
    completedRuns: completed.length,
    currentWinStreak: wins.current,
    longestWinStreak: wins.longest,
    currentBossReachStreak: bosses.current,
    longestBossReachStreak: bosses.longest,
    bossReachRuns: bossEligible.length,
    scoredRuns: scored.length,
    bestScoreRun,
    bestAscensionByCharacter,
    patchRecords,
  }
}

export function resourceMetrics(runs: Run[], act?: number): ResourceMetric[] {
  const complete = runs.filter(isCounted).filter((run) => nodesInAct(run, act).length)
  const definitions: { key: string; label: string; description: string; value: (run: Run) => number }[] = [
    { key: 'hp', label: 'HP lost', description: 'Total recorded combat damage paid during the selected scope.', value: (run) => nodesInAct(run, act).reduce((sum, node) => sum + (node.damageTaken ?? 0), 0) },
    { key: 'healing', label: 'HP healed', description: 'Total recorded HP restored during the selected scope.', value: (run) => nodesInAct(run, act).reduce((sum, node) => sum + (node.healed ?? 0), 0) },
    { key: 'gold-gained', label: 'Gold gained', description: 'Total recorded gold earned during the selected scope.', value: (run) => nodesInAct(run, act).reduce((sum, node) => sum + (node.goldGained ?? 0), 0) },
    { key: 'gold-spent', label: 'Gold spent', description: 'Gold converted into cards, relics, potions, or removals.', value: (run) => nodesInAct(run, act).reduce((sum, node) => sum + (node.goldSpent ?? 0), 0) },
    { key: 'gold-lost', label: 'Gold lost', description: 'Gold lost without being recorded as a purchase.', value: (run) => nodesInAct(run, act).reduce((sum, node) => sum + (node.goldLost ?? 0), 0) },
    { key: 'potions', label: 'Potions used', description: 'Potions consumed rather than carried or discarded.', value: (run) => nodesInAct(run, act).reduce((sum, node) => sum + (node.potionsUsed?.length ?? 0), 0) },
    { key: 'potions-discarded', label: 'Potions discarded', description: 'Potions discarded without being consumed.', value: (run) => nodesInAct(run, act).reduce((sum, node) => sum + (node.potionsDiscarded?.length ?? 0), 0) },
    { key: 'shops', label: 'Shop visits', description: 'Merchant rooms entered during the selected scope.', value: (run) => nodesInAct(run, act).filter((node) => node.roomType === 'Shop' || node.mapType === 'Shop').length },
    { key: 'rests', label: 'Rest-site visits', description: 'Rest sites reached, regardless of the option chosen.', value: (run) => nodesInAct(run, act).filter((node) => node.restChoices?.length || node.roomType === 'Rest Site').length },
    { key: 'elites', label: 'Elite fights', description: 'Elite encounters taken during the selected scope.', value: (run) => nodesInAct(run, act).filter((node) => node.roomType === 'Elite' || node.mapType === 'Elite').length },
  ]
  return definitions.map(({ key, label, description, value }) => {
    const observations = complete.map((run) => ({ run, value: value(run) }))
    const values = observations.map((item) => item.value)
    const winning = observations.filter(({ run }) => run.outcome === 'win').map((item) => item.value)
    const losing = observations.filter(({ run }) => run.outcome === 'loss').map((item) => item.value)
    const winningMedian = winning.length ? median(winning) : undefined
    const losingMedian = losing.length ? median(losing) : undefined
    let outcomeDelta: number | undefined
    let outcomeDeltaInterval: Interval | undefined
    if (winningMedian !== undefined && losingMedian !== undefined) {
      outcomeDelta = winningMedian - losingMedian
      const winInterval = bootstrapMedianInterval(winning), lossInterval = bootstrapMedianInterval(losing)
      outcomeDeltaInterval = { low: winInterval.low - lossInterval.high, high: winInterval.high - lossInterval.low }
    }
    return {
      key, label, description, median: median(values), interval: bootstrapMedianInterval(values), runs: values.length,
      winningRuns: winning.length, losingRuns: losing.length, winningMedian, losingMedian, outcomeDelta, outcomeDeltaInterval,
    }
  })
}
