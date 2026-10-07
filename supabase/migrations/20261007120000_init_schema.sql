-- Ausflieger: initial schema
--
-- Flow: trip -> preferences -> research jobs -> suggested cards (swipe) -> accepted cards -> schedule.
-- The research agent supplies structured facts with evidence; deterministic client-side
-- logic checks the schedule. The agent never silently moves scheduled cards: changes
-- to them go through card_change_proposals.
--
-- The agent writes with the service role (bypasses RLS). The frontend uses the anon
-- key; there is no login yet, a trip is accessed by its uuid.
-- Demo trips (is_demo) are read-only for the frontend and get cloned per visit.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.trip_step as enum ('preferences', 'swiping', 'scheduling');
create type public.visit_style as enum ('short', 'normal', 'long');
create type public.pace as enum ('relaxed', 'balanced', 'packed');
create type public.upload_status as enum ('uploaded', 'parsing', 'parsed', 'failed');
create type public.card_type as enum (
  'arrival', 'departure', 'hotel', 'meal', 'sight', 'museum',
  'activity', 'event', 'nightlife', 'shopping', 'nature', 'buffer', 'rest', 'other'
);
create type public.swipe_status as enum ('suggested', 'accepted', 'rejected');
create type public.research_state as enum ('pending', 'researching', 'ready', 'needs_checking', 'failed');
-- hard: booked train, fixed event time. preference: dinner around 19:00. assumption: estimated duration.
create type public.constraint_kind as enum ('hard', 'preference', 'assumption');
-- Evidence for a single fact, strongest first.
create type public.evidence as enum ('operator_confirmed', 'regular_hours', 'estimated', 'unknown', 'conflicting');
create type public.source_type as enum (
  'official', 'google_maps', 'tourism_board', 'travel_guide', 'restaurant_guide', 'event_calendar',
  'holiday_calendar', 'transit', 'booking', 'upload', 'model', 'other'
);
create type public.holiday_level as enum ('national', 'regional', 'city');
create type public.travel_mode as enum ('walk', 'transit', 'drive', 'bike');
create type public.job_kind as enum ('initial_suggestions', 'search_again', 'research_card', 'refresh_card', 'parse_upload');
create type public.job_status as enum ('queued', 'running', 'done', 'failed');
create type public.proposal_status as enum ('pending', 'accepted', 'rejected');
create type public.event_level as enum ('info', 'progress', 'warning', 'error');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.trips (
  id           uuid primary key default gen_random_uuid(),
  title        text,
  city         text not null,
  region       text,                         -- state / canton / province, for regional holidays
  country_code char(2) not null,             -- ISO 3166-1 alpha-2
  timezone     text not null,                -- IANA, e.g. Europe/Berlin
  start_date   date not null,
  end_date     date not null,
  step         public.trip_step not null default 'preferences',
  is_demo      boolean not null default false,
  cloned_from  uuid references public.trips (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.preferences (
  trip_id                uuid primary key references public.trips (id) on delete cascade,
  breakfast_time         time,
  lunch_time             time,
  dinner_time            time,
  nightlife_importance   smallint not null default 1 check (nightlife_importance between 0 and 3),
  interests              text[] not null default '{}',   -- museums, culture, nature, food, ...
  visit_style            public.visit_style not null default 'normal',
  pace                   public.pace not null default 'balanced',
  default_buffer_minutes integer not null default 15 check (default_buffer_minutes >= 0),
  free_text              text,
  updated_at             timestamptz not null default now()
);

create table public.uploads (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id) on delete cascade,
  storage_path text not null,               -- path inside the 'uploads' bucket
  file_name    text not null,
  mime_type    text,
  status       public.upload_status not null default 'uploaded',
  parsed       jsonb,                       -- extracted bookings, times, addresses
  created_at   timestamptz not null default now()
);

-- A physical location. Several cards can share one place (hotel: check-in,
-- breakfast, check-out). The travel time matrix is between places.
create table public.places (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips (id) on delete cascade,
  name             text not null,
  address          text,
  lat              double precision check (lat between -90 and 90),
  lng              double precision check (lng between -180 and 180),
  google_place_id  text,
  website_url      text,
  google_maps_url  text,
  phone            text,
  -- Regular hours, local time. Missing weekday key = unknown, empty array = closed.
  -- {"mon": [{"open": "09:00", "close": "17:00", "last_entry": "16:30"}], "tue": [], ...}
  opening_hours    jsonb,
  -- Documented date-specific exceptions only (a holiday alone does not imply closure):
  -- [{"date": "2027-10-03", "closed": true, "note": "..."},
  --  {"date": "2027-10-03", "hours": [{"open": "10:00", "close": "14:00"}]}]
  special_hours    jsonb not null default '[]',
  metadata         jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (trip_id, google_place_id)
);

-- Research and search requests. The frontend inserts them, the agent works them off.
create table public.research_jobs (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id) on delete cascade,
  kind         public.job_kind not null,
  query        text,                         -- "more indoor activities", "cheaper dinner"
  -- Optional free time window the search should fit: day + local times.
  window_day   date,
  window_start time,
  window_end   time,
  card_id      uuid,                         -- for research_card / refresh_card (fk added below)
  upload_id    uuid references public.uploads (id) on delete cascade,
  status       public.job_status not null default 'queued',
  error        text,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

create table public.cards (
  id                   uuid primary key default gen_random_uuid(),
  trip_id              uuid not null references public.trips (id) on delete cascade,
  place_id             uuid references public.places (id) on delete set null,
  job_id               uuid references public.research_jobs (id) on delete set null,  -- job that created it
  upload_id            uuid references public.uploads (id) on delete set null,        -- extracted from an upload
  type                 public.card_type not null,
  title                text not null,
  summary              text,
  image_url            text,
  swipe_status         public.swipe_status not null default 'suggested',
  research_state       public.research_state not null default 'pending',
  constraint_kind      public.constraint_kind not null default 'assumption',
  -- Fixed cards (booked train, flight, reservation) cannot be moved.
  is_fixed             boolean not null default false,
  -- Times extracted from uploads are shown for confirmation before they become locked.
  confirmed            boolean not null default true,
  fixed_start          timestamptz,
  fixed_end            timestamptz,
  -- Editable estimate; basis says where it came from.
  duration_minutes     integer check (duration_minutes >= 0),
  duration_basis       text,                  -- "visit style normal", "official: allow 2 h"
  -- Daily window in local time on top of opening hours (hotel breakfast 07:00-10:30,
  -- or a preferred meal time for constraint_kind = preference).
  window_start         time,
  window_end           time,
  reservation_required boolean,
  reservation_note     text,
  price_text           text,
  price_amount         numeric(10, 2),
  currency             char(3),
  -- Schedule position. day null = card lives in the drawer.
  -- Start times are not stored: the client derives them from order, durations and travel times.
  day                  date,
  position             integer,
  metadata             jsonb not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (not is_fixed or fixed_start is not null),
  check (fixed_end is null or fixed_start is null or fixed_end >= fixed_start),
  check ((day is null) = (position is null)),
  check (type not in ('buffer', 'rest') or duration_minutes is not null)
);

alter table public.research_jobs
  add constraint research_jobs_card_id_fkey foreign key (card_id) references public.cards (id) on delete cascade;

create table public.holidays (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  date       date not null,
  name       text not null,
  level      public.holiday_level not null,
  region     text,                            -- which region / city it applies to
  note       text,
  created_at timestamptz not null default now(),
  unique (trip_id, date, name, level)
);

-- Fact-level evidence: one row per claim per source. Conflicting claims are kept side by side.
create table public.facts (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id) on delete cascade,
  card_id      uuid references public.cards (id) on delete cascade,
  place_id     uuid references public.places (id) on delete cascade,
  holiday_id   uuid references public.holidays (id) on delete cascade,
  field        text not null,                 -- opening_hours, special_hours, last_entry, duration, breakfast, price, ...
  value        jsonb,
  evidence     public.evidence not null,
  source_type  public.source_type not null,
  url          text,
  title        text,
  retrieved_at timestamptz not null default now(),
  applies_from date,                          -- date range the claim is valid for; null = open
  applies_to   date,
  basis        text,                          -- for estimates: what the estimate is based on
  note         text,
  check (num_nonnulls(card_id, place_id, holiday_id) = 1),
  check (url is not null or source_type in ('model', 'upload') or evidence in ('estimated', 'unknown')),
  check (applies_to is null or applies_from is null or applies_to >= applies_from)
);

