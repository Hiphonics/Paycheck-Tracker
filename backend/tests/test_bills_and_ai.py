"""Iteration 2 tests: bills CRUD, recurring generator, savings rec, AI advice, regression."""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def s():
    ss = requests.Session()
    ss.headers.update({"Content-Type": "application/json"})
    return ss


@pytest.fixture(scope="module")
def sept_paycheck(s):
    r = s.get(f"{BASE_URL}/api/months/2026-09")
    assert r.status_code == 200
    return r.json()["paychecks"][0]


# --- Regression ---
class TestRegression:
    def test_seed_idempotent(self, s):
        r = s.post(f"{BASE_URL}/api/seed")
        assert r.status_code == 200
        assert r.json()["seeded"] is False

    def test_months(self, s):
        r = s.get(f"{BASE_URL}/api/months")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 4

    def test_month_detail_has_start_end_dates(self, s):
        r = s.get(f"{BASE_URL}/api/months/2026-09")
        assert r.status_code == 200
        pcs = r.json()["paychecks"]
        assert len(pcs) > 0
        for p in pcs:
            assert p.get("start_date"), f"paycheck {p['number']} missing start_date"
            assert p.get("end_date"), f"paycheck {p['number']} missing end_date"

    def test_summary(self, s):
        r = s.get(f"{BASE_URL}/api/summary")
        assert r.status_code == 200
        d = r.json()
        assert d["bills_total"] >= 100


# --- Bill CRUD ---
class TestBillCRUD:
    def test_create_and_verify(self, s, sept_paycheck):
        payload = {
            "month_key": "2026-09",
            "name": "TEST_Bill_Create",
            "amount": 42.50,
            "due_date": "2026-09-12",
            "recurrence": "none",
            "category": "bill",
        }
        r = s.post(f"{BASE_URL}/api/bills", json=payload)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["name"] == "TEST_Bill_Create"
        assert b["amount"] == 42.50
        assert b["paycheck_id"], "should auto-assign paycheck by due_date"
        # verify persistence
        rr = s.get(f"{BASE_URL}/api/bills?month_key=2026-09")
        assert rr.status_code == 200
        ids = [x["id"] for x in rr.json()]
        assert b["id"] in ids
        # cleanup
        s.delete(f"{BASE_URL}/api/bills/{b['id']}")

    def test_patch(self, s):
        create = s.post(f"{BASE_URL}/api/bills", json={
            "month_key": "2026-09", "name": "TEST_Patch", "amount": 10.0,
            "due_date": "2026-09-15", "recurrence": "none", "category": "bill",
        }).json()
        r = s.patch(f"{BASE_URL}/api/bills/{create['id']}", json={"name": "TEST_Patched", "amount": 99.99, "category": "subscription"})
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "TEST_Patched"
        assert d["amount"] == 99.99
        assert d["category"] == "subscription"
        s.delete(f"{BASE_URL}/api/bills/{create['id']}")

    def test_delete(self, s):
        create = s.post(f"{BASE_URL}/api/bills", json={
            "month_key": "2026-09", "name": "TEST_Del", "amount": 5.0,
            "due_date": "2026-09-20", "recurrence": "none", "category": "bill",
        }).json()
        r = s.delete(f"{BASE_URL}/api/bills/{create['id']}")
        assert r.status_code == 200
        assert r.json()["deleted"] is True
        # verify 404
        r2 = s.delete(f"{BASE_URL}/api/bills/{create['id']}")
        assert r2.status_code == 404

    def test_list_by_month(self, s):
        r = s.get(f"{BASE_URL}/api/bills?month_key=2026-09")
        assert r.status_code == 200
        rows = r.json()
        assert all(b["month_key"] == "2026-09" for b in rows)


