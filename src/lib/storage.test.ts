import { describe, expect, it } from 'vitest'
import { mergeRuns, parseArchive, toArchive } from './storage'
import type { Run } from './types'
const sample: Run = { id:'one', date:'2026-03-01', character:'Silent', ascension:1, outcome:'win', floor:50, cards:[{name:'Dagger',floor:2}], relics:[] }
describe('archives', () => {
  it('round trips valid runs', () => expect(parseArchive(JSON.stringify(toArchive([sample])))).toEqual([sample]))
  it('round trips card effects and potions', () => {
    const detailed = { ...sample, cardEffects: ['Poison', 'Draw cards'], potions: ['Swift Potion'] }
    expect(parseArchive(JSON.stringify(toArchive([detailed])))).toEqual([detailed])
  })
  it('keeps older runs without effects or potions valid', () => expect(parseArchive(JSON.stringify({ version: 1, runs: [sample] }))).toEqual([sample]))
  it('rejects malformed effect and potion lists', () => expect(() => parseArchive(JSON.stringify({ version: 1, runs: [{ ...sample, potions: [4] }] }))).toThrow())
  it('rejects malformed archives', () => expect(() => parseArchive('{"version":1,"runs":[{}]}')).toThrow())
  it('keeps existing ids during merge', () => expect(mergeRuns([sample],[{...sample, outcome:'loss'}])[0].outcome).toBe('win'))
})
