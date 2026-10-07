// Domain types shared by web/, planner/ and agent/.
// Mirrors supabase/migrations/*_init_schema.sql. Keep both in sync.
// Dates are ISO strings: date = "2027-10-02", time = "09:30" (local, HH:MM), timestamp = ISO 8601 with offset.

export type TripStep = 'preferences' | 'swiping' | 'scheduling';
export type VisitStyle = 'short' | 'normal' | 'long';
export type Pace = 'relaxed' | 'balanced' | 'packed';
export type UploadStatus = 'uploaded' | 'parsing' | 'parsed' | 'failed';
export type CardType =
  | 'arrival' | 'departure' | 'hotel' | 'meal' | 'sight' | 'museum'
  | 'activity' | 'event' | 'nightlife' | 'shopping' | 'nature' | 'buffer' | 'rest' | 'other';
export type SwipeStatus = 'suggested' | 'accepted' | 'rejected';
export type ResearchState = 'pending' | 'researching' | 'ready' | 'needs_checking' | 'failed';
export type ConstraintKind = 'hard' | 'preference' | 'assumption';
export type Evidence = 'operator_confirmed' | 'regular_hours' | 'estimated' | 'unknown' | 'conflicting';
export type SourceType =
  | 'official' | 'google_maps' | 'tourism_board' | 'travel_guide' | 'restaurant_guide' | 'event_calendar'
  | 'holiday_calendar' | 'transit' | 'booking' | 'upload' | 'model' | 'other';
export type HolidayLevel = 'national' | 'regional' | 'city';
export type TravelMode = 'walk' | 'transit' | 'drive' | 'bike';
export type JobKind = 'initial_suggestions' | 'search_again' | 'research_card' | 'refresh_card' | 'parse_upload';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export type ProposalStatus = 'pending' | 'accepted' | 'rejected';
export type EventLevel = 'info' | 'progress' | 'warning' | 'error';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** One opening interval in local time. close may be "24:00"; close < open means past midnight. */
export interface OpeningInterval {
  open: string;
  close: string;
  last_entry?: string;
}

/** Missing weekday key = unknown, empty array = closed all day. */
export type OpeningHours = Partial<Record<Weekday, OpeningInterval[]>>;

/** Documented date-specific exception. A holiday alone does not imply closure. */
export interface SpecialHours {
  date: string;
  closed?: boolean;
  hours?: OpeningInterval[];
  note?: string;
}

export interface Trip {
  id: string;
  title: string | null;
  city: string;
  region: string | null;
  country_code: string;
  timezone: string;
  start_date: string;
  end_date: string;
  step: TripStep;
  is_demo: boolean;
  cloned_from: string | null;
  created_at: string;
  updated_at: string;
}

export interface Preferences {
  trip_id: string;
  breakfast_time: string | null;
  lunch_time: string | null;
  dinner_time: string | null;
  /** 0 = not at all ... 3 = very important */
  nightlife_importance: number;
  interests: string[];
  visit_style: VisitStyle;
  pace: Pace;
  default_buffer_minutes: number;
  free_text: string | null;
  updated_at: string;
}

export interface Upload {
  id: string;
  trip_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  status: UploadStatus;
  parsed: unknown;
  created_at: string;
}

export interface Place {
  id: string;
  trip_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  phone: string | null;
  opening_hours: OpeningHours | null;
  special_hours: SpecialHours[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ResearchJob {
  id: string;
  trip_id: string;
  kind: JobKind;
  query: string | null;
  window_day: string | null;
  window_start: string | null;
  window_end: string | null;
  card_id: string | null;
  upload_id: string | null;
  status: JobStatus;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Card {
  id: string;
  trip_id: string;
  place_id: string | null;
  job_id: string | null;
  upload_id: string | null;
  type: CardType;
  title: string;
  summary: string | null;
  image_url: string | null;
  swipe_status: SwipeStatus;
  research_state: ResearchState;
  constraint_kind: ConstraintKind;
  is_fixed: boolean;
  /** false = extracted from an upload, waiting for the user to confirm */
  confirmed: boolean;
  fixed_start: string | null;
  fixed_end: string | null;
  duration_minutes: number | null;
  duration_basis: string | null;
  window_start: string | null;
  window_end: string | null;
  reservation_required: boolean | null;
  reservation_note: string | null;
  price_text: string | null;
  price_amount: number | null;
  currency: string | null;
  /** null = in the drawer */
  day: string | null;
  position: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Holiday {
  id: string;
  trip_id: string;
  date: string;
  name: string;
  level: HolidayLevel;
  region: string | null;
  note: string | null;
  created_at: string;
}

export interface Fact {
  id: string;
  trip_id: string;
  card_id: string | null;
  place_id: string | null;
  holiday_id: string | null;
  field: string;
  value: unknown;
  evidence: Evidence;
  source_type: SourceType;
  url: string | null;
  title: string | null;
  retrieved_at: string;
  applies_from: string | null;
  applies_to: string | null;
  basis: string | null;
  note: string | null;
}

export interface TravelTime {
  trip_id: string;
  from_place_id: string;
  to_place_id: string;
  mode: TravelMode;
  min_minutes: number;
  /** Planning uses the upper bound. */
  max_minutes: number;
  distance_m: number | null;
  basis: string | null;
  computed_at: string;
}

export interface CardChangeProposal {
  id: string;
  trip_id: string;
  card_id: string;
  job_id: string | null;
  changes: Partial<Card>;
  reason: string | null;
  status: ProposalStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface AgentEvent {
  id: number;
  trip_id: string;
  job_id: string | null;
  card_id: string | null;
  level: EventLevel;
  message: string;
  data: unknown;
  created_at: string;
}

/** Everything the planner and UI need for one trip. */
export interface TripBundle {
  trip: Trip;
  preferences: Preferences | null;
  places: Place[];
  cards: Card[];
  holidays: Holiday[];
  facts: Fact[];
  travel_times: TravelTime[];
}

// ---------------------------------------------------------------------------
// Planner contract (implemented in planner/, used by web/)
// ---------------------------------------------------------------------------

export type IssueSeverity = 'blocker' | 'warning' | 'needs_checking';

export type IssueCode =
  | 'closed'                 // venue closed on that day (documented)
  | 'outside_opening_hours'  // visit does not fit entirely in an opening window
  | 'after_last_entry'
  | 'fixed_overlap'          // overlaps or cannot reach a fixed appointment
  | 'outside_window'         // outside the card's own time window (e.g. breakfast 07:00-10:30)
  | 'preference_deviation'   // e.g. dinner far from preferred time
  | 'unknown_hours'          // opening hours unknown for that date
  | 'conflicting_facts'
  | 'holiday_hours_unconfirmed'
  | 'missing_travel_time'
  | 'unconfirmed_booking'
  | 'day_overflow';          // runs past midnight / past end of day

export interface ScheduleIssue {
  card_id: string;
  severity: IssueSeverity;
  code: IssueCode;
  /** Human-readable, English, e.g. "Visit ends after the museum closes at 17:00" */
  message: string;
}

export interface ScheduledCard {
  card_id: string;
  /** Local HH:MM */
  start: string;
  end: string;
  /** Travel gap before this card (from the previous card's place), upper bound used for planning. */
  travel_before: { min_minutes: number; max_minutes: number; mode: TravelMode } | null;
  issues: ScheduleIssue[];
}

export interface DaySchedule {
  day: string;
  items: ScheduledCard[];
  issues: ScheduleIssue[];
}
