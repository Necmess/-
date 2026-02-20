# API Specification — AI Care Manager MVP

## Base URL

```
http://localhost:8000        (local dev)
https://api.<domain>.com     (production)
```

All endpoints require a valid Supabase JWT in the `Authorization: Bearer <token>` header, verified by `middleware/auth.py`.

---

## Endpoints

### POST /voice-turn

Processes one voice turn: STT → triage → place ranking → TTS.

**Request**

```
Content-Type: multipart/form-data

Fields:
  audio_file   file     Raw audio blob (webm/mp4/wav)
  session_id   string   UUID of the active session
  lat          float    User's current latitude
  lng          float    User's current longitude
```

**Response 200**

```json
{
  "turn_id":       "uuid",
  "transcript":    "string — STT output",
  "triage_level":  "GREEN | AMBER | RED",
  "top5_places": [
    {
      "id":                "string",
      "name":              "string",
      "category":          "string",
      "address":           "string",
      "lat":               0.0,
      "lng":               0.0,
      "distance_km":       0.0,
      "open_status":       "OPEN | CLOSED | UNKNOWN",
      "suitability_score": 0.0,
      "final_score":       0.0,
      "safe_mode_applied": false
    }
  ],
  "tts_audio_url": "string | null",
  "safe_mode_result": {
    "applied":   false,
    "no_result": false
  }
}
```

**Response — STT failure**

```json
{ "error": "stt_failed" }
```
HTTP 422. Pipeline stops. No triage or ranking is performed.

**Response — SAFE_MODE empty result (RED triage)**

```json
{
  "turn_id":       "uuid",
  "transcript":    "string",
  "triage_level":  "RED",
  "top5_places":   [],
  "tts_audio_url": "string | null",
  "safe_mode_result": {
    "applied":   true,
    "no_result": true
  }
}
```
HTTP 200. Frontend is responsible for showing the no-result warning state.

**Notes**

- LLM triage failure silently falls back to rule-based triage. Response contract is identical.
- Open status failure sets `open_status: "UNKNOWN"` per place. Pipeline continues.
- TTS failure sets `tts_audio_url: null`. Full response is still returned.
- AI response (via TTS) describes risk level and recommended action only. It does not diagnose.

---

### POST /event

Appends a single funnel analytics event. Fire-and-forget from the frontend.

**Request**

```
Content-Type: application/json

{
  "session_id":  "uuid",
  "turn_id":     "uuid | null",
  "event_type":  "string",
  "payload":     {}
}
```

**Allowed `event_type` values**

| Value | Fired when |
|-------|-----------|
| `voice_start` | User begins recording |
| `stt_done` | Transcript received |
| `triage_done` | Triage level assigned |
| `place_ranked` | Top5 list returned |
| `tts_played` | Audio playback started |
| `error` | Any pipeline error |

**Response 200**

```json
{ "event_id": "uuid" }
```

**Notes**

- Frontend should not await this call before rendering results.
- `turn_id` is null for events fired before `/voice-turn` returns.
- No validation on `payload` shape — flexible jsonb storage.

---

## Auth Flow

```
Frontend (Supabase Google OAuth)
  → receives JWT
  → attaches as Authorization: Bearer <token> on every request

Backend (middleware/auth.py)
  → verifies JWT with Supabase public key
  → injects user_id into request context
  → 401 if missing or invalid
```

Session creation (`sessions` table row) is handled server-side on the first `/voice-turn` call if no active session exists for the user.

---

## Error Codes

| HTTP | Condition |
|------|-----------|
| 200 | Success (including SAFE_MODE empty result) |
| 401 | Missing or invalid JWT |
| 422 | STT failure (pipeline cannot proceed) |
| 500 | Unexpected server error |
