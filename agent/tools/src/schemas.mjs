// Zod schemas for every row the research agent writes.
// Mirrors shared/types.ts and supabase/migrations/20261007120000_init_schema.sql.
// Check constraints from the migration are re-implemented here so the agent gets a
// readable error before the database rejects a write.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums (keep in sync with the migration)
// ---------------------------------------------------------------------------

export const CARD_TYPES = [
  'arrival', 'departure', 'hotel', 'meal', 'sight', 'museum',
  'activity', 'event', 'nightlife', 'shopping', 'nature', 'buffer', 'rest', 'other',
];
export const RESEARCH_STATES = ['pending', 'researching', 'ready', 'needs_checking', 'failed'];
export const CONSTRAINT_KINDS = ['hard', 'preference', 'assumption'];
export const EVIDENCE = ['operator_confirmed', 'regular_hours', 'estimated', 'unknown', 'conflicting'];
export const SOURCE_TYPES = [
  'official', 'google_maps', 'tourism_board', 'travel_guide', 'restaurant_guide', 'event_calendar',
  'holiday_calendar', 'transit', 'booking', 'upload', 'model', 'other',
];
export const HOLIDAY_LEVELS = ['national', 'regional', 'city'];
export const TRAVEL_MODES = ['walk', 'transit', 'drive', 'bike'];
export const JOB_KINDS = ['initial_suggestions', 'search_again', 'research_card', 'refresh_card', 'parse_upload'];
export const EVENT_LEVELS = ['info', 'progress', 'warning', 'error'];
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Card columns that belong to the user's plan. The agent never writes them on an existing card. */
export const USER_OWNED_CARD_FIELDS = ['day', 'position', 'swipe_status', 'confirmed'];
/** Card columns that change how a scheduled card is planned. On a scheduled card they become a proposal. */
export const SCHEDULE_IMPACT_FIELDS = [
  'duration_minutes', 'fixed_start', 'fixed_end', 'is_fixed', 'window_start', 'window_end', 'place_id',
];

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected date YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'invalid date');
/** Local time HH:MM (24:00 allowed as a closing time). Seconds are accepted and stripped. */
export const localTime = z.string()
  .regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)(:\d{2})?$/, 'expected local time HH:MM')
  .transform((s) => s.slice(0, 5));
/** ISO 8601 timestamp with an explicit offset (Z or +02:00). Local times without offset are ambiguous. */
export const timestampTz = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/,
    'expected ISO timestamp with offset, e.g. 2027-10-02T08:32:00+02:00')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'invalid timestamp');
