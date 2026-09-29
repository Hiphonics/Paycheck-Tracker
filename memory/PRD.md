# Paycheck Planner - PRD

## Vision
A mobile-first paycheck planner that mirrors the user's Personal Finance Master Workbook (Sept–Dec 2026). Shows month-by-month expenses, tells the user exactly what to pay with each paycheck, and tracks weekly desired spending against buffer and savings.

## Users
- Single-user, personal finance (no auth for MVP)

## Core Features (MVP shipped)
- **Dashboard**: Month selector, "Buffer this month" hero, color-coded paycheck cards (Blue / Purple / Green / Yellow / Orange cycles), YTD income/spent/saved/buffer grid.
- **Allocation Planner**: Per-paycheck breakdown of Vehicle Payment, Targeted Payoffs, Current Month Bills, Next Month Early Bills, Living Costs, Savings Transfer, Unallocated Buffer.
- **Bill Calendar**: Bills grouped by paycheck cycle timeline with tap-to-toggle paid.
- **Tracker**: Bento YTD tiles (Saved / Buffer / Income), weekly spending progress bar with red/yellow/green thresholds, per-paycheck spent-vs-target inputs, multi-month bar trend (Income vs Saved).
- **Paycheck Detail** modal-style screen with hero, allocation lines, and interactive bill list.

## Data Model (MongoDB)
- `months` — key, name, year, month
- `paychecks` — month_key, number, date_range, color_cycle, total_cash, allocation buckets, weekly_desired_spending, weekly_target_spending
- `bills` — paycheck_id, month_key, name, amount, fraction (e.g. "3of6"), paid

## Seed Data
Auto-seeds on backend startup with all Sept–Dec 2026 data extracted from the user's Excel workbook: 4 months, 17 paychecks, 100 bills.

## API (all /api prefixed)
- `POST /api/seed` (idempotent, `?force=true` to reset)
- `GET /api/months`
- `GET /api/months/{key}`
- `GET /api/paychecks/{id}`
- `PATCH /api/paychecks/{id}` (weekly spending fields)
- `PATCH /api/bills/{id}` (paid, name, amount)
- `GET /api/summary` (YTD aggregates)

## Design
- iOS-Native Clean personality from `design_guidelines.json`
- Palette: warm off-white surface, dark inverse, paycheck cycle pastels (light blue / purple / green / yellow)
- Bottom tabs: Dashboard · Planner · Bills · Tracker
- Monetary values rendered large in a bold system font; horizontal chip rows for month selection

## Next Ideas
- Add/edit paycheck + bill from UI (currently seeded only)
- Notifications for bill due dates
- Export month summary to CSV
- Recurring bill auto-generator (based on "X of Y" fraction)
- Optional AI advisor ("what should I pay with this paycheck?")
