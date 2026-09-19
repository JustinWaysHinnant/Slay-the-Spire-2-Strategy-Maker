import { describe, expect, it } from 'vitest'
import { bestCharacter, cardTimingStats, deathsByEnemy, floorDistribution, formatRate, outcomeCounts, pickupStats, winRate, winRateByAscension, winRateTrend } from './stats'
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
})
