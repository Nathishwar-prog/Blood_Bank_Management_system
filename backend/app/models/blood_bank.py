
from sqlalchemy import Column, String, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID
from geoalchemy2 import Geography
import uuid
from app.database import Base

class BloodBank(Base):
    __tablename__ = "blood_banks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    address = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    location = Column(Geography(geometry_type='POINT', srid=4326))
    contact_number = Column(String)
    is_active = Column(Boolean, default=True)
