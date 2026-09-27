from fastapi import APIRouter

from app.api.v1 import chat, documents, search

api_router = APIRouter()
api_router.include_router(documents.router)
api_router.include_router(search.router)
api_router.include_router(chat.router)

__all__ = ["api_router"]
