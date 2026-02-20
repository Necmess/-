export type TriageLevel = 'GREEN' | 'AMBER' | 'RED' | null;

export type OpenStatus = 'OPEN' | 'CLOSED' | 'UNKNOWN';

/**
 * Logical data tier for a place.
 * Drives ranking weights and UI labels — never uses `category`.
 *
 *  PHARMACY   — pharmacies (from pharmacy CSV / data.go.kr)
 *  OTC_STORE  — convenience/mart stores that sell OTC medicine
 *  HOSPITAL   — general clinics and hospitals
 *  EMERGENCY  — designated emergency medical institutions
 */
export type PlaceSource = 'PHARMACY' | 'OTC_STORE' | 'HOSPITAL' | 'EMERGENCY';

export interface Place {
  id:       string;
  name:     string;
  source:   PlaceSource;  // authoritative origin — drives UI labels
  category: string;       // internal classifier — drives filtering/ranking only

  // Primary display address (도로명주소 preferred, jibun as fallback)
  address:       string;
  address_road?: string;   // 도로명주소 — from CSV column
  address_jibun?: string;  // 지번주소   — from CSV column

  // Region fields derived by parseAddressRegion; populated at load time
  q0?:         string;     // 시/도  e.g. "서울특별시"
  q1?:         string;     // 시/군/구 primary  e.g. "성남시 분당구"
  q1Fallback?: string;     // 시 alone when q1 is 시+구  e.g. "성남시"

  lat: number;
  lng: number;
  distance_km: number;
  open_status: OpenStatus;
  suitability_score: number;
  final_score: number;
  safe_mode_applied: boolean;
  rank_reason?: string;   // computed by rankingEngine — shown in UI
}

export interface SafeModeResult {
  applied: boolean;
  no_result: boolean;
}

export interface Turn {
  turn_id: string;
  transcript: string;
  triage_level: TriageLevel;
  top5_places: Place[];
  tts_audio_url: string | null;
  safe_mode_result: SafeModeResult;
}