const httpUrl = z.string().url().refine((s) => /^https?:\/\//.test(s), 'expected http(s) URL');
const json = z.any();

export const openingInterval = z.object({
  open: localTime,
  close: localTime,
  last_entry: localTime.optional(),
}).strict();

/** Missing weekday = unknown, [] = closed all day. */
export const openingHours = z.object(
  Object.fromEntries(WEEKDAYS.map((d) => [d, z.array(openingInterval).optional()])),
).strict();

export const specialHours = z.object({
  date: isoDate,
  closed: z.boolean().optional(),
  hours: z.array(openingInterval).optional(),
  note: z.string().optional(),
}).strict().refine((s) => s.closed === true || (s.hours && s.hours.length > 0) || s.note,
  'special_hours entry needs closed:true, hours or a note')
  .refine((s) => !(s.closed === true && s.hours && s.hours.length > 0), 'special_hours: closed and hours are exclusive');

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export const placeInput = z.object({
  id: uuid.optional(),
  trip_id: uuid,
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  google_place_id: z.string().min(1).nullable().optional(),
  website_url: httpUrl.nullable().optional(),
  google_maps_url: httpUrl.nullable().optional(),
  phone: z.string().nullable().optional(),
  opening_hours: openingHours.nullable().optional(),
  special_hours: z.array(specialHours).optional(),
  metadata: z.record(json).optional(),
}).strict().refine((p) => (p.lat == null) === (p.lng == null), 'lat and lng must be set together');

const cardBase = z.object({
  id: uuid.optional(),
  trip_id: uuid,
  place_id: uuid.nullable().optional(),
  job_id: uuid.nullable().optional(),
  upload_id: uuid.nullable().optional(),
  type: z.enum(CARD_TYPES),
  title: z.string().min(1),
  summary: z.string().nullable().optional(),
  image_url: httpUrl.nullable().optional(),
  research_state: z.enum(RESEARCH_STATES).optional(),
  constraint_kind: z.enum(CONSTRAINT_KINDS).optional(),
  is_fixed: z.boolean().optional(),
  confirmed: z.boolean().optional(),
  fixed_start: timestampTz.nullable().optional(),
  fixed_end: timestampTz.nullable().optional(),
  duration_minutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
  duration_basis: z.string().nullable().optional(),
  window_start: localTime.nullable().optional(),
  window_end: localTime.nullable().optional(),
  reservation_required: z.boolean().nullable().optional(),
  reservation_note: z.string().nullable().optional(),
  price_text: z.string().nullable().optional(),
  price_amount: z.number().min(0).nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 currency, e.g. EUR').nullable().optional(),
  // User-owned: accepted on input only so we can reject them with a clear message.
  day: z.any().optional(),
  position: z.any().optional(),
  swipe_status: z.any().optional(),
  metadata: z.record(json).optional(),
}).strict();

function cardRules(c, ctx) {
  for (const f of ['day', 'position', 'swipe_status']) {
    if (c[f] !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [f],
        message: `${f} is owned by the user's plan; the agent never sets it` });
    }
  }
  if (c.is_fixed && !c.fixed_start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fixed_start'], message: 'is_fixed requires fixed_start' });
  }
  if (c.fixed_start && c.fixed_end && Date.parse(c.fixed_end) < Date.parse(c.fixed_start)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fixed_end'], message: 'fixed_end before fixed_start' });
  }
  if ((c.type === 'buffer' || c.type === 'rest') && c.duration_minutes == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['duration_minutes'], message: 'buffer/rest cards need duration_minutes' });
  }
  if (c.duration_minutes != null && !c.duration_basis) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['duration_basis'],
      message: 'duration_minutes needs duration_basis (e.g. "visit style normal" or "official: allow 2 h")' });
  }
  if ((c.window_start == null) !== (c.window_end == null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['window_end'], message: 'window_start and window_end go together' });
  }
  if (c.price_amount != null && !c.currency) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['currency'], message: 'price_amount needs currency' });
  }
}

/** A new card. New cards always start in the deck/drawer (no day/position). */
export const cardInsert = cardBase.superRefine(cardRules);

/** A patch for an existing card (id required, other fields optional). */
export const cardPatch = cardBase.partial().extend({ id: uuid, trip_id: uuid.optional() }).strict()
  .superRefine((c, ctx) => {
    for (const f of ['day', 'position', 'swipe_status']) {
      if (c[f] !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [f],
          message: `${f} is owned by the user's plan; the agent never sets it` });
      }
    }
    if (c.duration_minutes != null && c.duration_basis === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['duration_basis'], message: 'duration_minutes needs duration_basis' });
    }
    if (c.fixed_start && c.fixed_end && Date.parse(c.fixed_end) < Date.parse(c.fixed_start)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fixed_end'], message: 'fixed_end before fixed_start' });
    }
  });

export const factInput = z.object({
  trip_id: uuid,
  card_id: uuid.nullable().optional(),
  place_id: uuid.nullable().optional(),
  holiday_id: uuid.nullable().optional(),
  field: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, 'field is snake_case, e.g. opening_hours, last_entry'),
  value: json,
  evidence: z.enum(EVIDENCE),
  source_type: z.enum(SOURCE_TYPES),
  url: httpUrl.nullable().optional(),
  title: z.string().nullable().optional(),
  retrieved_at: timestampTz.optional(),
  applies_from: isoDate.nullable().optional(),
  applies_to: isoDate.nullable().optional(),
  basis: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
}).strict().superRefine((f, ctx) => {
  const targets = [f.card_id, f.place_id, f.holiday_id].filter((v) => v != null).length;
  if (targets !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['card_id'],
      message: 'a fact belongs to exactly one of card_id, place_id, holiday_id' });
  }
  const unsourcedOk = ['model', 'upload'].includes(f.source_type) || ['estimated', 'unknown'].includes(f.evidence);
  if (!f.url && !unsourcedOk) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'],
      message: 'sourced facts need url (only model/upload sources or estimated/unknown evidence may omit it)' });
  }
  if (f.evidence === 'estimated' && !f.basis) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['basis'], message: 'estimated facts need a basis' });
  }
  if (f.evidence === 'operator_confirmed' && !['official', 'booking', 'upload', 'event_calendar', 'transit', 'holiday_calendar'].includes(f.source_type)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence'],
      message: 'operator_confirmed needs an operator/official source (official, booking, upload, event_calendar, transit, holiday_calendar)' });
  }
  if (f.evidence !== 'unknown' && f.value === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'value is required unless evidence is unknown' });
  }
  if (f.applies_from && f.applies_to && f.applies_to < f.applies_from) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['applies_to'], message: 'applies_to before applies_from' });
  }
});

