"""RBAC permissions (spec §37).

Two tables:

  * ``permissions`` — the canonical action catalogue. One row per
    action name (e.g. ``DOI_ASSIGN``, ``PUBLISH``, ``MANAGE_USERS``).
  * ``role_permissions`` — many-to-many between the ``user_role``
    enum and permissions.

Deliberately no ``user_permissions`` table yet — grants are
role-based only. That covers the current authorisation matrix and
keeps the audit surface small; a per-user override is a follow-up.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from app.database import Base


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String(80), nullable=False, unique=True, index=True)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Permission({self.action})>"


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint("role", "permission_id", name="uq_role_permission"),
    )

    id = Column(Integer, primary_key=True, index=True)
    # Free-form string — mirrors the user_role enum values but as text
    # so a new role added on the User side doesn't require an enum
    # migration on this side.
    role = Column(String(32), nullable=False, index=True)
    permission_id = Column(
        Integer, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
