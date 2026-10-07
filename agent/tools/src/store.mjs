// Minimal data-access layer with two backends:
//  - supabaseStore: production, via @supabase/supabase-js with the service role key (bypasses RLS)
//  - pgStore: any client with query(sql, params) -> {rows}, used for tests against PGlite
//
// Filter spec: { col: value }      -> col = value
//              { col: null }       -> col is null
//              { col: [a, b] }     -> col in (a, b)
//              { col: {neq: v} }   -> col <> v  (or "is not null" for v === null)
// Options: { order: [[col, 'asc'|'desc'], ...], limit: n, columns: 'a,b' }

const TABLES = new Set(['trips', 'preferences', 'uploads', 'places', 'research_jobs', 'cards', 'holidays',
  'facts', 'travel_times', 'card_change_proposals', 'agent_events']);

function checkTable(t) {
  if (!TABLES.has(t)) throw new Error(`unknown table ${t}`);
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

export async function supabaseStore({ url, key }) {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const applyFilters = (q, filters = {}) => {
    for (const [col, v] of Object.entries(filters)) {
      if (v === null) q = q.is(col, null);
      else if (Array.isArray(v)) q = q.in(col, v);
      else if (v && typeof v === 'object' && 'neq' in v) q = v.neq === null ? q.not(col, 'is', null) : q.neq(col, v.neq);
      else q = q.eq(col, v);
    }
    return q;
  };
  const unwrap = ({ data, error }) => {
    if (error) throw new Error(`supabase: ${error.message}${error.details ? ` (${error.details})` : ''}`);
    return data ?? [];
  };

  return {
    kind: 'supabase',
    async select(table, filters, opts = {}) {
      checkTable(table);
      let q = applyFilters(sb.from(table).select(opts.columns ?? '*'), filters);
      for (const [col, dir] of opts.order ?? []) q = q.order(col, { ascending: dir !== 'desc' });
      if (opts.limit) q = q.limit(opts.limit);
      return unwrap(await q);
    },
    async insert(table, rows) {
      checkTable(table);
      return unwrap(await sb.from(table).insert(rows).select());
    },
    async update(table, patch, filters) {
      checkTable(table);
      if (!filters || Object.keys(filters).length === 0) throw new Error('update without filters');
      return unwrap(await applyFilters(sb.from(table).update(patch), filters).select());
    },
    async upsert(table, rows, { onConflict }) {
      checkTable(table);
      return unwrap(await sb.from(table).upsert(rows, { onConflict }).select());
    },
    /** Download a file from Supabase Storage. Returns a Buffer. */
    async download(bucket, path) {
      const { data, error } = await sb.storage.from(bucket).download(path);
      if (error) throw new Error(`storage: ${error.message}`);
      return Buffer.from(await data.arrayBuffer());
    },
  };
}

// ---------------------------------------------------------------------------
// Plain Postgres (PGlite in tests)
// ---------------------------------------------------------------------------

const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad identifier ${s}`);
  return `"${s}"`;
};
// jsonb columns are always sent as JSON text (a plain string value must become a JSON string).
const JSONB = {
  facts: ['value'], places: ['opening_hours', 'special_hours', 'metadata'], cards: ['metadata'],
  card_change_proposals: ['changes'], agent_events: ['data'], uploads: ['parsed'],
};
const toParam = (table, col, v) => {
  if (v === undefined || v === null) return null;
  if (JSONB[table]?.includes(col)) return JSON.stringify(v);
  return typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v;
};

export function pgStore(client) {
  const where = (filters = {}, params) => {
    const parts = [];
    for (const [col, v] of Object.entries(filters)) {
      if (v === null) parts.push(`${ident(col)} is null`);
      else if (Array.isArray(v)) {
        if (v.length === 0) { parts.push('false'); continue; }
        parts.push(`${ident(col)} in (${v.map((x) => { params.push(x); return `$${params.length}`; }).join(', ')})`);
      } else if (v && typeof v === 'object' && 'neq' in v) {
        if (v.neq === null) parts.push(`${ident(col)} is not null`);
        else { params.push(v.neq); parts.push(`${ident(col)} <> $${params.length}`); }
      } else { params.push(v); parts.push(`${ident(col)} = $${params.length}`); }
    }
    return parts.length ? ` where ${parts.join(' and ')}` : '';
  };
  const insertSql = (table, rows, params) => {
    const list = Array.isArray(rows) ? rows : [rows];
    const cols = [...new Set(list.flatMap((r) => Object.keys(r)))];
    const values = list.map((r) => `(${cols.map((c) => {
      if (!(c in r)) return 'default';
      params.push(toParam(table, c, r[c]));
      return `$${params.length}`;
    }).join(', ')})`);
    return `insert into public.${ident(table)} (${cols.map(ident).join(', ')}) values ${values.join(', ')}`;
  };
  // Mimic PostgREST JSON: date as 'YYYY-MM-DD', timestamps as ISO strings, numeric as number.
  const parsers = { 1082: (v) => v, 1114: (v) => new Date(`${v}Z`).toISOString(), 1184: (v) => new Date(v).toISOString(), 1700: (v) => Number(v) };
  const run = async (sql, params) => (await client.query(sql, params, { parsers })).rows;

  return {
    kind: 'pg',
    async select(table, filters, opts = {}) {
      checkTable(table);
      const params = [];
      let sql = `select ${opts.columns ? opts.columns.split(',').map((c) => ident(c.trim())).join(', ') : '*'} from public.${ident(table)}${where(filters, params)}`;
      if (opts.order?.length) sql += ` order by ${opts.order.map(([c, d]) => `${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}`).join(', ')}`;
      if (opts.limit) sql += ` limit ${Number(opts.limit)}`;
      return run(sql, params);
    },
    async insert(table, rows) {
      checkTable(table);
      const params = [];
      return run(`${insertSql(table, rows, params)} returning *`, params);
    },
    async update(table, patch, filters) {
      checkTable(table);
      if (!filters || Object.keys(filters).length === 0) throw new Error('update without filters');
      const params = [];
      const sets = Object.entries(patch).map(([c, v]) => { params.push(toParam(table, c, v)); return `${ident(c)} = $${params.length}`; });
      return run(`update public.${ident(table)} set ${sets.join(', ')}${where(filters, params)} returning *`, params);
    },
    async upsert(table, rows, { onConflict }) {
      checkTable(table);
      const params = [];
      const list = Array.isArray(rows) ? rows : [rows];
      const conflict = onConflict.split(',').map((c) => c.trim());
      const cols = [...new Set(list.flatMap((r) => Object.keys(r)))].filter((c) => !conflict.includes(c));
      const sets = cols.length ? `do update set ${cols.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(', ')}` : 'do nothing';
      return run(`${insertSql(table, list, params)} on conflict (${conflict.map(ident).join(', ')}) ${sets} returning *`, params);
    },
  };
}
