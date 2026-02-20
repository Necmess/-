import type { Turn } from '../types/triage';

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000';

export interface VoiceTurnRequest {
  transcript: string;
  lat?: number;
  lng?: number;
  q0?: string;
  q1?: string;
}

export async function postVoiceTurn(payload: VoiceTurnRequest): Promise<Turn & { assistant_message?: string }> {
  const resp = await fetch(`${BASE_URL}/api/voice-turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    throw new Error(`voice-turn HTTP ${resp.status}`);
  }

  return await resp.json() as Turn & { assistant_message?: string };
}
