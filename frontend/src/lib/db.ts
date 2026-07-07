// IndexedDB persistence for game images and settings.
// Separation strategy: `games` store holds lightweight metadata (title, size, gameId, lastPlayedAt),
// while `roms` store holds the large binary blobs (100MB–1.4GB). This allows listing games
// without loading all the ROM data into memory. The `settings` store holds user config (DSP IROM, etc.).
// All operations are async via Promise wrappers around IDB transactions.

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

// Lazy-initialized database connection. Cached after first open so all operations
// use the same IDB instance. Creates object stores on first run (onupgradeneeded).
function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      // Create stores if they don't exist (first-run or schema upgrade)
      if (!db.objectStoreNames.contains('games')) db.createObjectStore('games', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('roms')) db.createObjectStore('roms')
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('failed to open IndexedDB'))
  })
  return dbPromise
}

// Promisify IDBRequest callbacks. Converts the callback-based IDB API to Promises
// so our async/await code is cleaner and easier to reason about.
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
    const tx = db.transaction(['games', 'roms', 'settings'], 'readwrite')
    tx.objectStore('games').delete(id)
    tx.objectStore('roms').delete(id)
    // Drop the game's memory card too — saves are useless without the game.
    tx.objectStore('settings').delete(memcardKey(id))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('failed to delete game'))
  })
}

// Memory card persistence. Each game gets its own 2 MB slot-A card image,
// stored as a Blob in the settings store under a namespaced key. Per-game
// (rather than one shared card) so a corrupt save in one game can't take
// out the others, and deleting a game can drop its saves with it.
const memcardKey = (gameId: string) => `memcard:${gameId}`

export async function getMemcard(gameId: string): Promise<Uint8Array | undefined> {
  const blob = await getSetting<Blob>(memcardKey(gameId))
  return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined
}

export async function saveMemcard(gameId: string, data: Uint8Array): Promise<void> {
  // Copy into a fresh ArrayBuffer-backed view: detaches the snapshot from
  // wasm memory and satisfies Blob's BlobPart type under TS 5.7+.
  await setSetting(memcardKey(gameId), new Blob([new Uint8Array(data)]))
}

export async function deleteMemcard(gameId: string): Promise<void> {
  await deleteSetting(memcardKey(gameId))
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
