import { useMemo, useState } from 'react';
import { ArrowRight, Check, Sparkles, X, ChevronDown } from 'lucide-react';
import type { Card, CardChangeProposal } from '@shared/types';
import type { TripSession, TripState } from '../data/store';
import { proposalImpact } from '../lib/schedule';
import { formatDuration, hhmm } from '../lib/time';
import { haptic } from '../lib/haptics';
import { toast } from '../lib/toast';
import { IssueLine } from './bits';

const LABELS: Partial<Record<keyof Card, string>> = {
  duration_minutes: 'Duration', window_start: 'Window from', window_end: 'Window until', fixed_start: 'Fixed start',
  fixed_end: 'Fixed end', price_text: 'Price', reservation_required: 'Reservation', title: 'Title',
};

function fmt(key: string, v: unknown): string {
  if (v == null) return '—';
  if (key === 'duration_minutes') return formatDuration(Number(v));
  if (key.startsWith('window_')) return hhmm(String(v));
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

export function ProposalBanner({ proposal, state, session, compact }: {
  proposal: CardChangeProposal; state: TripState; session: TripSession; compact?: boolean;
}) {
  const [open, setOpen] = useState(!compact);
  const card = state.cards.find((c) => c.id === proposal.card_id);
  const impact = useMemo(() => proposalImpact(state, proposal), [state, proposal]);
  if (!card) return null;
  const changes = Object.entries(proposal.changes).filter(([k]) => k in LABELS) as [keyof Card, unknown][];
  const blockers = impact.newIssues.filter((i) => i.severity === 'blocker').length;
  const summary = impact.newIssues.length
    ? `${impact.newIssues.length} new issue${impact.newIssues.length > 1 ? 's' : ''}${blockers ? ` (${blockers} conflict${blockers > 1 ? 's' : ''})` : ''}`
    : impact.shifted.length ? `${impact.shifted.length} card${impact.shifted.length > 1 ? 's' : ''} shift` : 'No other cards affected';

  const resolve = (accept: boolean) => {
    haptic(accept ? [10, 30, 10] : 8);
    void session.resolveProposal(proposal.id, accept);
    toast(accept ? 'Change applied' : 'Kept current plan', { tone: accept ? 'success' : 'info', detail: card.title });
  };

  return (
    <div className={`proposal ${blockers ? 'has-blocker' : ''} ${compact ? 'compact' : ''}`} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className="proposal-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Sparkles size={15} aria-hidden="true" />
        <span><b>Research update</b> · {summary}</span>
        {compact ? <ChevronDown size={15} className={open ? 'rot' : ''} /> : null}
      </button>
      {open ? (
        <div className="proposal-body">
          {proposal.reason ? <p className="proposal-reason">{proposal.reason}</p> : null}
          {changes.map(([k, v]) => (
            <div className="proposal-change" key={k}>
              <span>{LABELS[k]}</span>
              <s>{fmt(k, card[k])}</s>
              <ArrowRight size={13} />
              <b>{fmt(k, v)}</b>
            </div>
          ))}
          {impact.newIssues.length ? (
            <div className="proposal-impact">
              <span className="proposal-label">Would cause</span>
              {impact.newIssues.slice(0, 3).map((i, n) => {
                const other = state.cards.find((c) => c.id === i.card_id);
                return <IssueLine key={n} issue={{ ...i, message: other && other.id !== card.id ? `${other.title}: ${i.message}` : i.message }} />;
              })}
            </div>
          ) : null}
          {impact.shifted.length ? (
            <div className="proposal-shifts">
              <span className="proposal-label">Times shift</span>
              {impact.shifted.slice(0, 4).map((s) => (
                <div key={s.card_id} className="shift-row">
                  <span>{state.cards.find((c) => c.id === s.card_id)?.title}</span>
                  <span className="muted">{s.from} → <b>{s.to}</b></span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="proposal-actions">
            <button type="button" className="btn btn-sm btn-ghost" data-testid="proposal-keep" onClick={() => resolve(false)}><X size={14} /> Keep current</button>
            <button type="button" className={`btn btn-sm ${blockers ? 'btn-warn' : 'btn-primary'}`} data-testid="proposal-apply" onClick={() => resolve(true)}><Check size={14} /> Apply change</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
