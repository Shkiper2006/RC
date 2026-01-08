from fastapi import APIRouter

router = APIRouter(prefix="/guilds", tags=["guilds"])


@router.get("/")
async def list_guilds() -> dict[str, list[dict[str, str]]]:
    return {"items": []}
