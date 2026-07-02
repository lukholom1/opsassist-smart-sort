# OpsAssist Enterprise Enhancement Plan

Extending the existing system (no rebuild). All tickets stay in one `tickets` table; we add per-department assignments, department-scoped admins, controlled AI, email OTP, and ratings.

## 1. Database changes (migration)

**Schema changes:**
- `profiles`: add `department text` (nullable; only set for Department Admins).
- New enum/check: departments = `HR | IT | Finance | Operations`.
- Drop the old `it_personnel` role usage in favor of a single `admin` role + `profiles.department`. Keep `admin` and `employee` in the enum (no migration of enum needed — we just stop creating `it_personnel`). Existing admin (global) = admin with `department = NULL` (super admin).
- New table `ticket_assignments`:
  - `id uuid pk`
  - `ticket_id uuid → tickets`
  - `department text` (HR/IT/Finance/Ops)
  - `assigned_to uuid` (department admin user, nullable)
  - `status text default 'Open'` (Open/In Progress/Resolved)
  - `resolved_at timestamptz`
  - `resolved_by_ai bool default false`
  - unique(ticket_id, department)
- New table `ticket_feedback`:
  - `ticket_id uuid pk → tickets`
  - `user_id uuid`
  - `rating int 1..5`
  - `comment text`
  - `created_at`
- `tickets`: keep `category` for backward compat but add `categories text[]` (multi-dept). Add `resolution_source text` ('ai' | 'department' | null).
- `pending_activations`: already has email + otp. We'll send OTP via Resend.

**RLS:**
- `ticket_assignments`: admins can SELECT where `department = caller's profile.department` OR caller is super admin (department NULL). Employees can SELECT where they own the parent ticket. Admins can UPDATE rows in their department.
- `tickets` SELECT: owner, super admin, or admin whose department appears in `categories`.
- `ticket_feedback`: owner inserts/selects; admins read for tickets in their dept.
- Helper SQL function `user_department(uid)` (security definer).

**Trigger:** when all `ticket_assignments` for a ticket are `Resolved`, set parent `tickets.status = 'Resolved'`, `resolved_at = now()`.

## 2. Server functions (`src/lib/tickets.functions.ts`)

- `classifyWithAI` → returns `{ categories: string[], priority }` (multi-dept). Heuristic fallback also returns arrays.
- `submitTicket`: after classifying, insert ticket with `categories` array (keep `category` = first), then create one `ticket_assignments` row per category, each auto-assigned via `pickLeastBusyAdminForDept(dept)`.
- `pickLeastBusyAdminForDept(dept)`: scope to admins with that `profiles.department`, count active assignments.
- `updateAssignmentStatus({ assignment_id, status })`: dept admin updates one assignment; trigger handles full ticket resolution.
- `listMyTickets`: include nested assignments.
- `listDeptTickets`: for dept admins — assignments where `department = my dept`, joined with ticket + requester.
- `listAllTickets`: super admin only.
- `markResolvedByAI`: mark ticket resolved + all open assignments resolved with `resolved_by_ai=true`, set `resolution_source='ai'`.
- `submitFeedback({ ticket_id, rating, comment })`.
- `generateTicketResponse`: tighten system prompt — only HR/IT/Finance/Ops topics; refuse unrelated. Per-department guardrails (HR/Finance escalation only; IT troubleshoot; Ops procedural). Auto-tone preserved.

## 3. User management (`src/lib/users.functions.ts`)

- `createPendingUser({ email, full_name, role, department? })`:
  - validate: if `role='admin'`, department required and in enum.
  - generate 6-digit OTP, insert into `pending_activations` (store department + role).
  - **Send OTP email via Resend** (new helper). If `RESEND_API_KEY` missing, fall back to returning OTP for admin to share (current behavior) + console log.
- `activateAccount`: copy department onto profile.

## 4. Email OTP (Resend)

- Add `RESEND_API_KEY` secret request.
- Helper `sendOtpEmail(email, otp, fullName)` calling Resend `from: onboarding@resend.dev`.
- Don't block account creation if email fails — still return OTP to admin UI as fallback.

## 5. Frontend

- **Admin dashboard (`_authenticated.admin.tsx`)**:
  - Detect super admin (no department) vs department admin.
  - Super admin: user creation form with role select (Employee/Department Admin) + dept picker when admin. Sees all tickets.
  - Department admin: only sees `listDeptTickets`. Two tables (Active / Resolved) showing assignee, priority, categories, elapsed, rating, feedback. Status dropdown updates `ticket_assignments`.
- **Employee dashboard (`_authenticated.dashboard.tsx`)**:
  - Show per-department status pills under each ticket.
  - When fully resolved & no feedback yet → show star rating form.
  - AI chat → "Issue Resolved" button calls `markResolvedByAI`.
- **IT route** (`_authenticated.it.tsx`): remove or repurpose — fold into admin (department admin handles it). Will delete it and route IT logins to `/admin`.
- **Ticket bits**: add `DepartmentPills`, `RatingStars` components.

## 6. Controlled AI

In `generateTicketResponse`, system prompt strictly scopes to four departments, refuses other topics with the canned redirect, and applies per-department behavior rules (HR empathetic-escalate, Finance formal-escalate, IT troubleshoot, Ops procedural).

## 7. Out of scope (explicit)

- No separate per-department databases.
- No changes to landing page or login flow beyond what's needed.
- Keep existing admin seed (`Admin` / `OpsAdmin@2026`) as super admin (department NULL).

## Files touched
- new: `supabase/migrations/<ts>_multi_dept.sql`
- new: `src/lib/email.server.ts` (Resend helper)
- edit: `src/lib/tickets.functions.ts`, `src/lib/users.functions.ts`, `src/lib/auth-helpers.server.ts` (expose `department` in context)
- edit: `src/routes/_authenticated.admin.tsx`, `_authenticated.dashboard.tsx`
- delete: `src/routes/_authenticated.it.tsx`
- edit: `src/components/ticket-bits.tsx` (add Rating + DeptPills)
- edit: `src/hooks/use-auth.ts` (expose department)

After approval I'll also request the `RESEND_API_KEY` secret.
