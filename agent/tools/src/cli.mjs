// ausflieger: CLI the OpenClaw agent calls via exec. All writes are validated (schemas.mjs).
// Output: one JSON document on stdout. Errors: message on stderr, exit 1 (usage/db) or 2 (validation).

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as cmd from './commands.mjs';
import { ValidationError, CARD_TYPES, RESEARCH_STATES, CONSTRAINT_KINDS, EVIDENCE, SOURCE_TYPES,
  HOLIDAY_LEVELS, TRAVEL_MODES, JOB_KINDS, EVENT_LEVELS } from './schemas.mjs';

export const HELP = `ausflieger - validated Supabase access for the Ausflieger research agent

Input JSON comes from stdin, --json '<json>' or --file <path>. Output is JSON on stdout.
Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or a .env file next to package.json, or AUSFLIEGER_ENV_FILE).

Jobs
  jobs claim <job_id>              claim a specific queued job (prints {claimed, job}; claimed=false -> skip it)
  jobs next                        claim the oldest queued job ({claimed:false, job:null} if none)
  jobs done <job_id>
  jobs fail <job_id> --error "<message>"
  jobs list [--status queued|running|done|failed] [--trip <trip_id>]
  jobs requeue-stale [--minutes 20]

Read
  trip get <trip_id> [--no-facts]  full TripBundle (trip, preferences, places, cards, holidays, facts, travel_times)
  trip summary <trip_id>           compact overview (cards, holidays, open jobs, places without coordinates)
  card get <card_id>               card + place + facts + pending proposals

Write (stdin JSON; object or array where noted)
  ingest [--reason "<why>"]        {trip_id, job_id?, place?, card?, facts?[]} in one call (preferred)
  card upsert [--job <id>] [--reason "<why>"]   new card (no id) or patch (with id)
  card state <card_id> <research_state>
  place upsert
  fact add                         object or array
  holiday add                      object or array; optional "source": {url, title?, source_type?, evidence?}
  travel set                       object or array
  travel fill <trip_id> [--include-suggested]   walking estimates for missing pairs of accepted cards' places
  travel estimate <lat1> <lng1> <lat2> <lng2>   print a walking estimate (no DB)
  proposal add                     {trip_id, card_id, job_id?, changes, reason}
  upload get <upload_id> [--out <dir>]          upload row; --out downloads the file and prints local_path
  upload status <upload_id> <uploaded|parsing|parsed|failed>
  upload parsed <upload_id>        stdin JSON: extracted bookings; sets status parsed
  event log <trip_id> <message...> [--level info|progress|warning|error] [--job <id>] [--card <id>]

  enums                            print allowed enum values
`;

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split(/=(.*)/s, 2);
      if (inline !== undefined) flags[k] = inline;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [process.env.AUSFLIEGER_ENV_FILE, join(here, '..', '.env')].filter(Boolean);
  for (const f of candidates) {
    if (existsSync(f)) {
      try { process.loadEnvFile(f); } catch { /* ignore malformed env file */ }
    }
  }
}

async function readInput(flags) {
  if (typeof flags.json === 'string') return JSON.parse(flags.json);
  if (typeof flags.file === 'string') return JSON.parse(readFileSync(flags.file, 'utf8'));
  if (process.stdin.isTTY) throw new cmd.UsageError('expected JSON on stdin, --json or --file');
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) throw new cmd.UsageError('empty input: expected JSON on stdin, --json or --file');
  try { return JSON.parse(text); } catch (e) { throw new cmd.UsageError(`input is not valid JSON: ${e.message}`); }
}

