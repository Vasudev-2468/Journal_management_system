"""
Seed a default editor user for the Editor Portal.

Usage:
    python -m app.seed_editor

Default credentials:
    Email:    editor@journal.com
    Password: Editor@2024
    Role:     editor
"""

import sys
from app.database import SessionLocal
from app.models.user import User, UserRole
from app.utils.helpers import hash_password


DEFAULT_EDITOR = {
    "username": "chief_editor",
    "email": "editor@journal.com",
    "full_name": "Chief Editor",
    "password": "Editor@2024",
    "role": UserRole.editor,
}


def seed_default_editor():
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == DEFAULT_EDITOR["email"]).first()
        if existing:
            print(f"Editor user already exists: {existing.email} (role={existing.role.value})")
            # Ensure the role is set to editor
            if existing.role != UserRole.editor:
                existing.role = UserRole.editor
                db.commit()
                print(f"  → Updated role to 'editor'")
            return existing

        user = User(
            username=DEFAULT_EDITOR["username"],
            email=DEFAULT_EDITOR["email"],
            full_name=DEFAULT_EDITOR["full_name"],
            hashed_password=hash_password(DEFAULT_EDITOR["password"]),
            role=DEFAULT_EDITOR["role"],
            is_active=True,
            mfa_enabled=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        print("=" * 50)
        print("  Default Editor User Created Successfully")
        print("=" * 50)
        print(f"  Email:    {DEFAULT_EDITOR['email']}")
        print(f"  Password: {DEFAULT_EDITOR['password']}")
        print(f"  Role:     {DEFAULT_EDITOR['role'].value}")
        print(f"  Username: {DEFAULT_EDITOR['username']}")
        print("=" * 50)
        return user
    finally:
        db.close()


if __name__ == "__main__":
    seed_default_editor()
