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
from datetime import datetime, timezone, timedelta
import json


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class BillItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    paycheck_id: str
    month_key: str
    name: str
    amount: float
    fraction: Optional[str] = None
    paid: bool = False
    due_date: Optional[str] = None  # ISO YYYY-MM-DD
    recurrence: str = "none"  # none | weekly | biweekly | monthly
    series_id: Optional[str] = None
    category: str = "bill"  # bill | subscription | debt | living


class Paycheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    month_key: str
    number: int
    date_range: str
    color_cycle: str
    total_cash: float
    vehicle_payment: float = 0
    targeted_payoffs: float = 0
    current_month_bills: float = 0
    next_month_early_bills: float = 0
    living_costs: float = 300
    savings_transfer: float = 0
    unallocated_buffer: float = 0
    weekly_desired_spending: float = 0
    weekly_target_spending: float = 300
    starting_cash: float = 0
    start_date: Optional[str] = None  # ISO YYYY-MM-DD
    end_date: Optional[str] = None    # ISO YYYY-MM-DD


class Month(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    key: str
    name: str
    year: int
    month: int
    starting_buffer: float = 0
    notes: str = ""


class CreateBillReq(BaseModel):
    paycheck_id: Optional[str] = None
    month_key: str
    name: str
    amount: float
    fraction: Optional[str] = None
    due_date: Optional[str] = None
    recurrence: str = "none"
    category: str = "bill"


class UpdateBillReq(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    paid: Optional[bool] = None
    due_date: Optional[str] = None
    recurrence: Optional[str] = None
    category: Optional[str] = None
    paycheck_id: Optional[str] = None


class GenerateRecurringReq(BaseModel):
    name: str
    amount: float
    category: str = "bill"
    recurrence: str  # weekly | biweekly | monthly
    start_date: str  # ISO YYYY-MM-DD
    occurrences: int = 12
    fraction_prefix: bool = True  # write "1of12", "2of12" ...


class UpdatePaycheckSpendingReq(BaseModel):
    weekly_desired_spending: Optional[float] = None
    weekly_target_spending: Optional[float] = None
    savings_transfer: Optional[float] = None


class SavingsGoal(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    target_amount: float
    current_amount: float = 0
    icon: str = "wallet"  # ionicons name
    color: str = "cycleBlue"
    target_date: Optional[str] = None
    notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class CreateGoalReq(BaseModel):
    name: str
    target_amount: float
    icon: str = "wallet"
    color: str = "cycleBlue"
    target_date: Optional[str] = None
    notes: str = ""


class UpdateGoalReq(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    current_amount: Optional[float] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    target_date: Optional[str] = None
    notes: Optional[str] = None


class ContributeReq(BaseModel):
    amount: float
    note: Optional[str] = None


# ---------- Seed data (unchanged) ----------
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
    {"month_key": "2026-09", "number": 1, "date_range": "Sept 10 – Sept 16", "start_date": "2026-09-10", "end_date": "2026-09-16", "total_cash": 1476, "vehicle_payment": 690, "targeted_payoffs": 649.40, "current_month_bills": 441.60, "living_costs": 300, "savings_transfer": 100, "unallocated_buffer": 168, "starting_cash": 705},
    {"month_key": "2026-09", "number": 2, "date_range": "Sept 17 – Sept 23", "start_date": "2026-09-17", "end_date": "2026-09-23", "total_cash": 1300, "vehicle_payment": 690, "targeted_payoffs": 0, "current_month_bills": 706.88, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 0},
    {"month_key": "2026-09", "number": 3, "date_range": "Sept 24 – Sept 30", "start_date": "2026-09-24", "end_date": "2026-09-30", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 629.55, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 400, "unallocated_buffer": 206.5},
    {"month_key": "2026-10", "number": 1, "date_range": "Oct 1 – Oct 7", "start_date": "2026-10-01", "end_date": "2026-10-07", "total_cash": 1300, "vehicle_payment": 690, "targeted_payoffs": 0, "current_month_bills": 257.05, "living_costs": 300, "savings_transfer": 0, "unallocated_buffer": 200},
    {"month_key": "2026-10", "number": 2, "date_range": "Oct 8 – Oct 14", "start_date": "2026-10-08", "end_date": "2026-10-14", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 402.09, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 0},
    {"month_key": "2026-10", "number": 3, "date_range": "Oct 15 – Oct 21", "start_date": "2026-10-15", "end_date": "2026-10-21", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 493.56, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 0},
    {"month_key": "2026-10", "number": 4, "date_range": "Oct 22 – Oct 28", "start_date": "2026-10-22", "end_date": "2026-10-28", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 37.68, "current_month_bills": 550, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 0},
    {"month_key": "2026-10", "number": 5, "date_range": "Oct 29 – Oct 31", "start_date": "2026-10-29", "end_date": "2026-10-31", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 0, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 800},
    {"month_key": "2026-11", "number": 1, "date_range": "Nov 5 – Nov 11", "start_date": "2026-11-05", "end_date": "2026-11-11", "total_cash": 1300, "vehicle_payment": 690, "targeted_payoffs": 0, "current_month_bills": 183.46, "living_costs": 300, "savings_transfer": 0, "unallocated_buffer": 126.54},
    {"month_key": "2026-11", "number": 2, "date_range": "Nov 12 – Nov 18", "start_date": "2026-11-12", "end_date": "2026-11-18", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 77.72, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 400, "unallocated_buffer": 522.28},
    {"month_key": "2026-11", "number": 3, "date_range": "Nov 19 – Nov 25", "start_date": "2026-11-19", "end_date": "2026-11-25", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 475.5, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 324.5},
    {"month_key": "2026-11", "number": 4, "date_range": "Nov 26 – Dec 2", "start_date": "2026-11-26", "end_date": "2026-12-02", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 176.4, "current_month_bills": 200, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 423.6},
    {"month_key": "2026-12", "number": 1, "date_range": "Dec 3 – Dec 9", "start_date": "2026-12-03", "end_date": "2026-12-09", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 624.9, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 175.1},
    {"month_key": "2026-12", "number": 2, "date_range": "Dec 10 – Dec 16", "start_date": "2026-12-10", "end_date": "2026-12-16", "total_cash": 1300, "vehicle_payment": 690, "targeted_payoffs": 0, "current_month_bills": 108.56, "living_costs": 300, "savings_transfer": 0, "unallocated_buffer": 201.44},
    {"month_key": "2026-12", "number": 3, "date_range": "Dec 17 – Dec 23", "start_date": "2026-12-17", "end_date": "2026-12-23", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 475.5, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 324.5},
    {"month_key": "2026-12", "number": 4, "date_range": "Dec 24 – Dec 30", "start_date": "2026-12-24", "end_date": "2026-12-30", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 103.55, "current_month_bills": 0, "living_costs": 300, "savings_transfer": 400, "unallocated_buffer": 496.45},
    {"month_key": "2026-12", "number": 5, "date_range": "Dec 31 – Jan 6", "start_date": "2026-12-31", "end_date": "2027-01-06", "total_cash": 1300, "vehicle_payment": 0, "targeted_payoffs": 37.68, "current_month_bills": 550, "living_costs": 300, "savings_transfer": 200, "unallocated_buffer": 212.32},
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


# ---------- Helpers ----------
def _month_key_from_date(d: datetime) -> str:
    return f"{d.year:04d}-{d.month:02d}"


async def _find_paycheck_for_date(due: datetime) -> Optional[dict]:
    """Return the paycheck whose start_date <= due <= end_date. Fallback: same month_key first."""
    iso = due.strftime("%Y-%m-%d")
    pc = await db.paychecks.find_one(
        {"start_date": {"$lte": iso}, "end_date": {"$gte": iso}},
        {"_id": 0},
    )
    if pc:
        return pc
    mkey = _month_key_from_date(due)
    return await db.paychecks.find_one({"month_key": mkey}, {"_id": 0}, sort=[("number", 1)])


def _add_recurrence(d: datetime, recurrence: str, i: int) -> datetime:
    if recurrence == "weekly":
        return d + timedelta(days=7 * i)
    if recurrence == "biweekly":
        return d + timedelta(days=14 * i)
    if recurrence == "monthly":
        y = d.year + (d.month - 1 + i) // 12
        m = (d.month - 1 + i) % 12 + 1
        # clamp day
        try:
            return d.replace(year=y, month=m)
        except ValueError:
            # end-of-month clamp
            import calendar
            last = calendar.monthrange(y, m)[1]
            return d.replace(year=y, month=m, day=min(d.day, last))
    return d


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "Paycheck Planner API"}


@api_router.post("/seed")
async def seed_data(force: bool = False):
    existing = await db.months.count_documents({})
    if existing > 0 and not force:
        return {"seeded": False, "reason": "already seeded", "months": existing}

    if force:
        await db.months.delete_many({})
        await db.paychecks.delete_many({})
        await db.bills.delete_many({})

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


MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


async def _ensure_year_months(year: int) -> None:
    """Idempotently create all 12 months for a year so YTD/trend views have full 12-month scaffolding."""
    for month in range(1, 13):
        key = f"{year:04d}-{month:02d}"
        existing = await db.months.find_one({"key": key}, {"_id": 0})
        if not existing:
            m = Month(key=key, name=f"{MONTH_NAMES[month - 1]} {year}", year=year, month=month)
            await db.months.insert_one({**m.model_dump()})


@api_router.post("/months/ensure-year")
async def ensure_year(year: int):
    if year < 2000 or year > 2100:
        raise HTTPException(400, "year out of range")
    await _ensure_year_months(year)
    return {"year": year, "ok": True}


@api_router.get("/years")
async def list_years():
    """Return years present in the DB plus any adjacent years the user might want."""
    docs = await db.months.find({}, {"_id": 0, "year": 1}).to_list(500)
    years = sorted({d["year"] for d in docs})
    if not years:
        years = [datetime.now(timezone.utc).year]
    return {"years": years}


@api_router.get("/months")
async def list_months(year: Optional[int] = None):
    if year is not None:
        await _ensure_year_months(year)
    q: dict = {}
    if year is not None:
        q["year"] = year
    months = await db.months.find(q, {"_id": 0}).sort("key", 1).to_list(200)
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
            "is_template": len(paychecks) == 0,
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
    bills = await db.bills.find({"paycheck_id": paycheck_id}, {"_id": 0}).sort("due_date", 1).to_list(200)
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


# ---------- Bills CRUD ----------
@api_router.get("/bills")
async def list_bills(month_key: Optional[str] = None, paycheck_id: Optional[str] = None):
    q: dict = {}
    if month_key:
        q["month_key"] = month_key
    if paycheck_id:
        q["paycheck_id"] = paycheck_id
    bills = await db.bills.find(q, {"_id": 0}).to_list(2000)
    return bills


@api_router.post("/bills")
async def create_bill(req: CreateBillReq):
    paycheck_id = req.paycheck_id
    if not paycheck_id and req.due_date:
        try:
            d = datetime.strptime(req.due_date, "%Y-%m-%d")
            pc = await _find_paycheck_for_date(d)
            if pc:
                paycheck_id = pc["id"]
        except ValueError:
            pass
    if not paycheck_id:
        # fallback: first paycheck of the month_key
        pc = await db.paychecks.find_one({"month_key": req.month_key}, {"_id": 0}, sort=[("number", 1)])
        if pc:
            paycheck_id = pc["id"]
    if not paycheck_id:
        raise HTTPException(400, "Cannot resolve paycheck for bill")

    b = BillItem(
        paycheck_id=paycheck_id,
        month_key=req.month_key,
        name=req.name,
        amount=req.amount,
        fraction=req.fraction,
        due_date=req.due_date,
        recurrence=req.recurrence,
        category=req.category,
    )
    doc = b.model_dump()
    await db.bills.insert_one({**doc})
    return doc


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


@api_router.delete("/bills/{bill_id}")
async def delete_bill(bill_id: str):
    result = await db.bills.delete_one({"id": bill_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Bill not found")
    return {"deleted": True}


@api_router.post("/bills/generate")
async def generate_recurring(req: GenerateRecurringReq):
    """Create N occurrences of a bill at the specified cadence, auto-assigning each to a paycheck."""
    if req.recurrence not in ("weekly", "biweekly", "monthly"):
        raise HTTPException(400, "recurrence must be weekly | biweekly | monthly")
    if req.occurrences < 1 or req.occurrences > 60:
        raise HTTPException(400, "occurrences must be between 1 and 60")
    try:
        start = datetime.strptime(req.start_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "start_date must be YYYY-MM-DD")

    series_id = str(uuid.uuid4())
    created = []
    for i in range(req.occurrences):
        due = _add_recurrence(start, req.recurrence, i)
        due_iso = due.strftime("%Y-%m-%d")
        mkey = _month_key_from_date(due)
        # ensure month exists (auto-create)
        existing_month = await db.months.find_one({"key": mkey}, {"_id": 0})
        if not existing_month:
            m = Month(
                key=mkey,
                name=due.strftime("%B %Y"),
                year=due.year,
                month=due.month,
            )
            await db.months.insert_one({**m.model_dump()})
        pc = await _find_paycheck_for_date(due)
        if not pc:
            # skip if no paycheck exists yet for that period
            continue
        fraction = f"{i + 1}of{req.occurrences}" if req.fraction_prefix else None
        b = BillItem(
            paycheck_id=pc["id"],
            month_key=mkey,
            name=req.name,
            amount=req.amount,
            fraction=fraction,
            due_date=due_iso,
            recurrence=req.recurrence,
            series_id=series_id,
            category=req.category,
        )
        doc = b.model_dump()
        await db.bills.insert_one({**doc})
        created.append(doc)
    return {"series_id": series_id, "count": len(created), "bills": created}


@api_router.delete("/bills/series/{series_id}")
async def delete_series(series_id: str):
    result = await db.bills.delete_many({"series_id": series_id})
    return {"deleted": result.deleted_count}


# ---------- Summary + AI ----------
@api_router.get("/summary")
async def get_summary():
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


@api_router.get("/paychecks/{paycheck_id}/savings-recommendation")
async def savings_recommendation(paycheck_id: str):
    """Deterministic savings recommendation based on cash net of aggregated obligations.

    We use the paycheck's aggregated allocation buckets (vehicle, payoffs, current-month bills,
    next-month bills, living costs). Individual `bills` records are DETAIL LINES already summed
    into those buckets, so we intentionally do NOT subtract them again (that was the bug that
    made recommendations return $0)."""
    pc = await db.paychecks.find_one({"id": paycheck_id}, {"_id": 0})
    if not pc:
        raise HTTPException(404, "Paycheck not found")
    bills = await db.bills.find({"paycheck_id": paycheck_id}, {"_id": 0}).to_list(200)
    unpaid_bills_total = sum(b["amount"] for b in bills if not b.get("paid"))
    fixed = (
        pc["vehicle_payment"] + pc["targeted_payoffs"] + pc["current_month_bills"]
        + pc["next_month_early_bills"] + pc["living_costs"]
    )
    net_after_fixed = max(0.0, pc["total_cash"] - fixed)
    conservative = round(net_after_fixed * 0.10, 2)
    balanced = round(net_after_fixed * 0.20, 2)
    aggressive = round(net_after_fixed * 0.35, 2)
    # Quick preset amounts users typically pick
    presets = [25, 50, 100, 200, 300, 500]
    presets = [p for p in presets if p <= net_after_fixed + 0.01]
    return {
        "paycheck_id": paycheck_id,
        "total_cash": pc["total_cash"],
        "fixed_obligations": round(fixed, 2),
        "unpaid_bills": round(unpaid_bills_total, 2),
        "net_after_obligations": round(net_after_fixed, 2),
        "current_savings_transfer": pc.get("savings_transfer", 0),
        "presets": presets,
        "recommendations": {
            "conservative": conservative,
            "balanced": balanced,
            "aggressive": aggressive,
        },
    }


@api_router.post("/paychecks/{paycheck_id}/ai-advice")
async def ai_advice(paycheck_id: str):
    """Ask Claude what to pay with this paycheck. Returns structured JSON."""
    pc = await db.paychecks.find_one({"id": paycheck_id}, {"_id": 0})
    if not pc:
        raise HTTPException(404, "Paycheck not found")
    bills = await db.bills.find({"paycheck_id": paycheck_id}, {"_id": 0}).to_list(200)

    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI not configured")

    from emergentintegrations.llm.chat import LlmChat, UserMessage

    bill_lines = "\n".join(
        f"- {b['name']}: ${b['amount']:.2f}"
        + (f" ({b['fraction']})" if b.get("fraction") else "")
        + (f" [PAID]" if b.get("paid") else "")
        + (f" due {b['due_date']}" if b.get("due_date") else "")
        for b in bills
    ) or "(no bills yet)"

    sys_msg = (
        "You are a personal finance coach helping a user allocate one paycheck. "
        "Return STRICT JSON with keys: priority_order (array of {name, amount, reason}), "
        "recommended_savings (number), buffer_after (number), summary (short string, <=200 chars). "
        "Consider: pay fixed obligations first (vehicle, rent, utilities), then targeted debt payoffs, "
        "then variable bills, keep living costs intact, and always leave a positive buffer if possible."
    )
    user_msg = (
        f"Paycheck #{pc['number']} ({pc['date_range']}) — total cash ${pc['total_cash']:.2f}.\n"
        f"Fixed allocations:\n"
        f"  Vehicle payment: ${pc['vehicle_payment']:.2f}\n"
        f"  Targeted payoffs: ${pc['targeted_payoffs']:.2f}\n"
        f"  Current month bills: ${pc['current_month_bills']:.2f}\n"
        f"  Next month early bills: ${pc['next_month_early_bills']:.2f}\n"
        f"  Living costs: ${pc['living_costs']:.2f}\n"
        f"  Current savings transfer: ${pc['savings_transfer']:.2f}\n"
        f"  Unallocated buffer: ${pc['unallocated_buffer']:.2f}\n\n"
        f"Bills to pay this cycle:\n{bill_lines}\n\n"
        "Respond with JSON only, no prose."
    )

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"paycheck-advice-{paycheck_id}",
        system_message=sys_msg,
    ).with_model("anthropic", "claude-sonnet-4-6")

    try:
        response = await chat.send_message(UserMessage(text=user_msg))
    except Exception as e:
        logger.error(f"AI advice failed: {e}")
        raise HTTPException(502, f"AI request failed: {e}")

    # response is text; strip code fences if present and parse JSON
    text = response.strip() if isinstance(response, str) else str(response)
    if text.startswith("```"):
        text = text.strip("`")
        # remove language tag
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        data = json.loads(text)
    except Exception:
        # return raw text if unparseable
        return {"raw": text, "priority_order": [], "recommended_savings": None, "summary": text[:400]}
    return data


# ---------- Savings Goals ----------
@api_router.get("/goals")
async def list_goals():
    goals = await db.savings_goals.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return goals


@api_router.post("/goals")
async def create_goal(req: CreateGoalReq):
    g = SavingsGoal(**req.model_dump())
    doc = g.model_dump()
    await db.savings_goals.insert_one({**doc})
    return doc


@api_router.patch("/goals/{goal_id}")
async def update_goal(goal_id: str, req: UpdateGoalReq):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields")
    result = await db.savings_goals.update_one({"id": goal_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(404, "Goal not found")
    g = await db.savings_goals.find_one({"id": goal_id}, {"_id": 0})
    return g


@api_router.delete("/goals/{goal_id}")
async def delete_goal(goal_id: str):
    result = await db.savings_goals.delete_one({"id": goal_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Goal not found")
    return {"deleted": True}


@api_router.post("/goals/{goal_id}/contribute")
async def contribute_to_goal(goal_id: str, req: ContributeReq):
    g = await db.savings_goals.find_one({"id": goal_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Goal not found")
    new_amount = round(g["current_amount"] + req.amount, 2)
    await db.savings_goals.update_one({"id": goal_id}, {"$set": {"current_amount": new_amount}})
    contrib = {
        "id": str(uuid.uuid4()),
        "goal_id": goal_id,
        "amount": req.amount,
        "note": req.note or "",
        "at": datetime.now(timezone.utc).isoformat(),
    }
    await db.goal_contributions.insert_one({**contrib})
    updated = await db.savings_goals.find_one({"id": goal_id}, {"_id": 0})
    return {"goal": updated, "contribution": contrib}


# ---------- Savings Streak ----------
@api_router.get("/streak")
async def savings_streak():
    """A "savings streak" is the number of consecutive most-recent months (including current)
    where at least one paycheck had savings_transfer > 0 OR total_saved > 0.
    Also returns the best (longest) streak in DB history."""
    months = await db.months.find({}, {"_id": 0}).sort("key", -1).to_list(200)
    # Build a map month_key -> total_saved
    month_saved: dict[str, float] = {}
    for m in months:
        paychecks = await db.paychecks.find({"month_key": m["key"]}, {"_id": 0}).to_list(50)
        month_saved[m["key"]] = sum(p.get("savings_transfer", 0) for p in paychecks)

    # Consider months up to the current month (in UTC) to compute the "current" streak
    now = datetime.now(timezone.utc)
    current_key = f"{now.year:04d}-{now.month:02d}"

    # Order keys descending starting at current_key or the latest month <= now
    ordered = sorted(month_saved.keys())  # ascending
    ordered = [k for k in ordered if k <= current_key]
    ordered_desc = list(reversed(ordered))

    current_streak = 0
    for k in ordered_desc:
        if month_saved.get(k, 0) > 0:
            current_streak += 1
        else:
            break

    # Best streak across all months in DB
    best = 0
    running = 0
    for k in sorted(month_saved.keys()):
        if month_saved.get(k, 0) > 0:
            running += 1
            best = max(best, running)
        else:
            running = 0

    # Motivational message
    total_saved_ytd = sum(month_saved.get(k, 0) for k in month_saved if k.startswith(f"{now.year}-"))
    if current_streak >= 3:
        message = f"🔥 {current_streak}-month savings streak — keep it going!"
    elif current_streak == 0:
        message = "Set aside anything above $0 this month to start a streak."
    else:
        message = f"You're on a {current_streak}-month streak. One more to double it."

    return {
        "current_streak": current_streak,
        "best_streak": best,
        "ytd_saved": round(total_saved_ytd, 2),
        "message": message,
        "monthly_saved": [{"key": k, "amount": round(v, 2)} for k, v in sorted(month_saved.items())],
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
    try:
        existing = await db.months.count_documents({})
        if existing == 0:
            logger.info("Auto-seeding paycheck planner data...")
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
        else:
            for p in SEED_PAYCHECKS:
                await db.paychecks.update_one(
                    {"month_key": p["month_key"], "number": p["number"], "$or": [{"start_date": None}, {"start_date": {"$exists": False}}]},
                    {"$set": {"start_date": p["start_date"], "end_date": p["end_date"]}},
                )
        # Always ensure current year + 2026 have all 12 months (idempotent)
        this_year = datetime.now(timezone.utc).year
        await _ensure_year_months(2026)
        if this_year != 2026:
            await _ensure_year_months(this_year)
    except Exception as e:
        logger.error(f"Seed failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
