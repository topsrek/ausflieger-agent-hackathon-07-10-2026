// Verifies the demo dataset without Docker: applies the Supabase migrations in PGlite (like
// scripts/test-schema.mjs), runs supabase/seed.sql, checks counts against data/demo/munich.json,
// re-runs the seed (idempotent), and clones the demo trip with clone_trip() as the anon role.
// Usage (from the repo root, after `npm install` there): node data/scripts/verify.mjs

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const bundle = JSON.parse(readFileSync(join(ROOT, 'data', 'demo', 'munich.json'), 'utf8'));
const seed = readFileSync(join(ROOT, 'supabase', 'seed.sql'), 'utf8');
const demo = bundle.trip.id;

const db = new PGlite();
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create publication supabase_realtime;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);
const dir = join(ROOT, 'supabase', 'migrations');
for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(dir, file), 'utf8'));
  console.log(`applied ${file}`);
}

await db.exec(seed);
await db.exec(seed); // idempotent
console.log('seed applied twice');

const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const counts = (t) => one(`
  select (select count(*) from trips where id = $1)::int as trips,
         (select count(*) from preferences where trip_id = $1)::int as preferences,
         (select count(*) from uploads where trip_id = $1)::int as uploads,
         (select count(*) from places where trip_id = $1)::int as places,
         (select count(*) from cards where trip_id = $1)::int as cards,
         (select count(*) from holidays where trip_id = $1)::int as holidays,
         (select count(*) from facts where trip_id = $1)::int as facts,
         (select count(*) from travel_times where trip_id = $1)::int as travel_times`, [t]);

const expected = {
  trips: 1, preferences: 1, uploads: bundle.uploads.length, places: bundle.places.length, cards: bundle.cards.length,
  holidays: bundle.holidays.length, facts: bundle.facts.length, travel_times: bundle.travel_times.length,
};
const got = await counts(demo);
assert.deepEqual(got, expected);
console.log('counts', got);
assert.equal((await one(`select count(*)::int as n from agent_events where trip_id = $1`, [demo])).n,
  bundle.agent_events.length, 'agent_events (deleted with the trip on re-seed)');

// Schedule sanity in SQL: every scheduled card has day+position, positions unique per day.
const dup = await one(`select count(*)::int as n from (select day, position from cards where trip_id = $1 and day is not null
                       group by day, position having count(*) > 1) d`, [demo]);
assert.equal(dup.n, 0, 'unique positions per day');
const sched = await db.query(`select day::text, count(*)::int as n from cards where trip_id = $1 and day is not null group by day order by day`, [demo]);
console.log('scheduled per day', sched.rows);
assert.equal((await one(`select count(*)::int as n from cards where trip_id = $1 and confirmed = false and upload_id is not null`, [demo])).n, 2);

// Every scheduled card with a place has travel times to the next card's place.
const tt = await one(`
  with s as (select place_id, day, position, lead(place_id) over (partition by day order by position) as next_place
             from cards where trip_id = $1 and day is not null and place_id is not null)
  select count(*)::int as missing from s
  where next_place is not null and next_place <> place_id
    and not exists (select 1 from travel_times t where t.from_place_id = s.place_id and t.to_place_id = s.next_place)`, [demo]);
assert.equal(tt.missing, 0, 'travel times for consecutive scheduled places');

// Fact status: the planned conflicts are visible.
const status = await db.query(`
  select p.name, fs.field, fs.evidence::text, fs.n_claims::int from fact_status fs join places p on p.id = fs.place_id
  where fs.trip_id = $1 and fs.evidence = 'conflicting' order by 1, 2`, [demo]);
console.log('conflicting facts:');
for (const r of status.rows) console.log(`  ${r.name} – ${r.field} (${r.n_claims} claims)`);
const conflicting = status.rows.map((r) => `${r.name}|${r.field}`);
for (const want of ['Viktualienmarkt|opening_hours', 'Hofbräuhaus am Platzl|opening_hours', "Schumann's Bar am Hofgarten|opening_hours",
  'Hotel Uhland|check_out', 'Residenz München|season', 'Alte Pinakothek|price', 'Olympiaturm|closure']) {
  assert.ok(conflicting.includes(want), `expected conflict ${want}`);
}
const resHours = await one(`select fs.evidence::text from fact_status fs join places p on p.id = fs.place_id
                            where fs.trip_id = $1 and p.name = 'Residenz München' and fs.field = 'opening_hours'`, [demo]);
assert.equal(resHours.evidence, 'regular_hours', 'Residenz hours agree across sources');
const wiesn = await one(`select fs.evidence::text from fact_status fs join places p on p.id = fs.place_id
                         where fs.trip_id = $1 and p.name like 'Oktoberfest%' and fs.field = 'opening_hours'`, [demo]);
assert.equal(wiesn.evidence, 'operator_confirmed');

// Clone as the anonymous frontend would.
await db.exec('set role anon');
const upd = await db.query(`update cards set position = 99 where trip_id = $1`, [demo]);
assert.equal(upd.affectedRows, 0, 'demo is read-only for anon');
const { clone_trip: clone } = await one(`select clone_trip($1)`, [demo]);
const cloned = await counts(clone);
assert.deepEqual(cloned, expected, 'clone has the same rows');
assert.equal((await one(`select count(*)::int as n from cards c join places p on p.id = c.place_id
                         where c.trip_id = $1 and p.trip_id <> $1`, [clone])).n, 0, 'cloned cards point at cloned places');
assert.equal((await one(`select count(*)::int as n from cards c join uploads u on u.id = c.upload_id
                         where c.trip_id = $1 and u.trip_id = $1`, [clone])).n, 2, 'cloned upload cards point at cloned upload');
assert.equal((await one(`select count(*)::int as n from facts f join cards c on c.id = f.card_id
                         where f.trip_id = $1 and c.trip_id <> $1`, [clone])).n, 0, 'cloned facts point at cloned cards');
const moved = await db.query(`update cards set day = '2027-10-02', position = 20 where trip_id = $1 and metadata->>'key' = 'dm'`, [clone]);
assert.equal(moved.affectedRows, 1, 'anon can edit the clone');
await db.exec('reset role');

console.log(`clone ${clone}`, cloned);
console.log('verify ok');
