# CubeDeck TODO

Ordered by impact.

## Blockers for "actually play Pikmin 2"

- [ ] **Verify rendering on a real browser with working WebGPU.** Every automated Chrome instance on the dev machine (headful with `--enable-unsafe-webgpu --enable-features=Vulkan`, and headless) turned out to have broken WebGPU *presentation*: even a minimal JS clear-to-red presents 0,0,0,0. The upstream gecko demo (gecko.layle.dev) renders black in the same environment, so this is a local-Chrome/driver problem, not a CubeDeck bug — but it means emulator video output is **unverified**. Test on: desktop Chrome with `chrome://flags/#enable-unsafe-webgpu` + Vulkan enabled, a Mac/Windows Chrome (WebGPU on by default), or iPad Safari 26+.
- [ ] **Boot a real ISO end-to-end.** The ISO code path (`load_dvd` → `with_ipl_hle`) is compiled in and mirrors gecko's native `--dvd` flow, but was only exercised with a homebrew DOL (Swiss r2073, now bundled as the in-app demo at `public/demo/`). The demo import/boot path is browser-verified up to the WebGPU gate; actual rendering + a real Pikmin 2 ISO still need the real-hardware pass.
- [ ] **Verify touch/gamepad input on real hardware.** Input now goes through a `set_pad_state(sticks, triggers, buttons)` export in the Rust patch (no more synthetic `KeyboardEvent`s, so the winit trusted-event concern is gone), but like video it has never been observed working locally.

## Controls

- [x] **C-stick (yellow) support.** T/F/G/H keys in `update_pad`, yellow touch stick above the face cluster, gamepad right stick — all analog via `set_pad_state`.
- [x] Analog main stick (touch stick and gamepad left stick send real analog values).
- [x] L/R analog triggers for gamepads (button click at ≥85% pull). Touch L/R buttons remain full-press — they're buttons.

## Emulator

- [x] RVZ in the browser: the patch enables `image`'s `rvz` feature for the web crate; zstd's C sources cross-compile to wasm via clang (now a build.sh requirement). Runtime decompression untested until the real-hardware pass.
- [x] DSP IROM upload UI ("Player settings" card in the library). No audio output exists in the web build regardless (upstream limitation).
- [x] Memory card persistence. The patch gives the web build a 2 MB slot-A card backed by an in-memory store (`wasm_backing` in gecko's `exi/device.rs` — the browser has no filesystem for the native path-based flow); JS seeds it at boot and polls `memcard_version()`/`get_memcard()` (2s interval + tab-hide flush) to persist per-game card images to IndexedDB (`memcard:<gameId>` in the settings store, dropped with the game on delete). Like all emulator behavior: browser-verified only up to the WebGPU gate on this machine; needs the real-hardware pass.
- [ ] Save states (full emulator snapshots) — upstream has no serialization support; would be a large upstream-sized project, not a patch.
- [ ] Track upstream gecko releases; rebuild with `emulator/build.sh` (bump `GECKO_COMMIT`). Last checked 2026-07-07: upstream master is still exactly our pinned commit `39e8220` — nothing to pull.

## App

- [x] Cover art for library cards (GameTDB by disc game ID, read from plain ISO/GCM headers at import; zip/RVZ imports keep the hue tile).
- [x] Show download progress for the wasm on first player load.
- [x] Friendly performance chip replaces upstream's egui FPS overlay: the patch exports smoothed `[fps, %-of-native]` via `get_perf()` (and drops the egui `perf_hud` window); `Player.tsx` shows a color-coded "Full speed" / "X% speed" chip top-right, with exact FPS in the hover tooltip.
- [x] Emulator crashes now surface the in-app error screen: React ErrorBoundary for render errors + window error/unhandledrejection listeners while running (wasm panics happen outside React).
- [x] Title search on import (curated index in `frontend/src/lib/games.ts` → pre-fills title + game ID; user still supplies their own ISO). Metadata only, no ROM fetch.
- [x] Folder scan via the File System Access API (`frontend/src/components/Library.tsx`): pick a local folder, recursively find `.iso/.gcm/.rvz/.ciso/.gcz/.zip`, import the ones you choose. Chromium-only (Chrome/Edge/Tesla), feature-detected.
- [x] "Recently played" row — **per-browser only** (games launched in this browser sort to the top, driven by `lastPlayedAt`). A cross-user "recent across everyone" row was requested but deferred: it needs a shared backend, and this repo is a deliberately backend-less static site.
- [ ] Cross-user "recently played across everyone" row. Needs a small shared backend (e.g. a tiny Railway service exposing GET/POST recent-plays, keyed by anonymized game ID). Deferred 2026-07-06 — decision was local-only for now. Deferred again 2026-07-06 per yerry.
- [x] Extend the title-search index in `frontend/src/lib/games.ts` (expanded from ~22 to 30+ curated GameCube IDs). Plain data; can be extended further as needed.
- [x] ~~External ISO/ROM search from vimm.net and romsfun.com~~ **Removed 2026-07-07.** It violated this repo's legal boundary (CLAUDE.md: CubeDeck never fetches game data; every import path requires the user's own disc image) — and never worked anyway (Vimm downloads are session-gated POSTs without CORS, and their images are 7z NKit the emulator can't read). Do not re-add ROM-site integrations; the title-search stays metadata-only.
- [x] Code comments throughout (`db.ts`, `emulator.ts`, `Library.tsx`, `games.ts`, `input.ts`). Explains architecture, IndexedDB patterns, input handling.

## Notes from testing (2026-07-06)

- Chrome launched by chrome-devtools-mcp has **no WebGPU adapter at all** (no Vulkan flag). A manually-launched Chrome with `--enable-unsafe-webgpu --enable-features=Vulkan` gets an NVIDIA adapter and `requestDevice` works, but presentation is still broken on this machine (KDE/Wayland?).
- winit's first surface configure races the ResizeObserver → 1×1 canvas; worked around with CSS-size nudges in `frontend/src/lib/emulator.ts` (`scheduleCanvasResizeNudges`).
- Vimm's Lair page URLs can't be pasted into "Download" — downloads are session-gated POSTs without CORS, and their GameCube images are 7z-packed NKit files the emulator can't read. Standard `.iso` (or zipped `.iso`) from your own rip is the supported format.
