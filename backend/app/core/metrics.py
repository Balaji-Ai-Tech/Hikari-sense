from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

REQUEST_COUNT = Counter("hikari_request_count", "HTTP requests", ["method", "path", "status"])
REQUEST_LATENCY = Histogram("hikari_request_latency_seconds", "HTTP latency", ["method", "path"])
ERROR_COUNT = Counter("hikari_error_count", "Unhandled errors", ["code"])
EVENTS_PROCESSED = Counter("hikari_events_processed", "Events processed")
REPORTS_PROCESSED = Counter("hikari_reports_processed", "Reports processed")
KAFKA_CONSUMER_LAG = Histogram("hikari_kafka_consumer_lag", "Kafka consumer lag")
DLQ_COUNT = Counter("hikari_dlq_count", "Dead-letter messages", ["topic"])
VERIFICATION_LATENCY = Histogram("hikari_verification_latency_seconds", "Verification scoring time")
AI_LATENCY = Histogram("hikari_ai_latency_seconds", "Classifier latency")
NOTIFICATION_COUNT = Counter("hikari_notification_count", "Notifications created", ["type"])
CONNECTOR_SUCCESS = Counter("hikari_connector_success", "Connector successes", ["connector"])
CONNECTOR_FAILURE = Counter("hikari_connector_failure", "Connector failures", ["connector"])


def metrics_payload() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
