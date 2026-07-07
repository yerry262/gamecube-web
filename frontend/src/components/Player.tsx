import { useEffect, useState } from 'react'
import { getGame, getRom, getSetting, type GameMeta } from '../lib/db.ts'
import { bootEmulator, checkWebGpu } from '../lib/emulator.ts'
import { focusEmulator, startGamepadLoop, stopGamepadLoop } from '../lib/input.ts'
import TouchControls from './TouchControls.tsx'

type Phase =
  | { name: 'loading'; detail: string }
  | { name: 'blocked'; reason: string }
  | { name: 'running' }
  | { name: 'error'; message: string }

// Module-level: the emulator can only ever boot once per page load (winit
// owns the page after that), and StrictMode double-runs effects in dev.
let bootStarted = false

export default function Player({ gameId }: { gameId: string }) {
  const [phase, setPhase] = useState<Phase>({ name: 'loading', detail: 'Checking this browser…' })
  const [game, setGame] = useState<GameMeta | null>(null)

  useEffect(() => {
    if (bootStarted) return
    bootStarted = true

    void (async () => {
      try {
        const gpu = await checkWebGpu()
        if (!gpu.ok) {
          setPhase({ name: 'blocked', reason: gpu.reason ?? 'WebGPU unavailable.' })
          return
        }

        const meta = await getGame(gameId)
        if (!meta) {
          setPhase({ name: 'error', message: 'This game is no longer in your library.' })
          return
        }
        setGame(meta)

        setPhase({ name: 'loading', detail: `Reading ${meta.fileName}…` })
        const rom = await getRom(gameId)
        if (!rom) {
          setPhase({ name: 'error', message: 'The disc image for this game is missing from storage.' })
          return
        }
        const bytes = new Uint8Array(await rom.arrayBuffer())

        const dsp = await getSetting<Blob>('dspIrom')
        const dspBytes = dsp ? new Uint8Array(await dsp.arrayBuffer()) : undefined

        setPhase({ name: 'loading', detail: 'Starting the GameCube…' })
        // Give React a frame to paint the loader before the wasm module
        // blocks the main thread during boot.
        await new Promise((resolve) => setTimeout(resolve, 50))
        await bootEmulator(bytes, meta.fileName, dspBytes)

        setPhase({ name: 'running' })
        startGamepadLoop()
        focusEmulator()
      } catch (err) {
        console.error(err)
        setPhase({
          name: 'error',
          message: `The emulator failed to start: ${String(err)}. The browser console has details.`,
        })
      }
    })()

    return () => {
      stopGamepadLoop()
    }
  }, [gameId])

  const exit = () => {
    // Hash change to library triggers a reload in App; set it explicitly so
    // the emulator (which never returns) is torn down with the page.
    window.location.hash = ''
    window.location.reload()
  }

  if (phase.name === 'blocked' || phase.name === 'error') {
    return (
      <div className="player-screen">
        <div className="notice">
          <h2>{phase.name === 'blocked' ? "This browser can't run the emulator" : 'Something went wrong'}</h2>
          <p>{phase.name === 'blocked' ? phase.reason : phase.message}</p>
          <button className="primary" onClick={exit}>
            Back to library
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`player-screen ${phase.name === 'running' ? 'running' : ''}`}>
      {phase.name === 'loading' && (
        <div className="boot" role="status">
          <span className="boot-cube" aria-hidden="true" />
          <p>{phase.detail}</p>
          {game && <p className="fine-print">{game.title}</p>}
        </div>
      )}
      {phase.name === 'running' && (
        <>
          <button className="exit-chip" onClick={exit}>
            ✕ Exit
          </button>
          <TouchControls />
        </>
      )}
    </div>
  )
}
