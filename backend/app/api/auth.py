from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
async def read_me() -> dict[str, str]:
    return {"status": "auth ok"}
