import { describe, expect, it } from 'vitest'
import { runMode, runSource } from './runClassification'
import type { Run } from './types'

const run = (extras: Partial<Run> = {}): Run => ({ id: 'manual', date: '2026-09-30', character: 'Silent', ascension: 0, outcome: 'loss', floor: 10, cards: [], relics: [], ...extras })

describe('run classification', () => {
  it('uses explicit source and mode metadata', () => {
    expect(runSource(run({ source: 'modded' }))).toBe('modded')
    expect(runMode(run({ mode: 'multiplayer', playerCount: 2 }))).toBe('multiplayer')
  })

  it('infers legacy imported sources and removes the unclassified mode bucket', () => {
    expect(runSource(run({ id: 'sts2:modded:123' }))).toBe('modded')
    expect(runSource(run({ id: 'sts2:normal:123' }))).toBe('normal')
    expect(runMode(run())).toBe('singleplayer')
    expect(runMode(run({ playerCount: 3 }))).toBe('multiplayer')
  })
})
