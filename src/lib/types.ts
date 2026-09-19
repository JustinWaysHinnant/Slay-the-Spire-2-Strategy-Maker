export const CHARACTERS = ['Ironclad', 'Silent', 'Defect', 'Regent', 'Necrobinder'] as const
export type Character = (typeof CHARACTERS)[number]
export const OUTCOMES = ['win', 'loss', 'abandoned'] as const
export type Outcome = (typeof OUTCOMES)[number]

export interface Pickup { name: string; floor?: number }

export interface Run {
  id: string
  date: string
  character: Character
  ascension: number
  outcome: Outcome
  floor: number
  killedBy?: string
  cards: Pickup[]
  relics: Pickup[]
  notes?: string
}

export interface WinRate { wins: number; losses: number; total: number; rate: number }
export interface PickupStat { name: string; runs: number; wins: number; rate: number; lift: number }
export interface TimingStat { band: string; startFloor: number; pickups: number; wins: number; rate: number; lift: number }
export interface RunArchive { version: 1; exportedAt: string; runs: Run[] }
