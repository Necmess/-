import type { TriageLevel } from '../types/triage';

export const TRIAGE_COLORS: Record<NonNullable<TriageLevel>, string> = {
  GREEN: '#4CAF50',
  AMBER: '#FF9800',
  RED:   '#F44336',
};

export const TRIAGE_LABELS: Record<NonNullable<TriageLevel>, string> = {
  GREEN: '낮은 위험',
  AMBER: '주의 필요',
  RED:   '즉시 조치',
};

export const TRIAGE_DESCRIPTIONS: Record<NonNullable<TriageLevel>, string> = {
  GREEN: '자가 관리가 가능한 상태입니다.',
  AMBER: '가까운 시일 내 의료기관 방문을 권장합니다.',
  RED:   '즉시 응급 의료기관을 방문하세요.',
};
