# 프로젝트 진행 현황 (2026-02-20)

## 1) 현재 완료된 범위

### 프론트엔드 기본 흐름
- 증상 입력(텍스트/음성) 후 트리아지 분류(GREEN/AMBER/RED)
- 분류 결과 기반 Top5 장소 표시
- 위험(RED) 시 119 안내 UI 노출
- 지도 플레이스홀더 + 목록/마커 인터랙션

### 인증
- Supabase Auth(Google OAuth) 연동
- 로그인/로그아웃 UI 반영
- 사용자 아바타/이메일 표시
- 세션 유지(새로고침 후 복원)

### 퍼널 분석
- Supabase `events` 테이블 SQL 추가
- `logEvent` 유틸 + 세션 ID(localStorage) 기반 이벤트 적재
- 핵심 이벤트 로깅:
  - `app_open`
  - `login_success`
  - `location_permission_granted`
  - `symptom_submit`
  - `triage_result`
  - `top5_shown`
  - `place_click`
  - `call_119_click`
  - `stt_record_start` / `stt_record_stop`
  - `tts_play`

### 음성 기능
- STT: Web Speech API(Chrome) 기반
  - 탭 시작/중지, 에러 처리(미지원/권한 거부/무음)
- TTS: SpeechSynthesis 기반
  - 자동 읽기 토글
  - 마지막 어시스턴트 메시지 재생 버튼

## 2) STT/TTS 추상화 레이어

UI를 바꾸지 않고 제공자만 교체할 수 있도록 인터페이스를 분리함.

- `frontend/src/lib/voice/types.ts`
  - `SttProvider`, `TtsProvider` 인터페이스 정의
- `frontend/src/lib/voice/providers/browser.ts`
  - 브라우저 기본 구현(Web Speech / SpeechSynthesis)
- `frontend/src/lib/voice/index.ts`
  - 기본 provider 팩토리(`createDefaultSttProvider`, `createDefaultTtsProvider`)
  - 추후 백엔드/OpenAI provider 전환 TODO 포함

## 3) 다음 단계 (권장)

1. 백엔드 STT/TTS provider 구현(Whisper/TTS 프록시 API)
2. provider 선택을 env 기반으로 분기
3. Supabase RLS 정책 세분화(수집/조회 권한 분리)
4. 실제 지도 SDK(Naver) 및 실 데이터 API 연결 고도화
