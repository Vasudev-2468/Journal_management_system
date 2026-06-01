from pydantic import BaseModel, EmailStr
from typing import Optional


class UserBase(BaseModel):
    username: str
    email: str


class UserCreate(UserBase):
    password: str
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    whatsapp_number: Optional[str] = None
    institution: Optional[str] = None
    orcid: Optional[str] = None
    country: Optional[str] = None
    department: Optional[str] = None
    bio: Optional[str] = None


class UserUpdate(UserBase):
    password: Optional[str] = None


class UserInDB(UserBase):
    id: int

    class Config:
        orm_mode = True


class User(UserInDB):
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: Optional[str] = None
    whatsapp_number: Optional[str] = None
    institution: Optional[str] = None
    orcid: Optional[str] = None
    country: Optional[str] = None
    department: Optional[str] = None
    bio: Optional[str] = None
    profile_picture_url: Optional[str] = None


class AuthorProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    institution: Optional[str] = None
    department: Optional[str] = None
    orcid: Optional[str] = None
    research_areas: Optional[str] = None
    whatsapp_number: Optional[str] = None
    country: Optional[str] = None
    bio: Optional[str] = None
