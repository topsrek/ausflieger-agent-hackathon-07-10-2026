import type { Card, ResearchJob } from '@shared/types';
import type { NewJobInput, SessionStatus, TripState } from './store';
import { nowIso, uuid } from '../lib/ids';

/** State container shared by LocalStore and SupabaseStore sessions. */
export class SessionBase {
  protected state: TripState | null = null;
  protected status: SessionStatus = { kind: 'loading' };
  private listeners = new Set<() => void>();

  constructor(readonly tripId: string) {}

  getState(): TripState | null {
    return this.state;
  }

  getStatus(): SessionStatus {
    return this.status;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emit(): void {
    for (const l of this.listeners) l();
  }

  protected setState(next: TripState | ((s: TripState) => TripState)): void {
    if (typeof next === 'function') {
      if (!this.state) return;
      this.state = next(this.state);
    } else {
      this.state = next;
    }
    this.emit();
  }

  protected setStatus(status: SessionStatus): void {
    this.status = status;
    this.emit();
  }
}

export function makeCard(tripId: string, input: Partial<Card> & Pick<Card, 'type' | 'title'>): Card {
  const now = nowIso();
  return {
    id: uuid(), trip_id: tripId, place_id: null, job_id: null, upload_id: null, summary: null, image_url: null,
    swipe_status: 'accepted', research_state: 'ready', constraint_kind: 'assumption', is_fixed: false,
    confirmed: true, fixed_start: null, fixed_end: null, duration_minutes: null, duration_basis: null,
    window_start: null, window_end: null, reservation_required: null, reservation_note: null, price_text: null,
    price_amount: null, currency: null, day: null, position: null, metadata: {}, created_at: now, updated_at: now,
    ...input,
  };
}

export function makeJob(tripId: string, input: NewJobInput): ResearchJob {
  return {
    id: uuid(), trip_id: tripId, kind: input.kind, query: input.query ?? null, window_day: input.window_day ?? null,
    window_start: input.window_start ?? null, window_end: input.window_end ?? null, card_id: input.card_id ?? null,
    upload_id: input.upload_id ?? null, status: 'queued', error: null, created_at: nowIso(), started_at: null, finished_at: null,
  };
}

export function jobInputFrom(job: ResearchJob): NewJobInput {
  return {
    kind: job.kind, query: job.query, window_day: job.window_day, window_start: job.window_start,
    window_end: job.window_end, card_id: job.card_id, upload_id: job.upload_id,
  };
}
