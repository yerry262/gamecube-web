import { useCallback, useEffect, useRef, useState } from 'react'
import { addGame, deleteGame, deleteSetting, getSetting, listGames, setSetting, type GameMeta } from '../lib/db.ts'

const ACCEPTED = ['.iso', '.gcm', '.rvz', '.zip', '.dol', '.bin']

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

type ImportState =
  | { phase: 'idle' }
  | { phase: 'downloading'; label: string; received: number; total: number | null }
  | { phase: 'saving'; label: string }
  | { phase: 'error'; message: string }

export default function Library() {
  const [games, setGames] = useState<GameMeta[] | null>(null)
  const [importState, setImportState] = useState<ImportState>({ phase: 'idle' })
  const [url, setUrl] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [dspIromSize, setDspIromSize] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const dspInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setGames(await listGames())
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

  const saveGame = useCallback(
    async (blob: Blob, fileName: string) => {
      setImportState({ phase: 'saving', label: fileName })
      try {
        const meta: GameMeta = {
          id: crypto.randomUUID(),
          title: titleFromFileName(fileName),
          fileName,
          size: blob.size,
          addedAt: Date.now(),
          gameId: await readDiscId(blob, fileName),
        }
        await addGame(meta, blob)
        setImportState({ phase: 'idle' })
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

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return
      const file = files[0]
      if (!ACCEPTED.some((ext) => file.name.toLowerCase().endsWith(ext))) {
        setImportState({ phase: 'error', message: `${file.name} isn't a GameCube image (${ACCEPTED.join(', ')}).` })
        return
      }
      await saveGame(file, file.name)
    },
    [saveGame],
  )

  const onDownload = useCallback(async () => {
    const link = url.trim()
    if (!link) return
    const fileName = decodeURIComponent(link.split('/').pop()?.split('?')[0] || 'game.iso')
    setImportState({ phase: 'downloading', label: fileName, received: 0, total: null })
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
        setImportState({ phase: 'downloading', label: fileName, received, total })
      }
      setUrl('')
      await saveGame(new Blob(chunks), fileName)
    } catch (err) {
      setImportState({
        phase: 'error',
        message:
          `Download failed: ${String(err)}. The host must allow cross-origin requests (CORS) — ` +
          'if it does not, download the file yourself and use "Add from file" instead.',
      })
    }
  }, [url, saveGame])

  const onDelete = useCallback(
    async (game: GameMeta) => {
      if (!window.confirm(`Remove ${game.title} from your library?`)) return
      await deleteGame(game.id)
      await refresh()
    },
    [refresh],
  )

  const busy = importState.phase === 'downloading' || importState.phase === 'saving'

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
          </div>
        </section>
      )}

      {games !== null && games.length > 0 && (
        <section className="grid" aria-label="Your games">
          {games.map((game) => (
            <article className="card" key={game.id}>
              <div className="card-art" style={{ ['--tile-hue' as string]: hueFor(game.title) }}>
                {game.title.slice(0, 2).toUpperCase()}
                {game.gameId && (
                  <img
                    className="cover"
                    src={coverUrl(game.gameId)}
                    alt=""
                    loading="lazy"
                    onError={(e) => e.currentTarget.remove()}
                  />
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
                <button className="ghost" onClick={() => void onDelete(game)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className={`importer ${dragOver ? 'drag-over' : ''}`} aria-label="Add a game">
        <h2>Add a game</h2>
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
            placeholder="https://example.com/your-backup.iso"
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
          Games are stored in this browser only (IndexedDB). Direct links need CORS-enabled hosts. Keyboard, touch, and
          controllers are all supported in the player.
        </p>
      </section>

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
