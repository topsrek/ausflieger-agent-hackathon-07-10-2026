import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Car, Check, FileText, Lock, Plane, TrainFront, UploadCloud, CheckCheck } from 'lucide-react';
import type { Card, Pace, Preferences, VisitStyle } from '@shared/types';
import type { TripSession, TripState } from '../data/store';
import { defaultPreferences } from '../data/store';
import { localParts, toIso, formatDayShort, hhmm, formatDuration } from '../lib/time';
import { haptic } from '../lib/haptics';
import { toast } from '../lib/toast';
import { CardArt, Spinner } from '../components/bits';

type Mode = 'train' | 'plane' | 'car';
const MODES: { id: Mode; label: string; icon: typeof TrainFront }[] = [
  { id: 'train', label: 'Train', icon: TrainFront },
  { id: 'plane', label: 'Plane', icon: Plane },
  { id: 'car', label: 'Car', icon: Car },
];

const MEALS: { key: 'breakfast_time' | 'lunch_time' | 'dinner_time'; label: string; options: string[] }[] = [
  { key: 'breakfast_time', label: 'Breakfast', options: ['07:30', '08:30', '09:30'] },
  { key: 'lunch_time', label: 'Lunch', options: ['12:00', '12:30', '13:30'] },
  { key: 'dinner_time', label: 'Dinner', options: ['18:00', '19:00', '20:00', '21:00'] },
];

const INTERESTS = ['Museums', 'Culture', 'History', 'Art', 'Architecture', 'Nature', 'Food', 'Beer gardens', 'Events', 'Shopping', 'Science', 'Views'];
const NIGHTLIFE = ['Not for me', 'A little', 'Important', 'Very important'];
const STYLES: { id: VisitStyle; label: string; hint: string }[] = [
  { id: 'short', label: 'Short', hint: 'Highlights · museum ~1 h' },
  { id: 'normal', label: 'Normal', hint: 'Balanced · museum ~2 h' },
  { id: 'long', label: 'Thorough', hint: 'Deep dive · museum ~3 h' },
];
const PACES: { id: Pace; label: string }[] = [
  { id: 'relaxed', label: 'Relaxed' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'packed', label: 'Packed' },
];

function transportOf(card: Card | undefined, tz: string, fallbackDate: string, fallbackTime: string) {
  const mode = (card?.metadata?.mode as Mode | undefined) ?? 'train';
  if (!card?.fixed_start) return { mode, date: fallbackDate, time: fallbackTime };
  const p = localParts(card.fixed_start, tz);
  return { mode, date: p.date, time: p.time };
}

