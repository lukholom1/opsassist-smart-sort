# Week 7 Sprint — Phased Plan

Approval-required keywords: **Leave, Sick, Emergency, Broken, Replacement, Critical** (case-insensitive match on title/details/category).
New role: **manager** (added to `app_role` enum).

---

## Phase 1 — Foundations: Routing, Workflow Engine, Activity Log
Goal: every new ticket flows through classification → priority → department → owner assignment automatically, with a visible workflow state and audit trail. No user intervention after submission.

**DB migration**
- Extend `app_role` enum: add `'manager'`.
- `tickets`: add `workflow_stage TEXT` (submitted | ai_classified | pending_approval | approved | assigned | in_progress | resolved | closed), `sla_hours INT`, `approval_required BOOLEAN`.
- New `ticket_activity` table: id, ticket_id, actor_id, actor_name, actor_role, event_type, description, metadata jsonb, created_at. RLS: readable by ticket participants + admins of relevant departments.
- Trigger: on `tickets` insert/update of key fields → append activity row.

**Backend (`src/lib/`)**
- `routing.server.ts`: `routeTicket(ticket)` → picks department admin (least-busy) or manager (critical priority) per department. Modular rule list.
- `workflow.server.ts`: `advanceStage(ticketId, stage, actor)` helper; validates transitions; writes activity.
- Update `createTicket` server fn to: classify → detect approval → set stage → route → log activity.

**Frontend**
- New `WorkflowTracker` component: horizontal stepper on `TicketDetailsDialog` (green completed, primary current, muted future).
- New `ActivityTimeline` component under ticket details (newest first).

---

## Phase 2 — Approvals + Notifications
- **Approval detection**: keyword match on approval list → `approval_required=true`, stage=`pending_approval`, route to department manager (fallback: department admin).
- **Approvals dashboard**: new route `/admin/approvals` — cards with requester, dept, type, priority, date, and Approve / Reject / Request Info actions. Approve → stage `approved` → `assigned`. Reject → stage `closed` with reason.
- **Notification service**: new `notifications` table (recipient_id, title, message, ticket_id, event_type, read_at, created_at). `notify(...)` helper called from workflow/approval/routing events. Bell icon + unread badge + panel in header. Abstracted so SMTP/SendGrid can be plugged later.

---

## Phase 3 — Automation Rules + Prediction-Driven Actions
- `automation_rules` table: id, name, enabled, conditions jsonb, actions jsonb. Seed defaults (Critical IT → Manager + SLA 2h, Workload>80% → notify Ops manager).
- `automation.server.ts`: evaluator run on ticket create/update. Actions: assign, set SLA, notify, add tag.
- Admin-only `/admin/automation` page: list, toggle, edit rules (JSON form to start).
- Prediction actions: extend `predictions.functions.ts` to output `recommendations[]`. On dashboard load, evaluate against thresholds → emit notifications + render "AI Recommendations" panel with actions (increase staffing, redistribute, escalate).

---

## Phase 4 — Dashboard, UX & Integration Polish
- Admin landing: add widgets — Live workflow stats, Approval summary, Pending approvals, Automation activity, Notifications, Recently completed, Manager alerts, Quick actions.
- UX pass: loading skeletons, empty states, success toasts, filter/search refinements, mobile spacing.
- End-to-end verification of Create → Classify → Predict → Route → Approve → Assign → Notify → Log → Report chain.

---

## Delivery
- One phase per turn. Each phase ends with a preview verification (Playwright screenshot of new surfaces + a smoke ticket create/route/approve flow) before moving on.
- After each phase I'll pause for your go-ahead on the next.

Ready to start **Phase 1**?
