# Data Flow — AI Care Manager MVP

## Overview

User voice input is processed through a sequential pipeline that produces a triage level, a filtered and ranked list of nearby medical places, and a spoken response. The pipeline is designed to degrade gracefully at each stage.

---

## Full Pipeline (per voice turn)

```
[User]
  │
  │  audio blob (multipart)
  ▼
[STT — OpenAI Whisper]
  │  transcript (text)
  │  FAIL → return error: stt_failed (pipeline stops)
  ▼
[LLM Triage — GPT]
  │  triage_level: GREEN | AMBER | RED
  │  FAIL → rule_triage.py (keyword-based fallback, same output contract)
  ▼
[Place Search — CSV]
  │  loads medical_places.csv at startup
  │  filters candidates within SEARCH_RADIUS_KM using haversine distance
  │  output: candidate_list[]
  ▼
[Open Status — External API]
  │  one call per candidate to check OPEN / CLOSED / UNKNOWN
  │  FAIL or timeout → status defaults to UNKNOWN for that candidate
  │  pipeline continues regardless
  ▼
[SAFE_MODE Gate]
  │  activates ONLY when triage_level == RED
  │  EXCLUDES: pharmacy, convenience_store, drugstore, supermarket, beauty_clinic
  │  ALLOWS:   emergency_room, hospital, trauma_center, urgent_care
  │  ALLOWS:   any place where triage_tags contains "emergency"
  │  constraints are never relaxed regardless of result count
  │  if result is empty → safe_mode_no_result: true (pipeline continues, ranking skipped)
  │
  │  GREEN / AMBER → gate is bypassed entirely
  ▼
[Ranking]
  │  receives already-filtered candidate_list (post SAFE_MODE if RED)
  │  scores each candidate:
  │    final_score = (w_dist × distance_score)
  │                + (w_open × open_bonus)
  │                + (w_tri  × suitability_score)
  │
  │  distance_score   — inverse normalized haversine distance
  │  open_bonus       — OPEN: 1.0 | UNKNOWN: 0.5 | CLOSED: 0.0
  │  suitability_score — derived from triage_tags.py (triage level × place tags)
  │
  │  weights defined in config.py (default: 0.35 / 0.30 / 0.35)
  │  no external review scores used
  │  returns Top5 sorted by final_score
  ▼
[TTS — OpenAI]
  │  generates short spoken response (calm tone, triage-appropriate)
  │  AI does NOT diagnose — response describes risk level and recommended action only
  │  FAIL → tts_audio_url: null (text response still returned)
  ▼
[Response to Frontend]
     transcript, triage_level,
     top5_places[], tts_audio_url,
     turn_id, safe_mode_result{}
```

---

## Triage Levels

| Level | Meaning | SAFE_MODE |
|-------|---------|-----------|
| GREEN | Low risk, self-care possible | Bypassed |
| AMBER | Moderate, visit within hours | Bypassed |
| RED | Urgent, immediate attention required | Active |

AI classifies risk level only. It does not diagnose.

---

## Fallback Behavior

| Stage | Failure | Fallback |
|-------|---------|----------|
| STT | API error | Return `stt_failed`, stop pipeline |
| LLM Triage | API error | `rule_triage.py` keyword-based classifier |
| Open Status | API error / timeout | Status set to `UNKNOWN`, pipeline continues |
| SAFE_MODE | No eligible candidates | Return empty list + `safe_mode_no_result: true` |
| TTS | API error | `tts_audio_url: null`, text response only |

---

## Data Persistence (per turn)

```
sessions  — one row per user session (started_at, final_triage_level)
turns     — one row per voice turn (transcript, triage_level, top5_places jsonb, safe_mode_result jsonb)
events    — append-only log (voice_start, stt_done, triage_done, place_ranked, tts_played, error)
```

Events are fired asynchronously and do not block the pipeline response.

---

## CSV Dataset Lifecycle

```
App startup  →  place_search.py loads medical_places.csv into memory
Per request  →  in-memory filter by (lat, lng, radius_km)
Update path  →  replace CSV file and restart (no hot reload in MVP)
```

External APIs are never used for place discovery — only for open status enrichment.
