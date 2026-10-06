import { describe, expect, it } from 'vitest'
import { actEconomyStats, ancientChoiceStats, bestCharacter, bootstrapMedianInterval, campfireChoiceStats, cardTimingStats, deathsByEnemy, eliteEncounterStats, eliteRouteStats, encounterPressureStats, floorDistribution, formatRate, offeredDecisionStats, outcomeCounts, pickupStats, resourceMetrics, wilsonInterval, winRate, winRateByAscension, winRateTrend } from './stats'
import type { Run } from './types'

let sequence = 0
const run = (outcome: Run['outcome'], extras: Partial<Run> = {}): Run => ({ id: String(++sequence), date: `2026-04-${String(sequence).padStart(2,'0')}`, character: 'Ironclad', ascension: 0, outcome, floor: 20, cards: [], relics: [], ...extras })

describe('winRate', () => {
  it('calculates wins and losses', () => expect(winRate([run('win'), run('loss')])).toMatchObject({ wins: 1, losses: 1, total: 2, rate: .5 }))
  it('excludes abandoned runs', () => expect(winRate([run('win'), run('abandoned')]).rate).toBe(1))
  it('returns zero for no counted runs', () => expect(winRate([run('abandoned')]).rate).toBe(0))
})
describe('pickupStats', () => {
  it('deduplicates a card within a run', () => { const result = pickupStats([run('win',{cards:[{name:'Zap'},{name:'Zap'}]})], 'cards', 1); expect(result[0].runs).toBe(1) })
  it('filters small samples', () => expect(pickupStats([run('win',{cards:[{name:'Zap'}]})], 'cards')).toEqual([]))
  it('reports lift in percentage points', () => { const result = pickupStats([run('win',{cards:[{name:'Zap'}]}),run('loss'),run('loss')], 'cards', 1); expect(result[0].lift).toBeCloseTo(66.667, 2) })
  it('sorts by lift descending', () => { const runs=[run('win',{cards:[{name:'Good'}]}),run('loss',{cards:[{name:'Bad'}]})]; expect(pickupStats(runs,'cards',1).map(x=>x.name)).toEqual(['Good','Bad']) })
  it('counts cards ever owned even if absent from the final deck', () => {
    const runs = [run('win', { cards: [{ name: 'Final' }], cardsEverOwned: ['Final', 'Removed', 'Removed'], cardsRemovedDuringRun: ['Removed'] }), run('loss')]
    const result = pickupStats(runs, 'cards', 1)
    expect(result.find((card) => card.name === 'Removed')).toMatchObject({ runs: 1, wins: 1, rate: 1, removedRuns: 1, removalTrackedRuns: 1 })
  })
  it('falls back to final cards for older runs without card history', () => {
    expect(pickupStats([run('win', { cards: [{ name: 'Legacy' }] })], 'cards', 1)[0].name).toBe('Legacy')
  })
})
describe('cardTimingStats', () => {
  it('buckets floor boundaries', () => { const result=cardTimingStats([run('win',{cards:[{name:'A',floor:1},{name:'B',floor:10},{name:'C',floor:11}]})],10,1); expect(result.map(x=>x.band)).toEqual(['1–10','11–20']) })
  it('ignores cards without a floor', () => expect(cardTimingStats([run('win',{cards:[{name:'A'}]})],10,1)).toEqual([]))
  it('excludes abandoned runs', () => expect(cardTimingStats([run('abandoned',{cards:[{name:'A',floor:2}]})],10,1)).toEqual([]))
  it('applies the minimum-pickup threshold', () => expect(cardTimingStats([run('win',{cards:[{name:'A',floor:2},{name:'B',floor:3}]})],10,3)).toEqual([]))
  it('counts multiple timed pickups in one run', () => expect(cardTimingStats([run('win',{cards:[{name:'A',floor:2},{name:'B',floor:3}]})],10,1)[0]).toMatchObject({pickups:2,wins:2,rate:1}))
  it('compares each band with overall run win rate', () => { const result=cardTimingStats([run('win',{cards:[{name:'A',floor:2}]}),run('loss',{cards:[{name:'B',floor:12}]})],10,1); expect(result.map(x=>x.lift)).toEqual([50,-50]) })
  it('rejects invalid settings', () => expect(() => cardTimingStats([],0,1)).toThrow())
})
describe('other analytics', () => {
  it('groups ascension win rates', () => expect(winRateByAscension([run('win',{ascension:3})])[3].rate).toBe(1))
  it('groups final floors', () => expect(floorDistribution([run('loss',{floor:10}),run('loss',{floor:11})],10)).toEqual([{band:'1–10',runs:1},{band:'11–20',runs:1}]))
  it('counts deaths by enemy', () => expect(deathsByEnemy([run('loss',{killedBy:'Slime'}),run('win',{killedBy:'Slime'})])).toEqual([{name:'Slime',deaths:1}]))
  it('returns every outcome', () => expect(outcomeCounts([run('win')])).toEqual({win:1,loss:0,abandoned:0}))
  it('requires enough runs for best character', () => expect(bestCharacter([run('win')],2)).toBeNull())
  it('computes a rolling trend', () => expect(winRateTrend([run('win'),run('loss')],1).map(x=>x.rate)).toEqual([1,0]))
  it('formats rates', () => expect(formatRate(2/3)).toBe('67%'))
  it('computes bounded Wilson intervals', () => expect(wilsonInterval(1, 3)).toMatchObject({ low: expect.any(Number), high: expect.any(Number) }))
  it('bootstraps a stable median interval', () => expect(bootstrapMedianInterval([1, 2, 9])).toEqual(bootstrapMedianInterval([1, 2, 9])))
  it('compares offered picks with skips and the next fight', () => {
    const runs = [
      run('win', { nodes: [{ floor: 1, act: 1, cardChoices: [{ name: 'Wisp', picked: true }] }, { floor: 2, act: 1, encounter: 'Slime', damageTaken: 2 }] }),
      run('loss', { nodes: [{ floor: 1, act: 1, cardChoices: [{ name: 'Wisp', picked: false }] }, { floor: 2, act: 1, encounter: 'Slime', damageTaken: 8 }] }),
    ]
    expect(offeredDecisionStats(runs)[0]).toMatchObject({
      name: 'Wisp', offered: 2, picked: 1, skipped: 1,
      pickedWins: 1, pickedCompleted: 1, pickedWinRate: 1,
      skippedWins: 0, skippedCompleted: 1, winRateDelta: 100,
      nextFightHpDelta: 6,
    })
  })
  it('excludes abandoned card choices from outcome comparisons', () => {
    const result = offeredDecisionStats([
      run('win', { nodes: [{ floor: 1, act: 1, cardChoices: [{ name: 'Wisp', picked: true }] }] }),
      run('abandoned', { nodes: [{ floor: 1, act: 1, cardChoices: [{ name: 'Wisp', picked: false }] }] }),
    ])[0]
    expect(result).toMatchObject({ pickedCompleted: 1, skippedCompleted: 0, winRateDelta: undefined })
  })
  it('measures encounter pressure per visit', () => {
    const runs = [run('loss', { killedBy: 'Slime', nodes: [{ floor: 1, act: 1, encounter: 'Slime', damageTaken: 12, turns: 4, currentHp: 0, maxHp: 40, potionsUsed: ['Fire Potion'] }] })]
    expect(encounterPressureStats(runs)[0]).toMatchObject({
      name: 'Slime', visits: 1, deaths: 1, medianHpLoss: 12, medianHpLossPercent: .3,
      hpPercentVisits: 1, highDamageVisits: 1, medianTurns: 4,
      potionUseVisits: 1, potionTrackedVisits: 1, potionUseRate: 1,
      runWins: 0, completedRuns: 1, runWinRate: 0,
    })
  })
  it('deduplicates downstream encounter outcomes by run', () => {
    const result = encounterPressureStats([
      run('win', { nodes: [
        { floor: 1, act: 1, encounter: 'Slime', damageTaken: 2 },
        { floor: 2, act: 1, encounter: 'Slime', damageTaken: 3 },
      ] }),
      run('abandoned', { nodes: [{ floor: 1, act: 1, encounter: 'Slime', damageTaken: 1 }] }),
    ])[0]
    expect(result).toMatchObject({ visits: 3, runWins: 1, completedRuns: 1, runWinRate: 1 })
  })
  it('summarizes route resources per run', () => {
    const result = resourceMetrics([run('win', { nodes: [{ floor: 1, act: 1, roomType: 'Elite', damageTaken: 7, goldSpent: 20, potionsUsed: ['Fire Potion'] }] })])
    expect(result.find((item) => item.key === 'elites')?.median).toBe(1)
    expect(result.find((item) => item.key === 'potions')?.median).toBe(1)
  })
  it('summarizes survival and HP economy by act', () => {
    const runs = [
      run('win', { nodes: [
        { floor: 1, act: 1, currentHp: 70, maxHp: 80, damageTaken: 8 },
        { floor: 2, act: 1, currentHp: 62, maxHp: 80, healed: 5 },
        { floor: 3, act: 2, currentHp: 60, maxHp: 80 },
      ] }),
      run('loss', { nodes: [{ floor: 1, act: 1, currentHp: 40, maxHp: 80, damageTaken: 20 }] }),
    ]
    expect(actEconomyStats(runs)[0]).toMatchObject({ act: 1, entrants: 2, completed: 1, completionRate: .5, medianEntryHp: 55, medianExitHp: 51, medianDamage: 14, medianHealing: 2.5 })
  })
  it('compares campfire choices by act completion', () => {
    const runs = [
      run('win', { nodes: [{ floor: 1, act: 1, restChoices: ['Rest'] }, { floor: 2, act: 2 }] }),
      run('loss', { nodes: [{ floor: 1, act: 1, restChoices: ['Rest'] }] }),
      run('win', { nodes: [{ floor: 1, act: 1, restChoices: ['Upgrade'] }, { floor: 2, act: 2 }] }),
    ]
    expect(campfireChoiceStats(runs)).toEqual(expect.arrayContaining([
      expect.objectContaining({ act: 1, name: 'Rest', choices: 2, runs: 2, completed: 1, completionRate: .5 }),
      expect.objectContaining({ act: 1, name: 'Upgrade', choices: 1, runs: 1, completed: 1, completionRate: 1 }),
    ]))
  })
  it('measures Elite danger, rewards, and downstream wins', () => {
    const runs = [
      run('win', { nodes: [{ floor: 3, act: 1, roomType: 'Elite', encounter: 'Guardian', damageTaken: 8, relicChoices: [{ name: 'Lantern', picked: true }] }] }),
      run('loss', { nodes: [{ floor: 4, act: 1, roomType: 'Elite', encounter: 'Guardian', damageTaken: 24, currentHp: 0 }] }),
    ]
    expect(eliteEncounterStats(runs)[0]).toMatchObject({ name: 'Guardian', visits: 2, deaths: 1, deathRate: .5, medianDamage: 16, relicRewards: 1, rewardRate: .5, runWins: 1, completedRuns: 2, runWinRate: .5 })
  })
  it('compares run outcomes by Elite-route intensity', () => {
    const elite = (floor: number) => ({ floor, act: 1, roomType: 'Elite', damageTaken: 10, relicChoices: [{ name: `Relic ${floor}`, picked: true }] })
    const runs = [run('loss', { nodes: [{ floor: 1, act: 1 }] }), run('win', { nodes: [elite(2)] }), run('win', { nodes: [elite(2), elite(5)] })]
    expect(eliteRouteStats(runs)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'none', runs: 1, wins: 0, medianEliteDamage: 0, medianRelicRewards: 0 }),
      expect.objectContaining({ key: 'one', runs: 1, wins: 1, medianEliteDamage: 10, medianRelicRewards: 1 }),
      expect.objectContaining({ key: 'multiple', runs: 1, wins: 1, medianEliteDamage: 20, medianRelicRewards: 2 }),
    ]))
  })
  it('compares Ancient picks with skips, outcomes, and the next fight', () => {
    const runs = [
      run('win', { nodes: [{ floor: 1, act: 1, ancientChoices: [{ name: 'Ember', picked: true }, { name: 'Moon', picked: false }] }, { floor: 2, act: 1, encounter: 'Slime', damageTaken: 3 }] }),
      run('loss', { nodes: [{ floor: 1, act: 1, ancientChoices: [{ name: 'Ember', picked: false }, { name: 'Moon', picked: true }] }, { floor: 2, act: 1, encounter: 'Slime', damageTaken: 11 }] }),
    ]
    expect(ancientChoiceStats(runs).find((item) => item.name === 'Ember')).toMatchObject({
      offered: 2, picked: 1, skipped: 1, pickRate: .5, pickedWins: 1, pickedCompleted: 1, skippedWins: 0, skippedCompleted: 1, winRateDelta: 100, nextFightHpDelta: 8,
    })
  })
})
