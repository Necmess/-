import uuid
import json
import random
from typing import Optional

from app.core.config import settings
from app.services.emergency import fetch_nearby_emergency
from app.services.hospital import fetch_nearby_hospitals


def classify_triage(text: str) -> str:
    s = text.lower()
    red_keywords = [
        "의식", "실신", "경련", "마비", "심한 출혈", "피를 많이", "호흡곤란",
        "숨이 안", "가슴 통증", "압박", "119", "응급",
    ]
    amber_keywords = [
        "열", "고열", "통증", "어지러움", "복통", "구토", "설사", "기침",
        "몸살", "염증", "붓기",
    ]

    if any(k in s for k in red_keywords):
        return "RED"
    if any(k in s for k in amber_keywords):
        return "AMBER"
    return "GREEN"


def _reason_for(idx: int, open_status: str) -> str:
    if idx == 0:
        return "증상 적합"
    if open_status == "OPEN":
        return "영업 중"
    return "가까움"


def _assistant_message(triage_level: str, top_places: list[dict]) -> str:
    variants: dict[str, list[str]] = {
        "RED": [
            "위험 신호가 감지되었습니다. 즉시 119 또는 응급실을 권장합니다.",
            "응급 가능성이 높습니다. 지금 바로 119 연락 또는 응급실 이동을 권장합니다.",
            "현재 증상은 지체 없이 응급 대응이 필요할 수 있습니다. 119 또는 응급실을 우선하세요.",
        ],
        "AMBER": [
            "의료기관 방문이 권장됩니다.",
            "증상이 지속될 수 있어 가까운 병·의원 방문을 권장합니다.",
            "안전을 위해 오늘 중 의료기관 진료를 받아보세요.",
        ],
        "GREEN": [
            "자가 관리가 가능한 수준으로 보입니다.",
            "현재로서는 비교적 경미한 상태로 보입니다.",
            "응급도는 낮아 보이며, 증상 경과를 관찰해 주세요.",
        ],
    }

    seed = abs(hash((triage_level, top_places[0]["name"] if top_places else "none")))
    head = random.Random(seed).choice(variants.get(triage_level, variants["GREEN"]))

    if not top_places:
        return f"{head} 주변 추천 장소를 찾지 못했습니다."

    p = top_places[0]
    return f"{head} 가장 적합한 곳은 {p['name']}이며 거리 {p['distance_km']:.2f}km입니다."


def _normalize_region(q0: Optional[str], q1: Optional[str]) -> tuple[str, str]:
    # MVP fallback: if region is missing, use Seoul defaults so data.go.kr calls still work.
    # TODO: replace with reverse-geocoding based region derivation from lat/lng.
    nq0 = (q0 or "").strip() or "서울특별시"
    nq1 = (q1 or "").strip() or "종로구"
    return nq0, nq1


def _try_generate_with_openai(transcript: str, triage_level: str, top_places: list[dict]) -> Optional[str]:
    if not settings.OPENAI_API_KEY:
        return None

    try:
        from openai import OpenAI  # type: ignore
    except Exception:
        return None

    top = top_places[0] if top_places else None
    prompt = {
        "transcript": transcript,
        "triage_level": triage_level,
        "top_place": {
            "name": top["name"] if top else None,
            "distance_km": top["distance_km"] if top else None,
        },
        "instruction": "한국어로 1~2문장, 과장 없이 안전 중심 안내문 생성",
    }
    schema = {
        "type": "object",
        "properties": {"assistant_message": {"type": "string"}},
        "required": ["assistant_message"],
        "additionalProperties": False,
    }

    try:
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "너는 응급 분류 보조 안내를 작성하는 의료 앱 어시스턴트다."},
                {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
                {"role": "user", "content": f"다음 JSON 스키마로만 답해: {json.dumps(schema, ensure_ascii=False)}"},
            ],
            temperature=0.3,
        )
        raw = (resp.choices[0].message.content or "").strip()
        if not raw:
            return None
        parsed = json.loads(raw)
        msg = str(parsed.get("assistant_message", "")).strip()
        return msg or None
    except Exception:
        return None


