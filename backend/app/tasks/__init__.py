"""
tasks package — re-exports the celery app and all task functions so existing
``from app.tasks import <task>`` imports continue to work.
"""

from app.tasks.celery_app import celery_app
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
    "celery_app",
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
