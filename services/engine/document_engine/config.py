import os
from urllib.parse import quote

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_DEFAULT_MARKER = "change-me-in-production"


def _is_production_runtime() -> bool:
    return os.getenv("NODE_ENV") == "production" or os.getenv("APP_ENV") == "production"


def _allows_development_defaults() -> bool:
    return os.getenv("APP_ENV") == "development" or os.getenv("ALLOW_INSECURE_DEV_DEFAULTS") == "1"


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

    @model_validator(mode="after")
    def validate_production_config(self) -> "Settings":
        if not _is_production_runtime() or _allows_development_defaults():
            return self
        if self.database_url_override and INSECURE_DEFAULT_MARKER in self.database_url_override:
            raise ValueError("DATABASE_URL_uses_insecure_default")
        if self.database_url_override is None and os.getenv("POSTGRES_PASSWORD") is None:
            raise ValueError("POSTGRES_PASSWORD_required_in_production")
        if INSECURE_DEFAULT_MARKER in self.postgres_password.get_secret_value():
            raise ValueError("POSTGRES_PASSWORD_uses_insecure_default")
        if os.getenv("REDIS_URL") is None:
            raise ValueError("REDIS_URL_required_in_production")
        return self


settings = Settings()
