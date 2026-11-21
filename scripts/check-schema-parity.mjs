import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const schema = readFileSync(path.join(root, "db/schema.sql"), "utf8");
const migrationsDir = path.join(root, "db/migrations");
const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const patterns = [
  /\bcreate\s+table\s+if\s+not\s+exists\s+public\.([a-z0-9_]+)/gi,
  /\bcreate\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)/gi,
  /\bcreate\s+(?:unique\s+)?index\s+if\s+not\s+exists\s+([a-z0-9_]+)/gi,
  /\bcreate\s+(?:constraint\s+)?trigger\s+([a-z0-9_]+)/gi,
];

const required = new Set();
for (const file of migrations) {
  const sql = readFileSync(path.join(migrationsDir, file), "utf8");
  for (const pattern of patterns) {
    for (const match of sql.matchAll(pattern)) {
      required.add(match[1].toLowerCase());
    }
  }
}

const missing = [...required]
  .filter((name) => !schema.toLowerCase().includes(name))
  .sort();

if (missing.length > 0) {
  console.error("[schema-parity] missing from db/schema.sql");
  for (const name of missing) console.error(`  ${name}`);
  process.exit(1);
}

console.log(
  `[schema-parity] ok migrations=${migrations.length} objects=${required.size}`,
);
