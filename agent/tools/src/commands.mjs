// Command logic. Every function takes a store (see store.mjs) and validated input,
// so the same code runs against Supabase in production and PGlite in tests.

import {
  parse, cardInsert, cardPatch, placeInput, factInput, holidayInput, travelInput, proposalInput,
  eventInput, ingestInput, RESEARCH_STATES, SCHEDULE_IMPACT_FIELDS, PLACE_FIELDS, ValidationError,
} from './schemas.mjs';
import { missingWalkPairs, estimateWalk } from './travel.mjs';

const nowIso = () => new Date().toISOString();
const asArray = (x) => (Array.isArray(x) ? x : [x]);

export class UsageError extends Error {
  constructor(msg) { super(msg); this.name = 'UsageError'; }
}

async function one(store, table, filters, what) {
  const rows = await store.select(table, filters, { limit: 1 });
  if (!rows.length) throw new UsageError(`${what ?? table} not found: ${JSON.stringify(filters)}`);
  return rows[0];
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

/** Claim one specific queued job. Returns {claimed, job}. claimed=false if someone else has it. */
export async function claimJob(store, id) {
  const rows = await store.update('research_jobs', { status: 'running', started_at: nowIso(), error: null },
    { id, status: 'queued' });
  if (rows.length) return { claimed: true, job: rows[0] };
  const job = await one(store, 'research_jobs', { id }, 'job');
  return { claimed: false, job };
}

/** Claim the oldest queued job (optimistic: select oldest, update where still queued). */
export async function claimNextJob(store) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [next] = await store.select('research_jobs', { status: 'queued' },
      { order: [['created_at', 'asc']], limit: 1, columns: 'id' });
    if (!next) return { claimed: false, job: null };
    const r = await claimJob(store, next.id);
    if (r.claimed) return r;
  }
  return { claimed: false, job: null };
}

export async function finishJob(store, id, { failed = false, error = null } = {}) {
  const status = failed ? 'failed' : 'done';
  const rows = await store.update('research_jobs',
    { status, finished_at: nowIso(), error: failed ? (error ?? 'failed') : null }, { id });
  if (!rows.length) throw new UsageError(`job not found: ${id}`);
  const job = rows[0];
  await store.insert('agent_events', {
    trip_id: job.trip_id, job_id: id, level: failed ? 'error' : 'info',
    message: failed ? `Research failed: ${error ?? 'unknown error'}`.slice(0, 500) : `Research job ${job.kind} finished`,
  });
  return job;
}

export async function listJobs(store, { status, trip_id } = {}) {
  const filters = {};
  if (status) filters.status = status;
  if (trip_id) filters.trip_id = trip_id;
  return store.select('research_jobs', filters, { order: [['created_at', 'asc']], limit: 50 });
}

