# API Specification (Current)

## Base URL

```txt
http://localhost:8000
```

---

## Health

### GET `/health`

Response:

```json
{ "status": "ok" }
```

---

## Voice Turn

### POST `/api/voice-turn`

현재 프론트(STT 결과 텍스트) 기준 통합 엔드포인트.

Request (`application/json`):

```json
{
  "transcript": "가슴이 답답하고 숨이 차요",
  "lat": 37.57,
  "lng": 126.98,
  "q0": "서울특별시",
  "q1": "종로구"
}
```

Notes:
- `transcript`는 필수
- `lat/lng/q0/q1`는 선택(없으면 fallback 추천 사용)

Response 200:

```json
{
  "turn_id": "uuid",
  "transcript": "가슴이 답답하고 숨이 차요",
  "triage_level": "RED",
  "top5_places": [
    {
      "id": "string",
      "name": "string",
      "source": "EMERGENCY",
      "category": "emergency_room",
      "address": "string",
      "lat": 0,
      "lng": 0,
      "distance_km": 0,
      "open_status": "OPEN",
      "suitability_score": 0,
      "final_score": 0,
      "safe_mode_applied": false,
      "rank_reason": "증상 적합"
    }
  ],
  "tts_audio_url": null,
  "safe_mode_result": {
    "applied": false,
    "no_result": false
  },
  "assistant_message": "위험 신호가 감지되었습니다..."
}
```

Error:
- 422: `transcript` 비어 있음

---

## Nearby APIs

### GET `/api/hospitals/nearby`

Query:
- `lat` (required)
- `lng` (required)
- `q0` (required)
- `q1` (optional)
- `radius_km` (default 5, max 20)
- `limit` (default 20, max 50)

### GET `/api/emergency/nearby`

Query:
- `lat` (required)
- `lng` (required)
- `q0` (required)
- `q1` (optional)
- `radius_km` (default 10, max 50)
- `limit` (default 10, max 30)

### GET `/api/pharmacy/open-status`

Query:
- `q0` (required)
- `q1` (required)
- `names` (required, comma-separated)
- `q1_fallback` (optional)
- `now` (optional, HHMM)
- `holiday` (optional, bool)

---

## Config Notes

- `DATA_GO_KR_SERVICE_KEY` 미설정 시 일부 엔드포인트가 `503` 반환
- 프론트는 `VITE_API_BASE_URL`로 백엔드 주소를 지정
