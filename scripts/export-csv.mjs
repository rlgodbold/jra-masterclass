// Dump registrations to a CSV on disk: `npm run export`
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const REG_FILE = path.join(DATA_DIR, "registrations.ndjson");
const OUT = path.join(DATA_DIR, "registrations.csv");

if (!fs.existsSync(REG_FILE)) {
  console.log("No registrations yet at", REG_FILE);
  process.exit(0);
}

const rows = fs
  .readFileSync(REG_FILE, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const cols = ["name", "email", "registeredAt", "sessionId", "sessionISO", "source"];
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csv = [
  cols.join(","),
  ...rows.map((r) => cols.map((c) => esc(r[c])).join(",")),
].join("\n");

fs.writeFileSync(OUT, csv);
console.log(`Wrote ${rows.length} registrations -> ${OUT}`);
