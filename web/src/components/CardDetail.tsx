import { useMemo } from 'react';
import { ExternalLink, Lock, MapPin, Minus, Plus, RefreshCw, Unlock, CalendarClock, Ticket, Hourglass, Inbox, Trash2 } from 'lucide-react';
import type { Card, Fact, OpeningHours, ScheduledCard, Weekday } from '@shared/types';
import type { TripSession, TripState } from '../data/store';
import { EVIDENCE_META, SOURCE_LABEL, fieldLabel } from '../lib/cardMeta';
import { effectiveDuration, sortIssues } from '../lib/schedule';
import { formatDuration, formatRetrieved, hhmm, localParts, formatDayShort } from '../lib/time';
import { haptic } from '../lib/haptics';
import { CardArt, IssueLine, KeyFacts, ResearchBadge, TypeTag, factsFor, sourcesFor } from './bits';
import { ProposalBanner } from './ProposalBanner';

const WD: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WD_LABEL: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

function summariseHours(h: OpeningHours): string {
  const groups: { from: Weekday; to: Weekday; text: string }[] = [];
  for (const d of WD) {
    const iv = h[d];
    const text = iv === undefined ? '?' : iv.length === 0 ? 'closed'
      : iv.map((i) => `${hhmm(i.open)}–${hhmm(i.close)}${i.last_entry ? ` (last ${hhmm(i.last_entry)})` : ''}`).join(', ');
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.to = d;
    else groups.push({ from: d, to: d, text });
  }
  return groups.filter((g) => g.text !== '?').map((g) => `${WD_LABEL[g.from]}${g.from !== g.to ? `–${WD_LABEL[g.to]}` : ''} ${g.text}`).join(' · ') || 'unknown';
}

export function formatFactValue(f: Fact): string {
  const v = f.value;
  if (v == null) return '—';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    if (f.field === 'duration' && typeof v === 'number') return formatDuration(v);
    return String(v);
  }
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === 'object' && v[0] && 'date' in (v[0] as object)) {
      return (v as { date: string; closed?: boolean; hours?: { open: string; close: string }[]; note?: string }[])
        .map((s) => `${s.date.slice(8)}.${s.date.slice(5, 7)}.: ${s.closed ? 'closed' : (s.hours ?? []).map((h) => `${hhmm(h.open)}–${hhmm(h.close)}`).join(', ')}`)
        .join(' · ');
    }
    return v.map(String).join(', ');
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (WD.some((d) => d in o)) return summariseHours(o as OpeningHours);
    if ('name' in o && 'date' in o) return `${String(o.name)} (${String(o.date)})`;
    if ('from' in o && 'to' in o) return `${String(o.from)} → ${String(o.to)}`;
    return Object.entries(o).map(([k, x]) => {
      const val = x && typeof x === 'object' ? (Array.isArray(x) ? x.map((y) => (y && typeof y === 'object' ? Object.values(y as object).join('–') : String(y))).join(', ') : Object.values(x as object).join(' ')) : String(x);
      return `${k.replace(/_/g, ' ')}: ${/^\d{2}:\d{2}:\d{2}$/.test(val) ? val.slice(0, 5) : val}`;
    }).join(' · ');
  }
  return String(v);
}

