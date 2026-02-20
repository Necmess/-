from fastapi import APIRouter
from app.api import pharmacy, emergency, hospital, voice_turn

api_router = APIRouter()
api_router.include_router(pharmacy.router,  tags=["pharmacy"])
api_router.include_router(emergency.router, tags=["emergency"])
api_router.include_router(hospital.router,  tags=["hospital"])
api_router.include_router(voice_turn.router, tags=["voice-turn"])
