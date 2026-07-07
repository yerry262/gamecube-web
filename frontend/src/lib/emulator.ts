// Thin wrapper around the vendored gecko WASM package
// (frontend/src/vendor/gecko, built by emulator/build.sh).

export interface WebGpuCheck {
  ok: boolean
  reason?: string
}

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
 * Boots the emulator. Never returns control of the page: gecko/winit appends
 * a canvas to <body> and runs its own event loop until the page is reloaded.
 */
export async function bootEmulator(rom: Uint8Array, fileName: string, dspIrom?: Uint8Array): Promise<void> {
  const gecko = await import('../vendor/gecko/web.js')
  await gecko.default()
  gecko.start_emulator(rom, fileName, dspIrom)
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
