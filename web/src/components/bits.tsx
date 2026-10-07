import type { ReactNode } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, ExternalLink, HelpCircle, Loader2, RotateCcw, XCircle, Clock } from 'lucide-react';
import type { Card, Fact, IssueSeverity, Place, ResearchState, ScheduleIssue, SourceType } from '@shared/types';
import { RESEARCH_LABEL, SEVERITY_LABEL, SOURCE_LABEL, TYPE_META, cardIcon } from '../lib/cardMeta';
import { openingFor } from '../lib/schedule';
import { formatDayShort, formatDuration, hhmm } from '../lib/time';
import type { TripState } from '../data/store';

export function CardArt({ card, size = 'md', className = '' }: { card: Card; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const meta = TYPE_META[card.type] ?? TYPE_META.other;
  const Icon = cardIcon(card);
  return (
    <div
      className={`card-art card-art-${size} ${className}`}
      style={{ ['--art-from' as string]: meta.from, ['--art-to' as string]: meta.to }}
      aria-hidden="true"
    >
      {card.image_url ? (
        <img src={card.image_url} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      ) : null}
      <Icon className="card-art-icon" strokeWidth={1.6} />
    </div>
  );
}

export function TypeTag({ card }: { card: Card }) {
  const meta = TYPE_META[card.type] ?? TYPE_META.other;
  const Icon = cardIcon(card);
  return (
    <span className="type-tag" style={{ ['--tag' as string]: meta.to }}>
      <Icon size={13} strokeWidth={2.2} aria-hidden="true" /> {meta.label}
    </span>
  );
}

export function ResearchBadge({ state, onRetry, compact }: { state: ResearchState; onRetry?: () => void; compact?: boolean }) {
  if (state === 'ready' && compact) return null;
  const icon = {
    pending: <Clock size={12} />,
    researching: <Loader2 size={12} className="spin" />,
    ready: <CheckCircle2 size={12} />,
    needs_checking: <HelpCircle size={12} />,
    failed: <XCircle size={12} />,
  }[state];
  return (
    <span className={`research-badge rs-${state}`}>
      {icon}
      <span>{RESEARCH_LABEL[state]}</span>
      {state === 'failed' && onRetry ? (
        <button type="button" className="research-retry" onClick={(e) => { e.stopPropagation(); onRetry(); }}>
          <RotateCcw size={11} /> Retry
        </button>
      ) : null}
    </span>
  );
}

export const SEVERITY_ICON: Record<IssueSeverity, typeof AlertOctagon> = {
  blocker: AlertOctagon,
  warning: AlertTriangle,
  needs_checking: HelpCircle,
};

export function IssueLine({ issue }: { issue: ScheduleIssue }) {
  const Icon = SEVERITY_ICON[issue.severity];
  return (
    <div className={`issue-line sev-${issue.severity}`}>
      <Icon size={14} aria-hidden="true" />
      <span className="sr-only">{SEVERITY_LABEL[issue.severity]}: </span>
      <span>{issue.message}</span>
    </div>
  );
}

export function SeverityPill({ severity, children }: { severity: IssueSeverity; children?: ReactNode }) {
  const Icon = SEVERITY_ICON[severity];
  return (
    <span className={`sev-pill sev-${severity}`}>
      <Icon size={12} aria-hidden="true" /> {children ?? SEVERITY_LABEL[severity]}
    </span>
  );
}

export interface SourceLink {
  url: string;
  label: string;
  type: SourceType;
  retrieved_at?: string;
}

export function sourcesFor(card: Card, state: Pick<TripState, 'places' | 'facts'>): SourceLink[] {
  const place = card.place_id ? state.places.find((p) => p.id === card.place_id) : undefined;
  const out: SourceLink[] = [];
  const seen = new Set<string>();
  const add = (s: SourceLink) => {
    const key = s.url.replace(/\/$/, '');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  if (place?.website_url) add({ url: place.website_url, label: SOURCE_LABEL.official, type: 'official' });
  if (place?.google_maps_url) add({ url: place.google_maps_url, label: SOURCE_LABEL.google_maps, type: 'google_maps' });
  for (const f of state.facts) {
    if (!f.url) continue;
    if (f.card_id !== card.id && !(place && f.place_id === place.id)) continue;
    add({ url: f.url, label: SOURCE_LABEL[f.source_type], type: f.source_type, retrieved_at: f.retrieved_at });
  }
  return out;
}

export function SourceChips({ sources, max = 3 }: { sources: SourceLink[]; max?: number }) {
  if (!sources.length) return <span className="muted small">No sources yet</span>;
  // One chip per source type on compact views.
  const byType = max < 10 ? sources.filter((s, i) => sources.findIndex((x) => x.type === s.type) === i) : sources;
  return (
    <div className="source-chips">
      {byType.slice(0, max).map((s) => (
        <a key={s.url} className={`source-chip src-${s.type}`} href={s.url} target="_blank" rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          {s.label} <ExternalLink size={11} aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

export function hoursText(place: Place | undefined, date: string): { text: string; tone: 'ok' | 'closed' | 'unknown' } {
  if (!place) return { text: '–', tone: 'unknown' };
  const o = openingFor(place, date);
  if (o.status === 'unknown') return { text: 'Hours unknown', tone: 'unknown' };
  if (o.status === 'closed') return { text: 'Closed', tone: 'closed' };
  const parts = o.intervals.map((i) => {
    if (i.open.startsWith('00:00') && (i.close.startsWith('24:00') || i.close.startsWith('23:59'))) return 'Open 24 h';
    return `${hhmm(i.open)}–${hhmm(i.close)}${i.last_entry ? ` (last entry ${hhmm(i.last_entry)})` : ''}`;
  });
  return { text: parts.join(', '), tone: 'ok' };
}

export function KeyFacts({ card, state, days }: { card: Card; state: TripState; days: string[] }) {
  const place = card.place_id ? state.places.find((p) => p.id === card.place_id) : undefined;
  return (
    <dl className="key-facts">
      {place && card.type !== 'arrival' && card.type !== 'departure' ? (
        <div className="kf-row">
          <dt>Hours</dt>
          <dd>
            {days.map((d) => {
              const h = hoursText(place, d);
              const holiday = state.holidays.find((x) => x.date === d);
              return (
                <span key={d} className={`kf-hours tone-${h.tone}`}>
                  <b>{formatDayShort(d).weekday}</b> {h.text}
                  {holiday ? <em className="kf-holiday" title={holiday.name}>holiday</em> : null}
                </span>
              );
            })}
          </dd>
        </div>
      ) : null}
      <div className="kf-row">
        <dt>Duration</dt>
        <dd>{card.duration_minutes != null ? formatDuration(card.duration_minutes) : 'By visit style'}{card.duration_basis ? <span className="muted"> · {card.duration_basis}</span> : null}</dd>
      </div>
      {card.price_text ? (
        <div className="kf-row"><dt>Price</dt><dd>{card.price_text}</dd></div>
      ) : null}
      {card.reservation_required ? (
        <div className="kf-row"><dt>Booking</dt><dd>Reservation needed{card.reservation_note ? ` · ${card.reservation_note}` : ''}</dd></div>
      ) : null}
    </dl>
  );
}

export function factsFor(card: Card, state: Pick<TripState, 'facts'>): Fact[] {
  return state.facts.filter((f) => f.card_id === card.id || (card.place_id && f.place_id === card.place_id));
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="spin" aria-hidden="true" />;
}
