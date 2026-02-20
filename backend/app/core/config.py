import urllib.parse

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        populate_by_name=True,
    )

    # Primary name: DATA_GO_KR_SERVICE_KEY
    # Legacy alias:  DATAGOKR_API_KEY  (accepted for backward compatibility)
    # Either the percent-encoded or the decoded key is accepted; decoding is
    # applied automatically so copy-pasting from the data.go.kr console works.
    DATA_GO_KR_SERVICE_KEY: str = Field(
        default="",
        validation_alias=AliasChoices(
            "DATA_GO_KR_SERVICE_KEY",
            "DATAGOKR_API_KEY",
        ),
    )

    @field_validator("DATA_GO_KR_SERVICE_KEY", mode="before")
    @classmethod
    def decode_service_key(cls, v: object) -> object:
        """URL-decode the key when it was copied in percent-encoded form."""
        if isinstance(v, str) and "%" in v:
            return urllib.parse.unquote(v)
        return v

    # Place search
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    PLACES_CSV_PATH:  str   = "data/medical_places.csv"
    SEARCH_RADIUS_KM: float = 3.0

    # Ranking weights
    RANKING_W_DIST: float = 0.35
    RANKING_W_OPEN: float = 0.30
    RANKING_W_TRI:  float = 0.35

    # SAFE_MODE category lists
    SAFE_MODE_ALLOWED_CATEGORIES:  list[str] = [
        "emergency_room", "hospital", "trauma_center", "urgent_care"
    ]
    SAFE_MODE_EXCLUDED_CATEGORIES: list[str] = [
        "pharmacy", "convenience_store", "drugstore", "supermarket", "beauty_clinic"
    ]

    # External open-status API
    OPEN_STATUS_API_URL: str = ""


settings = Settings()
