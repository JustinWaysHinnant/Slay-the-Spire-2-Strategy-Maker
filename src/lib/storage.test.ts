import { describe, expect, it } from 'vitest'
import { mergeRuns, parseArchive, toArchive } from './storage'
import type { Run } from './types'
const sample: Run = { id:'one', date:'2026-03-01', character:'Silent', ascension:1, outcome:'win', floor:50, cards:[{name:'Dagger',floor:2}], relics:[] }
describe('archives', () => {
  it('round trips valid runs', () => expect(parseArchive(JSON.stringify(toArchive([sample])))).toEqual([sample]))
  it('round trips per-card effects, upgrades, and potions', () => {
    const detailed = { ...sample, cards: [{ name: 'Pommel Strike', floor: 4, upgraded: true, effects: ['Sharp', 'Draw cards'] }], potions: ['Swift Potion'] }
    expect(parseArchive(JSON.stringify(toArchive([detailed])))).toEqual([detailed])
  })
  it('keeps older runs without effects or potions valid', () => expect(parseArchive(JSON.stringify({ version: 1, runs: [sample] }))).toEqual([sample]))
  it('rejects malformed effect and potion lists', () => {
    expect(() => parseArchive(JSON.stringify({ version: 1, runs: [{ ...sample, potions: [4] }] }))).toThrow()
    expect(() => parseArchive(JSON.stringify({ version: 1, runs: [{ ...sample, cards: [{ name: 'Pommel Strike', effects: [4] }] }] }))).toThrow()
  })
  it('rejects malformed archives', () => expect(() => parseArchive('{"version":1,"runs":[{}]}')).toThrow())
  it('keeps existing ids during merge', () => expect(mergeRuns([sample],[{...sample, outcome:'loss'}])[0].outcome).toBe('win'))
  it('enriches an existing run with relic history without duplicating or replacing its other fields', () => {
    const change = { floor: 12, removed: ['Old Relic'], gained: ['New Relic'], context: 'Relic Trader' }
    const merged = mergeRuns([sample], [{ ...sample, outcome: 'loss', relicChanges: [change] }])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ outcome: 'win', relicChanges: [change] })
    expect(parseArchive(JSON.stringify(toArchive(merged)))).toEqual(merged)
  })
  it('rejects invalid relic change records', () => {
    expect(() => parseArchive(JSON.stringify({ version: 1, runs: [{ ...sample, relicChanges: [{ floor: 2, gained: [42], removed: [] }] }] }))).toThrow()
  })
  it('enriches existing imported runs with removed-card history', () => {
    const merged = mergeRuns([sample], [{ ...sample, cardsEverOwned: ['Dagger', 'Removed Card'], cardsRemovedDuringRun: ['Removed Card'] }])
    expect(merged).toHaveLength(1)
    expect(merged[0].cardsEverOwned).toEqual(['Dagger', 'Removed Card'])
    expect(merged[0].cardsRemovedDuringRun).toEqual(['Removed Card'])
    expect(parseArchive(JSON.stringify(toArchive(merged)))).toEqual(merged)
  })
  it('rejects malformed card-history lists', () => {
    expect(() => parseArchive(JSON.stringify({ version: 1, runs: [{ ...sample, cardsEverOwned: ['Dagger', 42] }] }))).toThrow()
    expect(() => parseArchive(JSON.stringify({ version: 1, runs: [{ ...sample, cardsRemovedDuringRun: [42] }] }))).toThrow()
  })
  it('enriches existing runs with card and potion changes and true final potions', () => {
    const cardChange = { floor: 3, gained: ['Wisp'], removed: ['Strike'], transformed: [], upgraded: [], context: 'Reward' }
    const potionChange = { floor: 4, gained: ['Fire Potion'], used: ['Weak Potion'], discarded: [] }
    const old = { ...sample, potions: ['Weak Potion', 'Fire Potion'] }
    const merged = mergeRuns([old], [{ ...old, cardChanges: [cardChange], finalPotions: ['Fire Potion'], potionChanges: [potionChange] }])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ potions: old.potions, cardChanges: [cardChange], finalPotions: ['Fire Potion'], potionChanges: [potionChange] })
    expect(parseArchive(JSON.stringify(toArchive(merged)))).toEqual(merged)
  })
  it('rejects malformed card and potion change records', () => {
    expect(() => parseArchive(JSON.stringify({ version: 1, runs: [{ ...sample, cardChanges: [{ floor: 2, gained: [], removed: [], transformed: [{ from: 'A' }], upgraded: [] }] }] }))).toThrow()
    expect(() => parseArchive(JSON.stringify({ version: 1, runs: [{ ...sample, potionChanges: [{ floor: 2, gained: [], used: [42], discarded: [] }] }] }))).toThrow()
  })
})
