const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000';

export interface PharmacyOpenStatusResult {
  name:       string;
  is_open:    'OPEN' | 'CLOSED' | 'UNKNOWN';
  open_until: string | null;
  source:     string;
}

/**
 * Thrown when the backend returns 503 because DATA_GO_KR_SERVICE_KEY is not set.
 * Callers can catch this specifically to show a non-alarming config notice.
 */
export class ServiceKeyMissingError extends Error {
  constructor() {
    super('DATA_GO_KR_SERVICE_KEY is not configured on the backend.');
    this.name = 'ServiceKeyMissingError';
  }
}

export async function fetchPharmacyOpenStatus(params: {
  q0:          string;
  q1:          string;
  names:       string[];
  q1Fallback?: string;  // tried by backend when primary q1 returns 0 items
  now?:        string;  // HHMM
  holiday?:    boolean;
}): Promise<PharmacyOpenStatusResult[]> {
  const url = new URL(`${BASE_URL}/api/pharmacy/open-status`);
  url.searchParams.set('q0',    params.q0);
  url.searchParams.set('q1',    params.q1);
  url.searchParams.set('names', params.names.join(','));
  if (params.q1Fallback) url.searchParams.set('q1_fallback', params.q1Fallback);
  if (params.now)        url.searchParams.set('now',         params.now);
  if (params.holiday)    url.searchParams.set('holiday',     'true');

  const resp = await fetch(url.toString());

  if (resp.status === 503) throw new ServiceKeyMissingError();
  if (!resp.ok) throw new Error(`pharmacy/open-status HTTP ${resp.status}`);

  const data = await resp.json() as { results: PharmacyOpenStatusResult[] };
  return data.results;
}
