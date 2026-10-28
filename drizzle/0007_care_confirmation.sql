CREATE TABLE IF NOT EXISTS care_cases (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, subject_id TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL, active_slot INTEGER, data_json TEXT NOT NULL, last_operation TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS care_active_subject ON care_cases(family_id,subject_id,active_slot);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS care_family_cases ON care_cases(family_id,updated_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS care_evidence (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, source_id TEXT NOT NULL, source_event_id TEXT NOT NULL, observed_at INTEGER NOT NULL, received_at INTEGER NOT NULL, data_json TEXT NOT NULL, UNIQUE(family_id,source_id,source_event_id));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS care_operations (family_id TEXT NOT NULL, request_id TEXT NOT NULL, case_id TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(family_id,request_id));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS care_jobs (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, case_id TEXT NOT NULL, step TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, detail TEXT NOT NULL DEFAULT '', ha_context_id TEXT, ack_at INTEGER);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS care_pending_jobs ON care_jobs(status,updated_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS care_agreements (family_id TEXT PRIMARY KEY, data_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
