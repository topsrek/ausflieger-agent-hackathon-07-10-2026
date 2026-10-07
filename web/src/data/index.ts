import { getConfig, wantsLocal } from '../lib/config';
import { LocalStore } from './localStore';
import type { TripStore } from './store';

let store: TripStore | null = null;

/** Supabase when configured (runtime config > VITE_* env), otherwise the in-memory LocalStore. */
export async function getStore(): Promise<TripStore> {
  if (store) return store;
  const cfg = getConfig();
  if (cfg.supabaseUrl && cfg.supabaseAnonKey && !wantsLocal()) {
    const { SupabaseStore } = await import('./supabaseStore');
    store = new SupabaseStore(cfg.supabaseUrl, cfg.supabaseAnonKey, cfg.demoTripId);
  } else {
    store = new LocalStore();
  }
  return store;
}

export function getStoreSync(): TripStore | null {
  return store;
}
