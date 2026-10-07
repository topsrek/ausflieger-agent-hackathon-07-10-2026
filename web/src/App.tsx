import { useLocation } from './lib/router';
import { Landing } from './screens/Landing';
import { TripScreen } from './screens/TripScreen';
import { Toaster } from './components/Toaster';

export function App() {
  const { pathname } = useLocation();
  const m = /^\/trip\/([^/]+)\/?$/.exec(pathname);
  return (
    <div className="app-shell">
      <div className="app-frame" id="app-frame">
        {m ? <TripScreen key={m[1]} tripId={decodeURIComponent(m[1])} /> : <Landing />}
        <Toaster />
      </div>
    </div>
  );
}
