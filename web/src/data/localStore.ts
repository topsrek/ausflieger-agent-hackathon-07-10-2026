// In-memory TripStore with a simulated research agent. Used when no Supabase config is present.
// Persists to localStorage (best effort) so a reload keeps the trip.
import type {
  AgentEvent, Card, CardChangeProposal, EventLevel, Place, ResearchJob, TravelTime, TripBundle, Upload,
} from '@shared/types';
import {
  byId, defaultPreferences, emptyState, removeBy, upsertBy,
  type NewJobInput, type NewTripInput, type Placement, type TripSession, type TripState, type TripStore,
} from './store';
import { SessionBase, jobInputFrom, makeCard, makeJob } from './base';
import { devFixture, proposalTemplates } from '../fixtures/munich-dev';
import { nowIso, uuid } from '../lib/ids';
import { formatDateRange } from '../lib/time';

const STORAGE_KEY = 'ausflieger.local.v1';
const STREAM_MS = 1500;

/** Material the simulated agent can "find" for a trip. */
interface Seed {
  bundle: TripBundle;
  /** Cards held back and streamed in by search jobs, in order. */
  queue: Card[];
  /** How many cards the initial search streams. */
  initialCount: number;
  allPlaces: Place[];
  allTravelTimes: TravelTime[];
  uploadCards: Card[];
}

interface Persisted {
  state: TripState;
  queue: Card[];
}

// Prepared demo bundles produced by data/ (optional). Lazy so a missing file never breaks the build.
const demoFiles = import.meta.glob('../../../data/demo/*.json', { import: 'default' });

async function loadDemoBundle(name: string): Promise<TripBundle | null> {
  const key = Object.keys(demoFiles).find((k) => k.endsWith(`/${name}.json`));
  if (!key) return null;
  try {
    return (await demoFiles[key]()) as TripBundle;
  } catch (err) {
    console.warn('Could not load demo bundle', name, err);
    return null;
  }
}

export function availableDemoFiles(): string[] {
  return Object.keys(demoFiles).map((k) => k.split('/').pop()!.replace(/\.json$/, ''));
}

function devSeed(): Seed {
  const f = devFixture;
  const bundle = structuredClone(f.bundle);
  const ids = new Set(bundle.places.map((p) => p.id));
  bundle.travel_times = f.allTravelTimes.filter((t) => ids.has(t.from_place_id) && ids.has(t.to_place_id));
  return {
    bundle,
    queue: structuredClone([...f.suggestionPool, ...f.searchAgainPool]),
    initialCount: f.suggestionPool.length,
    allPlaces: f.allPlaces,
    allTravelTimes: f.allTravelTimes,
    uploadCards: f.uploadCards,
  };
}

function jsonSeed(b: TripBundle): Seed {
  const bundle = structuredClone(b);
  const held = bundle.cards.filter((c) => c.swipe_status === 'suggested' && c.day == null);
  bundle.cards = bundle.cards.filter((c) => !held.includes(c));
  return {
    bundle,
    queue: held,
    initialCount: Math.max(1, Math.ceil(held.length * 0.75)),
    allPlaces: bundle.places,
    allTravelTimes: bundle.travel_times,
    uploadCards: devFixture.uploadCards.filter((c) => bundle.places.some((p) => p.id === c.place_id)),
  };
}

/** Rewrite trip_id on everything so a seed can be instantiated many times. */
function retarget<T extends { trip_id: string }>(list: T[], tripId: string): T[] {
  return list.map((x) => ({ ...x, trip_id: tripId }));
}

