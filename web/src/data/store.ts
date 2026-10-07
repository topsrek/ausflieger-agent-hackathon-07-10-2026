import type {
  AgentEvent, Card, CardChangeProposal, Fact, Holiday, JobKind, Place, Preferences, ResearchJob, SwipeStatus,
  TravelTime, Trip, TripBundle, Upload,
} from '@shared/types';

/** Everything the UI shows for one trip: the planner bundle plus live agent state. */
export interface TripState extends TripBundle {
  uploads: Upload[];
  jobs: ResearchJob[];
  proposals: CardChangeProposal[];
  events: AgentEvent[];
}

export interface NewTripInput {
  city: string;
  start_date: string;
  end_date: string;
  title?: string | null;
  region?: string | null;
  country_code?: string;
  timezone?: string;
}

export interface NewJobInput {
  kind: JobKind;
  query?: string | null;
  window_day?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  card_id?: string | null;
  upload_id?: string | null;
}

export interface Placement {
  id: string;
  day: string | null;
  position: number | null;
}

export type SessionStatus =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

/** One open trip. State is immutable; every change produces a new object (for useSyncExternalStore). */
export interface TripSession {
  readonly tripId: string;
  getState(): TripState | null;
  getStatus(): SessionStatus;
  subscribe(listener: () => void): () => void;
  close(): void;

  updateTrip(patch: Partial<Pick<Trip, 'title' | 'city' | 'region' | 'country_code' | 'timezone' | 'start_date' | 'end_date' | 'step'>>): Promise<void>;
  savePreferences(patch: Partial<Omit<Preferences, 'trip_id' | 'updated_at'>>): Promise<void>;
  swipe(cardId: string, status: SwipeStatus): Promise<void>;
  updateCard(cardId: string, patch: Partial<Omit<Card, 'id' | 'trip_id' | 'created_at' | 'updated_at'>>): Promise<void>;
  /** Create a user-made card (arrival/departure from step 1, buffers). Returns the new id. */
  createCard(input: Partial<Card> & Pick<Card, 'type' | 'title'>): Promise<string>;
  /** Batch update of day/position (reorder, drawer <-> day). Cards not listed stay unchanged. */
  setPlacements(placements: Placement[]): Promise<void>;
  addBuffer(day: string, position: number, minutes: number): Promise<string>;
  deleteCard(cardId: string): Promise<void>;
  createJob(input: NewJobInput): Promise<string>;
  retryJob(jobId: string): Promise<string>;
  uploadFile(file: File): Promise<void>;
  resolveProposal(proposalId: string, accept: boolean): Promise<void>;
}

export interface TripStore {
  readonly mode: 'local' | 'supabase';
  /** Short label for the UI ("Live agent" / "Simulated agent"). */
  readonly label: string;
  createTrip(input: NewTripInput): Promise<string>;
  /** Returns the id of an editable trip for the given demo (clones it in Supabase). */
  openDemo(name: string): Promise<string>;
  openTrip(tripId: string): TripSession;
}

export function emptyState(trip: Trip): TripState {
  return {
    trip, preferences: null, places: [], cards: [], holidays: [], facts: [], travel_times: [],
    uploads: [], jobs: [], proposals: [], events: [],
  };
}

// ---------------------------------------------------------------------------
// Immutable merge helpers shared by both stores
// ---------------------------------------------------------------------------

export function upsertBy<T>(list: T[], item: T, key: (t: T) => string | number): T[] {
  const k = key(item);
  const i = list.findIndex((x) => key(x) === k);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = { ...list[i], ...item };
  return next;
}

export function removeBy<T>(list: T[], k: string | number, key: (t: T) => string | number): T[] {
  return list.filter((x) => key(x) !== k);
}

export const byId = (x: { id: string | number }) => x.id;
export const travelKey = (t: TravelTime) => `${t.from_place_id}|${t.to_place_id}|${t.mode}`;

export type TableName =
  | 'cards' | 'places' | 'facts' | 'travel_times' | 'research_jobs' | 'card_change_proposals' | 'agent_events'
  | 'holidays' | 'uploads' | 'preferences' | 'trips';

/** Apply a realtime row change to a state. */
export function applyChange(state: TripState, table: TableName, type: 'INSERT' | 'UPDATE' | 'DELETE', row: Record<string, unknown>): TripState {
  const del = type === 'DELETE';
  switch (table) {
    case 'cards':
      return { ...state, cards: del ? removeBy(state.cards, row.id as string, byId) : upsertBy(state.cards, row as unknown as Card, byId) };
    case 'places':
      return { ...state, places: del ? removeBy(state.places, row.id as string, byId) : upsertBy(state.places, row as unknown as Place, byId) };
    case 'facts':
      return { ...state, facts: del ? removeBy(state.facts, row.id as string, byId) : upsertBy(state.facts, row as unknown as Fact, byId) };
    case 'holidays':
      return { ...state, holidays: del ? removeBy(state.holidays, row.id as string, byId) : upsertBy(state.holidays, row as unknown as Holiday, byId) };
    case 'uploads':
      return { ...state, uploads: del ? removeBy(state.uploads, row.id as string, byId) : upsertBy(state.uploads, row as unknown as Upload, byId) };
    case 'travel_times': {
      const t = row as unknown as TravelTime;
      return { ...state, travel_times: del ? removeBy(state.travel_times, travelKey(t), travelKey) : upsertBy(state.travel_times, t, travelKey) };
    }
    case 'research_jobs':
      return { ...state, jobs: del ? removeBy(state.jobs, row.id as string, byId) : upsertBy(state.jobs, row as unknown as ResearchJob, byId) };
    case 'card_change_proposals':
      return { ...state, proposals: del ? removeBy(state.proposals, row.id as string, byId) : upsertBy(state.proposals, row as unknown as CardChangeProposal, byId) };
    case 'agent_events': {
      if (del) return { ...state, events: removeBy(state.events, row.id as number, byId) };
      const events = upsertBy(state.events, row as unknown as AgentEvent, byId);
      return { ...state, events: events.length > 200 ? events.slice(-200) : events };
    }
    case 'preferences':
      return { ...state, preferences: del ? null : { ...(state.preferences ?? {}), ...(row as unknown as Preferences) } };
    case 'trips':
      return del ? state : { ...state, trip: { ...state.trip, ...(row as unknown as Trip) } };
  }
}

/** Postgres `time` columns come back as "09:30:00"; normalise to "09:30" so UI and planner agree. */
export function normaliseTimes<T extends Record<string, unknown>>(row: T, keys: string[]): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of keys) {
    const v = out[k];
    if (typeof v === 'string' && /^\d{2}:\d{2}:\d{2}/.test(v)) out[k] = v.slice(0, 5);
  }
  return out as T;
}

export const TIME_KEYS: Partial<Record<TableName, string[]>> = {
  cards: ['window_start', 'window_end'],
  preferences: ['breakfast_time', 'lunch_time', 'dinner_time'],
  research_jobs: ['window_start', 'window_end'],
};

export function defaultPreferences(tripId: string): Preferences {
  return {
    trip_id: tripId,
    breakfast_time: '08:30',
    lunch_time: '12:30',
    dinner_time: '19:00',
    nightlife_importance: 1,
    interests: [],
    visit_style: 'normal',
    pace: 'balanced',
    default_buffer_minutes: 15,
    free_text: null,
    updated_at: new Date().toISOString(),
  };
}
