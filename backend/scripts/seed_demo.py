"""Synthetic DEMO seed for PS 26069. Never represent these rows as real government data."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import select

from app.core import database as database_module
from app.core.database import Base, SessionLocal
from app.core.security import ROLES
from app.models.alert import Alert
from app.models.event import Event
from app.models.model_version import ModelVersion
from app.models.official_observation import OfficialObservation
from app.models.report import Report
from app.models.source import Source, SourceHealth
from app.models.user import Role, User
from app.models.weather_observation import WeatherObservation
from app.services.pipeline import process_report
import app.models  # noqa: F401

DEMO_USERS = [
    ("00000000-0000-4000-8000-000000000001", "citizen.demo", "citizen"),
    ("00000000-0000-4000-8000-000000000002", "analyst.demo", "analyst"),
    ("00000000-0000-4000-8000-000000000003", "verifier.demo", "verifier"),
    ("00000000-0000-4000-8000-000000000004", "admin.demo", "admin"),
    ("00000000-0000-4000-8000-000000000005", "ml.demo", "ml_engineer"),
    ("00000000-0000-4000-8000-000000000006", "ops.demo", "system_operator"),
]

SOURCES = [
    ("SRC-CITIZEN", "Citizen reports", "Citizen", "citizen", "citizen", 0.45, True, "CONNECTED"),
    ("SRC-NEWS-RSS", "Public news RSS (not IMD)", "News/RSS", "external", "website", 0.62, False, "DEMO"),
    ("SRC-YOUTUBE", "YouTube Data API", "Social", "external", "social", 0.55, False, "DEMO"),
    ("SRC-IMD", "Official meteorological feeds", "IMD", "official", "api", 0.95, False, "NOT_CONFIGURED"),
    ("SRC-OPEN-METEO", "Open-Meteo", "Sensor", "scientific", "api", 0.80, False, "DEMO"),
    ("SRC-IMERG", "NASA IMERG", "Satellite", "scientific", "dataset", 0.88, False, "NOT_CONFIGURED"),
    ("SRC-FIRMS", "NASA FIRMS", "Satellite", "scientific", "dataset", 0.80, False, "NOT_CONFIGURED"),
    ("SRC-SOCIAL-SAMPLE", "Licensed/sample social dataset", "Social", "external", "social", 0.4, False, "DEMO"),
]

SEEDS = [
    ("Hyderabad", "Telangana", 17.385, 78.4867, "Water entered houses near Hitech City. Roads waterlogged.", "SRC-CITIZEN"),
    ("Hyderabad", "Telangana", 17.44, 78.39, "Knee-deep flooding at Madhapur underpass, buses diverted.", "SRC-NEWS-RSS"),
    ("Warangal", "Telangana", 17.9689, 79.5941, "Heavy rainfall overnight, drains overflowing in our colony.", "SRC-CITIZEN"),
    ("Chennai", "Tamil Nadu", 13.0827, 80.2707, "Lightning and thunderstorm for 30 minutes over the marina.", "SRC-YOUTUBE"),
    ("Chennai", "Tamil Nadu", 13.09, 80.28, "Dense fog reduced visibility on GST road this morning.", "SRC-CITIZEN"),
    ("Mumbai", "Maharashtra", 19.076, 72.8777, "Extreme heat, temperature very high, people fainting at the market.", "SRC-CITIZEN"),
    ("Pune", "Maharashtra", 18.5204, 73.8567, "Strong winds, a tree has fallen on the road near Shivajinagar.", "SRC-NEWS-RSS"),
    ("Nagpur", "Maharashtra", 21.1458, 79.0882, "Dust storm (andhi) reduced visibility this afternoon.", "SRC-SOCIAL-SAMPLE"),
    ("Jaipur", "Rajasthan", 26.9124, 75.7873, "Heatwave warning language in local bulletin — SYNTHETIC sample.", "SRC-OPEN-METEO"),
    ("Kolkata", "West Bengal", 22.5726, 88.3639, "Heavy rain and waterlogging in Salt Lake sector V.", "SRC-CITIZEN"),
    ("Bhubaneswar", "Odisha", 20.2961, 85.8245, "Cyclone watch language in sample dataset — not an official bulletin.", "SRC-NEWS-RSS"),
    ("Puri", "Odisha", 19.8135, 85.8312, "Strong wind and heavy rainfall along the coast.", "SRC-YOUTUBE"),
    ("Bengaluru", "Karnataka", 12.9716, 77.5946, "Waterlogging on Outer Ring Road after downpour.", "SRC-CITIZEN"),
    ("Ahmedabad", "Gujarat", 23.0225, 72.5714, "Temperature very high since morning, heat stroke risk language.", "SRC-CITIZEN"),
    ("Lucknow", "Uttar Pradesh", 26.8467, 80.9462, "Dense fog, flights delayed — synthetic citizen note.", "SRC-CITIZEN"),
    ("Patna", "Bihar", 25.5941, 85.1376, "Ganga-adjacent locality reports water entered houses.", "SRC-NEWS-RSS"),
    ("Guwahati", "Assam", 26.1445, 91.7362, "Thunderstorm and lightning over the city.", "SRC-SOCIAL-SAMPLE"),
    ("Thiruvananthapuram", "Kerala", 8.5241, 76.9366, "Heavy rainfall continues, flooded road near the secretariat.", "SRC-CITIZEN"),
    ("Visakhapatnam", "Andhra Pradesh", 17.6868, 83.2185, "Cyclone-related rough seas language in sample news item.", "SRC-NEWS-RSS"),
    ("Delhi", "Delhi", 28.6139, 77.209, "Dense fog on NH48, visibility under 50 metres.", "SRC-CITIZEN"),
    ("Srinagar", "Jammu and Kashmir", 34.0837, 74.7973, "Strong wind overnight, trees down in the city.", "SRC-YOUTUBE"),
    ("Indore", "Madhya Pradesh", 22.7196, 75.8577, "Dust haze and strong wind this afternoon.", "SRC-SOCIAL-SAMPLE"),
]


def seed() -> None:
    engine = database_module.engine
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        roles = {}
        for name in ROLES:
            row = db.execute(select(Role).where(Role.name == name)).scalar_one_or_none()
            if not row:
                row = Role(name=name, description=name)
                db.add(row)
                db.flush()
            roles[name] = row
        for uid, username, role_name in DEMO_USERS:
            user = db.get(User, UUID(uid)) or db.execute(select(User).where(User.username == username)).scalar_one_or_none()
            if not user:
                user = User(id=UUID(uid), username=username, display_name=username)
                db.add(user)
                db.flush()
            if roles[role_name] not in user.roles:
                user.roles.append(roles[role_name])
        sources: dict[str, Source] = {}
        for code, name, kind, st, cat, rel, live, label in SOURCES:
            src = db.execute(select(Source).where(Source.code == code)).scalar_one_or_none()
            if not src:
                src = Source(
                    code=code,
                    name=name,
                    kind=kind,
                    source_type=st,
                    category=cat,
                    reliability=rel,
                    is_live=live,
                    health_label=label,
                    description=f"SYNTHETIC/DEMO source record for {name}. Not a live government feed unless labelled CONNECTED.",
                )
                db.add(src)
                db.flush()
                db.add(SourceHealth(source_id=src.id, status=label))
            sources[code] = src
        if not db.execute(select(ModelVersion)).first():
            db.add(
                ModelVersion(
                    model_name="weather-classifier",
                    model_version="rules-baseline-v1",
                    deployment_status="baseline",
                    notes="Rules-based baseline — not an ML model. Accuracy metrics unavailable.",
                )
            )
        now = datetime.now(UTC)
        existing = db.execute(select(Report)).first()
        if not existing:
            citizen = db.get(User, UUID("00000000-0000-4000-8000-000000000001"))
            for i, (city, state, lat, lon, text, scode) in enumerate(SEEDS):
                src = sources[scode]
                report = Report(
                    source_id=src.id,
                    native_id=f"seed-{i}",
                    submitted_by_user_id=citizen.id if scode == "SRC-CITIZEN" else None,
                    posted_at=now - timedelta(hours=i * 2),
                    fetched_at=now - timedelta(hours=i * 2),
                    text=text,
                    lang="en",
                    lat=lat,
                    lon=lon,
                    city=city,
                    state=state,
                    place_text=city,
                    status="RECEIVED",
                    source_account="seed",
                )
                db.add(report)
                db.flush()
                process_report(db, report.id)
            db.add(
                OfficialObservation(
                    agency="OTHER",
                    station="SYNTHETIC-HYD-01",
                    observed_at=now,
                    rainfall_mm=42.0,
                    lat=17.385,
                    lon=78.4867,
                    is_synthetic=True,
                    notes="SYNTHETIC — not official government data",
                )
            )
            db.add(
                WeatherObservation(
                    provider="open-meteo",
                    observed_at=now,
                    lat=17.385,
                    lon=78.4867,
                    temperature_c=31.2,
                    precipitation_mm=4.0,
                    wind_ms=3.1,
                )
            )
            ev = db.execute(select(Event)).scalars().first()
            db.add(
                Alert(
                    event_id=ev.id if ev else None,
                    title="SYNTHETIC demo alert — urban flooding watch",
                    description="Demo only. No SMS/email sent.",
                    severity="high",
                    regions=["Telangana"],
                    status="active",
                    starts_at=now,
                    ends_at=now + timedelta(hours=6),
                    alert_type="flood",
                    affected_area="Hyderabad",
                    instructions=["Avoid underpasses", "Follow local authorities"],
                    channels=["in-app"],
                    issuer="HIKARI SENSE demo",
                )
            )
        db.commit()
        print("Seed complete. Records are synthetic DEMO data for PS 26069.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
