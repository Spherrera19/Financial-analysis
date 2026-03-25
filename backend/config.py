"""
Application configuration via pydantic-settings.

Values can be overridden by environment variables or a .env file.

Example override:
    CORS_ORIGINS='["http://localhost:3000", "https://prod.example.com"]'
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # Allow CORS_ORIGINS='["...", "..."]' as JSON string in env
        env_parse_none_str="",
    )


settings = Settings()
