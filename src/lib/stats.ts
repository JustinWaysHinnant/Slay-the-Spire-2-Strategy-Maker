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
  const names = new Set(runs.flatMap((run) => run[kind].map((pickup) => pickup.name.trim()).filter(Boolean)))
  return [...names].map((name) => {
    const matching = runs.filter((run) => isCounted(run) && new Set(run[kind].map((pickup) => pickup.name.trim())).has(name))
    const stat = winRate(matching)
    return { name, runs: stat.total, wins: stat.wins, rate: stat.rate, lift: (stat.rate - baseline) * 100 }
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
