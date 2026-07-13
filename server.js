import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webinar } from "./config.js";
import { currentSession, upcomingSessions, getSession, formatWhen } from "./sessions.js";
import {
  sendConfirmationEmail,
  sendMarketingEmail,
  sendReminderEmail,
  sendAttendeeNotification,
  hasPostalAddress,
} from "./email.js";
import { startReminderScheduler } from "./reminders.js";
import { getSubscriber } from "./store.js";
import {
  upsertSubscriber,
  unsubscribe,
  resubscribe,
  verifyUnsubToken,
  activeSubscribers,
  listSubscribers,
  stats,
  countsBySession,
  logCampaign,
  normalizeEmail,
} from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
app.set("trust proxy", true);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const REG_FILE = path.join(DATA_DIR, "registrations.ndjson");

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
// Read-only token for the attendee list (safe to share with the team / put in emails).
const ATTENDEES_TOKEN = process.env.ATTENDEES_TOKEN || "";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
// Who gets pinged on each new signup.
const NOTIFY_EMAILS = (process.env.ATTENDEE_NOTIFY_EMAILS || "lee@junkra.com,shane@junkra.com")
  .split(",").map((s) => s.trim()).filter(Boolean);
const attendeesUrl = () =>
  `${PUBLIC_BASE_URL}/attendees${ATTENDEES_TOKEN ? "?token=" + encodeURIComponent(ATTENDEES_TOKEN) : ""}`;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

// ── Register ────────────────────────────────────────────────────────────────
app.post("/api/register", async (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 120);
  const email = normalizeEmail(req.body?.email).slice(0, 200);

  if (!name) return res.status(400).json({ error: "Please enter your name." });
  if (!EMAIL_RE.test(email))
    return res.status(400).json({ error: "Please enter a valid email." });

  const ip = (req.headers["x-forwarded-for"] || req.ip || "").toString().split(",")[0].trim();
  const source = String(req.body?.source || "").slice(0, 80);

  // Which session are they registering for? A valid, still-open session id from
  // the form wins; otherwise default to the next upcoming session.
  const requestedId = String(req.body?.sessionId || "").slice(0, 20);
  const openIds = new Set(upcomingSessions().map((s) => s.id));
  const session =
    (requestedId && openIds.has(requestedId) && getSession(requestedId)) || currentSession();

  const record = {
    name,
    email,
    sessionId: session?.id || null,
    sessionISO: session?.startsAtISO || null,
    registeredAt: new Date().toISOString(),
    source,
    ip,
  };

  const isNew = !getSubscriber(email);
  try {
    fs.appendFileSync(REG_FILE, JSON.stringify(record) + "\n");
    upsertSubscriber({ email, name, source, ip, sessionId: session?.id || null }); // consent + list state
  } catch (err) {
    console.error("[register] write failed:", err.message);
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }

  sendConfirmationEmail({ name, email, session }).catch((e) =>
    console.error("[register] email error:", e?.message)
  );

  // Notify the team on each genuinely-new attendee (not on a re-submit).
  if (isNew && NOTIFY_EMAILS.length) {
    sendAttendeeNotification({
      name,
      email,
      count: stats().total,
      recipients: NOTIFY_EMAILS,
      attendeesUrl: attendeesUrl(),
      when: session ? formatWhen(session).full : "",
    }).catch((e) => console.error("[register] notify error:", e?.message));
  }

  return res.json({
    ok: true,
    zoomJoinUrl: session?.zoomJoinUrl || webinar.zoomJoinUrl || null,
    when: session ? formatWhen(session).full : null,
    sessionId: session?.id || null,
  });
});

app.get("/api/webinar", (_req, res) => {
  const cur = currentSession();
  const upcoming = upcomingSessions().map((s) => ({
    id: s.id,
    startsAtISO: s.startsAtISO,
    topic: s.topic || null,
    when: formatWhen(s),
  }));
  res.json({
    title: webinar.title,
    promise: webinar.promise,
    timezoneLabel: webinar.timezoneLabel,
    brandName: webinar.brandName,
    hostName: webinar.hostName,
    hostTitle: webinar.hostTitle,
    zoomJoinUrl: webinar.zoomJoinUrl || null,
    // The featured (next) session + the full list of still-open sessions (the
    // series calendar). Each `when` carries the session's topic too.
    current: cur
      ? { id: cur.id, startsAtISO: cur.startsAtISO, topic: cur.topic || null, when: formatWhen(cur) }
      : null,
    sessions: upcoming,
  });
});

