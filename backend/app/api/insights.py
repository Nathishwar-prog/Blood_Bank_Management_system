from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.insights import InsightResponse, BloodCompatibilityRequest, BloodCompatibilityResponse, FirstAidGuide

router = APIRouter(
    prefix="/insights",
    tags=["insights"]
)

@router.get("/iron-absorption", response_model=InsightResponse)
def get_iron_absorption_tips():
    return {
        "title": "Tips for Improving Iron Absorption",
        "content": [
            "Consume Vitamin C rich foods (citrus fruits, bell peppers) with iron-rich meals.",
            "Avoid drinking tea or coffee with meals as tannins can inhibit iron absorption.",
            "Cook in cast iron skillets to increase iron content in food.",
            "Include lean meats, poultry, and fish in your diet as they contain heme iron which is easily absorbed.",
            "Soak beans and grains before cooking to reduce phytates which can block iron absorption."
        ],
        "source": "General Health Guidelines"
    }

@router.get("/donor-recovery", response_model=InsightResponse)
def get_donor_recovery_tips():
    return {
        "title": "Post-Donation Recovery Advice",
        "content": [
            "Drink plenty of fluids for the next 24-48 hours.",
            "Avoid strenuous physical activity or heavy lifting for the rest of the day.",
            "Keep the bandage on for the next 5 hours.",
            "If you feel lightheaded, lie down with your feet up until the feeling passes.",
            "Eat a healthy meal rich in iron and protein."
        ],
        "source": "Blood Donation Center Protocols"
    }

@router.post("/compatibility", response_model=BloodCompatibilityResponse)
def check_blood_compatibility(request: BloodCompatibilityRequest):
    blood_type = request.blood_type.upper().replace(" ", "")
    
    compatibility_chart = {
        "O-": {"give": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"], "receive": ["O-"]},
        "O+": {"give": ["O+", "A+", "B+", "AB+"], "receive": ["O+", "O-"]},
        "A-": {"give": ["A-", "A+", "AB-", "AB+"], "receive": ["A-", "O-"]},
        "A+": {"give": ["A+", "AB+"], "receive": ["A+", "A-", "O+", "O-"]},
        "B-": {"give": ["B-", "B+", "AB-", "AB+"], "receive": ["B-", "O-"]},
        "B+": {"give": ["B+", "AB+"], "receive": ["B+", "B-", "O+", "O-"]},
        "AB-": {"give": ["AB-", "AB+"], "receive": ["AB-", "A-", "B-", "O-"]},
        "AB+": {"give": ["AB+"], "receive": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"]}
    }

    if blood_type not in compatibility_chart:
        raise HTTPException(status_code=400, detail="Invalid blood type entered.")

    return {
        "blood_type": blood_type,
        "can_give_to": compatibility_chart[blood_type]["give"],
        "can_receive_from": compatibility_chart[blood_type]["receive"]
    }

@router.get("/emergency-first-aid", response_model=List[FirstAidGuide])
def get_first_aid_guides():
    return [
        {
            "condition": "Fainting",
            "steps": [
                "Lie the person down on their back.",
                "Elevate their legs to restore blood flow to the brain.",
                "Loosen tight clothing.",
                "Check for breathing and pulse.",
                "If they don't wake up within a minute, call emergency services."
            ]
        },
        {
            "condition": "Bleeding",
            "steps": [
                "Apply direct pressure to the wound with a clean cloth.",
                "Keep the injured limb elevated if possible.",
                "Do not remove the cloth if it soaks through, add more layers.",
                "Seek medical attention if bleeding is severe or doesn't stop."
            ]
        },
        {
            "condition": "Burn",
            "steps": [
                "Cool the burn with cool (not cold) running water for 10-20 minutes.",
                "Cover with a sterile, non-fluffy dressing or cling film.",
                "Do not apply ice, butter, or creams immediately.",
                "Seek medical help for severe burns or chemical burns."
            ]
        }
    ]
