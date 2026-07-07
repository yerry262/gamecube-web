// Thin wrapper around the vendored gecko WASM package
// (frontend/src/vendor/gecko, built by emulator/build.sh).

import { attachPadOutput } from './input.ts'

export interface WebGpuCheck {
  ok: boolean
  reason?: string
}

// Check if the browser supports WebGPU and has a usable GPU adapter.
// The emulator requires WebGPU for rendering; this check happens before boot
// so we can give users a meaningful error message if their browser/GPU can't support it.
export async function checkWebGpu(): Promise<WebGpuCheck> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
  if (!gpu) {
    return {
      ok: false,
      reason:
        'This browser has no WebGPU. Use Chrome/Edge 113+, Safari 26+ (iPadOS 26+), or a recent Chromium browser.',
    }
  }
  try {
    const adapter = await gpu.requestAdapter()
    if (!adapter) return { ok: false, reason: 'WebGPU is present but no GPU adapter is available.' }
  } catch (err) {
    return { ok: false, reason: `WebGPU adapter request failed: ${String(err)}` }
  }
  return { ok: true }
}

/**
 * Fetches the ~10 MB wasm binary with download progress. Returns undefined on
 * any failure so the caller can fall back to wasm-bindgen's own streaming
 * fetch. `fraction` is clamped: content-length is the compressed size while
 * the reader yields decompressed bytes, so the raw ratio can pass 1 early.
 */
async function fetchWasmWithProgress(onProgress: (fraction: number | null) => void): Promise<Uint8Array | undefined> {
  try {
    const res = await fetch(new URL('../vendor/gecko/web_bg.wasm', import.meta.url))
    if (!res.ok || !res.body) return undefined
    const total = Number(res.headers.get('content-length')) || null
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.byteLength
      onProgress(total ? Math.min(1, received / total) : null)
    }
    const bytes = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  } catch {
    return undefined
  }
}

export interface BootOptions {
  dspIrom?: Uint8Array
  /** Saved slot-A memory card image to boot with (2 MB, from a previous run). */
  memcard?: Uint8Array
  onDownloadProgress?: (fraction: number | null) => void
  /** Called with a fresh card snapshot whenever the game writes a save. */
  onMemcardWrite?: (bytes: Uint8Array) => void
}

export interface PerfStats {
  fps: number
  /** Emulation speed as a percentage of the console's native refresh rate. */
  percent: number
}

// The loaded wasm module, kept for post-boot polling (perf + memcard). Only
// ever set once: the emulator can't be restarted without a page reload.
type GeckoModule = typeof import('../vendor/gecko/web.js')
let gecko: GeckoModule | null = null

/**
 * Smoothed emulation performance, or null before the first frames render.
 * Backs the player's "running at X%" banner.
 */
export function readPerf(): PerfStats | null {
  if (!gecko) return null
  const [fps, percent] = gecko.get_perf()
  return fps > 0 ? { fps, percent } : null
}

// How often to check whether the game saved. The version check is a trivial
// wasm call; the 2 MB card copy only happens when it actually changed.
const MEMCARD_POLL_MS = 2000

function startMemcardWatch(onWrite: (bytes: Uint8Array) => void): void {
  if (!gecko) return
  const mod = gecko
  let lastVersion = mod.memcard_version()
  const check = () => {
    const version = mod.memcard_version()
    if (version === lastVersion) return
    lastVersion = version
    const card = mod.get_memcard()
    if (card) onWrite(card)
  }
  setInterval(check, MEMCARD_POLL_MS)
  // Best-effort flush when the tab is backgrounded or closed mid-save-window.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') check()
  })
  window.addEventListener('pagehide', check)
}

/**
 * Boots the emulator. Never returns control of the page: gecko/winit appends
 * a canvas to <body> and runs its own event loop until the page is reloaded.
 */
export async function bootEmulator(rom: Uint8Array, fileName: string, opts: BootOptions = {}): Promise<void> {
  const mod = await import('../vendor/gecko/web.js')
  const wasm = opts.onDownloadProgress ? await fetchWasmWithProgress(opts.onDownloadProgress) : undefined
  await mod.default(wasm ? { module_or_path: wasm } : undefined)
  gecko = mod
  attachPadOutput(mod.set_pad_state)
  mod.start_emulator(rom, fileName, opts.dspIrom, opts.memcard)
  if (opts.onMemcardWrite) startMemcardWatch(opts.onMemcardWrite)
  scheduleCanvasResizeNudges()
}

/**
 * winit sizes its surface from the canvas before the page's CSS-driven
 * ResizeObserver callback lands, and the missed Resized event never
 * re-fires — leaving a 1x1 backing store. Jiggling the canvas's CSS size
 * makes the observer fire again once the emulator is actually listening.
 */
function scheduleCanvasResizeNudges(): void {
  for (const delay of [400, 1200, 3000]) {
    setTimeout(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('body > canvas')
      if (!canvas || (canvas.width > 8 && canvas.height > 8)) return
      canvas.style.width = '99.9vw'
      requestAnimationFrame(() => {
        canvas.style.width = '100vw'
      })
    }, delay)
  }
}