export const holidayInput = z.object({
  trip_id: uuid,
  date: isoDate,
  name: z.string().min(1),
  level: z.enum(HOLIDAY_LEVELS),
  region: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  /** Optional source; stored as a fact on the holiday (field "date"). */
  source: z.object({
    url: httpUrl,
    title: z.string().optional(),
    source_type: z.enum(SOURCE_TYPES).default('holiday_calendar'),
    evidence: z.enum(EVIDENCE).default('operator_confirmed'),
  }).strict().optional(),
}).strict();

export const travelInput = z.object({
  trip_id: uuid,
  from_place_id: uuid,
  to_place_id: uuid,
  mode: z.enum(TRAVEL_MODES).default('walk'),
  min_minutes: z.number().int().min(0),
  max_minutes: z.number().int().min(0),
  distance_m: z.number().int().min(0).nullable().optional(),
  basis: z.string().min(1),
}).strict()
  .refine((t) => t.max_minutes >= t.min_minutes, { message: 'max_minutes must be >= min_minutes', path: ['max_minutes'] })
  .refine((t) => t.from_place_id !== t.to_place_id, { message: 'from and to must differ', path: ['to_place_id'] });

export const proposalInput = z.object({
  trip_id: uuid,
  card_id: uuid,
  job_id: uuid.nullable().optional(),
  changes: z.record(json).refine((c) => Object.keys(c).length > 0, 'changes must not be empty'),
  reason: z.string().min(1),
}).strict().superRefine((p, ctx) => {
  for (const k of Object.keys(p.changes)) {
    if (USER_OWNED_CARD_FIELDS.includes(k) && k !== 'day' && k !== 'position') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['changes', k], message: `${k} cannot be proposed` });
    }
  }
  // Validate proposed values with the card patch rules (minus the user-owned guard).
  const { day, position, ...rest } = p.changes;
  const r = cardBase.partial().strict().safeParse(rest);
  if (!r.success) {
    for (const i of r.error.issues) ctx.addIssue({ ...i, path: ['changes', ...i.path] });
  }
});

export const eventInput = z.object({
  trip_id: uuid,
  job_id: uuid.nullable().optional(),
  card_id: uuid.nullable().optional(),
  level: z.enum(EVENT_LEVELS).default('info'),
  message: z.string().min(1).max(500),
  data: json.optional(),
}).strict();

/**
 * One research result in a single write: optional place, optional card (new or patch) and facts.
 * Facts may omit trip_id/card_id/place_id; they default to the card unless `target: "place"`.
 * Facts about opening hours, special hours, address and coordinates default to the place.
 */
export const PLACE_FIELDS = new Set(['opening_hours', 'special_hours', 'address', 'coordinates', 'phone',
  'website_url', 'google_maps_url', 'last_entry', 'seasonal_hours', 'closure']);

export const ingestInput = z.object({
  trip_id: uuid,
  job_id: uuid.nullable().optional(),
  place: placeInput.innerType().omit({ trip_id: true }).partial({ name: true })
    .extend({ trip_id: uuid.optional() }).optional(),
  card: z.record(json).optional(),
  facts: z.array(z.record(json)).optional(),
}).strict();

/** Format a ZodError into short lines for the agent. */
export function formatZodError(err) {
  return err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}

export class ValidationError extends Error {
  constructor(what, zodError) {
    super(`invalid ${what}:\n${formatZodError(zodError)}`);
    this.name = 'ValidationError';
    this.issues = zodError.issues;
  }
}

/** Parse or throw a ValidationError with readable messages. */
export function parse(schema, value, what) {
  const r = schema.safeParse(value);
  if (!r.success) throw new ValidationError(what, r.error);
  return r.data;
}
