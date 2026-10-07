// Smoke test for the Supabase migrations without Docker: runs them in PGlite
// (in-process Postgres) with stubs for the Supabase-specific roles, the realtime
// publication and the storage schema.
// Usage: npm run test:schema

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

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

const dir = 'supabase/migrations';
for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(dir, file), 'utf8'));
  console.log(`applied ${file}`);
}

const one = async (sql, params) => (await db.query(sql, params)).rows[0];

// Demo trip, written as the agent would (service role).
const { id: demo } = await one(`
  insert into trips (title, city, region, country_code, timezone, start_date, end_date, step, is_demo)
  values ('Munich, Oktoberfest', 'Munich', 'Bavaria', 'DE', 'Europe/Berlin', '2027-10-02', '2027-10-03', 'scheduling', true)
  returning id`);
await db.query(`insert into preferences (trip_id, visit_style, interests) values ($1, 'long', '{museums,food}')`, [demo]);
const { id: museum } = await one(`
  insert into places (trip_id, name, google_place_id, opening_hours, special_hours)
  values ($1, 'Deutsches Museum', 'gp1', '{"sat":[{"open":"09:00","close":"17:00","last_entry":"16:00"}]}',
          '[{"date":"2027-10-03","hours":[{"open":"09:00","close":"17:00"}]}]')
  returning id`, [demo]);
const { id: hotel } = await one(`insert into places (trip_id, name, google_place_id) values ($1, 'Hotel X', 'gp2') returning id`, [demo]);
const { id: card } = await one(`
  insert into cards (trip_id, place_id, type, title, swipe_status, duration_minutes, day, position)
  values ($1, $2, 'museum', 'Deutsches Museum', 'accepted', 180, '2027-10-02', 1) returning id`, [demo, museum]);
await db.query(`
  insert into cards (trip_id, place_id, type, title, is_fixed, fixed_start, window_start, window_end, swipe_status)
  values ($1, $2, 'hotel', 'Breakfast', false, null, '07:00', '10:30', 'accepted')`, [demo, hotel]);
await db.query(`insert into cards (trip_id, type, title, duration_minutes, swipe_status, day, position)
                values ($1, 'buffer', 'Buffer', 15, 'accepted', '2027-10-02', 2)`, [demo]);
const { id: holiday } = await one(`
  insert into holidays (trip_id, date, name, level) values ($1, '2027-10-03', 'German Unity Day', 'national') returning id`, [demo]);
await db.query(`
  insert into facts (trip_id, place_id, field, value, evidence, source_type, url, applies_from, applies_to) values
    ($1, $2, 'opening_hours', '"09-17"', 'operator_confirmed', 'official', 'https://deutsches-museum.de', '2027-10-02', '2027-10-03'),
    ($1, $2, 'opening_hours', '"09-17"', 'regular_hours', 'google_maps', 'https://maps.google.com/?cid=1', null, null)`,
  [demo, museum]);
await db.query(`insert into facts (trip_id, card_id, field, value, evidence, source_type, basis)
                values ($1, $2, 'duration', '180', 'estimated', 'model', 'visit style long')`, [demo, card]);
await db.query(`insert into facts (trip_id, holiday_id, field, value, evidence, source_type, url)
                values ($1, $2, 'date', '"2027-10-03"', 'operator_confirmed', 'holiday_calendar', 'https://example.org')`,
  [demo, holiday]);
await db.query(`insert into travel_times (trip_id, from_place_id, to_place_id, min_minutes, max_minutes, basis)
                values ($1, $2, $3, 15, 25, 'distance'), ($1, $3, $2, 15, 25, 'distance')`, [demo, museum, hotel]);
const { id: job } = await one(`insert into research_jobs (trip_id, kind, query) values ($1, 'search_again', 'more indoor') returning id`, [demo]);
await db.query(`insert into agent_events (trip_id, job_id, message) values ($1, $2, 'Checking opening hours')`, [demo, job]);
await db.query(`insert into card_change_proposals (trip_id, card_id, job_id, changes, reason)
                values ($1, $2, $3, '{"duration_minutes":150}', 'official site says allow 2.5 h')`, [demo, card, job]);

