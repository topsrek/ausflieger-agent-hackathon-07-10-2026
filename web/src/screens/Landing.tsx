import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarRange, Clock3, Layers, Sparkles, TriangleAlert } from 'lucide-react';
import { useStore } from '../data/useTrip';
import { navigate, useLocation } from '../lib/router';
import { toast } from '../lib/toast';
import { Spinner } from '../components/bits';

export function Landing() {
  const store = useStore();
  const { search } = useLocation();
  const [busy, setBusy] = useState<'new' | 'demo' | null>(null);
  const demoParam = search.get('demo');
  const autoOpened = useRef(false);

  const openDemo = async (name: string) => {
    if (!store) return;
    setBusy('demo');
    try {
      const id = await store.openDemo(name);
      navigate(`/trip/${encodeURIComponent(id)}`, { replace: !!demoParam });
    } catch (err) {
      toast('Could not open the demo', { tone: 'error', detail: err instanceof Error ? err.message : String(err) });
      setBusy(null);
    }
  };

  // `/?demo=munich` opens the prepared demo directly.
  useEffect(() => {
    if (store && demoParam && !autoOpened.current) {
      autoOpened.current = true;
      void openDemo(demoParam);
    }
  }, [store, demoParam]);

  const startNew = async () => {
    if (!store) return;
    setBusy('new');
    try {
      const id = await store.createTrip({ city: 'Munich', region: 'BY', country_code: 'DE', timezone: 'Europe/Berlin', start_date: '2027-10-02', end_date: '2027-10-03' });
      navigate(`/trip/${encodeURIComponent(id)}`);
    } catch (err) {
      toast('Could not create the trip', { tone: 'error', detail: err instanceof Error ? err.message : String(err) });
      setBusy(null);
    }
  };

  return (
    <main className="landing">
      <div className="landing-hero">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="44" height="44"><path d="M24 3 43 22 24 45 5 22Z" fill="var(--accent)" /><path d="M24 3v42M5 22h38" stroke="#fff" strokeWidth="2.2" opacity=".85" /><path d="M24 45c-3 4-7 2-9 0" stroke="var(--coral)" strokeWidth="2.4" fill="none" strokeLinecap="round" /></svg>
        </div>
        <p className="eyebrow">Ausflieger</p>
        <h1 className="display">Trip plans that<br /><span className="hl">actually fit.</span></h1>
        <p className="lede">An agent researches opening hours, holidays and walking times. You swipe what you like, then drag cards into a day that’s checked against every known constraint.</p>
      </div>

      <div className="landing-actions">
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => void openDemo('munich')} disabled={!store || !!busy}>
          {busy === 'demo' ? <Spinner /> : <Sparkles size={18} />} Open the Munich demo
          <span className="btn-sub">2–3 Oct 2027 · Oktoberfest · German Unity Day</span>
        </button>
        <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={() => void startNew()} disabled={!store || !!busy}>
          {busy === 'new' ? <Spinner /> : <ArrowRight size={18} />} Start a new trip
        </button>
      </div>

      <ul className="landing-features">
        <li><Layers size={18} /><span><b>Swipe</b> suggestions while new ones stream in</span></li>
        <li><CalendarRange size={18} /><span><b>Drag & drop</b> a day of cards with live time maths</span></li>
        <li><TriangleAlert size={18} /><span><b>Explains conflicts</b>: “Visit ends after the museum closes at 17:00”</span></li>
        <li><Clock3 size={18} /><span><b>Sourced facts</b> with evidence; unknowns stay visible</span></li>
      </ul>

      <p className="landing-foot">{store ? store.label : 'Connecting…'}{store?.mode === 'local' ? ' · data stays in this browser' : ''}</p>
    </main>
  );
}
