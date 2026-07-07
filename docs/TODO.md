# CubeDeck TODO

Ordered by impact.

## Blockers for "actually play Pikmin 2"

- [ ] **Verify rendering on a real browser with working WebGPU.** Every automated Chrome instance on the dev machine (headful with `--enable-unsafe-webgpu --enable-features=Vulkan`, and headless) turned out to have broken WebGPU *presentation*: even a minimal JS clear-to-red presents 0,0,0,0. The upstream gecko demo (gecko.layle.dev) renders black in the same environment, so this is a local-Chrome/driver problem, not a CubeDeck bug — but it means emulator video output is **unverified**. Test on: desktop Chrome with `chrome://flags/#enable-unsafe-webgpu` + Vulkan enabled, a Mac/Windows Chrome (WebGPU on by default), or iPad Safari 26+.
- [ ] **Boot a real ISO end-to-end.** The ISO code path (`load_dvd` → `with_ipl_hle`) is compiled in and mirrors gecko's native `--dvd` flow, but was only exercised with a homebrew DOL (Swiss r2073). Needs a legally-made Pikmin 2 ISO to confirm.
- [ ] **Verify synthetic-key input reaches winit.** Touch/gamepad input dispatches synthetic `KeyboardEvent`s at the canvas; unverified because video never rendered locally. If winit filters non-trusted events, the fallback is patching `crates/web` to export a `set_pad_state(x, y, buttons)` function — that is the better long-term fix anyway.

## Controls

- [ ] **C-stick (yellow) support.** Upstream gecko's web build has no C-stick key bindings at all. Extend `emulator/gecko-web-disc.patch` to map keys (e.g. T/F/G/H) to `substick_x/substick_y` in `update_pad`, rebuild via `emulator/build.sh`, then add a yellow touch stick on the right (Pikmin 2 swarm control needs this).
- [ ] Analog main stick: touch stick currently quantizes to 8 digital directions (arrow keys). Real analog needs the `set_pad_state` export above.
- [ ] L/R analog triggers (currently digital full-press only).

## Emulator

- [ ] RVZ in the browser: web crate builds `image` with `default-features = false` (no zstd). Try enabling the `rvz` feature for wasm — RVZ files are ~5x smaller than ISO, which matters for IndexedDB quota and iPad memory.
- [ ] DSP IROM upload UI (the plumbing exists — `dspIrom` setting is read in Player; there's no settings screen to upload it yet). No audio output exists in the web build regardless (upstream limitation).
- [ ] Save states / memory card persistence (upstream web build has none).
- [ ] Track upstream gecko releases; rebuild with `emulator/build.sh` (bump `GECKO_COMMIT`).

## App

- [ ] Cover art for library cards (fetch from GameTDB by disc game ID after import).
- [ ] Show download progress for the 9.5 MB wasm on first player load.
- [ ] Performance HUD is upstream's egui overlay (top-right); consider a friendlier "this game runs at X%" banner.
- [ ] Error boundary around Player so emulator panics show the in-app error screen instead of a dead page.

## Notes from testing (2026-07-06)

- Chrome launched by chrome-devtools-mcp has **no WebGPU adapter at all** (no Vulkan flag). A manually-launched Chrome with `--enable-unsafe-webgpu --enable-features=Vulkan` gets an NVIDIA adapter and `requestDevice` works, but presentation is still broken on this machine (KDE/Wayland?).
- winit's first surface configure races the ResizeObserver → 1×1 canvas; worked around with CSS-size nudges in `frontend/src/lib/emulator.ts` (`scheduleCanvasResizeNudges`).
- Vimm's Lair page URLs can't be pasted into "Download" — downloads are session-gated POSTs without CORS, and their GameCube images are 7z-packed NKit files the emulator can't read. Standard `.iso` (or zipped `.iso`) from your own rip is the supported format.
