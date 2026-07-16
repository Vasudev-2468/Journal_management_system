"""
tasks package — re-exports each background task so existing
``from app.tasks import <task>`` imports continue to work.

All tasks are `InlineTask` instances (`.delay()` / `.apply_async()` fire a
background thread).  If you later re-introduce Celery, swap `InlineTask` for
`@celery_app.task` in each individual task module and re-export from here.
"""

from app.tasks.paper_tasks import (
    process_new_submission,
    compute_reviewer_embedding,
    send_reviewer_invitations,
    send_deadline_reminders,
    run_agent_intake_pipeline,
    run_agent_reviewer_suggestion,
    run_agent_reviewer_assignment,
)
from app.tasks.notification_tasks import (
    notify_editor_review_complete,
    send_decision_to_author,
)

__all__ = [
    "process_new_submission",
    "compute_reviewer_embedding",
    "send_reviewer_invitations",
    "send_deadline_reminders",
    "run_agent_intake_pipeline",
    "run_agent_reviewer_suggestion",
    "run_agent_reviewer_assignment",
    "notify_editor_review_complete",
    "send_decision_to_author",
]
