export const MULTIMODAL_DDL=[
 `CREATE TABLE IF NOT EXISTS home_observations (family_id TEXT NOT NULL,uid TEXT NOT NULL,source TEXT NOT NULL,data_json TEXT NOT NULL,observed_at INTEGER NOT NULL,PRIMARY KEY(family_id,source,uid))`,
 `CREATE INDEX IF NOT EXISTS home_observations_time ON home_observations(family_id,observed_at)`,
 `CREATE TABLE IF NOT EXISTS home_proposals (id TEXT PRIMARY KEY,family_id TEXT NOT NULL,actor_id TEXT NOT NULL,version INTEGER NOT NULL,status TEXT NOT NULL,data_json TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`,
];
