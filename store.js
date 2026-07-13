// Subscriber store + audit log for the webinar list / email marketing.
// Source of truth for marketing consent + opt-out state. Low volume (a weekly
// webinar list), so an in-memory map persisted to a JSON file is plenty.
// All mutations also append to an append-only events.ndjson for compliance records.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const SUBS_FILE = path.join(DATA_DIR, "subscribers.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.ndjson");
const CAMPAIGNS_FILE = path.join(DATA_DIR, "campaigns.ndjson");

// HMAC secret for unsubscribe tokens (so links can't be forged/enumerated).
const UNSUB_SECRET =
  process.env.UNSUBSCRIBE_SECRET || process.env.ADMIN_TOKEN || "dev-unsub-secret";

let subscribers = new Map();
load();

function load() {
  try {
    if (fs.existsSync(SUBS_FILE)) {
      const arr = JSON.parse(fs.readFileSync(SUBS_FILE, "utf8"));
      subscribers = new Map(arr.map((s) => [s.email, migrate(s)]));
    }
  } catch (e) {
    console.error("[store] load failed:", e.message);
  }
}

// Bring legacy single-session records up to the recurring-series shape:
//   sessionISO + r24/r1  ->  sessions[] + reminded{ [sessionId]: {r24,r1} }
// The legacy webinar's date becomes an (archived) session id. Idempotent.
function migrate(s) {
  if (!Array.isArray(s.sessions)) {
    const legacyId = s.sessionISO ? String(s.sessionISO).slice(0, 10) : null;
    s.sessions = legacyId ? [legacyId] : [];
    if (!s.reminded) {
      s.reminded = legacyId ? { [legacyId]: { r24: !!s.r24, r1: !!s.r1 } } : {};
    }
  }
  if (!s.reminded) s.reminded = {};
  return s;
}

function persist() {
  const tmp = SUBS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify([...subscribers.values()], null, 2));
  fs.renameSync(tmp, SUBS_FILE); // atomic
}

function logEvent(ev) {
  try {
    fs.appendFileSync(
      EVENTS_FILE,
      JSON.stringify({ ...ev, at: new Date().toISOString() }) + "\n"
    );
  } catch (e) {
    console.error("[store] event log failed:", e.message);
  }
}

export function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}

export function upsertSubscriber({ email, name, source, ip, sessionId }) {
  email = normalizeEmail(email);
  const now = new Date().toISOString();
  let s = subscribers.get(email);
  if (!s) {
    s = {
      email,
      name: name || "",
      status: "subscribed",
      createdAt: now,
      updatedAt: now,
      subscribedAt: now,
      unsubscribedAt: null,
      source: source || "",
      consentIp: ip || "",
      sessions: sessionId ? [sessionId] : [], // every session this person registered for
      reminded: {}, // { [sessionId]: { r24:bool, r1:bool } }
    };
    subscribers.set(email, s);
    logEvent({ type: "subscribe", email, source, ip, sessionId });
  } else {
    if (name && !s.name) s.name = name;
    if (!Array.isArray(s.sessions)) s.sessions = [];
    if (!s.reminded) s.reminded = {};
    // An explicit re-registration counts as fresh consent → re-subscribe.
    if (s.status === "unsubscribed") {
      s.status = "subscribed";
      s.subscribedAt = now;
      s.unsubscribedAt = null;
      logEvent({ type: "resubscribe", email, source, ip, via: "register" });
    }
    // Track this session (a person can be registered for several future dates).
    if (sessionId && !s.sessions.includes(sessionId)) {
      s.sessions.push(sessionId);
      logEvent({ type: "register_session", email, sessionId });
    }
    s.updatedAt = now;
  }
  persist();
  return s;
}

// Active subscribers registered for a specific session (for reminders).
export function activeForSession(sessionId) {
  return [...subscribers.values()].filter(
    (s) => s.status === "subscribed" && Array.isArray(s.sessions) && s.sessions.includes(sessionId)
  );
}

export function reminderSent(sessionId, email, which) {
  const s = subscribers.get(normalizeEmail(email));
  return Boolean(s?.reminded?.[sessionId]?.[which]);
}

export function markReminderSent(sessionId, email, which) {
  const s = subscribers.get(normalizeEmail(email));
  if (!s) return false;
  if (!s.reminded) s.reminded = {};
  if (!s.reminded[sessionId]) s.reminded[sessionId] = { r24: false, r1: false };
  s.reminded[sessionId][which] = true;
  s.updatedAt = new Date().toISOString();
  persist();
  return true;
}

// Registration counts per session id, across the whole list.
export function countsBySession() {
  const out = {};
  for (const s of subscribers.values()) {
    for (const id of s.sessions || []) out[id] = (out[id] || 0) + 1;
  }
  return out;
}

export function getSubscriber(email) {
  return subscribers.get(normalizeEmail(email)) || null;
}

export function unsubscribe(email, meta = {}) {
  email = normalizeEmail(email);
  const now = new Date().toISOString();
  let s = subscribers.get(email);
  if (!s) {
    // Suppress even an unknown address (someone forwarded the email).
    s = {
      email,
      name: "",
      status: "unsubscribed",
      createdAt: now,
      updatedAt: now,
      subscribedAt: null,
      unsubscribedAt: now,
      source: "unsub",
    };
    subscribers.set(email, s);
    persist();
    logEvent({ type: "unsubscribe", email, ...meta });
    return true;
  }
  if (s.status !== "unsubscribed") {
    s.status = "unsubscribed";
    s.unsubscribedAt = now;
    s.updatedAt = now;
    persist();
    logEvent({ type: "unsubscribe", email, ...meta });
  }
  return true;
}

export function resubscribe(email, meta = {}) {
  email = normalizeEmail(email);
  const s = subscribers.get(email);
  if (!s) return false;
  s.status = "subscribed";
  s.subscribedAt = new Date().toISOString();
  s.unsubscribedAt = null;
  s.updatedAt = s.subscribedAt;
  persist();
  logEvent({ type: "resubscribe", email, ...meta });
  return true;
}

export function listSubscribers() {
  return [...subscribers.values()];
}

export function activeSubscribers() {
  return [...subscribers.values()].filter((s) => s.status === "subscribed");
}

export function canEmailMarketing(email) {
  const s = subscribers.get(normalizeEmail(email));
  return !s || s.status === "subscribed"; // suppress only explicit unsubscribes
}

export function stats() {
  const all = [...subscribers.values()];
  return {
    total: all.length,
    subscribed: all.filter((s) => s.status === "subscribed").length,
    unsubscribed: all.filter((s) => s.status === "unsubscribed").length,
  };
}

export function logCampaign(c) {
  try {
    fs.appendFileSync(
      CAMPAIGNS_FILE,
      JSON.stringify({ ...c, at: new Date().toISOString() }) + "\n"
    );
  } catch (e) {
    console.error("[store] campaign log failed:", e.message);
  }
}

// ── Unsubscribe tokens (HMAC, not guessable) ────────────────────────────────
export function unsubToken(email) {
  return crypto
    .createHmac("sha256", UNSUB_SECRET)
    .update(normalizeEmail(email))
    .digest("hex")
    .slice(0, 32);
}

export function verifyUnsubToken(email, token) {
  const expected = unsubToken(email);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
