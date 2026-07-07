# gamecube-web — Design

**Date:** 2026-07-06
**Status:** Approved-by-mandate (yerry asked for the whole thing to be built autonomously; design decisions were made from research rather than Q&A)

## Goal

A webapp that plays GameCube games entirely in the browser — no install — on any modern browser (desktop, iPad, Tesla screen). Pikmin 2 is the flagship entry; any game the user supplies an ISO/RVZ link or file for can be added. Modeled on the "Diablo as a webapp" pattern (diabloweb/DevilutionX): ship the engine as WASM, user supplies the game data.

## Key research findings (these drove the architecture)

1. **EmulatorJS / libretro Dolphin is a dead end.** EmulatorJS explicitly lists Dolphin under "unavailable cores": ~1 frame per 5 seconds even on an RTX 5090, because the libretro core runs the PowerPC interpreter with no browser JIT.
2. **[ioncodes/gecko](https://github.com/ioncodes/gecko)** is a GameCube/Wii emulator in Rust (GPL-3.0, actively developed, runs many commercial games) with a first-class `crates/web` WASM build (wasm-bindgen + wgpu/WebGPU). This is the only real "GameCube in a browser tab" option today.
3. Gecko's web crate as shipped only boots **DOL/IPL** files, but the core crate already supports full discs: `image::load_dvd(Vec<u8>)` (ISO **and** RVZ) → `GameCube::with_ipl_hle(dvd)`. Teaching the web build to boot ISOs is a small patch.
4. The web build is **interpreter-only** (the JIT is cranelift, native-only) and **requires WebGPU**. Full-speed commercial games in the browser are not guaranteed — the app surfaces a live FPS/% HUD and treats performance as a known limitation, not a blocker.

## Architecture

Static site, no backend. Three pieces:

```
gamecube-web/
├── emulator/                  # reproducible WASM build of the emulator
│   ├── build.sh               # clones ioncodes/gecko, applies patch, wasm-pack build
│   └── gecko-web-disc.patch   # adds ISO/RVZ boot (load_dvd + with_ipl_hle) to crates/web
├── frontend/                  # Vite + React + TS (from repo-template)
│   └── src/
│       ├── vendor/gecko/      # committed wasm-pack output (pkg/): .wasm + JS glue
│       ├── lib/               # IndexedDB game store, emulator loader, input mapping
│       ├── components/        # Library, Player, TouchControls, RequirementsGate
│       └── App.tsx            # hash-view switch: library ⇄ player
└── docs/superpowers/specs/    # this document
```

### Emulator artifact (`emulator/`, `frontend/src/vendor/gecko/`)

- `build.sh` clones a pinned commit of gecko, applies `gecko-web-disc.patch`, runs `wasm-pack build crates/web --target web --release`, and copies `pkg/` into `frontend/src/vendor/gecko/`.
- The built artifact is **committed** so CI/Pages needs only Node, not a Rust toolchain.
- Patch scope (kept minimal): in `start_emulator`, when the file is not `.dol/.bin/.ipl`, boot via `image::load_dvd` + `GameCube::with_ipl_hle` (mirrors gecko's own `tinyapp` disc path). Everything else (rendering, input, egui perf HUD) is upstream code.
- GPL-3.0 compliance: this repo is licensed GPL-3.0, carries gecko's license, links the exact upstream commit, and ships the full patch — complete corresponding source.

### Game library (Library view + IndexedDB)

- Games persist in IndexedDB (`games` store: id, title, fileName, size, addedAt; ROM bytes as Blob). Blobs survive reloads; GameCube images are 100 MB–1.4 GB, so RVZ is recommended and localStorage is not an option.
- Add a game two ways:
  - **File picker / drag-drop** (.iso, .rvz, .gcm, .dol, .bin) — primary path on iPad/desktop.
  - **URL fetch** — paste a direct link; downloaded with progress bar (needs CORS-permissive host; error message explains when it isn't).
- **Pikmin 2 is pre-seeded** as a placeholder card ("drop your Pikmin 2 ISO/RVZ here") so the app opens with its purpose visible. Any other game added becomes a normal card.
- Optional one-time upload of a DSP IROM (`dsp_rom.bin`) in settings, stored alongside games and passed to the emulator for LLE audio (gecko treats it as optional).

### Player view

- Loads the wasm module lazily (dynamic import so the library screen stays instant), reads the ROM blob, calls `start_emulator(bytes, fileName, dspIrom?)`.
- Gecko/winit appends its own canvas to `<body>` and never returns; **Exit = full page reload** back to the library (v1 tradeoff, documented).
- **RequirementsGate** before boot: checks `navigator.gpu` (WebGPU) and available memory, and shows actionable guidance when missing (e.g. Tesla browsers without WebGPU, Safari < 26).

### Input

Upstream gecko only listens to physical keyboard events, so all input funnels through **synthetic `KeyboardEvent`s** dispatched at the emulator canvas — zero Rust changes needed:

- **Keyboard** (desktop): native, upstream mapping (arrows = stick, X/Z/C/V = A/B/X/Y, Enter = Start, A/S = L/R, D = Z, IJKL = D-pad).
- **Touch** (iPad/Tesla): translucent overlay gamepad — left virtual stick (8-way quantized to arrow keys), A/B/X/Y cluster, Start, L/R/Z. Multi-touch, pointer-events based.
- **Gamepad API** (controllers on any device): poll loop maps standard-layout pads to the same synthetic key events.

Analog nuance: quantizing the stick to 8 directions is a real limitation for Pikmin 2's cursor; acceptable for v1, and fixing it properly means patching gecko's web crate to expose a `set_pad_state(x, y, buttons)` export (listed as future work).

## Alternatives considered

- **EmulatorJS Dolphin core** — rejected: does not exist / unusably slow (see findings).
- **Server-side Dolphin + WebRTC streaming** — playable performance but requires a always-on GPU host, port-forwarding, and is a different product (game streaming, not a webapp). Deliberately out of scope; noted in README as the fallback if in-browser perf disappoints.
- **Pikmin 2 decomp native port** — the decomp (`projectPiki/pikmin2`, cloned locally) is complete but not portable/shiftable to non-GC targets yet; no PC/WASM port exists to build on.

## Error handling

- WebGPU missing → gate screen with browser-specific instructions instead of a crash.
- ROM fetch CORS/network failure → inline error with explanation and file-picker fallback.
- IndexedDB quota exceeded → surfaced with "use RVZ" hint.
- Emulator panic → console (panic hook) + overlay message with reload button.

## Testing

- Type-check + ESLint (CI) on every PR; production build in CI.
- Manual boot test in Chrome via DevTools MCP with a homebrew DOL (no copyrighted images in the repo or in tests).
- Touch overlay verified by dispatching pointer events and asserting synthetic key events reach the canvas.

## Known limitations (v1)

- Interpreter-only WASM core: commercial-game speed varies by device; perf HUD shows it honestly.
- WebGPU required (Chrome/Edge 113+, Safari 26+/iPadOS 26+; Tesla browser support unverified).
- No save states / memory-card persistence in the web build yet (upstream limitation).
- 8-way digital stick via touch; analog needs an upstream-facing patch (future work).
- Exit-to-library is a page reload.