export class LocalStore implements TripStore {
  readonly mode = 'local' as const;
  readonly label = 'Simulated agent (offline)';
  private sessions = new Map<string, LocalSession>();
  private persisted: Record<string, Persisted> = {};
  private seeds = new Map<string, Seed>();

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.persisted = JSON.parse(raw) as Record<string, Persisted>;
    } catch {
      this.persisted = {};
    }
  }

  persist(id: string, data: Persisted): void {
    this.persisted[id] = data;
    try {
      // Keep the five most recent trips.
      const entries = Object.entries(this.persisted)
        .sort((a, b) => (b[1].state.trip.updated_at > a[1].state.trip.updated_at ? 1 : -1))
        .slice(0, 5);
      this.persisted = Object.fromEntries(entries);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.persisted));
    } catch {
      /* storage unavailable: in-memory only */
    }
  }

  private seedFor(tripId: string): Seed {
    return this.seeds.get(tripId) ?? devSeed();
  }

  async createTrip(input: NewTripInput): Promise<string> {
    const id = `local-${uuid().slice(0, 8)}`;
    const seed = devSeed();
    const now = nowIso();
    const state = emptyState({
      ...seed.bundle.trip, id, title: input.title ?? null, city: input.city, start_date: input.start_date,
      end_date: input.end_date, region: input.region ?? seed.bundle.trip.region,
      country_code: input.country_code ?? 'DE', timezone: input.timezone ?? 'Europe/Berlin',
      step: 'preferences', is_demo: false, cloned_from: null, created_at: now, updated_at: now,
    });
    state.preferences = defaultPreferences(id);
    // A fresh trip still uses the Munich material for simulated research.
    state.holidays = retarget(seed.bundle.holidays, id);
    state.facts = retarget(seed.bundle.facts, id);
    this.seeds.set(id, seed);
    this.persist(id, { state, queue: retarget(seed.queue, id) });
    return id;
  }

  async openDemo(name: string): Promise<string> {
    const json = name ? await loadDemoBundle(name) : null;
    const seed = json ? jsonSeed(json) : devSeed();
    const id = `local-${uuid().slice(0, 8)}`;
    const b = seed.bundle;
    const now = nowIso();
    const state: TripState = {
      trip: { ...b.trip, id, is_demo: false, cloned_from: b.trip.id, created_at: now, updated_at: now },
      preferences: b.preferences ? { ...b.preferences, trip_id: id } : defaultPreferences(id),
      places: retarget(b.places, id),
      cards: retarget(b.cards, id),
      holidays: retarget(b.holidays, id),
      facts: retarget(b.facts, id),
      travel_times: retarget(b.travel_times, id),
      uploads: retarget(((b as unknown as { uploads?: TripState['uploads'] }).uploads ?? []), id),
      jobs: [], proposals: [],
      events: retarget(((b as unknown as { agent_events?: TripState['events'] }).agent_events ?? []), id),
    };
    this.seeds.set(id, seed);
    this.persist(id, { state, queue: retarget(seed.queue, id) });
    return id;
  }

  openTrip(tripId: string): TripSession {
    let s = this.sessions.get(tripId);
    if (!s) {
      s = new LocalSession(tripId, this, this.persisted[tripId] ?? null, this.seedFor(tripId));
      this.sessions.set(tripId, s);
    }
    return s;
  }
}

class LocalSession extends SessionBase implements TripSession {
  private queue: Card[];
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private eventN = 0;
  private autoRefreshScheduled = false;

  constructor(tripId: string, private store: LocalStore, data: Persisted | null, private seed: Seed) {
    super(tripId);
    this.queue = data?.queue ?? [];
    if (data) {
      this.state = data.state;
      this.status = { kind: 'ready' };
      this.eventN = data.state.events.reduce((m, e) => Math.max(m, e.id), 0);
      // Jobs interrupted by a reload are marked failed so the user can retry.
      if (data.state.jobs.some((j) => j.status === 'running' || j.status === 'queued')) {
        this.state = {
          ...data.state,
          jobs: data.state.jobs.map((j) => (j.status === 'running' || j.status === 'queued'
            ? { ...j, status: 'failed', error: 'Interrupted by page reload', finished_at: nowIso() } : j)),
        };
      }
    } else {
      this.status = { kind: 'error', message: 'This trip does not exist in this browser. Local trips live only in this browser.' };
    }
  }

  close(): void {
    /* sessions live as long as the page; timers keep running across screens */
  }