// ── Unsubscribe (CAN-SPAM / one-click) ───────────────────────────────────────
function unsubPage(title, bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title></head>
  <body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0a0f1c;color:#f1f5f9;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
  <div style="max-width:440px;text-align:center;padding:40px 24px;background:#141c30;border:1px solid #243049;border-radius:16px">${bodyHtml}</div>
  </body></html>`;
}

function handleUnsub(req, res) {
  const email = normalizeEmail(req.query.e);
  const token = req.query.t;
  if (!email || !verifyUnsubToken(email, token)) {
    return res
      .status(400)
      .send(unsubPage("Invalid link", `<h2 style="font-weight:700">Invalid unsubscribe link</h2><p style="color:#94a3b8">This link looks broken. Email ${esc(webinar.contactEmail)} and we'll remove you right away.</p>`));
  }
  unsubscribe(email, { ip: req.ip, ua: String(req.headers["user-agent"] || "").slice(0, 160) });
  const reToken = req.query.t;
  return res.send(
    unsubPage(
      "Unsubscribed",
      `<div style="font-size:40px">✓</div>
       <h2 style="font-weight:700;margin:10px 0">You're unsubscribed</h2>
       <p style="color:#94a3b8">${esc(email)} won't receive any more marketing emails from us.</p>
       <form method="POST" action="/resubscribe" style="margin-top:18px">
         <input type="hidden" name="e" value="${esc(email)}"><input type="hidden" name="t" value="${esc(reToken)}">
         <button type="submit" style="background:transparent;color:#94a3b8;border:1px solid #243049;border-radius:8px;padding:9px 16px;font-size:13px;cursor:pointer">Re-subscribe me</button>
       </form>`
    )
  );
}

app.get("/unsubscribe", handleUnsub);
// One-click POST (RFC 8058) — mail clients POST here directly.
app.post("/unsubscribe", (req, res) => {
  const email = normalizeEmail(req.query.e || req.body?.e);
  const token = req.query.t || req.body?.t;
  if (email && verifyUnsubToken(email, token)) {
    unsubscribe(email, { via: "one-click", ip: req.ip });
  }
  res.status(200).send("OK");
});

app.post("/resubscribe", (req, res) => {
  const email = normalizeEmail(req.body?.e);
  const token = req.body?.t;
  if (email && verifyUnsubToken(email, token)) resubscribe(email, { ip: req.ip });
  res.send(
    unsubPage(
      "Re-subscribed",
      `<h2 style="font-weight:700">You're back on the list</h2><p style="color:#94a3b8">${esc(email)} will receive our emails again.</p>`
    )
  );
});

// ── Admin (token-gated) ───────────────────────────────────────────────────────
function checkAdmin(req, res) {
  if (!ADMIN_TOKEN) {
    res.status(403).json({ error: "Admin disabled: set ADMIN_TOKEN." });
    return false;
  }
  const token = req.query.token || req.headers["x-admin-token"] || req.body?.token;
  if (token !== ADMIN_TOKEN) {
    res.status(401).json({ error: "Unauthorized." });
    return false;
  }
  return true;
}

