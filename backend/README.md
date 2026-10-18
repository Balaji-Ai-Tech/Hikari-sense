# HIKARI SENSE backend — PS 26069

National Weather Big Data Analytics Platform for Smart India Hackathon **PS 26069**
(Ministry of Earth Sciences / India Meteorological Department, Disaster Management).
Team: **The WIND BREAKERS**.

This is not PS 26071. All backend metadata, OpenAPI info, and demo labels use **PS 26069**.

## Architecture (blueprint)

```
Connectors → Kafka → Python processing (Flink later) → NLP/Vision interfaces
  → Dedup / event clustering → Verification → PostgreSQL + PostGIS
  → FastAPI + WebSocket → existing HIKARI SENSE frontend
```

Redis (cache, rate limit, WS fanout), MinIO (media), Prometheus/Grafana, MLflow (when real models exist).

Milestone 1 ships a **working pipeline**: canonical envelope, connectors, Kafka topics, PostgreSQL, rules-based classification, geoparsing, dedup, clustering, verification scoring. Apache Flink is the scale-out path and is not required to run the application.

The classifier is a **rules baseline**, not an ML model. AI output is labelled:

`SUGGESTION ONLY — HUMAN REVIEWER MAKES THE FINAL DECISION.`

Synthetic seed data is never official government data. IMD/SACHET connectors stay `NOT_CONFIGURED` until official URLs exist. Social ingestion is sample/licensed only — no X/Twitter scraping.

## Local development

```bash
cd backend
docker compose up -d postgres redis kafka minio
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
python scripts/seed_demo.py
uvicorn app.main:app --reload --port 8000
```

Or the full stack:

```bash
docker compose up -d
```

Optional observability profile: `docker compose --profile observability up -d`

OpenAPI: http://localhost:8000/docs  
Health: http://localhost:8000/health  
Readiness: http://localhost:8000/ready  
Metrics: http://localhost:8000/metrics

Dev JWT (development/test only):

```bash
curl -X POST http://localhost:8000/api/v1/auth/dev-login -H "Content-Type: application/json" -d "{\"username\":\"analyst.demo\",\"role\":\"analyst\"}"
```

## Frontend connection

Set in the app `.env.local`:

```
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/api/v1/stream/events
```

In development, the event list, event details, and citizen report form use the backend REST API. Modules without backend contracts remain explicitly demo-backed.

### Gemini public-data summary

The dashboard's on-demand `POST /api/v1/ai/analyze` endpoint summarizes only persisted Open-Meteo current observations and active public SACHET alerts. Citizen reports and media are not sent to Gemini. The response includes source timestamps, freshness, limitations, precautions, and an advisory-only label. It does not verify incidents or change report/event status.

Set `GEMINI_API_KEY` in this backend's private `.env` for local use, and set `GEMINI_MODEL=gemini-3.5-flash-lite`. Never put the key in frontend variables, browser storage, or source control. Confirm model availability and the account's current limits in AI Studio; quota/model errors are returned explicitly without falling back to another model. The free tier may use submitted content to improve Google products, so only public weather and official alert data are sent.

The frontend map uses MapLibre GL JS with OpenStreetMap raster tiles. No Google Maps key or backend map credential is required; keep OpenStreetMap attribution visible when changing tile providers.

## External data sources

### Open-Meteo

The configured connector calls the documented Forecast API at `https://api.open-meteo.com/v1/forecast` for current conditions. Defaults target Hyderabad; set `OPEN_METEO_LATITUDE`, `OPEN_METEO_LONGITUDE`, and `OPEN_METEO_LOCATION_NAME` to change the location. The connector validates returned coordinates, numeric fields, and timestamps, and builds a stable idempotency key from returned grid coordinates and observation time.

The ingestion worker publishes canonical envelopes to `weather.raw` and normalized source data to `observations.normalized`. The processing worker stores model-derived readings in PostgreSQL `official_observations`. Ordinary weather remains an observation and does not create a disaster event. Severe WMO codes may enter the existing classification and human-review pipeline; Open-Meteo does not independently verify an event.

