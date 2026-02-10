from pydantic import BaseModel
from typing import Dict

class BloodSearchResponse(BaseModel):
    results: list[dict]
