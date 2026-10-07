export const CHARACTERS = ['Ironclad', 'Silent', 'Defect', 'Regent', 'Necrobinder'] as const
export type Character = (typeof CHARACTERS)[number]
export const OUTCOMES = ['win', 'loss', 'abandoned'] as const
export type Outcome = (typeof OUTCOMES)[number]
export type RunMode = 'singleplayer' | 'multiplayer'
export type RunSource = 'normal' | 'modded'

export interface Pickup { name: string; floor?: number; upgraded?: boolean; effects?: string[] }
export interface RelicChange { floor: number; gained: string[]; removed: string[]; context?: string }
export interface CardChange { floor: number; gained: string[]; removed: string[]; transformed: { from: string; to: string }[]; upgraded: string[]; context?: string }
export interface PotionChange { floor: number; gained: string[]; used: string[]; discarded: string[]; context?: string }
export interface OfferedChoice { name: string; picked: boolean }
export interface RunNode {
  floor: number
  act: number
  actName?: string
  mapType?: string
  roomType?: string
  context?: string
  encounter?: string
  monsters?: string[]
  turns?: number
  currentHp?: number
  maxHp?: number
  currentGold?: number
  damageTaken?: number
  healed?: number
  goldGained?: number
  goldSpent?: number
  goldLost?: number
  cardChoices?: OfferedChoice[]
  relicChoices?: OfferedChoice[]
  potionChoices?: OfferedChoice[]
  restChoices?: string[]
  eventChoices?: string[]
  ancientChoices?: OfferedChoice[]
  potionsUsed?: string[]
  potionsDiscarded?: string[]
}

export interface Run {
  id: string
  date: string
  character: Character
  ascension: number
  outcome: Outcome
  floor: number
  source?: RunSource
  mode?: RunMode
  playerCount?: number
  steamPlayerSelected?: true
  killedBy?: string
  seed?: string
  buildId?: string
  startTime?: number
  score?: number
  acts?: string[]
  durationSeconds?: number
  gameMode?: string
  nodes?: RunNode[]
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
