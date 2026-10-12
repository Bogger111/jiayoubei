import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as schema from "../db/schema.ts";

test("ordered migrations create all modeled tables and columns on a fresh database", async () => {
  const journal = JSON.parse(
    await readFile(
      new URL("../drizzle/meta/_journal.json", import.meta.url),
      "utf8",
    ),
  );
  const db = new DatabaseSync(":memory:");
  try {
    for (const entry of journal.entries) {
      const source = await readFile(
        new URL(`../drizzle/${entry.tag}.sql`, import.meta.url),
        "utf8",
      );
      db.exec(source);
    }
    for (const table of Object.values(schema)) {
      const config = getTableConfig(table);
      const actual = db
        .prepare("SELECT name FROM pragma_table_info(?)")
        .all(config.name)
        .map((row) => row.name)
        .sort();
      assert.deepEqual(
        actual,
        config.columns.map((column) => column.name).sort(),
        `${config.name} differs from the model`,
      );
    }
  } finally {
    db.close();
  }
});
