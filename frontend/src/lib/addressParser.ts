/**
 * Korean address → (q0, q1) extractor for data.go.kr query params.
 *
 * Priority: 도로명주소 (addressRoad) → 지번주소 (addressJibun) → plain address
 *
 * 2-level: "서울특별시 종로구 대학로 101"
 *   q0 = "서울특별시"   q1 = "종로구"   q1Fallback = null
 *
 * 3-level: "경기도 성남시 분당구 판교로 100"
 *   q0 = "경기도"   q1 = "성남시 분당구"   q1Fallback = "성남시"
 *   (data.go.kr sometimes needs the 시 alone when 시+구 returns 0 results)
 */

export interface RegionResult {
  q0:         string | null;  // 시/도
  q1:         string | null;  // 시/군/구 — primary (시+구 combined for 3-level)
  q1Fallback: string | null;  // 시 alone (only set for 3-level pattern)
}

// Short abbreviation → full official name used by data.go.kr
const CITY_MAP: Readonly<Record<string, string>> = {
  '서울':    '서울특별시',   '서울특별시': '서울특별시',
  '부산':    '부산광역시',   '부산광역시': '부산광역시',
  '대구':    '대구광역시',   '대구광역시': '대구광역시',
  '인천':    '인천광역시',   '인천광역시': '인천광역시',
  '광주':    '광주광역시',   '광주광역시': '광주광역시',
  '대전':    '대전광역시',   '대전광역시': '대전광역시',
  '울산':    '울산광역시',   '울산광역시': '울산광역시',
  '세종':    '세종특별자치시', '세종특별자치시': '세종특별자치시',
  '경기':    '경기도',       '경기도': '경기도',
  '강원':    '강원도',       '강원도': '강원도',
  '충북':    '충청북도',     '충청북도': '충청북도',
  '충남':    '충청남도',     '충청남도': '충청남도',
  '전북':    '전라북도',     '전라북도': '전라북도',
  '전남':    '전라남도',     '전라남도': '전라남도',
  '경북':    '경상북도',     '경상북도': '경상북도',
  '경남':    '경상남도',     '경상남도': '경상남도',
  '제주':    '제주특별자치도', '제주특별자치도': '제주특별자치도',
};

/**
 * Returns true when parts[2] is a 구/군 subdivision under a 시.
 * Triggers the 3-level q1 = "성남시 분당구" pattern.
 *
 * Condition: parts[1] ends with "시" AND parts[2] ends with "구" or "군"
 * Excludes metropolitan 구 (e.g. "서울 강남구") because those are only 2 levels.
 */
function isThreeLevel(parts: string[]): boolean {
  if (parts.length < 3) return false;
  const p1 = parts[1];
  const p2 = parts[2];
  return (
    (p1.endsWith('시') || p1.endsWith('군')) &&
    (p2.endsWith('구') || p2.endsWith('군'))
  );
}

function pickAddress(
  road:  string | null | undefined,
  jibun: string | null | undefined,
): string {
  return road?.trim() || jibun?.trim() || '';
}

/**
 * Main export. Accepts separate 도로명/지번 strings; either may be null/undefined.
 * For callers that only have a single address string, pass it as `jibun`.
 */
export function parseAddressRegion(
  road:  string | null | undefined,
  jibun: string | null | undefined,
): RegionResult {
  const address = pickAddress(road, jibun);
  const parts   = address.split(/\s+/).filter(Boolean);

  if (parts.length < 2) return { q0: null, q1: null, q1Fallback: null };

  const q0 = CITY_MAP[parts[0]] ?? null;

  if (isThreeLevel(parts)) {
    return {
      q0,
      q1:         `${parts[1]} ${parts[2]}`,  // "성남시 분당구"
      q1Fallback: parts[1],                   // "성남시"
    };
  }

  return { q0, q1: parts[1], q1Fallback: null };
}
