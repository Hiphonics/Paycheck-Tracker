# Paycheck Planner - PRD

## Vision
A mobile-first paycheck planner that mirrors the user's Personal Finance Master Workbook. Shows month-by-month expenses, tells the user exactly what to pay with each paycheck, and tracks weekly desired spending against buffer and savings — with AI coaching and local reminders.

## Users
- Single-user, personal finance (no auth)

## Core Features
- **Dashboard**: Month selector, buffer hero, color-coded paycheck cycle cards (Blue/Purple/Green/Yellow/Orange), YTD income/spent/saved/buffer grid.
- **Allocation Planner**: Per-paycheck breakdown of Vehicle / Targeted Payoffs / Bills / Living / Savings / Buffer.
- **Calendar (grid)**: Interactive month grid — cells colored by paycheck cycle start, red dot for bills due, tap a day to see bills, `+` opens bill editor prefilled with month + date.
- **Bill Editor**: Create / edit / delete bills. Fields: name, amount, due date, category (bill/subscription/debt/living), recurrence (none/weekly/biweekly/monthly). Recurring mode swaps the CTA to "Generate N bills" and auto-tags each occurrence "1of12"..."NofN", auto-assigns each to its paycheck.
- **Paycheck Detail**:
  - Hero (total / allocated / buffer).
  - **Ask AI what to pay** → Claude Sonnet 4-6 (via Emergent LLM key) returns priority_order, recommended_savings, buffer_after and a short summary.
  - **Set savings** → conservative (10%) / balanced (20%) / aggressive (35%) suggestions on net_after_obligations; tap Apply patches the paycheck.
  - Bills list with paid toggle, per-bill edit, inline "Add bill" pill.
- **Tracker**: Weekly spending vs target with red/yellow/green progress, YTD bento, multi-month income-vs-saved bars.
- **Local Notifications**: When a bill has a due date, schedule a reminder at 9 am the day before (device only, no-op on web).

## Data Model
- `months` — key, name, year, month
- `paychecks` — month_key, number, date_range, start_date, end_date, color_cycle, total_cash, allocation buckets, savings_transfer, weekly_desired_spending, weekly_target_spending
- `bills` — paycheck_id, month_key, name, amount, fraction, due_date, recurrence, series_id, category, paid

## API (all `/api` prefixed)
- Months: `GET /months`, `GET /months/{key}`
- Paychecks: `GET /paychecks/{id}`, `PATCH /paychecks/{id}` (weekly + savings_transfer)
- Bills: `GET /bills?month_key= | ?paycheck_id=`, `POST /bills`, `PATCH /bills/{id}`, `DELETE /bills/{id}`, `POST /bills/generate`, `DELETE /bills/series/{sid}`
- Savings & AI: `GET /paychecks/{id}/savings-recommendation`, `POST /paychecks/{id}/ai-advice`
- `POST /seed`, `GET /summary`

## Integrations
- **Claude Sonnet 4-6** via Emergent Universal LLM Key for AI paycheck advice.
- **expo-notifications** for local reminders (device only; web is no-op).

## Design
- iOS-Native Clean personality
- Palette: warm off-white surface, dark inverse, paycheck cycle pastels (light blue / purple / green / yellow / orange)
- Bottom tabs: Dashboard · Planner · Bills · Tracker

## Testing Status
- Iteration 1: 10/10 backend pytest, all frontend flows verified.
- Iteration 2 (this): 15/15 backend pytest (bills CRUD, generator, savings rec, AI, regressions), all frontend flows verified.

## Next Ideas
- Widget: iOS/Android home-screen buffer glance
- CSV import for existing spreadsheets
- Savings streak & shareable summary card
