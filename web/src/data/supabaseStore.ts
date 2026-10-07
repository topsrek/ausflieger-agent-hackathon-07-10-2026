// TripStore backed by Supabase (Postgres + Realtime + Storage). Writes are optimistic: local state changes
// immediately, the row is written in the background, and the realtime echo is merged idempotently.
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { Card, CardChangeProposal, Preferences, ResearchJob, Trip } from '@shared/types';
import {
  TIME_KEYS, applyChange, byId, defaultPreferences, normaliseTimes, removeBy, upsertBy,
  type NewJobInput, type NewTripInput, type Placement, type TableName, type TripSession, type TripState, type TripStore,
} from './store';
import { SessionBase, jobInputFrom, makeCard, makeJob } from './base';
import { nowIso, uuid } from '../lib/ids';
import { toast } from '../lib/toast';

/** Prepared Munich demo trip (data/demo/munich.json). Overridable via DEMO_TRIP_ID / VITE_DEMO_TRIP_ID. */
export const DEFAULT_DEMO_TRIP_ID = '2027a10d-0203-4000-8000-00000000c0de';

const REALTIME_TABLES: TableName[] = [
  'cards', 'places', 'facts', 'travel_times', 'research_jobs', 'card_change_proposals', 'agent_events',
];

/** Card columns the client may write (excludes server-managed timestamps). */
const CARD_WRITE_KEYS: (keyof Card)[] = [
  'id', 'trip_id', 'place_id', 'job_id', 'upload_id', 'type', 'title', 'summary', 'image_url', 'swipe_status',
  'research_state', 'constraint_kind', 'is_fixed', 'confirmed', 'fixed_start', 'fixed_end', 'duration_minutes',
  'duration_basis', 'window_start', 'window_end', 'reservation_required', 'reservation_note', 'price_text',
  'price_amount', 'currency', 'day', 'position', 'metadata',
];

