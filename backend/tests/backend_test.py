"""Backend tests for Paycheck Planner API"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://budget-paycheck-21.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Seed ----------
class TestSeed:
    def test_seed_idempotent(self, s):
        r = s.post(f"{API}/seed", timeout=30)
        assert r.status_code == 200
        data = r.json()
        # Already auto-seeded on startup
        assert data.get("seeded") is False
        assert data.get("reason") == "already seeded"
        assert data.get("months") == 4


# ---------- Months ----------
class TestMonths:
    def test_list_months_returns_four(self, s):
        r = s.get(f"{API}/months", timeout=15)
        assert r.status_code == 200
        months = r.json()
        assert len(months) == 4
        keys = [m["key"] for m in months]
        assert keys == ["2026-09", "2026-10", "2026-11", "2026-12"]

    def test_month_computed_fields(self, s):
        r = s.get(f"{API}/months", timeout=15)
        months = {m["key"]: m for m in r.json()}
        sept = months["2026-09"]
        # Sept: 1476+1300+1300 = 4076
        assert sept["total_income"] == 4076.0
        assert sept["paycheck_count"] == 3
        for field in ("total_expenses", "total_saved", "total_buffer", "savings_rate"):
            assert field in sept

    def test_get_month_2026_09(self, s):
        r = s.get(f"{API}/months/2026-09", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["key"] == "2026-09"
        pcs = data["paychecks"]
        assert len(pcs) == 3
        # Ordered by number
        assert [p["number"] for p in pcs] == [1, 2, 3]
        # Cycle colors
        assert pcs[0]["color_cycle"] == "cycleBlue"
        assert pcs[1]["color_cycle"] == "cyclePurple"

    def test_get_month_not_found(self, s):
        r = s.get(f"{API}/months/2099-99", timeout=15)
        assert r.status_code == 404


# ---------- Paychecks ----------
class TestPaychecks:
    def test_get_paycheck_with_bills(self, s):
        m = s.get(f"{API}/months/2026-09", timeout=15).json()
        pid = m["paychecks"][0]["id"]
        r = s.get(f"{API}/paychecks/{pid}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == pid
        assert "bills" in data
        assert len(data["bills"]) == 9  # Sept paycheck 1 has 9 bills

    def test_update_paycheck_spending(self, s):
        m = s.get(f"{API}/months/2026-09", timeout=15).json()
        pid = m["paychecks"][0]["id"]
        r = s.patch(
            f"{API}/paychecks/{pid}",
            json={"weekly_desired_spending": 175.5, "weekly_target_spending": 250},
            timeout=15,
        )
        assert r.status_code == 200
        # Verify persistence via GET
        got = s.get(f"{API}/paychecks/{pid}", timeout=15).json()
        assert got["weekly_desired_spending"] == 175.5
        assert got["weekly_target_spending"] == 250

    def test_update_paycheck_not_found(self, s):
        r = s.patch(f"{API}/paychecks/does-not-exist", json={"weekly_desired_spending": 10}, timeout=15)
        assert r.status_code == 404


# ---------- Bills ----------
class TestBills:
    def test_toggle_bill_paid(self, s):
        m = s.get(f"{API}/months/2026-09", timeout=15).json()
        pid = m["paychecks"][0]["id"]
        pc = s.get(f"{API}/paychecks/{pid}", timeout=15).json()
        bid = pc["bills"][0]["id"]
        initial = pc["bills"][0]["paid"]

        r = s.patch(f"{API}/bills/{bid}", json={"paid": not initial}, timeout=15)
        assert r.status_code == 200
        # Verify
        pc2 = s.get(f"{API}/paychecks/{pid}", timeout=15).json()
        toggled = next(b for b in pc2["bills"] if b["id"] == bid)
        assert toggled["paid"] == (not initial)

        # Reset
        s.patch(f"{API}/bills/{bid}", json={"paid": initial}, timeout=15)


# ---------- Summary ----------
class TestSummary:
    def test_ytd_summary(self, s):
        r = s.get(f"{API}/summary", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["ytd_income"] == 22276.0
        assert data["bills_total"] == 100
        for f in ("ytd_spent", "ytd_saved", "total_buffer", "bills_paid", "savings_rate"):
            assert f in data
