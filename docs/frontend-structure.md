# Frontend Structure — AI Care Manager MVP

## Stack

- React (TypeScript)
- Naver Map JS SDK
- Supabase JS client (auth)
- Axios or fetch (API calls)

---

## Screen Map

```
/ (root)
  └── LoginPage          Google OAuth entry point

/map
  └── MapPage            Main screen (requires auth)
        ├── MapView           Full-screen map
        │     └── PlaceMarker × 5
        └── CareManagerPanel  Bottom-right overlay
              ├── TriageStatus
              ├── ConversationThread
              ├── VoiceInput
              └── TtsPlayer
```

---

## Feature Modules

### `features/auth/`

| File | Responsibility |
|------|---------------|
| `useAuth.ts` | Supabase session state, login/logout, JWT access |
| `GoogleLoginButton.tsx` | Triggers Supabase Google OAuth flow |

Auth state is consumed globally via `providers.tsx`. All routes except `/` require an active session; unauthenticated users are redirected to `LoginPage`.

---

### `features/map/`

| File | Responsibility |
|------|---------------|
| `MapView.tsx` | Mounts Naver Map SDK, renders map container, owns marker list |
| `PlaceMarker.tsx` | Renders a single Top5 place marker; RED triage uses distinct marker theme |
| `useUserLocation.ts` | `navigator.geolocation.watchPosition` — streams lat/lng updates to parent |
| `useNearbyPlaces.ts` | Holds `top5_places[]` from last `/voice-turn` response; exposes to `MapView` |

**SAFE_MODE behavior in map:**
- When `safe_mode_applied: true`, markers render in RED theme only.
- When `safe_mode_no_result: true`, no markers are rendered; map shows default view.

---

### `features/care-manager/`

| File | Responsibility |
|------|---------------|
| `CareManagerPanel.tsx` | Bottom-right panel container; owns overall panel state (idle / recording / responding / error) |
| `TriageStatus.tsx` | Displays GREEN / AMBER / RED badge based on last triage result |
| `ConversationThread.tsx` | Scrollable history of turns (transcript + triage per turn) |
| `VoiceInput.tsx` | Record button; delegates to `useVoiceRecorder`; submits audio blob to `/voice-turn` |
| `TtsPlayer.tsx` | Plays `tts_audio_url` when received; falls back to displaying transcript text if null |

**Tone rules for Care Manager panel:**
- Calm, non-aggressive tone in all display text.
- Short TTS responses (generated server-side).
- No diagnosis language anywhere in the UI.

**SAFE_MODE no-result state in panel:**
- `TriageStatus` shows RED.
- `ConversationThread` shows fixed warning message: "주변에 응급 가능 시설이 없습니다."
- `TtsPlayer` reads the warning aloud: "응급실 또는 응급 가능 병원으로 직접 이동하세요."

---

### `features/analytics/`

| File | Responsibility |
|------|---------------|
| `useEventLogger.ts` | Wraps `POST /event`; fire-and-forget; does not block UI |

Called at key moments: `voice_start`, `stt_done`, `triage_done`, `place_ranked`, `tts_played`, `error`. `turn_id` is null for events fired before `/voice-turn` responds.

---

## Shared Hooks

| File | Responsibility |
|------|---------------|
| `useVoiceRecorder.ts` | Browser `MediaRecorder` wrapper; exposes start, stop, audio blob |
| `useSession.ts` | Manages `session_id` UUID; creates new session on first turn; persists in memory |

---

## Lib Layer

| File | Responsibility |
|------|---------------|
| `supabaseClient.ts` | Initialized Supabase JS client (used only for auth) |
| `apiClient.ts` | Configured fetch/axios instance pointing to FastAPI; attaches JWT automatically |
| `naverMapLoader.ts` | Async SDK loader; resolves when `window.naver.maps` is ready |

---

## Types

```
types/triage.ts
  TriageLevel       "GREEN" | "AMBER" | "RED"
  Turn              { turn_id, transcript, triage_level, top5_places, tts_audio_url, safe_mode_result }
  SafeModeResult    { applied, no_result }

types/place.ts
  Place             { id, name, category, lat, lng, distance_km, open_status, suitability_score, final_score, safe_mode_applied }
  OpenStatus        "OPEN" | "CLOSED" | "UNKNOWN"
```

---

## Constants

```
constants/triage.ts
  TRIAGE_COLORS     { GREEN: "#4CAF50", AMBER: "#FF9800", RED: "#F44336" }
  TRIAGE_LABELS     { GREEN: "...", AMBER: "...", RED: "..." }
```

---

## State Ownership

```
MapPage (page-level)
  ├── userLocation { lat, lng }        — from useUserLocation
  ├── sessionId    string              — from useSession
  └── lastTurn     Turn | null         — updated after each /voice-turn response
        ├── passed to MapView          (top5_places, safe_mode_result)
        └── passed to CareManagerPanel (transcript, triage_level, tts_audio_url, safe_mode_result)
```

No global state manager in MVP. Props and local state are sufficient.

---

## Environment Variables

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_API_BASE_URL          FastAPI base URL
VITE_NAVER_MAP_CLIENT_ID   Naver Map JS SDK client ID
```
