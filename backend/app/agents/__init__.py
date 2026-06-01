"""
Editor Portal Agents Package

Five autonomous agents that communicate through the orchestrator:
  Agent 1: Acknowledgement Bot — instant receipts to author, consult party, editor
  Agent 2: Format Validation Bot — auto-checks paper format, generates report
  Agent 3: Reviewer Suggester Bot — finds/suggests reviewers from DB + external APIs
  Agent 4: Review Link Generator — creates secure, expiring review tokens
  Agent 5: Notification Bot — sends Email + WhatsApp alerts
"""

from app.agents.agent1_acknowledgement import AcknowledgementAgent
from app.agents.agent2_format_validation import FormatValidationAgent
from app.agents.agent3_reviewer_suggester import ReviewerSuggesterAgent
from app.agents.agent4_link_generator import ReviewLinkGeneratorAgent
from app.agents.agent5_notification import NotificationBotAgent
from app.agents.orchestrator import AgentOrchestrator

__all__ = [
    "AcknowledgementAgent",
    "FormatValidationAgent",
    "ReviewerSuggesterAgent",
    "ReviewLinkGeneratorAgent",
    "NotificationBotAgent",
    "AgentOrchestrator",
]