-- Cached walking-time estimates (ranges). Planning uses max_minutes; missing pair = needs checking.
create table public.travel_times (
  trip_id       uuid not null references public.trips (id) on delete cascade,
  from_place_id uuid not null references public.places (id) on delete cascade,
  to_place_id   uuid not null references public.places (id) on delete cascade,
  mode          public.travel_mode not null default 'walk',
  min_minutes   integer not null check (min_minutes >= 0),
  max_minutes   integer not null,
  distance_m    integer check (distance_m >= 0),
  basis         text,                         -- "straight-line distance x 1.3 at 4.5 km/h", "routing tool"
  computed_at   timestamptz not null default now(),
  primary key (from_place_id, to_place_id, mode),
  check (from_place_id <> to_place_id),
  check (max_minutes >= min_minutes)
);

-- Research refresh results that would change a scheduled card. The user accepts or rejects.
create table public.card_change_proposals (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  card_id     uuid not null references public.cards (id) on delete cascade,
  job_id      uuid references public.research_jobs (id) on delete set null,
  changes     jsonb not null,                 -- {"duration_minutes": 150, ...}: new values for card columns
  reason      text,                           -- shown with the impact
  status      public.proposal_status not null default 'pending',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- Live progress log of the agent, streamed to the UI.
create table public.agent_events (
  id         bigint generated always as identity primary key,
  trip_id    uuid not null references public.trips (id) on delete cascade,
  job_id     uuid references public.research_jobs (id) on delete set null,
  card_id    uuid references public.cards (id) on delete set null,
  level      public.event_level not null default 'info',
  message    text not null,
  data       jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index on public.uploads (trip_id);
create index on public.places (trip_id);
create index on public.research_jobs (trip_id, status);
create index on public.research_jobs (status, created_at);
create index on public.cards (trip_id, swipe_status);
create index on public.cards (trip_id, day, position);
create index on public.cards (place_id);
create index on public.holidays (trip_id, date);
create index on public.facts (trip_id);
create index on public.facts (card_id);
create index on public.facts (place_id);
create index on public.facts (holiday_id);
create index on public.travel_times (trip_id);
create index on public.card_change_proposals (trip_id, status);
create index on public.agent_events (trip_id, created_at);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger trips_updated_at before update on public.trips
  for each row execute function public.set_updated_at();
create trigger preferences_updated_at before update on public.preferences
  for each row execute function public.set_updated_at();
create trigger places_updated_at before update on public.places
  for each row execute function public.set_updated_at();
create trigger cards_updated_at before update on public.cards
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Status per fact: conflicting if sources disagree, otherwise the strongest evidence.
-- Source count alone does not establish confidence.
-- ---------------------------------------------------------------------------

create view public.fact_status with (security_invoker = true) as
select
  trip_id,
  card_id,
  place_id,
  holiday_id,
  field,
  count(*)                                                   as n_claims,
  count(distinct value) filter (where evidence <> 'unknown') as n_values,
  array_agg(distinct source_type)                            as source_types,
  case
    when count(distinct value) filter (where evidence not in ('unknown', 'estimated')) > 1 then 'conflicting'
    when bool_or(evidence = 'conflicting') then 'conflicting'
    else min(evidence)
  end::public.evidence                                       as evidence
from public.facts
group by trip_id, card_id, place_id, holiday_id, field;

-- ---------------------------------------------------------------------------
-- Clone a demo trip for one visitor
-- ---------------------------------------------------------------------------

create function public.clone_trip(source_trip_id uuid) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_trip_id uuid := gen_random_uuid();
begin
  if not exists (select 1 from trips where id = source_trip_id and is_demo) then
    raise exception 'trip % is not a demo trip', source_trip_id;
  end if;

  create temp table _place_map   (old_id uuid primary key, new_id uuid not null) on commit drop;
  create temp table _card_map    (old_id uuid primary key, new_id uuid not null) on commit drop;
  create temp table _holiday_map (old_id uuid primary key, new_id uuid not null) on commit drop;
  create temp table _upload_map  (old_id uuid primary key, new_id uuid not null) on commit drop;

  insert into _place_map   select id, gen_random_uuid() from places   where trip_id = source_trip_id;
  insert into _card_map    select id, gen_random_uuid() from cards    where trip_id = source_trip_id;
  insert into _holiday_map select id, gen_random_uuid() from holidays where trip_id = source_trip_id;
  insert into _upload_map  select id, gen_random_uuid() from uploads  where trip_id = source_trip_id;

  insert into trips (id, title, city, region, country_code, timezone, start_date, end_date, step, is_demo, cloned_from)
  select new_trip_id, title, city, region, country_code, timezone, start_date, end_date, step, false, id
  from trips where id = source_trip_id;

  insert into preferences (trip_id, breakfast_time, lunch_time, dinner_time, nightlife_importance,
                           interests, visit_style, pace, default_buffer_minutes, free_text)
  select new_trip_id, breakfast_time, lunch_time, dinner_time, nightlife_importance,
         interests, visit_style, pace, default_buffer_minutes, free_text
  from preferences where trip_id = source_trip_id;

  insert into uploads (id, trip_id, storage_path, file_name, mime_type, status, parsed)
  select m.new_id, new_trip_id, u.storage_path, u.file_name, u.mime_type, u.status, u.parsed
  from uploads u join _upload_map m on m.old_id = u.id;

  insert into places (id, trip_id, name, address, lat, lng, google_place_id, website_url, google_maps_url,
                      phone, opening_hours, special_hours, metadata)
  select m.new_id, new_trip_id, p.name, p.address, p.lat, p.lng, p.google_place_id, p.website_url,
         p.google_maps_url, p.phone, p.opening_hours, p.special_hours, p.metadata
  from places p join _place_map m on m.old_id = p.id;

  insert into cards (id, trip_id, place_id, upload_id, type, title, summary, image_url, swipe_status,
                     research_state, constraint_kind, is_fixed, confirmed, fixed_start, fixed_end,
                     duration_minutes, duration_basis, window_start, window_end, reservation_required,
                     reservation_note, price_text, price_amount, currency, day, position, metadata)
  select cm.new_id, new_trip_id, pm.new_id, um.new_id, c.type, c.title, c.summary, c.image_url, c.swipe_status,
         c.research_state, c.constraint_kind, c.is_fixed, c.confirmed, c.fixed_start, c.fixed_end,
         c.duration_minutes, c.duration_basis, c.window_start, c.window_end, c.reservation_required,
         c.reservation_note, c.price_text, c.price_amount, c.currency, c.day, c.position, c.metadata
  from cards c
  join _card_map cm on cm.old_id = c.id
  left join _place_map pm on pm.old_id = c.place_id
  left join _upload_map um on um.old_id = c.upload_id;

  insert into holidays (id, trip_id, date, name, level, region, note)
  select m.new_id, new_trip_id, h.date, h.name, h.level, h.region, h.note
  from holidays h join _holiday_map m on m.old_id = h.id;

  insert into facts (trip_id, card_id, place_id, holiday_id, field, value, evidence, source_type, url, title,
                     retrieved_at, applies_from, applies_to, basis, note)
  select new_trip_id, cm.new_id, pm.new_id, hm.new_id, f.field, f.value, f.evidence, f.source_type, f.url,
         f.title, f.retrieved_at, f.applies_from, f.applies_to, f.basis, f.note
  from facts f
  left join _card_map cm on cm.old_id = f.card_id
  left join _place_map pm on pm.old_id = f.place_id
  left join _holiday_map hm on hm.old_id = f.holiday_id
  where f.trip_id = source_trip_id;

  insert into travel_times (trip_id, from_place_id, to_place_id, mode, min_minutes, max_minutes, distance_m,
                            basis, computed_at)
  select new_trip_id, f.new_id, t.new_id, tt.mode, tt.min_minutes, tt.max_minutes, tt.distance_m, tt.basis,
         tt.computed_at
  from travel_times tt
  join _place_map f on f.old_id = tt.from_place_id
  join _place_map t on t.old_id = tt.to_place_id
  where tt.trip_id = source_trip_id;

  drop table _place_map, _card_map, _holiday_map, _upload_map;
  return new_trip_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security (no login yet)
-- Everyone can read. Everyone can write, except to demo trips.
-- The agent uses the service role and bypasses RLS.
-- ---------------------------------------------------------------------------

create function public.trip_is_editable(t uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from trips where id = t and not is_demo) $$;

alter table public.trips enable row level security;

create policy trips_read   on public.trips for select to anon, authenticated using (true);
create policy trips_insert on public.trips for insert to anon, authenticated with check (not is_demo);
create policy trips_update on public.trips for update to anon, authenticated
  using (not is_demo) with check (not is_demo);
create policy trips_delete on public.trips for delete to anon, authenticated using (not is_demo);

-- Same policies for every trip-scoped table.
do $$
declare
  t text;
begin
  foreach t in array array['preferences', 'uploads', 'places', 'research_jobs', 'cards', 'holidays', 'facts',
                           'travel_times', 'card_change_proposals', 'agent_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %1$s_read on public.%1$I for select to anon, authenticated using (true)', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to anon, authenticated
                    with check (public.trip_is_editable(trip_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to anon, authenticated
                    using (public.trip_is_editable(trip_id)) with check (public.trip_is_editable(trip_id))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to anon, authenticated
                    using (public.trip_is_editable(trip_id))', t);
  end loop;
end;
$$;

grant execute on function public.clone_trip(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: cards stream into the swipe deck / drawer; job status, proposals and progress log
-- ---------------------------------------------------------------------------

alter table public.cards replica identity full;
alter publication supabase_realtime add table
  public.cards, public.places, public.facts, public.travel_times,
  public.research_jobs, public.card_change_proposals, public.agent_events;

-- ---------------------------------------------------------------------------
-- Storage bucket for uploaded PDFs / tickets
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

create policy uploads_bucket_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'uploads');
create policy uploads_bucket_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'uploads');
