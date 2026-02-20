import { useState } from 'react';
import type { Turn, TriageLevel, Place } from '../../types/triage';
import type { User } from '../../hooks/useAuth';
import { TRIAGE_COLORS, TRIAGE_LABELS } from '../../constants/triage';
import { SOURCE_LABELS, SOURCE_CHIP_STYLE } from '../../constants/places';
import VoiceInput from './VoiceInput';

const TRIAGE_GUIDANCE: Record<NonNullable<TriageLevel>, {
  icon:       string;
  title:      string;
  sub:        string;
  bg:         string;
  border:     string;
  titleColor: string;
  subColor:   string;
}> = {
  GREEN: {
    icon:       '💊',
    title:      '약국 또는 일반의약품으로 관리 가능',
    sub:        '가까운 약국에서 일반의약품으로 자가 관리하세요.',
    bg:         '#F0FDF4',
    border:     '#86EFAC',
    titleColor: '#166534',
    subColor:   '#15803D',
  },
  AMBER: {
    icon:       '🏥',
    title:      '의원 또는 병원 방문을 권장합니다',
    sub:        '오늘 중 가까운 의원이나 병원을 방문하세요.',
    bg:         '#FFFBEB',
    border:     '#FCD34D',
    titleColor: '#92400E',
    subColor:   '#B45309',
  },
  RED: {
    icon:       '🚨',
    title:      '즉시 119 또는 응급실 권고',
    sub:        '지금 바로 119에 전화하거나 응급실로 이동하세요.',
    bg:         '#FEF2F2',
    border:     '#FECACA',
    titleColor: '#B91C1C',
    subColor:   '#DC2626',
  },
};

interface CareManagerPanelProps {
  turns: Turn[];
  currentTriage: TriageLevel;
  safeModeNoResult: boolean;
  onSubmitSymptom: (text: string, source: 'text' | 'voice') => void;
  isProcessing: boolean;
  places: Place[];
  pharmacyKeyMissing?: boolean;
  emergencyOverride?: boolean;  // true when place list is sourced from /api/emergency/nearby
  user:      User | null;
  authLoading: boolean;
  onSignIn:  () => Promise<void>;
  onSignOut: () => Promise<void>;
  onPlaceClick: (place: Place, rank: number, source: 'panel') => void;
  onCall119Click: () => void;
  onRecordingStart: () => void;
  onRecordingStop: (durationSec: number) => void;
  ttsEnabled: boolean;
  onToggleTts: (enabled: boolean) => void;
  lastAssistantMessage: string | null;
  onReplayTts: () => void;
}

