from pydantic import BaseModel
from typing import Optional


class EmergencyPlace(BaseModel):
    name:             str
    address:          str
    phone:            Optional[str]   = None
    lat:              Optional[float] = None
    lng:              Optional[float] = None
    distance_km:      float
    institution_type: str
    notes:            Optional[str]   = None
    open_status:      str             # "OPEN" | "CLOSED" | "UNKNOWN"
    open_until:       Optional[str]   = None  # "HH:MM" if OPEN with known close
    source:           str             # "data.go.kr"


class EmergencyNearbyResponse(BaseModel):
    places: list[EmergencyPlace]
