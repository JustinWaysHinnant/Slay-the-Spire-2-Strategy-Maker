import { CHARACTERS, OUTCOMES, type CardChange, type Pickup, type PotionChange, type RelicChange, type Run, type RunArchive } from './types'

const STORAGE_KEY = 'spire2-runs-v1'
const isOptionalStringArray = (value: unknown) => value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'))
const isPickup = (value: unknown): value is Pickup => typeof value === 'object' && value !== null && typeof (value as Pickup).name === 'string' && ((value as Pickup).floor === undefined || (Number.isInteger((value as Pickup).floor) && (value as Pickup).floor! >= 1)) && ((value as Pickup).upgraded === undefined || typeof (value as Pickup).upgraded === 'boolean') && isOptionalStringArray((value as Pickup).effects)
const isRelicChange = (value: unknown): value is RelicChange => typeof value === 'object' && value !== null && Number.isInteger((value as RelicChange).floor) && (value as RelicChange).floor >= 1 && Array.isArray((value as RelicChange).gained) && (value as RelicChange).gained.every((item) => typeof item === 'string') && Array.isArray((value as RelicChange).removed) && (value as RelicChange).removed.every((item) => typeof item === 'string') && ((value as RelicChange).context === undefined || typeof (value as RelicChange).context === 'string')
const isCardChange = (value: unknown): value is CardChange => isRelicChange(value) && Array.isArray((value as CardChange).transformed) && (value as CardChange).transformed.every((item) => typeof item === 'object' && item !== null && typeof item.from === 'string' && typeof item.to === 'string') && Array.isArray((value as CardChange).upgraded) && (value as CardChange).upgraded.every((item) => typeof item === 'string')
const isPotionChange = (value: unknown): value is PotionChange => typeof value === 'object' && value !== null && Number.isInteger((value as PotionChange).floor) && (value as PotionChange).floor >= 1 && Array.isArray((value as PotionChange).gained) && (value as PotionChange).gained.every((item) => typeof item === 'string') && Array.isArray((value as PotionChange).used) && (value as PotionChange).used.every((item) => typeof item === 'string') && Array.isArray((value as PotionChange).discarded) && (value as PotionChange).discarded.every((item) => typeof item === 'string') && ((value as PotionChange).context === undefined || typeof (value as PotionChange).context === 'string')
export const isRun = (value: unknown): value is Run => {
  if (typeof value !== 'object' || value === null) return false
  const run = value as Run
  return typeof run.id === 'string' && typeof run.date === 'string' && CHARACTERS.includes(run.character) && Number.isInteger(run.ascension) && run.ascension >= 0 && OUTCOMES.includes(run.outcome) && Number.isInteger(run.floor) && run.floor >= 0 && (run.mode === undefined || run.mode === 'singleplayer' || run.mode === 'multiplayer') && (run.playerCount === undefined || (Number.isInteger(run.playerCount) && run.playerCount >= 1 && (run.mode !== 'singleplayer' || run.playerCount === 1) && (run.mode !== 'multiplayer' || run.playerCount >= 2))) && Array.isArray(run.cards) && run.cards.every(isPickup) && isOptionalStringArray(run.cardsEverOwned) && isOptionalStringArray(run.cardsRemovedDuringRun) && isOptionalStringArray(run.cardEffects) && (run.cardChanges === undefined || (Array.isArray(run.cardChanges) && run.cardChanges.every(isCardChange))) && Array.isArray(run.relics) && run.relics.every(isPickup) && (run.relicChanges === undefined || (Array.isArray(run.relicChanges) && run.relicChanges.every(isRelicChange))) && isOptionalStringArray(run.potions) && isOptionalStringArray(run.finalPotions) && (run.potionChanges === undefined || (Array.isArray(run.potionChanges) && run.potionChanges.every(isPotionChange)))
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
      const cardChanges = run.cardChanges === undefined ? update.cardChanges : undefined
      const finalPotions = run.finalPotions === undefined ? update.finalPotions : undefined
      const potionChanges = run.potionChanges === undefined ? update.potionChanges : undefined
      const mode = run.mode === undefined ? update.mode : undefined
      const playerCount = run.playerCount === undefined ? update.playerCount : undefined
      return relicChanges !== undefined || cardsEverOwned !== undefined || cardsRemovedDuringRun !== undefined || cardChanges !== undefined || finalPotions !== undefined || potionChanges !== undefined || mode !== undefined || playerCount !== undefined
        ? { ...run, ...(relicChanges !== undefined ? { relicChanges } : {}), ...(cardsEverOwned !== undefined ? { cardsEverOwned } : {}), ...(cardsRemovedDuringRun !== undefined ? { cardsRemovedDuringRun } : {}), ...(cardChanges !== undefined ? { cardChanges } : {}), ...(finalPotions !== undefined ? { finalPotions } : {}), ...(potionChanges !== undefined ? { potionChanges } : {}), ...(mode !== undefined ? { mode } : {}), ...(playerCount !== undefined ? { playerCount } : {}) }
        : run
    }),
    ...incoming.filter((run) => !ids.has(run.id)),
  ]
}
