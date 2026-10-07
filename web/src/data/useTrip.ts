import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getStore } from './index';
import type { SessionStatus, TripSession, TripState, TripStore } from './store';

export function useStore(): TripStore | null {
  const [store, setStore] = useState<TripStore | null>(null);
  useEffect(() => {
    let alive = true;
    void getStore().then((s) => alive && setStore(s));
    return () => {
      alive = false;
    };
  }, []);
  return store;
}

export function useTripSession(tripId: string): TripSession | null {
  const store = useStore();
  const [session, setSession] = useState<TripSession | null>(null);
  useEffect(() => {
    if (!store) return;
    const s = store.openTrip(tripId);
    setSession(s);
    return () => s.close();
  }, [store, tripId]);
  return session;
}

const noop = () => () => {};
const LOADING: SessionStatus = { kind: 'loading' };

export function useTripState(session: TripSession | null): { state: TripState | null; status: SessionStatus } {
  const subscribe = useCallback((l: () => void) => (session ? session.subscribe(l) : noop()), [session]);
  const state = useSyncExternalStore(subscribe, () => session?.getState() ?? null);
  const status = useSyncExternalStore(subscribe, () => session?.getStatus() ?? LOADING);
  return { state, status };
}
