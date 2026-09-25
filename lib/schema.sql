-- =====================================================================
--  AST Candidate Screening Portal — schema v0.1 (Phase 1)
--  Run this entire file in the Neon SQL editor on a FRESH database.
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'analyst')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "Clients" are the employers who order screenings. They don't log in
-- (Phase 1); agency staff manage everything on their behalf.
CREATE TABLE IF NOT EXISTS clients (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  contact_name  TEXT,
  contact_email TEXT,
  -- Per-client behavior category toggles (see lib/categories.ts).
  -- politics and self_harm default OFF there for legal reasons.
  categories    JSONB NOT NULL DEFAULT '{}',
  -- Custom keyword list, comma separated (used by the Phase 2 analyzer).
  keywords      TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  candidate_name  TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  job_title       TEXT,
  lookback_years  INTEGER NOT NULL DEFAULT 7,
  -- Snapshot of category toggles at order time (edits to client defaults
  -- don't retroactively change an in-flight order).
  categories      JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
                    ('draft','consent_sent','consent_completed','collecting',
                     'analysis','in_review','report_ready','delivered','cancelled')),
  consent_token   TEXT UNIQUE NOT NULL,
  consent_sent_at      TIMESTAMPTZ,
  consent_viewed_at    TIMESTAMPTZ,
  consent_completed_at TIMESTAMPTZ,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS orders_client_idx ON orders(client_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);

-- One signed consent per order. disclosure_version pins exactly which
-- legal text the candidate saw (see lib/legal.ts).
CREATE TABLE IF NOT EXISTS consents (
  id                  SERIAL PRIMARY KEY,
  order_id            INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  disclosure_version  TEXT NOT NULL,
  signature_name      TEXT NOT NULL,
  state_of_residence  TEXT,
  wants_copy          BOOLEAN NOT NULL DEFAULT FALSE,
  ip                  TEXT,
  user_agent          TEXT,
  signed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Social profiles attached to an order. Candidates add their own during
-- the consent flow; analysts can add verified ones later.
CREATE TABLE IF NOT EXISTS candidate_profiles (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL,
  url        TEXT NOT NULL,
  added_by   TEXT NOT NULL CHECK (added_by IN ('candidate','analyst')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS candidate_profiles_order_idx ON candidate_profiles(order_id);

-- Who did what, when. FCRA disputes get answered from this table.
CREATE TABLE IF NOT EXISTS audit_log (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  detail     JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_log_order_idx ON audit_log(order_id);

-- ===================== Phase 2: capture + analysis =====================
-- (New tables are added automatically on boot — existing databases pick
-- these up with zero manual steps.)

-- A captured piece of content: a post, comment, or image an analyst
-- collected from one of the candidate's public profiles.
CREATE TABLE IF NOT EXISTS content_items (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL,
  url          TEXT,
  posted_at    DATE,
  content_text TEXT,
  image        BYTEA,
  image_mime   TEXT,
  captured_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS content_items_order_idx ON content_items(order_id);

-- AI analysis of one content item. One row per item; re-running analysis
-- overwrites it. `suppressed` items contain protected-class information
-- and are barred from ever reaching a report.
CREATE TABLE IF NOT EXISTS analyses (
  id                 SERIAL PRIMARY KEY,
  content_item_id    INTEGER NOT NULL UNIQUE REFERENCES content_items(id) ON DELETE CASCADE,
  flags              JSONB NOT NULL DEFAULT '[]',
  suppressed         BOOLEAN NOT NULL DEFAULT FALSE,
  suppression_reason TEXT,
  model              TEXT,
  error              TEXT,
  analyzed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===================== Phase 3: human review =====================

-- Review columns on analyses: final_flags is the analyst-approved truth
-- (NULL = not reviewed yet; [] = reviewed clean). Reports are built from
-- final_flags ONLY — raw AI output never reaches a report.
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS final_flags JSONB;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS reviewer_note TEXT;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS redact_image BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS signed_off_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS signed_off_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ;

-- ===================== Phase 4: reports =====================

-- A generated report is immutable: the exact PDF delivered is stored.
-- share_token = client access link; candidate_token = candidate's copy
-- (used for wants_copy and adverse action).
CREATE TABLE IF NOT EXISTS reports (
  id              SERIAL PRIMARY KEY,
  order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL DEFAULT 1,
  pdf             BYTEA NOT NULL,
  share_token     TEXT UNIQUE NOT NULL,
  candidate_token TEXT UNIQUE NOT NULL,
  generated_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_to    TEXT,
  delivered_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS reports_order_idx ON reports(order_id);

-- ===================== Phase 5: adverse action + disputes =====================

CREATE TABLE IF NOT EXISTS adverse_actions (
  id                  SERIAL PRIMARY KEY,
  order_id            INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  pre_adverse_sent_at TIMESTAMPTZ,
  pre_adverse_sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  adverse_sent_at     TIMESTAMPTZ,
  adverse_sent_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note                TEXT
);

CREATE TABLE IF NOT EXISTS disputes (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolution  TEXT,
  opened_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS disputes_order_idx ON disputes(order_id);

-- ===================== Phase 6: automated collection =====================

-- Where each content item came from: an analyst's manual capture or the
-- automated collector.
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- One row per automated collection run, with a per-profile result log the
-- UI surfaces (collected N / login-walled / error).
CREATE TABLE IF NOT EXISTS collection_runs (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL,
  results      JSONB NOT NULL DEFAULT '[]',
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS collection_runs_order_idx ON collection_runs(order_id);

-- ===================== Phase 7: profile discovery =====================

-- Optional discovery hint captured at order time (city/state improves
-- name-match precision).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS candidate_location TEXT;

-- Profiles the discovery engine THINKS belong to the candidate. They are
-- suggestions only: a human must confirm one before it becomes a real
-- candidate_profile and gets collected. Misattribution (screening a
-- same-named stranger) is the classic FCRA accuracy failure — the confirm
-- step is the defense.
CREATE TABLE IF NOT EXISTS discovered_profiles (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL,
  url        TEXT NOT NULL,
  evidence   TEXT NOT NULL,
  score      INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','confirmed','rejected')),
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, url)
);
CREATE INDEX IF NOT EXISTS discovered_profiles_order_idx ON discovered_profiles(order_id);

-- ===================== Email log =====================
-- Every outbound email attempt (sent / failed / not configured), kept for
-- troubleshooting.
CREATE TABLE IF NOT EXISTS email_log (
  id         SERIAL PRIMARY KEY,
  to_address TEXT NOT NULL,
  subject    TEXT NOT NULL,
  method     TEXT NOT NULL,
  status     TEXT NOT NULL,
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_log_created_idx ON email_log(created_at DESC);

-- ===================== Link repair =====================
-- Links saved without "https://" opened as broken pages inside the portal.
-- Safe to run every boot: only touches rows that lack a scheme.
UPDATE candidate_profiles SET url = 'https://' || btrim(url)
  WHERE btrim(url) !~* '^https?://' AND btrim(url) <> '';
UPDATE content_items SET url = 'https://' || btrim(url)
  WHERE url IS NOT NULL AND btrim(url) !~* '^https?://' AND btrim(url) <> '';

-- ===================== Report v2 (Guardian-style layout) =====================
-- Optional identifiers shown in the report's "Subject properties provided".
ALTER TABLE orders ADD COLUMN IF NOT EXISTS candidate_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS candidate_company TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS candidate_high_school TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS candidate_college TEXT;
-- The analyst-approved "Flagged post summary" paragraph. AI can DRAFT it,
-- but only text a human saved here reaches a report.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS report_summary TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS report_summary_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS report_summary_at TIMESTAMPTZ;
-- Per-profile details for the report's profiles table (entered by the
-- analyst from the public profile page; all optional).
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS handle TEXT;
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS following INTEGER;
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS followers INTEGER;
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS post_count INTEGER;
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;
