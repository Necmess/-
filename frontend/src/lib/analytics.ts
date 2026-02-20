import { supabase } from './supabase';

const SESSION_ID_KEY = 'care_session_id';

export type EventProps = Record<string, unknown>;

export interface LogEventOptions {
  userId?: string | null;
  sessionId?: string;
}

export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'server-session';

  const existing = window.localStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;

  const next = crypto.randomUUID();
  window.localStorage.setItem(SESSION_ID_KEY, next);
  return next;
}

export async function logEvent(
  eventName: string,
  props: EventProps = {},
  options: LogEventOptions = {},
): Promise<void> {
  try {
    const { error } = await supabase.from('events').insert({
      user_id: options.userId ?? null,
      session_id: options.sessionId ?? getOrCreateSessionId(),
      event_name: eventName,
      props,
    });

    if (error) {
      console.error('[analytics] failed to insert event:', error.message);
    }
  } catch (err) {
    console.error('[analytics] unexpected error:', err);
  }
}