export function CardDetail({ card, state, session, scheduled, onClose, inDrawer }: {
  card: Card; state: TripState; session: TripSession; scheduled?: ScheduledCard | null; onClose?: () => void; inDrawer?: boolean;
}) {
  const place = card.place_id ? state.places.find((p) => p.id === card.place_id) : undefined;
  const facts = useMemo(() => factsFor(card, state), [card, state]);
  const sources = useMemo(() => sourcesFor(card, state), [card, state]);
  const proposal = state.proposals.find((p) => p.card_id === card.id && p.status === 'pending');
  const days = card.day ? [card.day] : [state.trip.start_date, ...(state.trip.end_date !== state.trip.start_date ? [state.trip.end_date] : [])];
  const dur = effectiveDuration(card, state.preferences);
  const grouped = useMemo(() => {
    const m = new Map<string, Fact[]>();
    for (const f of facts) m.set(f.field, [...(m.get(f.field) ?? []), f]);
    return [...m.entries()];
  }, [facts]);

  const setDuration = (min: number) => {
    haptic(6);
    void session.updateCard(card.id, { duration_minutes: Math.max(card.type === 'buffer' ? 5 : 10, Math.min(600, min)), duration_basis: 'Edited by you' });
  };
  const step = card.type === 'buffer' ? 5 : 15;
  const holidaysOnDays = state.holidays.filter((h) => days.includes(h.date));

  return (
    <article className="detail">
      <CardArt card={card} size="lg" />
      <div className="detail-head">
        <div className="detail-tags">
          <TypeTag card={card} />
          <ResearchBadge state={card.research_state} onRetry={() => void session.createJob({ kind: 'research_card', card_id: card.id })} />
          {card.is_fixed ? <span className="lock-tag"><Lock size={12} /> Fixed</span> : <span className="flex-tag"><Unlock size={12} /> Flexible</span>}
        </div>
        <h2 id="detail-title" className="detail-title">{card.title}</h2>
        {scheduled ? <p className="detail-time">{formatDayShort(card.day!).weekday} · {scheduled.start}–{scheduled.end}</p> : null}
        {card.summary ? <p className="detail-summary">{card.summary}</p> : null}
      </div>

      {proposal ? <ProposalBanner proposal={proposal} state={state} session={session} /> : null}

      {scheduled?.issues.length ? (
        <div className="detail-issues">
          {sortIssues(scheduled.issues).map((i, n) => <IssueLine key={n} issue={i} />)}
        </div>
      ) : null}

      <section className="detail-section">
        <h3>Planning facts</h3>
        <KeyFacts card={card} state={state} days={days} />
        <dl className="key-facts">
          {card.fixed_start ? (
            <div className="kf-row"><dt>Fixed time</dt><dd><Lock size={12} /> {localParts(card.fixed_start, state.trip.timezone).time}{card.fixed_end && card.fixed_end !== card.fixed_start ? `–${localParts(card.fixed_end, state.trip.timezone).time}` : ''}</dd></div>
          ) : null}
          {card.window_start || card.window_end ? (
            <div className="kf-row"><dt>Time window</dt><dd><CalendarClock size={12} /> {hhmm(card.window_start) || '…'}–{hhmm(card.window_end) || '…'} <span className="muted">· {card.constraint_kind === 'hard' ? 'hard' : 'preferred'}</span></dd></div>
          ) : null}
          <div className="kf-row"><dt>Constraint</dt><dd>{card.constraint_kind === 'hard' ? 'Hard (booking, fixed time, opening hours)' : card.constraint_kind === 'preference' ? 'Preference (can deviate, explained)' : 'Assumption (estimate, editable)'}</dd></div>
          {!card.confirmed ? <div className="kf-row"><dt>Booking</dt><dd><Ticket size={12} /> Extracted from upload, not confirmed yet <button type="button" className="chip-btn" onClick={() => void session.updateCard(card.id, { confirmed: true })}>Confirm</button></dd></div> : null}
          {holidaysOnDays.map((h) => (
            <div className="kf-row" key={h.id}><dt>Holiday</dt><dd>{h.name} ({h.date.slice(8)}.{h.date.slice(5, 7)}.) · {h.note ?? 'check venue hours'}</dd></div>
          ))}
        </dl>
      </section>

      {!card.is_fixed ? (
        <section className="detail-section">
          <h3>{card.type === 'buffer' ? 'Buffer length' : 'Visit duration'}</h3>
          <div className="duration-editor">
            <button type="button" className="round-btn" aria-label={`Shorter by ${step} minutes`} onClick={() => setDuration(dur - step)}><Minus size={18} /></button>
            <div className="duration-value" aria-live="polite">
              <b>{formatDuration(dur)}</b>
              <span>{card.duration_basis ?? (card.duration_minutes == null ? `Default for visit style ${state.preferences?.visit_style ?? 'normal'}` : '')}</span>
            </div>
            <button type="button" className="round-btn" aria-label={`Longer by ${step} minutes`} onClick={() => setDuration(dur + step)}><Plus size={18} /></button>
          </div>
        </section>
      ) : null}

      {place ? (
        <section className="detail-section">
          <h3>Location</h3>
          <div className="place-row">
            <MapPin size={16} aria-hidden="true" />
            <div>
              <b>{place.name}</b>
              {place.address ? <span className="muted small">{place.address}</span> : null}
            </div>
          </div>
        </section>
      ) : null}

      {grouped.length ? (
        <section className="detail-section">
          <h3>Evidence</h3>
          <ul className="evidence-list">
            {grouped.map(([field, list]) => {
              const conflicting = list.some((f) => f.evidence === 'conflicting');
              return (
                <li key={field} className={`evidence-group ${conflicting ? 'is-conflict' : ''}`}>
                  <div className="evidence-field">{fieldLabel(field)}{conflicting ? <span className="ev-chip ev-conflict">Sources disagree</span> : null}</div>
                  {list.map((f) => {
                    const ev = EVIDENCE_META[f.evidence];
                    return (
                      <div key={f.id} className="evidence-claim">
                        <div className="claim-top">
                          <span className="claim-value">{formatFactValue(f)}</span>
                          <span className={`ev-chip ev-${ev.tone}`} title={ev.hint}>{ev.label}</span>
                        </div>
                        <div className="claim-meta">
                          {f.url ? (
                            <a href={f.url} target="_blank" rel="noreferrer noopener">{f.title || SOURCE_LABEL[f.source_type]} <ExternalLink size={11} /></a>
                          ) : <span>{SOURCE_LABEL[f.source_type]}</span>}
                          <span>· retrieved {formatRetrieved(f.retrieved_at)}</span>
                          {f.applies_from || f.applies_to ? <span>· applies {f.applies_from ?? '…'} – {f.applies_to ?? '…'}</span> : null}
                        </div>
                        {f.basis ? <div className="claim-note">Basis: {f.basis}</div> : null}
                        {f.note ? <div className="claim-note">{f.note}</div> : null}
                      </div>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="detail-section">
        <h3>Sources</h3>
        {sources.length ? (
          <ul className="source-list">
            {sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer noopener">
                  <span className={`src-dot src-${s.type}`} />
                  <span><b>{s.label}</b><span className="muted small">{s.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}</span></span>
                  <ExternalLink size={14} />
                </a>
                {s.retrieved_at ? <span className="muted tiny">Retrieved {formatRetrieved(s.retrieved_at)}</span> : null}
              </li>
            ))}
          </ul>
        ) : <p className="muted small">No sources yet. Unknown values stay marked as unknown.</p>}
      </section>

      <div className="detail-actions">
        {card.type !== 'buffer' && card.type !== 'arrival' && card.type !== 'departure' ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void session.createJob({ kind: card.research_state === 'failed' ? 'research_card' : 'refresh_card', card_id: card.id }); onClose?.(); }}>
            <RefreshCw size={15} /> {card.research_state === 'failed' ? 'Retry research' : 'Refresh research'}
          </button>
        ) : null}
        {card.day && !card.is_fixed && !inDrawer ? (
          card.type === 'buffer' ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void session.deleteCard(card.id); onClose?.(); }}><Trash2 size={15} /> Remove buffer</button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void session.setPlacements([{ id: card.id, day: null, position: null }]); onClose?.(); }}><Inbox size={15} /> Move to drawer</button>
          )
        ) : null}
        {card.type === 'buffer' ? null : <span className="muted tiny"><Hourglass size={11} /> Card updated {formatRetrieved(card.updated_at)}</span>}
      </div>
    </article>
  );
}
