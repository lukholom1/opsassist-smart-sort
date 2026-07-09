# Approval Workflow Refactor

Extends the existing `workflow_*` tables, `workflow.functions.ts` API, `/admin/approvals` page, `WorkflowProgress` component, and ticket details dialog. No new modules, no duplicate pages, ticket ownership never changes.

## 1. Database (single migration)

Extend the existing tables — no replacements.

- `workflow_approvals`: add
  - `origin_department text` — the department that originally raised this approval (never changes on delegation).
  - `delegated_from_id uuid null references workflow_approvals(id)` — set when this row is a delegated child.
  - `delegated_to_id uuid null` — set on the parent row when it delegates; points to the child.
  - `awaiting_delegation boolean default false` — true on the parent while the child is pending.
  - `assigned_user_id uuid null` — specific employee approver (optional, in addition to department).
  - `sequence int default 0` — display order in timeline.
- `tickets`: add `approval_lock boolean default false` (mirrors "any active approval") — cheap read for the ticket UI. Maintained by a trigger on `workflow_approvals` insert/update/delete: set true if any row for the ticket is `pending` OR `awaiting_delegation`, otherwise false.
- Trigger `workflow_approvals_touch_lock` maintains `approval_lock` and also flips `workflow_skipped` back to `false` when a new approval is inserted.

## 2. Server functions (`src/lib/workflow.functions.ts`)

Extend, do not rewrite.

- `requestManualApprovals` (existing): accept new optional `assigned_user_id` per department; write `origin_department = department`. Trigger locks the ticket.
- `forwardApproval` (new): input `{ approval_id, to_department, to_user_id?, note }`. Marks the parent row `awaiting_delegation=true`, creates a child row referencing `delegated_from_id=parent.id`, copies `origin_department`, notifies target department/user, logs `approval_delegated` in `workflow_history`. Parent stays `pending` — accountable department must still approve at the end.
- `decideApproval` (existing): when a **child** row is approved, do NOT close the parent — instead clear `awaiting_delegation` on the parent, notify the parent's original approvers ("delegate approved, your turn"), and log `delegation_returned`. On reject of a child, cascade a rejection prompt back to the parent (parent goes back to `pending`, `awaiting_delegation=false`, note attached). Approving the parent proceeds as today. Rejection of the parent rejects the whole chain (existing behavior).
- `getTicketApprovalState` (existing): also return parent/child links + `assigned_user_id` + `origin_department`, and a computed `is_locked` boolean.
- `listPendingApprovals` (existing): for a department admin, include (a) parent rows in their department whose `awaiting_delegation=false`, and (b) delegated child rows targeting their department or their user id. Exclude parents currently `awaiting_delegation` so they don't appear as actionable.
- Add `resolveTicket` guard: in `tickets.functions.ts` `updateAssignmentStatus` and any resolve path, reject when `tickets.approval_lock` is true, returning a clear "Ticket is waiting for approval" error.

## 3. Approvals dashboard (`_authenticated.admin.approvals.tsx`)

Extend existing page.

- Card header shows: ticket title, ticket owner (assigned dept), requesting department (`origin_department`), reason, current stage label (Delegated / Pending your review / Awaiting delegate), submitted date.
- Add **View Ticket** button (opens `TicketDetailsDialog` via existing route on tickets tab, or inline dialog).
- Add **Forward Approval** button → dialog: pick department, optional user, note. Calls `forwardApproval`.
- If the card is a delegated child, show a small chip "Delegated from {origin_department} · {parent approver name}".
- Approve/Reject/Request info remain unchanged.

## 4. Ticket details / admin tickets tab

- Add the two-button prompt at the top of `TicketDetailsDialog` for admins with no active workflow: **Request Approval** / **Skip Workflow** (Skip already exists via `skipWorkflow`; Request opens the existing request dialog).
- Disable Resolve controls in `_authenticated.admin.tickets.tsx` when `ticket.approval_lock` is true; show an inline banner "Waiting for approval — resolution disabled".
- Notes, chat, edits stay enabled.

## 5. Timeline (`WorkflowProgress` component)

Enhance the existing timeline to render delegation as nested rows using `workflow_history` events already logged plus the new `approval_delegated` / `delegation_returned` actions:

```text
✓ IT Assessment
✓ Finance Review
  ↳ ✓ Delegated to CFO
  ↳ ✓ CFO Approved
✓ Finance Final Approval
● IT Resolution
○ Ticket Closed
```

Every action already includes actor, comment, timestamp — no schema change needed for the audit trail.

## 6. End-user view (dashboard)

`_authenticated.dashboard.tsx` already hides internal notes. Replace the raw approval statuses shown to the requester with a simplified progress list derived from `workflow_history` — collapse all delegation entries into a single "Awaiting approval" step so users never see internal delegation chatter.

## Files touched

- new: `supabase/migrations/<ts>_approval_delegation.sql`
- edit: `src/lib/workflow.functions.ts` (add `forwardApproval`, extend decide/list/state)
- edit: `src/lib/tickets.functions.ts` (guard resolve when locked)
- edit: `src/integrations/supabase/types.ts` (auto-regen after migration)
- edit: `src/routes/_authenticated.admin.approvals.tsx` (Forward, View Ticket, delegation chip)
- edit: `src/routes/_authenticated.admin.tickets.tsx` (Request/Skip prompt, disable Resolve when locked)
- edit: `src/components/TicketDetailsDialog.tsx` (Request/Skip prompt for admins)
- edit: `src/components/WorkflowProgress.tsx` (nested delegation rendering)
- edit: `src/routes/_authenticated.dashboard.tsx` (simplified end-user progress)

## Out of scope

AI-recommended workflows, templates UI, escalation timers, analytics — the schema and API leave hooks for these but no UI is built now.
