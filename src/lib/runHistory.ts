import { CHARACTERS, type Character, type Pickup, type Run } from './types'

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
  return {
    id: `sts2:${source}:${fileName.replace(/\.run$/i, '')}`,
    date: localDate(timestamp),
    character: characterName(player.character),
    ascension,
    outcome: value.was_abandoned === true ? 'abandoned' : value.win === true ? 'win' : 'loss',
    floor: points.length,
    killedBy,
    cards: pickups(player.deck),
    relics: pickups(player.relics),
    potions: potionHistory(points, player.id, player.potions),
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
