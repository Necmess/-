import { useState, useRef, useEffect } from 'react';
import { createDefaultSttProvider, type SttProvider } from '../../lib/voice';

interface VoiceInputProps {
  onTranscript: (transcript: string) => void;
  disabled?: boolean;
  onRecordingStart?: () => void;
  onRecordingStop?: (durationSec: number) => void;
}

type RecordingState = 'idle' | 'recording';

export default function VoiceInput({
  onTranscript,
  disabled = false,
  onRecordingStart,
  onRecordingStop,
}: VoiceInputProps) {
  const [state, setState] = useState<RecordingState>('idle');
  const [micErr, setMicErr] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const finalTranscriptRef = useRef('');
  const sttProviderRef = useRef<SttProvider>(createDefaultSttProvider());

  useEffect(() => {
    return () => {
      sttProviderRef.current.abort();
    };
  }, []);

  function startRecording() {
    setMicErr(null);
    if (!sttProviderRef.current.isSupported()) {
      setMicErr('이 브라우저는 음성 인식(Web Speech API)을 지원하지 않습니다. Chrome을 사용해 주세요.');
      return;
    }
    finalTranscriptRef.current = '';
    sttProviderRef.current.start({
      lang: 'ko-KR',
      onStart: () => {
        setState('recording');
        setCaption('');
        onRecordingStart?.();
      },
      onPartialTranscript: (text) => {
        setCaption((finalTranscriptRef.current || text).trim());
      },
      onFinalTranscript: (text) => {
        finalTranscriptRef.current = text;
        setCaption(text);
      },
      onStop: (durationSec) => {
        setState('idle');
        onRecordingStop?.(durationSec);
        const finalText = finalTranscriptRef.current.trim();
        if (finalText) onTranscript(finalText);
      },
      onError: (message) => setMicErr(message),
    });
  }

  function stopRecording() {
    sttProviderRef.current.stop();
  }

  function handleClick() {
    if (disabled) return;
    if (state === 'idle') startRecording();
    else stopRecording();
  }

  const isRecording = state === 'recording';

  return (
    <div style={styles.wrapper}>
      <button
        onClick={handleClick}
        disabled={disabled}
        aria-label={isRecording ? '녹음 중지' : '음성 입력 시작'}
        style={{
          ...styles.button,
          background: isRecording ? '#F44336' : '#1976D2',
          boxShadow:  isRecording
            ? '0 0 0 8px rgba(244,67,54,0.18), 0 2px 8px rgba(0,0,0,0.2)'
            : '0 2px 8px rgba(0,0,0,0.25)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {isRecording ? <StopIcon /> : <MicIcon />}
      </button>

      {/* Elapsed timer — only visible while recording */}
      {isRecording && (
        <span style={styles.elapsed}>듣는 중...</span>
      )}

      <span style={styles.label}>
        {disabled
          ? '처리 중...'
          : isRecording
          ? '듣는 중... 탭하여 중지'
          : '탭하여 증상 말하기'}
      </span>

      {caption && <span style={styles.caption}>{caption}</span>}
      {micErr && <span style={styles.micError}>{micErr}</span>}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            '6px',
    padding:        '12px 0 4px',
  },
  button: {
    width:          '60px',
    height:         '60px',
    borderRadius:   '50%',
    border:         'none',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    transition:     'background 0.2s, box-shadow 0.2s, opacity 0.2s',
    flexShrink:     0,
  },
  elapsed: {
    fontSize:    '13px',
    fontWeight:  600,
    color:       '#F44336',
    letterSpacing: '0.3px',
  },
  label: {
    fontSize:   '12px',
    color:      '#888',
    textAlign:  'center',
    lineHeight: '1.4',
  },
  micError: {
    fontSize:  '11px',
    color:     '#F44336',
    textAlign: 'center',
  },
  caption: {
    fontSize: '11px',
    color: '#374151',
    textAlign: 'center',
    maxWidth: '240px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};
