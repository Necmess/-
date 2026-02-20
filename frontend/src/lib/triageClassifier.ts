import type { TriageLevel } from '../types/triage';

// ---------------------------------------------------------------------------
// Keyword lists — ordered from most specific to most general within each tier.
// Evaluation order: RED → AMBER → GREEN (first match wins).
// Mirrors the rule_triage.py contract on the backend.
// ---------------------------------------------------------------------------

const RED_KEYWORDS: string[] = [
  // Respiratory / airway
  '호흡곤란', '숨이 안', '숨을 못', '숨막혀', '숨막',
  // Cardiac / chest
  '가슴 통증', '가슴통증', '가슴이 아파', '심정지', '심장이 멈',
  // Neurological
  '의식이 없', '의식을 잃', '쓰러졌', '쓰러져', '실신', '쓰러',
  '마비', '뇌졸중', '중풍', '경련', '발작',
  // Severe bleeding
  '심한 출혈', '피를 많이', '피가 많이',
  // Explicit emergency
  '응급',
];

const AMBER_KEYWORDS: string[] = [
  // Head / pain
  '머리가 아파', '머리 아파', '두통', '편두통',
  // Fever
  '열이 나', '고열', '발열', '38도', '39도', '40도',
  // GI
  '구토', '구역질', '메스꺼', '복통', '배가 아파', '배 아파', '배아파', '설사',
  // Dizziness
  '어지럽', '어지러', '현기증',
  // Respiratory (mild)
  '기침이 심', '목이 아파', '목 아파',
  // Musculoskeletal
  '삐었', '삐어', '염좌', '골절', '부러졌', '부러져',
  // Chest (non-specific, lower priority than RED phrases)
  '가슴이 답답', '가슴 답답',
];

// ---------------------------------------------------------------------------
// classifyTriage
// Returns the first tier whose any keyword appears in the normalised transcript.
// Falls back to GREEN when no keyword matches.
// ---------------------------------------------------------------------------
export function classifyTriage(transcript: string): NonNullable<TriageLevel> {
  const text = transcript.trim().toLowerCase();

  if (RED_KEYWORDS.some(kw => text.includes(kw.toLowerCase()))) return 'RED';
  if (AMBER_KEYWORDS.some(kw => text.includes(kw.toLowerCase()))) return 'AMBER';
  return 'GREEN';
}