def _fallback_places(triage_level: str) -> list[dict]:
    if triage_level == "RED":
        return [
            {
                "id": "fallback-emergency-1",
                "name": "서울대학교병원 응급센터",
                "source": "EMERGENCY",
                "category": "emergency_room",
                "address": "서울 종로구 대학로 101",
                "lat": 37.5796,
                "lng": 126.9996,
                "distance_km": 1.0,
                "open_status": "OPEN",
                "suitability_score": 0.95,
                "final_score": 0.95,
                "safe_mode_applied": False,
            }
        ]
    return [
        {
            "id": "fallback-hospital-1",
            "name": "종로 연세의원",
            "source": "HOSPITAL",
            "category": "clinic",
            "address": "서울 종로구 종로 140",
            "lat": 37.5703,
            "lng": 126.9830,
            "distance_km": 1.4,
            "open_status": "OPEN",
            "suitability_score": 0.80,
            "final_score": 0.80,
            "safe_mode_applied": False,
        }
    ]


async def run_voice_turn(
    transcript: str,
    lat: Optional[float],
    lng: Optional[float],
    q0: Optional[str],
    q1: Optional[str],
) -> dict:
    triage_level = classify_triage(transcript)
    q0_norm, q1_norm = _normalize_region(q0, q1)

    top_places: list[dict] = []
    if lat is not None and lng is not None:
        if triage_level == "RED":
            emergency = await fetch_nearby_emergency(
                lat=lat, lng=lng, q0=q0_norm, q1=q1_norm, radius_km=10.0, limit=5
            )
            for i, p in enumerate(emergency):
                top_places.append(
                    {
                        "id": f"emergency-{i}-{uuid.uuid4().hex[:8]}",
                        "name": p["name"],
                        "source": "EMERGENCY",
                        "category": "emergency_room",
                        "address": p["address"],
                        "lat": float(p["lat"] or lat),
                        "lng": float(p["lng"] or lng),
                        "distance_km": float(p["distance_km"]),
                        "open_status": p["open_status"],
                        "suitability_score": 1.0 - min(float(p["distance_km"]) / 20.0, 0.8),
                        "final_score": 1.0 - min(float(p["distance_km"]) / 20.0, 0.8),
                        "safe_mode_applied": False,
                    }
                )
        else:
            hospitals = await fetch_nearby_hospitals(
                lat=lat, lng=lng, q0=q0_norm, q1=q1_norm, radius_km=5.0, limit=20
            )
            ranked = sorted(
                hospitals,
                key=lambda p: (
                    0 if p["open_status"] == "OPEN" else 1,
                    float(p["distance_km"]),
                ),
            )[:5]
            for i, p in enumerate(ranked):
                base = 0.92 if p["open_status"] == "OPEN" else 0.75
                final = max(0.1, base - min(float(p["distance_km"]) / 20.0, 0.6))
                top_places.append(
                    {
                        "id": f"hospital-{i}-{uuid.uuid4().hex[:8]}",
                        "name": p["name"],
                        "source": "HOSPITAL",
                        "category": p["category"],
                        "address": p["address"],
                        "lat": float(p["lat"] or lat),
                        "lng": float(p["lng"] or lng),
                        "distance_km": float(p["distance_km"]),
                        "open_status": p["open_status"],
                        "suitability_score": round(final, 3),
                        "final_score": round(final, 3),
                        "safe_mode_applied": False,
                    }
                )

    if not top_places:
        top_places = _fallback_places(triage_level)

    top_places = top_places[:5]
    for i, place in enumerate(top_places):
        place["rank_reason"] = _reason_for(i, place["open_status"])

    safe_mode = {
        "applied": triage_level == "RED" and len(top_places) == 0,
        "no_result": triage_level == "RED" and len(top_places) == 0,
    }
    assistant_message = (
        _try_generate_with_openai(transcript, triage_level, top_places)
        or _assistant_message(triage_level, top_places)
    )

    return {
        "turn_id": str(uuid.uuid4()),
        "transcript": transcript,
        "triage_level": triage_level,
        "top5_places": top_places,
        "tts_audio_url": None,
        "safe_mode_result": safe_mode,
        "assistant_message": assistant_message,
    }
