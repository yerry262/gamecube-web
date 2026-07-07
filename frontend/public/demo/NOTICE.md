# Bundled demo

`swiss_r2073.dol` is **Swiss** — an open-source GameCube homebrew utility by
emukidid and contributors, redistributed here unmodified so CubeDeck ships a
one-click, no-upload demo (and a same-origin test target for the "Add from URL"
flow).

- Program: Swiss (swiss-gc), version `v0.6r2073`
- Source & license: https://github.com/emukidid/swiss-gc (GPL-2.0-or-later)
- Full license text: `swiss_r2073.LICENSE.txt` in this folder

Swiss is **not** a game — it's a homebrew boot/utility menu. It's here purely to
exercise the emulator end-to-end (real DOL boot → video → input) with content
that's legal to distribute. CubeDeck never ships or fetches commercial game data;
for real games you bring your own legally-made disc image.

To bump the demo: download a newer Swiss release from the link above, extract
`DOL/swiss_rNNNN.dol` + `LICENSE.txt`, replace these files, and update the
`DEMO_GAME` constant in `frontend/src/components/Library.tsx`.
