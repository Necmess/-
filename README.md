# 의료데이터 기반 응급/의료 안내 프로젝트

증상 입력(텍스트/음성) 기반으로 위험도를 분류하고, 사용자 위치 주변 의료기관 후보를 안내하는 웹 프로젝트입니다.

## 구성

- `frontend/`: React + Vite + TypeScript
- `backend/`: Python API(서비스/모델/테스트)
- `docs/`: 구조, API, 데이터 흐름, 진행 현황 문서

## 주요 기능(현재)

- 증상 입력: 텍스트 + STT(Web Speech API)
- 분류: GREEN / AMBER / RED
- 결과 안내: Top5 장소, RED 시 119 안내
- 인증: Supabase Google OAuth
- 분석: Supabase `events` 테이블로 퍼널 이벤트 적재
- 음성 출력: SpeechSynthesis 기반 자동 읽기/재생
- 음성 추상화: STT/TTS provider 인터페이스 분리(브라우저 기본, 백엔드 교체 준비)

## 빠른 실행

### 1) 프론트엔드

```bash
cd frontend
npm install
npm run dev
```

필수 환경변수(`frontend/.env`):

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_BASE_URL=http://localhost:8000
```

### 2) 백엔드

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 분석 이벤트 테이블

- SQL: `docs/sql/events.sql`
- Supabase SQL Editor에서 실행 후 이벤트 수집 가능

## 진행 현황 문서

- 한국어 정리: `docs/progress-ko.md`

## 참고

- 루트 `.gitignore`에서 대용량 원본 CSV(`*.csv`)는 커밋 제외됩니다.

## 향후 계획

- 수익화: 광고 등 서비스 모델을 통한 머니 획득 구조 설계
- LLM 고도화: 레그(RAG) 기반 지식 결합으로 분류/설명 품질 향상
- 이동 지원: 길찾기 기능 및 실시간 추적 기능 연동
- 사용자 경험: 모바일 화면/성능 최적화 및 PWA 수준 개선