The free API needs no key for non-commercial use and is limited to 10,000 calls/day, 5,000/hour, and 600/minute. It has no uptime guarantee, and free-tier commercial use is not permitted. Data attribution under CC BY 4.0 is required. Commercial use requires a subscription and the customer endpoint. See the [Forecast API docs](https://open-meteo.com/en/docs), [terms](https://open-meteo.com/en/terms), [pricing](https://open-meteo.com/en/pricing), and [licence](https://open-meteo.com/en/licence).

### SACHET / NDMA

The configured all-India feed is `https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml`; the official SACHET site also publishes per-state RSS feeds. The feed is publicly readable RSS 2.0, links CAP XML 1.2 alerts and optional polygon XML, and requires no key in the observed requests. The feed declares its contents public domain. No request quota or service-level guarantee was published in the linked feed guide; this worker polls every 900 seconds and fetches at most eight recent CAP records each cycle.

The connector accepts only public, actual, unexpired CAP `Alert` messages. CAP `Update` and `Cancel` messages are deliberately skipped until event lifecycle correction is implemented. CAP identifiers provide idempotency; official polygon centroids supply map coordinates when available. Current records route to `alerts.raw`, then through the existing processing and human-review pipeline. See the [SACHET portal](https://sachet.ndma.gov.in/CapFeed) and its [RSS guide](https://sachet.ndma.gov.in/docs/Integration_Guide_For_Agencies.pdf).

### IMD

The official [IMD MAUSAM site](https://mausam.imd.gov.in/) links a CAP RSS feed at `https://cap-sources.s3.amazonaws.com/in-imd-en/rss.xml`. It is publicly readable RSS with links to CAP XML and needs no key in the observed request. The sampled feed's latest record was dated 2026-09-27, so it was stale on 2026-10-03; standalone IMD live ingestion is classified `NOT_SUITABLE_YET`. Its linked [API document](https://mausam.imd.gov.in/Forecast/marquee_data/API_doc.pdf) could not be extracted for endpoint, quota, or license terms, so no additional API contract is assumed.

### NASA FIRMS

The official [FIRMS Area API](https://firms.modaps.eosdis.nasa.gov/api/area/) provides global CSV data using `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_NOAA21_NRT/world/1`. A MAP key is required; none is configured, so the connector remains disabled and has not been smoke-tested. The API supports `world` or bounding-box geography and 1-5 day ranges. NASA describes global near-real-time detections as generally available within three hours. The API page does not publish a numeric rate limit. NASA requests appropriate data acknowledgement; see its [LANCE acknowledgement and disclaimer](https://www.earthdata.nasa.gov/data/projects/lance#ed-firms-citation). Status: `AUTHENTICATION_REQUIRED`.

To enable the existing FIRMS adapter after obtaining a key, set `FIRMS_MAP_KEY` in `backend/.env` and set `INGESTION_CONNECTORS=SRC-OPEN-METEO,SRC-SACHET,SRC-FIRMS`. The default selection excludes FIRMS.

## Tests

```bash
cd backend
pytest
```

## Kafka topics

Canonical HIKARI MVP stream topics:

`weather.raw` `alerts.raw` `citizen.raw` `satellite.raw` `observations.normalized` `events.detected` `events.verified`

Backwards-compatible legacy topics remain enabled for the current pipeline:

`raw.social` `raw.news` `raw.citizen` `raw.official` `raw.gridded` `clean.reports` `events.candidate` `alerts.out` plus matching `dlq.*` topics.

Docker Compose runtime verification was performed against PostgreSQL/PostGIS. Latest validation: 42 backend tests passed, 4 processing-flow tests passed, 2 frontend tests passed, frontend lint had no errors, TypeScript passed, and the production build passed. The real Open-Meteo readings were benign and remain observations. Seven real SACHET CAP flood alerts traversed `alerts.raw`, the existing worker and review pipeline, PostgreSQL, and `GET /api/v1/events`; they remain `needs_review`. The live Events page displays those API records and coordinates. The browser map uses MapLibre with OpenStreetMap tiles and displays live event coordinates.
