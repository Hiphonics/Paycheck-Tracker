from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class BillItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    paycheck_id: str
    month_key: str
    name: str
    amount: float
    fraction: Optional[str] = None  # e.g. "3of6"
    paid: bool = False
    due_day: Optional[int] = None


class Paycheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    month_key: str  # "2026-09"
    number: int
    date_range: str  # "Sept 10 - Sept 16"
    color_cycle: str  # cycleBlue / cyclePurple / cycleGreen / cycleYellow / cycleOrange
    total_cash: float
    vehicle_payment: float = 0
    targeted_payoffs: float = 0
    current_month_bills: float = 0
    next_month_early_bills: float = 0
    living_costs: float = 300
    savings_transfer: float = 0
    unallocated_buffer: float = 0
    weekly_desired_spending: float = 0  # amount user actually spent this week
    weekly_target_spending: float = 300  # default target
    starting_cash: float = 0


class Month(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    key: str  # "2026-09"
    name: str  # "September 2026"
    year: int
    month: int
    starting_buffer: float = 0
    notes: str = ""


class ToggleBillReq(BaseModel):
    paid: bool


class UpdatePaycheckSpendingReq(BaseModel):
    weekly_desired_spending: Optional[float] = None
    weekly_target_spending: Optional[float] = None


class UpdateBillReq(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    paid: Optional[bool] = None


# ---------- Seed data ----------
CYCLE_COLORS = ["cycleBlue", "cyclePurple", "cycleGreen", "cycleYellow", "cycleOrange"]


def _cycle(idx: int) -> str:
    return CYCLE_COLORS[(idx - 1) % len(CYCLE_COLORS)]


SEED_MONTHS = [
    {"key": "2026-09", "name": "September 2026", "year": 2026, "month": 9},
    {"key": "2026-10", "name": "October 2026", "year": 2026, "month": 10},
    {"key": "2026-11", "name": "November 2026", "year": 2026, "month": 11},
    {"key": "2026-12", "name": "December 2026", "year": 2026, "month": 12},
]

SEED_PAYCHECKS = [
    # September
    {"month_key": "2026-09", "number": 1, "date_range": "Sept 10 – Sept 16", "total_cash": 1476, "vehicle_payment": 690, "targeted_payoffs": 649.40, "current_month_bills": 441.60, "living_costs": 300, "savings_transfer": 100, "unallocated_buffer": 168, "starting_cash": 705},
    {"month_key": "2026-09", "number": 2, "date_range": "Sept 17 – Sept 23", "total_cash": 1300, "vehicle_payment": 690, "targeted_payoffs": 0, "current_month_bills": 706.88, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 0},
    {"month_key": "2026-09", "number": 3, "date_range": "Sept 24 – Sept 30", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 629.55, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 400, "unallocated_buffer": 206.5},
    # October
    {"month_key": "2026-10", "number": 1, "date_range": "Oct 1 – Oct 7", "total_cash": 1300, "vehicle_payment": 690, "targeted_payoffs": 0, "current_month_bills": 257.05, "living_costs": 300, "savings_transfer": 0, "unallocated_buffer": 200},
    {"month_key": "2026-10", "number": 2, "date_range": "Oct 8 – Oct 14", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 402.09, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 0},
    {"month_key": "2026-10", "number": 3, "date_range": "Oct 15 – Oct 21", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 493.56, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 0},
    {"month_key": "2026-10", "number": 4, "date_range": "Oct 22 – Oct 28", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 37.68, "current_month_bills": 550, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 0},
    {"month_key": "2026-10", "number": 5, "date_range": "Oct 29 – Oct 31", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 0, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 800},
    # November
    {"month_key": "2026-11", "number": 1, "date_range": "Nov 5 – Nov 11", "total_cash": 1300, "vehicle_payment": 690, "targeted_payoffs": 0, "current_month_bills": 183.46, "living_costs": 300, "savings_transfer": 0, "unallocated_buffer": 126.54},
    {"month_key": "2026-11", "number": 2, "date_range": "Nov 12 – Nov 18", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 77.72, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 400, "unallocated_buffer": 522.28},
    {"month_key": "2026-11", "number": 3, "date_range": "Nov 19 – Nov 25", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 475.5, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 324.5},
    {"month_key": "2026-11", "number": 4, "date_range": "Nov 26 – Dec 2", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 176.4, "current_month_bills": 200, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 423.6},
    # December
    {"month_key": "2026-12", "number": 1, "date_range": "Dec 3 – Dec 9", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 624.9, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 175.1},
    {"month_key": "2026-12", "number": 2, "date_range": "Dec 10 – Dec 16", "total_cash": 1300, "vehicle_payment": 690, "targeted_payoffs": 0, "current_month_bills": 108.56, "living_costs": 300, "savings_transfer": 0, "unallocated_buffer": 201.44},
    {"month_key": "2026-12", "number": 3, "date_range": "Dec 17 – Dec 23", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 475.5, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 324.5},
    {"month_key": "2026-12", "number": 4, "date_range": "Dec 24 – Dec 30", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 103.55, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 400, "unallocated_buffer": 496.45},
    {"month_key": "2026-12", "number": 5, "date_range": "Dec 31 – Jan 6", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 37.68, "current_month_bills": 550, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 212.32},
]

SEED_BILLS_BY_PAYCHECK = {
    ("2026-09", 1): [
        ("Walmart", 117.35, None), ("Recurring", 87.22, "3of6"), ("Recurring", 12.76, "2of4"),
        ("Recurring", 108.56, "7of12"), ("Recurring", 25.00, "4of4"), ("Recurring", 76.57, "4of4"),
        ("Recurring", 31.91, "2of4"), ("Recurring", 19.15, "2of4"), ("Recurring", 18.64, "3of4"),
    ],
    ("2026-09", 2): [
        ("Recurring", 77.72, "2of6"), ("Recurring", 106.25, "1of2"), ("Recurring", 51.05, "3of4"),
        ("Recurring", 45.24, "4of4"), ("Recurring", 25.53, "2of4"), ("Riot Games", 38.66, None),
        ("Recurring", 43.63, "2of3"), ("Recurring", 34.90, "2of3"), ("Recurring", 163.59, "1of6"),
        ("Recurring", 25.52, "3of4"), ("Recurring", 33.73, "1of12"), ("Recurring", 73.82, "4of6"),
        ("Recurring", 25.53, "2of4"), ("Recurring", 19.18, "1of6"), ("XFINITY Bill", 183.88, None),
        ("Recurring", 73.77, "4of4"),
    ],
    ("2026-09", 3): [
        ("Dave Repayment", 140.00, None), ("Recurring", 25.52, "4of4"), ("Recurring", 12.76, "3of4"),
        ("Recurring", 15.91, "1of3"), ("Recurring", 76.57, "4of4"), ("Recurring", 31.90, "3of4"),
        ("Recurring", 25.53, "2of4"), ("Recurring", 42.50, "7of12"), ("Recurring", 61.05, "8of12"),
        ("Recurring", 67.00, "2of3"), ("Recurring", 27.15, "2of3"), ("Recurring", 19.14, "3of4"),
        ("Recurring", 72.36, "3of6"), ("Recurring", 37.68, "8of12"), ("Recurring", 18.64, "4of4"),
    ],
    ("2026-10", 1): [
        ("Recurring", 51.05, "4of4"), ("Recurring", 25.52, "3of4"), ("T-Mobile", 200.00, None),
        ("Rent", 350.00, None), ("Recurring", 25.52, "4of4"), ("Recurring", 18.85, "1of6"),
        ("Recurring", 25.52, "3of4"),
    ],
    ("2026-10", 2): [
        ("Recurring", 56.05, "1of24"), ("Recurring", 12.76, "4of4"), ("Recurring", 31.90, "4of4"),
        ("Car Payment", 690.00, None), ("Recurring", 108.56, "8of12"), ("Recurring", 19.14, "4of4"),
        ("Recurring", 28.64, "2of3"),
    ],
    ("2026-10", 3): [
        ("Recurring", 25.52, "4of4"), ("Recurring", 77.72, "3of6"), ("Recurring", 41.11, "3of3"),
        ("Recurring", 34.90, "3of3"), ("Recurring", 163.59, "2of6"), ("Recurring", 25.52, "4of4"),
        ("Recurring", 33.73, "2of12"),
    ],
    ("2026-10", 4): [
        ("Recurring", 19.18, "2of6"), ("Recurring", 88.00, "4of6"), ("Xfinity", 171.00, None),
        ("Recurring", 15.91, "2of3"), ("Recurring", 72.36, "3of6"), ("Recurring", 42.50, "8of12"),
        ("Recurring", 61.05, "3of3"), ("Recurring", 23.56, "3of3"),
    ],
    ("2026-10", 5): [
        ("Recurring", 37.68, "9of12"),
    ],
    ("2026-11", 1): [
        ("Rent", 350.00, None), ("T-Mobile", 200.00, None), ("Recurring", 18.85, "2of6"),
        ("Car Payment", 690.00, None), ("Recurring", 56.05, "2of24"), ("Recurring", 108.56, "9of12"),
    ],
    ("2026-11", 2): [
        ("Recurring", 77.72, "4of6"),
    ],
    ("2026-11", 3): [
        ("Recurring", 163.59, "3of6"), ("Recurring", 33.73, "3of12"), ("Xfinity", 171.00, None),
        ("Recurring", 19.18, "3of6"), ("Recurring", 88.00, "5of6"),
    ],
    ("2026-11", 4): [
        ("Recurring", 61.05, "10of12"), ("Recurring", 35.17, "3of3"), ("Recurring", 42.50, "9of12"),
        ("Recurring", 37.68, "10of12"),
    ],
    ("2026-12", 1): [
        ("T-Mobile", 200.00, None), ("Recurring", 18.85, "3of6"), ("Rent", 350.00, None),
        ("Recurring", 56.05, "3of24"),
    ],
    ("2026-12", 2): [
        ("Recurring", 108.56, "10of12"), ("Car Payment", 690.00, None),
    ],
    ("2026-12", 3): [
        ("Recurring", 163.59, "4of6"), ("Xfinity", 171.00, None), ("Recurring", 33.73, "4of12"),
        ("Recurring", 19.18, "4of6"), ("Recurring", 88.00, "6of6"),
    ],
    ("2026-12", 4): [
        ("Recurring", 61.05, "11of12"), ("Recurring", 42.50, "10of12"),
    ],
    ("2026-12", 5): [
        ("Recurring", 37.68, "11of12"),
    ],
}


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "Paycheck Planner API"}


@api_router.post("/seed")
async def seed_data(force: bool = False):
    """Seed Sept-Dec 2026 data from workbook. Idempotent unless force=True."""
    existing = await db.months.count_documents({})
    if existing > 0 and not force:
        return {"seeded": False, "reason": "already seeded", "months": existing}

    if force:
        await db.months.delete_many({})
        await db.paychecks.delete_many({})
        await db.bills.delete_many({})

    # Insert months
    months_docs = [Month(**m).model_dump() for m in SEED_MONTHS]
    await db.months.insert_many([{**d} for d in months_docs])

    # Insert paychecks with cycle colors
    paycheck_docs = []
    for p in SEED_PAYCHECKS:
        pc = Paycheck(
            **p,
            color_cycle=_cycle(p["number"]),
        )
        paycheck_docs.append(pc.model_dump())
    await db.paychecks.insert_many([{**d} for d in paycheck_docs])

    # Insert bills - lookup paycheck by month_key + number
    bill_docs = []
    for (mkey, num), items in SEED_BILLS_BY_PAYCHECK.items():
        matching = next((pc for pc in paycheck_docs if pc["month_key"] == mkey and pc["number"] == num), None)
        if not matching:
            continue
        for name, amount, fraction in items:
            b = BillItem(
                paycheck_id=matching["id"],
                month_key=mkey,
                name=name,
                amount=amount,
                fraction=fraction,
            )
            bill_docs.append(b.model_dump())
    if bill_docs:
        await db.bills.insert_many([{**d} for d in bill_docs])

    return {
        "seeded": True,
        "months": len(months_docs),
        "paychecks": len(paycheck_docs),
        "bills": len(bill_docs),
    }


@api_router.get("/months")
async def list_months():
    months = await db.months.find({}, {"_id": 0}).sort("key", 1).to_list(100)
    result = []
    for m in months:
        paychecks = await db.paychecks.find({"month_key": m["key"]}, {"_id": 0}).to_list(50)
        total_income = sum(p["total_cash"] for p in paychecks)
        total_expenses = sum(
            p["vehicle_payment"] + p["targeted_payoffs"] + p["current_month_bills"] + p["next_month_early_bills"] + p["living_costs"]
            for p in paychecks
        )
        total_saved = sum(p["savings_transfer"] for p in paychecks)
        total_buffer = sum(p["unallocated_buffer"] for p in paychecks)
        result.append({
            **m,
            "total_income": round(total_income, 2),
            "total_expenses": round(total_expenses, 2),
            "total_saved": round(total_saved, 2),
            "total_buffer": round(total_buffer, 2),
            "paycheck_count": len(paychecks),
            "savings_rate": round((total_saved / total_income * 100) if total_income else 0, 1),
        })
    return result


@api_router.get("/months/{key}")
async def get_month(key: str):
    month = await db.months.find_one({"key": key}, {"_id": 0})
    if not month:
        raise HTTPException(404, "Month not found")
    paychecks = await db.paychecks.find({"month_key": key}, {"_id": 0}).sort("number", 1).to_list(50)
    return {**month, "paychecks": paychecks}


@api_router.get("/paychecks/{paycheck_id}")
async def get_paycheck(paycheck_id: str):
    pc = await db.paychecks.find_one({"id": paycheck_id}, {"_id": 0})
    if not pc:
        raise HTTPException(404, "Paycheck not found")
    bills = await db.bills.find({"paycheck_id": paycheck_id}, {"_id": 0}).to_list(200)
    return {**pc, "bills": bills}


@api_router.patch("/paychecks/{paycheck_id}")
async def update_paycheck(paycheck_id: str, req: UpdatePaycheckSpendingReq):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    result = await db.paychecks.update_one({"id": paycheck_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(404, "Paycheck not found")
    pc = await db.paychecks.find_one({"id": paycheck_id}, {"_id": 0})
    return pc


@api_router.patch("/bills/{bill_id}")
async def update_bill(bill_id: str, req: UpdateBillReq):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields")
    result = await db.bills.update_one({"id": bill_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(404, "Bill not found")
    b = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    return b


@api_router.get("/summary")
async def get_summary():
    """Overall YTD summary across all months."""
    paychecks = await db.paychecks.find({}, {"_id": 0}).to_list(500)
    bills = await db.bills.find({}, {"_id": 0}).to_list(2000)
    total_income = sum(p["total_cash"] for p in paychecks)
    total_expenses = sum(
        p["vehicle_payment"] + p["targeted_payoffs"] + p["current_month_bills"] + p["next_month_early_bills"] + p["living_costs"]
        for p in paychecks
    )
    total_saved = sum(p["savings_transfer"] for p in paychecks)
    total_buffer = sum(p["unallocated_buffer"] for p in paychecks)
    bills_paid = sum(1 for b in bills if b.get("paid"))
    return {
        "ytd_income": round(total_income, 2),
        "ytd_spent": round(total_expenses, 2),
        "ytd_saved": round(total_saved, 2),
        "total_buffer": round(total_buffer, 2),
        "bills_paid": bills_paid,
        "bills_total": len(bills),
        "savings_rate": round((total_saved / total_income * 100) if total_income else 0, 1),
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup_seed():
    """Auto-seed on first launch."""
    try:
        existing = await db.months.count_documents({})
        if existing == 0:
            logger.info("Auto-seeding paycheck planner data...")
            # replicate seed_data logic
            months_docs = [Month(**m).model_dump() for m in SEED_MONTHS]
            await db.months.insert_many([{**d} for d in months_docs])
            paycheck_docs = []
            for p in SEED_PAYCHECKS:
                pc = Paycheck(**p, color_cycle=_cycle(p["number"]))
                paycheck_docs.append(pc.model_dump())
            await db.paychecks.insert_many([{**d} for d in paycheck_docs])
            bill_docs = []
            for (mkey, num), items in SEED_BILLS_BY_PAYCHECK.items():
                matching = next((pc for pc in paycheck_docs if pc["month_key"] == mkey and pc["number"] == num), None)
                if not matching:
                    continue
                for name, amount, fraction in items:
                    b = BillItem(paycheck_id=matching["id"], month_key=mkey, name=name, amount=amount, fraction=fraction)
                    bill_docs.append(b.model_dump())
            if bill_docs:
                await db.bills.insert_many([{**d} for d in bill_docs])
            logger.info(f"Seeded {len(months_docs)} months, {len(paycheck_docs)} paychecks, {len(bill_docs)} bills")
    except Exception as e:
        logger.error(f"Seed failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
