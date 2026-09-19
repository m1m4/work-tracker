import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Stamps a unique version into the built service worker.
 *
 * public/ is copied verbatim, so sw.js never passes through Vite's transforms
 * and cannot use import.meta.env. Without a per-deploy cache name the previous
 * cache survives activate() and keeps serving the old shell, manifest and icons
 * indefinitely - the filenames are not fingerprinted, so nothing else forces
 * them to update.
 */
function stampServiceWorker() {
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    closeBundle() {
      const file = resolve(outDir, 'sw.js')
      const version = Date.now().toString(36)
      writeFileSync(file, readFileSync(file, 'utf8').replaceAll('__SW_VERSION__', version))
    },
  }
}

const outDir = 'dist'

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  // Relative base so the same build works on GitHub Pages under /<repo>/ without
  // hardcoding the repository name, and locally via `vite preview`.
  base: './',
  build: {
    outDir,
    target: 'es2020',
    // No manualChunks here on purpose. Rollup's default chunking already keeps
    // modules reachable only through a dynamic import out of the entry chunk,
    // which is exactly what keeps Recharts off the critical path. Naming a
    // manual chunk for it pulls React in alongside and makes the entry depend
    // on the whole thing statically.
  },
  test: {
    environment: 'node',
    // Pinned so the DST cases in hours.test.js are deterministic regardless of
    // where the tests run.
    env: { TZ: 'America/New_York' },
  },
})
