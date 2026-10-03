-- Deleting an archived task (2026-10-04). Additive only: one enum value.
-- Re-runnable.
--
-- An archived task with submissions cannot be hard-deleted (TaskSubmission ->
-- Task is Restrict, and those rows back real payments). "Delete" on such a
-- task sets it to REMOVED instead: the row and its money trail stay, and every
-- task list stops showing it.
--
-- Safe to deploy before this is applied: list queries filter with an explicit
-- `status IN (...)` that never names REMOVED. Only the delete of an archived
-- task WITH submissions needs it, and that request fails cleanly until then.

ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'REMOVED';
