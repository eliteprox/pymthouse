import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { runMigrations } from "../src/db/migrate";

const dbPath = process.env.DATABASE_PATH || "./data/pymthouse.db";
const dir = path.dirname(dbPath);

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

runMigrations(sqlite);
sqlite.close();

console.log(`[db:migrate] schema ready at ${dbPath}`);
