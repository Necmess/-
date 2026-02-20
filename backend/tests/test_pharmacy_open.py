"""
Pharmacy open-status service tests.

Unit tests run without any API key or network access.
The integration block at the bottom requires DATAGOKR_API_KEY in .env.

Run unit tests:
    pytest backend/tests/test_pharmacy_open.py -v

Run integration test manually:
    python backend/tests/test_pharmacy_open.py
"""

import asyncio
import os
import sys

# Allow running from repo root: python backend/tests/test_pharmacy_open.py
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.open_status_pharmacy import (
    _normalize,
    _parse_hhmm,
    _hhmm_to_display,
    _is_open,
    get_open_status,
    DAY_FIELDS,
)


# ---------------------------------------------------------------------------
# _normalize
# ---------------------------------------------------------------------------

def test_normalize_strips_spaces():
    assert _normalize("온누리 약국") == "온누리약국"

def test_normalize_strips_ascii_punctuation():
    assert _normalize("이마트(종로점)") == "이마트종로점"
    assert _normalize("서울-중앙약국") == "서울중앙약국"
    assert _normalize("약국.com") == "약국com"

def test_normalize_strips_fullwidth_and_special():
    assert _normalize("서울·중앙약국") == "서울중앙약국"   # middle dot U+00B7
    assert _normalize("종로（5가）약국") == "종로5가약국"   # fullwidth parens
    assert _normalize("★우리약국★")   == "우리약국"

def test_normalize_keeps_alphanumeric():
    assert _normalize("24시약국abc") == "24시약국abc"

def test_normalize_empty():
    assert _normalize("") == ""


# ---------------------------------------------------------------------------
# _parse_hhmm
# ---------------------------------------------------------------------------

def test_parse_hhmm_valid():
    assert _parse_hhmm("0900") == 900
    assert _parse_hhmm("2100") == 2100
    assert _parse_hhmm("0000") == 0
    assert _parse_hhmm("2359") == 2359

def test_parse_hhmm_invalid():
    assert _parse_hhmm(None)   is None
    assert _parse_hhmm("")     is None
    assert _parse_hhmm("  ")   is None
    assert _parse_hhmm("abc")  is None
    assert _parse_hhmm("09:00") is None   # colon-separated, not HHMM


# ---------------------------------------------------------------------------
# _hhmm_to_display
# ---------------------------------------------------------------------------

def test_hhmm_to_display():
    assert _hhmm_to_display("2100") == "21:00"
    assert _hhmm_to_display("0900") == "09:00"
    assert _hhmm_to_display(None)   is None
    assert _hhmm_to_display("900")  is None   # not 4 digits
    assert _hhmm_to_display("abc4") is None   # not digits


# ---------------------------------------------------------------------------
# _is_open  (all tests use day_idx=0 = Monday = dutyTime1s/1c)
# ---------------------------------------------------------------------------

def _item(start: str | None, close: str | None) -> dict:
    return {"dutyTime1s": start, "dutyTime1c": close}

def test_is_open_within_hours():
    status, until = _is_open(_item("0900", "2100"), now_hhmm=1430, day_idx=0)
    assert status == "OPEN"
    assert until  == "21:00"

def test_is_open_at_boundary_start():
    status, _ = _is_open(_item("0900", "2100"), now_hhmm=900, day_idx=0)
    assert status == "OPEN"

def test_is_open_at_boundary_close():
    status, until = _is_open(_item("0900", "2100"), now_hhmm=2100, day_idx=0)
    assert status == "OPEN"   # spec: start <= now <= close
    assert until  == "21:00"

def test_is_open_before_open():
    status, _ = _is_open(_item("0900", "2100"), now_hhmm=830, day_idx=0)
    assert status == "CLOSED"

def test_is_open_after_close():
    status, _ = _is_open(_item("0900", "2100"), now_hhmm=2101, day_idx=0)
    assert status == "CLOSED"

def test_is_open_missing_start():
    status, _ = _is_open(_item(None, "2100"), now_hhmm=1200, day_idx=0)
    assert status == "UNKNOWN"

def test_is_open_missing_close():
    status, _ = _is_open(_item("0900", None), now_hhmm=1200, day_idx=0)
    assert status == "UNKNOWN"

def test_is_open_missing_both():
    status, _ = _is_open(_item(None, None), now_hhmm=1200, day_idx=0)
    assert status == "UNKNOWN"

