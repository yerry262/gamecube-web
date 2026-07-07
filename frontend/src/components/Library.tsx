import { useCallback, useEffect, useRef, useState } from 'react'
import { addGame, deleteGame, deleteSetting, getSetting, listGames, setSetting, type GameMeta } from '../lib/db.ts'
import { KNOWN_GAMES, searchKnownGames, type KnownGame } from '../lib/games.ts'

const ACCEPTED = ['.iso', '.gcm', '.rvz', '.zip', '.dol', '.bin']

// Extensions the folder scan treats as GameCube disc images. Superset of the
// picker's ACCEPTED (adds the ciso/gcz variants some rips use); excludes the
// homebrew .dol/.bin, which aren't what you'd bulk-scan a game folder for.
const SCAN_EXTS = ['.iso', '.gcm', '.rvz', '.ciso', '.gcz', '.zip']

// The File System Access API (folder picker + recursive read) is Chromium-only
// — Chrome/Edge and the Tesla browser have it; iPad Safari does not. Feature-
// detect so the option only appears where it can work.
const CAN_SCAN_FOLDER = typeof window !== 'undefined' && 'showDirectoryPicker' in window

// Minimal typings for the parts of the File System Access API we use; the
// bundled TS DOM lib doesn't declare showDirectoryPicker or the async values()
// iterator on directory handles.
interface DirectoryHandleWithValues extends FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>
}
declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
  }
}

/** Recursively yields every file handle under a directory (depth-capped). */
async function* walkFiles(dir: FileSystemDirectoryHandle, depth = 0): AsyncGenerator<FileSystemFileHandle> {
  if (depth > 4) return
  for await (const entry of (dir as DirectoryHandleWithValues).values()) {
    if (entry.kind === 'file') yield entry
    else yield* walkFiles(entry, depth + 1)
  }
}

/**
 * Reads the 6-char game ID (e.g. GPVE01) from a plain disc image header.
 * Zip/RVZ wrap the header (compressed), DOL/BIN have none — skip those.
 */
async function readDiscId(blob: Blob, fileName: string): Promise<string | undefined> {
  const name = fileName.toLowerCase()
  if (!name.endsWith('.iso') && !name.endsWith('.gcm')) return undefined
  if (blob.size < 0x20) return undefined
  const head = new Uint8Array(await blob.slice(0, 0x20).arrayBuffer())
  // GameCube disc magic word at 0x1c.
  const magic = ((head[0x1c] << 24) | (head[0x1d] << 16) | (head[0x1e] << 8) | head[0x1f]) >>> 0
  if (magic !== 0xc2339f3d) return undefined
  const id = String.fromCharCode(...head.slice(0, 6))
  return /^[A-Z0-9]{6}$/.test(id) ? id : undefined
}

/** GameTDB hosts GameCube covers under its Wii art path. */
const COVER_REGIONS: Record<string, string> = { E: 'US', P: 'EN', J: 'JA' }

function coverUrl(gameId: string): string {
  const region = COVER_REGIONS[gameId[3]] ?? 'US'
  return `https://art.gametdb.com/wii/cover/${region}/${gameId}.png`
}

function titleFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '')
  return stem.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim() || fileName
}

function formatSize(bytes: number): string {
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(2)} GB`
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

/** Stable hue per title so each game card gets its own tile color. */
function hueFor(title: string): number {
  let hash = 0
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(hash) % 360
}

/** Optional title/gameId to stamp on an import, from the title-search picker. */
interface ImportOverride {
  title?: string
  gameId?: string
}

type ImportState =
  | { phase: 'idle' }
  | { phase: 'downloading'; label: string; received: number; total: number | null }
  | { phase: 'saving'; label: string }
  | { phase: 'error'; message: string }

type ScanState =
  | { phase: 'idle' }
  | { phase: 'scanning' }
  | { phase: 'found'; handles: FileSystemFileHandle[] }
  | { phase: 'error'; message: string }

// A legally-redistributable homebrew demo, bundled same-origin so it loads with
// no upload and no CORS setup — one click to prove the emulator works, and the
// reference target for the "Add from URL" flow (swap this URL for your own
// hosted ISO). It's Swiss (open-source GPL GameCube homebrew); see
// frontend/public/demo/NOTICE.md. Not a game — CubeDeck ships no game data.
const DEMO_GAME = {
  url: `${import.meta.env.BASE_URL}demo/swiss_r2073.dol`,
  fileName: 'swiss_r2073.dol',
  title: 'Swiss (homebrew demo)',
}

function GameCard({ game, onDelete }: { game: GameMeta; onDelete: (game: GameMeta) => void }) {
  return (
    <article className="card">
      <div className="card-art" style={{ ['--tile-hue' as string]: hueFor(game.title) }}>
        {game.title.slice(0, 2).toUpperCase()}
        {game.gameId && (
          <img className="cover" src={coverUrl(game.gameId)} alt="" loading="lazy" onError={(e) => e.currentTarget.remove()} />
        )}
      </div>
      <div className="card-body">
        <h2>{game.title}</h2>
        <p className="meta mono">
          {formatSize(game.size)} · {game.fileName}
        </p>
      </div>
      <div className="card-actions">
        <a className="a-button" href={`#play/${game.id}`} aria-label={`Play ${game.title}`}>
          A
        </a>
        <button className="ghost" onClick={() => onDelete(game)}>
          Remove
        </button>
      </div>
    </article>
  )
}

