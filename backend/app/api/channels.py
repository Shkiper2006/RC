from fastapi import APIRouter

router = APIRouter(prefix="/channels", tags=["channels"])


@router.get("/")
async def list_channels() -> dict[str, list[dict[str, str]]]:
    return {"items": []}
