
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.schemas.request import BloodSearchRequest
from app.schemas.response import BloodSearchResponse

router = APIRouter()

@router.post("/search-blood", response_model=BloodSearchResponse)
async def search_blood(req: BloodSearchRequest, db: Session = Depends(get_db)):
    # Use PostGIS to find blood banks with availability
    query = text("""
        SELECT 
            bb.id as blood_bank_id,
            bb.name,
            bb.latitude,
            bb.longitude,
            ST_Distance(bb.location, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography) / 1000 as distance_km,
            bi.units_available
        FROM blood_banks bb
        JOIN blood_inventory bi ON bb.id = bi.blood_bank_id
        WHERE bi.blood_type = :blood_type
          AND bi.units_available > 0
          AND bb.is_active = true
        ORDER BY distance_km ASC
        LIMIT 5
    """)
    
    results = db.execute(query, {
        "lat": req.latitude,
        "lon": req.longitude,
        "blood_type": req.blood_type
    }).fetchall()

    formatted_results = []
    for row in results:
        # Business logic for ETA calculation (simulated)
        eta = int(row.distance_km * 2.5) # simplified model
        formatted_results.append({
            "blood_bank_id": str(row.blood_bank_id),
            "name": row.name,
            "distance_km": round(row.distance_km, 2),
            "eta_minutes": eta,
            "units_available": row.units_available,
            "latitude": row.latitude,
            "longitude": row.longitude,
            "google_maps_url": f"https://www.google.com/maps/dir/?api=1&destination={row.latitude},{row.longitude}"
        })

    return {"results": formatted_results}
