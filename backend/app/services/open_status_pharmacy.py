"""
Pharmacy open-status enrichment via data.go.kr OpenAPI 15000576.

Operation : getParmacyListInfoInqire
Cache     : (q0, q1, weekday) — 10 minutes in-memory
Matching  : normalised name contains-match (strips spaces + punctuation)
"""

import re
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
    "http://apis.data.go.kr/B552657/ErmctInsttInfoInqireService"
    "/getParmacyListInfoInqire"
)
CACHE_TTL = 600  # seconds — 10 minutes

# weekday() returns 0=Mon … 6=Sun; maps to API day-index 1-7
DAY_FIELDS: dict[int, tuple[str, str]] = {
    0: ("dutyTime1s", "dutyTime1c"),
    1: ("dutyTime2s", "dutyTime2c"),
    2: ("dutyTime3s", "dutyTime3c"),
    3: ("dutyTime4s", "dutyTime4c"),
    4: ("dutyTime5s", "dutyTime5c"),
    5: ("dutyTime6s", "dutyTime6c"),
    6: ("dutyTime7s", "dutyTime7c"),
}
HOLIDAY_FIELDS = ("dutyTime8s", "dutyTime8c")

# ---------------------------------------------------------------------------
# In-memory cache
# ---------------------------------------------------------------------------

_cache: dict[tuple, list[dict]] = {}
_cache_ts: dict[tuple, float]   = {}


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

def _normalize(name: str) -> str:
    """
    Keep only Hangul syllables, Hangul jamo, and ASCII alphanumeric.
    Strips spaces, all ASCII punctuation, fullwidth chars (（）·／…),
    middle dots, special symbols — anything that varies between the CSV
    name and the dutyName field in the API response.
    """
    return re.sub(
        r"[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318Fa-zA-Z0-9]",
        "",
        name,
    )


def _parse_hhmm(raw: Optional[str]) -> Optional[int]:
    """'0900' → 900, None / empty / non-numeric → None."""
    if not raw:
        return None
    cleaned = raw.strip()
    return int(cleaned) if cleaned.isdigit() else None


def _hhmm_to_display(raw: Optional[str]) -> Optional[str]:
    """'2100' → '21:00', None → None."""
    if raw and len(raw) == 4 and raw.isdigit():
        return f"{raw[:2]}:{raw[2:]}"
    return None


def _is_open(item: dict, now_hhmm: int, day_idx: int) -> tuple[str, Optional[str]]:
    """
    Returns (status, open_until).
    status: "OPEN" | "CLOSED" | "UNKNOWN"
    open_until: "HH:MM" string if OPEN and close time is known, else None
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
    """
    Fetch pharmacy list for (q0, q1) from data.go.kr.
    Results are cached per (q0, q1, weekday).
    """
    day_idx   = datetime.now(SEOUL_TZ).weekday()
    cache_key = (q0.strip(), q1.strip(), day_idx)

    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    params = {
        "serviceKey": settings.DATA_GO_KR_SERVICE_KEY,
        "Q0":         q0,
        "Q1":         q1,
        "pageNo":     1,
        "numOfRows":  100,
        "_type":      "json",
    }

    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.get(BASE_URL, params=params)
        resp.raise_for_status()

    data = resp.json()

    # data.go.kr edge cases:
    #   items == ""      → no results (empty string, not dict/list)
    #   items == None    → no results
    #   items["item"] == {}  → single result returned as dict, not list
    raw = (
        data.get("response", {})
            .get("body", {})
            .get("items") or {}
    )
    item_data = raw.get("item", []) if isinstance(raw, dict) else []

    if isinstance(item_data, dict):   # single result edge case
        item_data = [item_data]
    if not isinstance(item_data, list):
        item_data = []

    items = item_data

    _cache_set(cache_key, items)
    return items


async def _fetch_list_with_fallback(
    q0: str,
    q1: str,
    q1_fallback: Optional[str],
) -> list[dict]:
    """
    Try primary (q0, q1). If the result is empty and q1_fallback is provided,
    retry with (q0, q1_fallback). Each attempt is independently cached.
    """
    items = await _fetch_list(q0, q1)
    if not items and q1_fallback:
        items = await _fetch_list(q0, q1_fallback)
    return items


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

async def get_open_status(
    q0:          str,
    q1:          str,
    names:       list[str],
    now_hhmm:    Optional[int],
    *,
    use_holiday:  bool = False,
    q1_fallback:  Optional[str] = None,
) -> list[dict]:
    """
    For each name in `names`, look up the matching pharmacy in the data.go.kr
    list and determine open/closed status.

    Parameters
    ----------
    q0          : 시/도 (e.g. "서울특별시")
    q1          : 시/군/구 (e.g. "종로구")
    names       : pharmacy display names from the CSV / caller
    now_hhmm    : current time as int HHMM (e.g. 1430); None → Seoul now
    use_holiday : if True, use dutyTime8s/8c instead of the weekday fields

    Returns
    -------
    list of dicts with keys: name, is_open, open_until, source
    """
    seoul_now = datetime.now(SEOUL_TZ)
    day_idx   = seoul_now.weekday()

    if now_hhmm is None:
        now_hhmm = int(seoul_now.strftime("%H%M"))

    # Attempt API fetch; on any error return UNKNOWN for all names
    try:
        items = await _fetch_list_with_fallback(q0, q1, q1_fallback)
    except Exception:
        return [
            {"name": n, "is_open": "UNKNOWN", "open_until": None, "source": "api_error"}
            for n in names
        ]

    results: list[dict] = []

    for name in names:
        norm_query = _normalize(name)

        # Contains-match: query ⊆ duty_name OR duty_name ⊆ query
        match = next(
            (
                item for item in items
                if (
                    norm_query in _normalize(item.get("dutyName", ""))
                    or _normalize(item.get("dutyName", "")) in norm_query
                )
            ),
            None,
        )

        if match is None:
            results.append({
                "name":       name,
                "is_open":    "UNKNOWN",
                "open_until": None,
                "source":     "no_match",
            })
            continue

        if use_holiday:
            start = _parse_hhmm(match.get(HOLIDAY_FIELDS[0]))
            close = _parse_hhmm(match.get(HOLIDAY_FIELDS[1]))
            if start is None or close is None:
                status, open_until = "UNKNOWN", None
            elif start <= now_hhmm <= close:
                status, open_until = "OPEN", _hhmm_to_display(match.get(HOLIDAY_FIELDS[1]))
            else:
                status, open_until = "CLOSED", None
        else:
            status, open_until = _is_open(match, now_hhmm, day_idx)

        results.append({
            "name":       name,
            "is_open":    status,
            "open_until": open_until,
            "source":     "data.go.kr",
        })

    return results
