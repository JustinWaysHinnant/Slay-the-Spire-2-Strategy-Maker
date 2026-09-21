export const CHARACTERS = ['Ironclad', 'Silent', 'Defect', 'Regent', 'Necrobinder'] as const
export type Character = (typeof CHARACTERS)[number]
export const OUTCOMES = ['win', 'loss', 'abandoned'] as const
export type Outcome = (typeof OUTCOMES)[number]

export interface Pickup { name: string; floor?: number; upgraded?: boolean; effects?: string[] }
export interface RelicChange { floor: number; gained: string[]; removed: string[]; context?: string }
export interface CardChange { floor: number; gained: string[]; removed: string[]; transformed: { from: string; to: string }[]; upgraded: string[]; context?: string }
export interface PotionChange { floor: number; gained: string[]; used: string[]; discarded: string[]; context?: string }

export interface Run {
  id: string
  date: string
  character: Character
  ascension: number
  outcome: Outcome
  floor: number
  killedBy?: string
  cards: Pickup[]
  cardsEverOwned?: string[]
  cardsRemovedDuringRun?: string[]
  cardChanges?: CardChange[]
  cardEffects?: string[]
  relics: Pickup[]
  relicChanges?: RelicChange[]
  potions?: string[]
  finalPotions?: string[]
  potionChanges?: PotionChange[]
  notes?: string
}

export interface WinRate { wins: number; losses: number; total: number; rate: number }
export interface PickupStat { name: string; runs: number; wins: number; rate: number; lift: number; removedRuns?: number; removalTrackedRuns?: number }
export interface TimingStat { band: string; startFloor: number; pickups: number; wins: number; rate: number; lift: number }
export interface RunArchive { version: 1; exportedAt: string; runs: Run[] }
