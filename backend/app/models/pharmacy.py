from pydantic import BaseModel
from typing import Optional


class PharmacyOpenStatusItem(BaseModel):
    name:       str
    is_open:    str            # "OPEN" | "CLOSED" | "UNKNOWN"
    open_until: Optional[str]  # "HH:MM" if OPEN and available, else null
    source:     str            # "api" | "no_match" | "api_error" | "missing_time"


class PharmacyOpenStatusResponse(BaseModel):
    results: list[PharmacyOpenStatusItem]
