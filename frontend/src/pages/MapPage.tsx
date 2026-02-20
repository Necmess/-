import { useState, useMemo, useEffect, useRef } from 'react';
import type { Turn, TriageLevel, Place, OpenStatus } from '../types/triage';
import { TRIAGE_COLORS } from '../constants/triage';
import CareManagerPanel from '../features/care-manager/CareManagerPanel';
import { useUserLocation, type LatLng } from '../hooks/useUserLocation';
import { useAuth } from '../hooks/useAuth';
import { getOrCreateSessionId, logEvent } from '../lib/analytics';
import { createDefaultTtsProvider, type TtsProvider } from '../lib/voice';
import { classifyTriage } from '../lib/triageClassifier';
import { fetchPharmacyOpenStatus, ServiceKeyMissingError } from '../lib/apiClient';
import { fetchNearbyEmergency, emergencyToPlace } from '../lib/emergencyClient';
import { fetchNearbyHospitals, hospitalToPlace } from '../lib/hospitalClient';
import { parseAddressRegion } from '../lib/addressParser';
import { rankPlaces } from '../lib/rankingEngine';
import { SOURCE_LABELS } from '../constants/places';

// ---------------------------------------------------------------------------
// Haversine — returns distance in km between two lat/lng points
// ---------------------------------------------------------------------------
function haversine(a: LatLng, b: LatLng): number {
  const R  = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function buildAssistantMessage(
  triageLevel: NonNullable<TriageLevel>,
  topPlaces: Place[],
): string {
  const head = triageLevel === 'RED'
    ? '위험 신호가 감지되었습니다.'
    : triageLevel === 'AMBER'
    ? '의료기관 방문이 권장됩니다.'
    : '자가 관리가 가능한 수준으로 보입니다.';
  const top = topPlaces[0];
  if (!top) return `${head} 화면의 안내를 확인해 주세요.`;
  return `${head} 가장 적합한 곳은 ${top.name}이며 거리 ${top.distance_km.toFixed(2)}km입니다.`;
}

// ---------------------------------------------------------------------------
// Mock data — replaced by /voice-turn response in next phase
// ---------------------------------------------------------------------------
const MOCK_PLACES: Place[] = [
  {
    id:                '1',
    source:            'HOSPITAL',
    name:              '서울대학교병원 응급센터',
    category:          'emergency_room',
    address:           '서울 종로구 대학로 101',
    lat:               37.5796,
    lng:               126.9996,
    distance_km:       0.8,
    open_status:       'OPEN',
    suitability_score: 0.95,
    final_score:       0.91,
    safe_mode_applied: false,
  },
  {
    id:                '2',
    source:            'HOSPITAL',
    name:              '종로 연세의원',
    category:          'clinic',
    address:           '서울 종로구 종로 140',
    lat:               37.5703,
    lng:               126.9830,
    distance_km:       1.4,
    open_status:       'OPEN',
    suitability_score: 0.75,
    final_score:       0.74,
    safe_mode_applied: false,
  },
  {
    id:                '3',
    source:            'HOSPITAL',
    name:              '광화문 내과의원',
    category:          'clinic',
    address:           '서울 종로구 세종대로 149',
    lat:               37.5740,
    lng:               126.9769,
    distance_km:       1.9,
    open_status:       'UNKNOWN',
    suitability_score: 0.70,
    final_score:       0.65,
    safe_mode_applied: false,
  },
  {
    id:                '4',
    source:            'HOSPITAL',
    name:              '혜화 정형외과',
    category:          'hospital',
    address:           '서울 종로구 혜화로 35',
    lat:               37.5826,
    lng:               127.0017,
    distance_km:       2.3,
    open_status:       'OPEN',
    suitability_score: 0.68,
    final_score:       0.63,
    safe_mode_applied: false,
  },
  {
    id:                '5',
    source:            'HOSPITAL',
    name:              '낙원 가정의학과',
    category:          'clinic',
    address:           '서울 종로구 낙원동 284',
    lat:               37.5762,
    lng:               126.9887,
    distance_km:       2.8,
    open_status:       'CLOSED',
    suitability_score: 0.60,
    final_score:       0.51,
    safe_mode_applied: false,
  },
  {
    // Pharmacy entry — triggers open-status enrichment via /api/pharmacy/open-status
    id:                '6',
    source:            'PHARMACY',
    name:              '온누리약국 종로점',
    category:          'pharmacy',
    address:           '서울 종로구 종로 190',
    address_road:      '서울특별시 종로구 종로 190',
    address_jibun:     '서울특별시 종로구 관철동 14-1',
    lat:               37.5704,
    lng:               126.9869,
    distance_km:       1.6,
    open_status:       'UNKNOWN',   // replaced by API result at runtime
    suitability_score: 0.55,
    final_score:       0.52,
    safe_mode_applied: false,
  },
];

// ---------------------------------------------------------------------------
// MapPage
// ---------------------------------------------------------------------------
export default function MapPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [currentTriage, setCurrentTriage] = useState<TriageLevel>(null);
  const [places, setPlaces] = useState<Place[]>(MOCK_PLACES);
  const [safeModeNoResult, setSafeModeNoResult] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [lastAssistantMessage, setLastAssistantMessage] = useState<string | null>(null);
  const [lastAssistantTriage, setLastAssistantTriage] = useState<TriageLevel>(null);

  const { latLng, status: geoStatus, errorMsg: geoError } = useUserLocation();
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const sessionIdRef = useRef(getOrCreateSessionId());
  const ttsProviderRef = useRef<TtsProvider>(createDefaultTtsProvider());
  const hasLoggedAppOpenRef = useRef(false);
  const hasLoggedGeoGrantedRef = useRef(false);
  const prevUserIdRef = useRef<string | null>(null);

  // Pharmacy open-status enrichment keyed by place.name.
  // Updated asynchronously; does not affect ranking order.
  const [pharmacyStatus, setPharmacyStatus] = useState<Record<string, OpenStatus>>({});
  // Set to true when the backend returns 503 (DATA_GO_KR_SERVICE_KEY not set).
  const [pharmacyKeyMissing, setPharmacyKeyMissing] = useState(false);

  // Emergency places fetched from /api/emergency/nearby.
  // Non-empty only when triage is RED and the API call succeeded.
  const [emergencyPlaces, setEmergencyPlaces] = useState<Place[]>([]);

  // Hospital/clinic candidates from /api/hospitals/nearby.
  // When non-empty, these replace the HOSPITAL entries from MOCK_PLACES.
  const [apiHospitals, setApiHospitals] = useState<Place[]>([]);

  useEffect(() => {
    if (hasLoggedAppOpenRef.current) return;
    hasLoggedAppOpenRef.current = true;
    void logEvent(
      'app_open',
      { path: window.location.pathname },
      { userId: user?.id ?? null, sessionId: sessionIdRef.current },
    );
  }, [user?.id]);

  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (!prevUserIdRef.current && currentUserId) {
      void logEvent(
        'login_success',
        { provider: 'google' },
        { userId: currentUserId, sessionId: sessionIdRef.current },
      );
    }
    prevUserIdRef.current = currentUserId;
  }, [user?.id]);

  useEffect(() => {
    if (geoStatus !== 'granted' || hasLoggedGeoGrantedRef.current || !latLng) return;
    hasLoggedGeoGrantedRef.current = true;
    void logEvent(
      'location_permission_granted',
      { lat: latLng.lat, lng: latLng.lng },
      { userId: user?.id ?? null, sessionId: sessionIdRef.current },
    );
  }, [geoStatus, latLng, user?.id]);

  useEffect(() => {
    return () => {
      ttsProviderRef.current.stop();
    };
  }, []);

  // Merge API hospital candidates with non-hospital mock entries.
  // When the API call hasn't returned yet, falls back to full MOCK_PLACES.
  const mergedPlaces = useMemo<Place[]>(() => {
    if (apiHospitals.length === 0) return places;
    const nonHospital = places.filter(p => p.source !== 'HOSPITAL');
    return [...nonHospital, ...apiHospitals];
  }, [places, apiHospitals]);

  // Recompute distance_km from user position, then run the rule-based
  // ranking engine (source × triage × open_status × distance → final_score).
  // Falls back to static MOCK_PLACES distances when location is unavailable.
  const rankedPlaces = useMemo<Place[]>(() => {
    const withDistance = latLng
      ? mergedPlaces.map(p => ({ ...p, distance_km: haversine(latLng, { lat: p.lat, lng: p.lng }) }))
      : [...mergedPlaces];

    return rankPlaces(withDistance, currentTriage);
  }, [mergedPlaces, latLng, currentTriage]);

  // Stable key: sorted PHARMACY names in rankedPlaces — triggers enrichment
  // only when the pharmacy subset actually changes, not on every render.
  const pharmacyNamesKey = useMemo(
    () =>
      rankedPlaces
        .filter(p => p.source === 'PHARMACY')
        .map(p => p.name)
        .sort()
        .join(','),
    [rankedPlaces],
  );

  useEffect(() => {
    const pharmacyPlaces = rankedPlaces.filter(p => p.source === 'PHARMACY');
    if (pharmacyPlaces.length === 0) return;

    // Prefer pre-computed q0/q1 on the place object (populated from CSV load).
    // Fall back to parsing the display address on the fly.
    const ref   = pharmacyPlaces[0];
    const region = ref.q0 && ref.q1
      ? { q0: ref.q0, q1: ref.q1, q1Fallback: ref.q1Fallback ?? null }
      : parseAddressRegion(ref.address_road, ref.address_jibun ?? ref.address);

    if (!region.q0 || !region.q1) return;

    fetchPharmacyOpenStatus({
      q0:          region.q0,
      q1:          region.q1,
      q1Fallback:  region.q1Fallback ?? undefined,
      names:       pharmacyPlaces.map(p => p.name),
    })
      .then(results => {
        setPharmacyStatus(prev => {
          const next = { ...prev };
          for (const r of results) next[r.name] = r.is_open;
          return next;
        });
      })
      .catch((err: unknown) => {
        if (err instanceof ServiceKeyMissingError) {
          setPharmacyKeyMissing(true);  // surface config notice in UI
        }
        // Any other error: leave existing status (UNKNOWN by default)
      });
  }, [pharmacyNamesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable key for the hospital fetch: active when triage is GREEN or AMBER.
  // Derived from `places` (stable between voice turns) to avoid circular deps.
  // Format: "lat|lng|q0|q1" — empty string means "don't fetch / clear state".
  const hospitalFetchKey = useMemo(() => {
    if (currentTriage === 'RED' || currentTriage === null || !latLng) return '';
    const ref = places[0];
    if (!ref) return '';
    const region = ref.q0 && ref.q1
      ? { q0: ref.q0, q1: ref.q1 }
      : parseAddressRegion(ref.address_road, ref.address_jibun ?? ref.address);
    if (!region.q0) return '';
    return `${latLng.lat}|${latLng.lng}|${region.q0}|${region.q1 ?? ''}`;
  }, [currentTriage, latLng, places]);

  useEffect(() => {
    if (!hospitalFetchKey) {
      setApiHospitals([]);
      return;
    }
    const [latStr, lngStr, q0, q1] = hospitalFetchKey.split('|');
    fetchNearbyHospitals({
      lat:      Number(latStr),
      lng:      Number(lngStr),
      q0,
      q1:       q1 || undefined,
      radiusKm: 5,
      limit:    20,   // ranking engine picks Top 5 from this pool
    })
      .then(hospitals => setApiHospitals(hospitals.map(hospitalToPlace)))
      .catch(() => setApiHospitals([]));   // fall back to MOCK_PLACES
  }, [hospitalFetchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable key for the emergency fetch: changes only when triage becomes RED,
  // user location is known, and the region changes.
  // Format: "lat|lng|q0|q1" — empty string means "don't fetch".
  const emergencyFetchKey = useMemo(() => {
    if (currentTriage !== 'RED' || !latLng) return '';
    // Derive region from the first available place (same strategy as pharmacy).
    const ref = rankedPlaces[0];
    if (!ref) return '';
    const region = ref.q0 && ref.q1
      ? { q0: ref.q0, q1: ref.q1 }
      : parseAddressRegion(ref.address_road, ref.address_jibun ?? ref.address);
    if (!region.q0) return '';
    return `${latLng.lat}|${latLng.lng}|${region.q0}|${region.q1 ?? ''}`;
  }, [currentTriage, latLng, rankedPlaces]);

  useEffect(() => {
    if (!emergencyFetchKey) {
      setEmergencyPlaces([]);
      return;
    }
    const [latStr, lngStr, q0, q1] = emergencyFetchKey.split('|');
    fetchNearbyEmergency({
      lat:      Number(latStr),
      lng:      Number(lngStr),
      q0,
      q1:       q1 || undefined,
      radiusKm: 10,
      limit:    5,
    })
      .then(eps => setEmergencyPlaces(eps.map(emergencyToPlace)))
      .catch(() => {
        // API unavailable (no key, network error) — fall back to ranked places
        setEmergencyPlaces([]);
      });
  }, [emergencyFetchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge pharmacy enrichment into rankedPlaces without mutating the ranked order.
  // When triage is RED and emergency places loaded, use those instead.
  const displayPlaces = useMemo<Place[]>(() => {
    if (currentTriage === 'RED' && emergencyPlaces.length > 0) {
      return emergencyPlaces;
    }
    return rankedPlaces.map(p =>
      p.source === 'PHARMACY' && pharmacyStatus[p.name]
        ? { ...p, open_status: pharmacyStatus[p.name] }
        : p,
    );
  }, [currentTriage, emergencyPlaces, rankedPlaces, pharmacyStatus]);

  function handleSymptomSubmit(transcript: string, source: 'text' | 'voice') {
    const trimmed = transcript.trim();
    if (!trimmed) return;

    setIsProcessing(true);

    const turnId = crypto.randomUUID();
    const pendingTurn: Turn = {
      turn_id:          turnId,
      transcript:       trimmed,
      triage_level:     null,
      top5_places:      [],
      tts_audio_url:    null,
      safe_mode_result: { applied: false, no_result: false },
    };
    setTurns(prev => [...prev, pendingTurn]);
    void logEvent(
      'symptom_submit',
      { source, turn_id: turnId, transcript_length: trimmed.length },
      { userId: user?.id ?? null, sessionId: sessionIdRef.current },
    );

    setTimeout(() => {
      const triageLevel = classifyTriage(trimmed);
      const top5 = rankPlaces(MOCK_PLACES, triageLevel).slice(0, 5);

      const resolvedTurn: Turn = {
        turn_id:          turnId,
        transcript:       trimmed,
        triage_level:     triageLevel,
        top5_places:      top5,
        tts_audio_url:    null,
        safe_mode_result: { applied: false, no_result: false },
      };
      setTurns(prev => prev.map(t => t.turn_id === turnId ? resolvedTurn : t));
      setCurrentTriage(triageLevel);
      setPlaces(top5);
      setSafeModeNoResult(false);
      setIsProcessing(false);
      const assistantMessage = buildAssistantMessage(triageLevel, top5);
      setLastAssistantMessage(assistantMessage);
      setLastAssistantTriage(triageLevel);
      void logEvent(
        'triage_result',
        { turn_id: turnId, triage_level: triageLevel, transcript_length: trimmed.length },
        { userId: user?.id ?? null, sessionId: sessionIdRef.current },
      );
      void logEvent(
        'top5_shown',
        {
          turn_id: turnId,
          triage_level: triageLevel,
          place_ids: top5.map(p => p.id),
          place_sources: top5.map(p => p.source),
        },
        { userId: user?.id ?? null, sessionId: sessionIdRef.current },
      );
      if (ttsEnabled) {
        playTts(assistantMessage, triageLevel);
      }
    }, 700);
  }

  function handlePlaceClick(place: Place, rank: number, source: 'panel' | 'map') {
    void logEvent(
      'place_click',
      {
        place_id: place.id,
        place_name: place.name,
        place_source: place.source,
        rank,
        ui_source: source,
      },
      { userId: user?.id ?? null, sessionId: sessionIdRef.current },
    );
  }

  function handleCall119Click() {
    void logEvent(
      'call_119_click',
      { triage_level: currentTriage },
      { userId: user?.id ?? null, sessionId: sessionIdRef.current },
    );
  }

  function handleRecordingStart() {
    void logEvent(
      'stt_record_start',
      {},
      { userId: user?.id ?? null, sessionId: sessionIdRef.current },
    );
  }

  function handleRecordingStop(durationSec: number) {
    void logEvent(
      'stt_record_stop',
      { duration_sec: durationSec },
      { userId: user?.id ?? null, sessionId: sessionIdRef.current },
    );
  }

  function playTts(message: string, triageLevel: TriageLevel) {
    ttsProviderRef.current.speak(message, {
      lang: 'ko-KR',
      onError: (errMsg) => {
        console.error('[tts]', errMsg);
      },
    });

    void logEvent(
      'tts_play',
      { message_length: message.length, triage_level: triageLevel },
      { userId: user?.id ?? null, sessionId: sessionIdRef.current },
    );
  }

  function handleReplayTts() {
    if (!lastAssistantMessage) return;
    playTts(lastAssistantMessage, lastAssistantTriage);
  }

  return (
    <div style={styles.root}>
      <style>{`
        @keyframes pulse {
          0%   { transform: translate(-50%, -50%) scale(1);   opacity: 0.6; }
          100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0; }
        }
      `}</style>

      {/* Map placeholder — Naver Map SDK mounts here in next phase.
          latLng is passed so the SDK call can center on user position. */}
      <div style={styles.mapContainer}>
        <span style={styles.mapLabel}>
          {geoStatus === 'granted' && latLng
            ? `현재 위치 기준 (${latLng.lat.toFixed(4)}, ${latLng.lng.toFixed(4)})`
            : geoStatus === 'pending'
            ? '위치 확인 중...'
            : '지도 영역 (Naver Map)'}
        </span>

        {/* My Location marker — centered in placeholder, visible once granted */}
        {geoStatus === 'granted' && latLng && <MyLocationMarker />}

        {/* Mock place markers — driven by displayPlaces (enriched open status) */}
        {!safeModeNoResult && displayPlaces.map((place, i) => (
          <MockMarker
            key={place.id}
            place={place}
            rank={i + 1}
            isTop={i === 0}
            onPlaceClick={handlePlaceClick}
          />
        ))}
      </div>

      {/* Geolocation error banner — sits just above the Care Manager panel */}
      {geoError && <GeoBanner message={geoError} />}

      {/* Care Manager panel */}
      <CareManagerPanel
        turns={turns}
        currentTriage={currentTriage}
        safeModeNoResult={safeModeNoResult}
        onSubmitSymptom={handleSymptomSubmit}
        isProcessing={isProcessing}
        places={displayPlaces}
        pharmacyKeyMissing={pharmacyKeyMissing}
        emergencyOverride={currentTriage === 'RED' && emergencyPlaces.length > 0}
        user={user}
        authLoading={authLoading}
        onSignIn={signInWithGoogle}
        onSignOut={signOut}
        onPlaceClick={handlePlaceClick}
        onCall119Click={handleCall119Click}
        onRecordingStart={handleRecordingStart}
        onRecordingStop={handleRecordingStop}
        ttsEnabled={ttsEnabled}
        onToggleTts={setTtsEnabled}
        lastAssistantMessage={lastAssistantMessage}
        onReplayTts={handleReplayTts}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MyLocationMarker — pulsing blue dot, centered in map placeholder.
// In Naver Map phase: replaced by a naver.maps.Marker at latLng coords.
// ---------------------------------------------------------------------------
function MyLocationMarker() {
  return (
    <div style={styles.myLocationWrapper}>
      <div style={styles.myLocationPulse} />
      <div style={styles.myLocationDot} />
      <span style={styles.myLocationLabel}>내 위치</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GeoBanner — error/denial notice anchored above the Care Manager panel
// ---------------------------------------------------------------------------
function GeoBanner({ message }: { message: string }) {
  return (
    <div style={styles.geoBanner}>
      <svg
        width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke="#92400E" strokeWidth="2"
        style={{ flexShrink: 0, marginTop: '1px' }}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MockMarker — visual stand-in for real Naver map overlays
// ---------------------------------------------------------------------------
interface MockMarkerProps {
  place:  Place;
  rank:   number;
  isTop:  boolean;
  onPlaceClick: (place: Place, rank: number, source: 'panel' | 'map') => void;
}

function MockMarker({ place, rank, isTop, onPlaceClick }: MockMarkerProps) {
  const [hovered, setHovered] = useState(false);

  const dotColor =
    place.open_status === 'OPEN'    ? '#4CAF50' :
    place.open_status === 'CLOSED'  ? '#F44336' :
                                      '#FF9800';

  const pinColor = place.safe_mode_applied
    ? TRIAGE_COLORS['RED']
    : isTop
    ? '#F59E0B'   // gold for rank #1
    : '#1976D2';

  return (
    <div
      style={{
        ...styles.marker,
        top:  `${20 + rank * 11}%`,
        left: `${15 + rank * 13}%`,
        zIndex: isTop ? 10 : 1,
      }}
      onClick={() => onPlaceClick(place, rank, 'map')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Rank #1: animated halo ring */}
      {isTop && <div style={styles.topHalo} />}

      {/* Rank #1: star crown above pin */}
      {isTop && (
        <div style={{
          position:   'absolute',
          top:        '-18px',
          left:       '50%',
          transform:  'translateX(-50%)',
          fontSize:   '14px',
          lineHeight: 1,
          filter:     'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
        }}>
          ★
        </div>
      )}

      {/* Rank pin */}
      <div
        style={{
          ...styles.markerPin,
          background: pinColor,
          width:      isTop ? '42px' : '28px',
          height:     isTop ? '42px' : '28px',
          fontSize:   isTop ? '15px' : '11px',
          fontWeight: isTop ? 800    : 700,
          boxShadow:  isTop
            ? '0 0 0 4px rgba(245,158,11,0.3), 0 4px 14px rgba(0,0,0,0.3)'
            : '0 2px 6px rgba(0,0,0,0.2)',
        }}
      >
        {rank}
      </div>

      {/* Open status dot */}
      <div style={{ ...styles.statusDot, background: dotColor }} />

      {/* Tooltip on hover */}
      {hovered && (
        <div style={styles.tooltip}>
          {isTop && (
            <span style={styles.tooltipTopBadge}>★ 추천</span>
          )}
          <strong>{place.name}</strong>
          <span style={{ color: '#AAA', fontSize: '10px' }}>{SOURCE_LABELS[place.source]}</span>
          <span>{place.distance_km.toFixed(2)} km</span>
          <span style={{ color: dotColor }}>
            {place.open_status === 'OPEN'   ? '영업 중' :
             place.open_status === 'CLOSED' ? '영업 종료' : '확인 불가'}
          </span>
          {place.rank_reason && (
            <span style={{ color: '#0369A1', fontWeight: 600, fontSize: '11px' }}>
              {place.rank_reason}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
    width:    '100vw',
    height:   '100vh',
    overflow: 'hidden',
    fontFamily: 'system-ui, sans-serif',
  },
  mapContainer: {
    width:      '100%',
    height:     '100%',
    background: 'linear-gradient(160deg, #E8F4FD 0%, #D6EAF8 100%)',
    position:   'relative',
    display:    'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapLabel: {
    color:      '#90A4AE',
    fontSize:   '18px',
    fontWeight: 500,
    letterSpacing: '0.5px',
    userSelect: 'none',
  },
  marker: {
    position: 'absolute',
    cursor:   'pointer',
  },
  markerPin: {
    width:          '28px',
    height:         '28px',
    borderRadius:   '50% 50% 50% 0',
    transform:      'rotate(-45deg)',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    color:          '#fff',
    fontSize:       '11px',
    fontWeight:     700,
    boxShadow:      '0 2px 6px rgba(0,0,0,0.2)',
  },
  statusDot: {
    width:        '8px',
    height:       '8px',
    borderRadius: '50%',
    border:       '2px solid #fff',
    position:     'absolute',
    top:          '-2px',
    right:        '-2px',
  },
  tooltip: {
    position:     'absolute',
    bottom:       '36px',
    left:         '50%',
    transform:    'translateX(-50%)',
    background:   '#fff',
    borderRadius: '8px',
    padding:      '8px 12px',
    boxShadow:    '0 4px 16px rgba(0,0,0,0.15)',
    display:      'flex',
    flexDirection: 'column',
    gap:          '2px',
    fontSize:     '12px',
    color:        '#333',
    whiteSpace:   'nowrap',
    zIndex:       999,
  },

  topHalo: {
    position:     'absolute',
    inset:        '-8px',
    borderRadius: '50%',
    border:       '2px solid rgba(245,158,11,0.5)',
    pointerEvents: 'none',
  },
  tooltipTopBadge: {
    fontSize:     '10px',
    fontWeight:   700,
    color:        '#92400E',
    background:   '#FEF3C7',
    borderRadius: '4px',
    padding:      '1px 5px',
    alignSelf:    'flex-start',
  },

  // My Location marker
  myLocationWrapper: {
    position:       'absolute',
    top:            '50%',
    left:           '50%',
    transform:      'translate(-50%, -50%)',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            '4px',
    pointerEvents:  'none',
  },
  myLocationPulse: {
    position:     'absolute',
    width:        '36px',
    height:       '36px',
    borderRadius: '50%',
    background:   'rgba(25, 118, 210, 0.2)',
    animation:    'pulse 2s ease-out infinite',
    top:          '50%',
    left:         '50%',
    transform:    'translate(-50%, -50%)',
  },
  myLocationDot: {
    width:        '14px',
    height:       '14px',
    borderRadius: '50%',
    background:   '#1976D2',
    border:       '3px solid #fff',
    boxShadow:    '0 2px 6px rgba(25,118,210,0.5)',
    position:     'relative',
    zIndex:       1,
  },
  myLocationLabel: {
    fontSize:     '11px',
    fontWeight:   600,
    color:        '#1976D2',
    background:   'rgba(255,255,255,0.9)',
    padding:      '1px 6px',
    borderRadius: '4px',
    whiteSpace:   'nowrap',
  },

  // Geolocation error banner
  geoBanner: {
    position:     'fixed',
    bottom:       '420px',          // sits above the CareManagerPanel (~380px tall max)
    right:        '24px',
    width:        '296px',          // matches panel width (320px) minus horizontal padding
    background:   '#FEF3C7',
    border:       '1px solid #F59E0B',
    borderRadius: '10px',
    padding:      '10px 14px',
    fontSize:     '12px',
    color:        '#92400E',
    lineHeight:   '1.5',
    zIndex:       1001,
    display:      'flex',
    alignItems:   'flex-start',
    gap:          '8px',
    boxShadow:    '0 2px 8px rgba(0,0,0,0.08)',
  },
};