def test_is_open_correct_day_fields():
    """_is_open must use the correct day's fields, not always dutyTime1s."""
    item = {
        "dutyTime1s": "0900", "dutyTime1c": "2100",  # Monday — OPEN
        "dutyTime6s": "1000", "dutyTime6c": "1400",  # Saturday — OPEN until 14:00
    }
    # Saturday = day_idx 5
    status, until = _is_open(item, now_hhmm=1300, day_idx=5)
    assert status == "OPEN"
    assert until  == "14:00"

    # Same time on Saturday, but after close
    status, _ = _is_open(item, now_hhmm=1500, day_idx=5)
    assert status == "CLOSED"


# ---------------------------------------------------------------------------
# get_open_status — unit-level (no network)
# ---------------------------------------------------------------------------

async def _mock_fetch(q0, q1, q1_fallback=None):
    """Return a canned list simulating a data.go.kr response."""
    return [
        {
            "dutyName":    "온누리약국종로점",
            "dutyTime1s":  "0900", "dutyTime1c": "2100",
            "dutyTime6s":  "0900", "dutyTime6c": "1400",
            "dutyTime7s":  None,   "dutyTime7c": None,
        },
        {
            "dutyName":    "종로중앙약국",
            "dutyTime1s":  "0800", "dutyTime1c": "2200",
            "dutyTime6s":  "0900", "dutyTime6c": "1800",
            "dutyTime7s":  "1000", "dutyTime7c": "1600",
        },
    ]


async def test_get_open_status_found(monkeypatch=None):
    """Name match + correct status; uses a monkey-patched fetch."""
    import app.services.open_status_pharmacy as svc

    original = svc._fetch_list_with_fallback
    svc._fetch_list_with_fallback = _mock_fetch

    try:
        # Monday 14:30
        results = await get_open_status(
            q0="서울특별시", q1="종로구",
            names=["온누리약국 종로점", "종로 중앙약국", "없는약국"],
            now_hhmm=1430,
        )
    finally:
        svc._fetch_list_with_fallback = original

    by_name = {r["name"]: r for r in results}

    assert by_name["온누리약국 종로점"]["is_open"]    == "OPEN"
    assert by_name["온누리약국 종로점"]["open_until"] == "21:00"
    assert by_name["온누리약국 종로점"]["source"]     == "api"

    assert by_name["종로 중앙약국"]["is_open"]        == "OPEN"
    assert by_name["없는약국"]["is_open"]             == "UNKNOWN"
    assert by_name["없는약국"]["source"]              == "no_match"


async def test_get_open_status_api_error(monkeypatch=None):
    """Any fetch exception → all names return UNKNOWN with source api_error."""
    import app.services.open_status_pharmacy as svc

    async def _fail(*_a, **_kw):
        raise RuntimeError("network error")

    original = svc._fetch_list_with_fallback
    svc._fetch_list_with_fallback = _fail

    try:
        results = await get_open_status(
            q0="서울특별시", q1="종로구",
            names=["약국A", "약국B"],
            now_hhmm=1200,
        )
    finally:
        svc._fetch_list_with_fallback = original

    assert all(r["is_open"] == "UNKNOWN" for r in results)
    assert all(r["source"]  == "api_error" for r in results)


# ---------------------------------------------------------------------------
# Integration entry point (requires DATAGOKR_API_KEY)
# ---------------------------------------------------------------------------

async def _run_integration():
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

    key = os.getenv("DATA_GO_KR_SERVICE_KEY") or os.getenv("DATAGOKR_API_KEY", "")
    if not key:
        print("⚠  DATA_GO_KR_SERVICE_KEY not set — skipping integration test")
        return

    print("\n=== Integration test: 서울특별시 종로구 ===")
    results = await get_open_status(
        q0="서울특별시",
        q1="종로구",
        names=["온누리약국 종로점", "종로약국", "없는약국"],
        now_hhmm=None,        # use Seoul current time
    )
    for r in results:
        marker = "✓" if r["is_open"] == "OPEN" else "✗"
        print(f"  {marker} {r['name']}: {r['is_open']}"
              f"  until={r['open_until']}  source={r['source']}")


if __name__ == "__main__":
    import pytest

    # Run sync unit tests via pytest
    print("=== Unit tests ===")
    exit_code = pytest.main([__file__, "-v", "--tb=short", "-k", "not integration"])

    # Run async unit tests manually
    print("\n=== Async unit tests ===")
    asyncio.run(test_get_open_status_found())
    print("✓ get_open_status_found")
    asyncio.run(test_get_open_status_api_error())
    print("✓ get_open_status_api_error")

    # Integration (needs key)
    asyncio.run(_run_integration())

    sys.exit(exit_code)
