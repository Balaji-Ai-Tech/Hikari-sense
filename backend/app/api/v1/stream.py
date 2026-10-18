import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import get_settings
from app.core.security import decode_token, principal_from_payload

router = APIRouter(tags=["stream"])


@router.websocket("/stream/events")
async def event_stream(ws: WebSocket):
    protocols = ws.scope.get("subprotocols", [])
    token = protocols[1] if len(protocols) == 2 and protocols[0] == "hikari-auth" else None
    await ws.accept(subprotocol="hikari-auth" if token else None)
    if not token:
        await ws.send_json({"error": {"code": "UNAUTHORIZED", "message": "Missing token"}})
        await ws.close(code=4401)
        return
    try:
        principal_from_payload(decode_token(token))
    except Exception:
        await ws.send_json({"error": {"code": "UNAUTHORIZED", "message": "Invalid token"}})
        await ws.close(code=4401)
        return
    channel = get_settings().ws_channel
    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(get_settings().redis_url, decode_responses=True)
        pubsub = client.pubsub()
        await pubsub.subscribe(channel)
        try:
            while True:
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=15.0)
                if msg and msg.get("data"):
                    data = msg["data"]
                    await ws.send_text(data if isinstance(data, str) else json.dumps(data))
                else:
                    await ws.send_json({"type": "PING"})
        finally:
            await pubsub.unsubscribe(channel)
            await client.aclose()
    except WebSocketDisconnect:
        return
    except Exception:
        try:
            while True:
                await ws.send_json({"type": "PING", "note": "Redis fanout unavailable; connect Redis for live events"})
                await asyncio.sleep(20)
        except WebSocketDisconnect:
            return
