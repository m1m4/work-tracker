import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative base so the same build works on GitHub Pages under /<repo>/ without
  // hardcoding the repository name, and locally via `vite preview`.
  base: './',
  build: {
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