export default function Library() {
  const [games, setGames] = useState<GameMeta[] | null>(null)
  const [importState, setImportState] = useState<ImportState>({ phase: 'idle' })
  const [scanState, setScanState] = useState<ScanState>({ phase: 'idle' })
  const [url, setUrl] = useState('')
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<KnownGame | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [dspIromSize, setDspIromSize] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const dspInput = useRef<HTMLInputElement>(null)
  const importerRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    setGames(await listGames())
  }, [])

  const saveGame = useCallback(
    async (blob: Blob, fileName: string, override?: ImportOverride) => {
      setImportState({ phase: 'saving', label: override?.title ?? fileName })
      try {
        const meta: GameMeta = {
          id: crypto.randomUUID(),
          title: override?.title ?? titleFromFileName(fileName),
          fileName,
          size: blob.size,
          addedAt: Date.now(),
          // Trust the header when we can read it; otherwise fall back to the
          // ID from the title-search pick (which also covers zip/RVZ).
          gameId: (await readDiscId(blob, fileName)) ?? override?.gameId,
        }
        await addGame(meta, blob)
        setImportState({ phase: 'idle' })
        setPending(null)
        await refresh()
      } catch (err) {
        setImportState({
          phase: 'error',
          message: `Couldn't save ${fileName}: ${String(err)}. If storage is full, RVZ images are much smaller than ISO.`,
        })
      }
    },
    [refresh],
  )

  // Selecting a game (from search or the suggested strip) arms a bring-your-
  // own-ISO import and scrolls the import box into view. These are placeholders
  // only — no ROM is fetched; the user still attaches their own disc.
  const selectGame = useCallback((game: KnownGame) => {
    setPending(game)
    setQuery('')
    importerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  useEffect(() => {
    void refresh()
    void getSetting<Blob>('dspIrom').then((blob) => setDspIromSize(blob ? blob.size : null))
  }, [refresh])

  const onDspIrom = useCallback(async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    await setSetting('dspIrom', file)
    setDspIromSize(file.size)
  }, [])

  const onDspIromRemove = useCallback(async () => {
    await deleteSetting('dspIrom')
    setDspIromSize(null)
  }, [])

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return
      const file = files[0]
      if (!ACCEPTED.some((ext) => file.name.toLowerCase().endsWith(ext))) {
        setImportState({ phase: 'error', message: `${file.name} isn't a GameCube image (${ACCEPTED.join(', ')}).` })
        return
      }
      await saveGame(file, file.name, pending ? { title: pending.title, gameId: pending.id } : undefined)
    },
    [saveGame, pending],
  )

  // Streams a URL to IndexedDB with progress. Shared by the URL box and the
  // "Try the demo" button. Returns whether the import succeeded.
  const fetchAndSave = useCallback(
    async (link: string, override?: ImportOverride & { fileName?: string }): Promise<boolean> => {
      const fileName = override?.fileName ?? decodeURIComponent(link.split('/').pop()?.split('?')[0] || 'game.iso')
      const label = override?.title ?? fileName
      setImportState({ phase: 'downloading', label, received: 0, total: null })
      try {
        const res = await fetch(link)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const total = Number(res.headers.get('content-length')) || null
        const reader = res.body?.getReader()
        if (!reader) throw new Error('response has no body')
        const chunks: BlobPart[] = []
        let received = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          received += value.byteLength
          setImportState({ phase: 'downloading', label, received, total })
        }
        await saveGame(new Blob(chunks), fileName, { title: override?.title, gameId: override?.gameId })
        return true
      } catch (err) {
        setImportState({
          phase: 'error',
          message:
            `Download failed: ${String(err)}. The host must allow cross-origin requests (CORS) — ` +
            'if it does not, download the file yourself and use "Add from file" instead.',
        })
        return false
      }
    },
    [saveGame],
  )

  const onDownload = useCallback(async () => {
    const link = url.trim()
    if (!link) return
    const override = pending ? { title: pending.title, gameId: pending.id } : undefined
    if (await fetchAndSave(link, override)) setUrl('')
  }, [url, fetchAndSave, pending])

  // Boots the bundled homebrew demo. If it's already in the library (from a
  // previous try), just play it instead of re-downloading.
  const loadDemo = useCallback(async () => {
    const existing = games?.find((g) => g.title === DEMO_GAME.title)
    if (existing) {
      window.location.hash = `#play/${existing.id}`
      return
    }
    await fetchAndSave(DEMO_GAME.url, { fileName: DEMO_GAME.fileName, title: DEMO_GAME.title })
  }, [games, fetchAndSave])

  const scanFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) return
    setScanState({ phase: 'scanning' })
    try {
      const dir = await window.showDirectoryPicker()
      const handles: FileSystemFileHandle[] = []
      for await (const handle of walkFiles(dir)) {
        if (SCAN_EXTS.some((ext) => handle.name.toLowerCase().endsWith(ext))) handles.push(handle)
      }
      handles.sort((a, b) => a.name.localeCompare(b.name))
      setScanState({ phase: 'found', handles })
    } catch (err) {
      // The user dismissing the folder picker isn't an error.
      if (err instanceof DOMException && err.name === 'AbortError') {
        setScanState({ phase: 'idle' })
        return
      }
      setScanState({ phase: 'error', message: `Couldn't read that folder: ${String(err)}` })
    }
  }, [])

  const importHandle = useCallback(
    async (handle: FileSystemFileHandle) => {
      const file = await handle.getFile()
      await saveGame(file, file.name)
    },
    [saveGame],
  )

  const onDelete = useCallback(
    async (game: GameMeta) => {
      if (!window.confirm(`Remove ${game.title} from your library?`)) return
      await deleteGame(game.id)
      await refresh()
    },
    [refresh],
  )

  const busy = importState.phase === 'downloading' || importState.phase === 'saving'
  const results = searchKnownGames(query)
  // Local-only "recently played": games launched in THIS browser, newest first.
  // A cross-user version (recent across everyone) would need a shared backend.
  const recent = (games ?? [])
    .filter((g) => g.lastPlayedAt)
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
    .slice(0, 6)

  return (
    <div
      className="library"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        void onFiles(e.dataTransfer.files)
      }}
    >
      <header className="masthead">
        <span className="cube-mark" aria-hidden="true" />
        <h1>CubeDeck</h1>
        <p className="tagline">GameCube in your browser. Bring your own disc.</p>
      </header>

      {games !== null && games.length === 0 && (
        <section className="seed-card" aria-label="Get started">
          <div className="seed-art" style={{ ['--tile-hue' as string]: 12 }}>
            P2
          </div>
          <div className="seed-copy">
            <h2>Start with Pikmin 2</h2>
            <p>
              Drop your Pikmin 2 disc image anywhere on this page, or add it below. ISO, zipped ISO, and homebrew DOL
              files work. CubeDeck never ships game data — you bring your own legally-made backup.
            </p>
            <p>
              <button className="primary" disabled={busy} onClick={() => void loadDemo()}>
                ▶ Try the demo — no upload
              </button>
            </p>
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="grid" aria-label="Recently played">
          <h2 className="row-heading">Recently played</h2>
          <div className="cards">
            {recent.map((game) => (
              <GameCard key={game.id} game={game} onDelete={onDelete} />
            ))}
          </div>
        </section>
      )}

      {games !== null && games.length > 0 && (
        <section className="grid" aria-label="Your games">
          {recent.length > 0 && <h2 className="row-heading">All games</h2>}
          <div className="cards">
            {games.map((game) => (
              <GameCard key={game.id} game={game} onDelete={onDelete} />
            ))}
          </div>
        </section>
      )}

      <section ref={importerRef} className={`importer ${dragOver ? 'drag-over' : ''}`} aria-label="Add a game">
        <h2>Add a game</h2>

        <div className="demo-row">
          <button className="primary" disabled={busy} onClick={() => void loadDemo()}>
            ▶ Try the demo
          </button>
          <span className="fine-print" style={{ margin: 0 }}>
            Boots Swiss (open-source homebrew) straight from this site — no upload, no account. It's also the reference
            for the URL box: host your own game the same way and paste its link.
          </span>
        </div>

        <div className="search-box">
          <input
            className="url-input"
            type="search"
            placeholder="Search by title (e.g. Pikmin, Melee)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.length > 0 && (
            <ul className="search-results">
              {results.map((game) => (
                <li key={game.id}>
                  <button onClick={() => selectGame(game)}>
                    <img className="result-cover" src={coverUrl(game.id)} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                    <span>{game.title}</span>
                    <span className="mono result-id">{game.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {pending && (
          <p className="pending-note">
            Adding <strong>{pending.title}</strong> — attach your own disc image below.{' '}
            <button className="link-btn" onClick={() => setPending(null)}>
              cancel
            </button>
          </p>
        )}

        <div className="import-row">
          <button className="primary" disabled={busy} onClick={() => fileInput.current?.click()}>
            Add from file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED.join(',')}
            hidden
            onChange={(e) => {
              void onFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <span className="or">or</span>
          <input
            className="url-input mono"
            type="url"
            placeholder="https://your-host.example/your-game.iso"
            value={url}
            disabled={busy}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onDownload()
            }}
          />
          <button className="primary" disabled={busy || !url.trim()} onClick={() => void onDownload()}>
            Download
          </button>
        </div>

        {importState.phase === 'downloading' && (
          <p className="status" role="status">
            Downloading {importState.label}… {formatSize(importState.received)}
            {importState.total ? ` of ${formatSize(importState.total)}` : ''}
          </p>
        )}
        {importState.phase === 'saving' && (
          <p className="status" role="status">
            Saving {importState.label} to your library…
          </p>
        )}
        {importState.phase === 'error' && (
          <p className="status error" role="alert">
            {importState.message}
          </p>
        )}
        <p className="fine-print">
          Games are stored in this browser only (IndexedDB). The URL box works with any host that allows cross-origin
          requests (CORS) — point it at your own hosting for games you make or open-source. Keyboard, touch, and
          controllers are all supported in the player.
        </p>
      </section>

      <section className="importer" aria-label="Suggested games">
        <h2>Suggested games</h2>
        <p className="fine-print" style={{ margin: '0 0 1rem' }}>
          Popular GameCube titles — placeholders only. Pick one to pre-fill its name and box art, then attach your own
          disc image. CubeDeck never downloads game data.
        </p>
        <ul className="suggested-strip">
          {KNOWN_GAMES.map((game) => (
            <li key={game.id}>
              <button className="suggested-card" onClick={() => selectGame(game)} title={`Add ${game.title}`}>
                <span className="suggested-art">
                  <img src={coverUrl(game.id)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                </span>
                <span className="suggested-title">{game.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {CAN_SCAN_FOLDER && (
        <section className="importer" aria-label="Scan a folder">
          <h2>Scan a folder</h2>
          <div className="import-row">
            <button className="primary" disabled={scanState.phase === 'scanning'} onClick={() => void scanFolder()}>
              {scanState.phase === 'scanning' ? 'Scanning…' : 'Choose folder'}
            </button>
            {scanState.phase === 'found' && (
              <span className="status">
                {scanState.handles.length
                  ? `Found ${scanState.handles.length} game${scanState.handles.length === 1 ? '' : 's'}.`
                  : 'No GameCube images found in that folder.'}
              </span>
            )}
            {scanState.phase === 'error' && (
              <span className="status error" role="alert">
                {scanState.message}
              </span>
            )}
          </div>

          {scanState.phase === 'found' && scanState.handles.length > 0 && (
            <ul className="scan-list">
              {scanState.handles.map((handle) => (
                <li key={handle.name}>
                  <span className="mono">{handle.name}</span>
                  <button className="ghost" disabled={busy} onClick={() => void importHandle(handle)}>
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="fine-print">
            Reads a local folder (and subfolders) for {SCAN_EXTS.join(', ')} images and copies the ones you pick into
            this browser. Nothing leaves your machine. Available in Chromium browsers (Chrome, Edge, the Tesla browser).
          </p>
        </section>
      )}

      <section className="importer settings" aria-label="Player settings">
        <h2>Player settings</h2>
        <div className="import-row">
          <button className="primary" onClick={() => dspInput.current?.click()}>
            {dspIromSize === null ? 'Add DSP IROM' : 'Replace DSP IROM'}
          </button>
          <input
            ref={dspInput}
            type="file"
            accept=".bin,.rom,.irom"
            hidden
            onChange={(e) => {
              void onDspIrom(e.target.files)
              e.target.value = ''
            }}
          />
          <span className="status">
            {dspIromSize === null ? 'No DSP IROM uploaded.' : `DSP IROM stored (${formatSize(dspIromSize)}).`}
          </span>
          {dspIromSize !== null && (
            <button className="ghost" onClick={() => void onDspIromRemove()}>
              Remove
            </button>
          )}
        </div>
        <p className="fine-print">
          Optional: a GameCube DSP IROM dump (<span className="mono">dsp_rom.bin</span>) improves compatibility with
          games that use the real DSP microcode. The web build has no audio output either way.
        </p>
      </section>
    </div>
  )
}
