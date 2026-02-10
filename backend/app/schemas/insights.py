from pydantic import BaseModel
from typing import List, Optional

class InsightResponse(BaseModel):
    title: str
    content: List[str]
    source: Optional[str] = None

class BloodCompatibilityRequest(BaseModel):
    blood_type: str  # e.g., "A+", "O-"

class BloodCompatibilityResponse(BaseModel):
    blood_type: str
    can_give_to: List[str]
    can_receive_from: List[str]

class FirstAidGuide(BaseModel):
    condition: str
    steps: List[str]
