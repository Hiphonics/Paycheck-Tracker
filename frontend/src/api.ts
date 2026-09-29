const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export type MonthSummary = {
  id: string;
  key: string;
  name: string;
  year: number;
  month: number;
  total_income: number;
  total_expenses: number;
  total_saved: number;
  total_buffer: number;
  paycheck_count: number;
  savings_rate: number;
};

export type Paycheck = {
  id: string;
  month_key: string;
  number: number;
  date_range: string;
  color_cycle: string;
  total_cash: number;
  vehicle_payment: number;
  targeted_payoffs: number;
  current_month_bills: number;
  next_month_early_bills: number;
  living_costs: number;
  savings_transfer: number;
  unallocated_buffer: number;
  weekly_desired_spending: number;
  weekly_target_spending: number;
  starting_cash: number;
};

export type Bill = {
  id: string;
  paycheck_id: string;
  month_key: string;
  name: string;
  amount: number;
  fraction?: string | null;
  paid: boolean;
};

export type PaycheckWithBills = Paycheck & { bills: Bill[] };
export type MonthDetail = MonthSummary & { paychecks: Paycheck[] };

export type Summary = {
  ytd_income: number;
  ytd_spent: number;
  ytd_saved: number;
  total_buffer: number;
  bills_paid: number;
  bills_total: number;
  savings_rate: number;
};

export const api = {
  seed: () => req<{ seeded: boolean }>("/seed", { method: "POST" }),
  listMonths: () => req<MonthSummary[]>("/months"),
  getMonth: (key: string) => req<MonthDetail>(`/months/${key}`),
  getPaycheck: (id: string) => req<PaycheckWithBills>(`/paychecks/${id}`),
  updatePaycheck: (id: string, body: Partial<Pick<Paycheck, "weekly_desired_spending" | "weekly_target_spending">>) =>
    req<Paycheck>(`/paychecks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  toggleBill: (id: string, paid: boolean) =>
    req<Bill>(`/bills/${id}`, { method: "PATCH", body: JSON.stringify({ paid }) }),
  summary: () => req<Summary>("/summary"),
};
