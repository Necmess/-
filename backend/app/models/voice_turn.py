from pydantic import BaseModel, Field
from typing import Literal, Optional


TriageLevel = Literal["GREEN", "AMBER", "RED"]
OpenStatus = Literal["OPEN", "CLOSED", "UNKNOWN"]
PlaceSource = Literal["PHARMACY", "OTC_STORE", "HOSPITAL", "EMERGENCY"]


class VoiceTurnRequest(BaseModel):
    transcript: str = Field(..., min_length=1, description="Recognized symptom text")
    lat: Optional[float] = Field(default=None)
    lng: Optional[float] = Field(default=None)
    q0: Optional[str] = Field(default=None, description="시/도")
    q1: Optional[str] = Field(default=None, description="시/군/구")


class VoiceTurnPlace(BaseModel):
    id: str
    name: str
    source: PlaceSource
    category: str
    address: str
    lat: float
    lng: float
    distance_km: float
    open_status: OpenStatus
    suitability_score: float
    final_score: float
    safe_mode_applied: bool = False
    rank_reason: Optional[str] = None


class SafeModeResult(BaseModel):
    applied: bool
    no_result: bool


class VoiceTurnResponse(BaseModel):
    turn_id: str
    transcript: str
    triage_level: TriageLevel
    top5_places: list[VoiceTurnPlace]
    tts_audio_url: Optional[str] = None
    safe_mode_result: SafeModeResult
    assistant_message: str
