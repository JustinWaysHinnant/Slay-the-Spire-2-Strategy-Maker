import { CHARACTERS, type CardChange, type Character, type Pickup, type PotionChange, type RelicChange, type Run } from './types'

export type RunSource = 'normal' | 'modded'

type JsonObject = Record<string, unknown>
type PermissionMode = 'read'

export interface HistoryDirectoryHandle {
  kind: 'directory'
  name: string
  values(): AsyncIterableIterator<HistoryDirectoryHandle | HistoryFileHandle>
  queryPermission(options?: { mode?: PermissionMode }): Promise<PermissionState>
  requestPermission(options?: { mode?: PermissionMode }): Promise<PermissionState>
}

interface HistoryFileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: { id?: string; mode?: PermissionMode }) => Promise<HistoryDirectoryHandle>
}

const DB_NAME = 'spire2-run-folders'
const STORE_NAME = 'handles'

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)
const objects = (value: unknown): JsonObject[] => Array.isArray(value) ? value.filter(isObject) : []

function displayName(value: unknown) {
  if (typeof value !== 'string' || !value) return ''
  const id = value.includes('.') ? value.slice(value.lastIndexOf('.') + 1) : value
  const withoutCharacterSuffix = id.replace(/^(STRIKE|DEFEND)_(IRONCLAD|SILENT|DEFECT|REGENT|NECROBINDER)$/, '$1')
  return withoutCharacterSuffix.toLowerCase().split('_').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function characterName(value: unknown): Character {
  const name = displayName(value)
  const character = CHARACTERS.find((candidate) => candidate.toLowerCase() === name.toLowerCase())
  if (!character) throw new Error(`Unsupported character: ${String(value)}`)
  return character
}

function localDate(timestamp: number) {
  const date = new Date(timestamp * 1000)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid run start time.')
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function pickups(value: unknown): Pickup[] {
  return objects(value).flatMap((item) => {
    const name = displayName(item.id)
    if (!name) return []
    const rawFloor = Number(item.floor_added_to_deck)
    return [{
      name,
      floor: Number.isFinite(rawFloor) ? Math.max(1, Math.trunc(rawFloor)) : undefined,
      upgraded: Number(item.current_upgrade_level) > 0 || undefined,
    }]
  })
}

function mapPoints(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((act) => Array.isArray(act) ? act.filter(isObject) : isObject(act) ? [act] : [])
}

function playerStats(point: JsonObject, playerId: unknown) {
  return objects(point.player_stats).find((item) => item.player_id === playerId) ?? objects(point.player_stats)[0]
}

function pointContext(point: JsonObject) {
  return displayName(objects(point.rooms)[0]?.model_id) || displayName(point.map_point_type) || undefined
}

function itemNames(value: unknown) {
  return (Array.isArray(value) ? value : []).map((item) => displayName(isObject(item) ? item.id : item)).filter(Boolean)
}

function cardChangeHistory(points: JsonObject[], player: JsonObject, finalCards: Pickup[]): CardChange[] {
  const changes: CardChange[] = []
  for (const [index, point] of points.entries()) {
    const stats = playerStats(point, player.id)
    if (!stats) continue
    const picked = objects(stats.card_choices).filter((choice) => choice.was_picked === true)
      .map((choice) => displayName(isObject(choice.card) ? choice.card.id : choice.card)).filter(Boolean)
    const gained = itemNames(stats.cards_gained)
    // Card rewards commonly appear in both fields; use the choice only if it is
    // absent from the recorded gains, while preserving duplicate deck copies.
    for (const name of picked) if (!gained.includes(name)) gained.push(name)
    const removed = itemNames(stats.cards_removed)
    const transformed = objects(stats.cards_transformed).flatMap((item) => {
      const from = displayName(isObject(item.original_card) ? item.original_card.id : item.original_card)
      const to = displayName(isObject(item.final_card) ? item.final_card.id : item.final_card)
      return from && to ? [{ from, to }] : []
    })
    const upgraded = itemNames(stats.upgraded_cards)
    if (gained.length || removed.length || transformed.length || upgraded.length) {
      changes.push({ floor: index + 1, gained, removed, transformed, upgraded, context: pointContext(point) })
    }
  }
  for (const card of finalCards) {
    if (!card.floor || changes.some((change) => change.floor === card.floor && (change.gained.includes(card.name) || change.transformed.some((item) => item.to === card.name)))) continue
    changes.push({ floor: card.floor, gained: [card.name], removed: [], transformed: [], upgraded: [], context: 'Recorded in final deck' })
  }
  return changes.sort((a, b) => a.floor - b.floor)
}

function potionChangeHistory(points: JsonObject[], playerId: unknown): PotionChange[] {
  const changes: PotionChange[] = []
  for (const [index, point] of points.entries()) {
    const stats = playerStats(point, playerId)
    if (!stats) continue
    const gained = objects(stats.potion_choices).filter((choice) => choice.was_picked === true).map((choice) => displayName(choice.choice)).filter(Boolean)
    for (const name of itemNames(stats.bought_potions)) if (!gained.includes(name)) gained.push(name)
    const used = itemNames(stats.potion_used)
    const discarded = itemNames(stats.potion_discarded)
    if (gained.length || used.length || discarded.length) changes.push({ floor: index + 1, gained, used, discarded, context: pointContext(point) })
  }
  return changes
}

function cardHistory(points: JsonObject[], player: JsonObject, finalCards: Pickup[]) {
  const names = new Set(finalCards.map((card) => card.name).filter(Boolean))
  const removed = new Set<string>()
  const addCard = (value: unknown, wasRemoved = false) => {
    const name = displayName(isObject(value) ? value.id : value)
    if (name) {
      names.add(name)
      if (wasRemoved) removed.add(name)
    }
  }
  for (const point of points) {
    const stats = playerStats(point, player.id)
    if (!stats) continue
    for (const card of Array.isArray(stats.cards_gained) ? stats.cards_gained : []) addCard(card)
    for (const card of Array.isArray(stats.cards_removed) ? stats.cards_removed : []) addCard(card, true)
    for (const choice of objects(stats.card_choices)) if (choice.was_picked === true) addCard(choice.card)
    for (const transformation of objects(stats.cards_transformed)) {
      addCard(transformation.original_card, true)
      addCard(transformation.final_card)
    }
  }
  return { everOwned: [...names], removed: [...removed] }
}

function relicNames(value: unknown) {
  const ids = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return ids.map(displayName).filter(Boolean)
}

function relicChangeHistory(points: JsonObject[], player: JsonObject, finalRelics: Pickup[]): RelicChange[] {
  const changes: RelicChange[] = []
  for (const [index, point] of points.entries()) {
    const stats = playerStats(point, player.id)
    if (!stats) continue
    const picked = objects(stats.relic_choices)
      .filter((choice) => choice.was_picked === true)
      .map((choice) => displayName(choice.choice))
      .filter(Boolean)
    const gained = [...new Set([...picked, ...relicNames(stats.bought_relics)])]
    const removed = [...new Set(relicNames(stats.relics_removed))]
    if (!gained.length && !removed.length) continue
    changes.push({ floor: index + 1, gained, removed, context: pointContext(point) })
  }

  // Starter and automatic rewards can be absent from choice events. Keep them visible
  // without inventing an acquisition decision or exchange.
  for (const relic of finalRelics) {
    if (!relic.floor || changes.some((change) => change.floor === relic.floor && change.gained.includes(relic.name))) continue
    changes.push({ floor: relic.floor, gained: [relic.name], removed: [], context: 'Recorded in final inventory' })
  }
  return changes.sort((a, b) => a.floor - b.floor)
}

function potionHistory(points: JsonObject[], playerId: unknown, finalPotions: unknown) {
  const collected = new Set<string>()
  for (const point of points) {
    const stats = objects(point.player_stats).find((item) => item.player_id === playerId) ?? objects(point.player_stats)[0]
    for (const choice of objects(stats?.potion_choices)) {
      if (choice.was_picked === true) {
        const name = displayName(choice.choice)
        if (name) collected.add(name)
      }
    }
  }
  for (const potion of Array.isArray(finalPotions) ? finalPotions : []) {
    const name = displayName(isObject(potion) ? potion.id : potion)
    if (name) collected.add(name)
  }
  return [...collected]
}

export function parseSts2Run(text: string, fileName: string, source: RunSource): Run {
  const value: unknown = JSON.parse(text)
  if (!isObject(value)) throw new Error('Run file is not a JSON object.')
  const player = objects(value.players)[0]
  if (!player) throw new Error('Run file has no player data.')
  const timestamp = Number(value.start_time ?? fileName.replace(/\.run$/i, ''))
  const points = mapPoints(value.map_point_history)
  const ascension = Number(value.ascension)
  if (!Number.isInteger(ascension) || ascension < 0) throw new Error('Run file has an invalid ascension level.')

  const killedBy = displayName(value.killed_by_encounter) || displayName(value.killed_by_event) || undefined
  const cards = pickups(player.deck)
  const cardEvents = cardHistory(points, player, cards)
  const relics = pickups(player.relics)
  return {
    id: `sts2:${source}:${fileName.replace(/\.run$/i, '')}`,
    date: localDate(timestamp),
    character: characterName(player.character),
    ascension,
    outcome: value.was_abandoned === true ? 'abandoned' : value.win === true ? 'win' : 'loss',
    floor: points.length,
    killedBy,
    cards,
    cardsEverOwned: cardEvents.everOwned,
    cardsRemovedDuringRun: cardEvents.removed,
    cardChanges: cardChangeHistory(points, player, cards),
    relics,
    relicChanges: relicChangeHistory(points, player, relics),
    potions: potionHistory(points, player.id, player.potions),
    finalPotions: itemNames(player.potions),
    potionChanges: potionChangeHistory(points, player.id),
    notes: `Imported from ${source} run history.`,
  }
}

export interface ScanResult {
  runs: Run[]
  files: number
  skipped: number
}

export async function scanHistoryDirectory(directory: HistoryDirectoryHandle, source: RunSource): Promise<ScanResult> {
  const runs: Run[] = []
  let files = 0
  let skipped = 0
  for await (const entry of directory.values()) {
    if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.run')) continue
    files += 1
    try {
      const file = await entry.getFile()
      runs.push(parseSts2Run(await file.text(), entry.name, source))
    } catch {
      skipped += 1
    }
  }
  return { runs, files, skipped }
}

export async function scanSelectedFiles(files: FileList, source: RunSource): Promise<ScanResult> {
  const runFiles = [...files].filter((file) => file.name.toLowerCase().endsWith('.run'))
  const runs: Run[] = []
  let skipped = 0
  for (const file of runFiles) {
    try {
      runs.push(parseSts2Run(await file.text(), file.name, source))
    } catch {
      skipped += 1
    }
  }
  return { runs, files: runFiles.length, skipped }
}

export const supportsDirectoryPicker = () => typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function'

export async function chooseHistoryDirectory(source: RunSource) {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker
  if (!picker) throw new Error('Folder syncing requires Chrome or Edge. Use the folder import fallback instead.')
  const handle = await picker({ id: `spire2-${source}-history`, mode: 'read' })
  await saveDirectoryHandle(source, handle)
  return handle
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveDirectoryHandle(source: RunSource, handle: HistoryDirectoryHandle) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(handle, source)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

export async function loadDirectoryHandle(source: RunSource) {
  const database = await openDatabase()
  const handle = await new Promise<HistoryDirectoryHandle | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(source)
    request.onsuccess = () => resolve(request.result as HistoryDirectoryHandle | undefined)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return handle
}

export async function hasReadPermission(handle: HistoryDirectoryHandle, request = false) {
  const state = await handle.queryPermission({ mode: 'read' })
  return state === 'granted' || (request && await handle.requestPermission({ mode: 'read' }) === 'granted')
}
