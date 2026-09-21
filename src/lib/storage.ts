import { CHARACTERS, OUTCOMES, type Pickup, type RelicChange, type Run, type RunArchive } from './types'

const STORAGE_KEY = 'spire2-runs-v1'
const isOptionalStringArray = (value: unknown) => value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'))
const isPickup = (value: unknown): value is Pickup => typeof value === 'object' && value !== null && typeof (value as Pickup).name === 'string' && ((value as Pickup).floor === undefined || (Number.isInteger((value as Pickup).floor) && (value as Pickup).floor! >= 1)) && ((value as Pickup).upgraded === undefined || typeof (value as Pickup).upgraded === 'boolean') && isOptionalStringArray((value as Pickup).effects)
const isRelicChange = (value: unknown): value is RelicChange => typeof value === 'object' && value !== null && Number.isInteger((value as RelicChange).floor) && (value as RelicChange).floor >= 1 && Array.isArray((value as RelicChange).gained) && (value as RelicChange).gained.every((item) => typeof item === 'string') && Array.isArray((value as RelicChange).removed) && (value as RelicChange).removed.every((item) => typeof item === 'string') && ((value as RelicChange).context === undefined || typeof (value as RelicChange).context === 'string')
export const isRun = (value: unknown): value is Run => {
  if (typeof value !== 'object' || value === null) return false
  const run = value as Run
  return typeof run.id === 'string' && typeof run.date === 'string' && CHARACTERS.includes(run.character) && Number.isInteger(run.ascension) && run.ascension >= 0 && OUTCOMES.includes(run.outcome) && Number.isInteger(run.floor) && run.floor >= 0 && Array.isArray(run.cards) && run.cards.every(isPickup) && isOptionalStringArray(run.cardsEverOwned) && isOptionalStringArray(run.cardsRemovedDuringRun) && isOptionalStringArray(run.cardEffects) && Array.isArray(run.relics) && run.relics.every(isPickup) && (run.relicChanges === undefined || (Array.isArray(run.relicChanges) && run.relicChanges.every(isRelicChange))) && isOptionalStringArray(run.potions)
}
export function loadRuns(): Run[] { try { const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); return Array.isArray(value) ? value.filter(isRun) : [] } catch { return [] } }
export function saveRuns(runs: Run[]) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(runs)); return true } catch { return false } }
export const toArchive = (runs: Run[]): RunArchive => ({ version: 1, exportedAt: new Date().toISOString(), runs })
export function parseArchive(text: string): Run[] { const value: unknown = JSON.parse(text); if (typeof value !== 'object' || value === null || (value as RunArchive).version !== 1 || !Array.isArray((value as RunArchive).runs) || !(value as RunArchive).runs.every(isRun)) throw new Error('This is not a valid Slay the Spire 2 Strategy Maker archive.'); return (value as RunArchive).runs }
export function mergeRuns(existing: Run[], incoming: Run[]) {
  const byId = new Map(incoming.map((run) => [run.id, run]))
  const ids = new Set(existing.map((run) => run.id))
  return [
    ...existing.map((run) => {
      const update = byId.get(run.id)
      if (!update) return run
      const relicChanges = run.relicChanges === undefined ? update.relicChanges : undefined
      const cardsEverOwned = run.cardsEverOwned === undefined ? update.cardsEverOwned : undefined
      const cardsRemovedDuringRun = run.cardsRemovedDuringRun === undefined ? update.cardsRemovedDuringRun : undefined
      return relicChanges !== undefined || cardsEverOwned !== undefined || cardsRemovedDuringRun !== undefined
        ? { ...run, ...(relicChanges !== undefined ? { relicChanges } : {}), ...(cardsEverOwned !== undefined ? { cardsEverOwned } : {}), ...(cardsRemovedDuringRun !== undefined ? { cardsRemovedDuringRun } : {}) }
        : run
    }),
    ...incoming.filter((run) => !ids.has(run.id)),
  ]
}
