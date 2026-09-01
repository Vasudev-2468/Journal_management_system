"""WebSocket notifications endpoint.

Clients (author or editor) open a single WebSocket at
``/ws/notifications?token=<JWT>``; the server verifies the token
against ``settings.SECRET_KEY``, resolves the ``User`` row and
subscribes the connection to two pub/sub topics:

    * ``user:{user_id}``  — messages targeted at this specific user
    * ``broadcast:all``   — messages fanned out to every connected user

Every message routed to either topic is forwarded to the client as a
JSON frame ``{"type": "notification", "payload": <dict>}``. On connect
the server first sends a ``{"type": "hello", "user_id": ...}`` frame so
the client can confirm it's authenticated before it starts trusting
the stream.

Auth pattern is intentionally identical to ``services/editor_auth._decode_token``
and ``routers/author_auth._decode``: HS256 JWT with the shared
``settings.SECRET_KEY``, ``sub`` claim carrying the user's email. A
token that fails to decode, is missing ``sub`` or resolves to no user
results in a 4401 close (custom close code for auth failure — plain
1008 also acceptable but 4401 lets clients distinguish auth
specifically from generic policy violations).

The router deliberately never raises to the caller — a disconnect at
any point drops out of the read/write loops through
``WebSocketDisconnect`` and the ``finally`` block unsubscribes cleanly.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Query
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from starlette.websockets import WebSocket, WebSocketDisconnect, WebSocketState

from app.config import settings
from app.database import SessionLocal
from app.models.user import User
from app.services import pubsub

logger = logging.getLogger(__name__)

router = APIRouter()

# Custom close code used for authentication failures. 4000-4999 are
# reserved by the WebSocket protocol for application-defined codes.
_CLOSE_AUTH_FAILED = 4401

# Idle keepalive interval. If nothing is delivered for this many
# seconds the server sends a ping frame so intermediaries (some cloud
# load balancers close idle websockets after 60s) don't cull the
# connection. The read side treats a receive-timeout as a healthy idle
# state.
_IDLE_PING_SECONDS = 30.0


def _resolve_user_from_token(token: str) -> Optional[User]:
    """Decode ``token`` and return the matching ``User`` row, or None.

    Never raises — every failure path (bad token, missing subject, no
    such user, inactive user, database error) collapses to ``None``
    so the WebSocket handler can respond with a single "auth failed"
    close code regardless of which check tripped.
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
    except JWTError:
        return None

    # Reject bounded-scope tokens (editor pre-auth, review-link) so
    # only a real session token opens a WebSocket. Mirrors the
    # posture in ``auth_service.get_current_user``.
    scope = payload.get("scope")
    if scope and scope != "session":
        return None
    if payload.get("type") == "review_link":
        return None

    email = payload.get("sub")
    if not email:
        return None

    # A fresh short-lived session avoids leaking a request-scoped
    # Session across the connection's lifetime — the WS may live for
    # minutes to hours and we don't want to hold a DB connection open
    # for that long.
    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user is None or not user.is_active:
            return None
        # Detach so callers can safely read attributes (id, role) after
        # the session closes.
        db.expunge(user)
        return user
    except Exception:  # pragma: no cover - defensive
        logger.exception("ws_notifications: DB lookup failed for %s", email)
        return None
    finally:
        db.close()


@router.websocket("/ws/notifications")
async def notifications_ws(
    websocket: WebSocket,
    token: str = Query(..., description="JWT session token"),
) -> None:
    """Live notification stream for the authenticated user.

    Query param ``token`` carries the same session JWT used for HTTP
    calls (author or editor). On success the connection subscribes
    the caller to ``user:{user_id}`` and ``broadcast:all`` and streams
    inbound pub/sub messages as JSON frames.
    """
    # Accept first so we can send a structured close reason if auth
    # fails — a pre-accept close arrives at the client as a generic
    # handshake error which is harder to distinguish.
    await websocket.accept()

    user = _resolve_user_from_token(token)
    if user is None:
        try:
            await websocket.close(
                code=_CLOSE_AUTH_FAILED, reason="Invalid or expired token"
            )
        except Exception:
            pass
        return

    user_topic = f"user:{user.id}"
    broadcast_topic = "broadcast:all"

    # One queue serves both topics — the pubsub module keeps a set of
    # queues per topic, so registering the same queue under two topics
    # simply causes both fan-outs to hit it.
    queue = pubsub.subscribe(user_topic)
    pubsub.register(broadcast_topic, queue)

    # Optional role-scoped broadcast (e.g. ``broadcast:editors``) —
    # publishers that want to reach every editor without knowing
    # individual user_ids target this topic; other roles simply never
    # subscribe to it.
    role_topic: Optional[str] = None
    try:
        role_value = getattr(user.role, "value", None) or str(user.role or "")
    except Exception:
        role_value = ""
    if role_value:
        role_topic = f"broadcast:{role_value}"
        pubsub.register(role_topic, queue)

    # Send hello so the client knows the connection is authenticated
    # before it starts trusting subsequent frames.
    try:
        await websocket.send_json({"type": "hello", "user_id": str(user.id)})
    except Exception:
        # Client vanished during accept — clean up and exit.
        pubsub.unsubscribe(user_topic, queue)
        pubsub.unsubscribe(broadcast_topic, queue)
        if role_topic:
            pubsub.unsubscribe(role_topic, queue)
        return

    # A background task drains inbound client frames so a ``WebSocketDisconnect``
    # is noticed promptly even during long idle stretches. We don't
    # actually process client -> server messages; they're logged and
    # discarded.
    disconnect_event = asyncio.Event()

    async def _reader() -> None:
        try:
            while True:
                # ``receive_text`` awaits the next inbound frame; a
                # disconnect raises WebSocketDisconnect.
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        except Exception:
            logger.debug(
                "ws_notifications: reader closed with error", exc_info=True
            )
        finally:
            disconnect_event.set()

    reader_task = asyncio.create_task(_reader())

    try:
        while not disconnect_event.is_set():
            try:
                message = await asyncio.wait_for(
                    queue.get(), timeout=_IDLE_PING_SECONDS
                )
            except asyncio.TimeoutError:
                # Idle — send a lightweight ping frame so proxies keep
                # the connection alive. Client can ignore ``{"type": "ping"}``.
                if websocket.client_state != WebSocketState.CONNECTED:
                    break
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break
                continue

            if websocket.client_state != WebSocketState.CONNECTED:
                break
            try:
                await websocket.send_json(
                    {"type": "notification", "payload": message}
                )
            except Exception:
                # Client went away between select() and write — bail
                # out of the loop and let the finally clean up.
                break
    finally:
        pubsub.unsubscribe(user_topic, queue)
        pubsub.unsubscribe(broadcast_topic, queue)
        if role_topic:
            pubsub.unsubscribe(role_topic, queue)

        reader_task.cancel()
        try:
            await reader_task
        except (asyncio.CancelledError, Exception):
            pass

        # Best-effort close — the connection may already be gone.
        if websocket.client_state == WebSocketState.CONNECTED:
            try:
                await websocket.close()
            except Exception:
                pass
