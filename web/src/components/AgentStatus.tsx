import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, RotateCcw, XCircle } from 'lucide-react';
import type { JobKind, ResearchJob } from '@shared/types';
import type { TripSession, TripState } from '../data/store';
import { relativeTime } from '../lib/time';

const SEARCH_KINDS: JobKind[] = ['initial_suggestions', 'search_again'];

const JOB_LABEL: Record<JobKind, string> = {
  initial_suggestions: 'Finding suggestions',
  search_again: 'Searching again',
  research_card: 'Researching card',
  refresh_card: 'Re-checking card',
  parse_upload: 'Reading upload',
};

export function latestJob(state: TripState, kinds: JobKind[] = SEARCH_KINDS): ResearchJob | null {
  const jobs = state.jobs.filter((j) => kinds.includes(j.kind));
  return jobs.length ? jobs[jobs.length - 1] : null;
}

/** One-line live agent activity: latest event of the newest job, its status, and retry on failure. */
export function AgentStatus({ state, session, kinds = SEARCH_KINDS, idleText }: {
  state: TripState; session: TripSession; kinds?: JobKind[]; idleText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);
  const job = latestJob(state, kinds);
  const anyRunning = state.jobs.some((j) => j.status === 'running' || j.status === 'queued');
  const lastEvent = state.events.length ? state.events[state.events.length - 1] : null;
  const jobEvent = job ? [...state.events].reverse().find((e) => e.job_id === job.id) : null;

  let tone: 'running' | 'done' | 'failed' | 'idle' = 'idle';
  let text = idleText ?? 'Agent idle';
  if (anyRunning) {
    tone = 'running';
    text = lastEvent?.message ?? (job ? `${JOB_LABEL[job.kind]}…` : 'Working…');
  } else if (job?.status === 'failed') {
    tone = 'failed';
    text = `${JOB_LABEL[job.kind]} failed${job.error ? `: ${job.error}` : ''}`;
  } else if (job?.status === 'done') {
    tone = 'done';
    text = jobEvent?.message ?? 'Search finished';
  }

  return (
    <div className={`agent-status tone-${tone}`}>
      <div className="agent-status-row">
        <span className="agent-dot" aria-hidden="true">
          {tone === 'done' ? <CheckCircle2 size={14} /> : tone === 'failed' ? <XCircle size={14} /> : null}
        </span>
        <span className="agent-text" aria-live="polite" key={text}>{text}</span>
        {tone === 'failed' && job ? (
          <button type="button" className="chip-btn" onClick={() => void session.retryJob(job.id)}>
            <RotateCcw size={13} /> Retry
          </button>
        ) : null}
        {state.events.length ? (
          <button type="button" className={`icon-btn tiny ${open ? 'rot' : ''}`} aria-expanded={open} aria-label="Show agent log" onClick={() => setOpen((o) => !o)}>
            <ChevronDown size={16} />
          </button>
        ) : null}
      </div>
      {open ? (
        <ol className="agent-log">
          {[...state.events].reverse().slice(0, 12).map((e) => (
            <li key={e.id} className={`lvl-${e.level}`}>
              <span>{e.message}</span>
              <time>{relativeTime(e.created_at)}</time>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
