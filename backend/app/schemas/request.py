
from pydantic import BaseModel, EmailStr
from typing import Optional
from enum import Enum

class SortPreference(str, Enum):
    DISTANCE = "distance"
    ETA = "eta"

class BloodSearchRequest(BaseModel):
    blood_type: str
    latitude: float
    longitude: float
    sort_by: Optional[SortPreference] = SortPreference.DISTANCE

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str = "PATIENT"

class DonorRegistration(BaseModel):
    full_name: str
    blood_type: str
    contact: str
    address: str
