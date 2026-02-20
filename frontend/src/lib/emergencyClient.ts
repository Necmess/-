import type { Place, OpenStatus } from '../types/triage';

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000';

// ---------------------------------------------------------------------------
// Types returned by /api/emergency/nearby
// ---------------------------------------------------------------------------

export interface EmergencyPlace {
  name:             string;
  address:          string;
  phone:            string | null;
  lat:              number | null;
  lng:              number | null;
  distance_km:      number;
  institution_type: string;
  notes:            string | null;
  open_status:      OpenStatus;
  open_until:       string | null;
  source:           string;
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

export async function fetchNearbyEmergency(params: {
  lat:       number;
  lng:       number;
  q0:        string;
  q1?:       string;
  radiusKm?: number;
  limit?:    number;
}): Promise<EmergencyPlace[]> {
  const url = new URL(`${BASE_URL}/api/emergency/nearby`);
  url.searchParams.set('lat', String(params.lat));
  url.searchParams.set('lng', String(params.lng));
  url.searchParams.set('q0',  params.q0);
  if (params.q1)       url.searchParams.set('q1',        params.q1);
  if (params.radiusKm) url.searchParams.set('radius_km', String(params.radiusKm));
  if (params.limit)    url.searchParams.set('limit',     String(params.limit));

  const resp = await fetch(url.toString());
  if (resp.status === 503) throw new Error('DATA_GO_KR_SERVICE_KEY not configured');
  if (!resp.ok) throw new Error(`emergency/nearby HTTP ${resp.status}`);

  const data = await resp.json() as { places: EmergencyPlace[] };
  return data.places;
}

// ---------------------------------------------------------------------------
// Mapper: EmergencyPlace → Place
// Maps the emergency API shape into the shared Place interface so the
// existing ranking, panel, and marker components work without changes.
// ---------------------------------------------------------------------------

export function emergencyToPlace(ep: EmergencyPlace, index: number): Place {
  return {
    id:                `emergency-${index}`,
    source:            'EMERGENCY',
    name:              ep.name,
    category:          'emergency_room',
    address:           ep.address,
    lat:               ep.lat  ?? 0,
    lng:               ep.lng  ?? 0,
    distance_km:       ep.distance_km,
    open_status:       ep.open_status,
    suitability_score: 1.0,
    // Pre-ranked by the backend (distance order); score decreases with rank
    final_score:       Math.max(0, 100 - index * 10),
    safe_mode_applied: true,
    rank_reason:       ep.institution_type || '응급의료기관',
  };
}