/** Run one command against a store. Exported for tests. */
export async function run(store, argv, { input } = {}) {
  const { positional, flags } = parseArgs(argv);
  const [group, action, ...rest] = positional;
  const need = (v, name) => { if (!v) throw new cmd.UsageError(`missing <${name}>\n\n${HELP}`); return v; };
  const getInput = async () => (input !== undefined ? input : readInput(flags));
  const key = `${group ?? ''} ${action ?? ''}`.trim();

  switch (key) {
    case 'jobs claim': return cmd.claimJob(store, need(rest[0] ?? flags.id, 'job_id'));
    case 'jobs next': return cmd.claimNextJob(store);
    case 'jobs done': return cmd.finishJob(store, need(rest[0], 'job_id'));
    case 'jobs fail': return cmd.finishJob(store, need(rest[0], 'job_id'), { failed: true, error: typeof flags.error === 'string' ? flags.error : null });
    case 'jobs list': return cmd.listJobs(store, { status: flags.status, trip_id: flags.trip });
    case 'jobs requeue-stale': return cmd.requeueStale(store, Number(flags.minutes ?? 20));
    case 'trip get': return cmd.getTripBundle(store, need(rest[0], 'trip_id'), { facts: !flags['no-facts'] });
    case 'trip summary': return cmd.getTripSummary(store, need(rest[0], 'trip_id'));
    case 'card get': return cmd.getCard(store, need(rest[0], 'card_id'));
    case 'card upsert': return cmd.upsertCard(store, await getInput(),
      { reason: typeof flags.reason === 'string' ? flags.reason : null, jobId: typeof flags.job === 'string' ? flags.job : null });
    case 'card state': return cmd.setCardState(store, need(rest[0], 'card_id'), need(rest[1], 'research_state'));
    case 'place upsert': return cmd.upsertPlace(store, await getInput());
    case 'fact add': return cmd.addFacts(store, await getInput());
    case 'holiday add': return cmd.addHolidays(store, await getInput());
    case 'travel set': return cmd.setTravel(store, await getInput());
    case 'travel fill': return cmd.fillTravel(store, need(rest[0], 'trip_id'), { includeSuggested: !!flags['include-suggested'] });
    case 'proposal add': return cmd.addProposal(store, await getInput());
    case 'event log': {
      const tripId = need(rest[0], 'trip_id');
      return cmd.logEvent(store, {
        trip_id: tripId, message: need(rest.slice(1).join(' '), 'message'),
        level: flags.level ?? 'info', job_id: flags.job ?? null, card_id: flags.card ?? null,
      });
    }
    case 'upload get': {
      const outDir = typeof flags.out === 'string' ? flags.out : null;
      if (outDir) mkdirSync(outDir, { recursive: true });
      return cmd.getUpload(store, need(rest[0], 'upload_id'), { outDir, writeFile });
    }
    case 'upload status': return cmd.setUpload(store, need(rest[0], 'upload_id'), { status: need(rest[1], 'status') });
    case 'upload parsed': return cmd.setUpload(store, need(rest[0], 'upload_id'), { parsed: await getInput() });
    case 'ingest': return cmd.ingest(store, await getInput(), { reason: typeof flags.reason === 'string' ? flags.reason : null });
    default:
      throw new cmd.UsageError(`unknown command: ${key || '(none)'}\n\n${HELP}`);
  }
}

const NO_DB = {
  'travel estimate': (rest) => {
    const [a, b, c, d] = rest.map(Number);
    if ([a, b, c, d].some((x) => !Number.isFinite(x))) throw new cmd.UsageError('travel estimate <lat1> <lng1> <lat2> <lng2>');
    return cmd.estimateWalk({ lat: a, lng: b }, { lat: c, lng: d });
  },
  enums: () => ({
    card_type: CARD_TYPES, research_state: RESEARCH_STATES, constraint_kind: CONSTRAINT_KINDS, evidence: EVIDENCE,
    source_type: SOURCE_TYPES, holiday_level: HOLIDAY_LEVELS, travel_mode: TRAVEL_MODES, job_kind: JOB_KINDS,
    event_level: EVENT_LEVELS,
  }),
};

export async function main(argv = process.argv.slice(2)) {
  const { positional, flags } = parseArgs(argv);
  const out = (v) => process.stdout.write(`${JSON.stringify(v, null, flags.pretty ? 2 : 0)}\n`);
  try {
    if (!positional.length || flags.help || positional[0] === 'help') { process.stdout.write(HELP); return 0; }
    const noDb = NO_DB[`${positional[0]} ${positional[1] ?? ''}`.trim()] ?? NO_DB[positional[0]];
    if (noDb) { out(noDb(positional.slice(2))); return 0; }

    loadEnv();
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new cmd.UsageError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    const { supabaseStore } = await import('./store.mjs');
    const store = await supabaseStore({ url, key });
    out(await run(store, argv));
    return 0;
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    return e instanceof ValidationError ? 2 : 1;
  }
}
