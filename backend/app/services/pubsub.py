"""In-process publish/subscribe for real-time notifications.

Backs the WebSocket notification stream (``routers/ws_notifications``).
Each subscriber owns an ``asyncio.Queue`` registered under one or more
topic strings; publishers push a small dict payload to every queue
registered under the topic non-blocking.

Thread-safety: the topic registry is guarded by a plain
``threading.Lock`` so sync request handlers (which may live on a
different loop-less thread) can invoke ``publish`` from a scheduled task
without racing the WebSocket coroutines. The queues themselves are
asyncio queues — the reader awaits ``queue.get()`` on the loop the
WebSocket was accepted on. Publish uses ``put_nowait`` so a slow reader
never blocks the caller; if a queue is full the message is dropped for
that subscriber and logged.

Suitable for a single-process free-tier deployment. Horizontal scaling
(multiple worker processes or replicas) would need a shared broker
(Redis pub/sub, NATS, etc.) — this module deliberately keeps the API
minimal so that swap is straightforward.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from collections import defaultdict
from typing import Any, Dict, List, Set

logger = logging.getLogger(__name__)

# Per-subscriber queue bound. A well-behaved reader drains this in
# milliseconds; the cap only exists so a wedged connection cannot grow
# without bound.
_QUEUE_MAXSIZE = 256

# topic -> set of queues subscribed to that topic
_subscribers: Dict[str, Set[asyncio.Queue]] = defaultdict(set)
_lock = threading.Lock()


def subscribe(topic: str) -> asyncio.Queue:
    """Register a new subscriber queue under ``topic`` and return it.

    The returned queue is asyncio-based; the caller should await
    ``queue.get()`` from within the event loop it was created on. The
    same queue can be registered under multiple topics by calling
    ``subscribe`` again with a different topic and passing the returned
    queue through — however the common flow is one queue per WebSocket
    connection, registered under two or three topics via repeated
    ``_subscribers[topic].add(q)`` calls done by the router.
    """
    queue: asyncio.Queue = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
    with _lock:
        _subscribers[topic].add(queue)
    return queue


def register(topic: str, queue: asyncio.Queue) -> None:
    """Register an existing ``queue`` under an additional ``topic``.

    Companion to ``subscribe`` — the WebSocket handler creates one queue
    per connection and calls ``register`` for each extra topic it wants
    to receive on (e.g. ``broadcast:all`` in addition to
    ``user:{user_id}``).
    """
    with _lock:
        _subscribers[topic].add(queue)


def unsubscribe(topic: str, queue: asyncio.Queue) -> None:
    """Remove ``queue`` from ``topic``'s subscriber set.

    Silently ignores an unknown topic or queue — the caller is usually a
    ``finally:`` block on disconnect and should never raise.
    """
    with _lock:
        subs = _subscribers.get(topic)
        if not subs:
            return
        subs.discard(queue)
        if not subs:
            # Reclaim empty topic entries so the registry doesn't grow
            # without bound as users log in and out.
            _subscribers.pop(topic, None)


async def publish(topic: str, message: Dict[str, Any]) -> None:
    """Deliver ``message`` to every subscriber registered under ``topic``.

    Non-blocking: uses ``put_nowait`` so a stalled subscriber never
    blocks the publishing request. If a queue is full the message is
    dropped for that subscriber and the drop is logged at warning level.
    A best-effort failure elsewhere (a queue removed from another
    thread, etc.) is caught and logged — this function never raises.
    """
    with _lock:
        # Copy under the lock so we can release before the (async)
        # deliveries below. put_nowait is synchronous but keeping the
        # lock scope tight avoids any surprise around GC-triggered
        # callbacks that might re-enter.
        targets: List[asyncio.Queue] = list(_subscribers.get(topic, ()))

    if not targets:
        return

    for queue in targets:
        try:
            queue.put_nowait(message)
        except asyncio.QueueFull:
            logger.warning(
                "pubsub: dropping message for full queue on topic=%s", topic
            )
        except Exception:  # pragma: no cover - defensive
            logger.exception(
                "pubsub: unexpected error delivering to subscriber on topic=%s",
                topic,
            )


def publish_threadsafe(topic: str, message: Dict[str, Any]) -> None:
    """Fire-and-forget publish callable from any thread or context.

    A synchronous FastAPI handler can call this without needing an
    event loop of its own — if a running loop exists in the current
    thread the publish is scheduled on it; otherwise the message is
    dropped after logging (nothing to schedule against). This is the
    entry point request handlers should use so that a publish never
    blocks the response.
    """
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = None

    if loop is not None and loop.is_running():
        # Schedule on the running loop; the publish coroutine is very
        # light so this never delays the request meaningfully.
        try:
            asyncio.ensure_future(publish(topic, message), loop=loop)
            return
        except Exception:
            logger.exception("pubsub: failed to schedule publish on loop")

    # Fallback: no loop available in this context. Try to deliver
    # synchronously — this still works because ``publish`` only does
    # ``put_nowait``, which is not actually async under the hood.
    try:
        asyncio.run(publish(topic, message))
    except Exception:
        logger.exception(
            "pubsub: dropped message for topic=%s (no loop available)", topic
        )


def subscriber_count(topic: str) -> int:
    """Return the current number of subscribers to ``topic``.

    Intended for tests and diagnostics; not exercised by production
    code paths.
    """
    with _lock:
        return len(_subscribers.get(topic, ()))
