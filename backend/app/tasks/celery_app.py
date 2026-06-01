from celery import Celery
from celery.schedules import crontab
from app.config import settings

celery_app = Celery("journal_tasks", broker=settings.REDIS_URL)

celery_app.conf.update(
    result_backend=settings.REDIS_URL,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# Autodiscover tasks in the tasks package
celery_app.autodiscover_tasks(["app.tasks"])

# Scheduled (periodic) tasks
celery_app.conf.beat_schedule = {
    "send-deadline-reminders-daily-9am": {
        "task": "send_deadline_reminders",
        "schedule": crontab(hour=9, minute=0),
    },
}
