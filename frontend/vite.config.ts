import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the build works at any path (GitHub Pages serves
// this repo from /gamecube-web/).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // The emulator wasm is ~15-30 MB; silence the default 500 kB warning.
    chunkSizeWarningLimit: 40000,
  },
})
