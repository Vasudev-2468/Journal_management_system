from sqlalchemy.orm import Session
from fastapi import HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from app.models.user import User
from app.schemas.user import UserCreate
from app.utils.helpers import hash_password, verify_password
from app.database import get_db
from app.config import settings
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


class TokenData(BaseModel):
    email: Optional[str] = None

def create_user(user: UserCreate, db: Session):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = hash_password(user.password)
    # Derive full_name from first+last if not explicitly provided
    full_name = user.full_name
    if not full_name and (user.first_name or user.last_name):
        full_name = " ".join(filter(None, [user.first_name, user.last_name]))

    new_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        full_name=full_name,
        first_name=user.first_name,
        last_name=user.last_name,
        whatsapp_number=user.whatsapp_number,
        institution=user.institution,
        orcid=user.orcid,
        country=user.country,
        department=user.department,
        bio=user.bio,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    user = db.query(User).filter(User.email == email).first()
    if user and verify_password(password, user.hashed_password):
        return user
    return None

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=settings.JWT_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        # Fix R2 — reject bounded-scope tokens (currently the editor pre-auth
        # token minted by editor_auth.login). Those tokens prove a password
        # was typed but MFA hasn't been completed yet; they must not authenticate
        # anything except /editor-auth/verify-otp and /editor-auth/resend-otp.
        scope = payload.get("scope")
        if scope and scope != "session":
            raise credentials_exception
        # Also reject review-link tokens (utils/link_tokens): those authorise
        # a specific review URL, not the user's identity.
        if payload.get("type") == "review_link":
            raise credentials_exception
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.email == token_data.email).first()
    if user is None:
        raise credentials_exception
    return user

