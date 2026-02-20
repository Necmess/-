import type { PlaceSource } from '../types/triage';

/** Human-readable Korean label for each source tier. Used by markers and the Top5 list. */
export const SOURCE_LABELS: Record<PlaceSource, string> = {
  HOSPITAL:  '병원/의원',
  PHARMACY:  '약국',
  OTC_STORE: '안전상비의약품',
  EMERGENCY: '응급의료기관',
};

/** Accent chip color per source tier — used for the source chip in PlaceRow. */
export const SOURCE_CHIP_STYLE: Record<PlaceSource, { background: string; color: string }> = {
  HOSPITAL:  { background: '#EFF6FF', color: '#1D4ED8' },
  PHARMACY:  { background: '#F0FDF4', color: '#166534' },
  OTC_STORE: { background: '#FFF7ED', color: '#C2410C' },
  EMERGENCY: { background: '#FEF2F2', color: '#B91C1C' },
};