// Derived fact status.
const status = await db.query(`select field, evidence from fact_status where trip_id = $1 order by field`, [demo]);
assert.deepEqual(status.rows.map((r) => [r.field, r.evidence]),
  [['date', 'operator_confirmed'], ['duration', 'estimated'], ['opening_hours', 'operator_confirmed']]);
await db.query(`insert into facts (trip_id, place_id, field, value, evidence, source_type, url)
                values ($1, $2, 'opening_hours', '"10-18"', 'regular_hours', 'travel_guide', 'https://guide.example')`,
  [demo, museum]);
assert.equal((await one(`select evidence from fact_status where place_id = $1`, [museum])).evidence, 'conflicting');

// Check constraints.
const rejects = async (sql, params, label) => {
  await assert.rejects(db.query(sql, params), undefined, label);
};
await rejects(`insert into cards (trip_id, type, title, is_fixed) values ($1, 'arrival', 'Train', true)`, [demo], 'fixed needs start');
await rejects(`insert into cards (trip_id, type, title, day) values ($1, 'sight', 'X', '2027-10-01')`, [demo], 'day needs position');
await rejects(`insert into cards (trip_id, type, title) values ($1, 'buffer', 'B')`, [demo], 'buffer needs duration');
await rejects(`insert into facts (trip_id, field, evidence, source_type, url) values ($1, 'x', 'regular_hours', 'official', 'u')`,
  [demo], 'fact needs target');
await rejects(`insert into facts (trip_id, place_id, field, evidence, source_type) values ($1, $2, 'x', 'regular_hours', 'official')`,
  [demo, museum], 'sourced fact needs url');
await rejects(`insert into travel_times (trip_id, from_place_id, to_place_id, min_minutes, max_minutes)
               values ($1, $2, $3, 30, 20)`, [demo, museum, hotel], 'range must be ordered');

// RLS as anon: demo is read-only, clone is editable.
await db.exec(`set role anon`);
assert.equal((await db.query(`select * from cards where trip_id = $1`, [demo])).rows.length, 3);
const upd = await db.query(`update cards set position = 5 where id = $1`, [card]);
assert.equal(upd.affectedRows, 0, 'anon must not edit demo cards');
await rejects(`insert into cards (trip_id, type, title) values ($1, 'sight', 'X')`, [demo], 'anon must not insert into demo');

const { clone_trip: clone } = await one(`select clone_trip($1)`, [demo]);
const counts = async (t) => one(`
  select (select count(*) from cards where trip_id = $1)::int as cards,
         (select count(*) from places where trip_id = $1)::int as places,
         (select count(*) from facts where trip_id = $1)::int as facts,
         (select count(*) from holidays where trip_id = $1)::int as holidays,
         (select count(*) from travel_times where trip_id = $1)::int as travel,
         (select count(*) from preferences where trip_id = $1)::int as prefs`, [t]);
assert.deepEqual(await counts(clone), await counts(demo));
// Cloned cards must point at cloned places, not the demo's.
assert.equal((await one(`
  select count(*)::int as n from cards c join places p on p.id = c.place_id
  where c.trip_id = $1 and p.trip_id <> $1`, [clone])).n, 0);
const upd2 = await db.query(`update cards set position = 9 where trip_id = $1 and day is not null and position = 1`, [clone]);
assert.equal(upd2.affectedRows, 1, 'anon can edit the clone');
await db.query(`insert into trips (city, country_code, timezone, start_date, end_date)
                values ('Urbino', 'IT', 'Europe/Rome', '2026-10-10', '2026-10-11')`);
await rejects(`insert into trips (city, country_code, timezone, start_date, end_date, is_demo)
               values ('X', 'IT', 'Europe/Rome', '2026-10-10', '2026-10-11', true)`, [], 'anon cannot create demo');
// Clone twice in one session works (temp tables cleaned up).
await one(`select clone_trip($1)`, [demo]);
await rejects(`select clone_trip($1)`, [clone], 'only demo trips can be cloned');
await db.exec(`reset role`);

// Cascade delete.
await db.query(`delete from trips where id = $1`, [clone]);
assert.equal((await one(`select count(*)::int as n from cards where trip_id = $1`, [clone])).n, 0);

const pub = await db.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`);
assert.deepEqual(pub.rows.map((r) => r.tablename), ['agent_events', 'card_change_proposals', 'cards', 'facts', 'places', 'research_jobs', 'travel_times']);

console.log('schema ok');
