import {
  Bed, Building2, Coffee, Footprints, Landmark, Moon, Music, PartyPopper, Plane, ShoppingBag, Sparkles, Timer,
  TrainFront, Trees, UtensilsCrossed, Car, Hourglass, MapPin, type LucideIcon,
} from 'lucide-react';
import type { Card, CardType, Evidence, ResearchState, SourceType, TravelMode, IssueSeverity } from '@shared/types';

export interface TypeMeta {
  label: string;
  icon: LucideIcon;
  /** Two gradient stops for card art. */
  from: string;
  to: string;
}

export const TYPE_META: Record<CardType, TypeMeta> = {
  arrival: { label: 'Arrival', icon: TrainFront, from: '#5b7cfa', to: '#3a4fc4' },
  departure: { label: 'Departure', icon: TrainFront, from: '#5b7cfa', to: '#3a4fc4' },
  hotel: { label: 'Hotel', icon: Bed, from: '#c98d5a', to: '#8a5a35' },
  meal: { label: 'Food', icon: UtensilsCrossed, from: '#ff8a5c', to: '#e5533d' },
  sight: { label: 'Sight', icon: Landmark, from: '#f4b740', to: '#d9822b' },
  museum: { label: 'Museum', icon: Building2, from: '#9b7bf7', to: '#6447d6' },
  activity: { label: 'Activity', icon: Sparkles, from: '#2fc4b2', to: '#178f8a' },
  event: { label: 'Event', icon: PartyPopper, from: '#ff6f91', to: '#d63d6a' },
  nightlife: { label: 'Nightlife', icon: Moon, from: '#5a4bb5', to: '#2b2466' },
  shopping: { label: 'Shopping', icon: ShoppingBag, from: '#f28cc0', to: '#c4558f' },
  nature: { label: 'Nature', icon: Trees, from: '#5cc480', to: '#2c8a50' },
  buffer: { label: 'Buffer', icon: Hourglass, from: '#b9b3a8', to: '#8d877c' },
  rest: { label: 'Rest', icon: Coffee, from: '#b9b3a8', to: '#8d877c' },
  other: { label: 'Other', icon: MapPin, from: '#8aa0b8', to: '#5b6f86' },
};

export function cardIcon(card: Pick<Card, 'type' | 'metadata'>): LucideIcon {
  const mode = card.metadata?.mode;
  if (card.type === 'arrival' || card.type === 'departure') {
    if (mode === 'plane') return Plane;
    if (mode === 'car') return Car;
  }
  if (card.type === 'event' && /concert|music/i.test(String(card.metadata?.category ?? ''))) return Music;
  return TYPE_META[card.type]?.icon ?? MapPin;
}

export const TRAVEL_ICON: Record<TravelMode, LucideIcon> = { walk: Footprints, transit: TrainFront, drive: Car, bike: Timer };
export const TRAVEL_LABEL: Record<TravelMode, string> = { walk: 'Walk', transit: 'Transit', drive: 'Drive', bike: 'Bike' };

export const RESEARCH_LABEL: Record<ResearchState, string> = {
  pending: 'Queued',
  researching: 'Researching',
  ready: 'Ready',
  needs_checking: 'Needs checking',
  failed: 'Research failed',
};

export const EVIDENCE_META: Record<Evidence, { label: string; tone: 'ok' | 'info' | 'est' | 'unknown' | 'conflict'; hint: string }> = {
  operator_confirmed: { label: 'Operator confirmed', tone: 'ok', hint: 'Confirmed by the venue for the trip date' },
  regular_hours: { label: 'Regular hours', tone: 'info', hint: 'Supported by regular published hours' },
  estimated: { label: 'Estimated', tone: 'est', hint: 'An estimate; see basis' },
  unknown: { label: 'Unknown', tone: 'unknown', hint: 'Not published or not found' },
  conflicting: { label: 'Conflicting', tone: 'conflict', hint: 'Sources disagree' },
};

export const SOURCE_LABEL: Record<SourceType, string> = {
  official: 'Official site', google_maps: 'Google Maps', tourism_board: 'Tourism board', travel_guide: 'Travel guide',
  restaurant_guide: 'Restaurant guide', event_calendar: 'Event calendar', holiday_calendar: 'Holiday calendar',
  transit: 'Transit', booking: 'Booking', upload: 'Your upload', model: 'AI estimate', other: 'Source',
};

export const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  blocker: 'Conflict',
  warning: 'Preference',
  needs_checking: 'Needs checking',
};

export const FIELD_LABEL: Record<string, string> = {
  opening_hours: 'Opening hours', special_hours: 'Holiday / special hours', last_entry: 'Last entry', duration: 'Duration',
  price: 'Price', holiday: 'Public holiday', fixed_start: 'Fixed time', event_dates: 'Event dates', breakfast: 'Breakfast',
  glockenspiel_times: 'Show times', 'opening_hours.sun': 'Sunday hours', closed: 'Closure', closure: 'Closure', holiday_hours: 'Holiday hours',
};

export function fieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? field.replace(/[_.]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