function readRegistrations() {
  if (!fs.existsSync(REG_FILE)) return [];
  return fs
    .readFileSync(REG_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

app.get("/api/admin/stats", (req, res) => {
  if (!checkAdmin(req, res)) return;
  const counts = countsBySession();
  // Registrant count per session, newest sessions first, with a friendly label.
  const bySession = Object.keys(counts)
    .sort((a, b) => b.localeCompare(a))
    .map((id) => {
      const s = getSession(id);
      return {
        id,
        count: counts[id],
        label: s ? formatWhen(s).full : `${id} (archived)`,
        upcoming: Boolean(s),
      };
    });
  res.json({
    ...stats(),
    registrations: readRegistrations().length,
    canSend: hasPostalAddress(),
    bySession,
  });
});

app.get("/api/admin/subscribers", (req, res) => {
  if (!checkAdmin(req, res)) return;
  res.json({ subscribers: listSubscribers() });
});

// Build a subscriber CSV, optionally filtered to one session id (?session=YYYY-MM-DD).
function subscribersCsv(sessionId) {
  let rows = listSubscribers();
  if (sessionId) rows = rows.filter((r) => (r.sessions || []).includes(sessionId));
  const cols = ["name", "email", "status", "subscribedAt", "unsubscribedAt", "source", "sessions"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cell = (r, c) => (c === "sessions" ? (r.sessions || []).join(" | ") : r[c]);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => q(cell(r, c))).join(","))].join("\n");
}

app.get("/api/admin/export.csv", (req, res) => {
  if (!checkAdmin(req, res)) return;
  const session = String(req.query.session || "").slice(0, 20) || null;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="subscribers${session ? "-" + session : ""}.csv"`);
  res.send(subscribersCsv(session));
});

// Broadcast to the active (subscribed) list. Refuses without a postal address.
app.post("/api/admin/broadcast", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const subject = String(req.body?.subject || "").trim();
  const bodyHtml = String(req.body?.bodyHtml || "").trim();
  const testEmail = req.body?.testEmail ? normalizeEmail(req.body.testEmail) : "";

  if (!subject || !bodyHtml)
    return res.status(400).json({ error: "Subject and body are required." });
  if (!hasPostalAddress())
    return res.status(400).json({
      error:
        "Set COMPANY_POSTAL_ADDRESS (a physical mailing address) before sending — it's legally required in marketing email.",
    });

  if (testEmail) {
    await sendMarketingEmail({ name: "", email: testEmail, subject, bodyHtml });
    return res.json({ ok: true, test: true, sentTo: testEmail });
  }

  const recipients = activeSubscribers();
  let sent = 0,
    failed = 0;
  for (const s of recipients) {
    const r = await sendMarketingEmail({ name: s.name, email: s.email, subject, bodyHtml });
    r?.ok ? sent++ : failed++;
    await new Promise((res2) => setTimeout(res2, 120)); // gentle rate-limit
  }
  logCampaign({ subject, recipients: recipients.length, sent, failed });
  res.json({ ok: true, recipients: recipients.length, sent, failed });
});

// Send a one-off test of any email template to a single address (for previewing).
app.post("/api/admin/test-email", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const email = normalizeEmail(req.body?.email);
  const kind = String(req.body?.kind || "confirmation");
  if (!EMAIL_RE.test(email))
    return res.status(400).json({ error: "A valid email is required." });
  const session = currentSession() || null;
  let result;
  if (kind === "confirmation") {
    result = await sendConfirmationEmail({ name: req.body?.name || "there", email, session });
  } else if (kind === "24h" || kind === "1h") {
    result = await sendReminderEmail({ name: req.body?.name || "there", email, kind, session });
  } else {
    return res.status(400).json({ error: "kind must be confirmation, 24h, or 1h." });
  }
  res.json({ ok: result?.ok !== false, kind, sentTo: email, result });
});

// Read-only access for the attendee list (separate token, safe to share/email).
function checkReadToken(req, res) {
  const token = req.query.token || req.headers["x-admin-token"];
  if (token && (token === ATTENDEES_TOKEN || token === ADMIN_TOKEN)) return true;
  res.status(401).send("Unauthorized — invalid or missing token.");
  return false;
}

app.get("/api/attendees.csv", (req, res) => {
  if (!checkReadToken(req, res)) return;
  const session = String(req.query.session || "").slice(0, 20) || null;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="attendees${session ? "-" + session : ""}.csv"`);
  res.send(subscribersCsv(session));
});

