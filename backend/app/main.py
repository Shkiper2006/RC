from fastapi import FastAPI

from app.api import auth, channels, guilds, messages

app = FastAPI()


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(guilds.router)
app.include_router(channels.router)
app.include_router(messages.router)