export default function CareManagerPanel({
  turns,
  currentTriage,
  safeModeNoResult,
  onSubmitSymptom,
  isProcessing,
  places,
  pharmacyKeyMissing = false,
  emergencyOverride  = false,
  user,
  authLoading,
  onSignIn,
  onSignOut,
  onPlaceClick,
  onCall119Click,
  onRecordingStart,
  onRecordingStop,
  ttsEnabled,
  onToggleTts,
  lastAssistantMessage,
  onReplayTts,
}: CareManagerPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [symptomInput, setSymptomInput] = useState('');

  function submitSymptom(source: 'text' | 'voice', textOverride?: string) {
    const raw = textOverride ?? symptomInput;
    const text = raw.trim();
    if (!text) return;
    setSymptomInput(text);
    onSubmitSymptom(text, source);
  }

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header} onClick={() => setIsExpanded(p => !p)}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>케어 매니저</span>
          {currentTriage && (
            <span
              style={{
                ...styles.triageBadge,
                background: TRIAGE_COLORS[currentTriage],
              }}
            >
              {TRIAGE_LABELS[currentTriage]}
            </span>
          )}
        </div>
        {/* Auth chip — stops propagation so clicks don't collapse the panel */}
        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <UserChip user={user} authLoading={authLoading} onSignIn={onSignIn} onSignOut={onSignOut} />
          <span style={styles.chevron}>{isExpanded ? '▾' : '▴'}</span>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* Triage guidance banner — full-width strip between header and body */}
          {currentTriage && !safeModeNoResult && (
            <TriageBanner triage={currentTriage} />
          )}

          {/* RED safety override banner */}
          {currentTriage === 'RED' && (
            <div style={{
              display:      'flex',
              alignItems:   'flex-start',
              gap:          '8px',
              background:   '#FFF1F2',
              borderBottom: '1px solid #FECACA',
              padding:      '8px 16px',
              fontSize:     '11px',
              color:        '#9F1239',
              lineHeight:   '1.5',
              fontWeight:   600,
            }}>
              <span style={{ flexShrink: 0, fontSize: '14px', lineHeight: '1.3' }}>🚨</span>
              <span>
                위험 신호로 판단되어 응급실/119를 우선 안내합니다.
                {emergencyOverride && (
                  <span style={{ display: 'block', fontWeight: 400, color: '#BE123C', marginTop: '1px' }}>
                    실시간 응급의료기관 정보 기준으로 표시됩니다.
                  </span>
                )}
                <a
                  href="tel:119"
                  onClick={onCall119Click}
                  style={{
                    display: 'inline-block',
                    marginTop: '6px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: '#B91C1C',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  119 전화
                </a>
              </span>
            </div>
          )}

          {/* GREEN supplemental hint — OTC fallback assurance */}
          {currentTriage === 'GREEN' && !safeModeNoResult && (
            <div style={{
              fontSize:    '11px',
              color:       '#166534',
              background:  '#F0FDF4',
              borderBottom: '1px solid #BBF7D0',
              padding:     '7px 16px',
              lineHeight:  '1.5',
            }}>
              약국이 닫아도 가까운 상비약 판매처(편의점/마트)로 안내할 수 있어요.
            </div>
          )}

        <div style={styles.body}>
          <div style={styles.settingsRow}>
            <label style={styles.settingsLabel}>
              <input
                type="checkbox"
                checked={ttsEnabled}
                onChange={(e) => onToggleTts(e.target.checked)}
              />
              <span>음성으로 읽기</span>
            </label>
          </div>

          {/* SAFE_MODE no-result warning */}
          {safeModeNoResult && (
            <div style={styles.safeModeWarning}>
              <span style={styles.safeModeIcon}>!</span>
              주변에 응급 가능 시설이 없습니다.
              <br />
              응급실 또는 응급 가능 병원으로 직접 이동하세요.
            </div>
          )}

          {/* Config notice — pharmacy key not set on backend */}
          {pharmacyKeyMissing && (
            <div style={{
              fontSize:     '11px',
              color:        '#6B7280',
              background:   '#F9FAFB',
              border:       '1px solid #E5E7EB',
              borderRadius: '6px',
              padding:      '6px 10px',
              marginBottom: '8px',
              lineHeight:   '1.5',
            }}>
              약국 영업 상태를 확인할 수 없습니다.
              <br />
              <span style={{ color: '#9CA3AF' }}>
                (백엔드에 DATA_GO_KR_SERVICE_KEY 미설정)
              </span>
            </div>
          )}

          {/* Ranked place list */}
          {!safeModeNoResult && places.length > 0 && (
            <div style={styles.placeList}>
              {places.map((place, i) => (
                <PlaceRow
                  key={place.id}
                  place={place}
                  rank={i + 1}
                  isTop={i === 0}
                  onClick={onPlaceClick}
                />
              ))}
            </div>
          )}

          {/* Conversation thread */}
          <div style={styles.thread}>
            {turns.length === 0 ? (
              <p style={styles.emptyState}>
                증상을 말씀해 주시면 가까운 의료기관을 안내해 드립니다.
              </p>
            ) : (
              [...turns].reverse().map(turn => (
                <TurnRow key={turn.turn_id} turn={turn} />
              ))
            )}
          </div>

          {lastAssistantMessage && (
            <div style={styles.assistantMessage}>
              <strong style={{ display: 'block', marginBottom: '4px' }}>어시스턴트</strong>
              <span>{lastAssistantMessage}</span>
            </div>
          )}

          <div style={styles.inputRow}>
            <input
              value={symptomInput}
              onChange={(e) => setSymptomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitSymptom('text');
                }
              }}
              placeholder="증상을 입력하세요"
              disabled={isProcessing}
              style={styles.input}
            />
            <button
              onClick={() => submitSymptom('text')}
              disabled={isProcessing || symptomInput.trim().length === 0}
              style={styles.submitButton}
            >
              전송
            </button>
          </div>

          {lastAssistantMessage && (
            <button
              onClick={onReplayTts}
              style={styles.ttsButton}
            >
              안내 음성 재생
            </button>
          )}

          {/* Voice input */}
          <VoiceInput
            onTranscript={(text) => submitSymptom('voice', text)}
            disabled={isProcessing}
            onRecordingStart={onRecordingStart}
            onRecordingStop={onRecordingStop}
          />
        </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UserChip — auth control rendered in the panel header
