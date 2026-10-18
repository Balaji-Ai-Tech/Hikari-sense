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

### Isolated local ingestion worker

The local in-memory pipeline runs ingestion and processing in one supervised process. In PowerShell, set `TEST_DATABASE_URL`, `HIKARI_TEST_DATABASE_DISPOSABLE=1`, and the approved `HIKARI_TEST_DATABASE_SYSTEM_IDENTIFIER` for the isolated local test cluster, then run:

```powershell
.\scripts\run_local_pipeline.ps1
```

The script verifies the database cluster before setting `DATABASE_URL`, and defaults to Open-Meteo and SACHET every 900 seconds. Keep this terminal open to keep polling. Press Ctrl+C for a graceful shutdown. Loop failures are logged and retried; the worker does not install a machine-wide service or connect to Kafka.

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

## Live AI summary MVP deployment

The dashboard's on-demand `POST /api/v1/ai/analyze` endpoint reads only persisted Open-Meteo current observations and active public SACHET alerts. It does not accept prompts, URLs, citizen reports, private media, or arbitrary data sources. Responses include per-source timestamps, freshness, limitations, and an advisory-only label. Gemini never verifies incidents or changes report/event status.

### Render backend

Create a Web Service for this repository with **Root Directory** `backend`, **Build Command** `pip install -r requirements.txt`, and **Start Command** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Use Python 3.12 or newer. Configure a separate persistent PostgreSQL service and set `DATABASE_URL` to its connection string; do not rely on the Web Service filesystem for database or media persistence. Apply the existing migrations with `alembic upgrade head` before serving production traffic.

Set these Render environment variables:

| Variable | Value |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | Persistent PostgreSQL connection string from Render; plain `postgresql://` URLs are normalized to the installed psycopg v3 driver |
| `JWT_SECRET` | Random secret, or configure `JWT_JWKS_URL` for OIDC |
| `GEMINI_API_KEY` | Secret from Google AI Studio; never set in Vercel |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` (change only after checking access in AI Studio) |
| `GEMINI_TIMEOUT_SECONDS` | `20` |
| `CORS_ORIGINS` | Exact Vercel HTTPS origin, e.g. `https://your-project.vercel.app`; comma-separate an exact custom domain if used |
| `REDIS_URL` | Optional but recommended for shared rate limits across instances |

Production CORS accepts only explicitly configured HTTPS origins and excludes wildcard and localhost origins. Do not include a trailing path or `*` in an origin. Without Redis, rate limiting uses per-process memory and will not be shared across multiple instances.

### Vercel frontend

Import the existing frontend repository with the repository root as **Root Directory**. Use `npm run build` as the build command and leave **Output Directory** unset so the TanStack Start Nitro adapter controls it. In the Vercel project's environment variables, set `NITRO_PRESET=vercel` to pin the Vercel server output and `VITE_API_BASE_URL` to the Render service's public HTTPS origin (for example, `https://your-api.onrender.com`). `VITE_WS_URL` is optional for this summary feature. Redeploy after changing Vite environment variables. Add the exact resulting `https://<deployment>.vercel.app` origin (and any custom frontend domain) to Render's `CORS_ORIGINS`.

### Free-tier and privacy limits

The Gemini model catalogue currently lists `gemini-3.5-flash-lite` as stable and its pricing page lists free input/output. Actual per-project limits and access are account-specific; confirm them in [AI Studio rate limits](https://aistudio.google.com/rate-limit) before enabling requests. A model access or quota error is shown explicitly; the backend never falls back to a different or paid model. The Gemini free tier may use submitted content to improve Google products, so this endpoint sends only public weather and public SACHET data. Render free services can sleep and are not suitable for continuous disaster monitoring. Vercel Hobby is intended for personal, non-commercial use; check its current terms before commercial operation.

No deployment was performed as part of this implementation. Before launch, test the Render `/health` endpoint, database migrations/readiness, a generated summary with fresh and stale data, an unavailable model, Gemini quota exhaustion, CORS from the actual Vercel domain, and rate limiting. Check the browser bundle and network requests to confirm the Gemini key is absent.

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
