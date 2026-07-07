#!/usr/bin/env bash
# Rebuilds the vendored emulator (frontend/src/vendor/gecko) from source.
#
# CubeDeck uses gecko (https://github.com/ioncodes/gecko, GPL-3.0), a
# GameCube/Wii emulator in Rust with a wasm-bindgen web build, patched
# to boot full disc images (ISO / zipped ISO) instead of only DOL files.
#
# Requirements: git, rustup (the pinned toolchain installs itself), wasm-pack,
# clang (zstd-sys cross-compiles zstd's C sources to wasm for RVZ support).

set -euo pipefail

GECKO_REPO=https://github.com/ioncodes/gecko.git
GECKO_COMMIT=39e82205a0da154f23fd36b95e64a8029d468618

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR_DIR="$SCRIPT_DIR/../frontend/src/vendor/gecko"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

git clone "$GECKO_REPO" "$WORK_DIR/gecko"
cd "$WORK_DIR/gecko"
git checkout "$GECKO_COMMIT"
git submodule init
git submodule update

git apply "$SCRIPT_DIR/gecko-web-disc.patch"

# The pinned toolchain file demands a Windows cross-target we don't need.
sed -i 's/    "x86_64-pc-windows-gnu",//' rust-toolchain.toml

wasm-pack build crates/web --target web --out-dir pkg --release

mkdir -p "$VENDOR_DIR"
cp crates/web/pkg/{web.js,web_bg.wasm,web.d.ts,web_bg.wasm.d.ts} "$VENDOR_DIR/"
echo "Vendored emulator updated in $VENDOR_DIR"
