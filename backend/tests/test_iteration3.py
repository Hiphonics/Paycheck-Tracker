"""Iteration 3 tests: full-year months, savings recommendation bug fix, goals CRUD, streak."""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Years / months full-year scaffolding ----------
class TestYearsAndMonths:
    def test_list_years(self, s):
        r = s.get(f"{API}/years", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("years"), list)
        assert 2026 in data["years"]

    def test_ensure_year_idempotent(self, s):
        r1 = s.post(f"{API}/months/ensure-year?year=2026", timeout=15)
        r2 = s.post(f"{API}/months/ensure-year?year=2026", timeout=15)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["ok"] and r2.json()["ok"]

    def test_ensure_year_out_of_range(self, s):
        r = s.post(f"{API}/months/ensure-year?year=1500", timeout=15)
        assert r.status_code == 400

    def test_months_year_returns_12_with_template_flag(self, s):
        r = s.get(f"{API}/months?year=2026", timeout=15)
        assert r.status_code == 200
        months = r.json()
        assert len(months) == 12
        keys = [m["key"] for m in months]
        assert keys == [f"2026-{i:02d}" for i in range(1, 13)]
        # Jan-Aug should be template (no paychecks)
        for m in months[:8]:
            assert m["is_template"] is True
            assert m["paycheck_count"] == 0
        # Sept-Dec should have paychecks
        for m in months[8:]:
            assert m["is_template"] is False
            assert m["paycheck_count"] > 0


# ---------- Savings recommendation bug fix ----------
class TestSavingsRecommendation:
    def _sept_paycheck_3(self, s):
        m = s.get(f"{API}/months/2026-09", timeout=15).json()
        return next(p for p in m["paychecks"] if p["number"] == 3)

    def test_recommendation_nonzero_for_buffer_paycheck(self, s):
        pc = self._sept_paycheck_3(s)
        r = s.get(f"{API}/paychecks/{pc['id']}/savings-recommendation", timeout=15)
        assert r.status_code == 200
        d = r.json()
        # This paycheck has a large unallocated_buffer, so net_after_obligations > 0
        assert d["net_after_obligations"] > 0
        # Bug was: unpaid_bills was subtracted from net -> 0. Verify it's NOT double-subtracted.
        # net_after_obligations should equal total_cash - fixed_obligations.
        expected_net = round(d["total_cash"] - d["fixed_obligations"], 2)
        assert abs(d["net_after_obligations"] - expected_net) < 0.01
        # Recommendations non-zero
        assert d["recommendations"]["balanced"] > 0
        assert d["recommendations"]["aggressive"] > d["recommendations"]["conservative"]

    def test_recommendation_returns_presets(self, s):
        pc = self._sept_paycheck_3(s)
        r = s.get(f"{API}/paychecks/{pc['id']}/savings-recommendation", timeout=15).json()
        presets = r["presets"]
        assert isinstance(presets, list)
        # Should contain numeric presets, filtered to <= net
        assert all(isinstance(p, (int, float)) for p in presets)
        assert all(p <= r["net_after_obligations"] + 0.01 for p in presets)

    def test_recommendation_not_found(self, s):
        r = s.get(f"{API}/paychecks/does-not-exist/savings-recommendation", timeout=15)
        assert r.status_code == 404


# ---------- Goals CRUD ----------
class TestGoals:
    _created_ids: list = []

    def test_create_and_list_goal(self, s):
        r = s.post(f"{API}/goals", json={
            "name": "TEST_Car Fund",
            "target_amount": 5000,
            "icon": "car-outline",
            "color": "cycleBlue",
        }, timeout=15)
        assert r.status_code == 200
        g = r.json()
        assert g["name"] == "TEST_Car Fund"
        assert g["target_amount"] == 5000
        assert g["current_amount"] == 0
        assert "id" in g
        TestGoals._created_ids.append(g["id"])

        # Verify listing includes it
        lst = s.get(f"{API}/goals", timeout=15).json()
        assert any(x["id"] == g["id"] for x in lst)

    def test_update_goal(self, s):
        gid = TestGoals._created_ids[0]
        r = s.patch(f"{API}/goals/{gid}", json={"target_amount": 7500}, timeout=15)
        assert r.status_code == 200
        # Verify persistence via list
        lst = s.get(f"{API}/goals", timeout=15).json()
        got = next(x for x in lst if x["id"] == gid)
        assert got["target_amount"] == 7500

    def test_contribute_to_goal(self, s):
        gid = TestGoals._created_ids[0]
        r = s.post(f"{API}/goals/{gid}/contribute", json={"amount": 150.25, "note": "TEST"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["goal"]["current_amount"] == 150.25
        assert d["contribution"]["amount"] == 150.25
        # Another contribution accumulates
        r2 = s.post(f"{API}/goals/{gid}/contribute", json={"amount": 50}, timeout=15).json()
        assert r2["goal"]["current_amount"] == 200.25

    def test_contribute_not_found(self, s):
        r = s.post(f"{API}/goals/does-not-exist/contribute", json={"amount": 10}, timeout=15)
        assert r.status_code == 404

    def test_delete_goal(self, s):
        gid = TestGoals._created_ids[0]
        r = s.delete(f"{API}/goals/{gid}", timeout=15)
        assert r.status_code == 200
        # Verify gone
        lst = s.get(f"{API}/goals", timeout=15).json()
        assert not any(x["id"] == gid for x in lst)
        TestGoals._created_ids.clear()


# ---------- Streak ----------
class TestStreak:
    def test_streak_shape(self, s):
        r = s.get(f"{API}/streak", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for key in ("current_streak", "best_streak", "ytd_saved", "message", "monthly_saved"):
            assert key in d
        assert isinstance(d["monthly_saved"], list)
        # Best streak should be >= current_streak (or equal)
        assert d["best_streak"] >= d["current_streak"]
        # ytd_saved should be a number >= 0
        assert d["ytd_saved"] >= 0
        # monthly_saved entries have key + amount
        for entry in d["monthly_saved"]:
            assert "key" in entry and "amount" in entry


# ---------- Regression: existing endpoints ----------
class TestRegression:
    def test_seed_idempotent(self, s):
        r = s.post(f"{API}/seed", timeout=30)
        assert r.status_code == 200
        # Once seeded, calling again returns seeded=False
        assert r.json()["seeded"] is False

    def test_summary_endpoint(self, s):
        r = s.get(f"{API}/summary", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for f in ("ytd_income", "ytd_spent", "ytd_saved", "bills_total", "savings_rate"):
            assert f in d
        assert d["ytd_income"] > 0

    def test_month_detail_still_works(self, s):
        r = s.get(f"{API}/months/2026-09", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["key"] == "2026-09"
        assert len(d["paychecks"]) == 3

    def test_bills_list(self, s):
        r = s.get(f"{API}/bills?month_key=2026-09", timeout=15)
        assert r.status_code == 200
        assert len(r.json()) > 0
