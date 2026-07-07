# CubeDeck (gamecube-web)

Play GameCube games in your browser — no install. Add your own disc image (Pikmin 2 is the flagship), press the big green A, and play with keyboard, touch, or a controller.

Emulation is [gecko](https://github.com/ioncodes/gecko) (a GameCube/Wii emulator in Rust) compiled to WebAssembly and patched to boot full disc images. The frontend is a static site: your games never leave the browser (IndexedDB).

## Tech Stack

- Frontend: React + TypeScript + Vite
- Emulator: gecko (Rust → wasm via wasm-pack 0.15, vendored in `frontend/src/vendor/gecko`)
- Deployment: GitHub Pages

## Live

https://yerry262.github.io/gamecube-web

## Requirements

- A browser with **WebGPU**: Chrome/Edge 113+ (on Linux enable `chrome://flags/#enable-unsafe-webgpu` + Vulkan), Safari 26+ / iPadOS 26+.
- Your own legally-made game backup: `.iso`, zipped `.iso`, or homebrew `.dol`. Nothing is bundled and site page URLs (e.g. ROM vaults) can't be pasted — only direct CORS-enabled file links or local files.
- Patience: the wasm build is interpreter-only (no JIT in browsers), so commercial games run well below full speed on most hardware. The FPS/% HUD in the top-right tells the truth.

## Getting Started

```bash
cd frontend
npm install
npm run dev
```

## Rebuilding the emulator

The wasm artifact is committed so plain `npm run build` works everywhere. To rebuild it from source (needs rustup + wasm-pack ≥ 0.15):

```bash
emulator/build.sh
```

This clones gecko at the pinned commit, applies `emulator/gecko-web-disc.patch` (ISO/RVZ boot support for the web crate), and refreshes `frontend/src/vendor/gecko/`.

## Controls

| GameCube | Keyboard |
|----------|----------|
| Main stick | Arrow keys |
| C-stick | T / F / G / H |
| A / B / X / Y | X / Z / C / V |
| Start | Enter |
| L / R / Z | A / S / D |
| D-pad | I J K L |

Touch: on-screen GameCube-style overlay (auto-shows on touch devices, 🎮 toggles) with analog main stick (purple) and C-stick (yellow). Controllers: any standard-layout gamepad — left stick, right stick (C-stick), and analog triggers all map through.

## Known Limitations

See [docs/TODO.md](docs/TODO.md) for the full list — highlights:

- Rendering verified only up to the WebGPU surface on the dev machine (its Chrome cannot present WebGPU at all); needs a real-hardware test pass.
- No audio in the web build (upstream limitation).
- Exiting a game reloads the page (the emulator owns the page once started).

## License

GPL-3.0 (the vendored emulator is a patched build of gecko, GPL-3.0; complete corresponding source = upstream at the pinned commit + `emulator/gecko-web-disc.patch`).
