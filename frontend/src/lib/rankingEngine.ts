/**
 * Rule-based ranking engine.
 *
 * Inputs — NO category field used:
 *   triage_level : GREEN | AMBER | RED
 *   place.source : PHARMACY | OTC_STORE | HOSPITAL | EMERGENCY
 *   distance_km
 *   open_status  : OPEN | CLOSED | UNKNOWN
 *
 * Returns Top-5 sorted by final_score descending.
 * Each result carries a rank_reason tag: "증상 적합" | "영업 중" | "가까움"
 */

import type { Place, PlaceSource, TriageLevel } from '../types/triage';

// ---------------------------------------------------------------------------
// Distance → score component  (0 km → 20 pts, 5 km → 0 pts)
// ---------------------------------------------------------------------------

function distanceScore(km: number): number {
  return Math.max(0, 20 - km * 4);
}

// ---------------------------------------------------------------------------
// Open-status bonuses
// ---------------------------------------------------------------------------

const OPEN_BONUS     = 15;
const CLOSED_PENALTY = 10;
// UNKNOWN → ±0

// ---------------------------------------------------------------------------
// Source weights per triage level
//
// RED   : EMERGENCY first, HOSPITAL second, PHARMACY/OTC_STORE strongly down
// AMBER : PHARMACY first, HOSPITAL second, OTC_STORE lowest
// GREEN : OTC_STORE first (+proximity boost), PHARMACY second, HOSPITAL lowest
// ---------------------------------------------------------------------------

const SOURCE_WEIGHT: Record<NonNullable<TriageLevel>, Record<PlaceSource, number>> = {
  RED: {
    EMERGENCY: 80,   // designated 24 h emergency centre
    HOSPITAL:  50,   // general hospital — acceptable for RED
    PHARMACY:   0,   // strongly downranked for emergencies
    OTC_STORE:  0,
  },
  AMBER: {
    EMERGENCY: 40,   // available but more than needed for mild/moderate
    HOSPITAL:  35,
    PHARMACY:  50,   // pharmacy is the primary recommendation for AMBER
    OTC_STORE:  5,
  },
  GREEN: {
    EMERGENCY: 10,   // overkill for self-manageable symptoms
    HOSPITAL:  10,
    PHARMACY:  30,
    OTC_STORE: 50,   // OTC store is enough for GREEN
  },
};

// Extra boost: OTC_STORE within 0.5 km for GREEN — convenience beats distance
const OTC_PROXIMITY_BOOST = 10;

// ---------------------------------------------------------------------------
// Reason tag
//
// Priority: symptom-fit → currently open → proximity
// ---------------------------------------------------------------------------

/** The top-ranked source tier for each triage level. */
const TOP_SOURCE: Record<NonNullable<TriageLevel>, PlaceSource> = {
  RED:   'EMERGENCY',
  AMBER: 'PHARMACY',
  GREEN: 'OTC_STORE',
};

function pickReason(
  triage:     NonNullable<TriageLevel>,
  source:     PlaceSource,
  openStatus: Place['open_status'],
): '증상 적합' | '영업 중' | '가까움' {
  if (source === TOP_SOURCE[triage]) return '증상 적합';
  if (openStatus === 'OPEN')         return '영업 중';
  return '가까움';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RankedPlace extends Place {
  final_score: number;
  rank_reason: '증상 적합' | '영업 중' | '가까움';
}

/**
 * Score and rank `places` for the given triage level.
 *
 * Returns at most 5 results, sorted by final_score descending.
 * When triage is null (no session yet), falls back to distance-only order
 * with reason "가까움".
 */
export function rankPlaces(
  places: Place[],
  triage: TriageLevel,
): RankedPlace[] {
  if (!triage) {
    return [...places]
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, 5)
      .map(p => ({ ...p, final_score: 0, rank_reason: '가까움' as const }));
  }

  const weights = SOURCE_WEIGHT[triage];

  const scored = places.map(p => {
    let score = weights[p.source];

    // GREEN OTC proximity boost
    if (triage === 'GREEN' && p.source === 'OTC_STORE' && p.distance_km <= 0.5) {
      score += OTC_PROXIMITY_BOOST;
    }

    // Open-status adjustment
    if (p.open_status === 'OPEN')   score += OPEN_BONUS;
    if (p.open_status === 'CLOSED') score -= CLOSED_PENALTY;

    // Distance component
    score += distanceScore(p.distance_km);

    const reason = pickReason(triage, p.source, p.open_status);

    return { ...p, final_score: score, rank_reason: reason } as RankedPlace;
  });

  return scored
    .sort((a, b) => b.final_score - a.final_score)
    .slice(0, 5);
}
