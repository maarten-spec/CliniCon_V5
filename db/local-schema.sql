PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organisationseinheit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  einheitstyp TEXT NOT NULL DEFAULT 'STATION',
  aktiv INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS qualifikation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  bezeichnung TEXT NOT NULL,
  pflicht INTEGER NOT NULL DEFAULT 0,
  sortierung INTEGER NOT NULL DEFAULT 100,
  aktiv INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS mitarbeiter (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personalnummer TEXT NOT NULL UNIQUE,
  vorname TEXT NOT NULL,
  nachname TEXT NOT NULL,
  aktiv INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS stellenplan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organisationseinheit_id INTEGER NOT NULL,
  jahr INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ENTWURF',
  UNIQUE (organisationseinheit_id, jahr)
);

CREATE TABLE IF NOT EXISTS stellenplan_monat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stellenplan_id INTEGER NOT NULL,
  mitarbeiter_id INTEGER NOT NULL,
  monat INTEGER NOT NULL CHECK (monat BETWEEN 1 AND 12),
  dienstart TEXT NOT NULL DEFAULT '01',
  vk REAL NOT NULL DEFAULT 0.0,
  UNIQUE (stellenplan_id, mitarbeiter_id, monat, dienstart)
);

-- New English tables for the active App logic

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  site_id TEXT,
  personnel_no TEXT,
  display_name TEXT,
  is_active INTEGER DEFAULT 1,
  updated_at TEXT,
  qual TEXT,
  include INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS roster_monthly (
  id TEXT PRIMARY KEY,
  site_id TEXT,
  department_id TEXT,
  employee_id TEXT,
  year INTEGER,
  month INTEGER,
  fte REAL,
  updated_at TEXT,
  updated_by_user_id TEXT,
  UNIQUE(employee_id, department_id, year, month)
);

CREATE TABLE IF NOT EXISTS roster_monthly_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  changed_at TEXT DEFAULT (datetime('now')),
  action TEXT,
  changed_by_user_id TEXT,
  department_id TEXT,
  employee_id TEXT,
  year INTEGER,
  month INTEGER,
  old_fte REAL,
  new_fte REAL
);

-- Trigger to auto-populate audit (simplified version)
CREATE TRIGGER IF NOT EXISTS trg_roster_audit_update
AFTER UPDATE ON roster_monthly
BEGIN
  INSERT INTO roster_monthly_audit (action, changed_by_user_id, department_id, employee_id, year, month, old_fte, new_fte)
  VALUES ('UPDATE', NEW.updated_by_user_id, NEW.department_id, NEW.employee_id, NEW.year, NEW.month, OLD.fte, NEW.fte);
END;

CREATE TRIGGER IF NOT EXISTS trg_roster_audit_insert
AFTER INSERT ON roster_monthly
BEGIN
  INSERT INTO roster_monthly_audit (action, changed_by_user_id, department_id, employee_id, year, month, old_fte, new_fte)
  VALUES ('INSERT', NEW.updated_by_user_id, NEW.department_id, NEW.employee_id, NEW.year, NEW.month, 0, NEW.fte);
END;
