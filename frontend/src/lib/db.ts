// IndexedDB persistence for game images and settings.
// Two stores: `games` (small metadata records, safe to list) and
// `roms` (the multi-hundred-MB blobs, fetched one at a time).

export interface GameMeta {
  id: string
  title: string
  fileName: string
  size: number
  addedAt: number
  /** 6-char disc game ID (e.g. GPVE01), read from the ISO header at import. */
  gameId?: string
  /**
   * Epoch ms of the last time this game was launched. Drives the "Recently
   * played" row. This is per-browser only — a cross-user "recently played
   * across everyone" row would need a shared backend, which this static site
   * deliberately doesn't have (see docs/TODO.md).
   */
  lastPlayedAt?: number
}

const DB_NAME = 'cubedeck'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('games')) db.createObjectStore('games', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('roms')) db.createObjectStore('roms')
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('failed to open IndexedDB'))
  })
  return dbPromise
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export async function listGames(): Promise<GameMeta[]> {
  const db = await openDb()
  const games = await request(db.transaction('games').objectStore('games').getAll())
  return (games as GameMeta[]).sort((a, b) => b.addedAt - a.addedAt)
}

export async function addGame(meta: GameMeta, rom: Blob): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['games', 'roms'], 'readwrite')
    tx.objectStore('games').put(meta)
    tx.objectStore('roms').put(rom, meta.id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('failed to save game'))
    tx.onabort = () => reject(tx.error ?? new Error('saving game aborted (storage quota?)'))
  })
}

export async function getGame(id: string): Promise<GameMeta | undefined> {
  const db = await openDb()
  return request(db.transaction('games').objectStore('games').get(id))
}

/** Stamps a game as just-played so it floats to the "Recently played" row. */
export async function markPlayed(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('games', 'readwrite')
    const store = tx.objectStore('games')
    const get = store.get(id)
    get.onsuccess = () => {
      const meta = get.result as GameMeta | undefined
      if (meta) store.put({ ...meta, lastPlayedAt: Date.now() })
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('failed to mark game as played'))
  })
}

export async function getRom(id: string): Promise<Blob | undefined> {
  const db = await openDb()
  return request(db.transaction('roms').objectStore('roms').get(id))
}

export async function deleteGame(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['games', 'roms'], 'readwrite')
    tx.objectStore('games').delete(id)
    tx.objectStore('roms').delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('failed to delete game'))
  })
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  return request(db.transaction('settings').objectStore('settings').get(key))
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  await request(db.transaction('settings', 'readwrite').objectStore('settings').put(value, key))
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await openDb()
  await request(db.transaction('settings', 'readwrite').objectStore('settings').delete(key))
}