function pick<T extends object>(obj: Partial<T>, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

function norm<T>(table: TableName, row: unknown): T {
  const keys = TIME_KEYS[table];
  return (keys ? normaliseTimes(row as Record<string, unknown>, keys) : row) as T;
}

export class SupabaseStore implements TripStore {
  readonly mode = 'supabase' as const;
  readonly label = 'Live agent';
  readonly client: SupabaseClient;
  private sessions = new Map<string, { session: SupabaseSession; refs: number }>();

  constructor(url: string, anonKey: string, private demoTripId: string) {
    this.client = createClient(url, anonKey, { auth: { persistSession: false } });
  }

  async createTrip(input: NewTripInput): Promise<string> {
    const { data, error } = await this.client.from('trips').insert({
      title: input.title ?? null, city: input.city, region: input.region ?? null,
      country_code: input.country_code ?? 'DE', timezone: input.timezone ?? 'Europe/Berlin',
      start_date: input.start_date, end_date: input.end_date,
    }).select('id').single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    const prefs = defaultPreferences(id);
    const { updated_at: _u, ...insert } = prefs;
    void _u;
    const { error: e2 } = await this.client.from('preferences').insert(insert);
    if (e2) console.warn('preferences insert failed', e2.message);
    return id;
  }

  async openDemo(name: string): Promise<string> {
    let demoId = this.demoTripId || (name === 'munich' || !name ? DEFAULT_DEMO_TRIP_ID : '');
    if (!demoId) {
      const { data, error } = await this.client.from('trips').select('id').eq('is_demo', true)
        .ilike('city', `%${name || 'munich'}%`).order('created_at', { ascending: false }).limit(1);
      if (error) throw new Error(error.message);
      demoId = (data as { id: string }[])[0]?.id;
      if (!demoId) throw new Error('No demo trip found in Supabase. Load data/demo first.');
    }
    const { data, error } = await this.client.rpc('clone_trip', { source_trip_id: demoId });
    if (error) throw new Error(error.message);
    return data as string;
  }

  openTrip(tripId: string): TripSession {
    const existing = this.sessions.get(tripId);
    if (existing) {
      existing.refs += 1;
      return existing.session;
    }
    const session = new SupabaseSession(tripId, this.client, () => {
      const e = this.sessions.get(tripId);
      if (!e) return;
      e.refs -= 1;
      if (e.refs <= 0) {
        this.sessions.delete(tripId);
        session.dispose();
      }
    });
    this.sessions.set(tripId, { session, refs: 1 });
    return session;
  }
}

class SupabaseSession extends SessionBase implements TripSession {
  private channel: RealtimeChannel | null = null;
  private pending: { table: TableName; type: 'INSERT' | 'UPDATE' | 'DELETE'; row: Record<string, unknown> }[] = [];
  private poll: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(tripId: string, private db: SupabaseClient, private onClose: () => void) {
    super(tripId);
    this.subscribeRealtime();
    void this.load();
    // holidays, uploads and trips are not in the realtime publication: poll them while jobs are running.
    this.poll = setInterval(() => {
      const s = this.state;
      if (s && s.jobs.some((j) => j.status === 'queued' || j.status === 'running')) void this.refreshNonRealtime();
    }, 4000);
  }

  close(): void {
    this.onClose();
  }

  dispose(): void {
    this.disposed = true;
    if (this.poll) clearInterval(this.poll);
    if (this.channel) void this.db.removeChannel(this.channel);
  }

  private async load(): Promise<void> {
    const id = this.tripId;
    const q = (table: string) => this.db.from(table).select('*').eq('trip_id', id);
    try {
      const [trip, prefs, places, cards, holidays, facts, travel, uploads, jobs, proposals, events] = await Promise.all([
        this.db.from('trips').select('*').eq('id', id).maybeSingle(),
        this.db.from('preferences').select('*').eq('trip_id', id).maybeSingle(),
        q('places'), q('cards'), q('holidays'), q('facts'), q('travel_times'), q('uploads'),
        this.db.from('research_jobs').select('*').eq('trip_id', id).order('created_at', { ascending: true }),
        this.db.from('card_change_proposals').select('*').eq('trip_id', id),
        this.db.from('agent_events').select('*').eq('trip_id', id).order('id', { ascending: false }).limit(60),
      ]);
      const firstError = [trip, prefs, places, cards, holidays, facts, travel, uploads, jobs, proposals, events].find((r) => r.error)?.error;
      if (firstError) throw new Error(firstError.message);
      if (!trip.data) {
        this.setStatus({ kind: 'error', message: 'Trip not found.' });
        return;
      }
      let state: TripState = {
        trip: trip.data as Trip,
        preferences: prefs.data ? norm<Preferences>('preferences', prefs.data) : null,
        places: (places.data ?? []) as TripState['places'],
        cards: ((cards.data ?? []) as unknown[]).map((r) => norm<Card>('cards', r)),
        holidays: (holidays.data ?? []) as TripState['holidays'],
        facts: (facts.data ?? []) as TripState['facts'],
        travel_times: (travel.data ?? []) as TripState['travel_times'],
        uploads: (uploads.data ?? []) as TripState['uploads'],
        jobs: ((jobs.data ?? []) as unknown[]).map((r) => norm<ResearchJob>('research_jobs', r)),
        proposals: (proposals.data ?? []) as CardChangeProposal[],
        events: ((events.data ?? []) as TripState['events']).slice().reverse(),
      };
      for (const p of this.pending) state = applyChange(state, p.table, p.type, p.row);
      this.pending = [];
      this.state = state;
      this.setStatus({ kind: 'ready' });
    } catch (err) {
      this.setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  private async refreshNonRealtime(): Promise<void> {
    const id = this.tripId;
    const [holidays, uploads] = await Promise.all([
      this.db.from('holidays').select('*').eq('trip_id', id),
      this.db.from('uploads').select('*').eq('trip_id', id),
    ]);
    if (this.disposed || !this.state) return;
    this.setState((s) => ({
      ...s,
      holidays: holidays.data ? (holidays.data as TripState['holidays']) : s.holidays,
      uploads: uploads.data ? (uploads.data as TripState['uploads']) : s.uploads,
    }));
  }

  private subscribeRealtime(): void {
    let ch = this.db.channel(`trip-${this.tripId}`);
    for (const table of REALTIME_TABLES) {
      ch = ch.on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table, filter: `trip_id=eq.${this.tripId}` },
        (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const row = payload.eventType === 'DELETE' ? payload.old : norm<Record<string, unknown>>(table, payload.new);
          if (!this.state) {
            this.pending.push({ table, type: payload.eventType, row });
            return;
          }
          this.setState((s) => applyChange(s, table, payload.eventType, row));
        },
      );
    }
    this.channel = ch.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('Realtime channel', status);
    });
  }

  private fail(what: string, error: { message: string } | null): void {
    if (!error) return;
    console.error(what, error.message);
    toast(`Couldn't save: ${what}`, { tone: 'error', detail: error.message });
    void this.load();
  }

  private s(): TripState {
    if (!this.state) throw new Error('Trip not loaded');
    return this.state;
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  async updateTrip(patch: Parameters<TripSession['updateTrip']>[0]): Promise<void> {
    this.setState((s) => ({ ...s, trip: { ...s.trip, ...patch } }));
    const { error } = await this.db.from('trips').update(patch).eq('id', this.tripId);
    this.fail('trip', error);
  }

  async savePreferences(patch: Parameters<TripSession['savePreferences']>[0]): Promise<void> {
    const merged = { ...(this.state?.preferences ?? defaultPreferences(this.tripId)), ...patch, trip_id: this.tripId };
    this.setState((s) => ({ ...s, preferences: merged }));
    const { updated_at: _u, ...row } = merged;
    void _u;
    const { error } = await this.db.from('preferences').upsert(row, { onConflict: 'trip_id' });
    this.fail('preferences', error);
  }

  async swipe(cardId: string, status: Card['swipe_status']): Promise<void> {
    const card = this.s().cards.find((c) => c.id === cardId);
    const patch: Partial<Card> = { swipe_status: status };
    if (status !== 'accepted') Object.assign(patch, { day: null, position: null });
    await this.updateCard(cardId, patch);
    if (status === 'accepted' && card?.research_state === 'pending') {
      await this.createJob({ kind: 'research_card', card_id: cardId });
    }
  }

  async updateCard(cardId: string, patch: Partial<Card>): Promise<void> {
    this.setState((s) => ({ ...s, cards: s.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)) }));
    const { error } = await this.db.from('cards').update(pick<Card>(patch, CARD_WRITE_KEYS)).eq('id', cardId);
    this.fail('card', error);
  }

  async createCard(input: Partial<Card> & Pick<Card, 'type' | 'title'>): Promise<string> {
    const card = makeCard(this.tripId, input);
    this.setState((s) => ({ ...s, cards: upsertBy(s.cards, card, byId) }));
    const { error } = await this.db.from('cards').insert(pick<Card>(card, CARD_WRITE_KEYS));
    this.fail('new card', error);
    return card.id;
  }

  async deleteCard(cardId: string): Promise<void> {
    this.setState((s) => ({ ...s, cards: removeBy(s.cards, cardId, byId) }));
    const { error } = await this.db.from('cards').delete().eq('id', cardId);
    this.fail('delete card', error);
  }

  async setPlacements(placements: Placement[]): Promise<void> {
    const map = new Map(placements.map((p) => [p.id, p]));
    this.setState((s) => ({
      ...s, cards: s.cards.map((c) => { const p = map.get(c.id); return p ? { ...c, day: p.day, position: p.position } : c; }),
    }));
    // One update per card (anon has no bulk upsert without all not-null columns).
    const results = await Promise.all(placements.map((p) =>
      this.db.from('cards').update({ day: p.day, position: p.position }).eq('id', p.id)));
    this.fail('schedule order', results.find((r) => r.error)?.error ?? null);
  }

  async addBuffer(day: string, position: number, minutes: number): Promise<string> {
    const dayCards = this.s().cards.filter((c) => c.day === day && c.swipe_status === 'accepted')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const shifted = dayCards.filter((c) => (c.position ?? 0) >= position).map((c) => ({ id: c.id, day, position: (c.position ?? 0) + 1 }));
    await this.setPlacements(shifted);
    return this.createCard({
      type: 'buffer', title: 'Buffer', duration_minutes: minutes, duration_basis: 'Added by you',
      constraint_kind: 'preference', day, position,
    });
  }

  async createJob(input: NewJobInput): Promise<string> {
    const job = makeJob(this.tripId, input);
    this.setState((s) => ({ ...s, jobs: upsertBy(s.jobs, job, byId) }));
    const { error } = await this.db.from('research_jobs').insert({
      id: job.id, trip_id: job.trip_id, kind: job.kind, query: job.query, window_day: job.window_day,
      window_start: job.window_start, window_end: job.window_end, card_id: job.card_id, upload_id: job.upload_id,
    });
    if (error) {
      this.setState((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === job.id ? { ...j, status: 'failed', error: error.message } : j)) }));
      this.fail('search request', error);
    }
    return job.id;
  }

  async retryJob(jobId: string): Promise<string> {
    const job = this.s().jobs.find((j) => j.id === jobId);
    if (!job) throw new Error('Job not found');
    return this.createJob(jobInputFrom(job));
  }

  async uploadFile(file: File): Promise<void> {
    const id = uuid();
    const safe = file.name.replace(/[^\w.-]+/g, '_');
    const path = `${this.tripId}/${id}-${safe}`;
    const { error: upErr } = await this.db.storage.from('uploads').upload(path, file, { contentType: file.type || undefined });
    if (upErr) {
      toast('Upload failed', { tone: 'error', detail: upErr.message });
      throw new Error(upErr.message);
    }
    const row = { id, trip_id: this.tripId, storage_path: path, file_name: file.name, mime_type: file.type || null };
    const { error } = await this.db.from('uploads').insert(row);
    if (error) {
      this.fail('upload', error);
      return;
    }
    this.setState((s) => ({ ...s, uploads: upsertBy(s.uploads, { ...row, status: 'uploaded', parsed: null, created_at: nowIso() }, byId) }));
    await this.createJob({ kind: 'parse_upload', upload_id: id });
  }

  async resolveProposal(proposalId: string, accept: boolean): Promise<void> {
    const p = this.s().proposals.find((x) => x.id === proposalId);
    if (!p) return;
    if (accept) await this.updateCard(p.card_id, p.changes);
    const resolved_at = nowIso();
    const status = accept ? 'accepted' : 'rejected';
    this.setState((s) => ({ ...s, proposals: s.proposals.map((x) => (x.id === proposalId ? { ...x, status, resolved_at } : x)) }));
    const { error } = await this.db.from('card_change_proposals').update({ status, resolved_at }).eq('id', proposalId);
    this.fail('proposal', error);
  }
}