// ---------------------------------------------------------------------------

function UserChip({
  user,
  authLoading,
  onSignIn,
  onSignOut,
}: {
  user:      User | null;
  authLoading: boolean;
  onSignIn:  () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  if (authLoading) {
    return (
      <span style={{ fontSize: '11px', color: '#6B7280', whiteSpace: 'nowrap' }}>
        인증 확인중...
      </span>
    );
  }

  if (!user) {
    return (
      <button
        onClick={() => { void onSignIn(); }}
        style={{
          fontSize:     '11px',
          fontWeight:   600,
          color:        '#1D4ED8',
          background:   '#EFF6FF',
          border:       '1px solid #BFDBFE',
          borderRadius: '6px',
          padding:      '3px 8px',
          cursor:       'pointer',
          whiteSpace:   'nowrap',
          lineHeight:   '1.5',
        }}
      >
        Google 로그인
      </button>
    );
  }

  const avatarUrl  = user.user_metadata?.avatar_url as string | undefined;
  const displayName = (user.user_metadata?.name as string | undefined)
    ?? user.email
    ?? '사용자';
  // Truncate long names/emails in the chip
  const label = displayName.length > 14 ? displayName.slice(0, 13) + '…' : displayName;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      {/* Avatar */}
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          referrerPolicy="no-referrer"
          style={{ width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0 }}
        />
      ) : (
        <div style={{
          width:          '22px',
          height:         '22px',
          borderRadius:   '50%',
          background:     '#1D4ED8',
          color:          '#fff',
          fontSize:       '11px',
          fontWeight:     700,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
          textTransform:  'uppercase',
        }}>
          {displayName.charAt(0)}
        </div>
      )}

      {/* Name / email label */}
      <span style={{ fontSize: '11px', color: '#374151', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>

      {/* Logout button */}
      <button
        onClick={() => { void onSignOut(); }}
        title="로그아웃"
        style={{
          fontSize:     '10px',
          color:        '#6B7280',
          background:   'transparent',
          border:       '1px solid #E5E7EB',
          borderRadius: '4px',
          padding:      '2px 5px',
          cursor:       'pointer',
          lineHeight:   '1.4',
          flexShrink:   0,
        }}
      >
        로그아웃
      </button>
    </div>
  );
}

function TriageBanner({ triage }: { triage: NonNullable<TriageLevel> }) {
  const g = TRIAGE_GUIDANCE[triage];
  return (
    <div style={{
      display:       'flex',
      alignItems:    'flex-start',
      gap:           '10px',
      background:    g.bg,
      borderTop:     `1px solid ${g.border}`,
      borderBottom:  `1px solid ${g.border}`,
      padding:       '10px 16px',
    }}>
      <span style={{ fontSize: '18px', lineHeight: '1.3', flexShrink: 0 }}>{g.icon}</span>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 700, color: g.titleColor, marginBottom: '2px' }}>
          {g.title}
        </div>
        <div style={{ fontSize: '11px', color: g.subColor, lineHeight: '1.5' }}>
          {g.sub}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReasonTag — colour-coded chip for the three rank reason types
// ---------------------------------------------------------------------------

const REASON_STYLE: Record<string, { background: string; color: string }> = {
  '증상 적합': { background: '#EFF6FF', color: '#1D4ED8' },
  '영업 중':   { background: '#F0FDF4', color: '#166534' },
  '가까움':    { background: '#F5F3FF', color: '#6D28D9' },
};

function ReasonTag({ reason }: { reason: string }) {
  const style = REASON_STYLE[reason] ?? { background: '#F3F4F6', color: '#374151' };
  return (
    <span style={{
      ...style,
      borderRadius: '4px',
      padding:      '1px 5px',
      fontSize:     '10px',
      fontWeight:   700,
      whiteSpace:   'nowrap',
      letterSpacing: '0.2px',
    }}>
      {reason}
    </span>
  );
}