  protected override setState(next: TripState | ((s: TripState) => TripState)): void {
    super.setState(next);
    if (this.state) this.store.persist(this.tripId, { state: this.state, queue: this.queue });
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private s(): TripState {
    if (!this.state) throw new Error('Trip not loaded');
    return this.state;
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  async updateTrip(patch: Parameters<TripSession['updateTrip']>[0]): Promise<void> {
    const prevStep = this.s().trip.step;
    this.setState((s) => ({ ...s, trip: { ...s.trip, ...patch, updated_at: nowIso() } }));
    if (patch.step === 'scheduling' && prevStep !== 'scheduling') this.scheduleAutoRefresh();
  }

  async savePreferences(patch: Parameters<TripSession['savePreferences']>[0]): Promise<void> {
    this.setState((s) => ({
      ...s, preferences: { ...(s.preferences ?? defaultPreferences(s.trip.id)), ...patch, updated_at: nowIso() },
    }));
  }

  async swipe(cardId: string, status: Card['swipe_status']): Promise<void> {
    const card = this.s().cards.find((c) => c.id === cardId);
    if (!card) return;
    const patch: Partial<Card> = { swipe_status: status };
    if (status !== 'accepted') Object.assign(patch, { day: null, position: null });
    this.patchCard(cardId, patch);
    if (status === 'accepted' && card.research_state === 'pending') {
      await this.createJob({ kind: 'research_card', card_id: cardId });
    }
  }

  async updateCard(cardId: string, patch: Partial<Card>): Promise<void> {
    this.patchCard(cardId, patch);
  }

  async createCard(input: Partial<Card> & Pick<Card, 'type' | 'title'>): Promise<string> {
    const c = makeCard(this.tripId, input);
    this.setState((s) => ({ ...s, cards: [...s.cards, c] }));
    return c.id;
  }

  async deleteCard(cardId: string): Promise<void> {
    this.setState((s) => ({ ...s, cards: removeBy(s.cards, cardId, byId) }));
  }

  async setPlacements(placements: Placement[]): Promise<void> {
    const map = new Map(placements.map((p) => [p.id, p]));
    const now = nowIso();
    this.setState((s) => ({
      ...s,
      cards: s.cards.map((c) => {
        const p = map.get(c.id);
        return p ? { ...c, day: p.day, position: p.position, updated_at: now } : c;
      }),
    }));
  }

  async addBuffer(day: string, position: number, minutes: number): Promise<string> {
    const s = this.s();
    const dayCards = s.cards.filter((c) => c.day === day).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const id = await this.createCard({
      type: 'buffer', title: 'Buffer', duration_minutes: minutes, duration_basis: 'Added by you',
      constraint_kind: 'preference', day, position,
    });
    // Shift following cards.
    await this.setPlacements(dayCards.filter((c) => (c.position ?? 0) >= position).map((c) => ({ id: c.id, day, position: (c.position ?? 0) + 1 })));
    return id;
  }

  async createJob(input: NewJobInput): Promise<string> {
    const job = makeJob(this.tripId, input);
    this.setState((s) => ({ ...s, jobs: [...s.jobs, job] }));
    this.runJob(job);
    return job.id;
  }

  async retryJob(jobId: string): Promise<string> {
    const job = this.s().jobs.find((j) => j.id === jobId);
    if (!job) throw new Error('Job not found');
    return this.createJob(jobInputFrom(job));
  }

  async uploadFile(file: File): Promise<void> {
    const upload: Upload = {
      id: uuid(), trip_id: this.tripId, storage_path: `${this.tripId}/${file.name}`, file_name: file.name,
      mime_type: file.type || null, status: 'uploaded', parsed: null, created_at: nowIso(),
    };
    this.setState((s) => ({ ...s, uploads: [...s.uploads, upload] }));
    await this.createJob({ kind: 'parse_upload', upload_id: upload.id });
  }

  async resolveProposal(proposalId: string, accept: boolean): Promise<void> {
    const p = this.s().proposals.find((x) => x.id === proposalId);
    if (!p) return;
    if (accept) this.patchCard(p.card_id, p.changes);
    this.setState((s) => ({
      ...s,
      proposals: s.proposals.map((x) => (x.id === proposalId ? { ...x, status: accept ? 'accepted' : 'rejected', resolved_at: nowIso() } : x)),
    }));
  }

  private patchCard(cardId: string, patch: Partial<Card>): void {
    const now = nowIso();
    this.setState((s) => ({ ...s, cards: s.cards.map((c) => (c.id === cardId ? { ...c, ...patch, updated_at: now } : c)) }));
  }

  // -------------------------------------------------------------------------
  // Simulated agent
  // -------------------------------------------------------------------------

  private event(job: ResearchJob | null, message: string, level: EventLevel = 'progress', cardId: string | null = null): void {
    const e: AgentEvent = {
      id: ++this.eventN, trip_id: this.tripId, job_id: job?.id ?? null, card_id: cardId, level, message, data: null, created_at: nowIso(),
    };
    this.setState((s) => {
      const events = [...s.events, e];
      return { ...s, events: events.length > 200 ? events.slice(-200) : events };
    });
  }

  private patchJob(jobId: string, patch: Partial<ResearchJob>): void {
    this.setState((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, ...patch } : j)) }));
  }

  private addCardWithContext(card: Card, jobId: string): void {
    const s = this.s();
    let places = s.places;
    const place = this.seed.allPlaces.find((p) => p.id === card.place_id);
    if (place && !places.some((p) => p.id === place.id)) places = [...places, { ...place, trip_id: this.tripId }];
    const ids = new Set(places.map((p) => p.id));
    let travel = s.travel_times;
    for (const t of this.seed.allTravelTimes) {
      if (ids.has(t.from_place_id) && ids.has(t.to_place_id) && (t.from_place_id === card.place_id || t.to_place_id === card.place_id)) {
        travel = upsertBy(travel, { ...t, trip_id: this.tripId }, (x) => `${x.from_place_id}|${x.to_place_id}|${x.mode}`);
      }
    }
    const now = nowIso();
    const c: Card = { ...card, trip_id: this.tripId, job_id: jobId, swipe_status: 'suggested', day: null, position: null, created_at: now, updated_at: now };
    this.setState((st) => ({ ...st, places, travel_times: travel, cards: upsertBy(st.cards, c, byId) }));
  }

  private takeFromQueue(n: number, query: string | null): Card[] {
    const q = (query ?? '').toLowerCase();
    const wantTag = /indoor|museum|rain/.test(q) ? 'indoor' : /cheap|budget|cheaper/.test(q) ? 'cheap' : null;
    const existing = new Set(this.s().cards.map((c) => c.id));
    const available = this.queue.filter((c) => !existing.has(c.id));
    const tagged = wantTag ? available.filter((c) => ((c.metadata?.tags as string[] | undefined) ?? []).includes(wantTag)) : [];
    const picked = [...tagged, ...available.filter((c) => !tagged.includes(c))].slice(0, n);
    this.queue = this.queue.filter((c) => !picked.includes(c));
    return picked;
  }

  private runJob(job: ResearchJob): void {
    const s = this.s();
    this.later(350, () => this.patchJob(job.id, { status: 'running', started_at: nowIso() }));
    switch (job.kind) {
      case 'initial_suggestions':
      case 'search_again': {
        const initial = job.kind === 'initial_suggestions';
        const cards = this.takeFromQueue(initial ? this.seed.initialCount : 3, job.query);
        const city = s.trip.city;
        const intro: string[] = initial
          ? [
            `Checking public holidays for ${city}, ${formatDateRange(s.trip.start_date, s.trip.end_date)}`,
            s.holidays.length ? `${s.holidays[0].name} on ${s.holidays[0].date.slice(8)}.${s.holidays[0].date.slice(5, 7)}. – will check venue-specific hours` : 'No public holidays found',
            'Scanning event calendars: muenchen.de, oktoberfest.de',
          ]
          : [
            job.window_day
              ? `Searching for “${job.query || 'more ideas'}” that fits ${job.window_day.slice(8)}.${job.window_day.slice(5, 7)}. ${job.window_start}–${job.window_end}`
              : `Searching for “${job.query || 'more alternatives'}”`,
          ];
        let t = 500;
        for (const msg of intro) {
          this.later(t, () => this.event(job, msg));
          t += 900;
        }
        cards.forEach((c) => {
          this.later(t, () => this.event(job, `Checking opening hours and sources: ${c.title}`, 'progress', c.id));
          this.later(t + 700, () => {
            this.addCardWithContext(c, job.id);
            this.event(job, `New suggestion: ${c.title}`, 'info', c.id);
          });
          t += STREAM_MS;
        });
        this.later(t + 400, () => {
          this.patchJob(job.id, { status: 'done', finished_at: nowIso() });
          this.event(job, cards.length
            ? `Done: ${cards.length} suggestion${cards.length === 1 ? '' : 's'} found`
            : 'No further results in the offline demo data', cards.length ? 'info' : 'warning');
        });
        break;
      }
      case 'research_card':
      case 'refresh_card': {
        const card = s.cards.find((c) => c.id === job.card_id);
        if (!card) {
          this.later(600, () => this.patchJob(job.id, { status: 'failed', error: 'Card not found', finished_at: nowIso() }));
          break;
        }
        const refresh = job.kind === 'refresh_card';
        if (!refresh) this.later(400, () => this.patchCard(card.id, { research_state: 'researching' }));
        this.later(700, () => this.event(job, `${refresh ? 'Re-checking' : 'Researching'} ${card.title}: hours, holiday exceptions, last entry`, 'progress', card.id));
        const fail = !refresh && card.metadata?.simulateResearchFailure === true && !card.metadata?.failedOnce;
        this.later(2600 + Math.random() * 1200, () => {
          if (fail) {
            this.patchCard(card.id, { research_state: 'failed', metadata: { ...card.metadata, failedOnce: true } });
            this.patchJob(job.id, { status: 'failed', error: 'Venue website timed out', finished_at: nowIso() });
            this.event(job, `Research failed for ${card.title}: venue website timed out`, 'error', card.id);
            return;
          }
          if (refresh) {
            const tpl = proposalTemplates[card.id];
            const current = this.s().cards.find((c) => c.id === card.id);
            if (tpl && current?.day && !this.s().proposals.some((p) => p.card_id === card.id && p.status === 'pending')) {
              const p: CardChangeProposal = {
                id: uuid(), trip_id: this.tripId, card_id: card.id, job_id: job.id, changes: tpl.changes, reason: tpl.reason,
                status: 'pending', created_at: nowIso(), resolved_at: null,
              };
              this.setState((st) => ({ ...st, proposals: [...st.proposals, p] }));
              this.event(job, `Change found for ${card.title} – review the impact before applying`, 'warning', card.id);
            } else {
              this.event(job, `No changes for ${card.title}`, 'info', card.id);
            }
          } else {
            const hasConflict = this.s().facts.some((f) => f.evidence === 'conflicting' && (f.card_id === card.id || f.place_id === card.place_id));
            this.patchCard(card.id, { research_state: hasConflict ? 'needs_checking' : 'ready' });
            this.event(job, `${card.title} is ready${hasConflict ? ' – sources disagree, marked needs checking' : ''}`, 'info', card.id);
          }
          this.patchJob(job.id, { status: 'done', finished_at: nowIso() });
        });
        break;
      }
      case 'parse_upload': {
        const upload = s.uploads.find((u) => u.id === job.upload_id);
        this.later(500, () => {
          if (upload) this.setState((st) => ({ ...st, uploads: st.uploads.map((u) => (u.id === upload.id ? { ...u, status: 'parsing' } : u)) }));
          this.event(job, `Reading ${upload?.file_name ?? 'upload'}`);
        });
        this.later(1600, () => this.event(job, 'Found a hotel booking: Hotel Torbräu, 02.–03.10.2027'));
        this.later(2800, () => {
          const hotel = this.seed.allPlaces.find((p) => p.id === this.seed.uploadCards[0]?.place_id);
          if (hotel && !this.s().places.some((p) => p.id === hotel.id)) {
            this.setState((st) => ({ ...st, places: [...st.places, { ...hotel, trip_id: this.tripId }] }));
          }
          const [start, end] = [this.s().trip.start_date, this.s().trip.end_date];
          const preferredDays = [start, end, end];
          const now = nowIso();
          const cards = this.seed.uploadCards.map((c, i) => ({
            ...c, id: `${c.id}-${(upload?.id ?? uuid()).slice(0, 6)}`, trip_id: this.tripId, upload_id: upload?.id ?? null,
            job_id: job.id, metadata: { ...c.metadata, preferred_day: preferredDays[i] ?? start }, created_at: now, updated_at: now,
          }));
          this.setState((st) => ({
            ...st,
            cards: [...st.cards, ...cards],
            uploads: st.uploads.map((u) => (u.id === upload?.id ? { ...u, status: 'parsed', parsed: { bookings: cards.map((c) => c.title) } } : u)),
          }));
          // Hotel travel times become known now.
          this.refreshTravelTimes();
          this.patchJob(job.id, { status: 'done', finished_at: nowIso() });
          this.event(job, `Extracted ${cards.length} booking items – please confirm them`, 'info');
        });
        break;
      }
    }
  }

  private refreshTravelTimes(): void {
    const ids = new Set(this.s().places.map((p) => p.id));
    const tt = this.seed.allTravelTimes.filter((t) => ids.has(t.from_place_id) && ids.has(t.to_place_id)).map((t) => ({ ...t, trip_id: this.tripId }));
    this.setState((s) => ({ ...s, travel_times: tt }));
  }

  /** The agent periodically re-checks scheduled cards; in the dev fixture this yields one change proposal. */
  private scheduleAutoRefresh(): void {
    if (this.autoRefreshScheduled) return;
    this.autoRefreshScheduled = true;
    this.later(12000, () => {
      const target = this.s().cards.find((c) => proposalTemplates[c.id] && c.day && c.swipe_status === 'accepted');
      if (target) void this.createJob({ kind: 'refresh_card', card_id: target.id });
    });
  }
}
