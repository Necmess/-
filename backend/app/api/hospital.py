from fastapi import APIRouter, Query, HTTPException
from typing import Optional

from app.core.config import settings
from app.models.hospital import HospitalNearbyResponse
from app.services.hospital import fetch_nearby_hospitals

router = APIRouter()


@router.get(
    "/hospitals/nearby",
    response_model=HospitalNearbyResponse,
    summary="Nearby clinics/hospitals via data.go.kr 병·의원 찾기 서비스",
)
async def hospitals_nearby(
    lat:       float         = Query(...,  description="User latitude"),
    lng:       float         = Query(...,  description="User longitude"),
    q0:        str           = Query(...,  description="시/도 (e.g. 서울특별시)"),
    q1:        Optional[str] = Query(None, description="시/군/구 (e.g. 종로구); omit for province-wide"),
    radius_km: float         = Query(5.0,  description="Search radius in km (max 20)"),
    limit:     int           = Query(20,   description="Max results (max 50)"),
):
    if not settings.DATA_GO_KR_SERVICE_KEY:
        raise HTTPException(
            status_code=503,
            detail="DATA_GO_KR_SERVICE_KEY is not set. Add it to backend/.env.",
        )

    if not (0 < radius_km <= 20):
        raise HTTPException(status_code=422, detail="radius_km must be between 0 and 20")
    if not (1 <= limit <= 50):
        raise HTTPException(status_code=422, detail="limit must be between 1 and 50")

    places = await fetch_nearby_hospitals(
        lat=lat,
        lng=lng,
        q0=q0,
        q1=q1 or "",
        radius_km=radius_km,
        limit=limit,
    )

    return {"places": places}
