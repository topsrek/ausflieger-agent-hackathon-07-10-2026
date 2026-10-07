// Type-checks data/demo/munich.json against shared/types.ts: writes the JSON as a TS literal with
// `satisfies TripBundle & { uploads; agent_events }` into data/.typecheck/ and runs tsc --strict.
// Usage: node data/scripts/typecheck.mjs   (needs `npm install` in data/)

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = readFileSync(join(DATA, 'demo', 'munich.json'), 'utf8');
const dir = join(DATA, '.typecheck');
mkdirSync(dir, { recursive: true });
const file = join(dir, 'munich.check.ts');
writeFileSync(file, `import type { TripBundle, Upload, AgentEvent } from '../../shared/types';
export const bundle = ${json.trim()} satisfies TripBundle & { uploads: Upload[]; agent_events: AgentEvent[] };
`);
try {
  execFileSync(process.execPath, [join(DATA, 'node_modules', 'typescript', 'bin', 'tsc'),
    '--noEmit', '--strict', '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler', file],
  { stdio: 'inherit' });
  console.log('munich.json matches shared/types.ts (TripBundle + uploads + agent_events)');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