# --- Recurring generator ---
class TestRecurring:
    def test_generate_monthly(self, s):
        r = s.post(f"{BASE_URL}/api/bills/generate", json={
            "name": "TEST_Rent_Series",
            "amount": 350.0,
            "recurrence": "monthly",
            "start_date": "2026-09-01",
            "occurrences": 4,
            "fraction_prefix": True,
            "category": "bill",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        series_id = data["series_id"]
        bills = data["bills"]
        assert len(bills) >= 3, f"expected >=3 bills, got {len(bills)}"
        # fractions
        fracs = [b["fraction"] for b in bills]
        assert fracs[0] == "1of4"
        # all have same series_id
        assert all(b["series_id"] == series_id for b in bills)
        # each linked to a paycheck
        assert all(b["paycheck_id"] for b in bills)
        # due dates spaced (~1 month)
        assert bills[0]["due_date"] == "2026-09-01"
        assert bills[1]["due_date"] == "2026-10-01"
        # cleanup
        r2 = s.delete(f"{BASE_URL}/api/bills/series/{series_id}")
        assert r2.status_code == 200
        assert r2.json()["deleted"] >= len(bills)

    def test_generate_weekly(self, s):
        r = s.post(f"{BASE_URL}/api/bills/generate", json={
            "name": "TEST_Weekly",
            "amount": 20.0,
            "recurrence": "weekly",
            "start_date": "2026-09-10",
            "occurrences": 4,
            "category": "subscription",
        })
        assert r.status_code == 200
        data = r.json()
        bills = data["bills"]
        assert len(bills) >= 3
        # weekly spacing
        if len(bills) >= 2:
            assert bills[0]["due_date"] == "2026-09-10"
            assert bills[1]["due_date"] == "2026-09-17"
        s.delete(f"{BASE_URL}/api/bills/series/{data['series_id']}")

    def test_generate_biweekly(self, s):
        r = s.post(f"{BASE_URL}/api/bills/generate", json={
            "name": "TEST_Biweekly",
            "amount": 30.0,
            "recurrence": "biweekly",
            "start_date": "2026-09-10",
            "occurrences": 3,
            "category": "bill",
        })
        assert r.status_code == 200
        data = r.json()
        bills = data["bills"]
        if len(bills) >= 2:
            assert bills[1]["due_date"] == "2026-09-24"
        s.delete(f"{BASE_URL}/api/bills/series/{data['series_id']}")

    def test_generate_invalid(self, s):
        r = s.post(f"{BASE_URL}/api/bills/generate", json={
            "name": "X", "amount": 1, "recurrence": "yearly",
            "start_date": "2026-09-01", "occurrences": 3,
        })
        assert r.status_code == 400


# --- Savings + AI ---
class TestSavingsAndAI:
    def test_savings_recommendation(self, s, sept_paycheck):
        r = s.get(f"{BASE_URL}/api/paychecks/{sept_paycheck['id']}/savings-recommendation")
        assert r.status_code == 200
        d = r.json()
        assert "recommendations" in d
        rec = d["recommendations"]
        assert "conservative" in rec and "balanced" in rec and "aggressive" in rec
        # ordering
        assert rec["conservative"] <= rec["balanced"] <= rec["aggressive"]
        assert d["total_cash"] == sept_paycheck["total_cash"]

    def test_patch_savings_transfer(self, s, sept_paycheck):
        original = sept_paycheck["savings_transfer"]
        r = s.patch(f"{BASE_URL}/api/paychecks/{sept_paycheck['id']}", json={"savings_transfer": 250.75})
        assert r.status_code == 200
        d = r.json()
        assert d["savings_transfer"] == 250.75
        # revert
        s.patch(f"{BASE_URL}/api/paychecks/{sept_paycheck['id']}", json={"savings_transfer": original})

    def test_ai_advice(self, s, sept_paycheck):
        r = s.post(f"{BASE_URL}/api/paychecks/{sept_paycheck['id']}/ai-advice", timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        # should contain at least summary or raw
        assert isinstance(d, dict)
        assert ("summary" in d or "raw" in d)
        # priority_order and recommended_savings if parsed
        if "priority_order" in d and d["priority_order"]:
            assert isinstance(d["priority_order"], list)
            for it in d["priority_order"][:3]:
                assert "name" in it and "amount" in it