/** Put running jobs that started more than `minutes` ago back into the queue. */
export async function requeueStale(store, minutes = 20) {
  const cutoff = Date.now() - minutes * 60_000;
  const running = await store.select('research_jobs', { status: 'running' });
  const stale = running.filter((j) => j.started_at && Date.parse(j.started_at) < cutoff);
  const out = [];
  for (const j of stale) {
    out.push(...await store.update('research_jobs', { status: 'queued', started_at: null }, { id: j.id, status: 'running' }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Trip
// ---------------------------------------------------------------------------

export async function getTripBundle(store, tripId, { facts = true } = {}) {
  const trip = await one(store, 'trips', { id: tripId }, 'trip');
  const by = { trip_id: tripId };
  const [prefs, places, cards, holidays, factRows, travel] = await Promise.all([
    store.select('preferences', by),
    store.select('places', by, { order: [['created_at', 'asc']] }),
    store.select('cards', by, { order: [['created_at', 'asc']] }),
    store.select('holidays', by, { order: [['date', 'asc']] }),
    facts ? store.select('facts', by, { order: [['retrieved_at', 'asc']] }) : Promise.resolve([]),
    store.select('travel_times', by),
  ]);
  return {
    trip, preferences: prefs[0] ?? null, places, cards, holidays, facts: factRows, travel_times: travel,
  };
}

/** Compact view for the agent's context: what exists, what is accepted/scheduled, what is missing. */
export async function getTripSummary(store, tripId) {
  const b = await getTripBundle(store, tripId, { facts: false });
  const placeName = Object.fromEntries(b.places.map((p) => [p.id, p.name]));
  const jobs = await store.select('research_jobs', { trip_id: tripId, status: ['queued', 'running'] });
  return {
    trip: b.trip,
    preferences: b.preferences,
    holidays: b.holidays.map((h) => ({ id: h.id, date: h.date, name: h.name, level: h.level, region: h.region })),
    cards: b.cards.map((c) => ({
      id: c.id, type: c.type, title: c.title, swipe_status: c.swipe_status, research_state: c.research_state,
      is_fixed: c.is_fixed, confirmed: c.confirmed, day: c.day, position: c.position, place_id: c.place_id,
      place: c.place_id ? placeName[c.place_id] ?? null : null,
    })),
    places_without_coordinates: b.places.filter((p) => p.lat == null).map((p) => ({ id: p.id, name: p.name })),
    travel_pairs: b.travel_times.length,
    open_jobs: jobs.map((j) => ({ id: j.id, kind: j.kind, status: j.status, card_id: j.card_id })),
  };
}

export async function getCard(store, id) {
  const card = await one(store, 'cards', { id }, 'card');
  const place = card.place_id ? (await store.select('places', { id: card.place_id }))[0] ?? null : null;
  const facts = await store.select('facts', { card_id: id });
  const placeFacts = place ? await store.select('facts', { place_id: place.id }) : [];
  const proposals = await store.select('card_change_proposals', { card_id: id, status: 'pending' });
  return { card, place, facts: [...facts, ...placeFacts], pending_proposals: proposals };
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

function mergeSpecialHours(oldList = [], newList = []) {
  const key = (s) => s.date;
  const map = new Map(oldList.map((s) => [key(s), s]));
  for (const s of newList) map.set(key(s), s);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Insert or update a place. Matches by id, then (trip_id, google_place_id), then exact name in the trip. */
export async function upsertPlace(store, input) {
  if (input?.id && !input.name) {
    const cur = await one(store, 'places', { id: input.id }, 'place');
    input = { ...input, name: cur.name };
  }
  const p = parse(placeInput, input, 'place');
  let existing = null;
  if (p.id) existing = await one(store, 'places', { id: p.id }, 'place');
  else if (p.google_place_id) existing = (await store.select('places', { trip_id: p.trip_id, google_place_id: p.google_place_id }))[0];
  if (!existing && !p.id) existing = (await store.select('places', { trip_id: p.trip_id, name: p.name }))[0];
  if (existing && existing.trip_id !== p.trip_id) throw new UsageError('place belongs to a different trip');

  if (!existing) {
    const [place] = await store.insert('places', p);
    return { action: 'inserted', place };
  }
  const { id, trip_id, ...patch } = p;
  if (patch.special_hours) patch.special_hours = mergeSpecialHours(existing.special_hours ?? [], patch.special_hours);
  if (patch.metadata) patch.metadata = { ...(existing.metadata ?? {}), ...patch.metadata };
  if (Object.keys(patch).length === 0) return { action: 'unchanged', place: existing };
  const [place] = await store.update('places', patch, { id: existing.id });
  return { action: 'updated', place };
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function normalizeValue(field, v) {
  if (v == null) return null;
  if (['fixed_start', 'fixed_end'].includes(field)) return Date.parse(v);
  if (['window_start', 'window_end'].includes(field)) return String(v).slice(0, 5);
  if (field === 'duration_minutes') return Number(v);
  return v;
}

/**
 * Insert a new card or patch an existing one.
 * - New cards start unscheduled (deck/drawer).
 * - day, position, swipe_status and confirmed are never written on an existing card.
 * - On a scheduled card (day set), schedule-impacting changes become a card_change_proposal
 *   instead of being applied; everything else is applied.
 */
export async function upsertCard(store, input, { reason = null, jobId = null } = {}) {
  if (!input?.id) {
    const c = parse(cardInsert, input, 'card');
    if (jobId && c.job_id === undefined) c.job_id = jobId;
    if (c.place_id) {
      const place = await one(store, 'places', { id: c.place_id }, 'place');
      if (place.trip_id !== c.trip_id) throw new UsageError('place belongs to a different trip');
    }
    const [card] = await store.insert('cards', c);
    return { action: 'inserted', card };
  }

  const patch = parse(cardPatch, input, 'card patch');
  const existing = await one(store, 'cards', { id: patch.id }, 'card');
  if (patch.trip_id && patch.trip_id !== existing.trip_id) throw new UsageError('card belongs to a different trip');
  const { id, trip_id, confirmed, job_id, ...fields } = patch;
  const ignored = [];
  if (confirmed !== undefined) ignored.push('confirmed (only the user confirms extracted bookings)');
  if (job_id !== undefined) ignored.push('job_id (kept from the job that created the card)');
  if (fields.is_fixed && !(fields.fixed_start ?? existing.fixed_start)) {
    throw new ValidationError('card patch', { issues: [{ path: ['fixed_start'], message: 'is_fixed requires fixed_start' }] });
  }

  const scheduled = existing.day != null;
  const proposed = {};
  if (scheduled) {
    for (const f of SCHEDULE_IMPACT_FIELDS) {
      if (fields[f] === undefined) continue;
      // Linking a place to a card that had none adds information; it does not change the plan.
      if (f === 'place_id' && existing.place_id == null) continue;
      if (normalizeValue(f, fields[f]) !== normalizeValue(f, existing[f])) proposed[f] = fields[f];
      delete fields[f];
    }
    if ('duration_minutes' in proposed && fields.duration_basis !== undefined) {
      proposed.duration_basis = fields.duration_basis;
      delete fields.duration_basis;
    }
  }

  let card = existing;
  if (Object.keys(fields).length) [card] = await store.update('cards', fields, { id });

  let proposal = null;
  if (Object.keys(proposed).length) {
    const why = reason ?? `Research update changes ${Object.keys(proposed).join(', ')}: ${
      Object.keys(proposed).filter((k) => k !== 'duration_basis')
        .map((k) => `${k} ${existing[k] ?? 'unset'} -> ${proposed[k] ?? 'unset'}`).join('; ')}`;
    proposal = (await addProposal(store, {
      trip_id: existing.trip_id, card_id: id, job_id: jobId, changes: proposed, reason: why,
    })).proposal;
  }
  return { action: Object.keys(fields).length ? 'updated' : 'unchanged', card, proposal, ignored };
}

export async function setCardState(store, id, state) {
  if (!RESEARCH_STATES.includes(state)) throw new UsageError(`research_state must be one of ${RESEARCH_STATES.join(', ')}`);
  const rows = await store.update('cards', { research_state: state }, { id });
  if (!rows.length) throw new UsageError(`card not found: ${id}`);
  return rows[0];
}

// ---------------------------------------------------------------------------
// Facts, holidays, travel, proposals, events
// ---------------------------------------------------------------------------

async function assertSameTrip(store, tripId, refs) {
  for (const [table, id] of refs) {
    if (!id) continue;
    const row = await one(store, table, { id }, table.replace(/s$/, ''));
    if (row.trip_id !== tripId) throw new UsageError(`${table} ${id} belongs to a different trip`);
  }
}

export async function addFacts(store, input) {
  const facts = asArray(input).map((f, i) => parse(factInput, f, `fact[${i}]`));
  const checked = new Set();
  for (const f of facts) {
    const key = `${f.trip_id}|${f.card_id}|${f.place_id}|${f.holiday_id}`;
    if (checked.has(key)) continue;
    checked.add(key);
    await assertSameTrip(store, f.trip_id, [['cards', f.card_id], ['places', f.place_id], ['holidays', f.holiday_id]]);
  }
  if (!facts.length) return [];
  return store.insert('facts', facts.map((f) => ({ retrieved_at: nowIso(), ...f })));
}

export async function addHolidays(store, input) {
  const out = [];
  for (const [i, raw] of asArray(input).entries()) {
    const { source, ...h } = parse(holidayInput, raw, `holiday[${i}]`);
    const [holiday] = await store.upsert('holidays', h, { onConflict: 'trip_id,date,name,level' });
    let fact = null;
    if (source) {
      [fact] = await addFacts(store, {
        trip_id: h.trip_id, holiday_id: holiday.id, field: 'date', value: h.date,
        evidence: source.evidence, source_type: source.source_type, url: source.url, title: source.title ?? null,
        applies_from: h.date, applies_to: h.date,
      });
    }
    out.push({ holiday, fact });
  }
  return out;
}

export async function setTravel(store, input) {
  const rows = asArray(input).map((t, i) => parse(travelInput, t, `travel[${i}]`));
  for (const t of rows) {
    const places = await store.select('places', { id: [t.from_place_id, t.to_place_id] });
    if (places.length !== 2 || places.some((p) => p.trip_id !== t.trip_id)) {
      throw new UsageError('travel places must exist and belong to the trip');
    }
  }
  if (!rows.length) return [];
  return store.upsert('travel_times', rows.map((r) => ({ ...r, computed_at: nowIso() })),
    { onConflict: 'from_place_id,to_place_id,mode' });
}

/** Compute missing walking estimates among places of accepted cards (or all non-rejected cards). */
export async function fillTravel(store, tripId, { includeSuggested = false } = {}) {
  const cards = await store.select('cards', { trip_id: tripId, place_id: { neq: null } });
  const wanted = cards.filter((c) => c.swipe_status === 'accepted' || (includeSuggested && c.swipe_status === 'suggested'));
  const placeIds = [...new Set(wanted.map((c) => c.place_id))];
  if (placeIds.length < 2) return { inserted: 0, skipped: [], pairs: [] };
  const places = await store.select('places', { id: placeIds });
  const existing = await store.select('travel_times', { trip_id: tripId, mode: 'walk' });
  const { rows, skipped } = missingWalkPairs(tripId, places, existing);
  const inserted = rows.length ? await setTravel(store, rows) : [];
  return {
    inserted: inserted.length,
    skipped,
    pairs: inserted.map((r) => ({ from: r.from_place_id, to: r.to_place_id, min: r.min_minutes, max: r.max_minutes })),
  };
}

export { estimateWalk };

export async function addProposal(store, input) {
  const p = parse(proposalInput, input, 'proposal');
  const card = await one(store, 'cards', { id: p.card_id }, 'card');
  if (card.trip_id !== p.trip_id) throw new UsageError('card belongs to a different trip');
  // Skip exact duplicates of a pending proposal.
  const pending = await store.select('card_change_proposals', { card_id: p.card_id, status: 'pending' });
  const canon = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, normalizeValue(k, o[k])]));
  const same = pending.find((x) => canon(x.changes) === canon(p.changes));
  if (same) return { action: 'duplicate', proposal: same };
  const [proposal] = await store.insert('card_change_proposals', p);
  return { action: 'inserted', proposal };
}

export async function logEvent(store, input) {
  const e = parse(eventInput, input, 'event');
  const [row] = await store.insert('agent_events', e);
  return row;
}

// ---------------------------------------------------------------------------
// Uploads (parse_upload)
// ---------------------------------------------------------------------------

const UPLOAD_STATUSES = ['uploaded', 'parsing', 'parsed', 'failed'];

/** Upload row; with outDir, downloads the file from the 'uploads' bucket and returns its local path. */
export async function getUpload(store, id, { outDir = null, writeFile = null } = {}) {
  const upload = await one(store, 'uploads', { id }, 'upload');
  if (!outDir) return { upload, local_path: null };
  if (!store.download) throw new UsageError('this store cannot download files');
  const buf = await store.download('uploads', upload.storage_path);
  const safe = upload.file_name.replace(/[^A-Za-z0-9._-]/g, '_');
  const localPath = `${outDir.replace(/[\\/]$/, '')}/${upload.id}-${safe}`;
  await writeFile(localPath, buf);
  return { upload, local_path: localPath, bytes: buf.length };
}

export async function setUpload(store, id, { status, parsed } = {}) {
  if (status && !UPLOAD_STATUSES.includes(status)) throw new UsageError(`status must be one of ${UPLOAD_STATUSES.join(', ')}`);
  const patch = {};
  if (status) patch.status = status;
  if (parsed !== undefined) {
    if (parsed === null || typeof parsed !== 'object') throw new UsageError('parsed must be a JSON object or array');
    patch.parsed = parsed;
    if (!status) patch.status = 'parsed';
  }
  if (!Object.keys(patch).length) throw new UsageError('nothing to update');
  const rows = await store.update('uploads', patch, { id });
  if (!rows.length) throw new UsageError(`upload not found: ${id}`);
  return rows[0];
}

// ---------------------------------------------------------------------------
// Ingest: place + card + facts in one call (fewest tool calls per researched card)
// ---------------------------------------------------------------------------

export async function ingest(store, input, { reason = null } = {}) {
  const inp = parse(ingestInput, input, 'ingest payload');
  const tripId = inp.trip_id;
  const jobId = inp.job_id ?? null;
  const result = { place: null, card: null, facts: 0, proposal: null, ignored: [] };

  if (inp.place) {
    const r = await upsertPlace(store, { ...inp.place, trip_id: tripId });
    result.place = { action: r.action, id: r.place.id, name: r.place.name };
  }
  let cardId = null;
  let placeId = result.place?.id ?? null;
  if (inp.card) {
    const c = { ...inp.card, trip_id: tripId };
    if (placeId && c.place_id === undefined) c.place_id = placeId;
    const r = await upsertCard(store, c, { reason, jobId });
    cardId = r.card.id;
    placeId = placeId ?? r.card.place_id ?? null;
    result.card = { action: r.action, id: r.card.id, title: r.card.title, research_state: r.card.research_state };
    result.proposal = r.proposal ? { id: r.proposal.id, changes: r.proposal.changes } : null;
    result.ignored = r.ignored ?? [];
  }
  if (inp.facts?.length) {
    const facts = inp.facts.map((f) => {
      const { target, ...rest } = f;
      const out = { trip_id: tripId, ...rest };
      if (out.card_id || out.place_id || out.holiday_id) return out;
      const toPlace = target === 'place' || (target !== 'card' && PLACE_FIELDS.has(out.field) && placeId);
      if (toPlace) {
        if (!placeId) throw new UsageError(`fact ${out.field}: target place but no place in payload`);
        out.place_id = placeId;
      } else {
        if (!cardId) throw new UsageError(`fact ${out.field}: no card in payload; set card_id, place_id or holiday_id`);
        out.card_id = cardId;
      }
      return out;
    });
    result.facts = (await addFacts(store, facts)).length;
  }
  return result;
}
