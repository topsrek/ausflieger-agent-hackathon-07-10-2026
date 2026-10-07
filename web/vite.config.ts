import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const realPlanner = path.resolve(repoRoot, 'planner/src/index.ts');
// Use the shared planner (planner/src) when it exists; fall back to a minimal local implementation
// of the same API so the web app keeps building while planner/ is in progress.
const plannerEntry = existsSync(realPlanner) ? realPlanner : path.resolve(here, 'src/planner-fallback/index.ts');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@planner': plannerEntry,
      '@shared': path.resolve(repoRoot, 'shared'),
    },
  },
  server: {
    port: 5173,
    fs: { allow: [repoRoot] },
  },
});
