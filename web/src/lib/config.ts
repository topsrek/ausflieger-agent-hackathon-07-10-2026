declare global {
  interface Window {
    __AUSFLIEGER_CONFIG__?: { supabaseUrl?: string; supabaseAnonKey?: string; demoTripId?: string };
  }
}

export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  demoTripId: string;
}

/** Runtime config (served by server.mjs as /config.js) wins over build-time VITE_* vars. */
export function getConfig(): AppConfig {
  const rt = (typeof window !== 'undefined' && window.__AUSFLIEGER_CONFIG__) || {};
  const env = import.meta.env;
  return {
    supabaseUrl: rt.supabaseUrl || env.VITE_SUPABASE_URL || '',
    supabaseAnonKey: rt.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || '',
    demoTripId: rt.demoTripId || env.VITE_DEMO_TRIP_ID || '',
  };
}

/** `?store=local` forces the LocalStore even when Supabase is configured. */
export function wantsLocal(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('store') === 'local';
  } catch {
    return false;
  }
}
