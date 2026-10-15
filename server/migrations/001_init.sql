-- 001: core schema for the TV Derana quotation system

-- ── Base rate card (mirrors the TV Derana rate card PDF) ──────────────────
CREATE TABLE rate_categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  sort        INT  NOT NULL DEFAULT 0
);

-- One line of the rate card, e.g. "Weekdays 8.00pm" = 1,166,000 per 30 sec.
CREATE TABLE rate_slots (
  id          SERIAL PRIMARY KEY,
  category_id INT  NOT NULL REFERENCES rate_categories(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  rate_30s    NUMERIC(14,2) NOT NULL CHECK (rate_30s >= 0),
  sort        INT  NOT NULL DEFAULT 0,
  notes       TEXT,
  UNIQUE (category_id, name)
);

-- A program as it airs: name + day pattern + time belt, priced via its slot.
CREATE TABLE programs (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slot_id     INT  NOT NULL REFERENCES rate_slots(id) ON DELETE RESTRICT,
  day_pattern TEXT NOT NULL,              -- free text parsed by lib/days.js (Wkdays, Sat.day, Tue-Fri…)
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,              -- end <= start means it runs past midnight
  is_prime    BOOLEAN NOT NULL DEFAULT FALSE,
  is_generic  BOOLEAN NOT NULL DEFAULT FALSE,  -- a "time belt" catch-all, not a named show
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  notes       TEXT
);
CREATE INDEX programs_slot_idx ON programs(slot_id);

-- Alternative names seen in agency schedules ("DHEVANI INIMA" → Deveni Inima).
CREATE TABLE program_aliases (
  id          SERIAL PRIMARY KEY,
  program_id  INT  NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  alias       TEXT NOT NULL,
  alias_norm  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, alias_norm)
);
CREATE INDEX program_aliases_norm_idx ON program_aliases(alias_norm);

-- ── Agencies, clients, client pricing ─────────────────────────────────────
CREATE TABLE agencies (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  contact     TEXT,
  email       TEXT,
  phone       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A named custom rate card, assignable to one or more clients.
CREATE TABLE rate_cards (
  id                   SERIAL PRIMARY KEY,
  name                 TEXT NOT NULL UNIQUE,
  default_discount_pct NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (default_discount_pct BETWEEN 0 AND 100),
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-slot override inside a custom card: a fixed 30s rate or a discount %.
CREATE TABLE rate_card_items (
  rate_card_id INT NOT NULL REFERENCES rate_cards(id) ON DELETE CASCADE,
  slot_id      INT NOT NULL REFERENCES rate_slots(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL CHECK (mode IN ('fixed','discount')),
  value        NUMERIC(14,3) NOT NULL CHECK (value >= 0),
  PRIMARY KEY (rate_card_id, slot_id)
);

CREATE TABLE clients (
  id            SERIAL PRIMARY KEY,
  agency_id     INT  NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  pricing_type  TEXT NOT NULL DEFAULT 'base' CHECK (pricing_type IN ('base','discount','rate_card')),
  discount_pct  NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  rate_card_id  INT REFERENCES rate_cards(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agency_id, name)
);

-- ── Settings ──────────────────────────────────────────────────────────────
-- Items priced by their own rate instead of the program rate (e.g. crawlers).
CREATE TABLE special_rules (
  id                    SERIAL PRIMARY KEY,
  keyword               TEXT NOT NULL,
  label                 TEXT NOT NULL,
  rate_pt               NUMERIC(14,2) NOT NULL,
  rate_npt              NUMERIC(14,2) NOT NULL,
  apply_client_discount BOOLEAN NOT NULL DEFAULT FALSE,
  active                BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  JSONB NOT NULL
);

-- ── Saved quotations ──────────────────────────────────────────────────────
CREATE TABLE quotations (
  id            SERIAL PRIMARY KEY,
  ref           TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  agency_id     INT REFERENCES agencies(id) ON DELETE SET NULL,
  client_id     INT REFERENCES clients(id)  ON DELETE SET NULL,
  agency_name   TEXT,
  client_name   TEXT,
  file_name     TEXT,
  package_price NUMERIC(16,2),
  lines         JSONB NOT NULL,     -- parsed schedule lines + chosen program_id
  extras        JSONB NOT NULL DEFAULT '[]',  -- non-priced benefits / skipped rows
  totals        JSONB NOT NULL,     -- snapshot of the result at save time
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX quotations_client_idx ON quotations(client_id);
