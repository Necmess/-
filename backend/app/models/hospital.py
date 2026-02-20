from pydantic import BaseModel
from typing import Optional


class HospitalPlace(BaseModel):
    name:          str
    address:       str
    phone:         Optional[str]   = None
    lat:           Optional[float] = None
    lng:           Optional[float] = None
    distance_km:   float
    category:      str             # "clinic" | "hospital" — mapped from dutyDivNam
    duty_div_name: str             # raw 종별구분명 from API
    open_status:   str             # "OPEN" | "CLOSED" | "UNKNOWN"
    open_until:    Optional[str]   = None
    source:        str             # "data.go.kr"


class HospitalNearbyResponse(BaseModel):
    places: list[HospitalPlace]
