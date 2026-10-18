from app.ingestion.imerg import ImergConnector
from app.ingestion.base import BaseConnector
from app.ingestion.citizen import CitizenConnector
from app.ingestion.firms import FirmsConnector
from app.ingestion.official import OfficialConnector
from app.ingestion.open_meteo import OpenMeteoConnector
from app.ingestion.rss import RssConnector
from app.ingestion.sachet import SachetConnector
from app.ingestion.social import SocialConnector
from app.ingestion.youtube import YouTubeConnector


def all_connectors() -> list[BaseConnector]:
    return [
        RssConnector(),
        YouTubeConnector(),
        CitizenConnector(),
        OfficialConnector(),
        SachetConnector(),
        OpenMeteoConnector(),
        ImergConnector(),
        FirmsConnector(),
        SocialConnector(),
    ]
