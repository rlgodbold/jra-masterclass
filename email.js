// Email sending via Resend (same provider the Jenny product stack uses).
// Two kinds of mail:
//   - transactional (registration confirmation, reminders) — tied to an action the
//     person took; always allowed, but still carries a List-Unsubscribe header.
//   - marketing (broadcasts) — only to subscribed addresses, and MUST include a
//     physical postal address + a working unsubscribe link (CAN-SPAM).
// No-op (logs only) if RESEND_API_KEY isn't set, so local dev works without creds.

import { webinar } from "./config.js";
import { formatWhen, currentSession, topicLabel } from "./sessions.js";
import { unsubToken } from "./store.js";

// First name for a friendly greeting; never generic if we have a name.
const firstNameOf = (name) => (String(name || "").trim().split(/\s+/)[0] || "there");

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const FROM_EMAIL =
  process.env.NOTIFICATION_FROM_EMAIL ||
  "Lee Godbold <leegodbold@mailer.junkra.com>";
const BASE_URL = (process.env.PUBLIC_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const COMPANY_NAME = process.env.COMPANY_NAME || "Junk Removal Authority";
const COMPANY_POSTAL_ADDRESS = process.env.COMPANY_POSTAL_ADDRESS || "";

export function unsubscribeUrl(email) {
  const e = encodeURIComponent(email);
  const t = unsubToken(email);
  return `${BASE_URL}/unsubscribe?e=${e}&t=${t}`;
}

// RFC 8058 one-click headers — surfaces a native "Unsubscribe" button in Gmail/Apple.
function listUnsubHeaders(email) {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(email)}>, <mailto:${webinar.contactEmail}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

function marketingFooter(email) {
  return `
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 14px" />
  <p style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;line-height:1.5;color:#94a3b8;margin:0">
    You're receiving this because you registered for the ${COMPANY_NAME} Junk Removal Masterclass Series.<br>
    ${COMPANY_NAME}${COMPANY_POSTAL_ADDRESS ? " · " + COMPANY_POSTAL_ADDRESS : ""}<br>
    <a href="${unsubscribeUrl(email)}" style="color:#64748b">Unsubscribe</a> from these emails.
  </p>`;
}

async function send({ to, subject, html, headers }) {
  if (!RESEND_API_KEY) {
    console.log(`[email] (dry-run, no RESEND_API_KEY) -> ${to}: ${subject}`);
    return { ok: true, dryRun: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: Array.isArray(to) ? to : [to],
        reply_to: webinar.contactEmail,
        subject,
        html,
        headers,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend failed ${res.status}: ${body}`);
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] send error:", err.message);
    return { ok: false, error: err.message };
  }
}

// ── Transactional: registration confirmation ────────────────────────────────
export async function sendConfirmationEmail({ name, email, session }) {
  session = session || currentSession();
  const when = formatWhen(session);
  const firstName = firstNameOf(name);
  const topic = topicLabel(session); // real topic, or "Topic announced soon"
  const hasTopic = Boolean(session?.topic);
  const joinUrl = session?.zoomJoinUrl || webinar.zoomJoinUrl;
  const joinLine = joinUrl
    ? `<p style="margin:0 0 16px"><a href="${joinUrl}" style="background:#16a34a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:600">Join on Zoom</a></p>
       <p style="margin:0 0 16px;color:#475569;font-size:14px">Same link every week: <a href="${joinUrl}">${joinUrl}</a></p>`
    : `<p style="margin:0 0 16px;color:#475569">You'll get the Zoom join link by email before we go live.</p>`;

  const firstClassLine = hasTopic
    ? `<strong>${topic}</strong>`
    : `<strong>your first class</strong>`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
    <p style="margin:0 0 16px">Hey ${firstName},</p>
    <p style="margin:0 0 16px">You're in the series. You've saved your seat for <strong>${webinar.title}</strong> — a free live class for junk removal owners, every week, one topic at a time.</p>
    <p style="margin:0 0 8px">First up — ${firstClassLine}:</p>
    <table style="margin:0 0 20px;font-size:16px"><tr><td style="padding:2px 12px 2px 0;color:#64748b">When</td><td><strong>${when.full}</strong></td></tr></table>
    ${joinLine}
    <p style="margin:0 0 16px">Register once and you're on the list for every week's class. We'll email you the topic and the join link before each one — no need to sign up again.</p>
    <p style="margin:0 0 4px">See you there,</p>
    <p style="margin:0 0 16px"><strong>${webinar.hostName}</strong><br>${webinar.hostTitle}</p>
    ${marketingFooter(email)}
  </div>`;

  const subject = hasTopic
    ? `You're in: ${topic} — ${when.dateStr}`
    : `You're in: ${webinar.title}`;

  return send({
    to: email,
    subject,
    html,
    headers: listUnsubHeaders(email),
  });
}

// ── Transactional: LSA class collateral delivery (the /lsa page) ────────────
// Sent right after someone takes the checklist + slides. They already have both
// files on the page; this is the copy for their records, plus their auto
// registration for the next live class. Standard marketing footer +
// List-Unsubscribe headers, same as every other send.
export async function sendLsaAssetsEmail({ name, email, session, checklistUrl, slidesUrl }) {
  session = session || currentSession();
  const when = session ? formatWhen(session) : null;
  const firstName = firstNameOf(name);
  const topic = session ? topicLabel(session) : "";
  const nextLine = when
    ? `<p style="margin:0 0 16px">You're also registered for the next live class, <strong>${topic}</strong>, <strong>${when.full}</strong>. We'll email you a reminder before we go live.</p>`
    : `<p style="margin:0 0 16px">You're on the list for the next live class. We'll email you the date and the join link.</p>`;
  const joinUrl = session?.zoomJoinUrl || webinar.zoomJoinUrl;
  const joinLine = joinUrl
    ? `<p style="margin:0 0 16px;color:#475569;font-size:14px">Same Zoom link every class: <a href="${joinUrl}">${joinUrl}</a></p>`
    : "";

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;font-size:16px;line-height:1.6">
    <p style="margin:0 0 16px">Hi ${firstName},</p>
    <p style="margin:0 0 18px">Here are both files from <strong>The LSA Migration</strong> class. Google is moving Local Services Ads into Google Ads, and this is everything we covered.</p>
    <p style="margin:0 0 10px">
      <a href="${checklistUrl}" style="background:#2563eb;color:#fff;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block;font-weight:600">Download the checklist (PDF)</a>
    </p>
    <p style="margin:0 0 20px">
      <a href="${slidesUrl}" style="background:#0f172a;color:#fff;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block;font-weight:600">Download the slide deck (PDF)</a>
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#475569">Direct links, if the buttons don't work:<br>
      <a href="${checklistUrl}">${checklistUrl}</a><br>
      <a href="${slidesUrl}">${slidesUrl}</a>
    </p>
    ${nextLine}
    ${joinLine}
    <p style="margin:0 0 16px">The founding offer from the class is still open: ten spots, first come. Business Profile management, LSAs, and Jenny answering every call, $750 per month locked for six months, then $1,000 per month. No ranking guarantees, no money back guarantee. To check availability, text Shane at <strong>907-982-8460</strong>.</p>
    <p style="margin:0 0 4px">Talk soon,</p>
    <p style="margin:0 0 16px"><strong>${webinar.hostName}</strong><br>${webinar.hostTitle}</p>
    ${marketingFooter(email)}
  </div>`;

  return send({
    to: email,
    subject: "Your LSA Migration checklist and slides",
    html,
    headers: listUnsubHeaders(email),
  });
}

// ── Transactional: Own the Map collateral delivery (the /map page) ──────────
// Same contract as sendLsaAssetsEmail, different class. Kept as its own
// function so the two classes' copy can drift without touching each other.
export async function sendMapAssetsEmail({ name, email, session, checklistUrl, slidesUrl }) {
  session = session || currentSession();
  const when = session ? formatWhen(session) : null;
  const firstName = firstNameOf(name);
  const topic = session ? topicLabel(session) : "";
  const nextLine = when
    ? `<p style="margin:0 0 16px">You're also registered for the next live class, <strong>${topic}</strong>, <strong>${when.full}</strong>. We'll email you a reminder before we go live.</p>`
    : `<p style="margin:0 0 16px">You're on the list for the next live class. We'll email you the date and the join link.</p>`;
  const joinUrl = session?.zoomJoinUrl || webinar.zoomJoinUrl;
  const joinLine = joinUrl
    ? `<p style="margin:0 0 16px;color:#475569;font-size:14px">Same Zoom link every class: <a href="${joinUrl}">${joinUrl}</a></p>`
    : "";

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;font-size:16px;line-height:1.6">
    <p style="margin:0 0 16px">Hi ${firstName},</p>
    <p style="margin:0 0 18px">Here are both files from <strong>Own the Map</strong>. That's how junk removal owners rank in the Google map pack, and this is everything we covered.</p>
    <p style="margin:0 0 10px">
      <a href="${checklistUrl}" style="background:#2563eb;color:#fff;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block;font-weight:600">Download the checklist (PDF)</a>
    </p>
    <p style="margin:0 0 20px">
      <a href="${slidesUrl}" style="background:#0f172a;color:#fff;text-decoration:none;padding:13px 22px;border-radius:10px;display:inline-block;font-weight:600">Download the slide deck (PDF)</a>
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#475569">Direct links, if the buttons don't work:<br>
      <a href="${checklistUrl}">${checklistUrl}</a><br>
      <a href="${slidesUrl}">${slidesUrl}</a>
    </p>
    <p style="margin:0 0 16px">If you only do one thing this week, open your profile and check your <strong>primary category</strong>. It's the biggest single lever in the whole checklist, it takes two minutes, and if it's wrong nothing else you do moves the needle much.</p>
    ${nextLine}
    ${joinLine}
    <p style="margin:0 0 16px">The offer from the class is still open: ten spots, first come. Business Profile management, LSAs, and Jenny answering every call, $750 per month locked for six months, then $1,000 per month. That's $1,250 off every month against buying them separately. No ranking guarantees, no money back guarantee. To check availability, text Shane at <strong>907-982-8460</strong>.</p>
    <p style="margin:0 0 4px">Talk soon,</p>
    <p style="margin:0 0 16px"><strong>${webinar.hostName}</strong><br>${webinar.hostTitle}</p>
    ${marketingFooter(email)}
  </div>`;

  return send({
    to: email,
    subject: "Your Own the Map checklist and slides",
    html,
    headers: listUnsubHeaders(email),
  });
}

// ── Marketing: a broadcast to one recipient (caller iterates the list) ───────
export async function sendMarketingEmail({ name, email, subject, bodyHtml }) {
  const firstName = firstNameOf(name);
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;font-size:16px;line-height:1.6">
    <p style="margin:0 0 16px">Hi ${firstName},</p>
    ${bodyHtml}
    ${marketingFooter(email)}
  </div>`;
  return send({ to: email, subject, html, headers: listUnsubHeaders(email) });
}

// ── Reminders (24h + 1h before each week's class) ───────────────────────────
// The 24h email doubles as that week's TOPIC ANNOUNCEMENT.
export async function sendReminderEmail({ name, email, kind, session }) {
  session = session || currentSession();
  const when = formatWhen(session);
  const firstName = firstNameOf(name);
  const hasTopic = Boolean(session?.topic);
  const topic = topicLabel(session);
  const join = session?.zoomJoinUrl || webinar.zoomJoinUrl;
  const button = (label) =>
    join
      ? `<p style="margin:18px 0"><a href="${join}" style="background:#2563eb;color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;display:inline-block;font-weight:600">${label}</a></p>`
      : "";

  let subject, html;
  if (kind === "1h") {
    subject = hasTopic ? `We're live in 1 hour: ${topic} 🔴` : `We're live in 1 hour 🔴`;
    html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;font-size:16px;line-height:1.6">
      <p style="margin:0 0 16px">Hi ${firstName},</p>
      <p style="margin:0 0 16px">We go live in about an hour — ${hasTopic ? `<strong>${topic}</strong>` : `this week's <strong>Junk Removal Masterclass</strong>`} starts at <strong>${when.timeStr} ET</strong> today.</p>
      ${button("Join on Zoom →")}
      <p style="margin:16px 0">Grab a coffee and a notepad. Come with your questions — this is a live, working class for junk removal owners, and there's Q&amp;A at the end.</p>
      <p style="margin:0 0 4px">See you soon,</p>
      <p style="margin:0 0 8px"><strong>${webinar.hostName}</strong><br>${webinar.hostTitle}</p>
      ${marketingFooter(email)}
    </div>`;
  } else {
    subject = hasTopic
      ? `Tomorrow: ${topic} 🎟️`
      : `Tomorrow's masterclass — your seat's saved 🎟️`;
    const topicBlock = hasTopic
      ? `<p style="margin:0 0 14px">Tomorrow's class in the <strong>${webinar.title}</strong>:</p>
         <p style="margin:0 0 4px;font-size:19px;font-weight:800;color:#0f172a">${topic}</p>`
      : `<p style="margin:0 0 14px">Tomorrow we're live with this week's <strong>${webinar.title}</strong> — a fresh topic for junk removal owners.</p>`;
    html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;font-size:16px;line-height:1.6">
      <p style="margin:0 0 16px">Hi ${firstName},</p>
      ${topicBlock}
      <p style="margin:8px 0 4px"><strong>📅 ${when.full}</strong></p>
      <p style="margin:0 0 4px">📍 Live on Zoom</p>
      ${button("Join on Zoom →")}
      <p style="margin:14px 0 16px">Block off the hour and bring your questions — every class is live, practical, and built for junk removal owners, with time for Q&amp;A at the end.</p>
      <p style="margin:0 0 4px">See you tomorrow,</p>
      <p style="margin:0 0 8px"><strong>${webinar.hostName}</strong><br>${webinar.hostTitle}</p>
      ${marketingFooter(email)}
    </div>`;
  }
  return send({ to: email, subject, html, headers: listUnsubHeaders(email) });
}

// ── Internal: new-attendee notification to the team ─────────────────────────
export async function sendAttendeeNotification({ name, email, count, recipients, attendeesUrl, when, sourceLabel }) {
  const subject = `New masterclass signup: ${name || email}${count ? ` (#${count})` : ""}`;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a;font-size:15px;line-height:1.6">
    <p style="margin:0 0 14px">New registration for the <strong>${webinar.title}</strong>:</p>
    <table style="font-size:15px;margin:0 0 16px">
      <tr><td style="color:#64748b;padding:2px 16px 2px 0">Name</td><td><strong>${name || "—"}</strong></td></tr>
      <tr><td style="color:#64748b;padding:2px 16px 2px 0">Email</td><td>${email}</td></tr>
      ${when ? `<tr><td style="color:#64748b;padding:2px 16px 2px 0">First class</td><td><strong>${when}</strong></td></tr>` : ""}
      ${sourceLabel ? `<tr><td style="color:#64748b;padding:2px 16px 2px 0">Came from</td><td><strong>${sourceLabel}</strong></td></tr>` : ""}
    </table>
    <p style="margin:0 0 18px"><strong>${count}</strong> registered so far.</p>
    <p style="margin:0"><a href="${attendeesUrl}" style="background:#2563eb;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;display:inline-block;font-weight:600">View all attendees →</a></p>
  </div>`;
  // Internal ops email (no marketing footer / no unsubscribe — not a marketing send).
  return send({ to: recipients, subject, html });
}

export const hasPostalAddress = () => Boolean(COMPANY_POSTAL_ADDRESS);
