import os
from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8080",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "staging", "production", "test"] = "development"
    database_url: str = Field(
        default_factory=lambda: os.getenv(
            "DATABASE_URL", "postgresql+psycopg://hikari:hikari@localhost:5432/hikari"
        )
    )
    redis_url: str = "redis://localhost:6379/0"
    kafka_bootstrap_servers: str = "localhost:9092"

    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "media"
    minio_secure: bool = False
    s3_endpoint: str = ""
    s3_bucket: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""

    jwt_secret: str = "change-me-dev-only"
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "hikari-sense"
    jwt_audience: str = "hikari-sense-api"
    jwt_jwks_url: str = ""
    jwt_expire_minutes: int = 480

    youtube_api_key: str = ""
    ai_provider: str = "disabled"
    ai_provider_base_url: str = ""
    ai_provider_api_key: str = ""
    ai_provider_model: str = "gpt-4o-mini"
    ai_provider_timeout_seconds: int = 20
    ai_provider_max_retries: int = 2
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_timeout_seconds: int = Field(default=20, ge=3, le=60)
    ai_summary_max_request_bytes: int = Field(default=1024, ge=128, le=4096)
    open_meteo_base_url: str = "https://api.open-meteo.com/v1"
    open_meteo_latitude: float = Field(default=17.385, ge=-90, le=90)
    open_meteo_longitude: float = Field(default=78.4867, ge=-180, le=180)
    open_meteo_location_name: str = "Hyderabad"
    sachet_feed_url: str = "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml"
    imd_base_url: str = ""
    sachet_base_url: str = ""
    firms_map_key: str = ""
    mlflow_tracking_uri: str = ""

    prometheus_enabled: bool = True
    cors_origins: str = ""

    dedup_window_hours: int = 24
    near_dup_cosine: float = 0.88
    near_dup_jaccard: float = 0.80
    phash_hamming_max: int = 8
    cluster_radius_km: float = 10.0
    cluster_window_hours: float = 3.0
    h3_resolution: int = 7
    official_corroboration_boost: float = 0.10
    recycled_image_score_cap: float = 0.40
    auto_verify_threshold: float = 0.75
    needs_review_threshold: float = 0.45

    kafka_topic_raw_social: str = "raw.social"
    kafka_topic_raw_news: str = "raw.news"
    kafka_topic_raw_citizen: str = "raw.citizen"
    kafka_topic_raw_official: str = "raw.official"
    kafka_topic_raw_gridded: str = "raw.gridded"
    kafka_topic_weather_raw: str = "weather.raw"
    kafka_topic_alerts_raw: str = "alerts.raw"
    kafka_topic_citizen_raw: str = "citizen.raw"
    kafka_topic_satellite_raw: str = "satellite.raw"
    kafka_topic_observations_normalized: str = "observations.normalized"
    kafka_topic_clean_reports: str = "clean.reports"
    kafka_topic_events_candidate: str = "events.candidate"
    kafka_topic_events_detected: str = "events.detected"
    kafka_topic_events_verified: str = "events.verified"
    kafka_topic_alerts_out: str = "alerts.out"
    kafka_topic_dlq_social: str = "dlq.social"
    kafka_topic_dlq_news: str = "dlq.news"
    kafka_topic_dlq_citizen: str = "dlq.citizen"
    kafka_topic_dlq_processing: str = "dlq.processing"
    kafka_topic_dlq_verification: str = "dlq.verification"

    max_upload_bytes: int = 25 * 1024 * 1024
    max_upload_files: int = 6
    citizen_rate_limit_per_min: int = 10
    ws_channel: str = "hikari.events"

    @property
    def cors_origin_list(self) -> list[str]:
        configured = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        if self.environment in {"development", "test"}:
            return list(dict.fromkeys([*configured, *DEFAULT_CORS_ORIGINS]))
        if self.environment == "production":
            return [
                origin
                for origin in configured
                if origin.startswith("https://")
                and "*" not in origin
                and "localhost" not in origin
                and "127.0.0.1" not in origin
            ]
        return configured

    @property
    def is_dev(self) -> bool:
        return self.environment in {"development", "test"}

    @property
    def kafka_topics(self) -> list[str]:
        topics = [
            self.kafka_topic_raw_social,
            self.kafka_topic_raw_news,
            self.kafka_topic_raw_citizen,
            self.kafka_topic_raw_official,
            self.kafka_topic_raw_gridded,
            self.kafka_topic_weather_raw,
            self.kafka_topic_alerts_raw,
            self.kafka_topic_citizen_raw,
            self.kafka_topic_satellite_raw,
            self.kafka_topic_observations_normalized,
            self.kafka_topic_clean_reports,
            self.kafka_topic_events_candidate,
            self.kafka_topic_events_detected,
            self.kafka_topic_events_verified,
            self.kafka_topic_alerts_out,
            self.kafka_topic_dlq_social,
            self.kafka_topic_dlq_news,
            self.kafka_topic_dlq_citizen,
            self.kafka_topic_dlq_processing,
            self.kafka_topic_dlq_verification,
        ]
        return list(dict.fromkeys(topics))


@lru_cache
def get_settings() -> Settings:
    return Settings()
