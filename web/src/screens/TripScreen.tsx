import { ChevronLeft, Check } from 'lucide-react';
import type { TripStep } from '@shared/types';
import { useStore, useTripSession, useTripState } from '../data/useTrip';
import { navigate } from '../lib/router';
import { formatDateRange } from '../lib/time';
import { Spinner } from '../components/bits';
import { coverFor } from '../lib/covers';
import { PreferencesStep } from './PreferencesStep';
import { SwipeStep } from './SwipeStep';
import { ScheduleStep } from './ScheduleStep';

const STEPS: { id: TripStep; label: string }[] = [
  { id: 'preferences', label: 'Preferences' },
  { id: 'swiping', label: 'Suggestions' },
  { id: 'scheduling', label: 'Schedule' },
];

export function TripScreen({ tripId }: { tripId: string }) {
  const store = useStore();
  const session = useTripSession(tripId);
  const { state, status } = useTripState(session);

  if (status.kind === 'error') {
    return (
      <main className="center-screen">
        <h2>Trip unavailable</h2>
        <p className="muted">{status.message}</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>Back to start</button>
      </main>
    );
  }
  if (!session || !state) {
    return (
      <main className="center-screen" aria-busy="true">
        <Spinner size={28} />
        <p className="muted">Loading trip…</p>
      </main>
    );
  }

  const step = state.trip.step;
  const stepIdx = STEPS.findIndex((s) => s.id === step);
  const goto = (s: TripStep) => {
    if (s !== step) void session.updateTrip({ step: s });
  };

  const cover = coverFor(state.trip.city);

  return (
    <div className={`trip-screen step-${step}`}>
      {cover && step !== 'scheduling' ? (
        <div className="trip-cover" style={{ backgroundImage: `url("${cover.url}")` }}>
          <span className="trip-cover-credit">{cover.credit}</span>
        </div>
      ) : null}
      <header className={`trip-header ${cover && step !== 'scheduling' ? 'on-cover' : ''}`}>
        <button type="button" className="icon-btn" onClick={() => navigate('/')} aria-label="Back to start"><ChevronLeft size={20} /></button>
        <div className="trip-title">
          <b>{state.trip.title || state.trip.city}</b>
          <span>{state.trip.city} · {formatDateRange(state.trip.start_date, state.trip.end_date)}</span>
        </div>
        <span className={`mode-badge mode-${store?.mode ?? 'local'}`} title={store?.label}>{store?.mode === 'supabase' ? 'Live' : 'Offline demo'}</span>
      </header>
      <nav className="stepper" aria-label="Trip steps">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`step-pill ${i === stepIdx ? 'current' : ''} ${i < stepIdx ? 'done' : ''}`}
            data-testid={`step-${s.id}`}
            aria-current={i === stepIdx ? 'step' : undefined}
            onClick={() => goto(s.id)}
          >
            <span className="step-num">{i < stepIdx ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
            {s.label}
          </button>
        ))}
      </nav>
      <div className="step-body" key={step}>
        {step === 'preferences' ? <PreferencesStep state={state} session={session} /> : null}
        {step === 'swiping' ? <SwipeStep state={state} session={session} /> : null}
        {step === 'scheduling' ? <ScheduleStep state={state} session={session} /> : null}
      </div>
    </div>
  );
}
