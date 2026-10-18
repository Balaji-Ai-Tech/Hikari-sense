import json

import redis.asyncio

from tests.conftest import auth


class FakePubSub:
    def __init__(self):
        self.messages = [None, {"data": json.dumps({"type": "EVENT_UPDATED", "event_id": "evt-1"})}]

    async def subscribe(self, _channel):
        return None

    async def unsubscribe(self, _channel):
        return None

    async def get_message(self, **_kwargs):
        return self.messages.pop(0)


class FakeRedis:
    def __init__(self):
        self.subscription = FakePubSub()

    def pubsub(self):
        return self.subscription

    async def aclose(self):
        return None


def test_authenticated_stream_sends_heartbeat_and_event_update(client, db, monkeypatch):
    monkeypatch.setattr(redis.asyncio, "from_url", lambda *_args, **_kwargs: FakeRedis())
    token = auth(client, db, "analyst")["Authorization"].removeprefix("Bearer ")

    with client.websocket_connect(
        "/api/v1/stream/events",
        subprotocols=["hikari-auth", token],
    ) as websocket:
        assert websocket.receive_json() == {"type": "PING"}
        assert websocket.receive_json() == {"type": "EVENT_UPDATED", "event_id": "evt-1"}


def test_stream_rejects_query_string_tokens(client, db):
    token = auth(client, db, "analyst")["Authorization"].removeprefix("Bearer ")
    with client.websocket_connect(f"/api/v1/stream/events?token={token}") as websocket:
        assert websocket.receive_json()["error"]["code"] == "UNAUTHORIZED"