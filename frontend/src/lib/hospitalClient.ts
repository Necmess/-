import type { Place, OpenStatus } from '../types/triage';

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000';

// ---------------------------------------------------------------------------
// Types returned by /api/hospitals/nearby
// ---------------------------------------------------------------------------

export interface HospitalPlace {
  name:          string;
  address:       string;
  phone:         string | null;
  lat:           number | null;
  lng:           number | null;
  distance_km:   number;
  category:      string;      // "clinic" | "hospital"
  duty_div_name: string;      // raw 종별구분명
  open_status:   OpenStatus;
  open_until:    string | null;
  source:        string;
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

export async function fetchNearbyHospitals(params: {
  lat:       number;
  lng:       number;
  q0:        string;
  q1?:       string;
  radiusKm?: number;
  limit?:    number;
}): Promise<HospitalPlace[]> {
  const url = new URL(`${BASE_URL}/api/hospitals/nearby`);
  url.searchParams.set('lat', String(params.lat));
  url.searchParams.set('lng', String(params.lng));
  url.searchParams.set('q0',  params.q0);
  if (params.q1)       url.searchParams.set('q1',        params.q1);
  if (params.radiusKm) url.searchParams.set('radius_km', String(params.radiusKm));
  if (params.limit)    url.searchParams.set('limit',     String(params.limit));

  const resp = await fetch(url.toString());
  if (resp.status === 503) throw new Error('DATA_GO_KR_SERVICE_KEY not configured');
  if (!resp.ok) throw new Error(`hospitals/nearby HTTP ${resp.status}`);

  const data = await resp.json() as { places: HospitalPlace[] };
  return data.places;
}

// ---------------------------------------------------------------------------
// Mapper: HospitalPlace → Place
// Maps the API shape into the shared Place interface so rankPlaces() and
// existing UI components work unchanged.
// ---------------------------------------------------------------------------

export function hospitalToPlace(hp: HospitalPlace, index: number): Place {
  return {
    id:                `hospital-api-${index}`,
    source:            'HOSPITAL',
    name:              hp.name,
    category:          hp.category,     // "clinic" | "hospital" from backend mapping
    address:           hp.address,
    lat:               hp.lat  ?? 0,
    lng:               hp.lng  ?? 0,
    distance_km:       hp.distance_km,
    open_status:       hp.open_status,
    suitability_score: 0.7,             // reasonable default; overridden by rankPlaces
    final_score:       0,               // overwritten by rankPlaces
    safe_mode_applied: false,
  };
}
