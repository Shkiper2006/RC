from pydantic import BaseSettings


class Settings(BaseSettings):
    env: str = "development"
    db_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"
    jwt_secret: str = "change-me"

    class Config:
        env_prefix = "APP_"


settings = Settings()
