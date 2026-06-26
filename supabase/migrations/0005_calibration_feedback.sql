-- Calibration owner feedback fields
-- owner_feedback stores the 3-option UI choice (approve / needs_changes / reject)
-- owner_verdict (existing) stores the binary calibration value derived from feedback
alter table calibration_items
  add column if not exists owner_feedback text
    check (owner_feedback in ('approve', 'needs_changes', 'reject')),
  add column if not exists owner_comments text;
