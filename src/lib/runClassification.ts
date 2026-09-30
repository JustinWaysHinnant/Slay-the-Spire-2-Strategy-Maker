import type { Run, RunMode, RunSource } from './types'

export function runSource(run: Run): RunSource {
  if (run.source) return run.source
  if (run.id.startsWith('sts2:modded:') || run.notes?.toLowerCase().includes('modded run history')) return 'modded'
  return 'normal'
}

export function runMode(run: Run): RunMode {
  if (run.mode) return run.mode
  return (run.playerCount ?? 1) > 1 ? 'multiplayer' : 'singleplayer'
}
