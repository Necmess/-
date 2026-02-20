import type { TriageLevel } from '../types/triage';

type Level = NonNullable<TriageLevel>;

interface Rule {
  code: string;
  level: 'RED' | 'AMBER';
  weight: number;
  keywords: string[];
}

const TRIAGE_RULES: Rule[] = [
  {
    code: 'TRAUMA_AMPUTATION',
    level: 'RED',
    weight: 5,
    keywords: ['덜렁', '덜렁거리', '절단', '잘렸', '뼈가 보', '관절이 빠졌'],
  },
  {
    code: 'RESP_SEVERE',
    level: 'RED',
    weight: 4,
    keywords: ['호흡곤란', '숨이 안', '숨을 못', '숨막혀', '숨막'],
  },
  {
    code: 'NEURO_SEVERE',
    level: 'RED',
    weight: 4,
    keywords: ['의식', '실신', '경련', '마비', '발작', '쓰러졌', '쓰러져'],
  },
  {
    code: 'BLEEDING_SEVERE',
    level: 'RED',
    weight: 4,
    keywords: ['심한 출혈', '피를 많이', '피가 많이'],
  },
  {
    code: 'CARDIAC_ALERT',
    level: 'RED',
    weight: 4,
    keywords: ['가슴 통증', '가슴통증', '압박', '심정지', '심장이 멈'],
  },
  {
    code: 'FEVER_HIGH',
    level: 'AMBER',
    weight: 2,
    keywords: ['열', '고열', '발열', '38도', '39도', '40도'],
  },
  {
    code: 'GI_DISTRESS',
    level: 'AMBER',
    weight: 2,
    keywords: ['복통', '구토', '설사', '메스꺼', '구역질'],
  },
  {
    code: 'PAIN_NON_SPECIFIC',
    level: 'AMBER',
    weight: 1,
    keywords: ['통증', '두통', '머리 아파', '머리가 아파', '몸살'],
  },
  {
    code: 'DIZZINESS',
    level: 'AMBER',
    weight: 2,
    keywords: ['어지러', '어지럽', '현기증'],
  },
  {
    code: 'MSK_INJURY',
    level: 'AMBER',
    weight: 2,
    keywords: ['골절', '부러졌', '부러져', '삐었', '염좌', '붓기'],
  },
];

const HARD_RED_CODES = new Set([
  'TRAUMA_AMPUTATION',
  'RESP_SEVERE',
  'NEURO_SEVERE',
  'BLEEDING_SEVERE',
  'CARDIAC_ALERT',
]);

export function classifyTriageDetailed(transcript: string): {
  triage: Level;
  reasonCodes: string[];
} {
  const text = transcript.trim().toLowerCase();
  const score = { RED: 0, AMBER: 0 };
  const reasonCodes: string[] = [];

  for (const rule of TRIAGE_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      reasonCodes.push(rule.code);
      score[rule.level] += rule.weight;
    }
  }

  if (reasonCodes.some((code) => HARD_RED_CODES.has(code)) || score.RED >= 4) {
    return { triage: 'RED', reasonCodes };
  }
  if (score.AMBER > 0) {
    return { triage: 'AMBER', reasonCodes };
  }
  return { triage: 'GREEN', reasonCodes };
}

export function classifyTriage(transcript: string): Level {
  return classifyTriageDetailed(transcript).triage;
}
