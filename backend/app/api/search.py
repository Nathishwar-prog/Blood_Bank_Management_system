
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.schemas.request import BloodSearchRequest, SortPreference
from app.schemas.response import BloodSearchResponse

router = APIRouter()

@router.post("/search-blood", response_model=BloodSearchResponse)
async def search_blood(req: BloodSearchRequest, db: Session = Depends(get_db)):
    # Standard query to get nearby active centers
    query = text("""
        SELECT 
            bb.id as blood_bank_id,
            bb.name,
            bb.latitude,
            bb.longitude,
            bb.address,
            bb.contact_number,
            ST_Distance(bb.location, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography) / 1000 as distance_km,
            (
                SELECT jsonb_object_agg(blood_type, units_available)
                FROM blood_inventory
                WHERE blood_bank_id = bb.id
            ) as full_inventory,
            (
                SELECT units_available 
                FROM blood_inventory 
                WHERE blood_bank_id = bb.id AND blood_type = :blood_type
            ) as requested_units
        FROM blood_banks bb
        WHERE bb.is_active = true
          AND EXISTS (
              SELECT 1 FROM blood_inventory 
              WHERE blood_bank_id = bb.id 
              AND blood_type = :blood_type 
              AND units_available > 0
          )
    """)
    
    results = db.execute(query, {
        "lat": req.latitude,
        "lon": req.longitude,
        "blood_type": req.blood_type
    }).fetchall()

    formatted_results = []
    for row in results:
        # Business logic for ETA calculation (simulated for MVP)
        # In production, this would call Google Distance Matrix
        eta = int(row.distance_km * 2.5) 
        formatted_results.append({
            "id": str(row.blood_bank_id),
            "name": row.name,
            "address": row.address,
            "distance_km": round(row.distance_km, 2),
            "eta_minutes": eta,
            "units_available": row.requested_units or 0,
            "inventory": row.full_inventory or {},
            "latitude": row.latitude,
            "longitude": row.longitude,
            "contact_number": row.contact_number,
            "google_maps_url": f"https://www.google.com/maps/dir/?api=1&destination={row.latitude},{row.longitude}"
        })

    # Apply sorting preference
    if req.sort_by == SortPreference.ETA:
        formatted_results.sort(key=lambda x: x["eta_minutes"])
    else:
        formatted_results.sort(key=lambda x: x["distance_km"])

    return {"results": formatted_results[:5]}
