from urllib.parse import quote

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url_override: str | None = Field(default=None, alias="DATABASE_URL")
    postgres_host: str = Field(default="localhost", alias="POSTGRES_HOST")
    postgres_port: int = Field(default=5432, alias="POSTGRES_PORT")
    postgres_db: str = Field(default="document_intelligence", alias="POSTGRES_DB")
    postgres_user: str = Field(default="docintel", alias="POSTGRES_USER")
    postgres_password: SecretStr = Field(
        default=SecretStr("change-me-in-production"), alias="POSTGRES_PASSWORD"
    )
    redis_url: str = Field(default="redis://localhost:6379", alias="REDIS_URL")
    engine_port: int = Field(default=8000, alias="ENGINE_PORT")
    pending_message_idle_ms: int = Field(default=60000, alias="PENDING_MESSAGE_IDLE_MS")

    @property
    def database_url(self) -> str:
        if self.database_url_override:
            return self.database_url_override

        user = quote(self.postgres_user, safe="")
        password = quote(self.postgres_password.get_secret_value(), safe="")
        database = quote(self.postgres_db, safe="")
        return f"postgresql://{user}:{password}@{self.postgres_host}:{self.postgres_port}/{database}"


settings = Settings()
