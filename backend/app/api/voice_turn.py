from fastapi import APIRouter, HTTPException

from app.models.voice_turn import VoiceTurnRequest, VoiceTurnResponse
from app.services.voice_turn import run_voice_turn

router = APIRouter()


@router.post(
    "/voice-turn",
    response_model=VoiceTurnResponse,
    summary="텍스트(또는 STT 결과) 기반 음성턴 처리",
)
async def voice_turn(payload: VoiceTurnRequest):
    transcript = payload.transcript.strip()
    if not transcript:
        raise HTTPException(status_code=422, detail="transcript must not be empty")

    result = await run_voice_turn(
        transcript=transcript,
        lat=payload.lat,
        lng=payload.lng,
        q0=payload.q0,
        q1=payload.q1,
    )
    return result