export function PreferencesStep({ state, session }: { state: TripState; session: TripSession }) {
  const { trip } = state;
  const prefs: Preferences = state.preferences ?? defaultPreferences(trip.id);
  const arrivalCard = state.cards.find((c) => c.type === 'arrival');
  const departureCard = state.cards.find((c) => c.type === 'departure');
  const [arrival, setArrival] = useState(() => transportOf(arrivalCard, trip.timezone, trip.start_date, '09:12'));
  const [departure, setDeparture] = useState(() => transportOf(departureCard, trip.timezone, trip.end_date, '18:46'));
  const [city, setCity] = useState(trip.city);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const setPref = (patch: Partial<Preferences>) => {
    haptic(6);
    void session.savePreferences(patch);
  };

  // Keep arrival/departure date in sync with trip dates.
  useEffect(() => setArrival((a) => ({ ...a, date: trip.start_date })), [trip.start_date]);
  useEffect(() => setDeparture((d) => ({ ...d, date: trip.end_date })), [trip.end_date]);

  const extracted = useMemo(() => state.cards.filter((c) => c.upload_id || !c.confirmed), [state.cards]);
  const unconfirmed = extracted.filter((c) => !c.confirmed);

  const saveTransport = async () => {
    const tz = trip.timezone;
    const write = async (kind: 'arrival' | 'departure', t: typeof arrival, existing: Card | undefined) => {
      const modeLabel = MODES.find((m) => m.id === t.mode)?.label ?? 'Train';
      const fixed = toIso(t.date, t.time, tz);
      const changedMode = existing && existing.metadata?.mode !== t.mode;
      const title = existing && !changedMode ? existing.title : kind === 'arrival' ? `${modeLabel} arrives in ${city}` : `${modeLabel} leaves ${city}`;
      const sameDay = state.cards.filter((c) => c.day === t.date && c.swipe_status === 'accepted' && c.id !== existing?.id);
      const position = kind === 'arrival' ? 0 : sameDay.reduce((m, c) => Math.max(m, (c.position ?? 0) + 1), 0);
      const patch: Partial<Card> = {
        title, is_fixed: true, fixed_start: fixed, fixed_end: fixed, constraint_kind: 'hard', confirmed: true,
        duration_minutes: 0, duration_basis: 'Entered by you', metadata: { ...(existing?.metadata ?? {}), mode: t.mode },
      };
      if (existing) {
        if (existing.fixed_start !== fixed || changedMode || existing.title !== title || existing.day !== t.date) {
          await session.updateCard(existing.id, { ...patch, ...(existing.day !== t.date ? { day: t.date, position } : {}) });
        }
      } else {
        if (kind === 'arrival') {
          // make room at the start of the day
          await session.setPlacements(sameDay.map((c) => ({ id: c.id, day: c.day, position: (c.position ?? 0) + 1 })));
        }
        await session.createCard({ type: kind, ...patch, title, swipe_status: 'accepted', research_state: 'ready', day: t.date, position });
      }
    };
    await write('arrival', arrival, arrivalCard);
    await write('departure', departure, departureCard);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      try {
        await session.uploadFile(f);
        toast('Upload received', { tone: 'success', detail: `${f.name} – extracting bookings…` });
      } catch {
        /* toast shown by store */
      }
    }
  };

  const submit = async () => {
    setSubmitting(true);
    haptic([8, 40, 8]);
    try {
      if (city.trim() && city.trim() !== trip.city) await session.updateTrip({ city: city.trim() });
      await saveTransport();
      const hasInitial = state.jobs.some((j) => j.kind === 'initial_suggestions' && j.status !== 'failed');
      await session.updateTrip({ step: 'swiping' });
      if (!hasInitial) await session.createJob({ kind: 'initial_suggestions', query: prefs.free_text || null });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="prefs">
      <section className="panel">
        <h2 className="panel-title">Where & when</h2>
        <label className="field">
          <span>Destination</span>
          <input value={city} onChange={(e) => setCity(e.target.value)} onBlur={() => city.trim() && city !== trip.city && void session.updateTrip({ city: city.trim() })} autoComplete="off" />
        </label>
        <div className="field-row">
          <label className="field">
            <span>From</span>
            <input type="date" value={trip.start_date} onChange={(e) => e.target.value && void session.updateTrip({ start_date: e.target.value, ...(e.target.value > trip.end_date ? { end_date: e.target.value } : {}) })} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={trip.end_date} min={trip.start_date} onChange={(e) => e.target.value && void session.updateTrip({ end_date: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">Getting there</h2>
        {([['Arrival', arrival, setArrival], ['Departure', departure, setDeparture]] as const).map(([label, t, set]) => (
          <div className="transport" key={label}>
            <div className="transport-head">
              <span className="field-label">{label}</span>
              <span className="muted small">{formatDayShort(t.date).weekday} {formatDayShort(t.date).day} {formatDayShort(t.date).month}</span>
            </div>
            <div className="transport-row">
              <div className="seg" role="radiogroup" aria-label={`${label} mode`}>
                {MODES.map((m) => (
                  <button key={m.id} type="button" role="radio" aria-checked={t.mode === m.id} className={t.mode === m.id ? 'on' : ''}
                    onClick={() => { haptic(6); set({ ...t, mode: m.id }); }}>
                    <m.icon size={15} aria-hidden="true" /> {m.label}
                  </button>
                ))}
              </div>
              <input className="time-input" type="time" value={t.time} aria-label={`${label} time`} onChange={(e) => set({ ...t, time: e.target.value })} />
            </div>
          </div>
        ))}
        <p className="hint"><Lock size={12} /> Arrival and departure become fixed, locked cards.</p>
      </section>

      <section className="panel">
        <h2 className="panel-title">Tickets & bookings</h2>
        <button
          type="button"
          className={`dropzone ${dragOver ? 'over' : ''}`}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void onFiles(e.dataTransfer.files); }}
        >
          <UploadCloud size={26} aria-hidden="true" />
          <b>Upload PDF, ticket or screenshot</b>
          <span>We extract dates and times for you to confirm</span>
        </button>
        <input ref={fileInput} type="file" accept="application/pdf,image/*,.pdf" multiple hidden onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />
        {state.uploads.length ? (
          <ul className="upload-list">
            {state.uploads.map((u) => (
              <li key={u.id} className={`upload-item st-${u.status}`}>
                <FileText size={16} aria-hidden="true" />
                <span className="upload-name">{u.file_name}</span>
                <span className="upload-status">
                  {u.status === 'parsing' || u.status === 'uploaded' ? <><Spinner size={13} /> Extracting…</> : u.status === 'parsed' ? <><Check size={13} /> Extracted</> : 'Failed'}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {extracted.length ? (
          <div className="extracted">
            <div className="extracted-head">
              <span className="field-label">Found in your documents</span>
              {unconfirmed.length > 1 ? (
                <button type="button" className="chip-btn" onClick={() => { haptic(10); unconfirmed.forEach((c) => void session.updateCard(c.id, { confirmed: true })); }}>
                  <CheckCheck size={14} /> Confirm all
                </button>
              ) : null}
            </div>
            {extracted.map((c) => (
              <div key={c.id} className={`extracted-card ${c.confirmed ? 'is-confirmed' : ''}`}>
                <CardArt card={c} size="sm" />
                <div className="extracted-body">
                  <b>{c.title}</b>
                  <span className="muted small">
                    {c.window_start || c.window_end ? `${c.window_start ? hhmm(c.window_start) : ''}${c.window_end ? `–${hhmm(c.window_end)}` : ''}` : ''}
                    {c.fixed_start ? localParts(c.fixed_start, trip.timezone).time : ''}
                    {c.duration_minutes ? ` · ${formatDuration(c.duration_minutes)}` : ''}
                    {c.metadata?.preferred_day ? ` · ${formatDayShort(String(c.metadata.preferred_day)).weekday}` : ''}
                  </span>
                </div>
                {c.confirmed ? (
                  <span className="confirmed-tag"><Lock size={12} /> Locked</span>
                ) : (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => { haptic(10); void session.updateCard(c.id, { confirmed: true }); }}>Confirm</button>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2 className="panel-title">Your rhythm</h2>
        {MEALS.map((m) => (
          <div className="q-row" key={m.key}>
            <span className="field-label">{m.label}</span>
            <div className="chips">
              {m.options.map((o) => (
                <button key={o} type="button" className={`chip ${hhmm(prefs[m.key]) === o ? 'on' : ''}`} aria-pressed={hhmm(prefs[m.key]) === o} onClick={() => setPref({ [m.key]: o })}>{o}</button>
              ))}
              <button type="button" className={`chip ${prefs[m.key] == null ? 'on' : ''}`} aria-pressed={prefs[m.key] == null} onClick={() => setPref({ [m.key]: null })}>Skip</button>
            </div>
          </div>
        ))}
        <div className="q-row">
          <span className="field-label">Nightlife</span>
          <div className="chips">
            {NIGHTLIFE.map((n, i) => (
              <button key={n} type="button" className={`chip ${prefs.nightlife_importance === i ? 'on' : ''}`} aria-pressed={prefs.nightlife_importance === i} onClick={() => setPref({ nightlife_importance: i })}>{n}</button>
            ))}
          </div>
        </div>
        <div className="q-row">
          <span className="field-label">Interests</span>
          <div className="chips">
            {INTERESTS.map((i) => {
              const key = i.toLowerCase();
              const on = prefs.interests.includes(key);
              return (
                <button key={i} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on}
                  onClick={() => setPref({ interests: on ? prefs.interests.filter((x) => x !== key) : [...prefs.interests, key] })}>{i}</button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">Visit style</h2>
        <div className="style-cards" role="radiogroup" aria-label="Visit style">
          {STYLES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={prefs.visit_style === s.id} className={`style-card ${prefs.visit_style === s.id ? 'on' : ''}`} onClick={() => setPref({ visit_style: s.id })}>
              <b>{s.label}</b>
              <span>{s.hint}</span>
            </button>
          ))}
        </div>
        <div className="q-row">
          <span className="field-label">Pace</span>
          <div className="seg seg-wide" role="radiogroup" aria-label="Pace">
            {PACES.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={prefs.pace === p.id} className={prefs.pace === p.id ? 'on' : ''} onClick={() => setPref({ pace: p.id })}>{p.label}</button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Anything else?</span>
          <textarea rows={3} defaultValue={prefs.free_text ?? ''} placeholder="e.g. We love beer gardens, no early mornings, one of us uses a stroller"
            onBlur={(e) => e.target.value !== (prefs.free_text ?? '') && void session.savePreferences({ free_text: e.target.value || null })} />
        </label>
      </section>

      <div className="sticky-cta">
        {unconfirmed.length ? <p className="cta-note">{unconfirmed.length} booking item{unconfirmed.length > 1 ? 's' : ''} still to confirm</p> : null}
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => void submit()} disabled={submitting}>
          {submitting ? <Spinner /> : null} Find suggestions <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
