"""
General clinic/hospital lookup via data.go.kr OpenAPI.

Service   : 국립중앙의료원_전국 병·의원 찾기 서비스
Operation : getHsptlMdcncListInfoInqire
Cache     : (q0, q1) — 10 minutes in-memory
"""

import math
import time
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

import httpx

from app.core.config import settings

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SEOUL_TZ  = ZoneInfo("Asia/Seoul")
BASE_URL  = (
    "http://apis.data.go.kr/B552657/HsptlAsembySearchService"
    "/getHsptlMdcncListInfoInqire"
)
CACHE_TTL = 600  # 10 minutes

# 종별구분명 → internal category used by the ranking engine
_DIV_TO_CATEGORY: dict[str, str] = {
    "의원":       "clinic",
    "병원":       "hospital",
    "종합병원":   "hospital",
    "상급종합병원": "hospital",
    "요양병원":   "hospital",
    "치과병원":   "clinic",
    "한방병원":   "hospital",
    "치과의원":   "clinic",
    "한의원":     "clinic",
}

# weekday() → 0=Mon … 6=Sun — identical mapping across all three services
DAY_FIELDS: dict[int, tuple[str, str]] = {
    0: ("dutyTime1s", "dutyTime1c"),
    1: ("dutyTime2s", "dutyTime2c"),
    2: ("dutyTime3s", "dutyTime3c"),
    3: ("dutyTime4s", "dutyTime4c"),
    4: ("dutyTime5s", "dutyTime5c"),
    5: ("dutyTime6s", "dutyTime6c"),
    6: ("dutyTime7s", "dutyTime7c"),
}

# ---------------------------------------------------------------------------
# In-memory cache
# ---------------------------------------------------------------------------

_cache:    dict[tuple, list[dict]] = {}
_cache_ts: dict[tuple, float]      = {}


def _cache_get(key: tuple) -> Optional[list[dict]]:
    if key in _cache and (time.monotonic() - _cache_ts[key]) < CACHE_TTL:
        return _cache[key]
    return None


def _cache_set(key: tuple, value: list[dict]) -> None:
    _cache[key] = value
    _cache_ts[key] = time.monotonic()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _parse_hhmm(raw: Optional[str]) -> Optional[int]:
    if not raw:
        return None
    cleaned = raw.strip()
    return int(cleaned) if cleaned.isdigit() else None


def _hhmm_to_display(raw: Optional[str]) -> Optional[str]:
    if raw and len(raw) == 4 and raw.isdigit():
        return f"{raw[:2]}:{raw[2:]}"
    return None


def _compute_open_status(
    item: dict,
    now_hhmm: int,
    day_idx: int,
) -> tuple[str, Optional[str]]:
    """
    General hospitals have no dutyEryn flag — compute from weekday duty hours only.
    """
    start_key, close_key = DAY_FIELDS.get(day_idx, DAY_FIELDS[0])
    start = _parse_hhmm(item.get(start_key))
    close = _parse_hhmm(item.get(close_key))

    if start is None or close is None:
        return "UNKNOWN", None

    if start <= now_hhmm <= close:
        return "OPEN", _hhmm_to_display(item.get(close_key))

    return "CLOSED", None


# ---------------------------------------------------------------------------
# API fetch
# ---------------------------------------------------------------------------

async def _fetch_list(q0: str, q1: str) -> list[dict]:
    cache_key = (q0.strip(), q1.strip())
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    params: dict = {
        "serviceKey": settings.DATA_GO_KR_SERVICE_KEY,
        "Q0":         q0,
        "pageNo":     1,
        "numOfRows":  100,
        "_type":      "json",
    }
    if q1:
        params["Q1"] = q1

    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.get(BASE_URL, params=params)
        resp.raise_for_status()

    data = resp.json()

    raw = (
        data.get("response", {})
            .get("body", {})
            .get("items") or {}
    )
    item_data = raw.get("item", []) if isinstance(raw, dict) else []

    if isinstance(item_data, dict):
        item_data = [item_data]
    if not isinstance(item_data, list):
        item_data = []

    _cache_set(cache_key, item_data)
    return item_data


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

async def fetch_nearby_hospitals(
    lat:       float,
    lng:       float,
    q0:        str,
    q1:        str,
    radius_km: float = 5.0,
    limit:     int   = 20,
) -> list[dict]:
    """
    Return general clinic/hospital candidates within radius_km of (lat, lng),
    sorted by distance, capped at limit.

    Each result dict contains:
      name, address, phone, lat, lng, distance_km,
      category, duty_div_name, open_status, open_until, source
    """
    seoul_now = datetime.now(SEOUL_TZ)
    now_hhmm  = int(seoul_now.strftime("%H%M"))
    day_idx   = seoul_now.weekday()

    try:
        items = await _fetch_list(q0, q1)
    except Exception:
        return []

    results: list[dict] = []

    for item in items:
        try:
            place_lat = float(item.get("wgs84Lat") or 0)
            place_lng = float(item.get("wgs84Lon") or 0)
        except (TypeError, ValueError):
            place_lat, place_lng = 0.0, 0.0

        has_coords = place_lat != 0.0 or place_lng != 0.0

        if has_coords:
            distance_km = _haversine(lat, lng, place_lat, place_lng)
            if distance_km > radius_km:
                continue
        else:
            distance_km = radius_km  # rank last

        duty_div_name = (item.get("dutyDivNam") or "").strip()
        category      = _DIV_TO_CATEGORY.get(duty_div_name, "hospital")

        status, open_until = _compute_open_status(item, now_hhmm, day_idx)

        results.append({
            "name":          (item.get("dutyName") or "").strip(),
            "address":       (item.get("dutyAddr") or "").strip(),
            "phone":         (item.get("dutyTel1") or "").strip() or None,
            "lat":           place_lat if has_coords else None,
            "lng":           place_lng if has_coords else None,
            "distance_km":   round(distance_km, 3),
            "category":      category,
            "duty_div_name": duty_div_name,
            "open_status":   status,
            "open_until":    open_until,
            "source":        "data.go.kr",
        })

    results.sort(key=lambda r: r["distance_km"])
    return results[:limit]
