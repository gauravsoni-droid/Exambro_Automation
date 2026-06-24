-- Add hashtags column to calibration_items for generate-batch output.
-- Existing manually-seeded rows default to an empty array.
alter table calibration_items
  add column if not exists hashtags text[] not null default '{}';
