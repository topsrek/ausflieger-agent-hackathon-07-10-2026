import { useState, type FormEvent } from 'react';
import { CalendarClock, Search } from 'lucide-react';
import { formatDayShort } from '../lib/time';

export interface SearchWindow {
  day: string;
  start: string;
  end: string;
}

const IDEAS = ['More indoor activities', 'A cheaper dinner', 'Something near the hotel', 'Live music tonight'];

export function SearchAgain({ days, onSearch, allowWindow, busy, initialWindow }: {
  days: string[];
  onSearch: (query: string, window: SearchWindow | null) => void;
  allowWindow?: boolean;
  busy?: boolean;
  initialWindow?: SearchWindow | null;
}) {
  const [q, setQ] = useState('');
  const [useWindow, setUseWindow] = useState(!!initialWindow);
  const [win, setWin] = useState<SearchWindow>(initialWindow ?? { day: days[0] ?? '', start: '14:00', end: '17:00' });

  const submit = (e?: FormEvent, query = q) => {
    e?.preventDefault();
    onSearch(query.trim(), allowWindow && useWindow ? win : null);
    setQ('');
  };

  return (
    <form className="search-again" onSubmit={submit}>
      <div className="search-field">
        <Search size={17} aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search again, e.g. “more indoor activities”"
          aria-label="Search again"
          data-testid="search-input"
          enterKeyHint="search"
        />
        <button type="submit" data-testid="search-submit" className="btn btn-primary btn-sm" disabled={busy}>Search</button>
      </div>
      <div className="search-ideas">
        {IDEAS.map((idea) => (
          <button key={idea} type="button" className="chip" onClick={() => submit(undefined, idea)} disabled={busy}>{idea}</button>
        ))}
      </div>
      {allowWindow ? (
        <div className={`search-window ${useWindow ? 'on' : ''}`}>
          <label className="switch-row">
            <input type="checkbox" data-testid="search-window-toggle" checked={useWindow} onChange={(e) => setUseWindow(e.target.checked)} />
            <CalendarClock size={16} aria-hidden="true" />
            <span>For a free time window</span>
          </label>
          {useWindow ? (
            <div className="window-fields">
              <div className="seg seg-sm" role="radiogroup" aria-label="Day">
                {days.map((d) => {
                  const f = formatDayShort(d);
                  return (
                    <button key={d} type="button" role="radio" aria-checked={win.day === d} className={win.day === d ? 'on' : ''}
                      onClick={() => setWin({ ...win, day: d })}>{f.weekday} {f.day}</button>
                  );
                })}
              </div>
              <label className="time-field">From <input type="time" value={win.start} onChange={(e) => setWin({ ...win, start: e.target.value })} /></label>
              <label className="time-field">To <input type="time" value={win.end} onChange={(e) => setWin({ ...win, end: e.target.value })} /></label>
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
