-- ============================================================
-- Hafiz Fabrics POS — Supabase Schema
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Single key-value table that mirrors localStorage
CREATE TABLE IF NOT EXISTS app_data (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Disable Row Level Security for now (enable + add policies before going public)
ALTER TABLE app_data DISABLE ROW LEVEL SECURITY;

-- Optional: index for fast lookups (already fast via PK, but useful for future queries)
CREATE INDEX IF NOT EXISTS idx_app_data_updated ON app_data (updated_at DESC);
