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
  is_template?: boolean;
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
  start_date?: string | null;
  end_date?: string | null;
};

export type Bill = {
  id: string;
  paycheck_id: string;
  month_key: string;
  name: string;
  amount: number;
  fraction?: string | null;
  paid: boolean;
  due_date?: string | null;
  recurrence?: string;
  series_id?: string | null;
  category?: string;
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

export type SavingsRec = {
  paycheck_id: string;
  total_cash: number;
  fixed_obligations: number;
  unpaid_bills: number;
  net_after_obligations: number;
  current_savings_transfer: number;
  presets: number[];
  recommendations: { conservative: number; balanced: number; aggressive: number };
};

export type Goal = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  icon: string;
  color: string;
  target_date?: string | null;
  notes?: string;
  created_at?: string;
};

export type Streak = {
  current_streak: number;
  best_streak: number;
  ytd_saved: number;
  message: string;
  monthly_saved: { key: string; amount: number }[];
};

export type AIAdvice = {
  priority_order?: { name: string; amount: number; reason: string }[];
  recommended_savings?: number;
  buffer_after?: number;
  summary?: string;
  raw?: string;
};

export const api = {
  seed: () => req<{ seeded: boolean }>("/seed", { method: "POST" }),
  listYears: () => req<{ years: number[] }>("/years"),
  ensureYear: (year: number) =>
    req<{ year: number; ok: boolean }>(`/months/ensure-year?year=${year}`, { method: "POST" }),
  listMonths: (year?: number) =>
    req<MonthSummary[]>(year != null ? `/months?year=${year}` : "/months"),
  getMonth: (key: string) => req<MonthDetail>(`/months/${key}`),
  getPaycheck: (id: string) => req<PaycheckWithBills>(`/paychecks/${id}`),
  updatePaycheck: (
    id: string,
    body: Partial<Pick<Paycheck, "weekly_desired_spending" | "weekly_target_spending" | "savings_transfer">>,
  ) => req<Paycheck>(`/paychecks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  listBills: (params: { month_key?: string; paycheck_id?: string } = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => !!v) as [string, string][],
    ).toString();
    return req<Bill[]>(`/bills${q ? "?" + q : ""}`);
  },
  createBill: (body: {
    paycheck_id?: string;
    month_key: string;
    name: string;
    amount: number;
    fraction?: string | null;
    due_date?: string | null;
    recurrence?: string;
    category?: string;
  }) => req<Bill>(`/bills`, { method: "POST", body: JSON.stringify(body) }),
  updateBill: (id: string, body: Partial<Bill>) =>
    req<Bill>(`/bills/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  toggleBill: (id: string, paid: boolean) =>
    req<Bill>(`/bills/${id}`, { method: "PATCH", body: JSON.stringify({ paid }) }),
  deleteBill: (id: string) => req<{ deleted: boolean }>(`/bills/${id}`, { method: "DELETE" }),
  generateRecurring: (body: {
    name: string;
    amount: number;
    category?: string;
    recurrence: "weekly" | "biweekly" | "monthly";
    start_date: string;
    occurrences: number;
    fraction_prefix?: boolean;
  }) => req<{ series_id: string; count: number; bills: Bill[] }>(`/bills/generate`, { method: "POST", body: JSON.stringify(body) }),
  summary: () => req<Summary>("/summary"),
  savingsRec: (paycheckId: string) => req<SavingsRec>(`/paychecks/${paycheckId}/savings-recommendation`),
  aiAdvice: (paycheckId: string) => req<AIAdvice>(`/paychecks/${paycheckId}/ai-advice`, { method: "POST" }),
  listGoals: () => req<Goal[]>("/goals"),
  createGoal: (body: {
    name: string;
    target_amount: number;
    icon?: string;
    color?: string;
    target_date?: string | null;
    notes?: string;
  }) => req<Goal>("/goals", { method: "POST", body: JSON.stringify(body) }),
  updateGoal: (id: string, body: Partial<Goal>) =>
    req<Goal>(`/goals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteGoal: (id: string) => req<{ deleted: boolean }>(`/goals/${id}`, { method: "DELETE" }),
  contributeGoal: (id: string, amount: number, note?: string) =>
    req<{ goal: Goal }>(`/goals/${id}/contribute`, {
      method: "POST",
      body: JSON.stringify({ amount, note }),
    }),
  streak: () => req<Streak>("/streak"),
};
