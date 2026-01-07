from fastapi import APIRouter

router = APIRouter(prefix="/messages", tags=["messages"])


@router.get("/")
async def list_messages() -> dict[str, list[dict[str, str]]]:
    return {"items": []}
