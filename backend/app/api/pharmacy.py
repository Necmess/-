from fastapi import APIRouter, Query, HTTPException
from typing import Optional

from app.models.pharmacy import PharmacyOpenStatusResponse
from app.services.open_status_pharmacy import get_open_status
from app.core.config import settings

router = APIRouter()


@router.get(
    "/pharmacy/open-status",
    response_model=PharmacyOpenStatusResponse,
    summary="Pharmacy open-status enrichment via data.go.kr 15000576",
)
async def pharmacy_open_status(
    q0:          str           = Query(...,  description="시/도  (e.g. 서울특별시)"),
    q1:          str           = Query(...,  description="시/군/구 primary (e.g. 성남시 분당구)"),
    names:       str           = Query(...,  description="Comma-separated pharmacy names"),
    q1_fallback: Optional[str] = Query(None, description="시 fallback used when primary q1 returns 0 items (e.g. 성남시)"),
    now:         Optional[str] = Query(None, description="Current time HHMM (e.g. 1430); defaults to Asia/Seoul now"),
    holiday:     bool          = Query(False, description="Use holiday hours (dutyTime8s/8c)"),
):
    if not settings.DATA_GO_KR_SERVICE_KEY:
        raise HTTPException(
            status_code=503,
            detail="DATA_GO_KR_SERVICE_KEY is not set. Add it to backend/.env.",
        )

    name_list = [n.strip() for n in names.split(",") if n.strip()]
    if not name_list:
        raise HTTPException(status_code=422, detail="names must not be empty")

    now_hhmm: Optional[int] = None
    if now:
        if not now.isdigit() or len(now) != 4:
            raise HTTPException(status_code=422, detail="now must be 4-digit HHMM string")
        now_hhmm = int(now)

    results = await get_open_status(
        q0=q0,
        q1=q1,
        names=name_list,
        now_hhmm=now_hhmm,
        use_holiday=holiday,
        q1_fallback=q1_fallback,
    )

    return {"results": results}
