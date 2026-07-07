# CubeDeck (gamecube-web)

## Project Overview

Browser-based GameCube player: users add their own disc images (Pikmin 2 first), stored in IndexedDB, emulated in-browser by a WASM build of the gecko emulator. Static site for yerry + friends — target screens are desktop, iPad, and the Tesla browser.

## Architecture

### Frontend
- Vite + React + TS in `frontend/`; no router — hash views (`#` = library, `#play/<id>` = player) in `App.tsx`.
- `src/lib/db.ts` — IndexedDB (`games` meta store, `roms` blob store, `settings`). ROM blobs are 100 MB–1.4 GB; never load them for listing.
- `src/lib/emulator.ts` — WebGPU capability check + wasm boot wrapper. Contains the canvas resize-nudge workaround (winit races ResizeObserver → 1×1 surface).
- `src/lib/input.ts` — ALL input (touch overlay, Gamepad API) funnels into the `set_pad_state` wasm export added by the Rust patch: full analog pad state (sticks, C-stick, triggers, button bitmask), pushed only on change. `BUTTON_MASKS` mirrors gecko's `flipper::si::pad` constants — change them only together with the Rust patch. Physical keyboards bypass this module entirely (winit's own key handler, `update_pad`).
- `src/vendor/gecko/` — committed wasm-pack output. Never hand-edit; regenerate with `emulator/build.sh`.

### Emulator
- Upstream: ioncodes/gecko (GPL-3.0), pinned by commit in `emulator/build.sh`.
- `emulator/gecko-web-disc.patch` extends `crates/web`: boots ISO/zip/RVZ via `image::load_dvd` + `GameCube::with_ipl_hle` (mirrors upstream tinyapp `--dvd`; RVZ needs the `rvz` cargo feature + clang for zstd), adds C-stick key bindings (T/F/G/H), and exports `set_pad_state` for analog input from JS. Web build is interpreter-only (JIT is cranelift/native) and **requires WebGPU**.
- The emulator appends its own canvas to `<body>` and never returns; "exit game" = page reload by design.

### Backend
- None — static site.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite 6
- **Emulator**: Rust (gecko) → wasm32-unknown-unknown via wasm-pack 0.15
- **Deployment**: GitHub Pages via `.github/workflows/deploy.yml` (push to `main`)

## Deployment Status

- **Live**: https://yerry262.github.io/gamecube-web
- **GitHub**: https://github.com/yerry262/gamecube-web
- **Last Deploy**: pending first merge to main

## Development

```bash
cd frontend && npm install && npm run dev
# lint + types + build (CI runs all three):
npm run lint && npm run type-check && npm run build
```

Testing without copyrighted ISOs: use a homebrew DOL (e.g. Swiss from emukidid/swiss-gc releases). Local Chrome needs `--enable-unsafe-webgpu --enable-features=Vulkan` on Linux for a WebGPU adapter — and note this dev machine still fails to *present* WebGPU frames (even a JS clear-to-red shows nothing), so visual verification must happen on other hardware.

## Known Limitations

- See `docs/TODO.md` (kept current — read it before starting work here).
- Legal: never commit or fetch game ISOs; test with homebrew only.

## Last Updated

2026-07-06