app.get("/attendees", (req, res) => {
  if (!checkReadToken(req, res)) return;
  const filterId = String(req.query.session || "").slice(0, 20) || null;
  let rows = listSubscribers().sort((a, b) =>
    String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
  );
  if (filterId) rows = rows.filter((r) => (r.sessions || []).includes(filterId));
  const active = rows.filter((r) => r.status === "subscribed").length;
  // Per-session breakdown (every session anyone has registered for), as filter pills.
  const counts = countsBySession();
  const tokEnc = req.query.token ? encodeURIComponent(req.query.token) : "";
  const tokQ = tokEnc ? "&token=" + tokEnc : "";
  const pill = (href, label, on) =>
    `<a href="${href}" style="display:inline-block;margin:0 8px 8px 0;padding:6px 11px;border-radius:20px;font-size:12px;text-decoration:none;border:1px solid ${on ? "#2563eb" : "#cbd5e1"};background:${on ? "#2563eb" : "#fff"};color:${on ? "#fff" : "#475569"}">${label}</a>`;
  const allHref = "/attendees" + (tokEnc ? "?token=" + tokEnc : "");
  const sessionPills =
    pill(allHref, `All · ${listSubscribers().length}`, !filterId) +
    Object.keys(counts)
      .sort((a, b) => b.localeCompare(a))
      .map((id) => {
        const s = getSession(id);
        const label = s ? formatWhen(s).full : `${id} · past`;
        return pill(`/attendees?session=${id}${tokQ}`, `${esc(label)} · ${counts[id]}`, filterId === id);
      })
      .join("");
  const cur = currentSession();
  const headWhen = filterId
    ? (getSession(filterId) ? formatWhen(getSession(filterId)).full : `${filterId} · past session`)
    : (cur ? `Next: ${formatWhen(cur).full}` : "Series complete");
  const csvHref = `/api/attendees.csv?token=${tokEnc}${filterId ? "&session=" + filterId : ""}`;
  const fmt = (iso) => {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat("en-US", {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        timeZone: "America/New_York",
      }).format(new Date(iso));
    } catch { return iso; }
  };
  const body = rows.length
    ? rows.map((r, i) => `<tr>
        <td class="n">${i + 1}</td>
        <td>${esc(r.name) || "—"}</td>
        <td>${esc(r.email)}</td>
        <td>${fmt(r.createdAt || r.subscribedAt)}</td>
        <td>${r.status === "subscribed"
          ? '<span class="pill ok">subscribed</span>'
          : '<span class="pill no">unsubscribed</span>'}</td>
      </tr>`).join("")
    : `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:30px">No registrations yet.</td></tr>`;
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><title>Webinar attendees</title>
  <style>
    body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f1f5f9;color:#0f172a;margin:0;padding:28px 18px}
    .wrap{max-width:840px;margin:0 auto}
    .head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:18px}
    h1{font-size:22px;margin:0}
    .sub{color:#64748b;font-size:14px;margin-top:2px}
    .dl{background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:9px;font-size:14px;font-weight:600}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08)}
    th,td{text-align:left;padding:11px 14px;font-size:14px;border-bottom:1px solid #e2e8f0}
    th{background:#f8fafc;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
    td.n{color:#94a3b8;width:36px}
    tr:last-child td{border-bottom:none}
    .pill{font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px}
    .pill.ok{background:#dcfce7;color:#166534}.pill.no{background:#fee2e2;color:#991b1b}
  </style></head><body><div class="wrap">
    <div class="head">
      <div><h1>Webinar attendees</h1><div class="sub">${rows.length} ${filterId ? "for this session" : "registered"} · ${active} currently subscribed · ${esc(headWhen)}</div></div>
      <a class="dl" href="${csvHref}">Download CSV ↓</a>
    </div>
    <div style="margin:0 0 16px">${sessionPills}</div>
    <table><thead><tr><th>#</th><th>Name</th><th>Email</th><th>Registered (ET)</th><th>Status</th></tr></thead>
    <tbody>${body}</tbody></table>
  </div></body></html>`);
});

app.get("/admin", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "admin.html"))
);

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`Junk Removal Masterclass site on http://localhost:${PORT}`);
  console.log(`Data dir: ${DATA_DIR}`);
  startReminderScheduler();
});
