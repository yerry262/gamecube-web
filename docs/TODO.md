# CubeDeck TODO

Ordered by impact.

## Blockers for "actually play Pikmin 2"

- [ ] **Verify rendering on a real browser with working WebGPU.** Every automated Chrome instance on the dev machine (headful with `--enable-unsafe-webgpu --enable-features=Vulkan`, and headless) turned out to have broken WebGPU *presentation*: even a minimal JS clear-to-red presents 0,0,0,0. The upstream gecko demo (gecko.layle.dev) renders black in the same environment, so this is a local-Chrome/driver problem, not a CubeDeck bug — but it means emulator video output is **unverified**. Test on: desktop Chrome with `chrome://flags/#enable-unsafe-webgpu` + Vulkan enabled, a Mac/Windows Chrome (WebGPU on by default), or iPad Safari 26+.
- [ ] **Boot a real ISO end-to-end.** The ISO code path (`load_dvd` → `with_ipl_hle`) is compiled in and mirrors gecko's native `--dvd` flow, but was only exercised with a homebrew DOL (Swiss r2073). Needs a legally-made Pikmin 2 ISO to confirm.
- [ ] **Verify touch/gamepad input on real hardware.** Input now goes through a `set_pad_state(sticks, triggers, buttons)` export in the Rust patch (no more synthetic `KeyboardEvent`s, so the winit trusted-event concern is gone), but like video it has never been observed working locally.

## Controls

- [x] **C-stick (yellow) support.** T/F/G/H keys in `update_pad`, yellow touch stick above the face cluster, gamepad right stick — all analog via `set_pad_state`.
- [x] Analog main stick (touch stick and gamepad left stick send real analog values).
- [x] L/R analog triggers for gamepads (button click at ≥85% pull). Touch L/R buttons remain full-press — they're buttons.

## Emulator

- [x] RVZ in the browser: the patch enables `image`'s `rvz` feature for the web crate; zstd's C sources cross-compile to wasm via clang (now a build.sh requirement). Runtime decompression untested until the real-hardware pass.
- [x] DSP IROM upload UI ("Player settings" card in the library). No audio output exists in the web build regardless (upstream limitation).
- [ ] Save states / memory card persistence (upstream web build has none).
- [ ] Track upstream gecko releases; rebuild with `emulator/build.sh` (bump `GECKO_COMMIT`).

## App

- [x] Cover art for library cards (GameTDB by disc game ID, read from plain ISO/GCM headers at import; zip/RVZ imports keep the hue tile).
- [x] Show download progress for the wasm on first player load.
- [ ] Performance HUD is upstream's egui overlay (top-right); consider a friendlier "this game runs at X%" banner.
- [x] Emulator crashes now surface the in-app error screen: React ErrorBoundary for render errors + window error/unhandledrejection listeners while running (wasm panics happen outside React).
- [x] Title search on import (curated index in `frontend/src/lib/games.ts` → pre-fills title + game ID; user still supplies their own ISO). Metadata only, no ROM fetch.
- [x] Folder scan via the File System Access API (`frontend/src/components/Library.tsx`): pick a local folder, recursively find `.iso/.gcm/.rvz/.ciso/.gcz/.zip`, import the ones you choose. Chromium-only (Chrome/Edge/Tesla), feature-detected.
- [x] "Recently played" row — **per-browser only** (games launched in this browser sort to the top, driven by `lastPlayedAt`). A cross-user "recent across everyone" row was requested but deferred: it needs a shared backend, and this repo is a deliberately backend-less static site.
- [ ] Cross-user "recently played across everyone" row. Needs a small shared backend (e.g. a tiny Railway service exposing GET/POST recent-plays, keyed by anonymized game ID). Deferred 2026-07-06 — decision was local-only for now.
- [ ] Extend the title-search index in `frontend/src/lib/games.ts` (currently ~22 curated GameCube IDs). Plain data; add more `{ id, title }` rows as needed.

## Notes from testing (2026-07-06)

- Chrome launched by chrome-devtools-mcp has **no WebGPU adapter at all** (no Vulkan flag). A manually-launched Chrome with `--enable-unsafe-webgpu --enable-features=Vulkan` gets an NVIDIA adapter and `requestDevice` works, but presentation is still broken on this machine (KDE/Wayland?).
- winit's first surface configure races the ResizeObserver → 1×1 canvas; worked around with CSS-size nudges in `frontend/src/lib/emulator.ts` (`scheduleCanvasResizeNudges`).
- Vimm's Lair page URLs can't be pasted into "Download" — downloads are session-gated POSTs without CORS, and their GameCube images are 7z-packed NKit files the emulator can't read. Standard `.iso` (or zipped `.iso`) from your own rip is the supported format.
