// Runs the CLI logic against the real migration in PGlite (in-process Postgres),
// with the same Supabase stubs as scripts/test-schema.mjs.

import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgStore } from '../src/store.mjs';
import { run } from '../src/cli.mjs';
import { ValidationError } from '../src/schemas.mjs';

const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'supabase', 'migrations');

let db;
let store;
let trip;
const cli = (argv, input) => run(store, argv, { input });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create publication supabase_realtime;
    create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean default false);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
  `);
  for (const f of readdirSync(migrations).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrations, f), 'utf8'));
  }
  store = pgStore(db);
  ({ rows: [{ id: trip }] } = await db.query(`
    insert into trips (city, region, country_code, timezone, start_date, end_date)
    values ('Munich', 'Bavaria', 'DE', 'Europe/Berlin', '2027-10-02', '2027-10-03') returning id`));
  await db.query(`insert into preferences (trip_id, visit_style, interests) values ($1, 'normal', '{museums}')`, [trip]);
}, 60_000);

describe('jobs', () => {
  it('claims the oldest queued job once, then nothing', async () => {
    await db.query(`insert into research_jobs (trip_id, kind, created_at) values
      ($1, 'initial_suggestions', now() - interval '1 minute'), ($1, 'search_again', now())`, [trip]);
    const a = await cli(['jobs', 'next']);
    expect(a.claimed).toBe(true);
    expect(a.job).toMatchObject({ kind: 'initial_suggestions', status: 'running' });
    expect(a.job.started_at).toBeTruthy();
    const again = await cli(['jobs', 'claim', a.job.id]);
    expect(again.claimed).toBe(false);
    const b = await cli(['jobs', 'next']);
    expect(b.job.kind).toBe('search_again');
    expect(await cli(['jobs', 'next'])).toEqual({ claimed: false, job: null });

    const done = await cli(['jobs', 'done', a.job.id]);
    expect(done.status).toBe('done');
    const failed = await cli(['jobs', 'fail', b.job.id, '--error', 'Monid timeout']);
    expect(failed).toMatchObject({ status: 'failed', error: 'Monid timeout' });
    const events = (await db.query(`select level, message from agent_events where job_id = $1`, [b.job.id])).rows;
    expect(events).toEqual([{ level: 'error', message: 'Research failed: Monid timeout' }]);
  });

  it('requeues stale running jobs', async () => {
    const { rows: [j] } = await db.query(`insert into research_jobs (trip_id, kind, status, started_at)
      values ($1, 'research_card', 'running', now() - interval '1 hour') returning id`, [trip]);
    const r = await cli(['jobs', 'requeue-stale', '--minutes', '20']);
    expect(r.map((x) => x.id)).toContain(j.id);
    expect((await db.query(`select status from research_jobs where id = $1`, [j.id])).rows[0].status).toBe('queued');
    await db.query(`update research_jobs set status = 'done' where id = $1`, [j.id]);
  });
});

describe('ingest and research flow', () => {
  let museumCard;
  let museumPlace;

  it('streams a suggestion with place and facts in one call', async () => {
    const { rows: [job] } = await db.query(`insert into research_jobs (trip_id, kind) values ($1, 'initial_suggestions') returning id`, [trip]);
    const r = await cli(['ingest'], {
      trip_id: trip,
      job_id: job.id,
      place: { name: 'Deutsches Museum', lat: 48.1299, lng: 11.5834, google_place_id: 'gp-dm',
        website_url: 'https://www.deutsches-museum.de' },
      card: { type: 'museum', title: 'Deutsches Museum', summary: 'Science and technology museum',
        research_state: 'pending', duration_minutes: 150, duration_basis: 'visit style normal (museum default)' },
      facts: [
        { field: 'opening_hours', value: { sat: [{ open: '09:00', close: '17:00', last_entry: '16:00' }] },
          evidence: 'regular_hours', source_type: 'official', url: 'https://www.deutsches-museum.de/besuch' },
        { field: 'duration', value: 150, evidence: 'estimated', source_type: 'model', basis: 'visit style normal' },
      ],
    });
    expect(r.place.action).toBe('inserted');
    expect(r.card.action).toBe('inserted');
    expect(r.facts).toBe(2);
    museumCard = r.card.id;
    museumPlace = r.place.id;
    const { rows: [c] } = await db.query(`select * from cards where id = $1`, [museumCard]);
    expect(c).toMatchObject({ place_id: museumPlace, job_id: job.id, swipe_status: 'suggested', day: null });
    const facts = (await db.query(`select field, place_id, card_id from facts where trip_id = $1 order by field`, [trip])).rows;
    expect(facts).toEqual([
      { field: 'duration', place_id: null, card_id: museumCard },
      { field: 'opening_hours', place_id: museumPlace, card_id: null },
    ]);
  });

  it('dedupes places by google_place_id and merges special hours', async () => {
    const r1 = await cli(['place', 'upsert'], { trip_id: trip, name: 'Deutsches Museum (Museumsinsel)', google_place_id: 'gp-dm',
      special_hours: [{ date: '2027-10-03', hours: [{ open: '09:00', close: '17:00' }], note: 'German Unity Day: open' }] });
    expect(r1).toMatchObject({ action: 'updated' });
    expect(r1.place.id).toBe(museumPlace);
    const r2 = await cli(['place', 'upsert'], { trip_id: trip, name: 'Deutsches Museum', google_place_id: 'gp-dm',
      special_hours: [{ date: '2027-10-02', closed: true, note: 'test' }] });
    expect(r2.place.special_hours.map((s) => s.date)).toEqual(['2027-10-02', '2027-10-03']);
  });

  it('rejects invalid writes before they reach the database', async () => {
    await expect(cli(['card', 'upsert'], { trip_id: trip, type: 'museum', title: 'X', day: '2027-10-02' }))
      .rejects.toBeInstanceOf(ValidationError);
    await expect(cli(['fact', 'add'], { trip_id: trip, place_id: museumPlace, field: 'opening_hours', value: 'x',
      evidence: 'regular_hours', source_type: 'google_maps' })).rejects.toThrow(/url/);
  });

  it('patches an unscheduled card directly but never touches user-owned fields', async () => {
    await db.query(`update cards set swipe_status = 'accepted' where id = $1`, [museumCard]);
    const r = await cli(['card', 'upsert'], { id: museumCard, research_state: 'ready', duration_minutes: 180,
      duration_basis: 'official: allow 3 h', confirmed: false });
    expect(r.action).toBe('updated');
    expect(r.proposal).toBeNull();
    expect(r.card).toMatchObject({ research_state: 'ready', duration_minutes: 180, swipe_status: 'accepted', confirmed: true });
    expect(r.ignored[0]).toMatch(/confirmed/);
  });

  it('turns schedule-impacting changes on a scheduled card into a proposal', async () => {
    await db.query(`update cards set day = '2027-10-02', position = 1 where id = $1`, [museumCard]);
    const r = await cli(['card', 'upsert', '--reason', 'Official site: allow 2.5 h'], {
      id: museumCard, duration_minutes: 150, duration_basis: 'official: allow 2.5 h', summary: 'Updated summary',
      window_start: '10:00', window_end: '16:00' });
    expect(r.card).toMatchObject({ duration_minutes: 180, day: '2027-10-02', position: 1, summary: 'Updated summary' });
    expect(r.card.day ?? null).not.toBeNull();
    expect(r.proposal.changes).toEqual({ duration_minutes: 150, duration_basis: 'official: allow 2.5 h',
      window_start: '10:00', window_end: '16:00' });
    expect(r.proposal.reason).toBe('Official site: allow 2.5 h');
    // Same refresh again: no duplicate proposal.
    const again = await cli(['card', 'upsert', '--reason', 'Official site: allow 2.5 h'], {
      id: museumCard, duration_minutes: 150, duration_basis: 'official: allow 2.5 h', window_start: '10:00', window_end: '16:00' });
    expect(again.proposal.id).toBe(r.proposal.id);
    const n = (await db.query(`select count(*)::int as n from card_change_proposals where card_id = $1`, [museumCard])).rows[0].n;
    expect(n).toBe(1);
    // Unchanged values do not create proposals.
    const same = await cli(['card', 'upsert'], { id: museumCard, duration_minutes: 180, duration_basis: 'official: allow 3 h' });
    expect(same.proposal).toBeNull();
  });

  it('links a place to a scheduled card without a proposal, and updates places by id', async () => {
    const { rows: [c] } = await db.query(`insert into cards (trip_id, type, title, swipe_status, day, position)
      values ($1, 'sight', 'Marienplatz', 'accepted', '2027-10-02', 2) returning id`, [trip]);
    const r = await cli(['ingest'], { trip_id: trip, place: { name: 'Marienplatz', lat: 48.13743, lng: 11.57549 },
      card: { id: c.id, research_state: 'ready' } });
    expect(r.proposal).toBeNull();
    expect((await db.query(`select place_id from cards where id = $1`, [c.id])).rows[0].place_id).toBe(r.place.id);
    const u = await cli(['place', 'upsert'], { id: r.place.id, trip_id: trip, phone: '+49 89 1' });
    expect(u.place).toMatchObject({ name: 'Marienplatz', phone: '+49 89 1' });
  });

  it('stores holidays with a sourced fact', async () => {
    const [r] = await cli(['holiday', 'add'], [{ trip_id: trip, date: '2027-10-03', name: 'German Unity Day', level: 'national',
      source: { url: 'https://www.bmi.bund.de/feiertage', title: 'Federal holidays' } }]);
    expect(r.holiday.level).toBe('national');
    expect(r.fact).toMatchObject({ holiday_id: r.holiday.id, evidence: 'operator_confirmed', source_type: 'holiday_calendar' });
    const [again] = await cli(['holiday', 'add'], { trip_id: trip, date: '2027-10-03', name: 'German Unity Day', level: 'national', note: 'n' });
    expect(again.holiday.id).toBe(r.holiday.id);
  });

  it('parse_upload: fixed unconfirmed hard card', async () => {
    const r = await cli(['ingest'], { trip_id: trip,
      place: { name: 'Hotel Example', lat: 48.1402, lng: 11.5600 },
      card: { type: 'hotel', title: 'Hotel check-in', is_fixed: true, confirmed: false, constraint_kind: 'hard',
        fixed_start: '2027-10-02T15:00:00+02:00', research_state: 'ready' },
      facts: [{ field: 'check_in', value: '15:00', evidence: 'operator_confirmed', source_type: 'upload', note: 'booking.pdf p1' }] });
    const { rows: [c] } = await db.query(`select is_fixed, confirmed, constraint_kind from cards where id = $1`, [r.card.id]);
    expect(c).toEqual({ is_fixed: true, confirmed: false, constraint_kind: 'hard' });
    await db.query(`update cards set swipe_status = 'accepted' where id = $1`, [r.card.id]);
  });

  it('fills walking estimates for accepted cards only', async () => {
    await cli(['ingest'], { trip_id: trip, place: { name: 'Far away', lat: 48.2, lng: 11.6 },
      card: { type: 'sight', title: 'Suggested only' } });
    await cli(['ingest'], { trip_id: trip, place: { name: 'No coords' }, card: { type: 'sight', title: 'Accepted, no coords' } });
    await db.query(`update cards set swipe_status = 'accepted' where title = 'Accepted, no coords'`);
    const r = await cli(['travel', 'fill', trip]);
    expect(r.inserted).toBe(6); // museum, hotel, Marienplatz: 3 places x 2 directions
    expect(r.skipped.map((s) => s.name)).toEqual(['No coords']);
    expect(r.pairs.every((p) => p.max >= p.min && p.min > 0)).toBe(true);
    expect((await cli(['travel', 'fill', trip])).inserted).toBe(0);
    const { rows } = await db.query(`select basis from travel_times where trip_id = $1`, [trip]);
    expect(rows[0].basis).toMatch(/detour 1.3/);
  });

  it('logs events and builds the trip bundle and summary', async () => {
    const e = await cli(['event', 'log', trip, 'Checking', 'holiday', 'hours', '--level', 'progress', '--card', museumCard]);
    expect(e).toMatchObject({ message: 'Checking holiday hours', level: 'progress', card_id: museumCard });
    const b = await cli(['trip', 'get', trip]);
    expect(Object.keys(b).sort()).toEqual(['cards', 'facts', 'holidays', 'places', 'preferences', 'travel_times', 'trip']);
    expect(b.preferences.visit_style).toBe('normal');
    expect(b.facts.length).toBeGreaterThan(0);
    expect((await cli(['trip', 'get', trip, '--no-facts'])).facts).toEqual([]);
    const s = await cli(['trip', 'summary', trip]);
    expect(s.cards.find((c) => c.id === museumCard)).toMatchObject({ place: expect.stringContaining('Deutsches Museum'), day: '2027-10-02' });
    expect(s.places_without_coordinates.map((p) => p.name)).toEqual(['No coords']);
    const card = await cli(['card', 'get', museumCard]);
    expect(card.pending_proposals).toHaveLength(1);
    expect(card.facts.length).toBeGreaterThanOrEqual(2);
  });

  it('tracks upload parsing status and stores extracted bookings', async () => {
    const { rows: [u] } = await db.query(`insert into uploads (trip_id, storage_path, file_name)
      values ($1, 'trip/booking.pdf', 'booking.pdf') returning id`, [trip]);
    expect((await cli(['upload', 'get', u.id])).upload.file_name).toBe('booking.pdf');
    expect((await cli(['upload', 'status', u.id, 'parsing'])).status).toBe('parsing');
    const parsed = await cli(['upload', 'parsed', u.id], { bookings: [{ kind: 'hotel', check_in: '2027-10-02T15:00:00+02:00' }] });
    expect(parsed).toMatchObject({ status: 'parsed', parsed: { bookings: [{ kind: 'hotel' }] } });
    await expect(cli(['upload', 'status', u.id, 'done'])).rejects.toThrow(/status must be/);
  });

  it('refuses cross-trip references', async () => {
    const { rows: [{ id: other }] } = await db.query(`insert into trips (city, country_code, timezone, start_date, end_date)
      values ('Zurich', 'CH', 'Europe/Zurich', '2027-10-02', '2027-10-03') returning id`);
    await expect(cli(['fact', 'add'], { trip_id: other, place_id: museumPlace, field: 'x', value: 1,
      evidence: 'estimated', source_type: 'model', basis: 'b' })).rejects.toThrow(/different trip/);
  });
});
