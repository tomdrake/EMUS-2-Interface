-- EMUS-2 monitor database (SQLite).
-- Design data (what clinicians redesign) and patient data are kept in separate
-- tables. Applied idempotently at start-up by app.db.init_db().

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ------------------------------------------------------------------ designs

CREATE TABLE IF NOT EXISTS designs (
    id            TEXT PRIMARY KEY,            -- slug
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    builtin       INTEGER NOT NULL DEFAULT 0,  -- 1 = seeded default, read-only
    parent_id     TEXT REFERENCES designs(id), -- design this was duplicated from
    current_version INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

-- Every save is a new immutable version: this is the co-design research record.
CREATE TABLE IF NOT EXISTS design_versions (
    design_id   TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
    version     INTEGER NOT NULL,
    document    TEXT NOT NULL,                 -- full validated design JSON
    patch       TEXT,                          -- JSON Patch from the previous version
    source      TEXT NOT NULL CHECK (source IN ('seed','manual','chat','import','revert')),
    author      TEXT NOT NULL DEFAULT '',      -- workshop participant label / role
    note        TEXT NOT NULL DEFAULT '',
    chat_message_id INTEGER REFERENCES chat_messages(id),
    created_at  TEXT NOT NULL,
    PRIMARY KEY (design_id, version)
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    design_id   TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content     TEXT NOT NULL,
    provider    TEXT,                          -- 'anthropic' | 'elm' | 'openai-compatible'
    model       TEXT,
    proposed_patch TEXT,                       -- JSON Patch proposed by the assistant
    outcome     TEXT CHECK (outcome IN ('proposed','applied','discarded','invalid')),
    errors      TEXT,
    author      TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
);

-- Which design this installation shows by default, tokens, provider settings.
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- API tokens. Server-side only; never returned to the browser except masked.
-- Stored unencrypted in this prototype: keep the database file private.
CREATE TABLE IF NOT EXISTS secrets (
    key        TEXT PRIMARY KEY,               -- 'anthropic_api_key' | 'elm_api_key' | ...
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- ----------------------------------------------------------------- patients

CREATE TABLE IF NOT EXISTS patients (
    id          TEXT PRIMARY KEY,
    document    TEXT NOT NULL,                 -- models.clinical.Patient JSON
    origin      TEXT NOT NULL,                 -- 'scenario' | 'mimic-demo' | 'fhir' | 'hl7v2'
    simulated   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patient_settings (
    patient_id  TEXT PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
    document    TEXT NOT NULL,                 -- models.clinical.PatientSettings JSON
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS observations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id  TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    parameter   TEXT NOT NULL,                 -- registry parameter id
    at          TEXT NOT NULL,                 -- UTC ISO-8601
    value       REAL,
    value_code  TEXT,
    source      TEXT NOT NULL,
    device_id   TEXT,
    quality     REAL
);
CREATE INDEX IF NOT EXISTS ix_obs_patient_param_at ON observations(patient_id, parameter, at);

CREATE TABLE IF NOT EXISTS observation_sets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id  TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    at          TEXT NOT NULL,
    document    TEXT NOT NULL,                 -- models.clinical.ObservationSet JSON
    source      TEXT NOT NULL DEFAULT 'charted'
);
CREATE INDEX IF NOT EXISTS ix_obsset_patient_at ON observation_sets(patient_id, at);

CREATE TABLE IF NOT EXISTS oxygen_therapy (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id  TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    at          TEXT NOT NULL,
    flow_l_min  REAL NOT NULL,
    device      TEXT NOT NULL,
    fio2_pct    REAL,
    source      TEXT NOT NULL,
    recorded_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_o2_patient_at ON oxygen_therapy(patient_id, at);

CREATE TABLE IF NOT EXISTS lab_results (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id  TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    test        TEXT NOT NULL,                 -- registry lab test id
    collected_at TEXT NOT NULL,
    document    TEXT NOT NULL                  -- models.clinical.LabResult JSON
);
CREATE INDEX IF NOT EXISTS ix_lab_patient_test_at ON lab_results(patient_id, test, collected_at);

CREATE TABLE IF NOT EXISTS imaging_studies (
    id          TEXT PRIMARY KEY,
    patient_id  TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    performed_at TEXT NOT NULL,
    document    TEXT NOT NULL                  -- models.clinical.ImagingStudy JSON
);

CREATE TABLE IF NOT EXISTS findings (
    id          TEXT PRIMARY KEY,
    patient_id  TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    parameter   TEXT,
    code        TEXT NOT NULL,
    status      TEXT NOT NULL,
    onset       TEXT NOT NULL,
    offset_at   TEXT,
    document    TEXT NOT NULL                  -- models.clinical.Finding JSON
);
CREATE INDEX IF NOT EXISTS ix_findings_patient ON findings(patient_id, onset);

CREATE TABLE IF NOT EXISTS forecasts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id  TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    generated_at TEXT NOT NULL,
    document    TEXT NOT NULL                  -- models.clinical.ForecastBundle JSON
);
CREATE INDEX IF NOT EXISTS ix_forecasts_patient ON forecasts(patient_id, generated_at);

CREATE TABLE IF NOT EXISTS alarm_events (
    id          TEXT PRIMARY KEY,
    patient_id  TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    parameter   TEXT NOT NULL,
    started_at  TEXT NOT NULL,
    ended_at    TEXT,
    document    TEXT NOT NULL                  -- models.clinical.AlarmEvent JSON
);
CREATE INDEX IF NOT EXISTS ix_alarm_patient ON alarm_events(patient_id, started_at);

CREATE TABLE IF NOT EXISTS alarm_silences (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id  TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    started_at  TEXT NOT NULL,
    until       TEXT NOT NULL,
    cancelled_at TEXT,
    by          TEXT NOT NULL DEFAULT ''
);

-- Everything anyone changed, for the research record and for accountability.
CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    at          TEXT NOT NULL,
    actor       TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL,                 -- e.g. 'design.save', 'alarm.limit', 'o2.set'
    target      TEXT NOT NULL DEFAULT '',
    detail      TEXT NOT NULL DEFAULT '{}'
);
