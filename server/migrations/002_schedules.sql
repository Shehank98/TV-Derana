-- 002: schedules replace quotations; clients become independent and are
-- linked to agencies (a client can move between agencies over time).

-- ── Clients ↔ agencies ────────────────────────────────────────────────────
ALTER TABLE clients RENAME TO clients_old;
ALTER TABLE clients_old RENAME CONSTRAINT clients_pkey TO clients_old_pkey;

CREATE TABLE clients (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX clients_name_uq ON clients (lower(name));

-- The deal between an agency and a client: which rate card prices it and the
-- agreed discount used as the default for Option 02.
CREATE TABLE agency_clients (
  id            SERIAL PRIMARY KEY,
  agency_id     INT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id     INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  rate_card_id  INT REFERENCES rate_cards(id) ON DELETE SET NULL,   -- NULL = base rate card
  discount_pct  NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  since         DATE NOT NULL DEFAULT CURRENT_DATE,
  ended         DATE,
  notes         TEXT,
  UNIQUE (agency_id, client_id)
);
CREATE INDEX agency_clients_client_idx ON agency_clients(client_id);

INSERT INTO clients (name, notes)
SELECT DISTINCT ON (lower(name)) name, notes FROM clients_old ORDER BY lower(name), id;

INSERT INTO agency_clients (agency_id, client_id, rate_card_id, discount_pct, notes)
SELECT o.agency_id, c.id,
       CASE WHEN o.pricing_type = 'rate_card' THEN o.rate_card_id END,
       CASE WHEN o.pricing_type = 'discount' THEN o.discount_pct ELSE 0 END,
       o.notes
FROM clients_old o JOIN clients c ON lower(c.name) = lower(o.name)
ON CONFLICT (agency_id, client_id) DO NOTHING;

DROP TABLE quotations;
DROP TABLE clients_old;

-- ── Schedules ─────────────────────────────────────────────────────────────
CREATE TABLE schedules (
  id                SERIAL PRIMARY KEY,
  schedule_no       TEXT NOT NULL,
  month             DATE NOT NULL,                 -- first day of the campaign month
  agency_id         INT REFERENCES agencies(id) ON DELETE SET NULL,
  client_id         INT REFERENCES clients(id)  ON DELETE SET NULL,
  agency_name       TEXT NOT NULL,                 -- snapshot: names at the time of the schedule
  client_name       TEXT NOT NULL,
  rate_card_name    TEXT,
  file_name         TEXT,
  lines             JSONB NOT NULL,                -- parsed lines incl. chosen program_id / status
  extras            JSONB NOT NULL DEFAULT '[]',   -- rows not priced (zero spots, benefits)
  option1_package   NUMERIC(16,2),                 -- Option 01: package value entered
  option2_discount  NUMERIC(7,3),                  -- Option 02: discount % entered
  selected_option   SMALLINT NOT NULL DEFAULT 2 CHECK (selected_option IN (1, 2)),
  result            JSONB NOT NULL,                -- full calculation snapshot
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX schedules_month_idx ON schedules(month);
CREATE INDEX schedules_client_idx ON schedules(client_id);
CREATE INDEX schedules_agency_idx ON schedules(agency_id);
CREATE INDEX schedules_no_idx ON schedules(lower(schedule_no));

-- ── Program corrections from the official rate card sheet (Apr 2025) ─────
UPDATE programs SET end_time = '11:00', notes = NULL
 WHERE name = 'Derana 60 Plus' AND end_time = '00:00';
UPDATE programs p SET is_prime = FALSE
  FROM rate_slots s
 WHERE p.slot_id = s.id AND s.name LIKE 'Other Prime Programs 10.30pm%';

-- Discounts now live on the agency–client deal / Option 02, not on special items.
DELETE FROM settings WHERE key = 'tax_pct';
