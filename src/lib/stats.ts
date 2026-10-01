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
  medianTurns?: number
  turnsInterval?: Interval
}
export interface ResourceMetric { key: string; label: string; description: string; median: number; interval: Interval; runs: number }

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

export function offeredDecisionStats(runs: Run[], act?: number, priorStrength = 8): DecisionStat[] {
  const appearances: { name: string; picked: boolean; nextDamage?: number; group: string }[] = []
  for (const run of runs) {
    const allNodes = run.nodes ?? []
    for (const [index, node] of allNodes.entries()) {
      if (act !== undefined && node.act !== act) continue
      const nextFight = allNodes.slice(index + 1).find(combatNode)
      for (const choice of node.cardChoices ?? []) appearances.push({ name: choice.name, picked: choice.picked, nextDamage: nextFight?.damageTaken, group: `${run.character}|${run.ascension}` })
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
    const turns = matching.flatMap(({ node }) => node.turns === undefined ? [] : [node.turns])
    const deaths = matching.filter(({ run, node }) => node.currentHp === 0 || (run.outcome === 'loss' && run.killedBy === name && run.nodes?.at(-1) === node)).length
    return {
      name, visits: matching.length, deaths, deathRate: deaths / matching.length,
      deathRateInterval: wilsonInterval(deaths, matching.length),
      medianHpLoss: damage.length ? median(damage) : undefined,
      hpLossInterval: damage.length ? bootstrapMedianInterval(damage) : undefined,
      medianTurns: turns.length ? median(turns) : undefined,
      turnsInterval: turns.length ? bootstrapMedianInterval(turns) : undefined,
    }
  }).sort((a, b) => b.deathRate - a.deathRate || (b.medianHpLoss ?? 0) - (a.medianHpLoss ?? 0) || b.visits - a.visits)
}

export function resourceMetrics(runs: Run[], act?: number): ResourceMetric[] {
  const complete = runs.filter((run) => run.nodes?.length)
  const definitions: { key: string; label: string; description: string; value: (run: Run) => number }[] = [
    { key: 'hp', label: 'HP lost', description: 'Median combat damage paid during the selected scope.', value: (run) => nodesInAct(run, act).reduce((sum, node) => sum + (node.damageTaken ?? 0), 0) },
    { key: 'elites', label: 'Elite fights', description: 'Median elite encounters taken per run.', value: (run) => nodesInAct(run, act).filter((node) => node.roomType === 'Elite' || node.mapType === 'Elite').length },
    { key: 'shops', label: 'Shop visits', description: 'Median merchant rooms entered per run.', value: (run) => nodesInAct(run, act).filter((node) => node.roomType === 'Shop' || node.mapType === 'Shop').length },
    { key: 'rests', label: 'Rest-site visits', description: 'Median rest sites reached, regardless of the option chosen.', value: (run) => nodesInAct(run, act).filter((node) => node.restChoices?.length || node.roomType === 'Rest Site').length },
    { key: 'gold-spent', label: 'Gold spent', description: 'Median gold converted into cards, relics, potions, or removals.', value: (run) => nodesInAct(run, act).reduce((sum, node) => sum + (node.goldSpent ?? 0), 0) },
    { key: 'potions', label: 'Potions used', description: 'Median potions consumed rather than carried or discarded.', value: (run) => nodesInAct(run, act).reduce((sum, node) => sum + (node.potionsUsed?.length ?? 0), 0) },
  ]
  return definitions.map(({ key, label, description, value }) => {
    const values = complete.map(value)
    return { key, label, description, median: median(values), interval: bootstrapMedianInterval(values), runs: values.length }
  })
}
