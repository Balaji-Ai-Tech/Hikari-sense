from datetime import UTC, datetime, timedelta

from app.intelligence.classifier import classifier
from app.intelligence.dedup import compare_text, text_hash
from app.intelligence.event_clustering import same_event
from app.intelligence.geoparser import geoparse
from app.intelligence.verification_engine import score_event


def test_rules_classifier_flooding():
    p = classifier.predict_text("Water entered houses and waterlogging on the flooded road")
    assert p.event_type == "flooding"
    assert p.kind == "rules_baseline"
    assert "SUGGESTION ONLY" in p.disclaimer


def test_rules_classifier_cap_flood_description():
    p = classifier.predict_text("River Adhwara continues to flow in severe flood situation")
    assert p.event_type == "flooding"
    assert p.frontend_type == "flood"


def test_geoparse_hyderabad():
    g = geoparse("Heavy rain in Hyderabad")
    assert g.city == "Hyderabad"
    assert g.state == "Telangana"


def test_geoparse_does_not_guess_a_capital_from_state_and_gps():
    g = geoparse(
        "River Ganga is in severe flood situation",
        "Ganga, Dabri, Shahjahanpur, Uttar Pradesh",
        27.49,
        79.37,
    )
    assert g.state == "Uttar Pradesh"
    assert g.city is None
    assert g.district is None


def test_dedup_exact_text():
    a = "Flooded road near the market"
    assert text_hash(a) == text_hash("Flooded road near the market")
    assert compare_text(a, a) is not None


def test_cluster_window():
    t = datetime.now(UTC)
    assert same_event("flood", 17.38, 78.48, t, "flood", 17.39, 78.49, t + timedelta(hours=1))
    assert not same_event("flood", 17.38, 78.48, t, "heatwave", 17.39, 78.49, t)


def test_verification_formula():
    s = score_event(
        source_types=["official", "citizen"],
        unique_sources=2,
        report_count=3,
        spatial_spread_km=4,
        time_span_hours=1,
        media_authenticity_avg=0.7,
        official_agree=True,
        recycled_image=False,
    )
    assert 0 <= s.score <= 1
    assert s.source_reliability > 0
    expected = 0.25 * s.source_reliability + 0.25 * s.corroboration + 0.20 * s.spatial_consistency + 0.15 * s.temporal_consistency + 0.15 * s.media_authenticity
    assert abs(s.score - min(1.0, expected + s.official_boost)) < 1e-3