function PlaceRow({
  place,
  rank,
  isTop,
  onClick,
}: {
  place: Place;
  rank: number;
  isTop: boolean;
  onClick: (place: Place, rank: number, source: 'panel') => void;
}) {
  // OTC_STORE (convenience stores / marts) do not have reliable open-status data.
  // Show a hedged label instead of claiming OPEN/CLOSED.
  const isOtc = place.source === 'OTC_STORE';

  const openColor = isOtc
    ? '#FF9800'
    : place.open_status === 'OPEN'   ? '#4CAF50'
    : place.open_status === 'CLOSED' ? '#F44336'
    :                                  '#FF9800';

  const openLabel = isOtc
    ? '운영 가능성 높음'
    : place.open_status === 'OPEN'   ? '영업 중'
    : place.open_status === 'CLOSED' ? '영업 종료'
    :                                  '확인 불가';

  if (isTop) {
    return (
      <div style={{
        background:   '#FFFBEB',
        border:       '2px solid #F59E0B',
        borderRadius: '10px',
        padding:      '10px 10px 8px',
        boxShadow:    '0 2px 8px rgba(245,158,11,0.18)',
        marginBottom: '2px',
        cursor: 'pointer',
      }}
      onClick={() => onClick(place, rank, 'panel')}
      >
        {/* Header row: 추천 badge + open status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{
            fontSize:     '10px',
            fontWeight:   700,
            color:        '#fff',
            background:   '#F59E0B',
            borderRadius: '4px',
            padding:      '2px 7px',
            letterSpacing: '0.5px',
          }}>
            ★ 추천
          </span>
          <span style={{ fontSize: '11px', color: openColor, fontWeight: 600 }}>{openLabel}</span>
        </div>

        {/* Place name */}
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#111', marginBottom: '4px', lineHeight: '1.3' }}>
          {place.name}
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#888' }}>
          <span style={{
            background:   '#FEF3C7',
            color:        '#92400E',
            borderRadius: '4px',
            padding:      '1px 5px',
            fontWeight:   600,
          }}>
            1위
          </span>
          <span>{place.distance_km.toFixed(2)} km</span>
          <span style={{ color: '#CCC' }}>|</span>
          <span style={{
            ...SOURCE_CHIP_STYLE[place.source],
            borderRadius: '4px',
            padding:      '1px 5px',
            fontWeight:   500,
            whiteSpace:   'nowrap',
          }}>
            {SOURCE_LABELS[place.source]}
          </span>
          {place.rank_reason && (
            <ReasonTag reason={place.rank_reason} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onClick(place, rank, 'panel')}
      style={{
        ...styles.placeRow,
        background: 'transparent',
        border: '1px solid transparent',
        borderRadius: '8px',
        cursor: 'pointer',
      }}
    >
      <div style={{ ...styles.rankBadge, background: '#E3E8EF', color: '#555', fontWeight: 500 }}>
        {rank}
      </div>
      <div style={styles.placeInfo}>
        <span style={{ ...styles.placeName, fontWeight: 500 }}>{place.name}</span>
        <div style={styles.placeMeta}>
          <span style={{
            ...SOURCE_CHIP_STYLE[place.source],
            borderRadius: '4px',
            padding:      '1px 4px',
            fontWeight:   500,
          }}>
            {SOURCE_LABELS[place.source]}
          </span>
          <span>{place.distance_km.toFixed(2)} km</span>
          <span style={{ color: openColor }}>{openLabel}</span>
          {place.rank_reason && (
            <ReasonTag reason={place.rank_reason} />
          )}
        </div>
      </div>
    </div>
  );
}

function TurnRow({ turn }: { turn: Turn }) {
  const color = turn.triage_level ? TRIAGE_COLORS[turn.triage_level] : '#999';

  return (
    <div style={styles.turnRow}>
      <div style={{ ...styles.turnDot, background: color }} />
      <div style={styles.turnContent}>
        <p
          style={{
            ...styles.transcript,
            color:     turn.triage_level ? '#333' : '#AAA',
            fontStyle: turn.triage_level ? 'normal' : 'italic',
          }}
        >
          {turn.transcript || '(음성 인식 중...)'}
        </p>
        {turn.triage_level && (
          <span style={{ ...styles.turnBadge, color }}>
            {TRIAGE_LABELS[turn.triage_level]}
          </span>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position:     'fixed',
    bottom:       '24px',
    right:        '24px',
    width:        '320px',
    background:   '#fff',
    borderRadius: '16px',
    boxShadow:    '0 4px 24px rgba(0,0,0,0.15)',
    overflow:     'hidden',
    zIndex:       1000,
    fontFamily:   'system-ui, sans-serif',
  },
  header: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '14px 16px',
    cursor:         'pointer',
    userSelect:     'none',
    background:     '#FAFAFA',
    borderBottom:   '1px solid #EEE',
  },
  headerLeft: {
    display:    'flex',
    alignItems: 'center',
    gap:        '8px',
  },
  title: {
    fontWeight: 600,
    fontSize:   '15px',
    color:      '#222',
  },
  triageBadge: {
    color:        '#fff',
    fontSize:     '11px',
    fontWeight:   700,
    padding:      '2px 8px',
    borderRadius: '99px',
    letterSpacing: '0.3px',
  },
  chevron: {
    fontSize: '14px',
    color:    '#AAA',
  },
  body: {
    padding: '12px 16px 16px',
  },
  settingsRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: '8px',
  },
  settingsLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    color: '#4B5563',
  },
  safeModeWarning: {
    fontSize:     '13px',
    color:        '#fff',
    background:   '#F44336',
    borderRadius: '8px',
    padding:      '10px 12px',
    marginBottom: '10px',
    lineHeight:   '1.6',
    fontWeight:   500,
  },
  safeModeIcon: {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    width:          '18px',
    height:         '18px',
    borderRadius:   '50%',
    border:         '2px solid #fff',
    fontWeight:     800,
    fontSize:       '12px',
    marginRight:    '6px',
    verticalAlign:  'middle',
  },
  thread: {
    maxHeight:  '200px',
    overflowY:  'auto',
    marginBottom: '4px',
  },
  inputRow: {
    display: 'flex',
    gap: '6px',
    marginBottom: '8px',
  },
  assistantMessage: {
    fontSize: '12px',
    color: '#1F2937',
    background: '#F3F4F6',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '8px 10px',
    lineHeight: '1.5',
    marginBottom: '8px',
  },
  input: {
    flex: 1,
    border: '1px solid #D1D5DB',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#111827',
    padding: '8px 10px',
    outline: 'none',
  },
  submitButton: {
    border: '1px solid #BFDBFE',
    background: '#EFF6FF',
    color: '#1E40AF',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 600,
    padding: '0 10px',
    cursor: 'pointer',
  },
  emptyState: {
    fontSize:   '13px',
    color:      '#AAA',
    textAlign:  'center',
    padding:    '16px 0',
    margin:     0,
    lineHeight: '1.6',
  },
  turnRow: {
    display:      'flex',
    gap:          '10px',
    marginBottom: '10px',
    alignItems:   'flex-start',
  },
  turnDot: {
    width:        '8px',
    height:       '8px',
    borderRadius: '50%',
    marginTop:    '5px',
    flexShrink:   0,
  },
  turnContent: {
    flex: 1,
  },
  transcript: {
    margin:     '0 0 2px',
    fontSize:   '13px',
    color:      '#333',
    lineHeight: '1.5',
  },
  turnBadge: {
    fontSize:   '11px',
    fontWeight: 600,
  },

  // Place list
  placeList: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '4px',
    marginBottom:  '10px',
  },
  ttsButton: {
    width: '100%',
    border: '1px solid #BFDBFE',
    background: '#EFF6FF',
    color: '#1E40AF',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 600,
    padding: '7px 10px',
    cursor: 'pointer',
    marginBottom: '8px',
  },
  placeRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '8px',
    padding:    '6px 8px',
    transition: 'background 0.15s',
  },
  rankBadge: {
    width:          '20px',
    height:         '20px',
    borderRadius:   '50%',
    fontSize:       '11px',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  placeInfo: {
    flex:          1,
    display:       'flex',
    flexDirection: 'column',
    gap:           '1px',
    minWidth:      0,
  },
  placeName: {
    fontSize:     '12px',
    color:        '#222',
    whiteSpace:   'nowrap',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    display:      'flex',
    alignItems:   'center',
    gap:          '5px',
  },
  placeMeta: {
    display:  'flex',
    gap:      '8px',
    fontSize: '11px',
    color:    '#888',
  },
};
